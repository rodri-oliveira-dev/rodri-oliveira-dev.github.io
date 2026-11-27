using Newtonsoft.Json;

namespace Notifications.Functions.Subscriptions;

internal sealed class SubscriptionDocument
{
    [JsonProperty("id")] public required string Id { get; init; }
    [JsonProperty("partitionKey")] public required string PartitionKey { get; init; }
    [JsonProperty("type")] public string Type { get; init; } = "subscription";
    [JsonProperty("endpoint")] public required string Endpoint { get; init; }
    [JsonProperty("keys")] public required SubscriptionKeysDocument Keys { get; init; }
    [JsonProperty("locale")] public required string Locale { get; init; }
    [JsonProperty("purposeId")] public required string PurposeId { get; init; }
    [JsonProperty("consentVersion")] public required string ConsentVersion { get; init; }
    [JsonProperty("privacyNoticeVersion")] public required string PrivacyNoticeVersion { get; init; }
    [JsonProperty("consentMethod")] public required string ConsentMethod { get; init; }
    [JsonProperty("consentId")] public required string ConsentId { get; init; }
    [JsonProperty("generation")] public required string Generation { get; init; }
    [JsonProperty("recoveryEpoch")] public required string RecoveryEpoch { get; init; }
    [JsonProperty("consentGrantedAtUtc")] public required DateTimeOffset ConsentGrantedAtUtc { get; init; }
    [JsonProperty("expiresAtUtc")] public required DateTimeOffset ExpiresAtUtc { get; init; }
    [JsonProperty("status")] public required string Status { get; init; }
    [JsonProperty("revokedAtUtc", NullValueHandling = NullValueHandling.Ignore)] public DateTimeOffset? RevokedAtUtc { get; init; }
    [JsonProperty("cancellationCapabilityHash")] public required string CancellationCapabilityHash { get; init; }
    [JsonProperty("recoveryCapabilityHash")] public required string RecoveryCapabilityHash { get; init; }
    [JsonProperty("createdAtUtc")] public required DateTimeOffset CreatedAtUtc { get; init; }
    [JsonProperty("updatedAtUtc")] public required DateTimeOffset UpdatedAtUtc { get; init; }
    [JsonProperty("ttl")] public required int TimeToLiveSeconds { get; init; }
    [JsonProperty("_etag", NullValueHandling = NullValueHandling.Ignore)] public string? ETag { get; init; }
}

internal sealed record SubscriptionKeysDocument(
    [property: JsonProperty("p256dh")] string P256Dh,
    [property: JsonProperty("auth")] string Auth);

internal sealed record StoredSubscriptionDocument(SubscriptionDocument Document, string ETag, double RequestCharge);
internal sealed record StoredSubscriptionPage(IReadOnlyList<StoredSubscriptionDocument> Items, string? ContinuationToken);
internal sealed record DocumentWriteResult(SubscriptionMutationStatus Status, string? ETag, double RequestCharge);

internal interface ISubscriptionDocumentStore
{
    Task<StoredSubscriptionPage> ListActivePageAsync(string locale, string recoveryEpoch, DateTimeOffset now, int pageSize, string? continuationToken, CancellationToken cancellationToken);
    Task<StoredSubscriptionDocument?> ReadAsync(string id, string partitionKey, CancellationToken cancellationToken);
    Task<DocumentWriteResult> CreateAsync(SubscriptionDocument document, CancellationToken cancellationToken);
    Task<DocumentWriteResult> ReplaceAsync(SubscriptionDocument document, string expectedETag, CancellationToken cancellationToken);
    Task<DocumentWriteResult> DeleteAsync(string id, string partitionKey, string expectedETag, CancellationToken cancellationToken);
}
