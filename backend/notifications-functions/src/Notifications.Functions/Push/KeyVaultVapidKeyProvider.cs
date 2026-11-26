using Azure.Security.KeyVault.Secrets;
using Microsoft.Extensions.Options;
using Notifications.Functions.Configuration;
using System.Security.Cryptography;

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

internal static class VapidKeyMaterialValidator
{
    private const int PrivateKeyLength = 32;
    private const int PublicKeyLength = 65;

    public static bool IsValidPair(string publicKey, string privateKey)
    {
        if (!TryDecode(publicKey, out var publicBytes)
            || !TryDecode(privateKey, out var privateBytes))
        {
            return false;
        }

        try
        {
            if (publicBytes.Length != PublicKeyLength
                || publicBytes[0] != 0x04
                || privateBytes.Length != PrivateKeyLength)
            {
                return false;
            }

            using var signer = ECDsa.Create(new ECParameters
            {
                Curve = ECCurve.NamedCurves.nistP256,
                D = privateBytes,
            });
            var derived = signer.ExportParameters(includePrivateParameters: false);
            Span<byte> expected = stackalloc byte[PublicKeyLength];
            expected[0] = 0x04;
            derived.Q.X!.CopyTo(expected[1..33]);
            derived.Q.Y!.CopyTo(expected[33..]);
            return CryptographicOperations.FixedTimeEquals(publicBytes, expected);
        }
        catch (CryptographicException)
        {
            return false;
        }
        catch (ArgumentException)
        {
            return false;
        }
        finally
        {
            CryptographicOperations.ZeroMemory(privateBytes);
        }
    }

    private static bool TryDecode(string value, out byte[] bytes)
    {
        bytes = [];
        if (string.IsNullOrWhiteSpace(value)
            || value.Any(character => !char.IsAsciiLetterOrDigit(character) && character is not '-' and not '_')
            || value.Length % 4 == 1)
        {
            return false;
        }

        var padded = value.Replace('-', '+').Replace('_', '/');
        padded += new string('=', (4 - padded.Length % 4) % 4);
        try
        {
            bytes = Convert.FromBase64String(padded);
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }
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

            if (!VapidKeyMaterialValidator.IsValidPair(publicKey, privateKey))
            {
                throw new InvalidOperationException("A configuração VAPID no Key Vault é inválida.");
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
