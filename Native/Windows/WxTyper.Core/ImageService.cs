using System.Text.RegularExpressions;
using Markdig;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;

namespace WxTyper.Core;

public sealed record ImageReference(string Url, int Start, int Length);

public static class ImageService
{
    private static readonly Regex ImagePattern = new("!\\[[^\\]\\r\\n]*\\]\\(\\s*(?:<(?<url>[^>]+)>|(?<url>[^\\s)]+))(?:\\s+\"[^\"]*\")?\\s*\\)", RegexOptions.Compiled);
    public static IReadOnlyList<ImageReference> References(string markdown)
    {
        var document = Markdown.Parse(markdown, MarkdownRenderer.Pipeline);
        var code = document.Descendants().Where(x => x is CodeBlock or CodeInline).Select(x => x.Span).ToArray();
        return ImagePattern.Matches(markdown).Cast<Match>()
            .Where(m => !code.Any(c => c.Start <= m.Index && c.End >= m.Index))
            .Select(m => new ImageReference(m.Groups["url"].Value, m.Groups["url"].Index, m.Groups["url"].Length)).ToArray();
    }

    public static string Replace(string markdown, IReadOnlyDictionary<string, string> replacements)
    {
        foreach (var reference in References(markdown).Reverse())
            if (replacements.TryGetValue(reference.Url, out var replacement))
                markdown = markdown.Remove(reference.Start, reference.Length).Insert(reference.Start, replacement);
        return markdown;
    }

    public static string AssetsPath(string documentPath, string assets)
    {
        assets = string.IsNullOrWhiteSpace(assets) ? "assets" : assets.Trim();
        var root = Path.GetFullPath(Path.GetDirectoryName(documentPath)!) + Path.DirectorySeparatorChar;
        var target = Path.GetFullPath(Path.Combine(root, assets));
        if (Path.IsPathRooted(assets) || !target.StartsWith(root, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("图片保存目录必须是文章目录下的相对路径，例如 assets。");
        return target;
    }

    public static string Save(byte[] data, string documentPath, string assets, string prefix, string extension = ".png")
    {
        var directory = AssetsPath(documentPath, assets);
        Directory.CreateDirectory(directory);
        var target = Path.Combine(directory, $"{prefix}-{Guid.NewGuid():N}{extension}");
        AtomicFile.Write(target, data);
        return Uri.EscapeDataString(Path.GetRelativePath(Path.GetDirectoryName(documentPath)!, target).Replace('\\', '/')).Replace("%2F", "/");
    }

    public static async Task<string> LocalizeAsync(HttpClient client, string markdown, string documentPath, AppSettings settings, CancellationToken token)
    {
        _ = AssetsPath(documentPath, settings.AssetsDirectory);
        var replacements = new Dictionary<string, string>();
        foreach (var reference in References(markdown).Select(r => r.Url).Distinct())
        {
            token.ThrowIfCancellationRequested();
            if (LocalPath(reference, documentPath) is { } local && File.Exists(local)) continue;
            var uri = RemoteUri(reference, settings.SitePrefix);
            if (uri is null) continue;
            var (bytes, filename) = await DownloadAsync(client, uri, token);
            replacements[reference] = Save(bytes, documentPath, settings.AssetsDirectory, "image", Extension(filename));
        }
        return Replace(markdown, replacements);
    }

    public static string? LocalPath(string reference, string documentPath)
    {
        if (Uri.TryCreate(reference, UriKind.Absolute, out _) || reference.Contains(':')) return null;
        var root = Path.GetFullPath(Path.GetDirectoryName(documentPath)!) + Path.DirectorySeparatorChar;
        var target = Path.GetFullPath(Path.Combine(root, Uri.UnescapeDataString(reference).Replace('/', Path.DirectorySeparatorChar)));
        return target.StartsWith(root, StringComparison.OrdinalIgnoreCase) ? target : null;
    }

    public static Uri? RemoteUri(string reference, string sitePrefix)
    {
        if (Uri.TryCreate(reference, UriKind.Absolute, out var direct))
            return direct.Scheme is "http" or "https" ? direct : null;
        if (string.IsNullOrWhiteSpace(sitePrefix)) return null;
        if (!Uri.TryCreate(sitePrefix.Trim().TrimEnd('/') + "/" + reference.TrimStart('/'), UriKind.Absolute, out var result) || result.Scheme is not ("http" or "https"))
            throw new InvalidOperationException("网站前缀必须是 HTTP 或 HTTPS 地址。");
        return result;
    }

    public static async Task<(byte[] Data, string Filename)> ReadAsync(HttpClient client, string reference, string documentPath, string sitePrefix, CancellationToken token)
    {
        if (LocalPath(reference, documentPath) is { } path && File.Exists(path))
            return (await File.ReadAllBytesAsync(path, token), Path.GetFileName(path));
        var uri = RemoteUri(reference, sitePrefix) ?? throw new InvalidOperationException("找不到图片，请检查本地路径或网站前缀。");
        return await DownloadAsync(client, uri, token);
    }

    private static async Task<(byte[], string)> DownloadAsync(HttpClient client, Uri uri, CancellationToken token)
    {
        using var response = await client.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, token);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"图片下载失败（HTTP {(int)response.StatusCode}）。");
        if (response.Content.Headers.ContentLength > 25 * 1024 * 1024) throw new InvalidOperationException("图片超过 25 MB。");
        var type = response.Content.Headers.ContentType?.MediaType;
        if (type is not null && !type.StartsWith("image/") && type != "application/octet-stream")
            throw new InvalidOperationException("下载内容不是图片。");
        await using var stream = await response.Content.ReadAsStreamAsync(token);
        using var output = new MemoryStream();
        var buffer = new byte[81920];
        int read;
        while ((read = await stream.ReadAsync(buffer, token)) > 0)
        {
            if (output.Length + read > 25 * 1024 * 1024) throw new InvalidOperationException("图片超过 25 MB。");
            output.Write(buffer, 0, read);
        }
        var extension = type switch { "image/jpeg" => ".jpg", "image/gif" => ".gif", "image/webp" => ".webp", "image/svg+xml" => ".svg", _ => Extension(uri.AbsolutePath) };
        return (output.ToArray(), "image" + extension);
    }
    public static string Extension(string filename) => Path.GetExtension(filename).ToLowerInvariant() is ".jpg" or ".jpeg" or ".gif" or ".webp" or ".svg" or ".png" ? Path.GetExtension(filename).ToLowerInvariant() : ".png";
}
