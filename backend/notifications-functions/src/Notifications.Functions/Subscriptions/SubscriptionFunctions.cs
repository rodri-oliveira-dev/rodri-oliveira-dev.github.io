using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Notifications.Functions.Configuration;
using Notifications.Functions.Security;

namespace Notifications.Functions.Subscriptions;

public sealed class SubscriptionFunctions
{
    private static readonly JsonSerializerOptions StrictJson = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = false,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        MaxDepth = 8,
    };

    private readonly ISubscriptionRepository _subscriptions;
    private readonly IAbuseProtection _abuseProtection;
    private readonly TimeProvider _timeProvider;
    private readonly PublicApiOptions _options;
    private readonly IApiConcurrencyLimiter _concurrency;
    private readonly ILogger<SubscriptionFunctions> _logger;

    public SubscriptionFunctions(
        ISubscriptionRepository subscriptions,
        IAbuseProtection abuseProtection,
        TimeProvider timeProvider,
        IOptions<PublicApiOptions> options,
        IApiConcurrencyLimiter concurrency,
        ILogger<SubscriptionFunctions> logger)
    {
        _subscriptions = subscriptions;
        _abuseProtection = abuseProtection;
        _timeProvider = timeProvider;
        _options = options.Value;
        _concurrency = concurrency;
        _logger = logger;
    }

    [Function("register-subscription")]
    public Task<IActionResult> RegisterAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", "options", Route = "subscriptions")] HttpRequest request) =>
        ExecuteAsync(request, "POST", async cancellationToken =>
        {
            var contract = await ReadJsonAsync<RegistrationContract>(request, _options.MaximumRequestBodyBytes, cancellationToken);
            if (contract?.Keys is null)
            {
                return BadRequest();
            }

            WebPushSubscriptionInput input;
            try
            {
                input = WebPushSubscriptionValidator.ValidateAndNormalize(new(
                    contract.Endpoint ?? string.Empty,
                    contract.Keys.P256Dh ?? string.Empty,
                    contract.Keys.Auth ?? string.Empty,
                    contract.Locale ?? string.Empty,
                    contract.PurposeId ?? string.Empty,
                    contract.ConsentVersion ?? string.Empty,
                    contract.PrivacyNoticeVersion ?? string.Empty,
                    contract.ConsentGranted,
                    contract.ConsentMethod ?? string.Empty));
            }
            catch (ArgumentException)
            {
                return BadRequest();
            }

            var identity = WebPushSubscriptionValidator.DeriveIdentity(input.Endpoint);
            if (!await _abuseProtection.TryAcquireAsync("register", identity.Id, _timeProvider.GetUtcNow(), cancellationToken))
            {
                return TooManyRequests(request);
            }

            var result = await _subscriptions.RegisterAsync(input, cancellationToken);
            if (!result.Created)
            {
                return new AcceptedResult();
            }

            return new ObjectResult(new RegistrationResponse(
                result.SubscriptionId!, result.CancellationCapability!, result.RecoveryCapability!, result.ExpiresAtUtc!.Value))
            {
                StatusCode = StatusCodes.Status201Created,
            };
        });

    [Function("revoke-subscription")]
    public Task<IActionResult> RevokeAsync(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", "options", Route = "subscriptions")] HttpRequest request) =>
        ExecuteAsync(request, "DELETE", async cancellationToken =>
        {
            var contract = await ReadJsonAsync<RevocationContract>(request, 512, cancellationToken);
            if (contract?.SubscriptionId is null || contract.Capability is null)
            {
                return BadRequest();
            }

            var discriminator = WebPushSubscriptionValidator.IsValidSubscriptionId(contract.SubscriptionId)
                ? contract.SubscriptionId
                : "invalid";
            if (!await _abuseProtection.TryAcquireAsync("revoke", discriminator, _timeProvider.GetUtcNow(), cancellationToken))
            {
                return TooManyRequests(request);
            }

            await _subscriptions.RevokeAsync(contract.SubscriptionId, contract.Capability, cancellationToken);
            return new AcceptedResult();
        });

    private async Task<IActionResult> ExecuteAsync(HttpRequest request, string method, Func<CancellationToken, Task<IActionResult>> action)
    {
        ApplySafeHeaders(request);
        if (!IsAllowedOrigin(request))
        {
            return new StatusCodeResult(StatusCodes.Status403Forbidden);
        }

        if (HttpMethods.IsOptions(request.Method))
        {
            request.HttpContext.Response.Headers.AccessControlAllowMethods = $"{method}, OPTIONS";
            request.HttpContext.Response.Headers.AccessControlAllowHeaders = "content-type";
            request.HttpContext.Response.Headers.AccessControlMaxAge = "600";
            return new NoContentResult();
        }

        if (!request.HasJsonContentType() ||
            request.ContentLength is > 0 && request.ContentLength > _options.MaximumRequestBodyBytes)
        {
            return request.ContentLength > _options.MaximumRequestBodyBytes
                ? new StatusCodeResult(StatusCodes.Status413PayloadTooLarge)
                : new StatusCodeResult(StatusCodes.Status415UnsupportedMediaType);
        }

        if (!await _concurrency.TryEnterAsync(request.HttpContext.RequestAborted))
        {
            return TooManyRequests(request);
        }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(request.HttpContext.RequestAborted);
        timeout.CancelAfter(TimeSpan.FromSeconds(_options.RequestTimeoutSeconds));
        try
        {
            return await action(timeout.Token);
        }
        catch (RequestBodyTooLargeException)
        {
            return new StatusCodeResult(StatusCodes.Status413PayloadTooLarge);
        }
        catch (JsonException)
        {
            return BadRequest();
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Operação da API pública cancelada ou expirada.");
            return new StatusCodeResult(StatusCodes.Status503ServiceUnavailable);
        }
        catch (Exception)
        {
            // Deliberately omit the exception object: Cosmos/HTTP exceptions can contain
            // endpoints, request URIs, headers or account metadata.
            _logger.LogError("Falha sanitizada na API pública de inscrições.");
            return new StatusCodeResult(StatusCodes.Status503ServiceUnavailable);
        }
        finally
        {
            _concurrency.Exit();
        }
    }

    private bool IsAllowedOrigin(HttpRequest request)
    {
        var origin = request.Headers.Origin.ToString();
        if (string.IsNullOrEmpty(origin))
        {
            return true;
        }

        if (!string.Equals(origin, _options.AllowedOrigin, StringComparison.Ordinal))
        {
            return false;
        }

        request.HttpContext.Response.Headers.AccessControlAllowOrigin = origin;
        request.HttpContext.Response.Headers.Append("Vary", "Origin");
        return true;
    }

    private static void ApplySafeHeaders(HttpRequest request)
    {
        request.HttpContext.Response.Headers.CacheControl = "no-store";
        request.HttpContext.Response.Headers.Append("X-Content-Type-Options", "nosniff");
        request.HttpContext.Response.Headers.Append("Referrer-Policy", "no-referrer");
    }

    private static async Task<T?> ReadJsonAsync<T>(HttpRequest request, int maximumBytes, CancellationToken cancellationToken)
    {
        await using var buffer = new MemoryStream(Math.Min(maximumBytes, 4096));
        var bytes = new byte[4096];
        var total = 0;
        while (true)
        {
            var read = await request.Body.ReadAsync(bytes.AsMemory(0, Math.Min(bytes.Length, maximumBytes + 1 - total)), cancellationToken);
            if (read == 0)
            {
                break;
            }

            total += read;
            if (total > maximumBytes)
            {
                throw new RequestBodyTooLargeException();
            }
            await buffer.WriteAsync(bytes.AsMemory(0, read), cancellationToken);
        }

        buffer.Position = 0;
        return await JsonSerializer.DeserializeAsync<T>(buffer, StrictJson, cancellationToken);
    }

    private static IActionResult BadRequest() => new ObjectResult(new ErrorResponse("invalid_request"))
    {
        StatusCode = StatusCodes.Status400BadRequest,
    };

    private static IActionResult TooManyRequests(HttpRequest request)
    {
        request.HttpContext.Response.Headers.RetryAfter = "60";
        return new StatusCodeResult(StatusCodes.Status429TooManyRequests);
    }

    private sealed record RegistrationContract(
        string? Endpoint,
        SubscriptionKeysContract? Keys,
        string? Locale,
        string? PurposeId,
        string? ConsentVersion,
        string? PrivacyNoticeVersion,
        bool ConsentGranted,
        string? ConsentMethod);
    private sealed record SubscriptionKeysContract(string? P256Dh, string? Auth);
    private sealed record RevocationContract(string? SubscriptionId, string? Capability);
    private sealed record RegistrationResponse(string SubscriptionId, string CancellationCapability, string RecoveryCapability, DateTimeOffset ExpiresAtUtc);
    private sealed record ErrorResponse(string Code);
    private sealed class RequestBodyTooLargeException : Exception;
}
