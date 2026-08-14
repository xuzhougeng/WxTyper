import Foundation

enum SampleDocument {
    static let markdown = """
    # WxTyper Markdown 示例

    这是一个 **微信公众号排版** 的 Markdown 示例，包含常见语法。

    ## 列表

    - 无序列表项 1
    - 无序列表项 2

    1. 有序列表 1
    2. 有序列表 2

    ## 引用

    > 这是一段引用文字，用来展示 blockquote 样式。

    ## 行内代码与代码块

    行内代码示例：`xcodebuild -project WxTyper.xcodeproj -scheme WxTyper build`

    ```swift
    struct Hello: View {
        var body: some View { Text("Hello, WeChat") }
    }
    ```

    ## Mermaid

    ```mermaid
    graph TD;
        A[Markdown]-->B[WxTyper];
        B-->C[微信公众号];
    ```

    ## 表格

    | 功能 | 描述 |
    | ---- | ---- |
    | 主题 | 多套微信风格主题 |
    | 图片前缀 | 支持统一 CDN 前缀 |

    更多内容请访问 [WxTyper](https://github.com/xuzhougeng/WxTyper)。
    """
}
