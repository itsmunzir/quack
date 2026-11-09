fn main() {
    tauri_build::build();

    // tauri-build gives the app binary a Windows manifest (it asks for Common Controls v6, which the
    // dialog plugin needs). Give the integration tests the same one, or they can fail to start.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let out = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap());
        for name in ["libresource.a", "resource.lib"] {
            let res = out.join(name);
            if res.exists() {
                println!("cargo:rustc-link-arg-tests={}", res.display());
                break;
            }
        }
    }
}
