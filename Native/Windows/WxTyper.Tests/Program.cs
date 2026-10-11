using System.Net;
using System.Text;
using System.Text.Json;
using WxTyper.Core;

var checks = 0;
void Check(bool condition, string message) { if (!condition) throw new Exception(message); checks++; Console.WriteLine("PASS " + message); }
var options = new RenderOptions(Resources.Read("default.css"), "https://cdn.example.com", "assets");
var html = MarkdownRenderer.Render("# 标题\n\n**重点**、~~删除~~与[链接](https://example.com)\n\n| 名称 | 值 |\n| --- | --- |\n| A | 1 |", options);
Check(html.Contains("<h1>标题</h1>") && html.Contains("<strong>重点</strong>") && html.Contains("<del>删除</del>") && html.Contains("<table>"), "SwiftUI Markdown feature parity");
Check(html.Contains("footnote-ref\">1") && html.Contains("https://example.com"), "WeChat links become ordered footnotes");
Check(html.Contains("wxtyperCopyHTML") && html.Contains("wxtyperExportMermaid"), "Copy bridge available without Mermaid blocks");
html = MarkdownRenderer.Render("![相对](/upload/a.png)\n![本地](assets/b.png)\n![远程](https://images.example.com/c.png)", options);
Check(html.Contains("https://cdn.example.com/upload/a.png") && html.Contains("src=\"assets/b.png\"") && html.Contains("src=\"https://images.example.com/c.png\""), "CDN does not rewrite assets or remote URLs");
html = MarkdownRenderer.Render("```mermaid\ngraph TD; A-->B;\n```\n\n```cs\nvar x = 1;\n```", options);
Check(html.Contains("class=\"mermaid\"") && html.Contains("language-cs"), "Mermaid and regular code blocks stay distinct");
html = MarkdownRenderer.Render("<script>alert(1)</script>\n\n![x](javascript:alert)", options with { Css = "</style><script>alert(2)</script>" });
Check(!html.Contains("</style><script>alert") && !html.Contains("src=\"javascript:") && MarkdownRenderer.RenderBody("<script>alert(1)</script>", options).Contains("&lt;script&gt;"), "Markdown and custom CSS cannot inject script");
Check(!MarkdownRenderer.RenderBody("![\" onerror=\"alert(1)](x.png)", options).Contains("alt=\"\" onerror="), "Image alt text cannot inject HTML attributes");
var images = "![a](one.png \"标题\")\n![b](<assets/with space.png>)\n`![inline](skip.png)`\n\n```md\n![code](skip2.png)\n```\n[链接](one.png)";
var references = ImageService.References(images);
Check(references.Select(x => x.Url).SequenceEqual(new[] { "one.png", "assets/with space.png" }), "Image references support titles/spaces and ignore code");
var rewritten = ImageService.Replace(images, new Dictionary<string, string> { ["one.png"] = "assets/local.png" });
Check(rewritten.Contains("![a](assets/local.png \"标题\")") && rewritten.Contains("[链接](one.png)"), "Replacements affect only image URL spans");
var temp = Path.Combine(Path.GetTempPath(), "wxtyper-tests-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(temp);
try
{
    var file = Path.Combine(temp, "文章.md");
    var session = new DocumentSession(); session.New(); Check(session.IsDirty, "New article asks to save before discard");
    session.Markdown = "# 中文\n\nTest"; session.Save(file); session.Open(file);
    Check(!session.IsDirty && session.Markdown == "# 中文\n\nTest", "UTF-8 save/open and dirty state round trip");
    session.Markdown = "# 中文\r\rTest";
    Check(!session.IsDirty && session.Markdown.Count(c => c == '\n') == 2, "WinUI CR-only TextBox updates preserve saved state and line counts");
    File.WriteAllText(file, "# CRLF\r\n\r\nbody\rnext");
    await session.OpenAsync(file);
    var metrics = MarkdownRenderer.RenderContent(session.Markdown, options);
    Check(!session.IsDirty && metrics.LineCount == 4 && !session.Markdown.Contains('\r'), "Async open normalizes mixed Windows and legacy line endings");
    session.Markdown += " changed"; Check(session.IsDirty, "Editing changes document dirty state");
    try { ImageService.AssetsPath(file, "../outside"); throw new Exception("Traversal accepted"); }
    catch (InvalidOperationException) { Check(true, "Assets path cannot escape article directory"); }
    var store = new SettingsStore(Path.Combine(temp, "settings"));
    var settings = new AppSettings { OpenAIKey = "test-secret-key", WeChatAppID = "test-app", WeChatAppSecret = "test-secret-wechat", Theme = "sakura" };
    store.Save(settings);
    Check(!File.ReadAllText(Path.Combine(temp, "settings", "settings.json")).Contains("test-secret"), "Settings JSON excludes secrets");
    Check(!Encoding.UTF8.GetString(File.ReadAllBytes(Path.Combine(temp, "settings", "secrets.bin"))).Contains("test-secret"), "DPAPI store has no plaintext secrets");
    var loaded = store.Load(); Check(loaded.OpenAIKey == settings.OpenAIKey && loaded.WeChatAppSecret == settings.WeChatAppSecret && loaded.Theme == "sakura", "Encrypted settings round trip");
    var requests = new List<(string Path, string Body, string? Auth)>();
    using var client = new HttpClient(new MockHandler(async request =>
    {
        requests.Add((request.RequestUri!.AbsolutePath, request.Content is null ? "" : await request.Content.ReadAsStringAsync(), request.Headers.Authorization?.ToString()));
        return MockHandler.Json(request.RequestUri.AbsolutePath.EndsWith("images/generations") ? "{\"data\":[{\"b64_json\":\"AQID\"}]}" : "{\"choices\":[{\"message\":{\"content\":\"文章摘要\"}}]}");
    }));
    var ai = new OpenAIService(client);
    Check(await ai.SummaryAsync(settings, "# article", default) == "文章摘要", "Summary response contract");
    Check((await ai.ImageAsync(settings, "test prompt", default)).SequenceEqual(new byte[] { 1, 2, 3 }), "Image b64_json response contract");
    using (var body = JsonDocument.Parse(requests[1].Body))
        Check(requests[0].Path == "/v1/chat/completions" && requests[1].Path == "/v1/images/generations" && requests[0].Auth == "Bearer test-secret-key" && body.RootElement.GetProperty("size").GetString() == "1536x1024", "AI request routes, authorization and image size");
    using var errorClient = new HttpClient(new MockHandler(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.Unauthorized) { Content = new StringContent("test-secret-key") })));
    try { await new OpenAIService(errorClient).TestAsync(settings, default); throw new Exception("Expected error"); }
    catch (InvalidOperationException error) { Check(error.Message.Contains("401") && !error.Message.Contains("test-secret"), "Provider errors never echo credentials"); }
    File.WriteAllBytes(Path.Combine(temp, "image.png"), [1, 2, 3]);
    var tokenCalls = 0; var uploadCalls = 0;
    using var wxClient = new HttpClient(new MockHandler(request =>
    {
        if (request.RequestUri!.AbsolutePath.EndsWith("/token")) { tokenCalls++; return Task.FromResult(MockHandler.Json("{\"access_token\":\"secret-token\",\"expires_in\":7200}")); }
        uploadCalls++; return Task.FromResult(MockHandler.Json("{\"media_id\":\"media-1\",\"url\":\"https://mmbiz.qpic.cn/test.png\"}"));
    }));
    var wx = new WeChatService(wxClient);
    var article = "![图](image.png \"标题\")\n[原文件](image.png)";
    var uploaded = await wx.UploadAsync(article, file, settings, default);
    _ = await wx.UploadAsync(article, file, settings, default);
    Check(uploadCalls == 1 && tokenCalls == 1 && uploaded.Contains("[原文件](image.png)"), "WeChat reuses token/upload log and only replaces image URLs");
    File.WriteAllBytes(Path.Combine(temp, "image.png"), [4, 5, 6]);
    _ = await wx.UploadAsync(article, file, settings, default);
    Check(uploadCalls == 2, "Changed local image invalidates upload cache");
    settings.WeChatAppSecret = "changed-secret"; _ = await wx.TestAsync(settings, default);
    Check(tokenCalls == 2, "Changed WeChat credentials invalidate token cache");
    Check(!File.ReadAllText(Path.Combine(temp, "wechat_media_log.jsonl")).Contains("secret-token"), "Upload log omits access tokens");
    await WeChatDiagnosticsTests.RunAsync(Check, file);
    var downloadCalls = 0;
    using var imageClient = new HttpClient(new MockHandler(_ => { downloadCalls++; return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent([1, 2, 3]) }); }));
    var localized = await ImageService.LocalizeAsync(imageClient, "![x](https://images.example.com/a.png \"标题\")\n![y](image.png)", file, settings, default);
    Check(downloadCalls == 1 && localized.Contains("assets/image-") && localized.Contains("![y](image.png)"), "Localization keeps local images and rewrites remote titles correctly");
}
finally { Directory.Delete(temp, true); }
Console.WriteLine($"All {checks} checks passed.");
if (args.Length == 2 && args[0] == "--preview-fixture")
    File.WriteAllText(args[1], MarkdownRenderer.RenderShell());

sealed class MockHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> handler) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) { cancellationToken.ThrowIfCancellationRequested(); return handler(request); }
    public static HttpResponseMessage Json(string value) => new(HttpStatusCode.OK) { Content = new StringContent(value, Encoding.UTF8, "application/json") };
}
