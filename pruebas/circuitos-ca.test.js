// Corriente alterna: fuente senoidal en el tiempo y fasores, contra las
// soluciones de libro (RLC serie, filtros RC y RL) y contra la propia
// simulación en el tiempo cuando se apaga el transitorio.
import { describe, it, expect } from 'vitest';
import { simularCircuito, estadoEn, balance, indiceDe, respuestaFrecuencia, barridoFrecuencia, polar } from '../sistema/motores/circuitos.js';

const cerca = (a, b, rel, abs = 0) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.abs(b) + abs);
const R = 10, L = 0.1, C = 10e-6, V0 = 10;
const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C));
/** RLC serie alimentado por una fuente alterna de frecuencia f. */
const rlc = f => ({
  componentes: [
    { id: 'V', tipo: 'fuente-ca', nodos: ['a', '0'], V0, f, fase: 0 },
    { id: 'R', tipo: 'resistencia', nodos: ['a', 'b'], R },
    { id: 'L', tipo: 'inductor', nodos: ['b', 'c'], L },
    { id: 'C', tipo: 'capacitor', nodos: ['c', '0'], C },
    { id: 'T', tipo: 'tierra', nodos: ['0'] },
  ],
});

describe('fasores', () => {
  it('RLC serie: |I| = V₀/√(R² + (ωL − 1/ωC)²) y la fase −atan((ωL − 1/ωC)/R)', () => {
    for (const f of [f0 / 3, f0 / 1.3, f0, 1.7 * f0, 5 * f0]) {
      const w = 2 * Math.PI * f, X = w * L - 1 / (w * C);
      const [I, ph] = polar(respuestaFrecuencia(rlc(f), f).comp.get('R').i);
      cerca(I, V0 / Math.hypot(R, X), 1e-8);
      cerca(ph, -Math.atan2(X, R) * 180 / Math.PI, 0, 1e-7);
    }
  });
  it('en la resonancia la corriente es V₀/R y los voltajes de L y C se cancelan (Q = ω₀L/R veces V₀)', () => {
    const r = respuestaFrecuencia(rlc(f0), f0).comp;
    cerca(polar(r.get("R").i)[0], V0 / R, 1e-8);
    const vL = r.get('L').v, vC = r.get('C').v, Q = 2 * Math.PI * f0 * L / R;
    cerca(polar(vL)[0], Q * V0, 1e-8);
    cerca(Math.hypot(vL[0] + vC[0], vL[1] + vC[1]), 0, 0, 1e-6);
    // La fuente entrega exactamente la corriente de la resistencia
    cerca(polar(r.get("V").i)[0], V0 / R, 1e-8);
  });
  it('filtro RC: |V_C|/V₀ = 1/√(1 + (ωRC)²); el barrido cae 20 dB por década', () => {
    const rc = { componentes: [
      { id: 'V', tipo: 'fuente-ca', nodos: ['a', '0'], V0: 1, f: 100 },
      { id: 'R', tipo: 'resistencia', nodos: ['a', 'b'], R: 1000 },
      { id: 'C', tipo: 'capacitor', nodos: ['b', '0'], C: 1e-6 },
      { id: 'T', tipo: 'tierra', nodos: ['0'] },
    ] };
    const b = barridoFrecuencia(rc, { id: 'C', fmin: 1, fmax: 1e5, n: 51 });
    b.f.forEach((f, k) => {
      const x = 2 * Math.PI * f * 1000 * 1e-6;
      cerca(b.amp[k], 1 / Math.hypot(1, x), 1e-9);
      cerca(b.fase[k], -Math.atan(x) * 180 / Math.PI, 0, 1e-7);
    });
    const db = k => 20 * Math.log10(b.amp[k]);
    cerca(db(50) - db(40), -20, 0.01);
  });
  it('una batería no cuenta en alterna y el inductor es jωL', () => {
    const rl = { componentes: [
      { id: 'V', tipo: 'fuente-ca', nodos: ['a', 'x'], V0: 2, f: 50 },
      { id: 'E', tipo: 'bateria', nodos: ['x', '0'], E: 9 },
      { id: 'R', tipo: 'resistencia', nodos: ['a', 'b'], R: 5 },
      { id: 'L', tipo: 'inductor', nodos: ['b', '0'], L: 0.02 },
      { id: 'T', tipo: 'tierra', nodos: ['0'] },
    ] };
    const [I, ph] = polar(respuestaFrecuencia(rl, 50).comp.get('L').i), XL = 2 * Math.PI * 50 * 0.02;
    cerca(I, 2 / Math.hypot(5, XL), 1e-9);
    cerca(ph, -Math.atan2(XL, 5) * 180 / Math.PI, 0, 1e-7);
  });
});

describe('fuente alterna en el tiempo', () => {
  it('RLC en resonancia: tras el transitorio la corriente oscila con amplitud V₀/R y en fase con la fuente', () => {
    const T = 1 / f0, dur = 40 * T;
    const sim = simularCircuito(rlc(f0), { duracion: dur, dt: T / 64, inicio: 'reposo' });
    const iR = indiceDe(sim, 'R');
    let max = 0, tMax = 0;
    for (let t = dur - 2 * T; t <= dur; t += T / 256) { const I = estadoEn(sim, t).I[iR]; if (I > max) { max = I; tMax = t; } }
    cerca(max, V0 / R, 0.01);
    // En fase: el máximo de la corriente cae donde el seno de la fuente vale 1
    cerca(Math.sin(2 * Math.PI * f0 * tMax), 1, 0, 2e-3);
  });
  it('lejos de la resonancia, la amplitud y el desfase coinciden con los fasores', () => {
    const f = 2 * f0, T = 1 / f, dur = 40 * T;
    const sim = simularCircuito(rlc(f), { duracion: dur, dt: T / 64 });
    const [A, ph] = polar(respuestaFrecuencia(rlc(f), f).comp.get('C').v), iC = indiceDe(sim, 'C');
    let max = 0;
    for (let t = dur - T; t <= dur; t += T / 256) max = Math.max(max, estadoEn(sim, t).v[iC]);
    cerca(max, A, 0.01);
    const t = dur - 0.3 * T;
    cerca(estadoEn(sim, t).v[iC], A * Math.sin(2 * Math.PI * f * t + ph * Math.PI / 180), 0, 0.02 * A);
  });
  it('el balance de energía cierra con la fuente alterna', () => {
    const sim = simularCircuito(rlc(f0), { duracion: 0.05, dt: 1 / f0 / 64 });
    const b = balance(sim, sim.muestras[sim.muestras.length - 1]);
    expect(Math.abs(b.residuo)).toBeLessThan(1e-6 * Math.max(1, Math.abs(b.W)));
    expect(b.W).toBeGreaterThan(0);
  });
});
