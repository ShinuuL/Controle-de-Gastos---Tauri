fn main() {
    if std::env::var("TARGET")
        .is_ok_and(|target| target.ends_with("-linux-android"))
    {
        // NDK r27 still defaults to 4 KB ELF segments. Android devices using
        // 16 KB memory pages require native libraries whose LOAD segments are
        // aligned to 16 KB.
        println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
        println!("cargo:rustc-link-arg=-Wl,-z,common-page-size=16384");
    }

    tauri_build::build()
}
