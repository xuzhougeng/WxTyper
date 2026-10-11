using System.Globalization;
using Markdig;
using Markdig.Syntax;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.ApplicationModel.DataTransfer;
using Windows.Storage.Pickers;
using Windows.System;
using WxTyper.Core;

namespace WxTyper.WinUI;

public sealed partial class MainWindow : Window
{
    private readonly DocumentSession document = new();
    private readonly SettingsStore store;
    private AppSettings settings = new();
    private readonly HttpClient http = new() { Timeout = TimeSpan.FromMinutes(3) };
    private readonly OpenAIService openAI;
    private readonly WeChatService weChat;
    private readonly Grid root = new();
    private readonly Grid workspace = new();
    private readonly Grid editorPane = new();
    private readonly Grid previewPane = new();
    private readonly TextBox editor = new();
    private readonly WebView2 webView = new();
    private readonly PreviewController preview;
    private readonly TextBlock title = new(), status = new(), themeLabel = new(), dirtyLabel = new();
    private readonly InfoBar notification = new() { IsClosable = true };
    private readonly Border summaryCard = new();
    private readonly TextBlock summaryText = new() { TextWrapping = TextWrapping.Wrap, IsTextSelectionEnabled = true, MaxHeight = 120 };
    private readonly List<Control> busyControls = [];
    private readonly List<string> logs = [];
    private readonly DispatcherTimer renderTimer = new() { Interval = TimeSpan.FromMilliseconds(280) };
    private readonly Button cancelButton = new() { Content = "取消", Visibility = Visibility.Collapsed };
    private readonly Thumb splitter = new() { Width = 5, HorizontalAlignment = HorizontalAlignment.Stretch };
    private CancellationTokenSource? operation;
    private bool dialogOpen, closing, allowClose, renderPending;
    private Task renderTask = Task.CompletedTask;
    private string? customCss, customTheme;
    private string viewMode = "split";
    private double splitRatio = 0.47;

    public MainWindow()
    {
        var dataDirectory = Environment.GetEnvironmentVariable("WXTYPER_DATA_DIR") ?? SettingsStore.DefaultDirectory;
        store = new SettingsStore(dataDirectory);
        string? loadError = null;
        try { settings = store.Load(); }
        catch { loadError = "设置读取失败，已使用默认值。原设置文件保留，请检查本地用户数据。"; }
        var initialPath = Environment.GetCommandLineArgs().Skip(1).FirstOrDefault();
        if (initialPath is not null)
        {
            try { document.Open(initialPath); }
            catch { loadError = "无法打开指定文章，已显示示例文档。"; }
        }
        openAI = new(http); weChat = new(http); preview = new(webView);
        Title = "WxTyper";
        SystemBackdrop = new MicaBackdrop();
        AppWindow.Resize(new Windows.Graphics.SizeInt32(1280, 860));
        AppWindow.SetIcon(Path.Combine(AppContext.BaseDirectory, "Assets", "AppIcon.ico"));
        BuildLayout();
        Content = root;
        ExtendsContentIntoTitleBar = true;
        SetTitleBar((UIElement)root.Children[0]);
        editor.Text = document.Markdown;
        editor.TextChanged += (_, _) => { document.Markdown = editor.Text.Replace("\r\n", "\n"); RefreshStatus(); renderTimer.Stop(); renderTimer.Start(); };
        renderTimer.Tick += async (_, _) => { renderTimer.Stop(); await Safe(RenderAsync); };
        AppWindow.Closing += async (_, args) =>
        {
            if (allowClose) return;
            args.Cancel = true;
            if (closing || dialogOpen) return;
            closing = true;
            try
            {
                if (operation is not null) { Notify("请先取消或等待当前操作完成。", true); return; }
                if (await ConfirmDiscardAsync()) { allowClose = true; webView.Close(); http.Dispose(); Close(); }
            }
            catch (Exception error) { Notify(error is IOException ? error.Message : "保存失败，窗口保持打开。", true); }
            finally { closing = false; }
        };
        root.Loaded += async (_, _) =>
        {
            RefreshStatus();
            try { await preview.InitializeAsync(dataDirectory); await RenderAsync(); }
            catch (Exception error) { Notify($"预览初始化失败（{error.GetType().Name}，0x{error.HResult:X8}）：{error.Message}", true); }
            if (loadError is not null) Notify(loadError, true);
            editor.Focus(FocusState.Programmatic);
        };
    }

    private static SolidColorBrush Brush(byte r, byte g, byte b) => new(Windows.UI.Color.FromArgb(255, r, g, b));
    private void BuildLayout()
    {
        root.Background = (Brush)Application.Current.Resources["ApplicationPageBackgroundThemeBrush"];
        root.RowDefinitions.Add(new() { Height = new GridLength(42) });
        root.RowDefinitions.Add(new() { Height = GridLength.Auto });
        root.RowDefinitions.Add(new() { Height = new GridLength(1, GridUnitType.Star) });
        root.RowDefinitions.Add(new() { Height = GridLength.Auto });
        var titleBar = new Grid { Padding = new Thickness(16, 0, 145, 0) };
        var titleStack = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 12, VerticalAlignment = VerticalAlignment.Center };
        titleStack.Children.Add(new FontIcon { Glyph = "\uE8A5", FontSize = 17, Foreground = Brush(45, 90, 76) });
        titleStack.Children.Add(new TextBlock { Text = "WxTyper", FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        title.Opacity = 0.65; title.FontSize = 12; title.VerticalAlignment = VerticalAlignment.Center;
        titleStack.Children.Add(title); titleBar.Children.Add(titleStack); root.Children.Add(titleBar);
        Grid.SetRow(notification, 1); root.Children.Add(notification);

        workspace.ColumnDefinitions.Add(new() { Width = new GridLength(splitRatio, GridUnitType.Star) });
        workspace.ColumnDefinitions.Add(new() { Width = new GridLength(5) });
        workspace.ColumnDefinitions.Add(new() { Width = new GridLength(1 - splitRatio, GridUnitType.Star) });
        workspace.ColumnDefinitions.Add(new() { Width = new GridLength(84) });
        Grid.SetRow(workspace, 2); root.Children.Add(workspace);
        editorPane.RowDefinitions.Add(new() { Height = new GridLength(38) });
        editorPane.RowDefinitions.Add(new() { Height = GridLength.Auto });
        editorPane.RowDefinitions.Add(new() { Height = new GridLength(1, GridUnitType.Star) });
        editorPane.Children.Add(Header("Markdown", dirtyLabel));
        editor.AcceptsReturn = true; editor.TextWrapping = TextWrapping.Wrap; editor.IsSpellCheckEnabled = false; editor.IsTextPredictionEnabled = false;
        editor.FontFamily = new FontFamily("Cascadia Mono, Consolas"); editor.FontSize = 14;
        editor.BorderThickness = new Thickness(0); editor.Padding = new Thickness(20, 18, 20, 24);
        editor.Background = (Brush)Application.Current.Resources["LayerFillColorDefaultBrush"];
        editor.VerticalAlignment = VerticalAlignment.Stretch;
        ScrollViewer.SetVerticalScrollBarVisibility(editor, ScrollBarVisibility.Auto);
        AutomationProperties.SetName(editor, "Markdown 编辑器");
        Grid.SetRow(editor, 2); editorPane.Children.Add(editor);
        BuildSummary(); Grid.SetRow(summaryCard, 1); editorPane.Children.Add(summaryCard);
        workspace.Children.Add(editorPane);
        splitter.Background = (Brush)Application.Current.Resources["DividerStrokeColorDefaultBrush"];
        splitter.DragDelta += (_, e) => { splitRatio = Math.Clamp(splitRatio + e.HorizontalChange / Math.Max(1, workspace.ActualWidth - 89), .25, .75); ApplyViewMode(); };
        AutomationProperties.SetName(splitter, "调整编辑与预览宽度"); Grid.SetColumn(splitter, 1); workspace.Children.Add(splitter);
        previewPane.RowDefinitions.Add(new() { Height = new GridLength(38) });
        previewPane.RowDefinitions.Add(new() { Height = new GridLength(1, GridUnitType.Star) });
        previewPane.Children.Add(Header("微信预览", themeLabel));
        Grid.SetRow(webView, 1); previewPane.Children.Add(webView);
        Grid.SetColumn(previewPane, 2); workspace.Children.Add(previewPane);
        var rail = BuildRail(); Grid.SetColumn(rail, 3); workspace.Children.Add(rail);

        var footer = new Grid { Padding = new Thickness(14, 5, 14, 5), MinHeight = 32, ColumnSpacing = 12 };
        footer.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) }); footer.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        status.FontSize = 12; status.Opacity = 0.7; status.VerticalAlignment = VerticalAlignment.Center; status.TextTrimming = TextTrimming.CharacterEllipsis;
        footer.Children.Add(status); cancelButton.Click += (_, _) => operation?.Cancel(); cancelButton.FontSize = 12; cancelButton.Padding = new Thickness(10, 2, 10, 2);
        Grid.SetColumn(cancelButton, 1); footer.Children.Add(cancelButton); Grid.SetRow(footer, 3); root.Children.Add(footer);
        Shortcut(VirtualKey.N, VirtualKeyModifiers.Control, NewAsync);
        Shortcut(VirtualKey.O, VirtualKeyModifiers.Control, OpenAsync);
        Shortcut(VirtualKey.S, VirtualKeyModifiers.Control, async () => { await SaveAsync(); });
        Shortcut(VirtualKey.S, VirtualKeyModifiers.Control | VirtualKeyModifiers.Shift, async () => { await SaveAsync(true); });
        Shortcut(VirtualKey.C, VirtualKeyModifiers.Control | VirtualKeyModifiers.Menu, CopyAsync);
        Shortcut(VirtualKey.R, VirtualKeyModifiers.Control | VirtualKeyModifiers.Shift, SummaryAsync);
        Shortcut((VirtualKey)0xBC, VirtualKeyModifiers.Control, SettingsAsync);
    }
    private static Grid Header(string name, TextBlock trailing)
    {
        var grid = new Grid { Padding = new Thickness(14, 0, 14, 0), BorderThickness = new Thickness(0, 0, 0, 1), BorderBrush = Brush(225, 228, 227) };
        grid.ColumnDefinitions.Add(new() { Width = GridLength.Auto }); grid.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) });
        grid.Children.Add(new TextBlock { Text = name, FontSize = 13, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold, VerticalAlignment = VerticalAlignment.Center });
        trailing.FontSize = 12; trailing.Opacity = 0.6; trailing.HorizontalAlignment = HorizontalAlignment.Right; trailing.VerticalAlignment = VerticalAlignment.Center; trailing.TextTrimming = TextTrimming.CharacterEllipsis;
        Grid.SetColumn(trailing, 1); grid.Children.Add(trailing); return grid;
    }
    private Border BuildRail()
    {
        var stack = new StackPanel { Spacing = 5 };
        stack.Children.Add(RailButton("\uE8E5", "打开 Markdown（Ctrl+O）", OpenAsync));
        var save = RailButton("\uE74E", "保存（Ctrl+S）", async () => { await SaveAsync(); });
        var fileMenu = new MenuFlyout();
        fileMenu.Items.Add(Menu("新建（Ctrl+N）", NewAsync));
        fileMenu.Items.Add(Menu("另存为（Ctrl+Shift+S）", async () => { await SaveAsync(true); }));
        save.ContextFlyout = fileMenu; stack.Children.Add(save);
        stack.Children.Add(new MenuFlyoutSeparator());
        var modes = new MenuFlyout();
        foreach (var (key, label) in new[] { ("editor", "编辑"), ("split", "分栏"), ("preview", "预览") })
            modes.Items.Add(Menu(label, () => { viewMode = key; ApplyViewMode(); return Task.CompletedTask; }));
        stack.Children.Add(RailMenu("\uE89F", "视图模式", modes));
        var themes = new MenuFlyout();
        foreach (var theme in AppSettings.Themes)
            themes.Items.Add(Menu(theme.Value, async () => { settings.Theme = theme.Key; customCss = customTheme = null; store.SavePreferences(settings); RefreshStatus(); await RenderAsync(); }));
        themes.Items.Add(new MenuFlyoutSeparator()); themes.Items.Add(Menu("导入 CSS 主题…", ImportThemeAsync));
        stack.Children.Add(RailMenu("\uE790", "排版主题", themes));
        stack.Children.Add(RailButton("\uE71B", "图片 CDN 与网站前缀", ImageLinksAsync));
        var tools = new MenuFlyout();
        tools.Items.Add(Menu("生成文章摘要", SummaryAsync)); tools.Items.Add(Menu("生成封面图", () => GenerateImageAsync(false)));
        tools.Items.Add(Menu("根据选中文字生成配图", () => GenerateImageAsync(true))); tools.Items.Add(new MenuFlyoutSeparator());
        tools.Items.Add(Menu("本地化远程图片", LocalizeAsync)); tools.Items.Add(Menu("导出 Mermaid 为 PNG", ExportMermaidAsync)); tools.Items.Add(Menu("上传图片到微信公众号", UploadAsync));
        stack.Children.Add(RailMenu("\uE735", "AI 与图片工具", tools));
        stack.Children.Add(new MenuFlyoutSeparator());
        var copy = RailButton("\uE8C8", "复制到公众号（Ctrl+Alt+C）", CopyAsync);
        copy.ClearValue(Control.BackgroundProperty); copy.ClearValue(Control.BorderThicknessProperty);
        copy.Style = (Style)Application.Current.Resources["AccentButtonStyle"]; stack.Children.Add(copy);
        stack.Children.Add(RailButton("\uE713", "设置（Ctrl+,）", SettingsAsync));
        return new Border { Child = stack, Padding = new Thickness(7), Margin = new Thickness(10, 0, 10, 0), CornerRadius = new CornerRadius(12), BorderThickness = new Thickness(1), BorderBrush = (Brush)Application.Current.Resources["CardStrokeColorDefaultBrush"], Background = (Brush)Application.Current.Resources["CardBackgroundFillColorDefaultBrush"], VerticalAlignment = VerticalAlignment.Center };
    }
    private Button RailButton(string glyph, string label, Func<Task> action)
    {
        var button = new Button { Content = new FontIcon { Glyph = glyph, FontSize = 18 }, Width = 42, Height = 40, Padding = new Thickness(0), Background = new SolidColorBrush(Colors.Transparent), BorderThickness = new Thickness(0) };
        ToolTipService.SetToolTip(button, label); AutomationProperties.SetName(button, label); button.Click += async (_, _) => await Safe(action); busyControls.Add(button); return button;
    }
    private Button RailMenu(string glyph, string label, MenuFlyout menu)
    {
        var button = RailButton(glyph, label, () => Task.CompletedTask); button.Flyout = menu; return button;
    }
    private MenuFlyoutItem Menu(string title, Func<Task> action)
    {
        var item = new MenuFlyoutItem { Text = title }; item.Click += async (_, _) => await Safe(action); return item;
    }
    private void Shortcut(VirtualKey key, VirtualKeyModifiers modifiers, Func<Task> action)
    {
        var shortcut = new KeyboardAccelerator { Key = key, Modifiers = modifiers };
        shortcut.Invoked += async (_, args) => { args.Handled = true; if (!dialogOpen && operation is null) await Safe(action); };
        root.KeyboardAccelerators.Add(shortcut);
    }
    private void BuildSummary()
    {
        var stack = new StackPanel { Spacing = 10 };
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        buttons.Children.Add(new TextBlock { Text = "✦ AI 摘要", VerticalAlignment = VerticalAlignment.Center, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        var regenerate = new Button { Content = "重新生成", FontSize = 12 }; regenerate.Click += async (_, _) => await Safe(SummaryAsync); busyControls.Add(regenerate); buttons.Children.Add(regenerate);
        var copy = new Button { Content = "复制", FontSize = 12 }; copy.Click += (_, _) => { if (!string.IsNullOrEmpty(summaryText.Text)) { var data = new DataPackage(); data.SetText(summaryText.Text); Clipboard.SetContent(data); Notify("摘要已复制。"); } }; buttons.Children.Add(copy);
        var close = new Button { Content = "收起", FontSize = 12 }; close.Click += (_, _) => summaryCard.Visibility = Visibility.Collapsed; buttons.Children.Add(close);
        stack.Children.Add(buttons); stack.Children.Add(summaryText); summaryCard.Child = stack; summaryCard.Margin = new Thickness(12); summaryCard.Padding = new Thickness(14); summaryCard.CornerRadius = new CornerRadius(10); summaryCard.Background = new SolidColorBrush(Windows.UI.Color.FromArgb(18, 45, 90, 76)); summaryCard.Visibility = Visibility.Collapsed;
    }
    private void ApplyViewMode()
    {
        editorPane.Visibility = viewMode == "preview" ? Visibility.Collapsed : Visibility.Visible;
        previewPane.Visibility = viewMode == "editor" ? Visibility.Collapsed : Visibility.Visible;
        splitter.Visibility = viewMode == "split" ? Visibility.Visible : Visibility.Collapsed;
        workspace.ColumnDefinitions[0].Width = viewMode == "preview" ? new GridLength(0) : new GridLength(viewMode == "editor" ? 1 : splitRatio, GridUnitType.Star);
        workspace.ColumnDefinitions[1].Width = new GridLength(viewMode == "split" ? 5 : 0);
        workspace.ColumnDefinitions[2].Width = viewMode == "editor" ? new GridLength(0) : new GridLength(viewMode == "preview" ? 1 : 1 - splitRatio, GridUnitType.Star);
    }
    private void RefreshStatus()
    {
        Title = $"{document.Name}{(document.IsDirty ? " — 已修改" : "")} — WxTyper"; title.Text = document.Name;
        dirtyLabel.Text = document.IsDirty ? "已修改" : ""; themeLabel.Text = customTheme ?? settings.ThemeTitle;
        status.Text = $"{(document.IsDirty ? "未保存" : document.FilePath is null ? "示例文档" : "已保存")}    {new StringInfo(document.Markdown).LengthInTextElements} 字    {document.Markdown.Count(c => c == '\n') + 1} 行    {ImageService.References(document.Markdown).Count} 张图片    {MermaidBlocks().Length} 个 Mermaid    ·    {themeLabel.Text}    ·    {document.Name}";
    }
    private FencedCodeBlock[] MermaidBlocks() => Markdown.Parse(document.Markdown, MarkdownRenderer.Pipeline).Descendants<FencedCodeBlock>().Where(x => string.Equals(x.Info, "mermaid", StringComparison.OrdinalIgnoreCase)).ToArray();
    private Task RenderAsync()
    {
        renderTimer.Stop(); renderPending = true;
        if (renderTask.IsCompleted) renderTask = RenderLoopAsync();
        return renderTask;
    }
    private async Task RenderLoopAsync()
    {
        while (renderPending)
        {
            renderPending = false;
            var css = customCss ?? Core.Resources.Read((AppSettings.Themes.ContainsKey(settings.Theme) ? settings.Theme : "default") + ".css");
            await preview.RenderAsync(MarkdownRenderer.Render(document.Markdown, new(css, settings.ImagePrefix, settings.AssetsDirectory)), document.FilePath);
        }
    }
    private void SyncEditor() { editor.Text = document.Markdown; RefreshStatus(); }
    private void Notify(string message, bool error = false)
    {
        notification.Message = message; notification.Severity = error ? InfoBarSeverity.Error : InfoBarSeverity.Success; notification.IsOpen = true;
        logs.Insert(0, $"[{DateTime.Now:HH:mm:ss}] {message}"); if (logs.Count > 200) logs.RemoveAt(logs.Count - 1);
    }
    private async Task Safe(Func<Task> action)
    {
        try { await action(); }
        catch (OperationCanceledException) { Notify("操作已取消。"); }
        catch (HttpRequestException) { Notify("网络请求失败，请检查网络、代理与接口地址。", true); }
        catch (Exception error) { Notify(error is InvalidOperationException or IOException ? error.Message : "操作失败，请检查配置和文件后重试。", true); }
    }
    private async Task RunAsync(string label, Func<CancellationToken, Task> action)
    {
        if (operation is not null) return;
        using var cancellation = new CancellationTokenSource(); operation = cancellation;
        editor.IsReadOnly = true; foreach (var control in busyControls) control.IsEnabled = false;
        cancelButton.Visibility = Visibility.Visible; status.Text = label + "…";
        try { await action(cancellation.Token); Notify(label + "完成。"); }
        finally { operation = null; editor.IsReadOnly = false; foreach (var control in busyControls) control.IsEnabled = true; cancelButton.Visibility = Visibility.Collapsed; RefreshStatus(); }
    }
    private async Task<bool> ConfirmDiscardAsync()
    {
        if (!document.IsDirty) return true;
        var dialog = new ContentDialog { XamlRoot = root.XamlRoot, Title = "保存对文章的修改？", Content = "继续前可以保存当前文章。", PrimaryButtonText = "保存", SecondaryButtonText = "不保存", CloseButtonText = "取消", DefaultButton = ContentDialogButton.Primary };
        dialogOpen = true;
        ContentDialogResult result;
        try { result = await dialog.ShowAsync(); } finally { dialogOpen = false; }
        return result == ContentDialogResult.Secondary || result == ContentDialogResult.Primary && await SaveAsync();
    }
    private async Task NewAsync()
    {
        if (operation is not null || dialogOpen || !await ConfirmDiscardAsync()) return;
        document.New(); summaryCard.Visibility = Visibility.Collapsed; summaryText.Text = ""; SyncEditor(); editor.SelectionStart = 0; await RenderAsync();
    }
    private async Task OpenAsync()
    {
        if (operation is not null || dialogOpen || !await ConfirmDiscardAsync()) return;
        var picker = new FileOpenPicker(); picker.FileTypeFilter.Add(".md"); picker.FileTypeFilter.Add(".markdown"); InitPicker(picker);
        var file = await picker.PickSingleFileAsync(); if (file is null) return;
        document.Open(file.Path); summaryCard.Visibility = Visibility.Collapsed; summaryText.Text = ""; SyncEditor(); editor.SelectionStart = 0; await RenderAsync(); Notify("已打开 " + document.Name);
    }
    private async Task<bool> SaveAsync(bool saveAs = false)
    {
        var path = document.FilePath;
        if (saveAs || path is null)
        {
            var picker = new FileSavePicker { SuggestedFileName = document.Name }; picker.FileTypeChoices.Add("Markdown", new List<string> { ".md" }); InitPicker(picker);
            var file = await picker.PickSaveFileAsync(); if (file is null) return false; path = file.Path;
        }
        document.Save(path); RefreshStatus(); await RenderAsync(); Notify("已保存 " + document.Name); return true;
    }
    private void InitPicker(object picker) => WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(this));
    private string RequirePath() => document.FilePath ?? throw new InvalidOperationException("请先保存 Markdown 文档，再执行图片操作。");
    private async Task ImportThemeAsync()
    {
        var picker = new FileOpenPicker(); picker.FileTypeFilter.Add(".css"); InitPicker(picker);
        var file = await picker.PickSingleFileAsync(); if (file is null) return;
        customCss = await File.ReadAllTextAsync(file.Path); customTheme = "自定义：" + file.Name; RefreshStatus(); await RenderAsync(); Notify("已导入 CSS 主题。");
    }
    private Task SummaryAsync() => RunAsync("生成摘要", async token =>
    {
        summaryCard.Visibility = Visibility.Visible; summaryText.Text = "正在生成摘要…";
        if (viewMode == "preview") { viewMode = "split"; ApplyViewMode(); }
        try { summaryText.Text = await openAI.SummaryAsync(settings.Clone(), document.Markdown, token); }
        catch { summaryText.Text = "摘要生成未完成，可重新生成。"; throw; }
    });
    private Task GenerateImageAsync(bool illustration)
    {
        var path = RequirePath(); _ = ImageService.AssetsPath(path, settings.AssetsDirectory);
        var selected = editor.SelectedText;
        var insertion = editor.SelectionStart + editor.SelectionLength;
        if (illustration && string.IsNullOrWhiteSpace(selected)) throw new InvalidOperationException("请先在编辑器中选中一段文字。");
        var heading = document.Markdown.Split('\n').FirstOrDefault(x => x.StartsWith("# "))?[2..] ?? "微信公众号文章";
        var prompt = illustration ? "Create an inline editorial illustration for a WeChat tech article. Clean white background, deep forest green (#2D5A4C), pale mint (#D1F2E5), soft sage, rounded frames, landscape composition, no dense text. Content: " + selected[..Math.Min(400, selected.Length)]
            : string.IsNullOrWhiteSpace(settings.CustomImagePrompt) ? $"Create a clean, modern, minimalist cover for a WeChat article titled {heading}. White background, forest green and pale mint, rounded shapes, generous negative space, landscape 3:2, no text." : settings.CustomImagePrompt;
        return RunAsync(illustration ? "生成配图" : "生成封面", async token =>
        {
            var bytes = await openAI.ImageAsync(settings.Clone(), prompt, token); token.ThrowIfCancellationRequested();
            var imagePath = ImageService.Save(bytes, path, settings.AssetsDirectory, illustration ? "illustration" : "cover");
            document.Markdown = illustration ? document.Markdown.Insert(insertion, $"\n\n![配图]({imagePath})\n\n") : $"![封面图]({imagePath})\n\n" + document.Markdown;
            SyncEditor(); await RenderAsync();
        });
    }
    private Task LocalizeAsync()
    {
        var path = RequirePath();
        return RunAsync("本地化图片", async token => { document.Markdown = await ImageService.LocalizeAsync(http, document.Markdown, path, settings.Clone(), token); SyncEditor(); await RenderAsync(); });
    }
    private Task UploadAsync()
    {
        var path = RequirePath();
        if (MermaidBlocks().Length > 0) throw new InvalidOperationException("请先导出 Mermaid 为 PNG，再上传公众号图片。");
        return RunAsync("上传公众号图片", async token => { document.Markdown = await weChat.UploadAsync(document.Markdown, path, settings.Clone(), token); SyncEditor(); await RenderAsync(); });
    }
    private Task ExportMermaidAsync()
    {
        var path = RequirePath(); var blocks = MermaidBlocks();
        if (blocks.Length == 0) throw new InvalidOperationException("文章中没有 Mermaid 代码块。");
        return RunAsync("导出 Mermaid", async token =>
        {
            if (viewMode == "editor") { viewMode = "split"; ApplyViewMode(); }
            await RenderAsync(); var images = await preview.RequestAsync("mermaid", token);
            if (images.GetArrayLength() != blocks.Length) throw new InvalidOperationException("Mermaid 尚未完成渲染，请稍后重试。");
            var replacements = images.EnumerateArray().Select(image => ImageService.Save(Convert.FromBase64String(image.GetString()!), path, settings.AssetsDirectory, "mermaid")).ToArray();
            for (var i = blocks.Length - 1; i >= 0; i--)
                document.Markdown = document.Markdown.Remove(blocks[i].Span.Start, blocks[i].Span.Length).Insert(blocks[i].Span.Start, $"![Mermaid 图]({replacements[i]})");
            SyncEditor(); await RenderAsync();
        });
    }
    private Task CopyAsync() => RunAsync("复制微信 HTML", async token =>
    {
        await RenderAsync(); var result = await preview.RequestAsync("copy", token);
        var data = new DataPackage(); data.SetText(document.Markdown); data.SetHtmlFormat(HtmlFormatHelper.CreateHtmlFormat(result.GetString()!));
        Clipboard.SetContent(data); Clipboard.Flush();
    });
}
