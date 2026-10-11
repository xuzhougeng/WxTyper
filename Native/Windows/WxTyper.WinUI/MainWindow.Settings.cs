using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using WxTyper.Core;

namespace WxTyper.WinUI;

public sealed partial class MainWindow
{
    private static TextBox Field(string label, string value, string placeholder = "") => new() { Header = label, Text = value, PlaceholderText = placeholder, HorizontalAlignment = HorizontalAlignment.Stretch };
    private static TextBlock Hint(string text) => new() { Text = text, TextWrapping = TextWrapping.Wrap, FontSize = 12, Opacity = .65 };
    private async Task ImageLinksAsync()
    {
        if (dialogOpen) return;
        var site = Field("网站前缀", settings.SitePrefix, "https://example.com");
        var images = Field("图片 CDN 前缀", settings.ImagePrefix, "https://cdn.example.com");
        var content = new StackPanel { Spacing = 16, MinWidth = 360 };
        content.Children.Add(Hint("统一处理文章中的相对图片地址。本地 assets 图片不会添加 CDN 前缀。"));
        content.Children.Add(images); content.Children.Add(site);
        var dialog = new ContentDialog { XamlRoot = root.XamlRoot, Title = "图片链接", Content = content, PrimaryButtonText = "保存", CloseButtonText = "取消", DefaultButton = ContentDialogButton.Primary };
        dialogOpen = true;
        try
        {
            if (await dialog.ShowAsync() == ContentDialogResult.Primary)
            {
                var draft = settings.Clone(); draft.SitePrefix = site.Text.Trim(); draft.ImagePrefix = images.Text.Trim();
                store.SavePreferences(draft); settings = draft; await RenderAsync(); Notify("图片链接设置已保存。");
            }
        }
        finally { dialogOpen = false; }
    }
    private async Task SettingsAsync()
    {
        if (dialogOpen) return;
        var draft = settings.Clone();
        var site = Field("网站前缀", draft.SitePrefix, "https://example.com");
        var images = Field("图片 CDN 前缀", draft.ImagePrefix, "https://cdn.example.com");
        var assets = Field("图片保存目录", draft.AssetsDirectory, "assets");
        var theme = new ComboBox { Header = "默认排版主题", HorizontalAlignment = HorizontalAlignment.Stretch };
        foreach (var item in AppSettings.Themes) theme.Items.Add(new ComboBoxItem { Content = item.Value, Tag = item.Key });
        theme.SelectedIndex = Math.Max(0, AppSettings.Themes.Keys.ToList().IndexOf(draft.Theme));
        var general = new StackPanel { Spacing = 14 }; general.Children.Add(site); general.Children.Add(images); general.Children.Add(assets);
        general.Children.Add(Hint("图片、Mermaid 和 AI 配图保存在文章同级的相对目录中。")); general.Children.Add(theme);
        general.Children.Add(Hint("自定义 CSS 可从主窗口的排版主题菜单导入。"));

        var baseUrl = Field("API Base URL", draft.OpenAIBaseURL);
        var apiKey = new PasswordBox { Header = "API Key", Password = draft.OpenAIKey, PlaceholderText = "sk-…" };
        var summaryModel = Field("摘要模型", draft.SummaryModel);
        var imageModel = Field("图片模型", draft.ImageModel);
        var prompt = Field("封面提示词（留空自动生成）", draft.CustomImagePrompt); prompt.AcceptsReturn = true; prompt.TextWrapping = TextWrapping.Wrap; prompt.MinHeight = 90; prompt.MaxHeight = 160;
        var ai = new StackPanel { Spacing = 14 }; ai.Children.Add(baseUrl); ai.Children.Add(apiKey); ai.Children.Add(summaryModel); ai.Children.Add(imageModel); ai.Children.Add(prompt);
        ai.Children.Add(Hint("API Key 和 APPSECRET 使用 Windows DPAPI 加密，仅当前 Windows 用户可解密。测试接口会发送一条简短请求，可能产生 API 费用。"));
        var aiTest = new Button { Content = "测试 OpenAI 接口" }; var aiStatus = Hint(""); ai.Children.Add(aiTest); ai.Children.Add(aiStatus);

        var appId = Field("APPID", draft.WeChatAppID);
        var appSecret = new PasswordBox { Header = "APPSECRET", Password = draft.WeChatAppSecret };
        var wechat = new StackPanel { Spacing = 14 }; wechat.Children.Add(appId); wechat.Children.Add(appSecret);
        wechat.Children.Add(Hint("填写微信公众号开发者配置。上传永久素材会复用有效 access_token；请确认公众号接口权限及 IP 白名单。"));
        var wechatTest = new Button { Content = "测试 access_token" }; var wechatStatus = Hint(""); wechat.Children.Add(wechatTest); wechat.Children.Add(wechatStatus);
        wechatStatus.IsTextSelectionEnabled = true;
        var advanced = new StackPanel { Spacing = 14 }; advanced.Children.Add(Hint("会话日志只保留本次运行最近 200 条操作，不记录密钥、令牌或服务端响应正文。"));
        advanced.Children.Add(new TextBlock { Text = logs.Count == 0 ? "暂无日志" : string.Join("\n\n", logs), IsTextSelectionEnabled = true, TextWrapping = TextWrapping.Wrap, FontFamily = new FontFamily("Consolas"), FontSize = 12 });
        var tabs = new Pivot { Width = 580, Height = 490 };
        foreach (var (name, panel) in new[] { ("通用", general), ("OpenAI", ai), ("公众号", wechat), ("高级", advanced) })
            tabs.Items.Add(new PivotItem { Header = name, Content = new ScrollViewer { Content = panel, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Padding = new Thickness(4, 8, 16, 16) } });
        var dialog = new ContentDialog { XamlRoot = root.XamlRoot, Title = "设置", Content = tabs, PrimaryButtonText = "保存设置", CloseButtonText = "取消", DefaultButton = ContentDialogButton.Primary };
        dialog.Resources["ContentDialogMaxWidth"] = 680d;
        void ReadDraft()
        {
            draft.SitePrefix = site.Text.Trim(); draft.ImagePrefix = images.Text.Trim(); draft.AssetsDirectory = string.IsNullOrWhiteSpace(assets.Text) ? "assets" : assets.Text.Trim();
            draft.Theme = ((ComboBoxItem)theme.SelectedItem).Tag.ToString()!;
            draft.OpenAIBaseURL = baseUrl.Text.Trim(); draft.OpenAIKey = apiKey.Password.Trim(); draft.SummaryModel = summaryModel.Text.Trim(); draft.ImageModel = imageModel.Text.Trim();
            draft.CustomImagePrompt = prompt.Text; draft.WeChatAppID = appId.Text.Trim(); draft.WeChatAppSecret = appSecret.Password.Trim();
        }
        using var testCancellation = new CancellationTokenSource();
        bool testing = false;
        async Task TestAsync(bool isAI)
        {
            if (testing) return;
            ReadDraft(); testing = true; aiTest.IsEnabled = wechatTest.IsEnabled = dialog.IsPrimaryButtonEnabled = false;
            var label = isAI ? aiStatus : wechatStatus; label.Text = "测试中…";
            try { label.Text = isAI ? await openAI.TestAsync(draft.Clone(), testCancellation.Token) : await weChat.TestAsync(draft.Clone(), testCancellation.Token); }
            catch (OperationCanceledException) { label.Text = "测试已取消或超时。"; }
            catch (Exception error) { label.Text = error is InvalidOperationException ? error.Message : "网络请求失败，请检查网络及接口配置。"; }
            finally { testing = false; aiTest.IsEnabled = wechatTest.IsEnabled = dialog.IsPrimaryButtonEnabled = true; }
        }
        aiTest.Click += async (_, _) => await TestAsync(true); wechatTest.Click += async (_, _) => await TestAsync(false);
        var saveError = Hint(""); general.Children.Add(saveError);
        dialog.PrimaryButtonClick += (sender, args) =>
        {
            try
            {
                ReadDraft(); _ = ImageService.AssetsPath(Path.Combine(Path.GetTempPath(), "wxtyper-settings-check", "article.md"), draft.AssetsDirectory);
                store.Save(draft);
                if (draft.Theme != settings.Theme) customCss = customTheme = null;
                settings = draft;
            }
            catch { args.Cancel = true; tabs.SelectedIndex = 0; saveError.Text = "保存失败，请检查图片目录是否为文章下的相对路径，以及本地设置目录是否可写。"; }
        };
        dialogOpen = true;
        try { if (await dialog.ShowAsync() == ContentDialogResult.Primary) { RefreshStatus(); await RenderAsync(); Notify("设置已保存，密钥已加密。"); } }
        finally { testCancellation.Cancel(); dialogOpen = false; }
    }
}
