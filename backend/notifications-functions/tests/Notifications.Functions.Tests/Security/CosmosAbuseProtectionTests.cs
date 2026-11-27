using Notifications.Functions.Security;

namespace Notifications.Functions.Tests.Security;

public sealed class CosmosAbuseProtectionTests
{
    private static readonly DateTimeOffset Window = new(2026, 11, 26, 12, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData("register", 4)]
    [InlineData("revoke", 8)]
    public async Task ConditionalCounterEnforcesLimitUnderConcurrency(string operation, int limit)
    {
        var store = new AtomicInMemoryCounterStore();
        var protection = new CosmosAbuseProtection(store);

        var results = await Task.WhenAll(Enumerable.Range(0, limit + 4)
            .Select(_ => protection.TryAcquireAsync(operation, "same-discriminator", Window, CancellationToken.None)));

        Assert.Equal(limit, results.Count(result => result));
        Assert.Equal(4, results.Count(result => !result));
        Assert.Single(store.Documents);
        Assert.Equal(limit, Assert.Single(store.Documents).Value.Count);
    }

    [Fact]
    public async Task NewWindowUsesIndependentCounterWithBoundedTtl()
    {
        var store = new AtomicInMemoryCounterStore();
        var protection = new CosmosAbuseProtection(store);

        Assert.True(await protection.TryAcquireAsync("register", "same", Window, CancellationToken.None));
        Assert.True(await protection.TryAcquireAsync("register", "same", Window.AddSeconds(60), CancellationToken.None));

        Assert.Equal(2, store.Documents.Count);
        Assert.All(store.Documents.Values, document => Assert.Equal(120, document.TimeToLiveSeconds));
    }

    [Fact]
    public async Task StoreFailurePropagatesAndPublicApiCanFailClosed()
    {
        var protection = new CosmosAbuseProtection(new FailingCounterStore());

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            protection.TryAcquireAsync("register", "same", Window, CancellationToken.None));
    }

    private sealed class AtomicInMemoryCounterStore : IRateLimitCounterStore
    {
        private readonly object _gate = new();
        public Dictionary<string, RateLimitDocument> Documents { get; } = [];

        public Task<bool> TryCreateAsync(RateLimitDocument document, CancellationToken cancellationToken)
        {
            lock (_gate)
            {
                if (Documents.ContainsKey(document.Id)) return Task.FromResult(false);
                Documents[document.Id] = document;
                return Task.FromResult(true);
            }
        }

        public Task<bool> TryIncrementBelowAsync(string id, string partitionKey, int limit, CancellationToken cancellationToken)
        {
            lock (_gate)
            {
                if (!Documents.TryGetValue(id, out var document) || document.PartitionKey != partitionKey || document.Count >= limit)
                    return Task.FromResult(false);

                Documents[id] = new RateLimitDocument
                {
                    Id = document.Id,
                    PartitionKey = document.PartitionKey,
                    Operation = document.Operation,
                    Count = document.Count + 1,
                    TimeToLiveSeconds = document.TimeToLiveSeconds,
                };
                return Task.FromResult(true);
            }
        }
    }

    private sealed class FailingCounterStore : IRateLimitCounterStore
    {
        public Task<bool> TryCreateAsync(RateLimitDocument document, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("simulated dependency failure");

        public Task<bool> TryIncrementBelowAsync(string id, string partitionKey, int limit, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("simulated dependency failure");
    }
}
