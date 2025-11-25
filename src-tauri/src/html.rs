/// Convert HTML links to footnotes for WeChat compatibility
pub fn convert_links_to_footnotes(html: &str) -> String {
    let mut footnotes = Vec::new();
    let mut footnote_counter = 1;
    let mut result = html.to_string();
    let mut pos = 0;

    while let Some(start_pos) = result[pos..].find("<a href=") {
        let actual_start = pos + start_pos;

        if let Some(tag_end) = result[actual_start..].find('>') {
            let tag_end_pos = actual_start + tag_end + 1;

            if let Some(link_end) = result[tag_end_pos..].find("</a>") {
                let link_end_pos = tag_end_pos + link_end + 4;
                let link_tag = &result[actual_start..tag_end_pos];
                let link_text = &result[tag_end_pos..link_end_pos - 4];

                if let Some(href_start) = link_tag.find("href=\"") {
                    let href_start_pos = href_start + 6;
                    if let Some(href_end) = link_tag[href_start_pos..].find("\"") {
                        let url = &link_tag[href_start_pos..href_start_pos + href_end];
                        let footnote_ref =
                            format!("<span class=\"footnote-ref\">{}</span>", footnote_counter);
                        footnotes.push((footnote_counter, url.to_string()));
                        let replacement = format!("{} {}", link_text, footnote_ref);
                        result.replace_range(actual_start..link_end_pos, &replacement);
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

    if !footnotes.is_empty() {
        result.push_str("<div class=\"footnotes\">\n<ol>\n");
        for (_, url) in footnotes {
            result.push_str(&format!(
                "<li><span class=\"footnote-url\">{}</span></li>\n",
                url
            ));
        }
        result.push_str("</ol>\n</div>");
    }

    result
}

/// Replace mermaid code blocks with mermaid div elements
pub fn replace_mermaid_blocks(input_html: &str) -> (String, bool) {
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
            output.push_str(START);
            output.push_str(rest);
            return (output, has_mermaid);
        }
    }

    output.push_str(remaining);
    (output, has_mermaid)
}
