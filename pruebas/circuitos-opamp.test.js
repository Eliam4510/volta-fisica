// Diodo Zener y amplificador operacional: regulador, amplificador inversor
// y no inversor, saturación, comparador, integrador en el tiempo y fasores.
import { describe, it, expect } from 'vitest';
import { puntoOperacion, simularCircuito, estadoEn, balance, curvaDiodo, respuestaFrecuencia, polar } from '../sistema/motores/circuitos.js';

const cerca = (a, b, rel, abs = 0) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.abs(b) + abs);
const V = (op, nodo) => op.V[op.nodos.indexOf(nodo)];

describe('diodo Zener', () => {
  it('la curva: 5 mA justo en −Vz y conduce en directa como un diodo', () => {
    const c = curvaDiodo({ Vd: 0.7, n: 1.8, Iref: 0.01, Vz: 5.1 });
    cerca(-c.I(-5.1), 0.005, 1e-6);
    cerca(c.I(0.7), 0.01, 1e-6);
    expect(Math.abs(c.I(-3))).toBeLessThan(1e-8);
  });
  it('regulador: con 9 a 15 V de entrada, la salida se queda cerca de Vz', () => {
    const reg = E => ({ componentes: [
      { id: 'E', tipo: 'bateria', nodos: ['a', '0'], E },
      { id: 'R', tipo: 'resistencia', nodos: ['a', 'b'], R: 470 },
      { id: 'Z', tipo: 'zener', nodos: ['0', 'b'], Vz: 5.1 },
      { id: 'RL', tipo: 'resistencia', nodos: ['b', '0'], R: 2000 },
      { id: 'T', tipo: 'tierra', nodos: ['0'] },
    ] });
    const salidas = [9, 12, 15].map(E => V(puntoOperacion(reg(E)), 'b'));
    for (const v of salidas) { expect(v).toBeGreaterThan(5.08); expect(v).toBeLessThan(5.2); }
    // Al subir la entrada 6 V, la salida cambia menos de 0.05 V
    expect(salidas[2] - salidas[0]).toBeLessThan(0.05);
  });
});

describe('amplificador operacional', () => {
  const inversor = (Vin, Rf = 10000) => ({ componentes: [
    { id: 'E', tipo: 'bateria', nodos: ['i', '0'], E: Vin },
    { id: 'R1', tipo: 'resistencia', nodos: ['i', 'm'], R: 1000 },
    { id: 'Rf', tipo: 'resistencia', nodos: ['m', 'o'], R: Rf },
    { id: 'A', tipo: 'opamp', nodos: ['0', 'm', 'o'] },
    { id: 'T', tipo: 'tierra', nodos: ['0'] },
  ] });
  it('inversor: V_sal = −(Rf/R1)·V_ent, y el borne − es tierra virtual', () => {
    const op = puntoOperacion(inversor(0.5));
    cerca(V(op, 'o'), -5, 1e-3);
    expect(Math.abs(V(op, 'm'))).toBeLessThan(1e-3);
  });
  it('satura en ±Vsat cuando la ganancia pide más', () => {
    const op = puntoOperacion(inversor(-2));
    expect(V(op, 'o')).toBeGreaterThan(11.9); expect(V(op, 'o')).toBeLessThanOrEqual(12);
  });
  it('no inversor: V_sal = (1 + Rf/R1)·V_ent', () => {
    const c = { componentes: [
      { id: 'E', tipo: 'bateria', nodos: ['i', '0'], E: 0.5 },
      { id: 'A', tipo: 'opamp', nodos: ['i', 'm', 'o'] },
      { id: 'Rf', tipo: 'resistencia', nodos: ['o', 'm'], R: 9000 },
      { id: 'R1', tipo: 'resistencia', nodos: ['m', '0'], R: 1000 },
      { id: 'T', tipo: 'tierra', nodos: ['0'] },
    ] };
    cerca(V(puntoOperacion(c), 'o'), 5, 1e-3);
  });
  it('comparador sin realimentación: la salida va al tope según el signo', () => {
    const comp = Vp => ({ componentes: [
      { id: 'E', tipo: 'bateria', nodos: ['p', '0'], E: Vp },
      { id: 'A', tipo: 'opamp', nodos: ['p', '0', 'o'], Vsat: 10 },
      { id: 'RL', tipo: 'resistencia', nodos: ['o', '0'], R: 1000 },
      { id: 'T', tipo: 'tierra', nodos: ['0'] },
    ] });
    cerca(V(puntoOperacion(comp(0.3)), 'o'), 10, 1e-6);
    cerca(V(puntoOperacion(comp(-0.3)), 'o'), -10, 1e-6);
  });
  it('sin tierra no hay salida definida', () => {
    expect(() => puntoOperacion({ componentes: [{ id: 'A', tipo: 'opamp', nodos: ['a', 'b', 'c'] }, { id: 'R', tipo: 'resistencia', nodos: ['c', 'b'], R: 1 }] })).toThrow(/tierra/);
  });
  it('integrador: con 1 V de entrada la salida baja a −t/(RC) hasta saturar', () => {
    const c = { componentes: [
      { id: 'E', tipo: 'bateria', nodos: ['i', '0'], E: 1 },
      { id: 'R', tipo: 'resistencia', nodos: ['i', 'm'], R: 1000 },
      { id: 'C', tipo: 'capacitor', nodos: ['m', 'o'], C: 1e-6 },
      { id: 'A', tipo: 'opamp', nodos: ['0', 'm', 'o'] },
      { id: 'T', tipo: 'tierra', nodos: ['0'] },
    ] };
    const sim = simularCircuito(c, { duracion: 0.02, dt: 1e-4 }), ko = sim.nodos.indexOf('o');
    const vo = t => estadoEn(sim, t).V[ko];
    cerca(vo(0.005), -5, 2e-3);
    cerca(vo(0.008), -8, 2e-3);
    expect(vo(0.019)).toBeLessThan(-11.8);
    const b = balance(sim, sim.muestras[sim.muestras.length - 1]);
    expect(Math.abs(b.residuo)).toBeLessThan(1e-6 * Math.max(1, Math.abs(b.W)));
  });
  it('en alterna, el inversor da −Rf/R1 con 180° de desfase', () => {
    const c = { componentes: [
      { id: 'V', tipo: 'fuente-ca', nodos: ['i', '0'], V0: 1, f: 1000 },
      { id: 'R1', tipo: 'resistencia', nodos: ['i', 'm'], R: 1000 },
      { id: 'Rf', tipo: 'resistencia', nodos: ['m', 'o'], R: 4700 },
      { id: 'A', tipo: 'opamp', nodos: ['0', 'm', 'o'] },
      { id: 'RL', tipo: 'resistencia', nodos: ['o', '0'], R: 10000 },
      { id: 'T', tipo: 'tierra', nodos: ['0'] },
    ] };
    const [amp, fase] = polar(respuestaFrecuencia(c, 1000).comp.get('RL').v);
    cerca(amp, 4.7, 1e-3);
    cerca(Math.abs(fase), 180, 0, 0.01);
  });
});
