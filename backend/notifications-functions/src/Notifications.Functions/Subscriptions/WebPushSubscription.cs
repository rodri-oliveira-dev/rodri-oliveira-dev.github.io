using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Notifications.Functions.Subscriptions;

public sealed record WebPushSubscriptionInput(
    string Endpoint,
    string P256Dh,
    string Auth,
    string Locale,
    DateTimeOffset ConsentGrantedAtUtc,
    string ConsentVersion);

public sealed record SubscriptionRecord(
    string Id,
    string PartitionKey,
    WebPushSubscriptionInput Subscription,
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
    private const int MaximumEndpointLength = 2048;
    private static readonly DateTimeOffset MinimumConsentDate = new(2020, 1, 1, 0, 0, 0, TimeSpan.Zero);

    public static WebPushSubscriptionInput ValidateAndNormalize(
        WebPushSubscriptionInput input,
        DateTimeOffset utcNow)
    {
        ArgumentNullException.ThrowIfNull(input);

        var endpoint = ValidateEndpoint(input.Endpoint);
        ValidateKey(input.P256Dh, expectedLength: 65, requireUncompressedPoint: true, nameof(input.P256Dh));
        ValidateKey(input.Auth, expectedLength: 16, requireUncompressedPoint: false, nameof(input.Auth));

        if (!string.Equals(input.Locale, SupportedLocale, StringComparison.Ordinal))
        {
            throw new ArgumentException("Somente o idioma pt-BR é aceito nesta versão.", nameof(input));
        }

        if (input.ConsentGrantedAtUtc.Offset != TimeSpan.Zero ||
            input.ConsentGrantedAtUtc < MinimumConsentDate ||
            input.ConsentGrantedAtUtc > utcNow.AddMinutes(5))
        {
            throw new ArgumentException("O consentimento deve usar UTC e um instante válido.", nameof(input));
        }

        if (string.IsNullOrWhiteSpace(input.ConsentVersion) ||
            !ConsentVersionPattern().IsMatch(input.ConsentVersion))
        {
            throw new ArgumentException("A versão do consentimento é inválida.", nameof(input));
        }

        return input with { Endpoint = endpoint };
    }

    public static (string Id, string PartitionKey) DeriveIdentity(string normalizedEndpoint)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(normalizedEndpoint);

        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(normalizedEndpoint));
        var id = Convert.ToHexStringLower(digest);
        return (id, $"v1-{id[..2]}");
    }

    public static string NormalizeEndpoint(string endpoint) => ValidateEndpoint(endpoint);

    private static string ValidateEndpoint(string value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > MaximumEndpointLength ||
            !Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps ||
            !string.IsNullOrEmpty(uri.UserInfo) ||
            !string.IsNullOrEmpty(uri.Fragment) ||
            uri.HostNameType != UriHostNameType.Dns ||
            (!uri.IsDefaultPort && uri.Port != 443))
        {
            throw new ArgumentException("O endpoint Web Push deve ser uma URI HTTPS válida.", nameof(value));
        }

        return uri.GetComponents(UriComponents.HttpRequestUrl, UriFormat.UriEscaped);
    }

    private static void ValidateKey(
        string value,
        int expectedLength,
        bool requireUncompressedPoint,
        string parameterName)
    {
        if (string.IsNullOrWhiteSpace(value) || !Base64UrlPattern().IsMatch(value))
        {
            throw new ArgumentException("A chave deve usar Base64URL sem padding.", parameterName);
        }

        byte[] bytes;
        try
        {
            var padded = value.Replace('-', '+').Replace('_', '/').PadRight((value.Length + 3) / 4 * 4, '=');
            bytes = Convert.FromBase64String(padded);
        }
        catch (FormatException exception)
        {
            throw new ArgumentException("A chave Base64URL é inválida.", parameterName, exception);
        }

        if (bytes.Length != expectedLength || (requireUncompressedPoint && bytes[0] != 0x04))
        {
            throw new ArgumentException("A chave Web Push possui tamanho ou formato inválido.", parameterName);
        }

        if (requireUncompressedPoint)
        {
            try
            {
                using var key = ECDiffieHellman.Create(new ECParameters
                {
                    Curve = ECCurve.NamedCurves.nistP256,
                    Q = new ECPoint
                    {
                        X = bytes[1..33],
                        Y = bytes[33..65],
                    },
                });
            }
            catch (CryptographicException exception)
            {
                throw new ArgumentException("A chave pública P-256 é inválida.", parameterName, exception);
            }
        }
    }

    [GeneratedRegex("^[A-Za-z0-9_-]+$", RegexOptions.CultureInvariant)]
    private static partial Regex Base64UrlPattern();

    [GeneratedRegex("^[a-z0-9][a-z0-9._-]{0,63}$", RegexOptions.CultureInvariant)]
    private static partial Regex ConsentVersionPattern();
}
