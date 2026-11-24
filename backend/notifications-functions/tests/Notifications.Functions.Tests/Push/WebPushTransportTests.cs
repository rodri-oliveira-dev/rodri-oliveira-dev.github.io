using System.Net;
using System.Security.Cryptography;
using Lib.Net.Http.WebPush;
using Microsoft.Extensions.Options;
using Notifications.Functions.Configuration;
using Notifications.Functions.Push;
using Notifications.Functions.Subscriptions;

namespace Notifications.Functions.Tests.Push;

public sealed class WebPushTransportTests
{
    [Theory]
    [InlineData(HttpStatusCode.Created, (int)PushDeliveryStatus.Succeeded)]
    [InlineData(HttpStatusCode.Gone, (int)PushDeliveryStatus.SubscriptionExpired)]
    [InlineData(HttpStatusCode.TooManyRequests, (int)PushDeliveryStatus.TransientFailure)]
    [InlineData(HttpStatusCode.BadRequest, (int)PushDeliveryStatus.PermanentFailure)]
    public async Task SendAsync_ClassifiesPushServiceResponseWithoutNetwork(
        HttpStatusCode responseCode,
        int expected)
    {
        var handler = new StubHttpMessageHandler(responseCode);
        var client = new PushServiceClient(new HttpClient(handler))
        {
            AutoRetryAfter = false,
            MaxRetriesAfter = 1,
        };
        var transport = new WebPushTransport(client, Options.Create(new WebPushOptions()));

        var result = await transport.SendAsync(
            CreateRecord("https://fcm.googleapis.com/fcm/send/test-only"),
            "{\"title\":\"Teste\"}",
            "test-topic",
            CreateVapidCredentials(),
            CancellationToken.None);

        Assert.Equal((PushDeliveryStatus)expected, result);
        Assert.Equal(1, handler.RequestCount);
        Assert.Equal("fcm.googleapis.com", handler.LastRequestUri!.Host);
    }

    [Fact]
    public async Task SendAsync_BlocksUntrustedDestinationBeforeHttpClient()
    {
        var handler = new StubHttpMessageHandler(HttpStatusCode.Created);
        var transport = new WebPushTransport(
            new PushServiceClient(new HttpClient(handler)),
            Options.Create(new WebPushOptions()));

        var result = await transport.SendAsync(
            CreateRecord("https://attacker.example.test/push"),
            "{}",
            "test-topic",
            CreateVapidCredentials(),
            CancellationToken.None);

        Assert.Equal(PushDeliveryStatus.PermanentFailure, result);
        Assert.Equal(0, handler.RequestCount);
    }

    private static SubscriptionRecord CreateRecord(string endpoint)
    {
        var subscription = Subscriptions.WebPushSubscriptionValidatorTests.CreateValid() with { Endpoint = endpoint };
        var normalized = WebPushSubscriptionValidator.ValidateAndNormalize(subscription, DateTimeOffset.UtcNow);
        var (id, partitionKey) = WebPushSubscriptionValidator.DeriveIdentity(normalized.Endpoint);
        return new(id, partitionKey, normalized, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, "etag-test");
    }

    private static VapidCredentials CreateVapidCredentials()
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var parameters = key.ExportParameters(true);
        var publicKey = new byte[65];
        publicKey[0] = 0x04;
        parameters.Q.X!.CopyTo(publicKey, 1);
        parameters.Q.Y!.CopyTo(publicKey, 33);
        return new(
            "https://example.test",
            ToBase64Url(publicKey),
            ToBase64Url(parameters.D!));
    }

    private static string ToBase64Url(byte[] value) => Convert.ToBase64String(value)
        .TrimEnd('=')
        .Replace('+', '-')
        .Replace('/', '_');

    private sealed class StubHttpMessageHandler(HttpStatusCode statusCode) : HttpMessageHandler
    {
        public int RequestCount { get; private set; }
        public Uri? LastRequestUri { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            RequestCount++;
            LastRequestUri = request.RequestUri;
            return Task.FromResult(new HttpResponseMessage(statusCode));
        }
    }
}
