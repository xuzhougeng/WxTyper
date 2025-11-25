mod css;
mod file;
mod gemini;
mod html;
mod image;
mod models;
mod openai;
mod wechat;

use pulldown_cmark::{html as md_html, Options, Parser};

use css::get_fallback_css;
use html::{convert_links_to_footnotes, replace_mermaid_blocks};

#[tauri::command]
fn convert_markdown(content: String, css: String) -> Result<String, String> {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);

    let parser = Parser::new_ext(&content, options);
    let mut html_output = String::new();
    md_html::push_html(&mut html_output, parser);

    let (html_output, has_mermaid) = replace_mermaid_blocks(&html_output);
    let html_output = convert_links_to_footnotes(&html_output);

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

    let fallback_css = get_fallback_css();
    let combined_css = format!("{}\n{}", fallback_css, css);

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
        combined_css, mermaid_scripts, html_output
    );

    let inlined_html = css_inline::inline(&html_with_css).map_err(|e| e.to_string())?;
    Ok(inlined_html)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            convert_markdown,
            file::open_markdown_file,
            file::save_markdown_file,
            file::save_binary_file,
            file::create_directory,
            openai::generate_summary,
            openai::test_openai_config,
            gemini::generate_cover_image,
            wechat::wechat_upload_and_replace_images,
            wechat::test_wechat_access_token,
            image::localize_images_to_assets
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
