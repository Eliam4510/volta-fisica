/* ==========================================================================
   Volta — Ajustes
   Ventana de preferencias de la aplicación: solo lo que de verdad cambia
   algo. Tema (claro, oscuro o el de Windows), tamaño de la interfaz y la
   búsqueda automática de actualizaciones. Se guardan en este equipo y se
   aplican en todas las pantallas (componentes/espacio.js).
   ========================================================================== */

import { decimalComa, ponerDecimalComa } from '../nucleo/numeros.js';

const V = () => /** @type {any} */ (window).Volta;
const enApp = () => !!(/** @type {any} */ (window).__TAURI__?.webview);

/** ¿Busca Inicio las actualizaciones al abrirse? */
export function actualizarSolo() {
  try { return localStorage.getItem('volta.actualizacion.auto') !== 'no'; } catch { return true; }
}

/**
 * Abre la ventana de Ajustes.
 * @param {{alCambiar?: () => void}} [o]
 */
export function abrirPreferencias(o = {}) {
  document.querySelector('.dialogo-fondo.preferencias')?.remove();
  const fondo = document.createElement('div');
  fondo.className = 'dialogo-fondo preferencias';
  const tema = V()?.preferenciaTema?.() || 'sistema', zoom = V()?.leerZoom?.() || 1;
  const seg = (/** @type {string} */ nombre, /** @type {[string, string][]} */ ops, /** @type {string} */ actual) =>
    `<div class="segmentado texto" data-pref="${nombre}">${ops.map(([v, t]) => `<button data-v="${v}" aria-pressed="${v === actual}">${t}</button>`).join('')}</div>`;
  fondo.innerHTML = `
    <div class="dialogo dialogo-ancho" role="dialog" aria-modal="true" aria-labelledby="pref-titulo">
      <h2 id="pref-titulo">Ajustes</h2>
      <div class="pref-grupo">
        <div class="pref-fila"><span>Tema</span>${seg('tema', [['claro', 'Claro'], ['oscuro', 'Oscuro'], ['sistema', 'Como Windows']], tema)}</div>
        <div class="pref-fila"><span>Tamaño de la interfaz</span>${seg('zoom', (V()?.ZOOMS || [1]).map((/** @type {number} */ z) => [String(z), `${Math.round(z * 100)} %`]), String(zoom))}</div>
        ${enApp() ? '' : '<p class="pref-nota">En el navegador, el tamaño se cambia con Ctrl + y Ctrl −.</p>'}
      </div>
      <div class="pref-grupo">
        <div class="pref-fila"><span>Separador decimal</span>${seg('decimal', [['punto', 'Punto (1.5)'], ['coma', 'Coma (1,5)']], decimalComa() ? 'coma' : 'punto')}</div>
        <p class="pref-nota">Para escribir los valores y leerlos en pantalla y en las tablas. Con coma, el CSV separa las columnas con punto y coma, como lo abre Excel en español de España.</p>
      </div>
      <div class="pref-grupo">
        <div class="pref-fila"><span>Buscar actualizaciones al abrir Inicio</span>${seg('actualizar', [['si', 'Sí'], ['no', 'No']], actualizarSolo() ? 'si' : 'no')}</div>
      </div>
      <div class="dialogo-acciones">
        <button class="btn btn-secundario" data-pref-accion="restablecer">Restablecer</button>
        <span style="flex:1"></span>
        <button class="btn btn-primario" data-pref-accion="cerrar">Listo</button>
      </div>
    </div>`;
  document.body.appendChild(fondo);
  const cerrar = () => { document.removeEventListener('keydown', teclas, true); fondo.remove(); };
  const teclas = (/** @type {KeyboardEvent} */ ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cerrar(); } };
  document.addEventListener('keydown', teclas, true);
  fondo.addEventListener('pointerdown', ev => { if (ev.target === fondo) cerrar(); });
  fondo.addEventListener('click', ev => {
    const t = /** @type {HTMLElement} */ (ev.target);
    const acc = t.closest('[data-pref-accion]');
    if (acc) {
      if (/** @type {HTMLElement} */ (acc).dataset.prefAccion === 'restablecer') {
        V()?.ponerTema?.('sistema'); V()?.ponerZoom?.(1);
        try { localStorage.removeItem('volta.actualizacion.auto'); localStorage.removeItem('volta.decimal'); } catch { /* sin almacenamiento */ }
        ponerDecimalComa(null);
        cerrar(); abrirPreferencias(o); o.alCambiar?.(); return;
      }
      cerrar(); return;
    }
    const b = /** @type {HTMLElement | null} */ (t.closest('.segmentado button'));
    if (!b) return;
    const grupo = /** @type {HTMLElement} */ (b.parentElement), v = /** @type {string} */ (b.dataset.v);
    grupo.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    if (grupo.dataset.pref === 'tema') V()?.ponerTema?.(v);
    else if (grupo.dataset.pref === 'zoom') V()?.ponerZoom?.(parseFloat(v));
    else if (grupo.dataset.pref === 'actualizar') { try { localStorage.setItem('volta.actualizacion.auto', v); } catch { /* sin almacenamiento */ } }
    else if (grupo.dataset.pref === 'decimal') { try { localStorage.setItem('volta.decimal', v); } catch { /* sin almacenamiento */ } ponerDecimalComa(v === 'coma'); }
    o.alCambiar?.();
  });
  /** @type {HTMLElement | null} */ (fondo.querySelector('[data-pref-accion="cerrar"]'))?.focus();
}
