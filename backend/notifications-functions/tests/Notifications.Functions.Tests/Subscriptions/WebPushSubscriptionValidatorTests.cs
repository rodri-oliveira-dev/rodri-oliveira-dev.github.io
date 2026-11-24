using System.Security.Cryptography;
using Notifications.Functions.Subscriptions;

namespace Notifications.Functions.Tests.Subscriptions;

public sealed class WebPushSubscriptionValidatorTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 24, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void ValidateAndNormalize_AcceptsStrictPtBrContract()
    {
        var normalized = WebPushSubscriptionValidator.ValidateAndNormalize(CreateValid(), Now);
        var identity = WebPushSubscriptionValidator.DeriveIdentity(normalized.Endpoint);

        Assert.Equal("https://push.example.test/send/a%20b?token=value", normalized.Endpoint);
        Assert.Matches("^[0-9a-f]{64}$", identity.Id);
        Assert.Equal($"v1-{identity.Id[..2]}", identity.PartitionKey);
        Assert.DoesNotContain("example", identity.Id, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("http://push.example.test/send")]
    [InlineData("https://127.0.0.1/send")]
    [InlineData("https://user:password@push.example.test/send")]
    [InlineData("https://push.example.test:8443/send")]
    public void ValidateAndNormalize_RejectsUnsafeEndpoint(string endpoint)
    {
        Assert.Throws<ArgumentException>(() =>
            WebPushSubscriptionValidator.ValidateAndNormalize(CreateValid() with { Endpoint = endpoint }, Now));
    }

    [Fact]
    public void ValidateAndNormalize_RejectsWrongLocaleOrMalformedKeys()
    {
        Assert.Throws<ArgumentException>(() =>
            WebPushSubscriptionValidator.ValidateAndNormalize(CreateValid() with { Locale = "en" }, Now));
        Assert.Throws<ArgumentException>(() =>
            WebPushSubscriptionValidator.ValidateAndNormalize(CreateValid() with { Auth = "not+base64" }, Now));
        Assert.Throws<ArgumentException>(() =>
            WebPushSubscriptionValidator.ValidateAndNormalize(CreateValid() with { P256Dh = ToBase64Url(new byte[64]) }, Now));
    }

    internal static WebPushSubscriptionInput CreateValid()
    {
        using var key = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);
        var point = key.ExportParameters(false).Q;
        var publicKey = new byte[65];
        publicKey[0] = 0x04;
        point.X!.CopyTo(publicKey, 1);
        point.Y!.CopyTo(publicKey, 33);

        return new(
            "https://push.example.test/send/a%20b?token=value",
            ToBase64Url(publicKey),
            ToBase64Url(new byte[16]),
            WebPushSubscriptionValidator.SupportedLocale,
            Now.AddMinutes(-10),
            "privacy-v1");
    }

    private static string ToBase64Url(byte[] value) => Convert.ToBase64String(value)
        .TrimEnd('=')
        .Replace('+', '-')
        .Replace('/', '_');
}
