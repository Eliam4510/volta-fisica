// Exactitud física del motor de gravitación: Kepler, integradores
// simplécticos, conservación, eventos y las situaciones MEXT del módulo.
import { describe, it, expect } from 'vitest';
import {
  G, CUERPOS, velocidadCircular, velocidadEscape, periodoOrbital, semiejeDesdePeriodo, alturaSincrona,
  gravedadSuperficial, masaDesdeGravedad, escapeDesdeGravedad, cocienteEscape, elementosOrbitales,
  resolverKepler, resolverKeplerHiperbolica, estadoKepler, estadoKeplerUniversal, puntosConica,
  simularGravitacion, estadoEn, energiaSistema, momentoAngular, cuerposOrbita,
} from '../sistema/motores/gravitacion.js';

const TIERRA = CUERPOS.tierra, MU = TIERRA.mu, R = TIERRA.radio;
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

/**
 * Satélite (partícula de prueba) que parte del periapsis rp con excentricidad e
 * alrededor de un centro fijo de parámetro mu.
 */
function orbita({ rp, e = 0, mu = MU, orbitas = 1.05, pasos = 2000, integrador = 'yoshida4', radio = 0, ...extra }) {
  const a = rp / (1 - e), vp = Math.sqrt(mu * (1 + e) / rp), T = periodoOrbital(mu, a);
  const sim = simularGravitacion({
    cuerpos: [
      { nombre: 'Centro', mu, radio, fijo: true, x: 0, y: 0, vx: 0, vy: 0 },
      { nombre: 'Satélite', masa: 1, prueba: true, x: rp, y: 0, vx: 0, vy: vp },
    ],
    duracion: orbitas * T, dt: T / pasos, integrador, ...extra,
  });
  return { sim, T, a, vp, sat: sim.cuerpos[1] };
}
// Energía específica y momento angular específico de cada muestra del satélite
const energiaEsp = (c, k, mu = MU) => 0.5 * (c.vx[k] ** 2 + c.vy[k] ** 2) - mu / Math.hypot(c.x[k], c.y[k]);
const momentoEsp = (c, k) => c.x[k] * c.vy[k] - c.y[k] * c.vx[k];

describe('fórmulas de dos cuerpos', () => {
  it('v_e = √2 · v_c a cualquier distancia', () => {
    for (const r of [R, 2 * R, 42164e3]) expect(rel(velocidadEscape(MU, r), Math.SQRT2 * velocidadCircular(MU, r))).toBeLessThan(1e-15);
  });
  it('periodo y semieje son inversos', () => {
    for (const a of [7e6, 2.656e7, 3.844e8]) expect(rel(semiejeDesdePeriodo(MU, periodoOrbital(MU, a)), a)).toBeLessThan(1e-14);
  });
  it('la gravedad en la superficie de la Tierra es μ/R² ≈ 9.80 m/s²', () => {
    expect(gravedadSuperficial(MU, TIERRA.radioMedio)).toBeCloseTo(9.82, 2);
    expect(rel(TIERRA.masa * G, MU)).toBeLessThan(1e-15);
  });
});

describe('ecuación de Kepler (Newton)', () => {
  it('elíptica: E − e·sen E = M a precisión de máquina', () => {
    for (const e of [0, 0.1, 0.5, 0.9, 0.99, 0.999999]) {
      for (let M = -20; M <= 20; M += 0.37) {
        const E = resolverKepler(M, e);
        expect(Math.abs(E - e * Math.sin(E) - M)).toBeLessThan(1e-14 * Math.max(1, Math.abs(M)));
      }
    }
  });
  it('hiperbólica: e·senh F − F = M', () => {
    for (const e of [1.0001, 1.5, 5, 50]) {
      for (let M = -100; M <= 100; M += 3.7) {
        const F = resolverKeplerHiperbolica(M, e);
        expect(Math.abs(e * Math.sinh(F) - F - M)).toBeLessThan(1e-12 * Math.max(1, Math.abs(M)));
      }
    }
  });
  it('rechaza excentricidades fuera de rango', () => {
    expect(() => resolverKepler(1, 1)).toThrow(RangeError);
    expect(() => resolverKeplerHiperbolica(1, 0.5)).toThrow(RangeError);
  });
});

describe('solución de Kepler analítica', () => {
  const casos = [0, 0.3, 0.74, 0.995, 1, 1.5, 4];
  it('la ecuación de Kepler y las variables universales dan el mismo estado', () => {
    for (const e of casos) {
      const rp = R + 500e3, vp = Math.sqrt(MU * (1 + e) / rp);
      for (const t of [37, 1000, 5000, 20000, -3000]) {
        const a = estadoKepler(MU, [rp, 0], [0, vp], t), b = estadoKeplerUniversal(MU, [rp, 0], [0, vp], t);
        expect(Math.hypot(a.x - b.x, a.y - b.y) / Math.hypot(a.x, a.y)).toBeLessThan(1e-12);
        expect(Math.hypot(a.vx - b.vx, a.vy - b.vy) / Math.hypot(a.vx, a.vy)).toBeLessThan(1e-12);
      }
    }
  });
  it('conserva la energía específica y el momento angular', () => {
    for (const e of casos) {
      const p0 = [3e6, 6.5e6], v0 = [-7.1e3 * (1 + e) / 1.6, 1.9e3];
      const el0 = elementosOrbitales(MU, p0, v0);
      for (const t of [500, 4000, 9000]) {
        const s = estadoKepler(MU, p0, v0, t), el = elementosOrbitales(MU, [s.x, s.y], [s.vx, s.vy]);
        expect(Math.abs(el.energia - el0.energia)).toBeLessThan(1e-12 * MU / el0.r);
        expect(rel(el.h, el0.h)).toBeLessThan(1e-12);
      }
    }
  });
  it('tras un periodo vuelve exactamente al estado inicial', () => {
    const p0 = [-8e6, 2e6], v0 = [-1.5e3, -7.6e3], T = elementosOrbitales(MU, p0, v0).periodo;
    const s = estadoKepler(MU, p0, v0, 3 * T);
    expect(Math.hypot(s.x - p0[0], s.y - p0[1]) / Math.hypot(...p0)).toBeLessThan(1e-12);
    expect(Math.hypot(s.vx - v0[0], s.vy - v0[1]) / Math.hypot(...v0)).toBeLessThan(1e-12);
  });
  it('la órbita prevista es la cónica: elipse (d₁ + d₂ = 2a) e hipérbola (|d₁ − d₂| = 2|a|)', () => {
    for (const [p0, v0] of [[[7e6, 1e6], [-1e3, 8.4e3]], [[7e6, 0], [0, 10.3e3]], [[7e6, 0], [0, 12e3]]]) {
      const el = elementosOrbitales(MU, p0, v0), [ex, ey] = el.vectorE;
      const f2 = [-2 * el.a * ex, -2 * el.a * ey];        // segundo foco (el primero es el centro)
      for (const [x, y] of puntosConica(MU, p0, v0, { rMax: 6e7 })) {
        const d1 = Math.hypot(x, y), d2 = Math.hypot(x - f2[0], y - f2[1]);
        if (el.e < 1) expect(rel(d1 + d2, 2 * el.a)).toBeLessThan(1e-12);
        else expect(rel(Math.abs(d1 - d2), -2 * el.a)).toBeLessThan(1e-10);
        if (el.e >= 1) expect(d1).toBeLessThanOrEqual(6e7 * (1 + 1e-9));   // rMax solo limita las ramas abiertas
      }
    }
  });
  it('la parábola exacta se dibuja como parábola aunque el redondeo dé ε ≈ −10⁻⁹', () => {
    // MEXT 2018 P3: √(2gR) con g = 9.8 m/s² y R = 6400 km es justo la velocidad de escape
    const mu = 9.8 * 6.4e6 * 6.4e6, el = elementosOrbitales(mu, [6.4e6, 0], [0, 11200]);
    expect(el.tipo).toBe('parabólica');
    const pts = puntosConica(mu, [6.4e6, 0], [0, 11200], { rMax: 1e8 }), [ex, ey] = el.vectorE;
    expect(pts.length).toBeGreaterThan(100);
    for (const [x, y] of pts) {
      const r = Math.hypot(x, y), c = (x * ex + y * ey) / (el.e * r);
      expect(Math.abs(r * (1 + el.e * c) - el.p) / el.p).toBeLessThan(1e-9);
      expect(r).toBeLessThanOrEqual(1e8 * (1 + 1e-9));
    }
  });
  it('elementos de la órbita circular: e = 0, a = r, T = 2π√(r³/μ)', () => {
    const r = R + 400e3, el = elementosOrbitales(MU, [0, r], [-velocidadCircular(MU, r), 0]);
    expect(el.e).toBeLessThan(1e-15);
    expect(rel(el.a, r)).toBeLessThan(1e-15);
    expect(rel(el.periodo, 2 * Math.PI * Math.sqrt(r ** 3 / MU))).toBeLessThan(1e-15);
    expect(el.tipo).toBe('circular');
    expect(el.sentido).toBe(1);
  });
});

describe('órbita circular: periodo medido', () => {
  it('T = 2π√(r³/GM) con error relativo < 1e-9 (Yoshida)', () => {
    const r = R + 400e3, { sim, T } = orbita({ rp: r, pasos: 2000 });
    const vuelta = sim.eventos.find(e => e.tipo === 'vuelta');
    expect(vuelta).toBeDefined();
    expect(rel(vuelta.t, 2 * Math.PI * Math.sqrt(r ** 3 / MU))).toBeLessThan(1e-9);
    expect(rel(vuelta.t, T)).toBeLessThan(1e-9);
  });
  it('el radio y la rapidez se mantienen constantes', () => {
    const r = R + 400e3, { sim, vp, sat } = orbita({ rp: r, pasos: 2000 });
    for (let k = 0; k < sim.t.length; k++) {
      expect(rel(Math.hypot(sat.x[k], sat.y[k]), r)).toBeLessThan(1e-10);
      expect(rel(Math.hypot(sat.vx[k], sat.vy[k]), vp)).toBeLessThan(1e-10);
    }
  });
  it('una órbita circular no genera ápsides espurios', () => {
    const { sim } = orbita({ rp: R + 400e3, orbitas: 3.2, pasos: 500 });
    expect(sim.eventos.filter(e => e.tipo === 'periapsis' || e.tipo === 'apoapsis')).toEqual([]);
    expect(sim.eventos.filter(e => e.tipo === 'vuelta').map(e => e.n)).toEqual([1, 2, 3]);
  });
});

describe('conservación en 100 órbitas', () => {
  // Máximo de |ΔE/E| en las muestras de las vueltas [v0, v1)
  const deriva = ({ sim, T, sat }, v0, v1) => {
    const E0 = energiaEsp(sat, 0);
    let peor = 0;
    for (let k = 0; k < sim.t.length; k++) if (sim.t[k] >= v0 * T && sim.t[k] < v1 * T) peor = Math.max(peor, Math.abs(energiaEsp(sat, k) - E0) / Math.abs(E0));
    return peor;
  };
  const circular = orbita({ rp: R + 400e3, orbitas: 100.5, pasos: 1000 });
  const eliptica = orbita({ rp: R + 500e3, e: 0.5, orbitas: 100.5, pasos: 3000 });
  const verlet = orbita({ rp: R + 500e3, e: 0.5, orbitas: 100.5, pasos: 3000, integrador: 'verlet' });

  it('Yoshida: la energía no deriva (< 1e-8 relativo), circular y elíptica', () => {
    for (const o of [circular, eliptica]) {
      expect(deriva(o, 0, 101)).toBeLessThan(1e-8);
      // Acotada: el error de las últimas 10 vueltas no supera al de las primeras
      expect(deriva(o, 90, 100)).toBeLessThan(2 * deriva(o, 0, 10) + 1e-13);
    }
    expect(eliptica.sim.eventos.filter(e => e.tipo === 'vuelta').length).toBe(100);
  });
  it('Verlet: la energía oscila acotada, sin deriva secular', () => {
    expect(deriva(verlet, 0, 101)).toBeLessThan(1e-4);
    expect(deriva(verlet, 90, 100)).toBeLessThan(1.5 * deriva(verlet, 0, 10));
  });
  it('el momento angular se conserva a precisión de máquina (fuerza central)', () => {
    for (const { sim, sat } of [circular, eliptica, verlet]) {
      const L0 = momentoEsp(sat, 0);
      let peor = 0;
      for (let k = 0; k < sim.t.length; k++) peor = Math.max(peor, Math.abs(momentoEsp(sat, k) - L0) / Math.abs(L0));
      expect(peor).toBeLessThan(1e-12);
    }
  });
  it('dos cuerpos libres: se conservan L total y el momento lineal; el centro de masa va en línea recta', () => {
    const m1 = 5.972e24, m2 = 7.342e22, d = 3.844e8, vrel = Math.sqrt(G * (m1 + m2) / d) * 1.08;
    const cuerpos = [
      { nombre: 'Tierra', masa: m1, x: -d * m2 / (m1 + m2), y: 0, vx: 300, vy: -vrel * m2 / (m1 + m2) },
      { nombre: 'Luna', masa: m2, x: d * m1 / (m1 + m2), y: 0, vx: 300, vy: vrel * m1 / (m1 + m2) },
    ];
    const T = periodoOrbital(G * (m1 + m2), elementosOrbitales(G * (m1 + m2), [d, 0], [0, vrel]).a);
    const sim = simularGravitacion({ cuerpos, duracion: 3 * T, dt: T / 2000 });
    const st = k => sim.cuerpos.map(c => ({ x: c.x[k], y: c.y[k], vx: c.vx[k], vy: c.vy[k] }));
    const L0 = momentoAngular(sim.cuerpos, st(0)), E0 = energiaSistema(sim.cuerpos, st(0)).E;
    for (let k = 0; k < sim.t.length; k += 97) {
      const s = st(k);
      expect(Math.abs(momentoAngular(sim.cuerpos, s) - L0) / Math.abs(L0)).toBeLessThan(1e-12);
      expect(Math.abs(energiaSistema(sim.cuerpos, s).E - E0) / Math.abs(E0)).toBeLessThan(1e-9);
      const px = m1 * s[0].vx + m2 * s[1].vx, py = m1 * s[0].vy + m2 * s[1].vy;
      expect(Math.abs(px - (m1 + m2) * 300) / ((m1 + m2) * 300)).toBeLessThan(1e-12);
      expect(Math.abs(py) / ((m1 + m2) * 300)).toBeLessThan(1e-12);
      const xcm = (m1 * s[0].x + m2 * s[1].x) / (m1 + m2);
      expect(Math.abs(xcm - 300 * sim.t[k])).toBeLessThan(1e-6 * d);
    }
  });
  it('dos cuerpos libres: el movimiento relativo es el de Kepler con μ = G(m₁ + m₂)', () => {
    const mu1 = MU, mu2 = CUERPOS.luna.mu, d = 3.844e8, v = Math.sqrt((mu1 + mu2) / d) * 0.93;
    const cuerpos = [
      { nombre: 'Tierra', mu: mu1, x: 0, y: 0, vx: 0, vy: 0 },
      { nombre: 'Luna', mu: mu2, x: d, y: 0, vx: 0, vy: v },
    ];
    const T = elementosOrbitales(mu1 + mu2, [d, 0], [0, v]).periodo;
    const sim = simularGravitacion({ cuerpos, duracion: 1.5 * T, dt: T / 3000 });
    for (const t of [0.13 * T, 0.5 * T, T, 1.37 * T]) {
      const [a, b] = estadoEn(sim, t), k = estadoKepler(mu1 + mu2, [d, 0], [0, v], t);
      expect(Math.hypot(b.x - a.x - k.x, b.y - a.y - k.y) / d).toBeLessThan(1e-9);
    }
  });
});

describe('tercera ley de Kepler', () => {
  it('T²/a³ = 4π²/GM para órbitas de distinto tamaño y excentricidad (periodo medido)', () => {
    const casos = [[7.0e6, 0], [1.2e7, 0.2], [6.9e6, 0.74], [4.2164e7, 0], [5e7, 0.5]];
    const k = 4 * Math.PI ** 2 / MU;
    for (const [rp, e] of casos) {
      const pasos = Math.ceil(2000 * (1 + e) ** 2 / (1 - e * e) ** 1.5);
      const { sim, a, T } = orbita({ rp, e, pasos });
      const medido = sim.eventos.find(x => x.tipo === 'vuelta').t;
      expect(rel(medido, T)).toBeLessThan(1e-9);
      expect(rel(medido ** 2 / a ** 3, k)).toBeLessThan(2e-9);
    }
  });
});

describe('segunda ley de Kepler', () => {
  it('el radio vector barre áreas iguales en tiempos iguales', () => {
    const { sim, T, sat } = orbita({ rp: R + 500e3, e: 0.6, pasos: 8000 });
    const n = 8, areas = new Array(n).fill(0);
    for (let k = 0; k + 1 < sim.t.length; k++) {
      // Cada triángulo del abanico va al intervalo de su punto medio
      const q = Math.floor((sim.t[k] + sim.t[k + 1]) / 2 / (T / n));
      if (q < n) areas[q] += 0.5 * (sat.x[k] * sat.y[k + 1] - sat.x[k + 1] * sat.y[k]);
    }
    const media = areas.reduce((a, b) => a + b) / n;
    for (const A of areas) expect(rel(A, media)).toBeLessThan(1e-5);
    // Velocidad areolar = h/2
    expect(rel(media, momentoEsp(sat, 0) / 2 * T / n)).toBeLessThan(1e-5);
  });
});

describe('umbral de escape v = √(2GM/r)', () => {
  const r = R + 300e3, ve = velocidadEscape(MU, r);
  const lanzar = v => elementosOrbitales(MU, [r, 0], [0, v]);

  it('justo por debajo queda ligada (ε < 0) y justo por encima escapa (ε > 0)', () => {
    const abajo = lanzar(ve * (1 - 1e-9)), arriba = lanzar(ve * (1 + 1e-9)), justo = lanzar(ve);
    expect(abajo.energia).toBeLessThan(0);
    expect(abajo.e).toBeLessThan(1);
    expect(abajo.tipo).toBe('elíptica');
    expect(Number.isFinite(abajo.periodo)).toBe(true);
    expect(arriba.energia).toBeGreaterThan(0);
    expect(arriba.e).toBeGreaterThan(1);
    expect(arriba.tipo).toBe('hiperbólica');
    expect(arriba.periodo).toBe(Infinity);
    expect(justo.tipo).toBe('parabólica');
    expect(Math.abs(justo.energia)).toBeLessThan(1e-12 * MU / r);
  });
  it('simulada: con 0.99·v_e llega a un apoapsis y vuelve; con 1.01·v_e se aleja sin volver', () => {
    const lig = lanzar(0.99 * ve);
    const cuerpos = v => cuerposOrbita({ mu: MU, radio: R }, { altura: 300e3, velocidad: v, phi: 0 });
    const s1 = simularGravitacion({ cuerpos: cuerpos(0.99 * ve), duracion: 1.02 * lig.periodo, dt: lig.periodo / 40000 });
    const apo = s1.eventos.find(e => e.tipo === 'apoapsis'), vuelta = s1.eventos.find(e => e.tipo === 'vuelta');
    expect(rel(apo.r, lig.ra)).toBeLessThan(1e-6);
    expect(rel(apo.t, lig.periodo / 2)).toBeLessThan(1e-6);
    expect(rel(vuelta.t, lig.periodo)).toBeLessThan(1e-6);

    const s2 = simularGravitacion({ cuerpos: cuerpos(1.01 * ve), duracion: 2 * 86400, dt: 5 });
    expect(s2.eventos.map(e => [e.tipo, e.t])).toEqual([['periapsis', 0]]);
    const sat = s2.cuerpos[1], E0 = energiaEsp(sat, 0);
    expect(E0).toBeGreaterThan(0);
    for (let k = 1; k < sat.x.length; k++) expect(Math.hypot(sat.x[k], sat.y[k])).toBeGreaterThan(Math.hypot(sat.x[k - 1], sat.y[k - 1]));
    // Lejos, la rapidez tiende a v∞ = √(v² − v_e²): |v|² = v∞² + 2μ/r
    const k = sat.x.length - 1, rf = Math.hypot(sat.x[k], sat.y[k]), vinf2 = (1.01 * ve) ** 2 - ve ** 2;
    expect(rel(sat.vx[k] ** 2 + sat.vy[k] ** 2, vinf2 + 2 * MU / rf)).toBeLessThan(1e-9);
  });
});

describe('órbita elíptica frente a la solución de Kepler', () => {
  it('posición y velocidad coinciden en varios instantes de tres vueltas', () => {
    const e = 0.6, rp = R + 500e3, { sim, a, vp, T } = orbita({ rp, e, orbitas: 3.1, pasos: 6000 });
    for (let k = 1; k <= 21; k++) {
      const t = k * T / 7 + 13.7, [, s] = estadoEn(sim, t), q = estadoKepler(MU, [rp, 0], [0, vp], t);
      expect(Math.hypot(s.x - q.x, s.y - q.y) / a).toBeLessThan(1e-8);
      expect(Math.hypot(s.vx - q.vx, s.vy - q.vy) / vp).toBeLessThan(1e-8);
    }
  });
  it('los ápsides caen en r_p = a(1 − e) y r_a = a(1 + e), a medio periodo', () => {
    const e = 0.6, { sim, a, T } = orbita({ rp: R + 500e3, e, orbitas: 2.1, pasos: 6000 });
    const peri = sim.eventos.filter(x => x.tipo === 'periapsis'), apo = sim.eventos.filter(x => x.tipo === 'apoapsis');
    expect(peri.map(x => x.t)).toHaveLength(3);         // t = 0, T, 2T
    expect(apo).toHaveLength(2);
    for (const x of peri) expect(rel(x.r, a * (1 - e))).toBeLessThan(1e-9);
    for (const x of apo) expect(rel(x.r, a * (1 + e))).toBeLessThan(1e-9);
    expect(rel(apo[0].t, T / 2)).toBeLessThan(1e-9);
    expect(rel(peri[1].t, T)).toBeLessThan(1e-9);
  });
});

describe('orden de convergencia', () => {
  // Error de posición tras una vuelta, frente a Kepler
  const error = (integrador, pasos) => {
    const e = 0.3, rp = R + 500e3, { sim, a, vp, T } = orbita({ rp, e, orbitas: 1, pasos, integrador, apsides: false, vueltas: false });
    const k = sim.t.length - 1, q = estadoKepler(MU, [rp, 0], [0, vp], T), sat = sim.cuerpos[1];
    expect(rel(sim.t[k], T)).toBeLessThan(1e-14);
    return Math.hypot(sat.x[k] - q.x, sat.y[k] - q.y) / a;
  };
  it('Yoshida es de 4.º orden', () => {
    const [e1, e2, e3] = [100, 200, 400].map(n => error('yoshida4', n));
    for (const [x, y] of [[e1, e2], [e2, e3]]) expect(Math.log2(x / y)).toBeGreaterThan(3.8), expect(Math.log2(x / y)).toBeLessThan(4.2);
  });
  it('Verlet es de 2.º orden', () => {
    const [e1, e2, e3] = [400, 800, 1600].map(n => error('verlet', n));
    for (const [x, y] of [[e1, e2], [e2, e3]]) expect(Math.log2(x / y)).toBeGreaterThan(1.9), expect(Math.log2(x / y)).toBeLessThan(2.1);
  });
});

describe('evento de impacto con la superficie', () => {
  // El cañón de Newton: lanzamiento horizontal desde 800 km a menos de la velocidad circular
  const h = 800e3, v = 6000, r0 = R + h;
  const cuerpos = cuerposOrbita({ mu: MU, radio: R, nombre: 'Tierra' }, { altura: h, velocidad: v, sentido: -1 });
  const el = elementosOrbitales(MU, [0, r0], [v, 0]);

  it('choca en el instante que da la ecuación de Kepler, sobre la superficie', () => {
    const sim = simularGravitacion({ cuerpos, duracion: el.periodo, dt: el.periodo / 2000, detenerAlPosarse: true });
    const imp = sim.eventos.find(e => e.tipo === 'impacto');
    // Parte del apoapsis (E = π); llega a r = R con cos E = (1 − R/a)/e, E en (π, 2π)
    const n = Math.sqrt(MU / el.a ** 3), E = 2 * Math.PI - Math.acos((1 - R / el.a) / el.e);
    const tImpacto = (E - el.e * Math.sin(E) - Math.PI) / n;
    expect(rel(imp.t, tImpacto)).toBeLessThan(1e-9);
    expect(Math.abs(imp.r - R)).toBeLessThan(1e-6);
    expect(sim.duracion).toBe(imp.t);
    expect(sim.eventos[0].tipo).toBe('apoapsis');
    expect(sim.eventos[0].t).toBe(0);
  });
  it('después del impacto queda posado sobre el planeta', () => {
    const sim = simularGravitacion({ cuerpos, duracion: el.periodo, dt: el.periodo / 2000 });
    const imp = sim.eventos.find(e => e.tipo === 'impacto');
    expect(sim.duracion).toBeCloseTo(el.periodo, 6);
    for (const t of [imp.t, imp.t + 1, 0.9 * el.periodo]) {
      const [, s] = estadoEn(sim, t);
      expect(s.posado).toBe(true);
      expect(Math.hypot(s.x - imp.x, s.y - imp.y)).toBeLessThan(1e-9 * R);
      expect(Math.hypot(s.vx, s.vy)).toBe(0);
    }
    expect(estadoEn(sim, imp.t * 0.999)[1].posado).toBe(false);
  });
});

describe('MEXT 2023 P3: satélite en órbita circular y órbita geoestacionaria', () => {
  it('v = √(GM/(R+h)) mantiene la órbita circular y su periodo es 2π(R+h)√((R+h)/GM)', () => {
    for (const h of [400e3, 2000e3, 20000e3]) {
      const v = Math.sqrt(MU / (R + h)), Ts = 2 * Math.PI * (R + h) * Math.sqrt((R + h) / MU);
      const sim = simularGravitacion({ cuerpos: cuerposOrbita({ mu: MU, radio: R }, { altura: h, velocidad: v, phi: 0 }), duracion: 1.05 * Ts, dt: Ts / 2000 });
      const sat = sim.cuerpos[1];
      for (let k = 0; k < sim.t.length; k += 50) {
        expect(rel(Math.hypot(sat.x[k], sat.y[k]), R + h)).toBeLessThan(1e-10);
        expect(rel(Math.hypot(sat.vx[k], sat.vy[k]), v)).toBeLessThan(1e-10);
      }
      expect(rel(sim.eventos.find(e => e.tipo === 'vuelta').t, Ts)).toBeLessThan(1e-9);
    }
  });
  it('con T_s = T: h = (GM·T²/4π²)^(1/3) − R ≈ 35 786 km y v = (2πGM/T)^(1/3)', () => {
    const T = TIERRA.periodoRotacion, h = alturaSincrona(MU, R, T);
    expect(h).toBeCloseTo((MU * T * T / (4 * Math.PI ** 2)) ** (1 / 3) - R, 3);
    expect(Math.abs(h - 35786e3)).toBeLessThan(1e3);
    expect(rel(Math.sqrt(MU / (R + h)), Math.cbrt(2 * Math.PI * MU / T))).toBeLessThan(1e-14);
  });
  it('el satélite geoestacionario se queda sobre el mismo punto del ecuador', () => {
    const T = TIERRA.periodoRotacion, h = alturaSincrona(MU, R, T), w = 2 * Math.PI / T;
    const sim = simularGravitacion({ cuerpos: cuerposOrbita({ mu: MU, radio: R }, { altura: h, velocidad: Math.cbrt(2 * Math.PI * MU / T), phi: 0 }), duracion: T * 1.01, dt: T / 2000 });
    const sat = sim.cuerpos[1];
    for (let k = 0; k < sim.t.length; k += 40) {
      // Ángulo del satélite menos el giro de la Tierra
      const d = Math.atan2(sat.y[k], sat.x[k]) - w * sim.t[k], dd = Math.atan2(Math.sin(d), Math.cos(d));
      expect(Math.abs(dd)).toBeLessThan(1e-8);
    }
    expect(rel(sim.eventos.find(e => e.tipo === 'vuelta').t, T)).toBeLessThan(1e-9);
  });
});

describe('MEXT 2018 P3: masa de la Tierra y velocidad de escape a partir de g', () => {
  const g = 9.8, Gx = 6.67e-11, Rt = 6.4e6;
  it('M = g·R²/G ≈ 6.0 × 10²⁴ kg', () => {
    const M = masaDesdeGravedad(g, Rt, Gx);
    expect(rel(M, 9.8 * 6.4e6 ** 2 / 6.67e-11)).toBeLessThan(1e-15);
    expect(Number(M.toPrecision(2))).toBe(6.0e24);
  });
  it('v_e = √(2gR) ≈ 1.1 × 10⁴ m/s, igual a √(2GM/R)', () => {
    const ve = escapeDesdeGravedad(g, Rt);
    expect(rel(ve, 11200)).toBeLessThan(1e-14);
    expect(Number(ve.toPrecision(2))).toBe(1.1e4);
    expect(rel(velocidadEscape(Gx * masaDesdeGravedad(g, Rt, Gx), Rt), ve)).toBeLessThan(1e-14);
  });
  it('Júpiter (320 masas y 11 radios terrestres): v_eJ/v_eT = √(320/11) ≈ 5.4', () => {
    const c = cocienteEscape(320, 11), muT = g * Rt * Rt;
    expect(rel(c, Math.sqrt(320 / 11))).toBeLessThan(1e-15);
    expect(Number(c.toPrecision(2))).toBe(5.4);
    expect(rel(velocidadEscape(320 * muT, 11 * Rt) / velocidadEscape(muT, Rt), c)).toBeLessThan(1e-14);
  });
  it('radio de la órbita de periodo 24 h ≈ 4.2 × 10⁷ m', () => {
    expect(Number(semiejeDesdePeriodo(g * Rt * Rt, 24 * 3600).toPrecision(2))).toBe(4.2e7);
  });
  it('lanzado desde la superficie a 30°: por debajo de √(2gR) vuelve al suelo, por encima escapa', () => {
    const planeta = { mu: g * Rt * Rt, radio: Rt }, ve = escapeDesdeGravedad(g, Rt), alfa = Math.PI / 6;
    const lanzar = k => cuerposOrbita(planeta, { altura: 0, velocidad: k * ve, alfa, phi: 0 });
    const [, sat] = lanzar(0.99), bajo = elementosOrbitales(planeta.mu, [sat.x, sat.y], [sat.vx, sat.vy]);
    const s1 = simularGravitacion({ cuerpos: lanzar(0.99), duracion: bajo.periodo, dt: bajo.periodo / 80000, detenerAlPosarse: true });
    // La órbita es simétrica respecto de la línea de ápsides: vuelve al suelo
    // en ν = 2π − ν₀, es decir, a T − 2·M₀/n del lanzamiento
    const e = bajo.e, E0 = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(bajo.nu / 2), Math.sqrt(1 + e) * Math.cos(bajo.nu / 2));
    const tVuelta = bajo.periodo - 2 * (E0 - e * Math.sin(E0)) / (2 * Math.PI / bajo.periodo);
    const imp = s1.eventos.find(x => x.tipo === 'impacto');
    expect(bajo.energia).toBeLessThan(0);
    expect(s1.eventos.find(x => x.tipo === 'apoapsis')).toBeDefined();
    expect(rel(imp.t, tVuelta)).toBeLessThan(1e-7);
    expect(rel(imp.r, Rt)).toBeLessThan(1e-12);
    const s2 = simularGravitacion({ cuerpos: lanzar(1.01), duracion: 5 * 86400, dt: 5 });
    expect(s2.eventos.filter(x => x.tipo === 'impacto' || x.tipo === 'apoapsis')).toEqual([]);
    expect(energiaEsp(s2.cuerpos[1], 0, planeta.mu)).toBeGreaterThan(0);
  });
});

describe('determinismo', () => {
  it('la misma escena da exactamente el mismo resultado', () => {
    const escena = () => ({ cuerpos: cuerposOrbita(TIERRA, { altura: 800e3, velocidad: 8200, sentido: -1 }), duracion: 9000, dt: 4 });
    const a = simularGravitacion(escena()), b = simularGravitacion(escena());
    expect(a).toEqual(b);
    for (const t of [0, 1234.5, 8999]) expect(estadoEn(a, t)).toEqual(estadoEn(b, t));
  });
  it('estadoEn reproduce exactamente las muestras guardadas', () => {
    const sim = simularGravitacion({ cuerpos: cuerposOrbita(TIERRA, { altura: 800e3, velocidad: 8200 }), duracion: 9000, dt: 4 });
    for (const k of [0, 1, 777, sim.t.length - 1]) {
      const [, s] = estadoEn(sim, sim.t[k]);
      expect([s.x, s.y, s.vx, s.vy]).toEqual([sim.cuerpos[1].x[k], sim.cuerpos[1].y[k], sim.cuerpos[1].vx[k], sim.cuerpos[1].vy[k]]);
    }
  });
});

// Escenas MEXT cortas del espacio Órbitas: cada respuesta del examen sale de
// la simulación (periodo medido, radio, energía), no solo de la fórmula.
describe('MEXT: preguntas cortas de gravitación', () => {
  const gx = 9.8, Rx = 6.4e6, planetaExamen = { mu: gx * Rx * Rx, radio: Rx };
  const circular = (planeta, h, o = {}) => {
    const r = planeta.radio + h, v = velocidadCircular(planeta.mu, r), T = periodoOrbital(planeta.mu, r);
    const sim = simularGravitacion({ cuerpos: cuerposOrbita(planeta, { altura: h, velocidad: v, phi: 0 }), duracion: 1.02 * T, dt: T / 3000, ...o });
    return { sim, r, v, T, Tmed: sim.eventos.find(e => e.tipo === 'vuelta').t };
  };

  it('2027 1-(2): a 1.6·10⁶ m de altura, F/F₀ = (R/(R + h))² = 0.64', () => {
    const { sim, r } = circular(planetaExamen, 1.6e6), sat = sim.cuerpos[1];
    // La aceleración medida en la órbita entre la gravedad en la superficie
    const k = 100, a = velocidadCircular(planetaExamen.mu, r) ** 2 / Math.hypot(sat.x[k], sat.y[k]);
    expect(rel(a / gx, 0.64)).toBeLessThan(1e-9);
    expect(rel((Rx / r) ** 2, 0.64)).toBeLessThan(1e-14);
  });

  it('2015 1-(2): la masa del planeta sale del radio y el periodo de su luna, M = 4π²R³/(GT²)', () => {
    const luna = 384400e3 - TIERRA.radio, { r, Tmed } = circular(TIERRA, luna);
    const M = 4 * Math.PI ** 2 * r ** 3 / (G * Tmed ** 2);
    expect(rel(M, TIERRA.masa)).toBeLessThan(1e-9);
    // Las otras opciones dan masas con otras dimensiones o de otro orden
    expect(rel(4 * Math.PI ** 2 * r ** 2 / (G * Tmed ** 2), TIERRA.masa)).toBeGreaterThan(0.99);
  });

  it('2014 1-(2): lanzado en horizontal desde la superficie, escapa a partir de √(2gR)', () => {
    const ve = escapeDesdeGravedad(gx, Rx);
    const lanzar = k => cuerposOrbita(planetaExamen, { altura: 0, velocidad: k * ve, alfa: 0, phi: 0 });
    // Justo en √(2gR): energía nula (parábola); un poco menos, vuelve (apoapsis)
    const [, s1] = lanzar(1);
    expect(Math.abs(elementosOrbitales(planetaExamen.mu, [s1.x, s1.y], [s1.vx, s1.vy]).energia)).toBeLessThan(1e-6);
    const bajo = simularGravitacion({ cuerpos: lanzar(0.98), duracion: 3 * 86400, dt: 5 });
    expect(bajo.eventos.find(e => e.tipo === 'apoapsis')).toBeDefined();
    const alto = simularGravitacion({ cuerpos: lanzar(1.01), duracion: 3 * 86400, dt: 5 });
    expect(alto.eventos.find(e => e.tipo === 'apoapsis')).toBeUndefined();
    // √(gR) es la circular rasante: la otra opción tentadora no escapa
    expect(rel(Math.sqrt(gx * Rx), velocidadCircular(planetaExamen.mu, Rx))).toBeLessThan(1e-14);
  });

  it('2013 1-(2): T² = k·a³ con k = 4π²/(GM), igual para órbitas de cualquier tamaño y forma', () => {
    const sol = CUERPOS.sol, k = 4 * Math.PI ** 2 / sol.mu;
    for (const [rp, e] of [[1.496e11, 0], [0.7e11, 0.2], [2.2e11, 0.6]]) {
      const { sim, a } = orbita({ rp, e, mu: sol.mu, orbitas: 1.02, pasos: 4000 });
      const T = sim.eventos.find(x => x.tipo === 'vuelta').t;
      expect(rel(T * T / (a * a * a), k)).toBeLessThan(1e-8);
    }
  });

  it('2010 1-G: el periodo de la órbita circular de radio r es 2π(r/R)√(r/g)', () => {
    for (const h of [Rx, 3 * Rx]) {
      const { r, Tmed } = circular(planetaExamen, h);
      expect(rel(Tmed, 2 * Math.PI * (r / Rx) * Math.sqrt(r / gx))).toBeLessThan(1e-9);
      // Las demás opciones no coinciden
      expect(rel(Tmed, 2 * Math.PI * r / Math.sqrt(gx * Rx))).toBeGreaterThan(0.1);
    }
  });

  it('2009 1-(2): con la Luna a 27 días, el satélite geoestacionario está a 1/9 de su distancia', () => {
    const dia = 86400, TL = 27 * dia;
    const geo = circular(TIERRA, alturaSincrona(MU, R, dia)), luna = circular(TIERRA, alturaSincrona(MU, R, TL));
    expect(rel(geo.Tmed, dia)).toBeLessThan(1e-9);
    expect(rel(luna.Tmed, TL)).toBeLessThan(1e-9);
    expect(rel(geo.r / luna.r, 1 / 9)).toBeLessThan(1e-12);
  });
});
