import { useEffect, useState } from "react";
import { applyImagePrefix, convertLocalImagePaths } from "../utils/images";

export function useProcessedHtml(
  rawHtml: string,
  imagePrefix: string,
  currentFilePath: string | null,
  assetsDir: string,
) {
  const [html, setHtml] = useState<string>("");

  useEffect(() => {
    let processedHtml = rawHtml;
    if (currentFilePath) {
      const baseDir = currentFilePath.replace(/[^\\/]*$/, "");
      processedHtml = convertLocalImagePaths(rawHtml, baseDir, assetsDir);
    }
    setHtml(applyImagePrefix(processedHtml, imagePrefix, assetsDir));
  }, [rawHtml, imagePrefix, currentFilePath, assetsDir]);

  return html;
}
