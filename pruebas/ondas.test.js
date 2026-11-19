// Exactitud física del motor de ondas: medio 1D por diferencias finitas
// (rapidez, reflexión, unión de cuerdas, modos, energía, convergencia,
// fuentes), superposición analítica, Doppler cinemático y las situaciones
// MEXT de ondas viajeras, estacionarias y Doppler.
import { describe, it, expect } from 'vitest';
import {
  velocidadCuerda, impedancia, coeficientesUnion, velocidadSonido, velocidadAguasSomeras, tramoTubo, RHO_AIRE,
  normalizarTramos, mallaMedio, pasoEstable, tiempoVuelo, simularMedio, estadoMedio, energiaMedio, cuadroMedio,
  serieEn, esfuerzoMedio, aceleracionMedio, senal, frentesEn,
  ondaSenoidal, pulsoGauss, viajera, conImagen, imagenesMedio, modoEstacionario, frecuenciasModos,
  resonanciasPiston, velocidadDesdeResonancias, respuestaArmonica,
  dopplerColineal, frecuenciaPulsacion, recepcion, senalObservador, frentesOnda, imagenPared, posicionEn,
} from '../sistema/motores/ondas.js';

const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const DOS_PI = 2 * Math.PI;

// Instante del máximo de una sonda (parábola por los tres puntos del pico)
function instantePico(s, signo = 1, desde = 0) {
  let k = -1;
  for (let i = 1; i < s.y.length - 1; i++) if (s.t[i] >= desde && (k < 0 || signo * s.y[i] > signo * s.y[k])) k = i;
  const a = s.y[k - 1], b = s.y[k], c = s.y[k + 1], d = 0.5 * (a - c) / (a - 2 * b + c);
  return { t: s.t[k] + d * (s.t[1] - s.t[0]), y: b - 0.25 * (a - c) * d };
}
// Cruces por cero hacia abajo (interpolados)
function crucesBajada(t, y, desde = 0) {
  const r = [];
  for (let i = 1; i < y.length; i++) if (t[i] > desde && y[i - 1] > 0 && y[i] <= 0) r.push(t[i - 1] + y[i - 1] / (y[i - 1] - y[i]) * (t[i] - t[i - 1]));
  return r;
}
const periodoMedido = (t, y, desde = 0) => { const c = crucesBajada(t, y, desde); return (c[c.length - 1] - c[0]) / (c.length - 1); };
const maxAbs = a => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
// Extremo del campo en una región [a, b]
function extremo(sim, y, a, b, signo = 1) {
  let m = 0, x = NaN;
  for (let i = 0; i <= sim.N; i++) if (sim.x[i] >= a && sim.x[i] <= b && signo * y[i] > signo * m) { m = y[i]; x = sim.x[i]; }
  return { y: m, x };
}
const cuerda = (longitud, T, mu) => ({ longitud, tension: T, densidad: mu });

describe('fórmulas', () => {
  it('v = √(T/μ) y Z = √(Tμ) = μv', () => {
    for (const [T, mu] of [[50, 0.02], [10, 0.4], [774.4, 1e-3]]) {
      expect(rel(velocidadCuerda(T, mu) ** 2, T / mu)).toBeLessThan(1e-15);
      expect(rel(impedancia(T, mu), mu * velocidadCuerda(T, mu))).toBeLessThan(1e-15);
    }
  });
  it('en la unión: 1 + r = t y R + T = 1 (se conserva la potencia)', () => {
    for (const [Z1, Z2] of [[1, 2], [2, 1], [1, 1], [3, 0.01], [0.5, 40]]) {
      const c = coeficientesUnion(Z1, Z2);
      expect(Math.abs(1 + c.r - c.t)).toBeLessThan(1e-15);
      expect(Math.abs(c.R + c.T - 1)).toBeLessThan(1e-14);
    }
    expect(coeficientesUnion(1, 1).r).toBe(0);
    expect(coeficientesUnion(1, 2).r).toBeCloseTo(-1 / 3, 15);
    expect(coeficientesUnion(2, 1).t).toBeCloseTo(4 / 3, 15);
  });
  it('rapidez del sonido √(γRT/M): 331 m/s a 0 °C y 340 m/s a 15 °C', () => {
    expect(Math.abs(velocidadSonido(273.15) - 331.3)).toBeLessThan(0.1);
    expect(Math.abs(velocidadSonido(288.15) - 340.3)).toBeLessThan(0.1);
    expect(rel(velocidadSonido(373.15) / velocidadSonido(273.15), Math.sqrt(373.15 / 273.15))).toBeLessThan(1e-15);
    expect(rel(velocidadAguasSomeras(0.1), Math.sqrt(0.980665))).toBeLessThan(1e-15);
  });
  it('un tubo es un medio con K = ρv²S y m = ρS: v = √(K/m) y Z = ρvS', () => {
    const [t] = normalizarTramos([tramoTubo({ longitud: 1, velocidad: 343, seccion: 2e-3 })]);
    expect(rel(t.v, 343)).toBeLessThan(1e-15);
    expect(rel(t.Z, RHO_AIRE * 343 * 2e-3)).toBeLessThan(1e-15);
  });
  it('tramos dados con dos de tensión, densidad y velocidad', () => {
    const tr = normalizarTramos([{ longitud: 1, tension: 10, densidad: 0.1 }, { longitud: 2, velocidad: 5, densidad: 0.4 }, { longitud: 1, tension: 10, velocidad: 20 }], -1);
    expect(tr.map(t => t.v)).toEqual([10, 5, 20]);
    expect(tr.map(t => [t.x0, t.x1])).toEqual([[-1, 0], [0, 2], [2, 3]]);
    expect(() => normalizarTramos([{ longitud: 1, tension: 10 }])).toThrow(RangeError);
    expect(tiempoVuelo(tr, -1, 3)).toBeCloseTo(0.1 + 0.4 + 0.05, 14);
  });
});

describe('condición CFL', () => {
  it('en un medio uniforme el paso máximo es h/v; con dos tramos lo fija el más rápido', () => {
    const m1 = mallaMedio(normalizarTramos([cuerda(2, 4, 1)]), 100);
    expect(rel(pasoEstable(m1), m1.h / 2)).toBeLessThan(1e-12);
    const m2 = mallaMedio(normalizarTramos([cuerda(1, 4, 1), cuerda(1, 4, 0.04)]), 100);
    expect(rel(pasoEstable(m2), m2.h / 10)).toBeLessThan(1e-12);
  });
  it('rechaza un paso explícito por encima del límite y acepta uno por debajo', () => {
    const base = { tramos: [cuerda(1, 1, 1)], izq: { tipo: 'fijo' }, der: { tipo: 'fijo' }, duracion: 0.1, celdas: 50 };
    expect(() => simularMedio({ ...base, dt: 0.0201 })).toThrow(/CFL/);
    const sim = simularMedio({ ...base, dt: 0.019 });
    expect(sim.courant).toBeLessThanOrEqual(1);
    expect(simularMedio(base).courant).toBeLessThanOrEqual(0.9 + 1e-12);
  });
  it('con número de Courant 1 el salto de rana es exacto en un medio uniforme (paso mágico)', () => {
    const N = 200, L = 2, h = L / N, G = pulsoGauss({ amplitud: 1, centro: 0.8, ancho: 0.08, velocidad: 1 });
    const sim = simularMedio({ tramos: [cuerda(L, 1, 1)], izq: { tipo: 'fijo' }, der: { tipo: 'fijo' }, celdas: N, dt: h, duracion: 300 * h,
      iniciales: [{ forma: 'gauss', amplitud: 1, centro: 0.8, ancho: 0.08, sentido: 1 }] });
    const ex = imagenesMedio(G, 0, L, 'fijo', 'fijo'), q = sim.cuadros - 1, y = cuadroMedio(sim, q);
    let err = 0;
    for (let i = 0; i <= N; i++) err = Math.max(err, Math.abs(y[i] - ex(sim.x[i], sim.t[q])));
    expect(err).toBeLessThan(1e-10);
  });
});

describe('rapidez medida en el medio discreto', () => {
  it('el pico de un pulso viaja a v = √(T/μ) (error < 2·10⁻⁴)', () => {
    for (const [T, mu] of [[50, 0.02], [10, 0.4], [3, 0.12]]) {
      const v = velocidadCuerda(T, mu), L = 10;
      const sim = simularMedio({ tramos: [cuerda(L, T, mu)], izq: { tipo: 'absorbente' }, der: { tipo: 'absorbente' }, celdas: 1000,
        iniciales: [{ forma: 'gauss', amplitud: 0.01, centro: 3, ancho: 0.2, sentido: 1 }], duracion: 4 / v, sondas: [4, 6] });
      const t1 = instantePico(sim.sondas[0]).t, t2 = instantePico(sim.sondas[1]).t;
      expect(rel(2 / (t2 - t1), v)).toBeLessThan(2e-4);
      // y conserva la forma: la amplitud del pico no cambia
      expect(rel(instantePico(sim.sondas[1]).y, 0.01)).toBeLessThan(1e-3);
    }
  });
  it('un pulso que parte del reposo se divide en dos mitades que se alejan a ±v', () => {
    const sim = simularMedio({ tramos: [cuerda(8, 4, 1)], izq: { tipo: 'absorbente' }, der: { tipo: 'absorbente' }, celdas: 800,
      iniciales: [{ forma: 'gauss', amplitud: 1, centro: 4, ancho: 0.15 }], duracion: 1 });
    const y = estadoMedio(sim, 1), d = extremo(sim, y, 4, 8), i = extremo(sim, y, 0, 4);
    expect(Math.abs(d.y - 0.5)).toBeLessThan(2e-3);
    expect(Math.abs(i.y - 0.5)).toBeLessThan(2e-3);
    expect(Math.abs(d.x - 6)).toBeLessThan(0.011);
    expect(Math.abs(i.x - 2)).toBeLessThan(0.011);
  });
});

describe('reflexión en los extremos', () => {
  const pulso = tipo => simularMedio({ tramos: [cuerda(6, 12.5, 0.5)], izq: { tipo: 'absorbente' }, der: { tipo }, celdas: 900,
    iniciales: [{ forma: 'gauss', amplitud: 0.1, centro: 1.5, ancho: 0.2, sentido: 1 }], duracion: 1.6, sondas: [6] });
  it('extremo fijo: el pulso vuelve invertido, con la misma amplitud', () => {
    const sim = pulso('fijo'), y = estadoMedio(sim, 1.5);         // el reflejado está en x = 6 − 5·0.6 = 3
    const m = extremo(sim, y, 0, 6, -1);
    expect(Math.abs(m.y + 0.1)).toBeLessThan(1e-3);
    expect(Math.abs(m.x - 3)).toBeLessThan(0.02);
    expect(maxAbs(sim.sondas[0].y)).toBe(0);                         // el extremo fijo no se mueve
  });
  it('extremo libre: vuelve sin invertirse y el extremo sube hasta 2A en el instante del evento', () => {
    const sim = pulso('libre'), y = estadoMedio(sim, 1.5);
    const m = extremo(sim, y, 0, 6, 1);
    expect(Math.abs(m.y - 0.1)).toBeLessThan(1e-3);
    expect(Math.abs(m.x - 3)).toBeLessThan(0.02);
    const p = instantePico(sim.sondas[0]), ev = sim.eventos.find(e => e.tipo === 'borde');
    expect(Math.abs(p.y - 0.2)).toBeLessThan(2e-3);
    expect(ev.lado).toBe('der');
    expect(Math.abs(ev.t - 4.5 / 5)).toBeLessThan(1e-12);
    expect(Math.abs(p.t - ev.t)).toBeLessThan(1e-3);
  });
  it('el medio discreto coincide con el método de las imágenes (fijo y libre)', () => {
    for (const tipo of ['fijo', 'libre']) {
      const sim = pulso(tipo), G = pulsoGauss({ amplitud: 0.1, centro: 1.5, ancho: 0.2, velocidad: 5 }), { total } = conImagen(G, 6, tipo);
      for (const t of [0.6, 0.9, 1.2]) {
        const y = estadoMedio(sim, t);
        let err = 0;
        for (let i = 0; i <= sim.N; i++) err = Math.max(err, Math.abs(y[i] - total(sim.x[i], t)));
        expect(err).toBeLessThan(1e-3 * 0.1);
      }
    }
  });
  it('los tubos: cerrado = desplazamiento nulo (refleja invertido), abierto = presión nula', () => {
    const t = tramoTubo({ longitud: 2, velocidad: 340 });
    for (const [der, signo] of [['cerrado', -1], ['abierto', 1]]) {
      const sim = simularMedio({ tramos: [t], izq: { tipo: 'absorbente' }, der: { tipo: der }, celdas: 800,
        iniciales: [{ forma: 'gauss', amplitud: 1e-6, centro: 0.8, ancho: 0.05, sentido: 1 }], duracion: 2.4 / 340 });
      // Recorre 1.2 m hasta el extremo y vuelve otros 1.2 m: está en x = 0.8 m
      const y = estadoMedio(sim, 2.4 / 340), m = extremo(sim, y, 0, 2, signo);
      expect(Math.abs(m.y - signo * 1e-6)).toBeLessThan(1e-8);
      expect(Math.abs(m.x - 0.8)).toBeLessThan(0.006);
    }
  });
});

describe('unión de dos cuerdas', () => {
  // Cuerda 1 (μ₁) unida en x = 5 m a la cuerda 2 (μ₂), misma tensión
  const union = mu2 => simularMedio({
    tramos: [cuerda(5, 10, 0.1), cuerda(5, 10, mu2)], izq: { tipo: 'absorbente' }, der: { tipo: 'absorbente' }, celdas: 2000,
    iniciales: [{ forma: 'gauss', amplitud: 1, centro: 2.5, ancho: 0.15, sentido: 1 }], duracion: 0.6,
  });
  it('a una más densa (Z₂ = 2Z₁): r = −1/3 (invertido) y t = 2/3', () => {
    const sim = union(0.4), y = estadoMedio(sim, 0.6), { r, t } = coeficientesUnion(1, 2);
    const ref = extremo(sim, y, 0, 5, -1), tra = extremo(sim, y, 5, 10, 1);
    expect(Math.abs(ref.y - r)).toBeLessThan(2e-3);
    expect(Math.abs(tra.y - t)).toBeLessThan(2e-3);
    // Posiciones: el reflejado vuelve a 10 m/s y el transmitido sigue a 5 m/s
    expect(Math.abs(ref.x - (5 - 10 * 0.35))).toBeLessThan(0.01);
    expect(Math.abs(tra.x - (5 + 5 * 0.35))).toBeLessThan(0.01);
  });
  it('a una más ligera (Z₂ = Z₁/2): r = +1/3 y t = 4/3', () => {
    const sim = union(0.025), y = estadoMedio(sim, 0.45), { r, t } = coeficientesUnion(2, 1);
    expect(Math.abs(extremo(sim, y, 0, 5, 1).y - r)).toBeLessThan(2e-3);
    expect(Math.abs(extremo(sim, y, 5, 10, 1).y - t)).toBeLessThan(3e-3);
  });
  it('la energía se reparte R = r² y T = (Z₂/Z₁)t², y el balance cierra', () => {
    const sim = union(0.4), E0 = energiaMedio(sim, 0).E, { R, T } = coeficientesUnion(1, 2);
    // Energía de cada lado a partir de dos cuadros consecutivos
    const q = sim.cuadros - 2, y0 = cuadroMedio(sim, q), y1 = cuadroMedio(sim, q + 1), dt = sim.t[q + 1] - sim.t[q];
    let Ei = 0, Ed = 0;
    for (let i = 0; i <= sim.N; i++) { const v = (y1[i] - y0[i]) / dt, e = 0.5 * sim.masa[i] * v * v; if (sim.x[i] < 5) Ei += e; else Ed += e; }
    for (let i = 0; i < sim.N; i++) { const e = 0.5 * sim.rigidez[i] * (y1[i + 1] - y1[i]) * (y0[i + 1] - y0[i]); if (sim.x[i] < 5) Ei += e; else Ed += e; }
    expect(Math.abs(Ei / E0 - R)).toBeLessThan(3e-3);
    expect(Math.abs(Ed / E0 - T)).toBeLessThan(3e-3);
    expect(Math.abs(energiaMedio(sim, 0.6).residuo)).toBeLessThan(1e-12 * E0);
  });
  it('los eventos marcan la llegada a la unión con sus coeficientes', () => {
    const ev = union(0.4).eventos.find(e => e.tipo === 'union');
    expect(ev.t).toBeCloseTo(0.25, 14);
    expect(ev.r).toBeCloseTo(-1 / 3, 14);
    expect(ev.tr).toBeCloseTo(2 / 3, 14);
  });
});

describe('ondas estacionarias', () => {
  it('modos: cuerda fija–fija fₙ = nv/2L; tubo abierto–abierto fₙ = nv/2L; abierto–cerrado fₙ = (2n − 1)v/4L', () => {
    const L = 0.6, v = 340;
    expect(frecuenciasModos({ longitud: L, velocidad: v, izq: 'fijo', der: 'fijo' }, 4).map(m => m.f)).toEqual([1, 2, 3, 4].map(n => n * v / (2 * L)));
    expect(frecuenciasModos({ longitud: L, velocidad: v, izq: 'abierto', der: 'abierto' }, 3).map(m => m.f)).toEqual([1, 2, 3].map(n => n * v / (2 * L)));
    const ac = frecuenciasModos({ longitud: L, velocidad: v, izq: 'abierto', der: 'cerrado' }, 3).map(m => m.f);
    ac.forEach((f, j) => expect(rel(f, (2 * j + 1) * v / (4 * L))).toBeLessThan(1e-15));
    expect(modoEstacionario({ longitud: L, velocidad: v, izq: 'absorbente', der: 'fijo' }, 1)).toBeNull();
  });
  it('nodos y antinodos: fijo–fijo n = 3; abierto–cerrado n = 2 (los de presión, intercambiados)', () => {
    const m = modoEstacionario({ longitud: 1.2, velocidad: 24, izq: 'fijo', der: 'fijo' }, 3);
    m.nodos.forEach((x, j) => expect(x).toBeCloseTo([0, 0.4, 0.8, 1.2][j], 12));
    m.antinodos.forEach((x, j) => expect(x).toBeCloseTo([0.2, 0.6, 1.0][j], 12));
    const t = modoEstacionario({ longitud: 0.75, velocidad: 340, izq: 'abierto', der: 'cerrado' }, 2);
    expect(t.lambda).toBeCloseTo(1, 12);
    t.nodos.forEach((x, j) => expect(x).toBeCloseTo([0.25, 0.75][j], 12));
    t.antinodos.forEach((x, j) => expect(x).toBeCloseTo([0, 0.5][j], 12));
    expect(t.nodosPresion).toEqual(t.antinodos);
    for (const x of t.nodos) expect(Math.abs(t.forma(x))).toBeLessThan(1e-12);
    for (const x of t.antinodos) expect(Math.abs(Math.abs(t.forma(x)) - 1)).toBeLessThan(1e-12);
  });
  it('la frecuencia medida de cada modo simulado coincide (error < 10⁻⁴)', () => {
    const casos = [['fijo', 'fijo', 3, 24, 1.2], ['libre', 'libre', 2, 340, 0.8], ['libre', 'fijo', 1, 340, 0.6], ['fijo', 'libre', 3, 50, 2]];
    for (const [izq, der, n, v, L] of casos) {
      const md = modoEstacionario({ longitud: L, velocidad: v, izq, der }, n);
      const xs = L * 0.13;
      const sim = simularMedio({ tramos: [{ longitud: L, velocidad: v, densidad: 0.1 }], izq: { tipo: izq }, der: { tipo: der }, celdas: 300,
        iniciales: [{ forma: 'modo', amplitud: 0.01, n }], duracion: 12 / md.f, sondas: [xs] });
      const s = sim.sondas[0];
      expect(rel(1 / periodoMedido(s.t, s.y), md.f)).toBeLessThan(1e-4);
    }
  });
  it('en la onda estacionaria simulada los nodos no se mueven y los antinodos oscilan con amplitud A', () => {
    const L = 1.2, v = 24, A = 0.01, md = modoEstacionario({ longitud: L, velocidad: v, izq: 'fijo', der: 'fijo' }, 3);
    const sim = simularMedio({ tramos: [{ longitud: L, velocidad: v, densidad: 0.1 }], izq: { tipo: 'fijo' }, der: { tipo: 'fijo' }, celdas: 240,
      iniciales: [{ forma: 'modo', amplitud: A, n: 3 }], duracion: 2 / md.f, sondas: [...md.nodos.slice(1, -1), ...md.antinodos] });
    sim.sondas.slice(0, 2).forEach(s => expect(maxAbs(s.y)).toBeLessThan(1e-12));
    sim.sondas.slice(2).forEach(s => expect(Math.abs(maxAbs(s.y) - A)).toBeLessThan(1e-4 * A));
  });
  it('es la suma de dos ondas iguales que viajan en sentidos opuestos', () => {
    const p = { amplitud: 1, longitudOnda: 0.8, frecuencia: 5 };
    const d = ondaSenoidal(p), i = ondaSenoidal({ ...p, sentido: -1 });
    for (const [x, t] of [[0.1, 0.03], [0.37, 0.5], [0.6, 1.1]]) {
      expect(d(x, t) + i(x, t)).toBeCloseTo(2 * Math.sin(DOS_PI * x / 0.8) * Math.cos(DOS_PI * 5 * t), 12);
    }
  });
});

describe('energía', () => {
  it('sin amortiguamiento, la energía discreta se conserva a precisión de máquina (fijo, libre, mixto)', () => {
    for (const [izq, der] of [['fijo', 'fijo'], ['libre', 'libre'], ['fijo', 'libre']]) {
      const sim = simularMedio({ tramos: [cuerda(1, 4, 0.1), cuerda(1, 4, 0.3)], izq: { tipo: izq }, der: { tipo: der }, celdas: 200,
        iniciales: [{ forma: 'gauss', amplitud: 0.02, centro: 0.6, ancho: 0.1, sentido: 1 }], duracion: 3 });
      const E0 = sim.energia.E0;
      for (let q = 0; q < sim.cuadros; q++) expect(Math.abs(sim.energia.K[q] + sim.energia.U[q] - E0)).toBeLessThan(1e-12 * E0);
    }
  });
  it('la energía física ½μv² + ½T(∂y/∂x)² tiene una deriva acotada (sin tendencia en 50 periodos)', () => {
    const L = 1, v = 10, md = modoEstacionario({ longitud: L, velocidad: v, izq: 'fijo', der: 'fijo' }, 2);
    const sim = simularMedio({ tramos: [{ longitud: L, velocidad: v, densidad: 0.05 }], izq: { tipo: 'fijo' }, der: { tipo: 'fijo' }, celdas: 100,
      iniciales: [{ forma: 'modo', amplitud: 0.01, n: 2 }], duracion: 50 / md.f, cuadros: 1e9 });
    // Energía con la velocidad centrada (y⁺ − y⁻)/2Δt y la potencial en el instante
    const Ef = q => {
      const ya = cuadroMedio(sim, q - 1), y = cuadroMedio(sim, q), yb = cuadroMedio(sim, q + 1), dt = sim.dt;
      let E = 0;
      for (let i = 1; i < sim.N; i++) E += 0.5 * sim.masa[i] * ((yb[i] - ya[i]) / (2 * dt)) ** 2;
      for (let i = 0; i < sim.N; i++) E += 0.5 * sim.rigidez[i] * (y[i + 1] - y[i]) ** 2;
      return E;
    };
    const n = sim.cuadros, E1 = Ef(1);
    let primero = 0, ultimo = 0;
    for (let q = 1; q < n - 1; q++) {
      const d = Math.abs(Ef(q) - E1) / E1;
      if (q < n / 10) primero = Math.max(primero, d); else if (q > 0.9 * n) ultimo = Math.max(ultimo, d);
    }
    expect(Math.max(primero, ultimo)).toBeLessThan(2e-3);
    expect(ultimo).toBeLessThan(1.5 * primero + 1e-12);
  });
  it('con amortiguamiento β cada modo decae como e^(−βt) y la energía como e^(−2βt)', () => {
    const L = 1.2, v = 24, beta = 0.5;
    const sim = simularMedio({ tramos: [{ longitud: L, velocidad: v, densidad: 0.1 }], izq: { tipo: 'fijo' }, der: { tipo: 'fijo' }, celdas: 120,
      iniciales: [{ forma: 'modo', amplitud: 0.01, n: 1 }], amortiguamiento: beta, duracion: 4, sondas: [L / 2] });
    const E0 = energiaMedio(sim, 0).E;
    for (const t of [1, 2, 4]) {
      const e = energiaMedio(sim, t);
      expect(Math.abs(e.E / E0 - Math.exp(-2 * beta * t))).toBeLessThan(2e-3 * Math.exp(-2 * beta * t) + 1e-4);
      expect(Math.abs(e.residuo)).toBeLessThan(1e-12 * E0);
    }
    // Amplitud del antinodo en los máximos de cada periodo
    const s = sim.sondas[0], picos = [];
    for (let i = 1; i < s.y.length - 1; i++) if (s.y[i] > s.y[i - 1] && s.y[i] >= s.y[i + 1]) picos.push([s.t[i], s.y[i]]);
    for (const [t, y] of picos.filter(p => p[0] > 0.5)) expect(Math.abs(y / (0.01 * Math.exp(-beta * t)) - 1)).toBeLessThan(2e-3);
  });
  it('el registro cierra con fuentes, extremos absorbentes y amortiguamiento: E − E₀ = W − Q', () => {
    const casos = [
      { izq: { tipo: 'absorbente', fuente: { forma: 'senoidal', amplitud: 0.05, frecuencia: 2 } }, der: { tipo: 'absorbente' } },
      { izq: { tipo: 'fijo', fuente: { forma: 'senoidal', amplitud: 0.001, frecuencia: 30 } }, der: { tipo: 'libre' }, amortiguamiento: 1 },
      { izq: { tipo: 'libre', fuente: { forma: 'pulso', amplitud: 0.5, ancho: 0.05 } }, der: { tipo: 'fijo' }, fuerzas: [{ x: 3.3, senal: { forma: 'senoidal', amplitud: 0.2, frecuencia: 3 } }] },
    ];
    for (const c of casos) {
      const sim = simularMedio({ tramos: [cuerda(4, 1.6, 0.1), cuerda(4, 1.6, 0.4)], celdas: 400, duracion: 4, ...c });
      const e = energiaMedio(sim, 4), escala = Math.max(e.W, e.E, 1e-30);
      expect(e.W).toBeGreaterThan(0);
      expect(Math.abs(e.residuo)).toBeLessThan(1e-11 * escala);
    }
  });
});

describe('convergencia del esquema', () => {
  it('el error frente al método de las imágenes baja como h² (orden 2)', () => {
    const error = N => {
      const sim = simularMedio({ tramos: [cuerda(2, 1, 1)], izq: { tipo: 'fijo' }, der: { tipo: 'libre' }, celdas: N, courant: 0.5,
        iniciales: [{ forma: 'gauss', amplitud: 1, centro: 1.2, ancho: 0.1, sentido: 1 }], duracion: 1.5 });
      const ex = imagenesMedio(pulsoGauss({ amplitud: 1, centro: 1.2, ancho: 0.1, velocidad: 1 }), 0, 2, 'fijo', 'libre');
      const q = sim.cuadros - 1, y = cuadroMedio(sim, q);
      let m = 0;
      for (let i = 0; i <= sim.N; i++) m = Math.max(m, Math.abs(y[i] - ex(sim.x[i], sim.t[q])));
      return m;
    };
    const e = [100, 200, 400].map(error);
    for (let j = 0; j < 2; j++) {
      const p = Math.log2(e[j] / e[j + 1]);
      expect(p).toBeGreaterThan(1.9);
      expect(p).toBeLessThan(2.1);
    }
  });
});

describe('fuentes y extremos absorbentes', () => {
  it('un extremo absorbente deja salir el pulso: queda menos de 10⁻⁶ de la energía', () => {
    const sim = simularMedio({ tramos: [cuerda(4, 4, 1)], izq: { tipo: 'absorbente' }, der: { tipo: 'absorbente' }, celdas: 400,
      iniciales: [{ forma: 'gauss', amplitud: 1, centro: 2, ancho: 0.1, sentido: 1 }], duracion: 2 });
    const e = energiaMedio(sim, 2);
    expect(e.E / e.E0).toBeLessThan(1e-6);
    expect(Math.abs(e.absorbida / e.E0 - 1)).toBeLessThan(1e-6);
  });
  it('fuente en un extremo absorbente: onda senoidal de amplitud A y longitud de onda v/f, sin reflexiones', () => {
    const v = 4, f = 2, A = 0.05;
    const sim = simularMedio({ tramos: [cuerda(8, 1.6, 0.1)], izq: { tipo: 'absorbente', fuente: { forma: 'senoidal', amplitud: A, frecuencia: f } },
      der: { tipo: 'absorbente' }, duracion: 5, sondas: [3, 3.5], celdas: 400 });
    const [s1, s2] = sim.sondas;
    let mx = 0, mn = 0;
    for (let i = 0; i < s1.y.length; i++) if (s1.t[i] > 2) { mx = Math.max(mx, s1.y[i]); mn = Math.min(mn, s1.y[i]); }
    expect(Math.abs(mx - A)).toBeLessThan(1e-3 * A);
    expect(Math.abs(mn + A)).toBeLessThan(1e-3 * A);
    // Desfase entre dos sondas separadas Δx: Δt = Δx/v → λ = v/f
    const c1 = crucesBajada(s1.t, s1.y, 2), c2 = crucesBajada(s2.t, s2.y, 2);
    const dt = c2.find(t => t > c1[0]) - c1[0];
    expect(rel(0.5 / dt, v)).toBeLessThan(1e-3);
    expect(rel(periodoMedido(s1.t, s1.y, 2), 1 / f)).toBeLessThan(1e-4);
  });
  it('fuerza puntual F₀·sen(ωt): dos ondas de amplitud F₀/(2Zω)', () => {
    const T = 4, mu = 0.25, Z = impedancia(T, mu), F0 = 0.3, f = 1.5;
    const sim = simularMedio({ tramos: [cuerda(12, T, mu)], izq: { tipo: 'absorbente' }, der: { tipo: 'absorbente' }, celdas: 600,
      fuerzas: [{ x: 6, senal: { forma: 'senoidal', amplitud: F0, frecuencia: f } }], duracion: 6, sondas: [3, 9] });
    // La fuerza que arranca en t = 0 deja además un desplazamiento constante
    // F₀/(2Zω): la amplitud es la mitad de la oscilación pico a pico
    for (const s of sim.sondas) {
      let mx = -Infinity, mn = Infinity;
      for (let i = 0; i < s.y.length; i++) if (s.t[i] > 3) { mx = Math.max(mx, s.y[i]); mn = Math.min(mn, s.y[i]); }
      expect(rel((mx - mn) / 2, F0 / (2 * Z * DOS_PI * f))).toBeLessThan(2e-3);
    }
  });
  it('oscilador en resonancia con amortiguamiento: régimen estacionario igual al analítico', () => {
    const L = 1.2, v = 24, beta = 1, md = modoEstacionario({ longitud: L, velocidad: v, izq: 'fijo', der: 'fijo' }, 3);
    const sim = simularMedio({ tramos: [{ longitud: L, velocidad: v, densidad: 0.1 }], izq: { tipo: 'fijo', fuente: { forma: 'senoidal', amplitud: 1e-3, frecuencia: md.f } },
      der: { tipo: 'fijo' }, amortiguamiento: beta, duracion: 6, celdas: 240, cuadros: 4000 });
    const R = respuestaArmonica({ longitud: L, velocidad: v, rigidez: 0.1 * v * v, izq: 'fijo', der: 'fijo', amortiguamiento: beta, amplitud: 1e-3 }, md.f);
    let m = 0;
    for (let q = sim.cuadros - 300; q < sim.cuadros; q++) m = Math.max(m, maxAbs(cuadroMedio(sim, q)));
    expect(rel(m, R.yMax)).toBeLessThan(1e-2);
    expect(R.yMax / 1e-3).toBeGreaterThan(15);              // en resonancia la amplitud crece mucho
  });
  it('señales: senoidal con rampa suave, pulso gaussiano y medio seno (valor y derivada)', () => {
    const casos = [
      { forma: 'senoidal', amplitud: 2, frecuencia: 3, fase: 0.4, inicio: 0.1, rampa: 0.2 },
      { forma: 'pulso', amplitud: 1, ancho: 0.05, inicio: 0.2 },
      { forma: 'medioSeno', amplitud: 0.5, ancho: 0.3, inicio: 0 },
    ];
    for (const s of casos) {
      for (const t of [0.13, 0.23, 0.27, 0.35]) {
        const h = 1e-6, d = (senal(s, t + h)[0] - senal(s, t - h)[0]) / (2 * h);
        expect(Math.abs(senal(s, t)[1] - d)).toBeLessThan(1e-5 * Math.max(1, Math.abs(d)));
      }
      expect(senal(s, -1)).toEqual([0, 0]);
    }
  });
});

describe('eventos de la línea de tiempo', () => {
  it('pulso que va y vuelve entre un extremo fijo y uno libre: instantes de vuelo exactos', () => {
    const sim = simularMedio({ tramos: [cuerda(3, 4, 1)], izq: { tipo: 'libre' }, der: { tipo: 'fijo' }, celdas: 300,
      iniciales: [{ forma: 'gauss', amplitud: 0.1, centro: 1, ancho: 0.1, sentido: 1 }], duracion: 5 });
    const ev = sim.eventos.map(e => [e.lado, Math.round(e.t * 1e9) / 1e9, Math.sign(e.amplitud)]);
    expect(ev.slice(0, 4)).toEqual([['der', 1, 1], ['izq', 2.5, -1], ['der', 4, -1]].concat([]).slice(0, 4));
    expect(sim.eventos[0].nombre).toMatch(/derecho.*invertido/);
    expect(sim.eventos[1].nombre).toMatch(/izquierdo.*sin invertirse/);
  });
  it('frentes presentes en cada instante: el pulso y su reflejado donde los deja el trazado', () => {
    const sim = simularMedio({ tramos: [cuerda(5, 10, 0.1), cuerda(5, 10, 0.4)], izq: { tipo: 'absorbente' }, der: { tipo: 'absorbente' }, celdas: 1000,
      iniciales: [{ forma: 'gauss', amplitud: 1, centro: 2.5, ancho: 0.15, sentido: 1 }], duracion: 0.6 });
    const f = frentesEn(sim, 0.6).sort((a, b) => a.x - b.x);
    expect(f.map(r => r.x)).toEqual([expect.closeTo(1.5, 12), expect.closeTo(6.75, 12)]);
    expect(f.map(r => r.amplitud)).toEqual([expect.closeTo(-1 / 3, 12), expect.closeTo(2 / 3, 12)]);
    // y el medio discreto tiene sus picos allí
    const y = estadoMedio(sim, 0.6);
    expect(Math.abs(extremo(sim, y, 0, 5, -1).x - 1.5)).toBeLessThan(0.01);
    expect(Math.abs(extremo(sim, y, 5, 10, 1).x - 6.75)).toBeLessThan(0.01);
    expect(frentesEn(sim, 0.1).map(r => r.x)).toEqual([expect.closeTo(3.5, 12)]);
  });
  it('el frente de una fuente en el borde llega al otro extremo en L/v', () => {
    const sim = simularMedio({ tramos: [cuerda(2, 1, 0.25), cuerda(2, 1, 1)], izq: { tipo: 'fijo', fuente: { forma: 'senoidal', amplitud: 0.01, frecuencia: 1, inicio: 0.5 } },
      der: { tipo: 'absorbente' }, celdas: 200, duracion: 4 });
    // Unión en 0.5 + 2/2; el reflejado vuelve al extremo izquierdo en 0.5 + 1 + 1; el transmitido llega al derecho en 0.5 + 1 + 2/1
    expect(sim.eventos[0].tipo).toBe('union');
    expect(sim.eventos[0].t).toBeCloseTo(0.5 + 2 / 2, 12);
    expect(sim.eventos.find(e => e.lado === 'izq').t).toBeCloseTo(0.5 + 1 + 1, 12);
    expect(sim.eventos.find(e => e.lado === 'der').t).toBeCloseTo(0.5 + 1 + 2 / 1, 12);
  });
});

describe('superposición analítica', () => {
  it('onda senoidal: periodo 1/f, longitud de onda λ y sentido de avance', () => {
    const y = ondaSenoidal({ amplitud: 0.2, longitudOnda: 1.5, frecuencia: 4, fase: 0.3 }), yi = ondaSenoidal({ amplitud: 0.2, longitudOnda: 1.5, frecuencia: 4, fase: 0.3, sentido: -1 });
    for (const [x, t] of [[0.2, 0.1], [1.1, 0.77]]) {
      expect(y(x, t + 0.25)).toBeCloseTo(y(x, t), 12);
      expect(y(x + 1.5, t)).toBeCloseTo(y(x, t), 12);
      expect(y(x + 6 * 0.05, t + 0.05)).toBeCloseTo(y(x, t), 12);     // avanza v = λf = 6 m/s
      expect(yi(x - 6 * 0.05, t + 0.05)).toBeCloseTo(yi(x, t), 12);
    }
  });
  it('método de la imagen: en el extremo fijo y = 0; en el libre ∂y/∂x = 0', () => {
    const G = pulsoGauss({ amplitud: 1, centro: 0, ancho: 0.3, velocidad: 2 });
    const f = conImagen(G, 3, 'fijo'), l = conImagen(G, 3, 'libre');
    for (const t of [0.5, 1.4, 1.5, 1.6, 2.5]) {
      expect(Math.abs(f.total(3, t))).toBeLessThan(1e-15);
      expect(Math.abs((l.total(3 + 1e-6, t) - l.total(3 - 1e-6, t)) / 2e-6)).toBeLessThan(1e-6);
    }
    // Después de reflejarse, el fijo es la incidente invertida que vuelve
    expect(f.total(2, 2)).toBeCloseTo(-1, 6);
    expect(l.total(2, 2)).toBeCloseTo(1, 6);
  });
  it('imágenes en un medio con dos extremos: periodo de ida y vuelta 2L/v (fijo–fijo) y 4L/v (fijo–libre)', () => {
    const G = pulsoGauss({ amplitud: 1, centro: 0.7, ancho: 0.05, velocidad: 1 });
    const ff = imagenesMedio(G, 0, 2, 'fijo', 'fijo', 6), fl = imagenesMedio(G, 0, 2, 'fijo', 'libre', 6);
    for (const x of [0.3, 0.7, 1.4]) {
      expect(ff(x, 4)).toBeCloseTo(ff(x, 0), 9);
      expect(fl(x, 8)).toBeCloseTo(fl(x, 0), 9);
      expect(fl(x, 4)).toBeCloseTo(-fl(x, 0), 9);
    }
  });
  it('resonancias del pistón: Lₙ = (2n − 1)λ/4 − e y v = 2f(L₂ − L₁)', () => {
    const r = resonanciasPiston({ frecuencia: 500, velocidad: 340, correccion: 0.005, cuantas: 3 });
    r.forEach((L, j) => expect(L).toBeCloseTo((2 * j + 1) * 0.68 / 4 - 0.005, 12));
    expect(velocidadDesdeResonancias(500, r[0], r[1])).toBeCloseTo(340, 9);
  });
  it('respuesta armónica de un tubo abierto–cerrado: máxima en L = λ/4 y 3λ/4, mínima en λ/2', () => {
    const v = 340, f = 500, S = 1e-3, K = RHO_AIRE * v * v * S, lam = v / f;
    const p = L => respuestaArmonica({ longitud: L, velocidad: v, rigidez: K, izq: 'abierto', der: 'cerrado', amortiguamiento: 10, amplitud: S }, f).esfuerzoL / S;
    const Ls = [], ps = [];
    for (let L = 0.05; L <= 0.7; L += 0.0005) { Ls.push(L); ps.push(p(L)); }
    const picos = [];
    for (let i = 1; i < ps.length - 1; i++) if (ps[i] > ps[i - 1] && ps[i] >= ps[i + 1]) picos.push(Ls[i]);
    expect(picos.length).toBe(2);
    expect(Math.abs(picos[0] - lam / 4)).toBeLessThan(1e-3);
    expect(Math.abs(picos[1] - 3 * lam / 4)).toBeLessThan(1e-3);
    expect(p(lam / 2)).toBeLessThan(p(lam / 4) / 20);
  });
});

describe('Doppler cinemático', () => {
  const c = 340;
  // Frecuencia recibida en el instante en que llega lo emitido en t_e
  function recibidaDesde(esc, te, iF = 0, iO = 0, camino = 'directo') {
    let lo = te, hi = te + 10;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2, r = recepcion(esc, iF, iO, m).find(x => x.camino === camino); if (!r || r.te < te) lo = m; else hi = m; }
    return recepcion(esc, iF, iO, hi).find(x => x.camino === camino);
  }

  it('1D: f′ = f(v ± v_o)/(v ∓ v_s) para fuente y observador que se acercan o se alejan', () => {
    for (const [us, uo] of [[20, 0], [-20, 0], [0, 15], [0, -15], [25, -10], [-12, 30]]) {
      // Fuente a la izquierda, observador a la derecha; positivas hacia +x
      const esc = { c, fuentes: [{ p: [-200, 0], v: [us, 0], f: 500 }], observadores: [{ p: [200, 0], v: [uo, 0] }] };
      const r = recepcion(esc, 0, 0, 1.5)[0];
      expect(rel(r.f, 500 * (c - uo) / (c - us))).toBeLessThan(1e-12);
      expect(rel(r.f, dopplerColineal({ f: 500, c, vFuente: us, vObservador: uo }))).toBeLessThan(1e-12);
    }
  });
  it('la frecuencia recibida es la derivada de la fase de la señal', () => {
    const esc = { c, viento: [4, -3], fuentes: [{ p: [-50, 30], v: [25, 5], f: 440 }], observadores: [{ p: [80, -10], v: [-6, 2] }] };
    for (const tr of [0.5, 2, 3.7]) {
      const h = 1e-6, fase = t => recepcion(esc, 0, 0, t)[0].fase;
      expect(rel((fase(tr + h) - fase(tr - h)) / (2 * h) / DOS_PI, recepcion(esc, 0, 0, tr)[0].f)).toBeLessThan(1e-7);
    }
  });
  it('fuente que pasa a una distancia: f′ = f·c/(c − u·cos θ) con θ en el instante de emisión', () => {
    const u = 25, d = 30, esc = { c, fuentes: [{ p: [-200, d], v: [u, 0], f: 700 }], observadores: [{ p: [0, 0] }] };
    for (const te of [0, 5, 8, 9, 12, 16]) {
      const r = recibidaDesde(esc, te), s = posicionEn(esc.fuentes[0], te);
      const cos = -s[0] / Math.hypot(s[0], s[1]);
      expect(rel(r.f, 700 * c / (c - u * cos))).toBeLessThan(1e-9);
    }
    // Al pasar por el punto más cercano la frecuencia recibida es la emitida
    expect(rel(recibidaDesde(esc, 200 / u).f, 700)).toBeLessThan(1e-9);
  });
  it('viento: con todo quieto no cambia f; con fuente móvil f′ = f(c + w)/(c + w − u)', () => {
    let esc = { c, viento: [10, 0], fuentes: [{ p: [0, 0], f: 500 }], observadores: [{ p: [100, 0] }] };
    const r = recepcion(esc, 0, 0, 2)[0];
    expect(r.f).toBeCloseTo(500, 10);
    expect(r.te).toBeCloseTo(2 - 100 / 350, 12);                      // el sonido va a c + w a favor del viento
    esc = { c, viento: [10, 0], fuentes: [{ p: [0, 0], v: [20, 0], f: 500 }], observadores: [{ p: [500, 0] }] };
    expect(rel(recepcion(esc, 0, 0, 1)[0].f, 500 * (c + 10) / (c + 10 - 20))).toBeLessThan(1e-12);
    esc = { c, viento: [10, 0], fuentes: [{ p: [0, 0], v: [20, 0], f: 500 }], observadores: [{ p: [-500, 0] }] };
    expect(rel(recepcion(esc, 0, 0, 1)[0].f, 500 * (c - 10) / (c - 10 + 20))).toBeLessThan(1e-12);
  });
  it('pared que se acerca: el eco tiene f(c + u)/(c − u) y la pulsación 2fu/(c − u) ≈ 2fu/c', () => {
    const f = 1000;
    for (const u of [1, 10, 30]) {
      const esc = { c, fuentes: [{ p: [0, 0], f }], observadores: [{ p: [0, 0] }], paredes: [{ punto: [100, 0], normal: [-1, 0], velocidad: u }] };
      const r = recepcion(esc, 0, 0, 0.5), eco = r.find(x => x.camino === 'pared 1'), dir = r.find(x => x.camino === 'directo');
      expect(rel(eco.f, f * (c + u) / (c - u))).toBeLessThan(1e-12);
      const pul = frecuenciaPulsacion(eco.f, dir.f);
      expect(rel(pul, 2 * f * u / (c - u))).toBeLessThan(1e-11);
      expect(rel(pul, 2 * f * u / c)).toBeLessThan(u / (c - u) * (1 + 1e-9));   // la aproximación pierde u/(c − u)
    }
  });
  it('la imagen de una pared quieta es el reflejo especular; la de una pared móvil, el foco de la hipérbola', () => {
    const q = imagenPared([1, 2], 0, { n: [0, 1], d0: -3, u: 0 }, c);
    expect(q.p[0]).toBeCloseTo(1, 12); expect(q.p[1]).toBeCloseTo(-8, 12); expect(q.t).toBe(0);
    // Pared móvil: los puntos de choque cumplen |H − F| − |H − I| = constante
    const u = 60, D0 = 50, m = imagenPared([0, 0], 0, { n: [0, 1], d0: -D0, u }, c);
    const dif = [];
    for (const th of [0, 0.3, 0.7, 1.0]) {
      // Punto de choque del frente en la dirección θ desde la normal (hacia la pared, −y)
      const tc = D0 / (c * Math.cos(th) + u), H = [c * tc * Math.sin(th), -c * tc * Math.cos(th)];
      dif.push(Math.hypot(H[0] - m.p[0], H[1] - m.p[1]) - c * (tc - m.t));
    }
    for (const d of dif) expect(Math.abs(d)).toBeLessThan(1e-9);
  });
  it('pulsaciones entre dos fuentes quietas: la envolvente se anula cada 1/|f₁ − f₂|', () => {
    const esc = { c, fuentes: [{ p: [0, 10], f: 440 }, { p: [0, -10], f: 444 }], observadores: [{ p: [100, 0] }] };
    expect(frecuenciaPulsacion(440, 444)).toBe(4);
    const r = Math.hypot(100, 10), retardo = r / c;
    // s = (2/r)·cos(2π·2(t − τ))·sen(2π·442(t − τ))
    for (const t of [0.4, 0.61, 0.873]) {
      expect(senalObservador(esc, 0, t)).toBeCloseTo(2 / r * Math.cos(DOS_PI * 2 * (t - retardo)) * Math.sin(DOS_PI * 442 * (t - retardo)), 12);
    }
    const env = t0 => { let m = 0; for (let k = 0; k < 200; k++) m = Math.max(m, Math.abs(senalObservador(esc, 0, t0 + k * 2.5e-5))); return m; };
    expect(env(retardo + 0.125 - 0.0025)).toBeLessThan(0.05 * 2 / r);
    expect(env(retardo + 0.25 - 0.0025)).toBeGreaterThan(0.99 * 2 / r);
  });
  it('frentes de onda: nacen donde estaba la fuente y los arrastra el viento', () => {
    const esc = { c, viento: [0, 5], fuentes: [{ p: [0, 0], v: [100, 0], f: 10, inicio: 0 }], observadores: [] };
    const fr = frentesOnda(esc, 0, 1);
    expect(fr.length).toBe(11);
    for (const x of fr) {
      expect(x.radio).toBeCloseTo(c * (1 - x.te), 9);
      expect(x.centro[0]).toBeCloseTo(100 * x.te, 9);
      expect(x.centro[1]).toBeCloseTo(5 * (1 - x.te), 9);
    }
  });
});

describe('MEXT: ondas viajeras (W1)', () => {
  it('2020 1-(4): tren de una longitud de onda contra un extremo fijo; en t = 2.0 s, y(0.75 m) = −0.60 m (figura d)', () => {
    const inc = viajera(x => (x < 0 || x > 0.6 ? 0 : -0.3 * Math.sin(DOS_PI * x / 0.6)), 0.3), an = conImagen(inc, 0.9, 'fijo');
    expect(an.total(0.75, 2)).toBeCloseTo(-0.6, 12);
    expect(an.incidente(0.75, 2)).toBeCloseTo(-0.3, 12);
    expect(an.reflejada(0.75, 2)).toBeCloseTo(-0.3, 12);
    for (const x of [-0.2, 0, 0.3, 0.55]) expect(an.total(x, 2)).toBe(0);
    // Medio discreto: cuerda de −0.3 a 0.9 m con v = 0.3 m/s (T = 0.09 N, μ = 1 kg/m)
    const sim = simularMedio({ tramos: [cuerda(1.2, 0.09, 1)], origen: -0.3, izq: { tipo: 'absorbente' }, der: { tipo: 'fijo' }, celdas: 1200,
      iniciales: [{ forma: 'tren', amplitud: -0.3, desde: 0, longitudOnda: 0.6, ciclos: 1, sentido: 1 }], duracion: 3 });
    const y = estadoMedio(sim, 2), m = extremo(sim, y, -0.3, 0.9, -1);
    expect(Math.abs(m.y + 0.6)).toBeLessThan(2e-3);
    expect(Math.abs(m.x - 0.75)).toBeLessThan(0.002);
    expect(sim.eventos[0].t).toBeCloseTo(2, 12);                      // el centro del tren llega a la pared en t = 2 s
    expect(maxAbs(y.filter((_, i) => sim.x[i] < 0.58))).toBeLessThan(5e-3);
  });
  it('2019 1-(4): A = 3 m, λ = 4 m, v = 2 m/s → y = 3 sen(π/2·(x − 2t)) (opción b)', () => {
    const y = ondaSenoidal({ amplitud: 3, longitudOnda: 4, frecuencia: 0.5 });
    for (const [x, t] of [[0, 0], [1, 0], [2.5, 1.3], [7, 3.1]]) expect(y(x, t)).toBeCloseTo(3 * Math.sin(Math.PI / 2 * (x - 2 * t)), 12);
    expect(y(1, 0)).toBeCloseTo(3, 12);
    expect(y(3, 0)).toBeCloseTo(-3, 12);
    // La misma onda en el medio discreto, mantenida por la fuente del extremo izquierdo
    const sim = simularMedio({ tramos: [{ longitud: 8.5, velocidad: 2, densidad: 1 }], origen: -1, izq: { tipo: 'absorbente', fuente: { forma: 'senoidal', amplitud: 3, frecuencia: 0.5, fase: -Math.PI / 2, inicio: -Infinity } },
      der: { tipo: 'absorbente' }, iniciales: [{ forma: 'senoidal', amplitud: 3, longitudOnda: 4, sentido: 1 }], duracion: 4, celdas: 850 });
    for (const t of [0, 1.3, 4]) {
      const ys = estadoMedio(sim, t);
      let err = 0;
      for (let i = 0; i <= sim.N; i++) err = Math.max(err, Math.abs(ys[i] - y(sim.x[i], t)));
      expect(err).toBeLessThan(3e-3 * 3);
    }
  });
  it('2018 P5: onda de presión ΔP = A·sen(…): amplitud A, periodo 2(t₂ − t₁), λ = 2v(t₂ − t₁) y densidad máxima donde ΔP es máxima', () => {
    const v = 340, f = 170, S = 1e-3, xi = 2e-6, rho = RHO_AIRE;
    const sim = simularMedio({ tramos: [tramoTubo({ longitud: 5, velocidad: v, seccion: S })], origen: -1,
      izq: { tipo: 'absorbente', fuente: { forma: 'senoidal', amplitud: xi, frecuencia: f } }, der: { tipo: 'absorbente' }, duracion: 0.03, celdas: 1000, cuadros: 3000 });
    // ΔP(t) en x = 0: −K·∂ξ/∂x / S
    const ps = [], ts = [];
    for (let q = 0; q < sim.cuadros; q++) if (sim.t[q] > 0.008) { ts.push(sim.t[q]); ps.push(esfuerzoMedio(sim, cuadroMedio(sim, q))[Math.round(1 / sim.h)] / S); }
    const A = rho * v * DOS_PI * f * xi;
    expect(rel(Math.max(...ps), A)).toBeLessThan(5e-3);
    expect(rel(-Math.min(...ps), A)).toBeLessThan(5e-3);
    // t₁: máximo; t₂: el mínimo siguiente
    const i1 = ps.indexOf(Math.max(...ps.slice(0, Math.round(ps.length / 3))));
    const medio = Math.round(0.75 / f / (ts[1] - ts[0]));
    let i2 = i1; for (let i = i1; i < ps.length && i < i1 + medio; i++) if (ps[i] < ps[i2]) i2 = i;
    const T = 2 * (ts[i2] - ts[i1]);
    expect(rel(T, 1 / f)).toBeLessThan(2e-2);
    expect(rel(v * T, 2 * v * (ts[i2] - ts[i1]))).toBeLessThan(1e-12);
    // Δρ = ΔP/v²: en una instantánea, el punto de mayor densidad es el de mayor ΔP
    const q = sim.cuadros - 1, p = esfuerzoMedio(sim, cuadroMedio(sim, q)), rhoP = Array.from(p, x => x / S / (v * v));
    expect(rhoP.indexOf(Math.max(...rhoP))).toBe(Array.from(p).indexOf(Math.max(...p)));
  });
  it('2006 1-(3): en una onda longitudinal la aceleración hacia +x es máxima donde el desplazamiento es mínimo (punto C)', () => {
    // ξ = 0.01·sen(πx − 2πt): en x = 0 la fuente da 0.01·sen(2πt + π)
    const sim = simularMedio({ tramos: [{ longitud: 4, velocidad: 2, densidad: 1 }], izq: { tipo: 'absorbente', fuente: { forma: 'senoidal', amplitud: 0.01, frecuencia: 1, fase: Math.PI, inicio: -Infinity } },
      der: { tipo: 'absorbente' }, iniciales: [{ forma: 'senoidal', amplitud: 0.01, longitudOnda: 2, sentido: 1 }], duracion: 1.3, celdas: 400 });
    const y = estadoMedio(sim, 1.3), a = aceleracionMedio(sim, y);
    // Una longitud de onda, como en la figura (A, B, C, D)
    const i0 = Math.round(1 / sim.h), i1 = Math.round(3 / sim.h);
    let iy = i0, ia = i0;
    for (let i = i0; i < i1; i++) { if (y[i] < y[iy]) iy = i; if (a[i] > a[ia]) ia = i; }
    expect(Math.abs(sim.x[iy] - sim.x[ia])).toBeLessThan(2 * sim.h);
    // a = −ω²·ξ en todo el medio
    const w = DOS_PI;
    for (let i = 20; i < sim.N - 20; i += 37) expect(Math.abs(a[i] + w * w * y[i])).toBeLessThan(2e-3 * w * w * 0.01);
  });
});

describe('MEXT: ondas estacionarias (W2)', () => {
  it('2027 1-(5): cuerda de 100 cm en su modo fundamental a 440 Hz → v = 2lf = 8.8 × 10² m/s', () => {
    const v = 2 * 1 * 440;
    expect(v).toBe(880);
    const md = modoEstacionario({ longitud: 1, velocidad: v, izq: 'fijo', der: 'fijo' }, 1);
    expect(md.f).toBeCloseTo(440, 10);
    expect(md.lambda).toBeCloseTo(2, 12);
    // Cuerda de acero: μ = 1 g/m y T = μv² = 774.4 N; la frecuencia medida es 440 Hz
    const sim = simularMedio({ tramos: [cuerda(1, 774.4, 1e-3)], izq: { tipo: 'fijo' }, der: { tipo: 'fijo' }, celdas: 200,
      iniciales: [{ forma: 'modo', amplitud: 1e-3, n: 1 }], duracion: 10 / 440, sondas: [0.5] });
    expect(rel(1 / periodoMedido(sim.sondas[0].t, sim.sondas[0].y), 440)).toBeLessThan(1e-4);
  });
  it('2019 1-(5): resonancias a 14 cm y 44 cm con 555 Hz → v = 333 m/s (opción c); el tubo simulado resuena allí', () => {
    const f = 555, v = velocidadDesdeResonancias(f, 0.14, 0.44);
    expect(v).toBeCloseTo(333, 9);
    const e = 0.25 * v / f - 0.14;                                     // corrección de extremo: 1 cm
    expect(e).toBeCloseTo(0.01, 12);
    resonanciasPiston({ frecuencia: f, velocidad: v, correccion: e, cuantas: 2 }).forEach((L, j) => expect(L).toBeCloseTo([0.14, 0.44][j], 12));
    // Medio discreto: el nodo de presión queda e por fuera de la boca. Presión en el pistón tras el transitorio
    const S = 1e-3, pPiston = L => {
      const sim = simularMedio({ tramos: [tramoTubo({ longitud: L + e, velocidad: v, seccion: S })], origen: -e,
        izq: { tipo: 'abierto', fuente: { forma: 'senoidal', amplitud: S, frecuencia: f } }, der: { tipo: 'cerrado' }, amortiguamiento: 25, duracion: 0.25, celdas: 80 });
      let m = 0;
      for (let q = sim.cuadros - 60; q < sim.cuadros; q++) m = Math.max(m, Math.abs(esfuerzoMedio(sim, cuadroMedio(sim, q))[sim.N]) / S);
      return m;
    };
    const p14 = pPiston(0.14), p29 = pPiston(0.29), p44 = pPiston(0.44);
    expect(p14).toBeGreaterThan(20 * p29);
    expect(p44).toBeGreaterThan(20 * p29);
  });
  it('2015 P5: resonancias en l y 3l → λ = 4l (i), v = 4fl (j); con el pistón en 3l la densidad varía más en x = l (b); la siguiente resonancia es 5f/3 (g)', () => {
    const f = 680, v = 340, l = v / (4 * f);
    const r = resonanciasPiston({ frecuencia: f, velocidad: v, cuantas: 2 });
    expect(r[0]).toBeCloseTo(l, 12); expect(r[1]).toBeCloseTo(3 * l, 12);
    expect(4 * l).toBeCloseTo(v / f, 12);
    expect(4 * f * l).toBeCloseTo(v, 9);
    const md = modoEstacionario({ longitud: 3 * l, velocidad: v, izq: 'abierto', der: 'cerrado' }, 2);
    expect(md.f).toBeCloseTo(f, 9);
    // Antinodos de presión (de densidad) = nodos de desplazamiento: x = l y x = 3l (el pistón)
    expect(md.antinodosPresion.map(x => x / l)).toEqual([expect.closeTo(1, 12), expect.closeTo(3, 12)]);
    expect(modoEstacionario({ longitud: 3 * l, velocidad: v, izq: 'abierto', der: 'cerrado' }, 3).f / f).toBeCloseTo(5 / 3, 12);
    // Al subir la temperatura sube v y con ella l
    expect(velocidadSonido(303.15) / (4 * f)).toBeGreaterThan(velocidadSonido(283.15) / (4 * f));
    // Simulado: modo 2 del tubo de 3l; la presión oscila con amplitud máxima en x = l
    const S = 1e-3, sim = simularMedio({ tramos: [tramoTubo({ longitud: 3 * l, velocidad: v, seccion: S })], izq: { tipo: 'abierto' }, der: { tipo: 'cerrado' }, celdas: 300,
      iniciales: [{ forma: 'modo', amplitud: 1e-6, n: 2 }], duracion: 2 / f, cuadros: 4000 });
    const amp = new Float64Array(sim.N + 1);
    for (let q = 0; q < sim.cuadros; q++) { const p = esfuerzoMedio(sim, cuadroMedio(sim, q)); for (let i = 0; i <= sim.N; i++) amp[i] = Math.max(amp[i], Math.abs(p[i])); }
    let im = 0; for (let i = 0; i < sim.N * 0.8; i++) if (amp[i] > amp[im]) im = i;
    expect(Math.abs(sim.x[im] - l)).toBeLessThan(2 * sim.h);
    expect(amp[0] / amp[im]).toBeLessThan(0.02);                         // la boca abierta es un nodo de presión
  });
  it('2008 P5: canal entre dos paredes, modo más bajo: 1 nodo, 2 antinodos y λ = 2L', () => {
    const L = 1, v = velocidadAguasSomeras(0.1), md = modoEstacionario({ longitud: L, velocidad: v, izq: 'libre', der: 'libre' }, 1);
    expect(md.nodos.length).toBe(1);
    expect(md.antinodos.length).toBe(2);
    expect(md.lambda).toBeCloseTo(2 * L, 12);
    // Simulado: la superficie en el centro no se mueve; en las paredes sube y baja
    const sim = simularMedio({ tramos: [{ longitud: L, velocidad: v, densidad: 1 }], izq: { tipo: 'libre' }, der: { tipo: 'libre' }, celdas: 100,
      iniciales: [{ forma: 'modo', amplitud: 0.01, n: 1 }], duracion: 3 / md.f, sondas: [0, 0.5, 1] });
    expect(maxAbs(sim.sondas[1].y)).toBeLessThan(1e-12);
    expect(maxAbs(sim.sondas[0].y)).toBeCloseTo(0.01, 6);
    expect(rel(1 / periodoMedido(sim.sondas[0].t, sim.sondas[0].y), md.f)).toBeLessThan(1e-4);
  });
});

describe('MEXT: efecto Doppler (W3)', () => {
  const recibida = (esc, te, iO = 0, iF = 0) => {
    let lo = te, hi = te + 60;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (recepcion(esc, iF, iO, m)[0].te < te) lo = m; else hi = m; }
    return recepcion(esc, iF, iO, hi)[0];
  };
  it('2018 1-(5): el observador se aleja a 5 m/s, S a 9 m y 12 m → 654 Hz (opción c)', () => {
    const esc = { c: 330, fuentes: [{ p: [-9, 12], f: 660 }], observadores: [{ p: [0, 0], v: [5, 0] }] };
    const r = recepcion(esc, 0, 0, 0)[0];
    expect(r.f).toBeCloseTo(654, 9);
  });
  it('2014 P5: B se mueve hacia A (d, c, g); la pared y C se mueven hacia B (a, e)', () => {
    const V = 340, v = 10, f = 500;
    let esc = { c: V, fuentes: [{ p: [0, 0], v: [v, 0], f }], observadores: [{ p: [50, 0] }], paredes: [{ punto: [-50, 0], normal: [1, 0] }] };
    const r = recepcion(esc, 0, 0, 1), dir = r.find(x => x.camino === 'directo').f, eco = r.find(x => x.camino === 'pared 1').f;
    expect(rel(dir, f * V / (V - v))).toBeLessThan(1e-12);
    expect(rel(eco, f * V / (V + v))).toBeLessThan(1e-12);
    expect(rel(frecuenciaPulsacion(dir, eco), f * 2 * V * v / (V * V - v * v))).toBeLessThan(1e-11);
    esc = { c: V, fuentes: [{ p: [0, 0], f }], observadores: [{ p: [50, 0] }, { p: [-50 + 1e-6, 0], v: [v, 0] }], paredes: [{ punto: [-50, 0], normal: [1, 0], velocidad: v }] };
    expect(rel(recepcion(esc, 0, 1, 1).find(x => x.camino === 'directo').f, f * (V + v) / V)).toBeLessThan(1e-12);
    expect(rel(recepcion(esc, 0, 0, 1).find(x => x.camino === 'pared 1').f, f * (V + v) / (V - v))).toBeLessThan(1e-12);
  });
  it('2020 P5: S₁ y S₂ con O en el origen: máximo en f = v/(d₂ − d₁) (e); S₁ se aleja: vf/(v + u) (a), pulsación de periodo (v + u)/(uf) (c); los dos se mueven: (d)', () => {
    const v = 340, d1 = 30, d2 = 50, h = Math.sqrt(d2 * d2 - d1 * d1), u = 5;
    // (1) fuentes quietas en fase: diferencia de fase 2π·f(d₂ − d₁)/v
    const f1 = v / (d2 - d1), quietas = { c: v, fuentes: [{ p: [d1, 0], f: f1 }, { p: [d1, h], f: f1 }], observadores: [{ p: [0, 0] }] };
    const df = recepcion(quietas, 0, 0, 1)[0].fase - recepcion(quietas, 1, 0, 1)[0].fase;
    expect(df).toBeCloseTo(DOS_PI, 9);
    // (2) y (3): S₁ se aleja por +x
    const f = 500, esc = { c: v, fuentes: [{ p: [d1, 0], v: [u, 0], f }, { p: [d1, h], f }], observadores: [{ p: [0, 0] }] };
    const r1 = recibida(esc, 0, 0, 0).f;
    expect(rel(r1, v * f / (v + u))).toBeLessThan(1e-12);
    expect(rel(1 / frecuenciaPulsacion(f, r1), (v + u) / (u * f))).toBeLessThan(1e-9);
    // (4) los dos a +x con u: pulsación (d₂ − d₁)uvf / ((v + u)(d₂v + d₁u)) en el instante inicial
    const ambas = { c: v, fuentes: [{ p: [d1, 0], v: [u, 0], f }, { p: [d1, h], v: [u, 0], f }], observadores: [{ p: [0, 0] }] };
    const b = frecuenciaPulsacion(recibida(ambas, 0, 0, 0).f, recibida(ambas, 0, 0, 1).f);
    expect(rel(b, (d2 - d1) * u * v * f / ((v + u) * (d2 * v + d1 * u)))).toBeLessThan(1e-9);
  });
  it('2013 P5: ambulancia a 60 km/h y 440 Hz: v₁₅/v₀ ≈ 1.027 (b), λ hacia delante ≈ 0.73 m (b), se oye ≈ 463 Hz (d)', () => {
    const v15 = velocidadSonido(288.15), u = 60 / 3.6, f = 440;
    expect(Number((v15 / velocidadSonido(273.15)).toFixed(3))).toBe(1.027);
    // Longitud de onda delante: separación de dos frentes consecutivos
    const esc = { c: v15, fuentes: [{ p: [0, 0], v: [u, 0], f }], observadores: [{ p: [1000, 0] }] };
    const fr = frentesOnda(esc, 0, 2).map(x => x.centro[0] + x.radio).sort((a, b) => b - a);
    expect(Number((fr[0] - fr[1]).toFixed(2))).toBe(0.74);
    expect(rel(fr[0] - fr[1], (v15 - u) / f)).toBeLessThan(1e-9);
    const r = recepcion(esc, 0, 0, 3)[0].f;
    expect(Math.round(r)).toBe(463);
  });
  it('2009 P5: con viento W a favor, ν₊ − ν = νU/(c + W − U) (c) y ν₋ − ν = −νU/(c − W + U) (c)', () => {
    const c = 340, U = 20, W = 8, nu = 600;
    const esc = { c, viento: [W, 0], fuentes: [{ p: [0, 0], v: [U, 0], f: nu }], observadores: [{ p: [800, 0] }, { p: [-800, 0] }] };
    expect(rel(recepcion(esc, 0, 0, 1)[0].f - nu, nu * U / (c + W - U))).toBeLessThan(1e-10);
    expect(rel(recepcion(esc, 0, 1, 4)[0].f - nu, -nu * U / (c - W + U))).toBeLessThan(1e-10);
  });
  it('2008 1-(4): el tren a 72 km/h oye 720 Hz al acercarse y 640 Hz al alejarse (a)', () => {
    const c = 340, u = 20, f = 720 * c / (c + u);
    expect(f).toBeCloseTo(680, 10);
    const esc = { c, fuentes: [{ p: [0, 0], f }], observadores: [{ p: [-500, 0], v: [u, 0] }] };
    expect(recepcion(esc, 0, 0, 10)[0].f).toBeCloseTo(720, 9);
    expect(recepcion(esc, 0, 0, 40)[0].f).toBeCloseTo(640, 9);
  });
  it('2007 P5: ν_A/ν_B − 1 ≈ 0.07 sin viento (d), con viento del este (c) y del norte (d)', () => {
    const u = 60 / 3.6;
    for (const w of [[0, 0], [-5, 0], [0, -5]]) {
      const esc = { c: 340, viento: w, fuentes: [{ p: [100, 100], v: [-u, 0], f: 880 }], observadores: [{ p: [0, 0] }] };
      const nA = recibida(esc, 0).f, nB = recibida(esc, 200 / u).f;
      expect(Math.abs(nA / nB - 1 - 0.07)).toBeLessThan(0.005);
    }
  });
  it('2006 P5: barco que cabecea con periodo T y avanza a V₀: λ delante/λ quieto = (bT − V₀)/bT (c); detrás (bT + V₀)/bT (e)', () => {
    const b = 1, T = 2, V0 = 0.5, esc = { c: b * T, fuentes: [{ p: [0, 0], v: [V0, 0], f: 1 / T }], observadores: [] };
    const fr = frentesOnda(esc, 0, 40);
    const delante = fr.map(x => x.centro[0] + x.radio).sort((p, q) => q - p), detras = fr.map(x => x.centro[0] - x.radio).sort((p, q) => p - q);
    expect((delante[0] - delante[1]) / (b * T * T)).toBeCloseTo((b * T - V0) / (b * T), 12);
    expect((detras[1] - detras[0]) / (b * T * T)).toBeCloseTo((b * T + V0) / (b * T), 12);
  });
});

describe('determinismo', () => {
  it('la misma escena da exactamente el mismo resultado', () => {
    const escena = () => ({ tramos: [cuerda(3, 4, 0.1), cuerda(2, 4, 0.4)], izq: { tipo: 'fijo', fuente: { forma: 'pulso', amplitud: 0.01, ancho: 0.02 } }, der: { tipo: 'libre' },
      amortiguamiento: 0.1, duracion: 2, sondas: [1, 4], celdas: 250 });
    const a = simularMedio(escena()), b = simularMedio(escena());
    expect(a.Y).toEqual(b.Y);
    expect(a.energia).toEqual(b.energia);
    expect(a.sondas).toEqual(b.sondas);
    expect(a.eventos).toEqual(b.eventos);
    for (const t of [0, 0.731, 2]) expect(estadoMedio(a, t)).toEqual(estadoMedio(b, t));
    expect(serieEn(a, 1.3)).toEqual(serieEn(b, 1.3));
  });
});
