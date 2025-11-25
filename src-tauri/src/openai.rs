use reqwest::Client;

use crate::models::{ChatCompletionRequest, ChatCompletionRequestMessage, ChatCompletionResponse};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn generate_summary(
    markdown: String,
    apiBaseUrl: Option<String>,
    apiToken: Option<String>,
    apiModel: Option<String>,
) -> Result<String, String> {
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
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));

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
        if idx >= 100 { break; }
        truncated.push(ch);
    }

    Ok(truncated)
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn test_openai_config(
    apiBaseUrl: Option<String>,
    apiToken: Option<String>,
    apiModel: Option<String>,
) -> Result<String, String> {
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
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));

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
