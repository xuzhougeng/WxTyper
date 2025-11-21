import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
// @ts-ignore
import defaultTheme from "./themes/default.css?inline";
// @ts-ignore
import lapisTheme from "./themes/lapis.css?inline";
// @ts-ignore
import sakuraTheme from "./themes/sakura.css?inline";
// @ts-ignore
import techTheme from "./themes/tech.css?inline";

const builtinThemes = {
  "Default (Green)": defaultTheme,
  "Lapis (Blue)": lapisTheme,
  "Sakura (Pink)": sakuraTheme,
  "Tech (Dark)": techTheme,
} as const;

type BuiltinThemeName = keyof typeof builtinThemes;

function applyImagePrefix(html: string, prefix: string): string {
  const effectivePrefix = prefix.trim();
  if (!effectivePrefix) return html;
  const trimmedPrefix = effectivePrefix.replace(/\/+$/, "");
  return html.replace(/(<img\b[^>]*\bsrc=)(["'])([^"']+?)\2/gi, (match, before, quote, url) => {
    const trimmedUrl = url.trim();
    if (/^(https?:|data:|\/\/)/i.test(trimmedUrl)) {
      return match;
    }
    let newUrl = trimmedUrl;
    if (trimmedUrl.startsWith("/")) {
      newUrl = `${trimmedPrefix}${trimmedUrl}`;
    } else {
      newUrl = `${trimmedPrefix}/${trimmedUrl}`;
    }
    return `${before}${quote}${newUrl}${quote}`;
  });
}

function App() {
  const [markdown, setMarkdown] = useState(
    `# WxTyper Markdown 示例

这是一个 **微信公众号排版** 的 Markdown 示例，包含常见语法。

## 列表

- 无序列表项 1
- 无序列表项 2

1. 有序列表 1
2. 有序列表 2

## 引用

> 这是一段引用文字，用来展示 blockquote 样式。

## 行内代码与代码块

行内代码示例：\`npm run tauri dev\`

\`\`\`js
function hello(name) {
  console.log("Hello, " + name);
}
hello("WeChat");
\`\`\`

## 表格

| 功能 | 描述 |
| ---- | ---- |
| 主题 | 多套微信风格主题 |
| 图片前缀 | 支持统一 CDN 前缀 |

## 链接

更多内容请访问 [WxTyper](https://github.com/xuzhougeng/wx_markdown2html)`
  );
  const [rawHtml, setRawHtml] = useState("");
  const [html, setHtml] = useState("");
  const [currentTheme, setCurrentTheme] = useState<BuiltinThemeName | string>("Default (Green)");
  const [imagePrefix, setImagePrefix] = useState("");
  const [customTheme, setCustomTheme] = useState<{ name: string; css: string } | null>(null);

  useEffect(() => {
    const storedPrefix = localStorage.getItem("imagePrefix");
    if (storedPrefix) {
      setImagePrefix(storedPrefix);
    }
  }, []);

  useEffect(() => {
    const convert = async () => {
      try {
        // @ts-ignore
        if (window.__TAURI_INTERNALS__) {
          let css = builtinThemes[currentTheme as BuiltinThemeName];
          if (!css && customTheme && currentTheme === customTheme.name) {
            css = customTheme.css;
          }
          if (!css) {
            css = builtinThemes["Default (Green)"];
          }
          const result = await invoke<string>("convert_markdown", {
            content: markdown,
            css
          });
          setRawHtml(result);
        } else {
          console.warn("Tauri API not available. Running in browser mode?");
          // Fallback for browser testing (no CSS inlining)
          setRawHtml(`<div class="wechat-content"><p><strong>Preview not available in browser. Run via 'npm run tauri dev' to see full preview.</strong></p><pre>${markdown}</pre></div>`);
        }
      } catch (e) {
        console.error("Conversion failed", e);
      }
    };
    convert();
  }, [markdown, currentTheme, customTheme]);

  useEffect(() => {
    setHtml(applyImagePrefix(rawHtml, imagePrefix));
  }, [rawHtml, imagePrefix]);

  const copyToClipboard = async () => {
    try {
      const blob = new Blob([html], { type: "text/html" });
      const textBlob = new Blob([markdown], { type: "text/plain" });
      const data = [new ClipboardItem({
        "text/html": blob,
        "text/plain": textBlob
      })];
      await navigator.clipboard.write(data);
      alert("Copied to clipboard!");
    } catch (e) {
      console.error("Copy failed", e);
      alert("Copy failed: " + e);
    }
  };

  return (
    <main className="container">
      <div className="toolbar">
        <select
          value={currentTheme}
          onChange={(e) => setCurrentTheme(e.target.value)}
          style={{ marginRight: '10px', padding: '8px', borderRadius: '4px' }}
        >
          {Object.keys(builtinThemes).map((themeName) => (
            <option key={themeName} value={themeName}>
              {themeName}
            </option>
          ))}
          {customTheme && (
            <option value={customTheme.name}>
              {customTheme.name}
            </option>
          )}
        </select>
        <input
          type="file"
          accept=".css"
          onChange={(e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) {
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result;
              if (typeof result !== "string") {
                return;
              }
              const name = `Custom: ${file.name}`;
              setCustomTheme({ name, css: result });
              setCurrentTheme(name);
            };
            reader.readAsText(file);
            e.target.value = "";
          }}
          style={{ marginRight: '10px', padding: '8px', borderRadius: '4px' }}
        />
        <input
          type="text"
          value={imagePrefix}
          onChange={(e) => {
            const value = e.target.value;
            setImagePrefix(value);
            localStorage.setItem("imagePrefix", value);
          }}
          placeholder="Image URL prefix, e.g. https://xuzhougeng.com"
          style={{ marginRight: '10px', padding: '8px', borderRadius: '4px', width: '280px' }}
        />
        <button onClick={copyToClipboard}>Copy for WeChat</button>
      </div>
      <div className="workspace">
        <div className="editor-pane">
          <textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder="Type Markdown here..."
          />
        </div>
        <div className="preview-pane">
          <iframe
            srcDoc={html}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="Preview"
          />
        </div>
      </div>
    </main>
  );
}

export default App;
