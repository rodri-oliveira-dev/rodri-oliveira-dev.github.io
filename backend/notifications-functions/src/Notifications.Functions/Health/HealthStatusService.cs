using Microsoft.Extensions.Options;
using Notifications.Functions.Configuration;

namespace Notifications.Functions.Health;

public sealed class HealthStatusService(IOptions<NotificationsOptions> options) : IHealthStatusService
{
    public HealthResponse GetStatus() => new("healthy", options.Value.ServiceName);
}
