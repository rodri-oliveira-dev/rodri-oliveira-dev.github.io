using Notifications.Functions.Configuration;
using Notifications.Functions.Push;
using System.Security.Cryptography;

namespace Notifications.Functions.Tests.Push;

public sealed class KeyVaultVapidKeyProviderTests
{
    [Fact]
    public async Task GetAsync_ReadsNamedSecretsOnceWithinCacheWindow()
    {
        var keys = CreateKeyPair();
        var reader = new FakeSecretValueReader(keys.PublicKey, keys.PrivateKey);
        var time = new MutableTimeProvider(new(2026, 11, 24, 12, 0, 0, TimeSpan.Zero));
        using var provider = new KeyVaultVapidKeyProvider(
            reader,
            new WebPushOptions(),
            time);

        var first = await provider.GetAsync(CancellationToken.None);
        var second = await provider.GetAsync(CancellationToken.None);

        Assert.Same(first, second);
        Assert.Equal(2, reader.ReadCount);
        Assert.Equal(keys.PublicKey, first.PublicKey);
        Assert.Equal(keys.PrivateKey, first.PrivateKey);
    }

    [Fact]
    public async Task GetAsync_RejectsMismatchedPairWithoutExposingValues()
    {
        var publicKeys = CreateKeyPair();
        var privateKeys = CreateKeyPair();
        using var provider = new KeyVaultVapidKeyProvider(
            new FakeSecretValueReader(publicKeys.PublicKey, privateKeys.PrivateKey),
            new WebPushOptions(),
            TimeProvider.System);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(
            () => provider.GetAsync(CancellationToken.None));

        Assert.DoesNotContain(publicKeys.PublicKey, error.Message, StringComparison.Ordinal);
        Assert.DoesNotContain(privateKeys.PrivateKey, error.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("", "")]
    [InlineData("not-base64url!", "not-base64url!")]
    [InlineData("AA", "AA")]
    public void Validator_RejectsMalformedMaterial(string publicKey, string privateKey)
    {
        Assert.False(VapidKeyMaterialValidator.IsValidPair(publicKey, privateKey));
    }

    [Fact]
    public void Validator_RejectsInvalidValidLengthScalar()
    {
        var publicBytes = new byte[65];
        publicBytes[0] = 0x04;

        Assert.False(VapidKeyMaterialValidator.IsValidPair(
            Encode(publicBytes),
            Encode(new byte[32])));
    }

    private static (string PublicKey, string PrivateKey) CreateKeyPair()
    {
        using var signer = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var parameters = signer.ExportParameters(includePrivateParameters: true);
        var publicBytes = new byte[65];
        publicBytes[0] = 0x04;
        parameters.Q.X!.CopyTo(publicBytes, 1);
        parameters.Q.Y!.CopyTo(publicBytes, 33);
        return (Encode(publicBytes), Encode(parameters.D!));
    }

    private static string Encode(byte[] value) => Convert.ToBase64String(value)
        .TrimEnd('=')
        .Replace('+', '-')
        .Replace('/', '_');

    private sealed class FakeSecretValueReader(string publicKey, string privateKey) : ISecretValueReader
    {
        public int ReadCount { get; private set; }

        public Task<string> GetValueAsync(string secretName, CancellationToken cancellationToken)
        {
            ReadCount++;
            return Task.FromResult(secretName.Contains("public", StringComparison.Ordinal)
                ? publicKey
                : privateKey);
        }
    }

    private sealed class MutableTimeProvider(DateTimeOffset value) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => value;
    }
}
