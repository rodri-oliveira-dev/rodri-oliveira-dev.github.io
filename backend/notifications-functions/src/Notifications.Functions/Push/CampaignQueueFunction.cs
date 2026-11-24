using Microsoft.Azure.Functions.Worker;

namespace Notifications.Functions.Push;

public sealed class CampaignQueueFunction
{
    private readonly ICampaignProcessor _processor;

    public CampaignQueueFunction(ICampaignProcessor processor)
    {
        _processor = processor;
    }

    [Function("ProcessWebPushCampaign")]
    public Task RunAsync(
        [QueueTrigger("web-push-campaigns", Connection = "CampaignQueue")] string campaignId,
        CancellationToken cancellationToken) =>
        _processor.ProcessAsync(campaignId, cancellationToken);
}
