using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Globalization;

namespace WxTyper.Core;

public sealed class OpenAIService(HttpClient client)
{
    public async Task<string> SummaryAsync(AppSettings settings, string markdown, CancellationToken token)
    {
        var text = await ChatAsync(settings, "请根据以下微信公众号 Markdown 内容生成一个中文摘要，不超过100个汉字，不要换行，只输出摘要内容：\n\n" + markdown, token);
        text = text.Replace("\r", " ").Replace("\n", " ").Trim();
        var characters = StringInfo.ParseCombiningCharacters(text);
        return characters.Length > 100 ? text[..characters[100]] : text;
    }
    public async Task<string> TestAsync(AppSettings settings, CancellationToken token)
    {
        _ = await ChatAsync(settings, "Reply with exactly OK", token);
        return "OpenAI 接口可用。";
    }
    private async Task<string> ChatAsync(AppSettings settings, string prompt, CancellationToken token)
    {
        using var json = await PostAsync(settings, "chat/completions", new { model = settings.SummaryModel.Trim(), messages = new[] { new { role = "user", content = prompt } } }, token);
        try
        {
            var content = json.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString();
            return !string.IsNullOrWhiteSpace(content) ? content.Trim() : throw new InvalidOperationException("OpenAI 返回内容为空。");
        }
        catch (Exception e) when (e is KeyNotFoundException or IndexOutOfRangeException or JsonException) { throw new InvalidOperationException("OpenAI 响应中没有有效的文本。"); }
    }
    public async Task<byte[]> ImageAsync(AppSettings settings, string prompt, CancellationToken token)
    {
        using var json = await PostAsync(settings, "images/generations", new { model = settings.ImageModel.Trim(), prompt, size = "1536x1024", quality = "medium", n = 1 }, token);
        try { return Convert.FromBase64String(json.RootElement.GetProperty("data")[0].GetProperty("b64_json").GetString()!); }
        catch (Exception e) when (e is KeyNotFoundException or FormatException or IndexOutOfRangeException or ArgumentNullException) { throw new InvalidOperationException("OpenAI 未返回有效的 Base64 图片。"); }
    }
    private async Task<JsonDocument> PostAsync(AppSettings settings, string path, object body, CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(settings.OpenAIKey)) throw new InvalidOperationException("请先在设置中填写 OpenAI API Key。");
        if (!Uri.TryCreate(settings.OpenAIBaseURL.Trim().TrimEnd('/') + "/" + path, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https"))
            throw new InvalidOperationException("OpenAI API 地址无效。");
        using var request = new HttpRequestMessage(HttpMethod.Post, uri) { Content = JsonContent.Create(body) };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", settings.OpenAIKey.Trim());
        using var response = await client.SendAsync(request, token);
        // Provider bodies can echo credentials or prompts. Keep errors and logs free of them.
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"OpenAI HTTP {(int)response.StatusCode}：请检查接口地址、密钥、模型权限及额度。");
        try { return JsonDocument.Parse(await response.Content.ReadAsStringAsync(token)); }
        catch (JsonException) { throw new InvalidOperationException("OpenAI 响应不是有效 JSON。"); }
    }
}
