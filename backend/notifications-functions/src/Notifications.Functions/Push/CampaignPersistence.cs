using System.Net;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Azure.Cosmos;
using Newtonsoft.Json;
using Notifications.Functions.Subscriptions;

namespace Notifications.Functions.Push;

internal static class CampaignIdentity
{
    public static string ForArticle(string articleId) =>
        $"campaign_{Digest($"article\n{articleId}")}";

    public static string DeliveryId(string subscriptionId, string generation) =>
        $"delivery_{Digest($"subscription\n{subscriptionId}\ngeneration\n{generation}")}";

    public static string PartitionKey(string campaignId) => $"campaign:{campaignId}";

    public static bool IsValidCampaignId(string value) =>
        value.StartsWith("campaign_", StringComparison.Ordinal) && value.Length == 52 &&
        value[9..].All(character => char.IsAsciiLetterOrDigit(character) || character is '-' or '_');

    private static string Digest(string value) => Convert.ToBase64String(
            SHA256.HashData(Encoding.UTF8.GetBytes($"portfolio-campaign:v1\n{value}")))
        .TrimEnd('=').Replace('+', '-').Replace('/', '_');
}

internal enum CampaignStatus
{
    Ready,
    Completed,
}

internal enum CampaignEnqueueStatus
{
    Pending,
    Claimed,
    Enqueued,
    Exhausted,
}

internal enum CampaignEnqueueFailure
{
    None,
    Authorization,
    Throttled,
    Transient,
    TimeoutOrUnknown,
    Permanent,
}

internal static class CampaignEnqueueFailureClassifier
{
    public static CampaignEnqueueFailure FromHttpStatus(int status) => status switch
    {
        401 or 403 => CampaignEnqueueFailure.Authorization,
        429 => CampaignEnqueueFailure.Throttled,
        408 or >= 500 => CampaignEnqueueFailure.Transient,
        _ => CampaignEnqueueFailure.Permanent,
    };

    public static CampaignEnqueueFailure FromTransportException(Exception exception) => exception switch
    {
        OperationCanceledException or HttpRequestException => CampaignEnqueueFailure.TimeoutOrUnknown,
        _ => CampaignEnqueueFailure.Transient,
    };
}

internal enum DeliveryStatus
{
    Claimed,
    Sending,
    Succeeded,
    TransientFailure,
    PermanentFailure,
    SubscriptionExpired,
    Cancelled,
    OutcomeUnknown,
}

internal enum CampaignWriteStatus
{
    Created,
    Updated,
    Duplicate,
    NotFound,
    Conflict,
}

internal sealed record CampaignDeliveryClaim(
    string CampaignId,
    string DeliveryId,
    string PartitionKey,
    string SubscriptionId,
    string Generation,
    DeliveryStatus Status,
    int AttemptCount,
    DateTimeOffset LeaseUntilUtc,
    string ETag);

internal sealed record CampaignWriteResult(CampaignWriteStatus Status, string? ETag, double RequestCharge);
internal sealed record StoredCampaign(CampaignDefinition Definition, CampaignStatus Status, string ETag, double RequestCharge);
internal sealed record StoredDelivery(CampaignDeliveryDocument Document, string ETag, double RequestCharge);
internal sealed record CampaignEnqueueClaim(
    string CampaignId,
    string ClaimId,
    int AttemptCount,
    DateTimeOffset LeaseUntilUtc);
internal sealed record CampaignEnqueueCandidate(
    CampaignDefinition Definition,
    CampaignEnqueueStatus Status,
    int AttemptCount,
    DateTimeOffset? NextAttemptAtUtc,
    string ETag);

internal interface ICampaignRepository
{
    Task<CampaignWriteResult> CreateAsync(CampaignDefinition campaign, CancellationToken cancellationToken);
    Task<StoredCampaign?> GetAsync(string campaignId, CancellationToken cancellationToken);
    Task<IReadOnlyList<CampaignEnqueueCandidate>> ListEnqueueCandidatesAsync(
        DateTimeOffset now,
        int maximumAttempts,
        int limit,
        CancellationToken cancellationToken) => throw new NotSupportedException();
    Task<CampaignEnqueueClaim?> TryClaimEnqueueAsync(
        CampaignEnqueueCandidate candidate,
        DateTimeOffset now,
        TimeSpan leaseDuration,
        CancellationToken cancellationToken) => throw new NotSupportedException();
    Task<CampaignWriteResult> CompleteEnqueueAsync(
        CampaignEnqueueClaim claim,
        CampaignEnqueueFailure failure,
        DateTimeOffset now,
        DateTimeOffset? nextAttemptAtUtc,
        int maximumAttempts,
        CancellationToken cancellationToken) => throw new NotSupportedException();
    Task<CampaignDeliveryClaim?> TryClaimAsync(
        CampaignDefinition campaign,
        SubscriptionRecord subscription,
        DateTimeOffset now,
        CancellationToken cancellationToken);
    Task<CampaignDeliveryClaim?> BeginTransportAsync(
        CampaignDeliveryClaim claim,
        DateTimeOffset now,
        CancellationToken cancellationToken);
    Task<CampaignWriteResult> CompleteAsync(
        CampaignDeliveryClaim claim,
        DeliveryStatus outcome,
        DateTimeOffset now,
        CancellationToken cancellationToken);
}

internal sealed class CampaignRepository : ICampaignRepository
{
    private static readonly TimeSpan ClaimLease = TimeSpan.FromMinutes(5);
    private const int MaximumClaimRetries = 8;
    private readonly ICampaignDocumentStore _store;

    public CampaignRepository(ICampaignDocumentStore store) => _store = store;

    public async Task<CampaignWriteResult> CreateAsync(
        CampaignDefinition campaign,
        CancellationToken cancellationToken)
    {
        ValidateCampaign(campaign);
        var document = CampaignDocument.FromDefinition(campaign);
        var result = await _store.CreateCampaignAsync(document, cancellationToken);
        if (result.Status == CampaignWriteStatus.Duplicate)
        {
            var existing = await GetAsync(campaign.CampaignId, cancellationToken);
            if (existing is null || !string.Equals(existing.Definition.ArticleId, campaign.ArticleId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("A identidade de campanha colidiu com outro artigo.");
            }
        }

        return result;
    }

    public async Task<StoredCampaign?> GetAsync(string campaignId, CancellationToken cancellationToken)
    {
        if (!CampaignIdentity.IsValidCampaignId(campaignId))
        {
            return null;
        }

        var stored = await _store.ReadCampaignAsync(
            campaignId,
            CampaignIdentity.PartitionKey(campaignId),
            cancellationToken);
        return stored is null
            ? null
            : new(stored.Definition, stored.Status, stored.ETag, stored.RequestCharge);
    }

    public async Task<IReadOnlyList<CampaignEnqueueCandidate>> ListEnqueueCandidatesAsync(
        DateTimeOffset now,
        int maximumAttempts,
        int limit,
        CancellationToken cancellationToken)
    {
        if (maximumAttempts is < 1 or > 10 || limit is < 1 or > 100)
        {
            throw new ArgumentOutOfRangeException(nameof(limit));
        }

        var stored = await _store.ListCampaignsForEnqueueAsync(now, maximumAttempts, limit, cancellationToken);
        return stored.Select(item => new CampaignEnqueueCandidate(
            item.Definition,
            item.Document.EnqueueStatus,
            item.Document.EnqueueAttemptCount,
            item.Document.NextEnqueueAttemptAtUtc,
            item.ETag)).ToArray();
    }

    public async Task<CampaignEnqueueClaim?> TryClaimEnqueueAsync(
        CampaignEnqueueCandidate candidate,
        DateTimeOffset now,
        TimeSpan leaseDuration,
        CancellationToken cancellationToken)
    {
        if (leaseDuration <= TimeSpan.Zero || leaseDuration > TimeSpan.FromMinutes(15))
        {
            throw new ArgumentOutOfRangeException(nameof(leaseDuration));
        }

        var partitionKey = CampaignIdentity.PartitionKey(candidate.Definition.CampaignId);
        var current = await _store.ReadCampaignAsync(candidate.Definition.CampaignId, partitionKey, cancellationToken);
        if (current is null || current.ETag != candidate.ETag ||
            current.Document.EnqueueStatus is CampaignEnqueueStatus.Enqueued or CampaignEnqueueStatus.Exhausted ||
            current.Document.NextEnqueueAttemptAtUtc > now ||
            current.Document.EnqueueStatus == CampaignEnqueueStatus.Claimed && current.Document.EnqueueLeaseUntilUtc > now)
        {
            return null;
        }

        var claimId = Guid.NewGuid().ToString("N");
        var claimed = current.Document.WithEnqueueClaim(claimId, now, now.Add(leaseDuration));
        var result = await _store.ReplaceCampaignAsync(claimed, current.ETag, cancellationToken);
        return result.Status == CampaignWriteStatus.Updated
            ? new(claimed.Id, claimId, claimed.EnqueueAttemptCount, claimed.EnqueueLeaseUntilUtc!.Value)
            : null;
    }

    public async Task<CampaignWriteResult> CompleteEnqueueAsync(
        CampaignEnqueueClaim claim,
        CampaignEnqueueFailure failure,
        DateTimeOffset now,
        DateTimeOffset? nextAttemptAtUtc,
        int maximumAttempts,
        CancellationToken cancellationToken)
    {
        if (!CampaignIdentity.IsValidCampaignId(claim.CampaignId) ||
            claim.ClaimId.Length != 32 || !claim.ClaimId.All(char.IsAsciiHexDigit) ||
            claim.AttemptCount is < 1 or > 10)
        {
            throw new ArgumentException("O claim de enqueue é inválido.", nameof(claim));
        }

        var partitionKey = CampaignIdentity.PartitionKey(claim.CampaignId);
        var current = await _store.ReadCampaignAsync(claim.CampaignId, partitionKey, cancellationToken);
        if (current is null || current.Document.EnqueueStatus != CampaignEnqueueStatus.Claimed ||
            !string.Equals(current.Document.EnqueueClaimId, claim.ClaimId, StringComparison.Ordinal))
        {
            return new(CampaignWriteStatus.Conflict, null, current?.RequestCharge ?? 0);
        }

        var completed = current.Document.WithEnqueueOutcome(
            failure,
            now,
            nextAttemptAtUtc,
            maximumAttempts);
        return await _store.ReplaceCampaignAsync(completed, current.ETag, cancellationToken);
    }

    public async Task<CampaignDeliveryClaim?> TryClaimAsync(
        CampaignDefinition campaign,
        SubscriptionRecord subscription,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        if (campaign.Locale != "pt-BR" || subscription.Subscription.Locale != "pt-BR" ||
            subscription.CreatedAtUtc > campaign.AudienceCutoffUtc ||
            string.IsNullOrWhiteSpace(subscription.Generation))
        {
            return null;
        }

        var partitionKey = CampaignIdentity.PartitionKey(campaign.CampaignId);
        var deliveryId = CampaignIdentity.DeliveryId(subscription.Id, subscription.Generation);
        var initial = CampaignDeliveryDocument.Create(
            deliveryId,
            partitionKey,
            campaign.CampaignId,
            subscription.Id,
            subscription.Generation,
            now,
            now.Add(ClaimLease));
        var created = await _store.CreateDeliveryAsync(initial, cancellationToken);
        if (created.Status == CampaignWriteStatus.Created && created.ETag is not null)
        {
            return Map(initial, created.ETag);
        }

        for (var retry = 0; retry < MaximumClaimRetries; retry++)
        {
            var stored = await _store.ReadDeliveryAsync(deliveryId, partitionKey, cancellationToken);
            if (stored is null || IsTerminal(stored.Document.Status))
            {
                return null;
            }

            if (stored.Document.Status == DeliveryStatus.Sending)
            {
                if (stored.Document.LeaseUntilUtc > now)
                {
                    return null;
                }

                // A process may have reached the provider after the durable transition
                // to Sending. Never reclaim it automatically: the result is uncertain.
                var uncertain = stored.Document.WithOutcome(DeliveryStatus.OutcomeUnknown, now);
                var marked = await _store.ReplaceDeliveryAsync(uncertain, stored.ETag, cancellationToken);
                if (marked.Status == CampaignWriteStatus.Updated)
                {
                    return null;
                }

                continue;
            }

            if (stored.Document.Status == DeliveryStatus.Claimed && stored.Document.LeaseUntilUtc > now)
            {
                return null;
            }

            var reclaimed = stored.Document.Reclaim(now, now.Add(ClaimLease));
            var result = await _store.ReplaceDeliveryAsync(reclaimed, stored.ETag, cancellationToken);
            if (result.Status == CampaignWriteStatus.Updated && result.ETag is not null)
            {
                return Map(reclaimed, result.ETag);
            }
        }

        return null;
    }

    public async Task<CampaignDeliveryClaim?> BeginTransportAsync(
        CampaignDeliveryClaim claim,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        if (claim.Status != DeliveryStatus.Claimed || claim.LeaseUntilUtc <= now)
        {
            return null;
        }

        var stored = await _store.ReadDeliveryAsync(claim.DeliveryId, claim.PartitionKey, cancellationToken);
        if (stored is null || stored.ETag != claim.ETag || stored.Document.Status != DeliveryStatus.Claimed)
        {
            return null;
        }

        var sending = stored.Document.BeginTransport(now, now.Add(ClaimLease));
        var result = await _store.ReplaceDeliveryAsync(sending, stored.ETag, cancellationToken);
        return result.Status == CampaignWriteStatus.Updated && result.ETag is not null
            ? Map(sending, result.ETag)
            : null;
    }

    public async Task<CampaignWriteResult> CompleteAsync(
        CampaignDeliveryClaim claim,
        DeliveryStatus outcome,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var cancelsBeforeTransport = claim.Status == DeliveryStatus.Claimed && outcome == DeliveryStatus.Cancelled;
        if ((!cancelsBeforeTransport && claim.Status != DeliveryStatus.Sending) ||
            outcome is DeliveryStatus.Claimed or DeliveryStatus.Sending)
        {
            throw new ArgumentException("A transição de entrega é inválida.", nameof(outcome));
        }

        var stored = await _store.ReadDeliveryAsync(claim.DeliveryId, claim.PartitionKey, cancellationToken);
        if (stored is null || stored.ETag != claim.ETag || stored.Document.Status != claim.Status)
        {
            return new(CampaignWriteStatus.Conflict, null, stored?.RequestCharge ?? 0);
        }

        return await _store.ReplaceDeliveryAsync(stored.Document.WithOutcome(outcome, now), stored.ETag, cancellationToken);
    }

    private static CampaignDeliveryClaim Map(CampaignDeliveryDocument document, string etag) => new(
        document.CampaignId,
        document.Id,
        document.PartitionKey,
        document.SubscriptionId,
        document.Generation,
        document.Status,
        document.AttemptCount,
        document.LeaseUntilUtc,
        etag);

    private static bool IsTerminal(DeliveryStatus status) => status is
        DeliveryStatus.Succeeded or DeliveryStatus.PermanentFailure or
        DeliveryStatus.SubscriptionExpired or DeliveryStatus.Cancelled or
        DeliveryStatus.OutcomeUnknown;

    private static void ValidateCampaign(CampaignDefinition campaign)
    {
        if (!CampaignIdentity.IsValidCampaignId(campaign.CampaignId) ||
            !campaign.ArticleId.StartsWith("article_", StringComparison.Ordinal) ||
            campaign.Locale != "pt-BR" || campaign.Origin != Publications.ArticleOrigin.LinkedIn ||
            campaign.PublicationSha.Length != 40 || !campaign.PublicationSha.All(char.IsAsciiHexDigit) ||
            campaign.PublicationSequence <= 0 ||
            campaign.AudienceCutoffUtc.Offset != TimeSpan.Zero ||
            !IsBoundedText(campaign.Title, 80) || !IsBoundedText(campaign.Body, 160) ||
            !IsSafePortfolioTarget(campaign.Url) ||
            !Uri.TryCreate(campaign.CanonicalArticleUrl, UriKind.Absolute, out var canonical) ||
            canonical.Scheme != Uri.UriSchemeHttps ||
            !string.Equals(canonical.Host, "www.linkedin.com", StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException("A campanha persistida é inválida.", nameof(campaign));
        }
    }

    private static bool IsBoundedText(string value, int maximumLength) =>
        !string.IsNullOrWhiteSpace(value) && value == value.Trim() &&
        value.Length <= maximumLength && !value.Any(char.IsControl);

    private static bool IsSafePortfolioTarget(string value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var target) &&
        target.Scheme == Uri.UriSchemeHttps && target.IsDefaultPort &&
        string.Equals(target.Host, "rodri-oliveira-dev.github.io", StringComparison.OrdinalIgnoreCase) &&
        string.IsNullOrEmpty(target.UserInfo) && string.IsNullOrEmpty(target.Query) &&
        string.IsNullOrEmpty(target.Fragment) &&
        (target.AbsolutePath == "/" ||
         target.AbsolutePath.StartsWith("/case-studies/", StringComparison.Ordinal) &&
         target.AbsolutePath.EndsWith("/", StringComparison.Ordinal) &&
         !target.AbsolutePath.Contains("..", StringComparison.Ordinal));
}

internal sealed class CampaignDocument
{
    [JsonProperty("id")] public required string Id { get; init; }
    [JsonProperty("partitionKey")] public required string PartitionKey { get; init; }
    [JsonProperty("type")] public string Type { get; init; } = "campaign";
    [JsonProperty("articleId")] public required string ArticleId { get; init; }
    [JsonProperty("origin")] public required string Origin { get; init; }
    [JsonProperty("locale")] public required string Locale { get; init; }
    [JsonProperty("publicationSha")] public required string PublicationSha { get; init; }
    [JsonProperty("publicationSequence")] public required long PublicationSequence { get; init; }
    [JsonProperty("canonicalArticleUrl")] public required string CanonicalArticleUrl { get; init; }
    [JsonProperty("title")] public required string Title { get; init; }
    [JsonProperty("body")] public required string Body { get; init; }
    [JsonProperty("url")] public required string Url { get; init; }
    [JsonProperty("audienceCutoffUtc")] public required DateTimeOffset AudienceCutoffUtc { get; init; }
    [JsonProperty("status")] public CampaignStatus Status { get; init; } = CampaignStatus.Ready;
    [JsonProperty("createdAtUtc")] public required DateTimeOffset CreatedAtUtc { get; init; }
    [JsonProperty("updatedAtUtc")] public required DateTimeOffset UpdatedAtUtc { get; init; }
    [JsonProperty("enqueueStatus")] public CampaignEnqueueStatus EnqueueStatus { get; init; } = CampaignEnqueueStatus.Pending;
    [JsonProperty("enqueueAttemptCount")] public int EnqueueAttemptCount { get; init; }
    [JsonProperty("enqueueClaimId", NullValueHandling = NullValueHandling.Ignore)] public string? EnqueueClaimId { get; init; }
    [JsonProperty("enqueueLeaseUntilUtc", NullValueHandling = NullValueHandling.Ignore)] public DateTimeOffset? EnqueueLeaseUntilUtc { get; init; }
    [JsonProperty("nextEnqueueAttemptAtUtc", NullValueHandling = NullValueHandling.Ignore)] public DateTimeOffset? NextEnqueueAttemptAtUtc { get; init; }
    [JsonProperty("enqueueFailure")] public CampaignEnqueueFailure EnqueueFailure { get; init; }
    [JsonProperty("enqueuedAtUtc", NullValueHandling = NullValueHandling.Ignore)] public DateTimeOffset? EnqueuedAtUtc { get; init; }
    [JsonProperty("_etag", NullValueHandling = NullValueHandling.Ignore)] public string? ETag { get; init; }

    public CampaignDefinition Definition => new(
        Title, Body, Url, Id, ArticleId,
        Enum.Parse<Publications.ArticleOrigin>(Origin),
        Locale, PublicationSha, PublicationSequence, CanonicalArticleUrl, AudienceCutoffUtc);

    public static CampaignDocument FromDefinition(CampaignDefinition definition) => new()
    {
        Id = definition.CampaignId,
        PartitionKey = CampaignIdentity.PartitionKey(definition.CampaignId),
        ArticleId = definition.ArticleId,
        Origin = definition.Origin.ToString(),
        Locale = definition.Locale,
        PublicationSha = definition.PublicationSha,
        PublicationSequence = definition.PublicationSequence,
        CanonicalArticleUrl = definition.CanonicalArticleUrl,
        Title = definition.Title,
        Body = definition.Body,
        Url = definition.Url,
        AudienceCutoffUtc = definition.AudienceCutoffUtc,
        CreatedAtUtc = definition.AudienceCutoffUtc,
        UpdatedAtUtc = definition.AudienceCutoffUtc,
    };

    public CampaignDocument WithEnqueueClaim(string claimId, DateTimeOffset now, DateTimeOffset leaseUntil) => Copy(
        CampaignEnqueueStatus.Claimed,
        EnqueueAttemptCount + 1,
        claimId,
        leaseUntil,
        null,
        CampaignEnqueueFailure.None,
        null,
        now);

    public CampaignDocument WithEnqueueOutcome(
        CampaignEnqueueFailure failure,
        DateTimeOffset now,
        DateTimeOffset? nextAttemptAtUtc,
        int maximumAttempts) => failure == CampaignEnqueueFailure.None
            ? Copy(CampaignEnqueueStatus.Enqueued, EnqueueAttemptCount, null, null, null, failure, now, now)
            : Copy(
                EnqueueAttemptCount >= maximumAttempts || failure == CampaignEnqueueFailure.Permanent
                    ? CampaignEnqueueStatus.Exhausted
                    : CampaignEnqueueStatus.Pending,
                EnqueueAttemptCount,
                null,
                null,
                nextAttemptAtUtc,
                failure,
                null,
                now);

    private CampaignDocument Copy(
        CampaignEnqueueStatus enqueueStatus,
        int enqueueAttemptCount,
        string? enqueueClaimId,
        DateTimeOffset? enqueueLeaseUntilUtc,
        DateTimeOffset? nextEnqueueAttemptAtUtc,
        CampaignEnqueueFailure enqueueFailure,
        DateTimeOffset? enqueuedAtUtc,
        DateTimeOffset updatedAtUtc) => new()
        {
            Id = Id,
            PartitionKey = PartitionKey,
            ArticleId = ArticleId,
            Origin = Origin,
            Locale = Locale,
            PublicationSha = PublicationSha,
            PublicationSequence = PublicationSequence,
            CanonicalArticleUrl = CanonicalArticleUrl,
            Title = Title,
            Body = Body,
            Url = Url,
            AudienceCutoffUtc = AudienceCutoffUtc,
            Status = Status,
            CreatedAtUtc = CreatedAtUtc,
            UpdatedAtUtc = updatedAtUtc,
            EnqueueStatus = enqueueStatus,
            EnqueueAttemptCount = enqueueAttemptCount,
            EnqueueClaimId = enqueueClaimId,
            EnqueueLeaseUntilUtc = enqueueLeaseUntilUtc,
            NextEnqueueAttemptAtUtc = nextEnqueueAttemptAtUtc,
            EnqueueFailure = enqueueFailure,
            EnqueuedAtUtc = enqueuedAtUtc,
        };
}

internal sealed class CampaignDeliveryDocument
{
    [JsonProperty("id")] public required string Id { get; init; }
    [JsonProperty("partitionKey")] public required string PartitionKey { get; init; }
    [JsonProperty("type")] public string Type { get; init; } = "campaign-delivery";
    [JsonProperty("campaignId")] public required string CampaignId { get; init; }
    [JsonProperty("subscriptionId")] public required string SubscriptionId { get; init; }
    [JsonProperty("generation")] public required string Generation { get; init; }
    [JsonProperty("status")] public required DeliveryStatus Status { get; init; }
    [JsonProperty("attemptCount")] public required int AttemptCount { get; init; }
    [JsonProperty("claimedAtUtc")] public required DateTimeOffset ClaimedAtUtc { get; init; }
    [JsonProperty("transportStartedAtUtc", NullValueHandling = NullValueHandling.Ignore)] public DateTimeOffset? TransportStartedAtUtc { get; init; }
    [JsonProperty("completedAtUtc", NullValueHandling = NullValueHandling.Ignore)] public DateTimeOffset? CompletedAtUtc { get; init; }
    [JsonProperty("leaseUntilUtc")] public required DateTimeOffset LeaseUntilUtc { get; init; }
    [JsonProperty("updatedAtUtc")] public required DateTimeOffset UpdatedAtUtc { get; init; }
    [JsonProperty("_etag", NullValueHandling = NullValueHandling.Ignore)] public string? ETag { get; init; }

    public static CampaignDeliveryDocument Create(
        string id,
        string partitionKey,
        string campaignId,
        string subscriptionId,
        string generation,
        DateTimeOffset now,
        DateTimeOffset leaseUntil) => new()
        {
            Id = id,
            PartitionKey = partitionKey,
            CampaignId = campaignId,
            SubscriptionId = subscriptionId,
            Generation = generation,
            Status = DeliveryStatus.Claimed,
            AttemptCount = 0,
            ClaimedAtUtc = now,
            LeaseUntilUtc = leaseUntil,
            UpdatedAtUtc = now,
        };

    public CampaignDeliveryDocument Reclaim(DateTimeOffset now, DateTimeOffset leaseUntil) => Copy(
        DeliveryStatus.Claimed, AttemptCount, now, null, null, leaseUntil, now);

    public CampaignDeliveryDocument BeginTransport(DateTimeOffset now, DateTimeOffset leaseUntil) => Copy(
        DeliveryStatus.Sending, AttemptCount + 1, ClaimedAtUtc, now, null, leaseUntil, now);

    public CampaignDeliveryDocument WithOutcome(DeliveryStatus outcome, DateTimeOffset now) => Copy(
        outcome, AttemptCount, ClaimedAtUtc, TransportStartedAtUtc, now, now, now);

    private CampaignDeliveryDocument Copy(
        DeliveryStatus status,
        int attemptCount,
        DateTimeOffset claimedAt,
        DateTimeOffset? transportStartedAt,
        DateTimeOffset? completedAt,
        DateTimeOffset leaseUntil,
        DateTimeOffset updatedAt) => new()
        {
            Id = Id,
            PartitionKey = PartitionKey,
            CampaignId = CampaignId,
            SubscriptionId = SubscriptionId,
            Generation = Generation,
            Status = status,
            AttemptCount = attemptCount,
            ClaimedAtUtc = claimedAt,
            TransportStartedAtUtc = transportStartedAt,
            CompletedAtUtc = completedAt,
            LeaseUntilUtc = leaseUntil,
            UpdatedAtUtc = updatedAt,
        };
}

internal sealed record StoredCampaignDocument(CampaignDocument Document, string ETag, double RequestCharge)
{
    public CampaignDefinition Definition => Document.Definition;
    public CampaignStatus Status => Document.Status;
}

internal interface ICampaignDocumentStore
{
    Task<CampaignWriteResult> CreateCampaignAsync(CampaignDocument document, CancellationToken cancellationToken);
    Task<StoredCampaignDocument?> ReadCampaignAsync(string id, string partitionKey, CancellationToken cancellationToken);
    Task<IReadOnlyList<StoredCampaignDocument>> ListCampaignsForEnqueueAsync(DateTimeOffset now, int maximumAttempts, int limit, CancellationToken cancellationToken);
    Task<CampaignWriteResult> ReplaceCampaignAsync(CampaignDocument document, string expectedETag, CancellationToken cancellationToken);
    Task<CampaignWriteResult> CreateDeliveryAsync(CampaignDeliveryDocument document, CancellationToken cancellationToken);
    Task<StoredDelivery?> ReadDeliveryAsync(string id, string partitionKey, CancellationToken cancellationToken);
    Task<CampaignWriteResult> ReplaceDeliveryAsync(CampaignDeliveryDocument document, string expectedETag, CancellationToken cancellationToken);
}

internal sealed class CosmosCampaignDocumentStore(Container container) : ICampaignDocumentStore
{
    public Task<CampaignWriteResult> CreateCampaignAsync(CampaignDocument document, CancellationToken cancellationToken) =>
        CreateAsync(document, document.PartitionKey, cancellationToken);

    public async Task<StoredCampaignDocument?> ReadCampaignAsync(string id, string partitionKey, CancellationToken cancellationToken)
    {
        try
        {
            var response = await container.ReadItemAsync<CampaignDocument>(id, new PartitionKey(partitionKey), cancellationToken: cancellationToken);
            return new(response.Resource, response.ETag, response.RequestCharge);
        }
        catch (CosmosException exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<IReadOnlyList<StoredCampaignDocument>> ListCampaignsForEnqueueAsync(
        DateTimeOffset now,
        int maximumAttempts,
        int limit,
        CancellationToken cancellationToken)
    {
        var query = new QueryDefinition(
            "SELECT TOP @limit * FROM c WHERE c.type = 'campaign' " +
            "AND (NOT IS_DEFINED(c.enqueueStatus) OR " +
            "(c.enqueueStatus != @enqueued AND c.enqueueStatus != @exhausted)) " +
            "AND (NOT IS_DEFINED(c.enqueueAttemptCount) OR c.enqueueAttemptCount < @maximumAttempts) " +
            "AND (NOT IS_DEFINED(c.nextEnqueueAttemptAtUtc) OR c.nextEnqueueAttemptAtUtc <= @now) " +
            "ORDER BY c.createdAtUtc ASC")
            .WithParameter("@limit", limit)
            .WithParameter("@enqueued", (int)CampaignEnqueueStatus.Enqueued)
            .WithParameter("@exhausted", (int)CampaignEnqueueStatus.Exhausted)
            .WithParameter("@maximumAttempts", maximumAttempts)
            .WithParameter("@now", now);
        using var iterator = container.GetItemQueryIterator<CampaignDocument>(
            query,
            requestOptions: new QueryRequestOptions { MaxItemCount = limit });
        var results = new List<StoredCampaignDocument>(limit);
        while (iterator.HasMoreResults && results.Count < limit)
        {
            var response = await iterator.ReadNextAsync(cancellationToken);
            results.AddRange(response.Resource.Take(limit - results.Count)
                .Select(document => new StoredCampaignDocument(document, document.ETag ?? string.Empty, response.RequestCharge)));
        }

        return results;
    }

    public Task<CampaignWriteResult> ReplaceCampaignAsync(
        CampaignDocument document,
        string expectedETag,
        CancellationToken cancellationToken) => ReplaceAsync(document, document.PartitionKey, expectedETag, cancellationToken);

    public Task<CampaignWriteResult> CreateDeliveryAsync(CampaignDeliveryDocument document, CancellationToken cancellationToken) =>
        CreateAsync(document, document.PartitionKey, cancellationToken);

    public async Task<StoredDelivery?> ReadDeliveryAsync(string id, string partitionKey, CancellationToken cancellationToken)
    {
        try
        {
            var response = await container.ReadItemAsync<CampaignDeliveryDocument>(id, new PartitionKey(partitionKey), cancellationToken: cancellationToken);
            return new(response.Resource, response.ETag, response.RequestCharge);
        }
        catch (CosmosException exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<CampaignWriteResult> ReplaceDeliveryAsync(
        CampaignDeliveryDocument document,
        string expectedETag,
        CancellationToken cancellationToken)
    {
        return await ReplaceAsync(document, document.PartitionKey, expectedETag, cancellationToken);
    }

    private async Task<CampaignWriteResult> ReplaceAsync<T>(
        T document,
        string partitionKey,
        string expectedETag,
        CancellationToken cancellationToken) where T : class
    {
        try
        {
            var response = await container.ReplaceItemAsync(
                document,
                (string)(typeof(T).GetProperty("Id")?.GetValue(document)
                    ?? throw new InvalidOperationException("Documento sem ID.")),
                new PartitionKey(partitionKey),
                new ItemRequestOptions { IfMatchEtag = expectedETag },
                cancellationToken);
            return new(CampaignWriteStatus.Updated, response.ETag, response.RequestCharge);
        }
        catch (CosmosException exception) when (
            exception.StatusCode is HttpStatusCode.PreconditionFailed or HttpStatusCode.NotFound)
        {
            return new(CampaignWriteStatus.Conflict, null, exception.RequestCharge);
        }
    }

    private async Task<CampaignWriteResult> CreateAsync<T>(T document, string partitionKey, CancellationToken cancellationToken)
    {
        try
        {
            var response = await container.CreateItemAsync(document, new PartitionKey(partitionKey), cancellationToken: cancellationToken);
            return new(CampaignWriteStatus.Created, response.ETag, response.RequestCharge);
        }
        catch (CosmosException exception) when (exception.StatusCode == HttpStatusCode.Conflict)
        {
            return new(CampaignWriteStatus.Duplicate, null, exception.RequestCharge);
        }
    }
}
