interface EditorPaneProps {
  markdown: string;
  setMarkdown: (value: string) => void;
  summary: string;
  isSummarizing: boolean;
  currentFilePath: string | null;
}

export function EditorPane({
  markdown,
  setMarkdown,
  summary,
  isSummarizing,
  currentFilePath,
}: EditorPaneProps) {
  return (
    <div className="editor-pane">
      <div className="editor-header">
        <span>Markdown Editor</span>
        <span>{currentFilePath ? currentFilePath.split(/[\\/]/).pop() : "Untitled"}</span>
      </div>
      <div className="summary-panel">
        <div className="summary-title">AI 摘要（≤100字）</div>
        <div className="summary-body">
          {isSummarizing ? "正在生成摘要..." : summary || "暂无摘要，点击上方“AI 摘要”按钮生成。"}
        </div>
      </div>
      <textarea
        value={markdown}
        onChange={(e) => setMarkdown(e.target.value)}
        placeholder="Type Markdown here..."
      />
    </div>
  );
}
