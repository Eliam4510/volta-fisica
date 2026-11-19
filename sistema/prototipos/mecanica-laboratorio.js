/* ==========================================================================
   Volta · Mecánica — espacio de trabajo «Laboratorio»
   Caja de arena: el usuario construye cualquier situación con partículas,
   discos, superficies (suelo, pared, plano, segmento, arco), conectores
   (cuerda, resorte, varilla, polea, unión al chocar) y clavos, y la simula
   con el motor general (sistema/motores/mecanica.js): eventos exactos de
   choque, despegue, cuerda floja, enganche en clavos y fricción.

   El archivo tiene dos partes:
   1. Lógica pura (exportada y probada en pruebas/mecanica-laboratorio.test.js):
      formato de la escena del laboratorio, traducción a la escena del motor,
      proyección sobre superficies, fuerzas de restricción en vivo, nombres
      de los eventos y escenarios incluidos.
   2. Interfaz (solo si hay documento): lienzo, paleta, inspector, línea de
      tiempo, gráficas, energía, tablas, archivos e historial.
   ========================================================================== */
import { simularMecanica, estadoMecanica, energiaMecanica } from '../motores/mecanica.js';
import { interpolar, derivadaInterpolada } from '../nucleo/integradores.js';
import { aCSV, muestrear } from '../nucleo/csv.js';
import { descargarTexto, descargarLienzo, nombreArchivo, avisar } from '../componentes/exportar.js';
import { crearEscena, numero, texto } from '../nucleo/escena.js';
import { Historial } from '../nucleo/historial.js';
import { evaluar, DIM } from '../nucleo/unidades.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';

// ===========================================================================
// 1. Lógica pura
// ===========================================================================

export const DEG = Math.PI / 180;
export const ESPACIO = 'laboratorio';
export const CLAVE_AUTOGUARDADO = 'mecanica-laboratorio';
/** Holgura de la unión al chocar: la cuerda corta que pega dos discos (m). */
export const HOLGURA_UNION = 1e-6;

/** Coseno y seno de un ángulo en grados, exactos en los múltiplos de 90°. */
export function cosd(a) {
  const r = ((a % 360) + 360) % 360;
  if (r === 0) return 1; if (r === 180) return -1; if (r === 90 || r === 270) return 0;
  return Math.cos(a * DEG);
}
export function sind(a) {
  const r = ((a % 360) + 360) % 360;
  if (r === 0 || r === 180) return 0; if (r === 90) return 1; if (r === 270) return -1;
  return Math.sin(a * DEG);
}

const resta = (a, b) => [a[0] - b[0], a[1] - b[1]];
const punto = (a, b) => a[0] * b[0] + a[1] * b[1];
const largo = a => Math.hypot(a[0], a[1]);
const unitario = a => { const L = largo(a); return L > 0 ? [a[0] / L, a[1] / L] : [0, 0]; };
const copia = o => JSON.parse(JSON.stringify(o));

/** Clase visual de un objeto: forma de la superficie o tipo. */
export function claseDe(o) { return o.tipo === 'superficie' ? o.forma : o.tipo; }

export const ICONOS = {
  particula: 'o-particula', disco: 'o-disco', suelo: 'o-suelo', pared: 'o-pared', plano: 'o-plano-inclinado',
  segmento: 'o-trazo-libre', arco: 'o-arco', cuerda: 'o-cuerda', resorte: 'o-resorte', varilla: 'o-varilla',
  polea: 'o-polea', union: 'o-fijacion', clavo: 'o-clavo', escena: 'o-gravedad',
};
export const NOMBRE_CLASE = {
  particula: 'Partícula', suelo: 'Suelo', pared: 'Pared', plano: 'Plano', segmento: 'Segmento', arco: 'Arco',
  cuerda: 'Cuerda', resorte: 'Resorte', varilla: 'Varilla', polea: 'Polea', union: 'Unión', clavo: 'Clavo',
};
export const CONECTORES = ['cuerda', 'resorte', 'varilla', 'polea', 'union'];

// ---------------------------------------------------------------------------
// Geometría de las superficies del laboratorio
// ---------------------------------------------------------------------------

/** Dirección, normal hacia el lado libre (izquierda de a→b; el sólido queda a la derecha) y largo. */
export function geoSegmento(a, b) {
  const d = resta(b, a), L = largo(d), t = L > 0 ? [d[0] / L, d[1] / L] : [1, 0];
  return { t, n: [-t[1], t[0]], L };
}

/** ¿El ángulo (grados) cae en el arco que va de a0 a a1 en sentido antihorario? */
export function anguloEnArco(ang, a0, a1) {
  if (a1 - a0 >= 360 - 1e-9) return true;
  const rel = (((ang - a0) % 360) + 360) % 360;
  return rel <= a1 - a0 + 1e-9;
}

/**
 * Hueco entre una partícula de radio r en p y una superficie del laboratorio:
 * C > 0 del lado libre, C = 0 apoyada. n: normal unitaria hacia el lado libre;
 * dentro: si la proyección cae dentro de la extensión de la superficie.
 */
export function huecoSuperficie(s, p, r = 0) {
  if (s.forma === 'arco') {
    const d = resta(p, s.c), D = largo(d) || 1e-300, sg = s.cara === 'interior' ? -1 : 1;
    const ang = Math.atan2(d[1], d[0]) / DEG;
    return { C: sg * (D - (s.r + sg * r)), n: [sg * d[0] / D, sg * d[1] / D], dentro: anguloEnArco(ang, s.a0, s.a1) };
  }
  const { t, n, L } = geoSegmento(s.a, s.b), q = resta(p, s.a), sl = punto(q, t);
  return { C: punto(q, n) - r, n, dentro: sl >= -1e-12 && sl <= L + 1e-12, s: sl };
}

/** Punto donde queda el centro de una partícula de radio r apoyada en la superficie, desde p. */
export function proyectarSobre(s, p, r = 0) {
  if (s.forma === 'arco') {
    const u = unitario(resta(p, s.c)), sg = s.cara === 'interior' ? -1 : 1, Rc = s.r + sg * r;
    return [s.c[0] + Rc * (u[0] || 0), s.c[1] + Rc * (u[0] || u[1] ? u[1] : 1)];
  }
  const { C, n } = huecoSuperficie(s, p, r);
  return [p[0] - C * n[0], p[1] - C * n[1]];
}

/**
 * Punto de la superficie (para el centro de una partícula de radio r) cuya
 * coordenada `eje` (0 = x, 1 = y) vale `valor`, cerca de p: la partícula se
 * desliza sobre su apoyo. Devuelve null si la superficie no pasa por ese valor.
 */
export function deslizarSobre(s, p, eje, valor, r = 0) {
  const otro = 1 - eje;
  if (s.forma === 'arco') {
    const sg = s.cara === 'interior' ? -1 : 1, Rc = s.r + sg * r, d = valor - s.c[eje];
    if (Math.abs(d) > Rc) return null;
    const q = [0, 0], signo = p[otro] - s.c[otro] >= 0 ? 1 : -1;
    q[eje] = valor; q[otro] = s.c[otro] + signo * Math.sqrt(Rc * Rc - d * d);
    return q;
  }
  const { t, n } = geoSegmento(s.a, s.b);
  if (Math.abs(t[eje]) < 1e-12) return null;
  const a = [s.a[0] + r * n[0], s.a[1] + r * n[1]], k = (valor - a[eje]) / t[eje], q = [a[0] + k * t[0], a[1] + k * t[1]];
  q[eje] = valor;
  return q;
}

/** Puntos de una superficie para el encuadre y las pruebas de selección. */
export function puntosSuperficie(s, n = 24) {
  if (s.forma !== 'arco') return [s.a, s.b];
  const pts = [], span = s.a1 - s.a0;
  for (let k = 0; k <= n; k++) { const a = s.a0 + span * k / n; pts.push([s.c[0] + s.r * cosd(a), s.c[1] + s.r * sind(a)]); }
  return pts;
}

// ---------------------------------------------------------------------------
// Escena del laboratorio
// ---------------------------------------------------------------------------

/** Escena vacía: solo la gravedad. */
export function escenaVacia(titulo = 'Escena nueva') {
  return { version: 1, titulo, tipo: 'propio', ref: '', escenario: null, nota: null, g: 9.8, gAng: -90, b: 0, cAire: 0, eParticulas: 1, duracion: 4, objetos: [] };
}

const num2 = (p, d) => (Array.isArray(p) && p.length === 2 ? [numero(p[0], d[0], -1e6, 1e6), numero(p[1], d[1], -1e6, 1e6)] : [...d]);

/**
 * Valida los datos de una escena del laboratorio (de un archivo, del
 * autoguardado o del historial): números acotados, tipos conocidos, ids
 * únicos y referencias existentes. Lo que no se entiende se descarta.
 * @param {any} d
 */
export function normalizarEscena(d) {
  const e = escenaVacia();
  if (!d || typeof d !== 'object') return e;
  e.titulo = texto(d.titulo, e.titulo, 80);
  e.tipo = ['tutorial', 'ejemplo', 'mext', 'propio'].includes(d.tipo) ? d.tipo : 'propio';
  e.ref = texto(d.ref, '', 40);
  e.escenario = typeof d.escenario === 'string' ? d.escenario : null;
  e.nota = Array.isArray(d.nota) ? d.nota.map(x => texto(x, '', 200)).filter(Boolean).slice(0, 8) : null;
  e.g = numero(d.g, 9.8, 0, 1000);
  e.gAng = numero(d.gAng, -90, -360, 360);
  e.b = numero(d.b, 0, 0, 1e4);
  e.cAire = numero(d.cAire, 0, 0, 1e4);
  e.eParticulas = numero(d.eParticulas, 1, 0, 1);
  e.duracion = numero(d.duracion, 4, 0.1, 120);
  const ids = new Set(), lista = Array.isArray(d.objetos) ? d.objetos : [];
  const material = o => ({ e: numero(o.e, 1, 0, 1), mu: numero(o.mu, 0, 0, 10), muS: o.muS == null ? null : numero(o.muS, 0, 0, 10) });
  for (const o of lista) {
    if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !/^[A-Za-z0-9_-]{1,24}$/.test(o.id) || ids.has(o.id)) continue;
    let n = null;
    const nombre = texto(o.nombre, NOMBRE_CLASE[o.tipo === 'superficie' ? o.forma : o.tipo] || o.id, 32);
    if (o.tipo === 'particula') {
      n = { id: o.id, tipo: 'particula', nombre, m: numero(o.m, 1, 1e-6, 1e6), x: numero(o.x, 0, -1e6, 1e6), y: numero(o.y, 0, -1e6, 1e6),
        v: numero(o.v, 0, 0, 1e5), ang: numero(o.ang, 0, -360, 360), radio: numero(o.radio, 0, 0, 100), sobre: typeof o.sobre === 'string' ? o.sobre : null,
        F: numero(o.F, 0, 0, 1e9), angF: numero(o.angF, 0, -360, 360) };
    } else if (o.tipo === 'superficie' && ['suelo', 'pared', 'plano', 'segmento'].includes(o.forma)) {
      const a = num2(o.a, [0, 0]), b = num2(o.b, [1, 0]);
      if (largo(resta(b, a)) < 1e-6) continue;
      n = { id: o.id, tipo: 'superficie', forma: o.forma, nombre, a, b, ...material(o) };
    } else if (o.tipo === 'superficie' && o.forma === 'arco') {
      const a0 = numero(o.a0, 0, -720, 720), a1 = numero(o.a1, 180, -720, 1080);
      n = { id: o.id, tipo: 'superficie', forma: 'arco', nombre, c: num2(o.c, [0, 0]), r: numero(o.r, 1, 1e-4, 1e5), a0, a1: Math.min(a0 + 360, Math.max(a0 + 1, a1)),
        cara: o.cara === 'interior' ? 'interior' : 'exterior', ...material(o) };
    } else if (CONECTORES.includes(o.tipo)) {
      if (typeof o.a !== 'string') continue;
      n = { id: o.id, tipo: o.tipo, nombre, a: o.a, b: typeof o.b === 'string' ? o.b : null };
      if (o.tipo === 'polea') { if (!n.b) continue; n.P = num2(o.P, [0, 0]); n.L = numero(o.L, 1, 1e-6, 1e5); n.r = numero(o.r, 0.1, 0.005, 10); }
      else if (o.tipo === 'union') { if (!n.b) continue; }
      else {
        if (!n.b) n.ancla = num2(o.ancla, [0, 0]);
        if (o.tipo === 'resorte') { n.k = numero(o.k, 50, 1e-6, 1e9); n.L0 = numero(o.L0, 1, 0, 1e5); n.amort = numero(o.amort, 0, 0, 1e6); }
        else n.L = numero(o.L, 1, 1e-6, 1e5);
      }
    } else if (o.tipo === 'clavo') {
      n = { id: o.id, tipo: 'clavo', nombre, x: numero(o.x, 0, -1e6, 1e6), y: numero(o.y, 0, -1e6, 1e6) };
    }
    if (n) { ids.add(n.id); e.objetos.push(n); }
  }
  // Referencias: conectores a partículas que existen; apoyos en superficies que existen
  const tipoDe = Object.fromEntries(e.objetos.map(o => [o.id, o.tipo]));
  e.objetos = e.objetos.filter(o => !CONECTORES.includes(o.tipo) || (tipoDe[o.a] === 'particula' && (o.b == null || (tipoDe[o.b] === 'particula' && o.b !== o.a))));
  for (const o of e.objetos) if (o.tipo === 'particula' && o.sobre && tipoDe[o.sobre] !== 'superficie') o.sobre = null;
  return e;
}

/** Objeto por id. */
export function objeto(esc, id) { return esc.objetos.find(o => o.id === id) || null; }

/** Posición inicial de una partícula: si está apoyada en una superficie, proyectada exactamente sobre ella. */
export function posicionParticula(esc, p) {
  const s = p.sobre ? objeto(esc, p.sobre) : null;
  return s ? proyectarSobre(s, [p.x, p.y], p.radio || 0) : [p.x, p.y];
}
/** Velocidad inicial [vx, vy] de una partícula (ángulos de 90° exactos). */
export function velocidadParticula(p) { return [p.v * cosd(p.ang), p.v * sind(p.ang)]; }

/** Id libre con un prefijo: p1, p2… */
export function nuevoId(esc, prefijo) {
  const usados = new Set(esc.objetos.map(o => o.id));
  let k = 1; while (usados.has(prefijo + k)) k++;
  return prefijo + k;
}
/** Nombre nuevo: letras para las partículas (A, B, …); «Suelo», «Suelo 2»… para lo demás. */
export function nuevoNombre(esc, clase) {
  const usados = new Set(esc.objetos.map(o => o.nombre));
  if (clase === 'particula') {
    for (let k = 0; k < 26; k++) { const l = String.fromCharCode(65 + k); if (!usados.has(l)) return l; }
    let k = 1; while (usados.has('P' + k)) k++; return 'P' + k;
  }
  const base = NOMBRE_CLASE[clase] || clase;
  if (!usados.has(base)) return base;
  let k = 2; while (usados.has(`${base} ${k}`)) k++;
  return `${base} ${k}`;
}

// Artículos para escribir los eventos en buen español
const GENERO = {
  suelo: 'el', techo: 'el', pared: 'la', plano: 'el', rampa: 'la', segmento: 'el', arco: 'el', hemisferio: 'el', cuenco: 'el',
  pista: 'la', esfera: 'la', cuerda: 'la', hilo: 'el', resorte: 'el', varilla: 'la', polea: 'la', clavo: 'el', unión: 'la',
  bola: 'la', bloque: 'el', disco: 'el', partícula: 'la', masa: 'la', cuerpo: 'el', carrito: 'el', objeto: 'el', pesa: 'la',
};
/** «Suelo 2» → «el suelo 2»; «A» → «A». */
export function conArticulo(nombre) {
  const w = String(nombre).split(/\s+/)[0].toLowerCase(), art = GENERO[w];
  return art ? `${art} ${nombre.charAt(0).toLowerCase()}${nombre.slice(1)}` : String(nombre);
}
const mayuscula = s => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------
// Traducción a la escena del motor
// ---------------------------------------------------------------------------

/**
 * Escena del motor a partir de la del laboratorio, con el índice de cada
 * objeto (las partículas y superficies del motor van en el mismo orden) y
 * los avisos de lo que no se pudo traducir tal cual.
 * @param {ReturnType<typeof escenaVacia>} esc
 */
export function aMotor(esc) {
  const avisos = [];
  const particulas = esc.objetos.filter(o => o.tipo === 'particula');
  const superficies = esc.objetos.filter(o => o.tipo === 'superficie');
  const clavos = esc.objetos.filter(o => o.tipo === 'clavo');
  const indice = Object.fromEntries(particulas.map((p, i) => [p.id, i]));
  const posiciones = particulas.map(p => posicionParticula(esc, p));
  const pos = id => posiciones[indice[id]];
  const conectores = [], conObjs = [];
  for (const c of esc.objetos) {
    if (!CONECTORES.includes(c.tipo)) continue;
    if (indice[c.a] == null || (c.b != null && (indice[c.b] == null || c.b === c.a))) { avisos.push(`${mayuscula(conArticulo(c.nombre))} no une partículas que existan: no actúa.`); continue; }
    if ((c.tipo === 'polea' || c.tipo === 'union') && c.b == null) continue;
    const pa = pos(c.a), pb = c.b != null ? pos(c.b) : c.ancla;
    let m;
    if (c.tipo === 'polea') {
      const D = largo(resta(pa, c.P)) + largo(resta(pos(c.b), c.P));
      if (c.L < D - 1e-9) avisos.push(`La cuerda de ${conArticulo(c.nombre)} es más corta que sus dos ramales: se usa ${D.toPrecision(4)} m.`);
      m = { id: c.id, tipo: 'polea', a: c.a, b: c.b, polea: [...c.P], L: Math.max(c.L, D) };
    } else if (c.tipo === 'union') {
      const A = particulas[indice[c.a]], B = particulas[indice[c.b]];
      if (!((A.radio || 0) + (B.radio || 0) > 0)) avisos.push(`${mayuscula(conArticulo(c.nombre))} necesita discos con radio para que choquen.`);
      m = { id: c.id, tipo: 'cuerda', a: c.a, b: c.b, L: (A.radio || 0) + (B.radio || 0) + HOLGURA_UNION };
    } else {
      const base = { id: c.id, tipo: c.tipo, a: c.a, ...(c.b != null ? { b: c.b } : { ancla: [...c.ancla] }) }, D = largo(resta(pa, pb));
      if (c.tipo === 'resorte') m = { ...base, k: c.k, L0: c.L0, c: c.amort || 0 };
      // La varilla es rígida: su largo es la distancia entre sus extremos
      else if (c.tipo === 'varilla') m = { ...base, L: D };
      else {
        if (c.L < D - 1e-9) avisos.push(`${mayuscula(conArticulo(c.nombre))} es más corta que la distancia entre sus extremos: se usa ${D.toPrecision(4)} m.`);
        m = { ...base, L: Math.max(c.L, D) };
        if (c.b == null && clavos.length) m.clavos = clavos.map(n => [n.x, n.y]);
      }
      if (D < 1e-9 && c.tipo !== 'resorte') { avisos.push(`${mayuscula(conArticulo(c.nombre))} tiene sus dos extremos en el mismo punto: no actúa.`); continue; }
    }
    conectores.push(m); conObjs.push(c);
  }
  const motor = {
    g: [esc.g * cosd(esc.gAng), esc.g * sind(esc.gAng)], b: esc.b, cAire: esc.cAire, eParticulas: esc.eParticulas, duracion: esc.duracion,
    particulas: particulas.map((p, i) => ({
      id: p.id, m: p.m, p: posiciones[i], v: velocidadParticula(p), radio: p.radio || 0,
      ...(p.F > 0 ? { F: [p.F * cosd(p.angF || 0), p.F * sind(p.angF || 0)] } : {}),
    })),
    superficies: superficies.map(s => (s.forma === 'arco'
      ? { id: s.id, tipo: 'arco', c: [...s.c], r: s.r, cara: s.cara, e: s.e, mu: s.mu, muS: s.muS ?? s.mu, ...(s.a1 - s.a0 >= 360 - 1e-9 ? {} : { a0: s.a0 * DEG, a1: s.a1 * DEG }) }
      : { id: s.id, tipo: 'segmento', a: [...s.a], b: [...s.b], e: s.e, mu: s.mu, muS: s.muS ?? s.mu })),
    conectores,
  };
  return { motor, avisos, particulas, superficies, clavos, conectores: conObjs, indice, posiciones };
}

// ---------------------------------------------------------------------------
// Resultados: tramos, estado de las cuerdas, eventos y fuerzas
// ---------------------------------------------------------------------------

/** Tramo de la simulación que contiene t (el último que empieza en t o antes). */
export function tramoEn(sim, t) {
  const T = sim.tramos; let lo = 0, hi = T.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T[m].t0 <= t + 1e-15) lo = m; else hi = m - 1; }
  return T[lo];
}
/** Contactos de un modo como lista {i, sup, pegado}, en el formato nuevo («i:js») o en el anterior («i»). */
export function contactosDe(modo) {
  return Object.entries(modo?.contactos || {}).map(([k, v]) => ({ i: v.i ?? Number(k.split(':')[0]), sup: v.sup, pegado: !!v.pegado }));
}

/**
 * Descripción en español de un evento del motor con los nombres del
 * laboratorio: «La bola choca con el suelo», «Se afloja la cuerda».
 * @param {{clave: string, nombre: string}} ev
 * @param {ReturnType<typeof aMotor>} M
 */
export function describirEvento(ev, M) {
  const partes = String(ev.clave || '').split(':');
  const P = i => conArticulo(M.particulas[Number(i)]?.nombre ?? '?');
  const S = js => conArticulo(M.superficies[Number(js)]?.nombre ?? 'superficie');
  const con = M.conectores.find(c => c.id === partes[1]);
  const C = () => conArticulo(con?.nombre ?? partes[1]);
  const contacto = /contacto/.test(ev.nombre || '');
  let d;
  switch (partes[0]) {
    case 'impacto': d = `${P(partes[1])} choca con ${S(partes[2])}${contacto ? ' y queda en contacto' : ''}`; break;
    case 'despegue': d = partes[2] != null ? `${P(partes[1])} se despega de ${S(partes[2])}` : `${P(partes[1])} se despega`; break;
    case 'fin': d = partes[2] != null ? `${P(partes[1])} sale por el borde de ${S(partes[2])}` : `${P(partes[1])} sale por el borde`; break;
    case 'vt0': d = /detiene/.test(ev.nombre || '') ? `${P(partes[1])} se detiene` : `${P(partes[1])} invierte el deslizamiento`; break;
    case 'desliza': d = `${P(partes[1])} empieza a deslizar`; break;
    case 'tensa':
      if (con?.tipo === 'union') d = `Se unen ${P(M.indice[con.a])} y ${P(M.indice[con.b])}`;
      else d = con?.tipo === 'polea' ? `Se tensa la cuerda de ${C()}` : `Se tensa ${C()}`;
      break;
    case 'floja':
      if (con?.tipo === 'union') d = `Se separan ${P(M.indice[con.a])} y ${P(M.indice[con.b])}`;
      else d = con?.tipo === 'polea' ? `Se afloja la cuerda de ${C()}` : `Se afloja ${C()}`;
      break;
    case 'engancha': d = `${C()} toca ${conArticulo(M.clavos[Number(partes[2])]?.nombre ?? 'clavo')}`; break;
    case 'desengancha': d = `${C()} se suelta del clavo`; break;
    case 'choque': d = `${contacto ? 'Choque y contacto' : 'Choque'} entre ${P(partes[1])} y ${P(partes[2])}`; break;
    case 'separa': d = `Se separan ${P(partes[1])} y ${P(partes[2])}`; break;
    default: d = ev.nombre || 'Evento';
  }
  return mayuscula(d.replace(/\bde el\b/g, 'del').replace(/\ba el\b/g, 'al'));
}

/** Índices de las partículas que protagonizan un evento. */
export function particulasDelEvento(ev, M) {
  const partes = String(ev.clave || '').split(':');
  if (['choque', 'separa'].includes(partes[0])) return [Number(partes[1]), Number(partes[2])];
  if (['tensa', 'floja', 'engancha', 'desengancha'].includes(partes[0])) {
    const c = M.conectores.find(x => x.id === partes[1]);
    return c ? [M.indice[c.a]] : [];
  }
  const i = Number(partes[1]);
  return Number.isInteger(i) ? [i] : [];
}

/** Lugar del evento: la partícula, o el punto de contacto entre dos discos. */
export function lugarDelEvento(ev, M) {
  const idx = particulasDelEvento(ev, M), y = ev.y || [];
  if (!idx.length) return null;
  const p = i => [y[4 * i], y[4 * i + 1]];
  if (idx.length === 2) {
    const [i, j] = idx, ri = M.particulas[i]?.radio || 0, rj = M.particulas[j]?.radio || 0, f = ri + rj > 0 ? ri / (ri + rj) : 0.5;
    const a = p(i), b = p(j);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
  return p(idx[0]);
}

/** Resuelve A·x = b (A pequeña, simétrica) por eliminación con pivoteo parcial. */
function resolverLineal(A, b) {
  const n = b.length, M = A.map((f, i) => [...f, b[i]]);
  for (let k = 0; k < n; k++) {
    let p = k; for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    [M[k], M[p]] = [M[p], M[k]];
    if (Math.abs(M[k][k]) < 1e-300) continue;
    for (let i = k + 1; i < n; i++) { const f = M[i][k] / M[k][k]; for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = Math.abs(M[i][i]) < 1e-300 ? 0 : s / M[i][i]; }
  return x;
}

/**
 * Fuerzas sobre cada partícula en el instante t, tal como las produjo el
 * motor: con la aceleración de la salida densa (a = d v/dt) y las fuerzas
 * aplicadas conocidas (peso, arrastre, resortes), las reacciones de las
 * restricciones activas salen de m·a − F = Σ λ·∇C por mínimos cuadrados
 * (el sistema es compatible: el motor lo resolvió con esas mismas
 * direcciones). Devuelve por partícula una lista de fuerzas {tipo, F, valor,
 * id} y las tensiones de cada conector.
 * @param {any} sim @param {ReturnType<typeof aMotor>} M @param {number} t
 */
export function fuerzasEn(sim, M, t) {
  const mot = M.motor, n = mot.particulas.length, tr = tramoEn(sim, t), modo = tr.modo || {};
  const tt = Math.max(tr.t0, Math.min(t, tr.t1));
  const y = interpolar(tr.sol, tt), dy = derivadaInterpolada(tr.sol, tt);
  const pos = i => [y[4 * i], y[4 * i + 1]], vel = i => [y[4 * i + 2], y[4 * i + 3]];
  const lista = Array.from({ length: n }, () => []), tensiones = {};
  const g = mot.g;
  // Fuerzas aplicadas
  const F = new Array(2 * n).fill(0);
  for (let i = 0; i < n; i++) {
    const m = mot.particulas[i].m, v = vel(i), sp = largo(v);
    const peso = [m * g[0], m * g[1]];
    F[2 * i] += peso[0]; F[2 * i + 1] += peso[1];
    if (largo(peso) > 0) lista[i].push({ tipo: 'peso', F: peso, valor: largo(peso) });
    const Fa = mot.particulas[i].F;
    if (Fa) { F[2 * i] += Fa[0]; F[2 * i + 1] += Fa[1]; lista[i].push({ tipo: 'aplicada', F: [...Fa], valor: largo(Fa) }); }
    const arr = [-(mot.b || 0) * v[0] - (mot.cAire || 0) * sp * v[0], -(mot.b || 0) * v[1] - (mot.cAire || 0) * sp * v[1]];
    F[2 * i] += arr[0]; F[2 * i + 1] += arr[1];
    if (largo(arr) > 1e-12) lista[i].push({ tipo: 'arrastre', F: arr, valor: largo(arr) });
  }
  const idx = M.indice;
  for (const c of mot.conectores) {
    if (c.tipo !== 'resorte') continue;
    const ia = idx[c.a], ib = c.b != null ? idx[c.b] : -1;
    const pa = pos(ia), pb = ib >= 0 ? pos(ib) : c.ancla, va = vel(ia), vb = ib >= 0 ? vel(ib) : [0, 0];
    const d = resta(pa, pb), D = largo(d) || 1e-300, u = [d[0] / D, d[1] / D];
    const f = -c.k * (D - c.L0) - (c.c || 0) * punto(u, resta(va, vb));
    F[2 * ia] += f * u[0]; F[2 * ia + 1] += f * u[1];
    lista[ia].push({ tipo: 'elastica', F: [f * u[0], f * u[1]], valor: Math.abs(f), id: c.id });
    if (ib >= 0) { F[2 * ib] -= f * u[0]; F[2 * ib + 1] -= f * u[1]; lista[ib].push({ tipo: 'elastica', F: [-f * u[0], -f * u[1]], valor: Math.abs(f), id: c.id }); }
    tensiones[c.id] = -f;
  }
  // Columnas de las restricciones activas: [{grad: [[i, gx, gy]...], usar(λ)}]
  const cols = [];
  for (const k of contactosDe(modo)) {
    const sup = mot.superficies[k.sup], i = k.i, p = pos(i), v = vel(i);
    if (!sup) continue;
    let nrm, tg;
    if (sup.tipo === 'segmento') { const geo = geoSegmento(sup.a, sup.b); nrm = geo.n; tg = geo.t; }
    else { const d = resta(p, sup.c), D = largo(d) || 1e-300, sg = sup.cara === 'interior' ? -1 : 1; nrm = [sg * d[0] / D, sg * d[1] / D]; tg = [-d[1] / D, d[0] / D]; }
    const vt = punto(tg, v), desliza = sup.mu > 0 && !k.pegado && Math.abs(vt) > 1e-15, sgn = Math.sign(vt);
    const dir = desliza ? [nrm[0] - sup.mu * sgn * tg[0], nrm[1] - sup.mu * sgn * tg[1]] : nrm;
    cols.push({ grad: [[i, dir[0], dir[1]]], usar: L => {
      lista[i].push({ tipo: 'normal', F: [L * nrm[0], L * nrm[1]], valor: L, id: sup.id });
      if (desliza) lista[i].push({ tipo: 'friccion', F: [-sup.mu * sgn * L * tg[0], -sup.mu * sgn * L * tg[1]], valor: Math.abs(sup.mu * L), id: sup.id });
    } });
    if (k.pegado && sup.mu > 0) cols.push({ grad: [[i, tg[0], tg[1]]], usar: L => lista[i].push({ tipo: 'friccion', F: [L * tg[0], L * tg[1]], valor: Math.abs(L), id: sup.id }) });
  }
  for (const par of Object.keys(modo.pares || {})) {
    const [i, j] = par.split(':').map(Number), u = unitario(resta(pos(i), pos(j)));
    cols.push({ grad: [[i, u[0], u[1]], [j, -u[0], -u[1]]], usar: L => {
      lista[i].push({ tipo: 'normal', F: [L * u[0], L * u[1]], valor: L, id: par });
      lista[j].push({ tipo: 'normal', F: [-L * u[0], -L * u[1]], valor: L, id: par });
    } });
  }
  for (const c of mot.conectores) {
    if (c.tipo === 'resorte') continue;
    const ia = idx[c.a], ib = c.b != null ? idx[c.b] : -1;
    if (c.tipo === 'polea') {
      if (!modo.cuerdas?.[c.id]?.tensa) { tensiones[c.id] = 0; continue; }
      const ua = unitario(resta(pos(ia), c.polea)), ub = unitario(resta(pos(ib), c.polea));
      cols.push({ grad: [[ia, -ua[0], -ua[1]], [ib, -ub[0], -ub[1]]], usar: L => {
        tensiones[c.id] = L;
        lista[ia].push({ tipo: 'tension', F: [-L * ua[0], -L * ua[1]], valor: L, id: c.id });
        lista[ib].push({ tipo: 'tension', F: [-L * ub[0], -L * ub[1]], valor: L, id: c.id });
      } });
      continue;
    }
    const est = modo.cuerdas?.[c.id];
    if (c.tipo === 'cuerda' && !est?.tensa) { tensiones[c.id] = 0; continue; }
    let piv = ib >= 0 ? pos(ib) : c.ancla;
    if (c.tipo === 'cuerda' && ib < 0 && est?.clavos?.length) piv = c.clavos[est.clavos[est.clavos.length - 1]];
    const u = unitario(resta(pos(ia), piv)), s = c.tipo === 'varilla' ? 1 : -1;   // varilla: λ > 0 empuja
    const grad = [[ia, s * u[0], s * u[1]]];
    if (ib >= 0) grad.push([ib, -s * u[0], -s * u[1]]);
    cols.push({ grad, usar: L => {
      const T = c.tipo === 'varilla' ? -L : L;       // tensión: positiva si tira
      tensiones[c.id] = T;
      lista[ia].push({ tipo: 'tension', F: [-T * u[0], -T * u[1]], valor: T, id: c.id });
      if (ib >= 0) lista[ib].push({ tipo: 'tension', F: [T * u[0], T * u[1]], valor: T, id: c.id });
    } });
  }
  if (cols.length) {
    // r = m·a − F
    const r = new Array(2 * n);
    for (let i = 0; i < n; i++) { const m = mot.particulas[i].m; r[2 * i] = m * dy[4 * i + 2] - F[2 * i]; r[2 * i + 1] = m * dy[4 * i + 3] - F[2 * i + 1]; }
    const k = cols.length, A = Array.from({ length: k }, () => new Array(k).fill(0)), bb = new Array(k).fill(0);
    for (let a = 0; a < k; a++) {
      for (const [i, gx, gy] of cols[a].grad) bb[a] += gx * r[2 * i] + gy * r[2 * i + 1];
      for (let b = 0; b < k; b++) for (const [i, gx, gy] of cols[a].grad) for (const [j, hx, hy] of cols[b].grad) if (i === j) A[a][b] += gx * hx + gy * hy;
    }
    const traza = A.reduce((s, f, i) => s + f[i], 0) || 1;
    for (let a = 0; a < k; a++) A[a][a] += 1e-14 * traza;
    const lam = resolverLineal(A, bb);
    cols.forEach((c, a) => c.usar(lam[a]));
  }
  const acc = Array.from({ length: n }, (_, i) => [dy[4 * i + 2], dy[4 * i + 3]]);
  return { porParticula: lista, tensiones, acc, modo };
}

// ---------------------------------------------------------------------------
// Escenarios incluidos: tutoriales, ejemplos y MEXT
// ---------------------------------------------------------------------------
const P_ = (id, nombre, m, x, y, o = {}) => ({ id, tipo: 'particula', nombre, m, x, y, v: o.v || 0, ang: o.ang || 0, radio: o.radio || 0, sobre: o.sobre || null });
const SEG = (id, forma, nombre, a, b, o = {}) => ({ id, tipo: 'superficie', forma, nombre, a, b, e: o.e ?? 1, mu: o.mu || 0, muS: o.muS ?? null });
const ARCO = (id, nombre, c, r, a0, a1, cara, o = {}) => ({ id, tipo: 'superficie', forma: 'arco', nombre, c, r, a0, a1, cara, e: o.e ?? 1, mu: o.mu || 0, muS: o.muS ?? null });
const g0 = 9.8;

/** Plano que baja hacia la derecha desde `alto` con ángulo θ (°) y largo L: el sólido queda debajo. */
function planoDesde(alto, th, L) { return [alto, [alto[0] + L * cosd(th), alto[1] - L * sind(th)]]; }

export const ESCENARIOS = [
  {
    id: 'caida', tipo: 'tutorial', titulo: 'Caída libre',
    nota: ['Pulsa Reproducir (barra espaciadora).', 'En t = 0, arrastra la bola a otra altura.', 'Selecciona el suelo y cambia su coeficiente e.', 'En la pestaña Energía, mira cuánto se disipa en cada rebote.'],
    crear: () => ({ duracion: 3, objetos: [P_('p1', 'Bola', 0.5, 0, 2.5), SEG('s1', 'suelo', 'Suelo', [-2, 0], [2, 0], { e: 0.8 })] }),
  },
  {
    id: 'pendulo', tipo: 'tutorial', titulo: 'Péndulo simple',
    nota: ['Reproduce: la cuerda tensa da un péndulo.', 'En t = 0, arrastra la bola a otro ángulo.', 'Activa Tensión en el inspector para ver T en vivo.', 'Cambia la longitud L de la cuerda y compara el periodo en y(t).'],
    crear: () => ({ duracion: 4, objetos: [P_('p1', 'Bola', 0.2, 0.5, -Math.sqrt(3) / 2), { id: 'c1', tipo: 'cuerda', nombre: 'Cuerda', a: 'p1', b: null, ancla: [0, 0], L: 1 }] }),
  },
  {
    id: 'resorte', tipo: 'tutorial', titulo: 'Resorte horizontal',
    nota: ['Reproduce: el bloque oscila sobre un suelo sin fricción.', 'Cambia k o la masa y mira el periodo en la gráfica.', 'Activa Fuerza elástica en el inspector.', 'La energía elástica aparece en la pestaña Energía.'],
    crear: () => ({
      duracion: 4,
      objetos: [
        SEG('s1', 'suelo', 'Suelo', [0, 0], [2.6, 0]), SEG('s2', 'pared', 'Pared', [0, 0.8], [0, 0]),
        P_('p1', 'Bloque', 0.5, 1.3, 0.1, { radio: 0.1, sobre: 's1' }),
        { id: 'c1', tipo: 'resorte', nombre: 'Resorte', a: 'p1', b: null, ancla: [0, 0.1], k: 20, L0: 1, amort: 0 },
      ],
    }),
  },
  {
    id: 'plano', tipo: 'tutorial', titulo: 'Plano inclinado con fricción',
    nota: ['Reproduce: el bloque baja porque tan θ > μs.', 'Selecciona el plano y pon μs = 0.7: ya no se mueve.', 'Activa Normal y fricción en el inspector del bloque.', 'El calor por fricción aparece como energía disipada.'],
    crear: () => {
      const [a, b] = planoDesde([0, 1.5], 30, 3);
      return {
        duracion: 3,
        objetos: [
          SEG('s1', 'plano', 'Plano', a, b, { mu: 0.2, muS: 0.3 }), SEG('s2', 'suelo', 'Suelo', [b[0], 0], [5.4, 0], { e: 0, mu: 0.35, muS: 0.4 }),
          P_('p1', 'Bloque', 1, 0.3 * cosd(30), 1.5 - 0.3 * sind(30), { sobre: 's1' }),
        ],
      };
    },
  },
  {
    id: 'atwood', tipo: 'ejemplo', titulo: 'Máquina de Atwood',
    crear: () => ({
      duracion: 2,
      objetos: [
        P_('p1', 'A', 2, 0, -1.5), P_('p2', 'B', 1, 0, -2),
        { id: 'c1', tipo: 'polea', nombre: 'Polea', a: 'p1', b: 'p2', P: [0, 0], L: 3.5, r: 0.12 },
        SEG('s1', 'suelo', 'Suelo', [-0.8, -2.7], [0.8, -2.7], { e: 0 }),
      ],
    }),
  },
  {
    id: 'discos', tipo: 'ejemplo', titulo: 'Choque de dos discos',
    crear: () => ({ g: 0, duracion: 2.5, eParticulas: 1, objetos: [P_('p1', 'A', 1, -1.2, 0.1, { v: 1.5, radio: 0.15 }), P_('p2', 'B', 1, 0.4, 0, { radio: 0.15 })] }),
  },
  {
    id: 'newton', tipo: 'ejemplo', titulo: 'Péndulo de Newton',
    crear: () => {
      const r = 0.1, objetos = [];
      for (let k = 0; k < 5; k++) {
        const x = (k - 2) * 2 * r, id = 'p' + (k + 1), q = k === 0 ? [x - 0.6 * Math.sin(0.6), -0.6 * Math.cos(0.6)] : [x, -0.6];
        objetos.push(P_(id, String.fromCharCode(65 + k), 0.2, q[0], q[1], { radio: r }));
        objetos.push({ id: 'c' + (k + 1), tipo: 'cuerda', nombre: `Cuerda ${k + 1}`, a: id, b: null, ancla: [x, 0], L: 0.6 });
      }
      return { duracion: 3, eParticulas: 1, objetos };
    },
  },
  {
    id: 'doble', tipo: 'ejemplo', titulo: 'Péndulo doble',
    crear: () => ({
      duracion: 6,
      objetos: [
        P_('p1', 'A', 1, 0.8, 0), P_('p2', 'B', 1, 1.6, 0),
        { id: 'c1', tipo: 'varilla', nombre: 'Varilla', a: 'p1', b: null, ancla: [0, 0], L: 0.8 },
        { id: 'c2', tipo: 'varilla', nombre: 'Varilla 2', a: 'p2', b: 'p1', L: 0.8 },
      ],
    }),
  },
  {
    id: 'cuenco', tipo: 'ejemplo', titulo: 'Bola en un cuenco',
    crear: () => ({
      duracion: 4,
      objetos: [ARCO('s1', 'Cuenco', [0, 1], 1, 180, 360, 'interior'), P_('p1', 'Bola', 0.2, cosd(205), 1 + sind(205), { sobre: 's1' })],
    }),
  },
  {
    id: 'mext-2017-p3', tipo: 'mext', anio: 2017, ref: '2017 · P3', titulo: 'Bola que deja el hemisferio',
    crear: () => ({
      duracion: 3,
      objetos: [
        SEG('s1', 'suelo', 'Suelo', [-2.4, 0], [2.4, 0], { e: 0.4 }), ARCO('s2', 'Hemisferio', [0, 0], 1, 0, 180, 'exterior'),
        // «Sin velocidad inicial» en la cima es un equilibrio inestable: un empujón de 2 cm/s
        P_('p1', 'Bola', 0.1, 0, 1, { v: 0.02, sobre: 's2' }),
      ],
    }),
  },
  {
    id: 'mext-2014-p3', tipo: 'mext', anio: 2014, ref: '2014 · P3', titulo: 'Péndulo con clavo',
    crear: () => ({
      duracion: 2.2,
      objetos: [P_('p1', 'Bola', 0.1, -1, 0), { id: 'c1', tipo: 'cuerda', nombre: 'Cuerda', a: 'p1', b: null, ancla: [0, 0], L: 1 }, { id: 'n1', tipo: 'clavo', nombre: 'Clavo', x: 0, y: -0.5 }],
    }),
  },
  {
    id: 'mext-2009-p3', tipo: 'mext', anio: 2009, ref: '2009 · P3', titulo: 'Círculo vertical con cuerda',
    // v0 = √((2 + 3·sen θ)·g·L) con θ = 60°: la cuerda se afloja en B
    crear: () => ({
      duracion: 2,
      objetos: [P_('p1', 'Bola', 0.1, 0, -1, { v: Math.sqrt((2 + 3 * Math.sqrt(3) / 2) * g0), ang: 180 }), { id: 'c1', tipo: 'cuerda', nombre: 'Cuerda', a: 'p1', b: null, ancla: [0, 0], L: 1 }],
    }),
  },
  {
    id: 'mext-2015-p3', tipo: 'mext', anio: 2015, ref: '2015 · P3', titulo: 'Choque y oscilación en un resorte colgante',
    // M cuelga en equilibrio; la bola llega con la rapidez con que, ya pegados,
    // el resorte alcanza su largo natural en lo más alto: v = (g·(M + m)/m)·√(M(M + 2m)/(k(M + m)))
    crear: () => {
      const M = 1, m = 0.5, k = 50, L0 = 0.5, rM = 0.1, rm = 0.05, yM = -(L0 + M * g0 / k), d = 0.3;
      const v = g0 * Math.sqrt(M * (M + 2 * m) / (k * (M + m))) * (M + m) / m;
      return {
        duracion: 3, eParticulas: 0,
        objetos: [
          SEG('s1', 'suelo', 'Techo', [0.5, 0], [-0.5, 0]),
          P_('p1', 'Bloque', M, 0, yM, { radio: rM }), P_('p2', 'Bola', m, 0, yM - rM - rm - d, { v: Math.sqrt(v * v + 2 * g0 * d), ang: 90, radio: rm }),
          { id: 'c1', tipo: 'resorte', nombre: 'Resorte', a: 'p1', b: null, ancla: [0, 0], k, L0, amort: 0 },
          { id: 'c2', tipo: 'union', nombre: 'Unión', a: 'p2', b: 'p1' },
        ],
      };
    },
  },
  {
    id: 'mext-2027-p2', tipo: 'mext', anio: 2027, ref: '2027 · P2', titulo: 'Choque oblicuo',
    // m con 4v y 2m con −v por el eje x; chocan en el origen con la línea de centros en (−2, 1)/√5
    crear: () => {
      const r = 0.1, n = [-2 / Math.sqrt(5), 1 / Math.sqrt(5)], tc = 0.5;
      return {
        g: 0, duracion: 1.4, eParticulas: 0.5,
        objetos: [P_('p1', 'A', 1, r * n[0] - 4 * tc, r * n[1], { v: 4, radio: r }), P_('p2', 'B', 2, -r * n[0] + tc, -r * n[1], { v: 1, ang: 180, radio: r })],
      };
    },
  },
];

/** Escena del laboratorio de un escenario incluido (copia nueva). */
export function escenaDeEscenario(id) {
  const e = ESCENARIOS.find(x => x.id === id);
  if (!e) return null;
  const base = { ...escenaVacia(e.titulo), tipo: e.tipo, ref: e.ref || '', escenario: e.id, nota: e.nota || null, ...e.crear() };
  base.titulo = e.titulo;
  return normalizarEscena(base);
}

// ===========================================================================
// 2. Interfaz
// ===========================================================================
if (typeof document !== 'undefined' && typeof window !== 'undefined') iniciar();

function iniciar() {
  'use strict';
  const { Trazo, G, fmt, cantidad, grafica, LineaTiempo, pasoAgradable } = window.Volta;
  const $ = s => document.querySelector(s);
  const ico = id => `<svg class="ico"><use href="#${id}"/></svg>`;
  const simHTML = (a, b, recta = true) => `<span class="sim">${a}${b ? `<sub${recta ? ' class="r"' : ''}>${b}</sub>` : ''}</span>`;
  const limpio = (v, c = 4) => (Math.abs(v) < 1e-12 ? '0' : String(Number(v.toPrecision(c)))).replace('-', '−');

  // -------------------------------------------------------------------------
  // Estado
  // -------------------------------------------------------------------------
  let esc = escenaVacia();
  let M = aMotor(esc), SIM = null, MUESTRAS = [], avisoMotor = null;
  let ESC_V = 0.2, ESC_F = 0.05, LREF = 1;     // escalas de los vectores (s por m/s y m por N)
  let t = 0, jugando = false, velocidad = 1, ultimo = 0, encuadreHecho = false, vistaTocada = false, escala0 = 1;
  let sel = 'escena', hover = null, herramienta = null, arrastre = null, paneo = null, pendiente = null, cursor = null;
  let recalculoPendiente = false, lento = false, notaCerrada = false;
  const capas = { vectores: true, fuerzas: true, traza: true, estrobo: true, prevista: true, cotas: true };
  const mostrar = { velocidad: true, componentes: false, aceleracion: false, peso: false, aplicada: true, normal: true, tension: true, elastica: false, prevista: true };
  const lienzo = $('#lienzo'), area = $('#area');
  const tz = new Trazo(lienzo);
  const params = new URLSearchParams(location.search);
  const captura = params.has('captura');

  const DUR = () => esc.duracion;
  const tFinal = () => (SIM ? Math.min(DUR(), SIM.tFin ?? SIM.duracion ?? DUR()) : 0);
  const abajo = () => (esc.g > 0 ? [cosd(esc.gAng), sind(esc.gAng)] : null);
  const arribaUnit = () => (esc.g > 0 ? [-cosd(esc.gAng), -sind(esc.gAng)] : [0, 1]);
  const pasoRejilla = () => { const mayor = pasoAgradable(90 / tz.vista.escala); return mayor / (String(mayor).startsWith('2') ? 4 : 5); };
  const ajustar = (w, libre) => (libre ? Math.round(w * 1000) / 1000 : Math.round(w / pasoRejilla()) * pasoRejilla());
  const ajustarP = (p, libre) => [ajustar(p[0], libre), ajustar(p[1], libre)].map(v => Number(v.toFixed(10)));

  // -------------------------------------------------------------------------
  // Simulación
  // -------------------------------------------------------------------------
  function simular(rapido = false) {
    M = aMotor(esc);
    avisoMotor = null; SIM = null;
    if (M.motor.particulas.length) {
      try {
        SIM = simularMecanica(rapido ? { ...M.motor, rtol: 1e-7 } : M.motor);
        if (SIM.incompleta) avisoMotor = `La simulación se detuvo en t = ${fmt(SIM.incompleta.t ?? SIM.tFin, 4)} s: ${SIM.incompleta.motivo}`;
      } catch (e) {
        // Un motor anterior lanzaba al llegar al límite: se simula hasta ese instante
        const m = /t = ([-+\d.eE]+)/.exec(e.message || '');
        avisoMotor = `No se pudo simular la escena: ${e.message}`;
        if (m && +m[1] > 0) { try { SIM = simularMecanica({ ...M.motor, duracion: +m[1] }); SIM.tFin = +m[1]; } catch { SIM = null; } }
      }
    }
    if (!avisoMotor && M.avisos.length) avisoMotor = M.avisos[0];
    if (SIM) prepararMuestras(); else MUESTRAS = [];
    t = Math.min(t, tFinal());
  }

  /** Muestras de todo el movimiento (para trayectorias, gráficas y escalas). */
  function prepararMuestras() {
    const tf = tFinal(), n = Math.max(300, Math.min(1600, Math.ceil(tf * 160)));
    const tiempos = [];
    for (let k = 0; k <= n; k++) tiempos.push(tf * k / n);
    for (const e of SIM.eventos) if (e.t > 0 && e.t < tf) tiempos.push(Math.max(0, e.t - 1e-9), e.t);
    tiempos.sort((a, b) => a - b);
    MUESTRAS = tiempos.map(tt => ({ t: tt, est: estadoMecanica(SIM, tt) }));
    if (!arrastre) calcularEscalas();
  }

  /** Valor 1-2-5 menor o igual que x (las escalas de los vectores se redondean hacia abajo). */
  const bonito = x => { const e = Math.pow(10, Math.floor(Math.log10(x))), m = x / e; return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * e; };
  function calcularEscalas() {
    const caja = cajaEscena();
    LREF = Math.max(0.2, Math.max(caja.x1 - caja.x0, caja.y1 - caja.y0));
    let vmax = 0;
    for (const m of MUESTRAS) for (const s of m.est) vmax = Math.max(vmax, Math.hypot(s.vx, s.vy));
    for (const p of M.motor.particulas) vmax = Math.max(vmax, largo(p.v));
    ESC_V = vmax > 1e-9 ? bonito(0.2 * LREF / vmax) : 0.2;
    let Fmax = 0;
    if (SIM) {
      const k = 60, tf = tFinal();
      for (let i = 0; i <= k; i++) {
        try { const f = fuerzasEn(SIM, M, tf * i / k); for (const l of f.porParticula) for (const x of l) if (x.tipo !== 'arrastre') Fmax = Math.max(Fmax, Math.abs(x.valor)); } catch { /* tramo vacío */ }
      }
    }
    for (const p of M.motor.particulas) Fmax = Math.max(Fmax, p.m * esc.g);
    ESC_F = Fmax > 1e-9 ? bonito(0.15 * LREF / Fmax) : 0.05;
  }

  /** Estado de las partículas en t: en t = 0, el de la escena tal como está ahora. */
  function estadoEn(tt) {
    if (tt <= 0 || !SIM) return M.motor.particulas.map(p => ({ id: p.id, x: p.p[0], y: p.p[1], vx: p.v[0], vy: p.v[1] }));
    return estadoMecanica(SIM, tt);
  }

  // -------------------------------------------------------------------------
  // Dibujo: posiciones de dibujo (ramales verticales de una polea)
  // -------------------------------------------------------------------------
  // Una polea ideal (puntual) con ramales paralelos equivale a una rueda de
  // radio r de la que cuelgan los dos ramales por su borde: cada partícula se
  // dibuja desplazada r hacia su lado (como en la figura de una máquina de
  // Atwood). Con ramales no paralelos, la cuerda va tangente a la rueda.
  const radioPoleaMundo = c => Math.max(G.particula, (c.r || 0.1) * tz.vista.escala) / tz.vista.escala;
  function desplazamientos(pos) {
    const off = pos.map(() => [0, 0]);
    for (const c of M.conectores) {
      if (c.tipo !== 'polea') continue;
      const ia = M.indice[c.a], ib = M.indice[c.b], ua = unitario(resta(pos[ia], c.P)), ub = unitario(resta(pos[ib], c.P));
      const cruz = ua[0] * ub[1] - ua[1] * ub[0], dt = punto(ua, ub);
      if (dt <= 0) continue;
      const f = Math.max(0, 1 - Math.asin(Math.min(1, Math.abs(cruz))) / (5 * DEG));
      if (!(f > 0)) continue;
      const r = radioPoleaMundo(c) * f, aIzq = cruz >= 0;
      const cw = u => [u[1], -u[0]], ccw = u => [-u[1], u[0]];
      const na = aIzq ? cw(ua) : ccw(ua), nb = aIzq ? ccw(ub) : cw(ub);
      off[ia][0] += r * na[0]; off[ia][1] += r * na[1]; off[ib][0] += r * nb[0]; off[ib][1] += r * nb[1];
    }
    return off;
  }
  /** Posiciones de dibujo [x, y] de un estado (lista de {x, y}). */
  function posDibujo(est) {
    const pos = est.map(s => [s.x, s.y]), off = desplazamientos(pos);
    return pos.map((p, i) => [p[0] + off[i][0], p[1] + off[i][1]]);
  }
  const radioPx = i => Math.max(G.particula, (M.motor.particulas[i]?.radio || 0) * tz.vista.escala);

  // -------------------------------------------------------------------------
  // Encuadre
  // -------------------------------------------------------------------------
  function cajaEscena() {
    const xs = [], ys = [];
    const sumar = p => { if (Number.isFinite(p[0]) && Number.isFinite(p[1])) { xs.push(p[0]); ys.push(p[1]); } };
    for (const o of esc.objetos) {
      if (o.tipo === 'superficie') puntosSuperficie(o).forEach(sumar);
      else if (o.tipo === 'clavo') sumar([o.x, o.y]);
      else if (o.tipo === 'polea') sumar(o.P);
      else if (o.ancla) sumar(o.ancla);
    }
    for (const p of M.motor.particulas) { sumar([p.p[0] - p.radio, p.p[1] - p.radio]); sumar([p.p[0] + p.radio, p.p[1] + p.radio]); }
    for (const m of MUESTRAS) for (const s of m.est) sumar([s.x, s.y]);
    if (!xs.length) return { x0: -2, x1: 2, y0: -1, y1: 2 };
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = Math.max(x1 - x0, 0.5), h = Math.max(y1 - y0, 0.5), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    x0 = cx - w / 2; x1 = cx + w / 2; y0 = cy - h / 2; y1 = cy + h / 2;
    const m = 0.12 * Math.max(w, h);
    return { x0: x0 - m, x1: x1 + m, y0: y0 - m, y1: y1 + m };
  }
  function encuadrar() {
    // La nota del tutorial ocupa la esquina superior izquierda: el encuadre la deja libre
    const izq = $('#nota').hidden ? 0 : Math.min(296, tz.w * 0.35);
    tz.vista.encuadrar(cajaEscena(), { x: izq, y: 44, w: tz.w - izq, h: tz.h - 88 }, 36);
    encuadreHecho = true; escala0 = tz.vista.escala; zoomTexto();
  }

  // -------------------------------------------------------------------------
  // Dibujo del lienzo
  // -------------------------------------------------------------------------
  function dibujar() {
    if (!encuadreHecho) encuadrar();
    const v = tz.vista, s = estadoEn(t), pd = posDibujo(s), tr = SIM && t > 0 ? tramoEn(SIM, t) : null;
    tz.limpiar(); tz.cuadricula();
    tz.ejes({ x: 'x', huecos: pd.map((p, i) => [v.X(p[0]), v.Y(p[1]), radioPx(i)]) });
    // Rótulo del eje y: arriba, salvo que lo tape la barra de capas (entonces, debajo de ella)
    const X0 = Math.round(v.X(0)) + 0.5, capasR = $('.flotante.ar-der').getBoundingClientRect(), lz = lienzo.getBoundingClientRect();
    const tapado = X0 + 8 + 40 > capasR.left - lz.left - 4 && X0 + 8 < capasR.right - lz.left;
    if (X0 > 0 && X0 < tz.w - 40) tz.compuesto([{ t: 'y', f: 'sim', tam: 14 }, { t: ' (m)', f: 'ui', tam: 11 }], X0 + 8, tapado ? capasR.bottom - lz.top + 16 : 18, { color: 'texto-3' });

    // 3. Geometría fija
    for (const o of esc.objetos) {
      if (o.tipo !== 'superficie') continue;
      const grueso = hover === o.id;
      if (o.forma === 'arco') tz.mecArco(o.c, o.r, o.a0 * DEG, o.a1 * DEG, o.cara, { grueso });
      else { tz.superficie([o.a, o.b]); if (grueso) tz.linea([o.a, o.b], { color: 'tinta', grosor: G.materia + 0.5 }); }
    }

    // 5. Construcción: cotas, trayectoria prevista, trazas y estroboscopio
    if (capas.cotas) dibujarCotas();
    const nP = M.motor.particulas.length;
    if (SIM && MUESTRAS.length && !(arrastre && lento)) {
      const pts = MUESTRAS.map(m => posDibujo(m.est));
      for (let i = 0; i < nP; i++) {
        if (capas.prevista && mostrar.prevista) tz.trayectoria(pts.map(q => q[i]), 'prevista');
        if (capas.traza && t > 0) {
          const hasta = pts.filter((q, k) => MUESTRAS[k].t <= t);
          hasta.push(pd);
          tz.trayectoria(hasta.map(q => q[i]), 'real');
        }
      }
      if (capas.estrobo && t > 0) {
        const dt = intervaloEstrobo();
        for (let k = 0; k * dt < t - 1e-9; k++) {
          const q = posDibujo(estadoEn(k * dt));
          q.forEach((p, i) => { if (radioPx(i) > G.particula) tz.ctx.save(), (tz.ctx.globalAlpha = 0.5), tz.ctx.setLineDash([]), (tz.ctx.strokeStyle = tz.t['texto-3']), (tz.ctx.lineWidth = 1), tz.ctx.beginPath(), tz.ctx.arc(v.X(p[0]), v.Y(p[1]), radioPx(i), 0, 2 * Math.PI), tz.ctx.stroke(), tz.ctx.restore(); else tz.fantasma(p); });
        }
      }
    }

    // 6. Materia: conectores, clavos y partículas
    dibujarConectores(s, pd, tr);
    for (const o of esc.objetos) if (o.tipo === 'clavo') tz.mecClavo([o.x, o.y], { grueso: hover === o.id });
    M.particulas.forEach((o, i) => {
      tz.mecDisco(pd[i], o.radio || 0, { etiqueta: o.nombre, grueso: hover === o.id, lado: ladoRotulo(i, s[i]) });
    });

    // 7. Magnitudes
    if (capas.vectores || capas.fuerzas) dibujarVectores(s, pd);

    // Eventos
    if (SIM) dibujarEventos();

    // 10. Edición: selección, asas, guías y herramienta en curso
    dibujarSeleccion(pd);
    dibujarHerramienta();
    tz.barraEscala(16, tz.h - 56);
    actualizarAvisoMotor();
  }

  /** Diagonal del rótulo de una partícula que más se aleja de sus vectores (pantalla, y hacia abajo). */
  function ladoRotulo(i, q) {
    const dirs = [];
    if (capas.vectores && mostrar.velocidad && q && Math.hypot(q.vx, q.vy) > 1e-9) dirs.push([q.vx, -q.vy]);
    const f = capas.fuerzas ? fuerzasAhora() : null;
    if (f) for (const x of f.porParticula[i] || []) if (mostrar[CASILLA_F[x.tipo]] && largo(x.F) > 1e-12) dirs.push([x.F[0], -x.F[1]]);
    const cand = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    if (!dirs.length) return cand[0];
    let mejor = cand[0], mejorAng = -1;
    for (const c of cand) {
      const ang = Math.min(...dirs.map(d => Math.acos(Math.max(-1, Math.min(1, (c[0] * d[0] + c[1] * d[1]) / (Math.SQRT2 * largo(d)))))));
      if (ang > mejorAng + 1e-9) { mejor = c; mejorAng = ang; }
    }
    return mejor;
  }
  function intervaloEstrobo() { const d = tFinal(); return d <= 4 ? 0.1 : pasoAgradable(d / 40); }

  function dibujarCotas() {
    for (const o of esc.objetos) {
      if (o.tipo !== 'superficie') continue;
      if (o.forma === 'plano') {
        const bajo = o.a[1] <= o.b[1] ? o.a : o.b, alto = bajo === o.a ? o.b : o.a;
        const ang = Math.atan2(alto[1] - bajo[1], alto[0] - bajo[0]), hacia = alto[0] >= bajo[0] ? 0 : Math.PI;
        const th = Math.abs(Math.atan2(Math.abs(alto[1] - bajo[1]), Math.abs(alto[0] - bajo[0])));
        if (th > 1 * DEG && th < 89 * DEG) {
          tz.linea([bajo, [bajo[0] + (hacia ? -1 : 1) * 0.5 * Math.min(1, largo(resta(alto, bajo))), bajo[1]]], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
          if (hacia === 0) tz.angulo(bajo, 0, ang, { radio: 34, texto: 'θ' }); else tz.angulo(bajo, ang, Math.PI, { radio: 34, texto: 'θ' });
        }
      } else if (o.forma === 'arco' && o.id === sel) {
        const am = (o.a0 + o.a1) / 2;
        tz.cota(o.c, [o.c[0] + o.r * cosd(am), o.c[1] + o.r * sind(am)], { texto: 'R', desplazamiento: 18 });
      }
    }
  }

  /** Cuerda: estado (tensa, clavos enganchados) del tramo en curso. */
  function estadoCuerda(c, tr, pa, pb) {
    if (tr && tr.modo?.cuerdas?.[c.id]) return tr.modo.cuerdas[c.id];
    const L = c.tipo === 'polea' ? Math.max(c.L, largo(resta(pa, c.P)) + largo(resta(pb, c.P))) : c.L, D = c.tipo === 'polea' ? largo(resta(pa, c.P)) + largo(resta(pb, c.P)) : largo(resta(pa, pb));
    return { tensa: Math.abs(L - D) < 1e-9, clavos: [], Lrest: L };
  }

  function dibujarConectores(s, pd) {
    const tr = SIM && t > 0 ? tramoEn(SIM, t) : null, v = tz.vista;
    const clavosM = M.clavos.map(n => [n.x, n.y]);
    for (const c of M.conectores) {
      const ia = M.indice[c.a], ib = c.b != null ? M.indice[c.b] : -1;
      const pa = pd[ia], pb = ib >= 0 ? pd[ib] : c.ancla, grueso = hover === c.id;
      if (c.tipo === 'resorte') tz.resorte(pb, pa);
      else if (c.tipo === 'varilla') tz.mecVarilla(pb, pa, { grueso });
      else if (c.tipo === 'cuerda') {
        const est = estadoCuerda(c, tr, [s[ia].x, s[ia].y], ib >= 0 ? [s[ib].x, s[ib].y] : c.ancla);
        const pts = [pb, ...(ib < 0 ? (est.clavos || []).map(k => clavosM[k]) : []), pa];
        if (est.tensa) tz.mecCuerda(pts, { grueso });
        else {
          let fijo = 0; for (let k = 1; k < pts.length - 1; k++) fijo += largo(resta(pts[k], pts[k - 1]));
          tz.mecCuerda(pts, { longitud: (est.clavos?.length ? fijo + est.Lrest : c.L), abajo: abajo(), grueso });
        }
      } else if (c.tipo === 'polea') dibujarPolea(c, s, pd, tr);
      if (c.tipo !== 'polea' && c.tipo !== 'union' && ib < 0) tz.pivote(c.ancla);
      if (c.tipo === 'union' && sel === c.id) {
        const [x1, y1] = v.P(pd[ia]), [x2, y2] = v.P(pd[ib]);
        tz.lineaPx([[x1, y1], [x2, y2]], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
      }
    }
  }

  function dibujarPolea(c, s, pd, tr) {
    const v = tz.vista, ia = M.indice[c.a], ib = M.indice[c.b];
    const R = tz.mecPolea(c.P, c.r || 0.1, arribaUnit(), { grueso: hover === c.id }), r = R / v.escala;
    const est = estadoCuerda(c, tr, [s[ia].x, s[ia].y], [s[ib].x, s[ib].y]);
    const ua = unitario(resta(pd[ia], c.P)), ub = unitario(resta(pd[ib], c.P));
    let w = [ua[0] + ub[0], ua[1] + ub[1]]; if (largo(w) < 1e-6) w = abajo() || [0, -1];
    // Punto de tangencia de cada ramal, del lado contrario a la bisectriz
    const tangente = (X, otro) => {
      const d = resta(X, c.P), D = largo(d);
      if (D <= r) return [c.P[0] + r * d[0] / (D || 1), c.P[1] + r * d[1] / (D || 1)];
      const b = Math.atan2(d[1], d[0]), a = Math.acos(r / D);
      const t1 = [c.P[0] + r * Math.cos(b + a), c.P[1] + r * Math.sin(b + a)], t2 = [c.P[0] + r * Math.cos(b - a), c.P[1] + r * Math.sin(b - a)];
      const k1 = punto(resta(t1, c.P), w), k2 = punto(resta(t2, c.P), w);
      if (Math.abs(k1 - k2) < 1e-12 * r) return punto(resta(t1, c.P), otro) < punto(resta(t2, c.P), otro) ? t1 : t2;
      return k1 < k2 ? t1 : t2;
    };
    const Ta = tangente(pd[ia], ub), Tb = tangente(pd[ib], ua);
    const extra = est.tensa ? 0 : Math.max(0, (est.Lrest ?? c.L) - largo(resta(s[ia] ? [s[ia].x, s[ia].y] : pd[ia], c.P)) - largo(resta([s[ib].x, s[ib].y], c.P)));
    tz.mecCuerda([Ta, pd[ia]], extra > 0 ? { longitud: largo(resta(pd[ia], Ta)) + extra / 2, abajo: abajo() } : {});
    tz.mecCuerda([Tb, pd[ib]], extra > 0 ? { longitud: largo(resta(pd[ib], Tb)) + extra / 2, abajo: abajo() } : {});
    const ang = p => Math.atan2(-(p[1] - c.P[1]), p[0] - c.P[0]);
    tz.mecAbrazo(c.P, R, ang(Ta), ang(Tb), Math.atan2(w[1], -w[0]));
  }

  // Fuerzas: símbolos de cada tipo (familia interacción) y casilla que las muestra
  const SIMBOLO_F = { peso: ['P', ''], aplicada: ['F', ''], normal: ['N', ''], friccion: ['f', ''], tension: ['T', ''], elastica: ['F', 'e'], arrastre: ['F', 'a'] };
  const CASILLA_F = { peso: 'peso', aplicada: 'aplicada', normal: 'normal', friccion: 'normal', tension: 'tension', elastica: 'elastica', arrastre: 'peso' };
  let FUERZAS = null, tFuerzas = -1, simFuerzas = null;
  function fuerzasAhora() {
    if (!SIM) return null;
    if (FUERZAS && tFuerzas === t && simFuerzas === SIM) return FUERZAS;
    try { FUERZAS = fuerzasEn(SIM, M, Math.min(t, tFinal())); } catch { FUERZAS = null; }
    tFuerzas = t; simFuerzas = SIM;
    return FUERZAS;
  }

  function dibujarVectores(s, pd) {
    const v = tz.vista, f = capas.fuerzas ? fuerzasAhora() : null;
    s.forEach((q, i) => {
      const o = M.particulas[i], elegida = sel === o.id, r = radioPx(i) + 1;
      if (capas.fuerzas && f) {
        for (const x of f.porParticula[i]) {
          if (!mostrar[CASILLA_F[x.tipo]] || largo(x.F) * ESC_F * v.escala < 3) continue;
          const [simb, sub] = SIMBOLO_F[x.tipo];
          tz.vector(pd[i], x.F, { familia: 'interaccion', escalaPx: ESC_F * v.escala, simbolo: simb, sub, subRecto: true, valor: elegida ? Math.abs(x.valor) : null, unidad: 'N', desdeRadio: r });
        }
        if (mostrar.aceleracion && f.acc[i] && largo(f.acc[i]) > 1e-9) tz.vector(pd[i], f.acc[i], { familia: 'cambio', escalaPx: ESC_F * o.m * v.escala, simbolo: 'a', valor: elegida ? largo(f.acc[i]) : null, unidad: 'm/s²', desdeRadio: r });
      }
      if (capas.vectores && mostrar.velocidad) {
        const vv = [q.vx, q.vy];
        if (largo(vv) * ESC_V * v.escala >= 2) {
          const [ex, ey] = tz.vector(pd[i], vv, { familia: 'movimiento', escalaPx: ESC_V * v.escala, simbolo: 'v', valor: elegida ? largo(vv) : null, unidad: 'm/s', desdeRadio: r, componentes: elegida && mostrar.componentes, subX: true, subY: true });
          if (t === 0 && elegida) tz.asaVector(ex, ey, arrastre?.tipo === 'velocidad');
        } else if (t === 0 && elegida) {
          const [x, y] = v.P(pd[i]); tz.asaVector(x + r + 14, y, arrastre?.tipo === 'velocidad');
        }
      }
    });
  }

  function dibujarEventos() {
    const v = tz.vista, evs = SIM.eventos;
    const lugar = e => { const pos = lugarDelEvento(e, M); if (!pos) return null; const est = M.motor.particulas.map((p, i) => ({ x: e.y[4 * i], y: e.y[4 * i + 1] })); const off = desplazamientos(est.map(q => [q.x, q.y])); const idx = particulasDelEvento(e, M); return idx.length === 1 ? [pos[0] + off[idx[0]][0], pos[1] + off[idx[0]][1]] : pos; };
    const futuros = evs.filter(e => e.t > t + 1e-9).slice(0, 3);
    for (const e of futuros) { const p = lugar(e); if (!p) continue; tz.ctx.save(); tz.ctx.globalAlpha = 0.4; tz.eventoAnillo(p); tz.ctx.restore(); }
    const pasados = evs.filter(e => e.t <= t + 1e-9 && t > 0);
    // Con muchos eventos (rebotes), solo los últimos
    for (const e of pasados.slice(-12)) { const p = lugar(e); if (p) tz.eventoAnillo(p); }
    const ultimo = pasados[pasados.length - 1];
    if (ultimo) {
      const p = lugar(ultimo); if (!p) return;
      const [px, py] = v.P(p), derecha = px < tz.w - 260;
      const lineas = [
        [{ t: describirEvento(ultimo, M), f: 'ui', tam: 11.5 }],
        [{ t: 't', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(ultimo.t, 's', 4), f: 'num', tam: 11.5 }, ...(ultimo.perdida > 1e-9 ? [{ t: ' · se disipan ', f: 'ui', tam: 11.5, color: 'texto-3' }, { t: cantidad(ultimo.perdida, 'J', 3), f: 'num', tam: 11.5 }] : [])],
      ];
      tz.ctx.save(); tz.ctx.font = '11.5px "IBM Plex Sans"'; const ancho = tz.ctx.measureText(lineas[0][0].t).width + 24; tz.ctx.restore();
      tz.ficha(derecha ? px + 22 : px - 22 - Math.max(ancho, 170), py - 46, lineas, { ancla: [px + (derecha ? 6 : -6), py - 5] });
    }
  }

  function dibujarSeleccion(pd) {
    const v = tz.vista, o = objeto(esc, sel);
    if (!o) return;
    if (o.tipo === 'particula') {
      const i = M.indice[o.id], [x, y] = v.P(pd[i]); tz.seleccionCirculo(x, y, radioPx(i) + 5);
    } else if (o.tipo === 'superficie') {
      if (o.forma === 'arco') {
        tz.mecSeleccionArco(o.c, o.r, o.a0 * DEG, o.a1 * DEG);
        for (const p of asasArco(o)) tz.asa(...v.P(p.p));
      } else tz.mecSeleccionSegmento(o.a, o.b);
    } else if (o.tipo === 'clavo') {
      const [x, y] = v.P([o.x, o.y]); tz.seleccionCirculo(x, y, 8.5);
    } else if (o.tipo === 'polea') {
      const [x, y] = v.P(o.P); tz.seleccionCirculo(x, y, Math.max(6, (o.r || 0.1) * v.escala) + 5);
    } else if (CONECTORES.includes(o.tipo)) {
      const ia = M.indice[o.a], ib = o.b != null ? M.indice[o.b] : -1;
      if (ia == null) return;
      tz.mecSeleccionSegmento(ib >= 0 ? pd[ib] : o.ancla, pd[ia], { asas: false });
      if (o.ancla) tz.asa(...v.P(o.ancla));
    }
    // Guía del ajuste en curso
    if (arrastre?.guia) { const [x, y] = arrastre.guia.p; tz.ficha(x + 14, y - 34, [arrastre.guia.texto]); }
    if (arrastre?.tipo === 'velocidad') {
      const p = objeto(esc, arrastre.id), i = M.indice[p.id], [bx, by] = v.P(pd[i]);
      tz.guia([[bx, by], [bx + 120, by]], null);
      tz.ficha(bx + 18, by + 18, [
        [{ t: 'v', f: 'sim', tam: 13, color: 'movimiento' }, { t: '0', f: 'simRecta', tam: 9, dy: 3, color: 'movimiento' }, { t: ' = ' + cantidad(p.v, 'm/s', 3), f: 'num', tam: 11.5 }],
        [{ t: 'α', f: 'sim', tam: 13 }, { t: ' = ' + limpio(p.ang, 3) + '°', f: 'num', tam: 11.5 }],
      ]);
    }
  }

  function asasArco(o) {
    const am = (o.a0 + o.a1) / 2, P = a => [o.c[0] + o.r * cosd(a), o.c[1] + o.r * sind(a)];
    return [{ cual: 'radio', p: P(am) }, { cual: 'a0', p: P(o.a0) }, { cual: 'a1', p: P(o.a1) }];
  }

  // Vista previa de la herramienta: banda elástica de conectores y superficies
  function dibujarHerramienta() {
    const v = tz.vista;
    const fin = cursor ? ajustarP(cursor.w, cursor.libre) : null;
    if (arrastre?.tipo === 'crear' && arrastre.p1) {
      const geo = geometriaNueva(arrastre.herr, arrastre.p0, arrastre.p1);
      if (geo.forma === 'arco') tz.mecArco(geo.c, geo.r, geo.a0 * DEG, geo.a1 * DEG, geo.cara);
      else if (geo.a) tz.superficie([geo.a, geo.b]);
    }
    const origen = arrastre?.tipo === 'conectar' ? arrastre : pendiente;
    if (origen && fin) {
      const desde = origen.a ? M.motor.particulas[M.indice[origen.a]]?.p : origen.ancla || origen.P;
      if (desde) {
        const hasta = origen.objetivo ? M.motor.particulas[M.indice[origen.objetivo]].p : fin;
        tz.linea([desde, hasta], { color: 'texto-3', grosor: G.previsto, patron: 'previsto' });
        if (origen.P) tz.mecPolea(origen.P, 0.1, arribaUnit());
        const [x, y] = v.P(hasta); tz.ficha(x + 12, y + 10, [textoPendiente(origen)]);
      }
    }
  }
  function textoPendiente(o) {
    if (o.herr === 'polea') return o.a ? 'Clic en la segunda partícula' : 'Clic en la primera partícula';
    if (o.herr === 'union') return 'Clic en el otro disco';
    return o.a ? 'Clic en una partícula o en un punto fijo' : 'Clic en una partícula';
  }

  // -------------------------------------------------------------------------
  // Aviso del motor (persistente) y nota del tutorial
  // -------------------------------------------------------------------------
  function actualizarAvisoMotor() {
    const el = $('#aviso-motor');
    if (avisoMotor) { el.hidden = false; $('#aviso-motor-texto').textContent = avisoMotor; } else el.hidden = true;
    const vacio = !M.motor.particulas.length;
    $('#vacio').hidden = !vacio || !!herramienta || !!arrastre;
  }
  function pintarNota() {
    const n = $('#nota');
    if (!esc.nota || !esc.nota.length || notaCerrada) { n.hidden = true; return; }
    n.hidden = false;
    $('#nota-titulo').textContent = esc.titulo;
    $('#nota-pasos').innerHTML = esc.nota.map(p => `<li>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</li>`).join('');
  }
  $('#nota-cerrar').addEventListener('click', () => { notaCerrada = true; pintarNota(); });

  // -------------------------------------------------------------------------
  // Paneles: barra, árbol, inspector, lecturas
  // -------------------------------------------------------------------------
  function pintarBarra() {
    const e = ESCENARIOS.find(x => x.id === esc.escenario);
    const chip = esc.tipo === 'mext' ? `MEXT ${e?.anio ?? ''}`.trim() : esc.tipo === 'tutorial' ? 'Tutorial' : esc.tipo === 'ejemplo' ? 'Ejemplo' : 'Propio';
    $('#escena-chip').textContent = chip;
    $('#escena-chip').className = 'chip' + (esc.tipo === 'mext' ? ' lleno' : '');
    $('#escena-nombre').textContent = esc.titulo;
    document.title = `Volta · ${esc.titulo}`;
  }

  function datoArbol(o) {
    switch (claseDe(o)) {
      case 'particula': return cantidad(o.m, 'kg', 3);
      case 'cuerda': case 'varilla': return o.L != null ? cantidad(o.tipo === 'varilla' ? largoVarilla(o) : o.L, 'm', 3) : '';
      case 'resorte': return cantidad(o.k, 'N/m', 3);
      case 'polea': return cantidad(o.L, 'm', 3);
      case 'arco': return 'R ' + cantidad(o.r, 'm', 3);
      case 'clavo': case 'union': return '';
      default: return o.e < 1 ? 'e ' + limpio(o.e, 2) : o.mu > 0 ? 'μ ' + limpio(o.mu, 2) : '';
    }
  }
  function icono(o) { return o.tipo === 'particula' && o.radio > 0 ? ICONOS.disco : ICONOS[claseDe(o)]; }
  function construirArbol() {
    const orden = ['particula', 'superficie', ...CONECTORES, 'clavo'];
    const lista = [...esc.objetos].sort((a, b) => orden.indexOf(a.tipo) - orden.indexOf(b.tipo));
    const filas = lista.map(o => `<div class="nodo" data-sel="${o.id}" aria-selected="${sel === o.id}">${ico(icono(o))}<span class="nombre">${o.nombre}</span><span class="dato">${datoArbol(o)}</span><button class="acciones btn-borrar" data-borrar="${o.id}" data-ayuda="Borrar|Delete|Supr">${ico('i-borrar')}</button></div>`);
    filas.push(`<div class="nodo global" data-sel="escena" aria-selected="${sel === 'escena'}">${ico('o-gravedad')}<span class="nombre">Gravedad y medio</span><span class="dato">${cantidad(esc.g, 'm/s²', 3)}</span></div>`);
    $('#arbol').innerHTML = filas.join('');
  }
  $('#arbol').addEventListener('click', ev => {
    const b = ev.target.closest('[data-borrar]');
    if (b) { ev.stopPropagation(); borrar(b.dataset.borrar); return; }
    const n = ev.target.closest('.nodo'); if (n) seleccionar(n.dataset.sel);
  });
  function seleccionar(id) { sel = id || 'escena'; construirArbol(); construirInspector(); todo(); }

  // Unidades de los campos: símbolo y dimensión
  const UNI = {
    longitud: { u: 'm', dim: 'longitud', def: 'm' }, masa: { u: 'kg', dim: 'masa', def: 'kg' }, velocidad: { u: 'm/s', dim: 'velocidad' },
    aceleracion: { u: 'm/s²', dim: 'aceleracion' }, tiempo: { u: 's', dim: 'tiempo', def: 's' }, angulo: { u: '°', angulo: true },
    rigidez: { u: 'N/m', dim: [0, 1, -2, 0, 0, 0] }, amort: { u: 'N·s/m', dim: [0, 1, -1, 0, 0, 0] }, arrastre2: { u: 'N·s²/m²', dim: [-1, 1, 0, 0, 0, 0] },
    adim: { u: '', dim: 'adimensional' },
    fuerza: { u: 'N', dim: 'fuerza', def: 'N' },
  };
  /** Lee un campo: número con unidad, expresión o variable (g). Un número solo va en la unidad del campo. */
  function leerCampo(textoCampo, tipoU) {
    const U = UNI[tipoU], vars = { g: { valor: esc.g, dim: DIM.aceleracion } };
    if (U.angulo) {
      const conUnidad = /°|rad|deg|grados/.test(textoCampo);
      const r = evaluar(textoCampo, { variables: vars });
      if (r.dim.some(x => Math.abs(x) > 1e-9)) throw new Error('La expresión tiene unidades y este campo espera un ángulo.');
      return conUnidad ? r.valor / DEG : r.valor;
    }
    try { return evaluar(textoCampo, { esperada: U.dim, unidadPorDefecto: U.def, variables: vars }).valor; }
    catch (err) {
      const r = evaluar(textoCampo, { variables: vars });
      if (r.dim.every(x => Math.abs(x) < 1e-9)) return r.valor;   // número solo: en la unidad del campo (SI)
      // «una cantidad en kg·s^-2» se dice con la unidad del campo: «N/m»
      throw new Error(err.message.replace(/este campo espera una cantidad en [^.]+/, `este campo espera ${U.u}`));
    }
  }
  const campo = (clave, valor, tipoU, eje, ayuda) => `<div class="campo"${ayuda ? ` data-ayuda="${ayuda}"` : ''}>${eje ? `<span class="eje">${eje}</span>` : ''}<input data-clave="${clave}" data-u="${tipoU}" value="${limpio(valor)}" spellcheck="false"><span class="u">${UNI[tipoU].u}</span></div>`;
  const fila = (etq, html) => `<div class="fila"><span class="etq">${etq}</span>${html}</div>`;
  const doble = (a, b) => `<div class="fila-doble">${a}${b}</div>`;
  const grupo = (titulo, cuerpo, id) => `<details class="grupo" open><summary>${ico('i-chevron-abajo')}<span${id ? ` id="${id}"` : ''}>${titulo}</span></summary>${cuerpo}</details>`;
  const casilla = (clave, txt, color, discontinua) => `<label class="casilla"><input type="checkbox" data-mostrar="${clave}"${mostrar[clave] !== false ? ' checked' : ''}>${txt}${color ? `<span class="muestra${discontinua ? ' discontinua' : ''}" style="color:var(--${color})"></span>` : ''}</label>`;
  const segmentado = (clave, opciones, actual) => `<div class="segmentado texto" data-segmento="${clave}">${opciones.map(([v, t]) => `<button data-v="${v}" aria-pressed="${v === actual}">${t}</button>`).join('')}</div>`;
  const ayudaFila = txt => `<p class="ayuda-fila">${txt}</p>`;

  function grupoMostrar() {
    return grupo('Mostrar',
      casilla('velocidad', 'Velocidad', 'f-movimiento') + casilla('componentes', 'Componentes de v', 'f-movimiento', true) +
      casilla('aceleracion', 'Aceleración', 'f-cambio') + casilla('peso', 'Peso', 'f-interaccion') +
      (esc.objetos.some(o => o.tipo === 'particula' && o.F > 0) ? casilla('aplicada', 'Fuerza aplicada', 'f-interaccion') : '') +
      casilla('normal', 'Normal y fricción', 'f-interaccion') + casilla('tension', 'Tensión', 'f-interaccion') +
      casilla('elastica', 'Fuerza elástica', 'f-interaccion') + casilla('prevista', 'Trayectoria prevista', 'texto-3', true));
  }
  const largoVarilla = c => { const ia = M.indice[c.a], pa = M.posiciones[ia], pb = c.b != null ? M.posiciones[M.indice[c.b]] : c.ancla; return pa && pb ? largo(resta(pa, pb)) : c.L; };
  const nombreDe = id => objeto(esc, id)?.nombre ?? '—';

  function construirInspector() {
    const o = objeto(esc, sel);
    let h = '';
    const cab = (icono, t1, t2) => `<div class="insp-cab"><div class="miniatura">${ico(icono)}</div><div><div class="t1">${t1}</div><div class="t2" id="insp-estado">${t2}</div></div></div>`;
    if (!o) {
      h += cab('o-gravedad', esc.titulo, 'Escena · gravedad y medio');
      h += grupo('Escena', fila('Título', `<div class="campo texto"><input data-clave="escena.titulo" data-u="texto" value="${esc.titulo.replace(/"/g, '&quot;')}"></div>`) + fila('Duración', campo('escena.duracion', esc.duracion, 'tiempo')));
      h += grupo('Gravedad', fila('Intensidad', campo('escena.g', esc.g, 'aceleracion', 'g')) + fila('Dirección', campo('escena.gAng', esc.gAng, 'angulo', null, 'Ángulo desde el eje x; −90° apunta hacia abajo|Direction')) + ayudaFila('Con g = 0, el plano se ve desde arriba (una mesa sin fricción).'));
      h += grupo('Medio y choques', fila('Arrastre', campo('escena.b', esc.b, 'amort', 'b', 'Arrastre lineal: F = −b·v|Linear drag')) + fila('Cuadrático', campo('escena.cAire', esc.cAire, 'arrastre2', 'c', 'Arrastre cuadrático: F = −c·|v|·v|Quadratic drag')) +
        fila('Restitución', campo('escena.eParticulas', esc.eParticulas, 'adim', 'e', 'Coeficiente de restitución entre discos|Restitution between bodies')));
      h += grupoMostrar();
      h += grupo('Energía en t = 0', '<div class="lecturas" id="lecturas"></div>', 'lect-titulo');
    } else if (o.tipo === 'particula') {
      h += cab(icono(o), o.nombre, o.radio > 0 ? 'Disco' : 'Partícula');
      let c = fila('Masa', campo(`${o.id}.m`, o.m, 'masa'));
      const p = M.posiciones[M.indice[o.id]] || [o.x, o.y];
      c += fila('Posición', doble(campo(`${o.id}.x`, p[0], 'longitud', 'x'), campo(`${o.id}.y`, p[1], 'longitud', 'y')));
      c += fila('Velocidad', doble(campo(`${o.id}.v`, o.v, 'velocidad', 'v'), campo(`${o.id}.ang`, o.ang, 'angulo', 'α', 'Ángulo desde el eje x|Direction')));
      c += fila('Radio', campo(`${o.id}.radio`, o.radio, 'longitud', 'r', 'Con radio, choca con otros discos y apoya su borde en las superficies; 0 es una partícula puntual|Radius'));
      c += fila('Fuerza aplicada', doble(campo(`${o.id}.F`, o.F || 0, 'fuerza', 'F', 'Fuerza constante sobre la partícula durante toda la simulación; 0 la quita|Applied force'), campo(`${o.id}.angF`, o.angF || 0, 'angulo', 'β', 'Dirección de la fuerza desde el eje x|Direction')));
      if (o.sobre) c += fila('Apoyo', `<div class="apoyo"><span>Sobre ${conArticulo(nombreDe(o.sobre))}</span><button class="btn btn-compacto" data-accion-insp="soltar" data-ayuda="Deja de seguir a la superficie|Detach">Soltar</button></div>`);
      h += grupo('Condiciones iniciales', c);
      h += grupoMostrar();
      h += grupo('Lecturas', '<div class="lecturas" id="lecturas"></div>', 'lect-titulo');
    } else if (o.tipo === 'superficie') {
      const nombreForma = { suelo: 'Suelo o techo', pared: 'Pared', plano: 'Plano inclinado', segmento: 'Segmento', arco: 'Arco' }[o.forma];
      h += cab(ICONOS[o.forma], o.nombre, `Superficie fija · ${nombreForma.toLowerCase()}`);
      let g = '';
      if (o.forma === 'suelo') {
        const izq = Math.min(o.a[0], o.b[0]), der = Math.max(o.a[0], o.b[0]);
        g += fila('Altura', campo(`${o.id}.y`, o.a[1], 'longitud', 'y')) + fila('Desde', doble(campo(`${o.id}.x0`, izq, 'longitud', 'x'), campo(`${o.id}.x1`, der, 'longitud', 'x')));
        g += fila('Sólido', segmentado(`${o.id}.lado`, [['abajo', 'Abajo'], ['arriba', 'Arriba']], o.a[0] <= o.b[0] ? 'abajo' : 'arriba'));
      } else if (o.forma === 'pared') {
        const lo = Math.min(o.a[1], o.b[1]), hi = Math.max(o.a[1], o.b[1]);
        g += fila('Posición', campo(`${o.id}.x`, o.a[0], 'longitud', 'x')) + fila('Desde', doble(campo(`${o.id}.y0`, lo, 'longitud', 'y'), campo(`${o.id}.y1`, hi, 'longitud', 'y')));
        g += fila('Sólido', segmentado(`${o.id}.lado`, [['izq', 'Izquierda'], ['der', 'Derecha']], o.a[1] <= o.b[1] ? 'der' : 'izq'));
      } else if (o.forma === 'plano') {
        const pl = datosPlano(o);
        g += fila('Extremo alto', doble(campo(`${o.id}.x`, pl.alto[0], 'longitud', 'x'), campo(`${o.id}.y`, pl.alto[1], 'longitud', 'y')));
        g += fila('Inclinación', doble(campo(`${o.id}.th`, pl.th, 'angulo', 'θ'), campo(`${o.id}.L`, pl.L, 'longitud', 'L')));
        g += fila('Baja hacia', segmentado(`${o.id}.sentido`, [['izq', 'Izquierda'], ['der', 'Derecha']], pl.sentido));
      } else if (o.forma === 'segmento') {
        g += fila('Extremo a', doble(campo(`${o.id}.ax`, o.a[0], 'longitud', 'x'), campo(`${o.id}.ay`, o.a[1], 'longitud', 'y')));
        g += fila('Extremo b', doble(campo(`${o.id}.bx`, o.b[0], 'longitud', 'x'), campo(`${o.id}.by`, o.b[1], 'longitud', 'y')));
        g += fila('Sólido', `<button class="btn btn-secundario btn-compacto" data-accion-insp="voltear">Voltear el lado sólido</button>`);
      } else {
        g += fila('Centro', doble(campo(`${o.id}.cx`, o.c[0], 'longitud', 'x'), campo(`${o.id}.cy`, o.c[1], 'longitud', 'y')));
        g += fila('Radio', campo(`${o.id}.r`, o.r, 'longitud', 'R'));
        g += fila('Ángulos', doble(campo(`${o.id}.a0`, o.a0, 'angulo', null, 'Desde (antihorario, desde el eje x)|Start angle'), campo(`${o.id}.a1`, o.a1, 'angulo', null, 'Hasta|End angle')));
        g += fila('Cara', segmentado(`${o.id}.cara`, [['exterior', 'Exterior'], ['interior', 'Interior']], o.cara));
        g += fila('Formas', `<div class="formas"><button class="btn btn-compacto" data-accion-insp="hemisferio">Hemisferio</button><button class="btn btn-compacto" data-accion-insp="cuenco">Cuenco</button><button class="btn btn-compacto" data-accion-insp="circulo">Círculo</button></div>`);
      }
      h += grupo('Geometría', g);
      h += grupo('Material', fila('Restitución', campo(`${o.id}.e`, o.e, 'adim', 'e', 'Coeficiente de restitución|Restitution')) +
        fila('Fricción', doble(campo(`${o.id}.mu`, o.mu, 'adim', 'μ', 'Fricción cinética|Kinetic friction'), campo(`${o.id}.muS`, o.muS ?? o.mu, 'adim', 'μ<sub>s</sub>', 'Fricción estática|Static friction'))));
      h += grupo('Lecturas', '<div class="lecturas" id="lecturas"></div>', 'lect-titulo');
    } else if (CONECTORES.includes(o.tipo)) {
      const extremos = `${nombreDe(o.a)} — ${o.b != null ? nombreDe(o.b) : 'punto fijo'}`;
      const sub = { cuerda: 'Cuerda ideal: inextensible, solo tira', resorte: 'Resorte lineal', varilla: 'Varilla rígida, sin masa', polea: 'Polea fija ideal', union: 'Unión al chocar' }[o.tipo];
      h += cab(ICONOS[o.tipo], o.nombre, sub);
      let c = fila('Extremos', `<span class="texto-dato">${extremos}</span>`);
      if (o.tipo === 'cuerda') c += fila('Longitud', campo(`${o.id}.L`, o.L, 'longitud', 'L')) + (o.b == null ? '' : '');
      if (o.tipo === 'resorte') c += fila('Rigidez', campo(`${o.id}.k`, o.k, 'rigidez', 'k')) + fila('Largo natural', campo(`${o.id}.L0`, o.L0, 'longitud', 'L<sub>0</sub>')) + fila('Amortiguam.', campo(`${o.id}.amort`, o.amort, 'amort', 'c', 'Amortiguamiento: F = −c·(velocidad de alargamiento)|Damping'));
      if (o.tipo === 'varilla') c += fila('Longitud', campo(`${o.id}.L`, largoVarilla(o), 'longitud', 'L'));
      if (o.tipo === 'polea') c += fila('Eje', doble(campo(`${o.id}.px`, o.P[0], 'longitud', 'x'), campo(`${o.id}.py`, o.P[1], 'longitud', 'y'))) + fila('Cuerda', campo(`${o.id}.L`, o.L, 'longitud', 'L')) + fila('Rueda', campo(`${o.id}.r`, o.r, 'longitud', 'r', 'Radio de la rueda en el dibujo; la polea es ideal|Wheel radius'));
      if (o.ancla) c += fila('Punto fijo', doble(campo(`${o.id}.axx`, o.ancla[0], 'longitud', 'x'), campo(`${o.id}.axy`, o.ancla[1], 'longitud', 'y')));
      if (o.tipo === 'cuerda' || o.tipo === 'polea') c += fila('', `<button class="btn btn-secundario btn-compacto" data-accion-insp="tensar" data-ayuda="Longitud = distancia actual entre los extremos|Make taut">Tensar</button>`);
      if (o.tipo === 'cuerda' && o.b == null && M.clavos.length) c += ayudaFila('Se engancha en los clavos de la escena al pasar por ellos.');
      if (o.tipo === 'union') c += ayudaFila('Los dos discos quedan pegados después de chocar (choque perfectamente inelástico y unidos desde entonces).');
      h += grupo('Propiedades', c);
      h += grupoMostrar();
      if (o.tipo !== 'union') h += grupo('Lecturas', '<div class="lecturas" id="lecturas"></div>', 'lect-titulo');
    } else if (o.tipo === 'clavo') {
      h += cab('o-clavo', o.nombre, 'Clavo fijo');
      h += grupo('Posición', fila('Posición', doble(campo(`${o.id}.x`, o.x, 'longitud', 'x'), campo(`${o.id}.y`, o.y, 'longitud', 'y'))) + ayudaFila('Las cuerdas atadas a un punto fijo se enganchan en él al pasar.'));
    }
    $('#inspector').innerHTML = h;
    lecturas();
  }

  /** Extremo alto, ángulo, largo y sentido de un plano. */
  function datosPlano(o) {
    const alto = o.a[1] >= o.b[1] ? o.a : o.b, bajo = alto === o.a ? o.b : o.a;
    return { alto, bajo, L: largo(resta(o.b, o.a)), th: Math.atan2(alto[1] - bajo[1], Math.abs(alto[0] - bajo[0])) / DEG, sentido: bajo[0] >= alto[0] ? 'der' : 'izq' };
  }
  /** Rehace un plano desde su extremo alto, ángulo, largo y sentido (sólido siempre debajo). */
  function rehacerPlano(o, alto, th, L, sentido) {
    const bajo = [alto[0] + (sentido === 'der' ? 1 : -1) * L * cosd(th), alto[1] - L * sind(th)];
    if (sentido === 'der') { o.a = [...alto]; o.b = bajo; } else { o.a = bajo; o.b = [...alto]; }
  }

  // Aplicar un campo del inspector
  const insp = $('#inspector');
  function marcarError(el, msj) {
    const caja = el.closest('.campo'), f = el.closest('.fila');
    caja.classList.add('es-error');
    let p = f.querySelector('.mensaje-error'); if (!p) { p = document.createElement('p'); p.className = 'mensaje-error'; f.appendChild(p); }
    p.textContent = msj;
  }
  function aplicarCampo(el) {
    const [id, prop] = el.dataset.clave.split('.'), tipoU = el.dataset.u;
    let val;
    if (tipoU === 'texto') val = el.value.trim();
    else { try { val = leerCampo(el.value, tipoU); } catch (e) { marcarError(el, e.message); return; } }
    const err = aplicar(id, prop, val);
    if (err) { marcarError(el, err); return; }
    registrar(); recalcular(); construirArbol(); construirInspector(); pintarBarra();
  }

  /** Cambia una propiedad de un objeto (o de la escena). Devuelve un mensaje si el valor no sirve. */
  function aplicar(id, prop, v) {
    if (id === 'escena') {
      if (prop === 'titulo') { const tt = texto(v, '', 80); if (!tt) return 'El título no puede quedar vacío.'; esc.titulo = tt; return; }
      if (prop === 'duracion') { if (!(v >= 0.1 && v <= 120)) return 'La duración va de 0.1 s a 120 s.'; esc.duracion = v; return; }
      if (prop === 'g') { if (!(v >= 0 && v <= 1000)) return 'La gravedad va de 0 a 1000 m/s².'; esc.g = v; return; }
      if (prop === 'gAng') { esc.gAng = v; return; }
      if (prop === 'b' || prop === 'cAire') { if (!(v >= 0)) return 'El arrastre no puede ser negativo.'; esc[prop] = v; return; }
      if (prop === 'eParticulas') { if (!(v >= 0 && v <= 1)) return 'El coeficiente de restitución va de 0 a 1.'; esc.eParticulas = v; return; }
      return;
    }
    const o = objeto(esc, id); if (!o) return;
    if (['e'].includes(prop)) { if (!(v >= 0 && v <= 1)) return 'El coeficiente de restitución va de 0 a 1.'; o.e = v; return; }
    if (['mu', 'muS'].includes(prop)) { if (!(v >= 0 && v <= 10)) return 'El coeficiente de fricción va de 0 a 10.'; o[prop] = v; return; }
    if (o.tipo === 'particula') {
      if (prop === 'm') { if (!(v > 0)) return 'La masa tiene que ser positiva.'; o.m = v; return; }
      if (prop === 'radio') { if (!(v >= 0)) return 'El radio no puede ser negativo.'; o.radio = v; return; }
      if (prop === 'v') { if (!(v >= 0)) return 'Escribe la rapidez (positiva) y la dirección en α.'; o.v = v; return; }
      if (prop === 'ang') { o.ang = ((v + 180) % 360 + 360) % 360 - 180; return; }
      if (prop === 'F') { if (!(v >= 0)) return 'Escribe el módulo de la fuerza (positivo) y su dirección en β.'; o.F = v; return; }
      if (prop === 'angF') { o.angF = ((v + 180) % 360 + 360) % 360 - 180; return; }
      if (prop === 'x' || prop === 'y') {
        const p = posicionParticula(esc, o); p[prop === 'x' ? 0 : 1] = v;
        if (o.sobre) {
          // Apoyada: se desliza sobre su superficie (cambia la otra coordenada);
          // si la superficie no pasa por ese valor, se suelta
          const q = deslizarSobre(objeto(esc, o.sobre), posicionParticula(esc, o), prop === 'x' ? 0 : 1, v, o.radio);
          if (q) { o.x = q[0]; o.y = q[1]; ajustarConectores(o.id); return; }
          o.sobre = null;
        }
        o.x = p[0]; o.y = p[1]; ajustarConectores(o.id); return;
      }
    }
    if (o.tipo === 'superficie') {
      // Las apoyadas se trasladan con la superficie y después se proyectan sobre ella
      const ref0 = o.forma === 'arco' ? [...o.c] : datosRef(o);
      const mover = () => { const ref1 = o.forma === 'arco' ? o.c : datosRef(o); trasladarApoyadas(o, resta(ref1, ref0)); seguirSuperficie(o); };
      if (o.forma === 'suelo') {
        const iz = o.a[0] <= o.b[0] ? 'a' : 'b', de = iz === 'a' ? 'b' : 'a';
        if (prop === 'y') { o.a[1] = o.b[1] = v; return mover(); }
        if (prop === 'x0') { if (!(v < o[de][0])) return 'El extremo izquierdo tiene que quedar a la izquierda del derecho.'; o[iz][0] = v; return mover(); }
        if (prop === 'x1') { if (!(v > o[iz][0])) return 'El extremo derecho tiene que quedar a la derecha del izquierdo.'; o[de][0] = v; return mover(); }
      }
      if (o.forma === 'pared') {
        const lo = o.a[1] <= o.b[1] ? 'a' : 'b', hi = lo === 'a' ? 'b' : 'a';
        if (prop === 'x') { o.a[0] = o.b[0] = v; return mover(); }
        if (prop === 'y0') { if (!(v < o[hi][1])) return 'El extremo de abajo tiene que quedar debajo del de arriba.'; o[lo][1] = v; return mover(); }
        if (prop === 'y1') { if (!(v > o[lo][1])) return 'El extremo de arriba tiene que quedar encima del de abajo.'; o[hi][1] = v; return mover(); }
      }
      if (o.forma === 'plano') {
        const pl = datosPlano(o); let { alto, th, L } = pl; alto = [...alto];
        if (prop === 'x') alto[0] = v; else if (prop === 'y') alto[1] = v;
        else if (prop === 'th') { if (!(v > 0 && v < 90)) return 'La inclinación va de 0° a 90°.'; th = v; }
        else if (prop === 'L') { if (!(v > 0)) return 'La longitud tiene que ser positiva.'; L = v; }
        rehacerPlano(o, alto, th, L, pl.sentido); return mover();
      }
      if (o.forma === 'segmento') {
        const q = { ax: ['a', 0], ay: ['a', 1], bx: ['b', 0], by: ['b', 1] }[prop];
        if (q) { const viejo = o[q[0]][q[1]]; o[q[0]][q[1]] = v; if (largo(resta(o.b, o.a)) < 1e-6) { o[q[0]][q[1]] = viejo; return 'Los dos extremos no pueden coincidir.'; } return mover(); }
      }
      if (o.forma === 'arco') {
        if (prop === 'cx') { o.c[0] = v; return mover(); }
        if (prop === 'cy') { o.c[1] = v; return mover(); }
        if (prop === 'r') { if (!(v > 0)) return 'El radio tiene que ser positivo.'; o.r = v; return mover(); }
        if (prop === 'a0') { if (!(o.a1 - v > 0 && o.a1 - v <= 360)) return 'El arco va de «desde» a «hasta» en sentido antihorario, con hasta 360°.'; o.a0 = v; return mover(); }
        if (prop === 'a1') { if (!(v - o.a0 > 0 && v - o.a0 <= 360)) return 'El arco va de «desde» a «hasta» en sentido antihorario, con hasta 360°.'; o.a1 = v; return mover(); }
      }
    }
    if (CONECTORES.includes(o.tipo)) {
      if (prop === 'k') { if (!(v > 0)) return 'La rigidez tiene que ser positiva.'; o.k = v; return; }
      if (prop === 'L0') { if (!(v >= 0)) return 'El largo natural no puede ser negativo.'; o.L0 = v; return; }
      if (prop === 'amort') { if (!(v >= 0)) return 'El amortiguamiento no puede ser negativo.'; o.amort = v; return; }
      if (prop === 'r') { if (!(v > 0)) return 'El radio tiene que ser positivo.'; o.r = v; return; }
      if (prop === 'px') { o.P[0] = v; return ajustarPolea(o); }
      if (prop === 'py') { o.P[1] = v; return ajustarPolea(o); }
      if (prop === 'axx') { o.ancla[0] = v; return ajustarConector(o); }
      if (prop === 'axy') { o.ancla[1] = v; return ajustarConector(o); }
      if (prop === 'L') {
        if (!(v > 0)) return 'La longitud tiene que ser positiva.';
        if (o.tipo === 'polea') {
          const D = distanciaConector(o); if (v < D - 1e-9) return `La cuerda no alcanza: sus ramales miden ${limpio(D)} m.`;
          o.L = v; return;
        }
        if (o.tipo === 'cuerda' || o.tipo === 'varilla') {
          const D = distanciaConector(o);
          if (o.tipo === 'varilla' || v < D - 1e-9) {
            // La partícula a se acerca o se aleja por la recta que la une con el otro extremo
            const p = objeto(esc, o.a), pa = posicionParticula(esc, p), pb = o.b != null ? posicionParticula(esc, objeto(esc, o.b)) : o.ancla;
            const u = D > 1e-12 ? unitario(resta(pa, pb)) : [0, -1];
            p.x = pb[0] + u[0] * v; p.y = pb[1] + u[1] * v; p.sobre = null;
          }
          o.L = v; return;
        }
      }
    }
    if (o.tipo === 'clavo') { if (prop === 'x') o.x = v; if (prop === 'y') o.y = v; return; }
  }

  /** Distancia entre los extremos de un conector (suma de ramales en una polea). */
  function distanciaConector(c) {
    const pa = posicionParticula(esc, objeto(esc, c.a));
    if (c.tipo === 'polea') return largo(resta(pa, c.P)) + largo(resta(posicionParticula(esc, objeto(esc, c.b)), c.P));
    const pb = c.b != null ? posicionParticula(esc, objeto(esc, c.b)) : c.ancla;
    return largo(resta(pa, pb));
  }
  /** Tras mover algo: una cuerda o polea que ya no alcanza se alarga; la varilla mide lo que haya. */
  function ajustarConector(c) {
    const D = distanciaConector(c);
    if (c.tipo === 'cuerda' || c.tipo === 'polea') { if (c.L < D) c.L = D; }
    else if (c.tipo === 'varilla') c.L = D;
  }
  function ajustarPolea(c) { ajustarConector(c); }
  function ajustarConectores(idParticula) {
    for (const c of esc.objetos) if (CONECTORES.includes(c.tipo) && (c.a === idParticula || c.b === idParticula)) ajustarConector(c);
  }
  /**
   * Punto de referencia de una superficie para trasladar lo que lleva encima:
   * la altura de un suelo, la x de una pared, el extremo alto de un plano. Al
   * cambiar el largo o los extremos de un segmento, lo apoyado solo se proyecta.
   */
  function datosRef(o) {
    if (o.forma === 'plano') return [...datosPlano(o).alto];
    if (o.forma === 'pared') return [o.a[0], 0];
    if (o.forma === 'suelo') return [0, o.a[1]];
    return [0, 0];
  }
  function trasladarApoyadas(s, d) {
    if (!(Math.abs(d[0]) + Math.abs(d[1]) > 0)) return;
    for (const p of esc.objetos) if (p.tipo === 'particula' && p.sobre === s.id) { p.x += d[0]; p.y += d[1]; }
  }
  /** Las partículas apoyadas en una superficie la siguen cuando se mueve o cambia. */
  function seguirSuperficie(s) {
    for (const p of esc.objetos) {
      if (p.tipo !== 'particula' || p.sobre !== s.id) continue;
      const q = proyectarSobre(s, [p.x, p.y], p.radio); p.x = q[0]; p.y = q[1];
      ajustarConectores(p.id);
    }
  }

  insp.addEventListener('change', ev => {
    const el = ev.target;
    if (el.dataset.clave) aplicarCampo(el);
    else if (el.dataset.mostrar) { mostrar[el.dataset.mostrar] = el.checked; dibujar(); }
  });
  insp.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && ev.target.matches('input[data-clave]')) ev.target.blur();
    if (ev.key === 'Escape' && ev.target.matches('input[data-clave]')) { construirInspector(); }
  });
  insp.addEventListener('click', ev => {
    const b = ev.target.closest('.segmentado button');
    if (b) {
      const [id, prop] = b.parentElement.dataset.segmento.split('.'), o = objeto(esc, id); if (!o) return;
      const valor = b.dataset.v;
      if (prop === 'lado' && o.forma === 'suelo') { const abajoAhora = o.a[0] <= o.b[0]; if ((valor === 'abajo') !== abajoAhora) [o.a, o.b] = [o.b, o.a]; }
      if (prop === 'lado' && o.forma === 'pared') { const derAhora = o.a[1] <= o.b[1]; if ((valor === 'der') !== derAhora) [o.a, o.b] = [o.b, o.a]; }
      if (prop === 'sentido') { const pl = datosPlano(o); rehacerPlano(o, pl.alto, pl.th, pl.L, valor); }
      if (prop === 'cara') o.cara = valor;
      seguirSuperficie(o); registrar(); recalcular(); construirInspector(); return;
    }
    const a = ev.target.closest('[data-accion-insp]'); if (!a) return;
    const o = objeto(esc, sel); if (!o) return;
    const acc = a.dataset.accionInsp;
    if (acc === 'soltar') o.sobre = null;
    if (acc === 'voltear') [o.a, o.b] = [o.b, o.a];
    if (acc === 'hemisferio') { o.a0 = 0; o.a1 = 180; o.cara = 'exterior'; }
    if (acc === 'cuenco') { o.a0 = 180; o.a1 = 360; o.cara = 'interior'; }
    if (acc === 'circulo') { o.a0 = 0; o.a1 = 360; }
    if (acc === 'tensar') o.L = distanciaConector(o);
    if (o.tipo === 'superficie') seguirSuperficie(o);
    registrar(); recalcular(); construirArbol(); construirInspector();
  });

  function lecturas() {
    $('#reloj').innerHTML = `<span class="sim">t</span>${fmt(t, 4).padStart(6, ' ')}<span class="u">s</span>`;
    $('#b-play').innerHTML = ico(jugando ? 'i-pausar' : 'i-reproducir');
    $('#b-play').dataset.ayuda = jugando ? 'Pausar|Pause|Espacio' : 'Reproducir|Play|Espacio';
    const el = $('#lecturas'); if (!el) return;
    const tit = $('#lect-titulo'), o = objeto(esc, sel);
    const filaL = (a, b, val, u, recto = true) => `${simHTML(a, b, recto)}<span class="v">${fmt(val, 4)}</span><span class="u">${u}</span>`;
    if (tit && o) tit.textContent = `Lecturas en t = ${fmt(t, 4)} s`;
    const f = SIM ? fuerzasAhora() : null;
    let h = '';
    if (!o) {
      if (SIM) {
        const e = energiaMecanica(SIM, Math.min(t, tFinal())), e0 = energiaMecanica(SIM, 0);
        if (tit) tit.textContent = `Energía en t = ${fmt(t, 4)} s`;
        const r = x => sinRuido(x, escalaEnergia());
        h += filaL('E', 'k', r(e.K), 'J') + filaL('U', 'g', r(e.Ug), 'J') + filaL('U', 'e', r(e.Ue), 'J') + (hayFuerzaAplicada() ? filaL('U', 'F', r(e.UF), 'J') : '') + filaL('E', '', r(e.E), 'J') + filaL('Q', '', r(e0.E - e.E), 'J');
      }
    } else if (o.tipo === 'particula') {
      const i = M.indice[o.id], s = estadoEn(t)[i];
      if (s) {
        h += filaL('x', '', s.x, 'm') + filaL('y', '', s.y, 'm') + filaL('v', 'x', s.vx, 'm/s', false) + filaL('v', 'y', s.vy, 'm/s', false) + `${simHTML('|v|')}<span class="v">${fmt(Math.hypot(s.vx, s.vy), 4)}</span><span class="u">m/s</span>`;
        h += filaL('E', 'k', 0.5 * o.m * (s.vx * s.vx + s.vy * s.vy), 'J');
        if (f) for (const x of f.porParticula[i]) if (['normal', 'friccion', 'tension', 'elastica'].includes(x.tipo)) { const [a, b] = SIMBOLO_F[x.tipo]; h += filaL(a, b, x.valor, 'N'); }
      }
      const est = $('#insp-estado'); if (est) est.textContent = `${o.radio > 0 ? 'Disco' : 'Partícula'} · ${estadoParticula(i)}`;
    } else if (CONECTORES.includes(o.tipo) && SIM) {
      const ia = M.indice[o.a], s = estadoEn(t), pa = [s[ia].x, s[ia].y];
      if (o.tipo !== 'union') {
        const T = f?.tensiones?.[o.id] ?? 0;
        h += filaL(o.tipo === 'resorte' ? 'F' : 'T', o.tipo === 'resorte' ? 'e' : '', o.tipo === 'resorte' ? Math.abs(T) : T, 'N');
        const D = o.tipo === 'polea' ? largo(resta(pa, o.P)) + largo(resta([s[M.indice[o.b]].x, s[M.indice[o.b]].y], o.P)) : largo(resta(pa, o.b != null ? [s[M.indice[o.b]].x, s[M.indice[o.b]].y] : o.ancla));
        h += filaL(o.tipo === 'polea' ? 'ℓ' : 'd', '', D, 'm');
        if (o.tipo === 'resorte') h += filaL('Δ', '', D - o.L0, 'm') + filaL('U', 'e', 0.5 * o.k * (D - o.L0) ** 2, 'J');
      }
    } else if (o.tipo === 'superficie' && SIM) {
      const tr = tramoEn(SIM, Math.min(t, tFinal())), js = M.superficies.indexOf(o);
      const apoyadas = contactosDe(tr.modo).filter(k => k.sup === js).map(k => k.i);
      if (f) for (const i of apoyadas) { const n = f.porParticula[i].find(x => x.tipo === 'normal' && x.id === o.id); if (n) h += `${simHTML('N', M.particulas[i].nombre)}<span class="v">${fmt(n.valor, 4)}</span><span class="u">N</span>`; }
      if (!h) h = '<span class="lect-vacia">Nada apoyado en este instante</span>';
    }
    el.innerHTML = h;
  }

  function estadoParticula(i) {
    if (!SIM) return 'en reposo';
    const tr = tramoEn(SIM, Math.min(t, tFinal())), k = contactosDe(tr.modo).find(c => c.i === i);
    if (k) return `${k.pegado ? 'quieta sobre' : 'sobre'} ${conArticulo(M.superficies[k.sup]?.nombre ?? '')}`;
    for (const c of M.conectores) if ((c.tipo === 'cuerda' || c.tipo === 'polea') && tr.modo?.cuerdas?.[c.id]?.tensa && (M.indice[c.a] === i || M.indice[c.b] === i)) return `sujeta por ${conArticulo(c.nombre)}`;
    for (const c of M.conectores) if (c.tipo === 'varilla' && (M.indice[c.a] === i || M.indice[c.b] === i)) return `sujeta por ${conArticulo(c.nombre)}`;
    return 'en vuelo';
  }

  // -------------------------------------------------------------------------
  // Gráficas, energía, eventos y tabla
  // -------------------------------------------------------------------------
  const PATRONES = ['continuo', 'discontinuo', 'punteado'];
  /** Partículas que se grafican: la seleccionada primero, hasta tres. */
  function graficadas() {
    const idx = M.particulas.map((p, i) => i), o = objeto(esc, sel);
    if (o?.tipo === 'particula') { const i = M.indice[o.id]; idx.splice(idx.indexOf(i), 1); idx.unshift(i); }
    return idx.slice(0, 3);
  }
  /** Series partidas en los eventos (las velocidades saltan en los choques). */
  function serie(f) {
    const tramos = []; let actual = [];
    const cortes = new Set(SIM.eventos.map(e => e.t));
    for (let k = 0; k < MUESTRAS.length; k++) {
      const m = MUESTRAS[k];
      actual.push(f(m));
      if (cortes.has(m.t) && k > 0) { tramos.push(actual); actual = [f(m)]; }
    }
    if (actual.length) tramos.push(actual);
    return tramos.filter(x => x.length > 1);
  }
  function rango(series, minSpan = 1) {
    let lo = Infinity, hi = -Infinity;
    for (const s of series) for (const tr of s.tramos) for (const [, y] of tr) { if (y < lo) lo = y; if (y > hi) hi = y; }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    if (hi - lo < minSpan * 1e-6) { lo -= minSpan / 2; hi += minSpan / 2; }
    const m = (hi - lo) * 0.08;
    return { min: lo - m, max: hi + m };
  }
  const eventosGraf = () => SIM.eventos.filter(e => e.t > 0).map(e => ({ x: e.t }));

  function graficas() {
    if (!SIM || !MUESTRAS.length) { ['#g1', '#g2', '#g3', '#g4'].forEach(s => { const c = $(s); c.getContext('2d').clearRect(0, 0, c.width, c.height); }); ['#l1', '#l2', '#l3', '#l4'].forEach(s => { $(s).textContent = ''; }); return; }
    const tf = tFinal(), idx = graficadas(), varias = idx.length > 1, s = estadoEn(t);
    if (!$('#p-graficas').hidden) {
      const sy = idx.map((i, k) => ({ tramos: serie(m => [m.t, m.est[i].y]), familia: 'tinta', patron: PATRONES[k], etiqueta: varias ? M.particulas[i].nombre : undefined }));
      grafica($('#g1'), { x: { min: 0, max: tf }, y: rango(sy), series: sy, cursor: t, puntoCursor: [t, s[idx[0]].y], eventos: eventosGraf() });
      const sv = idx.map((i, k) => ({ tramos: serie(m => [m.t, Math.hypot(m.est[i].vx, m.est[i].vy)]), familia: 'movimiento', patron: PATRONES[k], etiqueta: varias ? M.particulas[i].nombre : undefined }));
      const rv = rango(sv); rv.min = Math.min(0, rv.min);
      grafica($('#g2'), { x: { min: 0, max: tf }, y: rv, series: sv, cursor: t, puntoCursor: [t, Math.hypot(s[idx[0]].vx, s[idx[0]].vy)], eventos: eventosGraf() });
      const se = seriesEnergia();
      grafica($('#g3'), { x: { min: 0, max: tf }, y: rango(se), series: se, cursor: t, eventos: eventosGraf() });
      const nombre = varias ? ` (${M.particulas[idx[0]].nombre})` : '';
      $('#l1').textContent = cantidad(s[idx[0]].y, 'm') + nombre;
      $('#l2').textContent = cantidad(Math.hypot(s[idx[0]].vx, s[idx[0]].vy), 'm/s') + nombre;
      $('#l3').textContent = cantidad(sinRuido(energiaMecanica(SIM, Math.min(t, tf)).E, escalaEnergia()), 'J');
    }
    if (!$('#p-energia').hidden) energiaPanel();
  }

  let cacheE = null;
  /** Un valor que es ruido de redondeo frente a la escala de la escena se escribe como 0. */
  const sinRuido = (x, escala) => (Math.abs(x) < 1e-9 * Math.max(escala, 1e-300) ? 0 : x);
  const escalaEnergia = () => (SIM ? Math.max(1e-12, ...energias().flatMap(x => [Math.abs(x.K), Math.abs(x.Ug), Math.abs(x.Ue), Math.abs(x.UF)])) : 1);
  const hayFuerzaAplicada = () => !!(M && M.motor.particulas.some(p => p.F));
  function energias() {
    if (cacheE && cacheE.sim === SIM) return cacheE.datos;
    const E0 = energiaMecanica(SIM, 0).E;
    const datos = MUESTRAS.map(m => { const e = energiaMecanica(SIM, m.t); return { t: m.t, K: e.K, Ug: e.Ug, Ue: e.Ue, UF: e.UF, E: e.E, Q: E0 - e.E }; });
    cacheE = { sim: SIM, datos };
    return datos;
  }
  function seriesEnergia() {
    const d = energias(), cortar = f => { const tr = [], cortes = new Set(SIM.eventos.map(e => e.t)); let a = []; d.forEach((x, k) => { a.push(f(x)); if (cortes.has(x.t) && k > 0) { tr.push(a); a = [f(x)]; } }); tr.push(a); return tr.filter(x => x.length > 1); };
    const hayUe = d.some(x => Math.abs(x.Ue) > 1e-12), hayQ = d.some(x => Math.abs(x.Q) > 1e-9);
    const s = [{ tramos: cortar(x => [x.t, x.K]), familia: 'movimiento' }, { tramos: cortar(x => [x.t, x.Ug]), familia: 'cambio' }];
    if (hayUe) s.push({ tramos: cortar(x => [x.t, x.Ue]), familia: 'electrico' });
    if (hayFuerzaAplicada()) s.push({ tramos: cortar(x => [x.t, x.UF]), familia: 'interaccion' });
    document.querySelectorAll('.ley-uf').forEach(el => { el.hidden = !hayFuerzaAplicada(); });
    if (hayQ) s.push({ tramos: cortar(x => [x.t, x.Q]), familia: 'termico', patron: 'discontinuo' });
    s.push({ tramos: cortar(x => [x.t, x.E + x.Q]), familia: 'tinta', patron: 'punteado' });
    return s;
  }
  function energiaPanel() {
    const tf = tFinal(), e = energiaMecanica(SIM, Math.min(t, tf)), e0 = energiaMecanica(SIM, 0), Q = e0.E - e.E;
    const filas = [['Cinética', 'f-movimiento', e.K], ['Potencial gravitatoria', 'f-cambio', e.Ug], ['Elástica', 'f-electrico', e.Ue],
      ...(hayFuerzaAplicada() ? [['Potencial de la fuerza aplicada', 'f-interaccion', e.UF]] : []), ['Disipada', 'f-termico', Q], ['Total inicial', 'tinta', e0.E]];
    const d = energias(), maxAbs = Math.max(1e-12, ...d.flatMap(x => [Math.abs(x.K), Math.abs(x.Ug), Math.abs(x.Ue), Math.abs(x.UF), Math.abs(x.Q), Math.abs(x.E + x.Q)]));
    const conSigno = d.some(x => x.Ug < -1e-12 || x.UF < -1e-12 || x.E + x.Q < -1e-12);
    $('#barras').className = 'barras' + (conSigno ? ' con-signo' : '');
    $('#barras').innerHTML = '<div class="barras-tit">Energía en t = ' + fmt(t, 4) + ' s</div>' + filas.map(([n, c, val]) => {
      const w = Math.min(100, Math.abs(val) / maxAbs * (conSigno ? 50 : 100));
      const izq = conSigno ? (val >= 0 ? 50 : 50 - w) : 0;
      return `<div class="barra-e"><span>${n}</span><span class="riel"><i style="left:${izq}%;width:${w}%;background:var(--${c})"></i></span><span class="v">${cantidad(sinRuido(val, maxAbs), 'J', 4)}</span></div>`;
    }).join('') + `<div class="barras-pie">${conSigno ? 'Potencial gravitatoria con cero en y = 0' : 'Cero de la potencial gravitatoria en y = 0'}</div>`;
    const se = seriesEnergia();
    grafica($('#g4'), { x: { min: 0, max: tf }, y: rango(se), series: se, cursor: t, eventos: eventosGraf() });
    $('#l4').textContent = cantidad(sinRuido(e.E + Q, maxAbs), 'J');
  }

  function tablas() {
    if (!SIM) { $('#t-eventos').innerHTML = ''; $('#t-datos').innerHTML = ''; return; }
    $('#t-eventos').innerHTML = '<tr><th>Evento</th><th>t (s)</th><th>x (m)</th><th>y (m)</th><th>Energía disipada (J)</th></tr>' +
      (SIM.eventos.length ? SIM.eventos.map(e => {
        const p = lugarDelEvento(e, M) || [NaN, NaN];
        return `<tr class="${Math.abs(e.t - t) < 1e-9 ? 'actual' : ''}" data-t="${e.t}"><td class="texto">${describirEvento(e, M)}</td><td>${fmt(e.t, 6)}</td><td>${fmt(p[0], 5)}</td><td>${fmt(p[1], 5)}</td><td>${e.perdida > 1e-12 ? fmt(e.perdida, 4) : '0'}</td></tr>`;
      }).join('') : '<tr><td class="texto" colspan="5">Sin eventos: el movimiento no cambia de régimen.</td></tr>');
    const i = graficadas()[0], o = M.particulas[i], tf = tFinal(), dt = pasoAgradable(tf / 120);
    let h = `<tr><th>t (s)</th><th>x<sub>${o.nombre}</sub> (m)</th><th>y<sub>${o.nombre}</sub> (m)</th><th>v<sub>x</sub> (m/s)</th><th>v<sub>y</sub> (m/s)</th><th>|v| (m/s)</th><th>E (J)</th></tr>`;
    for (let k = 0; k * dt <= tf + 1e-9; k++) {
      const tt = Math.min(tf, k * dt), s = estadoEn(tt)[i], e = energiaMecanica(SIM, tt);
      h += `<tr class="${Math.abs(tt - t) < dt / 2 ? 'actual' : ''}"><td>${fmt(tt, 4)}</td><td>${fmt(s.x, 5)}</td><td>${fmt(s.y, 5)}</td><td>${fmt(s.vx, 5)}</td><td>${fmt(s.vy, 5)}</td><td>${fmt(Math.hypot(s.vx, s.vy), 5)}</td><td>${fmt(sinRuido(e.E, escalaEnergia()), 5)}</td></tr>`;
    }
    $('#t-datos').innerHTML = h;
  }
  $('#t-eventos').addEventListener('click', ev => { const r = ev.target.closest('tr[data-t]'); if (r) irA(+r.dataset.t); });

  // -------------------------------------------------------------------------
  // Ciclo: todo, recalcular, línea de tiempo
  // -------------------------------------------------------------------------
  const lt = new LineaTiempo($('#tl'), { duracion: 1, eventos: [], alCambiar: nt => { t = Math.min(nt, tFinal()); jugando = false; todo(); } });
  function todo() {
    dibujar(); lecturas(); lt.poner(t); graficas();
    if (!$('#p-eventos').hidden || !$('#p-tabla').hidden) tablas();
  }
  function recalcular(rapido = false) {
    simular(rapido);
    lt.duracion = DUR(); lt.simulado = tFinal();
    lt.eventos = SIM ? SIM.eventos.filter(e => e.t > 0).map(e => ({ t: e.t, nombre: describirEvento(e, M) })) : [];
    cacheE = null; FUERZAS = null;
    todo();
    if (!rapido) autoguardar();
  }
  function irA(nt) { t = Math.max(0, Math.min(tFinal(), nt)); jugando = false; todo(); }
  function programarRecalculo() { recalculoPendiente = true; }

  // -------------------------------------------------------------------------
  // Archivos: guardar, abrir, autoguardado
  // -------------------------------------------------------------------------
  let autoguardadoActivo = false;
  function escenaActual() { return crearEscena({ modulo: 'mecanica', espacio: ESPACIO, titulo: esc.titulo, datos: copia(esc) }); }
  function autoguardar() { if (autoguardadoActivo) autoguardado.guardar(CLAVE_AUTOGUARDADO, escenaActual()); }
  function cargar(datos, o = {}) {
    esc = normalizarEscena(datos);
    t = 0; jugando = false; sel = o.sel && objeto(esc, o.sel) ? o.sel : 'escena'; notaCerrada = false; herramienta = null; pendiente = null;
    soltarHerramienta();
    simular(); encuadreHecho = false; vistaTocada = false; pintarNota();
    if (tz.w) encuadrar();
    if (historial) historial.reiniciar(copia(esc)); botonesHistorial();
    pintarBarra(); construirArbol(); construirInspector(); recalcular();
  }
  function guardar() { guardarEscena(escenaActual()).then(r => { if (r) avisar(area, 'Escena guardada'); }, e => avisar(area, `No se pudo guardar: ${e}`)); }
  function abrir() {
    abrirEscena({ modulo: 'mecanica' }).then(e => {
      if (e.espacio !== ESPACIO) { avisar(area, 'Esta escena es de «Cinemática y proyectiles»: ábrela en ese espacio.'); return; }
      cargar(e.datos); avisar(area, `Escena abierta: ${esc.titulo}`);
    }).catch(err => avisar(area, err.message));
  }
  function cargarEscenario(id) { const d = escenaDeEscenario(id); if (d) cargar(d); }
  function nuevaEscena() { cargar(escenaVacia()); avisar(area, 'Escena vacía: coloca objetos desde la paleta'); }

  // -------------------------------------------------------------------------
  // Deshacer y rehacer
  // -------------------------------------------------------------------------
  let historial = null;
  function botonesHistorial() { $('#b-deshacer').disabled = !historial?.puedeDeshacer; $('#b-rehacer').disabled = !historial?.puedeRehacer; }
  function registrar() { if (historial && historial.registrar(copia(esc))) botonesHistorial(); }
  function restaurar(d) {
    esc = normalizarEscena(d);
    if (!objeto(esc, sel)) sel = 'escena';
    recalcular(); pintarBarra(); construirArbol(); construirInspector(); botonesHistorial();
  }
  function deshacer() { const d = historial?.deshacer(); if (d) { restaurar(d); avisar(area, 'Cambio deshecho'); } }
  function rehacer() { const d = historial?.rehacer(); if (d) { restaurar(d); avisar(area, 'Cambio rehecho'); } }
  $('#b-deshacer').addEventListener('click', deshacer);
  $('#b-rehacer').addEventListener('click', rehacer);

  // -------------------------------------------------------------------------
  // Crear y borrar objetos
  // -------------------------------------------------------------------------
  function ladoAlejado(eje, valor) {
    // Lado sólido alejado de las partículas (por su centro de masas)
    const ps = M.motor.particulas; if (!ps.length) return null;
    const c = ps.reduce((s, p) => s + p.p[eje], 0) / ps.length;
    return c >= valor ? -1 : 1;
  }
  /** Geometría de una superficie nueva desde p0 (clic) hasta p1 (arrastre). */
  function geometriaNueva(herr, p0, p1) {
    const d = p1 ? resta(p1, p0) : [0, 0], arrastrada = p1 && largo(d) * tz.vista.escala > 6;
    if (herr === 'suelo') {
      const [x0, x1] = arrastrada ? [Math.min(p0[0], p1[0]), Math.max(p0[0], p1[0])] : [p0[0] - 2, p0[0] + 2];
      const techo = ladoAlejado(1, p0[1]) === 1;
      if (Math.abs(x1 - x0) < 1e-6) return {};
      return { forma: 'suelo', a: techo ? [x1, p0[1]] : [x0, p0[1]], b: techo ? [x0, p0[1]] : [x1, p0[1]] };
    }
    if (herr === 'pared') {
      const [y0, y1] = arrastrada ? [Math.min(p0[1], p1[1]), Math.max(p0[1], p1[1])] : [p0[1], p0[1] + 2];
      const solidoIzq = ladoAlejado(0, p0[0]) === -1;
      if (Math.abs(y1 - y0) < 1e-6) return {};
      return { forma: 'pared', a: solidoIzq ? [p0[0], y1] : [p0[0], y0], b: solidoIzq ? [p0[0], y0] : [p0[0], y1] };
    }
    if (herr === 'plano') {
      if (!arrastrada) { const [a, b] = planoDesde(p0, 30, 3); return { forma: 'plano', a, b }; }
      const alto = p0[1] >= p1[1] ? p0 : p1, bajo = alto === p0 ? p1 : p0;
      return bajo[0] >= alto[0] ? { forma: 'plano', a: [...alto], b: [...bajo] } : { forma: 'plano', a: [...bajo], b: [...alto] };
    }
    if (herr === 'segmento') {
      const a = [...p0], b = arrastrada ? [...p1] : [p0[0] + 2, p0[1]];
      if (largo(resta(b, a)) < 1e-6) return {};
      // Sólido a la derecha de a→b; si las partículas quedan de ese lado, se voltea
      const { n } = geoSegmento(a, b), ps = M.motor.particulas;
      if (ps.length) { const c = ps.reduce((s, p) => [s[0] + p.p[0] / ps.length, s[1] + p.p[1] / ps.length], [0, 0]); if (punto(resta(c, a), n) < 0) return { forma: 'segmento', a: b, b: a }; }
      return { forma: 'segmento', a, b };
    }
    if (herr === 'arco') {
      const r = arrastrada ? Math.max(0.05, ajustar(largo(d), false) || largo(d)) : 1;
      return { forma: 'arco', c: [...p0], r, a0: 0, a1: 180, cara: 'exterior' };
    }
    return {};
  }

  function anadir(o) { esc.objetos.push(o); sel = o.id; }
  function crearSuperficie(herr, p0, p1) {
    const geo = geometriaNueva(herr, p0, p1); if (!geo.forma) return;
    const id = nuevoId(esc, 's'), base = { id, tipo: 'superficie', nombre: nuevoNombre(esc, geo.forma), e: 1, mu: 0, muS: null };
    anadir({ ...base, ...geo });
    terminarCreacion();
  }
  function crearParticula(p) {
    const o = { id: nuevoId(esc, 'p'), tipo: 'particula', nombre: nuevoNombre(esc, 'particula'), m: 1, x: p[0], y: p[1], v: 0, ang: 0, radio: 0, sobre: null };
    anadir(o); return o;
  }
  function crearConector(herr, a, destino) {
    // destino: {particula: id} o {punto: [x, y]}
    const o = { id: nuevoId(esc, 'c'), tipo: herr, nombre: nuevoNombre(esc, herr), a, b: destino.particula ?? null };
    if (!o.b) o.ancla = [...destino.punto];
    if (herr === 'resorte') { o.k = 50; o.amort = 0; }
    anadir(o);
    const D = distanciaConector(o);
    if (herr === 'resorte') o.L0 = Number(D.toPrecision(6)) || 0.5;
    else if (herr !== 'union') o.L = D;
    terminarCreacion();
  }
  function crearPolea(P, a, b) {
    const o = { id: nuevoId(esc, 'c'), tipo: 'polea', nombre: nuevoNombre(esc, 'polea'), a, b, P: [...P], L: 1, r: 0.1 };
    anadir(o); o.L = distanciaConector(o); terminarCreacion();
  }
  function crearClavo(p) { const o = { id: nuevoId(esc, 'n'), tipo: 'clavo', nombre: nuevoNombre(esc, 'clavo'), x: p[0], y: p[1] }; anadir(o); return o; }
  function terminarCreacion() { soltarHerramienta(); registrar(); recalcular(); construirArbol(); construirInspector(); }

  function borrar(id) {
    const o = objeto(esc, id); if (!o) return;
    if (t > 0) { aviso('Los objetos se editan en t = 0.', ['Ir a t = 0', () => irA(0)]); return; }
    let quitar = new Set([id]);
    if (o.tipo === 'particula') for (const c of esc.objetos) if (CONECTORES.includes(c.tipo) && (c.a === id || c.b === id)) quitar.add(c.id);
    for (const p of esc.objetos) if (p.tipo === 'particula' && quitar.has(p.sobre)) p.sobre = null;
    esc.objetos = esc.objetos.filter(x => !quitar.has(x.id));
    if (quitar.has(sel)) sel = 'escena';
    registrar(); recalcular(); construirArbol(); construirInspector();
    avisar(area, quitar.size > 1 ? `${o.nombre} y ${quitar.size - 1} conector${quitar.size > 2 ? 'es' : ''} borrados` : `${o.nombre} borrado`);
  }

  // -------------------------------------------------------------------------
  // Paleta de objetos
  // -------------------------------------------------------------------------
  const HINT = {
    particula: 'Clic en el lienzo para colocar una partícula; cerca de una superficie se apoya en ella. Mayús: sin ajuste.',
    suelo: 'Clic para un suelo de 4 m, o arrastra para darle largo.', pared: 'Clic para una pared de 2 m, o arrastra.',
    plano: 'Clic para un plano de 30°, o arrastra del extremo alto al bajo.', segmento: 'Arrastra de un extremo al otro.',
    arco: 'Clic para un hemisferio de 1 m, o arrastra desde el centro para el radio.',
    cuerda: 'Clic en una partícula y luego en otra partícula o en un punto fijo.', resorte: 'Clic en una partícula y luego en otra o en un punto fijo.',
    varilla: 'Clic en una partícula y luego en otra o en un punto fijo.', polea: 'Clic donde va la polea y después en las dos partículas.',
    union: 'Clic en un disco y después en el otro: quedarán pegados al chocar.', clavo: 'Clic donde va el clavo.',
  };
  function elegirHerramienta(h) {
    if (herramienta === h || !h) { soltarHerramienta(); return; }
    if (t > 0) irA(0);
    herramienta = h; pendiente = null;
    document.querySelectorAll('#paleta .herr').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.herr === h)));
    aviso(HINT[h] + ' Esc cancela.');
    lienzo.style.cursor = 'crosshair';
    actualizarAvisoMotor();
  }
  function soltarHerramienta() {
    herramienta = null; pendiente = null;
    document.querySelectorAll('#paleta .herr').forEach(b => b.setAttribute('aria-pressed', 'false'));
    lienzo.style.cursor = 'default';
    const el = $('#aviso'); if (el) el.hidden = true;
  }
  // Arrastrar un botón de la paleta hasta el lienzo también coloca el objeto
  let arrastrePaleta = null;
  $('#paleta').addEventListener('pointerdown', ev => {
    const b = ev.target.closest('.herr'); if (!b) return;
    arrastrePaleta = { herr: b.dataset.herr, x: ev.clientX, y: ev.clientY, movido: false };
  });
  document.addEventListener('pointermove', ev => {
    if (!arrastrePaleta) return;
    if (Math.hypot(ev.clientX - arrastrePaleta.x, ev.clientY - arrastrePaleta.y) > 6) arrastrePaleta.movido = true;
  });
  document.addEventListener('pointerup', ev => {
    const a = arrastrePaleta; arrastrePaleta = null;
    if (!a) return;
    const r = lienzo.getBoundingClientRect();
    if (a.movido && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
      const w = ajustarP([tz.vista.mx(ev.clientX - r.left), tz.vista.my(ev.clientY - r.top)], ev.shiftKey);
      soltarDesdePaleta(a.herr, w, ev.shiftKey);
    } else if (!a.movido) elegirHerramienta(a.herr);
  });
  function soltarDesdePaleta(herr, w, libre) {
    if (t > 0) irA(0);
    if (herr === 'particula') { const o = crearParticula(w); apoyarSiCerca(o, libre); terminarCreacion(); }
    else if (herr === 'clavo') { crearClavo(w); terminarCreacion(); }
    else if (['suelo', 'pared', 'plano', 'segmento', 'arco'].includes(herr)) crearSuperficie(herr, w, null);
    else elegirHerramienta(herr);
  }

  // -------------------------------------------------------------------------
  // Lienzo: selección, arrastre y creación
  // -------------------------------------------------------------------------
  const posLienzo = ev => { const r = lienzo.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
  const distSegPx = (p, a, b) => {
    const d = resta(b, a), L2 = punto(d, d), k = L2 > 0 ? Math.max(0, Math.min(1, punto(resta(p, a), d) / L2)) : 0;
    return largo(resta(p, [a[0] + d[0] * k, a[1] + d[1] * k]));
  };
  /** Lo que hay bajo el cursor (px de pantalla): {id, parte}. */
  function objetoEn(x, y) {
    const v = tz.vista, P = p => v.P(p), q = [x, y], pd = posDibujo(estadoEn(t));
    const o = objeto(esc, sel);
    // Asas del objeto seleccionado
    if (o && t === 0) {
      if (o.tipo === 'particula') { const pv = puntaVelocidad(o); if (pv && Math.hypot(x - pv[0], y - pv[1]) < 9) return { id: o.id, parte: 'velocidad' }; }
      if (o.tipo === 'superficie' && o.forma !== 'arco') for (const k of ['a', 'b']) if (largo(resta(q, P(o[k]))) < 8) return { id: o.id, parte: k };
      if (o.forma === 'arco') for (const a of asasArco(o)) if (largo(resta(q, P(a.p))) < 8) return { id: o.id, parte: a.cual };
    }
    for (let i = M.particulas.length - 1; i >= 0; i--) if (largo(resta(q, P(pd[i]))) < radioPx(i) + 4) return { id: M.particulas[i].id, parte: 'cuerpo' };
    for (const n of esc.objetos) if (n.tipo === 'clavo' && largo(resta(q, P([n.x, n.y]))) < 8) return { id: n.id, parte: 'cuerpo' };
    for (const c of esc.objetos) {
      if (c.tipo === 'polea' && largo(resta(q, P(c.P))) < Math.max(6, c.r * v.escala) + 4) return { id: c.id, parte: 'eje' };
      if (CONECTORES.includes(c.tipo) && c.ancla && largo(resta(q, P(c.ancla))) < 8) return { id: c.id, parte: 'ancla' };
    }
    for (const c of M.conectores) {
      if (c.tipo === 'polea' || c.tipo === 'union') continue;
      const ia = M.indice[c.a], pa = P(pd[ia]), pb = P(c.b != null ? pd[M.indice[c.b]] : c.ancla);
      if (distSegPx(q, pa, pb) < 5) return { id: c.id, parte: 'cuerpo' };
    }
    for (const s of esc.objetos) {
      if (s.tipo !== 'superficie') continue;
      if (s.forma === 'arco') {
        const [cx, cy] = P(s.c), R = s.r * v.escala, d = Math.hypot(x - cx, y - cy), ang = Math.atan2(-(y - cy), x - cx) / DEG;
        if (Math.abs(d - R) < 6 && anguloEnArco(ang, s.a0, s.a1)) return { id: s.id, parte: 'cuerpo' };
      } else if (distSegPx(q, P(s.a), P(s.b)) < 6) return { id: s.id, parte: 'cuerpo' };
    }
    return null;
  }
  /** Punta de la flecha de velocidad (o asa a la derecha si v = 0), en px. */
  function puntaVelocidad(o) {
    const i = M.indice[o.id]; if (i == null || !capas.vectores || !mostrar.velocidad) return null;
    const pd = posDibujo(estadoEn(0))[i], [bx, by] = tz.vista.P(pd), r = radioPx(i) + 1, vv = M.motor.particulas[i].v, m = largo(vv), k = ESC_V * tz.vista.escala;
    if (m * k < 2) return [bx + r + 14, by, bx, by, k, r];
    return [bx + vv[0] / m * r + vv[0] * k, by - vv[1] / m * r - vv[1] * k, bx, by, k, r];
  }

  /** Superficie cercana para apoyar una partícula: la más próxima a menos de 12 px. */
  function superficieCercana(p, r) {
    let mejor = null;
    for (const s of esc.objetos) {
      if (s.tipo !== 'superficie') continue;
      const h = huecoSuperficie(s, p, r);
      if (!h.dentro) continue;
      const dpx = Math.abs(h.C) * tz.vista.escala;
      if (dpx < 12 && (!mejor || dpx < mejor.d)) mejor = { s, d: dpx };
    }
    return mejor?.s || null;
  }
  function apoyarSiCerca(o, libre) {
    o.sobre = null;
    if (libre) return null;
    const s = superficieCercana([o.x, o.y], o.radio);
    if (s) { const q = proyectarSobre(s, [o.x, o.y], o.radio); o.x = q[0]; o.y = q[1]; o.sobre = s.id; }
    return s;
  }

  let espacioPulsado = false;
  lienzo.addEventListener('pointerdown', ev => {
    const [x, y] = posLienzo(ev), w = [tz.vista.mx(x), tz.vista.my(y)], libre = ev.shiftKey, wa = ajustarP(w, libre);
    if (ev.button === 1 || ev.button === 2 || espacioPulsado) { paneo = [x, y, tz.vista.ox, tz.vista.oy]; lienzo.setPointerCapture(ev.pointerId); return; }
    const bajo = objetoEn(x, y), particulaBajo = bajo && objeto(esc, bajo.id)?.tipo === 'particula' ? bajo.id : null;
    lienzo.setPointerCapture(ev.pointerId);
    // Conectores en curso (segundo y tercer clic)
    if (pendiente) {
      const p = pendiente;
      if (p.herr === 'polea') {
        if (!p.P) { pendiente = { ...p, P: wa }; dibujar(); return; }
        if (!particulaBajo) { aviso('Haz clic sobre una partícula.'); return; }
        if (!p.a) { pendiente = { ...p, a: particulaBajo }; dibujar(); return; }
        if (particulaBajo === p.a) { aviso('Elige otra partícula para el otro ramal.'); return; }
        crearPolea(p.P, p.a, particulaBajo); return;
      }
      if (p.a) {
        if (particulaBajo === p.a) return;
        if (p.herr === 'union' && !particulaBajo) { aviso('La unión va entre dos discos: haz clic en el otro.'); return; }
        crearConector(p.herr, p.a, particulaBajo ? { particula: particulaBajo } : { punto: wa }); return;
      }
      if (p.ancla && particulaBajo) { crearConector(p.herr, particulaBajo, { punto: p.ancla }); return; }
      return;
    }
    if (herramienta) {
      const h = herramienta;
      if (h === 'particula') {
        const o = crearParticula(wa); apoyarSiCerca(o, libre);
        arrastre = { tipo: 'mover', id: o.id, desde: [o.x - w[0], o.y - w[1]], nuevo: true, cambio: true };
        soltarHerramienta(); recalcular(true); construirArbol(); construirInspector(); return;
      }
      if (h === 'clavo') { const o = crearClavo(wa); arrastre = { tipo: 'mover', id: o.id, desde: [0, 0], nuevo: true, cambio: true }; soltarHerramienta(); recalcular(true); construirArbol(); construirInspector(); return; }
      if (h === 'polea') { pendiente = { herr: 'polea', P: wa }; dibujar(); return; }
      if (CONECTORES.includes(h)) {
        if (particulaBajo) arrastre = { tipo: 'conectar', herr: h, a: particulaBajo, x, y };
        else if (h === 'union') { aviso('La unión va entre dos discos: haz clic en uno.'); }
        else arrastre = { tipo: 'conectar', herr: h, ancla: wa, x, y };
        dibujar(); return;
      }
      arrastre = { tipo: 'crear', herr: h, p0: wa, p1: null }; return;
    }
    if (!bajo) { if (sel !== 'escena') seleccionar('escena'); paneo = [x, y, tz.vista.ox, tz.vista.oy]; return; }
    if (sel !== bajo.id) seleccionar(bajo.id);
    if (t > 0) { aviso('Los objetos se editan en t = 0.', ['Ir a t = 0', () => irA(0)]); return; }
    const o = objeto(esc, bajo.id);
    if (bajo.parte === 'velocidad') { arrastre = { tipo: 'velocidad', id: o.id }; dibujar(); return; }
    const ref = o.tipo === 'particula' ? [o.x, o.y] : o.tipo === 'clavo' ? [o.x, o.y] : o.tipo === 'polea' ? o.P : bajo.parte === 'ancla' ? o.ancla : o.forma === 'arco' ? o.c : o.a ? o.a : null;
    arrastre = { tipo: bajo.parte === 'cuerpo' || bajo.parte === 'eje' || bajo.parte === 'ancla' ? 'mover' : 'asa', id: o.id, parte: bajo.parte, desde: ref ? [ref[0] - w[0], ref[1] - w[1]] : [0, 0], inicio: copia(o), w0: w };
  });

  lienzo.addEventListener('pointermove', ev => {
    const [x, y] = posLienzo(ev), v = tz.vista, w = [v.mx(x), v.my(y)], libre = ev.shiftKey;
    cursor = { w, libre, x, y };
    $('#cx').textContent = cantidad(w[0], 'm', 4); $('#cy').textContent = cantidad(w[1], 'm', 4);
    if (paneo) { vistaTocada = true; v.ox = paneo[2] + x - paneo[0]; v.oy = paneo[3] + y - paneo[1]; dibujar(); return; }
    if (arrastre) { moverArrastre(arrastre, w, libre, x, y); return; }
    if (pendiente || herramienta) { lienzo.style.cursor = 'crosshair'; dibujar(); return; }
    const h = objetoEn(x, y), id = h?.id ?? null;
    if (id !== hover) { hover = id; dibujar(); }
    lienzo.style.cursor = h && t === 0 ? (h.parte === 'velocidad' ? 'grab' : 'move') : h ? 'pointer' : 'default';
  });

  function moverArrastre(a, w, libre, x, y) {
    const o = objeto(esc, a.id);
    if (a.tipo === 'crear') { a.p1 = ajustarP(w, libre); dibujar(); return; }
    if (a.tipo === 'conectar') { a.objetivo = null; const b = objetoEn(x, y); if (b && objeto(esc, b.id)?.tipo === 'particula' && b.id !== a.a) a.objetivo = b.id; dibujar(); return; }
    if (!o) return;
    a.cambio = true; a.guia = null;
    if (a.tipo === 'velocidad') {
      const pv = puntaVelocidad(o); if (!pv) return;
      const [, , bx, by, k, r] = pv;
      let dx = x - bx, dy = by - y; const mm = Math.hypot(dx, dy);
      if (mm > r) { dx -= dx / mm * r; dy -= dy / mm * r; }
      let ang = Math.atan2(dy, dx) / DEG, mod = Math.hypot(dx, dy) / k;
      if (!libre) {
        let paso = 5, ref = null;
        const s = o.sobre ? objeto(esc, o.sobre) : null;
        if (s) { const n = huecoSuperficie(s, posicionParticula(esc, o), o.radio).n; ref = Math.atan2(-n[0], n[1]) / DEG; }
        const cand = [Math.round(ang / paso) * paso];
        if (ref != null) cand.push(ref, ref + 180, ref - 180);
        ang = cand.reduce((b, c) => (Math.abs(c - ang) < 4 && Math.abs(c - ang) < Math.abs(b - ang) ? c : b), cand[0]);
        mod = Math.round(mod / 0.05) * 0.05;
      }
      o.v = Number(Math.max(0, mod).toFixed(4)); o.ang = Number((((ang + 180) % 360 + 360) % 360 - 180).toFixed(4));
      programarRecalculo(); return;
    }
    const nueva = [w[0] + a.desde[0], w[1] + a.desde[1]];
    if (o.tipo === 'particula') {
      const q = ajustarP(nueva, libre); o.x = q[0]; o.y = q[1];
      const s = apoyarSiCerca(o, libre);
      a.guia = { p: tz.vista.P([o.x, o.y]), texto: s ? `Sobre ${conArticulo(s.nombre)}` : `(${limpio(o.x)}, ${limpio(o.y)}) m` };
      ajustarConectores(o.id);
    } else if (o.tipo === 'clavo') { const q = ajustarP(nueva, libre); o.x = q[0]; o.y = q[1]; a.guia = { p: tz.vista.P(q), texto: `(${limpio(q[0])}, ${limpio(q[1])}) m` }; }
    else if (o.tipo === 'polea' && a.parte === 'eje') { o.P = ajustarP(nueva, libre); ajustarConector(o); }
    else if (a.parte === 'ancla') { o.ancla = ajustarP(nueva, libre); ajustarConector(o); a.guia = { p: tz.vista.P(o.ancla), texto: `(${limpio(o.ancla[0])}, ${limpio(o.ancla[1])}) m` }; }
    else if (o.tipo === 'superficie') {
      const ini = a.inicio;
      if (a.tipo === 'mover') {
        const ref = ini.forma === 'arco' ? ini.c : ini.a, q = ajustarP(nueva, libre), d = resta(q, ref);
        if (ini.forma === 'arco') o.c = q; else { o.a = [ini.a[0] + d[0], ini.a[1] + d[1]]; o.b = [ini.b[0] + d[0], ini.b[1] + d[1]]; }
        // Las partículas apoyadas viajan con la superficie
        for (const p of esc.objetos) if (p.tipo === 'particula' && p.sobre === o.id) { const p0 = ini._apoyadas?.[p.id]; if (p0) { p.x = p0[0] + d[0]; p.y = p0[1] + d[1]; } }
        if (!ini._apoyadas) ini._apoyadas = Object.fromEntries(esc.objetos.filter(p => p.tipo === 'particula' && p.sobre === o.id).map(p => [p.id, [p.x - d[0], p.y - d[1]]]));
        seguirSuperficie(o);
      } else {
        const q = ajustarP(w, libre);
        if (o.forma === 'arco') {
          if (a.parte === 'radio') { o.r = Math.max(0.01, libre ? largo(resta(w, o.c)) : ajustar(largo(resta(w, o.c)), false) || pasoRejilla()); a.guia = { p: tz.vista.P(w), texto: `R = ${limpio(o.r)} m` }; }
          else {
            let ang = Math.atan2(w[1] - o.c[1], w[0] - o.c[0]) / DEG; if (!libre) ang = Math.round(ang / 15) * 15;
            if (a.parte === 'a0') { let a0 = ang; while (a0 > o.a1) a0 -= 360; while (a0 <= o.a1 - 360) a0 += 360; if (o.a1 - a0 > 0) o.a0 = a0; }
            else { let a1 = ang; while (a1 < o.a0) a1 += 360; while (a1 > o.a0 + 360) a1 -= 360; if (a1 - o.a0 > 0) o.a1 = a1; }
            a.guia = { p: tz.vista.P(w), texto: `${limpio(o.a0, 4)}° → ${limpio(o.a1, 4)}°` };
          }
        } else {
          const k = a.parte, otro = k === 'a' ? 'b' : 'a';
          if (o.forma === 'suelo') o[k] = [q[0], o[k][1]];
          else if (o.forma === 'pared') o[k] = [o[k][0], q[1]];
          else o[k] = q;
          if (largo(resta(o[k], o[otro])) < 1e-6) o[k] = ini[k];
          if (o.forma === 'plano') { const pl = datosPlano(o); a.guia = { p: tz.vista.P(q), texto: `θ = ${limpio(pl.th, 3)}° · L = ${limpio(pl.L, 3)} m` }; }
          else a.guia = { p: tz.vista.P(q), texto: `(${limpio(q[0])}, ${limpio(q[1])}) m` };
        }
        seguirSuperficie(o);
      }
    }
    programarRecalculo();
  }

  lienzo.addEventListener('pointerup', ev => {
    const [x, y] = posLienzo(ev), a = arrastre;
    paneo = null; arrastre = null;
    if (!a) { dibujar(); return; }
    if (a.tipo === 'crear') { crearSuperficie(a.herr, a.p0, a.p1); return; }
    if (a.tipo === 'conectar') {
      const moved = Math.hypot(x - a.x, y - a.y) > 6, b = objetoEn(x, y), pb = b && objeto(esc, b.id)?.tipo === 'particula' ? b.id : null;
      const w = ajustarP([tz.vista.mx(x), tz.vista.my(y)], ev.shiftKey);
      if (!moved) { pendiente = { herr: a.herr, a: a.a, ancla: a.ancla }; aviso(textoPendiente(pendiente) + '. Esc cancela.'); dibujar(); return; }
      if (a.a) {
        if (pb === a.a) { dibujar(); return; }
        if (a.herr === 'union' && !pb) { aviso('La unión va entre dos discos.'); dibujar(); return; }
        crearConector(a.herr, a.a, pb ? { particula: pb } : { punto: w }); return;
      }
      if (pb) { crearConector(a.herr, pb, { punto: a.ancla }); return; }
      dibujar(); return;
    }
    if (a.cambio) {
      if (a.nuevo) soltarHerramienta();
      registrar(); recalcular(); construirArbol(); construirInspector();
    } else dibujar();
  });
  lienzo.addEventListener('pointerleave', () => { if (!arrastre && hover) { hover = null; dibujar(); } cursor = null; });
  lienzo.addEventListener('contextmenu', ev => ev.preventDefault());
  lienzo.addEventListener('wheel', ev => {
    ev.preventDefault();
    const [x, y] = posLienzo(ev);
    vistaTocada = true; tz.vista.zoom(Math.exp(-ev.deltaY * 0.0015), x, y);
    zoomTexto(); dibujar();
  }, { passive: false });
  function zoomTexto() { $('#zoom').textContent = Math.round(tz.vista.escala / escala0 * 100) + ' %'; }
  function zoomCentro(f) { vistaTocada = true; tz.vista.zoom(f, tz.w / 2, tz.h / 2); zoomTexto(); dibujar(); }
  $('#b-zoom-mas').addEventListener('click', () => zoomCentro(1.25));
  $('#b-zoom-menos').addEventListener('click', () => zoomCentro(0.8));
  $('#b-encuadrar').addEventListener('click', () => { vistaTocada = false; encuadrar(); dibujar(); });

  // Avisos breves sobre el lienzo (componente «Notificación»)
  let relojAviso = null;
  function aviso(texto, accion) {
    let el = $('#aviso');
    if (!el) { el = document.createElement('div'); el.id = 'aviso'; el.className = 'aviso-flotante'; area.appendChild(el); }
    el.innerHTML = `${ico('i-info')}<span></span>${accion ? `<button class="btn btn-compacto">${accion[0]}</button>` : ''}`;
    el.querySelector('span').textContent = texto;
    if (accion) el.querySelector('button').addEventListener('click', () => { accion[1](); el.hidden = true; });
    el.hidden = false; clearTimeout(relojAviso); relojAviso = setTimeout(() => { el.hidden = true; }, 4200);
  }

  // -------------------------------------------------------------------------
  // Reproducción
  // -------------------------------------------------------------------------
  function cuadro(ahora) {
    if (recalculoPendiente) {
      recalculoPendiente = false;
      if (lento) { M = aMotor(esc); dibujar(); lecturas(); }
      else {
        const t0 = performance.now(); recalcular(true);
        if (performance.now() - t0 > 90 && arrastre) { lento = true; aviso('Escena pesada: la trayectoria se recalcula al soltar.'); }
      }
      if (arrastre?.tipo !== 'velocidad' && !arrastre) lento = false;
    }
    if (!arrastre) lento = false;
    if (jugando) {
      const dt = Math.min(0.05, (ahora - ultimo) / 1000) * velocidad;
      t = Math.min(tFinal(), t + dt);
      if (t >= tFinal()) jugando = false;
      todo();
    }
    ultimo = ahora;
    requestAnimationFrame(cuadro);
  }
  function alternar() { if (!SIM) return; if (t >= tFinal() - 1e-12) t = 0; jugando = !jugando; if (jugando) soltarHerramienta(); todo(); }
  $('#b-play').addEventListener('click', alternar);
  $('#b-reiniciar').addEventListener('click', () => irA(0));
  $('#b-atras').addEventListener('click', () => irA(t - 1 / 60));
  $('#b-adelante').addEventListener('click', () => irA(t + 1 / 60));
  $('#velocidades').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) velocidad = parseFloat(b.dataset.v); });
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => { const k = b.dataset.capa; capas[k] = !capas[k]; b.setAttribute('aria-pressed', String(capas[k])); dibujar(); }));
  $('#pest').addEventListener('click', () => setTimeout(todo, 0));

  // -------------------------------------------------------------------------
  // Exportar
  // -------------------------------------------------------------------------
  function exportarCSV() {
    if (!SIM) { avisar(area, 'No hay nada simulado que exportar'); return; }
    const tf = tFinal(), dt = Math.max(0.001, pasoAgradable(tf / 1000)), nom = M.particulas.map(p => p.nombre.replace(/\s+/g, '_'));
    const cols = ['t (s)'];
    nom.forEach(n => cols.push(`x_${n} (m)`, `y_${n} (m)`, `vx_${n} (m/s)`, `vy_${n} (m/s)`, `|v|_${n} (m/s)`));
    cols.push('Ek (J)', 'Ug (J)', 'Ue (J)', 'UF (J)', 'E (J)', 'Disipada (J)');
    const E0 = energiaMecanica(SIM, 0).E;
    const filas = muestrear(0, tf, dt, tt => {
      const s = estadoMecanica(SIM, tt), e = energiaMecanica(SIM, tt), f = [tt];
      s.forEach(q => f.push(q.x, q.y, q.vx, q.vy, Math.hypot(q.vx, q.vy)));
      f.push(e.K, e.Ug, e.Ue, e.UF, e.E, E0 - e.E);
      return f;
    });
    descargarTexto(`${nombreArchivo(esc.titulo)}-datos.csv`, aCSV(cols, filas))
      .then(r => { if (r) avisar(area, `Datos exportados: ${filas.length} filas`); }, e => avisar(area, `No se pudo exportar: ${e}`));
  }
  function exportarEventos() {
    if (!SIM) return;
    const filas = SIM.eventos.map(e => { const p = lugarDelEvento(e, M) || [NaN, NaN]; return [e.t, describirEvento(e, M), p[0], p[1], e.perdida]; });
    descargarTexto(`${nombreArchivo(esc.titulo)}-eventos.csv`, aCSV(['t (s)', 'evento', 'x (m)', 'y (m)', 'energía disipada (J)'], filas))
      .then(r => { if (r) avisar(area, `Eventos exportados: ${filas.length}`); });
  }
  function exportarPNG() { descargarLienzo(lienzo, `${nombreArchivo(esc.titulo)}-t${fmt(t, 3)}s.png`).then(r => { if (r) avisar(area, 'Imagen del lienzo exportada'); }); }
  $('#b-exportar').addEventListener('click', exportarCSV);
  $('#b-imagen').addEventListener('click', exportarPNG);
  $('#b-guardar').addEventListener('click', guardar);
  $('#b-abrir').addEventListener('click', abrir);

  // -------------------------------------------------------------------------
  // Menús: módulo, espacio y escenas
  // -------------------------------------------------------------------------
  const menu = $('#menu');
  function abrirMenu(boton, html, alElegir) {
    const r = boton.getBoundingClientRect();
    menu.innerHTML = html; menu.style.left = r.left + 'px'; menu.style.top = (r.bottom + 4) + 'px'; menu.hidden = false;
    menu.onclick = ev => { const it = ev.target.closest('.menu-item'); if (!it || it.getAttribute('aria-disabled') === 'true') return; menu.hidden = true; alElegir(it.dataset.v); };
  }
  document.addEventListener('pointerdown', ev => { if (!ev.target.closest('#menu, [aria-haspopup]')) menu.hidden = true; });
  const item = (v, icono, txt, extra = '', actual = false) => `<div class="menu-item" role="menuitem" data-v="${v}"${actual ? ' aria-current="true"' : ''}>${ico(icono)}${txt}${extra}</div>`;
  // Los menús de módulo y de espacio de trabajo los pone componentes/espacio.js
  const GRUPOS = [['tutorial', 'Tutoriales', 'i-tutorial'], ['ejemplo', 'Ejemplos', 'i-ejemplo'], ['mext', 'MEXT', 'i-mext']];
  $('#b-escenas').addEventListener('click', ev => {
    ev.stopPropagation();
    const html = GRUPOS.map(([tipo, titulo, icono], i) => (i ? '<div class="menu-sep"></div>' : '') + `<div class="menu-titulo">${titulo}</div>` +
      ESCENARIOS.filter(e => e.tipo === tipo).map(e => item(e.id, icono, e.titulo, e.tipo === 'mext' ? `<span class="chip lleno">MEXT ${e.anio}</span>` : '', e.id === esc.escenario)).join('')).join('') +
      '<div class="menu-sep"></div>' + item('__vacia', 'i-mas', 'Escena vacía');
    // Cada escena empieza su propio historial de deshacer
    abrirMenu(ev.currentTarget, html, v => { if (v === '__vacia') nuevaEscena(); else cargarEscenario(v); });
  });

  // -------------------------------------------------------------------------
  // Teclado y paleta de comandos
  // -------------------------------------------------------------------------
  const COMANDOS = [
    ['i-reproducir', 'Reproducir o pausar', 'Espacio', alternar],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar],
    ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
    ['i-mas', 'Escena vacía', '', nuevaEscena],
    ['i-reiniciar', 'Ir a t = 0', 'Inicio', () => irA(0)],
    ['i-encuadrar', 'Encuadrar todo', 'F', () => { vistaTocada = false; encuadrar(); dibujar(); }],
    ['i-deshacer', 'Deshacer', 'Ctrl Z', deshacer],
    ['i-rehacer', 'Rehacer', 'Ctrl Y', rehacer],
    ['i-borrar', 'Borrar el objeto seleccionado', 'Supr', () => { if (objeto(esc, sel)) borrar(sel); }],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => window.Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['i-exportar', 'Exportar datos a CSV', '', exportarCSV],
    ['i-evento', 'Exportar eventos a CSV', '', exportarEventos],
    ['i-imagen', 'Exportar imagen del lienzo', '', exportarPNG],
    ...['particula', 'suelo', 'pared', 'plano', 'segmento', 'arco', 'cuerda', 'resorte', 'varilla', 'polea', 'union', 'clavo'].map(h => [ICONOS[h], `Añadir ${(document.querySelector(`#paleta [data-herr="${h}"] span`)?.textContent || h).toLowerCase()}`, h === 'particula' ? 'P' : '', () => elegirHerramienta(h)]),
    ...ESCENARIOS.map(e => [e.tipo === 'mext' ? 'i-mext' : e.tipo === 'tutorial' ? 'i-tutorial' : 'i-ejemplo', `Escenario: ${e.titulo}${e.ref ? ` (MEXT ${e.ref})` : ''}`, '', () => cargarEscenario(e.id)]),
  ];
  let selCmd = 0;
  function pintarComandos() {
    const q = $('#cmd-q').value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const lista = COMANDOS.filter(c => c[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
    selCmd = Math.min(selCmd, Math.max(0, lista.length - 1));
    $('#cmd-lista').innerHTML = '<div class="menu-titulo">Acciones y escenarios</div>' + lista.map((c, i) =>
      `<div class="menu-item${i === selCmd ? ' activo' : ''}" data-i="${COMANDOS.indexOf(c)}">${ico(c[0])}${c[1]}<span class="atajo">${c[2]}</span></div>`).join('');
    return lista;
  }
  function abrirComandos() { $('#velo-comandos').hidden = false; $('#cmd-q').value = ''; selCmd = 0; pintarComandos(); $('#cmd-q').focus(); }
  function cerrarComandos() { $('#velo-comandos').hidden = true; }
  $('#b-comandos').addEventListener('click', abrirComandos);
  $('#cmd-q').addEventListener('input', () => { selCmd = 0; pintarComandos(); });
  $('#cmd-lista').addEventListener('click', ev => { const it = ev.target.closest('.menu-item'); if (it) { cerrarComandos(); COMANDOS[+it.dataset.i][3](); } });
  $('#velo-comandos').addEventListener('click', ev => { if (ev.target.id === 'velo-comandos') cerrarComandos(); });
  document.addEventListener('keydown', ev => {
    if (!$('#velo-comandos').hidden) {
      const lista = pintarComandos();
      if (ev.key === 'Escape') cerrarComandos();
      else if (ev.key === 'ArrowDown') { selCmd = Math.min(lista.length - 1, selCmd + 1); pintarComandos(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { selCmd = Math.max(0, selCmd - 1); pintarComandos(); ev.preventDefault(); }
      else if (ev.key === 'Enter' && lista[selCmd]) { cerrarComandos(); lista[selCmd][3](); }
      return;
    }
    const ctrl = ev.ctrlKey || ev.metaKey, enCampo = ev.target.matches('input, textarea');
    if (ctrl && ev.key.toLowerCase() === 'k') { ev.preventDefault(); abrirComandos(); return; }
    if (ctrl && ev.key.toLowerCase() === 's') { ev.preventDefault(); guardar(); return; }
    if (ctrl && ev.key.toLowerCase() === 'o') { ev.preventDefault(); abrir(); return; }
    if (ctrl && !enCampo && (ev.key.toLowerCase() === 'y' || (ev.shiftKey && ev.key.toLowerCase() === 'z'))) { ev.preventDefault(); rehacer(); return; }
    if (ctrl && !enCampo && ev.key.toLowerCase() === 'z') { ev.preventDefault(); deshacer(); return; }
    if (enCampo) return;
    if (ev.key === 'Escape') { if (pendiente || herramienta) soltarHerramienta(); else if (sel !== 'escena') seleccionar('escena'); menu.hidden = true; dibujar(); return; }
    if (ev.key === 'Delete' || ev.key === 'Backspace') { if (objeto(esc, sel)) { ev.preventDefault(); borrar(sel); } return; }
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) alternar(); espacioPulsado = true; }
    else if (ev.key === 'ArrowRight') irA(t + 1 / 60);
    else if (ev.key === 'ArrowLeft') irA(t - 1 / 60);
    else if (ev.key === 'Home') irA(0);
    else if (ev.key.toLowerCase() === 'f') { vistaTocada = false; encuadrar(); dibujar(); }
    else if (ev.key.toLowerCase() === 'p' && !ctrl) elegirHerramienta('particula');
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });
  $('#vacio-escenas').addEventListener('click', ev => { ev.stopPropagation(); $('#b-escenas').click(); });

  // -------------------------------------------------------------------------
  // Arranque
  // -------------------------------------------------------------------------
  window.Volta.alCambiarTema(() => { tz.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); if (!vistaTocada) encuadrar(); todo(); });
  document.fonts.ready.then(() => {
    tz.ajustar();
    // ?escena=<id> carga un escenario (enlaces y capturas). Si no, la escena
    // que otra pantalla dejó para abrir, el autoguardado o el escenario por defecto.
    const limpioURL = !params.has('t') && !captura && !params.has('escena');
    let datos = null;
    if (params.has('escena')) datos = escenaDeEscenario(params.get('escena'));
    if (!datos) {
      const pend = escenaPendiente('mecanica');
      if (pend && pend.espacio === ESPACIO) datos = pend.datos;
      else if (pend) { try { sessionStorage.setItem('volta.abrir', JSON.stringify(pend)); } catch { /* sin almacenamiento */ } location.href = 'mecanica.html'; return; }
    }
    if (!datos && limpioURL) { const g = autoguardado.leer(CLAVE_AUTOGUARDADO, { modulo: 'mecanica' }); if (g && g.espacio === ESPACIO) datos = g.datos; }
    if (!datos) datos = escenaDeEscenario('mext-2017-p3');
    historial = new Historial(copia(normalizarEscena(datos)));
    cargar(datos, { sel: params.get('sel') });
    autoguardadoActivo = limpioURL;
    const pest = params.get('pest');
    if (pest) { const b = document.querySelector(`.pestana[aria-controls="p-${pest}"]`); if (b) b.click(); }
    if (params.has('t')) irA(parseFloat(params.get('t')) || 0);
    requestAnimationFrame(a => { ultimo = a; requestAnimationFrame(cuadro); });
  });
}
