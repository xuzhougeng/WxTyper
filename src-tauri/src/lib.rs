use once_cell::sync::OnceCell;
use pulldown_cmark::{html, Options, Parser};
use regex::Regex;
use reqwest::{multipart, Client};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use base64::{Engine as _, engine::general_purpose};

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

#[derive(Serialize)]
struct ChatCompletionRequestMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatCompletionRequestMessage>,
    max_tokens: u32,
    temperature: f32,
}

#[derive(Deserialize)]
struct ChatCompletionResponseMessage {
    content: String,
}

#[derive(Deserialize)]
struct ChatCompletionChoice {
    message: ChatCompletionResponseMessage,
}

#[derive(Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatCompletionChoice>,
}

#[derive(Deserialize)]
struct WechatTokenResponse {
    access_token: Option<String>,
    expires_in: Option<i64>,
    errcode: Option<i32>,
    errmsg: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct WechatUploadResponse {
    media_id: Option<String>,
    url: Option<String>,
    errcode: Option<i32>,
    errmsg: Option<String>,
}

// Gemini API structures
#[derive(Serialize)]
struct GeminiImageRequest {
    instances: Vec<GeminiImageInstance>,
    parameters: GeminiImageParameters,
}

#[derive(Serialize)]
struct GeminiImageInstance {
    prompt: String,
}

#[derive(Serialize)]
struct GeminiImageParameters {
    #[serde(rename = "sampleCount")]
    sample_count: u32,
}

#[derive(Deserialize, Debug)]
struct GeminiImageResponse {
    predictions: Vec<GeminiPrediction>,
}

#[derive(Deserialize, Debug)]
struct GeminiPrediction {
    #[serde(rename = "bytesBase64Encoded")]
    bytes_base64_encoded: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct WechatUploadResultEntry {
    original_url: String,
    wechat_url: String,
    media_id: String,
}

#[derive(Serialize)]
struct WechatUploadResult {
    markdown: String,
    items: Vec<WechatUploadResultEntry>,
}

struct WechatTokenCache {
    access_token: String,
    expires_at: Instant,
}

static WECHAT_TOKEN_CACHE: OnceCell<Mutex<Option<WechatTokenCache>>> = OnceCell::new();

async fn get_wechat_access_token(client: &Client, app_id: &str, app_secret: &str) -> Result<String, String> {
    let now = Instant::now();
    let cache_cell = WECHAT_TOKEN_CACHE.get_or_init(|| Mutex::new(None));

    {
        let guard = cache_cell
            .lock()
            .map_err(|_| "无法获取 access_token 缓存锁".to_string())?;
        if let Some(cache) = guard.as_ref() {
            if cache.expires_at > now {
                return Ok(cache.access_token.clone());
            }
        }
    }

    let token_resp = client
        .get("https://api.weixin.qq.com/cgi-bin/token")
        .query(&[
            ("grant_type", "client_credential"),
            ("appid", app_id),
            ("secret", app_secret),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let token_body: WechatTokenResponse = token_resp.json().await.map_err(|e| e.to_string())?;

    if let Some(code) = token_body.errcode {
        if code != 0 {
            return Err(format!(
                "获取 access_token 失败: {} - {}",
                code,
                token_body.errmsg.unwrap_or_default()
            ));
        }
    }

    let access_token = token_body
        .access_token
        .ok_or_else(|| "未从微信返回中获取到 access_token".to_string())?;

    let expires_in = token_body.expires_in.unwrap_or(7200).max(60) as u64;
    let valid_for = expires_in.saturating_sub(60);
    let expires_at = now + Duration::from_secs(valid_for);

    {
        let mut guard = cache_cell
            .lock()
            .map_err(|_| "无法获取 access_token 缓存锁".to_string())?;
        *guard = Some(WechatTokenCache {
            access_token: access_token.clone(),
            expires_at,
        });
    }

    Ok(access_token)
}

#[tauri::command]
async fn generate_summary(
    markdown: String,
    apiBaseUrl: Option<String>,
    apiToken: Option<String>,
    apiModel: Option<String>,
) -> Result<String, String> {
    // 只使用用户配置的值，不回退到环境变量
    let api_key = apiToken
        .and_then(|s| {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
        .ok_or_else(|| "请先在设置页配置 OpenAI Token".to_string())?;

    let base_url = apiBaseUrl
        .and_then(|s| {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
        .unwrap_or_else(|| "https://api.deepseek.com/v1".to_string());

    let model = apiModel
        .and_then(|s| {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
        .unwrap_or_else(|| "deepseek-chat".to_string());

    let prompt = format!(
        "请根据以下微信公众号 Markdown 内容生成一个中文摘要，不超过100个汉字，不要换行，只输出摘要内容：\n\n{}",
        markdown
    );

    let request_body = ChatCompletionRequest {
        model,
        messages: vec![ChatCompletionRequestMessage {
            role: "user".to_string(),
            content: prompt,
        }],
        max_tokens: 200,
        temperature: 0.3,
    };

    let client = Client::new();
    let url = format!(
        "{}/chat/completions",
        base_url.trim_end_matches('/')
    );

    let response = client
        .post(url)
        .bearer_auth(api_key)
        .json(&request_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, text));
    }

    let parsed: ChatCompletionResponse = response.json().await.map_err(|e| e.to_string())?;

    let content = parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content.trim().to_string())
        .ok_or_else(|| "Empty response from AI".to_string())?;

    let mut truncated = String::new();
    for (idx, ch) in content.chars().enumerate() {
        if idx >= 100 {
            break;
        }
        truncated.push(ch);
    }

    Ok(truncated)
}

#[tauri::command]
async fn test_openai_config(
    apiBaseUrl: Option<String>,
    apiToken: Option<String>,
    apiModel: Option<String>,
) -> Result<String, String> {
    // 构建诊断信息
    let token_debug = match &apiToken {
        Some(t) => format!("Some(length={})", t.len()),
        None => "None".to_string(),
    };
    let url_debug = match &apiBaseUrl {
        Some(u) => format!("Some('{}')", u),
        None => "None".to_string(),
    };
    let model_debug = match &apiModel {
        Some(m) => format!("Some('{}')", m),
        None => "None".to_string(),
    };
    
    // 只使用用户配置的值，不回退到环境变量
    let api_key = apiToken
        .and_then(|s| {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
        .ok_or_else(|| {
            format!(
                "后端收到的参数: apiToken={}, apiBaseUrl={}, apiModel={}. Token 为 None 或空字符串，请检查前端传递的参数。",
                token_debug, url_debug, model_debug
            )
        })?;

    let base_url = apiBaseUrl
        .and_then(|s| {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
        .unwrap_or_else(|| "https://api.deepseek.com/v1".to_string());

    let model = apiModel
        .and_then(|s| {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
        .unwrap_or_else(|| "deepseek-chat".to_string());

    let prompt = "请仅回复大写字母 OK".to_string();

    let request_body = ChatCompletionRequest {
        model: model.clone(),
        messages: vec![ChatCompletionRequestMessage {
            role: "user".to_string(),
            content: prompt,
        }],
        max_tokens: 5,
        temperature: 0.0,
    };

    let client = Client::new();
    let url = format!(
        "{}/chat/completions",
        base_url.trim_end_matches('/')
    );

    let response = client
        .post(url)
        .bearer_auth(api_key)
        .json(&request_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, text));
    }

    let parsed: ChatCompletionResponse = response.json().await.map_err(|e| e.to_string())?;

    let content = parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content.trim().to_string())
        .ok_or_else(|| "Empty response from AI".to_string())?;

    if content.to_uppercase().contains("OK") {
        Ok(format!("OpenAI 接口测试成功，model = {}", model))
    } else {
        Ok(format!("OpenAI 接口可访问，但返回内容非预期: {}", content))
    }
}

#[tauri::command]
async fn wechat_upload_and_replace_images(
    markdown: String,
    appId: String,
    appSecret: String,
    baseDir: Option<String>,
    sitePrefix: Option<String>,
) -> Result<WechatUploadResult, String> {
    let app_id = {
        let trimmed = appId.trim();
        if !trimmed.is_empty() {
            trimmed.to_string()
        } else if let Ok(env_id) = std::env::var("WECHAT_APP_ID") {
            env_id
        } else {
            return Err("微信公众号 APPID 未配置".to_string());
        }
    };

    let app_secret = {
        let trimmed = appSecret.trim();
        if !trimmed.is_empty() {
            trimmed.to_string()
        } else if let Ok(env_secret) = std::env::var("WECHAT_APP_SECRET") {
            env_secret
        } else {
            return Err("微信公众号 APPSECRET 未配置".to_string());
        }
    };

    let client = Client::new();

    let access_token = get_wechat_access_token(&client, &app_id, &app_secret).await?;

    let re = Regex::new(r"!\[[^\]]*]\(([^)]+)\)").map_err(|e| e.to_string())?;
    let mut unique_urls: HashSet<String> = HashSet::new();
    for caps in re.captures_iter(&markdown) {
        if let Some(m) = caps.get(1) {
            unique_urls.insert(m.as_str().to_string());
        }
    }

    if unique_urls.is_empty() {
        return Ok(WechatUploadResult {
            markdown,
            items: Vec::new(),
        });
    }

    let base_dir_path: Option<PathBuf> = baseDir.map(PathBuf::from);

    let mut existing_entries: HashMap<String, WechatUploadResultEntry> = HashMap::new();
    let mut new_entries: Vec<WechatUploadResultEntry> = Vec::new();

    if let Some(dir) = &base_dir_path {
        let mut log_path = dir.clone();
        log_path.push("wechat_media_log.jsonl");
        if let Ok(file) = File::open(&log_path) {
            let reader = BufReader::new(file);
            for line in reader.lines() {
                if let Ok(line) = line {
                    if line.trim().is_empty() {
                        continue;
                    }
                    if let Ok(entry) = serde_json::from_str::<WechatUploadResultEntry>(&line) {
                        existing_entries.insert(entry.original_url.clone(), entry);
                    }
                }
            }
        }
    }

    let mut result_entries: Vec<WechatUploadResultEntry> = Vec::new();

    for url in unique_urls.iter() {
        if let Some(existing) = existing_entries.get(url) {
            result_entries.push(WechatUploadResultEntry {
                original_url: existing.original_url.clone(),
                wechat_url: existing.wechat_url.clone(),
                media_id: existing.media_id.clone(),
            });
            continue;
        }

        let is_remote = url.starts_with("http://") || url.starts_with("https://");

        let (bytes, filename) = if is_remote {
            // 直接下载远程图片
            let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
            if !resp.status().is_success() {
                return Err(format!("下载远程图片失败 {}: {}", url, resp.status()));
            }
            let body = resp.bytes().await.map_err(|e| e.to_string())?;
            let name = url
                .split('/')
                .last()
                .filter(|s| !s.is_empty())
                .unwrap_or("image.png")
                .to_string();

            let bytes_vec = body.to_vec();

            if let Some(dir) = &base_dir_path {
                let mut assets_dir = dir.clone();
                assets_dir.push("assets");
                if let Err(e) = std::fs::create_dir_all(&assets_dir) {
                    eprintln!("创建 assets 目录失败 {}: {}", assets_dir.display(), e);
                } else {
                    let mut local_path = assets_dir.clone();
                    local_path.push(&name);
                    if let Err(e) = std::fs::write(&local_path, &bytes_vec) {
                        eprintln!("保存下载图片到本地失败 {}: {}", local_path.display(), e);
                    }
                }
            }

            (bytes_vec, name)
        } else {
            // 先尝试作为本地路径读取
            let path = if let Some(dir) = &base_dir_path {
                dir.join(url)
            } else {
                PathBuf::from(url)
            };
            
            match std::fs::read(&path) {
                Ok(data) => {
                    // 本地读取成功
                    let name = path
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("image.png")
                        .to_string();
                    (data, name)
                }
                Err(local_err) => {
                    // 本地读取失败，尝试用 sitePrefix + url 下载
                    if let Some(prefix) = &sitePrefix {
                        let prefix_trimmed = prefix.trim();
                        if !prefix_trimmed.is_empty() {
                            let full_url = format!("{}{}", prefix_trimmed.trim_end_matches('/'), url);
                            match client.get(&full_url).send().await {
                                Ok(resp) if resp.status().is_success() => {
                                    let body = resp.bytes().await.map_err(|e| e.to_string())?;
                                    let name = url
                                        .split('/')
                                        .last()
                                        .filter(|s| !s.is_empty())
                                        .unwrap_or("image.png")
                                        .to_string();

                                    let bytes_vec = body.to_vec();

                                    if let Some(dir) = &base_dir_path {
                                        let mut assets_dir = dir.clone();
                                        assets_dir.push("assets");
                                        if let Err(e) = std::fs::create_dir_all(&assets_dir) {
                                            eprintln!("创建 assets 目录失败 {}: {}", assets_dir.display(), e);
                                        } else {
                                            let mut local_path = assets_dir.clone();
                                            local_path.push(&name);
                                            if let Err(e) = std::fs::write(&local_path, &bytes_vec) {
                                                eprintln!("保存下载图片到本地失败 {}: {}", local_path.display(), e);
                                            }
                                        }
                                    }

                                    (bytes_vec, name)
                                }
                                Ok(resp) => {
                                    return Err(format!(
                                        "读取本地图片失败 {}: {}；尝试下载 {} 也失败: HTTP {}",
                                        path.display(), local_err, full_url, resp.status()
                                    ));
                                }
                                Err(download_err) => {
                                    return Err(format!(
                                        "读取本地图片失败 {}: {}；尝试下载 {} 也失败: {}",
                                        path.display(), local_err, full_url, download_err
                                    ));
                                }
                            }
                        } else {
                            return Err(format!("读取本地图片失败 {}: {}", path.display(), local_err));
                        }
                    } else {
                        return Err(format!("读取本地图片失败 {}: {}（未配置网站前缀，无法尝试下载）", path.display(), local_err));
                    }
                }
            }
        };

        let part = multipart::Part::bytes(bytes).file_name(filename);
        let form = multipart::Form::new().part("media", part);

        let upload_url = format!(
            "https://api.weixin.qq.com/cgi-bin/material/add_material?access_token={}&type=image",
            access_token
        );

        let upload_resp = client
            .post(&upload_url)
            .multipart(form)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = upload_resp.status();
        let upload_body: WechatUploadResponse = upload_resp.json().await.map_err(|e| e.to_string())?;

        if let Some(code) = upload_body.errcode {
            if code != 0 {
                return Err(format!(
                    "上传图片到微信失败 {}: {} - {}",
                    url,
                    code,
                    upload_body.errmsg.unwrap_or_default()
                ));
            }
        }

        if !status.is_success() {
            return Err(format!("上传图片到微信失败 {}: {}", url, status));
        }

        let media_id = upload_body
            .media_id
            .ok_or_else(|| "微信返回中缺少 media_id".to_string())?;
        let wechat_url = upload_body
            .url
            .ok_or_else(|| "微信返回中缺少 url".to_string())?;

        let entry = WechatUploadResultEntry {
            original_url: url.clone(),
            wechat_url,
            media_id,
        };
        new_entries.push(entry.clone());
        result_entries.push(entry);
    }

    let mut updated_markdown = markdown.clone();
    for entry in &result_entries {
        updated_markdown = updated_markdown.replace(&entry.original_url, &entry.wechat_url);
    }

    if let Some(dir) = &base_dir_path {
        let mut log_path = dir.clone();
        log_path.push("wechat_media_log.jsonl");
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
        {
            for entry in &new_entries {
                if let Ok(line) = serde_json::to_string(entry) {
                    let _ = writeln!(file, "{}", line);
                }
            }
        }
    }

    Ok(WechatUploadResult {
        markdown: updated_markdown,
        items: result_entries,
    })
}

#[tauri::command]
async fn localize_images_to_assets(
    markdown: String,
    baseDir: Option<String>,
    sitePrefix: Option<String>,
    assetsDir: Option<String>,
) -> Result<String, String> {
    let assets_dir_name = assetsDir.unwrap_or_else(|| "assets".to_string());
    
    let base_dir_path = if let Some(dir) = baseDir {
        PathBuf::from(dir)
    } else {
        return Err(format!("当前文件尚未保存，无法确定 {} 目录", assets_dir_name));
    };

    let re = Regex::new(r"!\[[^\]]*]\(([^)]+)\)").map_err(|e| e.to_string())?;
    let client = Client::new();

    let mut url_map: HashMap<String, String> = HashMap::new();

    for caps in re.captures_iter(&markdown) {
        let url = if let Some(m) = caps.get(1) {
            m.as_str().to_string()
        } else {
            continue;
        };

        if url_map.contains_key(&url) {
            continue;
        }

        let assets_dir_prefix = format!("{}/", assets_dir_name);
        if url.starts_with(&assets_dir_prefix) {
            url_map.insert(url.clone(), url.clone());
            continue;
        }

        let is_http = url.starts_with("http://") || url.starts_with("https://");

        let mut bytes_opt: Option<Vec<u8>> = None;
        let mut filename_opt: Option<String> = None;

        if is_http {
            let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
            if !resp.status().is_success() {
                return Err(format!("下载远程图片失败 {}: {}", url, resp.status()));
            }
            let body = resp.bytes().await.map_err(|e| e.to_string())?;
            let name = url
                .split('/')
                .last()
                .filter(|s| !s.is_empty())
                .unwrap_or("image.png")
                .to_string();
            bytes_opt = Some(body.to_vec());
            filename_opt = Some(name);
        } else if let Some(prefix) = &sitePrefix {
            let trimmed = prefix.trim();
            if !trimmed.is_empty() {
                let full_url = format!("{}{}", trimmed.trim_end_matches('/'), url);
                let resp = client.get(&full_url).send().await.map_err(|e| e.to_string())?;
                if !resp.status().is_success() {
                    return Err(format!(
                        "下载远程图片失败 {}: {}",
                        full_url,
                        resp.status()
                    ));
                }
                let body = resp.bytes().await.map_err(|e| e.to_string())?;
                let name = url
                    .split('/')
                    .last()
                    .filter(|s| !s.is_empty())
                    .unwrap_or("image.png")
                    .to_string();
                bytes_opt = Some(body.to_vec());
                filename_opt = Some(name);
            } else {
                url_map.insert(url.clone(), url.clone());
                continue;
            }
        } else {
            url_map.insert(url.clone(), url.clone());
            continue;
        }

        if let (Some(bytes), Some(filename)) = (bytes_opt, filename_opt) {
            let mut assets_dir = base_dir_path.clone();
            assets_dir.push(&assets_dir_name);
            std::fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;

            let mut local_path = assets_dir.clone();
            local_path.push(&filename);
            std::fs::write(&local_path, &bytes).map_err(|e| e.to_string())?;

            let new_url = format!("{}/{}", assets_dir_name, filename);
            url_map.insert(url.clone(), new_url);
        }
    }

    let mut updated = markdown.clone();
    for (old, new_url) in url_map.into_iter() {
        if old != new_url {
            updated = updated.replace(&old, &new_url);
        }
    }

    Ok(updated)
}

#[tauri::command]
async fn test_wechat_access_token(
    appId: String,
    appSecret: String,
) -> Result<String, String> {
    let app_id = {
        let trimmed = appId.trim();
        if !trimmed.is_empty() {
            trimmed.to_string()
        } else if let Ok(env_id) = std::env::var("WECHAT_APP_ID") {
            env_id
        } else {
            return Err("微信公众号 APPID 未配置".to_string());
        }
    };

    let app_secret = {
        let trimmed = appSecret.trim();
        if !trimmed.is_empty() {
            trimmed.to_string()
        } else if let Ok(env_secret) = std::env::var("WECHAT_APP_SECRET") {
            env_secret
        } else {
            return Err("微信公众号 APPSECRET 未配置".to_string());
        }
    };

    let client = Client::new();
    let token = get_wechat_access_token(&client, &app_id, &app_secret).await?;

    let short = if token.len() > 12 {
        format!("{}...{}", &token[..6], &token[token.len() - 4..])
    } else {
        token.clone()
    };

    Ok(format!("access_token 获取成功（部分）: {}", short))
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

#[tauri::command]
fn save_binary_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_directory(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn generate_cover_image(
    markdown: String,
    gemini_api_key: Option<String>,
    gemini_api_url: Option<String>,
    gemini_model: Option<String>,
    base_dir: Option<String>,
    assets_dir: String,
) -> Result<String, String> {
    // 验证API key
    let api_key = gemini_api_key
        .and_then(|s| {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
        .ok_or_else(|| "请先在设置页配置 Gemini API Key".to_string())?;

    // 获取API端点，默认为Google的官方端点
    let base_url = gemini_api_url
        .and_then(|s| {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
        .unwrap_or_else(|| "https://generativelanguage.googleapis.com/v1beta/models".to_string());

    // 获取模型名称，默认为imagen-3.0-generate-001
    let model_name = gemini_model
        .and_then(|s| {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
        .unwrap_or_else(|| "imagen-3.0-generate-001".to_string());

    // 从markdown内容生成提示词
    let prompt = generate_image_prompt_from_markdown(&markdown);
    
    // 调用Gemini Imagen API
    let request_body = GeminiImageRequest {
        instances: vec![GeminiImageInstance {
            prompt: prompt.clone(),
        }],
        parameters: GeminiImageParameters {
            sample_count: 1,
        },
    };

    let client = Client::new();
    // 构建完整的API URL，确保base_url和model_name之间有斜杠分隔
    let url = format!("{}/{}:predict", 
        base_url.trim_end_matches('/'), 
        model_name.trim_start_matches('/'));

    let response = client
        .post(url)
        .header("x-goog-api-key", api_key)
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("API返回错误 {}: {}", status, text));
    }

    let parsed: GeminiImageResponse = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    if parsed.predictions.is_empty() {
        return Err("API未返回图片".to_string());
    }

    // 解码base64图片
    let image_base64 = &parsed.predictions[0].bytes_base64_encoded;
    let image_bytes = general_purpose::STANDARD
        .decode(image_base64)
        .map_err(|e| format!("解码图片失败: {}", e))?;

    // 确定保存路径
    let base_path = base_dir.ok_or_else(|| "请先保存Markdown文件".to_string())?;
    let sep = if base_path.contains("\\") { "\\" } else { "/" };
    let target_dir = format!("{}{}{}", base_path, sep, assets_dir);

    // 创建目录
    std::fs::create_dir_all(&target_dir).map_err(|e| format!("创建目录失败: {}", e))?;

    // 生成文件名
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let filename = format!("cover-{}.png", timestamp);
    let full_path = format!("{}{}{}", target_dir, sep, filename);

    // 保存文件
    std::fs::write(&full_path, image_bytes).map_err(|e| format!("保存文件失败: {}", e))?;

    // 返回相对路径
    let relative_path = format!("{}/{}", assets_dir, filename);
    Ok(relative_path)
}

fn generate_image_prompt_from_markdown(markdown: &str) -> String {
    // 提取标题和关键信息生成图片提示词
    let lines: Vec<&str> = markdown.lines().collect();
    let mut title = String::new();
    let mut content_preview = String::new();
    
    for line in lines.iter() {
        let trimmed = line.trim();
        if trimmed.starts_with("# ") && title.is_empty() {
            title = trimmed.trim_start_matches("# ").to_string();
        } else if !trimmed.is_empty() && !trimmed.starts_with("#") && content_preview.len() < 100 {
            content_preview.push_str(trimmed);
            content_preview.push(' ');
        }
    }
    
    if title.is_empty() {
        title = "微信公众号文章".to_string();
    }
    
    // 生成简洁的英文提示词，适合生成微信公众号题图
    format!(
        "Create a clean, modern, minimalist cover image for a WeChat article titled '{}'. The image should be professional, eye-catching, and suitable for social media. Use a 16:9 aspect ratio with vibrant colors and simple geometric shapes. No text in the image.",
        title
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            convert_markdown,
            open_markdown_file,
            save_markdown_file,
            save_binary_file,
            create_directory,
            generate_summary,
            generate_cover_image,
            wechat_upload_and_replace_images,
            test_openai_config,
            test_wechat_access_token,
            localize_images_to_assets
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
