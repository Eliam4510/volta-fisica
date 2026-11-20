/* ==========================================================================
   Volta — actualizaciones desde GitHub
   La aplicación de Windows consulta latest.json de la última release
   (plugin updater de Tauri, firmado con la clave del proyecto). Si hay una
   versión nueva, Inicio la anuncia: la instalada se descarga, se instala y
   se reinicia; la portátil abre la página de descarga. En el navegador no
   hace nada. La lógica pura (comparar versiones, cuándo volver a buscar,
   resumir las notas) va aparte para poder probarla.
   ========================================================================== */

/** Página de la última release (para la versión portátil). */
export const PAGINA_RELEASES = 'https://github.com/Eliam4510/volta-fisica/releases/latest';
/** Cada cuánto se busca sola una versión nueva al abrir Inicio (ms). */
export const INTERVALO_BUSQUEDA = 6 * 3600 * 1000;
const CLAVE = 'volta.actualizacion';

/**
 * Compara dos versiones «X.Y.Z» (con o sin «v»; una etiqueta previa como
 * «-beta» cuenta como anterior a la versión sin ella).
 * @param {string} a @param {string} b @returns {number} negativo si a < b, 0 si iguales, positivo si a > b
 */
export function compararVersiones(a, b) {
  const partes = v => {
    const [num, pre = ''] = String(v || '').trim().replace(/^v/i, '').split('-', 2);
    return { n: num.split('.').map(x => parseInt(x, 10) || 0), pre };
  };
  const A = partes(a), B = partes(b);
  for (let i = 0; i < Math.max(A.n.length, B.n.length, 3); i++) {
    const d = (A.n[i] || 0) - (B.n[i] || 0);
    if (d) return d;
  }
  if (A.pre === B.pre) return 0;
  if (!A.pre) return 1;
  if (!B.pre) return -1;
  return A.pre < B.pre ? -1 : 1;
}

/**
 * ¿Toca buscar sola? Sí si nunca se buscó o pasó el intervalo; un reloj que
 * va hacia atrás (cambio de hora del equipo) también cuenta como pasado.
 * @param {{ultima?: number} | null} estado @param {number} ahora @param {number} [intervalo]
 */
export function debeBuscar(estado, ahora, intervalo = INTERVALO_BUSQUEDA) {
  const u = estado?.ultima;
  return !Number.isFinite(u) || ahora - /** @type {number} */ (u) >= intervalo || ahora < /** @type {number} */ (u);
}

/**
 * Notas de la versión en texto corto para el aviso: sin marcas de Markdown
 * ni títulos, solo los puntos, cortadas en un final de línea.
 * @param {string} texto @param {number} [max=480]
 */
export function resumenNotas(texto, max = 480) {
  const lineas = String(texto || '').split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !/^#{1,6}\s/.test(l))
    .map(l => l.replace(/^[-*]\s+/, '• ').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'));
  let r = '';
  for (const l of lineas) {
    if (r.length + l.length + 1 > max) { r += r ? '\n…' : l.slice(0, max - 1) + '…'; break; }
    r += (r ? '\n' : '') + l;
  }
  return r;
}

/** Porcentaje entero de una descarga (0 si no se conoce el total). @param {number} hecho @param {number} total */
export function porcentaje(hecho, total) {
  return total > 0 ? Math.max(0, Math.min(100, Math.round(100 * hecho / total))) : 0;
}

/** API nativa con el actualizador, o null en el navegador. */
export function nativa() {
  const t = /** @type {any} */ (window).__TAURI__;
  return t && t.updater && t.core ? t : null;
}

/** Estado guardado: última búsqueda y versión que se pidió no volver a anunciar. */
export function leerEstado() {
  try { return JSON.parse(localStorage.getItem(CLAVE) || 'null') || {}; } catch { return {}; }
}
/** @param {object} cambios */
function guardarEstado(cambios) {
  try { localStorage.setItem(CLAVE, JSON.stringify({ ...leerEstado(), ...cambios })); } catch { /* sin almacenamiento */ }
}

/**
 * Busca una versión nueva.
 * @returns {Promise<{estado: 'navegador'} | {estado: 'al-dia', actual?: string} | {estado: 'disponible', version: string, actual: string, notas: string, instalada: boolean, upd: any}>}
 */
export async function buscarActualizacion() {
  const t = nativa();
  if (!t) return { estado: 'navegador' };
  guardarEstado({ ultima: Date.now() });
  const upd = await t.updater.check();
  if (!upd) return { estado: 'al-dia' };
  const instalada = await t.core.invoke('instalada').catch(() => false);
  return { estado: 'disponible', version: upd.version, actual: upd.currentVersion, notas: upd.body || '', instalada: !!instalada, upd };
}

/**
 * Descarga e instala la actualización y reinicia Volta. En Windows el
 * instalador cierra la aplicación por su cuenta; el reinicio queda por si no.
 * @param {any} upd @param {(p: number) => void} [alProgreso]
 */
export async function instalarActualizacion(upd, alProgreso) {
  let total = 0, hecho = 0;
  await upd.downloadAndInstall((/** @type {any} */ ev) => {
    if (ev.event === 'Started') total = ev.data?.contentLength || 0;
    else if (ev.event === 'Progress') { hecho += ev.data?.chunkLength || 0; alProgreso?.(porcentaje(hecho, total)); }
    else if (ev.event === 'Finished') alProgreso?.(100);
  });
  await nativa()?.process?.relaunch?.();
}

/** Abre la página de descarga en el navegador del sistema. */
export function abrirDescarga() {
  const t = /** @type {any} */ (window).__TAURI__;
  if (t?.opener?.openUrl) return t.opener.openUrl(PAGINA_RELEASES);
  window.open(PAGINA_RELEASES, '_blank', 'noopener');
}

/**
 * Aviso de versión nueva en el contenedor dado (Inicio). Con `manual`, se
 * busca aunque no toque y se informa también si está al día o si falla.
 * @param {HTMLElement} contenedor @param {{manual?: boolean, avisar?: (texto: string) => void}} [o]
 */
export async function anunciarActualizacion(contenedor, o = {}) {
  if (!nativa()) { if (o.manual) o.avisar?.('Las actualizaciones se buscan desde la aplicación de Windows.'); return; }
  if (!o.manual && !debeBuscar(leerEstado(), Date.now())) return;
  // Ajustes: «Buscar actualizaciones al abrir Inicio» desactivado
  if (!o.manual) { try { if (localStorage.getItem('volta.actualizacion.auto') === 'no') return; } catch { /* sin almacenamiento */ } }
  let r;
  try { r = await buscarActualizacion(); }
  catch { if (o.manual) o.avisar?.('No se pudo consultar GitHub. Revisa la conexión y vuelve a intentarlo.'); return; }
  if (r.estado !== 'disponible') { if (o.manual) o.avisar?.('Volta está al día.'); return; }
  if (!o.manual && leerEstado().omitida === r.version) return;
  contenedor.querySelector('.aviso-actualizacion')?.remove();
  const el = document.createElement('div');
  el.className = 'aviso-actualizacion';
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <div class="texto-act">
      <strong></strong><span class="nota"></span>
      <pre class="notas-act" hidden></pre>
    </div>
    <div class="acciones-act">
      <button class="btn btn-compacto" data-act="notas">Novedades</button>
      <button class="btn btn-compacto" data-act="luego">Ahora no</button>
      <button class="btn btn-compacto btn-primario" data-act="instalar"></button>
    </div>`;
  /** @type {HTMLElement} */ (el.querySelector('strong')).textContent = `Volta ${r.version} está disponible`;
  /** @type {HTMLElement} */ (el.querySelector('.nota')).textContent = `Tienes la ${r.actual}.${r.instalada ? ' Se descarga, se instala y Volta se reinicia; tus escenas no se tocan.' : ' Esta es la versión portátil: descarga la nueva desde GitHub.'}`;
  const notas = /** @type {HTMLElement} */ (el.querySelector('.notas-act'));
  notas.textContent = resumenNotas(r.notas) || 'Sin notas.';
  const instalar = /** @type {HTMLButtonElement} */ (el.querySelector('[data-act="instalar"]'));
  instalar.textContent = r.instalada ? 'Instalar y reiniciar' : 'Descargar';
  el.addEventListener('click', async ev => {
    const b = /** @type {HTMLElement} */ (ev.target).closest('[data-act]');
    if (!b) return;
    const act = /** @type {HTMLElement} */ (b).dataset.act;
    if (act === 'notas') { notas.hidden = !notas.hidden; return; }
    if (act === 'luego') { guardarEstado({ omitida: r.version }); el.remove(); return; }
    if (!r.instalada) { abrirDescarga(); return; }
    el.querySelectorAll('button').forEach(x => { /** @type {HTMLButtonElement} */ (x).disabled = true; });
    const nota = /** @type {HTMLElement} */ (el.querySelector('.nota'));
    nota.textContent = 'Descargando… 0 %';
    try {
      await instalarActualizacion(r.upd, p => { nota.textContent = p < 100 ? `Descargando… ${p} %` : 'Instalando…'; });
    } catch (err) {
      nota.textContent = `No se pudo instalar: ${err?.message || err}. Puedes descargarla desde GitHub.`;
      instalar.textContent = 'Descargar'; r.instalada = false;
      el.querySelectorAll('button').forEach(x => { /** @type {HTMLButtonElement} */ (x).disabled = false; });
    }
  });
  contenedor.prepend(el);
}
