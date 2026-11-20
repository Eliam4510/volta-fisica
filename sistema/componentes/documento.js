/* ==========================================================================
   Volta — el documento de cada pantalla
   Cada pantalla edita una escena: este módulo recuerda de qué archivo vino
   (ruta), si tiene cambios sin guardar (comparando con lo último guardado o
   abierto), guarda en el mismo archivo o pregunta dónde (Guardar como),
   avisa antes de perder cambios (otra escena, abrir un archivo, cerrar la
   ventana) y lleva cada archivo .volta a la pantalla de su módulo y espacio.
   El estado de cada pantalla vive en el almacenamiento local junto a su
   autoguardado, así que sobrevive a cambiar de pantalla y a reiniciar.
   La parte pura (rutas, huella, nombres) se exporta para las pruebas.
   ========================================================================== */
import { serializar, leerEscena, EXTENSION } from '../nucleo/escena.js';
import { preguntar } from './dialogo.js';

/** Texto en el idioma de la interfaz (idioma.js); fuera de la página, en español. */
const tr = (/** @type {string} */ s) => (/** @type {any} */ (globalThis).Volta?.t ? /** @type {any} */ (globalThis).Volta.t(s) : s);

// ---------------------------------------------------------------------------
// Pantallas: módulo y espacio de una escena → página
// ---------------------------------------------------------------------------

/** Página principal de cada módulo. */
export const PANTALLAS = {
  mecanica: 'mecanica.html', gravitacion: 'gravitacion.html', termodinamica: 'termodinamica.html', electrostatica: 'electrostatica.html',
  circuitos: 'circuitos.html', magnetismo: 'magnetismo.html', ondas: 'ondas.html', optica: 'optica.html', moderna: 'moderna.html',
};
/** Espacios con pantalla propia («módulo:espacio» → página). */
export const ESPACIOS = {
  'mecanica:laboratorio': 'mecanica-laboratorio.html', 'gravitacion:orbitas': 'gravitacion.html',
  'gravitacion:sistema-solar': 'gravitacion-sistema-solar.html', 'gravitacion:maniobras': 'gravitacion-maniobras.html',
  'termodinamica:ciclos': 'termodinamica-ciclos.html', 'termodinamica:molecular': 'termodinamica-molecular.html', 'termodinamica:calor': 'termodinamica-calor.html',
  'electrostatica:conductores': 'electrostatica-conductores.html', 'magnetismo:particulas': 'magnetismo-particulas.html', 'magnetismo:induccion': 'magnetismo-induccion.html',
  'ondas:doppler': 'ondas-doppler.html', 'ondas:cubeta': 'ondas-cubeta.html', 'optica:interferencia': 'optica-ondas.html', 'optica:peliculas': 'optica-peliculas.html',
  'moderna:nucleo': 'moderna-nucleo.html',
};
/** Nombre de cada módulo para títulos y avisos. */
export const NOMBRES_MODULO = {
  mecanica: 'Mecánica', gravitacion: 'Gravitación', termodinamica: 'Termodinámica', electrostatica: 'Electrostática', circuitos: 'Circuitos',
  magnetismo: 'Magnetismo e inducción', ondas: 'Ondas y sonido', optica: 'Óptica', moderna: 'Física moderna',
};

/** Página que abre una escena (o null si su módulo no tiene pantalla). @param {{modulo: string, espacio?: string}} e */
export function paginaDe(e) {
  return ESPACIOS[`${e.modulo}:${e.espacio}`] || /** @type {any} */ (PANTALLAS)[e.modulo] || null;
}
/** Clave de autoguardado de una página («optica-ondas.html» → «optica-ondas»). @param {string} pagina */
export const claveDe = pagina => pagina.replace(/\.html$/, '');

/**
 * Huella del contenido de una escena: decide si hay cambios sin guardar sin
 * guardar el texto entero (FNV-1a de 53 bits sobre el JSON de los datos).
 * @param {{datos: object, titulo?: string}} e
 */
export function huella(e) {
  const s = JSON.stringify([e.titulo ?? '', e.datos]);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return ((h2 >>> 0) % 2097152) * 4294967296 + (h1 >>> 0);
}

/** Nombre visible de un archivo: «C:\…\Mi rampa.volta» → «Mi rampa». @param {string | null} ruta */
export function nombreDeRuta(ruta) {
  if (!ruta) return '';
  return ruta.split(/[\\/]/).pop().replace(/\.(volta|json)$/i, '');
}

/** Título de la ventana: «Mi rampa • — Mecánica — Volta». @param {{nombre: string, modificado: boolean, modulo?: string}} d */
export function tituloVentana(d) {
  const mod = /** @type {any} */ (NOMBRES_MODULO)[d.modulo || ''];
  return `${d.nombre || tr('Sin título')}${d.modificado ? ' •' : ''}${mod ? ` — ${tr(mod)}` : ''} — Volta`;
}

// ---------------------------------------------------------------------------
// Estado guardado por pantalla
// ---------------------------------------------------------------------------

/** @typedef {{ruta: string | null, base: number, modificado: boolean, titulo: string, modulo: string, espacio: string}} Meta */

/** @param {string} clave @returns {Meta | null} */
export function leerMeta(clave) {
  try { const m = JSON.parse(localStorage.getItem('volta.doc.' + clave) || 'null'); return m && typeof m === 'object' ? m : null; } catch { return null; }
}
/** @param {string} clave @param {Meta} m */
function guardarMeta(clave, m) { try { localStorage.setItem('volta.doc.' + clave, JSON.stringify(m)); } catch { /* sin almacenamiento */ } }
/** Escena autoguardada de una pantalla (texto), o null. @param {string} clave */
function autoguardadaDe(clave) { try { return localStorage.getItem('volta.escena.' + clave); } catch { return null; } }

/** Pantallas con cambios sin guardar (para el aviso al cerrar). */
export function pendientesDeGuardar() {
  /** @type {{clave: string, meta: Meta}[]} */
  const r = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('volta.doc.')) continue;
      const clave = k.slice(10), meta = leerMeta(clave);
      if (meta && meta.modificado && autoguardadaDe(clave)) r.push({ clave, meta });
    }
  } catch { /* sin almacenamiento */ }
  return r;
}

// ---------------------------------------------------------------------------
// Archivos: aplicación de Windows (comandos de Rust) o navegador
// ---------------------------------------------------------------------------

const tauri = () => /** @type {any} */ (window).__TAURI__ || null;

/** Escribe una escena en una ruta. @param {string} ruta @param {string} texto */
async function escribir(ruta, texto) { await tauri().core.invoke('escribir_escena', { ruta, contenido: texto }); }
/** Lee una escena de una ruta. @param {string} ruta @returns {Promise<string>} */
export async function leerRuta(ruta) { return tauri().core.invoke('leer_escena', { ruta }); }

/** Pide una ruta con «Guardar como». @param {string} sugerido @returns {Promise<string | null>} */
async function pedirRuta(sugerido) {
  const t = tauri();
  const r = await t.dialog.save({ defaultPath: sugerido + EXTENSION, filters: [{ name: tr('Escena de Volta'), extensions: ['volta'] }] });
  if (!r) return null;
  return /\.volta$/i.test(r) ? r : r + EXTENSION;
}
/** Nombre de archivo sugerido a partir del título. @param {string} titulo */
export function nombreSugerido(titulo) {
  // eslint-disable-next-line no-control-regex
  return String(titulo || 'Escena').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Escena';
}
/** Descarga en el navegador (sin aplicación). @param {string} nombre @param {string} texto */
function descargar(nombre, texto) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------------------------------------------------------------------------
// El documento de esta pantalla
// ---------------------------------------------------------------------------

/** @type {null | {clave: string, escena: () => any, ruta: string | null, base: number, modificado: boolean}} */
let doc = null;

/** Actualiza el título de la ventana y la marca de cambios de la barra. */
function pintar() {
  if (!doc) return;
  const e = doc.escena(), nombre = nombreDeRuta(doc.ruta) || e.titulo;
  const t = tituloVentana({ nombre, modificado: doc.modificado, modulo: e.modulo });
  try { tauri()?.window?.getCurrentWindow?.().setTitle(t); } catch { /* fuera de la aplicación */ }
  const el = document.getElementById('escena-nombre');
  if (el) {
    let marca = document.getElementById('marca-cambios');
    if (!marca) { marca = document.createElement('span'); marca.id = 'marca-cambios'; marca.className = 'marca-cambios'; marca.textContent = '•'; el.after(marca); }
    marca.hidden = !doc.modificado;
    marca.title = doc.modificado ? 'Cambios sin guardar' : '';
    el.title = doc.ruta ? doc.ruta : 'Sin guardar en ningún archivo';
  }
}
function persistir() {
  if (!doc) return;
  const e = doc.escena();
  guardarMeta(doc.clave, { ruta: doc.ruta, base: doc.base, modificado: doc.modificado, titulo: String(e.titulo || ''), modulo: e.modulo, espacio: e.espacio });
}

/**
 * La pantalla registra su documento al terminar de cargar. `origen` es la
 * escena que cargó si vino del autoguardado (marcada por autoguardado.leer)
 * o de un archivo (lleva `ruta`); null si es una escena del catálogo.
 * `abrir` y `guardar` son las acciones de la pantalla, para los botones
 * comunes de la barra ([data-accion="abrir"], [data-accion="guardar"]).
 * @param {{clave: string, escena: () => any, origen?: any, abrir?: () => void, guardar?: () => void}} o
 */
export function registrarDocumento(o) {
  // Se registra al cargar; el contenido de referencia se toma cuando la
  // pantalla termina de arrancar (en la siguiente vuelta del bucle), para
  // que lo que calcula después de cargar no cuente como cambio
  setTimeout(() => {
    const meta = leerMeta(o.clave), ahora = huella(o.escena());
    doc = { clave: o.clave, escena: o.escena, ruta: null, base: ahora, modificado: false };
    if (o.origen && typeof o.origen.ruta === 'string') doc.ruta = o.origen.ruta;
    else if (o.origen && o.origen.recuperada && meta) {
      // Se recupera el trabajo de la última vez: su archivo y si tenía
      // cambios. No se compara con la huella guardada: al normalizar la
      // escena recuperada, la pantalla puede reordenar o completar datos
      // sin que cambie nada de verdad
      doc.ruta = meta.ruta || null;
      doc.base = meta.modificado ? (Number.isFinite(meta.base) && meta.base !== ahora ? meta.base : ahora + 1) : ahora;
    }
    doc.modificado = doc.base !== ahora;
    persistir(); pintar();
  }, 0);
  vigilarCierre();
  recibirArchivos();
  document.querySelectorAll('[data-accion="abrir"]').forEach(b => b.addEventListener('click', () => o.abrir?.()));
  document.querySelectorAll('[data-accion="guardar"]').forEach(b => b.addEventListener('click', () => o.guardar?.()));
  document.addEventListener('keydown', ev => {
    if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase() === 's') { ev.preventDefault(); ev.stopPropagation(); guardarDocumento({ como: true }); }
  }, true);
}

/** La escena cambió (lo llama el autoguardado). */
export function cambioDocumento() {
  if (!doc) return;
  const m = huella(doc.escena()) !== doc.base;
  if (m !== doc.modificado) { doc.modificado = m; pintar(); }
  persistir();
}
/** Se cargó una escena del catálogo: documento nuevo, sin archivo. */
export function documentoNuevo() {
  if (!doc) return;
  doc.ruta = null; doc.base = huella(doc.escena()); doc.modificado = false; persistir(); pintar();
}
/** Se cargó un archivo abierto (la escena lleva su ruta). @param {{ruta?: string}} e */
export function documentoAbierto(e) {
  if (!doc) return;
  doc.ruta = typeof e?.ruta === 'string' ? e.ruta : null; doc.base = huella(doc.escena()); doc.modificado = false; persistir(); pintar();
}
/** ¿Tiene cambios sin guardar el documento de esta pantalla? */
export const hayCambios = () => !!doc?.modificado;

/**
 * Guarda el documento: en su archivo, o preguntando dónde (Guardar como).
 * Devuelve la ruta, o null si se canceló.
 * @param {{como?: boolean, escena?: any}} [o]
 */
export async function guardarDocumento(o = {}) {
  const e = o.escena || doc?.escena();
  if (!e) return null;
  const texto = serializar(e);
  if (!tauri()?.core) { descargar(nombreSugerido(e.titulo) + EXTENSION, texto); if (doc) { doc.base = huella(e); doc.modificado = false; persistir(); pintar(); } return nombreSugerido(e.titulo) + EXTENSION; }
  let ruta = !o.como && doc?.ruta ? doc.ruta : null;
  if (!ruta) ruta = await pedirRuta(doc?.ruta ? nombreDeRuta(doc.ruta) : nombreSugerido(e.titulo));
  if (!ruta) return null;
  await escribir(ruta, texto);
  if (doc) { doc.ruta = ruta; doc.base = huella(e); doc.modificado = false; persistir(); pintar(); }
  registrarArchivoReciente(ruta, e);
  return ruta;
}

/**
 * Antes de reemplazar la escena de esta pantalla: si tiene cambios, pregunta
 * si guardarlos. Devuelve true si se puede seguir.
 * @param {string} [accion] qué se va a hacer, para el texto del aviso
 */
export async function confirmarCambios(accion = 'seguir') {
  if (!doc?.modificado) return true;
  const e = doc.escena(), nombre = nombreDeRuta(doc.ruta) || e.titulo;
  const r = await preguntar({
    titulo: `¿Guardar los cambios de «${nombre}»?`,
    texto: `Si no los guardas, se pierden al ${accion}.`,
    botones: [{ id: 'cancelar', texto: 'Cancelar' }, { id: 'descartar', texto: 'No guardar' }, { id: 'guardar', texto: 'Guardar', principal: true }],
  });
  if (r === 'cancelar') return false;
  if (r === 'guardar') return !!(await guardarDocumento().catch(() => null));
  return true;
}

/**
 * Antes de cargar otra escena en la pantalla `clave` (desde Inicio o al
 * abrir un archivo de otro espacio): si allí hay cambios sin guardar,
 * pregunta. Guarda desde su autoguardado si hace falta.
 * @param {string} clave @param {string} accion
 */
export async function confirmarCambiosDe(clave, accion) {
  if (doc && doc.clave === clave) return confirmarCambios(accion);
  const meta = leerMeta(clave), texto = autoguardadaDe(clave);
  if (!meta?.modificado || !texto) return true;
  const nombre = nombreDeRuta(meta.ruta) || meta.titulo || 'sin título';
  const r = await preguntar({
    titulo: `¿Guardar los cambios de «${nombre}»?`,
    texto: `Esa escena de ${/** @type {any} */ (NOMBRES_MODULO)[meta.modulo] || 'otra pantalla'} tiene cambios sin guardar; si no los guardas, se pierden al ${accion}.`,
    botones: [{ id: 'cancelar', texto: 'Cancelar' }, { id: 'descartar', texto: 'No guardar' }, { id: 'guardar', texto: 'Guardar', principal: true }],
  });
  if (r === 'cancelar') return false;
  if (r === 'guardar') {
    const ok = await guardarAutoguardada(clave).catch(() => false);
    if (!ok) return false;
  }
  guardarMeta(clave, { ...meta, modificado: false });
  return true;
}
/** Guarda en archivo la escena autoguardada de otra pantalla. @param {string} clave */
async function guardarAutoguardada(clave) {
  const meta = leerMeta(clave), texto = autoguardadaDe(clave);
  if (!meta || !texto) return false;
  const e = leerEscena(texto);
  if (!tauri()?.core) { descargar(nombreSugerido(e.titulo) + EXTENSION, serializar(e)); return true; }
  const ruta = meta.ruta || await pedirRuta(nombreSugerido(e.titulo));
  if (!ruta) return false;
  await escribir(ruta, serializar(e));
  guardarMeta(clave, { ...meta, ruta, base: huella(e), modificado: false });
  registrarArchivoReciente(ruta, e);
  return true;
}

// ---------------------------------------------------------------------------
// Abrir: cualquier archivo .volta va a su pantalla
// ---------------------------------------------------------------------------

/**
 * Abre una escena ya leída: si es de esta pantalla, la devuelve para que la
 * pantalla la cargue; si es de otra, la deja preparada allí y navega.
 * @param {any} e escena validada (con `ruta` si vino de un archivo)
 * @param {string} [paginaActual]
 * @returns {Promise<any | null>} la escena, o null si se fue a otra pantalla o se canceló
 */
export async function llevarAEscena(e, paginaActual = location.pathname.split('/').pop() || '') {
  const pagina = paginaDe(e);
  if (!pagina) throw new Error(`El módulo «${e.modulo}» de esta escena no existe en esta versión.`);
  if (pagina === paginaActual) {
    if (!(await confirmarCambios('abrir otro archivo'))) return null;
    return e;
  }
  if (!(await confirmarCambiosDe(claveDe(pagina), 'abrir otro archivo'))) return null;
  try { sessionStorage.setItem('volta.abrir', JSON.stringify(e)); } catch { /* sin almacenamiento */ }
  location.href = pagina;
  return null;
}

/** Lee un archivo por su ruta (aplicación) y lo valida. @param {string} ruta */
export async function escenaDeRuta(ruta) {
  const e = leerEscena(await leerRuta(ruta));
  e.ruta = ruta;
  registrarArchivoReciente(ruta, e);
  return e;
}

/**
 * Diálogo «Abrir» y validación. Resuelve con la escena (con `ruta`) o null
 * si se canceló.
 * @returns {Promise<any | null>}
 */
export async function elegirArchivo() {
  const t = tauri();
  if (t?.dialog && t?.core) {
    const ruta = await t.dialog.open({ multiple: false, directory: false, filters: [{ name: tr('Escena de Volta'), extensions: ['volta', 'json'] }] });
    if (!ruta) return null;
    return escenaDeRuta(String(ruta));
  }
  return new Promise((resolver, rechazar) => {
    const entrada = document.createElement('input');
    entrada.type = 'file'; entrada.accept = `${EXTENSION},.json,application/json`;
    entrada.addEventListener('change', async () => {
      const archivo = entrada.files && entrada.files[0];
      if (!archivo) { resolver(null); return; }
      try { resolver(leerEscena(await archivo.text())); } catch (err) { rechazar(err); }
    });
    entrada.click();
  });
}

// ---------------------------------------------------------------------------
// Archivos recientes (rutas reales, para Inicio)
// ---------------------------------------------------------------------------

/** @returns {{ruta: string, titulo: string, modulo: string, espacio: string | null, t: number}[]} */
export function archivosRecientes() {
  try {
    const l = JSON.parse(localStorage.getItem('volta.archivos') || '[]');
    return Array.isArray(l) ? l.filter(r => r && typeof r.ruta === 'string' && typeof r.modulo === 'string').slice(0, 12) : [];
  } catch { return []; }
}
/** @param {string} ruta @param {any} e */
function registrarArchivoReciente(ruta, e) {
  try {
    const l = archivosRecientes().filter(r => r.ruta.toLowerCase() !== ruta.toLowerCase());
    l.unshift({ ruta, titulo: String(e.titulo || ''), modulo: e.modulo, espacio: e.espacio ?? null, t: Date.now() });
    localStorage.setItem('volta.archivos', JSON.stringify(l.slice(0, 12)));
  } catch { /* sin almacenamiento */ }
}

// ---------------------------------------------------------------------------
// Cerrar la ventana con cambios sin guardar; archivos que llegan de Windows
// ---------------------------------------------------------------------------

let vigilando = false;
/** Pregunta antes de cerrar la aplicación si alguna pantalla tiene cambios. */
export function vigilarCierre() {
  const t = tauri();
  if (vigilando || !t?.window?.getCurrentWindow) return;
  vigilando = true;
  const ventana = t.window.getCurrentWindow();
  ventana.onCloseRequested(async (/** @type {any} */ ev) => {
    const lista = pendientesDeGuardar();
    if (!lista.length) return;
    ev.preventDefault();
    const r = await preguntar({
      titulo: lista.length === 1 ? '¿Guardar los cambios antes de cerrar?' : `¿Guardar los cambios de ${lista.length} escenas antes de cerrar?`,
      texto: 'Si cierras sin guardar, Volta las recupera la próxima vez que la abras, pero no quedan en ningún archivo.',
      detalle: lista.map(({ meta }) => `${nombreDeRuta(meta.ruta) || meta.titulo || 'Sin título'} (${/** @type {any} */ (NOMBRES_MODULO)[meta.modulo] || meta.modulo})`),
      botones: [{ id: 'cancelar', texto: 'Cancelar' }, { id: 'cerrar', texto: 'Cerrar sin guardar' }, { id: 'guardar', texto: 'Guardar y cerrar', principal: true }],
    });
    if (r === 'cancelar') return;
    if (r === 'guardar') {
      for (const { clave } of lista) {
        const ok = doc && doc.clave === clave ? !!(await guardarDocumento().catch(() => null)) : await guardarAutoguardada(clave).catch(() => false);
        if (!ok) return;     // canceló un «Guardar como»: no se cierra
      }
    }
    await ventana.destroy();
  });
}

/**
 * Archivos que Windows le pasa a Volta (doble clic en un .volta, arrastrarlo
 * a la ventana, o abrirlo con Volta ya abierta): se abren en su pantalla
 * (si es esta misma, se recarga con el archivo, por el camino normal de
 * arranque). Cada página lo activa una vez.
 */
let recibiendo = false;
export function recibirArchivos() {
  const t = tauri();
  if (recibiendo || !t?.core) return;
  recibiendo = true;
  const abrirRuta = async (/** @type {string} */ ruta) => {
    try {
      const e = await escenaDeRuta(ruta), pagina = paginaDe(e);
      if (!pagina) throw new Error(`El módulo «${e.modulo}» de esta escena no existe en esta versión.`);
      if (!(await confirmarCambiosDe(claveDe(pagina), 'abrir otro archivo'))) return;
      try { sessionStorage.setItem('volta.abrir', JSON.stringify(e)); } catch { /* sin almacenamiento */ }
      location.href = pagina;
    } catch (err) {
      preguntar({ titulo: 'No se pudo abrir el archivo', texto: String(/** @type {any} */ (err)?.message || err), botones: [{ id: 'ok', texto: 'Aceptar', principal: true }] });
    }
  };
  // Con Volta abierta: la otra instancia manda el archivo por un evento
  t.event?.listen?.('abrir-archivo', (/** @type {any} */ ev) => { if (typeof ev.payload === 'string') abrirRuta(ev.payload); });
  // Arrastrar archivos .volta a la ventana
  try {
    t.webview?.getCurrentWebview?.().onDragDropEvent?.((/** @type {any} */ ev) => {
      if (ev.payload?.type !== 'drop') return;
      const ruta = (ev.payload.paths || []).find((/** @type {string} */ p) => /\.(volta|json)$/i.test(p));
      if (ruta) abrirRuta(ruta);
    });
  } catch { /* sin arrastrar y soltar */ }
  // El archivo con el que se arrancó Volta (doble clic con Volta cerrada)
  t.core.invoke('archivo_inicial').then((/** @type {string | null} */ ruta) => { if (ruta) abrirRuta(ruta); }).catch(() => {});
}
