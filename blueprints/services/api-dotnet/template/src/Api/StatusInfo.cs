namespace Api;

/// <summary>
/// The JSON payload returned by <c>GET /health</c>.
/// </summary>
public sealed record StatusPayload(string Status, string Service, string Version);

/// <summary>
/// Pure, deterministic builder for the service status payload. No I/O, no
/// clock, no globals — the same inputs always produce the same payload, which
/// is what makes it unit-testable without hosting the app (see Api.Tests).
/// </summary>
public static class StatusInfo
{
    /// <summary>Semantic version of the service. Bump on release.</summary>
    public const string Version = "0.1.0";

    /// <summary>
    /// Build the payload for <paramref name="service"/> at the current
    /// <see cref="Version"/>.
    /// </summary>
    public static StatusPayload Create(string? service) => Create(service, Version);

    /// <summary>
    /// Build the payload. Blank or null names normalise to <c>"unknown"</c>;
    /// surrounding whitespace is trimmed; a blank version falls back to
    /// <see cref="Version"/>.
    /// </summary>
    public static StatusPayload Create(string? service, string? version)
    {
        var name = string.IsNullOrWhiteSpace(service) ? "unknown" : service.Trim();
        var resolvedVersion = string.IsNullOrWhiteSpace(version) ? Version : version.Trim();
        return new StatusPayload("ok", name, resolvedVersion);
    }
}
