# WxTyper for macOS

WxTyper 是面向微信公众号文章排版的 macOS 原生 Markdown 编辑器。本版本已从 React + Tauri + Rust 完整迁移到 SwiftUI、AppKit 与 WebKit，不再提供 Windows 或 Linux 构建。

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
- OpenAI API Key 与微信公众号 APPSECRET 使用 macOS Keychain 保存

图片生成使用 OpenAI Image API 的 `POST /v1/images/generations`，默认模型为 `gpt-image-2`。接口形式以 [OpenAI 图片生成官方文档](https://developers.openai.com/api/docs/guides/image-generation) 为准。

## 系统要求

- macOS 14 或更高版本
- Xcode 16 或更高版本（推荐使用当前正式版）
- XcodeGen（仅在修改 `project.yml` 后重新生成工程时需要）

## 开发

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

普通偏好写入 `UserDefaults`；OpenAI API Key 和微信公众号 APPSECRET 仅写入当前 Mac 的 Keychain，不会进入项目文件或调试日志。

## 测试

Xcode 中运行 `WxTyperTests`，或执行轻量渲染冒烟测试：

```bash
xcrun swiftc -parse-as-library \
  Native/WxTyper/Services/MarkdownRenderer.swift \
  Scripts/RendererSmokeTests.swift \
  -o /tmp/wxtyper-renderer-tests
/tmp/wxtyper-renderer-tests
```

> Mermaid 预览沿用 Mermaid 10 的 WebKit 渲染方式，首次加载需要能够访问 jsDelivr。
