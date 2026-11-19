/* ==========================================================================
   Volta — motor de electrostática: conductores, dieléctricos y capacitores
   Soluciones exactas de dos geometrías del examen:
   1. Capacitor de placas paralelas ideal (sin efecto de borde) con capas de
      dieléctrico o de conductor entre las placas. Cada capa ocupa un tramo
      de altura y un tramo del área (una lámina metida a medias). El área se
      parte en columnas: dentro de cada una las capas van en serie y las
      columnas, en paralelo. Procesos cuasiestáticos: separar las placas,
      meter o sacar una capa de lado y conectar o desconectar la batería;
      el registro de energía (batería, agente externo, calor al reconectar)
      cierra exacto.
   2. Simetría esférica o cilíndrica: carga (o hilo) central y cáscaras
      concéntricas conductoras (aisladas con su carga, o a tierra) o
      dieléctricas. Ley de Gauss para D; cargas inducidas y de polarización
      en cada superficie; E(r), V(r) y flujo por una superficie gaussiana.
   Puro: sin DOM. Unidades SI.
   ========================================================================== */
import { EPSILON_0 } from './electrostatica.js';

export { EPSILON_0 };

// ---------------------------------------------------------------------------
// 1. Capacitor de placas paralelas con capas
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Capa
 * @property {'dielectrico'|'conductor'} tipo
 * @property {number} z0       Altura de su cara inferior sobre la placa de abajo (m)
 * @property {number} espesor  (m)
 * @property {number} [kappa=1] Permitividad relativa (dieléctrico)
 * @property {number} [a0=0]   Fracción del área donde empieza (0: borde izquierdo)
 * @property {number} [a1=1]   Fracción del área donde termina
 * @property {string} [nombre]
 */

/**
 * @typedef {Object} Capacitor
 * @property {number} S        Área de cada placa (m²)
 * @property {number} d        Separación entre placas (m)
 * @property {Capa[]} [capas]
 */

/**
 * Columnas del área: tramos [f0, f1] con las mismas capas. En cada una se
 * calcula el espesor efectivo t = Σ (espesor de vacío) + Σ espesor/κ (los
 * conductores no cuentan): su capacitancia es ε₀·S·(f1 − f0)/t.
 * Lanza un RangeError si la escena no describe un capacitor (capas que se
 * salen del hueco o se solapan, o un conductor que une las placas).
 * @param {Capacitor} cap
 * @returns {Array<{f0: number, f1: number, capas: Capa[], t: number}>}
 */
export function columnas(cap) {
  const { d } = cap, capas = cap.capas || [];
  if (!(cap.S > 0) || !(d > 0)) throw new RangeError('capacitor: el área y la separación tienen que ser positivas');
  const cortes = new Set([0, 1]);
  for (const c of capas) {
    const a0 = c.a0 ?? 0, a1 = c.a1 ?? 1;
    if (!(c.espesor >= 0) || !(c.z0 >= 0) || c.z0 + c.espesor > d * (1 + 1e-12)) throw new RangeError('capacitor: una capa se sale del hueco entre las placas');
    if (!(a0 >= 0 && a1 <= 1 && a1 >= a0)) throw new RangeError('capacitor: la fracción de área de una capa tiene que estar en [0, 1]');
    if (c.tipo === 'dielectrico' && !(c.kappa >= 1)) throw new RangeError('capacitor: la permitividad relativa tiene que ser ≥ 1');
    cortes.add(a0); cortes.add(a1);
  }
  const f = [...cortes].sort((p, q) => p - q), cols = [];
  for (let i = 0; i + 1 < f.length; i++) {
    const f0 = f[i], f1 = f[i + 1]; if (f1 - f0 <= 0) continue;
    const dentro = capas.filter(c => c.espesor > 0 && (c.a0 ?? 0) <= f0 && (c.a1 ?? 1) >= f1).sort((p, q) => p.z0 - q.z0);
    let t = d;
    for (let j = 0; j < dentro.length; j++) {
      const c = dentro[j];
      if (j > 0 && c.z0 < dentro[j - 1].z0 + dentro[j - 1].espesor - 1e-12 * d) throw new RangeError('capacitor: dos capas se solapan');
      t -= c.espesor;
      if (c.tipo === 'dielectrico') t += c.espesor / c.kappa;
    }
    if (!(t > 1e-12 * d)) throw new RangeError('capacitor: un conductor une las dos placas');
    cols.push({ f0, f1, capas: dentro, t });
  }
  return cols;
}

/**
 * Capacitancia C = Σ ε₀·S·Δf / t de las columnas en paralelo.
 * @param {Capacitor} cap
 */
export function capacitancia(cap) {
  return columnas(cap).reduce((s, c) => s + EPSILON_0 * cap.S * (c.f1 - c.f0) / c.t, 0);
}

/**
 * Estado del capacitor con un voltaje V entre las placas (la de abajo, a V
 * y con +Q; la de arriba, a 0 y con −Q). El campo apunta hacia arriba.
 * En cada columna: σ = ε₀·V/t; en el vacío E = σ/ε₀, en un dieléctrico
 * E = σ/(κ·ε₀), en un conductor E = 0; D = σ fuera de los conductores.
 * Fuerza de atracción entre las placas: F = Σ σ²·S·Δf/(2ε₀) = −∂U/∂d con Q fija.
 * @param {Capacitor} cap
 * @param {number} V (V)
 */
export function estadoCapacitor(cap, V) {
  const cols = columnas(cap), { S, d } = cap;
  let C = 0, F = 0;
  const detalle = cols.map(c => {
    const sigma = EPSILON_0 * V / c.t, A = S * (c.f1 - c.f0);
    C += EPSILON_0 * A / c.t; F += sigma * sigma * A / (2 * EPSILON_0);
    // Regiones de abajo arriba con su campo y el potencial en su base
    const regiones = [], superficies = [{ z: 0, sigma, tipo: 'placa' }, { z: d, sigma: -sigma, tipo: 'placa' }];
    let z = 0, Vz = V;
    const tramo = (z1, tipo, kappa, capa) => {
      if (z1 - z <= 0) return;
      const E = tipo === 'conductor' ? 0 : sigma / (EPSILON_0 * kappa);
      regiones.push({ z0: z, z1, tipo, kappa, E, D: tipo === 'conductor' ? 0 : sigma, V0: Vz, V1: Vz - E * (z1 - z), capa });
      Vz -= E * (z1 - z); z = z1;
    };
    for (const capa of c.capas) {
      tramo(capa.z0, 'vacio', 1);
      const k = capa.tipo === 'conductor' ? Infinity : capa.kappa;
      tramo(capa.z0 + capa.espesor, capa.tipo, k, capa);
      // Cargas en las caras: inducidas en un conductor, de polarización en un dieléctrico
      const s = capa.tipo === 'conductor' ? sigma : sigma * (1 - 1 / capa.kappa);
      superficies.push({ z: capa.z0, sigma: -s, tipo: capa.tipo === 'conductor' ? 'inducida' : 'polarizacion', capa });
      superficies.push({ z: capa.z0 + capa.espesor, sigma: s, tipo: capa.tipo === 'conductor' ? 'inducida' : 'polarizacion', capa });
    }
    tramo(d, 'vacio', 1);
    return { f0: c.f0, f1: c.f1, t: c.t, sigma, Q: sigma * A, regiones, superficies };
  });
  const Q = C * V;
  return { C, Q, V, U: 0.5 * C * V * V, F, E: detalle.length ? detalle[0].regiones[0]?.E ?? 0 : 0, columnas: detalle };
}

/**
 * @typedef {Object} AccionCapacitor
 * @property {'separar'|'insertar'|'bateria'} tipo
 * @property {number} t0  Instante en que empieza (s)
 * @property {number} [t1] Instante en que termina (s); un interruptor es instantáneo
 * @property {number} [hasta] Separación final (separar, m) o fracción final del área (insertar)
 * @property {number} [capa] Índice de la capa que se mete o se saca (insertar)
 * @property {boolean} [conectada] Estado de la batería después (bateria)
 */

/**
 * Proceso cuasiestático de un capacitor: los parámetros cambian linealmente
 * en el tiempo según las acciones y en cada instante el capacitor está en
 * equilibrio. Mientras la batería (fem V) está conectada, el voltaje es V;
 * desconectada, la carga se conserva. Al reconectar con otro voltaje la
 * carga salta y se disipa ½·C·ΔV² (como en Circuitos, modo ideal).
 * Registro de energía: W_bat = Σ V·ΔQ; W_ext = ΔU − W_bat + calor.
 * @param {{S: number, d: number, capas?: Capa[], V: number, conectada?: boolean, Q0?: number, acciones?: AccionCapacitor[]}} escena
 *   Q0: carga inicial si empieza desconectada (por defecto C₀·V: se cargó y se desconectó)
 * @param {{duracion: number}} o
 */
export function simularCapacitor(escena, o) {
  const acciones = (escena.acciones || []).map(a => ({ ...a, t1: a.tipo === 'bateria' ? a.t0 : Math.max(a.t0, a.t1 ?? a.t0) })).sort((p, q) => p.t0 - q.t0);
  const base = { S: escena.S, d: escena.d, capas: (escena.capas || []).map(c => ({ ...c })) };
  const V = escena.V, duracion = o.duracion;
  // Geometría en el instante t (sin el estado de la batería)
  const geometria = t => {
    const g = { S: base.S, d: base.d, capas: base.capas.map(c => ({ ...c })) };
    for (const a of acciones) {
      if (a.tipo === 'bateria' || t < a.t0) continue;
      const u = a.t1 > a.t0 ? Math.min(1, (t - a.t0) / (a.t1 - a.t0)) : 1;
      if (a.tipo === 'separar') {
        const desde = geometriaAntes(a).d; g.d = desde + (a.hasta - desde) * u;
      } else if (a.tipo === 'insertar') {
        const c = g.capas[a.capa]; if (!c) continue;
        const desde = geometriaAntes(a).capas[a.capa].a1 ?? 1; c.a1 = desde + (a.hasta - desde) * u;
      }
    }
    return g;
  };
  // Valor de cada parámetro justo antes de que empiece la acción a
  const cacheAntes = new Map();
  function geometriaAntes(a) {
    if (cacheAntes.has(a)) return cacheAntes.get(a);
    const previas = acciones.filter(b => b !== a && b.tipo === a.tipo && (b.tipo !== 'insertar' || b.capa === a.capa) && b.t1 <= a.t0);
    const g = { d: base.d, capas: base.capas.map(c => ({ ...c })) };
    for (const b of previas.sort((p, q) => p.t1 - q.t1)) {
      if (b.tipo === 'separar') g.d = b.hasta;
      else if (g.capas[b.capa]) g.capas[b.capa].a1 = b.hasta;
    }
    cacheAntes.set(a, g);
    return g;
  }
  // Comprobación de la geometría en los extremos de cada tramo (lineal entre ellos)
  const cortes = [...new Set([0, duracion, ...acciones.flatMap(a => [a.t0, a.t1])].filter(t => t >= 0 && t <= duracion))].sort((p, q) => p - q);
  for (const t of cortes) columnas(geometria(t));

  // Recorrido de los tramos: carga, trabajo de la batería y calor acumulados
  const C0 = capacitancia(geometria(0));
  let conectada = escena.conectada !== false;
  let Q = conectada ? C0 * V : (escena.Q0 ?? C0 * V);
  const U0 = Q * Q / (2 * C0);
  let Wbat = 0, calor = 0;
  const nodos = [{ t: 0, conectada, Q, Wbat, calor }];
  /** @type {Array<{t: number, nombre: string}>} */
  const eventos = [];
  const NOMBRES = { separar: ['Empieza a separar las placas', 'Termina de separar las placas'], insertar: ['Empieza a meter la capa', 'Termina de meter la capa'] };
  for (const a of acciones) {
    if (a.tipo === 'bateria') { if (a.t0 <= duracion) eventos.push({ t: a.t0, nombre: a.conectada ? 'Se conecta la batería' : 'Se desconecta la batería' }); continue; }
    const sacar = a.tipo === 'insertar' && a.hasta < (geometriaAntes(a).capas[a.capa]?.a1 ?? 1);
    const [n0, n1] = a.tipo === 'insertar' && sacar ? ['Empieza a sacar la capa', 'Termina de sacar la capa'] : NOMBRES[a.tipo];
    if (a.t0 <= duracion) eventos.push({ t: a.t0, nombre: n0 });
    if (a.t1 > a.t0 && a.t1 <= duracion) eventos.push({ t: a.t1, nombre: n1 });
  }
  eventos.sort((p, q) => p.t - q.t);
  const avanzar = t => {
    // hasta t sin cambios de batería
    const C = capacitancia(geometria(t));
    if (conectada) { const Qn = C * V; Wbat += V * (Qn - Q); Q = Qn; }
  };
  for (const a of acciones.filter(b => b.tipo === 'bateria' && b.t0 <= duracion)) {
    avanzar(a.t0);
    if (a.conectada && !conectada) {
      const C = capacitancia(geometria(a.t0)), Qn = C * V, Vc = Q / C;
      Wbat += V * (Qn - Q); calor += 0.5 * C * (V - Vc) ** 2; Q = Qn;
    }
    conectada = !!a.conectada;
    nodos.push({ t: a.t0, conectada, Q, Wbat, calor });
  }
  return { escena: { ...escena, acciones }, duracion, geometria, nodos, eventos, U0, C0, V };
}

/**
 * Estado del proceso en el instante t.
 * @param {ReturnType<typeof simularCapacitor>} sim
 * @param {number} t
 */
export function capacitorEn(sim, t) {
  t = Math.max(0, Math.min(sim.duracion, t));
  let n = sim.nodos[0];
  for (const m of sim.nodos) if (m.t <= t) n = m;
  const g = sim.geometria(t), C = capacitancia(g);
  let Q = n.Q, Wbat = n.Wbat;
  if (n.conectada) { const Qn = C * sim.V; Wbat += sim.V * (Qn - Q); Q = Qn; }
  const V = Q / C, est = estadoCapacitor(g, V), U = est.U;
  return { ...est, t, d: g.d, capas: g.capas, conectada: n.conectada, Wbat, calor: n.calor, Wext: U - sim.U0 - Wbat + n.calor, U };
}

// ---------------------------------------------------------------------------
// 2. Simetría esférica o cilíndrica
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} CapaRadial
 * @property {'conductor'|'dielectrico'} tipo
 * @property {number} r1   Radio interior (m)
 * @property {number} r2   Radio exterior (m)
 * @property {number} [q=0] Carga libre neta de un conductor aislado (C, o C/m en cilíndrica)
 * @property {boolean} [tierra] Conductor unido a tierra (V = 0 con referencia en el infinito; solo esférica)
 * @property {number} [kappa=1]
 * @property {string} [nombre]
 */

/**
 * @typedef {Object} SistemaRadial
 * @property {'esferica'|'cilindrica'} simetria
 * @property {number} q    Carga central (C) o densidad del hilo central (C/m)
 * @property {number} [a=0] Radio del conductor central (0: carga puntual o hilo)
 * @property {CapaRadial[]} [capas]
 * @property {number} [rRef=1] En cilíndrica, radio donde V = 0 (m)
 */

/**
 * Resuelve un sistema con simetría radial por la ley de Gauss:
 * D(r) = Q_libre(r)/(4πr²) (esférica) o λ_libre(r)/(2πr) (cilíndrica),
 * E = D/(κ·ε₀) fuera de los conductores y 0 dentro. Las cáscaras a tierra
 * toman la carga que deja su potencial en 0 (sistema lineal).
 * @param {SistemaRadial} sis
 */
export function resolverRadial(sis) {
  const esf = sis.simetria !== 'cilindrica', a = sis.a || 0, rRef = sis.rRef ?? 1;
  const capas = (sis.capas || []).map(c => ({ ...c, kappa: c.tipo === 'dielectrico' ? c.kappa ?? 1 : Infinity, q: c.q || 0 })).sort((p, q) => p.r1 - q.r1);
  for (let i = 0; i < capas.length; i++) {
    const c = capas[i];
    if (!(c.r2 > c.r1) || !(c.r1 >= a) || (i > 0 && c.r1 < capas[i - 1].r2)) throw new RangeError('radial: las cáscaras tienen que ser concéntricas, de r1 < r2 y sin solaparse');
    if (c.tipo === 'dielectrico' && !(c.kappa >= 1)) throw new RangeError('radial: la permitividad relativa tiene que ser ≥ 1');
  }
  // Factor geométrico: E·(área por unidad) = Q/(ε₀·κ·g(r)), g = 4πr² o 2πr
  const g = r => (esf ? 4 * Math.PI * r * r : 2 * Math.PI * r);
  const kappaEn = r => { for (const c of capas) if (r > c.r1 && r < c.r2) return c.kappa; return 1; };
  const conductores = capas.filter(c => c.tipo === 'conductor');
  // ∫ dr/(κ·g(r)) entre ra y rb (sin los conductores, donde E = 0)
  const prim = r => (esf ? -1 / (4 * Math.PI * r) : Math.log(r) / (2 * Math.PI));
  function integral(ra, rb) {
    if (rb <= ra) return 0;
    const bordes = [ra, rb]; for (const c of capas) bordes.push(c.r1, c.r2);
    const b = [...new Set(bordes.filter(r => r >= ra && r <= rb))].sort((p, q) => p - q);
    let s = 0;
    for (let i = 0; i + 1 < b.length; i++) {
      const k = kappaEn((b[i] + b[i + 1]) / 2); if (k === Infinity) continue;
      s += (b[i + 1] === Infinity ? (esf ? 0 : Infinity) : prim(b[i + 1])) / k - prim(b[i]) / k;
    }
    return s;
  }
  // Cargas de los conductores a tierra: V(r2) = 0 → sistema lineal
  const tierra = esf ? conductores.filter(c => c.tierra) : [];
  if (tierra.length) {
    // V(r) = (1/ε₀)·∫_r^∞ Q(r')/(κ g) dr', con Q(r') = q + Σ cargas netas de conductores con r2 < r'
    const coef = (r, rDesde) => integral(Math.max(r, rDesde), Infinity) / EPSILON_0;
    const n = tierra.length, M = tierra.map(() => new Array(n).fill(0)), b = new Array(n).fill(0);
    tierra.forEach((cj, j) => {
      const r = cj.r2;
      b[j] = -sis.q * coef(r, a > 0 ? a : 0);
      for (const ci of conductores) if (!ci.tierra) b[j] -= ci.q * coef(r, ci.r2);
      tierra.forEach((ci, i) => { M[j][i] = coef(r, ci.r2); });
    });
    const x = resolverLineal(M, b);
    tierra.forEach((c, i) => { c.q = x[i]; });
  }
  // Carga libre encerrada por una esfera (cilindro) de radio r, sin contar
  // las caras de los conductores que la cortan (dentro de uno, E = 0 igual)
  const Qcentro = r => ((a > 0 ? r > a : true) ? sis.q : 0) + conductores.filter(c => c.r2 < r).reduce((s, c) => s + c.q, 0);
  const E = r => {
    if (r <= 0) return NaN;
    for (const c of conductores) if (r > c.r1 && r < c.r2) return 0;
    if (a > 0 && r < a) return 0;
    return Qcentro(r) / (EPSILON_0 * kappaEn(r) * g(r));
  };
  const D = r => (E(r) === 0 ? 0 : Qcentro(r) / g(r));
  // Potencial: referencia en el infinito (esférica) o en rRef (cilíndrica)
  function V(r) {
    const bordes = [...new Set([a, ...capas.flatMap(c => [c.r1, c.r2])].filter(x => x > 0))].sort((p, q) => p - q);
    const integra = (r0, r1) => {           // ∫_{r0}^{r1} E dr con E por tramos
      const lo = Math.min(r0, r1), hi = Math.max(r0, r1), sg = r1 >= r0 ? 1 : -1;
      const b = [lo, ...bordes.filter(x => x > lo && x < hi), hi];
      let s = 0;
      for (let i = 0; i + 1 < b.length; i++) {
        const m = b[i + 1] === Infinity ? 2 * b[i] + 1 : (b[i] + b[i + 1]) / 2;
        if (E(m) === 0) continue;
        const k = kappaEn(m), Q = Qcentro(m);
        s += Q / (EPSILON_0 * k) * ((b[i + 1] === Infinity ? (esf ? 0 : Infinity) : prim(b[i + 1])) - prim(b[i]));
      }
      return sg * s;
    };
    if (a > 0 && r < a) r = a;
    return esf ? integra(r, Infinity) : -integra(rRef, r);
  }
  // Superficies con su carga total (libre + inducida o de polarización)
  /** @type {Array<{r: number, q: number, tipo: 'central'|'inducida'|'polarizacion', capa?: object}>} */
  const superficies = [];
  if (a > 0) superficies.push({ r: a, q: sis.q, tipo: 'central' });
  for (const c of capas) {
    const dentro = Qcentro(c.r1 * (1 - 1e-12));
    if (c.tipo === 'conductor') {
      superficies.push({ r: c.r1, q: -dentro, tipo: 'inducida', capa: c });
      superficies.push({ r: c.r2, q: c.q + dentro, tipo: 'inducida', capa: c });
    } else {
      const p = dentro * (1 - 1 / c.kappa);
      superficies.push({ r: c.r1, q: -p, tipo: 'polarizacion', capa: c });
      superficies.push({ r: c.r2, q: p, tipo: 'polarizacion', capa: c });
    }
  }
  // Carga total (libre y ligada) encerrada, contada de las superficies
  const Qtotal = r => (a > 0 ? 0 : (r > 0 ? sis.q : 0)) + superficies.filter(s => s.r < r).reduce((t, s) => t + s.q, 0);
  return { simetria: esf ? 'esferica' : 'cilindrica', a, q: sis.q, capas, E, D, V, superficies, Qlibre: Qcentro, Qtotal, kappaEn, rRef };
}

/**
 * Flujo de E y de D por la superficie gaussiana de radio r (esfera, o
 * cilindro coaxial de largo L en simetría cilíndrica), calculado como
 * campo × área; por la ley de Gauss vale Q_total/ε₀ y Q_libre.
 * @param {ReturnType<typeof resolverRadial>} sol
 * @param {number} r
 * @param {number} [L=1]
 */
export function flujoRadial(sol, r, L = 1) {
  const area = sol.simetria === 'esferica' ? 4 * Math.PI * r * r : 2 * Math.PI * r * L;
  return { E: sol.E(r) * area, D: sol.D(r) * area };
}

/**
 * Energía del campo ½∫D·E dV entre r0 y r1 (por unidad de largo en
 * cilíndrica), por tramos con Q y κ constantes: esférica Q²/(8πε₀κ)·(1/ra − 1/rb),
 * cilíndrica λ²/(4πε₀κ)·ln(rb/ra).
 * @param {ReturnType<typeof resolverRadial>} sol
 * @param {number} r0 @param {number} r1
 */
export function energiaRadial(sol, r0, r1) {
  const bordes = [...new Set([r0, r1, sol.a, ...sol.capas.flatMap(c => [c.r1, c.r2])].filter(x => x >= r0 && x <= r1 && x > 0))].sort((p, q) => p - q);
  let U = 0;
  for (let i = 0; i + 1 < bordes.length; i++) {
    const ra = bordes[i], rb = bordes[i + 1], m = rb === Infinity ? 2 * ra : (ra + rb) / 2;
    if (sol.E(m) === 0) continue;
    const Q = sol.Qlibre(m), k = sol.kappaEn(m);
    if (sol.simetria === 'esferica') U += Q * Q / (8 * Math.PI * EPSILON_0 * k) * (1 / ra - (rb === Infinity ? 0 : 1 / rb));
    else U += Q * Q / (4 * Math.PI * EPSILON_0 * k) * Math.log(rb / ra);
  }
  return U;
}

// Gauss con pivoteo parcial para los sistemas pequeños de los conductores a tierra
function resolverLineal(M, b) {
  const n = b.length, A = M.map((f, i) => [...f, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let i = c + 1; i < n; i++) if (Math.abs(A[i][c]) > Math.abs(A[p][c])) p = i;
    [A[c], A[p]] = [A[p], A[c]];
    if (A[c][c] === 0) throw new RangeError('radial: no se puede fijar el potencial de los conductores a tierra');
    for (let i = c + 1; i < n; i++) { const f = A[i][c] / A[c][c]; for (let j = c; j <= n; j++) A[i][j] -= f * A[c][j]; }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = A[i][n]; for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; }
  return x;
}
