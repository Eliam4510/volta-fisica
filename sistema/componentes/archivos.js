/* ==========================================================================
   Volta — guardar y abrir escenas, y autoguardado
   Usa la descarga del navegador para guardar y un selector de archivos para
   abrir; funciona igual en la aplicación de Windows (WebView2).
   ========================================================================== */
import { serializar, leerEscena, EXTENSION } from '../nucleo/escena.js';
import { descargarTexto, nombreArchivo, nativo, FILTROS } from './exportar.js';

/**
 * Guarda la escena como archivo .volta.
 * @param {import('../nucleo/escena.js').Escena} escena
 * @returns {Promise<string | null>} ruta guardada, o null si se canceló
 */
export function guardarEscena(escena) {
  return descargarTexto(nombreArchivo(escena.titulo) + EXTENSION, serializar(escena), 'application/json;charset=utf-8');
}

/**
 * Abre un selector de archivos y devuelve la escena validada.
 * @param {{modulo?: string}} esperado
 * @returns {Promise<import('../nucleo/escena.js').Escena>}
 */
export function abrirEscena(esperado) {
  const t = nativo();
  if (t) {
    // Diálogo «Abrir» de Windows. Si se cancela, la promesa no se resuelve.
    return new Promise((resolver, rechazar) => {
      t.dialog.open({ multiple: false, directory: false, filters: [...FILTROS.volta, { name: 'JSON', extensions: ['json'] }] })
        .then(async ruta => {
          if (!ruta) return;
          try { resolver(leerEscena(await t.fs.readTextFile(ruta), esperado)); }
          catch (e) { rechazar(e); }
        }, rechazar);
    });
  }
  return new Promise((resolver, rechazar) => {
    const entrada = document.createElement('input');
    entrada.type = 'file'; entrada.accept = `${EXTENSION},.json,application/json`;
    entrada.addEventListener('change', async () => {
      const archivo = entrada.files && entrada.files[0];
      if (!archivo) return;
      try { resolver(leerEscena(await archivo.text(), esperado)); }
      catch (e) { rechazar(e); }
    });
    entrada.click();
  });
}

/** Autoguardado por pantalla en el almacenamiento local (si está disponible). */
/**
 * Escenas recientes de este equipo, de la más nueva a la más vieja: una por
 * pantalla (por clave de autoguardado). Inicio las muestra en «Continuar».
 * @returns {{clave: string, modulo: string, espacio: string | null, titulo: string, t: number}[]}
 */
export function recientes() {
  try {
    const l = JSON.parse(localStorage.getItem('volta.recientes') || '[]');
    if (!Array.isArray(l)) return [];
    return l.filter(r => r && typeof r.clave === 'string' && /^[a-z-]{1,32}$/.test(r.clave) && typeof r.modulo === 'string'
      && Number.isFinite(r.t)).slice(0, 8);
  } catch { return []; }
}
/** @param {string} clave @param {import('../nucleo/escena.js').Escena} escena */
function registrarReciente(clave, escena) {
  try {
    const l = recientes().filter(r => r.clave !== clave);
    l.unshift({ clave, modulo: escena.modulo, espacio: escena.espacio ?? null, titulo: String(escena.titulo || ''), t: Date.now() });
    localStorage.setItem('volta.recientes', JSON.stringify(l.slice(0, 8)));
  } catch { /* sin almacenamiento */ }
}

export const autoguardado = {
  /** @param {string} clave @param {import('../nucleo/escena.js').Escena} escena */
  guardar(clave, escena) {
    try { localStorage.setItem('volta.escena.' + clave, serializar(escena)); } catch { /* sin almacenamiento */ }
    registrarReciente(clave, escena);
  },
  /** @param {string} clave @param {{modulo?: string}} esperado */
  leer(clave, esperado) {
    try {
      const t = localStorage.getItem('volta.escena.' + clave);
      const e = t ? leerEscena(t, esperado) : null;
      // Recuperar el trabajo de una pantalla también es «continuarlo»
      if (e) registrarReciente(clave, e);
      return e;
    } catch { return null; }
  },
  /** @param {string} clave */
  borrar(clave) { try { localStorage.removeItem('volta.escena.' + clave); } catch { /* sin almacenamiento */ } },
};

/**
 * Escena que otra pantalla (Inicio) dejó para abrir en esta. Se consume una
 * sola vez. Devuelve null si no hay o si no es de este módulo.
 * @param {string} modulo
 */
export function escenaPendiente(modulo) {
  try {
    const t = sessionStorage.getItem('volta.abrir');
    if (!t) return null;
    sessionStorage.removeItem('volta.abrir');
    return leerEscena(t, { modulo });
  } catch { return null; }
}
