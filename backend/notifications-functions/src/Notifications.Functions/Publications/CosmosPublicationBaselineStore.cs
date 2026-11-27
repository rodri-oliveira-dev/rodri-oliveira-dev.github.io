using System.Net;
using Microsoft.Azure.Cosmos;
using Newtonsoft.Json;

namespace Notifications.Functions.Publications;

internal sealed class PublicationBaselineDocument
{
    public const string DocumentId = "publication-baseline";
    public const string DocumentPartitionKey = "publication-baseline";

    [JsonProperty("id")] public string Id { get; init; } = DocumentId;
    [JsonProperty("partitionKey")] public string PartitionKey { get; init; } = DocumentPartitionKey;
    [JsonProperty("type")] public string Type { get; init; } = "publication-baseline";
    [JsonProperty("publicationSha")] public required string PublicationSha { get; init; }
    [JsonProperty("publicationSequence")] public required long PublicationSequence { get; init; }
    [JsonProperty("publishedAtUtc")] public required DateTimeOffset PublishedAtUtc { get; init; }
    [JsonProperty("knownArticleIds")] public required string[] KnownArticleIds { get; init; }
    [JsonProperty("_etag", NullValueHandling = NullValueHandling.Ignore)] public string? ETag { get; init; }

    public static PublicationBaselineDocument From(PublicationBaseline baseline) => new()
    {
        PublicationSha = baseline.Sha,
        PublicationSequence = baseline.Sequence,
        PublishedAtUtc = baseline.PublishedAtUtc,
        KnownArticleIds = baseline.KnownArticleIds.Order(StringComparer.Ordinal).ToArray(),
    };

    public PublicationBaseline ToBaseline(string etag) => new(
        PublicationSha,
        PublicationSequence,
        PublishedAtUtc,
        new HashSet<string>(KnownArticleIds, StringComparer.Ordinal),
        etag);
}

internal sealed class CosmosPublicationBaselineStore(Container container) : IPublicationBaselineStore
{
    public async Task<PublicationBaseline?> ReadAsync(CancellationToken cancellationToken)
    {
        try
        {
            var response = await container.ReadItemAsync<PublicationBaselineDocument>(
                PublicationBaselineDocument.DocumentId,
                new PartitionKey(PublicationBaselineDocument.DocumentPartitionKey),
                cancellationToken: cancellationToken);
            return response.Resource.ToBaseline(response.ETag);
        }
        catch (CosmosException exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<BaselineWriteResult> CreateAsync(
        PublicationBaseline baseline,
        CancellationToken cancellationToken)
    {
        try
        {
            var response = await container.CreateItemAsync(
                PublicationBaselineDocument.From(baseline),
                new PartitionKey(PublicationBaselineDocument.DocumentPartitionKey),
                cancellationToken: cancellationToken);
            return new(BaselineWriteStatus.Created, response.ETag);
        }
        catch (CosmosException exception) when (exception.StatusCode == HttpStatusCode.Conflict)
        {
            return new(BaselineWriteStatus.Conflict, null);
        }
    }

    public async Task<BaselineWriteResult> ReplaceAsync(
        PublicationBaseline baseline,
        string expectedETag,
        CancellationToken cancellationToken)
    {
        try
        {
            var response = await container.ReplaceItemAsync(
                PublicationBaselineDocument.From(baseline),
                PublicationBaselineDocument.DocumentId,
                new PartitionKey(PublicationBaselineDocument.DocumentPartitionKey),
                new ItemRequestOptions { IfMatchEtag = expectedETag },
                cancellationToken);
            return new(BaselineWriteStatus.Updated, response.ETag);
        }
        catch (CosmosException exception) when (
            exception.StatusCode is HttpStatusCode.PreconditionFailed or HttpStatusCode.NotFound)
        {
            return new(BaselineWriteStatus.Conflict, null);
        }
    }
}
