mod engine;

use std::time::Duration;

use engine::{Engine, Header, Outgoing};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendArgs {
    method: String,
    url: String,
    #[serde(default)]
    headers: Vec<Header>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendResult {
    status: u16,
    status_reason: Option<String>,
    url: String,
    version: String,
    headers: Vec<Header>,
    body: String,
    size_bytes: usize,
    elapsed_ms: u128,
}

/// Sends one HTTP request and returns the full response.
#[tauri::command]
async fn send_request(engine: State<'_, Engine>, args: SendArgs) -> Result<SendResult, String> {
    let res = engine
        .send(Outgoing {
            method: args.method,
            url: args.url,
            headers: args.headers,
            body: args.body.filter(|b| !b.is_empty()).map(String::into_bytes),
            timeout: args.timeout_ms.map(Duration::from_millis),
        })
        .await
        .map_err(|e| e.to_string())?;

    Ok(SendResult {
        status: res.status,
        status_reason: res.reason,
        url: res.url,
        version: res.version,
        headers: res.headers,
        size_bytes: res.body.len(),
        body: String::from_utf8_lossy(&res.body).into_owned(),
        elapsed_ms: res.elapsed.as_millis(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let engine = Engine::new().expect("failed to start the HTTP engine");
    tauri::Builder::default()
        .manage(engine)
        .invoke_handler(tauri::generate_handler![send_request])
        .run(tauri::generate_context!())
        .expect("error while running Quack");
}
