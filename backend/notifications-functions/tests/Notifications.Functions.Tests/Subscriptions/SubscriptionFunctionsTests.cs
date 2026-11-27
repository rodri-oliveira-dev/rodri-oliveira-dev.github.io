using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Notifications.Functions.Configuration;
using Notifications.Functions.Security;
using Notifications.Functions.Subscriptions;

namespace Notifications.Functions.Tests.Subscriptions;

public sealed class SubscriptionFunctionsTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 24, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Register_ReturnsCapabilitiesOnceAndDuplicateIsGeneric()
    {
        var repository = new FakeRepository();
        var function = CreateFunction(repository);
        var first = await function.RegisterAsync(CreateRequest(ValidJson()));
        repository.Duplicate = true;
        var duplicate = await function.RegisterAsync(CreateRequest(ValidJson()));

        var created = Assert.IsType<ObjectResult>(first);
        Assert.Equal(201, created.StatusCode);
        Assert.IsType<AcceptedResult>(duplicate);
        Assert.Equal(2, repository.RegisterCalls);
    }

    [Fact]
    public async Task Register_RejectsUnknownPropertiesAndOversizedBodies()
    {
        var function = CreateFunction(new FakeRepository());
        var malicious = ValidJson().Replace("{", "{\"admin\":true,", StringComparison.Ordinal);
        var unknown = await function.RegisterAsync(CreateRequest(malicious));
        var oversizedRequest = CreateRequest("{}", contentLength: 9000);
        var oversized = await function.RegisterAsync(oversizedRequest);

        Assert.Equal(400, Assert.IsType<ObjectResult>(unknown).StatusCode);
        Assert.Equal(413, Assert.IsType<StatusCodeResult>(oversized).StatusCode);
    }

    [Fact]
    public async Task Cors_AllowsOnlyExactConfiguredOriginButIsNotAuthentication()
    {
        var repository = new FakeRepository();
        var function = CreateFunction(repository);
        var deniedRequest = CreateRequest(ValidJson(), origin: "https://attacker.example");
        var denied = await function.RegisterAsync(deniedRequest);
        var noOrigin = await function.RegisterAsync(CreateRequest(ValidJson()));

        Assert.Equal(403, Assert.IsType<StatusCodeResult>(denied).StatusCode);
        Assert.Equal(201, Assert.IsType<ObjectResult>(noOrigin).StatusCode);
        Assert.Equal(1, repository.RegisterCalls);
    }

    [Fact]
    public async Task Cors_PreflightReturnsOnlyExpectedMethodAndHeader()
    {
        var request = CreateRequest(string.Empty, method: "OPTIONS", origin: "https://rodri-oliveira-dev.github.io", contentLength: 0);
        var function = CreateFunction(new FakeRepository());

        var result = await function.RegisterAsync(request);

        Assert.IsType<NoContentResult>(result);
        Assert.Equal("POST, OPTIONS", request.HttpContext.Response.Headers.AccessControlAllowMethods);
        Assert.Equal("content-type", request.HttpContext.Response.Headers.AccessControlAllowHeaders);
        Assert.False(request.HttpContext.Response.Headers.ContainsKey("Access-Control-Allow-Credentials"));
    }

    [Fact]
    public async Task DistributedRateLimit_FailsClosedWithRetryAfter()
    {
        var request = CreateRequest(ValidJson());
        var function = CreateFunction(new FakeRepository(), new FakeAbuseProtection(false));
        var result = await function.RegisterAsync(request);

        Assert.Equal(429, Assert.IsType<StatusCodeResult>(result).StatusCode);
        Assert.Equal("60", request.HttpContext.Response.Headers.RetryAfter);
    }

    [Fact]
    public async Task Revocation_IsIndistinguishableForValidAndInvalidIdentifiers()
    {
        var repository = new FakeRepository();
        var function = CreateFunction(repository);
        var capability = Convert.ToBase64String(new byte[32]).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        var validId = $"sub_{new string('A', 43)}";

        var valid = await function.RevokeAsync(CreateRequest(JsonSerializer.Serialize(new { subscriptionId = validId, capability }), method: "DELETE"));
        var invalid = await function.RevokeAsync(CreateRequest(JsonSerializer.Serialize(new { subscriptionId = "missing", capability }), method: "DELETE"));

        Assert.IsType<AcceptedResult>(valid);
        Assert.IsType<AcceptedResult>(invalid);
        Assert.Equal(2, repository.RevokeCalls);
    }

    [Fact]
    public async Task PersistenceFailure_ReturnsGenericErrorWithoutSensitiveLogs()
    {
        var logger = new CollectingLogger<SubscriptionFunctions>();
        var repository = new FakeRepository { ThrowOnRegister = true };
        var function = CreateFunction(repository, logger: logger);
        var json = ValidJson();

        var result = await function.RegisterAsync(CreateRequest(json));

        Assert.Equal(503, Assert.IsType<StatusCodeResult>(result).StatusCode);
        var input = WebPushSubscriptionValidatorTests.CreateValid();
        Assert.DoesNotContain(input.Endpoint, logger.Text, StringComparison.Ordinal);
        Assert.DoesNotContain(input.P256Dh, logger.Text, StringComparison.Ordinal);
        Assert.DoesNotContain(input.Auth, logger.Text, StringComparison.Ordinal);
    }

    [Fact]
    public async Task RevocationFailure_DoesNotLogCapabilityOrIdentifier()
    {
        var logger = new CollectingLogger<SubscriptionFunctions>();
        var repository = new FakeRepository { ThrowOnRevoke = true };
        var function = CreateFunction(repository, logger: logger);
        var capability = Convert.ToBase64String(new byte[32]).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        var id = $"sub_{new string('A', 43)}";

        var result = await function.RevokeAsync(CreateRequest(
            JsonSerializer.Serialize(new { subscriptionId = id, capability }), method: "DELETE"));

        Assert.Equal(503, Assert.IsType<StatusCodeResult>(result).StatusCode);
        Assert.DoesNotContain(capability, logger.Text, StringComparison.Ordinal);
        Assert.DoesNotContain(id, logger.Text, StringComparison.Ordinal);
    }

    private static SubscriptionFunctions CreateFunction(
        FakeRepository repository,
        IAbuseProtection? abuse = null,
        ILogger<SubscriptionFunctions>? logger = null) => new(
            repository,
            abuse ?? new FakeAbuseProtection(true),
            new FixedTimeProvider(Now),
            Options.Create(new PublicApiOptions()),
            new FakeConcurrencyLimiter(),
            logger ?? new CollectingLogger<SubscriptionFunctions>());

    private static HttpRequest CreateRequest(string json, string method = "POST", string? origin = null, long? contentLength = null)
    {
        var context = new DefaultHttpContext();
        context.Request.Method = method;
        context.Request.ContentType = "application/json";
        context.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes(json));
        context.Request.ContentLength = contentLength ?? context.Request.Body.Length;
        if (origin is not null) context.Request.Headers.Origin = origin;
        return context.Request;
    }

    private static string ValidJson()
    {
        var input = WebPushSubscriptionValidatorTests.CreateValid();
        return JsonSerializer.Serialize(new
        {
            endpoint = input.Endpoint,
            keys = new { p256Dh = input.P256Dh, auth = input.Auth },
            locale = input.Locale,
            purposeId = input.PurposeId,
            consentVersion = input.ConsentVersion,
            privacyNoticeVersion = input.PrivacyNoticeVersion,
            consentGranted = input.ConsentGranted,
            consentMethod = input.ConsentMethod,
        });
    }

    private sealed class FixedTimeProvider(DateTimeOffset value) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => value;
    }

    private sealed class FakeAbuseProtection(bool allowed) : IAbuseProtection
    {
        public Task<bool> TryAcquireAsync(string operation, string discriminator, DateTimeOffset now, CancellationToken cancellationToken) => Task.FromResult(allowed);
    }

    private sealed class FakeConcurrencyLimiter : IApiConcurrencyLimiter
    {
        public Task<bool> TryEnterAsync(CancellationToken cancellationToken) => Task.FromResult(true);
        public void Exit() { }
    }

    private sealed class FakeRepository : ISubscriptionRepository
    {
        public int RegisterCalls { get; private set; }
        public int RevokeCalls { get; private set; }
        public bool Duplicate { get; set; }
        public bool ThrowOnRegister { get; init; }
        public bool ThrowOnRevoke { get; init; }

        public Task<RegistrationResult> RegisterAsync(WebPushSubscriptionInput subscription, CancellationToken cancellationToken = default)
        {
            RegisterCalls++;
            if (ThrowOnRegister) throw new InvalidOperationException($"sensitive:{subscription.Endpoint}");
            return Task.FromResult(Duplicate
                ? new RegistrationResult(false, null, null, null, null)
                : new RegistrationResult(true, "sub_" + new string('A', 43), new string('B', 43), new string('C', 43), Now.AddDays(365)));
        }

        public Task RevokeAsync(string id, string capability, CancellationToken cancellationToken = default)
        {
            RevokeCalls++;
            if (ThrowOnRevoke) throw new InvalidOperationException($"sensitive:{id}:{capability}");
            return Task.CompletedTask;
        }

        public Task<SubscriptionPage> ListActivePageAsync(string locale, string? continuationToken, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<SubscriptionRecord?> GetEligibleAsync(string id, string generation, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<SubscriptionMutationResult> DeleteGenerationAsync(string id, string generation, string expectedETag, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }

    private sealed class CollectingLogger<T> : ILogger<T>
    {
        private readonly List<string> _messages = [];
        public string Text => string.Join(Environment.NewLine, _messages);
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            _messages.Add(formatter(state, exception));
    }
}
