import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var model: EditorViewModel

    var body: some View {
        VStack(spacing: 0) {
            workspace
            Divider()
            statusBar
        }
        .navigationTitle(model.windowTitle)
        .toolbarRole(.editor)
        .toolbar {
            documentToolbar
        }
        .overlay(alignment: .topTrailing) {
            if let message = model.toastMessage {
                Label(message, systemImage: "checkmark.circle.fill")
                    .font(.callout.weight(.medium))
                    .foregroundStyle(.primary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(.regularMaterial, in: Capsule())
                    .shadow(color: .black.opacity(0.12), radius: 12, y: 5)
                    .padding(14)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.snappy(duration: 0.25), value: model.toastMessage)
        .alert("WxTyper", isPresented: Binding(
            get: { model.alertMessage != nil },
            set: { if !$0 { model.alertMessage = nil } }
        )) {
            Button("好", role: .cancel) { model.alertMessage = nil }
        } message: {
            Text(model.alertMessage ?? "")
        }
    }

    @ToolbarContentBuilder
    private var documentToolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .navigation) {
            Button(action: model.openDocument) {
                Label("打开", systemImage: "folder")
            }
            .help("打开 Markdown（⌘O）")

            Button(action: model.saveDocument) {
                Label("保存", systemImage: "square.and.arrow.down")
            }
            .help("保存（⌘S）")
        }

        ToolbarItem(placement: .principal) {
            Picker("视图", selection: $model.viewMode) {
                ForEach(EditorViewModel.ViewMode.allCases) { mode in
                    Label(mode.title, systemImage: mode.systemImage).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(width: 226)
            .help("切换编辑、分栏或预览模式")
        }

        ToolbarItemGroup(placement: .primaryAction) {
            themeMenu
            toolsMenu

            Button(action: model.copyHTML) {
                Label("复制到公众号", systemImage: "doc.on.doc")
            }
            .buttonStyle(.borderedProminent)
            .help("复制带样式的微信 HTML（⌥⌘C）")

            SettingsLink {
                Label("设置", systemImage: "gearshape")
            }
            .help("打开设置")
        }
    }

    private var themeMenu: some View {
        Menu {
            Picker("排版主题", selection: Binding(
                get: { model.settings.theme },
                set: { model.selectTheme($0) }
            )) {
                ForEach(ThemeName.allCases) { theme in
                    Text(theme.rawValue).tag(theme)
                }
            }
            Divider()
            Button("导入 CSS 主题…", systemImage: "square.and.arrow.down") {
                model.importTheme()
            }
        } label: {
            Label("主题", systemImage: "paintpalette")
        }
        .help("选择排版主题")
    }

    private var toolsMenu: some View {
        Menu {
            Section("AI") {
                Button("生成文章摘要", systemImage: "sparkles") { model.generateSummary() }
                Button("生成封面图", systemImage: "photo.badge.plus") { model.generateCover() }
                Button("根据选中文字生成配图", systemImage: "wand.and.stars") { model.generateIllustration() }
            }
            Section("图片") {
                Button("本地化远程图片", systemImage: "folder.badge.plus") { model.localizeImages() }
                Button("导出 Mermaid 为 PNG", systemImage: "arrow.down.doc") { model.exportMermaid() }
                Button("上传图片到微信公众号", systemImage: "arrow.up.circle") { model.uploadImagesToWeChat() }
            }
        } label: {
            if model.busyAction == nil {
                Label("工具", systemImage: "wand.and.rays")
            } else {
                ProgressView().controlSize(.small)
            }
        }
        .disabled(model.busyAction != nil)
        .help("AI 与图片工具")
    }

    @ViewBuilder
    private var workspace: some View {
        switch model.viewMode {
        case .editor:
            editorPane
        case .split:
            HSplitView {
                editorPane
                    .frame(minWidth: 390, idealWidth: 570)
                previewPane
                    .frame(minWidth: 420, idealWidth: 650)
            }
        case .preview:
            previewPane
        }
    }

    private var editorPane: some View {
        VStack(spacing: 0) {
            paneHeader("Markdown", systemImage: "doc.text") {
                if model.isDirty {
                    Text("已修改")
                        .foregroundStyle(.orange)
                }
            }
            Divider()

            if model.isSummaryPresented {
                summaryCard
                Divider()
            }

            EditorTextView(text: $model.markdown, selectedRange: $model.selectedRange)
        }
    }

    private var previewPane: some View {
        VStack(spacing: 0) {
            paneHeader("微信预览", systemImage: "eye") {
                Text(model.customThemeName ?? model.settings.theme.rawValue)
                    .lineLimit(1)
            }
            Divider()
            PreviewWebView(
                html: model.renderedHTML,
                baseURL: model.documentURL?.deletingLastPathComponent(),
                bridge: model.previewBridge
            )
        }
    }

    private var summaryCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label("AI 摘要", systemImage: "sparkles")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                if model.isBusy(.summary) {
                    ProgressView().controlSize(.small)
                } else {
                    Button("重新生成", systemImage: "arrow.clockwise") { model.generateSummary() }
                        .buttonStyle(.borderless)
                        .controlSize(.small)
                    Button("复制", systemImage: "doc.on.doc") { model.copySummary() }
                        .buttonStyle(.borderless)
                        .controlSize(.small)
                        .disabled(model.summary.isEmpty)
                }
                Button("关闭", systemImage: "xmark") { model.dismissSummary() }
                    .buttonStyle(.borderless)
                    .labelStyle(.iconOnly)
                    .help("收起摘要")
            }
            Text(model.isBusy(.summary) ? "正在生成摘要…" : (model.summary.isEmpty ? "暂无摘要" : model.summary))
                .font(.callout)
                .foregroundStyle(model.summary.isEmpty ? .secondary : .primary)
                .textSelection(.enabled)
                .lineLimit(4)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .background(.thinMaterial)
        .transition(.move(edge: .top).combined(with: .opacity))
    }

    private var statusBar: some View {
        HStack(spacing: 14) {
            Label(model.isDirty ? "未保存" : "已保存", systemImage: model.isDirty ? "circle.fill" : "checkmark.circle")
                .foregroundStyle(model.isDirty ? .orange : .secondary)
            Text("\(model.characterCount) 字")
            Text("\(model.lineCount) 行")
            if model.imageCount > 0 {
                Label("\(model.imageCount)", systemImage: "photo")
            }
            if model.mermaidCount > 0 {
                Label("\(model.mermaidCount)", systemImage: "point.3.connected.trianglepath.dotted")
            }
            Spacer()
            Text(model.customThemeName ?? model.settings.theme.rawValue)
            Text(model.documentName)
                .lineLimit(1)
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 12)
        .frame(height: 28)
        .background(.bar)
    }

    private func paneHeader<Trailing: View>(
        _ title: String,
        systemImage: String,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        HStack {
            Label(title, systemImage: systemImage)
                .font(.subheadline.weight(.semibold))
            Spacer()
            trailing()
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .frame(height: 34)
        .background(.background.opacity(0.72))
    }
}
