/* ==========================================================================
   Volta — motor de circuitos (Circuitos · Corriente continua y Transitorios)
   Análisis nodal modificado (MNA, el método de SPICE) para circuitos de
   parámetros concentrados: baterías con resistencia interna, fuentes de
   corriente, resistencias, reóstatos, bombillas no lineales, capacitores,
   inductores, interruptores de una vía y de tres posiciones, amperímetros,
   voltímetros, cables y tierra.

   - Punto de operación (estado estacionario): capacitores abiertos,
     inductores en cortocircuito y Newton–Raphson para las bombillas.
   - Transitorio: regla trapezoidal con paso adaptativo (error local medido
     en norma de energía). Tras cada discontinuidad arranca con un paso
     pequeño de Euler implícito, que fija las corrientes de los capacitores
     sin las oscilaciones espurias de la trapezoidal.
   - Interruptores como eventos: las acciones programadas cambian la
     topología en instantes exactos (un paso termina justo en el evento).
   - Conductores ideales: los cables, los interruptores cerrados y los
     amperímetros ideales unen nodos (unión de conjuntos). Su corriente sale
     de la ley de corrientes de Kirchhoff sobre un árbol generador.
   - Modo ideal: si al conmutar quedan capacitores conectados entre sí o con
     una batería sin resistencia de por medio, la carga se redistribuye al
     instante. Lo resuelve un análisis de impulso: solo los capacitores y las
     fuentes de voltaje admiten un salto de carga; la energía que se pierde
     en el salto queda registrada en el evento. Modo realista: los cables y
     los contactos tienen una resistencia rCable y el transitorio se ve.
   - Conservación de la carga en islas: un grupo de nodos sin camino de
     conducción hacia la referencia (solo capacitores lo unen al resto)
     guarda su carga total. Su ecuación de Kirchhoff se sustituye por la de
     su carga, Σ ±C·(Va − Vb) = Q, de modo que la carga no se fuga ni por
     redondeo y el estado estacionario de la isla queda bien definido.
   - Registro de energía: trabajo de cada fuente, energía en capacitores e
     inductores, calor en cada resistencia y pérdidas en las conexiones
     ideales. Con la regla trapezoidal y la cuadratura del producto de los
     promedios, h·v̄·ī, la energía de capacitores e inductores es exacta y
     el balance cierra paso a paso por el teorema de Tellegen (Σ v̄·ī = 0).
     El pequeño exceso de los pasos de Euler implícito se registra aparte
     como disipación numérica.
   - Capacitores que cambian en el tiempo (una placa conductora o un
     dieléctrico que entra o sale): C(t) = C·f(t), con f lineal a tramos.
     La variable de estado es la carga, q = C(t)·v, y el modelo compañero
     la integra con la regla trapezoidal; cada vértice del perfil corta el
     tramo como un evento (dC/dt salta y la corriente con él). El trabajo
     de la fuerza externa que mueve la placa, −∫½·v²·dC, queda en W de ese
     capacitor: en un paso trapezoidal vale exactamente −½·v₀·v₁·ΔC, así
     que el balance sigue cerrando.
   Puro: sin DOM. Lo usan la pantalla de Circuitos y las pruebas.
   ========================================================================== */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Tipos de componente que entiende el motor. */
export const TIPOS_COMPONENTE = Object.freeze([
  'bateria', 'fuente-corriente', 'resistencia', 'reostato', 'bombilla', 'capacitor', 'inductor',
  'interruptor', 'interruptor-3', 'amperimetro', 'voltimetro', 'cable', 'tierra',
]);

/** Número de bornes admitido por cada tipo. */
const BORNES = {
  bateria: [2], 'fuente-corriente': [2], resistencia: [2], reostato: [2, 3], bombilla: [2], capacitor: [2],
  inductor: [2], interruptor: [2], 'interruptor-3': [2, 3, 4], amperimetro: [2], voltimetro: [2], cable: [2], tierra: [1],
};

/**
 * Componente de un circuito. `nodos` son los nombres de los nodos a los que
 * se conectan sus bornes, en este orden:
 * - batería: [+, −]; fuente de corriente: [a, b] (la corriente I va de a a b
 *   por dentro de la fuente y sale por b);
 * - dos bornes (resistencia, bombilla, capacitor, inductor, interruptor,
 *   amperímetro, voltímetro, cable): [a, b]; la corriente positiva va de a a b;
 * - reóstato: [a, b] o [a, b, cursor]; x es la posición del cursor (0 en a);
 * - interruptor de tres posiciones: [común, a, b, c] (null si una posición
 *   no está conectada); posicion: 'a', 'b', 'c' o null (abierto);
 * - tierra: [nodo]; todos los nodos con tierra son el mismo, de potencial 0.
 * @typedef {Object} Componente
 * @property {string} id
 * @property {string} tipo
 * @property {Array<string|null>} nodos
 * @property {number} [E]   Batería: fuerza electromotriz (V)
 * @property {number} [r]   Batería: resistencia interna; amperímetro y voltímetro: resistencia propia (Ω)
 * @property {number} [I]   Fuente de corriente (A)
 * @property {number} [R]   Resistencia, reóstato (Ω)
 * @property {number} [x]   Reóstato: posición del cursor (0 a 1)
 * @property {number} [C]   Capacitor (F)
 * @property {number} [q0]  Capacitor: carga inicial de la placa a (C)
 * @property {Array<[number, number]>} [perfil] Capacitor: factor f(t) de la capacidad como tabla
 *   [[t, f], …] (t creciente, f > 0), lineal entre puntos y constante fuera: C(t) = C·f(t)
 * @property {number} [L]   Inductor (H)
 * @property {number} [i0]  Inductor: corriente inicial de a a b (A)
 * @property {boolean} [cerrado]  Interruptor
 * @property {'a'|'b'|'c'|null} [posicion]  Interruptor de tres posiciones
 * @property {number} [Vn]  Bombilla: voltaje nominal (V)
 * @property {number} [Pn]  Bombilla: potencia nominal (W)
 * @property {number} [frio] Bombilla: cociente entre la resistencia en caliente (nominal) y en frío
 * @property {Array<[number, number]>} [curva] Bombilla: curva I-V como tabla [[V, I], …] (V > 0 creciente)
 */

/**
 * Acción programada: cambia un interruptor en el instante t.
 * @typedef {Object} Accion
 * @property {number} t  Instante (s)
 * @property {string} id Interruptor
 * @property {boolean|'cerrado'|'abierto'|'a'|'b'|'c'|null} estado
 */

/**
 * @typedef {Object} Circuito
 * @property {Componente[]} componentes
 * @property {Accion[]} [acciones]
 */

/**
 * @typedef {Object} OpcionesCircuito
 * @property {number} [duracion=10]    Tiempo simulado (s)
 * @property {number} [dt=0.01]        Intervalo entre muestras (s); el paso interno nunca lo supera
 * @property {'ideal'|'realista'} [modo='ideal']
 * @property {number} [rCable=0.01]    Modo realista: resistencia de cada cable y de cada contacto cerrado (Ω)
 * @property {number} [tolerancia=1e-7] Error local admitido por paso, relativo (norma de energía)
 * @property {'reposo'|'estacionario'} [inicio='reposo'] Estado inicial: las cargas y corrientes dadas, o el estacionario
 * @property {number} [maxPasos=2000000]
 */

/** Opciones por omisión. */
export const OPCIONES_CIRCUITO = Object.freeze({
  duracion: 10, dt: 0.01, modo: /** @type {'ideal'} */ ('ideal'), rCable: 0.01, tolerancia: 1e-7,
  inicio: /** @type {'reposo'} */ ('reposo'), maxPasos: 2e6,
});

/**
 * Estado muestreado. V por nodo (mismo orden que `nodos`); el resto por
 * componente (mismo orden que `ids`):
 * I: corriente (batería: la que sale por el borne +; dos bornes: de a a b);
 * v: diferencia de potencial entre sus bornes (batería: V₊ − V₋);
 * q: carga de la placa a de cada capacitor; U: energía almacenada ahora;
 * W: trabajo acumulado que entregó cada fuente (en un capacitor con perfil,
 * el de la fuerza externa que cambia su capacidad); Q: calor acumulado.
 * @typedef {Object} MuestraCircuito
 * @property {number} t
 * @property {Float64Array} V
 * @property {Float64Array} I
 * @property {Float64Array} v
 * @property {Float64Array} q
 * @property {Float64Array} U
 * @property {Float64Array} W
 * @property {Float64Array} Q
 * @property {number} perdidas Energía perdida en conexiones ideales y cortes de inductores (J)
 * @property {number} numerico Disipación numérica de los pasos de Euler implícito (J)
 */

/**
 * @typedef {Object} EventoCircuito
 * @property {number} t
 * @property {string} nombre
 * @property {Array<{id: string, estado: any}>} acciones
 * @property {number} perdida  Energía perdida en el instante (J)
 * @property {number} carga    Mayor carga que saltó de golpe en un capacitor (C)
 * @property {string[]} cortes Inductores cuya corriente se interrumpió
 */

/** Error con un mensaje que dice qué pasa en el circuito y cómo arreglarlo. */
export class ErrorCircuito extends Error {
  /** @param {string} mensaje */
  constructor(mensaje) { super(mensaje); this.name = 'ErrorCircuito'; }
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------
const esNumero = v => typeof v === 'number' && Number.isFinite(v);
function finito(id, nombre, v) {
  if (!esNumero(v)) throw new ErrorCircuito(`«${id}»: ${nombre} tiene que ser un número (recibió ${v}).`);
  return v;
}
function positivo(id, nombre, v) {
  if (!esNumero(v) || v <= 0) throw new ErrorCircuito(`«${id}»: ${nombre} tiene que ser un número positivo (recibió ${v}).`);
  return v;
}
function noNegativo(id, nombre, v) {
  if (!esNumero(v) || v < 0) throw new ErrorCircuito(`«${id}»: ${nombre} no puede ser negativa (recibió ${v}).`);
  return v;
}
/** @param {any} e */
function estadoSimple(id, e) {
  if (e === true || e === 'cerrado') return true;
  if (e === false || e === 'abierto') return false;
  throw new ErrorCircuito(`«${id}»: el estado de un interruptor es "cerrado" o "abierto" (recibió ${e}).`);
}
/** @param {any} e */
function posicionTres(id, e) {
  if (e === null || e === 'abierto' || e === false) return null;
  if (e === 'a' || e === 'b' || e === 'c') return e;
  throw new ErrorCircuito(`«${id}»: la posición de un interruptor de tres posiciones es "a", "b", "c" o "abierto" (recibió ${e}).`);
}

// ---------------------------------------------------------------------------
// Capacitor variable: perfil f(t) lineal a tramos
// ---------------------------------------------------------------------------
const MAX_PERFIL = 200;
function perfilValido(id, p) {
  if (!Array.isArray(p) || !p.length || p.length > MAX_PERFIL) throw new ErrorCircuito(`«${id}»: el perfil de la capacidad es una tabla de 1 a ${MAX_PERFIL} pares [t, f].`);
  let tAnt = -Infinity;
  return p.map(par => {
    if (!Array.isArray(par) || !esNumero(par[0]) || !esNumero(par[1])) throw new ErrorCircuito(`«${id}»: el perfil de la capacidad es una tabla de pares [t, f].`);
    if (par[0] < 0 || par[0] <= tAnt) throw new ErrorCircuito(`«${id}»: los instantes del perfil empiezan en t ≥ 0 y crecen.`);
    if (!(par[1] > 0)) throw new ErrorCircuito(`«${id}»: el factor de la capacidad tiene que ser positivo (recibió ${par[1]}).`);
    tAnt = par[0];
    return /** @type {[number, number]} */ ([par[0], par[1]]);
  });
}
/** Factor f(t) de un perfil: lineal entre puntos, constante fuera. */
function factorEn(p, t) {
  if (t <= p[0][0]) return p[0][1];
  const n = p.length;
  if (t >= p[n - 1][0]) return p[n - 1][1];
  let i = 0; while (t > p[i + 1][0]) i++;
  const [t0, f0] = p[i], [t1, f1] = p[i + 1];
  return f0 + (f1 - f0) * (t - t0) / (t1 - t0);
}

/**
 * Capacidad de un capacitor en el instante t: C·f(t) si tiene perfil, C si no.
 * @param {{C: number, perfil?: Array<[number, number]>}} c @param {number} t
 */
export function capacidadEn(c, t) { return c.perfil ? c.C * factorEn(c.perfil, t) : c.C; }
// Lo mismo para una rama del motor (valor = C)
const capRama = (r, t) => (r.perfil ? r.valor * factorEn(r.perfil, t) : r.valor);

// ---------------------------------------------------------------------------
// Bombilla: curva I-V
// ---------------------------------------------------------------------------

/**
 * Curva I-V de una bombilla.
 * - Modelo de filamento (por omisión): la resistencia crece con el voltaje,
 *   R(V) = R₀ + b·|V|, de modo que I = V/(R₀ + b·|V|). R₀ es la resistencia en
 *   frío y b se ajusta para que a Vn la potencia sea Pn (Rn = Vn²/Pn = frio·R₀).
 * - Tabla [[V, I], …]: interpolación cúbica monótona (Fritsch–Carlson) que
 *   pasa por (0, 0), simétrica para V < 0 y lineal más allá del último punto.
 * @param {{Vn?: number, Pn?: number, frio?: number, curva?: Array<[number, number]>}} p
 * @returns {{I: (v: number) => number, dI: (v: number) => number, Vn: number, Pn: number, R0: number, b: number}}
 */
export function curvaBombilla(p) {
  if (p.curva) {
    const xs = [0], ys = [0];
    for (const par of p.curva) {
      if (!Array.isArray(par) || !esNumero(par[0]) || !esNumero(par[1])) throw new ErrorCircuito('La curva de la bombilla es una tabla de pares [V, I].');
      if (par[0] === 0 && par[1] === 0) continue;
      if (par[0] <= xs[xs.length - 1] || par[1] <= ys[ys.length - 1]) throw new ErrorCircuito('La curva de la bombilla tiene que crecer: V e I positivos y en aumento.');
      xs.push(par[0]); ys.push(par[1]);
    }
    if (xs.length < 2) throw new ErrorCircuito('La curva de la bombilla necesita al menos un punto.');
    const f = monotona(xs, ys), n = xs.length;
    const Vn = p.Vn ?? xs[n - 1], Pn = p.Pn ?? xs[n - 1] * ys[n - 1];
    const I = v => Math.sign(v) * f.f(Math.abs(v)), dI = v => f.df(Math.abs(v));
    return { I, dI, Vn, Pn, R0: 1 / f.df(0), b: 0 };
  }
  const Vn = p.Vn ?? 12, Pn = p.Pn ?? 6, frio = p.frio ?? 8;
  if (!(Vn > 0) || !(Pn > 0) || !(frio >= 1)) throw new ErrorCircuito('La bombilla necesita un voltaje y una potencia nominales positivos, y una razón caliente/frío de al menos 1.');
  const Rn = Vn * Vn / Pn, R0 = Rn / frio, b = (Rn - R0) / Vn;
  return {
    I: v => v / (R0 + b * Math.abs(v)),
    dI: v => { const d = R0 + b * Math.abs(v); return R0 / (d * d); },
    Vn, Pn, R0, b,
  };
}

/** Interpolación cúbica de Hermite monótona (Fritsch–Carlson). */
function monotona(xs, ys) {
  const n = xs.length, d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  if (n === 2) { m[0] = m[1] = d[0]; }
  else {
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
    }
  }
  const tramo = x => { let i = 0; while (i < n - 2 && x > xs[i + 1]) i++; return i; };
  return {
    f(x) {
      if (x >= xs[n - 1]) return ys[n - 1] + m[n - 1] * (x - xs[n - 1]);
      const i = tramo(x), h = xs[i + 1] - xs[i], s = (x - xs[i]) / h, s2 = s * s, s3 = s2 * s;
      return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h * m[i + 1];
    },
    df(x) {
      if (x >= xs[n - 1]) return m[n - 1];
      const i = tramo(x), h = xs[i + 1] - xs[i], s = (x - xs[i]) / h, s2 = s * s;
      return ((6 * s2 - 6 * s) * ys[i] + (6 * s2 - 6 * s) * -ys[i + 1]) / h + (3 * s2 - 4 * s + 1) * m[i] + (3 * s2 - 2 * s) * m[i + 1];
    },
  };
}

// ---------------------------------------------------------------------------
// Preparación del circuito: componentes validados y nodos numerados
// ---------------------------------------------------------------------------
function normalizarComponente(c, i) {
  if (!c || typeof c !== 'object') throw new ErrorCircuito(`El componente ${i + 1} no es un objeto.`);
  const id = c.id != null ? String(c.id) : `${c.tipo}-${i + 1}`;
  if (!TIPOS_COMPONENTE.includes(c.tipo)) throw new ErrorCircuito(`«${id}»: no conozco el tipo de componente «${c.tipo}».`);
  if (!Array.isArray(c.nodos) || !BORNES[c.tipo].includes(c.nodos.length)) {
    throw new ErrorCircuito(`«${id}»: un componente de tipo ${c.tipo} se conecta a ${BORNES[c.tipo].join(' o ')} nodos (recibió ${Array.isArray(c.nodos) ? c.nodos.length : 'ninguno'}).`);
  }
  const nodos = c.nodos.map((n, k) => {
    const opcional = (c.tipo === 'interruptor-3' && k > 0) || (c.tipo === 'reostato' && k === 2);
    if (n == null || n === '') {
      if (opcional) return null;
      throw new ErrorCircuito(`«${id}»: el borne ${k + 1} no está conectado a ningún nodo.`);
    }
    return String(n);
  });
  const base = { id, tipo: c.tipo, nodos };
  switch (c.tipo) {
    case 'bateria': return { ...base, E: finito(id, 'la fem E', c.E ?? 0), r: noNegativo(id, 'la resistencia interna', c.r ?? 0) };
    case 'fuente-corriente': return { ...base, I: finito(id, 'la corriente I', c.I ?? 0) };
    case 'resistencia': return { ...base, R: positivo(id, 'la resistencia R', c.R) };
    case 'reostato': {
      const x = c.x ?? 0.5;
      if (!esNumero(x) || x < 0 || x > 1) throw new ErrorCircuito(`«${id}»: la posición del cursor va de 0 a 1 (recibió ${x}).`);
      return { ...base, R: positivo(id, 'la resistencia total R', c.R), x };
    }
    case 'bombilla': {
      const p = { Vn: c.Vn, Pn: c.Pn, frio: c.frio, curva: c.curva };
      return { ...base, ...p, curvaIV: curvaBombilla(p) };
    }
    case 'capacitor': {
      const cap = { ...base, C: positivo(id, 'la capacitancia C', c.C), q0: finito(id, 'la carga inicial', c.q0 ?? 0) };
      return c.perfil != null ? { ...cap, perfil: perfilValido(id, c.perfil) } : cap;
    }
    case 'inductor': return { ...base, L: positivo(id, 'la inductancia L', c.L), i0: finito(id, 'la corriente inicial', c.i0 ?? 0) };
    case 'interruptor': return { ...base, cerrado: estadoSimple(id, c.cerrado ?? false) };
    case 'interruptor-3': return { ...base, posicion: posicionTres(id, c.posicion ?? null) };
    case 'amperimetro': return { ...base, r: noNegativo(id, 'la resistencia del amperímetro', c.r ?? 0) };
    case 'voltimetro': {
      const r = c.r ?? Infinity;
      if (!(r > 0)) throw new ErrorCircuito(`«${id}»: la resistencia del voltímetro tiene que ser positiva (o infinita, ideal).`);
      return { ...base, r };
    }
    default: return base;
  }
}

/**
 * Valida el circuito y numera los nodos. Lanza ErrorCircuito si algo no cuadra.
 * @param {Circuito} circuito
 */
export function prepararCircuito(circuito) {
  if (!circuito || !Array.isArray(circuito.componentes)) throw new ErrorCircuito('El circuito no tiene una lista de componentes.');
  const comps = circuito.componentes.map(normalizarComponente);
  const ids = new Set();
  for (const c of comps) {
    if (ids.has(c.id)) throw new ErrorCircuito(`Hay dos componentes con el nombre «${c.id}».`);
    ids.add(c.id);
  }
  /** @type {string[]} */ const nombres = [];
  const indice = new Map();
  const nodo = n => { if (!indice.has(n)) { indice.set(n, nombres.length); nombres.push(n); } return indice.get(n); };
  for (const c of comps) {
    c.n = c.nodos.map(n => (n == null ? -1 : nodo(n)));
  }
  // Nodos internos (no se dibujan): batería con resistencia interna, reóstato sin cursor
  for (const c of comps) {
    if (c.tipo === 'bateria' && c.r > 0) c.ni = nodo(`${c.id}·interno`);
    if (c.tipo === 'reostato') c.nc = c.n.length > 2 && c.n[2] >= 0 ? c.n[2] : nodo(`${c.id}·cursor`);
  }
  const tierras = comps.filter(c => c.tipo === 'tierra').map(c => c.n[0]);
  const porId = new Map(comps.map((c, i) => [c.id, i]));
  const acciones = (circuito.acciones || []).map((a, k) => {
    if (!a || !esNumero(a.t) || a.t < 0) throw new ErrorCircuito(`La acción ${k + 1} necesita un instante t ≥ 0.`);
    const ci = porId.get(String(a.id));
    if (ci == null) throw new ErrorCircuito(`La acción ${k + 1} se refiere a «${a.id}», que no está en el circuito.`);
    const c = comps[ci];
    if (c.tipo === 'interruptor') return { t: a.t, ci, id: c.id, estado: estadoSimple(c.id, a.estado), orden: k };
    if (c.tipo === 'interruptor-3') return { t: a.t, ci, id: c.id, estado: posicionTres(c.id, a.estado), orden: k };
    throw new ErrorCircuito(`La acción ${k + 1}: «${c.id}» no es un interruptor.`);
  }).sort((p, q) => p.t - q.t || p.orden - q.orden);
  return { comps, nombres, tierras, acciones, porId };
}

// ---------------------------------------------------------------------------
// Unión de conjuntos (nodos unidos por conductores ideales, islas). La raíz
// es siempre el índice menor: el resultado no depende del orden de unión.
// ---------------------------------------------------------------------------
function crearUF(n) { const p = new Int32Array(n); for (let i = 0; i < n; i++) p[i] = i; return p; }
function buscar(p, i) { while (p[i] !== i) { p[i] = p[p[i]]; i = p[i]; } return i; }
function unir(p, a, b) { a = buscar(p, a); b = buscar(p, b); if (a < b) p[b] = a; else if (b < a) p[a] = b; }

// ---------------------------------------------------------------------------
// Topología: ramas elementales para un estado de los interruptores
// ---------------------------------------------------------------------------
// Ramas: G conductancia lineal, V fuente de voltaje ideal, J fuente de
// corriente, C capacitor, L inductor, N bombilla, K conductor ideal (une
// nodos). Cada rama va de a a b (nodos crudos) y recuerda su componente.

function topologia(P, estados, o) {
  const nR = P.nombres.length;
  /** @type {any[]} */ const ramas = [];
  const add = (tipo, a, b, valor, ci, rol = '') => { ramas.push({ tipo, a, b, valor, ci, rol, ma: 0, mb: 0, jv: -1, jl: -1, curva: null, perfil: null }); };
  const conductor = (a, b, ci, rol) => (o.modo === 'realista' ? add('G', a, b, 1 / o.rCable, ci, rol) : add('K', a, b, 0, ci, rol));
  P.comps.forEach((c, ci) => {
    const [a, b] = c.n;
    switch (c.tipo) {
      case 'bateria':
        if (c.r > 0) { add('V', a, c.ni, c.E, ci, 'fem'); add('G', c.ni, b, 1 / c.r, ci, 'interna'); }
        else add('V', a, b, c.E, ci, 'fem');
        break;
      case 'fuente-corriente': add('J', a, b, c.I, ci); break;
      case 'resistencia': add('G', a, b, 1 / c.R, ci); break;
      case 'reostato': {
        const Ra = c.R * c.x, Rb = c.R * (1 - c.x);
        if (Ra > 0) add('G', a, c.nc, 1 / Ra, ci, 'a'); else add('K', a, c.nc, 0, ci, 'a');
        if (Rb > 0) add('G', c.nc, b, 1 / Rb, ci, 'b'); else add('K', c.nc, b, 0, ci, 'b');
        break;
      }
      case 'bombilla': add('N', a, b, 0, ci); ramas[ramas.length - 1].curva = c.curvaIV; break;
      case 'capacitor': add('C', a, b, c.C, ci); ramas[ramas.length - 1].perfil = c.perfil || null; break;
      case 'inductor': add('L', a, b, c.L, ci); break;
      case 'interruptor': if (estados[ci]) conductor(a, b, ci, 'contacto'); break;
      case 'interruptor-3': {
        const p = estados[ci];
        if (p) { const k = 'abc'.indexOf(p) + 1; if (k < c.n.length && c.n[k] >= 0) conductor(c.n[0], c.n[k], ci, 'contacto'); }
        break;
      }
      case 'amperimetro': if (c.r > 0) add('G', a, b, 1 / c.r, ci); else add('K', a, b, 0, ci); break;
      case 'voltimetro': if (Number.isFinite(c.r)) add('G', a, b, 1 / c.r, ci); break;
      case 'cable': conductor(a, b, ci, 'cable'); break;
      default: break;
    }
  });

  // Nodos unidos por conductores ideales y por la tierra
  const uf = crearUF(nR);
  for (const r of ramas) if (r.tipo === 'K') unir(uf, r.a, r.b);
  for (let k = 1; k < P.tierras.length; k++) unir(uf, P.tierras[0], P.tierras[k]);
  const raizTierra = P.tierras.length ? buscar(uf, P.tierras[0]) : -1;
  const mDe = new Int32Array(nR), indiceRaiz = new Map();
  let M = 0;
  for (let i = 0; i < nR; i++) {
    const r = buscar(uf, i);
    if (r === raizTierra) { mDe[i] = -1; continue; }
    if (!indiceRaiz.has(r)) indiceRaiz.set(r, M++);
    mDe[i] = indiceRaiz.get(r);
  }
  let nV = 0, nLdc = 0, nN = 0;
  for (const r of ramas) {
    r.ma = mDe[r.a]; r.mb = mDe[r.b];
    if (r.tipo === 'V') {
      if (r.ma === r.mb) throw new ErrorCircuito(`Cortocircuito: los bornes de «${P.comps[r.ci].id}» quedan unidos por conductores sin resistencia. Abre un interruptor o añade una resistencia.`);
      r.jv = nV++;
    }
    if (r.tipo === 'L' && r.ma !== r.mb) r.jl = nLdc++;
    if (r.tipo === 'N') nN++;
  }

  // Componentes conexas (sin conductores ideales ni fuentes de corriente) y
  // nodos de referencia de las que no tienen tierra
  const gm = m => (m < 0 ? M : m);
  const ufTodo = crearUF(M + 1), ufCC = crearUF(M + 1);
  for (const r of ramas) {
    if (r.tipo === 'K' || r.tipo === 'J') continue;
    unir(ufTodo, gm(r.ma), gm(r.mb));
    if (r.tipo !== 'C') unir(ufCC, gm(r.ma), gm(r.mb));
  }
  const raizTodo = buscar(ufTodo, M), refs = [], vistos = new Set();
  for (let m = 0; m < M; m++) {
    const r = buscar(ufTodo, m);
    if (r === raizTodo || vistos.has(r)) continue;
    vistos.add(r); refs.push(m);
  }
  for (const r of ramas) {
    if (r.tipo === 'J' && buscar(ufTodo, gm(r.ma)) !== buscar(ufTodo, gm(r.mb))) {
      throw new ErrorCircuito(`La fuente de corriente «${P.comps[r.ci].id}» no tiene un camino cerrado: su corriente no tiene por dónde volver.`);
    }
  }

  // Islas: nodos sin camino de conducción (corriente continua) a la referencia
  const anclada = new Set([buscar(ufCC, M), ...refs.map(m => buscar(ufCC, m))]);
  const porRaiz = new Map();
  for (let m = 0; m < M; m++) {
    const r = buscar(ufCC, m);
    if (anclada.has(r)) continue;
    if (!porRaiz.has(r)) porRaiz.set(r, { fila: m, nodos: [], caps: [], fuentes: [] });
    porRaiz.get(r).nodos.push(m);
  }
  ramas.forEach((r, k) => {
    if (r.tipo !== 'C' && r.tipo !== 'J') return;
    const ra = buscar(ufCC, gm(r.ma)), rb = buscar(ufCC, gm(r.mb));
    if (ra === rb) return;
    const lista = r.tipo === 'C' ? 'caps' : 'fuentes';
    if (porRaiz.has(ra)) porRaiz.get(ra)[lista].push({ k, s: 1 });
    if (porRaiz.has(rb)) porRaiz.get(rb)[lista].push({ k, s: -1 });
  });

  // Conductores ideales: adyacencia entre nodos crudos para repartir su corriente
  const adyK = new Map();
  ramas.forEach((r, k) => {
    if (r.tipo !== 'K' || r.a === r.b) return;
    for (const [u, w] of [[r.a, r.b], [r.b, r.a]]) { if (!adyK.has(u)) adyK.set(u, []); adyK.get(u).push([k, w]); }
  });

  const ramasDe = P.comps.map(() => /** @type {number[]} */ ([]));
  ramas.forEach((r, k) => ramasDe[r.ci].push(k));
  const estadosRama = [];
  ramas.forEach((r, k) => { if (r.tipo === 'C' || r.tipo === 'L') estadosRama.push(k); });
  return { ramas, M, mDe, nR, nV, nLdc, nN, refs, islas: [...porRaiz.values()], adyK, ramasDe, estadosRama, estados: estados.slice() };
}

// ---------------------------------------------------------------------------
// Sistema lineal: armado y eliminación gaussiana con pivoteo parcial escalado
// ---------------------------------------------------------------------------
function nuevoSistema(n) { return { n, A: new Float64Array(n * n), b: new Float64Array(n) }; }
function sumar(S, i, j, v) { if (i >= 0 && j >= 0) S.A[i * S.n + j] += v; }
function conductancia(S, a, b, G) { sumar(S, a, a, G); sumar(S, b, b, G); sumar(S, a, b, -G); sumar(S, b, a, -G); }
// Corriente fija I de a a b (por dentro del elemento): pasa al lado derecho
function corrienteFija(S, a, b, I) { if (a >= 0) S.b[a] -= I; if (b >= 0) S.b[b] += I; }
// Rama con corriente incógnita (columna c) y Va − Vb = E
function ramaFuente(S, a, b, c, E) { sumar(S, a, c, 1); sumar(S, b, c, -1); sumar(S, c, a, 1); sumar(S, c, b, -1); S.b[c] = E; }
function filaNueva(S, f) { S.A.fill(0, f * S.n, (f + 1) * S.n); S.b[f] = 0; }

/** Resuelve A·x = b. Lanza ErrorCircuito si la matriz es singular. */
function resolver(S, motivo) {
  const { n, A, b } = S, s = new Float64Array(n), p = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    p[i] = i; let m = 0;
    for (let j = 0; j < n; j++) m = Math.max(m, Math.abs(A[i * n + j]));
    if (m === 0) throw new ErrorCircuito(motivo);
    s[i] = m;
  }
  for (let k = 0; k < n; k++) {
    let mejor = k, bv = -1;
    for (let i = k; i < n; i++) { const v = Math.abs(A[p[i] * n + k]) / s[p[i]]; if (v > bv) { bv = v; mejor = i; } }
    if (!(bv > 1e-13)) throw new ErrorCircuito(motivo);
    const tmp = p[k]; p[k] = p[mejor]; p[mejor] = tmp;
    const pk = p[k] * n, piv = A[pk + k];
    for (let i = k + 1; i < n; i++) {
      const pi = p[i] * n, f = A[pi + k] / piv;
      if (f === 0) continue;
      for (let j = k + 1; j < n; j++) A[pi + j] -= f * A[pk + j];
      b[p[i]] -= f * b[p[k]];
    }
  }
  const x = new Float64Array(n);
  for (let k = n - 1; k >= 0; k--) {
    const pk = p[k] * n; let acc = b[p[k]];
    for (let j = k + 1; j < n; j++) acc -= A[pk + j] * x[j];
    x[k] = acc / A[pk + k];
  }
  return x;
}

const SINGULAR = 'El circuito no tiene una solución única: hay un lazo de fuentes de voltaje o de inductores sin resistencia, o dos fuentes en paralelo que se contradicen.';
const SINGULAR_DC = 'El circuito no tiene estado estacionario: hay un lazo de fuentes de voltaje o de inductores sin resistencia, o una fuente de corriente que carga sin fin un capacitor.';

// Filas de las referencias (V = 0) y de las islas (carga total fija), con la
// capacidad del instante t
function restricciones(S, T, Qislas, t) {
  for (const m of T.refs) { filaNueva(S, m); S.A[m * S.n + m] = 1; }
  T.islas.forEach((isla, j) => {
    filaNueva(S, isla.fila);
    for (const { k, s } of isla.caps) { const r = T.ramas[k], C = capRama(r, t); sumar(S, isla.fila, r.ma, s * C); sumar(S, isla.fila, r.mb, -s * C); }
    S.b[isla.fila] = Qislas[j];
  });
}

// ---------------------------------------------------------------------------
// Pasos: punto de operación, Euler implícito ('be') y trapezoidal ('tr')
// ---------------------------------------------------------------------------
// Estado por rama: v (Va − Vb) e i (de a a b); V: potencial de los nodos
// unidos; t: instante del estado (la capacidad de los capacitores con perfil).

/**
 * Resuelve el circuito en t + h (o el estacionario si metodo = 'dc') a
 * partir del estado st en t. Newton–Raphson si hay bombillas.
 */
function resolverPaso(T, st, h, metodo, q, iL, Qislas = cargasIslas(T, q, metodo === 'dc')) {
  const dc = metodo === 'dc', tr = metodo === 'tr';
  const t1 = dc ? st.t : st.t + h;
  const nr = T.ramas.length, n = T.M + T.nV + (dc ? T.nLdc : 0);
  const gN = new Float64Array(nr), iN = new Float64Array(nr), guia = Float64Array.from(st.v);
  for (let it = 0; ; it++) {
    T.ramas.forEach((r, k) => {
      if (r.tipo !== 'N') return;
      const g = r.curva.dI(guia[k]); gN[k] = g; iN[k] = r.curva.I(guia[k]) - g * guia[k];
    });
    const S = nuevoSistema(n);
    T.ramas.forEach((r, k) => {
      switch (r.tipo) {
        case 'G': conductancia(S, r.ma, r.mb, r.valor); break;
        case 'V': ramaFuente(S, r.ma, r.mb, T.M + r.jv, r.valor); break;
        case 'J': corrienteFija(S, r.ma, r.mb, r.valor); break;
        case 'C': if (!dc) { const [g, ieq] = companeroC(r, st, k, h, tr); conductancia(S, r.ma, r.mb, g); corrienteFija(S, r.ma, r.mb, ieq); } break;
        case 'L':
          if (dc) { if (r.jl >= 0) ramaFuente(S, r.ma, r.mb, T.M + T.nV + r.jl, 0); else corrienteFija(S, r.ma, r.mb, iL[r.ci]); }
          else { const [g, ieq] = companeroL(r, st, k, h, tr); conductancia(S, r.ma, r.mb, g); corrienteFija(S, r.ma, r.mb, ieq); }
          break;
        case 'N': conductancia(S, r.ma, r.mb, gN[k]); corrienteFija(S, r.ma, r.mb, iN[k]); break;
        default: break;
      }
    });
    restricciones(S, T, Qislas, t1);
    const x = resolver(S, dc ? SINGULAR_DC : SINGULAR);
    if (!T.nN) return extraer(T, x, st, h, metodo, iL);
    // Newton: convergencia en el voltaje de cada bombilla (con paso limitado)
    let listo = true;
    T.ramas.forEach((r, k) => {
      if (r.tipo !== 'N') return;
      const v = (r.ma >= 0 ? x[r.ma] : 0) - (r.mb >= 0 ? x[r.mb] : 0);
      let d = v - guia[k];
      const lim = 2 * r.curva.Vn;
      if (Math.abs(d) > lim) d = Math.sign(d) * lim;
      if (Math.abs(d) > 1e-13 * r.curva.Vn + 1e-12 * Math.abs(v)) listo = false;
      guia[k] += d;
    });
    if (listo) return extraer(T, x, st, h, metodo, iL);
    if (it > 80) throw new ErrorCircuito('Newton–Raphson no converge en las bombillas: revisa sus curvas I-V.');
  }
}

/**
 * Carga total de cada isla (Σ ±q de las placas que tiene dentro) y la
 * corriente que le inyectan las fuentes de corriente. En el estacionario,
 * una fuente que inyecta en una isla no deja que se llegue al equilibrio.
 */
function cargasIslas(T, q, dc) {
  return T.islas.map(isla => {
    let Q = 0;
    for (const { k, s } of isla.caps) Q += s * q[T.ramas[k].ci];
    if (dc && inyeccionIsla(T, isla) !== 0) throw new ErrorCircuito(SINGULAR_DC);
    return Q;
  });
}
function inyeccionIsla(T, isla) {
  let inj = 0;
  for (const { k, s } of isla.fuentes) inj -= s * T.ramas[k].valor;
  return inj;
}

// Modelos compañeros: i = g·v + ieq (de a a b). Capacitor con perfil: la
// regla se aplica a la carga, q₁ = q₀ + h·(i₀ + i₁)/2 con q = C(t)·v.
function companeroC(r, st, k, h, tr) {
  if (r.perfil) {
    const q0 = capRama(r, st.t) * st.v[k], C1 = capRama(r, st.t + h);
    return tr ? [2 * C1 / h, -2 * q0 / h - st.i[k]] : [C1 / h, -q0 / h];
  }
  const g = (tr ? 2 : 1) * r.valor / h;
  return [g, tr ? -g * st.v[k] - st.i[k] : -g * st.v[k]];
}
function companeroL(r, st, k, h, tr) {
  const g = (tr ? 0.5 : 1) * h / r.valor;
  return [g, tr ? st.i[k] + g * st.v[k] : st.i[k]];
}

function extraer(T, x, st, h, metodo, iL) {
  const dc = metodo === 'dc', tr = metodo === 'tr', nr = T.ramas.length;
  const V = Float64Array.from(x.subarray(0, T.M)), v = new Float64Array(nr), i = new Float64Array(nr);
  T.ramas.forEach((r, k) => {
    const Va = r.ma >= 0 ? x[r.ma] : 0, Vb = r.mb >= 0 ? x[r.mb] : 0, d = Va - Vb;
    v[k] = d;
    switch (r.tipo) {
      case 'G': i[k] = r.valor * d; break;
      case 'V': i[k] = x[T.M + r.jv]; break;
      case 'J': i[k] = r.valor; break;
      case 'C':
        if (!dc) {
          // Un cambio de voltaje por debajo del redondeo es cero: si no, g = C/h
          // lo amplificaría en una corriente espuria que la trapezoidal no amortigua.
          // El redondeo se mide con los potenciales de los bornes: un capacitor
          // descargado entre dos nodos a 6 V tiene v = 6 − 6 ± 10⁻¹⁵ V.
          const ruido = 8 * Number.EPSILON * (Math.abs(d) + Math.abs(st.v[k]) + Math.abs(Va) + Math.abs(Vb));
          const [g, ieq] = companeroC(r, st, k, h, tr);
          if (r.perfil) {
            // Con perfil, lo mismo con la carga: un cambio de q por debajo del redondeo
            // (un capacitor aislado cuya placa se mueve) no es corriente
            const C1 = capRama(r, st.t + h), q1 = C1 * d, q0 = capRama(r, st.t) * st.v[k];
            i[k] = Math.abs(q1 - q0) <= 8 * Number.EPSILON * (Math.abs(q1) + Math.abs(q0) + C1 * (Math.abs(Va) + Math.abs(Vb))) ? (tr ? -st.i[k] : 0) : g * d + ieq;
          } else i[k] = Math.abs(d - st.v[k]) <= ruido ? g * st.v[k] + ieq : g * d + ieq;
        }
        break;
      case 'L':
        if (dc) i[k] = r.jl >= 0 ? x[T.M + T.nV + r.jl] : iL[r.ci];
        else { const [g, ieq] = companeroL(r, st, k, h, tr); i[k] = g * d + ieq; }
        break;
      case 'N': i[k] = r.curva.I(d); break;
      default: break;
    }
  });
  return { V, v, i, conK: false, t: dc ? st.t : st.t + h };
}

// Corriente de los conductores ideales: Kirchhoff sobre un árbol generador de
// cada grupo de nodos unidos (en los lazos de conductores ideales, cero).
function flujoConductores(T, st) {
  if (st.conK || !T.adyK.size) { st.conK = true; return; }
  const sale = new Float64Array(T.nR);   // corriente que tiene que salir de cada nodo por conductores ideales
  const escala = new Float64Array(T.nR); // suma de |i| que llega a cada subárbol: mide el redondeo
  T.ramas.forEach((r, k) => {
    if (r.tipo === 'K') return;
    sale[r.a] -= st.i[k]; sale[r.b] += st.i[k];
    escala[r.a] += Math.abs(st.i[k]); escala[r.b] += Math.abs(st.i[k]);
  });
  const visto = new Uint8Array(T.nR), padre = new Int32Array(T.nR), ramaPadre = new Int32Array(T.nR), orden = [];
  for (const raiz of [...T.adyK.keys()].sort((a, b) => a - b)) {
    if (visto[raiz]) continue;
    visto[raiz] = 1; const cola = [raiz];
    for (let c = 0; c < cola.length; c++) {
      const u = cola[c];
      for (const [k, w] of T.adyK.get(u)) {
        if (visto[w]) continue;
        visto[w] = 1; padre[w] = u; ramaPadre[w] = k; orden.push(w); cola.push(w);
      }
    }
  }
  for (let j = orden.length - 1; j >= 0; j--) {
    const u = orden[j], k = ramaPadre[u];
    // Lo que no supera el redondeo de las corrientes que se suman es cero
    // (el galvanómetro de un puente equilibrado marca 0, no 10⁻¹⁷ A)
    const f = Math.abs(sale[u]) <= 64 * Number.EPSILON * escala[u] ? 0 : sale[u];
    st.i[k] = (T.ramas[k].a === u ? f : -f) + 0;
    sale[padre[u]] += f; escala[padre[u]] += escala[u];
  }
  st.conK = true;
}

// ---------------------------------------------------------------------------
// Conmutación: análisis de impulso y corte de inductores
// ---------------------------------------------------------------------------

/**
 * Salto instantáneo de carga al cambiar la topología. Solo los capacitores y
 * las fuentes de voltaje admiten corrientes impulsivas (las resistencias, las
 * bombillas y los inductores, no): Kirchhoff sobre las cargas transferidas,
 * con cada capacitor como C·(v⁺ − v⁻) y cada fuente fijando su voltaje.
 * Devuelve la energía perdida (trabajo de las fuentes − ΔU de los capacitores).
 * Los capacitores con perfil usan su capacidad del instante t.
 */
function impulso(T, P, q, W, t) {
  const caps = [], fuentes = [];
  T.ramas.forEach((r, k) => { if (r.tipo === 'C') caps.push(k); else if (r.tipo === 'V') fuentes.push(k); });
  if (!caps.length) return { perdida: 0, carga: 0 };
  const idx = new Int32Array(T.M).fill(-1);
  let n = 0;
  for (const k of [...caps, ...fuentes]) for (const m of [T.ramas[k].ma, T.ramas[k].mb]) if (m >= 0 && idx[m] < 0) idx[m] = n++;
  const loc = m => (m < 0 ? -1 : idx[m]);
  const uf = crearUF(n + 1), g = m => (m < 0 ? n : idx[m]);
  for (const k of [...caps, ...fuentes]) unir(uf, g(T.ramas[k].ma), g(T.ramas[k].mb));
  const raizT = buscar(uf, n), vistos = new Set(), refs = [];
  for (let i = 0; i < n; i++) { const r = buscar(uf, i); if (r !== raizT && !vistos.has(r)) { vistos.add(r); refs.push(i); } }
  const S = nuevoSistema(n + fuentes.length);
  const Ct = caps.map(k => capRama(T.ramas[k], t));
  caps.forEach((k, j) => {
    const r = T.ramas[k];
    conductancia(S, loc(r.ma), loc(r.mb), Ct[j]);
    corrienteFija(S, loc(r.ma), loc(r.mb), -q[r.ci]);
  });
  fuentes.forEach((k, j) => { const r = T.ramas[k]; ramaFuente(S, loc(r.ma), loc(r.mb), n + j, r.valor); });
  for (const i of refs) { filaNueva(S, i); S.A[i * S.n + i] = 1; }
  const x = resolver(S, SINGULAR);
  const vn = m => (m < 0 ? 0 : x[idx[m]]);
  let qRef = 0, salto = 0;
  const nuevas = caps.map((k, j) => {
    const r = T.ramas[k], q1 = Ct[j] * (vn(r.ma) - vn(r.mb));
    qRef = Math.max(qRef, Math.abs(q[r.ci]), Math.abs(q1));
    salto = Math.max(salto, Math.abs(q1 - q[r.ci]));
    return q1;
  });
  // Un salto del orden del redondeo no es un salto: el estado ya era consistente.
  // La escala incluye la carga que pueden dar las fuentes (C·ΣE): con todos los
  // capacitores descargados, el ruido de 10⁻¹⁸ C no cuenta como conexión.
  let Vf = 0; for (const k of fuentes) Vf += Math.abs(T.ramas[k].valor);
  for (const C of Ct) qRef = Math.max(qRef, C * Vf);
  if (!(salto > 1e-12 * qRef)) return { perdida: 0, carga: 0 };
  let U0 = 0, U1 = 0, Wimp = 0;
  caps.forEach((k, j) => {
    const r = T.ramas[k];
    U0 += q[r.ci] * q[r.ci] / (2 * Ct[j]); U1 += nuevas[j] * nuevas[j] / (2 * Ct[j]);
    q[r.ci] = nuevas[j];
  });
  fuentes.forEach((k, j) => { const r = T.ramas[k], w = -r.valor * x[n + j]; W[r.ci] += w; Wimp += w; });
  return { perdida: Wimp - (U1 - U0), carga: salto };
}

/**
 * Un inductor que queda sin camino para su corriente (circuito abierto) la
 * pierde de golpe: su energía ½·L·i² se va en la chispa del contacto.
 */
function cortarInductores(T, P, iL) {
  let perdida = 0; const cortes = [];
  T.ramas.forEach((r, k) => {
    if (r.tipo !== 'L' || iL[r.ci] === 0) return;
    const uf = crearUF(T.M + 1), g = m => (m < 0 ? T.M : m);
    T.ramas.forEach((s, j) => { if (j !== k) unir(uf, g(s.ma), g(s.mb)); });
    if (buscar(uf, g(r.ma)) !== buscar(uf, g(r.mb))) {
      perdida += 0.5 * r.valor * iL[r.ci] * iL[r.ci];
      iL[r.ci] = 0; cortes.push(P.comps[r.ci].id);
    }
  });
  return { perdida, cortes };
}

// ---------------------------------------------------------------------------
// Muestras y energía
// ---------------------------------------------------------------------------
function estadoInterruptores(P) {
  return P.comps.map(c => (c.tipo === 'interruptor' ? c.cerrado : c.tipo === 'interruptor-3' ? c.posicion : null));
}

function energiaAlmacenada(P, q, iL, t = 0) {
  let U = 0;
  P.comps.forEach((c, ci) => {
    if (c.tipo === 'capacitor') U += q[ci] * q[ci] / (2 * capacidadEn(c, t));
    else if (c.tipo === 'inductor') U += 0.5 * c.L * iL[ci] * iL[ci];
  });
  return U;
}

/** Estado de las ramas en t antes de resolver: solo las variables de estado. */
function estadoRamas(T, q, iL, t = 0) {
  const nr = T.ramas.length, v = new Float64Array(nr), i = new Float64Array(nr);
  T.ramas.forEach((r, k) => {
    if (r.tipo === 'C') v[k] = q[r.ci] / capRama(r, t);
    else if (r.tipo === 'L') i[k] = iL[r.ci];
  });
  return { V: new Float64Array(T.M), v, i, conK: true, t };
}

function construirMuestra(T, P, st, t, ctx) {
  flujoConductores(T, st);
  const nC = P.comps.length, nR = P.nombres.length;
  const V = new Float64Array(nR);
  for (let k = 0; k < nR; k++) { const m = T.mDe[k]; V[k] = m < 0 ? 0 : st.V[m]; }
  const I = new Float64Array(nC), v = new Float64Array(nC), q = new Float64Array(nC), U = new Float64Array(nC);
  P.comps.forEach((c, ci) => {
    const rs = T.ramasDe[ci];
    if (c.tipo === 'tierra') return;
    if (c.tipo === 'interruptor-3') {
      const p = T.estados[ci], k = p ? 'abc'.indexOf(p) + 1 : -1;
      v[ci] = k > 0 && k < c.n.length && c.n[k] >= 0 ? V[c.n[0]] - V[c.n[k]] : 0;
    } else v[ci] = V[c.n[0]] - V[c.n[1]];
    if (!rs.length) return;
    const k0 = rs[0];
    I[ci] = (c.tipo === 'bateria' ? -st.i[k0] : st.i[k0]) + 0;   // + 0: nunca −0
    if (c.tipo === 'capacitor') { const C = capacidadEn(c, st.t); q[ci] = C * st.v[k0]; U[ci] = q[ci] * q[ci] / (2 * C); }
    else if (c.tipo === 'inductor') U[ci] = 0.5 * c.L * st.i[k0] * st.i[k0];
  });
  return { t, V, I, v, q, U, W: Float64Array.from(ctx.W), Q: Float64Array.from(ctx.Qj), perdidas: ctx.perdidas, numerico: ctx.numerico };
}

/**
 * Energía de un paso por rama (teorema de Tellegen). Trapezoidal: h·v̄·ī,
 * exacta para capacitores e inductores. Euler implícito: h·v₁·i₁; lo que
 * excede la variación de energía almacenada es disipación numérica.
 * Capacitor con perfil: la fuerza externa hace W = −½·v₀·v₁·ΔC (con la
 * trapezoidal, exactamente ΔU − h·v̄·ī).
 */
function contabilizar(T, st0, st1, h, metodo, ctx) {
  const tr = metodo === 'tr';
  T.ramas.forEach((r, k) => {
    if (r.tipo === 'K') return;
    const p = tr ? 0.25 * h * (st0.v[k] + st1.v[k]) * (st0.i[k] + st1.i[k]) : h * st1.v[k] * st1.i[k];
    switch (r.tipo) {
      case 'V': case 'J': ctx.W[r.ci] -= p; break;
      case 'G': case 'N': ctx.Qj[r.ci] += p; break;
      case 'C':
        if (r.perfil) {
          const C0 = capRama(r, st0.t), C1 = capRama(r, st1.t), v0 = st0.v[k], v1 = st1.v[k];
          const Wf = -0.5 * v0 * v1 * (C1 - C0);
          ctx.W[r.ci] += Wf;
          ctx.numerico += p + Wf - 0.5 * (C1 * v1 * v1 - C0 * v0 * v0);
        } else ctx.numerico += p - 0.5 * r.valor * (st1.v[k] * st1.v[k] - st0.v[k] * st0.v[k]);
        break;
      case 'L': ctx.numerico += p - 0.5 * r.valor * (st1.i[k] * st1.i[k] - st0.i[k] * st0.i[k]); break;
      default: break;
    }
  });
}

// ---------------------------------------------------------------------------
// Integración de un tramo entre eventos
// ---------------------------------------------------------------------------
const K_INICIAL = 20;   // primer paso tras una discontinuidad: dt·2⁻²⁰ (Euler implícito)
const K_MAX = 60;

// Error local de la trapezoidal, −h³/12·x‴, con x‴ ≈ 6 × diferencia dividida
// de tercer orden; medido en energía: Σ C·e_v² + Σ L·e_i² (J).
function errorLocal(T, hist, t1, st1) {
  const [a, b, c] = hist;
  const h = t1 - c.t;
  let e2 = 0;
  T.estadosRama.forEach((k, j) => {
    const r = T.ramas[k], x3 = r.tipo === 'C' ? st1.v[k] : st1.i[k];
    const d01 = (b.x[j] - a.x[j]) / (b.t - a.t), d12 = (c.x[j] - b.x[j]) / (c.t - b.t), d23 = (x3 - c.x[j]) / (t1 - c.t);
    const d012 = (d12 - d01) / (c.t - a.t), d123 = (d23 - d12) / (t1 - b.t);
    const lte = 0.5 * h * h * h * (d123 - d012) / (t1 - a.t);
    e2 += r.valor * lte * lte;
  });
  return e2;
}
const vectorEstado = (T, st) => T.estadosRama.map(k => (T.ramas[k].tipo === 'C' ? st.v[k] : st.i[k]));
function energiaRamas(T, st) {
  let U = 0;
  for (const k of T.estadosRama) { const r = T.ramas[k], x = r.tipo === 'C' ? st.v[k] : st.i[k]; U += 0.5 * (r.tipo === 'C' ? capRama(r, st.t) : r.valor) * x * x; }
  return U;
}

function integrarTramo(ctx, T, tIni, tFin, primero) {
  const { o, P, q, iL } = ctx, dt = o.dt;
  let st = estadoRamas(T, q, iL, tIni);
  // Carga de cada isla: variable de estado propia del tramo. Solo la cambian
  // las fuentes de corriente; así no acumula el redondeo de paso en paso.
  const Qisla = cargasIslas(T, q, false), inj = T.islas.map(isla => inyeccionIsla(T, isla));
  const cargaFinal = h => Qisla.map((Q, j) => Q + h * inj[j]);
  // Arranque: un paso pequeño de Euler implícito
  const h0 = Math.min(dt * 2 ** -K_INICIAL, tFin - tIni);
  let st1 = resolverPaso(T, st, h0, 'be', q, iL, cargaFinal(h0));
  contabilizar(T, st, st1, h0, 'be', ctx);
  Qisla.forEach((Q, j) => { Qisla[j] = Q + h0 * inj[j]; });
  let t = tIni + h0;
  const hist = [{ t: tIni, x: vectorEstado(T, st) }, { t, x: vectorEstado(T, st1) }];
  st = st1;
  if (primero) ctx.muestras.push({ ...construirMuestra(T, P, st, 0, ctx) });
  ctx.muestras.push(construirMuestra(T, P, st, t, ctx));
  let k = K_INICIAL - 1;
  const siguiente = tt => Math.min(tFin, (Math.floor(tt / dt + 1e-9) + 1) * dt);
  let tSig = siguiente(t);
  while (t < tFin - 1e-12 * dt) {
    if (++ctx.pasos > o.maxPasos) throw new ErrorCircuito('La simulación necesita demasiados pasos: alarga el intervalo entre muestras o acorta la duración.');
    // El paso cae justo en la próxima muestra; si después quedaría un resto
    // pequeño (que, con g = 2C/h enorme, arruinaría el sistema), se reparte
    const hk = dt * 2 ** -k, resto = tSig - t;
    const h = resto <= hk * (1 + 1e-6) ? resto : resto < 1.5 * hk ? resto / 2 : hk, recortado = h < hk * (1 - 1e-12);
    const cand = resolverPaso(T, st, h, 'tr', q, iL, cargaFinal(h));
    let razon = 0;
    if (hist.length >= 3 && T.estadosRama.length) {
      let Wabs = 0; for (let j = 0; j < ctx.W.length; j++) Wabs += Math.abs(ctx.W[j]);
      ctx.Eref = Math.max(ctx.Eref, energiaRamas(T, cand), Wabs);
      razon = Math.sqrt(errorLocal(T, hist, t + h, cand) / ctx.Eref) / o.tolerancia;
      if (razon > 1 && k < K_MAX) { k = Math.min(K_MAX, k + Math.max(1, Math.ceil(Math.log2(razon) / 3))); continue; }
    }
    contabilizar(T, st, cand, h, 'tr', ctx);
    Qisla.forEach((Q, j) => { Qisla[j] = Q + h * inj[j]; });
    t = h === resto ? tSig : t + h;
    st = cand; st.t = t;
    hist.push({ t, x: vectorEstado(T, st) }); if (hist.length > 3) hist.shift();
    if (!recortado && razon < 1 / 16 && k > 0) k--;
    if (t === tSig) { ctx.muestras.push(construirMuestra(T, P, st, t, ctx)); tSig = siguiente(t); }
  }
  // Variables de estado al final del tramo
  T.ramas.forEach((r, j) => { if (r.tipo === 'C') q[r.ci] = capRama(r, st.t) * st.v[j]; else if (r.tipo === 'L') iL[r.ci] = st.i[j]; });
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
function opcionesValidas(opciones) {
  const o = { ...OPCIONES_CIRCUITO, ...opciones };
  if (!(o.duracion > 0) || !Number.isFinite(o.duracion)) throw new ErrorCircuito('La duración tiene que ser positiva.');
  if (!(o.dt > 0) || o.dt > o.duracion) throw new ErrorCircuito('El intervalo entre muestras tiene que ser positivo y menor que la duración.');
  if (o.modo !== 'ideal' && o.modo !== 'realista') throw new ErrorCircuito('El modo es "ideal" o "realista".');
  if (!(o.rCable > 0)) throw new ErrorCircuito('La resistencia de los cables tiene que ser positiva.');
  if (!(o.tolerancia > 0)) throw new ErrorCircuito('La tolerancia tiene que ser positiva.');
  return o;
}

function nombreAccion(P, a) {
  const c = P.comps[a.ci];
  if (c.tipo === 'interruptor') return `${c.id} se ${a.estado ? 'cierra' : 'abre'}`;
  return a.estado ? `${c.id} pasa a la posición ${a.estado}` : `${c.id} se abre`;
}

/**
 * Estado estacionario (punto de operación) con los interruptores en su estado
 * inicial (o en `opciones.estados`, {id: estado}). Las islas conservan la carga
 * inicial de sus capacitores.
 * @param {Circuito} circuito
 * @param {OpcionesCircuito & {estados?: Record<string, any>}} [opciones]
 * @returns {MuestraCircuito & {nodos: string[], ids: string[]}}
 */
export function puntoOperacion(circuito, opciones = {}) {
  const o = { ...OPCIONES_CIRCUITO, ...opciones };
  const P = prepararCircuito(circuito);
  const estados = estadoInterruptores(P);
  for (const [id, e] of Object.entries(opciones.estados || {})) {
    const ci = P.porId.get(id);
    if (ci == null) throw new ErrorCircuito(`No hay ningún interruptor «${id}».`);
    estados[ci] = P.comps[ci].tipo === 'interruptor-3' ? posicionTres(id, e) : estadoSimple(id, e);
  }
  const { q, iL } = condicionesIniciales(P);
  const T = topologia(P, estados, o);
  const st = resolverPaso(T, estadoRamas(T, q, iL), 0, 'dc', q, iL);
  const ctx = { W: new Float64Array(P.comps.length), Qj: new Float64Array(P.comps.length), perdidas: 0, numerico: 0 };
  return { ...construirMuestra(T, P, st, 0, ctx), nodos: P.nombres.slice(), ids: P.comps.map(c => c.id) };
}

function condicionesIniciales(P) {
  const q = new Float64Array(P.comps.length), iL = new Float64Array(P.comps.length);
  P.comps.forEach((c, ci) => { if (c.tipo === 'capacitor') q[ci] = c.q0; else if (c.tipo === 'inductor') iL[ci] = c.i0; });
  return { q, iL };
}

/**
 * Simula el transitorio del circuito con sus acciones programadas.
 * @param {Circuito} circuito
 * @param {OpcionesCircuito} [opciones]
 */
export function simularCircuito(circuito, opciones = {}) {
  const o = opcionesValidas(opciones);
  const P = prepararCircuito(circuito);
  const nC = P.comps.length;
  const estados = estadoInterruptores(P);
  const { q, iL } = condicionesIniciales(P);

  // Acciones agrupadas por instante; las de t = 0 se aplican antes de empezar.
  // Los vértices de los perfiles de capacidad también cortan los tramos
  // (grupos sin acciones): ahí dC/dt salta y el paso vuelve a arrancar.
  const cortes = P.acciones.map(a => ({ t: a.t, a }));
  for (const c of P.comps) if (c.perfil) for (const [tp] of c.perfil) if (tp > 0) cortes.push({ t: tp, a: null });
  cortes.sort((x, y) => x.t - y.t || (x.a ? x.a.orden : Infinity) - (y.a ? y.a.orden : Infinity));
  const grupos = [];
  for (const { t: tc, a } of cortes) {
    if (tc >= o.duracion) continue;
    const ult = grupos[grupos.length - 1];
    if (ult && Math.abs(tc - ult.t) <= 1e-12 * o.duracion) { if (a) ult.acciones.push(a); } else grupos.push({ t: tc, acciones: a ? [a] : [] });
  }
  const aplicar = g => { for (const a of g.acciones) estados[a.ci] = a.estado; };
  const iniciales = grupos.length && grupos[0].t <= 1e-12 * o.duracion ? grupos.shift() : null;
  if (iniciales) aplicar(iniciales);

  let T = topologia(P, estados, o);
  if (o.inicio === 'estacionario') {
    const st = resolverPaso(T, estadoRamas(T, q, iL), 0, 'dc', q, iL);
    T.ramas.forEach((r, k) => { if (r.tipo === 'C') q[r.ci] = capRama(r, 0) * st.v[k]; else if (r.tipo === 'L') iL[r.ci] = st.i[k]; });
  }
  const ctx = {
    o, P, q, iL, W: new Float64Array(nC), Qj: new Float64Array(nC), perdidas: 0, numerico: 0,
    /** @type {any[]} */ muestras: [], /** @type {EventoCircuito[]} */ eventos: [], pasos: 0, Eref: 0,
  };
  const U0 = energiaAlmacenada(P, q, iL);
  // Escala de energía para el control del paso: la que pueden mover las fuentes y la almacenada
  let Vref = 0, Iref = 0, Gmax = 0;
  for (const c of P.comps) {
    if (c.tipo === 'bateria') { Vref += Math.abs(c.E); if (c.r > 0) Gmax = Math.max(Gmax, 1 / c.r); }
    if (c.tipo === 'fuente-corriente') Iref += Math.abs(c.I);
    if (c.tipo === 'resistencia' || c.tipo === 'reostato') Gmax = Math.max(Gmax, 1 / c.R);
    if (c.tipo === 'bombilla') Gmax = Math.max(Gmax, 1 / c.curvaIV.R0);
  }
  Iref += Vref * Gmax;
  P.comps.forEach((c, ci) => { if (c.tipo === 'capacitor') Vref = Math.max(Vref, Math.abs(c.q0 / c.C)); if (c.tipo === 'inductor') Iref = Math.max(Iref, Math.abs(iL[ci])); });
  P.comps.forEach((c, ci) => {
    if (c.tipo === 'capacitor') ctx.Eref += 0.5 * c.C * Vref * Vref;
    if (c.tipo === 'inductor') ctx.Eref += 0.5 * c.L * Iref * Iref;
  });
  ctx.Eref = Math.max(ctx.Eref, U0, 1e-300);

  const conmutar = (t, acciones) => {
    const imp = impulso(T, P, q, ctx.W, t), cor = cortarInductores(T, P, iL);
    const perdida = imp.perdida + cor.perdida;
    ctx.perdidas += perdida;
    if (acciones.length || imp.carga > 0 || cor.cortes.length) {
      ctx.eventos.push({
        t, nombre: acciones.length ? acciones.map(a => nombreAccion(P, a)).join(' · ') : 'Conexión inicial',
        acciones: acciones.map(a => ({ id: a.id, estado: a.estado })), perdida, carga: imp.carga, cortes: cor.cortes,
      });
    }
  };
  conmutar(0, iniciales ? iniciales.acciones : []);
  let t = 0;
  for (let j = 0; j <= grupos.length; j++) {
    const tFin = j < grupos.length ? grupos[j].t : o.duracion;
    integrarTramo(ctx, T, t, tFin, j === 0);
    t = tFin;
    if (j === grupos.length) break;
    aplicar(grupos[j]);
    T = topologia(P, estados, o);
    conmutar(t, grupos[j].acciones);
  }
  return {
    nodos: P.nombres.slice(), ids: P.comps.map(c => c.id), tipos: P.comps.map(c => c.tipo),
    componentes: P.comps.map(c => ({ ...c, curvaIV: undefined })),
    muestras: /** @type {MuestraCircuito[]} */ (ctx.muestras), eventos: ctx.eventos,
    duracion: o.duracion, dt: o.dt, modo: o.modo, U0, pasos: ctx.pasos,
  };
}

/** @typedef {ReturnType<typeof simularCircuito>} SimulacionCircuito */

/**
 * Índice de un componente en los arreglos de las muestras.
 * @param {{ids: string[]}} sim @param {string} id
 */
export function indiceDe(sim, id) {
  const i = sim.ids.indexOf(id);
  if (i < 0) throw new ErrorCircuito(`No hay ningún componente «${id}».`);
  return i;
}

/**
 * Estado interpolado linealmente en t (en un evento, el estado de justo antes).
 * @param {SimulacionCircuito} sim @param {number} t
 * @returns {MuestraCircuito}
 */
export function estadoEn(sim, t) {
  const ms = sim.muestras;
  if (t <= ms[0].t) return ms[0];
  if (t >= ms[ms.length - 1].t) return ms[ms.length - 1];
  let lo = 0, hi = ms.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ms[m].t <= t) lo = m; else hi = m; }
  const a = ms[lo], b = ms[hi], f = (t - a.t) / (b.t - a.t);
  if (f === 0) return a;
  const mezcla = (x, y) => { const r = new Float64Array(x.length); for (let i = 0; i < x.length; i++) r[i] = x[i] + (y[i] - x[i]) * f; return r; };
  return {
    t, V: mezcla(a.V, b.V), I: mezcla(a.I, b.I), v: mezcla(a.v, b.v), q: mezcla(a.q, b.q), U: mezcla(a.U, b.U),
    W: mezcla(a.W, b.W), Q: mezcla(a.Q, b.Q), perdidas: a.perdidas + (b.perdidas - a.perdidas) * f, numerico: a.numerico + (b.numerico - a.numerico) * f,
  };
}

/**
 * Registro de energía de una muestra: trabajo de las fuentes, calor, energía
 * almacenada (y su variación desde antes de empezar), pérdidas y residuo.
 * W = ΔU + Q + pérdidas + numérico + residuo, con residuo ≈ 0.
 * @param {{U0: number}} sim @param {MuestraCircuito} m
 */
export function balance(sim, m) {
  let W = 0, Q = 0, U = 0;
  for (let i = 0; i < m.W.length; i++) { W += m.W[i]; Q += m.Q[i]; U += m.U[i]; }
  const dU = U - sim.U0;
  return { W, Q, U, dU, perdidas: m.perdidas, numerico: m.numerico, residuo: W - dU - Q - m.perdidas - m.numerico };
}
