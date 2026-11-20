// Transformador: dos bobinas acopladas (L₁, L₂ = n²L₁, M = k√(L₁L₂)).
// Fasores contra las ecuaciones del bipuerto, la simulación en el tiempo
// contra los fasores y el balance de energía con la energía mutua.
import { describe, it, expect } from 'vitest';
import { simularCircuito, estadoEn, balance, indiceDe, respuestaFrecuencia, polar } from '../sistema/motores/circuitos.js';

const cerca = (a, b, rel, abs = 0) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.abs(b) + abs);
const c = (re, im = 0) => ({ re, im });
const mul = (a, b) => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const sum = (a, b) => c(a.re + b.re, a.im + b.im);
const abs = a => Math.hypot(a.re, a.im);

const V0 = 100, f = 50, L1 = 10, n = 0.1, k = 0.999, R = 10;
const trafo = (Rc, kk = k) => ({ componentes: [
  { id: 'V', tipo: 'fuente-ca', nodos: ['a', '0'], V0, f },
  { id: 'Tr', tipo: 'transformador', nodos: ['a', '0', 's', 'g'], L1, n, k: kk },
  { id: 'R', tipo: 'resistencia', nodos: ['s', 'g'], R: Rc },
  { id: 'T', tipo: 'tierra', nodos: ['0'] },
  { id: 'T2', tipo: 'tierra', nodos: ['g'] },
] });
/** Voltaje del secundario según las ecuaciones de las bobinas acopladas. */
function v2Esperado(Rc, kk = k) {
  const w = 2 * Math.PI * f, L2 = n * n * L1, M = kk * Math.sqrt(L1 * L2);
  // i₂ = −jωM·i₁/(R + jωL₂); V0 = jωL₁i₁ + jωM·i₂ → i₁
  const a = div(c(0, -w * M), c(Rc, w * L2));            // i₂ = a·i₁
  const i1 = div(c(V0), sum(c(0, w * L1), mul(c(0, w * M), a)));
  const i2 = mul(a, i1);
  return { v2: mul(c(-Rc), i2), i1, i2 };
}

describe('transformador en alterna (fasores)', () => {
  it('con carga: V₂ coincide con las ecuaciones del bipuerto', () => {
    for (const Rc of [1, 10, 100]) {
      const z = respuestaFrecuencia(trafo(Rc), f).comp, e = v2Esperado(Rc);
      cerca(polar(z.get('Tr·s').v)[0], abs(e.v2), 1e-8);
      cerca(polar(z.get('Tr').i)[0], abs(e.i1), 1e-8);
      cerca(polar(z.get('Tr·s').i)[0], abs(e.i2), 1e-8);
    }
  });
  it('en vacío, V₂/V₁ = M/L₁ = k·n', () => {
    const z = respuestaFrecuencia(trafo(1e9), f).comp;
    cerca(polar(z.get('Tr·s').v)[0] / V0, k * n, 1e-6);
  });
  it('con buen acoplamiento y carga, la potencia pasa casi entera: V₁I₁ ≈ V₂I₂', () => {
    const z = respuestaFrecuencia(trafo(R, 0.9999), f).comp;
    const P1 = 0.5 * V0 * polar(z.get('Tr').i)[0] * Math.cos((polar(z.get('Tr').v)[1] - polar(z.get('Tr').i)[1]) * Math.PI / 180);
    const P2 = 0.5 * polar(z.get('R').v)[0] ** 2 / R;
    cerca(P2, P1, 1e-6);
  });
});

describe('transformador en el tiempo', () => {
  it('tras el transitorio, la amplitud del secundario es la de los fasores', () => {
    const T = 1 / f, sim = simularCircuito(trafo(R), { duracion: 20 * T, dt: T / 100 }), kR = indiceDe(sim, 'R');
    let max = 0;
    for (let t = 18 * T; t <= 20 * T; t += T / 400) max = Math.max(max, Math.abs(estadoEn(sim, t).v[kR]));
    cerca(max, abs(v2Esperado(R).v2), 0.01);
  });
  it('el balance de energía cierra contando la energía mutua M·i₁·i₂', () => {
    const T = 1 / f, sim = simularCircuito(trafo(R), { duracion: 5 * T, dt: T / 100 });
    const b = balance(sim, sim.muestras[sim.muestras.length - 1]);
    expect(Math.abs(b.residuo)).toBeLessThan(1e-6 * Math.abs(b.W));
    expect(Math.abs(b.numerico)).toBeLessThan(1e-3 * Math.abs(b.W));
  });
  it('k fuera de 0 a 0.9999 se rechaza', () => {
    expect(() => respuestaFrecuencia(trafo(R, 1), f)).toThrow(/acoplamiento/);
  });
});
