use regex::Regex;
use reqwest::Client;
use std::collections::HashMap;
use std::path::PathBuf;

#[allow(non_snake_case)]
#[tauri::command]
pub async fn localize_images_to_assets(
    markdown: String,
    baseDir: Option<String>,
    sitePrefix: Option<String>,
    assetsDir: Option<String>,
) -> Result<String, String> {
    let assets_dir_name = assetsDir.unwrap_or_else(|| "assets".to_string());

    let base_dir_path = if let Some(dir) = baseDir {
        PathBuf::from(dir)
    } else {
        return Err(format!(
            "当前文件尚未保存，无法确定 {} 目录",
            assets_dir_name
        ));
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

        let (bytes_opt, filename_opt): (Option<Vec<u8>>, Option<String>) = if is_http {
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
            (Some(body.to_vec()), Some(name))
        } else if let Some(prefix) = &sitePrefix {
            let trimmed = prefix.trim();
            if !trimmed.is_empty() {
                let full_url = format!("{}{}", trimmed.trim_end_matches('/'), url);
                let resp = client
                    .get(&full_url)
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;
                if !resp.status().is_success() {
                    return Err(format!("下载远程图片失败 {}: {}", full_url, resp.status()));
                }
                let body = resp.bytes().await.map_err(|e| e.to_string())?;
                let name = url
                    .split('/')
                    .last()
                    .filter(|s| !s.is_empty())
                    .unwrap_or("image.png")
                    .to_string();
                (Some(body.to_vec()), Some(name))
            } else {
                url_map.insert(url.clone(), url.clone());
                continue;
            }
        } else {
            url_map.insert(url.clone(), url.clone());
            continue;
        };

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
