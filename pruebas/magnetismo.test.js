// Exactitud física del motor de magnetismo e inducción: campos de hilos,
// segmentos, espiras, solenoides e imanes contra sus fórmulas cerradas;
// fuerza entre corrientes; Boris (radio, periodo, conservación de |v|);
// selector, espectrómetro, ciclotrón, deriva E×B y efecto Hall; flujo por
// intersección exacta de polígonos; barra en rieles (velocidad terminal y
// v(t) exponencial), espira que entra en un campo, generador, balance de
// energía; y las situaciones MEXT de magnetismo con sus respuestas.
import { describe, it, expect } from 'vitest';
import {
  MU0, CARGA_ELEMENTAL, MASA_PROTON, MASA_ELECTRON, UMA, cel, elipticas, valorVariable,
  campoHilo, campoSegmento, campoEspira, campoEspiraNumerico, campoEspiraEje, campoPoligonal, campoSolenoide, campoSolenoideEje,
  campoDipolo, campoIman, campoB, fuerzaPorLargo, fuerzaSegmento, fuerzaLorentz, anguloBrujula, trazarLinea, lineasCampo,
  areaPoligono, antihorario, contiene, triangular, areaInterseccion, largoDentro, integralInversaDistancia, integralLineaInversa,
  rectangulo, rapidezAceleracion, radioCiclotron, periodoCiclotron, placasAceleradoras, simularParticulas, estadoParticula,
  medirOrbita, tramosEnRegion, emitirIones, hall, hallTransitorio, simularInduccion, estadoInduccion, balanceInduccion,
  flujoMagnetico, femGenerador, velocidadTerminal, ErrorMagnetismo,
} from '../sistema/motores/magnetismo.js';

const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const GR = Math.PI / 180;
const q = CARGA_ELEMENTAL, mp = MASA_PROTON;
const norma = v => Math.hypot(v[0], v[1], v[2] ?? 0);

describe('integrales elípticas', () => {
  it('K y E con valores de tabla; cel generaliza ambas', () => {
    expect(elipticas(0).K).toBeCloseTo(Math.PI / 2, 15);
    expect(elipticas(0).E).toBeCloseTo(Math.PI / 2, 15);
    // K(m = 0.5) = 1.854074677301372, E(m = 0.5) = 1.350643881047675 (Abramowitz y Stegun)
    expect(elipticas(0.5).K).toBeCloseTo(1.854074677301372, 13);
    expect(elipticas(0.5).E).toBeCloseTo(1.350643881047675, 13);
    expect(elipticas(0.99).K).toBeCloseTo(3.695637362989875, 12);
    // cel(1, 1, 1, −1) = 0; cel(kc, p, 1, 1) con p = kc² es una E… sí: ∫ dφ/(…)^{3/2}
    expect(cel(1, 1, 1, -1)).toBeCloseTo(0, 15);
  });
  it('variación temporal: rampa acotada y senoide con su derivada', () => {
    expect(valorVariable(1, { tipo: 'rampa', pendiente: 2, inicio: 1, fin: 3 }, 0)).toEqual([1, 0]);
    expect(valorVariable(1, { tipo: 'rampa', pendiente: 2, inicio: 1, fin: 3 }, 2)).toEqual([3, 2]);
    expect(valorVariable(1, { tipo: 'rampa', pendiente: 2, inicio: 1, fin: 3 }, 5)).toEqual([5, 0]);
    const [v, d] = valorVariable(0, { tipo: 'senoidal', amplitud: 2, frecuencia: 0.5, fase: 0 }, 0.25);
    expect(v).toBeCloseTo(2 * Math.sin(Math.PI / 4), 14); expect(d).toBeCloseTo(2 * Math.PI * Math.cos(Math.PI / 4), 14);
  });
});

describe('campo de corrientes (Biot–Savart)', () => {
  it('hilo infinito: B = μ0·I/(2π·r), tangente según la mano derecha', () => {
    const I = 3, h = { tipo: 'hilo', p: [0.2, -0.1], I };
    for (const [x, y] of [[0.3, -0.1], [0.2, 0.5], [-1, 2]]) {
      const B = campoHilo(h, [x, y, 0]), r = Math.hypot(x - 0.2, y + 0.1);
      expect(rel(norma(B), MU0 * I / (2 * Math.PI * r))).toBeLessThan(1e-14);
      // B ⊥ al radio y en sentido antihorario (corriente saliente del plano)
      expect(B[0] * (x - 0.2) + B[1] * (y + 0.1)).toBeCloseTo(0, 18);
      expect((x - 0.2) * B[1] - (y + 0.1) * B[0]).toBeGreaterThan(0);
    }
    // Entrante: sentido horario
    const B2 = campoHilo({ ...h, dir: [0, 0, -1] }, [0.3, -0.1, 0]);
    expect(B2[1]).toBeLessThan(0);
  });
  it('segmento finito contra la fórmula cerrada μ0·I/(4π·d)·(sen θ₂ − sen θ₁) y contra Gauss–Legendre', () => {
    const I = 5, a = [0, -0.1, 0], b = [0, 0.3, 0], P = [0.05, 0.02, 0];
    const B = campoSegmento({ tipo: 'segmento', a, b, I }, P);
    const d = 0.05, th1 = Math.atan2(-0.1 - 0.02, d), th2 = Math.atan2(0.3 - 0.02, d);
    expect(rel(-B[2], MU0 * I / (4 * Math.PI * d) * (Math.sin(th2) - Math.sin(th1)))).toBeLessThan(1e-14);
    // Suma directa de Biot–Savart con muchos puntos (independiente)
    let Bz = 0; const n = 20000;
    for (let i = 0; i < n; i++) { const y = -0.1 + (i + 0.5) * 0.4 / n, rx = P[0], ry = P[1] - y, r3 = Math.hypot(rx, ry) ** 3; Bz += MU0 * I / (4 * Math.PI) * (0.4 / n) * (-rx) / r3; }
    expect(rel(B[2], Bz)).toBeLessThan(1e-7);
    // Muy largo: tiende al hilo infinito
    const largo = campoSegmento({ tipo: 'segmento', a: [0, -1e5, 0], b: [0, 1e5, 0], I }, P);
    expect(rel(-largo[2], MU0 * I / (2 * Math.PI * d))).toBeLessThan(1e-9);
  });
  it('espira circular: exacta en el eje, y la forma elíptica coincide con la suma numérica fuera de él', () => {
    const e = { tipo: 'espira', centro: [0.1, 0.2, -0.05], normal: [0.3, -0.2, 1], R: 0.08, I: 2.5, N: 3 };
    const n = [0.3, -0.2, 1].map(x => x / Math.hypot(0.3, -0.2, 1));
    for (const z of [0, 0.04, -0.13]) {
      const B = campoEspira(e, e.centro.map((c, i) => c + n[i] * z));
      expect(rel(B[0] * n[0] + B[1] * n[1] + B[2] * n[2], campoEspiraEje(0.08, 2.5, z, 3))).toBeLessThan(1e-13);
    }
    expect(rel(campoEspiraEje(0.08, 2.5, 0, 3), MU0 * 3 * 2.5 / (2 * 0.08))).toBeLessThan(1e-15);
    for (const p of [[0.19, 0.25, 0.01], [0.5, -0.3, 0.2], [0.1, 0.25, -0.05]]) {
      const a = campoEspira(e, p), b = campoEspiraNumerico(e, p, 4096);
      for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(1e-11 * norma(a));
    }
  });
  it('espira rectangular (polígono de segmentos) en el centro: 2√2·μ0·I/(π·a) para un cuadrado de lado a', () => {
    const a = 0.1, I = 4, pts = [[0, 0, 0], [a, 0, 0], [a, a, 0], [0, a, 0]];
    const B = campoPoligonal({ tipo: 'poligonal', puntos: pts, I }, [a / 2, a / 2, 0]);
    expect(rel(B[2], 2 * Math.SQRT2 * MU0 * I / (Math.PI * a))).toBeLessThan(1e-14);
  });
  it('solenoide finito: exacto en el eje, igual a la suma de muchas espiras fuera del eje, y μ0·n·I en el centro de uno largo', () => {
    const s = { tipo: 'solenoide', centro: [0, 0, 0], eje: [0, 0, 1], R: 0.02, largo: 0.1, n: 1000, I: 1 };
    for (const z of [0, 0.03, 0.08]) expect(rel(campoSolenoide(s, [0, 0, z])[2], campoSolenoideEje(0.02, 0.1, 1000, z))).toBeLessThan(1e-13);
    const p = [0.03, 0.01, 0.04], N = 4000;
    const suma = [0, 0, 0];
    for (let i = 0; i < N; i++) { const b = campoEspira({ centro: [0, 0, -0.05 + (i + 0.5) * 0.1 / N], normal: [0, 0, 1], R: 0.02, I: 0.1 / N * 1000 }, p); for (let k = 0; k < 3; k++) suma[k] += b[k]; }
    const B = campoSolenoide(s, p);
    for (let k = 0; k < 3; k++) expect(Math.abs(B[k] - suma[k])).toBeLessThan(2e-6 * norma(B));
    const largo = { ...s, largo: 100 };
    expect(rel(campoSolenoide(largo, [0.005, 0, 0])[2], MU0 * 1000)).toBeLessThan(1e-6);
    // Ideal: uniforme dentro, nulo fuera
    expect(campoSolenoide({ ...s, ideal: true }, [0.01, 0, 0.04])[2]).toBeCloseTo(MU0 * 1000, 15);
    expect(norma(campoSolenoide({ ...s, ideal: true }, [0.03, 0, 0]))).toBe(0);
  });
  it('lejos, una espira es un dipolo m = I·π·R², y un imán de bloque coincide con su dipolo', () => {
    const e = { tipo: 'espira', centro: [0, 0, 0], normal: [0, 0, 1], R: 0.01, I: 2 };
    const p = [0.7, 0.3, 0.5], m = [0, 0, 2 * Math.PI * 1e-4];
    const a = campoEspira(e, p), b = campoDipolo(m, p);
    for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(1e-4 * norma(b));
    const im = { tipo: 'iman', centro: [0, 0, 0], eje: [1, 0, 0], momento: 0.5, modelo: 'bloque', R: 0.004, largo: 0.03 };
    const c = campoIman(im, [1, 0.6, 0]), d = campoIman({ ...im, modelo: 'dipolo' }, [1, 0.6, 0]);
    for (let i = 0; i < 2; i++) expect(Math.abs(c[i] - d[i])).toBeLessThan(2e-3 * norma(d));
    // En el eje de un dipolo: B = μ0·2m/(4π r³)
    expect(rel(campoDipolo([0.5, 0, 0], [0.2, 0, 0])[0], MU0 * 2 * 0.5 / (4 * Math.PI * 0.008))).toBeLessThan(1e-14);
  });
  it('fuerza entre hilos paralelos: μ0·I₁·I₂/(2π·d) por metro, atractiva en el mismo sentido y repulsiva en sentidos opuestos', () => {
    const d = 0.05, I1 = 3, I2 = 7;
    const mismos = [{ tipo: 'hilo', p: [0, 0], I: I1 }, { tipo: 'hilo', p: [d, 0], I: I2 }];
    const f = fuerzaPorLargo(mismos, 1);
    expect(rel(-f[0], MU0 * I1 * I2 / (2 * Math.PI * d))).toBeLessThan(1e-14);
    expect(f[0]).toBeLessThan(0);    // el hilo 2 va hacia el 1
    const f1 = fuerzaPorLargo(mismos, 0);
    expect(f1[0]).toBeCloseTo(-f[0], 18);  // acción y reacción
    const opuestos = [mismos[0], { ...mismos[1], dir: [0, 0, -1] }];
    expect(fuerzaPorLargo(opuestos, 1)[0]).toBeGreaterThan(0);
    // Un segmento largo paralelo al hilo: fuerza ≈ (fuerza por metro) × largo
    const F = fuerzaSegmento([{ tipo: 'hilo', p: [0, 0], dir: [0, 1, 0], I: I1 }], [d, -50, 0], [d, 50, 0], I2, { puntos: 400 });
    expect(rel(-F[0], MU0 * I1 * I2 / (2 * Math.PI * d) * 100)).toBeLessThan(1e-3);
  });
  it('fuerza de Lorentz y brújula', () => {
    const F = fuerzaLorentz(2, [1, 0, 0], [0, 3, 0], [0, 0, 1]);
    expect(F).toEqual([0, 6 - 2, 0]);
    const ang = anguloBrujula([{ tipo: 'hilo', p: [0, 0], I: 1 }], [1, 0, 0]);
    expect(ang).toBeCloseTo(Math.PI / 2, 14);
    // Una espira vista de frente da B perpendicular al plano: la brújula no tiene dirección
    expect(anguloBrujula([{ tipo: 'espira', centro: [0, 0, 0], normal: [0, 0, 1], R: 0.1, I: 1 }], [0.02, 0.01, 0])).toBeNull();
  });
  it('las líneas de campo de un hilo son circunferencias cerradas', () => {
    const f = [{ tipo: 'hilo', p: [0.1, 0], I: 1 }];
    const l = trazarLinea(p => campoB(f, [p[0], p[1], 0]), [0.3, 0], { paso: 0.002, maxPasos: 5000 });
    expect(l.cerrada).toBe(true);
    for (const p of l.pts) expect(Math.abs(Math.hypot(p[0] - 0.1, p[1]) - 0.2)).toBeLessThan(1e-7);
    // Dos semillas sobre la misma línea: se traza una sola vez
    const ls = lineasCampo(f, [[0.3, 0], [0.1, 0.2], [0.15, 0]], { paso: 0.002, separacion: 0.01 });
    expect(ls.length).toBe(2);
  });
});

describe('polígonos y flujo exacto', () => {
  const L = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]];   // región en forma de L (no convexa)
  it('orientación, contención y triangulación', () => {
    expect(areaPoligono(L)).toBe(3);
    expect(areaPoligono(antihorario(L.slice().reverse()))).toBe(3);
    expect(contiene(L, [1.5, 1.5])).toBe(false); expect(contiene(L, [0.5, 1.5])).toBe(true);
    const tris = triangular(L);
    expect(tris.length).toBe(4);
    expect(tris.reduce((s, t) => s + areaPoligono(t), 0)).toBeCloseTo(3, 14);
  });
  it('área de la intersección con una región no convexa y largo de un segmento dentro', () => {
    const tris = triangular(L);
    expect(areaInterseccion(rectangulo([1, 1], 1, 1), tris)).toBeCloseTo(0.75, 14);
    expect(areaInterseccion(rectangulo([1.5, 1.5], 1, 1), tris)).toBeCloseTo(0, 14);
    expect(areaInterseccion([[0.5, 0.5], [1.5, 0.5], [0.5, 1.5]], tris)).toBeCloseTo(0.5, 14);
    expect(largoDentro([-1, 1.5], [3, 1.5], L)).toBeCloseTo(1, 14);
    expect(largoDentro([-1, 0.5], [3, 0.5], L)).toBeCloseTo(2, 14);
    // Un segmento sobre el borde cuenta según hacia dónde lo empuja su movimiento
    expect(largoDentro([0, 0], [0, 1], L, [1, 0])).toBeCloseTo(1, 14);
    expect(largoDentro([0, 0], [0, 1], L, [-1, 0])).toBe(0);
  });
  it('flujo de un hilo del plano a través de un rectángulo: μ0·I·h/(2π)·ln(r₂/r₁), y ∫dl/s exacto', () => {
    const h = { a: [0, 0], u: [0, 1], I: 1 };
    const pts = rectangulo([0.15, 0.3], 0.1, 0.2);
    expect(rel(-integralInversaDistancia(h, pts), 0.2 * Math.log(0.2 / 0.1))).toBeLessThan(1e-13);
    const phi = flujoMagnetico({ hilos: [{ a: [0, 0], angulo: Math.PI / 2, I: 5 }] }, pts);
    expect(rel(phi, -MU0 * 5 * 0.2 / (2 * Math.PI) * Math.log(2))).toBeLessThan(1e-13);
    expect(rel(-integralLineaInversa(h, [0.1, 0], [0.2, 0.1]), Math.SQRT2 * Math.log(2))).toBeLessThan(1e-14);
    // Triángulo: contra una cuadratura numérica directa
    const tri = [[0.1, 0], [0.4, 0.1], [0.2, 0.3]];
    let num = 0; const n = 600;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const x = 0.1 + (i + 0.5) * 0.3 / n, y = (j + 0.5) * 0.3 / n; if (contiene(tri, [x, y])) num += -1 / x * (0.3 / n) ** 2; }
    expect(rel(integralInversaDistancia(h, antihorario(tri)), num)).toBeLessThan(2e-3);
  });
});

describe('partículas en B: Boris', () => {
  const B = 0.5, v = 1e5;
  it('radio m·v/(q·B) exacto y periodo 2π·m/(q·B) sin depender de la rapidez', () => {
    const T = periodoCiclotron(mp, q, B);
    for (const vv of [v, 3 * v]) {
      const sim = simularParticulas({ regiones: [{ tipo: 'B', poligono: rectangulo([0, 0], 2, 2), B }], particulas: [{ q, m: mp, p: [0, 0], v: [vv, 0] }], duracion: 3 * T });
      const o = medirOrbita(sim.trayectorias[0]);
      expect(rel(o.radio, radioCiclotron(mp, vv, q, B))).toBeLessThan(1e-11);
      expect(rel(o.periodo, T)).toBeLessThan(3e-5);
      // Positiva con B saliente: gira en sentido horario (ω < 0)
      expect(o.omega).toBeLessThan(0);
    }
    expect(rel(radioCiclotron(mp, v, q, B), mp * v / (q * B))).toBeLessThan(1e-15);
  });
  it('el error del periodo baja con el cuadrado del paso', () => {
    const T = periodoCiclotron(mp, q, B), err = ppv => {
      const sim = simularParticulas({ regiones: [{ tipo: 'B', poligono: rectangulo([0, 0], 2, 2), B }], particulas: [{ q, m: mp, p: [0, 0], v: [v, 0] }], duracion: 2 * T, opciones: { pasosPorVuelta: ppv, pasosMin: 10 } });
      return Math.abs(medirOrbita(sim.trayectorias[0]).periodo / T - 1);
    };
    const r = err(128) / err(256);
    expect(r).toBeGreaterThan(3.8); expect(r).toBeLessThan(4.2);
  });
  it('Boris conserva |v| a 10⁻¹² durante 1000 vueltas', () => {
    const T = periodoCiclotron(mp, q, B);
    const sim = simularParticulas({ regiones: [{ tipo: 'B', poligono: rectangulo([0, 0], 2, 2), B }], particulas: [{ q, m: mp, p: [0, 0], v: [v, 0.3 * v] }], duracion: 1000 * T, opciones: { pasosPorVuelta: 64, pasosMin: 10 } });
    const tr = sim.trayectorias[0], v0 = Math.hypot(v, 0.3 * v);
    let peor = 0;
    for (let i = 0; i < tr.n; i++) peor = Math.max(peor, Math.abs(Math.hypot(tr.vx[i], tr.vy[i]) / v0 - 1));
    expect(tr.n).toBeGreaterThan(64000);
    expect(peor).toBeLessThan(1e-12);
  });
  it('entrada y salida de una región: el semicírculo sale a 2r del punto de entrada (MEXT 2016 P2)', () => {
    // Campo saliente en x > 0; la partícula entra por O moviéndose hacia +x
    const T = periodoCiclotron(mp, q, B), r = radioCiclotron(mp, v, q, B);
    const sim = simularParticulas({ regiones: [{ tipo: 'B', poligono: [[0, -1], [1, -1], [1, 1], [0, 1]], B }], particulas: [{ q, m: mp, p: [-0.01, 0], v: [v, 0] }], duracion: 2 * T, caja: [-0.2, 1, -1, 1] });
    const [ent, sal] = sim.eventos;
    expect(ent.tipo).toBe('entrada'); expect(sal.tipo).toBe('salida');
    expect(Math.abs(ent.p[0])).toBeLessThan(1e-12);
    // (1) positiva: se curva hacia −y (fuerza q·v × B hacia abajo); (3) r = m·v/(q·B); P = (0, −2r)
    expect(sal.p[1]).toBeLessThan(0);
    expect(rel(-sal.p[1], 2 * r)).toBeLessThan(1e-11);
    // (4) tiempo de O a P: π·m/(q·B)
    expect(rel(sal.t - ent.t, T / 2)).toBeLessThan(3e-5);
    // (2) la fuerza vale q·v·B; (5) con 2B y 3v el radio es 3/2 del original
    const tr0 = sim.trayectorias[0], i = estadoParticula(tr0, (ent.t + sal.t) / 2).i;
    expect(rel(norma(fuerzaLorentz(q, [tr0.vx[i], tr0.vy[i], 0], [0, 0, 0], [0, 0, B])), q * v * B)).toBeLessThan(1e-12);
    expect(radioCiclotron(mp, 3 * v, q, 2 * B) / r).toBeCloseTo(1.5, 14);
    // Negativa: se curva hacia +y
    const neg = simularParticulas({ regiones: [{ tipo: 'B', poligono: [[0, -1], [1, -1], [1, 1], [0, 1]], B }], particulas: [{ q: -q, m: mp, p: [-0.01, 0], v: [v, 0] }], duracion: 2 * T, caja: [-0.2, 1, -1, 1] });
    expect(neg.eventos[1].p[1]).toBeGreaterThan(0);
    // Tramos medibles dentro de la región
    const tramo = tramosEnRegion(sim, 0, 0)[0], o = medirOrbita(sim.trayectorias[0], tramo[0], tramo[1]);
    expect(rel(o.radio, r)).toBeLessThan(1e-9);
  });
});

describe('dispositivos con E y B', () => {
  const B = 0.2, E = 4e4, v0 = E / B;
  const selector = (vv, qq = q) => simularParticulas({
    regiones: [{ tipo: 'B', poligono: rectangulo([0.05, 0], 0.1, 0.02), B }, { tipo: 'E', poligono: rectangulo([0.05, 0], 0.1, 0.02), E: [0, E] }],
    obstaculos: [{ tipo: 'placa', a: [0, 0.003], b: [0.1, 0.003] }, { tipo: 'placa', a: [0, -0.003], b: [0.1, -0.003] }, { tipo: 'pantalla', a: [0.12, -0.05], b: [0.12, 0.05] }],
    particulas: [{ q: qq, m: mp, p: [-0.01, 0], v: [vv, 0] }], duracion: 1e-5,
  });
  it('selector de velocidades: con v = E/B pasa en línea recta; más rápida o más lenta choca con una placa', () => {
    // Positiva hacia +x con B saliente: la fuerza magnética va hacia −y y la eléctrica (E hacia +y) la equilibra
    const ok = selector(v0);
    const imp = ok.impactos[0];
    expect(imp.objeto).toBe('o3');
    expect(Math.abs(imp.p[1])).toBeLessThan(1e-12);
    expect(rel(norma(imp.v), v0)).toBeLessThan(1e-12);
    for (const vv of [0.7 * v0, 1.4 * v0]) expect(selector(vv).impactos[0].tipo).toBe('placa');
    // No depende del signo de la carga: una negativa con v = E/B también pasa
    expect(Math.abs(selector(v0, -q).impactos[0].p[1])).toBeLessThan(1e-12);
  });
  it('placas sobre el borde de la región (selector de la pantalla): la partícula desviada choca con una placa, no la atraviesa', () => {
    // Región de alto igual a la separación de las placas: la salida y el impacto son el mismo cruce
    const v0 = rapidezAceleracion(q, mp, 500), Ec = v0 * B;
    const sim = simularParticulas({
      regiones: [{ tipo: 'B', poligono: rectangulo([0.05, 0], 0.1, 0.01), B }, { tipo: 'E', poligono: rectangulo([0.05, 0], 0.1, 0.01), E: [0, Ec] }],
      obstaculos: [{ tipo: 'placa', a: [0, 0.005], b: [0.1, 0.005] }, { tipo: 'placa', a: [0, -0.005], b: [0.1, -0.005] }, { tipo: 'pantalla', a: [0.13, -0.025], b: [0.13, 0.025] }],
      particulas: emitirIones({ p: [-0.03, 0], giro: 0, especies: [{ q, m: mp, nombre: 'p' }, { q, m: 2.013553 * UMA, nombre: 'd' }], V: 500 }),
      duracion: 8e-7,
    });
    const [p, d] = [0, 1].map(k => sim.impactos.find(e => e.indice === k));
    expect(p.tipo).toBe('impacto'); expect(Math.abs(p.p[1])).toBeLessThan(1e-12);
    // El deuterón (más lento: la fuerza eléctrica gana) sube y se detiene sobre la placa de arriba
    expect(d.tipo).toBe('placa'); expect(d.objeto).toBe('o1');
    expect(Math.abs(d.p[1] - 0.005)).toBeLessThan(1e-9);
    expect(sim.trayectorias[1].fin.motivo).toBe('placa');
  });
  it('espectrómetro con dos especies: separación 2(m₂ − m₁)·v/(q·B₂) en la placa', () => {
    const B2 = 0.5, m1 = 20 * UMA, m2 = 22 * UMA, v = 1e5;
    const sim = simularParticulas({
      regiones: [{ tipo: 'B', poligono: [[0, -1], [1, -1], [1, 0], [0, 0]], B: -B2 }],
      obstaculos: [{ tipo: 'pantalla', a: [0.03, 0], b: [1, 0] }],
      particulas: emitirIones({ p: [0.02, 0.01], giro: -Math.PI / 2, especies: [{ q, m: m1, nombre: 'Ne-20' }, { q, m: m2, nombre: 'Ne-22' }], v }),
      duracion: 1e-5,
    });
    const [a, b] = sim.impactos.sort((x, y) => x.s - y.s);
    expect(rel(b.s - a.s, 2 * (m2 - m1) * v / (q * B2))).toBeLessThan(1e-9);
    expect(rel(a.s + 0.01, 2 * radioCiclotron(m1, v, q, B2))).toBeLessThan(1e-9);
  });
  it('deriva E×B: velocidad media E/B perpendicular a E y a B (cicloide)', () => {
    const T = periodoCiclotron(mp, q, B), Ey = 2e4;
    const sim = simularParticulas({ regiones: [{ tipo: 'B', poligono: rectangulo([0, 0], 10, 10), B }, { tipo: 'E', poligono: rectangulo([0, 0], 10, 10), E: [0, Ey] }], particulas: [{ q, m: mp, p: [0, 0], v: [0, 0] }], duracion: 6 * T });
    const st = estadoParticula(sim.trayectorias[0], 6 * T);
    expect(rel(st.p[0] / (6 * T), Ey / B)).toBeLessThan(5e-5);
    expect(Math.abs(st.p[1])).toBeLessThan(1e-9);
    // En la cicloide la rapidez máxima es 2E/B
    const tr = sim.trayectorias[0]; let vmax = 0;
    for (let i = 0; i < tr.n; i++) vmax = Math.max(vmax, Math.hypot(tr.vx[i], tr.vy[i]));
    expect(rel(vmax, 2 * Ey / B)).toBeLessThan(1e-4);
  });
  it('placas aceleradoras: la partícula sale con √(2qV/m) (MEXT 2010 4-D: pasa recta si E/B = √(2qV/m))', () => {
    const V = 500, d = 0.01, vSal = rapidezAceleracion(q, mp, V);
    const pl = placasAceleradoras({ centro: [0, d / 2], giro: Math.PI / 2, largo: 0.06, separacion: d, dV: V });
    const cruce = (EoB) => simularParticulas({
      regiones: [pl.region, { tipo: 'B', poligono: rectangulo([0, 0.06], 0.08, 0.1), B }, { tipo: 'E', poligono: rectangulo([0, 0.06], 0.08, 0.1), E: [-EoB * B, 0] }],
      obstaculos: [...pl.placas, { tipo: 'pantalla', a: [-0.04, 0.12], b: [0.04, 0.12] }],
      particulas: [{ q, m: mp, p: [0, 0], v: [0, 0] }], duracion: 5e-6,
    });
    const ok = cruce(vSal);
    const sale = ok.eventos.find(e => e.tipo === 'salida' && e.region === 0);
    expect(rel(norma(sale.v), vSal)).toBeLessThan(1e-12);
    expect(Math.abs(ok.impactos[0].p[0])).toBeLessThan(1e-12);
    // Respuesta (b): E/B = √(2qV/m); con otra razón se desvía
    expect(Math.abs(cruce(0.8 * vSal).impactos[0].p[0])).toBeGreaterThan(1e-3);
  });
  it('ciclotrón: cada paso por el hueco suma q·ΔV, el radio de cada media vuelta es m·v/(q·B) y crece, y sale por el borde con K < q²B²R²/(2m)', () => {
    const Bc = 1, gap = 5e-4, dV = 4e3, Rd = 0.05, f = q * Bc / (2 * Math.PI * mp);
    const semi = (lado) => { const r = []; for (let i = 0; i <= 40; i++) { const a = -Math.PI / 2 + Math.PI * i / 40; r.push([lado * (gap / 2 + Rd * Math.cos(a)), Rd * Math.sin(a)]); } return r; };
    const sim = simularParticulas({
      regiones: [{ tipo: 'B', poligono: semi(1), B: Bc }, { tipo: 'B', poligono: semi(-1).reverse(), B: Bc }, { tipo: 'E', poligono: rectangulo([0, 0], gap, 2 * Rd), E: [dV / gap, 0], alterna: { frecuencia: f, forma: 'cuadrada' } }],
      particulas: [{ q, m: mp, p: [0, 0], v: [0, 0] }], duracion: 40 / f, caja: [-0.2, 0.2, -0.2, 0.2],
    });
    const tr = sim.trayectorias[0], salidasHueco = sim.eventos.filter(e => e.tipo === 'salida' && e.region === 2);
    expect(salidasHueco.length).toBeGreaterThan(10);
    // Energía tras cada cruce del hueco: (k + ½)·q·ΔV (la primera vez sale del centro: medio hueco)
    salidasHueco.slice(0, 12).forEach((e, k) => { const K = 0.5 * mp * norma(e.v) ** 2; expect(rel(K, (k + 0.5) * q * dV)).toBeLessThan(1e-3); });
    // Cada media vuelta en una D: radio m·v/(q·B), cada vez mayor
    const radios = [0, 1].flatMap(k => tramosEnRegion(sim, 0, k)).sort((a, b) => a[0] - b[0]).slice(0, 8).map(([i0, i1]) => {
      const o = medirOrbita(tr, i0, i1), v = Math.hypot(tr.vx[i0], tr.vy[i0]);
      expect(rel(o.radio, mp * v / (q * Bc))).toBeLessThan(1e-6);
      return o.radio;
    });
    for (let k = 1; k < radios.length; k++) expect(radios[k]).toBeGreaterThan(radios[k - 1]);
    // Sale por el borde curvo de una D (radio Rd) con menos energía que q²B²R²/(2m)
    const sale = sim.eventos.find(e => e.tipo === 'salida' && e.region < 2 && Math.hypot(e.p[0], e.p[1]) > 0.99 * Rd);
    expect(sale).toBeTruthy();
    const Kmax = (q * Bc * Rd) ** 2 / (2 * mp), K = 0.5 * mp * norma(sale.v) ** 2;
    expect(K).toBeLessThan(Kmax); expect(K).toBeGreaterThan(0.5 * Kmax);
    expect(tr.fin.motivo).toBe('caja');
  });
  it('fuente de iones: rapidez por voltaje, abanico y ritmo de emisión (determinista)', () => {
    const p = emitirIones({ p: [0, 0], giro: 0, especies: [{ q, m: mp }, { q: 2 * q, m: 4 * mp }], V: 1000, cantidad: 3, abanico: 0.2, ritmo: 1e6 });
    expect(p.length).toBe(6);
    expect(rel(norma(p[0].v), Math.sqrt(2 * q * 1000 / mp))).toBeLessThan(1e-15);
    expect(rel(norma(p[3].v), Math.sqrt(2 * 2 * q * 1000 / (4 * mp)))).toBeLessThan(1e-15);
    expect(Math.atan2(p[0].v[1], p[0].v[0])).toBeCloseTo(-0.1, 15);
    expect(p[5].t0).toBeCloseTo(5e-6, 20);
  });
});

describe('efecto Hall', () => {
  it('equilibrio q·E_H = q·v·B y V_H = I·B/(n·q·t); el borde se carga con el signo del portador', () => {
    const p = { I: 2, B: 0.8, n: 8.5e28, q: -q, espesor: 1e-4, ancho: 0.01 };
    const h = hall(p);
    expect(rel(h.FE, h.FB)).toBeLessThan(1e-15);
    expect(rel(h.VH, p.I * p.B / (p.n * q * p.espesor))).toBeLessThan(1e-14);
    expect(rel(h.VH, h.VHformula)).toBeLessThan(1e-14);
    expect(rel(h.vd, p.I / (p.n * q * p.espesor * p.ancho))).toBeLessThan(1e-15);
    // Electrones: el borde hacia Î × B̂ se carga negativo; huecos: positivo
    expect(h.signoBorde).toBe(-1);
    expect(hall({ ...p, q }).signoBorde).toBe(1);
  });
  it('transitorio: E_H crece hasta el equilibrio y la deriva transversal se apaga', () => {
    const h = hall({ I: 1, B: 1, n: 1e28, q, espesor: 1e-3, ancho: 1e-2 });
    expect(hallTransitorio(h, 0, 1).EH).toBe(0);
    expect(hallTransitorio(h, 1, 1).fraccion).toBeCloseTo(1 - Math.exp(-1), 15);
    expect(rel(hallTransitorio(h, 50, 1).VH, h.VH)).toBeLessThan(1e-15);
  });
  it('MEXT 2014 P2: N = n·a·b·v·t (d), I = q·n·a·b·v (b), F = q·v·B (e), V = B·v·b (f), n = B·I/(q·a·V) (b)', () => {
    const a = 2e-4, b = 5e-3, n = 5e28, v = 1e-4, B = 0.5, I = q * n * a * b * v;
    const h = hall({ I, B, n, q: -q, espesor: a, ancho: b });
    expect(rel(h.vd, v)).toBeLessThan(1e-14);
    expect(rel(h.portadoresPorTiempo * 3, n * a * b * v * 3)).toBeLessThan(1e-14);
    expect(rel(h.FB, q * v * B)).toBeLessThan(1e-14);
    expect(rel(h.VH, B * v * b)).toBeLessThan(1e-14);
    expect(rel(B * I / (q * a * h.VH), n)).toBeLessThan(1e-14);
    expect(() => hall({ I, B, n: 0, q, espesor: a, ancho: b })).toThrow(ErrorMagnetismo);
  });
});

describe('inducción: barra en rieles', () => {
  const B = 0.8, L = 0.5, R = 2, m = 0.2;
  const region = { poligono: rectangulo([2, 0], 6, 2), B };
  it('con fuerza aplicada: v(t) = v_t·(1 − e^{−t/τ}) exacta y velocidad terminal F·R/(B²L²)', () => {
    const F = 0.6, vt = F * R / (B * B * L * L), tau = m * R / (B * B * L * L);
    const sim = simularInduccion({ regiones: [region], circuitos: [{ tipo: 'rieles', origen: [0, 0], angulo: 0, separacion: L, largo: 4, R, barras: [{ s: 0.1, m, F }] }], duracion: 2 });
    for (const t of [0.1, 0.5, 1.2]) {
      const c = estadoInduccion(sim, t).circuitos[0];
      expect(Math.abs(c.v[0] - vt * (1 - Math.exp(-t / tau)))).toBeLessThan(1e-9 * vt);
      // fem = −B·L·v (sentido antihorario positivo) e I = fem/R; la fuerza frena: −B·I·L… contra v
      expect(c.fem).toBeCloseTo(-B * L * c.v[0], 12);
      expect(c.I).toBeCloseTo(c.fem / R, 12);
      expect(c.Fmag[0]).toBeCloseTo(-B * B * L * L * c.v[0] / R, 12);
    }
    expect(rel(velocidadTerminal({ m, F, R, B, L }), vt)).toBeLessThan(1e-15);
  });
  it('rieles inclinados con gravedad: v_t = m·g·R·sen θ/(B²L²); con B vertical, /(B²L²cos²θ) (MEXT 2015 P2)', () => {
    const th = 25 * GR;
    for (const bVertical of [false, true]) {
      const sim = simularInduccion({ regiones: [{ poligono: rectangulo([10, 0], 30, 2), B }], circuitos: [{ tipo: 'rieles', origen: [0, 0], angulo: 0, separacion: L, largo: 25, R, inclinacion: th, bVertical, barras: [{ s: 0.1, m }] }], duracion: 3 });
      const c = estadoInduccion(sim, 3).circuitos[0], u = velocidadTerminal({ m, R, B, L, inclinacion: th, bVertical });
      const Bn = B * (bVertical ? Math.cos(th) : 1), tau = m * R / (Bn * Bn * L * L);
      expect(Math.abs(c.v[0] - u * (1 - Math.exp(-3 / tau)))).toBeLessThan(1e-8 * u);
      if (bVertical) {
        const ue = m * 9.8 * R * Math.sin(th) / (L * L * B * B * Math.cos(th) ** 2);
        expect(rel(u, ue)).toBeLessThan(1e-15);     // (4): respuesta (e)
        // (2) I = v·d·B·cos θ/R (f); (3) fuerza a lo largo del plano v·d²·B²·cos²θ/R (c)
        expect(Math.abs(c.I)).toBeCloseTo(c.v[0] * L * B * Math.cos(th) / R, 12);
        expect(Math.abs(c.Fmag[0])).toBeCloseTo(c.v[0] * L * L * B * B * Math.cos(th) ** 2 / R, 12);
        // (5) potencia de la gravedad a velocidad terminal: m²g²R·tan²θ/(d²B²) (e)
        expect(rel(m * 9.8 * Math.sin(th) * ue, m * m * 9.8 * 9.8 * R * Math.tan(th) ** 2 / (L * L * B * B))).toBeLessThan(1e-14);
        // (1) sentido de la corriente: con la barra bajando hacia +x y B saliente, horario (I < 0)
        expect(c.I).toBeLessThan(0);
      }
    }
  });
  it('balance de energía: trabajo de la gravedad = ΔK + calor de Joule (también con fricción y con L)', () => {
    const casos = [
      { R, barras: [{ s: 0.1, m }], inclinacion: 0.4 },
      { R, barras: [{ s: 0.1, m, mu: 0.15, v: 1 }], inclinacion: 0.3 },
      { R, L: 0.3, barras: [{ s: 0.1, m, F: 0.5 }] },
      { R: null, barras: [{ s: 0.5, m, r: 0.5 }, { s: 1, m, r: 0.5, v: 2 }] },
    ];
    for (const cc of casos) {
      const sim = simularInduccion({ regiones: [{ poligono: rectangulo([5, 0], 12, 2), B }], circuitos: [{ tipo: 'rieles', origen: [0, 0], angulo: 0.3, separacion: L, largo: 10, ...cc }], duracion: 1.5 });
      for (const t of [0.4, 1.5]) {
        const b = balanceInduccion(sim, estadoInduccion(sim, t));
        expect(Math.abs(b.residuo)).toBeLessThan(2e-8 * Math.max(1e-3, Math.abs(b.entradas) + b.QJ + b.Qf + Math.abs(b.dK)));
      }
    }
  });
  it('dos barras sin resistencia: el momento se conserva y terminan con la misma velocidad', () => {
    const sim = simularInduccion({ regiones: [{ poligono: rectangulo([2, 0], 6, 2), B: 2 }], circuitos: [{ tipo: 'rieles', origen: [0, 0], angulo: 0, separacion: L, largo: 5, R: null, barras: [{ s: 0.5, m: 0.1, r: 0.5 }, { s: 1, m: 0.3, r: 0.5, v: 2 }] }], duracion: 1.5 });
    for (const t of [0.2, 1.5]) {
      const c = estadoInduccion(sim, t).circuitos[0];
      expect(0.1 * c.v[0] + 0.3 * c.v[1]).toBeCloseTo(0.6, 10);
    }
    const c = estadoInduccion(sim, 1.5).circuitos[0];
    expect(Math.abs(c.v[0] - 1.5)).toBeLessThan(1e-3); expect(Math.abs(c.v[1] - 1.5)).toBeLessThan(1e-3);
  });
  it('fricción seca: la barra se detiene y queda quieta; la barra sale de los rieles por el final', () => {
    const sim = simularInduccion({ regiones: [region], circuitos: [{ tipo: 'rieles', origen: [0, 0], angulo: 0, separacion: L, largo: 4, R, barras: [{ s: 0.5, m: 0.1, v: 3, mu: 0.3 }] }], duracion: 2 });
    const alto = sim.eventos.find(e => e.tipo === 'alto');
    expect(alto).toBeTruthy();
    const a = estadoInduccion(sim, alto.t + 0.1).circuitos[0], b = estadoInduccion(sim, 2).circuitos[0];
    expect(a.v[0]).toBe(0); expect(a.s[0]).toBe(b.s[0]);
    const fuera = simularInduccion({ regiones: [region], circuitos: [{ tipo: 'rieles', origen: [0, 0], angulo: 0, separacion: L, largo: 1, R, barras: [{ s: 0.5, m, vImpuesta: 1 }] }], duracion: 2 });
    const e = fuera.eventos.find(x => x.tipo === 'fuera');
    expect(e.t).toBeCloseTo(0.5, 9);
    expect(fuera.tFin).toBeCloseTo(0.5, 9);
  });
  it('barra oblicua: la fem es B·v·d (el ancho entre rieles) y la fuerza magnética B·I·ℓ, perpendicular a la barra', () => {
    const phi = 30 * GR, v = 2;
    const sim = simularInduccion({ regiones: [region], circuitos: [{ tipo: 'rieles', origen: [0, 0], angulo: 0, separacion: L, largo: 4, R, barras: [{ s: 1, m, vImpuesta: v, angulo: phi }] }], duracion: 0.5 });
    const c = estadoInduccion(sim, 0.2).circuitos[0], ell = L / Math.cos(phi);
    expect(Math.abs(c.fem)).toBeCloseTo(B * v * L, 12);
    const F = c.fuerzas[0].F;
    expect(Math.hypot(F[0], F[1])).toBeCloseTo(B * Math.abs(c.I) * ell, 12);
    expect(Math.abs(F[0] * Math.sin(phi) + F[1] * Math.cos(phi))).toBeLessThan(1e-15);  // perpendicular a la barra
    expect(Math.abs(F[0])).toBeCloseTo(B * Math.abs(c.I) * L, 12);
  });
});

describe('inducción: espiras, hilos, campos variables y generador', () => {
  const B = 0.8, R = 2;
  it('espira que entra en una región con v constante: fem = B·l·v mientras entra, cero dentro (MEXT 2018 P2)', () => {
    const l = 0.1, v = 0.5;
    const sim = simularInduccion({ regiones: [{ poligono: [[0, -1], [3, -1], [3, 1], [0, 1]], B }], circuitos: [{ tipo: 'espira', ancho: l, alto: l, centro: [-l / 2, 0], R, m: 0.05, vImpuesta: [v, 0] }], duracion: 0.6, dt: 0.01 });
    for (const t of [0.03, 0.11, 0.17]) {
      const c = estadoInduccion(sim, t).circuitos[0];
      expect(c.phi).toBeCloseTo(B * l * v * t, 14);              // (1) Φ = v·B·l·t (c)
      expect(Math.abs(c.fem)).toBeCloseTo(v * B * l, 14);        // (2) fem = v·B·l (b)
      expect(Math.abs(c.I)).toBeCloseTo(v * B * l / R, 14);      // (3) I = v·B·l/R (e)
      expect(c.I).toBeLessThan(0);                               // (4) horario: a → b → c → d (a)
      // (5) la fuerza externa para mantener v equilibra B·I·l = v·B²·l²/R (d)
      expect(-c.fuerzaTotal[0]).toBeCloseTo(v * B * B * l * l / R, 14);
    }
    for (const t of [0.25, 0.5]) { const c = estadoInduccion(sim, t).circuitos[0]; expect(c.fem).toBe(0); expect(c.I).toBe(0); }
    expect(sim.eventos.some(e => /queda dentro/.test(e.nombre) && Math.abs(e.t - l / v) < 1e-9)).toBe(true);
    const b = balanceInduccion(sim, estadoInduccion(sim, 0.6));
    expect(rel(b.QJ, (v * B * l) ** 2 / R * (l / v))).toBeLessThan(1e-7);
    expect(Math.abs(b.residuo)).toBeLessThan(1e-12);
  });
  it('la fem es −dΦ/dt: una espira triangular que cruza en diagonal una región no convexa', () => {
    const Lreg = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]];
    const sim = simularInduccion({ regiones: [{ poligono: Lreg, B }], circuitos: [{ tipo: 'espira', puntos: [[-0.1, -0.1], [0.15, -0.05], [0, 0.2]], centro: [0.8, 0.6], R, m: 0.1, vImpuesta: [0.7, 0.9] }], duracion: 1 });
    for (const t of [0.2, 0.37, 0.61]) {
      const dt = 1e-6, a = estadoInduccion(sim, t - dt).circuitos[0].phi, b = estadoInduccion(sim, t + dt).circuitos[0].phi;
      expect(Math.abs(estadoInduccion(sim, t).circuitos[0].fem + (b - a) / (2 * dt))).toBeLessThan(1e-7);
    }
  });
  it('espira que se aleja de un hilo: I = 2μ0·a·b·v·I/(π·R·(r² − b²)) (MEXT 2010 4-E)', () => {
    const I = 20, a = 0.05, b = 0.04, v = 2, r0 = 0.1;
    const sim = simularInduccion({ hilos: [{ a: [0, 0], angulo: Math.PI / 2, I }], circuitos: [{ tipo: 'espira', ancho: 2 * b, alto: 2 * a, centro: [r0, 0], R, vImpuesta: [v, 0] }], duracion: 0.1 });
    for (const t of [0, 0.03, 0.1]) {
      const c = estadoInduccion(sim, t).circuitos[0], r = c.centro[0];
      expect(rel(Math.abs(c.I), 2 * MU0 * a * b * v * I / (Math.PI * R * (r * r - b * b)))).toBeLessThan(1e-12);
      expect(rel(-c.phi, MU0 * I * 2 * a / (2 * Math.PI) * Math.log((r + b) / (r - b)))).toBeLessThan(1e-12);
    }
    // Se aleja: el flujo entrante disminuye y la corriente inducida lo refuerza (horaria, I < 0)
    expect(estadoInduccion(sim, 0.05).circuitos[0].I).toBeLessThan(0);
    // La fuerza neta atrae la espira hacia el hilo (se opone al movimiento)
    expect(estadoInduccion(sim, 0.05).circuitos[0].fuerzaTotal[0]).toBeLessThan(0);
  });
  it('campo variable: fem = −A·dB/dt en una espira quieta, y con L la corriente sigue a (1 − e^{−Rt/L})', () => {
    const A = 0.02, k = 2;
    const sim = simularInduccion({ regiones: [{ poligono: rectangulo([0, 0], 1, 1), B: 0, variacion: { tipo: 'rampa', pendiente: k, inicio: 0, fin: 5 } }], circuitos: [{ tipo: 'espira', ancho: 0.2, alto: 0.1, centro: [0, 0], R, L: 0.5, m: 1, vImpuesta: [0, 0] }], duracion: 1 });
    for (const t of [0.1, 0.5, 1]) {
      const c = estadoInduccion(sim, t).circuitos[0];
      expect(c.femTrans).toBeCloseTo(-k * A, 14);
      expect(Math.abs(c.I - (-k * A / R) * (1 - Math.exp(-R * t / 0.5)))).toBeLessThan(1e-10);
      const bb = balanceInduccion(sim, estadoInduccion(sim, t));
      expect(Math.abs(bb.residuo)).toBeLessThan(1e-12);
      expect(bb.dUL).toBeGreaterThan(0);
    }
  });
  it('espira que cae saliendo de un campo: velocidad terminal M·g·R/(B²L²); con dos vueltas (doble R y M) es la misma (MEXT 2012 P2)', () => {
    const Bc = 1, Lw = 0.2, Rr = 0.05, M = 0.02, g = 9.8, vt = M * g * Rr / (Bc * Bc * Lw * Lw);
    const caer = (N, Rf, Mf) => simularInduccion({ regiones: [{ poligono: [[-1, 0], [1, 0], [1, 3], [-1, 3]], B: Bc }], circuitos: [{ tipo: 'espira', ancho: Lw, alto: 1.2, centro: [0, 0.5], N, R: Rf, m: Mf, gravedad: [0, -g], ejes: 'y' }], duracion: 0.5 });
    const sim = caer(1, Rr, M), c = estadoInduccion(sim, 0.5).circuitos[0];
    expect(rel(-c.vel[1], vt)).toBeLessThan(1e-6);                                // (2) v = M·g·R/(B²L²) (c)
    expect(rel(Math.abs(c.I), Bc * vt * Lw / Rr)).toBeLessThan(1e-6);             // (1) I = B·v·L/R (d)
    expect(rel(Rr * c.I * c.I, Bc ** 2 * vt ** 2 * Lw ** 2 / Rr)).toBeLessThan(2e-6);  // (3) calor por unidad de tiempo (c)
    const doble = estadoInduccion(caer(2, 2 * Rr, 2 * M), 0.5).circuitos[0];
    expect(rel(doble.vel[1], c.vel[1])).toBeLessThan(1e-6);                      // (4) misma rapidez: 1 (c)
    expect(Math.abs(balanceInduccion(sim, estadoInduccion(sim, 0.5)).residuo)).toBeLessThan(1e-9);
  });
  it('generador: fem = N·B·A·ω·sen ωt, positiva en la primera media vuelta (MEXT 2010 4-F: gráfica ③)', () => {
    const N = 50, Bg = 0.2, A = 0.01, w = 2 * Math.PI * 5;
    const sim = simularInduccion({ circuitos: [{ tipo: 'generador', N, B: Bg, ancho: 0.1, alto: 0.1, omega: w, R: 10 }], duracion: 0.4 });
    for (const t of [0.013, 0.07, 0.19]) {
      const c = estadoInduccion(sim, t).circuitos[0];
      expect(c.fem).toBeCloseTo(N * Bg * A * w * Math.sin(w * t), 13);
      expect(c.phi).toBeCloseTo(N * Bg * A * Math.cos(w * t), 14);
      expect(c.fem).toBeCloseTo(femGenerador({ N, B: Bg, A, omega: w }, t), 13);
    }
    // ③: empieza en 0, positiva hasta T/2, negativa hasta T, una oscilación por vuelta
    const T = 2 * Math.PI / w, f = t => estadoInduccion(sim, t).circuitos[0].fem;
    expect(f(T / 4)).toBeGreaterThan(0); expect(f(3 * T / 4)).toBeLessThan(0); expect(Math.abs(f(T))).toBeLessThan(1e-12);
    // Trabajo del motor = calor en la carga (+ ½LI² con inductancia)
    const conL = simularInduccion({ circuitos: [{ tipo: 'generador', N, B: Bg, ancho: 0.1, alto: 0.1, omega: w, R: 10, L: 0.2 }], duracion: 0.4 });
    expect(Math.abs(balanceInduccion(conL, estadoInduccion(conL, 0.4)).residuo)).toBeLessThan(1e-12);
  });
  it('conductor abierto (alas de un avión): V = v·B·L, sin corriente (MEXT 2027 1-(4): 5.0 V)', () => {
    const v = 900 / 3.6, Bt = 4e-4, L = 50;
    const sim = simularInduccion({ regiones: [{ poligono: rectangulo([0, 0], 1e5, 1e4), B: Bt }], circuitos: [{ tipo: 'conductor', centro: [0, 0], largo: L, angulo: Math.PI / 2, v: [v, 0] }], duracion: 1 });
    const c = estadoInduccion(sim, 0.5).circuitos[0];
    expect(Math.abs(c.fem)).toBeCloseTo(5.0, 12);
    expect(c.I).toBe(0);
  });
  it('rechaza escenas que no describen una situación física', () => {
    expect(() => simularInduccion({ circuitos: [], duracion: 1 })).toThrow(ErrorMagnetismo);
    expect(() => simularInduccion({ circuitos: [{ tipo: 'espira', ancho: 0.1, alto: 0.1, centro: [0, 0], R: 0, m: 1 }], duracion: 1 })).toThrow(/resistencia o inductancia/);
    expect(() => simularInduccion({ circuitos: [{ tipo: 'rieles', separacion: 0.5, largo: 1, R: 1, barras: [{ s: 0.5, m: 1 }, { s: 0.7, m: 1 }] }], duracion: 1 })).toThrow(/dos barras/);
    expect(() => simularParticulas({ particulas: [{ q: 1, m: 0, p: [0, 0], v: [0, 0] }], duracion: 1 })).toThrow(ErrorMagnetismo);
    expect(() => simularParticulas({ regiones: [{ tipo: 'B', poligono: [[0, 0], [1, 0]], B: 1 }], particulas: [], duracion: 1 })).toThrow(/tres vértices/);
  });
});

describe('MEXT: campo de corrientes y partículas', () => {
  it('2019 1-(3): dos hilos a 2d con corrientes opuestas: H = I/(2π·d) en P (a)', () => {
    const I = 3, d = 0.04;
    const f = [{ tipo: 'hilo', p: [-d, 0], I }, { tipo: 'hilo', p: [d, 0], dir: [0, 0, -1], I }];
    const B = campoB(f, [0, d, 0]);
    expect(rel(norma(B) / MU0, I / (2 * Math.PI * d))).toBeLessThan(1e-14);
    // Apunta en la dirección de la recta que une P con el punto medio
    expect(Math.abs(B[0])).toBeLessThan(1e-18); expect(B[1]).toBeGreaterThan(0);
  });
  it('2009 P2: v = E/B₁ (c), r = M·v/(q·B₂) (b) y la partícula alfa describe el doble de radio que el protón (d)', () => {
    const E = 3e4, B1 = 0.15, B2 = 0.4, v = E / B1;
    const ma = 4.001506 * UMA;
    const sim = simularParticulas({
      regiones: [
        // (2): Q (+) a la izquierda y P (−) a la derecha: E hacia +x; B₁ saliente (d) la equilibra
        { tipo: 'B', poligono: rectangulo([0, 0.06], 0.012, 0.08), B: B1 }, { tipo: 'E', poligono: rectangulo([0, 0.06], 0.012, 0.08), E: [E, 0] },
        { tipo: 'B', poligono: [[-0.5, -0.4], [0.2, -0.4], [0.2, 0], [-0.5, 0]], B: B2 },
      ],
      obstaculos: [{ tipo: 'placa', a: [-0.006, 0.02], b: [-0.006, 0.1] }, { tipo: 'placa', a: [0.006, 0.02], b: [0.006, 0.1] }, { tipo: 'pantalla', a: [-0.5, 0], b: [-0.004, 0] }],
      particulas: [{ id: 'protón', q, m: mp, p: [0, 0.11], v: [0, -v] }, { id: 'alfa', q: 2 * q, m: ma, p: [0, 0.11], v: [0, -v] }],
      duracion: 2e-5,
    });
    const [pr, al] = ['protón', 'alfa'].map(id => sim.impactos.find(e => e.particula === id));
    expect(pr && al).toBeTruthy();
    const rp = -pr.p[0] / 2, ra = -al.p[0] / 2;
    expect(rel(rp, mp * v / (q * B2))).toBeLessThan(1e-9);
    expect(ra / rp).toBeCloseTo(2 * ma / (4 * mp), 9);
    expect(Math.round(ra / rp)).toBe(2);
    // La fuerza magnética es perpendicular a v y a B, proporcional a la rapidez (d)
    const F = fuerzaLorentz(q, [0, -v, 0], [0, 0, 0], [0, 0, B2]);
    expect(F[1]).toBe(0); expect(rel(norma(F), q * v * B2)).toBeLessThan(1e-15);
  });
});

describe('MEXT 2025 (reconstrucciones: el banco solo da el tema)', () => {
  it('2025 T6: entra en el semiplano con B formando α con la normal: arco π + 2α, cuerda 2r·cos α, tiempo (π + 2α)·m/(q·B)', () => {
    const B = 0.01, v = 1e5, r = radioCiclotron(mp, v, q, B), T = periodoCiclotron(mp, q, B);
    for (const a of [0, 30 * GR, 55 * GR]) {
      const p0 = [-0.05, -0.05 * Math.tan(a)];
      const sim = simularParticulas({ regiones: [{ tipo: 'B', poligono: [[0, -0.4], [0.4, -0.4], [0.4, 0.15], [0, 0.15]], B }], particulas: [{ q, m: mp, p: p0, v: [v * Math.cos(a), v * Math.sin(a)] }], duracion: 8e-6, caja: [-0.2, 0.5, -0.5, 0.3] });
      const ent = sim.eventos.find(e => e.tipo === 'entrada'), sal = sim.eventos.find(e => e.tipo === 'salida');
      expect(Math.hypot(ent.p[0], ent.p[1])).toBeLessThan(1e-12);
      // Positiva con B saliente: gira en sentido horario y sale por debajo del punto de entrada
      expect(rel(Math.hypot(sal.p[0] - ent.p[0], sal.p[1] - ent.p[1]), 2 * r * Math.cos(a))).toBeLessThan(1e-9);
      expect(sal.p[1]).toBeLessThan(0);
      expect(rel(sal.t - ent.t, (Math.PI + 2 * a) / (2 * Math.PI) * T)).toBeLessThan(3e-5);
      // Sale con la dirección reflejada: π − α
      expect(Math.atan2(sal.v[1], sal.v[0])).toBeCloseTo(Math.PI - a, 6);
    }
  });
  it('2025 T3: barra inclinada φ sobre rieles: ε = B·v·d (no depende de φ); F = B·I·ℓ perpendicular a la barra, con B·I·d a lo largo de los rieles', () => {
    const B = 0.5, d = 0.4, R = 2, v = 1;
    for (const phi of [0, 30 * GR, 50 * GR]) {
      const sim = simularInduccion({ regiones: [{ poligono: rectangulo([1, 0], 2.2, 0.8), B }], circuitos: [{ tipo: 'rieles', origen: [0, 0], angulo: 0, separacion: d, largo: 2, R, barras: [{ s: 0.3, m: 0.1, vImpuesta: v, angulo: phi }] }], duracion: 1 });
      const c = estadoInduccion(sim, 0.5).circuitos[0], ell = d / Math.cos(phi), F = c.fuerzas[0].F;
      expect(Math.abs(c.fem)).toBeCloseTo(B * v * d, 12);
      expect(Math.abs(c.I)).toBeCloseTo(B * v * d / R, 12);
      expect(Math.hypot(F[0], F[1])).toBeCloseTo(B * Math.abs(c.I) * ell, 12);
      expect(Math.abs(F[0] * Math.sin(phi) + F[1] * Math.cos(phi))).toBeLessThan(1e-14);
      expect(-F[0]).toBeCloseTo(B * Math.abs(c.I) * d, 12);
      // El agente que mantiene v entrega exactamente el calor de Joule
      const bb = balanceInduccion(sim, estadoInduccion(sim, 1));
      expect(rel(bb.entradas, bb.QJ)).toBeLessThan(1e-9);
    }
    // Sin circuito (conductor inclinado θ respecto de v): V = B·v·L·sen θ
    const L = 0.5, th = 40 * GR;
    const con = simularInduccion({ regiones: [{ poligono: rectangulo([0, 0], 100, 100), B }], circuitos: [{ tipo: 'conductor', centro: [0, 0], largo: L, angulo: th, v: [v, 0] }], duracion: 1 });
    expect(Math.abs(estadoInduccion(con, 0.3).circuitos[0].fem)).toBeCloseTo(B * v * L * Math.sin(th), 13);
  });
});

describe('determinismo', () => {
  it('la misma escena da exactamente el mismo resultado', () => {
    const esc = () => ({ regiones: [{ tipo: 'B', poligono: rectangulo([0, 0], 0.2, 0.2), B: 0.3 }, { tipo: 'E', poligono: rectangulo([0.05, 0], 0.1, 0.2), E: [1e3, 2e3] }], particulas: emitirIones({ p: [-0.09, 0], giro: 0.2, especies: [{ q, m: mp }, { q: -q, m: 2 * MASA_ELECTRON * 1000 }], v: 5e4, cantidad: 2, abanico: 0.3 }), duracion: 2e-6, caja: [-0.2, 0.2, -0.2, 0.2] });
    const a = simularParticulas(esc()), b = simularParticulas(esc());
    expect(a.eventos).toEqual(b.eventos);
    a.trayectorias.forEach((tr, i) => { expect(tr.x).toEqual(b.trayectorias[i].x); expect(tr.vy).toEqual(b.trayectorias[i].vy); });
    const ind = () => ({ regiones: [{ poligono: rectangulo([1, 0], 1, 1), B: 0.5 }], circuitos: [{ tipo: 'rieles', origen: [0, 0], angulo: 0, separacion: 0.4, largo: 2, R: 1, barras: [{ s: 0.2, m: 0.1, F: 0.3, mu: 0.05 }] }], duracion: 2 });
    const c = simularInduccion(ind()), d = simularInduccion(ind());
    expect(c.eventos).toEqual(d.eventos);
    for (const t of [0, 0.73, 2]) expect(estadoInduccion(c, t)).toEqual(estadoInduccion(d, t));
  });
});
