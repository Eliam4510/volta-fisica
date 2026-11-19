/* ==========================================================================
   Volta — motor de magnetismo e inducción
   Cuatro partes, todas en SI y puras (sin DOM):
   1. Magnetostática en 3D (el plano del lienzo es z = 0 y z sale del
      plano): hilo infinito (exacto), segmento recto (Biot–Savart en forma
      cerrada), espira circular (exacta en todo el espacio con integrales
      elípticas completas; también la suma numérica de Biot–Savart para
      compararla), solenoide finito (lámina de corriente de Derby y Olbert,
      exacta con la integral elíptica generalizada de Bulirsch) o ideal
      (uniforme dentro, nulo fuera), imán como dipolo o como bloque
      magnetizado (el solenoide equivalente) y campo uniforme. Superposición,
      fuerza sobre corrientes (I L × B) y líneas de campo en el plano.
   2. Regiones de campo ideal: B (perpendicular al plano) o E (en el plano)
      uniformes dentro de un polígono de forma libre, con borde nítido; B(t)
      opcional (rampa o senoidal) y E alterno (ciclotrón).
   3. Cargas en E y B con el integrador de Boris en su forma
      deriva-impulso-deriva: la rotación conserva |v| exactamente y, en un
      campo B uniforme, los vértices de la trayectoria quedan sobre la
      circunferencia exacta de radio m·v/(|q|·B). Cada paso usa el campo de
      las regiones en que está la partícula; si el paso cruza un borde, se
      acorta por bisección hasta el cruce (entrada o salida exactas), y los
      impactos con pantallas y placas se localizan con Brent. Selector de
      velocidades, espectrómetro, ciclotrón (E alterno en el hueco), deriva
      E×B y efecto Hall (equilibrio qE = qvB, V_H = I·B/(n·q·t), y un
      transitorio de relajación hacia el equilibrio).
   4. Inducción acoplada: el flujo por un circuito es la suma de B·área de
      la intersección exacta del polígono del circuito con cada región
      (Sutherland–Hodgman contra los triángulos de la región) más el flujo
      exacto de cada hilo del plano (teorema de Green con ln|s|). La fem es
      −dΦ/dt, separada en su parte de movimiento (∮(v × B)·dl, exacta tramo
      a tramo) y su parte de transformador (−∂Φ/∂t). Con R (y L opcional)
      da la corriente, que produce I L × B sobre los tramos móviles; esa
      fuerza entra junto con la gravedad, la fricción y la fuerza aplicada
      en un único sistema de ecuaciones integrado con Dormand–Prince
      (núcleo). La velocidad terminal y el balance de energía (trabajo
      mecánico = calor de Joule + ΔK + ΔU) salen solos. Rieles con una o
      dos barras (inclinados, barra oblicua), espira rígida móvil, conductor
      abierto y bobina giratoria con ω impuesta (generador).
   Régimen cuasiestático: sin ondas ni radiación; la partícula no siente la
   fem inducida de un B(t) (las regiones con B variable son para la
   inducción).
   Lo usan las pantallas de Magnetismo e inducción y las pruebas
   (pruebas/magnetismo.test.js).
   ========================================================================== */
import { integrar, interpolar, brent } from '../nucleo/integradores.js';

const DOS_PI = 2 * Math.PI;

/** Permeabilidad del vacío, μ0 = 4π × 10⁻⁷ T·m/A (la del examen). */
export const MU0 = 4e-7 * Math.PI;
/** Carga elemental (C). */
export const CARGA_ELEMENTAL = 1.602176634e-19;
/** Masa del protón (kg). */
export const MASA_PROTON = 1.67262192369e-27;
/** Masa del electrón (kg). */
export const MASA_ELECTRON = 9.1093837015e-31;
/** Unidad de masa atómica (kg). */
export const UMA = 1.6605390666e-27;
/** Gravedad por omisión (m/s²), la del examen. */
export const G_GRAVEDAD = 9.8;

/** Error con un mensaje que dice qué pasa en la escena y cómo arreglarlo. */
export class ErrorMagnetismo extends Error {
  /** @param {string} mensaje */
  constructor(mensaje) { super(mensaje); this.name = 'ErrorMagnetismo'; }
}

/**
 * @typedef {[number, number]} Vec2
 * @typedef {[number, number, number]} Vec3
 */

// ---------------------------------------------------------------------------
// Vectores
// ---------------------------------------------------------------------------
/** @param {ArrayLike<number>} p @returns {Vec3} */
const v3 = p => [p[0], p[1], p[2] ?? 0];
/** @param {Vec3} a @param {Vec3} b @returns {Vec3} */
const mas3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** @param {Vec3} a @param {Vec3} b @returns {Vec3} */
const menos3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** @param {Vec3} a @param {number} k @returns {Vec3} */
const por3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
/** @param {Vec3} a @param {Vec3} b */
const punto3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** @param {Vec3} a @param {Vec3} b @returns {Vec3} */
const cruz3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** @param {Vec3} a */
const norma3 = a => Math.hypot(a[0], a[1], a[2]);
/** @param {Vec3} a @returns {Vec3} */
const unitario3 = a => { const n = norma3(a); return n > 0 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 1]; };
/** Dos vectores unitarios u, w perpendiculares a n con u × w = n. @param {Vec3} n @returns {[Vec3, Vec3]} */
function baseOrtogonal(n) {
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unitario3(cruz3(/** @type {Vec3} */ (a), n));
  return [u, cruz3(n, u)];
}
/** @param {Vec2} a @param {Vec2} b */
const cruz2 = (a, b) => a[0] * b[1] - a[1] * b[0];
/** Dirección en el plano de un ángulo (rad). @param {number} a @returns {Vec2} */
export const direccion = a => [Math.cos(a), Math.sin(a)];

// ---------------------------------------------------------------------------
// Integrales elípticas
// ---------------------------------------------------------------------------

/**
 * Integral elíptica completa generalizada de Bulirsch:
 * cel(kc, p, a, b) = ∫₀^{π/2} (a cos²φ + b sen²φ) / ((cos²φ + p sen²φ) √(cos²φ + kc² sen²φ)) dφ.
 * Convergencia cuadrática (media aritmético-geométrica). K(k) = cel(kc, 1, 1, 1),
 * E(k) = cel(kc, 1, 1, kc²), con kc = √(1 − k²).
 * @param {number} kc módulo complementario (≠ 0)
 * @param {number} p @param {number} a @param {number} b
 */
export function cel(kc, p, a, b) {
  if (kc === 0) return NaN;
  let qc = Math.abs(kc), e = qc, em = 1, f, g, q;
  if (p > 0) { p = Math.sqrt(p); b /= p; }
  else {
    f = qc * qc; q = 1 - f; g = 1 - p; f -= p; q *= b - a * p;
    p = Math.sqrt(f / g); a = (a - b) / g; b = -q / (g * g * p) + a * p;
  }
  for (let i = 0; i < 60; i++) {
    f = a; a += b / p; g = e / p; b += f * g; b += b; p = g + p; g = em; em += qc;
    if (Math.abs(g - qc) <= g * 1e-9) break;
    qc = Math.sqrt(e); qc += qc; e = qc * em;
  }
  return (Math.PI / 2) * (b + a * em) / (em * (em + p));
}

/**
 * Integrales elípticas completas de primera y segunda especie con parámetro m = k².
 * @param {number} m
 * @returns {{K: number, E: number}}
 */
export function elipticas(m) {
  const kc = Math.sqrt(Math.max(0, 1 - m));
  return { K: cel(kc, 1, 1, 1), E: cel(kc, 1, 1, kc * kc) };
}

// ---------------------------------------------------------------------------
// Variación temporal (regiones B(t), hilos I(t))
// ---------------------------------------------------------------------------

/**
 * Variación temporal de una magnitud: valor(t) = base + rampa o senoide.
 * - rampa: crece con `pendiente` (unidad/s) entre `inicio` y `fin` (s);
 * - senoidal: amplitud · sen(2π·frecuencia·t + fase).
 * @typedef {Object} Variacion
 * @property {'constante'|'rampa'|'senoidal'} tipo
 * @property {number} [pendiente]
 * @property {number} [inicio]
 * @property {number} [fin]
 * @property {number} [amplitud]
 * @property {number} [frecuencia]
 * @property {number} [fase]
 */

/**
 * Valor y derivada temporal de una magnitud variable en el instante t.
 * @param {number} base @param {Variacion | null | undefined} variacion @param {number} t
 * @returns {[number, number]} [valor, derivada]
 */
export function valorVariable(base, variacion, t) {
  if (!variacion || variacion.tipo === 'constante') return [base, 0];
  if (variacion.tipo === 'rampa') {
    const a = variacion.inicio ?? 0, b = variacion.fin ?? Infinity, k = variacion.pendiente ?? 0;
    const tt = Math.min(Math.max(t, a), b);
    return [base + k * (tt - a), t > a && t < b ? k : 0];
  }
  if (variacion.tipo === 'senoidal') {
    const A = variacion.amplitud ?? 0, w = DOS_PI * (variacion.frecuencia ?? 0), f = variacion.fase ?? 0;
    return [base + A * Math.sin(w * t + f), A * w * Math.cos(w * t + f)];
  }
  return [base, 0];
}

// ---------------------------------------------------------------------------
// 1 · Magnetostática
// ---------------------------------------------------------------------------

/**
 * Fuente de campo magnético. Todas las posiciones en m, corrientes en A.
 * - hilo: recta infinita por `p` con dirección `dir` (por omisión +z, saliente del plano);
 * - segmento: de `a` a `b` (la corriente va de a a b);
 * - espira: circular, `centro`, `normal` (la corriente gira en sentido antihorario visto desde la punta de la normal), radio `R`, `N` vueltas;
 * - poligonal: espira con forma de polígono cerrado `puntos` (la corriente los recorre en orden), `N` vueltas;
 * - solenoide: `centro`, `eje`, `largo`, radio `R`, vueltas por metro `n`; `ideal`: uniforme dentro y nulo fuera;
 * - iman: `centro`, `eje` (de S a N), `momento` (A·m²); modelo 'dipolo' o 'bloque' (cilindro de `largo` y radio `R` magnetizado);
 * - uniforme: campo `B` (vector).
 * @typedef {Object} FuenteB
 * @property {'hilo'|'segmento'|'espira'|'poligonal'|'solenoide'|'iman'|'uniforme'} tipo
 * @property {number} [I]
 * @property {number[]} [p]
 * @property {number[]} [dir]
 * @property {number[]} [a]
 * @property {number[]} [b]
 * @property {number[]} [centro]
 * @property {number[]} [normal]
 * @property {number[]} [eje]
 * @property {number} [R]
 * @property {number} [N]
 * @property {number} [n]
 * @property {number} [largo]
 * @property {boolean} [ideal]
 * @property {number} [momento]
 * @property {'dipolo'|'bloque'} [modelo]
 * @property {number[][]} [puntos]
 * @property {number[]} [B]
 */

/**
 * Campo de un hilo recto infinito: B = μ0·I/(2π·ρ), tangente a las
 * circunferencias alrededor del hilo (regla de la mano derecha).
 * @param {FuenteB} h @param {ArrayLike<number>} p @returns {Vec3}
 */
export function campoHilo(h, p) {
  const u = unitario3(v3(h.dir ?? [0, 0, 1])), d = menos3(v3(p), v3(h.p ?? [0, 0, 0]));
  const r = menos3(d, por3(u, punto3(d, u))), rho = norma3(r);
  if (rho < 1e-15) return [0, 0, 0];
  return por3(cruz3(u, r), MU0 * (h.I ?? 0) / (DOS_PI * rho * rho));
}

/**
 * Campo de un segmento recto con corriente (Biot–Savart en forma cerrada):
 * B = μ0·I/(4π·ρ) · (cos α₁ − cos α₂), tangente como el del hilo.
 * @param {FuenteB} s @param {ArrayLike<number>} p @returns {Vec3}
 */
export function campoSegmento(s, p) {
  const A = v3(s.a), L = menos3(v3(s.b), A), largo = norma3(L);
  if (!(largo > 0)) return [0, 0, 0];
  const u = por3(L, 1 / largo), d = menos3(v3(p), A), sP = punto3(d, u);
  const r = menos3(d, por3(u, sP)), rho = norma3(r);
  if (rho < 1e-15 * Math.max(1, largo)) return [0, 0, 0];
  const sA = -sP, sB = largo - sP;
  const k = MU0 * (s.I ?? 0) / (4 * Math.PI * rho) * (sB / Math.hypot(sB, rho) - sA / Math.hypot(sA, rho));
  return por3(cruz3(u, r), k / rho);
}

/**
 * Campo en el eje de una espira circular: B = μ0·N·I·R² / (2(R² + z²)^{3/2}).
 * @param {number} R @param {number} I @param {number} z @param {number} [N=1]
 */
export const campoEspiraEje = (R, I, z, N = 1) => MU0 * N * I * R * R / (2 * Math.pow(R * R + z * z, 1.5));

/** Coordenadas locales (z sobre el eje, ρ y su dirección) de p respecto de un centro y un eje. */
function localEje(centro, eje, p) {
  const n = unitario3(v3(eje)), d = menos3(v3(p), v3(centro)), z = punto3(d, n);
  const r = menos3(d, por3(n, z)), rho = norma3(r);
  return { n, z, rho, er: rho > 0 ? por3(r, 1 / rho) : /** @type {Vec3} */ ([0, 0, 0]) };
}

/**
 * Campo exacto de una espira circular en cualquier punto (integrales
 * elípticas completas; Simpson et al., NASA 2001).
 * @param {FuenteB} e @param {ArrayLike<number>} p @returns {Vec3}
 */
export function campoEspira(e, p) {
  const a = e.R, I = (e.I ?? 0) * (e.N ?? 1);
  const { n, z, rho, er } = localEje(e.centro ?? [0, 0, 0], e.normal ?? [0, 0, 1], p);
  const r2 = rho * rho + z * z, a2 = a * a;
  const alfa2 = a2 + r2 - 2 * a * rho, beta2 = a2 + r2 + 2 * a * rho;
  if (alfa2 < 1e-24 * a2) return [0, 0, 0];
  const beta = Math.sqrt(beta2), kc = Math.sqrt(alfa2 / beta2);
  const K = cel(kc, 1, 1, 1), E = cel(kc, 1, 1, kc * kc), C = MU0 * I / Math.PI;
  const Bz = C / (2 * alfa2 * beta) * ((a2 - r2) * E + alfa2 * K);
  const Brho = rho > 1e-9 * a ? C * z / (2 * alfa2 * beta * rho) * ((a2 + r2) * E - alfa2 * K) : 0;
  return mas3(por3(n, Bz), por3(er, Brho));
}

/**
 * Campo de una espira circular por suma numérica de Biot–Savart (regla del
 * trapecio en el ángulo: para un integrando periódico converge
 * exponencialmente). Sirve para validar la forma exacta.
 * @param {FuenteB} e @param {ArrayLike<number>} p @param {number} [m=512] puntos
 * @returns {Vec3}
 */
export function campoEspiraNumerico(e, p, m = 512) {
  const n = unitario3(v3(e.normal ?? [0, 0, 1])), c = v3(e.centro ?? [0, 0, 0]), [u, w] = baseOrtogonal(n), P = v3(p);
  const k = MU0 * (e.I ?? 0) * (e.N ?? 1) / (4 * Math.PI), dphi = DOS_PI / m;
  let B = /** @type {Vec3} */ ([0, 0, 0]);
  for (let i = 0; i < m; i++) {
    const f = i * dphi, cf = Math.cos(f), sf = Math.sin(f);
    const q = mas3(c, mas3(por3(u, e.R * cf), por3(w, e.R * sf)));
    const dl = mas3(por3(u, -e.R * sf * dphi), por3(w, e.R * cf * dphi));
    const r = menos3(P, q), d = norma3(r);
    B = mas3(B, por3(cruz3(dl, r), k / (d * d * d)));
  }
  return B;
}

/**
 * Campo de un polígono cerrado con corriente (suma de segmentos exactos).
 * @param {FuenteB} e @param {ArrayLike<number>} p @returns {Vec3}
 */
export function campoPoligonal(e, p) {
  const pts = e.puntos || [], I = (e.I ?? 0) * (e.N ?? 1);
  let B = /** @type {Vec3} */ ([0, 0, 0]);
  for (let i = 0; i < pts.length; i++) B = mas3(B, campoSegmento({ tipo: 'segmento', a: pts[i], b: pts[(i + 1) % pts.length], I }, p));
  return B;
}

/**
 * Campo en el eje de un solenoide finito (lámina de corriente):
 * B = μ0·n·I/2 · (cos de los extremos): (z + ℓ/2)/√((z + ℓ/2)² + R²) − (z − ℓ/2)/√((z − ℓ/2)² + R²).
 * @param {number} R @param {number} largo @param {number} nI vueltas por metro × corriente @param {number} z
 */
export function campoSolenoideEje(R, largo, nI, z) {
  const b = largo / 2, zp = z + b, zm = z - b;
  return MU0 * nI / 2 * (zp / Math.hypot(zp, R) - zm / Math.hypot(zm, R));
}

/**
 * Campo de un solenoide. Ideal: B = μ0·n·I dentro del cilindro y nulo fuera.
 * Finito: lámina cilíndrica de corriente, exacta en todo punto (Derby y
 * Olbert, Am. J. Phys. 78, 229 (2010)).
 * @param {FuenteB} s @param {ArrayLike<number>} p @returns {Vec3}
 */
export function campoSolenoide(s, p) {
  const a = s.R, b = s.largo / 2, nI = (s.n ?? 0) * (s.I ?? 0);
  const { n, z, rho, er } = localEje(s.centro ?? [0, 0, 0], s.eje ?? [0, 0, 1], p);
  if (s.ideal) return Math.abs(z) < b && rho < a ? por3(n, MU0 * nI) : [0, 0, 0];
  return laminaCilindrica(a, b, MU0 * nI, n, z, rho, er);
}

/**
 * Lámina cilíndrica de radio a, semilargo b y densidad μ0·K (Derby y Olbert).
 * @returns {Vec3}
 */
function laminaCilindrica(a, b, mu0K, n, z, rho, er) {
  const B0 = mu0K / Math.PI, zp = z + b, zm = z - b, ra = rho + a, rm = a - rho;
  const dp = Math.hypot(zp, ra), dm = Math.hypot(zm, ra);
  const kp = Math.hypot(zp, rm) / dp, km = Math.hypot(zm, rm) / dm;
  if (kp < 1e-14 || km < 1e-14) return [0, 0, 0];
  const g = rm / ra;
  const Brho = B0 * (a / dp * cel(kp, 1, 1, -1) - a / dm * cel(km, 1, 1, -1));
  const Bz = B0 * a / ra * (zp / dp * cel(kp, g * g, 1, g) - zm / dm * cel(km, g * g, 1, g));
  return mas3(por3(n, Bz), por3(er, Brho));
}

/**
 * Campo de un dipolo magnético de momento m en el punto r (relativo al dipolo):
 * B = μ0/(4π r³) · (3(m·r̂)r̂ − m).
 * @param {ArrayLike<number>} m @param {ArrayLike<number>} r @returns {Vec3}
 */
export function campoDipolo(m, r) {
  const R = v3(r), M = v3(m), d = norma3(R);
  if (!(d > 0)) return [0, 0, 0];
  const rh = por3(R, 1 / d), k = MU0 / (4 * Math.PI * d * d * d);
  return por3(menos3(por3(rh, 3 * punto3(M, rh)), M), k);
}

/**
 * Campo de un imán de barra: dipolo puntual o cilindro magnetizado (su
 * solenoide equivalente, con n·I = M = momento/volumen). Lejos de él ambos
 * coinciden.
 * @param {FuenteB} i @param {ArrayLike<number>} p @returns {Vec3}
 */
export function campoIman(i, p) {
  const n = unitario3(v3(i.eje ?? [1, 0, 0])), c = v3(i.centro ?? [0, 0, 0]), m = i.momento ?? 0;
  if (i.modelo !== 'bloque') return campoDipolo(por3(n, m), menos3(v3(p), c));
  const a = i.R, largo = i.largo, M = m / (Math.PI * a * a * largo);
  const L = localEje(c, n, p);
  return laminaCilindrica(a, largo / 2, MU0 * M, L.n, L.z, L.rho, L.er);
}

/** Campo de una fuente cualquiera. @param {FuenteB} f @param {ArrayLike<number>} p @returns {Vec3} */
export function campoFuente(f, p) {
  switch (f.tipo) {
    case 'hilo': return campoHilo(f, p);
    case 'segmento': return campoSegmento(f, p);
    case 'espira': return campoEspira(f, p);
    case 'poligonal': return campoPoligonal(f, p);
    case 'solenoide': return campoSolenoide(f, p);
    case 'iman': return campoIman(f, p);
    case 'uniforme': return v3(f.B ?? [0, 0, 0]);
    default: return [0, 0, 0];
  }
}

/**
 * Campo total (superposición) de un conjunto de fuentes.
 * @param {FuenteB[]} fuentes @param {ArrayLike<number>} p @param {number} [excluir=-1] índice de una fuente que no cuenta
 * @returns {Vec3}
 */
export function campoB(fuentes, p, excluir = -1) {
  let B = /** @type {Vec3} */ ([0, 0, 0]);
  for (let i = 0; i < fuentes.length; i++) if (i !== excluir) B = mas3(B, campoFuente(fuentes[i], p));
  return B;
}

/**
 * Fuerza por unidad de largo sobre el hilo infinito k debida a las demás
 * fuentes: f = I·û × B (el campo de los demás hilos paralelos es uniforme a
 * lo largo de él). Dos hilos paralelos: μ0·I₁·I₂/(2π·d), atractiva si las
 * corrientes van en el mismo sentido.
 * @param {FuenteB[]} fuentes @param {number} k @returns {Vec3} N/m
 */
export function fuerzaPorLargo(fuentes, k) {
  const h = fuentes[k], u = unitario3(v3(h.dir ?? [0, 0, 1]));
  return por3(cruz3(u, campoB(fuentes, h.p ?? [0, 0, 0], k)), h.I ?? 0);
}

/**
 * Fuerza sobre un segmento con corriente en el campo de las fuentes
 * (cuadratura de Gauss–Legendre de I dl × B a lo largo del segmento).
 * @param {FuenteB[]} fuentes @param {ArrayLike<number>} a @param {ArrayLike<number>} b @param {number} I
 * @param {{excluir?: number, puntos?: number}} [o]
 * @returns {Vec3} N
 */
export function fuerzaSegmento(fuentes, a, b, I, o = {}) {
  const A = v3(a), L = menos3(v3(b), A), m = o.puntos ?? 24;
  // Nodos de Gauss–Legendre en [0, 1] por subdivisión en m tramos con 2 puntos (robusto cerca de otros hilos)
  const g = 0.5 / Math.sqrt(3);
  let F = /** @type {Vec3} */ ([0, 0, 0]);
  for (let i = 0; i < m; i++) {
    for (const s of [(i + 0.5 - g) / m, (i + 0.5 + g) / m]) {
      const B = campoB(fuentes, mas3(A, por3(L, s)), o.excluir ?? -1);
      F = mas3(F, por3(cruz3(L, B), I / (2 * m)));
    }
  }
  return F;
}

/**
 * Fuerza de Lorentz F = q(E + v × B).
 * @param {number} q @param {ArrayLike<number>} v @param {ArrayLike<number>} E @param {ArrayLike<number>} B @returns {Vec3}
 */
export const fuerzaLorentz = (q, v, E, B) => por3(mas3(v3(E), cruz3(v3(v), v3(B))), q);

/**
 * Ángulo (rad) al que apunta una brújula en el plano: el de la componente de
 * B en el plano; null si es despreciable frente a |B|.
 * @param {FuenteB[]} fuentes @param {ArrayLike<number>} p
 */
export function anguloBrujula(fuentes, p) {
  const B = campoB(fuentes, p), bp = Math.hypot(B[0], B[1]);
  if (!(bp > 1e-6 * norma3(B)) || !(bp > 0)) return null;
  return Math.atan2(B[1], B[0]);
}

/**
 * Línea de campo en el plano z = 0 a partir de p0 (Runge–Kutta 4 sobre la
 * dirección de la componente de B en el plano).
 * @param {(p: Vec2) => number[]} campo2 campo en el plano: [Bx, By, …]
 * @param {Vec2} p0
 * @param {{paso: number, maxPasos?: number, caja?: number[], evitar?: number[][], sentido?: number}} o
 *   caja: [x0, x1, y0, y1]; evitar: [[x, y, r]] (singularidades: hilos)
 * @returns {{pts: Vec2[], cerrada: boolean, fin: string}}
 */
export function trazarLinea(campo2, p0, o) {
  const h = o.paso, max = o.maxPasos ?? 4000, s = o.sentido ?? 1, caja = o.caja, evitar = o.evitar || [];
  const dir = p => { const B = campo2(p), m = Math.hypot(B[0], B[1]); return m > 0 && Number.isFinite(m) ? [s * B[0] / m, s * B[1] / m] : null; };
  /** @type {Vec2[]} */ const pts = [[p0[0], p0[1]]];
  let p = /** @type {Vec2} */ ([p0[0], p0[1]]), recorrido = 0;
  for (let i = 0; i < max; i++) {
    const k1 = dir(p); if (!k1) return { pts, cerrada: false, fin: 'nulo' };
    const k2 = dir([p[0] + h / 2 * k1[0], p[1] + h / 2 * k1[1]]); if (!k2) return { pts, cerrada: false, fin: 'nulo' };
    const k3 = dir([p[0] + h / 2 * k2[0], p[1] + h / 2 * k2[1]]); if (!k3) return { pts, cerrada: false, fin: 'nulo' };
    const k4 = dir([p[0] + h * k3[0], p[1] + h * k3[1]]); if (!k4) return { pts, cerrada: false, fin: 'nulo' };
    p = [p[0] + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), p[1] + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])];
    pts.push(p); recorrido += h;
    if (recorrido > 4 * h && Math.hypot(p[0] - p0[0], p[1] - p0[1]) < 0.75 * h) { pts.push([p0[0], p0[1]]); return { pts, cerrada: true, fin: 'cerrada' }; }
    if (caja && (p[0] < caja[0] || p[0] > caja[1] || p[1] < caja[2] || p[1] > caja[3])) return { pts, cerrada: false, fin: 'caja' };
    for (const [x, y, r] of evitar) if (Math.hypot(p[0] - x, p[1] - y) < r) return { pts, cerrada: false, fin: 'fuente' };
  }
  return { pts, cerrada: false, fin: 'pasos' };
}

/**
 * Líneas de campo en el plano desde una lista de semillas (en orden de
 * prioridad). Una semilla que cae a menos de `separacion` de una línea ya
 * trazada se omite, así no se dibuja dos veces la misma línea. Cada línea
 * se traza hacia adelante y hacia atrás.
 * @param {FuenteB[]} fuentes
 * @param {Vec2[]} semillas
 * @param {{paso: number, separacion: number, maxPasos?: number, caja?: number[], evitar?: number[][]}} o
 * @returns {Array<{pts: Vec2[], cerrada: boolean}>} puntos en el sentido de B
 */
export function lineasCampo(fuentes, semillas, o) {
  const campo2 = p => campoB(fuentes, [p[0], p[1], 0]);
  const sep = o.separacion, celda = sep, rejilla = new Map(), lineas = [];
  const clave = (i, j) => i * 73856093 ^ j * 19349663;
  const marcar = pts => { for (const p of pts) { const i = Math.floor(p[0] / celda), j = Math.floor(p[1] / celda), k = clave(i, j); if (!rejilla.has(k)) rejilla.set(k, []); rejilla.get(k).push(p); } };
  const cerca = (p, d) => {
    const i = Math.floor(p[0] / celda), j = Math.floor(p[1] / celda);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = rejilla.get(clave(i + a, j + b)); if (l) for (const q of l) if (Math.hypot(q[0] - p[0], q[1] - p[1]) < d) return true; }
    return false;
  };
  for (const s of semillas) {
    if (cerca(s, sep)) continue;
    const ida = trazarLinea(campo2, s, { ...o, sentido: 1 });
    let pts = ida.pts, cerrada = ida.cerrada;
    if (!cerrada) { const vuelta = trazarLinea(campo2, s, { ...o, sentido: -1 }); pts = vuelta.pts.slice(1).reverse().concat(pts); }
    if (pts.length < 3) continue;
    marcar(pts); lineas.push({ pts, cerrada });
  }
  return lineas;
}

// ---------------------------------------------------------------------------
// Polígonos: orientación, contención, triangulación, recorte e intersección
// ---------------------------------------------------------------------------

/** Área con signo (positiva si el polígono va en sentido antihorario). @param {Vec2[]} pts */
export function areaPoligono(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

/** Copia del polígono en sentido antihorario. @param {Vec2[]} pts @returns {Vec2[]} */
export function antihorario(pts) {
  const c = pts.map(p => /** @type {Vec2} */ ([p[0], p[1]]));
  return areaPoligono(c) < 0 ? c.reverse() : c;
}

/** Punto dentro de un polígono (regla par-impar). @param {Vec2[]} pts @param {ArrayLike<number>} p */
export function contiene(pts, p) {
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) dentro = !dentro;
  }
  return dentro;
}

/**
 * Triangulación de un polígono simple por recorte de orejas.
 * @param {Vec2[]} pts antihorario
 * @returns {Vec2[][]} triángulos antihorarios
 */
export function triangular(pts) {
  const idx = pts.map((_, i) => i), tris = [];
  const convexo = (a, b, c) => cruz2([b[0] - a[0], b[1] - a[1]], [c[0] - b[0], c[1] - b[1]]) > 0;
  const dentroTri = (p, a, b, c) => cruz2([b[0] - a[0], b[1] - a[1]], [p[0] - a[0], p[1] - a[1]]) >= 0
    && cruz2([c[0] - b[0], c[1] - b[1]], [p[0] - b[0], p[1] - b[1]]) >= 0 && cruz2([a[0] - c[0], a[1] - c[1]], [p[0] - c[0], p[1] - c[1]]) >= 0;
  let guardia = 0;
  while (idx.length > 3 && guardia++ < 10000) {
    let hecho = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = pts[ia], b = pts[ib], c = pts[ic];
      if (!convexo(a, b, c)) continue;
      if (idx.some(k => k !== ia && k !== ib && k !== ic && dentroTri(pts[k], a, b, c))) continue;
      tris.push([a, b, c]); idx.splice(i, 1); hecho = true; break;
    }
    if (!hecho) break;
  }
  if (idx.length === 3) tris.push(idx.map(k => pts[k]));
  return tris;
}

/**
 * Recorte de Sutherland–Hodgman de un polígono (cualquiera) contra un
 * polígono convexo antihorario.
 * @param {Vec2[]} sujeto @param {Vec2[]} convexo @returns {Vec2[]}
 */
export function recortarConvexo(sujeto, convexo) {
  let salida = sujeto;
  for (let i = 0; i < convexo.length && salida.length; i++) {
    const a = convexo[i], b = convexo[(i + 1) % convexo.length], ab = [b[0] - a[0], b[1] - a[1]];
    const lado = p => cruz2(/** @type {Vec2} */ (ab), [p[0] - a[0], p[1] - a[1]]);
    const entrada = salida; salida = [];
    for (let j = 0; j < entrada.length; j++) {
      const p = entrada[j], q = entrada[(j + 1) % entrada.length], lp = lado(p), lq = lado(q);
      if (lp >= 0) salida.push(p);
      if ((lp >= 0) !== (lq >= 0)) { const t = lp / (lp - lq); salida.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
    }
  }
  return salida;
}

/**
 * Área de la intersección de dos polígonos simples (exacta): P se recorta
 * contra cada triángulo de Q.
 * @param {Vec2[]} P antihorario @param {Vec2[][]} triangulosQ (de `triangular`)
 */
export function areaInterseccion(P, triangulosQ) {
  let a = 0;
  for (const T of triangulosQ) { const r = recortarConvexo(P, T); if (r.length >= 3) a += areaPoligono(r); }
  return a;
}

/**
 * Largo de un segmento a→b que queda dentro de un polígono (no convexo
 * también). Los tramos se separan en los cruces con los bordes y cada uno
 * se clasifica por su punto medio, empujado una pizca en la dirección
 * `empuje` (así un tramo que yace sobre el borde cuenta según hacia dónde
 * se mueve).
 * @param {Vec2} a @param {Vec2} b @param {Vec2[]} Q @param {Vec2} [empuje]
 */
export function largoDentro(a, b, Q, empuje) {
  const d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(d[0], d[1]);
  if (!(L > 0)) return 0;
  const ts = [0, 1];
  for (let i = 0; i < Q.length; i++) {
    const p = Q[i], q = Q[(i + 1) % Q.length], e = [q[0] - p[0], q[1] - p[1]], den = cruz2(/** @type {Vec2} */ (d), /** @type {Vec2} */ (e));
    if (Math.abs(den) < 1e-300) continue;
    const w = [p[0] - a[0], p[1] - a[1]], t = cruz2(/** @type {Vec2} */ (w), /** @type {Vec2} */ (e)) / den, u = cruz2(/** @type {Vec2} */ (w), /** @type {Vec2} */ (d)) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const esc = Math.max(L, 1e-9) * 1e-9, em = empuje && Math.hypot(empuje[0], empuje[1]) > 0 ? empuje : [-d[1] / L, d[0] / L];
  const en = Math.hypot(em[0], em[1]);
  let largo = 0;
  for (let i = 0; i < ts.length - 1; i++) {
    const t0 = ts[i], t1 = ts[i + 1]; if (t1 - t0 < 1e-14) continue;
    const tm = (t0 + t1) / 2, m = [a[0] + d[0] * tm + em[0] / en * esc, a[1] + d[1] * tm + em[1] / en * esc];
    if (contiene(Q, m)) largo += (t1 - t0) * L;
  }
  return largo;
}

// ---------------------------------------------------------------------------
// Hilos en el plano: flujo y ∫B dl exactos (B_z = μ0·I/(2π·s), s con signo)
// ---------------------------------------------------------------------------

/**
 * Hilo infinito contenido en el plano: pasa por `a` con dirección `u`.
 * B_z = μ0·I/(2π·s), con s la distancia con signo (positiva a la izquierda
 * del sentido de la corriente).
 * @typedef {{a: Vec2, u: Vec2, I: number, variacion?: Variacion}} HiloPlano
 */
const sDe = (h, p) => (p[0] - h.a[0]) * -h.u[1] + (p[1] - h.a[1]) * h.u[0];
const uDe = (h, p) => (p[0] - h.a[0]) * h.u[0] + (p[1] - h.a[1]) * h.u[1];

/** B_z de un hilo del plano en p (T), con la corriente dada. @param {HiloPlano} h @param {Vec2} p @param {number} [I] */
export const campoHiloPlano = (h, p, I = h.I) => MU0 * I / (DOS_PI * sDe(h, p));

/**
 * ∫∫ dA/s sobre un polígono que no corta al hilo (teorema de Green:
 * −∮ ln|s| du, exacto tramo a tramo). El flujo es μ0·I/(2π) por este valor.
 * @param {HiloPlano} h @param {Vec2[]} pts antihorario
 */
export function integralInversaDistancia(h, pts) {
  let r = 0;
  const F = s => s * Math.log(Math.abs(s)) - s;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n], s1 = sDe(h, p), s2 = sDe(h, q), du = uDe(h, q) - uDe(h, p);
    if (Math.abs(du) < 1e-300) continue;
    r -= Math.abs(s2 - s1) > 1e-12 * Math.max(Math.abs(s1), Math.abs(s2)) ? du / (s2 - s1) * (F(s2) - F(s1)) : du * Math.log(Math.abs((s1 + s2) / 2));
  }
  return r;
}

/** ∫ dl/s a lo largo del segmento a→b (exacto). @param {HiloPlano} h @param {Vec2} a @param {Vec2} b */
export function integralLineaInversa(h, a, b) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), s1 = sDe(h, a), s2 = sDe(h, b);
  if (!(L > 0)) return 0;
  return Math.abs(s2 - s1) > 1e-12 * Math.max(Math.abs(s1), Math.abs(s2)) ? L / (s2 - s1) * Math.log(s2 / s1) : L / ((s1 + s2) / 2);
}

// ---------------------------------------------------------------------------
// 2 · Regiones de campo
// ---------------------------------------------------------------------------

/**
 * Región de campo uniforme con borde nítido.
 * - tipo 'B': `B` es la componente perpendicular al plano (T, + saliente);
 *   `variacion` opcional (solo en inducción).
 * - tipo 'E': `E` es el vector [Ex, Ey] (V/m); `alterna` opcional: el campo
 *   se multiplica por cos(2π·f·t + fase) o por su signo (onda cuadrada).
 * @typedef {Object} Region
 * @property {string} [id]
 * @property {'B'|'E'} tipo
 * @property {number[][]} poligono
 * @property {number} [B]
 * @property {number[]} [E]
 * @property {Variacion} [variacion]
 * @property {{frecuencia: number, fase?: number, forma?: 'senoidal'|'cuadrada'}} [alterna]
 */

/** Rectángulo (polígono antihorario) de centro c, ancho w, alto h y giro g. */
export function rectangulo(c, w, h, g = 0) {
  const cg = Math.cos(g), sg = Math.sin(g);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => /** @type {Vec2} */ ([c[0] + cg * x - sg * y, c[1] + sg * x + cg * y]));
}

/** Factor temporal de un campo alterno. */
function factorAlterno(alt, t) {
  if (!alt || !(alt.frecuencia > 0)) return 1;
  const c = Math.cos(DOS_PI * alt.frecuencia * t + (alt.fase ?? 0));
  return alt.forma === 'cuadrada' ? (c >= 0 ? 1 : -1) : c;
}

/** Valida una región y la prepara (antihoraria, triángulos y caja). */
function prepararRegion(r, i) {
  if (!r || (r.tipo !== 'B' && r.tipo !== 'E')) throw new ErrorMagnetismo(`La región ${i + 1} no es de campo B ni E.`);
  if (!Array.isArray(r.poligono) || r.poligono.length < 3 || r.poligono.some(p => !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) {
    throw new ErrorMagnetismo(`La región «${r.id ?? i + 1}» necesita un polígono de al menos tres vértices.`);
  }
  const pts = antihorario(/** @type {Vec2[]} */ (r.poligono));
  if (!(Math.abs(areaPoligono(pts)) > 0)) throw new ErrorMagnetismo(`La región «${r.id ?? i + 1}» no tiene área.`);
  if (r.tipo === 'B' && !Number.isFinite(r.B)) throw new ErrorMagnetismo(`La región «${r.id ?? i + 1}»: B tiene que ser un número.`);
  if (r.tipo === 'E' && !(Array.isArray(r.E) && Number.isFinite(r.E[0]) && Number.isFinite(r.E[1]))) throw new ErrorMagnetismo(`La región «${r.id ?? i + 1}»: E tiene que ser un vector [Ex, Ey].`);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { ...r, id: r.id ?? `r${i + 1}`, pts, tris: triangular(pts), caja: [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)] };
}

// ---------------------------------------------------------------------------
// 3 · Partículas cargadas en E y B (Boris)
// ---------------------------------------------------------------------------

/** Rapidez tras acelerar desde el reposo con una diferencia de potencial V: √(2|q|V/m). */
export const rapidezAceleracion = (q, m, V) => Math.sqrt(2 * Math.abs(q * V) / m);
/** Radio de la órbita en un campo B uniforme: m·v/(|q|·B). */
export const radioCiclotron = (m, v, q, B) => m * v / Math.abs(q * B);
/** Periodo de la órbita: 2π·m/(|q|·B) (no depende de la rapidez). */
export const periodoCiclotron = (m, q, B) => DOS_PI * m / Math.abs(q * B);

/**
 * Partícula cargada. Posición y velocidad en el plano (z y vz opcionales).
 * @typedef {Object} Particula
 * @property {string} [id]
 * @property {number} q  C
 * @property {number} m  kg
 * @property {number[]} p  m
 * @property {number[]} v  m/s
 * @property {number} [t0=0] instante en que aparece (fuente con ritmo)
 */

/**
 * Obstáculo: pantalla detectora (registra el impacto) o placa (lo absorbe).
 * `agujeros`: tramos [s0, s1] (m, medidos desde a) por los que se pasa.
 * @typedef {{id?: string, tipo: 'pantalla'|'placa', a: number[], b: number[], agujeros?: number[][]}} Obstaculo
 */

/**
 * @typedef {Object} EscenaParticulas
 * @property {Region[]} [regiones]
 * @property {FuenteB[]} [fuentes]       campos no uniformes (hilos, imanes…)
 * @property {Obstaculo[]} [obstaculos]
 * @property {Particula[]} particulas
 * @property {number} duracion          s
 * @property {number[]} [caja]          [x0, x1, y0, y1]: al salir de ella la partícula se deja de seguir
 * @property {{pasosPorVuelta?: number, pasosMin?: number, maxPasos?: number}} [opciones]
 */

/**
 * Placas aceleradoras paralelas: dos placas con un agujero en el centro y
 * un campo E = ΔV/d entre ellas, de la placa a (potencial alto) a la b.
 * @param {{centro: number[], giro?: number, largo: number, separacion: number, dV: number, agujero?: number}} p
 *   giro: dirección de a hacia b (rad)
 * @returns {{region: Region, placas: Obstaculo[]}}
 */
export function placasAceleradoras(p) {
  const g = p.giro ?? Math.PI / 2, n = direccion(g), t = /** @type {Vec2} */ ([-n[1], n[0]]), c = p.centro, d = p.separacion, L = p.largo;
  const ag = p.agujero ?? L * 0.06, hueco = [[L / 2 - ag / 2, L / 2 + ag / 2]];
  const placa = s => ({ tipo: /** @type {'placa'} */ ('placa'), a: [c[0] + n[0] * s - t[0] * L / 2, c[1] + n[1] * s - t[1] * L / 2], b: [c[0] + n[0] * s + t[0] * L / 2, c[1] + n[1] * s + t[1] * L / 2], agujeros: hueco });
  return {
    region: { tipo: 'E', poligono: rectangulo([c[0], c[1]], d, L, g), E: [n[0] * p.dV / d, n[1] * p.dV / d] },
    placas: [placa(-d / 2), placa(d / 2)],
  };
}

/** Prepara la escena de partículas: valida y deja las piezas listas para el paso de Boris. */
function prepararParticulas(e) {
  if (!e || !Array.isArray(e.particulas)) throw new ErrorMagnetismo('La escena de partículas necesita una lista de partículas.');
  if (!(e.duracion > 0) || !Number.isFinite(e.duracion)) throw new ErrorMagnetismo('La duración tiene que ser un número positivo de segundos.');
  const regiones = (e.regiones || []).map(prepararRegion);
  const fuentes = e.fuentes || [];
  const obst = (e.obstaculos || []).map((o, i) => {
    const a = /** @type {Vec2} */ ([o.a[0], o.a[1]]), b = /** @type {Vec2} */ ([o.b[0], o.b[1]]), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!(L > 0)) throw new ErrorMagnetismo(`El obstáculo ${o.id ?? i + 1} no tiene largo.`);
    return { ...o, id: o.id ?? `o${i + 1}`, a, b, L, u: [(b[0] - a[0]) / L, (b[1] - a[1]) / L], agujeros: o.agujeros || [] };
  });
  e.particulas.forEach((p, i) => {
    if (!(p.m > 0) || !Number.isFinite(p.q) || !p.p || !p.v || ![...p.p, ...p.v].every(Number.isFinite)) throw new ErrorMagnetismo(`La partícula ${p.id ?? i + 1} necesita q, m > 0, posición y velocidad.`);
  });
  // Escala más pequeña de las regiones: ningún paso la salta entera
  let escala = Infinity;
  for (const r of regiones) escala = Math.min(escala, r.caja[1] - r.caja[0], r.caja[3] - r.caja[2]);
  if (!Number.isFinite(escala)) escala = 1;
  return { regiones, fuentes, obst, escala, caja: e.caja || null };
}

/** Campos E y B en x (3D) en t, contando solo las regiones marcadas en `dentro`. */
function camposEn(P, dentro, x, t) {
  const E = [0, 0, 0], B = P.fuentes.length ? campoB(P.fuentes, x) : [0, 0, 0];
  for (let k = 0; k < P.regiones.length; k++) {
    if (!dentro[k]) continue;
    const r = P.regiones[k];
    if (r.tipo === 'B') B[2] += r.B;
    else { const f = factorAlterno(r.alterna, t); E[0] += r.E[0] * f; E[1] += r.E[1] * f; }
  }
  return { E, B };
}

/**
 * Un paso de Boris en forma deriva-impulso-deriva: medio paso de posición,
 * impulso eléctrico, rotación magnética (|v| exacto), impulso eléctrico y
 * medio paso de posición. Los campos se toman en el punto medio. Sin campo
 * eléctrico la rapidez es un invariante exacto: se proyecta sobre `rapidez`
 * para que el redondeo no la desvíe paso a paso.
 * @returns {{x: Vec3, v: Vec3, xm: Vec3, soloB: boolean}}
 */
function pasoBoris(P, dentro, q, m, x, v, t, h, rapidez) {
  const xm = /** @type {Vec3} */ ([x[0] + v[0] * h / 2, x[1] + v[1] * h / 2, x[2] + v[2] * h / 2]);
  const { E, B } = camposEn(P, dentro, xm, t + h / 2), k = q * h / (2 * m);
  const vm = /** @type {Vec3} */ ([v[0] + k * E[0], v[1] + k * E[1], v[2] + k * E[2]]);
  const tv = por3(/** @type {Vec3} */ (B), k), t2 = punto3(tv, tv);
  let vp = vm;
  if (t2 > 0) {
    const s = por3(tv, 2 / (1 + t2)), vq = mas3(vm, cruz3(vm, tv));
    vp = mas3(vm, cruz3(vq, s));
  }
  const soloB = !(E[0] || E[1] || E[2]);
  if (soloB && t2 > 0) { const f = (rapidez ?? norma3(vm)) / norma3(vp); if (Number.isFinite(f)) vp = por3(vp, f); }
  const v1 = /** @type {Vec3} */ ([vp[0] + k * E[0], vp[1] + k * E[1], vp[2] + k * E[2]]);
  return { x: [xm[0] + v1[0] * h / 2, xm[1] + v1[1] * h / 2, xm[2] + v1[2] * h / 2], v: v1, xm, soloB };
}

/** Cruce propio de los segmentos p→q y a→b: parámetro en a→b (o null). */
function cruceSegmentos(p, q, a, b) {
  const d = [q[0] - p[0], q[1] - p[1]], e = [b[0] - a[0], b[1] - a[1]], den = cruz2(/** @type {Vec2} */ (d), /** @type {Vec2} */ (e));
  if (Math.abs(den) < 1e-300) return null;
  const w = [a[0] - p[0], a[1] - p[1]], t = cruz2(/** @type {Vec2} */ (w), /** @type {Vec2} */ (e)) / den, u = cruz2(/** @type {Vec2} */ (w), /** @type {Vec2} */ (d)) / den;
  return t > 0 && t <= 1 && u >= 0 && u <= 1 ? u : null;
}

/**
 * Simula partículas cargadas en las regiones de campo y los campos de las
 * fuentes. Devuelve, por partícula, su trayectoria muestreada en cada paso
 * y los eventos (entrada y salida de regiones, impactos, salida de la caja).
 * Nunca aborta una escena válida: al límite de pasos, `incompleta`.
 * @param {EscenaParticulas} escena
 */
export function simularParticulas(escena) {
  const P = prepararParticulas(escena), T = escena.duracion, op = escena.opciones || {};
  const ppv = op.pasosPorVuelta ?? 512, maxPasos = op.maxPasos ?? 400000;
  const hMax = T / (op.pasosMin ?? 400);
  const trayectorias = [], eventos = [], impactos = [];
  let incompleta = null;

  escena.particulas.forEach((par, ip) => {
    const id = par.id ?? `p${ip + 1}`, q = par.q, m = par.m;
    let t = par.t0 ?? 0, x = v3(par.p), v = v3(par.v), pasos = 0, rapidez = norma3(v);
    const dentro = P.regiones.map(r => contiene(r.pts, x));
    const TT = [t], X = [x[0]], Y = [x[1]], Z = [x[2]], VX = [v[0]], VY = [v[1]], VZ = [v[2]];
    const guardar = () => { TT.push(t); X.push(x[0]); Y.push(x[1]); Z.push(x[2]); VX.push(v[0]); VY.push(v[1]); VZ.push(v[2]); };
    let fin = null;
    const evento = (tipo, objeto, extra = {}) => { const e = { t, particula: id, indice: ip, tipo, objeto, p: [x[0], x[1], x[2]], v: [v[0], v[1], v[2]], ...extra }; eventos.push(e); return e; };
    if (t >= T) fin = { t, motivo: 'fin' };
    while (!fin) {
      if (pasos++ >= maxPasos) { fin = { t, motivo: 'pasos' }; incompleta = { t, motivo: `La partícula ${id} llegó al límite de ${maxPasos} pasos.` }; break; }
      // Paso: fracción de una vuelta del ciclotrón local, sin saltar una región entera
      const { E, B } = camposEn(P, dentro, x, t), Bm = norma3(/** @type {Vec3} */ (B)), Em = norma3(/** @type {Vec3} */ (E)), vm = norma3(v);
      let h = Math.min(hMax, T - t);
      if (Bm > 0) h = Math.min(h, DOS_PI * m / (Math.abs(q) * Bm) / ppv);
      if (vm > 0) h = Math.min(h, P.escala / (16 * vm));
      if (Em > 0) h = Math.min(h, Math.sqrt(2 * P.escala * m / (Math.abs(q) * Em)) / 64);
      if (!(h > 0)) { fin = { t, motivo: 'fin' }; break; }
      let r = pasoBoris(P, dentro, q, m, x, v, t, h, rapidez);
      // ¿Cambió la pertenencia a alguna región? Bisección hasta el borde
      let hEv = h, tipoEv = null, kEv = -1, golpe = null;
      for (let k = 0; k < P.regiones.length; k++) {
        if (contiene(P.regiones[k].pts, r.x) === dentro[k]) continue;
        let lo = 0, hi = h;
        for (let it = 0; it < 60 && hi - lo > 1e-15 * h; it++) {
          const md = (lo + hi) / 2, rr = pasoBoris(P, dentro, q, m, x, v, t, md, rapidez);
          if (contiene(P.regiones[k].pts, rr.x) === dentro[k]) lo = md; else hi = md;
        }
        if (hi <= hEv) { hEv = hi; tipoEv = 'region'; kEv = k; }
      }
      // Impactos con pantallas y placas (fuera de sus agujeros)
      for (const o of P.obst) {
        const u1 = cruceSegmentos(x, r.xm, o.a, o.b) ?? cruceSegmentos(r.xm, r.x, o.a, o.b);
        if (u1 == null) continue;
        const g = hh => { const rr = hh === 0 ? { x } : pasoBoris(P, dentro, q, m, x, v, t, hh, rapidez); return cruz2(/** @type {Vec2} */ (o.u), [rr.x[0] - o.a[0], rr.x[1] - o.a[1]]); };
        const g0 = g(0), g1 = g(h);
        if (!(g0 * g1 < 0)) continue;
        const hh = brent(g, 0, h, { tol: 1e-15 * h, ga: g0, gb: g1 });
        const rr = pasoBoris(P, dentro, q, m, x, v, t, hh, rapidez), s = (rr.x[0] - o.a[0]) * o.u[0] + (rr.x[1] - o.a[1]) * o.u[1];
        if (s < 0 || s > o.L || o.agujeros.some(([s0, s1]) => s >= s0 && s <= s1)) continue;
        // Una placa sobre el borde de una región (selector de velocidades): el
        // impacto y la salida son el mismo cruce y gana el impacto, porque si
        // la salida se procesara primero la partícula quedaría sobre la placa
        // y el paso siguiente ya no la cruzaría
        if (hh <= hEv + 1e-9 * h) { hEv = Math.min(hh, hEv); tipoEv = 'impacto'; golpe = { o, s }; }
      }
      if (tipoEv) r = pasoBoris(P, dentro, q, m, x, v, t, hEv, rapidez);
      t += tipoEv ? hEv : h; x = r.x; v = r.v; guardar();
      if (!r.soloB) rapidez = norma3(v);
      if (tipoEv === 'region') {
        const rg = P.regiones[kEv];
        dentro[kEv] = !dentro[kEv];
        // Las demás regiones también se revisan (cruce simultáneo por una esquina compartida)
        for (let k = 0; k < P.regiones.length; k++) if (k !== kEv) dentro[k] = contiene(P.regiones[k].pts, x);
        evento(dentro[kEv] ? 'entrada' : 'salida', rg.id, { region: kEv, campo: rg.tipo });
      } else if (tipoEv === 'impacto') {
        const e = evento(golpe.o.tipo === 'pantalla' ? 'impacto' : 'placa', golpe.o.id, { s: golpe.s });
        impactos.push(e); fin = { t, motivo: golpe.o.tipo, objeto: golpe.o.id };
      }
      if (!fin && P.caja && (x[0] < P.caja[0] || x[0] > P.caja[1] || x[1] < P.caja[2] || x[1] > P.caja[3])) { evento('sale', null); fin = { t, motivo: 'caja' }; }
      if (!fin && t >= T - 1e-15 * T) fin = { t, motivo: 'fin' };
    }
    trayectorias.push({
      id, indice: ip, q, m, t0: par.t0 ?? 0, fin, n: TT.length,
      t: Float64Array.from(TT), x: Float64Array.from(X), y: Float64Array.from(Y), z: Float64Array.from(Z),
      vx: Float64Array.from(VX), vy: Float64Array.from(VY), vz: Float64Array.from(VZ),
    });
  });
  eventos.sort((a, b) => a.t - b.t || a.indice - b.indice);
  return { trayectorias, eventos, impactos, duracion: T, incompleta, regiones: P.regiones.map(r => ({ id: r.id, tipo: r.tipo, pts: r.pts })) };
}

/** @typedef {ReturnType<typeof simularParticulas>} SimulacionParticulas */

/**
 * Estado de una partícula en t (interpolación lineal entre pasos; antes de
 * aparecer o después de terminar, null o el último estado).
 * @param {SimulacionParticulas['trayectorias'][number]} tr @param {number} t
 * @returns {{p: Vec3, v: Vec3, i: number, activa: boolean} | null}
 */
export function estadoParticula(tr, t) {
  const T = tr.t, n = tr.n;
  if (t < T[0]) return null;
  if (t >= T[n - 1]) return { p: [tr.x[n - 1], tr.y[n - 1], tr.z[n - 1]], v: [tr.vx[n - 1], tr.vy[n - 1], tr.vz[n - 1]], i: n - 1, activa: false };
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const md = (lo + hi) >> 1; if (T[md] <= t) lo = md; else hi = md; }
  const f = (t - T[lo]) / (T[hi] - T[lo] || 1), L = (a, i) => a[i] + (a[i + 1] - a[i]) * f;
  return { p: [L(tr.x, lo), L(tr.y, lo), L(tr.z, lo)], v: [L(tr.vx, lo), L(tr.vy, lo), L(tr.vz, lo)], i: lo, activa: true };
}

/**
 * Mide una órbita en un tramo de la trayectoria [i0, i1]: radio y centro
 * por ajuste algebraico de una circunferencia (Kåsa) a los puntos, y
 * velocidad angular por la pendiente del ángulo de la velocidad contra el
 * tiempo (mínimos cuadrados). El periodo es 2π/|ω|.
 * @param {SimulacionParticulas['trayectorias'][number]} tr @param {number} [i0=0] @param {number} [i1]
 * @returns {{radio: number, centro: Vec2, omega: number, periodo: number} | null}
 */
export function medirOrbita(tr, i0 = 0, i1 = tr.n - 1) {
  const n = i1 - i0 + 1;
  if (n < 5) return null;
  // Kåsa: x² + y² + D x + E y + F = 0, centrado para que el sistema esté bien condicionado
  let mx = 0, my = 0;
  for (let i = i0; i <= i1; i++) { mx += tr.x[i]; my += tr.y[i]; }
  mx /= n; my /= n;
  let Sxx = 0, Syy = 0, Sxy = 0, Sxz = 0, Syz = 0, Sz = 0;
  for (let i = i0; i <= i1; i++) {
    const x = tr.x[i] - mx, y = tr.y[i] - my, z = x * x + y * y;
    Sxx += x * x; Syy += y * y; Sxy += x * y; Sxz += x * z; Syz += y * z; Sz += z;
  }
  const det = Sxx * Syy - Sxy * Sxy;
  if (!(Math.abs(det) > 0)) return null;
  const a = (Sxz * Syy - Syz * Sxy) / (2 * det), b = (Syz * Sxx - Sxz * Sxy) / (2 * det);
  const radio = Math.sqrt(a * a + b * b + Sz / n);
  // ω: pendiente del ángulo de v (desenrollado)
  let ang0 = Math.atan2(tr.vy[i0], tr.vx[i0]), prev = ang0, acum = ang0, St = 0, Sa = 0, Stt = 0, Sta = 0;
  for (let i = i0; i <= i1; i++) {
    const g = Math.atan2(tr.vy[i], tr.vx[i]); let d = g - prev;
    if (d > Math.PI) d -= DOS_PI; else if (d < -Math.PI) d += DOS_PI;
    acum = i === i0 ? ang0 : acum + d; prev = g;
    const t = tr.t[i] - tr.t[i0];
    St += t; Sa += acum; Stt += t * t; Sta += t * acum;
  }
  const omega = (n * Sta - St * Sa) / (n * Stt - St * St);
  return { radio, centro: [a + mx, b + my], omega, periodo: DOS_PI / Math.abs(omega) };
}

/**
 * Tramos de una trayectoria dentro de una región (entre sus eventos de
 * entrada y salida): índices [i0, i1] para medir órbitas.
 * @param {SimulacionParticulas} sim @param {number} ip índice de la partícula @param {number} [region] índice de la región
 * @returns {Array<[number, number]>}
 */
export function tramosEnRegion(sim, ip, region) {
  const tr = sim.trayectorias[ip], evs = sim.eventos.filter(e => e.indice === ip && (region == null || e.region === region) && (e.tipo === 'entrada' || e.tipo === 'salida'));
  const idx = t => { let lo = 0, hi = tr.n - 1; while (hi - lo > 1) { const md = (lo + hi) >> 1; if (tr.t[md] <= t) lo = md; else hi = md; } return Math.abs(tr.t[hi] - t) < Math.abs(tr.t[lo] - t) ? hi : lo; };
  /** @type {Array<[number, number]>} */ const r = [];
  let i0 = region != null && contiene(sim.regiones[region].pts, [tr.x[0], tr.y[0]]) ? 0 : null;
  for (const e of evs) {
    if (e.tipo === 'entrada') i0 = idx(e.t);
    else if (i0 != null) { r.push([i0, idx(e.t)]); i0 = null; }
  }
  if (i0 != null) r.push([i0, tr.n - 1]);
  return r;
}

/**
 * Fuente de iones: genera partículas con varias especies, rapidez dada o
 * por un voltaje de aceleración, en abanico y con un ritmo de emisión.
 * Determinista (sin azar): los ángulos se reparten por igual.
 * @param {{p: number[], giro: number, especies: Array<{q: number, m: number, nombre?: string}>, v?: number, V?: number,
 *   cantidad?: number, abanico?: number, ritmo?: number}} f
 *   cantidad: partículas por especie; abanico: ángulo total (rad); ritmo: partículas por segundo (0: todas a la vez)
 * @returns {Particula[]}
 */
export function emitirIones(f) {
  const r = [], n = Math.max(1, Math.round(f.cantidad ?? 1)), ab = f.abanico ?? 0;
  let k = 0;
  f.especies.forEach((s, ie) => {
    const rap = f.V != null ? rapidezAceleracion(s.q, s.m, f.V) : f.v ?? 0;
    for (let i = 0; i < n; i++) {
      const a = f.giro + (n > 1 ? ab * (i / (n - 1) - 0.5) : 0), d = direccion(a);
      r.push({ id: `${s.nombre ?? 'ion'}-${ie + 1}-${i + 1}`, q: s.q, m: s.m, p: [f.p[0], f.p[1]], v: [d[0] * rap, d[1] * rap], t0: f.ritmo > 0 ? k / f.ritmo : 0 });
      k++;
    }
  });
  return r;
}

// ---------------------------------------------------------------------------
// Efecto Hall
// ---------------------------------------------------------------------------

/**
 * Efecto Hall en una lámina: corriente I a lo largo, campo B perpendicular a
 * la lámina, n portadores por unidad de volumen de carga q (con signo).
 * Los portadores derivan con v_d = I/(n·|q|·a·b) y se desvían hacia el
 * borde en la dirección Î × B̂ (con cualquier signo de carga); se acumulan
 * hasta que el campo de Hall equilibra la fuerza magnética: q·E_H = q·v_d·B.
 * @param {{I: number, B: number, n: number, q: number, espesor: number, ancho: number}} p
 *   espesor a (en la dirección de B), ancho b (transversal a I y a B)
 */
export function hall(p) {
  const { I, B, n, q, espesor: a, ancho: b } = p;
  if (!(n > 0) || !(a > 0) || !(b > 0) || !Number.isFinite(q) || q === 0) throw new ErrorMagnetismo('La lámina Hall necesita n > 0, espesor y ancho positivos y una carga de portador distinta de cero.');
  const vd = I / (n * Math.abs(q) * a * b), EH = vd * Math.abs(B), VH = EH * b;
  return {
    vd, EH, VH, FB: Math.abs(q) * vd * Math.abs(B), FE: Math.abs(q) * EH,
    VHformula: I * Math.abs(B) / (n * Math.abs(q) * a),
    // Signo de la carga que se acumula en el borde hacia Î × B̂ (el de los portadores)
    signoBorde: Math.sign(q) * Math.sign(B || 1) * Math.sign(I || 1),
    portadoresPorTiempo: I / Math.abs(q),
  };
}

/**
 * Transitorio de Hall (modelo de Drude): al encender B, el campo de Hall
 * crece desde cero con la carga acumulada en los bordes, E_H(t) =
 * E_eq·(1 − e^{−t/τ}), y la deriva transversal de los portadores se apaga
 * como e^{−t/τ}; τ es el tiempo de relajación dieléctrica (ε/σ).
 * @param {ReturnType<typeof hall>} eq @param {number} t @param {number} tau
 */
export function hallTransitorio(eq, t, tau) {
  const f = t <= 0 ? 0 : 1 - Math.exp(-t / tau);
  return { fraccion: f, EH: eq.EH * f, VH: eq.VH * f, transversal: 1 - f };
}

// ---------------------------------------------------------------------------
// 4 · Inducción acoplada
// ---------------------------------------------------------------------------

/**
 * Barra sobre rieles. `s` es la posición de su centro a lo largo de los
 * rieles, desde el extremo de la resistencia; `angulo` (φ) es su
 * inclinación respecto de la perpendicular a los rieles (barra oblicua).
 * @typedef {Object} BarraRieles
 * @property {string} [id]
 * @property {number} s     m
 * @property {number} [v=0] m/s
 * @property {number} m     kg
 * @property {number} [r=0] resistencia de la barra (Ω)
 * @property {number} [mu=0] coeficiente de fricción
 * @property {number} [F=0] fuerza aplicada a lo largo de los rieles (N)
 * @property {number|null} [vImpuesta] velocidad impuesta (m/s): la barra no responde a las fuerzas
 * @property {number} [angulo=0] rad
 */

/**
 * Circuito de la inducción.
 * - rieles: `origen` (extremo de la resistencia), `angulo` (dirección de
 *   los rieles; con inclinación es la de bajada), `separacion`, `largo`, `R`
 *   (null: rieles abiertos), `L`, `inclinacion` θ (la gravedad tira con
 *   g·sen θ a lo largo), `bVertical` (B vertical y no perpendicular a los
 *   rieles: cuenta B·cos θ), `barras` (una con resistencia, o dos sin ella);
 * - espira: rígida, `puntos` (relativos al centro) o `ancho`/`alto`;
 *   `centro`, `v`, `N`, `R`, `L`, `m`, `gravedad` (vector en el plano),
 *   `F`, `vImpuesta`, `ejes` ('x', 'y' o 'xy');
 * - generador: bobina de área `ancho`·`alto` y `N` vueltas que gira con
 *   ω impuesta en un campo `B` uniforme; `fase`, carga `R`, `L`;
 * - conductor: barra abierta de `largo` y `angulo` con centro `centro` que
 *   se mueve con velocidad `v` impuesta: diferencia de potencial entre sus extremos.
 * @typedef {Object} Circuito
 * @property {'rieles'|'espira'|'generador'|'conductor'} tipo
 * @property {string} [id]
 */

/**
 * @typedef {Object} EscenaInduccion
 * @property {Region[]} [regiones]  solo de tipo B
 * @property {Array<{id?: string, a: number[], angulo: number, I: number, variacion?: Variacion}>} [hilos] hilos infinitos del plano
 * @property {any[]} circuitos
 * @property {number} duracion
 * @property {number} [dt=duracion/400] intervalo de las muestras
 * @property {number} [g=9.8]
 * @property {{rtol?: number, atol?: number}} [opciones]
 */

const NQ = 6; // cuadraturas por circuito: calor Joule, calor de fricción, trabajo aplicado, trabajo de la gravedad, trabajo del agente externo, energía del campo variable

/** Valida y prepara la escena de inducción. */
function prepararInduccion(e) {
  if (!e || !Array.isArray(e.circuitos) || !e.circuitos.length) throw new ErrorMagnetismo('La escena de inducción necesita al menos un circuito.');
  if (!(e.duracion > 0) || !Number.isFinite(e.duracion)) throw new ErrorMagnetismo('La duración tiene que ser un número positivo de segundos.');
  const regiones = (e.regiones || []).map((r, i) => prepararRegion({ tipo: 'B', ...r }, i));
  const hilos = (e.hilos || []).map((h, i) => {
    if (!Array.isArray(h.a) || !Number.isFinite(h.angulo) || !Number.isFinite(h.I)) throw new ErrorMagnetismo(`El hilo ${h.id ?? i + 1} necesita un punto, una dirección y una corriente.`);
    return { ...h, id: h.id ?? `h${i + 1}`, a: /** @type {Vec2} */ ([h.a[0], h.a[1]]), u: direccion(h.angulo) };
  });
  const g = e.g ?? G_GRAVEDAD;
  const pos = (v, nombre, id) => { if (!(v > 0) || !Number.isFinite(v)) throw new ErrorMagnetismo(`«${id}»: ${nombre} tiene que ser un número positivo.`); return v; };
  const noNeg = (v, nombre, id) => { if (!(v >= 0) || !Number.isFinite(v)) throw new ErrorMagnetismo(`«${id}»: ${nombre} no puede ser negativa.`); return v; };
  let off = 0;
  const circuitos = e.circuitos.map((c, ic) => {
    const id = c.id ?? `c${ic + 1}`, base = { ...c, id, off };
    if (c.tipo === 'rieles') {
      const barras = (c.barras || []).map((b, ib) => ({ id: b.id ?? `b${ib + 1}`, nombre: b.nombre, s: b.s, v: b.v ?? 0, m: pos(b.m, 'la masa de la barra', id), r: noNeg(b.r ?? 0, 'la resistencia de la barra', id), mu: noNeg(b.mu ?? 0, 'la fricción', id), F: b.F ?? 0, vImpuesta: b.vImpuesta ?? null, angulo: b.angulo ?? 0 }));
      if (barras.length < 1 || barras.length > 2) throw new ErrorMagnetismo(`«${id}»: los rieles llevan una o dos barras.`);
      if (barras.length === 2 && c.R != null) throw new ErrorMagnetismo(`«${id}»: con dos barras el circuito lo cierran ellas; quita la resistencia de los rieles.`);
      if (barras.length === 2 && !(barras[0].s < barras[1].s)) throw new ErrorMagnetismo(`«${id}»: la primera barra tiene que estar más cerca del origen que la segunda.`);
      for (const b of barras) if (!Number.isFinite(b.s) || Math.abs(b.angulo) >= Math.PI / 2 - 1e-3) throw new ErrorMagnetismo(`«${id}»: posición o inclinación de la barra no válidas.`);
      const R = c.R == null ? null : noNeg(c.R, 'la resistencia', id), Rt = (R ?? 0) + barras.reduce((s, b) => s + b.r, 0);
      if (R != null && !(Rt > 0) && !(c.L > 0)) throw new ErrorMagnetismo(`«${id}»: el circuito necesita resistencia o inductancia (con R = 0 y L = 0 la corriente no está definida).`);
      const th = c.inclinacion ?? 0, u = direccion(c.angulo ?? 0);
      const P = {
        ...base, barras, R, Rt, L: c.L ?? 0, d: pos(c.separacion, 'la separación de los rieles', id), largo: pos(c.largo, 'el largo de los rieles', id),
        origen: /** @type {Vec2} */ ([c.origen?.[0] ?? 0, c.origen?.[1] ?? 0]), u, w: /** @type {Vec2} */ ([-u[1], u[0]]), th, fB: c.bVertical ? Math.cos(th) : 1, sB: c.bVertical ? Math.sin(th) : 0,
        gs: g * Math.sin(th), gc: g * Math.cos(th), abierto: R == null && barras.length === 1, N: 1,
      };
      P.nDof = barras.length; P.conI = !P.abierto && P.L > 0; P.n = 2 * P.nDof + (P.conI ? 1 : 0) + NQ;
      off += P.n; return P;
    }
    if (c.tipo === 'espira') {
      const pts = c.puntos ? antihorario(c.puntos) : antihorario(rectangulo([0, 0], pos(c.ancho, 'el ancho', id), pos(c.alto, 'el alto', id)));
      const R = noNeg(c.R ?? 0, 'la resistencia', id), L = noNeg(c.L ?? 0, 'la inductancia', id);
      if (!(R > 0) && !(L > 0)) throw new ErrorMagnetismo(`«${id}»: la espira necesita resistencia o inductancia.`);
      const P = {
        ...base, local: pts, N: Math.max(1, Math.round(c.N ?? 1)), R, Rt: R, L, m: pos(c.m ?? 1, 'la masa', id),
        c0: /** @type {Vec2} */ ([c.centro[0], c.centro[1]]), v0: /** @type {Vec2} */ ([c.v?.[0] ?? 0, c.v?.[1] ?? 0]),
        gv: /** @type {Vec2} */ ([c.gravedad?.[0] ?? 0, c.gravedad?.[1] ?? 0]), Fa: /** @type {Vec2} */ ([c.F?.[0] ?? 0, c.F?.[1] ?? 0]),
        vImpuesta: c.vImpuesta ? /** @type {Vec2} */ ([c.vImpuesta[0], c.vImpuesta[1]]) : null, ejes: ['x', 'y'].includes(c.ejes) ? c.ejes : 'xy',
      };
      P.conI = P.L > 0; P.n = 4 + (P.conI ? 1 : 0) + NQ;
      off += P.n; return P;
    }
    if (c.tipo === 'generador') {
      const R = noNeg(c.R ?? 0, 'la resistencia', id), L = noNeg(c.L ?? 0, 'la inductancia', id);
      if (!(R > 0) && !(L > 0)) throw new ErrorMagnetismo(`«${id}»: el generador necesita una carga con resistencia o inductancia.`);
      const P = { ...base, N: Math.max(1, Math.round(c.N ?? 1)), A: pos(c.ancho, 'el ancho', id) * pos(c.alto, 'el alto', id), B: c.B ?? 0, omega: c.omega ?? 0, fase: c.fase ?? 0, R, Rt: R, L };
      P.conI = L > 0; P.n = (P.conI ? 1 : 0) + NQ;
      off += P.n; return P;
    }
    if (c.tipo === 'conductor') {
      const P = { ...base, c0: /** @type {Vec2} */ ([c.centro[0], c.centro[1]]), v0: /** @type {Vec2} */ ([c.v?.[0] ?? 0, c.v?.[1] ?? 0]), largo: pos(c.largo, 'el largo', id), t: direccion(c.angulo ?? Math.PI / 2), n: 0, N: 1 };
      return P;
    }
    throw new ErrorMagnetismo(`Circuito de tipo desconocido: ${c.tipo}.`);
  });
  return { regiones, hilos, circuitos, g, n: off };
}

/** B de las regiones y corriente de los hilos en t (con sus derivadas). */
function camposInduccion(P, t) {
  return {
    B: P.regiones.map(r => valorVariable(r.B, r.variacion, t)),
    I: P.hilos.map(h => valorVariable(h.I, h.variacion, t)),
  };
}

/**
 * Flujo (sin el factor N) a través de un polígono antihorario y su
 * derivada parcial respecto del tiempo (campos variables) en t.
 */
function flujoPoligono(P, F, pts) {
  let phi = 0, dphi = 0;
  P.regiones.forEach((r, k) => {
    const [B, dB] = F.B[k]; if (!B && !dB) return;
    const A = areaInterseccion(pts, r.tris); phi += B * A; dphi += dB * A;
  });
  P.hilos.forEach((h, k) => {
    const [I, dI] = F.I[k]; if (!I && !dI) return;
    const J = MU0 / DOS_PI * integralInversaDistancia(h, pts); phi += I * J; dphi += dI * J;
  });
  return [phi, dphi];
}

/** ∫ B_z dl a lo largo del tramo a→b (con el empuje para decidir sobre bordes). */
function integralB(P, F, a, b, empuje) {
  let J = 0;
  P.regiones.forEach((r, k) => {
    const B = F.B[k][0]; if (!B) return;
    if (Math.max(a[0], b[0]) < r.caja[0] || Math.min(a[0], b[0]) > r.caja[1] || Math.max(a[1], b[1]) < r.caja[2] || Math.min(a[1], b[1]) > r.caja[3]) return;
    J += B * largoDentro(a, b, r.pts, empuje);
  });
  P.hilos.forEach((h, k) => { const I = F.I[k][0]; if (I) J += MU0 * I / DOS_PI * integralLineaInversa(h, a, b); });
  return J;
}

/** Geometría de los rieles: extremos de cada barra sobre los rieles − y +. */
function extremosBarra(c, s, phi) {
  const O = c.origen, u = c.u, w = c.w, h = c.d / 2, k = h * Math.tan(phi);
  return [
    /** @type {Vec2} */ ([O[0] + (s - k) * u[0] - h * w[0], O[1] + (s - k) * u[1] - h * w[1]]),
    /** @type {Vec2} */ ([O[0] + (s + k) * u[0] + h * w[0], O[1] + (s + k) * u[1] + h * w[1]]),
  ];
}

/**
 * Polígono (antihorario) del circuito y sus tramos móviles para un estado.
 * @returns {{pts: Vec2[], moviles: Array<{a: Vec2, b: Vec2, v: Vec2, cuerpo: number}>}}
 */
function geometriaCircuito(c, y, t) {
  const o = c.off;
  if (c.tipo === 'rieles') {
    const O = c.origen, h = c.d / 2;
    if (c.barras.length === 1) {
      const b = c.barras[0], [p1, p2] = extremosBarra(c, y[o], b.angulo);
      const pts = [/** @type {Vec2} */ ([O[0] - h * c.w[0], O[1] - h * c.w[1]]), p1, p2, /** @type {Vec2} */ ([O[0] + h * c.w[0], O[1] + h * c.w[1]])];
      return { pts, moviles: [{ a: p1, b: p2, v: [c.u[0] * y[o + 1], c.u[1] * y[o + 1]], cuerpo: 0 }] };
    }
    const [a1, b1] = extremosBarra(c, y[o], c.barras[0].angulo), [a2, b2] = extremosBarra(c, y[o + 2], c.barras[1].angulo);
    return {
      pts: [a1, a2, b2, b1],
      moviles: [{ a: a2, b: b2, v: [c.u[0] * y[o + 3], c.u[1] * y[o + 3]], cuerpo: 1 }, { a: b1, b: a1, v: [c.u[0] * y[o + 1], c.u[1] * y[o + 1]], cuerpo: 0 }],
    };
  }
  if (c.tipo === 'espira') {
    const cx = y[o], cy = y[o + 1], v = /** @type {Vec2} */ ([y[o + 2], y[o + 3]]);
    const pts = c.local.map(p => /** @type {Vec2} */ ([p[0] + cx, p[1] + cy]));
    return { pts, moviles: pts.map((p, i) => ({ a: p, b: pts[(i + 1) % pts.length], v, cuerpo: 0 })) };
  }
  if (c.tipo === 'conductor') {
    const cx = c.c0[0] + c.v0[0] * t, cy = c.c0[1] + c.v0[1] * t, h = c.largo / 2;
    const a = /** @type {Vec2} */ ([cx - c.t[0] * h, cy - c.t[1] * h]), b = /** @type {Vec2} */ ([cx + c.t[0] * h, cy + c.t[1] * h]);
    return { pts: [], moviles: [{ a, b, v: c.v0, cuerpo: 0 }] };
  }
  return { pts: [], moviles: [] };
}

/**
 * Evalúa un circuito en (t, y): flujo, fem (de movimiento y de
 * transformador), corriente, fuerzas magnéticas y las derivadas.
 */
function evaluarCircuito(P, c, t, y, F) {
  const o = c.off;
  if (c.tipo === 'generador') {
    const w = c.omega, ph = w * t + c.fase, NBA = c.N * c.B * c.A;
    const phi = NBA * Math.cos(ph), fem = NBA * w * Math.sin(ph);
    const I = c.conI ? y[o] : fem / c.Rt;
    return { phi, fem, femMov: fem, femTrans: 0, I, fuerzas: [], fuerzaTotal: [0, 0], par: w !== 0 ? fem * I / w : 0, dI: c.conI ? (fem - c.Rt * I) / c.L : 0, potencia: fem * I };
  }
  const G = geometriaCircuito(c, y, t), fB = c.fB ?? 1, N = c.N ?? 1;
  let phi = 0, dphi = 0;
  if (G.pts.length) [phi, dphi] = flujoPoligono(P, F, G.pts);
  let femMov = 0;
  const Js = G.moviles.map(m => {
    const L = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]), tt = [(m.b[0] - m.a[0]) / L, (m.b[1] - m.a[1]) / L];
    const J = integralB(P, F, m.a, m.b, m.v);
    femMov += (m.v[1] * tt[0] - m.v[0] * tt[1]) * J;
    return { J, tt, L };
  });
  phi *= fB * N; femMov *= fB * N;
  // Un circuito que se abrió (la barra salió de los rieles) ya no tiene fem
  if (c.abiertoDesde != null && t >= c.abiertoDesde) { femMov = 0; dphi = 0; }
  const femTrans = -dphi * fB * N, fem = femMov + femTrans;
  let I = 0, dI = 0;
  if (c.tipo === 'conductor' || c.abierto || (c.abiertoDesde != null && t >= c.abiertoDesde)) I = 0;
  else if (c.conI) { I = y[o + 2 * (c.tipo === 'rieles' ? c.nDof : 2)]; dI = (fem - c.Rt * I) / c.L; }
  else I = fem / c.Rt;
  // Fuerza magnética sobre cada tramo móvil: N·I·(t_y, −t_x)·∫B dl (por el factor de B perpendicular)
  const fuerzas = G.moviles.map((m, k) => {
    const { J, tt } = Js[k], f = N * I * J * fB;
    return { a: m.a, b: m.b, F: /** @type {Vec2} */ ([f * tt[1], -f * tt[0]]), cuerpo: m.cuerpo, J };
  });
  const tot = fuerzas.reduce((s, f) => [s[0] + f.F[0], s[1] + f.F[1]], [0, 0]);
  return { phi, fem, femMov, femTrans, I, dI, fuerzas, fuerzaTotal: tot, pts: G.pts, moviles: G.moviles, potencia: fem * I };
}

/**
 * Simula los circuitos de inducción acoplados a su movimiento. Todo el
 * sistema (posiciones, velocidades, corrientes con L y las energías) se
 * integra junto con Dormand–Prince; la fricción seca se resuelve con
 * eventos (la barra se detiene y vuelve a arrancar si la fuerza supera μN).
 * @param {EscenaInduccion} escena
 */
export function simularInduccion(escena) {
  const P = prepararInduccion(escena), T = escena.duracion, dt = escena.dt ?? T / 400, op = escena.opciones || {};
  const rtol = op.rtol ?? 1e-10, atol = op.atol ?? 1e-13;
  // Estado inicial y modos de cada cuerpo con fricción ('mueve' con sentido, o 'parada')
  const y0 = new Array(P.n).fill(0);
  /** @type {Array<{c: number, b: number, modo: 'mueve'|'parada'|'fuera', dir: number}>} */
  const cuerpos = [];
  P.circuitos.forEach((c, ic) => {
    const o = c.off;
    if (c.tipo === 'rieles') c.barras.forEach((b, ib) => { y0[o + 2 * ib] = b.s; y0[o + 2 * ib + 1] = b.vImpuesta ?? b.v; cuerpos.push({ c: ic, b: ib, modo: 'mueve', dir: Math.sign(b.vImpuesta ?? b.v) || 0 }); });
    if (c.tipo === 'espira') { y0[o] = c.c0[0]; y0[o + 1] = c.c0[1]; const v = c.vImpuesta ?? c.v0; y0[o + 2] = c.ejes === 'y' ? 0 : v[0]; y0[o + 3] = c.ejes === 'x' ? 0 : v[1]; }
  });
  const modoDe = (ic, ib) => cuerpos.find(k => k.c === ic && k.b === ib);

  /** Aceleraciones y derivadas de las cuadraturas de un circuito. */
  function derivadaCircuito(c, ic, t, y, dy, F) {
    if (c.abiertoDesde != null && t >= c.abiertoDesde) return null;
    const o = c.off, ev = evaluarCircuito(P, c, t, y, F), R = c.Rt ?? 0, I = ev.I, q = o + (c.tipo === 'generador' ? (c.conI ? 1 : 0) : c.tipo === 'rieles' ? 2 * c.nDof + (c.conI ? 1 : 0) : 4 + (c.conI ? 1 : 0));
    if (c.conI) dy[c.tipo === 'generador' ? o : q - 1] = ev.dI;
    dy[q] = R * I * I;                                            // calor de Joule
    if (c.tipo === 'generador') { dy[q + 4] = ev.fem * I; return ev; }  // trabajo del agente que mantiene ω
    dy[q + 5] = ev.femTrans * I;                                  // energía que entrega el campo variable
    if (c.tipo === 'rieles') {
      c.barras.forEach((b, ib) => {
        const s = y[o + 2 * ib], v = y[o + 2 * ib + 1], md = modoDe(ic, ib);
        dy[o + 2 * ib] = v;
        const fm = ev.fuerzas.find(f => f.cuerpo === ib), Fmag = fm ? fm.F[0] * c.u[0] + fm.F[1] * c.u[1] : 0;
        // Componente de la fuerza magnética perpendicular al plano de los rieles (B vertical): alivia o carga la normal
        const Fn = fm && c.sB ? N_perpendicular(c, I, fm) : 0;
        const Nn = Math.max(0, b.m * c.gc - Fn), Fg = b.m * c.gs, Fresto = Fmag + Fg + b.F;
        if (md.modo === 'fuera') { dy[o + 2 * ib] = 0; dy[o + 2 * ib + 1] = 0; return; }
        let a = 0, Pfr = 0;                                        // aceleración y potencia disipada por fricción
        if (b.vImpuesta != null) {
          // El agente que impone la velocidad hace F_ext = −(F_resto − fricción)
          Pfr = b.mu * Nn * Math.abs(v); dy[q + 4] += -Fresto * v + Pfr;
        } else if (md.modo === 'parada') dy[o + 2 * ib] = 0;
        else { const Ffr = b.mu * Nn * md.dir; a = (Fresto - Ffr) / b.m; Pfr = Math.abs(Ffr * v); }
        dy[o + 2 * ib + 1] = a;
        dy[q + 1] += Pfr;                                          // calor de fricción
        dy[q + 2] += b.F * v;                                      // trabajo de la fuerza aplicada
        dy[q + 3] += Fg * v;                                       // trabajo de la gravedad
        void s;
      });
    } else if (c.tipo === 'espira') {
      const vx = y[o + 2], vy = y[o + 3];
      dy[o] = vx; dy[o + 1] = vy;
      const Ft = [ev.fuerzaTotal[0] + c.m * c.gv[0] + c.Fa[0], ev.fuerzaTotal[1] + c.m * c.gv[1] + c.Fa[1]];
      if (c.vImpuesta) { dy[o + 2] = 0; dy[o + 3] = 0; dy[q + 4] = -(Ft[0] * vx + Ft[1] * vy); }
      else { dy[o + 2] = c.ejes === 'y' ? 0 : Ft[0] / c.m; dy[o + 3] = c.ejes === 'x' ? 0 : Ft[1] / c.m; }
      dy[q + 2] = c.Fa[0] * vx + c.Fa[1] * vy;
      dy[q + 3] = c.m * (c.gv[0] * vx + c.gv[1] * vy);
    }
    return ev;
  }
  const f = (t, y) => {
    const dy = new Array(P.n).fill(0), F = camposInduccion(P, t);
    P.circuitos.forEach((c, ic) => { if (c.tipo !== 'conductor') derivadaCircuito(c, ic, t, y, dy, F); });
    return dy;
  };

  // Eventos geométricos (no terminales): un vértice de un tramo móvil cruza
  // un borde de una región, o un vértice de una región cruza un tramo móvil.
  // Solo se anotan (entrada y salida); el integrador ajusta su paso solo.
  const geom = [];
  const recta = (p, a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return cruz2([(b[0] - a[0]) / L, (b[1] - a[1]) / L], [p[0] - a[0], p[1] - a[1]]); };
  const sobre = (p, a, b) => { const L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1, s = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / L2; return s >= -1e-9 && s <= 1 + 1e-9; };
  P.circuitos.forEach((c, ic) => {
    if (c.tipo === 'generador' || c.tipo === 'conductor') return;
    const movil = (t, y, j) => geometriaCircuito(c, y, t).moviles[j];
    const nm = c.tipo === 'rieles' ? c.barras.length : c.local.length;
    P.regiones.forEach((r, k) => {
      for (let e = 0; e < r.pts.length; e++) {
        const a = r.pts[e], b = r.pts[(e + 1) % r.pts.length];
        for (let j = 0; j < nm; j++) {
          const extremos = c.tipo === 'rieles' ? ['a', 'b'] : ['a'];
          for (const x of extremos) geom.push({ c: ic, region: k, g: (t, y) => recta(movil(t, y, j)[x], a, b), enBorde: (t, y) => sobre(movil(t, y, j)[x], a, b) });
          geom.push({ c: ic, region: k, g: (t, y) => { const m = movil(t, y, j); return recta(a, m.a, m.b); }, enBorde: (t, y) => { const m = movil(t, y, j); return sobre(a, m.a, m.b); } });
        }
      }
    });
  });
  function eventosModo() {
    const r = [];
    cuerpos.forEach((k, j) => {
      const c = P.circuitos[k.c], b = c.barras[k.b], o = c.off + 2 * k.b;
      if (k.modo === 'fuera') return;
      // La barra sale de los rieles (por el extremo de la resistencia o por el final)
      const h = c.d / 2 * Math.abs(Math.tan(b.angulo));
      r.push({ g: (t, y) => y[o] - h, terminal: true, direccion: -1, nombre: `fuera:${j}` });
      r.push({ g: (t, y) => c.largo - h - y[o], terminal: true, direccion: -1, nombre: `fuera:${j}` });
      if (c.barras.length === 2 && k.b === 1) r.push({ g: (t, y) => y[o] - y[c.off] - h - c.d / 2 * Math.abs(Math.tan(c.barras[0].angulo)), terminal: true, direccion: -1, nombre: `choque:${j}` });
      if (b.vImpuesta != null || !(b.mu > 0)) return;
      if (k.modo === 'mueve' && k.dir !== 0) r.push({ g: (t, y) => y[o + 1] * k.dir, terminal: true, direccion: -1, nombre: `alto:${j}` });
      if (k.modo === 'parada') r.push({ g: (t, y) => Math.abs(fuerzaResto(k, t, y)) - b.mu * normal(k, t, y), terminal: true, direccion: 1, nombre: `arranca:${j}` });
    });
    return r;
  }
  function fuerzaResto(k, t, y) {
    const c = P.circuitos[k.c], b = c.barras[k.b], ev = evaluarCircuito(P, c, t, y, camposInduccion(P, t));
    const fm = ev.fuerzas.find(f => f.cuerpo === k.b), Fmag = fm ? fm.F[0] * c.u[0] + fm.F[1] * c.u[1] : 0;
    return Fmag + b.m * c.gs + b.F;
  }
  function normal(k, t, y) {
    const c = P.circuitos[k.c], b = c.barras[k.b], ev = evaluarCircuito(P, c, t, y, camposInduccion(P, t)), fm = ev.fuerzas.find(f => f.cuerpo === k.b);
    return Math.max(0, b.m * c.gc - (fm && c.sB ? N_perpendicular(c, ev.I, fm) : 0));
  }
  // Modo inicial con fricción: una barra en reposo arranca solo si la fuerza supera μN
  cuerpos.forEach(k => {
    const c = P.circuitos[k.c], b = c.barras[k.b];
    if (b.vImpuesta == null && b.mu > 0 && k.dir === 0) {
      const Fr = fuerzaResto(k, 0, y0);
      if (Math.abs(Fr) <= b.mu * normal(k, 0, y0)) k.modo = 'parada'; else k.dir = Math.sign(Fr);
    } else if (k.dir === 0) k.dir = 0;
  });

  const segmentos = [], eventos = [];
  let t = 0, y = y0.slice(), incompleta = null, vueltas = 0;
  const hMax = Math.max(T / 300, 1e-12);
  while (t < T - 1e-14 * T) {
    if (vueltas++ > 2000) { incompleta = { t, motivo: 'Demasiados cambios de modo (la barra se detiene y arranca sin parar).' }; break; }
    const evModo = eventosModo();
    const defs = [...geom.map(g => ({ g: g.g, nombre: 'geom' })), ...evModo];
    const sol = integrar(f, t, y, T, { rtol, atol, eventos: defs, hMax, maxPasos: 400000 });
    segmentos.push({ t0: t, t1: sol.t[sol.t.length - 1], sol, modos: cuerpos.map(k => ({ ...k })) });
    for (const e of sol.eventos) {
      const d = defs[e.indice];
      if (d.nombre !== 'geom') continue;
      const gg = geom[e.indice];
      if (!gg.enBorde(e.t, e.y)) continue;
      const c = P.circuitos[gg.c], rg = P.regiones[gg.region];
      if (eventos.some(x => Math.abs(x.t - e.t) < 1e-7 * T && x.region === gg.region && x.circuito === c.id)) continue;
      // Qué pasó: cuánto de los tramos móviles (o del área) queda dentro antes y después
      const dl = 1e-6 * T, tFinSol = sol.t[sol.t.length - 1];
      const dentro = tt => {
        const G = geometriaCircuito(c, interpolarSegmentos(segmentos, Math.min(Math.max(tt, 0), tFinSol), y0), tt);
        if (c.tipo === 'espira') { const A = Math.abs(areaPoligono(G.pts)); return areaInterseccion(G.pts, rg.tris) / A; }
        return G.moviles.reduce((s, m) => s + largoDentro(m.a, m.b, rg.pts, m.v), 0);
      };
      const antes = dentro(e.t - dl), despues = dentro(e.t + dl), nom = rg.nombre ?? rg.id;
      const verbo = c.tipo === 'espira'
        ? (antes < 1e-6 ? 'entra en' : despues > 1 - 1e-6 ? 'queda dentro de' : despues < 1e-6 ? 'sale de' : antes > 1 - 1e-6 ? 'empieza a salir de' : 'cruza un borde de')
        : (antes < 1e-12 ? 'entra en' : despues < 1e-12 ? 'sale de' : 'cruza un borde de');
      eventos.push({ t: e.t, tipo: 'borde', circuito: c.id, region: gg.region, nombre: `${nombreCircuito(c)} ${verbo} ${nom}` });
    }
    const tFin = sol.t[sol.t.length - 1];
    t = tFin; y = sol.y[sol.y.length - 1].slice();
    if (sol.estado === 'evento') {
      const e = sol.eventos[sol.eventos.length - 1], d = defs[e.indice], [tipo, js] = d.nombre.split(':'), k = cuerpos[+js], c = k ? P.circuitos[k.c] : null;
      if (tipo === 'fuera' || tipo === 'choque') {
        // El circuito se abre: la corriente se corta y las barras se dejan de
        // seguir (conservan su última velocidad, así el registro de energía
        // sigue cuadrando). Si ya no queda nada que simular, la escena termina.
        for (const kk of cuerpos) if (kk.c === k.c) kk.modo = 'fuera';
        c.abiertoDesde = t;
        eventos.push({ t, tipo, circuito: c.id, nombre: tipo === 'choque' ? 'Las barras chocan' : `${c.barras[k.b].nombre ?? c.barras[k.b].id} sale de los rieles` });
        if (c.conI) y[c.off + 2 * c.nDof] = 0;
        if (P.circuitos.every(cc => cc.tipo === 'conductor' || cc.abiertoDesde != null)) break;
      } else if (tipo === 'alto') {
        const o = c.off + 2 * k.b; y[o + 1] = 0;
        const Fr = fuerzaResto(k, t, y), b = c.barras[k.b];
        if (Math.abs(Fr) <= b.mu * normal(k, t, y)) { k.modo = 'parada'; eventos.push({ t, tipo: 'alto', circuito: c.id, nombre: `${b.id} se detiene` }); }
        else k.dir = Math.sign(Fr);
      } else if (tipo === 'arranca') {
        const Fr = fuerzaResto(k, t, y); k.modo = 'mueve'; k.dir = Math.sign(Fr);
        eventos.push({ t, tipo: 'arranca', circuito: c.id, nombre: `${c.barras[k.b].id} vuelve a moverse` });
      }
      continue;
    }
    if (sol.estado !== 'completo') { incompleta = { t, motivo: `El integrador se detuvo (${sol.estado}).` }; break; }
  }
  eventos.sort((a, b) => a.t - b.t);
  const sim = { P, segmentos, eventos, duracion: T, tFin: t, dt, incompleta, y0, muestras: [] };
  // Muestras para gráficas y tablas
  const n = Math.max(1, Math.round(t / dt));
  for (let i = 0; i <= n; i++) sim.muestras.push(estadoInduccion(sim, Math.min(t, i * dt)));
  return sim;
}

/** Componente de la fuerza magnética perpendicular al plano de los rieles (B vertical). */
function N_perpendicular(c, I, fm) {
  // B vertical = B(cos θ n̂ − sen θ û): la parte en el plano (−B sen θ û) empuja la barra fuera del plano con I·∫B dl·sen θ por la componente de la barra a lo largo de ŵ
  const L = Math.hypot(fm.b[0] - fm.a[0], fm.b[1] - fm.a[1]); if (!(L > 0)) return 0;
  const tw = ((fm.b[0] - fm.a[0]) * c.w[0] + (fm.b[1] - fm.a[1]) * c.w[1]) / L;
  return I * fm.J * c.sB * tw;
}

function nombreCircuito(c) { return c.tipo === 'rieles' ? (c.barras.length === 1 ? 'La barra' : 'Una barra') : c.tipo === 'espira' ? 'La espira' : 'El conductor'; }

/** Estado del vector y en t a partir de los tramos integrados. */
function interpolarSegmentos(segmentos, t, y0) {
  if (!segmentos.length) return y0.slice();
  for (const s of segmentos) if (t <= s.t1) return interpolar(s.sol, Math.max(t, s.t0));
  const u = segmentos[segmentos.length - 1];
  return interpolar(u.sol, u.t1);
}

/**
 * Estado completo de la escena de inducción en t: por circuito, posición,
 * velocidad, flujo, fem (de movimiento y de transformador), corriente,
 * fuerzas y el registro de energía.
 * @param {any} sim @param {number} t
 */
export function estadoInduccion(sim, t) {
  const P = sim.P, tt = Math.min(Math.max(0, t), sim.tFin ?? sim.duracion), y = interpolarSegmentos(sim.segmentos, tt, sim.y0), F = camposInduccion(P, tt);
  const circuitos = P.circuitos.map(c => {
    const ev = evaluarCircuito(P, c, tt, y, F), o = c.off;
    const r = { id: c.id, tipo: c.tipo, phi: ev.phi, fem: ev.fem, femMov: ev.femMov, femTrans: ev.femTrans, I: ev.I, fuerzas: ev.fuerzas, fuerzaTotal: ev.fuerzaTotal, potencia: ev.potencia, pts: ev.pts || [], moviles: ev.moviles || [] };
    if (c.tipo === 'rieles') {
      r.s = c.barras.map((_, i) => y[o + 2 * i]); r.v = c.barras.map((_, i) => y[o + 2 * i + 1]);
      r.K = c.barras.reduce((s, b, i) => s + 0.5 * b.m * y[o + 2 * i + 1] ** 2, 0);
      r.Fmag = ev.fuerzas.map(f => f.F[0] * c.u[0] + f.F[1] * c.u[1]);
    } else if (c.tipo === 'espira') {
      r.centro = [y[o], y[o + 1]]; r.vel = [y[o + 2], y[o + 3]]; r.K = 0.5 * c.m * (y[o + 2] ** 2 + y[o + 3] ** 2);
    } else if (c.tipo === 'conductor') {
      r.centro = [c.c0[0] + c.v0[0] * tt, c.c0[1] + c.v0[1] * tt]; r.vel = c.v0.slice(); r.K = 0;
    } else { r.angulo = c.omega * tt + c.fase; r.par = ev.par; r.K = 0; }
    r.UL = c.L > 0 ? 0.5 * c.L * ev.I * ev.I : 0;
    if (c.tipo === 'generador') { const q = o + (c.conI ? 1 : 0); r.QJ = y[q]; r.Wmotor = y[q + 4]; r.Qf = 0; r.WF = 0; r.Wg = 0; r.Wext = y[q + 4]; r.Wcampo = 0; }
    else if (c.tipo === 'conductor') { r.QJ = 0; r.Qf = 0; r.WF = 0; r.Wg = 0; r.Wext = 0; r.Wcampo = 0; }
    else {
      const q = o + (c.tipo === 'rieles' ? 2 * c.nDof : 4) + (c.conI ? 1 : 0);
      r.QJ = y[q]; r.Qf = y[q + 1]; r.WF = y[q + 2]; r.Wg = y[q + 3]; r.Wext = y[q + 4]; r.Wcampo = y[q + 5];
    }
    return r;
  });
  return { t: tt, circuitos };
}

/**
 * Registro de energía de un circuito: entradas (trabajo de la fuerza
 * aplicada, de la gravedad, del agente que impone el movimiento, del campo
 * variable) contra salidas (ΔK, calor de Joule, calor de fricción, ΔU de la
 * bobina). residuo = entradas − salidas ≈ 0.
 * @param {any} sim @param {any} estado de `estadoInduccion` @param {number} [i=0] circuito
 */
export function balanceInduccion(sim, estado, i = 0) {
  const c = estado.circuitos[i], c0 = estadoInduccion(sim, 0).circuitos[i];
  const entradas = c.WF + c.Wg + c.Wext + c.Wcampo, dK = c.K - c0.K, dUL = c.UL - c0.UL;
  return { entradas, dK, dUL, QJ: c.QJ, Qf: c.Qf, residuo: entradas - dK - dUL - c.QJ - c.Qf };
}

/**
 * Flujo magnético exacto a través de un polígono (antihorario) con regiones
 * B y hilos del plano en el instante t (para pruebas y lecturas).
 * @param {{regiones?: Region[], hilos?: any[]}} campos @param {Vec2[]} pts @param {number} [t=0]
 */
export function flujoMagnetico(campos, pts, t = 0) {
  const P = {
    regiones: (campos.regiones || []).map((r, i) => prepararRegion({ tipo: 'B', ...r }, i)),
    hilos: (campos.hilos || []).map(h => ({ ...h, a: [h.a[0], h.a[1]], u: direccion(h.angulo) })),
  };
  return flujoPoligono(P, camposInduccion(P, t), antihorario(pts))[0];
}

/**
 * Fem de un generador de bobina giratoria: ε = N·B·A·ω·sen(ωt + fase), con
 * Φ = N·B·A·cos(ωt + fase) (positiva en el sentido que da flujo positivo).
 * @param {{N: number, B: number, A: number, omega: number, fase?: number}} g @param {number} t
 */
export const femGenerador = (g, t) => g.N * g.B * g.A * g.omega * Math.sin(g.omega * t + (g.fase ?? 0));

/**
 * Velocidad terminal de una barra sobre rieles: el peso a lo largo de los
 * rieles (o la fuerza aplicada) se equilibra con la fuerza magnética:
 * v_t = (m·g·sen θ + F)·R / (B·cos θ·L)² (cos θ solo con B vertical).
 * @param {{m: number, g?: number, inclinacion?: number, F?: number, R: number, B: number, L: number, bVertical?: boolean}} p
 */
export function velocidadTerminal(p) {
  const th = p.inclinacion ?? 0, Bn = p.B * (p.bVertical ? Math.cos(th) : 1);
  return (p.m * (p.g ?? G_GRAVEDAD) * Math.sin(th) + (p.F ?? 0)) * p.R / (Bn * Bn * p.L * p.L);
}
