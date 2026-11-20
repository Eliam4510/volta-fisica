/* ==========================================================================
   Volta · Magnetismo e inducción — espacio de trabajo «Inducción»
   Barras sobre rieles (horizontales o inclinados, una o dos barras, barra
   oblicua), espiras rígidas que entran o salen de una región de campo o se
   mueven junto a un hilo, campos que varían con el tiempo, bobina giratoria
   (generador) y conductor abierto. La física está en el motor puro
   sistema/motores/magnetismo.js (probado en pruebas/magnetismo.test.js): el
   flujo es la intersección exacta del circuito con cada región (o la
   integral exacta del campo de un hilo), la fem es −dΦ/dt (de movimiento y de
   transformador), y la fuerza I·L × B entra con la gravedad, la fricción y
   las fuerzas aplicadas en un único sistema integrado con Dormand–Prince; la
   velocidad terminal y el balance de energía salen solos.
   Misma estructura que magnetismo.js y circuitos.js: escena → motor →
   lienzo → paneles, con transporte, línea de tiempo (la escena entera se ve
   en 8 s a 1×) y registro de energía.
   Parámetros de URL para capturas: ?escena=…&tema=…&sel=<id>|<id>:b<k>|escena
   &pest=energia|eventos|tabla&t=<fracción de la duración>&capas=…
   ========================================================================== */
import {
  MU0, G_GRAVEDAD, simularInduccion, estadoInduccion, balanceInduccion, velocidadTerminal, rectangulo, triangular,
  recortarConvexo, antihorario, valorVariable, campoHiloPlano, direccion, contiene,
} from '../motores/magnetismo.js';
import { aCSV } from '../nucleo/csv.js';
import { descargarTexto, descargarLienzo, nombreArchivo, avisar as avisarLienzo } from '../componentes/exportar.js';
import { crearEscena, numero, texto } from '../nucleo/escena.js';
import { Historial } from '../nucleo/historial.js';
import { evaluar } from '../nucleo/unidades.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';
import { registrarDocumento, confirmarCambios, documentoNuevo, hayCambios } from '../componentes/documento.js';

(function () {
  'use strict';
  const { Trazo, fmt, cantidad, conPrefijo, grafica, LineaTiempo, pasoAgradable, ESP } = Volta;
  const $ = s => document.querySelector(s);
  const GR = Math.PI / 180, DOS_PI = 2 * Math.PI;
  const FAC = { m: 1, cm: 1e-2, mm: 1e-3, km: 1e3, T: 1, mT: 1e-3, 'µT': 1e-6, 'T/s': 1, A: 1, 'A/s': 1, 'Ω': 1, H: 1, kg: 1, g: 1e-3, N: 1, 'm/s': 1, 'km/h': 1 / 3.6, '°': GR, '': 1, Hz: 1, s: 1 };
  const DIM_TS = [0, 1, -3, -1, 0, 0], DIM_AS = [0, 0, -1, 1, 0, 0];
  const numCampo = x => String(Number(Number(x).toPrecision(6))).replace('-', '−');
  const simHTML = (a, sub, recto = true) => `<span class="sim">${a}${sub ? `<sub${recto ? ' class="r"' : ''}>${sub}</sub>` : ''}</span>`;
  const dir = direccion;
  const grados = r => fmt(r / GR, 3) + '°';
  const SEG_PANTALLA = 8;  // segundos de reloj que dura la escena entera a 1×

  // ---------------------------------------------------------------------
  // Tipos de objeto
  // ---------------------------------------------------------------------
  const TIPOS = {
    region: { nombre: 'Región de campo B', en: 'Magnetic field region', ico: 'o-region-b' },
    hilo: { nombre: 'Hilo con corriente', en: 'Straight wire', ico: 'o-hilo-corriente' },
    rieles: { nombre: 'Rieles', en: 'Conducting rails', ico: 'o-rieles' },
    espira: { nombre: 'Espira móvil', en: 'Moving loop', ico: 'o-espira-movil' },
    generador: { nombre: 'Bobina giratoria', en: 'Rotating coil', ico: 'o-bobina-giratoria' },
    conductor: { nombre: 'Conductor abierto', en: 'Open conductor', ico: 'o-conductor' },
  };
  const ES_CIRCUITO = t => t === 'rieles' || t === 'espira' || t === 'generador' || t === 'conductor';

  // ---------------------------------------------------------------------
  // Escenas (mundo en m, SI)
  // ---------------------------------------------------------------------
  const vari = (sim, val, min, max, paso, u, factor, liga, o = {}) => ({ sim, sub: o.sub, val, min, max, paso, u, factor, liga, factores: o.factores });
  const region = (nombre, centro, ancho, alto, B, variacion = null) => ({ tipo: 'region', nombre, forma: 'rect', centro, ancho, alto, B, variacion });
  const barra = (nombre, s, m, o = {}) => ({ nombre, s, m, v: o.v ?? 0, r: o.r ?? 0, mu: o.mu ?? 0, F: o.F ?? 0, impuesta: !!o.impuesta, angulo: o.angulo ?? 0 });
  const rieles = (nombre, o) => ({ tipo: 'rieles', nombre, origen: o.origen ?? [0, 0], angulo: o.angulo ?? 0, separacion: o.d, largo: o.largo, cerrado: o.R != null, R: o.R ?? 1, L: o.L ?? 0, inclinacion: o.inclinacion ?? 0, bVertical: !!o.bVertical, barras: o.barras });
  const espira = (nombre, o) => ({ tipo: 'espira', nombre, centro: o.centro, ancho: o.ancho, alto: o.alto, N: o.N ?? 1, R: o.R, L: o.L ?? 0, m: o.m ?? 0.05, v: o.v ?? [0, 0], impuesta: o.impuesta ?? true, gravedad: !!o.gravedad, ejes: o.ejes ?? 'xy', vertices: o.vertices || null });
  const BASE = () => ({
    unidad: 'm', duracion: 2, elementos: [], variables: {}, regla: null,
    graficas: ['flujo', 'fem', 'corriente'], capas: { flujo: true, corriente: true, fuerzas: true, velocidad: true, lenz: true, medidores: true, valores: true },
    caja: null, sel: 'escena', nota: '',
  });
  const ESCENAS = [
    {
      clave: 'rieles', titulo: 'Barra que se mueve sobre rieles en un campo', tipo: 'Tutorial', duracion: 1.2, graficas: ['velocidad', 'corriente', 'flujo'],
      nota: 'La barra barre área dentro del campo: fem = B·d·v. La corriente I = B·d·v/R hace que el campo la frene con B·I·d; con una fuerza F constante llega a la velocidad terminal F·R/(B·d)².',
      elementos: [region('Región B', [1.05, 0], 2.3, 0.9, 1), rieles('Rieles', { d: 0.5, largo: 2.1, R: 1, barras: [barra('Barra', 0.2, 0.1, { F: 0.5 })] })],
      caja: [-0.25, 2.25, -0.55, 0.55], sel: 1,
      variables: { F: vari('F', 0.5, 0, 1.5, 0.05, 'N', 1, ['elementos.1.barras.0.F']), B: vari('B', 1, 0.2, 2, 0.05, 'T', 1, ['elementos.0.B']), R: vari('R', 1, 0.2, 4, 0.1, 'Ω', 1, ['elementos.1.R']) },
    },
    {
      clave: 'espira-entra', titulo: 'Espira que entra en una región de campo', tipo: 'Tutorial', duracion: 2,
      nota: 'Mientras entra, el flujo crece y la fem vale B·ℓ·v; dentro, el flujo no cambia y no hay corriente; al salir, la corriente se invierte. El sentido siempre se opone al cambio del flujo (Lenz).',
      elementos: [region('Región B', [0.3, 0], 0.6, 0.5, 0.5), espira('Espira', { centro: [-0.15, 0], ancho: 0.2, alto: 0.2, R: 0.5, v: [0.5, 0] })],
      caja: [-0.3, 0.75, -0.3, 0.3], sel: 1,
      variables: { v: vari('v', 0.5, 0.1, 1, 0.05, 'm/s', 1, ['elementos.1.v.0']), B: vari('B', 0.5, 0.1, 1.5, 0.05, 'T', 1, ['elementos.0.B']) },
    },
    {
      clave: 'rieles-inclinados', titulo: 'Barra que cae por rieles inclinados', tipo: 'Ejemplo', duracion: 2, graficas: ['velocidad', 'corriente', 'potencia'],
      nota: 'La componente del peso a lo largo de los rieles, m·g·sen θ, la acelera; la fuerza magnética crece con v hasta equilibrarla. A la velocidad terminal, todo el trabajo de la gravedad se vuelve calor de Joule.',
      elementos: [region('Región B', [1.2, 0], 2.6, 0.9, 1), rieles('Rieles', { d: 0.5, largo: 2.5, R: 1, inclinacion: 30 * GR, barras: [barra('Barra', 0.15, 0.05)] })],
      caja: [-0.3, 2.6, -0.55, 0.6], sel: 1,
      variables: { th: vari('θ', 30, 5, 60, 1, '°', GR, ['elementos.1.inclinacion']), B: vari('B', 1, 0.3, 2, 0.05, 'T', 1, ['elementos.0.B']), m: vari('m', 50, 10, 200, 5, 'g', 1e-3, ['elementos.1.barras.0.m']) },
    },
    {
      clave: 'generador', titulo: 'Generador conectado a una bombilla', tipo: 'Ejemplo', duracion: 2,
      nota: 'La bobina gira con ω constante: Φ = N·B·A·cos ωt y ε = N·B·A·ω·sen ωt. El motor que la hace girar entrega la energía que la bombilla convierte en calor y luz.',
      elementos: [{ tipo: 'generador', nombre: 'Bobina', centro: [0, 0], ancho: 0.1, alto: 0.1, N: 200, B: 0.2, frecuencia: 2, fase: 0, R: 10, L: 0, carga: 'bombilla' }],
      caja: [-0.14, 0.14, -0.13, 0.09], sel: 0,
      variables: { f: vari('f', 2, 0.5, 5, 0.1, 'Hz', 1, ['elementos.0.frecuencia']), N: vari('N', 200, 10, 500, 10, '', 1, ['elementos.0.N']), R: vari('R', 10, 1, 50, 1, 'Ω', 1, ['elementos.0.R']) },
    },
    {
      clave: 'campo-variable', titulo: 'Campo que crece sobre una espira quieta', tipo: 'Ejemplo', duracion: 3,
      nota: 'Nada se mueve: la fem es de transformador, ε = −A·dB/dt. Mientras B crece (hasta t = 2 s), la corriente crea un campo que se le opone; cuando B deja de cambiar, la corriente se apaga.',
      elementos: [region('Región B', [0, 0], 0.5, 0.4, 0, { tipo: 'rampa', pendiente: 0.5, inicio: 0, fin: 2 }), espira('Espira', { centro: [0, 0], ancho: 0.2, alto: 0.1, R: 0.5, v: [0, 0] })],
      caja: [-0.35, 0.35, -0.25, 0.25], sel: 1,
      variables: { k: vari('Ḃ', 0.5, -1, 1, 0.05, 'T/s', 1, ['elementos.0.variacion.pendiente']) },
    },
    {
      clave: 'espira-hilo-ca', titulo: 'Espira junto a un hilo con corriente alterna', tipo: 'Ejemplo', duracion: 0.1,
      nota: 'El campo del hilo, μ0·I/(2π·r), atraviesa la espira de forma desigual; el flujo exacto es μ0·I·h/(2π)·ln(r₂/r₁). Con I alterna, la fem inducida va desfasada un cuarto de periodo.',
      elementos: [{ tipo: 'hilo', nombre: 'Hilo', a: [0, 0], angulo: Math.PI / 2, I: 0, variacion: { tipo: 'senoidal', amplitud: 50, frecuencia: 20, fase: 0 } }, espira('Espira', { centro: [0.08, 0], ancho: 0.08, alto: 0.12, R: 0.01, v: [0, 0] })],
      caja: [-0.06, 0.16, -0.1, 0.1], sel: 1, unidad: 'cm',
      variables: { I: vari('I', 50, 5, 100, 1, 'A', 1, ['elementos.0.variacion.amplitud'], { sub: '0' }), r: vari('r', 8, 5, 14, 0.5, 'cm', 0.01, ['elementos.1.centro.0']) },
    },
    {
      clave: 'dos-barras', titulo: 'Dos barras sobre rieles: el momento se reparte', tipo: 'Ejemplo', duracion: 0.5, graficas: ['velocidad', 'corriente', 'flujo'],
      nota: 'Sin resistencia en los rieles, el circuito lo cierran las dos barras. La corriente frena a la rápida y empuja a la lenta (fuerzas iguales y opuestas): el momento total se conserva y terminan con la misma velocidad.',
      elementos: [region('Región B', [1.05, 0], 2.3, 0.9, 2), rieles('Rieles', { d: 0.5, largo: 2.1, R: null, barras: [barra('Barra 1', 0.4, 0.1, { r: 0.5 }), barra('Barra 2', 0.9, 0.3, { r: 0.5, v: 2 })] })],
      caja: [-0.2, 2.2, -0.55, 0.55], sel: 1,
      variables: { v: vari('v', 2, 0.5, 4, 0.1, 'm/s', 1, ['elementos.1.barras.1.v'], { sub: '2' }), m: vari('m', 0.1, 0.05, 0.5, 0.01, 'kg', 1, ['elementos.1.barras.0.m'], { sub: '1' }) },
    },
    // ----------------------------------------------------------------- MEXT
    {
      clave: 'mext-2027-1-4', titulo: 'Voltaje entre las alas de un avión', tipo: 'MEXT', anio: '2027 1-(4)', duracion: 1, graficas: ['fem', 'posicion', 'velocidad'],
      nota: 'V = v·B·L = 250 m/s × 4 × 10⁻⁴ T × 50 m = 5.0 V. Sin circuito cerrado no hay corriente: las cargas se separan hasta que su campo eléctrico equilibra a q·v·B.',
      elementos: [region('Campo terrestre', [0, 0], 2e4, 2e4, 4e-4), { tipo: 'conductor', nombre: 'Alas', centro: [0, 0], largo: 50, angulo: Math.PI / 2, v: [250, 0] }],
      caja: [-40, 300, -70, 70], sel: 1,
      variables: { v: vari('v', 900, 200, 1000, 10, 'km/h', 1 / 3.6, ['elementos.1.v.0']), B: vari('B', 400, 20, 600, 10, 'µT', 1e-6, ['elementos.0.B']), L: vari('L', 50, 10, 80, 1, 'm', 1, ['elementos.1.largo']) },
    },
    {
      clave: 'mext-2025-t3', titulo: 'Barra inclinada que se mueve en un campo', tipo: 'MEXT', anio: '2025 T3', duracion: 1.5, graficas: ['fem', 'corriente', 'fuerza'],
      nota: 'Reconstrucción propia (el banco solo da el tema). La fem depende de lo que la barra barre por segundo, d·v, no de su largo ℓ: ε = B·v·d. La fuerza magnética vale B·I·ℓ, perpendicular a la barra; a lo largo de los rieles, B·I·d.',
      elementos: [region('Región B', [1, 0], 2.2, 0.8, 0.5), rieles('Rieles', { d: 0.4, largo: 2, R: 2, barras: [barra('Barra', 0.3, 0.1, { v: 1, impuesta: true, angulo: 30 * GR })] })],
      caja: [-0.25, 2.1, -0.5, 0.5], sel: 1,
      variables: { phi: vari('φ', 30, 0, 60, 1, '°', GR, ['elementos.1.barras.0.angulo']), v: vari('v', 1, 0.2, 2, 0.05, 'm/s', 1, ['elementos.1.barras.0.v']) },
    },
    {
      clave: 'mext-2018-p2', titulo: 'Espira cuadrada que entra en el campo', tipo: 'MEXT', anio: '2018 P2', duracion: 0.3, unidad: 'cm',
      nota: '(1) Φ = v·B·l·t (c). (2) ε = v·B·l (b). (3) I = v·B·l/R (e). (4) a → b → c → d (a). (5) La fuerza externa que mantiene v vale v·B²·l²/R (d).',
      elementos: [{ ...region('Campo B', [0.15, 0], 0.3, 0.3, 0.8), forma: 'poligono', puntos: [[0, -0.15], [0.3, -0.15], [0.3, 0.15], [0, 0.15]] },
        espira('Espira abcd', { centro: [-0.05, 0], ancho: 0.1, alto: 0.1, R: 2, v: [0.5, 0], vertices: ['c', 'b', 'a', 'd'] })],
      caja: [-0.14, 0.22, -0.12, 0.12], sel: 1,
      variables: { v: vari('v', 0.5, 0.1, 1, 0.05, 'm/s', 1, ['elementos.1.v.0']), B: vari('B', 0.8, 0.1, 1.5, 0.05, 'T', 1, ['elementos.0.B']) },
    },
    {
      clave: 'mext-2015-p2', titulo: 'Barra en rieles inclinados con B vertical', tipo: 'MEXT', anio: '2015 P2', duracion: 2, graficas: ['velocidad', 'corriente', 'potencia'],
      nota: '(1) La corriente se opone al aumento del flujo: horaria vista desde arriba. (2) I = v·d·B·cos θ/R (f). (3) Fuerza a lo largo del plano v·d²·B²·cos²θ/R (c). (4) u = m·g·R·sen θ/(d²·B²·cos²θ) (e). (5) Potencia de la gravedad m²g²R·tan²θ/(d²B²) (e).',
      elementos: [region('Región B', [1.1, 0], 2.4, 0.9, 2), rieles('Rieles', { d: 0.5, largo: 2.2, R: 1, inclinacion: 30 * GR, bVertical: true, barras: [barra('Barra', 0.15, 0.1)] })],
      caja: [-0.3, 2.3, -0.55, 0.6], sel: 1,
      variables: { th: vari('θ', 30, 5, 60, 1, '°', GR, ['elementos.1.inclinacion']), B: vari('B', 2, 0.5, 3, 0.05, 'T', 1, ['elementos.0.B']) },
    },
    {
      clave: 'mext-2012-p2', titulo: 'Espira que cae saliendo de un campo horizontal', tipo: 'MEXT', anio: '2012 P2', duracion: 0.5, graficas: ['velocidad', 'corriente', 'potencia'],
      nota: '(1) I = B·v·L/R (d). (2) v = R·M·g/(B²L²) (c). (3) Calor por unidad de tiempo B²v²L²/R (c). (4) Con dos vueltas (R y M dobles) la rapidez es la misma: 1 (c). Prueba N = 2.',
      elementos: [{ ...region('Campo B', [0, 1.5], 2, 3, 1), forma: 'poligono', puntos: [[-1, 0], [1, 0], [1, 3], [-1, 3]] },
        espira('Espira', { centro: [0, 0.5], ancho: 0.2, alto: 1.2, R: 0.05, m: 0.02, v: [0, 0], impuesta: false, gravedad: true, ejes: 'y' })],
      caja: [-0.6, 0.6, -0.35, 1.25], sel: 1,
      variables: { N: vari('N', 1, 1, 2, 1, '', 1, ['elementos.1.N', 'elementos.1.R', 'elementos.1.m'], { factores: { 'elementos.1.R': 0.05, 'elementos.1.m': 0.02 } }), B: vari('B', 1, 0.5, 2, 0.05, 'T', 1, ['elementos.0.B']) },
    },
    {
      clave: 'mext-2010-4e', titulo: 'Espira que se aleja de un hilo recto', tipo: 'MEXT', anio: '2010 4-E', duracion: 0.1, unidad: 'cm',
      nota: 'I = 2μ0·a·b·v·I/(π·R·(r² − b²)) (b): la fem es la diferencia entre lo que «cortan» los lados AB y CD, a r − b y r + b del hilo. Al alejarse el flujo disminuye y la corriente lo refuerza.',
      elementos: [{ tipo: 'hilo', nombre: 'Hilo', a: [0, 0], angulo: Math.PI / 2, I: 20, variacion: null }, espira('Espira ABCD', { centro: [0.1, 0], ancho: 0.08, alto: 0.1, R: 0.1, v: [2, 0], vertices: ['B', 'C', 'D', 'A'] })],
      caja: [-0.04, 0.36, -0.12, 0.12], sel: 1,
      variables: { v: vari('v', 2, 0.5, 3, 0.1, 'm/s', 1, ['elementos.1.v.0']), I: vari('I', 20, 1, 50, 1, 'A', 1, ['elementos.0.I']) },
    },
    {
      clave: 'mext-2010-4f', titulo: 'Bobina que gira en un campo uniforme', tipo: 'MEXT', anio: '2010 4-F', duracion: 0.4,
      nota: 'En t = 0 la bobina está en el plano del papel: el flujo es máximo y la fem vale cero; después ε = N·B·A·ω·sen ωt, positiva en la primera media vuelta: la gráfica ③.',
      elementos: [{ tipo: 'generador', nombre: 'Bobina', centro: [0, 0], ancho: 0.1, alto: 0.1, N: 50, B: 0.2, frecuencia: 5, fase: 0, R: 10, L: 0, carga: 'resistencia' }],
      caja: [-0.14, 0.14, -0.13, 0.09], sel: 0,
      variables: { f: vari('f', 5, 1, 10, 0.5, 'Hz', 1, ['elementos.0.frecuencia']), B: vari('B', 0.2, 0.05, 1, 0.05, 'T', 1, ['elementos.0.B']) },
    },
  ];
  const completa = e => {
    const b = BASE(), o = JSON.parse(JSON.stringify({ ...b, ...e, capas: { ...b.capas, ...(e.capas || {}) } }));
    o.elementos.forEach((el, i) => { el.id = 'e' + (i + 1); if (!el.nombre) el.nombre = TIPOS[el.tipo].nombre; });
    if (typeof o.sel === 'number') o.sel = o.elementos[o.sel]?.id ?? 'escena';
    for (const d of Object.values(o.variables)) d.factores = d.factores || {};
    return o;
  };
  const escenaDe = clave => ESCENAS.find(e => e.clave === clave) || ESCENAS[0];

  // ---------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------
  /** @type {any} */ let ESC = completa(ESCENAS[0]);
  /** @type {any} */ let SIM = null;
  let CIRC = [], X = {}, ERROR = null;
  let t = 0, jugando = false, velocidad = 1, ultimo = 0;
  let sel = 'escena', herramienta = null, vistaTocada = false, escala0 = 1, espacioPulsado = false;
  let arrastre = null, paneo = null, hover = null;
  let autoguardar = false, historial = null, contador = 100;
  const lienzo = $('#lienzo'), area = $('#area');
  const tz = new Trazo(lienzo);
  const U = () => ESC.unidad || 'm', FU = () => FAC[U()];
  const L = (v, cifras = 4) => cantidad(v / FU(), U(), cifras);
  const elDe = id => ESC.elementos.find(e => e.id === String(id).split(':')[0]);
  const idxDe = id => ESC.elementos.findIndex(e => e.id === String(id).split(':')[0]);
  const barraSel = () => { const m = /^(e\d+):b(\d)$/.exec(sel || ''); return m ? { el: elDe(m[1]), k: +m[2] } : null; };

  // ---------------------------------------------------------------------
  // Escena → motor
  // ---------------------------------------------------------------------
  const poligonoDe = el => (el.forma === 'poligono' ? el.puntos.map(p => [p[0], p[1]]) : rectangulo(el.centro, el.ancho, el.alto));
  function circuitoDe(el) {
    switch (el.tipo) {
      case 'rieles': return {
        id: el.id, tipo: 'rieles', origen: el.origen, angulo: el.angulo, separacion: el.separacion, largo: el.largo, R: el.barras.length === 2 || !el.cerrado ? null : el.R, L: el.L,
        inclinacion: el.inclinacion, bVertical: el.bVertical, barras: el.barras.map(b => ({ id: b.nombre, nombre: b.nombre, s: b.s, v: b.v, m: b.m, r: b.r, mu: b.mu, F: b.F, vImpuesta: b.impuesta ? b.v : null, angulo: b.angulo })),
      };
      case 'espira': return { id: el.id, tipo: 'espira', centro: el.centro, ancho: el.ancho, alto: el.alto, N: el.N, R: el.R, L: el.L, m: el.m, v: el.v, vImpuesta: el.impuesta ? el.v : null, gravedad: el.gravedad ? [0, -G_GRAVEDAD] : [0, 0], ejes: el.ejes };
      case 'generador': return { id: el.id, tipo: 'generador', N: el.N, B: el.B, ancho: el.ancho, alto: el.alto, omega: DOS_PI * el.frecuencia, fase: el.fase, R: el.R, L: el.L };
      case 'conductor': return { id: el.id, tipo: 'conductor', centro: el.centro, largo: el.largo, angulo: el.angulo, v: el.v };
      default: return null;
    }
  }
  function simular() {
    X = {}; ERROR = null; SIM = null;
    CIRC = ESC.elementos.filter(e => ES_CIRCUITO(e.tipo));
    const regiones = ESC.elementos.filter(e => e.tipo === 'region').map(e => ({ id: e.id, nombre: e.nombre, poligono: poligonoDe(e), B: e.B, variacion: e.variacion || undefined }));
    const hilos = ESC.elementos.filter(e => e.tipo === 'hilo').map(e => ({ id: e.id, a: e.a, angulo: e.angulo, I: e.I, variacion: e.variacion || undefined }));
    if (!CIRC.length) { ERROR = 'Añade un circuito: rieles con una barra, una espira, una bobina o un conductor.'; return; }
    for (const r of CIRC) if (r.tipo === 'rieles' && r.barras.length === 2 && !(r.barras[0].r + r.barras[1].r > 0) && !(r.L > 0)) { ERROR = `«${r.nombre}»: con dos barras sin resistencia la corriente no está definida; da resistencia a las barras.`; return; }
    try {
      SIM = simularInduccion({ regiones, hilos, circuitos: CIRC.map(circuitoDe), duracion: ESC.duracion, dt: ESC.duracion / 400 });
    } catch (e) { SIM = null; ERROR = e.message; }
  }
  const Ben = (el, tt) => valorVariable(el.B, el.variacion, tt)[0];
  const Ien = (el, tt) => valorVariable(el.I, el.variacion, tt)[0];
  const hiloMotor = el => ({ a: el.a, u: dir(el.angulo), I: el.I });
  // B_z en un punto (regiones y hilos del plano)
  function campoZ(p, tt) {
    let B = 0;
    for (const el of ESC.elementos) {
      if (el.tipo === 'region' && contiene(poligonoDe(el), p)) B += Ben(el, tt);
      else if (el.tipo === 'hilo') { const I = Ien(el, tt); if (I) B += campoHiloPlano(hiloMotor(el), p, I); }
    }
    return B;
  }
  const estado = () => (SIM ? estadoInduccion(SIM, t) : null);
  const iCirc = el => CIRC.indexOf(el);
  function circSel() {
    if (!CIRC.length) return -1;
    const el = elDe(sel);
    if (el && ES_CIRCUITO(el.tipo)) return iCirc(el);
    return 0;
  }
  // Escalas comunes de los vectores y las energías (para toda la simulación)
  function escalas() {
    if (X.vref) return X;
    let v = 0, F = 0, E = 0;
    for (const m of SIM.muestras) for (const c of m.circuitos) {
      if (c.v) for (const x of c.v) v = Math.max(v, Math.abs(x));
      if (c.vel) v = Math.max(v, Math.hypot(c.vel[0], c.vel[1]));
      for (const f of c.fuerzas || []) F = Math.max(F, Math.hypot(f.F[0], f.F[1]));
      E = Math.max(E, Math.abs(c.QJ), Math.abs(c.K || 0), Math.abs(c.WF), Math.abs(c.Wg), Math.abs(c.Wext), Math.abs(c.Wcampo), Math.abs(c.UL || 0));
    }
    for (const el of CIRC) if (el.tipo === 'rieles') for (const b of el.barras) F = Math.max(F, Math.abs(b.F), b.m * G_GRAVEDAD * Math.sin(el.inclinacion));
    for (const el of CIRC) if (el.tipo === 'espira' && el.gravedad && !el.impuesta) F = Math.max(F, el.m * G_GRAVEDAD);
    X.vref = v || 1; X.fref = F || 1; X.eref = E || 1;
    return X;
  }

  // ---------------------------------------------------------------------
  // Geometría de dibujo
  // ---------------------------------------------------------------------
  const ejesRieles = el => { const u = dir(el.angulo); return { u, w: [-u[1], u[0]] }; };
  function extremosBarra(el, s, phi) {
    const { u, w } = ejesRieles(el), O = el.origen, h = el.separacion / 2, k = h * Math.tan(phi);
    return [[O[0] + (s - k) * u[0] - h * w[0], O[1] + (s - k) * u[1] - h * w[1]], [O[0] + (s + k) * u[0] + h * w[0], O[1] + (s + k) * u[1] + h * w[1]]];
  }
  const atrasRieles = el => Math.min(0.12 * el.largo, 26 / tz.vista.escala);
  // Camino de la corriente de unos rieles (antihorario), con la resistencia
  function caminoRieles(el, c) {
    if (el.barras.length === 2) return c.pts;
    if (!el.cerrado) return null;
    const { u, w } = ejesRieles(el), O = el.origen, h = el.separacion / 2, a = atrasRieles(el);
    const [p1, p2] = extremosBarra(el, c.s[0], el.barras[0].angulo);
    return [[O[0] - a * u[0] - h * w[0], O[1] - a * u[1] - h * w[1]], [O[0] - h * w[0], O[1] - h * w[1]], p1, p2, [O[0] + h * w[0], O[1] + h * w[1]], [O[0] - a * u[0] + h * w[0], O[1] - a * u[1] + h * w[1]]];
  }
  const anguloGen = (el, tt) => DOS_PI * el.frecuencia * tt + el.fase;
  function puntosDe(el) {
    switch (el.tipo) {
      case 'region': return poligonoDe(el);
      case 'hilo': return [el.a];
      case 'rieles': { const { u, w } = ejesRieles(el), O = el.origen, h = el.separacion / 2, a = atrasRieles(el); return [[O[0] - a * u[0] - h * w[0], O[1] - a * u[1] - h * w[1]], [O[0] + el.largo * u[0] - h * w[0], O[1] + el.largo * u[1] - h * w[1]], [O[0] + el.largo * u[0] + h * w[0], O[1] + el.largo * u[1] + h * w[1]], [O[0] - a * u[0] + h * w[0], O[1] - a * u[1] + h * w[1]]]; }
      case 'espira': return rectangulo(el.centro, el.ancho, el.alto);
      case 'generador': return [[el.centro[0] - el.ancho * 0.8, el.centro[1] - el.alto * 1.25], [el.centro[0] + el.ancho * 0.8, el.centro[1] + el.alto * 0.7]];
      case 'conductor': { const d = dir(el.angulo); return [[el.centro[0] - d[0] * el.largo / 2, el.centro[1] - d[1] * el.largo / 2], [el.centro[0] + d[0] * el.largo / 2, el.centro[1] + d[1] * el.largo / 2]]; }
      default: return [];
    }
  }
  function cajaEscena(margen = 0.25) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const el of ESC.elementos) if (el.tipo !== 'region' || ESC.elementos.length === 1) for (const p of puntosDe(el)) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    if (!Number.isFinite(x0)) return [-1, 1, -1, 1];
    const m = margen * Math.max(x1 - x0, y1 - y0, 0.02);
    return [x0 - m, x1 + m, y0 - m, y1 + m];
  }
  function encuadrar() {
    const caja = ESC.caja || cajaEscena();
    tz.vista.encuadrar({ x0: caja[0], x1: caja[1], y0: caja[2], y1: caja[3] }, { x: 0, y: 0, w: tz.w, h: tz.h }, 48);
  }

  // ---------------------------------------------------------------------
  // Dibujo
  // ---------------------------------------------------------------------
  let ETQ = [];
  function dibujar() {
    // La barra de escala (abajo a la izquierda) también es zona reservada
    const v = tz.vista, est = estado(), ocupados = [...tz.zonasFlotantes(), { x: 8, y: tz.h - 84, w: 190, h: 40 }];
    // Materia reservada: rieles, barras, espiras, conductores (sus etiquetas van fuera)
    ESC.elementos.forEach(el => {
      if (!ES_CIRCUITO(el.tipo) && el.tipo !== 'hilo') return;
      if (el.tipo === 'hilo') { const [x, y] = v.P(el.a); ocupados.push({ x: x - 10, y: y - 10, w: 20, h: 20 }); return; }
      for (const [a, b] of segmentosMateria(el, est)) { const A = v.P(a), B = v.P(b); ocupados.push({ x: Math.min(A[0], B[0]) - 7, y: Math.min(A[1], B[1]) - 7, w: Math.abs(B[0] - A[0]) + 14, h: Math.abs(B[1] - A[1]) + 14 }); }
    });
    tz.limpiar(); tz.magnetismoEtiquetas(ocupados);
    // Croquis de perfil de los rieles inclinados (arriba a la izquierda)
    const incl = CIRC.find(e => e.tipo === 'rieles' && e.inclinacion > 0);
    let perfil = null;
    if (incl) { perfil = { x: 12, y: 12 }; tz.magnetismoOcupar(8, 8, 146, 100); }
    tz.cuadricula();
    tz.magnetismoEjes({ unidad: U(), factor: 1 / FU() });
    // Etiquetas de las regiones y de los vectores: se reservan antes de las
    // rejillas de ⊙/⊗, que dejan libre su sitio, y se escriben al final
    ETQ = ESC.capas.valores ? ESC.elementos.filter(e => e.tipo === 'region').map(sitioRegion).filter(Boolean) : [];
    if (ESC.capas.valores) planearEtiquetas(est);

    // 4 · Regiones con B(t); el tamaño de los ⊙/⊗ sigue a |B(t)|
    for (const el of ESC.elementos) {
      if (el.tipo !== 'region') continue;
      const pts = poligonoDe(el), Bt = Ben(el, t), Bmax = maxB(el);
      tz.magnetismoRegion(pts, { tipo: 'B', B: 0, grueso: hover === el.id });
      if (Bt) tz.magnetismoRejilla(() => Bt, { recorte: pts, libres: true, Bref: el.variacion ? Bmax : undefined, minimo: 0.03 });
    }
    // Campo de los hilos (rejilla en toda la vista) y los hilos
    const hilos = ESC.elementos.filter(e => e.tipo === 'hilo');
    if (hilos.length) {
      const ref = refHilos();
      if (ref > 0) tz.magnetismoRejilla((x, y) => hilos.reduce((s, h) => s + campoHiloPlano(hiloMotor(h), [x, y], Ien(h, t)), 0), { Bref: ref, minimo: 0.12, libres: true, evitar: hilos.map(h => { const [x, y] = v.P(h.a); return [x, y, 14]; }) });
    }
    // Generador: su campo uniforme alrededor de la bobina
    for (const el of ESC.elementos) if (el.tipo === 'generador' && el.B) { const pts = rectangulo([el.centro[0], el.centro[1] + el.alto * 0.05], el.ancho * 2.2, el.alto * 1.6); tz.magnetismoRegion(pts, { tipo: 'B', B: 0 }); tz.magnetismoRejilla(() => el.B, { recorte: pts, libres: true }); }
    // Área del circuito dentro del campo (el flujo)
    if (ESC.capas.flujo && est) CIRC.forEach((el, i) => { if (el.tipo !== 'generador' && el.tipo !== 'conductor') tz.magnetismoAreaFlujo(areaEnCampo(est.circuitos[i].pts)); });
    for (const el of hilos) { const [a, b] = extremosHilo(el); tz.magnetismoConductor(a, b, Ien(el, t), { grueso: hover === el.id, paso: 150 }); }
    // 6 · Circuitos
    if (est) CIRC.forEach((el, i) => dibujarCircuito(el, est.circuitos[i]));
    else for (const el of CIRC) dibujarCircuitoQuieto(el);
    if (perfil) tz.magnetismoPerfil(perfil.x, perfil.y, incl.inclinacion, { bVertical: incl.bVertical });
    dibujarRegla();
    if (ESC.capas.valores) dibujarValores(est);
    dibujarSeleccion(est);
    tz.magnetismoBarraEscala(16, tz.h - 56, U(), 1 / FU());
  }
  const maxB = el => { if (!el.variacion) return Math.abs(el.B); let m = 0; for (let i = 0; i <= 50; i++) m = Math.max(m, Math.abs(Ben(el, ESC.duracion * i / 50))); return m || 1; };
  function refHilos() {
    const v = tz.vista, hilos = ESC.elementos.filter(e => e.tipo === 'hilo'), Imax = Math.max(...hilos.map(h => { let m = Math.abs(h.I); if (h.variacion) for (let i = 0; i <= 40; i++) m = Math.max(m, Math.abs(Ien(h, ESC.duracion * i / 40))); return m; }));
    return MU0 * Imax / (DOS_PI * (60 / v.escala));
  }
  function extremosHilo(el) { const d = dir(el.angulo), R = 2 * Math.hypot(tz.w, tz.h) / tz.vista.escala; return [[el.a[0] - d[0] * R, el.a[1] - d[1] * R], [el.a[0] + d[0] * R, el.a[1] + d[1] * R]]; }
  // Polígonos de la intersección del circuito con cada región con campo
  function areaEnCampo(pts) {
    if (!pts || pts.length < 3) return [];
    const P = antihorario(pts), r = [];
    for (const el of ESC.elementos) {
      if (el.tipo === 'region' && Ben(el, t)) for (const tri of triangular(antihorario(poligonoDe(el)))) { const q = recortarConvexo(P, tri); if (q.length >= 3) r.push(q); }
      if (el.tipo === 'hilo' && Ien(el, t)) r.push(P);
    }
    return r;
  }
  // Tramos de materia de un circuito (para reservar su sitio)
  function segmentosMateria(el, est) {
    const c = est ? est.circuitos[iCirc(el)] : null;
    if (el.tipo === 'rieles') {
      const { u, w } = ejesRieles(el), O = el.origen, h = el.separacion / 2, Lr = el.largo;
      const r = [[[O[0] - h * w[0], O[1] - h * w[1]], [O[0] + Lr * u[0] - h * w[0], O[1] + Lr * u[1] - h * w[1]]], [[O[0] + h * w[0], O[1] + h * w[1]], [O[0] + Lr * u[0] + h * w[0], O[1] + Lr * u[1] + h * w[1]]]];
      el.barras.forEach((b, k) => r.push(extremosBarra(el, c ? c.s[k] : b.s, b.angulo)));
      return r;
    }
    if (el.tipo === 'espira') { const P = c ? c.pts : rectangulo(el.centro, el.ancho, el.alto); return P.map((p, k) => [p, P[(k + 1) % P.length]]); }
    if (el.tipo === 'conductor') { const m = c ? c.moviles[0] : null; return m ? [[m.a, m.b]] : [puntosDe(el)]; }
    if (el.tipo === 'generador') { const g = geomGenerador(el, t); return g.esq.map((p, k) => [p, g.esq[(k + 1) % 4]]); }
    return [];
  }
  function geomGenerador(el, tt) {
    const c = el.centro, w = el.ancho / 2 * Math.cos(anguloGen(el, tt)), h = el.alto / 2;
    const esq = [[c[0] - w, c[1] - h], [c[0] + w, c[1] - h], [c[0] + w, c[1] + h], [c[0] - w, c[1] + h]];
    const yR = c[1] - el.alto * 1.05, carga = [[c[0] - el.ancho * 0.35, yR], [c[0] + el.ancho * 0.35, yR]];
    return { esq, carga, eje: [[c[0], c[1] - h], [c[0], c[1] - el.alto * 0.72]] };
  }
  function dibujarCircuitoQuieto(el) {
    const g = hover === el.id;
    if (el.tipo === 'rieles') { const { u, w } = ejesRieles(el); tz.magnetismoRieles({ origen: el.origen, u, w, d: el.separacion, largo: el.largo, R: el.cerrado && el.barras.length < 2 ? el.R : null }, { grueso: g }); el.barras.forEach(b => { const [a, c] = extremosBarra(el, b.s, b.angulo); tz.magnetismoBarra(a, c); }); }
    else if (el.tipo === 'espira') tz.magnetismoEspira(rectangulo(el.centro, el.ancho, el.alto), { grueso: g });
    else if (el.tipo === 'conductor') { const [a, b] = puntosDe(el); tz.magnetismoBarra(a, b); }
    else if (el.tipo === 'generador') tz.magnetismoBobina(el.centro, el.ancho, el.alto, el.fase, { grueso: g });
  }
  function dibujarCircuito(el, c) {
    const v = tz.vista, E = escalas(), g = hover === el.id, umbral = 1e-6 * maxI(iCirc(el));
    if (el.tipo === 'rieles') {
      const { u, w } = ejesRieles(el);
      tz.magnetismoRieles({ origen: el.origen, u, w, d: el.separacion, largo: el.largo, R: el.cerrado && el.barras.length < 2 ? el.R : null }, { grueso: g });
      el.barras.forEach((b, k) => { const [a, q] = extremosBarra(el, c.s[k], b.angulo); tz.magnetismoBarra(a, q, { grueso: hover === `${el.id}:b${k}` }); });
      const cam = caminoRieles(el, c);
      if (ESC.capas.corriente && cam && Math.abs(c.I) > umbral) tz.magnetismoCorriente(cam, c.I, { paso: 96 });
      el.barras.forEach((b, k) => {
        const [a, q] = extremosBarra(el, c.s[k], b.angulo), m = [(a[0] + q[0]) / 2, (a[1] + q[1]) / 2], vk = c.v[k];
        if (ESC.capas.velocidad && Math.abs(vk) > 1e-9 * E.vref) { const Lp = Math.max(12, 46 * Math.abs(vk) / E.vref); tz.vector(m, [u[0] * vk, u[1] * vk], { familia: 'movimiento', escalaPx: Lp / Math.abs(vk), desdeRadio: 6 }); }
        if (ESC.capas.fuerzas) {
          const f = c.fuerzas.find(x => x.cuerpo === k);
          if (f) { const Fm = Math.hypot(f.F[0], f.F[1]); if (Fm > 1e-9 * E.fref) { const Lp = Math.max(12, 44 * Fm / E.fref); const desp = [w[0] * 10 / v.escala, w[1] * 10 / v.escala]; tz.vector([m[0] + desp[0], m[1] + desp[1]], f.F, { familia: 'interaccion', escalaPx: Lp / Fm, desdeRadio: 4 }); } }
          if (b.F && !b.impuesta) { const Lp = Math.max(12, 44 * Math.abs(b.F) / E.fref); const desp = [-w[0] * 10 / v.escala, -w[1] * 10 / v.escala]; tz.vector([m[0] + desp[0], m[1] + desp[1]], [u[0] * b.F, u[1] * b.F], { familia: 'interaccion', escalaPx: Lp / Math.abs(b.F), desdeRadio: 4 }); }
          const Fg = b.m * G_GRAVEDAD * Math.sin(el.inclinacion);
          if (Fg > 0 && !b.impuesta) { const Lp = Math.max(12, 44 * Fg / E.fref); const desp = [-w[0] * 10 / v.escala, -w[1] * 10 / v.escala]; tz.vector([m[0] + desp[0], m[1] + desp[1]], [u[0] * Fg, u[1] * Fg], { familia: 'interaccion', escalaPx: Lp / Fg, desdeRadio: 4 }); }
        }
      });
    } else if (el.tipo === 'espira') {
      tz.magnetismoEspira(c.pts, { grueso: g });
      if (ESC.capas.corriente && Math.abs(c.I) > umbral) tz.magnetismoCorriente(c.pts, c.I, { paso: 90 });
      const s = Math.hypot(c.vel[0], c.vel[1]);
      if (ESC.capas.velocidad && s > 1e-9 * E.vref) { const Lp = Math.max(12, 46 * s / E.vref); tz.vector(c.centro, c.vel, { familia: 'movimiento', escalaPx: Lp / s, desdeRadio: 6 }); }
      if (ESC.capas.fuerzas) {
        // Fuerza magnética sobre cada lado, en su punto medio (la neta va en las lecturas)
        for (const f of ladosConFuerza(c)) { const Fm = Math.hypot(f.F[0], f.F[1]), Lp = Math.max(12, 44 * Fm / E.fref); tz.vector(f.m, f.F, { familia: 'interaccion', escalaPx: Lp / Fm, desdeRadio: 3 }); }
        if (el.gravedad && !el.impuesta) { const Fg = el.m * G_GRAVEDAD, Lp = Math.max(12, 44 * Fg / E.fref), off = [12 / v.escala, 0]; tz.vector([c.centro[0] + off[0], c.centro[1]], [0, -Fg], { familia: 'interaccion', escalaPx: Lp / Fg, desdeRadio: 6 }); }
      }
    } else if (el.tipo === 'conductor') {
      const m = c.moviles[0];
      tz.magnetismoBarra(m.a, m.b, { grueso: g });
      tz.magnetismoCargasExtremos(m.a, m.b, Math.sign(c.fem));
      const s = Math.hypot(c.vel[0], c.vel[1]);
      if (ESC.capas.velocidad && s > 0) { const Lp = 46; tz.vector(c.centro, c.vel, { familia: 'movimiento', escalaPx: Lp / s, desdeRadio: 6 }); }
    } else if (el.tipo === 'generador') {
      const G = geomGenerador(el, t), [xc] = v.P(el.centro);
      tz.magnetismoBobina(el.centro, el.ancho, el.alto, anguloGen(el, t), { grueso: g });
      // Escobillas y carga
      const [eA, eB] = G.eje, [ra, rb] = G.carga, yE = eB[1];
      tz.linea([[eA[0], eA[1]], [eB[0], yE]], { color: 'tinta', grosor: 2 });
      tz.linea([[ra[0], yE], [rb[0], yE]], { color: 'tinta', grosor: 2 });
      tz.linea([[ra[0], yE], ra], { color: 'tinta', grosor: 2 }); tz.linea([[rb[0], yE], rb], { color: 'tinta', grosor: 2 });
      const mR = tz.magnetismoResistencia(ra, rb);
      if (el.carga === 'bombilla' && mR) { const c2 = tz.ctx; c2.save(); c2.strokeStyle = tz.t.tinta; c2.lineWidth = 1.25; c2.beginPath(); c2.moveTo(mR[0] - 4, mR[1] - 3); c2.lineTo(mR[0] + 4, mR[1] + 3); c2.moveTo(mR[0] + 4, mR[1] - 3); c2.lineTo(mR[0] - 4, mR[1] + 3); c2.stroke(); c2.restore(); }
      if (ESC.capas.corriente && Math.abs(c.I) > umbral) {
        // En la carga: de izquierda a derecha si I > 0 (sentido positivo de la fem)
        tz.magnetismoCorriente([[ra[0], yE], ra, rb, [rb[0], yE]], c.I > 0 ? -1 : 1, { paso: 120 });
      }
      void xc;
    }
  }
  // Lados de una espira con fuerza magnética apreciable: punto medio y fuerza
  function ladosConFuerza(c) {
    const fs = (c.fuerzas || []).map(f => ({ m: [(f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2], F: f.F, mod: Math.hypot(f.F[0], f.F[1]) })), max = Math.max(0, ...fs.map(f => f.mod));
    return max > 0 ? fs.filter(f => f.mod > 1e-3 * max) : [];
  }
  const maxI = i => { if (X['I' + i] != null) return X['I' + i]; let m = 0; for (const s of SIM.muestras) m = Math.max(m, Math.abs(s.circuitos[i].I)); return (X['I' + i] = m || 1e-30); };
  function dibujarRegla() {
    if (!ESC.regla) return;
    const [a, b] = ESC.regla, v = tz.vista, [x1, y1] = v.P(a), [x2, y2] = v.P(b);
    if (Math.hypot(x2 - x1, y2 - y1) > 4) tz.flechaPx(x1, y1, x2, y2, { color: 'texto-2', grosor: 1, punta: 'abierta', ambas: true });
    tz.asa(x1, y1); tz.asa(x2, y2);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    tz.magnetismoFicha([[{ t: 'd', f: 'sim', tam: 13 }, { t: ' = ' + L(d), f: 'num', tam: 11.5 }], [{ t: 'ángulo ' + grados(ang), f: 'num', tam: 11 }]], [[(x1 + x2) / 2 + 10, (y1 + y2) / 2 - 34], [(x1 + x2) / 2 + 10, (y1 + y2) / 2 + 10], [(x1 + x2) / 2 - 130, (y1 + y2) / 2 - 34]], [(x1 + x2) / 2, (y1 + y2) / 2]);
    if (sel === 'regla') tz.seleccionCaja(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  }
  // Etiqueta de una región: B (y su variación) en una esquina
  function sitioRegion(el) {
    const v = tz.vista, pts = poligonoDe(el).map(p => v.P(p)), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.max(Math.min(...xs), 8), y0 = Math.max(Math.min(...ys), 8), x1 = Math.min(Math.max(...xs), tz.w - 8), y1 = Math.min(Math.max(...ys), tz.h - 8);
    const Bt = Ben(el, t);
    const segs = [{ t: 'B', f: 'sim', tam: 13, color: 'magnetico' }, { t: ' = ' + conPrefijo(Math.abs(Bt), 'T', 3) + (Bt > 0 ? ' ⊙' : Bt < 0 ? ' ⊗' : ''), f: 'num', tam: 11, color: 'texto-2' }];
    if (el.variacion?.tipo === 'rampa') segs.push({ t: `  dB/dt = ${conPrefijo(valorVariable(el.B, el.variacion, t)[1], 'T/s', 3)}`, f: 'num', tam: 11, color: 'texto-3' });
    if (el.variacion?.tipo === 'senoidal') segs.push({ t: '  alterno', f: 'ui', tam: 11, color: 'texto-3' });
    const dentro = [[x0 + 8, y0 + 20, 'left'], [x1 - 8, y0 + 20, 'right'], [x0 + 8, y1 - 8, 'left'], [x1 - 8, y1 - 8, 'right']];
    const fuera = [[x0 + 4, y0 - 8, 'left'], [x1 - 4, y0 - 8, 'right'], [x0 + 4, y1 + 20, 'left'], [x1 - 4, y1 + 20, 'right']];
    for (const [x, y, al] of y1 - y0 < 60 ? [...fuera, ...dentro] : [...dentro, ...fuera]) if (tz.magnetismoReservar(segs, x, y, al)) return { el, segs, x, y, al };
    return null;
  }
  // Coloca una etiqueta en el primer candidato libre y la deja para el final
  function colocar(segs, cands) { for (const [x, y, al] of cands) if (tz.magnetismoReservar(segs, x, y, al || 'left')) { ETQ.push({ segs, x, y, al: al || 'left' }); return true; } return false; }
  // Tramos (px) de los vectores que se dibujan: sus cuerpos quedan reservados para que ninguna etiqueta los tape
  function vectoresPx(est) {
    if (!est) return [];
    const v = tz.vista, E = escalas(), r = [], px = (p, d, Lp, r0 = 6) => { const m = Math.hypot(d[0], d[1]); if (!(m > 0)) return; const [x, y] = v.P(p), ux = d[0] / m, uy = -d[1] / m; r.push([x + ux * r0, y + uy * r0, x + ux * (r0 + Lp), y + uy * (r0 + Lp)]); };
    CIRC.forEach((el, i) => {
      const c = est.circuitos[i];
      if (el.tipo === 'rieles') {
        const { u, w } = ejesRieles(el);
        el.barras.forEach((b, k) => {
          const [a, q] = extremosBarra(el, c.s[k], b.angulo), m = [(a[0] + q[0]) / 2, (a[1] + q[1]) / 2], vk = c.v[k], f = c.fuerzas.find(x => x.cuerpo === k), off = 10 / v.escala;
          if (ESC.capas.velocidad && Math.abs(vk) > 1e-9 * E.vref) px(m, [u[0] * vk, u[1] * vk], Math.max(12, 46 * Math.abs(vk) / E.vref));
          if (ESC.capas.fuerzas && f) { const Fm = Math.hypot(f.F[0], f.F[1]); if (Fm > 1e-9 * E.fref) px([m[0] + w[0] * off, m[1] + w[1] * off], f.F, Math.max(12, 44 * Fm / E.fref), 4); }
          const Fg = b.m * G_GRAVEDAD * Math.sin(el.inclinacion), Fa = b.impuesta ? 0 : Math.max(Math.abs(b.F), Fg);
          if (ESC.capas.fuerzas && Fa > 0) px([m[0] - w[0] * off, m[1] - w[1] * off], [u[0] * Math.sign(b.F || 1), u[1] * Math.sign(b.F || 1)], Math.max(12, 44 * Fa / E.fref), 4);
        });
      } else if (el.tipo === 'espira') {
        const s = Math.hypot(c.vel[0], c.vel[1]);
        if (ESC.capas.velocidad && s > 1e-9 * E.vref) px(c.centro, c.vel, Math.max(12, 46 * s / E.vref));
        if (ESC.capas.fuerzas) for (const f of ladosConFuerza(c)) px(f.m, f.F, Math.max(12, 44 * f.mod / E.fref), 3);
        if (ESC.capas.fuerzas && el.gravedad && !el.impuesta) px([c.centro[0] + 12 / v.escala, c.centro[1]], [0, -1], Math.max(12, 44 * el.m * G_GRAVEDAD / E.fref));
      } else if (el.tipo === 'conductor' && ESC.capas.velocidad) px(c.centro, c.vel, 46);
    });
    return r;
  }
  function planearEtiquetas(est) {
    const v = tz.vista, i0 = circSel();
    for (const [x1, y1, x2, y2] of vectoresPx(est)) tz.magnetismoOcupar(Math.min(x1, x2) - 4, Math.min(y1, y2) - 4, Math.abs(x2 - x1) + 8, Math.abs(y2 - y1) + 8);
    for (const el of ESC.elementos) if (el.tipo === 'hilo') {
      // A un lado del hilo (en pantalla), nunca encima de él
      const [x, y] = v.P(el.a), I = Ien(el, t), d = dir(el.angulo), ds = [d[0], -d[1]], ps = [-ds[1], ds[0]], segs = [{ t: 'I', f: 'sim', tam: 13, color: 'corriente' }, { t: ' = ' + conPrefijo(I, 'A', 3), f: 'num', tam: 11, color: 'texto-2' }];
      const lado = (k, a) => [x + ps[0] * 12 * k + ds[0] * a, y + ps[1] * 12 * k + ds[1] * a + 4, ps[0] * k >= 0 ? 'left' : 'right'];
      colocar(segs, [lado(1, -40), lado(-1, -40), lado(1, 40), lado(-1, 40), lado(1, -90), lado(-1, -90)]);
    }
    // Campo de las bobinas giratorias
    for (const el of ESC.elementos) if (el.tipo === 'generador' && el.B) {
      const P = rectangulo([el.centro[0], el.centro[1] + el.alto * 0.05], el.ancho * 2.2, el.alto * 1.6).map(q => v.P(q)), x0 = Math.min(...P.map(q => q[0])), y0 = Math.min(...P.map(q => q[1])), x1 = Math.max(...P.map(q => q[0]));
      colocar([{ t: 'B', f: 'sim', tam: 13, color: 'magnetico' }, { t: ' = ' + conPrefijo(Math.abs(el.B), 'T', 3) + (el.B > 0 ? ' ⊙' : ' ⊗'), f: 'num', tam: 11, color: 'texto-2' }], [[x0 + 8, y0 + 20, 'left'], [x1 - 8, y0 + 20, 'right'], [x0 + 4, y0 - 8, 'left']]);
    }
    if (!est || i0 < 0) return;
    // Letras de los vértices de las espiras (como en la figura del examen)
    CIRC.forEach((el, i) => {
      if (el.tipo !== 'espira' || !el.vertices) return;
      const c = est.circuitos[i], [cx, cy] = v.P(c.centro);
      c.pts.forEach((p, k) => { const [x, y] = v.P(p), d = Math.hypot(x - cx, y - cy) || 1, X0 = x + (x - cx) / d * 16, Y0 = y + (y - cy) / d * 16 + 5; colocar([{ t: el.vertices[k] || '', f: 'sim', tam: 14, color: 'texto' }], [[X0, Y0, 'center'], [X0 + (x > cx ? 8 : -8), Y0, 'center'], [X0, Y0 + (y > cy ? 8 : -8), 'center']]); });
    });
    if (ESC.capas.fuerzas) etiquetasFuerzas(CIRC[i0], est.circuitos[i0]);
    if (ESC.capas.velocidad) etiquetasVelocidad(CIRC[i0], est.circuitos[i0]);
  }
  function dibujarValores(est) {
    const i0 = circSel();
    for (const q of ETQ) tz.compuesto(q.segs, q.x, q.y, { alinear: q.al, color: 'texto-2' });
    if (!est) return;
    // Primero la explicación de Lenz (la más importante), después los medidores
    if (ESC.capas.lenz && i0 >= 0) fichaLenz(CIRC[i0], est.circuitos[i0], i0);
    if (ESC.capas.medidores) CIRC.forEach((el, i) => fichaMedidores(el, est.circuitos[i]));
  }
  // Punto de anclaje de las fichas de un circuito (px) y candidatos alrededor
  function anclaCircuito(el, c) {
    const v = tz.vista;
    if (el.tipo === 'rieles') { const { u, w } = ejesRieles(el), O = el.origen, a = atrasRieles(el), h = el.separacion / 2; return v.P([O[0] - a * u[0] - h * w[0], O[1] - a * u[1] - h * w[1]]); }
    if (el.tipo === 'espira') { const P = c.pts.map(p => v.P(p)); return [Math.max(...P.map(p => p[0])), Math.max(...P.map(p => p[1]))]; }
    if (el.tipo === 'conductor') return v.P(c.moviles[0].b);
    const G = geomGenerador(el, t); return v.P(G.carga[1]);
  }
  function fichaMedidores(el, c) {
    const [x, y] = anclaCircuito(el, c), filas = [];
    if (el.tipo === 'conductor') filas.push([{ t: 'Voltímetro', f: 'ui', tam: 11.5 }], [{ t: 'V', f: 'sim', tam: 13, color: 'corriente' }, { t: ' = ' + conPrefijo(Math.abs(c.fem), 'V'), f: 'num', tam: 11.5 }]);
    else {
      filas.push([{ t: el.nombre, f: 'ui', tam: 11.5 }], [{ t: 'ε', f: 'sim', tam: 13, color: 'corriente' }, { t: ' = ' + conPrefijo(c.fem, 'V'), f: 'num', tam: 11.5 }], [{ t: 'I', f: 'sim', tam: 13, color: 'corriente' }, { t: ' = ' + conPrefijo(c.I, 'A'), f: 'num', tam: 11.5 }]);
    }
    tz.magnetismoFicha(filas, [[x - 150, y + 12], [x + 14, y + 12], [x - 150, y - 70], [x + 14, y - 70], [x - 150, y + 60], [x + 14, y + 60], [x - 260, y - 20]], [x, y]);
  }
  // Sitios para una ficha de W × H px alrededor de una caja: encima, debajo, a los lados y en diagonal
  function alrededor(x0, y0, x1, y1, W, H) {
    const xs = [x0, x1 - W, x1 + 14, x0 - W - 14, (x0 + x1 - W) / 2], ys = [y0 - H - 12, y1 + 12, y0, y1 - H, (y0 + y1 - H) / 2, y0 - H - 60, y1 + 60];
    const r = [];
    for (const y of ys) for (const x of xs) r.push([Math.round(x), Math.round(y)]);
    return r.filter(([x, y]) => x >= 6 && y >= 6 && x + W <= tz.w - 6 && y + H <= tz.h - 6);
  }
  function fichaLenz(el, c, i) {
    if (el.tipo === 'generador' || el.tipo === 'conductor') return;
    if (!(Math.abs(c.I) > 1e-3 * maxI(i))) return;
    const dphi = -c.fem, crece = c.phi * dphi > 0 || (Math.abs(c.phi) < 1e-15 && dphi !== 0), signo = Math.abs(c.phi) > 1e-15 ? Math.sign(c.phi) : Math.sign(dphi);
    const P = c.pts.map(p => tz.vista.P(p)), x0 = Math.min(...P.map(p => p[0])), y0 = Math.min(...P.map(p => p[1])), x1 = Math.max(...P.map(p => p[0]));
    const filas = [[{ t: 'Lenz', f: 'ui', tam: 11.5 }],
      [{ t: 'Φ', f: 'sim', tam: 13, color: 'magnetico' }, { t: ` ${signo > 0 ? '⊙' : '⊗'} ${crece ? 'aumenta' : 'disminuye'}`, f: 'ui', tam: 11.5 }],
      [{ t: 'I', f: 'sim', tam: 13, color: 'corriente' }, { t: ` ${c.I > 0 ? 'antihoraria' : 'horaria'}: su campo ${c.I > 0 ? '⊙' : '⊗'} se opone`, f: 'ui', tam: 11.5 }]];
    tz.magnetismoFicha(filas, alrededor(x0, y0, x1, Math.max(...P.map(p => p[1])), 222, 60), null);
  }
  function etiquetasVelocidad(el, c) {
    const v = tz.vista, E = escalas(), lista = [];
    if (el.tipo === 'rieles') { const { u } = ejesRieles(el); el.barras.forEach((b, k) => { const [a, q] = extremosBarra(el, c.s[k], b.angulo); lista.push([[(a[0] + q[0]) / 2, (a[1] + q[1]) / 2], [u[0] * c.v[k], u[1] * c.v[k]], el.barras.length > 1 ? String(k + 1) : '']); }); }
    else if (el.tipo === 'espira' || el.tipo === 'conductor') lista.push([c.centro, c.vel, '']);
    for (const [p, vv, sub] of lista) {
      const s = Math.hypot(vv[0], vv[1]); if (!(s > 1e-9 * E.vref)) continue;
      const Lp = (el.tipo === 'conductor' ? 46 : Math.max(12, 46 * s / E.vref)) + 6, [X0, Y0] = v.P(p), fx = X0 + vv[0] / s * Lp, fy = Y0 - vv[1] / s * Lp, der = vv[0] >= -0.2 * s;
      const segs = [{ t: 'v', f: 'sim', tam: 13, color: 'movimiento' }, ...(sub ? [{ t: sub, f: 'simRecta', tam: 9, dy: 3, color: 'movimiento' }] : []), { t: ' = ' + conPrefijo(s, 'm/s', 3), f: 'num', tam: 11, color: 'texto-2' }];
      const sg = der ? 1 : -1, al = der ? 'left' : 'right';
      colocar(segs, [[fx + 8 * sg, fy + 4, al], [fx, fy - 10, 'center'], [fx, fy + 20, 'center'], [fx + 8 * sg, fy - 14, al], [fx + 8 * sg, fy + 22, al], [fx + 40 * sg, fy - 14, al], [fx + 40 * sg, fy + 22, al], [fx - 6 * sg, fy - 12, der ? 'right' : 'left']]);
    }
  }
  function etiquetasFuerzas(el, c) {
    const v = tz.vista, E = escalas(), lista = [];
    if (el.tipo === 'rieles') {
      const { u, w } = ejesRieles(el);
      el.barras.forEach((b, k) => {
        const [a, q] = extremosBarra(el, c.s[k], b.angulo), m = [(a[0] + q[0]) / 2, (a[1] + q[1]) / 2], f = c.fuerzas.find(x => x.cuerpo === k);
        if (f) lista.push([[m[0] + w[0] * 10 / v.escala, m[1] + w[1] * 10 / v.escala], f.F, el.barras.length > 1 ? `B${k + 1}` : 'B']);
        if (b.F && !b.impuesta) lista.push([[m[0] - w[0] * 10 / v.escala, m[1] - w[1] * 10 / v.escala], [u[0] * b.F, u[1] * b.F], 'ap']);
        const Fg = b.m * G_GRAVEDAD * Math.sin(el.inclinacion);
        if (Fg > 0 && !b.impuesta) lista.push([[m[0] - w[0] * 10 / v.escala, m[1] - w[1] * 10 / v.escala], [u[0] * Fg, u[1] * Fg], 'g']);
      });
    } else if (el.tipo === 'espira') {
      const lados = ladosConFuerza(c).sort((a, b) => b.mod - a.mod);
      if (lados.length) lista.push([lados[0].m, lados[0].F, 'B', 3]);
      if (el.gravedad && !el.impuesta) lista.push([[c.centro[0] + 12 / v.escala, c.centro[1]], [0, -el.m * G_GRAVEDAD], 'g']);
    }
    for (const [p, F, sub, r0 = 6] of lista) {
      const m = Math.hypot(F[0], F[1]); if (!(m > 1e-9 * E.fref)) continue;
      const Lp = Math.max(12, 44 * m / E.fref) + 4 + r0, [X0, Y0] = v.P(p), fx = X0 + F[0] / m * Lp, fy = Y0 - F[1] / m * Lp, der = F[0] >= -0.2 * m;
      const segs = [{ t: 'F', f: 'sim', tam: 13, color: 'interaccion' }, { t: sub, f: sub.startsWith('B') ? 'sim' : 'simRecta', tam: 9, dy: 3, color: 'interaccion' }, { t: ' = ' + conPrefijo(m, 'N', 3), f: 'num', tam: 11, color: 'texto-2' }];
      const sg = der ? 1 : -1, al = der ? 'left' : 'right';
      colocar(segs, [[fx + 8 * sg, fy + 4, al], [fx, fy + 20, 'center'], [fx, fy - 10, 'center'], [fx + 8 * sg, fy + 22, al], [fx + 8 * sg, fy - 14, al], [fx + 40 * sg, fy + 22, al], [fx + 40 * sg, fy - 14, al], [fx - 6 * sg, fy + 20, der ? 'right' : 'left']]);
    }
  }
  function cajaPx(pts) { const P = pts.map(p => tz.vista.P(p)), xs = P.map(p => p[0]), ys = P.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; }
  function dibujarSeleccion(est) {
    const v = tz.vista, bs = barraSel();
    if (bs && bs.el) {
      const c = est ? est.circuitos[iCirc(bs.el)] : null, b = bs.el.barras[bs.k]; if (!b) return;
      const [a, q] = extremosBarra(bs.el, c ? c.s[bs.k] : b.s, b.angulo), A = v.P(a), B = v.P(q);
      tz.lineaPx([A, B], { color: 'tinta', grosor: 1, patron: 'seleccion' }); tz.seleccionCirculo((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, 9);
      return;
    }
    const el = elDe(sel); if (!el) return;
    const c = est && ES_CIRCUITO(el.tipo) ? est.circuitos[iCirc(el)] : null;
    if (el.tipo === 'hilo') { const [x, y] = v.P(el.a); tz.seleccionCirculo(x, y, 10); }
    else if (el.tipo === 'espira' && c) { const [x, y, w, h] = cajaPx(c.pts); tz.seleccionCaja(x, y, w, h); }
    else if (el.tipo === 'conductor' && c) { const [x, y, w, h] = cajaPx([c.moviles[0].a, c.moviles[0].b]); tz.seleccionCaja(x - 6, y - 6, w + 12, h + 12); }
    else { const [x, y, w, h] = cajaPx(puntosDe(el)); tz.seleccionCaja(x, y, w, h); }
    const a = asaDe(el);
    if (a) {
      if (el.tipo === 'region') tz.asa(a[0], a[1]);
      else { const c0 = v.P(el.tipo === 'hilo' ? el.a : el.tipo === 'rieles' ? el.origen : el.centro); tz.lineaPx([c0, a], { color: 'texto-3', grosor: 1, patron: 'auxiliar' }); tz.asaVector(a[0], a[1], arrastre && arrastre.tipo === 'giro'); }
    }
  }
  function asaDe(el) {
    const v = tz.vista;
    if (el.tipo === 'region' && el.forma === 'rect') return v.P([el.centro[0] + el.ancho / 2, el.centro[1] - el.alto / 2]);
    if (el.tipo === 'hilo') { const [x, y] = v.P(el.a), d = dir(el.angulo); return [x + d[0] * 50, y - d[1] * 50]; }
    if (el.tipo === 'rieles') { const [x, y] = v.P(el.origen), d = dir(el.angulo + Math.PI); return [x + d[0] * (atrasRieles(el) * v.escala + 36), y - d[1] * (atrasRieles(el) * v.escala + 36)]; }
    if (el.tipo === 'conductor' && t === 0) { const [x, y] = v.P(el.centro), d = dir(el.angulo); return [x + d[0] * (el.largo * v.escala / 2 + 24), y - d[1] * (el.largo * v.escala / 2 + 24)]; }
    return null;
  }

  // ---------------------------------------------------------------------
  // Selección en el lienzo
  // ---------------------------------------------------------------------
  const distSeg = (P, A, B) => { const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy, s = L2 ? Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2)) : 0; return Math.hypot(P[0] - A[0] - s * dx, P[1] - A[1] - s * dy); };
  const dentroPoli = (P, pts) => { let d = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > P[1]) !== (b[1] > P[1]) && P[0] < (b[0] - a[0]) * (P[1] - a[1]) / (b[1] - a[1]) + a[0]) d = !d; } return d; };
  function objetoEn(X0, Y0) {
    const v = tz.vista, P = [X0, Y0], s = elDe(sel), est = estado();
    if (s && !barraSel()) { const a = asaDe(s); if (a && Math.hypot(X0 - a[0], Y0 - a[1]) < 9) return { id: s.id, asa: s.tipo === 'region' ? 'esq' : 'giro' }; }
    if (ESC.regla) for (const j of [0, 1]) { const [x, y] = v.P(ESC.regla[j]); if (Math.hypot(X0 - x, Y0 - y) < 8) return { id: 'regla', asa: j }; }
    // Barras primero, después el resto de los circuitos y los hilos; las regiones al final
    for (const el of CIRC) if (el.tipo === 'rieles') {
      const c = est ? est.circuitos[iCirc(el)] : null;
      for (let k = el.barras.length - 1; k >= 0; k--) { const [a, q] = extremosBarra(el, c ? c.s[k] : el.barras[k].s, el.barras[k].angulo); if (distSeg(P, v.P(a), v.P(q)) < 8) return { id: `${el.id}:b${k}` }; }
    }
    for (let i = ESC.elementos.length - 1; i >= 0; i--) {
      const el = ESC.elementos[i];
      if (el.tipo === 'region') continue;
      if (el.tipo === 'hilo') { const [a, b] = extremosHilo(el); if (distSeg(P, v.P(a), v.P(b)) < 7) return { id: el.id }; continue; }
      for (const [a, b] of segmentosMateria(el, est)) if (distSeg(P, v.P(a), v.P(b)) < 7) return { id: el.id };
      if (el.tipo === 'rieles') { const [x, y, w, h] = cajaPx(puntosDe(el)); if (X0 >= x && X0 <= x + w && Y0 >= y && Y0 <= y + h && dentroPoli(P, puntosDe(el).map(p => v.P(p)))) return { id: el.id }; }
      if (el.tipo === 'espira') { const pts = est ? est.circuitos[iCirc(el)].pts : rectangulo(el.centro, el.ancho, el.alto); if (dentroPoli(P, pts.map(p => v.P(p)))) return { id: el.id }; }
      if (el.tipo === 'generador') { const [x, y, w, h] = cajaPx(puntosDe(el)); if (X0 >= x && X0 <= x + w && Y0 >= y && Y0 <= y + h) return { id: el.id }; }
    }
    for (let i = ESC.elementos.length - 1; i >= 0; i--) { const el = ESC.elementos[i]; if (el.tipo === 'region' && dentroPoli(P, poligonoDe(el).map(p => v.P(p)))) return { id: el.id }; }
    if (ESC.regla && distSeg(P, v.P(ESC.regla[0]), v.P(ESC.regla[1])) < 6) return { id: 'regla' };
    return null;
  }

  // ---------------------------------------------------------------------
  // Inspector, árbol, lecturas y variables
  // ---------------------------------------------------------------------
  const fila = (etq, control, ayuda = '') => `<div class="fila"${ayuda ? ` data-ayuda="${ayuda}"` : ''}><span class="etq">${etq}</span>${control}</div>`;
  const segmentado = (id, ops, actual) => `<div class="segmentado texto" id="${id}">${ops.map(([v, txt, ay]) => `<button data-v="${v}" aria-pressed="${String(v) === String(actual)}"${ay ? ` data-ayuda="${ay}"` : ''}>${txt}</button>`).join('')}</div>`;
  const leer = ruta => ruta.split('.').reduce((o, k) => (o == null ? o : o[k]), ESC);
  function escribir(ruta, val) { const ks = ruta.split('.'), u = ks.pop(), o = ks.reduce((a, k) => a[k], ESC); o[u] = val; }
  const ligadaA = ruta => Object.entries(ESC.variables).find(([, d]) => d.liga.includes(ruta));
  function campo(etq, ruta, dim, u, ayuda = '') {
    const lig = ligadaA(ruta);
    if (lig) {
      const [nv, d] = lig;
      // Muestra el valor de su propia ruta (puede llevar otro factor que la variable)
      return fila(etq, `<div class="campo es-variable" data-ayuda="Ligado a la variable ${d.sim}|Bound to variable"><span class="chip-var">${simHTML(d.sim, d.sub)}</span><span class="valor-var" data-var="${nv}" data-ruta-var="${ruta}" data-uvar="${u}"></span><span class="u">${u}</span></div>`, ayuda);
    }
    const val = leer(ruta);
    return fila(etq, `<div class="campo"><input data-ruta="${ruta}" data-dim="${dim}" data-u="${u}" value="${val == null ? '' : numCampo(val / (FAC[u] ?? 1))}"><span class="u">${u}</span></div>`, ayuda);
  }
  const boton = (id, ico, txt, ayuda) => `<button class="btn btn-secundario btn-compacto" id="${id}" data-ayuda="${ayuda}"><svg class="ico"><use href="#${ico}"/></svg>${txt}</button>`;
  function camposVariacion(b, varia, uBase, dimTasa, uTasa) {
    let h = fila('Varía', segmentado('p-variacion', [['', 'No'], ['rampa', 'Rampa'], ['senoidal', 'Senoidal']], varia?.tipo || ''), 'Constante, rampa lineal entre dos instantes, o senoide|Time dependence');
    if (varia?.tipo === 'rampa') h += campo('Ritmo', `${b}.variacion.pendiente`, dimTasa, uTasa, 'Cambio por segundo durante la rampa|Rate') + campo('Desde', `${b}.variacion.inicio`, 'tiempo', 's') + campo('Hasta', `${b}.variacion.fin`, 'tiempo', 's');
    if (varia?.tipo === 'senoidal') h += campo('Amplitud', `${b}.variacion.amplitud`, uBase === 'T' ? 'campoMagnetico' : 'corriente', uBase) + campo('f', `${b}.variacion.frecuencia`, 'frecuencia', 'Hz', 'Frecuencia|Frequency');
    return h;
  }

  function inspector() {
    const props = $('#propiedades'); props.innerHTML = '';
    const bs = barraSel(), el = bs ? null : elDe(sel);
    let titulo = 'Propiedades', ico = 'm-magnetismo', nombre = ESC.titulo;
    const acciones = (quitar = true) => `<div class="fila"><span class="etq">Objeto</span><div class="acciones-fila">${boton('p-duplicar', 'i-duplicar', 'Duplicar', 'Duplicar|Duplicate|Ctrl D')}${quitar ? boton('p-quitar', 'i-borrar', 'Quitar', 'Quitar el objeto|Delete|Supr') : ''}</div></div>`;
    const u = U();
    if (bs && bs.el && bs.el.barras[bs.k]) {
      const i = idxDe(bs.el.id), b = `elementos.${i}.barras.${bs.k}`, br = bs.el.barras[bs.k];
      nombre = br.nombre; ico = 'o-barra-conductora'; titulo = 'Barra conductora';
      props.innerHTML = campo('s', `${b}.s`, 'longitud', u, 'Posición del centro a lo largo de los rieles, desde la resistencia|Position')
        + fila('Movimiento', segmentado('p-impuesta', [['libre', 'Libre', 'Responde a las fuerzas|Free'], ['impuesta', 'Velocidad impuesta', 'Un agente la mantiene; su trabajo va al registro de energía|Imposed velocity']], br.impuesta ? 'impuesta' : 'libre'))
        + campo(br.impuesta ? 'v' : 'v₀', `${b}.v`, 'velocidad', 'm/s', br.impuesta ? 'Velocidad que se mantiene|Velocity' : 'Velocidad inicial|Initial velocity')
        + campo('m', `${b}.m`, 'masa', 'kg', 'Masa|Mass') + campo('r', `${b}.r`, 'resistencia', 'Ω', 'Resistencia de la barra|Bar resistance')
        + (br.impuesta ? '' : campo('F', `${b}.F`, 'fuerza', 'N', 'Fuerza aplicada a lo largo de los rieles|Applied force') + campo('μ', `${b}.mu`, 'adimensional', '', 'Coeficiente de fricción con los rieles|Friction coefficient'))
        + campo('φ', `${b}.angulo`, 'adimensional', '°', 'Inclinación de la barra respecto de la perpendicular a los rieles (barra oblicua)|Bar angle')
        + `<div class="fila"><span class="etq">Objeto</span><div class="acciones-fila">${boton('p-quitar', 'i-borrar', 'Quitar', 'Quitar la barra|Delete|Supr')}</div></div>`;
    } else if (sel === 'regla' && ESC.regla) {
      nombre = 'Regla'; ico = 'n-regla'; titulo = 'Regla';
      props.innerHTML = `<div class="fila"><span class="etq">Objeto</span><div class="acciones-fila">${boton('p-quitar', 'i-borrar', 'Quitar', 'Quitar la regla|Delete|Supr')}</div></div>`;
    } else if (!el) {
      nombre = 'Escena'; titulo = 'Escena';
      props.innerHTML = fila('Unidad', segmentado('p-unidad', [['mm', 'mm'], ['cm', 'cm'], ['m', 'm']], U()), 'Unidad de longitud de los ejes|Length unit')
        + campo('Duración', 'duracion', 'tiempo', 's', 'Tiempo físico que se simula|Duration')
        + (ESC.nota ? `<p class="ayuda-fila" style="margin:6px 0 2px">${ESC.nota}</p>` : '');
    } else {
      const i = idxDe(sel), b = `elementos.${i}`;
      nombre = el.nombre; ico = TIPOS[el.tipo].ico; titulo = TIPOS[el.tipo].nombre;
      const pos = (k = 'centro') => campo('x', `${b}.${k}.0`, 'longitud', u) + campo('y', `${b}.${k}.1`, 'longitud', u);
      let h = '';
      switch (el.tipo) {
        case 'region':
          h += el.forma === 'rect' ? pos() + campo('Ancho', `${b}.ancho`, 'longitud', u) + campo('Alto', `${b}.alto`, 'longitud', u) : `<p class="ayuda-fila" style="margin:2px 0 6px">Región de forma libre (${el.puntos.length} vértices): arrástrala en el lienzo para moverla.</p>`;
          h += campo('B', `${b}.B`, 'campoMagnetico', 'T', 'Componente perpendicular al plano (en t = 0 si varía): + saliente ⊙, − entrante ⊗|Magnetic field') + camposVariacion(b, el.variacion, 'T', DIM_TS, 'T/s');
          break;
        case 'hilo':
          h += pos('a') + campo('Dirección', `${b}.angulo`, 'adimensional', '°', 'Sentido positivo de la corriente|Direction') + campo('I', `${b}.I`, 'corriente', 'A', 'Corriente (en t = 0 si varía)|Current') + camposVariacion(b, el.variacion, 'A', DIM_AS, 'A/s');
          break;
        case 'rieles':
          h += pos('origen') + campo('Dirección', `${b}.angulo`, 'adimensional', '°', 'Dirección de los rieles, desde la resistencia (cuesta abajo si están inclinados)|Direction')
            + campo('d', `${b}.separacion`, 'longitud', u, 'Separación entre los rieles|Rail separation') + campo('Largo', `${b}.largo`, 'longitud', u)
            + (el.barras.length < 2 ? fila('Extremo', segmentado('p-cerrado', [['1', 'Con resistencia'], ['0', 'Abiertos', 'Sin circuito cerrado: fem sin corriente|Open']], el.cerrado ? '1' : '0')) + (el.cerrado ? campo('R', `${b}.R`, 'resistencia', 'Ω', 'Resistencia que une los rieles|Resistance') : '') : '<p class="ayuda-fila" style="margin:2px 0 6px">Con dos barras, el circuito lo cierran ellas.</p>')
            + campo('L', `${b}.L`, 'inductancia', 'H', 'Autoinducción del circuito (opcional, 0 como en el examen)|Inductance')
            + campo('θ', `${b}.inclinacion`, 'adimensional', '°', 'Inclinación de los rieles respecto del suelo|Incline')
            + (el.inclinacion > 0 ? fila('Campo', segmentado('p-bvertical', [['0', '⊥ al plano'], ['1', 'Vertical', 'B vertical: cuenta B·cos θ|Vertical field']], el.bVertical ? '1' : '0')) : '')
            + `<div class="fila"><span class="etq">Barras</span><div class="acciones-fila">${el.barras.length < 2 ? boton('p-barra-mas', 'i-mas', 'Añadir barra', 'Añadir una segunda barra (el circuito lo cierran las dos)|Add bar') : ''}</div></div>`;
          break;
        case 'espira':
          h += pos() + campo('Ancho', `${b}.ancho`, 'longitud', u) + campo('Alto', `${b}.alto`, 'longitud', u) + campo('N', `${b}.N`, 'adimensional', '', 'Vueltas|Turns')
            + campo('R', `${b}.R`, 'resistencia', 'Ω') + campo('L', `${b}.L`, 'inductancia', 'H', 'Autoinducción (opcional)|Inductance')
            + fila('Movimiento', segmentado('p-impuesta', [['libre', 'Libre'], ['impuesta', 'Velocidad impuesta']], el.impuesta ? 'impuesta' : 'libre'))
            + campo(el.impuesta ? 'vx' : 'vx₀', `${b}.v.0`, 'velocidad', 'm/s') + campo(el.impuesta ? 'vy' : 'vy₀', `${b}.v.1`, 'velocidad', 'm/s');
          if (!el.impuesta) h += campo('m', `${b}.m`, 'masa', 'kg') + fila('Gravedad', segmentado('p-gravedad', [['0', 'Sin'], ['1', 'Hacia −y']], el.gravedad ? '1' : '0')) + fila('Se mueve', segmentado('p-ejes', [['xy', 'x e y'], ['x', 'Solo x'], ['y', 'Solo y']], el.ejes), 'Guías que la dejan moverse solo en una dirección|Constraint');
          break;
        case 'generador':
          h += pos() + campo('Ancho', `${b}.ancho`, 'longitud', u) + campo('Alto', `${b}.alto`, 'longitud', u) + campo('N', `${b}.N`, 'adimensional', '', 'Vueltas|Turns')
            + campo('B', `${b}.B`, 'campoMagnetico', 'T', 'Campo uniforme perpendicular a la bobina en t = 0|Field') + campo('f', `${b}.frecuencia`, 'frecuencia', 'Hz', 'Vueltas por segundo|Rotation frequency')
            + campo('Fase', `${b}.fase`, 'adimensional', '°', 'Ángulo de la bobina en t = 0 (0: en el plano del papel)|Initial angle')
            + campo('R', `${b}.R`, 'resistencia', 'Ω', 'Resistencia de la carga|Load') + campo('L', `${b}.L`, 'inductancia', 'H')
            + fila('Carga', segmentado('p-carga', [['resistencia', 'Resistencia'], ['bombilla', 'Bombilla']], el.carga));
          break;
        case 'conductor':
          h += pos() + campo('Largo', `${b}.largo`, 'longitud', u) + campo('Dirección', `${b}.angulo`, 'adimensional', '°', 'Dirección del conductor|Direction')
            + campo('vx', `${b}.v.0`, 'velocidad', 'm/s') + campo('vy', `${b}.v.1`, 'velocidad', 'm/s');
          break;
        default: break;
      }
      props.innerHTML = h + acciones();
    }
    $('#insp-ico').setAttribute('href', '#' + ico);
    $('#insp-nombre').textContent = nombre;
    $('#props-titulo').textContent = titulo;
    document.querySelectorAll('#propiedades input[data-ruta]').forEach(campoConUnidad);
    const on = (id, f) => { const e = $(id); if (e) e.addEventListener('click', ev => { const bt = ev.target.closest('button'); if (bt) f(bt.dataset.v, bt); }); };
    const elSel = () => elDe(sel);
    on('#p-unidad', v => { ESC.unidad = v; for (const d of Object.values(ESC.variables)) if (['mm', 'cm', 'm'].includes(d.u) && FAC[d.u]) { const k = FAC[d.u] / FAC[v]; d.min *= k; d.max *= k; d.val *= k; d.paso *= k; d.factor = Math.sign(d.factor) * FAC[v]; d.u = v; } cambio(); construirVariables(); });
    on('#p-variacion', v => {
      const e = elSel(), base = e.tipo === 'region' ? e.B : e.I;
      e.variacion = v === 'rampa' ? { tipo: 'rampa', pendiente: e.tipo === 'region' ? 0.5 : 10, inicio: 0, fin: ESC.duracion } : v === 'senoidal' ? { tipo: 'senoidal', amplitud: Math.abs(base) || (e.tipo === 'region' ? 0.5 : 10), frecuencia: 2 / ESC.duracion, fase: 0 } : null;
      limpiarVariables(); cambio();
    });
    on('#p-cerrado', v => { elSel().cerrado = v === '1'; limpiarVariables(); cambio(); });
    on('#p-bvertical', v => { elSel().bVertical = v === '1'; cambio(); });
    on('#p-impuesta', v => { if (bs) bs.el.barras[bs.k].impuesta = v === 'impuesta'; else elSel().impuesta = v === 'impuesta'; limpiarVariables(); cambio(); });
    on('#p-gravedad', v => { elSel().gravedad = v === '1'; cambio(); });
    on('#p-ejes', v => { elSel().ejes = v; cambio(); });
    on('#p-carga', v => { elSel().carga = v; cambio(); });
    const bm = $('#p-barra-mas'); if (bm) bm.addEventListener('click', () => { const e = elSel(); anadirBarra(e, Math.min(e.largo * 0.9, (e.barras[0]?.s ?? 0) + e.largo * 0.3)); });
    const b1 = $('#p-quitar'); if (b1) b1.addEventListener('click', quitarSeleccion);
    const b2 = $('#p-duplicar'); if (b2) b2.addEventListener('click', duplicar);
    arbol();
  }

  // Validación de cada ruta (en SI)
  function validar(ruta, x) {
    const k = ruta.split('.').pop(), pos = max => { if (!(x > 0)) throw new Error('Este valor tiene que ser positivo.'); if (x > max) throw new Error('Este valor es demasiado grande.'); };
    if (['ancho', 'alto', 'largo', 'separacion'].includes(k)) pos(1e5);
    if (k === 'B' && !(Math.abs(x) <= 100)) throw new Error('El campo va de −100 T a 100 T.');
    if (k === 'I' && !(Math.abs(x) <= 1e6)) throw new Error('La corriente va de −1 MA a 1 MA.');
    if (k === 'R' && !(x >= 0 && x <= 1e9)) throw new Error('La resistencia no puede ser negativa.');
    if ((k === 'r' || k === 'L' || k === 'mu') && !(x >= 0 && x <= 1e6)) throw new Error('Este valor no puede ser negativo.');
    if (k === 'm') pos(1e6);
    if (k === 'N') { if (!(x >= 1 && x <= 1e5)) throw new Error('Las vueltas van de 1 a 100 000.'); return Math.round(x); }
    if (k === 'frecuencia' && !(x >= 0 && x <= 1e4)) throw new Error('La frecuencia va de 0 a 10 kHz.');
    if (k === 'duracion' && !(x > 0 && x <= 1e3)) throw new Error('La duración va de un instante a 1000 s.');
    if ((k === 'inicio' || k === 'fin') && !(x >= 0 && x <= 1e3)) throw new Error('El instante va de 0 a 1000 s.');
    if (k === 'inclinacion' && !(x >= 0 && x <= Math.PI / 2 - 0.01)) throw new Error('La inclinación va de 0° a 89°.');
    if (ruta.includes('barras') && k === 'angulo' && !(Math.abs(x) <= 80 * GR)) throw new Error('La barra puede inclinarse hasta ±80°.');
    if ((ruta.endsWith('.v.0') || ruta.endsWith('.v.1') || k === 'v') && !(Math.abs(x) <= 1e4)) throw new Error('La velocidad va hasta 10 km/s.');
    if (k === 'F' && !(Math.abs(x) <= 1e6)) throw new Error('La fuerza va hasta 1 MN.');
    if (/\.(centro|a|origen)\.[01]$/.test(ruta) && Math.abs(x) > 1e5) throw new Error('La posición está demasiado lejos.');
    if (k === 's') { const e = elDe(sel) || barraSel()?.el; if (e && e.tipo === 'rieles' && !(x > 0 && x < e.largo)) throw new Error('La barra tiene que estar sobre los rieles.'); }
    return x;
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
        const dimTxt = ent.dataset.dim, dim = dimTxt.includes(',') ? dimTxt.split(',').map(Number) : dimTxt, u = ent.dataset.u;
        let txt = ent.value.trim().replace(/−/g, '-');
        const soloNumero = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(txt);
        let valor;
        if (soloNumero && (u === '' || u === 'T/s' || u === 'A/s')) valor = parseFloat(txt) * (FAC[u] ?? 1);
        else {
          if (soloNumero && u && u !== '°') txt = `${txt} ${u}`;
          valor = evaluar(txt, { esperada: dim, unidadPorDefecto: u || undefined }).valor;
        }
        const ruta = ent.dataset.ruta, x = validar(ruta, valor);
        escribir(ruta, x);
        mostrarError(null); cambio();
      } catch (e) { mostrarError(e.message); }
    });
    ent.addEventListener('keydown', ev => { if (ev.key === 'Escape') { mostrarError(null); ent.blur(); inspector(); } });
  }

  function arbol() {
    const nodo = (s, ico, nombre, dato, sangria = false) => `<div class="nodo" data-sel="${s}" aria-selected="${sel === s}"${sangria ? ' style="padding-left:28px"' : ''}><svg class="ico"><use href="#${ico}"/></svg><span class="nombre">${nombre}</span><span class="dato">${dato}</span></div>`;
    let h = nodo('escena', 'm-magnetismo', 'Escena', `${CIRC.length} ${CIRC.length === 1 ? 'circuito' : 'circuitos'}`);
    for (const el of ESC.elementos) {
      h += nodo(el.id, TIPOS[el.tipo].ico, el.nombre, datoArbol(el));
      if (el.tipo === 'rieles') el.barras.forEach((b, k) => { h += nodo(`${el.id}:b${k}`, 'o-barra-conductora', b.nombre, `${fmt(b.m, 3)} kg`, true); });
    }
    if (ESC.regla) h += nodo('regla', 'n-regla', 'Regla', L(Math.hypot(ESC.regla[1][0] - ESC.regla[0][0], ESC.regla[1][1] - ESC.regla[0][1]), 3));
    $('#arbol').innerHTML = h;
    $('#arbol').querySelectorAll('.nodo[data-sel]').forEach(n => n.addEventListener('click', () => seleccionar(n.dataset.sel)));
  }
  function datoArbol(el) {
    switch (el.tipo) {
      case 'region': return conPrefijo(el.B, 'T', 3) + (el.variacion ? ' ~' : '');
      case 'hilo': return conPrefijo(el.I, 'A', 3) + (el.variacion ? ' ~' : '');
      case 'rieles': return el.barras.length === 2 ? '2 barras' : el.cerrado ? conPrefijo(el.R, 'Ω', 3) : 'abiertos';
      case 'espira': return `${conPrefijo(el.R, 'Ω', 3)}${el.N > 1 ? ` · ${el.N} vueltas` : ''}`;
      case 'generador': return `${fmt(el.frecuencia, 3)} Hz`;
      case 'conductor': return L(el.largo, 3);
      default: return '';
    }
  }
  function seleccionar(s) { if (s === sel) return; sel = s; inspector(); todo(); }

  const lectura = ([a, b, val, u, ayuda]) => `<span class="sim"${ayuda ? ` data-ayuda="${ayuda}"` : ''}>${a}${b ? `<sub class="r">${b}</sub>` : ''}</span><span class="v">${val}</span><span class="u">${u}</span>`;
  // Valor con prefijo SI separado en número y unidad (conPrefijo usa el espacio fino U+202F)
  const partes = (v, u, cifras = 4) => { const s = conPrefijo(v, u, cifras), i = s.lastIndexOf(ESP); return i > 0 ? [s.slice(0, i), s.slice(i + ESP.length)] : [s, u]; };
  const fl = (a, b, v, u, ay) => { const [n, uu] = partes(v, u); return [a, b, n, uu, ay]; };
  const fL = (a, b, v, ay) => [a, b, fmt(v / FU(), 4), U(), ay];
  // Qué extremo de un conductor abierto queda positivo (q·v × B empuja las cargas positivas hacia b si ε > 0)
  function extremoPositivo(c) {
    if (!c.fem) return 'sin carga separada';
    const m = c.moviles[0], [p, q] = c.fem > 0 ? [m.b, m.a] : [m.a, m.b], dx = p[0] - q[0], dy = p[1] - q[1];
    return `+ en el extremo ${Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'de arriba' : 'de abajo') : dx > 0 ? 'derecho' : 'izquierdo'}`;
  }
  // Velocidad terminal (cuando aplica): barra libre sin fricción con fuerza o pendiente; espira que cae en un campo
  function velocidadLimite(el, k = 0) {
    if (el.tipo === 'rieles' && el.barras.length === 1 && el.cerrado) {
      const b = el.barras[0]; if (b.impuesta || b.mu > 0 || !(b.F || el.inclinacion)) return null;
      const reg = ESC.elementos.find(e => e.tipo === 'region' && !e.variacion); if (!reg) return null;
      return velocidadTerminal({ m: b.m, inclinacion: el.inclinacion, F: b.F, R: el.R + b.r, B: reg.B, L: el.separacion, bVertical: el.bVertical });
    }
    if (el.tipo === 'espira' && el.gravedad && !el.impuesta && el.ejes === 'y') {
      const reg = ESC.elementos.find(e => e.tipo === 'region' && !e.variacion); if (!reg || !(el.R > 0)) return null;
      return el.m * G_GRAVEDAD * el.R / (el.N * el.N * reg.B * reg.B * el.ancho * el.ancho);
    }
    void k; return null;
  }
  function lecturas() {
    document.querySelectorAll('[data-var]').forEach(e => { const d = ESC.variables[e.dataset.var]; if (!d) return; const x = e.dataset.rutaVar ? leer(e.dataset.rutaVar) : null; e.textContent = typeof x === 'number' ? numCampo(x / (FAC[e.dataset.uvar] ?? 1)) : fmtVar(d); });
    $('#reloj').innerHTML = `<span class="sim">t</span>${partes(t, 's', 4).join('<span class="u">')}</span>`;
    $('#lect-titulo').textContent = `Lecturas en t = ${conPrefijo(t, 's')}`;
    const f = [], est = estado(), bs = barraSel(), el = bs ? bs.el : elDe(sel);
    let estadoTxt = '';
    if (el && ES_CIRCUITO(el.tipo) && est) {
      const i = iCirc(el), c = est.circuitos[i];
      if (el.tipo === 'conductor') {
        f.push(fl('V', '', Math.abs(c.fem), 'V', 'Diferencia de potencial entre los extremos: v·B·L|Voltage'), fl('v', '', Math.hypot(...c.vel), 'm/s'), fL('L', '', el.largo));
        estadoTxt = `V = ${conPrefijo(Math.abs(c.fem), 'V')} · ${extremoPositivo(c)}`;
      } else {
        f.push(fl('Φ', '', c.phi, 'Wb', 'Flujo a través del circuito (positivo: saliente ⊙)|Magnetic flux'), fl('ε', '', c.fem, 'V', 'fem inducida −dΦ/dt (positiva: antihoraria)|EMF'));
        if (c.femTrans && c.femMov) f.push(fl('ε', 'mov', c.femMov, 'V', 'Parte de movimiento ∮(v × B)·dl|Motional EMF'), fl('ε', 'trans', c.femTrans, 'V', 'Parte de transformador −∂Φ/∂t|Transformer EMF'));
        f.push(fl('I', '', c.I, 'A', 'Corriente inducida (positiva: antihoraria)|Current'), fl('P', 'J', (el.tipo === 'rieles' ? (el.barras.length === 2 ? el.barras[0].r + el.barras[1].r : el.R + el.barras[0].r) : el.R) * c.I * c.I, 'W', 'Potencia disipada I²R|Joule power'));
        if (el.tipo === 'rieles') {
          el.barras.forEach((b, k) => { const n = el.barras.length > 1 ? String(k + 1) : ''; f.push(fL('s', n, c.s[k], `Posición de ${b.nombre}|Position`), fl('v', n, c.v[k], 'm/s', `Velocidad de ${b.nombre}|Velocity`), fl('F', 'B' + n, c.Fmag[k], 'N', 'Fuerza magnética a lo largo de los rieles|Magnetic force')); });
        } else if (el.tipo === 'espira') {
          f.push(fL('x', '', c.centro[0]), fL('y', '', c.centro[1]), fl('v', '', Math.hypot(...c.vel), 'm/s'), fl('F', 'B', Math.hypot(...c.fuerzaTotal), 'N', 'Fuerza magnética neta sobre la espira|Magnetic force'));
        } else if (el.tipo === 'generador') {
          f.push(['θ', '', fmt(((anguloGen(el, t) / GR) % 360 + 360) % 360, 4), '°', 'Ángulo girado|Angle'], fl('ε', 'máx', el.N * el.B * el.ancho * el.alto * DOS_PI * el.frecuencia, 'V', 'N·B·A·ω|Peak EMF'), fl('τ', '', c.par, 'N·m', 'Par que hace el motor|Torque'));
        }
        const vt = velocidadLimite(el);
        if (vt != null) f.push(fl('v', 'terminal', vt, 'm/s', 'Velocidad a la que la fuerza magnética equilibra la que la impulsa|Terminal velocity'));
        estadoTxt = Math.abs(c.I) > 1e-3 * maxI(i) ? `Corriente ${c.I > 0 ? 'antihoraria' : 'horaria'} (Lenz)` : 'Sin corriente';
      }
    } else if (el && el.tipo === 'region') {
      const [B, dB] = valorVariable(el.B, el.variacion, t);
      f.push(fl('B', '', B, 'T'));
      if (el.variacion) f.push(fl('dB/dt', '', dB, 'T/s', 'Ritmo de cambio|Rate of change'));
      estadoTxt = B > 0 ? 'Saliente ⊙' : B < 0 ? 'Entrante ⊗' : 'Sin campo';
    } else if (el && el.tipo === 'hilo') {
      const [I, dI] = valorVariable(el.I, el.variacion, t);
      f.push(fl('I', '', I, 'A'), fl('B', '1 cm', MU0 * Math.abs(I) / (DOS_PI * 0.01), 'T', 'Su campo a 1 cm: μ0·I/(2π·r)|Field at 1 cm'));
      if (el.variacion) f.push(fl('dI/dt', '', dI, 'A/s'));
      estadoTxt = el.variacion ? 'Corriente variable' : 'Corriente fija';
    } else if (est) {
      CIRC.slice(0, 3).forEach((c, i) => { const q = est.circuitos[i], n = CIRC.length > 1 ? c.nombre.slice(0, 8) : ''; if (c.tipo === 'conductor') f.push(fl('V', n, q.fem, 'V')); else f.push(fl('Φ', n, q.phi, 'Wb'), fl('ε', n, q.fem, 'V'), fl('I', n, q.I, 'A')); });
      estadoTxt = `${ESC.elementos.length} objetos`;
    } else estadoTxt = ERROR || '—';
    $('#lecturas').innerHTML = f.map(lectura).join('') || '<span class="u">—</span>';
    $('#insp-estado').textContent = estadoTxt;
    $('#b-play').innerHTML = `<svg class="ico"><use href="#i-${jugando ? 'pausar' : 'reproducir'}"/></svg>`;
    $('#b-play').dataset.ayuda = jugando ? 'Pausar|Pause|Espacio' : 'Reproducir|Play|Espacio';
  }

  function fmtVar(d) {
    const dec = !(d.paso > 0) || d.paso >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(d.paso) - 1e-9));
    return d.val.toFixed(dec).replace('-', '−');
  }
  function construirVariables() {
    const cont = $('#variables'); cont.innerHTML = '';
    for (const d of Object.values(ESC.variables)) {
      const f = document.createElement('div'); f.className = 'var';
      f.innerHTML = `${simHTML(d.sim, d.sub)}<input class="deslizador" type="range" min="${d.min}" max="${d.max}" step="${d.paso}" value="${d.val}" aria-label="${d.sim}"><span class="valor"></span>`;
      const ent = f.querySelector('input'), val = f.querySelector('.valor');
      const pintar = () => { val.innerHTML = `${fmtVar(d)}${d.u ? `<span class="u">${d.u}</span>` : ''}`; ent.value = d.val; Volta.pintarDeslizador(ent); };
      ent.addEventListener('input', () => { d.val = parseFloat(ent.value); aplicarVariables(); pintar(); recalcular(); });
      ent.addEventListener('change', () => { registrar(); inspector(); });
      pintar(); cont.appendChild(f);
    }
    if (!Object.keys(ESC.variables).length) cont.innerHTML = '<span class="ayuda-fila" style="margin:0">Sin variables: edita los valores en el inspector.</span>';
  }
  const factorDe = (d, r) => (d.factores && d.factores[r] != null ? d.factores[r] : d.factor);
  function aplicarVariables() {
    for (const d of Object.values(ESC.variables)) for (const r of d.liga) { try { if (leer(r) !== undefined) escribir(r, d.val * factorDe(d, r)); } catch { /* ruta que ya no existe */ } }
  }
  function sincronizarVariables(rutas) {
    for (const d of Object.values(ESC.variables)) for (const r of rutas) if (d.liga.includes(r)) {
      d.val = Math.max(d.min, Math.min(d.max, leer(r) / factorDe(d, r)));
      for (const q of d.liga) escribir(q, d.val * factorDe(d, q));
    }
  }
  function limpiarVariables(borrado = null) {
    for (const [k, d] of Object.entries(ESC.variables)) {
      d.liga = d.liga.map(r => {
        const m = /^elementos\.(\d+)\.(.+)$/.exec(r);
        if (!m || borrado == null) return r;
        if (+m[1] === borrado) return null;
        return +m[1] > borrado ? `elementos.${+m[1] - 1}.${m[2]}` : r;
      }).filter(r => r && typeof leer(r) === 'number');
      if (d.factores) { const nf = {}; for (const r of d.liga) if (d.factores[r] != null) nf[r] = d.factores[r]; d.factores = nf; }
      if (!d.liga.length) delete ESC.variables[k];
    }
    construirVariables();
  }

  // ---------------------------------------------------------------------
  // Gráficas
  // ---------------------------------------------------------------------
  const GRAFICAS = {
    flujo: { nombre: 'Flujo Φ(t)' },
    fem: { nombre: 'fem ε(t)' },
    corriente: { nombre: 'Corriente I(t)' },
    velocidad: { nombre: 'Velocidad v(t)' },
    fuerza: { nombre: 'Fuerza magnética F(t)' },
    posicion: { nombre: 'Posición s(t) o x(t)' },
    potencia: { nombre: 'Potencias: Joule y mecánica' },
  };
  const vacia = (n, msj) => { grafica($(`#g${n}`), { x: { min: 0, max: 1 }, y: { min: 0, max: 1 }, series: [] }); $(`#t${n}`).textContent = msj; $(`#l${n}`).textContent = ''; };
  function graficas() { if (!$('#p-graficas').hidden) ESC.graficas.forEach((g, j) => { try { grafica1(j + 1, g); } catch { vacia(j + 1, 'Sin datos'); } }); }
  function escalaSI(max, u) {
    const a = Math.abs(max) || 1, PF = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
    const p = PF.find(([f]) => a >= f * 0.999) || PF[PF.length - 1];
    return { f: p[0], u: p[1] + u };
  }
  const leyenda = items => `<span class="leyenda">${items.map(([fam, pat, sim]) => `<span style="color:var(${fam === 'tinta' ? '--tinta' : '--f-' + fam})"><i${pat ? ` class="${pat}"` : ''}></i>${sim}</span>`).join('')}</span>`;
  const rango = (vals, cero = true) => { let a = Math.min(...vals, cero ? 0 : Infinity), b = Math.max(...vals, cero ? 0 : -Infinity); if (!(b > a)) { a -= 1; b += 1; } const m = (b - a) * 0.08; return { min: cero && a >= 0 ? 0 : a - m, max: b + m }; };
  function serie(i, fn) { return SIM.muestras.map(m => [m.t, fn(m.circuitos[i], m.t)]); }
  function grafica1(n, tipo) {
    const cv = $(`#g${n}`), Tt = $(`#t${n}`), Lc = $(`#l${n}`), i = circSel();
    if (!SIM || i < 0) { vacia(n, ERROR ? 'Sin simulación' : 'Sin circuitos'); return; }
    const el = CIRC[i], est = estado(), c = est.circuitos[i], xr = { min: 0, max: ESC.duracion }, eventos = SIM.eventos.filter(e => e.t > 0).map(e => ({ x: e.t }));
    cv.parentElement.querySelector('.cab-grafica').dataset.ayuda = `${GRAFICAS[tipo].nombre} de ${el.nombre} contra t (s); clic para elegir otra|Plot quantity`;
    const una = (vals, u, fam, simb, actual, extra = []) => {
      const E = escalaSI(Math.max(...vals.flat().map(p => Math.abs(p[1]))), u), sc = s => s.map(([a, b]) => [a, b / E.f]);
      const series = vals.map((s, k) => ({ tramos: [sc(s)], familia: fam, patron: ['continuo', 'discontinuo', 'punteado'][k] })).concat(extra.map(x => ({ ...x, tramos: [sc(x.tramos[0])] })));
      grafica(cv, { x: xr, y: rango(series.flatMap(s => s.tramos[0].map(p => p[1])), true), series, cursor: t, puntoCursor: actual != null ? [t, actual / E.f] : null, eventos });
      return E;
    };
    if (tipo === 'flujo') {
      if (el.tipo === 'conductor') { vacia(n, 'Un conductor abierto no encierra flujo'); return; }
      const E = una([serie(i, q => q.phi)], 'Wb', 'magnetico', 'Φ', c.phi);
      Tt.innerHTML = `${simHTML('Φ')} (${E.u})`; Lc.textContent = conPrefijo(c.phi, 'Wb');
    } else if (tipo === 'fem') {
      const partesFem = SIM.muestras.some(m => m.circuitos[i].femTrans && m.circuitos[i].femMov);
      const abierto = el.tipo === 'conductor', s = [serie(i, q => (abierto ? Math.abs(q.fem) : q.fem))]; if (partesFem) s.push(serie(i, q => q.femMov), serie(i, q => q.femTrans));
      const E = una(s, 'V', 'corriente', 'ε', abierto ? Math.abs(c.fem) : c.fem);
      Tt.innerHTML = partesFem ? `${leyenda([['corriente', '', simHTML('ε')], ['corriente', 'discontinua', simHTML('ε', 'mov')], ['corriente', 'punteada', simHTML('ε', 'trans')]])} (${E.u})` : `${simHTML(el.tipo === 'conductor' ? 'V' : 'ε')} (${E.u})`;
      Lc.textContent = conPrefijo(abierto ? Math.abs(c.fem) : c.fem, 'V');
    } else if (tipo === 'corriente') {
      if (el.tipo === 'conductor') { vacia(n, 'Sin circuito cerrado: I = 0'); return; }
      const E = una([serie(i, q => q.I)], 'A', 'corriente', 'I', c.I);
      Tt.innerHTML = `${simHTML('I')} (${E.u})`; Lc.textContent = conPrefijo(c.I, 'A');
    } else if (tipo === 'velocidad') {
      if (el.tipo === 'generador') { vacia(n, 'La bobina gira con ω constante'); return; }
      const vt = velocidadLimite(el), extra = vt != null ? [{ tramos: [[[0, vt], [ESC.duracion, vt]]], familia: 'texto-3', auxiliar: true, etiqueta: 'terminal' }] : [];
      if (el.tipo === 'rieles') {
        const s = el.barras.map((b, k) => serie(i, q => q.v[k]));
        const E = una(s, 'm/s', 'movimiento', 'v', c.v[0], extra);
        Tt.innerHTML = el.barras.length > 1 ? `${leyenda([['movimiento', '', simHTML('v', '1')], ['movimiento', 'discontinua', simHTML('v', '2')]])} (${E.u})` : `${simHTML('v')} (${E.u})`;
        Lc.textContent = conPrefijo(c.v[0], 'm/s');
      } else {
        const eje = el.tipo === 'espira' && el.ejes === 'y' ? 1 : el.tipo === 'espira' && el.ejes === 'x' ? 0 : null;
        const s = [serie(i, q => (eje == null ? Math.hypot(q.vel[0], q.vel[1]) : q.vel[eje]))], actual = eje == null ? Math.hypot(...c.vel) : c.vel[eje];
        const E = una(s, 'm/s', 'movimiento', 'v', actual, vt != null ? [{ ...extra[0], tramos: [[[0, -vt], [ESC.duracion, -vt]]] }] : []);
        Tt.innerHTML = `${simHTML('v', eje == null ? '' : eje ? 'y' : 'x', false)} (${E.u})`; Lc.textContent = conPrefijo(actual, 'm/s');
      }
    } else if (tipo === 'fuerza') {
      if (el.tipo === 'generador' || el.tipo === 'conductor') { vacia(n, 'Sin fuerza magnética que graficar'); return; }
      const s = el.tipo === 'rieles' ? el.barras.map((b, k) => serie(i, q => q.Fmag[k])) : [serie(i, q => Math.hypot(...q.fuerzaTotal))];
      const actual = el.tipo === 'rieles' ? c.Fmag[0] : Math.hypot(...c.fuerzaTotal), E = una(s, 'N', 'interaccion', 'F', actual);
      Tt.innerHTML = `${simHTML('F', 'B', false)} (${E.u})`; Lc.textContent = conPrefijo(actual, 'N');
    } else if (tipo === 'posicion') {
      if (el.tipo === 'generador') { vacia(n, 'La bobina no se traslada'); return; }
      const fu = FU(), s = el.tipo === 'rieles' ? el.barras.map((b, k) => serie(i, q => q.s[k] / fu)) : [serie(i, q => q.centro[0] / fu), serie(i, q => q.centro[1] / fu)];
      const series = s.map((x, k) => ({ tramos: [x], familia: 'tinta', patron: k ? 'discontinuo' : 'continuo' })), actual = el.tipo === 'rieles' ? c.s[0] / fu : c.centro[0] / fu;
      grafica(cv, { x: xr, y: rango(s.flat().map(p => p[1]), false), series, cursor: t, puntoCursor: [t, actual], eventos });
      Tt.innerHTML = el.tipo === 'rieles' ? `${el.barras.length > 1 ? leyenda([['tinta', '', simHTML('s', '1')], ['tinta', 'discontinua', simHTML('s', '2')]]) : simHTML('s')} (${U()})` : `${leyenda([['tinta', '', simHTML('x')], ['tinta', 'discontinua', simHTML('y')]])} (${U()})`;
      Lc.textContent = `${fmt(actual, 4)}${ESP}${U()}`;
    } else if (tipo === 'potencia') {
      const Rt = el.tipo === 'rieles' ? (el.barras.length === 2 ? el.barras[0].r + el.barras[1].r : el.R + el.barras[0].r) : el.R;
      const pj = serie(i, q => Rt * q.I * q.I), pm = SIM.muestras.map((m, k) => { const a = SIM.muestras[Math.max(0, k - 1)], b = SIM.muestras[Math.min(SIM.muestras.length - 1, k + 1)], qa = a.circuitos[i], qb = b.circuitos[i]; return [m.t, (qb.WF + qb.Wg + qb.Wext + qb.Wcampo - qa.WF - qa.Wg - qa.Wext - qa.Wcampo) / ((b.t - a.t) || 1)]; });
      const E = escalaSI(Math.max(...pj.map(p => Math.abs(p[1])), ...pm.map(p => Math.abs(p[1]))), 'W'), sc = s => s.map(([a, b]) => [a, b / E.f]);
      grafica(cv, { x: xr, y: rango([...pj, ...pm].map(p => p[1] / E.f), true), series: [{ tramos: [sc(pj)], familia: 'termico' }, { tramos: [sc(pm)], familia: 'tinta', patron: 'discontinuo' }], cursor: t, puntoCursor: [t, Rt * c.I * c.I / E.f], eventos });
      Tt.innerHTML = `${leyenda([['termico', '', simHTML('P', 'J')], ['tinta', 'discontinua', simHTML('P', 'entra')]])} (${E.u})`;
      Lc.textContent = conPrefijo(Rt * c.I * c.I, 'W');
    } else vacia(n, '');
  }
  function cabecerasGraficas() { ESC.graficas.forEach((g, j) => { const tt = $(`#t${j + 1}`); if (tt && GRAFICAS[g] && !tt.innerHTML) tt.textContent = GRAFICAS[g].nombre; }); }
  document.querySelectorAll('[data-cab-grafica]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    const j = Number(b.dataset.cabGrafica);
    menuFlotante(b, '<div class="menu-titulo">Qué muestra la gráfica</div>' + Object.entries(GRAFICAS).map(([k, g]) => `<div class="menu-item" role="menuitem" data-v="${k}"${k === ESC.graficas[j] ? ' aria-current="true"' : ''}><svg class="ico"><use href="#i-grafica"/></svg>${g.nombre}</div>`).join(''), v => {
      if (!GRAFICAS[v]) return; ESC.graficas[j] = v; registrar(); graficas();
    });
  }));
  function menuFlotante(boton, html, alElegir) {
    const m = $('#menu-flotante');
    if (!m.hidden && m.dataset.desde === boton.id) { m.hidden = true; return; }
    const r = boton.getBoundingClientRect();
    m.innerHTML = html; m.style.left = Math.min(r.left, innerWidth - 300) + 'px'; m.style.top = 'auto'; m.style.bottom = (innerHeight - r.top + 4) + 'px'; m.hidden = false; m.dataset.desde = boton.id;
    if (r.top < innerHeight / 2) { m.style.bottom = 'auto'; m.style.top = (r.bottom + 4) + 'px'; }
    m.onclick = ev => { const it = ev.target.closest('.menu-item'); if (!it) return; m.hidden = true; alElegir(it.dataset.v); };
  }
  document.addEventListener('pointerdown', ev => { if (!(ev.target instanceof Element) || !ev.target.closest('#menu-flotante, [data-cab-grafica]')) $('#menu-flotante').hidden = true; });

  // ---------------------------------------------------------------------
  // Registro de energía: el trabajo mecánico que se convierte en calor
  // ---------------------------------------------------------------------
  function energiaPanel() {
    const i = circSel(), est = estado();
    if (!SIM || i < 0 || CIRC[i].tipo === 'conductor') { $('#barras').innerHTML = `<div class="barras-tit">Registro de energía</div><span class="u">${SIM && i >= 0 ? 'Un conductor abierto no disipa energía.' : '—'}</span>`; grafica($('#g4'), { x: { min: 0, max: 1 }, y: { min: 0, max: 1 }, series: [] }); $('#t4').textContent = ''; return; }
    const el = CIRC[i], c = est.circuitos[i], b = balanceInduccion(SIM, est, i), E = escalas(), hayL = el.L > 0;
    const libre = el.tipo === 'rieles' ? el.barras.some(q => !q.impuesta) : el.tipo === 'espira' && !el.impuesta;
    const hayF = el.tipo === 'rieles' && el.barras.some(q => q.F && !q.impuesta), hayG = (el.tipo === 'rieles' && el.inclinacion > 0) || (el.tipo === 'espira' && el.gravedad && !el.impuesta);
    const hayExt = el.tipo === 'generador' || (el.tipo === 'rieles' && el.barras.some(q => q.impuesta)) || (el.tipo === 'espira' && el.impuesta);
    const hayCampo = ESC.elementos.some(e => (e.tipo === 'region' || e.tipo === 'hilo') && e.variacion), hayFr = el.tipo === 'rieles' && el.barras.some(q => q.mu > 0);
    const filas = [];
    if (hayF) filas.push(['Trabajo de la fuerza F', 'W', 'F', 'trabajo', c.WF, 'Trabajo de F a lo largo de los rieles|Work of the applied force']);
    if (hayG) filas.push(['Trabajo de la gravedad', 'W', 'g', 'cambio', c.Wg, 'Energía potencial gravitatoria que se pierde|Work of gravity']);
    if (hayExt) filas.push([el.tipo === 'generador' ? 'Trabajo del motor' : 'Trabajo del agente', 'W', 'ext', 'trabajo', c.Wext, 'Trabajo de quien mantiene el movimiento|External work']);
    if (hayCampo) filas.push(['Del campo variable', 'W', 'campo', 'magnetico', c.Wcampo, 'La que entrega el campo que cambia (fem de transformador)|Energy from the changing field']);
    if (libre) filas.push(['Energía cinética ganada', 'ΔK', '', 'movimiento', b.dK, 'K(t) − K(0)|Kinetic energy gained']);
    if (hayL) filas.push(['Energía en L', 'ΔU', 'L', 'magnetico', b.dUL, '½·L·I²|Magnetic energy']);
    filas.push(['Calor de Joule', 'Q', 'J', 'termico', b.QJ, 'Calor disipado en las resistencias, ∫I²R dt|Joule heat']);
    if (hayFr) filas.push(['Calor de fricción', 'Q', 'f', 'termico', b.Qf, 'Calor de la fricción con los rieles|Friction heat']);
    const conSigno = filas.some(f => f[4] < -1e-12 * E.eref), esc = Math.max(...filas.map(f => Math.abs(f[4])), 1e-30);
    const fondo = fam => (fam === 'trabajo' ? 'repeating-linear-gradient(90deg, var(--tinta) 0 6px, transparent 6px 9px)' : `var(--f-${fam})`);
    $('#barras').className = 'barras' + (conSigno ? ' con-signo' : '');
    $('#barras').innerHTML = '<div class="barras-tit">Registro de energía</div>' + filas.map(([nom, s1, s2, fam, val, ay]) => {
      const w = Math.min(100, Math.abs(val) / esc * 100), estilo = conSigno ? `left:${val >= 0 ? 50 : 50 - w / 2}%;width:${w / 2}%` : `width:${w}%`;
      return `<div class="barra-e" data-ayuda="${ay}"><span>${nom}</span><span class="riel"><i style="${estilo};background:${fondo(fam)}"></i></span><span class="v">${partes(val, 'J', 4).join(ESP)}</span></div>`;
    }).join('') + `<div class="barras-pie">entradas − Δ<span class="sim">K</span> − Δ<span class="sim">U</span> − <span class="sim">Q</span> = ${conPrefijo(b.residuo, 'J', 2)}</div>`;
    // Energías contra t
    const Es = escalaSI(E.eref, 'J'), W = [], K = [], Q = [], UL = [], K0 = SIM.muestras[0].circuitos[i].K;
    for (const m of SIM.muestras) { const q = m.circuitos[i]; W.push([m.t, (q.WF + q.Wg + q.Wext + q.Wcampo) / Es.f]); K.push([m.t, (q.K - K0) / Es.f]); Q.push([m.t, (q.QJ + q.Qf) / Es.f]); UL.push([m.t, q.UL / Es.f]); }
    const series = [{ tramos: [W], familia: 'tinta', patron: 'discontinuo' }, { tramos: [Q], familia: 'termico' }];
    if (libre) series.push({ tramos: [K], familia: 'movimiento' });
    if (hayL) series.push({ tramos: [UL], familia: 'magnetico' });
    grafica($('#g4'), { x: { min: 0, max: ESC.duracion }, y: rango(series.flatMap(s => s.tramos[0].map(p => p[1])), true), series, cursor: t, eventos: SIM.eventos.filter(e => e.t > 0).map(e => ({ x: e.t })) });
    $('#t4').innerHTML = `${leyenda([['tinta', 'discontinua', simHTML('W')], ['termico', '', simHTML('Q')], ...(libre ? [['movimiento', '', `Δ${simHTML('K')}`]] : []), ...(hayL ? [['magnetico', '', simHTML('U', 'L')]] : [])])} <span class="u">(${Es.u})</span>`;
    $('#l4').textContent = '';
  }

  // ---------------------------------------------------------------------
  // Eventos, tabla y exportación
  // ---------------------------------------------------------------------
  function tablas() {
    if (!SIM) { $('#t-eventos').innerHTML = `<tr><td class="texto">${ERROR || 'Sin simulación'}</td></tr>`; $('#t-datos').innerHTML = ''; return; }
    $('#t-eventos').innerHTML = '<tr><th>Evento</th><th>t (s)</th></tr>' + (SIM.eventos.length ? SIM.eventos.map(e => `<tr class="${Math.abs(e.t - t) < ESC.duracion / 400 ? 'actual' : ''}"><td class="texto">${e.nombre}</td><td>${fmt(e.t, 5)}</td></tr>`).join('') : '<tr><td class="texto" colspan="2">Sin eventos: los circuitos no cruzan bordes ni se detienen.</td></tr>');
    const i = circSel(); if (i < 0) { $('#t-datos').innerHTML = ''; return; }
    const el = CIRC[i], fu = FU();
    let filas = `<tr><th>t (s)</th><th>Φ (Wb)</th><th>ε (V)</th><th>I (A)</th>${el.tipo === 'rieles' ? `<th>s (${U()})</th><th>v (m/s)</th><th>F (N)</th>` : el.tipo === 'espira' || el.tipo === 'conductor' ? `<th>x (${U()})</th><th>y (${U()})</th><th>v (m/s)</th>` : ''}<th>Q (J)</th></tr>`;
    for (let j = 0; j <= 100; j++) {
      const tt = ESC.duracion * j / 100, c = estadoInduccion(SIM, tt).circuitos[i];
      const extra = el.tipo === 'rieles' ? `<td>${fmt(c.s[0] / fu, 4)}</td><td>${fmt(c.v[0], 4)}</td><td>${fmt(c.Fmag[0], 4)}</td>` : el.tipo === 'espira' || el.tipo === 'conductor' ? `<td>${fmt(c.centro[0] / fu, 4)}</td><td>${fmt(c.centro[1] / fu, 4)}</td><td>${fmt(Math.hypot(...c.vel), 4)}</td>` : '';
      filas += `<tr class="${Math.abs(tt - t) < ESC.duracion / 200 ? 'actual' : ''}"><td>${fmt(tt, 4)}</td><td>${fmt(c.phi, 4)}</td><td>${fmt(c.fem, 4)}</td><td>${fmt(c.I, 4)}</td>${extra}<td>${fmt(c.QJ, 4)}</td></tr>`;
    }
    $('#t-datos').innerHTML = filas;
  }
  function exportarCSV() {
    const i = circSel(); if (!SIM || i < 0) { avisar('Sin simulación que exportar', false); return; }
    const el = CIRC[i], filas = SIM.muestras.map(m => { const c = m.circuitos[i]; return [m.t, c.phi, c.fem, c.femMov, c.femTrans, c.I, ...(el.tipo === 'rieles' ? [c.s[0], c.v[0], c.Fmag[0]] : c.centro ? [c.centro[0], c.centro[1], Math.hypot(...c.vel)] : ['', '', '']), c.K, c.QJ, c.Qf, c.WF + c.Wg + c.Wext + c.Wcampo]; });
    const cols = ['t (s)', 'Φ (Wb)', 'ε (V)', 'ε mov (V)', 'ε trans (V)', 'I (A)', ...(el.tipo === 'rieles' ? ['s (m)', 'v (m/s)', 'F (N)'] : ['x (m)', 'y (m)', 'v (m/s)']), 'K (J)', 'Q Joule (J)', 'Q fricción (J)', 'W entrada (J)'];
    descargarTexto(`${nombreArchivo(ESC.titulo)}-${nombreArchivo(el.nombre)}.csv`, aCSV(cols, filas))
      .then(r => { if (r) avisarLienzo(area, `Datos exportados: ${filas.length} filas`); }, e => avisar(`No se pudo exportar: ${e}`, false));
  }
  function exportarEventos() {
    if (!SIM) return;
    descargarTexto(`${nombreArchivo(ESC.titulo)}-eventos.csv`, aCSV(['evento', 't (s)'], SIM.eventos.map(e => [e.nombre, e.t])))
      .then(r => { if (r) avisarLienzo(area, `Eventos exportados: ${SIM.eventos.length}`); });
  }
  function exportarPNG() { descargarLienzo(lienzo, `${nombreArchivo(ESC.titulo)}-t${fmt(t, 3)}s.png`).then(r => { if (r) avisarLienzo(area, 'Imagen del lienzo exportada'); }); }
  $('#b-exportar').addEventListener('click', exportarCSV);

  // ---------------------------------------------------------------------
  // Ciclo
  // ---------------------------------------------------------------------
  const lt = new LineaTiempo($('#tl'), { duracion: 1, eventos: [], alCambiar: nt => { t = nt; jugando = false; todo(); } });
  function todo() {
    dibujar(); lecturas(); lt.poner(t); graficas();
    if (!$('#p-energia').hidden) energiaPanel();
    if (!$('#p-eventos').hidden || !$('#p-tabla').hidden) tablas();
  }
  function recalcular() {
    simular();
    const fin = SIM ? SIM.tFin : ESC.duracion;
    lt.duracion = ESC.duracion; lt.simulado = fin;
    lt.eventos = SIM ? SIM.eventos.filter(e => e.t > 0).map(e => ({ t: e.t, nombre: e.nombre })) : [];
    t = Math.min(t, ESC.duracion);
    if (ERROR) avisar(ERROR, false);
    else if (SIM && SIM.incompleta) avisar(SIM.incompleta.motivo, false);
    if (!vistaTocada) encuadrar();
    todo();
    if (autoguardar) autoguardado.guardar('magnetismo-induccion', escenaActual());
  }
  function cambio() { aplicarVariables(); recalcular(); registrar(); inspector(); }
  function titulo() {
    $('#escena-nombre').textContent = ESC.titulo;
    const chip = $('#escena-chip');
    chip.textContent = ESC.tipo === 'MEXT' ? `MEXT ${ESC.anio || ''}`.trim() : ESC.tipo || 'Propio';
    chip.className = 'chip' + (ESC.tipo === 'MEXT' ? ' lleno' : '');
    document.title = `Volta · Inducción · ${ESC.titulo}`;
    document.querySelectorAll('.capa-btn').forEach(b => b.setAttribute('aria-pressed', String(!!ESC.capas[b.dataset.capa])));
  }
  let relojAviso = null;
  function avisar(txt, conDeshacer = true) {
    $('#aviso-texto').textContent = txt; $('#aviso').hidden = false;
    $('#aviso-deshacer').hidden = !conDeshacer || !historial?.puedeDeshacer;
    clearTimeout(relojAviso); relojAviso = setTimeout(() => { $('#aviso').hidden = true; }, conDeshacer ? 5000 : 4000);
  }
  $('#aviso-deshacer').addEventListener('click', () => deshacer());

  // ---------------------------------------------------------------------
  // Ediciones
  // ---------------------------------------------------------------------
  const nuevoId = () => { let id; do { id = 'e' + (++contador); } while (elDe(id)); return id; };
  function nombreNuevo(base) { let k = 1; while (ESC.elementos.some(e => e.nombre === `${base} ${k}`)) k++; return `${base} ${k}`; }
  function crear(h, p) {
    const S = 90 / tz.vista.escala, r = x => Number(x.toPrecision(3)), s = r(S);
    if (h === 'barra') {
      // Sobre los rieles más cercanos: su s es la proyección del clic
      const rs = ESC.elementos.filter(e => e.tipo === 'rieles');
      if (!rs.length) { avisar('Coloca primero unos rieles: la barra va sobre ellos', false); return; }
      const e = rs.map(q => { const { u } = ejesRieles(q), sp = (p[0] - q.origen[0]) * u[0] + (p[1] - q.origen[1]) * u[1]; return { q, sp, d: Math.abs((p[0] - q.origen[0]) * -u[1] + (p[1] - q.origen[1]) * u[0]) }; }).sort((a, b) => a.d - b.d)[0];
      anadirBarra(e.q, Math.max(1e-3 * e.q.largo, Math.min(0.97 * e.q.largo, e.sp)));
      return;
    }
    const tablas = {
      region: () => ({ tipo: 'region', nombre: nombreNuevo('Región B'), forma: 'rect', centro: p, ancho: r(3 * S), alto: r(2 * S), B: 0.5, variacion: null }),
      hilo: () => ({ tipo: 'hilo', nombre: nombreNuevo('Hilo'), a: p, angulo: Math.PI / 2, I: 10, variacion: null }),
      rieles: () => rieles(nombreNuevo('Rieles'), { origen: p, d: s, largo: r(4 * S), R: 1, barras: [barra('Barra 1', r(1.5 * S), 0.1, { F: 0.5 })] }),
      espira: () => espira(nombreNuevo('Espira'), { centro: p, ancho: s, alto: s, R: 1, v: [r(S / 2), 0] }),
      generador: () => ({ tipo: 'generador', nombre: nombreNuevo('Bobina'), centro: p, ancho: s, alto: s, N: 100, B: 0.2, frecuencia: 2, fase: 0, R: 10, L: 0, carga: 'resistencia' }),
      conductor: () => ({ tipo: 'conductor', nombre: nombreNuevo('Conductor'), centro: p, largo: s, angulo: Math.PI / 2, v: [r(S / 2), 0] }),
    };
    const el = { id: nuevoId(), ...tablas[h]() };
    ESC.elementos.push(el); sel = el.id;
    cambio(); avisar(`${el.nombre} colocado`);
  }
  function anadirBarra(e, s) {
    if (e.barras.length >= 2) { avisar('Unos rieles admiten dos barras como máximo', false); return; }
    const nueva = barra(`Barra ${e.barras.length + 1}`, Number(s.toPrecision(3)), 0.1, { r: 0.5 });
    e.barras.push(nueva); e.barras.sort((a, b) => a.s - b.s);
    if (e.barras.length === 2) { e.barras.forEach(b => { if (!(b.r > 0)) b.r = 0.5; }); e.barras.forEach((b, k) => { b.nombre = `Barra ${k + 1}`; }); }
    limpiarVariables(); sel = `${e.id}:b${e.barras.indexOf(nueva)}`;
    cambio(); avisar(e.barras.length === 2 ? 'Barra añadida: con dos barras, el circuito lo cierran ellas (sin la resistencia de los rieles)' : 'Barra añadida');
  }
  function quitarSeleccion() {
    if (sel === 'regla') { ESC.regla = null; sel = 'escena'; cambio(); avisar('Se quita la regla'); return; }
    const bs = barraSel();
    if (bs && bs.el) {
      if (bs.el.barras.length < 2) { avisar('Los rieles necesitan una barra; quita los rieles si sobran', false); return; }
      const n = bs.el.barras[bs.k].nombre; bs.el.barras.splice(bs.k, 1); bs.el.barras.forEach((b, k) => { b.nombre = `Barra ${k + 1}`; });
      // Las variables ligadas a esa barra se sueltan
      for (const [k, d] of Object.entries(ESC.variables)) { d.liga = d.liga.filter(r => !r.includes('.barras.')); if (!d.liga.length) delete ESC.variables[k]; }
      sel = bs.el.id; construirVariables(); cambio(); avisar(`Se quita ${n}`); return;
    }
    const i = idxDe(sel); if (i < 0) return;
    const nombre = ESC.elementos[i].nombre;
    ESC.elementos.splice(i, 1); limpiarVariables(i); sel = 'escena';
    cambio(); avisar(`Se quita ${nombre}`);
  }
  const posDe = el => (el.tipo === 'hilo' ? el.a : el.tipo === 'rieles' ? el.origen : el.forma === 'poligono' ? el.puntos[0] : el.centro);
  function moverA(el, p) {
    const c = posDe(el), d = [p[0] - c[0], p[1] - c[1]];
    if (el.tipo === 'hilo') el.a = p; else if (el.tipo === 'rieles') el.origen = p;
    else if (el.forma === 'poligono') el.puntos = el.puntos.map(q => [q[0] + d[0], q[1] + d[1]]);
    else el.centro = p;
  }
  function duplicar() {
    const el = elDe(sel); if (!el || barraSel()) return;
    const c = JSON.parse(JSON.stringify(el)), d = 20 / tz.vista.escala;
    c.id = nuevoId(); c.nombre = texto(`${el.nombre} (copia)`, 'Copia', 40);
    const p = posDe(c); moverA(c, [p[0] + d, p[1] - d]);
    ESC.elementos.push(c); sel = c.id; cambio(); avisar(`${c.nombre} duplicado`);
  }

  // ---------------------------------------------------------------------
  // Escena: guardar, abrir, autoguardado, deshacer
  // ---------------------------------------------------------------------
  const copia = o => JSON.parse(JSON.stringify(o));
  const instantanea = () => { const o = copia(ESC); o.sel = sel; return o; };
  function escenaActual() { return crearEscena({ modulo: 'magnetismo', espacio: 'induccion', titulo: ESC.titulo, datos: instantanea() }); }
  const RUTA_OK = /^(duracion|elementos\.\d{1,2}\.((centro|a|origen|v)\.[01]|B|I|R|L|N|m|largo|ancho|alto|separacion|angulo|inclinacion|frecuencia|fase|variacion\.(pendiente|amplitud|frecuencia|inicio|fin)|barras\.[01]\.(s|v|m|r|mu|F|angulo)))$/;
  const TIPOS_OK = Object.keys(TIPOS);
  function variacionSegura(o) {
    if (!o || typeof o !== 'object') return null;
    if (o.tipo === 'rampa') return { tipo: 'rampa', pendiente: numero(o.pendiente, 0, -1e6, 1e6), inicio: numero(o.inicio, 0, 0, 1e3), fin: numero(o.fin, 1, 0, 1e3) };
    if (o.tipo === 'senoidal') return { tipo: 'senoidal', amplitud: numero(o.amplitud, 0, -1e6, 1e6), frecuencia: numero(o.frecuencia, 1, 0, 1e4), fase: numero(o.fase, 0, -100, 100) };
    return null;
  }
  // Valida y acota lo que viene de un archivo antes de usarlo (entrada no confiable)
  function datosSeguros(d = {}) {
    const base = completa(ESCENAS.find(e => e.clave === d.clave) || ESCENAS[0]);
    const pos = (v, def, min = 1e-9, max = 1e5) => numero(v, def, min, max);
    const coord = (p, def = [0, 0]) => (Array.isArray(p) && p.length === 2 ? [numero(p[0], def[0], -1e5, 1e5), numero(p[1], def[1], -1e5, 1e5)] : def.slice());
    const ang = v => numero(v, 0, -100, 100), vel = v => coord(v, [0, 0]).map(x => Math.max(-1e4, Math.min(1e4, x)));
    const elementos = [], ids = new Set();
    for (const o of (Array.isArray(d.elementos) ? d.elementos : []).slice(0, 40)) {
      if (!o || typeof o !== 'object' || !TIPOS_OK.includes(o.tipo)) continue;
      let id = texto(o.id, '', 8); if (!/^e\d{1,4}$/.test(id) || ids.has(id)) { do { id = 'e' + (++contador); } while (ids.has(id)); }
      ids.add(id);
      const e = { id, tipo: o.tipo, nombre: texto(o.nombre, TIPOS[o.tipo].nombre, 40) };
      switch (o.tipo) {
        case 'region': {
          const pol = Array.isArray(o.puntos) && o.puntos.length >= 3 && o.puntos.length <= 200 ? o.puntos.map(p => coord(p)) : null;
          if (o.forma === 'poligono' && pol) Object.assign(e, { forma: 'poligono', puntos: pol }); else Object.assign(e, { forma: 'rect', centro: coord(o.centro), ancho: pos(o.ancho, 1), alto: pos(o.alto, 1) });
          Object.assign(e, { B: numero(o.B, 0.5, -100, 100), variacion: variacionSegura(o.variacion) });
          break;
        }
        case 'hilo': Object.assign(e, { a: coord(o.a), angulo: ang(o.angulo), I: numero(o.I, 10, -1e6, 1e6), variacion: variacionSegura(o.variacion) }); break;
        case 'rieles': {
          const bs = (Array.isArray(o.barras) ? o.barras : []).slice(0, 2).filter(b => b && typeof b === 'object').map((b, k) => ({ nombre: texto(b.nombre, `Barra ${k + 1}`, 20), s: numero(b.s, 0.1, -1e5, 1e5), m: pos(b.m, 0.1, 1e-9, 1e6), v: numero(b.v, 0, -1e4, 1e4), r: numero(b.r, 0, 0, 1e6), mu: numero(b.mu, 0, 0, 10), F: numero(b.F, 0, -1e6, 1e6), impuesta: !!b.impuesta, angulo: numero(b.angulo, 0, -80 * GR, 80 * GR) }));
          Object.assign(e, { origen: coord(o.origen), angulo: ang(o.angulo), separacion: pos(o.separacion, 0.5), largo: pos(o.largo, 2), cerrado: o.cerrado !== false, R: numero(o.R, 1, 0, 1e9), L: numero(o.L, 0, 0, 1e6), inclinacion: numero(o.inclinacion, 0, 0, Math.PI / 2 - 0.01), bVertical: !!o.bVertical, barras: bs.length ? bs.sort((a, b) => a.s - b.s) : [barra('Barra 1', 0.2, 0.1)] });
          e.barras.forEach(b => { b.s = Math.max(1e-3 * e.largo, Math.min(0.999 * e.largo, b.s)); });
          if (e.barras.length === 2 && e.barras[1].s <= e.barras[0].s) e.barras[1].s = Math.min(0.999 * e.largo, e.barras[0].s + 0.1 * e.largo);
          if (e.cerrado && e.barras.length === 1 && !(e.R + e.barras[0].r > 0) && !(e.L > 0)) e.R = 1;
          break;
        }
        case 'espira': Object.assign(e, { centro: coord(o.centro), ancho: pos(o.ancho, 0.1), alto: pos(o.alto, 0.1), N: Math.round(numero(o.N, 1, 1, 1e5)), R: numero(o.R, 1, 0, 1e9), L: numero(o.L, 0, 0, 1e6), m: pos(o.m, 0.05, 1e-9, 1e6), v: vel(o.v), impuesta: o.impuesta !== false, gravedad: !!o.gravedad, ejes: ['x', 'y', 'xy'].includes(o.ejes) ? o.ejes : 'xy', vertices: Array.isArray(o.vertices) && o.vertices.length === 4 ? o.vertices.map(x => texto(x, '', 2)) : null }); if (!(e.R > 0) && !(e.L > 0)) e.R = 1; break;
        case 'generador': Object.assign(e, { centro: coord(o.centro), ancho: pos(o.ancho, 0.1), alto: pos(o.alto, 0.1), N: Math.round(numero(o.N, 100, 1, 1e5)), B: numero(o.B, 0.2, -100, 100), frecuencia: numero(o.frecuencia, 2, 0, 1e4), fase: ang(o.fase), R: numero(o.R, 10, 0, 1e9), L: numero(o.L, 0, 0, 1e6), carga: o.carga === 'bombilla' ? 'bombilla' : 'resistencia' }); if (!(e.R > 0) && !(e.L > 0)) e.R = 10; break;
        case 'conductor': Object.assign(e, { centro: coord(o.centro), largo: pos(o.largo, 1), angulo: ang(o.angulo), v: vel(o.v) }); break;
        default: break;
      }
      elementos.push(e);
    }
    const variables = {};
    for (const [k, v] of Object.entries(d.variables && typeof d.variables === 'object' ? d.variables : {})) {
      if (!v || !Array.isArray(v.liga) || !/^[A-Za-z]\w{0,7}$/.test(k)) continue;
      const min = numero(v.min, 0, -1e9, 1e9), max = Math.max(min, numero(v.max, 1, -1e9, 1e9));
      const liga = v.liga.filter(r => typeof r === 'string' && RUTA_OK.test(r) && (r === 'duracion' || +r.split('.')[1] < elementos.length));
      if (!liga.length) continue;
      const factores = {};
      if (v.factores && typeof v.factores === 'object') for (const r of liga) if (typeof v.factores[r] === 'number' && Number.isFinite(v.factores[r])) factores[r] = numero(v.factores[r], 1, -1e15, 1e15);
      variables[k] = { sim: texto(v.sim, k, 5), sub: v.sub ? texto(v.sub, '', 4) : undefined, val: numero(v.val, min, min, max), min, max, paso: pos(v.paso, 0.1, 1e-9, 1e9), u: Object.keys(FAC).includes(v.u) ? v.u : '', factor: numero(v.factor, 1, -1e15, 1e15) || 1, liga, factores };
    }
    const capas = {};
    for (const k of Object.keys(base.capas)) capas[k] = typeof d.capas?.[k] === 'boolean' ? d.capas[k] : !!base.capas[k];
    const regla = Array.isArray(d.regla) && d.regla.length === 2 ? [coord(d.regla[0]), coord(d.regla[1])] : null;
    const selOk = s => typeof s === 'string' && (s === 'escena' || elementos.some(e => e.id === s.split(':')[0]));
    return {
      clave: ESCENAS.some(e => e.clave === d.clave) ? d.clave : 'propio', titulo: texto(d.titulo, base.titulo, 80),
      tipo: ['Tutorial', 'Ejemplo', 'MEXT', 'Propio'].includes(d.tipo) ? d.tipo : 'Propio', anio: d.anio ? texto(d.anio, '', 14) : undefined,
      unidad: ['mm', 'cm', 'm'].includes(d.unidad) ? d.unidad : 'm', duracion: numero(d.duracion, base.duracion, 1e-6, 1e3), elementos, variables, regla, capas,
      graficas: Array.isArray(d.graficas) && d.graficas.length === 3 && d.graficas.every(g => GRAFICAS[g]) ? d.graficas.slice() : base.graficas.slice(),
      caja: Array.isArray(d.caja) && d.caja.length === 4 && d.caja.every(Number.isFinite) && d.caja[1] > d.caja[0] && d.caja[3] > d.caja[2] ? d.caja.map(x => numero(x, 0, -1e5, 1e5)) : null,
      sel: selOk(d.sel) ? d.sel : 'escena',
      nota: typeof d.nota === 'string' ? texto(d.nota, '', 400) : '',
    };
  }
  function restaurar(d) {
    ESC = datosSeguros(d); aplicarVariables();
    if (!(sel === 'escena' || (sel === 'regla' && ESC.regla) || elDe(sel))) sel = ESC.sel || 'escena';
    titulo(); construirVariables(); recalcular(); inspector();
  }
  function botonesHistorial() { $('#b-deshacer').disabled = !historial?.puedeDeshacer; $('#b-rehacer').disabled = !historial?.puedeRehacer; }
  const sinSel = o => { delete o.sel; return o; };
  function registrar() { if (historial && historial.registrar(sinSel(instantanea()))) botonesHistorial(); }
  function deshacer() { const d = historial?.deshacer(); if (d) { restaurar(d); botonesHistorial(); avisar('Cambio deshecho', false); } }
  function rehacer() { const d = historial?.rehacer(); if (d) { restaurar(d); botonesHistorial(); avisar('Cambio rehecho', false); } }
  $('#b-deshacer').addEventListener('click', deshacer);
  $('#b-rehacer').addEventListener('click', rehacer);

  async function abrirEscena1(clave) {
    if (hayCambios() && !(await confirmarCambios('cambiar de escena'))) return;
    ESC = completa(escenaDe(clave)); aplicarVariables();
    sel = ESC.sel || 'escena'; vistaTocada = false; herramienta = null; marcarHerramienta(); t = 0; jugando = false;
    titulo(); construirVariables(); recalcular(); inspector();
    escala0 = tz.vista.escala; zoomTexto();
    if (historial) { historial.reiniciar(sinSel(instantanea())); botonesHistorial(); }
    documentoNuevo();
  }
  function guardar() { guardarEscena(escenaActual()).then(r => { if (r) avisar('Escena guardada', false); }, e => avisar(`No se pudo guardar: ${e}`, false)); }
  const PAGINAS = { campos: 'magnetismo.html', particulas: 'magnetismo-particulas.html', induccion: 'magnetismo-induccion.html' };
  // Una escena de otro espacio de Magnetismo se abre en su pantalla
  function aOtroEspacio(e, propio) {
    if (!e.espacio || e.espacio === propio || !PAGINAS[e.espacio]) return false;
    try { sessionStorage.setItem('volta.abrir', JSON.stringify(e)); } catch { /* sin almacenamiento */ }
    location.href = PAGINAS[e.espacio];
    return true;
  }
  function abrir() {
    abrirEscena({ modulo: 'magnetismo' }).then(e => {
      if (aOtroEspacio(e, 'induccion')) return;
      sel = 'escena'; t = 0; jugando = false; restaurar(e.datos); vistaTocada = false; encuadrar(); escala0 = tz.vista.escala; zoomTexto(); todo();
      if (historial) { historial.reiniciar(sinSel(instantanea())); botonesHistorial(); }
      avisar(`Escena abierta: ${texto(e.titulo, 'sin título', 60)}`, false);
    }).catch(err => avisar(err.message, false));
  }

  // ---------------------------------------------------------------------
  // Paleta, herramientas, capas y reproducción
  // ---------------------------------------------------------------------
  function marcarHerramienta() {
    document.querySelectorAll('.herr').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.herr === herramienta)));
    lienzo.style.cursor = herramienta ? 'crosshair' : 'default';
  }
  function ponerHerramienta(h) {
    if (h === 'flujo') { alternarCapa('flujo'); avisar(ESC.capas.flujo ? 'Medidor de flujo: el área sombreada es la del circuito dentro del campo; Φ sale en las lecturas' : 'Se oculta el área del flujo', false); marcarHerramienta(); return; }
    if (h === 'amperimetro' || h === 'voltimetro') { alternarCapa('medidores'); avisar(ESC.capas.medidores ? 'Medidores: fem e I junto a cada circuito' : 'Se ocultan los medidores', false); marcarHerramienta(); return; }
    herramienta = herramienta === h ? null : h; marcarHerramienta();
    if (herramienta === 'regla') avisar('Regla: arrastra entre dos puntos · Esc termina', false);
    else if (herramienta) avisar(`${document.querySelector(`.herr[data-herr="${h}"] span`).textContent}: clic en el lienzo para colocarlo · Esc termina`, false);
  }
  document.querySelectorAll('.herr').forEach(b => b.addEventListener('click', () => ponerHerramienta(b.dataset.herr)));
  function ponerCapa(k, on) { ESC.capas[k] = on; document.querySelectorAll(`.capa-btn[data-capa="${k}"]`).forEach(b => b.setAttribute('aria-pressed', String(on))); }
  const alternarCapa = k => { ponerCapa(k, !ESC.capas[k]); registrar(); todo(); };
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => alternarCapa(b.dataset.capa)));
  $('#pest').addEventListener('click', () => setTimeout(todo, 0));

  function cuadro(ahora) {
    if (jugando) {
      const fin = SIM ? SIM.tFin : ESC.duracion, d = Math.min(0.05, (ahora - ultimo) / 1000) * velocidad * ESC.duracion / SEG_PANTALLA;
      t = Math.min(fin, t + d);
      if (t >= fin) jugando = false;
      todo();
    }
    ultimo = ahora;
    requestAnimationFrame(cuadro);
  }
  function alternar() { if (t >= (SIM ? SIM.tFin : ESC.duracion) - 1e-12) t = 0; jugando = !jugando; todo(); }
  const irA = nt => { jugando = false; t = Math.max(0, Math.min(SIM ? SIM.tFin : ESC.duracion, nt)); todo(); };
  const pasoT = () => ESC.duracion / 400;
  $('#b-play').addEventListener('click', alternar);
  $('#b-reiniciar').addEventListener('click', () => irA(0));
  $('#b-atras').addEventListener('click', () => irA(t - pasoT()));
  $('#b-adelante').addEventListener('click', () => irA(t + pasoT()));
  $('#velocidades').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) velocidad = parseFloat(b.dataset.v); });

  // ---------------------------------------------------------------------
  // Lienzo: colocar, seleccionar, arrastrar, girar, zoom y paneo
  // ---------------------------------------------------------------------
  const ajuste = (x, fino) => { const p = pasoAgradable(90 / tz.vista.escala) / (fino ? 100 : 10); return Math.round(x / p) * p; };
  function rutasPos(el, i) { const k = el.tipo === 'hilo' ? 'a' : el.tipo === 'rieles' ? 'origen' : 'centro'; return [`elementos.${i}.${k}.0`, `elementos.${i}.${k}.1`]; }
  lienzo.addEventListener('pointerdown', ev => {
    const r = lienzo.getBoundingClientRect(), X0 = ev.clientX - r.left, Y0 = ev.clientY - r.top, v = tz.vista, w = [v.mx(X0), v.my(Y0)];
    if (ev.button === 1 || ev.button === 2 || espacioPulsado) { paneo = [X0, Y0, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId); return; }
    if (herramienta === 'regla') { const p = [ajuste(w[0]), ajuste(w[1])]; ESC.regla = [p, p.slice()]; arrastre = { tipo: 'regla-nueva' }; lienzo.setPointerCapture(ev.pointerId); return; }
    if (herramienta) { const h = herramienta; if (!ev.shiftKey) { herramienta = null; marcarHerramienta(); } crear(h, [ajuste(w[0]), ajuste(w[1])]); return; }
    const ob = objetoEn(X0, Y0);
    if (ob && ob.id === 'regla') { if (sel !== 'regla') seleccionar('regla'); arrastre = { tipo: ob.asa != null ? 'regla:' + ob.asa : 'regla', w0: w, r0: copia(ESC.regla), movido: false }; lienzo.setPointerCapture(ev.pointerId); return; }
    if (ob) {
      if (sel !== ob.id) seleccionar(ob.id);
      const el = elDe(ob.id);
      // Mover un circuito edita su estado inicial: la escena vuelve a t = 0
      if (ES_CIRCUITO(el.tipo) && t > 0) { t = 0; jugando = false; todo(); }
      const bm = /:b(\d)$/.exec(ob.id);
      arrastre = { tipo: bm ? 'barra' : ob.asa || 'mover', id: ob.id, k: bm ? +bm[1] : -1, w0: w, p0: posDe(el).slice(), s0: bm ? el.barras[+bm[1]].s : 0, movido: false };
      lienzo.setPointerCapture(ev.pointerId); return;
    }
    seleccionar('escena');
    paneo = [X0, Y0, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId);
  });
  lienzo.addEventListener('pointermove', ev => {
    const r = lienzo.getBoundingClientRect(), X0 = ev.clientX - r.left, Y0 = ev.clientY - r.top, v = tz.vista, w = [v.mx(X0), v.my(Y0)];
    $('#cx').textContent = L(w[0], 4); $('#cy').textContent = L(w[1], 4);
    const Bc = campoZ(w, t); $('#cb').textContent = Bc ? conPrefijo(Bc, 'T', 3) : '0';
    if (paneo) { vistaTocada = true; v.ox = paneo[2] + X0 - paneo[0]; v.oy = paneo[3] + Y0 - paneo[1]; dibujar(); return; }
    if (arrastre) {
      const fino = ev.shiftKey, a = arrastre;
      if (a.tipo === 'regla-nueva') ESC.regla[1] = [ajuste(w[0], fino), ajuste(w[1], fino)];
      else if (a.tipo === 'regla:0' || a.tipo === 'regla:1') ESC.regla[+a.tipo.slice(6)] = [ajuste(w[0], fino), ajuste(w[1], fino)];
      else if (a.tipo === 'regla') { const dx = w[0] - a.w0[0], dy = w[1] - a.w0[1]; ESC.regla = a.r0.map(p => [ajuste(p[0] + dx, fino), ajuste(p[1] + dy, fino)]); }
      else {
        const el = elDe(a.id), i = idxDe(a.id);
        if (a.tipo === 'mover') { moverA(el, [ajuste(a.p0[0] + w[0] - a.w0[0], fino), ajuste(a.p0[1] + w[1] - a.w0[1], fino)]); sincronizarVariables(rutasPos(el, i)); }
        else if (a.tipo === 'barra') {
          // La barra se desliza a lo largo de los rieles (sin pasar a la otra)
          const { u } = ejesRieles(el), ds = (w[0] - a.w0[0]) * u[0] + (w[1] - a.w0[1]) * u[1], otras = el.barras.filter((_, k) => k !== a.k).map(b => b.s);
          let s = ajuste(a.s0 + ds, fino); s = Math.max(0.01 * el.largo, Math.min(0.99 * el.largo, s));
          if (otras.length) s = a.k === 0 ? Math.min(s, otras[0] - 0.02 * el.largo) : Math.max(s, otras[0] + 0.02 * el.largo);
          el.barras[a.k].s = s; sincronizarVariables([`elementos.${i}.barras.${a.k}.s`]);
        } else if (a.tipo === 'esq') { el.ancho = Math.max(1e-4, 2 * Math.abs(ajuste(w[0], fino) - el.centro[0])); el.alto = Math.max(1e-4, 2 * Math.abs(ajuste(w[1], fino) - el.centro[1])); sincronizarVariables([`elementos.${i}.ancho`, `elementos.${i}.alto`]); }
        else if (a.tipo === 'giro') {
          const c = v.P(posDe(el)); let g = Math.atan2(c[1] - Y0, X0 - c[0]);
          if (el.tipo === 'rieles') g += Math.PI;  // el asa de los rieles está detrás de la resistencia
          const paso = fino ? 0.1 * GR : 1 * GR; g = Math.round(g / paso) * paso;
          el.angulo = g; sincronizarVariables([`elementos.${i}.angulo`]);
        }
      }
      a.movido = true;
      if (a.tipo.startsWith('regla')) dibujar(); else recalcular();
      return;
    }
    if (herramienta) return;
    const ob = objetoEn(X0, Y0), h = ob ? ob.id : null;
    lienzo.style.cursor = ob ? (ob.asa === 'giro' ? 'grab' : ob.asa != null || /:b\d$/.test(ob.id) ? 'move' : 'pointer') : 'default';
    if (h !== hover) { hover = h; dibujar(); }
  });
  lienzo.addEventListener('pointerup', () => {
    if (arrastre) {
      const a = arrastre; arrastre = null;
      if (a.tipo === 'regla-nueva') {
        const [p, q] = ESC.regla;
        if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9) ESC.regla = null;
        herramienta = null; marcarHerramienta(); sel = ESC.regla ? 'regla' : 'escena'; cambio();
      } else if (a.movido) { if (a.tipo === 'barra') { const el = elDe(a.id); el.barras.sort((x, y) => x.s - y.s); } cambio(); }
    }
    paneo = null;
  });
  lienzo.addEventListener('pointerleave', () => { if (hover) { hover = null; dibujar(); } });
  lienzo.addEventListener('contextmenu', ev => ev.preventDefault());
  lienzo.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = lienzo.getBoundingClientRect();
    vistaTocada = true; tz.vista.zoom(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top);
    zoomTexto(); todo();
  }, { passive: false });
  function zoomTexto() { $('#zoom').textContent = Math.round(tz.vista.escala / escala0 * 100) + ' %'; }
  function zoomCentro(f) { vistaTocada = true; tz.vista.zoom(f, tz.w / 2, tz.h / 2); zoomTexto(); todo(); }
  function encuadrarTodo() { vistaTocada = false; encuadrar(); escala0 = tz.vista.escala; zoomTexto(); todo(); }
  $('#b-zoom-mas').addEventListener('click', () => zoomCentro(1.25));
  $('#b-zoom-menos').addEventListener('click', () => zoomCentro(0.8));
  $('#b-encuadrar').addEventListener('click', encuadrarTodo);

  // ---------------------------------------------------------------------
  // Menú de escenas y paleta de comandos
  // ---------------------------------------------------------------------
  const ICONO_TIPO = { Tutorial: 'i-tutorial', Ejemplo: 'i-ejemplo', MEXT: 'i-mext' };
  function menuEscenas() {
    const m = $('#menu-escenas');
    if (!m.hidden) { m.hidden = true; return; }
    m.innerHTML = [['Tutorial', 'Tutoriales'], ['Ejemplo', 'Ejemplos'], ['MEXT', 'MEXT']].map(([g, tit], i) => (i ? '<div class="menu-sep"></div>' : '') + `<div class="menu-titulo">${tit}</div>` + ESCENAS.filter(e => e.tipo === g).map(e =>
      `<div class="menu-item" role="menuitem" data-clave="${e.clave}"${ESC.clave === e.clave ? ' aria-current="true"' : ''}><svg class="ico"><use href="#${ICONO_TIPO[g]}"/></svg>${e.titulo}${e.anio ? `<span class="chip lleno">${e.anio}</span>` : ''}</div>`).join('')).join('');
    const r = $('#b-escenas').getBoundingClientRect();
    m.style.left = r.left + 'px'; m.style.top = (r.bottom + 4) + 'px'; m.hidden = false;
  }
  $('#b-escenas').addEventListener('click', ev => { ev.stopPropagation(); menuEscenas(); });
  $('#menu-escenas').addEventListener('click', ev => { const it = ev.target.closest('.menu-item'); if (!it) return; $('#menu-escenas').hidden = true; abrirEscena1(it.dataset.clave); });
  document.addEventListener('pointerdown', ev => { if (!(ev.target instanceof Element) || !ev.target.closest('#menu-escenas, #b-escenas')) $('#menu-escenas').hidden = true; });

  const COMANDOS = [
    ['i-reproducir', 'Reproducir o pausar', 'Espacio', alternar],
    ['i-reiniciar', 'Volver al inicio', 'Inicio', () => irA(0)],
    ['i-encuadrar', 'Encuadrar todo', 'F', encuadrarTodo],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['n-flujo', 'Mostrar u ocultar el área del flujo', '', () => alternarCapa('flujo')],
    ['i-capas', 'Mostrar u ocultar el sentido de la corriente', '', () => alternarCapa('corriente')],
    ['i-capas', 'Mostrar u ocultar las fuerzas', '', () => alternarCapa('fuerzas')],
    ['i-capas', 'Mostrar u ocultar las velocidades', '', () => alternarCapa('velocidad')],
    ['i-capas', 'Mostrar u ocultar la explicación de Lenz', '', () => alternarCapa('lenz')],
    ['n-amperimetro', 'Mostrar u ocultar los medidores', '', () => alternarCapa('medidores')],
    ['n-regla', 'Medir con la regla', 'R', () => ponerHerramienta('regla')],
    ['i-duplicar', 'Duplicar el objeto seleccionado', 'Ctrl D', duplicar],
    ['i-borrar', 'Quitar el objeto seleccionado', 'Supr', quitarSeleccion],
    ['i-historial', 'Restablecer la escena original', '', () => { if (ESCENAS.some(e => e.clave === ESC.clave)) { abrirEscena1(ESC.clave); avisar('Escena original restablecida', false); } }],
    ['i-deshacer', 'Deshacer', 'Ctrl Z', deshacer],
    ['i-rehacer', 'Rehacer', 'Ctrl Y', rehacer],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar],
    ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
    ['i-exportar', 'Exportar los datos del circuito a CSV', '', exportarCSV],
    ['i-tabla', 'Exportar los eventos a CSV', '', exportarEventos],
    ['i-imagen', 'Exportar imagen del lienzo', '', exportarPNG],
    ['o-hilo-corriente', 'Ir a Campos magnéticos', '', () => { location.href = 'magnetismo.html'; }, 'Espacios'],
    ['o-particula-cargada', 'Ir a Partículas en E y B', '', () => { location.href = 'magnetismo-particulas.html'; }, 'Espacios'],
    ...Object.entries({ region: 'una región de campo B', hilo: 'un hilo con corriente', rieles: 'unos rieles', barra: 'una barra sobre los rieles', espira: 'una espira móvil', generador: 'una bobina giratoria', conductor: 'un conductor abierto' })
      .map(([h, tx]) => [document.querySelector(`.herr[data-herr="${h}"] use`)?.getAttribute('href').slice(1) || 'i-mas', `Colocar ${tx}`, '', () => ponerHerramienta(h), 'Objetos']),
    ...ESCENAS.map(e => [ICONO_TIPO[e.tipo], `Abrir escena: ${e.titulo}`, e.tipo === 'MEXT' ? `MEXT ${e.anio}` : e.tipo, () => abrirEscena1(e.clave), 'Escenas']),
  ];
  let selCmd = 0;
  function pintarComandos() {
    const q = $('#cmd-q').value.trim().toLowerCase(), lista = COMANDOS.filter(c => `${c[1]} ${c[2]}`.toLowerCase().includes(q));  // también por el año MEXT o el atajo
    selCmd = Math.min(selCmd, Math.max(0, lista.length - 1));
    let grupo = null, html = '';
    lista.forEach((c, i) => {
      const g = c[4] || 'Acciones';
      if (g !== grupo) { html += `<div class="menu-titulo">${g}</div>`; grupo = g; }
      html += `<div class="menu-item${i === selCmd ? ' activo' : ''}" data-i="${COMANDOS.indexOf(c)}"><svg class="ico"><use href="#${c[0]}"/></svg>${c[1]}<span class="atajo">${c[2]}</span></div>`;
    });
    $('#cmd-lista').innerHTML = html;
    return lista;
  }
  function abrirComandos() { $('#menu-escenas').hidden = true; $('#velo-comandos').hidden = false; $('#cmd-q').value = ''; selCmd = 0; pintarComandos(); $('#cmd-q').focus(); }
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
    if (mod && tecla === 'd') { ev.preventDefault(); duplicar(); return; }
    if (mod) return;
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) alternar(); espacioPulsado = true; return; }
    if (ev.key === 'Escape') { if (herramienta) { herramienta = null; marcarHerramienta(); } $('#menu-escenas').hidden = true; $('#menu-flotante').hidden = true; }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') quitarSeleccion();
    else if (ev.key === 'ArrowRight') irA(t + pasoT());
    else if (ev.key === 'ArrowLeft') irA(t - pasoT());
    else if (ev.key === 'Home') irA(0);
    else if (tecla === 'f') encuadrarTodo();
    else if (tecla === 'r') ponerHerramienta('regla');
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });

  // ---------------------------------------------------------------------
  // Arranque. Parámetros para capturas: ?escena=rieles&t=0.5&sel=e2:b0&pest=energia
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); if (!vistaTocada) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search), limpio = ![...q.keys()].length;
    const pend = escenaPendiente('magnetismo');
    if (pend && aOtroEspacio(pend, 'induccion')) return;
    const previa = (pend && pend.espacio === 'induccion' ? pend : null) || (limpio ? autoguardado.leer('magnetismo-induccion', { modulo: 'magnetismo' }) : null);
    tz.ajustar();
    if (q.has('escena') || !previa) { ESC = completa(escenaDe(q.get('escena') || 'rieles')); sel = ESC.sel || 'escena'; }
    else { ESC = datosSeguros(previa.datos); sel = ESC.sel || 'escena'; }
    aplicarVariables();
    if (q.has('capas')) for (const k of q.get('capas').split(',')) if (k in ESC.capas) ESC.capas[k] = true;
    autoguardar = true;
    registrarDocumento({ clave: 'magnetismo-induccion', escena: escenaActual, origen: (!q.has('escena') && previa) || null, abrir, guardar });
    titulo(); construirVariables();
    recalcular();
    if (q.has('sel')) { const s = q.get('sel'); if (s === 'escena' || elDe(s)) sel = s; }
    if (q.has('t')) t = Math.max(0, Math.min(1, parseFloat(q.get('t')) || 0)) * ESC.duracion;
    inspector(); escala0 = tz.vista.escala; zoomTexto();
    cabecerasGraficas();
    const pe = q.get('pest'); if (pe) { const b = document.querySelector(`#pest [aria-controls="p-${pe}"]`); if (b) b.click(); }
    todo();
    historial = new Historial(sinSel(instantanea())); botonesHistorial();
    requestAnimationFrame(a => { ultimo = a; requestAnimationFrame(cuadro); });
  });
})();
