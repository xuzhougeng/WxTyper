import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: EditorViewModel

    var body: some View {
        TabView {
            GeneralSettingsTab(model: model, settings: model.settings)
                .tabItem { Label("通用", systemImage: "gearshape") }

            OpenAISettingsTab(model: model, settings: model.settings)
                .tabItem { Label("OpenAI", systemImage: "sparkles") }

            WeChatSettingsTab(model: model, settings: model.settings)
                .tabItem { Label("公众号", systemImage: "bubble.left.and.bubble.right") }

            AdvancedSettingsTab(model: model)
                .tabItem { Label("高级", systemImage: "terminal") }
        }
        .frame(width: 640, height: 560)
    }
}

private struct GeneralSettingsTab: View {
    @ObservedObject var model: EditorViewModel
    @ObservedObject var settings: AppSettings

    var body: some View {
        Form {
            Section("图片路径") {
                LabeledContent("网站前缀") {
                    TextField("https://example.com", text: $settings.sitePrefix)
                        .frame(width: 330)
                }
                LabeledContent("图片 CDN 前缀") {
                    TextField("https://cdn.example.com", text: $settings.imagePrefix)
                        .frame(width: 330)
                }
                LabeledContent("图片保存目录") {
                    TextField("assets", text: $settings.assetsDirectory)
                        .frame(width: 330)
                }
                Text("本地化图片、Mermaid 和 AI 图片会保存到文章同级的该目录中。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("外观") {
                LabeledContent("默认排版主题") {
                    Picker("", selection: Binding(
                        get: { settings.theme },
                        set: { model.selectTheme($0) }
                    )) {
                        ForEach(ThemeName.allCases) { theme in
                            Text(theme.rawValue).tag(theme)
                        }
                    }
                    .labelsHidden()
                    .frame(width: 220)
                }
                HStack {
                    Button("导入 CSS 主题…", systemImage: "paintpalette") { model.importTheme() }
                    if let name = model.customThemeName {
                        Text(name).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .formStyle(.grouped)
        .padding(18)
    }
}

private struct OpenAISettingsTab: View {
    @ObservedObject var model: EditorViewModel
    @ObservedObject var settings: AppSettings

    var body: some View {
        VStack(spacing: 0) {
            Form {
                Section("接口") {
                    LabeledContent("API Base URL") {
                        TextField("https://api.openai.com/v1", text: $settings.openAIBaseURL)
                            .frame(width: 350)
                    }
                    LabeledContent("API Key") {
                        SecureField("sk-…", text: $settings.openAIKey)
                            .frame(width: 350)
                    }
                    Text("API Key 仅保存到当前 Mac 的 Keychain，不会写入项目文件或日志。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("模型") {
                    LabeledContent("摘要模型") {
                        TextField("gpt-5.4-mini", text: $settings.summaryModel)
                            .frame(width: 250)
                    }
                    LabeledContent("图片模型") {
                        TextField("gpt-image-2", text: $settings.imageModel)
                            .frame(width: 250)
                    }
                }

                Section("封面提示词") {
                    TextEditor(text: $settings.customImagePrompt)
                        .font(.body)
                        .frame(minHeight: 86)
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(.quaternary))
                    Text("留空时会根据文章一级标题自动生成。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .formStyle(.grouped)

            settingsFooter(
                status: model.openAITestStatus,
                testTitle: model.isBusy(.testOpenAI) ? "测试中…" : "测试接口",
                testAction: model.testOpenAI,
                saveAction: model.saveSettings,
                disabled: model.busyAction != nil
            )
        }
        .padding(18)
    }
}

private struct WeChatSettingsTab: View {
    @ObservedObject var model: EditorViewModel
    @ObservedObject var settings: AppSettings

    var body: some View {
        VStack(spacing: 0) {
            Form {
                Section("微信公众号开发者配置") {
                    LabeledContent("APPID") {
                        TextField("公众号 APPID", text: $settings.weChatAppID)
                            .frame(width: 350)
                    }
                    LabeledContent("APPSECRET") {
                        SecureField("公众号 APPSECRET", text: $settings.weChatAppSecret)
                            .frame(width: 350)
                    }
                    Text("APPSECRET 仅保存到当前 Mac 的 Keychain。上传图片时会自动复用有效的 access_token。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .formStyle(.grouped)

            settingsFooter(
                status: model.weChatTestStatus,
                testTitle: model.isBusy(.testWeChat) ? "测试中…" : "测试 access_token",
                testAction: model.testWeChat,
                saveAction: model.saveSettings,
                disabled: model.busyAction != nil
            )
        }
        .padding(18)
    }
}

private struct AdvancedSettingsTab: View {
    @ObservedObject var model: EditorViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("会话日志").font(.headline)
                    Text("仅保留本次运行期间的最近 200 条操作，不包含 API Key。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 6) {
                    if model.logs.isEmpty {
                        ContentUnavailableView("暂无日志", systemImage: "terminal", description: Text("执行操作后，调试信息会显示在这里。"))
                            .frame(maxWidth: .infinity, minHeight: 300)
                    } else {
                        ForEach(Array(model.logs.enumerated()), id: \.offset) { _, line in
                            Text(line)
                                .font(.system(.caption, design: .monospaced))
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
                .padding(12)
            }
            .background(.background.secondary, in: RoundedRectangle(cornerRadius: 8))
        }
        .padding(22)
    }
}

private func settingsFooter(
    status: String,
    testTitle: String,
    testAction: @escaping () -> Void,
    saveAction: @escaping () -> Void,
    disabled: Bool
) -> some View {
    VStack(spacing: 10) {
        Divider()
        HStack {
            Button(testTitle, action: testAction)
                .disabled(disabled)
            Text(status)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .textSelection(.enabled)
            Spacer()
            Button("保存到 Keychain", systemImage: "key.fill", action: saveAction)
                .buttonStyle(.borderedProminent)
        }
    }
}
