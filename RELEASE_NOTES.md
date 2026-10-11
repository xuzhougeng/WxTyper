# WxTyper v0.1

首个 Windows / macOS 原生版本，用 Markdown 编写和排版微信公众号文章。

- Windows 使用 WinUI 3，macOS 使用 SwiftUI；支持实时预览和四套排版主题。
- 支持本地相对图片、富 HTML 复制、Mermaid 导出、图片本地化和微信公众号素材上传。
- 支持 OpenAI 摘要、封面和选区配图，密钥保存在本机加密存储中。
- Windows 包含标题栏菜单、默认隐藏的悬浮工具栏、渐进式预览和微信上传错误诊断。

## 下载与安装

| 文件 | 适用平台 | 安装方式 |
| --- | --- | --- |
| `WxTyper-0.1.0-Windows-x64-Setup.exe` | Windows 10 2004+ / Windows 11，x64 | 运行安装程序；按当前用户安装，无需管理员权限。 |
| `WxTyper-0.1.0-Windows-x64-portable.zip` | Windows x64 | 完整解压后运行 `WxTyper.exe`。 |
| `WxTyper-0.1.0-macOS-universal.dmg` | macOS 14+，Apple Silicon / Intel | 打开后将应用拖入 Applications。 |
| `SHA256SUMS.txt` | 所有平台 | 安装包 SHA-256 校验值。 |

Windows 已包含 .NET 和 Windows App SDK。安装程序会在缺少 WebView2 时联网安装；便携版需自行安装 [WebView2 Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。Windows 安装程序未做代码签名，首次运行可能出现 SmartScreen 提示。

macOS 暂不提供 Developer ID 签名和 Apple 公证，仅含运行所需的 ad-hoc 签名。首次打开若被拦截，可到“系统设置 → 隐私与安全性”选择“仍要打开”。如果提示“已损坏”，请先确认下载来源及 SHA-256，再对该应用执行：

```bash
xattr -dr com.apple.quarantine /Applications/WxTyper.app
```

macOS 安装说明也包含在 DMG 中。

## 验证范围

发布流水线执行 Windows 核心及原生 WebView2 回归、安装/启动/卸载检查，以及 macOS XCTest、渲染检查、双架构校验、DMG 校验和应用启动检查。网络服务回归使用模拟响应；真实 OpenAI / 微信账号的权限、额度和白名单需要自行配置。Mermaid 首次加载需要访问 jsDelivr。
