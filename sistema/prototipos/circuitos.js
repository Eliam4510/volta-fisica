/* ==========================================================================
   Volta · Circuitos — espacio de trabajo "Transitorios"
   Esquema sobre una cuadrícula: cada componente tiene centro, giro y
   parámetros; los cables son polilíneas ortogonales que se parten en tramos
   de una unidad (cada tramo es un cable del motor, con su propia corriente
   para animar los puntos). Los nodos son los puntos de la cuadrícula.
   La física está en el motor puro sistema/motores/circuitos.js (probado en
   pruebas/circuitos.test.js): MNA, transitorio trapezoidal, interruptores
   como eventos, islas con carga conservada, modo ideal con la energía
   perdida al conectar y registro de energía que cierra.
   Misma estructura que mecanica.js: motor → estado(t) → lienzo → paneles.
   Escenas MEXT: cada una lleva su nota (qué se reconstruyó y cómo) y una
   función examen que lee de la simulación la magnitud que contesta cada
   apartado; el grupo «Examen» del inspector la muestra junto a la fórmula
   del enunciado y la opción, que solo aparece si la medida coincide. Las
   mismas situaciones se comprueban en pruebas/circuitos-mext.test.js.
   La unidad de tiempo se elige con la duración (s, ms o µs) y las escenas
   de menos de un segundo se reproducen a cámara lenta.
   ========================================================================== */
import { simularCircuito, puntoOperacion, estadoEn, balance, curvaBombilla, capacidadEn } from '../motores/circuitos.js';
import { aCSV } from '../nucleo/csv.js';
import { descargarTexto, descargarLienzo, nombreArchivo, avisar as avisarLienzo } from '../componentes/exportar.js';
import { crearEscena, numero, texto } from '../nucleo/escena.js';
import { Historial } from '../nucleo/historial.js';
import { evaluar } from '../nucleo/unidades.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';
import { registrarDocumento, confirmarCambios, documentoNuevo, hayCambios } from '../componentes/documento.js';

(function () {
  'use strict';
  const { Trazo, fmt, cantidad, grafica, LineaTiempo, leerTokens, fmtMarca, pasoAgradable, rombo, ESP } = Volta;
  const $ = s => document.querySelector(s);

  // ---------------------------------------------------------------------
  // Catálogo de componentes (nombre, icono, parámetros con su unidad)
  // ---------------------------------------------------------------------
  // params: [clave, etiqueta, unidad base, dimensión, valor por omisión]
  const CAT = {
    bateria: { nombre: 'Batería', en: 'Battery', ico: 'o-bateria', pref: 'E', params: [['E', 'Fem', 'V', 'potencial', 6], ['r', 'Resistencia interna', 'Ω', 'resistencia', 0]] },
    'fuente-corriente': { nombre: 'Fuente de corriente', en: 'Current source', ico: 'o-fuente-corriente', pref: 'J', params: [['I', 'Corriente', 'A', 'corriente', 0.01]] },
    resistencia: { nombre: 'Resistencia', en: 'Resistor', ico: 'o-resistencia', pref: 'R', params: [['R', 'Resistencia', 'Ω', 'resistencia', 100]] },
    reostato: { nombre: 'Reóstato', en: 'Rheostat', ico: 'o-reostato', pref: 'Rv', params: [['R', 'Resistencia total', 'Ω', 'resistencia', 100], ['x', 'Cursor', '', 'adimensional', 0.5]] },
    bombilla: { nombre: 'Bombilla', en: 'Light bulb', ico: 'o-bombilla', pref: 'B', params: [['Vn', 'Voltaje nominal', 'V', 'potencial', 12], ['Pn', 'Potencia nominal', 'W', 'potencia', 6], ['frio', 'Caliente / frío', '', 'adimensional', 8]] },
    capacitor: { nombre: 'Capacitor', en: 'Capacitor', ico: 'o-capacitor', pref: 'C', params: [['C', 'Capacitancia', 'F', 'capacitancia', 1e-3], ['q0', 'Carga inicial', 'C', 'carga', 0]] },
    inductor: { nombre: 'Inductor', en: 'Inductor', ico: 'o-inductor', pref: 'L', params: [['L', 'Inductancia', 'H', 'inductancia', 10], ['i0', 'Corriente inicial', 'A', 'corriente', 0]] },
    interruptor: { nombre: 'Interruptor', en: 'Switch', ico: 'o-interruptor', pref: 'S', params: [] },
    'interruptor-3': { nombre: 'Interruptor de tres posiciones', en: 'Three-way switch', ico: 'o-interruptor-3', pref: 'S', params: [] },
    voltimetro: { nombre: 'Voltímetro', en: 'Voltmeter', ico: 'n-voltimetro', pref: 'Vm', params: [] },
    amperimetro: { nombre: 'Amperímetro', en: 'Ammeter', ico: 'n-amperimetro', pref: 'Am', params: [] },
    tierra: { nombre: 'Tierra', en: 'Ground', ico: 'o-tierra', pref: 'T', params: [] },
  };
  const ES_INTERRUPTOR = tipo => tipo === 'interruptor' || tipo === 'interruptor-3';

  // Prefijos SI que entiende nucleo/unidades.js para cada unidad
  const PREF = { V: ['k', '', 'm'], A: ['', 'm', 'µ'], 'Ω': ['M', 'k', ''], F: ['', 'm', 'µ', 'n', 'p'], H: ['', 'm', 'µ'], C: ['', 'm', 'µ', 'n', 'p'], W: ['k', '', 'm'], J: ['k', '', 'm', 'µ'], s: ['', 'm', 'µ'] };
  const FAC = { M: 1e6, k: 1e3, '': 1, m: 1e-3, 'µ': 1e-6, n: 1e-9, p: 1e-12 };
  // Valor SI → [número, unidad con el prefijo que le corresponde]
  function enUnidad(v, u) {
    const lista = PREF[u]; if (!lista) return [v, u];
    const a = Math.abs(v);
    let p = a === 0 ? (lista.includes('') ? '' : lista[0]) : lista[lista.length - 1];
    if (a > 0) for (const q of lista) if (a >= FAC[q] * 0.99995) { p = q; break; }
    return [v / FAC[p], p + u];
  }
  // Unidad de tiempo de la escena: la que deja la duración entre 1 y 1000
  const UT = () => [[1, 's'], [1e-3, 'ms'], [1e-6, 'µs']].find(([f]) => ESC.duracion >= f * 0.999) || [1e-6, 'µs'];
  // Tiempo simulado por segundo de pantalla a 1×: tiempo real si la escena dura
  // un segundo o más; si no, cámara lenta (la escena entera en unos 10 s)
  const ritmo = () => (ESC.duracion >= 1 ? 1 : ESC.duracion / 10);
  // Instante con la unidad de la escena: 4.000 s, 110.0 µs
  const Tf = (v, cifras = 4) => { const [f, u] = UT(); return cantidad(v / f, u, cifras); };
  // Número de un campo editable: sin ceros de relleno (2.2, 500, 0.05)
  const numCampo = x => String(Number(Number(x).toPrecision(6)));
  const valorCon = (v, u, cifras = 4) => { const [x, uu] = enUnidad(v, u); return cantidad(x, uu, cifras); };
  // Nombre de un componente con subíndice: "C1" → C₁
  const nombreSegs = (id, tam = 12.5) => { const m = /^(\D+?)(\d+)$/.exec(id); return m ? [{ t: m[1], f: 'ui', tam }, { t: m[2], f: 'ui', tam: tam * 0.72, dy: 3 }] : [{ t: id, f: 'ui', tam }]; };
  const nombreHTML = id => { const m = /^(\D+?)(\d+)$/.exec(id); return m ? `${m[1]}<sub>${m[2]}</sub>` : id; };

  // ---------------------------------------------------------------------
  // Examen: ayudantes para las filas de las escenas MEXT
  // ---------------------------------------------------------------------
  // Símbolo en cursiva con subíndice en redonda: S('q', 'C1') → q con C1 abajo
  const S = (s, sub) => `<span class="sim">${s}</span>${sub ? `<sub class="r">${sub}</sub>` : ''}`;
  // Opciones numéricas del examen, en orden: [['(a)', v₁·factor], ['(b)', v₂·factor], …]
  const LETRAS = 'abcdefghijklmnopqrstuvwxyz';
  const listaOpc = (valores, factor = 1) => valores.map((v, i) => [`(${LETRAS[i]})`, v * factor]);
  // Las respuestas de 2013 P2: 2, 4, 8, 16, 32 y sus tercios y novenos
  const OPC_2013 = listaOpc([2, 4, 8, 16, 32, 2 / 3, 4 / 3, 8 / 3, 16 / 3, 32 / 3, 2 / 9, 4 / 9, 8 / 9, 16 / 9, 32 / 9]);

  // ---------------------------------------------------------------------
  // Escenarios. Coordenadas en unidades de la cuadrícula (y hacia arriba).
  // rot: giro en grados (0 = de a a la izquierda a b a la derecha).
  // Variables: valor en su unidad de pantalla; factor la pasa a SI; liga:
  // [componente, parámetro] que toman ese valor.
  // MEXT: nota (reconstrucción y situación) y examen(X) → filas
  // {n, etq, valor, esperado, u, formula, t, opcion | opciones, tol, escala}:
  // valor medido en la simulación, esperado según la fórmula del enunciado
  // con los parámetros actuales, t desde el que se conoce. X da acceso a los
  // componentes (el), índices (k), estados (en, despues) y acciones.
  // ---------------------------------------------------------------------
  const ESCENARIOS = [
    {
      clave: 'rc', titulo: 'Carga y descarga de un capacitor', tipo: 'Tutorial', duracion: 12, dt: 0.01,
      elementos: [
        { id: 'E', tipo: 'bateria', p: [0, 4], rot: 270, E: 6, r: 0, etq: 'izq' },
        { id: 'S', tipo: 'interruptor-3', p: [3, 7], rot: 90, posicion: null, etq: 'izq' },
        { id: 'R', tipo: 'resistencia', p: [5, 5], rot: 0, R: 2000, etq: 'arr' },
        { id: 'C', tipo: 'capacitor', p: [7, 3], rot: 270, C: 500e-6, q0: 0, etq: 'izq' },
        { id: 'T', tipo: 'tierra', p: [4, 0], rot: 0 },
      ],
      cables: [[[0, 5], [0, 8], [2, 8]], [[0, 3], [0, 0], [9, 0], [9, 8], [4, 8]], [[3, 6], [3, 5], [4, 5]], [[6, 5], [7, 5], [7, 4]], [[7, 2], [7, 0]]],
      nodos: {},
      acciones: [{ t: 0.5, id: 'S', estado: 'a' }, { t: 6, id: 'S', estado: 'c' }],
      variables: {
        E: { sim: 'E', val: 6, min: 1, max: 12, paso: 0.5, u: 'V', factor: 1, liga: [['E', 'E']] },
        R: { sim: 'R', val: 2, min: 0.5, max: 5, paso: 0.1, u: 'kΩ', factor: 1e3, liga: [['R', 'R']] },
        C: { sim: 'C', val: 500, min: 100, max: 2000, paso: 50, u: 'µF', factor: 1e-6, liga: [['C', 'C']] },
      },
      graficas: [{ m: 'V', series: [{ id: 'C' }, { id: 'R' }] }, { m: 'I', series: [{ id: 'R' }] }, { m: 'q', series: [{ id: 'C' }] }],
      sel: 'C',
    },
    {
      clave: 'lc', titulo: 'RC cargado y luego LC', tipo: 'MEXT', anio: '2019 P2', duracion: 15, dt: 0.01,
      elementos: [
        { id: 'V', tipo: 'bateria', p: [0, 2], rot: 270, E: 10, r: 0, etq: 'izq' },
        { id: 'R', tipo: 'resistencia', p: [0, 5], rot: 270, R: 1000, etq: 'izq' },
        { id: 'S', tipo: 'interruptor-3', p: [3, 7], rot: 90, posicion: 'b', etq: 'der' },
        { id: 'C', tipo: 'capacitor', p: [3, 3], rot: 270, C: 1e-3, q0: 0, etq: 'izq' },
        { id: 'L', tipo: 'inductor', p: [6, 4], rot: 270, L: 100, i0: 0, etq: 'der' },
        { id: 'T', tipo: 'tierra', p: [3, 0], rot: 0 },
      ],
      cables: [[[0, 6], [0, 8], [2, 8]], [[0, 4], [0, 3]], [[0, 1], [0, 0], [6, 0], [6, 3]], [[4, 8], [6, 8], [6, 5]], [[3, 6], [3, 4]], [[3, 2], [3, 0]]],
      nodos: {},
      acciones: [{ t: 0.5, id: 'S', estado: 'a' }, { t: 9, id: 'S', estado: 'c' }],
      variables: {
        V: { sim: 'V', val: 10, min: 1, max: 12, paso: 0.5, u: 'V', factor: 1, liga: [['V', 'E']] },
        R: { sim: 'R', val: 1, min: 0.2, max: 5, paso: 0.1, u: 'kΩ', factor: 1e3, liga: [['R', 'R']] },
        C: { sim: 'C', val: 1, min: 0.2, max: 5, paso: 0.1, u: 'mF', factor: 1e-3, liga: [['C', 'C']] },
        L: { sim: 'L', val: 100, min: 10, max: 400, paso: 5, u: 'H', factor: 1, liga: [['L', 'L']] },
      },
      graficas: [{ m: 'V', series: [{ id: 'C' }] }, { m: 'I', series: [{ id: 'L' }, { id: 'R' }] }, { m: 'U', series: [{ id: 'C' }, { id: 'L' }] }],
      sel: 'L',
      nota: 'Figura redibujada: en a, la batería V carga C a través de R; en c, C se descarga por la bobina L y el circuito LC oscila sin pérdidas. El examen es simbólico; la escena fija V = 10 V, R = 1 kΩ, C = 1 mF y L = 100 H para que la oscilación dure unos segundos.',
      examen: X => {
        const V = X.el('V').E, R = X.el('R').R, C = X.el('C').C, L = X.el('L').L, ta = X.accion('S', 'a'), tc = X.accion('S', 'c');
        const kR = X.k('R'), kC = X.k('C'), kL = X.k('L'), sc = X.en(tc), osc = X.oscilacion(kL, tc);
        return [
          { n: '(1)', etq: S('I', '0'), valor: Math.abs(X.despues(ta).I[kR]), esperado: V / R, u: 'A', formula: 'V/R, por R justo al pasar a a', opcion: '(e)', t: ta },
          { n: '(2)', etq: S('q', 'C'), valor: sc.q[kC], esperado: C * V, u: 'C', formula: 'CV', opcion: '(f)', t: tc },
          { n: '(3)', etq: S('Q', 'R'), valor: sc.Q[kR], esperado: C * V * V / 2, u: 'J', formula: 'CV²/2', opcion: '(b)', t: tc },
          { n: '(4)', etq: `${S('I', 'L')}(${S('t')})`, texto: 'seno desde 0', formula: 'V·√(C/L)·sen(t/√(LC)): parte de cero y oscila', t: tc + osc.T / 4 },
          { n: '(5)', etq: `${S('I', 'L')}<sub class="r">máx</sub>`, valor: osc.max, esperado: V * Math.sqrt(C / L), u: 'A', formula: 'V·√(C/L)', opcion: '(a)', t: tc + osc.T / 4 },
          { n: '', etq: S('T'), valor: osc.T, esperado: 2 * Math.PI * Math.sqrt(L * C), u: 's', formula: '2π·√(LC)', t: tc + osc.T, tol: 2e-3 },
        ];
      },
    },
    {
      clave: 'red', titulo: 'Red de capacitores con dos interruptores', tipo: 'MEXT', anio: '2023 P2', duracion: 8, dt: 0.01,
      elementos: [
        { id: 'V', tipo: 'bateria', p: [0, 3], rot: 270, E: 12, r: 0, etq: 'izq' },
        { id: 'S1', tipo: 'interruptor', p: [2, 6], rot: 0, cerrado: false, etq: 'arr' },
        { id: 'C1', tipo: 'capacitor', p: [4, 5], rot: 270, C: 1e-3, q0: 0, etq: 'izq' },
        { id: 'C2', tipo: 'capacitor', p: [4, 2], rot: 270, C: 1e-3, q0: 0, etq: 'izq' },
        { id: 'S2', tipo: 'interruptor', p: [6, 3], rot: 0, cerrado: false, etq: 'aba' },
        { id: 'C3', tipo: 'capacitor', p: [8, 2], rot: 270, C: 1e-3, q0: 0, etq: 'der' },
        { id: 'T', tipo: 'tierra', p: [4, 0], rot: 0 },
      ],
      cables: [[[0, 4], [0, 6], [1, 6]], [[3, 6], [4, 6]], [[4, 4], [4, 3], [5, 3]], [[7, 3], [8, 3]], [[0, 2], [0, 0], [8, 0], [8, 1]], [[4, 1], [4, 0]]],
      nodos: { A: [4, 3], B: [4, 6] },
      acciones: [
        { t: 1, id: 'S1', estado: true }, { t: 2.5, id: 'S1', estado: false }, { t: 3.5, id: 'S2', estado: true },
        { t: 5, id: 'S2', estado: false }, { t: 6, id: 'S1', estado: true },
      ],
      variables: {
        V: { sim: 'V', val: 12, min: 1, max: 24, paso: 0.5, u: 'V', factor: 1, liga: [['V', 'E']] },
        C: { sim: 'C', val: 1, min: 0.2, max: 5, paso: 0.1, u: 'mF', factor: 1e-3, liga: [['C1', 'C'], ['C2', 'C'], ['C3', 'C']] },
      },
      graficas: [{ m: 'V', series: [{ nodo: 'A' }, { nodo: 'B' }] }, { m: 'q', series: [{ id: 'C1' }, { id: 'C2' }, { id: 'C3' }] }, { m: 'U', series: [{ id: 'C1' }, { id: 'C2' }, { id: 'C3' }] }],
      sel: 'C2',
      nota: 'Figura redibujada: C₁ y C₂ en serie con la batería por S₁; C₃ se une al punto A por S₂. Tres capacitores iguales; el examen es simbólico y la escena fija V = 12 V y C = 1 mF. Sin resistencias: en modo ideal la carga salta al instante y la energía que se pierde en cada conexión queda en la tabla de eventos.',
      examen: X => {
        const V = X.el('V').E, C = X.el('C1').C, k1 = X.k('C1'), k2 = X.k('C2');
        const [c1, c5] = X.acciones('S1', true), t1 = X.accion('S1', false), [t3] = X.acciones('S2', true), t3f = X.accion('S2', false);
        const s1 = X.en(t1), s3 = X.en(t3f), s5 = X.en(X.dur);
        return [
          { n: '(1)', etq: S('q', 'C2'), valor: s1.q[k2], esperado: C * V / 2, u: 'C', formula: 'CV/2', opcion: '(e)', t: c1 },
          { n: '(2)', etq: `${S('U', 'C1')} + ${S('U', 'C2')}`, valor: s1.U[k1] + s1.U[k2], esperado: C * V * V / 4, u: 'J', formula: 'CV²/4', opcion: '(d)', t: c1 },
          { n: '(3)', etq: S('q', 'C2'), valor: s3.q[k2], esperado: C * V / 4, u: 'C', formula: 'CV/4', opcion: '(d)', t: t3 },
          { n: '(4)', etq: S('V', 'A'), valor: X.nodo(s3, 'A'), esperado: V / 4, u: 'V', formula: 'V/4; en B, 3V/4', opcion: '(e)', t: t3 },
          { n: '', etq: S('V', 'B'), valor: X.nodo(s3, 'B'), esperado: 3 * V / 4, u: 'V', formula: '3V/4', t: t3 },
          { n: '(5)', etq: S('q', 'C2'), valor: s5.q[k2], esperado: 3 * C * V / 8, u: 'C', formula: '3CV/8', opcion: '(b)', t: c5 },
        ];
      },
    },
    {
      clave: 'puente', titulo: 'Puente de Wheatstone equilibrado', tipo: 'MEXT', anio: '2027 1-(3)', duracion: 4, dt: 0.01,
      elementos: [
        { id: 'R1', tipo: 'resistencia', p: [2, 6], rot: 0, R: 10, etq: 'arr' },
        { id: 'R', tipo: 'resistencia', p: [8, 6], rot: 0, R: 15, etq: 'arr' },
        { id: 'R3', tipo: 'resistencia', p: [2, 2], rot: 0, R: 20, etq: 'arr' },
        { id: 'R4', tipo: 'resistencia', p: [8, 2], rot: 0, R: 30, etq: 'arr' },
        { id: 'S', tipo: 'interruptor', p: [5, 5], rot: 270, cerrado: false, etq: 'der' },
        { id: 'G', tipo: 'amperimetro', p: [5, 3], rot: 270, etq: 'der' },
        { id: 'E', tipo: 'bateria', p: [5, -1], rot: 180, E: 6, r: 0, etq: 'aba' },
        { id: 'T', tipo: 'tierra', p: [0, -1], rot: 0 },
      ],
      cables: [[[1, 6], [0, 6], [0, 2], [1, 2]], [[3, 6], [7, 6]], [[3, 2], [7, 2]], [[9, 6], [10, 6], [10, 2], [9, 2]], [[0, 2], [0, -1], [4, -1]], [[6, -1], [10, -1], [10, 2]]],
      nodos: { P: [5, 6], Q: [5, 2] },
      acciones: [{ t: 1, id: 'S', estado: true }],
      variables: {
        E: { sim: 'E', val: 6, min: 1, max: 12, paso: 0.5, u: 'V', factor: 1, liga: [['E', 'E']] },
        R: { sim: 'R', val: 15, min: 5, max: 40, paso: 0.5, u: 'Ω', factor: 1, liga: [['R', 'R']] },
      },
      graficas: [{ m: 'V', series: [{ nodo: 'P' }, { nodo: 'Q' }] }, { m: 'I', series: [{ id: 'G' }, { id: 'R' }] }, { m: 'barrido', id: 'G', interruptor: 'S', variable: 'R' }],
      sel: 'G',
      nota: 'Pregunta corta reconstruida de memoria (el banco no trae opciones): por S no pasa corriente al cerrarlo, así que el puente está equilibrado. El galvanómetro G en serie con S lo comprueba; la gráfica de barrido muestra su corriente contra R con S cerrado.',
      examen: X => {
        const R1 = X.el('R1').R, R3 = X.el('R3').R, R4 = X.el('R4').R, tS = X.accion('S', true), kG = X.k('G');
        // R de equilibrio: la que anula la corriente de G con S cerrado (bisección sobre el motor)
        const Ig = R => { const c = X.circuito(); c.componentes.find(e => e.id === 'R').R = R; const op = puntoOperacion(c, { estados: { S: true } }); return op.I[op.ids.indexOf('G')]; };
        const Req = X.cero(Ig, 1e-3 * R1 * R4 / R3, 1e3 * R1 * R4 / R3);
        return [
          { n: '(3)', etq: `${S('R')}<sub class="r">equilibrio</sub>`, valor: Req, esperado: R1 * R4 / R3, u: 'Ω', formula: 'R₁R₄/R₃: 10/20 = R/30', t: 0, tol: 1e-9 },
          { n: '', etq: S('I', 'G'), valor: X.en(X.dur).I[kG], esperado: Ig(X.el('R').R), u: 'A', formula: 'nula si R = R₁R₄/R₃', t: tS },
        ];
      },
    },
    {
      clave: 'bombilla', titulo: 'Bombilla no lineal y recta de carga', tipo: 'Ejemplo', duracion: 6, dt: 0.01,
      elementos: [
        { id: 'E', tipo: 'bateria', p: [0, 3], rot: 270, E: 12, r: 0, etq: 'izq' },
        { id: 'S', tipo: 'interruptor', p: [2, 6], rot: 0, cerrado: false, etq: 'arr' },
        { id: 'R', tipo: 'resistencia', p: [5, 6], rot: 0, R: 20, etq: 'arr' },
        { id: 'B', tipo: 'bombilla', p: [7, 3], rot: 270, Vn: 12, Pn: 6, frio: 8, etq: 'izq' },
        { id: 'C', tipo: 'capacitor', p: [10, 3], rot: 270, C: 0.02, q0: 0, etq: 'der' },
        { id: 'T', tipo: 'tierra', p: [5, 0], rot: 0 },
      ],
      cables: [[[0, 4], [0, 6], [1, 6]], [[3, 6], [4, 6]], [[6, 6], [10, 6], [10, 4]], [[7, 6], [7, 4]], [[0, 2], [0, 0], [10, 0], [10, 2]], [[7, 2], [7, 0]]],
      nodos: {},
      acciones: [{ t: 0.5, id: 'S', estado: true }],
      variables: {
        E: { sim: 'E', val: 12, min: 2, max: 24, paso: 0.5, u: 'V', factor: 1, liga: [['E', 'E']] },
        R: { sim: 'R', val: 20, min: 5, max: 100, paso: 1, u: 'Ω', factor: 1, liga: [['R', 'R']] },
        C: { sim: 'C', val: 20, min: 1, max: 100, paso: 1, u: 'mF', factor: 1e-3, liga: [['C', 'C']] },
      },
      graficas: [{ m: 'V', series: [{ id: 'B' }] }, { m: 'I', series: [{ id: 'B' }, { id: 'C' }, { id: 'R' }] }, { m: 'iv', id: 'B', fuente: 'E', serie: 'R' }],
      sel: 'B',
    },
    {
      clave: 'ohm', titulo: 'Ley de Ohm con voltímetro y amperímetro', tipo: 'Tutorial', duracion: 4, dt: 0.01,
      elementos: [
        { id: 'E', tipo: 'bateria', p: [0, 3], rot: 270, E: 6, r: 0, etq: 'izq' },
        { id: 'A', tipo: 'amperimetro', p: [2, 6], rot: 0, etq: 'arr' },
        { id: 'R', tipo: 'resistencia', p: [5, 3], rot: 270, R: 100, etq: 'izq' },
        { id: 'V', tipo: 'voltimetro', p: [8, 3], rot: 270, etq: 'der' },
        { id: 'S', tipo: 'interruptor', p: [2, 0], rot: 0, cerrado: false, etq: 'aba' },
        { id: 'T', tipo: 'tierra', p: [0, 0], rot: 0 },
      ],
      cables: [[[0, 4], [0, 6], [1, 6]], [[3, 6], [8, 6], [8, 4]], [[5, 6], [5, 4]], [[5, 2], [5, 0], [3, 0]], [[8, 2], [8, 0], [5, 0]], [[1, 0], [0, 0], [0, 2]]],
      nodos: {},
      acciones: [{ t: 0.5, id: 'S', estado: true }],
      variables: {
        E: { sim: 'E', val: 6, min: 1, max: 12, paso: 0.5, u: 'V', factor: 1, liga: [['E', 'E']] },
        R: { sim: 'R', val: 100, min: 10, max: 500, paso: 10, u: 'Ω', factor: 1, liga: [['R', 'R']] },
      },
      graficas: [{ m: 'I', series: [{ id: 'A' }] }, { m: 'V', series: [{ id: 'V' }] }, { m: 'barrido', id: 'A', interruptor: 'S', variable: 'R' }],
      nota: 'El amperímetro A va en serie y mide la corriente que atraviesa R; el voltímetro V, en paralelo con R, mide su voltaje. Los dos son ideales: no cambian el circuito. Al cerrar S, V/I es R; mueve R y la corriente sigue la hipérbola E/R.',
    },
    {
      clave: 'comparten', titulo: 'Dos capacitores que comparten carga', tipo: 'Ejemplo', duracion: 4, dt: 0.01,
      elementos: [
        { id: 'C1', tipo: 'capacitor', p: [2, 3], rot: 270, C: 1e-3, q0: 12e-3, etq: 'izq' },
        { id: 'S', tipo: 'interruptor', p: [4, 5], rot: 0, cerrado: false, etq: 'arr' },
        { id: 'C2', tipo: 'capacitor', p: [6, 3], rot: 270, C: 2e-3, q0: 0, etq: 'der' },
        { id: 'T', tipo: 'tierra', p: [4, 1], rot: 0 },
      ],
      cables: [[[2, 4], [2, 5], [3, 5]], [[5, 5], [6, 5], [6, 4]], [[2, 2], [2, 1], [6, 1], [6, 2]]],
      nodos: {},
      acciones: [{ t: 1, id: 'S', estado: true }],
      variables: {
        q0: { sim: 'q', sub: '0', val: 12, min: 1, max: 30, paso: 0.5, u: 'mC', factor: 1e-3, liga: [['C1', 'q0']] },
        C1: { sim: 'C', sub: '1', val: 1, min: 0.2, max: 5, paso: 0.1, u: 'mF', factor: 1e-3, liga: [['C1', 'C']] },
        C2: { sim: 'C', sub: '2', val: 2, min: 0.2, max: 5, paso: 0.1, u: 'mF', factor: 1e-3, liga: [['C2', 'C']] },
      },
      graficas: [{ m: 'V', series: [{ id: 'C1' }, { id: 'C2' }] }, { m: 'q', series: [{ id: 'C1' }, { id: 'C2' }] }, { m: 'U', series: [{ id: 'C1' }, { id: 'C2' }] }],
      nota: 'C₁ empieza con la carga q₀ y C₂ descargado. Al cerrar S la carga total se conserva y los dos quedan al voltaje q₀/(C₁ + C₂). La energía no: en modo ideal se pierden ½·C₁C₂/(C₁ + C₂)·V₀² de golpe (la tabla de eventos lo registra); en modo realista, la misma energía se va como calor en los cables.',
    },
    // ---------------------------------------------------- MEXT · E3 redes de capacitores
    {
      clave: 'mext-2014-1-4', titulo: 'Capacitores en paralelo y en serie', tipo: 'MEXT', anio: '2014 1-(4)', duracion: 4, dt: 0.01,
      elementos: [
        { id: 'E', tipo: 'bateria', p: [0, 3], rot: 270, E: 12, r: 0, etq: 'izq' },
        { id: 'C1', tipo: 'capacitor', p: [3, 5], rot: 270, C: 1e-3, q0: 0, etq: 'izq' },
        { id: 'C2', tipo: 'capacitor', p: [7, 5], rot: 270, C: 2e-3, q0: 0, etq: 'der' },
        { id: 'C3', tipo: 'capacitor', p: [5, 2], rot: 270, C: 3e-3, q0: 0, etq: 'der' },
        { id: 'S', tipo: 'interruptor', p: [2, 0], rot: 0, cerrado: false, etq: 'aba' },
        { id: 'T', tipo: 'tierra', p: [0, 0], rot: 0 },
      ],
      cables: [[[0, 4], [0, 7], [5, 7], [5, 6]], [[3, 6], [7, 6]], [[3, 4], [7, 4]], [[5, 4], [5, 3]], [[5, 1], [5, 0], [3, 0]], [[1, 0], [0, 0], [0, 2]]],
      nodos: { A: [5, 4] },
      acciones: [{ t: 1, id: 'S', estado: true }],
      variables: {
        E: { sim: 'E', val: 12, min: 1, max: 24, paso: 0.5, u: 'V', factor: 1, liga: [['E', 'E']] },
        C1: { sim: 'C', sub: '1', val: 1, min: 0.5, max: 5, paso: 0.1, u: 'mF', factor: 1e-3, liga: [['C1', 'C']] },
        C2: { sim: 'C', sub: '2', val: 2, min: 0.5, max: 5, paso: 0.1, u: 'mF', factor: 1e-3, liga: [['C2', 'C']] },
        C3: { sim: 'C', sub: '3', val: 3, min: 0.5, max: 5, paso: 0.1, u: 'mF', factor: 1e-3, liga: [['C3', 'C']] },
      },
      graficas: [{ m: 'q', series: [{ id: 'C1' }, { id: 'C2' }, { id: 'C3' }] }, { m: 'V', series: [{ id: 'C1' }, { id: 'C3' }] }, { m: 'U', series: [{ id: 'C1' }, { id: 'C2' }, { id: 'C3' }] }],
      sel: 'C1',
      nota: 'Figura redibujada: C₁ ∥ C₂ en serie con C₃, la batería E y el interruptor S, todos descargados al principio. El examen es simbólico; la escena fija valores. La carga que atraviesa C₃ se reparte entre C₁ y C₂, que quedan al mismo voltaje. Sin resistencias, en modo ideal la carga llega al instante y se pierde la mitad del trabajo de la batería.',
      examen: X => {
        const E = X.el('E').E, C1 = X.el('C1').C, C2 = X.el('C2').C, C3 = X.el('C3').C, Ct = C1 + C2 + C3, tS = X.accion('S', true), s = X.en(X.dur);
        return [
          { n: '', etq: S('V', 'C1'), valor: s.v[X.k('C1')], esperado: C3 * E / Ct, u: 'V', formula: 'C₃E/(C₁ + C₂ + C₃), igual en C₁ y C₂', t: tS },
          { n: '', etq: S('q', 'C3'), valor: s.q[X.k('C3')], esperado: (C1 + C2) * C3 * E / Ct, u: 'C', formula: '(C₁ + C₂)C₃E/(C₁ + C₂ + C₃)', t: tS },
          { n: '(4)', etq: S('q', 'C1'), valor: s.q[X.k('C1')], esperado: C1 * C3 * E / Ct, u: 'C', formula: 'C₁C₃E/(C₁ + C₂ + C₃)', opcion: '(b)', t: tS },
        ];
      },
    },
    {
      clave: 'mext-2013-p2', titulo: 'Tres capacitores y dos interruptores', tipo: 'MEXT', anio: '2013 P2', duracion: 12, dt: 0.01,
      elementos: [
        { id: 'V', tipo: 'bateria', p: [0, 2], rot: 270, E: 6, r: 0, etq: 'izq' },
        { id: 'S1', tipo: 'interruptor', p: [0, 5], rot: 90, cerrado: false, etq: 'izq' },
        { id: 'R1', tipo: 'resistencia', p: [2, 7], rot: 0, R: 2e5, etq: 'arr' },
        { id: 'R2', tipo: 'resistencia', p: [6, 7], rot: 0, R: 2e5, etq: 'arr' },
        { id: 'S2', tipo: 'interruptor', p: [8, 5], rot: 270, cerrado: false, etq: 'der' },
        { id: 'C2', tipo: 'capacitor', p: [4, 4], rot: 270, C: 4e-6, q0: 0, etq: 'der' },
        { id: 'C1', tipo: 'capacitor', p: [2, 0], rot: 180, C: 2e-6, q0: 0, etq: 'aba' },
        { id: 'C3', tipo: 'capacitor', p: [6, 0], rot: 180, C: 2e-6, q0: 0, etq: 'aba' },
        { id: 'T', tipo: 'tierra', p: [0, 0], rot: 0 },
      ],
      cables: [[[0, 3], [0, 4]], [[0, 6], [0, 7], [1, 7]], [[3, 7], [5, 7]], [[7, 7], [8, 7], [8, 6]], [[4, 7], [4, 5]], [[4, 3], [4, 0]], [[0, 1], [0, 0], [1, 0]], [[3, 0], [5, 0]], [[8, 4], [8, 0], [7, 0]]],
      nodos: {},
      acciones: [{ t: 0.5, id: 'S1', estado: true }, { t: 6, id: 'S1', estado: false }, { t: 6, id: 'S2', estado: true }],
      variables: {
        V: { sim: 'V', val: 6, min: 1, max: 12, paso: 0.5, u: 'V', factor: 1, liga: [['V', 'E']] },
        C1: { sim: 'C', sub: '1', val: 2, min: 0.5, max: 5, paso: 0.1, u: 'µF', factor: 1e-6, liga: [['C1', 'C']] },
        C2: { sim: 'C', sub: '2', val: 4, min: 0.5, max: 5, paso: 0.1, u: 'µF', factor: 1e-6, liga: [['C2', 'C']] },
        C3: { sim: 'C', sub: '3', val: 2, min: 0.5, max: 5, paso: 0.1, u: 'µF', factor: 1e-6, liga: [['C3', 'C']] },
        R: { sim: 'R', val: 200, min: 50, max: 300, paso: 10, u: 'kΩ', factor: 1e3, liga: [['R1', 'R'], ['R2', 'R']] },
      },
      graficas: [{ m: 'q', series: [{ id: 'C1' }, { id: 'C2' }, { id: 'C3' }] }, { m: 'I', series: [{ id: 'R1' }, { id: 'R2' }] }, { m: 'U', series: [{ id: 'C2' }, { id: 'C3' }] }],
      sel: 'C3',
      nota: 'Figura redibujada con los datos del examen: C₁ = C₃ = 2 µF, C₂ = 4 µF y V = 6 V. El enunciado no da R₁ ni R₂ (aquí 200 kΩ): solo fijan la rapidez de los transitorios, no las cargas ni las energías. S₁ carga C₂ y C₁ en serie; en t = 6 s, S₁ se abre y S₂ cierra el lazo C₂, R₂, C₃. C₁ queda aislado con su carga.',
      examen: X => {
        const V = X.el('V').E, C1 = X.el('C1').C, C2 = X.el('C2').C, C3 = X.el('C3').C, kR2 = X.k('R2');
        const t1 = X.accion('S1', true), tA = X.accion('S1', false), t2 = X.accion('S2', true), s1 = X.en(tA), s = X.en(X.dur), sB = X.en(t2);
        const q = V * C1 * C2 / (C1 + C2), qC = OPC_2013.map(([l, v]) => [l, v * 1e-6]);
        return [
          { n: '(1)', etq: S('q', 'C1'), valor: s1.q[X.k('C1')], esperado: q, u: 'C', formula: 'V·C₁C₂/(C₁ + C₂)', opciones: qC, t: t1 },
          { n: '(2)', etq: S('V', 'C1'), valor: s1.v[X.k('C1')], esperado: q / C1, u: 'V', formula: 'q₁/C₁', opciones: OPC_2013, t: t1 },
          { n: '(3)', etq: S('q', 'C3'), valor: s.q[X.k('C3')], esperado: q * C3 / (C2 + C3), u: 'C', formula: 'q₂·C₃/(C₂ + C₃): C₂ reparte su carga q₂ = q₁', opciones: qC, t: t2 },
          { n: '(4)', etq: `${S('U', 'C2')} + ${S('U', 'C3')}`, valor: s.U[X.k('C2')] + s.U[X.k('C3')], esperado: q * q / (2 * (C2 + C3)), u: 'J', formula: 'q₂²/(2(C₂ + C₃))', opciones: qC, t: t2 },
          { n: '(5)', etq: S('Q', 'R2'), valor: s.Q[kR2] - sB.Q[kR2], esperado: q * q / (2 * C2) - q * q / (2 * (C2 + C3)), u: 'J', formula: 'q₂²/2C₂ − q₂²/(2(C₂ + C₃))', opciones: qC, t: t2 },
        ];
      },
    },
    {
      clave: 'mext-2007-p2', titulo: 'Placa conductora en un capacitor', tipo: 'MEXT', anio: '2007 P2', duracion: 10, dt: 0.01,
      elementos: [
        { id: 'E', tipo: 'bateria', p: [0, 3], rot: 270, E: 10, r: 0, etq: 'izq' },
        { id: 'S', tipo: 'interruptor', p: [2, 6], rot: 0, cerrado: false, etq: 'arr' },
        { id: 'C', tipo: 'capacitor', p: [5, 3], rot: 270, C: 1e-3, q0: 0, etq: 'izq', placa: { e: 1 / 3, f: [[1.5, 0], [4.5, 1], [6.5, 1], [9.5, 0]] } },
        { id: 'T', tipo: 'tierra', p: [0, 0], rot: 0 },
      ],
      cables: [[[0, 4], [0, 6], [1, 6]], [[3, 6], [5, 6], [5, 4]], [[5, 2], [5, 0], [0, 0], [0, 2]]],
      nodos: {},
      acciones: [{ t: 0.5, id: 'S', estado: true }, { t: 5.5, id: 'S', estado: false }],
      variables: {
        E: { sim: 'E', val: 10, min: 1, max: 20, paso: 0.5, u: 'V', factor: 1, liga: [['E', 'E']] },
        C: { sim: 'C', val: 1, min: 0.2, max: 5, paso: 0.1, u: 'mF', factor: 1e-3, liga: [['C', 'C']] },
      },
      graficas: [{ m: 'q', series: [{ id: 'C' }] }, { m: 'V', series: [{ id: 'C' }] }, { m: 'U', series: [{ id: 'C' }] }],
      sel: 'C',
      nota: 'La parte de circuito del problema (el campo entre las placas está en Electrostática · Conductores y dieléctricos). Con S cerrado entra despacio una placa conductora de espesor d/3 y la capacidad pasa de C a 3C/2; después S se abre y la placa sale. El trabajo de la fuerza que mueve la placa queda en el registro de energía. El examen es simbólico; la escena fija E = 10 V y C = 1 mF.',
      examen: X => {
        const E = X.el('E').E, el = X.el('C'), C = el.C, kC = X.k('C'), kE = X.k('E'), k = 1 / (1 - el.placa.e);
        const [ent, sal] = X.tramosPlaca(el.placa), a = X.en(ent[0]), b = X.en(ent[1]), c = X.en(sal[0]), d = X.en(sal[1]);
        return [
          { n: '(1)', etq: `${S('C')}′`, valor: b.q[kC] / b.v[kC], esperado: k * C, u: 'F', formula: 'C·d/(d − d/3) = 3C/2', opcion: '(e)', t: ent[1] },
          { n: '(2)', etq: `Δ${S('q')}`, valor: b.q[kC] - a.q[kC], esperado: (k - 1) * C * E, u: 'C', formula: 'CE/2', opcion: '(i)', t: ent[1] },
          { n: '(3)', etq: `Δ${S('U')}`, valor: b.U[kC] - a.U[kC], esperado: (k - 1) * C * E * E / 2, u: 'J', formula: 'CE²/4', opcion: '(u)', t: ent[1] },
          { n: '(4)', etq: S('W', 'E'), valor: b.W[kE] - a.W[kE], esperado: (k - 1) * C * E * E, u: 'J', formula: 'E·Δq = CE²/2', opcion: '(w)', t: ent[1] },
          { n: '(5)', etq: S('W', 'F'), valor: b.W[kC] - a.W[kC], esperado: -(k - 1) * C * E * E / 2, u: 'J', formula: 'ΔU menos el trabajo de la batería = −CE²/4: la placa es atraída', opcion: '(n)', t: ent[1] },
          { n: '(6)', etq: S('W', 'F'), valor: d.W[kC] - c.W[kC], esperado: k * (k - 1) * C * E * E / 2, u: 'J', formula: 'carga fija 3CE/2: ΔU = 3CE²/8', opcion: '(v)', t: sal[1] },
        ];
      },
    },
    // ---------------------------------------------------- MEXT · E4 corriente continua y RC
    {
      clave: 'mext-2012-1-2', titulo: 'Capacitor en paralelo con R₂', tipo: 'MEXT', anio: '2012 1-(2)', duracion: 8, dt: 0.01,
      elementos: [
        { id: 'E', tipo: 'bateria', p: [0, 3], rot: 270, E: 6, r: 0, etq: 'izq' },
        { id: 'R1', tipo: 'resistencia', p: [2, 6], rot: 0, R: 1000, etq: 'arr' },
        { id: 'R2', tipo: 'resistencia', p: [5, 3], rot: 270, R: 2000, etq: 'izq' },
        { id: 'C', tipo: 'capacitor', p: [8, 3], rot: 270, C: 500e-6, q0: 0, etq: 'der' },
        { id: 'S', tipo: 'interruptor', p: [2, 0], rot: 0, cerrado: false, etq: 'aba' },
        { id: 'T', tipo: 'tierra', p: [0, 0], rot: 0 },
      ],
      cables: [[[0, 4], [0, 6], [1, 6]], [[3, 6], [8, 6], [8, 4]], [[5, 6], [5, 4]], [[5, 2], [5, 0]], [[8, 2], [8, 0], [3, 0]], [[1, 0], [0, 0], [0, 2]]],
      nodos: {},
      acciones: [{ t: 0.5, id: 'S', estado: true }],
      variables: {
        E: { sim: 'E', val: 6, min: 1, max: 12, paso: 0.5, u: 'V', factor: 1, liga: [['E', 'E']] },
        R1: { sim: 'R', sub: '1', val: 1, min: 0.2, max: 5, paso: 0.1, u: 'kΩ', factor: 1e3, liga: [['R1', 'R']] },
        R2: { sim: 'R', sub: '2', val: 2, min: 0.2, max: 5, paso: 0.1, u: 'kΩ', factor: 1e3, liga: [['R2', 'R']] },
        C: { sim: 'C', val: 500, min: 100, max: 500, paso: 10, u: 'µF', factor: 1e-6, liga: [['C', 'C']] },
      },
      graficas: [{ m: 'q', series: [{ id: 'C' }] }, { m: 'I', series: [{ id: 'R1' }, { id: 'R2' }, { id: 'C' }] }, { m: 'V', series: [{ id: 'C' }, { id: 'R1' }] }],
      sel: 'C',
      nota: 'Figura redibujada: R₁ en serie con R₂ ∥ C, la batería E y el interruptor S. El examen es simbólico; la escena fija valores. Al cerrar S, C empieza descargado y se lleva casi toda la corriente; en el estacionario ya no deja pasar corriente y su voltaje es el de R₂.',
      examen: X => {
        const E = X.el('E').E, R1 = X.el('R1').R, R2 = X.el('R2').R, C = X.el('C').C, tS = X.accion('S', true), s = X.en(X.dur);
        return [
          { n: '', etq: S('I', 'R1'), valor: s.I[X.k('R1')], esperado: E / (R1 + R2), u: 'A', formula: 'E/(R₁ + R₂), la misma en R₂', t: tS },
          { n: '', etq: S('V', 'C'), valor: s.v[X.k('C')], esperado: R2 * E / (R1 + R2), u: 'V', formula: 'R₂E/(R₁ + R₂)', t: tS },
          { n: '(2)', etq: S('q', 'C'), valor: s.q[X.k('C')], esperado: R2 * C * E / (R1 + R2), u: 'C', formula: 'R₂CE/(R₁ + R₂)', opcion: '(f)', t: tS },
        ];
      },
    },
    {
      clave: 'mext-2010-4c', titulo: 'Bombilla y resistencia de 5 Ω', tipo: 'MEXT', anio: '2010 4-C', duracion: 2, dt: 0.01,
      elementos: [
        { id: 'E', tipo: 'bateria', p: [0, 3], rot: 270, E: 12, r: 0, etq: 'izq' },
        { id: 'B', tipo: 'bombilla', p: [4, 5], rot: 270, Vn: 6, Pn: 18, frio: 4, etq: 'der' },
        { id: 'R', tipo: 'resistencia', p: [4, 2], rot: 270, R: 5, etq: 'der' },
        { id: 'T', tipo: 'tierra', p: [0, 0], rot: 0 },
      ],
      cables: [[[0, 4], [0, 7], [4, 7], [4, 6]], [[4, 4], [4, 3]], [[4, 1], [4, 0], [0, 0], [0, 2]]],
      nodos: {},
      acciones: [],
      variables: {
        E: { sim: 'E', val: 12, min: 2, max: 24, paso: 0.5, u: 'V', factor: 1, liga: [['E', 'E']] },
        R: { sim: 'R', val: 5, min: 1, max: 20, paso: 0.5, u: 'Ω', factor: 1, liga: [['R', 'R']] },
      },
      graficas: [{ m: 'iv', id: 'B', fuente: 'E', serie: 'R' }, { m: 'V', series: [{ id: 'B' }, { id: 'R' }] }, { m: 'I', series: [{ id: 'B' }] }],
      sel: 'B',
      nota: 'La curva I-V de la figura del examen pasa por (1 V, 1.33 A), (2 V, 2 A), (6 V, 3 A) y (12 V, 3.43 A): es I = 4V/(V + 2) A, el modelo de filamento de la bombilla con 0.5 Ω en frío (6 V y 18 W nominales). La recta de carga 12 V = V + 5 Ω·I la corta en el punto de operación.',
      examen: X => {
        const E = X.el('E').E, R = X.el('R').R, curva = curvaBombilla(X.el('B')), kB = X.k('B'), s = X.en(X.dur);
        const Vop = X.cero(V => V + R * curva.I(V) - E, 0, E), Iop = curva.I(Vop);
        return [
          { n: '', etq: S('V', 'B'), valor: s.v[kB], esperado: Vop, u: 'V', formula: 'corte de la recta de carga E = V + R·I con la curva', t: 0 },
          { n: '', etq: S('I'), valor: s.I[kB], esperado: Iop, u: 'A', formula: 'I(V) de la curva en ese punto', t: 0 },
          { n: 'Q3', etq: S('P', 'B'), valor: s.v[kB] * s.I[kB], esperado: Vop * Iop, u: 'W', formula: 'V·I en el punto de operación', opciones: listaOpc([1, 4, 10, 18, 34, 42]), t: 0 },
        ];
      },
    },
    {
      clave: 'mext-2007-1-2', titulo: 'Puente de resistencias con voltímetro', tipo: 'MEXT', anio: '2007 1-(2)', duracion: 2, dt: 0.01,
      elementos: [
        { id: 'E', tipo: 'bateria', p: [0, 4], rot: 270, E: 6, r: 0, etq: 'izq' },
        { id: 'R1', tipo: 'resistencia', p: [3, 6], rot: 270, R: 20, etq: 'izq' },
        { id: 'R3', tipo: 'resistencia', p: [3, 2], rot: 270, R: 10, etq: 'izq' },
        { id: 'R2', tipo: 'resistencia', p: [7, 6], rot: 270, R: 10, etq: 'der' },
        { id: 'R4', tipo: 'resistencia', p: [7, 2], rot: 270, R: 20, etq: 'der' },
        { id: 'Vm', tipo: 'voltimetro', p: [5, 4], rot: 180, etq: 'aba' },
        { id: 'T', tipo: 'tierra', p: [5, 0], rot: 0 },
      ],
      cables: [[[0, 5], [0, 8], [7, 8], [7, 7]], [[3, 8], [3, 7]], [[3, 5], [3, 3]], [[7, 5], [7, 3]], [[3, 4], [4, 4]], [[6, 4], [7, 4]], [[3, 1], [3, 0]], [[7, 1], [7, 0], [0, 0], [0, 3]]],
      nodos: { P: [3, 4], Q: [7, 4] },
      acciones: [],
      variables: {
        E: { sim: 'E', val: 6, min: 1, max: 12, paso: 0.5, u: 'V', factor: 1, liga: [['E', 'E']] },
        R1: { sim: 'R', sub: '1', val: 20, min: 1, max: 50, paso: 0.5, u: 'Ω', factor: 1, liga: [['R1', 'R']] },
        R2: { sim: 'R', sub: '2', val: 10, min: 1, max: 50, paso: 0.5, u: 'Ω', factor: 1, liga: [['R2', 'R']] },
        R3: { sim: 'R', sub: '3', val: 10, min: 1, max: 50, paso: 0.5, u: 'Ω', factor: 1, liga: [['R3', 'R']] },
        R4: { sim: 'R', sub: '4', val: 20, min: 1, max: 50, paso: 0.5, u: 'Ω', factor: 1, liga: [['R4', 'R']] },
      },
      graficas: [{ m: 'barrido', id: 'Vm', variable: 'R1' }, { m: 'V', series: [{ nodo: 'P' }, { nodo: 'Q' }] }, { m: 'I', series: [{ id: 'R1' }, { id: 'R2' }] }],
      sel: 'Vm',
      nota: 'Figura redibujada como rectángulo: R₁ y R₃ a la izquierda, R₂ y R₄ a la derecha y el voltímetro, ideal (de resistencia muy grande), entre los puntos medios P y Q: marca el potencial de Q menos el de P. El examen es simbólico; la escena fija valores. La lectura se anula cuando R₁R₄ = R₂R₃: el puente queda equilibrado.',
      examen: X => {
        const E = X.el('E').E, R1 = X.el('R1').R, R2 = X.el('R2').R, R3 = X.el('R3').R, R4 = X.el('R4').R, s = X.en(X.dur);
        return [
          { n: '', etq: S('V', 'P'), valor: X.nodo(s, 'P'), esperado: R3 * E / (R1 + R3), u: 'V', formula: 'R₃E/(R₁ + R₃)', t: 0 },
          { n: '', etq: S('V', 'Q'), valor: X.nodo(s, 'Q'), esperado: R4 * E / (R2 + R4), u: 'V', formula: 'R₄E/(R₂ + R₄)', t: 0 },
          { n: '(2)', etq: S('V'), valor: s.v[X.k('Vm')], esperado: (R1 * R4 - R2 * R3) / ((R1 + R3) * (R2 + R4)) * E, u: 'V', formula: '(R₁R₄ − R₂R₃)E/((R₁ + R₃)(R₂ + R₄))', opcion: '(b)', t: 0, escala: E },
        ];
      },
    },
    {
      clave: 'mext-2006-p2', titulo: 'Carga de C y un segundo camino', tipo: 'MEXT', anio: '2006 P2', duracion: 2e-4, dt: 2e-7,
      elementos: [
        { id: 'E', tipo: 'bateria', p: [0, 3], rot: 270, E: 6, r: 0, etq: 'izq' },
        { id: 'R1', tipo: 'resistencia', p: [2, 6], rot: 0, R: 4, etq: 'arr' },
        { id: 'C', tipo: 'capacitor', p: [5, 3], rot: 270, C: 2e-6, q0: 0, etq: 'izq' },
        { id: 'R2', tipo: 'resistencia', p: [8, 4], rot: 270, R: 2, etq: 'der' },
        { id: 'S1', tipo: 'interruptor', p: [2, 0], rot: 0, cerrado: false, etq: 'aba' },
        { id: 'S2', tipo: 'interruptor', p: [7, 0], rot: 0, cerrado: false, etq: 'aba' },
        { id: 'T', tipo: 'tierra', p: [0, 0], rot: 0 },
      ],
      cables: [[[0, 4], [0, 6], [1, 6]], [[3, 6], [8, 6], [8, 5]], [[5, 6], [5, 4]], [[5, 2], [5, 0]], [[3, 0], [6, 0]], [[8, 0], [8, 3]], [[1, 0], [0, 0], [0, 2]]],
      nodos: {},
      acciones: [{ t: 1e-5, id: 'S1', estado: true }, { t: 1.1e-4, id: 'S2', estado: true }],
      variables: {
        E: { sim: 'E', val: 6, min: 1, max: 12, paso: 0.5, u: 'V', factor: 1, liga: [['E', 'E']] },
        R1: { sim: 'R', sub: '1', val: 4, min: 2, max: 5, paso: 0.5, u: 'Ω', factor: 1, liga: [['R1', 'R']] },
        R2: { sim: 'R', sub: '2', val: 2, min: 0.5, max: 8, paso: 0.5, u: 'Ω', factor: 1, liga: [['R2', 'R']] },
        C: { sim: 'C', val: 2, min: 1, max: 2.5, paso: 0.1, u: 'µF', factor: 1e-6, liga: [['C', 'C']] },
      },
      graficas: [{ m: 'I', series: [{ id: 'R1' }, { id: 'C' }, { id: 'R2' }] }, { m: 'q', series: [{ id: 'C' }] }, { m: 'V', series: [{ id: 'C' }] }],
      sel: 'C',
      nota: 'Figura redibujada con los datos del examen: E = 6 V, R₁ = 4 Ω, R₂ = 2 Ω y C = 2 µF. Con R₁C = 8 µs, la escena dura 200 µs y se reproduce a cámara lenta. S₁ se cierra en t = 10 µs; S₂, en t = 110 µs, con C ya cargado.',
      examen: X => {
        const E = X.el('E').E, R1 = X.el('R1').R, R2 = X.el('R2').R, C = X.el('C').C, kC = X.k('C'), kR1 = X.k('R1');
        const t1 = X.accion('S1', true), t2 = X.accion('S2', true), a = X.en(t1), b = X.en(t2), s = X.en(X.dur);
        return [
          { n: '(1)', etq: S('I', 'R1'), valor: X.despues(t1).I[kR1], esperado: E / R1, u: 'A', formula: 'E/R₁: C descargado es un cortocircuito', opciones: listaOpc([1.5, 3, 6, 12, 24]), t: t1 },
          { n: '(2)', etq: S('q', 'C'), valor: b.q[kC], esperado: C * E, u: 'C', formula: 'CE', opciones: listaOpc([6, 12, 36, 72, 144], 1e-6), t: t1 },
          { n: '(3)', etq: S('W', 'E'), valor: b.W[X.k('E')] - a.W[X.k('E')], esperado: C * E * E, u: 'J', formula: 'qE = CE²', opciones: listaOpc([6, 12, 36, 72, 144], 1e-6), t: t1 },
          { n: '(4)', etq: S('Q', 'R1'), valor: b.Q[kR1] - a.Q[kR1], esperado: C * E * E / 2, u: 'J', formula: 'CE² − CE²/2 = CE²/2', opciones: listaOpc([6, 12, 36, 72, 144], 1e-6), t: t1 },
          { n: '(5)', etq: S('q', 'C'), valor: s.q[kC], esperado: C * E * R2 / (R1 + R2), u: 'C', formula: 'C·R₂E/(R₁ + R₂)', opciones: listaOpc([4, 6, 12, 24, 36], 1e-6), t: t2 },
        ];
      },
    },
  ];
  const copia = o => JSON.parse(JSON.stringify(o));

  // ---------------------------------------------------------------------
  // Estado de la escena
  // ---------------------------------------------------------------------
  let ESC = null;            // escena actual (esquema, acciones, variables, opciones)
  let RED = null;            // esquema compilado: geometría y circuito del motor
  let SIM = null, ERROR = null, X = null;   // simulación, error y datos derivados
  let t = 0, jugando = false, velocidad = 1, ultimo = 0;
  let sel = null, hover = null;             // 'el:ID', 'cable:N' o null (el circuito)
  let herramienta = null, rotHerr = 0, cursorMundo = null, cableEnCurso = null;
  const capas = { corriente: true, potencial: true, cargas: true, valores: true };
  const lienzo = $('#lienzo'), area = $('#area');
  const tz = new Trazo(lienzo);
  let paneo = null, arrastre = null, vistaTocada = false, escala0 = 1;

  function cargarEscenario(clave) {
    const e = ESCENARIOS.find(x => x.clave === clave) || ESCENARIOS[0];
    ESC = { ...copia(e), modo: 'ideal', rCable: 0.05, inicio: 'reposo' };
    aplicarVariables();
    sel = e.sel ? 'el:' + e.sel : null;
  }
  const elemento = id => ESC.elementos.find(e => e.id === id);
  function aplicarVariables() {
    for (const v of Object.values(ESC.variables)) for (const [id, k] of v.liga) { const el = elemento(id); if (el) el[k] = v.val * v.factor; }
  }
  // Variable que fija un parámetro de un componente
  const ligadaA = (id, k) => Object.entries(ESC.variables).find(([, v]) => v.liga.some(([i, p]) => i === id && p === k));

  // ---------------------------------------------------------------------
  // Esquema → circuito del motor
  // ---------------------------------------------------------------------
  const clave = p => `${Math.round(p[0])},${Math.round(p[1])}`;
  const rotar = ([x, y], rot) => {
    const a = rot * Math.PI / 180, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
    return [x * c - y * s, x * s + y * c];
  };
  const LOCALES = {
    tierra: [[0, 0]],
    'interruptor-3': [[-1, 0], [1, 1], [1, 0], [1, -1]],
  };
  const bornes = el => (LOCALES[el.tipo] || [[-1, 0], [1, 0]]).map(l => { const [x, y] = rotar(l, el.rot || 0); return [el.p[0] + x, el.p[1] + y]; });
  // Tramo de patilla de cada borne (del borne al cuerpo), en coordenadas locales
  const PATILLAS = { 'interruptor-3': [[[-1, 0], [-0.5, 0]], [[1, 1], [0.5, 1]], [[1, 0], [0.91, 0]], [[1, -1], [0.5, -1]]], tierra: [] };
  const CUERPO = { resistencia: 0.56, reostato: 0.56, bateria: 0.13, capacitor: 0.13, inductor: 0.56, bombilla: 0.3, voltimetro: 0.3, amperimetro: 0.3, 'fuente-corriente': 0.3, interruptor: 0.5 };
  function patillas(el) {
    const loc = PATILLAS[el.tipo] || [[[-1, 0], [-CUERPO[el.tipo], 0]], [[1, 0], [CUERPO[el.tipo], 0]]];
    return loc.map(([a, b]) => [a, b].map(l => { const [x, y] = rotar(l, el.rot || 0); return [el.p[0] + x, el.p[1] + y]; }));
  }

  function compilar() {
    const usos = new Map();                       // punto → número de cosas que llegan a él
    const usar = p => { const k = clave(p); usos.set(k, (usos.get(k) || 0) + 1); return k; };
    const tramos = [];
    ESC.cables.forEach((poli, ip) => {
      for (let i = 0; i + 1 < poli.length; i++) {
        const [a, b] = [poli[i], poli[i + 1]], dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]);
        const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
        for (let j = 0; j < n; j++) {
          const p = [a[0] + dx * j, a[1] + dy * j], q = [a[0] + dx * (j + 1), a[1] + dy * (j + 1)];
          tramos.push({ id: `cable·${ip}·${i}·${j}`, poli: ip, a: p, b: q });
        }
      }
    });
    for (const s of tramos) { usar(s.a); usar(s.b); }
    const geo = new Map();
    for (const el of ESC.elementos) { const bs = bornes(el); geo.set(el.id, { bornes: bs, patillas: patillas(el) }); bs.forEach(usar); }
    const componentes = ESC.elementos.map(el => {
      const bs = geo.get(el.id).bornes;
      // Una posición del interruptor de tres vías sin nada conectado queda libre
      const nodos = bs.map((p, k) => (el.tipo === 'interruptor-3' && k > 0 && usos.get(clave(p)) < 2 ? null : clave(p)));
      const c = { id: el.id, tipo: el.tipo, nodos };
      for (const [k] of CAT[el.tipo].params) if (el[k] != null) c[k] = el[k];
      if (el.tipo === 'interruptor') c.cerrado = !!el.cerrado;
      if (el.tipo === 'interruptor-3') c.posicion = el.posicion || null;
      if (el.tipo === 'capacitor' && el.placa) c.perfil = perfilPlaca(el.placa);
      return c;
    });
    for (const s of tramos) componentes.push({ id: s.id, tipo: 'cable', nodos: [clave(s.a), clave(s.b)] });
    const uniones = [...usos.entries()].filter(([, n]) => n >= 3).map(([k]) => k.split(',').map(Number));
    for (const p of Object.values(ESC.nodos)) if (!uniones.some(u => clave(u) === clave(p))) uniones.push(p);
    RED = { tramos, geo, uniones, circuito: { componentes, acciones: ESC.acciones.map(a => ({ ...a })) } };
  }

  // Placa conductora de espesor e·d que entra en un capacitor: fracción
  // metida f(t), lineal a tramos. Con la placa metida una fracción f, el
  // capacitor son dos en paralelo: C·(1 − f) + C·f/(1 − e).
  const fraccionPlaca = (placa, tt) => {
    const p = placa.f; if (tt <= p[0][0]) return p[0][1];
    for (let i = 0; i + 1 < p.length; i++) if (tt <= p[i + 1][0]) return p[i][1] + (p[i + 1][1] - p[i][1]) * (tt - p[i][0]) / (p[i + 1][0] - p[i][0]);
    return p[p.length - 1][1];
  };
  const perfilPlaca = placa => placa.f.map(([tt, f]) => [tt, 1 + f * (1 / (1 - placa.e) - 1)]);
  // Tramos en que la placa se mueve: [[t₀, t₁] de entrada, [t₂, t₃] de salida, …]
  const tramosPlaca = placa => placa.f.slice(1).map((q, i) => [placa.f[i][0], q[0], q[1] - placa.f[i][1]]).filter(([, , d]) => d !== 0).map(([a, b]) => [a, b]);
  function textoPlaca(placa) {
    const tr = placa.f.slice(1).map((q, i) => [placa.f[i], q]).filter(([a, b]) => a[1] !== b[1]);
    const mov = tr.map(([a, b]) => `${b[1] > a[1] ? 'entra' : 'sale'} de t = ${Tf(a[0], 3)} a ${Tf(b[0], 3)}`).join('; ');
    return `Placa conductora de espesor ${Math.abs(placa.e - 1 / 3) < 1e-9 ? 'd/3' : `${fmt(placa.e, 3)}·d`}${mov ? `: ${mov}` : ''}. Con la placa dentro, la capacidad es ${fmt(1 / (1 - placa.e), 3)} veces C.`;
  }

  // ---------------------------------------------------------------------
  // Examen: acceso a la simulación para las filas de cada escena MEXT
  // ---------------------------------------------------------------------
  function contextoExamen() {
    const ms = SIM.muestras;
    const el = id => { const e = elemento(id); if (!e) throw new Error(`Falta ${id}`); return e; };
    const k = id => { const i = X.idx.get(id); if (i == null) throw new Error(`Falta ${id}`); return i; };
    const acciones = (id, estado) => ESC.acciones.filter(a => a.id === id && String(a.estado) === String(estado)).map(a => a.t);
    return {
      el, k, dur: ESC.duracion, muestras: ms, acciones,
      accion: (id, estado) => { const ts = acciones(id, estado); if (!ts.length) throw new Error(`Sin acción de ${id}`); return ts[0]; },
      en: tt => estadoEn(SIM, tt),
      // La primera muestra después de un evento (justo después de conmutar)
      despues: tt => ms.find(m => m.t > tt + 1e-12 * ESC.duracion) || ms[ms.length - 1],
      nodo: (s, n) => { if (!ESC.nodos[n]) throw new Error(`Falta el nodo ${n}`); return s.V[X.nodo(clave(ESC.nodos[n]))]; },
      circuito: () => copia(RED.circuito),
      tramosPlaca: placa => { const tr = tramosPlaca(placa); if (tr.length < 2) throw new Error('La placa no entra y sale'); return tr; },
      // Cero de f en [a, b] por bisección (f cambia de signo)
      cero: (f, a, b) => {
        let fa = f(a); if (fa === 0) return a;
        if (Math.sign(fa) === Math.sign(f(b))) return NaN;
        for (let i = 0; i < 200 && b - a > 1e-13 * Math.abs(b); i++) { const m = (a + b) / 2, fm = f(m); if (fm === 0) return m; if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else b = m; }
        return (a + b) / 2;
      },
      // Oscilación de una corriente después de t₀: amplitud y periodo (por los cruces por cero)
      oscilacion: (kk, t0) => {
        let max = 0; const cruces = []; let ant = null;
        for (const m of ms) {
          if (m.t <= t0) continue;
          max = Math.max(max, Math.abs(m.I[kk]));
          if (ant && ant.I[kk] !== 0 && Math.sign(ant.I[kk]) !== Math.sign(m.I[kk])) cruces.push(ant.t + (m.t - ant.t) * ant.I[kk] / (ant.I[kk] - m.I[kk]));
          ant = m;
        }
        const T = cruces.length >= 3 ? cruces[2] - cruces[0] : cruces.length === 2 ? 2 * (cruces[1] - cruces[0]) : NaN;
        return { max, T };
      },
    };
  }
  function calcularExamen() {
    const base = ESCENARIOS.find(e => e.clave === ESC.clave);
    if (!SIM || !base || !base.examen) return [];
    try { return base.examen(contextoExamen()); } catch { return []; }
  }

  // ---------------------------------------------------------------------
  // Simulación y datos derivados (escalas fijas de la corrida)
  // ---------------------------------------------------------------------
  function simular() {
    compilar();
    try {
      SIM = simularCircuito(RED.circuito, { duracion: ESC.duracion, dt: ESC.dt, modo: ESC.modo, rCable: ESC.rCable, inicio: ESC.inicio });
      ERROR = null;
    } catch (e) { SIM = null; ERROR = e.message; X = null; return; }
    const idx = new Map(SIM.ids.map((id, i) => [id, i]));
    const nodo = k => SIM.nodos.indexOf(k);
    const ms = SIM.muestras, n = ms.length;
    // Carga acumulada por cada tramo de cable (fase de los puntos de corriente)
    const fases = RED.tramos.map(s => {
      const k = idx.get(s.id), Q = new Float64Array(n);
      for (let i = 1; i < n; i++) Q[i] = Q[i - 1] + 0.5 * (ms[i].I[k] + ms[i - 1].I[k]) * (ms[i].t - ms[i - 1].t);
      return Q;
    });
    let Vmax = 1e-12, Imax = 1e-15, qRef = 0, Pmax = 1e-15;
    for (const m of ms) {
      for (const v of m.V) Vmax = Math.max(Vmax, Math.abs(v));
      for (const s of RED.tramos) Imax = Math.max(Imax, Math.abs(m.I[idx.get(s.id)]));
      for (const el of ESC.elementos) {
        const k = idx.get(el.id);
        if (el.tipo === 'capacitor') qRef = Math.max(qRef, Math.abs(m.q[k]));
        if (el.tipo === 'resistencia' || el.tipo === 'reostato') Pmax = Math.max(Pmax, Math.abs(m.v[k] * m.I[k]));
      }
    }
    // kPuntos: velocidad de los puntos de corriente en tiempo de pantalla (cámara lenta incluida)
    X = { idx, nodo, fases, Vmax, Imax, qRef, Pmax, kPuntos: 1.6 / (Imax * ritmo()), barrido: null, examen: [] };
    // Escala del registro de energía: la mayor cantidad de toda la corrida
    let Emax = 1e-15;
    for (const m of ms) { const b = balance(SIM, m); Emax = Math.max(Emax, Math.abs(b.W), Math.abs(b.U), Math.abs(b.Q), Math.abs(m.perdidas)); }
    X.Emax = Emax;
    X.examen = calcularExamen();
  }
  const estado = tt => (SIM ? estadoEn(SIM, tt) : null);
  // Lectura de instrumento: por debajo de 10⁻⁹ de la escala es ruido de redondeo y marca 0
  const limpio = (v, escala) => (Math.abs(v) <= 1e-9 * escala ? 0 : v);
  const iDe = id => X.idx.get(id);

  // Estado de un interruptor en el instante tt (inicial más acciones hasta tt)
  function estadoInterruptor(id, tt) {
    const el = elemento(id);
    let e = el.tipo === 'interruptor' ? !!el.cerrado : el.posicion || null;
    for (const a of ESC.acciones) if (a.id === id && a.t <= tt + 1e-9) e = a.estado;
    return e;
  }
  const textoEstado = (el, e) => (el.tipo === 'interruptor' ? (e ? 'cerrado' : 'abierto') : e ? `en la posición ${e}` : 'abierto');

  // ---------------------------------------------------------------------
  // Dibujo del lienzo
  // ---------------------------------------------------------------------
  function extension() {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const ver = p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); };
    ESC.cables.forEach(poli => poli.forEach(ver));
    ESC.elementos.forEach(el => bornes(el).forEach(ver));
    if (!Number.isFinite(x0)) return { x0: -4, x1: 4, y0: -3, y1: 3 };
    return { x0: x0 - 1.4, x1: x1 + 1.4, y0: y0 - 1.1, y1: y1 + 1.1 };
  }
  function encuadrar() {
    tz.vista.encuadrar(extension(), { x: 0, y: 44, w: tz.w, h: tz.h - 88 }, 40);
    // Con el lienzo sin tamaño (panel oculto o ventana mínima) la escala saldría negativa
    tz.vista.escala = Math.max(4, Math.min(tz.vista.escala, 90));
    const e = extension();
    tz.vista.ox = tz.w / 2 - tz.vista.escala * (e.x0 + e.x1) / 2;
    tz.vista.oy = 44 + (tz.h - 88) / 2 + tz.vista.escala * (e.y0 + e.y1) / 2;
  }

  function dibujar() {
    const s = estado(t), v = tz.vista;
    tz.limpiar(); tz.cuadricula();
    const Vn = k => (s && X ? s.V[X.nodo(k)] : 0);

    // 2 · Mapa de potencial bajo cables y patillas
    if (capas.potencial && s) {
      for (const sg of RED.tramos) tz.circBanda([sg.a, sg.b], 0.62 * 0.5 * (Vn(clave(sg.a)) + Vn(clave(sg.b))) / X.Vmax);
      for (const el of ESC.elementos) {
        const g = RED.geo.get(el.id);
        g.patillas.forEach(([a, b], k) => { if (!(el.tipo === 'interruptor-3' && k > 0 && RED.circuito.componentes.find(c => c.id === el.id).nodos[k] == null)) tz.circBanda([a, b], 0.62 * Vn(clave(g.bornes[k])) / X.Vmax); });
      }
    }

    // 6 · Materia: cables, componentes y nodos
    const cableSel = sel && sel.startsWith('cable:') ? +sel.slice(6) : -1, cableHover = hover && hover.startsWith('cable:') ? +hover.slice(6) : -1;
    for (const sg of RED.tramos) tz.circCable(sg.a, sg.b, { grueso: sg.poli === cableHover || sg.poli === cableSel });
    for (const el of ESC.elementos) dibujarElemento(el, s);
    for (const p of RED.uniones) tz.circNodo(p);

    // 7 · Corriente: puntos que avanzan con la carga que pasó
    if (capas.corriente && s) {
      const f = faseEn(t);
      RED.tramos.forEach((sg, k) => { if (Math.abs(s.I[iDe(sg.id)]) > 2e-3 * X.Imax) tz.circPuntos(sg.a, sg.b, f[k] * X.kPuntos); });
    }

    // 9 · Anotaciones: valores, nodos con nombre y el último evento
    if (capas.valores) for (const el of ESC.elementos) etiqueta(el, s);
    for (const [nombre, p] of Object.entries(ESC.nodos)) {
      const [dx, dy] = desplazamientoNodo(p);
      tz.circEtiquetaNodo(p, nombre, s ? cantidad(Vn(clave(p)), 'V') : null, { dx, dy });
    }
    if (s) fichaEvento(s);

    // 10 · Edición: selección, cable en curso y vista previa de la herramienta
    if (sel && sel.startsWith('el:') && elemento(sel.slice(3))) tz.circSeleccion(forma(elemento(sel.slice(3))));
    if (cableSel >= 0 && ESC.cables[cableSel]) seleccionCable(ESC.cables[cableSel]);
    if (cableEnCurso) { const [a, b, c] = cableEnCurso.pts; tz.linea([a, b, c], { color: 'tinta', grosor: G_MAT, patron: 'previsto' }); }
    if (herramienta && CAT[herramienta] && cursorMundo) {
      tz.ctx.save(); tz.ctx.globalAlpha = 0.45;
      tz.circElemento({ tipo: herramienta, c: [Math.round(cursorMundo[0]), Math.round(cursorMundo[1])], rot: rotHerr });
      tz.ctx.restore();
    }
    if (ERROR) tz.ficha(16, 16, [[{ t: 'No se puede simular', f: 'ui', tam: 12 }], [{ t: ERROR, f: 'ui', tam: 11.5 }]]);
  }
  const G_MAT = Volta.G.materia;
  // Forma de dibujo de un componente del esquema (centro, giro y tipo)
  const forma = el => ({ tipo: el.tipo, c: el.p, rot: el.rot || 0 });

  function dibujarElemento(el, s) {
    const id = el.id, k = s && X ? iDe(id) : -1, o = { grueso: hover === 'el:' + id };
    if (el.tipo === 'interruptor') o.cerrado = estadoInterruptor(id, t);
    if (el.tipo === 'interruptor-3') {
      o.posicion = estadoInterruptor(id, t);
      const nodos = RED.circuito.componentes.find(c => c.id === id).nodos;
      o.conectadas = { a: nodos[1] != null, b: nodos[2] != null, c: nodos[3] != null };
    }
    if (el.tipo === 'capacitor' && el.placa) o.placa = { f: fraccionPlaca(el.placa, t), e: el.placa.e };
    if (k >= 0) {
      if (el.tipo === 'capacitor' && capas.cargas) { o.q = s.q[k]; o.qRef = X.qRef; }
      if (el.tipo === 'bombilla') o.brillo = Math.sqrt(Math.max(0, s.v[k] * s.I[k]) / el.Pn);
      if (el.tipo === 'resistencia' || el.tipo === 'reostato') o.calor = Math.abs(s.v[k] * s.I[k]) / X.Pmax;
    }
    tz.circElemento(forma(el), o);
  }

  // Nombre y valor junto a cada componente
  function etiqueta(el, s) {
    if (el.tipo === 'tierra') return;
    const k = s && X ? iDe(el.id) : -1;
    let valor = null;
    switch (el.tipo) {
      case 'bateria': valor = valorCon(el.E, 'V'); break;
      case 'fuente-corriente': valor = valorCon(el.I, 'A'); break;
      case 'resistencia': case 'reostato': valor = valorCon(el.R, 'Ω'); break;
      case 'capacitor': valor = k >= 0 ? `q = ${valorCon(s.q[k], 'C')}` : valorCon(el.C, 'F'); break;
      case 'inductor': valor = k >= 0 ? `I = ${valorCon(s.I[k], 'A')}` : valorCon(el.L, 'H'); break;
      case 'bombilla': valor = k >= 0 ? valorCon(Math.max(0, s.v[k] * s.I[k]), 'W') : valorCon(el.Pn, 'W'); break;
      case 'amperimetro': valor = k >= 0 ? valorCon(s.I[k], 'A') : null; break;
      case 'voltimetro': valor = k >= 0 ? valorCon(s.v[k], 'V') : null; break;
      default: break;
    }
    tz.circEtiqueta(forma(el), nombreSegs(el.id), valor, el.etq || 'arr');
  }

  // Lado libre para la etiqueta de un nodo con nombre: a la derecha si no sale
  // ningún cable hacia la derecha; si no, a la izquierda; si no, encima o debajo.
  function desplazamientoNodo(p) {
    const sale = (dx, dy) => ESC.cables.some(poli => poli.some((q, i) => i + 1 < poli.length && enTramo([p[0] + dx * 0.5, p[1] + dy * 0.5], q, poli[i + 1])))
      || ESC.elementos.some(el => bornes(el).some(b => clave(b) === clave(p)) && patillas(el).some(([a, b]) => enTramo([p[0] + dx * 0.05, p[1] + dy * 0.05], a, b)));
    if (!sale(1, 0)) return [9, -5];
    if (!sale(-1, 0)) return [-9, -5];
    return [9, sale(0, 1) ? 18 : -24];
  }
  const enTramo = (p, a, b) => Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) < 1e-9
    && p[0] >= Math.min(a[0], b[0]) - 1e-9 && p[0] <= Math.max(a[0], b[0]) + 1e-9 && p[1] >= Math.min(a[1], b[1]) - 1e-9 && p[1] <= Math.max(a[1], b[1]) + 1e-9;

  // Ficha del último evento durante un rato: qué pasó y cuánta energía se perdió
  function fichaEvento(s) {
    const e = [...SIM.eventos].reverse().find(ev => ev.t <= t + 1e-9 * ESC.duracion && ev.t > 0), dura = 1.5 * ritmo();
    if (!e || t - e.t > dura || !e.acciones.length) return;
    const el = elemento(e.acciones[0].id); if (!el) return;
    const [x, y, w, h] = tz.circCaja(forma(el));
    // Anillo del evento junto al interruptor, del lado contrario a su etiqueta
    const lado = { arr: 'aba', aba: 'arr', izq: 'der', der: 'izq' }[el.etq || 'arr'];
    const [px, py] = { aba: [x + w / 2, y + h + 12], arr: [x + w / 2, y - 12], izq: [x - 12, y + h / 2], der: [x + w + 12, y + h / 2] }[lado];
    const lineas = [[{ t: e.nombre, f: 'ui', tam: 11.5 }, { t: ' · ', f: 'num', tam: 11.5, color: 'texto-3' }, { t: 't', f: 'sim', tam: 13 }, { t: ' = ' + Tf(e.t), f: 'num', tam: 11.5 }]];
    if (e.perdida > 1e-15) lineas.push([{ t: 'Energía perdida ', f: 'ui', tam: 11.5 }, { t: valorCon(e.perdida, 'J'), f: 'num', tam: 11.5 }]);
    // Tamaño de la ficha y el sitio más despejado alrededor del anillo
    const c = tz.ctx;
    let W = 0;
    for (const segs of lineas) { let a = 0; for (const sg of segs) { c.font = tz._fuente(sg.f, sg.tam); a += c.measureText(sg.t).width; } W = Math.max(W, a); }
    W += 16; const H = lineas.length * 16 + 10;
    const ocupado = zonasOcupadas(), solape = ([fx, fy]) => {
      let area = 0;
      for (const [ox, oy, ow, oh] of ocupado) area += Math.max(0, Math.min(fx + W, ox + ow) - Math.max(fx, ox)) * Math.max(0, Math.min(fy + H, oy + oh) - Math.max(fy, oy));
      const fuera = Math.max(0, 8 - fx) + Math.max(0, fx + W - tz.w + 8) + Math.max(0, 52 - fy) + Math.max(0, fy + H - tz.h + 52);
      return area + 1e4 * fuera;
    };
    // Junto al anillo primero; si todo lo cercano tapa algo, más lejos (con su línea guía)
    const opciones = [];
    for (const d of [16, 60, 110]) {
      opciones.push([px + d, py - H / 2], [px - d - W, py - H / 2], [px - W / 2, py + d], [px - W / 2, py - d - H],
        [px + d, py - H - 8], [px + d, py + 8], [px - d - W, py - H - 8], [px - d - W, py + 8]);
    }
    let mejor = opciones[0], menor = Infinity;
    for (const o of opciones) { const v = solape(o); if (v < menor - 1) { menor = v; mejor = o; } }
    c.save(); c.globalAlpha = Math.max(0.35, 1 - (t - e.t) / dura);
    const [ax, ay] = tz.eventoAnillo([tz.vista.mx(px), tz.vista.my(py)]);
    const [fx, fy] = mejor;
    tz.ficha(fx, fy, lineas, { ancla: [ax + Math.sign(fx + W / 2 - ax) * 7, ay] });
    c.restore();
  }

  // Rectángulos de pantalla ocupados por componentes, sus etiquetas, los nodos
  // con nombre y los flotantes del lienzo (para no poner encima una ficha)
  function zonasOcupadas() {
    const z = [];
    for (const el of ESC.elementos) {
      const [x, y, w, h] = tz.circCaja(forma(el));
      z.push([x - 4, y - 4, w + 8, h + 8]);
      const lado = el.etq || 'arr', ancho = 86, alto = 34;
      if (el.tipo === 'tierra') continue;
      if (lado === 'izq') z.push([x - 8 - ancho, y + h / 2 - alto / 2, ancho, alto]);
      else if (lado === 'der') z.push([x + w + 8, y + h / 2 - alto / 2, ancho, alto]);
      else if (lado === 'aba') z.push([x + w / 2 - ancho / 2, y + h + 2, ancho, alto]);
      else z.push([x + w / 2 - ancho / 2, y - alto - 2, ancho, alto]);
    }
    for (const p of Object.values(ESC.nodos)) {
      const [X, Y] = tz.vista.P(p), [dx, dy] = desplazamientoNodo(p);
      z.push([dx < 0 ? X - 100 : X, Y + dy - 14, 100, 34]);
    }
    for (const poli of ESC.cables) for (let i = 0; i + 1 < poli.length; i++) {
      const [x1, y1] = tz.vista.P(poli[i]), [x2, y2] = tz.vista.P(poli[i + 1]);
      z.push([Math.min(x1, x2) - 5, Math.min(y1, y2) - 5, Math.abs(x2 - x1) + 10, Math.abs(y2 - y1) + 10]);
    }
    z.push([tz.w - 300, 0, 300, 56], [0, tz.h - 52, tz.w, 52]);
    return z;
  }

  function seleccionCable(poli) {
    const c = tz.ctx; c.save(); c.setLineDash(Volta.PATRON.seleccion); c.strokeStyle = tz.t.tinta; c.lineWidth = 1;
    for (let i = 0; i + 1 < poli.length; i++) {
      const [x1, y1] = tz.vista.P(poli[i]), [x2, y2] = tz.vista.P(poli[i + 1]);
      c.strokeRect(Math.min(x1, x2) - 6.5, Math.min(y1, y2) - 6.5, Math.abs(x2 - x1) + 13, Math.abs(y2 - y1) + 13);
    }
    c.restore();
  }

  // Carga acumulada de cada tramo en tt (interpolada entre muestras)
  function faseEn(tt) {
    const ms = SIM.muestras;
    let lo = 0, hi = ms.length - 1;
    if (tt <= ms[0].t) return X.fases.map(Q => Q[0]);
    if (tt >= ms[hi].t) return X.fases.map(Q => Q[hi]);
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ms[m].t <= tt) lo = m; else hi = m; }
    const f = (tt - ms[lo].t) / (ms[hi].t - ms[lo].t);
    return X.fases.map(Q => Q[lo] + (Q[hi] - Q[lo]) * f);
  }

  // ---------------------------------------------------------------------
  // Inspector, árbol, variables y lecturas
  // ---------------------------------------------------------------------
  const elSel = () => (sel && sel.startsWith('el:') ? elemento(sel.slice(3)) : null);
  const simHTML = d => `${d.sim}${d.sub ? `<sub class="r">${d.sub}</sub>` : ''}`;
  function fmtVar(d) {
    const dec = !(d.paso > 0) || d.paso >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(d.paso) - 1e-9));
    return d.val.toFixed(dec).replace('-', '−');
  }
  const fila = (etq, control, ayuda = '') => `<div class="fila"${ayuda ? ` data-ayuda="${ayuda}"` : ''}><span class="etq">${etq}</span>${control}</div>`;
  const segmentado = (id, ops, actual) => `<div class="segmentado texto" id="${id}">${ops.map(([v, txt]) => `<button data-v="${v}" aria-pressed="${String(v) === String(actual)}">${txt}</button>`).join('')}</div>`;

  function inspector() {
    const el = elSel(), cab = sel && sel.startsWith('cable:');
    $('#insp-ico').setAttribute('href', '#' + (el ? CAT[el.tipo].ico : cab ? 'o-cable' : 'm-circuitos'));
    $('#insp-nombre').innerHTML = el ? `${nombreHTML(el.id)}` : cab ? 'Cable' : ESC.titulo;
    const props = $('#propiedades'); props.innerHTML = '';
    if (el) {
      for (const [k, etq, u, dim] of CAT[el.tipo].params) {
        const lig = ligadaA(el.id, k);
        if (lig) {
          const [nv, d] = lig;
          props.insertAdjacentHTML('beforeend', fila(etq, `<div class="campo es-variable" data-ayuda="Ligado a la variable ${d.sim}|Bound to variable"><span class="chip-var"><span class="sim">${simHTML(d)}</span></span><span class="valor-var" data-var="${nv}"></span><span class="u">${d.u}</span></div>`));
        } else {
          const [num, uu] = u ? enUnidad(el[k] ?? 0, u) : [el[k] ?? 0, ''];
          props.insertAdjacentHTML('beforeend', fila(etq, `<div class="campo"><input data-param="${k}" data-dim="${dim}" data-u="${uu}" value="${numCampo(num)}"><span class="u">${uu}</span></div>`));
        }
      }
      if (!CAT[el.tipo].params.length) props.insertAdjacentHTML('beforeend', `<p class="ayuda-fila" style="margin-left:0">${ES_INTERRUPTOR(el.tipo) ? 'Un clic sobre él en el lienzo lo acciona en el instante actual.' : 'Ideal: no altera el circuito.'}</p>`);
      if (el.tipo === 'capacitor' && el.placa) props.insertAdjacentHTML('beforeend', `<p class="ayuda-fila" style="margin-left:0">${textoPlaca(el.placa)}</p>`);
      props.insertAdjacentHTML('beforeend', `<div class="fila"><span class="etq">Esquema</span><div style="display:flex;gap:4px"><button class="btn btn-secundario btn-compacto" id="p-rotar" data-ayuda="Girar 90°|Rotate|R"><svg class="ico"><use href="#i-rotar"/></svg>Girar</button><button class="btn btn-secundario btn-compacto" id="p-borrar" data-ayuda="Quitar del circuito|Delete|Supr"><svg class="ico"><use href="#i-borrar"/></svg>Quitar</button></div></div>`);
    } else if (cab) {
      props.innerHTML = `<div class="fila"><span class="etq">Esquema</span><div><button class="btn btn-secundario btn-compacto" id="p-borrar" data-ayuda="Quitar el cable|Delete|Supr"><svg class="ico"><use href="#i-borrar"/></svg>Quitar</button></div></div>`;
    } else {
      props.innerHTML = fila('Conexiones', segmentado('p-modo', [['ideal', 'Ideales'], ['realista', 'Realistas']], ESC.modo), 'Ideales: la carga salta al instante y se registra la energía perdida. Realistas: cada tramo de cable y cada contacto tiene resistencia|Ideal / realistic wiring')
        + (ESC.modo === 'realista' ? fila('Cables', `<div class="campo"><input data-global="rCable" data-dim="resistencia" data-u="Ω" value="${numCampo(ESC.rCable)}"><span class="u">Ω</span></div>`, 'Resistencia de cada tramo de cable y de cada contacto cerrado|Wire resistance') : '')
        + fila('Inicio', segmentado('p-inicio', [['reposo', 'Cargas dadas'], ['estacionario', 'Estacionario']], ESC.inicio), 'Empezar con las cargas y corrientes iniciales de cada componente, o en el estado estacionario|Initial state')
        + fila('Duración', `<div class="campo"><input data-global="duracion" data-dim="tiempo" data-u="${UT()[1]}" value="${numCampo(ESC.duracion / UT()[0])}"><span class="u">${UT()[1]}</span></div>`);
      // Nota de una escena que no es del examen (las del examen la llevan en su grupo)
      const base = ESCENARIOS.find(e => e.clave === ESC.clave);
      if (base && base.nota && ESC.tipo !== 'MEXT') props.insertAdjacentHTML('afterbegin', `<p class="ayuda-fila" style="margin:2px 0 8px">${base.nota}</p>`);
    }
    // Campos con unidades y expresiones
    props.querySelectorAll('input[data-param], input[data-global]').forEach(ent => campoConUnidad(ent));
    const pm = $('#p-modo'); if (pm) pm.addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) cambiarModo(b.dataset.v); });
    const pi = $('#p-inicio'); if (pi) pi.addEventListener('click', ev => { const b = ev.target.closest('button'); if (b && b.dataset.v !== ESC.inicio) { ESC.inicio = b.dataset.v; recalcular(); registrar(); } });
    const pr = $('#p-rotar'); if (pr) pr.addEventListener('click', rotarSeleccion);
    const pb = $('#p-borrar'); if (pb) pb.addEventListener('click', borrarSeleccion);
    acciones();
    arbol();
  }

  function campoConUnidad(ent) {
    const caja = ent.closest('.campo'), f = ent.closest('.fila');
    const mostrarError = msj => {
      caja.classList.toggle('es-error', !!msj);
      let p = f.querySelector('.mensaje-error');
      if (msj && !p) { p = document.createElement('p'); p.className = 'mensaje-error'; f.appendChild(p); }
      if (p) { if (msj) p.textContent = msj; else p.remove(); }
    };
    ent.addEventListener('change', () => {
      try {
        const vars = Object.fromEntries(Object.entries(ESC.variables).map(([k, d]) => [k, { valor: d.val * d.factor, dim: evaluar('1 ' + (d.u || ''), {}).dim }]));
        let valor = evaluar(ent.value, { esperada: ent.dataset.dim, unidadPorDefecto: ent.dataset.u || undefined, variables: vars }).valor;
        const k = ent.dataset.param || ent.dataset.global;
        if (k === 'x' && !(valor >= 0 && valor <= 1)) throw new Error('El cursor va de 0 a 1.');
        if (['R', 'C', 'L', 'Vn', 'Pn', 'rCable', 'duracion'].includes(k) && !(valor > 0)) throw new Error('Este valor tiene que ser positivo.');
        if (k === 'frio' && !(valor >= 1)) throw new Error('La resistencia en caliente es al menos la de frío: escribe un número ≥ 1.');
        if (k === 'r' && !(valor >= 0)) throw new Error('La resistencia interna no puede ser negativa.');
        if (k === 'duracion') {
          valor = Math.max(1e-6, Math.min(120, valor));
          // Entre 200 y 20 000 muestras: el paso interno nunca supera el intervalo entre muestras
          ESC.dt = Math.max(valor / 20000, Math.min(ESC.dt, valor / 200));
        }
        if (ent.dataset.param) elSel()[k] = valor; else ESC[k] = valor;
        mostrarError(null); recalcular(); registrar(); inspector();
      } catch (e) { mostrarError(e.message); }
    });
    ent.addEventListener('keydown', ev => { if (ev.key === 'Escape') { mostrarError(null); ent.blur(); inspector(); } });
  }

  // Acciones del interruptor seleccionado: estado en t y acciones programadas
  function acciones() {
    const el = elSel(), cont = $('#acciones'), grupo = $('#grupo-acciones');
    grupo.hidden = !(el && ES_INTERRUPTOR(el.tipo));
    if (grupo.hidden) return;
    const e = estadoInterruptor(el.id, t);
    const ops = el.tipo === 'interruptor' ? [['false', 'Abierto'], ['true', 'Cerrado']] : [['null', 'Abierto'], ['a', 'a'], ['b', 'b'], ['c', 'c']];
    const progs = ESC.acciones.filter(a => a.id === el.id);
    cont.innerHTML = fila('Estado', segmentado('a-estado', ops, String(e)), 'Cambiar el interruptor en el instante actual: queda como evento en la línea de tiempo|Switch now')
      + `<div class="acciones-lista">${progs.length ? progs.map(a => `<div class="accion-prog"><span class="sim">t</span><span class="num">${Tf(a.t)}</span><span>${el.tipo === 'interruptor' ? (a.estado ? 'se cierra' : 'se abre') : a.estado ? `a la posición ${a.estado}` : 'se abre'}</span><button class="btn btn-icono btn-compacto" data-borrar="${ESC.acciones.indexOf(a)}" data-ayuda="Quitar esta acción|Remove action"><svg class="ico"><use href="#i-cerrar"/></svg></button></div>`).join('') : '<span class="ayuda-fila" style="margin:0">Sin acciones programadas.</span>'}</div>`;
    $('#a-estado').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      const v = b.dataset.v, val = v === 'true' ? true : v === 'false' ? false : v === 'null' ? null : v;
      accionInterruptor(el.id, val);
    });
    cont.querySelectorAll('[data-borrar]').forEach(b => b.addEventListener('click', () => {
      const a = ESC.acciones[+b.dataset.borrar];
      ESC.acciones.splice(+b.dataset.borrar, 1); recalcular(); registrar(); inspector();
      avisar(`Se quita la acción de ${a.id} en t = ${Tf(a.t)}`);
    }));
  }

  function arbol() {
    const cont = $('#arbol');
    const nodoHTML = (s, ico, nombre, dato, clase = '') => `<div class="nodo${clase}" data-sel="${s}" aria-selected="${sel === s || (!sel && s === '')}"><svg class="ico"><use href="#${ico}"/></svg><span class="nombre">${nombre}</span><span class="dato">${dato}</span></div>`;
    cont.innerHTML = nodoHTML('', 'm-circuitos', 'Circuito', ESC.modo === 'ideal' ? 'ideal' : 'realista', ' global')
      + ESC.elementos.map(el => nodoHTML('el:' + el.id, CAT[el.tipo].ico, el.tipo === 'tierra' ? 'Tierra' : nombreHTML(el.id), datoArbol(el))).join('');
    cont.querySelectorAll('.nodo').forEach(n => n.addEventListener('click', () => seleccionar(n.dataset.sel || null)));
  }
  function datoArbol(el) {
    switch (el.tipo) {
      case 'bateria': return valorCon(el.E, 'V', 3);
      case 'resistencia': case 'reostato': return valorCon(el.R, 'Ω', 3);
      case 'capacitor': return valorCon(el.C, 'F', 3);
      case 'inductor': return valorCon(el.L, 'H', 3);
      case 'bombilla': return valorCon(el.Pn, 'W', 3);
      case 'fuente-corriente': return valorCon(el.I, 'A', 3);
      case 'interruptor': case 'interruptor-3': return textoEstado(el, estadoInterruptor(el.id, t));
      case 'tierra': return '0 V';
      default: return '';
    }
  }
  function seleccionar(s) {
    if (s === sel) return;
    sel = s; inspector(); todo();
  }

  // Lectura: símbolo en cursiva (o palabra en redonda, como «brillo»), valor y unidad
  const lectura = ([a, b, val, u]) => `<span class="sim${/^[a-záéíóú]{4,}$/i.test(a) ? ' palabra' : ''}">${a}${b ? `<sub class="r">${b}</sub>` : ''}</span><span class="v">${val}</span><span class="u">${u}</span>`;
  function lecturas() {
    const s = estado(t), el = elSel();
    const [ft, ut] = UT();
    $('#reloj').innerHTML = `<span class="sim">t</span>${fmt(t / ft, 4).padStart(6, ' ')}<span class="u">${ut}</span>`;
    $('#lect-titulo').textContent = `Lecturas en t = ${Tf(t)}`;
    $('#acc-titulo').textContent = `Acciones en t = ${Tf(t)}`;
    const L = (a, b, v, u) => { const [x, uu] = enUnidad(v, u); return [a, b, fmt(x, 4), uu]; };
    let filas = [];
    if (s && el) {
      // Lecturas de instrumento: lo que no llega a 10⁻⁹ de la escala de la corrida es 0
      const k = iDe(el.id), I = limpio(s.I[k], X.Imax), vv = limpio(s.v[k], X.Vmax), P = vv * I;
      switch (el.tipo) {
        case 'bateria': filas = [L('V', 'bornes', vv, 'V'), L('I', '', I, 'A'), L('P', '', P, 'W'), L('W', '', s.W[k], 'J')]; if (el.r > 0) filas.push(L('Q', 'r', s.Q[k], 'J')); break;
        case 'fuente-corriente': filas = [L('I', '', I, 'A'), L('V', '', -vv, 'V'), L('W', '', s.W[k], 'J')]; break;
        case 'resistencia': case 'reostato': filas = [L('V', '', vv, 'V'), L('I', '', I, 'A'), L('P', '', P, 'W'), L('Q', '', s.Q[k], 'J')]; break;
        case 'capacitor':
          filas = [L('V', '', vv, 'V'), L('q', '', s.q[k], 'C'), L('I', '', I, 'A'), L('U', 'C', s.U[k], 'J')];
          if (el.placa) filas.push(L('C', '', capacidadEn({ C: el.C, perfil: perfilPlaca(el.placa) }, t), 'F'), L('W', 'F', s.W[k], 'J'));
          break;
        case 'inductor': filas = [L('I', '', I, 'A'), L('V', '', vv, 'V'), L('U', 'L', s.U[k], 'J')]; break;
        case 'bombilla': filas = [L('V', '', vv, 'V'), L('I', '', I, 'A'), L('P', '', P, 'W'), L('R', '', Math.abs(I) > 1e-12 ? vv / I : curvaBombilla(el).R0, 'Ω'), ['brillo', '', fmt(100 * Math.min(1, Math.max(0, P) / el.Pn), 3), '%']]; break;
        case 'interruptor': case 'interruptor-3': filas = [L('V', '', vv, 'V'), L('I', '', I, 'A')]; if (ESC.modo === 'realista') filas.push(L('Q', '', s.Q[k], 'J')); break;
        case 'amperimetro': filas = [L('I', '', I, 'A')]; break;
        case 'voltimetro': filas = [L('V', '', vv, 'V')]; break;
        case 'tierra': filas = [['V', '', '0', 'V']]; break;
        default: break;
      }
    } else if (s) {
      const b = balance(SIM, s);
      filas = [L('W', '', b.W, 'J'), L('U', '', b.U, 'J'), L('Q', '', b.Q, 'J'), L('E', 'perdida', s.perdidas, 'J')];
      for (const [nombre, p] of Object.entries(ESC.nodos)) filas.push(L('V', nombre, s.V[X.nodo(clave(p))], 'V'));
    }
    $('#lecturas').innerHTML = filas.map(lectura).join('') || '<span class="u">—</span>';
    examen();
    $('#insp-estado').textContent = estadoInspector(el, s);
    document.querySelectorAll('[data-var]').forEach(e => { e.textContent = fmtVar(ESC.variables[e.dataset.var]); });
    $('#b-play').innerHTML = `<svg class="ico"><use href="#i-${jugando ? 'pausar' : 'reproducir'}"/></svg>`;
    $('#b-play').dataset.ayuda = jugando ? 'Pausar|Pause|Espacio' : 'Reproducir|Play|Espacio';
    $('#b-modo').textContent = ESC.modo === 'ideal' ? 'Ideal' : 'Realista';
    // El estado de los interruptores en el árbol y en las acciones sigue al tiempo
    document.querySelectorAll('#arbol .nodo[data-sel^="el:"]').forEach(n => { const e = elemento(n.dataset.sel.slice(3)); if (e && ES_INTERRUPTOR(e.tipo)) n.querySelector('.dato').textContent = datoArbol(e); });
    const ae = $('#a-estado'); if (ae && el) { const e = String(estadoInterruptor(el.id, t)); ae.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === e))); }
  }
  // Grupo «Examen»: nota de la escena y una fila por apartado. La medida se
  // escribe con el prefijo de la respuesta esperada; la opción del examen
  // aparece solo si la medida coincide (con la fórmula o con una de las
  // opciones numéricas). Antes de su instante, la respuesta aún no se conoce.
  function examen() {
    const base = ESCENARIOS.find(e => e.clave === ESC.clave), filas = X ? X.examen : [];
    const visible = !!base && ESC.tipo === 'MEXT' && (filas.length > 0 || !!base.nota);
    $('#grupo-examen').hidden = !visible;
    if (!visible) return;
    $('#examen-titulo').textContent = `Examen · MEXT ${ESC.anio || ''}`.trim();
    if ($('#examen-nota').textContent !== (base.nota || '')) $('#examen-nota').textContent = base.nota || '';
    $('#examen').innerHTML = filas.map(filaExamen).join('');
  }
  function filaExamen(f) {
    const listo = t >= (f.t ?? 0) - 1e-9 * ESC.duracion;
    const ref = Number.isFinite(f.esperado) && f.esperado !== 0 ? f.esperado : Number.isFinite(f.valor) ? f.valor : 0;
    const [, uu] = f.u ? enUnidad(ref, f.u) : [0, ''];
    const fac = f.u ? FAC[uu.slice(0, uu.length - f.u.length)] || 1 : 1;
    const val = !listo ? '—' : f.texto ? f.texto : Number.isFinite(f.valor) ? fmt(f.valor / fac, 4) : '—';
    let op = '';
    if (listo && f.texto) op = f.opcion || '';
    else if (listo && Number.isFinite(f.valor)) {
      const tol = f.tol ?? 5e-3, coincide = v => Math.abs(f.valor - v) <= tol * Math.max(Math.abs(v), f.escala ?? 0);
      if (f.opciones) { const m = f.opciones.find(([, v]) => coincide(v)); op = m ? m[0] : ''; }
      else if (f.opcion && Number.isFinite(f.esperado) && coincide(f.esperado)) op = f.opcion;
    }
    const ayuda = `${f.formula}${Number.isFinite(f.esperado) && !f.texto ? ` = ${cantidad(f.esperado / fac, uu, 4)}` : ''}|Exam answer`;
    return `<div class="ex-fila" data-ayuda="${ayuda.replace(/"/g, '')}"><span class="ex-n">${f.n || ''}</span><span class="ex-etq">${f.etq}</span><span class="ex-v">${val}</span><span class="ex-u">${listo && !f.texto ? uu : ''}</span><span class="ex-op">${op}</span></div>`;
  }

  function estadoInspector(el, s) {
    if (sel && sel.startsWith('cable:')) return 'Conductor ideal' + (ESC.modo === 'realista' ? ` · ${valorCon(ESC.rCable, 'Ω')} por tramo` : '');
    if (!el) return `${ESC.elementos.length} componentes · conexiones ${ESC.modo === 'ideal' ? 'ideales' : 'realistas'}`;
    const nom = CAT[el.tipo].nombre, k = s ? iDe(el.id) : -1;
    if (ES_INTERRUPTOR(el.tipo)) return `${nom} · ${textoEstado(el, estadoInterruptor(el.id, t))}`;
    if (el.tipo === 'capacitor' && k >= 0) return `${nom} · q = ${valorCon(s.q[k], 'C')}`;
    if (el.tipo === 'bombilla' && k >= 0) return `${nom} · ${valorCon(Math.max(0, s.v[k] * s.I[k]), 'W')}`;
    if (el.tipo === 'voltimetro' && k >= 0) return `${nom} · ${valorCon(s.v[k], 'V')}`;
    if (k >= 0 && el.tipo !== 'tierra') return `${nom} · ${valorCon(limpio(s.I[k], X.Imax), 'A')}`;
    return nom;
  }

  let arrastrandoVar = false;
  function construirVariables() {
    const cont = $('#variables'); cont.innerHTML = '';
    for (const [k, d] of Object.entries(ESC.variables)) {
      const f = document.createElement('div'); f.className = 'var';
      f.innerHTML = `<span class="sim">${simHTML(d)}</span><input class="deslizador" type="range" min="${d.min}" max="${d.max}" step="${d.paso}" value="${d.val}" aria-label="${d.sim}"><span class="valor"></span>`;
      const ent = f.querySelector('input'), val = f.querySelector('.valor');
      const pintar = () => { val.innerHTML = `${fmtVar(d)}${d.u ? `<span class="u">${d.u}</span>` : ''}`; Volta.pintarDeslizador(ent); };
      ent.addEventListener('input', () => { arrastrandoVar = true; d.val = parseFloat(ent.value); aplicarVariables(); pintar(); recalcular(); });
      ent.addEventListener('change', () => { arrastrandoVar = false; registrar(); arbol(); });
      pintar(); cont.appendChild(f);
    }
    if (!Object.keys(ESC.variables).length) cont.innerHTML = '<span class="ayuda-fila" style="margin:0">Sin variables: edita los valores en el inspector.</span>';
  }

  // ---------------------------------------------------------------------
  // Gráficas: osciloscopio de voltajes y corrientes, cargas, energía,
  // curva I-V con recta de carga y barrido del puente
  // ---------------------------------------------------------------------
  const MAG = {
    V: { nombre: 'Voltajes', u: 'V', fam: 'electrico', sim: 'v' },
    I: { nombre: 'Corrientes', u: 'A', fam: 'corriente', sim: 'I' },
    q: { nombre: 'Cargas', u: 'C', fam: 'tinta', sim: 'q' },
    U: { nombre: 'Energía almacenada', u: 'J', fam: 'electrico', sim: 'U' },
  };
  const PATRONES = ['continuo', 'discontinuo', 'punteado'];
  const valorSerie = (g, sr, m) => {
    if (sr.nodo) return m.V[X.nodo(clave(ESC.nodos[sr.nodo]))];
    const k = iDe(sr.id); if (k == null) return 0;
    return g.m === 'V' ? m.v[k] : g.m === 'I' ? m.I[k] : g.m === 'q' ? m.q[k] : m.U[k];
  };
  const familiaSerie = (g, sr) => (g.m === 'U' && sr.id && elemento(sr.id)?.tipo === 'inductor' ? 'magnetico' : MAG[g.m].fam);
  const simboloSerie = (g, sr) => (sr.nodo ? ['V', sr.nodo] : [MAG[g.m].sim, sr.id]);
  const serieValida = sr => (sr.nodo ? !!ESC.nodos[sr.nodo] : !!elemento(sr.id));

  function cabecera(id, g, unidad) {
    const series = (g.series || []).filter(serieValida);
    const items = series.map((sr, j) => {
      const [a, b] = simboloSerie(g, sr), fam = familiaSerie(g, sr);
      return `<span style="color:${fam === 'tinta' ? 'var(--tinta)' : `var(--f-${fam})`}"><i${PATRONES[j] === 'continuo' ? '' : ' class="discontinua"'}${PATRONES[j] === 'punteado' ? ' style="border-top-style:dotted"' : ''}></i><span class="sim">${a}<sub class="r">${b || ''}</sub></span></span>`;
    }).join('');
    $(id).innerHTML = `<span class="leyenda">${items}</span> <span class="u">(${unidad})</span>`;
  }

  function graficaTiempo(n, g) {
    const cv = $(`#g${n}`), s = estado(t), series = (g.series || []).filter(serieValida), [ft] = UT();
    if (!s || !series.length) { grafica(cv, { x: { min: 0, max: ESC.duracion / ft }, y: { min: -1, max: 1 }, series: [], cursor: t / ft }); $(`#t${n}`).textContent = MAG[g.m] ? MAG[g.m].nombre : ''; $(`#l${n}`).textContent = '—'; return; }
    // Escala fija de la corrida y unidad con prefijo; el tiempo en la unidad de la escena
    if (!g._cache || g._cache.sim !== SIM) {
      let lo = 0, hi = 0;
      for (const m of SIM.muestras) for (const sr of series) { const y = valorSerie(g, sr, m); if (y < lo) lo = y; if (y > hi) hi = y; }
      const d = Math.max(hi - lo, 1e-12), [, uu] = enUnidad(Math.max(Math.abs(lo), Math.abs(hi)), MAG[g.m].u), f = FAC[uu.slice(0, uu.length - MAG[g.m].u.length)] || 1;
      const pts = series.map(sr => { const p = []; for (let i = 0; i < SIM.muestras.length; i += 2) { const m = SIM.muestras[i]; p.push([m.t / ft, valorSerie(g, sr, m) / f]); } return p; });
      g._cache = { sim: SIM, lo: (lo - 0.08 * d) / f, hi: (hi + 0.08 * d) / f, uu, f, pts };
    }
    const C = g._cache, eventos = SIM.eventos.filter(e => e.t > 0).map(e => ({ x: e.t / ft }));
    grafica(cv, {
      x: { min: 0, max: ESC.duracion / ft }, y: { min: C.lo, max: C.hi },
      series: series.map((sr, j) => ({ tramos: [C.pts[j]], familia: familiaSerie(g, sr), patron: PATRONES[j] })),
      cursor: t / ft, puntoCursor: [t / ft, valorSerie(g, series[0], s) / C.f], eventos,
    });
    cabecera(`#t${n}`, g, C.uu);
    $(`#l${n}`).textContent = cantidad(limpio(valorSerie(g, series[0], s) / C.f, Math.max(Math.abs(C.lo), Math.abs(C.hi))), C.uu);
  }

  // Curva I-V de la bombilla, recta de carga E = V + R·I y punto de operación
  function graficaIV(n, g) {
    const cv = $(`#g${n}`), b = elemento(g.id), fu = elemento(g.fuente), rs = elemento(g.serie), s = estado(t);
    if (!b || !fu || !rs || !s) { grafica(cv, { x: { min: 0, max: 1 }, y: { min: 0, max: 1 }, series: [] }); return; }
    const curva = curvaBombilla(b), E = fu.E, R = rs.R, k = iDe(b.id);
    const xmax = Math.max(E, b.Vn) * 1.05, Iesc = Math.max(curva.I(xmax), E / R) * 1.08;
    const [, uu] = enUnidad(Iesc, 'A'), f = FAC[uu.slice(0, -1)] || 1;
    const pc = []; for (let i = 0; i <= 80; i++) { const v = xmax * i / 80; pc.push([v, curva.I(v) / f]); }
    const tray = []; for (const m of SIM.muestras) { if (m.t > t) break; tray.push([m.v[k], m.I[k] / f]); }
    tray.push([s.v[k], s.I[k] / f]);
    grafica(cv, {
      x: { min: 0, max: xmax }, y: { min: 0, max: Iesc / f },
      series: [
        { tramos: [tray], familia: 'corriente' },
        { tramos: [pc], familia: 'tinta', etiqueta: 'bombilla' },
        { tramos: [[[0, E / R / f], [E, 0]]], familia: 'texto-3', auxiliar: true, etiqueta: 'recta de carga' },
      ],
      puntoCursor: [s.v[k], s.I[k] / f],
    });
    $(`#t${n}`).innerHTML = `<span class="sim">I</span> (${uu}) contra <span class="sim">V</span> (V)`;
    $(`#l${n}`).textContent = `${cantidad(s.v[k], 'V')} · ${cantidad(s.I[k] / f, uu)}`;
  }

  // Barrido en estado estacionario: corriente de un amperímetro (o voltaje de
  // un voltímetro) contra una variable, con un interruptor cerrado si se da
  function graficaBarrido(n, g) {
    const cv = $(`#g${n}`), va = ESC.variables[g.variable], s = estado(t), med = elemento(g.id);
    if (!va || !med || !s) { grafica(cv, { x: { min: 0, max: 1 }, y: { min: -1, max: 1 }, series: [] }); return; }
    const esV = med.tipo === 'voltimetro', mag = esV ? 'v' : 'I', U = esV ? 'V' : 'A';
    const opc = g.interruptor && elemento(g.interruptor) ? { estados: { [g.interruptor]: true } } : {};
    const lee = op => op[mag][op.ids.indexOf(g.id)];
    if (!X.barrido) {
      const pts = [], vals = [];
      for (let i = 0; i <= 90; i++) {
        const R = va.min + (va.max - va.min) * i / 90;
        const circ = copia(RED.circuito);
        for (const [id, p] of va.liga) { const c = circ.componentes.find(x => x.id === id); if (c) c[p] = R * va.factor; }
        try { const y = lee(puntoOperacion(circ, opc)); pts.push([R, y]); vals.push(y); } catch { /* sin solución */ }
      }
      const m = Math.max(1e-15, ...vals.map(Math.abs)), [, uu] = enUnidad(m, U), f = FAC[uu.slice(0, uu.length - U.length)] || 1;
      // Con signo solo si la curva cambia de signo (puente); si no, desde cero
      X.barrido = { pts: pts.map(([a, b]) => [a, b / f]), m: m / f, uu, f, pos: vals.every(y => y >= 0), neg: vals.every(y => y <= 0) };
    }
    const B = X.barrido, k = iDe(g.id);
    let ahora = NaN; try { ahora = lee(puntoOperacion(RED.circuito, opc)) / B.f; } catch { /* sin solución */ }
    grafica(cv, {
      x: { min: va.min, max: va.max }, y: { min: B.pos ? 0 : -B.m * 1.1, max: B.neg ? 0 : B.m * 1.1 },
      series: [{ tramos: [B.pts], familia: esV ? 'electrico' : 'corriente' }],
      puntoCursor: Number.isFinite(ahora) ? [va.val, ahora] : undefined,
      eventos: B.pts.filter(([, b], i) => i && Math.sign(b) !== Math.sign(B.pts[i - 1][1])).map(([a]) => ({ x: a })),
    });
    $(`#t${n}`).innerHTML = `<span class="sim">${esV ? 'V' : 'I'}</span><sub>${nombreHTML(g.id)}</sub> (${B.uu}) contra <span class="sim">${va.sim}</span>${va.sub ? `<sub>${va.sub}</sub>` : ''} (${va.u})${opc.estados ? `, con ${nombreHTML(g.interruptor)} cerrado` : ''}`;
    $(`#l${n}`).textContent = cantidad((esV ? s.v[k] : s.I[k]) / B.f, B.uu);
  }

  function graficas() {
    if (!$('#p-graficas').hidden) {
      ESC.graficas.forEach((g, j) => {
        if (g.m === 'iv') graficaIV(j + 1, g);
        else if (g.m === 'barrido') graficaBarrido(j + 1, g);
        else graficaTiempo(j + 1, g);
      });
    }
    if (!$('#p-energia').hidden) energiaPanel();
  }

  // ---------------------------------------------------------------------
  // Registro de energía: a dónde va cada joule
  // ---------------------------------------------------------------------
  function energiaPanel() {
    const s = estado(t);
    if (!s) { $('#barras').innerHTML = '<span class="u">—</span>'; return; }
    const filas = [], color = f => (f === 'tinta' ? 'var(--tinta)' : `var(--f-${f})`);
    let Qcables = 0;
    for (const el of ESC.elementos) {
      const k = iDe(el.id), n = nombreHTML(el.id);
      if (el.tipo === 'bateria' || el.tipo === 'fuente-corriente') {
        filas.push([`Trabajo de ${n}`, 'trabajo', s.W[k], 'Energía que entrega la fuente|Work done by the source']);
        if (el.r > 0) filas.push([`Calor en ${n} (interna)`, 'termico', s.Q[k], 'Calor en la resistencia interna|Internal Joule heat']);
      } else if (el.tipo === 'capacitor') {
        if (el.placa) filas.push(['Trabajo de la fuerza', 'trabajo', s.W[k], `Trabajo de la fuerza externa que mueve la placa conductora de ${el.id}, −∫½v²dC|Work done on the slab`]);
        filas.push([`Energía en ${n}`, 'electrico', s.U[k], 'Energía eléctrica almacenada, q²/2C|Stored electric energy']);
      }
      else if (el.tipo === 'inductor') filas.push([`Energía en ${n}`, 'magnetico', s.U[k], 'Energía magnética almacenada, ½LI²|Stored magnetic energy']);
      else if (el.tipo === 'resistencia' || el.tipo === 'reostato' || el.tipo === 'bombilla') filas.push([`Calor en ${n}`, 'termico', s.Q[k], 'Calor de Joule acumulado|Joule heat']);
      else if (ES_INTERRUPTOR(el.tipo) || el.tipo === 'amperimetro' || el.tipo === 'voltimetro') Qcables += s.Q[k];
    }
    for (const sg of RED.tramos) Qcables += s.Q[iDe(sg.id)];
    if (ESC.modo === 'realista') filas.push(['Calor en cables', 'termico', Qcables, 'Calor de Joule en los cables y contactos|Heat in wires']);
    else filas.push(['Pérdida al conectar', 'termico', s.perdidas, 'Energía que se pierde cuando la carga salta de golpe al conectar (chispa, radiación)|Energy lost in ideal connections']);
    const b = balance(SIM, s), esc = X.Emax;
    // Con alguna cantidad negativa (la fuerza que frena la placa), barras con signo desde el centro
    const conSigno = X.conSigno ?? (X.conSigno = SIM.muestras.some(m => ESC.elementos.some(e => e.tipo === 'capacitor' && e.placa && m.W[iDe(e.id)] < -1e-12 * esc)));
    $('#barras').className = 'barras' + (conSigno ? ' con-signo' : '');
    $('#barras').innerHTML = `<div class="barras-tit">Registro de energía</div>` + filas.map(([nom, fam, val, ayuda]) => {
      const fondo = fam === 'trabajo' ? 'repeating-linear-gradient(90deg, var(--tinta) 0 6px, transparent 6px 9px)' : color(fam);
      const w = Math.max(0, Math.min(100, Math.abs(val) / esc * 100)), estilo = conSigno ? `left:${val >= 0 ? 50 : 50 - w / 2}%;width:${w / 2}%` : `width:${val > 0 ? w : 0}%`;
      return `<div class="barra-e" data-ayuda="${ayuda}"><span>${nom}</span><span class="riel"><i style="${estilo};background:${fondo}"></i></span><span class="v">${valorCon(val, 'J')}</span></div>`;
    }).join('') + `<div class="barras-pie"><span class="sim">W</span> − Δ<span class="sim">U</span> − <span class="sim">Q</span> − pérdidas = ${valorCon(b.residuo, 'J', 2)}${Math.abs(b.numerico) > 1e-12 * esc ? ` · numérica ${valorCon(b.numerico, 'J', 2)}` : ''}</div>`;
    // Gráfica de energía contra t
    if (!X.serieE) {
      const W = [], Uc = [], Ul = [], Q = [], [ft] = UT();
      const hayL = ESC.elementos.some(e => e.tipo === 'inductor');
      SIM.muestras.forEach((m, i) => {
        if (i % 2) return;
        const bb = balance(SIM, m); let uc = 0, ul = 0;
        for (const el of ESC.elementos) { const k = iDe(el.id); if (el.tipo === 'capacitor') uc += m.U[k]; if (el.tipo === 'inductor') ul += m.U[k]; }
        W.push([m.t / ft, bb.W]); Uc.push([m.t / ft, uc]); Ul.push([m.t / ft, ul]); Q.push([m.t / ft, bb.Q + m.perdidas]);
      });
      const [, uu] = enUnidad(X.Emax, 'J'), f = FAC[uu.slice(0, -1)] || 1;
      const esc2 = p => p.map(([a, v]) => [a, v / f]);
      const ymin = Math.min(0, ...W.map(p => p[1] / f));
      X.serieE = { W: esc2(W), Uc: esc2(Uc), Ul: esc2(Ul), Q: esc2(Q), hayL, uu, f, ft, ymin };
    }
    const E = X.serieE;
    const series = [{ tramos: [E.W], familia: 'tinta', patron: 'discontinuo' }, { tramos: [E.Uc], familia: 'electrico' }];
    if (E.hayL) series.push({ tramos: [E.Ul], familia: 'magnetico' });
    series.push({ tramos: [E.Q], familia: 'termico' });
    grafica($('#g4'), { x: { min: 0, max: ESC.duracion / E.ft }, y: { min: E.ymin * 1.08, max: X.Emax / E.f * 1.08 }, series, cursor: t / E.ft, eventos: SIM.eventos.filter(e => e.t > 0).map(e => ({ x: e.t / E.ft })) });
    $('#t4').innerHTML = `<span style="color:var(--tinta)"><i class="discontinua"></i><span class="sim">W</span></span><span style="color:var(--f-electrico)"><i></i><span class="sim">U</span><sub>C</sub></span>${E.hayL ? '<span style="color:var(--f-magnetico)"><i></i><span class="sim">U</span><sub>L</sub></span>' : ''}<span style="color:var(--f-termico)"><i></i><span class="sim">Q</span></span> <span class="u">(${E.uu})</span>`;
    document.querySelector('#p-energia .grafica-cab .lect').textContent = '';
  }

  // ---------------------------------------------------------------------
  // Eventos y tabla de datos
  // ---------------------------------------------------------------------
  function tablas() {
    if (!SIM) { $('#t-eventos').innerHTML = ''; $('#t-datos').innerHTML = ''; return; }
    $('#t-eventos').innerHTML = `<tr><th>Evento</th><th>t (${UT()[1]})</th>` + '<th>Energía perdida (J)</th><th>Mayor salto de carga (C)</th></tr>' +
      (SIM.eventos.length ? SIM.eventos.map(e => `<tr class="${Math.abs(e.t - t) < ESC.dt / 2 ? 'actual' : ''}"><td class="texto">${e.nombre}${e.cortes.length ? ` · se corta ${e.cortes.join(', ')}` : ''}</td><td>${fmt(e.t / UT()[0], 5)}</td><td>${e.perdida > 1e-15 ? fmt(e.perdida, 4) : '0'}</td><td>${e.carga > 0 ? fmt(e.carga, 4) : '0'}</td></tr>`).join('')
        : '<tr><td class="texto" colspan="4">Sin eventos: programa acciones con un clic sobre un interruptor.</td></tr>');
    const nodos = Object.entries(ESC.nodos), els = ESC.elementos.filter(e => e.tipo !== 'tierra');
    let filas = `<tr><th>t (${UT()[1]})</th>` + nodos.map(([n]) => `<th>V<sub>${n}</sub> (V)</th>`).join('') + els.map(e => `<th>I<sub>${nombreHTML(e.id)}</sub> (A)</th>${e.tipo === 'capacitor' ? `<th>q<sub>${nombreHTML(e.id)}</sub> (C)</th>` : ''}`).join('') + '</tr>';
    const paso = ESC.duracion / 100;
    for (let j = 0; j <= 100; j++) {
      const tt = j * paso, s = estado(tt);
      filas += `<tr class="${Math.abs(tt - t) < paso / 2 ? 'actual' : ''}"><td>${fmt(tt / UT()[0], 4)}</td>` + nodos.map(([, p]) => `<td>${fmt(s.V[X.nodo(clave(p))], 4)}</td>`).join('')
        + els.map(e => { const k = iDe(e.id); return `<td>${fmt(s.I[k], 4)}</td>${e.tipo === 'capacitor' ? `<td>${fmt(s.q[k], 4)}</td>` : ''}`; }).join('') + '</tr>';
    }
    $('#t-datos').innerHTML = filas;
  }

  // ---------------------------------------------------------------------
  // Ciclo de actualización
  // ---------------------------------------------------------------------
  // Línea de tiempo: en segundos, la común; con escenas de ms o µs, las marcas
  // y la ficha de cada evento van en la unidad de la escena (como en Magnetismo
  // · Partículas), con la unidad junto a la última marca.
  class LineaTiempoU extends LineaTiempo {
    dibujar() {
      const [fu, uu] = UT();
      if (fu === 1) { super.dibujar(); return; }
      const c = this.canvas, tk = leerTokens(), dpr = window.devicePixelRatio || 1;
      const r = c.getBoundingClientRect(); this.w = r.width; const H = r.height;
      c.width = Math.round(r.width * dpr); c.height = Math.round(H * dpr);
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, this.w, H);
      const yRiel = 22;
      g.fillStyle = tk['campo-activo']; g.beginPath(); g.roundRect(this.m, yRiel - 2, this.w - 2 * this.m, 4, 2); g.fill();
      g.fillStyle = tk['linea-fuerte']; g.beginPath(); g.roundRect(this.m, yRiel - 2, this._x(this.simulado) - this.m, 4, 2); g.fill();
      g.fillStyle = tk.tinta; g.beginPath(); g.roundRect(this.m, yRiel - 2, Math.max(0, this._x(this.t) - this.m), 4, 2); g.fill();
      const D = this.duracion / fu, paso = pasoAgradable(D / Math.max(4, Math.floor(this.w / 90)));
      g.font = '11px "IBM Plex Mono", Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillStyle = tk['texto-3']; g.strokeStyle = tk.linea; g.lineWidth = 1;
      const marcas = []; for (let v = 0; v <= D + 1e-9 * D; v += paso) marcas.push(v);
      marcas.forEach((v, i) => {
        const x = Math.round(this._x(v * fu)) + 0.5;
        g.beginPath(); g.moveTo(x, yRiel + 6); g.lineTo(x, yRiel + 9); g.stroke();
        const txt = i === marcas.length - 1 ? `${fmtMarca(v, paso)}${ESP}${uu}` : fmtMarca(v, paso), wt = g.measureText(txt).width;
        if (x + wt / 2 > this.w - 2) { g.textAlign = 'right'; g.fillText(txt, this.w - 2, yRiel + 11); g.textAlign = 'center'; } else g.fillText(txt, x, yRiel + 11);
      });
      for (const e of this.eventos) rombo(g, this._x(e.t), yRiel - 9, 3.5, e === this.hover ? tk.tinta : tk['texto-2']);
      if (this.hover) {
        g.font = '500 11px "IBM Plex Sans", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
        const txt = `${this.hover.nombre} · ${Tf(this.hover.t)}`, wTxt = g.measureText(txt).width;
        let x = this._x(this.hover.t) + 8; if (x + wTxt + 12 > this.w) x = this._x(this.hover.t) - wTxt - 20;
        g.fillStyle = tk.tinta; g.beginPath(); g.roundRect(x, yRiel - 18, wTxt + 12, 18, 4); g.fill();
        g.fillStyle = tk['sobre-tinta']; g.fillText(txt, x + 6, yRiel - 9);
      }
      const xc = this._x(this.t);
      g.strokeStyle = tk.tinta; g.lineWidth = 1.5; g.beginPath(); g.moveTo(xc, yRiel - 12); g.lineTo(xc, yRiel + 8); g.stroke();
      g.fillStyle = tk.lienzo; g.beginPath(); g.arc(xc, yRiel, 6, 0, 2 * Math.PI); g.fill(); g.stroke();
    }
  }
  const lt = new LineaTiempoU($('#tl'), { duracion: 12, eventos: [], alCambiar: nt => { t = nt; jugando = false; todo(); } });
  function todo() {
    dibujar(); lecturas(); lt.poner(t); graficas();
    if (!$('#p-eventos').hidden || !$('#p-tabla').hidden) tablas();
  }
  function recalcular() {
    simular();
    lt.duracion = ESC.duracion; lt.simulado = ESC.duracion;
    lt.eventos = SIM ? SIM.eventos.filter(e => e.t > 0).map(e => ({ t: e.t, nombre: e.nombre })) : [];
    t = Math.min(t, ESC.duracion);
    if (ERROR) avisar(ERROR, false);
    todo();
    if (autoguardar) autoguardado.guardar('circuitos', escenaActual());
  }
  function titulo() {
    const e = ESCENARIOS.find(x => x.clave === ESC.clave);
    $('#escena-nombre').textContent = ESC.titulo;
    const chip = $('#escena-chip');
    chip.textContent = ESC.tipo === 'MEXT' ? `MEXT ${ESC.anio || ''}`.trim() : ESC.tipo || 'Propio';
    chip.className = 'chip' + (ESC.tipo === 'MEXT' ? ' lleno' : '');
    document.title = `Volta · Circuitos · ${ESC.titulo}`;
    return e;
  }

  // ---------------------------------------------------------------------
  // Acciones sobre interruptores (eventos en la línea de tiempo)
  // ---------------------------------------------------------------------
  // La historia se ramifica en t: las acciones posteriores se descartan
  function accionInterruptor(id, estadoNuevo) {
    const el = elemento(id); if (!el) return;
    const tt = t, descartadas = ESC.acciones.filter(a => a.t > tt + 1e-9).length;
    ESC.acciones = ESC.acciones.filter(a => a.t < tt - 1e-9 || (a.t <= tt + 1e-9 && a.id !== id));
    const ya = estadoInterruptor(id, tt);
    if (String(ya) === String(estadoNuevo)) { recalcular(); registrar(); inspector(); avisar(`${id} ya está ${textoEstado(el, ya)} en t = ${Tf(tt)}`); return; }
    ESC.acciones.push({ t: tt, id, estado: estadoNuevo });
    ESC.acciones.sort((a, b) => a.t - b.t);
    recalcular(); registrar(); inspector();
    const cola = descartadas ? ` · se descartan ${descartadas} ${descartadas > 1 ? 'acciones posteriores' : 'acción posterior'}` : '';
    avisar(`${el.tipo === 'interruptor' ? `${id} se ${estadoNuevo ? 'cierra' : 'abre'}` : estadoNuevo ? `${id} pasa a la posición ${estadoNuevo}` : `${id} se abre`} en t = ${Tf(tt)}${cola}`);
  }
  function alternarInterruptor(id) {
    const el = elemento(id), e = estadoInterruptor(id, t);
    if (el.tipo === 'interruptor') accionInterruptor(id, !e);
    else accionInterruptor(id, ({ a: 'b', b: 'c', c: null, null: 'a' })[String(e)]);
  }
  function cambiarModo(m) { if (m === ESC.modo) return; ESC.modo = m; recalcular(); registrar(); inspector(); avisar(m === 'ideal' ? 'Conexiones ideales: la carga salta al instante' : `Conexiones realistas: ${valorCon(ESC.rCable, 'Ω')} por tramo de cable`); }

  let relojAviso = null;
  function avisar(txt, conDeshacer = true) {
    $('#aviso-texto').textContent = txt; $('#aviso').hidden = false;
    $('#aviso-deshacer').hidden = !conDeshacer || !historial?.puedeDeshacer;
    clearTimeout(relojAviso); relojAviso = setTimeout(() => { $('#aviso').hidden = true; }, conDeshacer ? 5000 : 7000);
  }
  $('#aviso-deshacer').addEventListener('click', () => deshacer());

  // ---------------------------------------------------------------------
  // Edición del esquema: colocar, mover, girar y quitar; cables
  // ---------------------------------------------------------------------
  function nuevoId(tipo) {
    const pref = CAT[tipo].pref;
    for (let n = 1; ; n++) if (!elemento(pref + n)) return pref + n;
  }
  function colocar(tipo, p) {
    const el = { id: nuevoId(tipo), tipo, p, rot: rotHerr, etq: rotHerr % 180 ? 'der' : 'arr' };
    for (const [k, , , , def] of CAT[tipo].params) el[k] = def;
    if (tipo === 'interruptor') el.cerrado = false;
    if (tipo === 'interruptor-3') el.posicion = null;
    ESC.elementos.push(el); ESC.clave = ESC.clave || 'propio';
    sel = 'el:' + el.id; recalcular(); registrar(); inspector(); encuadreSiHaceFalta();
  }
  function rotarSeleccion() {
    const el = elSel(); if (!el) { rotHerr = (rotHerr + 90) % 360; dibujar(); return; }
    el.rot = ((el.rot || 0) + 90) % 360; recalcular(); registrar();
  }
  function borrarSeleccion() {
    if (sel && sel.startsWith('el:')) {
      const id = sel.slice(3);
      ESC.elementos = ESC.elementos.filter(e => e.id !== id);
      ESC.acciones = ESC.acciones.filter(a => a.id !== id);
      for (const v of Object.values(ESC.variables)) v.liga = v.liga.filter(([i]) => i !== id);
      ESC.graficas.forEach(g => { if (g.series) g.series = g.series.filter(s => s.id !== id); });
      sel = null; recalcular(); registrar(); inspector(); avisar(`Se quita ${id}`);
    } else if (sel && sel.startsWith('cable:')) {
      ESC.cables.splice(+sel.slice(6), 1); sel = null; recalcular(); registrar(); inspector(); avisar('Se quita el cable');
    }
  }
  function nombrarNodo(p) {
    const ya = Object.entries(ESC.nodos).find(([, q]) => clave(q) === clave(p));
    if (ya) { delete ESC.nodos[ya[0]]; recalcular(); registrar(); avisar(`Se quita el nombre del nodo ${ya[0]}`); return; }
    let n = 'A'; while (ESC.nodos[n]) n = String.fromCharCode(n.charCodeAt(0) + 1);
    ESC.nodos[n] = p; recalcular(); registrar(); avisar(`Nodo ${n}: su potencial se muestra en el lienzo y en la tabla`);
  }
  function alternarOsciloscopio(id) {
    const el = elemento(id); if (!el || el.tipo === 'tierra') return;
    let cambiado = false;
    for (const g of ESC.graficas) {
      if (g.m !== 'V' && g.m !== 'I') continue;
      const j = g.series.findIndex(s => s.id === id);
      if (j >= 0) g.series.splice(j, 1); else { g.series.push({ id }); if (g.series.length > 3) g.series.shift(); }
      g._cache = null; cambiado = true;
    }
    if (cambiado) { registrar(); todo(); avisar(`Osciloscopio: canales de ${id} ${ESC.graficas.some(g => g.series?.some(s => s.id === id)) ? 'añadidos' : 'quitados'}`); }
  }
  function ponerHerramienta(h) {
    herramienta = herramienta === h ? null : h;
    document.querySelectorAll('.herr').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.herr === herramienta)));
    lienzo.style.cursor = herramienta ? 'crosshair' : 'default';
    if (herramienta && CAT[herramienta]) avisar(`${CAT[herramienta].nombre}: clic en la cuadrícula para colocarla · R la gira · Esc termina`, false);
    else if (herramienta === 'cable') avisar('Cable: arrastra de un punto a otro de la cuadrícula · Esc termina', false);
    else if (herramienta === 'nodo') avisar('Nombre de nodo: clic en un punto del circuito', false);
    else if (herramienta === 'osciloscopio') avisar('Osciloscopio: clic en un componente para ver su voltaje y su corriente', false);
    dibujar();
  }
  document.querySelectorAll('.herr').forEach(b => b.addEventListener('click', () => ponerHerramienta(b.dataset.herr)));
  function encuadreSiHaceFalta() { if (!vistaTocada) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); dibujar(); } }

  // ---------------------------------------------------------------------
  // Escena: guardar, abrir, autoguardado y deshacer
  // ---------------------------------------------------------------------
  let autoguardar = false;
  const instantanea = () => {
    const { clave: c, titulo: ti, tipo, anio, duracion, dt, elementos, cables, nodos, acciones: ac, variables, graficas: gr, modo, rCable, inicio } = ESC;
    return copia({ clave: c, titulo: ti, tipo, anio, duracion, dt, elementos, cables, nodos, acciones: ac, variables, graficas: gr.map(g => ({ ...g, _cache: undefined })), modo, rCable, inicio });
  };
  function escenaActual() { return crearEscena({ modulo: 'circuitos', espacio: 'transitorios', titulo: ESC.titulo, datos: instantanea() }); }

  // Placa conductora de un capacitor: espesor relativo e en (0, 0.95] y
  // fracción metida f(t) en [0, 1], de 2 a 50 puntos con t creciente
  function placaSegura(pl) {
    if (!pl || typeof pl !== 'object' || !Array.isArray(pl.f)) return null;
    const e = numero(pl.e, NaN);
    if (!(e > 0 && e <= 0.95) || pl.f.length < 2 || pl.f.length > 50) return null;
    const f = [];
    for (const par of pl.f) {
      if (!Array.isArray(par) || !Number.isFinite(par[0]) || !Number.isFinite(par[1]) || par[0] < 0 || par[0] > 1e3) return null;
      if (f.length && par[0] <= f[f.length - 1][0]) return null;
      f.push([par[0], Math.max(0, Math.min(1, par[1]))]);
    }
    return { e, f };
  }

  // Valida y acota lo que viene de un archivo antes de usarlo
  function datosSeguros(d = {}) {
    const base = ESCENARIOS.find(x => x.clave === d.clave) || ESCENARIOS[0];
    const punto = p => (Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) ? [Math.round(p[0]), Math.round(p[1])] : null);
    // Los nombres van al marcado: se sanean (nucleo/escena.js) y se dejan en letras, cifras y _
    const nombre = (v, def, max) => texto(v, def, max).replace(/[^\p{L}\p{N}_]/gu, '') || def;
    const vistos = new Set();
    const elementos = (Array.isArray(d.elementos) ? d.elementos : base.elementos).filter(e => e && CAT[e.tipo] && typeof e.id === 'string' && punto(e.p)).map(e => {
      let id = nombre(e.id, CAT[e.tipo].pref, 12);
      for (let n = 2; vistos.has(id); n++) id = nombre(e.id, CAT[e.tipo].pref, 10) + n;
      vistos.add(id);
      const el = { id, tipo: e.tipo, p: punto(e.p), rot: [0, 90, 180, 270].includes(e.rot) ? e.rot : 0, etq: ['arr', 'aba', 'izq', 'der'].includes(e.etq) ? e.etq : 'arr' };
      for (const [k, , , , def] of CAT[e.tipo].params) el[k] = numero(e[k], def, k === 'x' ? 0 : k === 'frio' ? 1 : -1e9, k === 'x' ? 1 : 1e12);
      for (const k of ['R', 'C', 'L', 'Vn', 'Pn']) if (k in el && !(el[k] > 0)) el[k] = CAT[e.tipo].params.find(p => p[0] === k)[4];
      if (el.tipo === 'interruptor') el.cerrado = !!e.cerrado;
      if (el.tipo === 'interruptor-3') el.posicion = ['a', 'b', 'c'].includes(e.posicion) ? e.posicion : null;
      if (el.tipo === 'capacitor') { const pl = placaSegura(e.placa); if (pl) el.placa = pl; }
      return el;
    });
    // Las acciones y las variables se refieren a los nombres ya saneados
    const renombre = new Map((Array.isArray(d.elementos) ? d.elementos : base.elementos).filter(e => e && CAT[e.tipo] && typeof e.id === 'string' && punto(e.p)).map((e, i) => [e.id, elementos[i].id]));
    const ids = new Set(elementos.map(e => e.id));
    const idDe = v => renombre.get(v) ?? v;
    const cables = (Array.isArray(d.cables) ? d.cables : base.cables).filter(Array.isArray).map(poli => poli.map(punto).filter(Boolean)).filter(p => p.length >= 2);
    const nodos = Object.fromEntries(Object.entries(d.nodos && typeof d.nodos === 'object' ? d.nodos : base.nodos).filter(([n, p]) => /^[A-Za-z]{1,2}$/.test(n) && punto(p)).map(([n, p]) => [n, punto(p)]));
    // De 1 µs a 120 s, con 50 a 20 000 muestras
    const duracion = numero(d.duracion, base.duracion, 1e-6, 120), dt = numero(d.dt, base.dt, duracion / 20000, duracion / 50);
    const acciones = (Array.isArray(d.acciones) ? d.acciones : base.acciones).filter(a => a && ids.has(idDe(a.id)) && Number.isFinite(a.t) && a.t >= 0 && a.t <= duracion)
      .map(a => ({ t: a.t, id: idDe(a.id), estado: typeof a.estado === 'boolean' || ['a', 'b', 'c'].includes(a.estado) || a.estado === null ? a.estado : false }));
    const variables = {};
    for (const [k, v] of Object.entries(d.variables && typeof d.variables === 'object' ? d.variables : base.variables)) {
      if (!v || !Array.isArray(v.liga)) continue;
      const min = numero(v.min, 0), max = numero(v.max, 1);
      if (!/^[A-Za-z]\w{0,7}$/.test(k)) continue;
      variables[k] = {
        sim: texto(v.sim, k, 3), sub: v.sub ? texto(v.sub, '', 4) : undefined, val: numero(v.val, min, min, max), min, max: Math.max(min, max),
        paso: numero(v.paso, 0.1, 1e-9), u: texto(v.u, '', 6), factor: numero(v.factor, 1, 1e-15, 1e15),
        liga: v.liga.filter(l => Array.isArray(l) && ids.has(idDe(l[0])) && typeof l[1] === 'string').map(l => [idDe(l[0]), l[1]]).filter(([i, p]) => CAT[elementos.find(e => e.id === i).tipo].params.some(q => q[0] === p)),
      };
    }
    // Gráficas: solo magnitudes conocidas y series de componentes o nodos que existen
    const serie = sr => (sr && typeof sr.nodo === 'string' && nodos[sr.nodo] ? { nodo: sr.nodo } : sr && ids.has(idDe(sr.id)) ? { id: idDe(sr.id) } : null);
    const graf = g => {
      if (!g || typeof g !== 'object') return null;
      if (['V', 'I', 'q', 'U'].includes(g.m)) return { m: g.m, series: (Array.isArray(g.series) ? g.series : []).map(serie).filter(Boolean).slice(0, 3) };
      if (g.m === 'iv' && ['id', 'fuente', 'serie'].every(k => ids.has(idDe(g[k])))) return { m: 'iv', id: idDe(g.id), fuente: idDe(g.fuente), serie: idDe(g.serie) };
      if (g.m === 'barrido' && ids.has(idDe(g.id)) && (g.interruptor == null || ids.has(idDe(g.interruptor))) && Object.prototype.hasOwnProperty.call(variables, g.variable)) {
        return { m: 'barrido', id: idDe(g.id), variable: g.variable, ...(g.interruptor != null ? { interruptor: idDe(g.interruptor) } : {}) };
      }
      return null;
    };
    const propias = Array.isArray(d.graficas) ? d.graficas.map(graf) : [];
    const graficas = propias.length === 3 && propias.every(Boolean) ? propias : [{ m: 'V', series: [] }, { m: 'I', series: [] }, { m: 'q', series: [] }];
    return {
      clave: ESCENARIOS.some(e => e.clave === d.clave) ? d.clave : 'propio', titulo: texto(d.titulo, base.titulo, 80),
      tipo: ['Tutorial', 'Ejemplo', 'MEXT', 'Propio'].includes(d.tipo) ? d.tipo : 'Propio', anio: d.anio ? texto(d.anio, '', 12) : undefined,
      duracion, dt, elementos, cables, nodos, acciones, variables, graficas,
      modo: d.modo === 'realista' ? 'realista' : 'ideal', rCable: numero(d.rCable, 0.05, 1e-6, 1e6), inicio: d.inicio === 'estacionario' ? 'estacionario' : 'reposo',
    };
  }
  function restaurar(d) {
    ESC = datosSeguros(d); aplicarVariables();
    if (sel && sel.startsWith('el:') && !elemento(sel.slice(3))) sel = null;
    if (sel && sel.startsWith('cable:') && !ESC.cables[+sel.slice(6)]) sel = null;
    titulo(); construirVariables(); inspector(); recalcular();
  }

  let historial = null;
  function botonesHistorial() {
    $('#b-deshacer').disabled = !historial?.puedeDeshacer;
    $('#b-rehacer').disabled = !historial?.puedeRehacer;
  }
  function registrar() { if (historial && historial.registrar(instantanea())) botonesHistorial(); }
  function deshacer() { const d = historial?.deshacer(); if (d) { restaurar(d); botonesHistorial(); avisar('Cambio deshecho', false); } }
  function rehacer() { const d = historial?.rehacer(); if (d) { restaurar(d); botonesHistorial(); avisar('Cambio rehecho', false); } }
  $('#b-deshacer').addEventListener('click', deshacer);
  $('#b-rehacer').addEventListener('click', rehacer);

  async function abrirEscenario(clave) {
    if (hayCambios() && !(await confirmarCambios('cambiar de escena'))) return;
    cargarEscenario(clave); t = 0; jugando = false; vistaTocada = false;
    titulo(); construirVariables(); inspector();
    recalcular(); encuadrar(); escala0 = tz.vista.escala; zoomTexto(); todo();
    if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); }
    documentoNuevo();
  }
  function guardar() {
    guardarEscena(escenaActual()).then(r => { if (r) avisar('Escena guardada', false); }, e => avisar(`No se pudo guardar: ${e}`, false));
  }
  function abrir() {
    abrirEscena({ modulo: 'circuitos' }).then(e => {
      restaurar(e.datos); t = 0; vistaTocada = false; encuadrar(); escala0 = tz.vista.escala; zoomTexto(); todo();
      if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); }
      avisar(`Escena abierta: ${e.titulo}`, false);
    }).catch(err => avisar(err.message, false));
  }

  // ---------------------------------------------------------------------
  // Exportar: datos (CSV con toda la precisión) e imagen del lienzo
  // ---------------------------------------------------------------------
  function exportarCSV() {
    if (!SIM) { avisar('No hay datos: el circuito no se puede simular.', false); return; }
    const nodos = Object.entries(ESC.nodos), els = ESC.elementos.filter(e => e.tipo !== 'tierra');
    const cols = ['t (s)', ...nodos.map(([n]) => `V_${n} (V)`)];
    for (const e of els) {
      cols.push(`I_${e.id} (A)`, `v_${e.id} (V)`);
      if (e.tipo === 'capacitor') cols.push(`q_${e.id} (C)`, `U_${e.id} (J)`);
      if (e.tipo === 'inductor') cols.push(`U_${e.id} (J)`);
      if (e.tipo === 'bateria' || e.tipo === 'fuente-corriente') cols.push(`W_${e.id} (J)`);
      if (['resistencia', 'reostato', 'bombilla'].includes(e.tipo)) cols.push(`Q_${e.id} (J)`);
    }
    cols.push('W total (J)', 'U total (J)', 'Q total (J)', 'perdidas (J)', 'residuo (J)');
    const filas = SIM.muestras.map(m => {
      const f = [m.t, ...nodos.map(([, p]) => m.V[X.nodo(clave(p))])];
      for (const e of els) {
        const k = iDe(e.id); f.push(m.I[k], m.v[k]);
        if (e.tipo === 'capacitor') f.push(m.q[k], m.U[k]);
        if (e.tipo === 'inductor') f.push(m.U[k]);
        if (e.tipo === 'bateria' || e.tipo === 'fuente-corriente') f.push(m.W[k]);
        if (['resistencia', 'reostato', 'bombilla'].includes(e.tipo)) f.push(m.Q[k]);
      }
      const b = balance(SIM, m); f.push(b.W, b.U, b.Q, m.perdidas, b.residuo);
      return f;
    });
    descargarTexto(`${nombreArchivo(ESC.titulo)}-datos.csv`, aCSV(cols, filas))
      .then(r => { if (r) avisarLienzo(area, `Datos exportados: ${filas.length} filas`); }, e => avisar(`No se pudo exportar: ${e}`, false));
  }
  function exportarPNG() {
    descargarLienzo(lienzo, `${nombreArchivo(ESC.titulo)}-t${fmt(t / UT()[0], 3)}${UT()[1].replace('µ', 'u')}.png`).then(r => { if (r) avisarLienzo(area, 'Imagen del lienzo exportada'); });
  }
  $('#b-exportar').addEventListener('click', exportarCSV);

  // ---------------------------------------------------------------------
  // Reproducción
  // ---------------------------------------------------------------------
  function cuadro(ahora) {
    if (jugando) {
      const d = Math.min(0.05, (ahora - ultimo) / 1000) * velocidad * ritmo();
      t = Math.min(ESC.duracion, t + d);
      if (t >= ESC.duracion) jugando = false;
      todo();
    }
    ultimo = ahora;
    requestAnimationFrame(cuadro);
  }
  function alternar() { if (t >= ESC.duracion) t = 0; jugando = !jugando; todo(); }
  const irA = nt => { jugando = false; t = Math.max(0, Math.min(ESC.duracion, nt)); todo(); };
  $('#b-play').addEventListener('click', alternar);
  $('#b-reiniciar').addEventListener('click', () => irA(0));
  $('#b-atras').addEventListener('click', () => irA(t - ritmo() / 60));
  $('#b-adelante').addEventListener('click', () => irA(t + ritmo() / 60));
  $('#b-modo').addEventListener('click', () => cambiarModo(ESC.modo === 'ideal' ? 'realista' : 'ideal'));
  $('#velocidades').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) velocidad = parseFloat(b.dataset.v); });
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.capa; capas[k] = !capas[k]; b.setAttribute('aria-pressed', String(capas[k])); dibujar();
  }));
  $('#pest').addEventListener('click', () => setTimeout(todo, 0));

  // ---------------------------------------------------------------------
  // Lienzo: clic en interruptores, selección, edición, zoom y paneo
  // ---------------------------------------------------------------------
  function objetoEn(x, y) {
    for (const el of [...ESC.elementos].reverse()) {
      const [bx, by, bw, bh] = tz.circCaja(forma(el));
      if (x >= bx - 3 && x <= bx + bw + 3 && y >= by - 3 && y <= by + bh + 3) return 'el:' + el.id;
    }
    let mejor = null, dmin = 6;
    ESC.cables.forEach((poli, ip) => {
      for (let i = 0; i + 1 < poli.length; i++) {
        const [x1, y1] = tz.vista.P(poli[i]), [x2, y2] = tz.vista.P(poli[i + 1]);
        const L2 = (x2 - x1) ** 2 + (y2 - y1) ** 2, f = L2 ? Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / L2)) : 0;
        const d = Math.hypot(x - (x1 + f * (x2 - x1)), y - (y1 + f * (y2 - y1)));
        if (d < dmin) { dmin = d; mejor = 'cable:' + ip; }
      }
    });
    return mejor;
  }
  const rejilla = (x, y) => [Math.round(tz.vista.mx(x)), Math.round(tz.vista.my(y))];
  // Ruta en L de a a b: primero en horizontal, después en vertical
  const rutaL = (a, b) => [a, [b[0], a[1]], b];

  lienzo.addEventListener('pointerdown', ev => {
    const r = lienzo.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    if (ev.button === 1 || ev.button === 2 || espacioPulsado) { paneo = [x, y, tz.vista.ox, tz.vista.oy]; lienzo.setPointerCapture(ev.pointerId); return; }
    if (herramienta === 'cable') { const p = rejilla(x, y); cableEnCurso = { a: p, pts: [p, p, p] }; lienzo.setPointerCapture(ev.pointerId); return; }
    if (herramienta === 'nodo') { nombrarNodo(rejilla(x, y)); return; }
    if (herramienta && CAT[herramienta]) { colocar(herramienta, rejilla(x, y)); if (!ev.shiftKey) ponerHerramienta(herramienta); return; }
    const ob = objetoEn(x, y);
    if (herramienta === 'osciloscopio') { if (ob && ob.startsWith('el:')) alternarOsciloscopio(ob.slice(3)); return; }
    if (ob && ob.startsWith('el:')) {
      const el = elemento(ob.slice(3));
      arrastre = { id: el.id, x, y, p0: el.p.slice(), movido: false, interruptor: ES_INTERRUPTOR(el.tipo) };
      lienzo.setPointerCapture(ev.pointerId);
      if (sel !== ob) seleccionar(ob);
      return;
    }
    if (ob) { seleccionar(ob); return; }
    seleccionar(null);
    paneo = [x, y, tz.vista.ox, tz.vista.oy]; lienzo.setPointerCapture(ev.pointerId);
  });
  lienzo.addEventListener('pointermove', ev => {
    const r = lienzo.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    cursorMundo = [tz.vista.mx(x), tz.vista.my(y)];
    // Potencial del punto del circuito bajo el cursor
    const p = rejilla(x, y), k = X ? X.nodo(clave(p)) : -1, s = estado(t);
    $('#cv').textContent = s && k >= 0 ? cantidad(s.V[k], 'V') : '—';
    if (paneo) { vistaTocada = true; tz.vista.ox = paneo[2] + x - paneo[0]; tz.vista.oy = paneo[3] + y - paneo[1]; dibujar(); return; }
    if (cableEnCurso) { cableEnCurso.pts = rutaL(cableEnCurso.a, p); dibujar(); return; }
    if (arrastre) {
      const el = elemento(arrastre.id);
      if (!arrastre.movido && Math.hypot(x - arrastre.x, y - arrastre.y) < 5) return;
      arrastre.movido = true;
      const d = [Math.round((x - arrastre.x) / tz.vista.escala), Math.round((arrastre.y - y) / tz.vista.escala)];
      const np = [arrastre.p0[0] + d[0], arrastre.p0[1] + d[1]];
      if (np[0] !== el.p[0] || np[1] !== el.p[1]) { el.p = np; compilar(); dibujar(); }
      return;
    }
    if (herramienta) { dibujar(); return; }
    const ob = objetoEn(x, y);
    lienzo.style.cursor = ob ? 'pointer' : 'default';
    if (ob !== hover) { hover = ob; dibujar(); }
  });
  lienzo.addEventListener('pointerup', () => {
    if (cableEnCurso) {
      const [a, b, c] = cableEnCurso.pts; cableEnCurso = null;
      if (clave(a) !== clave(c)) {
        const poli = [a]; if (clave(b) !== clave(a) && clave(b) !== clave(c)) poli.push(b); poli.push(c);
        ESC.cables.push(poli); recalcular(); registrar();
      } else dibujar();
    }
    if (arrastre) {
      const a = arrastre; arrastre = null;
      if (a.movido) { recalcular(); registrar(); }
      else if (a.interruptor) alternarInterruptor(a.id);
    }
    paneo = null;
  });
  lienzo.addEventListener('pointerleave', () => { cursorMundo = null; if (hover) { hover = null; } dibujar(); });
  lienzo.addEventListener('contextmenu', ev => ev.preventDefault());
  lienzo.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = lienzo.getBoundingClientRect();
    vistaTocada = true; tz.vista.zoom(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top);
    zoomTexto(); dibujar();
  }, { passive: false });
  function zoomTexto() { $('#zoom').textContent = Math.round(tz.vista.escala / escala0 * 100) + ' %'; }
  function zoomCentro(f) { vistaTocada = true; tz.vista.zoom(f, tz.w / 2, tz.h / 2); zoomTexto(); dibujar(); }
  function encuadrarTodo() { vistaTocada = false; encuadrar(); escala0 = tz.vista.escala; zoomTexto(); dibujar(); }
  $('#b-zoom-mas').addEventListener('click', () => zoomCentro(1.25));
  $('#b-zoom-menos').addEventListener('click', () => zoomCentro(0.8));
  $('#b-encuadrar').addEventListener('click', encuadrarTodo);

  // ---------------------------------------------------------------------
  // Selector de escenarios
  // ---------------------------------------------------------------------
  const ICONO_TIPO = { Tutorial: 'i-tutorial', Ejemplo: 'i-ejemplo', MEXT: 'i-mext' };
  function menuEscenarios() {
    const m = $('#menu-escenarios');
    if (!m.hidden) { m.hidden = true; return; }
    const grupos = ['Tutorial', 'Ejemplo', 'MEXT'];
    // MEXT: del examen más reciente al más antiguo
    const orden = lista => lista.slice().sort((a, b) => (b.anio || '').localeCompare(a.anio || '', 'es', { numeric: true }));
    const TITULO = { Tutorial: 'Tutoriales', Ejemplo: 'Ejemplos', MEXT: 'MEXT' };
    m.innerHTML = grupos.map(g => `<div class="menu-titulo">${TITULO[g]}</div>` + orden(ESCENARIOS.filter(e => e.tipo === g)).map(e =>
      `<div class="menu-item${ESC.clave === e.clave ? ' activo' : ''}" role="menuitem" data-clave="${e.clave}"><svg class="ico"><use href="#${ICONO_TIPO[g]}"/></svg>${e.titulo}${e.anio ? `<span class="chip lleno">${e.anio}</span>` : ''}</div>`).join('')).join('');
    const r = $('#b-escenario').getBoundingClientRect();
    m.style.left = r.left + 'px'; m.style.top = (r.bottom + 6) + 'px'; m.hidden = false;
  }
  $('#b-escenario').addEventListener('click', ev => { ev.stopPropagation(); menuEscenarios(); });
  $('#menu-escenarios').addEventListener('click', ev => {
    const it = ev.target.closest('.menu-item'); if (!it) return;
    $('#menu-escenarios').hidden = true; abrirEscenario(it.dataset.clave);
  });
  document.addEventListener('pointerdown', ev => { if (!ev.target.closest('#menu-escenarios, #b-escenario')) $('#menu-escenarios').hidden = true; });

  // ---------------------------------------------------------------------
  // Teclado y paleta de comandos
  // ---------------------------------------------------------------------
  let espacioPulsado = false;
  const COMANDOS = [
    ['i-reproducir', 'Reproducir o pausar', 'Espacio', alternar],
    ['i-reiniciar', 'Reiniciar la simulación', 'Inicio', () => irA(0)],
    ...ESCENARIOS.map(e => [ICONO_TIPO[e.tipo], `Escenario: ${e.titulo}${e.anio ? ` (MEXT ${e.anio})` : ''}`, '', () => abrirEscenario(e.clave)]),
    ['o-cable', 'Conexiones ideales o realistas', 'M', () => cambiarModo(ESC.modo === 'ideal' ? 'realista' : 'ideal')],
    ['i-precision', 'Empezar en el estado estacionario o con las cargas dadas', '', () => { ESC.inicio = ESC.inicio === 'reposo' ? 'estacionario' : 'reposo'; recalcular(); registrar(); inspector(); avisar(ESC.inicio === 'reposo' ? 'Empieza con las cargas dadas' : 'Empieza en el estado estacionario', false); }],
    ['i-historial', 'Restablecer el escenario original', '', () => { const c = ESC.clave; if (ESCENARIOS.some(e => e.clave === c)) { abrirEscenario(c); avisar('Escenario original restablecido', false); } }],
    ['i-encuadrar', 'Encuadrar todo', 'F', encuadrarTodo],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['o-resistencia', 'Colocar una resistencia', '', () => ponerHerramienta('resistencia')],
    ['o-capacitor', 'Colocar un capacitor', '', () => ponerHerramienta('capacitor')],
    ['o-cable', 'Dibujar cables', 'W', () => ponerHerramienta('cable')],
    ['n-osciloscopio', 'Osciloscopio: elegir canales', '', () => ponerHerramienta('osciloscopio')],
    ['i-exportar', 'Exportar datos a CSV', '', exportarCSV],
    ['i-imagen', 'Exportar imagen del lienzo', '', exportarPNG],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar],
    ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
  ];
  let selCmd = 0;
  function pintarComandos() {
    const q = $('#cmd-q').value.trim().toLowerCase();
    const lista = COMANDOS.filter(c => c[1].toLowerCase().includes(q));
    selCmd = Math.min(selCmd, Math.max(0, lista.length - 1));
    $('#cmd-lista').innerHTML = '<div class="menu-titulo">Acciones</div>' + lista.map((c, i) =>
      `<div class="menu-item${i === selCmd ? ' activo' : ''}" data-i="${COMANDOS.indexOf(c)}"><svg class="ico"><use href="#${c[0]}"/></svg>${c[1]}<span class="atajo">${c[2]}</span></div>`).join('');
    return lista;
  }
  function abrirComandos() { $('#velo-comandos').hidden = false; $('#cmd-q').value = ''; selCmd = 0; pintarComandos(); $('#cmd-q').focus(); }
  function cerrarComandos() { $('#velo-comandos').hidden = true; }
  $('#b-comandos').addEventListener('click', abrirComandos);
  $('#cmd-q').addEventListener('input', () => { selCmd = 0; pintarComandos(); });
  $('#cmd-lista').addEventListener('click', ev => { const it = ev.target.closest('.menu-item'); if (it) { cerrarComandos(); COMANDOS[+it.dataset.i][3](); } });
  $('#velo-comandos').addEventListener('click', ev => { if (ev.target.id === 'velo-comandos') cerrarComandos(); });
  document.addEventListener('keydown', ev => {
    if (!$('#velo-comandos').hidden) {
      const lista = pintarComandos();
      if (ev.key === 'Escape') cerrarComandos();
      else if (ev.key === 'ArrowDown') { selCmd = Math.min(lista.length - 1, selCmd + 1); pintarComandos(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { selCmd = Math.max(0, selCmd - 1); pintarComandos(); ev.preventDefault(); }
      else if (ev.key === 'Enter' && lista[selCmd]) { cerrarComandos(); lista[selCmd][3](); }
      return;
    }
    const mod = ev.ctrlKey || ev.metaKey, tecla = ev.key.toLowerCase();
    if (mod && tecla === 'k') { ev.preventDefault(); abrirComandos(); return; }
    if (mod && tecla === 's') { ev.preventDefault(); guardar(); return; }
    if (mod && tecla === 'o') { ev.preventDefault(); abrir(); return; }
    if (ev.target instanceof Element && ev.target.matches('input:not([type=range]), textarea')) return;
    if (mod && (tecla === 'y' || (ev.shiftKey && tecla === 'z'))) { ev.preventDefault(); rehacer(); return; }
    if (mod && tecla === 'z') { ev.preventDefault(); deshacer(); return; }
    if (mod) return;
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) alternar(); espacioPulsado = true; }
    else if (ev.key === 'ArrowRight') irA(t + ritmo() / 60);
    else if (ev.key === 'ArrowLeft') irA(t - ritmo() / 60);
    else if (ev.key === 'Home') irA(0);
    else if (ev.key === 'Escape') { if (herramienta) ponerHerramienta(herramienta); $('#menu-escenarios').hidden = true; }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') borrarSeleccion();
    else if (tecla === 'r') rotarSeleccion();
    else if (tecla === 'f') encuadrarTodo();
    else if (tecla === 'm') cambiarModo(ESC.modo === 'ideal' ? 'realista' : 'ideal');
    else if (tecla === 'w') ponerHerramienta('cable');
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });

  // ---------------------------------------------------------------------
  // Arranque. Parámetros para capturas: ?escena=red&t=3.8&sel=C2&pestana=energia
  // (escenario= también vale); t en segundos
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); if (!vistaTocada) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search);
    const limpio = ![...q.keys()].length, pedida = q.get('escena') || q.get('escenario');
    const previa = escenaPendiente('circuitos') || (limpio ? autoguardado.leer('circuitos', { modulo: 'circuitos' }) : null);
    if (pedida || !previa) cargarEscenario(pedida || 'rc');
    else { ESC = datosSeguros(previa.datos); aplicarVariables(); sel = null; }
    if (q.has('sel')) sel = q.get('sel') ? 'el:' + q.get('sel') : null;
    if (q.get('modo') === 'realista') ESC.modo = 'realista';
    autoguardar = true;
    registrarDocumento({ clave: 'circuitos', escena: escenaActual, origen: (!pedida && previa) || null, abrir, guardar });
    titulo(); construirVariables();
    tz.ajustar(); encuadrar(); escala0 = tz.vista.escala;
    recalcular(); inspector(); zoomTexto();
    if (q.has('t')) t = Math.max(0, Math.min(ESC.duracion, parseFloat(q.get('t')) || 0));
    const pe = q.get('pestana'); if (pe) { const b = document.querySelector(`[aria-controls="p-${pe}"]`); if (b) b.click(); }
    todo();
    historial = new Historial(instantanea()); botonesHistorial();
    requestAnimationFrame(a => { ultimo = a; requestAnimationFrame(cuadro); });
  });
})();
