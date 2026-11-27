using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Notifications.Functions.Push;

namespace Notifications.Functions.Subscriptions;

public sealed record WebPushSubscriptionInput(
    string Endpoint,
    string P256Dh,
    string Auth,
    string Locale,
    string PurposeId,
    string ConsentVersion,
    string PrivacyNoticeVersion,
    bool ConsentGranted,
    string ConsentMethod);

public sealed record SubscriptionRecord(
    string Id,
    string PartitionKey,
    WebPushSubscriptionInput Subscription,
    DateTimeOffset ConsentGrantedAtUtc,
    DateTimeOffset ExpiresAtUtc,
    string Generation,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    string ETag);

public enum SubscriptionMutationStatus
{
    Created,
    Updated,
    Deleted,
    Duplicate,
    NotFound,
    ConcurrencyConflict,
}

public sealed record SubscriptionMutationResult(
    SubscriptionMutationStatus Status,
    string Id,
    string PartitionKey,
    string? ETag,
    double RequestCharge);

public static partial class WebPushSubscriptionValidator
{
    public const string SupportedLocale = "pt-BR";
    public const string SupportedPurposeId = "new-articles-pt-br";
    public const string SupportedConsentVersion = "1.0.0";
    public const string SupportedPrivacyNoticeVersion = "draft-1";
    public const string SupportedConsentMethod = "explicit-button";
    public const int MaximumEndpointLength = 2048;
    public const int SubscriptionIdLength = 47;

    public static WebPushSubscriptionInput ValidateAndNormalize(WebPushSubscriptionInput input)
    {
        ArgumentNullException.ThrowIfNull(input);

        var endpoint = ValidateEndpoint(input.Endpoint);
        ValidateKey(input.P256Dh, 65, true, nameof(input.P256Dh));
        ValidateKey(input.Auth, 16, false, nameof(input.Auth));

        if (!input.ConsentGranted ||
            !string.Equals(input.Locale, SupportedLocale, StringComparison.Ordinal) ||
            !string.Equals(input.PurposeId, SupportedPurposeId, StringComparison.Ordinal) ||
            !string.Equals(input.ConsentVersion, SupportedConsentVersion, StringComparison.Ordinal) ||
            !string.Equals(input.PrivacyNoticeVersion, SupportedPrivacyNoticeVersion, StringComparison.Ordinal) ||
            !string.Equals(input.ConsentMethod, SupportedConsentMethod, StringComparison.Ordinal))
        {
            throw new ArgumentException("O consentimento informado não é aceito.", nameof(input));
        }

        return input with { Endpoint = endpoint };
    }

    public static (string Id, string PartitionKey) DeriveIdentity(string normalizedEndpoint)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(normalizedEndpoint);
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(normalizedEndpoint));
        var id = $"sub_{Base64Url.Encode(digest)}";
        return (id, id);
    }

    public static bool IsValidSubscriptionId(string? value) =>
        value is not null && value.Length == SubscriptionIdLength && SubscriptionIdPattern().IsMatch(value);

    private static string ValidateEndpoint(string value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > MaximumEndpointLength ||
            !Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            !PushEndpointPolicy.IsAllowed(uri) ||
            (!string.IsNullOrEmpty(uri.Query) && uri.Query.Length > 1024))
        {
            throw new ArgumentException("O endpoint Web Push é inválido.", nameof(value));
        }

        return uri.GetComponents(UriComponents.HttpRequestUrl, UriFormat.UriEscaped);
    }

    private static void ValidateKey(string value, int expectedLength, bool requirePoint, string parameterName)
    {
        if (!Base64Url.TryDecode(value, out var bytes) || bytes.Length != expectedLength ||
            (requirePoint && bytes[0] != 0x04))
        {
            throw new ArgumentException("O material criptográfico Web Push é inválido.", parameterName);
        }

        if (!requirePoint)
        {
            return;
        }

        try
        {
            using var key = ECDiffieHellman.Create(new ECParameters
            {
                Curve = ECCurve.NamedCurves.nistP256,
                Q = new ECPoint { X = bytes[1..33], Y = bytes[33..65] },
            });
        }
        catch (CryptographicException exception)
        {
            throw new ArgumentException("O material criptográfico Web Push é inválido.", parameterName, exception);
        }
    }

    [GeneratedRegex("^sub_[A-Za-z0-9_-]{43}$", RegexOptions.CultureInvariant)]
    private static partial Regex SubscriptionIdPattern();
}

internal static class Base64Url
{
    public static string Encode(ReadOnlySpan<byte> value) => Convert.ToBase64String(value)
        .TrimEnd('=')
        .Replace('+', '-')
        .Replace('/', '_');

    public static bool TryDecode(string? value, out byte[] bytes)
    {
        bytes = [];
        if (string.IsNullOrWhiteSpace(value) || value.Length > 256 ||
            value.Any(character => !char.IsAsciiLetterOrDigit(character) && character is not '-' and not '_'))
        {
            return false;
        }

        try
        {
            bytes = Convert.FromBase64String(value.Replace('-', '+').Replace('_', '/')
                .PadRight((value.Length + 3) / 4 * 4, '='));
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
