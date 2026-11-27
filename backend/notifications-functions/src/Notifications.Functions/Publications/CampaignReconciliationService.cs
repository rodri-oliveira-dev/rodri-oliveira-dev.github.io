using System.Diagnostics;
using Microsoft.Extensions.Logging;
using Notifications.Functions.Push;

namespace Notifications.Functions.Publications;

internal sealed record CampaignReconciliationOptions(
    int MaximumAttempts = 3,
    int MaximumCampaignsPerRound = 25,
    TimeSpan? ClaimLease = null,
    TimeSpan? InitialBackoff = null,
    TimeSpan? MaximumBackoff = null)
{
    public TimeSpan EffectiveClaimLease => ClaimLease ?? TimeSpan.FromMinutes(10);
    public TimeSpan EffectiveInitialBackoff => InitialBackoff ?? TimeSpan.FromSeconds(30);
    public TimeSpan EffectiveMaximumBackoff => MaximumBackoff ?? TimeSpan.FromMinutes(15);
}

internal sealed record CampaignEnqueueManifestItem(
    string CampaignId,
    string ClaimId,
    int AttemptCount,
    DateTimeOffset LeaseUntilUtc);

internal sealed record CampaignReconciliationSummary(
    PublicationProcessingStatus PublicationStatus,
    IReadOnlyDictionary<string, int> DetectedByLocale,
    int EligibleCampaigns,
    int CreatedCampaigns,
    int DeduplicatedCampaigns,
    int PendingCampaigns,
    int ClaimedCampaigns,
    int ReconciledCampaigns,
    int SupersededCampaigns,
    bool ProcessingLimitReached,
    long DurationMilliseconds,
    IReadOnlyList<CampaignEnqueueManifestItem> Manifest);

internal sealed record CampaignEnqueueOutcome(
    string CampaignId,
    string ClaimId,
    int AttemptCount,
    CampaignEnqueueFailure Failure);

internal sealed record CampaignEnqueueCompletionSummary(
    int Attempted,
    int Enqueued,
    int Failed,
    int Exhausted,
    long DurationMilliseconds);

internal interface ICampaignReconciliationService
{
    Task<CampaignReconciliationSummary> PrepareAsync(
        PublishedRevision revision,
        CampaignReconciliationOptions options,
        CancellationToken cancellationToken);

    Task<CampaignEnqueueCompletionSummary> CompleteAsync(
        IReadOnlyList<CampaignEnqueueOutcome> outcomes,
        CampaignReconciliationOptions options,
        CancellationToken cancellationToken);
}

internal sealed class CampaignReconciliationService(
    IPublicationCampaignCoordinator publications,
    IArticleCatalogReader catalogReader,
    INotificationEligibilityPolicy eligibility,
    ICampaignRepository campaigns,
    TimeProvider timeProvider,
    ILogger<CampaignReconciliationService> logger) : ICampaignReconciliationService
{
    private static readonly EventId ReconciliationCompleted = new(16501, nameof(ReconciliationCompleted));
    private static readonly EventId EnqueueCompleted = new(16502, nameof(EnqueueCompleted));

    public async Task<CampaignReconciliationSummary> PrepareAsync(
        PublishedRevision revision,
        CampaignReconciliationOptions options,
        CancellationToken cancellationToken)
    {
        ValidateOptions(options);
        var timer = Stopwatch.StartNew();
        var articles = catalogReader.Read(revision.Catalogs);
        var eligibleArticleIds = articles.Where(eligibility.IsEligible)
            .Select(article => article.Id)
            .ToHashSet(StringComparer.Ordinal);
        var processing = await publications.ProcessAsync(revision, cancellationToken);
        if (processing.Status == PublicationProcessingStatus.Superseded)
        {
            throw new InvalidOperationException(
                "A publicação foi superada durante a reconciliação; nenhuma campanha será reivindicada.");
        }
        var candidates = await campaigns.ListEnqueueCandidatesAsync(
            timeProvider.GetUtcNow(),
            options.MaximumAttempts,
            100,
            cancellationToken);
        var limitReached = candidates.Count > options.MaximumCampaignsPerRound;
        var manifest = new List<CampaignEnqueueManifestItem>(options.MaximumCampaignsPerRound);
        var superseded = 0;

        foreach (var candidate in candidates.Take(options.MaximumCampaignsPerRound))
        {
            var now = timeProvider.GetUtcNow();
            var claim = await campaigns.TryClaimEnqueueAsync(
                candidate,
                now,
                options.EffectiveClaimLease,
                cancellationToken);
            if (claim is null)
            {
                continue;
            }

            if (candidate.Definition.PublicationSequence > revision.Sequence ||
                !eligibleArticleIds.Contains(candidate.Definition.ArticleId))
            {
                superseded++;
                await campaigns.CompleteEnqueueAsync(
                    claim,
                    CampaignEnqueueFailure.Permanent,
                    now,
                    null,
                    options.MaximumAttempts,
                    cancellationToken);
                continue;
            }

            manifest.Add(new(
                claim.CampaignId,
                claim.ClaimId,
                claim.AttemptCount,
                claim.LeaseUntilUtc));
        }

        timer.Stop();
        var detected = articles.GroupBy(article => article.Locale, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);
        var summary = new CampaignReconciliationSummary(
            processing.Status,
            detected,
            processing.EligibleCampaigns,
            processing.EligibleCampaigns - processing.DeduplicatedCampaigns,
            processing.DeduplicatedCampaigns,
            candidates.Count,
            manifest.Count,
            manifest.Count + superseded,
            superseded,
            limitReached,
            timer.ElapsedMilliseconds,
            manifest);
        logger.LogInformation(
            ReconciliationCompleted,
            "Reconciliação concluída: status={PublicationStatus}, pt={Pt}, en={En}, es={Es}, elegíveis={Eligible}, criadas={Created}, deduplicadas={Deduplicated}, pendentes={Pending}, reivindicadas={Claimed}, reconciliadas={Reconciled}, superadas={Superseded}, limite={LimitReached}, duraçãoMs={DurationMs}.",
            summary.PublicationStatus,
            detected.GetValueOrDefault("pt-BR"),
            detected.GetValueOrDefault("en"),
            detected.GetValueOrDefault("es-419"),
            summary.EligibleCampaigns,
            summary.CreatedCampaigns,
            summary.DeduplicatedCampaigns,
            summary.PendingCampaigns,
            summary.ClaimedCampaigns,
            summary.ReconciledCampaigns,
            summary.SupersededCampaigns,
            summary.ProcessingLimitReached,
            summary.DurationMilliseconds);
        return summary;
    }

    public async Task<CampaignEnqueueCompletionSummary> CompleteAsync(
        IReadOnlyList<CampaignEnqueueOutcome> outcomes,
        CampaignReconciliationOptions options,
        CancellationToken cancellationToken)
    {
        ValidateOptions(options);
        if (outcomes.Count > options.MaximumCampaignsPerRound ||
            outcomes.Select(outcome => outcome.CampaignId).Distinct(StringComparer.Ordinal).Count() != outcomes.Count)
        {
            throw new ArgumentException("O resultado de enqueue excede o limite ou contém campanhas repetidas.", nameof(outcomes));
        }

        var timer = Stopwatch.StartNew();
        var enqueued = 0;
        var failed = 0;
        var exhausted = 0;
        foreach (var outcome in outcomes)
        {
            var now = timeProvider.GetUtcNow();
            DateTimeOffset? backoff = outcome.Failure == CampaignEnqueueFailure.None
                ? null
                : now.Add(CalculateBackoff(outcome.AttemptCount, options));
            var result = await campaigns.CompleteEnqueueAsync(
                new CampaignEnqueueClaim(outcome.CampaignId, outcome.ClaimId, outcome.AttemptCount, now),
                outcome.Failure,
                now,
                backoff,
                options.MaximumAttempts,
                cancellationToken);
            if (result.Status != CampaignWriteStatus.Updated)
            {
                throw new InvalidOperationException("O resultado de enqueue não pôde ser persistido de forma condicional.");
            }

            if (outcome.Failure == CampaignEnqueueFailure.None)
            {
                enqueued++;
            }
            else
            {
                failed++;
                if (outcome.Failure == CampaignEnqueueFailure.Permanent ||
                    outcome.AttemptCount >= options.MaximumAttempts)
                {
                    exhausted++;
                }
            }
        }

        timer.Stop();
        var summary = new CampaignEnqueueCompletionSummary(
            outcomes.Count,
            enqueued,
            failed,
            exhausted,
            timer.ElapsedMilliseconds);
        logger.LogInformation(
            EnqueueCompleted,
            "Resultados de enqueue persistidos: tentativas={Attempted}, enfileiradas={Enqueued}, falhas={Failed}, esgotadas={Exhausted}, duraçãoMs={DurationMs}.",
            summary.Attempted,
            summary.Enqueued,
            summary.Failed,
            summary.Exhausted,
            summary.DurationMilliseconds);
        return summary;
    }

    internal static TimeSpan CalculateBackoff(int attemptCount, CampaignReconciliationOptions options)
    {
        var multiplier = Math.Pow(2, Math.Clamp(attemptCount - 1, 0, 10));
        var delay = TimeSpan.FromMilliseconds(options.EffectiveInitialBackoff.TotalMilliseconds * multiplier);
        return delay <= options.EffectiveMaximumBackoff ? delay : options.EffectiveMaximumBackoff;
    }

    private static void ValidateOptions(CampaignReconciliationOptions options)
    {
        if (options.MaximumAttempts is < 1 or > 10 ||
            options.MaximumCampaignsPerRound is < 1 or > 100 ||
            options.EffectiveClaimLease <= TimeSpan.Zero ||
            options.EffectiveClaimLease > TimeSpan.FromMinutes(15) ||
            options.EffectiveInitialBackoff <= TimeSpan.Zero ||
            options.EffectiveMaximumBackoff < options.EffectiveInitialBackoff ||
            options.EffectiveMaximumBackoff > TimeSpan.FromHours(1))
        {
            throw new ArgumentOutOfRangeException(nameof(options));
        }
    }
}
