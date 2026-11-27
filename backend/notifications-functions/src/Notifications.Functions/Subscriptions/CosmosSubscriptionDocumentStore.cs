using System.Net;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Options;
using Notifications.Functions.Configuration;

namespace Notifications.Functions.Subscriptions;

internal sealed class CosmosSubscriptionDocumentStore : ISubscriptionDocumentStore
{
    private readonly Container _container;

    public CosmosSubscriptionDocumentStore(Container container)
    {
        _container = container ?? throw new ArgumentNullException(nameof(container));
    }

    public async Task<StoredSubscriptionPage> ListActivePageAsync(
        string locale,
        string recoveryEpoch,
        DateTimeOffset now,
        int pageSize,
        string? continuationToken,
        CancellationToken cancellationToken)
    {
        var query = new QueryDefinition(
                "SELECT * FROM c WHERE c.type = 'subscription' AND c.locale = @locale AND c.recoveryEpoch = @recoveryEpoch AND c.status = 'active' AND c.revokedAtUtc = null AND c.expiresAtUtc > @now")
            .WithParameter("@locale", locale)
            .WithParameter("@recoveryEpoch", recoveryEpoch)
            .WithParameter("@now", now);
        using var iterator = _container.GetItemQueryIterator<SubscriptionDocument>(
            query,
            continuationToken,
            requestOptions: new QueryRequestOptions { MaxItemCount = pageSize });
        var response = await iterator.ReadNextAsync(cancellationToken);
        var charge = response.RequestCharge / Math.Max(response.Count, 1);
        var items = response
            .Select(document => new StoredSubscriptionDocument(document, document.ETag ?? string.Empty, charge))
            .ToArray();
        return new(items, response.ContinuationToken);
    }

    public async Task<StoredSubscriptionDocument?> ReadAsync(
        string id,
        string partitionKey,
        CancellationToken cancellationToken)
    {
        try
        {
            var response = await _container.ReadItemAsync<SubscriptionDocument>(
                id,
                new PartitionKey(partitionKey),
                cancellationToken: cancellationToken);

            return new(response.Resource, response.ETag, response.RequestCharge);
        }
        catch (CosmosException exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<DocumentWriteResult> CreateAsync(
        SubscriptionDocument document,
        CancellationToken cancellationToken)
    {
        try
        {
            var response = await _container.CreateItemAsync(
                document,
                new PartitionKey(document.PartitionKey),
                cancellationToken: cancellationToken);

            return new(SubscriptionMutationStatus.Created, response.ETag, response.RequestCharge);
        }
        catch (CosmosException exception) when (exception.StatusCode == HttpStatusCode.Conflict)
        {
            return new(SubscriptionMutationStatus.Duplicate, null, exception.RequestCharge);
        }
    }

    public async Task<DocumentWriteResult> ReplaceAsync(
        SubscriptionDocument document,
        string expectedETag,
        CancellationToken cancellationToken)
    {
        try
        {
            var response = await _container.ReplaceItemAsync(
                document,
                document.Id,
                new PartitionKey(document.PartitionKey),
                new ItemRequestOptions { IfMatchEtag = expectedETag },
                cancellationToken);
            return new(SubscriptionMutationStatus.Updated, response.ETag, response.RequestCharge);
        }
        catch (CosmosException exception) when (exception.StatusCode == HttpStatusCode.PreconditionFailed)
        {
            return new(SubscriptionMutationStatus.ConcurrencyConflict, null, exception.RequestCharge);
        }
        catch (CosmosException exception) when (
            exception.StatusCode == HttpStatusCode.NotFound)
        {
            return new(SubscriptionMutationStatus.ConcurrencyConflict, null, exception.RequestCharge);
        }
    }

    public async Task<DocumentWriteResult> DeleteAsync(
        string id,
        string partitionKey,
        string expectedETag,
        CancellationToken cancellationToken)
    {
        try
        {
            var response = await _container.DeleteItemAsync<SubscriptionDocument>(
                id,
                new PartitionKey(partitionKey),
                new ItemRequestOptions { IfMatchEtag = expectedETag },
                cancellationToken);

            return new(SubscriptionMutationStatus.Deleted, response.ETag, response.RequestCharge);
        }
        catch (CosmosException exception) when (exception.StatusCode == HttpStatusCode.PreconditionFailed)
        {
            return new(SubscriptionMutationStatus.ConcurrencyConflict, null, exception.RequestCharge);
        }
        catch (CosmosException exception) when (exception.StatusCode == HttpStatusCode.NotFound)
        {
            return new(SubscriptionMutationStatus.NotFound, null, exception.RequestCharge);
        }
    }
}
