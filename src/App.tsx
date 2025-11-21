import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { FileText, Save, Copy, Palette, Image as IconImage, Upload, Sparkles, Settings } from 'lucide-react';
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
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
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
      const svgBase64 = btoa(unescape(encodeURIComponent(svg)));
      const img = doc.createElement("img");
      img.src = `data:image/svg+xml;base64,${svgBase64}`;
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      node.replaceWith(img);
    } catch (error) {
      console.error("Mermaid render failed", error);
    }
  }
  return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
}

async function svgToPngBytes(svg: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.width || 800;
          canvas.height = img.height || 600;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("无法获取 Canvas 上下文"));
            return;
          }
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error("Canvas 转换 PNG 失败"));
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              const buffer = reader.result as ArrayBuffer;
              resolve(new Uint8Array(buffer));
            };
            reader.onerror = () => {
              reject(new Error("读取 PNG 数据失败"));
            };
            reader.readAsArrayBuffer(blob);
          }, "image/png");
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => {
        reject(new Error("SVG 图像加载失败"));
      };
      const svgBase64 = btoa(unescape(encodeURIComponent(svg)));
      const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;
      img.src = dataUrl;
    } catch (err) {
      reject(err);
    }
  });
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

图片

![图片](/upload/2025/11/image-1763733455594.png)

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

支持 Mermaid 语法, 注意用mermaid包裹。但在上传到公众号前，需要先转换为图片。

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

这是一个[测试链接](https://github.com/xuzhougeng/wx_markdown2html)的示例。

更多内容请访问 [WxTyper](https://github.com/xuzhougeng/wx_markdown2html) 和 [GitHub](https://github.com)。`
  );
  const [rawHtml, setRawHtml] = useState("");
  const [html, setHtml] = useState("");
  const [currentTheme, setCurrentTheme] = useState<BuiltinThemeName | string>("Default (Green)");
  const [imagePrefix, setImagePrefix] = useState("");
  const [customTheme, setCustomTheme] = useState<{ name: string; css: string } | null>(null);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [activePage, setActivePage] = useState<"editor" | "settings">("editor");
  const [sitePrefix, setSitePrefix] = useState("");
  const [openaiUrl, setOpenaiUrl] = useState("");
  const [openaiToken, setOpenaiToken] = useState("");
  const [openaiModel, setOpenaiModel] = useState("");
  const [wechatAppId, setWechatAppId] = useState("");
  const [wechatAppSecret, setWechatAppSecret] = useState("");
  const [isUploadingWechatImages, setIsUploadingWechatImages] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [openaiTestStatus, setOpenaiTestStatus] = useState("");
  const [wechatTestStatus, setWechatTestStatus] = useState("");
  const [isTestingOpenai, setIsTestingOpenai] = useState(false);
  const [isTestingWechat, setIsTestingWechat] = useState(false);
  const [settingsSaveStatus, setSettingsSaveStatus] = useState("");
  const previewRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const storedPrefix = localStorage.getItem("imagePrefix");
    if (storedPrefix) {
      setImagePrefix(storedPrefix);
    }
    const storedSitePrefix = localStorage.getItem("sitePrefix");
    if (storedSitePrefix) {
      setSitePrefix(storedSitePrefix);
    }
    const storedOpenaiUrl = localStorage.getItem("openaiUrl");
    if (storedOpenaiUrl) {
      setOpenaiUrl(storedOpenaiUrl);
    }
    const storedOpenaiToken = localStorage.getItem("openaiToken");
    if (storedOpenaiToken) {
      setOpenaiToken(storedOpenaiToken);
    }
    const storedWechatAppId = localStorage.getItem("wechatAppId");
    if (storedWechatAppId) {
      setWechatAppId(storedWechatAppId);
    }
    const storedWechatAppSecret = localStorage.getItem("wechatAppSecret");
    if (storedWechatAppSecret) {
      setWechatAppSecret(storedWechatAppSecret);
    }
    const storedOpenaiModel = localStorage.getItem("openaiModel");
    if (storedOpenaiModel) {
      setOpenaiModel(storedOpenaiModel);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("imagePrefix", imagePrefix);
  }, [imagePrefix]);

  useEffect(() => {
    localStorage.setItem("sitePrefix", sitePrefix);
  }, [sitePrefix]);

  useEffect(() => {
    localStorage.setItem("openaiUrl", openaiUrl);
  }, [openaiUrl]);

  useEffect(() => {
    localStorage.setItem("openaiToken", openaiToken);
  }, [openaiToken]);

  useEffect(() => {
    localStorage.setItem("wechatAppId", wechatAppId);
  }, [wechatAppId]);

  useEffect(() => {
    localStorage.setItem("wechatAppSecret", wechatAppSecret);
  }, [wechatAppSecret]);

  useEffect(() => {
    localStorage.setItem("openaiModel", openaiModel);
  }, [openaiModel]);

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

  const handleUploadImagesToWechat = async () => {
    try {
      const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__;
      if (!isTauri) {
        alert("上传公众号图片仅在 Tauri 应用中可用。");
        appendDebugLog("上传公众号图片失败：当前不在 Tauri 环境中。");
        return;
      }

      if (!wechatAppId || !wechatAppSecret) {
        alert("请先在设置页配置微信公众号 APPID 和 APPSECRET。");
        setActivePage("settings");
        appendDebugLog("上传公众号图片失败：未配置 APPID 或 APPSECRET。");
        return;
      }

      if (markdown.includes("```mermaid")) {
        alert("检测到 Mermaid 代码块，请先使用工具栏的“导出 Mermaid 图片”按钮，将 Mermaid 图保存为 PNG 并替换为图片后，再上传到公众号。");
        appendDebugLog("上传公众号图片被阻止：检测到 Mermaid 代码块，请先将 Mermaid 导出为 PNG 图片。");
        return;
      }

      setIsUploadingWechatImages(true);
      appendDebugLog(`开始上传图片到公众号并替换 Markdown 中的图片链接，使用 APPID=${wechatAppId || "<未填写>"}。`);

      let baseDir: string | null = null;
      if (currentFilePath) {
        baseDir = currentFilePath.replace(/[\\/][^\\/]*$/, "");
      }

      const result = await invoke<any>("wechat_upload_and_replace_images", {
        markdown,
        appId: wechatAppId,
        appSecret: wechatAppSecret,
        baseDir,
        sitePrefix,
      });

      if (result && typeof result.markdown === "string") {
        setMarkdown(result.markdown);
        const count = Array.isArray(result.items) ? result.items.length : 0;
        appendDebugLog(`上传图片到公众号成功，处理图片数量: ${count}。`);
        alert("图片已上传到公众号并替换链接。");
      } else {
        appendDebugLog("上传公众号图片完成，但返回结果异常（缺少 markdown 字段）。");
        alert("上传完成，但返回结果异常。");
      }
    } catch (e) {
      console.error("Upload images to WeChat failed", e);
      appendDebugLog("上传公众号图片失败: " + String(e));
      alert("上传公众号图片失败");
    } finally {
      setIsUploadingWechatImages(false);
    }
  };

  useEffect(() => {
    setHtml(applyImagePrefix(rawHtml, imagePrefix));
  }, [rawHtml, imagePrefix]);

  const appendDebugLog = (message: string) => {
    const time = new Date().toLocaleString();
    const line = `[${time}] ${message}`;
    setDebugLogs((prev) => [line, ...prev].slice(0, 200));
  };

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
      appendDebugLog("复制 HTML 到剪贴板成功。");
    } catch (e) {
      console.error("Copy failed", e);
      appendDebugLog("复制到剪贴板失败: " + String(e));
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

  const handleExportMermaidToPng = async () => {
    try {
      const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__;
      if (!isTauri) {
        alert("导出 Mermaid 图片仅在 Tauri 应用中可用。");
        appendDebugLog("导出 Mermaid 图片失败：当前不在 Tauri 环境中。");
        return;
      }

      const mermaidBlocks: string[] = [];
      const re = /```mermaid([\s\S]*?)```/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(markdown)) !== null) {
        const code = (match[1] || "").trim();
        if (code) {
          mermaidBlocks.push(code);
        }
      }

      if (mermaidBlocks.length === 0) {
        alert("当前文档中没有 Mermaid 代码块。");
        appendDebugLog("导出 Mermaid 图片失败：未找到 Mermaid 代码块。");
        return;
      }

      if (!currentFilePath) {
        alert("请先保存 Markdown 文件，再导出 Mermaid 图片。");
        appendDebugLog("导出 Mermaid 图片失败：当前文件尚未保存，无法确定图片目录。");
        return;
      }

      const lastSepIndex = Math.max(
        currentFilePath.lastIndexOf("\\"),
        currentFilePath.lastIndexOf("/"),
      );
      const dir = lastSepIndex >= 0 ? currentFilePath.slice(0, lastSepIndex) : "";
      const sep = currentFilePath.includes("\\") ? "\\" : "/";

      ensureMermaidInitialized();

      let newMarkdown = "";
      let lastIndex = 0;
      let blockIndex = 0;
      const blockRegex = /```mermaid([\s\S]*?)```/g;
      let m: RegExpExecArray | null;

      while ((m = blockRegex.exec(markdown)) !== null) {
        const matchStart = m.index;
        const matchEnd = m.index + m[0].length;
        const code = (m[1] || "").trim();

        newMarkdown += markdown.slice(lastIndex, matchStart);

        if (!code) {
          newMarkdown += markdown.slice(matchStart, matchEnd);
          lastIndex = matchEnd;
          continue;
        }

        const id = `export-mermaid-${Date.now()}-${blockIndex}`;
        const { svg } = await mermaid.render(id, code);
        const pngBytes = await svgToPngBytes(svg);

        const timestamp = Date.now();
        const fileName = mermaidBlocks.length === 1
          ? `${timestamp}.png`
          : `${timestamp}-${blockIndex + 1}.png`;
        const fullPath = dir ? `${dir}${sep}${fileName}` : fileName;

        await invoke("save_binary_file", { path: fullPath, bytes: Array.from(pngBytes) });

        const imageMarkdown = `![Mermaid 图](${fileName})`;
        newMarkdown += imageMarkdown;

        lastIndex = matchEnd;
        blockIndex += 1;
      }

      newMarkdown += markdown.slice(lastIndex);
      setMarkdown(newMarkdown);

      alert(`Mermaid 图已导出为 PNG 并替换为图片引用（共 ${blockIndex} 个）。`);
      appendDebugLog(`导出 Mermaid 图片并替换 Markdown 成功，数量: ${blockIndex}。`);
    } catch (e) {
      console.error("Export Mermaid to PNG failed", e);
      appendDebugLog("导出 Mermaid 图片失败: " + String(e));
      alert("导出 Mermaid 图片失败");
    }
  };

  const handleLocalizeImages = async () => {
    try {
      const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__;
      if (!isTauri) {
        alert("一键本地化图片仅在 Tauri 应用中可用。");
        appendDebugLog("一键本地化图片失败：当前不在 Tauri 环境中。");
        return;
      }

      if (!currentFilePath) {
        alert("请先保存 Markdown 文件，再进行本地化图片操作。");
        appendDebugLog("一键本地化图片失败：当前文件尚未保存，无法确定 assets 目录。");
        return;
      }

      let baseDir: string | null = null;
      if (currentFilePath) {
        baseDir = currentFilePath.replace(/[\\/][^\\/]*$/, "");
      }

      appendDebugLog("开始一键本地化图片：下载远程图片到 assets 并重写 Markdown 路径。");

      const result = await invoke<string>("localize_images_to_assets", {
        markdown,
        baseDir,
        sitePrefix,
      });

      setMarkdown(result);
      appendDebugLog("一键本地化图片完成。");
      alert("图片已本地化到 assets 目录并更新 Markdown 路径。");
    } catch (e) {
      console.error("Localize images failed", e);
      appendDebugLog("一键本地化图片失败: " + String(e));
      alert("一键本地化图片失败");
    }
  };

  const handleGenerateSummary = async () => {
    try {
      const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__;
      if (!isTauri) {
        alert("AI 摘要仅在 Tauri 应用中可用。");
        appendDebugLog("AI 摘要失败：当前不在 Tauri 环境中。");
        return;
      }
      setIsSummarizing(true);
      setSummary("");
      const effectiveOpenaiUrl = openaiUrl && openaiUrl.trim().length > 0
        ? openaiUrl.trim()
        : "<默认 https://api.deepseek.com/v1>";
      appendDebugLog(`开始请求 AI 摘要，使用 OpenAI URL=${effectiveOpenaiUrl}, Model=${openaiModel || "<默认 deepseek-chat>"}。`);
      const result = await invoke<string>("generate_summary", {
        markdown,
        api_base_url: openaiUrl,
        api_token: openaiToken,
        api_model: openaiModel,
      });
      setSummary(result);
      appendDebugLog("AI 摘要成功生成。");
    } catch (e) {
      console.error("Generate summary failed", e);
      appendDebugLog("AI 摘要失败: " + String(e));
      alert("AI 摘要失败");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleTestOpenai = async () => {
    try {
      const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__;
      if (!isTauri) {
        alert("测试 OpenAI 接口仅在 Tauri 应用中可用。");
        appendDebugLog("测试 OpenAI 接口失败：当前不在 Tauri 环境中。");
        return;
      }

      if (!openaiToken) {
        alert("请先在设置页填写 OpenAI Token。");
        appendDebugLog("测试 OpenAI 接口失败：未填写 OpenAI Token。");
        return;
      }

      setIsTestingOpenai(true);
      const effectiveOpenaiUrl = openaiUrl && openaiUrl.trim().length > 0
        ? openaiUrl.trim()
        : "<默认 https://api.deepseek.com/v1>";
      setOpenaiTestStatus("正在测试 OpenAI 接口...");
      appendDebugLog(`开始测试 OpenAI 接口配置，使用 URL=${effectiveOpenaiUrl}, Model=${openaiModel || "<默认 deepseek-chat>"}。`);

      const result = await invoke<string>("test_openai_config", {
        api_base_url: openaiUrl,
        api_token: openaiToken,
        api_model: openaiModel,
      });

      setOpenaiTestStatus(result);
      appendDebugLog("测试 OpenAI 接口成功: " + result);
    } catch (e) {
      console.error("Test OpenAI config failed", e);
      const msg = "测试 OpenAI 接口失败: " + String(e);
      setOpenaiTestStatus(msg);
      appendDebugLog(msg);
    } finally {
      setIsTestingOpenai(false);
    }
  };

  const handleTestWechat = async () => {
    try {
      const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__;
      if (!isTauri) {
        alert("测试 access_token 仅在 Tauri 应用中可用。");
        appendDebugLog("测试 access_token 失败：当前不在 Tauri 环境中。");
        return;
      }

      if (!wechatAppId || !wechatAppSecret) {
        alert("请先在设置页填写微信公众号 APPID 和 APPSECRET。");
        appendDebugLog("测试 access_token 失败：未配置 APPID 或 APPSECRET。");
        return;
      }

      setIsTestingWechat(true);
      setWechatTestStatus("正在测试 access_token 获取...");
      appendDebugLog(`开始测试微信公众号 access_token 获取，使用 APPID=${wechatAppId}。`);

      const result = await invoke<string>("test_wechat_access_token", {
        appId: wechatAppId,
        appSecret: wechatAppSecret,
      });

      setWechatTestStatus(result);
      appendDebugLog("测试 access_token 成功: " + result);
    } catch (e) {
      console.error("Test WeChat access token failed", e);
      const msg = "测试 access_token 失败: " + String(e);
      setWechatTestStatus(msg);
      appendDebugLog(msg);
    } finally {
      setIsTestingWechat(false);
    }
  };

  const handleSettingsSave = () => {
    setSettingsSaveStatus("保存成功");
    appendDebugLog("保存设置成功");
    setTimeout(() => {
      setSettingsSaveStatus("");
    }, 2000);
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
            <IconImage size={16} color="var(--text-secondary)" />
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

          <button
            className="btn"
            onClick={handleGenerateSummary}
            disabled={isSummarizing}
            title="Generate AI Summary"
          >
            <Sparkles size={16} />
            {isSummarizing ? "生成中..." : "AI 摘要"}
          </button>

          <button
            className="btn"
            onClick={handleLocalizeImages}
            title="下载远程图片到 assets 并重写 Markdown 路径"
          >
            <Upload size={16} />
            一键本地化图片
          </button>

          <button
            className="btn"
            onClick={handleExportMermaidToPng}
            title="将文中的 Mermaid 图导出为 PNG 图片"
          >
            <Upload size={16} />
            导出 Mermaid 图片
          </button>

          <button
            className="btn"
            onClick={handleUploadImagesToWechat}
            disabled={isUploadingWechatImages}
            title="Upload images to WeChat and replace URLs"
          >
            <IconImage size={16} />
            {isUploadingWechatImages ? "上传中..." : "上传图片到公众号"}
          </button>

          <button className="btn btn-primary" onClick={copyToClipboard}>
            <Copy size={16} />
            Copy
          </button>

          <button
            className={`btn ${activePage === "settings" ? "btn-primary" : ""}`}
            onClick={() => setActivePage(activePage === "settings" ? "editor" : "settings")}
            title="Settings"
          >
            <Settings size={16} />
            {activePage === "settings" ? "返回编辑" : "设置"}
          </button>
        </div>
      </div>
      {activePage === "editor" ? (
        <div className="workspace">
          <div className="editor-pane">
            <div className="editor-header">
              <span>Markdown Editor</span>
              <span>{currentFilePath ? currentFilePath.split(/[\\/]/).pop() : 'Untitled'}</span>
            </div>
            <div className="summary-panel">
              <div className="summary-title">AI 摘要（≤100字）</div>
              <div className="summary-body">
                {isSummarizing
                  ? "正在生成摘要..."
                  : summary || "暂无摘要，点击上方“AI 摘要”按钮生成。"}
              </div>
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
      ) : (
        <div className="settings-pane">
          <div className="settings-toolbar">
            <div className="settings-toolbar-left">
              <span className="settings-label">自动保存</span>
              {settingsSaveStatus && (
                <span className="settings-save-status">{settingsSaveStatus}</span>
              )}
            </div>
            <button
              className="btn btn-primary"
              onClick={handleSettingsSave}
            >
              <Save size={16} />
              保存
            </button>
          </div>
          <div className="settings-section">
            <div className="settings-section-title">网站配置</div>
            <div className="settings-field">
              <label className="settings-label">网站前缀</label>
              <input
                className="input settings-input"
                type="text"
                value={sitePrefix}
                onChange={(e) => setSitePrefix(e.target.value)}
                placeholder="例如：https://example.com"
              />
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">OpenAI 兼容接口配置</div>
            <div className="settings-field">
              <label className="settings-label">接口 URL</label>
              <input
                className="input settings-input"
                type="text"
                value={openaiUrl}
                onChange={(e) => setOpenaiUrl(e.target.value)}
                placeholder="默认：https://api.deepseek.com/v1"
              />
            </div>
            <div className="settings-field">
              <label className="settings-label">Token</label>
              <input
                className="input settings-input"
                type="password"
                value={openaiToken}
                onChange={(e) => setOpenaiToken(e.target.value)}
                placeholder="API 访问密钥"
              />
            </div>
            <div className="settings-field">
              <label className="settings-label">模型</label>
              <input
                className="input settings-input"
                type="text"
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
                placeholder="默认：deepseek-chat"
              />
            </div>
            <div className="settings-field settings-test-row">
              <button
                className="btn"
                onClick={handleTestOpenai}
                disabled={isTestingOpenai}
              >
                {isTestingOpenai ? "测试中..." : "测试 OpenAI 接口"}
              </button>
              {openaiTestStatus && (
                <span className="settings-test-status">{openaiTestStatus}</span>
              )}
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">微信公众号配置</div>
            <div className="settings-field">
              <label className="settings-label">APPID</label>
              <input
                className="input settings-input"
                type="text"
                value={wechatAppId}
                onChange={(e) => setWechatAppId(e.target.value)}
                placeholder="公众号 APPID"
              />
            </div>
            <div className="settings-field">
              <label className="settings-label">APPSECRET</label>
              <input
                className="input settings-input"
                type="password"
                value={wechatAppSecret}
                onChange={(e) => setWechatAppSecret(e.target.value)}
                placeholder="公众号 APPSECRET"
              />
            </div>
            <div className="settings-field settings-test-row">
              <button
                className="btn"
                onClick={handleTestWechat}
                disabled={isTestingWechat}
              >
                {isTestingWechat ? "测试中..." : "测试获取 access_token"}
              </button>
              {wechatTestStatus && (
                <span className="settings-test-status">{wechatTestStatus}</span>
              )}
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">调试信息</div>
            <div className="settings-field">
              <div className="settings-label">最近的操作日志（仅当前会话内）</div>
              <div className="debug-panel">
                {debugLogs.length === 0 ? (
                  <div className="debug-empty">暂无调试日志。</div>
                ) : (
                  <ul className="debug-log-list">
                    {debugLogs.map((log, index) => (
                      <li key={index} className="debug-log-item">{log}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
