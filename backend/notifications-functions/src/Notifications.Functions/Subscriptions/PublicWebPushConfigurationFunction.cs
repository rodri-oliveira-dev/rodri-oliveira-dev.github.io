using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Notifications.Functions.Configuration;
using Notifications.Functions.Push;
using System.Text.Json.Serialization;

namespace Notifications.Functions.Subscriptions;

public sealed record PublicWebPushConfiguration(
    bool Enabled,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? VapidPublicKey = null);

public interface IPublicWebPushConfigurationProvider
{
    Task<PublicWebPushConfiguration> GetAsync(CancellationToken cancellationToken);
}

internal sealed class PublicWebPushConfigurationProvider(
    IVapidKeyProvider vapidKeys,
    IOptions<WebPushOptions> options) : IPublicWebPushConfigurationProvider
{
    private readonly WebPushOptions _options = options.Value;

    public async Task<PublicWebPushConfiguration> GetAsync(CancellationToken cancellationToken)
    {
        if (!_options.PublicLaunchEnabled)
        {
            return new(false);
        }

        var credentials = await vapidKeys.GetAsync(cancellationToken);
        return new(true, credentials.PublicKey);
    }
}

public sealed class PublicWebPushConfigurationFunction(
    IPublicWebPushConfigurationProvider configuration,
    IOptions<PublicApiOptions> options,
    ILogger<PublicWebPushConfigurationFunction> logger)
{
    private readonly PublicApiOptions _options = options.Value;

    [Function("get-web-push-configuration")]
    public async Task<IActionResult> GetAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", "options", Route = "web-push/config")] HttpRequest request)
    {
        ApplySafeHeaders(request);
        if (!ApplyCors(request))
        {
            return new StatusCodeResult(StatusCodes.Status403Forbidden);
        }

        if (HttpMethods.IsOptions(request.Method))
        {
            request.HttpContext.Response.Headers.AccessControlAllowMethods = "GET, OPTIONS";
            request.HttpContext.Response.Headers.AccessControlMaxAge = "600";
            return new NoContentResult();
        }

        try
        {
            return new OkObjectResult(await configuration.GetAsync(request.HttpContext.RequestAborted));
        }
        catch (Exception)
        {
            logger.LogError("Falha sanitizada ao obter a configuração pública de Web Push.");
            return new StatusCodeResult(StatusCodes.Status503ServiceUnavailable);
        }
    }

    private bool ApplyCors(HttpRequest request)
    {
        var origin = request.Headers.Origin.ToString();
        if (string.IsNullOrEmpty(origin)) return true;
        if (!string.Equals(origin, _options.AllowedOrigin, StringComparison.Ordinal)) return false;
        request.HttpContext.Response.Headers.AccessControlAllowOrigin = origin;
        request.HttpContext.Response.Headers.Append("Vary", "Origin");
        return true;
    }

    private static void ApplySafeHeaders(HttpRequest request)
    {
        request.HttpContext.Response.Headers.CacheControl = "no-store";
        request.HttpContext.Response.Headers.Append("X-Content-Type-Options", "nosniff");
        request.HttpContext.Response.Headers.Append("Referrer-Policy", "no-referrer");
    }
}
