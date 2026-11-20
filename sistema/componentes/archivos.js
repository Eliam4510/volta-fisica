/* ==========================================================================
   Volta — guardar y abrir escenas, y autoguardado
   Guardar escribe en el archivo del documento (o pregunta dónde la primera
   vez); Abrir pregunta antes de perder cambios y lleva cada archivo a la
   pantalla de su módulo. La lógica del documento está en documento.js.
   ========================================================================== */
import { serializar, leerEscena } from '../nucleo/escena.js';
import { guardarDocumento, elegirArchivo, llevarAEscena, cambioDocumento, documentoAbierto } from './documento.js';

/**
 * Guarda la escena en su archivo, o con «Guardar como» si todavía no tiene.
 * @param {import('../nucleo/escena.js').Escena} escena
 * @returns {Promise<string | null>} ruta guardada, o null si se canceló
 */
export function guardarEscena(escena) {
  return guardarDocumento({ escena });
}

/**
 * Diálogo «Abrir»: devuelve la escena si es de esta pantalla (la pantalla la
 * carga y queda como documento abierto, con su ruta). Si es de otro módulo
 * o espacio, va a su pantalla. Si se cancela, la promesa no se resuelve.
 * @param {{modulo?: string}} [_esperado] (sin uso: cualquier escena va a su pantalla)
 * @returns {Promise<import('../nucleo/escena.js').Escena>}
 */
export function abrirEscena(_esperado) {
  return new Promise((resolver, rechazar) => {
    elegirArchivo()
      .then(e => (e ? llevarAEscena(e) : null))
      .then(e => {
        if (!e) return;
        resolver(e);
        // La pantalla la carga en su .then (síncrono); después queda como el
        // documento abierto, sin cambios y con su ruta
        setTimeout(() => documentoAbierto(e), 0);
      }, rechazar);
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
    cambioDocumento();
  },
  /** @param {string} clave @param {{modulo?: string}} esperado */
  leer(clave, esperado) {
    try {
      const t = localStorage.getItem('volta.escena.' + clave);
      const e = t ? leerEscena(t, esperado) : null;
      // Recuperar el trabajo de una pantalla también es «continuarlo»; la
      // marca le dice a registrarDocumento que recupere su archivo y cambios
      if (e) { registrarReciente(clave, e); /** @type {any} */ (e).recuperada = true; }
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
