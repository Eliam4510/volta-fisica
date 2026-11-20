/* ==========================================================================
   Volta — exportar datos e imágenes
   Guarda archivos generados en la página (CSV, PNG, escenas). Dentro de la
   aplicación de Windows usa los diálogos nativos «Guardar como» y «Abrir»
   (plugins de Tauri); en el navegador, la descarga normal.
   ========================================================================== */

/** Filtros de archivo para los diálogos nativos. */
/** Texto en el idioma de la interfaz (idioma.js va en el head de cada pantalla). */
const tr = (/** @type {string} */ s) => (/** @type {any} */ (globalThis).Volta?.t ? /** @type {any} */ (globalThis).Volta.t(s) : s);
export const FILTROS = {
  csv: [{ name: tr('Datos CSV'), extensions: ['csv'] }],
  png: [{ name: tr('Imagen PNG'), extensions: ['png'] }],
  volta: [{ name: tr('Escena de Volta'), extensions: ['volta'] }],
};

/** API nativa de Tauri si la página corre dentro de la aplicación de Windows. */
export function nativo() {
  const t = /** @type {any} */ (window).__TAURI__;
  return t && t.dialog && t.fs ? t : null;
}

/**
 * Guarda un archivo: con el diálogo «Guardar como» de Windows dentro de la
 * aplicación, o como descarga en el navegador.
 * @param {string} nombre Nombre sugerido
 * @param {string | Blob} contenido
 * @param {{tipo?: string, filtros?: any[]}} [o]
 * @returns {Promise<string | null>} ruta o nombre guardado; null si se canceló
 */
export async function guardarArchivo(nombre, contenido, o = {}) {
  const t = nativo();
  if (t) {
    const ruta = await t.dialog.save({ defaultPath: nombre, filters: o.filtros });
    if (!ruta) return null;
    if (typeof contenido === 'string') await t.fs.writeTextFile(ruta, contenido);
    else await t.fs.writeFile(ruta, new Uint8Array(await contenido.arrayBuffer()));
    return ruta;
  }
  descargarBlob(nombre, typeof contenido === 'string' ? new Blob([contenido], { type: o.tipo || 'text/plain;charset=utf-8' }) : contenido);
  return nombre;
}

/**
 * Guarda un texto (CSV por defecto).
 * @param {string} nombre @param {string} texto @param {string} [tipo]
 */
export function descargarTexto(nombre, texto, tipo = 'text/csv;charset=utf-8') {
  const ext = nombre.split('.').pop();
  return guardarArchivo(nombre, texto, { tipo, filtros: FILTROS[ext] });
}

/**
 * Guarda el contenido de un lienzo como PNG, con el fondo del lienzo
 * (los lienzos de Volta ya pintan su fondo, así que la imagen es fiel).
 * @param {HTMLCanvasElement} canvas @param {string} nombre
 * @returns {Promise<string | null>}
 */
export function descargarLienzo(canvas, nombre) {
  return new Promise(resolver => canvas.toBlob(b => {
    if (!b) { resolver(null); return; }
    guardarArchivo(nombre, b, { filtros: FILTROS.png }).then(resolver, () => resolver(null));
  }, 'image/png'));
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
