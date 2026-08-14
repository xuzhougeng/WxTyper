import Foundation

enum ThemeName: String, CaseIterable, Identifiable {
    case zen = "Default (Zen Green)"
    case lapis = "Lapis (Blue)"
    case sakura = "Sakura (Pink)"
    case tech = "Tech (Dark)"

    var id: String { rawValue }

    var resourceName: String {
        switch self {
        case .zen: "default"
        case .lapis: "lapis"
        case .sakura: "sakura"
        case .tech: "tech"
        }
    }
}

@MainActor
final class AppSettings: ObservableObject {
    private enum Key {
        static let sitePrefix = "sitePrefix"
        static let imagePrefix = "imagePrefix"
        static let assetsDirectory = "assetsDirectory"
        static let openAIBaseURL = "openAIBaseURL"
        static let summaryModel = "summaryModel"
        static let imageModel = "imageModel"
        static let weChatAppID = "weChatAppID"
        static let imagePrompt = "imagePrompt"
        static let theme = "theme"
    }

    private let defaults = UserDefaults.standard
    private let keychain = KeychainStore(service: "com.xuzhougeng.wxtyper")

    @Published var sitePrefix: String { didSet { defaults.set(sitePrefix, forKey: Key.sitePrefix) } }
    @Published var imagePrefix: String { didSet { defaults.set(imagePrefix, forKey: Key.imagePrefix) } }
    @Published var assetsDirectory: String { didSet { defaults.set(assetsDirectory, forKey: Key.assetsDirectory) } }
    @Published var openAIBaseURL: String { didSet { defaults.set(openAIBaseURL, forKey: Key.openAIBaseURL) } }
    @Published var summaryModel: String { didSet { defaults.set(summaryModel, forKey: Key.summaryModel) } }
    @Published var imageModel: String { didSet { defaults.set(imageModel, forKey: Key.imageModel) } }
    @Published var weChatAppID: String { didSet { defaults.set(weChatAppID, forKey: Key.weChatAppID) } }
    @Published var customImagePrompt: String { didSet { defaults.set(customImagePrompt, forKey: Key.imagePrompt) } }
    @Published var theme: ThemeName { didSet { defaults.set(theme.rawValue, forKey: Key.theme) } }
    @Published var openAIKey: String
    @Published var weChatAppSecret: String

    init() {
        sitePrefix = defaults.string(forKey: Key.sitePrefix) ?? ""
        imagePrefix = defaults.string(forKey: Key.imagePrefix) ?? ""
        assetsDirectory = defaults.string(forKey: Key.assetsDirectory) ?? "assets"
        openAIBaseURL = defaults.string(forKey: Key.openAIBaseURL) ?? "https://api.openai.com/v1"
        summaryModel = defaults.string(forKey: Key.summaryModel) ?? "gpt-5.4-mini"
        imageModel = defaults.string(forKey: Key.imageModel) ?? "gpt-image-2"
        weChatAppID = defaults.string(forKey: Key.weChatAppID) ?? ""
        customImagePrompt = defaults.string(forKey: Key.imagePrompt) ?? ""
        theme = ThemeName(rawValue: defaults.string(forKey: Key.theme) ?? "") ?? .zen
        openAIKey = (try? keychain.read(account: "openai-api-key")) ?? ""
        weChatAppSecret = (try? keychain.read(account: "wechat-app-secret")) ?? ""
    }

    func saveSecrets() throws {
        try keychain.write(openAIKey.trimmingCharacters(in: .whitespacesAndNewlines), account: "openai-api-key")
        try keychain.write(weChatAppSecret.trimmingCharacters(in: .whitespacesAndNewlines), account: "wechat-app-secret")
    }
}
