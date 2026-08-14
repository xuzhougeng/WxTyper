import Foundation

enum ImageService {
    static func localizeImages(
        in markdown: String,
        documentURL: URL,
        sitePrefix: String,
        assetsDirectory: String
    ) async throws -> String {
        let references = markdownImageReferences(in: markdown)
        let assetsURL = documentURL.deletingLastPathComponent().appendingPathComponent(assetsDirectory, isDirectory: true)
        try FileManager.default.createDirectory(at: assetsURL, withIntermediateDirectories: true)
        var replacements: [String: String] = [:]

        for reference in references where replacements[reference] == nil {
            let normalizedAssets = assetsDirectory.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/"
            if reference.hasPrefix(normalizedAssets) || reference.hasPrefix("./" + normalizedAssets) {
                replacements[reference] = reference
                continue
            }

            let remoteURL: URL?
            if let direct = URL(string: reference), ["http", "https"].contains(direct.scheme?.lowercased() ?? "") {
                remoteURL = direct
            } else if !sitePrefix.trimmed.isEmpty {
                remoteURL = URL(string: sitePrefix.trimmed.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/" + reference.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
            } else {
                remoteURL = nil
            }
            guard let remoteURL else { continue }

            let (data, response) = try await URLSession.shared.data(from: remoteURL)
            if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                throw AppError.message("下载图片失败（HTTP \(http.statusCode)）：\(remoteURL.absoluteString)")
            }
            var filename = remoteURL.lastPathComponent.removingPercentEncoding ?? remoteURL.lastPathComponent
            if filename.isEmpty { filename = "image-\(Int(Date().timeIntervalSince1970)).png" }
            filename = safeFilename(filename)
            let target = uniqueURL(in: assetsURL, filename: filename)
            try data.write(to: target, options: .atomic)
            replacements[reference] = "\(assetsDirectory)/\(target.lastPathComponent)"
        }

        var result = markdown
        for (old, new) in replacements where old != new {
            result = result.replacingOccurrences(of: "](\(old))", with: "](\(new))")
        }
        return result
    }

    static func saveGeneratedImage(_ data: Data, documentURL: URL, assetsDirectory: String, prefix: String) throws -> String {
        let assetsURL = documentURL.deletingLastPathComponent().appendingPathComponent(assetsDirectory, isDirectory: true)
        try FileManager.default.createDirectory(at: assetsURL, withIntermediateDirectories: true)
        let timestamp = Int(Date().timeIntervalSince1970 * 1_000)
        let target = uniqueURL(in: assetsURL, filename: "\(prefix)-\(timestamp).png")
        try data.write(to: target, options: .atomic)
        return "\(assetsDirectory)/\(target.lastPathComponent)"
    }

    static func markdownImageReferences(in markdown: String) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: #"!\[[^\]]*\]\(([^\s\)]+)(?:\s+\".*?\")?\)"#) else { return [] }
        let ns = markdown as NSString
        return regex.matches(in: markdown, range: NSRange(location: 0, length: ns.length)).compactMap {
            let range = $0.range(at: 1)
            return range.location == NSNotFound ? nil : ns.substring(with: range)
        }
    }

    private static func safeFilename(_ value: String) -> String {
        let invalid = CharacterSet(charactersIn: "/\\:?%*|\"<>")
        let parts = value.components(separatedBy: invalid).filter { !$0.isEmpty }
        return parts.joined(separator: "-")
    }

    private static func uniqueURL(in directory: URL, filename: String) -> URL {
        var target = directory.appendingPathComponent(filename)
        guard FileManager.default.fileExists(atPath: target.path) else { return target }
        let stem = target.deletingPathExtension().lastPathComponent
        let ext = target.pathExtension
        var index = 2
        while FileManager.default.fileExists(atPath: target.path) {
            let next = "\(stem)-\(index)" + (ext.isEmpty ? "" : ".\(ext)")
            target = directory.appendingPathComponent(next)
            index += 1
        }
        return target
    }
}
