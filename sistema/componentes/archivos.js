/* ==========================================================================
   Volta — guardar y abrir escenas, y autoguardado
   Usa la descarga del navegador para guardar y un selector de archivos para
   abrir; funciona igual en la aplicación de Windows (WebView2).
   ========================================================================== */
import { serializar, leerEscena, EXTENSION } from '../nucleo/escena.js';
import { descargarTexto, nombreArchivo } from './exportar.js';

/** Guarda la escena como archivo .volta. @param {import('../nucleo/escena.js').Escena} escena */
export function guardarEscena(escena) {
  descargarTexto(nombreArchivo(escena.titulo) + EXTENSION, serializar(escena), 'application/json;charset=utf-8');
}

/**
 * Abre un selector de archivos y devuelve la escena validada.
 * @param {{modulo?: string}} esperado
 * @returns {Promise<import('../nucleo/escena.js').Escena>}
 */
export function abrirEscena(esperado) {
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
export const autoguardado = {
  /** @param {string} clave @param {import('../nucleo/escena.js').Escena} escena */
  guardar(clave, escena) { try { localStorage.setItem('volta.escena.' + clave, serializar(escena)); } catch { /* sin almacenamiento */ } },
  /** @param {string} clave @param {{modulo?: string}} esperado */
  leer(clave, esperado) {
    try {
      const t = localStorage.getItem('volta.escena.' + clave);
      return t ? leerEscena(t, esperado) : null;
    } catch { return null; }
  },
  /** @param {string} clave */
  borrar(clave) { try { localStorage.removeItem('volta.escena.' + clave); } catch { /* sin almacenamiento */ } },
};
