using System.Text.Json;
using System.Text.Json.Serialization;
using Azure;
using Azure.Identity;
using Azure.Storage.Queues;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Notifications.Functions.Configuration;
using Notifications.Functions.Publications;
using Notifications.Functions.Push;

var jsonOptions = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    PropertyNameCaseInsensitive = true,
    WriteIndented = true,
    Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
};

if (args.Length == 0)
{
    throw new ArgumentException("Informe prepare, enqueue ou complete.");
}

var configuration = new ConfigurationBuilder().AddEnvironmentVariables().Build();
var services = new ServiceCollection();
services.AddLogging(builder => builder.AddSimpleConsole(options => options.SingleLine = true));
services.AddNotificationsBackend(configuration);
await using var provider = services.BuildServiceProvider();

switch (args[0])
{
    case "prepare" when args.Length == 4:
        await PrepareAsync(args[1], args[2], args[3]);
        break;
    case "enqueue" when args.Length == 4:
        await EnqueueAsync(args[1], args[2], args[3]);
        break;
    case "complete" when args.Length == 3:
        await CompleteAsync(args[1], args[2]);
        break;
    default:
        throw new ArgumentException("Uso inválido do orquestrador.");
}

async Task PrepareAsync(string evidencePath, string manifestPath, string summaryPath)
{
    var evidence = await ReadAsync<PublicationEvidence>(evidencePath);
    var revision = new PublishedRevision(
        evidence.Sha,
        evidence.Sequence,
        evidence.PublishedAtUtc,
        evidence.SourceRef,
        evidence.Conclusion,
        evidence.IsLatestSuccessfulDeployment,
        new PublicationCatalogSnapshot(
            evidence.Catalogs.LinkedInPtBrJson,
            evidence.Catalogs.DevCommunityEnglishJson,
            evidence.Catalogs.HashnodeSpanishJson));
    var result = await provider.GetRequiredService<ICampaignReconciliationService>().PrepareAsync(
        revision,
        new CampaignReconciliationOptions(),
        CancellationToken.None);
    await WriteAsync(manifestPath, result.Manifest);
    await WriteAsync(summaryPath, result);
}

async Task EnqueueAsync(string manifestPath, string resultsPath, string queueUri)
{
    if (!Uri.TryCreate(queueUri, UriKind.Absolute, out var endpoint) || endpoint.Scheme != Uri.UriSchemeHttps ||
        !endpoint.Host.EndsWith(".queue.core.windows.net", StringComparison.OrdinalIgnoreCase) ||
        !string.Equals(endpoint.AbsolutePath, "/web-push-campaigns", StringComparison.Ordinal))
    {
        throw new ArgumentException("A URI da fila de campanhas é inválida.", nameof(queueUri));
    }

    var manifest = await ReadAsync<CampaignEnqueueManifestItem[]>(manifestPath);
    if (manifest.Length > 25 ||
        manifest.Select(item => item.CampaignId).Distinct(StringComparer.Ordinal).Count() != manifest.Length ||
        manifest.Any(item => !CampaignIdentity.IsValidCampaignId(item.CampaignId) ||
            item.ClaimId.Length != 32 || !item.ClaimId.All(char.IsAsciiHexDigit) ||
            item.AttemptCount is < 1 or > 3))
    {
        throw new InvalidDataException("O manifesto de enqueue excede o limite ou contém duplicatas.");
    }

    var queue = new QueueClient(endpoint, new DefaultAzureCredential(), new QueueClientOptions
    {
        MessageEncoding = QueueMessageEncoding.None,
        Retry = { MaxRetries = 0, NetworkTimeout = TimeSpan.FromSeconds(10) },
    });
    var outcomes = new List<CampaignEnqueueOutcome>(manifest.Length);
    foreach (var item in manifest)
    {
        var failure = CampaignEnqueueFailure.None;
        try
        {
            await queue.SendMessageAsync(item.CampaignId, timeToLive: TimeSpan.FromDays(1));
        }
        catch (RequestFailedException exception)
        {
            failure = CampaignEnqueueFailureClassifier.FromHttpStatus(exception.Status);
        }
        catch (Exception exception) when (exception is OperationCanceledException or HttpRequestException)
        {
            failure = CampaignEnqueueFailureClassifier.FromTransportException(exception);
        }

        outcomes.Add(new(item.CampaignId, item.ClaimId, item.AttemptCount, failure));
    }

    await WriteAsync(resultsPath, outcomes);
    Console.WriteLine($"Enqueue concluído: total={outcomes.Count}, falhas={outcomes.Count(item => item.Failure != CampaignEnqueueFailure.None)}.");
}

async Task CompleteAsync(string resultsPath, string summaryPath)
{
    var outcomes = await ReadAsync<CampaignEnqueueOutcome[]>(resultsPath);
    var result = await provider.GetRequiredService<ICampaignReconciliationService>().CompleteAsync(
        outcomes,
        new CampaignReconciliationOptions(),
        CancellationToken.None);
    await WriteAsync(summaryPath, result);
}

async Task<T> ReadAsync<T>(string path) =>
    JsonSerializer.Deserialize<T>(await File.ReadAllTextAsync(path), jsonOptions)
    ?? throw new InvalidDataException("JSON operacional ausente ou inválido.");

Task WriteAsync<T>(string path, T value) =>
    File.WriteAllTextAsync(path, JsonSerializer.Serialize(value, jsonOptions) + Environment.NewLine);

internal sealed record PublicationEvidence(
    string Sha,
    long Sequence,
    DateTimeOffset PublishedAtUtc,
    string SourceRef,
    PublicationConclusion Conclusion,
    bool IsLatestSuccessfulDeployment,
    PublicationCatalogEvidence Catalogs);

internal sealed record PublicationCatalogEvidence(
    string LinkedInPtBrJson,
    string DevCommunityEnglishJson,
    string HashnodeSpanishJson);
