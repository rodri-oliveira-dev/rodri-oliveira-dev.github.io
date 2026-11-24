using System.Net;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Options;
using Notifications.Functions.Configuration;

namespace Notifications.Functions.Subscriptions;

internal sealed class CosmosSubscriptionDocumentStore : ISubscriptionDocumentStore
{
    private readonly Container _container;

    public CosmosSubscriptionDocumentStore(CosmosClient client, IOptions<CosmosOptions> options)
    {
        ArgumentNullException.ThrowIfNull(client);
        ArgumentNullException.ThrowIfNull(options);

        _container = client.GetContainer(
            options.Value.CosmosDatabaseName,
            options.Value.CosmosContainerName);
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

    public async Task<DocumentWriteResult> UpsertAsync(
        SubscriptionDocument document,
        string? expectedETag,
        CancellationToken cancellationToken)
    {
        try
        {
            var response = await _container.UpsertItemAsync(
                document,
                new PartitionKey(document.PartitionKey),
                new ItemRequestOptions { IfMatchEtag = expectedETag },
                cancellationToken);

            var status = response.StatusCode == HttpStatusCode.Created
                ? SubscriptionMutationStatus.Created
                : SubscriptionMutationStatus.Updated;
            return new(status, response.ETag, response.RequestCharge);
        }
        catch (CosmosException exception) when (exception.StatusCode == HttpStatusCode.PreconditionFailed)
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
