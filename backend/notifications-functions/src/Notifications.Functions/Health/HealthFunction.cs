using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;

namespace Notifications.Functions.Health;

public sealed class HealthFunction(IHealthStatusService healthStatus)
{
    [Function("health")]
    public IActionResult Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "health")]
        HttpRequest request)
    {
        return new OkObjectResult(healthStatus.GetStatus());
    }
}
