using System.ComponentModel.DataAnnotations;

namespace Notifications.Functions.Configuration;

public sealed class WebPushOptions : IValidatableObject
{
    public const string SectionName = "Notifications";

    [Required]
    public Uri? KeyVaultUri { get; init; }

    [Required]
    public string VapidSubject { get; init; } = "https://rodri-oliveira-dev.github.io/";

    [Required]
    public string VapidPublicKeySecretName { get; init; } = "vapid-public-key";

    [Required]
    public string VapidPrivateKeySecretName { get; init; } = "vapid-private-key";

    [Range(60, 86400)]
    public int PushTimeToLiveSeconds { get; init; } = 86400;

    [Range(1, 30)]
    public int RequestTimeoutSeconds { get; init; } = 15;

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (KeyVaultUri is null || !KeyVaultUri.IsAbsoluteUri || KeyVaultUri.Scheme != Uri.UriSchemeHttps)
        {
            yield return new ValidationResult("KeyVaultUri deve ser uma URI HTTPS absoluta.", [nameof(KeyVaultUri)]);
        }

        if (!Uri.TryCreate(VapidSubject, UriKind.Absolute, out var subject) ||
            (subject.Scheme != Uri.UriSchemeHttps && subject.Scheme != "mailto"))
        {
            yield return new ValidationResult("VapidSubject deve ser uma URI HTTPS ou mailto.", [nameof(VapidSubject)]);
        }
    }
}
