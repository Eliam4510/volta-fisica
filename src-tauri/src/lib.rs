//! Volta — aplicación de escritorio.
//!
//! La interfaz y los motores físicos viven en `sistema/` (HTML, CSS y
//! JavaScript) y Tauri los sirve dentro de una ventana nativa. Esta parte en
//! Rust se ocupa de lo que el navegador no puede hacer por sí solo: la
//! ventana, los archivos y, más adelante, los cálculos pesados.

/// Versión de la aplicación, para mostrarla en la interfaz.
#[tauri::command]
fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// ¿Está instalada con el instalador? El instalador deja `uninstall.exe`
/// junto al ejecutable; el portátil no. Solo la instalada se actualiza sola
/// (la actualización ejecuta el instalador nuevo); al portátil se le ofrece
/// la página de descarga.
#[tauri::command]
fn instalada() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("uninstall.exe").exists()))
        .unwrap_or(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Diálogos nativos de Windows (Guardar como, Abrir) y escritura de archivos
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // Actualizaciones desde las releases de GitHub (firmadas), reinicio
        // tras instalarlas y apertura de la página de descarga en el navegador
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![version, instalada])
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar Volta");
}
