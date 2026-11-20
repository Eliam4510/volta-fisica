// Exactitud física del motor de circuitos contra soluciones analíticas:
// corriente continua (Ohm, serie y paralelo, divisor, puente de Wheatstone),
// transitorios RC, LC y RLC, reparto de carga entre capacitores, MEXT 2023 P2,
// MEXT 2019 P2 y MEXT 2027 1-(3), conservación de la carga en islas, bombilla
// no lineal con recta de carga, registro de energía, determinismo y
// capacitores cuya capacidad cambia en el tiempo (placa o dieléctrico que se
// mueve). Las demás escenas MEXT, en pruebas/circuitos-mext.test.js.
import { describe, it, expect } from 'vitest';
import {
  simularCircuito, puntoOperacion, estadoEn, balance, indiceDe, curvaBombilla, capacidadEn,
  ErrorCircuito, OPCIONES_CIRCUITO, TIPOS_COMPONENTE,
} from '../sistema/motores/circuitos.js';

// |a − b| ≤ rel·|b| + abs
const cerca = (a, b, rel = 1e-12, abs = 0) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.abs(b) + abs);
const ultima = sim => sim.muestras[sim.muestras.length - 1];
const PRECISO = { tolerancia: 1e-9 };

// Comprueba que el balance de energía cierra en todas las muestras
function balanceCierra(sim, rel = 1e-12) {
  let escala = 0;
  for (const m of sim.muestras) { const b = balance(sim, m); escala = Math.max(escala, Math.abs(b.W), Math.abs(b.U), sim.U0); }
  for (const m of sim.muestras) expect(Math.abs(balance(sim, m).residuo)).toBeLessThanOrEqual(rel * escala);
}

// ---------------------------------------------------------------------------
// Circuitos de prueba
// ---------------------------------------------------------------------------
// Carga RC: E — S — R — C — tierra
const circuitoRC = ({ E = 6, R = 2000, C = 500e-6, t0 = 0.5 } = {}) => ({
  componentes: [
    { id: 'E', tipo: 'bateria', nodos: ['p', '0'], E },
    { id: 'S', tipo: 'interruptor', nodos: ['p', 'a'] },
    { id: 'R', tipo: 'resistencia', nodos: ['a', 'b'], R },
    { id: 'C', tipo: 'capacitor', nodos: ['b', '0'], C },
    { id: 'T', tipo: 'tierra', nodos: ['0'] },
  ],
  acciones: [{ t: t0, id: 'S', estado: true }],
});

// MEXT 2023 P2: tres capacitores iguales, una batería y dos interruptores.
// B: borne superior de C1; A: entre C1 y C2; C3 se une a A con S2.
const circuito2023 = ({ V = 12, C = 1e-3 } = {}) => ({
  componentes: [
    { id: 'E', tipo: 'bateria', nodos: ['p', 'g'], E: V },
    { id: 'S1', tipo: 'interruptor', nodos: ['p', 'B'] },
    { id: 'C1', tipo: 'capacitor', nodos: ['B', 'A'], C },
    { id: 'C2', tipo: 'capacitor', nodos: ['A', 'g'], C },
    { id: 'S2', tipo: 'interruptor', nodos: ['A', 'x'] },
    { id: 'C3', tipo: 'capacitor', nodos: ['x', 'g'], C },
    { id: 'T', tipo: 'tierra', nodos: ['g'] },
  ],
  acciones: [
    { t: 1, id: 'S1', estado: true },    // (1) se cierra S1 y C1, C2 se cargan
    { t: 2, id: 'S1', estado: false },   // (3) se abre S1…
    { t: 3, id: 'S2', estado: true },    //     … y se cierra S2
    { t: 4, id: 'S2', estado: false },   // (5) se abre S2…
    { t: 5, id: 'S1', estado: true },    //     … y se cierra S1
  ],
});

// MEXT 2019 P2: R y la batería en la posición a, C en el común, L en la c
const circuito2019 = ({ V = 10, R = 1000, C = 1e-3, L = 100, ta = 0.5, tc = 9 } = {}) => ({
  componentes: [
    { id: 'E', tipo: 'bateria', nodos: ['p', 'g'], E: V },
    { id: 'R', tipo: 'resistencia', nodos: ['p', 'a'], R },
    { id: 'S', tipo: 'interruptor-3', nodos: ['k', 'a', 'b', 'c'], posicion: 'b' },
    { id: 'C', tipo: 'capacitor', nodos: ['k', 'g'], C },
    { id: 'L', tipo: 'inductor', nodos: ['c', 'g'], L },
    { id: 'T', tipo: 'tierra', nodos: ['g'] },
  ],
  acciones: [{ t: ta, id: 'S', estado: 'a' }, { t: tc, id: 'S', estado: 'c' }],
});

// MEXT 2027 1-(3): puente de 10 Ω, R, 20 Ω y 30 Ω con el interruptor S en el centro
const puente = (R, cerrado = true) => ({
  componentes: [
    { id: 'E', tipo: 'bateria', nodos: ['izq', 'der'], E: 6 },
    { id: 'R1', tipo: 'resistencia', nodos: ['izq', 'arr'], R: 10 },
    { id: 'R', tipo: 'resistencia', nodos: ['arr', 'der'], R },
    { id: 'R3', tipo: 'resistencia', nodos: ['izq', 'aba'], R: 20 },
    { id: 'R4', tipo: 'resistencia', nodos: ['aba', 'der'], R: 30 },
    { id: 'S', tipo: 'interruptor', nodos: ['arr', 'aba'], cerrado },
    { id: 'T', tipo: 'tierra', nodos: ['der'] },
  ],
});

describe('motor', () => {
  it('declara sus tipos y opciones', () => {
    expect(TIPOS_COMPONENTE).toContain('interruptor-3');
    expect(TIPOS_COMPONENTE).toContain('bombilla');
    expect(OPCIONES_CIRCUITO.modo).toBe('ideal');
  });
});

// ---------------------------------------------------------------------------
describe('corriente continua: punto de operación', () => {
  it('ley de Ohm: el amperímetro mide E/R y el voltímetro E', () => {
    const op = puntoOperacion({ componentes: [
      { id: 'E', tipo: 'bateria', nodos: ['p', '0'], E: 12 },
      { id: 'A', tipo: 'amperimetro', nodos: ['p', 'q'] },
      { id: 'R', tipo: 'resistencia', nodos: ['q', '0'], R: 4 },
      { id: 'V', tipo: 'voltimetro', nodos: ['q', '0'] },
      { id: 'T', tipo: 'tierra', nodos: ['0'] },
    ] });
    cerca(op.I[op.ids.indexOf('A')], 3);
    cerca(op.I[op.ids.indexOf('R')], 3);
    cerca(op.I[op.ids.indexOf('E')], 3);
    cerca(op.v[op.ids.indexOf('V')], 12);
    expect(op.I[op.ids.indexOf('V')]).toBe(0);
  });

  it('resistencia interna: I = E/(R + r) y voltaje en bornes E − r·I', () => {
    const op = puntoOperacion({ componentes: [
      { id: 'E', tipo: 'bateria', nodos: ['p', '0'], E: 9, r: 0.5 },
      { id: 'R', tipo: 'resistencia', nodos: ['p', '0'], R: 4 },
      { id: 'T', tipo: 'tierra', nodos: ['0'] },
    ] });
    cerca(op.I[op.ids.indexOf('E')], 2);
    cerca(op.v[op.ids.indexOf('E')], 8);
  });

  it('serie y paralelo: R1 + (R2 ∥ R3), con el reparto de corriente en el paralelo', () => {
    const op = puntoOperacion({ componentes: [
      { id: 'E', tipo: 'bateria', nodos: ['p', '0'], E: 12 },
      { id: 'R1', tipo: 'resistencia', nodos: ['p', 'm'], R: 2 },
      { id: 'R2', tipo: 'resistencia', nodos: ['m', '0'], R: 3 },
      { id: 'R3', tipo: 'resistencia', nodos: ['m', '0'], R: 6 },
      { id: 'T', tipo: 'tierra', nodos: ['0'] },
    ] });
    // R = 2 + 3·6/9 = 4 Ω → I = 3 A; 2 A por R2 y 1 A por R3
    cerca(op.I[op.ids.indexOf('E')], 3);
    cerca(op.I[op.ids.indexOf('R2')], 2);
    cerca(op.I[op.ids.indexOf('R3')], 1);
    cerca(op.V[op.nodos.indexOf('m')], 6);
  });

  it('divisor de voltaje, también cargado por un voltímetro real', () => {
    const div = rv => puntoOperacion({ componentes: [
      { id: 'E', tipo: 'bateria', nodos: ['p', '0'], E: 10 },
      { id: 'R1', tipo: 'resistencia', nodos: ['p', 's'], R: 10e3 },
      { id: 'R2', tipo: 'resistencia', nodos: ['s', '0'], R: 30e3 },
      { id: 'V', tipo: 'voltimetro', nodos: ['s', '0'], r: rv },
      { id: 'T', tipo: 'tierra', nodos: ['0'] },
    ] });
    cerca(div(Infinity).v[3], 7.5);
    const Rp = 30e3 * 60e3 / 90e3;      // R2 ∥ rv
    cerca(div(60e3).v[3], 10 * Rp / (10e3 + Rp));
  });

  it('reóstato como potenciómetro: el cursor da E·(1 − x)', () => {
    const op = puntoOperacion({ componentes: [
      { id: 'E', tipo: 'bateria', nodos: ['a', '0'], E: 10 },
      { id: 'P', tipo: 'reostato', nodos: ['a', '0', 'c'], R: 100, x: 0.3 },
      { id: 'T', tipo: 'tierra', nodos: ['0'] },
    ] });
    cerca(op.V[op.nodos.indexOf('c')], 7);
    cerca(op.I[op.ids.indexOf('P')], 0.1);
  });

  it('fuente de corriente: V = I·R; el capacitor queda abierto y el inductor en corto', () => {
    const op = puntoOperacion({ componentes: [
      { id: 'I', tipo: 'fuente-corriente', nodos: ['0', 'p'], I: 0.5 },
      { id: 'R', tipo: 'resistencia', nodos: ['p', '0'], R: 8 },
      { id: 'C', tipo: 'capacitor', nodos: ['p', '0'], C: 1e-3 },
      { id: 'L', tipo: 'inductor', nodos: ['p', 'q'], L: 1 },
      { id: 'R2', tipo: 'resistencia', nodos: ['q', '0'], R: 8 },
      { id: 'T', tipo: 'tierra', nodos: ['0'] },
    ] });
    // 0.5 A en R ∥ R2 = 4 Ω → 2 V; el capacitor guarda C·2 V
    cerca(op.V[op.nodos.indexOf('p')], 2);
    cerca(op.I[op.ids.indexOf('L')], 0.25);
    cerca(op.q[op.ids.indexOf('C')], 2e-3);
    expect(op.I[op.ids.indexOf('C')]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('MEXT 2027 1-(3): puente de Wheatstone equilibrado', () => {
  const iS = R => { const op = puntoOperacion(puente(R)); return op.I[op.ids.indexOf('S')]; };

  it('con R = 15 Ω no pasa corriente por S (10/20 = R/30)', () => {
    const op = puntoOperacion(puente(15));
    expect(Math.abs(op.I[op.ids.indexOf('S')])).toBeLessThan(1e-15);
    // Con S abierto, los dos nodos del centro están al mismo potencial
    const ab = puntoOperacion(puente(15, false));
    cerca(ab.V[ab.nodos.indexOf('arr')], ab.V[ab.nodos.indexOf('aba')]);
    cerca(ab.v[ab.ids.indexOf('S')], 0, 0, 1e-15);
  });

  it('un galvanómetro ideal en serie con S marca exactamente 0 (sin ruido de redondeo)', () => {
    const c = puente(15);
    c.componentes = c.componentes.map(x => (x.id === 'S' ? { ...x, nodos: ['arr', 'g'] } : x));
    c.componentes.push({ id: 'G', tipo: 'amperimetro', nodos: ['g', 'aba'] });
    const op = puntoOperacion(c);
    expect(op.I[op.ids.indexOf('G')]).toBe(0);
    expect(op.I[op.ids.indexOf('S')]).toBe(0);
  });

  it('fuera del equilibrio sí pasa corriente, y cambia de sentido al cruzar 15 Ω', () => {
    expect(Math.abs(iS(20))).toBeGreaterThan(1e-3);
    expect(Math.sign(iS(10))).toBe(-Math.sign(iS(20)));
  });

  it('el motor encuentra R = 15 Ω buscando I_S = 0 (bisección)', () => {
    let a = 1, b = 100;
    const sa = Math.sign(iS(a));
    for (let k = 0; k < 80; k++) { const m = (a + b) / 2; if (Math.sign(iS(m)) === sa) a = m; else b = m; }
    cerca((a + b) / 2, 15, 1e-12);
  });

  it('en el transitorio, al cerrar S en t = 1 s su corriente sigue siendo nula', () => {
    const sim = simularCircuito({ ...puente(15, false), acciones: [{ t: 1, id: 'S', estado: true }] }, { duracion: 3, dt: 0.05 });
    const k = indiceDe(sim, 'S');
    for (const m of sim.muestras) expect(Math.abs(m.I[k])).toBeLessThan(1e-14);
    expect(sim.eventos.map(e => e.nombre)).toEqual(['S se cierra']);
  });
});

// ---------------------------------------------------------------------------
describe('carga y descarga de un capacitor (RC)', () => {
  const E = 6, R = 2000, C = 500e-6, tau = R * C, t0 = 0.5;
  const sim = simularCircuito(circuitoRC({ E, R, C, t0 }), { duracion: t0 + 25 * tau, dt: 0.01, ...PRECISO });
  const iC = indiceDe(sim, 'C'), iR = indiceDe(sim, 'R'), iE = indiceDe(sim, 'E');

  it('V(t) = E·(1 − e^(−t/RC)) e I(t) = (E/R)·e^(−t/RC)', () => {
    for (const m of sim.muestras) {
      const s = m.t - t0;
      const v = s <= 0 ? 0 : E * (1 - Math.exp(-s / tau)), i = s <= 0 ? 0 : (E / R) * Math.exp(-s / tau);
      cerca(m.v[iC], v, 0, 2e-7 * E);
      cerca(m.I[iR], i, 0, 2e-7 * E / R);
    }
  });

  it('el interruptor actúa en el instante exacto: antes no pasa nada, justo después I = E/R', () => {
    const antes = estadoEn(sim, t0), despues = sim.muestras.find(m => m.t > t0);
    expect(antes.t).toBe(t0);
    expect(Math.abs(antes.I[iR])).toBe(0);
    cerca(despues.I[iR], E / R, 1e-5);
    expect(despues.t - t0).toBeLessThan(1e-7);
  });

  it('trabajo de la batería C·E² y calor de Joule ½·C·E² (y en cada instante)', () => {
    const fin = ultima(sim);
    cerca(fin.W[iE], C * E * E, 1e-9);
    cerca(fin.Q[iR], 0.5 * C * E * E, 1e-9);
    cerca(fin.U[iC], 0.5 * C * E * E, 1e-9);
    for (const tt of [1, 1.5, 2.5, 4]) {
      const m = estadoEn(sim, tt), x = Math.exp(-(tt - t0) / tau);
      cerca(m.W[iE], C * E * E * (1 - x), 1e-6);
      cerca(m.Q[iR], 0.5 * C * E * E * (1 - x * x), 1e-6);
    }
    balanceCierra(sim);
  });

  it('descarga: V(t) = V₀·e^(−t/RC) y el calor es ½·C·V₀²', () => {
    const V0 = 8;
    const d = simularCircuito({
      componentes: [
        { id: 'C', tipo: 'capacitor', nodos: ['a', '0'], C, q0: C * V0 },
        { id: 'S', tipo: 'interruptor', nodos: ['a', 'b'] },
        { id: 'R', tipo: 'resistencia', nodos: ['b', '0'], R },
        { id: 'T', tipo: 'tierra', nodos: ['0'] },
      ],
      acciones: [{ t: 0.2, id: 'S', estado: true }],
    }, { duracion: 0.2 + 25 * tau, dt: 0.01, ...PRECISO });
    const k = indiceDe(d, 'C');
    for (const m of d.muestras) cerca(m.v[k], m.t <= 0.2 ? V0 : V0 * Math.exp(-(m.t - 0.2) / tau), 0, 2e-7 * V0);
    cerca(ultima(d).Q[indiceDe(d, 'R')], 0.5 * C * V0 * V0, 1e-9);
    balanceCierra(d);
  });

  it('el interruptor de tres posiciones carga en a y descarga en b', () => {
    const s3 = simularCircuito({
      componentes: [
        { id: 'E', tipo: 'bateria', nodos: ['p', '0'], E },
        { id: 'S', tipo: 'interruptor-3', nodos: ['k', 'p', '0'], posicion: null },
        { id: 'R', tipo: 'resistencia', nodos: ['k', 'b'], R },
        { id: 'C', tipo: 'capacitor', nodos: ['b', '0'], C },
        { id: 'T', tipo: 'tierra', nodos: ['0'] },
      ],
      acciones: [{ t: 0, id: 'S', estado: 'a' }, { t: 3, id: 'S', estado: 'b' }],
    }, { duracion: 6, dt: 0.01, ...PRECISO });
    const k = indiceDe(s3, 'C');
    cerca(estadoEn(s3, 3).v[k], E * (1 - Math.exp(-3 / tau)), 1e-6);
    cerca(estadoEn(s3, 5).v[k], E * (1 - Math.exp(-3 / tau)) * Math.exp(-2 / tau), 1e-6);
    expect(s3.eventos.map(e => e.nombre)).toEqual(['S pasa a la posición a', 'S pasa a la posición b']);
    balanceCierra(s3);
  });
});

// ---------------------------------------------------------------------------
describe('reparto de carga entre dos capacitores', () => {
  const C1 = 2e-3, C2 = 3e-3, V0 = 10;
  const circ = {
    componentes: [
      { id: 'C1', tipo: 'capacitor', nodos: ['a', '0'], C: C1, q0: C1 * V0 },
      { id: 'S', tipo: 'interruptor', nodos: ['a', 'b'] },
      { id: 'C2', tipo: 'capacitor', nodos: ['b', '0'], C: C2 },
      { id: 'T', tipo: 'tierra', nodos: ['0'] },
    ],
    acciones: [{ t: 1, id: 'S', estado: true }],
  };
  const Vf = C1 * V0 / (C1 + C2), perdida = 0.5 * C1 * C2 / (C1 + C2) * V0 * V0;

  it('modo ideal: V = C₁V₀/(C₁ + C₂) al instante y se pierde ½·C₁C₂/(C₁ + C₂)·ΔV²', () => {
    const sim = simularCircuito(circ, { duracion: 2, dt: 0.01 });
    const fin = ultima(sim), k1 = indiceDe(sim, 'C1'), k2 = indiceDe(sim, 'C2');
    cerca(fin.v[k1], Vf); cerca(fin.v[k2], Vf);
    cerca(fin.q[k1] + fin.q[k2], C1 * V0);
    expect(sim.eventos).toHaveLength(1);
    cerca(sim.eventos[0].perdida, perdida, 1e-12);
    cerca(fin.perdidas, perdida, 1e-12);
    // Justo después del evento ya está repartida
    cerca(sim.muestras.find(m => m.t > 1).v[k2], Vf, 1e-9);
    balanceCierra(sim);
  });

  it('modo realista: el mismo estado final y la misma energía, ahora como calor en el contacto', () => {
    const rC = 2, tau = rC * C1 * C2 / (C1 + C2);
    const sim = simularCircuito({ ...circ, acciones: [{ t: 0.01, id: 'S', estado: true }] },
      { duracion: 0.01 + 30 * tau, dt: 1e-4, modo: 'realista', rCable: rC, ...PRECISO });
    const fin = ultima(sim), kS = indiceDe(sim, 'S'), k1 = indiceDe(sim, 'C1'), k2 = indiceDe(sim, 'C2');
    cerca(fin.v[k2], Vf, 1e-9);
    cerca(fin.Q[kS], perdida, 1e-7);
    expect(fin.perdidas).toBe(0);
    // El transitorio se ve: ΔV(t) = V₀·e^(−t/τ) con τ = r·C₁C₂/(C₁ + C₂)
    for (const m of sim.muestras) if (m.t > 0.01) cerca(m.v[k1] - m.v[k2], V0 * Math.exp(-(m.t - 0.01) / tau), 0, 1e-6 * V0);
    balanceCierra(sim);
  });
});

// ---------------------------------------------------------------------------
describe('MEXT 2023 P2: red de tres capacitores iguales con dos interruptores', () => {
  const V = 12, C = 1e-3, CV = C * V, CV2 = C * V * V;
  for (const modo of ['ideal', 'realista']) {
    const sim = simularCircuito(circuito2023({ V, C }), { duracion: 6, dt: 0.01, modo, rCable: 0.5, ...PRECISO });
    const k2 = indiceDe(sim, 'C2'), k1 = indiceDe(sim, 'C1'), kA = sim.nodos.indexOf('A'), kB = sim.nodos.indexOf('B');
    const rel = modo === 'ideal' ? 1e-12 : 1e-9;
    const en = t => estadoEn(sim, t);

    it(`${modo}: (1) con S1 cerrado, la carga de C2 es CV/2`, () => cerca(en(1.9).q[k2], CV / 2, rel));
    it(`${modo}: (2) la energía en C1 y C2 es CV²/4`, () => cerca(en(1.9).U[k1] + en(1.9).U[k2], CV2 / 4, rel));
    it(`${modo}: (3) tras abrir S1 y cerrar S2, la carga de C2 es CV/4`, () => cerca(en(3.9).q[k2], CV / 4, rel));
    it(`${modo}: (4) V_A = V/4 y V_B = 3V/4`, () => { cerca(en(3.9).V[kA], V / 4, rel); cerca(en(3.9).V[kB], 3 * V / 4, rel); });
    it(`${modo}: (5) tras abrir S2 y cerrar S1, la carga de C2 es 3CV/8`, () => cerca(en(5.9).q[k2], 3 * CV / 8, rel));

    it(`${modo}: B queda aislado con su carga CV/2 mientras S1 está abierto`, () => {
      for (const m of sim.muestras) if (m.t > 2.001 && m.t < 5) cerca(m.q[k1], CV / 2, rel);
    });

    it(`${modo}: energía perdida en cada conexión CV²/4, CV²/16 y CV²/64; el balance cierra`, () => {
      const fin = ultima(sim);
      const perdido = modo === 'ideal' ? fin.perdidas : fin.Q.reduce((a, b) => a + b, 0);
      cerca(perdido, CV2 * (1 / 4 + 1 / 16 + 1 / 64), modo === 'ideal' ? 1e-12 : 1e-8);
      if (modo === 'ideal') {
        expect(sim.eventos.map(e => e.nombre)).toEqual(['S1 se cierra', 'S1 se abre', 'S2 se cierra', 'S2 se abre', 'S1 se cierra']);
        const p = sim.eventos.map(e => e.perdida / CV2);
        [1 / 4, 0, 1 / 16, 0, 1 / 64].forEach((x, i) => cerca(p[i], x, 1e-12, 1e-15));
      }
      cerca(fin.W[indiceDe(sim, 'E')], V * (CV / 2 + CV / 8), rel);
      balanceCierra(sim);
    });
  }
});

// ---------------------------------------------------------------------------
describe('conservación de la carga en islas', () => {
  it('dos capacitores en serie tienen siempre la misma carga (la isla del medio no se carga)', () => {
    const C1 = 1e-3, C2 = 2e-3, E = 9, R = 1000;
    const sim = simularCircuito({
      componentes: [
        { id: 'E', tipo: 'bateria', nodos: ['p', '0'], E },
        { id: 'R', tipo: 'resistencia', nodos: ['p', 'a'], R },
        { id: 'C1', tipo: 'capacitor', nodos: ['a', 'm'], C: C1 },
        { id: 'C2', tipo: 'capacitor', nodos: ['m', '0'], C: C2 },
        { id: 'T', tipo: 'tierra', nodos: ['0'] },
      ],
    }, { duracion: 20, dt: 0.01 });
    const k1 = indiceDe(sim, 'C1'), k2 = indiceDe(sim, 'C2');
    for (const m of sim.muestras) expect(Math.abs(m.q[k1] - m.q[k2])).toBeLessThanOrEqual(1e-15 * C1 * E);
    const Cs = C1 * C2 / (C1 + C2);
    cerca(ultima(sim).q[k1], Cs * E, 1e-6);
  });

  it('una isla con carga inicial la conserva: estado estacionario y transitorio coinciden con la fórmula', () => {
    const C1 = 1e-3, C2 = 2e-3, E = 9, Q0 = 4e-3;
    const circ = {
      componentes: [
        { id: 'E', tipo: 'bateria', nodos: ['p', '0'], E },
        { id: 'R', tipo: 'resistencia', nodos: ['p', 'a'], R: 500 },
        { id: 'C1', tipo: 'capacitor', nodos: ['a', 'm'], C: C1 },
        { id: 'C2', tipo: 'capacitor', nodos: ['m', '0'], C: C2, q0: Q0 },
        { id: 'T', tipo: 'tierra', nodos: ['0'] },
      ],
    };
    // Isla m: −q1 + q2 = Q0 y q1/C1 + q2/C2 = E
    const q1 = (E - Q0 / C2) / (1 / C1 + 1 / C2), q2 = q1 + Q0;
    const op = puntoOperacion(circ);
    cerca(op.q[op.ids.indexOf('C1')], q1, 1e-12);
    cerca(op.q[op.ids.indexOf('C2')], q2, 1e-12);
    const sim = simularCircuito(circ, { duracion: 15, dt: 0.01 });
    for (const m of sim.muestras) cerca(m.q[3] - m.q[2], Q0, 1e-14);
    cerca(ultima(sim).q[2], q1, 1e-6);
  });

  it('la carga de las islas de MEXT 2023 P2 no se fuga en una corrida larga', () => {
    const V = 12, C = 1e-3;
    const circ = circuito2023({ V, C });
    circ.acciones = circ.acciones.slice(0, 3);
    for (const modo of ['ideal', 'realista']) {
      const sim = simularCircuito(circ, { duracion: 400, dt: 0.02, modo, rCable: 0.5 });
      const k1 = indiceDe(sim, 'C1'), k2 = indiceDe(sim, 'C2'), k3 = indiceDe(sim, 'C3');
      const ref = estadoEn(sim, 3.2);
      cerca(ref.q[k1], C * V / 2, 1e-9);
      for (const m of sim.muestras) if (m.t > 3.2) {
        cerca(m.q[k1], ref.q[k1], 1e-14);                        // isla B: ni un ulp de más por paso
        cerca(m.q[k2] + m.q[k3] - m.q[k1], 0, 0, 1e-15 * C * V); // isla A ∪ C3: carga total nula
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe('MEXT 2019 P2: RC cargado y luego LC', () => {
  const V = 10, R = 1000, C = 1e-3, L = 100, ta = 0.5, tc = 9, tau = R * C;
  const w = 1 / Math.sqrt(L * C), Tper = 2 * Math.PI / w;
  const sim = simularCircuito(circuito2019({ V, R, C, L, ta, tc }), { duracion: tc + 3 * Tper, dt: 0.005, ...PRECISO });
  const kR = indiceDe(sim, 'R'), kC = indiceDe(sim, 'C'), kL = indiceDe(sim, 'L');
  const Vc0 = V * (1 - Math.exp(-(tc - ta) / tau));   // carga alcanzada al pasar a c

  it('(1) justo al pasar a a, la corriente en R es I₀ = V/R', () => {
    cerca(sim.muestras.find(m => m.t > ta).I[kR], V / R, 1e-5);
    expect(estadoEn(sim, ta).I[kR]).toBe(0);
  });

  it('(2) tras mucho tiempo en a, la carga es CV', () => {
    cerca(estadoEn(sim, tc).q[kC], C * Vc0, 1e-7);
    cerca(estadoEn(sim, tc).q[kC], C * V, 3e-4);
  });

  it('(3) el calor de Joule en R hasta cargarse es ½CV²', () => {
    const s = tc - ta;
    cerca(estadoEn(sim, tc).Q[kR], 0.5 * C * V * V * (1 - Math.exp(-2 * s / tau)), 1e-7);
    cerca(estadoEn(sim, tc).Q[kR], 0.5 * C * V * V, 1e-6);
  });

  it('(4) en c, I_L(t) = V·√(C/L)·sen(t/√(LC)): parte de cero y oscila', () => {
    for (const m of sim.muestras) if (m.t > tc) cerca(m.I[kL], Vc0 * Math.sqrt(C / L) * Math.sin(w * (m.t - tc)), 0, 3e-6 * Vc0 * Math.sqrt(C / L));
    expect(Math.abs(estadoEn(sim, tc).I[kL])).toBe(0);
  });

  it('(5) I_máx = V·√(C/L) y el periodo es 2π·√(LC)', () => {
    let imax = 0; const ceros = [];
    sim.muestras.forEach((m, j) => {
      if (m.t <= tc) return;
      imax = Math.max(imax, Math.abs(m.I[kL]));
      const p = sim.muestras[j - 1];
      if (p.t > tc + 0.1 && p.I[kL] * m.I[kL] < 0) ceros.push(p.t + (m.t - p.t) * p.I[kL] / (p.I[kL] - m.I[kL]));
    });
    cerca(imax, Vc0 * Math.sqrt(C / L), 2e-4);
    cerca(imax, V * Math.sqrt(C / L), 5e-4);
    expect(ceros.length).toBeGreaterThanOrEqual(4);
    cerca(2 * (ceros[1] - ceros[0]), Tper, 1e-5);
    cerca(2 * (ceros[3] - ceros[2]), Tper, 1e-5);
  });

  it('en el LC la energía se conserva: ½CV_C² + ½LI_L² = ½CV²', () => {
    // La trapezoidal conserva exactamente la energía del oscilador (salvo redondeo)
    const U0 = estadoEn(sim, tc).U[kC];
    cerca(U0, 0.5 * C * Vc0 * Vc0, 1e-8);
    for (const m of sim.muestras) if (m.t > tc) cerca(m.U[kC] + m.U[kL], U0, 1e-11);
    balanceCierra(sim);
  });

  it('arrancar en el estado estacionario con S en a da q = CV desde t = 0', () => {
    const circ = circuito2019({ V, R, C, L });
    circ.componentes[2].posicion = 'a';
    circ.acciones = [{ t: 1, id: 'S', estado: 'c' }];
    const s = simularCircuito(circ, { duracion: 1 + Tper, dt: 0.01, inicio: 'estacionario', ...PRECISO });
    cerca(s.muestras[0].q[kC], C * V, 1e-12);
    let imax = 0; for (const m of s.muestras) imax = Math.max(imax, Math.abs(m.I[kL]));
    cerca(imax, V * Math.sqrt(C / L), 2e-4);
  });
});

// ---------------------------------------------------------------------------
describe('RLC en serie', () => {
  const L = 1, C = 10e-3, V0 = 5, t0 = 0.2;
  const rlc = R => simularCircuito({
    componentes: [
      { id: 'C', tipo: 'capacitor', nodos: ['a', '0'], C, q0: C * V0 },
      { id: 'S', tipo: 'interruptor', nodos: ['a', 'b'] },
      { id: 'R', tipo: 'resistencia', nodos: ['b', 'c'], R },
      { id: 'L', tipo: 'inductor', nodos: ['c', '0'], L },
      { id: 'T', tipo: 'tierra', nodos: ['0'] },
    ],
    acciones: [{ t: t0, id: 'S', estado: true }],
  }, { duracion: t0 + 3, dt: 0.002, ...PRECISO });
  const w0 = 1 / Math.sqrt(L * C);

  it('subamortiguado: q(t) = q₀·e^(−αt)·(cos ω_d t + (α/ω_d)·sen ω_d t)', () => {
    const R = 4, a = R / (2 * L), wd = Math.sqrt(w0 * w0 - a * a), sim = rlc(R), k = indiceDe(sim, 'C');
    for (const m of sim.muestras) {
      const s = m.t - t0;
      const v = s <= 0 ? V0 : V0 * Math.exp(-a * s) * (Math.cos(wd * s) + (a / wd) * Math.sin(wd * s));
      cerca(m.v[k], v, 0, 1e-6 * V0);
    }
    cerca(ultima(sim).Q[indiceDe(sim, 'R')] + ultima(sim).U[k] + ultima(sim).U[indiceDe(sim, 'L')], 0.5 * C * V0 * V0, 1e-12);
    balanceCierra(sim);
  });

  it('sobreamortiguado: q(t) = q₀·(s₁e^(s₂t) − s₂e^(s₁t))/(s₁ − s₂)', () => {
    const R = 60, a = R / (2 * L), d = Math.sqrt(a * a - w0 * w0), s1 = -a + d, s2 = -a - d, sim = rlc(R), k = indiceDe(sim, 'C');
    for (const m of sim.muestras) {
      const s = m.t - t0;
      const v = s <= 0 ? V0 : V0 * (s1 * Math.exp(s2 * s) - s2 * Math.exp(s1 * s)) / (s1 - s2);
      cerca(m.v[k], v, 0, 1e-6 * V0);
    }
    balanceCierra(sim);
  });
});

// ---------------------------------------------------------------------------
describe('inductor: corriente RL y corte del circuito', () => {
  it('I(t) = (E/R)·(1 − e^(−Rt/L)); al abrir sin otro camino la energía ½LI² se va en la chispa', () => {
    const E = 12, R = 6, L = 3, tau = L / R;
    const sim = simularCircuito({
      componentes: [
        { id: 'E', tipo: 'bateria', nodos: ['p', '0'], E },
        { id: 'S', tipo: 'interruptor', nodos: ['p', 'a'] },
        { id: 'R', tipo: 'resistencia', nodos: ['a', 'b'], R },
        { id: 'L', tipo: 'inductor', nodos: ['b', '0'], L },
        { id: 'T', tipo: 'tierra', nodos: ['0'] },
      ],
      acciones: [{ t: 0.5, id: 'S', estado: true }, { t: 2, id: 'S', estado: false }],
    }, { duracion: 3, dt: 0.01, ...PRECISO });
    const k = indiceDe(sim, 'L');
    for (const m of sim.muestras) if (m.t > 0.5 && m.t <= 2) cerca(m.I[k], (E / R) * (1 - Math.exp(-(m.t - 0.5) / tau)), 0, 1e-6 * E / R);
    const I2 = (E / R) * (1 - Math.exp(-1.5 / tau));
    const ev = sim.eventos[1];
    expect(ev.cortes).toEqual(['L']);
    cerca(ev.perdida, 0.5 * L * I2 * I2, 1e-6);
    expect(ultima(sim).I[k]).toBe(0);
    balanceCierra(sim);
  });
});

// ---------------------------------------------------------------------------
describe('bombilla no lineal', () => {
  const Vn = 12, Pn = 6, frio = 8;
  const curva = curvaBombilla({ Vn, Pn, frio });

  it('curva del filamento: a Vn da Pn, es impar y creciente, y dI/dV es su derivada', () => {
    cerca(curva.I(Vn) * Vn, Pn);
    cerca(curva.I(-3), -curva.I(3));
    for (const v of [-10, -1, 0, 0.5, 4, 12, 30]) {
      cerca(curva.dI(v), (curva.I(v + 1e-6) - curva.I(v - 1e-6)) / 2e-6, 1e-6);
      expect(curva.dI(v)).toBeGreaterThan(0);
    }
    // Resistencia en frío Rn/frio: la pendiente en el origen es frio/Rn
    cerca(curva.dI(0), frio * Pn / (Vn * Vn));
  });

  it('recta de carga E = V + R·I: el punto de operación es la solución exacta', () => {
    const E = 12, R = 20, { R0, b } = curva;
    // I = V/(R0 + bV) y E = V + R·I → b·V² + (R0 + R − bE)·V − E·R0 = 0
    const B = R0 + R - b * E, V = (-B + Math.sqrt(B * B + 4 * b * E * R0)) / (2 * b);
    const circ = {
      componentes: [
        { id: 'E', tipo: 'bateria', nodos: ['p', '0'], E },
        { id: 'S', tipo: 'interruptor', nodos: ['p', 'a'], cerrado: true },
        { id: 'R', tipo: 'resistencia', nodos: ['a', 'm'], R },
        { id: 'B', tipo: 'bombilla', nodos: ['m', '0'], Vn, Pn, frio },
        { id: 'T', tipo: 'tierra', nodos: ['0'] },
      ],
    };
    const op = puntoOperacion(circ), kB = op.ids.indexOf('B');
    cerca(op.v[kB], V, 1e-12);
    cerca(op.I[kB], (E - V) / R, 1e-12);
    // Transitorio: con S cerrado en t = 1 s, mismo punto
    circ.componentes[1].cerrado = false; circ.acciones = [{ t: 1, id: 'S', estado: true }];
    const sim = simularCircuito(circ, { duracion: 2, dt: 0.05 });
    cerca(ultima(sim).v[kB], V, 1e-12);
    balanceCierra(sim);
  });

  it('curva en tabla: interpola por los puntos y el punto de operación coincide con la bisección', () => {
    const tabla = [[1, 0.12], [2, 0.18], [4, 0.26], [6, 0.32], [9, 0.40], [12, 0.47]];
    const cv = curvaBombilla({ curva: tabla });
    for (const [V, I] of tabla) cerca(cv.I(V), I, 1e-14);
    for (let v = 0; v < 12; v += 0.37) expect(cv.I(v + 0.01)).toBeGreaterThan(cv.I(v));
    const E = 10, R = 15;
    let a = 0, b = E;
    for (let k = 0; k < 100; k++) { const m = (a + b) / 2; if (E - m - R * cv.I(m) > 0) a = m; else b = m; }
    const op = puntoOperacion({ componentes: [
      { id: 'E', tipo: 'bateria', nodos: ['p', '0'], E },
      { id: 'R', tipo: 'resistencia', nodos: ['p', 'm'], R },
      { id: 'B', tipo: 'bombilla', nodos: ['m', '0'], curva: tabla },
      { id: 'T', tipo: 'tierra', nodos: ['0'] },
    ] });
    cerca(op.v[2], (a + b) / 2, 1e-12);
  });

  it('con un capacitor en paralelo, la bombilla se enciende poco a poco y termina en la recta de carga', () => {
    const E = 12, R = 20, { R0, b } = curva;
    const B = R0 + R - b * E, V = (-B + Math.sqrt(B * B + 4 * b * E * R0)) / (2 * b);
    const sim = simularCircuito({
      componentes: [
        { id: 'E', tipo: 'bateria', nodos: ['p', '0'], E },
        { id: 'S', tipo: 'interruptor', nodos: ['p', 'a'] },
        { id: 'R', tipo: 'resistencia', nodos: ['a', 'm'], R },
        { id: 'B', tipo: 'bombilla', nodos: ['m', '0'], Vn, Pn, frio },
        { id: 'C', tipo: 'capacitor', nodos: ['m', '0'], C: 0.02 },
        { id: 'T', tipo: 'tierra', nodos: ['0'] },
      ],
      acciones: [{ t: 0.5, id: 'S', estado: true }],
    }, { duracion: 10, dt: 0.01 });
    const kB = indiceDe(sim, 'B');
    let antes = -1;
    for (const m of sim.muestras) { expect(m.v[kB]).toBeGreaterThanOrEqual(antes - 1e-12); antes = m.v[kB]; }
    cerca(ultima(sim).v[kB], V, 1e-9);
    balanceCierra(sim);
  });
});

// ---------------------------------------------------------------------------
describe('determinismo y estado interpolado', () => {
  it('dos corridas iguales dan resultados idénticos bit a bit', () => {
    const a = simularCircuito(circuito2019(), { duracion: 12, dt: 0.01 });
    const b = simularCircuito(circuito2019(), { duracion: 12, dt: 0.01 });
    expect(b.muestras.length).toBe(a.muestras.length);
    a.muestras.forEach((m, i) => {
      const n = b.muestras[i];
      expect(n.t).toBe(m.t);
      for (const k of ['V', 'I', 'v', 'q', 'U', 'W', 'Q']) expect(Array.from(n[k])).toEqual(Array.from(m[k]));
    });
    expect(b.eventos).toEqual(a.eventos);
  });

  it('en el instante de un evento, el estado es el de justo antes; un instante después, el de después', () => {
    const sim = simularCircuito(circuito2023(), { duracion: 3, dt: 0.01 });
    const k = indiceDe(sim, 'C2');
    expect(estadoEn(sim, 1).q[k]).toBe(0);
    cerca(estadoEn(sim, 1 + 1e-6).q[k], 6e-3, 1e-12);
    // Entre muestras se interpola linealmente
    const m = estadoEn(sim, 0.505);
    expect(m.t).toBe(0.505);
  });
});

// ---------------------------------------------------------------------------
describe('errores que dicen qué pasa', () => {
  const base = () => circuitoRC().componentes.map(c => ({ ...c }));
  const falla = (f, patron) => { expect(f).toThrow(ErrorCircuito); expect(f).toThrow(patron); };

  it('cortocircuito de una batería por un interruptor cerrado', () => {
    falla(() => simularCircuito({ componentes: [...base(), { id: 'X', tipo: 'interruptor', nodos: ['p', '0'], cerrado: true }] }), /Cortocircuito/);
  });
  it('tipo desconocido, valores imposibles y nombres repetidos', () => {
    falla(() => simularCircuito({ componentes: [{ id: 'Z', tipo: 'triodo', nodos: ['a', 'b'] }] }), /no conozco/);
    falla(() => simularCircuito({ componentes: [{ id: 'R', tipo: 'resistencia', nodos: ['a', 'b'], R: -5 }] }), /positivo/);
    falla(() => simularCircuito({ componentes: [...base(), { id: 'R', tipo: 'resistencia', nodos: ['a', 'b'], R: 1 }] }), /dos componentes/);
  });
  it('fuente de corriente sin camino de vuelta', () => {
    falla(() => puntoOperacion({ componentes: [
      { id: 'I', tipo: 'fuente-corriente', nodos: ['a', 'b'], I: 1 },
      { id: 'R', tipo: 'resistencia', nodos: ['c', 'd'], R: 1 },
    ] }), /camino cerrado/);
  });
  it('acción sobre algo que no es un interruptor', () => {
    falla(() => simularCircuito({ componentes: base(), acciones: [{ t: 1, id: 'R', estado: true }] }), /no es un interruptor/);
  });
});

// ---------------------------------------------------------------------------
describe('capacitor con perfil de capacidad C(t) = C·f(t)', () => {
  const C = 1e-3, E = 10;
  // Batería ideal sobre el capacitor: S se cierra en 0.5 s y se abre en 5.5 s;
  // f sube de 1 a 3/2 entre 1.5 y 4.5 s y vuelve a 1 entre 6.5 y 9.5 s
  const perfil = [[1.5, 1], [4.5, 1.5], [6.5, 1.5], [9.5, 1]];
  const circuito = (modo = 'ideal') => simularCircuito({
    componentes: [
      { id: 'E', tipo: 'bateria', nodos: ['p', 'g'], E },
      { id: 'S', tipo: 'interruptor', nodos: ['p', 'a'] },
      { id: 'C', tipo: 'capacitor', nodos: ['a', 'g'], C, perfil },
      { id: 'T', tipo: 'tierra', nodos: ['g'] },
    ],
    acciones: [{ t: 0.5, id: 'S', estado: true }, { t: 5.5, id: 'S', estado: false }],
  }, { duracion: 10, dt: 0.01, modo, rCable: 0.05 });

  it('capacidadEn: lineal entre los puntos del perfil y constante fuera', () => {
    const c = { C, perfil };
    expect(capacidadEn(c, 0)).toBe(C);
    cerca(capacidadEn(c, 3), 1.25 * C);
    expect(capacidadEn(c, 5)).toBe(1.5 * C);
    cerca(capacidadEn(c, 8), 1.25 * C);
    expect(capacidadEn(c, 20)).toBe(C);
    expect(capacidadEn({ C }, 3)).toBe(C);
  });

  it('con la batería: q = E·C(t) y la corriente es E·dC/dt mientras la capacidad cambia', () => {
    const sim = circuito(), k = indiceDe(sim, 'C');
    for (const t of [1, 2, 3.3, 4.5, 5]) cerca(estadoEn(sim, t).q[k], E * capacidadEn({ C, perfil }, t), 1e-12);
    // dC/dt = 0.5·C/3 s; el error de la corriente es el redondeo amplificado por C/h
    for (const t of [2, 3, 4]) cerca(estadoEn(sim, t).I[k], E * 0.5 * C / 3, 1e-6);
    cerca(estadoEn(sim, 1.4).I[k], 0, 0, 1e-12);
  });

  it('cada vértice del perfil corta el paso: la corriente salta justo ahí, sin evento en la tabla', () => {
    const sim = circuito(), k = indiceDe(sim, 'C');
    // En el vértice, el estado es el de justo antes (sin corriente); la primera muestra después ya la tiene
    cerca(estadoEn(sim, 1.5).I[k], 0, 0, 1e-12);
    const despues = sim.muestras.find(m => m.t > 1.5);
    expect(despues.t - 1.5).toBeLessThan(1e-6);
    cerca(despues.I[k], E * 0.5 * C / 3, 1e-6);
    expect(sim.eventos.map(e => e.t)).toEqual([0.5, 5.5]);
  });

  it('el trabajo de la fuerza externa es −½E²ΔC con la batería y q²/2·Δ(1/C) con la carga fija', () => {
    const sim = circuito(), k = indiceDe(sim, 'C'), kE = indiceDe(sim, 'E');
    const [a, b, c, d] = [1.5, 4.5, 6.5, 9.5].map(t => estadoEn(sim, t));
    cerca(b.W[kE] - a.W[kE], E * E * 0.5 * C, 1e-12);          // la batería: E·Δq
    cerca(b.W[k] - a.W[k], -0.5 * E * E * 0.5 * C, 1e-12);       // la fuerza: −½E²ΔC
    cerca(b.U[k] - a.U[k], 0.5 * E * E * 0.5 * C, 1e-12);        // ΔU = ½E²ΔC
    // Isla: S abierto, la carga 1.5·C·E no cambia y v = q/C(t) sube
    const q = 1.5 * C * E;
    cerca(d.q[k], q, 1e-12);
    cerca(d.v[k], q / C, 1e-12);
    cerca(d.W[k] - c.W[k], q * q / 2 * (1 / C - 1 / (1.5 * C)), 1e-12);
    balanceCierra(sim, 1e-12);
  });

  it('modo realista: los cables apenas cambian el resultado y el balance cierra', () => {
    const sim = circuito('realista'), k = indiceDe(sim, 'C');
    // La carga va con un retraso de R_cables·C ≈ 0.2 ms detrás de E·C(t): diferencias de 10⁻⁵
    const a = estadoEn(sim, 1.5), b = estadoEn(sim, 4.5);
    cerca(b.q[k] - a.q[k], 0.5 * C * E, 1e-4);
    cerca(b.W[k] - a.W[k], -0.25 * C * E * E, 1e-4);
    balanceCierra(sim, 1e-10);
  });

  it('RC con capacidad lineal: q(t) = E/(Rk + 1/C₀)·[(1 + kt) − (1 + kt)^(−1/(RC₀k))]', () => {
    const R = 100, C0 = 1e-3, k = 0.5, T1 = 4;
    const sim = simularCircuito({ componentes: [
      { id: 'E', tipo: 'bateria', nodos: ['p', 'g'], E },
      { id: 'R', tipo: 'resistencia', nodos: ['p', 'a'], R },
      { id: 'C', tipo: 'capacitor', nodos: ['a', 'g'], C: C0, perfil: [[0, 1], [T1, 1 + k * T1]] },
      { id: 'T', tipo: 'tierra', nodos: ['g'] },
    ] }, { duracion: T1, dt: 0.01, ...PRECISO });
    const kc = indiceDe(sim, 'C'), a = 1 / (R * C0 * k);
    let err = 0, qmax = 0;
    for (const m of sim.muestras) {
      const x = 1 + k * m.t, qa = E / (R * k + 1 / C0) * (x - x ** -a);
      err = Math.max(err, Math.abs(m.q[kc] - qa)); qmax = Math.max(qmax, qa);
    }
    expect(err / qmax).toBeLessThan(1e-6);
    balanceCierra(sim, 1e-12);
  });

  it('el punto de operación y el inicio estacionario usan C(0)', () => {
    const circ = { componentes: [
      { id: 'E', tipo: 'bateria', nodos: ['p', 'g'], E },
      { id: 'R', tipo: 'resistencia', nodos: ['p', 'a'], R: 10 },
      { id: 'C', tipo: 'capacitor', nodos: ['a', 'g'], C, perfil: [[0, 2], [1, 3]] },
      { id: 'T', tipo: 'tierra', nodos: ['g'] },
    ] };
    const op = puntoOperacion(circ);
    cerca(op.q[op.ids.indexOf('C')], 2 * C * E);
    const sim = simularCircuito(circ, { duracion: 0.5, dt: 0.01, inicio: 'estacionario' });
    cerca(sim.muestras[0].q[indiceDe(sim, 'C')], 2 * C * E, 1e-9);
  });

  it('perfiles imposibles se rechazan con un mensaje claro', () => {
    const con = perfil => () => simularCircuito({ componentes: [
      { id: 'E', tipo: 'bateria', nodos: ['p', 'g'], E },
      { id: 'C', tipo: 'capacitor', nodos: ['p', 'g'], C, perfil },
      { id: 'T', tipo: 'tierra', nodos: ['g'] },
    ] });
    expect(con([])).toThrow(/perfil/);
    expect(con([[1, 1], [1, 2]])).toThrow(/crecen/);
    expect(con([[0, 1], [1, 0]])).toThrow(/positivo/);
    expect(con([[0, 1], ['x', 2]])).toThrow(/pares/);
  });
});
