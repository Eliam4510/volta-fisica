// Escenas MEXT de Circuitos (E3 redes de capacitores y E4 corriente continua
// y RC): cada circuito reproduce la escena de la pantalla
// (sistema/prototipos/circuitos.js), con sus valores y sus instantes, y la
// simulación tiene que dar la respuesta del examen: la fórmula del enunciado y
// la opción que le corresponde. Las escenas 2019 P2, 2023 P2 y 2027 1-(3) se
// prueban en pruebas/circuitos.test.js.
import { describe, it, expect } from 'vitest';
import { simularCircuito, puntoOperacion, estadoEn, balance, indiceDe, curvaBombilla } from '../sistema/motores/circuitos.js';

// |a − b| ≤ rel·|b| + abs
const cerca = (a, b, rel = 1e-9, abs = 0) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.abs(b) + abs);
const ultima = sim => sim.muestras[sim.muestras.length - 1];
// Opción del examen más cercana a un valor: [letra, distancia relativa]
const LETRAS = 'abcdefghijklmnopqrstuvwxyz';
function opcion(valor, valores) {
  let mejor = 0;
  valores.forEach((v, i) => { if (Math.abs(valor - v) < Math.abs(valor - valores[mejor])) mejor = i; });
  return [`(${LETRAS[mejor]})`, Math.abs(valor - valores[mejor]) / Math.abs(valores[mejor])];
}
const esOpcion = (valor, valores, letra, rel = 1e-6) => { const [l, d] = opcion(valor, valores); expect(l).toBe(letra); expect(d).toBeLessThan(rel); };
function balanceCierra(sim, rel = 1e-12) {
  let escala = 0;
  for (const m of sim.muestras) { const b = balance(sim, m); escala = Math.max(escala, Math.abs(b.W), Math.abs(b.U), sim.U0); }
  for (const m of sim.muestras) expect(Math.abs(balance(sim, m).residuo)).toBeLessThanOrEqual(rel * escala);
}
// Primera muestra después de un evento (justo después de conmutar)
const despues = (sim, t) => sim.muestras.find(m => m.t > t);

// ---------------------------------------------------------------------------
describe('MEXT 2014 1-(4): C₁ ∥ C₂ en serie con C₃', () => {
  // Valores de la escena: E = 12 V, C₁ = 1 mF, C₂ = 2 mF, C₃ = 3 mF; S se cierra en t = 1 s
  const circuito = ({ E = 12, C1 = 1e-3, C2 = 2e-3, C3 = 3e-3 } = {}) => ({
    componentes: [
      { id: 'E', tipo: 'bateria', nodos: ['p', 'g'], E },
      { id: 'C1', tipo: 'capacitor', nodos: ['p', 'A'], C: C1 },
      { id: 'C2', tipo: 'capacitor', nodos: ['p', 'A'], C: C2 },
      { id: 'C3', tipo: 'capacitor', nodos: ['A', 's'], C: C3 },
      { id: 'S', tipo: 'interruptor', nodos: ['s', 'g'] },
      { id: 'T', tipo: 'tierra', nodos: ['g'] },
    ],
    acciones: [{ t: 1, id: 'S', estado: true }],
  });
  // Opciones (a)–(f) del examen con los valores de la escena
  const opciones = ({ E, C1, C2, C3 }) => [(C1 + C3) * E, C1 * C3 * E / (C1 + C2 + C3), C1 * C2 * E / (C1 + C2 + C3), (C1 + C2 + C3) * E, C1 * C3 * E / (C1 + C2), C1 * C2 * E / C3];

  for (const modo of ['ideal', 'realista']) {
    it(`${modo}: la carga de C₁ es C₁C₃E/(C₁ + C₂ + C₃), la opción (b)`, () => {
      const v = { E: 12, C1: 1e-3, C2: 2e-3, C3: 3e-3 };
      const sim = simularCircuito(circuito(v), { duracion: 4, dt: 0.01, modo, rCable: 0.05 });
      const q1 = ultima(sim).q[indiceDe(sim, 'C1')];
      esOpcion(q1, opciones(v), '(b)', modo === 'ideal' ? 1e-12 : 1e-9);
      cerca(estadoEn(sim, 0.99).q[indiceDe(sim, 'C1')], 0, 0, 1e-15);
      // Un solo evento: el cierre de S (con todo descargado, t = 0 no es una conexión)
      expect(sim.eventos.map(e => e.t)).toEqual([1]);
    });
  }
  it('con otros valores la respuesta sigue siendo (b); en modo ideal se pierde la mitad del trabajo', () => {
    const v = { E: 7, C1: 4e-3, C2: 0.5e-3, C3: 1.5e-3 };
    const sim = simularCircuito(circuito(v), { duracion: 4, dt: 0.01 });
    esOpcion(ultima(sim).q[indiceDe(sim, 'C1')], opciones(v), '(b)', 1e-12);
    const Ceq = (v.C1 + v.C2) * v.C3 / (v.C1 + v.C2 + v.C3);
    cerca(sim.eventos[0].perdida, Ceq * v.E * v.E / 2, 1e-12);
    balanceCierra(sim);
  });
});

// ---------------------------------------------------------------------------
describe('MEXT 2013 P2: tres capacitores, dos resistencias y dos interruptores', () => {
  // Datos del examen: C₁ = C₃ = 2 µF, C₂ = 4 µF, V = 6 V; R₁ = R₂ = 200 kΩ (no se dan).
  // S₁ se cierra en 0.5 s; en 6 s, S₁ se abre y S₂ se cierra
  const circuito = (R = 2e5) => ({
    componentes: [
      { id: 'V', tipo: 'bateria', nodos: ['p', 'n'], E: 6 },
      { id: 'S1', tipo: 'interruptor', nodos: ['p', 'w'] },
      { id: 'R1', tipo: 'resistencia', nodos: ['w', 'x'], R },
      { id: 'R2', tipo: 'resistencia', nodos: ['x', 'z'], R },
      { id: 'S2', tipo: 'interruptor', nodos: ['z', 'k'] },
      { id: 'C2', tipo: 'capacitor', nodos: ['x', 'y'], C: 4e-6 },
      { id: 'C1', tipo: 'capacitor', nodos: ['y', 'n'], C: 2e-6 },
      { id: 'C3', tipo: 'capacitor', nodos: ['k', 'y'], C: 2e-6 },
      { id: 'T', tipo: 'tierra', nodos: ['n'] },
    ],
    acciones: [{ t: 0.5, id: 'S1', estado: true }, { t: 6, id: 'S1', estado: false }, { t: 6, id: 'S2', estado: true }],
  });
  // La misma lista de valores para los cinco huecos (en µC, V o µJ)
  const LISTA = [2, 4, 8, 16, 32, 2 / 3, 4 / 3, 8 / 3, 16 / 3, 32 / 3, 2 / 9, 4 / 9, 8 / 9, 16 / 9, 32 / 9];
  const sim = simularCircuito(circuito(), { duracion: 12, dt: 0.01 });
  const k = id => indiceDe(sim, id), a = estadoEn(sim, 6), b = ultima(sim);

  it('(1) q₁ = 8 µC (c) y (2) su voltaje 4 V (b), antes de abrir S₁', () => {
    esOpcion(a.q[k('C1')] * 1e6, LISTA, '(c)');
    esOpcion(a.v[k('C1')], LISTA, '(b)');
    cerca(a.q[k('C2')], a.q[k('C1')], 1e-9);   // en serie: la misma carga
  });
  it('(3) q₃ = 8/3 µC (h): C₂ reparte su carga con C₃', () => esOpcion(b.q[k('C3')] * 1e6, LISTA, '(h)'));
  it('(4) U₂ + U₃ = 16/3 µJ (i)', () => esOpcion((b.U[k('C2')] + b.U[k('C3')]) * 1e6, LISTA, '(i)'));
  it('(5) calor en R₂ tras cerrar S₂: 8/3 µJ (h), lo que pierde la energía de los capacitores', () => {
    const Q = b.Q[k('R2')] - a.Q[k('R2')];
    cerca(a.Q[k('R2')], 0, 0, 1e-20);             // antes no pasa corriente por R₂
    esOpcion(Q * 1e6, LISTA, '(h)');
    cerca(Q, a.U[k('C2')] + a.U[k('C3')] - b.U[k('C2')] - b.U[k('C3')], 1e-6);
  });
  it('C₁ queda aislado con su carga y las respuestas no dependen de R', () => {
    cerca(b.q[k('C1')], 8e-6, 1e-8);             // e^(−5.5 s/τ) ≈ 10⁻⁹ por cargar
    const otro = simularCircuito(circuito(5e4), { duracion: 12, dt: 0.01 });
    cerca(ultima(otro).q[indiceDe(otro, 'C3')], 8e-6 / 3, 1e-9);
    cerca(ultima(otro).Q[indiceDe(otro, 'R2')], 8e-6 / 3, 1e-6);
    balanceCierra(sim);
  });
});

// ---------------------------------------------------------------------------
describe('MEXT 2012 1-(2): C en paralelo con R₂, en serie con R₁', () => {
  // Escena: E = 6 V, R₁ = 1 kΩ, R₂ = 2 kΩ, C = 500 µF; S se cierra en 0.5 s
  const v = { E: 6, R1: 1000, R2: 2000, C: 500e-6 };
  const sim = simularCircuito({
    componentes: [
      { id: 'E', tipo: 'bateria', nodos: ['p', 'n'], E: v.E },
      { id: 'R1', tipo: 'resistencia', nodos: ['p', 'x'], R: v.R1 },
      { id: 'R2', tipo: 'resistencia', nodos: ['x', 'y'], R: v.R2 },
      { id: 'C', tipo: 'capacitor', nodos: ['x', 'y'], C: v.C },
      { id: 'S', tipo: 'interruptor', nodos: ['y', 'n'] },
      { id: 'T', tipo: 'tierra', nodos: ['n'] },
    ],
    acciones: [{ t: 0.5, id: 'S', estado: true }],
  }, { duracion: 8, dt: 0.01 });
  const { E, R1, R2, C } = v;

  it('(2) la carga es R₂CE/(R₁ + R₂), la opción (f)', () => {
    const q = ultima(sim).q[indiceDe(sim, 'C')];
    esOpcion(q, [C * E, C * E / R1, C * E / R2, C * E / (R1 + R2), R1 / (R1 + R2) * C * E, R2 / (R1 + R2) * C * E], '(f)', 1e-9);
  });
  it('justo al cerrar, C descargado se lleva la corriente E/R₁; al final pasa E/(R₁ + R₂) por R₁ y R₂', () => {
    cerca(despues(sim, 0.5).I[indiceDe(sim, 'C')], E / R1, 1e-6);
    cerca(ultima(sim).I[indiceDe(sim, 'R1')], E / (R1 + R2), 1e-9);
    cerca(ultima(sim).I[indiceDe(sim, 'R2')], E / (R1 + R2), 1e-9);
    cerca(ultima(sim).I[indiceDe(sim, 'C')], 0, 0, 1e-10);
  });
});

// ---------------------------------------------------------------------------
describe('MEXT 2010 4-C: bombilla con su curva I-V en serie con 5 Ω y 12 V', () => {
  // La curva de la figura es I = 4V/(V + 2): el modelo de filamento con R₀ = 0.5 Ω
  // en frío y b = 0.25 Ω/V, que el motor arma con Vn = 6 V, Pn = 18 W y frío = 4
  const bombilla = { Vn: 6, Pn: 18, frio: 4 };
  const circuito = (b = bombilla) => ({ componentes: [
    { id: 'E', tipo: 'bateria', nodos: ['p', 'g'], E: 12 },
    { id: 'B', tipo: 'bombilla', nodos: ['p', 'm'], ...b },
    { id: 'R', tipo: 'resistencia', nodos: ['m', 'g'], R: 5 },
    { id: 'T', tipo: 'tierra', nodos: ['g'] },
  ] });
  const OPC = [1, 4, 10, 18, 34, 42];

  it('la curva pasa por los puntos de la figura: (1, 4/3), (2, 2), (6, 3) y (12, 24/7)', () => {
    const c = curvaBombilla(bombilla);
    for (const [V, I] of [[1, 4 / 3], [2, 2], [6, 3], [12, 24 / 7]]) cerca(c.I(V), I, 1e-12);
  });
  it('Q3: punto de operación (2 V, 2 A) y potencia 4 W, la opción (b)', () => {
    const sim = simularCircuito(circuito(), { duracion: 2, dt: 0.01 }), m = ultima(sim), k = indiceDe(sim, 'B');
    cerca(m.v[k], 2, 1e-9);
    cerca(m.I[k], 2, 1e-9);
    esOpcion(m.v[k] * m.I[k], OPC, '(b)', 1e-9);
  });
  it('con la curva leída de la figura como tabla, la respuesta sigue siendo (b)', () => {
    const curva = [[1, 1.35], [2, 2], [3, 2.4], [4, 2.65], [5, 2.85], [6, 3], [8, 3.2], [10, 3.3], [12, 3.4]];
    const op = puntoOperacion(circuito({ curva })), k = op.ids.indexOf('B');
    esOpcion(op.v[k] * op.I[k], OPC, '(b)', 0.02);
  });
});

// ---------------------------------------------------------------------------
describe('MEXT 2007 1-(2): puente de resistencias con un voltímetro ideal', () => {
  // E en el vértice de arriba; R₁ y R₃ a la izquierda (punto P), R₂ y R₄ a la
  // derecha (punto Q); el voltímetro marca V_Q − V_P
  const puente = ({ E, R1, R2, R3, R4 }) => ({ componentes: [
    { id: 'E', tipo: 'bateria', nodos: ['top', 'bot'], E },
    { id: 'R1', tipo: 'resistencia', nodos: ['top', 'P'], R: R1 },
    { id: 'R3', tipo: 'resistencia', nodos: ['P', 'bot'], R: R3 },
    { id: 'R2', tipo: 'resistencia', nodos: ['top', 'Q'], R: R2 },
    { id: 'R4', tipo: 'resistencia', nodos: ['Q', 'bot'], R: R4 },
    { id: 'Vm', tipo: 'voltimetro', nodos: ['Q', 'P'] },
    { id: 'T', tipo: 'tierra', nodos: ['bot'] },
  ] });
  // Las seis opciones del examen
  const opciones = ({ E, R1, R2, R3, R4 }) => [
    (R1 * R2 - R3 * R4) / ((R1 + R2) * (R3 + R4)) * E, (R1 * R4 - R2 * R3) / ((R1 + R3) * (R2 + R4)) * E, (R1 * R3 - R2 * R4) / ((R1 + R4) * (R2 + R3)) * E,
    (R1 * R2 + R3 * R4) / ((R1 + R2) * (R3 + R4)) * E, (R1 * R4 + R2 * R3) / ((R1 + R3) * (R2 + R4)) * E, (R1 * R3 + R2 * R4) / ((R1 + R4) * (R2 + R3)) * E,
  ];

  it('(2) con los valores de la escena marca 2 V, la opción (b)', () => {
    const v = { E: 6, R1: 20, R2: 10, R3: 10, R4: 20 };
    const sim = simularCircuito(puente(v), { duracion: 2, dt: 0.01 }), m = ultima(sim);
    cerca(m.v[indiceDe(sim, 'Vm')], 2, 1e-12);
    esOpcion(m.v[indiceDe(sim, 'Vm')], opciones(v), '(b)', 1e-12);
    expect(m.I[indiceDe(sim, 'Vm')]).toBe(0);    // ideal: no toma corriente
  });
  it('con resistencias cualesquiera la lectura es siempre la opción (b), y cero en el equilibrio', () => {
    for (const v of [{ E: 9, R1: 3, R2: 7, R3: 11, R4: 2 }, { E: 1.5, R1: 47, R2: 4.7, R3: 1, R4: 33 }, { E: 12, R1: 5, R2: 8, R3: 13, R4: 21 }]) {
      const op = puntoOperacion(puente(v));
      esOpcion(op.v[op.ids.indexOf('Vm')], opciones(v), '(b)', 1e-12);
    }
    const eq = puntoOperacion(puente({ E: 6, R1: 5, R2: 10, R3: 10, R4: 20 }));
    cerca(eq.v[eq.ids.indexOf('Vm')], 0, 0, 1e-14);
  });
});

// ---------------------------------------------------------------------------
describe('MEXT 2007 P2 (circuito): placa conductora de espesor d/3 en un capacitor con batería', () => {
  // Escena: E = 10 V, C = 1 mF; S se cierra en 0.5 s y se abre en 5.5 s; la placa
  // entra de 1.5 a 4.5 s y sale de 6.5 a 9.5 s. Con la placa metida una fracción f,
  // C(f) = C·(1 − f) + C·f/(1 − 1/3) = C·(1 + f/2)
  const E = 10, C = 1e-3;
  const circuito = { componentes: [
    { id: 'E', tipo: 'bateria', nodos: ['p', 'g'], E },
    { id: 'S', tipo: 'interruptor', nodos: ['p', 'a'] },
    { id: 'C', tipo: 'capacitor', nodos: ['a', 'g'], C, perfil: [[1.5, 1], [4.5, 1.5], [6.5, 1.5], [9.5, 1]] },
    { id: 'T', tipo: 'tierra', nodos: ['g'] },
  ], acciones: [{ t: 0.5, id: 'S', estado: true }, { t: 5.5, id: 'S', estado: false }] };
  // Las 26 opciones del examen: C, CE y CE² con sus fracciones
  const LISTA = [1 / 4, 3 / 8, 1 / 2, 3 / 4, 3 / 2].map(x => x * C)
    .concat([1 / 8, 1 / 4, 3 / 8, 1 / 2, 1, 3 / 2, 2].map(x => x * C * E))
    .concat([-1 / 8, -1 / 4, -3 / 8, -1 / 2, -1, -3 / 2, -2, 1 / 8, 1 / 4, 3 / 8, 1 / 2, 1, 3 / 2, 2].map(x => x * C * E * E));
  // Las unidades distinguen F, C y J: cada respuesta se busca solo entre las de su tipo
  const F = LISTA.slice(0, 5), Q = [null, null, null, null, null, ...LISTA.slice(5, 12)], J = [...Array(12).fill(null), ...LISTA.slice(12)];
  const opc = (valor, lista, letra) => esOpcion(valor, lista.map(v => (v == null ? Infinity : v)), letra, 1e-9);
  const sim = simularCircuito(circuito, { duracion: 10, dt: 0.01 });
  const kC = indiceDe(sim, 'C'), kE = indiceDe(sim, 'E'), [a, b, c, d] = [1.5, 4.5, 6.5, 9.5].map(t => estadoEn(sim, t));

  it('(1) la capacidad con la placa dentro es 3C/2 (e)', () => opc(b.q[kC] / b.v[kC], F, '(e)'));
  it('(2) la carga aumenta CE/2 (i)', () => opc(b.q[kC] - a.q[kC], Q, '(i)'));
  it('(3) la energía aumenta CE²/4 (u)', () => opc(b.U[kC] - a.U[kC], J, '(u)'));
  it('(4) la batería hace CE²/2 (w)', () => opc(b.W[kE] - a.W[kE], J, '(w)'));
  it('(5) la fuerza sobre la placa hace −CE²/4 (n): la placa es atraída', () => opc(b.W[kC] - a.W[kC], J, '(n)'));
  it('(6) con S abierto, sacar la placa cuesta 3CE²/8 (v)', () => {
    opc(d.W[kC] - c.W[kC], J, '(v)');
    cerca(d.q[kC], 1.5 * C * E, 1e-12);          // la carga no cambia
    balanceCierra(sim);
  });
});

// ---------------------------------------------------------------------------
describe('MEXT 2006 P2: carga de C por R₁ y después un segundo camino por R₂', () => {
  // Datos del examen: E = 6 V, R₁ = 4 Ω, R₂ = 2 Ω, C = 2 µF (R₁C = 8 µs).
  // S₁ se cierra en 10 µs y S₂ en 110 µs; la escena dura 200 µs
  const sim = simularCircuito({
    componentes: [
      { id: 'E', tipo: 'bateria', nodos: ['p', 'n'], E: 6 },
      { id: 'R1', tipo: 'resistencia', nodos: ['p', 'x'], R: 4 },
      { id: 'C', tipo: 'capacitor', nodos: ['x', 'y'], C: 2e-6 },
      { id: 'R2', tipo: 'resistencia', nodos: ['x', 'z'], R: 2 },
      { id: 'S1', tipo: 'interruptor', nodos: ['n', 'y'] },
      { id: 'S2', tipo: 'interruptor', nodos: ['y', 'z'] },
      { id: 'T', tipo: 'tierra', nodos: ['n'] },
    ],
    acciones: [{ t: 1e-5, id: 'S1', estado: true }, { t: 1.1e-4, id: 'S2', estado: true }],
  }, { duracion: 2e-4, dt: 2e-7 });
  const k = id => indiceDe(sim, id), a = estadoEn(sim, 1e-5), b = estadoEn(sim, 1.1e-4), f = ultima(sim);
  const MICRO = [6, 12, 36, 72, 144].map(x => x * 1e-6);
  // S₂ se cierra 12.5·R₁C después de S₁: falta e^(−12.5) ≈ 4·10⁻⁶ por cargar

  it('(1) justo al cerrar S₁, I = E/R₁ = 1.5 A (a)', () => esOpcion(despues(sim, 1e-5).I[k('R1')], [1.5, 3, 6, 12, 24], '(a)', 1e-6));
  it('(2) cargado, q = CE = 12 µC (b)', () => esOpcion(b.q[k('C')], MICRO, '(b)', 1e-5));
  it('(3) la batería hace qE = 72 µJ (d)', () => esOpcion(b.W[k('E')] - a.W[k('E')], MICRO, '(d)', 1e-5));
  it('(4) el calor en R₁ es la mitad: 36 µJ (c)', () => esOpcion(b.Q[k('R1')] - a.Q[k('R1')], MICRO, '(c)', 1e-5));
  it('(5) con S₂ cerrado, q = C·R₂E/(R₁ + R₂) = 4 µC (a)', () => {
    esOpcion(f.q[k('C')], [4, 6, 12, 24, 36].map(x => x * 1e-6), '(a)', 1e-6);
    balanceCierra(sim);
  });
});
