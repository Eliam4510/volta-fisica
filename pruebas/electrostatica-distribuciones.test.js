// Distribuciones de carga, ley de Gauss, trabajo por un camino y escenas MEXT
// de «Cargas y campos» contra soluciones analíticas o cuadraturas
// independientes (sistema/motores/electrostatica.js).
import { describe, it, expect } from 'vitest';
import {
  K_COULOMB as k, EPSILON_0, R_REF, campo, potencial, campo3D, potencial3D, aporteFuente, elipticas, cargaDe,
  distanciaFuente, flujoEsfera, flujoCilindro, cargaEncerrada, trabajoCamino, simularCargas, estadoEn, energiaEstado,
  componentesVelocidad,
} from '../sistema/motores/electrostatica.js';
import { gaussLegendre } from '../sistema/nucleo/integradores.js';

const rel = (a, b, tol) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.abs(b));
const abs = (a, b, tol) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const modulo = v => Math.hypot(...v);

// E = −∇V por diferencias centrales en el plano
function gradienteV(fuentes, x, y, h = 1e-5) {
  return [
    -(potencial(fuentes, x + h, y) - potencial(fuentes, x - h, y)) / (2 * h),
    -(potencial(fuentes, x, y + h) - potencial(fuentes, x, y - h)) / (2 * h),
  ];
}

// ---------------------------------------------------------------------------
// Referencias independientes: superposición de cargas puntuales
// ---------------------------------------------------------------------------
// Anillo: N cargas puntuales iguales (regla del trapecio en φ, exponencial
// para integrandos periódicos lejos del anillo)
function anilloPorPuntos(f, x, y, z, N = 4000) {
  const ux = Math.cos(f.angulo), uy = Math.sin(f.angulo), nx = -uy, ny = ux;
  const E = [0, 0, 0]; let V = 0;
  for (let j = 0; j < N; j++) {
    const ph = 2 * Math.PI * j / N, px = f.x + f.radio * Math.cos(ph) * nx, py = f.y + f.radio * Math.cos(ph) * ny, pz = f.radio * Math.sin(ph);
    const dx = x - px, dy = y - py, dz = z - pz, r = Math.hypot(dx, dy, dz), dq = f.q / N;
    V += k * dq / r; E[0] += k * dq * dx / r ** 3; E[1] += k * dq * dy / r ** 3; E[2] += k * dq * dz / r ** 3;
  }
  return { E, V };
}
// Segmento o franja: Gauss–Legendre compuesto sobre cargas puntuales (segmento)
// o hilos infinitos de densidad σ·du (franja)
function porTramos(f, x, y, z, hilos) {
  const { x: g, w } = gaussLegendre(40), tx = Math.cos(f.angulo), ty = Math.sin(f.angulo), P = 40, L = f.largo;
  const E = [0, 0, 0]; let V = 0;
  for (let p = 0; p < P; p++) {
    const a = -L / 2 + L * p / P, b = a + L / P;
    for (let i = 0; i < g.length; i++) {
      const u = (a + b) / 2 + (b - a) / 2 * g[i], peso = (b - a) / 2 * w[i];
      const dx = x - (f.x + u * tx), dy = y - (f.y + u * ty);
      if (hilos) {
        const lam = f.sigma * peso, r2 = dx * dx + dy * dy;
        E[0] += 2 * k * lam * dx / r2; E[1] += 2 * k * lam * dy / r2; V += -k * lam * Math.log(r2 / (R_REF * R_REF));
      } else {
        const dq = f.q / L * peso, r = Math.hypot(dx, dy, z);
        E[0] += k * dq * dx / r ** 3; E[1] += k * dq * dy / r ** 3; E[2] += k * dq * z / r ** 3; V += k * dq / r;
      }
    }
  }
  return { E, V };
}

describe('integrales elípticas completas (media aritmético-geométrica)', () => {
  it('K(0) = E(0) = π/2 y valores de tabla en m = 0.5 y m = 0.9', () => {
    const [K0, E0] = elipticas(0);
    rel(K0, Math.PI / 2, 1e-15); rel(E0, Math.PI / 2, 1e-15);
    const [K5, E5] = elipticas(0.5);
    rel(K5, 1.8540746773013719, 1e-14); rel(E5, 1.3506438810476755, 1e-14);
    const [K9, E9] = elipticas(0.9);
    rel(K9, 2.5780921133481733, 1e-14); rel(E9, 1.1047747327040733, 1e-14);
  });
});

describe('hilo infinito perpendicular al plano', () => {
  const h = { tipo: 'hilo', x: 0.3, y: -0.2, lambda: 2.5e-6 };

  it('E = λ/(2πε₀r) radial hacia fuera y V = −(λ/2πε₀)·ln(r/r₀)', () => {
    for (const [x, y] of [[1, 1], [-2, 0.5], [0.31, -0.2], [0.3, 4]]) {
      const r = Math.hypot(x - h.x, y - h.y), E = campo([h], x, y);
      rel(modulo(E), h.lambda / (2 * Math.PI * EPSILON_0 * r), 1e-14);
      abs(E[0] * (y - h.y) - E[1] * (x - h.x), 0, 1e-13 * modulo(E) * r);
      expect(E[0] * (x - h.x) + E[1] * (y - h.y)).toBeGreaterThan(0);
      rel(potencial([h], x, y), -h.lambda / (2 * Math.PI * EPSILON_0) * Math.log(r / R_REF), 1e-13);
    }
  });
  it('no depende de z, no tiene componente z y E = −∇V', () => {
    expect(campo3D([h], 1, 0.5, 7)).toEqual(campo3D([h], 1, 0.5, -3));
    expect(campo3D([h], 1, 0.5, 7)[2]).toBe(0);
    const E = campo([h], -0.4, 0.9), g = gradienteV([h], -0.4, 0.9);
    abs(g[0], E[0], 1e-7 * modulo(E)); abs(g[1], E[1], 1e-7 * modulo(E));
  });
  it('es el límite de un segmento muy largo (perpendicular a su mitad, en 3D)', () => {
    // Segmento en el plano de largo 2000 m: a w = 0.4 m de su centro, E → 2kλ/w
    const s = { tipo: 'segmento', x: 0, y: 0, largo: 2000, angulo: 0, q: h.lambda * 2000 };
    rel(modulo(campo([s], 0, 0.4)), 2 * k * h.lambda / 0.4, 1e-7);
  });
});

describe('segmento cargado', () => {
  const s = { tipo: 'segmento', x: 0.1, y: -0.2, largo: 0.8, angulo: 0.6, q: 3e-6 };

  it('coincide con la superposición de cargas puntuales, también fuera del plano', () => {
    for (const [x, y, z] of [[1, 1, 0], [0.1, 0.2, 0], [-0.5, -0.4, 0.2], [0.8, 0.3, -0.1], [0.1 + 0.6 * Math.cos(0.6), -0.2 + 0.6 * Math.sin(0.6), 0]]) {
      const out = [0, 0, 0], V = aporteFuente(s, x, y, z, out), r = porTramos(s, x, y, z, false);
      rel(V, r.V, 1e-12);
      abs(modulo([out[0] - r.E[0], out[1] - r.E[1], out[2] - r.E[2]]), 0, 1e-11 * modulo(r.E));
    }
  });
  it('estable cerca de su recta: en la prolongación, E = kq/(s(s − L)) a lo largo del eje', () => {
    // Punto en la prolongación a distancia D del centro: E = kq/(D² − L²/4), V = (kq/L)·ln((D + L/2)/(D − L/2))
    const D = 0.9, tx = Math.cos(s.angulo), ty = Math.sin(s.angulo), x = s.x + D * tx, y = s.y + D * ty;
    const E = campo([s], x, y);
    rel(modulo(E), k * s.q / (D * D - s.largo ** 2 / 4), 1e-12);
    rel(E[0] * tx + E[1] * ty, modulo(E), 1e-12);
    rel(potencial([s], x, y), k * s.q / s.largo * Math.log((D + s.largo / 2) / (D - s.largo / 2)), 1e-12);
  });
  it('sobre el propio segmento no se define el campo y el potencial queda acotado', () => {
    const out = [1, 1, 1], V = aporteFuente(s, s.x, s.y, 0, out);
    expect(out).toEqual([0, 0, 0]);
    expect(Number.isFinite(V)).toBe(true);
    expect(V).toBeGreaterThan(0);
  });
});

describe('anillo cargado (visto de canto, eje en el plano)', () => {
  const f = { tipo: 'anillo', x: 0.2, y: -0.1, radio: 0.5, angulo: Math.PI / 6, q: 2e-6 };

  it('en su eje: E = kqz/(R² + z²)^{3/2} a lo largo del eje y V = kq/√(R² + z²)', () => {
    const tx = Math.cos(f.angulo), ty = Math.sin(f.angulo);
    for (const z of [-1.3, -0.35, 0.05, 0.4, 2]) {
      const x = f.x + z * tx, y = f.y + z * ty, E = campo([f], x, y), s2 = f.radio ** 2 + z * z;
      rel(E[0] * tx + E[1] * ty, k * f.q * z / s2 ** 1.5, 1e-13);
      abs(-E[0] * ty + E[1] * tx, 0, 1e-13 * modulo(E));
      rel(potencial([f], x, y), k * f.q / Math.sqrt(s2), 1e-14);
    }
    expect(campo([f], f.x, f.y)).toEqual([0, 0]);
    rel(potencial([f], f.x, f.y), k * f.q / f.radio, 1e-15);
  });
  it('fuera del eje coincide con la superposición de 4000 cargas puntuales (también fuera del plano)', () => {
    for (const [x, y, z] of [[1, 1, 0], [0.3, 0.2, 0.1], [-0.6, 0.4, -0.3], [0.2 + 0.3 * Math.cos(Math.PI / 6), -0.1 + 0.3 * Math.sin(Math.PI / 6), 0], [0.21, -0.1, 0]]) {
      const out = [0, 0, 0], V = aporteFuente(f, x, y, z, out), r = anilloPorPuntos(f, x, y, z);
      rel(V, r.V, 1e-13);
      abs(modulo([out[0] - r.E[0], out[1] - r.E[1], out[2] - r.E[2]]), 0, 1e-12 * modulo(r.E));
    }
  });
  it('continuo al cruzar ρ = 10⁻⁴·R (rama del eje) y E = −∇V', () => {
    const nx = -Math.sin(f.angulo), ny = Math.cos(f.angulo), tx = Math.cos(f.angulo), ty = Math.sin(f.angulo);
    const p = r => [f.x + 0.3 * tx + r * nx, f.y + 0.3 * ty + r * ny];
    const a = campo([f], ...p(0.99e-4 * f.radio)), b = campo([f], ...p(1.01e-4 * f.radio));
    abs(modulo([a[0] - b[0], a[1] - b[1]]), 0, 1e-6 * modulo(a));
    for (const [x, y] of [[0.9, 0.7], [-0.4, -0.5]]) {
      const E = campo([f], x, y), g = gradienteV([f], x, y, 1e-6);
      abs(g[0], E[0], 1e-7 * modulo(E)); abs(g[1], E[1], 1e-7 * modulo(E));
    }
  });
});

describe('lámina cargada (franja infinita en z) y plano infinito', () => {
  const L = { tipo: 'lamina', x: 0.1, y: 0.2, largo: 0.8, angulo: 0.4, sigma: 3e-7 };

  it('franja finita: coincide con la superposición de hilos de densidad σ·du', () => {
    for (const [x, y] of [[0.5, 0.9], [-0.4, -0.3], [0.1, 0.25], [1.5, 0.2]]) {
      const out = [0, 0, 0], V = aporteFuente(L, x, y, 0, out), r = porTramos(L, x, y, 0, true);
      abs(V, r.V, 1e-12 * Math.abs(r.V) + 1e-9);
      abs(modulo([out[0] - r.E[0], out[1] - r.E[1]]), 0, 1e-12 * modulo(r.E));
    }
  });
  it('plano infinito: |E| = σ/(2ε₀) a cada lado, hacia fuera, y V = −σ|n|/(2ε₀)', () => {
    const P = { tipo: 'lamina', x: 0, y: 0.5, largo: Infinity, angulo: 0, sigma: 2e-6 };
    for (const [x, y] of [[3, 0.6], [-7, 2.5], [0.2, -4]]) {
      const E = campo([P], x, y), n = y - 0.5;
      abs(E[0], 0, 1e-12 * modulo(E));
      rel(E[1], Math.sign(n) * P.sigma / (2 * EPSILON_0), 1e-14);
      rel(potencial([P], x, y), -P.sigma * Math.abs(n) / (2 * EPSILON_0), 1e-14);
    }
    expect(cargaDe(P)).toBe(Infinity);
  });
  it('franja muy ancha: σ/(2ε₀) cerca de su centro; muy lejos, el campo de un hilo λ = σ·L', () => {
    const W = { tipo: 'lamina', x: 0, y: 0, largo: 1e4, angulo: 0, sigma: 1e-6 };
    rel(modulo(campo([W], 0.3, 0.01)), W.sigma / (2 * EPSILON_0), 1e-5);
    const lejos = campo([L], L.x + 400, L.y - 300), lam = L.sigma * L.largo;
    rel(modulo(lejos), lam / (2 * Math.PI * EPSILON_0 * 500), 1e-6);
  });
  it('dos planos ±σ (capacitor ideal): E = σ/ε₀ entre ellos y 0 fuera', () => {
    const placas = [{ tipo: 'lamina', x: 0, y: 0.1, largo: Infinity, angulo: 0, sigma: -1e-6 }, { tipo: 'lamina', x: 0, y: -0.1, largo: Infinity, angulo: 0, sigma: 1e-6 }];
    rel(campo(placas, 0.4, 0.03)[1], 1e-6 / EPSILON_0, 1e-14);
    abs(modulo(campo(placas, 0.4, 0.5)), 0, 1e-9);
    abs(modulo(campo(placas, -3, -0.5)), 0, 1e-9);
    // ΔV entre placas = E·d
    rel(potencial(placas, 0, -0.1) - potencial(placas, 0, 0.1), 1e-6 / EPSILON_0 * 0.2, 1e-13);
  });
});

describe('esfera cargada y campo uniforme', () => {
  const R = 0.4, q = 5e-6;
  it('aislante: E = kqr/R³ dentro, kq/r² fuera; V continuo y kq(3R² − r²)/(2R³) dentro', () => {
    const s = { tipo: 'esfera', x: 0, y: 0, radio: R, q };
    for (const r of [0.1, 0.3, 0.39]) rel(modulo(campo([s], r, 0)), k * q * r / R ** 3, 1e-14);
    for (const r of [0.41, 1, 3]) rel(modulo(campo([s], 0, r)), k * q / r ** 2, 1e-14);
    rel(potencial([s], 0.2, 0), k * q * (3 * R * R - 0.04) / (2 * R ** 3), 1e-14);
    rel(potencial([s], R * (1 - 1e-12), 0), potencial([s], R * (1 + 1e-12), 0), 1e-10);
    expect(modulo(campo([s], 0, 0))).toBe(0);
  });
  it('conductora: E = 0 y V = kq/R dentro; kq/r² fuera', () => {
    const s = { tipo: 'esfera', x: 1, y: -1, radio: R, q, conductora: true };
    expect(campo([s], 1.2, -0.9)).toEqual([0, 0]);
    rel(potencial([s], 1.1, -1), k * q / R, 1e-15);
    rel(modulo(campo([s], 1, 1)), k * q / 4, 1e-14);
    rel(distanciaFuente(s, 1, 0), 1 - R, 1e-15);
  });
  it('campo uniforme: E constante en la dirección dada y V = −E·r', () => {
    const u = { tipo: 'uniforme', E0: 300, angulo: Math.PI / 3 };
    const E = campo([u], 5, -2);
    rel(E[0], 150, 1e-14); rel(E[1], 300 * Math.sin(Math.PI / 3), 1e-14);
    rel(potencial([u], 2, 1), -(150 * 2 + 300 * Math.sin(Math.PI / 3)), 1e-14);
    expect(distanciaFuente(u, 0, 0)).toBe(Infinity);
    expect(cargaDe(u)).toBe(0);
  });
  it('potencial3D y campo3D suman todas las fuentes', () => {
    const fuentes = [{ x: 0.5, y: 0, q: 1e-6 }, { tipo: 'hilo', x: -0.5, y: 0, lambda: -1e-6 }, { tipo: 'uniforme', E0: 100, angulo: 0 }];
    const [ex, ey] = campo3D(fuentes, 0.1, 0.7, 0);
    const [fx, fy] = campo(fuentes, 0.1, 0.7);
    rel(ex, fx, 1e-15); rel(ey, fy, 1e-15);
    rel(potencial3D(fuentes, 0.1, 0.7), potencial(fuentes, 0.1, 0.7), 1e-15);
  });
});

describe('ley de Gauss con distribuciones', () => {
  it('cilindro gaussiano alrededor de un hilo: Φ = λL/ε₀; fuera del cilindro, 0', () => {
    const h = { tipo: 'hilo', x: 0.1, y: 0.05, lambda: 2e-6 };
    rel(flujoCilindro([h], { x: 0, y: 0 }, 0.5, 1), h.lambda / EPSILON_0, 1e-12);
    rel(flujoCilindro([h], { x: 0, y: 0 }, 0.5, 2.5), 2.5 * h.lambda / EPSILON_0, 1e-12);
    abs(flujoCilindro([h], { x: 1, y: 1 }, 0.5, 1), 0, 1e-12 * h.lambda / EPSILON_0);
    rel(cargaEncerrada([h], { forma: 'cilindro', x: 0, y: 0, R: 0.5, L: 2.5 }), 2.5 * h.lambda, 1e-15);
  });
  it('cilindro que corta un plano cargado: Φ = σ·(cuerda)·L/ε₀', () => {
    const P = { tipo: 'lamina', x: 0, y: 0.1, largo: Infinity, angulo: 0, sigma: 1e-6 };
    const Q = cargaEncerrada([P], { forma: 'cilindro', x: 0, y: 0, R: 0.5, L: 1 });
    rel(Q, P.sigma * 2 * Math.sqrt(0.25 - 0.01), 1e-14);
    rel(flujoCilindro([P], { x: 0, y: 0 }, 0.5, 1, 96), Q / EPSILON_0, 1e-3);   // E salta en el plano
  });
  it('esfera alrededor de un segmento o de un anillo enteros: Φ = q/ε₀', () => {
    const s = { tipo: 'segmento', x: 0.1, y: -0.1, largo: 0.6, angulo: 0.3, q: 1e-6 };
    const a = { tipo: 'anillo', x: 0.1, y: 0, radio: 0.3, angulo: 1, q: -2e-6 };
    rel(flujoEsfera([s], { x: 0, y: 0 }, 0.8), s.q / EPSILON_0, 1e-10);
    rel(flujoEsfera([a], { x: 0, y: 0 }, 0.8), a.q / EPSILON_0, 1e-10);
    rel(flujoEsfera([s, a], { x: 0, y: 0 }, 0.8), (s.q + a.q) / EPSILON_0, 1e-9);
  });
  it('carga encerrada exacta por partes: lente de esferas, casquete, cuerda de segmento, arco de anillo', () => {
    // Esfera maciza a medias: volumen de la lente / volumen de la esfera
    const m = { tipo: 'esfera', x: 0.4, y: 0, radio: 0.3, q: 1e-6 };
    const Qm = cargaEncerrada([m], { forma: 'esfera', x: 0, y: 0, R: 0.5 });
    rel(flujoEsfera([m], { x: 0, y: 0 }, 0.5, 96), Qm / EPSILON_0, 1e-5);
    // Por cuadratura en rodajas x = const de la esfera de carga (x de 0.1 a 0.7):
    // las dos secciones son discos concéntricos, la común es la menor
    const { x: g, w } = gaussLegendre(200);
    let V = 0;
    for (let i = 0; i < 200; i++) {
      const X = 0.4 + 0.3 * g[i];
      const r1 = Math.sqrt(Math.max(0, 0.09 - (X - 0.4) ** 2)), r2 = Math.sqrt(Math.max(0, 0.25 - X * X));
      V += w[i] * 0.3 * Math.PI * Math.min(r1, r2) ** 2;
    }
    rel(Qm, m.q * V / (4 / 3 * Math.PI * 0.027), 1e-4);
    // Cáscara conductora cortada: fracción de área (1 − cos θ₀)/2
    const c = { tipo: 'esfera', x: 0.4, y: 0, radio: 0.3, q: 1e-6, conductora: true };
    const cos0 = (0.16 + 0.09 - 0.25) / (2 * 0.4 * 0.3);
    rel(cargaEncerrada([c], { forma: 'esfera', x: 0, y: 0, R: 0.5 }), c.q * (1 - cos0) / 2, 1e-14);
    // Segmento que sale de la esfera: el tramo de dentro
    const s = { tipo: 'segmento', x: 0.4, y: 0, largo: 0.6, angulo: 0, q: 1e-6 };
    rel(cargaEncerrada([s], { forma: 'esfera', x: 0, y: 0, R: 0.5 }), s.q * (0.5 - 0.1) / 0.6, 1e-14);
    // Anillo centrado en la gaussiana (de canto en el plano): entero dentro o fuera según su radio
    expect(cargaEncerrada([{ tipo: 'anillo', x: 0, y: 0, radio: 0.4, angulo: 0, q: 3e-6 }], { forma: 'esfera', x: 0, y: 0, R: 0.5 })).toBe(3e-6);
    expect(cargaEncerrada([{ tipo: 'anillo', x: 0, y: 0, radio: 0.6, angulo: 0, q: 3e-6 }], { forma: 'esfera', x: 0, y: 0, R: 0.5 })).toBe(0);
    // Anillo desplazado: la fracción de su circunferencia a menos de R
    const a = { tipo: 'anillo', x: 0, y: 0.3, radio: 0.4, angulo: 0, q: 1e-6 };
    let dentro = 0; const N = 200000;
    for (let j = 0; j < N; j++) { const ph = 2 * Math.PI * (j + 0.5) / N; if ((0.3 + 0.4 * Math.cos(ph)) ** 2 + (0.4 * Math.sin(ph)) ** 2 < 0.25) dentro++; }
    rel(cargaEncerrada([a], { forma: 'esfera', x: 0, y: 0, R: 0.5 }), a.q * dentro / N, 1e-4);
  });
  it('cilindro: un segmento o una esfera por encima de las tapas no están dentro', () => {
    const s = { tipo: 'segmento', x: 0, y: 0, z: 0.8, largo: 0.4, angulo: 0, q: 1e-6 };
    expect(cargaEncerrada([s], { forma: 'cilindro', x: 0, y: 0, R: 0.5, L: 1 })).toBe(0);
    expect(cargaEncerrada([{ ...s, z: 0.2 }], { forma: 'cilindro', x: 0, y: 0, R: 0.5, L: 1 })).toBe(1e-6);
    const e = { tipo: 'esfera', x: 0, y: 0, z: 0.9, radio: 0.2, q: 1e-6 };
    expect(cargaEncerrada([e], { forma: 'cilindro', x: 0, y: 0, R: 0.5, L: 1 })).toBe(0);
    rel(cargaEncerrada([{ ...e, z: 0.1 }], { forma: 'cilindro', x: 0, y: 0, R: 0.5, L: 1 }), 1e-6, 1e-15);
    // Esfera maciza cortada por la tapa a su altura media: la mitad
    rel(cargaEncerrada([{ ...e, z: 0.5 }], { forma: 'cilindro', x: 0, y: 0, R: 0.5, L: 1 }), 0.5e-6, 1e-12);
  });
  it('el flujo por una esfera es el de la carga encerrada aunque haya fuentes fuera', () => {
    const fuentes = [{ x: 0.2, y: 0.1, q: 2e-6 }, { tipo: 'segmento', x: 3, y: 0, largo: 1, angulo: 1, q: -5e-6 }, { tipo: 'anillo', x: -2, y: 1, radio: 0.4, angulo: 0, q: 4e-6 }];
    rel(flujoEsfera(fuentes, { x: 0, y: 0 }, 0.6), cargaEncerrada(fuentes, { forma: 'esfera', x: 0, y: 0, R: 0.6 }) / EPSILON_0, 1e-10);
  });
});

describe('trabajo por un camino', () => {
  const fuentes = [{ x: -0.5, y: 0, q: 1e-6 }, { x: 0.5, y: 0, q: -2e-6 }, { tipo: 'hilo', x: 0, y: 1.5, lambda: 1e-6 }];
  it('no depende del camino: q·(V₀ − V₁) por una recta y por una quebrada', () => {
    const q = 3e-6, A = [-1, 1], B = [1.2, 0.6];
    const recto = trabajoCamino(fuentes, q, [A, B]), quebrado = trabajoCamino(fuentes, q, [A, [-1, -1], [2, -1], B]);
    const esperado = q * (potencial(fuentes, ...A) - potencial(fuentes, ...B));
    rel(recto.campo, esperado, 1e-10); rel(quebrado.campo, esperado, 1e-9);
    rel(recto.externo, -esperado, 1e-10);
  });
  it('en un camino cerrado el trabajo es 0', () => {
    const W = trabajoCamino(fuentes, 1e-6, [[-1, 1], [1, 1], [1, -1], [-1, -1], [-1, 1]]);
    abs(W.campo, 0, 1e-9 * Math.abs(trabajoCamino(fuentes, 1e-6, [[-1, 1], [1, 1]]).campo));
  });
});

// ---------------------------------------------------------------------------
// Escenas MEXT de «Cargas y campos» (E1)
// ---------------------------------------------------------------------------
describe('MEXT E1 · campos y potenciales', () => {
  const q = 1e-6;
  it('2006 1-(2): en P, E apunta hacia −x (D) y vale kq/d²', () => {
    const d = 0.8, f = [{ x: -d / 2, y: 0, q: -q }, { x: d / 2, y: 0, q }], E = campo(f, 0, Math.sqrt(3) / 2 * d);
    rel(E[0], -k * q / d ** 2, 1e-14); abs(E[1], 0, 1e-14 * modulo(E));
  });
  it('2013 1-(3): E en C paralelo a AB exige q = −q′/(2√2)', () => {
    const a = 0.5, qp = -2e-6, f = [{ x: 0, y: 0, q: -qp / (2 * Math.SQRT2) }, { x: a, y: 0, q: qp }], E = campo(f, 0, a);
    abs(E[1], 0, 1e-14 * modulo(E));
    expect(E[0]).toBeGreaterThan(0);                // hacia B, como la flecha de la figura
    // Con cualquier otra relación de la lista, E en C no es horizontal
    for (const r of [1, -1, Math.SQRT2, -Math.SQRT2, 0.5, -0.5, 0.25, -0.25]) {
      const g = [{ x: 0, y: 0, q: r * qp }, { x: a, y: 0, q: qp }], Eg = campo(g, 0, a);
      expect(Math.abs(Eg[1])).toBeGreaterThan(0.01 * modulo(Eg));
    }
  });
  it('2010 4-A: cuatro cargas en las esquinas de un cuadrado de lado 4a: V_A = V_B < V_C', () => {
    const a = 0.25, Q = 1e-6;
    const f = [{ x: -2 * a, y: 2 * a, q: Q }, { x: 2 * a, y: 2 * a, q: -Q }, { x: -2 * a, y: -2 * a, q: -Q }, { x: 2 * a, y: -2 * a, q: Q }];
    const VA = potencial(f, 0, a), VB = potencial(f, 0, 0), VC = potencial(f, a, -a);
    abs(VA, 0, 1e-9); abs(VB, 0, 1e-9);
    rel(VC, k * Q / a * (1 / Math.sqrt(18) - 2 / Math.sqrt(10) + 1 / Math.SQRT2), 1e-13);
    expect(VC).toBeGreaterThan(0);
  });
  it('2008 P2 (1)–(3): +q en A y −q en B: E(D) va de A a B con módulo kq/(√2·a²) y V_C = V_D', () => {
    const a = 0.6, f = [{ x: -a, y: 0, q }, { x: a, y: 0, q: -q }], E = campo(f, 0, -a);
    rel(E[0], k * q / (Math.SQRT2 * a * a), 1e-14); abs(E[1], 0, 1e-14 * E[0]);
    abs(potencial(f, 0, 0), 0, 1e-9); abs(potencial(f, 0, -a), 0, 1e-9);
  });
  it('2023 1-(3): llevar Q de C al punto medio P de AB cuesta 2kqQ/l, por cualquier camino', () => {
    const l = 0.5, Q = 2e-6, f = [{ x: -l / 2, y: 0, q }, { x: l / 2, y: 0, q }], C = [0, Math.sqrt(3) / 2 * l];
    rel(trabajoCamino(f, Q, [C, [0, 0]]).externo, 2 * k * q * Q / l, 1e-10);
    rel(trabajoCamino(f, Q, [C, [-0.6, 0.3], [-0.6, -0.2], [0, -0.2], [0, 0]]).externo, 2 * k * q * Q / l, 1e-9);
  });
});

describe('MEXT E1 · cargas en movimiento', () => {
  it('2018 1-(3): en un campo uniforme, desde el reposo recorre d en t = √(2md/(qE))', () => {
    const q = 2e-6, m = 1e-3, E0 = 500, d = 0.4;
    const s = simularCargas({ fijas: [{ tipo: 'uniforme', E0, angulo: 0 }], libres: [{ id: 'P', x: -d, y: 0, q, m }] }, { duracion: 1, escalaLongitud: d });
    const o = s.eventos.find(e => e.nombre === 'Pasa por O');
    rel(o.t, Math.sqrt(2 * m * d / (q * E0)), 1e-10);
    rel(o.v, Math.sqrt(2 * q * E0 * d / m), 1e-10);
    expect(s.deriva).toBeLessThan(1e-10);
  });

  it('2015 1-(4): distancia mínima de acercamiento qQL/(qQ + 2πε₀mv²L)', () => {
    const q = 1e-6, Q = 4e-6, m = 2e-3, L = 1, v = 3;
    const s = simularCargas({ fijas: [{ id: 'Q', x: 0, y: 0, q: Q }], libres: [{ id: 'q', x: L, y: 0, q, m, vx: -v }] }, { duracion: 3, radioChoque: 1e-3 });
    const ret = s.eventos.find(e => e.tipo === 'retorno');
    rel(Math.hypot(ret.x, ret.y), q * Q * L / (q * Q + 2 * Math.PI * EPSILON_0 * m * v * v * L), 1e-9);
    expect(s.choque).toBeNull();
  });

  it('2017 1-(4): con Q = 4πε₀·k·d·(ℓ + d)²/q el resorte queda comprimido d en equilibrio estable', () => {
    const q = 1e-6, kr = 20, l = 0.3, d = 0.05, m = 0.01, L0 = 0.2;
    const Q = 4 * Math.PI * EPSILON_0 * kr * d * (l + d) ** 2 / q;
    // En x = −d la fuerza del resorte (k·d hacia +x) equilibra la de Coulomb (hacia −x)
    const [fx] = campo([{ x: l, y: 0, q: Q }], -d, 0);
    rel(q * fx, -kr * d, 1e-13);
    // Soltada en x = 0 con amortiguamiento, termina en reposo en x = −d
    const s = simularCargas({ fijas: [{ id: 'Q', x: l, y: 0, q: Q }], libres: [{ id: 'q', x: 0, y: 0, q, m, resorte: { x: -L0, y: 0, k: kr, L0 }, b: 0.2 }] }, { duracion: 4 });
    const f = estadoEn(s, 4);
    abs(f.x, -d, 1e-6); abs(f.vx, 0, 1e-5);
    // Balance: cinética + eléctrica + elástica + disipada se conserva
    expect(s.deriva).toBeLessThan(1e-8);
    const { Wd } = energiaEstado(s, s.solucion.y[s.solucion.y.length - 1]);
    expect(Wd).toBeGreaterThan(0);
  });

  it('2027 P3 (3)–(4): sin la carga en A, −q gira alrededor de B con v = √(kQq/(√2·m·d)) en sentido horario', () => {
    const Q = 2e-6, q = 1e-6, d = 0.5, m = 1e-3;
    const v = Math.sqrt(k * Q * q / (Math.SQRT2 * m * d)), [vx, vy] = [v / Math.SQRT2, -v / Math.SQRT2];
    const T = 2 * Math.PI * Math.SQRT2 * d / v;
    const s = simularCargas({ fijas: [{ id: 'B', x: -d, y: 0, q: Q }], libres: [{ id: 'P', x: 0, y: d, q: -q, m, vx, vy }] }, { duracion: T, rtol: 1e-11, atol: 1e-12 });
    for (let i = 0; i <= 50; i++) {
      const e = estadoEn(s, T * i / 50);
      rel(Math.hypot(e.x + d, e.y), Math.SQRT2 * d, 1e-8);
      rel(Math.hypot(e.vx, e.vy), v, 1e-8);
    }
    const fin = estadoEn(s, T); abs(fin.x, 0, 1e-7 * d); rel(fin.y, d, 1e-7);
    // Sentido horario: momento angular respecto de B negativo
    expect((0 + d) * vy - d * vx).toBeLessThan(0);
    // Aceleración centrípeta kQq/(2md²)
    const [ex, ey] = campo([{ x: -d, y: 0, q: Q }], 0, d);
    rel(q * Math.hypot(ex, ey) / m, k * Q * q / (2 * m * d * d), 1e-14);
  });

  it('2027 P3 (5) y 2008 P2 (4)–(5): energía en O, trabajo de C a D y rapidez mínima de escape', () => {
    const Q = 1e-6, q = 1e-6, a = 1, m = 2e-3, f = [{ x: -a, y: 0, q: Q }, { x: a, y: 0, q: Q }];
    // Soltada en (0, a): K máxima en O = (2 − √2)kQq/a
    const s = simularCargas({ fijas: f, libres: [{ x: 0, y: a, q: -q, m }] }, { duracion: 2, escalaLongitud: a });
    const o = s.eventos.find(e => e.nombre === 'Pasa por O');
    rel(0.5 * m * o.v * o.v, (2 - Math.SQRT2) * k * Q * q / a, 1e-9);
    // Trabajo para llevar −q despacio de C (0, 0) a D (0, −a)
    rel(trabajoCamino(f, -q, [[0, 0], [0, -a]]).externo, (2 - Math.SQRT2) * k * q * q / a, 1e-10);
    // Desde D hacia C: con 1.001·v_mín escapa por arriba; con 0.999·v_mín vuelve
    const vmin = Math.sqrt(2 * Math.SQRT2 * k * q * q / (m * a));
    for (const [fac, escapa] of [[1.001, true], [0.999, false]]) {
      const [vx, vy] = componentesVelocidad(fac * vmin, 90);
      // Con 0.999·v_mín el retorno está a unos 700·a: hace falta un tiempo largo
      const r = simularCargas({ fijas: f, libres: [{ x: 0, y: -a, q: -q, m, vx, vy }] }, { duracion: 12000, rtol: 1e-11, atol: 1e-12, escalaLongitud: a });
      expect(r.E0 > 0).toBe(escapa);
      expect(r.eventos.some(e => e.tipo === 'retorno')).toBe(!escapa);
    }
  });
});

describe('ejemplos y tutoriales con distribuciones', () => {
  it('carga que oscila por el eje de un anillo: periodo de pequeñas oscilaciones 2π√(mR³/(kQq))', () => {
    const Q = 3e-6, q = 1e-6, R = 0.4, m = 1e-3, A = 1e-3 * R;
    const s = simularCargas({ fijas: [{ tipo: 'anillo', x: 0, y: 0, radio: R, angulo: 0, q: Q }], libres: [{ x: A, y: 0, q: -q, m }] }, { duracion: 3, escalaLongitud: R });
    const vueltas = s.eventos.filter(e => e.nombre === 'Vuelve al inicio');
    expect(vueltas.length).toBeGreaterThan(1);
    rel(vueltas[0].t, 2 * Math.PI * Math.sqrt(m * R ** 3 / (k * Q * q)), 1e-5);
    expect(s.choque).toBeNull();
    expect(s.deriva).toBeLessThan(1e-9);
  });

  it('tiro eléctrico entre dos planos ±σ: parábola y choque con la placa en t = √(2hm/(qE))', () => {
    const sigma = 4e-8, h = 0.05, q = 1e-6, m = 1e-4, vx = 2;
    const placas = [{ id: 'S', nombre: 'Placa superior', tipo: 'lamina', x: 0, y: h, largo: Infinity, angulo: 0, sigma: -sigma }, { id: 'I', nombre: 'Placa inferior', tipo: 'lamina', x: 0, y: -h, largo: Infinity, angulo: 0, sigma }];
    const s = simularCargas({ fijas: placas, libres: [{ id: 'P', x: 0, y: 0, q, m, vx }] }, { duracion: 2, radioChoque: 0.002 });
    const E = sigma / EPSILON_0, tc = Math.sqrt(2 * h * m / (q * E));
    expect(s.choque.nombre).toBe('Choca con Placa superior');
    rel(s.choque.t, tc, 1e-9);
    rel(s.choque.x, vx * tc, 1e-9); rel(s.choque.y, h, 1e-12);
    for (const t of [0.2 * tc, 0.7 * tc]) rel(estadoEn(s, t).y, 0.5 * q * E / m * t * t, 1e-9);
  });

  it('placas finitas (franjas): la partícula que sale entre ellas sigue y cruza el borde sin chocar', () => {
    const sigma = 2e-8, h = 0.05, q = 1e-6, m = 1e-4;
    const placas = [{ tipo: 'lamina', x: 0, y: h, largo: 0.2, angulo: 0, sigma: -sigma }, { tipo: 'lamina', x: 0, y: -h, largo: 0.2, angulo: 0, sigma }];
    const s = simularCargas({ fijas: placas, libres: [{ x: -0.1, y: 0, q, m, vx: 4 }] }, { duracion: 0.2, radioChoque: 0.002 });
    expect(s.choque).toBeNull();
    const fin = estadoEn(s, 0.2);
    expect(fin.x).toBeGreaterThan(0.1);
    expect(fin.y).toBeGreaterThan(0);             // desviada hacia la placa negativa
    expect(s.deriva).toBeLessThan(1e-9);
  });

  it('una carga que llega a una esfera o a un hilo choca con su superficie', () => {
    const esf = { id: 'E', nombre: 'Esfera', tipo: 'esfera', x: 0, y: 0, radio: 0.2, q: 1e-6, conductora: true };
    const s = simularCargas({ fijas: [esf], libres: [{ x: 1, y: 0, q: -1e-6, m: 1e-3 }] }, { duracion: 5, radioChoque: 0.01 });
    expect(s.choque.nombre).toBe('Choca con Esfera');
    rel(Math.hypot(s.choque.x, s.choque.y), 0.21, 1e-9);
  });
});
