// Motor de N cuerpos con maniobras (Gravitación · Sistema solar y Maniobras):
// tercera ley con los planetas reales, conservación en N cuerpos, centro de
// masas, encuentros cercanos, Hohmann, circularización, escape, choques,
// jerarquía de primarios y determinismo.
import { describe, it, expect } from 'vitest';
import { CUERPOS, G, estadoKepler, estadoKeplerUniversal, elementosOrbitales, periodoOrbital } from '../sistema/motores/gravitacion.js';
import {
  UA, DIA, ANIO, PLANETAS, LUNA_ORBITA, estadoDesdeElementos, hohmann, baseOrbital, dvAXY, dvAOrbital, dvCircularizar, dvEscape,
  aBaricentro, sistemaSolar, tierraLuna, primarios, simularSistema, estadoSistema, estadoMuestra, indiceEn, tramoEn,
  centroMasas, momentoLinealSistema, energiaN, momentoAngularN, elementosRelativos,
} from '../sistema/motores/gravitacion-n.js';

const MU = CUERPOS.tierra.mu, R = CUERPOS.tierra.radio;
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const tierraFija = () => ({ nombre: 'Tierra', mu: MU, radio: R, fijo: true, x: 0, y: 0, vx: 0, vy: 0 });
const nave = (r, v, o = {}) => ({ nombre: 'Nave', masa: 1000, prueba: true, x: r, y: 0, vx: 0, vy: v, ...o });
// Máximo de |f(k)| relativo a f(0) en las muestras
const peorDeriva = (sim, f, paso = 1) => {
  const f0 = f(0);
  let peor = 0;
  for (let k = 0; k < sim.t.length; k += paso) peor = Math.max(peor, Math.abs(f(k) - f0) / Math.abs(f0));
  return peor;
};

describe('datos reales y presets', () => {
  it('estadoDesdeElementos reproduce a, e y ω, y coincide con la solución de Kepler', () => {
    for (const [a, e, w, M] of [[7e6, 0, 0, 0], [2.4e7, 0.7, 1.1, 2.3], [1.5e11, 0.0167, 1.8, -0.5]]) {
      const mu = a > 1e9 ? CUERPOS.sol.mu : MU, s = estadoDesdeElementos(mu, { a, e, omega: w, M });
      const el = elementosOrbitales(mu, [s.x, s.y], [s.vx, s.vy]);
      expect(rel(el.a, a)).toBeLessThan(1e-12);
      expect(Math.abs(el.e - e)).toBeLessThan(1e-12);
      if (e > 0) expect(Math.abs(Math.atan2(Math.sin(el.omega - w), Math.cos(el.omega - w)))).toBeLessThan(1e-10);
      // Avanzar ΔM es avanzar Δt = ΔM/n
      const n = Math.sqrt(mu / a ** 3), s2 = estadoDesdeElementos(mu, { a, e, omega: w, M: M + 0.4 }), k = estadoKepler(mu, [s.x, s.y], [s.vx, s.vy], 0.4 / n);
      expect(Math.hypot(s2.x - k.x, s2.y - k.y) / a).toBeLessThan(1e-11);
    }
  });
  it('el Sistema Solar en J2000: semiejes reales y centro de masa en reposo en el origen', () => {
    const cs = sistemaSolar();
    expect(cs.map(c => c.nombre)).toEqual(['Sol', 'Mercurio', 'Venus', 'Tierra', 'Marte', 'Júpiter', 'Saturno', 'Urano', 'Neptuno']);
    const cfg = { mu: cs.map(c => c.mu), masa: cs.map(c => c.masa) };
    const cm = centroMasas(cfg, cs);
    expect(Math.hypot(cm.x, cm.y)).toBeLessThan(1e-3);
    expect(Math.hypot(cm.vx, cm.vy)).toBeLessThan(1e-12);
    for (const [i, k] of Object.keys(PLANETAS).entries()) {
      const el = elementosRelativos(cfg, cs, i + 1, 0);
      expect(rel(el.a, PLANETAS[k].a)).toBeLessThan(1e-9);
      expect(Math.abs(el.e - PLANETAS[k].e)).toBeLessThan(1e-9);
    }
    // La Tierra a 1 UA (±e) y Neptuno a ~30 UA del Sol
    const d = i => Math.hypot(cs[i].x - cs[0].x, cs[i].y - cs[0].y) / UA;
    expect(d(3)).toBeGreaterThan(0.983); expect(d(3)).toBeLessThan(1.017);
    expect(d(8)).toBeGreaterThan(29.8); expect(d(8)).toBeLessThan(30.4);
  });
  it('Tierra y Luna: periodo de la Luna 2π√(a³/G(M + m)) ≈ 27.28 d (sin el Sol) y baricentro dentro de la Tierra', () => {
    const cs = tierraLuna(), mu = CUERPOS.tierra.mu + CUERPOS.luna.mu;
    const cm = centroMasas({ mu: cs.map(c => c.mu), masa: cs.map(c => c.masa) }, cs);
    expect(Math.hypot(cm.x, cm.y)).toBeLessThan(1e-6);
    expect(Math.hypot(cs[0].x, cs[0].y)).toBeLessThan(R);            // el baricentro está dentro de la Tierra
    const sim = simularSistema({ cuerpos: cs, duracion: 30 * DIA, dt: 900, integrador: 'adaptativo' });
    const T = sim.eventos.find(e => e.tipo === 'vuelta').t;
    expect(rel(T, 2 * Math.PI * Math.sqrt(LUNA_ORBITA.a ** 3 / mu))).toBeLessThan(1e-10);
    expect(T / DIA).toBeCloseTo(27.28, 2);
  });
  it('jerarquía por esferas de Hill: la Luna orbita la Tierra y la Tierra el Sol', () => {
    const ss = sistemaSolar(['venus', 'tierra', 'marte']), [tl0, tl1] = tierraLuna(), T = ss[2];
    const mover = c => ({ ...c, x: T.x + c.x, y: T.y + c.y, vx: T.vx + c.vx, vy: T.vy + c.vy });
    const cs = [ss[0], ss[1], mover(tl0), ss[3], mover(tl1), { nombre: 'Satélite', prueba: true, ...mover({ x: tl0.x + 4.2e7, y: tl0.y, vx: 0, vy: 3.07e3 }) }];
    const p = primarios(cs.map(c => ({ mu: c.prueba ? 0 : c.mu })), cs);
    expect(Array.from(p)).toEqual([-1, 0, 0, 0, 2, 2]);
    // Un primario pedido manda
    expect(Array.from(primarios(cs.map((c, i) => ({ mu: c.prueba ? 0 : c.mu, primario: i === 5 ? 4 : undefined })), cs))[5]).toBe(4);
  });
});

describe('tercera ley de Kepler con los planetas reales', () => {
  const claves = ['mercurio', 'venus', 'tierra', 'marte', 'jupiter', 'saturno'];
  const sim = simularSistema({ cuerpos: sistemaSolar(claves), duracion: 30 * ANIO, dt: 0.5 * DIA, apsides: false });
  const tr = sim.tramos[0];
  // Periodo medido (primera vuelta alrededor del Sol) y semieje medio en esa vuelta
  const medidas = claves.map((k, q) => {
    const i = q + 1, T = sim.eventos.find(e => e.tipo === 'vuelta' && e.cuerpo === i).t;
    let sa = 0, c = 0;
    for (let m = 0; m < sim.t.length && sim.t[m] <= T; m += 4) { sa += elementosRelativos(tr, estadoMuestra(sim, m), i, 0).a; c++; }
    return { k, T, a: sa / c, mu: tr.mu[0] + tr.mu[i] };
  });

  it('los periodos medidos son los siderales reales', () => {
    const real = { mercurio: 87.969, venus: 224.701, tierra: 365.256, marte: 686.980, jupiter: 4332.59 };
    for (const { k, T } of medidas) if (real[k]) expect(rel(T / DIA, real[k])).toBeLessThan(k === 'jupiter' ? 1e-3 : 1e-4);
  });
  it('T²·G(M + m)/(4π²a³) = 1: T²/a³ es la misma constante para todos', () => {
    const cota = { mercurio: 1e-4, venus: 1e-4, tierra: 1e-4, marte: 2e-4, jupiter: 1e-3, saturno: 1e-2 };
    for (const { k, T, a, mu } of medidas) expect(Math.abs(T * T * mu / (4 * Math.PI ** 2 * a ** 3) - 1)).toBeLessThan(cota[k]);
    // En años y UA: T²/a³ ≈ 1 año²/UA³ desde Mercurio hasta Saturno
    const k = medidas.map(({ T, a }) => (T / ANIO) ** 2 / (a / UA) ** 3);
    for (const x of k) expect(Math.abs(x - 1)).toBeLessThan(0.012);
    expect(Math.max(...k.slice(0, 4)) - Math.min(...k.slice(0, 4))).toBeLessThan(3e-4);
  });
  it('el sistema conserva la energía, el momento angular y el centro de masa en reposo', () => {
    const st = k => estadoMuestra(sim, k);
    expect(peorDeriva(sim, k => energiaN(tr, st(k)).E, 37)).toBeLessThan(1e-8);
    expect(peorDeriva(sim, k => momentoAngularN(tr, st(k)), 37)).toBeLessThan(1e-12);
    for (let k = 0; k < sim.t.length; k += 211) {
      const cm = centroMasas(tr, st(k));
      expect(Math.hypot(cm.x, cm.y)).toBeLessThan(1);                 // m, a 30 años y 10 UA
      expect(Math.hypot(cm.vx, cm.vy)).toBeLessThan(1e-9);
    }
  });
});

describe('conservación en N cuerpos', () => {
  // Tres cuerpos de Burrau (problema pitagórico): masas 3, 4 y 5 en reposo en
  // los vértices de un triángulo 3-4-5, G = 1. Encuentros a menos de 10⁻² de la escala
  const pitagorico = () => [[3, 1, 3], [4, -2, -1], [5, 1, -1]].map(([m, x, y]) => ({ nombre: `m${m}`, mu: m, masa: m, x, y, vx: 0, vy: 0 }));
  const pita = simularSistema({ cuerpos: pitagorico(), duracion: 70, dt: 0.02, integrador: 'adaptativo', apsides: false, vueltas: false });
  const tr = pita.tramos[0], st = k => estadoMuestra(pita, k);

  it('problema pitagórico: E = −769/60, conservada (< 10⁻⁶) a través de los encuentros cercanos', () => {
    expect(energiaN(tr, st(0)).E).toBeCloseTo(-769 / 60, 12);
    let dmin = Infinity;
    for (let k = 0; k < pita.t.length; k++) { const s = st(k); for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) dmin = Math.min(dmin, Math.hypot(s[i].x - s[j].x, s[i].y - s[j].y)); }
    expect(dmin).toBeLessThan(0.02);
    expect(peorDeriva(pita, k => energiaN(tr, st(k)).E)).toBeLessThan(1e-6);
    expect(pita.incompleta).toBeNull();
  });
  it('problema pitagórico: L = 0 y el centro de masa sigue en reposo', () => {
    for (let k = 0; k < pita.t.length; k += 7) {
      const s = st(k), cm = centroMasas(tr, s), p = momentoLinealSistema(tr, s);
      expect(Math.abs(momentoAngularN(tr, s))).toBeLessThan(1e-8);
      expect(Math.hypot(cm.x, cm.y)).toBeLessThan(1e-9);
      expect(Math.hypot(...p)).toBeLessThan(1e-9);
    }
  });
  it('problema pitagórico: el desenlace conocido, la masa 3 sale despedida y 4 y 5 forman una binaria', () => {
    const s = st(pita.t.length - 1);
    const d45 = Math.hypot(s[1].x - s[2].x, s[1].y - s[2].y), r3 = Math.hypot(s[0].x, s[0].y);
    const v2 = (s[1].vx - s[2].vx) ** 2 + (s[1].vy - s[2].vy) ** 2;
    expect(0.5 * v2 - 9 / d45).toBeLessThan(0);                            // la binaria está ligada
    expect(r3).toBeGreaterThan(10);
    expect(s[0].x * s[0].vx + s[0].y * s[0].vy).toBeGreaterThan(0);        // y la 3 se aleja
    expect(s[0].y).toBeGreaterThan(0);
  });
  it('figura en ocho (Chenciner–Montgomery): tres masas iguales vuelven al estado inicial tras un periodo', () => {
    const p = [0.97000436, -0.24308753], v = [-0.93240737, -0.86473146], T = 6.32591398;
    const cs = [
      { nombre: 'A', mu: 1, masa: 1, x: p[0], y: p[1], vx: -v[0] / 2, vy: -v[1] / 2 },
      { nombre: 'B', mu: 1, masa: 1, x: -p[0], y: -p[1], vx: -v[0] / 2, vy: -v[1] / 2 },
      { nombre: 'C', mu: 1, masa: 1, x: 0, y: 0, vx: v[0], vy: v[1] },
    ];
    for (const integrador of ['adaptativo', 'auto']) {
      const sim = simularSistema({ cuerpos: cs, duracion: T, dt: T / 600, integrador, apsides: false, vueltas: false });
      const f = estadoMuestra(sim, sim.t.length - 1);
      cs.forEach((c, i) => expect(Math.hypot(f[i].x - c.x, f[i].y - c.y)).toBeLessThan(2e-6));
      const t2 = sim.tramos[0];
      expect(peorDeriva(sim, k => energiaN(t2, estadoMuestra(sim, k)).E)).toBeLessThan(integrador === 'auto' ? 1e-7 : 1e-10);
    }
  });
  it('dos estrellas con velocidad de arrastre: el centro de masa va en línea recta y uniforme', () => {
    // Binaria 2:1 separada 3·10¹¹ m con el 80 % de la velocidad circular relativa
    const V = [1.2e3, -0.7e3], vrel = 0.8 * Math.sqrt(G * 3e30 / 3e11);
    const cs = aBaricentro([
      { nombre: 'A', masa: 2e30, x: -1e11, y: 0, vx: 0, vy: -vrel / 3 },
      { nombre: 'B', masa: 1e30, x: 2e11, y: 0, vx: 0, vy: 2 * vrel / 3 },
    ]).map(c => ({ ...c, vx: c.vx + V[0], vy: c.vy + V[1] }));
    const sim = simularSistema({ cuerpos: cs, duracion: 4 * ANIO, dt: DIA / 4 });
    const tr = sim.tramos[0];
    for (let k = 0; k < sim.t.length; k += 53) {
      const cm = centroMasas(tr, estadoMuestra(sim, k));
      expect(Math.hypot(cm.x - V[0] * sim.t[k], cm.y - V[1] * sim.t[k])).toBeLessThan(1e-6 * 3e11);
      expect(Math.hypot(cm.vx - V[0], cm.vy - V[1])).toBeLessThan(1e-9);
    }
    expect(peorDeriva(sim, k => energiaN(tr, estadoMuestra(sim, k)).E, 11)).toBeLessThan(1e-9);
  });
});

describe('encuentros cercanos', () => {
  // Partícula que pasa junto a un planeta fijo con periapsis a 1/2000 de la distancia inicial
  const mu = MU, r0 = 4e8, rp = 2e5 + R, vinf = 900;
  const b = rp * Math.sqrt(1 + 2 * mu / (rp * vinf * vinf));                 // parámetro de impacto
  const p0 = [-r0, b], v0 = [Math.sqrt(vinf * vinf + 2 * mu / Math.hypot(r0, b)), 0];
  const escena = integrador => ({ cuerpos: [{ nombre: 'Planeta', mu, fijo: true, x: 0, y: 0, vx: 0, vy: 0 }, { nombre: 'Sonda', masa: 1, prueba: true, x: p0[0], y: p0[1], vx: v0[0], vy: v0[1] }], duracion: 9e5, dt: 3000, integrador });

  it('sobrevuelo hiperbólico: el adaptativo sigue a Kepler a 10⁻⁹ antes, durante y después del periapsis', () => {
    const sim = simularSistema(escena('adaptativo'));
    const peri = sim.eventos.find(e => e.tipo === 'periapsis');
    expect(rel(peri.r, elementosOrbitales(mu, p0, v0).rp)).toBeLessThan(1e-9);
    for (const t of [1e5, peri.t - 500, peri.t, peri.t + 137, 6e5, 9e5]) {
      const [, s] = estadoSistema(sim, t), k = estadoKeplerUniversal(mu, p0, v0, t);
      expect(Math.hypot(s.x - k.x, s.y - k.y) / Math.max(Math.hypot(k.x, k.y), rp)).toBeLessThan(1e-9);
    }
  });
  it('el modo automático pasa al adaptativo en el encuentro y conserva la misma exactitud', () => {
    const sim = simularSistema(escena('auto')), simY = simularSistema(escena('yoshida4'));
    const adapt = sim.metodo.reduce((a, b) => a + b, 0);
    expect(adapt).toBeGreaterThan(0);
    expect(adapt).toBeLessThan(sim.t.length / 4);                          // solo cerca del periapsis
    const err = s => { const f = estadoMuestra(s, s.t.length - 1)[1], k = estadoKeplerUniversal(mu, p0, v0, 9e5); return Math.hypot(f.x - k.x, f.y - k.y) / Math.hypot(k.x, k.y); };
    // Lejos del planeta manda el simpléctico (con su error de truncamiento); el encuentro no lo empeora
    expect(err(sim)).toBeLessThan(1e-6);
    expect(err(simY)).toBeGreaterThan(100 * err(sim));                    // el simpléctico de paso fijo se pierde
  });
  it('órbita de excentricidad 0.99 entre dos cuerpos libres: Kepler relativo y energía conservada', () => {
    const e = 0.99, ra = 1, a = ra / (1 + e), va = Math.sqrt((1 - e) / ra), T = periodoOrbital(1, a);
    const sim = simularSistema({ cuerpos: [{ nombre: 'a', mu: 0.5, masa: 0.5, x: 0, y: 0, vx: 0, vy: -va / 2 }, { nombre: 'b', mu: 0.5, masa: 0.5, x: ra, y: 0, vx: 0, vy: va / 2 }], duracion: 3 * T, dt: T / 50, integrador: 'adaptativo' });
    for (const t of [T, 2 * T, 3 * T]) {
      const [p, q] = estadoSistema(sim, t), k = estadoKepler(1, [ra, 0], [0, va], t);
      expect(Math.hypot(q.x - p.x - k.x, q.y - p.y - k.y) / a).toBeLessThan(5e-7);
    }
    const tr = sim.tramos[0];
    expect(peorDeriva(sim, k => energiaN(tr, estadoMuestra(sim, k)).E)).toBeLessThan(1e-8);
    expect(sim.eventos.filter(e => e.tipo === 'periapsis')).toHaveLength(3);
  });
});

describe('maniobras', () => {
  const r1 = R + 300e3, v1 = Math.sqrt(MU / r1);

  it('Hohmann: Δv₁ y Δv₂ de las fórmulas; la transferencia dura medio periodo de la elipse y acaba circular en r₂', () => {
    for (const r2 of [42164e3, 2 * r1, R + 180e3]) {
      const H = hohmann(MU, r1, r2), aT = (r1 + r2) / 2;
      expect(rel(H.dv1, Math.sqrt(MU / r1) * (Math.sqrt(2 * r2 / (r1 + r2)) - 1))).toBeLessThan(1e-12);
      expect(rel(H.dv2, Math.sqrt(MU / r2) * (1 - Math.sqrt(2 * r1 / (r1 + r2))))).toBeLessThan(1e-12);
      expect(rel(H.tTransferencia, periodoOrbital(MU, aT) / 2)).toBeLessThan(1e-14);
      const t1 = 1200;
      const sim = simularSistema({
        cuerpos: [tierraFija(), nave(r1, v1)], duracion: t1 + H.tTransferencia + periodoOrbital(MU, r2), dt: periodoOrbital(MU, Math.min(r1, r2)) / 300, integrador: 'adaptativo',
        impulsos: [{ cuerpo: 1, t: t1, dv: [H.dv1, 0] }, { cuerpo: 1, evento: H.segundo, dv: [H.dv2, 0] }],
      });
      const imp = sim.eventos.filter(e => e.tipo === 'impulso');
      expect(imp).toHaveLength(2);
      expect(imp[0].t).toBe(t1);
      expect(rel(imp[0].dvModulo, Math.abs(H.dv1))).toBeLessThan(1e-12);
      expect(rel(imp[1].dvModulo, Math.abs(H.dv2))).toBeLessThan(1e-12);
      expect(rel(imp[1].t - imp[0].t, H.tTransferencia)).toBeLessThan(1e-9);
      expect(rel(imp[1].r, r2)).toBeLessThan(1e-9);
      expect(rel(sim.dvTotal[1], H.dvTotal)).toBeLessThan(1e-12);
      const [, f] = estadoSistema(sim, sim.duracion), el = elementosOrbitales(MU, [f.x, f.y], [f.vx, f.vy]);
      expect(rel(el.a, r2)).toBeLessThan(1e-9);
      expect(el.e).toBeLessThan(1e-8);
      expect(sim.pendientes).toEqual([]);
    }
  });
  it('Hohmann a la órbita geoestacionaria: Δv total ≈ 3.89 km/s y 5.27 h de transferencia', () => {
    const H = hohmann(MU, r1, 42164e3);
    expect(H.dv1 / 1e3).toBeCloseTo(2.426, 3);
    expect(H.dv2 / 1e3).toBeCloseTo(1.467, 3);
    expect(H.dvTotal / 1e3).toBeCloseTo(3.893, 3);
    expect(H.tTransferencia / 3600).toBeCloseTo(5.275, 3);
  });
  it('Hohmann de la Tierra a Marte (órbitas circulares de 1 y 1.524 UA): 259 días', () => {
    const H = hohmann(CUERPOS.sol.mu, UA, PLANETAS.marte.a);
    expect(H.tTransferencia / DIA).toBeCloseTo(258.8, 0);
    expect(H.dv1 / 1e3).toBeCloseTo(2.94, 2);
    expect(H.dv2 / 1e3).toBeCloseTo(2.65, 2);
  });
  it('circularizar en el apoapsis: el impulso de dvCircularizar deja e = 0 en r = r_a', () => {
    const rp = R + 500e3, ra = R + 5000e3, a = (rp + ra) / 2, vp = Math.sqrt(MU * (2 / rp - 1 / a)), va = Math.sqrt(MU * (2 / ra - 1 / a));
    const dv = dvCircularizar(MU, [-ra, 0], [0, -va]);
    expect(rel(Math.hypot(...dv), Math.sqrt(MU / ra) - va)).toBeLessThan(1e-12);
    expect(dvAOrbital([-ra, 0], [0, -va], dv)[1]).toBeCloseTo(0, 9);
    const T = periodoOrbital(MU, a);
    const sim = simularSistema({ cuerpos: [tierraFija(), nave(rp, vp)], duracion: 2.5 * T, dt: T / 400, impulsos: [{ cuerpo: 1, evento: 'apoapsis', dv: [Math.sqrt(MU / ra) - va, 0] }] });
    const imp = sim.eventos.find(e => e.tipo === 'impulso');
    expect(rel(imp.t, T / 2)).toBeLessThan(1e-7);
    const [, f] = estadoSistema(sim, sim.duracion), el = elementosOrbitales(MU, [f.x, f.y], [f.vx, f.vy]);
    expect(el.e).toBeLessThan(1e-7);
    expect(rel(el.r, ra)).toBeLessThan(1e-7);
    // Circular: ya no hay ápsides después del impulso
    expect(sim.eventos.filter(e => (e.tipo === 'periapsis' || e.tipo === 'apoapsis') && e.t > imp.t + 1)).toEqual([]);
  });
  it('escape con un impulso prógrado: hasta 1.01·v_e escapa; hasta 0.99·v_e sigue ligada (apogeo a los 3.9 días)', () => {
    const dv = dvEscape(MU, [r1, 0], [0, v1]);
    expect(rel(dv, (Math.SQRT2 - 1) * v1)).toBeLessThan(1e-14);
    const lanzar = k => simularSistema({ cuerpos: [tierraFija(), nave(r1, v1)], duracion: 5 * 86400, dt: 20, impulsos: [{ cuerpo: 1, t: 600, dv: [v1 * (k * Math.SQRT2 - 1), 0] }] });
    const alto = lanzar(1.01), bajo = lanzar(0.99);
    const fin = s => estadoSistema(s, s.duracion)[1];
    const fa = fin(alto), fb = fin(bajo);
    expect(elementosOrbitales(MU, [fa.x, fa.y], [fa.vx, fa.vy]).energia).toBeGreaterThan(0);
    expect(alto.eventos.filter(e => e.tipo === 'apoapsis')).toEqual([]);
    const k0 = indiceEn(alto, 700);
    for (let k = k0 + 1; k < alto.t.length; k++) expect(Math.hypot(alto.cuerpos[1].x[k], alto.cuerpos[1].y[k])).toBeGreaterThan(Math.hypot(alto.cuerpos[1].x[k - 1], alto.cuerpos[1].y[k - 1]));
    const lig = elementosOrbitales(MU, [fb.x, fb.y], [fb.vx, fb.vy]);
    expect(lig.energia).toBeLessThan(0);
    const apo = bajo.eventos.find(e => e.tipo === 'apoapsis');
    expect(rel(apo.t - 600, lig.periodo / 2)).toBeLessThan(1e-5);
    expect(rel(apo.r, lig.ra)).toBeLessThan(1e-6);
  });
  it('los impulsos de evento se arman en orden: cada uno espera al anterior del mismo cuerpo', () => {
    const rp = R + 600e3, ra = R + 3000e3, a = (rp + ra) / 2, vp = Math.sqrt(MU * (2 / rp - 1 / a)), T = periodoOrbital(MU, a);
    const sim = simularSistema({
      cuerpos: [tierraFija(), nave(rp, vp)], duracion: 6 * T, dt: T / 500, integrador: 'adaptativo',
      impulsos: [
        { cuerpo: 1, t: 0.25 * T, dv: [0, 0], nombre: 'Marca' },
        { cuerpo: 1, evento: 'periapsis', n: 2, dv: [10, 0], nombre: 'Segundo perigeo' },
        { cuerpo: 1, evento: 'apoapsis', dv: [-10, 0], nombre: 'Apogeo siguiente' },
      ],
    });
    const imp = sim.eventos.filter(e => e.tipo === 'impulso');
    expect(imp.map(e => e.nombre)).toEqual(['Marca', 'Segundo perigeo', 'Apogeo siguiente']);
    // Perigeos en T y 2T: el segundo desde que se arma (t = T/4) es el de 2T
    expect(rel(imp[1].t, 2 * T)).toBeLessThan(1e-9);
    // El de apogeo llega medio periodo de la órbita nueva después, en su apogeo
    const nueva = elementosOrbitales(MU, [imp[1].x, imp[1].y], [imp[1].vx, imp[1].vy]);
    expect(rel(imp[2].t - imp[1].t, nueva.periodo / 2)).toBeLessThan(1e-9);
    expect(rel(imp[2].r, nueva.ra)).toBeLessThan(1e-9);
    expect(nueva.ra).toBeGreaterThan(ra);
  });
  it('un impulso a t = 0 deja dos muestras en t = 0 (antes y después) y estadoSistema(0) da el estado tras el impulso', () => {
    const sim = simularSistema({ cuerpos: [tierraFija(), nave(r1, v1)], duracion: 3000, dt: 20, impulsos: [{ cuerpo: 1, t: 0, dv: [100, 50] }] });
    expect(sim.t[0]).toBe(0); expect(sim.t[1]).toBe(0);
    const [, s] = estadoSistema(sim, 0), dv = dvAXY([r1, 0], [0, v1], [100, 50]);
    expect(s.vx).toBeCloseTo(dv[0], 9); expect(s.vy).toBeCloseTo(v1 + dv[1], 9);
    expect(sim.cuerpos[1].vy[0]).toBe(v1);
  });
  it('la base orbital: prógrado según v, radial hacia fuera y perpendicular', () => {
    const { ut, un } = baseOrbital([7e6, 1e6], [-1e3, 7.5e3]);
    expect(Math.hypot(...ut)).toBeCloseTo(1, 14); expect(Math.hypot(...un)).toBeCloseTo(1, 14);
    expect(ut[0] * un[0] + ut[1] * un[1]).toBeCloseTo(0, 14);
    expect(un[0] * 7e6 + un[1] * 1e6).toBeGreaterThan(0);
    const dv = [123, -45], ida = dvAOrbital([7e6, 1e6], [-1e3, 7.5e3], dvAXY([7e6, 1e6], [-1e3, 7.5e3], dv));
    expect(ida[0]).toBeCloseTo(dv[0], 10); expect(ida[1]).toBeCloseTo(dv[1], 10);
  });
});

describe('choques', () => {
  it('dos cuerpos masivos que chocan se funden: se conservan la masa, el momento lineal y el centro de masa', () => {
    const cs = [
      { nombre: 'A', masa: 6e24, radio: 6.4e6, x: -3e7, y: 1e6, vx: 2e3, vy: 0 },
      { nombre: 'B', masa: 2e24, radio: 4e6, x: 3e7, y: 0, vx: -3e3, vy: 100 },
    ];
    const sim = simularSistema({ cuerpos: cs, duracion: 20000, dt: 20 });
    const imp = sim.eventos.find(e => e.tipo === 'impacto');
    expect(imp.fusion).toBe(true);
    expect(imp.r).toBeCloseTo(10.4e6, -1);
    expect(sim.tramos).toHaveLength(2);
    const k = sim.tramos[1].k, tr = sim.tramos[1];
    expect(tr.masa[0]).toBe(8e24); expect(tr.masa[1]).toBe(0); expect(tr.activo[1]).toBe(0);
    expect(tr.radio[0]).toBeCloseTo(Math.cbrt(6.4e6 ** 3 + 4e6 ** 3), 0);
    const antes = centroMasas(tramoEn(sim, k - 1), estadoMuestra(sim, k - 1)), despues = centroMasas(tr, estadoMuestra(sim, k));
    for (const c of ['x', 'y', 'vx', 'vy']) expect(Math.abs(despues[c] - antes[c])).toBeLessThan(1e-9 * (c[0] === 'v' ? 3e3 : 3e7));
    const p0 = momentoLinealSistema({ mu: [1, 1], masa: [6e24, 2e24] }, estadoMuestra(sim, 0)), pf = momentoLinealSistema(tr, estadoSistema(sim, 20000));
    expect(Math.hypot(pf[0] - p0[0], pf[1] - p0[1]) / Math.hypot(...p0)).toBeLessThan(1e-12);
    // El absorbido sigue al que lo absorbe y deja de existir
    const f = estadoSistema(sim, 15000);
    expect(f[1].activo).toBe(false);
    expect(f[1].x).toBe(f[0].x);
  });
  it('una partícula de prueba que toca la superficie se posa y sigue al planeta', () => {
    const v = 6000, h = 800e3;
    const sim = simularSistema({ cuerpos: [{ nombre: 'Tierra', mu: MU, radio: R, x: 0, y: 0, vx: 500, vy: 0 }, nave(R + h, 500 + 0, { vx: 500, vy: v })], duracion: 6000, dt: 5 });
    const imp = sim.eventos.find(e => e.tipo === 'impacto');
    expect(imp.fusion).toBeUndefined();
    expect(rel(imp.r, R)).toBeLessThan(1e-9);
    const [p, s] = estadoSistema(sim, 5900);
    expect(s.posado).toBe(true);
    expect(Math.hypot(s.x - p.x, s.y - p.y)).toBeCloseTo(R, -1);
    expect(s.vx).toBe(p.vx);
  });
  it('un impulso despega a una nave posada', () => {
    const sim = simularSistema({
      cuerpos: [tierraFija(), { nombre: 'Nave', masa: 1, prueba: true, x: R + 1000, y: 0, vx: 0, vy: 0 }], duracion: 4000, dt: 2,
      impulsos: [{ cuerpo: 1, t: 1500, marco: 'xy', dv: [3000, 7600] }],
    });
    const tipos = sim.eventos.map(e => e.tipo);
    expect(tipos.slice(0, 2)).toEqual(['impacto', 'impulso']);
    expect(estadoSistema(sim, 1400)[1].posado).toBe(true);
    expect(estadoSistema(sim, 1600)[1].posado).toBe(false);
    expect(Math.hypot(estadoSistema(sim, 1600)[1].x, estadoSistema(sim, 1600)[1].y)).toBeGreaterThan(R);
  });
});

describe('robustez', () => {
  it('rechaza escenas inválidas', () => {
    expect(() => simularSistema({ cuerpos: [], duracion: 1, dt: 1 })).toThrow();
    expect(() => simularSistema({ cuerpos: [tierraFija()], duracion: 1, dt: 0 })).toThrow();
    expect(() => simularSistema({ cuerpos: [{ ...tierraFija(), x: NaN }], duracion: 1, dt: 1 })).toThrow();
    expect(() => simularSistema({ cuerpos: [tierraFija()], duracion: 1, dt: 1, integrador: 'euler' })).toThrow();
    expect(() => simularSistema({ cuerpos: [tierraFija()], duracion: 1, dt: 1, impulsos: [{ cuerpo: 3, t: 0, dv: [1, 0] }] })).toThrow();
    expect(() => simularSistema({ cuerpos: [tierraFija(), nave(7e6, 7e3)], duracion: 1, dt: 1, impulsos: [{ cuerpo: 1, dv: [1, 0] }] })).toThrow();
  });
  it('dos masas puntuales en caída frontal: no aborta, devuelve lo simulado con «incompleta»', () => {
    const sim = simularSistema({ cuerpos: [{ nombre: 'A', mu: 1, masa: 1, x: -1, y: 0, vx: 0, vy: 0 }, { nombre: 'B', mu: 1, masa: 1, x: 1, y: 0, vx: 0, vy: 0 }], duracion: 10, dt: 0.01, vueltas: false, apsides: false });
    expect(sim.incompleta).not.toBeNull();
    expect(sim.incompleta.t).toBeGreaterThan(1.5);
    expect(sim.incompleta.t).toBeLessThan(Math.PI / 2 * Math.sqrt(8 / 2) + 1e-6);   // tiempo de caída libre
    expect(sim.duracion).toBe(sim.incompleta.t);
  });
  it('el presupuesto de cálculo corta la simulación sin lanzar', () => {
    const sim = simularSistema({ cuerpos: sistemaSolar(['mercurio', 'venus']), duracion: 10 * ANIO, dt: DIA, integrador: 'adaptativo', maxEvaluaciones: 5000 });
    expect(sim.incompleta.motivo).toMatch(/límite/);
    expect(sim.duracion).toBeLessThan(10 * ANIO);
  });
});

describe('determinismo', () => {
  const escena = () => ({
    cuerpos: [...tierraLuna(), { nombre: 'Nave', masa: 1000, prueba: true, x: R + 400e3, y: 0, vx: 0, vy: Math.sqrt(MU / (R + 400e3)) }],
    duracion: 5 * DIA, dt: 60,
    impulsos: [{ cuerpo: 2, t: 3000, dv: [3100, 0] }, { cuerpo: 2, evento: 'apoapsis', dv: [200, 30] }],
  });
  it('la misma escena da exactamente el mismo resultado (también con impulsos y el adaptativo)', () => {
    const a = simularSistema(escena()), b = simularSistema(escena());
    expect(a).toEqual(b);
    for (const t of [0, 2999, 3000, 12345.6, 4 * DIA]) expect(estadoSistema(a, t)).toEqual(estadoSistema(b, t));
    const c = simularSistema({ ...escena(), integrador: 'adaptativo' }), d = simularSistema({ ...escena(), integrador: 'adaptativo' });
    expect(c).toEqual(d);
  });
  it('estadoSistema reproduce exactamente las muestras guardadas', () => {
    for (const integrador of ['auto', 'adaptativo', 'yoshida4']) {
      const sim = simularSistema({ ...escena(), integrador });
      for (const k of [1, 57, Math.floor(sim.t.length / 2), sim.t.length - 1]) {
        // Tras un impulso hay dos muestras con el mismo t: vale la de después
        const kk = indiceEn(sim, sim.t[k]);
        const s = estadoSistema(sim, sim.t[k]);
        sim.cuerpos.forEach((c, i) => expect([s[i].x, s[i].y, s[i].vx, s[i].vy]).toEqual([c.x[kk], c.y[kk], c.vx[kk], c.vy[kk]]));
      }
    }
  });
  it('G de la escena: la masa da μ = G·m', () => {
    const sim = simularSistema({ cuerpos: [{ nombre: 'A', masa: 1e24, x: 0, y: 0, vx: 0, vy: 0 }, { nombre: 'B', masa: 1, prueba: true, x: 1e7, y: 0, vx: 0, vy: 0 }], duracion: 1, dt: 1 });
    expect(sim.cuerpos[0].mu).toBe(G * 1e24);
    expect(sim.cuerpos[1].mu).toBe(0);
  });
});
