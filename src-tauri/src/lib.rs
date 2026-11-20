//! Volta — aplicación de escritorio.
//!
//! La interfaz y los motores físicos viven en `sistema/` (HTML, CSS y
//! JavaScript) y Tauri los sirve dentro de una ventana nativa. Esta parte en
//! Rust se ocupa de lo que el navegador no puede hacer por sí solo: la
//! ventana, los archivos y, más adelante, los cálculos pesados.

use std::path::Path;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// Tamaño máximo de una escena que se abre (las de Volta pesan kilobytes).
const MAX_ESCENA: u64 = 20 * 1024 * 1024;

/// Archivo .volta con el que se arrancó Volta (doble clic en el Explorador),
/// hasta que la interfaz lo pide.
struct ArchivoInicial(Mutex<Option<String>>);

/// Primer argumento que sea una escena (.volta o .json) y exista.
fn escena_en_argumentos<I: IntoIterator<Item = String>>(args: I) -> Option<String> {
    args.into_iter().skip(1).find(|a| {
        let p = Path::new(a);
        p.is_file() && matches!(p.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref(), Some("volta") | Some("json"))
    })
}

/// Versión de la aplicación, para mostrarla en la interfaz.
#[tauri::command]
fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// El archivo con el que se arrancó Volta (una sola vez).
#[tauri::command]
fn archivo_inicial(estado: tauri::State<ArchivoInicial>) -> Option<String> {
    estado.0.lock().ok().and_then(|mut a| a.take())
}

/// Lee una escena (.volta o .json) de cualquier carpeta del usuario.
#[tauri::command]
fn leer_escena(ruta: String) -> Result<String, String> {
    let p = Path::new(&ruta);
    let ext = p.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase());
    if !matches!(ext.as_deref(), Some("volta") | Some("json")) {
        return Err("Solo se abren escenas de Volta (.volta).".into());
    }
    let meta = std::fs::metadata(p).map_err(|e| format!("No se pudo abrir «{ruta}»: {e}"))?;
    if meta.len() > MAX_ESCENA {
        return Err("El archivo es demasiado grande para ser una escena de Volta.".into());
    }
    std::fs::read_to_string(p).map_err(|e| format!("No se pudo leer «{ruta}»: {e}"))
}

/// Guarda una escena (.volta). Escribe primero en un archivo temporal y lo
/// renombra: un corte a mitad no deja la escena anterior a medias.
#[tauri::command]
fn escribir_escena(ruta: String, contenido: String) -> Result<(), String> {
    let p = Path::new(&ruta);
    if !p.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("volta")).unwrap_or(false) {
        return Err("Las escenas se guardan con la extensión .volta.".into());
    }
    let tmp = p.with_extension("volta.tmp");
    std::fs::write(&tmp, contenido.as_bytes()).map_err(|e| format!("No se pudo guardar «{ruta}»: {e}"))?;
    std::fs::rename(&tmp, p).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("No se pudo guardar «{ruta}»: {e}")
    })
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
        // Una sola instancia: abrir un .volta con Volta ya abierta lo manda a
        // la ventana que hay (y la trae al frente) en vez de abrir otra
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(ruta) = escena_en_argumentos(argv) {
                let _ = app.emit("abrir-archivo", ruta);
            }
            if let Some(v) = app.get_webview_window("main") {
                let _ = v.unminimize();
                let _ = v.set_focus();
            }
        }))
        .manage(ArchivoInicial(Mutex::new(escena_en_argumentos(std::env::args()))))
        // La ventana recuerda su tamaño, posición y si estaba maximizada
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // Diálogos nativos de Windows (Guardar como, Abrir) y escritura de archivos
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // Actualizaciones desde las releases de GitHub (firmadas), reinicio
        // tras instalarlas y apertura de la página de descarga en el navegador
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![version, instalada, archivo_inicial, leer_escena, escribir_escena])
        .run(tauri::generate_context!())
        .expect("no se pudo iniciar Volta");
}
