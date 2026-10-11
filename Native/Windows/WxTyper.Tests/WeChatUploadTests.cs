using System.Text;
using System.Text.RegularExpressions;
using WxTyper.Core;

internal static class WeChatUploadTests
{
    public static async Task RunAsync(Action<bool, string> check, string temporaryDirectory, string? sampleImage)
    {
        var directory = Path.Combine(temporaryDirectory, "multipart");
        var assets = Path.Combine(directory, "assets");
        Directory.CreateDirectory(assets);
        var documentPath = Path.Combine(directory, "article.md");
        var bytes = sampleImage is null ? new byte[] { 137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 17, 34 } : await File.ReadAllBytesAsync(sampleImage);
        var fileName = sampleImage is null ? "PixPin_2026-09-29_13-43-06.png" : Path.GetFileName(sampleImage);
        var settings = new AppSettings { WeChatAppID = "multipart-test", WeChatAppSecret = "test-secret" };
        foreach (var name in new[] { fileName, "配图 空格.png" })
        {
            await File.WriteAllBytesAsync(Path.Combine(assets, name), bytes);
            var uploads = 0;
            using var client = new HttpClient(new MockHandler(async request =>
            {
                if (request.RequestUri!.AbsolutePath.EndsWith("/token"))
                    return MockHandler.Json("{\"access_token\":\"test-token\",\"expires_in\":7200}");
                uploads++;
                var content = request.Content!;
                var boundary = content.Headers.ContentType!.Parameters.Single(p => p.Name == "boundary").Value!;
                check(!boundary.Contains('"') && Regex.IsMatch(boundary, @"\A[A-Za-z0-9-]+\z"), "WeChat multipart boundary uses an unquoted ASCII token");
                var body = await content.ReadAsByteArrayAsync();
                var headerEnd = body.AsSpan().IndexOf("\r\n\r\n"u8);
                check(headerEnd >= 0, "Multipart file headers end before the binary payload");
                var headers = Encoding.ASCII.GetString(body, 0, headerEnd);
                check(headers.StartsWith("--" + boundary + "\r\n") && headers.Contains("Content-Disposition: form-data; name=\"media\"; filename=\"") && !headers.Contains("filename*=") && !headers.Contains("=?utf-8?", StringComparison.OrdinalIgnoreCase),
                    "WeChat media field and filename use quoted form-data parameters without extended filename encoding");
                check(headers.Contains("Content-Type: image/png"), "The uploaded PNG keeps its image MIME type");
                var trailer = Encoding.ASCII.GetBytes("\r\n--" + boundary + "--\r\n");
                var payloadOffset = headerEnd + 4;
                check(body.AsSpan(payloadOffset, bytes.Length).SequenceEqual(bytes) && body.AsSpan(payloadOffset + bytes.Length).SequenceEqual(trailer),
                    $"Serialized upload contains all {bytes.Length} original image bytes and the matching closing boundary");
                return MockHandler.Json("{\"media_id\":\"test-media\",\"url\":\"https://mmbiz.qpic.cn/test.png\"}");
            }));
            var markdown = "![图](<assets/" + name + ">)";
            var result = await new WeChatService(client).UploadAsync(markdown, documentPath, settings, default);
            check(uploads == 1 && result == "![图](<https://mmbiz.qpic.cn/test.png>)" && File.Exists(Path.Combine(assets, name)),
                "Relative local files upload and replace only the Markdown URL without renaming the source file");
        }

        await File.WriteAllBytesAsync(Path.Combine(assets, "empty.png"), []);
        var emptyUploads = 0;
        using var emptyClient = new HttpClient(new MockHandler(request =>
        {
            if (request.RequestUri!.AbsolutePath.EndsWith("/token"))
                return Task.FromResult(MockHandler.Json("{\"access_token\":\"test-token\",\"expires_in\":7200}"));
            emptyUploads++;
            return Task.FromResult(MockHandler.Json("{\"media_id\":\"test-media\",\"url\":\"https://mmbiz.qpic.cn/test.png\"}"));
        }));
        try
        {
            await new WeChatService(emptyClient).UploadAsync("![空图](assets/empty.png)", documentPath, settings, default);
            throw new Exception("Empty image was sent to WeChat.");
        }
        catch (InvalidOperationException error)
        {
            check(emptyUploads == 0 && error.Message.Contains("empty.png") && error.Message.Contains("为空"), "Empty local images fail with a filename before a media request is sent");
        }
    }
}
