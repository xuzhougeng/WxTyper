use base64::{engine::general_purpose, Engine as _};
use reqwest::Client;
use serde::{Deserialize, Serialize};

// ==================== 文本生成 API 结构体 ====================

#[derive(Debug, Serialize)]
struct GenerateContentRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GenerationConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
enum GeminiPart {
    Text { text: String },
    InlineData { 
        #[serde(rename = "inlineData")]
        inline_data: InlineData 
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InlineData {
    data: String,
    mime_type: String,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct GenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_k: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    response_modalities: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct GenerateContentResponse {
    candidates: Vec<GeminiCandidate>,
}

#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: GeminiContent,
}

#[tauri::command]
pub async fn generate_cover_image(
    markdown: String,
    gemini_api_key: Option<String>,
    gemini_api_url: Option<String>,
    gemini_model: Option<String>,
    custom_prompt: Option<String>,
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
        .unwrap_or_else(|| "https://generativelanguage.googleapis.com".to_string());

    let model_name = gemini_model
        .and_then(|s| {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
        .unwrap_or_else(|| "gemini-3-pro-image-preview".to_string());

    // Use custom prompt if provided, otherwise generate from markdown
    let prompt = custom_prompt
        .and_then(|s| {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
        .unwrap_or_else(|| generate_image_prompt_from_markdown(&markdown));

    let request = GenerateContentRequest {
        contents: vec![GeminiContent {
            role: "user".to_string(),
            parts: vec![GeminiPart::Text {
                text: prompt.clone(),
            }],
        }],
        generation_config: Some(GenerationConfig {
            response_modalities: Some(vec!["TEXT".to_string(), "IMAGE".to_string()]),
            ..Default::default()
        }),
    };

    let client = Client::new();
    let url = format!(
        "{}/v1beta/models/{}:generateContent",
        base_url.trim_end_matches('/'),
        model_name
    );

    let response = client
        .post(&url)
        .header("x-goog-api-key", &api_key)
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("API返回错误 {}: {}", status, text));
    }

    let parsed: GenerateContentResponse = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    if parsed.candidates.is_empty() {
        return Err("API未返回内容".to_string());
    }

    // Extract image from response
    let image_data = parsed.candidates[0]
        .content
        .parts
        .iter()
        .find_map(|part| {
            if let GeminiPart::InlineData { inline_data } = part {
                Some(&inline_data.data)
            } else {
                None
            }
        })
        .ok_or_else(|| "API未返回图片".to_string())?;

    let image_bytes = general_purpose::STANDARD
        .decode(image_data)
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

/// Test Gemini API configuration
#[tauri::command]
pub async fn test_gemini_config(
    gemini_api_key: Option<String>,
    gemini_api_url: Option<String>,
    gemini_model: Option<String>,
) -> Result<String, String> {
    let api_key = gemini_api_key
        .and_then(|s| {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
        .ok_or_else(|| "请先配置 Gemini API Key".to_string())?;

    let base_url = gemini_api_url
        .and_then(|s| {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
        .unwrap_or_else(|| "https://generativelanguage.googleapis.com".to_string());

    let model = gemini_model
        .and_then(|s| {
            let trimmed = s.trim().to_string();
            if trimmed.is_empty() { None } else { Some(trimmed) }
        })
        .unwrap_or_else(|| "gemini-3-pro-image-preview".to_string());

    let client = Client::new();
    let test_prompt = "Generate a simple test image with the text 'Hello World' in blue.";

    let request = GenerateContentRequest {
        contents: vec![GeminiContent {
            role: "user".to_string(),
            parts: vec![GeminiPart::Text {
                text: test_prompt.to_string(),
            }],
        }],
        generation_config: Some(GenerationConfig {
            response_modalities: Some(vec!["TEXT".to_string(), "IMAGE".to_string()]),
            ..Default::default()
        }),
    };

    let url = format!(
        "{}/v1beta/models/{}:generateContent",
        base_url.trim_end_matches('/'),
        model
    );

    let response = client
        .post(&url)
        .header("x-goog-api-key", &api_key)
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("API 错误 {}: {}", status, text));
    }

    match response.json::<GenerateContentResponse>().await {
        Ok(parsed) => {
            let has_image = parsed.candidates.first()
                .map(|c| c.content.parts.iter().any(|p| matches!(p, GeminiPart::InlineData { .. })))
                .unwrap_or(false);

            if has_image {
                Ok(format!("✅ Gemini API 测试成功！\n模型: {}\n已成功生成图片", model))
            } else {
                Ok(format!("⚠️ Gemini API 可访问，但未返回图片\n模型: {}", model))
            }
        }
        Err(e) => Err(format!("解析响应失败: {}", e)),
    }
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

// ==================== 测试函数 ====================

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_gemini_image_generation() {
        // 测试配置
        // api_key get from env
        let api_key = std::env::var("GEMINI_API_KEY").unwrap();
        let base_url = "https://api.openai-proxy.org/google";
        let model = "gemini-3-pro-image-preview";

        let client = Client::new();
        
        // 生成图片描述提示词
        let image_prompt = "Generate a detailed description for creating an image: A modern, minimalist cover image for a tech blog post about AI and machine learning. Use vibrant blue and purple colors with geometric shapes. 16:9 aspect ratio, professional style.";

        let request = GenerateContentRequest {
            contents: vec![GeminiContent {
                role: "user".to_string(),
                parts: vec![GeminiPart::Text {
                    text: image_prompt.to_string(),
                }],
            }],
            generation_config: Some(GenerationConfig {
                response_modalities: Some(vec!["TEXT".to_string(), "IMAGE".to_string()]),
                ..Default::default()
            }),
        };

        let url = format!(
            "{}/v1beta/models/{}:generateContent",
            base_url.trim_end_matches('/'),
            model
        );

        println!("🔗 Request URL: {}", url);
        println!("🔑 API Key: {}...{}", &api_key[..10], &api_key[api_key.len()-10..]);

        let response = client
            .post(&url)
            .header("x-goog-api-key", api_key)
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await;

        match response {
            Ok(resp) => {
                let status = resp.status();
                println!("📡 Response Status: {}", status);

                if status.is_success() {
                    match resp.json::<GenerateContentResponse>().await {
                        Ok(parsed) => {
                            println!("✅ 成功生成内容!");
                            if let Some(candidate) = parsed.candidates.first() {
                                for (idx, part) in candidate.content.parts.iter().enumerate() {
                                    match part {
                                        GeminiPart::Text { text } => {
                                            println!("� Part {}: Text", idx);
                                            println!("{}", text);
                                        }
                                        GeminiPart::InlineData { inline_data } => {
                                            println!("🖼️ Part {}: Image ({} bytes, {})", 
                                                idx, 
                                                inline_data.data.len(),
                                                inline_data.mime_type
                                            );
                                            
                                            // 尝试保存图片到测试目录
                                            if let Ok(image_bytes) = general_purpose::STANDARD.decode(&inline_data.data) {
                                                let test_dir = std::env::temp_dir().join("gemini_test");
                                                let _ = std::fs::create_dir_all(&test_dir);
                                                let filename = format!("test_image_{}.png", idx);
                                                let filepath = test_dir.join(&filename);
                                                if let Ok(_) = std::fs::write(&filepath, image_bytes) {
                                                    println!("💾 图片已保存到: {}", filepath.display());
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            println!("❌ 解析响应失败: {:?}", e);
                        }
                    }
                } else {
                    let error_text = resp.text().await.unwrap_or_default();
                    println!("❌ API 错误 {}: {}", status, error_text);
                }
            }
            Err(e) => {
                println!("❌ 请求失败: {:?}", e);
            }
        }
    }

    #[tokio::test]
    async fn test_generate_image_prompt() {
        let markdown = r#"# 人工智能的未来

随着深度学习技术的发展，AI正在改变我们的生活。本文将探讨AI技术的最新进展和未来趋势。"#;

        let prompt = generate_image_prompt_from_markdown(markdown);
        println!("生成的图片提示词:");
        println!("{}", prompt);
        
        assert!(prompt.contains("人工智能的未来"));
        assert!(prompt.contains("WeChat article"));
    }
}
