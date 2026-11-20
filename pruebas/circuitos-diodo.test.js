// Diodo y LED: ecuación de Shockley, polarización inversa, rectificador de
// media onda con y sin capacitor de filtro, y el balance de energía.
import { describe, it, expect } from 'vitest';
import { puntoOperacion, simularCircuito, estadoEn, balance, indiceDe, curvaDiodo, respuestaFrecuencia } from '../sistema/motores/circuitos.js';

const cerca = (a, b, rel, abs = 0) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.abs(b) + abs);
/** Corriente de E − R·I = Vd(I) por bisección, con la curva del motor. */
function corrienteSerie(E, R, cur) {
  let a = 0, b = E / R;
  for (let k = 0; k < 200; k++) { const m = (a + b) / 2; if (E - R * m - cur.vDe(m) > 0) a = m; else b = m; }
  return (a + b) / 2;
}
const conInversa = c => ({ ...c, vDe: I => c.nVt * Math.log(I / c.Is + 1) });

describe('curva del diodo', () => {
  it('pasa la corriente de referencia con el voltaje directo y casi nada en inversa', () => {
    const c = curvaDiodo({ Vd: 0.7, n: 1.8, Iref: 0.01 });
    cerca(c.I(0.7), 0.01, 1e-9);
    // En inversa solo pasa la corriente de saturación Is (unos nA)
    cerca(-c.I(-5), c.Is, 1e-3, 5e-12);
    expect(c.Is).toBeLessThan(1e-8);
    // Cada 60 mV·n la corriente se multiplica por unos diez
    cerca(c.I(0.7 + c.nVt * Math.LN10) / c.I(0.7), 10, 1e-6);
    // Por encima de 100 A sigue recta: no desborda
    expect(Number.isFinite(c.I(50))).toBe(true);
  });
});

describe('diodo en un circuito', () => {
  const serie = (E, inverso = false, tipo = 'diodo', extra = {}) => ({ componentes: [
    { id: 'E', tipo: 'bateria', nodos: ['a', '0'], E },
    { id: 'R', tipo: 'resistencia', nodos: ['a', 'b'], R: 1000 },
    { id: 'D', tipo, nodos: inverso ? ['0', 'b'] : ['b', '0'], ...extra },
    { id: 'T', tipo: 'tierra', nodos: ['0'] },
  ] });
  it('en directa: E − R·I = Vd(I) (Shockley)', () => {
    for (const E of [1, 5, 12]) {
      const op = puntoOperacion(serie(E)), I = op.I[op.ids.indexOf('R')];
      cerca(I, corrienteSerie(E, 1000, conInversa(curvaDiodo({ Vd: 0.7, n: 1.8, Iref: 0.01 }))), 1e-9);
    }
  });
  it('en inversa no conduce: todo el voltaje queda en el diodo', () => {
    const op = puntoOperacion(serie(12, true));
    expect(Math.abs(op.I[op.ids.indexOf('R')])).toBeLessThan(1e-8);
    cerca(-op.v[op.ids.indexOf('D')], 12, 1e-6);
  });
  it('un LED rojo con 5 V y 150 Ω: unos 20 mA con 2 V', () => {
    const c = { componentes: [
      { id: 'E', tipo: 'bateria', nodos: ['a', '0'], E: 5 },
      { id: 'R', tipo: 'resistencia', nodos: ['a', 'b'], R: 150 },
      { id: 'D', tipo: 'led', nodos: ['b', '0'], color: 'rojo' },
      { id: 'T', tipo: 'tierra', nodos: ['0'] },
    ] };
    const op = puntoOperacion(c), I = op.I[op.ids.indexOf('D')], V = op.v[op.ids.indexOf('D')];
    expect(I).toBeGreaterThan(0.019); expect(I).toBeLessThan(0.0205);
    cerca(V, 5 - 150 * I, 1e-9);
  });
  it('con diodos no hay fasores', () => {
    expect(() => respuestaFrecuencia(serie(5), 50)).toThrow(/no es lineal/);
  });
});

describe('rectificador de media onda', () => {
  const rect = C => ({ componentes: [
    { id: 'V', tipo: 'fuente-ca', nodos: ['a', '0'], V0: 10, f: 50 },
    { id: 'D', tipo: 'diodo', nodos: ['a', 'b'] },
    { id: 'R', tipo: 'resistencia', nodos: ['b', '0'], R: 1000 },
    ...(C ? [{ id: 'C', tipo: 'capacitor', nodos: ['b', '0'], C }] : []),
    { id: 'T', tipo: 'tierra', nodos: ['0'] },
  ] });
  it('sin filtro: pasa el semiciclo positivo menos la caída del diodo y bloquea el negativo', () => {
    const sim = simularCircuito(rect(0), { duracion: 0.04, dt: 0.0001 }), k = indiceDe(sim, 'R');
    let max = 0, min = 0;
    for (const m of sim.muestras) { max = Math.max(max, m.v[k]); min = Math.min(min, m.v[k]); }
    expect(max).toBeGreaterThan(9.2); expect(max).toBeLessThan(9.45);
    expect(min).toBeGreaterThan(-1e-5);   // solo la corriente de saturación por R
    const b = balance(sim, sim.muestras[sim.muestras.length - 1]);
    expect(Math.abs(b.residuo)).toBeLessThan(1e-6 * b.W);
  });
  it('con un capacitor de 100 µF: rizado de unos I/(f·C)', () => {
    const sim = simularCircuito(rect(100e-6), { duracion: 0.2, dt: 0.0001 }), k = indiceDe(sim, 'R');
    let max = 0, min = Infinity;
    for (const m of sim.muestras) if (m.t > 0.1) { max = Math.max(max, m.v[k]); min = Math.min(min, m.v[k]); }
    const rizado = max - min, esperado = (max / 1000) / (50 * 100e-6);
    cerca(rizado, esperado, 0.25);
    expect(min).toBeGreaterThan(6);
  });
});
