// Rendimiento de los motores con las escenas que usan las pantallas.
// `npm run banco`. Sirve para detectar regresiones: una pantalla recalcula
// la simulación entera cada vez que se edita la escena, así que estos
// tiempos son la latencia que se siente al arrastrar o escribir.
import { bench, describe } from 'vitest';
import { simularMecanica } from '../../sistema/motores/mecanica.js';
import { simularProyectil } from '../../sistema/motores/proyectiles.js';
import { simularGas } from '../../sistema/motores/gas.js';
import { simularCargas } from '../../sistema/motores/electrostatica.js';
import { simularGravitacion, cuerposOrbita } from '../../sistema/motores/gravitacion.js';

const pared = (id, a, b, e = 1) => ({ id, tipo: 'segmento', a, b, e });
const caja = e => [pared('s', [-3, -2], [3, -2], e), pared('n', [3, 2], [-3, 2], e), pared('o', [-3, 2], [-3, -2], e), pared('e', [3, -2], [3, 2], e)];
const discos = (n, v, g) => ({
  duracion: 5, g, superficies: caja(1),
  particulas: Array.from({ length: n }, (_, i) => ({ id: 'p' + i, m: 1 + (i % 3), radio: 0.1, p: [-2.5 + (i % 6), -1.5 + Math.floor(i / 6) * 0.75], v: [v * Math.cos(i * 1.7), v * Math.sin(i * 2.3)] })),
});

describe('Mecánica', () => {
  bench('proyectil con rebotes en una pendiente (2019 P3)', () => {
    simularProyectil({ h: 3, theta: 35 * Math.PI / 180, v0: 4, e: 0.6, g: 9.8, masa: 1, duracion: 6 });   // ángulos en radianes
  });
  bench('péndulo con clavo (2014 P3), 2 s', () => {
    simularMecanica({ duracion: 2, particulas: [{ id: 'P', m: 1, p: [1, 0], v: [0, 0] }], conectores: [{ id: 'hilo', tipo: 'cuerda', a: 'P', ancla: [0, 0], L: 1, clavos: [[0, -0.5]] }] });
  });
  bench('máquina de Atwood, 1 s', () => {
    simularMecanica({ duracion: 1, particulas: [{ id: 'A', m: 2, p: [0, -1], v: [0, 0] }, { id: 'B', m: 1, p: [0, -1.5], v: [0, 0] }], conectores: [{ id: 'c', tipo: 'polea', a: 'A', b: 'B', polea: [0, 0], L: 2.5 }] });
  });
  bench('12 discos en una caja, 5 s', () => { simularMecanica(discos(12, 5, [0, 0])); });
  bench('24 discos en una caja con gravedad, 5 s', () => { simularMecanica(discos(24, 5, [0, -9.8])); }, { iterations: 5 });
  // Apoyos redundantes: 11 discos en empaquetado hexagonal de pared a pared y uno que cae encima
  bench('disco que cae sobre un empaquetado hexagonal, 1.5 s', () => {
    const pared = (id, a, b) => ({ id, tipo: 'segmento', a, b, e: 0.3 }), W = 0.6, P = [];
    for (let k = 0; k < 6; k++) P.push({ id: 'a' + k, m: 1, p: [-W + 0.1 + 0.2 * k, 0.1], v: [0, 0], radio: 0.1 });
    for (let k = 0; k < 5; k++) P.push({ id: 'b' + k, m: 1, p: [-W + 0.2 + 0.2 * k, 0.1 + 0.1 * Math.sqrt(3)], v: [0, 0], radio: 0.1 });
    P.push({ id: 'c', m: 1, p: [0.05, 0.9], v: [0, 0], radio: 0.1 });
    simularMecanica({ duracion: 1.5, eParticulas: 0.3, particulas: P, superficies: [pared('s', [-W, 0], [W, 0]), pared('o', [-W, 2], [-W, 0]), pared('e', [W, 0], [W, 2])] });
  }, { iterations: 5 });
});

describe('Termodinámica', () => {
  bench('émbolo con pesa (2019 P4), modelo dinámico, 5 s', () => {
    simularGas({ n: 1, A: 0.05, P0: 101300, T0: 300, g: 9.8, m: 50, M: 150, Fc: 300, G: 6, b: 300 }, [], { modelo: 'dinamico', duracion: 5 });
  });
});

describe('Electrostática', () => {
  const q = 1e-6, a = 1, m = 2e-3, k = 8.9875517923e9;
  bench('dos cargas fijas y una partícula (2020 P2), 6.5 s', () => {
    simularCargas(
      { fijas: [{ id: 'A', nombre: 'A', x: -a, y: 0, q }, { id: 'B', nombre: 'B', x: a, y: 0, q }], libres: [{ id: 'P', nombre: 'P', x: 0, y: a, q: -q, m, vx: 0, vy: 0 }] },
      { duracion: 6.5, rtol: 1e-10, atol: 1e-10, hMax: 0.004, radioChoque: 0.02, escalaLongitud: a, escalaVelocidad: Math.sqrt(k * q * q / (m * a)) },
    );
  });
});

describe('Gravitación', () => {
  const TIERRA = { nombre: 'Tierra', mu: 3.986004418e14, radio: 6.371e6 };
  bench('satélite a 400 km, dos órbitas', () => {
    const r = TIERRA.radio + 400e3, v = Math.sqrt(TIERRA.mu / r), T = 2 * Math.PI * Math.sqrt(r ** 3 / TIERRA.mu);
    simularGravitacion({ cuerpos: cuerposOrbita(TIERRA, { altura: 400e3, velocidad: v }), duracion: 2 * T, dt: T / 2000 });
  });
});
