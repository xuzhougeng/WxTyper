using System.Text.Json;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using WxTyper.Core;

namespace WxTyper.WinUI;

internal sealed class PreviewController(WebView2 view)
{
    private readonly Dictionary<string, TaskCompletionSource<JsonElement>> requests = [];
    private TaskCompletionSource<bool>? navigation;
    private string? mappedDirectory;
    private bool internalNavigation;
    private ulong? navigationId;
    public bool Ready { get; private set; }
    public async Task InitializeAsync(string dataDirectory)
    {
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
            // NavigateToString starts a data:text/html navigation, then exposes about:blank.
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
                var id = json.RootElement.GetProperty("id").GetString()!;
                if (!requests.Remove(id, out var completion)) return;
                if (json.RootElement.TryGetProperty("error", out var error)) completion.TrySetException(new InvalidOperationException(error.GetString()));
                else completion.TrySetResult(json.RootElement.GetProperty("value").Clone());
            }
            catch (JsonException) { }
        };
        Ready = true;
    }
    public async Task RenderAsync(string html, string? documentPath)
    {
        if (!Ready) return;
        var directory = documentPath is null ? null : Path.GetDirectoryName(documentPath);
        var scroll = "0";
        if (navigation?.Task.IsCompletedSuccessfully == true && mappedDirectory == directory)
            scroll = await view.CoreWebView2.ExecuteScriptAsync("window.scrollY || 0");
        if (mappedDirectory != directory)
        {
            view.CoreWebView2.ClearVirtualHostNameToFolderMapping("wxtyper.local");
            if (directory is not null) view.CoreWebView2.SetVirtualHostNameToFolderMapping("wxtyper.local", directory, CoreWebView2HostResourceAccessKind.DenyCors);
            mappedDirectory = directory;
        }
        navigation?.TrySetCanceled();
        navigation = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internalNavigation = true;
        view.NavigateToString(html);
        await navigation.Task.WaitAsync(TimeSpan.FromSeconds(20));
        if (double.TryParse(scroll, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var y))
            await view.CoreWebView2.ExecuteScriptAsync($"window.scrollTo(0,{y.ToString(System.Globalization.CultureInfo.InvariantCulture)})");
    }
    public async Task<JsonElement> RequestAsync(string action, CancellationToken token)
    {
        if (!Ready) throw new InvalidOperationException("预览尚未就绪。请安装 Microsoft Edge WebView2 Runtime 后重试。");
        if (navigation is not null) await navigation.Task.WaitAsync(token);
        var id = Guid.NewGuid().ToString("N");
        var completion = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        requests.Add(id, completion);
        try
        {
            view.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { id, action }));
            return await completion.Task.WaitAsync(TimeSpan.FromSeconds(45), token);
        }
        finally { requests.Remove(id); }
    }
}
