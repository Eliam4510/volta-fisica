/* ==========================================================================
   Volta — motor de gravitación (Gravitación · Órbitas)
   N cuerpos bajo la gravitación universal en el plano, con:
   - integradores simplécticos de paso fijo: Verlet de velocidad (2.º orden)
     y Yoshida (4.º orden, composición triple de Verlet); la energía no
     deriva y el momento angular se conserva a precisión de máquina;
   - solución de Kepler analítica para dos cuerpos (ecuación de Kepler
     resuelta por Newton; variables universales cerca de la parábola);
   - elementos orbitales (a, e, periodo, energía específica, momento
     angular), velocidad circular y de escape;
   - eventos localizados dentro del paso (Brent): impacto con la superficie
     de un cuerpo, periapsis, apoapsis y vuelta completa.
   Todo en SI (m, s, kg). Puro: sin DOM. Lo usan la pantalla de Gravitación
   y las pruebas.
   ========================================================================== */

/** Constante de gravitación universal (CODATA 2018), N·m²/kg². */
export const G = 6.6743e-11;

const DOS_PI = 2 * Math.PI;

/**
 * @typedef {Object} CuerpoReal
 * @property {string} nombre
 * @property {number} mu        Parámetro gravitatorio GM (m³/s²)
 * @property {number} masa      kg (mu / G)
 * @property {number} radio     Radio ecuatorial (m): el plano de las órbitas es el ecuador
 * @property {number} [radioMedio] Radio medio (m)
 * @property {number} periodoRotacion Periodo de rotación sidéreo (s)
 */

/** @param {string} nombre @param {number} mu @param {number} radio @param {number} periodoRotacion @param {number} [radioMedio] @returns {CuerpoReal} */
const real = (nombre, mu, radio, periodoRotacion, radioMedio) => Object.freeze({ nombre, mu, masa: mu / G, radio, radioMedio: radioMedio ?? radio, periodoRotacion });

/** Cuerpos con datos reales (IERS, JPL). */
export const CUERPOS = Object.freeze({
  tierra: real('Tierra', 3.986004418e14, 6.378137e6, 86164.0905, 6.371e6),
  luna: real('Luna', 4.9048695e12, 1.7381e6, 2360591.5, 1.7374e6),
  marte: real('Marte', 4.282837e13, 3.3962e6, 88642.66, 3.3895e6),
  jupiter: real('Júpiter', 1.26686534e17, 7.1492e7, 35730, 6.9911e7),
  sol: real('Sol', 1.32712440018e20, 6.957e8, 2192832),
});

// ---------------------------------------------------------------------------
// Dos cuerpos: fórmulas cerradas
// ---------------------------------------------------------------------------

/** Velocidad de la órbita circular de radio r: v = √(μ/r). @param {number} mu @param {number} r */
export const velocidadCircular = (mu, r) => Math.sqrt(mu / r);

/** Velocidad de escape a la distancia r: v = √(2μ/r). @param {number} mu @param {number} r */
export const velocidadEscape = (mu, r) => Math.sqrt(2 * mu / r);

/** Periodo de una órbita de semieje a (tercera ley de Kepler): T = 2π√(a³/μ). @param {number} mu @param {number} a */
export const periodoOrbital = (mu, a) => DOS_PI * Math.sqrt(a * a * a / mu);

/** Semieje mayor de la órbita de periodo T: a = (μT²/4π²)^(1/3). @param {number} mu @param {number} T */
export const semiejeDesdePeriodo = (mu, T) => Math.cbrt(mu * T * T / (4 * Math.PI * Math.PI));

/** Altura de la órbita circular de periodo T sobre un cuerpo de radio R (geoestacionaria si T es la rotación). @param {number} mu @param {number} R @param {number} T */
export const alturaSincrona = (mu, R, T) => semiejeDesdePeriodo(mu, T) - R;

/** Gravedad en la superficie: g = μ/R². @param {number} mu @param {number} R */
export const gravedadSuperficial = (mu, R) => mu / (R * R);

/** Masa de un planeta a partir de la gravedad en su superficie: M = g·R²/G. @param {number} g @param {number} R @param {number} [constante=G] */
export const masaDesdeGravedad = (g, R, constante = G) => g * R * R / constante;

/** Velocidad de escape desde la superficie en función de g: √(2gR). @param {number} g @param {number} R */
export const escapeDesdeGravedad = (g, R) => Math.sqrt(2 * g * R);

/** Cociente de velocidades de escape de dos planetas: √((M₂/M₁)/(R₂/R₁)). @param {number} cocienteMasas @param {number} cocienteRadios */
export const cocienteEscape = (cocienteMasas, cocienteRadios) => Math.sqrt(cocienteMasas / cocienteRadios);

/**
 * @typedef {Object} Elementos
 * @property {number} r        Distancia (m)
 * @property {number} v        Rapidez (m/s)
 * @property {number} energia  Energía específica ε = v²/2 − μ/r (J/kg)
 * @property {number} h        Momento angular específico (componente z, m²/s)
 * @property {number} e        Excentricidad
 * @property {[number, number]} vectorE Vector excentricidad
 * @property {number} a        Semieje mayor (m); negativo en la hipérbola, ∞ en la parábola
 * @property {number} p        Parámetro (semilatus rectum, m)
 * @property {number} rp       Distancia del periapsis (m)
 * @property {number} ra       Distancia del apoapsis (m); ∞ si no está ligada
 * @property {number} periodo  T (s); ∞ si no está ligada
 * @property {number} omega    Argumento del periapsis (rad, desde el eje x)
 * @property {number} nu       Anomalía verdadera (rad, en el sentido del movimiento)
 * @property {number} sentido  +1 antihorario, −1 horario
 * @property {number} vCircular Velocidad circular a la distancia r
 * @property {number} vEscape  Velocidad de escape a la distancia r
 * @property {'circular'|'elíptica'|'parabólica'|'hiperbólica'|'radial'} tipo
 */

/**
 * Elementos orbitales (osculadores) de un cuerpo respecto de un centro de
 * parámetro μ, a partir de la posición y la velocidad relativas.
 * @param {number} mu @param {[number, number]} pos @param {[number, number]} vel
 * @returns {Elementos}
 */
export function elementosOrbitales(mu, pos, vel) {
  const [x, y] = pos, [vx, vy] = vel;
  const r = Math.hypot(x, y), v2 = vx * vx + vy * vy, v = Math.sqrt(v2), rv = x * vx + y * vy;
  const h = x * vy - y * vx;
  const energia = v2 / 2 - mu / r;
  const k = v2 - mu / r;
  const ex = (k * x - rv * vx) / mu, ey = (k * y - rv * vy) / mu;
  const e = Math.hypot(ex, ey);
  const p = h * h / mu;
  const a = energia === 0 ? Infinity : -mu / (2 * energia);
  const ligada = energia < 0;
  const rp = p / (1 + e);
  const ra = ligada && e < 1 ? p / (1 - e) : Infinity;
  const sentido = h >= 0 ? 1 : -1;
  const omega = e > 1e-14 ? Math.atan2(ey, ex) : Math.atan2(y, x);
  const cx = Math.cos(omega), cy = Math.sin(omega);
  const nu = Math.atan2(sentido * (-cy * x + cx * y), cx * x + cy * y);
  const radial = Math.abs(h) <= 1e-12 * r * v;
  /** @type {Elementos['tipo']} */
  const tipo = radial ? 'radial' : Math.abs(e - 1) < 1e-10 ? 'parabólica' : e < 1e-9 ? 'circular' : e < 1 ? 'elíptica' : 'hiperbólica';
  return {
    r, v, energia, h, e, vectorE: [ex, ey], a, p, rp, ra,
    periodo: ligada ? periodoOrbital(mu, a) : Infinity,
    omega, nu, sentido, vCircular: velocidadCircular(mu, r), vEscape: velocidadEscape(mu, r), tipo,
  };
}

// ---------------------------------------------------------------------------
// Ecuación de Kepler (Newton con salvaguarda de intervalo)
// ---------------------------------------------------------------------------

/**
 * Anomalía excéntrica E de la ecuación de Kepler M = E − e·sen E (0 ≤ e < 1).
 * Newton desde el arranque de Danby, con el intervalo [M − e, M + e] como
 * salvaguarda: converge para toda excentricidad elíptica.
 * @param {number} M Anomalía media (rad) @param {number} e
 * @returns {number}
 */
export function resolverKepler(M, e) {
  if (!(e >= 0 && e < 1)) throw new RangeError('resolverKepler: la excentricidad debe estar en [0, 1)');
  const vueltas = Math.round(M / DOS_PI), m = M - vueltas * DOS_PI;   // m en [−π, π]
  let lo = m - e, hi = m + e;
  let E = m + 0.85 * e * Math.sign(Math.sin(m));
  for (let i = 0; i < 60; i++) {
    const f = E - e * Math.sin(E) - m;
    if (f === 0) break;
    if (f > 0) hi = E; else lo = E;
    let nuevo = E - f / (1 - e * Math.cos(E));
    if (!(nuevo >= lo && nuevo <= hi)) nuevo = (lo + hi) / 2;
    const d = Math.abs(nuevo - E);
    E = nuevo;
    if (d <= 4e-16 * Math.max(1, Math.abs(E))) break;
  }
  return E + vueltas * DOS_PI;
}

/**
 * Anomalía hiperbólica F de M = e·senh F − F (e > 1), por Newton con salvaguarda.
 * @param {number} M @param {number} e
 * @returns {number}
 */
export function resolverKeplerHiperbolica(M, e) {
  if (!(e > 1)) throw new RangeError('resolverKeplerHiperbolica: la excentricidad debe ser mayor que 1');
  if (M === 0) return 0;
  const s = Math.sign(M), m = Math.abs(M);
  // La raíz está entre asinh(m/e) (pues senh F = (m + F)/e > m/e) y asinh((m + m/(e−1))/e)
  let lo = Math.asinh(m / e), hi = Math.asinh((m + m / (e - 1)) / e);
  let F = m > 6 * e ? Math.log(2 * m / e) : Math.asinh(m / e);
  for (let i = 0; i < 100; i++) {
    const f = e * Math.sinh(F) - F - m;
    if (f === 0) break;
    if (f > 0) hi = F; else lo = F;
    let nuevo = F - f / (e * Math.cosh(F) - 1);
    if (!(nuevo >= lo && nuevo <= hi)) nuevo = (lo + hi) / 2;
    const d = Math.abs(nuevo - F);
    F = nuevo;
    if (d <= 4e-16 * Math.max(1, F)) break;
  }
  return s * F;
}

// Funciones de Stumpff C(z) y S(z), con serie cerca de z = 0 (sin cancelación)
function stumpff(z) {
  if (Math.abs(z) < 0.1) {
    const z2 = z * z, z3 = z2 * z, z4 = z2 * z2, z5 = z4 * z;
    return [
      1 / 2 - z / 24 + z2 / 720 - z3 / 40320 + z4 / 3628800 - z5 / 479001600,
      1 / 6 - z / 120 + z2 / 5040 - z3 / 362880 + z4 / 39916800 - z5 / 6227020800,
    ];
  }
  if (z > 0) {
    const s = Math.sqrt(z), sm = Math.sin(s / 2);
    return [2 * sm * sm / z, (s - Math.sin(s)) / (s * s * s)];
  }
  const s = Math.sqrt(-z), sh = Math.sinh(s / 2);
  return [2 * sh * sh / -z, (Math.sinh(s) - s) / (s * s * s)];
}

/**
 * Estado relativo al cabo de un tiempo t por variables universales: vale
 * para toda cónica (también la parábola y las órbitas casi parabólicas).
 * Resuelve la ecuación de Kepler universal por Newton con salvaguarda.
 * @param {number} mu @param {[number, number]} pos @param {[number, number]} vel @param {number} t
 * @returns {{x:number, y:number, vx:number, vy:number}}
 */
export function estadoKeplerUniversal(mu, pos, vel, t) {
  const [x0, y0] = pos, [vx0, vy0] = vel;
  if (t === 0) return { x: x0, y: y0, vx: vx0, vy: vy0 };
  const r0 = Math.hypot(x0, y0), v2 = vx0 * vx0 + vy0 * vy0, sm = Math.sqrt(mu);
  const sigma = (x0 * vx0 + y0 * vy0) / sm, alfa = 2 / r0 - v2 / mu;
  const objetivo = sm * Math.abs(t), sg = Math.sign(t);
  // F(χ) es creciente (F' = r > 0): se acota la raíz y se aplica Newton
  const F = chi => {
    const c = sg * chi, z = alfa * c * c, [C, S] = stumpff(z);
    return [sg * (sigma * c * c * C + (1 - alfa * r0) * c * c * c * S + r0 * c),
      sigma * c * (1 - z * S) + (1 - alfa * r0) * c * c * C + r0];
  };
  let lo = 0, hi = objetivo / r0;
  while (F(hi)[0] < objetivo) { lo = hi; hi *= 2; }
  let chi = alfa > 0 ? Math.min(hi, Math.max(lo, sm * Math.abs(t) * alfa)) : (lo + hi) / 2;
  if (!(chi > lo && chi < hi)) chi = (lo + hi) / 2;
  for (let i = 0; i < 200; i++) {
    const [f, fp] = F(chi), d = f - objetivo;
    if (d === 0) break;
    if (d > 0) hi = chi; else lo = chi;
    let nuevo = chi - d / fp;
    if (!(nuevo >= lo && nuevo <= hi)) nuevo = (lo + hi) / 2;
    const paso = Math.abs(nuevo - chi);
    chi = nuevo;
    if (paso <= 4e-16 * Math.max(1, chi)) break;
  }
  const c = sg * chi, z = alfa * c * c, [C, S] = stumpff(z);
  const f = 1 - c * c / r0 * C, g = t - c * c * c * S / sm;
  const x = f * x0 + g * vx0, y = f * y0 + g * vy0, r = Math.hypot(x, y);
  const fp = sm / (r * r0) * (z * S - 1) * c, gp = 1 - c * c / r * C;
  return { x, y, vx: fp * x0 + gp * vx0, vy: fp * y0 + gp * vy0 };
}

/**
 * Solución exacta del problema de dos cuerpos: estado relativo (posición y
 * velocidad del cuerpo respecto del centro) al cabo de un tiempo t.
 * Elipse e hipérbola por la ecuación de Kepler; cerca de la parábola
 * (|1 − e| < 0.01) y en caída radial, por variables universales.
 * @param {number} mu @param {[number, number]} pos @param {[number, number]} vel @param {number} t
 * @returns {{x:number, y:number, vx:number, vy:number}}
 */
export function estadoKepler(mu, pos, vel, t) {
  const el = elementosOrbitales(mu, pos, vel);
  if (el.tipo === 'radial' || Math.abs(1 - el.e) < 0.01) return estadoKeplerUniversal(mu, pos, vel, t);
  // Base perifocal: x̂ hacia el periapsis, ŷ a 90° en el sentido del movimiento
  const cw = Math.cos(el.omega), sw = Math.sin(el.omega), s = el.sentido;
  const X = (a, b) => [a * cw - s * b * sw, a * sw + s * b * cw];
  const e = el.e, nu0 = el.nu;
  let xp, yp, vxp, vyp;
  if (e < 1) {
    const a = el.a, n = Math.sqrt(mu / (a * a * a)), b = Math.sqrt(1 - e * e);
    const E0 = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu0 / 2), Math.sqrt(1 + e) * Math.cos(nu0 / 2));
    const E = resolverKepler(E0 - e * Math.sin(E0) + n * t, e);
    const cE = Math.cos(E), sE = Math.sin(E), den = 1 - e * cE;
    xp = a * (cE - e); yp = a * b * sE;
    vxp = -a * n * sE / den; vyp = a * n * b * cE / den;
  } else {
    const A = -el.a, n = Math.sqrt(mu / (A * A * A)), b = Math.sqrt(e * e - 1);
    const F0 = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu0 / 2));
    const F = resolverKeplerHiperbolica(e * Math.sinh(F0) - F0 + n * t, e);
    const cF = Math.cosh(F), sF = Math.sinh(F), den = e * cF - 1;
    xp = A * (e - cF); yp = A * b * sF;
    vxp = -A * n * sF / den; vyp = A * n * b * cF / den;
  }
  const [x, y] = X(xp, yp), [vx, vy] = X(vxp, vyp);
  return { x, y, vx, vy };
}

/**
 * Puntos de la cónica que seguiría el cuerpo sin perturbaciones (órbita
 * prevista), relativos al centro. Elipse completa (cerrada) o rama de
 * hipérbola o parábola hasta la distancia rMax.
 * @param {number} mu @param {[number, number]} pos @param {[number, number]} vel
 * @param {{n?: number, rMax?: number}} [o]
 * @returns {Array<[number, number]>}
 */
export function puntosConica(mu, pos, vel, o = {}) {
  const el = elementosOrbitales(mu, pos, vel), n = o.n ?? 360;
  if (el.tipo === 'radial') return [];
  const cw = Math.cos(el.omega), sw = Math.sin(el.omega), s = el.sentido;
  const X = (a, b) => /** @type {[number, number]} */ ([a * cw - s * b * sw, a * sw + s * b * cw]);
  const pts = [];
  // La parábola (|e − 1| < 1e-10) va por la rama abierta aunque el redondeo dé ε < 0
  if (el.tipo === 'circular' || el.tipo === 'elíptica') {
    const a = el.a, b = a * Math.sqrt(1 - el.e * el.e);
    if (el.e <= 0.5) {
      for (let i = 0; i <= n; i++) { const E = DOS_PI * i / n; pts.push(X(a * (Math.cos(E) - el.e), b * Math.sin(E))); }
    } else {
      // Muy excéntrica: en anomalía verdadera, que concentra los puntos en el periapsis
      for (let i = 0; i <= n; i++) { const nu = DOS_PI * i / n, r = el.p / (1 + el.e * Math.cos(nu)); pts.push(X(r * Math.cos(nu), r * Math.sin(nu))); }
    }
    return pts;
  }
  const rMax = Math.max(o.rMax ?? 10 * el.rp, el.r, el.rp * 1.0001);
  const lim = Math.acos(Math.max(-1, -1 / el.e));                 // asíntota (π en la parábola)
  const nuMax = Math.min(lim * (1 - 1e-9), Math.acos(Math.max(-1, Math.min(1, (el.p / rMax - 1) / el.e))));
  for (let i = 0; i <= n; i++) {
    // Más puntos cerca del periapsis, donde la curvatura es mayor
    const u = -1 + 2 * i / n, nu = nuMax * Math.sign(u) * Math.abs(u) ** 1.5;
    const r = el.p / (1 + el.e * Math.cos(nu));
    pts.push(X(r * Math.cos(nu), r * Math.sin(nu)));
  }
  return pts;
}

// ---------------------------------------------------------------------------
// N cuerpos
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} CuerpoEscena
 * @property {string} nombre
 * @property {number} [masa]   kg (para energías y momentos; si falta, mu/G)
 * @property {number} [mu]     GM (m³/s²); manda sobre masa para la dinámica
 * @property {boolean} [prueba=false] Partícula de prueba: siente la gravedad pero no atrae
 * @property {boolean} [fijo=false]   Cuerpo central fijo (no se mueve)
 * @property {number} [radio=0] Radio (m): superficie para el evento de impacto
 * @property {number} x @property {number} y @property {number} vx @property {number} vy
 */

/**
 * @typedef {Object} EscenaGravitacion
 * @property {CuerpoEscena[]} cuerpos
 * @property {number} duracion Tiempo simulado (s)
 * @property {number} dt       Paso máximo (s); se ajusta para que la duración sea un número entero de pasos
 * @property {'yoshida4'|'verlet'} [integrador='yoshida4']
 * @property {number} [centro] Índice del cuerpo de referencia para ápsides y vueltas (por defecto, el de mayor μ)
 * @property {boolean} [apsides=true] Detectar periapsis y apoapsis
 * @property {boolean} [vueltas=true] Detectar cada vuelta completa (vuelve a la dirección inicial)
 * @property {boolean} [impactos=true] Detectar el impacto con la superficie de los cuerpos con radio
 * @property {boolean} [detenerAlPosarse=false] Terminar cuando todos los cuerpos móviles se han posado
 * @property {number} [excentricidadMinima=1e-6] Por debajo, la órbita se trata como circular (sin ápsides)
 */

/**
 * @typedef {Object} EventoGravitacion
 * @property {number} t
 * @property {'periapsis'|'apoapsis'|'vuelta'|'impacto'} tipo
 * @property {string} nombre
 * @property {number} cuerpo  Índice del cuerpo
 * @property {number} otro    Índice del centro (o del cuerpo contra el que choca)
 * @property {number} x @property {number} y @property {number} vx @property {number} vy  Estado absoluto
 * @property {number} r  Distancia al otro cuerpo (m)
 * @property {number} v  Rapidez relativa al otro cuerpo (m/s)
 * @property {number} [n] Número de vuelta
 */

const W1 = 1 / (2 - Math.cbrt(2)), W0 = -Math.cbrt(2) / (2 - Math.cbrt(2));
const YOSHIDA_C = [W1 / 2, (W0 + W1) / 2, (W0 + W1) / 2, W1 / 2];
const YOSHIDA_D = [W1, W0, W1];

/** Normaliza los cuerpos: μ, masa, indicadores. @param {CuerpoEscena[]} cuerpos */
function normalizar(cuerpos) {
  return cuerpos.map(c => {
    const mu = c.prueba ? 0 : (c.mu ?? G * (c.masa ?? 0));
    const masa = c.masa ?? (c.mu != null ? c.mu / G : 0);
    return { nombre: c.nombre, mu, masa, radio: c.radio ?? 0, fijo: !!c.fijo, prueba: !!c.prueba };
  });
}

/**
 * @typedef {Object} Config
 * @property {number} n
 * @property {Float64Array} mu
 * @property {Uint8Array} movil  1 si el cuerpo se integra (ni fijo ni posado)
 * @property {Float64Array} ax @property {Float64Array} ay
 */

/** Aceleraciones gravitatorias de los cuerpos móviles. @param {Config} cfg @param {Float64Array} x @param {Float64Array} y */
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
}
/** @param {Config} cfg @param {Estado} s @param {number} h */
function deriva(cfg, s, h) {
  for (let i = 0; i < cfg.n; i++) if (cfg.movil[i]) { s.x[i] += h * s.vx[i]; s.y[i] += h * s.vy[i]; }
}
/** @param {Config} cfg @param {Estado} s @param {number} h */
function patada(cfg, s, h) {
  for (let i = 0; i < cfg.n; i++) if (cfg.movil[i]) { s.vx[i] += h * cfg.ax[i]; s.vy[i] += h * cfg.ay[i]; }
}

/** @typedef {{x: Float64Array, y: Float64Array, vx: Float64Array, vy: Float64Array}} Estado */

const INTEGRADORES = {
  /** Verlet de velocidad (patada–deriva–patada), 2.º orden. @param {Config} cfg @param {Estado} s @param {number} h */
  verlet(cfg, s, h) {
    acelerar(cfg, s.x, s.y); patada(cfg, s, h / 2);
    deriva(cfg, s, h);
    acelerar(cfg, s.x, s.y); patada(cfg, s, h / 2);
  },
  /** Yoshida de 4.º orden: tres Verlet con pasos w1, w0, w1. @param {Config} cfg @param {Estado} s @param {number} h */
  yoshida4(cfg, s, h) {
    for (let k = 0; k < 3; k++) { deriva(cfg, s, YOSHIDA_C[k] * h); acelerar(cfg, s.x, s.y); patada(cfg, s, YOSHIDA_D[k] * h); }
    deriva(cfg, s, YOSHIDA_C[3] * h);
  },
};

/** @param {Estado} s @returns {Estado} */
const copiar = s => ({ x: Float64Array.from(s.x), y: Float64Array.from(s.y), vx: Float64Array.from(s.vx), vy: Float64Array.from(s.vy) });

// Posados: siguen al cuerpo sobre el que cayeron (posado[i] = j, desplazamiento fijo)
function arrastrarPosados(posado, despl, s) {
  for (let i = 0; i < posado.length; i++) {
    const j = posado[i];
    if (j < 0) continue;
    s.x[i] = s.x[j] + despl[2 * i]; s.y[i] = s.y[j] + despl[2 * i + 1];
    s.vx[i] = s.vx[j]; s.vy[i] = s.vy[j];
  }
}

/** Avanza un paso de tamaño h (puro: devuelve un estado nuevo). */
function avanzar(cfg, integrador, posado, despl, s0, h) {
  const s = copiar(s0);
  if (h > 0) { INTEGRADORES[integrador](cfg, s, h); arrastrarPosados(posado, despl, s); }
  return s;
}

/**
 * Raíz de f en [a, b] con f(a)·f(b) ≤ 0 (método de Brent).
 * @param {(x: number) => number} f @param {number} a @param {number} b @param {number} fa @param {number} fb @param {number} tol
 */
export function brent(f, a, b, fa, fb, tol) {
  if (fa === 0) return a;
  if (fb === 0) return b;
  let c = a, fc = fa, d = b - a, e = d;
  for (let i = 0; i < 200; i++) {
    if (fb * fc > 0) { c = a; fc = fa; d = b - a; e = d; }
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + tol / 2, xm = (c - b) / 2;
    if (Math.abs(xm) <= tol1 || fb === 0) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p, q;
      if (a === c) { p = 2 * xm * s; q = 1 - s; }
      else { const qq = fa / fc, r = fb / fc; p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1)); q = (qq - 1) * (r - 1) * (s - 1); }
      if (p > 0) q = -q; else p = -p;
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) { e = d; d = p / q; }
      else { d = xm; e = d; }
    } else { d = xm; e = d; }
    a = b; fa = fb;
    b += Math.abs(d) > tol1 ? d : (xm > 0 ? tol1 : -tol1);
    fb = f(b);
  }
  return b;
}

/**
 * Simula N cuerpos con un integrador simpléctico de paso fijo. Guarda el
 * estado de cada paso (y el de cada impacto) y los eventos localizados.
 * @param {EscenaGravitacion} escena
 */
export function simularGravitacion(escena) {
  const cs = normalizar(escena.cuerpos), n = cs.length;
  const integrador = escena.integrador ?? 'yoshida4';
  if (!INTEGRADORES[integrador]) throw new Error(`Integrador desconocido: ${integrador}`);
  const dur = escena.duracion;
  const N0 = Math.max(1, Math.ceil(dur / escena.dt - 1e-9)), h0 = dur / N0;
  /** @type {Config} */
  const cfg = { n, mu: Float64Array.from(cs.map(c => c.mu)), movil: Uint8Array.from(cs.map(c => (c.fijo ? 0 : 1))), ax: new Float64Array(n), ay: new Float64Array(n) };
  const posado = new Int32Array(n).fill(-1), despl = new Float64Array(2 * n), tPosado = new Float64Array(n).fill(Infinity);
  /** @type {Estado} */
  let s = {
    x: Float64Array.from(escena.cuerpos.map(c => c.x)), y: Float64Array.from(escena.cuerpos.map(c => c.y)),
    vx: Float64Array.from(escena.cuerpos.map(c => (c.fijo ? 0 : c.vx))), vy: Float64Array.from(escena.cuerpos.map(c => (c.fijo ? 0 : c.vy))),
  };

  // Cuerpo de referencia: el de mayor μ
  let centro = escena.centro ?? 0;
  if (escena.centro == null) cs.forEach((c, i) => { if (c.mu > cs[centro].mu) centro = i; });
  const relativo = (st, i, j) => [st.x[i] - st.x[j], st.y[i] - st.y[j], st.vx[i] - st.vx[j], st.vy[i] - st.vy[j]];

  // Detectores: f(estado) cuyo cambio de signo marca el evento
  /** @type {Array<{i:number, j:number, tipo:string, f:(st: Estado) => number, dir:number, inicioCero?:boolean, ux?:number, uy?:number, cuenta?:number}>} */
  const detectores = [];
  /** @type {EventoGravitacion[]} */
  const eventos = [];
  const registrar = (tipo, nombre, i, j, st, t, extra = {}) => {
    const [dx, dy, dvx, dvy] = relativo(st, i, j);
    eventos.push({ t, tipo, nombre, cuerpo: i, otro: j, x: st.x[i], y: st.y[i], vx: st.vx[i], vy: st.vy[i], r: Math.hypot(dx, dy), v: Math.hypot(dvx, dvy), ...extra });
  };
  const umbralE = escena.excentricidadMinima ?? 1e-6;
  for (let i = 0; i < n; i++) {
    if (cs[i].fijo || i === centro) continue;
    const [dx, dy, dvx, dvy] = relativo(s, i, centro), muRel = cfg.mu[centro] + cfg.mu[i];
    if (muRel > 0 && (escena.apsides ?? true)) {
      const el = elementosOrbitales(muRel, [dx, dy], [dvx, dvy]);
      if (el.e > umbralE && el.tipo !== 'radial') {
        // Si parte de un ápside, se marca en t = 0 y su detector arranca en cero
        // (el redondeo de r·v no debe producir un segundo evento en el primer paso)
        const enApside = Math.abs(dx * dvx + dy * dvy) <= 1e-12 * el.r * el.v;
        detectores.push({ i, j: centro, tipo: 'apside', dir: 0, inicioCero: enApside, f: st => { const [a, b, c, d] = relativo(st, i, centro); return a * c + b * d; } });
        if (enApside) {
          // r_p = p/(1 + e) < p < r_a = p/(1 − e): vale también para la hipérbola (a < 0)
          const tipo = el.r <= el.p ? 'periapsis' : 'apoapsis';
          registrar(tipo, tipo === 'periapsis' ? 'Periapsis' : 'Apoapsis', i, centro, s, 0);
        }
      }
      if ((escena.vueltas ?? true) && el.tipo !== 'radial') {
        const r = Math.hypot(dx, dy), ux = dx / r, uy = dy / r, sg = el.sentido;
        detectores.push({ i, j: centro, tipo: 'vuelta', dir: 1, inicioCero: true, ux, uy, cuenta: 0, f: st => { const [a, b] = relativo(st, i, centro); return sg * (ux * b - uy * a); } });
      }
    }
    if (escena.impactos ?? true) {
      for (let j = 0; j < n; j++) {
        if (j === i || cs[j].radio <= 0) continue;
        const suma = cs[i].radio + cs[j].radio;
        detectores.push({ i, j, tipo: 'impacto', dir: -1, f: st => Math.hypot(st.x[i] - st.x[j], st.y[i] - st.y[j]) - suma });
      }
    }
  }

  // Muestras: un estado por paso, más el de cada impacto
  const T = [0], muestras = [copiar(s)];
  let t = 0, tBase = 0, k = 0, h = h0, Nseg = N0;
  const activo = d => posado[d.i] < 0;
  let valores = detectores.map(d => (d.inicioCero ? 0 : d.f(s)));
  while (k < Nseg) {
    const t0 = t, s0 = s, tFin = tBase + (k + 1) * h;
    const paso = tFin - t0;
    const s1 = avanzar(cfg, integrador, posado, despl, s0, paso);
    const nuevos = detectores.map(d => d.f(s1));
    // Raíces de los detectores que cambian de signo dentro del paso
    const encontrados = [];
    detectores.forEach((d, q) => {
      if (!activo(d)) return;
      const f0 = valores[q], f1 = nuevos[q];
      const cruza = d.dir > 0 ? (f0 < 0 && f1 >= 0) : d.dir < 0 ? (f0 >= 0 && f1 < 0) : ((f0 < 0 && f1 >= 0) || (f0 > 0 && f1 <= 0));
      if (!cruza) return;
      const g = tau => d.f(avanzar(cfg, integrador, posado, despl, s0, tau));
      const tau = brent(g, 0, paso, f0, f1, 1e-13 * paso);
      if (d.tipo === 'vuelta') {
        // Solo cuenta el cruce por la dirección inicial (no por la opuesta)
        const st = avanzar(cfg, integrador, posado, despl, s0, tau), [a, b] = relativo(st, d.i, d.j);
        if (a * /** @type {number} */ (d.ux) + b * /** @type {number} */ (d.uy) <= 0) return;
      }
      encontrados.push({ d, tau, sube: f1 > f0 });
    });
    encontrados.sort((p, q) => p.tau - q.tau);
    const choque = encontrados.find(x => x.d.tipo === 'impacto');
    for (const { d, tau, sube } of encontrados) {
      if (choque && tau > choque.tau) break;
      if (d.tipo === 'impacto' && d !== choque.d) continue;
      const st = avanzar(cfg, integrador, posado, despl, s0, tau), te = t0 + tau;
      if (d.tipo === 'apside') registrar(sube ? 'periapsis' : 'apoapsis', sube ? 'Periapsis' : 'Apoapsis', d.i, d.j, st, te);
      else if (d.tipo === 'vuelta') { d.cuenta = (d.cuenta ?? 0) + 1; registrar('vuelta', 'Vuelta completa', d.i, d.j, st, te, { n: d.cuenta }); }
    }
    if (choque) {
      // El paso se corta en el impacto: el cuerpo se posa y sigue al otro
      const { d, tau } = choque, st = avanzar(cfg, integrador, posado, despl, s0, tau), te = t0 + tau;
      registrar('impacto', 'Impacto con la superficie', d.i, d.j, st, te);
      posado[d.i] = d.j; tPosado[d.i] = te; cfg.movil[d.i] = 0;
      despl[2 * d.i] = st.x[d.i] - st.x[d.j]; despl[2 * d.i + 1] = st.y[d.i] - st.y[d.j];
      st.vx[d.i] = st.vx[d.j]; st.vy[d.i] = st.vy[d.j];
      s = st; t = te; T.push(t); muestras.push(copiar(s));
      valores = detectores.map(dd => dd.f(s));
      const todos = cs.every((c, i) => c.fijo || i === centro || posado[i] >= 0);
      if (escena.detenerAlPosarse && todos) break;
      // Se reanuda con pasos iguales hasta el final
      const resto = dur - t;
      if (resto <= 1e-12 * dur) break;
      Nseg = Math.max(1, Math.ceil(resto / h0 - 1e-9)); h = resto / Nseg; tBase = t; k = 0;
      continue;
    }
    s = s1; valores = nuevos; k++; t = tFin;
    T.push(t); muestras.push(s);
  }

  const m = T.length;
  const cuerpos = cs.map((c, i) => {
    const X = new Float64Array(m), Y = new Float64Array(m), VX = new Float64Array(m), VY = new Float64Array(m);
    for (let q = 0; q < m; q++) { X[q] = muestras[q].x[i]; Y[q] = muestras[q].y[i]; VX[q] = muestras[q].vx[i]; VY[q] = muestras[q].vy[i]; }
    return { ...c, x: X, y: Y, vx: VX, vy: VY, tPosado: tPosado[i], posadoEn: posado[i], desplazamiento: [despl[2 * i], despl[2 * i + 1]] };
  });
  return { t: Float64Array.from(T), cuerpos, eventos, centro, integrador, dt: h0, duracion: T[m - 1], pasos: m - 1 };
}

/** @typedef {ReturnType<typeof simularGravitacion>} SimGravitacion */

/**
 * Estado de todos los cuerpos en cualquier instante: parte de la última
 * muestra anterior y avanza con el mismo integrador (exacto respecto de la
 * simulación, no una interpolación).
 * @param {SimGravitacion} sim @param {number} t
 * @returns {Array<{x:number, y:number, vx:number, vy:number, posado:boolean}>}
 */
export function estadoEn(sim, t) {
  const T = sim.t, n = sim.cuerpos.length;
  let lo = 0, hi = T.length - 1;
  if (t >= T[hi]) lo = hi;
  else while (hi - lo > 1) { const md = (lo + hi) >> 1; if (T[md] <= t) lo = md; else hi = md; }
  const posado = new Int32Array(n).fill(-1), despl = new Float64Array(2 * n);
  sim.cuerpos.forEach((c, i) => { if (c.tPosado <= T[lo]) { posado[i] = c.posadoEn; despl[2 * i] = c.desplazamiento[0]; despl[2 * i + 1] = c.desplazamiento[1]; } });
  /** @type {Config} */
  const cfg = { n, mu: Float64Array.from(sim.cuerpos.map(c => c.mu)), movil: Uint8Array.from(sim.cuerpos.map((c, i) => (c.fijo || posado[i] >= 0 ? 0 : 1))), ax: new Float64Array(n), ay: new Float64Array(n) };
  /** @type {Estado} */
  let s = {
    x: Float64Array.from(sim.cuerpos.map(c => c.x[lo])), y: Float64Array.from(sim.cuerpos.map(c => c.y[lo])),
    vx: Float64Array.from(sim.cuerpos.map(c => c.vx[lo])), vy: Float64Array.from(sim.cuerpos.map(c => c.vy[lo])),
  };
  const tau = Math.min(t, sim.duracion) - T[lo];
  if (tau > 0) {
    const m = Math.max(1, Math.ceil(tau / sim.dt - 1e-9));
    for (let q = 0; q < m; q++) s = avanzar(cfg, sim.integrador, posado, despl, s, tau / m);
  }
  return sim.cuerpos.map((c, i) => ({ x: s.x[i], y: s.y[i], vx: s.vx[i], vy: s.vy[i], posado: posado[i] >= 0 }));
}

/**
 * Energía cinética, potencial gravitatoria y total del sistema. Un par
 * contribuye a U si al menos uno de los dos atrae (las partículas de prueba
 * tienen masa pero no atraen).
 * @param {Array<{masa:number, mu:number}>} cuerpos @param {Array<{x:number, y:number, vx:number, vy:number}>} estado
 */
export function energiaSistema(cuerpos, estado) {
  let K = 0, U = 0;
  for (let i = 0; i < cuerpos.length; i++) {
    const s = estado[i];
    K += 0.5 * cuerpos[i].masa * (s.vx * s.vx + s.vy * s.vy);
    for (let j = i + 1; j < cuerpos.length; j++) {
      const mi = cuerpos[i].mu, mj = cuerpos[j].mu, atraen = (mi > 0 ? 1 : 0) + (mj > 0 ? 1 : 0);
      if (!atraen) continue;
      const r = Math.hypot(s.x - estado[j].x, s.y - estado[j].y);
      U -= (mj * cuerpos[i].masa + mi * cuerpos[j].masa) / atraen / r;
    }
  }
  return { K, U, E: K + U };
}

/**
 * Momento angular total respecto de un punto (componente z, kg·m²/s).
 * @param {Array<{masa:number}>} cuerpos @param {Array<{x:number, y:number, vx:number, vy:number}>} estado @param {[number, number]} [origen]
 */
export function momentoAngular(cuerpos, estado, origen = [0, 0]) {
  let L = 0;
  for (let i = 0; i < cuerpos.length; i++) {
    const s = estado[i];
    L += cuerpos[i].masa * ((s.x - origen[0]) * s.vy - (s.y - origen[1]) * s.vx);
  }
  return L;
}

/**
 * Escena del espacio Órbitas: un planeta fijo en el origen y un satélite
 * (partícula de prueba) a la altura h, en la dirección φ, con velocidad v
 * que forma el ángulo α con la horizontal local.
 * @param {{mu:number, radio:number, nombre?:string}} planeta
 * @param {{altura:number, velocidad:number, alfa?:number, phi?:number, sentido?:number, masa?:number, nombre?:string}} sat
 * @returns {CuerpoEscena[]}
 */
export function cuerposOrbita(planeta, sat) {
  const r = planeta.radio + sat.altura, phi = sat.phi ?? Math.PI / 2, a = sat.alfa ?? 0, s = sat.sentido ?? 1;
  const ur = [Math.cos(phi), Math.sin(phi)], ut = [-s * Math.sin(phi), s * Math.cos(phi)];
  const v = sat.velocidad;
  return [
    { nombre: planeta.nombre ?? 'Planeta', mu: planeta.mu, radio: planeta.radio, fijo: true, x: 0, y: 0, vx: 0, vy: 0 },
    {
      nombre: sat.nombre ?? 'Satélite', masa: sat.masa ?? 1000, prueba: true,
      x: r * ur[0], y: r * ur[1],
      vx: v * (Math.cos(a) * ut[0] + Math.sin(a) * ur[0]), vy: v * (Math.cos(a) * ut[1] + Math.sin(a) * ur[1]),
    },
  ];
}
