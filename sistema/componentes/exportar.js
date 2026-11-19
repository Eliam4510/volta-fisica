/* ==========================================================================
   Volta — exportar datos e imágenes
   Descarga archivos generados en la página (CSV, PNG). En la aplicación de
   Windows, WebView2 los guarda en la carpeta de descargas y muestra su aviso
   de descarga; en el navegador, igual.
   ========================================================================== */

/**
 * Descarga un texto como archivo.
 * @param {string} nombre @param {string} texto @param {string} [tipo]
 */
export function descargarTexto(nombre, texto, tipo = 'text/csv;charset=utf-8') {
  descargarBlob(nombre, new Blob([texto], { type: tipo }));
}

/**
 * Descarga el contenido de un lienzo como PNG, con el fondo del lienzo
 * (los lienzos de Volta ya pintan su fondo, así que la imagen es fiel).
 * @param {HTMLCanvasElement} canvas @param {string} nombre
 */
export function descargarLienzo(canvas, nombre) {
  canvas.toBlob(b => { if (b) descargarBlob(nombre, b); }, 'image/png');
}

/** @param {string} nombre @param {Blob} blob */
function descargarBlob(nombre, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Nombre de archivo a partir de un título: "Salto hacia una pendiente" →
 * "salto-hacia-una-pendiente".
 * @param {string} titulo
 */
export function nombreArchivo(titulo) {
  return titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'volta';
}

/**
 * Aviso breve abajo al centro del lienzo (componente .aviso-lienzo).
 * @param {HTMLElement} contenedor @param {string} texto
 */
export function avisar(contenedor, texto) {
  const el = document.createElement('div');
  el.className = 'aviso-flotante aviso-lienzo';
  el.innerHTML = `<span></span>`;
  /** @type {HTMLElement} */ (el.firstChild).textContent = texto;
  contenedor.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
