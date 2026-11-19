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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![version])
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar Volta");
}
