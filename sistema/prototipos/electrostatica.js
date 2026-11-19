/* ==========================================================================
   Volta · Electrostática — espacio «Cargas y campos»
   Caja de arena de cargas y distribuciones (carga puntual, esfera, hilo
   infinito, segmento, anillo, lámina y campo uniforme) con sonda de campo,
   superficie gaussiana, camino de una carga de prueba y una partícula libre
   (con resorte y amortiguamiento opcionales). Escenas agrupadas en
   Tutoriales, Ejemplos y MEXT (E1); la escena de partida es MEXT 2020 P2.
   La física vive en el motor puro sistema/motores/electrostatica.js
   (pruebas/electrostatica*.test.js): superposición exacta por fórmula
   cerrada, ley de Gauss por cuadratura y carga encerrada exacta, trabajo por
   un camino, y Dormand–Prince 5(4) con eventos localizados por Brent.
   Las escenas de capacitores, conductores y dieléctricos están en
   electrostatica-conductores.html (espacio «conductores»).
   Parámetros de URL para capturas: ?escena=<clave>&tema=…&t=…&sel=…
   &mapa=1&malla=1&fuentes=todas&pest=energia|eventos|tabla
   ========================================================================== */
import {
  K_COULOMB as K, EPSILON_0, campo, potencial, simularCargas, estadoEn, energiaEstado, componentesVelocidad,
  flujoEsfera, flujoCilindro, cargaEncerrada, trabajoCamino, energiaPotencial,
} from '../motores/electrostatica.js';
import { aCSV, muestrear } from '../nucleo/csv.js';
import { evaluar, DIM as DIMS } from '../nucleo/unidades.js';
import { crearEscena, numero, texto, magnitud } from '../nucleo/escena.js';
import { Historial } from '../nucleo/historial.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';
import { descargarTexto, descargarLienzo } from '../componentes/exportar.js';

(function () {
  'use strict';
  const { Trazo, G, fmt, cantidad, grafica, LineaTiempo } = Volta;
  const { conPrefijo, nivelesAuto, GE } = Volta.electro;
  const $ = s => document.querySelector(s);
  const GR = Math.PI / 180;
  const ESPACIO = 'cargas-y-campos';

  // ---------------------------------------------------------------------
  // Dimensiones de los campos: unidad que se muestra, factor a SI y
  // dimensión para leer expresiones con unidades («3 µC», «−2q», «30 cm»)
  // ---------------------------------------------------------------------
  const resta = (a, b, k = 1) => a.map((x, i) => x - k * b[i]);
  const DIMEN = {
    carga: { u: 'µC', si: 1e-6, dim: DIMS.carga, simple: 'µC' },
    longitud: { u: 'm', si: 1, dim: DIMS.longitud, simple: 'm' },
    masa: { u: 'g', si: 1e-3, dim: DIMS.masa, simple: 'g' },
    velocidad: { u: 'm/s', si: 1, dim: DIMS.velocidad },
    lambda: { u: 'µC/m', si: 1e-6, dim: resta(DIMS.carga, DIMS.longitud) },
    sigma: { u: 'nC/m²', si: 1e-9, dim: resta(DIMS.carga, DIMS.longitud, 2) },
    campo: { u: 'V/m', si: 1, dim: DIMS.campoElectrico },
    rigidez: { u: 'N/m', si: 1, dim: resta(DIMS.fuerza, DIMS.longitud) },
    amortiguamiento: { u: 'N·s/m', si: 1, dim: resta(DIMS.fuerza, DIMS.velocidad) },
    angulo: { u: '°', si: 1, dim: DIMS.adimensional, simple: '°' },
    potencial: { u: 'kV', si: 1e3, dim: DIMS.potencial, simple: 'kV' },
    coulomb: { u: 'N·m²/C²', si: 1, dim: DIMS.fuerza.map((e, i) => e + 2 * DIMS.longitud[i] - 2 * DIMS.carga[i]) },
    permitividad: { u: 'F/m', si: 1, dim: resta(DIMS.capacitancia, DIMS.longitud) },
  };
  // Dimensión de cada propiedad de los objetos
  const DIM_PROP = { q: 'carga', x: 'longitud', y: 'longitud', m: 'masa', v0: 'velocidad', radio: 'longitud', largo: 'longitud', R: 'longitud', L: 'longitud', lambda: 'lambda', sigma: 'sigma', E0: 'campo', k: 'rigidez', L0: 'longitud', b: 'amortiguamiento', angulo: 'angulo', alfa: 'angulo', dV: 'potencial' };

  // ---------------------------------------------------------------------
  // Escenas. Una magnitud ligada a una variable se escribe {v, f}
  // (valor = f · variable, en SI); una libre, como número en SI. Ángulos
  // en grados. Variables: valor en su unidad de pantalla (si = factor a SI).
  // ---------------------------------------------------------------------
  const L = (v, f = 1) => ({ v, f });
  const VK = () => ({ sim: 'k', val: K, constante: true, u: 'N·m²/C²', si: 1, dim: 'coulomb' });
  const VE0 = () => ({ sim: 'ε', sub: '0', val: EPSILON_0, constante: true, u: 'F/m', si: 1, dim: 'permitividad' });
  const vq = (sim, val, o = {}) => ({ sim, sub: o.sub, val, min: o.min ?? 0.1, max: o.max ?? 3, paso: o.paso ?? 0.05, u: 'µC', si: 1e-6, dim: 'carga' });
  const vL = (sim, val, min, max, paso = 0.05, sub) => ({ sim, sub, val, min, max, paso, u: 'm', si: 1, dim: 'longitud' });
  const vm = (val, min = 0.5, max = 10, paso = 0.1) => ({ sim: 'm', val, min, max, paso, u: 'g', si: 1e-3, dim: 'masa' });
  const vv = (sim, val, min, max, paso, sub) => ({ sim, sub, val, min, max, paso, u: 'm/s', si: 1, dim: 'velocidad' });
  const carga = (id, q, x, y, o = {}) => ({ id, nombre: o.nombre ?? id, tipo: 'puntual', q, x, y, ...(o.coords ? { coords: true } : {}) });
  const S3 = Math.sqrt(3) / 2;

  const ESCENAS = [
    // ------------------------------------------------------------ Tutoriales
    {
      clave: 'una-carga', titulo: 'Una carga y la sonda de campo', tipo: 'Tutorial',
      vars: { q: vq('q', 1), k: VK() },
      fuentes: [carga('A', L('q'), 0, 0, { coords: true })],
      sonda: { x: 0.6, y: 0.35 }, caja: [-1.6, 1.6, -1, 1],
    },
    {
      clave: 'dipolo', titulo: 'Dipolo: líneas y equipotenciales', tipo: 'Tutorial',
      vars: { q: vq('q', 1), a: vL('a', 0.5, 0.2, 1.2), k: VK() },
      fuentes: [carga('A', L('q'), L('a', -1), 0, { coords: true }), carga('B', L('q', -1), L('a'), 0, { coords: true })],
      sonda: { x: 0.15, y: 0.6 }, caja: [-1.6, 1.6, -1, 1],
    },
    {
      clave: 'gauss', titulo: 'Gauss con varias cargas', tipo: 'Tutorial',
      vars: { q: vq('q', 1), k: VK() },
      fuentes: [carga('A', L('q', 2), -0.45, 0.2), carga('B', L('q', -1), 0.3, -0.25), carga('C', L('q'), 1.35, 0.5)],
      gauss: { forma: 'esfera', x: -0.1, y: 0, R: 0.8, L: 1 }, sonda: { x: -1.5, y: -0.75 }, caja: [-2, 2, -1.1, 1.1],
    },
    {
      clave: 'tiro', titulo: 'Tiro eléctrico entre dos placas', tipo: 'Tutorial',
      vars: {
        s: { sim: 'σ', val: 20, min: 2, max: 60, paso: 1, u: 'nC/m²', si: 1e-9, dim: 'sigma' },
        v0: vv('v', 3.2, 0.5, 6, 0.05, '0'), q: vq('q', 1), m: vm(1),
      },
      fuentes: [
        { id: 'S', nombre: 'Placa superior', tipo: 'lamina', x: 0, y: 0.2, largo: 1.2, angulo: 0, sigma: L('s', -1) },
        { id: 'I', nombre: 'Placa inferior', tipo: 'lamina', x: 0, y: -0.2, largo: 1.2, angulo: 0, sigma: L('s') },
      ],
      particula: { nombre: 'Partícula', q: L('q'), m: L('m'), x: -0.85, y: 0, v0: L('v0'), alfa: 0 },
      duracion: 1.2, ejeMov: 'y', graficas: 'tray', sonda: { x: 0.95, y: 0.42 }, porMicro: 1200, radioChoque: 0.008,
      caja: [-1.1, 1.3, -0.6, 0.6], ficha: 'Choca',
    },
    // ------------------------------------------------------------ Ejemplos
    {
      clave: 'iguales', titulo: 'Dos cargas iguales: punto neutro', tipo: 'Ejemplo',
      vars: { q: vq('q', 1), a: vL('a', 0.5, 0.2, 1.2), k: VK() },
      fuentes: [carga('A', L('q'), L('a', -1), 0, { coords: true }), carga('B', L('q'), L('a'), 0, { coords: true })],
      sonda: { x: 0, y: 0 }, caja: [-1.4, 1.4, -0.85, 0.85], perfil: 'y',
    },
    {
      clave: 'cuadrupolo', titulo: 'Cuadrupolo', tipo: 'Ejemplo',
      vars: { q: vq('q', 1), a: vL('a', 0.4, 0.2, 1), k: VK() },
      fuentes: [carga('A', L('q'), L('a', -1), L('a')), carga('B', L('q', -1), L('a'), L('a')), carga('C', L('q', -1), L('a', -1), L('a', -1)), carga('D', L('q'), L('a'), L('a', -1))],
      sonda: { x: 0.65, y: 0 }, caja: [-1.3, 1.3, -0.9, 0.9],
    },
    {
      clave: 'anillo-oscila', titulo: 'Carga que oscila por un anillo', tipo: 'Ejemplo',
      vars: { Q: vq('Q', 2, { max: 5 }), R: vL('R', 0.4, 0.1, 1), q: vq('q', 1), m: vm(1), k: VK() },
      fuentes: [{ id: 'An', nombre: 'Anillo', tipo: 'anillo', x: 0, y: 0, radio: L('R'), angulo: 0, q: L('Q') }],
      particula: { nombre: 'Partícula', q: L('q', -1), m: L('m'), x: 0.6, y: 0, v0: 0, alfa: 0 },
      duracion: 2, ejeMov: 'x', lineaU: { eje: 'x', en: 0 }, sonda: { x: -0.7, y: 0.45 }, caja: [-1, 1, -0.7, 0.7], ficha: 'Pasa por O',
    },
    {
      clave: 'hilo-gauss', titulo: 'Hilo infinito y la ley de Gauss', tipo: 'Ejemplo',
      vars: { l: { sim: 'λ', val: 1, min: 0.1, max: 3, paso: 0.05, u: 'µC/m', si: 1e-6, dim: 'lambda' }, k: VK() },
      fuentes: [{ id: 'H', nombre: 'Hilo', tipo: 'hilo', x: 0, y: 0, lambda: L('l') }],
      gauss: { forma: 'cilindro', x: 0, y: 0, R: 0.5, L: 1 }, sonda: { x: 0.85, y: 0.3 }, caja: [-1.5, 1.5, -1, 1], porMicro: 24,
    },
    {
      clave: 'esfera-conductora', titulo: 'Esfera conductora: E = 0 dentro', tipo: 'Ejemplo',
      vars: { Q: vq('Q', 2, { max: 5 }), R: vL('R', 0.5, 0.1, 1), k: VK() },
      fuentes: [{ id: 'E', nombre: 'Esfera', tipo: 'esfera', x: 0, y: 0, radio: L('R'), q: L('Q'), conductora: true }],
      gauss: { forma: 'esfera', x: 0.1, y: -0.05, R: 0.3, L: 1 }, sonda: { x: -0.25, y: 0.2 }, caja: [-1.5, 1.5, -1, 1],
    },
    {
      clave: 'segmento', titulo: 'Campo de un segmento cargado', tipo: 'Ejemplo',
      vars: { q: vq('q', 2, { max: 5 }), Ls: vL('L', 1.2, 0.2, 2), k: VK() },
      fuentes: [{ id: 'S', nombre: 'Segmento', tipo: 'segmento', x: 0, y: 0, largo: L('Ls'), angulo: 0, q: L('q') }],
      sonda: { x: 0.35, y: 0.45 }, caja: [-1.5, 1.5, -1, 1],
    },
    // ------------------------------------------------------------ MEXT (E1)
    {
      clave: 'mext-2027-3', titulo: 'Órbita circular alrededor de B', tipo: 'MEXT', anio: '2027 P3',
      vars: { Q: vq('Q', 2, { max: 5 }), q: vq('q', 1), d: vL('d', 1, 0.4, 2), m: vm(2), v0: vv('v', 2.521, 0, 6, 0.001, '0'), k: VK() },
      fuentes: [carga('B', L('Q'), L('d', -1), 0, { coords: true })],
      puntos: [{ nombre: 'A', x: L('d'), y: 0, coords: true, lado: 'ne' }, { nombre: 'C', x: 0, y: L('d'), coords: true, lado: 'no' }],
      particula: { nombre: 'Partícula', q: L('q', -1), m: L('m'), x: 0, y: L('d'), v0: L('v0'), alfa: -45 },
      duracion: 4, ejeMov: 'y', graficas: 'dist', sonda: { x: 0.9, y: 1.25 }, caja: [-2.7, 1.4, -1.7, 1.7],
    },
    {
      clave: 'mext-2023-1-3', titulo: 'Trabajo para llevar Q de C a P', tipo: 'MEXT', anio: '2023 1-(3)',
      vars: { q: vq('q', 1), Q: vq('Q', 1), l: vL('l', 1, 0.4, 2), k: VK() },
      fuentes: [carga('A', L('q'), L('l', -0.5), 0), carga('B', L('q'), L('l', 0.5), 0)],
      puntos: [{ nombre: 'C', x: 0, y: L('l', S3), lado: 'ne' }, { nombre: 'P', x: 0, y: 0, lado: 'se' }],
      camino: { puntos: [[0, L('l', S3)], [0, 0]], q: L('Q'), nombre: 'Q' },
      guias: [{ puntos: [[L('l', -0.5), 0], [L('l', 0.5), 0], [0, L('l', S3)]], cerrada: true }],
      duracion: 4, sonda: { x: -0.85, y: 0.75 }, caja: [-1.2, 1.2, -0.45, 1.15],
    },
    {
      clave: 'mext-2020-2', titulo: 'Partícula entre dos cargas iguales', tipo: 'MEXT', anio: '2020 P2',
      vars: { q: vq('q', 1), a: vL('a', 1, 0.4, 2), m: vm(2), v0: vv('v', 0, 0, 5, 0.05, '0'), k: VK() },
      fuentes: [carga('A', L('q'), L('a', -1), 0, { coords: true }), carga('B', L('q'), L('a'), 0, { coords: true })],
      puntos: [{ nombre: 'C', x: 0, y: L('a'), coords: true, lado: 'no' }],
      particula: { nombre: 'Partícula', q: L('q', -1), m: L('m'), x: 0, y: L('a'), v0: L('v0'), alfa: -90 },
      duracion: 6.5, ejeMov: 'y', lineaU: { eje: 'y', en: 0 }, sonda: { x: -1.5, y: 1.05 }, ficha: 'Pasa por O',
      encuadreParticula: true,
    },
    {
      clave: 'mext-2018-1-3', titulo: 'Carga en un campo uniforme', tipo: 'MEXT', anio: '2018 1-(3)',
      vars: { E: { sim: 'E', val: 500, min: 100, max: 2000, paso: 10, u: 'V/m', si: 1, dim: 'campo' }, q: vq('q', 2), m: vm(1), d: vL('d', 0.4, 0.1, 1) },
      fuentes: [{ id: 'U', nombre: 'Campo uniforme', tipo: 'uniforme', E0: L('E'), angulo: 0 }],
      particula: { nombre: 'Partícula', q: L('q'), m: L('m'), x: L('d', -1), y: 0, v0: 0, alfa: 0 },
      duracion: 1.5, ejeMov: 'x', lineaU: { eje: 'x', en: 0 }, sonda: { x: 0.35, y: 0.22 }, caja: [-0.7, 0.9, -0.4, 0.4], ficha: 'Pasa por O', porMicro: 40,
    },
    {
      clave: 'mext-2017-1-4', titulo: 'Resorte y repulsión de Q', tipo: 'MEXT', anio: '2017 1-(4)',
      vars: {
        q: vq('q', 1), Q: vq('Q', 13.63, { min: 1, max: 30, paso: 0.01 }),
        k: { sim: 'k', val: 20, min: 5, max: 50, paso: 0.5, u: 'N/m', si: 1, dim: 'rigidez' },
        l: vL('ℓ', 0.3, 0.15, 0.6, 0.01), m: vm(10, 1, 50, 1),
        b: { sim: 'b', val: 0.2, min: 0, max: 1, paso: 0.01, u: 'N·s/m', si: 1, dim: 'amortiguamiento' }, e0: VE0(),
      },
      fuentes: [carga('Q', L('Q'), L('l'), 0)],
      particula: { nombre: 'Carga q', q: L('q'), m: L('m'), x: 0, y: 0, v0: 0, alfa: 0, resorte: { x: -0.25, y: 0, k: L('k'), L0: 0.25 }, b: L('b') },
      duracion: 3, ejeMov: 'x', lineaU: { eje: 'x', en: 0 }, sonda: { x: 0.15, y: 0.17 }, caja: [-0.45, 0.5, -0.28, 0.28], porMicro: 2,
    },
    {
      clave: 'mext-2015-1-4', titulo: 'Máximo acercamiento a Q', tipo: 'MEXT', anio: '2015 1-(4)',
      vars: { Q: vq('Q', 4, { max: 8 }), q: vq('q', 1), m: vm(2), Lq: vL('L', 1, 0.3, 2), v: vv('v', 6, 0.5, 10, 0.1), k: VK() },
      fuentes: [carga('Q', L('Q'), 0, 0)],
      particula: { nombre: 'Carga q', q: L('q'), m: L('m'), x: L('Lq'), y: 0, v0: L('v'), alfa: 180 },
      duracion: 0.6, ejeMov: 'x', lineaU: { eje: 'x', en: 0 }, sonda: { x: 0.5, y: 0.3 }, radioChoque: 0.01, caja: [-0.35, 1.45, -0.45, 0.45],
      ficha: 'Punto de retorno', porMicro: 4,
    },
    {
      clave: 'mext-2013-1-3', titulo: 'Campo en C paralelo a AB', tipo: 'MEXT', anio: '2013 1-(3)',
      vars: { qp: vq('q′', -2, { min: -3, max: -0.1 }), a: vL('a', 1, 0.4, 2), k: VK() },
      fuentes: [carga('A', L('qp', -1 / (2 * Math.SQRT2)), 0, 0), carga('B', L('qp'), L('a'), 0)],
      puntos: [{ nombre: 'C', x: 0, y: L('a'), lado: 'no' }],
      guias: [{ puntos: [[0, 0], [L('a'), 0], [0, L('a')]], cerrada: true }],
      sonda: { x: 0, y: 1 }, sondaEn: 0, caja: [-0.7, 1.5, -0.45, 1.35],
    },
    {
      clave: 'mext-2010-4-a', titulo: 'Potencial en A, B y C', tipo: 'MEXT', anio: '2010 4-A',
      vars: { Q: vq('Q', 1), a: vL('a', 0.25, 0.1, 0.6, 0.01), k: VK() },
      fuentes: [carga('Q1', L('Q'), L('a', -2), L('a', 2), { nombre: '+Q' }), carga('Q2', L('Q', -1), L('a', 2), L('a', 2), { nombre: '−Q' }),
        carga('Q3', L('Q', -1), L('a', -2), L('a', -2), { nombre: '−Q' }), carga('Q4', L('Q'), L('a', 2), L('a', -2), { nombre: '+Q' })],
      puntos: [{ nombre: 'A', x: 0, y: L('a'), V: true, lado: 'ne' }, { nombre: 'B', x: 0, y: 0, V: true, lado: 'se' }, { nombre: 'C', x: L('a'), y: L('a', -1), V: true, lado: 'se' }],
      guias: [{ puntos: [[L('a', -2), L('a', -2)], [L('a', 2), L('a', -2)], [L('a', 2), L('a', 2)], [L('a', -2), L('a', 2)]], cerrada: true }],
      sonda: { x: -0.25, y: -0.25 }, caja: [-0.8, 0.8, -0.72, 0.72], sinEjes: true,
    },
    {
      clave: 'mext-2008-2', titulo: 'Rapidez mínima de escape', tipo: 'MEXT', anio: '2008 P2',
      vars: { q: vq('q', 1), a: vL('a', 1, 0.4, 2), m: vm(2), v0: vv('v', 3.57, 0, 6, 0.01, '0'), k: VK() },
      fuentes: [carga('A', L('q'), L('a', -1), 0), carga('B', L('q'), L('a'), 0)],
      puntos: [{ nombre: 'C', x: 0, y: 0, V: true, lado: 'ne' }, { nombre: 'D', x: 0, y: L('a', -1), V: true, lado: 'no' }],
      particula: { nombre: 'Partícula', q: L('q', -1), m: L('m'), x: 0, y: L('a', -1), v0: L('v0'), alfa: 90 },
      duracion: 5, ejeMov: 'y', lineaU: { eje: 'y', en: 0 }, sonda: { x: -1.3, y: 1.1 }, caja: [-2, 2, -1.5, 2.6],
    },
    {
      clave: 'mext-2006-1-2', titulo: 'Campo en el vértice P', tipo: 'MEXT', anio: '2006 1-(2)',
      vars: { q: vq('q', 1), d: vL('d', 1, 0.4, 2), k: VK() },
      fuentes: [carga('N', L('q', -1), L('d', -0.5), 0, { nombre: '−q' }), carga('M', L('q'), L('d', 0.5), 0, { nombre: '+q' })],
      puntos: [{ nombre: 'P', x: 0, y: L('d', S3), lado: 'no' }],
      guias: [{ puntos: [[L('d', -0.5), 0], [L('d', 0.5), 0], [0, L('d', S3)]], cerrada: true }],
      sonda: { x: 0, y: S3 }, sondaEn: 0, caja: [-1.1, 1.1, -0.4, 1.25],
    },
  ];
  const BASE = { vars: {}, fuentes: [], puntos: [], guias: [], particula: null, camino: null, gauss: null, sonda: { x: 0.5, y: 0.5 }, duracion: 0, ejeMov: 'y', lineaU: null, porMicro: 16, radioChoque: null, caja: null, ficha: null, graficas: null, perfil: 'x' };
  const copia = o => JSON.parse(JSON.stringify(o));
  const completa = def => {
    const o = copia({ ...BASE, ...def });
    o.capas = { lineas: true, equi: true, mapa: false, malla: false, vectores: true, traza: true, ...(def.capas || {}) };
    o.vista = { fuentes: 'fijas', porMicro: def.porMicro ?? 16, dVauto: true, dV: 2000, malla: 'log', vectorSonda: true, fichaSonda: true, perfil: def.perfil || 'x' };
    // La sonda puede empezar sobre un punto con nombre
    if (def.sondaEn != null && o.puntos[def.sondaEn]) { o.sonda = { x: o.puntos[def.sondaEn].x, y: o.puntos[def.sondaEn].y }; }
    return o;
  };
  const escenaDe = clave => ESCENAS.find(e => e.clave === clave) || ESCENAS.find(e => e.clave === 'mext-2020-2');

  // ---------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------
  /** @type {any} */ let ESC = completa(escenaDe('mext-2020-2'));
  const V = () => ESC.vars;
  const vsi = n => { const d = V()[n]; return d ? d.val * d.si : NaN; };
  const ligada = p => p != null && typeof p === 'object' && !Array.isArray(p);
  const valor = p => (ligada(p) ? p.f * vsi(p.v) : p);
  const nombresVar = () => Object.keys(V()).filter(k => !V()[k].constante);
  const fuentePorId = id => ESC.fuentes.find(f => f.id === id);
  const conParticula = () => !!ESC.particula;
  const estatica = () => !ESC.particula && !ESC.camino;
  const DUR = () => (estatica() ? 1 : ESC.duracion || 1);

  // Resolución a SI (lo que recibe el motor)
  function resolverFuente(f) {
    const r = { id: f.id, nombre: f.nombre, tipo: f.tipo, x: valor(f.x ?? 0), y: valor(f.y ?? 0) };
    if (f.tipo === 'puntual' || f.tipo === 'esfera' || f.tipo === 'segmento' || f.tipo === 'anillo') r.q = valor(f.q);
    if (f.tipo === 'esfera' || f.tipo === 'anillo') r.radio = valor(f.radio);
    if (f.tipo === 'esfera') r.conductora = !!f.conductora;
    if (f.tipo === 'hilo') r.lambda = valor(f.lambda);
    if (f.tipo === 'segmento' || f.tipo === 'lamina') r.largo = f.largo == null ? Infinity : valor(f.largo);
    if (f.tipo === 'lamina') r.sigma = valor(f.sigma);
    if (f.tipo === 'uniforme') { r.E0 = valor(f.E0); delete r.x; delete r.y; }
    if (['segmento', 'anillo', 'lamina', 'uniforme'].includes(f.tipo)) r.angulo = (f.angulo || 0) * GR;
    return r;
  }
  let FUENTES = [], PART = null, CAM = null;
  function resolverEscena() {
    FUENTES = ESC.fuentes.map(resolverFuente);
    const p = ESC.particula;
    PART = p ? { id: 'P', nombre: p.nombre, x: valor(p.x), y: valor(p.y), q: valor(p.q), m: valor(p.m), v0: valor(p.v0 ?? 0), alfa: p.alfa || 0 } : null;
    if (PART && p.resorte) PART.resorte = { x: valor(p.resorte.x), y: valor(p.resorte.y), k: valor(p.resorte.k), L0: valor(p.resorte.L0) };
    if (PART && p.b != null) PART.b = valor(p.b);
    const c = ESC.camino;
    CAM = c ? { pts: c.puntos.map(([x, y]) => [valor(x), valor(y)]), q: valor(c.q), nombre: c.nombre || 'Q' } : null;
  }

  // Longitud característica de la escena (escala de vectores, choques y eventos)
  function Lc() {
    const caja = ESC.caja;
    if (caja) return Math.min(caja[1] - caja[0], caja[3] - caja[2]) / 3;
    const xs = FUENTES.filter(f => f.x != null).map(f => [f.x, f.y]);
    if (PART) xs.push([PART.x, PART.y]);
    if (xs.length < 2) return 0.5;
    let d = 0; for (const a of xs) for (const b of xs) d = Math.max(d, Math.hypot(a[0] - b[0], a[1] - b[1]));
    return d / 2 || 0.5;
  }

  // ---------------------------------------------------------------------
  // Física: motor puro (probado aparte)
  // ---------------------------------------------------------------------
  let SIM = null, ERROR = null;
  function simular() {
    resolverEscena(); ERROR = null; SIM = null;
    if (PART) {
      const [vx, vy] = componentesVelocidad(PART.v0, PART.alfa);
      const libre = { id: 'P', nombre: PART.nombre, x: PART.x, y: PART.y, q: PART.q, m: PART.m, vx, vy };
      if (PART.resorte) libre.resorte = PART.resorte;
      if (PART.b > 0) libre.b = PART.b;
      try {
        const sim = simularCargas({ fijas: FUENTES, libres: [libre] }, {
          duracion: DUR(), rtol: 1e-10, atol: 1e-10, maxPasos: 200000, hMax: DUR() / 1600,
          radioChoque: ESC.radioChoque ?? 0.02 * Lc(), escalaLongitud: Lc(),
        });
        // Nombres del examen cuando la partícula sale de un punto con nombre
        const pIni = puntosRes().find(pt => Math.hypot(pt.x - PART.x, pt.y - PART.y) < 1e-9 * Lc());
        const eventos = sim.eventos.map(e => {
          if (!pIni) return e;
          if (e.tipo === 'inicio') return { ...e, nombre: `${e.nombre} en ${pIni.nombre}` };
          return e.nombre === 'Vuelve al inicio' ? { ...e, nombre: `Vuelve a ${pIni.nombre}` } : e;
        });
        // En una oscilación amortiguada los retornos se amontonan junto al equilibrio: se omiten
        // los que caen muy cerca del anterior
        let ultimoRet = null;
        const filtrados = eventos.filter(e => {
          if (e.tipo !== 'retorno') return true;
          const cerca = ultimoRet && Math.hypot(e.x - ultimoRet.x, e.y - ultimoRet.y) < 2e-3 * Lc() * (PART.b > 0 ? 10 : 1);
          ultimoRet = e; return !cerca;
        });
        SIM = { sim, T: sim.solucion.t, S: sim.solucion.y, eventos: filtrados, tFin: sim.tFin, choque: sim.choque, E0: sim.E0, deriva: sim.deriva };
        if (sim.estado !== 'completo' && sim.estado !== 'evento') ERROR = 'La simulación se detuvo antes del final; se muestra lo simulado.';
      } catch (e) { ERROR = e.message; }
    }
    if (CAM) prepararCamino();
    claveGauss = '';
  }
  const tFin = () => (SIM ? SIM.tFin : DUR());
  const estado = tt => (SIM ? estadoEn(SIM.sim, tt) : PART ? { x: PART.x, y: PART.y, vx: 0, vy: 0 } : null);
  const energia = s => (SIM ? energiaEstado(SIM.sim, SIM.S[0].length > 4 ? [s.x, s.y, s.vx, s.vy, s.Wd || 0] : [s.x, s.y, s.vx, s.vy]) : { K: 0, U: 0, Ue: 0, Wd: 0 });
  const estadoCompleto = tt => {
    const s = estado(tt); if (!SIM || SIM.S[0].length <= 4) return s;
    // Con amortiguamiento, la energía disipada va al final del vector de estado
    let i = SIM.T.findIndex(x => x >= tt); if (i < 0) i = SIM.T.length - 1;
    const j = Math.max(0, i - 1), a = SIM.T[j], b = SIM.T[i];
    const u = b > a ? (tt - a) / (b - a) : 0; s.Wd = SIM.S[j][4] + (SIM.S[i][4] - SIM.S[j][4]) * Math.min(1, Math.max(0, u));
    return s;
  };

  // Camino de la carga de prueba: largo, puntos y trabajo acumulado
  let CAMDAT = null;
  function prepararCamino() {
    const pts = CAM.pts, seg = [];
    let Ltot = 0;
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); Ltot += d; }
    const punto = s => {
      let r = s * Ltot;
      for (let i = 0; i < seg.length; i++) {
        if (r <= seg[i] || i === seg.length - 1) { const u = seg[i] ? Math.min(1, r / seg[i]) : 0; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u]; }
        r -= seg[i];
      }
      return pts[pts.length - 1].slice();
    };
    const muestras = [];
    let W = 0, prev = punto(0);
    for (let k = 0; k <= 200; k++) {
      const s = k / 200, p = punto(s);
      if (k > 0) W += trabajoCamino(FUENTES, CAM.q, [prev, p], 8).externo;
      const [ex, ey] = campo(FUENTES, p[0], p[1]);
      muestras.push({ s, l: s * Ltot, x: p[0], y: p[1], V: potencial(FUENTES, p[0], p[1]), E: Math.hypot(ex, ey), W });
      prev = p;
    }
    CAMDAT = { Ltot, punto, muestras, W: trabajoCamino(FUENTES, CAM.q, pts).externo };
  }
  const sCamino = tt => Math.max(0, Math.min(1, tt / DUR()));
  function caminoEn(tt) {
    const s = sCamino(tt), p = CAMDAT.punto(s), m = CAMDAT.muestras, i = Math.min(m.length - 2, Math.floor(s * 200)), u = s * 200 - i;
    return { s, x: p[0], y: p[1], W: m[i].W + (m[i + 1].W - m[i].W) * u, V: potencial(FUENTES, p[0], p[1]) };
  }

  const puntosRes = () => ESC.puntos.map(p => ({ ...p, x: valor(p.x), y: valor(p.y) }));

  // ---------------------------------------------------------------------
  // Estado de la interfaz
  // ---------------------------------------------------------------------
  let t = 0, jugando = false, velocidad = 1, ultimo = 0, encuadreHecho = false, escala0 = 1;
  const lienzo = $('#lienzo'), area = $('#area');
  const tz = new Trazo(lienzo);
  let arrastre = null, paneo = null, hover = null, herramienta = null, sel = 'P';
  let NIV = { paso: 2000, niveles: [], lo: 0, hi: 1 }, claveNiveles = '';
  let historial = null, autoguardar = false;
  const mostrar = { fuerza: true, velocidad: true, prevista: true, fuerzaFija: {} };

  // Escalas de dibujo: |E| típico en la vista (mediana en una malla gruesa
  // del encuadre), fuerza típica y rapidez máxima de la partícula
  let ESCALAS = null;
  function escalas() {
    if (ESCALAS) return ESCALAS;
    const Lch = Lc(), caja = cajaEscena(), vals = [];
    for (let i = 0; i < 12; i++) for (let j = 0; j < 8; j++) {
      const x = caja.x0 + (caja.x1 - caja.x0) * (i + 0.5) / 12, y = caja.y0 + (caja.y1 - caja.y0) * (j + 0.5) / 8;
      const e = Math.hypot(...campo(FUENTES, x, y)); if (isFinite(e) && e > 0) vals.push(e);
    }
    vals.sort((a, b) => a - b);
    const Eref = vals.length ? vals[Math.floor(vals.length / 2)] : 1;
    let Fref = 1, vref = 1;
    if (SIM) {
      const Fs = SIM.S.map(s => Math.abs(PART.q) * Math.hypot(...campo(FUENTES, s[0], s[1]))).filter(isFinite).sort((a, b) => a - b);
      Fref = Fs[Math.floor(Fs.length * 0.6)] || Fs[Fs.length - 1] || 1;
      vref = Math.max(...SIM.S.map(s => Math.hypot(s[2], s[3]))) || 1;
    }
    ESCALAS = { E: 0.45 * Lch / Eref, F: 0.7 * Lch / Fref, v: 0.6 * Lch / vref, Eref };
    return ESCALAS;
  }
  // Fuentes del campo dibujado: las fijas, o también la partícula ("Todas las cargas")
  const fuentesEn = s => (ESC.vista.fuentes === 'todas' && PART && s ? [...FUENTES, { id: 'P', q: PART.q, x: s.x, y: s.y }] : FUENTES);

  function actualizarNiveles() {
    const v = tz.vista, f0 = fuentesEn(estado(0));
    const clave = [v.escala, v.ox, v.oy, tz.w, tz.h, ESC.vista.fuentes, ESC.vista.dVauto, ESC.vista.dV, JSON.stringify(f0)].join('|');
    if (clave === claveNiveles) return;
    claveNiveles = clave;
    NIV = nivelesAuto(tz, (x, y) => potencial(f0, x, y), ESC.vista.dVauto ? 0 : ESC.vista.dV);
  }
  // Número sin ceros sobrantes: 12.5 → "12.5", 10 → "10", −4 → "−4"
  const limpio = (n, dec = 3) => (Math.abs(n) < 1e-12 ? '0' : String(+n.toFixed(dec)).replace('-', '−'));
  const etiquetaV = Vn => (NIV.paso >= 100 ? limpio(Vn / 1e3) + ' kV' : limpio(Vn, 2) + ' V');

  // ---------------------------------------------------------------------
  // Texto de magnitudes ligadas: f·variable con factores del examen
  // (a, −a, 2a, a/2, √3a/2, √2q′/4…)
  // ---------------------------------------------------------------------
  function factorTexto(f) {
    const s = f < 0 ? '−' : '', a = Math.abs(f);
    if (Math.abs(a - 1) < 1e-9) return { pre: s, post: '' };
    for (const den of [1, 2, 3, 4, 6, 8]) { const n = Math.round(a * den); if (n >= 1 && n <= 24 && Math.abs(a * den - n) < 1e-7) return { pre: s + (n > 1 ? n : ''), post: den > 1 ? '/' + den : '' }; }
    for (const [r, txt] of [[Math.SQRT2, '√2'], [Math.sqrt(3), '√3']]) {
      for (const den of [1, 2, 3, 4, 6, 8]) { const n = Math.round(a * den / r); if (n >= 1 && n <= 12 && Math.abs(a * den / r - n) < 1e-7) return { pre: s + (n > 1 ? n : '') + txt, post: den > 1 ? '/' + den : '' }; }
    }
    return { pre: s + fmt(a, 3) + '·', post: '' };
  }
  const nombreVar = d => d.sim + (d.sub || '');

  // ---------------------------------------------------------------------
  // Encuadre
  // ---------------------------------------------------------------------
  function cajaEscena() {
    if (ESC.caja && !ESC.encuadreParticula) return { x0: ESC.caja[0], x1: ESC.caja[1], y0: ESC.caja[2], y1: ESC.caja[3] };
    const xs = [], ys = [];
    for (const f of FUENTES) if (f.x != null) { xs.push(f.x); ys.push(f.y); }
    for (const p of puntosRes()) { xs.push(p.x); ys.push(p.y); }
    if (PART) { xs.push(PART.x); ys.push(PART.y, -Math.abs(PART.y)); }
    if (!xs.length) { xs.push(-1, 1); ys.push(-1, 1); }
    const a = Lc();
    return { x0: Math.min(...xs) - 1.2 * a, x1: Math.max(...xs) + 1.2 * a, y0: Math.min(...ys) - 0.45 * a, y1: Math.max(...ys) + 0.55 * a };
  }
  function encuadrar() {
    tz.vista.encuadrar(cajaEscena(), { x: 0, y: 40, w: tz.w, h: tz.h - 80 }, 24);
    encuadreHecho = true; claveNiveles = '';
  }

  // ---------------------------------------------------------------------
  // Dibujo del lienzo
  // ---------------------------------------------------------------------
  let claveGauss = '', GAUSS = null, materiaVec = [];
  function lecturaGauss(fuentes) {
    const g = ESC.gauss; if (!g) return null;
    const clave = JSON.stringify([fuentes, g]);
    if (clave === claveGauss && GAUSS) return GAUSS;
    claveGauss = clave;
    const c = { x: valor(g.x), y: valor(g.y) }, R = valor(g.R), Lg = valor(g.L ?? 1);
    const Q = cargaEncerrada(fuentes, g.forma === 'cilindro' ? { forma: 'cilindro', x: c.x, y: c.y, R, L: Lg } : { forma: 'esfera', x: c.x, y: c.y, R });
    // Flujo por cuadratura (independiente de Q): lo que «mide» la superficie.
    // Si la superficie corta una distribución (un hilo que la atraviesa, un
    // segmento o una lámina a medias) el integrando es singular o salta y la
    // cuadratura solo es aproximada: se dice en la ficha.
    const forma = g.forma === 'cilindro' ? { forma: 'cilindro', x: c.x, y: c.y, R, L: Lg } : { forma: 'esfera', x: c.x, y: c.y, R };
    const cerca = fuentes.some(f => f.x != null && (!f.tipo || f.tipo === 'puntual') && Math.abs(Math.hypot(f.x - c.x, f.y - c.y) - R) < 0.02 * R);
    const aprox = fuentes.some(f => {
      if (!f.tipo || f.tipo === 'puntual' || f.tipo === 'uniforme') return false;
      if (f.tipo === 'hilo') return g.forma !== 'cilindro' && Math.hypot(f.x - c.x, f.y - c.y) < R;
      const q1 = cargaEncerrada([f], forma), tot = f.tipo === 'lamina' ? NaN : f.q;
      return q1 !== 0 && !(Math.abs(q1 - tot) <= 1e-12 * Math.abs(tot));
    });
    const phi = cerca ? NaN : g.forma === 'cilindro' ? flujoCilindro(fuentes, c, R, Lg, aprox ? 48 : 32) : flujoEsfera(fuentes, c, R, aprox ? 72 : 40);
    GAUSS = { c, R, L: Lg, Q, phi, aprox };
    return GAUSS;
  }

  function dibujar() {
    if (!encuadreHecho) encuadrar();
    actualizarNiveles();
    const v = tz.vista, s = estado(Math.min(t, tFin())), ES = escalas();
    const fuentes = fuentesEn(s);
    const Vdib = (x, y) => potencial(fuentes, x, y), Edib = (x, y) => campo(fuentes, x, y);
    const geo = FUENTES.map(f => tz.electroGeometria(f));
    const huecos = geo.filter(g => g && g.r != null).map(g => [g.x, g.y, g.r + 3]);
    if (s) huecos.push([...v.P([s.x, s.y]), G.carga + 3]);
    const puntos = puntosRes();
    const huecosEjes = [...huecos, ...puntos.map(p => [...v.P([p.x, p.y]), 12]), ...(SIM ? SIM.eventos.filter(e => e.t > 0).map(e => [...v.P([e.x, e.y]), 10]) : []), ...(s && ESC.capas.vectores ? huecosVectores(s, ES) : [])];

    // 1–2. Fondo, mapa de potencial y equipotenciales
    tz.limpiar(); tz.cuadricula();
    if (ESC.capas.mapa) tz.mapaPotencial(Vdib, { escala: Math.max(Math.abs(NIV.lo), Math.abs(NIV.hi), 1) });
    const polis = ESC.capas.equi ? tz.equipotenciales(Vdib, NIV.niveles) : [];

    // 5. Construcción: ejes, camino, trayectorias, eventos, superficie gaussiana
    if (!ESC.sinEjes) tz.ejesLibres({ x: 'x', y: 'y' }, huecosEjes);
    for (const g of ESC.guias || []) { const pts = g.puntos.map(([x, y]) => [valor(x), valor(y)]); tz.linea(g.cerrada ? [...pts, pts[0]] : pts, { color: 'texto-3', grosor: 1, patron: 'auxiliar' }); }
    if (CAM) tz.electroCamino(CAM.pts, sCamino(t));
    if (SIM) {
      const muestra = (t0, t1) => { const p = []; for (let i = 0; i < SIM.T.length && SIM.T[i] <= t1; i++) if (SIM.T[i] >= t0) p.push([SIM.S[i][0], SIM.S[i][1]]); const e = estado(t1); p.push([e.x, e.y]); return p; };
      if (mostrar.prevista) tz.trayectoria(muestra(0, SIM.tFin), 'prevista');
      if (ESC.capas.traza && t > 0) tz.trayectoria(muestra(0, Math.min(t, SIM.tFin)), 'real');
      const s0 = SIM.S[0];
      if (Math.hypot(s.x - s0[0], s.y - s0[1]) * v.escala > 3) tz.fantasma([s0[0], s0[1]], { radio: G.carga });
      const evs = SIM.eventos.filter(e => e.t > 0), vistos = [];
      const unaVez = e => { const [x, y] = v.P([e.x, e.y]); if (vistos.some(([a, b]) => Math.hypot(a - x, b - y) < 4)) return false; vistos.push([x, y]); return true; };
      evs.filter(e => e.t <= t + 1e-9).forEach(e => { if (unaVez(e)) tz.eventoAnillo([e.x, e.y]); });
      evs.filter(e => e.t > t + 1e-9).forEach(e => { if (unaVez(e)) { tz.ctx.save(); tz.ctx.globalAlpha = 0.45; tz.eventoAnillo([e.x, e.y]); tz.ctx.restore(); } });
    }
    const gauss = lecturaGauss(fuentes);

    // 6. Materia: resorte y pared, distribuciones, cargas, partícula, carga de prueba
    if (PART && PART.resorte && s) {
      const r = PART.resorte, h = 0.12 * Lc();
      tz.superficie([[r.x, r.y - h], [r.x, r.y + h]], { lado: 'izq' });
      tz.resorte([r.x, r.y], [s.x - G.carga / v.escala, s.y]);
    }
    FUENTES.forEach(f => tz.electroFuente(f, { seleccionada: sel === f.id, hover: hover === f.id && !arrastre }));
    for (const p of puntos) tz.electroPunto([p.x, p.y], null);
    if (s) tz.carga([s.x, s.y], PART.q >= 0 ? 1 : -1, { seleccionada: sel === 'P' });
    let cam = null;
    if (CAM) { cam = caminoEn(t); tz.carga([cam.x, cam.y], CAM.q >= 0 ? 1 : -1, { seleccionada: sel === 'camino' }); }

    // 7. Magnitudes: líneas de campo, malla de E, fuerza y velocidad
    const ocultar = ESC.vista.fuentes === 'fijas' && s ? [[...v.P([s.x, s.y]), G.carga + 1.5]] : [];
    if (cam) ocultar.push([...v.P([cam.x, cam.y]), G.carga + 1.5]);
    if (ESC.capas.lineas) tz.electroLineas(fuentes, Edib, { porCoulomb: ESC.vista.porMicro * 1e6, halo: ESC.capas.mapa, ocultar, epsilon0: EPSILON_0 });
    if (ESC.capas.malla) tz.mallaCampo(Edib, { Eref: ES.Eref, escalaTipo: ESC.vista.malla, evitar: huecos.map(h => [h[0], h[1], 22]), halo: ESC.capas.mapa });
    // Las etiquetas de los vectores se apartan de la materia (cargas, placas, anillos)
    materiaVec = obstaculos(null, null).filter(o => o[2] - o[0] < 400);
    const etiquetasVec = [];
    if (ESC.capas.vectores) {
      if (s) vectoresParticula(s, ES, etiquetasVec);
      if (cam) vectorCamino(cam, ES, etiquetasVec);
      for (const f of FUENTES) if (f.tipo === 'puntual' && mostrar.fuerzaFija[f.id]) vectorFuerzaFija(f, s, ES, etiquetasVec);
    }

    // 8. Instrumentos: superficie gaussiana (encima de la materia: puede estar dentro de un
    // conductor) con su lectura, y sonda de campo
    if (gauss) tz.electroGauss([gauss.c.x, gauss.c.y], gauss.R, { seleccionada: sel === 'gauss', hover: hover === 'gauss' && !arrastre });
    const ocupado = gauss ? fichaGauss(gauss, [...etiquetasVec, ...obstaculos(s, cam), zonaSonda(Edib, ES)]) : [];
    ocupado.push(...dibujarSonda(Edib, Vdib, ES, [...ocupado, ...etiquetasVec, ...obstaculos(s, cam)]));

    // 9. Anotaciones: valores de las equipotenciales, nombres, fichas
    const evitar = [...huecos.map(h => [h[0], h[1], 16]), [...v.P([valor(ESC.sonda.x), valor(ESC.sonda.y)]), 18], ...puntos.map(p => [...v.P([p.x, p.y]), 14])];
    const [X0, Y0] = v.P([0, 0]), bandasEjes = ESC.sinEjes ? [] : [[0, Y0 + 2, tz.w, Y0 + 18], [X0 - 44, 0, X0 - 2, tz.h]];
    const etiquetas = etiquetasEscena(s, cam);
    const fe = fichaEvento(); if (fe) ocupado.push(fe);
    if (cam && CAMDAT) ocupado.push(fichaCamino(cam));
    // Tampoco bajo la barra de escala ni bajo las barras flotantes del lienzo
    const zonas = [...tz.zonasFlotantes().map(z => [z.x, z.y, z.x + z.w, z.y + z.h]), [10, tz.h - 74, 150, tz.h - 42]];
    if (ESC.capas.equi) tz.etiquetasEquipotenciales(polis, { formato: etiquetaV, evitar, ocupado: [...ocupado, ...etiquetasVec, ...bandasEjes, ...etiquetas, ...zonas] });

    // 10. Edición: hover, guías de arrastre
    if (hover && !arrastre) {
      if (hover === 'sonda') tz.contornoHover([valor(ESC.sonda.x), valor(ESC.sonda.y)], GE.sonda);
      else if (hover === 'P' && s) tz.contornoHover([s.x, s.y], G.carga);
    }
    if (arrastre && (arrastre.tipo === 'fuente' || arrastre.tipo === 'particula')) guiaArrastre(arrastre.id);
    tz.barraEscala(16, tz.h - 56);
  }

  // Zonas de las etiquetas de los vectores de la partícula (los números de los ejes no van debajo)
  function huecosVectores(s, ES) {
    const v = tz.vista, [x, y] = v.P([s.x, s.y]), [ex, ey] = campo(FUENTES, s.x, s.y), r = [];
    for (const [vec, k] of [[[PART.q * ex, PART.q * ey], ES.F], [[s.vx, s.vy], ES.v]]) {
      const m = Math.hypot(...vec); if (!(m > 0)) continue;
      const Lp = Math.min(130, m * k * v.escala), ux = vec[0] / m, uy = -vec[1] / m;
      r.push([x + ux * (Lp + G.carga + 40), y + uy * (Lp + G.carga + 12), 58]);
    }
    return r;
  }

  // Vector fuerza (interacción) y velocidad (movimiento) sobre la partícula.
  // Si son casi paralelos se dibujan lado a lado, separados 3.5 px.
  function vectoresParticula(s, ES, ocupado) {
    const v = tz.vista, [ex, ey] = campo(FUENTES, s.x, s.y), F = [PART.q * ex, PART.q * ey], Fm = Math.hypot(...F), vm = Math.hypot(s.vx, s.vy);
    const items = [];
    if (mostrar.fuerza && Fm * ES.F * v.escala > 2) items.push({ vec: F, k: ES.F * v.escala, familia: 'interaccion', simbolo: 'F', valor: Fm, unidad: 'N', prefijo: true });
    if (mostrar.velocidad && vm * ES.v * v.escala > 2) items.push({ vec: [s.vx, s.vy], k: ES.v * v.escala, familia: 'movimiento', simbolo: 'v', valor: vm, unidad: 'm/s' });
    // Largo máximo de 130 px: el valor exacto está en la etiqueta
    items.forEach(it => { const Lp = Math.hypot(...it.vec) * it.k; if (Lp > 130) it.k *= 130 / Lp; });
    items.sort((p, q) => Math.hypot(...q.vec) * q.k - Math.hypot(...p.vec) * p.k);
    const unit = w => { const m = Math.hypot(...w); return [w[0] / m, w[1] / m]; };
    const paralelos = items.length === 2 && (([a, b], [c, d]) => a * c + b * d)(unit(items[0].vec), unit(items[1].vec)) > 0.985;
    items.forEach((it, i) => {
      const [ux, uy] = unit(it.vec), d = paralelos ? (i ? 3.5 : -3.5) / v.escala : 0;
      it.origen = [s.x - uy * d, s.y + ux * d];
      it.punta = tz.vector(it.origen, it.vec, { familia: it.familia, escalaPx: it.k, desdeRadio: G.carga + 1 });
      const rBorde = (G.carga + 1) / v.escala;
      it.origen = [it.origen[0] + ux * rBorde, it.origen[1] + uy * rBorde];
      const [ox, oy] = v.P(it.origen), [px, py] = it.punta;
      ocupado.push([Math.min(ox, px) - 6, Math.min(oy, py) - 6, Math.max(ox, px) + 6, Math.max(oy, py) + 6]);
    });
    items.slice().reverse().forEach(it => etiquetaVector(...v.P(it.origen), it, ocupado));
  }
  function vectorFuerzaFija(c, s, ES, ocupado) {
    const otras = [...FUENTES.filter(f => f.id !== c.id), ...(s ? [{ q: PART.q, x: s.x, y: s.y }] : [])];
    const [ex, ey] = campo(otras, c.x, c.y), F = [c.q * ex, c.q * ey], Fm = Math.hypot(...F);
    let k = ES.F * tz.vista.escala; if (Fm * k > 160) k = 160 / Fm;
    if (!(Fm * k >= 2)) return;
    const [x, y] = tz.vista.P([c.x, c.y]), it = { vec: F, k, familia: 'interaccion', simbolo: 'F', sub: c.nombre, valor: Fm, unidad: 'N', prefijo: true };
    it.punta = tz.vector([c.x, c.y], F, { familia: 'interaccion', escalaPx: k, desdeRadio: G.carga + 1 });
    const r = (G.carga + 1) / Fm;
    etiquetaVector(x + F[0] * r, y - F[1] * r, it, ocupado);
  }
  // Fuerza eléctrica sobre la carga de prueba del camino (la del agente es la opuesta)
  function vectorCamino(cam, ES, ocupado) {
    const [ex, ey] = campo(FUENTES, cam.x, cam.y), F = [CAM.q * ex, CAM.q * ey], Fm = Math.hypot(...F);
    if (!(Fm > 0)) return;
    const k = Math.min(ES.E * tz.vista.escala / Math.abs(CAM.q), 120 / Fm);
    const [x, y] = tz.vista.P([cam.x, cam.y]), it = { vec: F, k, familia: 'interaccion', simbolo: 'F', valor: Fm, unidad: 'N', prefijo: true };
    it.punta = tz.vector([cam.x, cam.y], F, { familia: 'interaccion', escalaPx: k, desdeRadio: G.carga + 1 });
    const r = (G.carga + 1) / Fm;
    etiquetaVector(x + F[0] * r, y - F[1] * r, it, ocupado);
  }
  // Etiqueta ISO en la punta (misma regla que Trazo.vector), desplazada si choca
  function etiquetaVector(x, y, it, ocupado) {
    const [x2, y2] = it.punta, ang = Math.atan2(y2 - y, x2 - x), c = Math.cos(ang);
    let lx = x2 + c * 10 + (c >= 0 ? 2 : -2), ly = y2 + Math.sin(ang) * 10 + 5;
    const alinear = c >= -0.2 ? 'left' : 'right', w = 104;
    const caja = () => (alinear === 'left' ? [lx, ly - 13, lx + w, ly + 4] : [lx - w, ly - 13, lx, ly + 4]);
    for (let n = 0; n < 4 && [...ocupado, ...materiaVec].some(r => r[0] < caja()[2] && caja()[0] < r[2] && r[1] < caja()[3] && caja()[1] < r[3]); n++) ly += Math.sin(ang) >= 0 ? 17 : -17;
    tz.etiquetaMagnitud(lx, ly, { simbolo: it.simbolo, sub: it.sub, subRecto: true, valor: it.valor, unidad: it.unidad, color: it.familia, alinear, prefijo: it.prefijo });
    ocupado.push(caja());
  }

  // Cajas (px) de lo que una ficha no debe tapar: cargas con su nombre, distribuciones, puntos y partícula
  function obstaculos(s, cam) {
    const v = tz.vista, r = [];
    for (const f of FUENTES) {
      const g = tz.electroGeometria(f); if (!g) continue;
      if (g.r != null) r.push([g.x - Math.max(g.r, 46), g.y - g.r - 24, g.x + Math.max(g.r, 46), g.y + g.r + 2]);
      else r.push([Math.min(g.a[0], g.b[0]) - 10, Math.min(g.a[1], g.b[1]) - 10, Math.max(g.a[0], g.b[0]) + 10, Math.max(g.a[1], g.b[1]) + 10]);
    }
    for (const p of puntosRes()) { const [x, y] = v.P([p.x, p.y]); r.push([x - 10, y - 22, x + 64, y + 8]); }
    for (const q of [s, cam]) if (q) { const [x, y] = v.P([q.x, q.y]); r.push([x - G.carga - 4, y - G.carga - 14, x + G.carga + 60, y + G.carga + 4]); }
    if (PART && PART.resorte) {
      const e = estado(Math.min(t, tFin())), [ax, ay] = v.P([PART.resorte.x, PART.resorte.y]), [bx, by] = v.P([e.x, e.y]);
      r.push([Math.min(ax, bx) - 12, Math.min(ay, by) - 14, Math.max(ax, bx) - G.carga, Math.max(ay, by) + 14]);
    }
    return r;
  }
  const solapa = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

  // Sonda: vector E (eléctrico) y ficha con E y V. La ficha va del lado
  // contrario al vector y, si ahí tapa algo, en la primera esquina libre.
  // Devuelve las cajas que ocupa.
  function dibujarSonda(Edib, Vdib, ES, evitar = []) {
    const p = { x: valor(ESC.sonda.x), y: valor(ESC.sonda.y) }, [ex, ey] = Edib(p.x, p.y), E = Math.hypot(ex, ey), Vp = Vdib(p.x, p.y), v = tz.vista;
    const ocupado = [];
    if (ESC.vista.vectorSonda && E > 0 && isFinite(E)) {
      // Largo entre 36 y 150 px: la sonda da la dirección; el valor exacto está en su ficha
      let k = ES.E * v.escala; if (E * k > 150) k = 150 / E; if (E * k < 36) k = 36 / E;
      {
        const [x2, y2] = tz.vector([p.x, p.y], [ex, ey], { familia: 'electrico', escalaPx: k, simbolo: 'E' });
        ocupado.push([x2 - 14, y2 - 14, x2 + 24, y2 + 18]);
      }
    }
    const [x, y] = tz.sonda([p.x, p.y], { seleccionada: sel === 'sonda', hover: hover === 'sonda' && !arrastre });
    if (ESC.vista.fichaSonda) {
      const lineas = [
        [{ t: 'Sonda', f: 'ui', tam: 11.5 }],
        [{ t: 'E', f: 'sim', tam: 13, color: 'electrico' }, { t: ' = ' + conPrefijo(E, 'V/m'), f: 'num', tam: 11.5 }],
        [{ t: 'V', f: 'sim', tam: 13, color: 'electrico' }, { t: ' = ' + conPrefijo(Vp, 'V'), f: 'num', tam: 11.5 }],
      ];
      const W = 136, Hf = 56, izq0 = ex > 0, aba0 = ey > 0;
      const cand = [];
      for (const lejos of [8, 44, 84]) for (const [iz, ab] of [[izq0, aba0], [!izq0, aba0], [izq0, !aba0], [!izq0, !aba0]]) {
        const fx = iz ? x - 26 - W : x + 26, fy = Math.max(48, Math.min(tz.h - Hf - 48, y + (ab ? lejos : -Hf - lejos)));
        cand.push([fx, fy, iz]);
      }
      const dentro = c => c[0] > 8 && c[0] + W < tz.w - 8;
      const libre = c => dentro(c) && ![...evitar, ...ocupado].some(o => solapa([c[0], c[1], c[0] + W, c[1] + Hf], o));
      const [fx, fy, izquierda] = cand.find(libre) || cand.find(dentro) || cand[0];
      tz.ficha(fx, fy, lineas, { ancla: [x + (izquierda ? -10 : 10), y] });
      ocupado.push([fx, fy, fx + W, fy + Hf]);
    }
    return ocupado;
  }

  // Ficha de la superficie gaussiana: flujo medido y carga encerrada
  // Caja de la sonda con su vector y su ficha (aproximada), para que otras fichas no la tapen
  function zonaSonda(Edib, ES) {
    const p = { x: valor(ESC.sonda.x), y: valor(ESC.sonda.y) }, [x, y] = tz.vista.P([p.x, p.y]), [ex, ey] = Edib(p.x, p.y), E = Math.hypot(ex, ey);
    let k = ES.E * tz.vista.escala; if (E * k > 150) k = 150 / E; if (E * k < 36) k = 36 / (E || 1);
    const x2 = x + ex * k, y2 = y - ey * k;
    return [Math.min(x, x2) - 24, Math.min(y, y2) - 24, Math.max(x, x2) + 24, Math.max(y, y2) + 24];
  }
  function fichaGauss(g, evitar = []) {
    const v = tz.vista, [x, y] = v.P([g.c.x, g.c.y]), r = g.R * v.escala;
    const filas = [
      [{ t: ESC.gauss.forma === 'cilindro' ? `Cilindro gaussiano · L = ${cantidad(g.L, 'm', 3)}` : 'Superficie gaussiana', f: 'ui', tam: 11.5 }],
      [{ t: 'Φ', f: 'sim', tam: 13, color: 'electrico' }, { t: (g.aprox ? ' ≈ ' : ' = ') + (isFinite(g.phi) ? conPrefijo(g.phi, 'V·m') : '— (la superficie toca una carga)'), f: 'num', tam: 11.5 }, ...(g.aprox && isFinite(g.phi) ? [{ t: '  corta una distribución', f: 'ui', tam: 11, color: 'texto-3' }] : [])],
      [{ t: 'Q', f: 'sim', tam: 13 }, { t: 'enc', f: 'simRecta', tam: 9, dy: 3 }, { t: ' = ' + conPrefijo(g.Q, 'C'), f: 'num', tam: 11.5 }],
      [{ t: 'Q', f: 'sim', tam: 13 }, { t: 'enc', f: 'simRecta', tam: 9, dy: 3 }, { t: '/', f: 'num', tam: 11.5 }, { t: 'ε', f: 'sim', tam: 13 }, { t: '0', f: 'simRecta', tam: 9, dy: 3 }, { t: ' = ' + conPrefijo(g.Q / EPSILON_0, 'V·m'), f: 'num', tam: 11.5 }],
    ];
    // Ancho real de la ficha (la nota de «aproximado» la alarga)
    const c2 = tz.ctx; c2.save(); let W = 0;
    for (const f of filas) { let w = 0; for (const sg of f) { c2.font = tz._fuente(sg.f, sg.tam || 11.5); w += c2.measureText(sg.t).width; } W = Math.max(W, w + 16); }
    c2.restore();
    const H = 74, a = -Math.PI / 4;
    // Esquinas candidatas junto a la circunferencia (arriba a la derecha primero); la primera
    // que no tape la sonda ni la materia
    const k = Math.SQRT1_2, cand = [[1, -1], [-1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
      const px = x + sx * r * k, py = y + sy * r * k;
      const fx = Math.max(12, Math.min(tz.w - 12 - W, sx > 0 ? px + 14 : px - 14 - W)), fy = Math.max(48, Math.min(tz.h - H - 52, sy < 0 ? py - H - 6 : py + 6));
      return { fx, fy, ancla: [px, py] };
    });
    const libre = c => !evitar.some(o => o[0] < c.fx + W && c.fx < o[2] && o[1] < c.fy + H && c.fy < o[3]);
    const c = cand.find(libre) || cand[0];
    tz.ficha(c.fx, c.fy, filas, { ancla: c.ancla });
    return [[c.fx, c.fy, c.fx + W, c.fy + H]];
  }

  // Ficha del evento clave de la escena (Pasa por O, Punto de retorno, Choca…)
  function fichaEvento() {
    if (!SIM || !ESC.ficha) return;
    const e = SIM.eventos.find(ev => ev.t > 0 && ev.nombre.startsWith(ESC.ficha)); if (!e) return;
    const v = tz.vista, [px, py] = v.P([e.x, e.y]);
    const filas = [[{ t: e.nombre, f: 'ui', tam: 11.5 }, { t: ' · ', f: 'num', tam: 11.5, color: 'texto-3' }, { t: 't', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(e.t, 's'), f: 'num', tam: 11.5 }],
      [{ t: 'v', f: 'sim', tam: 13, color: 'movimiento' }, { t: ' = ' + cantidad(e.v, 'm/s'), f: 'num', tam: 11.5 }]];
    if (e.tipo === 'retorno' && FUENTES[0] && FUENTES[0].x != null) filas.push([{ t: 'r', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(Math.hypot(e.x - FUENTES[0].x, e.y - FUENTES[0].y), 'm'), f: 'num', tam: 11.5 }]);
    const W = 200, H = filas.length * 16 + 10;
    let fx = px - W - 16, fy = py + 40;
    if (fx < 12) fx = px + 24;
    if (fy + H > tz.h - 56) fy = py - H - 40;
    const r = tz.ficha(fx, fy, filas, { ancla: [px + (fx < px ? -3 : 3), py + (fy > py ? 8 : -8)] });
    return [fx, fy, fx + r.w, fy + r.h];
  }

  // Ficha del camino: trabajo del agente hasta ahora y en total
  function fichaCamino(cam) {
    const v = tz.vista, fin = CAM.pts[CAM.pts.length - 1], [px, py] = v.P(fin);
    const filas = [[{ t: `Se lleva ${CAM.nombre} despacio`, f: 'ui', tam: 11.5 }],
      [{ t: 'W', f: 'sim', tam: 13 }, { t: ' = ' + conPrefijo(cam.W, 'J'), f: 'num', tam: 11.5 }, { t: '  (total ' + conPrefijo(CAMDAT.W, 'J') + ')', f: 'num', tam: 11, color: 'texto-3' }]];
    const W = 250;
    let fx = px + 30, fy = py + 28;
    if (fx + W > tz.w - 12) fx = px - W - 30;
    if (fy + 40 > tz.h - 56) fy = py - 70;
    const r = tz.ficha(fx, fy, filas, { ancla: [px + (fx > px ? 6 : -6), py + 4] });
    return [fx, fy, fx + r.w, fy + r.h];
  }

  // Nombres de cargas, distribuciones y puntos, como en la figura del examen
  function textoCoord(p) {
    if (ligada(p)) { const d = V()[p.v], ft = factorTexto(p.f); return { t: ft.pre + nombreVar(d) + ft.post, f: 'sim', tam: 13, color: 'texto-2' }; }
    return { t: fmt(p, 3), f: 'num', tam: 11, color: 'texto-2' };
  }
  function coordTexto(c) {
    const libres = !ligada(c.x) && !ligada(c.y);
    if (libres && (c.x !== 0 || c.y !== 0)) return [{ t: ` (${fmt(c.x, 3)}, ${fmt(c.y, 3)}) m`, f: 'num', tam: 11, color: 'texto-3' }];
    return [{ t: ' (', f: 'ui', tam: 12, color: 'texto-2' }, textoCoord(c.x), { t: ', ', f: 'ui', tam: 12, color: 'texto-2' }, textoCoord(c.y), { t: ')', f: 'ui', tam: 12, color: 'texto-2' }];
  }
  function etiquetasEscena(s, cam) {
    const v = tz.vista, [X0, Y0] = v.P([0, 0]), cajas = [];
    const puntos = puntosRes(), ocupaO = puntos.some(p => Math.hypot(p.x, p.y) < 1e-9) || FUENTES.some(f => f.x != null && Math.hypot(f.x, f.y) < 1e-9);
    if (!ESC.sinEjes && !ocupaO && X0 > 0 && X0 < tz.w && Y0 > 0 && Y0 < tz.h) tz.compuesto([{ t: 'O', f: 'ui', tam: 12 }], X0 - 9, Y0 - 7, { alinear: 'right', color: 'texto-2' });
    ESC.fuentes.forEach((f, i) => {
      const r = FUENTES[i], g = tz.electroGeometria(r); if (!g) return;
      const segs = [{ t: f.nombre, f: 'ui', tam: 12, color: 'texto' }];
      if (f.tipo === 'puntual' && f.coords) segs.push(...coordTexto(f));
      if (g.r != null) { const res = tz.compuesto(segs, g.x, g.y - g.r - 8, { alinear: 'center' }); cajas.push([res.x, g.y - g.r - 20, res.x + res.ancho, g.y - g.r - 4]); }
      else {
        // junto al extremo izquierdo de la distribución (por la derecha suelen salir las
        // partículas), sin salir de la vista
        const p = g.a[0] < g.b[0] ? g.a : g.b, x = Math.min(tz.w - 12, Math.max(130, p[0] - 8)), y = Math.max(52, Math.min(tz.h - 60, p[1] - (f.tipo === 'anillo' ? 10 : 12)));
        const res = tz.compuesto(segs, x, y, { alinear: 'right' }); cajas.push([res.x, y - 12, res.x + res.ancho, y + 4]);
      }
    });
    // Puntos con nombre: C, P, D…, con sus coordenadas o su potencial
    for (const p of puntos) {
      const [x, y] = v.P([p.x, p.y]), lado = p.lado || 'ne';
      const enParticula = PART && Math.hypot(p.x - PART.x, p.y - PART.y) < 1e-9 * Lc();
      const enSonda = Math.hypot(p.x - valor(ESC.sonda.x), p.y - valor(ESC.sonda.y)) < 1e-9 * Lc();
      const sep = enParticula ? G.carga + 7 : enSonda ? GE.sonda + 8 : 7;
      const segs = [{ t: p.nombre, f: 'ui', tam: 12, color: 'texto' }];
      if (p.coords) segs.push(...coordTexto(ESC.puntos[puntos.indexOf(p)]));
      if (p.V) segs.push({ t: '  ' + conPrefijo(potencial(FUENTES, p.x, p.y), 'V', 3), f: 'num', tam: 11, color: 'electrico' });
      const dx = lado.includes('o') ? -sep : sep, dy = lado.includes('s') ? 16 : -6;
      const res = tz.compuesto(segs, x + dx, y + dy, { alinear: lado.includes('o') ? 'right' : 'left' });
      cajas.push([res.x, y + dy - 12, res.x + res.ancho, y + dy + 4]);
    }
    // Partícula: su carga y masa
    if (s) {
      const P = ESC.particula, [px, py] = v.P([s.x, s.y]);
      const qTxt = ligada(P.q) ? textoCoord(P.q) : { t: conPrefijo(valor(P.q), 'C', 3), f: 'num', tam: 11.5 };
      const res = tz.compuesto([{ ...qTxt, tam: ligada(P.q) ? 14 : 11.5, color: 'texto' }, { t: ', ', f: 'ui', tam: 12, color: 'texto-2' }, { t: 'm', f: 'sim', tam: 14 }], px + G.carga + 7, py - 8, {});
      cajas.push([res.x, py - 20, res.x + res.ancho, py - 4]);
    }
    if (cam) {
      const [px, py] = v.P([cam.x, cam.y]), c = ESC.camino;
      const qTxt = ligada(c.q) ? textoCoord(c.q) : { t: conPrefijo(valor(c.q), 'C', 3), f: 'num', tam: 11.5 };
      tz.compuesto([{ ...qTxt, tam: 14, color: 'texto' }], px - G.carga - 7, py - 8, { alinear: 'right' });
    }
    return cajas;
  }

  // Guías de construcción y ficha mientras se arrastra un objeto
  function guiaArrastre(id) {
    const c = id === 'P' ? { x: PART.x, y: PART.y, nombre: 'Partícula' } : FUENTES.find(f => f.id === id);
    if (!c || c.x == null) return;
    const v = tz.vista, [x, y] = v.P([c.x, c.y]), [X0, Y0] = v.P([0, 0]);
    tz.lineaPx([[x, y], [x, Y0]], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
    tz.lineaPx([[x, y], [X0, y]], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
    tz.ficha(x + 18, y - 44, [
      [{ t: c.nombre, f: 'ui', tam: 11.5 }],
      [{ t: 'x', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(c.x, 'm', 3) + '   ', f: 'num', tam: 11.5 }, { t: 'y', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(c.y, 'm', 3), f: 'num', tam: 11.5 }],
    ]);
  }

  // ---------------------------------------------------------------------
  // Lectura de campos con unidades y expresiones
  // ---------------------------------------------------------------------
  function leerCantidad(txt, dimNombre) {
    const D = DIMEN[dimNombre];
    const variables = Object.fromEntries(Object.entries(V()).map(([n, d]) => [n, { valor: d.val * d.si, dim: DIMEN[d.dim].dim }]));
    try {
      if (D.simple) return { valor: evaluar(txt, { variables, esperada: D.dim, unidadPorDefecto: D.simple }).valor };
      // Unidad compuesta (µC/m, nC/m², N/m…): un número solo se lee en la unidad del campo
      const r = evaluar(txt, { variables });
      if (r.dim.every(e => Math.abs(e) < 1e-9)) return { valor: r.valor * D.si };
      return { valor: evaluar(txt, { variables, esperada: D.dim }).valor };
    } catch (e) { return { error: e.message }; }
  }

  // ---------------------------------------------------------------------
  // Paneles: árbol, inspector, lecturas, variables
  // ---------------------------------------------------------------------
  const ico = id => `<svg class="ico"><use href="#${id}"/></svg>`;
  const simHTML = (a, b, recta) => `<span class="sim">${a}${b ? `<sub${recta ? ' class="r"' : ''}>${b}</sub>` : ''}</span>`;
  const conSigno = (v, u, c = 3) => (v > 0 ? '+' : '') + conPrefijo(v, u, c);
  const ICONO = { puntual: f => (valor(f.q) >= 0 ? 'o-carga-positiva' : 'o-carga-negativa'), esfera: () => 'o-esfera-cargada', hilo: () => 'o-hilo-infinito', segmento: () => 'o-segmento-cargado', anillo: () => 'o-anillo', lamina: () => 'o-lamina', uniforme: () => 'o-campo-uniforme' };
  const TIPO_NOMBRE = { puntual: 'Carga puntual fija', esfera: 'Esfera cargada', hilo: 'Hilo infinito', segmento: 'Segmento cargado', anillo: 'Anillo cargado', lamina: 'Lámina cargada', uniforme: 'Campo uniforme' };
  const nombreFuente = f => (f.tipo === 'puntual' ? 'Carga ' + f.nombre : f.nombre);
  function datoFuente(f) {
    const r = resolverFuente(f);
    if (f.tipo === 'hilo') return conSigno(r.lambda, 'C/m');
    if (f.tipo === 'lamina') return conSigno(r.sigma, 'C/m²');
    if (f.tipo === 'uniforme') return conPrefijo(r.E0, 'V/m', 3);
    return conSigno(r.q, 'C');
  }

  function construirArbol() {
    const filas = ESC.fuentes.map(f => {
      const acc = sel === f.id ? `<span class="acciones fijas">${ico('i-ojo')}</span>` : `<span class="acciones">${ico('i-candado')}</span>`;
      return `<div class="nodo" data-sel="${f.id}" aria-selected="${sel === f.id}">${ico(ICONO[f.tipo](f))}<span class="nombre">${nombreFuente(f)}</span><span class="dato">${datoFuente(f)}</span>${acc}</div>`;
    });
    if (ESC.particula) filas.push(`<div class="nodo" data-sel="P" aria-selected="${sel === 'P'}">${ico(valor(ESC.particula.q) >= 0 ? 'o-carga-positiva' : 'o-carga-negativa')}<span class="nombre">${ESC.particula.nombre}</span><span class="dato">${conSigno(valor(ESC.particula.q), 'C')}</span>${sel === 'P' ? `<span class="acciones fijas">${ico('i-ojo')}</span>` : ''}</div>`);
    if (ESC.camino) filas.push(`<div class="nodo" data-sel="camino" aria-selected="${sel === 'camino'}">${ico('i-flecha-derecha')}<span class="nombre">Camino de ${ESC.camino.nombre}</span><span class="dato" id="arbol-camino"></span></div>`);
    ESC.puntos.forEach((p, i) => filas.push(`<div class="nodo" data-sel="pt${i}" aria-selected="${sel === 'pt' + i}">${ico('i-etiqueta')}<span class="nombre">Punto ${p.nombre}</span><span class="dato" data-punto="${i}"></span></div>`));
    filas.push(`<div class="nodo" data-sel="sonda" aria-selected="${sel === 'sonda'}">${ico('n-sonda-campo')}<span class="nombre">Sonda de campo</span><span class="dato" id="arbol-sonda"></span>${sel === 'sonda' ? `<span class="acciones fijas">${ico('i-ojo')}</span>` : ''}</div>`);
    if (ESC.gauss) filas.push(`<div class="nodo" data-sel="gauss" aria-selected="${sel === 'gauss'}">${ico('n-superficie-gauss')}<span class="nombre">${ESC.gauss.forma === 'cilindro' ? 'Cilindro gaussiano' : 'Superficie gaussiana'}</span><span class="dato" id="arbol-gauss"></span></div>`);
    filas.push(`<div class="nodo global" data-sel="campo" aria-selected="${sel === 'campo'}">${ico('i-capas')}<span class="nombre">Vista del campo</span><span class="dato" id="arbol-campo"></span></div>`);
    $('#arbol').innerHTML = filas.join('');
    lecturas();
  }
  $('#arbol').addEventListener('click', ev => { const n = ev.target.closest('.nodo'); if (n) seleccionar(n.dataset.sel); });
  function seleccionar(id) { sel = id; construirArbol(); construirInspector(); todo(); }
  const selValida = id => id === 'sonda' || id === 'campo' || (id === 'P' && ESC.particula) || (id === 'camino' && ESC.camino) || (id === 'gauss' && ESC.gauss) || (/^pt\d+$/.test(id) && ESC.puntos[+id.slice(2)]) || !!fuentePorId(id);

  // Campo numérico del inspector: ligado (chip con la variable) o libre (entrada)
  function campoHTML(clave, prop, dim, eje, compacto) {
    const u = DIMEN[dim];
    if (ligada(prop)) {
      const d = V()[prop.v], ft = factorTexto(prop.f), largo = (ft.pre + ft.post).length;
      const e = eje && !(compacto && largo > 0) ? `<span class="eje">${eje}</span>` : '';
      return `<div class="campo es-variable" data-desligar="${clave}" data-ayuda="${eje ? eje + ' ligado' : 'Ligado'} a la variable ${nombreVar(d)} · doble clic para desligar|Bound to variable">${e}<span class="chip-var"><span class="sim">${ft.pre}${d.sim}${d.sub ? `<sub class="r">${d.sub}</sub>` : ''}${ft.post}</span></span><span class="valor-var" data-ligado="${clave}"></span><span class="u">${u.u}</span></div>`;
    }
    const e = eje ? `<span class="eje">${eje}</span>` : '';
    return `<div class="campo">${e}<input data-clave="${clave}" value="${prop == null ? '' : fmt(prop / u.si, 4)}" spellcheck="false"><span class="u">${u.u}</span></div>`;
  }
  const casilla = (clave, txt, color, discontinua, marcada) => `<label class="casilla"><input type="checkbox" data-mostrar="${clave}"${marcada ? ' checked' : ''}>${txt}${color ? `<span class="muestra${discontinua ? ' discontinua' : ''}" style="color:var(--${color})"></span>` : ''}</label>`;
  const grupo = (titulo, cuerpo, id) => `<details class="grupo" open><summary>${ico('i-chevron-abajo')}<span${id ? ` id="${id}"` : ''}>${titulo}</span></summary>${cuerpo}</details>`;
  const fila = (etq, control) => `<div class="fila"><span class="etq">${etq}</span>${control}</div>`;
  const cab = (icono, t1, t2) => `<div class="insp-cab"><div class="miniatura">${ico(icono)}</div><div><div class="t1">${t1}</div><div class="t2" id="insp-estado">${t2}</div></div></div>`;
  // Posición en media fila; si un campo ligado lleva factor o signo (−a, √3l/2) no cabe y va en dos filas
  const largoChip = p => ligada(p) && Math.abs(p.f - 1) > 1e-9;
  const posicion = (base, o) => (largoChip(o.x) || largoChip(o.y)
    ? fila('Posición', campoHTML(base + '.x', o.x, 'longitud', 'x')) + fila('', campoHTML(base + '.y', o.y, 'longitud', 'y'))
    : fila('Posición', `<div class="fila-doble">${campoHTML(base + '.x', o.x, 'longitud', 'x', true)}${campoHTML(base + '.y', o.y, 'longitud', 'y', true)}</div>`));

  function construirInspector() {
    if (!selValida(sel)) sel = ESC.particula ? 'P' : ESC.fuentes[0]?.id || 'campo';
    let h = '';
    const lect = grupo('Lecturas', '<div class="lecturas" id="lecturas"></div>', 'lect-titulo');
    if (sel === 'sonda') {
      h += cab('n-sonda-campo', 'Sonda de campo', 'Instrumento · E y V en su punto');
      h += grupo('Posición', posicion('sonda', ESC.sonda));
      h += grupo('Mostrar', casilla('vectorSonda', 'Vector campo', 'f-electrico', false, ESC.vista.vectorSonda) + casilla('fichaSonda', 'Ficha de lectura', null, false, ESC.vista.fichaSonda)) + lect;
    } else if (sel === 'gauss') {
      const g = ESC.gauss;
      h += cab('n-superficie-gauss', g.forma === 'cilindro' ? 'Cilindro gaussiano' : 'Superficie gaussiana', 'Instrumento · flujo y carga encerrada');
      let c = fila('Forma', `<div class="segmentado texto" data-ajuste="gauss.forma"><button data-v="esfera" aria-pressed="${g.forma === 'esfera'}">Esfera</button><button data-v="cilindro" aria-pressed="${g.forma === 'cilindro'}">Cilindro de eje z</button></div>`);
      c += posicion('gauss', g) + fila('Radio', campoHTML('gauss.R', g.R, 'longitud', 'R'));
      if (g.forma === 'cilindro') c += fila('Largo', campoHTML('gauss.L', g.L ?? 1, 'longitud', 'L'));
      h += grupo('Geometría', c) + lect;
    } else if (sel === 'campo') {
      const vi = ESC.vista;
      h += cab('i-capas', 'Vista del campo', 'Superposición de las fuentes');
      if (ESC.particula) h += grupo('Fuentes', fila('Campo de', `<div class="segmentado texto" data-ajuste="vista.fuentes"><button data-v="todas" aria-pressed="${vi.fuentes === 'todas'}">Todas las cargas</button><button data-v="fijas" aria-pressed="${vi.fuentes === 'fijas'}">Solo las fijas</button></div>`));
      h += grupo('Líneas de campo', casilla('capa.lineas', 'Mostrar líneas de campo', 'f-electrico', false, ESC.capas.lineas) +
        `<div class="fila"><label for="f-dens">Densidad</label><div class="campo"><input id="f-dens" data-clave="vista.porMicro" value="${vi.porMicro}"><span class="u">líneas/µC</span></div></div>`);
      h += grupo('Equipotenciales', casilla('capa.equi', 'Mostrar equipotenciales', 'f-electrico', true, ESC.capas.equi) + casilla('dVauto', 'Separación automática', null, false, vi.dVauto) +
        `<div class="fila"><label for="f-dv">Separación</label><div class="campo"><span class="eje">ΔV</span><input id="f-dv" data-clave="vista.dV" value="${limpio(NIV.paso / 1e3, 4)}"${vi.dVauto ? ' readonly' : ''}><span class="u">kV</span></div></div>`);
      h += grupo('Mapa y malla', casilla('capa.mapa', 'Mapa de potencial', null, false, ESC.capas.mapa) + casilla('capa.malla', 'Malla de vectores', 'f-electrico', false, ESC.capas.malla) +
        fila('Escala', `<div class="segmentado texto" data-ajuste="vista.malla"><button data-v="log" aria-pressed="${vi.malla === 'log'}">Logarítmica</button><button data-v="lineal" aria-pressed="${vi.malla === 'lineal'}">Lineal</button></div>`));
      if (estatica()) h += grupo('Perfil', fila('Recta', `<div class="segmentado texto" data-ajuste="vista.perfil"><button data-v="x" aria-pressed="${vi.perfil === 'x'}">Horizontal</button><button data-v="y" aria-pressed="${vi.perfil === 'y'}">Vertical</button></div>`) + '<p class="ayuda-campo" style="margin:2px 0 0 80px;font-size:var(--t-micro);color:var(--texto-3)">Por la sonda de campo</p>');
      h += lect;
    } else if (sel === 'camino') {
      const c = ESC.camino;
      h += cab(valor(c.q) >= 0 ? 'o-carga-positiva' : 'o-carga-negativa', `Carga de prueba ${c.nombre}`, 'Se lleva despacio por el camino');
      h += grupo('Propiedades', fila('Carga', campoHTML('camino.q', c.q, 'carga'))) + lect;
    } else if (/^pt\d+$/.test(sel)) {
      const p = ESC.puntos[+sel.slice(2)];
      h += cab('i-etiqueta', `Punto ${p.nombre}`, 'Punto de la figura');
      h += grupo('Posición', posicion(sel, p)) + lect;
    } else if (sel === 'P') {
      const c = ESC.particula;
      h += cab(valor(c.q) >= 0 ? 'o-carga-positiva' : 'o-carga-negativa', c.nombre, 'Carga puntual libre');
      let cuerpo = fila('Carga', campoHTML('P.q', c.q, 'carga')) + fila('Masa', campoHTML('P.m', c.m, 'masa')) + posicion('P', c);
      cuerpo += fila('Velocidad', `<div class="fila-doble">${campoHTML('P.v0', c.v0 ?? 0, 'velocidad')}<div class="campo"><span class="eje">α</span><input data-clave="P.alfa" value="${limpio(c.alfa || 0, 2)}"><span class="u">°</span></div></div>`);
      if (c.resorte) cuerpo += fila('Resorte', campoHTML('P.resorte.k', c.resorte.k, 'rigidez', 'k')) + fila('', campoHTML('P.resorte.L0', c.resorte.L0, 'longitud', 'L₀'));
      if (c.b != null) cuerpo += fila('Fricción', campoHTML('P.b', c.b, 'amortiguamiento', 'b'));
      h += grupo('Condiciones iniciales', cuerpo);
      h += grupo('Mostrar', casilla('fuerza', 'Fuerza eléctrica', 'f-interaccion', false, mostrar.fuerza) + casilla('velocidad', 'Velocidad', 'f-movimiento', false, mostrar.velocidad) + casilla('prevista', 'Trayectoria prevista', 'texto-3', true, mostrar.prevista)) + lect;
    } else {
      const f = fuentePorId(sel);
      h += cab(ICONO[f.tipo](f), nombreFuente(f), TIPO_NOMBRE[f.tipo]);
      let c = '';
      if (f.tipo === 'hilo') c += fila('Densidad', campoHTML(f.id + '.lambda', f.lambda, 'lambda', 'λ'));
      else if (f.tipo === 'lamina') c += fila('Densidad', campoHTML(f.id + '.sigma', f.sigma, 'sigma', 'σ'));
      else if (f.tipo === 'uniforme') c += fila('Campo', campoHTML(f.id + '.E0', f.E0, 'campo', 'E₀'));
      else c += fila('Carga', campoHTML(f.id + '.q', f.q, 'carga'));
      if (f.tipo === 'esfera' || f.tipo === 'anillo') c += fila('Radio', campoHTML(f.id + '.radio', f.radio, 'longitud', 'R'));
      if (f.tipo === 'segmento') c += fila('Largo', campoHTML(f.id + '.largo', f.largo, 'longitud', 'L'));
      if (f.tipo === 'lamina') c += fila('Ancho', f.largo == null ? '<div class="campo"><input value="infinita" readonly><span class="u">m</span></div>' : campoHTML(f.id + '.largo', f.largo, 'longitud', 'L'));
      if (['segmento', 'anillo', 'lamina', 'uniforme'].includes(f.tipo)) c += fila(f.tipo === 'anillo' ? 'Eje' : 'Dirección', `<div class="campo"><span class="eje">θ</span><input data-clave="${f.id}.angulo" value="${limpio(f.angulo || 0, 2)}"><span class="u">°</span></div>`);
      if (f.tipo !== 'uniforme') c += posicion(f.id, f);
      h += grupo('Propiedades', c);
      const extra = [];
      if (f.tipo === 'esfera') extra.push(casilla('conductora', 'Conductora (la carga en la superficie)', null, false, !!f.conductora));
      if (f.tipo === 'lamina') extra.push(casilla('infinita', 'Plano infinito', null, false, f.largo == null));
      if (f.tipo === 'puntual') extra.push(casilla('fuerzaFija', 'Fuerza sobre la carga', 'f-interaccion', false, !!mostrar.fuerzaFija[f.id]));
      if (extra.length) h += grupo(f.tipo === 'puntual' ? 'Mostrar' : 'Modelo', extra.join(''));
      h += lect;
    }
    $('#inspector').innerHTML = h;
    lecturas();
  }

  // Delegación de eventos del inspector
  const insp = $('#inspector');
  insp.addEventListener('change', ev => {
    const el = /** @type {HTMLInputElement} */ (ev.target);
    if (el.dataset.clave) { aplicarCampo(el.dataset.clave, el.value, el); return; }
    const k = el.dataset.mostrar; if (!k) return;
    if (k.startsWith('capa.')) { ponerCapa(k.slice(5), el.checked); registrar(); }
    else if (k === 'fuerzaFija') mostrar.fuerzaFija[sel] = el.checked;
    else if (k === 'dVauto') { ESC.vista.dVauto = el.checked; if (!el.checked) ESC.vista.dV = NIV.paso; claveNiveles = ''; actualizarNiveles(); registrar(); construirInspector(); }
    else if (k === 'conductora') { fuentePorId(sel).conductora = el.checked; cambio(); return; }
    else if (k === 'infinita') { const f = fuentePorId(sel); f.largo = el.checked ? null : Math.round(4 * Lc() * 10) / 10; cambio(); return; }
    else if (k in ESC.vista) { ESC.vista[k] = el.checked; registrar(); }
    else mostrar[k] = el.checked;
    todo();
  });
  insp.addEventListener('click', ev => {
    const b = /** @type {Element} */ (ev.target).closest('.segmentado button'); if (!b) return;
    const g = /** @type {HTMLElement} */ (b.parentElement), [obj, prop] = g.dataset.ajuste.split('.'), val = /** @type {HTMLElement} */ (b).dataset.v;
    g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    if (obj === 'vista') { ESC.vista[prop] = val; claveNiveles = ''; registrar(); todo(); if (prop === 'fuentes') construirInspector(); }
    else if (obj === 'gauss') { ESC.gauss.forma = val; if (ESC.gauss.L == null) ESC.gauss.L = 1; cambio(); }
  });
  insp.addEventListener('dblclick', ev => {
    const el = /** @type {HTMLElement} */ (/** @type {Element} */ (ev.target).closest('[data-desligar]')); if (!el) return;
    const ruta = el.dataset.desligar.split('.'), [obj, campoProp] = objetoYProp(ruta); if (!obj) return;
    obj[campoProp] = valor(obj[campoProp]); cambio();
    const ent = insp.querySelector(`input[data-clave="${el.dataset.desligar}"]`); if (ent) { ent.focus(); ent.select(); }
  });
  insp.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target instanceof Element && ev.target.matches('input[data-clave]')) /** @type {HTMLElement} */ (ev.target).blur(); });

  // Objeto y propiedad de una clave "id.prop" o "P.resorte.k"
  function objetoYProp(ruta) {
    const [id, ...resto] = ruta;
    let obj = id === 'sonda' ? ESC.sonda : id === 'gauss' ? ESC.gauss : id === 'camino' ? ESC.camino : id === 'P' ? ESC.particula : /^pt\d+$/.test(id) ? ESC.puntos[+id.slice(2)] : fuentePorId(id);
    for (let i = 0; i < resto.length - 1 && obj; i++) obj = obj[resto[i]];
    return [obj, resto[resto.length - 1]];
  }
  function marcarError(el, msg) {
    const campoEl = el.closest('.campo'), f = el.closest('.fila');
    campoEl.classList.add('es-error');
    let p = f.querySelector('.mensaje-error'); if (!p) { p = document.createElement('p'); p.className = 'mensaje-error'; f.appendChild(p); }
    p.textContent = msg;
  }
  function aplicarCampo(clave, txt, el) {
    const ruta = clave.split('.'), prop = ruta[ruta.length - 1];
    let r;
    if (prop === 'alfa' || prop === 'angulo') { const n = parseFloat(String(txt).replace(/−/g, '-').replace('°', '')); r = isFinite(n) ? { valor: n } : { error: 'Escribe un ángulo en grados, por ejemplo −90.' }; }
    else if (prop === 'porMicro') { const n = parseFloat(txt); r = isFinite(n) && n >= 1 && n <= 5000 ? { valor: Math.round(n) } : { error: 'Escribe un número de líneas entre 1 y 5000 por µC.' }; }
    else r = leerCantidad(txt, DIM_PROP[prop]);
    if (!r.error && ['m', 'radio', 'largo', 'R', 'L'].includes(prop) && !(r.valor > 0)) r = { error: 'Tiene que ser positiva.' };
    if (!r.error && ['q', 'lambda', 'sigma'].includes(prop) && r.valor === 0) r = { error: 'Una carga necesita un valor distinto de 0; para quitarla usa Suprimir.' };
    if (!r.error && ['k', 'L0', 'b', 'v0'].includes(prop) && !(r.valor >= 0)) r = { error: 'No puede ser negativo.' };
    if (!r.error && prop === 'dV' && !(r.valor > 0)) r = { error: 'La separación tiene que ser positiva.' };
    if (r.error) { marcarError(el, r.error); return; }
    if (ruta[0] === 'vista') { ESC.vista[prop] = r.valor; claveNiveles = ''; registrar(); construirInspector(); todo(); return; }
    const [obj, p] = objetoYProp(ruta); if (!obj) return;
    obj[p] = r.valor;
    cambio();
  }

  // Valores mostrados en los campos ligados a variables
  function fmtVar(d, f = 1) {
    const dec = !(d.paso > 0) || d.paso >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(d.paso) - 1e-9));
    return (f * d.val).toFixed(dec).replace('-', '−');
  }
  function refrescarLigados() {
    insp.querySelectorAll('[data-ligado]').forEach(el => {
      const [obj, p] = objetoYProp(/** @type {HTMLElement} */ (el).dataset.ligado.split('.')), x = obj && obj[p];
      if (ligada(x)) el.textContent = fmtVar(V()[x.v], x.f);
    });
  }

  function lecturas() {
    const s = estado(Math.min(t, tFin())), filaL = ([a, b, val, u, recta]) => `${simHTML(a, b, recta)}<span class="v">${typeof val === 'string' ? val : fmt(val, 4)}</span><span class="u">${u}</span>`;
    $('#reloj').innerHTML = estatica() ? '<span class="sim">t</span><span class="u">estática</span>' : `<span class="sim">t</span>${fmt(t, 4).padStart(6, ' ')}<span class="u">s</span>`;
    const tit = $('#lect-titulo'); if (tit) tit.textContent = estatica() ? 'Lecturas' : `Lecturas en t = ${fmt(t, 4)} s`;
    const f = fuentesEn(s), pre = (v, u) => conPrefijo(v, u, 4).split(Volta.ESP);
    const fp = (sim, sub, v, u, recta) => { const [n, uu] = pre(v, u); return [sim, sub, n, uu ?? u, recta]; };
    const limpia = (c, m) => (Math.abs(c) < 1e-9 * m ? 0 : c);
    let filas = [];
    if (sel === 'sonda') {
      const p = { x: valor(ESC.sonda.x), y: valor(ESC.sonda.y) }, [e1, e2] = campo(f, p.x, p.y), ex = limpia(e1, Math.hypot(e1, e2)), ey = limpia(e2, Math.hypot(e1, e2));
      filas = [fp('E', 'x', ex, 'V/m'), fp('E', 'y', ey, 'V/m'), fp('|E|', '', Math.hypot(ex, ey), 'V/m'), fp('V', '', potencial(f, p.x, p.y), 'V')];
    } else if (sel === 'gauss') {
      const g = lecturaGauss(f);
      if (g) filas = [fp('Φ', '', g.phi, 'V·m'), fp('Q', 'enc', g.Q, 'C', true), fp('Q', 'enc/ε₀', g.Q / EPSILON_0, 'V·m', true), ['R', '', g.R, 'm']];
    } else if (sel === 'campo') {
      filas = [['ΔV', '', limpio(NIV.paso / 1e3, 4), 'kV'], ['N', '', String(NIV.niveles.length), 'niveles']];
      if (FUENTES.every(x => !x.tipo || x.tipo === 'puntual')) filas.unshift(fp('Q', '', FUENTES.reduce((a, c) => a + c.q, 0), 'C'));
    } else if (sel === 'camino' && CAMDAT) {
      const c = caminoEn(t), [ex, ey] = campo(FUENTES, c.x, c.y);
      filas = [['s', '', c.s * CAMDAT.Ltot, 'm'], fp('V', '', c.V, 'V'), fp('|F|', '', Math.abs(CAM.q) * Math.hypot(ex, ey), 'N'), fp('W', '', c.W, 'J'), fp('W', 'total', CAMDAT.W, 'J', true)];
      const p0 = CAM.pts[0], p1 = CAM.pts[CAM.pts.length - 1];
      filas.push(fp('Q·ΔV', '', CAM.q * (potencial(FUENTES, ...p1) - potencial(FUENTES, ...p0)), 'J'));
    } else if (/^pt\d+$/.test(sel)) {
      const p = puntosRes()[+sel.slice(2)], [e1, e2] = campo(f, p.x, p.y), ex = limpia(e1, Math.hypot(e1, e2)), ey = limpia(e2, Math.hypot(e1, e2));
      filas = [['x', '', p.x, 'm'], ['y', '', p.y, 'm'], fp('V', '', potencial(f, p.x, p.y), 'V'), fp('|E|', '', Math.hypot(ex, ey), 'V/m'), fp('E', 'x', ex, 'V/m'), fp('E', 'y', ey, 'V/m')];
    } else if (sel === 'P' && s) {
      const sc = estadoCompleto(Math.min(t, tFin())), { K: Ek, U, Ue } = energia(sc), [ex, ey] = campo(FUENTES, s.x, s.y);
      filas = [['x', '', s.x, 'm'], ['y', '', s.y, 'm'], ['v', 'x', s.vx, 'm/s'], ['v', 'y', s.vy, 'm/s'], ['|v|', '', Math.hypot(s.vx, s.vy), 'm/s'],
        fp('|F|', '', Math.abs(PART.q) * Math.hypot(ex, ey), 'N'), fp('V', '', potencial(FUENTES, s.x, s.y), 'V'), fp('U', '', U, 'J'), fp('E', 'k', Ek, 'J', true)];
      if (PART.resorte) filas.push(fp('U', 'e', Ue, 'J', true));
      if (ESC.graficas === 'dist' && FUENTES[0]) {
        const d = Math.hypot(s.x - FUENTES[0].x, s.y - FUENTES[0].y);
        filas.push(['r', 'B', d, 'm', true], ['v', 'c', Math.sqrt(Math.abs(K * PART.q * FUENTES[0].q) / (PART.m * d)), 'm/s', true]);
      }
      const est = $('#insp-estado');
      if (est && SIM) est.textContent = 'Carga puntual libre · ' + (SIM.choque ? (t >= SIM.choque.t ? 'chocó' : 'choca') : PART.b > 0 ? 'amortiguada' : SIM.E0 < 0 ? 'ligada' : 'no ligada');
    } else {
      const fu = FUENTES.find(x => x.id === sel);
      if (fu && fu.tipo === 'puntual') {
        const otras = [...FUENTES.filter(x => x.id !== fu.id), ...(s ? [{ q: PART.q, x: s.x, y: s.y }] : [])], [ex, ey] = campo(otras, fu.x, fu.y);
        filas = [['x', '', fu.x, 'm'], ['y', '', fu.y, 'm'], fp('F', 'x', fu.q * ex, 'N'), fp('F', 'y', fu.q * ey, 'N'), fp('|F|', '', Math.abs(fu.q) * Math.hypot(ex, ey), 'N'), fp('V', '', potencial(otras, fu.x, fu.y), 'V')];
      } else if (fu) {
        const ex = [];
        if (fu.tipo === 'esfera' || fu.tipo === 'anillo' || fu.tipo === 'segmento') ex.push(fp('Q', '', fu.q, 'C'));
        if (fu.tipo === 'segmento') ex.push(fp('λ', '', fu.q / fu.largo, 'C/m'));
        if (fu.tipo === 'esfera') ex.push(fp('V', 'sup', K * fu.q / fu.radio, 'V', true), fp('E', 'sup', K * fu.q / fu.radio ** 2, 'V/m', true));
        if (fu.tipo === 'hilo') ex.push(fp('E', '(1 m)', fu.lambda / (2 * Math.PI * EPSILON_0), 'V/m', true));
        if (fu.tipo === 'lamina') { ex.push(fp('σ/2ε₀', '', Math.abs(fu.sigma) / (2 * EPSILON_0), 'V/m')); if (Number.isFinite(fu.largo)) ex.push(fp('λ', 'z', fu.sigma * fu.largo, 'C/m', true)); }
        if (fu.tipo === 'uniforme') ex.push(fp('E', 'x', fu.E0 * Math.cos(fu.angulo), 'V/m'), fp('E', 'y', fu.E0 * Math.sin(fu.angulo), 'V/m'));
        filas = ex;
      }
    }
    const l = $('#lecturas'); if (l) l.innerHTML = filas.map(filaL).join('');
    // Datos del árbol
    const p = { x: valor(ESC.sonda.x), y: valor(ESC.sonda.y) }, [sx, sy] = campo(f, p.x, p.y);
    if ($('#arbol-sonda')) $('#arbol-sonda').textContent = conPrefijo(Math.hypot(sx, sy), 'V/m', 3);
    if ($('#arbol-campo')) $('#arbol-campo').textContent = 'ΔV ' + etiquetaV(NIV.paso);
    const g = ESC.gauss ? lecturaGauss(f) : null;
    if ($('#arbol-gauss') && g) $('#arbol-gauss').textContent = conPrefijo(g.Q, 'C', 3);
    if ($('#arbol-camino') && CAMDAT) $('#arbol-camino').textContent = conPrefijo(caminoEn(t).W, 'J', 3);
    // (al cambiar de escena el árbol se reconstruye después: puede tener filas de la anterior)
    document.querySelectorAll('#arbol [data-punto]').forEach(el => { const q = puntosRes()[+el.dataset.punto]; if (q) el.textContent = conPrefijo(potencial(f, q.x, q.y), 'V', 3); });
    $('#b-play').innerHTML = ico(jugando ? 'i-pausar' : 'i-reproducir');
    $('#b-play').dataset.ayuda = jugando ? 'Pausar|Pause|Espacio' : 'Reproducir|Play|Espacio';
    refrescarLigados();
  }

  function construirVariables() {
    const cont = $('#variables'); cont.innerHTML = '';
    for (const [k, d] of Object.entries(V())) {
      const filaV = document.createElement('div'); filaV.className = 'var' + (d.constante ? ' constante' : '');
      const control = d.constante
        ? `<span class="constante-etq">Constante · ${d.u}</span>`
        : `<input class="deslizador" type="range" min="${d.min}" max="${d.max}" step="${d.paso}" value="${d.val}" aria-label="${nombreVar(d)}" data-var="${k}">`;
      filaV.innerHTML = `${simHTML(d.sim, d.sub, true)}${control}<span class="valor"></span>`;
      const ent = filaV.querySelector('input'), val = filaV.querySelector('.valor');
      d.pintar = () => {
        val.innerHTML = d.constante ? fmt(d.val, 4) : `${fmtVar(d)}<span class="u">${d.u}</span>`;
        if (ent) { ent.value = String(d.val); Volta.pintarDeslizador(ent); }
      };
      if (ent) {
        ent.addEventListener('input', () => { d.val = parseFloat(ent.value); d.pintar(); recalcular(); construirArbol(); });
        ent.addEventListener('change', () => registrar());
      }
      d.pintar(); cont.appendChild(filaV);
    }
  }

  // ---------------------------------------------------------------------
  // Deshacer y rehacer (nucleo/historial.js)
  // ---------------------------------------------------------------------
  const instantanea = () => { const o = copia(ESC); for (const d of Object.values(o.vars)) delete d.pintar; return o; };
  function botonesHistorial() { $('#b-deshacer').disabled = !historial?.puedeDeshacer; $('#b-rehacer').disabled = !historial?.puedeRehacer; }
  function registrar() { if (historial && historial.registrar(instantanea())) botonesHistorial(); if (autoguardar) autoguardado.guardar('electrostatica', escenaActual()); }
  function restaurar(d) { ESC = d; $('#arbol').innerHTML = ''; if (!selValida(sel)) sel = ESC.particula ? 'P' : 'campo'; recalcular(); construirVariables(); construirArbol(); construirInspector(); titulo(); }
  function deshacer() { const d = historial?.deshacer(); if (d) { restaurar(d); botonesHistorial(); } }
  function rehacer() { const d = historial?.rehacer(); if (d) { restaurar(d); botonesHistorial(); } }
  $('#b-deshacer').addEventListener('click', deshacer);
  $('#b-rehacer').addEventListener('click', rehacer);
  // Un cambio de la escena: se simula, se registra y se reconstruyen los paneles
  function cambio() { recalcular(); registrar(); construirArbol(); construirInspector(); }

  // ---------------------------------------------------------------------
  // Panel inferior: gráficas, energía, eventos, tabla
  // ---------------------------------------------------------------------
  const lt = new LineaTiempo($('#tl'), { duracion: 1, eventos: [], alCambiar: nt => { t = nt; jugando = false; todo(); } });
  const cab3 = (id, html) => { $(id).innerHTML = html; };
  const sim = s => `<span class="sim">${s}</span>`;
  const serie = f => [SIM.T.map((tt, i) => f(tt, { x: SIM.S[i][0], y: SIM.S[i][1], vx: SIM.S[i][2], vy: SIM.S[i][3] }))];
  const rango = (vals, minimo = 0) => { const fin = vals.filter(isFinite); const lo = Math.min(...fin), hi = Math.max(...fin), pad = (hi - lo) * 0.1 || Math.max(Math.abs(hi), minimo, 1e-12) * 0.2; return { min: lo - pad, max: hi + pad }; };
  const rangoSim = (vals, minimo) => { const m = Math.max(minimo, ...vals.filter(isFinite).map(Math.abs)) * 1.12; return { min: -m, max: m }; };
  // Recorte de un perfil con singularidades (cerca de una carga): percentiles 4–96
  function rangoRecortado(vals, extra = []) {
    const fin = vals.filter(isFinite).sort((a, b) => a - b); if (!fin.length) return { min: -1, max: 1 };
    const q = f => fin[Math.min(fin.length - 1, Math.floor(f * fin.length))];
    let lo = Math.min(q(0.04), ...extra), hi = Math.max(q(0.96), ...extra);
    if (hi - lo < 1e-12) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.1; return { min: lo - pad, max: hi + pad };
  }
  // Unidad con prefijo para una serie (mV, kV, µJ…): factor y texto
  function unidadDe(vals, u) {
    // escala robusta: el percentil 96 de |valor| (cerca de una carga el perfil diverge)
    const abs = vals.filter(isFinite).map(Math.abs).sort((a, b) => a - b), m = abs.length ? abs[Math.min(abs.length - 1, Math.floor(0.96 * abs.length))] : 0;
    const [f, p] = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']].find(([f]) => m >= f * 0.999) || [1e-12, 'p'];
    return { f, u: p + u };
  }

  function graficas() {
    if ($('#p-graficas').hidden) { if (!$('#p-energia').hidden) energiaPanel(); return; }
    if (SIM) graficasParticula(); else if (CAM && CAMDAT) graficasCamino(); else graficasPerfil();
    if (!$('#p-energia').hidden) energiaPanel();
  }
  function graficasParticula() {
    const tt = Math.min(t, tFin()), s = estado(tt), evs = SIM.eventos.filter(e => e.t > 0), eje = ESC.ejeMov, Lch = Lc();
    const ix = eje === 'x' ? 0 : 1, iv = ix + 2;
    cab3('#t1', `${sim(eje)} contra ${sim('t')}`); cab3('#t2', `<span class="sim">v<sub>${eje}</sub></span> contra ${sim('t')}`);
    grafica($('#g1'), { x: { min: 0, max: DUR() }, y: rangoSim(SIM.S.map(q => q[ix]), 0.1 * Lch), series: [{ tramos: serie((t1, q) => [t1, eje === 'x' ? q.x : q.y]), familia: 'tinta' }], cursor: tt, puntoCursor: [tt, eje === 'x' ? s.x : s.y], eventos: evs.map(e => ({ x: e.t, y: eje === 'x' ? e.x : e.y })) });
    grafica($('#g2'), { x: { min: 0, max: DUR() }, y: rangoSim(SIM.S.map(q => q[iv]), 0.1), series: [{ tramos: serie((t1, q) => [t1, eje === 'x' ? q.vx : q.vy]), familia: 'movimiento' }], cursor: tt, puntoCursor: [tt, eje === 'x' ? s.vx : s.vy], eventos: evs.map(e => ({ x: e.t })) });
    $('#l1').textContent = cantidad(eje === 'x' ? s.x : s.y, 'm');
    $('#l2').textContent = cantidad(eje === 'x' ? s.vx : s.vy, 'm/s');
    if (ESC.graficas === 'tray') {
      const ser = [SIM.S.map(q => [q[0], q[1]])], xs = ser[0].map(p => p[0]), ys = ser[0].map(p => p[1]);
      const caja = cajaEscena();
      cab3('#t3', `${sim('y')} contra ${sim('x')} · trayectoria`);
      grafica($('#g3'), { x: { min: Math.min(caja.x0, ...xs), max: Math.max(caja.x1, ...xs) }, y: rango(ys.concat([0]), Lch), series: [{ tramos: ser, familia: 'tinta' }], cursor: s.x, puntoCursor: [s.x, s.y], eventos: [] });
      $('#l3').textContent = cantidad(s.y, 'm');
      return;
    }
    if (ESC.graficas === 'dist' && FUENTES[0]) {
      const B = FUENTES[0], d = q => Math.hypot(q.x - B.x, q.y - B.y), ser = serie((t1, q) => [t1, d(q)]);
      cab3('#t3', `<span class="sim">r</span> contra ${sim('t')} · distancia a ${B.nombre}`);
      grafica($('#g3'), { x: { min: 0, max: DUR() }, y: { min: 0, max: 1.25 * Math.max(...ser[0].map(p => p[1])) }, series: [{ tramos: ser, familia: 'tinta' }], cursor: tt, puntoCursor: [tt, d(s)], eventos: [] });
      $('#l3').textContent = cantidad(d(s), 'm');
      return;
    }
    // Perfil U(s) por la recta del movimiento, con el nivel de la energía total
    const lin = ESC.lineaU || { eje, en: eje === 'x' ? PART.y : PART.x }, enX = lin.eje === 'x';
    // Rango: el tramo recorrido y la mitad de su largo a cada lado
    const cs = SIM.S.map(q => q[enX ? 0 : 1]), cmin = Math.min(...cs), cmax = Math.max(...cs), span = Math.max(cmax - cmin, 0.2 * Lch);
    const a = cmin - 0.5 * span, b = cmax + 0.5 * span, pts = [];
    const Ufun = (x, y) => PART.q * potencial(FUENTES, x, y) + (PART.resorte ? 0.5 * PART.resorte.k * (Math.hypot(x - PART.resorte.x, y - PART.resorte.y) - PART.resorte.L0) ** 2 : 0);
    for (let i = 0; i <= 240; i++) { const u = a + (b - a) * i / 240; pts.push([u, enX ? Ufun(u, lin.en) : Ufun(lin.en, u)]); }
    const sc = estadoCompleto(tt), en = energia(sc), Etot = SIM.E0 - (en.Wd || 0);
    const un = unidadDe([...pts.map(p => p[1]), Etot], 'J');
    const ptsU = pts.map(([u, w]) => [u, w / un.f]);
    cab3('#t3', `${sim('U')} contra ${sim(lin.eje)} en ${sim(enX ? 'y' : 'x')} = ${limpio(lin.en, 3)} · nivel ${sim('E')}`);
    const R = rangoRecortado(ptsU.map(p => p[1]), [Etot / un.f]);
    const Up = (en.U + (en.Ue || 0)) / un.f;
    grafica($('#g3'), { x: { min: a, max: b }, y: R, series: [{ tramos: [ptsU], familia: 'electrico' }, { tramos: [[[a, Etot / un.f], [b, Etot / un.f]]], familia: 'tinta' }], cursor: enX ? s.x : s.y, puntoCursor: [enX ? s.x : s.y, Up], eventos: [] });
    $('#l3').textContent = cantidad(Up, un.u);
  }
  function graficasCamino() {
    const m = CAMDAT.muestras, c = caminoEn(t), uW = unidadDe(m.map(x => x.W), 'J'), uV = unidadDe(m.map(x => x.V), 'V'), uE = unidadDe(m.map(x => x.E), 'V/m');
    const ls = m.map(x => x.l), Lt = CAMDAT.Ltot;
    cab3('#t1', `${sim('W')} contra ${sim('s')} · trabajo del agente`); cab3('#t2', `${sim('V')} contra ${sim('s')}`); cab3('#t3', `|${sim('E')}| contra ${sim('s')}`);
    grafica($('#g1'), { x: { min: 0, max: Lt }, y: rango(m.map(x => x.W / uW.f)), series: [{ tramos: [m.map((x, i) => [ls[i], x.W / uW.f])], familia: 'tinta', patron: 'discontinuo' }], cursor: c.s * Lt, puntoCursor: [c.s * Lt, c.W / uW.f], eventos: [] });
    grafica($('#g2'), { x: { min: 0, max: Lt }, y: rango(m.map(x => x.V / uV.f)), series: [{ tramos: [m.map((x, i) => [ls[i], x.V / uV.f])], familia: 'electrico' }], cursor: c.s * Lt, puntoCursor: [c.s * Lt, c.V / uV.f], eventos: [] });
    grafica($('#g3'), { x: { min: 0, max: Lt }, y: rango(m.map(x => x.E / uE.f)), series: [{ tramos: [m.map((x, i) => [ls[i], x.E / uE.f])], familia: 'electrico' }], cursor: c.s * Lt, eventos: [] });
    $('#l1').textContent = cantidad(c.W / uW.f, uW.u); $('#l2').textContent = cantidad(c.V / uV.f, uV.u);
    $('#l3').textContent = cantidad(Math.hypot(...campo(FUENTES, c.x, c.y)) / uE.f, uE.u);
  }
  // Escena estática: perfil de V, |E| y una componente por la recta de la sonda;
  // con superficie gaussiana, el flujo de una esfera de radio R contra R
  function graficasPerfil() {
    const caja = { x0: tz.vista.mx(0), x1: tz.vista.mx(tz.w), y0: tz.vista.my(tz.h), y1: tz.vista.my(0) };
    const enX = ESC.vista.perfil !== 'y', sx = valor(ESC.sonda.x), sy = valor(ESC.sonda.y);
    const a = enX ? caja.x0 : caja.y0, b = enX ? caja.x1 : caja.y1, pts = [];
    for (let i = 0; i <= 300; i++) { const u = a + (b - a) * i / 300, x = enX ? u : sx, y = enX ? sy : u, [ex, ey] = campo(FUENTES, x, y); pts.push([u, potencial(FUENTES, x, y), Math.hypot(ex, ey), enX ? ex : ey]); }
    const uV = unidadDe(pts.map(p => p[1]), 'V'), uE = unidadDe(pts.map(p => p[2]), 'V/m'), cur = enX ? sx : sy;
    const [vx, vy] = campo(FUENTES, sx, sy), Vs = potencial(FUENTES, sx, sy);
    const cual = `en ${sim(enX ? 'y' : 'x')} = ${limpio(enX ? sy : sx, 3)} m`;
    cab3('#t1', `${sim('V')} contra ${sim(enX ? 'x' : 'y')} ${cual}`); cab3('#t2', `|${sim('E')}| contra ${sim(enX ? 'x' : 'y')}`);
    grafica($('#g1'), { x: { min: a, max: b }, y: rangoRecortado(pts.map(p => p[1] / uV.f), [0]), series: [{ tramos: [pts.map(p => [p[0], p[1] / uV.f])], familia: 'electrico' }], cursor: cur, puntoCursor: [cur, Vs / uV.f], eventos: [] });
    grafica($('#g2'), { x: { min: a, max: b }, y: (r => ({ min: 0, max: r.max }))(rangoRecortado(pts.map(p => p[2] / uE.f), [0])), series: [{ tramos: [pts.map(p => [p[0], p[2] / uE.f])], familia: 'electrico' }], cursor: cur, puntoCursor: [cur, Math.hypot(vx, vy) / uE.f], eventos: [] });
    $('#l1').textContent = cantidad(Vs / uV.f, uV.u); $('#l2').textContent = cantidad(Math.hypot(vx, vy) / uE.f, uE.u);
    if (ESC.gauss) {
      const g = lecturaGauss(fuentesEn(null)), Rmax = Math.max(2 * g.R, Lc() * 3), ser = [];
      const forma = ESC.gauss.forma;
      for (let i = 1; i <= 200; i++) { const R = Rmax * i / 200; ser.push([R, cargaEncerrada(FUENTES, forma === 'cilindro' ? { forma, x: g.c.x, y: g.c.y, R, L: g.L } : { forma, x: g.c.x, y: g.c.y, R }) / EPSILON_0]); }
      const uP = unidadDe(ser.map(p => p[1]), 'V·m');
      cab3('#t3', `${sim('Φ')} contra ${sim('R')} · ${forma === 'cilindro' ? 'cilindro' : 'esfera'} gaussiana`);
      grafica($('#g3'), { x: { min: 0, max: Rmax }, y: rango(ser.map(p => p[1] / uP.f), 1), series: [{ tramos: [ser.map(p => [p[0], p[1] / uP.f])], familia: 'electrico' }], cursor: g.R, puntoCursor: [g.R, g.Q / EPSILON_0 / uP.f], eventos: [] });
      $('#l3').textContent = cantidad(g.Q / EPSILON_0 / uP.f, uP.u);
    } else {
      const uC = unidadDe(pts.map(p => p[3]), 'V/m');
      cab3('#t3', `<span class="sim">E<sub>${enX ? 'x' : 'y'}</sub></span> contra ${sim(enX ? 'x' : 'y')}`);
      grafica($('#g3'), { x: { min: a, max: b }, y: rangoRecortado(pts.map(p => p[3] / uC.f), [0]), series: [{ tramos: [pts.map(p => [p[0], p[3] / uC.f])], familia: 'electrico' }], cursor: cur, puntoCursor: [cur, (enX ? vx : vy) / uC.f], eventos: [] });
      $('#l3').textContent = cantidad((enX ? vx : vy) / uC.f, uC.u);
    }
  }

  function energiaPanel() {
    const filasBar = [], nota = $('#deriva');
    let serieG = null;
    if (SIM) {
      const tt = Math.min(t, tFin()), sc = estadoCompleto(tt), e = energia(sc), E0 = SIM.E0;
      const datos = SIM.S.map(q => energiaEstado(SIM.sim, q));
      const un = unidadDe([E0, ...datos.flatMap(d => [d.K, d.U, d.Ue, d.Wd])], 'J');
      filasBar.push(['Cinética', 'movimiento', e.K], ['Potencial eléctrica', 'electrico', e.U]);
      if (PART.resorte) filasBar.push(['Elástica', 'electrico', e.Ue]);
      if (PART.b > 0) filasBar.push(['Disipada', 'termico', e.Wd]);
      filasBar.push(['Total', 'tinta', e.K + e.U + e.Ue + (e.Wd || 0)]);
      const ser = arr => [SIM.T.map((t1, i) => [t1, arr[i] / un.f])];
      serieG = { un, series: [{ tramos: ser(datos.map(d => d.K)), familia: 'movimiento' }, { tramos: ser(datos.map(d => d.U)), familia: 'electrico' },
        ...(PART.resorte ? [{ tramos: ser(datos.map(d => d.Ue)), familia: 'electrico', patron: 'discontinuo' }] : []),
        ...(PART.b > 0 ? [{ tramos: ser(datos.map(d => d.Wd)), familia: 'termico' }] : []),
        { tramos: [[[0, E0 / un.f], [SIM.tFin, E0 / un.f]]], familia: 'tinta' }], x: DUR(), eventos: SIM.eventos.filter(ev => ev.t > 0).map(ev => ({ x: ev.t })) };
      nota.innerHTML = `Variación relativa máxima de la energía total: <span class="num">${SIM.deriva < 1e-12 ? '&lt; 1 × 10⁻¹²' : fmt(SIM.deriva, 2)}</span>`;
      pintarBarras(filasBar, un);
    } else if (CAM && CAMDAT) {
      const c = caminoEn(t), U0 = CAM.q * potencial(FUENTES, ...CAM.pts[0]);
      const un = unidadDe(CAMDAT.muestras.map(m => m.W).concat([U0]), 'J');
      filasBar.push(['Trabajo del agente', 'tinta', c.W], [`Variación de U = ${CAM.nombre}·ΔV`, 'electrico', CAM.q * c.V - U0]);
      pintarBarras(filasBar, un);
      nota.innerHTML = 'Llevar la carga despacio: el agente hace W = ΔU, sin energía cinética. No depende del camino.';
      serieG = { un, series: [{ tramos: [CAMDAT.muestras.map(m => [m.s * DUR(), m.W / un.f])], familia: 'tinta', patron: 'discontinuo' }, { tramos: [CAMDAT.muestras.map(m => [m.s * DUR(), (CAM.q * m.V - U0) / un.f])], familia: 'electrico' }], x: DUR(), eventos: [] };
    } else {
      const puntuales = FUENTES.every(f => !f.tipo || f.tipo === 'puntual');
      if (puntuales && FUENTES.length > 1) {
        const U = energiaPotencial(FUENTES), un = unidadDe([U], 'J');
        filasBar.push(['Energía del sistema', 'electrico', U]); pintarBarras(filasBar, un);
        nota.innerHTML = 'U = Σ k·q<sub>i</sub>·q<sub>j</sub>/r<sub>ij</sub>: el trabajo para traer las cargas desde el infinito.';
      } else { $('#barras').innerHTML = ''; nota.textContent = 'Escena estática: las cargas no se mueven. Con distribuciones continuas (hilos, láminas) la energía del sistema no es finita en este modelo.'; }
    }
    if (serieG) {
      cab3('#t4', `Energía contra ${sim('t')}`);
      const vals = serieG.series.flatMap(s => s.tramos.flat().map(p => p[1]));
      grafica($('#g4'), { x: { min: 0, max: serieG.x }, y: rango(vals.concat([0])), series: serieG.series, cursor: Math.min(t, tFin()), eventos: serieG.eventos });
      $('#g4').parentElement.querySelector('.lect').textContent = serieG.un.u;
      $('#g4').parentElement.hidden = false;
    } else $('#g4').parentElement.hidden = true;
  }
  function pintarBarras(filas, un) {
    const vals = filas.map(f => f[2]), lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), rangoB = (hi - lo) * 1.04 || 1, z = (-lo + (hi - lo) * 0.02) / rangoB * 100;
    $('#barras').innerHTML = filas.map(([n, f, val]) => {
      const w = Math.abs(val) / rangoB * 100, izq = val >= 0 ? z : z - w;
      return `<div class="barra-e"><span>${n}</span><span class="riel"><i style="left:${izq}%;width:${w}%;background:${f === 'tinta' ? 'var(--tinta)' : `var(--f-${f})`}"></i><b class="cero" style="left:${z}%"></b></span><span class="v">${cantidad(val / un.f, un.u, 4)}</span></div>`;
    }).join('');
  }

  function tablas() {
    const tt = Math.min(t, tFin());
    if (SIM) {
      $('#t-eventos').innerHTML = '<tr><th>Evento</th><th>t (s)</th><th>x (m)</th><th>y (m)</th><th>|v| (m/s)</th><th>U (J)</th></tr>' +
        SIM.eventos.map(e => `<tr class="${Math.abs(e.t - tt) < 1e-9 ? 'actual' : ''}"><td style="font-family:var(--fuente-interfaz)">${e.nombre}</td><td>${fmt(e.t, 5)}</td><td>${fmt(e.x, 4)}</td><td>${fmt(e.y, 4)}</td><td>${fmt(e.v, 4)}</td><td>${fmt(PART.q * potencial(FUENTES, e.x, e.y), 4)}</td></tr>`).join('');
      let filas = '<tr><th>t (s)</th><th>x (m)</th><th>y (m)</th><th>vₓ (m/s)</th><th>v<sub>y</sub> (m/s)</th><th>E<sub>k</sub> (J)</th><th>U (J)</th></tr>';
      const paso = DUR() / 130;
      for (let k = 0; k * paso <= DUR() + 1e-9; k++) {
        const t1 = k * paso, s = estado(t1), e = energia(s);
        filas += `<tr class="${Math.abs(t1 - tt) < paso / 2 ? 'actual' : ''}"><td>${fmt(t1, 4)}</td><td>${fmt(s.x, 4)}</td><td>${fmt(s.y, 4)}</td><td>${fmt(s.vx, 4)}</td><td>${fmt(s.vy, 4)}</td><td>${fmt(e.K, 4)}</td><td>${fmt(e.U, 4)}</td></tr>`;
      }
      $('#t-datos').innerHTML = filas;
      return;
    }
    // Sin partícula: tabla de puntos (con la sonda) y muestras del perfil o del camino
    const f = fuentesEn(null), pts = [...puntosRes().map(p => [p.nombre, p.x, p.y]), ['Sonda', valor(ESC.sonda.x), valor(ESC.sonda.y)]];
    $('#t-eventos').innerHTML = '<tr><th>Punto</th><th>x (m)</th><th>y (m)</th><th>V (V)</th><th>|E| (V/m)</th><th>Eₓ (V/m)</th><th>E<sub>y</sub> (V/m)</th></tr>' +
      pts.map(([n, x, y]) => { const [ex, ey] = campo(f, x, y); return `<tr><td style="font-family:var(--fuente-interfaz)">${n}</td><td>${fmt(x, 4)}</td><td>${fmt(y, 4)}</td><td>${fmt(potencial(f, x, y), 5)}</td><td>${fmt(Math.hypot(ex, ey), 5)}</td><td>${fmt(ex, 5)}</td><td>${fmt(ey, 5)}</td></tr>`; }).join('');
    if (CAM && CAMDAT) {
      $('#t-datos').innerHTML = '<tr><th>s (m)</th><th>x (m)</th><th>y (m)</th><th>V (V)</th><th>|E| (V/m)</th><th>W (J)</th></tr>' +
        CAMDAT.muestras.filter((_, i) => i % 5 === 0).map(m => `<tr class="${Math.abs(m.s - sCamino(t)) < 0.0125 ? 'actual' : ''}"><td>${fmt(m.l, 4)}</td><td>${fmt(m.x, 4)}</td><td>${fmt(m.y, 4)}</td><td>${fmt(m.V, 5)}</td><td>${fmt(m.E, 5)}</td><td>${fmt(m.W, 5)}</td></tr>`).join('');
    } else {
      const enX = ESC.vista.perfil !== 'y', sx = valor(ESC.sonda.x), sy = valor(ESC.sonda.y), caja = cajaEscena(), a = enX ? caja.x0 : caja.y0, b = enX ? caja.x1 : caja.y1;
      let filas = `<tr><th>${enX ? 'x' : 'y'} (m)</th><th>V (V)</th><th>Eₓ (V/m)</th><th>E<sub>y</sub> (V/m)</th></tr>`;
      for (let i = 0; i <= 80; i++) { const u = a + (b - a) * i / 80, x = enX ? u : sx, y = enX ? sy : u, [ex, ey] = campo(FUENTES, x, y); filas += `<tr><td>${fmt(u, 4)}</td><td>${fmt(potencial(FUENTES, x, y), 5)}</td><td>${fmt(ex, 5)}</td><td>${fmt(ey, 5)}</td></tr>`; }
      $('#t-datos').innerHTML = filas;
    }
  }

  function todo() {
    dibujar(); lecturas(); lt.poner(Math.min(t, DUR())); graficas();
    if (!$('#p-eventos').hidden || !$('#p-tabla').hidden) tablas();
  }
  function recalcular() {
    ESCALAS = null; simular();
    lt.duracion = DUR(); lt.simulado = tFin();
    lt.eventos = SIM ? SIM.eventos.filter(e => e.t > 0).map(e => ({ t: e.t, nombre: e.nombre })) : [];
    const est = estatica();
    $('#panel-inf').classList.toggle('estatica', est);
    document.querySelectorAll('.transporte button, #velocidades button').forEach(b => { /** @type {HTMLButtonElement} */ (b).disabled = est; });
    $('#pest-eventos').textContent = SIM ? 'Eventos' : 'Puntos';
    if (est) { t = 0; jugando = false; }
    if (ERROR) aviso(ERROR);
    todo();
  }

  // ---------------------------------------------------------------------
  // Escenas: título, menú, guardar, abrir y autoguardado (formato .volta).
  // Lo que llega de un archivo se valida y se acota antes de usarlo.
  // ---------------------------------------------------------------------
  function titulo() {
    $('#escena-nombre').textContent = ESC.titulo;
    const chip = $('#escena-chip');
    chip.textContent = ESC.tipo === 'MEXT' ? `MEXT ${ESC.anio || ''}`.trim() : ESC.tipo || 'Propio';
    chip.className = 'chip' + (ESC.tipo === 'MEXT' ? ' lleno' : '');
    document.title = `Volta · Electrostática · ${ESC.titulo}`;
    document.querySelectorAll('.capa-btn').forEach(b => b.setAttribute('aria-pressed', String(!!ESC.capas[/** @type {HTMLElement} */ (b).dataset.capa])));
  }
  function escenaActual() { return crearEscena({ modulo: 'electrostatica', espacio: ESPACIO, titulo: ESC.titulo, datos: instantanea() }); }
  function abrirEscena1(clave) {
    ESC = completa(escenaDe(clave));
    sel = ESC.particula ? 'P' : ESC.camino ? 'camino' : 'sonda'; t = 0; jugando = false; herramienta = null; soltarHerramienta();
    titulo(); construirVariables(); recalcular(); encuadrar(); escala0 = tz.vista.escala; zoomTexto();
    construirArbol(); construirInspector(); todo();
    if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); }
    if (autoguardar) autoguardado.guardar('electrostatica', escenaActual());
  }

  const TIPOS_OK = ['puntual', 'esfera', 'hilo', 'segmento', 'anillo', 'lamina', 'uniforme'];
  // Valida y acota lo que viene de un archivo (entrada no confiable)
  function datosSeguros(d = {}) {
    // Formato anterior (solo MEXT 2020 P2): {escena: {cargas, sonda}, vars}
    if (d && d.escena && Array.isArray(d.escena.cargas)) d = convertirAntiguo(d);
    const base = completa(escenaDe(typeof d.clave === 'string' ? d.clave : 'mext-2020-2'));
    const nombres = Object.keys(base.vars).filter(k => !base.vars[k].constante);
    for (const k of nombres) { const b = base.vars[k], val = d.vars && d.vars[k] && typeof d.vars[k] === 'object' ? d.vars[k].val : d.vars?.[k]; b.val = numero(val, b.val, b.min, b.max); }
    const ok = v => typeof v === 'object' || Number.isFinite(v);
    const mag = (v, min, max, def = NaN) => magnitud(v, nombres, def, min, max);
    const pos = (v, def = 0) => { const m = mag(v, -1e3, 1e3, def); return ok(m) ? m : def; };
    const ang = v => numero(v, 0, -720, 720);
    const fuentes = [], ids = new Set(['P', 'sonda', 'campo', 'gauss', 'camino']);
    for (const o of (Array.isArray(d.fuentes) ? d.fuentes : []).slice(0, 40)) {
      if (!o || typeof o !== 'object' || !TIPOS_OK.includes(o.tipo)) continue;
      const id = texto(o.id, '', 8);
      if (!/^[A-Za-z][A-Za-z0-9]{0,7}$/.test(id) || ids.has(id)) continue;
      const f = { id, nombre: texto(o.nombre, id, 24), tipo: o.tipo };
      if (o.tipo !== 'uniforme') { f.x = pos(o.x); f.y = pos(o.y); }
      if (['puntual', 'esfera', 'segmento', 'anillo'].includes(o.tipo)) { f.q = mag(o.q, -1, 1); if (!ok(f.q) || (typeof f.q === 'number' ? f.q === 0 : f.q.f === 0)) continue; }
      if (o.tipo === 'puntual' && o.coords) f.coords = true;
      if (o.tipo === 'esfera' || o.tipo === 'anillo') { f.radio = mag(o.radio, 1e-6, 1e3); if (!ok(f.radio)) continue; }
      if (o.tipo === 'esfera') f.conductora = !!o.conductora;
      if (o.tipo === 'hilo') { f.lambda = mag(o.lambda, -1, 1); if (!ok(f.lambda)) continue; }
      if (o.tipo === 'lamina') { f.sigma = mag(o.sigma, -1, 1); if (!ok(f.sigma)) continue; f.largo = o.largo == null ? null : mag(o.largo, 1e-6, 1e3, 1); }
      if (o.tipo === 'segmento') { f.largo = mag(o.largo, 1e-6, 1e3); if (!ok(f.largo)) continue; }
      if (o.tipo === 'uniforme') { f.E0 = mag(o.E0, -1e9, 1e9); if (!ok(f.E0)) continue; }
      if (['segmento', 'anillo', 'lamina', 'uniforme'].includes(o.tipo)) f.angulo = ang(o.angulo);
      ids.add(id); fuentes.push(f);
    }
    const r = { ...base, fuentes };
    r.titulo = texto(d.titulo, base.titulo, 80);
    const p = d.particula;
    if (p && typeof p === 'object') {
      const q = mag(p.q, -1, 1), m = mag(p.m, 1e-9, 1e6);
      if (ok(q) && ok(m) && (typeof q === 'number' ? q !== 0 : q.f !== 0) && (typeof m === 'number' || m.f > 0)) {
        const v0 = mag(p.v0, 0, 1e4, 0);
        r.particula = { nombre: texto(p.nombre, 'Partícula', 24), q, m, x: pos(p.x), y: pos(p.y), v0: ok(v0) ? v0 : 0, alfa: numero(p.alfa, 0, -360, 360) };
        if (p.resorte && typeof p.resorte === 'object') { const k = mag(p.resorte.k, 0, 1e6, 0), L0 = mag(p.resorte.L0, 0, 1e3, 0); r.particula.resorte = { x: pos(p.resorte.x), y: pos(p.resorte.y), k: ok(k) ? k : 0, L0: ok(L0) ? L0 : 0 }; }
        if (p.b != null) { const b = mag(p.b, 0, 1e3, 0); r.particula.b = ok(b) ? b : 0; }
      } else r.particula = base.particula;
    } else r.particula = null;
    r.sonda = d.sonda && typeof d.sonda === 'object' ? { x: pos(d.sonda.x, base.sonda.x), y: pos(d.sonda.y, base.sonda.y) } : base.sonda;
    r.puntos = (Array.isArray(d.puntos) ? d.puntos : []).slice(0, 12).filter(x => x && typeof x === 'object').map(x => ({ nombre: texto(x.nombre, '·', 6), x: pos(x.x), y: pos(x.y), ...(x.coords ? { coords: true } : {}), ...(x.V ? { V: true } : {}), lado: ['ne', 'no', 'se', 'so'].includes(x.lado) ? x.lado : 'ne' }));
    const g = d.gauss;
    r.gauss = g && typeof g === 'object' ? { forma: g.forma === 'cilindro' ? 'cilindro' : 'esfera', x: pos(g.x), y: pos(g.y), R: (m => (ok(m) ? m : 0.5))(mag(g.R, 1e-6, 1e3)), L: numero(g.L, 1, 1e-6, 1e3) } : null;
    const c = d.camino;
    if (c && typeof c === 'object' && Array.isArray(c.puntos) && c.puntos.length >= 2) {
      const q = mag(c.q, -1, 1);
      r.camino = ok(q) ? { puntos: c.puntos.slice(0, 20).map(pp => (Array.isArray(pp) ? [pos(pp[0]), pos(pp[1])] : [0, 0])), q, nombre: texto(c.nombre, 'Q', 6) } : null;
    } else r.camino = null;
    r.duracion = numero(d.duracion, base.duracion || 2, 0.01, 1e4);
    if ((r.particula || r.camino) && !(r.duracion > 0)) r.duracion = 2;
    for (const k of Object.keys(r.capas)) if (typeof d.capas?.[k] === 'boolean') r.capas[k] = d.capas[k];
    const vi = d.vista || {};
    r.vista = { ...base.vista, fuentes: vi.fuentes === 'todas' ? 'todas' : 'fijas', porMicro: Math.round(numero(vi.porMicro, base.vista.porMicro, 1, 5000)), dVauto: vi.dVauto !== false, dV: numero(vi.dV, 2000, 1e-6, 1e9), malla: vi.malla === 'lineal' ? 'lineal' : 'log', vectorSonda: vi.vectorSonda !== false, fichaSonda: vi.fichaSonda !== false, perfil: vi.perfil === 'y' ? 'y' : 'x' };
    return r;
  }
  function convertirAntiguo(d) {
    const cargas = d.escena.cargas.filter(c => c && typeof c === 'object');
    const fijas = cargas.filter(c => c.fija !== false).map(c => ({ id: c.id, nombre: c.nombre, tipo: 'puntual', q: c.q, x: c.x, y: c.y, coords: true }));
    const libre = cargas.find(c => c.fija === false);
    return { clave: 'mext-2020-2', vars: d.vars, fuentes: fijas, particula: libre ? { nombre: libre.nombre, q: libre.q, m: libre.m, x: libre.x, y: libre.y, v0: libre.v0, alfa: libre.alfa } : escenaDe('mext-2020-2').particula, sonda: d.escena.sonda, puntos: escenaDe('mext-2020-2').puntos };
  }
  function cargarDatos(d) {
    ESC = d; sel = ESC.particula ? 'P' : 'sonda'; t = 0; jugando = false;
    titulo(); construirVariables(); recalcular(); encuadrar(); escala0 = tz.vista.escala; zoomTexto(); construirArbol(); construirInspector(); todo();
    if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); }
  }
  function guardar() { guardarEscena(escenaActual()).then(r => { if (r) aviso('Escena guardada'); }, err => aviso(`No se pudo guardar: ${err}`)); }
  // Una escena del espacio «Conductores y dieléctricos» se abre en su pantalla
  function aOtroEspacio(e) {
    if (!e || e.espacio !== 'conductores') return false;
    try { sessionStorage.setItem('volta.abrir', JSON.stringify(e)); } catch { /* sin almacenamiento */ }
    location.href = 'electrostatica-conductores.html';
    return true;
  }
  function abrir() {
    abrirEscena({ modulo: 'electrostatica' }).then(e => { if (aOtroEspacio(e)) return; cargarDatos(datosSeguros(e.datos)); aviso(`Escena abierta: ${texto(e.titulo, 'sin título', 60)}`); })
      .catch(err => aviso(texto(err.message, 'No se pudo abrir la escena.', 200)));
  }

  // ---------------------------------------------------------------------
  // Reproducción
  // ---------------------------------------------------------------------
  function cuadro(ahora) {
    if (jugando) {
      const dt = Math.min(0.05, (ahora - ultimo) / 1000) * velocidad;
      t = Math.min(DUR(), t + dt);
      if (t >= DUR()) jugando = false;
      todo();
    }
    ultimo = ahora;
    requestAnimationFrame(cuadro);
  }
  const irA = nt => { if (estatica()) return; t = nt; jugando = false; todo(); };
  function alternar() { if (estatica()) return; if (t >= DUR()) t = 0; jugando = !jugando; todo(); }
  $('#b-play').addEventListener('click', alternar);
  $('#b-reiniciar').addEventListener('click', () => irA(0));
  $('#b-atras').addEventListener('click', () => irA(Math.max(0, t - 1 / 60)));
  $('#b-adelante').addEventListener('click', () => irA(Math.min(DUR(), t + 1 / 60)));
  $('#velocidades').addEventListener('click', ev => { const b = /** @type {HTMLElement} */ (/** @type {Element} */ (ev.target).closest('button')); if (b) velocidad = parseFloat(b.dataset.v); });
  function ponerCapa(k, on) { ESC.capas[k] = on; document.querySelectorAll(`.capa-btn[data-capa="${k}"]`).forEach(b => b.setAttribute('aria-pressed', String(on))); const c = insp.querySelector(`[data-mostrar="capa.${k}"]`); if (c) /** @type {HTMLInputElement} */ (c).checked = on; }
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => { const k = /** @type {HTMLElement} */ (b).dataset.capa; ponerCapa(k, !ESC.capas[k]); registrar(); dibujar(); }));
  $('#pest').addEventListener('click', () => setTimeout(todo, 0));

  // Avisos breves sobre el lienzo (componente "Notificación")
  let relojAviso = null;
  function aviso(txt, accion) {
    let el = $('#aviso');
    if (!el) { el = document.createElement('div'); el.id = 'aviso'; el.className = 'aviso-flotante'; area.appendChild(el); }
    el.innerHTML = `${ico('i-info')}<span></span>${accion ? `<button class="btn btn-compacto">${accion[0]}</button>` : ''}`;
    el.querySelector('span').textContent = txt;
    if (accion) el.querySelector('button').addEventListener('click', () => { accion[1](); el.hidden = true; });
    el.hidden = false; clearTimeout(relojAviso); relojAviso = setTimeout(() => { el.hidden = true; }, 3600);
  }
  // Botones sueltos que todavía no hacen nada: dicen por qué
  document.addEventListener('click', ev => {
    const b = ev.target instanceof Element ? ev.target.closest('button[data-pendiente]') : null;
    if (!b || b.closest('.paleta[data-pendiente]')) return;
    setTimeout(() => b.setAttribute('aria-pressed', 'false'), 0);
    aviso(/** @type {HTMLElement} */ (b).dataset.pendiente);
  });

  // ---------------------------------------------------------------------
  // Lienzo: selección, arrastre de objetos (t = 0), de la sonda y de la
  // superficie gaussiana (siempre), colocación, zoom y desplazamiento
  // ---------------------------------------------------------------------
  function objetoEn(x, y) {
    const v = tz.vista, s = estado(Math.min(t, tFin()));
    if (Math.hypot(x - v.X(valor(ESC.sonda.x)), y - v.Y(valor(ESC.sonda.y))) < 12) return { id: 'sonda' };
    if (s && Math.hypot(x - v.X(s.x), y - v.Y(s.y)) < G.carga + 4) return { id: 'P' };
    if (CAMDAT) { const c = caminoEn(t); if (Math.hypot(x - v.X(c.x), y - v.Y(c.y)) < G.carga + 4) return { id: 'camino' }; }
    let mejor = null, dmin = 6;
    for (const f of FUENTES) { const d = tz.electroDistancia(f, x, y); if (d < dmin) { dmin = d; mejor = { id: f.id }; } }
    if (mejor) return mejor;
    if (ESC.gauss) {
      const g = lecturaGauss(fuentesEn(s)), [gx, gy] = v.P([g.c.x, g.c.y]), r = g.R * v.escala, d = Math.hypot(x - gx, y - gy);
      if (Math.abs(d - r) < 6) return { id: 'gauss', asa: 'radio' };
      if (d < 10) return { id: 'gauss' };
    }
    return null;
  }
  // Paso de ajuste al arrastrar: la décima parte de la cuadrícula mayor (fino con Mayús)
  const ajustar = (w, fino) => { const p = Volta.pasoAgradable(90 / tz.vista.escala) / (fino ? 100 : 10); return Math.round(w / p) * p; };
  function posLienzo(ev) { const r = lienzo.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }

  lienzo.addEventListener('pointerdown', ev => {
    const [x, y] = posLienzo(ev);
    if (ev.button === 1 || ev.button === 2 || espacioPulsado) { paneo = [x, y, tz.vista.ox, tz.vista.oy]; lienzo.setPointerCapture(ev.pointerId); return; }
    const obj = objetoEn(x, y);
    if (herramienta && !obj) { colocar(herramienta, x, y, ev.shiftKey); return; }
    if (obj) {
      if (sel !== obj.id) seleccionar(obj.id);
      if (obj.id === 'sonda') { arrastre = { tipo: 'sonda' }; lienzo.setPointerCapture(ev.pointerId); return; }
      if (obj.id === 'gauss') { arrastre = { tipo: obj.asa === 'radio' ? 'gaussR' : 'gauss' }; lienzo.setPointerCapture(ev.pointerId); return; }
      if (obj.id === 'camino') return;
      if (t > 0) { aviso('Las cargas se colocan en t = 0.', ['Ir a t = 0', () => irA(0)]); return; }
      const f = fuentePorId(obj.id);
      if (f && f.tipo === 'uniforme') return;
      arrastre = { tipo: obj.id === 'P' ? 'particula' : 'fuente', id: obj.id };
      lienzo.setPointerCapture(ev.pointerId); dibujar(); return;
    }
    paneo = [x, y, tz.vista.ox, tz.vista.oy]; lienzo.setPointerCapture(ev.pointerId);
  });
  lienzo.addEventListener('pointermove', ev => {
    const [x, y] = posLienzo(ev), v = tz.vista, wx = v.mx(x), wy = v.my(y);
    $('#cx').textContent = cantidad(wx, 'm', 4); $('#cy').textContent = cantidad(wy, 'm', 4);
    $('#cv').textContent = conPrefijo(potencial(fuentesEn(estado(Math.min(t, tFin()))), wx, wy), 'V', 4);
    if (arrastre) {
      const fino = ev.shiftKey;
      if (arrastre.tipo === 'fuente' || arrastre.tipo === 'particula') {
        const o = arrastre.tipo === 'particula' ? ESC.particula : fuentePorId(arrastre.id);
        o.x = ajustar(wx, fino); o.y = ajustar(wy, fino); arrastre.movido = true;
        recalcular(); return;
      }
      if (arrastre.tipo === 'sonda') { ESC.sonda.x = ajustar(wx, fino); ESC.sonda.y = ajustar(wy, fino); }
      else if (arrastre.tipo === 'gauss') { ESC.gauss.x = ajustar(wx, fino); ESC.gauss.y = ajustar(wy, fino); }
      else if (arrastre.tipo === 'gaussR') { const g = ESC.gauss; g.R = Math.max(10 / v.escala, ajustar(Math.hypot(wx - valor(g.x), wy - valor(g.y)), fino)); }
      arrastre.movido = true; dibujar(); lecturas(); graficas(); return;
    }
    if (paneo) { v.ox = paneo[2] + x - paneo[0]; v.oy = paneo[3] + y - paneo[1]; dibujar(); return; }
    const h = objetoEn(x, y), id = h ? h.id : null;
    if (id !== hover) { hover = id; dibujar(); }
    lienzo.style.cursor = herramienta && !h ? 'crosshair' : h && h.asa === 'radio' ? 'ew-resize' : h && (h.id === 'sonda' || h.id === 'gauss' || t === 0) ? 'grab' : 'default';
  });
  lienzo.addEventListener('pointerup', () => {
    if (arrastre && arrastre.movido) { registrar(); construirArbol(); construirInspector(); }
    const habia = !!paneo; arrastre = null; paneo = null; if (habia) graficas(); dibujar(); lecturas();
  });
  lienzo.addEventListener('pointerleave', () => { if (hover && !arrastre) { hover = null; dibujar(); } });
  lienzo.addEventListener('contextmenu', ev => ev.preventDefault());
  lienzo.addEventListener('wheel', ev => {
    ev.preventDefault();
    const [x, y] = posLienzo(ev);
    tz.vista.zoom(Math.exp(-ev.deltaY * 0.0015), x, y);
    zoomTexto(); dibujar(); if (estatica()) graficas();
  }, { passive: false });
  function zoomTexto() { $('#zoom').textContent = Math.round(tz.vista.escala / escala0 * 100) + ' %'; }
  function zoomCentro(f) { tz.vista.zoom(f, tz.w / 2, tz.h / 2); zoomTexto(); dibujar(); if (estatica()) graficas(); }
  function encuadrarTodo() { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); todo(); }
  $('#b-zoom-mas').addEventListener('click', () => zoomCentro(1.25));
  $('#b-zoom-menos').addEventListener('click', () => zoomCentro(0.8));
  $('#b-encuadrar').addEventListener('click', encuadrarTodo);

  // Paleta: los objetos se colocan con un clic en el lienzo
  // (espacio.js marca el botón pulsado después de este oyente; por eso se decide en el siguiente turno)
  $('#paleta-objetos').addEventListener('click', ev => {
    const b = /** @type {HTMLElement} */ (/** @type {Element} */ (ev.target).closest('.herr')); if (!b) return;
    const tipo = b.dataset.objeto;
    setTimeout(() => {
      if (herramienta === tipo) { soltarHerramienta(); return; }
      if (tipo === 'uniforme') { soltarHerramienta(); colocar('uniforme', tz.w / 2, tz.h / 2, false); return; }
      herramienta = tipo; b.setAttribute('aria-pressed', 'true'); aviso('Haz clic en el lienzo para colocarlo. Esc cancela.');
    }, 0);
  });
  $('#paleta-instrumentos').addEventListener('click', ev => {
    const b = /** @type {HTMLElement} */ (/** @type {Element} */ (ev.target).closest('.herr')); if (!b) return;
    const tipo = b.dataset.instrumento;
    setTimeout(() => {
      document.querySelectorAll('#paleta-instrumentos .herr').forEach(x => x.setAttribute('aria-pressed', 'false'));
      if (tipo === 'sonda') seleccionar('sonda');
      else if (tipo === 'gauss') {
        if (!ESC.gauss) { const c = [tz.vista.mx(tz.w / 2), tz.vista.my(tz.h / 2)]; ESC.gauss = { forma: 'esfera', x: ajustar(c[0]), y: ajustar(c[1]), R: Volta.pasoAgradable(90 / tz.vista.escala), L: 1 }; sel = 'gauss'; cambio(); aviso('Arrastra la superficie para moverla; su borde, para cambiar el radio.'); }
        else seleccionar('gauss');
      }
    }, 0);
  });
  function soltarHerramienta() { herramienta = null; document.querySelectorAll('#paleta-objetos .herr').forEach(b => b.setAttribute('aria-pressed', 'false')); lienzo.style.cursor = 'default'; }
  function colocar(tipo, x, y, fino) {
    if (t > 0 && !estatica()) { aviso('Los objetos se colocan en t = 0.', ['Ir a t = 0', () => irA(0)]); return; }
    if (tipo === 'uniforme' && ESC.fuentes.some(f => f.tipo === 'uniforme')) { aviso('La escena ya tiene un campo uniforme: cámbialo en el inspector.'); seleccionar(ESC.fuentes.find(f => f.tipo === 'uniforme').id); return; }
    const usados = new Set([...ESC.fuentes.map(f => f.id), ...ESC.fuentes.map(f => f.nombre), 'P']);
    let letra = 'A'; while (usados.has(letra)) letra = String.fromCharCode(letra.charCodeAt(0) + 1);
    const largo = Volta.pasoAgradable(160 / tz.vista.escala);
    const wx = ajustar(tz.vista.mx(x), fino), wy = ajustar(tz.vista.my(y), fino);
    const NOMBRES = { esfera: 'Esfera', hilo: 'Hilo', segmento: 'Segmento', anillo: 'Anillo', lamina: 'Lámina', uniforme: 'Campo uniforme' };
    const f = { id: letra, nombre: tipo.startsWith('carga') ? letra : `${NOMBRES[tipo]} ${letra}`, tipo: tipo.startsWith('carga') ? 'puntual' : tipo };
    if (tipo !== 'uniforme') { f.x = wx; f.y = wy; }
    if (tipo === 'carga+' || tipo === 'carga-') f.q = (tipo === 'carga+' ? 1 : -1) * 1e-6;
    if (tipo === 'esfera') Object.assign(f, { q: 1e-6, radio: largo / 3, conductora: false });
    if (tipo === 'hilo') f.lambda = 1e-6;
    if (tipo === 'segmento') Object.assign(f, { q: 1e-6, largo, angulo: 0 });
    if (tipo === 'anillo') Object.assign(f, { q: 1e-6, radio: largo / 3, angulo: 0 });
    if (tipo === 'lamina') Object.assign(f, { sigma: 1e-8, largo, angulo: 0 });
    if (tipo === 'uniforme') Object.assign(f, { E0: 1000, angulo: 0 });
    ESC.fuentes.push(f); soltarHerramienta(); sel = f.id; cambio();
  }
  function borrarSeleccion() {
    if (sel === 'gauss') { ESC.gauss = null; sel = 'campo'; cambio(); return; }
    if (sel === 'P' && ESC.particula) { ESC.particula = null; sel = 'campo'; t = 0; cambio(); aviso('Partícula quitada: la escena es estática.'); return; }
    const f = fuentePorId(sel); if (!f) return;
    ESC.fuentes = ESC.fuentes.filter(x => x !== f); delete mostrar.fuerzaFija[f.id];
    sel = ESC.particula ? 'P' : 'campo'; cambio();
  }

  // ---------------------------------------------------------------------
  // Exportación: CSV con precisión completa y BOM, imagen del lienzo
  // ---------------------------------------------------------------------
  function exportarCSV() {
    let filas, csv;
    if (SIM) {
      filas = muestrear(0, SIM.tFin, DUR() / 650, tt => { const s = estado(tt), e = energia(s); return [tt, s.x, s.y, s.vx, s.vy, e.K, e.U]; });
      csv = aCSV(['t (s)', 'x (m)', 'y (m)', 'vx (m/s)', 'vy (m/s)', 'Ek (J)', 'U (J)'], filas);
    } else if (CAMDAT) {
      filas = CAMDAT.muestras.map(m => [m.l, m.x, m.y, m.V, m.E, m.W]);
      csv = aCSV(['s (m)', 'x (m)', 'y (m)', 'V (V)', '|E| (V/m)', 'W (J)'], filas);
    } else {
      const enX = ESC.vista.perfil !== 'y', sx = valor(ESC.sonda.x), sy = valor(ESC.sonda.y), caja = cajaEscena(), a = enX ? caja.x0 : caja.y0, b = enX ? caja.x1 : caja.y1;
      filas = [];
      for (let i = 0; i <= 400; i++) { const u = a + (b - a) * i / 400, x = enX ? u : sx, y = enX ? sy : u, [ex, ey] = campo(FUENTES, x, y); filas.push([x, y, potencial(FUENTES, x, y), ex, ey]); }
      csv = aCSV(['x (m)', 'y (m)', 'V (V)', 'Ex (V/m)', 'Ey (V/m)'], filas);
    }
    descargarTexto('cargas-y-campos-datos.csv', csv).then(r => { if (r) aviso(`Datos exportados: ${filas.length} filas`); }, () => {});
  }
  function exportarImagen() { descargarLienzo(lienzo, 'cargas-y-campos.png').then(r => { if (r) aviso('Imagen exportada'); }); }
  $('#b-exportar').addEventListener('click', exportarCSV);

  // ---------------------------------------------------------------------
  // Menú de escenas, paleta de comandos y teclado
  // ---------------------------------------------------------------------
  const ICONO_TIPO = { Tutorial: 'i-tutorial', Ejemplo: 'i-ejemplo', MEXT: 'i-mext' };
  const ESCENAS_CONDUCTORES = [['Capacitores, conductores y dieléctricos', 'o-capacitor-placas']];
  function menuEscenas() {
    const m = $('#menu-escenas');
    if (!m.hidden) { m.hidden = true; return; }
    m.innerHTML = [['Tutorial', 'Tutoriales'], ['Ejemplo', 'Ejemplos'], ['MEXT', 'MEXT · electrostática (E1)']].map(([g, tit], i) => (i ? '<div class="menu-sep"></div>' : '') + `<div class="menu-titulo">${tit}</div>` + ESCENAS.filter(e => e.tipo === g).map(e =>
      `<div class="menu-item" role="menuitem" data-clave="${e.clave}"${ESC.clave === e.clave ? ' aria-current="true"' : ''}>${ico(ICONO_TIPO[g])}${e.titulo}${e.anio ? `<span class="chip lleno">${e.anio}</span>` : ''}</div>`).join('')).join('') +
      '<div class="menu-sep"></div><div class="menu-titulo">Otro espacio de Electrostática</div>' +
      ESCENAS_CONDUCTORES.map(([t1, i1]) => `<a class="menu-item" role="menuitem" href="electrostatica-conductores.html">${ico(i1)}${t1}<span class="atajo">MEXT E2 y E3</span></a>`).join('');
    const r = $('#b-escenas').getBoundingClientRect();
    m.style.left = r.left + 'px'; m.style.top = (r.bottom + 4) + 'px'; m.hidden = false;
  }
  $('#b-escenas').addEventListener('click', ev => { ev.stopPropagation(); menuEscenas(); });
  $('#menu-escenas').addEventListener('click', ev => { const it = /** @type {HTMLElement} */ (/** @type {Element} */ (ev.target).closest('.menu-item[data-clave]')); if (!it) return; $('#menu-escenas').hidden = true; abrirEscena1(it.dataset.clave); });
  document.addEventListener('pointerdown', ev => { if (!(ev.target instanceof Element) || !ev.target.closest('#menu-escenas, #b-escenas')) $('#menu-escenas').hidden = true; });

  let espacioPulsado = false;
  const alternarCapa = k => () => { const b = /** @type {HTMLElement} */ (document.querySelector(`.capa-btn[data-capa="${k}"]`)); if (b) b.click(); };
  const COMANDOS = [
    ['i-reproducir', 'Reproducir o pausar', 'Espacio', alternar],
    ['i-reiniciar', 'Reiniciar la simulación', 'Inicio', () => irA(0)],
    ['i-encuadrar', 'Encuadrar todo', 'F', encuadrarTodo],
    ['i-deshacer', 'Deshacer', 'Ctrl Z', deshacer],
    ['i-rehacer', 'Rehacer', 'Ctrl Y', rehacer],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar],
    ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
    ['i-historial', 'Restablecer la escena original', '', () => abrirEscena1(ESC.clave)],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['n-sonda-campo', 'Seleccionar la sonda de campo', '', () => seleccionar('sonda')],
    ['n-superficie-gauss', 'Superficie gaussiana', '', () => /** @type {HTMLElement} */ (document.querySelector('[data-instrumento="gauss"]')).click()],
    ['i-capas', 'Mostrar u ocultar líneas de campo', 'L', alternarCapa('lineas')],
    ['i-capas', 'Mostrar u ocultar equipotenciales', 'E', alternarCapa('equi')],
    ['i-capas', 'Mostrar u ocultar el mapa de potencial', 'M', alternarCapa('mapa')],
    ['i-ajustes', 'Ajustes de la vista del campo', '', () => seleccionar('campo')],
    ['i-borrar', 'Quitar el objeto seleccionado', 'Supr', borrarSeleccion],
    ['i-exportar', 'Exportar datos a CSV', '', exportarCSV],
    ['i-imagen', 'Exportar imagen del lienzo', '', exportarImagen],
    ...[['carga+', 'o-carga-positiva', 'una carga positiva'], ['carga-', 'o-carga-negativa', 'una carga negativa'], ['esfera', 'o-esfera-cargada', 'una esfera cargada'], ['hilo', 'o-hilo-infinito', 'un hilo infinito'], ['segmento', 'o-segmento-cargado', 'un segmento cargado'], ['anillo', 'o-anillo', 'un anillo cargado'], ['lamina', 'o-lamina', 'una lámina cargada'], ['uniforme', 'o-campo-uniforme', 'un campo uniforme']]
      .map(([k, i1, txt]) => [i1, `Añadir ${txt}`, '', () => { irA(0); /** @type {HTMLElement} */ (document.querySelector(`[data-objeto="${k}"]`)).click(); }, 'Objetos']),
    ...ESCENAS.map(e => [ICONO_TIPO[e.tipo], `Abrir escena: ${e.titulo}`, e.tipo === 'MEXT' ? `MEXT ${e.anio}` : e.tipo, () => abrirEscena1(e.clave), 'Escenas']),
    ['o-capacitor-placas', 'Ir a Conductores y dieléctricos', '', () => { location.href = 'electrostatica-conductores.html'; }, 'Escenas'],
  ];
  let selCmd = 0;
  function pintarComandos() {
    const q = $('#cmd-q').value.trim().toLowerCase(), lista = COMANDOS.filter(c => c[1].toLowerCase().includes(q));
    selCmd = Math.min(selCmd, Math.max(0, lista.length - 1));
    let grupoC = null, html = '';
    lista.forEach((c, i) => {
      const g = c[4] || 'Acciones';
      if (g !== grupoC) { html += `<div class="menu-titulo">${g}</div>`; grupoC = g; }
      html += `<div class="menu-item${i === selCmd ? ' activo' : ''}" data-i="${COMANDOS.indexOf(c)}">${ico(c[0])}${c[1]}<span class="atajo">${c[2]}</span></div>`;
    });
    $('#cmd-lista').innerHTML = html;
    return lista;
  }
  function abrirComandos() { $('#menu-escenas').hidden = true; $('#velo-comandos').hidden = false; $('#cmd-q').value = ''; selCmd = 0; pintarComandos(); $('#cmd-q').focus(); }
  function cerrarComandos() { $('#velo-comandos').hidden = true; }
  $('#b-comandos').addEventListener('click', abrirComandos);
  $('#cmd-q').addEventListener('input', () => { selCmd = 0; pintarComandos(); });
  $('#cmd-lista').addEventListener('click', ev => { const it = /** @type {HTMLElement} */ (/** @type {Element} */ (ev.target).closest('.menu-item')); if (it) { cerrarComandos(); COMANDOS[+it.dataset.i][3](); } });
  $('#velo-comandos').addEventListener('click', ev => { if (/** @type {Element} */ (ev.target).id === 'velo-comandos') cerrarComandos(); });
  document.addEventListener('keydown', ev => {
    if (!$('#velo-comandos').hidden) {
      const lista = pintarComandos();
      if (ev.key === 'Escape') cerrarComandos();
      else if (ev.key === 'ArrowDown') { selCmd = Math.min(lista.length - 1, selCmd + 1); pintarComandos(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { selCmd = Math.max(0, selCmd - 1); pintarComandos(); ev.preventDefault(); }
      else if (ev.key === 'Enter' && lista[selCmd]) { cerrarComandos(); lista[selCmd][3](); }
      return;
    }
    const ctrl = ev.ctrlKey || ev.metaKey, tecla = ev.key.toLowerCase();
    if (ctrl && tecla === 'k') { ev.preventDefault(); abrirComandos(); return; }
    if (ctrl && tecla === 's') { ev.preventDefault(); guardar(); return; }
    if (ctrl && tecla === 'o') { ev.preventDefault(); abrir(); return; }
    if (ev.target instanceof Element && ev.target.matches('input:not([type=range]), textarea')) return;
    if (ctrl && (tecla === 'y' || (ev.shiftKey && tecla === 'z'))) { ev.preventDefault(); rehacer(); return; }
    if (ctrl && tecla === 'z') { ev.preventDefault(); deshacer(); return; }
    if (ctrl) return;
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) alternar(); espacioPulsado = true; }
    else if (ev.key === 'ArrowRight') irA(Math.min(DUR(), t + 1 / 60));
    else if (ev.key === 'ArrowLeft') irA(Math.max(0, t - 1 / 60));
    else if (ev.key === 'Home') irA(0);
    else if (ev.key === 'Escape') { soltarHerramienta(); $('#menu-escenas').hidden = true; }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') borrarSeleccion();
    else if (tecla === 'f') encuadrarTodo();
    else if (tecla === 'l') alternarCapa('lineas')();
    else if (tecla === 'e') alternarCapa('equi')();
    else if (tecla === 'm') alternarCapa('mapa')();
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });
  window.addEventListener('blur', () => { espacioPulsado = false; });

  // ---------------------------------------------------------------------
  // Arranque
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); claveNiveles = ''; todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search), limpioURL = ![...q.keys()].length;
    // Escena abierta desde Inicio, o la última sesión (no en capturas ni con parámetros)
    const pend = escenaPendiente('electrostatica');
    if (pend && aOtroEspacio(pend)) return;
    const previa = pend || (limpioURL ? autoguardado.leer('electrostatica', { modulo: 'electrostatica' }) : null);
    if (q.has('escena') || !previa) ESC = completa(escenaDe(q.get('escena') || 'mext-2020-2'));
    else ESC = datosSeguros(previa.datos);
    autoguardar = limpioURL || !!previa;
    if (q.get('mapa') === '1') ESC.capas.mapa = true;
    if (q.get('malla') === '1') ESC.capas.malla = true;
    if (q.get('fuentes') === 'todas') ESC.vista.fuentes = 'todas';
    sel = ESC.particula ? 'P' : ESC.camino ? 'camino' : 'sonda';
    if (q.has('sel')) sel = q.get('sel');
    titulo(); construirVariables();
    tz.ajustar(); resolverEscena(); encuadrar(); escala0 = tz.vista.escala;
    recalcular();
    if (q.has('t') && !estatica()) t = Math.max(0, Math.min(DUR(), parseFloat(q.get('t'))));
    if (q.has('pest')) { const b = /** @type {HTMLElement} */ (document.querySelector(`#pest [aria-controls="p-${q.get('pest')}"]`)); if (b) b.click(); }
    construirArbol(); construirInspector(); todo(); zoomTexto();
    historial = new Historial(instantanea()); botonesHistorial();
    requestAnimationFrame(a => { ultimo = a; requestAnimationFrame(cuadro); });
  });
})();
