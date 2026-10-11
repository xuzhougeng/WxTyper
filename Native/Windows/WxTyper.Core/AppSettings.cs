using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace WxTyper.Core;

public sealed class AppSettings
{
    public string SitePrefix { get; set; } = "";
    public string ImagePrefix { get; set; } = "";
    public string AssetsDirectory { get; set; } = "assets";
    public string OpenAIBaseURL { get; set; } = "https://api.openai.com/v1";
    public string SummaryModel { get; set; } = "gpt-5.4-mini";
    public string ImageModel { get; set; } = "gpt-image-2";
    public string WeChatAppID { get; set; } = "";
    public string CustomImagePrompt { get; set; } = "";
    public string Theme { get; set; } = "default";
    [JsonIgnore] public string OpenAIKey { get; set; } = "";
    [JsonIgnore] public string WeChatAppSecret { get; set; } = "";

    public static readonly IReadOnlyDictionary<string, string> Themes = new Dictionary<string, string>
    {
        ["default"] = "Default (Zen Green)", ["lapis"] = "Lapis (Blue)",
        ["sakura"] = "Sakura (Pink)", ["tech"] = "Tech (Dark)"
    };
    public string ThemeTitle => Themes.GetValueOrDefault(Theme, Themes["default"]);
    public AppSettings Clone() => (AppSettings)MemberwiseClone();
}

public sealed class SettingsStore(string directory)
{
    public static string DefaultDirectory => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "WxTyper");

    public AppSettings Load()
    {
        var path = Path.Combine(directory, "settings.json");
        var settings = File.Exists(path) ? JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(path)) ?? new() : new();
        var secretsPath = Path.Combine(directory, "secrets.bin");
        if (File.Exists(secretsPath))
        {
            var bytes = ProtectedData.Unprotect(File.ReadAllBytes(secretsPath), null, DataProtectionScope.CurrentUser);
            try
            {
                var secrets = JsonSerializer.Deserialize<Secrets>(bytes);
                settings.OpenAIKey = secrets?.OpenAIKey ?? "";
                settings.WeChatAppSecret = secrets?.WeChatAppSecret ?? "";
            }
            finally { CryptographicOperations.ZeroMemory(bytes); }
        }
        return settings;
    }

    public void Save(AppSettings settings)
    {
        Directory.CreateDirectory(directory);
        var plain = JsonSerializer.SerializeToUtf8Bytes(new Secrets(settings.OpenAIKey.Trim(), settings.WeChatAppSecret.Trim()));
        try
        {
            AtomicFile.Write(Path.Combine(directory, "secrets.bin"), ProtectedData.Protect(plain, null, DataProtectionScope.CurrentUser));
            SavePreferences(settings);
        }
        finally { CryptographicOperations.ZeroMemory(plain); }
    }

    public void SavePreferences(AppSettings settings)
    {
        Directory.CreateDirectory(directory);
        AtomicFile.WriteText(Path.Combine(directory, "settings.json"), JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true }));
    }
    private sealed record Secrets(string OpenAIKey, string WeChatAppSecret);
}

public static class AtomicFile
{
    public static void WriteText(string path, string value) => Write(path, new UTF8Encoding(false).GetBytes(value));
    public static void Write(string path, byte[] bytes)
    {
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try { File.WriteAllBytes(temporary, bytes); File.Move(temporary, path, true); }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}
