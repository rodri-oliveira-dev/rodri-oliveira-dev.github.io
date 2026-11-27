namespace Notifications.Functions.Push;

internal static class PushEndpointPolicy
{
    private static readonly string[] AllowedExactHosts =
    [
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "push.services.mozilla.com",
        "web.push.apple.com",
    ];

    private static readonly string[] AllowedHostSuffixes =
    [
        ".notify.windows.com",
        ".push.apple.com",
    ];

    public static bool IsAllowed(string endpoint) =>
        Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) && IsAllowed(uri);

    public static bool IsAllowed(Uri uri)
    {
        ArgumentNullException.ThrowIfNull(uri);
        if (uri.Scheme != Uri.UriSchemeHttps ||
            !uri.IsDefaultPort ||
            uri.HostNameType != UriHostNameType.Dns ||
            !string.IsNullOrEmpty(uri.UserInfo) ||
            !string.IsNullOrEmpty(uri.Fragment) ||
            string.IsNullOrEmpty(uri.AbsolutePath) ||
            uri.AbsolutePath == "/")
        {
            return false;
        }

        var host = uri.IdnHost;
        return AllowedExactHosts.Contains(host, StringComparer.OrdinalIgnoreCase) ||
            AllowedHostSuffixes.Any(suffix =>
                host.EndsWith(suffix, StringComparison.OrdinalIgnoreCase) &&
                host.Length > suffix.Length);
    }
}
