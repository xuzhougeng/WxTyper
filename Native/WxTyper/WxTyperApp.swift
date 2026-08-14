import SwiftUI

@main
struct WxTyperApp: App {
    @StateObject private var model = EditorViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
                .frame(minWidth: 1_000, minHeight: 680)
        }
        .defaultSize(width: 1_280, height: 820)
        .windowToolbarStyle(.unified(showsTitle: true))
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("新建") { model.newDocument() }
                    .keyboardShortcut("n")
                Button("打开…") { model.openDocument() }
                    .keyboardShortcut("o")
            }
            CommandGroup(replacing: .saveItem) {
                Button("保存") { model.saveDocument() }
                    .keyboardShortcut("s")
                Button("另存为…") { model.saveDocumentAs() }
                    .keyboardShortcut("s", modifiers: [.command, .shift])
            }
            CommandMenu("文章") {
                Button("生成 AI 摘要") { model.generateSummary() }
                    .keyboardShortcut("r", modifiers: [.command, .shift])
                Button("复制微信 HTML") { model.copyHTML() }
                    .keyboardShortcut("c", modifiers: [.command, .option])
            }
            CommandMenu("视图模式") {
                ForEach(EditorViewModel.ViewMode.allCases) { mode in
                    Button(mode.title) { model.viewMode = mode }
                }
            }
        }

        Settings {
            SettingsView()
                .environmentObject(model)
        }
    }
}
