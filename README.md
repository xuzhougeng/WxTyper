# WxTyper

WxTyper 是面向微信公众号文章排版的原生 Markdown 编辑器。macOS 使用 SwiftUI、AppKit 与 WebKit；Windows 使用 WinUI 3 与 WebView2。两端使用相同的四套排版主题，Windows 版对照 SwiftUI 版提供分栏编辑、悬浮工具栏和文章处理功能。

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

## 下载与安装

在 [GitHub Releases](https://github.com/xuzhougeng/WxTyper/releases/latest) 下载最新版：

- Windows x64：运行 `WxTyper-版本-Windows-x64-Setup.exe`，或完整解压便携 ZIP 后运行 `WxTyper.exe`。安装程序按当前用户安装；缺少 WebView2 时会联网安装，便携版需自行准备 WebView2。
- macOS 14+：打开 `WxTyper-版本-macOS-universal.dmg`，将应用拖入 Applications，同时支持 Apple Silicon 和 Intel。
- 发布页提供 `SHA256SUMS.txt`。Windows 包含 .NET 和 Windows App SDK；使用安装包无需开发环境。

当前安装包未做发行者签名。Windows 首次安装可能出现 SmartScreen 提示；macOS 暂无 Developer ID 签名和公证，仅有 ad-hoc 签名。macOS 首次被拦截可在“系统设置 → 隐私与安全性”选择“仍要打开”；其他处理方式见 [macOS 安装说明](INSTALL-macOS.txt)。

## 开发环境

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

菜单直接集成在窗口最顶部的标题栏，与应用名、文档名和窗口按钮同一行；文档名及其右侧空白区域可拖动窗口。菜单提供 File（新建、打开／导入 Markdown、保存、另存为、导入 CSS、设置、退出）、View（视图、主题与悬浮工具栏开关）和 Tools（文章与图片工具），覆盖全部工具栏功能。右侧悬浮工具栏每次启动默认隐藏，可从“视图 → 显示悬浮工具栏”打开，也可用栏顶的关闭按钮收起；显示时覆盖在内容上方，不占用编辑或预览宽度。Windows 快捷键：`Ctrl+N` 新建、`Ctrl+O` 打开、`Ctrl+S` 保存、`Ctrl+Shift+S` 另存为、`Ctrl+Alt+C` 复制微信 HTML、`Ctrl+Shift+R` 生成摘要、`Ctrl+,` 设置。右键保存按钮也可新建或另存为；分栏中间的分隔条可拖动。新建、打开和关闭前会提示保存未保存的内容。AI 和图片操作期间可从状态栏取消。

预览在普通编辑时局部更新内容并保留未变化的图片和 Mermaid 图。本地图片相对 Markdown 文件所在目录解析，支持 `assets/image.png`、`./assets/image.png`、中文和带空格的路径。切换文章目录、另存到其他目录或新建文档时，先刷新 WebView2 的本地映射和空白预览外壳，确保图片来自当前文章；正文无需等待远程图片。预览顶部显示转圈、图片完成数量、进度条和失败信息。编辑时保留预览滚动位置，打开另一篇文章时回到顶部。Windows 文本框的 CR、CRLF 和 LF 换行统一处理，打开文件不会因换行转换被误判为修改。

Windows 设置存放在 `%LOCALAPPDATA%\WxTyper`；`settings.json` 不包含密钥，`secrets.bin` 使用 DPAPI 当前用户加密。自定义 CSS 仅用于当前会话。开发验证可以通过 `WXTYPER_DATA_DIR` 指定独立设置和 WebView2 缓存目录。

Windows 版在微信接口返回错误时会显示出口公网 IP：优先采用微信响应中识别的地址，否则通过 `api.ipify.org` 检测，并标明代理分流可能使微信出口不同。检测不携带微信凭证，最多等待 3 秒，失败时保留原始错误；成功请求不进行 IP 查询。设置中的测试结果可选中复制。错误 `41005` 会明确提示缺少上传文件数据，不再将其笼统归为 IP 白名单问题。

本地图片以文章文件夹为根目录预览，图片保存目录必须位于该文件夹内。上传素材会在文章目录写入 `wechat_media_log.jsonl`，按公众号 APPID、原图片地址和内容 SHA-256 复用上传结果；兼容读取 SwiftUI 日志字段，但缺少账号和内容校验的旧条目会重新上传。日志不包含 access_token。

复制会同时写入带内联样式的 HTML 和 Markdown 纯文本。Mermaid 代码块需先从工具菜单导出 PNG；本地图片要在公众号中显示，还需上传为可访问的图片 URL。预览是 HTML 内容，编辑器、工具栏、设置和文件对话框均为原生 Windows 控件。

Windows 核心回归检查：

```powershell
dotnet run --project Native/Windows/WxTyper.Tests/WxTyper.Tests.csproj
```

检查涵盖 Markdown/主题、脚注、图片引用与替换、UTF-8 保存、DPAPI、OpenAI 请求及微信上传缓存。网络服务检查使用模拟 HTTP 响应，真实账号权限、额度、IP 白名单与公众号粘贴效果仍需用自己的账号验收。

微信上传检查还会读取完整 multipart 请求正文，验证 `media` 字段、boundary、文件名编码及图片字节。可运行 `dotnet run --project Native/Windows/WxTyper.Tests/WxTyper.Tests.csproj -- --upload-fixture 'C:\path\image.png'` 检查指定图片：仅在临时目录内构造和验证请求，不向微信发送图片。Windows 上传使用与 Swift 版一致的表单格式，中文文件名仅在传输时转换为 ASCII 名称，本地文件保持原名；空图片会在发送前报错。

预览的浏览器回归脚本为 `Scripts/preview-browser-tests.cjs`，需要 Node.js、模块路径中可用的 Playwright，以及本机 Microsoft Edge。先创建 `test-results` 目录，再执行：

```powershell
dotnet run --project Native/Windows/WxTyper.Tests/WxTyper.Tests.csproj -- --preview-fixture test-results/preview-after.html
node Scripts/preview-browser-tests.cjs
```

该检查使用受控慢图和模拟 Mermaid 响应，验证正文先显示、图片节点复用、加载进度、滚动位置、失败状态以及复制／PNG 导出桥接。若提供旧版 `test-results/preview-before.html`，还会记录慢图加载的前后耗时；这是受控条件下的页面测试，不代表所有文档的实际网络速度。

本地图片映射需要在实际 WebView2 中验证，普通浏览器无法覆盖这个边界。运行 `./Scripts/test-windows-preview.ps1` 可检查首次打开、目录切换、中文／空格路径、图片复用和新建后的目录隔离；可选 `-ArticlePath 'C:\path\article.md'` 只读验证指定文章的全部图片。测试使用独立缓存，结果写入 `test-results/preview-native-*/result.json`。

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

该脚本使用 Xcode 构建 arm64 + x86_64 通用应用，并添加无需证书的 ad-hoc 签名。版本号来自 `VERSION`。当前发布暂不进行 Developer ID 签名或 notarization。

## CI 与发布

GitHub Actions 在 `main` 推送和 Pull Request 时执行两端测试，并生成 Windows 安装程序、便携 ZIP 和 macOS DMG。Windows 检查包含实际 WebView2 回归与安装、启动、卸载；macOS 执行 XCTest、渲染检查、通用架构与 DMG 校验，以及打包应用启动检查。

本地打包（Windows 需安装 Inno Setup 6；macOS 需 Xcode）：

```powershell
./Scripts/package-windows.ps1
```

```bash
zsh Scripts/package-macos.sh
```

产物位于 `dist/`。发布时更新 `VERSION`、Xcode 工程的默认版本号和 `RELEASE_NOTES.md`，提交后推送匹配的版本标签（例如 `v0.1` 对应 `0.1.0`）。流水线只在两端测试与打包全部通过后发布 GitHub Release，附带 SHA-256 校验文件。PR 和普通分支构建只上传 Actions artifacts。

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
