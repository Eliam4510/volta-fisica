// Motor de recipientes (Laboratorio de gases): recipientes conectados por
// válvulas, paredes y émbolos libres; recipiente abierto (globo y recinto) y
// burbuja que sube. Contra soluciones analíticas del gas ideal: expansión
// libre (T constante, P·V constante, ΔS = n·R·ln(V2/V1)), mezcla adiabática
// (U, moles y especies se conservan; T = Σn·Cv·T / Σn·Cv), émbolo entre dos
// gases a temperaturas dadas, termostato, temperatura de despegue del globo,
// aire que sale de un recinto y volumen de la burbuja. Determinismo y errores.
import { describe, it, expect } from 'vitest';
import {
  simularRecipientes, equilibrioAislado, estadoRecipientes, entropiaCompartimiento,
  simularAbierto, temperaturaDespegue, simularBurbuja, estadoMuestras,
} from '../sistema/motores/recipientes.js';
import { R_GAS } from '../sistema/motores/gas.js';

const R = R_GAS;
const cerca = (a, b, tol = 1e-12) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
const ultima = sim => sim.muestras[sim.muestras.length - 1];
const MONO = [{ nombre: 'gas', f: 3 }];
const nDe = (P, V, T) => P * V / (R * T);
const ABRIR = [{ t: 1, tipo: 'valvula', i: 0, valor: true }];

describe('expansión libre hacia el vacío', () => {
  const P = 1e5, T = 300, V = 0.01, n = nDe(P, V, T);
  const esc = { especies: MONO, compartimientos: [{ V, n: [n], T }, { V: 2 * V, n: [0], T }], separadores: [{ tipo: 'valvula', tau: 0.5 }] };

  it('gradual: P final = P·V/(V + V′), T no cambia, U y n se conservan en cada paso', () => {
    const sim = simularRecipientes(esc, ABRIR, { duracion: 20 });
    const q = ultima(sim);
    cerca(q.P[0], P / 3, 1e-7); cerca(q.P[1], P / 3, 1e-7);
    cerca(q.T[0], T, 1e-7); cerca(q.T[1], T, 1e-7);
    for (const s of sim.muestras) {
      cerca(s.Utot, 1.5 * n * R * T, 1e-12);
      cerca(s.n[0] + s.n[1], n, 1e-12);
    }
    // ΔS = n·R·ln 3 > 0: irreversible
    cerca(q.dS, n * R * Math.log(3), 1e-6);
    expect(sim.eventos.map(e => e.nombre)).toEqual(['Se abre la válvula 1']);
  });

  it('sin mezcla queda la expansión de Joule: un lado frío y otro caliente, con la misma presión final', () => {
    const sim = simularRecipientes({ ...esc, separadores: [{ tipo: 'valvula', tau: 0.5, mezcla: false }] }, ABRIR, { duracion: 20 });
    const q = ultima(sim);
    cerca(q.P[0], q.P[1], 1e-6);
    cerca(q.P[0], P / 3, 1e-6);                         // P·V_total = (2/f)·U_total
    expect(q.T[0]).toBeLessThan(T - 20); expect(q.T[1]).toBeGreaterThan(T + 20);
  });

  it('instantáneo: al abrir queda directamente el equilibrio', () => {
    const sim = simularRecipientes(esc, ABRIR, { duracion: 2, modo: 'instantaneo' });
    const s = estadoRecipientes(sim, 1.5), eq = equilibrioAislado(esc);
    cerca(s.P[0], eq.P, 1e-12); cerca(s.T[1], eq.T, 1e-12);
  });
});

describe('mezcla de gases', () => {
  it('dos recipientes del mismo gas a distinta P y T: T = 9T/5 y P = 3P/2 (MEXT 2016 P4)', () => {
    const P = 1e5, T = 300, V = 0.01;
    const esc = { especies: MONO, compartimientos: [{ V, n: [nDe(P, V, T)], T }, { V, n: [nDe(2 * P, V, 3 * T)], T: 3 * T }], separadores: [{ tipo: 'valvula' }] };
    const eq = equilibrioAislado(esc), q = ultima(simularRecipientes(esc, ABRIR, { duracion: 20 }));
    cerca(eq.T, 9 / 5 * T, 1e-12); cerca(eq.P, 1.5 * P, 1e-12);
    cerca(q.T[0], eq.T, 1e-6); cerca(q.P[1], eq.P, 1e-6);
    expect(eq.dS).toBeGreaterThan(0);
  });

  it('especies distintas: se mezclan las composiciones, la energía cierra y ΔS es la de la mezcla ideal', () => {
    const esc = { especies: [{ nombre: 'He', f: 3 }, { nombre: 'N₂', f: 5 }], compartimientos: [{ V: 0.02, n: [1, 0], T: 300 }, { V: 0.02, n: [0, 1], T: 500 }], separadores: [{ tipo: 'valvula', tau: 0.5 }] };
    const sim = simularRecipientes(esc, ABRIR, { duracion: 20 }), q = ultima(sim), eq = equilibrioAislado(esc);
    cerca(eq.T, (1.5 * 300 + 2.5 * 500) / 4, 1e-12);
    cerca(q.T[0], eq.T, 1e-7); cerca(q.T[1], eq.T, 1e-7);
    cerca(q.nEsp[0][0], 0.5, 1e-7); cerca(q.nEsp[1][1], 0.5, 1e-7);
    for (const s of sim.muestras) {
      cerca(s.Utot, sim.muestras[0].Utot, 1e-12);
      cerca(s.nEsp[0][0] + s.nEsp[1][0], 1, 1e-12); cerca(s.nEsp[0][1] + s.nEsp[1][1], 1, 1e-12);
    }
    cerca(q.dS, eq.dS, 1e-6);
    // ΔS de la mezcla ideal con T y V iniciales = 2·R·ln 2 más la parte térmica
    const Sterm = 1.5 * R * Math.log(eq.T / 300) + 2.5 * R * Math.log(eq.T / 500);
    cerca(eq.dS, Sterm + 2 * R * Math.log(2), 1e-12);
  });

  it('la entropía de un recipiente no depende de partirlo en dos con el mismo estado (sin paradoja de Gibbs)', () => {
    const cv = [1.5 * R];
    cerca(entropiaCompartimiento([2], cv, 300, 0.02), 2 * entropiaCompartimiento([1], cv, 300, 0.01), 1e-12);
  });
});

describe('émbolo libre entre dos gases', () => {
  it('B pasa a un baño a T y A sigue a T0: el émbolo se mueve L(T − T0)/(T + T0) hacia A (MEXT 2023 1-(4))', () => {
    const L = 0.2, S = 0.01, T0 = 300, T = 450, n = nDe(1e5, L * S, T0);
    const esc = { especies: MONO, compartimientos: [{ V: L * S, n: [n], T: T0, Tb: T0, Gb: 2 }, { V: L * S, n: [n], T: T0, Tb: T, Gb: 2, bano: false }], separadores: [{ tipo: 'embolo' }] };
    const sim = simularRecipientes(esc, [{ t: 1, tipo: 'bano', i: 1, valor: true }], { duracion: 20 }), q = ultima(sim);
    cerca((q.V[1] - L * S) / S, L * (T - T0) / (T + T0), 1e-8);
    cerca(q.P[0], q.P[1], 1e-10);
    for (const s of sim.muestras) {
      cerca(s.V[0] + s.V[1], 2 * L * S, 1e-12);                     // volumen total fijo
      cerca(s.W[0] + s.W[1], 0, 1e-9);                              // el trabajo de un lado lo recibe el otro
      for (let i = 0; i < 2; i++) cerca(s.U[i] - sim.U0[i], s.Qbano[i] + s.Qcal[i] + s.Qint[i] + s.H[i] - s.W[i], 1e-9);
    }
  });

  it('calentador con termostato: A llega a su temperatura y B se comprime a T del baño (MEXT 2010 2-B)', () => {
    const K0 = 273.15, L = 0.1, S = 0.01, n = nDe(1e5, L * S, K0);
    const esc = { especies: MONO, compartimientos: [{ V: L * S, n: [n], T: K0, Fc: 5, Tobj: K0 + 57 }, { V: L * S, n: [n], T: K0, Tb: K0, Gb: 2 }], separadores: [{ tipo: 'embolo' }] };
    const q = ultima(simularRecipientes(esc, [{ t: 1, tipo: 'calentador', i: 0, valor: true }], { duracion: 30 }));
    cerca(q.T[0], K0 + 57, 1e-6); cerca(q.T[1], K0, 1e-6);
    cerca((q.V[0] - L * S) / S, L * 57 / (2 * K0 + 57), 1e-6);
  });

  it('una escena sin gas a un lado de un émbolo es inválida', () => {
    expect(() => simularRecipientes({ especies: MONO, compartimientos: [{ V: 1e-3, n: [0.1], T: 300 }, { V: 1e-3, n: [0], T: 300 }], separadores: [{ tipo: 'embolo' }] })).toThrow(/émbolo libre/);
  });
});

describe('recipiente abierto', () => {
  const globo = { V: 3000, P0: 1e5, T0: 300, Mm: 0.029, M: 500, Fc: 5e6, Tobj: 360, H: R * 300 / (0.029 * 9.8), CdA: 100 };

  it('el globo despega a T1 = mPVT0/(mPV − MRT0) (MEXT 2020 P4) y sube hasta flotar', () => {
    const sim = simularAbierto(globo, [{ t: 1, tipo: 'calentador', valor: true }], { duracion: 120 });
    const d = sim.eventos.find(e => e.tipo === 'despegue');
    expect(d).toBeTruthy();
    cerca(d.T, temperaturaDespegue(globo), 1e-6);
    cerca(temperaturaDespegue({ Mm: 0.029, P0: 1e5, V: 3000, T0: 300, M: 500 }, 8.3), 350.1, 1e-3);   // datos del examen
    const q = ultima(sim);
    expect(q.z).toBeGreaterThan(10);
    // Dentro: densidad m·P/(R·T) y presión de fuera
    const s = sim.muestras[400];
    cerca(s.rhoIn, globo.Mm * s.P / (R * s.T), 1e-12);
    cerca(s.B, s.rhoExt * globo.V * 9.8, 1e-12);
  });

  it('recinto a presión constante: sale m = ρV(1 − T1/T2) al calentar de T1 a T2 (MEXT 2014 1-(3))', () => {
    const e = { V: 100, P0: 1e5, T0: 270, Mm: 1.3 * R * 270 / 1e5, Fc: 1e5, Tobj: 300 };
    const sim = simularAbierto(e, [{ t: 1, tipo: 'calentador', valor: true }], { duracion: 60 }), q = ultima(sim);
    expect(sim.fijo).toBe(true);
    cerca(q.T, 300, 1e-4);
    cerca(q.mSale, 1.3 * 100 * (1 - 270 / q.T), 1e-9);
    // Calor a presión constante con masa variable: Q = (P·V·Cp/R)·ln(T2/T1)
    cerca(q.Q, 1e5 * 100 * 3.5 * Math.log(q.T / 270), 1e-6);
  });
});

describe('burbuja', () => {
  it('P·V/T se conserva y el volumen en la superficie es el del examen (MEXT 2008 1-(3))', () => {
    const e = { V0: 1e-6, prof: 50, P0: 101325, rho: 101325 / 98, g: 9.8, Tfondo: 290.15, Tsup: 300.15 };
    const sim = simularBurbuja(e);
    for (const s of sim.muestras) cerca(s.P * s.V / s.T, e.P0 * 6 * e.V0 / 290.15, 1e-12);
    cerca(ultima(sim).V, 6 * e.V0 * 300.15 / 290.15, 1e-12);
    // Primera ley a lo largo de la subida: Q = ΔU + W con el trabajo exacto
    const s = estadoMuestras(sim, 30);
    cerca(s.Q, s.dU + s.W, 1e-9);
    expect(ultima(sim).W).toBeGreaterThan(0);
  });
});

describe('determinismo y errores', () => {
  it('la misma escena da exactamente el mismo resultado', () => {
    const esc = { especies: MONO, compartimientos: [{ V: 0.01, n: [0.4], T: 300 }, { V: 0.02, n: [0.1], T: 500 }], separadores: [{ tipo: 'valvula' }] };
    expect(simularRecipientes(esc, ABRIR, { duracion: 3 })).toEqual(simularRecipientes(esc, ABRIR, { duracion: 3 }));
  });

  it('escenas que no describen recipientes posibles lanzan un error claro', () => {
    expect(() => simularRecipientes({ especies: [], compartimientos: [], separadores: [] })).toThrow(/especie/);
    expect(() => simularRecipientes({ especies: MONO, compartimientos: [{ V: 0, n: [1], T: 300 }], separadores: [] })).toThrow(/volumen/);
    expect(() => simularRecipientes({ especies: MONO, compartimientos: [{ V: 1, n: [1], T: 300 }, { V: 1, n: [1], T: 300 }], separadores: [] })).toThrow(/separador/);
    expect(() => simularAbierto({ V: 0, P0: 1e5, T0: 300, Mm: 0.029 })).toThrow(/positivo/);
    expect(() => simularBurbuja({ V0: 1e-6, prof: 10, P0: 1e5, rho: 1000, Tfondo: 280, Tsup: 290, rapidez: 0 })).toThrow(/rapidez/);
  });
});
