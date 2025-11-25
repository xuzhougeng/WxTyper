use base64::{engine::general_purpose, Engine as _};
use reqwest::Client;

use crate::models::{GeminiImageInstance, GeminiImageParameters, GeminiImageRequest, GeminiImageResponse};

#[tauri::command]
pub async fn generate_cover_image(
    markdown: String,
    gemini_api_key: Option<String>,
    gemini_api_url: Option<String>,
    gemini_model: Option<String>,
    base_dir: Option<String>,
    assets_dir: String,
) -> Result<String, String> {
    let api_key = gemini_api_key
        .and_then(|s| {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
        .ok_or_else(|| "请先在设置页配置 Gemini API Key".to_string())?;

    let base_url = gemini_api_url
        .and_then(|s| {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
        .unwrap_or_else(|| "https://generativelanguage.googleapis.com/v1beta/models".to_string());

    let model_name = gemini_model
        .and_then(|s| {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
        .unwrap_or_else(|| "imagen-3.0-generate-001".to_string());

    let prompt = generate_image_prompt_from_markdown(&markdown);

    let request_body = GeminiImageRequest {
        instances: vec![GeminiImageInstance {
            prompt: prompt.clone(),
        }],
        parameters: GeminiImageParameters { sample_count: 1 },
    };

    let client = Client::new();
    let url = format!(
        "{}/{}:predict",
        base_url.trim_end_matches('/'),
        model_name.trim_start_matches('/')
    );

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

    let image_base64 = &parsed.predictions[0].bytes_base64_encoded;
    let image_bytes = general_purpose::STANDARD
        .decode(image_base64)
        .map_err(|e| format!("解码图片失败: {}", e))?;

    let base_path = base_dir.ok_or_else(|| "请先保存Markdown文件".to_string())?;
    let sep = if base_path.contains("\\") { "\\" } else { "/" };
    let target_dir = format!("{}{}{}", base_path, sep, assets_dir);

    std::fs::create_dir_all(&target_dir).map_err(|e| format!("创建目录失败: {}", e))?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let filename = format!("cover-{}.png", timestamp);
    let full_path = format!("{}{}{}", target_dir, sep, filename);

    std::fs::write(&full_path, image_bytes).map_err(|e| format!("保存文件失败: {}", e))?;

    let relative_path = format!("{}/{}", assets_dir, filename);
    Ok(relative_path)
}

fn generate_image_prompt_from_markdown(markdown: &str) -> String {
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

    format!(
        "Create a clean, modern, minimalist cover image for a WeChat article titled '{}'. The image should be professional, eye-catching, and suitable for social media. Use a 16:9 aspect ratio with vibrant colors and simple geometric shapes. No text in the image.",
        title
    )
}
