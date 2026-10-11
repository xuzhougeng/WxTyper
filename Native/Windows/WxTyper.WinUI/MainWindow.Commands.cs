using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using WxTyper.Core;

namespace WxTyper.WinUI;

public sealed partial class MainWindow
{
    private Grid BuildTitleBar()
    {
        var bar = new Grid { Padding = new Thickness(16, 0, 0, 0) };
        bar.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        bar.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        bar.ColumnDefinitions.Add(new() { Width = new GridLength(1, GridUnitType.Star) });
        var captionInset = new ColumnDefinition { Width = new GridLength(138) };
        bar.ColumnDefinitions.Add(captionInset);

        var brand = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 12, Margin = new Thickness(0, 0, 12, 0), VerticalAlignment = VerticalAlignment.Center };
        brand.Children.Add(new FontIcon { Glyph = "\uE8A5", FontSize = 17, Foreground = Brush(45, 90, 76) });
        brand.Children.Add(new TextBlock { Text = "WxTyper", FontWeight = Microsoft.UI.Text.FontWeights.SemiBold, VerticalAlignment = VerticalAlignment.Center });
        bar.Children.Add(brand);
        var menus = BuildMenuBar(); menus.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(menus, 1); bar.Children.Add(menus);

        title.Opacity = 0.65; title.FontSize = 12; title.Margin = new Thickness(16, 0, 12, 0);
        title.VerticalAlignment = VerticalAlignment.Center; title.TextTrimming = TextTrimming.CharacterEllipsis;
        titleDragRegion.Children.Add(title); Grid.SetColumn(titleDragRegion, 2); bar.Children.Add(titleDragRegion);
        // Only the document name and spare space are draggable; menus remain normal input controls.
        // Caption metrics use physical pixels, while the XAML columns use effective pixels.
        void UpdateCaptionInset()
        {
            var scale = root.XamlRoot?.RasterizationScale ?? 1;
            captionInset.Width = new GridLength(AppWindow.TitleBar.RightInset > 0 ? AppWindow.TitleBar.RightInset / scale : 138);
        }
        root.Loaded += (_, _) =>
        {
            UpdateCaptionInset();
            root.XamlRoot.Changed += (_, _) => UpdateCaptionInset();
        };
        bar.SizeChanged += (_, _) => UpdateCaptionInset();
        return bar;
    }

    private MenuBar BuildMenuBar()
    {
        var bar = new MenuBar { Padding = new Thickness(8, 0, 8, 0) };
        var file = new MenuBarItem { Title = "文件 (File)", AccessKey = "F" };
        file.Items.Add(Command("新建", NewAsync, "Ctrl+N"));
        file.Items.Add(Command("打开 / 导入 Markdown…", OpenAsync, "Ctrl+O"));
        file.Items.Add(new MenuFlyoutSeparator());
        file.Items.Add(Command("保存", async () => { await SaveAsync(); }, "Ctrl+S"));
        file.Items.Add(Command("另存为…", async () => { await SaveAsync(true); }, "Ctrl+Shift+S"));
        file.Items.Add(new MenuFlyoutSeparator());
        file.Items.Add(Command("导入 CSS 主题…", ImportThemeAsync));
        file.Items.Add(Command("设置…", SettingsAsync, "Ctrl+,"));
        file.Items.Add(new MenuFlyoutSeparator());
        file.Items.Add(Command("退出", RequestCloseAsync, "Alt+F4"));
        bar.Items.Add(file);

        var view = new MenuBarItem { Title = "视图 (View)", AccessKey = "V" };
        foreach (var (key, name) in new[] { ("editor", "编辑"), ("split", "分栏"), ("preview", "预览") })
            view.Items.Add(Command(name, () => { viewMode = key; ApplyViewMode(); return Task.CompletedTask; }));
        view.Items.Add(new MenuFlyoutSeparator());
        toolbarToggle.Click += (_, _) => SetToolbarVisible(toolbarToggle.IsChecked);
        view.Items.Add(toolbarToggle);
        view.Items.Add(new MenuFlyoutSeparator());
        foreach (var theme in AppSettings.Themes)
            view.Items.Add(Command(theme.Value, async () =>
            {
                settings.Theme = theme.Key; customCss = customTheme = null;
                store.SavePreferences(settings); RefreshStatus(); await RenderAsync();
            }));
        bar.Items.Add(view);

        var tools = new MenuBarItem { Title = "工具 (Tools)", AccessKey = "T" };
        tools.Items.Add(Command("复制到公众号", CopyAsync, "Ctrl+Alt+C"));
        tools.Items.Add(Command("生成文章摘要", SummaryAsync, "Ctrl+Shift+R"));
        tools.Items.Add(Command("生成封面图", () => GenerateImageAsync(false)));
        tools.Items.Add(Command("根据选中文字生成配图", () => GenerateImageAsync(true)));
        tools.Items.Add(new MenuFlyoutSeparator());
        tools.Items.Add(Command("图片链接设置…", ImageLinksAsync));
        tools.Items.Add(Command("本地化远程图片", LocalizeAsync));
        tools.Items.Add(Command("导出 Mermaid 为 PNG", ExportMermaidAsync));
        tools.Items.Add(Command("上传图片到微信公众号", UploadAsync));
        bar.Items.Add(tools); busyControls.Add(bar);
        return bar;
    }

    private MenuFlyoutItem Command(string title, Func<Task> action, string shortcut = "")
    {
        var item = Menu(title, action); item.KeyboardAcceleratorTextOverride = shortcut; return item;
    }

    private async Task RequestCloseAsync()
    {
        if (closing || dialogOpen || openingDocument) return;
        closing = true;
        try
        {
            if (operation is not null) { Notify("请先取消或等待当前操作完成。", true); return; }
            if (!await ConfirmDiscardAsync()) return;
            allowClose = true; renderTimer.Stop(); toastTimer.Stop();
            webView.Close(); http.Dispose(); Close();
        }
        finally { closing = false; }
    }

    private void UpdatePreviewProgress(PreviewProgress progress)
    {
        previewMessage.Text = progress.Message;
        previewMessage.Foreground = (Brush)Application.Current.Resources[progress.HasError ? "SystemFillColorCriticalBrush" : "TextFillColorPrimaryBrush"];
        previewProgressRow.Visibility = progress.IsLoading || progress.HasError ? Visibility.Visible : Visibility.Collapsed;
        previewRing.IsActive = progress.IsLoading; previewRing.Visibility = progress.IsLoading ? Visibility.Visible : Visibility.Collapsed;
        previewBar.Visibility = progress.IsLoading ? Visibility.Visible : Visibility.Collapsed;
        previewBar.IsIndeterminate = progress.Total == 0 || progress.Completed == progress.Total;
        previewBar.Maximum = Math.Max(1, progress.Total); previewBar.Value = progress.Completed;
    }

    private async Task LoadDocumentAsync(string path)
    {
        if (openingDocument || operation is not null) return;
        openingDocument = true;
        editor.IsReadOnly = true; foreach (var control in busyControls) control.IsEnabled = false;
        activityRing.IsActive = true; activityRing.Visibility = Visibility.Visible;
        status.Text = "正在打开 " + Path.GetFileName(path) + "…";
        try
        {
            await document.OpenAsync(path);
            measuredContent = null; resetPreviewScroll = true;
            summaryCard.Visibility = Visibility.Collapsed; summaryText.Text = "";
            SyncEditor(); editor.SelectionStart = 0;
            // Reading the file and displaying text do not wait for remote images.
            await RenderAsync(); Notify("已打开 " + document.Name);
        }
        finally
        {
            openingDocument = false; editor.IsReadOnly = false;
            foreach (var control in busyControls) control.IsEnabled = true;
            activityRing.IsActive = false; activityRing.Visibility = Visibility.Collapsed; RefreshStatus();
        }
    }
}
