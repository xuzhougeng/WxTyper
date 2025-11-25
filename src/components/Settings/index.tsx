import { Save } from "lucide-react";

interface SettingsPaneProps {
  sitePrefix: string;
  setSitePrefix: (value: string) => void;
  assetsDir: string;
  setAssetsDir: (value: string) => void;
  openaiUrl: string;
  setOpenaiUrl: (value: string) => void;
  openaiToken: string;
  setOpenaiToken: (value: string) => void;
  openaiModel: string;
  setOpenaiModel: (value: string) => void;
  wechatAppId: string;
  setWechatAppId: (value: string) => void;
  wechatAppSecret: string;
  setWechatAppSecret: (value: string) => void;
  geminiApiKey: string;
  setGeminiApiKey: (value: string) => void;
  geminiApiUrl: string;
  setGeminiApiUrl: (value: string) => void;
  geminiModel: string;
  setGeminiModel: (value: string) => void;
  customImagePrompt: string;
  setCustomImagePrompt: (value: string) => void;
  handleTestOpenai: () => void;
  handleTestWechat: () => void;
  isTestingOpenai: boolean;
  isTestingWechat: boolean;
  openaiTestStatus: string;
  wechatTestStatus: string;
  settingsSaveStatus: string;
  handleSettingsSave: () => void;
  debugLogs: string[];
}

export function SettingsPane({
  sitePrefix,
  setSitePrefix,
  assetsDir,
  setAssetsDir,
  openaiUrl,
  setOpenaiUrl,
  openaiToken,
  setOpenaiToken,
  openaiModel,
  setOpenaiModel,
  wechatAppId,
  setWechatAppId,
  wechatAppSecret,
  setWechatAppSecret,
  geminiApiKey,
  setGeminiApiKey,
  geminiApiUrl,
  setGeminiApiUrl,
  geminiModel,
  setGeminiModel,
  customImagePrompt,
  setCustomImagePrompt,
  handleTestOpenai,
  handleTestWechat,
  isTestingOpenai,
  isTestingWechat,
  openaiTestStatus,
  wechatTestStatus,
  settingsSaveStatus,
  handleSettingsSave,
  debugLogs,
}: SettingsPaneProps) {
  return (
    <div className="settings-pane">
      <div className="settings-toolbar">
        <div className="settings-toolbar-left">
          <span className="settings-label">自动保存</span>
          {settingsSaveStatus && <span className="settings-save-status">{settingsSaveStatus}</span>}
        </div>
        <button className="btn btn-primary" onClick={handleSettingsSave}>
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
        <div className="settings-field">
          <label className="settings-label">图片保存目录</label>
          <input
            className="input settings-input"
            type="text"
            value={assetsDir}
            onChange={(e) => setAssetsDir(e.target.value)}
            placeholder="默认：assets"
          />
          <div className="settings-field-hint">本地图片（Mermaid导出、图片本地化等）将保存到此目录</div>
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
          <button className="btn" onClick={handleTestOpenai} disabled={isTestingOpenai}>
            {isTestingOpenai ? "测试中..." : "测试 OpenAI 接口"}
          </button>
          {openaiTestStatus && <span className="settings-test-status">{openaiTestStatus}</span>}
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
          <button className="btn" onClick={handleTestWechat} disabled={isTestingWechat}>
            {isTestingWechat ? "测试中..." : "测试获取 access_token"}
          </button>
          {wechatTestStatus && <span className="settings-test-status">{wechatTestStatus}</span>}
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Google Gemini 图片生成配置</div>
        <div className="settings-field">
          <label className="settings-label">API 端点</label>
          <input
            className="input settings-input"
            type="text"
            value={geminiApiUrl}
            onChange={(e) => setGeminiApiUrl(e.target.value)}
            placeholder="默认：https://generativelanguage.googleapis.com/v1beta/models"
          />
          <div className="settings-field-hint">API 端点 URL（不包含模型名称），留空使用默认端点</div>
        </div>
        <div className="settings-field">
          <label className="settings-label">模型名称</label>
          <input
            className="input settings-input"
            type="text"
            value={geminiModel}
            onChange={(e) => setGeminiModel(e.target.value)}
            placeholder="默认：imagen-3.0-generate-001"
          />
          <div className="settings-field-hint">图片生成模型名称，例如：gemini-3-pro-image-preview</div>
        </div>
        <div className="settings-field">
          <label className="settings-label">API Key</label>
          <input
            className="input settings-input"
            type="password"
            value={geminiApiKey}
            onChange={(e) => setGeminiApiKey(e.target.value)}
            placeholder="Gemini API 密钥"
          />
          <div className="settings-field-hint">用于调用 Gemini API，获取方式：访问 Google AI Studio</div>
        </div>
        <div className="settings-field">
          <label className="settings-label">自定义图片生成提示词</label>
          <textarea
            className="input settings-input"
            value={customImagePrompt}
            onChange={(e) => setCustomImagePrompt(e.target.value)}
            placeholder="例如：Create a modern, minimalist cover image with vibrant colors..."
            rows={4}
          />
          <div className="settings-field-hint">自定义生成封面图的提示词，留空则根据文章标题自动生成</div>
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
                  <li key={index} className="debug-log-item">
                    {log}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
