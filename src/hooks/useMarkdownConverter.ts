import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { builtinThemes, BuiltinThemeName } from "../constants/themes";

export interface CustomTheme {
  name: string;
  css: string;
}

export function useMarkdownConverter(
  markdown: string,
  currentTheme: string,
  customTheme: CustomTheme | null,
) {
  const [rawHtml, setRawHtml] = useState<string>("");

  useEffect(() => {
    let mounted = true;
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
            css,
          });
          if (mounted) {
            setRawHtml(result);
          }
        } else if (mounted) {
          console.warn("Tauri API not available. Running in browser mode?");
          setRawHtml(
            `<div class="wechat-content"><p><strong>Preview not available in browser. Run via 'npm run tauri dev' to see full preview.</strong></p><pre>${markdown}</pre></div>`,
          );
        }
      } catch (e) {
        console.error("Conversion failed", e);
      }
    };

    convert();

    return () => {
      mounted = false;
    };
  }, [markdown, currentTheme, customTheme]);

  return rawHtml;
}
