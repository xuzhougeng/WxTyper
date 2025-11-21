use pulldown_cmark::{html, Options, Parser};

fn get_fallback_css() -> &'static str {
    r#"
/* Fallback styles for custom CSS themes */
.wechat-content {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  color: #333;
  word-wrap: break-word;
  padding: 16px;
}

h1 {
  font-size: 24px;
  font-weight: bold;
  margin-top: 20px;
  margin-bottom: 10px;
  border-bottom: 1px solid #eaeaea;
  padding-bottom: 5px;
}

h2 {
  font-size: 20px;
  font-weight: bold;
  margin-top: 18px;
  margin-bottom: 10px;
  border-left: 4px solid #07c160;
  padding-left: 10px;
}

h3 {
  font-size: 18px;
  font-weight: bold;
  margin-top: 16px;
  margin-bottom: 10px;
}

p {
  margin-bottom: 16px;
  text-align: justify;
}

blockquote {
  margin: 16px 0;
  padding: 10px 16px;
  background-color: #f7f7f7;
  border-left: 4px solid #d0d0d0;
  color: #666;
  font-size: 15px;
}

ul, ol {
  margin-bottom: 16px;
  padding-left: 24px;
}

li {
  margin-bottom: 4px;
}

img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 16px auto;
  border-radius: 4px;
}

code {
  font-family: Consolas, Monaco, "Courier New", monospace;
  background-color: #f0f0f0;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 14px;
  color: #d63384;
}

pre {
  background-color: #f6f8fa;
  padding: 16px;
  overflow: auto;
  border-radius: 4px;
  margin-bottom: 16px;
}

pre code {
  background-color: transparent;
  padding: 0;
  color: #333;
  font-size: 13px;
}

a {
  color: #576b95;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

table {
  border-collapse: collapse;
  width: 100%;
  margin-bottom: 16px;
  font-size: 14px;
}

th, td {
  border: 1px solid #dfe2e5;
  padding: 6px 13px;
}

th {
  background-color: #f2f2f2;
  font-weight: bold;
}

tr:nth-child(2n) {
  background-color: #f8f8f8;
}

/* Footnote styles - IMPORTANT: Always include these */
.footnote-ref {
  color: #07c160;
  font-size: 0.8em;
  vertical-align: super;
  margin: 0 2px;
  font-weight: bold;
}

.footnotes {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #eaeaea;
  font-size: 14px;
}

.footnotes ol {
  padding-left: 20px;
  margin: 0;
}

.footnotes li {
  margin-bottom: 8px;
  color: #666;
}

.footnote-url {
  color: #576b95;
  word-break: break-all;
}
"#
}

fn convert_links_to_footnotes(html: &str) -> String {
    let mut footnotes = Vec::new();
    let mut footnote_counter = 1;
    
    // Use a simple regex-based approach to find and replace links
    // This is more reliable than parsing HTML with regex for this simple case
    let mut result = html.to_string();
    
    // Find all <a href="...">...</a> patterns
    let mut pos = 0;
    while let Some(start_pos) = result[pos..].find("<a href=") {
        let actual_start = pos + start_pos;
        
        // Find the end of the opening tag
        if let Some(tag_end) = result[actual_start..].find('>') {
            let tag_end_pos = actual_start + tag_end + 1;
            
            // Find the closing </a> tag
            if let Some(link_end) = result[tag_end_pos..].find("</a>") {
                let link_end_pos = tag_end_pos + link_end + 4;
                
                // Extract the full link tag
                let link_tag = &result[actual_start..tag_end_pos];
                let link_text = &result[tag_end_pos..link_end_pos - 4];
                
                // Extract URL from href attribute
                if let Some(href_start) = link_tag.find("href=\"") {
                    let href_start_pos = href_start + 6;
                    if let Some(href_end) = link_tag[href_start_pos..].find("\"") {
                        let url = &link_tag[href_start_pos..href_start_pos + href_end];
                        
                        // Replace with footnote format
                        let footnote_ref = format!("<span class=\"footnote-ref\">{}</span>", footnote_counter);
                        footnotes.push((footnote_counter, url.to_string()));
                        
                        // Replace the link with text + footnote reference
                        let replacement = format!("{} {}", link_text, footnote_ref);
                        result.replace_range(actual_start..link_end_pos, &replacement);
                        
                        // Adjust position since we've modified the string
                        pos = actual_start + replacement.len();
                        footnote_counter += 1;
                        continue;
                    }
                }
                
                pos = link_end_pos;
            } else {
                break;
            }
        } else {
            break;
        }
    }
    
    // Add footnotes at the end if there are any
    if !footnotes.is_empty() {
        result.push_str("<div class=\"footnotes\">\n<ol>\n");
        for (_, url) in footnotes {
            result.push_str(&format!("<li><span class=\"footnote-url\">{}</span></li>\n", url));
        }
        result.push_str("</ol>\n</div>");
    }
    
    result
}

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
    
    // Convert links to footnotes
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

    // 2. Inline CSS
    // Combine fallback CSS with custom CSS (custom CSS takes precedence)
    let fallback_css = get_fallback_css();
    let combined_css = format!("{}\n{}", fallback_css, css);
    
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
        combined_css, mermaid_scripts, html_output
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
