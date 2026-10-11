using System.Collections.Concurrent;

namespace WxTyper.Core;

public sealed class DocumentSession
{
    private string markdown = NormalizeLineEndings(Resources.Read("Sample.md"));
    public string Markdown { get => markdown; set => markdown = NormalizeLineEndings(value); }
    public string? FilePath { get; private set; }
    private string saved = NormalizeLineEndings(Resources.Read("Sample.md"));
    public bool IsDirty => Markdown != saved;
    public string Name => FilePath is null ? "Untitled.md" : Path.GetFileName(FilePath);
    public static string NormalizeLineEndings(string text) => text.Replace("\r\n", "\n").Replace('\r', '\n');
    public void New() { FilePath = null; Markdown = "# 新文章\n\n开始写作吧。\n"; saved = ""; }
    public void Open(string path)
    {
        SetOpenedText(path, File.ReadAllText(path));
    }
    public async Task OpenAsync(string path)
    {
        var text = await File.ReadAllTextAsync(path);
        SetOpenedText(path, text);
    }
    private void SetOpenedText(string path, string text)
    {
        text = NormalizeLineEndings(text);
        Markdown = saved = text;
        FilePath = Path.GetFullPath(path);
    }
    public void Save(string path)
    {
        AtomicFile.WriteText(path, Markdown);
        FilePath = Path.GetFullPath(path);
        saved = Markdown;
    }
}

public static class Resources
{
    private static readonly ConcurrentDictionary<string, string> Cache = new();
    public static string Read(string suffix) => Cache.GetOrAdd(suffix, Load);
    private static string Load(string suffix)
    {
        var assembly = typeof(Resources).Assembly;
        var name = assembly.GetManifestResourceNames().Single(x => x.EndsWith("." + suffix, StringComparison.Ordinal));
        using var reader = new StreamReader(assembly.GetManifestResourceStream(name)!);
        return reader.ReadToEnd();
    }
}
