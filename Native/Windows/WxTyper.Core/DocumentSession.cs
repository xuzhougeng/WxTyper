namespace WxTyper.Core;

public sealed class DocumentSession
{
    public string Markdown { get; set; } = Resources.Read("Sample.md");
    public string? FilePath { get; private set; }
    private string saved = Resources.Read("Sample.md");
    public bool IsDirty => Markdown != saved;
    public string Name => FilePath is null ? "Untitled.md" : Path.GetFileName(FilePath);
    public void New() { FilePath = null; Markdown = "# 新文章\n\n开始写作吧。\n"; saved = ""; }
    public void Open(string path)
    {
        var text = File.ReadAllText(path).Replace("\r\n", "\n");
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
    public static string Read(string suffix)
    {
        var assembly = typeof(Resources).Assembly;
        var name = assembly.GetManifestResourceNames().Single(x => x.EndsWith("." + suffix, StringComparison.Ordinal));
        using var reader = new StreamReader(assembly.GetManifestResourceStream(name)!);
        return reader.ReadToEnd();
    }
}
