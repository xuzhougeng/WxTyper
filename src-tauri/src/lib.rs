use pulldown_cmark::{html, Options, Parser};

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

    // 2. Inline CSS
    // Wrap in a full HTML structure for css-inline
    let html_with_css = format!(
        r#"<!DOCTYPE html>
<html>
<head>
<style>
{}
</style>
</head>
<body>
<div class="wechat-content">
{}
</div>
</body>
</html>"#,
        css, html_output
    );
    
    let inlined_html = css_inline::inline(&html_with_css).map_err(|e| e.to_string())?;
    
    Ok(inlined_html)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![convert_markdown])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
