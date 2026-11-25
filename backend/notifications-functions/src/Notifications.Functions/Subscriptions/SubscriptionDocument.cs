using Newtonsoft.Json;

namespace Notifications.Functions.Subscriptions;

internal sealed class SubscriptionDocument
{
    [JsonProperty("id")]
    public required string Id { get; init; }

    [JsonProperty("partitionKey")]
    public required string PartitionKey { get; init; }

    [JsonProperty("endpoint")]
    public required string Endpoint { get; init; }

    [JsonProperty("keys")]
    public required SubscriptionKeysDocument Keys { get; init; }

    [JsonProperty("locale")]
    public required string Locale { get; init; }

    [JsonProperty("consentGrantedAtUtc")]
    public required DateTimeOffset ConsentGrantedAtUtc { get; init; }

    [JsonProperty("consentVersion")]
    public required string ConsentVersion { get; init; }

    [JsonProperty("createdAtUtc")]
    public required DateTimeOffset CreatedAtUtc { get; init; }

    [JsonProperty("updatedAtUtc")]
    public required DateTimeOffset UpdatedAtUtc { get; init; }

    [JsonProperty("ttl", NullValueHandling = NullValueHandling.Ignore)]
    public int? TimeToLiveSeconds { get; init; }

    [JsonProperty("_etag", NullValueHandling = NullValueHandling.Ignore)]
    public string? ETag { get; init; }
}

internal sealed record SubscriptionKeysDocument(
    [property: JsonProperty("p256dh")] string P256Dh,
    [property: JsonProperty("auth")] string Auth);

internal sealed record StoredSubscriptionDocument(
    SubscriptionDocument Document,
    string ETag,
    double RequestCharge);

internal sealed record StoredSubscriptionPage(
    IReadOnlyList<StoredSubscriptionDocument> Items,
    string? ContinuationToken);

internal sealed record DocumentWriteResult(
    SubscriptionMutationStatus Status,
    string? ETag,
    double RequestCharge);

internal interface ISubscriptionDocumentStore
{
    Task<StoredSubscriptionPage> ListByLocalePageAsync(
        string locale,
        int pageSize,
        string? continuationToken,
        CancellationToken cancellationToken);

    Task<StoredSubscriptionDocument?> ReadAsync(
        string id,
        string partitionKey,
        CancellationToken cancellationToken);

    Task<DocumentWriteResult> CreateAsync(
        SubscriptionDocument document,
        CancellationToken cancellationToken);

    Task<DocumentWriteResult> UpsertAsync(
        SubscriptionDocument document,
        string? expectedETag,
        CancellationToken cancellationToken);

    Task<DocumentWriteResult> DeleteAsync(
        string id,
        string partitionKey,
        string expectedETag,
        CancellationToken cancellationToken);
}
