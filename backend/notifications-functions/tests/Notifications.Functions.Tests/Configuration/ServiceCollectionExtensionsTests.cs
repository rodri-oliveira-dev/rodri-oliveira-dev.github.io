using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Notifications.Functions.Configuration;
using Notifications.Functions.Health;

namespace Notifications.Functions.Tests.Configuration;

public sealed class ServiceCollectionExtensionsTests
{
    [Fact]
    public void AddNotificationsBackend_RegistersTypedOptionsAndHealthService()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Notifications:ServiceName"] = "test-notifications",
                ["Notifications:DeploymentEnvironment"] = "test"
            })
            .Build();
        var services = new ServiceCollection();

        services.AddNotificationsBackend(configuration);

        using var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<NotificationsOptions>>().Value;
        var healthStatus = provider.GetRequiredService<IHealthStatusService>();

        Assert.Equal("test-notifications", options.ServiceName);
        Assert.Equal("test", options.DeploymentEnvironment);
        Assert.Equal(new HealthResponse("healthy", "test-notifications"), healthStatus.GetStatus());
    }

    [Fact]
    public void AddNotificationsBackend_RejectsEmptyServiceName()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Notifications:ServiceName"] = string.Empty,
                ["Notifications:DeploymentEnvironment"] = "test"
            })
            .Build();
        var services = new ServiceCollection();
        services.AddNotificationsBackend(configuration);

        using var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<NotificationsOptions>>();

        Assert.Throws<OptionsValidationException>(() => _ = options.Value);
    }
}
