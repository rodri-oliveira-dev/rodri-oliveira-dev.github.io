using Notifications.Functions.Configuration;
using Notifications.Functions.Push;

namespace Notifications.Functions.Tests.Push;

public sealed class KeyVaultVapidKeyProviderTests
{
    [Fact]
    public async Task GetAsync_ReadsNamedSecretsOnceWithinCacheWindow()
    {
        var reader = new FakeSecretValueReader();
        var time = new MutableTimeProvider(new(2026, 11, 24, 12, 0, 0, TimeSpan.Zero));
        using var provider = new KeyVaultVapidKeyProvider(
            reader,
            new WebPushOptions(),
            time);

        var first = await provider.GetAsync(CancellationToken.None);
        var second = await provider.GetAsync(CancellationToken.None);

        Assert.Same(first, second);
        Assert.Equal(2, reader.ReadCount);
        Assert.Equal("test-public", first.PublicKey);
        Assert.Equal("test-private", first.PrivateKey);
    }

    private sealed class FakeSecretValueReader : ISecretValueReader
    {
        public int ReadCount { get; private set; }

        public Task<string> GetValueAsync(string secretName, CancellationToken cancellationToken)
        {
            ReadCount++;
            return Task.FromResult(secretName.Contains("public", StringComparison.Ordinal)
                ? "test-public"
                : "test-private");
        }
    }

    private sealed class MutableTimeProvider(DateTimeOffset value) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => value;
    }
}
