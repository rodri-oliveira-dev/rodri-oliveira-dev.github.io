using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Notifications.Functions.Health;

namespace Notifications.Functions.Configuration;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddNotificationsBackend(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services
            .AddOptions<NotificationsOptions>()
            .Bind(configuration.GetSection(NotificationsOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddSingleton<IHealthStatusService, HealthStatusService>();

        return services;
    }
}
