using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using Notifications.Functions.Push;
using Notifications.Functions.Subscriptions;

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

        await processor.ProcessAsync("article-2026-11", CancellationToken.None);

        var delivery = Assert.Single(transport.Deliveries);
        Assert.Contains("\"lang\":\"pt-BR\"", delivery.Payload, StringComparison.Ordinal);
        Assert.Contains("\"title\":\"Novo artigo\"", delivery.Payload, StringComparison.Ordinal);
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

        await processor.ProcessAsync("article-2026-11", CancellationToken.None);

        Assert.Equal(1, repository.DeleteCalls);
    }

    [Fact]
    public async Task ProcessAsync_DeduplicatesSubscriptionWithinQueueExecution()
    {
        var subscription = CreateRecord();
        var repository = new FakeRepository([subscription, subscription]);
        var transport = new FakeTransport(PushDeliveryStatus.Succeeded);
        var processor = CreateProcessor(repository, transport, new CollectingLogger<CampaignProcessor>());

        await processor.ProcessAsync("article-2026-11", CancellationToken.None);

        Assert.Single(transport.Deliveries);
    }

    [Fact]
    public async Task ProcessAsync_ThrowsAfterTransientFailuresSoQueueRetryIsBoundedByHost()
    {
        var processor = CreateProcessor(
            new FakeRepository([CreateRecord()]),
            new FakeTransport(PushDeliveryStatus.TransientFailure),
            new CollectingLogger<CampaignProcessor>());

        await Assert.ThrowsAsync<CampaignTransientFailureException>(() =>
            processor.ProcessAsync("article-2026-11", CancellationToken.None));
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

    [Fact]
    public void ConfigurationCampaignCatalog_RejectsExternalClickUrl()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["NotificationCampaigns:test:Title"] = "Título",
                ["NotificationCampaigns:test:Body"] = "Corpo",
                ["NotificationCampaigns:test:Url"] = "https://attacker.example.test/article",
            })
            .Build();
        var catalog = new ConfigurationCampaignCatalog(configuration);

        Assert.False(catalog.TryGet("test", out _));
    }

    private static CampaignProcessor CreateProcessor(
        FakeRepository repository,
        FakeTransport transport,
        ILogger<CampaignProcessor> logger) => new(
            new FakeCampaignCatalog(),
            repository,
            new FakeVapidKeyProvider(),
            transport,
            logger);

    private static SubscriptionRecord CreateRecord()
    {
        var subscription = Subscriptions.WebPushSubscriptionValidatorTests.CreateValid() with
        {
            Endpoint = "https://fcm.googleapis.com/fcm/send/test-only",
        };
        var (id, partitionKey) = WebPushSubscriptionValidator.DeriveIdentity(subscription.Endpoint);
        return new(id, partitionKey, subscription, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, "etag-test");
    }

    private sealed class FakeCampaignCatalog : ICampaignCatalog
    {
        public bool TryGet(string campaignId, out CampaignDefinition? campaign)
        {
            campaign = new(
                "Novo artigo",
                "Há um novo artigo em português no portfólio.",
                "https://rodri-oliveira-dev.github.io/artigos/exemplo/");
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

    private sealed class FakeRepository(IReadOnlyList<SubscriptionRecord> records) : ISubscriptionRepository
    {
        public int DeleteCalls { get; private set; }

        public async IAsyncEnumerable<SubscriptionRecord> ListActiveAsync(
            string locale,
            [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            foreach (var record in records)
            {
                yield return record;
                await Task.Yield();
            }
        }

        public Task<SubscriptionRecord?> GetAsync(string endpoint, CancellationToken cancellationToken = default) =>
            Task.FromResult<SubscriptionRecord?>(null);

        public Task<SubscriptionMutationResult> CreateAsync(WebPushSubscriptionInput subscription, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<SubscriptionMutationResult> UpsertAsync(WebPushSubscriptionInput subscription, string? expectedETag, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public Task<SubscriptionMutationResult> DeleteAsync(string endpoint, string expectedETag, CancellationToken cancellationToken = default)
        {
            DeleteCalls++;
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
}
