import { RefObject } from "react";

interface PreviewPaneProps {
  html: string;
  previewRef: RefObject<HTMLIFrameElement | null>;
}

export function PreviewPane({ html, previewRef }: PreviewPaneProps) {
  return (
    <div className="preview-pane">
      <div className="preview-container">
        <iframe className="preview-iframe" srcDoc={html} title="Preview" ref={previewRef} />
      </div>
    </div>
  );
}
