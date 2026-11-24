using Microsoft.Azure.Functions.Worker;
using Notifications.Functions.Push;

namespace Notifications.Functions.Tests.Push;

public sealed class CampaignQueueFunctionTests
{
    [Fact]
    public void RunAsync_IsBoundOnlyToPrivateCampaignQueue()
    {
        var method = typeof(CampaignQueueFunction).GetMethod(nameof(CampaignQueueFunction.RunAsync));

        Assert.NotNull(method);
        Assert.Equal("ProcessWebPushCampaign", method.GetCustomAttributes(typeof(FunctionAttribute), false)
            .Cast<FunctionAttribute>()
            .Single()
            .Name);
        var trigger = method.GetParameters()[0]
            .GetCustomAttributes(typeof(QueueTriggerAttribute), false)
            .Cast<QueueTriggerAttribute>()
            .Single();
        Assert.Equal("web-push-campaigns", trigger.QueueName);
        Assert.Equal("CampaignQueue", trigger.Connection);
        var output = method.GetCustomAttributes(typeof(QueueOutputAttribute), false)
            .Cast<QueueOutputAttribute>()
            .Single();
        Assert.Equal("web-push-campaigns", output.QueueName);
        Assert.Equal("CampaignQueue", output.Connection);
    }

    [Fact]
    public async Task RunAsync_EnqueuesOnlyTheNextContinuationUnit()
    {
        var processor = new FakeProcessor(new CampaignProcessResult("next-token"));
        var function = new CampaignQueueFunction(processor);

        var output = await function.RunAsync("article-2026-11", CancellationToken.None);

        Assert.NotNull(output);
        Assert.Contains("article-2026-11", output, StringComparison.Ordinal);
        Assert.Contains("next-token", output, StringComparison.Ordinal);
        Assert.Equal("article-2026-11", processor.WorkItem!.CampaignId);
        Assert.Null(processor.WorkItem.ContinuationToken);
    }

    private sealed class FakeProcessor(CampaignProcessResult result) : ICampaignProcessor
    {
        public CampaignWorkItem? WorkItem { get; private set; }

        public Task<CampaignProcessResult> ProcessAsync(
            CampaignWorkItem workItem,
            CancellationToken cancellationToken)
        {
            WorkItem = workItem;
            return Task.FromResult(result);
        }
    }
}
