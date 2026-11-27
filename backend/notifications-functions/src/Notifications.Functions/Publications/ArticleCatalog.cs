using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Notifications.Functions.Publications;

public enum ArticleOrigin
{
    LinkedIn,
    DevCommunity,
    Hashnode,
}

public sealed record PublishedArticle(
    string Id,
    ArticleOrigin Origin,
    string Locale,
    string CanonicalUrl,
    string Title,
    string Description);

public sealed record PublicationCatalogSnapshot(
    string LinkedInPtBrJson,
    string DevCommunityEnglishJson,
    string HashnodeSpanishJson);

public interface IArticleCatalogReader
{
    IReadOnlyList<PublishedArticle> Read(PublicationCatalogSnapshot snapshot);
}

internal sealed partial class JsonArticleCatalogReader : IArticleCatalogReader
{
    private const int MaximumCatalogBytes = 1_048_576;
    private const int MaximumArticlesPerCatalog = 500;

    public IReadOnlyList<PublishedArticle> Read(PublicationCatalogSnapshot snapshot)
    {
        ArgumentNullException.ThrowIfNull(snapshot);
        var articles = new List<PublishedArticle>();
        ReadCatalog(snapshot.LinkedInPtBrJson, ArticleOrigin.LinkedIn, "pt-BR", articles);
        ReadCatalog(snapshot.DevCommunityEnglishJson, ArticleOrigin.DevCommunity, "en", articles);
        ReadCatalog(snapshot.HashnodeSpanishJson, ArticleOrigin.Hashnode, "es-419", articles);

        if (articles.Select(article => article.Id).Distinct(StringComparer.Ordinal).Count() != articles.Count)
        {
            throw new InvalidDataException("O catálogo contém identidades de artigo duplicadas.");
        }

        return articles.OrderBy(article => article.Id, StringComparer.Ordinal).ToArray();
    }

    internal static string DeriveArticleId(ArticleOrigin origin, string locale, string canonicalUrl)
    {
        var material = $"portfolio-article:v1\n{origin}\n{locale}\n{canonicalUrl}";
        return $"article_{Base64Url(SHA256.HashData(Encoding.UTF8.GetBytes(material)))}";
    }

    private static void ReadCatalog(
        string json,
        ArticleOrigin origin,
        string locale,
        ICollection<PublishedArticle> destination)
    {
        if (string.IsNullOrWhiteSpace(json) || Encoding.UTF8.GetByteCount(json) > MaximumCatalogBytes)
        {
            throw new InvalidDataException("O catálogo editorial está ausente ou excede o limite aceito.");
        }

        using var document = JsonDocument.Parse(json, new JsonDocumentOptions
        {
            AllowTrailingCommas = false,
            CommentHandling = JsonCommentHandling.Disallow,
            MaxDepth = 8,
        });
        if (document.RootElement.ValueKind != JsonValueKind.Array ||
            document.RootElement.GetArrayLength() > MaximumArticlesPerCatalog)
        {
            throw new InvalidDataException("O catálogo editorial deve ser uma lista limitada.");
        }

        foreach (var item in document.RootElement.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
            {
                throw new InvalidDataException("O catálogo editorial contém um item inválido.");
            }

            var urlValue = origin == ArticleOrigin.LinkedIn && item.TryGetProperty("finalUrl", out var finalUrl)
                ? finalUrl.GetString()
                : GetRequiredString(item, "url", 2048);
            var canonicalUrl = NormalizeUrl(urlValue, origin);
            var title = GetRequiredString(item, "title", 300);
            var description = GetRequiredString(item, "description", 2_000);
            destination.Add(new(
                DeriveArticleId(origin, locale, canonicalUrl),
                origin,
                locale,
                canonicalUrl,
                title,
                description));
        }
    }

    private static string GetRequiredString(JsonElement item, string propertyName, int maximumLength)
    {
        if (!item.TryGetProperty(propertyName, out var property) ||
            property.ValueKind != JsonValueKind.String ||
            property.GetString() is not { } value ||
            string.IsNullOrWhiteSpace(value) || value != value.Trim() ||
            value.Length > maximumLength || value.Any(char.IsControl))
        {
            throw new InvalidDataException($"A propriedade editorial {propertyName} é inválida.");
        }

        return value;
    }

    private static string NormalizeUrl(string? value, ArticleOrigin origin)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > 2048 ||
            !Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps || !uri.IsDefaultPort ||
            !string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Query) ||
            !string.IsNullOrEmpty(uri.Fragment) || !IsAllowedOrigin(uri, origin))
        {
            throw new InvalidDataException("A URL canônica do artigo é inválida.");
        }

        var path = uri.GetComponents(UriComponents.Path, UriFormat.UriEscaped);
        if (string.IsNullOrEmpty(path) || path.Contains("..", StringComparison.Ordinal))
        {
            throw new InvalidDataException("A URL canônica do artigo é inválida.");
        }

        return new UriBuilder(Uri.UriSchemeHttps, uri.IdnHost.ToLowerInvariant())
        {
            Path = "/" + path.TrimStart('/').TrimEnd('/'),
        }.Uri.AbsoluteUri;
    }

    private static bool IsAllowedOrigin(Uri uri, ArticleOrigin origin) => origin switch
    {
        ArticleOrigin.LinkedIn =>
            string.Equals(uri.IdnHost, "www.linkedin.com", StringComparison.OrdinalIgnoreCase) &&
            LinkedInPath().IsMatch(uri.AbsolutePath),
        ArticleOrigin.DevCommunity =>
            string.Equals(uri.IdnHost, "dev.to", StringComparison.OrdinalIgnoreCase) &&
            DevCommunityPath().IsMatch(uri.AbsolutePath),
        ArticleOrigin.Hashnode =>
            string.Equals(uri.IdnHost, "rodri-oliveira-dev.hashnode.dev", StringComparison.OrdinalIgnoreCase) &&
            HashnodePath().IsMatch(uri.AbsolutePath),
        _ => false,
    };

    private static string Base64Url(ReadOnlySpan<byte> value) => Convert.ToBase64String(value)
        .TrimEnd('=').Replace('+', '-').Replace('/', '_');

    [GeneratedRegex("^/pulse/[^/]+/?$", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase)]
    private static partial Regex LinkedInPath();

    [GeneratedRegex("^/rodri-oliveira-dev/[a-z0-9]+(?:-[a-z0-9]+)*/?$", RegexOptions.CultureInvariant)]
    private static partial Regex DevCommunityPath();

    [GeneratedRegex("^/[a-z0-9]+(?:-[a-z0-9]+)*/?$", RegexOptions.CultureInvariant)]
    private static partial Regex HashnodePath();
}

public interface INotificationEligibilityPolicy
{
    bool IsEligible(PublishedArticle article);
}

internal sealed class PtBrNotificationEligibilityPolicy : INotificationEligibilityPolicy
{
    public bool IsEligible(PublishedArticle article) =>
        article.Origin == ArticleOrigin.LinkedIn &&
        string.Equals(article.Locale, "pt-BR", StringComparison.Ordinal);
}
