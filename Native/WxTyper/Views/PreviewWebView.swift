import SwiftUI
import WebKit

@MainActor
final class PreviewBridge {
    weak var webView: WKWebView?

    func inlinedHTML(completion: @escaping (Result<String, Error>) -> Void) {
        guard let webView else { completion(.failure(AppError.message("预览尚未就绪。"))); return }
        Task {
            do {
                let value = try await webView.callAsyncJavaScript("return await window.wxtyperCopyHTML();", arguments: [:], in: nil, contentWorld: .page)
                if let html = value as? String { completion(.success(html)) }
                else { completion(.failure(AppError.message("无法读取预览 HTML。"))) }
            } catch { completion(.failure(error)) }
            }
    }

    func exportMermaidPNGs(completion: @escaping (Result<[Data], Error>) -> Void) {
        guard let webView else { completion(.failure(AppError.message("预览尚未就绪。"))); return }
        Task {
            do {
                let value = try await webView.callAsyncJavaScript("return await window.wxtyperExportMermaid();", arguments: [:], in: nil, contentWorld: .page)
                guard let strings = value as? [String] else {
                    completion(.failure(AppError.message("没有取得 Mermaid 图片，请等待预览渲染完成。")))
                    return
                }
                let images = strings.compactMap { Data(base64Encoded: $0, options: .ignoreUnknownCharacters) }
                guard images.count == strings.count else {
                    completion(.failure(AppError.message("Mermaid 图片解码失败。")))
                    return
                }
                completion(.success(images))
            } catch { completion(.failure(error)) }
            }
    }
}

struct PreviewWebView: NSViewRepresentable {
    let html: String
    let baseURL: URL?
    let bridge: PreviewBridge

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.setValue(false, forKey: "drawsBackground")
        bridge.webView = view
        context.coordinator.lastHTML = html
        view.loadHTMLString(html, baseURL: baseURL)
        return view
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {
        bridge.webView = nsView
        guard context.coordinator.lastHTML != html || context.coordinator.lastBaseURL != baseURL else { return }
        context.coordinator.lastHTML = html
        context.coordinator.lastBaseURL = baseURL
        nsView.loadHTMLString(html, baseURL: baseURL)
    }

    final class Coordinator {
        var lastHTML = ""
        var lastBaseURL: URL?
    }
}
