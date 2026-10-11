using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using WxTyper.Core;
using WxTyper.WinUI;

namespace WxTyper.PreviewTests;

public partial class App : Application
{
    private Window? window;
    public App() => InitializeComponent();

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        var arguments = Environment.GetCommandLineArgs().Skip(1).ToArray();
        var output = Path.GetFullPath(arguments.FirstOrDefault() ?? "test-results/preview-native");
        Directory.CreateDirectory(output);
        var view = new WebView2();
        window = new Window { Title = "WxTyper preview regression", Content = view };
        var started = false;
        view.Loaded += async (_, _) =>
        {
            if (started) return;
            started = true;
            var checks = new List<string>();
            try
            {
                await RunAsync(view, output, arguments.ElementAtOrDefault(1), checks);
                await File.WriteAllTextAsync(Path.Combine(output, "result.json"), JsonSerializer.Serialize(new { passed = true, checks }));
            }
            catch (Exception error)
            {
                Environment.ExitCode = 1;
                await File.WriteAllTextAsync(Path.Combine(output, "result.json"), JsonSerializer.Serialize(new { passed = false, checks, error = error.ToString() }));
            }
            finally { view.Close(); window.Close(); Exit(); }
        };
        window.Activate();
        window.AppWindow.Hide();
    }

    private static async Task RunAsync(WebView2 view, string output, string? article, List<string> checks)
    {
        void Check(bool success, string name)
        {
            if (!success) throw new InvalidOperationException(name);
            checks.Add(name);
        }
        var first = Path.Combine(output, "目录 A", "article.md");
        var second = Path.Combine(output, "目录 B", "article.md");
        foreach (var (path, width) in new[] { (first, 11), (second, 22) })
        {
            var assets = Path.Combine(Path.GetDirectoryName(path)!, "assets");
            Directory.CreateDirectory(assets);
            await File.WriteAllTextAsync(Path.Combine(assets, "image.svg"), $"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{width}\" height=\"7\"><rect width=\"100%\" height=\"100%\" fill=\"green\"/></svg>");
            await File.WriteAllBytesAsync(Path.Combine(assets, "示例 图片.png"), Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII="));
        }
        var markdown = "![relative](assets/image.svg)\n\n![dot](./assets/image.svg)\n\n![encoded](<assets/示例 图片.png>)";
        var options = new RenderOptions(Core.Resources.Read("default.css"));
        var preview = new PreviewController(view);
        await preview.InitializeAsync(Path.Combine(output, "profile-" + Guid.NewGuid().ToString("N")));
        var navigations = 0;
        view.CoreWebView2.NavigationStarting += (_, _) => navigations++;
        await preview.RenderAsync(MarkdownRenderer.RenderContent(markdown, options), first, true);
        var images = await ImagesAsync(view);
        Check(images.Length == 3 && images.All(x => x.Width > 0) && images[0].Width == 11,
            "First saved document loads relative, ./, Chinese and space-containing local image paths");
        await view.CoreWebView2.ExecuteScriptAsync("window.retainedImage = document.querySelector('img')");
        var beforeEdit = navigations;
        await preview.RenderAsync(MarkdownRenderer.RenderContent("# Edited\n\n" + markdown, options), first);
        Check(navigations == beforeEdit && await view.CoreWebView2.ExecuteScriptAsync("window.retainedImage === document.querySelector('img')") == "true",
            "Ordinary edits preserve the page and decoded image nodes");
        await preview.RenderAsync(MarkdownRenderer.RenderContent(markdown, options), second, true);
        images = await ImagesAsync(view);
        Check(images.All(x => x.Width > 0) && images[0].Width == 22, "Switching folders loads the new same-named image");
        await preview.RenderAsync(MarkdownRenderer.RenderContent(markdown, options), first, true);
        images = await ImagesAsync(view);
        Check(images[0].Width == 11, "Reopening a previous folder restores its mapping");
        await preview.RenderAsync(MarkdownRenderer.RenderContent(markdown, options), null, true);
        images = await ImagesAsync(view);
        Check(images.All(x => x.Width == 0), "Unsaved documents do not reuse the previous document's local images");
        if (article is not null)
        {
            var content = MarkdownRenderer.RenderContent(await File.ReadAllTextAsync(article), options);
            await preview.RenderAsync(content, Path.GetFullPath(article), true);
            images = await ImagesAsync(view);
            Check(images.Length == content.ImageCount && images.All(x => x.Width > 0), $"User article: all {images.Length} images decoded in WebView2");
        }
    }

    private static async Task<PreviewImage[]> ImagesAsync(WebView2 view)
    {
        for (var attempt = 0; attempt < 150; attempt++)
        {
            var json = await view.CoreWebView2.ExecuteScriptAsync("JSON.stringify([...document.images].map(i => ({ Complete: i.complete, Width: i.naturalWidth })))");
            var images = JsonSerializer.Deserialize<PreviewImage[]>(JsonSerializer.Deserialize<string>(json)!)!;
            if (images.Length > 0 && images.All(x => x.Complete)) return images;
            await Task.Delay(100);
        }
        throw new TimeoutException("Images did not finish loading in WebView2.");
    }
    private sealed record PreviewImage(bool Complete, int Width);
}
