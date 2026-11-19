// Motor de procesos y ciclos (Termodinámica · Ciclos y diagrama P-V) contra
// soluciones analíticas del gas ideal: P·V = n·R·T en cada estado, P·V^γ
// constante en la adiabática, ΔU = Q − W en cada tramo y ΔU = 0 en el ciclo,
// rendimientos de Carnot y Otto, calor de una recta que cambia de signo,
// cortes entre curvas, errores claros y determinismo.
import { describe, it, expect } from 'vitest';
import {
  simularCiclo, estadoCiclo, curvaTramo, energiaTramo, repartoCalor, finTramo, gasIdeal, puntoTramo,
  cicloCarnot, cicloOtto, cicloRectangular, rendimientoCarnot, rendimientoOtto, GRADOS,
} from '../sistema/motores/ciclos.js';
import { R_GAS } from '../sistema/motores/gas.js';

const R = R_GAS;
/** |a − b| ≤ tol·max(1, |b|) */
const cerca = (a, b, tol = 1e-12) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));

describe('gas ideal y estados', () => {
  it('Cv = f/2·R, Cp = Cv + R y γ = (f + 2)/f', () => {
    for (const f of [GRADOS.mono, GRADOS.di, GRADOS.tri]) {
      const g = gasIdeal({ n: 2, f });
      cerca(g.cv, f / 2 * R); cerca(g.cp, g.cv + R); cerca(g.gam, (f + 2) / f);
    }
  });

  it('cada estado cumple P·V = n·R·T y U = f/2·n·R·T', () => {
    const sim = simularCiclo(cicloRectangular({ n: 0.7, f: 5, P1: 1e5, P2: 3e5, V1: 0.01, V2: 0.03 }));
    for (const e of Object.values(sim.estados)) {
      cerca(e.P * e.V, 0.7 * R * e.T, 1e-14);
      cerca(e.U, 2.5 * 0.7 * R * e.T, 1e-14);
    }
    expect(sim.orden).toEqual(['A', 'B', 'C', 'D']);
    expect(sim.ciclo).toBe(true);
  });

  it('el estado inicial acepta dos cualesquiera de P, V y T', () => {
    const a = simularCiclo({ n: 1, inicio: { P: 1e5, T: 300 }, tramos: [] });
    const b = simularCiclo({ n: 1, inicio: { V: R * 300 / 1e5, T: 300 }, tramos: [] });
    cerca(a.estados.A.V, R * 300 / 1e5); cerca(b.estados.A.P, 1e5);
  });
});

describe('primera ley por tramo y en el ciclo', () => {
  const ciclos = [
    ['rectangular', cicloRectangular({ n: 1, P1: 1e5, P2: 4e5, V1: 0.01, V2: 0.04 })],
    ['Carnot', cicloCarnot({ n: 1, Th: 600, Tc: 300, V1: 0.01, V2: 0.02 })],
    ['Otto', cicloOtto({ n: 0.02, V1: 5e-4, r: 8, T1: 300, T3: 1500 })],
    ['triangular con recta', { n: 0.5, inicio: { P: 1e5, V: 0.01 }, tramos: [{ tipo: 'isocorico', P: 2e5 }, { tipo: 'isobarico', V: 0.02 }, { tipo: 'recta', hasta: 'A' }] }],
  ];
  for (const [nombre, esc] of ciclos) {
    it(`${nombre}: ΔU = Q − W en cada tramo y ΔU = 0, Q = W en el ciclo`, () => {
      const sim = simularCiclo(esc);
      expect(sim.ciclo).toBe(true);
      for (const x of sim.tramos) {
        cerca(x.dU, x.Q - x.W, 1e-12);
        cerca(x.dU, sim.gas.f / 2 * sim.gas.n * R * (x.b.P * x.b.V / (sim.gas.n * R) - x.a.P * x.a.V / (sim.gas.n * R)), 1e-12);
        cerca(x.Qabs - x.Qced, x.Q, 1e-12);
      }
      const escala = Math.max(...sim.tramos.map(x => Math.abs(x.Q)));
      expect(Math.abs(sim.total.dU) / escala).toBeLessThan(1e-12);
      expect(Math.abs(sim.total.Q - sim.total.W) / escala).toBeLessThan(1e-12);
      expect(Math.abs(sim.total.dS) / Math.max(...sim.tramos.map(x => Math.abs(x.dS)))).toBeLessThan(1e-12);
    });
  }
});

describe('procesos', () => {
  it('adiabático: P·V^γ constante en todo el tramo, Q = 0 y W = −ΔU', () => {
    const sim = simularCiclo({ n: 1, f: 5, inicio: { P: 3e5, V: 0.01 }, tramos: [{ tipo: 'adiabatico', V: 0.03 }] });
    const x = sim.tramos[0], g = sim.gas, K = x.a.P * x.a.V ** g.gam;
    for (let i = 0; i <= 50; i++) { const p = puntoTramo(g, 'adiabatico', x.a, x.b, i / 50); cerca(p.P * p.V ** g.gam, K, 1e-13); }
    expect(x.Q).toBe(0);
    cerca(x.W, -x.dU, 1e-12);
    // W = (P1V1 − P2V2)/(γ − 1)
    cerca(x.W, (x.a.P * x.a.V - x.b.P * x.b.V) / (g.gam - 1), 1e-12);
  });

  it('isotérmico: ΔU = 0 y Q = W = n·R·T·ln(V2/V1)', () => {
    const sim = simularCiclo({ n: 2, inicio: { T: 400, V: 0.02 }, tramos: [{ tipo: 'isotermico', V: 0.05 }] });
    const x = sim.tramos[0];
    expect(x.dU).toBe(0);
    cerca(x.W, 2 * R * 400 * Math.log(2.5), 1e-12);
    cerca(x.Q, x.W, 1e-15);
    cerca(x.dS, 2 * R * Math.log(2.5), 1e-12);
  });

  it('isobárico: Q = n·Cp·ΔT; isocórico: Q = n·Cv·ΔT y W = 0', () => {
    const sim = simularCiclo({ n: 1, f: 3, inicio: { P: 1e5, T: 300 }, tramos: [{ tipo: 'isobarico', T: 450 }, { tipo: 'isocorico', T: 300 }] });
    cerca(sim.tramos[0].Q, 2.5 * R * 150, 1e-12);
    cerca(sim.tramos[0].W, R * 150, 1e-12);
    cerca(sim.tramos[1].Q, -1.5 * R * 150, 1e-12);
    expect(sim.tramos[1].W).toBe(0);
  });

  it('recta que cruza la adiabática: absorbe y cede calor en el mismo tramo', () => {
    // De (1e5, 0.01) a (0.2e5, 0.04): el calor cambia de signo donde
    // dQ/dV = (k + 1)·P + k·V·dP/dV = 0
    const g = gasIdeal({ n: 1, f: 3 }), a = { P: 1e5, V: 0.01 }, b = { P: 0.2e5, V: 0.04 };
    const r = repartoCalor(g, 'recta', a, b), Q = energiaTramo(g, 'recta', a, b).Q;
    expect(r.abs).toBeGreaterThan(0); expect(r.ced).toBeGreaterThan(0);
    cerca(r.abs - r.ced, Q, 1e-12);
    // Integración numérica de dQ = dU + P·dV a lo largo de la recta
    let abs = 0, ced = 0; const N = 20000;
    for (let i = 0; i < N; i++) {
      const p = puntoTramo(g, 'recta', a, b, i / N), q = puntoTramo(g, 'recta', a, b, (i + 1) / N);
      const dq = 1.5 * (q.P * q.V - p.P * p.V) + 0.5 * (p.P + q.P) * (q.V - p.V);
      if (dq > 0) abs += dq; else ced -= dq;
    }
    cerca(r.abs, abs, 1e-6); cerca(r.ced, ced, 1e-6);
  });

  it('cortes: la isoterma de un estado corta a la adiabática de otro donde dicen las fórmulas', () => {
    const g = gasIdeal({ n: 1, f: 3 }), A = { P: 2e5, V: 0.01 }, C = { P: 0.5e5, V: 0.05 };
    const est = { A: { ...A, nombre: 'A', T: 0, U: 0, S: 0 } };
    const p = finTramo(g, C, { tipo: 'isotermico', corta: { tipo: 'adiabatico', estado: 'A' } }, est);
    cerca(p.P * p.V, C.P * C.V, 1e-12);
    cerca(p.P * p.V ** g.gam, A.P * A.V ** g.gam, 1e-12);
    const q = finTramo(g, C, { tipo: 'isobarico', corta: { tipo: 'isotermico', estado: 'A' } }, est);
    cerca(q.P, C.P); cerca(q.P * q.V, A.P * A.V, 1e-12);
  });
});

describe('rendimientos', () => {
  for (const [Th, Tc] of [[600, 300], [500, 400], [1000, 250]]) {
    it(`Carnot ${Th} K / ${Tc} K: η = 1 − Tc/Th y la temperatura extrema es la de los focos`, () => {
      const sim = simularCiclo(cicloCarnot({ n: 1.5, f: 5, Th, Tc, V1: 0.01, V2: 0.025 }));
      cerca(sim.rendimiento, 1 - Tc / Th, 1e-12);
      cerca(sim.rendimiento, rendimientoCarnot(Tc, Th), 1e-15);
      cerca(sim.carnot, 1 - Tc / Th, 1e-9);
      cerca(sim.estados.C.T, Tc, 1e-12);
      cerca(sim.estados.D.T, Tc, 1e-12);
      // Calor solo en las isotermas: Q_abs/Th = Q_ced/Tc (entropía)
      cerca(sim.total.Qabs / Th, sim.total.Qced / Tc, 1e-12);
    });
  }

  for (const [r, f] of [[8, 5], [10, 5], [6, 3]]) {
    it(`Otto r = ${r}, f = ${f}: η = 1 − r^(1−γ)`, () => {
      const gam = (f + 2) / f;
      const sim = simularCiclo(cicloOtto({ n: 0.03, f, V1: 1e-3, r, T1: 300, T3: 2000 }));
      cerca(sim.rendimiento, 1 - r ** (1 - gam), 1e-12);
      cerca(rendimientoOtto(r, gam), 1 - r ** (1 - gam), 1e-15);
      expect(sim.rendimiento).toBeLessThan(sim.carnot);
    });
  }

  it('ningún ciclo supera a Carnot entre sus temperaturas extremas', () => {
    const sim = simularCiclo(cicloRectangular({ n: 1, P1: 1e5, P2: 4e5, V1: 0.01, V2: 0.04 }));
    expect(sim.rendimiento).toBeGreaterThan(0);
    expect(sim.rendimiento).toBeLessThan(sim.carnot);
  });

  it('un ciclo recorrido al revés (antihorario) no es un motor: sin rendimiento', () => {
    const sim = simularCiclo({ n: 1, inicio: { P: 1e5, V: 0.01 }, tramos: [{ tipo: 'isobarico', V: 0.03 }, { tipo: 'isocorico', P: 4e5 }, { tipo: 'isobarico', V: 0.01 }, { tipo: 'isocorico', hasta: 'A' }] });
    expect(sim.total.W).toBeLessThan(0);
    expect(sim.rendimiento).toBeNull();
  });
});

describe('animación del ciclo', () => {
  it('estadoCiclo recorre los tramos, acumula Q, W, ΔU y termina en el estado final', () => {
    const sim = simularCiclo(cicloCarnot({ n: 1, Th: 600, Tc: 300, V1: 0.01, V2: 0.02 }));
    cerca(sim.duracion, 8);
    const s0 = estadoCiclo(sim, 0);
    cerca(s0.P, sim.estados.A.P); expect(s0.W).toBe(0);
    for (let t = 0; t <= sim.duracion; t += 0.37) {
      const s = estadoCiclo(sim, t);
      cerca(s.P * s.V, sim.gas.n * R * s.T, 1e-12);
      cerca(s.dU, s.Q - s.W, 1e-9);
    }
    const s1 = estadoCiclo(sim, 1);                 // mitad de la isoterma A → B
    cerca(s1.T, 600, 1e-12);
    const sf = estadoCiclo(sim, 99);
    cerca(sf.W, sim.total.W, 1e-12); cerca(sf.Q, sim.total.Q, 1e-12);
    cerca(sf.P, sim.estados.A.P, 1e-9);
  });

  it('las curvas de los tramos pasan por sus estados extremos', () => {
    const sim = simularCiclo(cicloCarnot({ n: 1, Th: 600, Tc: 300, V1: 0.01, V2: 0.02 }));
    sim.tramos.forEach((x, i) => {
      const c = curvaTramo(sim, i, 32);
      cerca(c[0][0], x.a.V); cerca(c[0][1], x.a.P);
      cerca(c[c.length - 1][0], x.b.V, 1e-12); cerca(c[c.length - 1][1], x.b.P, 1e-12);
    });
  });

  it('un tramo puede salir de un estado anterior (dos procesos desde el mismo estado)', () => {
    const sim = simularCiclo({ n: 1, inicio: { P: 3e5, V: 0.01, nombre: 'a' }, tramos: [{ tipo: 'isotermico', V: 0.025, nombre: 'b' }, { tipo: 'adiabatico', V: 0.025, desde: 'a', nombre: 'c' }] });
    expect(sim.ciclo).toBe(false);
    expect(sim.tramos[1].desde).toBe('a');
    expect(sim.estados.c.P).toBeLessThan(sim.estados.b.P);
    cerca(sim.estados.b.T, sim.estados.a.T, 1e-12);
  });
});

describe('escenas imposibles', () => {
  it('lanza con mensajes que dicen qué falla', () => {
    expect(() => simularCiclo({ n: 0, inicio: { P: 1e5, V: 0.01 }, tramos: [] })).toThrow(/cantidad de gas/);
    expect(() => simularCiclo({ n: 1, inicio: { P: 1e5 }, tramos: [] })).toThrow(/dos de P, V y T/);
    expect(() => simularCiclo({ n: 1, inicio: { P: 1e5, V: 0.01 }, tramos: [{ tipo: 'adiabatico', hasta: 'A' }, { tipo: 'isobarico', P: 1 }] })).toThrow();
    expect(() => simularCiclo({ n: 1, inicio: { P: 1e5, V: 0.01 }, tramos: [{ tipo: 'isobarico', V: 0.02 }, { tipo: 'isotermico', hasta: 'A' }] })).toThrow(/no llega al estado A/);
    expect(() => simularCiclo({ n: 1, inicio: { P: 1e5, V: 0.01 }, tramos: [{ tipo: 'isocorico', P: -5 }] })).toThrow(/positivos/);
    expect(() => simularCiclo({ n: 1, inicio: { P: 1e5, V: 0.01 }, tramos: [{ tipo: /** @type {any} */ ('espiral'), V: 0.02 }] })).toThrow(/desconocido/);
    expect(() => simularCiclo({ n: 1, inicio: { P: 1e5, V: 0.01 }, tramos: [{ tipo: 'isobarico', corta: { tipo: 'isobarico', estado: 'A' } }] })).toThrow(/no corta/);
  });
});

describe('determinismo', () => {
  it('la misma escena da exactamente el mismo resultado y no se modifica', () => {
    const esc = cicloOtto({ n: 0.02, V1: 5e-4, r: 8, T1: 300, T3: 1500 }), copia = JSON.parse(JSON.stringify(esc));
    expect(simularCiclo(esc)).toEqual(simularCiclo(esc));
    expect(esc).toEqual(copia);
  });
});
