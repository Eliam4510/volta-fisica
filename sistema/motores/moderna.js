/* ==========================================================================
   Volta — motor de física moderna
   Dos partes, en SI y puras (sin DOM):
   1. Efecto fotoeléctrico. Cada fotón de energía hf arranca un electrón de
      la placa con probabilidad η (rendimiento cuántico) si hf > W. El
      electrón sale con una energía cinética repartida de manera uniforme
      entre 0 y K_max = hf − W y en una dirección con la ley del coseno
      (Lambert: sen²θ uniforme en [0, 1], acimut uniforme), desde el centro
      de la placa. Entre la placa (x = 0) y el colector, un disco de radio R
      paralelo a ella a la distancia d, el campo es uniforme: el voltaje V
      del colector respecto de la placa acelera al electrón con
      a = eV/(m·d) a lo largo de x. Su recorrido es una parábola exacta: o
      llega al plano del colector (y lo recoge si cae a menos de R del eje,
      o se pierde contra el tubo) o se frena y vuelve a la placa. La
      corriente I(V) = e·η·Φ_fotones·F(V) usa la fracción F de electrones
      recogidos, que se integra de forma exacta sobre la energía (los
      límites del intervalo de K recogido salen en forma cerrada) y con
      Simpson adaptativo sobre sen²θ. Con un colector infinito
      F = 1 − u + u·ln u, u = e|V|/K_max (V < 0), y F = 1 para V ≥ 0: corte
      en −V₀ = −K_max/e y saturación. Con un colector finito la saturación
      llega de forma gradual (V ≥ K_max·(2d/R)²/e la asegura). La carga
      espacial y el campo de los bordes no se modelan.
      Medida de h: V₀ se mide como el voltaje en que se anula la corriente
      simulada (bisección) y se ajusta V₀ contra f por mínimos cuadrados:
      pendiente h/e, ordenada −W/e.
   2. Núcleo. Tabla de núclidos (masas atómicas de la AME2020 y periodos de
      NUBASE, redondeados) con las cuatro series radiactivas naturales,
      productos de fisión del uranio-235 y núclidos de uso común. Reglas de
      α, β⁻, β⁺, captura electrónica (CE) y γ; cadenas de decaimiento con
      sus ramas; número de α y β⁻ por conservación de A y Z; valor Q con
      las masas atómicas; fisión inducida por un neutrón con el número de
      neutrones por conservación. Decaimiento estocástico de N núcleos con
      un generador de números aleatorios con semilla (sfc32): cada núcleo
      recibe su tiempo de vida exponencial y, si se pide, recorre su cadena.
      Retroceso con cinemática relativista exacta: en dos cuerpos los
      momentos son iguales y opuestos y la energía cinética se reparte casi
      en razón inversa de las masas; en β, tres cuerpos (electrón,
      antineutrino o neutrino, núcleo hijo) que cierran el balance de
      momento y energía.
   Lo usan las pantallas de Física moderna y las pruebas
   (pruebas/moderna.test.js).
   ========================================================================== */

// ---------------------------------------------------------------------------
// Constantes (CODATA 2018; h, e y c son exactas en el SI)
// ---------------------------------------------------------------------------
/** Constante de Planck, J·s. */
export const H = 6.62607015e-34;
/** Carga elemental, C (y valor de 1 eV en J). */
export const E_CARGA = 1.602176634e-19;
/** Rapidez de la luz en el vacío, m/s. */
export const C_LUZ = 299792458;
/** Masa del electrón, kg. */
export const M_E = 9.1093837015e-31;
/** Un electronvoltio, J. */
export const EV = E_CARGA;
/** Un megaelectronvoltio, J. */
export const MEV = 1e6 * E_CARGA;
/** Unidad de masa atómica unificada, kg. */
export const U_KG = 1.6605390666e-27;
/** Energía en reposo de 1 u, MeV. */
export const U_MEV = 931.49410242;
/** Masa del electrón, u. */
export const M_E_U = 5.48579909065e-4;
/** Año juliano, s (unidad de los periodos largos). */
export const ANIO = 365.25 * 86400;

const DOS_PI = 2 * Math.PI;

// ---------------------------------------------------------------------------
// 1 · Efecto fotoeléctrico
// ---------------------------------------------------------------------------

/**
 * Funciones de trabajo de metales limpios, en eV (valores de tabla del CRC
 * Handbook, Michaelson 1977, redondeados). La del sodio, 2.36 eV, coincide
 * con el umbral de 526 nm del problema MEXT 2012 1-(5).
 * @type {Record<string, {nombre: string, simbolo: string, W: number}>}
 */
export const METALES = {
  cs: { nombre: 'Cesio', simbolo: 'Cs', W: 2.14 },
  k: { nombre: 'Potasio', simbolo: 'K', W: 2.30 },
  na: { nombre: 'Sodio', simbolo: 'Na', W: 2.36 },
  ca: { nombre: 'Calcio', simbolo: 'Ca', W: 2.87 },
  li: { nombre: 'Litio', simbolo: 'Li', W: 2.93 },
  ag: { nombre: 'Plata', simbolo: 'Ag', W: 4.26 },
  al: { nombre: 'Aluminio', simbolo: 'Al', W: 4.28 },
  zn: { nombre: 'Cinc', simbolo: 'Zn', W: 4.33 },
  cu: { nombre: 'Cobre', simbolo: 'Cu', W: 4.65 },
  pt: { nombre: 'Platino', simbolo: 'Pt', W: 5.65 },
};

/** Frecuencia de la luz de longitud de onda λ (m) en el vacío, Hz. @param {number} lambda */
export const frecuencia = lambda => C_LUZ / lambda;
/** Longitud de onda en el vacío de la luz de frecuencia f, m. @param {number} f */
export const longitudOnda = f => C_LUZ / f;
/** Energía de un fotón de frecuencia f, J. @param {number} f */
export const energiaFoton = f => H * f;
/** Frecuencia umbral f₀ = W/h (W en J), Hz. @param {number} W */
export const frecuenciaUmbral = W => W / H;
/** Longitud de onda umbral λ₀ = hc/W (W en J), m. @param {number} W */
export const longitudUmbral = W => H * C_LUZ / W;
/** Recta de Einstein hf − W (J); negativa por debajo del umbral. @param {number} f @param {number} W */
export const rectaEinstein = (f, W) => H * f - W;
/** Energía cinética máxima de los fotoelectrones, K_max = hf − W (0 bajo el umbral), J. @param {number} f @param {number} W */
export const kMax = (f, W) => Math.max(0, H * f - W);
/** Potencial de frenado V₀ = K_max/e, V. @param {number} f @param {number} W */
export const potencialFrenado = (f, W) => kMax(f, W) / E_CARGA;

/**
 * @typedef {Object} Lampara
 * @property {number} lambda  longitud de onda en el vacío (m)
 * @property {number} P       potencia luminosa que llega a la placa (W)
 */
/**
 * @typedef {Object} Tubo
 * @property {number} W            función trabajo de la placa (J)
 * @property {number} eta          rendimiento cuántico: electrones por fotón útil (0 a 1)
 * @property {number} d            separación placa–colector (m)
 * @property {number} R            radio del colector (m); Infinity: plano infinito
 * @property {Lampara[]} lamparas
 */

/** Fotones por segundo de una lámpara: P/(hf). @param {Lampara} l */
export const tasaFotones = l => (l.P > 0 && l.lambda > 0 ? l.P / energiaFoton(frecuencia(l.lambda)) : 0);

/**
 * Electrones emitidos por segundo con cada lámpara (0 bajo el umbral).
 * @param {Tubo} tubo @returns {number[]}
 */
export function tasasElectrones(tubo) {
  return tubo.lamparas.map(l => (kMax(frecuencia(l.lambda), tubo.W) > 0 ? tubo.eta * tasaFotones(l) : 0));
}
/** Electrones emitidos por segundo (todas las lámparas). @param {Tubo} tubo */
export const tasaElectrones = tubo => tasasElectrones(tubo).reduce((s, x) => s + x, 0);
/** Corriente de saturación: todos los electrones emitidos llegan al colector, A. @param {Tubo} tubo */
export const corrienteSaturacion = tubo => E_CARGA * tasaElectrones(tubo);

/**
 * Fracción recogida con un colector plano infinito (emisión de Lambert y
 * energías uniformes en [0, K_max]): F(u) = 1 − u + u·ln u, con
 * u = e|V|/K_max para V < 0; F = 1 si V ≥ 0; F = 0 si u ≥ 1.
 * @param {number} u
 */
export function fraccionInfinita(u) {
  if (!(u > 0)) return 1;
  if (u >= 1) return 0;
  return 1 - u + u * Math.log(u);
}

/**
 * Intervalo de energías cinéticas recogidas [lo, hi] (J, sin acotar a
 * K_max) para los electrones que salen con el ángulo θ (μ = sen²θ).
 * Llegar al plano del colector: K·cos²θ ≥ −eV. Caer dentro de su radio:
 * el desplazamiento lateral es s = 2d·senθ/(cosθ + √(cos²θ + eV/K)), así
 * que s ≤ R equivale a eV/K ≥ q* = β² − 2β·cosθ con β = 2d·senθ/R (si
 * β > cosθ; si no, se cumple siempre).
 * @param {number} mu sen²θ @param {number} U eV (J, con signo) @param {number} d @param {number} R
 * @returns {[number, number]}
 */
function intervaloRecogido(mu, U, d, R) {
  const c2 = 1 - mu, c = Math.sqrt(Math.max(0, c2)), s = Math.sqrt(Math.max(0, mu));
  let lo = 0, hi = Infinity;
  if (U < 0) { if (c2 <= 0) return [1, 0]; lo = -U / c2; }
  if (Number.isFinite(R)) {
    const b = 2 * d * s / R;
    if (b > c) {
      const q = b * b - 2 * b * c;
      if (U > 0) { if (q > 0) hi = U / q; }
      else if (U === 0) { if (q > 0) return [1, 0]; }
      else { if (q >= 0) return [1, 0]; lo = Math.max(lo, U / q); }
    }
  }
  return [lo, hi];
}

/**
 * Integral adaptativa de Simpson de f en [a, b].
 * @param {(x: number) => number} f @param {number} a @param {number} b @param {number} [tol]
 */
function simpson(f, a, b, tol = 1e-10) {
  const fa = f(a), fb = f(b), m = (a + b) / 2, fm = f(m);
  const paso = (a, b, fa, fm, fb, todo, tol, prof) => {
    const m = (a + b) / 2, l = (a + m) / 2, r = (m + b) / 2, fl = f(l), fr = f(r);
    const izq = (m - a) / 6 * (fa + 4 * fl + fm), der = (b - m) / 6 * (fm + 4 * fr + fb), dos = izq + der;
    if (prof <= 0 || Math.abs(dos - todo) <= 15 * tol) return dos + (dos - todo) / 15;
    return paso(a, m, fa, fl, fm, izq, tol / 2, prof - 1) + paso(m, b, fm, fr, fb, der, tol / 2, prof - 1);
  };
  return paso(a, b, fa, fm, fb, (b - a) / 6 * (fa + 4 * fm + fb), tol, 40);
}

/**
 * Fracción de los electrones emitidos (con energías uniformes en
 * [0, K_max]) que recoge el colector con el voltaje V.
 * @param {number} Kmax J @param {number} V V @param {{d: number, R: number}} geo
 */
export function fraccionRecogida(Kmax, V, geo) {
  if (!(Kmax > 0)) return 0;
  const U = E_CARGA * V;
  if (!Number.isFinite(geo.R)) return fraccionInfinita(-U / Kmax);
  const g = mu => {
    const [lo, hi] = intervaloRecogido(mu, U, geo.d, geo.R);
    return Math.max(0, Math.min(hi, Kmax) - Math.max(lo, 0)) / Kmax;
  };
  // Se parte [0, 1] en tramos para que Simpson no se salte un rincón estrecho
  let s = 0;
  const n = 16;
  for (let i = 0; i < n; i++) s += simpson(g, i / n, (i + 1) / n, 1e-11);
  return Math.min(1, Math.max(0, s));
}

/**
 * Fracción recogida de los electrones que salen con energía K (todas las
 * direcciones de Lambert): para la gráfica de energías.
 * @param {number} K J @param {number} V @param {{d: number, R: number}} geo
 */
export function fraccionPorEnergia(K, V, geo) {
  if (!(K > 0)) return 0;
  const U = E_CARGA * V;
  if (!Number.isFinite(geo.R)) return U >= 0 ? 1 : Math.max(0, 1 + U / K);
  const g = mu => { const [lo, hi] = intervaloRecogido(mu, U, geo.d, geo.R); return K >= lo && K <= hi ? 1 : 0; };
  let s = 0;
  const n = 400;
  for (let i = 0; i < n; i++) s += g((i + 0.5) / n);
  return s / n;
}

/**
 * Corriente en el colector (A) con el voltaje V del colector respecto de la
 * placa: suma sobre las lámparas de e·η·Φ·F(V).
 * @param {Tubo} tubo @param {number} V
 */
export function corriente(tubo, V) {
  const tasas = tasasElectrones(tubo);
  let I = 0;
  tubo.lamparas.forEach((l, i) => {
    if (!(tasas[i] > 0)) return;
    I += E_CARGA * tasas[i] * fraccionRecogida(kMax(frecuencia(l.lambda), tubo.W), V, tubo);
  });
  return I;
}

/**
 * Curva I(V) en n + 1 voltajes de Vmin a Vmax.
 * @param {Tubo} tubo @param {{Vmin: number, Vmax: number, n?: number}} o
 * @returns {Array<[number, number]>} pares [V, I]
 */
export function curvaIV(tubo, { Vmin, Vmax, n = 160 }) {
  /** @type {Array<[number, number]>} */
  const r = [];
  for (let i = 0; i <= n; i++) { const V = Vmin + (Vmax - Vmin) * i / n; r.push([V, corriente(tubo, V)]); }
  return r;
}

/**
 * Voltaje de corte −V₀ del tubo: el mayor potencial de frenado de sus
 * lámparas (0 si ninguna supera el umbral), en V (positivo).
 * @param {Tubo} tubo
 */
export function potencialCorte(tubo) {
  return tubo.lamparas.reduce((m, l) => Math.max(m, potencialFrenado(frecuencia(l.lambda), tubo.W)), 0);
}

/**
 * Mide V₀ con la corriente simulada: bisección del voltaje en que la
 * corriente se anula (el amperímetro ya no marca nada).
 * @param {Tubo} tubo @param {{tol?: number}} [o]
 * @returns {number} V₀ en V (0 si no hay corriente)
 */
export function medirPotencialFrenado(tubo, o = {}) {
  const tol = o.tol ?? 1e-9;
  if (!(corriente(tubo, 0) > 0)) return 0;
  // Un voltaje de frenado sin corriente: se busca hacia abajo
  let a = 0, b = -1;
  for (let k = 0; k < 60 && corriente(tubo, b) > 0; k++) { a = b; b *= 2; }
  for (let k = 0; k < 200 && a - b > tol; k++) {
    const m = (a + b) / 2;
    if (corriente(tubo, m) > 0) a = m; else b = m;
  }
  return -(a + b) / 2;
}

/**
 * Recta de mínimos cuadrados y = m·x + b.
 * @param {Array<[number, number]>} puntos
 * @returns {{pendiente: number, ordenada: number, r2: number, n: number}}
 */
export function ajusteLineal(puntos) {
  const n = puntos.length;
  if (n < 2) return { pendiente: NaN, ordenada: NaN, r2: NaN, n };
  let sx = 0, sy = 0;
  for (const [x, y] of puntos) { sx += x; sy += y; }
  const mx = sx / n, my = sy / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of puntos) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }
  const m = sxy / sxx, b = my - m * mx;
  return { pendiente: m, ordenada: b, r2: syy > 0 ? sxy * sxy / (sxx * syy) : 1, n };
}

/**
 * Constante de Planck y función trabajo a partir de mediciones (f, V₀): la
 * recta V₀ = (h/e)·f − W/e.
 * @param {Array<{f: number, V0: number}>} mediciones
 * @returns {{h: number, W: number, pendiente: number, ordenada: number, f0: number, r2: number, n: number}}
 */
export function medirPlanck(mediciones) {
  const a = ajusteLineal(mediciones.map(m => [m.f, m.V0]));
  return { h: a.pendiente * E_CARGA, W: -a.ordenada * E_CARGA, pendiente: a.pendiente, ordenada: a.ordenada, f0: -a.ordenada / a.pendiente, r2: a.r2, n: a.n };
}

// ----------------------------------------------------- electrones animados

/**
 * Generador de números aleatorios con semilla (sfc32, sembrado con
 * splitmix32). Devuelve una función que da números en [0, 1). Solo usa
 * aritmética entera de 32 bits: la secuencia es la misma en cualquier
 * máquina.
 * @param {number} [semilla=1]
 * @returns {() => number}
 */
export function aleatorio(semilla = 1) {
  let s = (Math.floor(Math.abs(semilla)) >>> 0) || 1;
  const sm = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = sm(), b = sm(), c = sm(), d = sm();
  return () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/**
 * @typedef {Object} Fotoelectron
 * @property {number} t        instante de emisión (s)
 * @property {number} lampara  índice de la lámpara que lo arrancó
 * @property {number} K        energía cinética al salir (J)
 * @property {number} mu       sen²θ (θ medido desde la normal de la placa)
 * @property {number} phi      acimut (rad); φ = 0 es el plano del dibujo, hacia arriba
 */

/**
 * Muestra de fotoelectrones emitidos entre t0 y t1 (proceso de Poisson de
 * tasa η·Φ por lámpara), cada uno representante de `porPunto` electrones
 * reales. Ordenados por instante de emisión.
 * @param {Tubo} tubo
 * @param {{t0?: number, t1: number, porPunto?: number, semilla?: number, max?: number}} o
 * @returns {Fotoelectron[]}
 */
export function emitirElectrones(tubo, { t0 = 0, t1, porPunto = 1, semilla = 1, max = 4000 }) {
  const tasas = tasasElectrones(tubo), r = [];
  tubo.lamparas.forEach((l, i) => {
    const tasa = tasas[i] / Math.max(1e-300, porPunto);
    if (!(tasa > 0)) return;
    const Km = kMax(frecuencia(l.lambda), tubo.W), azar = aleatorio((semilla * 7919 + i * 104729) >>> 0);
    let t = t0;
    for (let k = 0; k < max; k++) {
      t += -Math.log(1 - azar()) / tasa;
      if (t > t1) break;
      r.push({ t, lampara: i, K: Km * azar(), mu: azar(), phi: DOS_PI * azar() });
    }
  });
  r.sort((a, b) => a.t - b.t);
  return r.slice(0, max);
}

/**
 * Vuelo de un fotoelectrón con el voltaje V: destino ('colector', 'fuera'
 * si cruza el plano del colector fuera de su radio, 'placa' si se frena y
 * vuelve, 'pared' si antes llega a la pared lateral del tubo, de radio
 * o.pared), duración del vuelo y punto final. La pared no cambia la
 * corriente: lo que choca con ella tampoco llegaba al colector.
 * @param {Fotoelectron} e @param {Tubo} tubo @param {number} V @param {{pared?: number}} [o]
 * @returns {{destino: 'colector' | 'fuera' | 'placa' | 'pared', T: number, fin: [number, number, number], v0: [number, number, number], a: number}}
 */
export function vueloElectron(e, tubo, V, o = {}) {
  const r = vueloLibre(e, tubo, V), vl = Math.hypot(r.v0[1], r.v0[2]);
  if (o.pared > 0 && vl > 0 && r.destino !== 'colector') {
    const T = o.pared / vl;
    if (T < r.T) return { destino: 'pared', T, fin: [r.v0[0] * T + 0.5 * r.a * T * T, r.v0[1] * T, r.v0[2] * T], v0: r.v0, a: r.a };
  }
  return r;
}
/** @param {Fotoelectron} e @param {Tubo} tubo @param {number} V @returns {{destino: 'colector' | 'fuera' | 'placa' | 'pared', T: number, fin: [number, number, number], v0: [number, number, number], a: number}} */
function vueloLibre(e, tubo, V) {
  const v = Math.sqrt(2 * e.K / M_E), c = Math.sqrt(Math.max(0, 1 - e.mu)), s = Math.sqrt(Math.max(0, e.mu));
  const v0 = /** @type {[number, number, number]} */ ([v * c, v * s * Math.cos(e.phi), v * s * Math.sin(e.phi)]);
  const a = E_CARGA * V / (M_E * tubo.d), disc = v0[0] * v0[0] + 2 * a * tubo.d;
  if (disc >= 0 && v0[0] + Math.sqrt(disc) > 0) {
    const T = 2 * tubo.d / (v0[0] + Math.sqrt(disc));
    const fin = /** @type {[number, number, number]} */ ([tubo.d, v0[1] * T, v0[2] * T]);
    return { destino: Math.hypot(fin[1], fin[2]) <= tubo.R ? 'colector' : 'fuera', T, fin, v0, a };
  }
  // Se frena antes del colector y vuelve a la placa
  const T = a < 0 ? -2 * v0[0] / a : 0;
  return { destino: 'placa', T, fin: [0, v0[1] * T, v0[2] * T], v0, a };
}

/**
 * Posición (m) y velocidad (m/s) de un electrón τ segundos después de salir.
 * @param {ReturnType<typeof vueloElectron>} vuelo @param {number} tau
 */
export function estadoElectron(vuelo, tau) {
  const { v0, a } = vuelo, t = Math.max(0, Math.min(vuelo.T, tau));
  return {
    p: /** @type {[number, number, number]} */ ([v0[0] * t + 0.5 * a * t * t, v0[1] * t, v0[2] * t]),
    v: /** @type {[number, number, number]} */ ([v0[0] + a * t, v0[1], v0[2]]),
  };
}

// ---------------------------------------------------------------------------
// 2 · Núcleo
// ---------------------------------------------------------------------------

/** Símbolos de los elementos por número atómico (0: neutrón). */
export const SIMBOLOS = ['n',
  'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca',
  'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr',
  'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd',
  'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg',
  'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm'];
/** Nombres de los elementos por número atómico (0: neutrón). */
export const NOMBRES = ['Neutrón',
  'Hidrógeno', 'Helio', 'Litio', 'Berilio', 'Boro', 'Carbono', 'Nitrógeno', 'Oxígeno', 'Flúor', 'Neón', 'Sodio', 'Magnesio',
  'Aluminio', 'Silicio', 'Fósforo', 'Azufre', 'Cloro', 'Argón', 'Potasio', 'Calcio', 'Escandio', 'Titanio', 'Vanadio', 'Cromo',
  'Manganeso', 'Hierro', 'Cobalto', 'Níquel', 'Cobre', 'Cinc', 'Galio', 'Germanio', 'Arsénico', 'Selenio', 'Bromo', 'Kriptón',
  'Rubidio', 'Estroncio', 'Itrio', 'Circonio', 'Niobio', 'Molibdeno', 'Tecnecio', 'Rutenio', 'Rodio', 'Paladio', 'Plata',
  'Cadmio', 'Indio', 'Estaño', 'Antimonio', 'Telurio', 'Yodo', 'Xenón', 'Cesio', 'Bario', 'Lantano', 'Cerio', 'Praseodimio',
  'Neodimio', 'Prometio', 'Samario', 'Europio', 'Gadolinio', 'Terbio', 'Disprosio', 'Holmio', 'Erbio', 'Tulio', 'Iterbio',
  'Lutecio', 'Hafnio', 'Tantalio', 'Wolframio', 'Renio', 'Osmio', 'Iridio', 'Platino', 'Oro', 'Mercurio', 'Talio', 'Plomo',
  'Bismuto', 'Polonio', 'Astato', 'Radón', 'Francio', 'Radio', 'Actinio', 'Torio', 'Protactinio', 'Uranio', 'Neptunio',
  'Plutonio', 'Americio', 'Curio', 'Berkelio', 'Californio', 'Einstenio', 'Fermio'];

/** Tipos de decaimiento con su cambio de Z y A en el núcleo. */
export const TIPOS_DECAIMIENTO = {
  alfa: { nombre: 'Alfa', simbolo: 'α', dZ: -2, dA: -4 },
  'beta-': { nombre: 'Beta menos', simbolo: 'β⁻', dZ: 1, dA: 0 },
  'beta+': { nombre: 'Beta más', simbolo: 'β⁺', dZ: -1, dA: 0 },
  ce: { nombre: 'Captura electrónica', simbolo: 'CE', dZ: -1, dA: 0 },
  gamma: { nombre: 'Gamma', simbolo: 'γ', dZ: 0, dA: 0 },
};

/**
 * Lo que sale (o entra) del núcleo en cada tipo, con su carga (en e) y su
 * número másico: Z_padre = Z_hijo + carga, A_padre = A_hijo + A. En la CE
 * el núcleo absorbe un electrón: cuenta como una carga +1 que sale.
 */
export const EMITIDAS = {
  alfa: { nombre: 'partícula α', simbolo: 'α', carga: 2, A: 4 },
  'beta-': { nombre: 'electrón', simbolo: 'e⁻', carga: -1, A: 0 },
  'beta+': { nombre: 'positrón', simbolo: 'e⁺', carga: 1, A: 0 },
  ce: { nombre: 'neutrino', simbolo: 'ν', carga: 1, A: 0 },
  gamma: { nombre: 'fotón γ', simbolo: 'γ', carga: 0, A: 0 },
};

/**
 * @typedef {Object} ModoDecaimiento
 * @property {'alfa' | 'beta-' | 'beta+' | 'ce' | 'gamma'} tipo
 * @property {number} rama     fracción de los decaimientos (0 a 1)
 * @property {string} [hijo]   clave del hijo si no es el estado fundamental (isómero)
 */
/**
 * @typedef {Object} Nuclido
 * @property {number} Z
 * @property {number} A
 * @property {number} masa       masa atómica (u); el neutrón, su masa
 * @property {number | null} T   periodo de semidesintegración (s); null si es estable
 * @property {ModoDecaimiento[]} modos
 * @property {number} [exc]      energía de excitación de un isómero (MeV)
 */

const s = 1, mn = 60, hr = 3600, dia = 86400, an = ANIO;
/** @param {number} Z @param {number} A @param {number} masa @param {number | null} T @param {Array<[ModoDecaimiento['tipo'], number, string?]>} [modos] @param {number} [exc] @returns {Nuclido} */
const nu = (Z, A, masa, T, modos = [], exc) => ({ Z, A, masa, T, modos: modos.map(([tipo, rama, hijo]) => (hijo ? { tipo, rama, hijo } : { tipo, rama })), ...(exc != null ? { exc } : {}) });
const exc = (masa, MeV) => masa + MeV / U_MEV;

/**
 * Tabla de núclidos. Masas atómicas (u) de la AME2020 y periodos de NUBASE,
 * redondeados. Las ramas menores de 0.1 % se omiten; el bismuto-209 se toma
 * estable (su α, de 2.0 × 10¹⁹ años, se ignora: es el final clásico de la
 * serie del neptunio). Clave: "U-238", "Ba-137m", "n".
 * @type {Record<string, Nuclido>}
 */
export const NUCLIDOS = {
  n: nu(0, 1, 1.00866491595, 609 * s, [['beta-', 1, 'H-1']]),
  'H-1': nu(1, 1, 1.00782503223, null),
  'H-2': nu(1, 2, 2.01410177812, null),
  'H-3': nu(1, 3, 3.01604928, 12.32 * an, [['beta-', 1]]),
  'He-3': nu(2, 3, 3.01602932, null),
  'He-4': nu(2, 4, 4.00260325413, null),
  'C-12': nu(6, 12, 12, null),
  'C-14': nu(6, 14, 14.0032419884, 5730 * an, [['beta-', 1]]),
  'N-14': nu(7, 14, 14.00307400443, null),
  'O-16': nu(8, 16, 15.99491461957, null),
  'O-18': nu(8, 18, 17.99915961, null),
  'F-18': nu(9, 18, 18.0009369, 109.77 * mn, [['beta+', 0.9686], ['ce', 0.0314]]),
  'Ne-22': nu(10, 22, 21.991385114, null),
  'Na-22': nu(11, 22, 21.9944374, 2.6018 * an, [['beta+', 0.903], ['ce', 0.097]]),
  'Ar-40': nu(18, 40, 39.9623831237, null),
  'K-40': nu(19, 40, 39.963998166, 1.248e9 * an, [['beta-', 0.8928], ['ce', 0.1072]]),
  'Ca-40': nu(20, 40, 39.962590865, null),
  'Fe-56': nu(26, 56, 55.93493633, null),
  'Co-60': nu(27, 60, 59.9338163, 5.2714 * an, [['beta-', 1]]),
  'Ni-60': nu(28, 60, 59.9307859, null),
  'Ni-62': nu(28, 62, 61.92834537, null),
  'Sr-90': nu(38, 90, 89.9077299, 28.79 * an, [['beta-', 1]]),
  'Y-90': nu(39, 90, 89.9071439, 64.05 * hr, [['beta-', 1]]),
  'Zr-90': nu(40, 90, 89.9046975, null),
  'Tc-99m': nu(43, 99, exc(98.9062533, 0.1427), 6.0067 * hr, [['gamma', 1, 'Tc-99']], 0.1427),
  'Tc-99': nu(43, 99, 98.9062533, 2.111e5 * an, [['beta-', 1]]),
  'Ru-99': nu(44, 99, 98.9059339, null),
  'I-131': nu(53, 131, 130.9061263, 8.0252 * dia, [['beta-', 1]]),
  'Xe-131': nu(54, 131, 130.9050841, null),
  'Cs-137': nu(55, 137, 136.9070895, 30.08 * an, [['beta-', 0.9436, 'Ba-137m'], ['beta-', 0.0564]]),
  'Ba-137m': nu(56, 137, exc(136.9058274, 0.661657), 2.552 * mn, [['gamma', 1, 'Ba-137']], 0.661657),
  'Ba-137': nu(56, 137, 136.9058274, null),
  // Productos de fisión del uranio-235 (sus hijas no están en la tabla)
  'Kr-89': nu(36, 89, 88.9178354, 3.15 * mn, [['beta-', 1]]),
  'Kr-92': nu(36, 92, 91.926173, 1.84 * s, [['beta-', 1]]),
  'Sr-94': nu(38, 94, 93.9153561, 75.3 * s, [['beta-', 1]]),
  'Xe-140': nu(54, 140, 139.9216458, 13.6 * s, [['beta-', 1]]),
  'Ba-141': nu(56, 141, 140.9144035, 18.27 * mn, [['beta-', 1]]),
  'Ba-144': nu(56, 144, 143.9229548, 11.5 * s, [['beta-', 1]]),
  // Serie del uranio (4n + 2)
  'U-238': nu(92, 238, 238.0507884, 4.468e9 * an, [['alfa', 1]]),
  'Th-234': nu(90, 234, 234.0436014, 24.10 * dia, [['beta-', 1, 'Pa-234m']]),
  'Pa-234m': nu(91, 234, exc(234.0433081, 0.0739), 1.159 * mn, [['beta-', 1]], 0.0739),
  'U-234': nu(92, 234, 234.0409523, 2.455e5 * an, [['alfa', 1]]),
  'Th-230': nu(90, 230, 230.0331341, 7.54e4 * an, [['alfa', 1]]),
  'Ra-226': nu(88, 226, 226.0254103, 1600 * an, [['alfa', 1]]),
  'Rn-222': nu(86, 222, 222.0175782, 3.8235 * dia, [['alfa', 1]]),
  'Po-218': nu(84, 218, 218.008973, 3.098 * mn, [['alfa', 1]]),
  'Pb-214': nu(82, 214, 213.9998059, 26.8 * mn, [['beta-', 1]]),
  'Bi-214': nu(83, 214, 213.9987115, 19.9 * mn, [['beta-', 1]]),
  'Po-214': nu(84, 214, 213.9952014, 164.3e-6 * s, [['alfa', 1]]),
  'Pb-210': nu(82, 210, 209.9841889, 22.20 * an, [['beta-', 1]]),
  'Bi-210': nu(83, 210, 209.9841207, 5.012 * dia, [['beta-', 1]]),
  'Po-210': nu(84, 210, 209.9828741, 138.376 * dia, [['alfa', 1]]),
  'Pb-206': nu(82, 206, 205.9744657, null),
  // Serie del torio (4n)
  'U-236': nu(92, 236, 236.045568, 2.342e7 * an, [['alfa', 1]]),
  'Th-232': nu(90, 232, 232.0380558, 1.405e10 * an, [['alfa', 1]]),
  'Ra-228': nu(88, 228, 228.0310707, 5.75 * an, [['beta-', 1]]),
  'Ac-228': nu(89, 228, 228.0310208, 6.15 * hr, [['beta-', 1]]),
  'Th-228': nu(90, 228, 228.0287413, 1.9116 * an, [['alfa', 1]]),
  'Ra-224': nu(88, 224, 224.0202118, 3.6319 * dia, [['alfa', 1]]),
  'Rn-220': nu(86, 220, 220.0113941, 55.6 * s, [['alfa', 1]]),
  'Po-216': nu(84, 216, 216.0019152, 0.145 * s, [['alfa', 1]]),
  'Pb-212': nu(82, 212, 211.9918977, 10.64 * hr, [['beta-', 1]]),
  'Bi-212': nu(83, 212, 211.991286, 60.55 * mn, [['beta-', 0.6406], ['alfa', 0.3594]]),
  'Po-212': nu(84, 212, 211.988868, 0.299e-6 * s, [['alfa', 1]]),
  'Tl-208': nu(81, 208, 207.982019, 3.053 * mn, [['beta-', 1]]),
  'Pb-208': nu(82, 208, 207.9766525, null),
  // Serie del actinio (4n + 3)
  'Pu-239': nu(94, 239, 239.0521634, 24110 * an, [['alfa', 1]]),
  'U-235': nu(92, 235, 235.0439301, 7.04e8 * an, [['alfa', 1]]),
  'Th-231': nu(90, 231, 231.0363043, 25.52 * hr, [['beta-', 1]]),
  'Pa-231': nu(91, 231, 231.0358842, 3.276e4 * an, [['alfa', 1]]),
  'Ac-227': nu(89, 227, 227.0277523, 21.772 * an, [['beta-', 0.9862], ['alfa', 0.0138]]),
  'Th-227': nu(90, 227, 227.0277042, 18.68 * dia, [['alfa', 1]]),
  'Fr-223': nu(87, 223, 223.019736, 22.00 * mn, [['beta-', 1]]),
  'Ra-223': nu(88, 223, 223.0185023, 11.43 * dia, [['alfa', 1]]),
  'Rn-219': nu(86, 219, 219.0094804, 3.96 * s, [['alfa', 1]]),
  'Po-215': nu(84, 215, 214.9994201, 1.781e-3 * s, [['alfa', 1]]),
  'Pb-211': nu(82, 211, 210.988737, 36.1 * mn, [['beta-', 1]]),
  'Bi-211': nu(83, 211, 210.987269, 2.14 * mn, [['alfa', 0.99724], ['beta-', 0.00276]]),
  'Po-211': nu(84, 211, 210.9866532, 0.516 * s, [['alfa', 1]]),
  'Tl-207': nu(81, 207, 206.977419, 4.77 * mn, [['beta-', 1]]),
  'Pb-207': nu(82, 207, 206.9758973, null),
  // Serie del neptunio (4n + 1)
  'Am-241': nu(95, 241, 241.0568293, 432.6 * an, [['alfa', 1]]),
  'Np-237': nu(93, 237, 237.0481736, 2.144e6 * an, [['alfa', 1]]),
  'Pa-233': nu(91, 233, 233.0402473, 26.975 * dia, [['beta-', 1]]),
  'U-233': nu(92, 233, 233.0396355, 1.592e5 * an, [['alfa', 1]]),
  'Th-229': nu(90, 229, 229.0317627, 7880 * an, [['alfa', 1]]),
  'Ra-225': nu(88, 225, 225.0236119, 14.9 * dia, [['beta-', 1]]),
  'Ac-225': nu(89, 225, 225.0232295, 9.919 * dia, [['alfa', 1]]),
  'Fr-221': nu(87, 221, 221.0142552, 4.801 * mn, [['alfa', 1]]),
  'At-217': nu(85, 217, 217.0047192, 32.3e-3 * s, [['alfa', 1]]),
  'Bi-213': nu(83, 213, 212.9943851, 45.59 * mn, [['beta-', 0.9791], ['alfa', 0.0209]]),
  'Po-213': nu(84, 213, 212.992857, 3.708e-6 * s, [['alfa', 1]]),
  'Tl-209': nu(81, 209, 208.985359, 2.162 * mn, [['beta-', 1]]),
  'Pb-209': nu(82, 209, 208.9810905, 3.253 * hr, [['beta-', 1]]),
  'Bi-209': nu(83, 209, 208.9803991, null),
};

/** Clave de un núclido: "U-238" (Z = 0, A = 1: "n"; isómero: "Ba-137m"). @param {number} Z @param {number} A @param {boolean} [isomero] */
export function claveNuclido(Z, A, isomero = false) {
  if (Z === 0 && A === 1) return 'n';
  return `${SIMBOLOS[Z] ?? '?'}-${A}${isomero ? 'm' : ''}`;
}
/** Núclido de la tabla por clave (o null). @param {string} clave @returns {Nuclido | null} */
export const nuclido = clave => (Object.prototype.hasOwnProperty.call(NUCLIDOS, clave) ? NUCLIDOS[clave] : null);
/** Estado fundamental (o el isómero si no hay otro) con Z y A dados. @param {number} Z @param {number} A */
export function claveDeZA(Z, A) {
  const k = claveNuclido(Z, A);
  if (nuclido(k)) return k;
  return nuclido(k + 'm') ? k + 'm' : null;
}
/** Nombre legible: "Uranio-238", "Bario-137m". @param {string} clave */
export function nombreNuclido(clave) {
  const n = nuclido(clave);
  if (!n) return clave;
  if (clave === 'n') return 'Neutrón';
  return `${NOMBRES[n.Z]}-${n.A}${clave.endsWith('m') ? 'm' : ''}`;
}
/** Constante de decaimiento λ = ln 2/T½ (1/s); 0 si es estable. @param {number | null} T */
export const constanteDecaimiento = T => (T && T > 0 ? Math.LN2 / T : 0);

/**
 * Energía de enlace del núcleo con las masas atómicas:
 * B = (Z·M(¹H) + N·mₙ − M)·c², y por nucleón B/A (MeV).
 * @param {string} clave @returns {{MeV: number, porNucleon: number}}
 */
export function energiaEnlace(clave) {
  const n = nuclido(clave);
  if (!n || n.A < 2) return { MeV: 0, porNucleon: 0 };
  const MeV = (n.Z * NUCLIDOS['H-1'].masa + (n.A - n.Z) * NUCLIDOS.n.masa - n.masa) * U_MEV;
  return { MeV, porNucleon: MeV / n.A };
}

/**
 * Regla de un decaimiento: Z y A del hijo.
 * @param {{Z: number, A: number}} padre @param {keyof typeof TIPOS_DECAIMIENTO} tipo
 * @returns {{Z: number, A: number}}
 */
export function aplicarRegla(padre, tipo) {
  const r = TIPOS_DECAIMIENTO[tipo];
  if (!r) throw new Error(`Tipo de decaimiento desconocido: ${tipo}`);
  return { Z: padre.Z + r.dZ, A: padre.A + r.dA };
}

/**
 * Clave del hijo de un modo de decaimiento (por la regla, o el isómero que
 * indica el modo); null si el hijo no está en la tabla.
 * @param {string} clave @param {ModoDecaimiento} modo
 */
export function hijoDe(clave, modo) {
  if (modo.hijo) return modo.hijo;
  const n = nuclido(clave);
  if (!n) return null;
  const h = aplicarRegla(n, modo.tipo);
  return claveDeZA(h.Z, h.A) ?? claveNuclido(h.Z, h.A);
}

/**
 * Valor Q de un decaimiento con las masas atómicas: α: M_P − M_D − M_He;
 * β⁻, CE y γ: M_P − M_D; β⁺: M_P − M_D − 2mₑ.
 * @param {string} clave @param {ModoDecaimiento | ModoDecaimiento['tipo']} modo
 * @returns {{J: number, MeV: number}}
 */
export function valorQ(clave, modo) {
  const m = typeof modo === 'string' ? (nuclido(clave)?.modos.find(x => x.tipo === modo) || { tipo: modo, rama: 1 }) : modo;
  const P = nuclido(clave), D = nuclido(hijoDe(clave, m));
  if (!P || !D) return { J: NaN, MeV: NaN };
  let du = P.masa - D.masa;
  if (m.tipo === 'alfa') du -= NUCLIDOS['He-4'].masa;
  if (m.tipo === 'beta+') du -= 2 * M_E_U;
  const MeV = du * U_MEV;
  return { J: MeV * MEV, MeV };
}

/**
 * @typedef {Object} Paso
 * @property {string} desde
 * @property {string} hacia
 * @property {ModoDecaimiento['tipo']} tipo
 * @property {number} rama
 * @property {number | null} T   periodo del que decae (s)
 * @property {number} Q          MeV
 */

/**
 * Cadena de decaimiento siguiendo la rama principal (la mayor) de cada
 * núclido hasta uno estable o que no esté en la tabla.
 * @param {string} clave @param {{max?: number}} [o]
 * @returns {{pasos: Paso[], fin: string, estable: boolean}}
 */
export function cadena(clave, o = {}) {
  const pasos = [], max = o.max ?? 60;
  let k = clave;
  for (let i = 0; i < max; i++) {
    const n = nuclido(k);
    if (!n || n.T == null || !n.modos.length) return { pasos, fin: k, estable: !!n && n.T == null };
    const m = n.modos.reduce((a, b) => (b.rama > a.rama ? b : a));
    const h = hijoDe(k, m);
    pasos.push({ desde: k, hacia: h, tipo: m.tipo, rama: m.rama, T: n.T, Q: valorQ(k, m).MeV });
    k = h;
  }
  return { pasos, fin: k, estable: false };
}

/**
 * Todas las transiciones que se alcanzan desde un núclido, con sus ramas
 * (para dibujar la red de una serie).
 * @param {string} clave @returns {Paso[]}
 */
export function arbolDecaimiento(clave) {
  const r = [], vistos = new Set(), cola = [clave];
  while (cola.length && r.length < 400) {
    const k = cola.shift();
    if (vistos.has(k)) continue;
    vistos.add(k);
    const n = nuclido(k);
    if (!n || n.T == null) continue;
    for (const m of n.modos) {
      const h = hijoDe(k, m);
      r.push({ desde: k, hacia: h, tipo: m.tipo, rama: m.rama, T: n.T, Q: valorQ(k, m).MeV });
      cola.push(h);
    }
  }
  return r;
}

/** Cuántos pasos de cada tipo tiene una lista de pasos. @param {Paso[]} pasos */
export function contarPasos(pasos) {
  const c = { alfa: 0, 'beta-': 0, 'beta+': 0, ce: 0, gamma: 0 };
  for (const p of pasos) c[p.tipo] += 1;
  return c;
}

/**
 * Número de α y de β⁻ que llevan de un núcleo a otro por conservación de A
 * y Z (solo esos dos tipos): nα = ΔA/4, nβ = 2nα − ΔZ. Null si no hay
 * solución entera y no negativa.
 * @param {{Z: number, A: number}} padre @param {{Z: number, A: number}} hijo
 */
export function pasosPorConservacion(padre, hijo) {
  const dA = padre.A - hijo.A, dZ = padre.Z - hijo.Z;
  if (dA < 0 || dA % 4 !== 0) return null;
  const alfa = dA / 4, beta = 2 * alfa - dZ;
  return beta >= 0 ? { alfa, beta } : null;
}

// ------------------------------------------------------------- fisión

/**
 * Fisión inducida por un neutrón lento: n + padre → F₁ + F₂ + k·n. El
 * número de neutrones sale de la conservación de A; Z debe conservarse.
 * @param {string} clave @param {[string, string]} fragmentos
 * @returns {{neutrones: number, Q: {J: number, MeV: number}, compuesto: {Z: number, A: number}, conservaZ: boolean}}
 */
export function fision(clave, fragmentos) {
  const P = nuclido(clave), F = fragmentos.map(nuclido);
  if (!P || F.some(f => !f)) throw new Error('Fisión con un núclido que no está en la tabla.');
  const A = P.A + 1, Z = P.Z, k = A - F[0].A - F[1].A;
  const conservaZ = F[0].Z + F[1].Z === Z;
  if (k < 0 || !conservaZ) throw new Error('Los fragmentos no conservan A o Z.');
  const mn = NUCLIDOS.n.masa, MeV = (P.masa + mn - F[0].masa - F[1].masa - k * mn) * U_MEV;
  return { neutrones: k, Q: { J: MeV * MEV, MeV }, compuesto: { Z, A }, conservaZ };
}

// ------------------------------------------------------------- retroceso

/**
 * @typedef {Object} Producto
 * @property {string} nombre
 * @property {string} simbolo
 * @property {string | null} clave
 * @property {number} masa      kg (0 para ν y γ)
 * @property {number} mMeV      energía en reposo, MeV
 * @property {[number, number]} p     momento, kg·m/s
 * @property {number} pMeV      |p|·c, MeV
 * @property {number} K         energía cinética, J
 * @property {number} KMeV
 * @property {number} v         rapidez, m/s
 */

/** @param {string} nombre @param {string} simbolo @param {string | null} clave @param {number} mMeV @param {number} pMeV @param {number} ang @returns {Producto} */
function producto(nombre, simbolo, clave, mMeV, pMeV, ang) {
  const E = Math.hypot(pMeV, mMeV), K = mMeV > 0 ? (pMeV * pMeV) / (E + mMeV) : pMeV;
  const pSI = pMeV * MEV / C_LUZ;
  return {
    nombre, simbolo, clave, masa: mMeV * MEV / (C_LUZ * C_LUZ), mMeV,
    p: [pSI * Math.cos(ang), pSI * Math.sin(ang)], pMeV, K: K * MEV, KMeV: K,
    v: E > 0 ? C_LUZ * pMeV / E : 0,
  };
}
/** Momento (MeV/c) de cada cuerpo en un decaimiento a dos cuerpos en reposo. @param {number} M @param {number} m1 @param {number} m2 */
function pDosCuerpos(M, m1, m2) {
  const a = (M * M - (m1 + m2) ** 2) * (M * M - (m1 - m2) ** 2);
  return a > 0 ? Math.sqrt(a) / (2 * M) : 0;
}

/**
 * Retroceso de un decaimiento del núcleo en reposo, con cinemática
 * relativista exacta. Dos cuerpos (α, CE, γ): momentos iguales y opuestos;
 * la partícula sale en la dirección `direccion`. Tres cuerpos (β⁻, β⁺): el
 * electrón (o positrón) lleva la fracción `reparto` (0 a 1) de la energía
 * cinética máxima que puede llevarse y sale en `direccion`; el
 * antineutrino (o neutrino) sale a `angulo` del electrón con la energía
 * que falta; el hijo cierra el balance de momento.
 * Masas nucleares = atómicas − Z·mₑ (salvo en la CE, que conserva el átomo).
 * @param {string} clave
 * @param {ModoDecaimiento | ModoDecaimiento['tipo']} modo
 * @param {{direccion?: number, reparto?: number, angulo?: number}} [o]
 * @returns {{padre: string, hijo: string, tipo: string, Q: {J: number, MeV: number}, productos: Producto[], balance: {p: [number, number], K: number}}}
 */
export function retroceso(clave, modo, o = {}) {
  const P = nuclido(clave);
  if (!P) throw new Error(`Núclido desconocido: ${clave}`);
  const m = typeof modo === 'string' ? (P.modos.find(x => x.tipo === modo) || { tipo: modo, rama: 1 }) : modo;
  const hk = hijoDe(clave, m), D = nuclido(hk);
  if (!D) throw new Error(`El hijo ${hk} no está en la tabla.`);
  const dir = o.direccion ?? 0, me = M_E_U * U_MEV;
  const nuc = n => (n.masa - n.Z * M_E_U) * U_MEV;
  const Q = valorQ(clave, m);
  if (!(Q.MeV > 0)) throw new Error('Este decaimiento no libera energía (Q ≤ 0).');
  const em = EMITIDAS[m.tipo], prods = [];
  if (m.tipo === 'alfa' || m.tipo === 'gamma' || m.tipo === 'ce') {
    const M = m.tipo === 'ce' ? P.masa * U_MEV : nuc(P);
    const mD = m.tipo === 'ce' ? D.masa * U_MEV : nuc(D);
    const mX = m.tipo === 'alfa' ? nuc(NUCLIDOS['He-4']) : 0;
    const p = pDosCuerpos(M, mD, mX);
    prods.push(producto(em.nombre, em.simbolo, m.tipo === 'alfa' ? 'He-4' : null, mX, p, dir));
    prods.push(producto(`núcleo de ${nombreNuclido(hk)}`, hk, hk, mD, p, dir + Math.PI));
  } else {
    // β: tres cuerpos. Energía disponible: Q = Kₑ + E_ν + K_D
    const mD = nuc(D), q = Q.MeV, psi = o.angulo ?? (2 * Math.PI / 3);
    const pDe = K => Math.sqrt(K * K + 2 * K * me);
    const KD = p => p * p / (Math.hypot(p, mD) + mD);
    const biseccion = (f, a, b) => { for (let k = 0; k < 200 && b - a > 1e-15 * q; k++) { const c = (a + b) / 2; if (f(c) > 0) b = c; else a = c; } return (a + b) / 2; };
    // Lo más que puede llevarse el electrón: con el neutrino sin energía, Kₑ + K_D(pₑ) = Q
    const KeMax = biseccion(K => K + KD(pDe(K)) - q, 0, q);
    const Ke = Math.max(0, Math.min(1, o.reparto ?? 0.4)) * KeMax, pe = pDe(Ke);
    const pD = pn => Math.sqrt(Math.max(0, pe * pe + pn * pn + 2 * pe * pn * Math.cos(psi)));
    const pn = biseccion(x => Ke + x + KD(pD(x)) - q, 0, q);
    const ve = [pe * Math.cos(dir), pe * Math.sin(dir)], vn = [pn * Math.cos(dir + psi), pn * Math.sin(dir + psi)];
    const vd = [-(ve[0] + vn[0]), -(ve[1] + vn[1])];
    prods.push(producto(em.nombre, em.simbolo, null, me, pe, dir));
    prods.push(producto(m.tipo === 'beta-' ? 'antineutrino' : 'neutrino', m.tipo === 'beta-' ? 'ν̄' : 'ν', null, 0, pn, dir + psi));
    prods.push(producto(`núcleo de ${nombreNuclido(hk)}`, hk, hk, mD, Math.hypot(vd[0], vd[1]), Math.atan2(vd[1], vd[0])));
  }
  const bal = prods.reduce((s, x) => ({ p: [s.p[0] + x.p[0], s.p[1] + x.p[1]], K: s.K + x.K }), { p: [0, 0], K: 0 });
  return { padre: clave, hijo: hk, tipo: m.tipo, Q, productos: prods, balance: { p: /** @type {[number, number]} */ (bal.p), K: bal.K } };
}

/**
 * Retroceso de los dos fragmentos de una fisión (n lento + padre): se
 * reparten Q con momentos iguales y opuestos; los neutrones se toman sin
 * energía cinética (simplificación: en realidad se llevan unos 2 MeV cada
 * uno y los fragmentos, el resto).
 * @param {string} clave @param {[string, string]} fragmentos @param {{direccion?: number}} [o]
 */
export function retrocesoFision(clave, fragmentos, o = {}) {
  const fi = fision(clave, fragmentos), dir = o.direccion ?? 0;
  const F = fragmentos.map(k => nuclido(k)), mn = NUCLIDOS.n.masa;
  const mf = F.map(f => (f.masa - f.Z * M_E_U) * U_MEV);
  // Masa disponible para los dos fragmentos: la del compuesto menos los neutrones en reposo
  const M = mf[0] + mf[1] + fi.Q.MeV;
  const p = pDosCuerpos(M, mf[0], mf[1]);
  const productos = [
    producto(`núcleo de ${nombreNuclido(fragmentos[0])}`, fragmentos[0], fragmentos[0], mf[0], p, dir),
    producto(`núcleo de ${nombreNuclido(fragmentos[1])}`, fragmentos[1], fragmentos[1], mf[1], p, dir + Math.PI),
  ];
  for (let i = 0; i < fi.neutrones; i++) productos.push(producto('neutrón', 'n', 'n', mn * U_MEV, 0, 0));
  const bal = productos.reduce((s, x) => ({ p: [s.p[0] + x.p[0], s.p[1] + x.p[1]], K: s.K + x.K }), { p: [0, 0], K: 0 });
  return { ...fi, productos, balance: bal };
}

// ------------------------------------------------- decaimiento estocástico

/** Ley exponencial N₀·2^(−t/T½). @param {number} N0 @param {number} T @param {number} t */
export const leyExponencial = (N0, T, t) => N0 * Math.pow(2, -t / T);

/**
 * @typedef {Object} Muestra
 * @property {number} N0
 * @property {string[]} especies         claves de las especies que aparecen (la primera, la inicial)
 * @property {Float64Array} vidas        instante en que decae cada núcleo inicial (s), ordenados
 * @property {Array<{entradas: Float64Array, salidas: Float64Array}>} pob  instantes de llegada y salida por especie (ordenados)
 * @property {number} T                  periodo usado para la especie inicial (s)
 */

/**
 * Decaimiento estocástico de N₀ núcleos: cada uno recibe un tiempo de vida
 * exponencial −τ·ln(1 − u) con u del generador con semilla. Con
 * `cadena`, cada núcleo sigue después su cadena (eligiendo rama al azar
 * con sus fracciones y el periodo de la tabla de cada hija).
 * @param {{clave?: string, T?: number, N0: number, semilla?: number, cadena?: boolean, maxPasos?: number}} o
 * @returns {Muestra}
 */
export function decaerMuestra({ clave = null, T, N0, semilla = 1, cadena: seguir = false, maxPasos = 30 }) {
  const n0 = Math.max(0, Math.floor(N0)), azar = aleatorio(semilla);
  const T0 = T ?? nuclido(clave)?.T;
  if (!(T0 > 0)) throw new Error('La muestra necesita un periodo de semidesintegración positivo.');
  const especies = [clave ?? 'X'], idx = new Map([[especies[0], 0]]);
  /** @type {number[][]} */ const ent = [[]], sal = [[]];
  const indice = k => { if (!idx.has(k)) { idx.set(k, especies.length); especies.push(k); ent.push([]); sal.push([]); } return idx.get(k); };
  const vidas = new Float64Array(n0), tau0 = T0 / Math.LN2;
  for (let i = 0; i < n0; i++) {
    let t = -tau0 * Math.log(1 - azar());
    vidas[i] = t;
    ent[0].push(0); sal[0].push(t);
    let k = especies[0], n = nuclido(k);
    // La hija de la especie inicial (por su modo principal o al azar entre sus ramas)
    let modo = n && n.modos.length ? elegirRama(n.modos, azar) : null;
    let h = modo ? hijoDe(k, modo) : `${k} (hija)`;
    let j = indice(h);
    ent[j].push(t);
    if (!seguir) { sal[j].push(Infinity); continue; }
    for (let paso = 0; paso < maxPasos; paso++) {
      k = h; n = nuclido(k);
      if (!n || n.T == null || !n.modos.length) { sal[j].push(Infinity); break; }
      t += -(n.T / Math.LN2) * Math.log(1 - azar());
      sal[j].push(t);
      modo = elegirRama(n.modos, azar);
      h = hijoDe(k, modo); j = indice(h); ent[j].push(t);
      if (paso === maxPasos - 1) sal[j].push(Infinity);
    }
  }
  vidas.sort();
  const orden = a => Float64Array.from(a).sort();
  return { N0: n0, especies, vidas, T: T0, pob: ent.map((e, i) => ({ entradas: orden(e), salidas: orden(sal[i]) })) };
}
/** @param {ModoDecaimiento[]} modos @param {() => number} azar */
function elegirRama(modos, azar) {
  if (modos.length === 1) return modos[0];
  const total = modos.reduce((s, m) => s + m.rama, 0);
  let u = azar() * total;
  for (const m of modos) { u -= m.rama; if (u < 0) return m; }
  return modos[modos.length - 1];
}
/** Cuántos valores de un arreglo ordenado son ≤ t. @param {Float64Array} a @param {number} t */
function cuantosHasta(a, t) {
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] <= t) lo = m + 1; else hi = m; }
  return lo;
}
/** Núcleos de la especie inicial que quedan sin decaer en t. @param {Muestra} m @param {number} t */
export const restantes = (m, t) => m.N0 - cuantosHasta(m.vidas, t);
/** Población de la especie j en el instante t. @param {Muestra} m @param {number} j @param {number} t */
export function poblacion(m, j, t) {
  const p = m.pob[j];
  return p ? cuantosHasta(p.entradas, t) - cuantosHasta(p.salidas, t) : 0;
}
/** Desintegraciones de la especie inicial en [t0, t1). @param {Muestra} m @param {number} t0 @param {number} t1 */
export const desintegraciones = (m, t0, t1) => cuantosHasta(m.vidas, t1) - cuantosHasta(m.vidas, t0);

/**
 * Periodo de semidesintegración medido con lo observado hasta `hasta`:
 * la mediana (instante en que ha decaído la mitad; null si aún no ha
 * pasado) y el estimador de máxima verosimilitud con los que siguen vivos
 * (λ = k / (Σtᵢ + (N₀ − k)·t)).
 * @param {Muestra} m @param {number} [hasta=Infinity]
 * @returns {{mediana: number | null, ajuste: number | null, k: number}}
 */
export function periodoMedido(m, hasta = Infinity) {
  const n = m.N0, v = m.vidas, k = cuantosHasta(v, hasta);
  let mediana = null;
  if (n > 0 && 2 * k >= n) {
    // El instante en que N cae a N₀/2 (interpolado entre dos desintegraciones si N₀ es par)
    mediana = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
    if (mediana > hasta) mediana = null;
  }
  let suma = 0;
  for (let i = 0; i < k; i++) suma += v[i];
  const vivo = Number.isFinite(hasta) ? (n - k) * hasta : 0;
  const lambda = k > 0 ? k / (suma + vivo) : 0;
  return { mediana, ajuste: lambda > 0 ? Math.LN2 / lambda : null, k };
}

/**
 * Solución de Bateman para una cadena lineal de constantes λᵢ distintas
 * (la última puede ser 0: estable), con N₀ núcleos de la primera.
 * @param {number[]} lambdas @param {number} N0 @param {number} t
 * @returns {number[]}
 */
export function bateman(lambdas, N0, t) {
  const r = [];
  for (let n = 0; n < lambdas.length; n++) {
    let prod = 1;
    for (let i = 0; i < n; i++) prod *= lambdas[i];
    let suma = 0;
    for (let i = 0; i <= n; i++) {
      let den = 1;
      for (let j = 0; j <= n; j++) if (j !== i) den *= lambdas[j] - lambdas[i];
      suma += Math.exp(-lambdas[i] * t) / den;
    }
    r.push(N0 * prod * suma);
  }
  return r;
}
