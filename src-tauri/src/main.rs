// Evita la ventana de consola en Windows en compilaciones de release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    volta_lib::run()
}
