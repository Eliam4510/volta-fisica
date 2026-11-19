// Exactitud física del motor de la cubeta de ondas (2D): fórmulas y modelo
// analítico, condición CFL, rapidez de un frente circular, λ = v/f,
// amplitud de la función de Green, líneas nodales y antinodales de dos
// fuentes (analíticas y medidas en la malla), ley de Snell y cambio de λ
// sin cambio de f, reflexión en una barrera, difracción por una rendija,
// bordes absorbentes, película, determinismo y las situaciones MEXT de
// interferencia (W4) y refracción de ondas (W5). Mallas pequeñas: cada
// prueba tarda menos de ~2 s también en la máquina de Windows de CI.
import { describe, it, expect } from 'vitest';
import {
  Cubeta, crearCubeta, besselJ0, besselY0, longitudOnda, indiceRelativo, snell, anguloLimite, diferenciaCaminos,
  fasor, frecuenciaMedida, fasorAnalitico, campoFuente, campoAnalitico, lineasInterferencia, crestas, senalFuente, arregloFuentes,
  rapidezEn, segmentosRendija, dentroPoligono, COURANT_MAX,
} from '../sistema/motores/ondas2d.js';
import { velocidadSonido, velocidadAguasSomeras } from '../sistema/motores/ondas.js';

const GRADO = Math.PI / 180;
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

// Instante del máximo de una serie (parábola por los tres puntos del pico) entre desde y hasta
function pico(s, desde = -Infinity, hasta = Infinity) {
  let k = -1;
  for (let i = 1; i < s.y.length - 1; i++) if (s.t[i] >= desde && s.t[i] <= hasta && (k < 0 || s.y[i] > s.y[k])) k = i;
  const a = s.y[k - 1], b = s.y[k], c = s.y[k + 1], d = 0.5 * (a - c) / (a - 2 * b + c);
  return { t: s.t[k] + d * (s.t[1] - s.t[0]), y: b - 0.25 * (a - c) * d };
}
// Extremo (mín o máx) de una lista muestreada, afinado con una parábola
function extremoLocal(xs, ys, k) {
  const a = ys[k - 1], b = ys[k], c = ys[k + 1], d = 0.5 * (a - c) / (a - 2 * b + c);
  return xs[k] + d * (xs[1] - xs[0]);
}
// Amplitudes de régimen (ajuste senoidal) de todas las sondas en [desde, hasta]
const amplitudes = (c, f, desde, hasta) => c.sondas.map((_, i) => { const s = c.serie(i); return fasor(s.t, s.y, f, desde, hasta); });
// Número de onda medido en un parche cuadrado de n × n sondas separadas d (fase de régimen)
function numeroOnda(F, n, d) {
  let gx = 0, gy = 0, nx = 0, ny = 0;
  const fa = (i, j) => F[i * n + j].fase;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i < n - 1) { let q = fa(i + 1, j) - fa(i, j); q = Math.atan2(Math.sin(q), Math.cos(q)); gx += q / d; nx++; }
    if (j < n - 1) { let q = fa(i, j + 1) - fa(i, j); q = Math.atan2(Math.sin(q), Math.cos(q)); gy += q / d; ny++; }
  }
  // u = R sen(ωt + φ) con φ = φ₀ − k·x: k = −∇φ
  const kx = -gx / nx, ky = -gy / ny;
  return { k: Math.hypot(kx, ky), lambda: 2 * Math.PI / Math.hypot(kx, ky), angulo: Math.atan2(ky, kx) };
}
const parche = (x0, y0, n, d) => { const p = []; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) p.push([x0 + i * d, y0 + j * d]); return p; };
// Raíz de g en [a, b] por bisección
function raiz(g, a, b) { let ga = g(a); for (let i = 0; i < 80; i++) { const m = (a + b) / 2, gm = g(m); if (Math.sign(gm) === Math.sign(ga)) { a = m; ga = gm; } else b = m; } return (a + b) / 2; }

describe('fórmulas y modelo analítico', () => {
  it('Bessel J₀ e Y₀: valores de tabla y ceros', () => {
    expect(besselJ0(0)).toBeCloseTo(1, 8);
    expect(besselJ0(1)).toBeCloseTo(0.7651976866, 8);
    expect(besselJ0(10)).toBeCloseTo(-0.2459357645, 8);
    expect(Math.abs(besselJ0(2.404825557695773))).toBeLessThan(1e-8);
    expect(besselY0(1)).toBeCloseTo(0.0882569642, 7);
    expect(besselY0(10)).toBeCloseTo(0.0556711673, 7);
    expect(Math.abs(besselY0(0.893576966279167))).toBeLessThan(1e-8);
  });

  it('λ = v/f, índice relativo n = v₁/v₂, Snell y ángulo límite', () => {
    expect(longitudOnda(340, 85)).toBe(4);
    expect(indiceRelativo(1.5, 1)).toBe(1.5);
    const t2 = snell(30 * GRADO, 1.5, 1);
    expect(Math.sin(30 * GRADO) / Math.sin(t2)).toBeCloseTo(1.5, 12);
    expect(snell(60 * GRADO, 1, 1.5)).toBeNull();                 // reflexión total
    expect(anguloLimite(1, 2)).toBeCloseTo(30 * GRADO, 12);
    expect(anguloLimite(2, 1)).toBeNull();
  });

  it('campo de una fuente: la solución exacta (Hankel) tiende a A·√(λ/r)·sen(ωt + φ − kr − π/4)', () => {
    const f = { p: [0, 0], frecuencia: 2, amplitud: 0.3, fase: 0.4, inicio: -Infinity };
    for (const r of [3, 6, 12]) {
      const ex = fasorAnalitico([f], r, 0, 1, { exacta: true }), le = fasorAnalitico([f], r, 0, 1);
      expect(rel(ex.amplitud, 0.3 * Math.sqrt(0.5 / r))).toBeLessThan(0.02 / r);
      expect(Math.abs(Math.atan2(Math.sin(ex.fase - le.fase), Math.cos(ex.fase - le.fase)))).toBeLessThan(0.01 / r);
      // El valor instantáneo coincide con el fasor
      const t = 0.37, u = campoFuente(f, r, 0, t, 1, { exacta: true });
      expect(u).toBeCloseTo(ex.amplitud * Math.sin(2 * Math.PI * 2 * t + ex.fase), 10);
    }
    // Causalidad: antes de que llegue el frente no hay onda
    expect(campoAnalitico([{ p: [0, 0], frecuencia: 1, amplitud: 1, inicio: 0 }], 5, 0, 4, 1)).toBe(0);
  });

  it('crestas: separadas λ, dentro del frente y en fase máxima', () => {
    const f = { p: [0, 0], frecuencia: 2, amplitud: 1, fase: 0, inicio: 0 }, v = 3, t = 2.3;
    const r = crestas(f, t, v, 100);
    expect(r.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < r.length; i++) expect(r[i - 1] - r[i]).toBeCloseTo(1.5, 10);
    expect(Math.max(...r)).toBeLessThanOrEqual(v * t);
    for (const q of r.slice(0, 4)) expect(campoFuente(f, q, 0, t, v)).toBeCloseTo(Math.sqrt(1.5 / q), 10);
  });

  it('diferencia de caminos e hipérbolas: |r₁ − r₂| = (m + ½)λ en las nodales y mλ en las antinodales', () => {
    const s1 = [-1.5, 0], s2 = [1.5, 0], lam = 1;
    const L = lineasInterferencia(s1, s2, lam, { caja: { x0: -6, x1: 6, y0: -6, y1: 6 } });
    const nod = L.filter(l => l.tipo === 'nodal'), ant = L.filter(l => l.tipo === 'antinodal');
    expect(nod.map(l => l.delta).sort((a, b) => a - b)).toEqual([-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]);
    expect(ant.map(l => l.delta).sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
    for (const l of L) for (const p of l.puntos.filter((_, i) => i % 20 === 0)) expect(diferenciaCaminos(p, s1, s2)).toBeCloseTo(l.delta, 9);
    // Con las fuentes en oposición, las nodales y las antinodales se intercambian
    const op = lineasInterferencia(s1, s2, lam, { desfase: Math.PI, caja: { x0: -6, x1: 6, y0: -6, y1: 6 } });
    expect(op.find(l => Math.abs(l.delta) < 1e-12).tipo).toBe('nodal');
    // En una nodal el campo analítico casi se anula; en una antinodal se suman
    const fu = [{ p: s1, frecuencia: 1, amplitud: 1 }, { p: s2, frecuencia: 1, amplitud: 1 }];
    const pn = nod.find(l => l.delta === 0.5).puntos[110], pa = ant.find(l => l.delta === 1).puntos[110];
    const a1 = p => Math.sqrt(lam / Math.hypot(p[0] - s1[0], p[1] - s1[1])), a2 = p => Math.sqrt(lam / Math.hypot(p[0] - s2[0], p[1] - s2[1]));
    expect(fasorAnalitico(fu, pn[0], pn[1], 1).amplitud).toBeCloseTo(Math.abs(a1(pn) - a2(pn)), 10);
    expect(fasorAnalitico(fu, pa[0], pa[1], 1).amplitud).toBeCloseTo(a1(pa) + a2(pa), 10);
  });

  it('señales, arreglos, zonas y rendijas', () => {
    // Senoidal con arranque suave de un periodo; ondícula de media nula
    expect(senalFuente({ frecuencia: 2, inicio: 0 }, -0.1)).toBe(0);
    expect(senalFuente({ frecuencia: 2, inicio: 0 }, 0.6)).toBeCloseTo(Math.sin(2 * Math.PI * 2 * 0.6), 12);
    let suma = 0; for (let t = 0; t < 4; t += 1e-3) suma += senalFuente({ forma: 'ondicula', frecuencia: 2 }, t) * 1e-3;
    expect(Math.abs(suma)).toBeLessThan(1e-6);
    const arr = arregloFuentes({ centro: [0, 0], n: 5, separacion: 0.2, desfase: 0.3, amplitud: 1, frecuencia: 1 });
    expect(arr.map(f => f.p[1])).toEqual([-0.4, -0.2, 0, 0.2, 0.4].map(y => expect.closeTo(y, 12)));
    expect(arr[4].fase).toBeCloseTo(1.2, 12);
    const esc = { rapidez: 2, zonas: [{ forma: 'rect', x0: 0, x1: 1, y0: 0, y1: 10, rapidez: 1, rapidez1: 3 }, { forma: 'poligono', puntos: [[5, 5], [6, 5], [5, 6]], rapidez: 0.5 }] };
    expect(rapidezEn(esc, -1, 1)).toBe(2);
    expect(rapidezEn(esc, 0.5, 5)).toBeCloseTo(2, 12);           // gradiente lineal en y
    expect(rapidezEn(esc, 5.2, 5.2)).toBe(0.5);
    expect(dentroPoligono(5.9, 5.9, esc.zonas[1].puntos)).toBe(false);
    const segs = segmentosRendija({ centro: [0, 0], ancho: 0.2, separacion: 1, n: 2, largo: 4 }, 10);
    expect(segs.length).toBe(3);
    expect(segs.map(s => [s.a[1], s.b[1]])).toEqual([[-2, -0.6], [-0.4, 0.4], [0.6, 2]].map(p => p.map(y => expect.closeTo(y, 12))));
  });
});

describe('malla: condición CFL y validación', () => {
  const base = { caja: { x0: 0, x1: 2, y0: 0, y1: 2 }, rapidez: 1, fuentes: [{ p: [1, 1], frecuencia: 1, amplitud: 1 }], h: 0.1 };
  it('el paso cumple v·Δt/h ≤ 1/√2; un paso mayor o un Courant mayor se rechazan', () => {
    const c = new Cubeta(base);
    expect(c.courant).toBeCloseTo(0.6, 12);
    expect(c.dtMax).toBeCloseTo(0.1 / Math.SQRT2, 12);
    expect(() => new Cubeta({ ...base, dt: 0.08 })).toThrow(/CFL/);
    expect(() => new Cubeta({ ...base, courant: 0.72 })).toThrow(/CFL/);
    expect(new Cubeta({ ...base, courant: COURANT_MAX }).courant).toBeCloseTo(COURANT_MAX, 12);
    // Con zonas manda la rapidez máxima
    const z = new Cubeta({ ...base, zonas: [{ forma: 'rect', x0: 0, x1: 1, y0: 0, y1: 2, rapidez: 3 }] });
    expect(z.vMax).toBe(3);
    expect(z.dt).toBeCloseTo(0.6 * 0.1 / 3, 12);
  });
  it('en el límite CFL la solución queda acotada; sin el límite (malla gruesa) también, porque Δt se ajusta', () => {
    const c = new Cubeta({ ...base, courant: COURANT_MAX, fuentes: [{ p: [1, 1], forma: 'ondicula', frecuencia: 1, amplitud: 1 }] });
    c.avanzar(400);
    let m = 0; for (const v of c.u) m = Math.max(m, Math.abs(v));
    expect(m).toBeLessThan(10);
  });
  it('escenas inválidas lanzan; una resolución excesiva no aborta: agranda h y lo avisa', () => {
    expect(() => new Cubeta({ ...base, caja: { x0: 0, x1: 0, y0: 0, y1: 1 } })).toThrow();
    expect(() => new Cubeta({ ...base, rapidez: -1 })).toThrow();
    expect(() => new Cubeta({ ...base, fuentes: [{ p: [1, 1], frecuencia: 0, amplitud: 1 }] })).toThrow();
    expect(() => new Cubeta({ ...base, bordes: { izq: 'pegajoso' } })).toThrow();
    const c = new Cubeta({ ...base, h: 0.001, maxNodos: 20000 });
    expect(c.nodos).toBeLessThanOrEqual(20000);
    expect(c.aviso.motivo).toBe('resolucion');
    c.avanzar(3);
    expect(c.t).toBeGreaterThan(0);
  });
});

describe('rapidez, longitud de onda y amplitud', () => {
  it('un frente circular viaja a la rapidez v del medio (llegada a dos distancias, error < 1 %)', () => {
    for (const v of [1, 2.5]) {
      const lam = v / 1;
      const c = new Cubeta({ caja: { x0: -1 * lam, x1: 6.5 * lam, y0: -1.5 * lam, y1: 1.5 * lam }, rapidez: v, fuentes: [{ p: [0, 0], forma: 'ondicula', frecuencia: 1, amplitud: 1 }], h: lam / 24, sondas: [[2 * lam, 0], [5 * lam, 0], [3 * lam * Math.SQRT1_2, 3 * lam * Math.SQRT1_2]] });
      c.avanzarHasta(7.5);
      const t1 = pico(c.serie(0)).t, t2 = pico(c.serie(1)).t, t3 = pico(c.serie(2)).t;
      expect(rel(3 * lam / (t2 - t1), v)).toBeLessThan(0.01);
      // También en diagonal: misma rapidez en todas las direcciones
      expect(rel(lam / (t3 - t1), v)).toBeLessThan(0.015);
    }
  });

  it('fuente senoidal: λ = v/f medida con la fase a lo largo de un radio, f igual a la de la fuente y amplitud A·√(λ/r)', () => {
    const v = 2, f = 1.6, lam = v / f;
    const radios = [1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4].map(r => r * lam);
    const c = new Cubeta({ caja: { x0: -lam, x1: 5 * lam, y0: -2 * lam, y1: 2 * lam }, rapidez: v, fuentes: [{ p: [0, 0], frecuencia: f, amplitud: 0.01 }], h: lam / 16, sondas: radios.map(r => [r, 0]) });
    c.avanzarHasta(14 / f);
    const F = amplitudes(c, f, 11 / f, 14 / f);
    // Fase φ(r) = φ₀ − kr: pendiente por mínimos cuadrados
    const fases = [F[0].fase]; for (let i = 1; i < F.length; i++) { let d = F[i].fase - fases[i - 1]; d = Math.atan2(Math.sin(d), Math.cos(d)); fases.push(fases[i - 1] + d); }
    const mx = radios.reduce((s, r) => s + r, 0) / radios.length, my = fases.reduce((s, p) => s + p, 0) / fases.length;
    const k = -radios.reduce((s, r, i) => s + (r - mx) * (fases[i] - my), 0) / radios.reduce((s, r) => s + (r - mx) ** 2, 0);
    expect(rel(2 * Math.PI / k, lam)).toBeLessThan(0.01);
    // Amplitud: la de la función de Green exacta, que tiende a A·√(λ/r)
    for (let i = 0; i < radios.length; i++) {
      const ex = fasorAnalitico([{ p: [0, 0], frecuencia: f, amplitud: 0.01 }], radios[i], 0, v, { exacta: true }).amplitud;
      expect(rel(F[i].amplitud, ex)).toBeLessThan(0.03);
      expect(rel(ex, 0.01 * Math.sqrt(lam / radios[i]))).toBeLessThan(0.015);
    }
    // Frecuencia en la última sonda: la de la fuente
    const s = c.serie(10);
    expect(rel(frecuenciaMedida(s.t, s.y, f, 8 / f, 14 / f), f)).toBeLessThan(2e-3);
  });

  it('la malla coincide con la función de Green exacta en amplitud y fase (régimen, lejos de la fuente)', () => {
    const f = 1, v = 1, src = { p: [0, 0], frecuencia: f, amplitud: 1 };
    const pts = [[1, 0], [2, 0], [2, 2], [0, 3], [-1.5, 1.5]];
    const c = new Cubeta({ caja: { x0: -3, x1: 4, y0: -2, y1: 4 }, rapidez: v, fuentes: [src], h: 1 / 20, sondas: pts });
    c.avanzarHasta(13);
    const F = amplitudes(c, f, 10, 13);
    pts.forEach((p, i) => {
      const ex = fasorAnalitico([src], p[0], p[1], v, { exacta: true });
      expect(rel(F[i].amplitud, ex.amplitud)).toBeLessThan(0.03);
      expect(Math.abs(Math.atan2(Math.sin(F[i].fase - ex.fase), Math.cos(F[i].fase - ex.fase)))).toBeLessThan(0.08);
    });
  });

  it('fuente lineal: onda plana de amplitud A con λ = v/f; con desvío θ sale inclinada θ', () => {
    const v = 1, f = 1;
    for (const th of [0, 25 * GRADO]) {
      const pts = parche(1, -0.75, 6, 0.25);
      const c = new Cubeta({ caja: { x0: -1, x1: 3, y0: -3, y1: 3 }, rapidez: v, lineas: [{ a: [-0.5, -8], b: [-0.5, 8], amplitud: 0.02, frecuencia: f, desvio: th }], h: 1 / 16, sondas: pts });
      c.avanzarHasta(12);
      const F = amplitudes(c, f, 9, 12), K = numeroOnda(F, 6, 0.25);
      expect(rel(K.lambda, 1)).toBeLessThan(0.02);
      expect(Math.abs(K.angulo - th)).toBeLessThan(1.5 * GRADO);
      const am = F.reduce((s, x) => s + x.amplitud, 0) / F.length;
      expect(rel(am, 0.02)).toBeLessThan(0.05);
    }
  });
});

describe('interferencia de dos fuentes', () => {
  // Fuentes en (±1.5λ, 0), línea de detección y = 4λ: Δ(x) crece de 0 a casi 3λ
  const v = 1, f = 1, lam = 1, s1 = [-1.5, 0], s2 = [1.5, 0], Y = 4;
  const delta = x => Math.abs(diferenciaCaminos([x, Y], s1, s2));
  const xDe = d => raiz(x => delta(x) - d, 0, 40);
  const xs = []; for (let x = 0; x <= 7; x += 0.05) xs.push(x);
  const fu = [{ p: s1, frecuencia: f, amplitud: 1 }, { p: s2, frecuencia: f, amplitud: 1 }];

  // Lo que se compara es Δ en el extremo medido: lejos, Δ cambia poco con x
  it('modelo analítico: mínimos de amplitud en |r₁ − r₂| = (m + ½)λ y máximos en mλ', () => {
    const am = xs.map(x => fasorAnalitico(fu, x, Y, v, { exacta: true }).amplitud);
    const minimos = [], maximos = [];
    for (let k = 1; k < xs.length - 1; k++) {
      if (am[k] < am[k - 1] && am[k] <= am[k + 1]) minimos.push(extremoLocal(xs, am, k));
      if (am[k] > am[k - 1] && am[k] >= am[k + 1]) maximos.push(extremoLocal(xs, am, k));
    }
    // Δ va de 0 a 2.6λ en 0 ≤ x ≤ 7: tres nodales (½λ, 1½λ, 2½λ) y dos antinodales (λ, 2λ) además de O
    expect(minimos.length).toBe(3);
    minimos.forEach((x, m) => expect(Math.abs(delta(x) - (m + 0.5) * lam)).toBeLessThan(0.01 * lam));
    // Los máximos se corren un poco porque las dos amplitudes (1/√r) cambian a lo largo de la recta
    maximos.forEach((x, m) => expect(Math.abs(delta(x) - (m + 1) * lam)).toBeLessThan(0.03 * lam));
  });

  it('malla: los mínimos y máximos medidos están en las mismas posiciones (error en Δ < 0.02 λ)', () => {
    const c = new Cubeta({ caja: { x0: -3, x1: 7.5, y0: -2, y1: 5.5 }, rapidez: v, fuentes: fu, h: lam / 16, sondas: xs.map(x => [x, Y]) });
    c.avanzarHasta(14);
    const am = amplitudes(c, f, 11, 14).map(F => F.amplitud);
    const minimos = [], maximos = [];
    for (let k = 1; k < xs.length - 1; k++) {
      if (am[k] < am[k - 1] && am[k] <= am[k + 1]) minimos.push(extremoLocal(xs, am, k));
      if (am[k] > am[k - 1] && am[k] >= am[k + 1]) maximos.push(extremoLocal(xs, am, k));
    }
    expect(minimos.length).toBe(3);
    minimos.forEach((x, m) => expect(Math.abs(delta(x) - (m + 0.5) * lam)).toBeLessThan(0.02 * lam));
    maximos.forEach((x, m) => expect(Math.abs(delta(x) - (m + 1) * lam)).toBeLessThan(0.03 * lam));
    // En O (Δ = 0) la amplitud es la suma de las dos; en el primer mínimo, la diferencia
    const k0 = 0, k1 = Math.round(xDe(0.5) / 0.05);
    expect(am[k0]).toBeGreaterThan(5 * am[k1]);
  });

  it('fuentes en oposición: en la mediatriz hay un mínimo', () => {
    const op = [fu[0], { ...fu[1], fase: Math.PI }];
    const c = new Cubeta({ caja: { x0: -3, x1: 3, y0: -2, y1: 5.5 }, rapidez: v, fuentes: op, h: lam / 14, sondas: [[0, Y], [xDe(0.5), Y]] });
    c.avanzarHasta(12);
    const [a0, a1] = amplitudes(c, f, 9, 12).map(F => F.amplitud);
    expect(a0).toBeLessThan(0.05 * a1);
  });
});

describe('refracción', () => {
  it('ley de Snell en la frontera: sen θ₁/sen θ₂ = v₁/v₂, λ₂ = v₂/f y la frecuencia no cambia', () => {
    const v1 = 1.5, v2 = 1, f = 1, th1 = 30 * GRADO;
    const p2 = parche(1, 1, 7, 0.25);
    const c = new Cubeta({ caja: { x0: -5, x1: 4, y0: -5, y1: 6 }, rapidez: v1, zonas: [{ forma: 'rect', x0: 0, x1: 100, y0: -100, y1: 100, rapidez: v2 }],
      lineas: [{ a: [-4.5, -7], b: [-4.5, 3], amplitud: 0.01, frecuencia: f, desvio: th1 }], h: 1 / 14, sondas: p2 });
    c.avanzarHasta(15);
    const F = amplitudes(c, f, 12, 15), K = numeroOnda(F, 7, 0.25);
    expect(rel(Math.sin(th1) / Math.sin(K.angulo), v1 / v2)).toBeLessThan(0.03);
    expect(rel(K.lambda, v2 / f)).toBeLessThan(0.02);
    // Frecuencia en la zona lenta = frecuencia de la fuente
    const s = c.serie(24);
    expect(rel(frecuenciaMedida(s.t, s.y, f, 9, 15), f)).toBeLessThan(2e-3);
  });

  it('zonas con gradiente: la rapidez de cada nodo sigue la ley lineal', () => {
    const c = new Cubeta({ caja: { x0: 0, x1: 4, y0: 0, y1: 4 }, rapidez: 1, zonas: [{ forma: 'rect', x0: -10, x1: 10, y0: 0, y1: 4, rapidez: 1, rapidez1: 2 }], fuentes: [{ p: [2, 2], frecuencia: 1, amplitud: 1 }], h: 0.1 });
    for (const y of [0.5, 2, 3.5]) expect(c.rapidezNodo(2, y)).toBeCloseTo(1 + y / 4, 2);
  });
});

describe('reflexión en una barrera', () => {
  it('el pulso reflejado llega como desde la fuente imagen, sin invertirse', () => {
    // Reflejado = (con barrera) − (sin barrera): el directo es el mismo en los dos
    const v = 1, S = [0, 2], P = [[3, 2], [0, 4], [2.5, 4]];
    const esc = { caja: { x0: -3, x1: 5, y0: -0.5, y1: 5 }, rapidez: v, fuentes: [{ p: S, forma: 'ondicula', frecuencia: 1, amplitud: 1 }], h: 1 / 24, sondas: P, capa: 2 };
    const c = new Cubeta({ ...esc, barreras: [{ a: [-20, -0.25], b: [20, -0.25], grosor: 0.5 }] }), libre = new Cubeta(esc);
    c.avanzarHasta(8); libre.avanzarHasta(8);
    // Superficie efectiva de la pared: a medio paso por encima del último nodo sólido
    let yw = 0; while (c.esSolido(0, yw + c.h)) yw += c.h;
    yw += c.h / 2;
    P.forEach((p, i) => {
      const s = c.serie(i), s0 = libre.serie(i), refl = { t: s.t, y: s.y.map((y, k) => y - s0.y[k]) };
      const rd = Math.hypot(p[0] - S[0], p[1] - S[1]), rr = Math.hypot(p[0] - S[0], p[1] - (2 * yw - S[1]));
      const d = pico(s0), r = pico(refl);
      expect(rel(r.t - d.t, (rr - rd) / v)).toBeLessThan(0.025);
      // Pared rígida: el reflejado tiene el mismo signo que el directo, y amplitud según 1/√r
      expect(r.y).toBeGreaterThan(0);
      expect(rel(r.y / d.y, Math.sqrt(rd / rr))).toBeLessThan(0.1);
    });
  });

  it('una barrera larga hace sombra: detrás, la onda es mucho menor que delante', () => {
    const c = new Cubeta({ caja: { x0: -3, x1: 3, y0: -3, y1: 3 }, rapidez: 1, fuentes: [{ p: [0, 1.5], frecuencia: 1, amplitud: 1 }], barreras: [{ a: [-10, 0], b: [10, 0], grosor: 0.15 }], h: 1 / 14, sondas: [[0, 0.8], [0, -1.5]] });
    c.avanzarHasta(10);
    const [del, det] = amplitudes(c, 1, 7, 10).map(F => F.amplitud);
    expect(det).toBeLessThan(1e-3 * del);
  });
});

describe('difracción por una rendija', () => {
  // Onda plana contra una pared vertical con una abertura de ancho a; amplitud en un arco de radio 8λ
  function anguloMitad(a) {
    const R = 8, angs = []; for (let g = 0; g <= 70; g += 5) angs.push(g);
    const pts = angs.map(g => [R * Math.cos(g * GRADO), R * Math.sin(g * GRADO)]);
    const c = new Cubeta({ caja: { x0: -2, x1: 8.5, y0: -8.5, y1: 8.5 }, rapidez: 1, lineas: [{ a: [-1.5, -12], b: [-1.5, 12], amplitud: 1, frecuencia: 1 }], rendijas: [{ centro: [0, 0], ancho: a }], h: 1 / 12, sondas: pts });
    c.avanzarHasta(18);
    const A = amplitudes(c, 1, 15, 18).map(F => F.amplitud);
    for (let i = 1; i < A.length; i++) if (A[i] < 0.5 * A[0]) return angs[i - 1] + (A[i - 1] - 0.5 * A[0]) / (A[i - 1] - A[i]) * 5;
    return 90;
  }
  it('una abertura comparable a λ abre mucho más la onda que una de 4λ', () => {
    const angosta = anguloMitad(1), ancha = anguloMitad(4);
    expect(angosta).toBeGreaterThan(35);
    expect(ancha).toBeLessThan(20);
    expect(angosta).toBeGreaterThan(2.5 * ancha);
  });
});

describe('bordes', () => {
  it('absorbentes: lo que vuelve de los bordes es menos del 3 % de la onda directa', () => {
    const src = { p: [0, 0], frecuencia: 1, amplitud: 1 }, sondas = [[3, 0], [2.5, 2.5], [0, 3.5], [-3, -3]];
    const a = new Cubeta({ caja: { x0: -4, x1: 4, y0: -4, y1: 4 }, rapidez: 1, fuentes: [src], h: 1 / 14, sondas });
    const b = new Cubeta({ caja: { x0: -14, x1: 14, y0: -14, y1: 14 }, rapidez: 1, fuentes: [src], h: 1 / 14, sondas, capa: 1 });
    a.avanzarHasta(14); b.avanzarHasta(14);
    for (let i = 0; i < sondas.length; i++) {
      const A = a.serie(i), B = b.serie(i), dif = A.y.map((y, k) => y - B.y[k]);
      expect(fasor(A.t, dif, 1, 11, 14).amplitud / fasor(B.t, B.y, 1, 11, 14).amplitud).toBeLessThan(0.03);
    }
  });
  it('un pulso sale por los bordes absorbentes; con bordes reflectantes la energía se queda', () => {
    const esc = { caja: { x0: -3, x1: 3, y0: -3, y1: 3 }, rapidez: 1, fuentes: [{ p: [0.3, -0.2], forma: 'ondicula', frecuencia: 1, amplitud: 1 }], h: 1 / 12 };
    const a = new Cubeta(esc), r = new Cubeta({ ...esc, bordes: { izq: 'reflectante', der: 'reflectante', abajo: 'reflectante', arriba: 'reflectante' } });
    a.avanzarHasta(3.5); r.avanzarHasta(3.5);
    const Ea = a.energia(true), Er = r.energia(true);
    a.avanzarHasta(16); r.avanzarHasta(16);
    expect(a.energia(true)).toBeLessThan(1e-3 * Ea);
    expect(rel(r.energia(true), Er)).toBeLessThan(0.02);
  });
});

describe('película', () => {
  it('guarda cuadros de la región visible: el último coincide con la malla, y u(t) con la sonda', () => {
    const esc = { caja: { x0: -2, x1: 2, y0: -2, y1: 2 }, rapidez: 1, fuentes: [{ p: [0, 0], frecuencia: 1, amplitud: 0.1 }], h: 1 / 10, sondas: [[1.05, 0.3]] };
    const c = crearCubeta(esc, { pelicula: { intervalo: 0.05, escala: 1 } });
    c.avanzarHasta(4);
    const P = c.pelicula, V = c.ventana, campo = new Float64Array(V.nx * V.ny);
    expect(P.ultimo).toBeCloseTo(c.t, 12);
    P.campo(c.t, campo);
    const vivo = c.copiarVentana(new Float64Array(V.nx * V.ny));
    let m = 0; for (let i = 0; i < campo.length; i++) m = Math.max(m, Math.abs(campo[i] - vivo[i]));
    expect(m).toBeLessThanOrEqual(1 / 32767);
    const s = P.serie(1.05, 0.3), sonda = c.serie(0);
    for (let q = 10; q < s.t.length; q += 7) {
      const k = Math.round(s.t[q] / c.dt);
      expect(s.y[q]).toBeCloseTo(sonda.y[k], 3);
    }
    // Amplitud de régimen en la pantalla de la película ≈ ajuste de la sonda
    const am = P.amplitudes([[1.05, 0.3]], 4, 1)[0], F = fasor(sonda.t, sonda.y, 1, 3, 4);
    expect(rel(am, F.amplitud)).toBeLessThan(0.03);
  });
  it('al llenarse se queda con uno de cada dos cuadros y sigue cubriendo todo', () => {
    const c = crearCubeta({ caja: { x0: -1, x1: 1, y0: -1, y1: 1 }, rapidez: 1, fuentes: [{ p: [0, 0], frecuencia: 1, amplitud: 0.1 }], h: 1 / 10 }, { pelicula: { intervalo: 0.01, escala: 1, maxBytes: 1 } });
    c.avanzarHasta(3);
    const P = c.pelicula;
    expect(P.cuenta).toBeLessThanOrEqual(P.max + 1);
    expect(P.tiempo(0)).toBe(0);
    expect(P.ultimo).toBeGreaterThan(3 - P.K * c.dt - 1e-9);
  });
});

describe('determinismo', () => {
  it('la misma escena da exactamente el mismo resultado', () => {
    const esc = { caja: { x0: -2, x1: 3, y0: -2, y1: 2 }, rapidez: 1, fuentes: [{ p: [0, 0.5], frecuencia: 1, amplitud: 1 }, { p: [0, -0.5], frecuencia: 1, amplitud: 1, fase: 1 }],
      rendijas: [{ centro: [1, 0], ancho: 0.4, n: 2, separacion: 1 }], zonas: [{ forma: 'poligono', puntos: [[2, -2], [3, -2], [3, 2]], rapidez: 0.6 }], h: 1 / 10, sondas: [[2.5, 0]] };
    const a = new Cubeta(esc), b = new Cubeta(esc);
    a.avanzar(300); b.avanzar(300);
    expect(a.u).toEqual(b.u);
    expect(a.serie(0).y).toEqual(b.serie(0).y);
  });
});

describe('MEXT: interferencia (W4)', () => {
  // 2017 P5: altavoces en fase en A y B (6 m), recta PQ paralela a 8 m; O equidistante;
  // primer mínimo en x = 3 m; v = 3.4 × 10² m/s
  const A = [-3, 0], B = [3, 0], Y = 8, xs = []; for (let x = 0; x <= 8; x += 0.05) xs.push(x);
  const primerMinimo = (am) => { for (let k = 1; k < xs.length - 1; k++) if (am[k] < am[k - 1] && am[k] <= am[k + 1]) return extremoLocal(xs, am, k); return NaN; };
  const fuentes = f => [{ p: A, frecuencia: f, amplitud: 1 }, { p: B, frecuencia: f, amplitud: 1 }];

  it('2017 P5 (1)–(2): Δ = |PA| − |PB| = 2 m en x = 3 m es λ/2 → λ = 4 m (b) y f = v/λ = 85 Hz (b)', () => {
    const d = diferenciaCaminos([3, Y], A, B);
    expect(d).toBeCloseTo(2, 12);
    const lam = 2 * d, f = 340 / lam;
    expect(lam).toBe(4);
    expect(f).toBeCloseTo(85, 10);
    // El modelo analítico pone el primer mínimo en x = 3 m
    const am = xs.map(x => fasorAnalitico(fuentes(f), x, Y, 340, { exacta: true }).amplitud);
    expect(Math.abs(primerMinimo(am) - 3)).toBeLessThan(0.01);
    expect(am[0]).toBeGreaterThan(10 * Math.min(...am.slice(0, 80)));
  });

  it('2017 P5 (1)–(2): en la malla, el primer mínimo a lo largo de PQ también está en x ≈ 3 m', () => {
    const c = new Cubeta({ caja: { x0: -7, x1: 11, y0: -3, y1: 11 }, rapidez: 340, fuentes: fuentes(85), puntosPorLambda: 16, sondas: xs.map(x => [x, Y]) });
    c.avanzarHasta(14 / 85);
    const am = amplitudes(c, 85, 10 / 85, 14 / 85).map(F => F.amplitud);
    expect(Math.abs(primerMinimo(am) - 3)).toBeLessThan(0.1);
  });

  it('2017 P5 (3): al subir f, en x = 3 m el sonido crece, pasa por un máximo y vuelve a un mínimo en f = 3v/2Δ = 255 Hz ≈ 2.6 × 10² Hz (e)', () => {
    // Factor de interferencia |u₁ + u₂|/(|u₁| + |u₂|): 1 donde se suman, mínimo donde se restan
    const fs = [], am = [];
    for (let f = 85; f <= 300; f += 0.5) {
      const [fa, fb] = fuentes(f), uno = fasorAnalitico([fa], 3, Y, 340).amplitud, otro = fasorAnalitico([fb], 3, Y, 340).amplitud;
      fs.push(f); am.push(fasorAnalitico([fa, fb], 3, Y, 340).amplitud / (uno + otro));
    }
    let kMax = 0; for (let k = 1; k < fs.length; k++) if (am[k] > am[kMax]) kMax = k;
    expect(fs[kMax]).toBeCloseTo(170, 6);                         // Δ = λ: máximo
    expect(am[kMax]).toBeCloseTo(1, 10);
    let kMin = kMax; for (let k = kMax + 1; k < fs.length - 1; k++) if (am[k] < am[k - 1] && am[k] <= am[k + 1]) { kMin = k; break; }
    expect(fs[kMin]).toBeCloseTo(255, 6);                         // Δ = 3λ/2
    const opciones = { a: 43, b: 85, c: 110, d: 170, e: 260, f: 340, g: 680, h: 1000, i: 1400 };
    const mas = Object.entries(opciones).reduce((m, [k, v]) => (Math.abs(v - 255) < Math.abs(opciones[m] - 255) ? k : m), 'a');
    expect(mas).toBe('e');
  });

  it('2017 P5 (4): si sube la temperatura, sube v y el mínimo se aleja: x aumenta (a)', () => {
    const v1 = velocidadSonido(293.15), v2 = velocidadSonido(313.15), f = 85;
    expect(v2).toBeGreaterThan(v1);
    const x1 = primerMinimo(xs.map(x => fasorAnalitico(fuentes(f), x, Y, v1).amplitud));
    const x2 = primerMinimo(xs.map(x => fasorAnalitico(fuentes(f), x, Y, v2).amplitud));
    expect(x2).toBeGreaterThan(x1 + 0.05);
  });

  it('2007 1-(4): S₁S₂ = 12 cm, S₂A = 16 cm ⟂, λ = 8 cm → Δ = 20 − 16 = 4 cm = λ/2: interferencia destructiva (b)', () => {
    const S1 = [0, 0], S2 = [0.12, 0], P = [0.12, 0.16], lam = 0.08, v = 0.4, f = v / lam;
    expect(diferenciaCaminos(P, S1, S2) / lam).toBeCloseTo(0.5, 12);
    const fu = [{ p: S1, frecuencia: f, amplitud: 1 }, { p: S2, frecuencia: f, amplitud: 1 }];
    const solo1 = fasorAnalitico([fu[0]], P[0], P[1], v).amplitud, solo2 = fasorAnalitico([fu[1]], P[0], P[1], v).amplitud;
    const juntas = fasorAnalitico(fu, P[0], P[1], v).amplitud;
    expect(juntas).toBeCloseTo(Math.abs(solo1 - solo2), 10);
    // En la malla: en A casi se anulan, frente a un punto vecino donde se suman
    const c = new Cubeta({ caja: { x0: -0.1, x1: 0.25, y0: -0.1, y1: 0.25 }, rapidez: v, fuentes: fu, puntosPorLambda: 16, sondas: [P, [0.08, 0.16]] });
    c.avanzarHasta(14 / f);
    const [aA, aV] = amplitudes(c, f, 10 / f, 14 / f).map(F => F.amplitud);
    expect(aA).toBeLessThan(0.12 * (solo1 + solo2));
    expect(aV).toBeGreaterThan(8 * aA);
  });
});

describe('MEXT: refracción de ondas (W5)', () => {
  it('2010 3-A: sobre el vidrio (agua somera) la onda es más lenta: λ menor, misma f y frentes que giran hacia la orilla (b)', () => {
    const vd = velocidadAguasSomeras(0.02), vs = velocidadAguasSomeras(0.008), f = 8;
    expect(vs).toBeLessThan(vd);
    // Borde del vidrio inclinado 30° respecto de los frentes que llegan
    const m = Math.tan(30 * GRADO), y0 = -0.02, poly = [[-1, y0 - m], [1, y0 + m], [1, -1], [-1, -1]];
    const pd = parche(-0.12, 0.06, 6, 0.01), ps = parche(0.04, -0.12, 6, 0.01);
    const c = new Cubeta({ caja: { x0: -0.2, x1: 0.2, y0: -0.15, y1: 0.15 }, rapidez: vd, zonas: [{ forma: 'poligono', puntos: poly, rapidez: vs }],
      lineas: [{ a: [-0.35, 0.14], b: [0.35, 0.14], amplitud: 0.001, frecuencia: f }], puntosPorLambda: 14, sondas: [...pd, ...ps] });
    c.avanzarHasta(3);
    const F = amplitudes(c, f, 3 - 6 / f, 3), Kd = numeroOnda(F.slice(0, 36), 6, 0.01), Ks = numeroOnda(F.slice(36), 6, 0.01);
    expect(rel(Kd.lambda, vd / f)).toBeLessThan(0.02);
    expect(rel(Ks.lambda, vs / f)).toBeLessThan(0.02);
    expect(rel(Ks.lambda / Kd.lambda, vs / vd)).toBeLessThan(0.03);
    // Ángulos con la normal a la orilla (dirección −60°): 30° en lo profundo, menor en lo somero (Snell)
    const normal = -60 * GRADO, th1 = Math.abs(Kd.angulo - normal), th2 = Math.abs(Ks.angulo - normal);
    expect(th1).toBeCloseTo(30 * GRADO, 1);
    expect(th2).toBeLessThan(th1);
    expect(rel(Math.sin(th1) / Math.sin(th2), vd / vs)).toBeLessThan(0.04);
    // La frecuencia es la misma en las dos zonas
    const fr = i => { const s = c.serie(i); return frecuenciaMedida(s.t, s.y, f, 1.5, 3); };
    expect(rel(fr(14), f)).toBeLessThan(2e-3);
    expect(rel(fr(50), f)).toBeLessThan(2e-3);
  });

  it('2010 3-B: con el aire de arriba más caliente (t_h > t_g, v_h > v_g) el sonido se curva hacia el suelo y llega más fuerte lejos (d)', () => {
    // Gradiente exagerado para que la curvatura se vea en 120 m
    expect(velocidadSonido(283.15)).toBeGreaterThan(velocidadSonido(268.15));
    const f = 68, rec = [[80, 1], [100, 1]];
    const corrida = zona => {
      const c = new Cubeta({ caja: { x0: 0, x1: 120, y0: 0, y1: 40 }, rapidez: 340, zonas: zona ? [{ forma: 'rect', x0: -1e3, x1: 1e3, y0: 0, y1: 40, ...zona }] : [],
        bordes: { abajo: 'reflectante' }, fuentes: [{ p: [5, 2], frecuencia: f, amplitud: 1 }], puntosPorLambda: 10, sondas: rec });
      c.avanzarHasta(0.6);
      return amplitudes(c, f, 0.6 - 4 / f, 0.6).map(F => F.amplitud);
    };
    const noche = corrida({ rapidez: 340, rapidez1: 420 }), uniforme = corrida(null), dia = corrida({ rapidez: 340, rapidez1: 290 });
    for (let i = 0; i < rec.length; i++) {
      expect(noche[i]).toBeGreaterThan(1.5 * uniforme[i]);
      expect(uniforme[i]).toBeGreaterThan(1.5 * dia[i]);
    }
  });
});
