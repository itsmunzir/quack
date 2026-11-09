mod engine;
pub mod folder;

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use engine::{Engine, FormPart, Header, Outgoing};
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::oneshot;

/// Requests still waiting on a reply, keyed by the id the UI sent them with.
#[derive(Default)]
struct InFlight(Mutex<HashMap<String, oneshot::Sender<()>>>);

impl InFlight {
    fn insert(&self, id: String, tx: oneshot::Sender<()>) {
        if let Ok(mut map) = self.0.lock() {
            map.insert(id, tx);
        }
    }

    fn take(&self, id: &str) -> Option<oneshot::Sender<()>> {
        self.0.lock().ok()?.remove(id)
    }
}

const CANCELLED: &str = "Cancelled";

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
    multipart: Option<Vec<FormPart>>,
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
    /// The body as a `data:` URL when it's an image small enough to show.
    #[serde(skip_serializing_if = "Option::is_none")]
    image: Option<String>,
}

/// Largest image shown inline in the response view.
const MAX_IMAGE_BYTES: usize = 15 * 1024 * 1024;

/// A `data:` URL for an image body, so the response view can show it.
fn image_url(headers: &[Header], body: &[u8]) -> Option<String> {
    let kind = headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case("content-type"))?
        .1
        .split(';')
        .next()?
        .trim()
        .to_ascii_lowercase();
    if !kind.starts_with("image/") || body.is_empty() || body.len() > MAX_IMAGE_BYTES {
        return None;
    }
    Some(format!("data:{kind};base64,{}", base64(body)))
}

fn base64(bytes: &[u8]) -> String {
    const ABC: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = chunk
            .iter()
            .enumerate()
            .fold(0u32, |n, (i, &b)| n | (b as u32) << (16 - 8 * i));
        for i in 0..4 {
            out.push(if i <= chunk.len() {
                ABC[(n >> (18 - 6 * i)) as usize & 63] as char
            } else {
                '='
            });
        }
    }
    out
}

/// Sends one HTTP request and returns the full response. `cancel_request` with
/// the same id drops it mid-flight, closing the connection.
#[tauri::command]
async fn send_request(
    engine: State<'_, Engine>,
    in_flight: State<'_, InFlight>,
    id: String,
    args: SendArgs,
) -> Result<SendResult, String> {
    let (tx, rx) = oneshot::channel();
    in_flight.insert(id.clone(), tx);
    let outgoing = Outgoing {
        method: args.method,
        url: args.url,
        headers: args.headers,
        body: args.body.filter(|b| !b.is_empty()).map(String::into_bytes),
        multipart: args.multipart,
        timeout: args.timeout_ms.map(Duration::from_millis),
    };
    let reply = tokio::select! {
        res = engine.send(outgoing) => res.map_err(|e| e.to_string()),
        _ = rx => Err(CANCELLED.to_string()),
    };
    in_flight.take(&id);
    let res = reply?;

    Ok(SendResult {
        image: image_url(&res.headers, &res.body),
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

/// Largest file `read_text_file` will load, so a wrong pick can't exhaust memory.
const MAX_IMPORT_BYTES: u64 = 20 * 1024 * 1024;

/// Reads a text file the user picked to import.
#[tauri::command]
async fn read_text_file(path: String) -> Result<String, String> {
    let size = tokio::fs::metadata(&path)
        .await
        .map_err(|e| e.to_string())?
        .len();
    if size > MAX_IMPORT_BYTES {
        return Err(format!(
            "That file is larger than {} MB",
            MAX_IMPORT_BYTES / 1024 / 1024
        ));
    }
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| e.to_string())
}

/// Writes an export to the path the user chose in the save dialog.
#[tauri::command]
async fn write_text_file(path: String, contents: String) -> Result<(), String> {
    tokio::fs::write(&path, contents)
        .await
        .map_err(|e| e.to_string())
}

/// Stops a request started by `send_request`. Does nothing if it already finished.
#[tauri::command]
fn cancel_request(in_flight: State<'_, InFlight>, id: String) {
    if let Some(tx) = in_flight.take(&id) {
        let _ = tx.send(());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let engine = Engine::new().expect("failed to start the HTTP engine");
    let builder = tauri::Builder::default();
    // Left out of unit tests: on Windows it needs the app manifest, which test binaries lack.
    #[cfg(not(test))]
    let builder = builder.plugin(tauri_plugin_dialog::init());
    builder
        .manage(engine)
        .manage(InFlight::default())
        .invoke_handler(tauri::generate_handler![
            send_request,
            cancel_request,
            read_text_file,
            write_text_file,
            folder::create_folder,
            folder::read_folder,
            folder::write_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running Quack");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_the_standard() {
        for (raw, enc) in [
            ("", ""),
            ("f", "Zg=="),
            ("fo", "Zm8="),
            ("foo", "Zm9v"),
            ("foob", "Zm9vYg=="),
            ("fooba", "Zm9vYmE="),
            ("foobar", "Zm9vYmFy"),
        ] {
            assert_eq!(base64(raw.as_bytes()), enc);
        }
        assert_eq!(base64(&[0xff, 0xfe, 0x00]), "//4A");
    }

    #[test]
    fn only_images_become_data_urls() {
        let h = |v: &str| vec![("Content-Type".to_string(), v.to_string())];
        assert_eq!(
            image_url(&h("image/PNG; x=1"), b"ab").as_deref(),
            Some("data:image/png;base64,YWI=")
        );
        assert_eq!(image_url(&h("application/json"), b"{}"), None);
        assert_eq!(image_url(&h("image/png"), b""), None);
        assert_eq!(image_url(&[], b"ab"), None);
    }
}
