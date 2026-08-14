import Foundation

struct MarkdownRenderOptions {
    var css: String
    var imagePrefix: String
    var assetsDirectory: String
    var baseURL: URL?
}

enum MarkdownRenderer {
    static func render(_ markdown: String, options: MarkdownRenderOptions) -> String {
        let normalized = markdown.replacingOccurrences(of: "\r\n", with: "\n")
        let lines = normalized.components(separatedBy: "\n")
        var html: [String] = []
        var footnotes: [String] = []
        var index = 0

        while index < lines.count {
            let line = lines[index]
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            if trimmed.isEmpty {
                index += 1
                continue
            }

            if trimmed.hasPrefix("```") {
                let language = String(trimmed.dropFirst(3)).trimmingCharacters(in: .whitespaces)
                index += 1
                var code: [String] = []
                while index < lines.count, !lines[index].trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                    code.append(lines[index])
                    index += 1
                }
                if index < lines.count { index += 1 }
                let escaped = escapeHTML(code.joined(separator: "\n"))
                if language.lowercased() == "mermaid" {
                    html.append("<div class=\"mermaid\">\(escaped)</div>")
                } else {
                    let className = language.isEmpty ? "" : " class=\"language-\(escapeAttribute(language))\""
                    html.append("<pre><code\(className)>\(escaped)</code></pre>")
                }
                continue
            }

            if let heading = heading(from: trimmed) {
                html.append("<h\(heading.level)>\(inline(heading.text, options: options, footnotes: &footnotes))</h\(heading.level)>")
                index += 1
                continue
            }

            if isHorizontalRule(trimmed) {
                html.append("<hr>")
                index += 1
                continue
            }

            if index + 1 < lines.count, isTableSeparator(lines[index + 1]), line.contains("|") {
                let headers = tableCells(line)
                index += 2
                var rows: [[String]] = []
                while index < lines.count {
                    let row = lines[index].trimmingCharacters(in: .whitespaces)
                    guard !row.isEmpty, row.contains("|") else { break }
                    rows.append(tableCells(row))
                    index += 1
                }
                var table = "<table><thead><tr>"
                for cell in headers { table += "<th>\(inline(cell, options: options, footnotes: &footnotes))</th>" }
                table += "</tr></thead><tbody>"
                for row in rows {
                    table += "<tr>"
                    for cellIndex in headers.indices {
                        let cell = cellIndex < row.count ? row[cellIndex] : ""
                        table += "<td>\(inline(cell, options: options, footnotes: &footnotes))</td>"
                    }
                    table += "</tr>"
                }
                table += "</tbody></table>"
                html.append(table)
                continue
            }

            if unorderedItem(trimmed) != nil || orderedItem(trimmed) != nil {
                let ordered = orderedItem(trimmed) != nil
                let tag = ordered ? "ol" : "ul"
                var list = "<\(tag)>"
                while index < lines.count {
                    let candidate = lines[index].trimmingCharacters(in: .whitespaces)
                    let value = ordered ? orderedItem(candidate) : unorderedItem(candidate)
                    guard let value else { break }
                    let taskValue: String
                    if value.hasPrefix("[ ] ") {
                        taskValue = "<input type=\"checkbox\" disabled> " + String(value.dropFirst(4))
                    } else if value.lowercased().hasPrefix("[x] ") {
                        taskValue = "<input type=\"checkbox\" checked disabled> " + String(value.dropFirst(4))
                    } else {
                        taskValue = value
                    }
                    list += "<li>\(inline(taskValue, options: options, footnotes: &footnotes, preservesInputs: true))</li>"
                    index += 1
                }
                list += "</\(tag)>"
                html.append(list)
                continue
            }

            if trimmed.hasPrefix(">") {
                var quoteLines: [String] = []
                while index < lines.count {
                    let candidate = lines[index].trimmingCharacters(in: .whitespaces)
                    guard candidate.hasPrefix(">") else { break }
                    quoteLines.append(String(candidate.dropFirst()).trimmingCharacters(in: .whitespaces))
                    index += 1
                }
                let body = quoteLines.map { inline($0, options: options, footnotes: &footnotes) }.joined(separator: "<br>")
                html.append("<blockquote><p>\(body)</p></blockquote>")
                continue
            }

            var paragraph: [String] = [trimmed]
            index += 1
            while index < lines.count {
                let next = lines[index].trimmingCharacters(in: .whitespaces)
                if next.isEmpty || isBlockStart(next) || (index + 1 < lines.count && isTableSeparator(lines[index + 1]) && next.contains("|")) {
                    break
                }
                paragraph.append(next)
                index += 1
            }
            html.append("<p>\(inline(paragraph.joined(separator: " "), options: options, footnotes: &footnotes))</p>")
        }

        if !footnotes.isEmpty {
            html.append("<div class=\"footnotes\"><ol>" + footnotes.map { "<li><span class=\"footnote-url\">\(escapeHTML($0))</span></li>" }.joined() + "</ol></div>")
        }

        let mermaidScript = html.contains(where: { $0.contains("class=\"mermaid\"") }) ? mermaidSupportScript : ""
        return """
        <!doctype html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>\(fallbackCSS)\n\(options.css)</style>
          <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
        </head>
        <body><div class="wechat-content">\(html.joined(separator: "\n"))</div>\(mermaidScript)</body>
        </html>
        """
    }

    private static func inline(
        _ source: String,
        options: MarkdownRenderOptions,
        footnotes: inout [String],
        preservesInputs: Bool = false
    ) -> String {
        var text = escapeHTML(source)
        var protected: [String] = []

        func protect(_ value: String) -> String {
            let token = "@@WXPROTECTED\(protected.count)@@"
            protected.append(value)
            return token
        }

        text = replacing(#"`([^`]+)`"#, in: text) { match in
            protect("<code>\(match[1])</code>")
        }
        text = replacing(#"!\[([^\]]*)\]\(([^\s\)]+)(?:\s+&quot;.*?&quot;)?\)"#, in: text) { match in
            let alt = match[1]
            let rawURL = decodeHTMLEntities(match[2])
            let url = processedImageURL(rawURL, options: options)
            return protect("<img src=\"\(escapeAttribute(url))\" alt=\"\(escapeAttribute(decodeHTMLEntities(alt)))\">")
        }
        text = replacingLinks(in: text, footnotes: &footnotes)
        text = replacing(#"\*\*(.+?)\*\*|__(.+?)__"#, in: text) { match in
            "<strong>\(match[1].isEmpty ? match[2] : match[1])</strong>"
        }
        text = replacing(#"~~(.+?)~~"#, in: text) { "<del>\($0[1])</del>" }
        text = replacing(#"(?<!\*)\*([^*]+)\*(?!\*)|(?<!_)_([^_]+)_(?!_)"#, in: text) { match in
            "<em>\(match[1].isEmpty ? match[2] : match[1])</em>"
        }
        text = text.replacingOccurrences(of: "  ", with: "<br>")
        if preservesInputs {
            text = text.replacingOccurrences(of: "&lt;input type=&quot;checkbox&quot; disabled&gt;", with: "<input type=\"checkbox\" disabled>")
            text = text.replacingOccurrences(of: "&lt;input type=&quot;checkbox&quot; checked disabled&gt;", with: "<input type=\"checkbox\" checked disabled>")
        }
        for (index, value) in protected.enumerated() {
            text = text.replacingOccurrences(of: "@@WXPROTECTED\(index)@@", with: value)
        }
        return text
    }

    private static func replacing(_ pattern: String, in source: String, transform: ([String]) -> String) -> String {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators]) else { return source }
        let nsSource = source as NSString
        let matches = regex.matches(in: source, range: NSRange(location: 0, length: nsSource.length))
        var result = source
        for match in matches.reversed() {
            var captures: [String] = []
            for captureIndex in 0..<match.numberOfRanges {
                let range = match.range(at: captureIndex)
                captures.append(range.location == NSNotFound ? "" : nsSource.substring(with: range))
            }
            let swiftRange = Range(match.range, in: result)!
            result.replaceSubrange(swiftRange, with: transform(captures))
        }
        return result
    }

    private static func replacingLinks(in source: String, footnotes: inout [String]) -> String {
        let pattern = #"\[([^\]]+)\]\(([^\s\)]+)(?:\s+&quot;.*?&quot;)?\)"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return source }
        let nsSource = source as NSString
        let matches = regex.matches(in: source, range: NSRange(location: 0, length: nsSource.length))
        var replacements: [(NSRange, String)] = []
        for match in matches {
            let label = nsSource.substring(with: match.range(at: 1))
            let url = decodeHTMLEntities(nsSource.substring(with: match.range(at: 2)))
            footnotes.append(url)
            replacements.append((match.range, "\(label) <span class=\"footnote-ref\">\(footnotes.count)</span>"))
        }
        var result = source as NSString
        for replacement in replacements.reversed() {
            result = result.replacingCharacters(in: replacement.0, with: replacement.1) as NSString
        }
        return result as String
    }

    private static func heading(from line: String) -> (level: Int, text: String)? {
        let hashes = line.prefix(while: { $0 == "#" }).count
        guard (1...6).contains(hashes), line.dropFirst(hashes).first == " " else { return nil }
        return (hashes, String(line.dropFirst(hashes + 1)))
    }

    private static func unorderedItem(_ line: String) -> String? {
        for marker in ["- ", "* ", "+ "] where line.hasPrefix(marker) { return String(line.dropFirst(2)) }
        return nil
    }

    private static func orderedItem(_ line: String) -> String? {
        guard let match = line.range(of: #"^\d+\.\s+"#, options: .regularExpression) else { return nil }
        return String(line[match.upperBound...])
    }

    private static func isHorizontalRule(_ line: String) -> Bool {
        line.range(of: #"^\s*((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$"#, options: .regularExpression) != nil
    }

    private static func isBlockStart(_ line: String) -> Bool {
        line.hasPrefix("```") || heading(from: line) != nil || line.hasPrefix(">") ||
            unorderedItem(line) != nil || orderedItem(line) != nil || isHorizontalRule(line)
    }

    private static func isTableSeparator(_ line: String) -> Bool {
        line.trimmingCharacters(in: .whitespaces).range(of: #"^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$"#, options: .regularExpression) != nil
    }

    private static func tableCells(_ line: String) -> [String] {
        var value = line.trimmingCharacters(in: .whitespaces)
        if value.hasPrefix("|") { value.removeFirst() }
        if value.hasSuffix("|") { value.removeLast() }
        return value.split(separator: "|", omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) }
    }

    private static func processedImageURL(_ value: String, options: MarkdownRenderOptions) -> String {
        let lower = value.lowercased()
        if lower.hasPrefix("http://") || lower.hasPrefix("https://") || lower.hasPrefix("data:") || lower.hasPrefix("file:") { return value }
        let assets = options.assetsDirectory.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let clean = value.hasPrefix("./") ? String(value.dropFirst(2)) : value
        if clean.hasPrefix(assets + "/") { return clean }
        let prefix = options.imagePrefix.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !prefix.isEmpty else { return value }
        return prefix + "/" + value.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    private static func escapeHTML(_ value: String) -> String {
        value.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }

    private static func escapeAttribute(_ value: String) -> String { escapeHTML(value) }

    private static func decodeHTMLEntities(_ value: String) -> String {
        value.replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
    }

    private static let fallbackCSS = """
    :root { color-scheme: light; }
    html { background: #f3f4f6; }
    body { margin: 0; padding: 28px; }
    .wechat-content { box-sizing: border-box; max-width: 680px; min-height: calc(100vh - 56px); margin: 0 auto; padding: 28px 34px; background: white; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; font-size: 16px; line-height: 1.7; color: #333; overflow-wrap: anywhere; }
    img { max-width: 100%; height: auto; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; }
    .mermaid { text-align: center; margin: 20px 0; }
    .footnote-ref { vertical-align: super; font-size: .8em; }
    """

    private static let mermaidSupportScript = """
    <script>
    window.__wxtyperMermaidReady = (async () => {
      if (!window.mermaid) return;
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
      await mermaid.run({ nodes: document.querySelectorAll('.mermaid') });
    })();
    window.wxtyperExportMermaid = async function() {
      await window.__wxtyperMermaidReady;
      const svgs = Array.from(document.querySelectorAll('.mermaid svg'));
      return await Promise.all(svgs.map(svg => new Promise((resolve, reject) => {
        const clone = svg.cloneNode(true);
        const box = svg.getBoundingClientRect();
        clone.setAttribute('width', Math.max(1, Math.ceil(box.width)));
        clone.setAttribute('height', Math.max(1, Math.ceil(box.height)));
        const xml = new XMLSerializer().serializeToString(clone);
        const blob = new Blob([xml], {type: 'image/svg+xml;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = () => {
          const scale = 2;
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.ceil(box.width * scale));
          canvas.height = Math.max(1, Math.ceil(box.height * scale));
          const ctx = canvas.getContext('2d');
          ctx.scale(scale, scale);
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, box.width, box.height);
          ctx.drawImage(image, 0, 0, box.width, box.height);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/png').split(',')[1]);
        };
        image.onerror = reject;
        image.src = url;
      })));
    };
    window.wxtyperCopyHTML = async function() {
      if (window.__wxtyperMermaidReady) await window.__wxtyperMermaidReady;
      const clone = document.querySelector('.wechat-content').cloneNode(true);
      const original = document.querySelectorAll('.wechat-content, .wechat-content *');
      const copied = clone.querySelectorAll('*');
      const apply = (from, to) => {
        const style = getComputedStyle(from);
        to.setAttribute('style', Array.from(style).map(name => `${name}:${style.getPropertyValue(name)};`).join(''));
      };
      apply(original[0], clone);
      copied.forEach((node, i) => apply(original[i + 1], node));
      return '<!doctype html><html><head><meta charset="utf-8"></head><body>' + clone.outerHTML + '</body></html>';
    };
    </script>
    """
}
