using System.Net;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Azure.Cosmos;
using Newtonsoft.Json;
using Notifications.Functions.Configuration;
using Notifications.Functions.Subscriptions;

namespace Notifications.Functions.Security;

public interface IAbuseProtection
{
    Task<bool> TryAcquireAsync(string operation, string discriminator, DateTimeOffset now, CancellationToken cancellationToken);
}

public interface IApiConcurrencyLimiter
{
    Task<bool> TryEnterAsync(CancellationToken cancellationToken);
    void Exit();
}

internal sealed class ApiConcurrencyLimiter : IApiConcurrencyLimiter
{
    private readonly SemaphoreSlim _semaphore;

    public ApiConcurrencyLimiter(Microsoft.Extensions.Options.IOptions<PublicApiOptions> options)
    {
        _semaphore = new(options.Value.MaximumConcurrentRequestsPerInstance);
    }

    public Task<bool> TryEnterAsync(CancellationToken cancellationToken) => _semaphore.WaitAsync(0, cancellationToken);
    public void Exit() => _semaphore.Release();
}

internal sealed class CosmosAbuseProtection(Container container) : IAbuseProtection
{
    private const int WindowSeconds = 60;
    private const int ShardCount = 16;

    public async Task<bool> TryAcquireAsync(string operation, string discriminator, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var limit = operation == "register" ? 4 : 8;
        var window = now.ToUnixTimeSeconds() / WindowSeconds;
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes($"{operation}:{discriminator}"));
        var shard = digest[0] % ShardCount;
        var id = $"rate-{operation}-{window}-{shard}";
        var partitionKey = id;
        var document = new RateLimitDocument
        {
            Id = id,
            PartitionKey = partitionKey,
            Operation = operation,
            Count = 1,
            TimeToLiveSeconds = WindowSeconds * 2,
        };

        try
        {
            await container.CreateItemAsync(document, new PartitionKey(partitionKey), cancellationToken: cancellationToken);
            return true;
        }
        catch (CosmosException exception) when (exception.StatusCode == HttpStatusCode.Conflict)
        {
            try
            {
                await container.PatchItemAsync<RateLimitDocument>(
                    id,
                    new PartitionKey(partitionKey),
                    [PatchOperation.Increment("/count", 1)],
                    new PatchItemRequestOptions { FilterPredicate = $"FROM c WHERE c.count < {limit}" },
                    cancellationToken);
                return true;
            }
            catch (CosmosException patchException) when (
                patchException.StatusCode is HttpStatusCode.PreconditionFailed or HttpStatusCode.NotFound)
            {
                return false;
            }
        }
    }

    private sealed class RateLimitDocument
    {
        [JsonProperty("id")] public required string Id { get; init; }
        [JsonProperty("partitionKey")] public required string PartitionKey { get; init; }
        [JsonProperty("type")] public string Type { get; init; } = "rate-limit";
        [JsonProperty("operation")] public required string Operation { get; init; }
        [JsonProperty("count")] public required int Count { get; init; }
        [JsonProperty("ttl")] public required int TimeToLiveSeconds { get; init; }
    }
}
