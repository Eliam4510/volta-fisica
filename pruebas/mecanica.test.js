// Motor general de Mecánica contra soluciones analíticas.
import { describe, it, expect } from 'vitest';
import { simularMecanica, estadoMecanica, energiaMecanica } from '../sistema/motores/mecanica.js';

const g = 9.8;
const cerca = (a, b, tol) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
const ev = (sim, texto) => sim.eventos.find(e => e.nombre.includes(texto));
/** K(k) completa de primera especie por la media aritmético-geométrica */
const elipticaK = k => { let a = 1, b = Math.sqrt(1 - k * k); for (let i = 0; i < 40; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)]; return Math.PI / (2 * a); };

describe('movimiento libre', () => {
  it('caída libre: y = y0 − g·t²/2', () => {
    const sim = simularMecanica({ particulas: [{ id: 'P', m: 1, p: [0, 10], v: [3, 0] }], duracion: 1.2 });
    for (const t of [0.3, 0.7, 1.2]) {
      const s = estadoMecanica(sim, t)[0];
      cerca(s.y, 10 - g * t * t / 2, 1e-9);
      cerca(s.x, 3 * t, 1e-9);
    }
  });
  it('arrastre lineal: x = (m·v0/b)(1 − e^(−b·t/m))', () => {
    const m = 2, b = 0.5, v0 = 10;
    const sim = simularMecanica({ g: [0, 0], b, particulas: [{ id: 'P', m, p: [0, 0], v: [v0, 0] }], duracion: 3 });
    for (const t of [1, 2, 3]) cerca(estadoMecanica(sim, t)[0].x, (m * v0 / b) * (1 - Math.exp(-b * t / m)), 1e-9);
  });
});

describe('oscilaciones', () => {
  it('resorte: x = L0 + A·cos(ω·t) con ω = √(k/m), y la energía se conserva', () => {
    const m = 0.5, k = 8, L0 = 0.5, A = 0.3, w = Math.sqrt(k / m);
    const sim = simularMecanica({
      g: [0, 0], duracion: 4,
      particulas: [{ id: 'P', m, p: [L0 + A, 0], v: [0, 0] }],
      conectores: [{ id: 'R', tipo: 'resorte', a: 'P', ancla: [0, 0], k, L0 }],
    });
    for (const t of [0.5, 1.7, 4]) cerca(estadoMecanica(sim, t)[0].x, L0 + A * Math.cos(w * t), 1e-8);
    const E0 = energiaMecanica(sim, 0).E;
    for (let i = 1; i <= 40; i++) cerca(energiaMecanica(sim, i * 0.1).E, E0, 1e-9);
  });

  it('péndulo de 60°: periodo exacto 4·√(L/g)·K(sen(θ0/2))', () => {
    const L = 1, th = Math.PI / 3, T = 4 * Math.sqrt(L / g) * elipticaK(Math.sin(th / 2));
    const sim = simularMecanica({
      duracion: T * 1.01,
      particulas: [{ id: 'P', m: 1, p: [L * Math.sin(th), -L * Math.cos(th)], v: [0, 0] }],
      conectores: [{ id: 'C', tipo: 'cuerda', a: 'P', ancla: [0, 0], L }],
    });
    const s = estadoMecanica(sim, T)[0];
    cerca(s.x, L * Math.sin(th), 1e-7);
    cerca(s.y, -L * Math.cos(th), 1e-7);
    expect(sim.eventos.filter(e => e.nombre.includes('afloja'))).toEqual([]);
  });
});

describe('trayectorias restringidas', () => {
  it('MEXT 2017 P3: se despega del hemisferio en cos θ = 2/3 + v0²/(3·g·R)', () => {
    const R = 1, v0 = 0.5;
    const sim = simularMecanica({
      duracion: 1.5,
      particulas: [{ id: 'P', m: 0.1, p: [0, R], v: [v0, 0] }],
      superficies: [{ id: 'hemisferio', tipo: 'arco', c: [0, 0], r: R, cara: 'exterior' }],
    });
    const d = ev(sim, 'Se despega');
    expect(d).toBeTruthy();
    const y = d.y[1];
    cerca(y / R, 2 / 3 + v0 * v0 / (3 * g * R), 1e-7);
  });

  it('MEXT 2009 P3: la cuerda se afloja donde sen θ = (v0² − 2gL)/(3gL)', () => {
    const L = 1, v0 = 4.5;
    const sim = simularMecanica({
      duracion: 2,
      particulas: [{ id: 'P', m: 1, p: [0, -L], v: [v0, 0] }],
      conectores: [{ id: 'hilo', tipo: 'cuerda', a: 'P', ancla: [0, 0], L }],
    });
    const f = ev(sim, 'se afloja');
    expect(f).toBeTruthy();
    cerca(f.y[1] / L, (v0 * v0 - 2 * g * L) / (3 * g * L), 1e-7);
  });

  it('MEXT 2014 P3: péndulo con clavo; con b = a/2 la cuerda se afloja en y = −a/6', () => {
    const a = 1, b = a / 2;
    const sim = simularMecanica({
      duracion: 2,
      particulas: [{ id: 'P', m: 1, p: [a, 0], v: [0, 0] }],
      conectores: [{ id: 'hilo', tipo: 'cuerda', a: 'P', ancla: [0, 0], L: a, clavos: [[0, -b]] }],
    });
    const engancha = ev(sim, 'toca el clavo');
    expect(engancha).toBeTruthy();
    // En el punto más bajo (al tocar el clavo) v = √(2·g·a)
    cerca(Math.hypot(engancha.y[2], engancha.y[3]), Math.sqrt(2 * g * a), 1e-7);
    const floja = ev(sim, 'se afloja');
    expect(floja).toBeTruthy();
    cerca(floja.y[1], -a / 6, 1e-6);
    cerca(floja.y[2] ** 2 + floja.y[3] ** 2, g * a / 3, 1e-6);
  });
});

describe('choques', () => {
  it('choque elástico 1D: v1\' = (m1−m2)/(m1+m2)·v1, v2\' = 2m1/(m1+m2)·v1', () => {
    const m1 = 1, m2 = 3, v1 = 2;
    const sim = simularMecanica({
      g: [0, 0], duracion: 2,
      particulas: [{ id: 'A', m: m1, p: [0, 0], v: [v1, 0], radio: 0.1 }, { id: 'B', m: m2, p: [1, 0], v: [0, 0], radio: 0.1 }],
    });
    const [A, B] = estadoMecanica(sim, 2);
    cerca(A.vx, (m1 - m2) / (m1 + m2) * v1, 1e-12);
    cerca(B.vx, 2 * m1 / (m1 + m2) * v1, 1e-12);
    cerca(ev(sim, 'Choque entre').t, 0.8 / v1, 1e-10);
  });

  it('choque oblicuo: conserva el momento; con e = 1 conserva la energía', () => {
    const sim = simularMecanica({
      g: [0, 0], duracion: 2,
      particulas: [{ id: 'A', m: 1, p: [0, 0], v: [2, 0], radio: 0.1 }, { id: 'B', m: 2, p: [1, 0.12], v: [0, 0], radio: 0.1 }],
    });
    const [A, B] = estadoMecanica(sim, 2);
    cerca(A.vx * 1 + B.vx * 2, 2, 1e-12);
    cerca(A.vy * 1 + B.vy * 2, 0, 1e-12);
    cerca(energiaMecanica(sim, 2).E, energiaMecanica(sim, 0).E, 1e-12);
  });

  it('con e < 1 la energía perdida es la que registra el evento', () => {
    const sim = simularMecanica({
      g: [0, 0], duracion: 2, eParticulas: 0.4,
      particulas: [{ id: 'A', m: 1, p: [0, 0], v: [2, 0], radio: 0.1 }, { id: 'B', m: 2, p: [1, 0.05], v: [0, 0], radio: 0.1 }],
    });
    const perdida = sim.eventos.reduce((s, e) => s + e.perdida, 0);
    expect(perdida).toBeGreaterThan(0);
    cerca(energiaMecanica(sim, 0).E - energiaMecanica(sim, 2).E, perdida, 1e-10);
  });

  it('rebote en el suelo: altura h·e² tras el primer choque', () => {
    const h = 2, e = 0.8;
    const sim = simularMecanica({
      duracion: 1.5,
      particulas: [{ id: 'P', m: 1, p: [0, h], v: [0, 0] }],
      superficies: [{ id: 'suelo', tipo: 'segmento', a: [-5, 0], b: [5, 0].map((x, i) => (i ? 0 : x)), e }],
    });
    // El suelo va de izquierda a derecha: el sólido queda abajo
    const c = ev(sim, 'Choque con suelo');
    expect(c).toBeTruthy();
    const tApice = c.t + c.y[3] / g;
    cerca(estadoMecanica(sim, tApice)[0].y, h * e * e, 1e-8);
  });
});

describe('fricción y poleas', () => {
  const plano = (mu, muS) => {
    const th = Math.PI / 6, a = [0, 0], b = [10 * Math.cos(th), -10 * Math.sin(th)];
    const p0 = [Math.cos(th), -Math.sin(th)];
    return simularMecanica({
      duracion: 1,
      particulas: [{ id: 'P', m: 2, p: p0, v: [0, 0] }],
      superficies: [{ id: 'plano', tipo: 'segmento', a, b, mu, muS }],
    });
  };
  it('plano inclinado de 30° con μ = 0.2: a = g(sen θ − μ·cos θ)', () => {
    const th = Math.PI / 6, sim = plano(0.2), acc = g * (Math.sin(th) - 0.2 * Math.cos(th));
    const s = estadoMecanica(sim, 1)[0];
    const recorrido = Math.hypot(s.x - Math.cos(th), s.y + Math.sin(th));
    cerca(recorrido, acc / 2, 1e-7);
  });
  it('si μs > tan θ el bloque se queda quieto', () => {
    const s = estadoMecanica(plano(0.5, 0.7), 1)[0];
    cerca(s.x, Math.cos(Math.PI / 6), 1e-9);
    cerca(Math.hypot(s.vx, s.vy), 0, 1e-9);
  });
  it('máquina de Atwood: a = g·(m1 − m2)/(m1 + m2)', () => {
    const m1 = 2, m2 = 1, acc = g * (m1 - m2) / (m1 + m2);
    const sim = simularMecanica({
      duracion: 0.5,
      particulas: [{ id: 'A', m: m1, p: [0, -1], v: [0, 0] }, { id: 'B', m: m2, p: [0, -1.5], v: [0, 0] }],
      conectores: [{ id: 'cuerda', tipo: 'polea', a: 'A', b: 'B', polea: [0, 0], L: 2.5 }],
    });
    const [A, B] = estadoMecanica(sim, 0.5);
    cerca(A.y, -1 - acc * 0.25 / 2, 1e-8);
    cerca(B.y, -1.5 + acc * 0.25 / 2, 1e-8);
  });
});

describe('determinismo', () => {
  it('la misma escena da exactamente el mismo resultado', () => {
    const esc = () => ({ duracion: 1, particulas: [{ id: 'P', m: 1, p: [0, -1], v: [4.5, 0] }], conectores: [{ id: 'h', tipo: 'cuerda', a: 'P', ancla: [0, 0], L: 1 }] });
    const a = simularMecanica(esc()), b = simularMecanica(esc());
    expect(estadoMecanica(a, 0.8)).toEqual(estadoMecanica(b, 0.8));
    expect(a.eventos.map(e => e.t)).toEqual(b.eventos.map(e => e.t));
  });
});
