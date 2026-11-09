//! Folder sync against a real temporary directory.

use std::collections::HashMap;
use std::path::PathBuf;

use quack_lib::folder::{allowed, read, write};

fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("quack-folder-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn only_format_paths_are_allowed() {
    for ok in [
        "quack.yaml",
        "local.yaml",
        "requests/get-user.yaml",
        "environments/dev.yaml",
    ] {
        assert!(allowed(ok), "{ok}");
    }
    for bad in [
        "../evil.yaml",
        "requests/../../evil.yaml",
        "requests/..yaml",
        "requests/.yaml",
        "other/x.yaml",
        "requests/x.txt",
        "requests/sub/x.yaml",
        "C:/x.yaml",
        "/etc/passwd",
        ".gitignore",
        "requests/a b.yaml",
        "requests/Users.yaml",
        "requests\\..\\x.yaml",
    ] {
        assert!(!allowed(bad), "{bad}");
    }
}

#[tokio::test]
async fn writes_reads_and_removes() {
    let dir = scratch("roundtrip");
    let mut files = HashMap::new();
    files.insert("quack.yaml".to_string(), "name: Pond\n".to_string());
    files.insert("requests/ping.yaml".to_string(), "url: x\n".to_string());
    files.insert("local.yaml".to_string(), "auth: {}\n".to_string());
    write(&dir, &files, &[]).await.unwrap();
    assert_eq!(
        std::fs::read_to_string(dir.join(".gitignore")).unwrap(),
        "local.yaml\n"
    );

    // Unrelated files are left alone and not read back.
    std::fs::write(dir.join("requests/notes.txt"), "hi").unwrap();
    let got = read(&dir).await.unwrap();
    assert!(!got.empty);
    assert_eq!(got.files.len(), 3);
    assert_eq!(got.files["requests/ping.yaml"], "url: x\n");

    write(&dir, &HashMap::new(), &["requests/ping.yaml".to_string()])
        .await
        .unwrap();
    assert!(!dir.join("requests/ping.yaml").exists());
    assert!(dir.join("requests/notes.txt").exists());
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn keeps_an_existing_gitignore() {
    let dir = scratch("ignore");
    std::fs::write(dir.join(".gitignore"), "target/\n").unwrap();
    let mut files = HashMap::new();
    files.insert("local.yaml".to_string(), "x: 1\n".to_string());
    write(&dir, &files, &[]).await.unwrap();
    assert_eq!(
        std::fs::read_to_string(dir.join(".gitignore")).unwrap(),
        "target/\n"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn rejects_bad_paths_before_writing_anything() {
    let dir = scratch("reject");
    let mut files = HashMap::new();
    files.insert("quack.yaml".to_string(), "ok\n".to_string());
    files.insert("../escape.yaml".to_string(), "no\n".to_string());
    assert!(write(&dir, &files, &[]).await.is_err());
    assert!(!dir.join("quack.yaml").exists());
    let _ = std::fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn a_missing_folder_is_an_error() {
    let dir = std::env::temp_dir().join("quack-folder-does-not-exist-xyz");
    assert!(read(&dir).await.is_err());
    assert!(write(&dir, &HashMap::new(), &[]).await.is_err());
    assert!(!dir.exists());
}

#[tokio::test]
async fn empty_folder_is_reported() {
    let dir = scratch("empty");
    assert!(read(&dir).await.unwrap().empty);
    let _ = std::fs::remove_dir_all(&dir);
}
