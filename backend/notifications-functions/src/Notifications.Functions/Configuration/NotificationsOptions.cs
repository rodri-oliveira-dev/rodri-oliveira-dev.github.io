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
