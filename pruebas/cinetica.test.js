// Motor de gas molecular (dinámica por eventos de discos duros en 2D)
// contra la teoría cinética: presión medida en las paredes frente a N·k·T/A
// (corregida por el área excluida de los discos), equipartición
// ½·m·⟨v²⟩ = k·T por especie, distribución de Maxwell–Boltzmann en 2D,
// conservación de la energía, trabajo del émbolo = ΔE_k, adiabática
// T·A = cte (γ = 2), paredes térmicas, expansión libre, efusión (Graham),
// sin solapes y determinismo con semilla fija. Las tolerancias estadísticas
// están fijadas con la semilla de cada prueba y holgura de varias σ.
import { describe, it, expect } from 'vitest';
import {
  GasMolecular, simularMolecular, K_B, UMA, maxwell2D, rapidezMedia2D, rapidezRms2D, rapidezProbable2D,
  temperatura2D, compresibilidadDiscos,
} from '../sistema/motores/cinetica.js';

const Ar = (N, o = {}) => ({ nombre: 'Ar', m: 40 * UMA, r: 0.17e-9, N, ...o });
const He = (N, o = {}) => ({ nombre: 'He', m: 4 * UMA, r: 0.13e-9, N, ...o });
const CAJA = { Lx: 100e-9, Ly: 60e-9 };
const rel = (a, b) => Math.abs(a / b - 1);
const energiaTotal = g => g.energias().total;

describe('presión y temperatura', () => {
  it('P medida en las paredes = Z·N·k·T/A con Z de los discos duros (±2 %)', () => {
    const g = new GasMolecular({ ...CAJA, T: 300, semilla: 11, especies: [Ar(300)] });
    const dur = 2e-8;
    g.avanzar(dur);
    const P = g.J.reduce((a, b) => a + b, 0) / (dur * 2 * (CAJA.Lx + CAJA.Ly));
    const A = CAJA.Lx * CAJA.Ly, T = temperatura2D(energiaTotal(g), g.N);
    const eta = 300 * Math.PI * (0.17e-9) ** 2 / A;
    // Los centros no llegan a menos de r de las paredes: área accesible (Lx − 2r)(Ly − 2r)
    const Aacc = (CAJA.Lx - 0.34e-9) * (CAJA.Ly - 0.34e-9);
    expect(rel(P, compresibilidadDiscos(eta) * g.N * K_B * T / Aacc)).toBeLessThan(0.02);
    expect(rel(P, g.N * K_B * T / A)).toBeLessThan(0.04);         // y cerca del gas ideal
  });

  it('½·m·⟨v²⟩ = k·T: la temperatura sale de la energía cinética y se conserva con paredes adiabáticas', () => {
    const g = new GasMolecular({ ...CAJA, T: 500, semilla: 3, especies: [Ar(200)] });
    const E0 = energiaTotal(g);
    expect(rel(temperatura2D(E0, g.N), 500)).toBeLessThan(0.15);   // muestreo inicial de 200 moléculas
    g.avanzar(5e-9);
    expect(rel(energiaTotal(g), E0)).toBeLessThan(1e-12);          // choques elásticos: energía exacta
    expect(g.choques).toBeGreaterThan(1000);
  });

  it('equipartición: helio y argón mezclados acaban con la misma ⟨E_k⟩ y v_rms en razón √(m_Ar/m_He)', () => {
    const g = new GasMolecular({ ...CAJA, T: 300, semilla: 5, especies: [He(150), Ar(150)] });
    g.avanzar(2e-9);
    // Promedio temporal de la energía media por especie
    let eHe = 0, eAr = 0, k = 0;
    for (let t = 2.5e-9; t <= 8e-9 + 1e-15; t += 0.5e-9, k++) {
      g.avanzar(t);
      const e = g.energias().porEspecie; eHe += e[0] / 150; eAr += e[1] / 150;
    }
    eHe /= k; eAr /= k;
    expect(rel(eHe, eAr)).toBeLessThan(0.05);
    const vHe = Math.sqrt(2 * eHe / (4 * UMA)), vAr = Math.sqrt(2 * eAr / (40 * UMA));
    expect(rel(vHe / vAr, Math.sqrt(10))).toBeLessThan(0.03);
  });

  it('distribución de rapideces de Maxwell–Boltzmann en 2D (histograma, χ² razonable)', () => {
    const g = new GasMolecular({ ...CAJA, T: 300, semilla: 7, especies: [Ar(400)] });
    g.avanzar(1e-9);
    const m = 40 * UMA, T = temperatura2D(energiaTotal(g), g.N);
    const v = [];
    for (let t = 1.5e-9; t <= 10e-9 + 1e-15; t += 0.5e-9) { g.avanzar(t); v.push(...g.rapideces()); }
    // Medias contra las fórmulas 2D
    const media = v.reduce((a, b) => a + b, 0) / v.length, rms = Math.sqrt(v.reduce((a, b) => a + b * b, 0) / v.length);
    expect(rel(media, rapidezMedia2D(m, T))).toBeLessThan(0.02);
    expect(rel(rms, rapidezRms2D(m, T))).toBeLessThan(1e-9 + 0.02);
    // Histograma de 12 barras hasta 3·v_p contra la integral de f(v)
    const vp = rapidezProbable2D(m, T), B = 12, ancho = 3 * vp / B, cuentas = Array(B).fill(0);
    for (const x of v) { const i = Math.floor(x / ancho); if (i < B) cuentas[i]++; }
    const F = x => 1 - Math.exp(-m * x * x / (2 * K_B * T));        // acumulada de f(v) en 2D
    let chi = 0;
    for (let i = 0; i < B; i++) { const e = v.length * (F((i + 1) * ancho) - F(i * ancho)); chi += (cuentas[i] - e) ** 2 / e; }
    // Muestras correlacionadas (las mismas moléculas en 19 instantes): χ² holgado
    expect(chi / B).toBeLessThan(6);
    // La densidad integra 1
    let s = 0; for (let i = 0; i < 4000; i++) s += maxwell2D((i + 0.5) * 6 * vp / 4000, m, T) * 6 * vp / 4000;
    expect(Math.abs(s - 1)).toBeLessThan(1e-4);
  });
});

describe('émbolo, paredes térmicas y tabique', () => {
  it('compresión: el trabajo del émbolo es exactamente la energía cinética ganada y T·A ≈ cte (γ = 2)', () => {
    const sim = simularMolecular({ ...CAJA, T: 300, semilla: 3, embolo: [{ t0: 1e-9, t1: 6e-9, u: -10 }], especies: [Ar(300)] }, { duracion: 8e-9, cuadro: 8e-11 });
    expect(sim.incompleta).toBeNull();
    const m0 = sim.medidas[0], mf = sim.medidas[sim.medidas.length - 1];
    expect(Math.abs((mf.Ek - m0.Ek) - mf.Wemb) / mf.Wemb).toBeLessThan(1e-9);
    expect(mf.Xp).toBeCloseTo(50e-9, 15);
    // Adiabática 2D: T ∝ 1/A. La rapidez del émbolo es 1/40 de la térmica: casi reversible
    expect(rel(mf.Ek / m0.Ek, 2)).toBeLessThan(0.05);
    expect(mf.Ek / m0.Ek).toBeGreaterThan(2 - 1e-9);                // irreversible: nunca menos que la adiabática
  });

  it('paredes térmicas: el gas llega a la temperatura de las paredes y Q_pared = ΔE_k', () => {
    const g = new GasMolecular({ ...CAJA, T: 300, paredes: 'termica', Tpared: 600, semilla: 9, especies: [Ar(300)] });
    const E0 = energiaTotal(g);
    let T = 0, k = 0;
    g.avanzar(6e-9);
    for (let t = 6.5e-9; t <= 12e-9 + 1e-15; t += 0.5e-9, k++) { g.avanzar(t); T += temperatura2D(energiaTotal(g), g.N); }
    expect(rel(T / k, 600)).toBeLessThan(0.05);
    expect(Math.abs(energiaTotal(g) - E0 - g.Qpared) / g.Qpared).toBeLessThan(1e-9);
  });

  it('expansión libre: al abrir el tabique el gas llena la caja, T no cambia y P se reduce a la mitad', () => {
    const sim = simularMolecular({ ...CAJA, T: 300, semilla: 4, tabique: { x: 50e-9, hueco: 40e-9, abierto: false }, orificio: [{ t: 0.3e-9, abierto: true }], especies: [Ar(200, { region: 'izq' })] }, { duracion: 8e-9, cuadro: 8e-11 });
    const m0 = sim.medidas[0], mf = sim.medidas[sim.medidas.length - 1];
    expect(m0.izq).toBe(200);
    expect(Math.abs(mf.Ek - m0.Ek) / m0.Ek).toBeLessThan(1e-12);   // sin trabajo ni calor
    expect(mf.izq).toBeGreaterThan(70); expect(mf.izq).toBeLessThan(130);
    expect(m0.abierto).toBe(0); expect(mf.abierto).toBe(1);
  });

  it('efusión por un orificio: el helio pasa unas √10 veces más deprisa que el argón (Graham)', () => {
    const sim = simularMolecular({ ...CAJA, T: 300, semilla: 3, tabique: { x: 50e-9, hueco: 4e-9 }, especies: [He(150, { region: 'izq' }), Ar(150, { region: 'izq' })] }, { duracion: 1e-9, cuadro: 1e-11 });
    const k = sim.cuadros - 1, b = k * 2 * sim.N;
    let he = 0, ar = 0;
    for (let i = 0; i < sim.N; i++) if (sim.pos[b + 2 * i] > 50e-9) { if (sim.especie[i] === 0) he++; else ar++; }
    expect(he).toBeGreaterThan(10);
    expect(ar).toBeGreaterThan(0);
    const razon = he / ar;
    expect(razon).toBeGreaterThan(Math.sqrt(10) / 2);
    expect(razon).toBeLessThan(Math.sqrt(10) * 2);
  });

  it('ningún disco se solapa con otro tras miles de choques', () => {
    const g = new GasMolecular({ ...CAJA, T: 800, semilla: 13, especies: [He(150), Ar(150)] });
    g.avanzar(4e-9);
    expect(g.holguraMinima()).toBeGreaterThan(-1e-15);
    for (let i = 0; i < g.N; i++) {
      expect(g.x[i]).toBeGreaterThanOrEqual(g.r[i] - 1e-15); expect(g.x[i]).toBeLessThanOrEqual(CAJA.Lx - g.r[i] + 1e-15);
      expect(g.y[i]).toBeGreaterThanOrEqual(g.r[i] - 1e-15); expect(g.y[i]).toBeLessThanOrEqual(CAJA.Ly - g.r[i] + 1e-15);
    }
  });
});

describe('escenas imposibles y determinismo', () => {
  it('lanza con escenas que no describen una caja posible', () => {
    expect(() => new GasMolecular({ Lx: 0, Ly: 1e-8, T: 300, especies: [Ar(10)] })).toThrow(/ancho y alto/);
    expect(() => new GasMolecular({ ...CAJA, T: -1, especies: [Ar(10)] })).toThrow(/temperatura/);
    expect(() => new GasMolecular({ ...CAJA, T: 300, especies: [] })).toThrow(/especie/);
    expect(() => new GasMolecular({ ...CAJA, T: 300, especies: [Ar(2.5)] })).toThrow(/entero/);
    expect(() => new GasMolecular({ Lx: 2e-9, Ly: 2e-9, T: 300, especies: [Ar(500)] })).toThrow(/No caben/);
  });

  it('la misma escena con la misma semilla da exactamente el mismo resultado; otra semilla, otro', () => {
    const esc = { ...CAJA, T: 300, semilla: 21, especies: [He(60), Ar(60)] };
    const a = simularMolecular(esc, { duracion: 5e-10, cuadro: 5e-12 }), b = simularMolecular(esc, { duracion: 5e-10, cuadro: 5e-12 });
    expect(a.pos).toEqual(b.pos); expect(a.medidas).toEqual(b.medidas);
    const c = simularMolecular({ ...esc, semilla: 22 }, { duracion: 5e-10, cuadro: 5e-12 });
    expect(c.pos).not.toEqual(a.pos);
  });
});
