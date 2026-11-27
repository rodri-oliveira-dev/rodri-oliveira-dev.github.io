using System.Security.Cryptography;
using Notifications.Functions.Subscriptions;

namespace Notifications.Functions.Tests.Subscriptions;

public sealed class WebPushSubscriptionValidatorTests
{
    [Fact]
    public void ValidateAndNormalize_AcceptsOnlyApprovedContract()
    {
        var normalized = WebPushSubscriptionValidator.ValidateAndNormalize(CreateValid());
        var identity = WebPushSubscriptionValidator.DeriveIdentity(normalized.Endpoint);
        Assert.Equal("https://fcm.googleapis.com/fcm/send/a%20b?token=value", normalized.Endpoint);
        Assert.Matches("^sub_[A-Za-z0-9_-]{43}$", identity.Id);
        Assert.Equal(identity.Id, identity.PartitionKey);
    }

    [Theory]
    [InlineData("http://fcm.googleapis.com/fcm/send/a")]
    [InlineData("https://127.0.0.1/send")]
    [InlineData("https://user:password@fcm.googleapis.com/fcm/send/a")]
    [InlineData("https://fcm.googleapis.com:8443/fcm/send/a")]
    [InlineData("https://fcm.googleapis.com.attacker.example/fcm/send/a")]
    [InlineData("https://fcm.googleapis.com/")]
    public void ValidateAndNormalize_RejectsSsrfAndMalformedEndpoints(string endpoint) =>
        Assert.Throws<ArgumentException>(() =>
            WebPushSubscriptionValidator.ValidateAndNormalize(CreateValid() with { Endpoint = endpoint }));

    [Fact]
    public void ValidateAndNormalize_RejectsMissingStaleOrAlteredConsent()
    {
        Assert.Throws<ArgumentException>(() => WebPushSubscriptionValidator.ValidateAndNormalize(CreateValid() with { ConsentGranted = false }));
        Assert.Throws<ArgumentException>(() => WebPushSubscriptionValidator.ValidateAndNormalize(CreateValid() with { ConsentVersion = "0.9.0" }));
        Assert.Throws<ArgumentException>(() => WebPushSubscriptionValidator.ValidateAndNormalize(CreateValid() with { PurposeId = "marketing" }));
        Assert.Throws<ArgumentException>(() => WebPushSubscriptionValidator.ValidateAndNormalize(CreateValid() with { Locale = "en" }));
    }

    [Fact]
    public void ValidateAndNormalize_RejectsMalformedKeys()
    {
        Assert.Throws<ArgumentException>(() => WebPushSubscriptionValidator.ValidateAndNormalize(CreateValid() with { Auth = "not+base64" }));
        Assert.Throws<ArgumentException>(() => WebPushSubscriptionValidator.ValidateAndNormalize(CreateValid() with { P256Dh = ToBase64Url(new byte[64]) }));
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
            "https://fcm.googleapis.com/fcm/send/a%20b?token=value",
            ToBase64Url(publicKey),
            ToBase64Url(new byte[16]),
            WebPushSubscriptionValidator.SupportedLocale,
            WebPushSubscriptionValidator.SupportedPurposeId,
            WebPushSubscriptionValidator.SupportedConsentVersion,
            WebPushSubscriptionValidator.SupportedPrivacyNoticeVersion,
            true,
            WebPushSubscriptionValidator.SupportedConsentMethod);
    }

    private static string ToBase64Url(byte[] value) => Convert.ToBase64String(value)
        .TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
