using Azure.Identity;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Notifications.Functions.Health;
using Notifications.Functions.Subscriptions;

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

        services
            .AddOptions<CosmosOptions>()
            .Bind(configuration.GetSection(CosmosOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddSingleton<IHealthStatusService, HealthStatusService>();
        services.AddSingleton(static serviceProvider =>
        {
            var options = serviceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<CosmosOptions>>().Value;
            return new CosmosClient(
                options.CosmosEndpoint!.AbsoluteUri,
                new DefaultAzureCredential(),
                new CosmosClientOptions
                {
                    ApplicationName = "portfolio-notifications",
                    ConnectionMode = ConnectionMode.Direct,
                    SerializerOptions = new CosmosSerializationOptions
                    {
                        PropertyNamingPolicy = CosmosPropertyNamingPolicy.CamelCase,
                    },
                });
        });
        services.AddSingleton<ISubscriptionDocumentStore, CosmosSubscriptionDocumentStore>();
        services.AddSingleton<ISubscriptionRepository, CosmosSubscriptionRepository>();

        return services;
    }
}
