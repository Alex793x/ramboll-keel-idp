using Api;
using Xunit;

namespace Api.Tests;

public sealed class StatusInfoTests
{
    [Fact]
    public void Create_UsesTheServiceNameAndCurrentVersion()
    {
        var payload = StatusInfo.Create("invoicing-api");

        Assert.Equal("ok", payload.Status);
        Assert.Equal("invoicing-api", payload.Service);
        Assert.Equal(StatusInfo.Version, payload.Version);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\n")]
    public void Create_NormalisesBlankServiceNamesToUnknown(string? service)
    {
        Assert.Equal("unknown", StatusInfo.Create(service).Service);
    }

    [Theory]
    [InlineData(" spaced-name ", "spaced-name")]
    [InlineData("api\t", "api")]
    [InlineData("\n edge \n", "edge")]
    public void Create_TrimsServiceNameEdges(string service, string expected)
    {
        Assert.Equal(expected, StatusInfo.Create(service).Service);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    public void Create_FallsBackToTheDefaultVersionWhenBlank(string? version)
    {
        Assert.Equal(StatusInfo.Version, StatusInfo.Create("svc", version).Version);
    }

    [Fact]
    public void Create_IsDeterministic()
    {
        // Records compare by value: purity means equal inputs, equal payloads.
        Assert.Equal(StatusInfo.Create("svc"), StatusInfo.Create("svc"));
    }
}
