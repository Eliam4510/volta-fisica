// Motor general de Mecánica contra soluciones analíticas.
import { describe, it, expect } from 'vitest';
import { simularMecanica, estadoMecanica, energiaMecanica, resolverLCP } from '../sistema/motores/mecanica.js';

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

describe('choques robustos y contactos entre discos', () => {
  const pared = (id, a, b, e = 1) => ({ id, tipo: 'segmento', a, b, e });
  // Caja de 6 m × 4 m; los segmentos dejan el sólido por fuera
  const caja = e => [pared('s', [-3, -2], [3, -2], e), pared('n', [3, 2], [-3, 2], e), pared('o', [-3, 2], [-3, -2], e), pared('e', [3, -2], [3, 2], e)];
  // tiempoMax: el límite de reloj protege la interfaz, no la física; con la
  // suite entera en paralelo (o en la compilación de Windows) 5 s no bastaban
  const gas = (n, v, g = [0, 0]) => ({
    duracion: 5, g, tiempoMax: 60000, particulas: Array.from({ length: n }, (_, i) => ({
      id: 'p' + i, m: 1 + (i % 3), radio: 0.1,
      p: [-2.5 + (i % 6), -1.5 + Math.floor(i / 6) * 0.75], v: [v * Math.cos(i * 1.7), v * Math.sin(i * 2.3)],
    })),
    superficies: caja(1),
  });

  it('sin efecto túnel: 24 discos a 20 m/s no salen de la caja ni se atraviesan', () => {
    const sim = simularMecanica(gas(24, 20));
    expect(sim.incompleta).toBeNull();
    const E0 = energiaMecanica(sim, 0).E;
    for (let k = 0; k <= 400; k++) {
      const t = 5 * k / 400, S = estadoMecanica(sim, t);
      for (const s of S) {
        expect(Math.abs(s.x)).toBeLessThanOrEqual(3 - 0.1 + 1e-6);
        expect(Math.abs(s.y)).toBeLessThanOrEqual(2 - 0.1 + 1e-6);
      }
      for (let a = 0; a < S.length; a++) for (let b = a + 1; b < S.length; b++) {
        expect(Math.hypot(S[a].x - S[b].x, S[a].y - S[b].y)).toBeGreaterThanOrEqual(0.2 - 1e-6);
      }
      cerca(energiaMecanica(sim, t).E, E0, 1e-12);
    }
  });

  it('el radio cuenta contra las superficies: disco apoyado y bola en un cuenco', () => {
    const apoyado = simularMecanica({ duracion: 1, particulas: [{ id: 'D', m: 1, p: [0, 0.1], v: [1, 0], radio: 0.1 }], superficies: [pared('suelo', [-5, 0], [5, 0], 0.5)] });
    expect(apoyado.eventos).toEqual([]);
    cerca(estadoMecanica(apoyado, 1)[0].y, 0.1, 1e-9);
    // En un cuenco de radio R, el centro de una bola de radio r va por R − r
    const R = 1, r = 0.2, a0 = 0.05;
    const cuenco = simularMecanica({ duracion: 3, particulas: [{ id: 'B', m: 1, p: [(R - r) * Math.sin(a0), -(R - r) * Math.cos(a0)], v: [0, 0], radio: r }], superficies: [{ id: 'cuenco', tipo: 'arco', c: [0, 0], r: R, cara: 'interior' }] });
    for (const t of [0.7, 1.9, 3]) { const s = estadoMecanica(cuenco, t)[0]; cerca(Math.hypot(s.x, s.y), R - r, 1e-9); }
  });

  it('péndulo de Newton: la velocidad pasa entera a la última bola', () => {
    const sim = simularMecanica({
      duracion: 2, g: [0, 0],
      particulas: [{ id: 'A', m: 1, p: [-1, 0], v: [2, 0], radio: 0.1 }, ...[0, 1, 2, 3].map(k => ({ id: 'B' + k, m: 1, p: [k * 0.2, 0], v: [0, 0], radio: 0.1 }))],
    });
    const v = estadoMecanica(sim, 2).map(s => s.vx);
    [0, 0, 0, 0].forEach((x, i) => cerca(v[i], x, 1e-12));
    cerca(v[4], 2, 1e-12);
    expect(sim.eventos.filter(e => e.nombre.startsWith('Choque entre')).map(e => e.t)).toEqual([0.4, 0.4, 0.4, 0.4].map(() => expect.closeTo(0.4, 10)));
  });

  it('una pila de discos inelásticos cae y se asienta en y = r, 3r, 5r', () => {
    const sim = simularMecanica({
      duracion: 4, eParticulas: 0.5,
      particulas: [0, 1, 2].map(k => ({ id: 'D' + k, m: 1, p: [0, 0.5 + k * 0.5], v: [0, 0], radio: 0.1 })),
      superficies: [pared('suelo', [-5, 0], [5, 0], 0.5)],
    });
    expect(sim.incompleta).toBeNull();
    estadoMecanica(sim, 4).forEach((s, k) => { cerca(s.y, 0.1 + 0.2 * k, 1e-8); cerca(s.vy, 0, 1e-8); });
  });

  it('montón inelástico bajo gravedad: termina y el balance de energía cierra', () => {
    const paredes = [pared('s', [-1, 0], [1, 0], 0.3), pared('o', [-1, 2], [-1, 0], 0.3), pared('e', [1, 0], [1, 2], 0.3)];
    const sim = simularMecanica({
      duracion: 5, eParticulas: 0.3, superficies: paredes,
      particulas: Array.from({ length: 10 }, (_, i) => ({ id: 'b' + i, m: 1, p: [-0.7 + (i % 5) * 0.35, 0.5 + Math.floor(i / 5) * 0.4], v: [Math.cos(i), 0], radio: 0.1 })),
    });
    expect(sim.incompleta).toBeNull();
    const E0 = energiaMecanica(sim, 0).E, E1 = energiaMecanica(sim, 5).E;
    const disipada = sim.eventos.reduce((a, e) => a + e.perdida, 0);
    // Lo que no cuadra es la estabilización de Baumgarte en los apoyos (≈ 2·10⁻⁶·E0)
    expect(Math.abs(E0 - E1 - disipada)).toBeLessThan(1e-5 * E0);
    // Ningún disco atraviesa el suelo ni las paredes
    for (let k = 0; k <= 200; k++) for (const s of estadoMecanica(sim, 5 * k / 200)) {
      expect(s.y).toBeGreaterThanOrEqual(0.1 - 1e-3);
      expect(Math.abs(s.x)).toBeLessThanOrEqual(0.9 + 1e-3);
    }
  });

  it('al llegar al límite de eventos devuelve lo simulado y lo dice', () => {
    const sim = simularMecanica({ ...gas(24, 20), maxEventos: 40 });
    expect(sim.incompleta).toBeTruthy();
    expect(sim.incompleta.motivo).toMatch(/límite de 40 eventos/);
    expect(sim.tFin).toBeLessThan(5);
    expect(sim.tFin).toBe(sim.incompleta.t);
    // Más allá de lo simulado, el estado se queda en el último calculado
    expect(estadoMecanica(sim, 5)).toEqual(estadoMecanica(sim, sim.tFin));
  });

  it('con choques, la misma escena da exactamente el mismo resultado', () => {
    const a = simularMecanica(gas(12, 5, [0, -9.8])), b = simularMecanica(gas(12, 5, [0, -9.8]));
    expect(a.eventos.map(e => e.t)).toEqual(b.eventos.map(e => e.t));
    expect(estadoMecanica(a, 4.2)).toEqual(estadoMecanica(b, 4.2));
  });
});

describe('deriva a largo plazo (100 s)', () => {
  it('péndulo con cuerda: energía y largo', () => {
    const sim = simularMecanica({ duracion: 100, particulas: [{ id: 'P', m: 1, p: [Math.sin(1), -Math.cos(1)], v: [0, 0] }], conectores: [{ id: 'C', tipo: 'cuerda', a: 'P', ancla: [0, 0], L: 1 }] });
    const E0 = energiaMecanica(sim, 0).E;
    for (let k = 1; k <= 100; k++) {
      const s = estadoMecanica(sim, k)[0];
      cerca(energiaMecanica(sim, k).E, E0, 1e-9);
      cerca(Math.hypot(s.x, s.y), 1, 1e-10);
    }
  });
  it('varilla girando: energía', () => {
    const sim = simularMecanica({ duracion: 100, particulas: [{ id: 'P', m: 1, p: [0, -1], v: [5, 0] }], conectores: [{ id: 'C', tipo: 'varilla', a: 'P', ancla: [0, 0], L: 1 }] });
    const E0 = energiaMecanica(sim, 0).E;
    for (let k = 1; k <= 100; k++) cerca(energiaMecanica(sim, k).E, E0, 1e-8);
  });
  it('resorte en dos dimensiones con gravedad: energía', () => {
    const sim = simularMecanica({ duracion: 100, particulas: [{ id: 'P', m: 0.5, p: [0.7, -0.4], v: [0.3, 1] }], conectores: [{ id: 'R', tipo: 'resorte', a: 'P', ancla: [0, 0], k: 20, L0: 0.5 }] });
    const E0 = energiaMecanica(sim, 0).E;
    for (let k = 1; k <= 100; k++) cerca(energiaMecanica(sim, k).E, E0, 1e-6);
  });
});

describe('restricciones redundantes', () => {
  it('varilla y cuerda del mismo largo en el mismo péndulo dan lo mismo que la varilla sola', () => {
    const esc = extra => ({ duracion: 3, particulas: [{ id: 'P', m: 1, p: [Math.sin(1), -Math.cos(1)], v: [0, 0] }], conectores: [{ id: 'V', tipo: 'varilla', a: 'P', ancla: [0, 0], L: 1 }, ...extra] });
    const sola = estadoMecanica(simularMecanica(esc([])), 3)[0];
    for (const extra of [[{ id: 'C', tipo: 'cuerda', a: 'P', ancla: [0, 0], L: 1 }], [{ id: 'V2', tipo: 'varilla', a: 'P', ancla: [0, 0], L: 1 }]]) {
      const sim = simularMecanica(esc(extra)), s = estadoMecanica(sim, 3)[0];
      cerca(s.x, sola.x, 1e-9); cerca(s.y, sola.y, 1e-9);
      expect(sim.eventos).toEqual([]);
    }
  });
});

describe('apoyos que se pierden en un instante de evento', () => {
  it('al pasar del plano al suelo se registran la salida del borde y el contacto, con cualquier paso', () => {
    const th = Math.PI / 6, L = 3, fin = [L * Math.cos(th), 0];
    const esc = pasoMax => ({
      duracion: 2, pasoMax,
      particulas: [{ id: 'P', m: 1, p: [0.3 * Math.cos(th), L * Math.sin(th) - 0.3 * Math.sin(th)], v: [0, 0] }],
      superficies: [
        { id: 'plano', tipo: 'segmento', a: [0, L * Math.sin(th)], b: fin },
        { id: 'suelo', tipo: 'segmento', a: fin, b: [8, 0], e: 0 },
      ],
    });
    for (const pasoMax of [undefined, 0.005, 0.001]) {
      const sim = simularMecanica(esc(pasoMax));
      const borde = ev(sim, 'Sale del borde'), suelo = ev(sim, 'contacto con suelo');
      expect(borde).toBeTruthy();
      expect(suelo).toBeTruthy();
      cerca(borde.t, suelo.t, 1e-9);
      // Después sigue por el suelo con la componente horizontal de la velocidad
      const v = Math.sqrt(2 * g * (L - 0.3) * Math.sin(th));
      cerca(estadoMecanica(sim, 2)[0].vx, v * Math.cos(th), 1e-6);
    }
  });
});

describe('fuerza constante aplicada', () => {
  it('empuja un bloque sobre un suelo con fricción: a = (F − μ·m·g)/m y la energía cierra con U_F', () => {
    const m = 2, F = 10, mu = 0.2, acc = (F - mu * m * g) / m;
    const sim = simularMecanica({
      duracion: 1.5,
      particulas: [{ id: 'B', m, p: [0, 0], v: [0, 0], F: [F, 0] }],
      superficies: [{ id: 'suelo', tipo: 'segmento', a: [-1, 0], b: [20, 0], mu }],
    });
    const s = estadoMecanica(sim, 1.5)[0];
    cerca(s.x, acc * 1.5 * 1.5 / 2, 1e-7);
    cerca(s.vx, acc * 1.5, 1e-7);
    // Lo que no es cinética ni U_F lo disipó la fricción: μ·m·g·d
    const e0 = energiaMecanica(sim, 0), e1 = energiaMecanica(sim, 1.5);
    cerca(e1.UF, -F * s.x, 1e-9);
    cerca(e0.E - e1.E, mu * m * g * s.x, 1e-6);
  });
  it('sin fricción, la energía con U_F se conserva', () => {
    const sim = simularMecanica({ duracion: 2, g: [0, 0], particulas: [{ id: 'P', m: 1, p: [0, 0], v: [0, 3], F: [2, 0] }] });
    cerca(energiaMecanica(sim, 2).E, energiaMecanica(sim, 0).E, 1e-9);
    cerca(estadoMecanica(sim, 2)[0].x, 2 * 4 / 2, 1e-9);
  });
});

describe('presupuesto de cálculo', () => {
  const pendulo = o => ({ duracion: 10, particulas: [{ id: 'P', m: 1, p: [Math.sin(1), -Math.cos(1)], v: [0, 0] }], conectores: [{ id: 'C', tipo: 'cuerda', a: 'P', ancla: [0, 0], L: 1 }], ...o });
  it('con el presupuesto de pasos agotado devuelve lo simulado y lo dice', () => {
    const sim = simularMecanica(pendulo({ maxPasos: 200 }));
    expect(sim.incompleta.motivo).toMatch(/límite de cálculo \(200 pasos\)/);
    expect(sim.tFin).toBeGreaterThan(0);
    expect(sim.tFin).toBeLessThan(10);
    // Lo simulado sigue siendo exacto hasta donde llega
    const s = estadoMecanica(sim, sim.tFin / 2)[0];
    cerca(Math.hypot(s.x, s.y), 1, 1e-9);
  });
  it('con el tiempo de reloj agotado también devuelve lo simulado', () => {
    const sim = simularMecanica(pendulo({ tiempoMax: 0 }));
    expect(sim.incompleta.motivo).toMatch(/tardaba demasiado/);
    expect(sim.tFin).toBeLessThan(10);
  });
  it('las escenas normales no se acercan al presupuesto', () => {
    const sim = simularMecanica(pendulo({}));
    expect(sim.incompleta).toBeNull();
  });
});

describe('extremos de las superficies', () => {
  it('un punto que llega justo al extremo de una pared choca con ella', () => {
    const sim = simularMecanica({ g: [0, 0], duracion: 3, particulas: [{ id: 'P', m: 1, p: [1, 0], v: [1, 0] }], superficies: [{ id: 'pared', tipo: 'segmento', a: [2, 0], b: [2, 0.5] }] });
    cerca(ev(sim, 'Choque con pared').t, 1, 1e-9);
    cerca(estadoMecanica(sim, 3)[0].x, 0, 1e-9);
  });
  it('una partícula que desliza por el suelo choca con la pared que arranca en él', () => {
    const sim = simularMecanica({
      duracion: 3, particulas: [{ id: 'P', m: 1, p: [1, 0], v: [1, 0] }],
      superficies: [{ id: 'suelo', tipo: 'segmento', a: [0, 0], b: [2, 0] }, { id: 'pared', tipo: 'segmento', a: [2, 0], b: [2, 0.5] }],
    });
    expect(sim.incompleta).toBeNull();
    const s = estadoMecanica(sim, 3)[0];
    cerca(s.x, 0, 1e-9);
    cerca(s.y, 0, 1e-9);
  });
  it('pasar por detrás de dos bordes en el mismo instante no atasca la simulación', () => {
    const sim = simularMecanica({
      duracion: 3, particulas: [{ id: 'P', m: 1, p: [2, 2], v: [0, 0] }],
      superficies: [{ id: 'a', tipo: 'segmento', a: [0, 0], b: [0, 1] }, { id: 'b', tipo: 'segmento', a: [1, 0], b: [1, 1] }],
    });
    expect(sim.incompleta).toBeNull();
    expect(sim.eventos).toEqual([]);
    cerca(estadoMecanica(sim, 3)[0].y, 2 - g * 9 / 2, 1e-9);
  });
});

describe('cuerda elástica (resorte que solo tira)', () => {
  it('MEXT 2010 1-F: soltada desde el suelo, sube hasta 45 cm y la energía se conserva', () => {
    // k = mg/0.10; oscila hasta el largo natural (30 cm sobre el suelo) con v² = k(0.2² − 0.1²)/m
    // y luego vuela v²/(2g) = 15 cm más: 45 cm
    const m = 0.5, k = m * g / 0.1, L0 = 0.5, yEq = -(L0 + 0.1), ySuelo = yEq - 0.2;
    const sim = simularMecanica({ duracion: 1.2, particulas: [{ id: 'P', m, p: [0, ySuelo], v: [0, 0] }], conectores: [{ id: 'goma', tipo: 'resorte', a: 'P', ancla: [0, 0], k, L0, soloTira: true }] });
    const floja = ev(sim, 'queda floja');
    expect(floja).toBeTruthy();
    cerca(floja.y[1], -L0, 1e-9);
    const v = Math.hypot(floja.y[2], floja.y[3]);
    cerca(v * v, k * (0.04 - 0.01) / m, 1e-8);
    const tMax = floja.t + v / g;
    cerca(estadoMecanica(sim, tMax)[0].y - ySuelo, 0.45, 1e-9);
    for (const t of [0.1, 0.5, 0.9, 1.2]) cerca(energiaMecanica(sim, t).E, energiaMecanica(sim, 0).E, 1e-8);
  });
  it('floja no empuja: comprimida no ejerce fuerza ni guarda energía', () => {
    const sim = simularMecanica({ g: [0, 0], duracion: 1, particulas: [{ id: 'P', m: 1, p: [0.3, 0], v: [0, 0] }], conectores: [{ id: 'goma', tipo: 'resorte', a: 'P', ancla: [0, 0], k: 50, L0: 1, soloTira: true }] });
    cerca(estadoMecanica(sim, 1)[0].x, 0.3, 1e-12);
    expect(energiaMecanica(sim, 1).Ue).toBe(0);
  });
});

describe('apoyos redundantes y complementariedad (LCP)', () => {
  const pared = (id, a, b, e = 0.3) => ({ id, tipo: 'segmento', a, b, e });
  const caja = W => [pared('s', [-W, 0], [W, 0]), pared('o', [-W, 2], [-W, 0]), pared('e', [W, 0], [W, 2])];
  const disco = (id, x, y) => ({ id, m: 1, p: [x, y], v: [0, 0], radio: 0.1 });
  /** Fila de discos de pared a pared y otra encima en los huecos (empaquetado hexagonal). */
  const hexagonal = W => {
    const n = Math.round(W / 0.1), P = [];
    for (let k = 0; k < n; k++) P.push(disco('a' + k, -W + 0.1 + 0.2 * k, 0.1));
    for (let k = 0; k < n - 1; k++) P.push(disco('b' + k, -W + 0.2 + 0.2 * k, 0.1 + 0.2 * Math.sqrt(3) / 2));
    return P;
  };
  const choques = sim => sim.eventos.filter(e => /^(choque|impacto):/.test(e.clave));

  it('resolverLCP cumple w = Az + q, z ≥ 0, w ≥ 0 y z·w = 0', () => {
    const A = [[2, 1], [1, 2]];
    // Una activa y otra suelta: z = (½, 0), w = (0, 3/2)
    const z = resolverLCP(A, [-1, 1]);
    cerca(z[0], 0.5, 1e-15); expect(z[1]).toBe(0);
    expect(resolverLCP(A, [1, 2])).toEqual([0, 0]);
    // Con una fila libre (bilateral): w₀ = 0 y z₀ de cualquier signo
    const zl = resolverLCP(A, [1, -1], [true, false]);
    cerca(zl[0], -1, 1e-14); cerca(zl[1], 1, 1e-14);
    // Matrices definidas positivas al azar (generador fijo): complementariedad
    let semilla = 7;
    const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let caso = 0; caso < 40; caso++) {
      const n = 2 + (caso % 7), B = Array.from({ length: n }, () => Array.from({ length: n }, azar));
      const M = B.map((f, i) => f.map((_, j) => B.reduce((s, fila) => s + fila[i] * fila[j], 0) + (i === j ? 0.1 : 0)));
      const q = Array.from({ length: n }, azar), zz = resolverLCP(M, q);
      const w = q.map((qi, i) => qi + M[i].reduce((s, a, j) => s + a * zz[j], 0));
      zz.forEach((zi, i) => {
        expect(zi).toBeGreaterThanOrEqual(0);
        expect(w[i]).toBeGreaterThanOrEqual(-1e-10);
        expect(Math.abs(zi * w[i])).toBeLessThan(1e-10);
      });
    }
  });

  it('empaquetado hexagonal de pared a pared en reposo: no se mueve ni genera choques', () => {
    // Las reacciones son indeterminadas (más apoyos que grados de libertad):
    // sin regularizar, la eliminación daba fuerzas arbitrarias que soltaban
    // apoyos cargados y el montón traqueteaba hasta agotar el cálculo.
    const P = hexagonal(1);
    const sim = simularMecanica({ duracion: 2, eParticulas: 0.3, superficies: caja(1), particulas: P });
    expect(sim.incompleta).toBeNull();
    expect(choques(sim)).toEqual([]);
    estadoMecanica(sim, 2).forEach((s, k) => {
      cerca(s.x, P[k].p[0], 1e-9); cerca(s.y, P[k].p[1], 1e-9);
      cerca(s.vx, 0, 1e-9); cerca(s.vy, 0, 1e-9);
    });
  });

  it('un disco que cae sobre el empaquetado: termina, en reposo y sin solapes', () => {
    const P = [...hexagonal(0.6), disco('c', 0.05, 0.9)];
    const sim = simularMecanica({ duracion: 1.5, eParticulas: 0.3, superficies: caja(0.6), particulas: P });
    expect(sim.incompleta).toBeNull();
    const S = estadoMecanica(sim, 1.5);
    expect(energiaMecanica(sim, 1.5).K).toBeLessThan(1e-9);
    for (const s of S) { expect(s.y).toBeGreaterThanOrEqual(0.1 - 1e-6); expect(Math.abs(s.x)).toBeLessThanOrEqual(0.5 + 1e-6); }
    for (let a = 0; a < S.length; a++) for (let b = a + 1; b < S.length; b++) {
      expect(Math.hypot(S[a].x - S[b].x, S[a].y - S[b].y)).toBeGreaterThanOrEqual(0.2 - 1e-6);
    }
  });

  it('un disco que cae en un hueco justo de su diámetro llega al fondo', () => {
    // Geometría casi tangente: con el disco a h del fondo, el hueco con sus
    // vecinos es solo h²/(4r). Un «contacto persistente» decidido por la
    // velocidad normal lo dejaba flotando milímetros por encima.
    const P = [];
    for (let k = 0; k < 10; k++) if (k !== 3) P.push(disco('d' + k, -0.9 + 0.2 * k, 0.1));
    P.push(disco('cae', -0.3, 0.6));
    const sim = simularMecanica({ duracion: 2, eParticulas: 0.3, superficies: caja(1), particulas: P });
    expect(sim.incompleta).toBeNull();
    const S = estadoMecanica(sim, 2), c = S[S.length - 1];
    cerca(c.y, 0.1, 1e-9); cerca(c.x, -0.3, 1e-9); cerca(c.vy, 0, 1e-9);
    S.slice(0, -1).forEach((s, k) => { cerca(s.y, 0.1, 1e-9); cerca(s.x, P[k].p[0], 1e-9); });
    const E0 = energiaMecanica(sim, 0).E, E1 = energiaMecanica(sim, 2).E;
    const disipada = sim.eventos.reduce((a, e) => a + e.perdida, 0);
    expect(Math.abs(E0 - E1 - disipada)).toBeLessThan(1e-6 * E0);
  });

  it('montón con umbral de contacto alto (0.03 y 0.1 m/s): termina en reposo sin atravesar nada', () => {
    for (const umbral of [0.03, 0.1]) {
      const sim = simularMecanica({
        duracion: 5, eParticulas: 0.3, superficies: caja(1), umbral,
        particulas: Array.from({ length: 10 }, (_, i) => ({ id: 'b' + i, m: 1, p: [-0.7 + (i % 5) * 0.35, 0.5 + Math.floor(i / 5) * 0.4], v: [Math.cos(i), 0], radio: 0.1 })),
      });
      expect(sim.incompleta, `umbral ${umbral}`).toBeNull();
      expect(sim.eventos.length).toBeLessThan(1000);
      expect(energiaMecanica(sim, 5).K).toBeLessThan(1e-9);
      for (let k = 0; k <= 100; k++) for (const s of estadoMecanica(sim, 5 * k / 100)) {
        expect(s.y).toBeGreaterThanOrEqual(0.1 - 1e-6);
        expect(Math.abs(s.x)).toBeLessThanOrEqual(0.9 + 1e-6);
      }
    }
  });
});

describe('energía disipada: continua (fricción, arrastre, amortiguadores) y en choques', () => {
  const pared = (id, a, b, e = 0.3, extra = {}) => ({ id, tipo: 'segmento', a, b, e, ...extra });
  /** max |E + Qc + Qi − E0| / E0 en 200 instantes */
  const balance = (sim, D) => {
    const E0 = energiaMecanica(sim, 0).E;
    let peor = 0;
    for (let k = 0; k <= 200; k++) { const e = energiaMecanica(sim, D * k / 200); peor = Math.max(peor, Math.abs(e.E + e.Qc + e.Qi - E0)); }
    return peor / Math.abs(E0);
  };

  it('fricción cinética: el bloque se detiene y toda su cinética queda como disipada continua', () => {
    const sim = simularMecanica({ duracion: 3, particulas: [{ id: 'B', m: 2, p: [0, 0], v: [3, 0] }], superficies: [pared('s', [-1, 0], [10, 0], 0, { mu: 0.2 })] });
    const e = energiaMecanica(sim, 3);
    cerca(e.Qc, 0.5 * 2 * 9, 1e-9);
    expect(e.Qi).toBe(0);
    // A mitad de camino: Qc = μ·m·g·d
    const t = 0.5, x = 3 * t - 0.5 * 0.2 * g * t * t;
    cerca(energiaMecanica(sim, t).Qc, 0.2 * 2 * g * x, 1e-9);
    expect(balance(sim, 3)).toBeLessThan(1e-12);
  });

  it('arrastre lineal: Qc = ½·m·v0²·(1 − e^(−2bt/m))', () => {
    const m = 1.5, b = 0.7, v02 = 17;
    const sim = simularMecanica({ duracion: 3, g: [0, 0], b, particulas: [{ id: 'P', m, p: [0, 0], v: [4, 1] }] });
    for (const t of [0.5, 1.7, 3]) cerca(energiaMecanica(sim, t).Qc, 0.5 * m * v02 * (1 - Math.exp(-2 * b * t / m)), 1e-9);
    expect(balance(sim, 3)).toBeLessThan(1e-9);
  });

  it('resorte con amortiguador: E + Qc se conserva', () => {
    const sim = simularMecanica({ duracion: 4, g: [0, 0], particulas: [{ id: 'P', m: 1, p: [1.5, 0], v: [0, 0] }], conectores: [{ id: 'r', tipo: 'resorte', a: 'P', ancla: [0, 0], k: 20, L0: 1, c: 0.8 }] });
    expect(energiaMecanica(sim, 4).Qc).toBeGreaterThan(2);
    expect(balance(sim, 4)).toBeLessThan(1e-9);
  });

  it('montón inelástico y bloque que baja por un plano con fricción y choca: el balance cierra exacto', () => {
    const monton = simularMecanica({
      duracion: 5, eParticulas: 0.3, superficies: [pared('s', [-1, 0], [1, 0]), pared('o', [-1, 2], [-1, 0]), pared('e', [1, 0], [1, 2])],
      particulas: Array.from({ length: 10 }, (_, i) => ({ id: 'b' + i, m: 1, p: [-0.7 + (i % 5) * 0.35, 0.5 + Math.floor(i / 5) * 0.4], v: [Math.cos(i), 0], radio: 0.1 })),
    });
    expect(balance(monton, 5)).toBeLessThan(1e-9);
    const plano = simularMecanica({
      duracion: 2, particulas: [{ id: 'B', m: 1, p: [0.1, 1.5 - 0.1 / Math.sqrt(3)], v: [0, 0] }],
      superficies: [pared('pl', [0, 1.5], [1.5 * Math.sqrt(3), 0], 0, { mu: 0.2 }), pared('s', [-1, 0], [8, 0], 0.5, { mu: 0.2 })],
    });
    const e = energiaMecanica(plano, 2);
    expect(e.Qc).toBeGreaterThan(0); expect(e.Qi).toBeGreaterThan(0);
    expect(balance(plano, 2)).toBeLessThan(1e-9);
  });
});

describe('superficies que se mueven: sobre un cuerpo o llevadas por un conductor cinemático', () => {
  const balance = (sim, D) => {
    const E0 = energiaMecanica(sim, 0).E;
    let peor = 0;
    for (let k = 0; k <= 200; k++) { const e = energiaMecanica(sim, D * k / 200); peor = Math.max(peor, Math.abs(e.E + e.Qc + e.Qi - e.W - E0)); }
    return peor / Math.max(1, Math.abs(E0));
  };

  it('bloque que desliza sobre una tabla libre (MEXT 2016 P3): velocidad común, tiempo y calor', () => {
    // m = 1 con v0 = 4 sobre M = 3 en reposo; fricción μ = 0.3 entre ellos y suelo liso
    const m = 1, M = 3, v0 = 4, mu = 0.3;
    const sim = simularMecanica({
      duracion: 2.5,
      particulas: [{ id: 'T', m: M, p: [0, 0], v: [0, 0] }, { id: 'B', m, p: [0, 0.1], v: [v0, 0] }],
      superficies: [
        { id: 'suelo', tipo: 'segmento', a: [-5, 0], b: [20, 0] },
        { id: 'tabla', tipo: 'segmento', a: [-0.5, 0.1], b: [3, 0.1], sobre: 'T', mu },
      ],
    });
    expect(sim.incompleta).toBeNull();
    const vf = m * v0 / (m + M), tf = (v0 - vf) / (mu * g);
    // Se pega a la tabla cuando las velocidades se igualan
    // El instante sale de la salida densa del integrador (rtol = 10⁻¹⁰): ≈ 10⁻⁸
    const pega = sim.eventos.find(e => e.clave.startsWith('vt0:'));
    cerca(pega.t, tf, 1e-8);
    for (const t of [0.3, 0.8, tf, 2.5]) {
      const [T, B] = estadoMecanica(sim, t);
      cerca(m * B.vx + M * T.vx, m * v0, 1e-9);      // el momento se conserva
      cerca(B.y, 0.1, 1e-9); cerca(T.y, 0, 1e-9);
    }
    const [T, B] = estadoMecanica(sim, 2.5);
    cerca(B.vx, vf, 1e-9); cerca(T.vx, vf, 1e-9);
    // Calor: μ·m·g por el deslizamiento relativo = ½·m·v0²·M/(m + M)
    cerca(energiaMecanica(sim, 2.5).Qc, 0.5 * m * v0 * v0 * M / (m + M), 1e-9);
    expect(balance(sim, 2.5)).toBeLessThan(1e-9);
  });

  it('una mano sube despacio un peso colgado de un resorte hasta el largo natural (MEXT 2006 1-(1)): W = m²g²/(2k)', () => {
    const m = 1, k = 50, v = 0.01, ext = m * g / k, y0 = 0.5 - ext;
    const sim = simularMecanica({
      duracion: ext / v,
      particulas: [
        { id: 'mano', m: 1, p: [0, y0], v: [0, v], cinematica: true },
        { id: 'P', m, p: [0, y0], v: [0, v] },
      ],
      superficies: [{ id: 'palma', tipo: 'segmento', a: [-0.1, 0], b: [0.1, 0], sobre: 'mano' }],
      conectores: [{ id: 'r', tipo: 'resorte', a: 'P', ancla: [0, 1], k, L0: 0.5 }],
    });
    expect(sim.incompleta).toBeNull();
    expect(sim.eventos).toEqual([]);
    const P = estadoMecanica(sim, ext / v)[1];
    cerca(P.y, 0.5, 1e-9); cerca(P.vy, v, 1e-9);
    cerca(energiaMecanica(sim, ext / v).W, m * m * g * g / (2 * k), 1e-9);
    expect(balance(sim, ext / v)).toBeLessThan(1e-9);
  });

  it('ascensor a velocidad constante: la normal es m·g y la cabina entrega m·g·Δy', () => {
    const sim = simularMecanica({
      duracion: 3,
      particulas: [{ id: 'cabina', m: 1, p: [0, 0], v: [0, 2], cinematica: true }, { id: 'B', m: 5, p: [0, 0], v: [0, 2] }],
      superficies: [{ id: 'piso', tipo: 'segmento', a: [-1, 0], b: [1, 0], sobre: 'cabina' }],
    });
    expect(sim.eventos).toEqual([]);
    cerca(estadoMecanica(sim, 3)[1].y, 6, 1e-9);
    cerca(energiaMecanica(sim, 3).W, 5 * g * 6, 1e-9);
    expect(balance(sim, 3)).toBeLessThan(1e-9);
  });

  it('una paleta cinemática golpea una bola: rebota con 2u más y el trabajo de la paleta es impulsivo', () => {
    // Bola a −3 m/s contra una paleta que avanza a +1 m/s, e = 1: sale a +5 m/s
    const sim = simularMecanica({
      duracion: 1, g: [0, 0],
      particulas: [{ id: 'paleta', m: 1, p: [0, 0], v: [1, 0], cinematica: true }, { id: 'bola', m: 2, p: [2, 0], v: [-3, 0] }],
      superficies: [{ id: 'cara', tipo: 'segmento', a: [0, 1], b: [0, -1], sobre: 'paleta', e: 1 }],
    });
    const choque = sim.eventos.find(e => e.clave.startsWith('impacto:'));
    cerca(choque.t, 0.5, 1e-12);
    cerca(estadoMecanica(sim, 1)[1].vx, 5, 1e-12);
    const e = energiaMecanica(sim, 1);
    cerca(e.W, 0.5 * 2 * (25 - 9), 1e-12);
    cerca(e.Qi, 0, 1e-12);
    expect(balance(sim, 1)).toBeLessThan(1e-12);
  });
});

describe('movimiento impuesto por tramos de aceleración (perfil)', () => {
  const balance = (sim, D) => {
    const E0 = energiaMecanica(sim, 0).E;
    let peor = 0;
    for (let k = 0; k <= 200; k++) { const e = energiaMecanica(sim, D * k / 200); peor = Math.max(peor, Math.abs(e.E + e.Qc + e.Qi - e.W - E0)); }
    return peor / Math.max(1, Math.abs(E0));
  };

  it('un cuerpo sigue una gráfica v–t por tramos: x es el área bajo la curva', () => {
    // Acelera 40 s a 1.25 m/s² (hasta 50 m/s) y frena igual otros 40 s: 2000 m
    const sim = simularMecanica({ duracion: 90, g: [0, 0], particulas: [{ id: 'C', m: 1, p: [0, 0], v: [0, 0], cinematica: true, perfil: [[40, 1.25, 0], [80, -1.25, 0]] }] });
    for (const [t, x, v] of [[20, 250, 25], [40, 1000, 50], [60, 1750, 25], [80, 2000, 0], [90, 2000, 0]]) {
      const s = estadoMecanica(sim, t)[0];
      cerca(s.x, x, 1e-9); cerca(s.vx, v, 1e-9);
    }
  });

  it('ascensor que arranca y frena: el bloque va pegado al piso y la cabina entrega m·g·Δy + ΔK', () => {
    const m = 5;
    const sim = simularMecanica({
      duracion: 7,
      particulas: [{ id: 'cabina', m: 1, p: [0, 0], v: [0, 0], cinematica: true, perfil: [[2, 0, 2], [5, 0, 0], [7, 0, -2]] }, { id: 'B', m, p: [0, 0], v: [0, 0] }],
      superficies: [{ id: 'piso', tipo: 'segmento', a: [-1, 0], b: [1, 0], sobre: 'cabina' }],
    });
    expect(sim.eventos).toEqual([]);
    // Mientras sube acelerando, la normal es m(g + a): W(2) = m(g + a)·Δy
    cerca(energiaMecanica(sim, 2).W, m * (g + 2) * 4, 1e-9);
    const B = estadoMecanica(sim, 7)[1];
    cerca(B.y, 20, 1e-9); cerca(B.vy, 0, 1e-9);
    cerca(energiaMecanica(sim, 7).W, m * g * 20, 1e-9);
    expect(balance(sim, 7)).toBeLessThan(1e-9);
  });

  it('si el ascensor frena más fuerte que g, el bloque se despega del piso en ese instante', () => {
    const sim = simularMecanica({
      duracion: 1.5,
      particulas: [{ id: 'cabina', m: 1, p: [0, 0], v: [0, 0], cinematica: true, perfil: [[1, 0, 2], [1.2, 0, -15]] }, { id: 'B', m: 1, p: [0, 0], v: [0, 0] }],
      superficies: [{ id: 'piso', tipo: 'segmento', a: [-1, 0], b: [1, 0], sobre: 'cabina' }],
    });
    const desp = sim.eventos.find(e => e.clave.startsWith('despegue:'));
    expect(desp).toBeDefined();
    cerca(desp.t, 1, 1e-12);
    // Después vuela libre: sube con 2 m/s y g
    const B = estadoMecanica(sim, 1.1)[1];
    cerca(B.vy, 2 - g * 0.1, 1e-9);
    expect(balance(sim, 1.5)).toBeLessThan(1e-9);
  });
});

describe('cuerpos cinemáticos y superficies fijas', () => {
  it('un cinemático sobre el suelo fijo lo atraviesa sin eventos ni reacciones', () => {
    const sim = simularMecanica({
      duracion: 3,
      particulas: [{ id: 'C', m: 1, p: [0, 0], v: [2, -1], cinematica: true }],
      superficies: [{ id: 'suelo', tipo: 'segmento', a: [-5, 0], b: [20, 0] }],
    });
    expect(sim.incompleta).toBeNull();
    expect(sim.eventos).toEqual([]);
    const s = estadoMecanica(sim, 3)[0];
    cerca(s.x, 6, 1e-12); cerca(s.y, -3, 1e-12);
  });
});

describe('prensa hidráulica (Pascal)', () => {
  const prensa = (extra = {}) => ({
    duracion: 2,
    particulas: [{ id: 'A', m: 1, p: [0, 0], v: [0, 0], ...extra.A }, { id: 'B', m: 4, p: [2, 0], v: [0, 0], ...extra.B }],
    conectores: [{ id: 'P', tipo: 'prensa', a: 'A', b: 'B', n: 4 }],
  });
  it('con pesos proporcionales a las áreas, los émbolos quedan en equilibrio', () => {
    const sim = simularMecanica(prensa());
    const [A, B] = estadoMecanica(sim, 2);
    cerca(A.y, 0, 1e-9); cerca(B.y, 0, 1e-9);
  });
  it('si A baja h, B sube h/n; y F sobre A se equilibra con n·F sobre B (MEXT 2010 1-A)', () => {
    // Equilibrio con F = 5 N sobre A y 4·5 = 20 N sobre B: A baja a 0.3 m/s y B sube a 0.3/4
    const sim = simularMecanica(prensa({ A: { v: [0, -0.3], F: [0, -5] }, B: { v: [0, 0.3 / 4], F: [0, -20] } }));
    const [A, B] = estadoMecanica(sim, 2);
    cerca(A.y, -0.6, 1e-9); cerca(B.y, 0.6 / 4, 1e-9);
    cerca(A.vy, -0.3, 1e-9); cerca(B.vy, 0.3 / 4, 1e-9);
    // Sin la fuerza sobre B, el sistema acelera: lo que equilibra es exactamente n·F
    const libre = simularMecanica(prensa({ A: { F: [0, -5] } }));
    expect(estadoMecanica(libre, 1)[0].y).toBeLessThan(-0.1);
  });
  it('una velocidad inicial dada a un solo émbolo se reparte como un impulso por el líquido', () => {
    const sim = simularMecanica(prensa({ A: { v: [0, -1] } }));
    const [A, B] = estadoMecanica(sim, 0);
    cerca(A.vy + 4 * B.vy, 0, 1e-12);
    // Impulso P a lo largo de (1, n)/m: vA = −1 + P/mA, vB = n·P/mB
    const P = 1 / (1 / 1 + 16 / 4);
    cerca(A.vy, -1 + P, 1e-12); cerca(B.vy, 4 * P / 4, 1e-12);
  });
  it('la energía se conserva (el líquido no disipa)', () => {
    const sim = simularMecanica(prensa({ A: { v: [0, 1] } }));
    const E0 = energiaMecanica(sim, 0).E;
    cerca(energiaMecanica(sim, 1.5).E, E0, 1e-9);
  });
});

describe('discos que giran: rodadura y fricción en el punto de contacto', () => {
  const rad = Math.PI / 180;
  /** Plano que baja hacia la derecha con ángulo φ y un disco apoyado en él a s0 del extremo superior. */
  const plano = ({ phi = 30 * rad, mu = 0.8, k = 0.5, r = 0.1, m = 2, s0 = 0.2, L = 6, dur = 1 } = {}) => {
    const t = [Math.cos(phi), -Math.sin(phi)], n = [Math.sin(phi), Math.cos(phi)];
    return {
      duracion: dur,
      superficies: [{ id: 'S', tipo: 'segmento', a: [0, 0], b: [L * t[0], L * t[1]], e: 0, mu }],
      particulas: [{ id: 'D', m, radio: r, inercia: k, p: [s0 * t[0] + r * n[0], s0 * t[1] + r * n[1]], v: [0, 0] }],
    };
  };
  const recorrido = (s, phi) => s.x * Math.cos(phi) - s.y * Math.sin(phi);

  it('rueda sin deslizar por un plano: a = g·senφ/(1 + k), ω = −v/r y la energía se conserva', () => {
    const phi = 30 * rad, k = 0.5, r = 0.1, sim = simularMecanica(plano({ phi, k, r }));
    const a = g * Math.sin(phi) / (1 + k), d0 = recorrido(estadoMecanica(sim, 0)[0], phi);
    for (const t of [0.3, 0.6, 1]) {
      const s = estadoMecanica(sim, t)[0];
      cerca(recorrido(s, phi) - d0, a * t * t / 2, 1e-8);
      cerca(s.w, -a * t / r, 1e-7);
      cerca(s.th, -a * t * t / (2 * r), 1e-7);
    }
    const E0 = energiaMecanica(sim, 0).E, e = energiaMecanica(sim, 1);
    cerca(e.E, E0, 1e-8);
    expect(e.Qc).toBeLessThan(1e-8);
    // La energía de rotación es k/(1 + k) de la cinética
    cerca(e.Kr / e.K, k / (1 + k), 1e-7);
    expect(sim.eventos.some(x => x.nombre.includes('desliza'))).toBe(false);
  });

  it('con μs < tanφ·k/(1 + k) desliza girando: a = g(senφ − μ cosφ), α = μ·g·cosφ/(k·r), y Qc = μN·deslizamiento', () => {
    const phi = 30 * rad, k = 0.5, r = 0.1, m = 2, mu = 0.1;   // umbral: tan30°/3 ≈ 0.19
    const sim = simularMecanica(plano({ phi, k, r, m, mu }));
    const a = g * (Math.sin(phi) - mu * Math.cos(phi)), al = mu * g * Math.cos(phi) / (k * r);
    const d0 = recorrido(estadoMecanica(sim, 0)[0], phi);
    for (const t of [0.4, 1]) {
      const s = estadoMecanica(sim, t)[0];
      cerca(recorrido(s, phi) - d0, a * t * t / 2, 1e-8);
      cerca(s.w, -al * t, 1e-7);
    }
    // Deslizamiento acumulado: ∫(v + rω) dt = ½(a − r·α)t²
    const e = energiaMecanica(sim, 1), N = m * g * Math.cos(phi);
    cerca(e.Qc, mu * N * 0.5 * (a - r * al), 1e-7);
    cerca(e.E + e.Qc + e.Qi, energiaMecanica(sim, 0).E, 1e-9);
  });

  it('bola de bolos: desliza y acaba rodando a 5/7 de v0 en t = 2v0/(7μg), perdiendo 2/7 de la energía', () => {
    const m = 6, r = 0.11, v0 = 5, mu = 0.2, k = 2 / 5;
    const sim = simularMecanica({
      duracion: 3,
      superficies: [{ id: 'pista', tipo: 'segmento', a: [-1, 0], b: [30, 0], e: 0, mu }],
      particulas: [{ id: 'B', m, radio: r, inercia: k, p: [0, r], v: [v0, 0] }],
    });
    const tr = 2 * v0 / (7 * mu * g), rueda = ev(sim, 'Rueda sin deslizar');
    expect(rueda).toBeTruthy();
    cerca(rueda.t, tr, 1e-8);
    const s = estadoMecanica(sim, 3)[0];
    cerca(s.vx, 5 / 7 * v0, 1e-8);
    cerca(s.w, -5 / 7 * v0 / r, 1e-7);
    const e = energiaMecanica(sim, 3);
    cerca(e.Qc, 0.5 * m * v0 * v0 * 2 / 7, 1e-7);
    cerca(e.E + e.Qc + e.Qi, energiaMecanica(sim, 0).E, 1e-9);
  });

  it('con efecto hacia atrás vuelve: v_f = (v0 − k·r·ω0)/(1 + k), y el momento angular respecto del suelo se conserva', () => {
    const m = 0.2, r = 0.1, v0 = 2, w0 = 100, mu = 0.3, k = 2 / 5;
    const sim = simularMecanica({
      duracion: 2,
      superficies: [{ id: 'suelo', tipo: 'segmento', a: [-20, 0], b: [20, 0], e: 0, mu }],
      particulas: [{ id: 'B', m, radio: r, inercia: k, p: [0, r], v: [v0, 0], w: w0 }],
    });
    const s = estadoMecanica(sim, 2)[0], vf = (v0 - k * r * w0) / (1 + k);
    cerca(s.vx, vf, 1e-8);
    expect(s.vx).toBeLessThan(0);
    // L respecto de un punto del suelo: −m·v·r + I·ω (la fricción pasa por él)
    const L = q => -m * q.vx * r + k * m * r * r * q.w;
    cerca(L(s), L(estadoMecanica(sim, 0)[0]), 1e-9);
  });

  it('rueda dentro de un cuenco: péndulo de largo (R − r)(1 + k), periodo exacto 4·√(L/g)·K(sen(φ0/2))', () => {
    const R = 1, r = 0.1, k = 0.5, f0 = 0.5, Lef = (R - r) * (1 + k);
    const T = 4 * Math.sqrt(Lef / g) * elipticaK(Math.sin(f0 / 2));
    const sim = simularMecanica({
      duracion: T,
      superficies: [{ id: 'cuenco', tipo: 'arco', c: [0, R], r: R, cara: 'interior', e: 0, mu: 0.9 }],
      particulas: [{ id: 'D', m: 1, radio: r, inercia: k, p: [(R - r) * Math.sin(f0), R - (R - r) * Math.cos(f0)], v: [0, 0] }],
    });
    expect(sim.incompleta).toBeNull();
    const x0 = (R - r) * Math.sin(f0);
    cerca(estadoMecanica(sim, T / 2)[0].x, -x0, 1e-6);
    cerca(estadoMecanica(sim, T)[0].x, x0, 1e-6);
    const E0 = energiaMecanica(sim, 0).E;
    for (const t of [T / 4, T / 2, T]) cerca(energiaMecanica(sim, t).E, E0, 1e-8);
  });

  it('sin fricción no gira; en el aire gira con ω constante', () => {
    const phi = 30 * rad, sim = simularMecanica(plano({ phi, mu: 0 }));
    const s = estadoMecanica(sim, 1)[0];
    expect(s.w).toBe(0);
    const d0 = recorrido(estadoMecanica(sim, 0)[0], phi);
    cerca(recorrido(s, phi) - d0, g * Math.sin(phi) / 2, 1e-8);
    const aire = simularMecanica({ duracion: 1, particulas: [{ id: 'D', m: 1, radio: 0.1, inercia: 0.5, p: [0, 10], v: [1, 0], w: 3, theta: 0.2 }] });
    const q = estadoMecanica(aire, 1)[0];
    cerca(q.w, 3, 1e-12); cerca(q.th, 3.2, 1e-10);
  });

  it('una partícula sin inercia o sin radio no gira (como antes)', () => {
    const sim = simularMecanica({ duracion: 0.5, particulas: [{ id: 'P', m: 1, inercia: 0.5, p: [0, 1], v: [1, 0] }] });
    expect(sim.S.rot[0]).toBe(-1);
    const s = estadoMecanica(sim, 0.5)[0];
    expect(s.w).toBe(0); expect(s.th).toBe(0);
  });
});

describe('bloques rígidos: rectángulos que giran y se apoyan por sus vértices', () => {
  const rad = Math.PI / 180;
  /** Bloque de ancho a y alto h apoyado de plano en un plano de ángulo φ que baja hacia la derecha. */
  const enPlano = ({ phi = 20 * rad, mu = 0.8, a = 0.4, h = 0.2, m = 2, s0 = 1, dur = 1 } = {}) => {
    const t = [Math.cos(phi), -Math.sin(phi)], n = [Math.sin(phi), Math.cos(phi)];
    return {
      duracion: dur,
      superficies: [{ id: 'S', tipo: 'segmento', a: [0, 0], b: [6 * t[0], 6 * t[1]], e: 0, mu }],
      particulas: [{ id: 'B', m, forma: 'bloque', ancho: a, alto: h, theta: -phi, p: [s0 * t[0] + h / 2 * n[0], s0 * t[1] + h / 2 * n[1]], v: [0, 0] }],
    };
  };

  it('quieto sobre el suelo: dos apoyos, sin eventos, y las normales suman m·g', () => {
    const sim = simularMecanica({ duracion: 1, superficies: [{ id: 'suelo', tipo: 'segmento', a: [-2, 0], b: [2, 0], e: 0, mu: 0.5 }], particulas: [{ id: 'B', m: 3, forma: 'bloque', ancho: 0.5, alto: 0.3, p: [0.2, 0.15], v: [0, 0] }] });
    expect(sim.eventos).toEqual([]);
    expect(Object.keys(sim.tramos[0].modo.contactos).sort()).toEqual(['0.0:0', '0.1:0']);
    const s = estadoMecanica(sim, 1)[0];
    cerca(s.y, 0.15, 1e-10); cerca(s.x, 0.2, 1e-10); cerca(s.th, 0, 1e-10);
  });

  it('desliza por el plano sin girar: a = g(senφ − μ cosφ)', () => {
    const phi = 30 * rad, mu = 0.2, sim = simularMecanica(enPlano({ phi, mu }));
    const s0 = estadoMecanica(sim, 0)[0], s = estadoMecanica(sim, 1)[0];
    const d = (s.x - s0.x) * Math.cos(phi) - (s.y - s0.y) * Math.sin(phi);
    cerca(d, g * (Math.sin(phi) - mu * Math.cos(phi)) / 2, 1e-8);
    cerca(s.th, -phi, 1e-9); cerca(s.w, 0, 1e-9);
    cerca(energiaMecanica(sim, 1).E + energiaMecanica(sim, 1).Qc, energiaMecanica(sim, 0).E, 1e-9);
  });

  it('con fricción alta, un bloque ancho se queda quieto y uno alto vuelca (tan φ > a/h)', () => {
    const phi = 20 * rad;    // tan 20° ≈ 0.364
    const ancho = simularMecanica(enPlano({ phi, a: 0.4, h: 0.4 }));
    const qa = estadoMecanica(ancho, 1)[0];
    cerca(qa.th, -phi, 1e-9); cerca(qa.w, 0, 1e-9);
    const alto = simularMecanica(enPlano({ phi, a: 0.2, h: 0.8, dur: 0.6 }));
    const qb = estadoMecanica(alto, 0.6)[0];
    expect(qb.th).toBeLessThan(-phi - 0.05);      // gira hacia abajo del plano
    // Desde el principio solo se apoya en el vértice de abajo: el de arriba se suelta (λ < 0 en el LCP)
    const tr = alto.tramos.find(x => x.t0 <= 0.3 && 0.3 <= x.t1);
    expect(Object.keys(tr.modo.contactos)).toEqual(['0.1:0']);
  });

  it('vuelco sobre una arista: el vértice no se mueve y ½·I_p·ω² = m·g·(h₀ − h)', () => {
    // Bloque de 0.2 × 0.6 apoyado en su vértice derecho (0, 0), inclinado 25°: el centro pasa del pivote
    const a = 0.2, h = 0.6, m = 1, th0 = -25 * rad, Ip = m * (a * a + h * h) / 12 + m * (a * a + h * h) / 4;
    const c = Math.cos(th0), sn = Math.sin(th0), pc = [-(c * a / 2 - sn * -h / 2), -(sn * a / 2 + c * -h / 2)];
    const sim = simularMecanica({
      duracion: 0.4,
      superficies: [{ id: 'suelo', tipo: 'segmento', a: [-3, 0], b: [3, 0], e: 0, mu: 2 }],
      particulas: [{ id: 'B', m, forma: 'bloque', ancho: a, alto: h, theta: th0, p: pc, v: [0, 0] }],
    });
    expect(Object.keys(sim.tramos[0].modo.contactos)).toEqual(['0.1:0']);
    for (const t of [0.1, 0.2, 0.3]) {
      const s = estadoMecanica(sim, t)[0];
      // Vértice 1 (abajo a la derecha) sigue en el origen
      const vx = s.x + Math.cos(s.th) * a / 2 - Math.sin(s.th) * -h / 2, vy = s.y + Math.sin(s.th) * a / 2 + Math.cos(s.th) * -h / 2;
      cerca(vx, 0, 1e-8); cerca(vy, 0, 1e-8);
      cerca(0.5 * Ip * s.w * s.w, m * g * (pc[1] - s.y), 1e-8);
    }
  });

  it('cae de plano sobre el suelo: choque inelástico de los dos vértices, queda en reposo y el balance cierra', () => {
    const sim = simularMecanica({
      duracion: 1, superficies: [{ id: 'suelo', tipo: 'segmento', a: [-2, 0], b: [2, 0], e: 0, mu: 0.5 }],
      particulas: [{ id: 'B', m: 2, forma: 'bloque', ancho: 0.4, alto: 0.2, p: [0, 0.6], v: [0, 0] }],
    });
    expect(sim.incompleta).toBeNull();
    const s = estadoMecanica(sim, 1)[0];
    cerca(s.y, 0.1, 1e-8); cerca(s.vy, 0, 1e-9); cerca(s.th, 0, 1e-9);
    const e = energiaMecanica(sim, 1);
    cerca(e.Qi, 2 * g * 0.5, 1e-8);
    cerca(e.E + e.Qc + e.Qi, energiaMecanica(sim, 0).E, 1e-9);
  });

  it('cae girando sobre una esquina y rebota: el balance de energía cierra', () => {
    const sim = simularMecanica({
      duracion: 1.5, superficies: [{ id: 'suelo', tipo: 'segmento', a: [-3, 0], b: [3, 0], e: 0.5, mu: 0.4 }],
      particulas: [{ id: 'B', m: 1, forma: 'bloque', ancho: 0.3, alto: 0.2, theta: 0.4, w: 3, p: [0, 0.8], v: [0.5, 0] }],
    });
    expect(sim.incompleta).toBeNull();
    for (const t of [0.5, 1, 1.5]) {
      const e = energiaMecanica(sim, t);
      cerca(e.E + e.Qc + e.Qi, energiaMecanica(sim, 0).E, 1e-7);
    }
    // Nunca atraviesa el suelo
    for (let k = 0; k <= 60; k++) {
      const s = estadoMecanica(sim, k * 0.025)[0];
      for (const [vx, vy] of [[-0.15, -0.1], [0.15, -0.1], [0.15, 0.1], [-0.15, 0.1]]) expect(s.y + Math.sin(s.th) * vx + Math.cos(s.th) * vy).toBeGreaterThan(-1e-5);
    }
  });
});

describe('fuerza aplicada en un punto del cuerpo: volcar o deslizar', () => {
  // Bloque de 0.4 × 0.6 en el suelo con μ = 0.8, empujado a la derecha por el
  // borde de arriba a la izquierda (b = (−a/2, h/2)). Vuelca si F·h ≥ m·g·a/2
  // (F ≥ 3.27 N) y desliza si F > μ·m·g (7.84 N)
  const empuje = (F, mu = 0.8, dur = 0.6) => simularMecanica({
    duracion: dur, superficies: [{ id: 'suelo', tipo: 'segmento', a: [-3, 0], b: [3, 0], e: 0, mu }],
    particulas: [{ id: 'B', m: 1, forma: 'bloque', ancho: 0.4, alto: 0.6, p: [0, 0.3], v: [0, 0], F: [F, 0], Fpunto: [-0.2, 0.3] }],
  });
  it('por debajo del umbral, quieto sobre sus dos vértices', () => {
    const sim = empuje(3);
    expect(sim.eventos).toEqual([]);
    const s = estadoMecanica(sim, 0.6)[0];
    cerca(s.x, 0, 1e-10); cerca(s.th, 0, 1e-10);
  });
  it('por encima del umbral de vuelco y del de deslizamiento no: gira sobre la arista de delante y la energía se conserva', () => {
    // Hasta t ≈ 0.39 s: después la arista ya no aguanta (la fricción necesaria crece al volcar) y desliza
    const sim = empuje(5);
    expect(ev(sim, 'Empieza a deslizar').t).toBeGreaterThan(0.38);
    const s = estadoMecanica(sim, 0.3)[0];
    expect(s.th).toBeLessThan(-0.05);
    // La arista de delante (vértice 1) no se mueve
    const vx = s.x + Math.cos(s.th) * 0.2 - Math.sin(s.th) * -0.3, vy = s.y + Math.sin(s.th) * 0.2 + Math.cos(s.th) * -0.3;
    cerca(vx, 0.2, 1e-8); cerca(vy, 0, 1e-8);
    const E0 = energiaMecanica(sim, 0).E;
    for (const t of [0.1, 0.2, 0.3]) { const e = energiaMecanica(sim, t); cerca(e.E + e.Qc + e.Qi, E0, 1e-8); expect(e.Qc).toBeLessThan(1e-8); }
  });
  it('justo en el umbral de vuelco el par de F equilibra al del peso respecto de la arista', () => {
    // F·h = m·g·a/2 → F = m·g·a/(2h); un poco menos: quieto; un poco más: gira
    const Fc = 9.8 * 0.4 / (2 * 0.6);
    expect(Math.abs(estadoMecanica(empuje(Fc * 0.99), 0.6)[0].th)).toBeLessThan(1e-9);
    expect(estadoMecanica(empuje(Fc * 1.02, 0.8, 0.6), 0.6)[0].th).toBeLessThan(-1e-3);
  });
  it('con poca fricción desliza sin volcar si el empuje va a la altura del centro', () => {
    const sim = simularMecanica({
      duracion: 0.5, superficies: [{ id: 'suelo', tipo: 'segmento', a: [-3, 0], b: [3, 0], e: 0, mu: 0.2 }],
      particulas: [{ id: 'B', m: 1, forma: 'bloque', ancho: 0.4, alto: 0.6, p: [0, 0.3], v: [0, 0], F: [5, 0], Fpunto: [-0.2, 0] }],
    });
    const s = estadoMecanica(sim, 0.5)[0];
    cerca(s.x, (5 - 0.2 * 9.8) / 2 * 0.25, 1e-8);
    cerca(s.th, 0, 1e-9);
  });
});

describe('caras de los bloques: apilar, chocar con discos', () => {
  const suelo = (mu = 0.6) => ({ id: 'suelo', tipo: 'segmento', a: [-3, 0], b: [3, 0], e: 0, mu });
  it('dos bloques apilados quedan quietos: el de arriba se apoya en la cara del de abajo', () => {
    const sim = simularMecanica({
      duracion: 1, muCuerpos: 0.5, eParticulas: 0, superficies: [suelo()],
      particulas: [
        { id: 'A', m: 2, forma: 'bloque', ancho: 0.6, alto: 0.3, p: [0, 0.15], v: [0, 0] },
        { id: 'B', m: 1, forma: 'bloque', ancho: 0.3, alto: 0.2, p: [0.1, 0.4], v: [0, 0] },
      ],
    });
    expect(sim.eventos).toEqual([]);
    const claves = Object.keys(sim.tramos[0].modo.contactos).sort();
    // B (índice 1) apoya sus vértices 0 y 1 en la cara de arriba de A (cara 2: superficie 1 + 2 = 3)
    expect(claves).toEqual(['0.0:0', '0.1:0', '1.0:3', '1.1:3']);
    const [A, B] = estadoMecanica(sim, 1);
    cerca(A.y, 0.15, 1e-10); cerca(B.y, 0.4, 1e-10); cerca(B.th, 0, 1e-10);
  });

  it('un bloque que cae sobre otro: choque inelástico, quedan apilados y el balance cierra', () => {
    const sim = simularMecanica({
      duracion: 1, muCuerpos: 0.5, eParticulas: 0, superficies: [suelo()],
      particulas: [
        { id: 'A', m: 2, forma: 'bloque', ancho: 0.6, alto: 0.3, p: [0, 0.15], v: [0, 0] },
        { id: 'B', m: 1, forma: 'bloque', ancho: 0.3, alto: 0.2, p: [0.1, 0.8], v: [0, 0] },
      ],
    });
    expect(sim.incompleta).toBeNull();
    const [A, B] = estadoMecanica(sim, 1);
    cerca(A.y, 0.15, 1e-8); cerca(B.y, 0.4, 1e-7); cerca(B.vy, 0, 1e-8);
    const e = energiaMecanica(sim, 1);
    cerca(e.E + e.Qc + e.Qi, energiaMecanica(sim, 0).E, 1e-8);
    // Toda la cinética de B al llegar (m·g·0.4) se pierde en el choque
    cerca(e.Qi, 1 * 9.8 * 0.4, 1e-6);
  });

  it('un disco choca de frente con un bloque libre (sin fricción): se conservan el momento y la energía', () => {
    const sim = simularMecanica({
      g: [0, 0], duracion: 1, eParticulas: 1,
      particulas: [
        { id: 'D', m: 1, radio: 0.1, p: [-1, 0], v: [2, 0] },
        { id: 'B', m: 3, forma: 'bloque', ancho: 0.4, alto: 0.4, p: [0.5, 0], v: [0, 0] },
      ],
    });
    expect(ev(sim, 'Choque')).toBeTruthy();
    const [D, B] = estadoMecanica(sim, 1);
    // Choque central elástico 1D: v_D = (1 − 3)/4·2 = −1, v_B = 2·1/4·2 = 1; sin giro
    cerca(D.vx, -1, 1e-9); cerca(B.vx, 1, 1e-9); cerca(B.w, 0, 1e-9);
    cerca(energiaMecanica(sim, 1).E, energiaMecanica(sim, 0).E, 1e-9);
  });

  it('un disco que golpea un bloque fuera del centro lo hace girar y conserva el momento angular', () => {
    const sim = simularMecanica({
      g: [0, 0], duracion: 1, eParticulas: 1,
      particulas: [
        { id: 'D', m: 1, radio: 0.05, p: [-1, 0.15], v: [2, 0] },
        { id: 'B', m: 2, forma: 'bloque', ancho: 0.4, alto: 0.4, p: [0.5, 0], v: [0, 0] },
      ],
    });
    const L = est => est.reduce((s, q, k) => s + [1, 2][k] * (q.x * q.vy - q.y * q.vx), 0) + 2 * (0.16 + 0.16) / 12 * est[1].w;
    const [D, B] = estadoMecanica(sim, 1);
    expect(B.w).toBeLessThan(-0.1);    // empuje a la derecha por encima del centro: gira en sentido horario
    cerca(D.vx * 1 + B.vx * 2, 2, 1e-9);
    cerca(L(estadoMecanica(sim, 1)), L(estadoMecanica(sim, 0)), 1e-9);
    cerca(energiaMecanica(sim, 1).E, energiaMecanica(sim, 0).E, 1e-9);
  });
});

describe('fricción entre discos que giran', () => {
  // Dos discos sin gravedad, apretados por un resorte entre sus centros (su
  // largo natural es menor que la suma de radios). A gira y B no: la
  // fricción en el contacto los acopla hasta que ruedan uno sobre otro
  const par = ({ mu = 0.4, wA = 20, inB = 0.5 } = {}) => simularMecanica({
    g: [0, 0], duracion: 2, muCuerpos: mu, eParticulas: 0,
    particulas: [
      { id: 'A', m: 1, radio: 0.1, inercia: 0.5, p: [-0.1, 0], v: [0, 0], w: wA },
      { id: 'B', m: 2, radio: 0.1, inercia: inB, p: [0.1, 0], v: [0, 0] },
    ],
    conectores: [{ id: 'R', tipo: 'resorte', a: 'A', b: 'B', k: 200, L0: 0.15 }],
  });
  const momentoAngular = (sim, t) => {
    const e = estadoMecanica(sim, t), m = [1, 2], I = [0.5 * 1 * 0.01, 0.5 * 2 * 0.01];
    return e.reduce((s, q, k) => s + m[k] * (q.x * q.vy - q.y * q.vx) + I[k] * q.w, 0);
  };
  it('se apoyan uno en otro con fricción y acaban rodando sin deslizar', () => {
    const sim = par();
    expect(sim.incompleta).toBeNull();
    expect(typeof sim.tramos[0].modo.pares['0:1']).toBe('object');
    expect(ev(sim, 'Ruedan sin deslizar')).toBeTruthy();
  });
  it('conservan el momento lineal y el angular, y E + Qc = E0', () => {
    const sim = par();
    for (const t of [0.2, 1, 2]) {
      const e = estadoMecanica(sim, t);
      cerca(1 * e[0].vx + 2 * e[1].vx, 0, 1e-9); cerca(1 * e[0].vy + 2 * e[1].vy, 0, 1e-9);
      cerca(momentoAngular(sim, t), momentoAngular(sim, 0), 1e-9);
      const en = energiaMecanica(sim, t);
      cerca(en.E + en.Qc + en.Qi, energiaMecanica(sim, 0).E, 1e-9);
    }
    // Rodando, ya no se disipa nada
    const r = ev(sim, 'Ruedan sin deslizar').t;
    cerca(energiaMecanica(sim, 2).Qc, energiaMecanica(sim, r + 0.01).Qc, 1e-9);
    expect(energiaMecanica(sim, 2).Qc).toBeGreaterThan(1e-3);
  });
  it('sin giro en ninguno de los dos, el par sigue sin fricción (como antes)', () => {
    const sim = par({ wA: 0, inB: 0 });
    // A tampoco gira si su inercia es 0
    const sin = simularMecanica({
      g: [0, 0], duracion: 0.5, muCuerpos: 0.4,
      particulas: [{ id: 'A', m: 1, radio: 0.1, p: [-0.1, 0], v: [0, 0.5] }, { id: 'B', m: 2, radio: 0.1, p: [0.1, 0], v: [0, 0] }],
      conectores: [{ id: 'R', tipo: 'resorte', a: 'A', b: 'B', k: 200, L0: 0.15 }],
    });
    expect(sin.tramos[0].modo.pares['0:1']).toBe(true);
    expect(sim.incompleta).toBeNull();
  });
});

describe('fuerzas que cambian con el tiempo', () => {
  // Masa en un resorte horizontal (sin gravedad) con arrastre b: ω0 = 2π rad/s
  const forzado = (f, duracion = 40) => simularMecanica({
    g: [0, 0], b: 0.5, duracion,
    particulas: [{ id: 'P', m: 1, p: [1, 0], v: [0, 0], F: [1, 0], Fvar: { forma: 'seno', f } }],
    conectores: [{ id: 'R', tipo: 'resorte', a: 'P', ancla: [0, 0], k: 4 * Math.PI ** 2, L0: 1 }],
  });
  /** Amplitud del régimen estacionario: el máximo de |x − 1| en los dos últimos segundos. */
  const amplitud = (sim, T) => { let a = 0; for (let t = T - 2; t <= T; t += 0.005) a = Math.max(a, Math.abs(estadoMecanica(sim, t)[0].x - 1)); return a; };
  it('resonancia: la amplitud estacionaria es F0/√((k − mω²)² + (bω)²)', () => {
    for (const f of [1, 2, 0.5]) {
      const w = 2 * Math.PI * f, k = 4 * Math.PI ** 2, A = 1 / Math.hypot(k - w * w, 0.5 * w);
      cerca(amplitud(forzado(f), 40), A, 0.01 * A);
    }
  });
  it('el trabajo de la fuerza entra como W: E + Q − W se conserva', () => {
    const sim = forzado(1, 10), e0 = energiaMecanica(sim, 0);
    expect(e0.UF).toBe(0);
    for (const t of [2.5, 5, 7.5, 10]) {
      const e = energiaMecanica(sim, t);
      cerca(e.E + e.Qc + e.Qi - e.W, e0.E, 1e-7);
    }
    expect(energiaMecanica(sim, 10).W).toBeGreaterThan(1);
  });
  it('un pulso de 2 N durante 0.5 s deja a 1 kg con 1 m/s y le entrega 0.5 J', () => {
    const sim = simularMecanica({ g: [0, 0], duracion: 3, particulas: [{ id: 'P', m: 1, p: [0, 0], v: [0, 0], F: [2, 0], Fvar: { forma: 'pulso', t0: 1, t1: 1.5 } }] });
    expect(estadoMecanica(sim, 0.99)[0].x).toBe(0);
    cerca(estadoMecanica(sim, 1.25)[0].vx, 0.5, 1e-9);
    cerca(estadoMecanica(sim, 3)[0].vx, 1, 1e-9);
    cerca(estadoMecanica(sim, 3)[0].x, 0.25 + 1.5, 1e-9);
    cerca(energiaMecanica(sim, 3).W, 0.5, 1e-9);
  });
});
