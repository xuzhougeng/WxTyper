import { convertFileSrc } from "@tauri-apps/api/core";

export function convertLocalImagePaths(html: string, baseDir: string | null, assetsDir: string): string {
  if (!baseDir) return html;

  const normalizedBaseDir = baseDir.replace(/[\\/]+$/, "");
  const sep = normalizedBaseDir.includes("\\") ? "\\" : "/";
  const assetsDirPattern = assetsDir.replace(/[\\/]+$/, "");

  return html.replace(/(<img\b[^>]*\bsrc=)(["'])([^"']+?)\2/gi, (match, before, quote, url) => {
    const trimmedUrl = url.trim();

    if (/^(https?:|data:|\/\/|tauri:)/i.test(trimmedUrl)) {
      return match;
    }

    if (trimmedUrl.startsWith(`${assetsDirPattern}/`) || trimmedUrl.startsWith(`./${assetsDirPattern}/`)) {
      const cleanUrl = trimmedUrl.replace(/^\.\//, "");
      const fullPath = `${normalizedBaseDir}${sep}${cleanUrl.replace(/\//g, sep)}`;
      const tauriUrl = convertFileSrc(fullPath);
      return `${before}${quote}${tauriUrl}${quote}`;
    }

    return match;
  });
}

export function applyImagePrefix(html: string, prefix: string, assetsDir: string): string {
  const effectivePrefix = prefix.trim();
  if (!effectivePrefix) return html;
  const trimmedPrefix = effectivePrefix.replace(/\/+$/, "");
  const assetsDirPattern = assetsDir.replace(/[\\/]+$/, "");

  return html.replace(/(<img\b[^>]*\bsrc=)(["'])([^"']+?)\2/gi, (match, before, quote, url) => {
    const trimmedUrl = url.trim();

    if (/^(https?:|data:|\/\/|tauri:)/i.test(trimmedUrl)) {
      return match;
    }

    if (trimmedUrl.startsWith(`${assetsDirPattern}/`) || trimmedUrl.startsWith(`./${assetsDirPattern}/`)) {
      return match;
    }

    const newUrl = trimmedUrl.startsWith("/")
      ? `${trimmedPrefix}${trimmedUrl}`
      : `${trimmedPrefix}/${trimmedUrl}`;

    return `${before}${quote}${newUrl}${quote}`;
  });
}
