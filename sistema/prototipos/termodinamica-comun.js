/* ==========================================================================
   Volta · Termodinámica — piezas de interfaz comunes a sus espacios
   Menú de escenas agrupado (Tutoriales, Ejemplos, MEXT), título de la
   escena, abrir una escena de otro espacio del módulo en su pantalla,
   filas del examen, panel de variables, paleta de comandos, avisos sobre el
   lienzo y reproducción con la línea de tiempo. Solo se usa en el navegador
   (las funciones tocan el DOM cuando se llaman, no al importarse).
   ========================================================================== */
import { fmt, cantidad } from '../nucleo/formato.js';
import { PAGINAS } from './termodinamica-escenas.js';

export const GRUPOS = Object.freeze([['Tutorial', 'Tutoriales', 'i-tutorial'], ['Ejemplo', 'Ejemplos', 'i-ejemplo'], ['MEXT', 'MEXT', 'i-mext']]);
export const ICONO_TIPO = Object.freeze({ Tutorial: 'i-tutorial', Ejemplo: 'i-ejemplo', MEXT: 'i-mext', Propio: 'i-escena' });
const $ = s => document.querySelector(s);

/** Texto del chip de una escena: «MEXT 2019 P4», «Tutorial»… */
export const chipDe = e => (e.tipo === 'MEXT' ? `MEXT ${e.anio || ''}`.trim() : e.tipo || 'Propio');

/** Pone el chip y el nombre de la escena en la barra y el título de la ventana. */
export function ponerTitulo(e, espacio) {
  const chip = $('#escena-chip');
  if (chip) { chip.textContent = chipDe(e); chip.className = 'chip' + (e.tipo === 'MEXT' ? ' lleno' : ''); }
  const nom = $('#escena-nombre'); if (nom) nom.textContent = e.titulo;
  document.title = `Volta · ${espacio} · ${e.titulo}`;
}

/**
 * Menú de escenas bajo #b-escenas: grupos Tutoriales, Ejemplos y MEXT.
 * @param {any[]} escenas @param {() => string} actual clave abierta @param {(clave: string) => void} abrir
 */
export function iniciarMenuEscenas(escenas, actual, abrir) {
  const menu = $('#menu-escenas'), boton = $('#b-escenas');
  const cerrar = () => { menu.hidden = true; };
  function pintar() {
    menu.innerHTML = GRUPOS.map(([g, tit, ico], i) => (i ? '<div class="menu-sep"></div>' : '') + `<div class="menu-titulo">${tit}</div>` +
      escenas.filter(e => e.tipo === g).map(e => `<div class="menu-item" role="menuitem" data-clave="${e.clave}"${e.clave === actual() ? ' aria-current="true"' : ''}><svg class="ico"><use href="#${ico}"/></svg><span class="nombre-escena">${e.titulo}</span>${e.anio ? `<span class="chip lleno">${e.anio}</span>` : ''}</div>`).join('')).join('');
    const r = boton.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(innerWidth - 440, r.left)) + 'px'; menu.style.top = (r.bottom + 4) + 'px';
    menu.hidden = false;
  }
  boton.addEventListener('click', ev => { ev.stopPropagation(); if (menu.hidden) pintar(); else cerrar(); });
  menu.addEventListener('click', ev => { const it = ev.target instanceof Element ? ev.target.closest('.menu-item') : null; if (!it) return; cerrar(); abrir(it.dataset.clave); });
  document.addEventListener('pointerdown', ev => { if (!(ev.target instanceof Element) || !ev.target.closest('#menu-escenas, #b-escenas')) cerrar(); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') cerrar(); });
  return { cerrar };
}

/**
 * Una escena (de archivo o de Inicio) de otro espacio de Termodinámica se abre
 * en su pantalla. Devuelve true si se fue a otra página.
 * @param {{espacio?: string}} e @param {string} propio
 */
export function aOtroEspacio(e, propio) {
  if (!e || !e.espacio || e.espacio === propio || !PAGINAS[e.espacio]) return false;
  try { sessionStorage.setItem('volta.abrir', JSON.stringify(e)); } catch { /* sin almacenamiento */ }
  location.href = PAGINAS[e.espacio];
  return true;
}

/** Abre una escena del catálogo de otro espacio por su clave. */
export function irAEscenaDeOtroEspacio(e) {
  location.href = `${PAGINAS[e.espacio]}?escena=${encodeURIComponent(e.clave)}`;
}

// ---------------------------------------------------------------------------
// Valores y variables
// ---------------------------------------------------------------------------
export const simHTML = d => `${d.sim}${d.sub ? `<sub class="r">${d.sub}</sub>` : ''}`;
/** Valor de una variable con los decimales de su paso. */
export function fmtVar(d) {
  const dec = !(d.paso > 0) || d.paso >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(d.paso) - 1e-9));
  return d.val.toFixed(dec).replace('-', '−');
}

/**
 * Panel de variables con deslizadores. alEmpezar se llama una vez por gesto
 * (para el historial); alCambiar en cada movimiento.
 * @param {HTMLElement} cont @param {Record<string, any>} VAR
 * @param {(k: string) => void} alCambiar @param {() => void} [alEmpezar]
 */
export function construirVariables(cont, VAR, alCambiar, alEmpezar = () => {}) {
  cont.innerHTML = '';
  let arrastrando = false;
  for (const [k, d] of Object.entries(VAR)) {
    const f = document.createElement('div'); f.className = 'var' + (d.constante ? ' constante' : '');
    if (d.ayuda) f.dataset.ayuda = d.ayuda;
    const control = d.constante ? '<span class="constante-etq">Constante</span>'
      : `<input class="deslizador" type="range" min="${d.min}" max="${d.max}" step="${d.paso}" value="${d.val}" aria-label="${d.sim}">`;
    f.innerHTML = `<span class="sim">${simHTML(d)}</span>${control}<span class="valor"></span>`;
    const ent = f.querySelector('input'), val = f.querySelector('.valor');
    const pintar = () => { val.innerHTML = `${fmtVar(d)}${d.u ? `<span class="u">${d.u}</span>` : ''}`; if (ent) global().pintarDeslizador(ent); };
    if (ent) {
      ent.addEventListener('input', () => { if (!arrastrando) { alEmpezar(); arrastrando = true; } d.val = parseFloat(ent.value); pintar(); alCambiar(k); });
      ent.addEventListener('change', () => { arrastrando = false; });
    }
    pintar(); cont.appendChild(f);
  }
}
const global = () => /** @type {any} */ (window).Volta;

// ---------------------------------------------------------------------------
// Inspector de las escenas propias: filas editables a partir de los
// parámetros de cada pieza (termodinamica-montaje.js)
// ---------------------------------------------------------------------------
/** Número con los decimales de su paso («0.50», «300»), con signo menos verdadero. */
export function numTexto(v, paso) {
  if (!Number.isFinite(v)) return '';
  const dec = !(paso > 0) || paso >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(paso) - 1e-9));
  return v.toFixed(dec).replace('-', '−');
}
/**
 * Filas del inspector para editar los parámetros de una pieza: campo con su
 * unidad, control segmentado (hasta tres opciones) o lista desplegable.
 * @param {any[]} specs @param {Record<string, any>} holder
 */
export function filasParametros(specs, holder) {
  return specs.map(s => {
    const v = holder[s.k], ayuda = s.ayuda ? ` data-ayuda="${s.ayuda}"` : '';
    let control;
    if (s.opciones && s.opciones.length <= 3) control = `<div class="segmentado texto" data-param="${s.k}"${ayuda}>${s.opciones.map(([x, txt]) => `<button data-v="${x}" aria-pressed="${x === v}">${txt}</button>`).join('')}</div>`;
    else if (s.opciones) control = `<div class="campo texto"${ayuda}><select data-param="${s.k}" aria-label="${s.etq}">${s.opciones.map(([x, txt]) => `<option value="${x}"${x === v ? ' selected' : ''}>${txt}</option>`).join('')}</select></div>`;
    else control = `<div class="campo"${ayuda}><input data-param="${s.k}" value="${numTexto(v, s.paso)}" inputmode="decimal" aria-label="${s.etq}"><span class="u">${s.u}</span></div>`;
    return `<div class="fila"><span class="etq">${s.etq}</span>${control}</div>`;
  }).join('');
}
/**
 * Avisa de cada cambio de un parámetro: alCambiar(clave, valor) con el texto
 * del campo o la opción elegida.
 * @param {HTMLElement} cont @param {(k: string, v: string) => void} alCambiar
 */
export function enlazarParametros(cont, alCambiar) {
  cont.querySelectorAll('input[data-param]').forEach(i => {
    i.addEventListener('change', () => alCambiar(i.dataset.param, i.value));
    i.addEventListener('keydown', ev => { if (ev.key === 'Enter') i.blur(); });
  });
  cont.querySelectorAll('select[data-param]').forEach(i => i.addEventListener('change', () => alCambiar(i.dataset.param, i.value)));
  cont.querySelectorAll('.segmentado[data-param]').forEach(g => g.addEventListener('click', ev => {
    const b = ev.target instanceof Element ? ev.target.closest('button') : null;
    if (b && b.getAttribute('aria-pressed') !== 'true') alCambiar(g.dataset.param, b.dataset.v);
  }));
}
/** Botón «Quitar» del inspector (Supr). */
export const botonQuitar = (txt = 'Quitar') => `<div class="fila"><span class="etq"></span><button class="btn btn-secundario btn-compacto" id="b-quitar-pieza" data-ayuda="Quitar de la escena|Delete|Supr"><svg class="ico"><use href="#i-borrar"/></svg><span>${txt}</span></button></div>`;

/**
 * Paleta de objetos o instrumentos que coloca en el lienzo: un botón pulsado
 * es la herramienta activa (otro clic o Esc la sueltan).
 * @param {string} selector @param {(h: string|null) => void} alElegir
 */
export function iniciarPaleta(selector, alElegir) {
  document.querySelectorAll(`${selector} .herr[data-herr]`).forEach(b => b.addEventListener('click', () => alElegir(b.dataset.herr)));
  return h => document.querySelectorAll(`${selector} .herr[data-herr]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.herr === h)));
}

/** Fila de lectura: símbolo (HTML), valor y unidad. */
export const filaLectura = ([sim, val, u, ayuda]) => `<span class="sim${/^[A-ZÁÉÍÓÚ][a-záéíóúñ]{3,}/.test(sim) ? ' palabra' : ''}"${ayuda ? ` data-ayuda="${ayuda}"` : ''}>${sim}</span><span class="v">${typeof val === 'string' ? val : Number.isFinite(val) ? fmt(val, 4) : '—'}</span><span class="u">${u || ''}</span>`;

/**
 * Filas del examen: apartado, magnitud = valor medido, opción del examen y,
 * en la ayuda, la fórmula del enunciado y su valor. Antes de su instante
 * la respuesta todavía no se conoce: «—».
 * @param {any[]} filas @param {number} t
 */
export function examenHTML(filas, t) {
  if (!filas.length) return '';
  return filas.map(f => {
    const listo = (f.t ?? 0) <= t + 1e-9;
    const val = !listo ? '—' : f.texto ? f.texto : Number.isFinite(f.valor) ? fmt(f.valor, 4) : '—';
    const ayuda = `${f.formula}${Number.isFinite(f.esperado) && !f.texto ? ` = ${cantidad(f.esperado, f.u, 4)}` : ''}|Exam answer`;
    return `<div class="ex-fila" data-ayuda="${ayuda.replace(/"/g, '')}"><span class="ex-n">${f.n || ''}</span><span class="ex-etq">${f.etq}</span><span class="ex-v">${val}</span><span class="ex-u">${listo && !f.texto ? f.u : ''}</span><span class="ex-op">${f.opcion && listo ? f.opcion : ''}</span></div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Avisos, comandos y reproducción
// ---------------------------------------------------------------------------
/** Aviso sobre el lienzo (#aviso) con botón de deshacer opcional. */
export function crearAvisador(deshacer) {
  let reloj = null;
  const ocultar = () => { $('#aviso').hidden = true; };
  const b = $('#aviso-deshacer'); if (b && deshacer) b.addEventListener('click', () => { deshacer(); ocultar(); });
  return (txt, conDeshacer = false) => {
    $('#aviso-texto').textContent = txt; $('#aviso').hidden = false;
    if (b) b.hidden = !conDeshacer;
    clearTimeout(reloj); reloj = setTimeout(ocultar, 5000);
  };
}

/**
 * Paleta de comandos (Ctrl K). comandos: [icono, texto, atajo, acción, grupo].
 * @param {() => any[]} lista
 */
export function iniciarComandos(lista) {
  let sel = 0, filtrada = [];
  const pintar = () => {
    const q = $('#cmd-q').value.trim().toLowerCase(), todos = lista();
    filtrada = todos.filter(c => c[1].toLowerCase().includes(q));
    sel = Math.min(sel, Math.max(0, filtrada.length - 1));
    let grupo = null, html = '';
    filtrada.forEach((c, i) => {
      const g = c[4] || 'Acciones';
      if (g !== grupo) { html += `<div class="menu-titulo">${g}</div>`; grupo = g; }
      html += `<div class="menu-item${i === sel ? ' activo' : ''}" data-i="${i}"><svg class="ico"><use href="#${c[0]}"/></svg>${c[1]}<span class="atajo">${c[2] || ''}</span></div>`;
    });
    $('#cmd-lista').innerHTML = html;
  };
  const abrir = () => { const m = $('#menu-escenas'); if (m) m.hidden = true; $('#velo-comandos').hidden = false; $('#cmd-q').value = ''; sel = 0; pintar(); $('#cmd-q').focus(); };
  const cerrar = () => { $('#velo-comandos').hidden = true; };
  const ejecutar = i => { const c = filtrada[i]; cerrar(); if (c) c[3](); };
  $('#b-comandos').addEventListener('click', abrir);
  $('#cmd-q').addEventListener('input', () => { sel = 0; pintar(); });
  $('#cmd-lista').addEventListener('click', ev => { const it = ev.target instanceof Element ? ev.target.closest('.menu-item') : null; if (it) ejecutar(+it.dataset.i); });
  $('#velo-comandos').addEventListener('click', ev => { if (ev.target instanceof Element && ev.target.id === 'velo-comandos') cerrar(); });
  /** Devuelve true si la tecla la consumió la paleta. */
  const tecla = ev => {
    if ($('#velo-comandos').hidden) return false;
    if (ev.key === 'Escape') cerrar();
    else if (ev.key === 'ArrowDown') { sel = Math.min(filtrada.length - 1, sel + 1); pintar(); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp') { sel = Math.max(0, sel - 1); pintar(); ev.preventDefault(); }
    else if (ev.key === 'Enter') ejecutar(sel);
    return true;
  };
  return { abrir, cerrar, tecla };
}

/**
 * Reproducción: botones de transporte, velocidades, reloj y bucle de cuadros.
 * El tiempo de la simulación nunca se suaviza: avanza con el reloj real por
 * la velocidad elegida (escala: segundos simulados por segundo real a 1×).
 * @param {{duracion: () => number, alCambiar: (t: number) => void, escala?: () => number, reloj?: (t: number) => string}} o
 */
export function crearReproductor(o) {
  const r = { t: 0, jugando: false, velocidad: 1 };
  let ultimo = 0;
  const pintarBoton = () => {
    const b = $('#b-play');
    b.innerHTML = `<svg class="ico"><use href="#i-${r.jugando ? 'pausar' : 'reproducir'}"/></svg>`;
    b.dataset.ayuda = r.jugando ? 'Pausar|Pause|Espacio' : 'Reproducir|Play|Espacio';
  };
  r.irA = nt => { r.jugando = false; r.t = Math.max(0, Math.min(o.duracion(), nt)); pintarBoton(); o.alCambiar(r.t); };
  r.alternar = () => { if (r.t >= o.duracion() - 1e-12) r.t = 0; r.jugando = !r.jugando; pintarBoton(); o.alCambiar(r.t); };
  r.pausar = () => { r.jugando = false; pintarBoton(); };
  const paso = () => o.duracion() / 600;
  $('#b-play').addEventListener('click', r.alternar);
  $('#b-reiniciar').addEventListener('click', () => r.irA(0));
  $('#b-atras').addEventListener('click', () => r.irA(r.t - paso()));
  $('#b-adelante').addEventListener('click', () => r.irA(r.t + paso()));
  $('#velocidades').addEventListener('click', ev => { const b = ev.target instanceof Element ? ev.target.closest('button') : null; if (b) r.velocidad = parseFloat(b.dataset.v); });
  r.paso = paso;
  function cuadro(ahora) {
    if (r.jugando) {
      const dt = Math.min(0.05, (ahora - ultimo) / 1000) * r.velocidad * (o.escala ? o.escala() : 1);
      r.t = Math.min(o.duracion(), r.t + dt);
      if (r.t >= o.duracion()) { r.jugando = false; pintarBoton(); }
      o.alCambiar(r.t);
    }
    ultimo = ahora;
    requestAnimationFrame(cuadro);
  }
  r.arrancar = () => { pintarBoton(); requestAnimationFrame(a => { ultimo = a; requestAnimationFrame(cuadro); }); };
  return r;
}

/** Reloj de la barra: «t 12.34 s» (o en la unidad que se le dé). */
export function pintarReloj(t, unidad = 's', factor = 1) {
  $('#reloj').innerHTML = `<span class="sim">t</span>${fmt(t * factor, 4).padStart(6, ' ')}<span class="u">${unidad}</span>`;
}
