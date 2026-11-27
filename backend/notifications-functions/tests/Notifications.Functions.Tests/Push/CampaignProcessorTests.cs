using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Notifications.Functions.Configuration;
using Notifications.Functions.Push;
using Notifications.Functions.Subscriptions;
using System.Text.Json;

namespace Notifications.Functions.Tests.Push;

public sealed class CampaignProcessorTests
{
    [Fact]
    public async Task ProcessAsync_SendsCompactPtBrPayloadWithoutSensitiveLogs()
    {
        var subscription = CreateRecord();
        var repository = new FakeRepository([subscription]);
        var transport = new FakeTransport(PushDeliveryStatus.Succeeded);
        var logger = new CollectingLogger<CampaignProcessor>();
        var processor = CreateProcessor(repository, transport, logger);

        await processor.ProcessAsync(new("article-2026-11"), CancellationToken.None);

        var delivery = Assert.Single(transport.Deliveries);
        Assert.Contains("\"lang\":\"pt-BR\"", delivery.Payload, StringComparison.Ordinal);
        Assert.Contains("\"title\":\"Novo artigo\"", delivery.Payload, StringComparison.Ordinal);
        Assert.Contains("\"version\":1", delivery.Payload, StringComparison.Ordinal);
        Assert.Contains("\"expiresAtUtc\":", delivery.Payload, StringComparison.Ordinal);
        using var payload = JsonDocument.Parse(delivery.Payload);
        var root = payload.RootElement;
        Assert.Equal(6, root.EnumerateObject().Count());
        Assert.EndsWith("Z", root.GetProperty("expiresAtUtc").GetString(), StringComparison.Ordinal);
        var expiresAt = root.GetProperty("expiresAtUtc").GetDateTimeOffset();
        Assert.InRange(expiresAt, DateTimeOffset.UtcNow.AddHours(23), DateTimeOffset.UtcNow.AddHours(25));
        Assert.Equal(32, delivery.Topic.Length);
        Assert.DoesNotContain(subscription.Subscription.Endpoint, logger.Text, StringComparison.Ordinal);
        Assert.DoesNotContain(subscription.Subscription.P256Dh, logger.Text, StringComparison.Ordinal);
        Assert.DoesNotContain(subscription.Subscription.Auth, logger.Text, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ProcessAsync_RemovesExpiredSubscriptionWithETag()
    {
        var repository = new FakeRepository([CreateRecord()]);
        var processor = CreateProcessor(
            repository,
            new FakeTransport(PushDeliveryStatus.SubscriptionExpired),
            new CollectingLogger<CampaignProcessor>());

        await processor.ProcessAsync(new("article-2026-11"), CancellationToken.None);

        Assert.Equal(1, repository.InvalidateCalls);
    }

    [Fact]
    public async Task ProcessAsync_DeduplicatesSubscriptionWithinQueueExecution()
    {
        var subscription = CreateRecord();
        var repository = new FakeRepository([subscription, subscription]);
        var transport = new FakeTransport(PushDeliveryStatus.Succeeded);
        var processor = CreateProcessor(repository, transport, new CollectingLogger<CampaignProcessor>());

        await processor.ProcessAsync(new("article-2026-11"), CancellationToken.None);

        Assert.Single(transport.Deliveries);
    }

    [Fact]
    public async Task ProcessAsync_CalculatesExpirationImmediatelyBeforeEachSend()
    {
        var createdAt = new DateTimeOffset(2026, 11, 26, 12, 0, 0, TimeSpan.Zero);
        var repository = new FakeRepository([CreateRecord("first", createdAt), CreateRecord("second", createdAt)]);
        var transport = new FakeTransport(PushDeliveryStatus.Succeeded);
        var clock = new AdvancingTimeProvider(new DateTimeOffset(2026, 11, 27, 12, 0, 0, TimeSpan.Zero));
        var processor = CreateProcessor(
            repository,
            transport,
            new CollectingLogger<CampaignProcessor>(),
            clock);

        await processor.ProcessAsync(new("article-2026-11"), CancellationToken.None);

        Assert.Equal(2, transport.Deliveries.Count);
        var expirations = transport.Deliveries
            .Select(delivery =>
            {
                using var document = JsonDocument.Parse(delivery.Payload);
                return document.RootElement.GetProperty("expiresAtUtc").GetDateTimeOffset();
            })
            .ToArray();
        Assert.Equal(TimeSpan.FromMinutes(4), expirations[1] - expirations[0]);
    }

    [Fact]
    public async Task ProcessAsync_ThrowsAfterTransientFailuresSoQueueRetryIsBoundedByHost()
    {
        var processor = CreateProcessor(
            new FakeRepository([CreateRecord()]),
            new FakeTransport(PushDeliveryStatus.TransientFailure),
            new CollectingLogger<CampaignProcessor>());

        await Assert.ThrowsAsync<CampaignTransientFailureException>(() =>
            processor.ProcessAsync(new("article-2026-11"), CancellationToken.None));
    }

    [Fact]
    public async Task ProcessAsync_ProcessesOneBoundedPageAndReturnsContinuation()
    {
        var repository = new FakeRepository([CreateRecord()], "next-page");
        var processor = CreateProcessor(
            repository,
            new FakeTransport(PushDeliveryStatus.Succeeded),
            new CollectingLogger<CampaignProcessor>());

        var result = await processor.ProcessAsync(
            new CampaignWorkItem("article-2026-11", "current-page"),
            CancellationToken.None);

        Assert.Equal("current-page", repository.ReceivedContinuationToken);
        Assert.Equal("next-page", result.ContinuationToken);
    }

    [Fact]
    public async Task ProcessAsync_DoesNotSendWhenRevocationWinsFinalEligibilityCheck()
    {
        var repository = new FakeRepository([CreateRecord()]) { Eligible = false };
        var transport = new FakeTransport(PushDeliveryStatus.Succeeded);
        var processor = CreateProcessor(repository, transport, new CollectingLogger<CampaignProcessor>());

        await processor.ProcessAsync(new("article-2026-11"), CancellationToken.None);

        Assert.Empty(transport.Deliveries);
    }

    [Fact]
    public async Task ProcessAsync_PersistenceFailureAfterTransportLeavesSendingAndReplayDoesNotSendAgain()
    {
        var subscriptions = new FakeRepository([CreateRecord()]);
        var transport = new FakeTransport(PushDeliveryStatus.OutcomeUnknown);
        var store = new InMemoryCampaignDocumentStore();
        var durable = new CampaignRepository(store);
        var failing = new FailingCompletionCampaignRepository(durable);
        var processor = CreateProcessor(
            subscriptions,
            transport,
            new CollectingLogger<CampaignProcessor>(),
            campaignRepository: failing);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            processor.ProcessAsync(new("article-2026-11"), CancellationToken.None));
        await processor.ProcessAsync(new("article-2026-11"), CancellationToken.None);

        Assert.Single(transport.Deliveries);
        Assert.Equal(DeliveryStatus.Sending, Assert.Single(store.Deliveries).Status);
    }

    [Theory]
    [InlineData("https://fcm.googleapis.com/fcm/send/test", true)]
    [InlineData("https://updates.push.services.mozilla.com/wpush/v2/test", true)]
    [InlineData("https://web.push.apple.com/test", true)]
    [InlineData("https://attacker.example.test/push", false)]
    [InlineData("https://127.0.0.1/push", false)]
    [InlineData("https://fcm.googleapis.com.attacker.example/push", false)]
    public void PushEndpointPolicy_RestrictsDestinations(string endpoint, bool expected)
    {
        Assert.Equal(expected, PushEndpointPolicy.IsAllowed(endpoint));
    }

    [Theory]
    [InlineData("https://rodri-oliveira-dev.github.io/", true)]
    [InlineData("https://rodri-oliveira-dev.github.io/case-studies/adr-guard/", true)]
    [InlineData("https://rodri-oliveira-dev.github.io/case-studies/../admin/", false)]
    [InlineData("https://rodri-oliveira-dev.github.io/case-studies/adr-guard/?next=external", false)]
    [InlineData("https://rodri-oliveira-dev.github.io/en/case-studies/adr-guard/", false)]
    [InlineData("https://attacker.example.test/article", false)]
    public void ConfigurationCampaignCatalog_UsesSameClickUrlAllowlistAsServiceWorker(string url, bool expected)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["NotificationCampaigns:test:Title"] = "Título",
                ["NotificationCampaigns:test:Body"] = "Corpo",
                ["NotificationCampaigns:test:Url"] = url,
            })
            .Build();
        var catalog = new ConfigurationCampaignCatalog(configuration);

        Assert.Equal(expected, catalog.TryGet("test", out _));
    }

    private static CampaignProcessor CreateProcessor(
        FakeRepository repository,
        FakeTransport transport,
        ILogger<CampaignProcessor> logger,
        TimeProvider? timeProvider = null,
        ICampaignRepository? campaignRepository = null) => new(
            new FakeCampaignCatalog(),
            campaignRepository ?? new CampaignRepository(new InMemoryCampaignDocumentStore()),
            repository,
            new FakeVapidKeyProvider(),
            transport,
            logger,
            Options.Create(new WebPushOptions { PushTimeToLiveSeconds = 86400 }),
            timeProvider ?? TimeProvider.System);

    private static SubscriptionRecord CreateRecord(string endpointSuffix = "test-only", DateTimeOffset? createdAt = null)
    {
        var subscription = Subscriptions.WebPushSubscriptionValidatorTests.CreateValid() with
        {
            Endpoint = $"https://fcm.googleapis.com/fcm/send/{endpointSuffix}",
        };
        var (id, partitionKey) = WebPushSubscriptionValidator.DeriveIdentity(subscription.Endpoint);
        var created = createdAt ?? DateTimeOffset.UtcNow;
        return new(id, partitionKey, subscription, created, created.AddDays(365),
            "generation-test", created, created, "etag-test");
    }

    private sealed class FakeCampaignCatalog : ICampaignCatalog
    {
        public bool TryGet(string campaignId, out CampaignDefinition? campaign)
        {
            campaign = new(
                "Novo artigo",
                "Há um novo artigo em português no portfólio.",
                "https://rodri-oliveira-dev.github.io/case-studies/adr-guard/");
            return true;
        }
    }

    private sealed class FakeVapidKeyProvider : IVapidKeyProvider
    {
        public Task<VapidCredentials> GetAsync(CancellationToken cancellationToken) =>
            Task.FromResult(new VapidCredentials("https://example.test", "test-public", "test-private"));
    }

    private sealed class FakeTransport(PushDeliveryStatus status) : IWebPushTransport
    {
        public List<(string Payload, string Topic)> Deliveries { get; } = [];

        public Task<PushDeliveryStatus> SendAsync(
            SubscriptionRecord subscription,
            string payload,
            string topic,
            VapidCredentials credentials,
            CancellationToken cancellationToken)
        {
            Deliveries.Add((payload, topic));
            return Task.FromResult(status);
        }
    }

    private sealed class AdvancingTimeProvider(DateTimeOffset current) : TimeProvider
    {
        private DateTimeOffset _current = current;

        public override DateTimeOffset GetUtcNow()
        {
            var result = _current;
            _current = _current.AddMinutes(1);
            return result;
        }
    }

    private sealed class FakeRepository(
        IReadOnlyList<SubscriptionRecord> records,
        string? nextContinuationToken = null) : ISubscriptionRepository
    {
        public int InvalidateCalls { get; private set; }
        public string? ReceivedContinuationToken { get; private set; }
        public bool Eligible { get; init; } = true;

        public Task<SubscriptionPage> ListActivePageAsync(
            string locale,
            string? continuationToken,
            CancellationToken cancellationToken = default)
        {
            ReceivedContinuationToken = continuationToken;
            return Task.FromResult(new SubscriptionPage(records, nextContinuationToken));
        }

        public Task<SubscriptionRecord?> GetEligibleAsync(string id, string generation, CancellationToken cancellationToken = default) =>
            Task.FromResult(Eligible ? records.FirstOrDefault(record => record.Id == id && record.Generation == generation) : null);

        public Task<RegistrationResult> RegisterAsync(WebPushSubscriptionInput subscription, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task RevokeAsync(string id, string capability, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<SubscriptionMutationResult> InvalidateGenerationAsync(string id, string generation, string expectedETag, CancellationToken cancellationToken = default)
        {
            InvalidateCalls++;
            return Task.FromResult(new SubscriptionMutationResult(
                SubscriptionMutationStatus.Deleted,
                "id",
                "partition",
                null,
                1));
        }

        public Task<SubscriptionMutationResult> DeleteGenerationAsync(string id, string generation, string expectedETag, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(new SubscriptionMutationResult(
                SubscriptionMutationStatus.Deleted,
                "id",
                "partition",
                null,
                1));
        }
    }

    private sealed class CollectingLogger<T> : ILogger<T>
    {
        private readonly List<string> _messages = [];
        public string Text => string.Join(Environment.NewLine, _messages);
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            _messages.Add(formatter(state, exception));
    }

    private sealed class FailingCompletionCampaignRepository(ICampaignRepository inner) : ICampaignRepository
    {
        private int _failuresRemaining = 1;
        public Task<CampaignWriteResult> CreateAsync(CampaignDefinition campaign, CancellationToken cancellationToken) => inner.CreateAsync(campaign, cancellationToken);
        public Task<StoredCampaign?> GetAsync(string campaignId, CancellationToken cancellationToken) => inner.GetAsync(campaignId, cancellationToken);
        public Task<CampaignDeliveryClaim?> TryClaimAsync(CampaignDefinition campaign, SubscriptionRecord subscription, DateTimeOffset now, CancellationToken cancellationToken) => inner.TryClaimAsync(campaign, subscription, now, cancellationToken);
        public Task<CampaignDeliveryClaim?> BeginTransportAsync(CampaignDeliveryClaim claim, DateTimeOffset now, CancellationToken cancellationToken) => inner.BeginTransportAsync(claim, now, cancellationToken);
        public Task<CampaignWriteResult> CompleteAsync(CampaignDeliveryClaim claim, DeliveryStatus outcome, DateTimeOffset now, CancellationToken cancellationToken)
        {
            if (Interlocked.Decrement(ref _failuresRemaining) >= 0)
                throw new InvalidOperationException("simulated post-transport persistence failure");
            return inner.CompleteAsync(claim, outcome, now, cancellationToken);
        }
    }
}
