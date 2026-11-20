// Transistor bipolar (Ebers–Moll): zona activa (I_C = β·I_B), saturación,
// corte, PNP como espejo del NPN, conservación de la corriente y balance de
// energía en un transitorio.
import { describe, it, expect } from 'vitest';
import { puntoOperacion, simularCircuito, balance, indiceDe, respuestaFrecuencia } from '../sistema/motores/circuitos.js';

const cerca = (a, b, rel, abs = 0) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.abs(b) + abs);
/** Emisor común: Vcc por Rc al colector y por Rb a la base. */
const emisorComun = (Rb, pol = 'npn', Vcc = 12) => {
  const s = pol === 'pnp' ? -1 : 1;
  return { componentes: [
    { id: 'Vcc', tipo: 'bateria', nodos: ['v', '0'], E: s * Vcc },
    { id: 'Rc', tipo: 'resistencia', nodos: ['v', 'c'], R: 1000 },
    { id: 'Rb', tipo: 'resistencia', nodos: ['v', 'b'], R: Rb },
    { id: 'Q', tipo: 'transistor', nodos: ['c', 'b', '0'], polaridad: pol, beta: 100 },
    { id: 'T', tipo: 'tierra', nodos: ['0'] },
  ] };
};
const lee = (op, id) => ({ I: op.I[op.ids.indexOf(id)], v: op.v[op.ids.indexOf(id)] });

describe('transistor NPN', () => {
  it('zona activa: I_C ≈ β·I_B, I_B ≈ (Vcc − V_BE)/R_B y V_CE = Vcc − R_C·I_C', () => {
    const op = puntoOperacion(emisorComun(470e3)), Ic = lee(op, 'Q').I, Ib = lee(op, 'Q·b').I, Vbe = lee(op, 'Q·b').v;
    cerca(Ib, (12 - Vbe) / 470e3, 1e-6);
    cerca(Ic / Ib, 100, 0.01);
    cerca(lee(op, 'Q').v, 12 - 1000 * Ic, 1e-6);
    expect(Vbe).toBeGreaterThan(0.6); expect(Vbe).toBeLessThan(0.7);
    // La corriente que entra por colector y base sale por el emisor: es la de Rc más la de Rb
    cerca(lee(op, 'Rc').I + lee(op, 'Rb').I, Ic + Ib, 1e-9);
  });
  it('saturación: con mucha corriente de base, V_CE cae a unas décimas y R_C limita I_C', () => {
    const op = puntoOperacion(emisorComun(10e3)), Vce = lee(op, 'Q').v, Ic = lee(op, 'Q').I, Ib = lee(op, 'Q·b').I;
    expect(Vce).toBeLessThan(0.25);
    cerca(Ic, (12 - Vce) / 1000, 1e-6);
    expect(Ic / Ib).toBeLessThan(20);
  });
  it('corte: sin corriente de base no hay corriente de colector', () => {
    const c = emisorComun(470e3);
    c.componentes[2] = { id: 'Rb', tipo: 'resistencia', nodos: ['b', '0'], R: 470e3 };
    const op = puntoOperacion(c);
    expect(Math.abs(lee(op, 'Q').I)).toBeLessThan(1e-9);
    cerca(lee(op, 'Q').v, 12, 1e-6);
  });
  it('con transistores no hay fasores', () => {
    expect(() => respuestaFrecuencia(emisorComun(470e3), 50)).toThrow(/no es lineal/);
  });
});

describe('transistor PNP', () => {
  it('es el espejo del NPN: mismas corrientes con los signos al revés', () => {
    const n = puntoOperacion(emisorComun(470e3, 'npn')), p = puntoOperacion(emisorComun(470e3, 'pnp'));
    cerca(lee(p, 'Q').I, -lee(n, 'Q').I, 1e-9);
    cerca(lee(p, 'Q·b').I, -lee(n, 'Q·b').I, 1e-9);
    cerca(lee(p, 'Q').v, -lee(n, 'Q').v, 1e-9);
  });
});

describe('transistor en el tiempo', () => {
  it('como interruptor: al cerrar la base se enciende, y el balance de energía cierra', () => {
    const c = { componentes: [
      { id: 'Vcc', tipo: 'bateria', nodos: ['v', '0'], E: 9 },
      { id: 'Rc', tipo: 'resistencia', nodos: ['v', 'c'], R: 470 },
      { id: 'S', tipo: 'interruptor', nodos: ['v', 'x'], cerrado: false },
      { id: 'Rb', tipo: 'resistencia', nodos: ['x', 'b'], R: 10e3 },
      { id: 'Cb', tipo: 'capacitor', nodos: ['b', '0'], C: 1e-6 },
      { id: 'Q', tipo: 'transistor', nodos: ['c', 'b', '0'] },
      { id: 'T', tipo: 'tierra', nodos: ['0'] },
    ], acciones: [{ t: 0.01, id: 'S', estado: true }] };
    const sim = simularCircuito(c, { duracion: 0.1, dt: 1e-4 }), k = indiceDe(sim, 'Q');
    const fin = sim.muestras[sim.muestras.length - 1];
    expect(Math.abs(sim.muestras[50].I[k])).toBeLessThan(1e-9);
    expect(fin.I[k]).toBeGreaterThan(0.017);
    const b = balance(sim, fin);
    expect(Math.abs(b.residuo)).toBeLessThan(1e-6 * b.W);
  });
});
