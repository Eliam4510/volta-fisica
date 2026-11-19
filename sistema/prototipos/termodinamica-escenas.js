/* ==========================================================================
   Volta · Termodinámica — catálogo de escenas de los cuatro espacios
   Puro (sin DOM): lo usan las pantallas y las pruebas
   (pruebas/termodinamica-mext.test.js), así que las respuestas del examen que
   se ven en pantalla son las mismas que se comprueban.
   Cada escena: clave, titulo, tipo (Tutorial, Ejemplo, MEXT), anio, espacio,
   nota, variables (valor en su unidad de pantalla), y para el motor:
   construir(v) → entrada del motor en SI, guion(v) → acciones, opciones.
   examen(sim, v) → filas con la respuesta medida en la simulación (valor) y la
   del enunciado (esperado), su fórmula y la opción del examen; t: instante a
   partir del cual se conoce.
   Las escenas MEXT son reconstrucciones propias de cada situación física
   (DECISIONES.md, 2): cuando el examen es simbólico, la escena fija valores.
   ========================================================================== */
import { R_GAS, simularGas, estadoEn } from '../motores/gas.js';
import { simularCiclo, cicloCarnot, cicloOtto, cicloRectangular, rendimientoCarnot, rendimientoOtto, GRADOS } from '../motores/ciclos.js';
import { simularRecipientes, simularAbierto, simularBurbuja, temperaturaDespegue, estadoRecipientes, estadoMuestras, equilibrioAislado } from '../motores/recipientes.js';
import { simularMolecular, UMA, K_B, N_A } from '../motores/cinetica.js';
import { simularCalor, equilibrioCalor, temperaturaMezcla } from '../motores/calor.js';

const R = R_GAS, G9 = 9.8, K0 = 273.15;

/** Página de cada espacio de Termodinámica. */
export const PAGINAS = Object.freeze({
  'laboratorio-de-gases': 'termodinamica.html', ciclos: 'termodinamica-ciclos.html',
  molecular: 'termodinamica-molecular.html', calor: 'termodinamica-calor.html',
});

/**
 * @typedef {{sim: string, sub?: string, val: number, min: number, max: number, paso: number, u: string, constante?: boolean, ayuda?: string}} Variable
 * @typedef {{n: string, etq: string, valor: number, esperado: number, u: string, formula: string, opcion?: string, t?: number, tol?: number, texto?: string}} FilaExamen
 */

/** @returns {Variable} */
const vari = (sim, val, min, max, paso, u, o = {}) => ({ sim, sub: o.sub, val, min, max, paso, u, constante: o.constante, ayuda: o.ayuda });
const cte = (sim, val, u, o = {}) => vari(sim, val, val, val, 1, u, { ...o, constante: true });
/** Valores por omisión de las variables de una escena. */
export const valores = esc => Object.fromEntries(Object.entries(esc.variables || {}).map(([k, d]) => [k, d.val]));
const ultima = sim => sim.muestras[sim.muestras.length - 1];
const S = (s, sub) => `<span class="sim">${s}</span>${sub ? `<sub class="r">${sub}</sub>` : ''}`;   // símbolo con subíndice

// ===========================================================================
// Laboratorio de gases · cilindro con émbolo (motores/gas.js)
// ===========================================================================
// Variables de la escena original (MEXT 2019 P4), con sus mismos rangos
const VAR_CIL = () => ({
  n: vari('n', 1, 0.25, 2, 0.05, 'mol'),
  m: vari('m', 50, 5, 150, 1, 'kg'),
  M: vari('M', 150, 0, 300, 5, 'kg'),
  A: vari('A', 500, 400, 800, 10, 'cm²'),
  P0: vari('P', 101.3, 80, 120, 0.1, 'kPa', { sub: '0' }),
  T0: vari('T', 300, 250, 380, 1, 'K', { sub: '0' }),
  Fc: vari('Φ', 300, 0, 800, 10, 'W', { sub: 'cal' }),
  G: vari('G', 6, 0.5, 20, 0.5, 'W/K'),
  b: vari('b', 300, 0, 1500, 10, 'kg/s'),
  g: vari('g', 9.8, 9.8, 9.8, 0.01, 'm/s²', { constante: true }),
});
/** Variables del cilindro con cambios y sin las que no usa la escena. */
function cil(cambios = {}, quitar = []) {
  const v = VAR_CIL();
  for (const k of quitar) delete v[k];
  for (const [k, c] of Object.entries(cambios)) v[k] = { ...(v[k] || vari(k, 0, 0, 1, 1, '')), ...c };
  return v;
}
/** Escena del motor de gas a partir de las variables (unidades de pantalla → SI). */
export const gasDe = v => ({ n: v.n, A: v.A * 1e-4, P0: v.P0 * 1e3, T0: v.T0, g: v.g ?? G9, m: v.m ?? 0, M: v.M ?? 0, Fc: v.Fc ?? 0, G: v.G ?? 0, b: v.b ?? 0 });
const GEO_BASE = { Hc: 0.70, hMax: 0.62, tanque: true, angulo: 0, simEmbolo: 'm' };
const ADIAB0 = { t: 0, tipo: 'paredes', valor: 'adiabaticas' };

/** Guion original de la pantalla (recorrido libre con pesa, calentador y paredes). */
export const GUION_RECORRIDO = Object.freeze([
  { t: 1, tipo: 'paredes', valor: 'adiabaticas' },
  { t: 2, tipo: 'pesa', valor: true },
  { t: 8, tipo: 'calentador', valor: true },
  { t: 16, tipo: 'calentador', valor: false },
  { t: 18, tipo: 'paredes', valor: 'conductoras' },
  { t: 30, tipo: 'pesa', valor: false },
]);

const ESCENAS_CILINDRO = [
  {
    clave: 'boyle', titulo: 'Ley de Boyle: compresión isotérmica en un baño', tipo: 'Tutorial', montaje: 'cilindro',
    nota: 'Paredes conductoras y un baño grande: la pesa se carga despacio y el gas se comprime a temperatura constante. P·V no cambia: sigue a la isoterma.',
    variables: cil({ G: { val: 40, max: 60 } }, ['Fc']), modelo: 'cuasiestatico', especie: 'mono', geo: GEO_BASE, duracion: 18,
    guion: () => [{ t: 1, tipo: 'pesa', valor: true }, { t: 10, tipo: 'pesa', valor: false }],
    extra: (s, sim) => [[`${S('P')}·${S('V')}`, s.P * s.V, 'J', 'Producto P·V: constante en una isoterma|Boyle'], [`${S('n')}·${S('R')}·${S('T', '0')}`, sim.n * R * sim.T0, 'J', 'n·R·T₀|nRT']],
  },
  {
    clave: 'charles', titulo: 'Ley de Charles: calentar con el émbolo libre', tipo: 'Tutorial', montaje: 'cilindro',
    nota: 'Paredes adiabáticas y émbolo libre: el calentador sube la temperatura a presión constante y el volumen crece en proporción: V/T no cambia.',
    variables: cil({ Fc: { val: 150 } }, ['M']), modelo: 'cuasiestatico', especie: 'mono', geo: GEO_BASE, duracion: 12,
    guion: () => [ADIAB0, { t: 1, tipo: 'calentador', valor: true }, { t: 9, tipo: 'calentador', valor: false }],
    extra: s => [[`${S('V')}/${S('T')}`, s.V / s.T * 1e3, 'L/K', 'Constante a presión constante|Charles'], [`${S('P')}`, s.P / 1e3, 'kPa', 'Presión del gas|Pressure']],
  },
  {
    clave: 'isocorico', titulo: 'Calentar a volumen constante', tipo: 'Tutorial', montaje: 'cilindro',
    nota: 'El émbolo descansa en los topes: el gas no puede expandirse, todo el calor va a la energía interna (W = 0) y P/T no cambia.',
    variables: cil({ Fc: { val: 150 } }, ['M']), modelo: 'cuasiestatico', especie: 'mono', geo: { ...GEO_BASE, hMax: 0.40 }, duracion: 12,
    guion: () => [ADIAB0, { t: 1, tipo: 'calentador', valor: true }, { t: 9, tipo: 'calentador', valor: false }],
    extra: s => [[`${S('P')}/${S('T')}`, s.P / s.T, 'Pa/K', 'Constante a volumen constante|Gay-Lussac'], [`${S('W')}`, s.W, 'J', 'Trabajo del gas: cero|Work']],
  },
  {
    clave: 'adiabatica', titulo: 'Compresión adiabática', tipo: 'Tutorial', montaje: 'cilindro',
    nota: 'Paredes adiabáticas y la pesa cargada despacio: el gas se calienta al comprimirse y P·V^γ se conserva (γ = 5/3 en un gas monoatómico).',
    variables: cil({}, ['Fc', 'G']), modelo: 'cuasiestatico', especie: 'mono', geo: GEO_BASE, duracion: 13,
    guion: () => [ADIAB0, { t: 1, tipo: 'pesa', valor: true }, { t: 8, tipo: 'pesa', valor: false }],
    extra: (s, sim) => [[`${S('P')}·${S('V')}<sup>γ</sup>`, s.P * s.V ** sim.gam, 'Pa·m^(3γ)', 'Constante en la adiabática reversible|Adiabat'], [`${S('T')}`, s.T, 'K', 'Temperatura|Temperature']],
  },
  {
    clave: 'oscila', titulo: 'Émbolo con masa que oscila hasta el equilibrio', tipo: 'Ejemplo', montaje: 'cilindro',
    nota: 'La pesa cae de golpe sobre el émbolo: el gas hace de resorte y el émbolo oscila; el rozamiento viscoso b disipa la energía, que vuelve al gas como calor.',
    variables: cil({ b: { val: 20 } }, ['Fc', 'G']), modelo: 'dinamico', especie: 'mono', geo: GEO_BASE, duracion: 20,
    guion: () => [ADIAB0, { t: 1, tipo: 'pesa', valor: true }],
    extra: s => [[`${S('E')}<sub class="r">dis</sub>`, s.Edis, 'J', 'Energía disipada|Dissipated energy'], [`${S('v')}`, s.v, 'm/s', 'Velocidad del émbolo|Piston velocity']],
  },
  {
    clave: 'recorrido', titulo: 'Pesa, calentador y paredes: recorrido libre', tipo: 'Ejemplo', montaje: 'cilindro',
    nota: 'El guion original de la pantalla: paredes adiabáticas, pesa, calentador, de nuevo conductoras y fuera la pesa. Cambia las acciones en la línea de tiempo.',
    variables: cil(), modelo: 'dinamico', especie: 'mono', geo: GEO_BASE, duracion: 42,
    guion: () => GUION_RECORRIDO.map(a => ({ ...a })),
  },
  // ----------------------------------------------------------------- MEXT
  {
    clave: 'mext-2019-p4', titulo: 'Émbolo con pesa en un baño térmico', tipo: 'MEXT', anio: '2019 P4', montaje: 'cilindro',
    nota: 'Paredes conductoras: la pesa M comprime el gas a T constante (h₁). Después, paredes adiabáticas y fuera la pesa (h₂, más frío). Al volver a conducir, regresa a T y a la altura h.',
    variables: cil({ G: { val: 20 }, b: { val: 1000 } }), modelo: 'dinamico', especie: 'mono', geo: GEO_BASE, duracion: 50,
    guion: () => [{ t: 1, tipo: 'pesa', valor: true }, { t: 20, tipo: 'paredes', valor: 'adiabaticas' }, { t: 21, tipo: 'pesa', valor: false }, { t: 32, tipo: 'paredes', valor: 'conductoras' }],
    examen: (sim, v) => {
      const e = gasDe(v), h = sim.muestras[0].h, s1 = estadoEn(sim, 19.9), s2 = estadoEn(sim, 31.9), s3 = ultima(sim);
      const PA = e.P0 * e.A, mg = e.m * e.g, Mg = e.M * e.g;
      return [
        { n: '(1)', etq: `${S('h', '1')}`, valor: s1.h, esperado: (PA + mg) / (PA + Mg + mg) * h, u: 'm', formula: '(PA + mg)/(PA + (M + m)g)·h', opcion: '(b)', t: 19.9, tol: 1e-6 },
        { n: '(2)', etq: `${S('W')}<sub class="r">aire</sub>`, valor: PA * (h - s1.h), esperado: Mg * PA * h / (PA + Mg + mg), u: 'J', formula: 'MgPAh/(PA + (M + m)g)', opcion: '(f)', t: 19.9, tol: 1e-5 },
        { n: '(3)', etq: `${S('T', '2')}`, valor: s2.T, esperado: s2.h / h * e.T0, u: 'K', formula: '(h₂/h)·T', opcion: '(e)', t: 31.9, tol: 1e-6 },
        { n: '(4)', etq: `${S('h', '3')}`, valor: s3.h, esperado: h, u: 'm', formula: 'h', opcion: '(a)', t: sim.duracion, tol: 1e-6 },
      ];
    },
  },
  {
    clave: 'mext-2015-p4', titulo: 'Calentar despacio un gas bajo un émbolo pesado', tipo: 'MEXT', anio: '2015 P4', montaje: 'cilindro',
    nota: 'El émbolo (M en el enunciado) deja el gas a 2p₀. Paredes adiabáticas: el calentador lo lleva despacio de h a 3h/2 a presión constante.',
    variables: { n: cte('n', 1, 'mol'), A: vari('S', 500, 300, 800, 10, 'cm²'), P0: vari('p', 101.3, 80, 120, 0.1, 'kPa', { sub: '0' }), h: vari('h', 0.25, 0.15, 0.35, 0.01, 'm'), Fc: vari('Φ', 200, 50, 800, 10, 'W', { sub: 'cal' }), g: VAR_CIL().g },
    modelo: 'cuasiestatico', especie: 'mono', geo: { ...GEO_BASE, simEmbolo: 'M', hMax: 0.62, tanque: false }, duracion: 24,
    construir: v => ({ ...gasDe({ ...v, M: 0, G: 6, b: 300 }), m: v.P0 * 1e3 * v.A * 1e-4 / (v.g ?? G9), T0: 2 * v.P0 * 1e3 * v.A * 1e-4 * v.h / (v.n * R) }),
    guion: v => [ADIAB0, { t: 1, tipo: 'calentador', valor: true }, { t: 1 + 2.5 * v.P0 * 1e3 * v.A * 1e-4 * v.h / v.Fc, tipo: 'calentador', valor: false }],
    examen: (sim, v) => {
      const p0 = v.P0 * 1e3, Sx = v.A * 1e-4, q = ultima(sim), h = sim.muestras[0].h;
      return [
        { n: '(1)', etq: S('M'), valor: sim.m, esperado: p0 * Sx / v.g, u: 'kg', formula: 'p₀S/g', opcion: '(d)', t: 0 },
        { n: '(2)', etq: S('T', '0'), valor: sim.muestras[0].T, esperado: 2 * p0 * Sx * v.h / R, u: 'K', formula: '2p₀Sh/R', opcion: '(i)', t: 0, tol: 1e-9 },
        { n: '', etq: `${S('h')}<sub class="r">final</sub>/${S('h')}`, valor: q.h / h, esperado: 1.5, u: '', formula: '3/2', t: sim.duracion, tol: 1e-4 },
        { n: '(3)', etq: S('W'), valor: q.W, esperado: p0 * Sx * v.h, u: 'J', formula: 'p₀Sh', opcion: '(c)', t: sim.duracion, tol: 1e-4 },
        { n: '(4)', etq: S('Q'), valor: q.Qcal, esperado: 2.5 * p0 * Sx * v.h, u: 'J', formula: '5p₀Sh/2', opcion: '(d)', t: sim.duracion, tol: 1e-4 },
      ];
    },
  },
  {
    clave: 'mext-2013-1-4', titulo: 'Cilindro horizontal calentado a presión atmosférica', tipo: 'MEXT', anio: '2013 1-(4)', montaje: 'cilindro',
    nota: 'Cilindro tumbado: el émbolo no pesa sobre el gas y la presión es siempre p₀. El calentador lleva el volumen de V a 3V/2 sin intercambio de calor con las paredes.',
    variables: cil({ m: { val: 10 }, Fc: { val: 300 } }, ['M', 'G', 'b']), modelo: 'cuasiestatico', especie: 'mono',
    geo: { ...GEO_BASE, Hc: 0.92, hMax: 0.84, tanque: false, angulo: 90 }, duracion: 14,
    construir: v => ({ ...gasDe(v), G: 6, b: 300, angulo: 90 }),
    guion: v => { const V = v.n * R * v.T0 / (v.P0 * 1e3); return [ADIAB0, { t: 1, tipo: 'calentador', valor: true }, { t: 1 + 1.25 * v.P0 * 1e3 * V / v.Fc, tipo: 'calentador', valor: false }]; },
    examen: (sim, v) => {
      const q0 = sim.muestras[0], q = ultima(sim);
      return [
        { n: '', etq: `${S('V')}<sub class="r">final</sub>/${S('V')}`, valor: q.V / q0.V, esperado: 1.5, u: '', formula: '3/2', t: sim.duracion, tol: 1e-4 },
        { n: '(4)', etq: S('Q'), valor: q.Qcal, esperado: 1.25 * v.P0 * 1e3 * q0.V, u: 'J', formula: '5p₀V/4', opcion: '(h)', t: sim.duracion, tol: 1e-4 },
      ];
    },
  },
  {
    clave: 'mext-2007-1-3', titulo: 'Gas calentado de 300 K a 400 K en un cilindro horizontal', tipo: 'MEXT', anio: '2007 1-(3)', montaje: 'cilindro',
    nota: 'A presión atmosférica constante, el trabajo del gas es P·ΔV = P·V·(T₂/T₁ − 1). El gas de la escena es monoatómico; el trabajo no depende de eso.',
    variables: { P0: cte('P', 100, 'kPa', { sub: '0' }), V0: vari('V', 6, 2, 10, 0.1, 'L', { sub: '1' }), T0: vari('T', 300, 250, 350, 1, 'K', { sub: '1' }), T2: vari('T', 400, 310, 500, 1, 'K', { sub: '2' }), A: vari('A', 200, 100, 400, 10, 'cm²'), Fc: vari('Φ', 50, 10, 200, 5, 'W', { sub: 'cal' }), g: VAR_CIL().g },
    modelo: 'cuasiestatico', especie: 'mono', geo: { ...GEO_BASE, Hc: 0.92, hMax: 0.84, tanque: false, angulo: 90 }, duracion: 14,
    construir: v => ({ n: v.P0 * v.V0 / (R * v.T0), A: v.A * 1e-4, P0: v.P0 * 1e3, T0: v.T0, g: v.g, m: 10, M: 0, Fc: v.Fc, G: 6, b: 300, angulo: 90 }),
    guion: v => { const n = v.P0 * v.V0 / (R * v.T0); return [ADIAB0, { t: 1, tipo: 'calentador', valor: true }, { t: 1 + n * 2.5 * R * (v.T2 - v.T0) / v.Fc, tipo: 'calentador', valor: false }]; },
    examen: (sim, v) => {
      const q = ultima(sim);
      return [
        { n: '', etq: `${S('T', '2')}`, valor: q.T, esperado: v.T2, u: 'K', formula: 'T₂', t: sim.duracion, tol: 1e-4 },
        { n: '(3)', etq: S('W'), valor: q.W, esperado: v.P0 * 1e3 * v.V0 * 1e-3 * (v.T2 / v.T0 - 1), u: 'J', formula: 'P·V·(T₂/T₁ − 1)', opcion: '(d)', t: sim.duracion, tol: 1e-4 },
      ];
    },
  },
  {
    clave: 'mext-2006-p4', titulo: 'Un mol de aire calentado 1 K a presión constante', tipo: 'MEXT', anio: '2006 P4', montaje: 'cilindro',
    nota: 'Aire (diatómico) en un recipiente adiabático con émbolo libre. El calentador, de fem E y resistencia R₀, da E²/R₀; se apaga cuando la temperatura ha subido 1 K.',
    variables: { n: cte('n', 1, 'mol'), E: vari('E', 10, 2, 40, 0.5, 'V'), R0: vari('R', 5, 1, 20, 0.5, 'Ω', { sub: '0' }), m: VAR_CIL().m, A: VAR_CIL().A, P0: VAR_CIL().P0, T0: VAR_CIL().T0, g: VAR_CIL().g },
    modelo: 'cuasiestatico', especie: 'di', geo: { ...GEO_BASE, tanque: false }, duracion: 6,
    construir: v => ({ ...gasDe({ ...v, M: 0, G: 6, b: 300 }), Fc: v.E ** 2 / v.R0, especie: 'di' }),
    guion: v => [ADIAB0, { t: 1, tipo: 'calentador', valor: true }, { t: 1 + 3.5 * R * v.n * 1 / (v.E ** 2 / v.R0), tipo: 'calentador', valor: false }],
    examen: (sim, v) => {
      const q0 = sim.muestras[0], q = ultima(sim), dT = q.T - q0.T, C = q.Qcal / (v.n * dT);
      return [
        { n: '', etq: `Δ${S('T')}`, valor: dT, esperado: 1, u: 'K', formula: '1 K', t: sim.duracion, tol: 1e-4 },
        { n: '(1)', etq: `${S('W')}<sub class="r">émbolo</sub>`, valor: -q.W, esperado: -R * v.n * 1, u: 'J', formula: '−R × 1 mol × 1 K', opcion: '(a)', t: sim.duracion, tol: 1e-4 },
        { n: '(2)', etq: S('Q'), valor: q.Qcal, esperado: 3.5 * R * v.n * 1, u: 'J', formula: 'C × 1 mol × 1 K', opcion: '(c)', t: sim.duracion, tol: 1e-4 },
        { n: '(3)', etq: `${S('C')}/${S('R')}`, valor: C / R, esperado: 3.5, u: '', formula: 'C > R', opcion: '(a)', t: sim.duracion, tol: 1e-4 },
        { n: '(4)', etq: S('Φ', 'cal'), valor: v.E ** 2 / v.R0, esperado: v.E ** 2 / v.R0, u: 'W', formula: 'E²/R₀', opcion: '(d)', t: 1 },
      ];
    },
  },
  {
    clave: 'mext-2012-1-3', titulo: 'Cilindro inclinado con el gas sobre el émbolo', tipo: 'MEXT', anio: '2012 1-(3)', montaje: 'cilindro',
    nota: 'El cilindro está cerrado arriba y abierto abajo, inclinado θ respecto de la vertical: el peso del émbolo tira hacia fuera con M·g·cos θ y el gas queda por debajo de la atmósfera.',
    variables: { th: vari('θ', 30, 0, 80, 1, '°'), m: vari('M', 50, 5, 150, 1, 'kg'), A: vari('S', 500, 300, 800, 10, 'cm²'), n: VAR_CIL().n, P0: vari('p', 101.3, 80, 120, 0.1, 'kPa', { sub: '0' }), T0: VAR_CIL().T0, g: VAR_CIL().g },
    modelo: 'cuasiestatico', especie: 'mono', geo: { ...GEO_BASE, tanque: false, simEmbolo: 'M', anguloDe: v => 180 - v.th }, duracion: 4,
    construir: v => ({ ...gasDe({ ...v, M: 0, G: 6, b: 300 }), angulo: 180 - v.th }),
    guion: () => [],
    examen: (sim, v) => [
      { n: '(3)', etq: S('p'), valor: sim.muestras[0].P / 1e3, esperado: (v.P0 * 1e3 - v.m * v.g * Math.cos(v.th * Math.PI / 180) / (v.A * 1e-4)) / 1e3, u: 'kPa', formula: 'p₀ − (Mg/S)·cos θ', opcion: '(f)', t: 0, tol: 1e-9 },
    ],
  },
  {
    clave: 'mext-2009-1-4', titulo: 'Cilindro que se da la vuelta a temperatura constante', tipo: 'MEXT', anio: '2009 1-(4)', montaje: 'cilindro',
    nota: 'Las paredes conducen y el aire de fuera fija la temperatura. Al girar el cilindro 180° el peso del émbolo deja de comprimir el gas y tira de él: el volumen se duplica si p = 3Mg/S.',
    variables: { n: vari('n', 0.25, 0.1, 0.4, 0.01, 'mol'), A: vari('S', 200, 100, 400, 10, 'cm²'), P0: vari('p', 101.3, 80, 120, 0.1, 'kPa'), T0: VAR_CIL().T0, G: vari('G', 20, 2, 40, 1, 'W/K'), g: VAR_CIL().g },
    modelo: 'cuasiestatico', especie: 'mono', geo: { ...GEO_BASE, Hc: 0.62, hMax: 0.56, tanque: false, simEmbolo: 'M' }, duracion: 12, opciones: { tauGiro: 6 },
    construir: v => ({ ...gasDe({ ...v, M: 0, b: 300 }), m: v.P0 * 1e3 * v.A * 1e-4 / (3 * v.g) }),
    guion: () => [{ t: 1, tipo: 'giro', valor: 180 }],
    examen: (sim, v) => [
      { n: '', etq: `${S('V', '2')}/${S('V', '1')}`, valor: ultima(sim).V / sim.muestras[0].V, esperado: 2, u: '', formula: '2', t: sim.duracion, tol: 1e-6 },
      { n: '(4)', etq: S('p'), valor: v.P0, esperado: 3 * sim.m * v.g / (v.A * 1e-4) / 1e3, u: 'kPa', formula: '3Mg/S', opcion: '(a)', t: sim.duracion, tol: 1e-9 },
    ],
  },
];

// ===========================================================================
// Laboratorio de gases · recipientes conectados, globo y burbuja
// ===========================================================================
const MONO = [{ nombre: 'Gas monoatómico', f: 3, M: 0.004 }];
const nDe = (P, V, T) => P * V / (R * T);

const ESCENAS_RECIPIENTES = [
  {
    clave: 'mezcla', titulo: 'Mezcla de dos gases a distinta temperatura', tipo: 'Ejemplo', montaje: 'recipientes', nombres: ['A', 'B'],
    nota: 'Helio frío y nitrógeno caliente en dos recipientes aislados. Al abrir la válvula se mezclan: la energía interna total se conserva, T final = Σn·Cv·T / Σn·Cv, y la entropía crece.',
    variables: { TA: vari('T', 300, 200, 600, 5, 'K', { sub: 'A' }), TB: vari('T', 500, 200, 800, 5, 'K', { sub: 'B' }), nA: vari('n', 1, 0.2, 2, 0.1, 'mol', { sub: 'A' }), nB: vari('n', 1, 0.2, 2, 0.1, 'mol', { sub: 'B' }) },
    duracion: 10,
    construir: v => ({ especies: [{ nombre: 'He', f: 3, M: 0.004 }, { nombre: 'N₂', f: 5, M: 0.028 }], compartimientos: [{ V: 0.02, n: [v.nA, 0], T: v.TA }, { V: 0.02, n: [0, v.nB], T: v.TB }], separadores: [{ tipo: 'valvula', tau: 0.5 }] }),
    guion: () => [{ t: 1, tipo: 'valvula', i: 0, valor: true }],
    extra: (s, sim, v) => [[`${S('T')}<sub class="r">eq</sub>`, (1.5 * v.nA * v.TA + 2.5 * v.nB * v.TB) / (1.5 * v.nA + 2.5 * v.nB), 'K', 'Σn·Cv·T/Σn·Cv|Equilibrium temperature']],
  },
  {
    clave: 'mext-2016-p4', titulo: 'Dos recipientes a distinta presión y temperatura', tipo: 'MEXT', anio: '2016 P4', montaje: 'recipientes', nombres: ['A', 'B'],
    nota: 'A: presión P y temperatura T; B: 2P y 3T, mismo volumen V, gas monoatómico. Al abrir la llave, la energía interna total se conserva.',
    variables: { P: vari('P', 100, 50, 200, 1, 'kPa'), T: vari('T', 300, 200, 400, 1, 'K'), V: vari('V', 10, 2, 20, 0.5, 'L') },
    duracion: 20,
    construir: v => { const P = v.P * 1e3, V = v.V * 1e-3; return { especies: MONO, compartimientos: [{ V, n: [nDe(P, V, v.T)], T: v.T }, { V, n: [nDe(2 * P, V, 3 * v.T)], T: 3 * v.T }], separadores: [{ tipo: 'valvula', tau: 0.5 }] }; },
    guion: () => [{ t: 1, tipo: 'valvula', i: 0, valor: true }],
    examen: (sim, v) => {
      const m0 = sim.muestras[0], q = ultima(sim), P = v.P * 1e3, V = v.V * 1e-3;
      return [
        { n: '(1)', etq: S('n', 'A'), valor: m0.n[0], esperado: P * V / (R * v.T), u: 'mol', formula: 'PV/(RT)', opcion: '(e)', t: 0, tol: 1e-12 },
        { n: '(2)', etq: `${S('n', 'B')}/${S('n', 'A')}`, valor: m0.n[1] / m0.n[0], esperado: 2 / 3, u: '', formula: '2/3', opcion: '(f)', t: 0, tol: 1e-12 },
        { n: '(3)', etq: `${S('U', 'B')}/${S('U', 'A')}`, valor: m0.U[1] / m0.U[0], esperado: 2, u: '', formula: '2', opcion: '(c)', t: 0, tol: 1e-12 },
        { n: '(4)', etq: S('T', 'final'), valor: q.T[0], esperado: 9 / 5 * v.T, u: 'K', formula: '9T/5', opcion: '(f)', t: sim.duracion, tol: 1e-5 },
        { n: '(5)', etq: S('P', 'final'), valor: q.P[0] / 1e3, esperado: 1.5 * v.P, u: 'kPa', formula: '3P/2', opcion: '(g)', t: sim.duracion, tol: 1e-5 },
      ];
    },
  },
  {
    clave: 'mext-2015-1-3', titulo: 'Expansión adiabática hacia el vacío', tipo: 'MEXT', anio: '2015 1-(3)', montaje: 'recipientes', nombres: ['V', 'V′'],
    nota: 'El gas se expande hacia el vacío sin hacer trabajo ni recibir calor: U y T no cambian (gas ideal) y P·V se conserva.',
    variables: { P: vari('P', 100, 50, 200, 1, 'kPa'), V: vari('V', 10, 2, 20, 0.5, 'L'), V2: vari('V', 15, 2, 30, 0.5, 'L', { sub: '′' }), T: VAR_CIL().T0 },
    duracion: 20,
    construir: v => ({ especies: MONO, compartimientos: [{ V: v.V * 1e-3, n: [nDe(v.P * 1e3, v.V * 1e-3, v.T)], T: v.T }, { V: v.V2 * 1e-3, n: [0], T: v.T }], separadores: [{ tipo: 'valvula', tau: 0.5 }] }),
    guion: () => [{ t: 1, tipo: 'valvula', i: 0, valor: true }],
    examen: (sim, v) => [
      { n: '(3)', etq: S('P', 'final'), valor: ultima(sim).P[0] / 1e3, esperado: v.V / (v.V + v.V2) * v.P, u: 'kPa', formula: 'V/(V + V′)·P', opcion: '(a)', t: sim.duracion, tol: 1e-5 },
      { n: '', etq: S('T', 'final'), valor: ultima(sim).T[0], esperado: v.T, u: 'K', formula: 'T (no cambia)', t: sim.duracion, tol: 1e-5 },
    ],
  },
  {
    clave: 'mext-2027-p4-1', titulo: 'Gas calentado de T a 2T con la válvula cerrada', tipo: 'MEXT', anio: '2027 P4-(1)', montaje: 'recipientes', nombres: ['1', '2'],
    nota: 'Recipiente 1 (V) con gas monoatómico a P y T; el recipiente 2 (2V) está vacío. Con la válvula cerrada, el calentador (con termostato) lo lleva a 2T a volumen constante.',
    variables: { P: vari('P', 100, 50, 200, 1, 'kPa'), T: VAR_CIL().T0, V: vari('V', 10, 2, 20, 0.5, 'L'), Fc: vari('Φ', 200, 50, 800, 10, 'W', { sub: 'cal' }) },
    duracion: 16,
    construir: v => ({ especies: MONO, compartimientos: [{ V: v.V * 1e-3, n: [nDe(v.P * 1e3, v.V * 1e-3, v.T)], T: v.T, Fc: v.Fc, Tobj: 2 * v.T }, { V: 2 * v.V * 1e-3, n: [0], T: v.T }], separadores: [{ tipo: 'valvula', tau: 0.5 }] }),
    guion: () => [{ t: 1, tipo: 'calentador', i: 0, valor: true }],
    examen: (sim, v) => {
      const m0 = sim.muestras[0], q = ultima(sim);
      return [
        { n: '(1)', etq: `${S('U', '2')}/${S('U', '1')}`, valor: q.U[0] / m0.U[0], esperado: 2, u: '', formula: '2', t: sim.duracion, tol: 1e-4 },
        { n: '(2)', etq: `Δ${S('P')}`, valor: (q.P[0] - m0.P[0]) / 1e3, esperado: v.P, u: 'kPa', formula: 'P (de P a 2P)', t: sim.duracion, tol: 1e-4 },
      ];
    },
  },
  {
    clave: 'mext-2027-p4-3', titulo: 'Abrir la válvula hacia el recipiente vacío', tipo: 'MEXT', anio: '2027 P4-(3)', montaje: 'recipientes', nombres: ['1', '2'],
    nota: 'Desde el estado 1, con los recipientes aislados: expansión libre de V a 3V. La temperatura no cambia y la presión baja a P/3.',
    variables: { P: vari('P', 100, 50, 200, 1, 'kPa'), T: VAR_CIL().T0, V: vari('V', 10, 2, 20, 0.5, 'L') },
    duracion: 20,
    construir: v => ({ especies: MONO, compartimientos: [{ V: v.V * 1e-3, n: [nDe(v.P * 1e3, v.V * 1e-3, v.T)], T: v.T }, { V: 2 * v.V * 1e-3, n: [0], T: v.T }], separadores: [{ tipo: 'valvula', tau: 0.5 }] }),
    guion: () => [{ t: 1, tipo: 'valvula', i: 0, valor: true }],
    examen: (sim, v) => [
      { n: '(3)', etq: S('P', 'final'), valor: ultima(sim).P[0] / 1e3, esperado: v.P / 3, u: 'kPa', formula: 'P/3', t: sim.duracion, tol: 1e-5 },
      { n: '', etq: S('T', 'final'), valor: ultima(sim).T[1], esperado: v.T, u: 'K', formula: 'T', t: sim.duracion, tol: 1e-5 },
    ],
  },
  {
    clave: 'mext-2027-p4-4', titulo: 'Abrir la válvula hacia gas a P/2 y 2T', tipo: 'MEXT', anio: '2027 P4-(4)', montaje: 'recipientes', nombres: ['1', '2'],
    nota: 'Ahora el recipiente 2 (2V) tiene el mismo gas a P/2 y 2T: N₂ = N₁/2. Al abrir, aislados, la energía se conserva: P final = 2P/3 y T final = 4T/3.',
    variables: { P: vari('P', 100, 50, 200, 1, 'kPa'), T: VAR_CIL().T0, V: vari('V', 10, 2, 20, 0.5, 'L') },
    duracion: 20,
    construir: v => { const P = v.P * 1e3, V = v.V * 1e-3; return { especies: MONO, compartimientos: [{ V, n: [nDe(P, V, v.T)], T: v.T }, { V: 2 * V, n: [nDe(P / 2, 2 * V, 2 * v.T)], T: 2 * v.T }], separadores: [{ tipo: 'valvula', tau: 0.5 }] }; },
    guion: () => [{ t: 1, tipo: 'valvula', i: 0, valor: true }],
    examen: (sim, v) => {
      const m0 = sim.muestras[0], q = ultima(sim);
      return [
        { n: '', etq: `${S('N', '2')}/${S('N', '1')}`, valor: m0.n[1] / m0.n[0], esperado: 0.5, u: '', formula: '1/2', t: 0, tol: 1e-12 },
        { n: '(4)', etq: S('P', 'final'), valor: q.P[0] / 1e3, esperado: 2 / 3 * v.P, u: 'kPa', formula: '2P/3', t: sim.duracion, tol: 1e-5 },
        { n: '', etq: S('T', 'final'), valor: q.T[0], esperado: 4 / 3 * v.T, u: 'K', formula: '4T/3', t: sim.duracion, tol: 1e-5 },
      ];
    },
  },
  {
    clave: 'mext-2023-1-4', titulo: 'Émbolo entre dos gases: uno se calienta', tipo: 'MEXT', anio: '2023 1-(4)', montaje: 'recipientes', nombres: ['A', 'B'],
    nota: 'Émbolo libre entre A y B (largo L cada uno, p₀ y T₀). A sigue a T₀ en su baño; B pasa a un baño a T > T₀. Las presiones se igualan y el émbolo se desplaza hacia A.',
    variables: { T: vari('T', 450, 310, 700, 5, 'K'), T0: vari('T', 300, 250, 350, 1, 'K', { sub: '0' }), L: vari('L', 20, 10, 30, 1, 'cm'), P: vari('p', 100, 50, 200, 1, 'kPa', { sub: '0' }) },
    duracion: 15, seccion: 0.01,
    construir: v => { const V = v.L * 1e-2 * 0.01, n = nDe(v.P * 1e3, V, v.T0); return { especies: MONO, compartimientos: [{ V, n: [n], T: v.T0, Tb: v.T0, Gb: 2 }, { V, n: [n], T: v.T0, Tb: v.T, Gb: 2, bano: false }], separadores: [{ tipo: 'embolo' }] }; },
    guion: () => [{ t: 1, tipo: 'bano', i: 1, valor: true }],
    examen: (sim, v) => [
      { n: '(4)', etq: `Δ${S('x')} (hacia A)`, valor: (ultima(sim).V[1] - sim.muestras[0].V[1]) / 0.01 * 100, esperado: v.L * (v.T - v.T0) / (v.T + v.T0), u: 'cm', formula: 'L(T − T₀)/(T + T₀), A ← B', opcion: '(d)', t: sim.duracion, tol: 1e-5 },
    ],
  },
  {
    clave: 'mext-2010-2-b', titulo: 'Émbolo entre dos gases: uno con calentador', tipo: 'MEXT', anio: '2010 2-B', montaje: 'recipientes', nombres: ['A', 'B'],
    nota: 'A y B miden 10 cm, a 0 °C y 1.0 × 10⁵ Pa. B toca un baño a 0 °C; el calentador (con termostato) lleva A a 57 °C. El émbolo no conduce calor.',
    variables: { TA: vari('T', 57, 10, 150, 1, '°C', { sub: 'A' }), L: vari('L', 10, 5, 20, 0.5, 'cm'), Fc: vari('Φ', 5, 1, 20, 0.5, 'W', { sub: 'cal' }) },
    duracion: 30, seccion: 0.01,
    construir: v => { const V = v.L * 1e-2 * 0.01, n = nDe(1e5, V, K0); return { especies: MONO, compartimientos: [{ V, n: [n], T: K0, Fc: v.Fc, Tobj: K0 + v.TA }, { V, n: [n], T: K0, Tb: K0, Gb: 2 }], separadores: [{ tipo: 'embolo' }] }; },
    guion: () => [{ t: 1, tipo: 'calentador', i: 0, valor: true }],
    examen: (sim, v) => [
      { n: 'Q2', etq: `Δ${S('x')}`, valor: (ultima(sim).V[0] - sim.muestras[0].V[0]) / 0.01 * 100, esperado: v.L * v.TA / (2 * K0 + v.TA), u: 'cm', formula: 'L·(T_A − T_B)/(T_A + T_B) ≈ 1 cm', opcion: '(c)', t: sim.duracion, tol: 1e-4 },
    ],
  },
  // ------------------------------------------------- recipiente abierto
  {
    clave: 'mext-2020-p4', titulo: 'Globo aerostático', tipo: 'MEXT', anio: '2020 P4', montaje: 'abierto',
    nota: 'La bolsa está abierta por abajo: dentro hay la presión de fuera. Al calentar, sale aire y baja la densidad; el globo despega cuando la flotación iguala al peso de la estructura más el aire de dentro.',
    variables: { M: vari('M', 500, 100, 1000, 10, 'kg'), V: vari('V', 3000, 1000, 5000, 100, 'm³'), P: vari('P', 100, 80, 110, 1, 'kPa'), T0: vari('T', 300, 260, 320, 1, 'K', { sub: '0' }), m: cte('m', 29, 'g/mol'), Fc: vari('Φ', 5, 1, 10, 0.5, 'MW', { sub: 'q' }) },
    duracion: 90,
    construir: v => ({ V: v.V, P0: v.P * 1e3, T0: v.T0, Mm: v.m * 1e-3, M: v.M, Fc: v.Fc * 1e6, Tobj: Math.min(450, temperaturaDespegue({ Mm: v.m * 1e-3, P0: v.P * 1e3, V: v.V, T0: v.T0, M: v.M }) * 1.03 + 1), H: R * v.T0 / (v.m * 1e-3 * G9), CdA: 100, g: G9 }),
    guion: () => [{ t: 1, tipo: 'calentador', valor: true }],
    examen: (sim, v) => {
      const e = sim.e, d = sim.eventos.find(x => x.tipo === 'despegue'), td = d ? d.t : sim.duracion;
      const s = sim.muestras[Math.min(sim.muestras.length - 1, Math.floor(td / sim.muestra))];
      const T1 = temperaturaDespegue({ Mm: e.Mm, P0: e.P0, V: e.V, T0: e.T0, M: e.M });
      return [
        { n: '(1)', etq: `${S('ρ')}<sub class="r">dentro</sub>`, valor: s.rhoIn, esperado: e.Mm * e.P0 / (R * s.T), u: 'kg/m³', formula: 'mP/(RT)', opcion: '(b)', t: td, tol: 1e-9 },
        { n: '(2)', etq: S('F', 'B'), valor: s.B, esperado: e.P0 * e.V * e.Mm * e.g / (R * e.T0), u: 'N', formula: 'PVmg/(RT₀)', opcion: '(b)', t: 0, tol: 1e-9 },
        { n: '(3)', etq: S('T', '1'), valor: d ? d.T : NaN, esperado: T1, u: 'K', formula: 'mPVT₀/(mPV − MRT₀)', opcion: '(a)', t: td, tol: 1e-4 },
        { n: '(4)', etq: `${S('T', '1')} (datos)`, valor: d ? d.T : NaN, esperado: 350, u: 'K', formula: '≈ 3.5 × 10² K', opcion: '(d)', t: td, tol: 0.01 },
      ];
    },
  },
  {
    clave: 'mext-2014-1-3', titulo: 'Aire que sale de una habitación al calentarla', tipo: 'MEXT', anio: '2014 1-(3)', montaje: 'abierto',
    nota: 'La habitación (100 m³) está a presión constante: al calentar el aire de 270 K a 300 K, parte sale por las rendijas. m_sale = ρV·(1 − T₁/T₂).',
    variables: { V: vari('V', 100, 20, 300, 5, 'm³'), T0: vari('T', 270, 250, 290, 1, 'K', { sub: '1' }), T2: vari('T', 300, 280, 330, 1, 'K', { sub: '2' }), rho: cte('ρ', 1.3, 'kg/m³'), Fc: vari('Φ', 100, 20, 400, 10, 'kW', { sub: 'cal' }) },
    duracion: 60,
    construir: v => ({ V: v.V, P0: 1e5, T0: v.T0, Mm: v.rho * R * v.T0 / 1e5, Fc: v.Fc * 1e3, Tobj: v.T2, g: G9 }),
    guion: () => [{ t: 1, tipo: 'calentador', valor: true }],
    examen: (sim, v) => [
      { n: '(3)', etq: S('m', 'sale'), valor: ultima(sim).mSale, esperado: v.rho * v.V * (1 - v.T0 / v.T2), u: 'kg', formula: 'ρV(1 − T₁/T₂) ≈ 13 kg', opcion: '(c)', t: sim.duracion, tol: 1e-3 },
    ],
  },
  {
    clave: 'mext-2008-1-3', titulo: 'Burbuja que sube desde 50 m de profundidad', tipo: 'MEXT', anio: '2008 1-(3)', montaje: 'burbuja',
    nota: 'La presión crece 1 atm cada 10 m. La burbuja sube despacio y toma la temperatura del agua (17 °C abajo, 27 °C arriba): P·V/T se conserva.',
    variables: { V0: vari('V', 1, 0.5, 3, 0.1, 'cm³', { sub: '0' }), prof: vari('d', 50, 10, 80, 1, 'm'), Tf: vari('T', 17, 0, 30, 1, '°C', { sub: 'fondo' }), Ts: vari('T', 27, 0, 35, 1, '°C', { sub: 'sup' }) },
    duracion: 57.5,
    construir: v => ({ V0: v.V0 * 1e-6, prof: v.prof, P0: 101325, rho: 101325 / (10 * G9), g: G9, Tfondo: K0 + v.Tf, Tsup: K0 + v.Ts, rapidez: 1, f: 5 }),
    examen: (sim, v) => [
      { n: '(3)', etq: S('V', 'sup'), valor: ultima(sim).V * 1e6, esperado: v.V0 * (1 + v.prof / 10) * (K0 + v.Ts) / (K0 + v.Tf), u: 'cm³', formula: 'V₀·(P₀ + ρgd)/P₀·T_sup/T_fondo ≈ 6.2 cm³', opcion: '(f)', t: v.prof, tol: 1e-9 },
    ],
  },
];

export const ESCENAS_LAB = [...ESCENAS_CILINDRO, ...ESCENAS_RECIPIENTES].map(e => ({ espacio: 'laboratorio-de-gases', ...e }));

// ===========================================================================
// Ciclos y diagrama P-V (motores/ciclos.js)
// ===========================================================================
const kPa = 1e3, L = 1e-3;
/** Escala simbólica de los ejes (p₀, V₀) para los problemas del examen. */
const simbolos = (P0, V0, p = 'p', V = 'V') => ({ P: P0, V: V0, p, v: V });

/** Calor, trabajo y ΔU de un tramo en unidades de p₀V₀. */
const enPV = (x, P0V0) => x / P0V0;

const ESCENAS_CICLOS_BASE = [
  {
    clave: 'rectangular', titulo: 'Un ciclo rectangular en el diagrama P-V', tipo: 'Tutorial',
    nota: 'Dos isócoras y dos isobaras. El trabajo neto es el área encerrada; el gas absorbe calor al subir la presión y al expandirse, y lo cede en los otros dos tramos.',
    variables: { P1: vari('P', 100, 50, 300, 5, 'kPa', { sub: '1' }), P2: vari('P', 200, 60, 400, 5, 'kPa', { sub: '2' }), V1: vari('V', 10, 2, 30, 0.5, 'L', { sub: '1' }), V2: vari('V', 20, 3, 40, 0.5, 'L', { sub: '2' }), n: vari('n', 0.5, 0.1, 2, 0.05, 'mol') },
    construir: v => cicloRectangular({ n: v.n, f: 3, P1: v.P1 * kPa, P2: v.P2 * kPa, V1: v.V1 * L, V2: v.V2 * L }),
  },
  {
    clave: 'dibujar', titulo: 'Dibuja tu propio ciclo', tipo: 'Tutorial', editable: true,
    nota: 'Elige un proceso en la paleta y haz clic en el diagrama: el tramo sale del último estado. «Cerrar el ciclo» vuelve al estado A con una recta.',
    variables: { n: vari('n', 0.5, 0.1, 2, 0.05, 'mol') },
    construir: v => ({ n: v.n, f: 3, inicio: { P: 100 * kPa, V: 10 * L, nombre: 'A' }, tramos: [{ tipo: 'isobarico', V: 25 * L }, { tipo: 'isocorico', P: 250 * kPa }] }),
  },
  {
    clave: 'carnot', titulo: 'Ciclo de Carnot', tipo: 'Ejemplo',
    nota: 'Dos isotermas y dos adiabáticas: el rendimiento solo depende de las temperaturas de los focos, η = 1 − T_c/T_h, y es el mayor posible entre ellas.',
    variables: { Th: vari('T', 600, 350, 1000, 10, 'K', { sub: 'h' }), Tc: vari('T', 300, 200, 500, 10, 'K', { sub: 'c' }), V1: vari('V', 10, 5, 20, 0.5, 'L', { sub: '1' }), V2: vari('V', 20, 10, 40, 0.5, 'L', { sub: '2' }) },
    construir: v => cicloCarnot({ n: 1, f: 3, Th: v.Th, Tc: Math.min(v.Tc, v.Th - 10), V1: v.V1 * L, V2: Math.max(v.V2, v.V1 + 1) * L }),
    extra: (sim, v) => [[`1 − ${S('T', 'c')}/${S('T', 'h')}`, rendimientoCarnot(Math.min(v.Tc, v.Th - 10), v.Th), '', 'Rendimiento de Carnot|Carnot efficiency']],
  },
  {
    clave: 'otto', titulo: 'Ciclo Otto', tipo: 'Ejemplo',
    nota: 'Motor de gasolina ideal: compresión adiabática, combustión a volumen constante, expansión adiabática y escape a volumen constante. η = 1 − r^(1−γ).',
    variables: { r: vari('r', 8, 2, 14, 0.5, ''), T1: vari('T', 300, 250, 350, 5, 'K', { sub: '1' }), T3: vari('T', 1500, 800, 2500, 50, 'K', { sub: '3' }) },
    construir: v => cicloOtto({ n: 0.02, f: GRADOS.di, V1: 0.5 * L, r: v.r, T1: v.T1, T3: Math.max(v.T3, v.T1 * v.r ** 0.4 + 50) }),
    extra: (sim, v) => [[`1 − ${S('r')}<sup>1−γ</sup>`, rendimientoOtto(v.r, 1.4), '', 'Rendimiento del ciclo Otto|Otto efficiency']],
  },
  // ----------------------------------------------------------------- MEXT
  {
    clave: 'mext-2018-p4', titulo: 'Ciclo rectangular de un mol', tipo: 'MEXT', anio: '2018 P4',
    nota: 'A → B a V₀ (P₀ → 4P₀), B → C a 4P₀ (V₀ → 4V₀), C → D a 4V₀ y D → A a P₀. Gas monoatómico, Cv = 3R/2.',
    variables: { P0: vari('P', 100, 50, 200, 5, 'kPa', { sub: '0' }), V0: vari('V', 10, 2, 20, 0.5, 'L', { sub: '0' }) },
    simbolos: v => simbolos(v.P0 * kPa, v.V0 * L, 'P'),
    construir: v => cicloRectangular({ n: 1, f: 3, P1: v.P0 * kPa, P2: 4 * v.P0 * kPa, V1: v.V0 * L, V2: 4 * v.V0 * L }),
    examen: (sim, v) => {
      const k = v.P0 * kPa * v.V0 * L, tr = sim.tramos;
      return [
        { n: '(1)', etq: `${S('Q')}<sub class="r">AB</sub>/${S('P', '0')}${S('V', '0')}`, valor: enPV(tr[0].Q, k), esperado: 4.5, u: '', formula: '9P₀V₀/2', opcion: '(e)', t: tr[0].t1 },
        { n: '(2)', etq: `${S('Q')}<sub class="r">BC</sub>/${S('P', '0')}${S('V', '0')}`, valor: enPV(tr[1].Q, k), esperado: 30, u: '', formula: '30P₀V₀', opcion: '(c)', t: tr[1].t1 },
        { n: '(3)', etq: `${S('W')}/${S('P', '0')}${S('V', '0')}`, valor: enPV(sim.total.W, k), esperado: 9, u: '', formula: '9P₀V₀', opcion: '(f)', t: sim.duracion },
        { n: '(4)', etq: S('η'), valor: sim.rendimiento, esperado: 6 / 23, u: '', formula: '6/23', opcion: '(d)', t: sim.duracion },
      ];
    },
  },
  {
    clave: 'mext-2017-p4', titulo: 'Ciclo con una isoterma a T₀', tipo: 'MEXT', anio: '2017 P4',
    nota: 'A (p₀, V₀) → B isócoro hasta 3p₀ → C isotermo a T₀ hasta 3V₀ (absorbe Q₀) → A isóbaro. Un mol de gas monoatómico.',
    variables: { P0: vari('p', 100, 50, 200, 5, 'kPa', { sub: '0' }), V0: vari('V', 10, 2, 20, 0.5, 'L', { sub: '0' }) },
    simbolos: v => simbolos(v.P0 * kPa, v.V0 * L),
    construir: v => ({ n: 1, f: 3, inicio: { P: v.P0 * kPa, V: v.V0 * L, nombre: 'A' }, tramos: [{ tipo: 'isocorico', P: 3 * v.P0 * kPa, nombre: 'B' }, { tipo: 'isotermico', V: 3 * v.V0 * L, nombre: 'C' }, { tipo: 'isobarico', hasta: 'A' }] }),
    examen: sim => {
      const T0 = sim.estados.B.T, tr = sim.tramos, RT0 = R * T0;
      return [
        { n: '(1)', etq: `${S('T', 'A')}/${S('T', '0')}`, valor: sim.estados.A.T / T0, esperado: 1 / 3, u: '', formula: 'T₀/3', opcion: '(b)', t: 0 },
        { n: '(2)', etq: `${S('Q')}<sub class="r">AB</sub>/${S('R')}${S('T', '0')}`, valor: tr[0].Q / RT0, esperado: 1, u: '', formula: 'RT₀', opcion: '(f)', t: tr[0].t1 },
        { n: '(3)', etq: `${S('W')}<sub class="r">BC</sub>/${S('Q', '0')}`, valor: tr[1].W / tr[1].Q, esperado: 1, u: '', formula: 'Q₀', opcion: '(i)', t: tr[1].t1 },
        { n: '(4)', etq: `${S('W')}<sub class="r">CA</sub>/${S('R')}${S('T', '0')}`, valor: tr[2].W / RT0, esperado: -2 / 3, u: '', formula: '−2RT₀/3', opcion: '(c)', t: tr[2].t1 },
        { n: '(5)', etq: `${S('W')} = ${S('Q')}`, valor: sim.total.W, esperado: sim.total.Q, u: 'J', formula: 'W > 0, Q > 0', opcion: '(a)', t: sim.duracion, tol: 1e-9 },
      ];
    },
  },
  {
    clave: 'mext-2014-p4', titulo: 'Ciclo rectangular recorrido al revés', tipo: 'MEXT', anio: '2014 P4',
    nota: 'A (p₀, V₀) → B (p₀, 3V₀) → C (4p₀, 3V₀) → D (4p₀, V₀) → A. Recorrido en sentido antihorario: el trabajo neto del gas es negativo y el gas cede calor.',
    variables: { P0: vari('p', 100, 50, 200, 5, 'kPa', { sub: '0' }), V0: vari('V', 10, 2, 20, 0.5, 'L', { sub: '0' }) },
    simbolos: v => simbolos(v.P0 * kPa, v.V0 * L),
    construir: v => ({ n: 1, f: 3, inicio: { P: v.P0 * kPa, V: v.V0 * L, nombre: 'A' }, tramos: [{ tipo: 'isobarico', V: 3 * v.V0 * L, nombre: 'B' }, { tipo: 'isocorico', P: 4 * v.P0 * kPa, nombre: 'C' }, { tipo: 'isobarico', V: v.V0 * L, nombre: 'D' }, { tipo: 'isocorico', hasta: 'A' }] }),
    examen: (sim, v) => {
      const k = v.P0 * kPa * v.V0 * L, tr = sim.tramos, imax = tr.reduce((b, x, i) => (x.Q > tr[b].Q ? i : b), 0);
      return [
        { n: '(1)', etq: `${S('T', 'A')}/${S('T', 'C')}`, valor: sim.estados.A.T / sim.estados.C.T, esperado: 1 / 12, u: '', formula: '1/12', opcion: '(a)', t: tr[1].t1 },
        { n: '(2)', etq: `${S('W')}<sub class="r">AB</sub>/${S('p', '0')}${S('V', '0')}`, valor: enPV(tr[0].W, k), esperado: 2, u: '', formula: '2p₀V₀', opcion: '(f)', t: tr[0].t1 },
        { n: '(3)', etq: 'Tramo de mayor calor', valor: imax, esperado: 1, u: '', formula: 'B → C', opcion: '(b)', t: sim.duracion, texto: `${tr[imax].desde} → ${tr[imax].hasta}` },
        { n: '(4)', etq: `${S('Q')}<sub class="r">BC</sub>/${S('p', '0')}${S('V', '0')}`, valor: enPV(tr[1].Q, k), esperado: 13.5, u: '', formula: '27p₀V₀/2', opcion: '(g)', t: tr[1].t1 },
        { n: '(5)', etq: `−${S('Q')}<sub class="r">neto</sub>/${S('p', '0')}${S('V', '0')}`, valor: enPV(-sim.total.Q, k), esperado: 6, u: '', formula: '6p₀V₀', opcion: '(f)', t: sim.duracion },
      ];
    },
  },
  {
    clave: 'mext-2020-1-5', titulo: 'Ciclo triangular: calor neto', tipo: 'MEXT', anio: '2020 1-(5)',
    nota: '(P₀, V₀) → (2P₀, V₀) → (2P₀, 2V₀) → vuelta a (P₀, V₀) por una recta. En un ciclo ΔU = 0: el calor neto es el trabajo neto, el área del triángulo.',
    variables: { P0: vari('P', 100, 50, 200, 5, 'kPa', { sub: '0' }), V0: vari('V', 10, 2, 20, 0.5, 'L', { sub: '0' }), n: vari('n', 0.5, 0.1, 2, 0.05, 'mol') },
    simbolos: v => simbolos(v.P0 * kPa, v.V0 * L, 'P'),
    construir: v => ({ n: v.n, f: 3, inicio: { P: v.P0 * kPa, V: v.V0 * L, nombre: 'A' }, tramos: [{ tipo: 'isocorico', P: 2 * v.P0 * kPa, nombre: 'B' }, { tipo: 'isobarico', V: 2 * v.V0 * L, nombre: 'C' }, { tipo: 'recta', hasta: 'A' }] }),
    examen: (sim, v) => [
      { n: '(5)', etq: `${S('Q')}<sub class="r">neto</sub>/${S('P', '0')}${S('V', '0')}`, valor: enPV(sim.total.Q, v.P0 * kPa * v.V0 * L), esperado: 0.5, u: '', formula: 'P₀V₀/2', opcion: '(b)', t: sim.duracion },
    ],
  },
  {
    clave: 'mext-2023-p4', titulo: 'Isoterma y adiabática desde el mismo estado', tipo: 'MEXT', anio: '2023 P4',
    nota: 'Desde a, el gas se expande de V₁ a V₂ de dos maneras: a → b a temperatura constante y a → c sin calor. En el diagrama V-T, a → b es vertical y a → c va hacia temperaturas menores.',
    variables: { Pa: vari('p', 300, 100, 500, 10, 'kPa', { sub: 'a' }), V1: vari('V', 10, 5, 20, 0.5, 'L', { sub: '1' }), V2: vari('V', 25, 10, 40, 0.5, 'L', { sub: '2' }) },
    construir: v => ({ n: 1, f: 3, inicio: { P: v.Pa * kPa, V: v.V1 * L, nombre: 'a' }, tramos: [{ tipo: 'isotermico', V: Math.max(v.V2, v.V1 + 1) * L, nombre: 'b' }, { tipo: 'adiabatico', V: Math.max(v.V2, v.V1 + 1) * L, desde: 'a', nombre: 'c' }] }),
    examen: (sim, v) => {
      const V2 = Math.max(v.V2, v.V1 + 1), tr = sim.tramos;
      return [
        { n: '(1)', etq: S('p', 'b'), valor: sim.estados.b.P / kPa, esperado: v.V1 / V2 * v.Pa, u: 'kPa', formula: '(V₁/V₂)·p_a', t: tr[0].t1, tol: 1e-12 },
        { n: '(2)', etq: `Δ${S('U')}<sub class="r">ab</sub>`, valor: tr[0].dU, esperado: 0, u: 'J', formula: 'a → b (isotermo): ΔU = 0', t: tr[0].t1, tol: 1e-9 },
        { n: '(3)', etq: `${S('T', 'b')}/${S('T', 'a')}`, valor: sim.estados.b.T / sim.estados.a.T, esperado: 1, u: '', formula: 'T constante: X₂ → X₁', t: tr[0].t1, tol: 1e-12 },
        { n: '(4)', etq: `${S('T', 'c')}/${S('T', 'a')}`, valor: sim.estados.c.T / sim.estados.a.T, esperado: (v.V1 / V2) ** (2 / 3), u: '', formula: '(V₁/V₂)^(γ−1) < 1: X₂ → Y₁', t: tr[1].t1, tol: 1e-12 },
      ];
    },
  },
  {
    clave: 'mext-2017-1-2', titulo: 'Calor para expandir un gas a presión constante', tipo: 'MEXT', anio: '2017 1-(2)',
    nota: 'Gas monoatómico de V₁ a V₂ a presión P: ΔU = 3P(V₂ − V₁)/2 y W = P(V₂ − V₁), así que Q = 5P(V₂ − V₁)/2.',
    variables: { P: vari('P', 100, 50, 300, 5, 'kPa'), V1: vari('V', 10, 2, 20, 0.5, 'L', { sub: '1' }), V2: vari('V', 20, 5, 40, 0.5, 'L', { sub: '2' }) },
    construir: v => ({ n: 0.4, f: 3, inicio: { P: v.P * kPa, V: v.V1 * L, nombre: 'A' }, tramos: [{ tipo: 'isobarico', V: Math.max(v.V2, v.V1 + 0.5) * L, nombre: 'B' }] }),
    examen: (sim, v) => [
      { n: '(2)', etq: `${S('Q')}/${S('P')}(${S('V', '2')} − ${S('V', '1')})`, valor: sim.tramos[0].Q / (v.P * kPa * (Math.max(v.V2, v.V1 + 0.5) - v.V1) * L), esperado: 2.5, u: '', formula: '5P(V₂ − V₁)/2', opcion: '(d)', t: sim.duracion },
    ],
  },
  {
    clave: 'mext-2016-1-2', titulo: 'Energía interna en una expansión a presión constante', tipo: 'MEXT', anio: '2016 1-(2)',
    nota: 'De 100 cm³ a 200 cm³ a 1.0 × 10⁵ Pa: ΔU = (3/2)·P·ΔV = 15 J para un gas monoatómico.',
    variables: { P: vari('P', 100, 50, 300, 5, 'kPa'), V1: vari('V', 100, 50, 300, 10, 'cm³', { sub: '1' }), V2: vari('V', 200, 60, 500, 10, 'cm³', { sub: '2' }) },
    construir: v => ({ n: 0.004, f: 3, inicio: { P: v.P * kPa, V: v.V1 * 1e-6, nombre: 'A' }, tramos: [{ tipo: 'isobarico', V: Math.max(v.V2, v.V1 + 10) * 1e-6, nombre: 'B' }] }),
    unidadV: 'cm³',
    examen: (sim, v) => [
      { n: '(2)', etq: `Δ${S('U')}`, valor: sim.tramos[0].dU, esperado: 1.5 * v.P * kPa * (Math.max(v.V2, v.V1 + 10) - v.V1) * 1e-6, u: 'J', formula: '(3/2)·P·ΔV = 15 J', opcion: '(c)', t: sim.duracion, tol: 1e-12 },
    ],
  },
  {
    clave: 'mext-2009-p4', titulo: 'Calores específicos del argón y del nitrógeno', tipo: 'MEXT', anio: '2009 P4', gasElegible: true,
    nota: 'Un mol se calienta 100 K a volumen constante (Q = n·c_v·ΔT) y otros 100 K a presión constante (Q = n·c_p·ΔT). Cambia el gas en el inspector: Ar (3 grados de libertad) o N₂ (5).',
    variables: { f: vari('f', 3, 3, 5, 2, '', { ayuda: 'Grados de libertad: 3 para Ar, 5 para N₂' }) },
    construir: v => ({ n: 1, f: v.f, inicio: { P: 100 * kPa, T: 300, nombre: 'A' }, tramos: [{ tipo: 'isocorico', T: 400, nombre: 'B' }, { tipo: 'isobarico', T: 500, nombre: 'C' }] }),
    examen: (sim, v) => {
      const tr = sim.tramos, cv = tr[0].Q / (R * 100), cp = tr[1].Q / (R * 100), ar = v.f === 3;
      return ar ? [
        { n: '(1)', etq: `(${S('c', 'p')} − ${S('c', 'v')})/${S('R')}`, valor: cp - cv, esperado: 1, u: '', formula: '1', opcion: '(c)', t: sim.duracion },
        { n: '(2)', etq: `${S('c', 'v')}/${S('R')}`, valor: cv, esperado: 1.5, u: '', formula: '3/2', opcion: '(c)', t: tr[0].t1 },
      ] : [
        { n: '(3)', etq: `${S('c', 'v')}/${S('R')} (N₂)`, valor: cv, esperado: 2.5, u: '', formula: '5/2: mayor que el del Ar', opcion: '(c)', t: tr[0].t1 },
        { n: '(4)', etq: `(${S('c', 'p')} − ${S('c', 'v')})/${S('R')} (N₂)`, valor: cp - cv, esperado: 1, u: '', formula: '1: igual que el del Ar', opcion: '(a)', t: sim.duracion },
      ];
    },
  },
];
export const ESCENAS_CICLOS = ESCENAS_CICLOS_BASE.map(e => ({ espacio: 'ciclos', ...e }));

// ===========================================================================
// Gas molecular (motores/cinetica.js)
// ===========================================================================
/** Especies con masa molecular (u) y radio de esfera dura (m). */
export const MOLECULAS = Object.freeze({
  He: { nombre: 'He', u: 4, r: 0.13e-9 }, Ar: { nombre: 'Ar', u: 40, r: 0.17e-9 },
  N2: { nombre: 'N₂', u: 28, r: 0.18e-9 }, O2: { nombre: 'O₂', u: 32, r: 0.17e-9 },
});
const esp = (clave, N, o = {}) => ({ nombre: MOLECULAS[clave].nombre, m: MOLECULAS[clave].u * UMA, r: MOLECULAS[clave].r, N: Math.round(N), ...o });
const CAJA = { Lx: 100e-9, Ly: 60e-9 };
/** Energía cinética media y v_rms por especie en una medida de la corrida. */
export function medidasEspecie(sim, k, s) {
  const N = sim.N, b = k * 2 * N;
  let n = 0, v2 = 0;
  for (let i = 0; i < N; i++) if (sim.especie[i] === s) { n++; v2 += sim.vel[b + 2 * i] ** 2 + sim.vel[b + 2 * i + 1] ** 2; }
  const m = sim.masa[sim.especie.indexOf(s)];
  return { N: n, vrms: Math.sqrt(v2 / Math.max(1, n)), Ek: 0.5 * m * v2 / Math.max(1, n), m };
}
/** Promedio de ⟨v²⟩ de una especie sobre los cuadros desde k0 (reduce el ruido estadístico). */
export function vrmsMedia(sim, s, k0 = Math.floor(sim.cuadros / 4)) {
  let a = 0, c = 0;
  for (let k = k0; k < sim.cuadros; k++) { a += medidasEspecie(sim, k, s).vrms ** 2; c++; }
  return Math.sqrt(a / c);
}
/** Masa molar media (kg/mol) de una mezcla dada por fracciones molares. */
const masaMolar = fr => fr.reduce((s, [u, x]) => s + u * 1e-3 * x, 0);

const ESCENAS_MOLECULAR_BASE = [
  {
    clave: 'presion', titulo: 'Presión y temperatura desde las moléculas', tipo: 'Tutorial',
    nota: 'La presión es el impulso que las moléculas dan a las paredes por unidad de tiempo y de longitud; la temperatura, su energía cinética media. En la caja plana ½m⟨v²⟩ = kT y P·A = NkT.',
    variables: { N: vari('N', 300, 50, 500, 10, ''), T: vari('T', 300, 100, 1000, 10, 'K') },
    duracion: 4e-9, cuadro: 4e-12,
    construir: v => ({ ...CAJA, T: v.T, semilla: 1, especies: [esp('Ar', v.N)] }),
  },
  {
    clave: 'ligero-pesado', titulo: 'Gas ligero contra gas pesado', tipo: 'Ejemplo',
    nota: 'Helio y argón a la misma temperatura: la energía cinética media es la misma (kT en la caja plana), pero el helio, diez veces más ligero, va √10 ≈ 3.2 veces más rápido.',
    variables: { N: vari('N', 150, 20, 250, 10, '', { ayuda: 'Moléculas de cada especie|Molecules per species' }), T: vari('T', 300, 100, 1000, 10, 'K') },
    duracion: 4e-9, cuadro: 4e-12,
    construir: v => ({ ...CAJA, T: v.T, semilla: 2, especies: [esp('He', v.N), esp('Ar', v.N)] }),
  },
  {
    clave: 'efusion', titulo: 'Efusión por un orificio', tipo: 'Ejemplo',
    nota: 'Helio y argón empiezan a la izquierda de un tabique con un orificio pequeño. Pasan más deprisa las moléculas rápidas: el ritmo de efusión va como 1/√m (ley de Graham).',
    variables: { N: vari('N', 120, 40, 200, 10, '', { ayuda: 'Moléculas de cada especie|Molecules per species' }), hueco: vari('a', 4, 1, 10, 0.5, 'nm'), T: vari('T', 300, 100, 1000, 10, 'K') },
    duracion: 3e-9, cuadro: 3e-12,
    construir: v => ({ ...CAJA, T: v.T, semilla: 3, tabique: { x: 50e-9, hueco: v.hueco * 1e-9 }, especies: [esp('He', v.N, { region: 'izq' }), esp('Ar', v.N, { region: 'izq' })] }),
  },
  {
    clave: 'expansion', titulo: 'Expansión libre hacia el vacío', tipo: 'Ejemplo',
    nota: 'Las moléculas están a la izquierda y la derecha está vacía. Se abre el tabique: el gas ocupa toda la caja sin hacer trabajo ni recibir calor, así que la temperatura no cambia y la presión se reduce a la mitad.',
    variables: { N: vari('N', 200, 50, 400, 10, ''), T: vari('T', 300, 100, 1000, 10, 'K') },
    duracion: 5e-9, cuadro: 5e-12,
    construir: v => ({ ...CAJA, T: v.T, semilla: 4, tabique: { x: 50e-9, hueco: 40e-9, abierto: false }, orificio: [{ t: 0.3e-9, abierto: true }], especies: [esp('Ar', v.N, { region: 'izq' })] }),
  },
  {
    clave: 'compresion', titulo: 'Compresión con un émbolo', tipo: 'Ejemplo',
    nota: 'La pared derecha avanza despacio: cada molécula que rebota en ella sale más rápida. El trabajo del émbolo es exactamente la energía cinética ganada; en la caja plana T·A se conserva (γ = 2).',
    variables: { N: vari('N', 300, 50, 500, 10, ''), u: vari('u', 10, 2, 40, 1, 'm/s'), T: vari('T', 300, 100, 1000, 10, 'K') },
    duracion: 7e-9, cuadro: 7e-12,
    construir: v => { const t1 = 0.5e-9 + 50e-9 / v.u; return { ...CAJA, T: v.T, semilla: 5, embolo: [{ t0: 0.5e-9, t1, u: -v.u }], especies: [esp('Ar', v.N)] }; },
    duracionDe: v => Math.max(3e-9, 0.5e-9 + 50e-9 / v.u + 1e-9),
  },
  {
    clave: 'paredes-termicas', titulo: 'Paredes calientes', tipo: 'Ejemplo',
    nota: 'Cada molécula que toca una pared térmica sale con la distribución de velocidades de la pared: el gas recibe calor hasta llegar a su temperatura.',
    variables: { N: vari('N', 300, 50, 500, 10, ''), T: vari('T', 300, 100, 1000, 10, 'K'), Tp: vari('T', 600, 100, 1200, 10, 'K', { sub: 'pared' }) },
    duracion: 4e-9, cuadro: 4e-12,
    construir: v => ({ ...CAJA, T: v.T, semilla: 6, paredes: 'termica', Tpared: v.Tp, especies: [esp('Ar', v.N)] }),
  },
  // ----------------------------------------------------------------- MEXT
  {
    clave: 'mext-2008-p4', titulo: 'Oxígeno y nitrógeno en un recipiente', tipo: 'MEXT', anio: '2008 P4',
    nota: '0.2 mol de O₂ y 0.3 mol de N₂ en 10 L. En la caja hay O₂ y N₂ en la misma proporción (2 : 3). A la misma temperatura, la molécula más ligera (N₂) es la más rápida.',
    variables: { T: vari('T', 300, 100, 1000, 10, 'K') },
    duracion: 4e-9, cuadro: 4e-12,
    construir: v => ({ ...CAJA, T: v.T, semilla: 7, especies: [esp('O2', 120), esp('N2', 180)] }),
    examen: sim => {
      const v1 = vrmsMedia(sim, 0), v2 = vrmsMedia(sim, 1);
      return [
        { n: '(1)', etq: S('m'), valor: (0.2 * 32 + 0.3 * 28), esperado: 14.8, u: 'g', formula: '0.2 × 32 + 0.3 × 28', opcion: '(d)', t: 0 },
        { n: '(2)', etq: `${S('C', 'p')}(O₂)/${S('R')}`, valor: 0.2 * (7 / 5) / (7 / 5 - 1), esperado: 0.7, u: '', formula: '0.2 · k/(k − 1), k = 7/5', opcion: '(b)', t: 0 },
        { n: '(3)', etq: `${S('C', 'p')}/${S('R')}`, valor: 0.5 * 3.5, esperado: 1.75, u: '', formula: '0.5 · 7/2', opcion: '(e)', t: 0 },
        { n: '(4)', etq: `${S('v', '1')}/${S('v', '2')}`, valor: v1 / v2, esperado: Math.sqrt(28 / 32), u: '', formula: '√(28/32) < 1: v₁ < v₂', opcion: '(c)', t: sim.duracion, tol: 0.04 },
      ];
    },
  },
  {
    clave: 'mext-2013-p4', titulo: 'Mezcla de oxígeno (20 %) y nitrógeno (80 %) en masa', tipo: 'MEXT', anio: '2013 P4',
    nota: 'En masa hay 20 % de O₂, pero en moles (y en volumen) solo un 18 %: el O₂ pesa más por molécula. La caja tiene 54 moléculas de O₂ y 246 de N₂.',
    variables: { T: vari('T', 273.15, 100, 1000, 0.05, 'K') },
    duracion: 4e-9, cuadro: 4e-12,
    construir: v => ({ ...CAJA, T: v.T, semilla: 8, especies: [esp('O2', 54), esp('N2', 246)] }),
    examen: () => {
      const xO = (0.2 / 32) / (0.2 / 32 + 0.8 / 28), M = masaMolar([[32, xO], [28, 1 - xO]]), Vm = R * 273.15 / 0.1013e6;
      return [
        { n: '(1)', etq: `${S('x')}(O₂)`, valor: xO * 100, esperado: 18, u: '%', formula: '(0.2/32)/(0.2/32 + 0.8/28) ≈ 18 %', opcion: '(c)', t: 0, tol: 0.01 },
        { n: '(2)', etq: `${S('m')} (1 mol)`, valor: M, esperado: 0.0287, u: 'kg', formula: 'Σ x·M', opcion: '(b)', t: 0, tol: 0.002 },
        { n: '(3)', etq: S('V'), valor: Vm, esperado: 0.0224, u: 'm³', formula: 'RT/P', opcion: '(b)', t: 0, tol: 0.002 },
        { n: '(4)', etq: S('ρ'), valor: M / Vm, esperado: 1.28, u: 'kg/m³', formula: 'm/V', opcion: '(b)', t: 0, tol: 0.002 },
        { n: '(5)', etq: `${S('c', 'p')}/${S('c', 'v')}`, valor: 7 / 5, esperado: 1.4, u: '', formula: '7/5 (dos gases diatómicos)', opcion: '(b)', t: 0 },
      ];
    },
  },
  {
    clave: 'mext-2012-p4', titulo: 'Composición y densidad del aire', tipo: 'MEXT', anio: '2012 P4',
    nota: 'Aire: 78 % de N₂, 21 % de O₂ y 1 % de Ar en volumen (234, 63 y 3 moléculas en la caja). El argón, monoatómico, apenas cambia γ.',
    variables: { T: vari('T', 273.15, 100, 1000, 0.05, 'K') },
    duracion: 4e-9, cuadro: 4e-12,
    construir: v => ({ ...CAJA, T: v.T, semilla: 9, especies: [esp('N2', 234), esp('O2', 63), esp('Ar', 3)] }),
    examen: () => {
      const M = masaMolar([[28, 0.78], [32, 0.21], [40, 0.01]]), cv = 0.99 * 2.5 + 0.01 * 1.5;
      return [
        { n: '(1)', etq: 'N₂ en masa', valor: 0.78 * 28e-3 / M * 100, esperado: 76, u: '%', formula: '0.78·28/(0.78·28 + 0.21·32 + 0.01·40) ≈ 75.4 %', opcion: '(a)', t: 0, tol: 0.01 },
        { n: '(2)', etq: S('ρ'), valor: 0.1e6 * M / (R * 273.15), esperado: 1.29, u: 'kg/m³', formula: 'PM/(RT) ≈ 1.28', opcion: '(c)', t: 0, tol: 0.015 },
        { n: '(3)', etq: `(${S('c', 'p')} − ${S('c', 'v')})/${S('R')}`, valor: 1, esperado: 1, u: '', formula: '1 (gas ideal, mezcla o no)', opcion: '(b)', t: 0 },
        { n: '(4)', etq: `${S('c', 'p')}/${S('c', 'v')}`, valor: (cv + 1) / cv, esperado: 1.4, u: '', formula: '(c_v + R)/c_v ≈ 1.40', opcion: '(b)', t: 0, tol: 0.005 },
      ];
    },
  },
  {
    clave: 'mext-2007-p4', titulo: 'Rapidez del sonido en oxígeno y nitrógeno', tipo: 'MEXT', anio: '2007 P4',
    nota: 'v = √(κp/ρ) con κ = 7/5 para O₂ y N₂. A igual p y T, el O₂ es más denso (32 frente a 28) y el sonido va más despacio en él; en el agua va mucho más rápido.',
    variables: { T: vari('T', 273.15, 100, 1000, 0.05, 'K') },
    duracion: 4e-9, cuadro: 4e-12,
    construir: v => ({ ...CAJA, T: v.T, semilla: 10, especies: [esp('O2', 150), esp('N2', 150)] }),
    examen: () => {
      const p = 1e5, T = 273.15, rO = p * 0.032 / (R * T), rN = p * 0.028 / (R * T), vO = Math.sqrt(1.4 * p / rO), vN = Math.sqrt(1.4 * p / rN);
      return [
        { n: '(1)', etq: S('κ'), valor: 1.4, esperado: 1.4, u: '', formula: '1 < κ < 2', opcion: '(e)', t: 0 },
        { n: '(2)', etq: `${S('ρ')}(O₂)/${S('ρ')}(N₂)`, valor: rO / rN, esperado: 32 / 28, u: '', formula: '32/28 > 1: ρ(O₂) > ρ(N₂)', t: 0, tol: 1e-12 },
        { n: '(3)', etq: `${S('v')}(O₂)/${S('v')}(N₂)`, valor: vO / vN, esperado: Math.sqrt(28 / 32), u: '', formula: '√(28/32) < 1: v(O₂) < v(N₂)', t: 0, tol: 1e-12 },
        { n: '(4)', etq: `${S('v', 'w')}/${S('v')}(N₂)`, valor: 1402 / vN, esperado: 1402 / vN, u: '', formula: 'agua ≈ 1400 m/s: v_w > v(N₂)', t: 0 },
      ];
    },
  },
];
export const ESCENAS_MOLECULAR = ESCENAS_MOLECULAR_BASE.map(e => ({ espacio: 'molecular', ...e }));

// ===========================================================================
// Calor y calorimetría (motores/calor.js)
// ===========================================================================
// dibujo: posición de cada cuerpo en el lienzo (m de mundo): x, y (centro de
// la base), w, h, forma ('bloque', 'agua', 'vaso', 'motor', 'disco')
const ESCENAS_CALOR_BASE = [
  {
    clave: 'equilibrio', titulo: 'Dos cuerpos en contacto', tipo: 'Tutorial',
    nota: 'El calor pasa del cuerpo caliente al frío hasta que las temperaturas se igualan. La temperatura final es la media ponderada por las capacidades: Σm·c·T / Σm·c.',
    variables: { m1: vari('m', 0.5, 0.1, 2, 0.05, 'kg', { sub: 'Cu' }), T1: vari('T', 90, 0, 200, 1, '°C', { sub: 'Cu' }), m2: vari('m', 0.3, 0.1, 2, 0.05, 'kg', { sub: 'Al' }), T2: vari('T', 20, 0, 200, 1, '°C', { sub: 'Al' }), G: vari('G', 5, 1, 20, 0.5, 'W/K') },
    duracion: 150,
    construir: v => ({ cuerpos: [{ nombre: 'Cobre', m: v.m1, c: 385, T: K0 + v.T1 }, { nombre: 'Aluminio', m: v.m2, c: 897, T: K0 + v.T2 }], contactos: [{ a: 0, b: 1, G: v.G, activo: false }] }),
    guion: () => [{ t: 2, tipo: 'contacto', i: 0, valor: true }],
    dibujo: [{ x: -0.13, y: 0, w: 0.24, h: 0.12, forma: 'bloque' }, { x: 0.13, y: 0, w: 0.24, h: 0.12, forma: 'bloque', separado: 0.06 }],
    extra: (s, sim, v) => [[`${S('T')}<sub class="r">eq</sub>`, temperaturaMezcla(sim.cuerpos) - K0, '°C', 'Σm·c·T/Σm·c|Equilibrium temperature']],
  },
  {
    clave: 'joule', titulo: 'Calentar agua con una resistencia', tipo: 'Tutorial',
    nota: 'La resistencia convierte energía eléctrica en calor a razón de V²/R. Sin pérdidas, el agua sube ΔT = P·t/(m·c).',
    variables: { E: vari('V', 24, 6, 48, 1, 'V'), Rr: vari('R', 2, 0.5, 10, 0.5, 'Ω'), m: vari('m', 0.5, 0.1, 2, 0.05, 'kg'), t: vari('t', 120, 10, 300, 5, 's', { sub: 'on' }) },
    duracion: 160,
    construir: v => ({ cuerpos: [{ nombre: 'Agua', m: v.m, c: 4186, T: K0 + 20 }, { nombre: 'Vaso', m: 0.05, c: 840, T: K0 + 20 }], contactos: [{ a: 0, b: 1, G: 2 }], calentadores: [{ cuerpo: 0, P: v.E ** 2 / v.Rr }] }),
    guion: v => [{ t: 5, tipo: 'calentador', i: 0, valor: true }, { t: 5 + v.t, tipo: 'calentador', i: 0, valor: false }],
    dibujo: [{ x: 0, y: 0.012, w: 0.28, h: 0.2, forma: 'agua', calentador: true }, { x: 0, y: 0, w: 0.32, h: 0.26, forma: 'vaso' }],
    extra: (s, sim, v) => [[`${S('V')}²/${S('R')}`, v.E ** 2 / v.Rr, 'W', 'Potencia de la resistencia|Joule heating'], [`Δ${S('T')}`, v.E ** 2 / v.Rr * v.t / (v.m * 4186 + 0.05 * 840), 'K', 'P·t/Σm·c|Temperature rise']],
  },
  {
    clave: 'calorimetro', titulo: 'Agua y metal en un calorímetro', tipo: 'Ejemplo',
    nota: 'Un trozo de hierro caliente cae en agua dentro de un vaso de aluminio. Agua, vaso y metal acaban a la misma temperatura; el calorímetro aísla del aire.',
    variables: { mM: vari('m', 0.2, 0.05, 1, 0.01, 'kg', { sub: 'Fe' }), TM: vari('T', 100, 30, 300, 1, '°C', { sub: 'Fe' }), mA: vari('m', 0.3, 0.05, 1, 0.01, 'kg', { sub: 'agua' }), TA: vari('T', 20, 0, 60, 1, '°C', { sub: 'agua' }) },
    duracion: 120,
    construir: v => ({ cuerpos: [{ nombre: 'Vaso', m: 0.1, c: 897, T: K0 + v.TA }, { nombre: 'Agua', m: v.mA, c: 4186, T: K0 + v.TA }, { nombre: 'Hierro', m: v.mM, c: 449, T: K0 + v.TM }], contactos: [{ a: 0, b: 1, G: 20 }, { a: 1, b: 2, G: 10, activo: false }] }),
    guion: () => [{ t: 3, tipo: 'contacto', i: 1, valor: true }],
    dibujo: [{ x: 0, y: 0, w: 0.32, h: 0.26, forma: 'vaso' }, { x: 0, y: 0.012, w: 0.28, h: 0.17, forma: 'agua' }, { x: 0, y: 0.03, w: 0.08, h: 0.06, forma: 'bloque', cae: true }],
    extra: (s, sim) => [[`${S('T')}<sub class="r">eq</sub>`, temperaturaMezcla(sim.cuerpos) - K0, '°C', 'Σm·c·T/Σm·c|Equilibrium temperature']],
  },
  {
    clave: 'hielo', titulo: 'Fusión de hielo', tipo: 'Ejemplo',
    nota: 'El hielo se calienta hasta 0 °C, se funde a temperatura constante (meseta) absorbiendo m·L, y su agua sigue calentándose. Mientras tanto el agua caliente se enfría.',
    variables: { mH: vari('m', 0.05, 0.01, 0.2, 0.005, 'kg', { sub: 'hielo' }), TH: vari('T', -10, -30, 0, 1, '°C', { sub: 'hielo' }), mA: vari('m', 0.3, 0.1, 1, 0.01, 'kg', { sub: 'agua' }), TA: vari('T', 40, 5, 90, 1, '°C', { sub: 'agua' }) },
    duracion: 240,
    construir: v => ({ cuerpos: [{ nombre: 'Agua', m: v.mA, c: 4186, T: K0 + v.TA }, { nombre: 'Hielo', m: v.mH, c: 2100, T: K0 + v.TH, fusion: { Tf: K0, L: 334e3, cl: 4186 } }], contactos: [{ a: 0, b: 1, G: 15, activo: false }] }),
    guion: () => [{ t: 3, tipo: 'contacto', i: 0, valor: true }],
    dibujo: [{ x: 0, y: 0, w: 0.28, h: 0.17, forma: 'agua' }, { x: 0, y: 0.12, w: 0.07, h: 0.06, forma: 'hielo', cae: true }],
    extra: (s, sim) => [[`${S('T')}<sub class="r">eq</sub>`, equilibrioCalor(sim.esc).T - K0, '°C', 'Temperatura final con la fusión incluida|Final temperature'], [`${S('x')}`, s.x[1], '', 'Fracción de hielo fundida|Melted fraction']],
  },
  // ----------------------------------------------------------------- MEXT
  {
    clave: 'mext-2010-2-a', titulo: 'Cobre caliente en agua dentro de un vaso de cobre', tipo: 'MEXT', anio: '2010 2-A',
    nota: 'Vaso de cobre (100 g) con 200 g de agua a 20 °C; se echa un trozo de cobre de 150 g a 80 °C y se agita. c_agua = 4.2 J/(g·K), c_cobre = 0.40 J/(g·K). Sin intercambio con el entorno.',
    variables: { mP: vari('m', 150, 50, 400, 5, 'g', { sub: 'pieza' }), TP: vari('T', 80, 30, 200, 1, '°C', { sub: 'pieza' }) },
    duracion: 120,
    construir: v => ({ cuerpos: [{ nombre: 'Vaso de cobre', m: 0.1, c: 400, T: K0 + 20 }, { nombre: 'Agua', m: 0.2, c: 4200, T: K0 + 20 }, { nombre: 'Cobre', m: v.mP * 1e-3, c: 400, T: K0 + v.TP }], contactos: [{ a: 0, b: 1, G: 20 }, { a: 1, b: 2, G: 10, activo: false }] }),
    guion: () => [{ t: 3, tipo: 'contacto', i: 1, valor: true }],
    dibujo: [{ x: 0, y: 0, w: 0.32, h: 0.26, forma: 'vaso' }, { x: 0, y: 0.012, w: 0.28, h: 0.17, forma: 'agua' }, { x: 0, y: 0.03, w: 0.08, h: 0.06, forma: 'bloque', cae: true }],
    examen: (sim, v) => [
      { n: 'Q1', etq: S('T', 'final'), valor: ultima(sim).T[1] - K0, esperado: (0.1 * 400 * 20 + 0.2 * 4200 * 20 + v.mP * 1e-3 * 400 * v.TP) / (0.1 * 400 + 0.2 * 4200 + v.mP * 1e-3 * 400), u: '°C', formula: 'Σm·c·T/Σm·c ≈ 24 °C', opcion: '(b)', t: sim.duracion, tol: 1e-4 },
    ],
  },
  {
    clave: 'mext-2010-2-c', titulo: 'Automóvil: energía química, cinética y calor', tipo: 'MEXT', anio: '2010 2-C',
    nota: 'El motor convierte la energía química de la gasolina en energía cinética (y calor en el motor). Al frenar, toda la energía cinética se vuelve calor en los frenos y se pierde.',
    variables: { m: vari('m', 1000, 500, 2000, 50, 'kg'), v: vari('v', 20, 5, 35, 1, 'm/s'), eta: vari('η', 25, 10, 40, 1, '%'), F: vari('F', 5000, 1000, 10000, 100, 'N') },
    duracion: 24,
    construir: v => ({ cuerpos: [{ nombre: 'Motor', m: 150, c: 450, T: K0 + 20 }, { nombre: 'Frenos', m: 10, c: 450, T: K0 + 20 }], vehiculo: { m: v.m, P: 40e3, eta: v.eta / 100, F: v.F, vmax: v.v, motor: 0, frenos: 1 } }),
    guion: v => [{ t: 1, tipo: 'acelerar', valor: true }, { t: 2 + 0.5 * v.m * v.v ** 2 / 40e3 + 2, tipo: 'frenar', valor: true }],
    dibujo: [{ x: -0.1, y: 0.05, w: 0.12, h: 0.07, forma: 'motor' }, { x: 0.12, y: 0.02, w: 0.06, h: 0.06, forma: 'disco' }],
    examen: (sim, v) => {
      const q = ultima(sim), Ek = 0.5 * v.m * v.v ** 2;
      return [
        { n: 'a', etq: `${S('E')}<sub class="r">química</sub>`, valor: q.Equim, esperado: Ek / (v.eta / 100), u: 'J', formula: 'energía química de la gasolina', opcion: '(g)', t: 2 + Ek / 40e3, tol: 1e-6, texto: 'química' },
        { n: 'b', etq: `${S('E')}<sub class="r">k</sub> máx.`, valor: Math.max(...sim.muestras.map(s => s.Ek)), esperado: Ek, u: 'J', formula: 'energía cinética', opcion: '(g)', t: 2 + Ek / 40e3, tol: 1e-6, texto: 'cinética' },
        { n: 'c', etq: `${S('Q')}<sub class="r">frenos</sub>`, valor: q.Qfrenos, esperado: Ek, u: 'J', formula: 'calor (toda la cinética)', opcion: '(g)', t: sim.duracion, tol: 1e-6, texto: 'calor' },
      ];
    },
  },
];
export const ESCENAS_CALOR = ESCENAS_CALOR_BASE.map(e => ({ espacio: 'calor', ...e }));

/** Todas las escenas del módulo. */
export const ESCENAS = [...ESCENAS_LAB, ...ESCENAS_CICLOS, ...ESCENAS_MOLECULAR, ...ESCENAS_CALOR];
export const escenaPorClave = clave => ESCENAS.find(e => e.clave === clave) || null;

// ===========================================================================
// Simulación de una escena
// ===========================================================================
/** Guion de la escena con sus variables (copia). */
export const guionDe = (esc, v) => (typeof esc.guion === 'function' ? esc.guion(v) : (esc.guion || [])).map(a => ({ ...a }));

/** Entrada del motor de gas de una escena de cilindro. */
export const entradaCilindro = (esc, v) => ({ ...(esc.construir ? esc.construir(v) : gasDe(v)), especie: esc.especie || 'mono' });

/**
 * Simula una escena con sus variables (y el guion propio de la pantalla, si
 * lo hay). Devuelve la corrida del motor que le toca.
 * @param {any} esc @param {Record<string, number>} [v] @param {any[]} [guion] @param {any} [extra] opciones propias (modelo)
 */
export function simularEscena(esc, v = valores(esc), guion = guionDe(esc, v), extra = {}) {
  if (esc.espacio === 'laboratorio-de-gases') {
    if (esc.montaje === 'cilindro') {
      return simularGas(entradaCilindro(esc, v), guion, { modelo: extra.modelo || esc.modelo || 'dinamico', duracion: esc.duracion, dt: 2e-4, muestra: 0.01, tauCarga: 4, ...(esc.opciones || {}) });
    }
    if (esc.montaje === 'recipientes') return simularRecipientes(esc.construir(v), guion, { duracion: esc.duracion, dt: 0.002, muestra: 0.02, modo: extra.modo || 'gradual' });
    if (esc.montaje === 'abierto') return simularAbierto(esc.construir(v), guion, { duracion: esc.duracion, dt: 0.01, muestra: 0.05 });
    if (esc.montaje === 'burbuja') return simularBurbuja(esc.construir(v), { duracion: esc.duracion });
  }
  if (esc.espacio === 'ciclos') return simularCiclo(esc.construir(v));
  if (esc.espacio === 'molecular') {
    const dur = esc.duracionDe ? esc.duracionDe(v) : esc.duracion;
    return simularMolecular(esc.construir(v), { duracion: dur, cuadro: dur / Math.round(esc.duracion / esc.cuadro) });
  }
  if (esc.espacio === 'calor') {
    const e = esc.construir(v), sim = simularCalor(e, guion, { duracion: esc.duracion, dt: 0.01, muestra: 0.1 });
    return { ...sim, esc: e };
  }
  throw new Error(`Escena sin motor: ${esc.clave}`);
}

/** Filas del examen de una escena ya simulada (vacío si no es MEXT). */
export const examenDe = (esc, sim, v = valores(esc)) => (esc.examen ? esc.examen(sim, v) : []);

// Reexportaciones útiles para las pantallas
export { estadoEn, estadoRecipientes, estadoMuestras, equilibrioAislado, K_B, N_A, UMA };
