namespace Notifications.Functions.Push;

internal sealed class BoundedResponseContentHandler : DelegatingHandler
{
    internal const int DefaultMaximumResponseBytes = 16 * 1024;

    private readonly TimeSpan _deadline;
    private readonly int _maximumResponseBytes;

    public BoundedResponseContentHandler(
        HttpMessageHandler innerHandler,
        TimeSpan deadline,
        int maximumResponseBytes = DefaultMaximumResponseBytes)
        : base(innerHandler)
    {
        ArgumentOutOfRangeException.ThrowIfLessThanOrEqual(deadline, TimeSpan.Zero);
        ArgumentOutOfRangeException.ThrowIfLessThan(maximumResponseBytes, 1);
        _deadline = deadline;
        _maximumResponseBytes = maximumResponseBytes;
    }

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        using var deadlineCancellation = new CancellationTokenSource(_deadline);
        using var linkedCancellation = CancellationTokenSource.CreateLinkedTokenSource(
            cancellationToken,
            deadlineCancellation.Token);

        HttpResponseMessage? response = null;
        try
        {
            response = await base.SendAsync(request, linkedCancellation.Token);
            if (response.Content is null)
            {
                return response;
            }

            var originalContent = response.Content;
            await using var stream = await originalContent.ReadAsStreamAsync(linkedCancellation.Token);
            using var buffer = new MemoryStream();
            var chunk = new byte[Math.Min(4096, _maximumResponseBytes + 1)];
            while (true)
            {
                var count = await stream.ReadAsync(chunk, linkedCancellation.Token);
                if (count == 0)
                {
                    break;
                }

                await buffer.WriteAsync(chunk.AsMemory(0, count), linkedCancellation.Token);
                if (buffer.Length > _maximumResponseBytes)
                {
                    response.Dispose();
                    throw new WebPushResponseTooLargeException(_maximumResponseBytes);
                }
            }

            var bufferedContent = new ByteArrayContent(buffer.ToArray());
            foreach (var header in originalContent.Headers)
            {
                bufferedContent.Headers.TryAddWithoutValidation(header.Key, header.Value);
            }

            response.Content = bufferedContent;
            originalContent.Dispose();
            return response;
        }
        catch (OperationCanceledException exception) when (
            !cancellationToken.IsCancellationRequested && deadlineCancellation.IsCancellationRequested)
        {
            response?.Dispose();
            throw new WebPushResponseTimeoutException(_deadline, exception);
        }
    }
}

internal sealed class WebPushResponseTimeoutException(TimeSpan deadline, Exception innerException)
    : TimeoutException($"Web Push response exceeded the {deadline.TotalSeconds:0.###}-second deadline.", innerException);

internal sealed class WebPushResponseTooLargeException(int maximumResponseBytes)
    : InvalidOperationException($"Web Push response exceeded the {maximumResponseBytes}-byte limit.");
