# WxTyper

初衷: 给自己用的发布微信公众号的Markdown编辑器, 目的就一个, 方便我张贴我博客里的文章进行发布。主要是我博客里的图片的URL是相对路径, 而一些现成的编辑器不支持相对路径, 所以我需要一个工具来帮我处理这个问题。

## 功能

- **实时预览**: 实时 Markdown 渲染，支持 WeChat 优化样式
- **主题选择**: 选择默认（绿色）、蓝宝石（蓝色）或樱花（粉色）主题
- **图片 URL 前缀**: 自动将相对图片路径添加到基础 URL
- **一键复制**: 将格式化 HTML 复制到剪贴板，直接粘贴到 WeChat
- **跨平台**: 使用 Tauri 构建，支持 Windows、macOS 和 Linux

## 使用方法

### 开发

```bash
npm install
npm run tauri dev
```

### 构建

```bash
npm run tauri build
```

## IDE推荐和插件

- [VS Code](https://code.visualstudio.com/) 
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
