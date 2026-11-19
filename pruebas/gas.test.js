// Exactitud física del motor de gas (laboratorio de gases) contra soluciones
// analíticas de gas ideal: equilibrio, procesos isotérmico, adiabático
// (reversible e irreversible), isobárico e isocórico, conducción de calor,
// primera ley y determinismo.
import { describe, it, expect } from 'vitest';
import {
  simularGas, estadoEn, banderas, R_GAS, GRADOS_LIBERTAD,
  calorTotal, residuoGas, residuoEmbolo,
} from '../sistema/motores/gas.js';

const R = 8.314462618;
const cerca = (a, b, rel = 1e-12) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1e-300, Math.abs(b)));
const ultima = sim => sim.muestras[sim.muestras.length - 1];

// Escena de la pantalla (MEXT 2019 P4): 1 mol, émbolo de 50 kg, pesa de 150 kg,
// sección 500 cm², atmósfera 101.3 kPa, baño a 300 K.
const ESCENA = { n: 1, A: 0.05, P0: 101300, T0: 300, g: 9.8, m: 50, M: 150, Fc: 300, G: 6, b: 300 };
const { n, A, P0, T0, g, m, M } = ESCENA;
const P1 = P0 + m * g / A;                 // presión con el émbolo solo
const P2 = P0 + (m + M) * g / A;           // presión con el émbolo y la pesa
const ADIAB = { t: 0, tipo: 'paredes', valor: 'adiabaticas' };
const MODELOS = ['dinamico', 'cuasiestatico'];

describe('constantes', () => {
  it('R = 8.314462618 J/(mol·K) y gas monoatómico o diatómico', () => {
    expect(R_GAS).toBe(R);
    expect(GRADOS_LIBERTAD.mono).toBe(3);
    expect(GRADOS_LIBERTAD.di).toBe(5);
  });
});

describe('equilibrio inicial', () => {
  for (const modelo of MODELOS) {
    it(`${modelo}: P = P0 + m·g/A, P·V = n·R·T con T = T0, y el émbolo queda quieto`, () => {
      const sim = simularGas(ESCENA, [], { modelo, duracion: 5 });
      const q0 = sim.muestras[0];
      cerca(q0.P, P1);
      cerca(q0.P * q0.V, n * R * q0.T);
      cerca(q0.T, T0);
      cerca(q0.V, A * q0.h);
      cerca(q0.U, 1.5 * n * R * T0);
      expect(q0.v).toBe(0);
      // Sin acciones no pasa nada: sigue en equilibrio
      for (const q of sim.muestras) {
        cerca(q.P, P1, 1e-12);
        cerca(q.h, q0.h, 1e-12);
        cerca(q.T, T0, 1e-12);
      }
    });
  }

  it('si el equilibrio queda por encima de los topes, el émbolo arranca apoyado en ellos', () => {
    const hMax = 0.3;
    const sim = simularGas({ ...ESCENA, hMax }, [], { duracion: 1 });
    const q0 = sim.muestras[0], q = ultima(sim);
    cerca(q0.h, hMax);
    cerca(q0.P * q0.V, n * R * T0);
    expect(q0.P).toBeGreaterThan(P1);
    cerca(q.h, hMax, 0);
    expect(sim.eventos).toEqual([]);
  });
});

describe('MEXT 2019 P4-(1): pesa con paredes conductoras (isotérmico)', () => {
  // h1 = h·(P0·A + m·g)/(P0·A + (m + M)·g) a la temperatura del baño
  for (const modelo of MODELOS) {
    it(`${modelo}: altura final h1 = h·(P0·A + m·g)/(P0·A + (m+M)·g) y T = T0`, () => {
      const sim = simularGas(ESCENA, [{ t: 1, tipo: 'pesa', valor: true }], { modelo, duracion: 80 });
      const h = sim.muestras[0].h, q = ultima(sim);
      const h1 = h * (P0 * A + m * g) / (P0 * A + (m + M) * g);
      cerca(q.h, h1, 1e-9);
      cerca(q.T, T0, 1e-9);
      cerca(q.P, P2, 1e-9);
      // Proceso isotérmico entre equilibrios: ΔU = 0 y el gas cede al baño el trabajo recibido
      expect(Math.abs(q.dU)).toBeLessThan(1e-9 * q.U);
      cerca(q.Qbano + q.Edis, q.W, 1e-6);
      expect(q.W).toBeLessThan(0);
    });
  }
});

describe('pesa de golpe con paredes adiabáticas (irreversible)', () => {
  // Contra la presión exterior constante P_ext = P0 + (m+M)·g/A:
  //   n·Cv·(T2 − T1) = −P_ext·(V2 − V1),  V2 = n·R·T2/P_ext
  // ⇒ T2 = (Cv·T1 + P_ext·V1/n)/(Cv + R)
  for (const [especie, cv] of [['mono', 1.5 * R], ['di', 2.5 * R]]) {
    it(`${especie}: la temperatura final sale del balance de energía, no de la adiabática`, () => {
      const sim = simularGas({ ...ESCENA, especie }, [ADIAB, { t: 1, tipo: 'pesa', valor: true }], { duracion: 40 });
      const q1 = sim.muestras[0], q = ultima(sim);
      const T2 = (cv * q1.T + P2 * q1.V / n) / (cv + R);
      const V2 = n * R * T2 / P2;
      cerca(q.T, T2, 1e-9);
      cerca(q.V, V2, 1e-9);
      cerca(q.P, P2, 1e-9);
      cerca(n * cv * (q.T - q1.T), -P2 * (q.V - q1.V), 1e-9);
      expect(q.Qbano).toBe(0);
      expect(q.Qcal).toBe(0);
      // Más caliente que la compresión reversible hasta la misma presión
      const gam = (cv + R) / cv, Trev = q1.T * (P2 / q1.P) ** ((gam - 1) / gam);
      expect(q.T).toBeGreaterThan(Trev + 1);
      // La entropía crece: ΔS = n·Cv·ln(T2/T1) + n·R·ln(V2/V1) > 0
      expect(n * cv * Math.log(q.T / q1.T) + n * R * Math.log(q.V / q1.V)).toBeGreaterThan(0);
    });
  }
});

describe('cuasiestático adiabático: P·V^γ constante', () => {
  for (const [especie, gam] of [['mono', 5 / 3], ['di', 7 / 5]]) {
    it(`${especie} (γ = ${especie === 'mono' ? '5/3' : '7/5'}): P·V^γ se conserva al cargar y descargar la pesa`, () => {
      const sim = simularGas({ ...ESCENA, especie }, [ADIAB, { t: 1, tipo: 'pesa', valor: true }, { t: 6, tipo: 'pesa', valor: false }],
        { modelo: 'cuasiestatico', duracion: 11 });
      cerca(sim.gam, gam, 1e-15);
      const q0 = sim.muestras[0], K = q0.P * q0.V ** gam;
      for (const q of sim.muestras) cerca(q.P * q.V ** gam, K, 1e-9);
      // Con la pesa entera: P = P_ext y T = T1·(P2/P1)^((γ−1)/γ)
      const q5 = estadoEn(sim, 5.5);
      cerca(q5.P, P2, 1e-9);
      cerca(q5.T, T0 * (P2 / P1) ** ((gam - 1) / gam), 1e-9);
      // W = −ΔU (sin calor)
      cerca(q5.W, -q5.dU, 1e-9);
      expect(q5.Qcal + q5.Qbano + q5.Edis).toBe(0);
      // Reversible: al quitar la pesa vuelve al estado inicial
      const q = ultima(sim);
      cerca(q.V, q0.V, 1e-9);
      cerca(q.T, q0.T, 1e-9);
    });
  }
});

describe('calentamiento a presión constante (émbolo libre, paredes adiabáticas)', () => {
  const guion = [ADIAB, { t: 1, tipo: 'calentador', valor: true }, { t: 6, tipo: 'calentador', valor: false }];
  const Qesperado = ESCENA.Fc * 5;

  it('cuasiestático: Q = n·Cp·ΔT, W = P·ΔV, ΔU = n·Cv·ΔT y P constante', () => {
    const sim = simularGas(ESCENA, guion, { modelo: 'cuasiestatico', duracion: 8 });
    const q0 = sim.muestras[0], q = ultima(sim), dT = q.T - q0.T;
    cerca(q.Qcal, Qesperado, 1e-12);
    cerca(calorTotal(q), n * 2.5 * R * dT, 1e-9);
    cerca(q.W, P1 * (q.V - q0.V), 1e-9);
    cerca(q.dU, n * 1.5 * R * dT, 1e-9);
    for (const s of sim.muestras) cerca(s.P, P1, 1e-12);
  });

  it('dinámico: Q_cal = n·Cp·ΔT y el trabajo neto W − E_dis = P·ΔV entre equilibrios', () => {
    // Con el émbolo en movimiento la presión del gas supera a la exterior en
    // b·v/A: el gas hace W = P·ΔV + E_dis, y E_dis vuelve al gas como calor.
    const sim = simularGas(ESCENA, guion, { duracion: 15 });
    const q0 = sim.muestras[0], q = ultima(sim), dT = q.T - q0.T;
    cerca(q.Qcal, Qesperado, 1e-12);
    cerca(q.Qcal, n * 2.5 * R * dT, 1e-9);
    cerca(q.W - q.Edis, P1 * (q.V - q0.V), 1e-9);
    cerca(q.dU, n * 1.5 * R * dT, 1e-9);
    cerca(q.P, P1, 1e-9);
    expect(q.Edis).toBeGreaterThan(0);
    // Mientras sube (ya a velocidad constante), P − P_ext = b·v/A
    const s = estadoEn(sim, 5.5);
    expect(s.v).toBeGreaterThan(0);
    cerca(s.P - P1, ESCENA.b * s.v / A, 1e-4);
  });
});

describe('émbolo en los topes: calentamiento isocórico y enfriamiento de Newton', () => {
  // Topes por debajo del equilibrio: el émbolo no se mueve en toda la corrida
  const hMax = 0.3, cv = 1.5 * R;
  const guion = [ADIAB, { t: 0, tipo: 'calentador', valor: true }, { t: 2, tipo: 'calentador', valor: false },
    { t: 3, tipo: 'paredes', valor: 'conductoras' }];

  it('a volumen constante: Q = n·Cv·ΔT, W = 0 y P/T constante', () => {
    const sim = simularGas({ ...ESCENA, hMax }, guion, { duracion: 3 });
    const q0 = sim.muestras[0], q2 = estadoEn(sim, 2.5);
    cerca(q2.Qcal, ESCENA.Fc * 2, 1e-12);
    cerca(q2.Qcal, n * cv * (q2.T - q0.T), 1e-9);
    expect(q2.W).toBe(0);
    cerca(q2.V, q0.V, 0);
    cerca(q2.P / q2.T, q0.P / q0.T, 1e-12);
  });

  it('con paredes conductoras T − T0 decae como exp(−G·t/(n·Cv)), con error de primer orden en dt', () => {
    // El flujo G·(T0 − T) se integra explícito en T: el factor por paso es
    // (1 − x) con x = G·dt/(n·Cv) en lugar de e^(−x); tras N pasos el error
    // relativo de T − T0 es ≈ N·x²/2 (1.6e-4 en 7 s con dt = 0.2 ms).
    const errorCon = dt => {
      const sim = simularGas({ ...ESCENA, hMax }, guion, { duracion: 10, dt });
      const T3 = estadoEn(sim, 3).T, q = ultima(sim);
      const exacto = (T3 - T0) * Math.exp(-ESCENA.G * 7 / (n * cv));
      cerca(q.Qbano, n * cv * (q.T - T3), 1e-9);      // todo el calor del baño va a U
      return (q.T - T0) / exacto - 1;
    };
    const e1 = errorCon(2e-4), e2 = errorCon(1e-4);
    expect(Math.abs(e1)).toBeLessThan(1e-3);
    // Primer orden: con la mitad de paso, la mitad de error
    expect(e1 / e2).toBeGreaterThan(1.9);
    expect(e1 / e2).toBeLessThan(2.1);
  });
});

describe('acciones programadas y primera ley en una corrida larga', () => {
  // Guion de la pantalla con topes bajos (0.46 m): el émbolo choca con ellos al
  // calentar, se queda apoyado, los deja al enfriar y vuelve a subir al quitar la pesa.
  const GUION = [
    { t: 1, tipo: 'paredes', valor: 'adiabaticas' }, { t: 2, tipo: 'pesa', valor: true },
    { t: 8, tipo: 'calentador', valor: true }, { t: 16, tipo: 'calentador', valor: false },
    { t: 18, tipo: 'paredes', valor: 'conductoras' }, { t: 30, tipo: 'pesa', valor: false },
    { t: 34, tipo: 'calentador', valor: true }, { t: 36, tipo: 'paredes', valor: 'adiabaticas' },
    { t: 38, tipo: 'pesa', valor: true }, { t: 40, tipo: 'calentador', valor: false },
  ];

  it('banderas() da la configuración del guion en cada instante', () => {
    expect(banderas(GUION, 0)).toEqual({ pesa: false, cal: false, adiab: false });
    expect(banderas(GUION, 8)).toEqual({ pesa: true, cal: true, adiab: true });
    expect(banderas(GUION, 20)).toEqual({ pesa: true, cal: false, adiab: false });
    expect(banderas(GUION, 37)).toEqual({ pesa: false, cal: true, adiab: true });
  });

  for (const modelo of MODELOS) {
    for (const especie of ['mono', 'di']) {
      it(`${modelo}, ${especie}: Q − W − ΔU cierra con residuo relativo < 1e-9`, () => {
        const sim = simularGas({ ...ESCENA, especie, hMax: 0.46 }, GUION, { modelo, duracion: 42 });
        const nombres = sim.eventos.map(e => e.nombre);
        expect(nombres).toContain('El émbolo llega a los topes');
        expect(nombres).toContain('El émbolo deja los topes');
        expect(sim.eventos.filter(e => e.tipo !== 'topes').map(e => e.t)).toEqual(GUION.map(a => a.t));
        let escala = 0, peorGas = 0, peorEmbolo = 0;
        for (const q of sim.muestras) {
          escala = Math.max(escala, Math.abs(calorTotal(q)), Math.abs(q.W), Math.abs(q.dU));
          peorGas = Math.max(peorGas, Math.abs(residuoGas(q)));
          peorEmbolo = Math.max(peorEmbolo, Math.abs(residuoEmbolo(q)));
          cerca(q.P * q.V, n * R * q.T, 1e-12);       // ecuación de estado en cada muestra
          expect(q.h).toBeLessThanOrEqual(0.46 + 1e-12);
        }
        expect(escala).toBeGreaterThan(1000);
        expect(peorGas / escala).toBeLessThan(1e-9);
        expect(peorEmbolo / escala).toBeLessThan(1e-9);
        // Los eventos guardan el mismo balance
        for (const e of sim.eventos) expect(Math.abs(e.Q - e.W - e.dU) / escala).toBeLessThan(1e-9);
      });
    }
  }
});

describe('gas diatómico', () => {
  it('Cv = 5/2·R, Cp = 7/2·R, γ = 7/5 y U = 5/2·n·R·T', () => {
    const sim = simularGas({ ...ESCENA, especie: 'di' }, [], { duracion: 0.1 });
    cerca(sim.cv, 2.5 * R);
    cerca(sim.cp, 3.5 * R);
    cerca(sim.gam, 1.4);
    cerca(sim.muestras[0].U, 2.5 * n * R * T0);
    cerca(sim.muestras[0].P, P1);
  });

  it('calentamiento cuasiestático a presión constante: Q = n·(7/2)·R·ΔT', () => {
    const sim = simularGas({ ...ESCENA, especie: 'di' }, [ADIAB, { t: 1, tipo: 'calentador', valor: true }, { t: 3, tipo: 'calentador', valor: false }],
      { modelo: 'cuasiestatico', duracion: 4 });
    const q0 = sim.muestras[0], q = ultima(sim);
    cerca(calorTotal(q), n * 3.5 * R * (q.T - q0.T), 1e-9);
    cerca(q.dU, n * 2.5 * R * (q.T - q0.T), 1e-9);
  });

  it('con f grados de libertad propios: Cv = f/2·R (f = 6, γ = 4/3)', () => {
    const sim = simularGas({ ...ESCENA, f: 6 }, [], { duracion: 0.1 });
    cerca(sim.cv, 3 * R);
    cerca(sim.gam, 4 / 3);
  });

  it('una especie desconocida es un error, no un gas silencioso', () => {
    expect(() => simularGas({ ...ESCENA, especie: /** @type {any} */ ('triatomico') }, [], { duracion: 0.1 })).toThrow(/Especie/);
  });
});

describe('estado interpolado', () => {
  it('estadoEn() coincide con las muestras y queda entre ellas', () => {
    const sim = simularGas(ESCENA, [ADIAB, { t: 1, tipo: 'pesa', valor: true }], { duracion: 3 });
    const i = 137, q = sim.muestras[i];
    cerca(estadoEn(sim, q.t).P, q.P, 1e-12);
    const s = estadoEn(sim, q.t + sim.muestra / 2), r = sim.muestras[i + 1];
    cerca(s.V, (q.V + r.V) / 2, 1e-12);
    expect(estadoEn(sim, -1).t).toBe(0);
    cerca(estadoEn(sim, 99).t, ultima(sim).t, 1e-12);
  });
});

describe('determinismo', () => {
  const guion = [
    { t: 1, tipo: 'paredes', valor: 'adiabaticas' }, { t: 2, tipo: 'pesa', valor: true },
    { t: 8, tipo: 'calentador', valor: true }, { t: 16, tipo: 'calentador', valor: false },
  ];
  for (const modelo of MODELOS) {
    it(`${modelo}: la misma escena da exactamente el mismo resultado`, () => {
      const a = simularGas(ESCENA, guion, { modelo, duracion: 20 });
      const b = simularGas(ESCENA, guion, { modelo, duracion: 20 });
      expect(a).toEqual(b);
    });
  }
  it('el orden del guion no importa y el guion no se modifica', () => {
    const copia = guion.map(a => ({ ...a }));
    const desordenado = [...guion].reverse();
    expect(simularGas(ESCENA, desordenado, { duracion: 20 })).toEqual(simularGas(ESCENA, guion, { duracion: 20 }));
    expect(guion).toEqual(copia);
  });
});

describe('orientación del cilindro y giro', () => {
  // El peso del émbolo empuja hacia el gas con g·cos α (α respecto de la vertical)
  for (const ang of [0, 60, 90, 150, 180]) {
    it(`inclinado ${ang}°: P = P0 + m·g·cos α/A en el equilibrio inicial`, () => {
      const sim = simularGas({ ...ESCENA, angulo: ang }, [], { duracion: 1 });
      const q0 = sim.muestras[0];
      cerca(q0.P, P0 + m * g * Math.cos(ang * Math.PI / 180) / A, 1e-12);
      cerca(q0.P * q0.V, n * R * T0, 1e-12);
      expect(q0.ang).toBe(ang);
      for (const q of sim.muestras) cerca(q.h, q0.h, 1e-12);     // sin acciones sigue en equilibrio
    });
  }

  it('sin ángulo la corrida no cambia: ang = 0 en cada muestra (compatibilidad)', () => {
    const a = simularGas(ESCENA, [ADIAB, { t: 1, tipo: 'pesa', valor: true }], { duracion: 3 });
    const b = simularGas({ ...ESCENA, angulo: 0 }, [ADIAB, { t: 1, tipo: 'pesa', valor: true }], { duracion: 3 });
    expect(a).toEqual(b);
    for (const q of a.muestras) expect(q.ang).toBe(0);
  });

  for (const modelo of MODELOS) {
    it(`${modelo}: girar 180° a temperatura constante duplica el volumen si P0 = 3·m·g/A (MEXT 2009 1-(4))`, () => {
      const mm = P0 * A / (3 * g), esc = { ...ESCENA, m: mm, M: 0, G: 40, b: 2000, hMax: 2 };
      const sim = simularGas(esc, [{ t: 1, tipo: 'giro', valor: 180 }], { modelo, duracion: 16, tauGiro: 6 });
      const q0 = sim.muestras[0], q = ultima(sim);
      cerca(estadoEn(sim, 4).ang, 90, 1e-9);                       // el giro es lineal en el tiempo
      expect(q.ang).toBe(180);
      cerca(q.V / q0.V, 2, 1e-6);
      cerca(q.P, P0 - mm * g / A, 1e-6);
      cerca(q.T, T0, 1e-6);
      expect(sim.eventos.map(e => e.nombre)).toContain('Se gira el cilindro hasta 180°');
      // El balance del gas y el del émbolo siguen cerrando durante el giro
      const escala = Math.max(...sim.muestras.map(s => Math.abs(s.W)));
      for (const s of sim.muestras) {
        expect(Math.abs(residuoGas(s)) / escala).toBeLessThan(1e-9);
        if (modelo === 'dinamico') expect(Math.abs(residuoEmbolo(s)) / escala).toBeLessThan(1e-9);
      }
    });
  }

  it('cilindro horizontal: la presión es la atmosférica y calentar es isobárico a P0', () => {
    const sim = simularGas({ ...ESCENA, angulo: 90 }, [ADIAB, { t: 1, tipo: 'calentador', valor: true }, { t: 3, tipo: 'calentador', valor: false }],
      { modelo: 'cuasiestatico', duracion: 4 });
    const q0 = sim.muestras[0], q = ultima(sim);
    for (const s of sim.muestras) cerca(s.P, P0, 1e-9);
    cerca(q.W, P0 * (q.V - q0.V), 1e-9);
    cerca(q.Qcal, n * 2.5 * R * (q.T - q0.T), 1e-9);
  });

  it('una inclinación o un giro que sacan el émbolo del cilindro son escenas inválidas', () => {
    const pesado = { ...ESCENA, m: 1000 };                          // m·g/A = 196 kPa > P0
    expect(() => simularGas({ ...pesado, angulo: 180 }, [], { duracion: 1 })).toThrow(/se saldría/);
    expect(() => simularGas(pesado, [{ t: 1, tipo: 'giro', valor: 180 }], { duracion: 2 })).toThrow(/saca el émbolo/);
    // Con topes el mismo giro es válido: el émbolo queda apoyado en ellos
    const sim = simularGas({ ...pesado, hMax: 0.6 }, [{ t: 1, tipo: 'giro', valor: 180 }], { modelo: 'cuasiestatico', duracion: 8 });
    cerca(ultima(sim).h, 0.6, 1e-12);
  });
});
