import { FileText, Save, Palette, Image as IconImage, Sparkles, ImagePlus, FolderDown, Download, Share, Copy, Settings } from "lucide-react";
import { builtinThemes } from "../constants/themes";
import type { CustomTheme } from "../hooks/useMarkdownConverter";

interface ToolbarProps {
  currentTheme: string;
  setCurrentTheme: (value: string) => void;
  customTheme: CustomTheme | null;
  setCustomTheme: (theme: CustomTheme) => void;
  imagePrefix: string;
  setImagePrefix: (value: string) => void;
  handleOpenMarkdown: () => void;
  handleSaveMarkdown: () => void;
  handleGenerateSummary: () => void;
  handleGenerateCoverImage: () => void;
  handleLocalizeImages: () => void;
  handleExportMermaidToPng: () => void;
  handleUploadImagesToWechat: () => void;
  copyToClipboard: () => void;
  toggleSettings: () => void;
  isSummarizing: boolean;
  isGeneratingCoverImage: boolean;
  isUploadingWechatImages: boolean;
  activePage: "editor" | "settings";
}

export function Toolbar({
  currentTheme,
  setCurrentTheme,
  customTheme,
  setCustomTheme,
  imagePrefix,
  setImagePrefix,
  handleOpenMarkdown,
  handleSaveMarkdown,
  handleGenerateSummary,
  handleGenerateCoverImage,
  handleLocalizeImages,
  handleExportMermaidToPng,
  handleUploadImagesToWechat,
  copyToClipboard,
  toggleSettings,
  isSummarizing,
  isGeneratingCoverImage,
  isUploadingWechatImages,
  activePage,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <div className="app-title">
          <FileText size={20} color="var(--primary)" />
          <span className="app-name">WxTyper</span>
        </div>
        <div className="divider-vertical"></div>
        <button className="btn btn-icon" onClick={handleOpenMarkdown} title="Open Markdown">
          <FileText size={18} />
        </button>
        <button className="btn btn-icon" onClick={handleSaveMarkdown} title="Save Markdown">
          <Save size={18} />
        </button>
      </div>

      <div className="toolbar-center">
        <div className="input-group">
          <select
            className="select"
            value={currentTheme}
            onChange={(e) => setCurrentTheme(e.target.value)}
            title="Select Theme"
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

        <div className="file-input-wrapper btn btn-icon" title="Import CSS Theme">
          <Palette size={18} />
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

        <div className="input-group compact-input">
          <IconImage size={16} color="var(--text-secondary)" />
          <input
            className="input"
            type="text"
            value={imagePrefix}
            onChange={(e) => {
              const value = e.target.value;
              setImagePrefix(value);
            }}
            placeholder="CDN Prefix"
          />
        </div>
      </div>

      <div className="toolbar-right">
        <button
          className="btn btn-icon"
          onClick={handleGenerateSummary}
          disabled={isSummarizing}
          title="Generate AI Summary"
        >
          <Sparkles size={18} color={isSummarizing ? "var(--primary)" : "currentColor"} />
        </button>

        <button
          className="btn btn-icon"
          onClick={handleGenerateCoverImage}
          disabled={isGeneratingCoverImage}
          title="生成微信公众号题图（使用 Gemini AI）"
        >
          <ImagePlus size={18} color={isGeneratingCoverImage ? "var(--primary)" : "currentColor"} />
        </button>

        <div className="divider-vertical"></div>

        <button
          className="btn btn-icon"
          onClick={handleLocalizeImages}
          title="下载远程图片到 assets 并重写 Markdown 路径"
        >
          <FolderDown size={18} />
        </button>

        <button
          className="btn btn-icon"
          onClick={handleExportMermaidToPng}
          title="将文中的 Mermaid 图导出为 PNG 图片"
        >
          <Download size={18} />
        </button>

        <button
          className="btn btn-icon"
          onClick={handleUploadImagesToWechat}
          disabled={isUploadingWechatImages}
          title="Upload images to WeChat and replace URLs"
        >
          <Share size={18} />
        </button>

        <div className="divider-vertical"></div>

        <button className="btn btn-primary btn-icon" onClick={copyToClipboard} title="Copy HTML">
          <Copy size={18} />
        </button>

        <button
          className={`btn btn-icon ${activePage === "settings" ? "active" : ""}`}
          onClick={toggleSettings}
          title="Settings"
        >
          <Settings size={18} />
        </button>
      </div>
    </div>
  );
}
