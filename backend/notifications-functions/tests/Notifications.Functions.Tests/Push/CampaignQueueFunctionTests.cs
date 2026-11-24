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
    }
}
