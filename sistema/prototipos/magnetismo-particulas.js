/* ==========================================================================
   Volta · Magnetismo e inducción — espacio de trabajo «Partículas en E y B»
   Partículas cargadas y fuentes de iones en regiones de campo B
   (perpendicular al plano) y E (en el plano, fijo o alterno), placas
   aceleradoras, placas y pantallas detectoras; lámina Hall con sus
   portadores. La física está en el motor puro sistema/motores/magnetismo.js
   (probado en pruebas/magnetismo.test.js): integrador de Boris, entradas y
   salidas de las regiones localizadas por bisección, impactos con Brent,
   órbitas medidas por ajuste de circunferencia, efecto Hall.
   Misma estructura que magnetismo.js y circuitos.js: escena → motor →
   lienzo → paneles, con transporte y línea de tiempo (la escena entera se
   ve en 8 s a 1×; el reloj da el tiempo físico, en µs o ns).
   Mundo en metros; la pantalla escribe las longitudes en la unidad de la
   escena (cm por defecto).
   Parámetros de URL para capturas: ?escena=…&tema=…&sel=<id>|escena|tr:<k>
   &pest=orbitas|eventos|tabla&t=<fracción de la duración>&capas=…
   ========================================================================== */
import {
  CARGA_ELEMENTAL, MASA_PROTON, MASA_ELECTRON, UMA, simularParticulas, estadoParticula, medirOrbita, tramosEnRegion,
  emitirIones, placasAceleradoras, rectangulo, rapidezAceleracion, hall, hallTransitorio, contiene,
} from '../motores/magnetismo.js';
import { aCSV } from '../nucleo/csv.js';
import { descargarTexto, descargarLienzo, nombreArchivo, avisar as avisarLienzo } from '../componentes/exportar.js';
import { crearEscena, numero, texto } from '../nucleo/escena.js';
import { Historial } from '../nucleo/historial.js';
import { evaluar } from '../nucleo/unidades.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';

(function () {
  'use strict';
  const { Trazo, fmt, fmtMarca, cantidad, conPrefijo, grafica, LineaTiempo, leerTokens, pasoAgradable, rombo, ESP } = Volta;
  const $ = s => document.querySelector(s);
  const GR = Math.PI / 180, DOS_PI = 2 * Math.PI, QE = CARGA_ELEMENTAL;
  const FAC = { m: 1, cm: 1e-2, mm: 1e-3, T: 1, mT: 1e-3, 'V/m': 1, 'kV/m': 1e3, V: 1, kV: 1e3, 'm/s': 1, 'km/s': 1e3, e: QE, u: UMA, '°': GR, '': 1, A: 1, mA: 1e-3, 'm⁻³': 1, Hz: 1, MHz: 1e6, s: 1, ms: 1e-3, 'µs': 1e-6, ns: 1e-9 };
  const numCampo = x => String(Number(Number(x).toPrecision(6))).replace('-', '−');
  const simHTML = (a, sub, recto = true) => `<span class="sim">${a}${sub ? `<sub${recto ? ' class="r"' : ''}>${sub}</sub>` : ''}</span>`;
  const dir = a => [Math.cos(a), Math.sin(a)];
  const grados = r => fmt(r / GR, 3) + '°';
  // Como fmt, pero también para valores menores que 10⁻¹² (fuerzas sobre una partícula: 10⁻¹⁶ N)
  const SUP = e => String(e).replace('-', '⁻').replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]);
  const fmtG = (v, c = 4) => { if (!Number.isFinite(v)) return '—'; if (v === 0) return '0'; const a = Math.abs(v); if (a >= 1e-12) return fmt(v, c); const e = Math.floor(Math.log10(a)); return `${fmt(v / 10 ** e, c)} × 10${SUP(e)}`; };
  const fuerzaTxt = (v, c = 3) => fmtG(v, c) + ESP + 'N';
  const DIM_N = [-3, 0, 0, 0, 0, 0];
  const SEG_PANTALLA = 8;  // segundos de reloj que dura la escena entera a 1×

  // Especies de la fuente de iones (masas en reposo)
  const ESPECIES = {
    proton: { nombre: 'Protón', q: QE, m: MASA_PROTON },
    deuteron: { nombre: 'Deuterón', q: QE, m: 2.013553212745 * UMA },
    alfa: { nombre: 'Alfa', q: 2 * QE, m: 4.001506 * UMA },
    electron: { nombre: 'Electrón', q: -QE, m: MASA_ELECTRON },
    ne20: { nombre: 'Ne-20', q: QE, m: 19.99244 * UMA },
    ne22: { nombre: 'Ne-22', q: QE, m: 21.99138 * UMA },
  };
  const especie = k => ({ ...ESPECIES[k] });

  // ---------------------------------------------------------------------
  // Tipos de objeto
  // ---------------------------------------------------------------------
  const TIPOS = {
    particula: { nombre: 'Partícula cargada', en: 'Charged particle', ico: 'o-particula-cargada' },
    fuente: { nombre: 'Fuente de iones', en: 'Ion source', ico: 'o-fuente-iones' },
    'region-b': { nombre: 'Región de campo B', en: 'Magnetic field region', ico: 'o-region-b' },
    'region-e': { nombre: 'Región de campo E', en: 'Electric field region', ico: 'o-region-e' },
    placas: { nombre: 'Placas aceleradoras', en: 'Accelerating plates', ico: 'o-placas-aceleradoras' },
    placa: { nombre: 'Placa', en: 'Plate', ico: 'o-capacitor-placas' },
    pantalla: { nombre: 'Pantalla detectora', en: 'Detector screen', ico: 'o-pantalla' },
    hall: { nombre: 'Lámina Hall', en: 'Hall plate', ico: 'o-lamina-hall' },
  };

  // ---------------------------------------------------------------------
  // Escenas (mundo en m, SI). Variables: valor en su unidad de pantalla;
  // valor físico = val·factor en cada ruta que fijan.
  // ---------------------------------------------------------------------
  const vari = (sim, val, min, max, paso, u, factor, liga, o = {}) => ({ sim, sub: o.sub, val, min, max, paso, u, factor, liga, factores: o.factores });
  const regB = (nombre, centro, ancho, alto, B) => ({ tipo: 'region-b', nombre, forma: 'rect', centro, ancho, alto, B });
  const regBpol = (nombre, puntos, B) => ({ tipo: 'region-b', nombre, forma: 'poligono', puntos, B });
  const regE = (nombre, centro, ancho, alto, E, angulo, o = {}) => ({ tipo: 'region-e', nombre, forma: 'rect', centro, ancho, alto, E, angulo, alterna: o.alterna || null, frecuencia: o.frecuencia ?? 0, fase: o.fase ?? 0 });
  const part = (nombre, sp, p, v, angulo = 0) => ({ tipo: 'particula', nombre, q: ESPECIES[sp].q, m: ESPECIES[sp].m, p, v, angulo });
  const fuente = (nombre, p, angulo, especies, o = {}) => ({ tipo: 'fuente', nombre, p, angulo, especies: especies.map(especie), modo: o.V != null ? 'V' : 'v', V: o.V ?? 1000, v: o.v ?? 1e5, cantidad: o.cantidad ?? 1, abanico: o.abanico ?? 0, intervalo: o.intervalo ?? 0 });
  const placa = (nombre, a, b, signo = 0) => ({ tipo: 'placa', nombre, a, b, signo });
  const pantalla = (nombre, a, b) => ({ tipo: 'pantalla', nombre, a, b });
  const semiD = (lado, gap, Rd) => { const r = []; for (let i = 0; i <= 40; i++) { const a = -Math.PI / 2 + Math.PI * i / 40; r.push([lado * (gap / 2 + Rd * Math.cos(a)), Rd * Math.sin(a)]); } return lado < 0 ? r.reverse() : r; };
  const vProton500 = rapidezAceleracion(QE, MASA_PROTON, 500);
  const fCic = QE * 1 / (DOS_PI * MASA_PROTON);
  const BASE = () => ({
    unidad: 'cm', duracion: 1e-5, elementos: [], variables: {}, regla: null,
    graficas: ['posicion', 'velocidad', 'energia'], capas: { prevista: true, velocidad: true, fuerza: true, orbita: true, valores: true },
    caja: null, sel: 'escena', nota: '',
  });
  const ESCENAS = [
    {
      clave: 'orbita', titulo: 'Órbita circular en un campo uniforme', tipo: 'Tutorial', duracion: 1e-5,
      nota: 'La fuerza magnética es perpendicular a v: cambia su dirección, no su rapidez. Radio r = m·v/(|q|·B); periodo T = 2π·m/(|q|·B), que no depende de v.',
      elementos: [regB('Región B', [0, 0], 0.4, 0.3, 0.01), part('Protón', 'proton', [0, 0.1], 1e5)],
      caja: [-0.2, 0.2, -0.15, 0.15], sel: 1,
      variables: { B: vari('B', 10, 2, 40, 0.5, 'mT', 1e-3, ['elementos.0.B']), v: vari('v', 100, 20, 300, 5, 'km/s', 1e3, ['elementos.1.v']) },
    },
    {
      clave: 'selector', titulo: 'Selector de velocidades', tipo: 'Ejemplo', duracion: 8e-7, graficas: ['posicion', 'fuerza', 'velocidad'],
      nota: 'Solo cruza en línea recta la partícula con v = E/B: la fuerza eléctrica q·E equilibra a la magnética q·v·B. El deuterón sale de la fuente más lento (la mitad de q/m) y choca con una placa.',
      elementos: [regB('Campo B', [0.05, 0], 0.1, 0.01, 0.2), regE('Campo E', [0.05, 0], 0.1, 0.01, vProton500 * 0.2, Math.PI / 2),
        placa('Placa −', [0, 0.005], [0.1, 0.005], -1), placa('Placa +', [0, -0.005], [0.1, -0.005], 1),
        fuente('Fuente', [-0.03, 0], 0, ['proton', 'deuteron'], { V: 500 }), pantalla('Pantalla', [0.13, -0.025], [0.13, 0.025])],
      caja: [-0.045, 0.14, -0.035, 0.035], sel: 4,
      variables: { E: vari('E', vProton500 * 0.2 / 1e3, 20, 120, 0.1, 'kV/m', 1e3, ['elementos.1.E']), B: vari('B', 200, 50, 400, 1, 'mT', 1e-3, ['elementos.0.B']), V: vari('V', 500, 100, 1500, 10, 'V', 1, ['elementos.4.V']) },
    },
    {
      clave: 'espectrometro', titulo: 'Espectrómetro de masas con dos especies', tipo: 'Ejemplo', duracion: 2e-6,
      nota: 'Con la misma ΔV, el radio es r = √(2m·V/q)/B: el isótopo más pesado cae más lejos. En la placa quedan separados 2(r₂ − r₁).',
      elementos: [regB('Campo B', [0.13, -0.1], 0.26, 0.2, -0.5), fuente('Fuente', [0.02, 0.03], -Math.PI / 2, ['ne20', 'ne22'], { V: 1000 }), pantalla('Placa fotográfica', [0.03, 0], [0.26, 0])],
      caja: [-0.01, 0.15, -0.065, 0.05], sel: 2,
      variables: { B: vari('B', 0.5, 0.2, 1, 0.01, 'T', 1, ['elementos.0.B'], { factores: { 'elementos.0.B': -1 } }), V: vari('V', 1000, 200, 3000, 10, 'V', 1, ['elementos.1.V']) },
    },
    {
      clave: 'ciclotron', titulo: 'Ciclotrón', tipo: 'Ejemplo', duracion: 1.2e-6, graficas: ['energia', 'velocidad', 'posicion'],
      nota: 'El campo E del hueco se invierte con la frecuencia del ciclotrón f = q·B/(2π·m): la partícula gana q·ΔV en cada cruce y el radio de cada media vuelta crece hasta que sale por el borde. Cambia f para perder la sintonía.',
      // El campo del hueco empieza su semiperiodo positivo justo antes de t = 0: el cruce del hueco (de 1 mm) retrasa a la partícula en cada vuelta y así le sobra margen
      elementos: [regBpol('D derecha', semiD(1, 0.001, 0.05), 1), regBpol('D izquierda', semiD(-1, 0.001, 0.05), 1),
        regE('Hueco', [0, 0], 0.001, 0.1, 4e3 / 0.001, 0, { alterna: 'cuadrada', frecuencia: fCic, fase: 0.3 - Math.PI / 2 }), part('Protón', 'proton', [0, 0], 0)],
      caja: [-0.065, 0.065, -0.055, 0.055], sel: 3,
      variables: { dV: vari('ΔV', 4, 1, 10, 0.1, 'kV', 1e3 / 0.001, ['elementos.2.E']), f: vari('f', fCic / 1e6, 12, 18, 0.01, 'MHz', 1e6, ['elementos.2.frecuencia']) },
    },
    {
      clave: 'deriva', titulo: 'Deriva E×B: cicloide', tipo: 'Ejemplo', duracion: 1.3e-6, graficas: ['velocidad', 'posicion', 'energia'],
      nota: 'Desde el reposo, la partícula describe una cicloide y avanza en promedio con v = E/B en la dirección de E × B, sea cual sea el signo de su carga.',
      elementos: [regB('Campo B', [0.13, 0.008], 0.32, 0.05, 0.2), regE('Campo E', [0.13, 0.008], 0.32, 0.05, 2e4, Math.PI / 2), part('Protón', 'proton', [0, 0], 0)],
      caja: [-0.04, 0.3, -0.04, 0.05], sel: 2,
      variables: { E: vari('E', 20, 5, 40, 0.5, 'kV/m', 1e3, ['elementos.1.E']), B: vari('B', 200, 100, 400, 5, 'mT', 1e-3, ['elementos.0.B']) },
    },
    {
      clave: 'hall', titulo: 'Efecto Hall en un semiconductor', tipo: 'Ejemplo', duracion: 5, unidad: 'mm', graficas: ['hall', 'hall-fuerzas', 'hall-b'],
      nota: 'Los portadores se desvían hacia un borde hasta que el campo de Hall equilibra la fuerza magnética: q·E = q·v·B. El signo de V_H dice si los portadores son negativos (tipo n) o positivos (tipo p). Transitorio a cámara lenta.',
      elementos: [{ tipo: 'hall', nombre: 'Lámina', centro: [0, 0], angulo: 0, largo: 0.03, ancho: 0.01, espesor: 5e-4, I: 1e-3, B: 0.5, n: 1e21, signo: -1 }],
      caja: [-0.026, 0.026, -0.016, 0.016], sel: 0,
      variables: { B: vari('B', 0.5, 0, 1.5, 0.01, 'T', 1, ['elementos.0.B']), I: vari('I', 1, 0, 5, 0.05, 'mA', 1e-3, ['elementos.0.I']) },
    },
    // ----------------------------------------------------------------- MEXT
    {
      clave: 'mext-2016-p2', titulo: 'Semicírculo en un semiplano con campo B', tipo: 'MEXT', anio: '2016 P2', duracion: 5.5e-6, graficas: ['posicion', 'fuerza', 'velocidad'],
      nota: '(1) Positiva: q·v × B apunta hacia −y (a). (2) F = q·v·B (e). (3) r = m·v/(q·B) (d). (4) De O a P tarda π·m/(q·B) (b). (5) Con 2B y 3v, el radio es 3/2 del original (a).',
      elementos: [regBpol('Semiplano B', [[0, -0.35], [0.4, -0.35], [0.4, 0.15], [0, 0.15]], 0.01), part('Partícula', 'proton', [-0.08, 0], 1e5)],
      caja: [-0.12, 0.2, -0.25, 0.06], sel: 1,
      variables: { B: vari('B', 10, 5, 25, 0.5, 'mT', 1e-3, ['elementos.0.B']), v: vari('v', 100, 30, 300, 5, 'km/s', 1e3, ['elementos.1.v']) },
    },
    {
      clave: 'mext-2010-4d', titulo: 'Placas aceleradoras y campos cruzados', tipo: 'MEXT', anio: '2010 4-D', duracion: 6e-7, graficas: ['velocidad', 'energia', 'fuerza'],
      nota: 'Sale de las placas con v = √(2q·V/m) y cruza recta si q·E = q·v·B, es decir, si E/B = √(2q·V/m) (b).',
      elementos: [{ tipo: 'placas', nombre: 'Placas a y b', centro: [0, 0.005], angulo: Math.PI / 2, largo: 0.06, separacion: 0.01, dV: 500, agujero: 0.004 },
        regB('Campo B', [0, 0.06], 0.08, 0.1, 0.2), regE('Campo E', [0, 0.06], 0.08, 0.1, vProton500 * 0.2, Math.PI), part('Partícula', 'proton', [0, 0], 0), pantalla('Pantalla', [-0.04, 0.12], [0.04, 0.12])],
      caja: [-0.07, 0.07, -0.012, 0.13], sel: 3,
      variables: { V: vari('V', 500, 100, 1500, 10, 'V', 1, ['elementos.0.dV']), E: vari('E', vProton500 * 0.2 / 1e3, 20, 120, 0.1, 'kV/m', 1e3, ['elementos.2.E']), B: vari('B', 200, 50, 400, 1, 'mT', 1e-3, ['elementos.1.B']) },
    },
    {
      clave: 'mext-2009-p2', titulo: 'Espectrómetro con selector', tipo: 'MEXT', anio: '2009 P2', duracion: 1.4e-6, graficas: ['posicion', 'fuerza', 'velocidad'],
      nota: '(1) La fuerza es perpendicular a v y a B y proporcional a la rapidez (d). (2) B₁ saliente (d). (3) v = E/B₁ (c). (4) r = M·v/(q·B₂) (b). (5) La partícula alfa describe el doble de radio que el protón (d).',
      elementos: [regB('Campo B₁', [0, 0.06], 0.012, 0.08, 0.15), regE('Campo E', [0, 0.06], 0.012, 0.08, 3e4, 0),
        regBpol('Campo B₂', [[-0.3, -0.2], [0.1, -0.2], [0.1, 0], [-0.3, 0]], 0.1),
        placa('Q', [-0.006, 0.02], [-0.006, 0.1], 1), placa('P', [0.006, 0.02], [0.006, 0.1], -1),
        fuente('Fuente', [0, 0.115], -Math.PI / 2, ['proton', 'alfa'], { v: 2e5 }), pantalla('Placa fotográfica', [-0.12, 0], [-0.004, 0])],
      caja: [-0.11, 0.03, -0.055, 0.125], sel: 5,
      variables: { E: vari('E', 30, 10, 60, 0.5, 'kV/m', 1e3, ['elementos.1.E']), B1: vari('B', 150, 50, 300, 1, 'mT', 1e-3, ['elementos.0.B'], { sub: '1' }), B2: vari('B', 100, 50, 300, 1, 'mT', 1e-3, ['elementos.2.B'], { sub: '2' }) },
    },
    {
      clave: 'mext-2025-t6', titulo: 'Partícula que entra oblicua en un campo B', tipo: 'MEXT', anio: '2025 T6', duracion: 6e-6, graficas: ['posicion', 'velocidad', 'fuerza'],
      nota: 'Reconstrucción propia (el banco solo da el tema). Entra formando α con la normal al borde: recorre un arco de π + 2α, sale a 2r·cos α del punto de entrada y tarda (π + 2α)·m/(q·B).',
      elementos: [regBpol('Semiplano B', [[0, -0.4], [0.4, -0.4], [0.4, 0.15], [0, 0.15]], 0.01), part('Partícula', 'proton', [-0.05, -0.05 * Math.tan(30 * GR)], 1e5, 30 * GR)],
      caja: [-0.1, 0.2, -0.22, 0.08], sel: 1,
      variables: { a: vari('α', 30, 0, 75, 1, '°', GR, ['elementos.1.angulo']), B: vari('B', 10, 5, 25, 0.5, 'mT', 1e-3, ['elementos.0.B']) },
    },
    {
      clave: 'mext-2014-p2', titulo: 'Efecto Hall en una lámina metálica', tipo: 'MEXT', anio: '2014 P2', duracion: 5, unidad: 'mm', graficas: ['hall', 'hall-fuerzas', 'hall-b'],
      nota: '(1) N = n·a·b·v·t (d). (2) I = q·n·a·b·v (b). (3) F = q·v·B (e). (4) V = B·v·b (f). (5) n = B·I/(q·a·V) (b). Electrones de carga −q; transitorio a cámara lenta.',
      elementos: [{ tipo: 'hall', nombre: 'Lámina', centro: [0, 0], angulo: 0, largo: 0.03, ancho: 0.01, espesor: 1e-4, I: 10, B: 1, n: 8.5e28, signo: -1 }],
      caja: [-0.026, 0.026, -0.016, 0.016], sel: 0,
      variables: { B: vari('B', 1, 0, 2, 0.01, 'T', 1, ['elementos.0.B']), I: vari('I', 10, 0, 30, 0.5, 'A', 1, ['elementos.0.I']) },
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
  let ORIGEN = [], REGIONES = [], ORB = [], X = {}, ERROR = null;
  let t = 0, jugando = false, velocidad = 1, ultimo = 0;
  let sel = 'escena', herramienta = null, vistaTocada = false, escala0 = 1, espacioPulsado = false;
  let arrastre = null, paneo = null, hover = null;
  let autoguardar = false, historial = null, contador = 100;
  const lienzo = $('#lienzo'), area = $('#area');
  const tz = new Trazo(lienzo);
  const U = () => ESC.unidad || 'cm', FU = () => FAC[U()];
  const L = (v, cifras = 4) => cantidad(v / FU(), U(), cifras);
  const elDe = id => ESC.elementos.find(e => e.id === id);
  const idxDe = id => ESC.elementos.findIndex(e => e.id === id);
  const T = (v, cifras = 4) => conPrefijo(v, 's', cifras);
  // Unidad de tiempo de la escena: la que deja la duración entre 1 y 1000
  const UT = () => { const d = ESC.duracion; return [[1, 's'], [1e-3, 'ms'], [1e-6, 'µs'], [1e-9, 'ns']].find(([f]) => d >= f * 0.999) || [1e-9, 'ns']; };
  const soloHall = () => ESC.elementos.some(e => e.tipo === 'hall') && !ESC.elementos.some(e => e.tipo === 'particula' || e.tipo === 'fuente');

  // ---------------------------------------------------------------------
  // Escena → motor
  // ---------------------------------------------------------------------
  function poligonoDe(el) {
    if (el.forma === 'poligono') return el.puntos.map(p => [p[0], p[1]]);
    return rectangulo(el.centro, el.ancho, el.alto);
  }
  // Las dos placas de unas placas aceleradoras (a: potencial alto; b: bajo) y su región
  const geomPlacas = el => placasAceleradoras({ centro: el.centro, giro: el.angulo, largo: el.largo, separacion: el.separacion, dV: el.dV, agujero: el.agujero });
  function cajaEscena(margen = 0.6) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const pt = p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); };
    for (const el of ESC.elementos) puntosDe(el).forEach(pt);
    if (ESC.caja) { pt([ESC.caja[0], ESC.caja[2]]); pt([ESC.caja[1], ESC.caja[3]]); }
    if (!Number.isFinite(x0)) return [-0.1, 0.1, -0.1, 0.1];
    const m = margen * Math.max(x1 - x0, y1 - y0, 0.01);
    return [x0 - m, x1 + m, y0 - m, y1 + m];
  }
  function puntosDe(el) {
    switch (el.tipo) {
      case 'region-b': case 'region-e': return poligonoDe(el);
      case 'placas': { const g = geomPlacas(el); return g.placas.flatMap(o => [o.a, o.b]); }
      case 'placa': case 'pantalla': return [el.a, el.b];
      case 'hall': return rectangulo(el.centro, el.largo, el.ancho, el.angulo);
      default: return [el.p];
    }
  }
  function simular() {
    const regiones = [], obstaculos = [], particulas = [];
    ORIGEN = []; REGIONES = []; ORB = []; X = {}; ERROR = null;
    for (const el of ESC.elementos) {
      if (el.tipo === 'region-b') { regiones.push({ id: el.id, tipo: 'B', poligono: poligonoDe(el), B: el.B }); REGIONES.push(el); }
      else if (el.tipo === 'region-e') {
        const d = dir(el.angulo);
        regiones.push({ id: el.id, tipo: 'E', poligono: poligonoDe(el), E: [el.E * d[0], el.E * d[1]], alterna: el.alterna ? { frecuencia: el.frecuencia, fase: el.fase || 0, forma: el.alterna } : undefined });
        REGIONES.push(el);
      } else if (el.tipo === 'placas') {
        const g = geomPlacas(el);
        regiones.push({ ...g.region, id: el.id }); REGIONES.push(el);
        g.placas.forEach((o, k) => obstaculos.push({ ...o, id: `${el.id}:${k}` }));
      } else if (el.tipo === 'pantalla') obstaculos.push({ id: el.id, tipo: 'pantalla', a: el.a, b: el.b });
      else if (el.tipo === 'placa') obstaculos.push({ id: el.id, tipo: 'placa', a: el.a, b: el.b });
      else if (el.tipo === 'particula') {
        const d = dir(el.angulo);
        particulas.push({ id: el.id, q: el.q, m: el.m, p: el.p.slice(), v: [el.v * d[0], el.v * d[1]] });
        ORIGEN.push({ el, nombre: el.nombre, q: el.q, m: el.m });
      } else if (el.tipo === 'fuente') {
        const n = Math.max(1, Math.round(el.cantidad));
        const ps = emitirIones({ p: el.p, giro: el.angulo, especies: el.especies, v: el.modo === 'v' ? el.v : undefined, V: el.modo === 'V' ? el.V : undefined, cantidad: n, abanico: el.abanico, ritmo: el.intervalo > 0 ? 1 / el.intervalo : 0 });
        ps.forEach((p, k) => {
          const s = el.especies[Math.floor(k / n)];
          particulas.push({ ...p, id: `${el.id}:${k}` });
          ORIGEN.push({ el, nombre: n > 1 ? `${s.nombre} ${k % n + 1}` : s.nombre, q: s.q, m: s.m });
        });
      }
    }
    try {
      SIM = simularParticulas({ regiones, obstaculos, particulas, duracion: ESC.duracion, caja: cajaEscena(0.6) });
    } catch (e) { SIM = null; ERROR = e.message; }
    if (SIM) medirOrbitas();
  }
  // Campos en un punto (para la fuerza que se dibuja y se grafica)
  function factorAlterno(el, tt) {
    if (!el.alterna || !(el.frecuencia > 0)) return 1;
    const c = Math.cos(DOS_PI * el.frecuencia * tt + (el.fase || 0));
    return el.alterna === 'cuadrada' ? (c >= 0 ? 1 : -1) : c;
  }
  function camposEn(p, tt) {
    const E = [0, 0], B = [0, 0, 0];
    if (!SIM) return { E, B };
    SIM.regiones.forEach((r, k) => {
      if (!contiene(r.pts, p)) return;
      const el = REGIONES[k];
      if (r.tipo === 'B') B[2] += el.B;
      else if (el.tipo === 'placas') { const d = dir(el.angulo), m = el.dV / el.separacion; E[0] += d[0] * m; E[1] += d[1] * m; }
      else { const d = dir(el.angulo), f = factorAlterno(el, tt); E[0] += el.E * d[0] * f; E[1] += el.E * d[1] * f; }
    });
    return { E, B };
  }
  const fuerzaEn = (k, p, v, tt) => { const { E, B } = camposEn(p, tt), q = ORIGEN[k].q; return { FE: [q * E[0], q * E[1]], FB: [q * v[1] * B[2], -q * v[0] * B[2]] }; };
  const nombreRegion = k => REGIONES[k]?.nombre ?? `región ${k + 1}`;
  const nombreObst = id => elDe(String(id).split(':')[0])?.nombre ?? 'obstáculo';
  function nombreEvento(e) {
    const n = ORIGEN[e.indice]?.nombre ?? e.particula;
    if (e.tipo === 'entrada') return `${n} entra en ${nombreRegion(e.region)}`;
    if (e.tipo === 'salida') return `${n} sale de ${nombreRegion(e.region)}`;
    if (e.tipo === 'impacto') return `${n} llega a ${nombreObst(e.objeto)}`;
    if (e.tipo === 'placa') return `${n} choca con ${nombreObst(e.objeto)}`;
    return `${n} sale de la vista`;
  }

  // Órbitas medidas: cada tramo dentro de una región B sin campo E (ajuste de circunferencia)
  function medirOrbitas() {
    ORB = SIM.trayectorias.map((tr, k) => {
      const r = [];
      SIM.regiones.forEach((rg, kr) => {
        if (rg.tipo !== 'B') return;
        for (const [i0, i1] of tramosEnRegion(SIM, k, kr)) {
          if (i1 - i0 < 8) continue;
          const im = (i0 + i1) >> 1, pm = [tr.x[im], tr.y[im]];
          if (SIM.regiones.some(q => q.tipo === 'E' && contiene(q.pts, pm))) continue;
          const o = medirOrbita(tr, i0, i1); if (!o) continue;
          let res = 0; for (let i = i0; i <= i1; i++) res = Math.max(res, Math.abs(Math.hypot(tr.x[i] - o.centro[0], tr.y[i] - o.centro[1]) - o.radio));
          if (res > 1e-3 * o.radio) continue;
          const v = Math.hypot(tr.vx[i0], tr.vy[i0]), B = Math.abs(REGIONES[kr].B), q = Math.abs(ORIGEN[k].q), m = ORIGEN[k].m;
          r.push({ region: kr, i0, i1, t0: tr.t[i0], t1: tr.t[i1], ...o, v, rTeo: m * v / (q * B), TTeo: DOS_PI * m / (q * B), giro: Math.abs(o.omega) * (tr.t[i1] - tr.t[i0]) });
        }
      });
      return r;
    });
  }
  // Escalas comunes de los vectores (para toda la simulación)
  function escalas() {
    if (X.vref) return X;
    let vmax = 0, fmax = 0;
    SIM.trayectorias.forEach((tr, k) => {
      const paso = Math.max(1, Math.floor(tr.n / 400));
      for (let i = 0; i < tr.n; i += paso) {
        const v = [tr.vx[i], tr.vy[i]], s = Math.hypot(v[0], v[1]); vmax = Math.max(vmax, s);
        const F = fuerzaEn(k, [tr.x[i], tr.y[i]], v, tr.t[i]); fmax = Math.max(fmax, Math.hypot(F.FE[0] + F.FB[0], F.FE[1] + F.FB[1]));
      }
    });
    X.vref = vmax || 1; X.fref = fmax || 1;
    return X;
  }

  // ---------------------------------------------------------------------
  // Trayectoria seguida (gráficas, lecturas, tabla)
  // ---------------------------------------------------------------------
  function trSel() {
    if (!SIM || !SIM.trayectorias.length) return -1;
    if (typeof sel === 'string' && sel.startsWith('tr:')) { const k = +sel.slice(3); if (SIM.trayectorias[k]) return k; }
    const el = elDe(sel);
    if (el && (el.tipo === 'particula' || el.tipo === 'fuente')) { const k = ORIGEN.findIndex(o => o.el === el); if (k >= 0) return k; }
    return 0;
  }

  // ---------------------------------------------------------------------
  // Dibujo
  // ---------------------------------------------------------------------
  function encuadrar() {
    const caja = ESC.caja || cajaEscena(0.25);
    tz.vista.encuadrar({ x0: caja[0], x1: caja[1], y0: caja[2], y1: caja[3] }, { x: 0, y: 0, w: tz.w, h: tz.h }, 48);
  }
  function dibujar() {
    // La barra de escala (abajo a la izquierda) también es zona reservada
    const v = tz.vista, ocupados = [...tz.zonasFlotantes(), { x: 8, y: tz.h - 84, w: 190, h: 40 }];
    const estados = SIM ? SIM.trayectorias.map(tr => estadoParticula(tr, t)) : [];
    estados.forEach(st => { if (st) { const [x, y] = v.P(st.p); ocupados.push({ x: x - 9, y: y - 9, w: 18, h: 18 }); } });
    for (const el of ESC.elementos) {
      if (el.tipo === 'fuente') { const [x, y] = v.P(el.p), d = dir(el.angulo), cx = x - d[0] * 11, cy = y + d[1] * 11; ocupados.push({ x: cx - 17, y: cy - 17, w: 34, h: 34 }); }
      // Placas y pantallas: su franja queda reservada (con sus signos en los extremos)
      const segs = el.tipo === 'placa' || el.tipo === 'pantalla' ? [[el.a, el.b]] : el.tipo === 'placas' ? geomPlacas(el).placas.map(o => [o.a, o.b]) : [];
      for (const [a, b] of segs) {
        const A = v.P(a), B = v.P(b), Lp = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, ux = (B[0] - A[0]) / Lp, uy = (B[1] - A[1]) / Lp;
        ocupados.push({ x: Math.min(A[0], B[0]) - 3, y: Math.min(A[1], B[1]) - 3, w: Math.abs(B[0] - A[0]) + 6, h: Math.abs(B[1] - A[1]) + 6 });
        // El signo de la placa va junto a su extremo b
        if (el.tipo !== 'pantalla') ocupados.push({ x: B[0] + ux * 10 - 14, y: B[1] + uy * 10 - 14, w: 28, h: 28 });
      }
      // Lámina Hall: solo sus bordes (dentro van los portadores y sus fuerzas, con etiqueta)
      if (el.tipo === 'hall') { const P = puntosDe(el).map(q => v.P(q)); P.forEach((A, k) => { const B = P[(k + 1) % 4]; ocupados.push({ x: Math.min(A[0], B[0]) - 10, y: Math.min(A[1], B[1]) - 10, w: Math.abs(B[0] - A[0]) + 20, h: Math.abs(B[1] - A[1]) + 20 }); }); }
    }
    tz.limpiar(); tz.magnetismoEtiquetas(ocupados);
    tz.cuadricula();
    tz.magnetismoEjes({ unidad: U(), factor: 1 / FU() });

    // 4 · Regiones de campo (E alterno con su sentido en t). Sus etiquetas se
    // reservan antes, y la rejilla de ⊙/⊗ deja libre el sitio de la suya
    ETQ_REGIONES = ESC.capas.valores ? ESC.elementos.filter(e => e.tipo === 'region-b' || e.tipo === 'region-e').map(el => sitioRegion(el)).filter(Boolean) : [];
    if (ESC.capas.valores) planearParticulas(estados);
    for (const el of ESC.elementos) {
      if (el.tipo === 'region-b') {
        const pts = poligonoDe(el), sitio = ETQ_REGIONES.find(q => q.el === el);
        tz.magnetismoRegion(pts, { tipo: 'B', B: 0, grueso: hover === el.id });
        if (el.B) tz.magnetismoRejilla(() => el.B, { recorte: pts, libres: true, evitar: sitio ? evitarEtiqueta(sitio) : [] });
      }
      else if (el.tipo === 'region-e') {
        // Sobre una región B, las flechas de E van intercaladas con los ⊙/⊗
        const f = factorAlterno(el, t), d = dir(el.angulo), pts = poligonoDe(el), sobreB = ESC.elementos.some(q => q.tipo === 'region-b' && seSolapan(poligonoDe(q), pts));
        tz.magnetismoRegion(pts, { tipo: 'E', E: [el.E * d[0] * f, el.E * d[1] * f], grueso: hover === el.id, tenue: Math.abs(f) < 0.3, desfase: sobreB ? 0 : 0.5 });
      }
      else if (el.tipo === 'placas') { const g = geomPlacas(el); tz.magnetismoRegion(g.region.poligono, { tipo: 'E', E: g.region.E, tenue: true }); }
    }
    // 6 · Materia: placas, pantallas, lámina Hall
    const impactos = SIM ? SIM.impactos.filter(e => e.t <= t + 1e-18) : [];
    for (const el of ESC.elementos) {
      const g = hover === el.id;
      if (el.tipo === 'placas') {
        const P = geomPlacas(el);
        P.placas.forEach((o, k) => tz.magnetismoPlaca(o.a, o.b, o.agujeros.map(([s0, s1]) => [s0 / el.largo, s1 / el.largo]), { grueso: g, signo: el.dV === 0 ? 0 : (k === 0) === (el.dV > 0) ? 1 : -1, ladoSigno: k === 0 ? -1 : 1 }));
      } else if (el.tipo === 'placa') tz.magnetismoPlaca(el.a, el.b, [], { grueso: g, signo: el.signo || 0 });
      else if (el.tipo === 'pantalla') {
        const Lp = Math.hypot(el.b[0] - el.a[0], el.b[1] - el.a[1]);
        tz.magnetismoPantalla(el.a, el.b, impactos.filter(e => e.objeto === el.id).map(e => e.s / Lp), { grueso: g, lado: ladoPantalla(el) });
      } else if (el.tipo === 'hall') dibujarHall(el);
    }
    // 5 · Trayectorias
    const k0 = trSel();
    if (SIM) SIM.trayectorias.forEach((tr, k) => dibujarTrayectoria(tr, estados[k], k === k0 || hover === 'tr:' + k));
    if (ESC.capas.orbita && k0 >= 0) dibujarOrbita(k0, estados[k0]);
    // Fuentes de iones
    for (const el of ESC.elementos) if (el.tipo === 'fuente') tz.magnetismoFuenteIones(el.p, el.angulo, { grueso: hover === el.id });
    // Eventos en el lienzo: anillos en los impactos ya ocurridos
    for (const e of impactos) tz.eventoAnillo(e.p);
    // 6 · Partículas y 7 · sus vectores
    if (SIM) {
      const E = escalas();
      SIM.trayectorias.forEach((tr, k) => {
        const st = estados[k]; if (!st) return;
        if (!st.activa && tr.fin && tr.fin.motivo === 'caja') return;
        const vv = [st.v[0], st.v[1]], s = Math.hypot(vv[0], vv[1]);
        if (st.activa && ESC.capas.velocidad && s > 0) { const Lp = Math.max(12, 46 * s / E.vref); tz.vector(st.p, vv, { familia: 'movimiento', escalaPx: Lp / s, desdeRadio: 8 }); }
        if (st.activa && ESC.capas.fuerza) {
          const F = fuerzaEn(k, st.p, vv, t), Ft = [F.FE[0] + F.FB[0], F.FE[1] + F.FB[1]], m = Math.hypot(Ft[0], Ft[1]);
          if (m > 1e-3 * E.fref) { const Lp = Math.max(12, 40 * m / E.fref); tz.vector(st.p, Ft, { familia: 'interaccion', escalaPx: Lp / m, desdeRadio: 8 }); }
        }
        tz.magnetismoParticula(st.p, Math.sign(ORIGEN[k].q), { grueso: hover === 'tr:' + k || (ORIGEN[k].el.id === hover && ORIGEN[k].el.tipo === 'particula') });
      });
    }
    dibujarRegla();
    if (ESC.capas.valores) dibujarValores(estados, impactos);
    dibujarSeleccion(estados);
    tz.magnetismoBarraEscala(16, tz.h - 56, U(), 1 / FU());
  }
  // La pantalla se dibuja hacia el lado del que no llegan las partículas
  function ladoPantalla(el) {
    const u = [el.b[0] - el.a[0], el.b[1] - el.a[1]], n = [-u[1], u[0]];
    const fu = ESC.elementos.find(e => e.tipo === 'fuente' || e.tipo === 'particula');
    if (!fu) return 1;
    const s = (fu.p[0] - el.a[0]) * n[0] + (fu.p[1] - el.a[1]) * n[1];
    // En pantalla el eje y está invertido: el lado +n del mundo es −n en px
    return s > 0 ? 1 : -1;
  }
  function dibujarTrayectoria(tr, st, destacada) {
    const v = tz.vista, n = tr.n;
    const hasta = !st ? -1 : st.activa ? st.i : n - 1;
    const paso = Math.max(1, Math.floor(n / 6000));
    if (hasta >= 0) {
      const pts = []; for (let i = 0; i <= hasta; i += paso) pts.push(v.P([tr.x[i], tr.y[i]]));
      pts.push(v.P(st.p));
      tz.lineaPx(pts, { color: 'texto-2', grosor: destacada ? 2 : 1.5 });
    }
    if (ESC.capas.prevista && (!st || st.activa)) {
      const desde = Math.max(0, hasta), pts = [st ? v.P(st.p) : v.P([tr.x[0], tr.y[0]])];
      for (let i = desde + 1; i < n; i += paso) pts.push(v.P([tr.x[i], tr.y[i]]));
      pts.push(v.P([tr.x[n - 1], tr.y[n - 1]]));
      tz.lineaPx(pts, { color: 'texto-3', grosor: 1.5, patron: 'previsto', extremo: 'butt' });
    }
  }
  // Tramo de órbita medido que corresponde al instante t (el actual o el último completado)
  function orbitaEn(k, st) {
    const os = ORB[k] || []; if (!os.length || !st) return null;
    const i = st.i;
    return os.find(o => i >= o.i0 && i <= o.i1) || os.filter(o => o.i1 <= i).pop() || null;
  }
  function dibujarOrbita(k, st) {
    const o = orbitaEn(k, st); if (!o) return;
    const v = tz.vista, [cx, cy] = v.P(o.centro), r = o.radio * v.escala, c = tz.ctx;
    c.save(); c.strokeStyle = tz.t['texto-3']; c.lineWidth = 1; c.setLineDash([1.5, 3]); c.lineCap = 'round';
    c.beginPath(); c.arc(cx, cy, r, 0, DOS_PI); c.stroke(); c.restore();
    tz.lineaPx([[cx - 4, cy], [cx + 4, cy]], { color: 'texto-3', grosor: 1 }); tz.lineaPx([[cx, cy - 4], [cx, cy + 4]], { color: 'texto-3', grosor: 1 });
    const actual = st.i >= o.i0 && st.i <= o.i1, p = actual ? st.p : [SIM.trayectorias[k].x[o.i1], SIM.trayectorias[k].y[o.i1]];
    const [px, py] = v.P(p);
    tz.flechaPx(cx, cy, px, py, { color: 'texto-3', grosor: 1, punta: 'abierta' });
    tz.magnetismoOcupar(cx - 6, cy - 6, 12, 12);
    if (ESC.capas.valores) {
      const filas = [[{ t: 'Órbita medida', f: 'ui', tam: 11.5 }], [{ t: 'r', f: 'sim', tam: 13 }, { t: ' = ' + L(o.radio), f: 'num', tam: 11.5 }], [{ t: 'T', f: 'sim', tam: 13 }, { t: ' = ' + T(o.periodo), f: 'num', tam: 11.5 }]];
      const mx = (cx + px) / 2, my = (cy + py) / 2;
      tz.magnetismoFicha(filas, [[mx + 12, my + 8], [mx + 12, my - 66], [mx - 132, my + 8], [mx - 132, my - 66], [cx + 12, cy + 12], [cx - 130, cy - 70]], [mx, my]);
    }
  }
  function dibujarRegla() {
    if (!ESC.regla) return;
    const [a, b] = ESC.regla, v = tz.vista, [x1, y1] = v.P(a), [x2, y2] = v.P(b);
    if (Math.hypot(x2 - x1, y2 - y1) > 4) tz.flechaPx(x1, y1, x2, y2, { color: 'texto-2', grosor: 1, punta: 'abierta', ambas: true });
    tz.asa(x1, y1); tz.asa(x2, y2);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    tz.magnetismoFicha([[{ t: 'd', f: 'sim', tam: 13 }, { t: ' = ' + L(d), f: 'num', tam: 11.5 }], [{ t: 'ángulo ' + grados(ang), f: 'num', tam: 11 }]], [[(x1 + x2) / 2 + 10, (y1 + y2) / 2 - 34], [(x1 + x2) / 2 + 10, (y1 + y2) / 2 + 10], [(x1 + x2) / 2 - 130, (y1 + y2) / 2 - 34]], [(x1 + x2) / 2, (y1 + y2) / 2]);
    if (sel === 'regla') tz.seleccionCaja(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  }

  // Lámina Hall: portadores que derivan con la corriente y se desvían hacia un borde hasta el equilibrio
  const frac = x => x - Math.floor(x);
  function eqHall(el) { try { return hall({ I: el.I, B: el.B, n: el.n, q: el.signo * QE, espesor: el.espesor, ancho: el.ancho }); } catch { return null; } }
  const tauHall = () => ESC.duracion / 5;
  function dibujarHall(el) {
    const v = tz.vista, e = dir(el.angulo), n = [-e[1], e[0]], h = el.largo / 2, w = el.ancho / 2, eq = eqHall(el);
    const f = eq ? hallTransitorio(eq, t, tauHall()).fraccion : 0;
    const pt = (u, s) => [el.centro[0] + e[0] * u + n[0] * s, el.centro[1] + e[1] * u + n[1] * s];
    // Campo B perpendicular sobre la lámina y un margen
    const zonaB = [pt(-h - w, -2.2 * w), pt(h + w, -2.2 * w), pt(h + w, 2.2 * w), pt(-h - w, 2.2 * w)];
    let sitioB = null;
    if (el.B && ESC.capas.valores) {
      const P = zonaB.map(q => v.P(q)), x0 = Math.min(...P.map(q => q[0])), y0 = Math.min(...P.map(q => q[1])), x1 = Math.max(...P.map(q => q[0]));
      const segs = [{ t: 'B', f: 'sim', tam: 13, color: 'magnetico' }, { t: ' = ' + conPrefijo(Math.abs(el.B), 'T', 3) + (el.B > 0 ? ' ⊙' : ' ⊗'), f: 'num', tam: 11, color: 'texto-2' }];
      for (const [x, y, al] of [[x0 + 4, y0 + 14, 'left'], [x1 - 4, y0 + 14, 'right'], [x0 + 4, y0 - 8, 'left']]) if (tz.magnetismoReservar(segs, x, y, al)) { sitioB = { segs, x, y, al }; break; }
    }
    if (el.B) tz.magnetismoRejilla(() => el.B, { recorte: zonaB, libres: true, evitar: sitioB ? evitarEtiqueta(sitioB) : [] });
    if (sitioB) tz.compuesto(sitioB.segs, sitioB.x, sitioB.y, { alinear: sitioB.al, color: 'texto-2' });
    // Cables de la corriente
    const sI = Math.sign(el.I) || 1;
    tz.magnetismoConductor(pt(-h - 1.6 * w, 0), pt(-h, 0), sI, { paso: 400 });
    tz.magnetismoConductor(pt(h, 0), pt(h + 1.6 * w, 0), sI, { paso: 400 });
    // Portadores: avanzan contra la corriente si son negativos; se desvían hacia Î × B̂
    const mov = Math.sign(el.signo) * sI, defl = -(Math.sign(el.B) || 0) * sI, N = 26, port = [];
    for (let k = 0; k < N; k++) {
      const u0 = frac(k * 0.6180339 + 0.13), s0 = (frac(k * 0.4142136 + 0.37) - 0.5) * 1.5 * w, avance = frac(u0 + mov * t / (ESC.duracion / 2.2) + 10);
      const recorrido = mov > 0 ? avance : 1 - avance;
      const s = Math.max(-0.86 * w, Math.min(0.86 * w, s0 + defl * (1 - f) * 2.2 * w * recorrido));
      port.push(pt(-h + 2 * h * avance, s));
    }
    tz.magnetismoLaminaHall(el.centro, e, el.largo, el.ancho, { portadores: port, signoPortador: el.signo, carga: f, signoBorde: eq ? -eq.signoBorde : 1, grueso: hover === el.id });
    // Fuerzas sobre un portador (el primero): magnética constante y eléctrica que crece con la carga de los bordes
    if (ESC.capas.fuerza && el.B && el.I) {
      const p = port[0], dF = [n[0] * defl, n[1] * defl];
      tz.vector(p, dF, { familia: 'interaccion', escalaPx: 34, desdeRadio: 4 });
      if (f > 0.02) tz.vector(p, [-dF[0], -dF[1]], { familia: 'interaccion', escalaPx: 34 * f, desdeRadio: 4 });
      if (ESC.capas.valores) {
        const [X0, Y0] = v.P(p), fin = [X0 + dF[0] * 38, Y0 - dF[1] * 38], fin2 = [X0 - dF[0] * (34 * f + 4), Y0 + dF[1] * (34 * f + 4)];
        tz.magnetismoEtiqueta([{ t: 'F', f: 'sim', tam: 13, color: 'interaccion' }, { t: 'B', f: 'sim', tam: 9, dy: 3, color: 'interaccion' }], [[fin[0] + 6, fin[1] + 4, 'left'], [fin[0] - 6, fin[1] + 4, 'right'], [fin[0] + 8, fin[1] + (dF[1] > 0 ? 12 : -4), 'left'], [fin[0] - 8, fin[1] + (dF[1] > 0 ? 12 : -4), 'right'], [fin[0] + 8, (fin[1] + Y0) / 2, 'left'], [fin[0] - 8, (fin[1] + Y0) / 2, 'right']]);
        if (f > 0.15) tz.magnetismoEtiqueta([{ t: 'F', f: 'sim', tam: 13, color: 'interaccion' }, { t: 'E', f: 'sim', tam: 9, dy: 3, color: 'interaccion' }], [[fin2[0] + 6, fin2[1] + 4, 'left'], [fin2[0] - 6, fin2[1] + 4, 'right'], [fin2[0], fin2[1] + (dF[1] > 0 ? 16 : -6), 'center']]);
      }
    }
    // Voltímetro de Hall entre los dos bordes
    const a = pt(h * 0.15, w), b = pt(h * 0.15, -w), [xa, ya] = v.P(a), [xb, yb] = v.P(b);
    tz.lineaPx([[xa, ya], [xa, ya - 18]], { color: 'texto-2', grosor: 1.25 }); tz.lineaPx([[xb, yb], [xb, yb + 18]], { color: 'texto-2', grosor: 1.25 });
    for (const [x, y] of [[xa, ya], [xb, yb]]) { const c = tz.ctx; c.save(); c.fillStyle = tz.t.tinta; c.beginPath(); c.arc(x, y, 2.5, 0, DOS_PI); c.fill(); c.restore(); }
    if (ESC.capas.valores && eq) {
      const VH = eq.VH * f, Xm = Math.max(xa, xb) + 16, Ym = Math.min(ya, yb) - 22;
      const filas = [[{ t: 'Voltímetro de Hall', f: 'ui', tam: 11.5 }], [{ t: 'V', f: 'sim', tam: 13, color: 'electrico' }, { t: 'H', f: 'sim', tam: 9, dy: 3, color: 'electrico' }, { t: ' = ' + conPrefijo(VH, 'V'), f: 'num', tam: 11.5 }], [{ t: `equilibrio ${conPrefijo(eq.VH, 'V')}`, f: 'num', tam: 11 }]];
      // Fuera de la lámina: encima, debajo o a los lados de su caja
      const [lx, ly, lw, lh] = cajaPx(puntosDe(el)), W = 160, H = 60;
      tz.magnetismoFicha(filas, [[Xm, Ym - 70], [Xm, ly + lh + 14], [lx + lw - W, ly - H - 14], [lx, ly - H - 14], [lx + lw + 14, ly], [lx - W - 14, ly], [Xm, ly - H - 50], [Xm, ly + lh + 50]], [xa, ya - 18]);
    }
    return f;
  }

  const cajaMundo = pts => [Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[1]))];
  const seSolapan = (P, Q) => { const a = cajaMundo(P), b = cajaMundo(Q); return a[0] < b[1] && b[0] < a[1] && a[2] < b[3] && b[2] < a[3]; };
  // Sitio de la etiqueta de una región: dentro, en una esquina; fuera (arriba o abajo) si es delgada o de campo E
  let ETQ_REGIONES = [];
  function sitioRegion(el) {
    const v = tz.vista, pts = poligonoDe(el).map(p => v.P(p)), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.max(Math.min(...xs), 8), y0 = Math.max(Math.min(...ys), 8), x1 = Math.min(Math.max(...xs), tz.w - 8), y1 = Math.min(Math.max(...ys), tz.h - 8);
    // Subíndice del nombre (Campo B₁ → B₁)
    const m = /([₀-₉]+)$/.exec(el.nombre || ''), sub = m ? [...m[1]].map(c => String(c.charCodeAt(0) - 0x2080)).join('') : '', fam = el.tipo === 'region-b' ? 'magnetico' : 'electrico';
    const segs = [{ t: el.tipo === 'region-b' ? 'B' : 'E', f: 'sim', tam: 13, color: fam }, ...(sub ? [{ t: sub, f: 'simRecta', tam: 9, dy: 3, color: fam }] : []),
      el.tipo === 'region-b' ? { t: ' = ' + conPrefijo(Math.abs(el.B), 'T', 3) + (el.B > 0 ? ' ⊙' : el.B < 0 ? ' ⊗' : ''), f: 'num', tam: 11, color: 'texto-2' }
        : { t: ' = ' + conPrefijo(Math.abs(el.E), 'V/m', 3) + (el.alterna ? ' alterno' : ''), f: 'num', tam: 11, color: 'texto-2' }];
    const ym = (y0 + y1) / 2;
    const dentro = [[x0 + 8, y0 + 20, 'left'], [x1 - 8, y0 + 20, 'right'], [x0 + 8, y1 - 8, 'left'], [x1 - 8, y1 - 8, 'right']];
    const fuera = [[x0 + 4, y0 - 8, 'left'], [x1 - 4, y0 - 8, 'right'], [x0 + 4, y1 + 20, 'left'], [x1 - 4, y1 + 20, 'right'],
      [x0 - 12, ym + 4, 'right'], [x1 + 12, ym + 4, 'left'], [x0 - 12, ym + 24, 'right'], [x1 + 12, ym + 24, 'left'], [x0 - 12, ym - 16, 'right'], [x1 + 12, ym - 16, 'left']];
    const cands = el.tipo === 'region-e' || y1 - y0 < 70 ? [...fuera, ...dentro] : [...dentro, ...fuera];
    for (const [x, y, al] of cands) if (tz.magnetismoReservar(segs, x, y, al)) return { el, segs, x, y, al };
    return null;
  }
  // Círculos (px) que cubren el rectángulo de una etiqueta: la rejilla no pone símbolos debajo
  function evitarEtiqueta(q) {
    const w = tz.magnetismoAncho(q.segs), x0 = q.al === 'right' ? q.x - w : q.al === 'center' ? q.x - w / 2 : q.x, r = [];
    for (let x = x0; x <= x0 + w + 8; x += 8) r.push([x, q.y - 4, 15]);
    return r;
  }
  function dibujarValores(estados, impactos) {
    const v = tz.vista;
    for (const q of ETQ_REGIONES) if (!q.part) tz.compuesto(q.segs, q.x, q.y, { alinear: q.al, color: 'texto-2' });
    for (const el of ESC.elementos) {
      if (el.tipo === 'pantalla') {
        const im = impactos.filter(e => e.objeto === el.id).slice(-4);
        if (!im.length) continue;
        const [xa, ya] = v.P(el.a), [xb, yb] = v.P(el.b), xm = (xa + xb) / 2, ym = (ya + yb) / 2;
        const filas = [[{ t: el.nombre, f: 'ui', tam: 11.5 }], ...im.map(e => [{ t: `${ORIGEN[e.indice]?.nombre ?? e.particula}: `, f: 'ui', tam: 11 }, { t: 's', f: 'sim', tam: 13 }, { t: ' = ' + L(e.s), f: 'num', tam: 11.5 }])];
        const ab = im[im.length - 1].p, [px, py] = v.P(ab);
        tz.magnetismoFicha(filas, [[px + 16, py + 14], [px + 16, py - 90], [px - 180, py + 14], [px - 180, py - 90], [xm + 16, ym + 30]], [px, py]);
      }
    }
    for (const q of ETQ_REGIONES) if (q.part) tz.compuesto(q.segs, q.x, q.y, { alinear: q.al, color: 'texto-2' });
  }
  // Nombres de las partículas (si son pocas) y valores de la seleccionada: se
  // reservan antes de las rejillas de ⊙/⊗, que dejan libre su sitio
  function planearParticulas(estados) {
    if (!SIM) return;
    const v = tz.vista, k0 = trSel();
    const colocar = (segs, cands) => { for (const [x, y, al] of cands) if (tz.magnetismoReservar(segs, x, y, al)) { ETQ_REGIONES.push({ segs, x, y, al, part: true }); return; } };
    // Los cuerpos de los vectores quedan reservados: ninguna etiqueta los tapa
    const E0 = escalas(), tramo = (X0, Y0, d, Lp) => { const m = Math.hypot(d[0], d[1]); if (!(m > 0)) return; const ux = d[0] / m, uy = -d[1] / m, x1 = X0 + ux * 8, y1 = Y0 + uy * 8, x2 = x1 + ux * Lp, y2 = y1 + uy * Lp; tz.magnetismoOcupar(Math.min(x1, x2) - 4, Math.min(y1, y2) - 4, Math.abs(x2 - x1) + 8, Math.abs(y2 - y1) + 8); };
    SIM.trayectorias.forEach((tr, k) => {
      const st = estados[k]; if (!st || !st.activa) return;
      const [X0, Y0] = v.P(st.p), vv = [st.v[0], st.v[1]], sv = Math.hypot(vv[0], vv[1]);
      if (ESC.capas.velocidad && sv > 0) tramo(X0, Y0, vv, Math.max(12, 46 * sv / E0.vref));
      if (ESC.capas.fuerza) { const F = fuerzaEn(k, st.p, vv, t), Ft = [F.FE[0] + F.FB[0], F.FE[1] + F.FB[1]], m = Math.hypot(Ft[0], Ft[1]); if (m > 1e-3 * E0.fref) tramo(X0, Y0, Ft, Math.max(12, 40 * m / E0.fref)); }
    });
    for (const el of ESC.elementos) {
      if (el.tipo === 'placas') {
        const g = geomPlacas(el), [X1, Y1] = v.P(g.placas[0].b), [X2, Y2] = v.P(g.placas[1].b);
        const segs = [{ t: 'ΔV', f: 'sim', tam: 13, color: 'electrico' }, { t: ' = ' + conPrefijo(el.dV, 'V', 3), f: 'num', tam: 11, color: 'texto-2' }];
        const xm = (X1 + X2) / 2, ym = (Y1 + Y2) / 2;
        colocar(segs, [[xm + 20, ym + 4, 'left'], [xm - 20, ym + 4, 'right'], [xm, ym - 16, 'center'], [xm, ym + 24, 'center']]);
      } else if (el.tipo === 'fuente') {
        const [X0, Y0] = v.P(el.p), txt = el.especies.map(q => q.nombre).join(', ') + (el.modo === 'V' ? ` · V = ${conPrefijo(el.V, 'V', 3)}` : ` · v = ${conPrefijo(el.v, 'm/s', 3)}`);
        const d = dir(el.angulo), bx = X0 - d[0] * 24, by = Y0 + d[1] * 24;
        colocar([{ t: txt, f: 'ui', tam: 11, color: 'texto-2' }], [[bx, by + 32, 'center'], [bx, by - 22, 'center'], [bx - 30, by + 4, 'right'], [bx + 30, by + 4, 'left'], [bx + 40, by + 32, 'left'], [bx - 40, by - 22, 'right']]);
      }
    }
    const pocas = SIM.trayectorias.length <= 4, E = escalas();
    SIM.trayectorias.forEach((tr, k) => {
      const st = estados[k]; if (!st || (!st.activa && tr.fin && tr.fin.motivo === 'caja')) return;
      const [X0, Y0] = v.P(st.p);
      if (pocas || k === k0) colocar([{ t: ORIGEN[k].nombre, f: 'ui', tam: 11, color: 'texto-2' }], [[X0 + 12, Y0 + 20, 'left'], [X0 - 12, Y0 + 20, 'right'], [X0 + 12, Y0 - 12, 'left'], [X0 - 12, Y0 - 12, 'right']]);
      if (k !== k0 || !st.activa) return;
      const vv = [st.v[0], st.v[1]], s = Math.hypot(vv[0], vv[1]);
      if (ESC.capas.velocidad && s > 0) {
        const Lp = Math.max(12, 46 * s / E.vref) + 8, fx = X0 + vv[0] / s * Lp, fy = Y0 - vv[1] / s * Lp, der = vv[0] >= -0.2 * s, sg = der ? 1 : -1, al = der ? 'left' : 'right';
        colocar([{ t: 'v', f: 'sim', tam: 13, color: 'movimiento' }, { t: ' = ' + conPrefijo(s, 'm/s', 4), f: 'num', tam: 11, color: 'texto-2' }], [[fx + 8 * sg, fy + 4, al], [fx, fy - 10, 'center'], [fx, fy + 20, 'center'], [fx - 8 * sg, fy + 20, der ? 'right' : 'left'], [fx + 8 * sg, fy - 14, al], [fx + 8 * sg, fy + 22, al]]);
      }
      if (ESC.capas.fuerza) {
        const F = fuerzaEn(k, st.p, vv, t), Ft = [F.FE[0] + F.FB[0], F.FE[1] + F.FB[1]], m = Math.hypot(Ft[0], Ft[1]);
        if (m > 1e-3 * E.fref) {
          const Lp = Math.max(12, 40 * m / E.fref) + 8, fx = X0 + Ft[0] / m * Lp, fy = Y0 - Ft[1] / m * Lp, der = Ft[0] >= -0.2 * m, sg = der ? 1 : -1, al = der ? 'left' : 'right';
          colocar([{ t: 'F', f: 'sim', tam: 13, color: 'interaccion' }, { t: ' = ' + fuerzaTxt(m), f: 'num', tam: 11, color: 'texto-2' }], [[fx + 8 * sg, fy + 4, al], [fx, fy + 20, 'center'], [fx, fy - 10, 'center'], [fx - 8 * sg, fy - 10, der ? 'right' : 'left'], [fx + 8 * sg, fy + 22, al], [fx + 8 * sg, fy - 14, al]]);
        }
      }
    });
  }
  function cajaPx(pts) { const P = pts.map(p => tz.vista.P(p)), xs = P.map(p => p[0]), ys = P.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; }
  function dibujarSeleccion(estados) {
    const v = tz.vista;
    if (typeof sel === 'string' && sel.startsWith('tr:')) { const st = estados[+sel.slice(3)]; if (st) { const [X0, Y0] = v.P(st.p); tz.seleccionCirculo(X0, Y0, 13); } return; }
    const el = elDe(sel); if (!el) return;
    if (el.tipo === 'particula') {
      const k = ORIGEN.findIndex(o => o.el === el), st = k >= 0 ? estados[k] : null, p = st && t > 0 ? st.p : el.p, [X0, Y0] = v.P(p);
      tz.seleccionCirculo(X0, Y0, 13);
      const a = asaDe(el); if (a) { tz.lineaPx([[X0, Y0], a], { color: 'texto-3', grosor: 1, patron: 'auxiliar' }); tz.asaVector(a[0], a[1], arrastre && arrastre.tipo === 'vel'); }
      return;
    }
    if (el.tipo === 'fuente') { const [X0, Y0] = v.P(el.p), d = dir(el.angulo); tz.seleccionCirculo(X0 - d[0] * 11, Y0 + d[1] * 11, 18); }
    else if (el.tipo === 'placa' || el.tipo === 'pantalla') { const A = v.P(el.a), B = v.P(el.b); tz.lineaPx([A, B], { color: 'tinta', grosor: 1, patron: 'seleccion' }); tz.asa(A[0], A[1]); tz.asa(B[0], B[1]); }
    else { const [x, y, w, h] = cajaPx(puntosDe(el)); tz.seleccionCaja(x, y, w, h); }
    if ((el.tipo === 'region-b' || el.tipo === 'region-e') && el.forma === 'rect') { const a = asaDe(el); tz.asa(a[0], a[1]); }
    if (el.tipo === 'fuente' || el.tipo === 'placas' || el.tipo === 'hall') {
      const a = asaDe(el), c = v.P(el.tipo === 'fuente' ? el.p : el.centro);
      tz.lineaPx([c, a], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
      tz.asaVector(a[0], a[1], arrastre && arrastre.tipo === 'giro');
    }
  }
  // Asas: velocidad de una partícula, giro de fuente/placas/lámina, esquina de una región rectangular
  function asaDe(el) {
    const v = tz.vista;
    if (el.tipo === 'particula') { if (t > 0) return null; const [X0, Y0] = v.P(el.p), d = dir(el.angulo); return [X0 + d[0] * 54, Y0 - d[1] * 54]; }
    if (el.tipo === 'fuente') { const [X0, Y0] = v.P(el.p), d = dir(el.angulo); return [X0 + d[0] * 40, Y0 - d[1] * 40]; }
    if (el.tipo === 'placas' || el.tipo === 'hall') { const [X0, Y0] = v.P(el.centro), d = dir(el.angulo), r = Math.max(40, (el.tipo === 'hall' ? el.largo : el.separacion) * v.escala / 2 + 24); return [X0 + d[0] * r, Y0 - d[1] * r]; }
    if ((el.tipo === 'region-b' || el.tipo === 'region-e') && el.forma === 'rect') return v.P([el.centro[0] + el.ancho / 2, el.centro[1] - el.alto / 2]);
    return null;
  }

  // ---------------------------------------------------------------------
  // Selección en el lienzo
  // ---------------------------------------------------------------------
  const distSeg = (P, A, B) => { const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy, s = L2 ? Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2)) : 0; return Math.hypot(P[0] - A[0] - s * dx, P[1] - A[1] - s * dy); };
  const dentroPoli = (P, pts) => { let d = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > P[1]) !== (b[1] > P[1]) && P[0] < (b[0] - a[0]) * (P[1] - a[1]) / (b[1] - a[1]) + a[0]) d = !d; } return d; };
  function objetoEn(X0, Y0) {
    const v = tz.vista, P = [X0, Y0], s = elDe(sel);
    if (s) {
      const a = asaDe(s);
      if (a && Math.hypot(X0 - a[0], Y0 - a[1]) < 9) return { id: s.id, asa: s.tipo === 'particula' ? 'vel' : (s.tipo === 'region-b' || s.tipo === 'region-e') ? 'esq' : 'giro' };
      if (s.tipo === 'placa' || s.tipo === 'pantalla') for (const k of ['a', 'b']) { const [x, y] = v.P(s[k]); if (Math.hypot(X0 - x, Y0 - y) < 8) return { id: s.id, asa: k }; }
    }
    if (ESC.regla) for (const j of [0, 1]) { const [x, y] = v.P(ESC.regla[j]); if (Math.hypot(X0 - x, Y0 - y) < 8) return { id: 'regla', asa: j }; }
    // Partículas (en su posición en t) y fuentes
    if (SIM) {
      for (let k = SIM.trayectorias.length - 1; k >= 0; k--) {
        const st = estadoParticula(SIM.trayectorias[k], t); if (!st) continue;
        const [x, y] = v.P(st.p);
        if (Math.hypot(X0 - x, Y0 - y) < 11) { const el = ORIGEN[k].el; return el.tipo === 'particula' && t === 0 ? { id: el.id } : { id: 'tr:' + k }; }
      }
    }
    for (let i = ESC.elementos.length - 1; i >= 0; i--) {
      const el = ESC.elementos[i];
      if (el.tipo === 'particula') { const [x, y] = v.P(el.p); if (Math.hypot(X0 - x, Y0 - y) < 11) return { id: el.id }; }
      if (el.tipo === 'fuente') { const [x, y] = v.P(el.p), d = dir(el.angulo); if (Math.hypot(X0 - (x - d[0] * 11), Y0 - (y + d[1] * 11)) < 16) return { id: el.id }; }
    }
    for (let i = ESC.elementos.length - 1; i >= 0; i--) {
      const el = ESC.elementos[i];
      if ((el.tipo === 'placa' || el.tipo === 'pantalla') && distSeg(P, v.P(el.a), v.P(el.b)) < 7) return { id: el.id };
      if (el.tipo === 'placas') { const g = geomPlacas(el); if (g.placas.some(o => distSeg(P, v.P(o.a), v.P(o.b)) < 7) || dentroPoli(P, g.region.poligono.map(p => v.P(p)))) return { id: el.id }; }
      if (el.tipo === 'hall' && dentroPoli(P, puntosDe(el).map(p => v.P(p)))) return { id: el.id };
    }
    // Trayectorias (a menos de 5 px de su trazo)
    if (SIM) {
      for (let k = SIM.trayectorias.length - 1; k >= 0; k--) {
        const tr = SIM.trayectorias[k], paso = Math.max(1, Math.floor(tr.n / 1500));
        let prev = v.P([tr.x[0], tr.y[0]]);
        for (let i = paso; i < tr.n; i += paso) { const q = v.P([tr.x[i], tr.y[i]]); if (distSeg(P, prev, q) < 5) return { id: 'tr:' + k }; prev = q; }
      }
    }
    for (let i = ESC.elementos.length - 1; i >= 0; i--) {
      const el = ESC.elementos[i];
      if ((el.tipo === 'region-b' || el.tipo === 'region-e') && dentroPoli(P, poligonoDe(el).map(p => v.P(p)))) return { id: el.id };
    }
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
    const val = leer(ruta), f = FAC[u] ?? 1;
    return fila(etq, `<div class="campo"><input data-ruta="${ruta}" data-dim="${dim}" data-u="${u}" value="${val == null ? '' : numCampo(val / f)}"><span class="u">${u}</span></div>`, ayuda);
  }
  const boton = (id, ico, txt, ayuda) => `<button class="btn btn-secundario btn-compacto" id="${id}" data-ayuda="${ayuda}"><svg class="ico"><use href="#${ico}"/></svg>${txt}</button>`;
  const uT = () => UT()[1];

  function inspector() {
    const props = $('#propiedades'); props.innerHTML = '';
    let el = elDe(sel), trk = typeof sel === 'string' && sel.startsWith('tr:') ? +sel.slice(3) : -1;
    if (trk >= 0 && ORIGEN[trk]) el = null;
    let titulo = 'Propiedades', ico = 'm-magnetismo', nombre = ESC.titulo;
    const accionesObjeto = () => `<div class="fila"><span class="etq">Objeto</span><div class="acciones-fila">${boton('p-duplicar', 'i-duplicar', 'Duplicar', 'Duplicar|Duplicate|Ctrl D')}${boton('p-quitar', 'i-borrar', 'Quitar', 'Quitar el objeto|Delete|Supr')}</div></div>`;
    if (trk >= 0 && ORIGEN[trk]) {
      const o = ORIGEN[trk]; nombre = o.nombre; ico = 'o-particula-cargada'; titulo = 'Trayectoria';
      props.innerHTML = fila('Origen', `<div class="acciones-fila">${boton('p-origen', TIPOS[o.el.tipo].ico, o.el.nombre, 'Seleccionar el objeto que la emite|Source')}</div>`)
        + fila('q', `<span class="num">${fmt(o.q / QE, 4)} e</span>`, 'Carga en cargas elementales|Charge') + fila('m', `<span class="num">${fmt(o.m / UMA, 5)} u</span>`, 'Masa en unidades de masa atómica|Mass');
    } else if (sel === 'regla' && ESC.regla) {
      nombre = 'Regla'; ico = 'n-regla'; titulo = 'Regla';
      props.innerHTML = `<div class="fila"><span class="etq">Objeto</span><div class="acciones-fila">${boton('p-quitar', 'i-borrar', 'Quitar', 'Quitar la regla|Delete|Supr')}</div></div>`;
    } else if (!el) {
      nombre = 'Escena'; titulo = 'Escena';
      props.innerHTML = fila('Unidad', segmentado('p-unidad', [['mm', 'mm'], ['cm', 'cm'], ['m', 'm']], U()), 'Unidad de longitud de los ejes|Length unit')
        + campo('Duración', 'duracion', 'tiempo', uT(), 'Tiempo físico que se simula|Duration')
        + (ESC.nota ? `<p class="ayuda-fila" style="margin:6px 0 2px">${ESC.nota}</p>` : '');
    } else {
      const i = idxDe(sel), b = `elementos.${i}`, u = U();
      nombre = el.nombre; ico = TIPOS[el.tipo].ico; titulo = TIPOS[el.tipo].nombre;
      const pos = (k = 'centro') => campo('x', `${b}.${k}.0`, 'longitud', u) + campo('y', `${b}.${k}.1`, 'longitud', u);
      let h = '';
      switch (el.tipo) {
        case 'particula':
          h += pos('p') + campo('q', `${b}.q`, 'carga', 'e', 'Carga en múltiplos de la carga elemental (con signo)|Charge') + campo('m', `${b}.m`, 'masa', 'u', 'Masa en unidades de masa atómica|Mass')
            + fila('Especie', segmentado('p-especie', [['proton', 'p⁺'], ['alfa', 'α'], ['electron', 'e⁻']], Object.keys(ESPECIES).find(k => ESPECIES[k].q === el.q && Math.abs(ESPECIES[k].m / el.m - 1) < 1e-9) || ''), 'Protón, partícula alfa o electrón|Species')
            + campo('v', `${b}.v`, 'velocidad', 'm/s', 'Rapidez inicial|Speed') + campo('Dirección', `${b}.angulo`, 'adimensional', '°', 'Dirección de la velocidad inicial (arrastra el asa)|Direction');
          break;
        case 'fuente':
          h += pos('p') + campo('Dirección', `${b}.angulo`, 'adimensional', '°', 'Dirección de emisión|Direction')
            + fila('Rapidez', segmentado('p-modo', [['V', 'Por voltaje', 'Cada especie sale con v = √(2|q|V/m)|Accelerating voltage'], ['v', 'Dada', 'Todas salen con la misma rapidez|Given speed']], el.modo))
            + (el.modo === 'V' ? campo('V', `${b}.V`, 'potencial', 'V', 'Voltaje de aceleración|Accelerating voltage') : campo('v', `${b}.v`, 'velocidad', 'm/s', 'Rapidez de salida|Speed'))
            + campo('Cantidad', `${b}.cantidad`, 'adimensional', '', 'Partículas por especie|Particles per species') + campo('Abanico', `${b}.abanico`, 'adimensional', '°', 'Ángulo total del abanico de emisión|Spread')
            + campo('Intervalo', `${b}.intervalo`, 'tiempo', uT(), 'Tiempo entre una emisión y la siguiente (0: todas a la vez)|Emission interval');
          h += `<div class="fila"><span class="etq">Especies</span><div class="acciones-fila">${boton('p-especie-mas', 'i-mas', 'Añadir', 'Añadir una especie a la mezcla|Add species')}</div></div>`;
          el.especies.forEach((s, k) => {
            h += `<div class="especie"><span>${s.nombre}</span>${el.especies.length > 1 ? `<button class="btn btn-fantasma btn-compacto btn-icono" data-quitar-especie="${k}" data-ayuda="Quitar ${s.nombre}|Remove species"><svg class="ico"><use href="#i-cerrar"/></svg></button>` : '<span></span>'}</div>`
              + campo('q', `${b}.especies.${k}.q`, 'carga', 'e') + campo('m', `${b}.especies.${k}.m`, 'masa', 'u');
          });
          break;
        case 'region-b': case 'region-e':
          if (el.forma === 'rect') h += pos() + campo('Ancho', `${b}.ancho`, 'longitud', u) + campo('Alto', `${b}.alto`, 'longitud', u);
          else h += `<p class="ayuda-fila" style="margin:2px 0 6px">Región de forma libre (${el.puntos.length} vértices): arrástrala en el lienzo para moverla.</p>`;
          if (el.tipo === 'region-b') h += campo('B', `${b}.B`, 'campoMagnetico', 'T', 'Componente perpendicular al plano: + saliente (⊙), − entrante (⊗)|Magnetic field');
          else {
            h += campo('E', `${b}.E`, 'campoElectrico', 'V/m', 'Magnitud del campo|Electric field') + campo('Dirección', `${b}.angulo`, 'adimensional', '°', 'Dirección de E|Direction')
              + fila('Alterno', segmentado('p-alterna', [['', 'No'], ['cuadrada', 'Cuadrado'], ['senoidal', 'Senoidal']], el.alterna || ''), 'E·signo(cos 2πft) o E·cos 2πft (ciclotrón)|Alternating field');
            if (el.alterna) h += campo('f', `${b}.frecuencia`, 'frecuencia', 'MHz', 'Frecuencia del campo alterno|Frequency')
              + `<div class="fila"><span class="etq"></span><div class="acciones-fila">${boton('p-sintonia', 'i-precision', 'f = qB/2πm', 'Sintonizar con el ciclotrón de la primera partícula y la primera región B|Tune to cyclotron frequency')}</div></div>`;
          }
          break;
        case 'placas':
          h += pos() + campo('ΔV', `${b}.dV`, 'potencial', 'V', 'Diferencia de potencial de la placa a a la b|Voltage') + campo('d', `${b}.separacion`, 'longitud', u, 'Separación|Gap')
            + campo('Largo', `${b}.largo`, 'longitud', u) + campo('Agujero', `${b}.agujero`, 'longitud', u, 'Ancho del agujero central|Hole') + campo('Dirección', `${b}.angulo`, 'adimensional', '°', 'Dirección del campo, de la placa a a la b|Field direction');
          break;
        case 'placa':
          h += campo('x₁', `${b}.a.0`, 'longitud', u) + campo('y₁', `${b}.a.1`, 'longitud', u) + campo('x₂', `${b}.b.0`, 'longitud', u) + campo('y₂', `${b}.b.1`, 'longitud', u)
            + fila('Signo', segmentado('p-signo', [['1', '+'], ['-1', '−'], ['0', 'Sin']], String(el.signo || 0)), 'Solo el dibujo: el campo lo da la región E|Sign');
          break;
        case 'pantalla':
          h += campo('x₁', `${b}.a.0`, 'longitud', u) + campo('y₁', `${b}.a.1`, 'longitud', u) + campo('x₂', `${b}.b.0`, 'longitud', u) + campo('y₂', `${b}.b.1`, 'longitud', u)
            + `<p class="ayuda-fila" style="margin:2px 0 6px">s: posición de cada impacto medida desde el extremo 1.</p>`;
          break;
        case 'hall':
          h += pos() + campo('Largo c', `${b}.largo`, 'longitud', u) + campo('Ancho b', `${b}.ancho`, 'longitud', u, 'Transversal a I y a B: entre los bordes del voltímetro|Width') + campo('Espesor a', `${b}.espesor`, 'longitud', u, 'En la dirección de B|Thickness')
            + campo('I', `${b}.I`, 'corriente', 'A', 'Corriente a lo largo de la lámina|Current') + campo('B', `${b}.B`, 'campoMagnetico', 'T', 'Perpendicular a la lámina: + saliente|Field')
            + campo('n', `${b}.n`, DIM_N, 'm⁻³', 'Portadores por unidad de volumen|Carrier density')
            + fila('Portadores', segmentado('p-portador', [['-1', 'Negativos (n)'], ['1', 'Positivos (p)']], String(el.signo)))
            + campo('Dirección', `${b}.angulo`, 'adimensional', '°', 'Dirección de la corriente|Current direction');
          break;
        default: break;
      }
      props.innerHTML = h + accionesObjeto();
    }
    $('#insp-ico').setAttribute('href', '#' + ico);
    $('#insp-nombre').textContent = nombre;
    $('#props-titulo').textContent = titulo;
    document.querySelectorAll('#propiedades input[data-ruta]').forEach(campoConUnidad);
    const on = (id, f) => { const e = $(id); if (e) e.addEventListener('click', ev => { const bt = ev.target.closest('button'); if (bt) f(bt.dataset.v, bt); }); };
    on('#p-unidad', v => { ESC.unidad = v; for (const d of Object.values(ESC.variables)) if (['mm', 'cm', 'm'].includes(d.u) && FAC[d.u]) { const k = FAC[d.u] / FAC[v]; d.min *= k; d.max *= k; d.val *= k; d.paso *= k; d.factor = Math.sign(d.factor) * FAC[v]; d.u = v; } cambio(); construirVariables(); });
    on('#p-modo', v => { elDe(sel).modo = v; limpiarVariables(); cambio(); });
    on('#p-alterna', v => { const e = elDe(sel); e.alterna = v || null; if (v && !(e.frecuencia > 0)) e.frecuencia = frecuenciaCiclotron() || 1e6; cambio(); });
    on('#p-signo', v => { elDe(sel).signo = Number(v); cambio(); });
    on('#p-portador', v => { elDe(sel).signo = Number(v); cambio(); });
    on('#p-especie', v => { const e = elDe(sel); if (!ESPECIES[v]) return; e.q = ESPECIES[v].q; e.m = ESPECIES[v].m; e.nombre = texto(ESPECIES[v].nombre, 'Partícula', 40); limpiarVariables(); cambio(); });
    const bs = $('#p-sintonia'); if (bs) bs.addEventListener('click', () => { const f = frecuenciaCiclotron(); if (f) { const e = elDe(sel); e.frecuencia = f; sincronizarVariables([`elementos.${idxDe(sel)}.frecuencia`]); cambio(); avisar(`f = ${conPrefijo(f, 'Hz')}`); } else avisar('Hace falta una partícula y una región B', false); });
    const bm = $('#p-especie-mas'); if (bm) bm.addEventListener('click', () => {
      const e = elDe(sel), libres = Object.keys(ESPECIES).filter(k => !e.especies.some(s => s.nombre === ESPECIES[k].nombre));
      if (!libres.length || e.especies.length >= 4) { avisar('La mezcla admite hasta cuatro especies', false); return; }
      e.especies.push(especie(libres[0])); cambio(); avisar(`${ESPECIES[libres[0]].nombre} añadido a la fuente`);
    });
    document.querySelectorAll('[data-quitar-especie]').forEach(bq => bq.addEventListener('click', () => { const e = elDe(sel), k = +bq.dataset.quitarEspecie, n = e.especies[k].nombre; e.especies.splice(k, 1); limpiarVariables(); cambio(); avisar(`${n} quitado de la fuente`); }));
    const bo = $('#p-origen'); if (bo) bo.addEventListener('click', () => { const o = ORIGEN[trk]; if (o) seleccionar(o.el.id); });
    const b1 = $('#p-quitar'); if (b1) b1.addEventListener('click', quitarSeleccion);
    const b2 = $('#p-duplicar'); if (b2) b2.addEventListener('click', duplicar);
    arbol();
  }
  function frecuenciaCiclotron() {
    const o = ORIGEN[0], r = ESC.elementos.find(e => e.tipo === 'region-b');
    return o && r && r.B ? Math.abs(o.q * r.B) / (DOS_PI * o.m) : null;
  }

  // Validación de cada ruta (en SI)
  function validar(ruta, x) {
    const k = ruta.split('.').pop(), pos = (max, msj) => { if (!(x > 0)) throw new Error('Este valor tiene que ser positivo.'); if (x > max) throw new Error(msj); };
    if (['ancho', 'alto', 'largo', 'separacion', 'agujero', 'espesor'].includes(k)) pos(1e3, 'Este valor es demasiado grande (máximo 1 km).');
    if (k === 'B' && !(Math.abs(x) <= 100)) throw new Error('El campo va de −100 T a 100 T.');
    if (k === 'E' && !(x >= 0 && x <= 1e10)) throw new Error('E va de 0 a 10¹⁰ V/m; para invertirlo, cambia su dirección.');
    if (k === 'v' && !(x >= 0 && x <= 3e7)) throw new Error('La rapidez va de 0 a 3 × 10⁷ m/s: el motor no es relativista (hasta 0.1 c).');
    if ((k === 'V' || k === 'dV') && !(Math.abs(x) <= 1e7)) throw new Error('El voltaje va de −10 MV a 10 MV.');
    if (k === 'q' && !(x !== 0 && Math.abs(x) <= 1e3 * QE)) throw new Error('La carga no puede ser cero y va hasta ±1000 e.');
    if (k === 'm' && !(x > 0 && x <= 1e-20)) throw new Error('La masa tiene que ser positiva (hasta 10⁻²⁰ kg).');
    if (k === 'I' && !(Math.abs(x) <= 1e4)) throw new Error('La corriente va de −10 kA a 10 kA.');
    if (k === 'n' && !(x >= 1e10 && x <= 1e31)) throw new Error('La densidad de portadores va de 10¹⁰ a 10³¹ m⁻³.');
    if (k === 'frecuencia' && !(x >= 0 && x <= 1e12)) throw new Error('La frecuencia va de 0 a 1 THz.');
    if (k === 'cantidad') { if (!(x >= 1 && x <= 40)) throw new Error('Entre 1 y 40 partículas por especie.'); return Math.round(x); }
    if (k === 'abanico' && !(x >= 0 && x <= Math.PI)) throw new Error('El abanico va de 0° a 180°.');
    if (k === 'intervalo' && !(x >= 0 && x <= 1e3)) throw new Error('El intervalo no puede ser negativo.');
    if (k === 'duracion') { if (!(x > 0 && x <= 1e3)) throw new Error('La duración va de un instante a 1000 s.'); }
    if (k === 'angulo' && !(Math.abs(x) <= 100)) throw new Error('Ángulo fuera de rango.');
    if ((ruta.endsWith('.0') || ruta.endsWith('.1')) && !ruta.includes('especies') && Math.abs(x) > 1e3) throw new Error('La posición está demasiado lejos (máximo 1 km).');
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
        if (soloNumero && (u === 'e' || u === 'u' || u === 'm⁻³' || u === '')) valor = parseFloat(txt) * (FAC[u] ?? 1);
        else {
          if (soloNumero && u && u !== '°') txt = `${txt} ${u}`;
          valor = evaluar(txt, { esperada: dim, unidadPorDefecto: u === '°' ? '°' : undefined }).valor;
        }
        const ruta = ent.dataset.ruta, x = validar(ruta, valor);
        escribir(ruta, x);
        mostrarError(null); cambio();
      } catch (e) { mostrarError(e.message); }
    });
    ent.addEventListener('keydown', ev => { if (ev.key === 'Escape') { mostrarError(null); ent.blur(); inspector(); } });
  }

  function arbol() {
    const nodo = (s, ico, nombre, dato) => `<div class="nodo" data-sel="${s}" aria-selected="${sel === s}"><svg class="ico"><use href="#${ico}"/></svg><span class="nombre">${nombre}</span><span class="dato">${dato}</span></div>`;
    const np = SIM ? SIM.trayectorias.length : 0;
    let h = nodo('escena', 'm-magnetismo', 'Escena', SIM ? `${np} ${np === 1 ? 'partícula' : 'partículas'}` : '—');
    for (const el of ESC.elementos) h += nodo(el.id, TIPOS[el.tipo].ico, el.nombre, datoArbol(el));
    if (ESC.regla) h += nodo('regla', 'n-regla', 'Regla', L(Math.hypot(ESC.regla[1][0] - ESC.regla[0][0], ESC.regla[1][1] - ESC.regla[0][1]), 3));
    $('#arbol').innerHTML = h;
    $('#arbol').querySelectorAll('.nodo[data-sel]').forEach(n => n.addEventListener('click', () => seleccionar(n.dataset.sel)));
  }
  function datoArbol(el) {
    switch (el.tipo) {
      case 'particula': return `${el.q > 0 ? '+' : '−'}${fmt(Math.abs(el.q / QE), 3)} e`;
      case 'fuente': { const n = el.especies.length * Math.max(1, Math.round(el.cantidad)); return `${n} ${n === 1 ? 'ion' : 'iones'}`; }
      case 'region-b': return conPrefijo(el.B, 'T', 3);
      case 'region-e': return conPrefijo(el.E, 'V/m', 3);
      case 'placas': return conPrefijo(el.dV, 'V', 3);
      case 'pantalla': return SIM ? `${SIM.impactos.filter(e => e.objeto === el.id).length} impactos` : '';
      case 'hall': return conPrefijo(el.I, 'A', 3);
      default: return '';
    }
  }
  function seleccionar(s) { if (s === sel) return; sel = s; inspector(); todo(); }

  const lectura = ([a, b, val, u, ayuda]) => `<span class="sim"${ayuda ? ` data-ayuda="${ayuda}"` : ''}>${a}${b ? `<sub class="r">${b}</sub>` : ''}</span><span class="v">${val}</span><span class="u">${u}</span>`;
  // Valor con prefijo SI separado en número y unidad (conPrefijo usa el espacio fino U+202F)
  const partes = (v, u, cifras = 4) => { const s = conPrefijo(v, u, cifras), i = s.lastIndexOf(ESP); return i > 0 ? [s.slice(0, i), s.slice(i + ESP.length)] : [s, u]; };
  const fl = (a, b, v, u, ay) => { const [n, uu] = partes(v, u); return [a, b, n, uu, ay]; };
  const fc = (a, b, v, u, ay) => [a, b, fmtG(v, 4), u, ay];  // sin prefijo (fuerzas: notación científica)
  const fL = (a, b, v, ay) => [a, b, fmt(v / FU(), 4), U(), ay];  // longitudes en la unidad de la escena
  function lecturas() {
    document.querySelectorAll('[data-var]').forEach(e => { const d = ESC.variables[e.dataset.var]; if (!d) return; const x = e.dataset.rutaVar ? leer(e.dataset.rutaVar) : null; e.textContent = typeof x === 'number' ? numCampo(x / (FAC[e.dataset.uvar] ?? 1)) : fmtVar(d); });
    $('#reloj').innerHTML = `<span class="sim">t</span>${partes(t, 's', 4).join(`<span class="u">`)}</span>`;
    $('#lect-titulo').textContent = `Lecturas en t = ${T(t)}`;
    const f = [];
    let estado = '';
    const k = trSel(), el = elDe(sel), esTr = typeof sel === 'string' && sel.startsWith('tr:');
    if ((esTr || (el && (el.tipo === 'particula' || el.tipo === 'fuente'))) && SIM && k >= 0) {
      const tr = SIM.trayectorias[k], st = estadoParticula(tr, t), o = ORIGEN[k];
      if (el && el.tipo === 'fuente') {
        el.especies.forEach(s => f.push(fl('v', s.nombre.slice(0, 8), el.modo === 'V' ? rapidezAceleracion(s.q, s.m, el.V) : el.v, 'm/s', `Rapidez de salida de ${s.nombre}|Exit speed`)));
      }
      if (st) {
        const s = Math.hypot(st.v[0], st.v[1]), K = 0.5 * o.m * s * s, F = fuerzaEn(k, st.p, st.v, t), { B } = camposEn(st.p, t);
        f.push([`x`, '', fmt(st.p[0] / FU(), 4), U()], [`y`, '', fmt(st.p[1] / FU(), 4), U()], fl('v', '', s, 'm/s', 'Rapidez|Speed'), fl('K', '', K / QE, 'eV', 'Energía cinética|Kinetic energy'));
        f.push(fc('F', 'B', Math.hypot(...F.FB), 'N', 'Fuerza magnética q·v × B|Magnetic force'), fc('F', 'E', Math.hypot(...F.FE), 'N', 'Fuerza eléctrica q·E|Electric force'));
        if (B[2] && s > 0) f.push(fL('r', 'teórico', o.m * s / Math.abs(o.q * B[2]), 'm·v/(|q|·B) con la v y la B de ahora|Theoretical radius'), fl('T', 'teórico', DOS_PI * o.m / Math.abs(o.q * B[2]), 's', '2π·m/(|q|·B)|Theoretical period'));
        const ob = orbitaEn(k, st);
        if (ob) f.push(fL('r', 'medido', ob.radio, 'Radio de la circunferencia ajustada a la trayectoria|Measured radius'), fl('T', 'medido', ob.periodo, 's', '2π/|ω| medido|Measured period'));
        // Cuerda y tiempo entre la última entrada y su salida
        const evs = SIM.eventos.filter(e => e.indice === k && e.t <= t + 1e-18 && (e.tipo === 'entrada' || e.tipo === 'salida'));
        const sal = evs.filter(e => e.tipo === 'salida' && SIM.regiones[e.region]?.tipo === 'B').pop();
        if (sal) { const ent = evs.filter(e => e.tipo === 'entrada' && e.region === sal.region && e.t < sal.t).pop(); if (ent) f.push(fL('ℓ', 'cuerda', Math.hypot(sal.p[0] - ent.p[0], sal.p[1] - ent.p[1]), 'Distancia de la entrada a la salida de la región B|Chord'), fl('Δt', 'región', sal.t - ent.t, 's', 'Tiempo dentro de la región B|Time in region')); }
        estado = `${o.nombre} · ${st.activa ? 'en vuelo' : tr.fin?.motivo === 'pantalla' ? 'en la pantalla' : tr.fin?.motivo === 'placa' ? 'detenida en una placa' : tr.fin?.motivo === 'caja' ? 'fuera de la vista' : 'fin'}`;
      } else estado = `${o.nombre} · aún no sale`;
      f.push(fl('q/m', '', o.q / o.m, 'C/kg', 'Carga específica|Charge-to-mass ratio'));
    } else if (el && el.tipo === 'region-b') {
      f.push(fl('B', '', el.B, 'T'));
      const ks = SIM ? ORIGEN.map((o, j) => j) : [];
      for (const j of ks.slice(0, 3)) { const ob = (ORB[j] || []).find(o => REGIONES[o.region] === el); if (ob) f.push(fL('r', ORIGEN[j].nombre.slice(0, 8), ob.radio, `Radio medido de ${ORIGEN[j].nombre}|Measured radius`)); }
      estado = el.B > 0 ? 'Saliente ⊙' : el.B < 0 ? 'Entrante ⊗' : 'Sin campo';
    } else if (el && el.tipo === 'region-e') {
      f.push(fl('E', '', el.E * factorAlterno(el, t), 'V/m', 'Campo en este instante|Field now'), ['θ', '', fmt(el.angulo / GR, 4), '°', 'Dirección|Direction']);
      if (el.alterna) f.push(fl('f', '', el.frecuencia, 'Hz'), fl('T', '', 1 / el.frecuencia, 's', 'Periodo del campo|Period'));
      estado = el.alterna ? 'Alterno' : 'Uniforme';
    } else if (el && el.tipo === 'placas') {
      f.push(fl('ΔV', '', el.dV, 'V'), fl('E', '', el.dV / el.separacion, 'V/m', 'ΔV/d|Field'), fL('d', '', el.separacion));
      const o = ORIGEN[0]; if (o) f.push(fl('v', 'salida', Math.sqrt(Math.max(0, 2 * o.q * el.dV / o.m)), 'm/s', `√(2qΔV/m) de ${o.nombre} desde el reposo|Exit speed`));
      estado = `E = ${conPrefijo(el.dV / el.separacion, 'V/m', 3)}`;
    } else if (el && el.tipo === 'pantalla') {
      const im = SIM ? SIM.impactos.filter(e => e.objeto === el.id && e.t <= t + 1e-18) : [];
      im.slice(0, 6).forEach(e => f.push(fL('s', ORIGEN[e.indice]?.nombre.slice(0, 8), e.s, `Impacto de ${ORIGEN[e.indice]?.nombre}, medido desde el extremo 1|Impact position`)));
      if (im.length >= 2) f.push(fL('Δs', '', Math.abs(im[1].s - im[0].s), 'Separación de los dos primeros impactos|Separation'));
      estado = `${im.length} impactos`;
    } else if (el && el.tipo === 'hall') {
      const eq = eqHall(el);
      if (eq) {
        const fr = hallTransitorio(eq, t, tauHall()), q = QE;
        f.push(fl('v', 'deriva', eq.vd, 'm/s', 'Rapidez de deriva de los portadores I/(n·q·a·b)|Drift speed'), fc('N', '/t', el.n * el.espesor * el.ancho * eq.vd, 's⁻¹', 'Portadores que cruzan una sección por segundo: n·a·b·v|Carriers per second'));
        f.push(fc('F', 'B', eq.FB, 'N', 'q·v·B|Magnetic force'), fc('F', 'E', q * fr.EH, 'N', 'q·E de Hall en este instante|Electric force'));
        f.push(fl('E', 'H', fr.EH, 'V/m', 'Campo de Hall|Hall field'), fl('V', 'H', fr.VH, 'V', 'Voltaje de Hall en este instante|Hall voltage'), fl('V', 'eq', eq.VH, 'V', 'B·v·b = I·B/(n·q·a)|Equilibrium'));
        if (eq.VH > 0) f.push([`n`, 'medida', fmt(el.B * el.I / (q * el.espesor * eq.VH), 4), 'm⁻³', 'B·I/(q·a·V) con el V de equilibrio|Measured carrier density']);
        estado = fr.fraccion > 0.99 ? 'En equilibrio: qE = qvB' : `Cargando los bordes · ${fmt(100 * fr.fraccion, 3)} %`;
      } else estado = 'Datos no válidos';
    } else {
      f.push(['N', 'partículas', String(SIM ? SIM.trayectorias.length : 0), '', 'Partículas simuladas|Particles'], ['N', 'eventos', String(SIM ? SIM.eventos.length : 0), '', 'Entradas, salidas e impactos|Events'], fl('t', 'total', ESC.duracion, 's', 'Duración|Duration'));
      estado = `${ESC.elementos.length} objetos`;
    }
    $('#lecturas').innerHTML = f.map(lectura).join('') || '<span class="u">—</span>';
    $('#insp-estado').textContent = estado;
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
  // Línea de tiempo con la unidad de la escena (µs, ns): las marcas y la
  // ficha del evento se escriben en ella; los instantes siguen en segundos
  // ---------------------------------------------------------------------
  class LineaTiempoU extends LineaTiempo {
    dibujar() {
      const c = this.canvas, tk = leerTokens(), dpr = window.devicePixelRatio || 1;
      const r = c.getBoundingClientRect(); this.w = r.width; const H = r.height;
      c.width = Math.round(r.width * dpr); c.height = Math.round(H * dpr);
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, this.w, H);
      const yRiel = 22, [fu] = UT();
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
        // La unidad va con la última marca (alineada a la derecha si no cabe centrada)
        const txt = i === marcas.length - 1 ? `${fmtMarca(v, paso)}${ESP}${UT()[1]}` : fmtMarca(v, paso), wt = g.measureText(txt).width;
        if (x + wt / 2 > this.w - 2) { g.textAlign = 'right'; g.fillText(txt, this.w - 2, yRiel + 11); g.textAlign = 'center'; }
        else g.fillText(txt, x, yRiel + 11);
      });
      for (const e of this.eventos) rombo(g, this._x(e.t), yRiel - 9, 3.5, e === this.hover ? tk.tinta : tk['texto-2']);
      if (this.hover) {
        g.font = '500 11px "IBM Plex Sans", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
        const txt = `${this.hover.nombre} · ${T(this.hover.t)}`, wTxt = g.measureText(txt).width;
        let x = this._x(this.hover.t) + 8; if (x + wTxt + 12 > this.w) x = this._x(this.hover.t) - wTxt - 20;
        g.fillStyle = tk.tinta; g.beginPath(); g.roundRect(x, yRiel - 18, wTxt + 12, 18, 4); g.fill();
        g.fillStyle = tk['sobre-tinta']; g.fillText(txt, x + 6, yRiel - 9);
      }
      const xc = this._x(this.t);
      g.strokeStyle = tk.tinta; g.lineWidth = 1.5; g.beginPath(); g.moveTo(xc, yRiel - 12); g.lineTo(xc, yRiel + 8); g.stroke();
      g.fillStyle = tk.lienzo; g.beginPath(); g.arc(xc, yRiel, 6, 0, DOS_PI); g.fill(); g.stroke();
    }
  }

  // ---------------------------------------------------------------------
  // Gráficas
  // ---------------------------------------------------------------------
  const GRAFICAS = {
    posicion: { nombre: 'Posición x(t) e y(t)' },
    velocidad: { nombre: 'Velocidad: componentes y rapidez' },
    energia: { nombre: 'Energía cinética K(t)' },
    fuerza: { nombre: 'Fuerza magnética y eléctrica' },
    hall: { nombre: 'Voltaje de Hall V_H(t)' },
    'hall-fuerzas': { nombre: 'Fuerzas sobre un portador (Hall)' },
    'hall-b': { nombre: 'Voltaje de Hall contra B' },
  };
  const vacia = (n, msj) => { grafica($(`#g${n}`), { x: { min: 0, max: 1 }, y: { min: 0, max: 1 }, series: [] }); $(`#t${n}`).textContent = msj; $(`#l${n}`).textContent = ''; };
  function graficas() { if (!$('#p-graficas').hidden) ESC.graficas.forEach((g, j) => { try { grafica1(j + 1, g); } catch { vacia(j + 1, 'Sin datos'); } }); }
  // Escala de un eje: prefijo SI entre p y G; fuera de ese rango, potencia de diez
  function escalaSI(max, u) {
    const a = Math.abs(max) || 1, PF = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
    if (u !== 'N') { const p = PF.find(([f]) => a >= f * 0.999); if (p) return { f: p[0], u: p[1] + u }; }
    const e = Math.floor(Math.log10(a)), sup = String(e).replace('-', '⁻').replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]);
    return { f: Math.pow(10, e), u: e === 0 ? u : `10${sup} ${u}` };
  }
  // Serie de una trayectoria: [t, valor] en la unidad de tiempo de la escena
  function serie(k, fn) {
    const tr = SIM.trayectorias[k], [ft] = UT(), paso = Math.max(1, Math.floor(tr.n / 1500)), r = [];
    for (let i = 0; i < tr.n; i += paso) r.push([tr.t[i] / ft, fn(tr, i)]);
    r.push([tr.t[tr.n - 1] / ft, fn(tr, tr.n - 1)]);
    return r;
  }
  const rango = (vals, cero = true) => { let a = Math.min(...vals, cero ? 0 : Infinity), b = Math.max(...vals, cero ? 0 : -Infinity); if (!(b > a)) { a -= 1; b += 1; } const m = (b - a) * 0.08; return { min: cero && a >= 0 ? 0 : a - m, max: b + m }; };
  const leyenda = items => `<span class="leyenda">${items.map(([fam, pat, sim]) => `<span style="color:var(${fam === 'tinta' ? '--tinta' : '--f-' + fam})"><i${pat ? ` class="${pat}"` : ''}></i>${sim}</span>`).join('')}</span>`;
  function grafica1(n, tipo) {
    const cv = $(`#g${n}`), Tt = $(`#t${n}`), Lc = $(`#l${n}`), [ft, ut] = UT(), fu = FU();
    const eventos = k => SIM.eventos.filter(e => e.indice === k && e.t > 0).map(e => ({ x: e.t / ft }));
    if (tipo.startsWith('hall')) {
      const el = elDe(sel)?.tipo === 'hall' ? elDe(sel) : ESC.elementos.find(e => e.tipo === 'hall'), eq = el && eqHall(el);
      if (!el || !eq) { vacia(n, 'Sin lámina Hall'); return; }
      const tau = tauHall(), dur = ESC.duracion;
      if (tipo === 'hall') {
        const E = escalaSI(eq.VH, 'V'), pts = []; for (let i = 0; i <= 200; i++) { const tt = dur * i / 200; pts.push([tt / ft, hallTransitorio(eq, tt, tau).VH / E.f]); }
        grafica(cv, { x: { min: 0, max: dur / ft }, y: { min: 0, max: eq.VH / E.f * 1.15 }, series: [{ tramos: [pts], familia: 'electrico' }, { tramos: [[[0, eq.VH / E.f], [dur / ft, eq.VH / E.f]]], familia: 'texto-3', auxiliar: true, etiqueta: 'B·v·b' }], cursor: t / ft, puntoCursor: [t / ft, hallTransitorio(eq, t, tau).VH / E.f] });
        Tt.innerHTML = `${simHTML('V', 'H')} (${E.u})`;
        Lc.textContent = conPrefijo(hallTransitorio(eq, t, tau).VH, 'V');
      } else if (tipo === 'hall-fuerzas') {
        const E = escalaSI(eq.FB, 'N'), pB = [[0, eq.FB / E.f], [dur / ft, eq.FB / E.f]], pE = [];
        for (let i = 0; i <= 200; i++) { const tt = dur * i / 200; pE.push([tt / ft, QE * hallTransitorio(eq, tt, tau).EH / E.f]); }
        grafica(cv, { x: { min: 0, max: dur / ft }, y: { min: 0, max: eq.FB / E.f * 1.15 }, series: [{ tramos: [pB], familia: 'interaccion' }, { tramos: [pE], familia: 'interaccion', patron: 'discontinuo' }], cursor: t / ft });
        Tt.innerHTML = `${leyenda([['interaccion', '', simHTML('F', 'B')], ['interaccion', 'discontinua', simHTML('F', 'E')]])} (${E.u})`;
        Lc.textContent = '';
      } else {
        const Bm = Math.max(0.1, 2 * Math.abs(el.B)), k = eq.VH / (Math.abs(el.B) || 1), Bx = escalaSI(Bm, 'T'), E = escalaSI(k * Bm, 'V');
        grafica(cv, { x: { min: 0, max: Bm / Bx.f }, y: { min: 0, max: k * Bm / E.f * 1.08 }, series: [{ tramos: [[[0, 0], [Bm / Bx.f, k * Bm / E.f]]], familia: 'electrico' }], cursor: Math.abs(el.B) / Bx.f, puntoCursor: [Math.abs(el.B) / Bx.f, eq.VH / E.f] });
        Tt.innerHTML = `${simHTML('V', 'H')} (${E.u}) contra ${simHTML('B')} (${Bx.u})`;
        Lc.textContent = conPrefijo(eq.VH, 'V');
      }
      return;
    }
    if (!SIM || !SIM.trayectorias.length) { vacia(n, soloHall() ? 'Elige una gráfica de Hall' : 'Sin partículas'); return; }
    const k = trSel(), tr = SIM.trayectorias[k], st = estadoParticula(tr, t), o = ORIGEN[k], nom = '';
    cv.parentElement.querySelector('.cab-grafica').dataset.ayuda = `${GRAFICAS[tipo]?.nombre ?? ''} de ${o.nombre}; clic para elegir otra|Plot quantity`;
    const cursor = t / ft, xr = { min: 0, max: ESC.duracion / ft };
    if (tipo === 'posicion') {
      const px = serie(k, (q, i) => q.x[i] / fu), py = serie(k, (q, i) => q.y[i] / fu), yr = rango([...px, ...py].map(p => p[1]), false);
      grafica(cv, { x: xr, y: yr, series: [{ tramos: [px], familia: 'tinta' }, { tramos: [py], familia: 'tinta', patron: 'discontinuo' }], cursor, puntoCursor: st ? [cursor, st.p[0] / fu] : null, eventos: eventos(k) });
      Tt.innerHTML = `${leyenda([['tinta', '', simHTML('x')], ['tinta', 'discontinua', simHTML('y')]])} (${U()})${nom}`;
      Lc.textContent = st ? `${fmt(st.p[0] / fu, 4)}${ESP}${U()}` : '';
    } else if (tipo === 'velocidad') {
      let vmax = 0; for (let i = 0; i < tr.n; i++) vmax = Math.max(vmax, Math.hypot(tr.vx[i], tr.vy[i]));
      const E = escalaSI(vmax, 'm/s'), vx = serie(k, (q, i) => q.vx[i] / E.f), vy = serie(k, (q, i) => q.vy[i] / E.f), vm = serie(k, (q, i) => Math.hypot(q.vx[i], q.vy[i]) / E.f);
      grafica(cv, { x: xr, y: rango([...vx, ...vy, ...vm].map(p => p[1]), true), series: [{ tramos: [vm], familia: 'movimiento' }, { tramos: [vx], familia: 'movimiento', patron: 'discontinuo' }, { tramos: [vy], familia: 'movimiento', patron: 'punteado' }], cursor, puntoCursor: st ? [cursor, Math.hypot(st.v[0], st.v[1]) / E.f] : null, eventos: eventos(k) });
      Tt.innerHTML = `${leyenda([['movimiento', '', simHTML('|v|')], ['movimiento', 'discontinua', simHTML('v', 'x', false)], ['movimiento', 'punteada', simHTML('v', 'y', false)]])} (${E.u})${nom}`;
      Lc.textContent = st ? conPrefijo(Math.hypot(st.v[0], st.v[1]), 'm/s') : '';
    } else if (tipo === 'energia') {
      const Kf = (q, i) => 0.5 * o.m * (q.vx[i] ** 2 + q.vy[i] ** 2) / QE;
      let kmax = 0; for (let i = 0; i < tr.n; i++) kmax = Math.max(kmax, Kf(tr, i));
      const E = escalaSI(kmax || 1, 'eV'), pk = serie(k, (q, i) => Kf(q, i) / E.f);
      grafica(cv, { x: xr, y: { min: 0, max: Math.max(1e-9, ...pk.map(p => p[1])) * 1.1 }, series: [{ tramos: [pk], familia: 'movimiento' }], cursor, puntoCursor: st ? [cursor, 0.5 * o.m * (st.v[0] ** 2 + st.v[1] ** 2) / QE / E.f] : null, eventos: eventos(k) });
      Tt.innerHTML = `${simHTML('K')} (${E.u})${nom}`;
      Lc.textContent = st ? conPrefijo(0.5 * o.m * (st.v[0] ** 2 + st.v[1] ** 2) / QE, 'eV') : '';
    } else if (tipo === 'fuerza') {
      const fb = serie(k, (q, i) => Math.hypot(...fuerzaEn(k, [q.x[i], q.y[i]], [q.vx[i], q.vy[i]], q.t[i]).FB)), fe = serie(k, (q, i) => Math.hypot(...fuerzaEn(k, [q.x[i], q.y[i]], [q.vx[i], q.vy[i]], q.t[i]).FE));
      const max = Math.max(...fb.map(p => p[1]), ...fe.map(p => p[1])) || 1, E = escalaSI(max, 'N'), sc = p => p.map(([a, b]) => [a, b / E.f]);
      grafica(cv, { x: xr, y: { min: 0, max: max / E.f * 1.1 }, series: [{ tramos: [sc(fb)], familia: 'interaccion' }, { tramos: [sc(fe)], familia: 'interaccion', patron: 'discontinuo' }], cursor, eventos: eventos(k) });
      Tt.innerHTML = `${leyenda([['interaccion', '', simHTML('F', 'B')], ['interaccion', 'discontinua', simHTML('F', 'E')]])} (${E.u})${nom}`;
      Lc.textContent = '';  // los valores, en las lecturas (en notación científica no caben aquí)
    } else vacia(n, '');
  }
  function cabecerasGraficas() { ESC.graficas.forEach((g, j) => { const tt = $(`#t${j + 1}`); if (tt && GRAFICAS[g] && !tt.innerHTML) tt.textContent = GRAFICAS[g].nombre; }); }
  document.querySelectorAll('[data-cab-grafica]').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    const j = Number(b.dataset.cabGrafica), hayHall = ESC.elementos.some(e => e.tipo === 'hall'), hayP = SIM && SIM.trayectorias.length;
    const opciones = Object.entries(GRAFICAS).filter(([k]) => (k.startsWith('hall') ? hayHall : hayP));
    menuFlotante(b, '<div class="menu-titulo">Qué muestra la gráfica</div>' + opciones.map(([k, g]) => `<div class="menu-item" role="menuitem" data-v="${k}"${k === ESC.graficas[j] ? ' aria-current="true"' : ''}><svg class="ico"><use href="#i-grafica"/></svg>${g.nombre}</div>`).join(''), v => {
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
  // Tablas y exportación
  // ---------------------------------------------------------------------
  function tablas() {
    const u = U(), fu = FU(), [ft, ut] = UT();
    if (!SIM) { ['#t-orbitas', '#t-eventos', '#t-datos'].forEach(s => { $(s).innerHTML = `<tr><td class="texto">${ERROR || 'Sin simulación'}</td></tr>`; }); return; }
    const filasO = [];
    ORB.forEach((os, k) => os.forEach(o => filasO.push(`<tr class="${t >= o.t0 && t <= o.t1 ? 'actual' : ''}"><td class="texto">${ORIGEN[k].nombre}</td><td class="texto">${nombreRegion(o.region)}</td><td>${fmt(o.t0 / ft, 4)}</td><td>${fmt(o.radio / fu, 5)}</td><td>${fmt(o.rTeo / fu, 5)}</td><td>${fmt(o.periodo / ft, 5)}</td><td>${fmt(o.TTeo / ft, 5)}</td><td>${fmt(o.giro / GR, 4)}</td></tr>`)));
    $('#t-orbitas').innerHTML = `<tr><th>Partícula</th><th>Región</th><th>t entrada (${ut})</th><th>r medido (${u})</th><th>m·v/(|q|·B) (${u})</th><th>T medido (${ut})</th><th>2π·m/(|q|·B) (${ut})</th><th>Giro (°)</th></tr>`
      + (filasO.join('') || '<tr><td class="texto" colspan="8">Sin órbitas: ninguna partícula recorre una región B sin campo E.</td></tr>');
    $('#t-eventos').innerHTML = `<tr><th>Evento</th><th>t (${ut})</th><th>x (${u})</th><th>y (${u})</th><th>|v| (m/s)</th></tr>`
      + (SIM.eventos.length ? SIM.eventos.map(e => `<tr class="${Math.abs(e.t - t) < ESC.duracion / 400 ? 'actual' : ''}"><td class="texto">${nombreEvento(e)}</td><td>${fmt(e.t / ft, 5)}</td><td>${fmt(e.p[0] / fu, 5)}</td><td>${fmt(e.p[1] / fu, 5)}</td><td>${fmt(Math.hypot(e.v[0], e.v[1]), 5)}</td></tr>`).join('')
        : '<tr><td class="texto" colspan="5">Sin eventos.</td></tr>');
    const k = trSel();
    if (k < 0) { $('#t-datos').innerHTML = '<tr><td class="texto">Sin partículas.</td></tr>'; return; }
    const tr = SIM.trayectorias[k], o = ORIGEN[k];
    let filas = `<tr><th>t (${ut})</th><th>x (${u})</th><th>y (${u})</th><th>vx (m/s)</th><th>vy (m/s)</th><th>|v| (m/s)</th><th>K (eV)</th></tr>`;
    const t0 = tr.t[0], t1 = tr.t[tr.n - 1];
    for (let j = 0; j <= 100; j++) {
      const tt = t0 + (t1 - t0) * j / 100, s = estadoParticula(tr, tt); if (!s) continue;
      const vv = Math.hypot(s.v[0], s.v[1]);
      filas += `<tr class="${Math.abs(tt - t) < (t1 - t0) / 200 ? 'actual' : ''}"><td>${fmt(tt / ft, 4)}</td><td>${fmt(s.p[0] / fu, 5)}</td><td>${fmt(s.p[1] / fu, 5)}</td><td>${fmt(s.v[0], 5)}</td><td>${fmt(s.v[1], 5)}</td><td>${fmt(vv, 5)}</td><td>${fmt(0.5 * o.m * vv * vv / QE, 5)}</td></tr>`;
    }
    $('#t-datos').innerHTML = filas;
  }
  function exportarCSV() {
    const k = trSel(); if (!SIM || k < 0) { avisar('Sin partículas que exportar', false); return; }
    const tr = SIM.trayectorias[k], o = ORIGEN[k], filas = [];
    for (let i = 0; i < tr.n; i++) { const vv = Math.hypot(tr.vx[i], tr.vy[i]); filas.push([tr.t[i], tr.x[i], tr.y[i], tr.vx[i], tr.vy[i], vv, 0.5 * o.m * vv * vv / QE]); }
    descargarTexto(`${nombreArchivo(ESC.titulo)}-${nombreArchivo(o.nombre)}.csv`, aCSV(['t (s)', 'x (m)', 'y (m)', 'vx (m/s)', 'vy (m/s)', '|v| (m/s)', 'K (eV)'], filas))
      .then(r => { if (r) avisarLienzo(area, `Trayectoria exportada: ${filas.length} filas`); }, e => avisar(`No se pudo exportar: ${e}`, false));
  }
  function exportarEventos() {
    if (!SIM) return;
    const filas = SIM.eventos.map(e => [nombreEvento(e), e.t, e.p[0], e.p[1], e.v[0], e.v[1]]);
    descargarTexto(`${nombreArchivo(ESC.titulo)}-eventos.csv`, aCSV(['evento', 't (s)', 'x (m)', 'y (m)', 'vx (m/s)', 'vy (m/s)'], filas))
      .then(r => { if (r) avisarLienzo(area, `Eventos exportados: ${filas.length}`); });
  }
  function exportarOrbitas() {
    const filas = []; ORB.forEach((os, k) => os.forEach(o => filas.push([ORIGEN[k].nombre, nombreRegion(o.region), o.t0, o.radio, o.rTeo, o.periodo, o.TTeo, o.giro / GR])));
    descargarTexto(`${nombreArchivo(ESC.titulo)}-orbitas.csv`, aCSV(['partícula', 'región', 't entrada (s)', 'r medido (m)', 'r teórico (m)', 'T medido (s)', 'T teórico (s)', 'giro (°)'], filas))
      .then(r => { if (r) avisarLienzo(area, `Órbitas exportadas: ${filas.length}`); });
  }
  function exportarPNG() { descargarLienzo(lienzo, `${nombreArchivo(ESC.titulo)}.png`).then(r => { if (r) avisarLienzo(area, 'Imagen del lienzo exportada'); }); }
  $('#b-exportar').addEventListener('click', exportarCSV);

  // ---------------------------------------------------------------------
  // Ciclo
  // ---------------------------------------------------------------------
  const lt = new LineaTiempoU($('#tl'), { duracion: 1, eventos: [], alCambiar: nt => { t = nt; jugando = false; todo(); } });
  function todo() {
    dibujar(); lecturas(); lt.poner(t); graficas();
    if (!$('#p-orbitas').hidden || !$('#p-eventos').hidden || !$('#p-tabla').hidden) tablas();
    document.querySelectorAll('#arbol .nodo[data-sel]').forEach(nd => { const e = elDe(nd.dataset.sel); if (e && e.tipo === 'pantalla') nd.querySelector('.dato').textContent = datoArbol(e); });
  }
  function recalcular() {
    simular();
    lt.duracion = ESC.duracion; lt.simulado = ESC.duracion;
    lt.eventos = SIM ? SIM.eventos.filter(e => e.t > 0).map(e => ({ t: e.t, nombre: nombreEvento(e) })) : [];
    t = Math.min(t, ESC.duracion);
    if (ERROR) avisar(ERROR, false);
    else if (SIM && SIM.incompleta) avisar(SIM.incompleta.motivo, false);
    if (!vistaTocada) encuadrar();
    todo();
    if (autoguardar) autoguardado.guardar('magnetismo-particulas', escenaActual());
  }
  function cambio() { aplicarVariables(); recalcular(); registrar(); inspector(); }
  function titulo() {
    $('#escena-nombre').textContent = ESC.titulo;
    const chip = $('#escena-chip');
    chip.textContent = ESC.tipo === 'MEXT' ? `MEXT ${ESC.anio || ''}`.trim() : ESC.tipo || 'Propio';
    chip.className = 'chip' + (ESC.tipo === 'MEXT' ? ' lleno' : '');
    document.title = `Volta · Partículas en E y B · ${ESC.titulo}`;
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
    const rb = ESC.elementos.find(e => e.tipo === 'region-b' && e.B);
    const tablas = {
      particula: () => ({ tipo: 'particula', nombre: nombreNuevo('Protón'), q: QE, m: MASA_PROTON, p, v: rb ? r(1.2 * S * QE * Math.abs(rb.B) / MASA_PROTON) : 1e5, angulo: 0 }),
      fuente: () => ({ tipo: 'fuente', nombre: nombreNuevo('Fuente'), p, angulo: 0, especies: [especie('proton')], modo: 'V', V: 1000, v: 1e5, cantidad: 1, abanico: 0, intervalo: 0 }),
      'region-b': () => ({ tipo: 'region-b', nombre: nombreNuevo('Región B'), forma: 'rect', centro: p, ancho: r(3 * S), alto: r(2 * S), B: 0.01 }),
      'region-e': () => ({ tipo: 'region-e', nombre: nombreNuevo('Región E'), forma: 'rect', centro: p, ancho: r(3 * S), alto: r(1 * S), E: 1e4, angulo: Math.PI / 2, alterna: null, frecuencia: 0, fase: 0 }),
      placas: () => ({ tipo: 'placas', nombre: nombreNuevo('Placas'), centro: p, angulo: 0, largo: r(1.2 * S), separacion: r(0.4 * S), dV: 1000, agujero: r(0.12 * S) }),
      placa: () => ({ tipo: 'placa', nombre: nombreNuevo('Placa'), a: [p[0] - s / 2, p[1]], b: [p[0] + s / 2, p[1]], signo: 0 }),
      pantalla: () => ({ tipo: 'pantalla', nombre: nombreNuevo('Pantalla'), a: [p[0], p[1] - s], b: [p[0], p[1] + s] }),
      hall: () => ({ tipo: 'hall', nombre: nombreNuevo('Lámina'), centro: p, angulo: 0, largo: r(2 * S), ancho: r(0.7 * S), espesor: r(0.1 * S), I: 1e-3, B: 0.5, n: 1e21, signo: -1 }),
    };
    const el = { id: nuevoId(), ...tablas[h]() };
    ESC.elementos.push(el); sel = el.id;
    cambio(); avisar(`${el.nombre} colocado`);
  }
  function quitarSeleccion() {
    if (sel === 'regla') { ESC.regla = null; sel = 'escena'; cambio(); avisar('Se quita la regla'); return; }
    const i = idxDe(sel); if (i < 0) return;
    const nombre = ESC.elementos[i].nombre;
    ESC.elementos.splice(i, 1); limpiarVariables(i); sel = 'escena';
    cambio(); avisar(`Se quita ${nombre}`);
  }
  const posDe = el => (el.tipo === 'placa' || el.tipo === 'pantalla' ? [(el.a[0] + el.b[0]) / 2, (el.a[1] + el.b[1]) / 2] : el.forma === 'poligono' ? el.puntos[0] : el.p || el.centro);
  function moverA(el, p) {
    const c = posDe(el), d = [p[0] - c[0], p[1] - c[1]];
    if (el.tipo === 'placa' || el.tipo === 'pantalla') { el.a = [el.a[0] + d[0], el.a[1] + d[1]]; el.b = [el.b[0] + d[0], el.b[1] + d[1]]; }
    else if (el.forma === 'poligono') el.puntos = el.puntos.map(q => [q[0] + d[0], q[1] + d[1]]);
    else if (el.p) el.p = p; else el.centro = p;
  }
  function duplicar() {
    const el = elDe(sel); if (!el) return;
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
  function escenaActual() { return crearEscena({ modulo: 'magnetismo', espacio: 'particulas', titulo: ESC.titulo, datos: instantanea() }); }
  const RUTA_OK = /^(duracion|elementos\.\d{1,2}\.((centro|p|a|b)\.[01]|B|E|angulo|v|V|q|m|dV|separacion|largo|ancho|alto|espesor|agujero|I|n|frecuencia|cantidad|abanico|intervalo|especies\.\d\.(q|m)))$/;
  const TIPOS_OK = Object.keys(TIPOS);
  // Valida y acota lo que viene de un archivo antes de usarlo (entrada no confiable)
  function datosSeguros(d = {}) {
    const base = completa(ESCENAS.find(e => e.clave === d.clave) || ESCENAS[0]);
    const pos = (v, def, min = 1e-9, max = 1e3) => numero(v, def, min, max);
    const coord = (p, def = [0, 0]) => (Array.isArray(p) && p.length === 2 ? [numero(p[0], def[0], -1e3, 1e3), numero(p[1], def[1], -1e3, 1e3)] : def.slice());
    const ang = v => numero(v, 0, -100, 100);
    const carga = v => { const q = numero(v, QE, -1e3 * QE, 1e3 * QE); return q === 0 ? QE : q; };
    const masa = v => numero(v, MASA_PROTON, 1e-33, 1e-20);
    const elementos = [], ids = new Set();
    for (const o of (Array.isArray(d.elementos) ? d.elementos : []).slice(0, 60)) {
      if (!o || typeof o !== 'object' || !TIPOS_OK.includes(o.tipo)) continue;
      let id = texto(o.id, '', 8); if (!/^e\d{1,4}$/.test(id) || ids.has(id)) { do { id = 'e' + (++contador); } while (ids.has(id)); }
      ids.add(id);
      const e = { id, tipo: o.tipo, nombre: texto(o.nombre, TIPOS[o.tipo].nombre, 40) };
      switch (o.tipo) {
        case 'particula': Object.assign(e, { p: coord(o.p), q: carga(o.q), m: masa(o.m), v: numero(o.v, 1e5, 0, 3e7), angulo: ang(o.angulo) }); break;
        case 'fuente': {
          const esp = (Array.isArray(o.especies) ? o.especies : []).slice(0, 4).filter(s => s && typeof s === 'object').map(s => ({ nombre: texto(s.nombre, 'Ion', 14), q: carga(s.q), m: masa(s.m) }));
          Object.assign(e, { p: coord(o.p), angulo: ang(o.angulo), especies: esp.length ? esp : [especie('proton')], modo: o.modo === 'v' ? 'v' : 'V', V: numero(o.V, 1000, -1e7, 1e7), v: numero(o.v, 1e5, 0, 3e7), cantidad: Math.round(numero(o.cantidad, 1, 1, 40)), abanico: numero(o.abanico, 0, 0, Math.PI), intervalo: numero(o.intervalo, 0, 0, 1e3) });
          break;
        }
        case 'region-b': case 'region-e': {
          const pol = Array.isArray(o.puntos) && o.puntos.length >= 3 && o.puntos.length <= 200 ? o.puntos.map(p => coord(p)) : null;
          if (o.forma === 'poligono' && pol) Object.assign(e, { forma: 'poligono', puntos: pol });
          else Object.assign(e, { forma: 'rect', centro: coord(o.centro), ancho: pos(o.ancho, 0.1), alto: pos(o.alto, 0.1) });
          if (o.tipo === 'region-b') e.B = numero(o.B, 0.01, -100, 100);
          else Object.assign(e, { E: numero(o.E, 1e4, 0, 1e10), angulo: ang(o.angulo), alterna: ['cuadrada', 'senoidal'].includes(o.alterna) ? o.alterna : null, frecuencia: numero(o.frecuencia, 0, 0, 1e12), fase: numero(o.fase, 0, -100, 100) });
          break;
        }
        case 'placas': Object.assign(e, { centro: coord(o.centro), angulo: ang(o.angulo), largo: pos(o.largo, 0.05), separacion: pos(o.separacion, 0.01), dV: numero(o.dV, 1000, -1e7, 1e7), agujero: pos(o.agujero, 0.003) }); e.agujero = Math.min(e.agujero, e.largo); break;
        case 'placa': case 'pantalla':
          Object.assign(e, { a: coord(o.a, [0, -0.05]), b: coord(o.b, [0, 0.05]) });
          if (Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) < 1e-9) e.b = [e.a[0], e.a[1] + 0.05];
          if (o.tipo === 'placa') e.signo = o.signo === 1 || o.signo === -1 ? o.signo : 0;
          break;
        case 'hall': Object.assign(e, { centro: coord(o.centro), angulo: ang(o.angulo), largo: pos(o.largo, 0.03), ancho: pos(o.ancho, 0.01), espesor: pos(o.espesor, 1e-3), I: numero(o.I, 1e-3, -1e4, 1e4), B: numero(o.B, 0.5, -100, 100), n: numero(o.n, 1e21, 1e10, 1e31), signo: o.signo === 1 ? 1 : -1 }); break;
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
      variables[k] = { sim: texto(v.sim, k, 3), sub: v.sub ? texto(v.sub, '', 4) : undefined, val: numero(v.val, min, min, max), min, max, paso: pos(v.paso, 0.1, 1e-9, 1e9), u: Object.keys(FAC).includes(v.u) ? v.u : '', factor: numero(v.factor, 1, -1e15, 1e15) || 1, liga, factores };
    }
    const capas = {};
    for (const k of Object.keys(base.capas)) capas[k] = typeof d.capas?.[k] === 'boolean' ? d.capas[k] : !!base.capas[k];
    const regla = Array.isArray(d.regla) && d.regla.length === 2 ? [coord(d.regla[0]), coord(d.regla[1])] : null;
    return {
      clave: ESCENAS.some(e => e.clave === d.clave) ? d.clave : 'propio', titulo: texto(d.titulo, base.titulo, 80),
      tipo: ['Tutorial', 'Ejemplo', 'MEXT', 'Propio'].includes(d.tipo) ? d.tipo : 'Propio', anio: d.anio ? texto(d.anio, '', 14) : undefined,
      unidad: ['mm', 'cm', 'm'].includes(d.unidad) ? d.unidad : 'cm', duracion: numero(d.duracion, base.duracion, 1e-15, 1e3), elementos, variables, regla, capas,
      graficas: Array.isArray(d.graficas) && d.graficas.length === 3 && d.graficas.every(g => GRAFICAS[g]) ? d.graficas.slice() : base.graficas.slice(),
      caja: Array.isArray(d.caja) && d.caja.length === 4 && d.caja.every(Number.isFinite) && d.caja[1] > d.caja[0] && d.caja[3] > d.caja[2] ? d.caja.map(x => numero(x, 0, -1e3, 1e3)) : null,
      sel: typeof d.sel === 'string' && (d.sel === 'escena' || elementos.some(e => e.id === d.sel)) ? d.sel : 'escena',
      nota: typeof d.nota === 'string' ? texto(d.nota, '', 300) : '',
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

  function abrirEscena1(clave) {
    ESC = completa(escenaDe(clave)); aplicarVariables();
    sel = ESC.sel || 'escena'; vistaTocada = false; herramienta = null; marcarHerramienta(); t = 0; jugando = false;
    titulo(); construirVariables(); recalcular(); inspector();
    escala0 = tz.vista.escala; zoomTexto();
    if (historial) { historial.reiniciar(sinSel(instantanea())); botonesHistorial(); }
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
      if (aOtroEspacio(e, 'particulas')) return;
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
    if (h === 'orbita') { ponerCapa('orbita', true); todo(); avisar('Órbita medida: selecciona una partícula; el radio y el periodo salen en las lecturas y en la pestaña Órbitas', false); return; }
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
      const d = Math.min(0.05, (ahora - ultimo) / 1000) * velocidad * ESC.duracion / SEG_PANTALLA;
      t = Math.min(ESC.duracion, t + d);
      if (t >= ESC.duracion) jugando = false;
      todo();
    }
    ultimo = ahora;
    requestAnimationFrame(cuadro);
  }
  function alternar() { if (t >= ESC.duracion) t = 0; jugando = !jugando; todo(); }
  const irA = nt => { jugando = false; t = Math.max(0, Math.min(ESC.duracion, nt)); todo(); };
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
  function rutasPos(el, i) {
    if (el.tipo === 'placa' || el.tipo === 'pantalla') return [`elementos.${i}.a.0`, `elementos.${i}.a.1`, `elementos.${i}.b.0`, `elementos.${i}.b.1`];
    const k = el.p ? 'p' : 'centro'; return [`elementos.${i}.${k}.0`, `elementos.${i}.${k}.1`];
  }
  lienzo.addEventListener('pointerdown', ev => {
    const r = lienzo.getBoundingClientRect(), X0 = ev.clientX - r.left, Y0 = ev.clientY - r.top, v = tz.vista, w = [v.mx(X0), v.my(Y0)];
    if (ev.button === 1 || ev.button === 2 || espacioPulsado) { paneo = [X0, Y0, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId); return; }
    if (herramienta === 'regla') { const p = [ajuste(w[0]), ajuste(w[1])]; ESC.regla = [p, p.slice()]; arrastre = { tipo: 'regla-nueva' }; lienzo.setPointerCapture(ev.pointerId); return; }
    if (herramienta) { const h = herramienta; if (!ev.shiftKey) { herramienta = null; marcarHerramienta(); } crear(h, [ajuste(w[0]), ajuste(w[1])]); return; }
    const ob = objetoEn(X0, Y0);
    if (ob && ob.id === 'regla') { if (sel !== 'regla') seleccionar('regla'); arrastre = { tipo: ob.asa != null ? 'regla:' + ob.asa : 'regla', w0: w, r0: copia(ESC.regla), movido: false }; lienzo.setPointerCapture(ev.pointerId); return; }
    if (ob && ob.id.startsWith('tr:')) { seleccionar(ob.id); return; }
    if (ob) {
      if (sel !== ob.id) seleccionar(ob.id);
      const el = elDe(ob.id);
      arrastre = { tipo: ob.asa || 'mover', id: ob.id, w0: w, p0: posDe(el).slice(), movido: false };
      lienzo.setPointerCapture(ev.pointerId); return;
    }
    seleccionar('escena');
    paneo = [X0, Y0, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId);
  });
  lienzo.addEventListener('pointermove', ev => {
    const r = lienzo.getBoundingClientRect(), X0 = ev.clientX - r.left, Y0 = ev.clientY - r.top, v = tz.vista, w = [v.mx(X0), v.my(Y0)];
    $('#cx').textContent = L(w[0], 4); $('#cy').textContent = L(w[1], 4);
    if (paneo) { vistaTocada = true; v.ox = paneo[2] + X0 - paneo[0]; v.oy = paneo[3] + Y0 - paneo[1]; dibujar(); return; }
    if (arrastre) {
      const fino = ev.shiftKey, a = arrastre;
      if (a.tipo === 'regla-nueva') ESC.regla[1] = [ajuste(w[0], fino), ajuste(w[1], fino)];
      else if (a.tipo === 'regla:0' || a.tipo === 'regla:1') ESC.regla[+a.tipo.slice(6)] = [ajuste(w[0], fino), ajuste(w[1], fino)];
      else if (a.tipo === 'regla') { const dx = w[0] - a.w0[0], dy = w[1] - a.w0[1]; ESC.regla = a.r0.map(p => [ajuste(p[0] + dx, fino), ajuste(p[1] + dy, fino)]); }
      else {
        const el = elDe(a.id), i = idxDe(a.id);
        if (a.tipo === 'mover') { moverA(el, [ajuste(a.p0[0] + w[0] - a.w0[0], fino), ajuste(a.p0[1] + w[1] - a.w0[1], fino)]); sincronizarVariables(rutasPos(el, i)); }
        else if (a.tipo === 'a' || a.tipo === 'b') { el[a.tipo] = [ajuste(w[0], fino), ajuste(w[1], fino)]; sincronizarVariables(rutasPos(el, i)); }
        else if (a.tipo === 'esq') { el.ancho = Math.max(1e-4, 2 * Math.abs(ajuste(w[0], fino) - el.centro[0])); el.alto = Math.max(1e-4, 2 * Math.abs(ajuste(w[1], fino) - el.centro[1])); sincronizarVariables([`elementos.${i}.ancho`, `elementos.${i}.alto`]); }
        else if (a.tipo === 'giro' || a.tipo === 'vel') {
          const c = v.P(el.p || el.centro); let g = Math.atan2(c[1] - Y0, X0 - c[0]);
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
    lienzo.style.cursor = ob ? (ob.asa === 'giro' || ob.asa === 'vel' ? 'grab' : ob.asa != null ? 'move' : 'pointer') : 'default';
    if (h !== hover) { hover = h; dibujar(); }
  });
  lienzo.addEventListener('pointerup', () => {
    if (arrastre) {
      const a = arrastre; arrastre = null;
      if (a.tipo === 'regla-nueva') {
        const [p, q] = ESC.regla;
        if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9) ESC.regla = null;
        herramienta = null; marcarHerramienta(); sel = ESC.regla ? 'regla' : 'escena'; cambio();
      } else if (a.movido) cambio();
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
    ['i-capas', 'Mostrar u ocultar la trayectoria prevista', '', () => alternarCapa('prevista')],
    ['i-capas', 'Mostrar u ocultar las velocidades', '', () => alternarCapa('velocidad')],
    ['i-capas', 'Mostrar u ocultar las fuerzas de Lorentz', '', () => alternarCapa('fuerza')],
    ['n-periodo', 'Mostrar u ocultar la órbita medida', 'O', () => alternarCapa('orbita')],
    ['n-regla', 'Medir con la regla', 'R', () => ponerHerramienta('regla')],
    ['i-duplicar', 'Duplicar el objeto seleccionado', 'Ctrl D', duplicar],
    ['i-borrar', 'Quitar el objeto seleccionado', 'Supr', quitarSeleccion],
    ['i-historial', 'Restablecer la escena original', '', () => { if (ESCENAS.some(e => e.clave === ESC.clave)) { abrirEscena1(ESC.clave); avisar('Escena original restablecida', false); } }],
    ['i-deshacer', 'Deshacer', 'Ctrl Z', deshacer],
    ['i-rehacer', 'Rehacer', 'Ctrl Y', rehacer],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar],
    ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
    ['i-exportar', 'Exportar la trayectoria seleccionada a CSV', '', exportarCSV],
    ['i-tabla', 'Exportar los eventos a CSV', '', exportarEventos],
    ['i-tabla', 'Exportar las órbitas medidas a CSV', '', exportarOrbitas],
    ['i-imagen', 'Exportar imagen del lienzo', '', exportarPNG],
    ['o-hilo-corriente', 'Ir a Campos magnéticos', '', () => { location.href = 'magnetismo.html'; }, 'Espacios'],
    ['o-rieles', 'Ir a Inducción', '', () => { location.href = 'magnetismo-induccion.html'; }, 'Espacios'],
    ...Object.entries({ particula: 'una partícula cargada', fuente: 'una fuente de iones', 'region-b': 'una región de campo B', 'region-e': 'una región de campo E', placas: 'placas aceleradoras', placa: 'una placa', pantalla: 'una pantalla detectora', hall: 'una lámina Hall' })
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
    else if (tecla === 'o') alternarCapa('orbita');
    else if (tecla === 'r') ponerHerramienta('regla');
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });

  // ---------------------------------------------------------------------
  // Arranque. Parámetros para capturas: ?escena=ciclotron&t=0.6&sel=tr:0&pest=orbitas
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); if (!vistaTocada) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search), limpio = ![...q.keys()].length;
    const pend = escenaPendiente('magnetismo');
    if (pend && aOtroEspacio(pend, 'particulas')) return;
    const previa = (pend && pend.espacio === 'particulas' ? pend : null) || (limpio ? autoguardado.leer('magnetismo-particulas', { modulo: 'magnetismo' }) : null);
    tz.ajustar();
    if (q.has('escena') || !previa) { ESC = completa(escenaDe(q.get('escena') || 'orbita')); sel = ESC.sel || 'escena'; }
    else { ESC = datosSeguros(previa.datos); sel = ESC.sel || 'escena'; }
    aplicarVariables();
    if (q.has('capas')) for (const k of q.get('capas').split(',')) if (k in ESC.capas) ESC.capas[k] = true;
    autoguardar = limpio || !!previa;
    titulo(); construirVariables();
    recalcular();
    if (q.has('sel')) { const s = q.get('sel'); if (s === 'escena' || elDe(s) || (/^tr:\d+$/.test(s) && SIM && SIM.trayectorias[+s.slice(3)])) sel = s; }
    if (q.has('t')) t = Math.max(0, Math.min(1, parseFloat(q.get('t')) || 0)) * ESC.duracion;
    inspector(); escala0 = tz.vista.escala; zoomTexto();
    cabecerasGraficas();
    const pe = q.get('pest'); if (pe) { const b = document.querySelector(`#pest [aria-controls="p-${pe}"]`); if (b) b.click(); }
    todo();
    historial = new Historial(sinSel(instantanea())); botonesHistorial();
    requestAnimationFrame(a => { ultimo = a; requestAnimationFrame(cuadro); });
  });
})();
