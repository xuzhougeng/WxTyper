using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Security.Cryptography;

namespace WxTyper.Core;

public sealed class WeChatService(HttpClient client)
{
    private string? cachedToken;
    private string? credentialKey;
    private DateTimeOffset expiresAt;
    private async Task<string> AccessTokenAsync(AppSettings settings, CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(settings.WeChatAppID) || string.IsNullOrWhiteSpace(settings.WeChatAppSecret))
            throw new InvalidOperationException("请先填写微信公众号 APPID 和 APPSECRET。");
        var key = Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(settings.WeChatAppID.Trim() + "\n" + settings.WeChatAppSecret.Trim())));
        if (key == credentialKey && cachedToken is not null && DateTimeOffset.UtcNow < expiresAt) return cachedToken;
        var url = "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=" + Uri.EscapeDataString(settings.WeChatAppID.Trim()) + "&secret=" + Uri.EscapeDataString(settings.WeChatAppSecret.Trim());
        using var response = await client.GetAsync(url, token);
        using var json = await ReadResponseAsync(response, token);
        cachedToken = json.RootElement.GetProperty("access_token").GetString() ?? throw new InvalidOperationException("微信没有返回 access_token。");
        credentialKey = key;
        expiresAt = DateTimeOffset.UtcNow.AddSeconds(Math.Max(0, json.RootElement.GetProperty("expires_in").GetInt32() - 60));
        return cachedToken;
    }
    public async Task<string> TestAsync(AppSettings settings, CancellationToken token)
    {
        _ = await AccessTokenAsync(settings, token);
        return "微信 access_token 获取成功。";
    }
    public async Task<string> UploadAsync(string markdown, string documentPath, AppSettings settings, CancellationToken token)
    {
        var references = ImageService.References(markdown).Select(r => r.Url).Distinct().Where(x => !IsWeChatUrl(x)).ToArray();
        if (references.Length == 0) return markdown;
        var accessToken = await AccessTokenAsync(settings, token);
        var logPath = Path.Combine(Path.GetDirectoryName(documentPath)!, "wechat_media_log.jsonl");
        var cached = new Dictionary<string, Entry>();
        if (File.Exists(logPath))
            foreach (var line in File.ReadLines(logPath))
                try
                {
                    var entry = JsonSerializer.Deserialize<Entry>(line);
                    if (entry is not null && entry.AppID == settings.WeChatAppID.Trim()) cached[entry.OriginalURL] = entry;
                }
                catch (JsonException) { /* An interrupted final log line must not lose earlier successes. */ }
        var replacements = new Dictionary<string, string>();
        foreach (var reference in references)
        {
            var (data, filename) = await ImageService.ReadAsync(client, reference, documentPath, settings.SitePrefix, token);
            var digest = Convert.ToHexString(SHA256.HashData(data));
            if (cached.TryGetValue(reference, out var entry) && entry.Sha256 == digest && IsWeChatUrl(entry.WeChatURL))
            { replacements[reference] = entry.WeChatURL; continue; }
            using var content = new MultipartFormDataContent();
            var file = new ByteArrayContent(data);
            file.Headers.ContentType = new MediaTypeHeaderValue(ImageService.Extension(filename) switch { ".jpg" or ".jpeg" => "image/jpeg", ".gif" => "image/gif", ".webp" => "image/webp", _ => "image/png" });
            content.Add(file, "media", filename);
            using var response = await client.PostAsync("https://api.weixin.qq.com/cgi-bin/material/add_material?type=image&access_token=" + Uri.EscapeDataString(accessToken), content, token);
            using var json = await ReadResponseAsync(response, token);
            entry = new Entry(reference, json.RootElement.GetProperty("url").GetString()!, json.RootElement.GetProperty("media_id").GetString()!, settings.WeChatAppID.Trim(), digest);
            if (!IsWeChatUrl(entry.WeChatURL)) throw new InvalidOperationException("微信上传响应中的图片地址无效。");
            // Persist each completed upload immediately, including if a later upload fails/cancels.
            await File.AppendAllTextAsync(logPath, JsonSerializer.Serialize(entry) + "\n", CancellationToken.None);
            replacements[reference] = entry.WeChatURL;
        }
        return ImageService.Replace(markdown, replacements);
    }
    private static bool IsWeChatUrl(string url) => Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" && (uri.Host == "mmbiz.qpic.cn" || uri.Host.EndsWith(".qpic.cn", StringComparison.OrdinalIgnoreCase));
    private static async Task<JsonDocument> ReadResponseAsync(HttpResponseMessage response, CancellationToken token)
    {
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"微信接口 HTTP {(int)response.StatusCode}。");
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(token));
        if (json.RootElement.TryGetProperty("errcode", out var code) && code.GetInt32() != 0)
        {
            var value = code.GetInt32(); json.Dispose();
            throw new InvalidOperationException($"微信接口错误 {value}，请检查凭证、IP 白名单及素材权限。");
        }
        return json;
    }
    private sealed record Entry(
        [property: JsonPropertyName("original_url")] string OriginalURL,
        [property: JsonPropertyName("wechat_url")] string WeChatURL,
        [property: JsonPropertyName("media_id")] string MediaID,
        [property: JsonPropertyName("appid")] string? AppID,
        [property: JsonPropertyName("sha256")] string? Sha256);
}
