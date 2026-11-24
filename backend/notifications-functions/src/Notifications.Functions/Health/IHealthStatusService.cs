namespace Notifications.Functions.Health;

public interface IHealthStatusService
{
    HealthResponse GetStatus();
}
