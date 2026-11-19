// Conductores, dieléctricos y capacitores (sistema/motores/electrostatica-conductores.js)
// contra soluciones analíticas y las respuestas de las escenas MEXT E2 y E3.
import { describe, it, expect } from 'vitest';
import {
  EPSILON_0 as e0, columnas, capacitancia, estadoCapacitor, simularCapacitor, capacitorEn,
  resolverRadial, flujoRadial, energiaRadial,
} from '../sistema/motores/electrostatica-conductores.js';
import { K_COULOMB as k, campo, potencial } from '../sistema/motores/electrostatica.js';

const rel = (a, b, tol) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.abs(b));
const abs = (a, b, tol) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

const S = 0.02, d = 1e-3, C0 = e0 * S / d;          // capacitor de referencia
const capa = (tipo, z0, espesor, o = {}) => ({ tipo, z0, espesor, ...o });

describe('capacitor de placas paralelas: capacitancia', () => {
  it('en vacío C = ε₀S/d', () => {
    rel(capacitancia({ S, d }), C0, 1e-15);
    rel(capacitancia({ S: 3 * S, d: 2 * d }), 1.5 * C0, 1e-15);
  });
  it('dieléctrico que llena el hueco: C = κC₀; conductor de espesor t: C = ε₀S/(d − t)', () => {
    for (const kappa of [1, 2.5, 7]) rel(capacitancia({ S, d, capas: [capa('dielectrico', 0, d, { kappa })] }), kappa * C0, 1e-14);
    for (const t of [0.2 * d, 0.5 * d, 0.9 * d]) {
      rel(capacitancia({ S, d, capas: [capa('conductor', 0.3 * (d - t), t)] }), e0 * S / (d - t), 1e-12);
    }
  });
  it('MEXT 2017 P2 (3)–(4): lámina de espesor d/2 y permitividad ε: C = 2ε/(ε + 1)·C; sus dos capacitores en serie son 2εC y 2C', () => {
    for (const eps of [2, 4, 9]) {
      const cap = { S, d, capas: [capa('dielectrico', 0, d / 2, { kappa: eps })] };
      rel(capacitancia(cap), 2 * eps / (eps + 1) * C0, 1e-14);
      const C1 = e0 * eps * S / (d / 2), C2 = e0 * S / (d / 2);
      rel(C1, 2 * eps * C0, 1e-14); rel(1 / (1 / C1 + 1 / C2), capacitancia(cap), 1e-14);
      // No depende de dónde esté la lámina entre las placas
      rel(capacitancia({ S, d, capas: [capa('dielectrico', 0.3 * d, d / 2, { kappa: eps })] }), capacitancia(cap), 1e-14);
    }
  });
  it('MEXT 2017 P2 (5): dos dieléctricos lado a lado, cada uno en la mitad del área: C = (ε₁ + ε₂)/2·C', () => {
    const cap = { S, d, capas: [capa('dielectrico', 0, d, { kappa: 3, a0: 0, a1: 0.5 }), capa('dielectrico', 0, d, { kappa: 5, a0: 0.5, a1: 1 })] };
    rel(capacitancia(cap), (3 + 5) / 2 * C0, 1e-14);
    expect(columnas(cap).map(c => [c.f0, c.f1])).toEqual([[0, 0.5], [0.5, 1]]);
  });
  it('lámina metida a medias: C = C₀·[(1 − x) + κx] (paralelo)', () => {
    for (const x of [0, 0.25, 0.6, 1]) rel(capacitancia({ S, d, capas: [capa('dielectrico', 0, d, { kappa: 4, a1: x })] }), C0 * ((1 - x) + 4 * x), 1e-14);
  });
  it('una escena que no es un capacitor lanza RangeError', () => {
    expect(() => capacitancia({ S, d: 0 })).toThrow(RangeError);
    expect(() => capacitancia({ S, d, capas: [capa('conductor', 0, d)] })).toThrow(/une las dos placas/);
    expect(() => capacitancia({ S, d, capas: [capa('dielectrico', 0, 0.6 * d, { kappa: 2 }), capa('dielectrico', 0.5 * d, 0.3 * d, { kappa: 2 })] })).toThrow(/solapan/);
    expect(() => capacitancia({ S, d, capas: [capa('dielectrico', 0.5 * d, 0.6 * d, { kappa: 2 })] })).toThrow(/se sale/);
    expect(() => capacitancia({ S, d, capas: [capa('dielectrico', 0, d, { kappa: 0.5 })] })).toThrow(/permitividad/);
    expect(() => capacitancia({ S, d, capas: [capa('dielectrico', 0, d, { kappa: 2, a0: 0.6, a1: 0.4 })] })).toThrow(RangeError);
  });
});

describe('capacitor de placas paralelas: campos, cargas, energía y fuerza', () => {
  const V = 100;
  it('MEXT 2017 P2 (1)–(2) y 2016 1-(3): Q = CV y E = V/d = Q/(Cd)', () => {
    const est = estadoCapacitor({ S, d }, V);
    rel(est.Q, C0 * V, 1e-15); rel(est.E, V / d, 1e-14); rel(est.E, est.Q / (est.C * d), 1e-14);
  });
  it('energía ½CV² = ½QV = Q²/(2C) y fuerza entre placas Q²/(2ε₀S) = −∂U/∂d con Q fija', () => {
    const cap = { S, d, capas: [capa('dielectrico', 0.2 * d, 0.5 * d, { kappa: 3 })] }, est = estadoCapacitor(cap, V);
    rel(est.U, 0.5 * est.C * V * V, 1e-15); rel(est.U, 0.5 * est.Q * V, 1e-15); rel(est.U, est.Q ** 2 / (2 * est.C), 1e-14);
    rel(est.F, est.Q ** 2 / (2 * e0 * S), 1e-14);
    const h = 1e-9, U = dd => est.Q ** 2 / (2 * capacitancia({ ...cap, d: dd }));
    rel(-(U(d - h) - U(d + h)) / (2 * h), est.F, 1e-6);
    // Con V fija la energía baja al separar, pero la fuerza es la misma: F = +∂U/∂d|_V
    const UV = dd => 0.5 * capacitancia({ ...cap, d: dd }) * V * V;
    rel(-(UV(d + h) - UV(d - h)) / (2 * h), est.F, 1e-6);
  });
  it('dieléctrico: E = σ/(κε₀), D = σ continuo, cargas de polarización ±σ(1 − 1/κ) y ∫E·dz = V', () => {
    const kappa = 4, cap = { S, d, capas: [capa('dielectrico', 0.25 * d, 0.5 * d, { kappa })] }, est = estadoCapacitor(cap, V);
    const col = est.columnas[0], sigma = col.sigma;
    expect(col.regiones.map(r => r.tipo)).toEqual(['vacio', 'dielectrico', 'vacio']);
    rel(col.regiones[0].E, sigma / e0, 1e-14); rel(col.regiones[1].E, sigma / (kappa * e0), 1e-14);
    for (const r of col.regiones) rel(r.D, sigma, 1e-15);
    rel(col.regiones.reduce((s, r) => s + r.E * (r.z1 - r.z0), 0), V, 1e-13);
    abs(col.regiones[2].V1, 0, 1e-12); rel(col.regiones[0].V0, V, 1e-15);
    const pol = col.superficies.filter(s => s.tipo === 'polarizacion');
    rel(pol[0].sigma, -sigma * (1 - 1 / kappa), 1e-14); rel(pol[1].sigma, sigma * (1 - 1 / kappa), 1e-14);
    // La carga total (libre + ligada) suma cero
    abs(col.superficies.reduce((s, x) => s + x.sigma, 0), 0, 1e-12 * sigma);
  });
  it('conductor entre las placas: E = 0 dentro, cargas inducidas ∓σ en sus caras', () => {
    const est = estadoCapacitor({ S, d, capas: [capa('conductor', 0.3 * d, 0.4 * d)] }, V), col = est.columnas[0];
    expect(col.regiones[1].E).toBe(0);
    rel(col.regiones[1].V0, col.regiones[1].V1, 1e-15);
    const ind = col.superficies.filter(s => s.tipo === 'inducida');
    rel(ind[0].sigma, -col.sigma, 1e-15); rel(ind[1].sigma, col.sigma, 1e-15);
    rel(col.regiones[0].E, V / (0.6 * d), 1e-13);
  });
});

describe('procesos del capacitor (cuasiestáticos) y su registro de energía', () => {
  const V = 120;
  it('MEXT 2020 1-(3): desconectado, separar de d a d + Δd cuesta ε₀SV²Δd/(2d²)', () => {
    const Dd = 0.4 * d;
    const sim = simularCapacitor({ S, d, V, conectada: false, acciones: [{ tipo: 'separar', t0: 1, t1: 3, hasta: d + Dd }] }, { duracion: 4 });
    const fin = capacitorEn(sim, 4);
    rel(fin.Wext, e0 * S * V * V / (2 * d * d) * Dd, 1e-13);
    rel(fin.Q, C0 * V, 1e-15); expect(fin.Wbat).toBe(0);
    rel(fin.V, V * (d + Dd) / d, 1e-13);
    // A mitad del proceso el trabajo va por la mitad (fuerza constante con Q fija)
    rel(capacitorEn(sim, 2).Wext, e0 * S * V * V / (2 * d * d) * Dd / 2, 1e-12);
    expect(sim.eventos.map(e => e.nombre)).toEqual(['Empieza a separar las placas', 'Termina de separar las placas']);
  });
  it('MEXT 2008 1-(2): con Q fija, triplicar la separación cuesta Q²/C', () => {
    const Q = 3e-9, C = C0;
    const sim = simularCapacitor({ S, d, V: Q / C, conectada: false, Q0: Q, acciones: [{ tipo: 'separar', t0: 0, t1: 1, hasta: 3 * d }] }, { duracion: 1 });
    rel(capacitorEn(sim, 1).Wext, Q * Q / C, 1e-13);
  });
  it('MEXT 2010 4-B: meter un conductor de espesor d en un hueco de 2d con Q fija deja la mitad de la energía', () => {
    const Q = 2e-9, cap = { S, d: 2 * d, capas: [capa('conductor', d / 2, d, { a1: 0 })] };
    const sim = simularCapacitor({ ...cap, V: 1, conectada: false, Q0: Q, acciones: [{ tipo: 'insertar', capa: 0, t0: 0, t1: 2, hasta: 1 }] }, { duracion: 2 });
    const ini = capacitorEn(sim, 0), fin = capacitorEn(sim, 2);
    rel(fin.U / ini.U, 0.5, 1e-14);
    rel(fin.Wext, -0.5 * ini.U, 1e-13);               // el conductor es atraído hacia dentro
    rel(fin.Q, Q, 1e-15);
  });
  it('separar al doble con la batería conectada y con la batería desconectada', () => {
    const con = capacitorEn(simularCapacitor({ S, d, V, acciones: [{ tipo: 'separar', t0: 0, t1: 1, hasta: 2 * d }] }, { duracion: 1 }), 1);
    const sin = capacitorEn(simularCapacitor({ S, d, V, conectada: false, acciones: [{ tipo: 'separar', t0: 0, t1: 1, hasta: 2 * d }] }, { duracion: 1 }), 1);
    const U0 = 0.5 * C0 * V * V;
    // Conectada: V fija, Q y U a la mitad, la batería recibe CV²/2 y el agente hace +U₀/2
    rel(con.V, V, 1e-14); rel(con.Q, C0 * V / 2, 1e-14); rel(con.U, U0 / 2, 1e-14);
    rel(con.Wbat, -C0 * V * V / 2, 1e-14); rel(con.Wext, U0 / 2, 1e-13);
    // Desconectada: Q fija, V y U al doble, el agente hace +U₀
    rel(sin.V, 2 * V, 1e-14); rel(sin.Q, C0 * V, 1e-15); rel(sin.U, 2 * U0, 1e-14); rel(sin.Wext, U0, 1e-13);
  });
  it('MEXT 2007 P2: meter un conductor de d/3 con la batería conectada y sacarlo con el interruptor abierto', () => {
    const E = 9, cap = { S, d, capas: [capa('conductor', d / 3, d / 3, { a1: 0 })] };
    const sim = simularCapacitor({ ...cap, V: E, acciones: [
      { tipo: 'insertar', capa: 0, t0: 1, t1: 3, hasta: 1 },
      { tipo: 'bateria', t0: 4, conectada: false },
      { tipo: 'insertar', capa: 0, t0: 5, t1: 7, hasta: 0 },
    ] }, { duracion: 8 });
    const C = C0, ini = capacitorEn(sim, 0), dentro = capacitorEn(sim, 3.5), fuera = capacitorEn(sim, 8);
    rel(dentro.C, 1.5 * C, 1e-14);                                  // (1) (e) 3C/2
    rel(dentro.Q - ini.Q, 0.5 * C * E, 1e-13);                      // (2) (i) CE/2
    rel(dentro.U - ini.U, 0.25 * C * E * E, 1e-13);                 // (3) (u) CE²/4
    rel(dentro.Wbat, 0.5 * C * E * E, 1e-13);                       // (4) (w) CE²/2
    rel(dentro.Wext, -0.25 * C * E * E, 1e-13);                     // (5) (n) −CE²/4
    rel(fuera.Wext - dentro.Wext, 3 / 8 * C * E * E, 1e-13);        // (6) (v) 3CE²/8
    expect(fuera.conectada).toBe(false); rel(fuera.Q, 1.5 * C * E, 1e-14);
    expect(sim.eventos.map(e => e.nombre)).toEqual(['Empieza a meter la capa', 'Termina de meter la capa', 'Se desconecta la batería', 'Empieza a sacar la capa', 'Termina de sacar la capa']);
  });
  it('dieléctrico que se introduce con la batería conectada: el agente recibe −½(κ − 1)C₀V²', () => {
    const kappa = 3, sim = simularCapacitor({ S, d, V, capas: [capa('dielectrico', 0, d, { kappa, a1: 0 })], acciones: [{ tipo: 'insertar', capa: 0, t0: 0, t1: 1, hasta: 1 }] }, { duracion: 1 });
    const fin = capacitorEn(sim, 1);
    rel(fin.C, kappa * C0, 1e-14);
    rel(fin.Wbat, (kappa - 1) * C0 * V * V, 1e-13);
    rel(fin.Wext, -0.5 * (kappa - 1) * C0 * V * V, 1e-13);
    // A mitad de camino, C crece lineal y la fuerza es constante
    rel(capacitorEn(sim, 0.5).Wext, -0.25 * (kappa - 1) * C0 * V * V, 1e-12);
  });
  it('reconectar a la batería con otro voltaje disipa ½C·ΔV² y el registro cierra', () => {
    const sim = simularCapacitor({ S, d, V, acciones: [
      { tipo: 'bateria', t0: 1, conectada: false },
      { tipo: 'separar', t0: 2, t1: 3, hasta: 2 * d },
      { tipo: 'bateria', t0: 4, conectada: true },
    ] }, { duracion: 5 });
    const antes = capacitorEn(sim, 3.9), fin = capacitorEn(sim, 5), C = C0 / 2;
    rel(antes.V, 2 * V, 1e-14);
    rel(fin.calor, 0.5 * C * (2 * V - V) ** 2, 1e-13);
    rel(fin.V, V, 1e-14);
    // Balance en todo instante: W_ext + W_bat = ΔU + calor
    for (const t of [0, 0.5, 1.5, 2.5, 3.5, 4, 4.5, 5]) {
      const s = capacitorEn(sim, t);
      abs(s.Wext + s.Wbat, s.U - sim.U0 + s.calor, 1e-12 * sim.U0);
    }
  });
  it('una geometría inválida durante el proceso lanza RangeError (escena inválida)', () => {
    expect(() => simularCapacitor({ S, d, V, capas: [capa('dielectrico', 0, 0.8 * d, { kappa: 2 })], acciones: [{ tipo: 'separar', t0: 0, t1: 1, hasta: 0.5 * d }] }, { duracion: 1 })).toThrow(RangeError);
  });
});

describe('simetría esférica y cilíndrica (ley de Gauss)', () => {
  const Q = 2e-9, R = 0.1;
  it('MEXT 2009 1-(3): carga Q en el centro de una cáscara conductora (radio interior R, espesor R): −Q dentro, +Q fuera', () => {
    const sol = resolverRadial({ simetria: 'esferica', q: Q, capas: [{ tipo: 'conductor', r1: R, r2: 2 * R }] });
    const sup = sol.superficies.filter(s => s.tipo === 'inducida');
    rel(sup[0].q, -Q, 1e-15); rel(sup[1].q, Q, 1e-15);
    expect(sol.E(1.5 * R)).toBe(0);
    rel(sol.E(0.5 * R), k * Q / (0.5 * R) ** 2, 1e-12);
    rel(sol.E(3 * R), k * Q / (3 * R) ** 2, 1e-12);
    rel(sol.V(1.5 * R), k * Q / (2 * R), 1e-12);                  // el conductor está al potencial de su cara externa
    rel(sol.V(0.5 * R), k * Q / (0.5 * R) - k * Q / R + k * Q / (2 * R), 1e-12);
    // Coincide con la superposición de una carga puntual y dos cáscaras conductoras (motor de Cargas y campos)
    const f = [{ x: 0, y: 0, q: Q }, { tipo: 'esfera', conductora: true, x: 0, y: 0, radio: R, q: -Q }, { tipo: 'esfera', conductora: true, x: 0, y: 0, radio: 2 * R, q: Q }];
    for (const r of [0.5 * R, 1.5 * R, 3 * R]) rel(potencial(f, r, 0), sol.V(r), 1e-12);
    abs(Math.hypot(...campo(f, 1.5 * R, 0)), 0, 1e-6);
  });
  it('capacitor esférico: C = 4πε₀ab/(b − a) y energía ½Q²/C = ½∫D·E dV', () => {
    const a = 0.05, b = 0.08, sol = resolverRadial({ simetria: 'esferica', q: Q, a, capas: [{ tipo: 'conductor', r1: b, r2: b + 0.01, q: -Q }] });
    const C = 4 * Math.PI * e0 * a * b / (b - a);
    rel(Q / (sol.V(a) - sol.V(b)), C, 1e-12);
    rel(energiaRadial(sol, a, b), Q * Q / (2 * C), 1e-12);
    expect(sol.E(0.5 * a)).toBe(0); expect(sol.E(b + 0.02)).toBe(0);
    abs(energiaRadial(sol, b + 0.01, Infinity), 0, 1e-30);
  });
  it('cáscara a tierra: toma −Q, fuera no hay campo y su potencial es 0', () => {
    const sol = resolverRadial({ simetria: 'esferica', q: Q, capas: [{ tipo: 'conductor', r1: R, r2: 1.5 * R, tierra: true }] });
    rel(sol.capas[0].q, -Q, 1e-12);
    abs(sol.V(1.2 * R), 0, 1e-9 * k * Q / R);
    expect(sol.E(2 * R)).toBe(0);
    rel(sol.V(0.5 * R), k * Q * (1 / (0.5 * R) - 1 / R), 1e-12);
  });
  it('dos cáscaras, la interior a tierra y la exterior aislada con carga: sistema lineal', () => {
    const q2 = 5e-9, sol = resolverRadial({ simetria: 'esferica', q: Q, capas: [{ tipo: 'conductor', r1: R, r2: 1.2 * R, tierra: true }, { tipo: 'conductor', r1: 2 * R, r2: 2.2 * R, q: q2 }] });
    abs(sol.V(1.1 * R), 0, 1e-9 * k * Q / R);
    // V(r₂ interior) = k(Q + q₁)/(1.2R) − k(Q + q₁)/(2R) + k(Q + q₁ + q₂)/(2.2R) = 0
    const q1 = sol.capas[0].q, Qi = Q + q1;
    abs(k * Qi / (1.2 * R) - k * Qi / (2 * R) + k * (Qi + q2) / (2.2 * R), 0, 1e-9 * k * Q / R);
  });
  it('dieléctrico esférico: D continuo, E = D/(κε₀) y cargas de polarización ∓Q(1 − 1/κ)', () => {
    const kappa = 5, sol = resolverRadial({ simetria: 'esferica', q: Q, capas: [{ tipo: 'dielectrico', r1: R, r2: 2 * R, kappa }] });
    for (const r of [0.5 * R, 1.5 * R, 3 * R]) rel(sol.D(r), Q / (4 * Math.PI * r * r), 1e-14);
    rel(sol.E(1.5 * R), k * Q / (kappa * (1.5 * R) ** 2), 1e-12);
    const pol = sol.superficies.filter(s => s.tipo === 'polarizacion');
    rel(pol[0].q, -Q * (1 - 1 / kappa), 1e-14); rel(pol[1].q, Q * (1 - 1 / kappa), 1e-14);
    // Flujo de E = carga total encerrada / ε₀; flujo de D = carga libre
    for (const r of [0.5 * R, 1.5 * R, 3 * R]) {
      const f = flujoRadial(sol, r);
      rel(f.E, sol.Qtotal(r) / e0, 1e-12); rel(f.D, sol.Qlibre(r), 1e-14);
    }
    rel(sol.Qtotal(1.5 * R), Q / kappa, 1e-14);
  });
  it('MEXT 2025 T4 (tema): hilo «infinito» y cilindro gaussiano: E = λ/(2πε₀r) y Φ = λL/ε₀', () => {
    const lam = 3e-9, sol = resolverRadial({ simetria: 'cilindrica', q: lam });
    for (const r of [0.01, 0.2, 3]) {
      rel(sol.E(r), lam / (2 * Math.PI * e0 * r), 1e-14);
      rel(flujoRadial(sol, r, 2.5).E, lam * 2.5 / e0, 1e-14);
    }
    abs(sol.V(1), 0, 1e-12);                                         // referencia en r = 1 m
    rel(sol.V(0.1) - sol.V(0.4), lam / (2 * Math.PI * e0) * Math.log(4), 1e-12);
    // Igual que el hilo del motor de Cargas y campos
    rel(sol.V(0.3), potencial([{ tipo: 'hilo', x: 0, y: 0, lambda: lam }], 0.3, 0), 1e-12);
  });
  it('cable coaxial: C por unidad de largo 2πε₀/ln(b/a) y energía λ²/(4πε₀)·ln(b/a)', () => {
    const lam = 1e-9, a = 0.002, b = 0.007, sol = resolverRadial({ simetria: 'cilindrica', q: lam, a, capas: [{ tipo: 'conductor', r1: b, r2: b + 0.001, q: -lam }] });
    rel(lam / (sol.V(a) - sol.V(b)), 2 * Math.PI * e0 / Math.log(b / a), 1e-12);
    rel(energiaRadial(sol, a, b), lam * lam / (4 * Math.PI * e0) * Math.log(b / a), 1e-12);
    expect(sol.E(b + 0.002)).toBe(0);
  });
  it('cáscaras que se solapan o κ < 1: RangeError', () => {
    expect(() => resolverRadial({ simetria: 'esferica', q: Q, capas: [{ tipo: 'conductor', r1: 0.2, r2: 0.1 }] })).toThrow(RangeError);
    expect(() => resolverRadial({ simetria: 'esferica', q: Q, capas: [{ tipo: 'conductor', r1: 0.1, r2: 0.3 }, { tipo: 'conductor', r1: 0.2, r2: 0.4 }] })).toThrow(RangeError);
    expect(() => resolverRadial({ simetria: 'esferica', q: Q, capas: [{ tipo: 'dielectrico', r1: 0.1, r2: 0.3, kappa: 0.5 }] })).toThrow(RangeError);
  });
});
