import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { FileText, Save, Copy, Palette, Image, Upload } from 'lucide-react';
import mermaid from "mermaid";
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

let mermaidInitialized = false;
function ensureMermaidInitialized() {
  if (!mermaidInitialized) {
    mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
    mermaidInitialized = true;
  }
}

async function inlineMermaid(htmlString: string) {
  ensureMermaidInitialized();
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, "text/html");
  const mermaidNodes = Array.from(doc.querySelectorAll(".mermaid"));
  let idx = 0;
  for (const node of mermaidNodes) {
    const code = node.textContent ?? "";
    if (!code.trim()) continue;
    try {
      const { svg } = await mermaid.render(`clipboard-mermaid-${idx++}`, code);
      const wrapper = doc.createElement("div");
      wrapper.innerHTML = svg;
      const svgElement = wrapper.firstElementChild;
      if (svgElement) {
        node.replaceWith(svgElement);
      }
    } catch (error) {
      console.error("Mermaid render failed", error);
    }
  }
  return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
}

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

## Mermaid

支持 Mermaid 语法, 注意用mermaid包裹

\`\`\`mermaid
graph TD;
    A-->B;
    A-->C;
    B-->D;
    C-->D;
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
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const storedPrefix = localStorage.getItem("imagePrefix");
    if (storedPrefix) {
      setImagePrefix(storedPrefix);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("imagePrefix", imagePrefix);
  }, [imagePrefix]);

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
      let htmlToCopy = html;
      const iframeDoc = previewRef.current?.contentDocument;
      if (iframeDoc?.body) {
        const processedBody = iframeDoc.body.innerHTML;
        htmlToCopy = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${processedBody}</body></html>`;
      }
      htmlToCopy = await inlineMermaid(htmlToCopy);
      const blob = new Blob([htmlToCopy], { type: "text/html" });
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

  const handleOpenMarkdown = async () => {
    try {
      const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__;
      if (!isTauri) {
        alert("打开文件仅在 Tauri 应用中可用。");
        return;
      }
      const selected = await open({
        multiple: false,
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }]
      });
      if (!selected || Array.isArray(selected)) {
        return;
      }
      const content = await invoke<string>("open_markdown_file", { path: selected });
      setMarkdown(content);
      setCurrentFilePath(selected);
    } catch (e) {
      console.error("Open markdown file failed", e);
      alert("打开 Markdown 文件失败");
    }
  };

  const handleSaveMarkdown = async () => {
    try {
      const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__;
      if (!isTauri) {
        alert("保存文件仅在 Tauri 应用中可用。");
        return;
      }

      let targetPath = currentFilePath;
      if (!targetPath) {
        const selected = await save({
          defaultPath: "Untitled.md",
          filters: [{ name: "Markdown", extensions: ["md", "markdown"] }]
        });
        if (!selected) {
          return;
        }
        targetPath = selected;
      }

      await invoke("save_markdown_file", { path: targetPath, content: markdown });
      setCurrentFilePath(targetPath);
      alert("保存成功");
    } catch (e) {
      console.error("Save markdown file failed", e);
      alert("保存 Markdown 文件失败");
    }
  };

  return (
    <div id="root">
      <div className="toolbar">
        <div className="toolbar-group">
          <div className="app-title">
            <FileText size={20} color="var(--primary)" />
            <span>WxTyper</span>
          </div>
          <div className="input-group">
            <button className="btn" onClick={handleOpenMarkdown} title="Open Markdown">
              <FileText size={16} /> Open
            </button>
            <button className="btn" onClick={handleSaveMarkdown} title="Save Markdown">
              <Save size={16} /> Save
            </button>
          </div>
        </div>

        <div className="toolbar-group">
          <div className="input-group">
            <Palette size={16} color="var(--text-secondary)" />
            <select
              className="select"
              value={currentTheme}
              onChange={(e) => setCurrentTheme(e.target.value)}
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
          </div>

          <div className="file-input-wrapper btn" title="Import CSS Theme">
            <Upload size={16} />
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
            />
          </div>

          <div className="input-group">
            <Image size={16} color="var(--text-secondary)" />
            <input
              className="input"
              type="text"
              value={imagePrefix}
              onChange={(e) => {
                const value = e.target.value;
                setImagePrefix(value);
              }}
              placeholder="Image URL Prefix"
              style={{ width: '180px' }}
            />
          </div>

          <button className="btn btn-primary" onClick={copyToClipboard}>
            <Copy size={16} />
            Copy
          </button>
        </div>
      </div>
      <div className="workspace">
        <div className="editor-pane">
          <div className="editor-header">
            <span>Markdown Editor</span>
            <span>{currentFilePath ? currentFilePath.split(/[\\/]/).pop() : 'Untitled'}</span>
          </div>
          <textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder="Type Markdown here..."
          />
        </div>
        <div className="preview-pane">
          <div className="preview-container">
            <iframe
              className="preview-iframe"
              srcDoc={html}
              title="Preview"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
