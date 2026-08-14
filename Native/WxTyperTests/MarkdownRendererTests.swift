import XCTest
@testable import WxTyper

final class MarkdownRendererTests: XCTestCase {
    private let options = MarkdownRenderOptions(
        css: "h1 { color: red; }",
        imagePrefix: "https://cdn.example.com",
        assetsDirectory: "assets",
        baseURL: nil
    )

    func testRendersWechatMarkdownFeatures() {
        let markdown = """
        # 标题

        **重点**、~~删除~~与[链接](https://example.com)。

        | 名称 | 值 |
        | --- | --- |
        | A | 1 |
        """
        let html = MarkdownRenderer.render(markdown, options: options)
        XCTAssertTrue(html.contains("<h1>标题</h1>"))
        XCTAssertTrue(html.contains("<strong>重点</strong>"))
        XCTAssertTrue(html.contains("<del>删除</del>"))
        XCTAssertTrue(html.contains("<table>"))
        XCTAssertTrue(html.contains("https://example.com"))
        XCTAssertTrue(html.contains("footnote-ref"))
    }

    func testImagePrefixSkipsAssetsAndRemoteImages() {
        let markdown = """
        ![相对](/upload/a.png)
        ![本地](assets/b.png)
        ![远程](https://images.example.com/c.png)
        """
        let html = MarkdownRenderer.render(markdown, options: options)
        XCTAssertTrue(html.contains("https://cdn.example.com/upload/a.png"))
        XCTAssertTrue(html.contains("src=\"assets/b.png\""))
        XCTAssertTrue(html.contains("src=\"https://images.example.com/c.png\""))
    }

    func testMermaidGetsNativePreviewBridgeHooks() {
        let html = MarkdownRenderer.render("```mermaid\ngraph TD; A-->B;\n```", options: options)
        XCTAssertTrue(html.contains("class=\"mermaid\""))
        XCTAssertTrue(html.contains("wxtyperExportMermaid"))
        XCTAssertTrue(html.contains("wxtyperCopyHTML"))
    }

    func testFindsMarkdownImages() {
        XCTAssertEqual(ImageService.markdownImageReferences(in: "![a](one.png)\n![b](https://x.test/two.jpg)"), ["one.png", "https://x.test/two.jpg"])
    }
}
