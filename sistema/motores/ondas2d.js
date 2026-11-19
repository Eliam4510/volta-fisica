/* ==========================================================================
   Volta — motor de la cubeta de ondas (2D)
   Puro (sin DOM), en SI. Dos partes:
   1. Malla: ecuación de onda ∂²u/∂t² = ∇·(v²∇u) − σ·∂u/∂t + f(x, y, t) por
      diferencias finitas (salto de rana, 2.º orden en x, y y t) sobre una
      malla cuadrada de paso h. La rapidez v(x, y) cambia por zonas (aguas
      someras sobre un vidrio, aire a otra temperatura, con gradiente
      lineal): la refracción, n = v₁/v₂ y la ley de Snell salen solas, y la
      frecuencia no cambia al pasar de una zona a otra.
      Coeficientes en las caras: v² medio de los dos nodos; las caras que
      tocan una barrera o una rendija valen 0 (pared rígida: no hay flujo,
      ∂u/∂n = 0, y la onda se refleja sin invertirse, como el agua contra un
      muro o el sonido contra una pared). Bordes de la cubeta: reflectantes
      (la misma pared) o absorbentes, que simulan el espacio abierto con una
      capa amortiguadora fuera de la región visible, σ(d) = σmáx·(d/W)².
      Paso bajo la condición CFL de 2D, v_máx·Δt/h ≤ 1/√2 (un paso explícito
      mayor se rechaza).
      Fuentes: forzamiento f = F(t)·δ(x − p) repartido en los cuatro nodos
      vecinos (bilineal), así que la fuente puede estar en cualquier punto y
      moverse. F = 4πv²A·s(t) da, para una senoidal, amplitud A a una
      longitud de onda de la fuente (campo lejano A·√(λ/r)). Fuente lineal:
      F′ = 2vωA·cos θ por unidad de largo, onda plana de amplitud A a cada
      lado que atrasa π/2; con desvío θ, cada punto emite con retraso
      s·sen θ/v y la onda sale inclinada θ.
      Película: cuadros de la región visible (Int16 cuantizados) cada pocos
      pasos, para volver a cualquier instante sin recalcular, registrar
      u(t) en cualquier punto y medir la amplitud en una pantalla.
   2. Superposición analítica de fuentes puntuales en un medio uniforme:
      función de Green 2D exacta (Hankel H₀⁽²⁾ con J₀ e Y₀) o de campo
      lejano A·√(λ/r)·sen(ωt + φ − kr − π/4) (en 2D, una fuente puntual
      atrasa π/4 respecto de la fase del camino); diferencia de caminos,
      líneas nodales |r₁ − r₂| = (m + ½)λ y antinodales mλ (hipérbolas, con
      el desfase de las fuentes), frentes y ley de Snell. Sirve para
      comparar con la malla y para dibujar al instante.
   Lo usan la pantalla «Cubeta de ondas» y pruebas/ondas2d.test.js.
   ========================================================================== */
import { senal } from './ondas.js';

const DOS_PI = 2 * Math.PI;
const RAIZ_2 = Math.SQRT2;

/** Courant máximo estable del salto de rana en 2D (malla cuadrada). */
export const COURANT_MAX = 1 / RAIZ_2;

// ---------------------------------------------------------------------------
// Funciones de Bessel J₀ e Y₀ (aproximaciones racionales de Numerical
// Recipes, error absoluto < 10⁻⁸)
// ---------------------------------------------------------------------------

/** J₀(x). @param {number} x */
export function besselJ0(x) {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const a = 57568490574.0 + y * (-13362590354.0 + y * (651619640.7 + y * (-11214424.18 + y * (77392.33017 + y * (-184.9052456)))));
    const b = 57568490411.0 + y * (1029532985.0 + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y))));
    return a / b;
  }
  const z = 8 / ax, y = z * z, xx = ax - 0.785398164;
  const a = 1 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6)));
  const b = -0.1562499995e-1 + y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 - y * 0.934935152e-7)));
  return Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * a - z * Math.sin(xx) * b);
}

/** Y₀(x), x > 0. @param {number} x */
export function besselY0(x) {
  if (x < 8) {
    const y = x * x;
    const a = -2957821389.0 + y * (7062834065.0 + y * (-512359803.6 + y * (10879881.29 + y * (-86327.92757 + y * 228.4622733))));
    const b = 40076544269.0 + y * (745249964.8 + y * (7189466.438 + y * (47447.26470 + y * (226.1030244 + y))));
    return a / b + 0.636619772 * besselJ0(x) * Math.log(x);
  }
  const z = 8 / x, y = z * z, xx = x - 0.785398164;
  const a = 1 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6)));
  const b = -0.1562499995e-1 + y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 - y * 0.934935152e-7)));
  return Math.sqrt(0.636619772 / x) * (Math.sin(xx) * a + z * Math.cos(xx) * b);
}

// ---------------------------------------------------------------------------
// Fórmulas cerradas
// ---------------------------------------------------------------------------

/** Longitud de onda λ = v/f. @param {number} v @param {number} f */
export const longitudOnda = (v, f) => v / f;

/** Índice de refracción relativo de la zona 1 a la 2: n₁₂ = v₁/v₂. @param {number} v1 @param {number} v2 */
export const indiceRelativo = (v1, v2) => v1 / v2;

/**
 * Ley de Snell para ondas: sen θ₁/sen θ₂ = v₁/v₂. Devuelve θ₂ (rad) o null
 * si hay reflexión total.
 * @param {number} theta1 ángulo con la normal (rad) @param {number} v1 @param {number} v2
 */
export function snell(theta1, v1, v2) {
  const s = Math.sin(theta1) * v2 / v1;
  return Math.abs(s) > 1 ? null : Math.asin(s);
}

/** Ángulo límite (rad) al pasar de v₁ a v₂ > v₁; null si v₂ ≤ v₁. @param {number} v1 @param {number} v2 */
export const anguloLimite = (v1, v2) => (v2 > v1 ? Math.asin(v1 / v2) : null);

/**
 * Diferencia de caminos de P a A y a B: Δ = |PA| − |PB|.
 * @param {number[]} p @param {number[]} a @param {number[]} b
 */
export const diferenciaCaminos = (p, a, b) => Math.hypot(p[0] - a[0], p[1] - a[1]) - Math.hypot(p[0] - b[0], p[1] - b[1]);

// ---------------------------------------------------------------------------
// Tipos de la escena
// ---------------------------------------------------------------------------

/** @typedef {[number, number]} V2 */

/**
 * @typedef {Object} FuentePuntual
 * @property {V2} p  posición en t = 0 (m)
 * @property {V2} [v] velocidad constante (m/s): fuente que se mueve
 * @property {'senoidal'|'pulso'|'ondicula'} [forma='senoidal']
 * @property {number} amplitud  senoidal: amplitud a una longitud de onda (m)
 * @property {number} [frecuencia] Hz (senoidal; frecuencia central de la ondícula)
 * @property {number} [fase=0] rad: s(t) = sen(2πft + φ) con t absoluto
 * @property {number} [inicio=0] s (−∞: suena desde siempre en el modelo analítico)
 * @property {number} [rampa] s: arranque suave (un periodo por defecto)
 * @property {number} [duracion] s: deja de sonar después
 * @property {number} [ancho] s: σ del pulso gaussiano
 */

/**
 * @typedef {Object} FuenteLineal
 * @property {V2} a @property {V2} b  extremos (m)
 * @property {number} amplitud  amplitud de la onda plana (m)
 * @property {number} frecuencia Hz
 * @property {number} [fase=0] rad
 * @property {number} [desvio=0] rad: dirección de la onda respecto de la normal (la fase avanza a lo largo)
 * @property {number} [inicio=0] @property {number} [rampa] @property {number} [duracion]
 * @property {boolean} [suavizar=true] atenúa los extremos (coseno) para que la onda plana no se ensucie por los bordes
 * @property {'senoidal'|'pulso'|'ondicula'} [forma='senoidal'] @property {number} [ancho]
 */

/**
 * @typedef {Object} Barrera
 * @property {V2} a @property {V2} b  extremos (m)
 * @property {number} [grosor] m (al menos 1.5 h)
 */

/**
 * @typedef {Object} Rendija  pared con n aberturas iguales
 * @property {V2} centro  centro de las aberturas (m)
 * @property {number} [angulo=π/2] rad: dirección de la pared (π/2: pared vertical)
 * @property {number} ancho  ancho de cada abertura (m)
 * @property {number} [separacion] distancia entre centros (m), si n > 1
 * @property {number} [n=1]
 * @property {number} [largo] largo de la pared (m); por defecto cruza toda la cubeta
 * @property {number} [grosor] m
 */

/**
 * @typedef {Object} Zona  región de otra rapidez
 * @property {'rect'|'poligono'} forma
 * @property {number} [x0] @property {number} [x1] @property {number} [y0] @property {number} [y1]  rectángulo (m)
 * @property {V2[]} [puntos] polígono (m)
 * @property {number} rapidez  m/s (en y0 si hay gradiente)
 * @property {number} [rapidez1] m/s en y1: la rapidez cambia linealmente con y (solo rect)
 */

/**
 * @typedef {Object} EscenaCubeta
 * @property {{x0: number, x1: number, y0: number, y1: number}} caja  región visible (m)
 * @property {number} rapidez  rapidez del medio base (m/s)
 * @property {FuentePuntual[]} [fuentes]
 * @property {FuenteLineal[]} [lineas]
 * @property {Barrera[]} [barreras]
 * @property {Rendija[]} [rendijas]
 * @property {Zona[]} [zonas]
 * @property {{izq?: string, der?: string, abajo?: string, arriba?: string}} [bordes] 'absorbente' (por defecto) o 'reflectante'
 * @property {number} [h]  paso de la malla (m)
 * @property {number} [puntosPorLambda=16]  si no se da h: nodos por la longitud de onda más corta
 * @property {number} [courant=0.6]  ν = v_máx·Δt/h (≤ 1/√2)
 * @property {number} [dt]  paso explícito (se comprueba la condición CFL)
 * @property {number} [capa]  ancho de la capa absorbente (m); por defecto 1.5 λ más larga
 * @property {number} [absorcion=12]  σmáx·W/v de la capa
 * @property {number} [amortiguamiento=0] β (1/s): cada modo decae como e^(−βt)
 * @property {V2[]} [sondas]  puntos donde se registra u en cada paso
 * @property {number} [maxNodos=600000] si la resolución pedida da más nodos, se agranda h
 */

/** @param {any} x @param {string} que */
function positivo(x, que) {
  if (!(Number.isFinite(x) && x > 0)) throw new RangeError(`${que} debe ser un número positivo.`);
  return x;
}

/** Frecuencia característica de una fuente (Hz). @param {any} f */
function frecuenciaDe(f) {
  if ((f.forma ?? 'senoidal') === 'pulso') return 1 / (DOS_PI * (f.ancho ?? 0.1));
  return f.frecuencia;
}
/** Frecuencia más baja que lleva una fuente con energía apreciable (Hz). @param {any} f */
const frecuenciaBajaDe = f => (f.forma === 'ondicula' ? 0.5 : f.forma === 'pulso' ? 0.25 : 1) * frecuenciaDe(f);

/**
 * Señal de una fuente: senoidal (con rampa sen² de un periodo por defecto),
 * pulso gaussiano o ondícula de Ricker (segunda derivada de una gaussiana,
 * de media nula: un frente compacto, bueno para medir tiempos de llegada).
 * @param {any} f @param {number} t
 */
export function senalFuente(f, t) {
  const forma = f.forma ?? 'senoidal', t0 = f.inicio ?? 0;
  if (t < t0 || (f.duracion != null && t > t0 + f.duracion)) return 0;
  if (forma === 'senoidal') {
    // Igual que la senoidal de ondas.js (arranque sen²), sin crear objetos en cada paso
    let y = Math.sin(DOS_PI * f.frecuencia * t + (f.fase ?? 0));
    const r = f.rampa ?? 1 / f.frecuencia;
    if (r > 0 && Number.isFinite(t0) && t - t0 < r) y *= Math.sin(Math.PI / 2 * (t - t0) / r) ** 2;
    return y;
  }
  if (forma === 'pulso') return senal({ forma: 'pulso', amplitud: 1, inicio: t0, ancho: f.ancho ?? 0.1 }, t)[0];
  if (forma === 'ondicula') {
    // Centro 1.5/f después del inicio; a = (π f (t − tc))²
    const tc = t0 + 1.5 / f.frecuencia, a = (Math.PI * f.frecuencia * (t - tc)) ** 2;
    return a > 30 ? 0 : (1 - 2 * a) * Math.exp(-a);
  }
  throw new Error(`Forma de fuente desconocida: ${forma}`);
}

/**
 * Arreglo de n fuentes puntuales iguales en línea recta, con desfase
 * constante entre vecinas: con desfase 0 forman una onda plana hacia los
 * dos lados; con desfase, la onda sale inclinada (sen θ = −Δφ·λ/(2πd)).
 * @param {{centro: V2, n: number, separacion: number, angulo?: number, desfase?: number, amplitud: number, frecuencia: number, fase?: number, inicio?: number}} p
 * @returns {FuentePuntual[]}
 */
export function arregloFuentes({ centro, n, separacion, angulo = Math.PI / 2, desfase = 0, amplitud, frecuencia, fase = 0, inicio = 0 }) {
  const r = /** @type {FuentePuntual[]} */ ([]), c = Math.cos(angulo), s = Math.sin(angulo);
  for (let i = 0; i < n; i++) {
    const u = (i - (n - 1) / 2) * separacion;
    r.push({ p: /** @type {V2} */ ([centro[0] + c * u, centro[1] + s * u]), amplitud, frecuencia, fase: fase + i * desfase, inicio });
  }
  return r;
}

// ---------------------------------------------------------------------------
// Geometría
// ---------------------------------------------------------------------------

/** Distancia del punto (x, y) al segmento AB. */
function distSegmento(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  let u = L2 > 0 ? ((x - a[0]) * dx + (y - a[1]) * dy) / L2 : 0;
  u = Math.max(0, Math.min(1, u));
  return Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy);
}

/** Punto dentro de un polígono (regla par–impar). @param {number} x @param {number} y @param {number[][]} P */
export function dentroPoligono(x, y, P) {
  let d = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) d = !d;
  }
  return d;
}

/**
 * Rapidez del medio en (x, y) según las zonas (la última que contiene el
 * punto manda).
 * @param {{rapidez: number, zonas?: Zona[]}} escena @param {number} x @param {number} y
 */
export function rapidezEn(escena, x, y) {
  let v = escena.rapidez;
  for (const z of escena.zonas || []) {
    if (z.forma === 'poligono') { if (z.puntos && z.puntos.length >= 3 && dentroPoligono(x, y, z.puntos)) v = z.rapidez; }
    else if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) {
      v = z.rapidez1 != null && z.y1 > z.y0 ? z.rapidez + (z.rapidez1 - z.rapidez) * (y - z.y0) / (z.y1 - z.y0) : z.rapidez;
    }
  }
  return v;
}

/** Rapidez máxima y mínima de la escena. @param {EscenaCubeta} e */
function extremosRapidez(e) {
  let lo = e.rapidez, hi = e.rapidez;
  for (const z of e.zonas || []) for (const v of [z.rapidez, z.rapidez1]) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return [lo, hi];
}

/** Segmentos sólidos de una rendija (pared menos las aberturas). @param {Rendija} r @param {number} largoDefecto */
export function segmentosRendija(r, largoDefecto) {
  const ang = r.angulo ?? Math.PI / 2, t = [Math.cos(ang), Math.sin(ang)], n = Math.max(1, Math.round(r.n ?? 1));
  const d = n > 1 ? (r.separacion ?? 2 * r.ancho) : 0, L = (r.largo ?? largoDefecto) / 2;
  // Aberturas [u0, u1] a lo largo de la pared (u = 0 en el centro)
  const huecos = [];
  for (let i = 0; i < n; i++) { const c = (i - (n - 1) / 2) * d; huecos.push([c - r.ancho / 2, c + r.ancho / 2]); }
  const tramos = [];
  let u = -L;
  for (const [a, b] of huecos) { if (a > u) tramos.push([u, Math.min(a, L)]); u = Math.max(u, b); }
  if (u < L) tramos.push([u, L]);
  const P = s => /** @type {V2} */ ([r.centro[0] + t[0] * s, r.centro[1] + t[1] * s]);
  return tramos.filter(([a, b]) => b > a).map(([a, b]) => ({ a: P(a), b: P(b) }));
}

// ---------------------------------------------------------------------------
// Utilidades de series
// ---------------------------------------------------------------------------

/** Arreglo de Float64 que crece. */
class Serie {
  constructor(n = 256) { this.d = new Float64Array(n); this.n = 0; }
  /** @param {number} v */
  push(v) { if (this.n === this.d.length) { const o = new Float64Array(this.d.length * 2); o.set(this.d); this.d = o; } this.d[this.n++] = v; }
  valores() { return this.d.subarray(0, this.n); }
}

/**
 * Fasor de una señal senoidal de frecuencia f: ajuste por mínimos cuadrados
 * y ≈ a·cos ωt + b·sen ωt + c sobre las muestras de [desde, hasta] (la
 * constante c absorbe la estela lenta que deja el arranque de una fuente en
 * 2D). Devuelve la amplitud R y la fase φ de y = R·sen(ωt + φ) + c.
 * @param {ArrayLike<number>} t @param {ArrayLike<number>} y @param {number} f
 * @param {number} [desde=-Infinity] @param {number} [hasta=Infinity]
 */
export function fasor(t, y, f, desde = -Infinity, hasta = Infinity) {
  const w = DOS_PI * f;
  // Ecuaciones normales 3 × 3 para (a, b, c)
  let cc = 0, ss = 0, cs = 0, c1 = 0, s1 = 0, n = 0, yc = 0, ys = 0, y1 = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] < desde || t[i] > hasta) continue;
    const c = Math.cos(w * t[i]), s = Math.sin(w * t[i]);
    cc += c * c; ss += s * s; cs += c * s; c1 += c; s1 += s; n++; yc += y[i] * c; ys += y[i] * s; y1 += y[i];
  }
  const M = [[cc, cs, c1], [cs, ss, s1], [c1, s1, n]], r = [yc, ys, y1];
  const det3 = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det3(M);
  if (n < 4 || !(Math.abs(D) > 1e-12 * n ** 3)) return { amplitud: 0, fase: 0, a: 0, b: 0, c: 0, n };
  const col = k => M.map((fila, i) => fila.map((v, j) => (j === k ? r[i] : v)));
  const a = det3(col(0)) / D, b = det3(col(1)) / D, c = det3(col(2)) / D;
  return { amplitud: Math.hypot(a, b), fase: Math.atan2(a, b), a, b, c, n };
}

/**
 * Frecuencia medida de una serie casi senoidal cerca de f: el fasor se
 * calcula en dos mitades de [desde, hasta] y la fase que avanza entre ellas
 * da la diferencia con f.
 * @param {ArrayLike<number>} t @param {ArrayLike<number>} y @param {number} f @param {number} desde @param {number} hasta
 */
export function frecuenciaMedida(t, y, f, desde, hasta) {
  const m = (desde + hasta) / 2, A = fasor(t, y, f, desde, m), B = fasor(t, y, f, m, hasta);
  let d = B.fase - A.fase; d = Math.atan2(Math.sin(d), Math.cos(d));
  return f + d / (DOS_PI * (m - desde));
}

// ---------------------------------------------------------------------------
// Malla
// ---------------------------------------------------------------------------

/**
 * Cubeta de ondas en una malla. Se crea con la escena y avanza paso a paso
 * (paso(), avanzar(n), avanzarHasta(t)); u es el desplazamiento en el
 * instante t. Si se pide película, guarda cuadros de la región visible.
 */
export class Cubeta {
  /**
   * @param {EscenaCubeta} escena
   * @param {{pelicula?: {intervalo?: number, escala?: number, maxBytes?: number}}} [o]
   */
  constructor(escena, o = {}) {
    const e = escena, caja = e.caja;
    if (!caja || !(caja.x1 > caja.x0 && caja.y1 > caja.y0)) throw new RangeError('La cubeta necesita una región con ancho y alto positivos.');
    positivo(e.rapidez, 'La rapidez del medio');
    for (const z of e.zonas || []) { positivo(z.rapidez, 'La rapidez de una zona'); if (z.rapidez1 != null) positivo(z.rapidez1, 'La rapidez de una zona'); }
    const fuentes = (e.fuentes || []).map(f => ({ ...f, forma: f.forma ?? 'senoidal' }));
    const lineas = (e.lineas || []).map(f => ({ ...f, forma: f.forma ?? 'senoidal' }));
    for (const f of [...fuentes, ...lineas]) {
      if (f.forma === 'pulso') positivo(f.ancho ?? 0.1, 'El ancho del pulso'); else positivo(f.frecuencia, 'La frecuencia de una fuente');
      if (!Number.isFinite(f.amplitud)) throw new RangeError('La amplitud de una fuente debe ser un número.');
    }
    const [vMin, vMax] = extremosRapidez(e);
    this.vMax = vMax; this.vMin = vMin;
    // Paso de malla: nodos por la longitud de onda más corta (rapidez mínima, frecuencia máxima)
    const frecs = [...fuentes, ...lineas].map(frecuenciaDe).filter(x => x > 0);
    const fMax = frecs.length ? Math.max(...frecs) : vMin / ((caja.x1 - caja.x0) / 20);
    const bajas = [...fuentes, ...lineas].map(frecuenciaBajaDe).filter(x => x > 0);
    const fMin = bajas.length ? Math.min(...bajas) : fMax;
    this.lambdaMin = vMin / fMax; this.lambdaMax = vMax / fMin;
    let h = e.h ?? this.lambdaMin / (e.puntosPorLambda ?? 16);
    positivo(h, 'El paso de la malla');
    const W0 = e.capa ?? Math.max(1.5 * this.lambdaMax, 0);
    const bordes = { izq: 'absorbente', der: 'absorbente', abajo: 'absorbente', arriba: 'absorbente', ...(e.bordes || {}) };
    for (const k of Object.keys(bordes)) if (!['absorbente', 'reflectante'].includes(bordes[k])) throw new RangeError(`Borde desconocido: ${bordes[k]}`);
    // Nodos (con la capa y un anillo sólido de relleno); si son demasiados, se agranda h
    const maxNodos = e.maxNodos ?? 600000;
    const cuenta = hh => {
      const nc = bordes => (bordes === 'absorbente' ? Math.max(10, Math.ceil(W0 / hh)) : 0);
      const nvx = Math.ceil((caja.x1 - caja.x0) / hh - 1e-9) + 1, nvy = Math.ceil((caja.y1 - caja.y0) / hh - 1e-9) + 1;
      return { nvx, nvy, ci: nc(bordes.izq), cd: nc(bordes.der), cb: nc(bordes.abajo), ca: nc(bordes.arriba) };
    };
    let c = cuenta(h);
    const hPedido = h;
    while ((c.nvx + c.ci + c.cd + 2) * (c.nvy + c.cb + c.ca + 2) > maxNodos) { h *= 1.1; c = cuenta(h); }
    this.aviso = h > hPedido * 1.0001 ? { motivo: 'resolucion', hPedido, h } : null;
    this.h = h; this.bordes = bordes; this.caja = { ...caja };
    const nx = c.nvx + c.ci + c.cd + 2, ny = c.nvy + c.cb + c.ca + 2;
    this.nx = nx; this.ny = ny;
    // Nodo (i, j) en x = xg + i·h, y = yg + j·h; la región visible empieza en (1 + ci, 1 + cb)
    this.xg = caja.x0 - (1 + c.ci) * h; this.yg = caja.y0 - (1 + c.cb) * h;
    this.ventana = { i0: 1 + c.ci, j0: 1 + c.cb, nx: c.nvx, ny: c.nvy, x0: caja.x0, y0: caja.y0, h };
    this.capas = c;

    // Paso de tiempo bajo la condición CFL
    this.dtMax = h / (vMax * RAIZ_2);
    let dt;
    if (e.dt != null) {
      positivo(e.dt, 'El paso de tiempo');
      if (e.dt > this.dtMax * (1 + 1e-12)) throw new RangeError(`El paso Δt = ${e.dt.toPrecision(4)} s no cumple la condición CFL: con esta malla el máximo estable es ${this.dtMax.toPrecision(4)} s.`);
      dt = e.dt;
    } else {
      const nu = e.courant ?? 0.6;
      if (!(nu > 0 && nu <= COURANT_MAX + 1e-12)) throw new RangeError(`El número de Courant ${nu} no cumple la condición CFL (máximo 1/√2 ≈ 0.7071).`);
      dt = nu * h / vMax;
    }
    this.dt = dt; this.courant = vMax * dt / h;

    // Rapidez en los nodos (promedio de v² en 3 × 3 submuestras: fronteras suaves) y sólidos
    const N = nx * ny, v2 = new Float64Array(N), solido = new Uint8Array(N);
    const tieneZonas = (e.zonas || []).length > 0;
    // El anillo exterior es pared en los lados reflectantes; en los absorbentes,
    // nodos con la condición de Mur de primer orden (lo poco que cruza la capa sale)
    const ladoDe = (i, j) => [i === 0 && 'izq', i === nx - 1 && 'der', j === 0 && 'abajo', j === ny - 1 && 'arriba'].filter(Boolean);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = this.xg + i * h, y = this.yg + j * h;
      const lados = ladoDe(i, j);
      if (lados.length && lados.some(l => bordes[l] === 'reflectante')) { solido[k] = 1; continue; }
      if (!tieneZonas) { v2[k] = e.rapidez * e.rapidez; continue; }
      let s = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const vv = rapidezEn(e, x + a * h / 3, y + b * h / 3); s += vv * vv; }
      v2[k] = s / 9;
    }
    // Barreras y rendijas: nodos a menos de medio grosor del segmento
    const diag = Math.hypot(nx * h, ny * h);
    const segs = [...(e.barreras || []).map(b => ({ a: b.a, b: b.b, g: b.grosor })),
      ...(e.rendijas || []).flatMap(r => segmentosRendija(r, 3 * diag).map(s => ({ ...s, g: r.grosor })))];
    for (const s of segs) {
      const g2 = Math.max((s.g ?? 2 * h) / 2, 0.75 * h);
      const i0 = Math.max(1, Math.floor((Math.min(s.a[0], s.b[0]) - g2 - this.xg) / h)), i1 = Math.min(nx - 2, Math.ceil((Math.max(s.a[0], s.b[0]) + g2 - this.xg) / h));
      const j0 = Math.max(1, Math.floor((Math.min(s.a[1], s.b[1]) - g2 - this.yg) / h)), j1 = Math.min(ny - 2, Math.ceil((Math.max(s.a[1], s.b[1]) + g2 - this.yg) / h));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (distSegmento(this.xg + i * h, this.yg + j * h, s.a, s.b) <= g2 + 1e-12) solido[j * nx + i] = 1;
    }
    for (let k = 0; k < N; k++) if (solido[k]) v2[k] = 0;
    // Caras: v² medio; 0 si toca un sólido
    const kE = new Float64Array(N), kN = new Float64Array(N);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (solido[k]) continue;
      if (i + 1 < nx && !solido[k + 1]) kE[k] = 0.5 * (v2[k] + v2[k + 1]);
      if (j + 1 < ny && !solido[k + nx]) kN[k] = 0.5 * (v2[k] + v2[k + nx]);
    }
    // Amortiguamiento: capa absorbente (σ crece como (d/W)²) y global 2β
    const beta = e.amortiguamiento ?? 0, kap = e.absorcion ?? 12;
    const sig = new Float64Array(N);
    const W = { izq: c.ci * h, der: c.cd * h, abajo: c.cb * h, arriba: c.ca * h };
    const xv0 = caja.x0, xv1 = caja.x0 + (c.nvx - 1) * h, yv0 = caja.y0, yv1 = caja.y0 + (c.nvy - 1) * h;
    for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i, x = this.xg + i * h, y = this.yg + j * h, vv = Math.sqrt(v2[k]) || vMax;
      let s = 2 * beta;
      const capa = (d, w) => { if (d > 0 && w > 0) { const q = Math.min(1, d / w); s += kap * vv / w * q * q; } };
      capa(xv0 - x, W.izq); capa(x - xv1, W.der); capa(yv0 - y, W.abajo); capa(y - yv1, W.arriba);
      sig[k] = s;
    }
    const ca = new Float64Array(N), cb = new Float64Array(N), cl = new Float64Array(N), cf = new Float64Array(N);
    const r2 = dt * dt / (h * h);
    for (let k = 0; k < N; k++) {
      if (solido[k]) continue;
      const den = 1 + sig[k] * dt / 2;
      ca[k] = 2 / den; cb[k] = (1 - sig[k] * dt / 2) / den; cl[k] = r2 / den; cf[k] = dt * dt / den / (h * h);
    }
    // Mur en el anillo: u₀⁺ = u₁ + (vΔt − δ)/(vΔt + δ)·(u₁⁺ − u₀), con u₁ el vecino hacia dentro
    const mur = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const lados = ladoDe(i, j), k = j * nx + i;
      if (!lados.length || solido[k]) continue;
      const di = i === 0 ? 1 : i === nx - 1 ? -1 : 0, dj = j === 0 ? 1 : j === ny - 1 ? -1 : 0;
      const dist = h * Math.hypot(di, dj), vv = Math.sqrt(v2[k]) || vMax;
      mur.push(k, k + di + dj * nx, (vv * dt - dist) / (vv * dt + dist));
    }
    this._mur = Float64Array.from(mur);
    /** v² en cada nodo (0 en las paredes) */ this.v2 = v2;
    /** 1 en los nodos de pared */ this.solido = solido;
    /** v² en las caras este y norte de cada nodo */ this.kE = kE; this.kN = kN;
    /** σ en cada nodo (1/s) */ this.sigma = sig;
    // Coeficientes del paso: u⁺ = ca·u − cb·u⁻ + cl·(Laplaciano) + cf·(forzamiento)
    this.ca = ca; this.cb = cb; this.cl = cl; this.cf = cf;
    this.u = new Float64Array(N); this.uAnt = new Float64Array(N);
    this.t = 0; this.n = 0;

    // Fuentes: puntuales (con su velocidad) y lineales (puntos cada h/2 con su peso y su fase)
    this.fuentes = fuentes.map(f => ({ ...f, F: 4 * Math.PI * rapidezEn(e, f.p[0], f.p[1]) ** 2 * f.amplitud }));
    this.lineas = lineas.map(f => {
      const L = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]), m = Math.max(1, Math.ceil(L / (h / 2))), ds = L / m;
      const vm = rapidezEn(e, (f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2), fr = frecuenciaDe(f) || 1;
      const sd = Math.sin(f.desvio ?? 0), puntos = [];
      for (let q = 0; q <= m; q++) {
        const u = q / m, s = (u - 0.5) * L;
        // Peso: regla del trapecio con suavizado coseno en el 15 % de cada extremo
        let w = (q === 0 || q === m) ? ds / 2 : ds;
        if (f.suavizar !== false) { const borde = Math.min(u, 1 - u) / 0.15; if (borde < 1) w *= Math.sin(Math.PI / 2 * borde) ** 2; }
        // Desvío: cada punto emite con el retraso s·sen θ/v (la onda sale inclinada θ)
        if (w > 0) puntos.push({ p: [f.a[0] + (f.b[0] - f.a[0]) * u, f.a[1] + (f.b[1] - f.a[1]) * u], w, retraso: s * sd / vm });
      }
      // Con desvío θ la onda viaja con kₙ = k·cos θ hacia fuera: F′ = 2vωA·cos θ para que su amplitud siga siendo A
      return { ...f, puntos, F: 2 * vm * DOS_PI * fr * f.amplitud * Math.cos(f.desvio ?? 0) };
    });

    // Sondas: u en cada paso
    this.sondas = (e.sondas || []).map(p => ({ p: /** @type {V2} */ ([p[0], p[1]]), t: new Serie(), y: new Serie() }));
    this._registrar();

    // Película
    this.pelicula = o.pelicula ? new Pelicula(this, o.pelicula) : null;
  }

  /** Cantidad de nodos de la malla (con la capa). */
  get nodos() { return this.nx * this.ny; }

  /** Valor bilineal de un campo de la malla en (x, y). @param {Float64Array} campo @param {number} x @param {number} y */
  _bilineal(campo, x, y) {
    const h = this.h, u = (x - this.xg) / h, w = (y - this.yg) / h;
    const i = Math.max(0, Math.min(this.nx - 2, Math.floor(u))), j = Math.max(0, Math.min(this.ny - 2, Math.floor(w)));
    const a = Math.max(0, Math.min(1, u - i)), b = Math.max(0, Math.min(1, w - j)), k = j * this.nx + i;
    return (1 - a) * (1 - b) * campo[k] + a * (1 - b) * campo[k + 1] + (1 - a) * b * campo[k + this.nx] + a * b * campo[k + this.nx + 1];
  }

  /** Desplazamiento en (x, y) en el instante actual. @param {number} x @param {number} y */
  valor(x, y) { return this._bilineal(this.u, x, y); }

  /** Rapidez del medio en un nodo cercano a (x, y) (0 dentro de una barrera). @param {number} x @param {number} y */
  rapidezNodo(x, y) {
    const i = Math.round((x - this.xg) / this.h), j = Math.round((y - this.yg) / this.h);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.ny) return 0;
    return Math.sqrt(this.v2[j * this.nx + i]);
  }

  /** ¿Hay pared en el nodo más cercano a (x, y)? @param {number} x @param {number} y */
  esSolido(x, y) {
    const i = Math.round((x - this.xg) / this.h), j = Math.round((y - this.yg) / this.h);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.ny) return true;
    return this.solido[j * this.nx + i] === 1;
  }

  _registrar() {
    for (const s of this.sondas) { s.t.push(this.t); s.y.push(this.valor(s.p[0], s.p[1])); }
  }

  /** Reparte un forzamiento F en los cuatro nodos vecinos de (x, y). */
  _forzar(destino, x, y, F) {
    const h = this.h, u = (x - this.xg) / h, w = (y - this.yg) / h;
    const i = Math.floor(u), j = Math.floor(w);
    if (i < 1 || j < 1 || i >= this.nx - 2 || j >= this.ny - 2) return;
    const a = u - i, b = w - j, k = j * this.nx + i, cf = this.cf;
    destino[k] += cf[k] * F * (1 - a) * (1 - b);
    destino[k + 1] += cf[k + 1] * F * a * (1 - b);
    destino[k + this.nx] += cf[k + this.nx] * F * (1 - a) * b;
    destino[k + this.nx + 1] += cf[k + this.nx + 1] * F * a * b;
  }

  /** Un paso de salto de rana: de t a t + Δt. */
  paso() {
    const { nx, ny, u, kE, kN, ca, cb, cl } = this, un = this.uAnt;
    for (let j = 1; j < ny - 1; j++) {
      let k = j * nx + 1;
      for (let i = 1; i < nx - 1; i++, k++) {
        const uk = u[k];
        const lap = kE[k] * (u[k + 1] - uk) - kE[k - 1] * (uk - u[k - 1]) + kN[k] * (u[k + nx] - uk) - kN[k - nx] * (uk - u[k - nx]);
        un[k] = ca[k] * uk - cb[k] * un[k] + cl[k] * lap;
      }
    }
    const M = this._mur;
    for (let q = 0; q < M.length; q += 3) { const k = M[q], k1 = M[q + 1]; un[k] = u[k1] + M[q + 2] * (un[k1] - u[k]); }
    // Fuentes evaluadas en t (forzamiento del paso)
    const t = this.t;
    for (const f of this.fuentes) {
      const s = senalFuente(f, t); if (s === 0) continue;
      const vx = f.v ? f.v[0] : 0, vy = f.v ? f.v[1] : 0;
      this._forzar(un, f.p[0] + vx * t, f.p[1] + vy * t, f.F * s);
    }
    for (const L of this.lineas) {
      for (const q of L.puntos) {
        const s = senalFuente(L, t - q.retraso);
        if (s !== 0) this._forzar(un, q.p[0], q.p[1], L.F * q.w * s);
      }
    }
    this.uAnt = u; this.u = un;
    this.n++; this.t = this.n * this.dt;
    this._registrar();
    if (this.pelicula) this.pelicula.grabar();
  }

  /** Avanza n pasos. @param {number} n */
  avanzar(n) { for (let i = 0; i < n; i++) this.paso(); }

  /** Avanza hasta el último paso con t ≤ tf (más medio paso). @param {number} tf */
  avanzarHasta(tf) { while (this.t + this.dt / 2 <= tf) this.paso(); }

  /** Serie u(t) registrada de la sonda i. @param {number} i */
  serie(i) { const s = this.sondas[i]; return { t: s.t.valores(), y: s.y.valores() }; }

  /**
   * Energía de la malla (por unidad de densidad): ½Σ(u̇² + v²|∇u|²)·h², con
   * u̇ por diferencia hacia atrás. Sirve para ver que la capa absorbe.
   * @param {boolean} [soloVisible=false]
   */
  energia(soloVisible = false) {
    const { nx, ny, u, uAnt, kE, kN, dt, h } = this, V = this.ventana;
    let s = 0;
    const i0 = soloVisible ? V.i0 : 1, i1 = soloVisible ? V.i0 + V.nx - 1 : nx - 2, j0 = soloVisible ? V.j0 : 1, j1 = soloVisible ? V.j0 + V.ny - 1 : ny - 2;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * nx + i, d = (u[k] - uAnt[k]) / dt;
      s += 0.5 * d * d + 0.5 * (kE[k] * (u[k + 1] - u[k]) ** 2 + kN[k] * (u[k + nx] - u[k]) ** 2) / (h * h);
    }
    return s * h * h;
  }

  /**
   * Copia la región visible del campo actual (o del anterior) a un arreglo
   * de nx × ny de la ventana, por filas desde abajo.
   * @param {Float32Array|Float64Array} destino @param {boolean} [anterior=false]
   */
  copiarVentana(destino, anterior = false) {
    const V = this.ventana, src = anterior ? this.uAnt : this.u;
    for (let j = 0; j < V.ny; j++) {
      const o = (V.j0 + j) * this.nx + V.i0;
      for (let i = 0; i < V.nx; i++) destino[j * V.nx + i] = src[o + i];
    }
    return destino;
  }
}

/**
 * Crea la cubeta de una escena (equivale a new Cubeta(escena, o)).
 * @param {EscenaCubeta} escena @param {{pelicula?: {intervalo?: number, escala?: number, maxBytes?: number}}} [o]
 */
export const crearCubeta = (escena, o) => new Cubeta(escena, o);

// ---------------------------------------------------------------------------
// Película: cuadros cuantizados de la región visible
// ---------------------------------------------------------------------------

/**
 * Cuadros de la región visible cada K pasos, en Int16 con la escala dada
 * (±32767 ↔ ±escala). Cuando la memoria llega al tope, se queda con uno de
 * cada dos cuadros y duplica K: la película siempre cubre todo lo simulado.
 */
export class Pelicula {
  /**
   * @param {Cubeta} cubeta
   * @param {{intervalo?: number, escala?: number, maxBytes?: number}} o
   *   intervalo: tiempo entre cuadros (s); escala: amplitud de saturación (m)
   */
  constructor(cubeta, o = {}) {
    this.c = cubeta;
    this.K = Math.max(1, Math.round((o.intervalo ?? 20 * cubeta.dt) / cubeta.dt));
    this.escala = o.escala ?? 1;
    const V = cubeta.ventana;
    this.tam = V.nx * V.ny;
    this.max = Math.max(16, Math.floor((o.maxBytes ?? 96e6) / (2 * this.tam)));
    /** @type {Int16Array[]} */ this.cuadros = [];
    /** @type {number[]} */ this.pasos = [];
    this._tmp = new Float64Array(this.tam);
    this.grabar();
  }

  get cuenta() { return this.cuadros.length; }
  /** Instante del cuadro q. @param {number} q */
  tiempo(q) { return this.pasos[q] * this.c.dt; }
  /** Último instante grabado. */
  get ultimo() { return this.cuadros.length ? this.tiempo(this.cuadros.length - 1) : 0; }

  grabar() {
    const c = this.c;
    if (c.n % this.K !== 0 || (this.pasos.length && this.pasos[this.pasos.length - 1] === c.n)) return;
    const q = new Int16Array(this.tam), f = 32767 / this.escala, tmp = c.copiarVentana(this._tmp);
    for (let i = 0; i < this.tam; i++) { const v = Math.round(tmp[i] * f); q[i] = v > 32767 ? 32767 : v < -32767 ? -32767 : v; }
    this.cuadros.push(q); this.pasos.push(c.n);
    if (this.cuadros.length > this.max) {
      // Uno de cada dos (se conservan los de paso múltiplo de 2K)
      const K2 = 2 * this.K, cq = [], cp = [];
      for (let i = 0; i < this.pasos.length; i++) if (this.pasos[i] % K2 === 0) { cq.push(this.cuadros[i]); cp.push(this.pasos[i]); }
      this.cuadros = cq; this.pasos = cp; this.K = K2;
    }
  }

  /** Índice del último cuadro con t_q ≤ t. @param {number} t */
  indice(t) {
    const n = t / this.c.dt;
    let lo = 0, hi = this.pasos.length - 1;
    if (hi < 0) return -1;
    if (n >= this.pasos[hi]) return hi;
    if (n <= this.pasos[0]) return 0;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.pasos[m] <= n + 1e-9) lo = m; else hi = m; }
    return lo;
  }

  /**
   * Campo de la ventana en t (m): interpolación lineal entre los dos cuadros
   * que lo rodean.
   * @param {number} t @param {Float32Array|Float64Array} destino
   */
  campo(t, destino) {
    const q = this.indice(t), s = this.escala / 32767, A = this.cuadros[q];
    if (q < 0) { destino.fill(0); return destino; }
    if (q >= this.cuadros.length - 1 || t <= this.tiempo(q)) { for (let i = 0; i < this.tam; i++) destino[i] = A[i] * s; return destino; }
    const B = this.cuadros[q + 1], a = (t - this.tiempo(q)) / (this.tiempo(q + 1) - this.tiempo(q));
    for (let i = 0; i < this.tam; i++) destino[i] = (A[i] + a * (B[i] - A[i])) * s;
    return destino;
  }

  /** Valor bilineal del cuadro q en (x, y). @param {number} q @param {number} x @param {number} y */
  valorCuadro(q, x, y) {
    const V = this.c.ventana, h = V.h, u = (x - V.x0) / h, w = (y - V.y0) / h;
    const i = Math.max(0, Math.min(V.nx - 2, Math.floor(u))), j = Math.max(0, Math.min(V.ny - 2, Math.floor(w)));
    const a = Math.max(0, Math.min(1, u - i)), b = Math.max(0, Math.min(1, w - j)), k = j * V.nx + i, C = this.cuadros[q];
    return ((1 - a) * (1 - b) * C[k] + a * (1 - b) * C[k + 1] + (1 - a) * b * C[k + V.nx] + a * b * C[k + V.nx + 1]) * this.escala / 32767;
  }

  /** u(t) en (x, y) con un valor por cuadro hasta tf. @param {number} x @param {number} y @param {number} [tf=Infinity] */
  serie(x, y, tf = Infinity) {
    const t = [], v = [];
    for (let q = 0; q < this.cuadros.length && this.tiempo(q) <= tf + 1e-12; q++) { t.push(this.tiempo(q)); v.push(this.valorCuadro(q, x, y)); }
    return { t, y: v };
  }

  /**
   * Amplitud (máx − mín)/2 en cada punto durante [t − ventana, t].
   * @param {number[][]} puntos @param {number} t @param {number} ventana
   */
  amplitudes(puntos, t, ventana) {
    const q1 = this.indice(t), lo = puntos.map(() => Infinity), hi = puntos.map(() => -Infinity);
    for (let q = q1; q >= 0 && this.tiempo(q) >= t - ventana - 1e-12; q--) {
      puntos.forEach((p, i) => { const v = this.valorCuadro(q, p[0], p[1]); if (v < lo[i]) lo[i] = v; if (v > hi[i]) hi[i] = v; });
    }
    return puntos.map((_, i) => (hi[i] >= lo[i] ? (hi[i] - lo[i]) / 2 : 0));
  }

  /**
   * Amplitud (máx − mín)/2 de cada nodo de la ventana durante [t − ventana, t].
   * @param {number} t @param {number} ventana @param {Float32Array|Float64Array} destino
   */
  amplitudCampo(t, ventana, destino) {
    const q1 = this.indice(t), n = this.tam, s = this.escala / 32767 / 2;
    const lo = new Int16Array(n).fill(32767), hi = new Int16Array(n).fill(-32767);
    let m = 0;
    for (let q = q1; q >= 0 && this.tiempo(q) >= t - ventana - 1e-12; q--, m++) {
      const C = this.cuadros[q];
      for (let i = 0; i < n; i++) { const v = C[i]; if (v < lo[i]) lo[i] = v; if (v > hi[i]) hi[i] = v; }
    }
    for (let i = 0; i < n; i++) destino[i] = m ? (hi[i] - lo[i]) * s : 0;
    return destino;
  }

  /** Bytes que ocupa. */
  get bytes() { return this.cuadros.length * this.tam * 2; }
}

// ---------------------------------------------------------------------------
// Superposición analítica
// ---------------------------------------------------------------------------

/**
 * Desplazamiento analítico de una fuente puntual senoidal en un medio
 * uniforme (solución de régimen con la misma normalización que la malla):
 * exacta −πA·[J₀(kr)·cos ψ + Y₀(kr)·sen ψ], ψ = ωt + φ; de campo lejano
 * A·√(λ/r)·sen(ψ − kr − π/4). Si la fuente empezó en t₀ finito, el campo es 0
 * más allá del frente r = v(t − t₀). Cerca de la fuente (r < λ/20) se acota.
 * @param {FuentePuntual} f @param {number} x @param {number} y @param {number} t @param {number} v
 * @param {{exacta?: boolean, causal?: boolean}} [o]
 */
export function campoFuente(f, x, y, t, v, o = {}) {
  const fr = f.frecuencia, lam = v / fr, k = DOS_PI / lam;
  const vx = f.v ? f.v[0] : 0, vy = f.v ? f.v[1] : 0;
  const r = Math.max(lam / 20, Math.hypot(x - f.p[0] - vx * t, y - f.p[1] - vy * t));
  const t0 = f.inicio ?? 0;
  if (o.causal !== false && Number.isFinite(t0) && r > v * (t - t0)) return 0;
  const psi = DOS_PI * fr * t + (f.fase ?? 0);
  if (o.exacta) return -Math.PI * f.amplitud * (besselJ0(k * r) * Math.cos(psi) + besselY0(k * r) * Math.sin(psi));
  return f.amplitud * Math.sqrt(lam / r) * Math.sin(psi - k * r - Math.PI / 4);
}

/**
 * Suma de los campos de varias fuentes puntuales en (x, y, t).
 * @param {FuentePuntual[]} fuentes @param {number} x @param {number} y @param {number} t @param {number} v
 * @param {{exacta?: boolean, causal?: boolean}} [o]
 */
export function campoAnalitico(fuentes, x, y, t, v, o = {}) {
  let s = 0;
  for (const f of fuentes) if ((f.forma ?? 'senoidal') === 'senoidal') s += campoFuente(f, x, y, t, v, o);
  return s;
}

/**
 * Fasor del régimen estacionario de fuentes de la misma frecuencia en
 * (x, y): u = R·sen(ωt + φ). Campo lejano (por defecto) o exacto.
 * @param {FuentePuntual[]} fuentes @param {number} x @param {number} y @param {number} v
 * @param {{exacta?: boolean}} [o]
 */
export function fasorAnalitico(fuentes, x, y, v, o = {}) {
  let re = 0, im = 0;
  for (const f of fuentes) {
    if ((f.forma ?? 'senoidal') !== 'senoidal') continue;
    const lam = v / f.frecuencia, k = DOS_PI / lam, r = Math.max(lam / 20, Math.hypot(x - f.p[0], y - f.p[1])), ph = f.fase ?? 0;
    if (o.exacta) {
      // −πA(J₀ cos ψ + Y₀ sen ψ) = R sen(ψ + δ): a·cos ψ + b·sen ψ con a = −πAJ₀, b = −πAY₀
      const a = -Math.PI * f.amplitud * besselJ0(k * r), b = -Math.PI * f.amplitud * besselY0(k * r);
      // a cos(ωt + φ) + b sen(ωt + φ) → componentes de e^{i(ωt)}: sen(ωt + φ + δ) con R = √(a² + b²), δ = atan2(a, b)
      const R = Math.hypot(a, b), d = Math.atan2(a, b) + ph;
      re += R * Math.cos(d); im += R * Math.sin(d);
    } else {
      const R = f.amplitud * Math.sqrt(lam / r), d = ph - k * r - Math.PI / 4;
      re += R * Math.cos(d); im += R * Math.sin(d);
    }
  }
  // Σ Rᵢ sen(ωt + dᵢ) = Im[Σ Rᵢ e^{i dᵢ} e^{iωt}]
  return { amplitud: Math.hypot(re, im), fase: Math.atan2(im, re), re, im };
}

/**
 * Líneas de interferencia de dos fuentes coherentes (misma frecuencia) en
 * la caja: antinodales donde r₁ − r₂ = (Δφ/2π + m)λ y nodales donde
 * r₁ − r₂ = (Δφ/2π + m + ½)λ, con Δφ = φ₁ − φ₂ (r medido desde cada fuente).
 * Cada línea es una rama de hipérbola con focos en las fuentes (la
 * mediatriz si Δ = 0).
 * @param {V2} s1 @param {V2} s2 @param {number} lambda
 * @param {{desfase?: number, caja: {x0: number, x1: number, y0: number, y1: number}, puntos?: number}} o
 * @returns {Array<{tipo: 'nodal'|'antinodal', m: number, delta: number, puntos: V2[]}>}
 */
export function lineasInterferencia(s1, s2, lambda, o) {
  const d = Math.hypot(s2[0] - s1[0], s2[1] - s1[1]);
  if (!(d > 0) || !(lambda > 0)) return [];
  const c0 = [(s1[0] + s2[0]) / 2, (s1[1] + s2[1]) / 2], ex = [(s2[0] - s1[0]) / d, (s2[1] - s1[1]) / d], ey = [-ex[1], ex[0]];
  const caja = o.caja, diag = Math.hypot(caja.x1 - caja.x0, caja.y1 - caja.y0) + Math.hypot(c0[0] - (caja.x0 + caja.x1) / 2, c0[1] - (caja.y0 + caja.y1) / 2);
  const base = (o.desfase ?? 0) / DOS_PI, n = o.puntos ?? 160, r = [];
  const desde = Math.ceil(-d / lambda - base - 1), hasta = Math.floor(d / lambda - base + 1);
  for (const tipo of /** @type {Array<'antinodal'|'nodal'>} */ (['antinodal', 'nodal'])) {
    for (let m = desde; m <= hasta; m++) {
      const delta = (base + m + (tipo === 'nodal' ? 0.5 : 0)) * lambda;
      if (!(Math.abs(delta) < d - 1e-9 * d)) continue;
      // r₁ − r₂ = δ: rama con x′ del lado de s₂ si δ > 0 (más cerca de s₂)
      const a = Math.abs(delta) / 2, c = d / 2, b = Math.sqrt(c * c - a * a), sg = delta > 0 ? 1 : -1;
      const smax = Math.asinh(diag / Math.max(b, 1e-12)), pts = [];
      for (let q = 0; q <= n; q++) {
        const s = -smax + 2 * smax * q / n, xl = sg * a * Math.cosh(s), yl = b * Math.sinh(s);
        const p = /** @type {V2} */ ([c0[0] + ex[0] * xl + ey[0] * yl, c0[1] + ex[1] * xl + ey[1] * yl]);
        pts.push(p);
      }
      r.push({ tipo, m, delta, puntos: pts });
    }
  }
  return r;
}

/**
 * Radios de las crestas de una fuente puntual en t (campo lejano: fase
 * ωt + φ − kr − π/4 = π/2 + 2πn), dentro del frente r ≤ v(t − t₀) y de rMax.
 * @param {FuentePuntual} f @param {number} t @param {number} v @param {number} rMax
 */
export function crestas(f, t, v, rMax) {
  const lam = v / f.frecuencia, t0 = f.inicio ?? 0, lim = Math.min(rMax, Number.isFinite(t0) ? v * (t - t0) : Infinity);
  // r = λ·(f·t + (φ − 3π/4)/2π − n)
  const r0 = lam * (f.frecuencia * t + ((f.fase ?? 0) - 0.75 * Math.PI) / DOS_PI), out = [];
  let n = Math.ceil((r0 - lim) / lam);
  for (let q = 0; q < 10000; q++, n++) { const r = r0 - n * lam; if (r <= 0) break; if (r <= lim) out.push(r); }
  return out;
}
