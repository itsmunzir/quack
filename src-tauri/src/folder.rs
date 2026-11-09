//! Reads and writes a space kept as a folder of YAML files. The UI decides what goes
//! in each file; this side only touches the few paths that format allows.

use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tokio::fs;

const MANIFEST: &str = "quack.yaml";
const LOCAL: &str = "local.yaml";
const DIRS: [&str; 2] = ["requests", "environments"];
/// Bigger files are skipped when reading: no request needs this much.
const MAX_FILE_BYTES: u64 = 5 * 1024 * 1024;
/// Most files read from one subfolder.
const MAX_FILES: usize = 2000;

#[derive(Debug, Serialize)]
pub struct FolderContents {
    /// Relative path, with `/` separators, to contents.
    pub files: HashMap<String, String>,
    /// True when the folder has nothing in it at all.
    pub empty: bool,
}

/// Accepts only `quack.yaml`, `local.yaml` and `<requests|environments>/<name>.yaml`,
/// so a bad path from the UI can never write outside the folder.
pub fn allowed(rel: &str) -> bool {
    let name_ok = |n: &str| {
        n.len() > 5
            && n.ends_with(".yaml")
            && !n.starts_with('.')
            // Lowercase only: Quack names files in lowercase, and on a case-insensitive disk
            // `Users.yaml` and `users.yaml` would be the same file.
            && n.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_' || c == '.')
    };
    match rel.split('/').collect::<Vec<_>>().as_slice() {
        [file] => *file == MANIFEST || *file == LOCAL,
        [dir, file] => DIRS.contains(dir) && name_ok(file),
        _ => false,
    }
}

fn target(root: &Path, rel: &str) -> Result<PathBuf, String> {
    if !allowed(rel) {
        return Err(format!("Quack won't write {rel}"));
    }
    Ok(rel
        .split('/')
        .fold(root.to_path_buf(), |p, part| p.join(part)))
}

async fn ensure_dir(root: &Path) -> Result<(), String> {
    match fs::metadata(root).await {
        Ok(m) if m.is_dir() => Ok(()),
        Ok(_) => Err(format!("{} isn't a folder", root.display())),
        Err(_) => Err(format!("Can't find the folder {}", root.display())),
    }
}

async fn read_small(path: &Path) -> Option<String> {
    let meta = fs::metadata(path).await.ok()?;
    if !meta.is_file() || meta.len() > MAX_FILE_BYTES {
        return None;
    }
    fs::read_to_string(path).await.ok()
}

pub async fn read(root: &Path) -> Result<FolderContents, String> {
    ensure_dir(root).await?;
    let mut entries = fs::read_dir(root).await.map_err(|e| e.to_string())?;
    let empty = entries
        .next_entry()
        .await
        .map_err(|e| e.to_string())?
        .is_none();

    let mut files = HashMap::new();
    for name in [MANIFEST, LOCAL] {
        if let Some(text) = read_small(&root.join(name)).await {
            files.insert(name.to_string(), text);
        }
    }
    for dir in DIRS {
        let Ok(mut list) = fs::read_dir(root.join(dir)).await else {
            continue;
        };
        let mut seen = 0;
        while let Ok(Some(entry)) = list.next_entry().await {
            let name = entry.file_name().to_string_lossy().into_owned();
            let rel = format!("{dir}/{name}");
            if !allowed(&rel) {
                continue;
            }
            if let Some(text) = read_small(&entry.path()).await {
                files.insert(rel, text);
                seen += 1;
                if seen >= MAX_FILES {
                    break;
                }
            }
        }
    }
    Ok(FolderContents { files, empty })
}

/// Writes through a temporary file and renames it over, so a crash never leaves half a file.
async fn write_file(path: &Path, contents: &str) -> Result<(), String> {
    if fs::read_to_string(path).await.ok().as_deref() == Some(contents) {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("yaml.tmp");
    fs::write(&tmp, contents).await.map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).await.map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })
}

pub async fn write(
    root: &Path,
    files: &HashMap<String, String>,
    remove: &[String],
) -> Result<(), String> {
    ensure_dir(root).await?;
    // Check every path before touching anything.
    let writes = files
        .iter()
        .map(|(rel, text)| Ok((target(root, rel)?, text)))
        .collect::<Result<Vec<_>, String>>()?;
    let removes = remove
        .iter()
        .map(|rel| target(root, rel))
        .collect::<Result<Vec<_>, String>>()?;

    for (path, text) in writes {
        write_file(&path, text).await?;
    }
    for path in removes {
        match fs::remove_file(&path).await {
            Err(e) if e.kind() != ErrorKind::NotFound => return Err(e.to_string()),
            _ => {}
        }
    }
    // Secrets live in local.yaml; keep it out of git unless the folder already decides that itself.
    if files.contains_key(LOCAL) {
        let ignore = root.join(".gitignore");
        if fs::metadata(&ignore).await.is_err() {
            fs::write(&ignore, "local.yaml\n")
                .await
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Makes one new, empty folder for a space. Fails if it already exists.
#[tauri::command]
pub async fn create_folder(path: String) -> Result<(), String> {
    fs::create_dir(&path).await.map_err(|e| match e.kind() {
        ErrorKind::AlreadyExists => format!("{path} already exists"),
        _ => e.to_string(),
    })
}

/// Reads a space folder: its manifest, local file, requests and environments.
#[tauri::command]
pub async fn read_folder(path: String) -> Result<FolderContents, String> {
    read(Path::new(&path)).await
}

/// Writes the given files into a space folder and deletes the ones listed in `remove`.
#[tauri::command]
pub async fn write_folder(
    path: String,
    files: HashMap<String, String>,
    remove: Vec<String>,
) -> Result<(), String> {
    write(Path::new(&path), &files, &remove).await
}
