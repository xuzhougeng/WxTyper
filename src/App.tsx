import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
// @ts-ignore
import defaultTheme from "./themes/default.css?inline";
// @ts-ignore
import lapisTheme from "./themes/lapis.css?inline";
// @ts-ignore
import sakuraTheme from "./themes/sakura.css?inline";

const themes = {
  "Default (Green)": defaultTheme,
  "Lapis (Blue)": lapisTheme,
  "Sakura (Pink)": sakuraTheme,
};

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
  const [markdown, setMarkdown] = useState("# Hello WeChat\n\nWrite your markdown here.");
  const [rawHtml, setRawHtml] = useState("");
  const [html, setHtml] = useState("");
  const [currentTheme, setCurrentTheme] = useState("Default (Green)");
  const [imagePrefix, setImagePrefix] = useState("");

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
          const result = await invoke<string>("convert_markdown", {
            content: markdown,
            css: themes[currentTheme as keyof typeof themes]
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
  }, [markdown, currentTheme]);

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
          {Object.keys(themes).map((themeName) => (
            <option key={themeName} value={themeName}>
              {themeName}
            </option>
          ))}
        </select>
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
