use pulldown_cmark::{html, Options, Parser};

fn replace_mermaid_blocks(input_html: &str) -> (String, bool) {
    let mut output = String::with_capacity(input_html.len());
    let mut remaining = input_html;
    let mut has_mermaid = false;
    const START: &str = "<pre><code class=\"language-mermaid\">";
    const END: &str = "</code></pre>";

    while let Some(start_idx) = remaining.find(START) {
        has_mermaid = true;
        let (before, rest) = remaining.split_at(start_idx);
        output.push_str(before);
        let rest = &rest[START.len()..];
        if let Some(end_idx) = rest.find(END) {
            let (diagram, after) = rest.split_at(end_idx);
            output.push_str("<div class=\"mermaid\">");
            output.push_str(diagram);
            output.push_str("</div>");
            remaining = &after[END.len()..];
        } else {
            // unmatched, append remainder and break
            output.push_str(START);
            output.push_str(rest);
            return (output, has_mermaid);
        }
    }

    output.push_str(remaining);
    (output, has_mermaid)
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn convert_markdown(content: String, css: String) -> Result<String, String> {
    // 1. Parse Markdown to HTML
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);

    let parser = Parser::new_ext(&content, options);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);

    let (html_output, has_mermaid) = replace_mermaid_blocks(&html_output);

    let mermaid_scripts = if has_mermaid {
        r#"<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>
if (window.mermaid) {
  window.mermaid.initialize({ startOnLoad: true, securityLevel: "loose" });
}
</script>"#
    } else {
        ""
    };

    // 2. Inline CSS
    // Wrap in a full HTML structure for css-inline
    let html_with_css = format!(
        r#"<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
{}
</style>
{}
</head>
<body>
<div class="wechat-content">
{}
</div>
</body>
</html>"#,
        css, mermaid_scripts, html_output
    );
    
    let inlined_html = css_inline::inline(&html_with_css).map_err(|e| e.to_string())?;
    
    Ok(inlined_html)
}

#[tauri::command]
fn open_markdown_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_markdown_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            convert_markdown,
            open_markdown_file,
            save_markdown_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
