using Microsoft.Extensions.Logging.Abstractions;
using Notifications.Functions.Publications;
using Notifications.Functions.Push;

namespace Notifications.Functions.Tests.Push;

public sealed class CampaignEnqueueReconciliationTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 27, 18, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData(403, 1)]
    [InlineData(429, 2)]
    [InlineData(503, 3)]
    [InlineData(400, 5)]
    public void EnqueueFailuresAreClassifiedWithoutLoggingResponseContent(
        int status,
        int expected) =>
        Assert.Equal(expected, (int)CampaignEnqueueFailureClassifier.FromHttpStatus(status));

    [Fact]
    public async Task ConcurrentClaimsProduceSingleEnqueueOwner()
    {
        var repository = await CreateRepositoryAsync();
        var candidate = Assert.Single(await repository.ListEnqueueCandidatesAsync(Now, 3, 25, CancellationToken.None));

        var claims = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ =>
            repository.TryClaimEnqueueAsync(candidate, Now, TimeSpan.FromMinutes(10), CancellationToken.None)));

        Assert.Single(claims, claim => claim is not null);
    }

    [Fact]
    public async Task ActiveLeaseDoesNotConsumeCandidateLimit()
    {
        var store = new InMemoryCampaignDocumentStore();
        var repository = new CampaignRepository(store);
        await repository.CreateAsync(CreateCampaign("article-1"), CancellationToken.None);
        await repository.CreateAsync(CreateCampaign("article-2"), CancellationToken.None);
        var first = Assert.Single((await repository.ListEnqueueCandidatesAsync(Now, 3, 1, CancellationToken.None)));
        Assert.NotNull(await repository.TryClaimEnqueueAsync(
            first, Now, TimeSpan.FromMinutes(10), CancellationToken.None));

        var available = Assert.Single(await repository.ListEnqueueCandidatesAsync(Now, 3, 1, CancellationToken.None));

        Assert.NotEqual(first.Definition.CampaignId, available.Definition.CampaignId);
    }

    [Fact]
    public async Task TransientAndUnknownFailuresUseBoundedBackoffAndEventuallyExhaust()
    {
        var repository = await CreateRepositoryAsync();
        var options = new CampaignReconciliationOptions(
            MaximumAttempts: 3,
            InitialBackoff: TimeSpan.FromSeconds(30),
            MaximumBackoff: TimeSpan.FromMinutes(1));

        Assert.Equal(TimeSpan.FromSeconds(30), CampaignReconciliationService.CalculateBackoff(1, options));
        Assert.Equal(TimeSpan.FromMinutes(1), CampaignReconciliationService.CalculateBackoff(3, options));

        var current = Now;
        foreach (var attempt in Enumerable.Range(1, 3))
        {
            var candidate = Assert.Single(await repository.ListEnqueueCandidatesAsync(current, 3, 25, CancellationToken.None));
            var claim = Assert.IsType<CampaignEnqueueClaim>(await repository.TryClaimEnqueueAsync(
                candidate, current, TimeSpan.FromMinutes(10), CancellationToken.None));
            var failure = attempt == 1
                ? CampaignEnqueueFailure.TimeoutOrUnknown
                : CampaignEnqueueFailure.Transient;
            var next = current.Add(CampaignReconciliationService.CalculateBackoff(attempt, options));
            var completed = await repository.CompleteEnqueueAsync(
                claim, failure, current, next, 3, CancellationToken.None);
            Assert.Equal(CampaignWriteStatus.Updated, completed.Status);
            current = next;
        }

        Assert.Empty(await repository.ListEnqueueCandidatesAsync(current.AddDays(1), 3, 25, CancellationToken.None));
    }

    [Fact]
    public async Task ReplayAfterSuccessfulEnqueueDoesNotClaimAgain()
    {
        var repository = await CreateRepositoryAsync();
        var candidate = Assert.Single(await repository.ListEnqueueCandidatesAsync(Now, 3, 25, CancellationToken.None));
        var claim = Assert.IsType<CampaignEnqueueClaim>(await repository.TryClaimEnqueueAsync(
            candidate, Now, TimeSpan.FromMinutes(10), CancellationToken.None));

        await repository.CompleteEnqueueAsync(
            claim, CampaignEnqueueFailure.None, Now, null, 3, CancellationToken.None);

        Assert.Empty(await repository.ListEnqueueCandidatesAsync(Now.AddDays(1), 3, 25, CancellationToken.None));
    }

    [Fact]
    public async Task ReconciliationEnforcesGlobalRoundLimitAndPtBrEligibility()
    {
        var store = new InMemoryCampaignDocumentStore();
        var repository = new CampaignRepository(store);
        var articles = Enumerable.Range(0, 30).Select(index => new PublishedArticle(
            JsonArticleCatalogReader.DeriveArticleId(
                ArticleOrigin.LinkedIn,
                "pt-BR",
                $"https://www.linkedin.com/pulse/article-{index}"),
            ArticleOrigin.LinkedIn,
            "pt-BR",
            $"https://www.linkedin.com/pulse/article-{index}",
            $"Artigo {index}",
            "Descrição")).ToArray();
        foreach (var article in articles)
        {
            await repository.CreateAsync(
                CampaignDefinition.FromArticle(article, new string('a', 40), 42, Now),
                CancellationToken.None);
        }

        var linkedIn = System.Text.Json.JsonSerializer.Serialize(articles.Select(article => new
        {
            title = article.Title,
            description = article.Description,
            finalUrl = article.CanonicalUrl,
        }));
        var revision = new PublishedRevision(
            new string('a', 40), 42, Now, "refs/heads/main", PublicationConclusion.Succeeded, true,
            new PublicationCatalogSnapshot(linkedIn, "[]", "[]"));
        var logger = new CollectingLogger<CampaignReconciliationService>();
        var service = new CampaignReconciliationService(
            new ReplayPublicationCoordinator(),
            new JsonArticleCatalogReader(),
            new PtBrNotificationEligibilityPolicy(),
            repository,
            new FixedTimeProvider(Now),
            logger);

        var result = await service.PrepareAsync(
            revision,
            new CampaignReconciliationOptions(MaximumCampaignsPerRound: 25),
            CancellationToken.None);

        Assert.True(result.ProcessingLimitReached);
        Assert.Equal(25, result.ClaimedCampaigns);
        Assert.Equal(30, result.DetectedByLocale["pt-BR"]);
        Assert.DoesNotContain(result.Manifest, item => string.IsNullOrWhiteSpace(item.CampaignId));
        Assert.DoesNotContain("linkedin.com", logger.Text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(result.Manifest[0].CampaignId, logger.Text, StringComparison.Ordinal);
    }

    [Fact]
    public async Task SupersededPublicationFailsBeforeAnyCampaignClaim()
    {
        var store = new InMemoryCampaignDocumentStore();
        var repository = new CampaignRepository(store);
        await repository.CreateAsync(CampaignPersistenceTests.CreateCampaign(), CancellationToken.None);
        var service = new CampaignReconciliationService(
            new ReplayPublicationCoordinator(PublicationProcessingStatus.Superseded),
            new JsonArticleCatalogReader(),
            new PtBrNotificationEligibilityPolicy(),
            repository,
            new FixedTimeProvider(Now),
            NullLogger<CampaignReconciliationService>.Instance);
        var revision = new PublishedRevision(
            new string('a', 40), 1, Now, "refs/heads/main", PublicationConclusion.Succeeded, true,
            new PublicationCatalogSnapshot("[]", "[]", "[]"));

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.PrepareAsync(
            revision, new CampaignReconciliationOptions(), CancellationToken.None));

        Assert.Equal(CampaignEnqueueStatus.Pending, Assert.Single(store.Campaigns).EnqueueStatus);
    }

    private static async Task<CampaignRepository> CreateRepositoryAsync()
    {
        var repository = new CampaignRepository(new InMemoryCampaignDocumentStore());
        await repository.CreateAsync(CampaignPersistenceTests.CreateCampaign(), CancellationToken.None);
        return repository;
    }

    private static CampaignDefinition CreateCampaign(string slug)
    {
        var url = $"https://www.linkedin.com/pulse/{slug}";
        var article = new PublishedArticle(
            JsonArticleCatalogReader.DeriveArticleId(ArticleOrigin.LinkedIn, "pt-BR", url),
            ArticleOrigin.LinkedIn,
            "pt-BR",
            url,
            $"Artigo {slug}",
            "Descrição");
        return CampaignDefinition.FromArticle(article, new string('a', 40), 1, Now);
    }

    private sealed class ReplayPublicationCoordinator(
        PublicationProcessingStatus status = PublicationProcessingStatus.Replayed) : IPublicationCampaignCoordinator
    {
        public Task<PublicationProcessingResult> ProcessAsync(
            PublishedRevision revision,
            CancellationToken cancellationToken = default) => Task.FromResult(
                new PublicationProcessingResult(status, 0, 0, 0, []));
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class CollectingLogger<T> : Microsoft.Extensions.Logging.ILogger<T>
    {
        private readonly List<string> _messages = [];
        public string Text => string.Join(Environment.NewLine, _messages);
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(Microsoft.Extensions.Logging.LogLevel logLevel) => true;
        public void Log<TState>(
            Microsoft.Extensions.Logging.LogLevel logLevel,
            Microsoft.Extensions.Logging.EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter) => _messages.Add(formatter(state, exception));
    }
}
