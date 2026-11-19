// Exactitud física del motor de electrostática contra soluciones analíticas
// (MEXT 2020 P2: cargas +q en A(−a, 0) y B(a, 0); partícula −q, masa m, en C(0, a)).
import { describe, it, expect } from 'vitest';
import {
  K_COULOMB as k, EPSILON_0, campo, potencial, fuerzaSobre, energiaPotencial, flujoEsfera,
  simularCargas, estadoEn, energiaEn, energiaEstado, componentesVelocidad,
} from '../sistema/motores/electrostatica.js';
import { gaussLegendre } from '../sistema/nucleo/integradores.js';

const rel = (a, b, tol) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.abs(b));
const abs = (a, b, tol) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

// Escena MEXT 2020 P2 con los valores por defecto de la pantalla
const q = 1e-6, a = 1, m = 2e-3;
const escenaMEXT = (o = {}) => {
  const p = { q, a, m, vx: 0, vy: 0, ...o };
  return {
    fijas: [{ id: 'A', nombre: 'A', x: -p.a, y: 0, q: p.q }, { id: 'B', nombre: 'B', x: p.a, y: 0, q: p.q }],
    libres: [{ id: 'P', nombre: 'Partícula', x: p.x ?? 0, y: p.y ?? p.a, q: -p.q, m: p.m, vx: p.vx, vy: p.vy }],
  };
};
// Opciones con las que la pantalla simula la escena
const opcionesPantalla = (dur = 6.5) => ({
  duracion: dur, rtol: 1e-10, atol: 1e-10, hMax: 0.004, radioChoque: 0.02,
  escalaLongitud: a, escalaVelocidad: Math.sqrt(k * q * q / (m * a)),
});
const vEscape = Math.sqrt(2 * Math.SQRT2 * k * q * q / (m * a));
// Altura máxima por el eje y con energía E < 0: −2kq²/√(a² + y²) = E
const yMax = E => Math.sqrt((2 * k * q * q / -E) ** 2 - a * a);

// Tiempo de C a O por cuadratura: t = ∫₀^a dy / v(y), con y = a − u² para
// quitar la singularidad integrable del punto de partida (v ∝ √(a − y)).
function tiempoCO() {
  const v = y => Math.sqrt((4 * k * q * q / m) * (1 / Math.hypot(a, y) - 1 / (Math.SQRT2 * a)));
  const { x, w } = gaussLegendre(8), paneles = 40, U = Math.sqrt(a);
  let t = 0;
  for (let p = 0; p < paneles; p++) {
    const u0 = U * p / paneles, u1 = U * (p + 1) / paneles;
    for (let i = 0; i < 8; i++) {
      const u = (u0 + u1) / 2 + (u1 - u0) / 2 * x[i];
      t += w[i] * (u1 - u0) / 2 * 2 * u / v(a - u * u);
    }
  }
  return t;
}

describe('ley de Coulomb y superposición', () => {
  const A = { x: -a, y: 0, q }, B = { x: a, y: 0, q }, C = { x: 0, y: a, q: -q };

  it('una carga: E radial de módulo kq/r² y V = kq/r', () => {
    const c = { x: 0.3, y: -0.2, q: 2.5e-6 };
    for (const [x, y] of [[1, 1], [-2, 0.5], [0.3, 4], [0.31, -0.2]]) {
      const r = Math.hypot(x - c.x, y - c.y), [ex, ey] = campo([c], x, y);
      rel(Math.hypot(ex, ey), k * c.q / r ** 2, 1e-14);
      abs(ex * (y - c.y) - ey * (x - c.x), 0, 1e-14 * Math.hypot(ex, ey) * r);   // paralelo a r − r_c
      expect(ex * (x - c.x) + ey * (y - c.y)).toBeGreaterThan(0);               // hacia fuera (q > 0)
      rel(potencial([c], x, y), k * c.q / r, 1e-14);
    }
  });

  it('superposición: el campo y el potencial de dos cargas son la suma', () => {
    for (const [x, y] of [[0.2, 0.7], [-3, 1], [1.5, -0.4], [0, 0]]) {
      const [e1x, e1y] = campo([A], x, y), [e2x, e2y] = campo([B], x, y), [ex, ey] = campo([A, B], x, y);
      abs(ex, e1x + e2x, 1e-12 * Math.hypot(e1x, e1y, e2x, e2y));
      abs(ey, e1y + e2y, 1e-12 * Math.hypot(e1x, e1y, e2x, e2y));
      rel(potencial([A, B], x, y), potencial([A], x, y) + potencial([B], x, y), 1e-15);
    }
  });

  it('E = −∇V', () => {
    const cargas = [A, B, C], d = 1e-5;
    for (const [x, y] of [[0.4, 0.3], [-1.7, -0.6], [2, 2]]) {
      const [ex, ey] = campo(cargas, x, y);
      const gx = -(potencial(cargas, x + d, y) - potencial(cargas, x - d, y)) / (2 * d);
      const gy = -(potencial(cargas, x, y + d) - potencial(cargas, x, y - d)) / (2 * d);
      abs(gx, ex, 1e-6 * Math.hypot(ex, ey));
      abs(gy, ey, 1e-6 * Math.hypot(ex, ey));
    }
  });

  it('fuerza = q·E, de módulo k·q₁·q₂/r², y cumple la tercera ley', () => {
    const [fx, fy] = fuerzaSobre(C, [A]), [gx, gy] = fuerzaSobre(A, [C]);
    rel(Math.hypot(fx, fy), k * q * q / (2 * a * a), 1e-14);
    abs(fx + gx, 0, 1e-18); abs(fy + gy, 0, 1e-18);
    expect(fx).toBeLessThan(0);                                  // −q en C es atraída hacia A
    const [ex, ey] = campo([A, B], C.x, C.y), [Fx, Fy] = fuerzaSobre(C, [A, B]);
    rel(Fx === 0 ? 1 : Fx, ex === 0 ? 1 : C.q * ex, 1e-15);
    rel(Fy, C.q * ey, 1e-15);
  });

  it('energía potencial del sistema = Σ k·qᵢ·qⱼ/rᵢⱼ = ½·Σ qᵢ·Vᵢ', () => {
    const U = energiaPotencial([A, B, C]);
    rel(U, k * q * q / (2 * a) - 2 * k * q * q / (Math.SQRT2 * a), 1e-14);
    const cargas = [A, B, C], mitad = 0.5 * cargas.reduce((s, c, i) => s + c.q * potencial(cargas.filter((_, j) => j !== i), c.x, c.y), 0);
    rel(U, mitad, 1e-14);
  });
});

describe('MEXT 2020 P2 · campo y potencial en C', () => {
  const { fijas } = escenaMEXT();

  it('|E(C)| = kq/(√2·a²), vertical hacia arriba', () => {
    for (const [qq, aa] of [[q, a], [3e-6, 0.4], [0.2e-6, 2]]) {
      const f = [{ x: -aa, y: 0, q: qq }, { x: aa, y: 0, q: qq }], [ex, ey] = campo(f, 0, aa);
      rel(Math.hypot(ex, ey), k * qq / (Math.SQRT2 * aa * aa), 1e-14);
      expect(ex).toBe(0);
      expect(ey).toBeGreaterThan(0);
    }
  });

  it('V(C) = √2·kq/a', () => {
    rel(potencial(fijas, 0, a), Math.SQRT2 * k * q / a, 1e-15);
  });

  it('en O el campo se anula y V(O) = 2kq/a', () => {
    expect(campo(fijas, 0, 0)).toEqual([0, 0]);
    rel(potencial(fijas, 0, 0), 2 * k * q / a, 1e-15);
  });
});

describe('MEXT 2020 P2 · movimiento de la partícula', () => {
  const sim = simularCargas(escenaMEXT(), opcionesPantalla());
  const tO = tiempoCO();

  it('soltada desde el reposo pasa por O con v = √(2(2 − √2)·kq²/(m·a))', () => {
    const o = sim.eventos.find(e => e.nombre === 'Pasa por O');
    rel(o.v, Math.sqrt(2 * (2 - Math.SQRT2) * k * q * q / (m * a)), 1e-9);
    abs(o.x, 0, 1e-12);
    rel(o.t, tO, 1e-10);                                          // instante contra la cuadratura
  });

  it('la pantalla lee v = 2.295 m/s en t = 0.7875 s', () => {
    const s = estadoEn(sim, 0.7875);
    expect(Math.hypot(s.vx, s.vy).toFixed(3)).toBe('2.295');
  });

  it('simetría: retorno en (0, −a) en t = 2·t_O y vuelta a C en t = 4·t_O', () => {
    const nombres = sim.eventos.map(e => e.nombre);
    expect(nombres.slice(0, 5)).toEqual(['Se suelta', 'Pasa por O', 'Punto de retorno', 'Pasa por O', 'Vuelve al inicio']);
    const ret = sim.eventos[2], vuelta = sim.eventos[4];
    abs(ret.x, 0, 1e-12); rel(ret.y, -a, 1e-9); rel(ret.t, 2 * tO, 1e-9);
    abs(vuelta.x, 0, 1e-12); rel(vuelta.y, a, 1e-9); rel(vuelta.t, 4 * tO, 1e-9);
    // Movimiento por el eje: y(t_O + τ) = −y(t_O − τ)
    for (const tau of [0.1, 0.3, 0.6]) abs(estadoEn(sim, tO + tau).y, -estadoEn(sim, tO - tau).y, 1e-9);
    expect(sim.choque).toBeNull();
  });

  it('la energía total se conserva en varios periodos (relativa < 1e-9)', () => {
    const largo = simularCargas(escenaMEXT(), opcionesPantalla(5 * 4 * tO));   // 5 periodos
    expect(largo.eventos.filter(e => e.nombre === 'Vuelve al inicio')).toHaveLength(5);
    expect(largo.deriva).toBeLessThan(1e-9);
    rel(largo.E0, -Math.SQRT2 * k * q * q / a, 1e-15);
    for (let i = 0; i <= 2000; i++) {
      const { K, U } = energiaEn(largo, largo.tFin * i / 2000);
      abs(K + U, largo.E0, 1e-9 * Math.abs(largo.E0));
    }
  });

  describe('rapidez mínima de escape desde C: v₀ = √(2√2·kq²/(m·a))', () => {
    for (const [sentido, alfa] of [['hacia arriba', 90], ['hacia abajo', -90]]) {
      it(`${sentido}: con 0.999·v₀ vuelve desde la altura que da la energía`, () => {
        const [vx, vy] = componentesVelocidad(0.999 * vEscape, alfa);
        const s = simularCargas(escenaMEXT({ vx, vy }), { duracion: 12000, rtol: 1e-11, atol: 1e-12 });
        expect(s.E0).toBeLessThan(0);
        const ret = s.eventos.find(e => e.nombre === 'Punto de retorno');
        expect(ret).toBeDefined();
        rel(Math.abs(ret.y), yMax(s.E0), 1e-8);
        expect(Math.sign(ret.y)).toBe(Math.sign(alfa));
        abs(ret.x, 0, 0);
        expect(Math.abs(ret.y)).toBeGreaterThan(700 * a);
        expect(estadoEn(s, s.tFin).vy * Math.sign(alfa)).toBeLessThan(0);    // ya viene de vuelta
      });
      it(`${sentido}: con 1.001·v₀ escapa y su rapidez tiende a √(2E/m)`, () => {
        const [vx, vy] = componentesVelocidad(1.001 * vEscape, alfa);
        const s = simularCargas(escenaMEXT({ vx, vy }), { duracion: 12000, rtol: 1e-11, atol: 1e-12 });
        expect(s.E0).toBeGreaterThan(0);
        expect(s.eventos.filter(e => e.tipo === 'retorno')).toHaveLength(0);
        const f = estadoEn(s, s.tFin);
        expect(f.vy * Math.sign(alfa)).toBeGreaterThan(0);
        expect(Math.abs(f.y)).toBeGreaterThan(2000 * a);
        // Lejos, ½mv² = E − U(y) con U = −2kq²/√(a² + y²) → v∞ = √(2E/m)
        rel(0.5 * m * f.vy ** 2, s.E0 + 2 * k * q * q / Math.hypot(a, f.y), 1e-8);
        expect(Math.abs(f.vy)).toBeGreaterThan(Math.sqrt(2 * s.E0 / m));
      });
    }
  });

  it('lanzada a −90° sigue exactamente sobre el eje (el eje es inestable en x)', () => {
    expect(componentesVelocidad(3, -90)).toEqual([0, -3]);
    expect(componentesVelocidad(3, 90)).toEqual([0, 3]);
    expect(componentesVelocidad(3, 180)).toEqual([-3, 0]);
    expect(componentesVelocidad(3, 450)).toEqual([0, 3]);
    const [vx, vy] = componentesVelocidad(2, 30);
    rel(vx, Math.sqrt(3), 1e-15); rel(vy, 1, 1e-15);
    // Con cos(−π/2) ≈ 6·10⁻¹⁷ en vx, el error crece en cada paso por O hasta el choque
    const qq = 2.5e-6, aa = 0.4, mm = 0.5e-3, [ux, uy] = componentesVelocidad(0.5, -90);
    const s = simularCargas(escenaMEXT({ q: qq, a: aa, m: mm, vx: ux, vy: uy }), { ...opcionesPantalla(4), escalaLongitud: aa, escalaVelocidad: Math.sqrt(k * qq * qq / (mm * aa)) });
    expect(s.choque).toBeNull();
    expect(s.solucion.y.every(y => y[0] === 0 && y[2] === 0)).toBe(true);
    expect(s.eventos.filter(e => e.nombre === 'Pasa por O').length).toBeGreaterThan(40);
  });

  it('determinismo: la misma escena da exactamente el mismo resultado', () => {
    expect(simularCargas(escenaMEXT(), opcionesPantalla())).toEqual(simularCargas(escenaMEXT(), opcionesPantalla()));
  });
});

describe('ley de Gauss (flujo por una esfera en 3D)', () => {
  const cargas = [{ x: -a, y: 0, q }, { x: a, y: 0, q }, { x: 0, y: a, q: -q }];
  const Q = q / EPSILON_0;

  it('una carga dentro: Φ = q/ε₀, sin importar el radio ni el centro', () => {
    for (const [c, R] of [[{ x: -a, y: 0.1 }, 0.5], [{ x: -a, y: 0 }, 0.2], [{ x: -0.8, y: -0.1, z: 0.1 }, 0.6]]) {
      rel(flujoEsfera(cargas, c, R), Q, 1e-10);
    }
  });
  it('dos cargas dentro (A y B, no C): Φ = 2q/ε₀', () => {
    rel(flujoEsfera(cargas, { x: 0, y: -1 }, 1.6, 96), 2 * Q, 1e-10);
  });
  it('las tres dentro: Φ = (q + q − q)/ε₀', () => {
    rel(flujoEsfera(cargas, { x: 0, y: 0.2 }, 3), Q, 1e-12);
  });
  it('ninguna dentro: Φ = 0', () => {
    abs(flujoEsfera(cargas, { x: 0, y: -1.5 }, 0.6), 0, 1e-12 * Q);
  });
  it('ε₀ = 1/(4πk)', () => {
    rel(EPSILON_0, 8.8541878128e-12, 1e-10);
  });
});

describe('cargas libres: choques e interacción mutua', () => {
  it('dos cargas opuestas soltadas en reposo chocan en el tiempo de caída radial', () => {
    const d = 1, mm = 1e-3, R = 0.02;
    const s = simularCargas({ fijas: [], libres: [
      { id: 'P', nombre: 'P', x: -d / 2, y: 0, q, m: mm }, { id: 'Q', nombre: 'Q', x: d / 2, y: 0, q: -q, m: mm },
    ] }, { duracion: 10, radioChoque: R });
    // Masa reducida μ = m/2, potencial −kq²/r, de r = d a r = R:
    // t = √(μd³/(2kq²))·[√(ρ(1 − ρ)) + arccos √ρ], ρ = R/d
    const mu = mm / 2, rho = R / d;
    const tA = Math.sqrt(mu * d ** 3 / (2 * k * q * q)) * (Math.sqrt(rho * (1 - rho)) + Math.acos(Math.sqrt(rho)));
    expect(s.estado).toBe('evento');
    expect(s.choque.nombre).toBe('Choque entre P y Q');
    rel(s.choque.t, tA, 1e-9);
    rel(s.tFin, tA, 1e-9);
    // Momento lineal total nulo y energía conservada
    for (const t of [0, 0.1, 0.2, s.tFin]) {
      const p = estadoEn(s, t, 0), r = estadoEn(s, t, 1);
      abs(p.vx + r.vx, 0, 1e-9 * Math.abs(p.vx) + 1e-15);
      abs(p.x + r.x, 0, 1e-12);
    }
    expect(s.deriva).toBeLessThan(1e-7);
    const f = estadoEn(s, s.tFin, 0), g = estadoEn(s, s.tFin, 1);
    rel(Math.hypot(f.x - g.x, f.y - g.y), R, 1e-9);
  });

  it('la partícula desplazada del eje choca con una carga fija y la simulación se detiene ahí', () => {
    const s = simularCargas(escenaMEXT({ x: 0.3 }), opcionesPantalla());
    expect(s.choque).not.toBeNull();
    expect(s.choque.nombre).toBe('Choca con la carga B');
    expect(s.eventos[s.eventos.length - 1]).toBe(s.choque);
    const fin = estadoEn(s, 99);
    rel(Math.hypot(fin.x - a, fin.y), 0.02, 1e-9);
    expect(s.tFin).toBe(s.choque.t);
    expect(s.deriva).toBeLessThan(1e-8);
  });

  it('una carga que empieza dentro del radio de choque choca en t = 0', () => {
    const s = simularCargas(escenaMEXT({ x: a - 0.01, y: 0 }), opcionesPantalla());
    expect(s.choque.t).toBe(0);
    expect(s.tFin).toBe(0);
    expect(estadoEn(s, 1)).toEqual({ x: a - 0.01, y: 0, vx: 0, vy: 0 });
  });

  it('movimiento por el eje x: pasa por O y tiene puntos de retorno simétricos', () => {
    // +q entre dos +q: estable a lo largo de x
    const s = simularCargas({ fijas: escenaMEXT().fijas, libres: [{ id: 'P', x: 0.3, y: 0, q, m }] }, { duracion: 3 });
    const nombres = s.eventos.map(e => e.nombre);
    expect(nombres.slice(0, 5)).toEqual(['Se suelta', 'Pasa por O', 'Punto de retorno', 'Pasa por O', 'Vuelve al inicio']);
    rel(s.eventos[2].x, -0.3, 1e-9);
    rel(s.eventos[4].t, 2 * s.eventos[2].t, 1e-9);
    // Energía: U(x) = kq²·(1/(a + x) + 1/(a − x)) ⇒ en O, ½mv² = U(0.3) − U(0)
    const U = x => k * q * q * (1 / (a + x) + 1 / (a - x));
    rel(s.eventos[1].v, Math.sqrt(2 * (U(0.3) - U(0)) / m), 1e-9);
  });

  it('una carga libre sola (o neutra) sigue un movimiento rectilíneo uniforme', () => {
    for (const qq of [q, 0]) {
      const s = simularCargas({ fijas: qq ? [] : [{ x: 0, y: 0, q }], libres: [{ x: -1, y: 2, q: qq, m, vx: 0.5, vy: -0.25 }] }, { duracion: 4 });
      expect(s.estado).toBe('completo');
      const f = estadoEn(s, 4);
      rel(f.x, 1, 1e-14); rel(f.y, 1, 1e-14);
      expect(s.eventos.map(e => e.nombre)).toEqual(['Se lanza']);
    }
  });

  it('la energía de un estado incluye la interacción entre cargas libres (no la de las fijas entre sí)', () => {
    const fijas = [{ x: 0, y: 0, q }, { x: -3, y: 0, q: 2 * q }];
    const libres = [{ x: 1, y: 0, q, m, vx: 0.5 }, { x: 0, y: 2, q: -q, m: 2 * m }];
    const s = simularCargas({ fijas, libres }, { duracion: 0.5 });
    const { K, U } = energiaEstado(s, s.solucion.y[0]);
    rel(K, 0.5 * m * 0.25, 1e-15);
    rel(U, energiaPotencial([...fijas, ...libres]) - energiaPotencial(fijas), 1e-14);
    expect(s.deriva).toBeLessThan(1e-9);
    // Sin interacción mutua, cada libre solo ve las fijas
    const sola = simularCargas({ fijas, libres }, { duracion: 0.5, interaccionLibres: false });
    rel(energiaEstado(sola, sola.solucion.y[0]).U, energiaPotencial([...fijas, ...libres]) - energiaPotencial(fijas) - energiaPotencial(libres), 1e-14);
    expect(sola.deriva).toBeLessThan(1e-9);
  });
});
