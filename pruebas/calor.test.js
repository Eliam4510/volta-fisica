// Motor de calor y calorimetría: equilibrio térmico Σm·c·T/Σm·c, relajación
// exponencial de dos cuerpos, fusión con meseta a T_f y calor latente,
// calentamiento por efecto Joule, aire a temperatura fija, vehículo que
// convierte energía química en cinética y la cinética en calor al frenar.
// Balance de energía exacto en cada muestra, determinismo y errores.
import { describe, it, expect } from 'vitest';
import {
  simularCalor, equilibrioCalor, residuoCalor, temperaturaMezcla, entalpia, estadoTermico, estadoCalor, MATERIALES,
} from '../sistema/motores/calor.js';

const K0 = 273.15;
const cerca = (a, b, tol = 1e-12) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
const ultima = sim => sim.muestras[sim.muestras.length - 1];
const residuoMax = sim => Math.max(...sim.muestras.map(s => Math.abs(residuoCalor(s))));

describe('equilibrio térmico', () => {
  it('dos cuerpos: T − T_eq decae como exp(−G·(1/C1 + 1/C2)·t) hacia Σm·c·T/Σm·c', () => {
    const e = { cuerpos: [{ nombre: 'Cobre', m: 0.5, c: 385, T: K0 + 90 }, { nombre: 'Aluminio', m: 0.3, c: 897, T: K0 + 20 }], contactos: [{ a: 0, b: 1, G: 5 }] };
    const sim = simularCalor(e, [], { duracion: 60 });
    const C1 = 0.5 * 385, C2 = 0.3 * 897, Teq = temperaturaMezcla(e.cuerpos), k = 5 * (1 / C1 + 1 / C2);
    cerca(Teq, (C1 * (K0 + 90) + C2 * (K0 + 20)) / (C1 + C2), 1e-15);
    for (const t of [5, 20, 60]) {
      const s = estadoCalor(sim, t);
      cerca(s.T[0] - s.T[1], 70 * Math.exp(-k * t), 1e-9);          // la solución exponencial del par es exacta
    }
    expect(residuoMax(sim)).toBeLessThan(1e-9);
  });

  it('calorímetro de tres cuerpos (MEXT 2010 2-A): 23.8 °C ≈ 24 °C', () => {
    const e = { cuerpos: [{ nombre: 'Vaso', m: 0.1, c: 400, T: K0 + 20 }, { nombre: 'Agua', m: 0.2, c: 4200, T: K0 + 20 }, { nombre: 'Cobre', m: 0.15, c: 400, T: K0 + 80 }], contactos: [{ a: 0, b: 1, G: 20 }, { a: 1, b: 2, G: 10, activo: false }] };
    const sim = simularCalor(e, [{ t: 3, tipo: 'contacto', i: 1, valor: true }], { duracion: 150 }), q = ultima(sim);
    cerca(equilibrioCalor(e).T - K0, 22400 / 940, 1e-12);
    for (const T of q.T) cerca(T - K0, 22400 / 940, 1e-6);
    // Antes del contacto la pieza no cambia
    cerca(estadoCalor(sim, 2.9).T[2], K0 + 80, 1e-12);
    expect(sim.eventos[0].nombre).toMatch(/Se ponen en contacto Agua y Cobre/);
  });
});

describe('cambio de fase', () => {
  const hielo = { nombre: 'Hielo', m: 0.05, ...MATERIALES.hielo, T: K0 - 10 };
  it('entalpía y temperatura son inversas, con meseta a T_f mientras se funde', () => {
    for (const T of [K0 - 20, K0 - 0.5, K0 + 0.5, K0 + 30]) cerca(estadoTermico(hielo, entalpia(hielo, T)).T, T, 1e-12);
    const mitad = estadoTermico(hielo, 0.5 * 0.05 * 334e3);
    expect(mitad.T).toBe(K0); cerca(mitad.x, 0.5); expect(mitad.C).toBe(Infinity);
  });

  it('hielo en agua caliente: se funde entero y el equilibrio es el del balance con calor latente', () => {
    const e = { cuerpos: [{ nombre: 'Agua', m: 0.3, c: 4186, T: K0 + 40 }, hielo], contactos: [{ a: 0, b: 1, G: 15 }] };
    // 0.3·4186·(40 − T) = 0.05·2100·10 + 0.05·334000 + 0.05·4186·T
    const Tesp = (0.3 * 4186 * 40 - 0.05 * 2100 * 10 - 0.05 * 334e3) / (0.35 * 4186);
    cerca(equilibrioCalor(e).T - K0, Tesp, 1e-9);
    const sim = simularCalor(e, [], { duracion: 300 }), q = ultima(sim);
    cerca(q.T[0] - K0, Tesp, 1e-5); cerca(q.T[1] - K0, Tesp, 1e-5); expect(q.x[1]).toBe(1);
    // Hay una meseta: el hielo pasa un rato a 0 °C con x entre 0 y 1
    const meseta = sim.muestras.filter(s => s.T[1] === K0 && s.x[1] > 0 && s.x[1] < 1);
    expect(meseta.length).toBeGreaterThan(50);
    expect(residuoMax(sim)).toBeLessThan(1e-8);
  });

  it('poco calor: queda hielo a 0 °C (el equilibrio cae en la meseta)', () => {
    const e = { cuerpos: [{ nombre: 'Agua', m: 0.1, c: 4186, T: K0 + 10 }, { ...hielo, m: 0.2, T: K0 - 2 }], contactos: [{ a: 0, b: 1, G: 15 }] };
    const eq = equilibrioCalor(e);
    expect(eq.T).toBe(K0);
    // Fundido: (0.1·4186·10 − 0.2·2100·2)/(0.2·334000)
    const x = (0.1 * 4186 * 10 - 0.2 * 2100 * 2) / (0.2 * 334e3);
    cerca(eq.x[1], x, 1e-12);
    const q = ultima(simularCalor(e, [], { duracion: 400 }));
    cerca(q.T[0], K0, 1e-6); expect(q.T[1]).toBe(K0); cerca(q.x[1], x, 1e-5);
  });
});

describe('fuentes de energía', () => {
  it('efecto Joule: ΔT = (V²/R)·t / Σm·c sin pérdidas', () => {
    const e = { cuerpos: [{ nombre: 'Agua', m: 0.5, c: 4186, T: K0 + 20 }], calentadores: [{ cuerpo: 0, P: 24 ** 2 / 2 }] };
    const sim = simularCalor(e, [{ t: 5, tipo: 'calentador', i: 0, valor: true }, { t: 125, tipo: 'calentador', i: 0, valor: false }], { duracion: 150 });
    const q = ultima(sim);
    cerca(q.T[0] - K0 - 20, 288 * 120 / (0.5 * 4186), 1e-9);
    cerca(q.Qcal[0], 288 * 120, 1e-9);
    expect(residuoMax(sim) / q.Qcal[0]).toBeLessThan(1e-11);
  });

  it('aire a temperatura fija: un cuerpo se enfría hacia ella con exp(−G·t/C)', () => {
    const e = { cuerpos: [{ nombre: 'Hierro', m: 1, c: 449, T: K0 + 100 }], ambiente: { T: K0 + 20, G: [3] } };
    const sim = simularCalor(e, [], { duracion: 200 });
    cerca(estadoCalor(sim, 100).T[0] - K0 - 20, 80 * Math.exp(-3 * 100 / 449), 1e-9);
    expect(residuoMax(sim)).toBeLessThan(1e-9);
  });

  it('vehículo (MEXT 2010 2-C): química → cinética (con rendimiento η) → calor en los frenos', () => {
    const e = { cuerpos: [{ nombre: 'Motor', m: 150, c: 450, T: K0 + 20 }, { nombre: 'Frenos', m: 10, c: 450, T: K0 + 20 }], vehiculo: { m: 1000, P: 40e3, eta: 0.25, F: 5000, vmax: 20, motor: 0, frenos: 1 } };
    const sim = simularCalor(e, [{ t: 1, tipo: 'acelerar', valor: true }, { t: 9, tipo: 'frenar', valor: true }], { duracion: 20 });
    const Ek = 0.5 * 1000 * 400, q = ultima(sim);
    cerca(estadoCalor(sim, 8).Ek, Ek, 1e-12);
    cerca(q.Equim, Ek / 0.25, 1e-12);
    cerca(q.Qmotor, Ek / 0.25 - Ek, 1e-12);
    cerca(q.Qfrenos, Ek, 1e-9);
    expect(q.v).toBe(0);
    cerca(q.T[1] - K0 - 20, Ek / (10 * 450), 1e-9);
    expect(sim.eventos.map(x => x.nombre)).toEqual(['El motor empieza a acelerar', 'Llega a la rapidez de crucero', 'Se pisa el freno', 'El vehículo se detiene']);
    // Tiempos exactos: P·t = ΔE_k y v/a para frenar
    cerca(sim.eventos[1].t, 1 + Ek / 40e3, 1e-9); cerca(sim.eventos[3].t, 9 + 20 / 5, 1e-9);
    expect(residuoMax(sim) / (Ek / 0.25)).toBeLessThan(1e-12);
  });
});

describe('determinismo y errores', () => {
  it('la misma escena da exactamente el mismo resultado y el guion no se modifica', () => {
    const e = { cuerpos: [{ nombre: 'A', m: 1, c: 400, T: 350 }, { nombre: 'B', m: 2, c: 900, T: 290 }], contactos: [{ a: 0, b: 1, G: 4, activo: false }] };
    const guion = [{ t: 2, tipo: 'contacto', i: 0, valor: true }], copia = JSON.parse(JSON.stringify(guion));
    expect(simularCalor(e, guion, { duracion: 10 })).toEqual(simularCalor(e, guion, { duracion: 10 }));
    expect(guion).toEqual(copia);
  });

  it('escenas imposibles lanzan un error claro', () => {
    expect(() => simularCalor({ cuerpos: [] })).toThrow(/al menos un cuerpo/);
    expect(() => simularCalor({ cuerpos: [{ nombre: 'X', m: 0, c: 400, T: 300 }] })).toThrow(/masa/);
    expect(() => simularCalor({ cuerpos: [{ nombre: 'X', m: 1, c: 400, T: -3 }] })).toThrow(/kelvin/);
    expect(() => simularCalor({ cuerpos: [{ nombre: 'X', m: 1, c: 400, T: 300 }], contactos: [{ a: 0, b: 0, G: 1 }] })).toThrow(/contacto/);
    expect(() => simularCalor({ cuerpos: [{ nombre: 'X', m: 1, c: 400, T: 300 }], vehiculo: { m: 1, P: 1, eta: 2, F: 1, vmax: 1, motor: 0, frenos: 0 } })).toThrow(/rendimiento/);
  });
});
