using System.Net;
using System.Text.Json;
using WxTyper.Core;

internal static class WeChatDiagnosticsTests
{
    public static async Task RunAsync(Action<bool, string> check, string documentPath)
    {
        var settings = new AppSettings { WeChatAppID = "diagnostic-test-app", WeChatAppSecret = "test-secret" };
        var calls = 0;
        using var observedClient = new HttpClient(new DiagnosticHandler((request, _) =>
        {
            calls++;
            return Task.FromResult(Error(40164, "invalid ip 203.0.113.9 ipv6 ::ffff:203.0.113.9, not in whitelist; test-secret"));
        }));
        var message = await ErrorMessageAsync(() => new WeChatService(observedClient).TestAsync(settings, default));
        check(calls == 1 && message.Contains("微信识别的出口公网 IP：203.0.113.9") && !message.Contains("test-secret"),
            "WeChat-observed IP takes precedence without an external lookup or raw error disclosure");

        using var ipv6Client = new HttpClient(new DiagnosticHandler((_, _) => Task.FromResult(Error(40164, "invalid ip ::ffff:203.0.113.10, not in whitelist"))));
        message = await ErrorMessageAsync(() => new WeChatService(ipv6Client).TestAsync(settings, default));
        check(message.Contains("微信识别的出口公网 IP：203.0.113.10"), "IPv4-mapped IPv6 addresses are shown as usable IPv4 addresses");

        var lookups = 0;
        using var uploadClient = new HttpClient(new DiagnosticHandler((request, _) =>
        {
            if (request.RequestUri!.Host == "api.weixin.qq.com")
                return Task.FromResult(request.RequestUri.AbsolutePath.EndsWith("/token")
                    ? MockHandler.Json("{\"access_token\":\"test-token\",\"expires_in\":7200}") : Error(41005, "media data missing; test-secret test-token"));
            if (request.RequestUri.Host != "api.ipify.org" || request.Method != HttpMethod.Get || request.Headers.Authorization is not null || request.Content is not null || request.RequestUri.Query != "?format=json")
                throw new Exception("Unexpected request data sent to the public IP service.");
            return Task.FromResult(MockHandler.Json("{\"ip\":\"198.51.100." + (42 + lookups++) + "\"}"));
        }));
        var uploadService = new WeChatService(uploadClient);
        message = await ErrorMessageAsync(() => uploadService.UploadAsync("![image](image.png)", documentPath, settings, default));
        check(message.Contains("41005") && message.Contains("缺少上传的文件数据") && message.Contains("检测值）：198.51.100.42") && message.Contains("代理分流") && !message.Contains("test-secret") && !message.Contains("test-token"),
            "Upload errors include a validated fallback IP, correct media error hint and proxy routing caveat");
        message = await ErrorMessageAsync(() => uploadService.UploadAsync("![image](image.png)", documentPath, settings, default));
        check(lookups == 2 && message.Contains("198.51.100.43"), "IP diagnostics refresh after a network change instead of using a stale cache");

        using var failedLookupClient = new HttpClient(new DiagnosticHandler((request, _) => request.RequestUri!.Host == "api.weixin.qq.com"
            ? Task.FromResult(new HttpResponseMessage(HttpStatusCode.Forbidden)) : throw new HttpRequestException("private network detail")));
        message = await ErrorMessageAsync(() => new WeChatService(failedLookupClient).TestAsync(settings, default));
        check(message.Contains("HTTP 403") && message.Contains("暂时无法获取") && !message.Contains("private network"),
            "Failed IP lookup preserves the original HTTP error without leaking network details");

        foreach (var invalid in new[] { "not JSON test-secret", "{\"ip\":\"test-secret\"}", "{\"ip\":42}" })
        {
            using var invalidClient = new HttpClient(new DiagnosticHandler((request, _) => Task.FromResult(request.RequestUri!.Host == "api.weixin.qq.com"
                ? Error(41005, "test-secret") : MockHandler.Json(invalid))));
            message = await ErrorMessageAsync(() => new WeChatService(invalidClient).TestAsync(settings, default));
            check(message.Contains("41005") && message.Contains("暂时无法获取") && !message.Contains("test-secret"),
                "Malformed IP response cannot replace the WeChat error or appear as an IP");
        }

        var timedOut = false;
        using var timeoutClient = new HttpClient(new DiagnosticHandler(async (request, token) =>
        {
            if (request.RequestUri!.Host == "api.weixin.qq.com") return Error(41005, "media data missing");
            try { await Task.Delay(Timeout.InfiniteTimeSpan, token); }
            catch (OperationCanceledException) { timedOut = true; throw; }
            throw new Exception("Unreachable");
        }));
        message = await ErrorMessageAsync(() => new WeChatService(timeoutClient).TestAsync(settings, default)).WaitAsync(TimeSpan.FromSeconds(8));
        check(timedOut && message.Contains("41005") && message.Contains("暂时无法获取"), "IP lookup times out without hiding the original API failure");

        using var cancellation = new CancellationTokenSource();
        var lookupStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var cancelledClient = new HttpClient(new DiagnosticHandler(async (request, token) =>
        {
            if (request.RequestUri!.Host == "api.weixin.qq.com") return Error(41005, "media data missing");
            lookupStarted.SetResult();
            await Task.Delay(Timeout.InfiniteTimeSpan, token);
            throw new Exception("Unreachable");
        }));
        var pending = new WeChatService(cancelledClient).TestAsync(settings, cancellation.Token);
        await lookupStarted.Task.WaitAsync(TimeSpan.FromSeconds(5));
        cancellation.Cancel();
        try { await pending; throw new Exception("User cancellation was swallowed."); }
        catch (OperationCanceledException) { check(true, "User cancellation interrupts the diagnostic lookup"); }
    }

    private static HttpResponseMessage Error(int code, string message) => MockHandler.Json(JsonSerializer.Serialize(new { errcode = code, errmsg = message }));
    private static async Task<string> ErrorMessageAsync(Func<Task> action)
    {
        try { await action(); }
        catch (InvalidOperationException error) { return error.Message; }
        throw new Exception("Expected a WeChat API error.");
    }

    private sealed class DiagnosticHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) => handler(request, token);
    }
}
