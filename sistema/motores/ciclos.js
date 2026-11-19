/* ==========================================================================
   Volta — motor de procesos y ciclos (Termodinámica · Ciclos y diagrama P-V)
   Procesos guiados de un gas ideal en estados de equilibrio (cuasiestáticos):
   isobárico, isocórico, isotérmico, adiabático reversible y recta en el
   diagrama P-V. Un ciclo es una lista de tramos que parte de un estado
   inicial; cada tramo termina en un volumen, una presión o una temperatura
   dados, en un estado ya nombrado (cierra el ciclo) o donde corta a la
   isoterma, la adiabática, la isobara o la isócora de otro estado (así un
   ciclo de Carnot cierra para cualquier par de temperaturas).
   Por tramo: Q, W y ΔU exactos (fórmulas cerradas), ΔS, y el calor absorbido
   y cedido por separado (en una recta del diagrama P-V el calor puede cambiar
   de signo a mitad del tramo). Por ciclo: trabajo neto, calor absorbido,
   rendimiento W/Q_abs y el de Carnot entre la temperatura máxima y la mínima.
   Convenio: Q es el calor que recibe el gas, W el trabajo que hace el gas,
   ΔU = Q − W.
   Puro: sin DOM. Lo usan la pantalla «Ciclos y diagrama P-V» y las pruebas.
   ========================================================================== */
import { R_GAS } from './gas.js';

/** Grados de libertad de cada especie (U = f/2·nRT). */
export const GRADOS = Object.freeze({ mono: 3, di: 5, tri: 6 });

/** Tipos de tramo que entiende el motor. */
export const TIPOS_TRAMO = Object.freeze(['isobarico', 'isocorico', 'isotermico', 'adiabatico', 'recta']);

/** Nombre legible de cada tipo de tramo. */
export const NOMBRES_TRAMO = Object.freeze({
  isobarico: 'Isobárico', isocorico: 'Isocórico', isotermico: 'Isotérmico', adiabatico: 'Adiabático', recta: 'Recta en P-V',
});

/** @typedef {'isobarico'|'isocorico'|'isotermico'|'adiabatico'|'recta'} TipoTramo */
/** @typedef {'isobarico'|'isocorico'|'isotermico'|'adiabatico'} TipoCurva */

/**
 * Un tramo del ciclo. El final se da con V, P o T (según el tipo), con
 * `hasta` (un estado ya nombrado) o con `corta` (la curva de otro estado).
 * @typedef {Object} Tramo
 * @property {TipoTramo} tipo
 * @property {number} [V]  Volumen final (m³)
 * @property {number} [P]  Presión final (Pa)
 * @property {number} [T]  Temperatura final (K)
 * @property {string} [hasta]  Estado ya definido en el que termina
 * @property {{tipo: TipoCurva, estado: string}} [corta]  Termina donde corta esa curva del estado
 * @property {string} [desde]  Estado de partida (por omisión, el final del tramo anterior)
 * @property {string} [nombre] Nombre del estado final (por omisión, la letra siguiente)
 * @property {number} [duracion] Duración de la animación del tramo (s)
 */

/**
 * @typedef {Object} EscenaCiclo
 * @property {number} n  Cantidad de gas (mol)
 * @property {number} [f]  Grados de libertad; por omisión 3 (monoatómico)
 * @property {{P?: number, V?: number, T?: number, nombre?: string}} inicio  Dos de P, V, T
 * @property {Tramo[]} tramos
 * @property {number} [duracionTramo=2]  Duración de cada tramo en la animación (s)
 */

/** @typedef {{nombre: string, P: number, V: number, T: number, U: number, S: number}} EstadoGas */
/** @typedef {{n: number, f: number, cv: number, cp: number, gam: number}} GasIdeal */

/**
 * Gas ideal de la escena: cantidad, grados de libertad y capacidades molares.
 * @param {{n: number, f?: number}} e
 * @returns {GasIdeal}
 */
export function gasIdeal(e) {
  const n = e.n, f = e.f ?? GRADOS.mono;
  if (!(n > 0) || !Number.isFinite(n)) throw new Error('La cantidad de gas tiene que ser positiva.');
  if (!(f > 0) || !Number.isFinite(f)) throw new Error('Los grados de libertad tienen que ser positivos.');
  const cv = f / 2 * R_GAS;
  return { n, f, cv, cp: cv + R_GAS, gam: (f + 2) / f };
}

/** Rendimiento de Carnot entre dos focos (K). */
export const rendimientoCarnot = (Tc, Th) => 1 - Tc / Th;
/** Rendimiento del ciclo Otto ideal con razón de compresión r. */
export const rendimientoOtto = (r, gam) => 1 - r ** (1 - gam);

const cerca = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b));
const positivo = x => Number.isFinite(x) && x > 0;

/** Constante de la curva de cada tipo que pasa por el estado (P, V). */
function constante(tipo, P, V, gam) {
  return tipo === 'isobarico' ? P : tipo === 'isocorico' ? V : tipo === 'isotermico' ? P * V : P * V ** gam;
}

/**
 * Corte de la curva del proceso que sale de a con la curva `tipoB` del
 * estado b. Devuelve el punto o null si no se cortan (curvas paralelas).
 * @param {TipoTramo} tipoA @param {{P: number, V: number}} a
 * @param {TipoCurva} tipoB @param {{P: number, V: number}} b @param {number} gam
 */
function corte(tipoA, a, tipoB, b, gam) {
  const ka = constante(tipoA, a.P, a.V, gam), kb = constante(tipoB, b.P, b.V, gam);
  const conV = V => ({ V, P: tipoA === 'isobarico' ? ka : tipoA === 'isotermico' ? ka / V : ka / V ** gam });
  if (tipoA === tipoB) return null;
  if (tipoA === 'isocorico') {
    const V = ka;
    return { V, P: tipoB === 'isobarico' ? kb : tipoB === 'isotermico' ? kb / V : kb / V ** gam };
  }
  if (tipoB === 'isocorico') return conV(kb);
  if (tipoA === 'isobarico') return conV(tipoB === 'isotermico' ? kb / ka : (kb / ka) ** (1 / gam));
  if (tipoA === 'isotermico') return conV(tipoB === 'isobarico' ? ka / kb : (kb / ka) ** (1 / (gam - 1)));
  // adiabático
  return conV(tipoB === 'isobarico' ? (ka / kb) ** (1 / gam) : (ka / kb) ** (1 / (gam - 1)));
}

/** ¿Puede un proceso de este tipo unir a con b? */
function compatible(tipo, a, b, gam) {
  if (tipo === 'recta') return true;
  return cerca(constante(tipo, a.P, a.V, gam), constante(tipo, b.P, b.V, gam), 1e-7);
}

const NOMBRE_CURVA = { isobarico: 'isobara', isocorico: 'isócora', isotermico: 'isoterma', adiabatico: 'adiabática' };

/**
 * Estado final de un tramo que sale de a.
 * @param {GasIdeal} g @param {{P: number, V: number}} a @param {Tramo} tr
 * @param {Record<string, EstadoGas>} estados
 * @returns {{P: number, V: number}}
 */
export function finTramo(g, a, tr, estados) {
  const nR = g.n * R_GAS;
  if (!TIPOS_TRAMO.includes(tr.tipo)) throw new Error(`Tipo de tramo desconocido: ${tr.tipo}`);
  if (tr.hasta != null) {
    const e = estados[tr.hasta];
    if (!e) throw new Error(`El tramo termina en «${tr.hasta}», que no es un estado anterior.`);
    if (!compatible(tr.tipo, a, e, g.gam)) throw new Error(`Un proceso ${NOMBRES_TRAMO[tr.tipo].toLowerCase()} no llega al estado ${tr.hasta}.`);
    return { P: e.P, V: e.V };
  }
  let P = NaN, V = NaN;
  if (tr.corta) {
    if (tr.tipo === 'recta') throw new Error('Una recta en el diagrama P-V necesita su punto final (V y P).');
    const e = estados[tr.corta.estado];
    if (!e) throw new Error(`El tramo busca la ${NOMBRE_CURVA[tr.corta.tipo] || 'curva'} de «${tr.corta.estado}», que no es un estado anterior.`);
    const c = corte(tr.tipo, a, tr.corta.tipo, e, g.gam);
    if (!c) throw new Error(`El proceso ${NOMBRES_TRAMO[tr.tipo].toLowerCase()} no corta a la ${NOMBRE_CURVA[tr.corta.tipo]} de ${tr.corta.estado}.`);
    ({ P, V } = c);
  } else {
    const Ta = a.P * a.V / nR;
    switch (tr.tipo) {
      case 'isobarico': P = a.P; V = tr.V ?? (tr.T != null ? nR * tr.T / P : NaN); break;
      case 'isocorico': V = a.V; P = tr.P ?? (tr.T != null ? nR * tr.T / V : NaN); break;
      case 'isotermico':
        if (tr.V != null) { V = tr.V; P = a.P * a.V / V; } else if (tr.P != null) { P = tr.P; V = a.P * a.V / P; }
        break;
      case 'adiabatico': {
        const K = a.P * a.V ** g.gam;
        if (tr.V != null) { V = tr.V; P = K / V ** g.gam; }
        else if (tr.P != null) { P = tr.P; V = (K / P) ** (1 / g.gam); }
        else if (tr.T != null) { V = a.V * (Ta / tr.T) ** (1 / (g.gam - 1)); P = nR * tr.T / V; }
        break;
      }
      case 'recta':
        P = tr.P ?? (tr.T != null && tr.V != null ? nR * tr.T / tr.V : NaN);
        V = tr.V ?? (tr.T != null && tr.P != null ? nR * tr.T / tr.P : NaN);
        break;
      default: break;
    }
  }
  if (!positivo(P) || !positivo(V)) throw new Error(`El tramo ${NOMBRES_TRAMO[tr.tipo].toLowerCase()} no llega a un estado con presión y volumen positivos.`);
  return { P, V };
}

/**
 * Punto del tramo a → b en la fracción s ∈ [0, 1] del recorrido.
 * @param {GasIdeal} g @param {TipoTramo} tipo
 * @param {{P: number, V: number}} a @param {{P: number, V: number}} b @param {number} s
 */
export function puntoTramo(g, tipo, a, b, s) {
  if (tipo === 'isocorico' || (tipo === 'recta' && a.V === b.V)) return { V: a.V, P: a.P + s * (b.P - a.P) };
  const V = a.V + s * (b.V - a.V);
  if (tipo === 'isobarico') return { V, P: a.P };
  if (tipo === 'isotermico') return { V, P: a.P * a.V / V };
  if (tipo === 'adiabatico') return { V, P: a.P * (a.V / V) ** g.gam };
  return { V, P: a.P + s * (b.P - a.P) };
}

/**
 * Energía del proceso desde a hasta p (un punto del mismo tramo): calor Q
 * recibido, trabajo W hecho por el gas, ΔU y ΔS. Fórmulas exactas.
 * @param {GasIdeal} g @param {TipoTramo} tipo
 * @param {{P: number, V: number}} a @param {{P: number, V: number}} p
 */
export function energiaTramo(g, tipo, a, p) {
  const k = g.f / 2;
  const dU = tipo === 'isotermico' ? 0 : k * (p.P * p.V - a.P * a.V);
  let W;
  switch (tipo) {
    case 'isobarico': W = a.P * (p.V - a.V); break;
    case 'isocorico': W = 0; break;
    case 'isotermico': W = a.P * a.V * Math.log(p.V / a.V); break;
    case 'adiabatico': W = (a.P * a.V - p.P * p.V) / (g.gam - 1); break;
    default: W = 0.5 * (a.P + p.P) * (p.V - a.V); break;
  }
  const Q = tipo === 'adiabatico' ? 0 : dU + W;
  const dS = tipo === 'adiabatico' ? 0 : g.n * R_GAS * (k * Math.log((p.P * p.V) / (a.P * a.V)) + Math.log(p.V / a.V));
  return { Q, W, dU, dS };
}

/**
 * Calor absorbido y cedido por separado entre a y p. En una recta inclinada
 * del diagrama P-V, dQ/dV = (f/2 + 1)·P + (f/2)·V·dP/dV es lineal en V y puede
 * cambiar de signo dentro del tramo; en los demás procesos el signo es único.
 * @param {GasIdeal} g @param {TipoTramo} tipo
 * @param {{P: number, V: number}} a @param {{P: number, V: number}} p
 */
export function repartoCalor(g, tipo, a, p) {
  const { Q } = energiaTramo(g, tipo, a, p);
  if (tipo !== 'recta' || a.V === p.V || a.P === p.P) return { abs: Math.max(0, Q), ced: Math.max(0, -Q) };
  const k = g.f / 2, b = (p.P - a.P) / (p.V - a.V);
  const c0 = (k + 1) * (a.P - b * a.V), c1 = (2 * k + 1) * b;
  const integral = (V1, V2) => c0 * (V2 - V1) + 0.5 * c1 * (V2 * V2 - V1 * V1);
  const Vc = -c0 / c1, lo = Math.min(a.V, p.V), hi = Math.max(a.V, p.V);
  const partes = Vc > lo && Vc < hi ? [integral(a.V, Vc), integral(Vc, p.V)] : [Q];
  let abs = 0, ced = 0;
  for (const q of partes) { if (q > 0) abs += q; else ced -= q; }
  return { abs, ced };
}

/**
 * Estado completo (P, V, T, U, S) de un punto del diagrama. S es relativa al
 * estado de referencia (P0, V0): S = n·Cv·ln(T/T0) + n·R·ln(V/V0).
 * @param {GasIdeal} g @param {string} nombre @param {number} P @param {number} V
 * @param {{P: number, V: number}} ref
 * @returns {EstadoGas}
 */
function estadoGas(g, nombre, P, V, ref) {
  const nR = g.n * R_GAS, T = P * V / nR;
  return { nombre, P, V, T, U: g.f / 2 * P * V, S: nR * (g.f / 2 * Math.log((P * V) / (ref.P * ref.V)) + Math.log(V / ref.V)) };
}

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Resuelve el ciclo: estados, tramos con su energía y totales.
 * Lanza un Error con un mensaje claro si la escena no describe procesos
 * posibles (estados con P o V no positivos, tramos que no llegan a su estado).
 * @param {EscenaCiclo} esc
 */
export function simularCiclo(esc) {
  const g = gasIdeal(esc);
  const nR = g.n * R_GAS, ini = esc.inicio || {};
  let { P, V } = ini;
  if (P == null && ini.T != null && V != null) P = nR * ini.T / V;
  if (V == null && ini.T != null && P != null) V = nR * ini.T / P;
  if (!positivo(P) || !positivo(V)) throw new Error('El estado inicial necesita dos de P, V y T, positivos.');
  const ref = { P, V };
  const nombre0 = ini.nombre || 'A';
  /** @type {Record<string, EstadoGas>} */
  const estados = { [nombre0]: estadoGas(g, nombre0, P, V, ref) };
  const orden = [nombre0];
  const durBase = esc.duracionTramo ?? 2;
  let actual = nombre0, t = 0;
  const tramos = [];
  for (const tr of esc.tramos || []) {
    const desde = tr.desde ?? actual;
    const a = estados[desde];
    if (!a) throw new Error(`El tramo sale de «${desde}», que no es un estado anterior.`);
    const fin = finTramo(g, a, tr, estados);
    let nombre = tr.hasta;
    if (nombre == null) {
      nombre = tr.nombre && !estados[tr.nombre] ? tr.nombre : [...LETRAS].find(l => !estados[l]) || `E${orden.length}`;
      estados[nombre] = estadoGas(g, nombre, fin.P, fin.V, ref);
      orden.push(nombre);
    }
    const b = estados[nombre], dur = tr.duracion ?? durBase;
    const e = energiaTramo(g, tr.tipo, a, b), r = repartoCalor(g, tr.tipo, a, b);
    tramos.push({ tipo: tr.tipo, desde, hasta: nombre, a, b, t0: t, t1: t + dur, ...e, Qabs: r.abs, Qced: r.ced });
    t += dur; actual = nombre;
  }
  const suma = k => tramos.reduce((s, x) => s + x[k], 0);
  const total = { Q: suma('Q'), W: suma('W'), dU: suma('dU'), dS: suma('dS'), Qabs: suma('Qabs'), Qced: suma('Qced') };
  const ultimo = estados[actual], primero = estados[nombre0];
  const ciclo = tramos.length > 1 && cerca(ultimo.P, primero.P, 1e-9) && cerca(ultimo.V, primero.V, 1e-9);
  // Temperaturas extremas a lo largo de todo el recorrido (en una recta la
  // temperatura máxima puede estar a mitad del tramo)
  let Tmin = Infinity, Tmax = -Infinity;
  for (const x of tramos) for (let i = 0; i <= 200; i++) {
    const p = puntoTramo(g, x.tipo, x.a, x.b, i / 200), T = p.P * p.V / nR;
    if (T < Tmin) Tmin = T; if (T > Tmax) Tmax = T;
  }
  if (!tramos.length) Tmin = Tmax = primero.T;
  const motor = ciclo && total.W > 0 && total.Qabs > 0;
  return {
    gas: g, estados, orden, tramos, total, ciclo, inicio: nombre0, final: actual,
    rendimiento: motor ? total.W / total.Qabs : null,
    carnot: Tmax > Tmin ? rendimientoCarnot(Tmin, Tmax) : 0,
    Tmin, Tmax, duracion: t, ref,
  };
}

/**
 * Estado del gas en el instante t de la animación del ciclo, con la energía
 * acumulada desde el principio y la del tramo en curso.
 * @param {ReturnType<typeof simularCiclo>} sim @param {number} t
 */
export function estadoCiclo(sim, t) {
  const g = sim.gas, nR = g.n * R_GAS, trs = sim.tramos;
  if (!trs.length) { const e = sim.estados[sim.inicio]; return { t: 0, k: -1, s: 0, P: e.P, V: e.V, T: e.T, U: e.U, S: 0, Q: 0, W: 0, dU: 0, dS: 0, Qabs: 0, Qced: 0, tramo: { Q: 0, W: 0, dU: 0, dS: 0 } }; }
  const tt = Math.max(0, Math.min(sim.duracion, t));
  let k = trs.findIndex(x => tt <= x.t1 + 1e-12);
  if (k < 0) k = trs.length - 1;
  const x = trs[k], s = x.t1 > x.t0 ? (tt - x.t0) / (x.t1 - x.t0) : 1;
  const p = s >= 1 ? x.b : puntoTramo(g, x.tipo, x.a, x.b, s);
  const e = energiaTramo(g, x.tipo, x.a, p), r = repartoCalor(g, x.tipo, x.a, p);
  const acum = { Q: e.Q, W: e.W, dU: e.dU, dS: e.dS, Qabs: r.abs, Qced: r.ced };
  for (let i = 0; i < k; i++) for (const c of Object.keys(acum)) acum[c] += trs[i][c];
  const est = estadoGas(g, '', p.P, p.V, sim.ref);
  return { t: tt, k, s, P: p.P, V: p.V, T: p.P * p.V / nR, U: est.U, S: est.S, ...acum, tramo: e };
}

/**
 * Curva de un tramo como [[V, P], …] para dibujarla.
 * @param {ReturnType<typeof simularCiclo>} sim @param {number} i @param {number} [puntos=64]
 */
export function curvaTramo(sim, i, puntos = 64) {
  const x = sim.tramos[i], g = sim.gas, pts = [];
  const N = x.tipo === 'isotermico' || x.tipo === 'adiabatico' ? puntos : 1;
  for (let j = 0; j <= N; j++) { const p = puntoTramo(g, x.tipo, x.a, x.b, j / N); pts.push([p.V, p.P]); }
  return pts;
}

// ---------------------------------------------------------------------------
// Ciclos clásicos
// ---------------------------------------------------------------------------

/**
 * Ciclo de Carnot: A (V1, Th) → B isoterma hasta V2 → C adiabática hasta Tc →
 * D isoterma hasta la adiabática de A → A adiabática.
 * @param {{n?: number, f?: number, Th: number, Tc: number, V1: number, V2: number}} p
 * @returns {EscenaCiclo}
 */
export function cicloCarnot({ n = 1, f = GRADOS.mono, Th, Tc, V1, V2 }) {
  return {
    n, f, inicio: { V: V1, T: Th, nombre: 'A' },
    tramos: [
      { tipo: 'isotermico', V: V2, nombre: 'B' },
      { tipo: 'adiabatico', T: Tc, nombre: 'C' },
      { tipo: 'isotermico', corta: { tipo: 'adiabatico', estado: 'A' }, nombre: 'D' },
      { tipo: 'adiabatico', hasta: 'A' },
    ],
  };
}

/**
 * Ciclo Otto ideal: A (V1, T1) → B compresión adiabática hasta V1/r → C
 * calentamiento isocórico hasta T3 → D expansión adiabática hasta V1 → A
 * enfriamiento isocórico.
 * @param {{n?: number, f?: number, V1: number, r: number, T1: number, T3: number}} p
 * @returns {EscenaCiclo}
 */
export function cicloOtto({ n = 1, f = GRADOS.di, V1, r, T1, T3 }) {
  return {
    n, f, inicio: { V: V1, T: T1, nombre: 'A' },
    tramos: [
      { tipo: 'adiabatico', V: V1 / r, nombre: 'B' },
      { tipo: 'isocorico', T: T3, nombre: 'C' },
      { tipo: 'adiabatico', V: V1, nombre: 'D' },
      { tipo: 'isocorico', hasta: 'A' },
    ],
  };
}

/**
 * Ciclo rectangular en el diagrama P-V recorrido en sentido horario:
 * A (V1, P1) → B isocórico hasta P2 → C isobárico hasta V2 → D isocórico
 * hasta P1 → A isobárico.
 * @param {{n?: number, f?: number, P1: number, P2: number, V1: number, V2: number}} p
 * @returns {EscenaCiclo}
 */
export function cicloRectangular({ n = 1, f = GRADOS.mono, P1, P2, V1, V2 }) {
  return {
    n, f, inicio: { P: P1, V: V1, nombre: 'A' },
    tramos: [
      { tipo: 'isocorico', P: P2, nombre: 'B' },
      { tipo: 'isobarico', V: V2, nombre: 'C' },
      { tipo: 'isocorico', P: P1, nombre: 'D' },
      { tipo: 'isobarico', hasta: 'A' },
    ],
  };
}
