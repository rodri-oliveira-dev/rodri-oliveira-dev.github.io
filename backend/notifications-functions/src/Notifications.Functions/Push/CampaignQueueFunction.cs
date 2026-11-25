using Microsoft.Azure.Functions.Worker;
using System.Text.Json;

namespace Notifications.Functions.Push;

public sealed class CampaignQueueFunction
{
    private readonly ICampaignProcessor _processor;

    public CampaignQueueFunction(ICampaignProcessor processor)
    {
        _processor = processor;
    }

    [Function("ProcessWebPushCampaign")]
    [QueueOutput("web-push-campaigns", Connection = "CampaignQueue")]
    public async Task<string?> RunAsync(
        [QueueTrigger("web-push-campaigns", Connection = "CampaignQueue")] string message,
        CancellationToken cancellationToken)
    {
        var workItem = ParseWorkItem(message);
        var result = await _processor.ProcessAsync(workItem, cancellationToken);
        return result.ContinuationToken is null
            ? null
            : JsonSerializer.Serialize(workItem with { ContinuationToken = result.ContinuationToken });
    }

    private static CampaignWorkItem ParseWorkItem(string message)
    {
        if (!string.IsNullOrWhiteSpace(message) && message.TrimStart().StartsWith('{'))
        {
            return JsonSerializer.Deserialize<CampaignWorkItem>(message)
                ?? new CampaignWorkItem(string.Empty);
        }

        return new CampaignWorkItem(message);
    }
}
