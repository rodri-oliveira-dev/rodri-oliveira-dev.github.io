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
