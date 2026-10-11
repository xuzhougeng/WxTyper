# WxTyper

WxTyper 是面向微信公众号文章排版的原生 Markdown 编辑器。macOS 使用 SwiftUI、AppKit 与 WebKit；Windows 使用 WinUI 3 与 WebView2。两端使用相同的四套排版主题，Windows 版对照 SwiftUI 版提供分栏编辑、右侧工具栏和文章处理功能。

## 功能

- Markdown 实时编辑与微信宽度预览
- Zen Green、Lapis、Sakura、Tech 四套内置主题，以及自定义 CSS 主题导入
- 相对图片 URL 前缀与本地 `assets` 图片预览
- 富 HTML 与纯文本双格式剪贴板复制，可直接粘贴到微信公众号编辑器
- OpenAI 文章摘要、微信公众号封面图和选区配图
- 远程图片一键本地化
- Mermaid 实时预览、PNG 导出并自动替换 Markdown 代码块
- 微信公众号永久素材上传、URL 替换和本地上传日志复用
- Markdown 文件打开、保存与另存为
- OpenAI API Key 与微信公众号 APPSECRET 在 macOS 使用 Keychain，在 Windows 使用当前用户 DPAPI 加密保存

图片生成使用 OpenAI Image API 的 `POST /v1/images/generations`，默认模型为 `gpt-image-2`。接口形式以 [OpenAI 图片生成官方文档](https://developers.openai.com/api/docs/guides/image-generation) 为准。

## 系统要求

### macOS

- macOS 14 或更高版本
- Xcode 16 或更高版本（推荐使用当前正式版）
- XcodeGen（仅在修改 `project.yml` 后重新生成工程时需要）

### Windows

- Windows 10 2004（19041）或更高版本，x64；推荐 Windows 11
- Microsoft Edge WebView2 Evergreen Runtime（多数 Windows 11 已安装）
- 开发需要 .NET 8 SDK 或更新版本，以及 Windows SDK 10.0.19041 或更高版本（可通过 Visual Studio 2022 安装）
- 发布目录自带 .NET 和 Windows App SDK，无需额外安装这两个运行时

## Windows 开发与运行

在仓库根目录使用 PowerShell：

```powershell
.\Scripts\build-windows.ps1 -Run
```

产物为 `build/windows/WxTyper.exe`。分发时需要保留整个 `build/windows` 目录。也可在 Visual Studio 2022 中打开 `Native/Windows/WxTyper.WinUI/WxTyper.WinUI.csproj`，选择 x64 运行。

首次构建需要访问 NuGet。如需使用本地代理，可在同一 PowerShell 会话设置：

```powershell
$env:HTTP_PROXY="http://127.0.0.1:7897"
$env:HTTPS_PROXY="http://127.0.0.1:7897"
```

Windows 快捷键：`Ctrl+N` 新建、`Ctrl+O` 打开、`Ctrl+S` 保存、`Ctrl+Shift+S` 另存为、`Ctrl+Alt+C` 复制微信 HTML、`Ctrl+Shift+R` 生成摘要、`Ctrl+,` 设置。右键保存按钮也可新建或另存为；分栏中间的分隔条可拖动。新建、打开和关闭前会提示保存未保存的内容。AI 和图片操作期间可从状态栏取消。

Windows 设置存放在 `%LOCALAPPDATA%\WxTyper`；`settings.json` 不包含密钥，`secrets.bin` 使用 DPAPI 当前用户加密。自定义 CSS 仅用于当前会话。开发验证可以通过 `WXTYPER_DATA_DIR` 指定独立设置和 WebView2 缓存目录。

本地图片以文章文件夹为根目录预览，图片保存目录必须位于该文件夹内。上传素材会在文章目录写入 `wechat_media_log.jsonl`，按公众号 APPID、原图片地址和内容 SHA-256 复用上传结果；兼容读取 SwiftUI 日志字段，但缺少账号和内容校验的旧条目会重新上传。日志不包含 access_token。

复制会同时写入带内联样式的 HTML 和 Markdown 纯文本。Mermaid 代码块需先从工具菜单导出 PNG；本地图片要在公众号中显示，还需上传为可访问的图片 URL。预览是 HTML 内容，编辑器、工具栏、设置和文件对话框均为原生 Windows 控件。

Windows 核心回归检查：

```powershell
dotnet run --project Native/Windows/WxTyper.Tests/WxTyper.Tests.csproj
```

检查涵盖 Markdown/主题、脚注、图片引用与替换、UTF-8 保存、DPAPI、OpenAI 请求及微信上传缓存。网络服务检查使用模拟 HTTP 响应，真实账号权限、额度、IP 白名单与公众号粘贴效果仍需用自己的账号验收。

## macOS 开发

直接打开 `WxTyper.xcodeproj`，选择 `WxTyper` scheme 运行。

工程文件由 XcodeGen 管理。修改 `project.yml` 后执行：

```bash
xcodegen generate
```

命令行构建并生成可直接运行的、临时签名的 `.app`：

```bash
./Scripts/build-app.sh
open build/WxTyper.app
```

该脚本使用 Apple Swift 编译器构建 arm64 macOS 应用，适合本地开发验证。正式发布时请在 Xcode 中设置 Developer ID、归档并完成 notarization。

## 配置

应用设置中提供：

- 网站前缀、图片 CDN 前缀与本地图片目录
- OpenAI Base URL、API Key、摘要模型与图片模型
- 微信公众号 APPID 与 APPSECRET
- 自定义封面图片提示词

macOS 普通偏好写入 `UserDefaults`；OpenAI API Key 和微信公众号 APPSECRET 仅写入当前 Mac 的 Keychain，不会进入项目文件或调试日志。Windows 使用上述本地设置与加密存储。

## macOS 测试

Xcode 中运行 `WxTyperTests`，或执行轻量渲染冒烟测试：

```bash
xcrun swiftc -parse-as-library \
  Native/WxTyper/Services/MarkdownRenderer.swift \
  Scripts/RendererSmokeTests.swift \
  -o /tmp/wxtyper-renderer-tests
/tmp/wxtyper-renderer-tests
```

> 两端 Mermaid 预览均使用 Mermaid 10，首次加载需要能够访问 jsDelivr。Windows 固定使用 10.9.3。
