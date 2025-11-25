import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Toolbar } from "./components/Toolbar";
import { EditorPane } from "./components/EditorPane";
import { PreviewPane } from "./components/PreviewPane";
import { SettingsPane } from "./components/Settings";
import {
  ensureMermaidInitialized,
  inlineMermaid,
  renderMermaidSvg,
  svgToPngBytes,
} from "./utils/mermaid";
import { useMarkdownConverter, type CustomTheme } from "./hooks/useMarkdownConverter";
import { useProcessedHtml } from "./hooks/useProcessedHtml";
import { usePersistentState } from "./hooks/usePersistentState";
import "./App.css";

const DEFAULT_MARKDOWN = [
  "# WxTyper Markdown 示例",
  "",
  "这是一个 **微信公众号排版** 的 Markdown 示例，包含常见语法。",
  "",
  "图片",
  "",
  "![图片](/upload/2025/11/image-1763733455594.png)",
  "",
  "## 列表",
  "",
  "- 无序列表项 1",
  "- 无序列表项 2",
  "",
  "1. 有序列表 1",
  "2. 有序列表 2",
  "",
  "## 引用",
  "",
  "> 这是一段引用文字，用来展示 blockquote 样式。",
  "",
  "## 行内代码与代码块",
  "",
  "行内代码示例：`npm run tauri dev`",
  "",
  "```js",
  "function hello(name) {",
  '  console.log("Hello, " + name);',
  "}",
  'hello("WeChat");',
  "```",
  "",
  "## Mermaid",
  "",
  "支持 Mermaid 语法, 注意用mermaid包裹。但在上传到公众号前，需要先转换为图片。",
  "",
  "```mermaid",
  "graph TD;",
  "    A-->B;",
  "    A-->C;",
  "    B-->D;",
  "    C-->D;",
  "```",
  "",
  "## 表格",
  "",
  "| 功能 | 描述 |",
  "| ---- | ---- |",
  "| 主题 | 多套微信风格主题 |",
  "| 图片前缀 | 支持统一 CDN 前缀 |",
  "",
  "## 链接",
  "",
  "这是一个[测试链接](https://github.com/xuzhougeng/wx_markdown2html)的示例。",
  "",
  "更多内容请访问 [WxTyper](https://github.com/xuzhougeng/wx_markdown2html) 和 [GitHub](https://github.com)。",
].join("\n");

function App() {
  const [markdown, setMarkdown] = useState(DEFAULT_MARKDOWN);
  const [currentTheme, setCurrentTheme] = useState<string>("Default (Green)");
  const [customTheme, setCustomTheme] = useState<CustomTheme | null>(null);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [activePage, setActivePage] = useState<"editor" | "settings">("editor");
  const [sitePrefix, setSitePrefix] = usePersistentState("sitePrefix", "");
  const [imagePrefix, setImagePrefix] = usePersistentState("imagePrefix", "");
  const [assetsDir, setAssetsDir] = usePersistentState("assetsDir", "assets");
  const [openaiUrl, setOpenaiUrl] = usePersistentState("openaiUrl", "");
  const [openaiToken, setOpenaiToken] = usePersistentState("openaiToken", "");
  const [openaiModel, setOpenaiModel] = usePersistentState("openaiModel", "");
  const [wechatAppId, setWechatAppId] = usePersistentState("wechatAppId", "");
  const [wechatAppSecret, setWechatAppSecret] = usePersistentState("wechatAppSecret", "");
  const [geminiApiKey, setGeminiApiKey] = usePersistentState("geminiApiKey", "");
  const [geminiApiUrl, setGeminiApiUrl] = usePersistentState("geminiApiUrl", "");
  const [geminiModel, setGeminiModel] = usePersistentState("geminiModel", "");
  const [customImagePrompt, setCustomImagePrompt] = usePersistentState("customImagePrompt", "");
  const [isUploadingWechatImages, setIsUploadingWechatImages] = useState(false);
  const [isGeneratingCoverImage, setIsGeneratingCoverImage] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [openaiTestStatus, setOpenaiTestStatus] = useState("");
  const [wechatTestStatus, setWechatTestStatus] = useState("");
  const [isTestingOpenai, setIsTestingOpenai] = useState(false);
  const [isTestingWechat, setIsTestingWechat] = useState(false);
  const [settingsSaveStatus, setSettingsSaveStatus] = useState("");
  const previewRef = useRef<HTMLIFrameElement>(null);

  const rawHtml = useMarkdownConverter(markdown, currentTheme, customTheme);
  const html = useProcessedHtml(rawHtml, imagePrefix, currentFilePath, assetsDir);

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
      const data = [
        new ClipboardItem({
          "text/html": blob,
          "text/plain": textBlob,
        }),
      ];
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
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
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
          filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
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

      const lastSepIndex = Math.max(currentFilePath.lastIndexOf("\\"), currentFilePath.lastIndexOf("/"));
      const dir = lastSepIndex >= 0 ? currentFilePath.slice(0, lastSepIndex) : "";
      const sep = currentFilePath.includes("\\") ? "\\" : "/";

      const targetDir = dir ? `${dir}${sep}${assetsDir}` : assetsDir;
      try {
        await invoke("create_directory", { path: targetDir });
      } catch (e) {
        console.log(`${assetsDir} 目录可能已存在:`, e);
      }

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
        const svg = await renderMermaidSvg(code, id);
        const pngBytes = await svgToPngBytes(svg);

        const timestamp = Date.now();
        const fileName = mermaidBlocks.length === 1 ? `${timestamp}.png` : `${timestamp}-${blockIndex + 1}.png`;
        const fullPath = `${targetDir}${sep}${fileName}`;

        await invoke("save_binary_file", { path: fullPath, bytes: Array.from(pngBytes) });

        const imageMarkdown = `![Mermaid 图](${assetsDir}/${fileName})`;
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

  const handleUploadImagesToWechat = async () => {
    try {
      const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__;
      if (!isTauri) {
        alert("上传公众号图片仅在 Tauri 应用中可用。");
        return;
      }

      if (!wechatAppId || !wechatAppSecret) {
        alert("请先在设置页配置微信公众号 APPID 和 APPSECRET。");
        setActivePage("settings");
        return;
      }

      if (markdown.includes("```mermaid")) {
        alert(
          "检测到 Mermaid 代码块，请先使用工具栏的“导出 Mermaid 图片”按钮，将 Mermaid 图保存为 PNG 并替换为图片后，再上传到公众号。",
        );
        return;
      }

      setIsUploadingWechatImages(true);

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
        alert("图片已上传到公众号并替换链接。");
      } else {
        alert("上传完成，但返回结果异常。");
      }
    } catch (e) {
      console.error("Upload images to WeChat failed", e);
      alert("上传公众号图片失败");
    } finally {
      setIsUploadingWechatImages(false);
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
        appendDebugLog(`一键本地化图片失败：当前文件尚未保存，无法确定 ${assetsDir} 目录。`);
        return;
      }

      let baseDir: string | null = null;
      if (currentFilePath) {
        baseDir = currentFilePath.replace(/[\\/][^\\/]*$/, "");
      }

      appendDebugLog(`开始一键本地化图片：下载远程图片到 ${assetsDir} 并重写 Markdown 路径。`);

      const result = await invoke<string>("localize_images_to_assets", {
        markdown,
        baseDir,
        sitePrefix,
        assetsDir,
      });

      setMarkdown(result);
      appendDebugLog("一键本地化图片完成。");
      alert(`图片已本地化到 ${assetsDir} 目录并更新 Markdown 路径。`);
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
      const effectiveOpenaiUrl = openaiUrl && openaiUrl.trim().length > 0 ? openaiUrl.trim() : "<默认 https://api.deepseek.com/v1>";
      appendDebugLog(`开始请求 AI 摘要，使用 OpenAI URL=${effectiveOpenaiUrl}, Model=${openaiModel || "<默认 deepseek-chat>"}。`);
      const result = await invoke<string>("generate_summary", {
        markdown,
        apiBaseUrl: openaiUrl.trim() || undefined,
        apiToken: openaiToken.trim() || undefined,
        apiModel: openaiModel.trim() || undefined,
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

      const trimmedToken = openaiToken.trim();
      appendDebugLog(
        `[DEBUG] openaiToken state 值: length=${openaiToken.length}, trimmed length=${trimmedToken.length}, first 10 chars="${openaiToken.substring(0, 10)}"`,
      );

      if (!trimmedToken) {
        alert("请先在设置页填写 OpenAI Token。");
        appendDebugLog("测试 OpenAI 接口失败：Token 为空或仅包含空白字符。");
        return;
      }

      setIsTestingOpenai(true);
      const effectiveOpenaiUrl = openaiUrl && openaiUrl.trim().length > 0 ? openaiUrl.trim() : "<默认 https://api.deepseek.com/v1>";
      setOpenaiTestStatus("正在测试 OpenAI 接口...");
      appendDebugLog(`开始测试 OpenAI 接口配置，使用 URL=${effectiveOpenaiUrl}, Model=${openaiModel || "<默认 deepseek-chat>"}。`);
      const apiBaseUrl = openaiUrl.trim() || undefined;
      const apiModel = openaiModel.trim() || undefined;

      appendDebugLog(`[DEBUG] invoke 参数: apiBaseUrl=${apiBaseUrl}, apiToken=<length=${trimmedToken.length}>, apiModel=${apiModel}`);

      const result = await invoke<string>("test_openai_config", {
        apiBaseUrl,
        apiToken: trimmedToken,
        apiModel,
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

  const handleGenerateCoverImage = async () => {
    try {
      const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__;
      if (!isTauri) {
        alert("生成题图仅在 Tauri 应用中可用。");
        appendDebugLog("生成题图失败：当前不在 Tauri 环境中。");
        return;
      }

      if (!geminiApiKey || geminiApiKey.trim().length === 0) {
        alert("请先在设置页配置 Gemini API Key。");
        setActivePage("settings");
        return;
      }

      if (!currentFilePath) {
        alert("请先保存 Markdown 文件，再生成题图。");
        appendDebugLog("生成题图失败：当前文件尚未保存，无法确定图片保存目录。");
        return;
      }

      setIsGeneratingCoverImage(true);
      const effectiveUrl = geminiApiUrl && geminiApiUrl.trim().length > 0
        ? geminiApiUrl.trim()
        : "https://generativelanguage.googleapis.com/v1beta/models";
      const effectiveModel = geminiModel && geminiModel.trim().length > 0
        ? geminiModel.trim()
        : "imagen-3.0-generate-001";
      appendDebugLog(`开始使用 Gemini API 生成微信公众号题图...`);
      appendDebugLog(`API端点: ${effectiveUrl}, 模型: ${effectiveModel}`);

      let baseDir: string | null = null;
      if (currentFilePath) {
        baseDir = currentFilePath.replace(/[\\/][^\\/]*$/, "");
      }

      const relativePath = await invoke<string>("generate_cover_image", {
        markdown,
        geminiApiKey: geminiApiKey.trim(),
        geminiApiUrl: geminiApiUrl.trim() || undefined,
        geminiModel: geminiModel.trim() || undefined,
        customPrompt: customImagePrompt.trim() || undefined,
        baseDir,
        assetsDir,
      });

      // 在markdown开头插入图片
      const imageMarkdown = `![封面图](${relativePath})\n\n`;
      const newMarkdown = imageMarkdown + markdown;
      setMarkdown(newMarkdown);

      appendDebugLog(`题图生成成功，已保存到 ${relativePath}`);
      alert(`题图已生成并插入到文档开头！\n保存位置：${relativePath}`);
    } catch (e) {
      console.error("Generate cover image failed", e);
      appendDebugLog("生成题图失败: " + String(e));
      alert("生成题图失败: " + String(e));
    } finally {
      setIsGeneratingCoverImage(false);
    }
  };

  const toggleSettings = () => {
    setActivePage((prev) => (prev === "settings" ? "editor" : "settings"));
  };

  return (
    <div id="root">
      <Toolbar
        currentTheme={currentTheme}
        setCurrentTheme={setCurrentTheme}
        customTheme={customTheme}
        setCustomTheme={(theme) => setCustomTheme(theme)}
        imagePrefix={imagePrefix}
        setImagePrefix={setImagePrefix}
        handleOpenMarkdown={handleOpenMarkdown}
        handleSaveMarkdown={handleSaveMarkdown}
        handleGenerateSummary={handleGenerateSummary}
        handleGenerateCoverImage={handleGenerateCoverImage}
        handleLocalizeImages={handleLocalizeImages}
        handleExportMermaidToPng={handleExportMermaidToPng}
        handleUploadImagesToWechat={handleUploadImagesToWechat}
        copyToClipboard={copyToClipboard}
        toggleSettings={toggleSettings}
        isSummarizing={isSummarizing}
        isGeneratingCoverImage={isGeneratingCoverImage}
        isUploadingWechatImages={isUploadingWechatImages}
        activePage={activePage}
      />
      {activePage === "editor" ? (
        <div className="workspace">
          <EditorPane
            markdown={markdown}
            setMarkdown={setMarkdown}
            summary={summary}
            isSummarizing={isSummarizing}
            currentFilePath={currentFilePath}
          />
          <PreviewPane html={html} previewRef={previewRef} />
        </div>
      ) : (
        <SettingsPane
          sitePrefix={sitePrefix}
          setSitePrefix={setSitePrefix}
          assetsDir={assetsDir}
          setAssetsDir={setAssetsDir}
          openaiUrl={openaiUrl}
          setOpenaiUrl={setOpenaiUrl}
          openaiToken={openaiToken}
          setOpenaiToken={setOpenaiToken}
          openaiModel={openaiModel}
          setOpenaiModel={setOpenaiModel}
          wechatAppId={wechatAppId}
          setWechatAppId={setWechatAppId}
          wechatAppSecret={wechatAppSecret}
          setWechatAppSecret={setWechatAppSecret}
          geminiApiKey={geminiApiKey}
          setGeminiApiKey={setGeminiApiKey}
          geminiApiUrl={geminiApiUrl}
          setGeminiApiUrl={setGeminiApiUrl}
          geminiModel={geminiModel}
          setGeminiModel={setGeminiModel}
          customImagePrompt={customImagePrompt}
          setCustomImagePrompt={setCustomImagePrompt}
          handleTestOpenai={handleTestOpenai}
          handleTestWechat={handleTestWechat}
          isTestingOpenai={isTestingOpenai}
          isTestingWechat={isTestingWechat}
          openaiTestStatus={openaiTestStatus}
          wechatTestStatus={wechatTestStatus}
          settingsSaveStatus={settingsSaveStatus}
          handleSettingsSave={handleSettingsSave}
          debugLogs={debugLogs}
        />
      )}
    </div>
  );
}

export default App;
