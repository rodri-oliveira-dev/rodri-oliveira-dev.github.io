using System.Security.Cryptography;
using System.Text;

namespace Notifications.Functions.Subscriptions;

public interface ISubscriptionRepository
{
    Task<SubscriptionPage> ListActivePageAsync(string locale, string? continuationToken, CancellationToken cancellationToken = default);
    Task<SubscriptionRecord?> GetEligibleAsync(string id, string generation, CancellationToken cancellationToken = default);
    Task<RegistrationResult> RegisterAsync(WebPushSubscriptionInput subscription, CancellationToken cancellationToken = default);
    Task RevokeAsync(string id, string capability, CancellationToken cancellationToken = default);
    Task<SubscriptionMutationResult> DeleteGenerationAsync(string id, string generation, string expectedETag, CancellationToken cancellationToken = default);
}

public sealed record SubscriptionPage(IReadOnlyList<SubscriptionRecord> Items, string? ContinuationToken);
public sealed record RegistrationResult(bool Created, string? SubscriptionId, string? CancellationCapability, string? RecoveryCapability, DateTimeOffset? ExpiresAtUtc);

internal sealed class CosmosSubscriptionRepository : ISubscriptionRepository
{
    private const int QueryPageSize = 10;
    private const int ValidityDays = 365;
    private const int RevokedRetentionSeconds = 3600;
    private readonly ISubscriptionDocumentStore _store;
    private readonly TimeProvider _timeProvider;

    public CosmosSubscriptionRepository(ISubscriptionDocumentStore store) : this(store, TimeProvider.System) { }

    internal CosmosSubscriptionRepository(ISubscriptionDocumentStore store, TimeProvider timeProvider)
    {
        _store = store ?? throw new ArgumentNullException(nameof(store));
        _timeProvider = timeProvider ?? throw new ArgumentNullException(nameof(timeProvider));
    }

    public async Task<RegistrationResult> RegisterAsync(WebPushSubscriptionInput subscription, CancellationToken cancellationToken = default)
    {
        var now = _timeProvider.GetUtcNow();
        var normalized = WebPushSubscriptionValidator.ValidateAndNormalize(subscription);
        var (id, partitionKey) = WebPushSubscriptionValidator.DeriveIdentity(normalized.Endpoint);
        var cancellationCapability = GenerateCapability();
        var recoveryCapability = GenerateCapability();
        var expiresAt = now.AddDays(ValidityDays);
        var document = new SubscriptionDocument
        {
            Id = id,
            PartitionKey = partitionKey,
            Endpoint = normalized.Endpoint,
            Keys = new(normalized.P256Dh, normalized.Auth),
            Locale = normalized.Locale,
            PurposeId = normalized.PurposeId,
            ConsentVersion = normalized.ConsentVersion,
            PrivacyNoticeVersion = normalized.PrivacyNoticeVersion,
            ConsentMethod = normalized.ConsentMethod,
            ConsentId = GenerateOpaqueId("consent"),
            Generation = GenerateOpaqueId("generation"),
            ConsentGrantedAtUtc = now,
            ExpiresAtUtc = expiresAt,
            Status = "active",
            CancellationCapabilityHash = HashCapability("cancel", cancellationCapability),
            RecoveryCapabilityHash = HashCapability("recover", recoveryCapability),
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
            TimeToLiveSeconds = RemainingTtl(expiresAt, now),
        };

        var result = await _store.CreateAsync(document, cancellationToken);
        return result.Status == SubscriptionMutationStatus.Created
            ? new(true, id, cancellationCapability, recoveryCapability, expiresAt)
            : new(false, null, null, null, null);
    }

    public async Task RevokeAsync(string id, string capability, CancellationToken cancellationToken = default)
    {
        if (!WebPushSubscriptionValidator.IsValidSubscriptionId(id) || !IsValidCapability(capability))
        {
            return;
        }

        var stored = await _store.ReadAsync(id, id, cancellationToken);
        if (!CapabilityMatches(stored?.Document, capability) || stored is null)
        {
            return;
        }

        if (!string.Equals(stored.Document.Status, "active", StringComparison.Ordinal))
        {
            return;
        }

        var now = _timeProvider.GetUtcNow();
        var revoked = Copy(stored.Document, status: "revoked", revokedAtUtc: now, updatedAtUtc: now, ttl: RevokedRetentionSeconds);
        var replaced = await _store.ReplaceAsync(revoked, stored.ETag, cancellationToken);
        if (replaced.Status == SubscriptionMutationStatus.Updated && replaced.ETag is not null)
        {
            await _store.DeleteAsync(id, id, replaced.ETag, cancellationToken);
        }
    }

    public async Task<SubscriptionPage> ListActivePageAsync(string locale, string? continuationToken, CancellationToken cancellationToken = default)
    {
        if (!string.Equals(locale, WebPushSubscriptionValidator.SupportedLocale, StringComparison.Ordinal))
        {
            throw new ArgumentException("Idioma inválido.", nameof(locale));
        }

        var page = await _store.ListActivePageAsync(locale, _timeProvider.GetUtcNow(), QueryPageSize, continuationToken, cancellationToken);
        return new(page.Items.Select(Map).ToArray(), page.ContinuationToken);
    }

    public async Task<SubscriptionRecord?> GetEligibleAsync(string id, string generation, CancellationToken cancellationToken = default)
    {
        if (!WebPushSubscriptionValidator.IsValidSubscriptionId(id))
        {
            return null;
        }

        var stored = await _store.ReadAsync(id, id, cancellationToken);
        var now = _timeProvider.GetUtcNow();
        return stored is not null &&
            string.Equals(stored.Document.Status, "active", StringComparison.Ordinal) &&
            stored.Document.RevokedAtUtc is null && stored.Document.ExpiresAtUtc > now &&
            string.Equals(stored.Document.Generation, generation, StringComparison.Ordinal)
                ? Map(stored)
                : null;
    }

    public async Task<SubscriptionMutationResult> DeleteGenerationAsync(string id, string generation, string expectedETag, CancellationToken cancellationToken = default)
    {
        var stored = await _store.ReadAsync(id, id, cancellationToken);
        if (stored is null || !string.Equals(stored.Document.Generation, generation, StringComparison.Ordinal) ||
            !string.Equals(stored.ETag, expectedETag, StringComparison.Ordinal))
        {
            return new(SubscriptionMutationStatus.ConcurrencyConflict, id, id, null, stored?.RequestCharge ?? 0);
        }

        var result = await _store.DeleteAsync(id, id, expectedETag, cancellationToken);
        return new(result.Status, id, id, result.ETag, result.RequestCharge + stored.RequestCharge);
    }

    private static SubscriptionRecord Map(StoredSubscriptionDocument stored)
    {
        var document = stored.Document;
        return new(document.Id, document.PartitionKey,
            new(document.Endpoint, document.Keys.P256Dh, document.Keys.Auth, document.Locale, document.PurposeId,
                document.ConsentVersion, document.PrivacyNoticeVersion, true, document.ConsentMethod),
            document.ConsentGrantedAtUtc, document.ExpiresAtUtc, document.Generation,
            document.CreatedAtUtc, document.UpdatedAtUtc, stored.ETag);
    }

    private static string GenerateCapability() => Base64Url.Encode(RandomNumberGenerator.GetBytes(32));
    private static string GenerateOpaqueId(string prefix) => $"{prefix}_{Base64Url.Encode(RandomNumberGenerator.GetBytes(16))}";
    private static bool IsValidCapability(string value) => Base64Url.TryDecode(value, out var bytes) && bytes.Length == 32;

    private static string HashCapability(string domain, string capability) =>
        Base64Url.Encode(SHA256.HashData(Encoding.UTF8.GetBytes($"portfolio-web-push:v1:{domain}:{capability}")));

    private static bool CapabilityMatches(SubscriptionDocument? document, string capability)
    {
        var cancel = Encoding.ASCII.GetBytes(HashCapability("cancel", capability));
        var recover = Encoding.ASCII.GetBytes(HashCapability("recover", capability));
        var storedCancel = Encoding.ASCII.GetBytes(document?.CancellationCapabilityHash ?? new string('A', 43));
        var storedRecover = Encoding.ASCII.GetBytes(document?.RecoveryCapabilityHash ?? new string('A', 43));
        var cancelMatches = storedCancel.Length == cancel.Length && CryptographicOperations.FixedTimeEquals(storedCancel, cancel);
        var recoverMatches = storedRecover.Length == recover.Length && CryptographicOperations.FixedTimeEquals(storedRecover, recover);
        return cancelMatches | recoverMatches;
    }

    private static int RemainingTtl(DateTimeOffset expiresAt, DateTimeOffset now) =>
        Math.Max(1, checked((int)Math.Ceiling((expiresAt - now).TotalSeconds)));

    private static SubscriptionDocument Copy(SubscriptionDocument source, string status, DateTimeOffset revokedAtUtc, DateTimeOffset updatedAtUtc, int ttl) => new()
    {
        Id = source.Id,
        PartitionKey = source.PartitionKey,
        Type = source.Type,
        Endpoint = source.Endpoint,
        Keys = source.Keys,
        Locale = source.Locale,
        PurposeId = source.PurposeId,
        ConsentVersion = source.ConsentVersion,
        PrivacyNoticeVersion = source.PrivacyNoticeVersion,
        ConsentMethod = source.ConsentMethod,
        ConsentId = source.ConsentId,
        Generation = source.Generation,
        ConsentGrantedAtUtc = source.ConsentGrantedAtUtc,
        ExpiresAtUtc = source.ExpiresAtUtc,
        Status = status,
        RevokedAtUtc = revokedAtUtc,
        CancellationCapabilityHash = source.CancellationCapabilityHash,
        RecoveryCapabilityHash = source.RecoveryCapabilityHash,
        CreatedAtUtc = source.CreatedAtUtc,
        UpdatedAtUtc = updatedAtUtc,
        TimeToLiveSeconds = ttl,
    };
}
