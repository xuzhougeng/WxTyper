import Foundation

@main
enum RendererSmokeTests {
    static func main() {
        let options = MarkdownRenderOptions(
            css: "h1 { color: red; }",
            imagePrefix: "https://cdn.example.com",
            assetsDirectory: "assets",
            baseURL: nil
        )
        let markdown = """
        # 标题

        **重点**、~~删除~~与[链接](https://example.com)。

        ![相对](/upload/a.png)
        ![本地](assets/b.png)

        | 名称 | 值 |
        | --- | --- |
        | A | 1 |

        ```mermaid
        graph TD; A-->B;
        ```
        """
        let html = MarkdownRenderer.render(markdown, options: options)
        let expectations = [
            "<h1>标题</h1>",
            "<strong>重点</strong>",
            "<del>删除</del>",
            "<table>",
            "footnote-ref",
            "https://cdn.example.com/upload/a.png",
            "src=\"assets/b.png\"",
            "class=\"mermaid\"",
            "wxtyperExportMermaid",
            "wxtyperCopyHTML"
        ]
        for expected in expectations where !html.contains(expected) {
            fatalError("Renderer smoke test failed; missing: \(expected)")
        }
        print("Renderer smoke tests passed (\(expectations.count) assertions).")
    }
}
