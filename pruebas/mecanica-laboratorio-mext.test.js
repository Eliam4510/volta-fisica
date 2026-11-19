// Escenas MEXT del Laboratorio de Mecánica (temas M3–M7): cada escena se
// simula con el motor general y se compara con la respuesta del examen,
// derivada a mano (la fórmula va en el comentario de cada prueba). Las escenas
// son reconstrucciones propias de cada situación (DECISIONES.md, 2): cuando el
// examen es simbólico, la escena fija valores y la prueba usa los mismos.
import { describe, it, expect } from 'vitest';
import { ESCENARIOS, escenaDeEscenario, aMotor, describirEvento, lugarDelEvento, fuerzasEn } from '../sistema/prototipos/mecanica-laboratorio.js';
import { simularMecanica, estadoMecanica, energiaMecanica } from '../sistema/motores/mecanica.js';

const g = 9.8;
/** |a − b| ≤ tol·max(1, |b|): absoluta cerca de cero, relativa en lo grande. */
const cerca = (a, b, tol) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
/** Diferencia relativa ≤ tol (para comparar con las aproximaciones del examen). */
const relativo = (a, b, tol) => expect(Math.abs(a / b - 1)).toBeLessThanOrEqual(tol);
const simular = id => {
  const M = aMotor(escenaDeEscenario(id)), sim = simularMecanica(M.motor);
  expect(sim.incompleta ?? null, id).toBeNull();
  expect(M.avisos, id).toEqual([]);
  return { M, sim };
};
const est = (sim, t, i = 0) => estadoMecanica(sim, t)[i];
const rapidez = s => Math.hypot(s.vx, s.vy);
const eventos = (sim, M, texto) => sim.eventos.filter(e => describirEvento(e, M).includes(texto));
const evento = (sim, M, texto) => {
  const e = eventos(sim, M, texto)[0];
  expect(e, texto).toBeTruthy();
  return e;
};
/** Instante en [a, b] en que f cambia de signo (bisección). */
function cruce(f, a, b) {
  let fa = f(a);
  expect(fa * f(b), 'la función debe cambiar de signo en el intervalo').toBeLessThanOrEqual(0);
  for (let k = 0; k < 200 && b - a > 1e-13; k++) {
    const c = (a + b) / 2, fc = f(c);
    if (fa * fc <= 0) b = c; else { a = c; fa = fc; }
  }
  return (a + b) / 2;
}
/** Media aritmético-geométrica: K(k) = π / (2·AGM(1, √(1 − k²))). */
const agm = (a, b) => { for (let k = 0; k < 40; k++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)]; return a; };

describe('escenas MEXT: catálogo', () => {
  const mext = ESCENARIOS.filter(e => e.tipo === 'mext');

  it('van ordenadas por año y su id y referencia coinciden con el año', () => {
    const anios = mext.map(e => e.anio);
    expect(anios).toEqual([...anios].sort((a, b) => a - b));
    for (const e of mext) {
      expect(e.id.startsWith(`mext-${e.anio}-`), e.id).toBe(true);
      expect(e.ref.startsWith(`${e.anio} · `), e.id).toBe(true);
    }
    expect(new Set(mext.map(e => e.id)).size).toBe(mext.length);
  });

  it('están todas las escenas de dinámica, energía, choques, circular y oscilaciones que el motor representa', () => {
    const ids = new Set(mext.map(e => e.id));
    for (const id of [
      'mext-2006-p3', 'mext-2007-1-1', 'mext-2008-p3', 'mext-2009-1-1', 'mext-2009-p3', 'mext-2010-1d', 'mext-2010-1e',
      'mext-2012-1-1', 'mext-2012-p3', 'mext-2014-1-1', 'mext-2014-p3', 'mext-2015-p3', 'mext-2016-1-4', 'mext-2016-1-5',
      'mext-2017-1-3', 'mext-2017-p3', 'mext-2018-1-2', 'mext-2019-1-2', 'mext-2020-1-1', 'mext-2020-1-2', 'mext-2020-p3',
      'mext-2023-1-2', 'mext-2027-p2',
    ]) expect(ids.has(id), id).toBe(true);
  });

  it('las notas caben enteras al abrir la escena y los títulos caben en la barra superior', () => {
    for (const e of mext) if (e.nota) expect(escenaDeEscenario(e.id).nota, e.id).toEqual(e.nota);
    // A 1440 px de ancho, la barra muestra unos 44 caracteres antes de cortar el título
    for (const e of mext) expect(e.titulo.length, e.id).toBeLessThanOrEqual(44);
  });
});

describe('escenas MEXT: dinámica (M3)', () => {
  it('2012 · 1-(1): la cuerda arrastra a m con T = mF/(M + m)', () => {
    // a = F/(M + m) = 6/3 = 2 m/s²; T = m·a = 2 N
    const { sim, M } = simular('mext-2012-1-1');
    const m = 1, mM = 2, F = 6;
    for (const t of [0.3, 0.9, 1.4]) cerca(fuerzasEn(sim, M, t).tensiones.c1, m * F / (mM + m), 1e-6);
    cerca(est(sim, 1).x, 0.5 * F / (mM + m), 1e-8);
  });

  it('2016 · 1-(4): el bloque desliza solo si μs < tan θ', () => {
    // θ = 30°: tan θ ≈ 0.577. Plano 1 (μs = 0.5) desliza con a = g(sen θ − μ cos θ); plano 2 (μs = 0.7) lo sostiene
    const { sim, M } = simular('mext-2016-1-4');
    const th = Math.PI / 6;
    expect(0.5).toBeLessThan(Math.tan(th));
    expect(0.7).toBeGreaterThan(Math.tan(th));
    const s0 = est(sim, 0, 0), s = est(sim, 1, 0);
    cerca(Math.hypot(s.x - s0.x, s.y - s0.y), g * (Math.sin(th) - 0.4 * Math.cos(th)) / 2, 1e-8);
    const q0 = est(sim, 0, 1), q = est(sim, 2.6, 1);
    expect(Math.hypot(q.x - q0.x, q.y - q0.y)).toBeLessThan(1e-9);
    // Solo el bloque 1 llega al suelo
    expect(eventos(sim, M, 'bloque 2')).toEqual([]);
    expect(evento(sim, M, 'El bloque 1 sale por el borde del plano 1')).toBeTruthy();
  });

  it('2020 · 1-(1): T₁ = F/6 y T₂ = F/2 (opción d)', () => {
    // a = F/(m + 2m + 3m); T₁ solo arrastra a m; T₂ arrastra a m + 2m
    const { sim, M } = simular('mext-2020-1-1');
    const F = 12, m = 1;
    for (const t of [0.2, 0.6, 1.1]) {
      const T = fuerzasEn(sim, M, t).tensiones;
      cerca(T.c1, F / 6, 1e-6);
      cerca(T.c2, F / 2, 1e-6);
    }
    cerca(est(sim, 1, 0).x, 0.5 * F / (6 * m), 1e-8);
  });
});

describe('escenas MEXT: energía y trayectorias (M4)', () => {
  it('2006 · P3: se despega Y = R/3 − v₀²/(3g) bajo la cima y luego sigue una parábola acelerada', () => {
    // Energía (y hacia abajo): mv²/2 − mgY = mv₀²/2; geometría: sen θ = (R − Y)/R;
    // fuerzas: mg sen θ = mv²/R → Y = R/3 − v₀²/(3g): C₁ = 1/3, C₂ = −1/3
    const { sim, M } = simular('mext-2006-p3');
    const R = 1, v0 = 1, d = evento(sim, M, 'El objeto se despega de la esfera');
    const p = lugarDelEvento(d, M), Y = 2 - p[1], senTh = (p[1] - 1) / R;
    cerca(Y, R / 3 - v0 * v0 / (3 * g), 1e-7);
    const v = rapidez(est(sim, d.t));
    cerca(v * v, v0 * v0 + 2 * g * Y, 1e-7);
    cerca(v * v, g * R * senTh, 1e-7);
    // En el aire: vx constante, vy cambia con −g y la rapidez crece (opción d)
    const a = est(sim, d.t + 0.1), b = est(sim, d.t + 0.3);
    cerca(b.vx, a.vx, 1e-9);
    cerca(b.vy - a.vy, -g * 0.2, 1e-9);
    expect(rapidez(b)).toBeGreaterThan(rapidez(a));
  });

  it('2010 · 1-E: K(x) crece primero rápido en A, en línea recta en B y primero lento en C', () => {
    // Sin fricción, K = mg(h − y(x)). En la cóncava A, y(x) cae rápido al principio: K/mgh > x/L;
    // en la recta B, K/mgh = x/L; en la convexa C, K/mgh < x/L. Al llegar a Q, K = mgh en las tres.
    const { sim, M } = simular('mext-2010-1e');
    const m = 0.2, h = 1, L = 1.6, paso = 2.7, mgh = m * g * h;
    const K = s => 0.5 * m * (s.vx * s.vx + s.vy * s.vy);
    // Instante en que cada objeto llega a Q (sale de su pista): ahí K = mgh
    const llegada = ['A', 'B', 'C'].map((nombre, i) => {
      const fin = evento(sim, M, `El objeto ${nombre} sale por el borde de la pista ${nombre}`);
      cerca(K(est(sim, fin.t - 1e-12, i)), mgh, 1e-6);
      return fin.t;
    });
    for (const f of [0.25, 0.5, 0.75]) {
      const k = [0, 1, 2].map(i => {
        const t = cruce(tt => est(sim, tt, i).x - (i * paso + f * L), 0, llegada[i] - 1e-9);
        const s = est(sim, t, i);
        cerca(K(s), m * g * (h - s.y), 1e-7);     // la energía se conserva
        return K(s) / mgh;
      });
      expect(k[0]).toBeGreaterThan(f);
      cerca(k[1], f, 1e-7);
      expect(k[2]).toBeLessThan(f);
    }
  });

  it('2012 · P3: sale de B a 45° con √(2gH), sube a 1.5H y cae en C a (1 + √3)H con 2√(gH)', () => {
    // v_B² = 2g(2H − H); pendiente en B: y' = x/(2H) = 1 → 45°; y_max = H + (v_B sen 45°)²/(2g) = 1.5H;
    // H + v_B sen 45°·t − gt²/2 = 0 → t = (1 + √3)√(H/g); x = v_B cos 45°·t = (1 + √3)H; v_C² = 2g·2H
    const { sim, M } = simular('mext-2012-p3');
    const H = 1, salidas = eventos(sim, M, 'La bola sale por el borde de la pista'), B = salidas[salidas.length - 1];
    const sB = est(sim, B.t);
    cerca(sB.y, H, 1e-9);
    cerca(rapidez(sB), Math.sqrt(2 * g * H), 1e-7);
    cerca(Math.atan2(sB.vy, sB.vx), Math.PI / 4, 1e-7);
    // La pista de arcos no tiene esquinas: las uniones no disipan energía
    const choqueSuelo = evento(sim, M, 'La bola choca con el suelo');
    const perdidaPista = sim.eventos.filter(e => e.t < choqueSuelo.t).reduce((s, e) => s + e.perdida, 0);
    expect(perdidaPista).toBeLessThan(1e-7);
    const tMax = cruce(t => est(sim, t).vy, B.t, choqueSuelo.t - 1e-9);
    cerca(est(sim, tMax).y, 1.5 * H, 1e-8);
    cerca(choqueSuelo.t - B.t, (1 + Math.sqrt(3)) * Math.sqrt(H / g), 1e-8);
    cerca(lugarDelEvento(choqueSuelo, M)[0] - sB.x, (1 + Math.sqrt(3)) * H, 1e-7);
    cerca(rapidez(est(sim, choqueSuelo.t - 1e-12)), 2 * Math.sqrt(g * H), 1e-7);
  });
});

describe('escenas MEXT: choques (M5)', () => {
  it('2007 · 1-(1): la bola queda dentro y el resorte se comprime mν/√(k(M + m))', () => {
    // Choque perfectamente inelástico: V = mν/(M + m); ½(M + m)V² = ½kx² → x = mν/√(k(M + m));
    // energía perdida en el choque: ½mν²·M/(M + m)
    const { sim, M } = simular('mext-2007-1-1');
    const m = 0.1, nu = 20, mM = 1.9, k = 20, x0 = 0.6;
    const choque = evento(sim, M, 'Choque y contacto entre el bloque y la bola');
    cerca(choque.perdida, 0.5 * m * nu * nu * mM / (mM + m), 1e-9);
    const tMax = cruce(t => est(sim, t, 0).vx, choque.t + 0.01, 0.99);
    cerca(tMax - choque.t, (Math.PI / 2) * Math.sqrt((mM + m) / k), 1e-6);
    cerca(est(sim, tMax, 0).x - x0, m * nu / Math.sqrt(k * (mM + m)), 1e-7);
    // Siguen juntos: la distancia entre centros no pasa de la suma de radios
    for (let t = choque.t + 0.002; t < 1; t += 0.01) {
      const [A, Bo] = estadoMecanica(sim, t);
      expect(Math.hypot(A.x - Bo.x, A.y - Bo.y) - 0.18).toBeLessThan(1e-5);
    }
  });

  it('2014 · 1-(1): la bola m alcanza v = √(Mkℓ²/(m(M + m))) con el resorte en su largo natural', () => {
    // Momento nulo: Mv_M = −mv_m; ½kℓ² = ½Mv_M² + ½mv_m² → v_m² = Mkℓ²/(m(M + m))
    const { sim } = simular('mext-2014-1-1');
    const mM = 2, m = 1, k = 50, l = 0.2, w = Math.sqrt(k * (mM + m) / (mM * m));
    const vmax = Math.sqrt(mM * k * l * l / (m * (mM + m)));
    const t = Math.PI / (2 * w), [A, Bm] = estadoMecanica(sim, t);
    cerca(Bm.x - A.x, 1, 1e-8);
    cerca(Math.abs(Bm.vx), vmax, 1e-7);
    for (let tt = 0; tt <= 1.5; tt += 0.005) {
      const [a, b] = estadoMecanica(sim, tt);
      expect(Math.abs(b.vx)).toBeLessThanOrEqual(vmax * (1 + 1e-7));
      cerca(mM * a.vx + m * b.vx, 0, 1e-9);
    }
  });

  it('2019 · 1-(2): entre el choque n y el n + 1 sube hasta h·e²ⁿ', () => {
    // v tras el n-ésimo choque = eⁿ√(2gh) → altura v²/(2g) = h·e²ⁿ
    const { sim, M } = simular('mext-2019-1-2');
    const h = 2, e = 0.8, choques = eventos(sim, M, 'La bola choca con el suelo');
    expect(choques.length).toBeGreaterThanOrEqual(5);
    for (let n = 1; n <= 4; n++) {
      const t = cruce(tt => est(sim, tt).vy, choques[n - 1].t + 1e-6, choques[n].t - 1e-6);
      cerca(est(sim, t).y, h * e ** (2 * n), 1e-8);
    }
  });

  it('2020 · 1-(2): A queda quieta tras chocar con B (3m): e = 1/3', () => {
    // A llega con v = √(2gh); momento: mv = 3m·v_B → v_B = v/3; e = (v_B − 0)/v = 1/3
    const { sim, M } = simular('mext-2020-1-2');
    const h = 0.8, v = Math.sqrt(2 * g * h);
    const c = evento(sim, M, 'Choque entre A y B');
    const antes = estadoMecanica(sim, c.t - 1e-12), despues = estadoMecanica(sim, c.t + 1e-9);
    cerca(antes[0].vx, v, 1e-7);
    cerca(rapidez(despues[0]), 0, 1e-7);
    cerca(despues[1].vx, v / 3, 1e-7);
    cerca((despues[1].vx - despues[0].vx) / (antes[0].vx - antes[1].vx), 1 / 3, 1e-7);
  });

  it('2023 · 1-(2): llega a 60° y sale a 30°: e = tan 30°/tan 60° = 1/3', () => {
    // La componente paralela no cambia: |v_x| = 2 cos 60°; v_y' = e·2 sen 60° y tan 30° = v_y'/|v_x|
    const { sim, M } = simular('mext-2023-1-2');
    const c = evento(sim, M, 'La bola choca con el suelo');
    cerca(c.t, 0.4, 1e-9);
    const antes = est(sim, c.t - 1e-12), despues = est(sim, c.t + 1e-9);
    cerca(rapidez(antes), 2, 1e-9);
    cerca(Math.atan2(-antes.vy, -antes.vx), Math.PI / 3, 1e-9);
    cerca(despues.vx, antes.vx, 1e-9);
    cerca(Math.atan2(despues.vy, -despues.vx), Math.PI / 6, 1e-9);
    cerca(despues.vy / -antes.vy, Math.tan(Math.PI / 6) / Math.tan(Math.PI / 3), 1e-9);
  });
});

describe('escenas MEXT: movimiento circular (M6)', () => {
  it('2009 · 1-(1): en Q, a la altura del centro, N = mv²/r − 2mg', () => {
    // v_Q² = v² − 2gr; en Q el peso es tangente: N = mv_Q²/r = mv²/r − 2mg.
    // Después se despega donde N = 0: sen φ = (v² − 2gr)/(3gr) sobre la horizontal del centro
    const { sim, M } = simular('mext-2009-1-1');
    const m = 0.1, r = 0.5, v = 4, d = evento(sim, M, 'La bola se despega del hemisferio');
    const tQ = cruce(t => est(sim, t).y - r, 0.2, d.t);
    const N = fuerzasEn(sim, M, tQ).porParticula[0].find(f => f.tipo === 'normal');
    cerca(N.valor, m * v * v / r - 2 * m * g, 1e-6);
    cerca(rapidez(est(sim, tQ)) ** 2, v * v - 2 * g * r, 1e-7);
    cerca(lugarDelEvento(d, M)[1], r + r * (v * v - 2 * g * r) / (3 * g * r), 1e-7);
  });

  it('2018 · 1-(2): gira con radio (1 + α)l₀ y rapidez l₀√((1 + α)αk/m)', () => {
    // Centrípeta = fuerza elástica: kαl₀ = mv²/((1 + α)l₀)
    const { sim } = simular('mext-2018-1-2');
    const m = 0.5, k = 20, l0 = 1, al = 0.25, R = (1 + al) * l0, v = l0 * Math.sqrt((1 + al) * al * k / m);
    for (let t = 0; t <= 2.4; t += 0.05) {
      const s = est(sim, t);
      cerca(Math.hypot(s.x, s.y), R, 1e-7);
      cerca(rapidez(s), v, 1e-7);
    }
    const T = 2 * Math.PI * R / v, s = est(sim, T);
    cerca(s.x, R, 1e-6); cerca(s.y, 0, 1e-6);
  });
});

describe('escenas MEXT: oscilaciones (M7)', () => {
  it('2008 · P3: llega abajo en (π/2)√(R₀/g), π/2 veces t̄ = arco/v_max', () => {
    // h = R₀(1 − cos θ₀) ≈ R₀θ₀²/2; v_max = √(2gh); arco = R₀θ₀; t̄ = arco/v_max ≈ √(R₀/g).
    // Tiempo real hasta B: un cuarto de periodo, √(R₀/g)·K(sen(θ₀/2)) ≈ (π/2)√(R₀/g)
    const { sim } = simular('mext-2008-p3');
    const R0 = 2, th0 = 10 * Math.PI / 180, h = R0 * (1 - Math.cos(th0));
    relativo(h, R0 * th0 * th0 / 2, 0.005);
    const tB = cruce(t => est(sim, t).x, 0.1, 1.2);
    cerca(tB, Math.sqrt(R0 / g) * Math.PI / (2 * agm(1, Math.cos(th0 / 2))), 1e-7);
    const vmax = rapidez(est(sim, tB));
    cerca(vmax, Math.sqrt(2 * g * h), 1e-7);
    const tBarra = R0 * th0 / vmax;
    relativo(tBarra, Math.sqrt(R0 / g), 0.005);
    relativo(tB / tBarra, Math.PI / 2, 0.005);
  });

  it('2010 · 1-D: tarda π√(m/(2k)) ≈ 0.45 s en llegar a lo más alto', () => {
    // 2k·0.20 m = mg → k = 12.25 N/m; los dos resortes suman 2k; de abajo a arriba, medio periodo
    const { sim } = simular('mext-2010-1d');
    const m = 0.5, k = m * g / 0.4, t = cruce(tt => est(sim, tt).vy, 0.2, 0.7);
    cerca(t, Math.PI * Math.sqrt(m / (2 * k)), 1e-7);
    expect(Math.abs(t - 0.45)).toBeLessThan(0.01);
    cerca(est(sim, t).y, 0.4, 1e-8);
  });

  it('2016 · 1-(5): x = A sen(πt/t₀) y v_max = πA/t₀', () => {
    // Periodo 2t₀ → ω = π/t₀ → v_max = ωA
    const { sim } = simular('mext-2016-1-5');
    const A = 0.2, t0 = 0.5, m = 0.5, k = m * (Math.PI / t0) ** 2, yEq = -(0.5 + m * g / k);
    for (const t of [0.1, 0.25, 0.6, 0.85, 1.3]) cerca(est(sim, t).y - yEq, A * Math.sin(Math.PI * t / t0), 1e-7);
    cerca(cruce(t => est(sim, t).y - yEq, 0.4, 0.6), t0, 1e-8);
    cerca(cruce(t => est(sim, t).y - yEq, 0.9, 1.1), 2 * t0, 1e-8);
    for (let t = 0; t <= 2.2; t += 0.01) expect(Math.abs(est(sim, t).vy)).toBeLessThanOrEqual(Math.PI * A / t0 * (1 + 1e-7));
    cerca(Math.abs(est(sim, t0).vy), Math.PI * A / t0, 1e-7);
  });

  it('2017 · 1-(3): v = −ωd sen ωt, empieza en 0 y baja primero (gráfica b)', () => {
    // x = d cos ωt (estirado d y soltado) → v = −ωd sen ωt
    const { sim } = simular('mext-2017-1-3');
    const w = Math.sqrt(50 / 0.5), d = 0.1;
    for (const t of [0, 0.05, 0.12, 0.3, 0.5, 0.9, 1.3]) cerca(est(sim, t).vx, -w * d * Math.sin(w * t), 1e-7);
    cerca(est(sim, Math.PI / (2 * w)).vx, -w * d, 1e-7);
    cerca(est(sim, 3 * Math.PI / (2 * w)).vx, w * d, 1e-7);
  });

  it('2020 · P3: A rebota con −v/2, B sale con v/2 y comprime ℓ = √(3mv²/(4k)) en T = (π/2)√(3m/k)', () => {
    // Elástico: v_A = (m − 3m)v/(4m) = −v/2, v_B = 2mv/(4m) = v/2; ½·3m(v/2)² = ½kℓ²;
    // B oscila con ω = √(k/(3m)): compresión ℓ sen ωt → en T/2, ℓ sen(π/4) = ℓ/√2
    const { sim, M } = simular('mext-2020-p3');
    const m = 1, v = 2, k = 75, l = Math.sqrt(3 * m * v * v / (4 * k)), T = (Math.PI / 2) * Math.sqrt(3 * m / k);
    const c = evento(sim, M, 'Choque entre A y B');
    cerca(c.t, 0.5, 1e-9);
    const [A, Bo] = estadoMecanica(sim, c.t + 1e-9);
    cerca(A.vx, -v / 2, 1e-7);
    cerca(Bo.vx, v / 2, 1e-7);
    cerca(cruce(t => est(sim, t, 1).vx, c.t + 0.01, c.t + 0.5), c.t + T, 1e-7);
    cerca(est(sim, c.t + T, 1).x - 0.8, l, 1e-7);
    cerca(est(sim, c.t + T / 2, 1).x - 0.8, l / Math.SQRT2, 1e-7);
    cerca(energiaMecanica(sim, 1.5).E, energiaMecanica(sim, 0).E, 1e-6);
  });
});

describe('escenas MEXT: cuerda elástica', () => {
  it('2010 · 1-F: la pesa sube hasta 45 cm sobre el suelo; la goma queda floja a 30 cm', () => {
    // k = mg/0.10; hasta el largo natural v² = k(0.2² − 0.1²)/m; después vuela v²/(2g) = 15 cm
    const { sim, M } = simular('mext-2010-1f');
    expect(sim.incompleta).toBeNull();
    const floja = evento(sim, M, 'queda floja');
    cerca(est(sim, floja.t).y, 0.3, 1e-9);
    const v = rapidez(est(sim, floja.t));
    cerca(est(sim, floja.t + v / g).y, 0.45, 1e-8);
    cerca(energiaMecanica(sim, 1).E, energiaMecanica(sim, 0).E, 1e-8);
  });
});

describe('escenas MEXT: superficies que se mueven y movimiento impuesto', () => {
  it('2016 · P3: Q se pega a P en T = Mv0/((M + m)μg), con v común Mv0/(M + m) y deslizamiento Mv0²/(2(M + m)μg)', () => {
    const { M, sim } = simular('mext-2016-p3');
    const Mp = 2, m = 1, v0 = 3, mu = 0.4, T = Mp * v0 / ((Mp + m) * mu * g);
    const pega = sim.eventos.find(e => e.clave.startsWith('vt0:'));
    cerca(pega.t, T, 1e-8);
    expect(describirEvento(pega, M)).toMatch(/Q/);
    // Velocidad de P (opción d): v0 − (m/M)μg·t; la de Q: μg·t
    for (const t of [0.1, 0.3]) { cerca(est(sim, t, 0).vx, v0 - m / Mp * mu * g * t, 1e-9); cerca(est(sim, t, 1).vx, mu * g * t, 1e-9); }
    const P = est(sim, 1.2, 0), Q = est(sim, 1.2, 1);
    cerca(P.vx, Mp * v0 / (Mp + m), 1e-9); cerca(Q.vx, P.vx, 1e-9);
    // Lo que Q se desliza sobre P (opción f) y el calor μmg por esa distancia
    const d = (est(sim, 0, 1).x - est(sim, 0, 0).x) - (est(sim, T, 1).x - est(sim, T, 0).x);
    cerca(d, Mp * v0 * v0 / (2 * (Mp + m) * mu * g), 1e-8);
    cerca(energiaMecanica(sim, 1.2).Qc, mu * m * g * d, 1e-8);
  });

  it('2006 · 1-(1): la mano que sube el peso despacio hasta el largo natural hace W = m²g²/(2k)', () => {
    const { sim } = simular('mext-2006-1-1');
    const m = 1, k = 50, D = (m * g / k) / 0.05;
    expect(sim.eventos).toEqual([]);
    cerca(est(sim, D, 1).y, 0.5, 1e-9);          // el peso llega al largo natural del resorte
    const e = energiaMecanica(sim, D), e0 = energiaMecanica(sim, 0);
    cerca(e.W, m * m * g * g / (2 * k), 1e-9);
    cerca(e.E + e.Qc + e.Qi - e.W, e0.E, 1e-9);
  });
});

describe('escenas MEXT: cinemática y proyectiles (M1, M2)', () => {
  const llegada = (sim, M, quien) => sim.eventos.find(e => e.clave.startsWith('impacto:') && describirEvento(e, M).includes(quien));
  const d2r = Math.PI / 180;

  it('2008 · 1-(1): con la misma rapidez, el alcance a 45° es 2/√3 veces el de 30°', () => {
    const { M, sim } = simular('mext-2008-1-1');
    const tA = llegada(sim, M, 'A').t, tB = llegada(sim, M, 'B').t;
    const RA = est(sim, tA, 0).x, RB = est(sim, tB, 1).x;
    cerca(RA, 100 * Math.sin(90 * d2r) / g, 1e-9);
    cerca(RB, 100 * Math.sin(60 * d2r) / g, 1e-9);
    cerca(RA / RB, 2 / Math.sqrt(3), 1e-9);
  });

  it('2010 · 1-C: en el instante t la altura es h = ½·g·t·(T − t)', () => {
    const { M, sim } = simular('mext-2010-1c');
    const T = llegada(sim, M, 'Pelota').t;
    cerca(T, 2 * 10 * Math.sin(60 * d2r) / g, 1e-9);
    for (const t of [0.3, 0.8, 1.4]) cerca(est(sim, t).y, 0.5 * g * t * (T - t), 1e-9);
  });

  it('2015 · 1-(1): el alcance es L = 2v²·sen θ·cos θ/g', () => {
    const { M, sim } = simular('mext-2015-1-1');
    const t = llegada(sim, M, 'partícula').t;
    cerca(est(sim, t).x, 2 * 64 * Math.sin(35 * d2r) * Math.cos(35 * d2r) / g, 1e-9);
  });

  it('2016 · 1-(1): desde el reposo hasta v en el tiempo t recorre v·t/2', () => {
    const { sim } = simular('mext-2016-1-1');
    const s = est(sim, 5);
    cerca(s.vx, 10, 1e-9);
    cerca(s.x, 10 * 5 / 2, 1e-9);
  });

  it('2018 · 1-(1): lanzado en horizontal desde h, llega con tan θ = √(2gh)/v', () => {
    const { M, sim } = simular('mext-2018-1-1');
    const e = llegada(sim, M, 'objeto');
    // Velocidad justo antes del choque (el evento guarda el estado ya tras él)
    const s = est(sim, e.t - 1e-9);
    cerca(Math.abs(s.vy) / s.vx, Math.sqrt(2 * g * 5) / 4, 1e-7);
    cerca(e.t, Math.sqrt(2 * 5 / g), 1e-9);
  });

  it('2027 · 1-(1): sube 4.9 m si sale a v0 = √(2gh) = 9.8 m/s', () => {
    const { sim } = simular('mext-2027-1-1');
    cerca(est(sim, 1).y, 4.9, 1e-9);
    cerca(est(sim, 1).vy, 0, 1e-9);
  });
});

describe('escenas MEXT: gráficas v–t con movimiento impuesto por tramos', () => {
  it('2017 · 1-(1): distancia (v1·t2 − v2·t1 + v2·t2)/2 con dos tramos de aceleración', () => {
    const { sim } = simular('mext-2017-1-1');
    const v1 = 8, t1 = 4, v2 = 2, t2 = 10;
    cerca(est(sim, t1).vx, v1, 1e-9);
    cerca(est(sim, t2).vx, v2, 1e-9);
    cerca(est(sim, t2).x, (v1 * t2 - v2 * t1 + v2 * t2) / 2, 1e-9);
  });
  it('2019 · 1-(1): el coche que arranca y frena en 80 s recorre el área del triángulo, 2000 m', () => {
    const { sim } = simular('mext-2019-1-1');
    cerca(est(sim, 40).vx, 50, 1e-9);
    cerca(est(sim, 80).vx, 0, 1e-9);
    cerca(est(sim, 80).x, 2000, 1e-9);
  });
  it('2023 · 1-(1): la posición en t = 8 s es el área con signo, 6 m', () => {
    const { sim } = simular('mext-2023-1-1');
    cerca(est(sim, 6).vx, 0, 1e-9);
    cerca(est(sim, 8).x, 6, 1e-9);
  });
  it('ejemplo del ascensor: el paquete va pegado al piso y la cabina entrega m·g·Δy', () => {
    const { sim } = simular('ascensor');
    expect(sim.eventos).toEqual([]);
    const P = estadoMecanica(sim, 7).find(s => s.id === 'p1');
    cerca(P.y, 20, 1e-9);
    cerca(energiaMecanica(sim, 7).W, 5 * g * 20, 1e-9);
  });
});
