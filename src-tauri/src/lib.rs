mod engine;

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
            write_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Quack");
}
