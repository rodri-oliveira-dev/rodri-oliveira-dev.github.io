using Microsoft.Extensions.Configuration;

namespace Notifications.Functions.Push;

internal sealed record CampaignDefinition(string Title, string Body, string Url);

internal interface ICampaignCatalog
{
    bool TryGet(string campaignId, out CampaignDefinition? campaign);
}

internal sealed class ConfigurationCampaignCatalog : ICampaignCatalog
{
    private static readonly Uri PublishedOrigin = new("https://rodri-oliveira-dev.github.io/");
    private readonly IConfiguration _configuration;

    public ConfigurationCampaignCatalog(IConfiguration configuration)
    {
        _configuration = configuration ?? throw new ArgumentNullException(nameof(configuration));
    }

    public bool TryGet(string campaignId, out CampaignDefinition? campaign)
    {
        var section = _configuration.GetSection($"NotificationCampaigns:{campaignId}");
        var title = section["Title"];
        var body = section["Body"];
        var url = section["Url"];

        if (string.IsNullOrWhiteSpace(title) || title.Length > 80 ||
            string.IsNullOrWhiteSpace(body) || body.Length > 160 ||
            !Uri.TryCreate(url, UriKind.Absolute, out var target) ||
            target.Scheme != Uri.UriSchemeHttps ||
            !string.Equals(target.Host, PublishedOrigin.Host, StringComparison.OrdinalIgnoreCase) ||
            !target.IsDefaultPort ||
            !string.IsNullOrEmpty(target.UserInfo) ||
            !string.IsNullOrEmpty(target.Fragment))
        {
            campaign = null;
            return false;
        }

        campaign = new(title, body, target.AbsoluteUri);
        return true;
    }
}
