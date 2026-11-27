using Notifications.Functions.Publications;
using Notifications.Functions.Push;
using Notifications.Functions.Subscriptions;

namespace Notifications.Functions.Tests.Push;

public sealed class CampaignPersistenceTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 27, 15, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task ConcurrentClaimsHaveSingleWinnerAndPersistSubscriptionGeneration()
    {
        var (repository, store, campaign) = await CreateRepositoryAsync();
        var subscription = CreateSubscription("generation-1", Now.AddDays(-1));

        var claims = await Task.WhenAll(Enumerable.Range(0, 16).Select(_ =>
            repository.TryClaimAsync(campaign, subscription, Now, CancellationToken.None)));

        var claim = Assert.Single(claims, result => result is not null)!;
        Assert.Equal(subscription.Id, claim.SubscriptionId);
        Assert.Equal("generation-1", claim.Generation);
        var document = Assert.Single(store.Deliveries);
        Assert.Equal(DeliveryStatus.Claimed, document.Status);
        Assert.Equal(0, document.AttemptCount);
    }

    [Fact]
    public async Task KnownTransientFailureCanBeRetriedButSuccessIsPersistentlyDeduplicated()
    {
        var (repository, store, campaign) = await CreateRepositoryAsync();
        var subscription = CreateSubscription("generation-1", Now.AddDays(-1));
        var first = Assert.IsType<CampaignDeliveryClaim>(await repository.TryClaimAsync(campaign, subscription, Now, CancellationToken.None));
        var sending = Assert.IsType<CampaignDeliveryClaim>(await repository.BeginTransportAsync(first, Now, CancellationToken.None));
        var transient = await repository.CompleteAsync(sending, DeliveryStatus.TransientFailure, Now, CancellationToken.None);
        Assert.Equal(CampaignWriteStatus.Updated, transient.Status);

        var retry = Assert.IsType<CampaignDeliveryClaim>(await repository.TryClaimAsync(campaign, subscription, Now.AddSeconds(1), CancellationToken.None));
        var secondSending = Assert.IsType<CampaignDeliveryClaim>(await repository.BeginTransportAsync(retry, Now.AddSeconds(1), CancellationToken.None));
        await repository.CompleteAsync(secondSending, DeliveryStatus.Succeeded, Now.AddSeconds(2), CancellationToken.None);

        Assert.Null(await repository.TryClaimAsync(campaign, subscription, Now.AddHours(1), CancellationToken.None));
        var persisted = Assert.Single(store.Deliveries);
        Assert.Equal(DeliveryStatus.Succeeded, persisted.Status);
        Assert.Equal(2, persisted.AttemptCount);
    }

    [Fact]
    public async Task ExpiredSendingLeaseBecomesOutcomeUnknownAndIsNeverReclaimed()
    {
        var (repository, store, campaign) = await CreateRepositoryAsync();
        var subscription = CreateSubscription("generation-1", Now.AddDays(-1));
        var claim = Assert.IsType<CampaignDeliveryClaim>(await repository.TryClaimAsync(campaign, subscription, Now, CancellationToken.None));
        _ = Assert.IsType<CampaignDeliveryClaim>(await repository.BeginTransportAsync(claim, Now, CancellationToken.None));

        Assert.Null(await repository.TryClaimAsync(campaign, subscription, Now.AddMinutes(6), CancellationToken.None));
        Assert.Equal(DeliveryStatus.OutcomeUnknown, Assert.Single(store.Deliveries).Status);
        Assert.Null(await repository.TryClaimAsync(campaign, subscription, Now.AddDays(1), CancellationToken.None));
    }

    [Fact]
    public async Task CampaignCutoffPreventsNewGenerationFromReceivingOldCampaign()
    {
        var (repository, store, campaign) = await CreateRepositoryAsync();
        var renewed = CreateSubscription("generation-2", campaign.AudienceCutoffUtc.AddSeconds(1));

        var claim = await repository.TryClaimAsync(campaign, renewed, Now, CancellationToken.None);

        Assert.Null(claim);
        Assert.Empty(store.Deliveries);
    }

    [Fact]
    public async Task ConcurrentCampaignCreationIsIdempotentPerArticle()
    {
        var store = new InMemoryCampaignDocumentStore();
        var repository = new CampaignRepository(store);
        var campaign = CreateCampaign();

        var results = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ =>
            repository.CreateAsync(campaign, CancellationToken.None)));

        Assert.Single(results, result => result.Status == CampaignWriteStatus.Created);
        Assert.Equal(9, results.Count(result => result.Status == CampaignWriteStatus.Duplicate));
        Assert.Single(store.Campaigns);
    }

    [Fact]
    public async Task DeliveryDocumentContainsNoEndpointKeysOrCapabilities()
    {
        var (repository, store, campaign) = await CreateRepositoryAsync();
        var subscription = CreateSubscription("generation-1", Now.AddDays(-1));
        await repository.TryClaimAsync(campaign, subscription, Now, CancellationToken.None);

        var document = Assert.Single(store.Deliveries);
        var serialized = Newtonsoft.Json.JsonConvert.SerializeObject(document);
        Assert.DoesNotContain(subscription.Subscription.Endpoint, serialized, StringComparison.Ordinal);
        Assert.DoesNotContain(subscription.Subscription.P256Dh, serialized, StringComparison.Ordinal);
        Assert.DoesNotContain(subscription.Subscription.Auth, serialized, StringComparison.Ordinal);
    }

    private static async Task<(CampaignRepository Repository, InMemoryCampaignDocumentStore Store, CampaignDefinition Campaign)> CreateRepositoryAsync()
    {
        var store = new InMemoryCampaignDocumentStore();
        var repository = new CampaignRepository(store);
        var campaign = CreateCampaign();
        await repository.CreateAsync(campaign, CancellationToken.None);
        return (repository, store, campaign);
    }

    internal static CampaignDefinition CreateCampaign()
    {
        var article = new PublishedArticle(
            JsonArticleCatalogReader.DeriveArticleId(ArticleOrigin.LinkedIn, "pt-BR", "https://www.linkedin.com/pulse/test"),
            ArticleOrigin.LinkedIn,
            "pt-BR",
            "https://www.linkedin.com/pulse/test",
            "Novo artigo",
            "Descrição");
        return CampaignDefinition.FromArticle(article, new string('a', 40), 1, Now);
    }

    internal static SubscriptionRecord CreateSubscription(string generation, DateTimeOffset createdAt)
    {
        var input = Subscriptions.WebPushSubscriptionValidatorTests.CreateValid() with
        {
            Endpoint = $"https://fcm.googleapis.com/fcm/send/{generation}",
        };
        var identity = WebPushSubscriptionValidator.DeriveIdentity(input.Endpoint);
        return new(
            identity.Id,
            identity.PartitionKey,
            input,
            createdAt,
            Now.AddDays(365),
            generation,
            createdAt,
            createdAt,
            "subscription-etag");
    }
}
