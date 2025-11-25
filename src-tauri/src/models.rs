use serde::{Deserialize, Serialize};

// ============ OpenAI/DeepSeek API structures ============

#[derive(Serialize)]
pub struct ChatCompletionRequestMessage {
    pub role: String,
    pub content: String,
}

#[derive(Serialize)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<ChatCompletionRequestMessage>,
    pub max_tokens: u32,
    pub temperature: f32,
}

#[derive(Deserialize)]
pub struct ChatCompletionResponseMessage {
    pub content: String,
}

#[derive(Deserialize)]
pub struct ChatCompletionChoice {
    pub message: ChatCompletionResponseMessage,
}

#[derive(Deserialize)]
pub struct ChatCompletionResponse {
    pub choices: Vec<ChatCompletionChoice>,
}

// ============ WeChat API structures ============

#[derive(Deserialize)]
pub struct WechatTokenResponse {
    pub access_token: Option<String>,
    pub expires_in: Option<i64>,
    pub errcode: Option<i32>,
    pub errmsg: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct WechatUploadResponse {
    pub media_id: Option<String>,
    pub url: Option<String>,
    pub errcode: Option<i32>,
    pub errmsg: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct WechatUploadResultEntry {
    pub original_url: String,
    pub wechat_url: String,
    pub media_id: String,
}

#[derive(Serialize)]
pub struct WechatUploadResult {
    pub markdown: String,
    pub items: Vec<WechatUploadResultEntry>,
}

// ============ Gemini API structures ============

#[derive(Serialize)]
pub struct GeminiImageRequest {
    pub instances: Vec<GeminiImageInstance>,
    pub parameters: GeminiImageParameters,
}

#[derive(Serialize)]
pub struct GeminiImageInstance {
    pub prompt: String,
}

#[derive(Serialize)]
pub struct GeminiImageParameters {
    #[serde(rename = "sampleCount")]
    pub sample_count: u32,
}

#[derive(Deserialize, Debug)]
pub struct GeminiImageResponse {
    pub predictions: Vec<GeminiPrediction>,
}

#[derive(Deserialize, Debug)]
pub struct GeminiPrediction {
    #[serde(rename = "bytesBase64Encoded")]
    pub bytes_base64_encoded: String,
}
