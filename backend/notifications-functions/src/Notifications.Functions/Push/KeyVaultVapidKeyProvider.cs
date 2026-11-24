using Azure.Security.KeyVault.Secrets;
using Microsoft.Extensions.Options;
using Notifications.Functions.Configuration;

namespace Notifications.Functions.Push;

internal sealed class VapidCredentials
{
    public VapidCredentials(string subject, string publicKey, string privateKey)
    {
        Subject = subject;
        PublicKey = publicKey;
        PrivateKey = privateKey;
    }

    public string Subject { get; }
    public string PublicKey { get; }
    public string PrivateKey { get; }
}

internal interface IVapidKeyProvider
{
    Task<VapidCredentials> GetAsync(CancellationToken cancellationToken);
}

internal interface ISecretValueReader
{
    Task<string> GetValueAsync(string secretName, CancellationToken cancellationToken);
}

internal sealed class KeyVaultSecretValueReader(SecretClient secretClient) : ISecretValueReader
{
    public async Task<string> GetValueAsync(string secretName, CancellationToken cancellationToken)
    {
        var secret = await secretClient.GetSecretAsync(secretName, cancellationToken: cancellationToken);
        return secret.Value.Value;
    }
}

internal sealed class KeyVaultVapidKeyProvider : IVapidKeyProvider, IDisposable
{
    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(15);
    private readonly ISecretValueReader _secretReader;
    private readonly WebPushOptions _options;
    private readonly TimeProvider _timeProvider;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private VapidCredentials? _cached;
    private DateTimeOffset _expiresAtUtc;

    public KeyVaultVapidKeyProvider(ISecretValueReader secretReader, IOptions<WebPushOptions> options)
        : this(secretReader, options.Value, TimeProvider.System)
    {
    }

    internal KeyVaultVapidKeyProvider(
        ISecretValueReader secretReader,
        WebPushOptions options,
        TimeProvider timeProvider)
    {
        _secretReader = secretReader ?? throw new ArgumentNullException(nameof(secretReader));
        _options = options ?? throw new ArgumentNullException(nameof(options));
        _timeProvider = timeProvider ?? throw new ArgumentNullException(nameof(timeProvider));
    }

    public async Task<VapidCredentials> GetAsync(CancellationToken cancellationToken)
    {
        if (_cached is not null && _timeProvider.GetUtcNow() < _expiresAtUtc)
        {
            return _cached;
        }

        await _lock.WaitAsync(cancellationToken);
        try
        {
            if (_cached is not null && _timeProvider.GetUtcNow() < _expiresAtUtc)
            {
                return _cached;
            }

            var publicKey = await _secretReader.GetValueAsync(
                _options.VapidPublicKeySecretName,
                cancellationToken);
            var privateKey = await _secretReader.GetValueAsync(
                _options.VapidPrivateKeySecretName,
                cancellationToken);

            if (string.IsNullOrWhiteSpace(publicKey) || string.IsNullOrWhiteSpace(privateKey))
            {
                throw new InvalidOperationException("A configuração VAPID no Key Vault está incompleta.");
            }

            _cached = new(_options.VapidSubject, publicKey, privateKey);
            _expiresAtUtc = _timeProvider.GetUtcNow().Add(CacheDuration);
            return _cached;
        }
        finally
        {
            _lock.Release();
        }
    }

    public void Dispose() => _lock.Dispose();
}
