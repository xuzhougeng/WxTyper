use once_cell::sync::OnceCell;
use regex::Regex;
use reqwest::{multipart, Client};
use std::collections::{HashMap, HashSet};
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::models::{WechatTokenResponse, WechatUploadResponse, WechatUploadResult, WechatUploadResultEntry};

// ============ Token cache ============

struct WechatTokenCache {
    access_token: String,
    expires_at: Instant,
}

static WECHAT_TOKEN_CACHE: OnceCell<Mutex<Option<WechatTokenCache>>> = OnceCell::new();

pub async fn get_wechat_access_token(
    client: &Client,
    app_id: &str,
    app_secret: &str,
) -> Result<String, String> {
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

// ============ Tauri commands ============

#[allow(non_snake_case)]
#[tauri::command]
pub async fn test_wechat_access_token(appId: String, appSecret: String) -> Result<String, String> {
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

#[allow(non_snake_case)]
#[tauri::command]
pub async fn wechat_upload_and_replace_images(
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
            let path = if let Some(dir) = &base_dir_path {
                dir.join(url)
            } else {
                PathBuf::from(url)
            };

            match std::fs::read(&path) {
                Ok(data) => {
                    let name = path
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("image.png")
                        .to_string();
                    (data, name)
                }
                Err(local_err) => {
                    if let Some(prefix) = &sitePrefix {
                        let prefix_trimmed = prefix.trim();
                        if !prefix_trimmed.is_empty() {
                            let full_url =
                                format!("{}{}", prefix_trimmed.trim_end_matches('/'), url);
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
                                            eprintln!(
                                                "创建 assets 目录失败 {}: {}",
                                                assets_dir.display(),
                                                e
                                            );
                                        } else {
                                            let mut local_path = assets_dir.clone();
                                            local_path.push(&name);
                                            if let Err(e) = std::fs::write(&local_path, &bytes_vec)
                                            {
                                                eprintln!(
                                                    "保存下载图片到本地失败 {}: {}",
                                                    local_path.display(),
                                                    e
                                                );
                                            }
                                        }
                                    }

                                    (bytes_vec, name)
                                }
                                Ok(resp) => {
                                    return Err(format!(
                                        "读取本地图片失败 {}: {}；尝试下载 {} 也失败: HTTP {}",
                                        path.display(),
                                        local_err,
                                        full_url,
                                        resp.status()
                                    ));
                                }
                                Err(download_err) => {
                                    return Err(format!(
                                        "读取本地图片失败 {}: {}；尝试下载 {} 也失败: {}",
                                        path.display(),
                                        local_err,
                                        full_url,
                                        download_err
                                    ));
                                }
                            }
                        } else {
                            return Err(format!(
                                "读取本地图片失败 {}: {}",
                                path.display(),
                                local_err
                            ));
                        }
                    } else {
                        return Err(format!(
                            "读取本地图片失败 {}: {}（未配置网站前缀，无法尝试下载）",
                            path.display(),
                            local_err
                        ));
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
