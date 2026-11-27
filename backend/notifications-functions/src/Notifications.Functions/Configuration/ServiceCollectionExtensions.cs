using Azure.Identity;
using Azure.Security.KeyVault.Secrets;
using Lib.Net.Http.WebPush;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Notifications.Functions.Health;
using Notifications.Functions.Push;
using Notifications.Functions.Security;
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

        services
            .AddOptions<WebPushOptions>()
            .Bind(configuration.GetSection(WebPushOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services
            .AddOptions<PublicApiOptions>()
            .Bind(configuration.GetSection(PublicApiOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddSingleton<IHealthStatusService, HealthStatusService>();
        services.AddSingleton(TimeProvider.System);
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
        services.AddSingleton(static serviceProvider =>
        {
            var options = serviceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<CosmosOptions>>().Value;
            return serviceProvider.GetRequiredService<CosmosClient>().GetContainer(
                options.CosmosDatabaseName,
                options.CosmosContainerName);
        });
        services.AddSingleton<ISubscriptionDocumentStore, CosmosSubscriptionDocumentStore>();
        services.AddSingleton<ISubscriptionRepository, CosmosSubscriptionRepository>();
        services.AddSingleton<IAbuseProtection, CosmosAbuseProtection>();
        services.AddSingleton<IApiConcurrencyLimiter, ApiConcurrencyLimiter>();
        services.AddSingleton(static serviceProvider =>
        {
            var options = serviceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<WebPushOptions>>().Value;
            return new SecretClient(options.KeyVaultUri, new DefaultAzureCredential());
        });
        services.AddSingleton<ISecretValueReader, KeyVaultSecretValueReader>();
        services.AddSingleton<IVapidKeyProvider, KeyVaultVapidKeyProvider>();
        services.AddSingleton(static serviceProvider =>
        {
            var options = serviceProvider.GetRequiredService<Microsoft.Extensions.Options.IOptions<WebPushOptions>>().Value;
            var handler = new SocketsHttpHandler
            {
                AllowAutoRedirect = false,
                ConnectTimeout = TimeSpan.FromSeconds(Math.Min(options.RequestTimeoutSeconds, 5)),
            };
            var boundedHandler = new BoundedResponseContentHandler(
                handler,
                TimeSpan.FromSeconds(options.RequestTimeoutSeconds));
            var httpClient = new HttpClient(boundedHandler)
            {
                Timeout = Timeout.InfiniteTimeSpan,
            };
            return new PushServiceClient(httpClient)
            {
                AutoRetryAfter = false,
                MaxRetriesAfter = 1,
                DefaultTimeToLive = options.PushTimeToLiveSeconds,
            };
        });
        services.AddSingleton<IWebPushTransport, WebPushTransport>();
        services.AddSingleton<ICampaignCatalog, ConfigurationCampaignCatalog>();
        services.AddSingleton<ICampaignProcessor, CampaignProcessor>();

        return services;
    }
}
