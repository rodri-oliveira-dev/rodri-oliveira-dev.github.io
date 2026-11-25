using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Notifications.Functions.Health;

namespace Notifications.Functions.Tests.Health;

public sealed class HealthFunctionTests
{
    [Fact]
    public void Run_ReturnsOnlyNonSensitiveHealthData()
    {
        var expected = new HealthResponse("healthy", "test-notifications");
        var function = new HealthFunction(new StubHealthStatusService(expected));
        var request = new DefaultHttpContext().Request;

        var result = function.Run(request);

        var response = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(StatusCodes.Status200OK, response.StatusCode);
        Assert.Equal(expected, Assert.IsType<HealthResponse>(response.Value));
    }

    private sealed class StubHealthStatusService(HealthResponse response) : IHealthStatusService
    {
        public HealthResponse GetStatus() => response;
    }
}
