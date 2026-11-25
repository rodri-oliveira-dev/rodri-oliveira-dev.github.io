using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Notifications.Functions.Subscriptions;

namespace Notifications.Functions.Push;

public interface ICampaignProcessor
{
    Task<CampaignProcessResult> ProcessAsync(
        CampaignWorkItem workItem,
        CancellationToken cancellationToken);
}

public sealed record CampaignWorkItem(string CampaignId, string? ContinuationToken = null);

public sealed record CampaignProcessResult(string? ContinuationToken);

internal sealed partial class CampaignProcessor : ICampaignProcessor
{
    private readonly ICampaignCatalog _catalog;
    private readonly ISubscriptionRepository _subscriptions;
    private readonly IVapidKeyProvider _vapidKeys;
    private readonly IWebPushTransport _transport;
    private readonly ILogger<CampaignProcessor> _logger;

    public CampaignProcessor(
        ICampaignCatalog catalog,
        ISubscriptionRepository subscriptions,
        IVapidKeyProvider vapidKeys,
        IWebPushTransport transport,
        ILogger<CampaignProcessor> logger)
    {
        _catalog = catalog;
        _subscriptions = subscriptions;
        _vapidKeys = vapidKeys;
        _transport = transport;
        _logger = logger;
    }

    public async Task<CampaignProcessResult> ProcessAsync(
        CampaignWorkItem workItem,
        CancellationToken cancellationToken)
    {
        var campaignId = workItem.CampaignId;
        if (string.IsNullOrWhiteSpace(campaignId) || !CampaignIdPattern().IsMatch(campaignId))
        {
            _logger.LogWarning("Mensagem de campanha rejeitada: identificador inválido.");
            return new(null);
        }

        if (!_catalog.TryGet(campaignId, out var campaign) || campaign is null)
        {
            _logger.LogWarning("Campanha {CampaignId} inexistente ou inválida.", campaignId);
            return new(null);
        }

        var payload = JsonSerializer.Serialize(new
        {
            title = campaign.Title,
            body = campaign.Body,
            url = campaign.Url,
            lang = WebPushSubscriptionValidator.SupportedLocale,
        });
        var topic = CreateTopic(campaignId);
        var credentials = await _vapidKeys.GetAsync(cancellationToken);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var succeeded = 0;
        var expired = 0;
        var permanentFailures = 0;
        var transientFailures = 0;
        var duplicates = 0;

        var page = await _subscriptions.ListActivePageAsync(
            WebPushSubscriptionValidator.SupportedLocale,
            workItem.ContinuationToken,
            cancellationToken);
        foreach (var subscription in page.Items)
        {
            if (!seen.Add(subscription.Id))
            {
                duplicates++;
                continue;
            }

            var status = await _transport.SendAsync(
                subscription,
                payload,
                topic,
                credentials,
                cancellationToken);
            switch (status)
            {
                case PushDeliveryStatus.Succeeded:
                    succeeded++;
                    break;
                case PushDeliveryStatus.SubscriptionExpired:
                    expired++;
                    if (!string.IsNullOrEmpty(subscription.ETag))
                    {
                        await _subscriptions.DeleteAsync(
                            subscription.Subscription.Endpoint,
                            subscription.ETag,
                            cancellationToken);
                    }
                    break;
                case PushDeliveryStatus.PermanentFailure:
                    permanentFailures++;
                    break;
                case PushDeliveryStatus.TransientFailure:
                    transientFailures++;
                    break;
                default:
                    throw new InvalidOperationException("Resultado de entrega desconhecido.");
            }
        }

        _logger.LogInformation(
            "Campanha {CampaignId} concluída: sucesso={Succeeded}, expiradas={Expired}, permanentes={Permanent}, transitórias={Transient}, duplicadas={Duplicates}.",
            campaignId,
            succeeded,
            expired,
            permanentFailures,
            transientFailures,
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
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_')[..32];
    }

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{0,63}$", RegexOptions.CultureInvariant)]
    private static partial Regex CampaignIdPattern();
}

internal sealed class CampaignTransientFailureException(int count)
    : Exception($"A campanha teve {count} falha(s) transitória(s).")
{
}
