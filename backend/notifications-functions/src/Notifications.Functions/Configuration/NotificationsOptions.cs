using System.ComponentModel.DataAnnotations;

namespace Notifications.Functions.Configuration;

public sealed class NotificationsOptions
{
    public const string SectionName = "Notifications";

    [Required]
    public string ServiceName { get; init; } = "notifications-functions";

    [Required]
    public string DeploymentEnvironment { get; init; } = "local";
}

public sealed class CosmosOptions : IValidatableObject
{
    public const string SectionName = "Notifications";

    [Required]
    public Uri? CosmosEndpoint { get; init; }

    [Required]
    public string CosmosDatabaseName { get; init; } = "notifications";

    [Required]
    public string CosmosContainerName { get; init; } = "subscriptions";

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (CosmosEndpoint is null || !CosmosEndpoint.IsAbsoluteUri || CosmosEndpoint.Scheme != Uri.UriSchemeHttps)
        {
            yield return new ValidationResult(
                "CosmosEndpoint deve ser uma URI HTTPS absoluta.",
                [nameof(CosmosEndpoint)]);
        }
    }
}

public sealed class PublicApiOptions : IValidatableObject
{
    public const string SectionName = "Notifications";

    [Required]
    public string AllowedOrigin { get; init; } = "https://rodri-oliveira-dev.github.io";

    [Range(1024, 32768)]
    public int MaximumRequestBodyBytes { get; init; } = 8192;

    [Range(1, 30)]
    public int RequestTimeoutSeconds { get; init; } = 10;

    [Range(1, 32)]
    public int MaximumConcurrentRequestsPerInstance { get; init; } = 8;

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (!Uri.TryCreate(AllowedOrigin, UriKind.Absolute, out var origin) ||
            origin.Scheme != Uri.UriSchemeHttps || origin.AbsolutePath != "/" ||
            !string.IsNullOrEmpty(origin.Query) || !string.IsNullOrEmpty(origin.Fragment))
        {
            yield return new ValidationResult("AllowedOrigin deve ser uma origem HTTPS exata.", [nameof(AllowedOrigin)]);
        }
    }
}
