/* ==========================================================================
   Volta — motor de ondas y sonido
   Tres partes, todas en SI y puras (sin DOM):
   1. Medio 1D: ecuación de onda m(x)·∂²y/∂t² = ∂/∂x(K(x)·∂y/∂x) − 2β·m·∂y/∂t
      por diferencias finitas (salto de rana, 2.º orden en x y en t) sobre
      una malla uniforme. K es la tensión de una cuerda (o ρv²S en un tubo) y
      m la densidad lineal (ρS): pueden cambiar por tramos, así que la unión
      de dos cuerdas refleja y transmite con los coeficientes de las
      impedancias Z = √(K·m). Masas concentradas en los nodos y resortes en
      serie entre ellos: el esquema conserva exactamente una energía discreta
      (cinética a medio paso + potencial cruzada), y el registro de energía
      cierra con el trabajo de las fuentes, la energía que sale por los
      extremos absorbentes y la que disipa el amortiguamiento. El paso se
      elige bajo la condición CFL (cota de Gershgorin del problema
      generalizado); un paso explícito mayor se rechaza.
      Extremos: fijo (y = 0; con fuente, oscilador que impone y), libre
      (∂y/∂x = 0; con fuente, fuerza o presión aplicada) y absorbente
      (amortiguador adaptado de impedancia Z; con fuente, inyecta una onda
      sin reflejar la que vuelve). En un tubo, abierto = presión nula (libre
      para el desplazamiento) y cerrado = desplazamiento nulo (fijo).
   2. Superposición analítica: ondas senoidales y pulsos exactos, reflexión
      por el método de las imágenes (fijo invierte, libre no), modos
      estacionarios con sus nodos y antinodos, resonancias de un tubo con
      pistón y respuesta armónica estacionaria de un medio uniforme.
   3. Doppler cinemático en 2D: fuentes y observadores en línea recta a
      velocidad constante, viento uniforme; cada frente nace en la posición
      de la fuente y viaja con el aire. El tiempo de emisión se resuelve
      (Brent) y la frecuencia recibida es f/(dt_r/dt_e); la reflexión en una
      pared que se mueve a lo largo de su normal usa la fuente imagen exacta
      (foco de la hipérbola de los puntos de choque). Una fuente también
      puede ir de vaivén sobre un arco (la rejilla de un ventilador que
      oscila): el mismo planteamiento con la posición y la velocidad de la
      fuente en el instante de emisión.
   Lo usan la pantalla de Ondas y las pruebas.
   ========================================================================== */
import { brent } from '../nucleo/integradores.js';

const DOS_PI = 2 * Math.PI;

/** Constante de los gases (CODATA 2018), J/(mol·K). */
export const R_GASES = 8.314462618;
/** Masa molar del aire seco, kg/mol. */
export const M_AIRE = 0.0289647;
/** Densidad del aire a 20 °C y 1 atm, kg/m³. */
export const RHO_AIRE = 1.204;

// ---------------------------------------------------------------------------
// Fórmulas cerradas
// ---------------------------------------------------------------------------

/** Rapidez de las ondas en una cuerda: v = √(T/μ). @param {number} T tensión (N) @param {number} mu densidad lineal (kg/m) */
export const velocidadCuerda = (T, mu) => Math.sqrt(T / mu);

/** Impedancia de una cuerda: Z = √(T·μ) = μ·v (kg/s). @param {number} T @param {number} mu */
export const impedancia = (T, mu) => Math.sqrt(T * mu);

/** Rapidez de las ondas en aguas someras: v = √(g·h). @param {number} h profundidad (m) @param {number} [g=9.80665] */
export const velocidadAguasSomeras = (h, g = 9.80665) => Math.sqrt(g * h);

/**
 * Rapidez del sonido en un gas ideal: v = √(γRT/M).
 * @param {number} T temperatura (K) @param {{gamma?: number, M?: number}} [o]
 */
export function velocidadSonido(T, o = {}) {
  return Math.sqrt((o.gamma ?? 1.4) * R_GASES * T / (o.M ?? M_AIRE));
}

/**
 * Coeficientes de amplitud en la unión de dos medios (onda que llega desde
 * el medio 1): r = (Z₁ − Z₂)/(Z₁ + Z₂), t = 2Z₁/(Z₁ + Z₂). Fracciones de
 * potencia R = r² y T = (Z₂/Z₁)·t², con R + T = 1.
 * @param {number} Z1 @param {number} Z2
 */
export function coeficientesUnion(Z1, Z2) {
  const r = (Z1 - Z2) / (Z1 + Z2), t = 2 * Z1 / (Z1 + Z2);
  return { r, t, R: r * r, T: Z2 / Z1 * t * t };
}

// ---------------------------------------------------------------------------
// Tramos del medio
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} TramoEntrada
 * @property {number} longitud  m
 * @property {number} [tension]   K: tensión de la cuerda (N) o rigidez ρv²S del tubo
 * @property {number} [densidad]  m: densidad lineal (kg/m)
 * @property {number} [velocidad] m/s (basta con dos de las tres magnitudes)
 */

/**
 * @typedef {Object} Tramo
 * @property {number} x0 @property {number} x1  extremos (m, coordenadas del medio)
 * @property {number} K  rigidez (N) @property {number} m densidad lineal (kg/m)
 * @property {number} v  rapidez (m/s) @property {number} Z impedancia (kg/s)
 */

/**
 * Columna de aire como tramo: K = ρv²S y m = ρS, de modo que el
 * desplazamiento y es el de las partículas del aire, K·∂y/∂x/S es la
 * presión cambiada de signo y las energías salen en J.
 * @param {{longitud: number, velocidad: number, densidad?: number, seccion?: number}} p
 * @returns {TramoEntrada}
 */
export function tramoTubo({ longitud, velocidad, densidad = RHO_AIRE, seccion = 1e-3 }) {
  return { longitud, tension: densidad * velocidad * velocidad * seccion, densidad: densidad * seccion };
}

/**
 * Normaliza los tramos: rigidez, densidad, rapidez e impedancia de cada uno.
 * @param {TramoEntrada[]} tramos @param {number} [origen=0] coordenada del extremo izquierdo
 * @returns {Tramo[]}
 */
export function normalizarTramos(tramos, origen = 0) {
  if (!Array.isArray(tramos) || !tramos.length) throw new Error('El medio necesita al menos un tramo.');
  let x = origen;
  return tramos.map((t, i) => {
    if (!(t.longitud > 0)) throw new RangeError(`Tramo ${i + 1}: la longitud debe ser positiva.`);
    let K = t.tension, m = t.densidad;
    const v = t.velocidad;
    if (K == null && m != null && v != null) K = m * v * v;
    else if (m == null && K != null && v != null) m = K / (v * v);
    if (!(K > 0 && m > 0)) throw new RangeError(`Tramo ${i + 1}: hacen falta dos de tensión, densidad y velocidad, positivas.`);
    const x0 = x; x += t.longitud;
    return { x0, x1: x, K, m, v: Math.sqrt(K / m), Z: Math.sqrt(K * m) };
  });
}

/** Tramo que contiene la coordenada x (el último si x está en el extremo derecho). @param {Tramo[]} tr @param {number} x */
export function tramoEn(tr, x) {
  for (const t of tr) if (x < t.x1) return t;
  return tr[tr.length - 1];
}

/** Tiempo de vuelo entre dos puntos del medio: ∫ dx/v. @param {Tramo[]} tr @param {number} a @param {number} b */
export function tiempoVuelo(tr, a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  let s = 0;
  for (const t of tr) {
    const x0 = Math.max(lo, t.x0), x1 = Math.min(hi, t.x1);
    if (x1 > x0) s += (x1 - x0) / t.v;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Señales en el tiempo (fuentes) y formas iniciales
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Senal
 * @property {'senoidal'|'pulso'|'medioSeno'} forma
 * @property {number} amplitud  m (desplazamiento), N (fuerza) o, en la pantalla, Pa
 * @property {number} [frecuencia] Hz (senoidal)
 * @property {number} [fase=0]   rad: s(t) = A·sen(2πft + φ) con t absoluto
 * @property {number} [inicio=0] s (−∞: activa desde siempre)
 * @property {number} [duracion] s (senoidal; ∞ por defecto)
 * @property {number} [ancho]    s: σ del pulso gaussiano o duración del medio seno
 * @property {number} [rampa=0]  s: arranque suave (sen²) de la senoidal
 */

const E8 = Math.exp(-8);

/**
 * Valor y derivada de una señal en t.
 * @param {Senal} s @param {number} t @returns {[number, number]}
 */
export function senal(s, t) {
  const A = s.amplitud, t0 = s.inicio ?? 0;
  if (t < t0) return [0, 0];
  if (s.forma === 'senoidal') {
    if (s.duracion != null && t > t0 + s.duracion) return [0, 0];
    const w = DOS_PI * (s.frecuencia ?? 1), arg = w * t + (s.fase ?? 0);
    let y = A * Math.sin(arg), d = A * w * Math.cos(arg);
    const r = s.rampa ?? 0;
    if (r > 0 && Number.isFinite(t0) && t - t0 < r) {
      const u = Math.PI / 2 * (t - t0) / r, e = Math.sin(u) ** 2, de = Math.PI / r * Math.sin(u) * Math.cos(u);
      d = d * e + y * de; y *= e;
    }
    return [y, d];
  }
  const tau = s.ancho ?? 0.1;
  if (s.forma === 'pulso') {
    // Gaussiana de soporte compacto [t₀, t₀ + 8σ]: se le resta su valor en
    // los bordes para que empiece y termine exactamente en cero
    const tc = (Number.isFinite(t0) ? t0 : 0) + 4 * tau, u = (t - tc) / tau;
    if (Math.abs(u) >= 4) return [0, 0];
    const g = Math.exp(-0.5 * u * u), k = A / (1 - E8);
    return [k * (g - E8), -k * g * u / tau];
  }
  if (s.forma === 'medioSeno') {
    if (t > t0 + tau) return [0, 0];
    const u = Math.PI * (t - t0) / tau;
    return [A * Math.sin(u), A * Math.PI / tau * Math.cos(u)];
  }
  throw new Error(`Forma de señal desconocida: ${s.forma}`);
}

/**
 * @typedef {Object} Inicial
 * @property {'gauss'|'tren'|'senoidal'|'modo'|'triangulo'} forma
 * @property {number} amplitud  m
 * @property {number} [centro]   m: centro del pulso o punto donde se pulsa la cuerda
 * @property {number} [ancho]    m: σ del pulso gaussiano
 * @property {number} [desde]    m: comienzo del tren
 * @property {number} [longitudOnda] m (tren y senoidal)
 * @property {number} [ciclos=1] longitudes de onda del tren
 * @property {number} [fase=0]  rad: y = A·sen(2π(x − desde)/λ + φ)
 * @property {number} [n=1]     número del modo
 * @property {number} [sentido=0] +1 viaja a la derecha, −1 a la izquierda, 0 parte del reposo
 */

/**
 * Forma inicial y(x) y su derivada espacial.
 * @param {Inicial} p @param {{x0:number, x1:number, izq:string, der:string, v:number}} medio
 * @returns {(x: number) => [number, number]}
 */
export function formaInicial(p, medio) {
  const A = p.amplitud;
  switch (p.forma) {
    case 'gauss': {
      const c = p.centro ?? (medio.x0 + medio.x1) / 2, s = p.ancho ?? (medio.x1 - medio.x0) / 20;
      return x => { const u = (x - c) / s, g = A * Math.exp(-0.5 * u * u); return [g, -g * u / s]; };
    }
    case 'tren': {
      const a = p.desde ?? medio.x0, l = p.longitudOnda ?? 1, b = a + l * (p.ciclos ?? 1), k = DOS_PI / l, f = p.fase ?? 0;
      return x => (x < a || x > b ? [0, 0] : [A * Math.sin(k * (x - a) + f), A * k * Math.cos(k * (x - a) + f)]);
    }
    case 'senoidal': {
      const k = DOS_PI / (p.longitudOnda ?? 1), f = p.fase ?? 0, a = p.desde ?? 0;
      return x => [A * Math.sin(k * (x - a) + f), A * k * Math.cos(k * (x - a) + f)];
    }
    case 'modo': {
      const L = medio.x1 - medio.x0, md = modoEstacionario({ longitud: L, velocidad: medio.v, izq: medio.izq, der: medio.der }, p.n ?? 1);
      if (!md) return () => [0, 0];
      return x => [A * md.forma(x - medio.x0), A * md.pendiente(x - medio.x0)];
    }
    case 'triangulo': {
      const a = medio.x0, b = medio.x1, c = Math.min(b - 1e-12, Math.max(a + 1e-12, p.centro ?? (a + b) / 2));
      return x => (x <= c ? [A * (x - a) / (c - a), A / (c - a)] : [A * (b - x) / (b - c), -A / (b - c)]);
    }
    default: throw new Error(`Forma inicial desconocida: ${p.forma}`);
  }
}

// ---------------------------------------------------------------------------
// Medio 1D: diferencias finitas
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Borde
 * @property {'fijo'|'libre'|'absorbente'|'abierto'|'cerrado'} tipo
 * @property {Senal} [fuente]  fijo: desplazamiento impuesto (oscilador); libre: fuerza (N) sobre el extremo;
 *   absorbente: onda entrante (desplazamiento) que se inyecta sin reflejar la que vuelve
 */

/**
 * @typedef {Object} EscenaMedio
 * @property {TramoEntrada[]} tramos
 * @property {Borde} izq @property {Borde} der
 * @property {number} duracion  s
 * @property {number} [origen=0] coordenada del extremo izquierdo (m)
 * @property {number} [amortiguamiento=0] β (1/s): cada modo decae como e^(−βt)
 * @property {Inicial[]} [iniciales]
 * @property {Array<{x: number, senal: Senal}>} [fuerzas] fuerzas puntuales (N)
 * @property {number[]} [sondas] posiciones (m) registradas en cada paso
 * @property {number} [celdas]  número de celdas de la malla
 * @property {number} [courant=0.9] fracción del paso máximo estable
 * @property {number} [dt]      paso explícito (se comprueba la condición CFL)
 * @property {number} [cuadros=1200] cuadros guardados como máximo (aprox.)
 * @property {number} [periodoMinimo] s: el cuadro más largo es periodoMinimo/24
 * @property {number} [eventosMax=40]
 */

/** @param {string} t */
const tipoBorde = t => (t === 'abierto' ? 'libre' : t === 'cerrado' ? 'fijo' : t);

/**
 * Malla del medio: posiciones, masas de los nodos y rigideces de los
 * enlaces (resortes en serie), integradas exactamente sobre los tramos.
 * @param {Tramo[]} tr @param {number} N celdas
 */
export function mallaMedio(tr, N) {
  const x0 = tr[0].x0, L = tr[tr.length - 1].x1 - x0, h = L / N;
  const x = new Float64Array(N + 1), M = new Float64Array(N + 1), k = new Float64Array(N);
  for (let i = 0; i <= N; i++) x[i] = x0 + i * h;
  // ∫ m dx sobre [a, b] y ∫ dx/K sobre [a, b]
  const integral = (a, b, f) => { let s = 0; for (const t of tr) { const lo = Math.max(a, t.x0), hi = Math.min(b, t.x1); if (hi > lo) s += (hi - lo) * f(t); } return s; };
  for (let i = 0; i <= N; i++) M[i] = integral(Math.max(x0, x[i] - h / 2), Math.min(x0 + L, x[i] + h / 2), t => t.m);
  for (let i = 0; i < N; i++) k[i] = 1 / integral(x[i], x[i + 1], t => 1 / t.K);
  return { x, h, M, k, L, x0 };
}

/**
 * Paso máximo estable del salto de rana (cota de Gershgorin del problema
 * K·y = λ·M·y): Δt ≤ 2/√λ_max. En un medio uniforme es h/v (CFL = 1).
 * @param {{M: Float64Array, k: Float64Array}} malla
 */
export function pasoEstable(malla) {
  const { M, k } = malla, N = k.length;
  let lmax = 0;
  for (let i = 0; i <= N; i++) {
    const s = (i > 0 ? k[i - 1] : 0) + (i < N ? k[i] : 0);
    lmax = Math.max(lmax, 2 * s / M[i]);
  }
  return 2 / Math.sqrt(lmax);
}

/** Celdas por defecto: resolución de la onda más corta y del pulso más estrecho. @param {EscenaMedio} e @param {Tramo[]} tr */
function celdasPorDefecto(e, tr) {
  const L = tr[tr.length - 1].x1 - tr[0].x0, vmin = Math.min(...tr.map(t => t.v));
  let n = 300;
  const fuentes = [e.izq.fuente, e.der.fuente, ...(e.fuerzas || []).map(f => f.senal)].filter(Boolean);
  for (const s of fuentes) {
    if (s.forma === 'senoidal' && s.frecuencia > 0) n = Math.max(n, 32 * L * s.frecuencia / vmin);
    else if (s.ancho > 0) n = Math.max(n, 10 * L / (vmin * s.ancho));
  }
  for (const p of e.iniciales || []) {
    if (p.forma === 'gauss' && p.ancho > 0) n = Math.max(n, 10 * L / p.ancho);
    if ((p.forma === 'tren' || p.forma === 'senoidal') && p.longitudOnda > 0) n = Math.max(n, 40 * L / p.longitudOnda);
    if (p.forma === 'modo') n = Math.max(n, 40 * (p.n ?? 1));
  }
  return Math.min(4000, Math.ceil(n));
}

/**
 * Trazado de frentes para la línea de tiempo: cada pulso o frente viaja con
 * la rapidez de su tramo; en una unión se parte en reflejado (r) y
 * transmitido (t); en un extremo fijo se refleja invertido, en uno libre
 * igual y en uno absorbente sale. Tiempos exactos del medio continuo.
 * @param {Tramo[]} tr @param {{izq: string, der: string}} bordes
 * @param {Array<{x: number, t: number, sentido: number, amplitud: number, que: string, rebotes?: number}>} salidas  rebotes: reflexiones en los extremos que se siguen (sin límite si falta)
 * @param {number} duracion @param {number} [max=40]
 */
export function trazarFrentes(tr, bordes, salidas, duracion, max = 40) {
  return propagarFrentes(tr, bordes, salidas, duracion, max).eventos;
}

/**
 * Frentes presentes en el instante t: posición, sentido y amplitud relativa
 * de cada pulso o frente (mismo trazado que los eventos).
 * @param {{tramos: Tramo[], izq: string, der: string, salidas: any[]}} sim @param {number} t
 * @returns {Array<{x: number, sentido: number, amplitud: number, que: string}>}
 */
export function frentesEn(sim, t) {
  return propagarFrentes(sim.tramos, { izq: sim.izq, der: sim.der }, sim.salidas.filter(s => s.t <= t), t, 400).vivos;
}

function propagarFrentes(tr, bordes, salidas, duracion, max) {
  const xa = tr[0].x0, xb = tr[tr.length - 1].x1, eventos = [], vivos = [];
  const cola = salidas.map(s => ({ ...s }));
  const nombreBorde = lado => (lado === 'izq' ? 'izquierdo' : 'derecho');
  let guardia = 0;
  while (cola.length && eventos.length < max && guardia++ < 2000) {
    cola.sort((a, b) => a.t - b.t);
    const r = /** @type {any} */ (cola.shift());
    if (Math.abs(r.amplitud) < 0.03) continue;
    // Siguiente frontera en el sentido de avance
    const tramo = r.sentido > 0 ? tramoEn(tr, r.x + 1e-12) : tr.find(t => r.x > t.x0 + 1e-12 && r.x <= t.x1 + 1e-12) || tr[0];
    const destino = r.sentido > 0 ? tramo.x1 : tramo.x0;
    const t = r.t + Math.abs(destino - r.x) / tramo.v;
    if (t > duracion + 1e-12) { vivos.push({ x: r.x + r.sentido * tramo.v * (duracion - r.t), sentido: r.sentido, amplitud: r.amplitud, que: r.que, v: tramo.v }); continue; }
    const enBorde = destino <= xa + 1e-12 ? 'izq' : destino >= xb - 1e-12 ? 'der' : null;
    if (enBorde) {
      const tipo = tipoBorde(bordes[enBorde]);
      const accion = tipo === 'fijo' ? 'se refleja invertido' : tipo === 'libre' ? 'se refleja sin invertirse' : 'sale del medio';
      eventos.push({ t, tipo: 'borde', lado: enBorde, x: destino, amplitud: r.amplitud, nombre: `${r.que} llega al extremo ${nombreBorde(enBorde)}: ${accion}` });
      // Un frente con rebotes contados (el de una fuente continua) se sigue hasta que vuelve
      const quedan = r.rebotes == null ? Infinity : r.rebotes - 1;
      if ((tipo === 'fijo' || tipo === 'libre') && quedan >= 0) cola.push({ ...r, x: destino, t, sentido: -r.sentido, amplitud: r.amplitud * (tipo === 'fijo' ? -1 : 1), que: r.que.startsWith('El reflejado') ? r.que : 'El reflejado', rebotes: quedan });
    } else {
      const otro = r.sentido > 0 ? tramoEn(tr, destino + 1e-12) : tr.find(q => Math.abs(q.x1 - destino) < 1e-12) || tramo;
      const { r: rr, t: tt } = coeficientesUnion(tramo.Z, otro.Z);
      eventos.push({ t, tipo: 'union', x: destino, amplitud: r.amplitud, r: rr, tr: tt, nombre: `${r.que} llega a la unión: r = ${rr.toFixed(2).replace('-', '−')}, t = ${tt.toFixed(2)}` });
      cola.push({ ...r, x: destino, t, sentido: -r.sentido, amplitud: r.amplitud * rr, que: 'El reflejado' });
      cola.push({ ...r, x: destino, t, amplitud: r.amplitud * tt, que: 'El transmitido' });
    }
  }
  return { eventos: eventos.sort((a, b) => a.t - b.t), vivos };
}

/**
 * Simula el medio 1D por diferencias finitas. Guarda cuadros del campo y(x)
 * (Float64), el registro de energía de cada cuadro, las sondas en cada paso
 * y los eventos de llegada de los frentes.
 * @param {EscenaMedio} escena
 */
export function simularMedio(escena) {
  const origen = escena.origen ?? 0;
  const tr = normalizarTramos(escena.tramos, origen);
  const izq = { ...escena.izq, tipo: tipoBorde(escena.izq.tipo) }, der = { ...escena.der, tipo: tipoBorde(escena.der.tipo) };
  for (const b of [izq, der]) if (!['fijo', 'libre', 'absorbente'].includes(b.tipo)) throw new Error(`Tipo de extremo desconocido: ${b.tipo}`);
  const N = Math.max(4, Math.round(escena.celdas ?? celdasPorDefecto(escena, tr)));
  const malla = mallaMedio(tr, N), { x, h, M, k } = malla;
  const dtMax = pasoEstable(malla);
  const dur = escena.duracion;
  if (!(dur > 0)) throw new RangeError('La duración debe ser positiva.');
  let dt;
  if (escena.dt != null) {
    if (!(escena.dt > 0)) throw new RangeError('El paso debe ser positivo.');
    if (escena.dt > dtMax * (1 + 1e-12)) throw new RangeError(`El paso Δt = ${escena.dt.toPrecision(4)} s no cumple la condición CFL: con esta malla el máximo estable es ${dtMax.toPrecision(4)} s.`);
    dt = escena.dt;
  } else dt = (escena.courant ?? 0.9) * dtMax;
  const pasos = Math.max(1, Math.ceil(dur / dt - 1e-9));
  dt = dur / pasos;

  // Amortiguadores: β proporcional a la masa (b = 2βM) y, en los extremos
  // absorbentes, la impedancia del tramo (amortiguador adaptado)
  const beta = escena.amortiguamiento ?? 0;
  const b = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) b[i] = 2 * beta * M[i];
  const Zi = tr[0].Z, Zd = tr[tr.length - 1].Z;
  if (izq.tipo === 'absorbente') b[0] += Zi;
  if (der.tipo === 'absorbente') b[N] += Zd;
  // y⁺ = c1·y + c2·y⁻ + c3·f
  const c1 = new Float64Array(N + 1), c2 = new Float64Array(N + 1), c3 = new Float64Array(N + 1);
  const dt2 = dt * dt;
  for (let i = 0; i <= N; i++) {
    const A = 1 / (M[i] / dt2 + b[i] / (2 * dt));
    c1[i] = 2 * A * M[i] / dt2; c2[i] = A * (b[i] / (2 * dt) - M[i] / dt2); c3[i] = A;
  }
  const dirI = izq.tipo === 'fijo', dirD = der.tipo === 'fijo';

  // Condición inicial: y⁰ y y⁻¹ (traslación exacta del perfil que viaja)
  const vNodo = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) vNodo[i] = tramoEn(tr, x[i]).v;
  let y = new Float64Array(N + 1), yAnt = new Float64Array(N + 1), ySig = new Float64Array(N + 1);
  const ctx = { x0: origen, x1: origen + malla.L, izq: izq.tipo, der: der.tipo, v: tr[0].v };
  const reposo = [];
  for (const p of escena.iniciales || []) {
    const f = formaInicial(p, ctx), s = p.sentido ?? 0;
    for (let i = 0; i <= N; i++) {
      y[i] += f(x[i])[0];
      if (s) yAnt[i] += f(x[i] + s * vNodo[i] * dt)[0];
    }
    if (!s) reposo.push(f);
  }
  if (reposo.length) {
    // Sin velocidad inicial: y⁻¹ = y⁰ + Δt²/2·a(y⁰)
    const y0 = new Float64Array(N + 1);
    for (const f of reposo) for (let i = 0; i <= N; i++) y0[i] += f(x[i])[0];
    for (let i = 0; i <= N; i++) {
      const fi = (i < N ? k[i] * (y0[i + 1] - y0[i]) : 0) - (i > 0 ? k[i - 1] * (y0[i] - y0[i - 1]) : 0);
      yAnt[i] += y0[i] + dt2 / 2 * fi / M[i];
    }
  }
  const sI = izq.fuente, sD = der.fuente;
  if (dirI) { y[0] = sI ? senal(sI, 0)[0] : 0; yAnt[0] = sI ? senal(sI, -dt)[0] : 0; }
  if (dirD) { y[N] = sD ? senal(sD, 0)[0] : 0; yAnt[N] = sD ? senal(sD, -dt)[0] : 0; }

  // Fuerzas puntuales repartidas entre los dos nodos vecinos
  const fuerzas = (escena.fuerzas || []).map(fz => {
    const u = Math.min(N - 1e-9, Math.max(0, (fz.x - origen) / h)), i = Math.floor(u);
    return { i, a: u - i, senal: fz.senal };
  });
  const F = new Float64Array(N + 1);

  // Cuadros
  const cuadrosMax = escena.cuadros ?? 1200;
  let cada = Math.max(1, Math.round(pasos / cuadrosMax));
  const periodos = [sI, sD, ...fuerzas.map(f => f.senal)].filter(s => s && s.forma === 'senoidal' && s.frecuencia > 0).map(s => 1 / s.frecuencia);
  if (escena.periodoMinimo) periodos.push(escena.periodoMinimo);
  if (periodos.length) cada = Math.max(1, Math.min(cada, Math.floor(Math.min(...periodos) / 24 / dt)));
  const nCuadros = Math.floor(pasos / cada) + 1 + (pasos % cada ? 1 : 0);
  const T = new Float64Array(nCuadros), Y = new Float64Array(nCuadros * (N + 1));
  const Ek = new Float64Array(nCuadros), Ep = new Float64Array(nCuadros), W = new Float64Array(nCuadros), Qb = new Float64Array(nCuadros), Qd = new Float64Array(nCuadros);

  // Energía discreta a medio paso: cinética con (y⁺ − y)/Δt y potencial cruzada
  const energia = (yn, yp) => {
    let K = 0, U = 0;
    for (let i = 0; i <= N; i++) {
      if ((i === 0 && dirI) || (i === N && dirD)) continue;
      const v = (yp[i] - yn[i]) / dt; K += 0.5 * M[i] * v * v;
    }
    for (let i = 0; i < N; i++) U += 0.5 * k[i] * (yp[i + 1] - yp[i]) * (yn[i + 1] - yn[i]);
    return [K, U];
  };

  // Sondas: interpolación lineal entre nodos, en cada paso (o cada pocos)
  const cadaSonda = Math.max(1, Math.ceil(pasos / 60000));
  const nS = Math.floor(pasos / cadaSonda) + 1;
  const sondas = (escena.sondas || []).map(xs => {
    let u = Math.min(N, Math.max(0, (xs - origen) / h));
    if (Math.abs(u - Math.round(u)) < 1e-9) u = Math.round(u);          // sobre un nodo, exactamente
    const i = Math.min(N - 1, Math.floor(u));
    return { x: xs, i, a: u - i, t: new Float64Array(nS), y: new Float64Array(nS) };
  });
  const registrarSondas = (q, tt, yy) => { for (const s of sondas) { s.t[q] = tt; s.y[q] = (1 - s.a) * yy[s.i] + s.a * yy[s.i + 1]; } };

  // Cuadro n: el campo yⁿ y la energía E^(n−½) (de yⁿ⁻¹ e yⁿ), con el trabajo y
  // las pérdidas de los pasos anteriores: el balance cierra en cada cuadro y el
  // primero es exactamente el estado inicial
  let cuadro = 0, w = 0, qb = 0, qd = 0;
  const guardar = (n, yAnterior, yActual) => {
    T[cuadro] = n * dt; Y.set(yActual, cuadro * (N + 1));
    const [K, U] = energia(yAnterior, yActual);
    Ek[cuadro] = K; Ep[cuadro] = U; W[cuadro] = w; Qb[cuadro] = qb; Qd[cuadro] = qd;
    cuadro++;
  };
  // Energía inicial E^(−½) a partir de y⁰ e y⁻¹
  const [K0, U0] = energia(yAnt, y);
  const E0 = K0 + U0;
  registrarSondas(0, 0, y);

  for (let n = 0; n < pasos; n++) {
    const tn = n * dt;
    if (n % cada === 0) guardar(n, yAnt, y);
    // Fuerzas en los nodos
    F.fill(0);
    for (const fz of fuerzas) { const v = senal(fz.senal, tn)[0]; F[fz.i] += (1 - fz.a) * v; F[fz.i + 1] += fz.a * v; }
    if (izq.tipo === 'libre' && sI) F[0] += senal(sI, tn)[0];
    if (der.tipo === 'libre' && sD) F[N] += senal(sD, tn)[0];
    // Onda inyectada por un extremo absorbente: 2Z·ġ con ġ en diferencia
    // centrada, coherente con el amortiguador (la suma telescópica da el
    // impulso exacto y no deja desplazamiento residual)
    if (izq.tipo === 'absorbente' && sI) F[0] += Zi * (senal(sI, tn + dt)[0] - senal(sI, tn - dt)[0]) / dt;
    if (der.tipo === 'absorbente' && sD) F[N] += Zd * (senal(sD, tn + dt)[0] - senal(sD, tn - dt)[0]) / dt;
    // Salto de rana
    for (let i = 1; i < N; i++) {
      const f = k[i] * (y[i + 1] - y[i]) - k[i - 1] * (y[i] - y[i - 1]) + F[i];
      ySig[i] = c1[i] * y[i] + c2[i] * yAnt[i] + c3[i] * f;
    }
    if (dirI) ySig[0] = sI ? senal(sI, tn + dt)[0] : 0;
    else ySig[0] = c1[0] * y[0] + c2[0] * yAnt[0] + c3[0] * (k[0] * (y[1] - y[0]) + F[0]);
    if (dirD) ySig[N] = sD ? senal(sD, tn + dt)[0] : 0;
    else ySig[N] = c1[N] * y[N] + c2[N] * yAnt[N] + c3[N] * (-k[N - 1] * (y[N] - y[N - 1]) + F[N]);

    // Registro de energía del paso (identidades exactas del esquema)
    for (let i = 0; i <= N; i++) {
      if (F[i] === 0 || (i === 0 && dirI) || (i === N && dirD)) continue;
      w += 0.5 * F[i] * (ySig[i] - yAnt[i]);
    }
    if (dirI && sI) w -= 0.5 * k[0] * (y[1] - y[0]) * (ySig[0] - yAnt[0]);
    if (dirD && sD) w += 0.5 * k[N - 1] * (y[N] - y[N - 1]) * (ySig[N] - yAnt[N]);
    if (izq.tipo === 'absorbente') { const d = ySig[0] - yAnt[0]; qb += Zi * d * d / (4 * dt); }
    if (der.tipo === 'absorbente') { const d = ySig[N] - yAnt[N]; qb += Zd * d * d / (4 * dt); }
    if (beta > 0) {
      for (let i = 0; i <= N; i++) {
        if ((i === 0 && dirI) || (i === N && dirD)) continue;
        const d = ySig[i] - yAnt[i]; qd += 2 * beta * M[i] * d * d / (4 * dt);
      }
    }
    // Rotación de niveles
    const tmp = yAnt; yAnt = y; y = ySig; ySig = tmp;
    if ((n + 1) % cadaSonda === 0) registrarSondas((n + 1) / cadaSonda, (n + 1) * dt, y);
  }
  // Último cuadro: t = duración
  if (cuadro < nCuadros) guardar(pasos, yAnt, y);

  // Eventos: frentes que salen de los pulsos iniciales y de las fuentes
  const salidas = [];
  for (const p of escena.iniciales || []) {
    if (p.forma === 'senoidal' || p.forma === 'modo' || p.forma === 'triangulo') continue;
    const c = p.forma === 'gauss' ? (p.centro ?? (origen + malla.L / 2)) : (p.desde ?? origen) + (p.longitudOnda ?? 1) * (p.ciclos ?? 1) / 2;
    const s = p.sentido ?? 0, que = p.forma === 'tren' ? 'El tren de ondas' : 'El pulso';
    if (s) salidas.push({ x: c, t: 0, sentido: s, amplitud: 1, que });
    else salidas.push({ x: c, t: 0, sentido: 1, amplitud: 0.5, que }, { x: c, t: 0, sentido: -1, amplitud: 0.5, que });
  }
  for (const [lado, bd] of /** @type {Array<[string, any]>} */ ([['izq', izq], ['der', der]])) {
    const s = bd.fuente; if (!s) continue;
    const t0 = Number.isFinite(s.inicio ?? 0) ? (s.inicio ?? 0) : null;
    if (t0 == null) continue;
    const pico = s.forma === 'pulso' ? t0 + 4 * (s.ancho ?? 0.1) : s.forma === 'medioSeno' ? t0 + (s.ancho ?? 0.1) / 2 : t0;
    salidas.push({ x: lado === 'izq' ? origen : origen + malla.L, t: pico, sentido: lado === 'izq' ? 1 : -1, amplitud: 1, que: s.forma === 'senoidal' ? 'El frente de onda' : 'El pulso', rebotes: s.forma === 'senoidal' ? 1 : undefined });
  }
  const eventos = trazarFrentes(tr, { izq: izq.tipo, der: der.tipo }, salidas, dur, escena.eventosMax ?? 40);

  return {
    x, h, dt, dtMax, courant: dt / dtMax, pasos, duracion: dur, N, origen, L: malla.L,
    tramos: tr, izq: izq.tipo, der: der.tipo, amortiguamiento: beta,
    masa: M, rigidez: k, salidas,
    t: T.subarray(0, cuadro), Y: Y.subarray(0, cuadro * (N + 1)), cuadros: cuadro, cada,
    energia: {
      E0, K: Ek.subarray(0, cuadro), U: Ep.subarray(0, cuadro), W: W.subarray(0, cuadro),
      absorbida: Qb.subarray(0, cuadro), disipada: Qd.subarray(0, cuadro),
    },
    sondas, eventos,
  };
}

/** @typedef {ReturnType<typeof simularMedio>} SimMedio */

/**
 * Cuadro k del campo (vista, sin copiar).
 * @param {SimMedio} sim @param {number} q
 */
export const cuadroMedio = (sim, q) => sim.Y.subarray(q * (sim.N + 1), (q + 1) * (sim.N + 1));

/** Índice del último cuadro con t_k ≤ t. @param {SimMedio} sim @param {number} t */
export function indiceCuadro(sim, t) {
  const T = sim.t;
  let lo = 0, hi = T.length - 1;
  if (t >= T[hi]) return hi;
  if (t <= T[0]) return 0;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
  return lo;
}

/**
 * Campo y(x) en el instante t: interpolación lineal entre los dos cuadros
 * guardados que lo rodean (exacto en los instantes de los cuadros).
 * @param {SimMedio} sim @param {number} t @param {Float64Array} [destino]
 */
export function estadoMedio(sim, t, destino) {
  const n = sim.N + 1, out = destino ?? new Float64Array(n), q = indiceCuadro(sim, t);
  const a = cuadroMedio(sim, q);
  if (q >= sim.cuadros - 1 || t <= sim.t[q]) { out.set(a); return out; }
  const b = cuadroMedio(sim, q + 1), u = (t - sim.t[q]) / (sim.t[q + 1] - sim.t[q]);
  for (let i = 0; i < n; i++) out[i] = a[i] + u * (b[i] - a[i]);
  return out;
}

/**
 * Registro de energía en el instante t (interpolado entre cuadros): cinética,
 * potencial, total, trabajo de las fuentes, energía que sale por los
 * extremos absorbentes, disipada por el amortiguamiento y residuo del
 * balance E − E₀ − W + Q (cero salvo redondeo).
 * @param {SimMedio} sim @param {number} t
 */
export function energiaMedio(sim, t) {
  const q = indiceCuadro(sim, t), e = sim.energia;
  const u = q < sim.cuadros - 1 && t > sim.t[q] ? (t - sim.t[q]) / (sim.t[q + 1] - sim.t[q]) : 0;
  const I = arr => arr[q] + (u ? u * (arr[q + 1] - arr[q]) : 0);
  const K = I(e.K), U = I(e.U), W = I(e.W), Qb = I(e.absorbida), Qd = I(e.disipada);
  return { K, U, E: K + U, W, absorbida: Qb, disipada: Qd, E0: e.E0, residuo: K + U - e.E0 - W + Qb + Qd };
}

/**
 * Serie temporal y(t) en la posición x a partir de los cuadros guardados.
 * @param {SimMedio} sim @param {number} xp
 * @returns {{t: Float64Array, y: Float64Array}}
 */
export function serieEn(sim, xp) {
  let u = Math.min(sim.N, Math.max(0, (xp - sim.origen) / sim.h));
  if (Math.abs(u - Math.round(u)) < 1e-9) u = Math.round(u);
  const i = Math.min(sim.N - 1, Math.floor(u)), a = u - i;
  const y = new Float64Array(sim.cuadros);
  for (let q = 0; q < sim.cuadros; q++) { const o = q * (sim.N + 1); y[q] = (1 - a) * sim.Y[o + i] + a * sim.Y[o + i + 1]; }
  return { t: sim.t, y };
}

/**
 * −K·∂y/∂x en cada nodo (N): en una cuerda, la fuerza transversal que la
 * parte izquierda ejerce sobre la derecha; en un tubo, presión × sección.
 * @param {SimMedio} sim @param {Float64Array} y
 */
export function esfuerzoMedio(sim, y) {
  const { N, rigidez: k } = sim, out = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const izq = i > 0 ? k[i - 1] * (y[i] - y[i - 1]) : null, der = i < N ? k[i] * (y[i + 1] - y[i]) : null;
    out[i] = -(izq == null ? /** @type {number} */ (der) : der == null ? izq : (izq + der) / 2);
  }
  return out;
}

/**
 * Aceleración del medio en cada nodo, a = (fuerza neta de los resortes)/masa
 * (sin fuentes ni amortiguamiento). En los extremos fijos es 0.
 * @param {SimMedio} sim @param {Float64Array} y
 */
export function aceleracionMedio(sim, y) {
  const { N, rigidez: k, masa: M } = sim, out = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) {
    if ((i === 0 && sim.izq === 'fijo') || (i === N && sim.der === 'fijo')) continue;
    out[i] = ((i < N ? k[i] * (y[i + 1] - y[i]) : 0) - (i > 0 ? k[i - 1] * (y[i] - y[i - 1]) : 0)) / M[i];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Superposición analítica
// ---------------------------------------------------------------------------

/**
 * Onda senoidal exacta y(x, t) = A·sen(k(x − s·v·t) + φ), con k = 2π/λ,
 * v = λf y s = +1 (hacia +x) o −1.
 * @param {{amplitud: number, longitudOnda: number, frecuencia: number, fase?: number, sentido?: number}} p
 * @returns {(x: number, t: number) => number}
 */
export function ondaSenoidal({ amplitud, longitudOnda, frecuencia, fase = 0, sentido = 1 }) {
  const k = DOS_PI / longitudOnda, v = longitudOnda * frecuencia;
  return (x, t) => amplitud * Math.sin(k * (x - sentido * v * t) + fase);
}

/**
 * Perfil que viaja sin deformarse: y(x, t) = f(x − s·v·t).
 * @param {(x: number) => number} f @param {number} v @param {number} [sentido=1]
 * @returns {(x: number, t: number) => number}
 */
export const viajera = (f, v, sentido = 1) => (x, t) => f(x - sentido * v * t);

/** Pulso gaussiano que viaja: A·exp(−(x − x₀ − s·v·t)²/2σ²). @param {{amplitud:number, centro:number, ancho:number, velocidad:number, sentido?:number}} p */
export function pulsoGauss({ amplitud, centro, ancho, velocidad, sentido = 1 }) {
  return viajera(x => amplitud * Math.exp(-0.5 * ((x - centro) / ancho) ** 2), velocidad, sentido);
}

/**
 * Reflexión en un extremo por el método de la imagen: el reflejado es la
 * onda incidente reflejada respecto del extremo, invertida si es fijo.
 * Devuelve la suma y las dos componentes, válidas del lado del medio.
 * @param {(x: number, t: number) => number} incidente  solución en el medio infinito
 * @param {number} xe extremo @param {'fijo'|'libre'|'abierto'|'cerrado'} tipo
 */
export function conImagen(incidente, xe, tipo) {
  const s = tipoBorde(tipo) === 'fijo' ? -1 : 1;
  const reflejada = (x, t) => s * incidente(2 * xe - x, t);
  return { total: (x, t) => incidente(x, t) + reflejada(x, t), incidente, reflejada };
}

/**
 * Medio uniforme [x₀, x₀ + L] con dos extremos por el método de las
 * imágenes: y = Σₙ (s₀s₁)ⁿ [G(x − 2nL, t) + s₀·G(2x₀ − x + 2nL, t)], con G la
 * solución en el medio infinito de un dato inicial contenido en el medio.
 * @param {(x: number, t: number) => number} G @param {number} x0 @param {number} L
 * @param {string} izq @param {string} der @param {number} [n=4] imágenes a cada lado
 */
export function imagenesMedio(G, x0, L, izq, der, n = 4) {
  const s0 = tipoBorde(izq) === 'fijo' ? -1 : 1, s1 = tipoBorde(der) === 'fijo' ? -1 : 1, p = s0 * s1;
  return (x, t) => {
    let y = 0;
    for (let j = -n; j <= n; j++) {
      const f = p ** Math.abs(j), u = x - x0;
      y += f * (G(x0 + u - 2 * j * L, t) + s0 * G(x0 - u + 2 * j * L, t));
    }
    return y;
  };
}

/**
 * Modo estacionario n de un medio uniforme de longitud L (coordenada desde
 * el extremo izquierdo). Fijo–fijo y libre–libre: fₙ = n·v/2L; fijo–libre:
 * fₙ = (2n − 1)·v/4L. Para un tubo, cerrado = fijo y abierto = libre (para
 * el desplazamiento); los nodos de presión son los antinodos de
 * desplazamiento y al revés. Devuelve null si algún extremo es absorbente.
 * @param {{longitud: number, velocidad: number, izq: string, der: string}} p @param {number} n
 */
export function modoEstacionario({ longitud: L, velocidad: v, izq, der }, n) {
  const a = tipoBorde(izq), b = tipoBorde(der);
  if (a === 'absorbente' || b === 'absorbente' || !(n >= 1)) return null;
  const mixto = a !== b;
  const k = mixto ? (2 * n - 1) * Math.PI / (2 * L) : n * Math.PI / L;
  const lambda = DOS_PI / k, f = v / lambda;
  // Forma: sen(kx) si la izquierda es fija, cos(kx) si es libre
  const forma = a === 'fijo' ? x => Math.sin(k * x) : x => Math.cos(k * x);
  const pendiente = a === 'fijo' ? x => k * Math.cos(k * x) : x => -k * Math.sin(k * x);
  const ceros = desfase => {
    const r = [];
    for (let j = 0; ; j++) { const x = (desfase + j) * lambda / 2; if (x > L + 1e-12 * L) break; r.push(Math.min(x, L)); }
    return r;
  };
  const nodos = ceros(a === 'fijo' ? 0 : 0.5), antinodos = ceros(a === 'fijo' ? 0.5 : 0);
  return { n, f, lambda, k, periodo: 1 / f, forma, pendiente, nodos, antinodos, nodosPresion: antinodos, antinodosPresion: nodos };
}

/**
 * Frecuencias de los primeros modos. @param {{longitud: number, velocidad: number, izq: string, der: string}} p @param {number} [cuantos=5]
 * @returns {Array<{n: number, f: number, lambda: number}>}
 */
export function frecuenciasModos(p, cuantos = 5) {
  const r = [];
  for (let n = 1; n <= cuantos; n++) { const m = modoEstacionario(p, n); if (!m) break; r.push({ n, f: m.f, lambda: m.lambda }); }
  return r;
}

/**
 * Posiciones del pistón (desde la boca abierta) en las que un tubo
 * abierto–cerrado resuena con un sonido de frecuencia f:
 * Lₙ = (2n − 1)·λ/4 − e, con e la corrección de extremo.
 * @param {{frecuencia: number, velocidad: number, correccion?: number, cuantas?: number, maxima?: number}} p
 */
export function resonanciasPiston({ frecuencia, velocidad, correccion = 0, cuantas = 4, maxima = Infinity }) {
  const l = velocidad / frecuencia, r = [];
  for (let n = 1; n <= cuantas; n++) { const L = (2 * n - 1) * l / 4 - correccion; if (L > maxima) break; if (L > 0) r.push(L); }
  return r;
}

/** Rapidez del sonido a partir de dos resonancias consecutivas del pistón: v = 2f(L₂ − L₁). @param {number} f @param {number} L1 @param {number} L2 */
export const velocidadDesdeResonancias = (f, L1, L2) => 2 * f * (L2 - L1);

// Aritmética compleja mínima: [re, im]
const C = {
  mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
  div: (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; },
  sum: (a, b) => [a[0] + b[0], a[1] + b[1]],
  esc: (a, s) => [a[0] * s, a[1] * s],
  abs: a => Math.hypot(a[0], a[1]),
  sqrt: a => { const r = Math.hypot(a[0], a[1]), re = Math.sqrt((r + a[0]) / 2), im = Math.sign(a[1] || 1) * Math.sqrt(Math.max(0, (r - a[0]) / 2)); return [re, im]; },
  sin: a => [Math.sin(a[0]) * Math.cosh(a[1]), Math.cos(a[0]) * Math.sinh(a[1])],
  cos: a => [Math.cos(a[0]) * Math.cosh(a[1]), -Math.sin(a[0]) * Math.sinh(a[1])],
};

/**
 * Régimen estacionario de un medio uniforme excitado en el extremo
 * izquierdo a la frecuencia f, con amortiguamiento β: y(x, t) = Re[Y(x)e^{iωt}].
 * Izquierda fija → desplazamiento impuesto de amplitud A (oscilador);
 * izquierda libre → fuerza de amplitud A (N) sobre el extremo (en un tubo,
 * presión × sección). La derecha puede ser fija, libre o absorbente.
 * Devuelve las amplitudes |Y(x)| y |K·Y'(x)| y sus máximos.
 * @param {{longitud: number, velocidad: number, rigidez: number, izq: string, der: string, amortiguamiento?: number, amplitud?: number}} p
 * @param {number} f
 */
export function respuestaArmonica({ longitud: L, velocidad: v, rigidez: K, izq, der, amortiguamiento: beta = 0, amplitud: A = 1 }, f) {
  const w = DOS_PI * f;
  // k² = (ω² − 2iβω)/v²
  const k = C.esc(C.sqrt([w * w, -2 * beta * w]), 1 / v), kL = C.esc(k, L);
  const a0 = tipoBorde(izq), b0 = tipoBorde(der);
  // y = a·cos(kx) + b·sen(kx); y' = k(−a·sen(kx) + b·cos(kx))
  let a, bb;
  const cL = C.cos(kL), sL = C.sin(kL);
  if (a0 === 'fijo') {
    a = [A, 0];
    if (b0 === 'fijo') bb = C.div(C.esc(C.mul(a, cL), -1), sL);
    else if (b0 === 'libre') bb = C.div(C.mul(a, sL), cL);
    else bb = C.mul(a, [0, -1]);
  } else {
    bb = C.div([-A / K, 0], k);
    if (b0 === 'fijo') a = C.div(C.esc(C.mul(bb, sL), -1), cL);
    else if (b0 === 'libre') a = C.div(C.mul(bb, cL), sL);
    else a = C.mul(bb, [0, 1]);
  }
  const Y = x => C.sum(C.mul(a, C.cos(C.esc(k, x))), C.mul(bb, C.sin(C.esc(k, x))));
  const dY = x => C.mul(k, C.sum(C.esc(C.mul(a, C.sin(C.esc(k, x))), -1), C.mul(bb, C.cos(C.esc(k, x)))));
  let yMax = 0, gMax = 0;
  const n = 200;
  for (let i = 0; i <= n; i++) { const x = L * i / n; yMax = Math.max(yMax, C.abs(Y(x))); gMax = Math.max(gMax, K * C.abs(dY(x))); }
  return { amplitud: x => C.abs(Y(x)), esfuerzo: x => K * C.abs(dY(x)), yMax, esfuerzoMax: gMax, y0: C.abs(Y(0)), yL: C.abs(Y(L)), esfuerzoL: K * C.abs(dY(L)) };
}

// ---------------------------------------------------------------------------
// Doppler cinemático 2D
// ---------------------------------------------------------------------------

/** @typedef {[number, number]} V2 */
/**
 * @typedef {Object} Vaiven  movimiento de vaivén sobre un arco de circunferencia
 * @property {V2} centro  eje de giro (m)
 * @property {number} radio  m
 * @property {number} amplitud  rad: el ángulo va de angulo − amplitud a angulo + amplitud
 * @property {number} omega  rad/s: frecuencia angular del vaivén; la velocidad angular máxima es amplitud·omega
 * @property {number} [angulo=π/2] rad: dirección del centro del arco
 * @property {number} [fase=0] rad: α(t) = angulo + amplitud·sen(omega·t + fase)
 */
/**
 * @typedef {Object} Movil
 * @property {V2} p  posición en t = 0 (m)
 * @property {V2} [v] velocidad constante (m/s)
 * @property {Vaiven} [vaiven] si está, manda sobre p y v (solo fuentes)
 */
/**
 * @typedef {Movil & {f: number, amplitud?: number, fase?: number, inicio?: number}} FuenteSonora
 * La fuente emite A·sen(2πf·t + φ) desde t = inicio (−∞ por defecto).
 */
/**
 * @typedef {Object} Pared
 * @property {V2} punto   un punto de la pared en t = 0
 * @property {V2} normal  normal unitaria hacia el lado del sonido
 * @property {number} [velocidad=0] a lo largo de la normal (positiva: hacia el lado del sonido, se acerca)
 * @property {number} [reflexion=1] fracción de amplitud reflejada
 */
/**
 * @typedef {Object} EscenaDoppler
 * @property {number} c  rapidez del sonido respecto del aire (m/s)
 * @property {V2} [viento] velocidad del aire (m/s)
 * @property {FuenteSonora[]} fuentes
 * @property {Movil[]} observadores
 * @property {Pared[]} [paredes]
 */

/** Ángulo del vaivén en t. @param {Vaiven} w @param {number} t */
const anguloVaiven = (w, t) => (w.angulo ?? Math.PI / 2) + w.amplitud * Math.sin(w.omega * t + (w.fase ?? 0));

/** Posición de un móvil en t. @param {Movil} m @param {number} t @returns {V2} */
export const posicionEn = (m, t) => {
  if (m.vaiven) { const w = m.vaiven, a = anguloVaiven(w, t); return [w.centro[0] + w.radio * Math.cos(a), w.centro[1] + w.radio * Math.sin(a)]; }
  return [m.p[0] + (m.v ? m.v[0] : 0) * t, m.p[1] + (m.v ? m.v[1] : 0) * t];
};

/** Velocidad de un móvil en t (m/s). @param {Movil} m @param {number} t @returns {V2} */
export function velocidadEn(m, t) {
  if (m.vaiven) {
    const w = m.vaiven, a = anguloVaiven(w, t), da = w.amplitud * w.omega * Math.cos(w.omega * t + (w.fase ?? 0));
    return [-w.radio * da * Math.sin(a), w.radio * da * Math.cos(a)];
  }
  return [m.v ? m.v[0] : 0, m.v ? m.v[1] : 0];
}

/**
 * Doppler colineal: f' = f·(c + w − u_o)/(c + w − u_s), con todas las
 * velocidades medidas a lo largo del sentido en que viaja el sonido de la
 * fuente al observador (w: viento; u_s: fuente; u_o: observador).
 * Equivale a f(v + v_o)/(v − v_s) con v_o hacia la fuente y v_s hacia el observador.
 * @param {{f: number, c: number, vFuente?: number, vObservador?: number, viento?: number}} p
 */
export function dopplerColineal({ f, c, vFuente = 0, vObservador = 0, viento = 0 }) {
  return f * (c + viento - vObservador) / (c + viento - vFuente);
}

/** Frecuencia de pulsación entre dos sonidos: |f₁ − f₂|. @param {number} f1 @param {number} f2 */
export const frecuenciaPulsacion = (f1, f2) => Math.abs(f1 - f2);

/** @param {V2} a @param {V2} b @returns {V2} */
const resta = (a, b) => [a[0] - b[0], a[1] - b[1]];
/** @param {V2} a @param {V2} b */
const punto = (a, b) => a[0] * b[0] + a[1] * b[1];

/**
 * Resuelve el instante de emisión de un camino recto con emisor que se
 * mueve en línea recta (en el marco del aire): c·(t_r − t₀(t_e)) = |o − e(t_e)|,
 * con e(t_e) = e₀ + u·t_e y t₀(t_e) = a + b·t_e (b = 1 para una fuente real).
 * La función es monótona si todo va por debajo de la rapidez del sonido.
 */
function emisionRecta(c, o, e0, u, a, bt, tr) {
  const g = te => c * (tr - (a + bt * te)) - Math.hypot(o[0] - e0[0] - u[0] * te, o[1] - e0[1] - u[1] * te);
  // Raíz con t_e ≤ t_r: g(t_e) decrece con t_e
  let hi = (tr - a) / bt, ghi = g(hi);
  if (ghi === 0) return hi;
  if (ghi > 0) return null;
  let paso = Math.max(1e-9, (Math.hypot(o[0] - e0[0] - u[0] * hi, o[1] - e0[1] - u[1] * hi) / c) * 2), lo = hi - paso, glo = g(lo);
  for (let i = 0; i < 200 && glo <= 0; i++) { hi = lo; ghi = glo; paso *= 2; lo = hi - paso; glo = g(lo); }
  if (glo <= 0) return null;
  return brent(g, lo, hi, { tol: 1e-15 * Math.max(1, Math.abs(tr)) + 1e-15, ga: glo, gb: ghi });
}

/**
 * Fuente imagen de una pared plana que se mueve a lo largo de su normal (en
 * el marco del aire, rapidez del sonido c). Los puntos donde los frentes
 * emitidos en t_e chocan con la pared forman una rama de hipérbola con foco
 * en la fuente; el frente reflejado es una circunferencia centrada en el
 * otro foco I = s − n̂·2c²D/(c² − u²), que «emite» en t_I = t_e − 2uD/(c² − u²)
 * (D: distancia de la fuente a la pared en t_e; u: velocidad de la pared
 * hacia el lado del sonido). Con la pared quieta es el reflejo especular.
 * @param {V2} s posición de la fuente en t_e @param {number} te
 * @param {{n: V2, d0: number, u: number}} pared plano n̂·x = d₀ + u·t (marco del aire)
 * @param {number} c
 */
export function imagenPared(s, te, pared, c) {
  const { n, d0, u } = pared, D = punto(n, s) - (d0 + u * te), den = c * c - u * u;
  const s2 = 2 * c * c * D / den;
  return { p: /** @type {V2} */ ([s[0] - n[0] * s2, s[1] - n[1] * s2]), t: te - 2 * u * D / den, D };
}

/**
 * Lo que recibe un observador en t_r por cada camino (directo y reflejado en
 * cada pared): instante de emisión, frecuencia recibida f/(dt_r/dt_e), fase
 * de la señal, distancia recorrida y amplitud con la caída 1/r.
 * @param {EscenaDoppler} esc @param {number} iF @param {number} iO @param {number} tr
 * @returns {Array<{camino: string, te: number, f: number, fase: number, r: number, amplitud: number, n: V2, origen: V2}>}
 */
export function recepcion(esc, iF, iO, tr) {
  if (esc.fuentes[iF].vaiven) return recepcionVaiven(esc, iF, iO, tr);
  const c = esc.c, w = esc.viento ?? [0, 0], F = esc.fuentes[iF], O = esc.observadores[iO];
  const vs = F.v ?? [0, 0], vo = O.v ?? [0, 0];
  // Marco del aire: x' = x − w·t
  const us = resta(vs, w), uo = resta(vo, w);
  const o = posicionEn({ p: O.p, v: uo }, tr), t0 = F.inicio ?? -Infinity, A = F.amplitud ?? 1, ph0 = F.fase ?? 0;
  const out = [];
  const anadir = (camino, te, e0, ue, a, bt, refl) => {
    if (te == null || te < t0) return;
    const ep = /** @type {V2} */ ([e0[0] + ue[0] * te, e0[1] + ue[1] * te]), d = resta(o, ep), r = Math.hypot(d[0], d[1]);
    const n = /** @type {V2} */ (r > 0 ? [d[0] / r, d[1] / r] : [1, 0]);
    // dt_r/dt_e = (t₀' − n̂·u_e/c)/(1 − n̂·u_o/c), con t₀' = bt
    const dtr = (bt - punto(n, ue) / c) / (1 - punto(n, uo) / c);
    out.push({ camino, te, f: F.f / dtr, fase: DOS_PI * F.f * te + ph0, r, amplitud: refl * A / Math.max(r, 1e-6), n, origen: /** @type {V2} */ ([ep[0] + w[0] * tr, ep[1] + w[1] * tr]) });
  };
  anadir('directo', emisionRecta(c, o, F.p, us, 0, 1, tr), F.p, us, 0, 1, 1);
  (esc.paredes || []).forEach((P, k) => {
    const n = P.normal, d0 = punto(n, P.punto), u = (P.velocidad ?? 0) - punto(n, w);
    // La imagen se mueve en línea recta: I(t_e) = I₀ + I'·t_e, t_I = a + b·t_e
    const I0 = imagenPared(F.p, 0, { n, d0, u }, c), I1 = imagenPared([F.p[0] + us[0], F.p[1] + us[1]], 1, { n, d0, u }, c);
    const Iv = resta(I1.p, I0.p), a = I0.t, bt = I1.t - I0.t;
    if (!(bt > 0)) return;
    const te = emisionRecta(c, o, I0.p, Iv, a, bt, tr);
    if (te == null) return;
    // El observador debe estar del lado del sonido y el frente ya haber chocado
    const sTe = /** @type {V2} */ ([F.p[0] + us[0] * te, F.p[1] + us[1] * te]), D = punto(n, sTe) - (d0 + u * te);
    if (D <= 0 || punto(n, o) - (d0 + u * tr) < -1e-9) return;
    // Fase y amplitud: la del frente emitido en t_e; la distancia es la de la imagen
    const ip = /** @type {V2} */ ([I0.p[0] + Iv[0] * te, I0.p[1] + Iv[1] * te]), dd = resta(o, ip), r = Math.hypot(dd[0], dd[1]);
    const nn = /** @type {V2} */ ([dd[0] / r, dd[1] / r]);
    const dtr = (bt - punto(nn, Iv) / c) / (1 - punto(nn, uo) / c);
    if (te < t0) return;
    out.push({ camino: `pared ${k + 1}`, te, f: F.f / dtr, fase: DOS_PI * F.f * te + ph0, r, amplitud: (P.reflexion ?? 1) * A / Math.max(r, 1e-6), n: nn, origen: /** @type {V2} */ ([ip[0] + w[0] * tr, ip[1] + w[1] * tr]) });
  });
  return out;
}

/**
 * Instante de emisión con un emisor de trayectoria cualquiera (en el marco
 * del aire): c·(t_r − t₀(t_e)) = |o − e(t_e)|. g(t_e) decrece si todo va por
 * debajo de la rapidez del sonido, así que la raíz es única.
 * @param {number} c @param {V2} o @param {(te: number) => V2} e @param {(te: number) => number} t0
 * @param {number} tr @param {number} escala tiempo típico (s)
 */
function emisionGeneral(c, o, e, t0, tr, escala) {
  const g = te => { const p = e(te); return c * (tr - t0(te)) - Math.hypot(o[0] - p[0], o[1] - p[1]); };
  let hi = tr, ghi = g(hi);
  if (ghi === 0) return hi;
  if (ghi > 0) {
    // La imagen de una pared «emite» antes que la fuente: se sube hasta cambiar de signo
    let paso = Math.max(1e-9, escala);
    for (let i = 0; i < 200 && ghi > 0; i++) { hi += paso; paso *= 2; ghi = g(hi); }
    if (ghi > 0) return null;
  }
  const p0 = e(hi);
  let paso = Math.max(1e-9, Math.hypot(o[0] - p0[0], o[1] - p0[1]) / c * 2, escala), lo = hi - paso, glo = g(lo);
  for (let i = 0; i < 200 && glo <= 0; i++) { hi = lo; ghi = glo; paso *= 2; lo = hi - paso; glo = g(lo); }
  if (glo <= 0) return null;
  return brent(g, lo, hi, { tol: 1e-15 * Math.max(1, Math.abs(tr)) + 1e-15, ga: glo, gb: ghi });
}

/**
 * recepcion() para una fuente que va de vaivén: el camino directo con la
 * posición y la velocidad de la fuente en el instante de emisión, y el eco
 * de cada pared con la fuente imagen de ese instante (sus derivadas, por
 * diferencias centradas).
 * @param {EscenaDoppler} esc @param {number} iF @param {number} iO @param {number} tr
 */
function recepcionVaiven(esc, iF, iO, tr) {
  const c = esc.c, w = esc.viento ?? [0, 0], F = esc.fuentes[iF], O = esc.observadores[iO];
  const uo = resta(O.v ?? [0, 0], w), o = posicionEn({ p: O.p, v: uo }, tr);
  const t0 = F.inicio ?? -Infinity, A = F.amplitud ?? 1, ph0 = F.fase ?? 0;
  // Fuente en el marco del aire
  const s = te => { const p = posicionEn(F, te); return /** @type {V2} */ ([p[0] - w[0] * te, p[1] - w[1] * te]); };
  const us = te => resta(velocidadEn(F, te), w);
  const escala = 1 / F.f, out = [];
  const te = emisionGeneral(c, o, s, x => x, tr, escala);
  if (te != null && te >= t0) {
    const ep = s(te), d = resta(o, ep), r = Math.hypot(d[0], d[1]);
    const n = /** @type {V2} */ (r > 0 ? [d[0] / r, d[1] / r] : [1, 0]);
    const dtr = (1 - punto(n, us(te)) / c) / (1 - punto(n, uo) / c);
    out.push({ camino: 'directo', te, f: F.f / dtr, fase: DOS_PI * F.f * te + ph0, r, amplitud: A / Math.max(r, 1e-6), n, origen: /** @type {V2} */ ([ep[0] + w[0] * tr, ep[1] + w[1] * tr]) });
  }
  (esc.paredes || []).forEach((P, k) => {
    const n = P.normal, d0 = punto(n, P.punto), u = (P.velocidad ?? 0) - punto(n, w);
    const img = x => imagenPared(s(x), x, { n, d0, u }, c);
    const tE = emisionGeneral(c, o, x => img(x).p, x => img(x).t, tr, escala);
    if (tE == null || tE < t0) return;
    const D = punto(n, s(tE)) - (d0 + u * tE);
    if (D <= 0 || punto(n, o) - (d0 + u * tr) < -1e-9) return;
    const I = img(tE), dd = resta(o, I.p), r = Math.hypot(dd[0], dd[1]), nn = /** @type {V2} */ ([dd[0] / r, dd[1] / r]);
    const h = 1e-4 * escala, Ia = img(tE - h), Ib = img(tE + h);
    const dI = /** @type {V2} */ ([(Ib.p[0] - Ia.p[0]) / (2 * h), (Ib.p[1] - Ia.p[1]) / (2 * h)]), dT = (Ib.t - Ia.t) / (2 * h);
    const dtr = (dT - punto(nn, dI) / c) / (1 - punto(nn, uo) / c);
    out.push({ camino: `pared ${k + 1}`, te: tE, f: F.f / dtr, fase: DOS_PI * F.f * tE + ph0, r, amplitud: (P.reflexion ?? 1) * A / Math.max(r, 1e-6), n: nn, origen: /** @type {V2} */ ([I.p[0] + w[0] * tr, I.p[1] + w[1] * tr]) });
  });
  return out;
}

/**
 * Señal que oye el observador en t_r: suma de A/r·sen(fase) de todas las
 * fuentes y caminos.
 * @param {EscenaDoppler} esc @param {number} iO @param {number} tr
 */
export function senalObservador(esc, iO, tr) {
  let s = 0;
  esc.fuentes.forEach((_, iF) => { for (const c of recepcion(esc, iF, iO, tr)) s += c.amplitud * Math.sin(c.fase); });
  return s;
}

/**
 * Frentes de onda de una fuente en el instante t: circunferencias de los
 * frentes emitidos cada `cada` periodos, arrastradas por el viento; y los
 * frentes reflejados en cada pared (centro en la imagen; solo valen del lado
 * del sonido).
 * @param {EscenaDoppler} esc @param {number} iF @param {number} t
 * @param {{cada?: number, max?: number, rMax?: number}} [o]
 * @returns {Array<{centro: V2, radio: number, te: number, pared: number}>}
 */
export function frentesOnda(esc, iF, t, o = {}) {
  const F = esc.fuentes[iF], c = esc.c, w = esc.viento ?? [0, 0], T = (o.cada ?? 1) / F.f, max = o.max ?? 80, rMax = o.rMax ?? Infinity;
  const t0 = Number.isFinite(F.inicio ?? -Infinity) ? /** @type {number} */ (F.inicio) : -Infinity;
  const us = resta(F.v ?? [0, 0], w), out = [];
  // El frente más reciente se emitió en el último múltiplo de T
  let te = Math.floor(t / T) * T;
  for (let j = 0; j < max && te >= t0 - 1e-12; j++, te -= T) {
    const radio = c * (t - te);
    if (radio > rMax) break;
    const sp = F.vaiven ? (q => [q[0] - w[0] * te, q[1] - w[1] * te])(posicionEn(F, te)) : [F.p[0] + us[0] * te, F.p[1] + us[1] * te];
    out.push({ centro: /** @type {V2} */ ([sp[0] + w[0] * t, sp[1] + w[1] * t]), radio, te, pared: -1 });
    (esc.paredes || []).forEach((P, k) => {
      const n = P.normal, d0 = punto(n, P.punto), u = (P.velocidad ?? 0) - punto(n, w);
      const I = imagenPared(/** @type {V2} */ (sp), te, { n, d0, u }, c), rr = c * (t - I.t);
      // Solo si el frente ya chocó con la pared (el reflejado tiene radio mayor que la distancia de la imagen a la pared)
      const dI = (d0 + u * t) - punto(n, I.p);
      if (I.D > 0 && rr > dI) out.push({ centro: /** @type {V2} */ ([I.p[0] + w[0] * t, I.p[1] + w[1] * t]), radio: rr, te, pared: k });
    });
  }
  return out;
}

/**
 * Frecuencia recibida por el camino directo en cada instante de una lista.
 * @param {EscenaDoppler} esc @param {number} iF @param {number} iO @param {number[]} tiempos
 */
export function frecuenciaRecibida(esc, iF, iO, tiempos) {
  return tiempos.map(tr => { const d = recepcion(esc, iF, iO, tr).find(c => c.camino === 'directo'); return d ? d.f : NaN; });
}
