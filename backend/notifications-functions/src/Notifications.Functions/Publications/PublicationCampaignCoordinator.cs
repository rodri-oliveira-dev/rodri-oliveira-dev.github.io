using System.Text.RegularExpressions;
using Notifications.Functions.Push;

namespace Notifications.Functions.Publications;

public enum PublicationConclusion
{
    Succeeded,
    Failed,
}

public sealed record PublishedRevision(
    string Sha,
    long Sequence,
    DateTimeOffset PublishedAtUtc,
    string SourceRef,
    PublicationConclusion Conclusion,
    bool IsLatestSuccessfulDeployment,
    PublicationCatalogSnapshot Catalogs);

public enum PublicationProcessingStatus
{
    Seeded,
    Processed,
    Replayed,
    Superseded,
}

public sealed record PublicationProcessingResult(
    PublicationProcessingStatus Status,
    int DetectedArticles,
    int EligibleCampaigns);

internal sealed record PublicationBaseline(
    string Sha,
    long Sequence,
    DateTimeOffset PublishedAtUtc,
    IReadOnlySet<string> KnownArticleIds,
    string ETag);

internal enum BaselineWriteStatus
{
    Created,
    Updated,
    Conflict,
}

internal sealed record BaselineWriteResult(BaselineWriteStatus Status, string? ETag);

internal interface IPublicationBaselineStore
{
    Task<PublicationBaseline?> ReadAsync(CancellationToken cancellationToken);
    Task<BaselineWriteResult> CreateAsync(PublicationBaseline baseline, CancellationToken cancellationToken);
    Task<BaselineWriteResult> ReplaceAsync(PublicationBaseline baseline, string expectedETag, CancellationToken cancellationToken);
}

public interface IPublicationCampaignCoordinator
{
    Task<PublicationProcessingResult> ProcessAsync(
        PublishedRevision revision,
        CancellationToken cancellationToken = default);
}

internal sealed partial class PublicationCampaignCoordinator : IPublicationCampaignCoordinator
{
    private const int MaximumConcurrencyRetries = 8;
    private readonly IArticleCatalogReader _catalogReader;
    private readonly INotificationEligibilityPolicy _eligibility;
    private readonly IPublicationBaselineStore _baselineStore;
    private readonly ICampaignRepository _campaigns;

    public PublicationCampaignCoordinator(
        IArticleCatalogReader catalogReader,
        INotificationEligibilityPolicy eligibility,
        IPublicationBaselineStore baselineStore,
        ICampaignRepository campaigns)
    {
        _catalogReader = catalogReader;
        _eligibility = eligibility;
        _baselineStore = baselineStore;
        _campaigns = campaigns;
    }

    public async Task<PublicationProcessingResult> ProcessAsync(
        PublishedRevision revision,
        CancellationToken cancellationToken = default)
    {
        ValidateEvidence(revision);
        var articles = _catalogReader.Read(revision.Catalogs);

        for (var retry = 0; retry < MaximumConcurrencyRetries; retry++)
        {
            var baseline = await _baselineStore.ReadAsync(cancellationToken);
            if (baseline is null)
            {
                var seed = CreateBaseline(revision, articles.Select(article => article.Id), string.Empty);
                var created = await _baselineStore.CreateAsync(seed, cancellationToken);
                if (created.Status == BaselineWriteStatus.Created)
                {
                    return new(PublicationProcessingStatus.Seeded, articles.Count, 0);
                }

                continue;
            }

            if (revision.Sequence < baseline.Sequence)
            {
                return new(PublicationProcessingStatus.Superseded, 0, 0);
            }

            if (revision.Sequence == baseline.Sequence)
            {
                return new(
                    string.Equals(revision.Sha, baseline.Sha, StringComparison.Ordinal)
                        ? PublicationProcessingStatus.Replayed
                        : PublicationProcessingStatus.Superseded,
                    0,
                    0);
            }

            var newArticles = articles
                .Where(article => !baseline.KnownArticleIds.Contains(article.Id))
                .OrderBy(article => article.Id, StringComparer.Ordinal)
                .ToArray();
            var eligible = newArticles.Where(_eligibility.IsEligible).ToArray();

            // Campaigns are conditionally created before the baseline advances. If any
            // write fails, replay repeats idempotent creates and no article is lost.
            foreach (var article in eligible)
            {
                await _campaigns.CreateAsync(
                    CampaignDefinition.FromArticle(article, revision.Sha, revision.PublishedAtUtc),
                    cancellationToken);
            }

            var known = new HashSet<string>(baseline.KnownArticleIds, StringComparer.Ordinal);
            known.UnionWith(articles.Select(article => article.Id));
            var next = CreateBaseline(revision, known, baseline.ETag);
            var replaced = await _baselineStore.ReplaceAsync(next, baseline.ETag, cancellationToken);
            if (replaced.Status == BaselineWriteStatus.Updated)
            {
                return new(PublicationProcessingStatus.Processed, newArticles.Length, eligible.Length);
            }
        }

        throw new InvalidOperationException("A baseline editorial permaneceu em conflito após tentativas limitadas.");
    }

    private static PublicationBaseline CreateBaseline(
        PublishedRevision revision,
        IEnumerable<string> knownArticleIds,
        string etag) => new(
            revision.Sha,
            revision.Sequence,
            revision.PublishedAtUtc,
            new HashSet<string>(knownArticleIds, StringComparer.Ordinal),
            etag);

    private static void ValidateEvidence(PublishedRevision revision)
    {
        ArgumentNullException.ThrowIfNull(revision);
        if (!ShaPattern().IsMatch(revision.Sha) || revision.Sequence <= 0 ||
            revision.PublishedAtUtc.Offset != TimeSpan.Zero ||
            !string.Equals(revision.SourceRef, "refs/heads/main", StringComparison.Ordinal) ||
            revision.Conclusion != PublicationConclusion.Succeeded ||
            !revision.IsLatestSuccessfulDeployment)
        {
            throw new ArgumentException(
                "A revisão não comprova uma publicação atual e concluída do GitHub Pages.",
                nameof(revision));
        }
    }

    [GeneratedRegex("^[0-9a-f]{40}$", RegexOptions.CultureInvariant)]
    private static partial Regex ShaPattern();
}
