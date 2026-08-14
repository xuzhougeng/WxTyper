import Foundation

struct OpenAIService {
    let baseURL: String
    let apiKey: String

    func generateSummary(markdown: String, model: String) async throws -> String {
        guard !apiKey.trimmed.isEmpty else { throw AppError.message("请先在设置中填写 OpenAI API Key。") }
        let request = ChatRequest(
            model: model.trimmed,
            messages: [.init(role: "user", content: "请根据以下微信公众号 Markdown 内容生成一个中文摘要，不超过100个汉字，不要换行，只输出摘要内容：\n\n\(markdown)")]
        )
        let response: ChatResponse = try await post(path: "chat/completions", body: request)
        guard let content = response.choices.first?.message.content.trimmed, !content.isEmpty else {
            throw AppError.message("OpenAI 未返回摘要。")
        }
        return String(content.prefix(100))
    }

    func test(model: String) async throws -> String {
        guard !apiKey.trimmed.isEmpty else { throw AppError.message("OpenAI API Key 为空。") }
        let request = ChatRequest(
            model: model.trimmed,
            messages: [.init(role: "user", content: "Reply with exactly OK")]
        )
        let response: ChatResponse = try await post(path: "chat/completions", body: request)
        guard let content = response.choices.first?.message.content.trimmed else {
            throw AppError.message("OpenAI 返回内容为空。")
        }
        return "OpenAI 接口可用（\(model)）：\(content)"
    }

    func generateImage(prompt: String, model: String, size: String = "1536x1024") async throws -> Data {
        guard !apiKey.trimmed.isEmpty else { throw AppError.message("请先在设置中填写 OpenAI API Key。") }
        let request = ImageRequest(model: model.trimmed, prompt: prompt, size: size, quality: "medium", n: 1)
        let response: ImageResponse = try await post(path: "images/generations", body: request)
        guard let encoded = response.data.first?.b64JSON,
              let image = Data(base64Encoded: encoded, options: .ignoreUnknownCharacters) else {
            throw AppError.message("OpenAI 未返回可解码的图片。")
        }
        return image
    }

    private func post<Body: Encodable, Response: Decodable>(path: String, body: Body) async throws -> Response {
        let base = baseURL.trimmed.isEmpty ? "https://api.openai.com/v1" : baseURL.trimmed
        guard let url = URL(string: base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/" + path) else {
            throw AppError.message("OpenAI API 地址无效。")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 180
        request.setValue("Bearer \(apiKey.trimmed)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw AppError.message("OpenAI 返回了无效响应。") }
        guard (200..<300).contains(http.statusCode) else {
            let error = (try? JSONDecoder().decode(APIErrorEnvelope.self, from: data).error.message)
                ?? String(data: data, encoding: .utf8)
                ?? "未知错误"
            throw AppError.message("OpenAI HTTP \(http.statusCode)：\(error)")
        }
        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw AppError.message("OpenAI 响应解析失败：\(error.localizedDescription)")
        }
    }
}

private struct ChatRequest: Encodable {
    struct Message: Encodable { let role: String; let content: String }
    let model: String
    let messages: [Message]
}

private struct ChatResponse: Decodable {
    struct Choice: Decodable { let message: Message }
    struct Message: Decodable { let content: String }
    let choices: [Choice]
}

private struct ImageRequest: Encodable {
    let model: String
    let prompt: String
    let size: String
    let quality: String
    let n: Int
}

private struct ImageResponse: Decodable {
    struct Item: Decodable {
        let b64JSON: String?
        enum CodingKeys: String, CodingKey { case b64JSON = "b64_json" }
    }
    let data: [Item]
}

private struct APIErrorEnvelope: Decodable {
    struct APIError: Decodable { let message: String }
    let error: APIError
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
