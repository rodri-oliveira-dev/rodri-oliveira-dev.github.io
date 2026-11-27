using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Notifications.Functions.Configuration;
using Notifications.Functions.Subscriptions;

namespace Notifications.Functions.Push;

public interface ICampaignProcessor
{
    Task<CampaignProcessResult> ProcessAsync(CampaignWorkItem workItem, CancellationToken cancellationToken);
}

public sealed record CampaignWorkItem(string CampaignId, string? ContinuationToken = null);
public sealed record CampaignProcessResult(string? ContinuationToken);

internal sealed partial class CampaignProcessor : ICampaignProcessor
{
    private readonly ICampaignCatalog _catalog;
    private readonly ICampaignRepository _campaigns;
    private readonly ISubscriptionRepository _subscriptions;
    private readonly IVapidKeyProvider _vapidKeys;
    private readonly IWebPushTransport _transport;
    private readonly ILogger<CampaignProcessor> _logger;
    private readonly WebPushOptions _options;
    private readonly TimeProvider _timeProvider;

    public CampaignProcessor(
        ICampaignCatalog catalog,
        ICampaignRepository campaigns,
        ISubscriptionRepository subscriptions,
        IVapidKeyProvider vapidKeys,
        IWebPushTransport transport,
        ILogger<CampaignProcessor> logger,
        IOptions<WebPushOptions> options,
        TimeProvider timeProvider)
    {
        _catalog = catalog;
        _campaigns = campaigns;
        _subscriptions = subscriptions;
        _vapidKeys = vapidKeys;
        _transport = transport;
        _logger = logger;
        _options = options.Value;
        _timeProvider = timeProvider;
    }

    public async Task<CampaignProcessResult> ProcessAsync(
        CampaignWorkItem workItem,
        CancellationToken cancellationToken)
    {
        var requestedCampaignId = workItem.CampaignId;
        if (string.IsNullOrWhiteSpace(requestedCampaignId) || !CampaignIdPattern().IsMatch(requestedCampaignId))
        {
            _logger.LogWarning("Mensagem de campanha rejeitada: identificador inválido.");
            return new(null);
        }

        var storedCampaign = await _campaigns.GetAsync(requestedCampaignId, cancellationToken);
        var campaign = storedCampaign?.Definition;
        if (campaign is null && _catalog.TryGet(requestedCampaignId, out var configured) && configured is not null)
        {
            campaign = CreateLegacyCampaign(requestedCampaignId, configured, _timeProvider.GetUtcNow());
            await _campaigns.CreateAsync(campaign, cancellationToken);
        }

        if (campaign is null)
        {
            _logger.LogWarning("Campanha inexistente ou inválida rejeitada.");
            return new(null);
        }

        var campaignId = campaign.CampaignId;
        var topic = CreateTopic(campaignId);
        var credentials = await _vapidKeys.GetAsync(cancellationToken);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var succeeded = 0;
        var expired = 0;
        var permanentFailures = 0;
        var transientFailures = 0;
        var uncertainOutcomes = 0;
        var duplicates = 0;

        var page = await _subscriptions.ListActivePageAsync(
            WebPushSubscriptionValidator.SupportedLocale,
            workItem.ContinuationToken,
            cancellationToken);
        foreach (var subscription in page.Items)
        {
            if (!seen.Add($"{subscription.Id}:{subscription.Generation}"))
            {
                duplicates++;
                continue;
            }

            var initiallyEligible = await _subscriptions.GetEligibleAsync(
                subscription.Id,
                subscription.Generation,
                cancellationToken);
            if (initiallyEligible is null)
            {
                continue;
            }

            var claim = await _campaigns.TryClaimAsync(
                campaign,
                initiallyEligible,
                _timeProvider.GetUtcNow(),
                cancellationToken);
            if (claim is null)
            {
                duplicates++;
                continue;
            }

            // Re-read after the durable claim and immediately before the irreversible
            // boundary. Revocation, expiry, generation or recovery-epoch changes win.
            var eligible = await _subscriptions.GetEligibleAsync(
                claim.SubscriptionId,
                claim.Generation,
                cancellationToken);
            if (eligible is null)
            {
                await RequirePersistedOutcomeAsync(
                    claim,
                    DeliveryStatus.Cancelled,
                    _timeProvider.GetUtcNow(),
                    cancellationToken);
                continue;
            }

            var sending = await _campaigns.BeginTransportAsync(
                claim,
                _timeProvider.GetUtcNow(),
                cancellationToken);
            if (sending is null)
            {
                duplicates++;
                continue;
            }

            var payload = JsonSerializer.Serialize(new
            {
                version = 1,
                title = campaign.Title,
                body = campaign.Body,
                url = campaign.Url,
                lang = WebPushSubscriptionValidator.SupportedLocale,
                expiresAtUtc = _timeProvider.GetUtcNow().AddSeconds(_options.PushTimeToLiveSeconds).UtcDateTime,
            });
            var status = await _transport.SendAsync(
                eligible,
                payload,
                topic,
                credentials,
                cancellationToken);
            var outcome = status switch
            {
                PushDeliveryStatus.Succeeded => DeliveryStatus.Succeeded,
                PushDeliveryStatus.SubscriptionExpired => DeliveryStatus.SubscriptionExpired,
                PushDeliveryStatus.PermanentFailure => DeliveryStatus.PermanentFailure,
                PushDeliveryStatus.TransientFailure => DeliveryStatus.TransientFailure,
                PushDeliveryStatus.OutcomeUnknown => DeliveryStatus.OutcomeUnknown,
                _ => throw new InvalidOperationException("Resultado de entrega desconhecido."),
            };
            await RequirePersistedOutcomeAsync(sending, outcome, _timeProvider.GetUtcNow(), cancellationToken);

            switch (status)
            {
                case PushDeliveryStatus.Succeeded:
                    succeeded++;
                    break;
                case PushDeliveryStatus.SubscriptionExpired:
                    expired++;
                    if (!string.IsNullOrEmpty(eligible.ETag))
                    {
                        await _subscriptions.InvalidateGenerationAsync(
                            eligible.Id,
                            eligible.Generation,
                            eligible.ETag,
                            cancellationToken);
                    }
                    break;
                case PushDeliveryStatus.PermanentFailure:
                    permanentFailures++;
                    break;
                case PushDeliveryStatus.TransientFailure:
                    transientFailures++;
                    break;
                case PushDeliveryStatus.OutcomeUnknown:
                    uncertainOutcomes++;
                    break;
            }
        }

        _logger.LogInformation(
            "Campanha concluída: sucesso={Succeeded}, expiradas={Expired}, permanentes={Permanent}, transitórias={Transient}, incertas={Unknown}, duplicadas={Duplicates}.",
            succeeded,
            expired,
            permanentFailures,
            transientFailures,
            uncertainOutcomes,
            duplicates);

        if (transientFailures > 0)
        {
            throw new CampaignTransientFailureException(transientFailures);
        }

        return new(page.ContinuationToken);
    }

    internal static string CreateTopic(string campaignId)
    {
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(campaignId));
        return Convert.ToBase64String(digest)
            .TrimEnd('=').Replace('+', '-').Replace('/', '_')[..32];
    }

    private async Task RequirePersistedOutcomeAsync(
        CampaignDeliveryClaim claim,
        DeliveryStatus outcome,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var result = await _campaigns.CompleteAsync(claim, outcome, now, cancellationToken);
        if (result.Status != CampaignWriteStatus.Updated)
        {
            throw new CampaignStatePersistenceException();
        }
    }

    private static CampaignDefinition CreateLegacyCampaign(
        string campaignId,
        CampaignDefinition configured,
        DateTimeOffset audienceCutoffUtc)
    {
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes($"legacy-campaign:{campaignId}"));
        var articleId = $"article_{Convert.ToBase64String(digest).TrimEnd('=').Replace('+', '-').Replace('/', '_')}";
        return configured with
        {
            CampaignId = CampaignIdentity.ForArticle(articleId),
            ArticleId = articleId,
            PublicationSha = new string('0', 40),
            PublicationSequence = 1,
            CanonicalArticleUrl = $"https://www.linkedin.com/pulse/configured-{articleId}",
            AudienceCutoffUtc = audienceCutoffUtc,
        };
    }

    [GeneratedRegex("^(?:campaign_[A-Za-z0-9_-]{43}|[a-z0-9][a-z0-9-]{0,63})$", RegexOptions.CultureInvariant)]
    private static partial Regex CampaignIdPattern();
}

internal sealed class CampaignTransientFailureException(int count)
    : Exception($"A campanha teve {count} falha(s) transitória(s).")
{
}

internal sealed class CampaignStatePersistenceException()
    : Exception("O resultado da entrega não foi persistido; a campanha não será reenviada automaticamente.")
{
}
