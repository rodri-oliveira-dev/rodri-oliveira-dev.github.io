using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Notifications.Functions.Configuration;
using Notifications.Functions.Subscriptions;
using System.Text.Json;

namespace Notifications.Functions.Tests.Subscriptions;

public sealed class PublicWebPushConfigurationFunctionTests
{
    private const string PublicKey = "BNh4j9xq8HTjPVyUY7uwFZEE0J6LIVtTQRBfF1GdckdR2u8DLbE4RyP_tHEeN7YwY7r9ZVJd0B1N6lQv4Dq7Y8M";

    [Fact]
    public async Task Get_ReturnsOnlyThePublicConfigurationAndSafeHeaders()
    {
        var request = CreateRequest("GET", "https://rodri-oliveira-dev.github.io");
        var result = await CreateFunction(new FixedProvider(new(true, PublicKey))).GetAsync(request);

        var ok = Assert.IsType<OkObjectResult>(result);
        var configuration = Assert.IsType<PublicWebPushConfiguration>(ok.Value);
        Assert.True(configuration.Enabled);
        Assert.Equal(PublicKey, configuration.VapidPublicKey);
        Assert.Equal("no-store", request.HttpContext.Response.Headers.CacheControl);
        Assert.Equal("https://rodri-oliveira-dev.github.io", request.HttpContext.Response.Headers.AccessControlAllowOrigin);
        Assert.False(request.HttpContext.Response.Headers.ContainsKey("Access-Control-Allow-Credentials"));
    }

    [Fact]
    public async Task Get_FailsClosedWhenConfigurationCannotBeVerified()
    {
        var result = await CreateFunction(new ThrowingProvider()).GetAsync(CreateRequest("GET"));

        Assert.Equal(503, Assert.IsType<StatusCodeResult>(result).StatusCode);
    }

    [Fact]
    public async Task Cors_RejectsOtherOriginsAndPreflightIsNarrow()
    {
        var function = CreateFunction(new FixedProvider(new(false)));
        var denied = await function.GetAsync(CreateRequest("GET", "https://attacker.example"));
        var preflightRequest = CreateRequest("OPTIONS", "https://rodri-oliveira-dev.github.io");
        var preflight = await function.GetAsync(preflightRequest);

        Assert.Equal(403, Assert.IsType<StatusCodeResult>(denied).StatusCode);
        Assert.IsType<NoContentResult>(preflight);
        Assert.Equal("GET, OPTIONS", preflightRequest.HttpContext.Response.Headers.AccessControlAllowMethods);
        Assert.False(preflightRequest.HttpContext.Response.Headers.ContainsKey("Access-Control-Allow-Headers"));
    }

    [Fact]
    public void DisabledContract_OmitsAnyVapidProperty()
    {
        var json = JsonSerializer.Serialize(
            new PublicWebPushConfiguration(false),
            new JsonSerializerOptions(JsonSerializerDefaults.Web));

        Assert.Equal("{\"enabled\":false}", json);
    }

    private static PublicWebPushConfigurationFunction CreateFunction(IPublicWebPushConfigurationProvider provider) => new(
        provider,
        Options.Create(new PublicApiOptions()),
        new NoopLogger());

    private static HttpRequest CreateRequest(string method, string? origin = null)
    {
        var context = new DefaultHttpContext();
        context.Request.Method = method;
        if (origin is not null) context.Request.Headers.Origin = origin;
        return context.Request;
    }

    private sealed class FixedProvider(PublicWebPushConfiguration value) : IPublicWebPushConfigurationProvider
    {
        public Task<PublicWebPushConfiguration> GetAsync(CancellationToken cancellationToken) => Task.FromResult(value);
    }

    private sealed class ThrowingProvider : IPublicWebPushConfigurationProvider
    {
        public Task<PublicWebPushConfiguration> GetAsync(CancellationToken cancellationToken) =>
            throw new InvalidOperationException("private diagnostic detail");
    }

    private sealed class NoopLogger : ILogger<PublicWebPushConfigurationFunction>
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => false;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) { }
    }
}
