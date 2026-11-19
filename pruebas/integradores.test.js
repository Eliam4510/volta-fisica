// Exactitud de los integradores del núcleo: orden de convergencia, soluciones
// exactas, conservación, eventos y salida densa.
import { describe, it, expect } from 'vitest';
import {
  integrar, integrarRK4, integrarVerlet, interpolar, derivadaInterpolada,
  pasoRK4, pasoVerlet, pasoDormandPrince, brent, gaussLegendre,
} from '../sistema/nucleo/integradores.js';

const cerca = (a, b, tol) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
// Orden observado entre dos errores con pasos h y h/2
const orden = (e1, e2) => Math.log2(e1 / e2);

// y' = y·cos t, y(0) = 1 → y = e^(sen t): no lineal en t y no autónoma
const fSen = (t, y) => [y[0] * Math.cos(t)];
const exSen = t => Math.exp(Math.sin(t));
// Oscilador armónico x'' = −x: y = [x, v], x = cos t, v = −sen t
const osc = (t, y) => [y[1], -y[0]];
const energiaOsc = y => 0.5 * (y[0] * y[0] + y[1] * y[1]);

describe('Dormand–Prince 5(4)', () => {
  it('con paso fijo converge con orden 5', () => {
    const errores = [10, 20, 40, 80].map(N => {
      const s = integrar(fSen, 0, [1], 2, { pasoFijo: 2 / N });
      expect(s.t.length).toBe(N + 1);
      return Math.abs(s.y[N][0] - exSen(2));
    });
    for (let i = 1; i < errores.length; i++) {
      expect(orden(errores[i - 1], errores[i])).toBeGreaterThan(4.8);
      expect(orden(errores[i - 1], errores[i])).toBeLessThan(5.6);
    }
  });

  it('la salida densa entre nodos converge con orden ≥ 4', () => {
    const errores = [10, 20, 40, 80].map(N => {
      const s = integrar(fSen, 0, [1], 2, { pasoFijo: 2 / N });
      let peor = 0;
      for (let i = 0; i < N; i++) for (const u of [0.25, 0.5, 0.75]) {
        const t = s.t[i] + u * (s.t[i + 1] - s.t[i]);
        peor = Math.max(peor, Math.abs(interpolar(s, t)[0] - exSen(t)));
      }
      return peor;
    });
    for (let i = 1; i < errores.length; i++) expect(orden(errores[i - 1], errores[i])).toBeGreaterThan(3.9);
  });

  it('el error global sigue a la tolerancia (proporcionalidad)', () => {
    const tols = [1e-4, 1e-6, 1e-8, 1e-10, 1e-12];
    const errores = tols.map(tol => {
      const s = integrar(fSen, 0, [1], 10, { rtol: tol, atol: tol });
      expect(s.estado).toBe('completo');
      expect(s.t[s.t.length - 1]).toBe(10);
      return Math.max(...s.t.map((t, i) => Math.abs(s.y[i][0] - exSen(t))));
    });
    errores.forEach((e, i) => expect(e).toBeLessThan(10 * tols[i]));
    for (let i = 1; i < errores.length; i++) {
      // Al bajar la tolerancia 100 veces, el error baja entre 40 y 250 veces
      const pendiente = Math.log10(errores[i - 1] / errores[i]) / 2;
      expect(pendiente).toBeGreaterThan(0.8);
      expect(pendiente).toBeLessThan(1.2);
    }
  });

  it("un paso sobre y' = λy da su polinomio de estabilidad Σ zᵏ/k! (k ≤ 5) + z⁶/600", () => {
    for (const z of [-0.1, -0.5, 0.3]) {
      const s = integrar((t, y) => [z * y[0]], 0, [1], 1, { pasoFijo: 1 });
      const R = 1 + z + z ** 2 / 2 + z ** 3 / 6 + z ** 4 / 24 + z ** 5 / 120 + z ** 6 / 600;
      cerca(s.y[1][0], R, 4e-16);
    }
  });

  it('el estimador de error local es de orden 5 en h (el del método de orden 4)', () => {
    const k1 = fSen(0.3, [exSen(0.3)]);
    const errLocal = h => Math.abs(pasoDormandPrince(fSen, 0.3, [exSen(0.3)], k1, h).err[0]);
    expect(orden(errLocal(0.2), errLocal(0.1))).toBeGreaterThan(4.6);
    expect(orden(errLocal(0.1), errLocal(0.05))).toBeGreaterThan(4.8);
  });

  it("decaimiento exponencial y' = −y: error relativo < 1e-10 en nodos y salida densa", () => {
    const s = integrar((t, y) => [-y[0]], 0, [1], 20, { rtol: 1e-12, atol: 0 });
    expect(s.estado).toBe('completo');
    for (let i = 0; i < s.t.length; i++) expect(Math.abs(s.y[i][0] / Math.exp(-s.t[i]) - 1)).toBeLessThan(1e-10);
    for (let k = 0; k <= 2000; k++) {
      const t = 20 * k / 2000;
      expect(Math.abs(interpolar(s, t)[0] / Math.exp(-t) - 1)).toBeLessThan(1e-10);
    }
  });

  it('oscilador armónico: energía y fase tras 100 periodos', () => {
    const tFin = 200 * Math.PI;
    const s = integrar(osc, 0, [1, 0], tFin, { rtol: 1e-12, atol: 1e-12 });
    let deriva = 0;
    for (const y of s.y) deriva = Math.max(deriva, Math.abs(energiaOsc(y) / 0.5 - 1));
    expect(deriva).toBeLessThan(1e-9);
    const [x, v] = s.y[s.y.length - 1];
    expect(Math.abs(Math.atan2(-v, x))).toBeLessThan(1e-9);       // fase
    cerca(Math.hypot(x, v), 1, 1e-9);                             // amplitud
  });

  it('respeta hMax y cuenta pasos y evaluaciones', () => {
    const s = integrar(osc, 0, [1, 0], 3, { rtol: 1e-6, hMax: 0.01 });
    for (let i = 1; i < s.t.length; i++) expect(s.t[i] - s.t[i - 1]).toBeLessThanOrEqual(0.01 + 1e-15);
    expect(s.pasosAceptados).toBe(s.t.length - 1);
    expect(s.evaluaciones).toBeGreaterThanOrEqual(6 * (s.pasosAceptados + s.pasosRechazados));
  });

  it("se detiene sin colgarse ante una explosión (y' = y², y → ∞ en t = 1)", () => {
    const s = integrar((t, y) => [y[0] * y[0]], 0, [1], 2, { rtol: 1e-8, maxPasos: 5000 });
    expect(['pasoMinimo', 'maxPasos']).toContain(s.estado);
    // El polo numérico está desplazado por el error global (~rtol), no más
    const tf = s.t[s.t.length - 1];
    expect(Math.abs(tf - 1)).toBeLessThan(1e-6);
    expect(s.y[s.y.length - 1][0]).toBeGreaterThan(1e8);
  });

  it('tFin = t0 devuelve solo el estado inicial; tFin < t0 es un error', () => {
    const s = integrar(osc, 1, [1, 0], 1);
    expect(s.t).toEqual([1]);
    expect(interpolar(s, 5)).toEqual([1, 0]);
    expect(() => integrar(osc, 1, [1, 0], 0)).toThrow(RangeError);
  });
});

describe('RK4 clásico', () => {
  it('converge con orden 4', () => {
    const errores = [10, 20, 40, 80].map(N => Math.abs(integrarRK4(fSen, 0, [1], 2, { pasos: N }).y[N][0] - exSen(2)));
    for (let i = 1; i < errores.length; i++) {
      expect(orden(errores[i - 1], errores[i])).toBeGreaterThan(3.9);
      expect(orden(errores[i - 1], errores[i])).toBeLessThan(4.2);
    }
  });

  it("un paso sobre y' = −y es el polinomio de Taylor de e^(−h) de grado 4", () => {
    for (const h of [0.1, 0.4]) {
      const z = -h, y1 = pasoRK4((t, y) => [-y[0]], 0, [1], h)[0];
      cerca(y1, 1 + z + z * z / 2 + z ** 3 / 6 + z ** 4 / 24, 2e-16);
    }
  });

  it('con h (en vez de pasos) cae justo en tFin', () => {
    const s = integrarRK4(osc, 0, [1, 0], 1, { h: 0.3 });
    expect(s.t.length).toBe(5);
    expect(s.t[s.t.length - 1]).toBe(1);
    cerca(s.t[1], 0.25, 1e-15);
  });
});

describe('Verlet de velocidad', () => {
  const acel = (t, x) => [-x[0]];

  it('converge con orden 2', () => {
    const errores = [20, 40, 80, 160].map(N => {
      const y = integrarVerlet(acel, 0, [1], [0], 2, { pasos: N }).y[N];
      return Math.hypot(y[0] - Math.cos(2), y[1] + Math.sin(2));
    });
    for (let i = 1; i < errores.length; i++) {
      expect(orden(errores[i - 1], errores[i])).toBeGreaterThan(1.95);
      expect(orden(errores[i - 1], errores[i])).toBeLessThan(2.05);
    }
  });

  it('la deriva de energía queda acotada en 10⁴ periodos (RK4 con el mismo paso disipa)', () => {
    const T = 2 * Math.PI, h = T / 40, porPeriodo = 40, periodos = 10000;
    let x = [1], v = [0], a = acel(0, x), yRK = [1, 0];
    let peorInicio = 0, peorFinal = 0;
    for (let p = 0; p < periodos; p++) {
      for (let k = 0; k < porPeriodo; k++) {
        ({ x, v, a } = pasoVerlet(acel, 0, x, v, a, h));
        const e = Math.abs(energiaOsc([x[0], v[0]]) / 0.5 - 1);
        if (p < 1000) peorInicio = Math.max(peorInicio, e);
        if (p >= periodos - 1000) peorFinal = Math.max(peorFinal, e);
        yRK = pasoRK4(osc, 0, yRK, h);
      }
    }
    // Verlet: el error oscila con amplitud ~(ωh)²/4 y no crece
    expect(peorInicio).toBeLessThan((h * h) / 4 * 1.05);
    expect(peorFinal).toBeLessThan(peorInicio * 1.01);
    // RK4 no es simpléctico: tras 10⁴ periodos perdió energía de forma secular
    expect(energiaOsc(yRK) / 0.5 - 1).toBeLessThan(-1e-4);
  });

  it('es reversible en el tiempo: ida y vuelta devuelve el estado inicial', () => {
    const acelNoLineal = (t, x) => [-Math.sin(x[0])];          // péndulo
    let x = [1.2], v = [0.3], a = acelNoLineal(0, x);
    for (let k = 0; k < 1000; k++) ({ x, v, a } = pasoVerlet(acelNoLineal, 0, x, v, a, 0.05));
    for (let k = 0; k < 1000; k++) ({ x, v, a } = pasoVerlet(acelNoLineal, 0, x, v, a, -0.05));
    cerca(x[0], 1.2, 1e-11);
    cerca(v[0], 0.3, 1e-11);
  });
});

describe('localización de eventos (Brent sobre la salida densa)', () => {
  it('cos t cruza el cero en π/2 con error < 1e-10', () => {
    const s = integrar(osc, 0, [1, 0], 3, { rtol: 1e-12, atol: 1e-12, eventos: [{ g: (t, y) => y[0], nombre: 'x = 0' }] });
    expect(s.eventos).toHaveLength(1);
    const e = s.eventos[0];
    expect(Math.abs(e.t - Math.PI / 2)).toBeLessThan(1e-10);
    expect(e.direccion).toBe(-1);
    expect(e.nombre).toBe('x = 0');
    cerca(e.y[0], 0, 1e-11);
    cerca(e.y[1], -1, 1e-11);
  });

  it('encuentra todos los cruces de 10 periodos, en orden y con su sentido', () => {
    const s = integrar(osc, 0, [1, 0], 20 * Math.PI, { rtol: 1e-12, atol: 1e-12, eventos: [(t, y) => y[0]] });
    expect(s.eventos).toHaveLength(20);
    s.eventos.forEach((e, k) => {
      expect(Math.abs(e.t - (2 * k + 1) * Math.PI / 2)).toBeLessThan(1e-10);
      expect(e.direccion).toBe(k % 2 ? 1 : -1);
    });
  });

  it('filtra por dirección de cruce', () => {
    const s = integrar(osc, 0, [1, 0], 4 * Math.PI, { rtol: 1e-12, atol: 1e-12, eventos: [{ g: (t, y) => y[0], direccion: 1 }] });
    expect(s.eventos.map(e => e.t / Math.PI)).toHaveLength(2);
    expect(Math.abs(s.eventos[0].t - 1.5 * Math.PI)).toBeLessThan(1e-10);
    expect(Math.abs(s.eventos[1].t - 3.5 * Math.PI)).toBeLessThan(1e-10);
  });

  it('un evento terminal detiene la integración en su instante', () => {
    const s = integrar(osc, 0, [1, 0], 10, { rtol: 1e-12, atol: 1e-12, eventos: [{ g: (t, y) => y[0], terminal: true }, (t, y) => y[0] + 0.5] });
    expect(s.estado).toBe('evento');
    const tf = s.t[s.t.length - 1];
    expect(Math.abs(tf - Math.PI / 2)).toBeLessThan(1e-10);
    expect(s.eventos).toHaveLength(1);                            // el de x = −0.5 llegaría después
    expect(interpolar(s, 9)).toEqual(s.y[s.y.length - 1]);        // más allá del final, se queda
  });

  it('un cero en el instante inicial no es un evento', () => {
    const s = integrar(osc, 0, [1, 0], 4, { rtol: 1e-12, atol: 1e-12, eventos: [(t, y) => y[1]] });   // v = −sen t
    expect(s.eventos).toHaveLength(1);
    expect(Math.abs(s.eventos[0].t - Math.PI)).toBeLessThan(1e-10);
  });

  it('también funciona con RK4 y Verlet (salida densa de Hermite)', () => {
    const r = integrarRK4(osc, 0, [1, 0], 3, { h: 0.01, eventos: [(t, y) => y[0]] });
    expect(Math.abs(r.eventos[0].t - Math.PI / 2)).toBeLessThan(1e-9);
    const v = integrarVerlet((t, x) => [-x[0]], 0, [1], [0], 3, { h: 0.001, eventos: [{ g: (t, y) => y[0], terminal: true }] });
    expect(v.estado).toBe('evento');
    expect(Math.abs(v.eventos[0].t - Math.PI / 2)).toBeLessThan(1e-6);   // Verlet es de orden 2
  });
});

describe('salida densa', () => {
  const s = integrar(osc, 0, [1, 0], 6, { rtol: 1e-11, atol: 1e-11 });

  it('coincide con la solución exacta en cualquier instante', () => {
    let peor = 0;
    for (let k = 0; k <= 3000; k++) {
      const t = 6 * ((k * 0.6180339887498949) % 1);               // instantes repartidos sin coincidir con nodos
      const y = interpolar(s, t);
      peor = Math.max(peor, Math.abs(y[0] - Math.cos(t)), Math.abs(y[1] + Math.sin(t)));
    }
    expect(peor).toBeLessThan(1e-9);
  });

  it('es continua y de derivada continua en los nodos', () => {
    for (let i = 1; i < s.t.length - 1; i++) {
      const t = s.t[i], d = 1e-9 * (s.t[i + 1] - s.t[i - 1]);
      const izq = interpolar(s, t - d), der = interpolar(s, t + d);
      for (let c = 0; c < 2; c++) cerca(izq[c], der[c], 3 * d + 1e-15);
      cerca(interpolar(s, t)[0], s.y[i][0], 0);                   // en el nodo, el valor aceptado
      const dIzq = derivadaInterpolada(s, t - d), dDer = derivadaInterpolada(s, t + d);
      for (let c = 0; c < 2; c++) cerca(dIzq[c], dDer[c], 1e-7);
    }
  });

  it('su derivada en los nodos es f(t, y)', () => {
    for (let i = 0; i < s.t.length; i += 5) {
      const d = derivadaInterpolada(s, s.t[i]), f = osc(s.t[i], s.y[i]);
      cerca(d[0], f[0], 1e-14); cerca(d[1], f[1], 1e-14);
    }
  });
});

describe('método de Brent', () => {
  it('encuentra raíces con precisión de máquina y pocas evaluaciones', () => {
    let n = 0;
    const r = brent(x => { n++; return Math.cos(x); }, 1, 2, { tol: 1e-15 });
    cerca(r, Math.PI / 2, 1e-15);
    expect(n).toBeLessThan(15);                                  // la bisección necesitaría ~50
    cerca(brent(x => x ** 3 - 2, 0, 2), Math.cbrt(2), 1e-12);
  });
  it('acepta un extremo que ya es raíz y rechaza un intervalo sin cambio de signo', () => {
    expect(brent(x => x - 1, 1, 3)).toBe(1);
    expect(() => brent(x => x * x + 1, -1, 1)).toThrow(RangeError);
  });
});

describe('cuadratura de Gauss–Legendre', () => {
  it('integra exactamente los polinomios de grado ≤ 2n − 1', () => {
    for (const n of [1, 2, 5, 12]) {
      const { x, w } = gaussLegendre(n);
      for (let k = 0; k <= 2 * n - 1; k++) {
        const I = x.reduce((s, xi, i) => s + w[i] * xi ** k, 0);
        cerca(I, k % 2 ? 0 : 2 / (k + 1), 1e-14);
      }
    }
  });
  it('∫₀^π sen x dx = 2 con 10 nodos', () => {
    const { x, w } = gaussLegendre(10);
    const I = x.reduce((s, xi, i) => s + w[i] * Math.sin((xi + 1) * Math.PI / 2), 0) * Math.PI / 2;
    cerca(I, 2, 1e-14);
  });
});

describe('determinismo', () => {
  it('la misma integración da exactamente el mismo resultado', () => {
    const o = { rtol: 1e-9, eventos: [(t, y) => y[0]] };
    expect(integrar(osc, 0, [1, 0], 10, o)).toEqual(integrar(osc, 0, [1, 0], 10, o));
  });
});
