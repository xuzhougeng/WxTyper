using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using WxTyper.Core;

namespace WxTyper.WinUI;

internal sealed record PreviewProgress(string Message, bool IsLoading, int Completed = 0, int Total = 0, bool HasError = false);

internal sealed class PreviewController(WebView2 view)
{
    private readonly Dictionary<string, TaskCompletionSource<JsonElement>> requests = [];
    private TaskCompletionSource<bool>? navigation;
    private string? mappedDirectory, mappedHost, lastDocument;
    private PreviewContent? lastContent;
    private long version;
    private bool internalNavigation;
    private ulong? navigationId;
    public bool Ready { get; private set; }
    public event Action<PreviewProgress>? ProgressChanged;

    public async Task InitializeAsync(string dataDirectory)
    {
        ProgressChanged?.Invoke(new("正在启动预览…", true));
        var environment = await CoreWebView2Environment.CreateWithOptionsAsync(null, Path.Combine(dataDirectory, "WebView2"), null);
        await view.EnsureCoreWebView2Async(environment);
        var core = view.CoreWebView2;
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.IsPasswordAutosaveEnabled = false;
        core.Settings.IsGeneralAutofillEnabled = false;
        core.NewWindowRequested += (_, args) => args.Handled = true;
        core.NavigationStarting += (_, args) =>
        {
            if (internalNavigation && (args.Uri == "about:blank" || args.Uri.StartsWith("data:text/html", StringComparison.Ordinal)))
            { internalNavigation = false; navigationId = args.NavigationId; }
            else args.Cancel = true;
        };
        core.NavigationCompleted += (_, args) =>
        {
            if (args.NavigationId != navigationId) return;
            if (args.IsSuccess) navigation?.TrySetResult(true);
            else navigation?.TrySetException(new InvalidOperationException($"预览加载失败：{args.WebErrorStatus}。"));
        };
        core.WebMessageReceived += (_, args) =>
        {
            if (args.Source != "about:blank") return;
            try
            {
                using var json = JsonDocument.Parse(args.WebMessageAsJson);
                var message = json.RootElement;
                if (message.TryGetProperty("type", out var type) && type.GetString() == "resources")
                { ReportResources(message); return; }
                if (!message.TryGetProperty("id", out var idValue) || idValue.GetString() is not { } id || !requests.Remove(id, out var completion)) return;
                if (message.TryGetProperty("error", out var error)) completion.TrySetException(new InvalidOperationException(error.GetString()));
                else completion.TrySetResult(message.GetProperty("value").Clone());
            }
            catch (Exception error) when (error is JsonException or InvalidOperationException or KeyNotFoundException) { }
        };
        await LoadShellAsync();
        Ready = true;
    }

    private async Task LoadShellAsync()
    {
        // The empty local shell has no remote images/scripts blocking its load event.
        navigation = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internalNavigation = true;
        view.NavigateToString(MarkdownRenderer.RenderShell());
        await navigation.Task.WaitAsync(TimeSpan.FromSeconds(20));
    }

    private void ReportResources(JsonElement message)
    {
        if (message.GetProperty("version").GetInt64() != version) return;
        var pending = message.GetProperty("pendingImages").GetInt32();
        var total = message.GetProperty("totalImages").GetInt32();
        var failed = message.GetProperty("failedImages").GetInt32();
        var mermaid = message.GetProperty("mermaidPending").GetBoolean();
        var error = message.GetProperty("error").GetString();
        var text = pending > 0 ? $"正在加载图片 {total - pending}/{total}，正文可继续编辑" : mermaid ? "正在渲染 Mermaid 图表…" : "预览已就绪";
        if (!string.IsNullOrEmpty(error)) text += " · " + error;
        if (failed > 0) text += $" · {failed} 张图片加载失败，请检查地址或网络";
        ProgressChanged?.Invoke(new(text, pending > 0 || mermaid, total - pending, total, failed > 0 || !string.IsNullOrEmpty(error)));
    }

    public async Task RenderAsync(PreviewContent content, string? documentPath, bool resetScroll = false)
    {
        if (!Ready) return;
        resetScroll |= !string.Equals(lastDocument, documentPath, StringComparison.OrdinalIgnoreCase);
        if (!resetScroll && lastContent == content) return;
        var directory = documentPath is null ? null : Path.GetDirectoryName(Path.GetFullPath(documentPath));
        version++;
        if (!string.Equals(mappedDirectory, directory, StringComparison.OrdinalIgnoreCase))
        {
            if (mappedHost is not null) view.CoreWebView2.ClearVirtualHostNameToFolderMapping(mappedHost);
            mappedHost = directory is null ? null : "wxtyper-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(directory.ToUpperInvariant())))[..16].ToLowerInvariant() + ".example";
            if (directory is not null) view.CoreWebView2.SetVirtualHostNameToFolderMapping(mappedHost!, directory, CoreWebView2HostResourceAccessKind.DenyCors);
            // WebView2 snapshots host mappings in the page's resource loaders. Updating
            // <base> alone cannot make a mapping added after navigation available.
            // Reload only when the article directory changes, including Save As/New.
            lastContent = null;
            await LoadShellAsync();
            mappedDirectory = directory;
        }
        await SendAsync("update", new { body = content.Body, css = content.Css, baseHref = $"https://{mappedHost ?? "wxtyper.example"}/", resetScroll, version }, CancellationToken.None);
        lastContent = content; lastDocument = documentPath;
    }

    public Task<JsonElement> RequestAsync(string action, CancellationToken token) => SendAsync(action, null, token);
    private async Task<JsonElement> SendAsync(string action, object? payload, CancellationToken token)
    {
        if (!Ready) throw new InvalidOperationException("预览尚未就绪，请稍后重试。");
        var id = Guid.NewGuid().ToString("N");
        var completion = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        requests.Add(id, completion);
        try
        {
            view.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { id, action, payload }));
            return await completion.Task.WaitAsync(TimeSpan.FromSeconds(45), token);
        }
        finally { requests.Remove(id); }
    }
}
