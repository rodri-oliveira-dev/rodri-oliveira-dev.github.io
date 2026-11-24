using Notifications.Functions.Subscriptions;

namespace Notifications.Functions.Tests.Subscriptions;

public sealed class CosmosSubscriptionRepositoryTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 24, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task CreateAsync_ReturnsDuplicateWithoutOverwritingExistingSubscription()
    {
        var store = new FakeSubscriptionDocumentStore();
        var repository = CreateRepository(store);
        var subscription = WebPushSubscriptionValidatorTests.CreateValid();

        var created = await repository.CreateAsync(subscription);
        var duplicate = await repository.CreateAsync(subscription);

        Assert.Equal(SubscriptionMutationStatus.Created, created.Status);
        Assert.Equal(SubscriptionMutationStatus.Duplicate, duplicate.Status);
        Assert.Equal(created.Id, duplicate.Id);
        Assert.Single(store.Documents);
    }

    [Fact]
    public async Task UpsertAsync_UsesETagAndPreservesCreationTimestamp()
    {
        var store = new FakeSubscriptionDocumentStore();
        var repository = CreateRepository(store);
        var subscription = WebPushSubscriptionValidatorTests.CreateValid();
        var created = await repository.CreateAsync(subscription);

        var updated = await repository.UpsertAsync(
            subscription with { ConsentVersion = "privacy-v2" },
            created.ETag);
        var stored = await repository.GetAsync(subscription.Endpoint);

        Assert.Equal(SubscriptionMutationStatus.Updated, updated.Status);
        Assert.NotNull(stored);
        Assert.Equal("privacy-v2", stored.Subscription.ConsentVersion);
        Assert.Equal(Now, stored.CreatedAtUtc);
        Assert.Equal(Now, stored.UpdatedAtUtc);
    }

    [Fact]
    public async Task UpsertAndDelete_ReturnConcurrencyConflictForStaleETag()
    {
        var store = new FakeSubscriptionDocumentStore();
        var repository = CreateRepository(store);
        var subscription = WebPushSubscriptionValidatorTests.CreateValid();
        await repository.CreateAsync(subscription);

        var update = await repository.UpsertAsync(subscription, "stale-etag");
        var delete = await repository.DeleteAsync(subscription.Endpoint, "stale-etag");

        Assert.Equal(SubscriptionMutationStatus.ConcurrencyConflict, update.Status);
        Assert.Equal(SubscriptionMutationStatus.ConcurrencyConflict, delete.Status);
        Assert.Single(store.Documents);
    }

    private static CosmosSubscriptionRepository CreateRepository(FakeSubscriptionDocumentStore store) =>
        new(store, new FixedTimeProvider(Now));

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    private sealed class FakeSubscriptionDocumentStore : ISubscriptionDocumentStore
    {
        private int _version;
        public Dictionary<string, StoredSubscriptionDocument> Documents { get; } = [];

        public Task<StoredSubscriptionDocument?> ReadAsync(
            string id,
            string partitionKey,
            CancellationToken cancellationToken)
        {
            Documents.TryGetValue(Key(id, partitionKey), out var stored);
            return Task.FromResult(stored);
        }

        public Task<DocumentWriteResult> CreateAsync(
            SubscriptionDocument document,
            CancellationToken cancellationToken)
        {
            var key = Key(document.Id, document.PartitionKey);
            if (Documents.ContainsKey(key))
            {
                return Task.FromResult(new DocumentWriteResult(SubscriptionMutationStatus.Duplicate, null, 1));
            }

            var etag = NextETag();
            Documents[key] = new(document, etag, 1);
            return Task.FromResult(new DocumentWriteResult(SubscriptionMutationStatus.Created, etag, 1));
        }

        public Task<DocumentWriteResult> UpsertAsync(
            SubscriptionDocument document,
            string? expectedETag,
            CancellationToken cancellationToken)
        {
            var key = Key(document.Id, document.PartitionKey);
            if (Documents.TryGetValue(key, out var stored) && expectedETag != stored.ETag)
            {
                return Task.FromResult(new DocumentWriteResult(SubscriptionMutationStatus.ConcurrencyConflict, null, 1));
            }

            var status = stored is null ? SubscriptionMutationStatus.Created : SubscriptionMutationStatus.Updated;
            var etag = NextETag();
            Documents[key] = new(document, etag, 1);
            return Task.FromResult(new DocumentWriteResult(status, etag, 1));
        }

        public Task<DocumentWriteResult> DeleteAsync(
            string id,
            string partitionKey,
            string expectedETag,
            CancellationToken cancellationToken)
        {
            var key = Key(id, partitionKey);
            if (!Documents.TryGetValue(key, out var stored))
            {
                return Task.FromResult(new DocumentWriteResult(SubscriptionMutationStatus.NotFound, null, 1));
            }

            if (stored.ETag != expectedETag)
            {
                return Task.FromResult(new DocumentWriteResult(SubscriptionMutationStatus.ConcurrencyConflict, null, 1));
            }

            Documents.Remove(key);
            return Task.FromResult(new DocumentWriteResult(SubscriptionMutationStatus.Deleted, null, 1));
        }

        private string NextETag() => $"etag-{++_version}";
        private static string Key(string id, string partitionKey) => $"{partitionKey}/{id}";
    }
}
