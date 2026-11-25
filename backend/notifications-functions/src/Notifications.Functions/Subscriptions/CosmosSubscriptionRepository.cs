namespace Notifications.Functions.Subscriptions;

public interface ISubscriptionRepository
{
    Task<SubscriptionPage> ListActivePageAsync(
        string locale,
        string? continuationToken,
        CancellationToken cancellationToken = default);

    Task<SubscriptionRecord?> GetAsync(string endpoint, CancellationToken cancellationToken = default);

    Task<SubscriptionMutationResult> CreateAsync(
        WebPushSubscriptionInput subscription,
        CancellationToken cancellationToken = default);

    Task<SubscriptionMutationResult> UpsertAsync(
        WebPushSubscriptionInput subscription,
        string? expectedETag,
        CancellationToken cancellationToken = default);

    Task<SubscriptionMutationResult> DeleteAsync(
        string endpoint,
        string expectedETag,
        CancellationToken cancellationToken = default);
}

public sealed record SubscriptionPage(
    IReadOnlyList<SubscriptionRecord> Items,
    string? ContinuationToken);

internal sealed class CosmosSubscriptionRepository : ISubscriptionRepository
{
    private const int QueryPageSize = 10;
    private readonly ISubscriptionDocumentStore _store;
    private readonly TimeProvider _timeProvider;

    public CosmosSubscriptionRepository(ISubscriptionDocumentStore store)
        : this(store, TimeProvider.System)
    {
    }

    internal CosmosSubscriptionRepository(ISubscriptionDocumentStore store, TimeProvider timeProvider)
    {
        _store = store ?? throw new ArgumentNullException(nameof(store));
        _timeProvider = timeProvider ?? throw new ArgumentNullException(nameof(timeProvider));
    }

    public async Task<SubscriptionRecord?> GetAsync(
        string endpoint,
        CancellationToken cancellationToken = default)
    {
        var normalizedEndpoint = WebPushSubscriptionValidator.NormalizeEndpoint(endpoint);
        var (id, partitionKey) = WebPushSubscriptionValidator.DeriveIdentity(normalizedEndpoint);
        var stored = await _store.ReadAsync(id, partitionKey, cancellationToken);
        return stored is null ? null : Map(stored);
    }

    public async Task<SubscriptionPage> ListActivePageAsync(
        string locale,
        string? continuationToken,
        CancellationToken cancellationToken = default)
    {
        if (!string.Equals(locale, WebPushSubscriptionValidator.SupportedLocale, StringComparison.Ordinal))
        {
            throw new ArgumentException("Somente o idioma pt-BR é aceito nesta versão.", nameof(locale));
        }

        var page = await _store.ListByLocalePageAsync(
            locale,
            QueryPageSize,
            continuationToken,
            cancellationToken);
        return new(page.Items.Select(Map).ToArray(), page.ContinuationToken);
    }

    public async Task<SubscriptionMutationResult> CreateAsync(
        WebPushSubscriptionInput subscription,
        CancellationToken cancellationToken = default)
    {
        var now = _timeProvider.GetUtcNow();
        var normalized = WebPushSubscriptionValidator.ValidateAndNormalize(subscription, now);
        var (id, partitionKey) = WebPushSubscriptionValidator.DeriveIdentity(normalized.Endpoint);
        var document = CreateDocument(normalized, id, partitionKey, now, now);
        var result = await _store.CreateAsync(document, cancellationToken);
        return Map(result, id, partitionKey);
    }

    public async Task<SubscriptionMutationResult> UpsertAsync(
        WebPushSubscriptionInput subscription,
        string? expectedETag,
        CancellationToken cancellationToken = default)
    {
        var now = _timeProvider.GetUtcNow();
        var normalized = WebPushSubscriptionValidator.ValidateAndNormalize(subscription, now);
        var (id, partitionKey) = WebPushSubscriptionValidator.DeriveIdentity(normalized.Endpoint);
        var current = await _store.ReadAsync(id, partitionKey, cancellationToken);

        if (current is not null && expectedETag is null)
        {
            return new(SubscriptionMutationStatus.Duplicate, id, partitionKey, current.ETag, current.RequestCharge);
        }

        if (current is null && expectedETag is not null)
        {
            return new(SubscriptionMutationStatus.ConcurrencyConflict, id, partitionKey, null, 0);
        }

        var document = CreateDocument(
            normalized,
            id,
            partitionKey,
            current?.Document.CreatedAtUtc ?? now,
            now);
        var result = current is null
            ? await _store.CreateAsync(document, cancellationToken)
            : await _store.UpsertAsync(document, expectedETag, cancellationToken);
        return Map(result, id, partitionKey, current?.RequestCharge ?? 0);
    }

    public async Task<SubscriptionMutationResult> DeleteAsync(
        string endpoint,
        string expectedETag,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(expectedETag);

        var normalizedEndpoint = WebPushSubscriptionValidator.NormalizeEndpoint(endpoint);
        var (id, partitionKey) = WebPushSubscriptionValidator.DeriveIdentity(normalizedEndpoint);
        var result = await _store.DeleteAsync(id, partitionKey, expectedETag, cancellationToken);
        return Map(result, id, partitionKey);
    }

    private static SubscriptionDocument CreateDocument(
        WebPushSubscriptionInput subscription,
        string id,
        string partitionKey,
        DateTimeOffset createdAtUtc,
        DateTimeOffset updatedAtUtc) => new()
        {
            Id = id,
            PartitionKey = partitionKey,
            Endpoint = subscription.Endpoint,
            Keys = new(subscription.P256Dh, subscription.Auth),
            Locale = subscription.Locale,
            ConsentGrantedAtUtc = subscription.ConsentGrantedAtUtc,
            ConsentVersion = subscription.ConsentVersion,
            CreatedAtUtc = createdAtUtc,
            UpdatedAtUtc = updatedAtUtc,
            TimeToLiveSeconds = null,
        };

    private static SubscriptionRecord Map(StoredSubscriptionDocument stored)
    {
        var document = stored.Document;
        return new(
            document.Id,
            document.PartitionKey,
            new(
                document.Endpoint,
                document.Keys.P256Dh,
                document.Keys.Auth,
                document.Locale,
                document.ConsentGrantedAtUtc,
                document.ConsentVersion),
            document.CreatedAtUtc,
            document.UpdatedAtUtc,
            stored.ETag);
    }

    private static SubscriptionMutationResult Map(
        DocumentWriteResult result,
        string id,
        string partitionKey,
        double additionalRequestCharge = 0) => new(
            result.Status,
            id,
            partitionKey,
            result.ETag,
            result.RequestCharge + additionalRequestCharge);
}
