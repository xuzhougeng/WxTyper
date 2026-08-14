import Foundation

actor WeChatService {
    private var tokenCache: (token: String, expiresAt: Date)?

    func test(appID: String, appSecret: String) async throws -> String {
        let token = try await accessToken(appID: appID, appSecret: appSecret)
        let short = token.count > 12 ? "\(token.prefix(6))…\(token.suffix(4))" : token
        return "access_token 获取成功：\(short)"
    }

    func uploadAndReplace(
        markdown: String,
        appID: String,
        appSecret: String,
        documentURL: URL?,
        sitePrefix: String
    ) async throws -> String {
        let token = try await accessToken(appID: appID, appSecret: appSecret)
        let references = Array(Set(ImageService.markdownImageReferences(in: markdown)))
        if references.isEmpty { return markdown }
        var cached = loadLog(documentURL: documentURL)
        var newEntries: [MediaLogEntry] = []

        for reference in references where cached[reference] == nil {
            let (data, filename) = try await imageData(reference: reference, documentURL: documentURL, sitePrefix: sitePrefix)
            let response = try await upload(data: data, filename: filename, token: token)
            let entry = MediaLogEntry(originalURL: reference, weChatURL: response.url, mediaID: response.mediaID)
            cached[reference] = entry
            newEntries.append(entry)
        }
        try appendLog(newEntries, documentURL: documentURL)

        var result = markdown
        for (original, entry) in cached where references.contains(original) {
            result = result.replacingOccurrences(of: original, with: entry.weChatURL)
        }
        return result
    }

    private func accessToken(appID: String, appSecret: String) async throws -> String {
        guard !appID.trimmed.isEmpty, !appSecret.trimmed.isEmpty else {
            throw AppError.message("请先填写微信公众号 APPID 和 APPSECRET。")
        }
        if let cache = tokenCache, cache.expiresAt > Date() { return cache.token }
        var components = URLComponents(string: "https://api.weixin.qq.com/cgi-bin/token")!
        components.queryItems = [
            .init(name: "grant_type", value: "client_credential"),
            .init(name: "appid", value: appID.trimmed),
            .init(name: "secret", value: appSecret.trimmed)
        ]
        let (data, _) = try await URLSession.shared.data(from: components.url!)
        let response = try JSONDecoder().decode(TokenResponse.self, from: data)
        if let code = response.errcode, code != 0 {
            throw AppError.message("获取微信 access_token 失败：\(code) \(response.errmsg ?? "")")
        }
        guard let token = response.accessToken else { throw AppError.message("微信响应中没有 access_token。") }
        tokenCache = (token, Date().addingTimeInterval(TimeInterval(max(60, response.expiresIn ?? 7_200) - 60)))
        return token
    }

    private func imageData(reference: String, documentURL: URL?, sitePrefix: String) async throws -> (Data, String) {
        if let url = URL(string: reference), ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
            let (data, response) = try await URLSession.shared.data(from: url)
            if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                throw AppError.message("下载图片失败（HTTP \(http.statusCode)）：\(reference)")
            }
            return (data, url.lastPathComponent.isEmpty ? "image.png" : url.lastPathComponent)
        }
        if let documentURL {
            let local = documentURL.deletingLastPathComponent().appendingPathComponent(reference)
            if let data = try? Data(contentsOf: local) { return (data, local.lastPathComponent) }
        }
        if !sitePrefix.trimmed.isEmpty,
           let url = URL(string: sitePrefix.trimmed.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/" + reference.trimmingCharacters(in: CharacterSet(charactersIn: "/"))) {
            let (data, response) = try await URLSession.shared.data(from: url)
            if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                throw AppError.message("下载图片失败（HTTP \(http.statusCode)）：\(url.absoluteString)")
            }
            return (data, url.lastPathComponent.isEmpty ? "image.png" : url.lastPathComponent)
        }
        throw AppError.message("找不到图片：\(reference)")
    }

    private func upload(data: Data, filename: String, token: String) async throws -> UploadResult {
        var components = URLComponents(string: "https://api.weixin.qq.com/cgi-bin/material/add_material")!
        components.queryItems = [.init(name: "access_token", value: token), .init(name: "type", value: "image")]
        let boundary = "WxTyper-\(UUID().uuidString)"
        var body = Data()
        body.appendUTF8("--\(boundary)\r\n")
        body.appendUTF8("Content-Disposition: form-data; name=\"media\"; filename=\"\(filename)\"\r\n")
        body.appendUTF8("Content-Type: \(mimeType(for: filename))\r\n\r\n")
        body.append(data)
        body.appendUTF8("\r\n--\(boundary)--\r\n")

        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        request.timeoutInterval = 120
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        let (responseData, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode(UploadResponse.self, from: responseData)
        if let code = response.errcode, code != 0 {
            throw AppError.message("上传图片到微信失败：\(code) \(response.errmsg ?? "")")
        }
        guard let mediaID = response.mediaID, let url = response.url else { throw AppError.message("微信上传响应缺少 media_id 或 url。") }
        return UploadResult(mediaID: mediaID, url: url)
    }

    private func loadLog(documentURL: URL?) -> [String: MediaLogEntry] {
        guard let url = documentURL?.deletingLastPathComponent().appendingPathComponent("wechat_media_log.jsonl"),
              let text = try? String(contentsOf: url, encoding: .utf8) else { return [:] }
        return text.split(separator: "\n").compactMap { try? JSONDecoder().decode(MediaLogEntry.self, from: Data($0.utf8)) }
            .reduce(into: [:]) { $0[$1.originalURL] = $1 }
    }

    private func appendLog(_ entries: [MediaLogEntry], documentURL: URL?) throws {
        guard !entries.isEmpty,
              let url = documentURL?.deletingLastPathComponent().appendingPathComponent("wechat_media_log.jsonl") else { return }
        let encoder = JSONEncoder()
        let text = try entries.map { String(data: try encoder.encode($0), encoding: .utf8)! }.joined(separator: "\n") + "\n"
        let data = Data(text.utf8)
        if FileManager.default.fileExists(atPath: url.path) {
            let handle = try FileHandle(forWritingTo: url)
            defer { try? handle.close() }
            try handle.seekToEnd()
            try handle.write(contentsOf: data)
        } else {
            try data.write(to: url, options: .atomic)
        }
    }

    private func mimeType(for filename: String) -> String {
        switch URL(fileURLWithPath: filename).pathExtension.lowercased() {
        case "jpg", "jpeg": "image/jpeg"
        case "gif": "image/gif"
        case "webp": "image/webp"
        default: "image/png"
        }
    }
}

private struct TokenResponse: Decodable {
    let accessToken: String?
    let expiresIn: Int?
    let errcode: Int?
    let errmsg: String?
    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case expiresIn = "expires_in"
        case errcode, errmsg
    }
}

private struct UploadResponse: Decodable {
    let mediaID: String?
    let url: String?
    let errcode: Int?
    let errmsg: String?
    enum CodingKeys: String, CodingKey {
        case mediaID = "media_id"
        case url, errcode, errmsg
    }
}

private struct UploadResult {
    let mediaID: String
    let url: String
}

private struct MediaLogEntry: Codable {
    let originalURL: String
    let weChatURL: String
    let mediaID: String
    enum CodingKeys: String, CodingKey {
        case originalURL = "original_url"
        case weChatURL = "wechat_url"
        case mediaID = "media_id"
    }
}

private extension Data {
    mutating func appendUTF8(_ value: String) { append(Data(value.utf8)) }
}
