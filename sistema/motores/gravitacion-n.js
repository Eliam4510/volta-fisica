/* ==========================================================================
   Volta — motor de gravitación de N cuerpos con maniobras
   (Gravitación · Sistema solar y Maniobras)
   Amplía sistema/motores/gravitacion.js (que no cambia) con:
   - N cuerpos colocados libremente: los masivos se atraen entre sí, las
     partículas de prueba sienten la gravedad pero no atraen;
   - integrador adaptativo de alto orden (Bulirsch–Stoer: punto medio de
     Gragg con extrapolación de Richardson en h², hasta orden 16), el que
     usan MERCURY y SWIFT en los encuentros cercanos. El error de cada paso
     se mide frente a la distancia y la rapidez relativa al vecino más
     cercano, así que un encuentro a 10⁻⁴ de la escala del sistema se
     integra con la misma exactitud relativa que el resto;
   - modo automático (por defecto): Yoshida de 4.º orden (simpléctico, la
     energía no deriva) mientras ningún par se acerca; Bulirsch–Stoer en
     los pasos en que el tiempo dinámico de algún par, √(d³/μ) con d la
     menor distancia del paso, es menor que 20 pasos;
   - jerarquía de primarios por esferas de Hill: cada cuerpo mide sus
     elementos orbitales, ápsides y vueltas respecto del cuerpo que lo
     domina (la Luna respecto de la Tierra, la Tierra respecto del Sol);
   - impulsos Δv programados en un instante o en un evento (el n-ésimo
     periapsis o apoapsis desde que el impulso queda armado), en el marco
     orbital (prógrado y radial hacia fuera) o en x, y;
   - choques: una partícula de prueba se posa sobre el cuerpo que toca; dos
     cuerpos masivos se funden (choque perfectamente inelástico: se
     conservan la masa, el momento lineal y la posición del centro de masa);
   - presets con datos reales (planetas del Sistema Solar en J2000, Tierra
     y Luna) y fórmulas de maniobras (Hohmann, circularización, escape).
   Un motor nunca aborta una simulación válida: si se agota el presupuesto
   de cálculo o un encuentro es singular (dos masas puntuales que chocan),
   devuelve lo simulado con `incompleta = {t, motivo}`. Solo lanza con
   escenas inválidas. Todo en SI. Puro: sin DOM.
   ========================================================================== */
import { G, CUERPOS, elementosOrbitales, brent, resolverKepler } from './gravitacion.js';

/** Unidad astronómica (IAU 2012), m. */
export const UA = 1.495978707e11;
/** Día, s. */
export const DIA = 86400;
/** Año juliano, s. */
export const ANIO = 365.25 * DIA;
const GRADO = Math.PI / 180;

/**
 * @typedef {Object} Planeta
 * @property {string} nombre
 * @property {number} mu   GM (m³/s²)
 * @property {number} masa kg
 * @property {number} radio Radio ecuatorial (m)
 * @property {number} periodoRotacion Periodo de rotación sidéreo (s; negativo si es retrógrado)
 * @property {number} a    Semieje mayor (m)
 * @property {number} e    Excentricidad
 * @property {number} lonPeri Longitud del perihelio ϖ (rad)
 * @property {number} lonMedia Longitud media L en J2000 (rad)
 */
/** @returns {Planeta} */
const planeta = (nombre, mu, radio, rot, aUA, e, peri, media) => Object.freeze({
  nombre, mu, masa: mu / G, radio, periodoRotacion: rot, a: aUA * UA, e, lonPeri: peri * GRADO, lonMedia: media * GRADO,
});

/**
 * Planetas del Sistema Solar: GM y radios (JPL), elementos medios en J2000
 * (Standish, «Keplerian Elements for Approximate Positions of the Major
 * Planets»: a, e, ϖ y L). El modelo es plano: se ignora la inclinación.
 * La Tierra lleva los elementos del baricentro Tierra–Luna.
 */
export const PLANETAS = Object.freeze({
  mercurio: planeta('Mercurio', 2.2031868e13, 2.4397e6, 5067032, 0.38709927, 0.20563593, 77.45779628, 252.25032350),
  venus: planeta('Venus', 3.24858592e14, 6.0518e6, -20997153, 0.72333566, 0.00677672, 131.60246718, 181.97909950),
  tierra: planeta('Tierra', CUERPOS.tierra.mu, CUERPOS.tierra.radio, CUERPOS.tierra.periodoRotacion, 1.00000261, 0.01671123, 102.93768193, 100.46457166),
  marte: planeta('Marte', CUERPOS.marte.mu, CUERPOS.marte.radio, CUERPOS.marte.periodoRotacion, 1.52371034, 0.09339410, -23.94362959, -4.55343205),
  jupiter: planeta('Júpiter', CUERPOS.jupiter.mu, CUERPOS.jupiter.radio, CUERPOS.jupiter.periodoRotacion, 5.20288700, 0.04838624, 14.72847983, 34.39644051),
  saturno: planeta('Saturno', 3.7931206e16, 6.0268e7, 38362, 9.53667594, 0.05386179, 92.59887831, 49.95424423),
  urano: planeta('Urano', 5.7939506e15, 2.5559e7, -62064, 19.18916464, 0.04725744, 170.95427630, 313.23810451),
  neptuno: planeta('Neptuno', 6.8365e15, 2.4764e7, 57996, 30.06992276, 0.00859048, 44.96476227, -55.12002969),
});

/** Órbita media de la Luna: semieje (m), excentricidad y periodo sidéreo (s). */
export const LUNA_ORBITA = Object.freeze({ a: 3.84399e8, e: 0.0549, periodo: 27.321661 * DIA });

// ---------------------------------------------------------------------------
// Fórmulas de dos cuerpos y de maniobras
// ---------------------------------------------------------------------------

/**
 * Estado relativo al foco de una órbita elíptica plana de semieje a,
 * excentricidad e, argumento del periapsis ω (desde el eje x) y anomalía
 * media M, alrededor de un centro de parámetro μ.
 * @param {number} mu
 * @param {{a: number, e: number, omega?: number, M?: number, sentido?: number}} el
 * @returns {{x: number, y: number, vx: number, vy: number}}
 */
export function estadoDesdeElementos(mu, { a, e, omega = 0, M = 0, sentido = 1 }) {
  if (!(a > 0) || !(e >= 0 && e < 1)) throw new RangeError('estadoDesdeElementos: hace falta una elipse (a > 0, 0 ≤ e < 1)');
  const E = resolverKepler(M, e), cE = Math.cos(E), sE = Math.sin(E);
  const n = Math.sqrt(mu / (a * a * a)), b = Math.sqrt(1 - e * e), den = 1 - e * cE;
  const xp = a * (cE - e), yp = a * b * sE, vxp = -a * n * sE / den, vyp = a * n * b * cE / den;
  const cw = Math.cos(omega), sw = Math.sin(omega), s = sentido >= 0 ? 1 : -1;
  return { x: xp * cw - s * yp * sw, y: xp * sw + s * yp * cw, vx: vxp * cw - s * vyp * sw, vy: vxp * sw + s * vyp * cw };
}

/**
 * Transferencia de Hohmann entre órbitas circulares coplanarias de radios r1
 * y r2 (en el mismo sentido). Δv positivo es prógrado; si r2 < r1, los dos
 * impulsos son retrógrados.
 * @param {number} mu @param {number} r1 @param {number} r2
 */
export function hohmann(mu, r1, r2) {
  if (!(r1 > 0 && r2 > 0 && mu > 0)) throw new RangeError('hohmann: los radios y μ deben ser positivos');
  const a = (r1 + r2) / 2, v1 = Math.sqrt(mu / r1), v2 = Math.sqrt(mu / r2);
  const vt1 = Math.sqrt(mu * (2 / r1 - 1 / a)), vt2 = Math.sqrt(mu * (2 / r2 - 1 / a));
  const dv1 = vt1 - v1, dv2 = v2 - vt2;
  return {
    a, e: Math.abs(r2 - r1) / (r1 + r2), v1, v2, vt1, vt2, dv1, dv2,
    dvTotal: Math.abs(dv1) + Math.abs(dv2), tTransferencia: Math.PI * Math.sqrt(a * a * a / mu),
    /** @type {'apoapsis'|'periapsis'} */ segundo: r2 >= r1 ? 'apoapsis' : 'periapsis',
  };
}

/**
 * Base orbital en un punto: ût en la dirección de la velocidad (prógrado) y
 * ûn perpendicular a ella en el plano, hacia fuera del primario. Si la
 * velocidad relativa es nula, ût es la dirección antihoraria perpendicular a r.
 * @param {[number, number]} pos Posición relativa al primario
 * @param {[number, number]} vel Velocidad relativa al primario
 */
export function baseOrbital(pos, vel) {
  const v = Math.hypot(vel[0], vel[1]), r = Math.hypot(pos[0], pos[1]) || 1;
  const ut = v > 0 ? [vel[0] / v, vel[1] / v] : [-pos[1] / r, pos[0] / r];
  let un = [ut[1], -ut[0]];
  if (un[0] * pos[0] + un[1] * pos[1] < 0) un = [-un[0], -un[1]];
  return { ut, un };
}
/** Δv del marco orbital [prógrado, radial] a x, y. @param {[number, number]} pos @param {[number, number]} vel @param {[number, number]} dv @returns {[number, number]} */
export function dvAXY(pos, vel, dv) {
  const { ut, un } = baseOrbital(pos, vel);
  return [dv[0] * ut[0] + dv[1] * un[0], dv[0] * ut[1] + dv[1] * un[1]];
}
/** Δv de x, y al marco orbital [prógrado, radial]. @param {[number, number]} pos @param {[number, number]} vel @param {[number, number]} dv @returns {[number, number]} */
export function dvAOrbital(pos, vel, dv) {
  const { ut, un } = baseOrbital(pos, vel);
  return [dv[0] * ut[0] + dv[1] * ut[1], dv[0] * un[0] + dv[1] * un[1]];
}

/**
 * Δv (x, y) que deja la órbita circular a la distancia actual, en el mismo
 * sentido de giro. @param {number} mu @param {[number, number]} pos @param {[number, number]} vel
 * @returns {[number, number]}
 */
export function dvCircularizar(mu, pos, vel) {
  const r = Math.hypot(pos[0], pos[1]), h = pos[0] * vel[1] - pos[1] * vel[0], s = h >= 0 ? 1 : -1, vc = Math.sqrt(mu / r);
  return [-s * pos[1] / r * vc - vel[0], s * pos[0] / r * vc - vel[1]];
}

/** Δv prógrado mínimo para escapar desde el estado actual: √(2μ/r) − |v|. @param {number} mu @param {[number, number]} pos @param {[number, number]} vel */
export function dvEscape(mu, pos, vel) {
  return Math.sqrt(2 * mu / Math.hypot(pos[0], pos[1])) - Math.hypot(vel[0], vel[1]);
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} CuerpoN
 * @property {string} nombre
 * @property {number} [masa]  kg (si falta, μ/G)
 * @property {number} [mu]    GM (m³/s²); manda sobre la masa para la dinámica
 * @property {boolean} [prueba=false] Partícula de prueba: siente la gravedad pero no atrae
 * @property {boolean} [fijo=false]   No se mueve (cuerpo central fijo)
 * @property {number} [radio=0] Radio (m): superficie para los choques
 * @property {number} [primario] Índice del cuerpo respecto del que se miden sus elementos (si falta, por las esferas de Hill)
 * @property {string} [preset] Clave de los datos reales de los que sale
 * @property {number} x @property {number} y @property {number} vx @property {number} vy
 */

/** Masa de un cuerpo de la escena (kg). @param {CuerpoN} c */
const masaDe = c => (c.masa != null ? c.masa : c.mu != null ? c.mu / G : 0);
/** Parámetro gravitatorio con el que atrae (0 si es de prueba). @param {CuerpoN} c */
const muDe = c => (c.prueba ? 0 : c.mu != null ? c.mu : G * (c.masa ?? 0));

/**
 * Lleva los cuerpos al sistema del centro de masa (en reposo en el origen):
 * resta la posición y la velocidad del centro de masa de los que atraen.
 * @param {CuerpoN[]} cuerpos (se modifican)
 */
export function aBaricentro(cuerpos) {
  let M = 0, x = 0, y = 0, vx = 0, vy = 0;
  for (const c of cuerpos) {
    if (!(muDe(c) > 0)) continue;
    const m = masaDe(c);
    M += m; x += m * c.x; y += m * c.y; vx += m * c.vx; vy += m * c.vy;
  }
  if (!(M > 0)) return cuerpos;
  x /= M; y /= M; vx /= M; vy /= M;
  for (const c of cuerpos) { c.x -= x; c.y -= y; if (!c.fijo) { c.vx -= vx; c.vy -= vy; } }
  return cuerpos;
}

/**
 * El Sol y los planetas pedidos con sus posiciones y velocidades de J2000
 * (órbitas keplerianas heliocéntricas con μ = GM☉ + GMp), llevados al
 * baricentro: el centro de masa queda en reposo en el origen.
 * @param {string[]} [claves] de PLANETAS
 * @param {{baricentrico?: boolean}} [o]
 * @returns {CuerpoN[]}
 */
export function sistemaSolar(claves = Object.keys(PLANETAS), o = {}) {
  const sol = CUERPOS.sol;
  /** @type {CuerpoN[]} */
  const cs = [{ nombre: 'Sol', mu: sol.mu, masa: sol.masa, radio: sol.radio, preset: 'sol', x: 0, y: 0, vx: 0, vy: 0 }];
  for (const k of claves) {
    const p = PLANETAS[k];
    if (!p) throw new RangeError(`sistemaSolar: planeta desconocido «${k}»`);
    const s = estadoDesdeElementos(sol.mu + p.mu, { a: p.a, e: p.e, omega: p.lonPeri, M: p.lonMedia - p.lonPeri });
    cs.push({ nombre: p.nombre, mu: p.mu, masa: p.masa, radio: p.radio, preset: k, ...s });
  }
  return o.baricentrico === false ? cs : aBaricentro(cs);
}

/**
 * Descomposición de Ptolomeo de la posición de un planeta vista desde la
 * Tierra. Como P − T = (S − T) + (P − S), el planeta recorre un epiciclo cuyo
 * centro gira sobre un deferente centrado en la Tierra. Para un planeta
 * exterior (más lejos del Sol que la Tierra), el deferente es su propia órbita
 * (radio |P − S|) y el epiciclo es la de la Tierra (|S − T|), así que el
 * epiciclo gira con periodo de un año; para uno interior, el deferente lleva
 * al Sol y el epiciclo es la órbita del planeta. Es la misma geometría que el
 * modelo heliocéntrico, sumada en otro orden.
 * @param {number[]} T posición de la Tierra
 * @param {number[]} S posición del Sol
 * @param {number[]} P posición del planeta
 * @returns {{exterior: boolean, centro: number[], rDeferente: number, rEpiciclo: number}}
 */
export function epiciclo(T, S, P) {
  const dTS = Math.hypot(S[0] - T[0], S[1] - T[1]), dPS = Math.hypot(P[0] - S[0], P[1] - S[1]);
  const exterior = dPS > dTS;
  const centro = exterior ? [T[0] + P[0] - S[0], T[1] + P[1] - S[1]] : [S[0], S[1]];
  return { exterior, centro, rDeferente: exterior ? dPS : dTS, rEpiciclo: exterior ? dTS : dPS };
}

/**
 * La Tierra y la Luna en el sistema de su centro de masa, con la Luna en el
 * perigeo sobre el eje x (o en la anomalía media M).
 * @param {{M?: number, omega?: number}} [o]
 * @returns {CuerpoN[]}
 */
export function tierraLuna(o = {}) {
  const T = CUERPOS.tierra, L = CUERPOS.luna;
  const s = estadoDesdeElementos(T.mu + L.mu, { a: LUNA_ORBITA.a, e: LUNA_ORBITA.e, omega: o.omega ?? 0, M: o.M ?? 0 });
  return aBaricentro([
    { nombre: 'Tierra', mu: T.mu, masa: T.masa, radio: T.radio, preset: 'tierra', x: 0, y: 0, vx: 0, vy: 0 },
    { nombre: 'Luna', mu: L.mu, masa: L.masa, radio: L.radio, preset: 'luna', ...s },
  ]);
}

// ---------------------------------------------------------------------------
// Jerarquía: primario de cada cuerpo por esferas de Hill
// ---------------------------------------------------------------------------

/**
 * Primario de cada cuerpo: el masivo más pequeño (más interior) en cuya
 * esfera de Hill está, r_H = d·∛(m/3M) respecto de su propio primario; si no
 * está en ninguna, el más masivo de todos. El más masivo no tiene (−1).
 * @param {Array<{mu: number, primario?: number}>} cuerpos μ con que atrae cada uno (0 si es de prueba)
 * @param {Array<{x: number, y: number}>} estado
 * @param {ArrayLike<number>} [activo] 0 si el cuerpo ya no existe (absorbido)
 * @returns {Int32Array}
 */
export function primarios(cuerpos, estado, activo) {
  const n = cuerpos.length, prim = new Int32Array(n).fill(-1);
  const vivo = i => !activo || activo[i] !== 0;
  const orden = [...Array(n).keys()].filter(vivo).sort((a, b) => cuerpos[b].mu - cuerpos[a].mu || a - b);
  const masivos = orden.filter(i => cuerpos[i].mu > 0);
  if (!masivos.length) return prim;
  const raiz = masivos[0], rH = new Float64Array(n).fill(Infinity);
  const d = (i, j) => Math.hypot(estado[i].x - estado[j].x, estado[i].y - estado[j].y);
  for (const i of orden) {
    if (i === raiz) continue;
    const pedido = cuerpos[i].primario;
    if (Number.isInteger(pedido) && pedido !== i && pedido >= 0 && pedido < n && cuerpos[pedido].mu > 0 && vivo(pedido)) prim[i] = pedido;
    else {
      let mejor = raiz, radio = Infinity;
      for (const j of masivos) {
        if (j === i || j === raiz || !(cuerpos[j].mu > cuerpos[i].mu || (cuerpos[j].mu === cuerpos[i].mu && j < i))) continue;
        if (Number.isFinite(rH[j]) && rH[j] < radio && d(i, j) < rH[j]) { mejor = j; radio = rH[j]; }
      }
      prim[i] = mejor;
    }
    const p = prim[i];
    if (cuerpos[i].mu > 0 && p >= 0) rH[i] = d(i, p) * Math.cbrt(cuerpos[i].mu / (3 * cuerpos[p].mu));
  }
  return prim;
}

// ---------------------------------------------------------------------------
// Integradores
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ConfigN
 * @property {number} n
 * @property {Float64Array} mu
 * @property {Uint8Array} movil  1 si el cuerpo se integra (ni fijo, ni posado, ni absorbido)
 * @property {Uint8Array} activo 0 si fue absorbido en una fusión
 * @property {Float64Array} ax @property {Float64Array} ay
 * @property {number} tol Tolerancia relativa del adaptativo
 * @property {{n: number}} cuenta Evaluaciones de las fuerzas
 */
/** @typedef {{x: Float64Array, y: Float64Array, vx: Float64Array, vy: Float64Array}} EstadoN */

const W1 = 1 / (2 - Math.cbrt(2)), W0 = -Math.cbrt(2) / (2 - Math.cbrt(2));
const YOSHIDA_C = [W1 / 2, (W0 + W1) / 2, (W0 + W1) / 2, W1 / 2];
const YOSHIDA_D = [W1, W0, W1];

/** Aceleraciones de los cuerpos móviles. @param {ConfigN} cfg @param {Float64Array} x @param {Float64Array} y */
function acelerar(cfg, x, y) {
  const { n, mu, movil, ax, ay } = cfg;
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0;
    if (movil[i]) {
      for (let j = 0; j < n; j++) {
        if (j === i || mu[j] === 0) continue;
        const dx = x[j] - x[i], dy = y[j] - y[i], r2 = dx * dx + dy * dy, k = mu[j] / (r2 * Math.sqrt(r2));
        sx += k * dx; sy += k * dy;
      }
    }
    ax[i] = sx; ay[i] = sy;
  }
  cfg.cuenta.n++;
}
/** @param {ConfigN} cfg @param {EstadoN} s @param {number} h */
function deriva(cfg, s, h) { for (let i = 0; i < cfg.n; i++) if (cfg.movil[i]) { s.x[i] += h * s.vx[i]; s.y[i] += h * s.vy[i]; } }
/** @param {ConfigN} cfg @param {EstadoN} s @param {number} h */
function patada(cfg, s, h) { for (let i = 0; i < cfg.n; i++) if (cfg.movil[i]) { s.vx[i] += h * cfg.ax[i]; s.vy[i] += h * cfg.ay[i]; } }

const SIMPLECTICOS = {
  /** @param {ConfigN} cfg @param {EstadoN} s @param {number} h */
  verlet(cfg, s, h) {
    acelerar(cfg, s.x, s.y); patada(cfg, s, h / 2);
    deriva(cfg, s, h);
    acelerar(cfg, s.x, s.y); patada(cfg, s, h / 2);
  },
  /** @param {ConfigN} cfg @param {EstadoN} s @param {number} h */
  yoshida4(cfg, s, h) {
    for (let k = 0; k < 3; k++) { deriva(cfg, s, YOSHIDA_C[k] * h); acelerar(cfg, s.x, s.y); patada(cfg, s, YOSHIDA_D[k] * h); }
    deriva(cfg, s, YOSHIDA_C[3] * h);
  },
};

// ---- Bulirsch–Stoer -------------------------------------------------------
// Estado plano y = [x₀…, y₀…, vx₀…, vy₀…].
// dmin2 (opcional): menor distancia² de cada cuerpo a un masivo en todas las
// evaluaciones del paso, para medir el error frente al acercamiento real
/** @param {ConfigN} cfg @param {Float64Array} y @param {Float64Array} f @param {Float64Array} [dmin2] */
function derivada(cfg, y, f, dmin2) {
  const { n, mu, movil } = cfg, n2 = 2 * n, n3 = 3 * n;
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0;
    if (movil[i]) {
      const xi = y[i], yi = y[n + i];
      let m2 = Infinity;
      for (let j = 0; j < n; j++) {
        if (j === i || mu[j] === 0) continue;
        const dx = y[j] - xi, dy = y[n + j] - yi, r2 = dx * dx + dy * dy, k = mu[j] / (r2 * Math.sqrt(r2));
        sx += k * dx; sy += k * dy;
        if (r2 < m2) m2 = r2;
      }
      if (dmin2 && m2 < dmin2[i]) dmin2[i] = m2;
      f[i] = y[n2 + i]; f[n + i] = y[n3 + i];
    } else { f[i] = 0; f[n + i] = 0; }
    f[n2 + i] = sx; f[n3 + i] = sy;
  }
  cfg.cuenta.n++;
}

const SECUENCIA = [2, 4, 6, 8, 10, 12, 14, 16];
// Trabajo acumulado (evaluaciones) hasta cada columna
const TRABAJO = SECUENCIA.map((_, j) => 1 + SECUENCIA.slice(0, j + 1).reduce((a, b) => a + b, 0));

/** Punto medio modificado de Gragg con su paso de suavizado: m subpasos de H/m. */
function puntoMedio(cfg, y0, f0, H, m, out, z0, z1, f, dmin2) {
  const N = y0.length, h = H / m;
  for (let k = 0; k < N; k++) { z0[k] = y0[k]; z1[k] = y0[k] + h * f0[k]; }
  for (let s = 1; s < m; s++) {
    derivada(cfg, z1, f, dmin2);
    for (let k = 0; k < N; k++) { const z = z0[k] + 2 * h * f[k]; z0[k] = z1[k]; z1[k] = z; }
  }
  derivada(cfg, z1, f, dmin2);
  for (let k = 0; k < N; k++) out[k] = 0.5 * (z1[k] + z0[k] + h * f[k]);
}

/**
 * Escalas del error de cada cuerpo: la distancia ρ al vecino con el que
 * interactúa más cerca y una rapidez ν (la relativa a ese vecino o la
 * circular a esa distancia, la mayor). Un encuentro cercano exige así la
 * misma exactitud relativa que el resto del sistema.
 */
// piso: error absoluto por debajo del cual manda el redondeo de las
// coordenadas (unos ulp de |r| y |v|); pedir menos haría errático el control
function escalasError(cfg, y, rho, nu, muVecino, piso) {
  const { n, mu, movil, activo } = cfg, n2 = 2 * n, n3 = 3 * n;
  for (let i = 0; i < n; i++) {
    if (!movil[i]) continue;
    let dmin = Infinity, vrel = 0, muPar = 0, otro = -1;
    muVecino[i] = 0;
    for (let j = 0; j < n; j++) {
      if (j === i || !activo[j] || (mu[i] === 0 && mu[j] === 0)) continue;
      const d = Math.hypot(y[j] - y[i], y[n + j] - y[n + i]);
      if (d < dmin) { dmin = d; vrel = Math.hypot(y[n2 + j] - y[n2 + i], y[n3 + j] - y[n3 + i]); muPar = mu[i] + mu[j]; otro = j; }
      if (mu[j] > 0 && mu[i] + mu[j] > muVecino[i]) muVecino[i] = mu[i] + mu[j];
    }
    if (Number.isFinite(dmin) && dmin > 0) { rho[i] = dmin; nu[i] = Math.max(vrel, Math.sqrt(muPar / dmin)); }
    else { rho[i] = Math.max(1, Math.hypot(y[i], y[n + i])); nu[i] = Math.max(1, Math.hypot(y[n2 + i], y[n3 + i])); }
    const k = otro >= 0 ? otro : i;
    piso[2 * i] = 32 * Number.EPSILON * (Math.hypot(y[i], y[n + i]) + Math.hypot(y[k], y[n + k]));
    piso[2 * i + 1] = 32 * Number.EPSILON * (Math.hypot(y[n2 + i], y[n3 + i]) + Math.hypot(y[n2 + k], y[n3 + k]));
  }
}
// Con dmin2, la escala de cada cuerpo baja hasta su mayor acercamiento
// dentro del paso (un periapsis profundo a mitad de paso)
function normaError(cfg, a, b, rho, nu, muVecino, dmin2, piso) {
  const { n, movil, tol } = cfg, n2 = 2 * n, n3 = 3 * n;
  let e = 0;
  for (let i = 0; i < n; i++) {
    if (!movil[i]) continue;
    let r = rho[i], w = nu[i];
    if (dmin2[i] < r * r) { r = Math.sqrt(dmin2[i]); if (muVecino[i] > 0) w = Math.max(w, Math.sqrt(muVecino[i] / r)); }
    const ep = Math.hypot(a[i] - b[i], a[n + i] - b[n + i]) / Math.max(tol * r, piso[2 * i]);
    const ev = Math.hypot(a[n2 + i] - b[n2 + i], a[n3 + i] - b[n3 + i]) / Math.max(tol * w, piso[2 * i + 1]);
    if (ep > e) e = ep;
    if (ev > e) e = ev;
    if (!(e === e)) return Infinity;   // NaN
  }
  return e;
}

/**
 * Integra y de 0 a H con Bulirsch–Stoer (paso y orden adaptativos). Es una
 * función pura de (y, H): parte siempre de un paso de tamaño H, así que
 * estadoSistema reproduce exactamente las muestras. Devuelve null si el paso
 * se hace despreciable (encuentro singular) o se agota el presupuesto.
 * @param {ConfigN} cfg @param {Float64Array} y0 @param {number} H @param {number} [presupuesto]
 */
function bulirschStoer(cfg, y0, H, presupuesto = Infinity) {
  const N = y0.length, K = SECUENCIA.length;
  let y = Float64Array.from(y0);
  const f0 = new Float64Array(N), z0 = new Float64Array(N), z1 = new Float64Array(N), f = new Float64Array(N);
  const rho = new Float64Array(cfg.n), nu = new Float64Array(cfg.n), muVecino = new Float64Array(cfg.n), dmin2 = new Float64Array(cfg.n), piso = new Float64Array(2 * cfg.n);
  /** @type {Float64Array[][]} */
  const T = SECUENCIA.map((_, j) => Array.from({ length: j + 1 }, () => new Float64Array(N)));
  let t = 0, h = H, intentos = 0;
  const hMin = H * 1e-13;
  while (t < H) {
    if (++intentos > 200000 || cfg.cuenta.n > presupuesto) return null;
    let ultimo = false;
    if (t + h * 1.0001 >= H) { h = H - t; ultimo = true; }
    if (!(h > hMin) && !ultimo) return null;
    dmin2.fill(Infinity);
    derivada(cfg, y, f0, dmin2);
    escalasError(cfg, y, rho, nu, muVecino, piso);
    // Ningún paso salta un acercamiento: h ≤ ½·ρ/ν (tiempo en recorrer la separación actual)
    let hLocal = Infinity;
    for (let i = 0; i < cfg.n; i++) if (cfg.movil[i] && nu[i] > 0) hLocal = Math.min(hLocal, 0.5 * rho[i] / nu[i]);
    if (h > hLocal) { h = hLocal; ultimo = false; if (t + h * 1.0001 >= H) { h = H - t; ultimo = true; } }
    let acepta = -1, hNuevo = h / 4, mejorTrabajo = Infinity, errPrevio = Infinity;
    for (let j = 0; j < K; j++) {
      puntoMedio(cfg, y, f0, h, SECUENCIA[j], T[j][0], z0, z1, f, dmin2);
      for (let k = 1; k <= j; k++) {
        const c = (SECUENCIA[j] / SECUENCIA[j - k]) ** 2 - 1, a = T[j][k - 1], b = T[j - 1][k - 1], o = T[j][k];
        for (let q = 0; q < N; q++) o[q] = a[q] + (a[q] - b[q]) / c;
      }
      if (j === 0) continue;
      const err = normaError(cfg, T[j][j], T[j][j - 1], rho, nu, muVecino, dmin2, piso);
      // Paso que daría err = 0.65 con esta columna (orden 2j + 1 del estimador)
      const fac = err > 0 ? Math.min(4, Math.max(0.02, 0.94 * Math.pow(0.65 / err, 1 / (2 * j + 1)))) : 4;
      const trabajo = TRABAJO[j] / (h * fac);
      if (trabajo < mejorTrabajo) { mejorTrabajo = trabajo; hNuevo = h * fac; }
      if (err <= 1) { acepta = j; break; }
      // Sin convergencia a la vista: se rechaza pronto
      if (j >= 3 && (err > 1e8 || err > errPrevio)) { hNuevo = h * Math.min(fac, 0.5); break; }
      errPrevio = err;
    }
    if (acepta < 0) {
      if (!Number.isFinite(hNuevo) || !(hNuevo > 0)) hNuevo = h / 10;
      h = Math.min(hNuevo, h * 0.7);
      continue;
    }
    const yn = T[acepta][acepta];
    for (let q = 0; q < N; q++) y[q] = yn[q];
    if (!y.every(Number.isFinite)) return null;
    t = ultimo ? H : t + h;
    h = hNuevo;
  }
  return y;
}

/** @param {EstadoN} s @returns {EstadoN} */
const copiar = s => ({ x: Float64Array.from(s.x), y: Float64Array.from(s.y), vx: Float64Array.from(s.vx), vy: Float64Array.from(s.vy) });

// Posados (y absorbidos): siguen al cuerpo sobre el que están, con desplazamiento fijo
function arrastrarPosados(posado, despl, s) {
  for (let i = 0; i < posado.length; i++) {
    const j = posado[i];
    if (j < 0) continue;
    s.x[i] = s.x[j] + despl[2 * i]; s.y[i] = s.y[j] + despl[2 * i + 1];
    s.vx[i] = s.vx[j]; s.vy[i] = s.vy[j];
  }
}

/**
 * Avanza el estado h segundos. metodo: 0 simpléctico (el de la escena), 1 adaptativo.
 * Puro: devuelve un estado nuevo, o null si el adaptativo no pudo seguir.
 */
function avanzar(cfg, simplectico, metodo, posado, despl, s0, h, presupuesto) {
  if (!(h > 0)) return copiar(s0);
  if (metodo === 1) {
    const n = cfg.n, y = new Float64Array(4 * n);
    y.set(s0.x, 0); y.set(s0.y, n); y.set(s0.vx, 2 * n); y.set(s0.vy, 3 * n);
    const r = bulirschStoer(cfg, y, h, presupuesto);
    if (!r) return null;
    const s = { x: r.slice(0, n), y: r.slice(n, 2 * n), vx: r.slice(2 * n, 3 * n), vy: r.slice(3 * n) };
    arrastrarPosados(posado, despl, s);
    return s;
  }
  const s = copiar(s0);
  SIMPLECTICOS[simplectico](cfg, s, h);
  arrastrarPosados(posado, despl, s);
  return s;
}

/**
 * ¿Hace falta el adaptativo en este paso? Sí si para algún par que
 * interactúa el paso supera η·√(d³/μ), con d la menor distancia del paso
 * (en movimiento rectilíneo relativo: un sobrevuelo rápido no se salta).
 */
function encuentroCercano(cfg, s, h, eta) {
  const { n, mu, movil, activo } = cfg;
  for (let i = 0; i < n; i++) {
    if (!activo[i]) continue;
    for (let j = i + 1; j < n; j++) {
      if (!activo[j] || (mu[i] === 0 && mu[j] === 0) || (!movil[i] && !movil[j])) continue;
      const rx = s.x[j] - s.x[i], ry = s.y[j] - s.y[i], vx = s.vx[j] - s.vx[i], vy = s.vy[j] - s.vy[i];
      const vv = vx * vx + vy * vy, tau = vv > 0 ? Math.min(h, Math.max(0, -(rx * vx + ry * vy) / vv)) : 0;
      const dx = rx + vx * tau, dy = ry + vy * tau, d2 = dx * dx + dy * dy;
      // h > η √(d³/μ)  ⇔  h²μ > η² d³
      if (h * h * (mu[i] + mu[j]) > eta * eta * d2 * Math.sqrt(d2)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Muestras (almacén que crece)
// ---------------------------------------------------------------------------
class Almacen {
  constructor(n) { this.n = n; this.cap = 1024; this.m = 0; this.t = new Float64Array(this.cap); this.metodo = new Uint8Array(this.cap); this.d = [0, 1, 2, 3].map(() => new Float64Array(this.cap * n)); }
  /** @param {number} t @param {EstadoN} s */
  push(t, s) {
    if (this.m === this.cap) {
      this.cap *= 2;
      const t2 = new Float64Array(this.cap); t2.set(this.t); this.t = t2;
      const m2 = new Uint8Array(this.cap); m2.set(this.metodo); this.metodo = m2;
      this.d = this.d.map(a => { const b = new Float64Array(this.cap * this.n); b.set(a); return b; });
    }
    const k = this.m++, o = k * this.n;
    this.t[k] = t;
    this.d[0].set(s.x, o); this.d[1].set(s.y, o); this.d[2].set(s.vx, o); this.d[3].set(s.vy, o);
    return k;
  }
}

// ---------------------------------------------------------------------------
// Simulación
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ImpulsoN
 * @property {number} cuerpo Índice del cuerpo
 * @property {number} [t]    Instante (s), si el impulso es a una hora
 * @property {'periapsis'|'apoapsis'} [evento] Si el impulso es en un ápside
 * @property {number} [n=1]  Ocurrencia del ápside, contada desde que el impulso queda armado (al dispararse todos los impulsos anteriores del mismo cuerpo)
 * @property {[number, number]} dv [prógrado, radial hacia fuera] respecto del primario (m/s), o [dvx, dvy] con marco 'xy'
 * @property {'orbital'|'xy'} [marco='orbital']
 * @property {string} [nombre]
 */

/**
 * @typedef {Object} EscenaN
 * @property {CuerpoN[]} cuerpos
 * @property {number} duracion Tiempo simulado (s)
 * @property {number} dt Separación máxima entre muestras (s); es el paso del simpléctico
 * @property {'auto'|'adaptativo'|'yoshida4'|'verlet'} [integrador='auto']
 * @property {number} [tolerancia=1e-12] Tolerancia relativa del adaptativo
 * @property {number} [eta=0.05] Umbral del modo automático: paso / tiempo dinámico
 * @property {ImpulsoN[]} [impulsos]
 * @property {boolean} [apsides=true] @property {boolean} [vueltas=true] @property {boolean} [impactos=true]
 * @property {number} [excentricidadMinima=1e-6] Por debajo, la órbita se trata como circular (sin ápsides)
 * @property {number} [maxEvaluaciones=3e7] Presupuesto de evaluaciones de las fuerzas
 */

/**
 * @typedef {Object} EventoN
 * @property {number} t
 * @property {'periapsis'|'apoapsis'|'vuelta'|'impacto'|'impulso'} tipo
 * @property {string} nombre
 * @property {number} cuerpo
 * @property {number} otro  Primario (ápsides, vueltas, impulsos) o el cuerpo contra el que choca
 * @property {number} x @property {number} y @property {number} vx @property {number} vy  Estado absoluto (después del impulso, en los impulsos)
 * @property {number} r  Distancia al otro cuerpo (m)
 * @property {number} v  Rapidez relativa al otro cuerpo (m/s)
 * @property {number} [n] Número de vuelta
 * @property {boolean} [fusion] El choque fundió dos cuerpos masivos
 * @property {number} [impulso] Índice del impulso en la escena
 * @property {[number, number]} [dv] Δv aplicado (x, y)
 * @property {number} [dvModulo]
 */

const INTEGRADORES_OK = ['auto', 'adaptativo', 'yoshida4', 'verlet'];
const finito = v => typeof v === 'number' && Number.isFinite(v);

/** Comprueba que la escena describe una situación física; lanza si no. @param {EscenaN} e */
function validar(e) {
  if (!e || !Array.isArray(e.cuerpos) || !e.cuerpos.length) throw new Error('La escena no tiene cuerpos.');
  if (!(finito(e.duracion) && e.duracion >= 0)) throw new Error('La duración debe ser un número no negativo.');
  if (!(finito(e.dt) && e.dt > 0)) throw new Error('El paso debe ser positivo.');
  if (e.integrador != null && !INTEGRADORES_OK.includes(e.integrador)) throw new Error(`Integrador desconocido: ${e.integrador}`);
  e.cuerpos.forEach((c, i) => {
    for (const k of ['x', 'y', 'vx', 'vy']) if (!finito(c[k])) throw new Error(`El cuerpo ${i + 1} tiene una posición o una velocidad no válida.`);
    if (c.masa != null && !(finito(c.masa) && c.masa >= 0)) throw new Error(`La masa del cuerpo ${i + 1} no es válida.`);
    if (c.mu != null && !(finito(c.mu) && c.mu >= 0)) throw new Error(`El parámetro GM del cuerpo ${i + 1} no es válido.`);
    if (c.radio != null && !(finito(c.radio) && c.radio >= 0)) throw new Error(`El radio del cuerpo ${i + 1} no es válido.`);
  });
  (e.impulsos || []).forEach((p, k) => {
    if (!Number.isInteger(p.cuerpo) || p.cuerpo < 0 || p.cuerpo >= e.cuerpos.length) throw new Error(`El impulso ${k + 1} no indica un cuerpo de la escena.`);
    if (!Array.isArray(p.dv) || !finito(p.dv[0]) || !finito(p.dv[1])) throw new Error(`El impulso ${k + 1} no tiene un Δv válido.`);
    if (p.evento != null && p.evento !== 'periapsis' && p.evento !== 'apoapsis') throw new Error(`El impulso ${k + 1} tiene un evento desconocido.`);
    if (p.evento == null && !(finito(p.t) && p.t >= 0)) throw new Error(`El impulso ${k + 1} necesita un instante t ≥ 0 o un evento.`);
  });
}

/**
 * Simula N cuerpos con impulsos programados. Guarda una muestra cada dt
 * como mucho (y dos en cada impulso o choque: antes y después), los eventos
 * localizados y los tramos en que cambia la configuración (choques).
 * @param {EscenaN} escena
 */
export function simularSistema(escena) {
  validar(escena);
  const n = escena.cuerpos.length;
  const integrador = escena.integrador ?? 'auto';
  const simplectico = integrador === 'verlet' ? 'verlet' : 'yoshida4';
  const eta = escena.eta ?? 0.05, presupuesto = escena.maxEvaluaciones ?? 3e7;
  const dur = escena.duracion;
  const N0 = dur > 0 ? Math.max(1, Math.ceil(dur / escena.dt - 1e-9)) : 0, h0 = N0 ? dur / N0 : escena.dt;
  const masa = Float64Array.from(escena.cuerpos.map(masaDe)), radio = Float64Array.from(escena.cuerpos.map(c => c.radio ?? 0));
  /** @type {ConfigN} */
  const cfg = {
    n, mu: Float64Array.from(escena.cuerpos.map(muDe)), movil: Uint8Array.from(escena.cuerpos.map(c => (c.fijo ? 0 : 1))),
    activo: new Uint8Array(n).fill(1), ax: new Float64Array(n), ay: new Float64Array(n), tol: escena.tolerancia ?? 1e-12, cuenta: { n: 0 },
  };
  const fijo = Uint8Array.from(escena.cuerpos.map(c => (c.fijo ? 1 : 0)));
  const posado = new Int32Array(n).fill(-1), despl = new Float64Array(2 * n);
  /** @type {EstadoN} */
  let s = {
    x: Float64Array.from(escena.cuerpos.map(c => c.x)), y: Float64Array.from(escena.cuerpos.map(c => c.y)),
    vx: Float64Array.from(escena.cuerpos.map(c => (c.fijo ? 0 : c.vx))), vy: Float64Array.from(escena.cuerpos.map(c => (c.fijo ? 0 : c.vy))),
  };
  const lista = st => Array.from({ length: n }, (_, i) => ({ x: st.x[i], y: st.y[i] }));
  const pedidos = escena.cuerpos.map(c => c.primario);
  const prim = primarios(escena.cuerpos.map((c, i) => ({ mu: cfg.mu[i], primario: pedidos[i] })), lista(s));
  // μ del movimiento relativo: si el primario está fijo, no retrocede
  const muRel = (i, p) => cfg.mu[p] + (cfg.movil[p] || posado[p] >= 0 ? cfg.mu[i] : 0);
  const relativo = (st, i, j) => [st.x[i] - st.x[j], st.y[i] - st.y[j], st.vx[i] - st.vx[j], st.vy[i] - st.vy[j]];

  // Tramos: configuración constante a partir de la muestra k
  const tramos = [];
  const nuevoTramo = k => tramos.push({ k, mu: Float64Array.from(cfg.mu), masa: Float64Array.from(masa), radio: Float64Array.from(radio), movil: Uint8Array.from(cfg.movil), activo: Uint8Array.from(cfg.activo), posado: Int32Array.from(posado), despl: Float64Array.from(despl), primario: Int32Array.from(prim) });

  /** @type {EventoN[]} */
  const eventos = [];
  const registrar = (tipo, nombre, i, j, st, t, extra = {}) => {
    const [dx, dy, dvx, dvy] = j >= 0 ? relativo(st, i, j) : [st.x[i], st.y[i], st.vx[i], st.vy[i]];
    eventos.push({ t, tipo, nombre, cuerpo: i, otro: j, x: st.x[i], y: st.y[i], vx: st.vx[i], vy: st.vy[i], r: Math.hypot(dx, dy), v: Math.hypot(dvx, dvy), ...extra });
  };

  // Impulsos: los de evento se arman al dispararse los anteriores del mismo cuerpo
  const impulsos = (escena.impulsos || []).map((p, k) => ({ ...p, k, n: Math.max(1, Math.round(p.n ?? 1)), disparado: false, cuenta: 0 }));
  const armado = q => !q.disparado && impulsos.every(o => o.k >= q.k || o.cuerpo !== q.cuerpo || o.disparado);
  const dvTotal = new Float64Array(n);
  const disparados = [];

  // Detectores: f(estado) cuyo cambio de signo marca el evento
  let detectores = [];
  const umbralE = escena.excentricidadMinima ?? 1e-6;
  function detectoresDe(i, st, inicio) {
    const r = [];
    const p = prim[i];
    if (!cfg.activo[i] || !cfg.movil[i] || p < 0) return r;
    const [dx, dy, dvx, dvy] = relativo(st, i, p), mu = muRel(i, p);
    if (!(mu > 0)) return r;
    const el = elementosOrbitales(mu, [dx, dy], [dvx, dvy]);
    if (el.tipo === 'radial') return r;
    if (escena.apsides ?? true) {
      if (el.e > umbralE) {
        const enApside = Math.abs(dx * dvx + dy * dvy) <= 1e-9 * el.r * el.v;
        r.push({ i, j: p, tipo: 'apside', dir: 0, cero: enApside, f: q => { const [a, b, c, d] = relativo(q, i, p); return a * c + b * d; } });
        if (enApside && inicio) {
          const tipo = el.r <= el.p ? 'periapsis' : 'apoapsis';
          registrar(tipo, tipo === 'periapsis' ? 'Periapsis' : 'Apoapsis', i, p, st, 0);
        }
      }
    }
    if (escena.vueltas ?? true) {
      const L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, sg = el.sentido;
      r.push({ i, j: p, tipo: 'vuelta', dir: 1, cero: true, ux, uy, cuenta: 0, f: q => { const [a, b] = relativo(q, i, p); return sg * (ux * b - uy * a); } });
    }
    return r;
  }
  function detectoresImpacto(i) {
    const r = [];
    if (!(escena.impactos ?? true) || !cfg.activo[i]) return r;
    for (let j = 0; j < n; j++) {
      if (j === i || !cfg.activo[j]) continue;
      if (cfg.mu[i] === 0 && cfg.mu[j] === 0) continue;
      // Un par masivo se vigila una vez (i < j); una partícula de prueba, contra cada masivo
      if (cfg.mu[i] > 0 && cfg.mu[j] > 0 && j < i) continue;
      if (cfg.mu[i] > 0 && cfg.mu[j] === 0) continue;
      if (posado[i] >= 0 || (!cfg.movil[i] && !cfg.movil[j])) continue;
      const suma = radio[i] + radio[j];
      if (!(suma > 0)) continue;
      r.push({ i, j, tipo: 'impacto', dir: -1, cero: false, f: q => Math.hypot(q.x[i] - q.x[j], q.y[i] - q.y[j]) - (radio[i] + radio[j]) });
    }
    return r;
  }
  // afectados: cuerpos cuyos detectores se rehacen (null: todos, al empezar)
  function rehacerDetectores(st, afectados) {
    if (afectados) detectores = detectores.filter(d => !afectados.has(d.i) && !afectados.has(d.j));
    for (let i = 0; i < n; i++) {
      if (afectados && !afectados.has(i)) continue;
      detectores.push(...detectoresDe(i, st, !afectados));
    }
    // Los de impacto se rehacen todos (dependen de quién sigue activo y de los radios)
    detectores = detectores.filter(d => d.tipo !== 'impacto');
    for (let i = 0; i < n; i++) detectores.push(...detectoresImpacto(i));
  }
  rehacerDetectores(s, null);
  const valoresDe = st => detectores.map(d => { if (d.cero) { d.cero = false; return 0; } return d.f(st); });

  const M = new Almacen(n);
  nuevoTramo(0);
  let incompleta = null;

  // Aplica un impulso al estado st (se modifica) en el instante te
  function disparar(q, st, te) {
    const i = q.cuerpo, p = prim[i];
    const baseP = p >= 0 ? p : -1;
    const [dx, dy, dvx, dvy] = baseP >= 0 ? relativo(st, i, baseP) : [st.x[i], st.y[i], st.vx[i], st.vy[i]];
    const dv = q.marco === 'xy' ? [q.dv[0], q.dv[1]] : dvAXY([dx, dy], [dvx, dvy], q.dv);
    let cambiaConfig = false;
    if (!cfg.activo[i]) { q.disparado = true; return false; }
    if (posado[i] >= 0) {
      // Despega del cuerpo sobre el que estaba
      posado[i] = -1; cfg.movil[i] = fijo[i] ? 0 : 1; cambiaConfig = true;
    }
    if (cfg.movil[i]) { st.vx[i] += dv[0]; st.vy[i] += dv[1]; }
    q.disparado = true;
    const mod = Math.hypot(dv[0], dv[1]);
    dvTotal[i] += mod;
    disparados.push({ impulso: q.k, t: te, cuerpo: i, dv, dvModulo: mod });
    registrar('impulso', q.nombre || 'Impulso', i, baseP, st, te, { impulso: q.k, dv, dvModulo: mod });
    return cambiaConfig;
  }

  // Choque entre i y j en el estado st (se modifica)
  function chocar(i, j, st, te) {
    if (cfg.mu[i] === 0) {
      // Partícula de prueba: se posa y sigue al otro
      registrar('impacto', 'Impacto con la superficie', i, j, st, te);
      posado[i] = j; cfg.movil[i] = 0;
      despl[2 * i] = st.x[i] - st.x[j]; despl[2 * i + 1] = st.y[i] - st.y[j];
      st.vx[i] = st.vx[j]; st.vy[i] = st.vy[j];
      return new Set([i]);
    }
    // Dos masivos: se funden en el mayor (choque perfectamente inelástico)
    const a = cfg.mu[i] > cfg.mu[j] || (cfg.mu[i] === cfg.mu[j] && i < j) ? i : j, b = a === i ? j : i;
    registrar('impacto', 'Choque y fusión', b, a, st, te, { fusion: true });
    const ma = masa[a], mb = masa[b], Mt = ma + mb;
    if (!fijo[a]) {
      if (Mt > 0) {
        st.x[a] = (ma * st.x[a] + mb * st.x[b]) / Mt; st.y[a] = (ma * st.y[a] + mb * st.y[b]) / Mt;
        st.vx[a] = (ma * st.vx[a] + mb * st.vx[b]) / Mt; st.vy[a] = (ma * st.vy[a] + mb * st.vy[b]) / Mt;
      }
    }
    masa[a] = Mt; masa[b] = 0;
    cfg.mu[a] += cfg.mu[b]; cfg.mu[b] = 0;
    radio[a] = Math.cbrt(radio[a] ** 3 + radio[b] ** 3); radio[b] = 0;
    cfg.activo[b] = 0; cfg.movil[b] = 0;
    posado[b] = a; despl[2 * b] = 0; despl[2 * b + 1] = 0;
    st.x[b] = st.x[a]; st.y[b] = st.y[a]; st.vx[b] = st.vx[a]; st.vy[b] = st.vy[a];
    const afect = new Set([a, b]);
    for (let k = 0; k < n; k++) {
      if (posado[k] === b && k !== b) { posado[k] = a; despl[2 * k] = st.x[k] - st.x[a]; despl[2 * k + 1] = st.y[k] - st.y[a]; afect.add(k); }
      if (prim[k] === b) { prim[k] = a; afect.add(k); }
    }
    // Lo que posado sigue a a toma su nueva velocidad
    arrastrarPosados(posado, despl, st);
    if (prim[a] === b) prim[a] = -1;
    return afect;
  }

  // Impulsos a una hora, ordenados
  const aHora = impulsos.filter(q => q.evento == null).sort((p, q) => p.t - q.t || p.k - q.k);
  let iHora = 0;
  // Los de t = 0 se aplican antes de empezar (muestra antes y después)
  let k0 = M.push(0, s);
  if (aHora.length && aHora[0].t <= 0) {
    s = copiar(s);
    const afect = new Set();
    let cambia = false;
    while (iHora < aHora.length && aHora[iHora].t <= 0) { const q = aHora[iHora++]; cambia = disparar(q, s, 0) || cambia; afect.add(q.cuerpo); }
    k0 = M.push(0, s);
    if (cambia) nuevoTramo(k0);
    rehacerDetectores(s, afect);
  }
  let valores = valoresDe(s);
  let t = 0, tBase = 0, k = 0, h = h0, Nseg = N0, kActual = k0;
  const metodoPaso = (st, paso) => (integrador === 'adaptativo' ? 1 : integrador === 'auto' && encuentroCercano(cfg, st, paso, eta) ? 1 : 0);

  while (k < Nseg) {
    if (cfg.cuenta.n > presupuesto) { incompleta = { t, motivo: 'Se alcanzó el límite de cálculo de la simulación.' }; break; }
    const t0 = t, s0 = s;
    let tFin = tBase + (k + 1) * h;
    // Un impulso a una hora corta el paso
    let corteHora = false;
    if (iHora < aHora.length && aHora[iHora].t > t0 && aHora[iHora].t <= tFin + 1e-12 * Math.max(1, tFin)) {
      if (aHora[iHora].t < tFin) tFin = aHora[iHora].t;
      corteHora = true;
    }
    const paso = tFin - t0;
    const metodo = metodoPaso(s0, paso);
    M.metodo[kActual] = metodo;
    const s1 = avanzar(cfg, simplectico, metodo, posado, despl, s0, paso, presupuesto);
    if (!s1) { incompleta = { t, motivo: cfg.cuenta.n > presupuesto ? 'Se alcanzó el límite de cálculo de la simulación.' : 'Encuentro demasiado cercano: dos cuerpos sin radio casi chocan.' }; break; }
    const en = tau => avanzar(cfg, simplectico, metodo, posado, despl, s0, tau, presupuesto);
    const nuevos = detectores.map(d => d.f(s1));
    // Raíces de los detectores que cambian de signo dentro del paso
    const encontrados = [];
    detectores.forEach((d, q) => {
      if (!cfg.activo[d.i] || posado[d.i] >= 0) return;
      const f0 = valores[q], f1 = nuevos[q];
      const cruza = d.dir > 0 ? (f0 < 0 && f1 >= 0) : d.dir < 0 ? (f0 >= 0 && f1 < 0) : ((f0 < 0 && f1 >= 0) || (f0 > 0 && f1 <= 0));
      if (!cruza) return;
      const g = tau => { const st = en(tau); return st ? d.f(st) : f1; };
      const tau = brent(g, 0, paso, f0, f1, 1e-13 * paso);
      if (d.tipo === 'vuelta') {
        // Solo cuenta el cruce por la dirección inicial (no por la opuesta)
        const st = en(tau);
        if (!st) return;
        const [a, b] = relativo(st, d.i, d.j);
        if (a * d.ux + b * d.uy <= 0) return;
      }
      encontrados.push({ d, tau, sube: f1 > f0 });
    });
    encontrados.sort((p, q) => p.tau - q.tau);
    // El primer corte: un choque o un ápside que dispara un impulso armado
    let corte = null;
    for (const x of encontrados) {
      if (x.d.tipo === 'impacto') { corte = { x, tipo: 'impacto' }; break; }
      if (x.d.tipo === 'apside') {
        const tipo = x.sube ? 'periapsis' : 'apoapsis';
        const q = impulsos.find(o => o.evento === tipo && o.cuerpo === x.d.i && armado(o));
        if (q && q.cuenta + 1 >= q.n) { corte = { x, tipo: 'impulso', q }; break; }
      }
    }
    // Eventos hasta el corte (incluido el ápside que lo provoca)
    for (const x of encontrados) {
      if (corte && x.tau > corte.x.tau) break;
      const { d, tau, sube } = x;
      if (d.tipo === 'impacto') continue;
      const st = en(tau), te = t0 + tau;
      if (!st) continue;
      if (d.tipo === 'apside') {
        const tipo = sube ? 'periapsis' : 'apoapsis';
        registrar(tipo, sube ? 'Periapsis' : 'Apoapsis', d.i, d.j, st, te);
        // Cuenta para el impulso armado de ese cuerpo que espera este ápside
        const q = impulsos.find(o => o.evento === tipo && o.cuerpo === d.i && armado(o));
        if (q && !(corte && corte.q === q && x === corte.x)) q.cuenta++;
      } else if (d.tipo === 'vuelta') { d.cuenta = (d.cuenta ?? 0) + 1; registrar('vuelta', 'Vuelta completa', d.i, d.j, st, te, { n: d.cuenta }); }
      if (x === (corte && corte.x)) break;
    }
    if (corte || corteHora) {
      const tau = corte ? corte.x.tau : paso, te = t0 + tau;
      const st = corte ? en(tau) : s1;
      if (!st) { incompleta = { t, motivo: 'Encuentro demasiado cercano: dos cuerpos sin radio casi chocan.' }; break; }
      M.push(te, st);                                        // antes del cambio
      const post = copiar(st);
      let afect = new Set(), cambiaConfig = false;
      if (corte && corte.tipo === 'impacto') { afect = chocar(corte.x.d.i, corte.x.d.j, post, te); cambiaConfig = true; }
      else if (corte && corte.tipo === 'impulso') { cambiaConfig = disparar(corte.q, post, te); afect.add(corte.q.cuerpo); }
      else {
        while (iHora < aHora.length && aHora[iHora].t <= te + 1e-12 * Math.max(1, te)) { const q = aHora[iHora++]; cambiaConfig = disparar(q, post, te) || cambiaConfig; afect.add(q.cuerpo); }
      }
      s = post; t = te;
      kActual = M.push(t, s);                                // después del cambio
      if (cambiaConfig) nuevoTramo(kActual);
      rehacerDetectores(s, afect);
      valores = valoresDe(s);
      // Se reanuda con pasos iguales hasta el final
      const resto = dur - t;
      if (resto <= 1e-12 * dur) break;
      Nseg = Math.max(1, Math.ceil(resto / h0 - 1e-9)); h = resto / Nseg; tBase = t; k = 0;
      continue;
    }
    s = s1; valores = nuevos; k++; t = tFin;
    kActual = M.push(t, s);
  }
  // El método del último tramo (sin paso posterior) es el del anterior
  if (kActual > 0) M.metodo[kActual] = M.metodo[kActual - 1];

  const m = M.m, T = M.t.slice(0, m);
  const cuerpos = escena.cuerpos.map((c, i) => {
    const X = new Float64Array(m), Y = new Float64Array(m), VX = new Float64Array(m), VY = new Float64Array(m);
    for (let q = 0; q < m; q++) { const o = q * n + i; X[q] = M.d[0][o]; Y[q] = M.d[1][o]; VX[q] = M.d[2][o]; VY[q] = M.d[3][o]; }
    return { nombre: c.nombre, mu: muDe(c), masa: masaDe(c), radio: c.radio ?? 0, prueba: !!c.prueba, fijo: !!c.fijo, x: X, y: Y, vx: VX, vy: VY };
  });
  return {
    t: T, cuerpos, eventos, tramos, metodo: M.metodo.slice(0, m), primario: tramos[0].primario,
    integrador, simplectico, tolerancia: cfg.tol, dt: h0, duracion: T[m - 1], pasos: m - 1,
    evaluaciones: cfg.cuenta.n, dvTotal, impulsos: disparados,
    pendientes: impulsos.filter(q => !q.disparado).map(q => q.k),
    incompleta,
  };
}

/** @typedef {ReturnType<typeof simularSistema>} SimN */

/** Índice de la última muestra con t ≤ tt. @param {SimN} sim @param {number} tt */
export function indiceEn(sim, tt) {
  const T = sim.t;
  let lo = 0, hi = T.length - 1;
  if (tt >= T[hi]) return hi;
  while (hi - lo > 1) { const md = (lo + hi) >> 1; if (T[md] <= tt) lo = md; else hi = md; }
  return lo;
}

/** Configuración (μ, masas, radios, activos, posados, primarios) vigente en la muestra k. @param {SimN} sim @param {number} k */
export function tramoEn(sim, k) {
  let tr = sim.tramos[0];
  for (const x of sim.tramos) { if (x.k <= k) tr = x; else break; }
  return tr;
}

/**
 * Estado de todos los cuerpos en cualquier instante: parte de la última
 * muestra anterior y avanza con el mismo método que la simulación (exacto
 * respecto de ella, no una interpolación).
 * @param {SimN} sim @param {number} t
 * @returns {Array<{x: number, y: number, vx: number, vy: number, activo: boolean, posado: boolean}>}
 */
export function estadoSistema(sim, t) {
  const n = sim.cuerpos.length, lo = indiceEn(sim, t), tr = tramoEn(sim, lo);
  /** @type {ConfigN} */
  const cfg = { n, mu: tr.mu, movil: tr.movil, activo: tr.activo, ax: new Float64Array(n), ay: new Float64Array(n), tol: sim.tolerancia, cuenta: { n: 0 } };
  /** @type {EstadoN} */
  let s = {
    x: Float64Array.from(sim.cuerpos.map(c => c.x[lo])), y: Float64Array.from(sim.cuerpos.map(c => c.y[lo])),
    vx: Float64Array.from(sim.cuerpos.map(c => c.vx[lo])), vy: Float64Array.from(sim.cuerpos.map(c => c.vy[lo])),
  };
  const tau = Math.min(t, sim.duracion) - sim.t[lo];
  if (tau > 0) s = avanzar(cfg, sim.simplectico, sim.metodo[lo], tr.posado, tr.despl, s, tau, Infinity) || s;
  return sim.cuerpos.map((c, i) => ({ x: s.x[i], y: s.y[i], vx: s.vx[i], vy: s.vy[i], activo: !!tr.activo[i], posado: tr.posado[i] >= 0 && !!tr.activo[i] }));
}

/** Estado de la muestra k (sin integrar). @param {SimN} sim @param {number} k */
export function estadoMuestra(sim, k) {
  const tr = tramoEn(sim, k);
  return sim.cuerpos.map((c, i) => ({ x: c.x[k], y: c.y[k], vx: c.vx[k], vy: c.vy[k], activo: !!tr.activo[i], posado: tr.posado[i] >= 0 && !!tr.activo[i] }));
}

// ---------------------------------------------------------------------------
// Cantidades del sistema
// ---------------------------------------------------------------------------

/**
 * Centro de masa de los cuerpos que atraen (μ > 0): las partículas de prueba
 * no cuentan, porque no ejercen fuerza (su momento no se conserva con el resto).
 * @param {{mu: ArrayLike<number>, masa: ArrayLike<number>}} cfg
 * @param {Array<{x: number, y: number, vx: number, vy: number}>} estado
 */
export function centroMasas(cfg, estado) {
  let M = 0, x = 0, y = 0, vx = 0, vy = 0;
  for (let i = 0; i < estado.length; i++) {
    if (!(cfg.mu[i] > 0)) continue;
    const m = cfg.masa[i], s = estado[i];
    M += m; x += m * s.x; y += m * s.y; vx += m * s.vx; vy += m * s.vy;
  }
  return M > 0 ? { x: x / M, y: y / M, vx: vx / M, vy: vy / M, M } : { x: 0, y: 0, vx: 0, vy: 0, M: 0 };
}

/** Momento lineal total de los cuerpos que atraen (kg·m/s). @param {{mu: ArrayLike<number>, masa: ArrayLike<number>}} cfg @param {Array<{vx: number, vy: number}>} estado @returns {[number, number]} */
export function momentoLinealSistema(cfg, estado) {
  let px = 0, py = 0;
  for (let i = 0; i < estado.length; i++) if (cfg.mu[i] > 0) { px += cfg.masa[i] * estado[i].vx; py += cfg.masa[i] * estado[i].vy; }
  return [px, py];
}

/**
 * Energías del sistema: cinética de todos, potencial de cada par en que
 * alguno atrae (las partículas de prueba sienten el potencial de los
 * masivos), con las masas vigentes (tras una fusión, la del absorbido es 0).
 * @param {{mu: ArrayLike<number>, masa: ArrayLike<number>, activo?: ArrayLike<number>}} cfg
 * @param {Array<{x: number, y: number, vx: number, vy: number}>} estado
 */
export function energiaN(cfg, estado) {
  let K = 0, U = 0;
  const n = estado.length;
  for (let i = 0; i < n; i++) {
    if (cfg.activo && !cfg.activo[i]) continue;
    const si = estado[i];
    K += 0.5 * cfg.masa[i] * (si.vx * si.vx + si.vy * si.vy);
    for (let j = i + 1; j < n; j++) {
      if (cfg.activo && !cfg.activo[j]) continue;
      const mi = cfg.mu[i], mj = cfg.mu[j];
      if (!(mi > 0 || mj > 0)) continue;
      const r = Math.hypot(si.x - estado[j].x, si.y - estado[j].y);
      // Par masivo: −G mᵢ mⱼ / r (= −μⱼ mᵢ / r); con una partícula de prueba, −μ m / r del masivo
      U -= (mi > 0 && mj > 0 ? mj * cfg.masa[i] : mj > 0 ? mj * cfg.masa[i] : mi * cfg.masa[j]) / r;
    }
  }
  return { K, U, E: K + U };
}

/** Momento angular total respecto de un punto (kg·m²/s). @param {{masa: ArrayLike<number>, activo?: ArrayLike<number>}} cfg @param {Array<{x: number, y: number, vx: number, vy: number}>} estado @param {[number, number]} [origen] */
export function momentoAngularN(cfg, estado, origen = [0, 0]) {
  let L = 0;
  for (let i = 0; i < estado.length; i++) {
    if (cfg.activo && !cfg.activo[i]) continue;
    const s = estado[i];
    L += cfg.masa[i] * ((s.x - origen[0]) * s.vy - (s.y - origen[1]) * s.vx);
  }
  return L;
}

/**
 * Elementos orbitales del cuerpo i respecto del cuerpo p (su primario), con
 * μ = μp + μi (o μp si p está fijo).
 * @param {{mu: ArrayLike<number>, movil?: ArrayLike<number>}} cfg
 * @param {Array<{x: number, y: number, vx: number, vy: number}>} estado @param {number} i @param {number} p
 */
export function elementosRelativos(cfg, estado, i, p) {
  const a = estado[i], b = estado[p];
  const mu = cfg.mu[p] + (cfg.movil && !cfg.movil[p] ? 0 : cfg.mu[i]);
  return { ...elementosOrbitales(mu, [a.x - b.x, a.y - b.y], [a.vx - b.vx, a.vy - b.vy]), mu };
}
