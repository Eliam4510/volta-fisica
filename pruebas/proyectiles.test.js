// Exactitud física del motor de proyectiles contra soluciones analíticas.
import { describe, it, expect } from 'vitest';
import { simularProyectil, estadoEn, energiaEn, raices } from '../sistema/motores/proyectiles.js';

const g = 9.8, grados = d => d * Math.PI / 180;
const cerca = (a, b, rel = 1e-12) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b)));

describe('raices', () => {
  it('resuelve cuadráticas sin cancelación catastrófica', () => {
    const [r1, r2] = raices(1, -1e8, 1);    // raíces ~1e-8 y ~1e8
    cerca(r1, 1e-8, 1e-9);
    cerca(r2, 1e8, 1e-12);
  });
  it('resuelve el caso lineal', () => {
    expect(raices(0, 2, -4)).toEqual([2]);
  });
  it('no devuelve raíces complejas', () => {
    expect(raices(1, 0, 1)).toEqual([]);
  });
});

describe('MEXT 2019 P3: salto horizontal hacia una pendiente', () => {
  const h = 3, th = grados(35), v = 4;
  const sim = simularProyectil({ h, theta: th, v0: v, e: 0.5, g, masa: 0.5, duracion: 2.4 });
  const choque = sim.eventos.find(e => e.nombre === 'Choque con la pendiente');

  it('x(t) = v·t y y(t) = h − g·t²/2 en el aire', () => {
    for (const t of [0.05, 0.2, 0.4]) {
      const s = estadoEn(sim, t);
      cerca(s.x, v * t);
      cerca(s.y, h - g * t * t / 2);
    }
  });
  it('choca en t = 2·v·tanθ / g, x = 2·v²·tanθ / g', () => {
    cerca(choque.t, 2 * v * Math.tan(th) / g);
    cerca(choque.x, 2 * v * v * Math.tan(th) / g);
    cerca(choque.y, h - choque.x * Math.tan(th));
  });
  it('con v > v_c = √(g·h/2)/tanθ no toca la pendiente y cae al suelo', () => {
    const vc = Math.sqrt(g * h / 2) / Math.tan(th);
    const arriba = simularProyectil({ h, theta: th, v0: vc * 1.01, g, duracion: 2 });
    const abajo = simularProyectil({ h, theta: th, v0: vc * 0.99, g, duracion: 2 });
    expect(arriba.eventos[1].nombre).toBe('Choque con el suelo');
    cerca(arriba.eventos[1].t, Math.sqrt(2 * h / g));
    expect(abajo.eventos[1].nombre).toBe('Choque con la pendiente');
  });
});

describe('MEXT 2019 1-(2): rebotes sucesivos', () => {
  // Pendiente casi vertical: la bola cae al suelo como si se soltara desde h.
  const h = 2, e = 0.8;
  const sim = simularProyectil({ h, theta: grados(89.999), v0: 0.5, e, g, duracion: 6, umbral: 1e-6 });
  const suelos = sim.eventos.filter(x => x.nombre === 'Choque con el suelo');

  it('la altura máxima tras el n-ésimo choque es h·e^(2n)', () => {
    expect(suelos.length).toBeGreaterThan(4);
    for (let n = 1; n <= 4; n++) {
      const tras = estadoEn(sim, suelos[n - 1].t + 1e-12);
      const tApice = suelos[n - 1].t + tras.vy / g;
      cerca(estadoEn(sim, tApice).y, h * e ** (2 * n), 1e-9);
    }
  });
});

describe('conservación y balance de energía', () => {
  it('con e = 1 la energía mecánica se conserva a precisión de máquina', () => {
    const sim = simularProyectil({ h: 3, theta: grados(35), v0: 4, e: 1, g, masa: 0.5, duracion: 3 });
    const E0 = (({ K, U }) => K + U)(energiaEn(sim, estadoEn(sim, 0)));
    let peor = 0;
    for (let i = 0; i <= 600; i++) {
      const t = 3 * i / 600, { K, U } = energiaEn(sim, estadoEn(sim, t));
      if (estadoEn(sim, t).fase === 'en vuelo') peor = Math.max(peor, Math.abs(K + U - E0) / E0);
    }
    expect(peor).toBeLessThan(1e-12);
  });

  it('con e < 1 la energía perdida es exactamente la suma de las pérdidas de los eventos', () => {
    const sim = simularProyectil({ h: 3, theta: grados(35), v0: 4, e: 0.5, g, masa: 0.5, duracion: 2.4 });
    const E = t => { const { K, U } = energiaEn(sim, estadoEn(sim, t)); return K + U; };
    const E0 = E(0);
    for (let i = 1; i <= 240; i++) {
      const t = 2.4 * i / 240;
      const perdido = sim.eventos.filter(x => x.t <= t && x.perdida != null).reduce((a, x) => a + x.perdida, 0);
      const pendiente = estadoEn(sim, t).fase === 'deslizando';
      if (!pendiente) expect(Math.abs(E0 - E(t) - perdido)).toBeLessThan(1e-9);
    }
  });
});

describe('determinismo', () => {
  it('la misma escena da exactamente el mismo resultado', () => {
    const p = { h: 3, theta: grados(35), v0: 4, e: 0.5, g, masa: 0.5, duracion: 2.4 };
    expect(simularProyectil(p)).toEqual(simularProyectil(p));
  });
});

describe('lanzamiento oblicuo hasta el suelo', () => {
  it('cae en el instante que da h + v·senα·t − g·t²/2 = 0', () => {
    const h = 1.2, v = 6, a = grados(50);
    const sim = simularProyectil({ h, theta: grados(89.999), v0: v, alfa: a, g, duracion: 3 });
    const suelo = sim.eventos.find(x => x.nombre === 'Choque con el suelo');
    const tAnalitico = (v * Math.sin(a) + Math.sqrt((v * Math.sin(a)) ** 2 + 2 * g * h)) / g;
    cerca(suelo.t, tAnalitico, 1e-12);
    cerca(suelo.x, v * Math.cos(a) * tAnalitico, 1e-12);
  });
});
