using Notifications.Functions.Subscriptions;

namespace Notifications.Functions.Tests.Subscriptions;

public sealed class CosmosSubscriptionRepositoryTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 24, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task RegisterAsync_CreatesConsentEvidenceAndStoresOnlyCapabilityHashes()
    {
        var store = new FakeStore();
        var repository = CreateRepository(store);

        var result = await repository.RegisterAsync(WebPushSubscriptionValidatorTests.CreateValid());
        var document = Assert.Single(store.Documents).Value.Document;

        Assert.True(result.Created);
        Assert.Equal(Now, document.ConsentGrantedAtUtc);
        Assert.Equal(Now.AddDays(365), document.ExpiresAtUtc);
        Assert.Equal("baseline-2026-11-26", document.RecoveryEpoch);
        Assert.Equal(365 * 24 * 60 * 60, document.TimeToLiveSeconds);
        Assert.DoesNotContain(result.CancellationCapability!, document.CancellationCapabilityHash, StringComparison.Ordinal);
        Assert.DoesNotContain(result.RecoveryCapability!, document.RecoveryCapabilityHash, StringComparison.Ordinal);
        Assert.Equal(43, result.CancellationCapability!.Length);
        Assert.Equal(43, result.RecoveryCapability!.Length);
    }

    [Fact]
    public async Task DuplicateRegistration_IsIdempotentAndCannotTakeOverOrRecoverCapabilities()
    {
        var store = new FakeStore();
        var repository = CreateRepository(store);
        var first = await repository.RegisterAsync(WebPushSubscriptionValidatorTests.CreateValid());
        var firstDocument = Assert.Single(store.Documents).Value.Document;

        var duplicate = await repository.RegisterAsync(WebPushSubscriptionValidatorTests.CreateValid() with { Auth = Encode(Enumerable.Repeat((byte)7, 16).ToArray()) });

        Assert.False(duplicate.Created);
        Assert.Null(duplicate.CancellationCapability);
        Assert.Same(firstDocument, Assert.Single(store.Documents).Value.Document);
        Assert.NotNull(first.CancellationCapability);
    }

    [Fact]
    public async Task ConcurrentRegistrations_HaveOneWinnerAndDoNotReplaceCapabilities()
    {
        var store = new FakeStore();
        var repository = CreateRepository(store);

        var results = await Task.WhenAll(
            repository.RegisterAsync(WebPushSubscriptionValidatorTests.CreateValid()),
            repository.RegisterAsync(WebPushSubscriptionValidatorTests.CreateValid()));

        Assert.Equal(1, results.Count(result => result.Created));
        Assert.Equal(1, results.Count(result => !result.Created));
        Assert.Single(store.Documents);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task RevokeAsync_AcceptsEitherCapabilityAndDeletesAfterAtomicRevocation(bool useRecovery)
    {
        var store = new FakeStore();
        var repository = CreateRepository(store);
        var created = await repository.RegisterAsync(WebPushSubscriptionValidatorTests.CreateValid());
        var capability = useRecovery ? created.RecoveryCapability! : created.CancellationCapability!;

        await repository.RevokeAsync(created.SubscriptionId!, capability);
        await repository.RevokeAsync(created.SubscriptionId!, capability);

        Assert.Empty(store.Documents);
        Assert.Equal(1, store.ReplaceCalls);
        Assert.Equal("revoked", store.LastReplaced!.Status);
    }

    [Fact]
    public async Task RevokeAsync_InvalidCapabilityDoesNotRevealOrModifySubscription()
    {
        var store = new FakeStore();
        var repository = CreateRepository(store);
        var created = await repository.RegisterAsync(WebPushSubscriptionValidatorTests.CreateValid());

        await repository.RevokeAsync(created.SubscriptionId!, Encode(new byte[32]));

        Assert.Single(store.Documents);
        Assert.Equal(0, store.ReplaceCalls);
    }

    [Fact]
    public async Task ExpirationIsAbsoluteAndBlocksListingAndFinalEligibility()
    {
        var store = new FakeStore();
        var clock = new MutableTimeProvider(Now);
        var repository = new CosmosSubscriptionRepository(store, clock);
        var created = await repository.RegisterAsync(WebPushSubscriptionValidatorTests.CreateValid());
        var document = Assert.Single(store.Documents).Value.Document;
        clock.UtcNow = Now.AddDays(365);

        var page = await repository.ListActivePageAsync("pt-BR", null);
        var eligible = await repository.GetEligibleAsync(created.SubscriptionId!, document.Generation);

        Assert.Empty(page.Items);
        Assert.Null(eligible);
        Assert.Equal(Now.AddDays(365), document.ExpiresAtUtc);
    }

    [Fact]
    public async Task DeleteFailureLeavesLogicallyRevokedRecordIneligibleForRetry()
    {
        var store = new FakeStore { FailDelete = true };
        var repository = CreateRepository(store);
        var created = await repository.RegisterAsync(WebPushSubscriptionValidatorTests.CreateValid());

        await repository.RevokeAsync(created.SubscriptionId!, created.CancellationCapability!);
        var stored = Assert.Single(store.Documents).Value;

        Assert.Equal("revoked", stored.Document.Status);
        Assert.Null(await repository.GetEligibleAsync(created.SubscriptionId!, stored.Document.Generation));
    }

    [Fact]
    public async Task ProviderInvalidation_FailsClosedBeforePhysicalDelete()
    {
        var store = new FakeStore { FailDelete = true };
        var repository = CreateRepository(store);
        var created = await repository.RegisterAsync(WebPushSubscriptionValidatorTests.CreateValid());
        var stored = Assert.Single(store.Documents).Value;

        await repository.InvalidateGenerationAsync(created.SubscriptionId!, stored.Document.Generation, stored.ETag);
        var invalid = Assert.Single(store.Documents).Value;

        Assert.Equal("invalid", invalid.Document.Status);
        Assert.Null(await repository.GetEligibleAsync(created.SubscriptionId!, invalid.Document.Generation));
    }

    [Fact]
    public async Task RotatedRecoveryEpochRejectsPreRevocationBackupAndRequiresPurgeBeforeNewOptIn()
    {
        var store = new FakeStore { FailDelete = true };
        var original = CreateRepository(store);
        var created = await original.RegisterAsync(WebPushSubscriptionValidatorTests.CreateValid());
        var beforeRevocation = Assert.Single(store.Documents).Value;

        await original.RevokeAsync(created.SubscriptionId!, created.CancellationCapability!);
        store.Restore(beforeRevocation);

        var recovered = new CosmosSubscriptionRepository(store, new MutableTimeProvider(Now), "restore-2026-11-27");
        Assert.Empty((await recovered.ListActivePageAsync("pt-BR", null)).Items);
        Assert.Null(await recovered.GetEligibleAsync(created.SubscriptionId!, beforeRevocation.Document.Generation));

        var duplicate = await recovered.RegisterAsync(WebPushSubscriptionValidatorTests.CreateValid());
        Assert.False(duplicate.Created);
        Assert.Null(duplicate.CancellationCapability);
    }

    [Fact]
    public async Task RestoredRecordAfterAbsoluteExpirationRemainsIneligibleEvenWithMatchingEpoch()
    {
        var store = new FakeStore();
        var original = CreateRepository(store);
        var created = await original.RegisterAsync(WebPushSubscriptionValidatorTests.CreateValid());
        var backup = Assert.Single(store.Documents).Value;
        store.Restore(backup);

        var recovered = new CosmosSubscriptionRepository(
            store,
            new MutableTimeProvider(Now.AddDays(366)),
            backup.Document.RecoveryEpoch);

        Assert.Empty((await recovered.ListActivePageAsync("pt-BR", null)).Items);
        Assert.Null(await recovered.GetEligibleAsync(created.SubscriptionId!, backup.Document.Generation));
    }

    [Fact]
    public async Task ConcurrentRevocationsNeverLeaveAnActiveRecord()
    {
        var store = new FakeStore { FailDelete = true };
        var repository = CreateRepository(store);
        var created = await repository.RegisterAsync(WebPushSubscriptionValidatorTests.CreateValid());

        await Task.WhenAll(
            repository.RevokeAsync(created.SubscriptionId!, created.CancellationCapability!),
            repository.RevokeAsync(created.SubscriptionId!, created.CancellationCapability!));

        Assert.DoesNotContain(store.Documents.Values, item => item.Document.Status == "active");
    }

    private static CosmosSubscriptionRepository CreateRepository(FakeStore store) => new(store, new MutableTimeProvider(Now));
    private static string Encode(byte[] value) => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private sealed class MutableTimeProvider(DateTimeOffset value) : TimeProvider
    {
        public DateTimeOffset UtcNow { get; set; } = value;
        public override DateTimeOffset GetUtcNow() => UtcNow;
    }

    private sealed class FakeStore : ISubscriptionDocumentStore
    {
        private int _version;
        public Dictionary<string, StoredSubscriptionDocument> Documents { get; } = [];
        public int ReplaceCalls { get; private set; }
        public SubscriptionDocument? LastReplaced { get; private set; }
        public bool FailDelete { get; init; }

        public Task<StoredSubscriptionPage> ListActivePageAsync(string locale, string recoveryEpoch, DateTimeOffset now, int pageSize, string? continuationToken, CancellationToken cancellationToken)
        {
            var items = Documents.Values.Where(item => item.Document.Locale == locale && item.Document.Status == "active" &&
                item.Document.RecoveryEpoch == recoveryEpoch && item.Document.RevokedAtUtc is null &&
                item.Document.ExpiresAtUtc > now).Take(pageSize).ToArray();
            return Task.FromResult(new StoredSubscriptionPage(items, null));
        }

        public Task<StoredSubscriptionDocument?> ReadAsync(string id, string partitionKey, CancellationToken cancellationToken)
        {
            Documents.TryGetValue(Key(id, partitionKey), out var stored);
            return Task.FromResult(stored);
        }

        public Task<DocumentWriteResult> CreateAsync(SubscriptionDocument document, CancellationToken cancellationToken)
        {
            lock (Documents)
            {
                var key = Key(document.Id, document.PartitionKey);
                if (Documents.ContainsKey(key)) return Task.FromResult(new DocumentWriteResult(SubscriptionMutationStatus.Duplicate, null, 1));
                var etag = NextETag();
                Documents[key] = new(document, etag, 1);
                return Task.FromResult(new DocumentWriteResult(SubscriptionMutationStatus.Created, etag, 1));
            }
        }

        public Task<DocumentWriteResult> ReplaceAsync(SubscriptionDocument document, string expectedETag, CancellationToken cancellationToken)
        {
            lock (Documents)
            {
                ReplaceCalls++;
                var key = Key(document.Id, document.PartitionKey);
                if (!Documents.TryGetValue(key, out var current) || current.ETag != expectedETag)
                    return Task.FromResult(new DocumentWriteResult(SubscriptionMutationStatus.ConcurrencyConflict, null, 1));
                var etag = NextETag();
                LastReplaced = document;
                Documents[key] = new(document, etag, 1);
                return Task.FromResult(new DocumentWriteResult(SubscriptionMutationStatus.Updated, etag, 1));
            }
        }

        public Task<DocumentWriteResult> DeleteAsync(string id, string partitionKey, string expectedETag, CancellationToken cancellationToken)
        {
            var key = Key(id, partitionKey);
            if (FailDelete) return Task.FromResult(new DocumentWriteResult(SubscriptionMutationStatus.ConcurrencyConflict, null, 1));
            if (!Documents.TryGetValue(key, out var current) || current.ETag != expectedETag)
                return Task.FromResult(new DocumentWriteResult(SubscriptionMutationStatus.ConcurrencyConflict, null, 1));
            Documents.Remove(key);
            return Task.FromResult(new DocumentWriteResult(SubscriptionMutationStatus.Deleted, null, 1));
        }

        private string NextETag() => $"etag-{++_version}";
        private static string Key(string id, string partitionKey) => $"{partitionKey}/{id}";
        public void Restore(StoredSubscriptionDocument document) =>
            Documents[Key(document.Document.Id, document.Document.PartitionKey)] = document;
    }
}
