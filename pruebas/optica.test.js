// Exactitud física del motor de óptica: índices y color, intersecciones
// exactas, Snell y reflexión total, Fresnel (R + T = 1), prisma, profundidad
// aparente, lentes y espejos (fórmula contra el cruce de los rayos
// trazados), interferencia y difracción por fasores, películas delgadas,
// anillos de Newton, Michelson y las situaciones MEXT de óptica.
import { describe, it, expect } from 'vitest';
import {
  MATERIALES, LAMBDA_D, LAMBDAS_BLANCA, C_LUZ, indiceDe, esDispersivo, snell, anguloCritico, anguloBrewster, fresnel,
  desviacionPrisma, desviacionMinima, indiceDesdeDesviacion, profundidadAparente, lenteDelgada, espejoEsferico, lenteGruesa,
  interseccionSegmento, interseccionArco, contiene, contornoForma, verticesForma, trazar, imagenesTrazadas, cruceRectas,
  intensidadPantalla, caminoOptico, cie1931, colorLongitudOnda, colorEspectro, muestrasVisible,
  rendijasRegulares, patronRendijas, fasoresEn, factorFraunhofer, interfranja, maximosRed, minimosRendija, diferenciaCaminos, extremos,
  cambiosFase, pelicula, espesoresMaximos, colorPelicula, interfranjaCuna, huecoNewton, radioAnilloOscuro, reflectanciaNewton,
  caminoLamina, caminoMichelson, intensidadDosHaces, franjasMichelson, indiceDesdeGiro, indiceDesdeLamina, michelsonEn, serieMichelson, anilloMichelson,
} from '../sistema/motores/optica.js';

const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const GR = Math.PI / 180;
const ang = d => Math.atan2(d[1], d[0]);
const sinOpts = { parciales: false };
// Un rayo que llega a P con incidencia θ respecto de la normal unitaria n (la que apunta hacia donde viene la luz)
const rayoHacia = (P, d, distancia = 0.2, lambda = LAMBDA_D) => ({ tipo: 'rayo', origen: [P[0] - d[0] * distancia, P[1] - d[1] * distancia], giro: ang(d), lambda });
const ultimoDe = res => res.caminos.filter(c => c.ultimo).map(c => c.ultimo);

describe('materiales, índices y color', () => {
  it('Cauchy: índices de tabla en la línea D y dispersión normal (n azul > n rojo)', () => {
    const tabla = { agua: 1.333, crown: 1.5168, flint: 1.620, diamante: 2.4175 };
    for (const [m, n] of Object.entries(tabla)) {
      expect(Math.abs(indiceDe({ material: m }, LAMBDA_D) - n)).toBeLessThan(2e-3);
      expect(indiceDe({ material: m }, 400e-9)).toBeGreaterThan(indiceDe({ material: m }, 700e-9));
      expect(esDispersivo({ material: m })).toBe(true);
    }
    expect(indiceDe({ n: 1.5 }, 400e-9)).toBe(1.5);
    expect(esDispersivo({ n: 1.5 })).toBe(false);
    expect(MATERIALES.vacio.A).toBe(1);
  });
  it('el color de una λ: rojo a 650 nm, verde a 530 nm, azul a 450 nm; el espectro plano es blanco', () => {
    const c = l => colorLongitudOnda(l * 1e-9).lineal;
    const [r6, g6, b6] = c(650), [r5, g5, b5] = c(530), [r4, g4, b4] = c(450);
    expect(r6).toBe(1); expect(g6).toBeLessThan(0.3); expect(b6).toBeLessThan(0.1);
    expect(g5).toBe(1); expect(r5).toBeLessThan(0.5);
    expect(b4).toBe(1); expect(r4).toBeLessThan(0.6); expect(g4).toBeLessThan(0.5);
    // ȳ tiene su máximo cerca de 555 nm
    expect(cie1931(555e-9)[1]).toBeGreaterThan(cie1931(500e-9)[1]);
    expect(cie1931(555e-9)[1]).toBeGreaterThan(cie1931(610e-9)[1]);
    const L = muestrasVisible(36), w = colorEspectro(L, L.map(() => 1));
    for (const x of w) expect(Math.abs(x - 1)).toBeLessThan(1e-12);
  });
});

describe('geometría exacta', () => {
  it('rayo-segmento y rayo-arco: puntos de corte y normales exactos', () => {
    const s = interseccionSegmento([0, 0], [1, 0], [2, -1], [2, 3]);
    expect(s.t).toBe(2); expect(s.u).toBeCloseTo(0.25, 15);
    expect(interseccionSegmento([0, 0], [1, 0], [2, 1], [2, 3])).toBeNull();
    const a = interseccionArco([-2, 0.5], [1, 0], [0, 0], 1, 0, 2 * Math.PI);
    expect(a.t).toBeCloseTo(2 - Math.sqrt(0.75), 14);
    expect(a.normal[0]).toBeCloseTo(-Math.sqrt(0.75), 14);
    // Arco de la mitad derecha: el rayo lo corta solo al salir
    const b = interseccionArco([-2, 0.5], [1, 0], [0, 0], 1, -Math.PI / 2, Math.PI / 2);
    expect(b.t).toBeCloseTo(2 + Math.sqrt(0.75), 14);
  });
  it('punto interior: círculo, semicírculo, prisma y lente gruesa', () => {
    const c = contornoForma({ tipo: 'circulo', centro: [1, 1], radio: 0.5 });
    expect(contiene(c, [1.2, 1.2])).toBe(true); expect(contiene(c, [1.5, 1.5])).toBe(false);
    const sc = contornoForma({ tipo: 'semicirculo', centro: [0, 0], radio: 1, giro: 0 });
    expect(contiene(sc, [0.5, 0])).toBe(true); expect(contiene(sc, [-0.1, 0])).toBe(false);
    const p = contornoForma({ tipo: 'prisma', centro: [0, 0], lado: 1, angulo: 60 * GR });
    expect(contiene(p, [0, 0])).toBe(true); expect(contiene(p, [0.45, 0.4])).toBe(false);
    const l = contornoForma({ tipo: 'lente', centro: [0, 0], R1: 0.1, R2: -0.1, espesor: 0.01, apertura: 0.04 });
    expect(contiene(l, [0, 0])).toBe(true); expect(contiene(l, [0.0049, 0])).toBe(true); expect(contiene(l, [0.0051, 0])).toBe(false);
    expect(contiene(l, [0, 0.019])).toBe(true); expect(contiene(l, [0.004, 0.019])).toBe(false);
    // El dibujo de la lente es un polígono cerrado y encadenado
    const v = verticesForma({ tipo: 'lente', centro: [0, 0], R1: 0.1, R2: -0.1, espesor: 0.01, apertura: 0.04 });
    for (let i = 0; i < v.length; i++) { const a = v[i], b = v[(i + 1) % v.length]; expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(0.007); }
    expect(() => contornoForma({ tipo: 'lente', centro: [0, 0], R1: 0.01, R2: -0.01, espesor: 0.001, apertura: 0.019 })).toThrow(RangeError);
  });
});

describe('refracción y reflexión total', () => {
  it('Snell: n₁ sen θ₁ = n₂ sen θ₂; ángulo crítico asen(n₂/n₁)', () => {
    for (const [n1, n2, t] of [[1, 1.333, 30], [1.5, 1, 20], [1.333, 1.5, 70]]) {
      expect(n1 * Math.sin(t * GR) - n2 * Math.sin(snell(n1, n2, t * GR))).toBeCloseTo(0, 14);
    }
    expect(snell(1.5, 1, 45 * GR)).toBeNaN();
    expect(anguloCritico(1.5, 1)).toBeCloseTo(Math.asin(1 / 1.5), 15);
    expect(anguloCritico(1, 1.5)).toBeNaN();
  });
  it('el rayo trazado del aire al agua cumple Snell en el punto de choque', () => {
    for (const t of [10, 30, 60, 85]) {
      const d = [Math.sin(t * GR), -Math.cos(t * GR)];
      const res = trazar({ elementos: [{ tipo: 'medio', forma: { tipo: 'rectangulo', centro: [0, -0.5], ancho: 2, alto: 1 }, n: 1.333 }, rayoHacia([0, 0], d)], opciones: sinOpts });
      const it0 = res.interacciones[0];
      expect(it0.tipo).toBe('refraccion');
      expect(it0.theta1).toBeCloseTo(t * GR, 13);
      // Dirección del tramo dentro del agua (el segundo segmento)
      const s1 = res.segmentos[1], dentro = [s1.b[0] - s1.a[0], s1.b[1] - s1.a[1]];
      expect(s1.n).toBe(1.333);
      expect(Math.sin(t * GR) - 1.333 * Math.abs(dentro[0]) / Math.hypot(dentro[0], dentro[1])).toBeCloseTo(0, 13);
      expect(Math.sin(it0.theta2) * 1.333).toBeCloseTo(Math.sin(t * GR), 13);
    }
  });
  it('semicírculo de vidrio: por encima del ángulo crítico se refleja todo; por debajo, refracta', () => {
    const n = 1.5, tc = anguloCritico(n, 1);
    const medio = { tipo: 'medio', forma: { tipo: 'semicirculo', centro: [0, 0], radio: 0.05, giro: 0 }, n };
    for (const alfa of [30 * GR, tc - 0.5 * GR, tc + 0.5 * GR, 60 * GR]) {
      // Entra por la cara curva hacia el centro (incidencia normal) y llega a la plana con incidencia α
      const d = [-Math.cos(alfa), -Math.sin(alfa)];
      const res = trazar({ elementos: [medio, rayoHacia([0, 0], d, 0.1)], opciones: sinOpts });
      const plana = res.interacciones.find(x => Math.hypot(x.p[0], x.p[1]) < 1e-12);
      expect(plana.theta1).toBeCloseTo(alfa, 12);
      if (alfa > tc) {
        expect(plana.tipo).toBe('total');
        expect(plana.R).toBe(1);
      } else {
        expect(plana.tipo).toBe('refraccion');
        expect(Math.sin(plana.theta2)).toBeCloseTo(n * Math.sin(alfa), 12);
      }
    }
  });
});

describe('Fresnel', () => {
  it('R + T = 1 con T calculada aparte de las amplitudes de transmisión (s y p)', () => {
    for (const [n1, n2] of [[1, 1.5], [1.5, 1], [1, 2.42], [1.333, 1.5]]) {
      for (let t = 0; t < 89.5; t += 7.3) {
        const F = fresnel(n1, n2, t * GR);
        if (F.total) { expect(F.R).toBe(1); continue; }
        expect(Math.abs(F.Rs + F.Ts - 1)).toBeLessThan(1e-14);
        expect(Math.abs(F.Rp + F.Tp - 1)).toBeLessThan(1e-14);
        expect(Math.abs(F.R + F.T - 1)).toBeLessThan(1e-14);
      }
    }
  });
  it('incidencia normal R = ((n₁ − n₂)/(n₁ + n₂))²; en el ángulo de Brewster R_p = 0', () => {
    expect(fresnel(1, 1.5, 0).R).toBeCloseTo(0.04, 15);
    expect(fresnel(1.5, 1, 0).R).toBeCloseTo(0.04, 15);
    expect(fresnel(1, 1.5, anguloBrewster(1, 1.5)).Rp).toBeLessThan(1e-28);
    expect(fresnel(1, 1.5, 89.9 * GR).R).toBeGreaterThan(0.98);
  });
  it('el trazado reparte la intensidad sin perderla: lo que sale de una lámina suma la intensidad inicial', () => {
    const res = trazar({
      elementos: [{ tipo: 'medio', forma: { tipo: 'lamina', centro: [0, 0], ancho: 1, alto: 0.05 }, n: 1.5 }, rayoHacia([0, 0.025], [Math.sin(40 * GR), -Math.cos(40 * GR)])],
      opciones: { parciales: true, umbral: 1e-14, maxRebotes: 400 },
    });
    let sale = 0, perdida = 0;
    for (const c of res.caminos) { if (c.termina === null) sale += c.I; else if (c.termina.rol === 'umbral') perdida += c.I; }
    expect(res.incompleta).toBeNull();
    expect(Math.abs(sale + perdida - 1)).toBeLessThan(1e-12);
    expect(perdida).toBeLessThan(1e-12);
  });
});

describe('prisma', () => {
  const A = 60 * GR, n = 1.5;
  // Prisma con el centroide en el origen y el vértice hacia +y; rayo a la mitad de la cara izquierda
  function desviacionTrazada(theta1) {
    const s = 0.05, b = s * Math.sin(A / 2), H = s * Math.cos(A / 2);
    const M = [-b / 2, H / 6], nIn = -A / 2, d = [Math.cos(nIn + theta1), Math.sin(nIn + theta1)];
    const res = trazar({ elementos: [{ tipo: 'medio', forma: { tipo: 'prisma', centro: [0, 0], lado: s, angulo: A }, n }, rayoHacia(M, d, 0.05)], opciones: sinOpts });
    const sale = ultimoDe(res)[0].d;
    return ang(d) - ang(sale);
  }
  it('desviación mínima 2·asen(n·sen(A/2)) − A con el rayo simétrico, y mayor a los lados', () => {
    const t1 = Math.asin(n * Math.sin(A / 2)), dm = desviacionMinima(A, n);
    expect(desviacionPrisma(A, n, t1)).toBeCloseTo(dm, 14);
    expect(desviacionTrazada(t1)).toBeCloseTo(dm, 12);
    expect(dm / GR).toBeCloseTo(37.1808, 3);
    for (const t of [40, 60, 75]) {
      expect(desviacionTrazada(t * GR)).toBeCloseTo(desviacionPrisma(A, n, t * GR), 12);
      expect(desviacionTrazada(t * GR)).toBeGreaterThan(dm);
    }
    expect(indiceDesdeDesviacion(A, dm)).toBeCloseTo(n, 14);
  });
});

describe('profundidad aparente', () => {
  it('un punto a 10 cm bajo el agua se ve a h/n (rayos que entran en la pupila)', () => {
    const n = 1.333, h = 0.1;
    expect(profundidadAparente(h, n)).toBeCloseTo(h / n, 15);
    const res = trazar({
      elementos: [
        { tipo: 'medio', forma: { tipo: 'rectangulo', centro: [0, -0.15], ancho: 1, alto: 0.3 }, n },
        { tipo: 'puntual', origen: [0, -h], giro: Math.PI / 2, abertura: 1 * GR, rayos: 101 },
        { tipo: 'ojo', centro: [0, 0.3], giro: -Math.PI / 2, largo: 0.004 },
      ], opciones: sinOpts,
    });
    const vista = imagenesTrazadas(res).find(i => i.ojo === 2);
    expect(vista.real).toBe(false);
    expect(vista.rayos).toBeGreaterThan(20);
    expect(rel(-vista.p[1], h / n)).toBeLessThan(1e-4);
    expect(Math.abs(vista.p[0])).toBeLessThan(1e-12);
  });
});

describe('lentes y espejos: fórmula contra el cruce de los rayos trazados', () => {
  const objeto = (s, y, abertura = 20 * GR) => ({ tipo: 'objeto', origen: [-s, 0], altura: y, giro: 0, abertura, rayos: 21 });
  const imagen = (res, punto) => imagenesTrazadas(res).find(i => i.punto === punto && !i.ojo);
  it('lente convergente f = 10 cm, objeto a 30 cm: imagen real a 15 cm, m = −0.5', () => {
    const f = 0.1, s = 0.3, y = 0.02, L = lenteDelgada(f, s);
    expect(L.s2).toBeCloseTo(0.15, 14); expect(L.m).toBeCloseTo(-0.5, 14); expect(L.real).toBe(true);
    const res = trazar({ elementos: [{ tipo: 'lente', centro: [0, 0], giro: 0, largo: 0.2, f }, objeto(s, y)] });
    const punta = imagen(res, 0), pie = imagen(res, 1);
    expect(punta.real).toBe(true);
    expect(punta.p[0]).toBeCloseTo(L.s2, 12); expect(punta.p[1]).toBeCloseTo(L.m * y, 12);
    expect(pie.p[0]).toBeCloseTo(L.s2, 12); expect(Math.abs(pie.p[1])).toBeLessThan(1e-12);
    expect(punta.rms).toBeLessThan(1e-12);
  });
  it('objeto dentro de la focal: imagen virtual, derecha y aumentada (lupa); lente divergente: virtual y reducida', () => {
    for (const [f, s] of [[0.1, 0.05], [-0.1, 0.2], [-0.05, 0.05]]) {
      const L = lenteDelgada(f, s), y = 0.01;
      const res = trazar({ elementos: [{ tipo: 'lente', centro: [0, 0], giro: 0, largo: 0.3, f }, objeto(s, y, 40 * GR)] });
      const punta = imagen(res, 0);
      expect(L.real).toBe(false); expect(punta.real).toBe(false);
      expect(rel(punta.p[0], L.s2)).toBeLessThan(1e-11); expect(rel(punta.p[1], L.m * y)).toBeLessThan(1e-11);
      expect(L.m).toBeGreaterThan(0);
    }
    expect(lenteDelgada(0.1, 0.1).infinito).toBe(true);
  });
  it('lente gruesa biconvexa: los rayos paraxiales cruzan el eje a la distancia focal posterior', () => {
    const n = 1.5, R1 = 0.1, R2 = -0.1, e = 0.01, G = lenteGruesa(n, R1, R2, e);
    expect(1 / G.f).toBeCloseTo((n - 1) * (1 / R1 - 1 / R2 + (n - 1) * e / (n * R1 * R2)), 12);
    const res = trazar({
      elementos: [{ tipo: 'medio', forma: { tipo: 'lente', centro: [0, 0], giro: 0, R1, R2, espesor: e, apertura: 0.04 }, n },
        { tipo: 'haz', origen: [-0.1, 0], giro: 0, ancho: 4e-4, rayos: 5 }],
      opciones: sinOpts,
    });
    const foco = imagenesTrazadas(res)[0];
    expect(foco.real).toBe(true);
    expect(rel(foco.p[0], e / 2 + G.posterior)).toBeLessThan(1e-5);
    // Con un material dispersivo, el azul enfoca antes que el rojo (aberración cromática)
    const focal = l => {
      const r = trazar({ elementos: [{ tipo: 'medio', forma: { tipo: 'lente', centro: [0, 0], giro: 0, R1, R2, espesor: e, apertura: 0.04 }, material: 'flint' },
        { tipo: 'haz', origen: [-0.1, 0], giro: 0, ancho: 4e-4, rayos: 5, lambda: l }], opciones: sinOpts });
      return imagenesTrazadas(r)[0].p[0];
    };
    expect(focal(450e-9)).toBeLessThan(focal(650e-9));
  });
  it('espejo cóncavo R = 20 cm: el haz paraxial enfoca a R/2; objeto a 30 cm → imagen real a 15 cm, m = −0.5', () => {
    const R = 0.2, espejo = { tipo: 'espejo', espejo: 'esferico', centro: [0, 0], giro: Math.PI, R, apertura: 0.08 };
    let res = trazar({ elementos: [espejo, { tipo: 'haz', origen: [-0.3, 0], giro: 0, ancho: 2e-4, rayos: 5 }] });
    const foco = imagenesTrazadas(res)[0];
    expect(foco.real).toBe(true);
    // Aberración esférica longitudinal ≈ h²/(4R) ≈ 1.3·10⁻⁸ m con h = 10⁻⁴ m
    expect(Math.abs(foco.p[0] + R / 2)).toBeLessThan(5e-8);
    const E = espejoEsferico(R, 0.3);
    expect(E.f).toBe(0.1); expect(E.s2).toBeCloseTo(0.15, 14);
    // Objeto pequeño y abanico estrecho dirigido al vértice: rayos paraxiales
    const y = 0.002;
    res = trazar({ elementos: [espejo, { tipo: 'objeto', origen: [-0.3, 0], altura: y, giro: Math.atan2(-y, 0.3), abertura: 0.5 * GR, rayos: 41 }] });
    const punta = imagen(res, 0);
    expect(punta.real).toBe(true);
    expect(rel(-punta.p[0], E.s2)).toBeLessThan(2e-4);
    expect(rel(punta.p[1], E.m * y)).toBeLessThan(2e-4);
  });
  it('espejo plano: imagen virtual simétrica; por el dorso no refleja', () => {
    const espejo = { tipo: 'espejo', espejo: 'plano', centro: [0, 0], giro: Math.PI, largo: 0.4 };
    const res = trazar({ elementos: [espejo, { tipo: 'puntual', origen: [-0.2, 0.05], giro: 0, abertura: 30 * GR, rayos: 9 }] });
    const im = imagenesTrazadas(res)[0];
    expect(im.real).toBe(false);
    expect(im.p[0]).toBeCloseTo(0.2, 12); expect(im.p[1]).toBeCloseTo(0.05, 12);
    const dorso = trazar({ elementos: [espejo, { tipo: 'rayo', origen: [0.2, 0], giro: Math.PI }] });
    expect(dorso.interacciones.length).toBe(0);
    expect(dorso.caminos[0].termina.rol).toBe('espejo-dorso');
  });
  it('el cruce de rectas: rectas que pasan por un punto lo dan exacto; paralelas, en el infinito', () => {
    const X = [0.3, -0.2], rectas = [0.1, 0.5, 1.2].map(a => ({ p: [X[0] - Math.cos(a), X[1] - Math.sin(a)], d: [Math.cos(a), Math.sin(a)] }));
    const c = cruceRectas(rectas);
    expect(c.p[0]).toBeCloseTo(0.3, 14); expect(c.real).toBe(true);
    expect(cruceRectas([{ p: [0, 0], d: [1, 0] }, { p: [0, 1], d: [1, 0] }])).toBeNull();
  });
});

describe('pantalla, divisor y límites', () => {
  it('la pantalla recibe la intensidad que llega y la reparte a lo largo de su largo', () => {
    const res = trazar({ elementos: [{ tipo: 'haz', origen: [0, 0], giro: 0, ancho: 0.02, rayos: 11 }, { tipo: 'pantalla', centro: [0.5, 0], giro: Math.PI, largo: 0.1 }] });
    const I = intensidadPantalla(res, 1, 0.1, 100);
    expect(I.potencia).toBeCloseTo(1, 14);
    expect(I.total.filter(x => x > 0).length).toBe(11);
  });
  it('divisor de haz: reparte R y 1 − R', () => {
    const res = trazar({ elementos: [{ tipo: 'divisor', centro: [0.1, 0], giro: Math.PI * 3 / 4, largo: 0.05, R: 0.3 }, { tipo: 'rayo', origen: [0, 0], giro: 0 }] });
    const Is = res.caminos.map(c => c.I).sort();
    expect(Is[0]).toBeCloseTo(0.3, 14); expect(Is[1]).toBeCloseTo(0.7, 14);
    const refl = res.caminos.find(c => c.I < 0.5).ultimo.d;
    expect(refl[0]).toBeCloseTo(0, 12); expect(Math.abs(refl[1])).toBeCloseTo(1, 12);
  });
  it('un rayo atrapado entre dos espejos llega al límite de rebotes: resultado parcial con aviso, sin error', () => {
    const res = trazar({
      elementos: [{ tipo: 'espejo', centro: [0, 0], giro: 0, largo: 1 }, { tipo: 'espejo', centro: [1, 0], giro: Math.PI, largo: 1 }, { tipo: 'rayo', origen: [0.5, 0], giro: 0 }],
      opciones: { maxRebotes: 50 },
    });
    expect(res.incompleta).not.toBeNull();
    expect(res.avisos[0]).toMatch(/límite de 50 rebotes/);
    // 50 rebotes: 51 tramos de rayo
    expect(res.segmentos.length).toBe(51);
  });
  it('rechaza escenas que no describen una situación física', () => {
    expect(() => trazar({ elementos: [{ tipo: 'medio', forma: { tipo: 'circulo', centro: [0, 0], radio: -1 }, n: 1.5 }] })).toThrow(RangeError);
    expect(() => trazar({ elementos: [{ tipo: 'lente', centro: [0, 0], largo: 0.1, f: 0 }] })).toThrow(RangeError);
    expect(() => trazar({ elementos: [{ tipo: 'medio', forma: { tipo: 'circulo', centro: [0, 0], radio: 1 }, n: -2 }] })).toThrow(RangeError);
    expect(() => trazar({ elementos: [{ tipo: 'mesa' }] })).toThrow(/desconocido/);
  });
});

describe('luz blanca y dispersión', () => {
  it('el rayo blanco viaja entero hasta el prisma y allí se separa: el violeta se desvía más que el rojo', () => {
    const A = 60 * GR, s = 0.05, b = s * Math.sin(A / 2), H = s * Math.cos(A / 2), M = [-b / 2, H / 6];
    const d = [Math.cos(-A / 2 + 50 * GR), Math.sin(-A / 2 + 50 * GR)];
    const res = trazar({ elementos: [{ tipo: 'medio', forma: { tipo: 'prisma', centro: [0, 0], lado: s, angulo: A }, material: 'flint' }, { ...rayoHacia(M, d, 0.05), lambda: null }], opciones: sinOpts });
    expect(res.segmentos[0].lambda).toBeNull();
    const sal = res.caminos.filter(c => c.termina === null).map(c => ({ l: c.lambda, desv: ang(d) - ang(c.ultimo.d) }));
    expect(sal.map(x => x.l)).toEqual(expect.arrayContaining(LAMBDAS_BLANCA));
    const desv = l => sal.find(x => x.l === l).desv;
    for (let i = 1; i < LAMBDAS_BLANCA.length; i++) expect(desv(LAMBDAS_BLANCA[i])).toBeLessThan(desv(LAMBDAS_BLANCA[i - 1]));
    // Cada componente cumple la fórmula del prisma con su propio índice
    for (const l of LAMBDAS_BLANCA) expect(desv(l)).toBeCloseTo(desviacionPrisma(A, indiceDe({ material: 'flint' }, l), 50 * GR), 11);
  });
});

describe('interferencia y difracción por fasores', () => {
  const huygens = (p, y0, y1, puntos = 4001) => patronRendijas(p, { y0, y1, puntos, metodo: 'huygens' });
  it('Young: la interfranja medida es λL/(n·d), en el aire y en un medio', () => {
    for (const n of [1, 1.33]) {
      const lambda = 600e-9, L = 1, d = 0.25e-3, p = { lambda, L, n, rendijas: rendijasRegulares({ N: 2, d }) };
      const pat = huygens(p, -0.012, 0.012), max = extremos(pat.y, pat.I, 'max').filter(m => m.v > 0.5 * pat.Imax);
      const paso = (max[max.length - 1].x - max[0].x) / (max.length - 1);
      expect(rel(paso, interfranja(lambda, L, d, n))).toBeLessThan(5e-4);
      expect(max.length).toBeGreaterThan(8);
    }
  });
  it('en cada máximo la diferencia de caminos es un número entero de longitudes de onda', () => {
    const lambda = 500e-9, L = 0.5, d = 0.2e-3, p = { lambda, L, rendijas: rendijasRegulares({ N: 2, d }) };
    const pat = huygens(p, -0.006, 0.006);
    for (const m of extremos(pat.y, pat.I, 'max')) {
      const D = diferenciaCaminos({ y1: d / 2, y2: -d / 2, L, Y: m.x }).delta / lambda;
      expect(Math.abs(D - Math.round(D))).toBeLessThan(2e-3);
    }
  });
  it('rendija simple: mínimos en n·a·sen θ = m·λ', () => {
    const lambda = 500e-9, a = 50e-6, L = 2, p = { lambda, L, rendijas: rendijasRegulares({ N: 1, a }) };
    const pat = huygens(p, -0.07, 0.07), mins = extremos(pat.y, pat.I, 'min');
    for (const { m, theta } of minimosRendija(lambda, a).filter(x => Math.abs(x.m) <= 3)) {
      const Y = L * Math.tan(theta), cerca = mins.reduce((b, x) => (Math.abs(x.x - Y) < Math.abs(b.x - Y) ? x : b));
      expect(Math.abs(cerca.x - Y) / Math.abs(Y)).toBeLessThan(2e-3);
      void m;
    }
  });
  it('red de 20 rendijas: máximos principales en n·d·sen θ = m·λ; Fraunhofer coincide con Huygens lejos', () => {
    const lambda = 550e-9, d = 10e-6, a = 2e-6, L = 1, p = { lambda, L, rendijas: rendijasRegulares({ N: 20, d, a }) };
    const pat = huygens(p, -0.13, 0.13, 6001), max = extremos(pat.y, pat.I, 'max').filter(x => x.v > 0.2 * pat.Imax);
    for (const { m, theta } of maximosRed(lambda, d).filter(x => Math.abs(x.m) <= 2)) {
      const Y = L * Math.tan(theta), cerca = max.reduce((b, x) => (Math.abs(x.x - Y) < Math.abs(b.x - Y) ? x : b));
      expect(Math.abs(cerca.x - Y)).toBeLessThan(2e-4);
      void m;
    }
    const fr = patronRendijas(p, { y0: -0.13, y1: 0.13, puntos: 6001, metodo: 'fraunhofer' });
    let dif = 0;
    for (let i = 0; i < pat.I.length; i++) dif = Math.max(dif, Math.abs(pat.I[i] / pat.Imax - fr.I[i] / fr.Imax));
    expect(dif).toBeLessThan(0.02);
    expect(factorFraunhofer(0, { lambda, a, d, N: 20 })).toBe(1);
  });
  it('los fasores de cada rendija suman el campo total', () => {
    const p = { lambda: 600e-9, L: 1, rendijas: rendijasRegulares({ N: 3, d: 0.3e-3, a: 20e-6 }) };
    const f = fasoresEn(p, 0.0013);
    expect(f.fasores.length).toBe(3);
    expect(f.fasores.reduce((s, x) => s + x.re, 0)).toBeCloseTo(f.re, 14);
    expect(f.I).toBeCloseTo(f.re * f.re + f.im * f.im, 20);
  });
});

describe('películas delgadas y anillos de Newton', () => {
  it('sin grosor, la película refleja como la interfaz n₁|n₃', () => {
    for (const t of [0, 30 * GR]) expect(pelicula({ n1: 1, n2: 1.4, n3: 1.5, d: 0, lambda: 500e-9, theta1: t }).R).toBeCloseTo(fresnel(1, 1.5, t).R, 13);
  });
  it('máximos de reflexión: (m + ½)λ con un cambio de fase (jabón en aire), m·λ con dos (MgF₂ sobre vidrio)', () => {
    for (const [n1, n2, n3, t] of [[1, 1.33, 1, 0], [1, 1.33, 1, 35 * GR], [1, 1.38, 1.5, 0], [1.5, 1.33, 1, 10 * GR]]) {
      const lambda = 550e-9, ds = Array.from({ length: 4001 }, (_, i) => i * 1.5e-6 / 4000);
      const R = ds.map(d => pelicula({ n1, n2, n3, d, lambda, theta1: t }).R), max = extremos(ds, R, 'max');
      const teoria = espesoresMaximos({ n1, n2, n3, lambda, theta1: t, cuantos: 3 });
      for (let k = 0; k < 3; k++) expect(Math.abs(max[k].x - teoria[k].d)).toBeLessThan(2e-11);
      expect(cambiosFase(n1, n2, n3)).toBe(n2 > n1 ? (n3 > n2 ? 2 : 1) : n3 > n2 ? 1 : 0);
    }
  });
  it('la película se ve de colores y la muy delgada se ve negra', () => {
    const negra = colorPelicula({ n1: 1, n2: 1.33, n3: 1, d: 5e-9 });
    for (const x of negra) expect(Math.abs(x)).toBeLessThan(0.02);
    // A 300 nm domina el verde; a 400 nm, el magenta (rojo y azul sin verde)
    const c3 = colorPelicula({ n1: 1, n2: 1.33, n3: 1, d: 300e-9 }), c4 = colorPelicula({ n1: 1, n2: 1.33, n3: 1, d: 400e-9 });
    expect(c3[1]).toBeGreaterThan(c3[0]); expect(c3[1]).toBeGreaterThan(c3[2]);
    expect(c4[1]).toBeLessThan(0.1 * Math.min(c4[0], c4[2]));
  });
  it('cuña de aire: franjas separadas λ/(2 tan α)', () => {
    const lambda = 589e-9, alfa = 2e-4, xs = Array.from({ length: 6001 }, (_, i) => i * 0.012 / 6000);
    const R = xs.map(x => pelicula({ n1: 1.5, n2: 1, n3: 1.5, d: x * Math.tan(alfa), lambda }).R), mins = extremos(xs, R, 'min');
    const paso = (mins[mins.length - 1].x - mins[0].x) / (mins.length - 1);
    expect(rel(paso, interfranjaCuna({ lambda, alfa }))).toBeLessThan(1e-4);
  });
  it('anillos de Newton: el m-ésimo anillo oscuro está en √(mλR/n)', () => {
    for (const nHueco of [1, 1.33]) {
      const p = { R: 1, lambda: 589e-9, nHueco }, rs = Array.from({ length: 30001 }, (_, i) => i * 3e-3 / 30000);
      const mins = extremos(rs, rs.map(r => reflectanciaNewton(p, r)), 'min');
      for (let m = 1; m <= 6; m++) expect(rel(mins[m - 1].x, radioAnilloOscuro({ m, lambda: 589e-9, R: 1, n: nHueco }))).toBeLessThan(1e-4);
      expect(reflectanciaNewton(p, 0)).toBeLessThan(1e-20);
    }
    expect(huecoNewton(1, 1e-3)).toBeCloseTo(5e-7, 12);
  });
});

describe('interferómetro de Michelson', () => {
  it('al mover un espejo Δd pasan 2Δd/λ franjas por el centro', () => {
    const lambda = 632.8e-9, dd = 25.25 * lambda / 2;
    const s = serieMichelson({ lambda, d0: 0, v: dd / 2, duracion: 2 }, 20000);
    expect(s.cuenta[s.cuenta.length - 1]).toBe(Math.floor(franjasMichelson(dd, lambda)));
    expect(intensidadDosHaces(0, lambda)).toBe(1);
    expect(intensidadDosHaces(lambda / 2, lambda)).toBeCloseTo(0, 30);
  });
  it('una lámina de grosor t añade 2(n − 1)t; girada φ, la cuenta de franjas devuelve n exacto', () => {
    const l = { n: 1.5, espesor: 1e-3 };
    expect(caminoMichelson({ d: 0, lamina: l })).toBeCloseTo(2 * 0.5 * 1e-3, 16);
    expect(caminoLamina(l, 0)).toBeCloseTo(0.5e-3, 16);
    const lambda = 632.8e-9, phi = 10 * GR;
    const N = 2 * (caminoLamina(l, phi) - caminoLamina(l, 0)) / lambda;
    expect(indiceDesdeGiro({ N, lambda, espesor: 1e-3, phi })).toBeCloseTo(1.5, 12);
    expect(indiceDesdeLamina({ N: 2 * 0.5 * 1e-3 / lambda, lambda, espesor: 1e-3 })).toBeCloseTo(1.5, 12);
  });
  it('anillos: brillo en el centro con Δ = mλ; el primer anillo oscuro donde 2d·cos θ = (m − ½)λ', () => {
    const lambda = 600e-9, d = 100 * lambda / 2, f = 0.2;
    expect(anilloMichelson({ d, lambda, f }, 0)).toBeCloseTo(1, 12);
    const theta = Math.acos(99.5 * lambda / (2 * d)), rho = f * Math.tan(theta);
    expect(anilloMichelson({ d, lambda, f }, rho)).toBeLessThan(1e-20);
  });
});

describe('MEXT: refracción (O1)', () => {
  it('2023 1-(5): el rayo se acerca a la normal en 2 y se aleja en 3 → n₂ > n₁ > n₃ (e)', () => {
    const capa = (y, n) => ({ tipo: 'medio', forma: { tipo: 'rectangulo', centro: [0, y], ancho: 1, alto: 0.02 }, n });
    const res = trazar({ elementos: [capa(0.02, 1.4), capa(0, 1.7), capa(-0.02, 1.2), { tipo: 'rayo', origen: [-0.03, 0.025], giro: -35 * GR }], opciones: sinOpts });
    const [a, b] = res.interacciones;
    const t1 = a.theta1, t2 = a.theta2, t3 = b.theta2;
    expect(t2).toBeLessThan(t1); expect(t3).toBeGreaterThan(t1);
    expect(a.n2).toBeGreaterThan(a.n1); expect(b.n2).toBeLessThan(a.n1);
    expect(1.4 * Math.sin(t1)).toBeCloseTo(1.2 * Math.sin(t3), 13);
  });
  it('2017 1-(5): visto desde el mismo ángulo, el recipiente lleno deja ver la moneda a x del borde: n = d/(d − x)·√((h² + (d − x)²)/(h² + d²)) (d)', () => {
    const h = 0.1, ancho = 0.1, delta = 1e-3, n = 1.33, d = ancho - delta;
    const theta = Math.atan2(h, d), dirOjo = [Math.cos(theta), -Math.sin(theta)], entrada = [-ancho / 2 + delta, h];
    const res = trazar({ elementos: [{ tipo: 'recipiente', centro: [0, 0], ancho, nivel: h, alto: h, n }, rayoHacia(entrada, dirOjo, 0.1)], opciones: sinOpts });
    const fin = res.caminos[0];
    expect(fin.termina.rol).toBe('bloqueador');
    const llega = res.segmentos[res.segmentos.length - 1].b;
    expect(llega[1]).toBeCloseTo(0, 12);
    const x = ancho / 2 - llega[0];
    expect(n).toBeCloseTo(d / (d - x) * Math.sqrt((h * h + (d - x) ** 2) / (h * h + d * d)), 12);
    // Con el recipiente vacío se ve el borde lejano (x = 0)
    const vacio = trazar({ elementos: [{ tipo: 'recipiente', centro: [0, 0], ancho, nivel: h, alto: h, n: 1 }, rayoHacia(entrada, dirOjo, 0.1)], opciones: sinOpts });
    expect(vacio.segmentos[vacio.segmentos.length - 1].b[0]).toBeCloseTo(ancho / 2, 12);
  });
  it('2016 P5: sen φ = sen θ/n₁ (c), reflexión total si cos φ > n₂/n₁ (e) y el tiempo de A a B es L·n₁/(c·cos φ) (a)', () => {
    const L = 0.2, n1 = 1.5, theta = 30 * GR;
    const escena = n2 => ({
      elementos: [
        { tipo: 'medio', forma: { tipo: 'rectangulo', centro: [0, 0.0075], ancho: L, alto: 0.005 }, n: n2 },
        { tipo: 'medio', forma: { tipo: 'rectangulo', centro: [0, -0.0075], ancho: L, alto: 0.005 }, n: n2 },
        { tipo: 'medio', forma: { tipo: 'rectangulo', centro: [0, 0], ancho: L, alto: 0.01 }, n: n1 },
        rayoHacia([L / 2, 0.001], [-Math.cos(theta), -Math.sin(theta)], 0.05),
      ], opciones: sinOpts,
    });
    const res = trazar(escena(1.40)), A = res.interacciones[0], phi = A.theta2;
    expect(Math.sin(phi)).toBeCloseTo(Math.sin(theta) / n1, 14);
    expect(Math.cos(phi)).toBeGreaterThan(1.40 / n1);
    const choques = res.interacciones.slice(1, -1);
    expect(choques.length).toBeGreaterThan(5);
    for (const c of choques) expect(c.tipo).toBe('total');
    // Tiempo dentro del núcleo, de A (cara derecha) a B (cara izquierda)
    let t = 0;
    for (const s of res.segmentos) if (Math.abs(s.n - n1) < 1e-12) t += n1 * Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) / C_LUZ;
    expect(rel(t, L * n1 / (C_LUZ * Math.cos(phi)))).toBeLessThan(1e-12);
    // Con n₂ = 1.45 ya no se cumple cos φ > n₂/n₁: la luz se escapa al revestimiento
    const fuga = trazar(escena(1.45));
    expect(Math.cos(phi)).toBeLessThan(1.45 / n1);
    expect(fuga.interacciones[1].tipo).toBe('refraccion');
  });
  it('2015 1-(5): el rayo se aleja de la normal al pasar de n₁ a n₂ solo si n₁ > n₂ (a)', () => {
    for (const [n1, n2] of [[1.6, 1.3], [1.3, 1.6]]) {
      const res = trazar({ elementos: [{ tipo: 'medio', forma: { tipo: 'rectangulo', centro: [0, 0.05], ancho: 1, alto: 0.1 }, n: n1 },
        { tipo: 'medio', forma: { tipo: 'rectangulo', centro: [0, -0.05], ancho: 1, alto: 0.1 }, n: n2 }, { tipo: 'rayo', origen: [-0.02, 0.05], giro: -70 * GR }], opciones: sinOpts });
      const i = res.interacciones[0];
      expect(i.theta2 > i.theta1).toBe(n1 > n2);
    }
  });
  it('2014 1-(5): en la gota, sen φ = h/(n·r) (f)', () => {
    const r = 0.01, n = 1.333;
    for (const h of [0.002, 0.006, 0.009]) {
      const res = trazar({ elementos: [{ tipo: 'medio', forma: { tipo: 'circulo', centro: [0, 0], radio: r }, n }, { tipo: 'rayo', origen: [-0.05, h], giro: 0 }], opciones: sinOpts });
      expect(Math.sin(res.interacciones[0].theta2)).toBeCloseTo(h / (n * r), 13);
    }
  });
  it('2012 1-(4): hay reflexión total en B si y solo si sen θ < √(n₂² − n₁²) (d)', () => {
    const n1 = 1.3, n2 = 1.5, umbral = Math.asin(Math.sqrt(n2 * n2 - n1 * n1));
    for (const tg of [30, 40, 48, 49, 60, 70]) {
      const t = tg * GR, d = [Math.cos(t), -Math.sin(t)];
      const res = trazar({ elementos: [
        { tipo: 'medio', forma: { tipo: 'rectangulo', centro: [0.05, -0.05], ancho: 0.3, alto: 0.1 }, n: n1 },
        { tipo: 'medio', forma: { tipo: 'rectangulo', centro: [0.05, 0.01], ancho: 0.1, alto: 0.02 }, n: n2 },
        rayoHacia([0, 0.015], d, 0.05)], opciones: sinOpts });
      const B = res.interacciones[1];
      expect(B.p[1]).toBeCloseTo(0, 12);
      expect(B.tipo === 'total').toBe(t < umbral);
    }
  });
  it('2009 1-(5): espejo en el fondo de 10 cm de líquido; la imagen a 14 cm da n = 20/14 ≈ 1.43 (c)', () => {
    const n = 20 / 14;
    const res = trazar({ elementos: [
      { tipo: 'medio', forma: { tipo: 'rectangulo', centro: [0, -0.05], ancho: 1, alto: 0.1 }, n },
      { tipo: 'espejo', centro: [0, -0.1], giro: Math.PI / 2, largo: 1 },
      { tipo: 'puntual', origen: [0, -1e-7], giro: -Math.PI / 2, abertura: 1 * GR, rayos: 101 },
      { tipo: 'ojo', centro: [0, 0.3], giro: -Math.PI / 2, largo: 0.004 }], opciones: sinOpts });
    const vista = imagenesTrazadas(res).find(i => i.ojo === 3 && i.firma.includes('R'));
    expect(vista.real).toBe(false);
    expect(rel(-vista.p[1], 0.14)).toBeLessThan(1e-4);
    const opciones = [0.63, 0.80, 1.43, 1.60];
    expect(opciones.reduce((b, x) => (Math.abs(x - n) < Math.abs(b - n) ? x : b))).toBe(1.43);
  });
});

describe('MEXT: interferencia (O2), películas (O3), Michelson (O4), prisma y red (O5)', () => {
  it('2023 P5: L₂ − L₁ ≈ dx/R (a); interfranja Rλ/d (e); en un medio Rλ/(nd) (c); con los datos, λ = 5.0 × 10⁻⁷ m (b)', () => {
    const d = 1.0e-4, R = 2.4, n = 1.2;
    for (const x of [1e-3, 5e-3, 2e-2]) expect(rel(diferenciaCaminos({ y1: d / 2, y2: -d / 2, L: R, Y: x }).delta, d * x / R)).toBeLessThan(1e-4);
    const lambda = 1.0e-2 * n * d / R;
    expect(lambda).toBeCloseTo(5.0e-7, 20);
    const pat = patronRendijas({ lambda, L: R, n, rendijas: rendijasRegulares({ N: 2, d }) }, { y0: -0.05, y1: 0.05, puntos: 8001 });
    const max = extremos(pat.y, pat.I, 'max');
    expect(rel((max[max.length - 1].x - max[0].x) / (max.length - 1), 1.0e-2)).toBeLessThan(1e-3);
    expect(interfranja(lambda, R, d)).toBeCloseTo(1.2e-2, 15);
  });
  it('2018 1-(4): la tercera franja oscura está a 5Lλ/(2d) del centro (f)', () => {
    const lambda = 600e-9, L = 1.5, d = 0.3e-3;
    const pat = patronRendijas({ lambda, L, rendijas: rendijasRegulares({ N: 2, d }) }, { y0: 0, y1: 0.012, puntos: 6001 });
    const mins = extremos(pat.y, pat.I, 'min');
    expect(rel(mins[2].x, 5 * L * lambda / (2 * d))).toBeLessThan(1e-3);
  });
  it('2027 P5: T = λ/v; en un punto brillante, BB′ = mλ y la cresta C está a nλ de B′: t′ = t + nT', () => {
    const lambda = 0.02, v = 340, T = lambda / v, dAB = 0.1, Lp = 2, p = { lambda, L: Lp, rendijas: [{ y: dAB / 2, a: 0 }, { y: -dAB / 2, a: 0 }] };
    // P: punto de la pantalla donde BP − AP = 2λ (bisección)
    const m = 2, delta = Y => diferenciaCaminos({ y1: dAB / 2, y2: -dAB / 2, L: Lp, Y }).delta - m * lambda;
    let lo = 0, hi = 2;
    for (let i = 0; i < 200; i++) { const c = (lo + hi) / 2; if (delta(c) < 0) lo = c; else hi = c; }
    const { r1: AP } = diferenciaCaminos({ y1: dAB / 2, y2: -dAB / 2, L: Lp, Y: lo });
    // Allí los fasores de A y B están en fase: la intensidad es la máxima posible (|A| + |B|)²
    const f = fasoresEn(p, lo), [fa, fb] = f.fasores, dfase = Math.atan2(fa.im * fb.re - fa.re * fb.im, fa.re * fb.re + fa.im * fb.im);
    expect(Math.abs(dfase)).toBeLessThan(1e-9);
    expect(rel(f.I, (Math.hypot(fa.re, fa.im) + Math.hypot(fb.re, fb.im)) ** 2)).toBeLessThan(1e-12);
    // Y un máximo del patrón cae a menos de 1 % de la interfranja de P
    const pat = patronRendijas(p, { y0: 0.05, y1: 1.5, puntos: 6001 }), max = extremos(pat.y, pat.I, 'max');
    expect(max.some(x => Math.abs(x.x - lo) < 0.02 * interfranja(lambda, Lp, dAB))).toBe(true);
    const t = AP / v;
    for (let k = 1; k <= m; k++) expect((AP + k * lambda) / v).toBeCloseTo(t + k * T, 15);
  });
  it('2019 P5: λ/n en la película (b); sen θ = n sen φ (d); QB + BC = (m + ½)λ/n (a) y d = (2m + 1)λ/(4n cos φ) (b)', () => {
    const n = 1.33, lambda = 600e-9, theta = 30 * GR, phi = snell(1, n, theta);
    expect(Math.sin(theta)).toBeCloseTo(n * Math.sin(phi), 15);
    const res = trazar({ elementos: [{ tipo: 'medio', forma: { tipo: 'lamina', centro: [0, -0.5e-3], ancho: 0.1, alto: 1e-3 }, n }, rayoHacia([0, 0], [Math.sin(theta), -Math.cos(theta)], 0.01, lambda)], opciones: sinOpts });
    expect(res.segmentos[1].n).toBe(n);
    const ds = Array.from({ length: 3001 }, (_, i) => i * 1e-6 / 3000);
    const max = extremos(ds, ds.map(d => pelicula({ n1: 1, n2: n, n3: 1, d, lambda, theta1: theta }).R), 'max');
    for (let m = 0; m < 3; m++) {
      const d = (2 * m + 1) * lambda / (4 * n * Math.cos(phi));
      expect(Math.abs(max[m].x - d)).toBeLessThan(1e-11);
      // QB + BC = 2d·cos φ = (m + ½)·λ/n
      expect(2 * d * Math.cos(phi)).toBeCloseTo((m + 0.5) * lambda / n, 18);
    }
  });
  it('2013 1-(5): película en el aire con incidencia normal: refuerzo si 2dn = (m + ½)λ (b)', () => {
    const n = 1.5, lambda = 500e-9;
    for (const m of [0, 1, 2]) {
      const d = (m + 0.5) * lambda / (2 * n), R = x => pelicula({ n1: 1, n2: n, n3: 1, d: x, lambda }).R;
      expect(R(d)).toBeGreaterThan(R(d * 0.99)); expect(R(d)).toBeGreaterThan(R(d * 1.01));
      expect(R(m * lambda / (2 * n) + 1e-15)).toBeLessThan(1e-6);
    }
  });
  it('2025 T8 (reconstrucción): al girar 10° una lámina de 1 mm en un brazo pasan N franjas; de N sale n ≈ 1.5', () => {
    const lambda = 632.8e-9, l = { n: 1.5, espesor: 1e-3, giro: 0 }, phi = 10 * GR;
    const s = serieMichelson({ lambda, d0: 0, lamina: l, omega: phi / 4, giroMax: phi, duracion: 4 }, 40000);
    const N = s.cuenta[s.cuenta.length - 1], exacto = 2 * (caminoLamina(l, phi) - caminoLamina(l, 0)) / lambda;
    expect(N).toBe(Math.floor(exacto));
    expect(Math.abs(indiceDesdeGiro({ N, lambda, espesor: 1e-3, phi }) - 1.5)).toBeLessThan(0.01);
    expect(michelsonEn({ lambda, d0: 0, lamina: l, omega: phi / 4, giroMax: phi, duracion: 4 }, 10).lamina.giro).toBeCloseTo(phi, 15);
  });
  it('2010 3-C: el prisma desvía más el violeta (a violeta, b rojo) y la red desvía más el rojo (c rojo, d violeta) → (d)', () => {
    const A = 60 * GR, n = l => indiceDe({ material: 'crown' }, l);
    expect(desviacionPrisma(A, n(400e-9), 50 * GR)).toBeGreaterThan(desviacionPrisma(A, n(700e-9), 50 * GR));
    const d = 1e-3 / 500, th = l => maximosRed(l, d).find(x => x.m === 1).theta;
    expect(th(700e-9)).toBeGreaterThan(th(400e-9));
  });
});

describe('determinismo', () => {
  it('la misma escena da exactamente el mismo resultado', () => {
    const escena = () => ({
      elementos: [{ tipo: 'medio', forma: { tipo: 'prisma', centro: [0, 0], lado: 0.05, angulo: 60 * GR }, material: 'flint' },
        { tipo: 'puntual', origen: [-0.08, 0.005], giro: 0.1, abertura: 0.3, rayos: 15, lambda: null },
        { tipo: 'pantalla', centro: [0.1, -0.03], giro: Math.PI, largo: 0.1 }],
    });
    const a = trazar(escena()), b = trazar(escena());
    expect(a.segmentos).toEqual(b.segmentos);
    expect(a.interacciones).toEqual(b.interacciones);
    expect(a.impactos).toEqual(b.impactos);
    expect(imagenesTrazadas(a)).toEqual(imagenesTrazadas(b));
    const p = { lambda: 550e-9, L: 1, rendijas: rendijasRegulares({ N: 4, d: 50e-6, a: 10e-6 }) };
    expect(patronRendijas(p, { y0: -0.02, y1: 0.02, puntos: 500 }).I).toEqual(patronRendijas(p, { y0: -0.02, y1: 0.02, puntos: 500 }).I);
    void caminoOptico;
  });
});

describe('espejo parabólico', () => {
  // Rayos paralelos al eje, a h del eje, contra un espejo de R = 20 cm y 12 cm de apertura
  const reflejados = forma => {
    const espejo = { tipo: 'espejo', espejo: forma, centro: [0, 0], giro: Math.PI, R: 0.2, apertura: 0.12 };
    const res = trazar({ elementos: [espejo, { tipo: 'haz', origen: [-0.3, 0], giro: 0, ancho: 0.11, rayos: 11 }] });
    // Segmentos que salen del espejo (empiezan cerca de x = 0)
    return res.segmentos.filter(s => s.nivel === 1);
  };
  /** Distancia del foco F = (−R/2, 0) a la recta de cada rayo reflejado */
  const distFoco = s => { const d = [s.b[0] - s.a[0], s.b[1] - s.a[1]], L = Math.hypot(d[0], d[1]), F = [-0.1, 0]; return Math.abs((F[0] - s.a[0]) * d[1] - (F[1] - s.a[1]) * d[0]) / L; };
  it('todos los rayos paralelos al eje pasan exactamente por el foco f = R/2', () => {
    const segs = reflejados('parabolico');
    expect(segs).toHaveLength(11);
    for (const s of segs) expect(distFoco(s)).toBeLessThan(1e-12);
  });
  it('el esférico de la misma apertura no: los rayos del borde cortan el eje antes del foco (aberración esférica)', () => {
    const peor = Math.max(...reflejados('esferico').map(distFoco));
    expect(peor).toBeGreaterThan(1e-4);
  });
  it('por detrás no refleja; un convexo (R < 0) abre el haz como si saliera de su foco virtual', () => {
    const espejo = { tipo: 'espejo', espejo: 'parabolico', centro: [0, 0], giro: Math.PI, R: -0.2, apertura: 0.12 };
    const res = trazar({ elementos: [espejo, { tipo: 'haz', origen: [-0.3, 0], giro: 0, ancho: 0.1, rayos: 5 }] });
    // Prolongados hacia atrás, los reflejados pasan por F' = (+0.1, 0)
    for (const s of res.segmentos.filter(x => x.nivel === 1)) {
      const d = [s.b[0] - s.a[0], s.b[1] - s.a[1]], L = Math.hypot(d[0], d[1]);
      expect(Math.abs((0.1 - s.a[0]) * d[1] - (0 - s.a[1]) * d[0]) / L).toBeLessThan(1e-12);
    }
    const dorso = trazar({ elementos: [{ ...espejo, R: 0.2 }, { tipo: 'haz', origen: [0.3, 0], giro: Math.PI, ancho: 0.1, rayos: 5 }] });
    expect(dorso.segmentos.filter(x => x.nivel === 1)).toHaveLength(0);
  });
});
