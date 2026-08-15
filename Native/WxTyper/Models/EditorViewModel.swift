import AppKit
import Combine
import Foundation
import UniformTypeIdentifiers

@MainActor
final class EditorViewModel: ObservableObject {
    enum ViewMode: String, CaseIterable, Identifiable {
        case editor
        case split
        case preview

        var id: String { rawValue }
        var title: String {
            switch self {
            case .editor: "编辑"
            case .split: "分栏"
            case .preview: "预览"
            }
        }
        var systemImage: String {
            switch self {
            case .editor: "square.and.pencil"
            case .split: "rectangle.split.2x1"
            case .preview: "eye"
            }
        }
    }
    enum BusyAction { case summary, cover, illustration, localize, mermaid, wechat, testOpenAI, testWeChat }

    let settings = AppSettings()
    let previewBridge = PreviewBridge()
    private let weChatService = WeChatService()
    private var settingsObserver: AnyCancellable?

    @Published var markdown: String = SampleDocument.markdown {
        didSet {
            isDirty = markdown != lastSavedMarkdown
            renderPreview()
        }
    }
    @Published private(set) var renderedHTML = ""
    @Published private(set) var documentURL: URL?
    @Published private(set) var isDirty = false
    @Published var summary = ""
    @Published var isSummaryPresented = false
    @Published var selectedRange = NSRange(location: 0, length: 0)
    @Published var viewMode: ViewMode = .split
    @Published var busyAction: BusyAction?
    @Published var alertMessage: String?
    @Published var toastMessage: String?
    @Published var openAITestStatus = ""
    @Published var weChatTestStatus = ""
    @Published var settingsStatus = ""
    @Published private(set) var logs: [String] = []
    @Published private(set) var customThemeName: String?

    private var customThemeCSS: String?
    private var lastSavedMarkdown = ""

    init() {
        lastSavedMarkdown = markdown
        settingsObserver = settings.objectWillChange.sink { [weak self] _ in
            DispatchQueue.main.async { self?.renderPreview() }
        }
        renderPreview()
    }

    var documentName: String { documentURL?.lastPathComponent ?? "Untitled.md" }
    var windowTitle: String { documentName + (isDirty ? " — 已修改" : "") }
    var characterCount: Int { markdown.count }
    var lineCount: Int { max(1, markdown.components(separatedBy: "\n").count) }
    var imageCount: Int { ImageService.markdownImageReferences(in: markdown).count }
    var mermaidCount: Int { max(0, markdown.components(separatedBy: "```mermaid").count - 1) }

    func isBusy(_ action: BusyAction) -> Bool { busyAction == action }

    func renderPreview() {
        let css = customThemeCSS ?? bundledCSS(for: settings.theme)
        renderedHTML = MarkdownRenderer.render(markdown, options: .init(
            css: css,
            imagePrefix: settings.imagePrefix,
            assetsDirectory: effectiveAssetsDirectory,
            baseURL: documentURL?.deletingLastPathComponent()
        ))
    }

    func selectTheme(_ theme: ThemeName) {
        customThemeCSS = nil
        customThemeName = nil
        settings.theme = theme
        renderPreview()
    }

    func importTheme() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.init(filenameExtension: "css")!]
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            customThemeCSS = try String(contentsOf: url, encoding: .utf8)
            customThemeName = "自定义：\(url.lastPathComponent)"
            renderPreview()
            log("已导入 CSS 主题：\(url.lastPathComponent)")
        } catch { present(error) }
    }

    func newDocument() {
        selectedRange = NSRange(location: 0, length: 0)
        markdown = "# 新文章\n\n开始写作吧。\n"
        documentURL = nil
        lastSavedMarkdown = markdown
        isDirty = false
        summary = ""
        isSummaryPresented = false
        renderPreview()
    }

    func openDocument() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.init(filenameExtension: "md")!, .init(filenameExtension: "markdown")!]
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            let content = try String(contentsOf: url, encoding: .utf8)
            selectedRange = NSRange(location: 0, length: 0)
            documentURL = url
            markdown = content
            lastSavedMarkdown = content
            isDirty = false
            summary = ""
            isSummaryPresented = false
            renderPreview()
            log("打开文档：\(url.path)")
        } catch { present(error) }
    }

    func saveDocument() {
        guard let documentURL else { saveDocumentAs(); return }
        writeDocument(to: documentURL)
    }

    func saveDocumentAs() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.init(filenameExtension: "md")!]
        panel.nameFieldStringValue = documentURL?.lastPathComponent ?? "Untitled.md"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        writeDocument(to: url)
    }

    func generateSummary() {
        guard busyAction == nil else { return }
        busyAction = .summary
        summary = ""
        isSummaryPresented = true
        log("开始生成 AI 摘要（模型：\(settings.summaryModel)）")
        Task {
            defer { busyAction = nil }
            do {
                summary = try await openAI.generateSummary(markdown: markdown, model: settings.summaryModel)
                log("AI 摘要生成完成")
                showToast("摘要已生成")
            } catch { present(error) }
        }
    }

    func generateCover() {
        guard busyAction == nil else { return }
        guard let documentURL else { alertMessage = "请先保存 Markdown 文档，再生成封面图。"; return }
        busyAction = .cover
        let title = markdown.split(separator: "\n").first(where: { $0.hasPrefix("# ") }).map { String($0.dropFirst(2)) } ?? "微信公众号文章"
        let prompt = settings.customImagePrompt.trimmed.isEmpty ? """
        Create a clean, modern, minimalist cover image for a WeChat article titled "\(title)". Editorial tech blog style, white background, deep forest green (#2D5A4C) and pale mint (#D1F2E5), soft rounded shapes and generous negative space. Landscape 3:2 composition. Do not include text.
        """ : settings.customImagePrompt
        log("开始用 OpenAI 生成封面图（模型：\(settings.imageModel)）")
        Task {
            defer { busyAction = nil }
            do {
                let data = try await openAI.generateImage(prompt: prompt, model: settings.imageModel)
                let path = try ImageService.saveGeneratedImage(data, documentURL: documentURL, assetsDirectory: effectiveAssetsDirectory, prefix: "cover")
                markdown = "![封面图](\(path))\n\n" + markdown
                log("封面图已生成：\(path)")
                showToast("封面图已生成并插入文档")
            } catch { present(error) }
        }
    }

    func generateIllustration() {
        guard busyAction == nil else { return }
        guard let documentURL else { alertMessage = "请先保存 Markdown 文档，再生成配图。"; return }
        let nsMarkdown = markdown as NSString
        guard selectedRange.location != NSNotFound,
              selectedRange.location + selectedRange.length <= nsMarkdown.length else {
            alertMessage = "请先在编辑器中选中一段文字。"
            return
        }
        let selected = nsMarkdown.substring(with: selectedRange).trimmed
        guard !selected.isEmpty else {
            alertMessage = "请先在编辑器中选中一段文字。"
            return
        }
        let prompt = illustrationPrompt(for: selected)
        let insertionLocation = selectedRange.location + selectedRange.length
        busyAction = .illustration
        log("开始根据选中文字生成配图（\(selected.count) 字）")
        Task {
            defer { busyAction = nil }
            do {
                let data = try await openAI.generateImage(prompt: prompt, model: settings.imageModel)
                let path = try ImageService.saveGeneratedImage(data, documentURL: documentURL, assetsDirectory: effectiveAssetsDirectory, prefix: "illustration")
                let insert = "\n\n![配图](\(path))\n\n"
                let ns = markdown as NSString
                markdown = ns.replacingCharacters(in: NSRange(location: min(insertionLocation, ns.length), length: 0), with: insert)
                log("配图已生成：\(path)")
                showToast("配图已生成并插入选区后方")
            } catch { present(error) }
        }
    }

    func localizeImages() {
        guard busyAction == nil else { return }
        guard let documentURL else { alertMessage = "请先保存 Markdown 文档，再本地化图片。"; return }
        busyAction = .localize
        log("开始本地化远程图片")
        Task {
            defer { busyAction = nil }
            do {
                markdown = try await ImageService.localizeImages(
                    in: markdown,
                    documentURL: documentURL,
                    sitePrefix: settings.sitePrefix,
                    assetsDirectory: effectiveAssetsDirectory
                )
                log("图片本地化完成")
                showToast("图片已下载到 \(effectiveAssetsDirectory) 并更新引用")
            } catch { present(error) }
        }
    }

    func exportMermaid() {
        guard busyAction == nil else { return }
        guard let documentURL else { alertMessage = "请先保存 Markdown 文档，再导出 Mermaid。"; return }
        guard markdown.contains("```mermaid") else { alertMessage = "文档中没有 Mermaid 代码块。"; return }
        busyAction = .mermaid
        previewBridge.exportMermaidPNGs { [weak self] result in
            guard let self else { return }
            defer { self.busyAction = nil }
            do {
                let images = try result.get()
                try self.replaceMermaidBlocks(with: images, documentURL: documentURL)
                self.log("Mermaid 已导出为 PNG（\(images.count) 张）")
                self.showToast("Mermaid 图已导出并替换为图片引用")
            } catch { self.present(error) }
        }
    }

    func uploadImagesToWeChat() {
        guard busyAction == nil else { return }
        guard !markdown.contains("```mermaid") else {
            alertMessage = "请先导出 Mermaid 图，再上传公众号图片。"
            return
        }
        busyAction = .wechat
        log("开始上传图片到微信公众号")
        Task {
            defer { busyAction = nil }
            do {
                markdown = try await weChatService.uploadAndReplace(
                    markdown: markdown,
                    appID: settings.weChatAppID,
                    appSecret: settings.weChatAppSecret,
                    documentURL: documentURL,
                    sitePrefix: settings.sitePrefix
                )
                log("公众号图片上传完成")
                showToast("图片已上传到公众号并替换链接")
            } catch { present(error) }
        }
    }

    func copyHTML() {
        previewBridge.inlinedHTML { [weak self] result in
            guard let self else { return }
            do {
                let html = try result.get()
                let pasteboard = NSPasteboard.general
                pasteboard.clearContents()
                pasteboard.setString(self.markdown, forType: .string)
                pasteboard.setData(Data(html.utf8), forType: .html)
                self.log("已复制微信 HTML 到剪贴板")
                self.showToast("已复制，可直接粘贴到微信公众号")
            } catch { self.present(error) }
        }
    }

    func saveSettings() {
        do {
            try settings.saveSecrets()
            settingsStatus = "已保存（密钥存入 Keychain）"
            log("设置已保存")
            renderPreview()
        } catch { present(error) }
    }

    func copySummary() {
        guard !summary.isEmpty else { return }
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(summary, forType: .string)
        showToast("摘要已复制")
    }

    func dismissSummary() {
        isSummaryPresented = false
    }

    func testOpenAI() {
        guard busyAction == nil else { return }
        busyAction = .testOpenAI
        openAITestStatus = "测试中…"
        Task {
            defer { busyAction = nil }
            do { openAITestStatus = try await openAI.test(model: settings.summaryModel) }
            catch { openAITestStatus = error.localizedDescription; present(error) }
        }
    }

    func testWeChat() {
        guard busyAction == nil else { return }
        busyAction = .testWeChat
        weChatTestStatus = "测试中…"
        Task {
            defer { busyAction = nil }
            do { weChatTestStatus = try await weChatService.test(appID: settings.weChatAppID, appSecret: settings.weChatAppSecret) }
            catch { weChatTestStatus = error.localizedDescription; present(error) }
        }
    }

    private var openAI: OpenAIService {
        OpenAIService(baseURL: settings.openAIBaseURL, apiKey: settings.openAIKey)
    }

    private var effectiveAssetsDirectory: String {
        settings.assetsDirectory.trimmed.isEmpty ? "assets" : settings.assetsDirectory.trimmed
    }

    private func writeDocument(to url: URL) {
        do {
            try markdown.write(to: url, atomically: true, encoding: .utf8)
            documentURL = url
            lastSavedMarkdown = markdown
            isDirty = false
            renderPreview()
            log("保存文档：\(url.path)")
        } catch { present(error) }
    }

    private func bundledCSS(for theme: ThemeName) -> String {
        let nested = Bundle.main.url(forResource: theme.resourceName, withExtension: "css", subdirectory: "Themes")
        let flat = Bundle.main.url(forResource: theme.resourceName, withExtension: "css")
        guard let url = nested ?? flat else { return "" }
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }

    private func replaceMermaidBlocks(with images: [Data], documentURL: URL) throws {
        let regex = try NSRegularExpression(pattern: #"```mermaid[\s\S]*?```"#)
        let ns = markdown as NSString
        let matches = regex.matches(in: markdown, range: NSRange(location: 0, length: ns.length))
        guard !matches.isEmpty, matches.count == images.count else {
            throw AppError.message("Mermaid 预览尚未完成，请稍后重试。")
        }
        var replacements: [(NSRange, String)] = []
        for (index, match) in matches.enumerated() {
            let path = try ImageService.saveGeneratedImage(images[index], documentURL: documentURL, assetsDirectory: effectiveAssetsDirectory, prefix: "mermaid")
            replacements.append((match.range, "![Mermaid 图](\(path))"))
        }
        var updated = markdown as NSString
        for replacement in replacements.reversed() {
            updated = updated.replacingCharacters(in: replacement.0, with: replacement.1) as NSString
        }
        markdown = updated as String
    }

    private func illustrationPrompt(for selected: String) -> String {
        """
        Create an inline editorial illustration for a WeChat tech article.
        Use a clean white background with high negative space. Use only deep forest green (#2D5A4C), pale mint (#D1F2E5), soft sage (#66A182), and charcoal accents. Flat soft vector or tasteful pixel-art instructional diagram, rounded frames, subtle depth, no clutter or purple gradients. Landscape composition. Avoid dense text.

        Content to illustrate:
        \(String(selected.prefix(400)))
        """
    }

    private func log(_ message: String) {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        logs.insert("[\(formatter.string(from: Date()))] \(message)", at: 0)
        if logs.count > 200 { logs.removeLast(logs.count - 200) }
    }

    private func showToast(_ message: String) {
        toastMessage = message
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_200_000_000)
            guard self?.toastMessage == message else { return }
            self?.toastMessage = nil
        }
    }

    private func present(_ error: Error) {
        let message = error.localizedDescription
        log("失败：\(message)")
        alertMessage = message
    }
}
