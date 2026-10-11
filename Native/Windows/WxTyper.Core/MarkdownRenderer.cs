using System.Net;
using Markdig;
using Markdig.Renderers;
using Markdig.Renderers.Html;
using Markdig.Renderers.Html.Inlines;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;

namespace WxTyper.Core;

public sealed record RenderOptions(string Css, string ImagePrefix = "", string AssetsDirectory = "assets");
public sealed record PreviewContent(string Body, string Css, int CharacterCount, int LineCount, int ImageCount, int MermaidCount);

public static class MarkdownRenderer
{
    public static readonly MarkdownPipeline Pipeline = new MarkdownPipelineBuilder()
        .UsePipeTables().UseTaskLists().UseEmphasisExtras().DisableHtml().Build();

    public static string RenderBody(string markdown, RenderOptions options)
    {
        var document = Markdown.Parse(markdown, Pipeline);
        return RenderBody(document, options);
    }

    private static string RenderBody(MarkdownDocument document, RenderOptions options)
    {
        using var writer = new StringWriter();
        var renderer = new HtmlRenderer(writer);
        Pipeline.Setup(renderer);
        var footnotes = new List<string>();
        renderer.ObjectRenderers.Remove(renderer.ObjectRenderers.FindExact<LinkInlineRenderer>()!);
        renderer.ObjectRenderers.Insert(0, new WeChatLinkRenderer(options, footnotes));
        renderer.ObjectRenderers.Insert(0, new MermaidRenderer());
        renderer.Render(document);
        if (footnotes.Count > 0)
            writer.Write("<div class=\"footnotes\"><ol>" + string.Concat(footnotes.Select(x => "<li><span class=\"footnote-url\">" + WebUtility.HtmlEncode(x) + "</span></li>")) + "</ol></div>");
        return writer.ToString();
    }

    public static string Render(string markdown, RenderOptions options)
    {
        return RenderShell(RenderContent(markdown, options));
    }

    public static PreviewContent RenderContent(string markdown, RenderOptions options)
    {
        markdown = DocumentSession.NormalizeLineEndings(markdown);
        var document = Markdown.Parse(markdown, Pipeline);
        return new(RenderBody(document, options), options.Css,
            new System.Globalization.StringInfo(markdown).LengthInTextElements, markdown.Count(c => c == '\n') + 1,
            document.Descendants<LinkInline>().Count(x => x.IsImage),
            document.Descendants<FencedCodeBlock>().Count(x => string.Equals(x.Info, "mermaid", StringComparison.OrdinalIgnoreCase)));
    }

    public static string RenderShell(PreviewContent? content = null)
    {
        // A custom stylesheet is CSS, never a way to break out into HTML/script.
        var css = (content?.Css ?? "").Replace("</", "<\\/", StringComparison.Ordinal);
        return "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">" +
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
            "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; img-src https: http: data: blob:; font-src data:; connect-src 'none'; base-uri https:\">" +
            "<base href=\"https://wxtyper.example/\"><style>" + Resources.Read("preview.css") + "</style><style id=\"theme-style\">" + css +
            "</style></head><body><div class=\"wechat-content\">" + (content?.Body ?? "") +
            "</div><script>" + Resources.Read("preview.js") + "</script></body></html>";
    }

    public static string ImageUrl(string value, RenderOptions options)
    {
        if (Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" or "data") return value;
        if (value.Contains(':') || value.StartsWith("//")) return "";
        var clean = value.StartsWith("./") ? value[2..] : value;
        var assets = options.AssetsDirectory.Trim().Trim('/').Replace('\\', '/');
        if (clean.StartsWith(assets + "/", StringComparison.OrdinalIgnoreCase)) return clean;
        var prefix = options.ImagePrefix.Trim().TrimEnd('/');
        return string.IsNullOrEmpty(prefix) ? value : prefix + "/" + value.TrimStart('/');
    }

    private sealed class WeChatLinkRenderer(RenderOptions options, List<string> footnotes) : HtmlObjectRenderer<LinkInline>
    {
        protected override void Write(HtmlRenderer renderer, LinkInline link)
        {
            if (link.IsImage)
            {
                renderer.Write("<img src=\"").Write(WebUtility.HtmlEncode(ImageUrl(link.Url ?? "", options))).Write("\" alt=\"");
                var alt = string.Concat(link.Descendants().Select(node => node switch
                { LiteralInline literal => literal.Content.ToString(), CodeInline code => code.Content, _ => "" }));
                renderer.Write(WebUtility.HtmlEncode(alt));
                renderer.Write("\">");
            }
            else
            {
                renderer.WriteChildren(link);
                footnotes.Add(link.Url ?? "");
                renderer.Write(" <span class=\"footnote-ref\">").Write(footnotes.Count.ToString()).Write("</span>");
            }
        }
    }
    private sealed class MermaidRenderer : HtmlObjectRenderer<FencedCodeBlock>
    {
        protected override void Write(HtmlRenderer renderer, FencedCodeBlock block)
        {
            if (string.Equals(block.Info, "mermaid", StringComparison.OrdinalIgnoreCase))
                renderer.Write("<div class=\"mermaid\">").Write(WebUtility.HtmlEncode(block.Lines.ToString())).WriteLine("</div>");
            else
                new CodeBlockRenderer().Write(renderer, block);
        }
    }
}
