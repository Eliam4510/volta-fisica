// Exactitud física del motor de física moderna: efecto fotoeléctrico
// (umbral, recta de Einstein, potencial de frenado, corriente con corte y
// saturación, transporte de los electrones, medida de h), núcleo (reglas
// de decaimiento con conservación de Z y A, cadenas, valor Q, fisión),
// decaimiento estocástico contra la ley exponencial, retroceso y las
// situaciones MEXT de física moderna.
import { describe, it, expect } from 'vitest';
import {
  H, E_CARGA, C_LUZ, EV, MEV, M_E, METALES, frecuencia, longitudOnda, energiaFoton, frecuenciaUmbral, longitudUmbral, rectaEinstein,
  kMax, potencialFrenado, tasaFotones, tasaElectrones, corrienteSaturacion, fraccionInfinita, fraccionRecogida, fraccionPorEnergia,
  corriente, curvaIV, potencialCorte, medirPotencialFrenado, ajusteLineal, medirPlanck, aleatorio, emitirElectrones, vueloElectron,
  estadoElectron, NUCLIDOS, SIMBOLOS, NOMBRES, TIPOS_DECAIMIENTO, EMITIDAS, claveNuclido, nuclido, claveDeZA, nombreNuclido,
  constanteDecaimiento, aplicarRegla, hijoDe, valorQ, cadena, arbolDecaimiento, contarPasos, pasosPorConservacion, fision,
  retroceso, retrocesoFision, energiaEnlace, leyExponencial, decaerMuestra, restantes, poblacion, desintegraciones, periodoMedido, bateman, ANIO,
} from '../sistema/motores/moderna.js';

const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const Na = METALES.na.W * EV;
const tuboDe = (o = {}) => ({ W: Na, eta: 0.01, d: 0.02, R: 0.02, lamparas: [{ lambda: 400e-9, P: 1e-3 }], ...o });

describe('fotones y umbral', () => {
  it('f = c/λ, E = hf; umbral f₀ = W/h y λ₀ = hc/W', () => {
    expect(frecuencia(500e-9)).toBeCloseTo(C_LUZ / 500e-9, 0);
    expect(longitudOnda(frecuencia(633e-9))).toBeCloseTo(633e-9, 20);
    expect(energiaFoton(1e15)).toBe(H * 1e15);
    for (const m of Object.values(METALES)) {
      const W = m.W * EV, f0 = frecuenciaUmbral(W);
      expect(f0).toBeCloseTo(W / H, 0);
      expect(rel(longitudUmbral(W), C_LUZ / f0)).toBeLessThan(1e-14);
      // Justo en el umbral no hay energía cinética; un poco por encima sí
      expect(kMax(f0 * (1 - 1e-9), W)).toBe(0);
      expect(kMax(f0 * 1.01, W)).toBeGreaterThan(0);
    }
  });
  it('K_max es lineal en f con pendiente h y ordenada −W', () => {
    const W = METALES.k.W * EV, f0 = frecuenciaUmbral(W);
    const fs = [1.1, 1.4, 1.9, 2.6].map(x => x * f0);
    for (let i = 1; i < fs.length; i++) {
      const pend = (kMax(fs[i], W) - kMax(fs[i - 1], W)) / (fs[i] - fs[i - 1]);
      expect(rel(pend, H)).toBeLessThan(1e-12);
    }
    expect(rectaEinstein(0, W)).toBe(-W);
    expect(rel(kMax(2 * f0, W), W)).toBeLessThan(1e-12);
  });
  it('potencial de frenado V₀ = K_max/e', () => {
    const W = Na, f = frecuencia(400e-9);
    expect(rel(potencialFrenado(f, W), (H * f - W) / E_CARGA)).toBeLessThan(1e-14);
    // 400 nm sobre sodio: hf = 3.0996 eV, V₀ = 0.7396 V
    expect(potencialFrenado(f, W)).toBeCloseTo(3.09960 - 2.36, 4);
    expect(potencialFrenado(frecuencia(700e-9), W)).toBe(0);
  });
  it('tasas: P/(hf) fotones por segundo, η de ellos arrancan un electrón', () => {
    const t = tuboDe();
    expect(rel(tasaFotones(t.lamparas[0]), 1e-3 / energiaFoton(frecuencia(400e-9)))).toBeLessThan(1e-14);
    expect(rel(tasaElectrones(t), 0.01 * tasaFotones(t.lamparas[0]))).toBeLessThan(1e-14);
    expect(rel(corrienteSaturacion(t), E_CARGA * tasaElectrones(t))).toBeLessThan(1e-14);
    // Bajo el umbral no sale ningún electrón aunque la luz sea intensa
    expect(tasaElectrones(tuboDe({ lamparas: [{ lambda: 650e-9, P: 1 }] }))).toBe(0);
  });
});

describe('corriente del fototubo', () => {
  it('colector infinito: F = 1 − u + u ln u entre −V₀ y 0, saturación para V ≥ 0', () => {
    const t = tuboDe({ R: Infinity }), Is = corrienteSaturacion(t), V0 = potencialCorte(t);
    for (const u of [0.05, 0.3, 0.5, 0.8, 0.99]) expect(corriente(t, -u * V0) / Is).toBeCloseTo(1 - u + u * Math.log(u), 12);
    for (const V of [0, 1e-9, 0.5, 10]) expect(corriente(t, V)).toBe(Is);
    expect(fraccionInfinita(0)).toBe(1); expect(fraccionInfinita(1)).toBe(0); expect(fraccionInfinita(2)).toBe(0);
  });
  it('la integral numérica coincide con la fórmula cerrada cuando el colector es muy grande', () => {
    const t = tuboDe(), Km = kMax(frecuencia(400e-9), Na);
    for (const u of [0.1, 0.5, 0.9]) {
      const V = -u * Km / E_CARGA;
      expect(Math.abs(fraccionRecogida(Km, V, { d: 0.02, R: 1e6 }) - fraccionInfinita(u))).toBeLessThan(1e-9);
    }
    void t;
  });
  it('corte exacto en −V₀: nada por debajo, algo justo por encima', () => {
    const t = tuboDe(), V0 = potencialCorte(t);
    expect(corriente(t, -V0)).toBe(0);
    expect(corriente(t, -1.01 * V0)).toBe(0);
    expect(corriente(t, -0.999 * V0)).toBeGreaterThan(0);
  });
  it('colector finito: a 0 V llega la mitad (θ ≤ 45° con R = d) y satura de forma gradual', () => {
    const t = tuboDe(), Is = corrienteSaturacion(t), V0 = potencialCorte(t);
    // Sin campo los electrones van en línea recta: llegan los de tan θ ≤ R/d; con Lambert, sen²θ ≤ 1/2
    expect(corriente(t, 0) / Is).toBeCloseTo(0.5, 9);
    // La curva no baja nunca al subir V y se satura: con V ≥ K_max·(2d/R)²/e llegan todos
    const c = curvaIV(t, { Vmin: -1.2 * V0, Vmax: 5 * V0, n: 120 });
    for (let i = 1; i < c.length; i++) expect(c[i][1]).toBeGreaterThanOrEqual(c[i - 1][1] - 1e-18);
    expect(corriente(t, 4 * V0 * 1.0001)).toBeCloseTo(Is, 18);
    expect(corriente(t, 2 * V0)).toBeLessThan(Is);
    expect(c[0][1]).toBe(0);
  });
  it('la corriente es proporcional a la intensidad y no depende de ella el corte', () => {
    const a = tuboDe(), b = tuboDe({ lamparas: [{ lambda: 400e-9, P: 3e-3 }] });
    for (const V of [-0.5, -0.2, 0, 1]) expect(rel(corriente(b, V), 3 * corriente(a, V))).toBeLessThan(1e-12);
    expect(potencialCorte(a)).toBe(potencialCorte(b));
  });
  it('dos lámparas: las corrientes se suman y el corte lo fija la de mayor frecuencia', () => {
    const azul = { lambda: 420e-9, P: 1e-3 }, uv = { lambda: 300e-9, P: 0.5e-3 };
    const t = tuboDe({ lamparas: [azul, uv] });
    for (const V of [-1, -0.3, 0.4]) expect(rel(corriente(t, V), corriente(tuboDe({ lamparas: [azul] }), V) + corriente(tuboDe({ lamparas: [uv] }), V))).toBeLessThan(1e-12);
    expect(potencialCorte(t)).toBe(potencialFrenado(frecuencia(300e-9), Na));
  });
  it('fracción por energía: con colector infinito llegan los de K·cos²θ ≥ e|V|', () => {
    const geo = { d: 0.02, R: Infinity };
    expect(fraccionPorEnergia(1 * EV, -0.4, geo)).toBeCloseTo(0.6, 12);
    expect(fraccionPorEnergia(0.3 * EV, -0.4, geo)).toBe(0);
    expect(fraccionPorEnergia(0.3 * EV, 0.1, geo)).toBe(1);
    // Integrar sobre K uniforme da la fracción total
    const Km = 1.2 * EV, n = 4000;
    let s = 0;
    for (let i = 0; i < n; i++) s += fraccionPorEnergia((i + 0.5) / n * Km, -0.5, geo) / n;
    expect(s).toBeCloseTo(fraccionInfinita(0.5 / 1.2), 6);
  });
});

describe('transporte de los fotoelectrones', () => {
  it('un electrón normal a la placa llega si K > e|V| y vuelve si no (parábola exacta)', () => {
    const t = tuboDe(), K = 1 * EV, e = { t: 0, lampara: 0, K, mu: 0, phi: 0 };
    const va = vueloElectron(e, t, -0.9);
    expect(va.destino).toBe('colector');
    // K al llegar = K − e|V|
    const est = estadoElectron(va, va.T);
    expect(est.p[0]).toBeCloseTo(0.02, 14);
    expect(rel(0.5 * M_E * est.v[0] ** 2, 0.1 * EV)).toBeLessThan(1e-9);
    const vb = vueloElectron(e, t, -1.1);
    expect(vb.destino).toBe('placa');
    // Vuelve a la placa con la misma rapidez y tarda 2·v/a
    const fin = estadoElectron(vb, vb.T);
    expect(Math.abs(fin.p[0])).toBeLessThan(1e-15);
    expect(fin.v[0]).toBeCloseTo(-Math.sqrt(2 * K / M_E), 4);
    // La mayor altura alcanzada es d·K/(e|V|)
    const tm = vb.T / 2;
    expect(rel(estadoElectron(vb, tm).p[0], 0.02 * 1 / 1.1)).toBeLessThan(1e-12);
  });
  it('sin voltaje el electrón va en línea recta; con V > 0 cae más cerca del eje', () => {
    const t = tuboDe(), e = { t: 0, lampara: 0, K: 0.5 * EV, mu: 0.5, phi: 0 };
    const v0 = vueloElectron(e, t, 0);
    expect(v0.fin[1]).toBeCloseTo(0.02, 14); // 45°: s = d
    const v2 = vueloElectron(e, t, 2);
    expect(v2.fin[1]).toBeLessThan(v0.fin[1]);
    expect(v2.destino).toBe('colector');
  });
  it('la pared lateral del tubo para a los que se abren mucho y no cambia a los recogidos', () => {
    const t = tuboDe(), casiRasante = { t: 0, lampara: 0, K: 1 * EV, mu: 0.99, phi: 0 };
    const libre = vueloElectron(casiRasante, t, 0), conPared = vueloElectron(casiRasante, t, 0, { pared: 0.03 });
    expect(libre.destino).toBe('fuera');
    expect(conPared.destino).toBe('pared');
    expect(conPared.fin[1]).toBeCloseTo(0.03, 14);
    expect(conPared.T).toBeLessThan(libre.T);
    const normal = { t: 0, lampara: 0, K: 1 * EV, mu: 0.1, phi: 1 };
    expect(vueloElectron(normal, t, 0, { pared: 0.03 })).toEqual(vueloElectron(normal, t, 0));
  });
  it('la muestra animada sigue la tasa de emisión y es determinista', () => {
    const t = tuboDe(), porPunto = 1e5, T = 2e-6;
    const a = emitirElectrones(t, { t1: T, porPunto, semilla: 7 }), b = emitirElectrones(t, { t1: T, porPunto, semilla: 7 });
    expect(a).toEqual(b);
    const esperados = tasaElectrones(t) * T / porPunto;
    expect(Math.abs(a.length - esperados)).toBeLessThan(5 * Math.sqrt(esperados));
    for (let i = 1; i < a.length; i++) expect(a[i].t).toBeGreaterThanOrEqual(a[i - 1].t);
    const Km = kMax(frecuencia(400e-9), Na);
    expect(Math.max(...a.map(e => e.K))).toBeLessThanOrEqual(Km);
    // La fracción de la muestra que llega al colector se parece a F(V)
    for (const V of [-0.4, 0, 1.5]) {
      const llegan = a.filter(e => vueloElectron(e, t, V).destino === 'colector').length / a.length;
      expect(Math.abs(llegan - corriente(t, V) / corrienteSaturacion(t))).toBeLessThan(0.05);
    }
    expect(emitirElectrones(tuboDe({ lamparas: [{ lambda: 700e-9, P: 1 }] }), { t1: T, porPunto })).toEqual([]);
  });
});

describe('medida de h', () => {
  it('V₀ medido con la corriente simulada coincide con K_max/e', () => {
    for (const lambda of [254e-9, 365e-9, 436e-9]) {
      const t = tuboDe({ W: METALES.zn.W * EV, lamparas: [{ lambda, P: 1e-3 }] });
      const teo = potencialFrenado(frecuencia(lambda), t.W);
      expect(Math.abs(medirPotencialFrenado(t) - teo)).toBeLessThan(1e-7);
    }
    expect(medirPotencialFrenado(tuboDe({ lamparas: [{ lambda: 700e-9, P: 1e-3 }] }))).toBe(0);
  });
  it('la pendiente de V₀ contra f es h/e y la ordenada da W', () => {
    // Líneas del mercurio sobre cesio (todas por encima de su umbral de 579 nm)
    const W = METALES.cs.W * EV, lineas = [365.0e-9, 404.7e-9, 435.8e-9, 546.1e-9];
    const med = lineas.map(l => ({ f: frecuencia(l), V0: medirPotencialFrenado(tuboDe({ W, lamparas: [{ lambda: l, P: 1e-3 }] })) }));
    const r = medirPlanck(med);
    expect(rel(r.pendiente, H / E_CARGA)).toBeLessThan(1e-6);
    expect(rel(r.h, H)).toBeLessThan(1e-6);
    expect(rel(r.W, W)).toBeLessThan(1e-6);
    expect(rel(r.f0, frecuenciaUmbral(W))).toBeLessThan(1e-6);
    expect(r.r2).toBeCloseTo(1, 10);
  });
  it('ajuste lineal de mínimos cuadrados', () => {
    const a = ajusteLineal([[0, 1], [1, 3], [2, 5.2], [3, 6.8]]);
    expect(a.pendiente).toBeCloseTo(1.96, 12);
    expect(a.ordenada).toBeCloseTo(1.06, 12);
    expect(Number.isNaN(ajusteLineal([[1, 1]]).pendiente)).toBe(true);
  });
});

describe('núcleo: tabla y reglas', () => {
  it('símbolos, nombres y claves', () => {
    expect(SIMBOLOS[92]).toBe('U'); expect(SIMBOLOS[82]).toBe('Pb'); expect(NOMBRES[90]).toBe('Torio');
    expect(SIMBOLOS.length).toBe(101); expect(NOMBRES.length).toBe(101);
    expect(claveNuclido(92, 238)).toBe('U-238'); expect(claveNuclido(0, 1)).toBe('n');
    expect(claveDeZA(91, 234)).toBe('Pa-234m'); expect(claveDeZA(56, 137)).toBe('Ba-137');
    expect(nombreNuclido('U-238')).toBe('Uranio-238'); expect(nombreNuclido('Ba-137m')).toBe('Bario-137m');
    expect(nuclido('toString')).toBeNull();
    expect(constanteDecaimiento(null)).toBe(0);
  });
  it('cada núclido de la tabla es coherente: masa ≈ A, Z y A enteros', () => {
    for (const [k, n] of Object.entries(NUCLIDOS)) {
      expect(Number.isInteger(n.Z) && Number.isInteger(n.A)).toBe(true);
      expect(Math.abs(n.masa - n.A)).toBeLessThan(0.1);
      if (n.T != null) { expect(n.T).toBeGreaterThan(0); expect(n.modos.length).toBeGreaterThan(0); }
      const ramas = n.modos.reduce((s, m) => s + m.rama, 0);
      if (n.modos.length) expect(ramas).toBeCloseTo(1, 6);
      if (k !== 'n') expect(k.startsWith(SIMBOLOS[n.Z] + '-')).toBe(true);
    }
  });
  it('reglas α, β⁻, β⁺, CE y γ', () => {
    const U = { Z: 92, A: 238 };
    expect(aplicarRegla(U, 'alfa')).toEqual({ Z: 90, A: 234 });
    expect(aplicarRegla(U, 'beta-')).toEqual({ Z: 93, A: 238 });
    expect(aplicarRegla(U, 'beta+')).toEqual({ Z: 91, A: 238 });
    expect(aplicarRegla(U, 'ce')).toEqual({ Z: 91, A: 238 });
    expect(aplicarRegla(U, 'gamma')).toEqual(U);
    expect(() => aplicarRegla(U, /** @type {any} */ ('omega'))).toThrow();
  });
  it('Z y A se conservan en cada decaimiento de la tabla', () => {
    let n = 0;
    for (const [k, P] of Object.entries(NUCLIDOS)) {
      for (const m of P.modos) {
        const h = hijoDe(k, m), D = nuclido(h);
        const em = EMITIDAS[m.tipo];
        if (D) {
          expect(P.Z).toBe(D.Z + em.carga);
          expect(P.A).toBe(D.A + em.A);
          n++;
        } else {
          // Hija fuera de la tabla (productos de fisión): la regla da su Z y A
          const r = aplicarRegla(P, m.tipo);
          expect(h).toBe(claveNuclido(r.Z, r.A));
        }
        expect(TIPOS_DECAIMIENTO[m.tipo]).toBeDefined();
      }
    }
    expect(n).toBeGreaterThan(60);
  });
  it('valor Q: α del U-238 4.270 MeV, β⁻ del C-14 0.156 MeV, β⁺ del Na-22 1.82 MeV, γ del Ba-137m 0.662 MeV', () => {
    expect(valorQ('U-238', 'alfa').MeV).toBeCloseTo(4.270, 2);
    expect(valorQ('Ra-226', 'alfa').MeV).toBeCloseTo(4.871, 2);
    expect(valorQ('Po-210', 'alfa').MeV).toBeCloseTo(5.407, 2);
    expect(valorQ('C-14', 'beta-').MeV).toBeCloseTo(0.1565, 3);
    expect(valorQ('Co-60', 'beta-').MeV).toBeCloseTo(2.823, 2);
    expect(valorQ('Na-22', 'beta+').MeV).toBeCloseTo(1.820, 2);
    expect(valorQ('K-40', 'ce').MeV).toBeCloseTo(1.504, 2);
    expect(valorQ('Ba-137m', 'gamma').MeV).toBeCloseTo(0.661657, 6);
    expect(rel(valorQ('U-238', 'alfa').J, valorQ('U-238', 'alfa').MeV * MEV)).toBeLessThan(1e-14);
    // Todos los decaimientos de la tabla con hija conocida liberan energía
    for (const [k, P] of Object.entries(NUCLIDOS)) for (const m of P.modos) if (nuclido(hijoDe(k, m))) expect(valorQ(k, m).MeV).toBeGreaterThan(0);
  });
});

describe('cadenas de decaimiento', () => {
  it('serie del uranio-238: 14 pasos, 8 α y 6 β⁻, termina en Pb-206 estable', () => {
    const c = cadena('U-238');
    expect(c.fin).toBe('Pb-206'); expect(c.estable).toBe(true);
    expect(c.pasos.length).toBe(14);
    const n = contarPasos(c.pasos);
    expect(n.alfa).toBe(8); expect(n['beta-']).toBe(6);
    // Cada paso empieza donde acabó el anterior
    for (let i = 1; i < c.pasos.length; i++) expect(c.pasos[i].desde).toBe(c.pasos[i - 1].hacia);
    expect(pasosPorConservacion({ Z: 92, A: 238 }, { Z: 82, A: 206 })).toEqual({ alfa: 8, beta: 6 });
  });
  it('las otras tres series terminan en Pb-208, Pb-207 y Bi-209', () => {
    const fines = { 'Th-232': ['Pb-208', 6, 4], 'U-235': ['Pb-207', 7, 4], 'Np-237': ['Bi-209', 7, 4] };
    for (const [k, [fin, a, b]] of Object.entries(fines)) {
      const c = cadena(k), n = contarPasos(c.pasos);
      expect(c.fin).toBe(fin); expect(n.alfa).toBe(a); expect(n['beta-']).toBe(b);
      const P = nuclido(k), F = nuclido(fin);
      expect(pasosPorConservacion(P, F)).toEqual({ alfa: a, beta: b });
    }
    expect(pasosPorConservacion({ Z: 92, A: 238 }, { Z: 82, A: 207 })).toBeNull();
  });
  it('las ramas del bismuto-212 llevan las dos al plomo-208', () => {
    const arbol = arbolDecaimiento('Th-232');
    const bi = arbol.filter(p => p.desde === 'Bi-212');
    expect(bi.map(p => p.hacia).sort()).toEqual(['Po-212', 'Tl-208']);
    expect(bi.reduce((s, p) => s + p.rama, 0)).toBeCloseTo(1, 9);
    expect(arbol.filter(p => p.hacia === 'Pb-208').length).toBe(2);
  });
  it('el cesio-137 pasa por el isómero Ba-137m, que emite γ sin cambiar Z ni A', () => {
    const c = cadena('Cs-137');
    expect(c.pasos.map(p => p.tipo)).toEqual(['beta-', 'gamma']);
    expect(c.pasos[0].hacia).toBe('Ba-137m'); expect(c.fin).toBe('Ba-137');
  });
});

describe('fisión', () => {
  it('n + U-235 → Ba-144 + Kr-89 + 3 n, Q ≈ 173 MeV', () => {
    const f = fision('U-235', ['Ba-144', 'Kr-89']);
    expect(f.neutrones).toBe(3);
    expect(f.compuesto).toEqual({ Z: 92, A: 236 });
    expect(f.Q.MeV).toBeGreaterThan(170); expect(f.Q.MeV).toBeLessThan(176);
    expect(fision('U-235', ['Ba-141', 'Kr-92']).neutrones).toBe(3);
    expect(fision('U-235', ['Xe-140', 'Sr-94']).neutrones).toBe(2);
    expect(() => fision('U-235', ['Ba-144', 'Sr-94'])).toThrow();
  });
  it('energía de enlace por nucleón: máximo cerca del hierro; los fragmentos están más ligados que el uranio', () => {
    expect(energiaEnlace('He-4').porNucleon).toBeCloseTo(7.074, 2);
    expect(energiaEnlace('Fe-56').porNucleon).toBeCloseTo(8.790, 2);
    expect(energiaEnlace('Ni-62').porNucleon).toBeCloseTo(8.795, 2);
    expect(energiaEnlace('U-238').porNucleon).toBeCloseTo(7.570, 2);
    expect(energiaEnlace('H-1').MeV).toBe(0);
    // Q de la fisión = B(fragmentos) − B(U-235) (los neutrones libres no tienen enlace)
    const f = fision('U-235', ['Ba-144', 'Kr-89']);
    expect(energiaEnlace('Ba-144').MeV + energiaEnlace('Kr-89').MeV - energiaEnlace('U-235').MeV).toBeCloseTo(f.Q.MeV, 6);
    expect(energiaEnlace('Ba-144').porNucleon).toBeGreaterThan(energiaEnlace('U-235').porNucleon);
  });
  it('los dos fragmentos se reparten Q con momentos iguales y opuestos', () => {
    const r = retrocesoFision('U-235', ['Ba-144', 'Kr-89']);
    const [a, b] = r.productos;
    expect(rel(Math.hypot(...a.p), Math.hypot(...b.p))).toBeLessThan(1e-12);
    expect(rel(a.KMeV + b.KMeV, r.Q.MeV)).toBeLessThan(1e-9);
    expect(a.KMeV / b.KMeV).toBeCloseTo(nuclido('Kr-89').masa / nuclido('Ba-144').masa, 2);
  });
});

describe('retroceso', () => {
  it('α: momentos iguales y opuestos, K en razón inversa de las masas, ΣK = Q', () => {
    for (const k of ['U-238', 'Ra-226', 'Po-210', 'Am-241']) {
      const r = retroceso(k, 'alfa', { direccion: 0.7 }), [al, D] = r.productos;
      expect(Math.hypot(...r.balance.p) / Math.hypot(...al.p)).toBeLessThan(1e-12);
      expect(rel(Math.hypot(...al.p), Math.hypot(...D.p))).toBeLessThan(1e-12);
      expect(rel(r.balance.K, r.Q.J)).toBeLessThan(1e-9);
      // Newton: K_α/K_D = M_D/m_α; la corrección relativista es de unas décimas por mil
      expect(rel(al.K / D.K, D.masa / al.masa)).toBeLessThan(2e-3);
      expect(Math.atan2(al.p[1], al.p[0])).toBeCloseTo(0.7, 12);
    }
  });
  it('β⁻ y β⁺: tres cuerpos que cierran el balance de momento y de energía', () => {
    for (const [k, tipo] of [['C-14', 'beta-'], ['Co-60', 'beta-'], ['Na-22', 'beta+']]) {
      for (const reparto of [0, 0.3, 0.8, 1]) {
        const r = retroceso(k, tipo, { reparto, angulo: 2.1, direccion: -0.4 });
        expect(r.productos.length).toBe(3);
        const pmax = Math.max(...r.productos.map(p => Math.hypot(...p.p)));
        expect(Math.hypot(...r.balance.p) / pmax).toBeLessThan(1e-9);
        expect(rel(r.balance.K, r.Q.J)).toBeLessThan(1e-9);
      }
    }
    // El electrón puede llevarse casi toda la energía; el neutrino entonces nada
    const max = retroceso('C-14', 'beta-', { reparto: 1 });
    expect(max.productos[1].KMeV).toBeLessThan(1e-9);
  });
  it('γ y CE: dos cuerpos; el núcleo apenas se mueve', () => {
    const g = retroceso('Ba-137m', 'gamma');
    expect(g.productos[0].v).toBeCloseTo(C_LUZ, 0);
    expect(rel(Math.hypot(...g.productos[0].p), Math.hypot(...g.productos[1].p))).toBeLessThan(1e-12);
    expect(g.productos[1].KMeV).toBeLessThan(1e-5);
    const ce = retroceso('K-40', 'ce');
    expect(rel(ce.balance.K, ce.Q.J)).toBeLessThan(1e-9);
  });
});

describe('decaimiento estocástico', () => {
  it('el generador con semilla es determinista y uniforme', () => {
    const a = aleatorio(42), b = aleatorio(42), c = aleatorio(43);
    const xa = Array.from({ length: 5 }, a), xb = Array.from({ length: 5 }, b);
    expect(xa).toEqual(xb);
    expect(Array.from({ length: 5 }, c)).not.toEqual(xa);
    const r = aleatorio(9);
    let s = 0, s2 = 0, min = 1, max = 0;
    const n = 100000;
    for (let i = 0; i < n; i++) { const x = r(); min = Math.min(min, x); max = Math.max(max, x); s += x; s2 += x * x; }
    expect(min).toBeGreaterThanOrEqual(0); expect(max).toBeLessThan(1);
    expect(Math.abs(s / n - 0.5)).toBeLessThan(5 * Math.sqrt(1 / 12 / n));
    expect(Math.abs(s2 / n - 1 / 3)).toBeLessThan(0.005);
  });
  it('la media de N(t) sigue a N₀·2^(−t/T½) dentro de la tolerancia estadística', () => {
    const T = 10, N0 = 1000, corridas = 50;
    for (const t of [2, 5, 10, 20, 40]) {
      let suma = 0;
      for (let k = 1; k <= corridas; k++) suma += restantes(decaerMuestra({ T, N0, semilla: k }), t);
      const p = Math.pow(2, -t / T), media = suma / corridas, sigma = Math.sqrt(N0 * p * (1 - p) / corridas);
      expect(Math.abs(media - leyExponencial(N0, T, t))).toBeLessThan(4 * sigma + 1e-9);
    }
  });
  it('el periodo medido (mediana y ajuste) se acerca a T½', () => {
    const m = decaerMuestra({ clave: 'I-131', N0: 20000, semilla: 5 });
    const T = nuclido('I-131').T, r = periodoMedido(m);
    // Error típico de la mediana: 1.44·T½/√N ≈ 1 %
    expect(rel(r.mediana, T)).toBeLessThan(0.04);
    expect(rel(r.ajuste, T)).toBeLessThan(0.04);
    // Antes de que decaiga la mitad no hay mediana; el ajuste con los vivos sí funciona
    const temprano = periodoMedido(m, 0.3 * T);
    expect(temprano.mediana).toBeNull();
    expect(rel(temprano.ajuste, T)).toBeLessThan(0.1);
    expect(restantes(m, 0)).toBe(20000);
    expect(desintegraciones(m, 0, Infinity)).toBe(20000);
  });
  it('determinismo: misma semilla, misma muestra', () => {
    const a = decaerMuestra({ clave: 'Rn-222', N0: 500, semilla: 11, cadena: true });
    const b = decaerMuestra({ clave: 'Rn-222', N0: 500, semilla: 11, cadena: true });
    expect(Array.from(a.vidas)).toEqual(Array.from(b.vidas));
    expect(a.especies).toEqual(b.especies);
  });
  it('con la cadena, el número total de núcleos se conserva y aparecen las hijas', () => {
    const m = decaerMuestra({ clave: 'Rn-222', N0: 2000, semilla: 2, cadena: true });
    expect(m.especies[0]).toBe('Rn-222');
    expect(m.especies).toContain('Pb-210');
    for (const t of [0, 3600, 86400, 10 * 86400, 1e9]) {
      let total = 0;
      for (let j = 0; j < m.especies.length; j++) total += poblacion(m, j, t);
      expect(total).toBe(2000);
      expect(poblacion(m, 0, t)).toBe(restantes(m, t));
    }
    // Sin cadena, la hija se queda: N + N_hija = N₀
    const s = decaerMuestra({ clave: 'Rn-222', N0: 300, semilla: 2 });
    expect(s.especies).toEqual(['Rn-222', 'Po-218']);
    expect(restantes(s, 4e5) + poblacion(s, 1, 4e5)).toBe(300);
  });
  it('Bateman: padre exponencial, la hija sigue la fórmula de dos miembros y la suma se conserva', () => {
    const l1 = Math.LN2 / 10, l2 = Math.LN2 / 3, N0 = 1000;
    for (const t of [0, 1, 5, 20]) {
      const [N1, N2, N3] = bateman([l1, l2, 0], N0, t);
      expect(N1).toBeCloseTo(N0 * Math.exp(-l1 * t), 9);
      expect(N2).toBeCloseTo(N0 * l1 / (l2 - l1) * (Math.exp(-l1 * t) - Math.exp(-l2 * t)), 9);
      expect(N1 + N2 + N3).toBeCloseTo(N0, 9);
    }
  });
  it('una muestra sin periodo válido es una escena inválida', () => {
    expect(() => decaerMuestra({ clave: 'Pb-206', N0: 10 })).toThrow();
  });
});

describe('situaciones MEXT', () => {
  it('2012 1-(5): umbral del sodio en 526 nm → W ≈ 3.78 × 10⁻¹⁹ J (opción c)', () => {
    // Con los datos del enunciado: c = 3.00 × 10⁸ m/s, h = 6.63 × 10⁻³⁴ J·s
    const W = 6.63e-34 * 3.00e8 / 5.26e-7;
    expect(W).toBeCloseTo(3.78e-19, 21);
    // El motor con las constantes exactas: la luz de 526 nm apenas supera el umbral del sodio de la tabla
    const opciones = [1.05e-19, 1.16e-19, 3.78e-19, 1.05e-31, 1.16e-31, 3.78e-31];
    const Wtabla = METALES.na.W * EV;
    const mejor = opciones.reduce((a, b) => (Math.abs(b - Wtabla) < Math.abs(a - Wtabla) ? b : a));
    expect(mejor).toBe(3.78e-19);
    expect(rel(longitudUmbral(Wtabla), 5.26e-7)).toBeLessThan(2e-3);
    const t = tuboDe({ W: Wtabla, lamparas: [{ lambda: 540e-9, P: 1e-3 }] });
    expect(corriente(t, 0)).toBe(0);
    t.lamparas[0].lambda = 510e-9;
    expect(corriente(t, 0)).toBeGreaterThan(0);
  });
  it('2008 1-(5): α del U-238, v/V ≈ 58.5 (opción a)', () => {
    const r = retroceso('U-238', 'alfa'), [al, D] = r.productos;
    const cociente = al.v / D.v;
    expect(Math.abs(cociente - 58.5) / 58.5).toBeLessThan(3e-3);
    const opciones = [58.5, 118, Math.sqrt(58.5), Math.sqrt(118), 1];
    expect(opciones.reduce((a, b) => (Math.abs(b - cociente) < Math.abs(a - cociente) ? b : a))).toBe(58.5);
    expect(r.hijo).toBe('Th-234');
  });
  it('2007 1-(5): fisión del U-235 en Ba-144 y Kr-89 → 3 neutrones (opción c)', () => {
    expect(fision('U-235', ['Ba-144', 'Kr-89']).neutrones).toBe(3);
  });
  it('2006 1-(4): la serie del U-238 acaba en Pb-206 (opción c)', () => {
    expect(cadena('U-238').fin).toBe('Pb-206');
    const opciones = ['Pb-208', 'Bi-209', 'Pb-206', 'Pb-207'];
    // Solo el Pb-206 se alcanza con α y β⁻ desde el U-238 (A − 206 múltiplo de 4)
    expect(opciones.filter(k => pasosPorConservacion({ Z: 92, A: 238 }, nuclido(k)))).toEqual(['Pb-206']);
    expect(ANIO).toBe(31557600);
  });
});
