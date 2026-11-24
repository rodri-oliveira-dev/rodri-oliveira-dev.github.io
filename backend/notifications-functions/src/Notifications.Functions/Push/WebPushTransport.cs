using System.Net;
using System.Security.Cryptography;
using Lib.Net.Http.WebPush;
using Lib.Net.Http.WebPush.Authentication;
using Microsoft.Extensions.Options;
using Notifications.Functions.Configuration;
using Notifications.Functions.Subscriptions;

namespace Notifications.Functions.Push;

internal enum PushDeliveryStatus
{
    Succeeded,
    SubscriptionExpired,
    PermanentFailure,
    TransientFailure,
}

internal interface IWebPushTransport
{
    Task<PushDeliveryStatus> SendAsync(
        SubscriptionRecord subscription,
        string payload,
        string topic,
        VapidCredentials credentials,
        CancellationToken cancellationToken);
}

internal sealed class WebPushTransport : IWebPushTransport
{
    private readonly PushServiceClient _client;
    private readonly WebPushOptions _options;

    public WebPushTransport(PushServiceClient client, IOptions<WebPushOptions> options)
    {
        _client = client ?? throw new ArgumentNullException(nameof(client));
        _options = options.Value;
    }

    public async Task<PushDeliveryStatus> SendAsync(
        SubscriptionRecord subscription,
        string payload,
        string topic,
        VapidCredentials credentials,
        CancellationToken cancellationToken)
    {
        if (!PushEndpointPolicy.IsAllowed(subscription.Subscription.Endpoint))
        {
            return PushDeliveryStatus.PermanentFailure;
        }

        var target = new PushSubscription
        {
            Endpoint = subscription.Subscription.Endpoint,
            Keys = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["p256dh"] = subscription.Subscription.P256Dh,
                ["auth"] = subscription.Subscription.Auth,
            },
        };
        var message = new PushMessage(payload)
        {
            TimeToLive = _options.PushTimeToLiveSeconds,
            Topic = topic,
            Urgency = PushMessageUrgency.Normal,
        };

        using var authentication = new VapidAuthentication(credentials.PublicKey, credentials.PrivateKey)
        {
            Subject = credentials.Subject,
        };

        try
        {
            await _client.RequestPushMessageDeliveryAsync(
                target,
                message,
                authentication,
                VapidAuthenticationScheme.Vapid,
                cancellationToken);
            return PushDeliveryStatus.Succeeded;
        }
        catch (PushServiceClientException exception) when (
            exception.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone)
        {
            return PushDeliveryStatus.SubscriptionExpired;
        }
        catch (PushServiceClientException exception) when (
            exception.StatusCode == HttpStatusCode.RequestTimeout ||
            exception.StatusCode == HttpStatusCode.TooManyRequests ||
            (int)exception.StatusCode >= 500)
        {
            return PushDeliveryStatus.TransientFailure;
        }
        catch (PushServiceClientException)
        {
            return PushDeliveryStatus.PermanentFailure;
        }
        catch (HttpRequestException)
        {
            return PushDeliveryStatus.TransientFailure;
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return PushDeliveryStatus.TransientFailure;
        }
        catch (Exception exception) when (
            exception is ArgumentException or FormatException or CryptographicException or InvalidOperationException)
        {
            return PushDeliveryStatus.PermanentFailure;
        }
    }
}
