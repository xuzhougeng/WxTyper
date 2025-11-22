import mermaid from "mermaid";

let mermaidInitialized = false;

export function ensureMermaidInitialized() {
  if (!mermaidInitialized) {
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
    mermaidInitialized = true;
  }
}

export async function inlineMermaid(htmlString: string) {
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

export function svgToPngBytes(svg: string): Promise<Uint8Array> {
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

export async function renderMermaidSvg(code: string, id: string) {
  ensureMermaidInitialized();
  const { svg } = await mermaid.render(id, code);
  return svg;
}
