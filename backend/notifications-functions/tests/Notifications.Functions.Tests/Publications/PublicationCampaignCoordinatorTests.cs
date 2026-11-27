using Notifications.Functions.Publications;
using Notifications.Functions.Push;
using Notifications.Functions.Subscriptions;
using Notifications.Functions.Tests.Push;

namespace Notifications.Functions.Tests.Publications;

public sealed class PublicationCampaignCoordinatorTests
{
    private static readonly DateTimeOffset PublishedAt = new(2026, 11, 27, 15, 0, 0, TimeSpan.Zero);

    [Fact]
    public void CatalogReader_DetectsThreeOriginsAndKeepsIdentityAcrossEditorialChangesAndReorder()
    {
        var reader = new JsonArticleCatalogReader();
        var first = reader.Read(Snapshot([Pt("um", "Título", "Descrição")], [En("one")], [Es("uno")]));
        var changed = reader.Read(Snapshot(
            [Pt("um", "Título revisado", "Outra descrição")],
            [En("one")],
            [Es("uno")]));

        Assert.Equal(3, first.Count);
        Assert.Contains(first, article => article.Origin == ArticleOrigin.LinkedIn && article.Locale == "pt-BR");
        Assert.Contains(first, article => article.Origin == ArticleOrigin.DevCommunity && article.Locale == "en");
        Assert.Contains(first, article => article.Origin == ArticleOrigin.Hashnode && article.Locale == "es-419");
        Assert.Equal(first.Select(article => article.Id), changed.Select(article => article.Id));
    }

    [Fact]
    public async Task FirstPublication_SeedsEveryLanguageWithoutCreatingBacklog()
    {
        var context = CreateContext();

        var result = await context.Coordinator.ProcessAsync(Revision(1, Snapshot(
            [Pt("antigo", "Antigo", "Anterior")], [En("old")], [Es("viejo")])));

        Assert.Equal(PublicationProcessingStatus.Seeded, result.Status);
        Assert.Equal(3, result.DetectedArticles);
        Assert.Equal(0, result.EligibleCampaigns);
        Assert.Empty(context.CampaignStore.Campaigns);
    }

    [Fact]
    public async Task NewArticles_AreDetectedInEveryLanguageButOnlyPtBrCreatesCampaign()
    {
        var context = CreateContext();
        await context.Coordinator.ProcessAsync(Revision(1, Snapshot(
            [Pt("antigo", "Antigo", "Anterior")], [En("old")], [Es("viejo")])));

        var result = await context.Coordinator.ProcessAsync(Revision(2, Snapshot(
            [Pt("novo", "Novo", "Descrição"), Pt("antigo", "Editado", "Nova descrição")],
            [En("new"), En("old")],
            [Es("nuevo"), Es("viejo")])));

        Assert.Equal(PublicationProcessingStatus.Processed, result.Status);
        Assert.Equal(3, result.DetectedArticles);
        Assert.Equal(1, result.EligibleCampaigns);
        var campaign = Assert.Single(context.CampaignStore.Campaigns);
        Assert.Equal("pt-BR", campaign.Locale);
        Assert.Equal("LinkedIn", campaign.Origin);
        Assert.Equal(new string('2', 40), campaign.PublicationSha);
    }

    [Fact]
    public async Task ReorderMetadataReleaseAndReappearance_DoNotCreateNewCampaigns()
    {
        var context = CreateContext();
        await context.Coordinator.ProcessAsync(Revision(1, Snapshot(
            [Pt("a", "A", "A"), Pt("b", "B", "B")], [En("old")], [Es("viejo")])));
        await context.Coordinator.ProcessAsync(Revision(2, Snapshot(
            [Pt("b", "B editado", "B2")], [En("old")], [Es("viejo")])));
        var reappeared = await context.Coordinator.ProcessAsync(Revision(3, Snapshot(
            [Pt("a", "A voltou", "A3"), Pt("b", "B", "B")], [En("old")], [Es("viejo")])));

        Assert.Equal(0, reappeared.DetectedArticles);
        Assert.Empty(context.CampaignStore.Campaigns);
        var replay = await context.Coordinator.ProcessAsync(Revision(3, Snapshot([], [], [])));
        Assert.Equal(PublicationProcessingStatus.Replayed, replay.Status);
    }

    [Fact]
    public async Task CampaignFailure_DoesNotAdvanceBaselineAndReplayRecoversIdempotently()
    {
        var baseline = new InMemoryBaselineStore();
        var campaignStore = new InMemoryCampaignDocumentStore();
        var repository = new CampaignRepository(campaignStore);
        var failing = new FailingCampaignRepository(repository, failAfterCreates: 1);
        var coordinator = CreateCoordinator(baseline, failing);
        await coordinator.ProcessAsync(Revision(1, Snapshot([Pt("old", "Old", "Old")], [], [])));

        await Assert.ThrowsAsync<InvalidOperationException>(() => coordinator.ProcessAsync(
            Revision(2, Snapshot([Pt("new-a", "A", "A"), Pt("new-b", "B", "B")], [], []))));
        Assert.Equal(1, baseline.Current!.Sequence);

        var recovered = await CreateCoordinator(baseline, repository).ProcessAsync(
            Revision(2, Snapshot([Pt("new-a", "A", "A"), Pt("new-b", "B", "B")], [], [])));
        Assert.Equal(PublicationProcessingStatus.Processed, recovered.Status);
        Assert.Equal(2, campaignStore.Campaigns.Count);
    }

    [Fact]
    public async Task OlderOrConcurrentReleaseCannotReplaceNewerBaseline()
    {
        var context = CreateContext();
        await context.Coordinator.ProcessAsync(Revision(1, Snapshot([], [], [])));

        await Task.WhenAll(
            context.Coordinator.ProcessAsync(Revision(2, Snapshot([Pt("two", "Two", "Two")], [], []))),
            context.Coordinator.ProcessAsync(Revision(3, Snapshot([Pt("three", "Three", "Three")], [], []))));

        Assert.Equal(3, context.Baseline.Current!.Sequence);
        var old = await context.Coordinator.ProcessAsync(Revision(2, Snapshot([], [], [])));
        Assert.Equal(PublicationProcessingStatus.Superseded, old.Status);
    }

    [Theory]
    [InlineData("not-a-sha", "refs/heads/main", PublicationConclusion.Succeeded, true)]
    [InlineData("1111111111111111111111111111111111111111", "refs/heads/feature", PublicationConclusion.Succeeded, true)]
    [InlineData("1111111111111111111111111111111111111111", "refs/heads/main", PublicationConclusion.Failed, true)]
    [InlineData("1111111111111111111111111111111111111111", "refs/heads/main", PublicationConclusion.Succeeded, false)]
    public async Task InvalidOrSupersededDeploymentEvidenceIsRejected(
        string sha,
        string sourceRef,
        PublicationConclusion conclusion,
        bool latest)
    {
        var context = CreateContext();
        var revision = Revision(1, Snapshot([], [], [])) with
        {
            Sha = sha,
            SourceRef = sourceRef,
            Conclusion = conclusion,
            IsLatestSuccessfulDeployment = latest,
        };

        await Assert.ThrowsAsync<ArgumentException>(() => context.Coordinator.ProcessAsync(revision));
    }

    [Theory]
    [InlineData("http://www.linkedin.com/pulse/test")]
    [InlineData("https://attacker.example/pulse/test")]
    [InlineData("https://www.linkedin.com/pulse/test?token=secret")]
    [InlineData("https://user:password@www.linkedin.com/pulse/test")]
    public void CatalogReader_RejectsInvalidUrls(string url)
    {
        var snapshot = new PublicationCatalogSnapshot(
            $$"""[{"url":"{{url}}","title":"T","description":"D"}]""",
            "[]",
            "[]");
        Assert.Throws<InvalidDataException>(() => new JsonArticleCatalogReader().Read(snapshot));
    }

    private static TestContext CreateContext()
    {
        var baseline = new InMemoryBaselineStore();
        var campaignStore = new InMemoryCampaignDocumentStore();
        var repository = new CampaignRepository(campaignStore);
        return new(CreateCoordinator(baseline, repository), baseline, campaignStore);
    }

    private static PublicationCampaignCoordinator CreateCoordinator(
        IPublicationBaselineStore baseline,
        ICampaignRepository campaigns) => new(
            new JsonArticleCatalogReader(),
            new PtBrNotificationEligibilityPolicy(),
            baseline,
            campaigns);

    private static PublishedRevision Revision(long sequence, PublicationCatalogSnapshot snapshot) => new(
        new string((char)('0' + sequence), 40),
        sequence,
        PublishedAt.AddMinutes(sequence),
        "refs/heads/main",
        PublicationConclusion.Succeeded,
        true,
        snapshot);

    private static PublicationCatalogSnapshot Snapshot(string[] pt, string[] en, string[] es) => new(
        $"[{string.Join(',', pt)}]",
        $"[{string.Join(',', en)}]",
        $"[{string.Join(',', es)}]");

    private static string Pt(string slug, string title, string description) =>
        $$"""{"url":"https://www.linkedin.com/pulse/{{slug}}","finalUrl":"https://www.linkedin.com/pulse/{{slug}}/","title":"{{title}}","description":"{{description}}"}""";
    private static string En(string slug) =>
        $$"""{"url":"https://dev.to/rodri-oliveira-dev/{{slug}}","title":"{{slug}}","description":"description"}""";
    private static string Es(string slug) =>
        $$"""{"url":"https://rodri-oliveira-dev.hashnode.dev/{{slug}}","title":"{{slug}}","description":"descripción"}""";

    private sealed record TestContext(
        PublicationCampaignCoordinator Coordinator,
        InMemoryBaselineStore Baseline,
        InMemoryCampaignDocumentStore CampaignStore);

    private sealed class InMemoryBaselineStore : IPublicationBaselineStore
    {
        private readonly object _gate = new();
        private long _version;
        public PublicationBaseline? Current { get; private set; }

        public Task<PublicationBaseline?> ReadAsync(CancellationToken cancellationToken)
        {
            lock (_gate)
            {
                return Task.FromResult(Current is null ? null : Copy(Current));
            }
        }

        public Task<BaselineWriteResult> CreateAsync(PublicationBaseline baseline, CancellationToken cancellationToken)
        {
            lock (_gate)
            {
                if (Current is not null) return Task.FromResult(new BaselineWriteResult(BaselineWriteStatus.Conflict, null));
                _version = 1;
                Current = baseline with { ETag = ETag() };
                return Task.FromResult(new BaselineWriteResult(BaselineWriteStatus.Created, ETag()));
            }
        }

        public Task<BaselineWriteResult> ReplaceAsync(PublicationBaseline baseline, string expectedETag, CancellationToken cancellationToken)
        {
            lock (_gate)
            {
                if (Current is null || Current.ETag != expectedETag)
                    return Task.FromResult(new BaselineWriteResult(BaselineWriteStatus.Conflict, null));
                _version++;
                Current = baseline with { ETag = ETag() };
                return Task.FromResult(new BaselineWriteResult(BaselineWriteStatus.Updated, ETag()));
            }
        }

        private PublicationBaseline Copy(PublicationBaseline source) => source with
        {
            KnownArticleIds = new HashSet<string>(source.KnownArticleIds, StringComparer.Ordinal),
        };
        private string ETag() => $"etag-{_version}";
    }

    private sealed class FailingCampaignRepository(ICampaignRepository inner, int failAfterCreates) : ICampaignRepository
    {
        private int _creates;
        public Task<CampaignWriteResult> CreateAsync(CampaignDefinition campaign, CancellationToken cancellationToken)
        {
            if (Interlocked.Increment(ref _creates) > failAfterCreates)
                throw new InvalidOperationException("simulated partial campaign persistence failure");
            return inner.CreateAsync(campaign, cancellationToken);
        }
        public Task<StoredCampaign?> GetAsync(string campaignId, CancellationToken cancellationToken) => inner.GetAsync(campaignId, cancellationToken);
        public Task<CampaignDeliveryClaim?> TryClaimAsync(CampaignDefinition campaign, SubscriptionRecord subscription, DateTimeOffset now, CancellationToken cancellationToken) => inner.TryClaimAsync(campaign, subscription, now, cancellationToken);
        public Task<CampaignDeliveryClaim?> BeginTransportAsync(CampaignDeliveryClaim claim, DateTimeOffset now, CancellationToken cancellationToken) => inner.BeginTransportAsync(claim, now, cancellationToken);
        public Task<CampaignWriteResult> CompleteAsync(CampaignDeliveryClaim claim, DeliveryStatus outcome, DateTimeOffset now, CancellationToken cancellationToken) => inner.CompleteAsync(claim, outcome, now, cancellationToken);
    }
}
