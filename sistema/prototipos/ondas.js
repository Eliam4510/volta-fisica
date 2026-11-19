/* ==========================================================================
   Volta · Ondas y sonido — espacio de trabajo "Medio 1D"
   Cuerdas, columnas de aire y canales de agua: ondas viajeras, reflexión y
   transmisión, ondas estacionarias y resonancia. La física está en el motor
   puro sistema/motores/ondas.js (probado en pruebas/ondas.test.js):
   diferencias finitas de 2.º orden con condición CFL, extremos fijo, libre
   y absorbente (abierto y cerrado en los tubos), fuentes en los extremos,
   amortiguamiento, registro de energía que cierra y eventos de llegada de
   los frentes; la superposición analítica (método de las imágenes, modos
   estacionarios, respuesta armónica) sirve para comparar.
   Misma estructura que circuitos.js: escena → motor → estado(t) → lienzo →
   paneles. El desplazamiento se dibuja ampliado (escala vertical propia);
   en un tubo se ven las partículas del aire y, debajo, la banda de presión.
   Parámetros de URL para capturas: ?escena=…&t=…&pest=energia|eventos|tabla
   &sel=medio|izq|der|inicial|sonda:0|regla|tramo:1&capas=nodos,envolvente
   ========================================================================== */
import {
  simularMedio, estadoMedio, energiaMedio, serieEn, esfuerzoMedio, aceleracionMedio, cuadroMedio, indiceCuadro, frentesEn,
  modoEstacionario, frecuenciasModos, respuestaArmonica, tramoTubo, RHO_AIRE, coeficientesUnion, conImagen, imagenesMedio,
  viajera, formaInicial,
} from '../motores/ondas.js';
import { aCSV } from '../nucleo/csv.js';
import { descargarTexto, descargarLienzo, nombreArchivo, avisar as avisarLienzo } from '../componentes/exportar.js';
import { crearEscena, numero, texto } from '../nucleo/escena.js';
import { Historial } from '../nucleo/historial.js';
import { evaluar } from '../nucleo/unidades.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';

(function () {
  'use strict';
  const { Trazo, Vista, fmt, cantidad, grafica, LineaTiempo, pasoAgradable } = Volta;
  const $ = s => document.querySelector(s);
  const G0 = 9.80665, DOS_PI = 2 * Math.PI, GRADO = Math.PI / 180;

  // ---------------------------------------------------------------------
  // Unidades de pantalla
  // ---------------------------------------------------------------------
  const FAC = { m: 1, cm: 1e-2, mm: 1e-3, 'µm': 1e-6, nm: 1e-9, N: 1, mN: 1e-3, kN: 1e3, 'kg/m': 1, 'g/m': 1e-3, 'm/s': 1, Hz: 1, kHz: 1e3, s: 1, ms: 1e-3, 'µs': 1e-6, Pa: 1, mPa: 1e-3, kPa: 1e3, '1/s': 1, '°': GRADO, 'kg/m³': 1, 'cm²': 1e-4, 'm²': 1, J: 1, mJ: 1e-3, 'µJ': 1e-6, nJ: 1e-9, kJ: 1e3, 'kg/s': 1 };
  const PREF = { m: ['m', 'cm', 'mm', 'µm', 'nm'], J: ['kJ', 'J', 'mJ', 'µJ', 'nJ'], Pa: ['kPa', 'Pa', 'mPa'], s: ['s', 'ms', 'µs'], N: ['kN', 'N', 'mN'], Hz: ['kHz', 'Hz'] };
  // Valor SI → [número, unidad con el prefijo que le corresponde]
  function enUnidad(v, u) {
    const lista = PREF[u]; if (!lista) return [v, u];
    const a = Math.abs(v);
    let p = lista.includes(u) ? u : lista[0];
    if (a > 0) { p = lista[lista.length - 1]; for (const q of lista) if (a >= FAC[q] * 0.99995) { p = q; break; } }
    return [v / FAC[p], p];
  }
  const valorCon = (v, u, cifras = 4) => { const [x, uu] = enUnidad(v, u); return cantidad(x, uu, cifras); };
  const numCampo = x => String(Number(Number(x).toPrecision(6))).replace('-', '−');
  const simHTML = (a, sub, recto = true) => `<span class="sim">${a}${sub ? `<sub${recto ? ' class="r"' : ''}>${sub}</sub>` : ''}</span>`;
  const subs = n => String(n).replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[+d]);

  // ---------------------------------------------------------------------
  // Medios y extremos
  // ---------------------------------------------------------------------
  const MEDIOS = {
    cuerda: { nombre: 'Cuerda', en: 'String', ico: 'o-cuerda-vibrante', bordes: [['fijo', 'Fijo'], ['libre', 'Libre'], ['absorbente', 'Absorbente']] },
    tubo: { nombre: 'Columna de aire', en: 'Air column', ico: 'o-tubo', bordes: [['cerrado', 'Cerrado'], ['abierto', 'Abierto'], ['absorbente', 'Absorbente']] },
    canal: { nombre: 'Canal de agua', en: 'Water channel', ico: 'o-fluido', bordes: [['libre', 'Pared'], ['absorbente', 'Absorbente']] },
  };
  const NOMBRE_BORDE = { fijo: 'Fijo', libre: 'Libre', absorbente: 'Absorbente', cerrado: 'Cerrado', abierto: 'Abierto' };
  const ICONO_BORDE = { fijo: 'o-fijacion', libre: 'o-riel', absorbente: 'o-amortiguador', cerrado: 'o-piston', abierto: 'o-tubo' };
  const motorBorde = t => (t === 'abierto' ? 'libre' : t === 'cerrado' ? 'fijo' : t);

  // ---------------------------------------------------------------------
  // Escenas. Tramos: cuerda {L, T, mu}; tubo {L, v}; canal {L, h}.
  // Fuentes: {forma, A, f, fase, ancho, inicio}; amplitud en m (oscilador o
  // pistón que vibra), N (fuerza en un extremo libre) o Pa (altavoz).
  // Variables: valor en su unidad de pantalla, factor a SI y rutas que fijan.
  // ---------------------------------------------------------------------
  const BASE = () => ({
    medio: 'cuerda', origen: 0, rho: RHO_AIRE, S: 1e-3, correccion: 0, piston: false,
    izq: { tipo: 'fijo', fuente: null }, der: { tipo: 'fijo', fuente: null }, inicial: null,
    beta: 0, duracion: 2, sondas: [], regla: null, puntos: [], respuesta: null,
    graficas: ['yx', 'yt', 'xt'], capas: { componentes: false, envolvente: false, nodos: false, rapidez: true, valores: true },
    analitica: false, variables: {}, velocidad: 1, sel: 'medio',
  });
  const v1 = (f = 1) => ({ sim: '', val: 0, min: 0, max: 1, paso: 0.1, u: '', factor: f, liga: [] });
  const vari = (sim, val, min, max, paso, u, factor, liga, sub) => ({ ...v1(), sim, sub, val, min, max, paso, u, factor, liga });
  const ESCENAS = [
    {
      clave: 'pulso-fijo', titulo: 'Pulso y reflexión en un extremo fijo', tipo: 'Tutorial',
      tramos: [{ L: 6, T: 12.5, mu: 0.5 }], izq: { tipo: 'absorbente', fuente: null }, der: { tipo: 'fijo', fuente: null },
      inicial: { forma: 'gauss', A: 0.1, centro: 1.5, ancho: 0.2, sentido: 1 }, duracion: 2.2, sondas: [4.5],
      capas: { componentes: true, rapidez: true, valores: true }, velocidad: 0.5,
      variables: { T: vari('T', 12.5, 2, 50, 0.5, 'N', 1, ['tramos.0.T']), A: vari('A', 10, -20, 20, 1, 'cm', 0.01, ['inicial.A']) },
    },
    {
      clave: 'pulso-libre', titulo: 'Pulso y reflexión en un extremo libre', tipo: 'Tutorial',
      tramos: [{ L: 6, T: 12.5, mu: 0.5 }], izq: { tipo: 'absorbente', fuente: null }, der: { tipo: 'libre', fuente: null },
      inicial: { forma: 'gauss', A: 0.1, centro: 1.5, ancho: 0.2, sentido: 1 }, duracion: 2.2, sondas: [4.5],
      capas: { componentes: true, rapidez: true, valores: true }, velocidad: 0.5,
      variables: { T: vari('T', 12.5, 2, 50, 0.5, 'N', 1, ['tramos.0.T']), A: vari('A', 10, -20, 20, 1, 'cm', 0.01, ['inicial.A']) },
    },
    {
      clave: 'senoidal', titulo: 'Onda senoidal: instantánea y registro', tipo: 'Tutorial',
      tramos: [{ L: 8, T: 1.6, mu: 0.1 }], izq: { tipo: 'absorbente', fuente: { forma: 'senoidal', A: 0.05, f: 2, fase: 0, inicio: 0 } }, der: { tipo: 'absorbente', fuente: null },
      duracion: 5, sondas: [3], regla: [4, 6], velocidad: 1,
      variables: { f: vari('f', 2, 0.5, 4, 0.1, 'Hz', 1, ['izq.fuente.f']), A: vari('A', 5, 1, 10, 0.5, 'cm', 0.01, ['izq.fuente.A']), T: vari('T', 1.6, 0.4, 6.4, 0.1, 'N', 1, ['tramos.0.T']) },
    },
    {
      clave: 'estacionaria', titulo: 'Onda estacionaria en una cuerda', tipo: 'Tutorial',
      tramos: [{ L: 1.2, T: 57.6, mu: 0.1 }], izq: { tipo: 'fijo', fuente: { forma: 'senoidal', A: 0.001, f: 30, fase: 0, inicio: 0 } }, der: { tipo: 'fijo', fuente: null },
      beta: 1, duracion: 4, sondas: [0.2], velocidad: 0.05, graficas: ['yx', 'yt', 'respuesta'], respuesta: { eje: 'f', min: 2, max: 60 },
      capas: { envolvente: true, nodos: true, rapidez: false, valores: true },
      variables: { f: vari('f', 30, 2, 60, 0.5, 'Hz', 1, ['izq.fuente.f']), T: vari('T', 57.6, 10, 120, 0.1, 'N', 1, ['tramos.0.T']) },
    },
    {
      clave: 'union', titulo: 'Cuerda unida a otra más densa', tipo: 'Ejemplo',
      tramos: [{ L: 5, T: 10, mu: 0.1 }, { L: 5, T: 10, mu: 0.4 }], izq: { tipo: 'absorbente', fuente: null }, der: { tipo: 'absorbente', fuente: null },
      inicial: { forma: 'gauss', A: 0.1, centro: 2, ancho: 0.2, sentido: 1 }, duracion: 1.2, sondas: [3, 7], velocidad: 0.25,
      capas: { componentes: false, rapidez: true, valores: true },
      variables: { mu: vari('μ', 400, 25, 1600, 5, 'g/m', 1e-3, ['tramos.1.mu'], '2') },
    },
    {
      clave: 'tubo-abierto', titulo: 'Tubo abierto por los dos extremos', tipo: 'Ejemplo', medio: 'tubo',
      tramos: [{ L: 0.68, v: 340 }], izq: { tipo: 'abierto', fuente: { forma: 'senoidal', A: 1, f: 250, fase: 0, inicio: 0 } }, der: { tipo: 'abierto', fuente: null },
      beta: 15, duracion: 0.2, sondas: [0.34], velocidad: 0.002, graficas: ['yx', 'px', 'respuesta'], respuesta: { eje: 'f', min: 50, max: 1100 },
      capas: { envolvente: true, nodos: true, rapidez: false, valores: true },
      variables: { f: vari('f', 250, 50, 1100, 5, 'Hz', 1, ['izq.fuente.f']) },
    },
    {
      clave: 'tubo-cerrado', titulo: 'Tubo cerrado por un extremo', tipo: 'Ejemplo', medio: 'tubo',
      tramos: [{ L: 0.34, v: 340 }], izq: { tipo: 'abierto', fuente: { forma: 'senoidal', A: 1, f: 250, fase: 0, inicio: 0 } }, der: { tipo: 'cerrado', fuente: null },
      beta: 15, duracion: 0.2, sondas: [0.17], velocidad: 0.002, graficas: ['yx', 'px', 'respuesta'], respuesta: { eje: 'f', min: 50, max: 1500 },
      capas: { envolvente: true, nodos: true, rapidez: false, valores: true },
      variables: { f: vari('f', 250, 50, 1500, 5, 'Hz', 1, ['izq.fuente.f']) },
    },
    {
      clave: 'piston', titulo: 'Resonancia con un pistón móvil', tipo: 'Ejemplo', medio: 'tubo', piston: true,
      tramos: [{ L: 0.17, v: 340 }], izq: { tipo: 'abierto', fuente: { forma: 'senoidal', A: 1, f: 500, fase: 0, inicio: 0 } }, der: { tipo: 'cerrado', fuente: null },
      beta: 20, duracion: 0.12, sondas: [0.1], velocidad: 0.002, graficas: ['yx', 'px', 'respuesta'], respuesta: { eje: 'L', min: 0.04, max: 0.8 },
      capas: { envolvente: true, nodos: true, rapidez: false, valores: true },
      variables: { L: vari('L', 17, 4, 80, 0.5, 'cm', 0.01, ['tramos.0.L']), f: vari('f', 500, 200, 1000, 5, 'Hz', 1, ['izq.fuente.f']) },
    },
    {
      clave: 'mext-2020-1-4', titulo: 'Tren de ondas contra un extremo fijo', tipo: 'MEXT', anio: '2020 1-(4)',
      origen: -0.3, tramos: [{ L: 1.2, T: 0.09, mu: 1 }], izq: { tipo: 'absorbente', fuente: null }, der: { tipo: 'fijo', fuente: null },
      inicial: { forma: 'tren', A: -0.3, desde: 0, lambda: 0.6, ciclos: 1, sentido: 1 }, duracion: 3, sondas: [0.75], velocidad: 0.5,
      capas: { componentes: true, rapidez: true, valores: true },
    },
    {
      clave: 'mext-2019-1-4', titulo: 'Onda senoidal que viaja hacia +x', tipo: 'MEXT', anio: '2019 1-(4)',
      origen: -1, tramos: [{ L: 8.5, T: 4, mu: 1 }], izq: { tipo: 'absorbente', fuente: { forma: 'senoidal', A: 3, f: 0.5, fase: -Math.PI / 2, inicio: null } }, der: { tipo: 'absorbente', fuente: null },
      inicial: { forma: 'senoidal', A: 3, lambda: 4, desde: 0, fase: 0, sentido: 1 }, duracion: 4, sondas: [0], regla: [1, 5], velocidad: 0.5, analitica: true,
    },
    {
      clave: 'mext-2018-5', titulo: 'Onda de presión en el aire', tipo: 'MEXT', anio: '2018 P5', medio: 'tubo',
      origen: -0.5, tramos: [{ L: 3.5, v: 340 }], izq: { tipo: 'absorbente', fuente: { forma: 'senoidal', A: 1, f: 170, fase: 0, inicio: 0 } }, der: { tipo: 'absorbente', fuente: null },
      duracion: 0.03, sondas: [0], velocidad: 0.002, graficas: ['pt', 'px', 'xt'], regla: [0.5, 2.5],
    },
    {
      clave: 'mext-2006-1-3', titulo: 'Onda longitudinal: aceleración del medio', tipo: 'MEXT', anio: '2006 1-(3)', medio: 'tubo',
      tramos: [{ L: 1.5, v: 340 }], izq: { tipo: 'absorbente', fuente: { forma: 'senoidal', A: RHO_AIRE * 340 * 2 * Math.PI * 340 * 2e-6, f: 340, fase: 1.5 * Math.PI, inicio: null } }, der: { tipo: 'absorbente', fuente: null },
      inicial: { forma: 'senoidal', A: 2e-6, lambda: 1, desde: 0, fase: 0, sentido: 1 }, duracion: 0.006, velocidad: 0.0005, graficas: ['yx', 'px', 'xt'],
      puntos: [{ x: 0.25, nombre: 'A' }, { x: 0.5, nombre: 'B' }, { x: 0.75, nombre: 'C' }, { x: 1, nombre: 'D' }],
    },
    {
      clave: 'mext-2027-1-5', titulo: 'Cuerda que vibra en su modo fundamental', tipo: 'MEXT', anio: '2027 1-(5)',
      tramos: [{ L: 1, T: 774.4, mu: 0.001 }], izq: { tipo: 'fijo', fuente: null }, der: { tipo: 'fijo', fuente: null },
      inicial: { forma: 'triangulo', A: 0.002, centro: 0.5, sentido: 0 }, duracion: 0.05, sondas: [0.5], velocidad: 0.002, graficas: ['yx', 'yt', 'espectro'],
      capas: { envolvente: false, nodos: false, rapidez: false, valores: true },
      variables: { T: vari('T', 774.4, 100, 2000, 0.1, 'N', 1, ['tramos.0.T']) },
    },
    {
      clave: 'mext-2019-1-5', titulo: 'Pistón en un tubo: dos resonancias', tipo: 'MEXT', anio: '2019 1-(5)', medio: 'tubo', piston: true, correccion: 0.01,
      tramos: [{ L: 0.14, v: 333 }], izq: { tipo: 'abierto', fuente: { forma: 'senoidal', A: 1, f: 555, fase: 0, inicio: 0 } }, der: { tipo: 'cerrado', fuente: null },
      beta: 25, duracion: 0.1, sondas: [0.07], velocidad: 0.002, graficas: ['yx', 'px', 'respuesta'], respuesta: { eje: 'L', min: 0.04, max: 0.6 },
      capas: { envolvente: true, nodos: true, rapidez: false, valores: true },
      variables: { L: vari('L', 14, 4, 60, 0.5, 'cm', 0.01, ['tramos.0.L']) },
    },
    {
      clave: 'mext-2015-5', titulo: 'Pistón en 3l: densidad y siguiente resonancia', tipo: 'MEXT', anio: '2015 P5', medio: 'tubo', piston: true,
      tramos: [{ L: 0.375, v: 340 }], izq: { tipo: 'abierto', fuente: { forma: 'senoidal', A: 1, f: 680, fase: 0, inicio: 0 } }, der: { tipo: 'cerrado', fuente: null },
      beta: 20, duracion: 0.1, sondas: [0.125], velocidad: 0.002, graficas: ['yx', 'px', 'respuesta'], respuesta: { eje: 'f', min: 100, max: 2000 },
      capas: { envolvente: true, nodos: true, rapidez: false, valores: true },
      variables: { f: vari('f', 680, 100, 2000, 5, 'Hz', 1, ['izq.fuente.f']), L: vari('L', 37.5, 5, 60, 0.5, 'cm', 0.01, ['tramos.0.L']) },
    },
    {
      clave: 'mext-2008-5', titulo: 'Ondas estacionarias en un canal', tipo: 'MEXT', anio: '2008 P5', medio: 'canal',
      tramos: [{ L: 1, h: 0.1 }], izq: { tipo: 'libre', fuente: null }, der: { tipo: 'libre', fuente: null },
      inicial: { forma: 'modo', A: 0.01, n: 1, sentido: 0 }, duracion: 6, sondas: [0, 0.5], velocidad: 1, graficas: ['yx', 'yt', 'espectro'],
      capas: { envolvente: true, nodos: true, rapidez: false, valores: true },
    },
  ];
  const completa = e => {
    const b = BASE(), o = JSON.parse(JSON.stringify({ ...b, ...e, capas: { ...b.capas, ...(e.capas || {}) } }));
    return o;
  };
  const escenaDe = clave => ESCENAS.find(e => e.clave === clave) || ESCENAS[0];

  // ---------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------
  /** @type {any} */ let ESC = completa(ESCENAS[0]);
  /** @type {any} */ let SIM = null;
  let ERROR = null;
  /** @type {any} */ let D = {};                 // derivados de la corrida (escalas, cachés)
  let t = 0, jugando = false, velocidad = 1, ultimo = 0;
  let sel = 'medio', herramienta = null, vistaTocada = false, escala0 = 1, espacioPulsado = false;
  let arrastre = null, paneo = null, hover = null, cursorX = null;
  let autoguardar = false, historial = null;
  const lienzo = $('#lienzo'), area = $('#area');
  const tz = new Trazo(lienzo);

  // Vista con escala vertical propia (el desplazamiento se dibuja ampliado)
  class VistaOnda extends Vista {
    constructor() { super(); this.escalaY = 100; }
    Y(y) { return this.oy - this.escalaY * y; }
    my(py) { return (this.oy - py) / this.escalaY; }
    zoom(f, px, py) { const wx = this.mx(px), wy = this.my(py); this.escala *= f; this.escalaY *= f; this.ox = px - this.escala * wx; this.oy = py + this.escalaY * wy; }
  }
  tz.vista = new VistaOnda();

  const L_TOTAL = () => ESC.tramos.reduce((s, tr) => s + tr.L, 0);
  const X0 = () => ESC.origen, X1 = () => ESC.origen + L_TOTAL();
  const esTubo = () => ESC.medio === 'tubo', esCanal = () => ESC.medio === 'canal';
  const velTramo = tr => (ESC.medio === 'cuerda' ? Math.sqrt(tr.T / tr.mu) : ESC.medio === 'tubo' ? tr.v : Math.sqrt(G0 * tr.h));
  const impTramo = tr => (ESC.medio === 'cuerda' ? Math.sqrt(tr.T * tr.mu) : ESC.medio === 'tubo' ? ESC.rho * tr.v * ESC.S : 1000 * tr.h * velTramo(tr));
  const rigidezTramo = tr => (ESC.medio === 'cuerda' ? tr.T : ESC.medio === 'tubo' ? ESC.rho * tr.v * tr.v * ESC.S : 1000 * G0 * tr.h * tr.h);
  const tramoIndiceEn = x => { let a = ESC.origen; for (let i = 0; i < ESC.tramos.length; i++) { a += ESC.tramos[i].L; if (x < a) return i; } return ESC.tramos.length - 1; };
  const fuentes = () => [ESC.izq.fuente, ESC.der.fuente].filter(Boolean);
  const fFuente = () => { const f = fuentes().find(s => s.forma === 'senoidal'); return f ? f.f : null; };
  // Unidad de la amplitud de la fuente de un extremo
  function unidadFuente(tipo) {
    if (esTubo()) return tipo === 'cerrado' ? 'm' : 'Pa';
    return tipo === 'libre' ? 'N' : 'm';
  }
  const nombreFuente = tipo => (esTubo() ? (tipo === 'cerrado' ? 'Pistón que vibra' : 'Altavoz') : tipo === 'libre' ? 'Fuerza en el anillo' : tipo === 'absorbente' ? 'Onda que entra' : 'Oscilador');

  // ---------------------------------------------------------------------
  // Escena → motor
  // ---------------------------------------------------------------------
  // Corrección de extremo: el nodo de presión de una boca abierta queda e por fuera
  const corr = () => (esTubo() && ESC.izq.tipo === 'abierto' ? ESC.correccion || 0 : 0);
  function senalMotor(f, b, lado) {
    if (!f) return undefined;
    let A = f.A, fase = f.fase || 0;
    const tr = lado === 'izq' ? ESC.tramos[0] : ESC.tramos[ESC.tramos.length - 1];
    if (esTubo()) {
      if (b.tipo === 'abierto') A = (lado === 'izq' ? 1 : -1) * f.A * ESC.S;                   // presión × sección
      else if (b.tipo === 'absorbente') {
        // ΔP = ±ρv·ξ̇ en la onda que entra: ξ = ΔP/(ρvω), con un cuarto de periodo de retraso
        A = f.A / (ESC.rho * tr.v * DOS_PI * (f.f || 1)); fase += (lado === 'izq' ? -1 : 1) * Math.PI / 2;
      }
    }
    // Un altavoz arranca con una rampa suave de dos periodos: sin ella, el paso de
    // presión a desplazamiento dejaría un salto (un pico de presión) al empezar
    const rampa = esTubo() && f.forma === 'senoidal' && f.inicio != null ? 2 / (f.f || 1) : 0;
    return { forma: f.forma, amplitud: A, frecuencia: f.f, fase, inicio: f.inicio == null ? -Infinity : f.inicio, ancho: f.ancho, rampa };
  }
  function escenaMotor() {
    const e = corr();
    const tramos = ESC.tramos.map((tr, i) => {
      const L = tr.L + (i === 0 ? e : 0);
      if (ESC.medio === 'cuerda') return { longitud: L, tension: tr.T, densidad: tr.mu };
      if (ESC.medio === 'tubo') return tramoTubo({ longitud: L, velocidad: tr.v, densidad: ESC.rho, seccion: ESC.S });
      return { longitud: L, velocidad: velTramo(tr), densidad: 1000 * tr.h };
    });
    const ini = ESC.inicial;
    const iniciales = ini ? [{
      forma: ini.forma, amplitud: ini.A, centro: ini.centro, ancho: ini.ancho, desde: ini.desde, longitudOnda: ini.lambda,
      ciclos: ini.ciclos, fase: ini.fase, n: ini.n, sentido: ini.forma === 'modo' || ini.forma === 'triangulo' ? 0 : ini.sentido ?? 0,
    }] : [];
    const fs = fuentes().filter(f => f.forma === 'senoidal').map(f => f.f);
    return {
      tramos, origen: ESC.origen - e, duracion: ESC.duracion, amortiguamiento: ESC.beta,
      izq: { tipo: motorBorde(ESC.izq.tipo), fuente: senalMotor(ESC.izq.fuente, ESC.izq, 'izq') },
      der: { tipo: motorBorde(ESC.der.tipo), fuente: senalMotor(ESC.der.fuente, ESC.der, 'der') },
      iniciales, sondas: ESC.sondas, cuadros: 1500, courant: 0.9,
      periodoMinimo: fs.length ? 1 / Math.max(...fs) : undefined,
      celdas: celdasPantalla(tramos),
    };
  }
  // Resolución: 30 puntos por longitud de onda (como mínimo 240 celdas), con tope por costo
  function celdasPantalla() {
    const L = L_TOTAL() + corr(), vmin = Math.min(...ESC.tramos.map(velTramo));
    let n = 240;
    for (const f of fuentes()) {
      if (f.forma === 'senoidal') n = Math.max(n, 30 * L * f.f / vmin);
      else if (f.ancho) n = Math.max(n, 10 * L / (vmin * f.ancho));
    }
    const ini = ESC.inicial;
    if (ini) {
      if (ini.forma === 'gauss' && ini.ancho > 0) n = Math.max(n, 12 * L / ini.ancho);
      if ((ini.forma === 'tren' || ini.forma === 'senoidal') && ini.lambda > 0) n = Math.max(n, 60 * L / ini.lambda);
      if (ini.forma === 'triangulo') n = Math.max(n, 300);
      if (ini.forma === 'modo') n = Math.max(n, 40 * (ini.n || 1));
    }
    return Math.round(Math.min(1200, n));
  }

  function simular() {
    try { SIM = simularMedio(escenaMotor()); ERROR = null; }
    catch (err) { SIM = null; ERROR = err.message; }
    derivados();
  }

  // Escalas fijas de la corrida y cachés que dependen de ella
  function derivados() {
    D = { xt: null, espectro: null, respuesta: null, serieS: null };
    if (!SIM) return;
    const n = SIM.N + 1;
    let ymax = 0, pmax = 0, strain = 0;
    const paso = Math.max(1, Math.floor(SIM.cuadros / 400));
    for (let q = 0; q < SIM.cuadros; q += paso) {
      const y = cuadroMedio(SIM, q);
      for (let i = 0; i < n; i++) ymax = Math.max(ymax, Math.abs(y[i]));
      if (esTubo()) {
        const p = esfuerzoMedio(SIM, y);
        for (let i = 0; i < n; i++) { pmax = Math.max(pmax, Math.abs(p[i])); }
        for (let i = 0; i < SIM.N; i++) strain = Math.max(strain, Math.abs(y[i + 1] - y[i]) / SIM.h);
      }
    }
    // Sin movimiento todavía (nada que mostrar): la escala de la amplitud prevista
    if (!(ymax > 0)) ymax = Math.abs(ESC.inicial?.A || 0) || 0.01;
    D.ymax = ymax; D.pmax = pmax / ESC.S || 1; D.strain = strain || 1e-6;
    D.uy = ymax >= 0.5 ? ['m', 1] : ymax >= 0.005 ? ['cm', 100] : ymax >= 5e-6 ? ['mm', 1e3] : ['µm', 1e6];
    const e = SIM.energia;
    let Emax = Math.abs(e.E0);
    for (let q = 0; q < SIM.cuadros; q++) Emax = Math.max(Emax, e.K[q] + e.U[q], e.W[q], e.absorbida[q] + e.disipada[q]);
    D.Emax = Emax || 1;
    // Modos (un solo tramo y extremos que reflejan)
    D.modos = ESC.tramos.length === 1 ? frecuenciasModos({ longitud: L_TOTAL() + corr(), velocidad: velTramo(ESC.tramos[0]), izq: motorBorde(ESC.izq.tipo), der: motorBorde(ESC.der.tipo) }, 6) : [];
  }

  // Periodo para la envolvente y los nodos medidos: el de la fuente o el del modo
  function periodoEnvolvente() {
    const f = fFuente();
    if (f) return 1 / f;
    if (ESC.inicial && ESC.inicial.forma === 'modo' && D.modos.length) return 1 / D.modos[Math.max(0, (ESC.inicial.n || 1) - 1)].f;
    if (ESC.inicial && ESC.inicial.forma === 'triangulo' && D.modos.length) return 1 / D.modos[0].f;
    return null;
  }
  function envolvente() {
    const T = periodoEnvolvente();
    if (!SIM || !T || t < 0.5 * T) return null;
    const q1 = indiceCuadro(SIM, t), q0 = indiceCuadro(SIM, Math.max(0, t - T)), n = SIM.N + 1, env = new Float64Array(n);
    for (let q = q0; q <= q1; q++) { const y = cuadroMedio(SIM, q); for (let i = 0; i < n; i++) env[i] = Math.max(env[i], Math.abs(y[i])); }
    return env;
  }
  // Nodos y antinodos medidos en la envolvente (solo si el patrón es estacionario)
  function nodosMedidos(env) {
    if (!env) return null;
    const n = env.length, max = Math.max(...env);
    if (!(max > 0)) return null;
    const i0 = Math.round(corr() / SIM.h);
    let minInt = Infinity;
    for (let i = i0 + 1; i < n - 1; i++) minInt = Math.min(minInt, env[i]);
    if (minInt > 0.12 * max) return null;
    const N = [], A = [];
    for (let i = i0; i < n; i++) {
      const a = i > i0 ? env[i - 1] : Infinity, b = i < n - 1 ? env[i + 1] : Infinity, c = env[i];
      if (c <= a && c <= b && c < 0.08 * max) N.push(SIM.x[i]);
      const a2 = i > i0 ? env[i - 1] : -Infinity, b2 = i < n - 1 ? env[i + 1] : -Infinity;
      if (c >= a2 && c >= b2 && c > 0.8 * max) A.push(SIM.x[i]);
    }
    const unir = xs => xs.filter((x, k) => !k || x - xs[k - 1] > 4 * SIM.h);
    return { N: unir(N).filter(x => x >= ESC.origen - 1e-9), A: unir(A).filter(x => x >= ESC.origen - 1e-9) };
  }

  // Solución analítica, si la hay: pulsos o trenes que viajan en un medio
  // uniforme sin fuentes (método de las imágenes), onda senoidal mantenida
  // o modo estacionario. Devuelve {total, incidente, reflejada} o null.
  function analitica() {
    if (ESC.tramos.length !== 1 || !ESC.inicial || corr()) return null;
    const v = velTramo(ESC.tramos[0]), ini = ESC.inicial, x0 = X0(), L = L_TOTAL(), beta = ESC.beta;
    const ctx = { x0, x1: x0 + L, izq: motorBorde(ESC.izq.tipo), der: motorBorde(ESC.der.tipo), v };
    const p = { forma: ini.forma, amplitud: ini.A, centro: ini.centro, ancho: ini.ancho, desde: ini.desde, longitudOnda: ini.lambda, ciclos: ini.ciclos, fase: ini.fase, n: ini.n };
    if (ini.forma === 'senoidal') {
      // Onda senoidal mantenida por la fuente: y = A·sen(k(x − x_d − s·v·t) + φ)
      const f = formaInicial(p, ctx), s = ini.sentido || 1;
      const total = (x, tt) => f(x - s * v * tt)[0];
      return { total, incidente: total, reflejada: () => 0, solo: true };
    }
    if (ini.forma === 'modo') {
      const md = modoEstacionario({ longitud: L, velocidad: v, izq: ctx.izq, der: ctx.der }, ini.n || 1);
      if (!md) return null;
      const w = DOS_PI * md.f, wd = Math.sqrt(Math.max(0, w * w - beta * beta));
      const total = (x, tt) => ini.A * md.forma(x - x0) * Math.exp(-beta * tt) * (Math.cos(wd * tt) + beta / (wd || 1) * Math.sin(wd * tt));
      return { total, incidente: total, reflejada: () => 0, solo: true };
    }
    if (fuentes().length || beta > 0 || ini.forma === 'triangulo') return null;
    const f = formaInicial(p, ctx), s = ini.sentido || 0;
    const G = s ? viajera(x => f(x)[0], v, s) : (x, tt) => 0.5 * (f(x - v * tt)[0] + f(x + v * tt)[0]);
    const ri = ctx.izq !== 'absorbente', rd = ctx.der !== 'absorbente';
    let total = G;
    if (ri && rd) total = imagenesMedio(G, x0, L, ctx.izq, ctx.der, Math.ceil(v * ESC.duracion / (2 * L)) + 2);
    else if (rd) total = conImagen(G, x0 + L, ctx.der).total;
    else if (ri) total = conImagen(G, x0, ctx.izq).total;
    return { total, incidente: G, reflejada: (x, tt) => total(x, tt) - G(x, tt) };
  }

  // ---------------------------------------------------------------------
  // Dibujo del lienzo
  // ---------------------------------------------------------------------
  // Semialto del tubo (px), según el alto del lienzo
  const altoTubo = () => Math.round(Math.max(30, Math.min(46, 0.075 * tz.h)));
  function encuadrar() {
    const L = L_TOTAL(), x0 = X0() - corr(), x1 = X1(), margenX = Math.max(0.08 * L, 40 / Math.max(1, tz.w) * L * 1.6);
    const ancho = tz.w - 2 * 40, v = tz.vista;
    v.escala = ancho / (x1 - x0 + 2 * margenX);
    v.ox = 40 + v.escala * (margenX - x0);
    const disponible = tz.h - 2 * 52;
    if (esTubo()) { v.escalaY = v.escala; v.oy = 52 + disponible * 0.4; }
    else {
      v.oy = 52 + disponible * (esCanal() ? 0.38 : 0.5);
      // Arriba quedan sitio para la regla y los chips de las sondas, por debajo de las capas
      const amp = Math.min(disponible * (esCanal() ? 0.3 : 0.36), (v.oy - 124) / 1.35);
      v.escalaY = Math.max(20, amp) / (D.ymax || 0.01);
    }
  }

  // Muestras de y(x) en mundo para la curva del medio
  function puntosMedio(y) {
    const pts = [];
    for (let i = 0; i <= SIM.N; i++) pts.push([SIM.x[i], y[i]]);
    return pts;
  }
  function grosores() {
    const mus = ESC.tramos.map(tr => (ESC.medio === 'cuerda' ? tr.mu : 1));
    const min = Math.min(...mus);
    let a = X0();
    return ESC.tramos.map((tr, i) => { const r = [a, a + tr.L, Math.min(5, 2 * Math.sqrt(mus[i] / min))]; a += tr.L; return r; });
  }
  const valorY = (y, x) => {
    const u = Math.min(SIM.N, Math.max(0, (x - SIM.origen) / SIM.h)), i = Math.min(SIM.N - 1, Math.floor(u)), a = u - i;
    return (1 - a) * y[i] + a * y[i + 1];
  };
  const nombreSonda = k => [{ t: 'S', f: 'ui', tam: 11 }, { t: String(k + 1), f: 'ui', tam: 8, dy: 2 }];
  // Lecturas: lo que está por debajo de 10⁻⁹ de la escala de la corrida es cero
  const limpio = y => (Math.abs(y) < 1e-5 * (D.ymax || 1) ? 0 : y);

  let bufY = null;
  function dibujar() {
    tz.limpiar();
    if (!SIM) {
      tz.texto(ERROR || 'Sin simulación', tz.w / 2, tz.h / 2, { fuente: 'ui', tam: 13, color: 'error', alinear: 'center', halo: true });
      return;
    }
    if (!bufY || bufY.length !== SIM.N + 1) bufY = new Float64Array(SIM.N + 1);
    const y = estadoMedio(SIM, t, bufY);
    if (esTubo()) dibujarTubo(y); else dibujarCuerda(y);
    // Evento reciente: anillo y ficha (el evento no tiene color)
    const ev = eventoReciente();
    if (ev) {
      const X = tz.vista.X(ev.x), Y = tz.vista.Y(0);
      tz.eventoAnillo([ev.x, 0]);
      const dentro = X < tz.w / 2, txt = ev.nombre;
      const ancho = Math.min(380, 12 + txt.length * 6.2);
      // En un tubo, la ficha va debajo de la banda de presión; en una cuerda, encima del medio
      const yf = esTubo() ? Y + altoTubo() + 70 : Y - 92;
      tz.ficha(dentro ? X + 18 : X - ancho - 18, yf, [[{ t: txt, f: 'ui', tam: 11.5 }], [{ t: 't', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(ev.t * (D.ut === 'ms' ? 1e3 : 1), D.ut || 's', 4), f: 'num', tam: 11.5 }]], { ancla: [X + (dentro ? 7 : -7), Y + (esTubo() ? 7 : -7)] });
    }
    tz.ondasBarraEscala(16, tz.h - 56);
  }
  function eventoReciente() {
    if (!SIM) return null;
    const ventana = Math.max(0.06 * ESC.duracion, 4 * SIM.dt);
    let r = null;
    for (const e of SIM.eventos) if (e.t <= t + 1e-12 && t - e.t < ventana) r = e;
    return r;
  }

  function dibujarCuerda(y) {
    const v = tz.vista, [uy, fy] = D.uy, xa = X0(), xb = X1();
    // Ningún número de eje bajo el medio
    const huecos = [];
    for (let i = 0; i <= SIM.N; i += Math.max(1, Math.floor(SIM.N / 120))) { const Y = v.Y(y[i]); if (Y > v.Y(0) + 3) huecos.push([v.X(SIM.x[i]), Y + 4, 6]); }
    const env = (ESC.capas.envolvente || ESC.capas.nodos) ? envolvente() : null;
    const nd = ESC.capas.nodos ? nodosMedidos(env) : null;
    if (nd) for (const x of [...nd.N, ...nd.A]) huecos.push([v.X(x), v.Y(0) + 8, 9]);
    tz.ondasCuadricula();
    tz.ondasEjes({ x: 'x', ux: 'm', y: esCanal() ? 'η' : 'y', uy, fy, xEje: xa <= 0 && xb >= 0 ? 0 : xa, huecos });
    const Y0 = v.Y(0), amp = D.ymax * v.escalaY;

    // 5 · Construcción: envolvente, componentes, analítica, regla
    if (env && ESC.capas.envolvente) tz.ondasEnvolvente(SIM.x, env);
    const an = (ESC.capas.componentes || ESC.analitica) ? analitica() : null;
    if (an) {
      const muestra = f => { const pts = []; for (let i = 0; i <= SIM.N; i += Math.max(1, Math.floor(SIM.N / 400))) pts.push([SIM.x[i], f(SIM.x[i], t)]); return pts; };
      if (ESC.capas.componentes && !an.solo) { tz.ondasComponente(muestra(an.incidente), 'incidente'); tz.ondasComponente(muestra(an.reflejada), 'reflejada'); }
      if (ESC.analitica) tz.linea(muestra(an.total), { color: 'texto-3', grosor: 1 });
    }

    // 6 · Materia: agua, extremos, medio y fuentes
    const pts = puntosMedio(y);
    if (esCanal()) {
      const fondo = v.my(Y0 + Math.min(tz.h - Y0 - 60, Math.max(70, amp * 1.8)));
      tz.ondasAgua(pts, fondo);
      tz.superficie([[xa, fondo], [xb, fondo]]);
      for (const [lado, x] of [['izq', xa], ['der', xb]]) {
        const b = ESC[lado];
        if (b.tipo === 'absorbente') tz.ondasAbsorbente([x, valorY(y, x)], lado);
        else tz.superficie(lado === 'izq' ? [[x, v.my(Y0 - amp * 1.25 - 12)], [x, fondo]] : [[x, fondo], [x, v.my(Y0 - amp * 1.25 - 12)]]);
      }
    } else {
      for (const [lado, x] of [['izq', xa], ['der', xb]]) dibujarExtremo(lado, x, y, Y0, amp);
    }
    tz.ondasCuerda(pts, { grosores: grosores(), grueso: hover === 'medio' });
    let a = xa;
    for (let i = 0; i < ESC.tramos.length - 1; i++) { a += ESC.tramos[i].L; tz.ondasUnion(a, -D.ymax * 1.25, D.ymax * 1.25); }

    // 7 · Magnitudes: rapidez de cada frente
    if (ESC.capas.rapidez) dibujarRapidez(y);

    // 8 · Instrumentos: nodos, regla, sondas
    if (nd) { tz.ondasNodos(nd.N, 0, 'N'); tz.ondasNodos(nd.A, 0, 'A', { abajo: -12 }); }
    const Ya = Math.max(56, Y0 - amp * 1.35 - 28), Yb = Math.min(tz.h - 40, Y0 + amp * 1.35 + 16);
    dibujarRegla(Ya - 22, y);
    ESC.sondas.forEach((xs, k) => {
      const ys = valorY(y, xs), X = v.X(xs);
      tz.ondasSonda(X, v.Y(ys), Ya, Yb, nombreSonda(k), { seleccionada: sel === 'sonda:' + k, grueso: hover === 'sonda:' + k });
      if (ESC.capas.valores) tz.etiquetaMagnitud(X + 8, Ya + 16, { simbolo: esCanal() ? 'η' : 'y', valor: limpio(ys) * fy, unidad: uy, cifras: 3, alinear: 'left', tam: 13 });
    });

    // 10 · Selección
    seleccionLienzo(Y0, amp);
  }

  // Extremo de una cuerda: soporte fijo, anillo libre o absorbente, con su fuente
  function dibujarExtremo(lado, x, y, Y0, amp) {
    const v = tz.vista, b = ESC[lado], ye = valorY(y, x), s = lado === 'izq' ? -1 : 1, grueso = hover === lado;
    if (b.tipo === 'fijo') {
      if (b.fuente) {
        // Oscilador: mueve el extremo; su caja va justo debajo, donde la cuerda apenas se aparta
        tz.ondasOscilador([x, ye], Y0 + 40 + bajadaCerca(y, x), { grueso });
      } else tz.ondasSoporte([x, 0], lado, { alto: Math.max(30, Math.min(amp * 1.3, 90)) });
    } else if (b.tipo === 'libre') {
      const [Xr, Yr] = tz.ondasAnillo([x, 0], ye, { alto: Math.max(30, Math.min(amp * 1.3, 90)), grueso });
      if (b.fuente) {
        // Fuerza aplicada al anillo (familia interacción), sobre la varilla
        const F = senalValor(b.fuente, t), Fmax = Math.abs(b.fuente.A) || 1, L = 30 * F / Fmax;
        if (Math.abs(L) > 1) tz.flechaPx(Xr + s * 12, Yr, Xr + s * 12, Yr - L, { color: 'interaccion', grosor: Volta.G.vector });
        tz.etiquetaMagnitud(Xr + s * 18, Yr - L - 4, { simbolo: 'F', valor: F, unidad: 'N', color: 'interaccion', cifras: 3, alinear: s > 0 ? 'left' : 'right', tam: 13 });
      }
    } else {
      tz.ondasAbsorbente([x, ye], lado);
      if (b.fuente) {
        // La onda llega desde lejos: oscilador al final del tramo previsto
        const X = v.X(x) + s * 46;
        tz.ondasOscilador([v.mx(X), ye], Y0 + 40 + Math.max(0, -ye * v.escalaY) + bajadaCerca(y, x), { grueso });
      }
    }
  }
  // Cuánto baja la cuerda (px) cerca de un extremo: la caja del oscilador va por debajo
  function bajadaCerca(y, x) {
    const v = tz.vista; let m = 0;
    for (let i = 0; i <= SIM.N; i++) if (Math.abs(v.X(SIM.x[i]) - v.X(x)) < 16) m = Math.max(m, -y[i] * v.escalaY);
    return m;
  }
  const senalValor = (f, tt) => {
    if (!f) return 0;
    const ini = f.inicio == null ? -Infinity : f.inicio;
    if (tt < ini) return 0;
    if (f.forma === 'senoidal') return f.A * Math.sin(DOS_PI * f.f * tt + (f.fase || 0));
    if (f.forma === 'pulso') { const u = (tt - ini - 4 * f.ancho) / f.ancho; return Math.abs(u) < 4 ? f.A * Math.exp(-0.5 * u * u) : 0; }
    if (f.forma === 'medioSeno') return tt - ini <= f.ancho ? f.A * Math.sin(Math.PI * (tt - ini) / f.ancho) : 0;
    return 0;
  };

  // Rapidez de propagación sobre cada frente (pulsos) o sobre el medio (ondas mantenidas)
  function dibujarRapidez(y) {
    const v = tz.vista;
    const frentes = frentesEn(SIM, t).filter(f => Math.abs(f.amplitud) > 0.1 && f.x > X0() + 0.02 * L_TOTAL() && f.x < X1() - 0.02 * L_TOTAL());
    for (const f of frentes.slice(0, 4)) {
      // Por encima del pulso: máximo local del desplazamiento cerca del frente
      let ym = 0;
      for (let i = 0; i <= SIM.N; i++) if (Math.abs(SIM.x[i] - f.x) < 0.06 * L_TOTAL()) ym = Math.max(ym, y[i]);
      const Y = esTubo() ? v.Y(0) - altoTubo() - 22 : Math.min(v.Y(ym), v.Y(0)) - 22;
      tz.ondasRapidez(v.X(f.x), Y, f.sentido, f.v);
    }
  }

  function dibujarRegla(Y, y) {
    if (!ESC.regla) return;
    const [xa, xb] = ESC.regla, d = Math.abs(xb - xa), lam = longitudOnda();
    const segs = [{ t: 'Δ', f: 'simRecta', tam: 13 }, { t: 'x', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(d, 'm', 4), f: 'num', tam: 11.5 }];
    if (lam && Math.abs(d / lam - Math.round(d / lam)) < 0.02 && Math.round(d / lam) >= 1) segs.push({ t: '  ≈ ' + (Math.round(d / lam) === 1 ? '' : Math.round(d / lam)), f: 'num', tam: 11.5 }, { t: 'λ', f: 'sim', tam: 13 });
    tz.ondasRegla(xa, xb, Y, segs, { hasta: esTubo() ? tz.vista.Y(0) - altoTubo() : Math.min(tz.vista.Y(valorY(y, xa)), tz.vista.Y(valorY(y, xb))) - 4 });
    if (sel === 'regla') { const [a, b] = [tz.vista.X(Math.min(xa, xb)), tz.vista.X(Math.max(xa, xb))]; tz.seleccionCaja(a, Y - 20, b - a, 26); }
  }
  // Longitud de onda en el primer tramo si hay una fuente senoidal
  function longitudOnda() {
    const f = fFuente();
    if (f) return velTramo(ESC.tramos[0]) / f;
    if (ESC.inicial && (ESC.inicial.forma === 'senoidal' || ESC.inicial.forma === 'tren')) return ESC.inicial.lambda;
    return null;
  }

  function seleccionLienzo(Y0, amp) {
    const v = tz.vista;
    if (sel && sel.startsWith('tramo:')) {
      const i = +sel.slice(6); let a = X0(); for (let k = 0; k < i; k++) a += ESC.tramos[k].L;
      const b = a + ESC.tramos[i].L, h = esTubo() ? altoTubo() + 4 : Math.max(12, amp * 1.15);
      tz.seleccionRegion(v.X(a), Y0 - h, v.X(b) - v.X(a), 2 * h, {});
    } else if (sel === 'izq' || sel === 'der') {
      const x = sel === 'izq' ? X0() : X1(), ye = !esTubo() && bufY ? valorY(bufY, x) : 0;
      tz.seleccionCirculo(v.X(x), v.Y(ye), 16);
    } else if (sel === 'inicial' && SIM) {
      for (const f of frentesEn(SIM, t).slice(0, 2)) tz.seleccionCirculo(v.X(f.x), Y0, 14);
    }
  }

  // Tubo: paredes, partículas del aire, banda de presión, extremos y altavoz
  function dibujarTubo(y) {
    const v = tz.vista, xa = X0(), xb = X1(), Yc = v.Y(0), h = altoTubo();
    const Yband0 = Yc + h + 14, Yband1 = Yband0 + 16;
    tz.ondasCuadricula();
    tz.ondasEjes({ x: 'x', ux: 'm', sinY: true, yMarcasX: Yband1 + 10 });
    // Envolvente para nodos (desplazamiento)
    const env = ESC.capas.nodos || ESC.capas.envolvente ? envolvente() : null;
    // Banda de presión ΔP/ΔP_max (con su rótulo)
    const p = esfuerzoMedio(SIM, y), fs = Array.from(p, q => q / ESC.S / (D.pmax || 1));
    tz.ondasBanda(SIM.x, fs, Yband0, Yband1);
    tz.compuesto([{ t: 'Δ', f: 'simRecta', tam: 13 }, { t: 'P', f: 'sim', tam: 13 }], v.X(SIM.x[0]) - 8, Yband1 - 3, { alinear: 'right', color: 'texto-3' });
    // Paredes del tubo (la boca física en el origen; con corrección, el medio empieza antes)
    tz.ondasTubo(xa, xb, 0, h, { grueso: hover === 'medio' });
    for (const [lado, x] of [['izq', xa], ['der', xb]]) {
      const b = ESC[lado], s = lado === 'izq' ? -1 : 1;
      if (b.tipo === 'absorbente') {
        const X = v.X(x);
        tz.lineaPx([[X, Yc - h], [X + s * 46, Yc - h]], { color: 'texto-3', grosor: 1.5, patron: 'previsto', extremo: 'butt' });
        tz.lineaPx([[X, Yc + h], [X + s * 46, Yc + h]], { color: 'texto-3', grosor: 1.5, patron: 'previsto', extremo: 'butt' });
      } else if (b.tipo === 'cerrado') {
        if (lado === 'der' && ESC.piston) tz.ondasPiston(x, 0, h, 'der', { grueso: hover === 'der' });
        else tz.ondasTapon(x, 0, h, lado);
      }
      if (b.fuente) {
        const X = v.X(x) + s * (b.tipo === 'absorbente' ? 56 : b.tipo === 'cerrado' ? 30 : 8);
        tz.ondasAltavoz(X, Yc, lado === 'izq' ? 'der' : 'izq', { grueso: hover === lado });
      }
    }
    // Partículas: columnas en reposo cada ~7 px, desplazadas ξ ampliado
    const n = Math.max(8, Math.floor((v.X(xb) - v.X(xa)) / 7)), xEq = [], dx = [];
    // Ampliación del desplazamiento: sin cruces (deformación visual ≤ 0.5) y como mucho 24 px
    const k = Math.min(0.5 / D.strain, 24 / (v.escala * D.ymax));
    for (let i = 0; i <= n; i++) { const x = xa + (xb - xa) * i / n; xEq.push(x); dx.push(valorY(y, x) * k * v.escala); }
    tz.ondasParticulas(xEq, dx, Yc - h, Yc + h, { filas: Math.round(h / 7), marca: 8 });
    // Puntos marcados (MEXT 2006): partícula, nombre y aceleración (familia cambio)
    if (ESC.puntos.length) {
      const a = aceleracionMedio(SIM, y);
      let amax = 0; for (let i = 1; i < SIM.N; i++) amax = Math.max(amax, Math.abs(a[i]));
      for (const pnt of ESC.puntos) {
        const xs = pnt.x, Xp = v.X(xs) + valorY(y, xs) * k * v.escala, ap = valorY(a, xs);
        tz.ctx.save(); tz.ctx.fillStyle = tz.t.tinta; tz.ctx.beginPath(); tz.ctx.arc(Xp, Yc, 4, 0, DOS_PI); tz.ctx.fill(); tz.ctx.restore();
        tz.texto(pnt.nombre, Xp, Yc - h - 10, { fuente: 'ui', tam: 12, peso: 500, color: 'texto', alinear: 'center', halo: true });
        const L = 34 * ap / (amax || 1);
        if (Math.abs(L) > 2) tz.flechaPx(Xp, Yc - h - 26, Xp + L, Yc - h - 26, { color: 'cambio', grosor: Volta.G.vector });
      }
      tz.compuesto([{ t: 'a', f: 'sim', tam: 14, color: 'cambio' }, { t: '  aceleración del medio', f: 'ui', tam: 11, color: 'texto-3' }], v.X(xa), Yc - h - 46, {});
    }
    if (ESC.capas.rapidez) dibujarRapidez(y);
    if (ESC.capas.nodos) {
      const nd = nodosMedidos(env);
      if (nd) {
        tz.ondasNodos(nd.N.filter(x => x >= xa), 0, 'N', { abajo: -h - 8 });
        tz.ondasNodos(nd.A.filter(x => x >= xa), 0, 'A', { abajo: -h - 8 });
      }
    }
    dibujarRegla(Yc - h - (ESC.puntos.length ? 66 : 30), y);
    ESC.sondas.forEach((xs, i) => {
      const X = v.X(xs), ps = valorY(p, xs) / ESC.S;
      tz.ondasSonda(X, Yc, Yc - h - 14, Yband1 + 4, nombreSonda(i), { seleccionada: sel === 'sonda:' + i, grueso: hover === 'sonda:' + i });
      if (ESC.capas.valores) tz.compuesto([{ t: 'Δ', f: 'simRecta', tam: 13 }, { t: 'P', f: 'sim', tam: 13 }, { t: ' = ' + valorCon(ps, 'Pa', 3), f: 'num', tam: 11.5, color: 'texto-2' }], X + 8, Yband1 + 34, {});
    });
    seleccionLienzo(Yc, h);
  }

  // ---------------------------------------------------------------------
  // Inspector, árbol, variables y lecturas
  // ---------------------------------------------------------------------
  const fila = (etq, control, ayuda = '') => `<div class="fila"${ayuda ? ` data-ayuda="${ayuda}"` : ''}><span class="etq">${etq}</span>${control}</div>`;
  const segmentado = (id, ops, actual) => `<div class="segmentado texto" id="${id}">${ops.map(([v, txt]) => `<button data-v="${v}" aria-pressed="${String(v) === String(actual)}">${txt}</button>`).join('')}</div>`;
  const leer = ruta => ruta.split('.').reduce((o, k) => (o == null ? o : o[k]), ESC);
  function escribir(ruta, val) {
    const ks = ruta.split('.'), ult = ks.pop();
    const o = ks.reduce((a, k) => a[k], ESC);
    o[ult] = val;
  }
  // Variable que fija una ruta
  const ligadaA = ruta => Object.entries(ESC.variables).find(([, d]) => d.liga.includes(ruta));
  // Campo con unidad: ruta, dimensión esperada, unidad de pantalla
  function campo(etq, ruta, dim, u, ayuda = '') {
    const lig = ligadaA(ruta);
    if (lig) {
      const [nv, d] = lig;
      return fila(etq, `<div class="campo es-variable" data-ayuda="Ligado a la variable ${d.sim}|Bound to variable"><span class="chip-var">${simHTML(d.sim, d.sub)}</span><span class="valor-var" data-var="${nv}"></span><span class="u">${d.u}</span></div>`, ayuda);
    }
    const val = leer(ruta);
    return fila(etq, `<div class="campo"><input data-ruta="${ruta}" data-dim="${dim}" data-u="${u}" value="${val == null ? '' : numCampo(val / (FAC[u] ?? 1))}"><span class="u">${u}</span></div>`, ayuda);
  }
  // Unidad de pantalla para una longitud pequeña (amplitudes)
  const uLong = v => (Math.abs(v) >= 1 ? 'm' : Math.abs(v) >= 0.01 ? 'cm' : Math.abs(v) >= 1e-5 ? 'mm' : 'µm');

  function inspector() {
    const props = $('#propiedades'), fte = $('#fuente');
    props.innerHTML = ''; fte.innerHTML = '';
    let titulo = 'Propiedades', ico = MEDIOS[ESC.medio].ico, nombre = MEDIOS[ESC.medio].nombre, fuenteVisible = false;
    if (sel === 'medio') {
      props.innerHTML = fila('Medio', segmentado('p-medio', [['cuerda', 'Cuerda'], ['tubo', 'Tubo']].concat(esCanal() ? [['canal', 'Canal']] : []), ESC.medio), 'Cuerda tensa o columna de aire|Medium')
        + campo('Amortig.', 'beta', 'frecuencia', '1/s', 'Amortiguamiento β: cada modo decae como e^(−βt)|Damping')
        + campo('Duración', 'duracion', 'tiempo', ESC.duracion < 0.5 ? 'ms' : 's', 'Tiempo simulado|Duration')
        + (esTubo() ? campo('Densidad', 'rho', 'densidad', 'kg/m³', 'Densidad del aire|Air density') + campo('Sección', 'S', 'area', 'cm²', 'Sección del tubo|Cross section') + campo('Corrección', 'correccion', 'longitud', 'cm', 'Corrección de extremo: el nodo de presión queda e por fuera de la boca abierta|End correction') : '');
    } else if (sel.startsWith('tramo:')) {
      const i = +sel.slice(6), base = `tramos.${i}`;
      nombre = `Tramo ${i + 1}`; titulo = `Tramo ${i + 1}`;
      props.innerHTML = campo('Longitud', `${base}.L`, 'longitud', ESC.tramos[i].L < 1 ? 'cm' : 'm')
        + (ESC.medio === 'cuerda' ? campo('Tensión', `${base}.T`, 'fuerza', 'N', 'Tensión de la cuerda|Tension') + campo('Densidad', `${base}.mu`, [-1, 1, 0, 0, 0, 0].join(','), ESC.tramos[i].mu < 0.05 ? 'g/m' : 'kg/m', 'Densidad lineal μ|Linear density')
          : ESC.medio === 'tubo' ? campo('Rapidez', `${base}.v`, 'velocidad', 'm/s', 'Rapidez del sonido en el aire del tubo|Speed of sound')
            : campo('Profund.', `${base}.h`, 'longitud', 'cm', 'Profundidad del agua: v = √(gh)|Depth'))
        + (ESC.tramos.length > 1 ? `<div class="fila"><span class="etq">Tramo</span><div><button class="btn btn-secundario btn-compacto" id="p-quitar-tramo" data-ayuda="Unir este tramo con el anterior|Remove junction"><svg class="ico"><use href="#i-borrar"/></svg>Quitar la unión</button></div></div>` : '');
    } else if (sel === 'izq' || sel === 'der') {
      const b = ESC[sel], lado = sel === 'izq' ? 'izquierdo' : 'derecho';
      nombre = `Extremo ${lado}`; ico = ICONO_BORDE[b.tipo]; titulo = 'Extremo';
      props.innerHTML = fila('Tipo', segmentado('p-borde', MEDIOS[ESC.medio].bordes, b.tipo), 'Fijo: no se mueve. Libre: el extremo desliza. Absorbente: la onda sale sin volver. En un tubo, cerrado = desplazamiento nulo y abierto = presión nula|Boundary')
        + (esCanal() ? '' : fila('Fuente', segmentado('p-fuente', [['', 'Ninguna'], ['senoidal', 'Senoidal'], ['pulso', 'Pulso']], b.fuente ? b.fuente.forma : ''), 'Excitación en este extremo|Source'));
      if (b.fuente) {
        fuenteVisible = true;
        const f = b.fuente, u = unidadFuente(b.tipo), uA = u === 'm' ? uLong(f.A) : u;
        fte.innerHTML = campo('Amplitud', `${sel}.fuente.A`, u === 'm' ? 'longitud' : u === 'N' ? 'fuerza' : 'presion', uA, u === 'Pa' ? 'Amplitud de la presión del altavoz|Pressure amplitude' : '')
          + (f.forma === 'senoidal' ? campo('Frecuencia', `${sel}.fuente.f`, 'frecuencia', 'Hz') + campo('Fase', `${sel}.fuente.fase`, 'adimensional', '°', 'Fase inicial φ: s(t) = A·sen(2πft + φ)|Phase')
            : campo('Ancho', `${sel}.fuente.ancho`, 'tiempo', f.ancho < 0.1 ? 'ms' : 's', 'Ancho σ del pulso en el tiempo|Pulse width'));
        $('#fuente-titulo').textContent = nombreFuente(b.tipo);
      }
    } else if (sel === 'inicial' && ESC.inicial) {
      const ini = ESC.inicial;
      nombre = ini.forma === 'modo' ? `Modo ${ini.n}` : ini.forma === 'triangulo' ? 'Cuerda pulsada' : ini.forma === 'tren' ? 'Tren de ondas' : ini.forma === 'senoidal' ? 'Onda senoidal' : 'Pulso';
      ico = ini.forma === 'senoidal' ? 'o-onda-analitica' : 'o-pulso'; titulo = 'Condición inicial';
      const uA = uLong(ini.A);
      props.innerHTML = campo('Amplitud', 'inicial.A', 'longitud', uA)
        + (ini.forma === 'gauss' ? campo('Centro', 'inicial.centro', 'longitud', 'm') + campo('Ancho', 'inicial.ancho', 'longitud', ini.ancho < 1 ? 'cm' : 'm', 'σ del pulso gaussiano|Pulse width') : '')
        + (ini.forma === 'tren' ? campo('Desde', 'inicial.desde', 'longitud', 'm') + campo('λ', 'inicial.lambda', 'longitud', 'm', 'Longitud de onda|Wavelength') : '')
        + (ini.forma === 'senoidal' ? campo('λ', 'inicial.lambda', 'longitud', 'm', 'Longitud de onda|Wavelength') : '')
        + (ini.forma === 'triangulo' ? campo('Pulsada en', 'inicial.centro', 'longitud', 'm', 'Punto donde se pulsa la cuerda|Pluck point') : '')
        + (ini.forma === 'modo' ? campo('Modo', 'inicial.n', 'adimensional', '', 'Número del modo n|Mode number') : '')
        + (['gauss', 'tren'].includes(ini.forma) ? fila('Sentido', segmentado('p-sentido', [['-1', '←'], ['0', 'Reposo'], ['1', '→']], String(ini.sentido ?? 0)), 'Hacia dónde viaja; en reposo se divide en dos mitades|Direction') : '')
        + `<div class="fila"><span class="etq">Pulso</span><div><button class="btn btn-secundario btn-compacto" id="p-quitar-ini" data-ayuda="Quitar la condición inicial|Remove"><svg class="ico"><use href="#i-borrar"/></svg>Quitar</button></div></div>`;
    } else if (sel.startsWith('sonda:')) {
      const i = +sel.slice(6);
      nombre = `Sonda S${subs(i + 1)}`; ico = 'n-microfono'; titulo = 'Sonda';
      props.innerHTML = campo('Posición', `sondas.${i}`, 'longitud', 'm', 'Punto donde se registra y(t)|Probe position')
        + `<div class="fila"><span class="etq">Sonda</span><div><button class="btn btn-secundario btn-compacto" id="p-quitar-sonda" data-ayuda="Quitar la sonda|Delete|Supr"><svg class="ico"><use href="#i-borrar"/></svg>Quitar</button></div></div>`;
    } else if (sel === 'regla' && ESC.regla) {
      nombre = 'Regla'; ico = 'n-regla'; titulo = 'Regla';
      props.innerHTML = campo('Desde', 'regla.0', 'longitud', 'm') + campo('Hasta', 'regla.1', 'longitud', 'm')
        + `<div class="fila"><span class="etq">Regla</span><div><button class="btn btn-secundario btn-compacto" id="p-quitar-regla" data-ayuda="Quitar la regla|Delete|Supr"><svg class="ico"><use href="#i-borrar"/></svg>Quitar</button></div></div>`;
    }
    $('#insp-ico').setAttribute('href', '#' + ico);
    $('#insp-nombre').textContent = nombre;
    $('#props-titulo').textContent = titulo;
    $('#grupo-fuente').hidden = !fuenteVisible;
    // Campos y controles
    document.querySelectorAll('#propiedades input[data-ruta], #fuente input[data-ruta]').forEach(campoConUnidad);
    const on = (id, f) => { const e = $(id); if (e) e.addEventListener('click', f); };
    on('#p-medio', ev => { const b = ev.target.closest('button'); if (b && b.dataset.v !== ESC.medio) convertirMedio(b.dataset.v); });
    on('#p-borde', ev => { const b = ev.target.closest('button'); if (b) cambiarBorde(sel, b.dataset.v); });
    on('#p-fuente', ev => { const b = ev.target.closest('button'); if (b) cambiarFuente(sel, b.dataset.v); });
    on('#p-sentido', ev => { const b = ev.target.closest('button'); if (b) { ESC.inicial.sentido = +b.dataset.v; cambio(); } });
    on('#p-quitar-ini', () => { ESC.inicial = null; sel = 'medio'; cambio(); avisar('Se quita la condición inicial'); });
    on('#p-quitar-sonda', () => quitarSeleccion());
    on('#p-quitar-regla', () => quitarSeleccion());
    on('#p-quitar-tramo', () => { const i = +sel.slice(6); if (i > 0) { ESC.tramos[i - 1].L += ESC.tramos[i].L; ESC.tramos.splice(i, 1); desplazarRutas(i, -1); sincronizarVariables(`tramos.${i - 1}.L`); limpiarVariables(); sel = 'tramo:' + (i - 1); cambio(); avisar('Se quita la unión'); } });
    arbol();
  }

  // Validación de cada ruta (en SI)
  function validar(ruta, x) {
    const k = ruta.split('.').pop();
    if (['L', 'T', 'mu', 'v', 'h', 'f', 'ancho', 'rho', 'S', 'lambda', 'duracion'].includes(k) && !(x > 0)) throw new Error('Este valor tiene que ser positivo.');
    if (k === 'beta' && !(x >= 0)) throw new Error('El amortiguamiento no puede ser negativo.');
    if (k === 'correccion' && !(x >= 0 && x <= 0.2)) throw new Error('La corrección de extremo va de 0 a 20 cm.');
    if (k === 'duracion' && x > 60) throw new Error('La duración máxima es 60 s.');
    if (k === 'n') { if (!(x >= 1 && x <= 20)) throw new Error('El modo va de 1 a 20.'); return Math.round(x); }
    if (ruta.startsWith('sondas.') || ruta.startsWith('regla.') || k === 'centro' || k === 'desde') {
      if (!(x >= X0() - 1e-9 && x <= X1() + 1e-9)) throw new Error(`La posición debe estar dentro del medio, entre ${fmt(X0(), 4)} m y ${fmt(X1(), 4)} m.`);
    }
    if (ruta.startsWith('tramos.') && k === 'L' && L_TOTAL() - leer(ruta) + x > 200) throw new Error('El medio no puede medir más de 200 m.');
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
        const dim = ent.dataset.dim.includes(',') ? ent.dataset.dim.split(',').map(Number) : ent.dataset.dim, u = ent.dataset.u;
        let txt = ent.value.trim().replace(/−/g, '-');
        // Un número solo se lee en la unidad del campo (también las compuestas: g/m, 1/s)
        if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(txt) && u && u !== '°') txt = `${txt} ${u}`;
        const r = evaluar(txt, { esperada: dim, unidadPorDefecto: u === '°' ? '°' : undefined });
        const ruta = ent.dataset.ruta, x = validar(ruta, r.valor);
        escribir(ruta, x);
        mostrarError(null); cambio();
      } catch (e) { mostrarError(e.message); }
    });
    ent.addEventListener('keydown', ev => { if (ev.key === 'Escape') { mostrarError(null); ent.blur(); inspector(); } });
  }

  function arbol() {
    const cont = $('#arbol'), nodoHTML = (s, ico, nombre, dato, clase = '') => `<div class="nodo${clase}" data-sel="${s}" aria-selected="${sel === s}"><svg class="ico"><use href="#${ico}"/></svg><span class="nombre">${nombre}</span><span class="dato">${dato}</span></div>`;
    let html = nodoHTML('medio', MEDIOS[ESC.medio].ico, MEDIOS[ESC.medio].nombre, cantidad(L_TOTAL(), 'm', 3));
    if (ESC.tramos.length > 1) ESC.tramos.forEach((tr, i) => { html += nodoHTML('tramo:' + i, 'o-union-medios', `Tramo ${i + 1}`, cantidad(velTramo(tr), 'm/s', 3)); });
    else html += nodoHTML('tramo:0', 'o-cuerda', esTubo() ? 'Aire' : esCanal() ? 'Agua' : 'Tramo', cantidad(velTramo(ESC.tramos[0]), 'm/s', 3));
    for (const lado of ['izq', 'der']) {
      const b = ESC[lado];
      html += nodoHTML(lado, ICONO_BORDE[b.tipo], `Extremo ${lado === 'izq' ? 'izquierdo' : 'derecho'}`, NOMBRE_BORDE[b.tipo].toLowerCase() + (b.fuente ? ' · fuente' : ''));
    }
    if (ESC.inicial) html += nodoHTML('inicial', 'o-pulso', ESC.inicial.forma === 'modo' ? `Modo ${ESC.inicial.n}` : ESC.inicial.forma === 'triangulo' ? 'Cuerda pulsada' : ESC.inicial.forma === 'senoidal' ? 'Onda inicial' : ESC.inicial.forma === 'tren' ? 'Tren de ondas' : 'Pulso', valorCon(Math.abs(ESC.inicial.A), 'm', 3));
    ESC.sondas.forEach((x, i) => { html += nodoHTML('sonda:' + i, 'n-microfono', `Sonda S${subs(i + 1)}`, cantidad(x, 'm', 3)); });
    if (ESC.regla) html += nodoHTML('regla', 'n-regla', 'Regla', cantidad(Math.abs(ESC.regla[1] - ESC.regla[0]), 'm', 3));
    html += `<div class="nodo global"><svg class="ico"><use href="#i-energia"/></svg><span class="nombre">Amortiguamiento</span><span class="dato">${ESC.beta ? cantidad(ESC.beta, '1/s', 3) : 'ninguno'}</span></div>`;
    cont.innerHTML = html;
    cont.querySelectorAll('.nodo[data-sel]').forEach(n => n.addEventListener('click', () => seleccionar(n.dataset.sel)));
  }
  function seleccionar(s) { if (s === sel) return; sel = s; inspector(); todo(); }

  const lectura = ([a, b, val, u, ayuda]) => `<span class="sim"${ayuda ? ` data-ayuda="${ayuda}"` : ''}>${a}${b ? `<sub class="r">${b}</sub>` : ''}</span><span class="v">${val}</span><span class="u">${u}</span>`;
  function lecturas() {
    $('#reloj').innerHTML = `<span class="sim">t</span>${fmtTiempo(t).padStart(7, ' ')}<span class="u">${D.ut || 's'}</span>`;
    $('#lect-titulo').textContent = `Lecturas en t = ${fmtTiempo(t)} ${D.ut || 's'}`;
    $('#b-play').innerHTML = `<svg class="ico"><use href="#i-${jugando ? 'pausar' : 'reproducir'}"/></svg>`;
    $('#b-play').dataset.ayuda = jugando ? 'Pausar|Pause|Espacio' : 'Reproducir|Play|Espacio';
    document.querySelectorAll('[data-var]').forEach(e => { const d = ESC.variables[e.dataset.var]; if (d) e.textContent = fmtVar(d); });
    if (!SIM) { $('#lecturas').innerHTML = '<span class="u">—</span>'; $('#insp-estado').textContent = ERROR || ''; return; }
    const y = estadoMedio(SIM, t), [uy, fy] = D.uy, filas = [];
    const L = (a, b, v, u, ay) => { const [x, uu] = enUnidad(v, u); return [a, b, fmt(x, 4), uu, ay]; };
    const lam = longitudOnda(), f = fFuente();
    if (sel === 'medio' || sel.startsWith('tramo:')) {
      const lista = sel === 'medio' ? ESC.tramos.map((tr, i) => [tr, i]) : [[ESC.tramos[+sel.slice(6)], +sel.slice(6)]];
      for (const [tr, i] of lista) {
        const sub = ESC.tramos.length > 1 ? String(i + 1) : '';
        filas.push(L('v', sub, velTramo(tr), 'm/s', ESC.medio === 'cuerda' ? 'Rapidez √(T/μ)|Wave speed' : ESC.medio === 'tubo' ? 'Rapidez del sonido|Speed of sound' : 'Rapidez √(gh)|Wave speed'));
        if (ESC.medio !== 'canal') filas.push(L('Z', sub, impTramo(tr), 'kg/s', 'Impedancia √(Tμ)|Impedance'));
      }
      if (ESC.tramos.length === 2) {
        const c = coeficientesUnion(impTramo(ESC.tramos[0]), impTramo(ESC.tramos[1]));
        filas.push(['r', '', fmt(c.r, 4), '', 'Coeficiente de reflexión (Z₁ − Z₂)/(Z₁ + Z₂)|Reflection coefficient'], ['t', '', fmt(c.t, 4), '', 'Coeficiente de transmisión 2Z₁/(Z₁ + Z₂)|Transmission coefficient']);
      }
      if (lam && f) filas.push(L('λ', '', lam, 'm', 'Longitud de onda v/f|Wavelength'), L('T', '', 1 / f, 's', 'Periodo|Period'));
      D.modos.slice(0, 3).forEach(m => filas.push(L('f', String(m.n), m.f, 'Hz', `Frecuencia del modo ${m.n}|Mode frequency`)));
    } else if (sel === 'izq' || sel === 'der') {
      const x = sel === 'izq' ? X0() : X1();
      if (esTubo()) filas.push(L('ΔP', '', valorY(esfuerzoMedio(SIM, y), x) / ESC.S, 'Pa', 'Presión en el extremo|Pressure'));
      filas.push(L(esCanal() ? 'η' : esTubo() ? 'ξ' : 'y', '', valorY(y, x), 'm'));
      if (f) filas.push(L('f', '', f, 'Hz'), L('T', '', 1 / f, 's'));
      if (lam) filas.push(L('λ', '', lam, 'm'));
      D.modos.slice(0, 3).forEach(m => filas.push(L('f', String(m.n), m.f, 'Hz', `Frecuencia del modo ${m.n}|Mode frequency`)));
    } else if (sel === 'inicial') {
      const fr = frentesEn(SIM, t);
      fr.slice(0, 4).forEach((r, k) => filas.push(['x', String(k + 1), fmt(r.x, 4), 'm', 'Posición del frente|Front position']));
      filas.push(L('v', '', velTramo(ESC.tramos[tramoIndiceEn(ESC.inicial.centro ?? X0())]), 'm/s'));
    } else if (sel.startsWith('sonda:')) {
      const i = +sel.slice(6), xs = ESC.sondas[i];
      filas.push([esCanal() ? 'η' : esTubo() ? 'ξ' : 'y', '', fmt(limpio(valorY(y, xs)) * fy, 4), uy]);
      if (esTubo()) filas.push(L('ΔP', '', valorY(esfuerzoMedio(SIM, y), xs) / ESC.S, 'Pa', 'Presión en la sonda|Pressure'));
      const m = medidaSonda(xs);
      if (m.f) filas.push(L('f', 'med', m.f, 'Hz', 'Frecuencia medida en la sonda (cruces por cero)|Measured frequency'));
      if (m.amp) filas.push([esCanal() ? 'η' : 'y', 'máx', fmt(m.amp * fy, 4), uy, 'Amplitud en el último periodo|Amplitude']);
    } else if (sel === 'regla' && ESC.regla) {
      const d = Math.abs(ESC.regla[1] - ESC.regla[0]);
      filas.push(L('Δx', '', d, 'm'));
      if (lam) filas.push(['Δx/λ', '', fmt(d / lam, 4), '', 'Distancia medida en longitudes de onda|In wavelengths']);
    }
    // Energía del medio (si tiene sentido físico)
    if (!esCanal()) { const e = energiaMedio(SIM, t); filas.push(L('E', '', e.E, 'J', 'Energía mecánica del medio|Wave energy')); }
    $('#lecturas').innerHTML = filas.map(lectura).join('');
    $('#insp-estado').textContent = estadoInspector();
  }
  function estadoInspector() {
    if (sel === 'medio') return `${ESC.tramos.length > 1 ? ESC.tramos.length + ' tramos' : '1 tramo'} · ${cantidad(L_TOTAL(), 'm', 4)}`;
    if (sel.startsWith('tramo:')) return `v = ${cantidad(velTramo(ESC.tramos[+sel.slice(6)]), 'm/s', 4)}`;
    if (sel === 'izq' || sel === 'der') { const b = ESC[sel]; return NOMBRE_BORDE[b.tipo] + (b.fuente ? ` · ${nombreFuente(b.tipo).toLowerCase()}` : ''); }
    if (sel === 'inicial') return ESC.inicial ? ({ '-1': 'viaja hacia −x', 0: 'parte del reposo', 1: 'viaja hacia +x' })[String(ESC.inicial.sentido ?? 0)] : '';
    if (sel.startsWith('sonda:')) return `x = ${cantidad(ESC.sondas[+sel.slice(6)], 'm', 4)}`;
    if (sel === 'regla') return 'Arrastra sus extremos en el lienzo';
    return '';
  }
  // Frecuencia (cruces por cero) y amplitud de la sonda en los últimos periodos hasta t
  function medidaSonda(xs) {
    const s = serieEn(SIM, xs), T = periodoEnvolvente(), cr = [];
    let amp = 0;
    const q1 = indiceCuadro(SIM, t);
    for (let q = 1; q <= q1; q++) {
      if (s.y[q - 1] > 0 && s.y[q] <= 0) cr.push(s.t[q - 1] + s.y[q - 1] / (s.y[q - 1] - s.y[q]) * (s.t[q] - s.t[q - 1]));
      if (T && s.t[q] > t - T) amp = Math.max(amp, Math.abs(s.y[q]));
    }
    const ult = cr.slice(-6);
    return { f: ult.length >= 3 ? (ult.length - 1) / (ult[ult.length - 1] - ult[0]) : null, amp: T ? amp : null };
  }

  function fmtVar(d) {
    const dec = !(d.paso > 0) || d.paso >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(d.paso) - 1e-9));
    return d.val.toFixed(dec).replace('-', '−');
  }
  function construirVariables() {
    const cont = $('#variables'); cont.innerHTML = '';
    for (const [k, d] of Object.entries(ESC.variables)) {
      const f = document.createElement('div'); f.className = 'var';
      f.innerHTML = `${simHTML(d.sim, d.sub)}<input class="deslizador" type="range" min="${d.min}" max="${d.max}" step="${d.paso}" value="${d.val}" aria-label="${d.sim}"><span class="valor"></span>`;
      const ent = f.querySelector('input'), val = f.querySelector('.valor');
      const pintar = () => { val.innerHTML = `${fmtVar(d)}${d.u ? `<span class="u">${d.u}</span>` : ''}`; ent.value = d.val; Volta.pintarDeslizador(ent); };
      ent.addEventListener('input', () => { d.val = parseFloat(ent.value); aplicarVariables(); pintar(); recalcular(); });
      ent.addEventListener('change', () => { registrar(); arbol(); inspector(); });
      d.pintar = pintar; pintar(); cont.appendChild(f);
      void k;
    }
    if (!Object.keys(ESC.variables).length) cont.innerHTML = '<span class="ayuda-fila" style="margin:0">Sin variables: edita los valores en el inspector.</span>';
  }
  function aplicarVariables() {
    for (const d of Object.values(ESC.variables)) for (const r of d.liga) { try { if (leer(r) !== undefined) escribir(r, d.val * d.factor); } catch { /* ruta que ya no existe */ } }
  }
  // Una herramienta cambió una magnitud ligada a una variable: la variable la sigue
  function sincronizarVariables(ruta) {
    for (const d of Object.values(ESC.variables)) if (d.liga.includes(ruta)) { d.val = Math.max(d.min, Math.min(d.max, leer(ruta) / d.factor)); escribir(ruta, d.val * d.factor); }
  }
  // Al insertar (delta = 1) o quitar (−1) un tramo en la posición i, las rutas de
  // las variables siguen a sus tramos; las del tramo quitado se sueltan
  function desplazarRutas(i, delta) {
    for (const d of Object.values(ESC.variables)) {
      d.liga = d.liga.map(r => {
        const m = /^tramos\.(\d+)\.(.+)$/.exec(r);
        if (!m || +m[1] < i) return r;
        if (delta < 0 && +m[1] === i) return null;
        return `tramos.${+m[1] + delta}.${m[2]}`;
      }).filter(Boolean);
    }
  }
  // Las variables cuyas rutas ya no existen (se quitó un tramo, una fuente) se sueltan
  function limpiarVariables() {
    for (const [k, d] of Object.entries(ESC.variables)) { d.liga = d.liga.filter(r => leer(r) !== undefined && leer(r) !== null); if (!d.liga.length) delete ESC.variables[k]; }
    construirVariables();
  }

  // ---------------------------------------------------------------------
  // Gráficas
  // ---------------------------------------------------------------------
  const PATRONES = ['continuo', 'discontinuo'];
  function graficas() {
    if (!$('#p-graficas').hidden) ESC.graficas.forEach((g, j) => grafica1(j + 1, g));
    if (!$('#p-energia').hidden) energiaPanel();
  }
  const vacia = (n, msj) => { grafica($(`#g${n}`), { x: { min: 0, max: 1 }, y: { min: -1, max: 1 }, series: [] }); $(`#t${n}`).textContent = msj; $(`#l${n}`).textContent = ''; };
  function grafica1(n, tipo) {
    if (!SIM) { vacia(n, 'Sin datos'); return; }
    const [uy, fy] = D.uy, cv = $(`#g${n}`), y = estadoMedio(SIM, t), xa = SIM.x[0], xb = SIM.x[SIM.N];
    const ySim = esCanal() ? 'η' : esTubo() ? 'ξ' : 'y';
    const eventos = SIM.eventos.filter(e => e.t > 0).map(e => ({ x: e.t }));
    if (tipo === 'yx') {
      const pts = []; for (let i = 0; i <= SIM.N; i += Math.max(1, Math.floor(SIM.N / 500))) pts.push([SIM.x[i], y[i] * fy]);
      const series = [{ tramos: [pts], familia: 'tinta' }];
      const an = ESC.analitica ? analitica() : null;
      if (an) { const p2 = []; for (let i = 0; i <= SIM.N; i += Math.max(1, Math.floor(SIM.N / 300))) p2.push([SIM.x[i], an.total(SIM.x[i], t) * fy]); series.push({ tramos: [p2], familia: 'texto-3', auxiliar: true, etiqueta: 'analítica' }); }
      const ym = D.ymax * fy * 1.12;
      grafica(cv, { x: { min: xa, max: xb }, y: { min: -ym, max: ym }, series, eventos: ESC.sondas.map(x => ({ x })), puntoCursor: ESC.sondas.length ? [ESC.sondas[0], valorY(y, ESC.sondas[0]) * fy] : null });
      $(`#t${n}`).innerHTML = `${simHTML(ySim)} (${uy}) contra ${simHTML('x')} (m)`;
      $(`#l${n}`).textContent = ESC.sondas.length ? cantidad(limpio(valorY(y, ESC.sondas[0])) * fy, uy, 4) : '';
    } else if (tipo === 'px') {
      const p = esfuerzoMedio(SIM, y), [, up] = enUnidad(D.pmax, 'Pa'), fp = FAC[up];
      const pts = []; for (let i = 0; i <= SIM.N; i += Math.max(1, Math.floor(SIM.N / 500))) pts.push([SIM.x[i], p[i] / ESC.S / fp]);
      const pm = D.pmax / fp * 1.12;
      grafica(cv, { x: { min: xa, max: xb }, y: { min: -pm, max: pm }, series: [{ tramos: [pts], familia: 'tinta', patron: 'discontinuo' }], eventos: ESC.sondas.map(x => ({ x })), puntoCursor: ESC.sondas.length ? [ESC.sondas[0], valorY(p, ESC.sondas[0]) / ESC.S / fp] : null });
      $(`#t${n}`).innerHTML = `Δ${simHTML('P')} (${up}) contra ${simHTML('x')} (m)`;
      $(`#l${n}`).textContent = ESC.sondas.length ? cantidad(valorY(p, ESC.sondas[0]) / ESC.S / fp, up, 4) : '';
    } else if (tipo === 'yt' || tipo === 'pt') {
      if (!ESC.sondas.length) { vacia(n, 'Coloca una sonda para registrar'); return; }
      const [, ut] = enUnidad(ESC.duracion, 's'), ft = FAC[ut];
      const [, up] = enUnidad(D.pmax, 'Pa'), fp = FAC[up];
      const q1 = indiceCuadro(SIM, t), salto = Math.max(1, Math.floor(SIM.cuadros / 800));
      const series = ESC.sondas.slice(0, 2).map((xs, k) => {
        const pts = [];
        for (let q = 0; q <= q1; q += salto) {
          const yq = cuadroMedio(SIM, q);
          pts.push([SIM.t[q] / ft, tipo === 'yt' ? valorY(yq, xs) * fy : valorY(esfuerzoMedio(SIM, yq), xs) / ESC.S / fp]);
        }
        const yt = tipo === 'yt' ? valorY(y, xs) * fy : valorY(esfuerzoMedio(SIM, y), xs) / ESC.S / fp;
        pts.push([t / ft, yt]);
        return { tramos: [pts], familia: 'tinta', patron: PATRONES[k], ult: yt };
      });
      const m = (tipo === 'yt' ? D.ymax * fy : D.pmax / fp) * 1.12;
      grafica(cv, { x: { min: 0, max: ESC.duracion / ft }, y: { min: -m, max: m }, series, cursor: t / ft, puntoCursor: [t / ft, series[0].ult], eventos: eventos.map(e => ({ x: e.x / ft })) });
      const leyenda = ESC.sondas.slice(0, 2).map((_, k) => `<span style="color:var(--tinta)"><i${k ? ' class="discontinua"' : ''}></i>S${subs(k + 1)}</span>`).join('');
      $(`#t${n}`).innerHTML = `<span class="leyenda">${leyenda}</span> ${tipo === 'yt' ? simHTML(ySim) : `Δ${simHTML('P')}`} (${tipo === 'yt' ? uy : up}) contra ${simHTML('t')} (${ut})`;
      $(`#l${n}`).textContent = cantidad(tipo === 'yt' ? limpio(series[0].ult / fy) * fy : series[0].ult, tipo === 'yt' ? uy : up, 4);
    } else if (tipo === 'xt') graficaXT(n);
    else if (tipo === 'espectro') graficaEspectro(n);
    else if (tipo === 'respuesta') graficaRespuesta(n);
  }

  // Diagrama espacio-tiempo: y(x, t) con el mapa divergente; el futuro, atenuado
  function graficaXT(n) {
    const cv = $(`#g${n}`), [, ut] = enUnidad(ESC.duracion, 's'), ft = FAC[ut];
    const { X, Y } = grafica(cv, { x: { min: SIM.x[0], max: SIM.x[SIM.N] }, y: { min: 0, max: ESC.duracion / ft }, series: [] });
    const x0 = Math.round(X(SIM.x[0])), x1 = Math.round(X(SIM.x[SIM.N])), y0 = Math.round(Y(ESC.duracion / ft)), y1 = Math.round(Y(0));
    const W = Math.max(1, x1 - x0), H = Math.max(1, y1 - y0), dpr = window.devicePixelRatio || 1;
    if (!D.xt || D.xt.W !== W || D.xt.H !== H || D.xt.tema !== tz.t) {
      // LUT de 256 colores del mapa divergente
      const lut = [];
      for (let k = 0; k < 256; k++) { const m = tz.ondasColorMapa(k / 127.5 - 1).match(/\d+/g).map(Number); lut.push(m); }
      const img = new ImageData(W, H), ref = (esTubo() ? D.pmax * ESC.S : D.ymax) || 1;
      for (let r = 0; r < H; r++) {
        const tt = ESC.duracion * (1 - (r + 0.5) / H), q = indiceCuadro(SIM, tt), yq = cuadroMedio(SIM, q), campo = esTubo() ? esfuerzoMedio(SIM, yq) : yq;
        for (let c = 0; c < W; c++) {
          const i = Math.min(SIM.N, Math.round((c + 0.5) / W * SIM.N)), f = Math.max(-1, Math.min(1, campo[i] / ref));
          const col = lut[Math.round((f + 1) * 127.5)], o = 4 * (r * W + c);
          img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
        }
      }
      const off = document.createElement('canvas'); off.width = W; off.height = H; off.getContext('2d').putImageData(img, 0, 0);
      D.xt = { W, H, off, tema: tz.t };
    }
    const c = cv.getContext('2d');
    c.save(); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const yt = Y(t / ft);
    c.globalAlpha = 0.3; c.drawImage(D.xt.off, 0, 0, W, Math.max(0, yt - y0), x0, y0, W, Math.max(0, yt - y0));
    c.globalAlpha = 1; c.drawImage(D.xt.off, 0, Math.max(0, yt - y0), W, Math.max(0, y1 - yt), x0, yt, W, Math.max(0, y1 - yt));
    c.strokeStyle = tz.t.tinta; c.lineWidth = 1; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(x0, Math.round(yt) + 0.5); c.lineTo(x1, Math.round(yt) + 0.5); c.stroke();
    c.restore();
    $(`#t${n}`).innerHTML = `${simHTML('t')} (${ut}) contra ${simHTML('x')} (m) · ${esTubo() ? `Δ${simHTML('P')}` : simHTML(esCanal() ? 'η' : 'y')} en color`;
    $(`#l${n}`).textContent = '';
  }

  // Espectro de amplitud de la sonda S₁ (ventana de Hann, toda la corrida)
  function graficaEspectro(n) {
    if (!ESC.sondas.length) { vacia(n, 'Coloca una sonda para el espectro'); return; }
    const [uy, fy] = D.uy;
    if (!D.espectro) {
      const s = serieEn(SIM, ESC.sondas[0]), M = s.y.length, T = s.t[M - 1] - s.t[0];
      const ref = D.modos.length ? D.modos[0].f : fFuente() || 1 / T;
      const fmax = Math.min(0.45 * (M - 1) / T, Math.max(5 * ref, 20 / T)), df = 1 / T / 2, pts = [];
      let pico = [0, 0];
      const w = new Float64Array(M); let sw = 0;
      for (let k = 0; k < M; k++) { w[k] = 0.5 - 0.5 * Math.cos(DOS_PI * k / (M - 1)); sw += w[k]; }
      for (let f = 0; f <= fmax; f += df) {
        let re = 0, im = 0;
        for (let k = 0; k < M; k++) { const a = DOS_PI * f * s.t[k], v = s.y[k] * w[k]; re += v * Math.cos(a); im -= v * Math.sin(a); }
        const A = 2 * Math.hypot(re, im) / sw * fy;
        pts.push([f, A]);
      }
      // Pico: el mayor máximo local, afinado con una parábola por los tres puntos
      let k = 1;
      for (let j = 1; j < pts.length - 1; j++) if (pts[j][1] > pts[k][1]) k = j;
      const [a, b, c] = [pts[k - 1][1], pts[k][1], pts[k + 1] ? pts[k + 1][1] : pts[k][1]], den = a - 2 * b + c;
      const d = den ? 0.5 * (a - c) / den : 0;
      pico = [pts[k][0] + d * df, b - 0.25 * (a - c) * d];
      D.espectro = { pts, fmax, pico, max: Math.max(...pts.map(p => p[1])) || 1 };
    }
    const E = D.espectro, uf = E.fmax >= 1e4 ? 'kHz' : 'Hz', ff = FAC[uf];
    grafica($(`#g${n}`), {
      x: { min: 0, max: E.fmax / ff }, y: { min: 0, max: E.max * 1.1 },
      series: [{ tramos: [E.pts.map(([f, a]) => [f / ff, a])], familia: 'tinta' }],
      puntoCursor: [E.pico[0] / ff, E.pico[1]], eventos: D.modos.filter(m => m.f <= E.fmax).map(m => ({ x: m.f / ff })),
    });
    $(`#t${n}`).innerHTML = `Espectro de ${simHTML(esCanal() ? 'η' : 'y')} en S${subs(1)} (${uy}) contra ${simHTML('f')} (${uf})`;
    $(`#l${n}`).textContent = `pico ${cantidad(E.pico[0] / ff, uf, 4)}`;
  }

  // Curva de respuesta estacionaria (analítica): barrido de frecuencia o de longitud
  function configRespuesta() {
    const r = ESC.respuesta, b = ESC.izq;
    if (!r || ESC.tramos.length !== 1 || !b.fuente || b.fuente.forma !== 'senoidal' || b.tipo === 'absorbente') return null;
    return r;
  }
  function graficaRespuesta(n) {
    const r = configRespuesta();
    if (!r) { vacia(n, 'Respuesta: necesita un medio uniforme con fuente senoidal en el extremo izquierdo'); return; }
    const tr = ESC.tramos[0], v = velTramo(tr), K = rigidezTramo(tr), f0 = ESC.izq.fuente.f, A = Math.abs(senalMotor(ESC.izq.fuente, ESC.izq, 'izq').amplitud) || 1;
    const tubo = esTubo(), [uy, fy] = D.uy;
    const valor = (L, f) => {
      const res = respuestaArmonica({ longitud: L + corr(), velocidad: v, rigidez: K, izq: motorBorde(ESC.izq.tipo), der: motorBorde(ESC.der.tipo), amortiguamiento: ESC.beta, amplitud: A }, f);
      return tubo ? (motorBorde(ESC.der.tipo) === 'fijo' ? res.esfuerzoL : res.esfuerzoMax) / ESC.S : res.yMax * fy;
    };
    const clave = JSON.stringify([r, v, K, A, ESC.beta, ESC.der.tipo, ESC.izq.tipo, corr(), r.eje === 'L' ? f0 : tr.L]);
    if (!D.respuesta || D.respuesta.clave !== clave) {
      const pts = [], N = 500;
      for (let k = 0; k <= N; k++) { const u = r.min + (r.max - r.min) * k / N; pts.push([u, r.eje === 'L' ? valor(u, f0) : valor(tr.L, u)]); }
      const picos = pts.filter((p, k) => k > 0 && k < N && p[1] > pts[k - 1][1] && p[1] >= pts[k + 1][1]).map(p => p[0]);
      D.respuesta = { clave, pts, picos, max: Math.max(...pts.map(p => p[1])) || 1 };
    }
    const R = D.respuesta, actual = r.eje === 'L' ? tr.L : f0, ua = r.eje === 'L' ? 'cm' : 'Hz', fa = r.eje === 'L' ? 100 : 1;
    const [, uv] = tubo ? enUnidad(R.max, 'Pa') : [0, uy], fv = tubo ? FAC[uv] : 1;
    grafica($(`#g${n}`), {
      x: { min: r.min * fa, max: r.max * fa }, y: { min: 0, max: R.max / fv * 1.08 },
      series: [{ tramos: [R.pts.map(([u, a]) => [u * fa, a / fv])], familia: 'tinta' }],
      cursor: actual * fa, puntoCursor: [actual * fa, (r.eje === 'L' ? valor(tr.L, f0) : valor(tr.L, f0)) / fv], eventos: R.picos.map(x => ({ x: x * fa })),
    });
    const que = tubo ? `Δ${simHTML('P')}${motorBorde(ESC.der.tipo) === 'fijo' ? '<sub>pistón</sub>' : '<sub>máx</sub>'} (${uv})` : `${simHTML('y')}<sub>máx</sub> (${uy})`;
    $(`#t${n}`).innerHTML = `${que} contra ${r.eje === 'L' ? simHTML('L') : simHTML('f')} (${ua})`;
    $(`#l${n}`).textContent = '◆ ' + R.picos.slice(0, 3).map(p => String(Number((p * fa).toPrecision(3)))).join(', ') + ' ' + ua;
  }

  // ---------------------------------------------------------------------
  // Registro de energía
  // ---------------------------------------------------------------------
  function energiaPanel() {
    if (!SIM || esCanal()) {
      $('#barras').innerHTML = '<div class="barras-tit">Registro de energía</div><p class="ayuda-fila" style="margin:0">En el canal el modelo sigue solo la altura de la superficie: no hay registro de energía.</p>';
      grafica($('#g4'), { x: { min: 0, max: 1 }, y: { min: 0, max: 1 }, series: [] }); $('#t4').innerHTML = ''; $('#l4').textContent = '';
      return;
    }
    const e = energiaMedio(SIM, t), esc = D.Emax, [, uE] = enUnidad(esc, 'J'), fE = FAC[uE];
    const color = f => (f === 'tinta' ? 'var(--tinta)' : `var(--f-${f})`);
    const filas = [
      ['Cinética', 'movimiento', e.K, 'Energía cinética del medio, ½μv²|Kinetic energy'],
      ['Potencial elástica', 'electrico', e.U, esTubo() ? 'Energía de compresión del aire|Elastic energy' : 'Energía elástica de la cuerda estirada, ½T(∂y/∂x)²|Elastic energy'],
      ['Total en el medio', 'tinta', e.E, 'E = Eₖ + U|Total energy'],
    ];
    if (fuentes().length) filas.push(['Trabajo de las fuentes', 'trabajo', e.W, 'Energía que entregan las fuentes|Work done by sources']);
    if (ESC.izq.tipo === 'absorbente' || ESC.der.tipo === 'absorbente') filas.push(['Sale por los extremos', 'termico', e.absorbida, 'Energía que se llevan las ondas por los extremos absorbentes|Energy leaving']);
    if (ESC.beta > 0) filas.push(['Disipada', 'termico', e.disipada, 'Energía disipada por el amortiguamiento|Dissipated']);
    $('#barras').innerHTML = '<div class="barras-tit">Registro de energía</div>' + filas.map(([nom, fam, val, ay]) => {
      const fondo = fam === 'trabajo' ? 'repeating-linear-gradient(90deg, var(--tinta) 0 6px, transparent 6px 9px)' : color(fam);
      return `<div class="barra-e" data-ayuda="${ay}"><span>${nom}</span><span class="riel"><i style="width:${Math.max(0, Math.min(100, Math.abs(val) / esc * 100))}%;background:${fondo}"></i></span><span class="v">${valorCon(val, 'J', 4)}</span></div>`;
    }).join('') + `<div class="barras-pie"><span class="sim">E</span> − <span class="sim">E</span><sub>0</sub> − <span class="sim">W</span> + <span class="sim">Q</span> = ${valorCon(e.residuo, 'J', 2)}</div>`;
    const en = SIM.energia, salto = Math.max(1, Math.floor(SIM.cuadros / 600)), K = [], U = [], E = [], W = [], Q = [];
    for (let q = 0; q < SIM.cuadros; q += salto) {
      const tt = SIM.t[q]; K.push([tt, en.K[q] / fE]); U.push([tt, en.U[q] / fE]); E.push([tt, (en.K[q] + en.U[q]) / fE]); W.push([tt, en.W[q] / fE]); Q.push([tt, (en.absorbida[q] + en.disipada[q]) / fE]);
    }
    const series = [{ tramos: [K], familia: 'movimiento' }, { tramos: [U], familia: 'electrico' }, { tramos: [E], familia: 'tinta' }];
    if (fuentes().length) series.push({ tramos: [W], familia: 'tinta', patron: 'discontinuo' });
    if (ESC.beta > 0 || ESC.izq.tipo === 'absorbente' || ESC.der.tipo === 'absorbente') series.push({ tramos: [Q], familia: 'termico' });
    grafica($('#g4'), { x: { min: 0, max: ESC.duracion }, y: { min: Math.min(0, ...U.map(p => p[1])), max: esc / fE * 1.08 }, series, cursor: t, eventos: SIM.eventos.filter(x => x.t > 0).map(x => ({ x: x.t })) });
    $('#t4').innerHTML = `<span style="color:var(--f-movimiento)"><i></i><span class="sim">E<sub class="r">k</sub></span></span><span style="color:var(--f-electrico)"><i></i><span class="sim">U</span></span><span style="color:var(--tinta)"><i></i><span class="sim">E</span></span>${fuentes().length ? '<span style="color:var(--tinta)"><i class="discontinua"></i><span class="sim">W</span></span>' : ''}${series.length > 3 + (fuentes().length ? 1 : 0) ? '<span style="color:var(--f-termico)"><i></i><span class="sim">Q</span></span>' : ''} <span class="u">(${uE})</span>`;
    $('#l4').textContent = cantidad(e.E / fE, uE, 4);
  }

  // ---------------------------------------------------------------------
  // Eventos y tabla de datos
  // ---------------------------------------------------------------------
  function tablas() {
    if (!SIM) { $('#t-eventos').innerHTML = ''; $('#t-datos').innerHTML = ''; return; }
    const ventana = ESC.duracion / 200;
    $('#t-eventos').innerHTML = '<tr><th>Evento</th><th>t (s)</th><th>x (m)</th><th>Amplitud relativa</th></tr>' +
      (SIM.eventos.length ? SIM.eventos.map(e => `<tr class="${Math.abs(e.t - t) < ventana ? 'actual' : ''}"><td class="texto">${e.nombre}</td><td>${fmt(e.t, 5)}</td><td>${fmt(e.x, 4)}</td><td>${fmt(e.amplitud, 3)}</td></tr>`).join('')
        : '<tr><td class="texto" colspan="4">Sin eventos: no hay frentes que lleguen a un extremo o a una unión.</td></tr>');
    const [uy, fy] = D.uy, ys = esCanal() ? 'η' : esTubo() ? 'ξ' : 'y';
    let filas = '<tr><th>t (s)</th>' + ESC.sondas.map((_, k) => `<th>${ys}<sub>S${k + 1}</sub> (${uy})</th>${esTubo() ? `<th>ΔP<sub>S${k + 1}</sub> (Pa)</th>` : ''}`).join('') + (esCanal() ? '' : '<th>E<sub>k</sub> (J)</th><th>U (J)</th><th>E (J)</th>') + '</tr>';
    const paso = ESC.duracion / 100;
    for (let j = 0; j <= 100; j++) {
      const tt = j * paso, yq = estadoMedio(SIM, tt), e = energiaMedio(SIM, tt), p = esTubo() ? esfuerzoMedio(SIM, yq) : null;
      filas += `<tr class="${Math.abs(tt - t) < paso / 2 ? 'actual' : ''}"><td>${fmt(tt, 4)}</td>` + ESC.sondas.map(xs => `<td>${fmt(valorY(yq, xs) * fy, 4)}</td>${p ? `<td>${fmt(valorY(p, xs) / ESC.S, 4)}</td>` : ''}`).join('')
        + (esCanal() ? '' : `<td>${fmt(e.K, 4)}</td><td>${fmt(e.U, 4)}</td><td>${fmt(e.E, 4)}</td>`) + '</tr>';
    }
    $('#t-datos').innerHTML = filas;
  }

  // ---------------------------------------------------------------------
  // Ciclo de actualización
  // ---------------------------------------------------------------------
  const lt = new LineaTiempo($('#tl'), { duracion: 1, eventos: [], alCambiar: nt => { t = nt; jugando = false; todo(); } });
  function todo() {
    dibujar(); lecturas(); lt.poner(t); graficas();
    if (!$('#p-eventos').hidden || !$('#p-tabla').hidden) tablas();
  }
  function recalcular() {
    simular();
    lt.duracion = ESC.duracion; lt.simulado = ESC.duracion;
    lt.eventos = SIM ? SIM.eventos.map(e => ({ t: e.t, nombre: e.nombre })) : [];
    t = Math.min(t, ESC.duracion);
    D.ut = ESC.duracion < 0.5 ? 'ms' : 's';
    if (!vistaTocada) encuadrar();
    if (ERROR) avisar(ERROR, false);
    todo();
    if (autoguardar) autoguardado.guardar('ondas', escenaActual());
  }
  // Un cambio editable: se recalcula, se registra en el historial y se rehacen los paneles
  function cambio() { aplicarVariables(); recalcular(); registrar(); inspector(); construirVariables(); }
  const fmtTiempo = s => (ESC.duracion < 0.5 ? fmt(s * 1e3, 4) : fmt(s, 4));
  function titulo() {
    $('#escena-nombre').textContent = ESC.titulo;
    const chip = $('#escena-chip');
    chip.textContent = ESC.tipo === 'MEXT' ? `MEXT ${ESC.anio || ''}`.trim() : ESC.tipo || 'Propio';
    chip.className = 'chip' + (ESC.tipo === 'MEXT' ? ' lleno' : '');
    document.title = `Volta · Ondas y sonido · ${ESC.titulo}`;
    // Velocidades de reproducción alrededor de la de la escena
    const base = ESC.velocidad || 1, k = ESCALERA.reduce((m, v, i) => (Math.abs(Math.log(v / base)) < Math.abs(Math.log(ESCALERA[m] / base)) ? i : m), 0);
    const ops = ESCALERA.slice(Math.max(0, Math.min(ESCALERA.length - 4, k - 2)), Math.max(0, Math.min(ESCALERA.length - 4, k - 2)) + 4);
    velocidad = ESCALERA[k];
    $('#velocidades').innerHTML = ops.map(v => `<button data-v="${v}" aria-pressed="${v === velocidad}">${fmtVel(v)}</button>`).join('');
    document.querySelectorAll('.capa-btn').forEach(b => b.setAttribute('aria-pressed', String(!!ESC.capas[b.dataset.capa])));
    $('#cy-sim').textContent = esTubo() ? 'ΔP' : esCanal() ? 'η' : 'y';
  }
  // Velocidades de reproducción: segundos simulados por segundo real
  const ESCALERA = [0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 4];
  const fmtVel = v => (v === 0.25 ? '¼×' : v === 0.5 ? '½×' : `${String(v)}×`);

  // ---------------------------------------------------------------------
  // Ediciones de alto nivel
  // ---------------------------------------------------------------------
  function convertirMedio(m) {
    if (m === ESC.medio || !MEDIOS[m] || m === 'canal') return;
    const L = L_TOTAL();
    if (m === 'tubo') {
      ESC.tramos = ESC.tramos.map(tr => ({ L: tr.L, v: 340 }));
      ESC.izq = { tipo: 'abierto', fuente: { forma: 'senoidal', A: 1, f: Math.round(340 / (2 * L)), fase: 0, inicio: 0 } };
      ESC.der = { tipo: 'abierto', fuente: null };
      ESC.inicial = null; ESC.beta = 15; ESC.duracion = Math.min(0.3, Math.max(0.05, 40 / (340 / (2 * L)))); ESC.velocidad = 0.002;
      ESC.graficas = ['yx', 'px', 'xt']; ESC.respuesta = { eje: 'f', min: 20, max: Math.round(340 / L * 2) };
    } else {
      ESC.tramos = ESC.tramos.map(tr => ({ L: tr.L, T: 10, mu: 0.1 }));
      ESC.izq = { tipo: 'absorbente', fuente: null }; ESC.der = { tipo: 'fijo', fuente: null };
      ESC.inicial = { forma: 'gauss', A: 0.05 * L, centro: X0() + 0.25 * L, ancho: 0.04 * L, sentido: 1 };
      ESC.beta = 0; ESC.duracion = Math.round(20 * 1.6 * L / 10) / 10; ESC.velocidad = 0.5; ESC.graficas = ['yx', 'yt', 'xt']; ESC.respuesta = null;
    }
    ESC.medio = m; ESC.correccion = 0; ESC.piston = false; ESC.puntos = [];
    ESC.sondas = ESC.sondas.filter(x => x >= X0() && x <= X1());
    limpiarVariables(); sel = 'medio'; titulo(); vistaTocada = false; cambio();
    avisar(m === 'tubo' ? 'El medio es ahora una columna de aire' : 'El medio es ahora una cuerda');
  }
  function cambiarBorde(lado, tipo) {
    const b = ESC[lado]; if (b.tipo === tipo) return;
    b.tipo = tipo;
    if (b.fuente && esTubo() && tipo === 'absorbente') b.fuente.forma = 'senoidal';
    if (lado === 'der' && esTubo() && tipo !== 'cerrado') ESC.piston = false;
    cambio(); avisar(`Extremo ${lado === 'izq' ? 'izquierdo' : 'derecho'}: ${NOMBRE_BORDE[tipo].toLowerCase()}`);
  }
  function cambiarFuente(lado, forma) {
    const b = ESC[lado];
    if (!forma) { b.fuente = null; limpiarVariables(); cambio(); avisar('Se quita la fuente'); return; }
    if (esTubo() && b.tipo === 'absorbente' && forma !== 'senoidal') { avisar('Un altavoz en un extremo absorbente solo puede emitir una onda senoidal'); return; }
    const vv = velTramo(ESC.tramos[lado === 'izq' ? 0 : ESC.tramos.length - 1]), L = L_TOTAL();
    const fBase = D.modos && D.modos.length ? D.modos[0].f : vv / (L / 4);
    const u = unidadFuente(b.tipo), A = u === 'Pa' ? 1 : u === 'N' ? 0.5 : esTubo() ? 2e-6 : 0.02 * L;
    b.fuente = forma === 'senoidal' ? { forma, A: b.fuente?.A ?? A, f: b.fuente?.f ?? Number(fBase.toPrecision(3)), fase: 0, inicio: 0 } : { forma, A: b.fuente?.A ?? A, ancho: Number((0.05 * L / vv).toPrecision(2)), inicio: 0 };
    cambio(); avisar(`${nombreFuente(b.tipo)} en el extremo ${lado === 'izq' ? 'izquierdo' : 'derecho'}`);
  }
  function quitarSeleccion() {
    if (sel.startsWith('sonda:')) { const i = +sel.slice(6); ESC.sondas.splice(i, 1); sel = 'medio'; cambio(); avisar(`Se quita la sonda S${subs(i + 1)}`); }
    else if (sel === 'regla') { ESC.regla = null; sel = 'medio'; cambio(); avisar('Se quita la regla'); }
    else if (sel === 'inicial') { ESC.inicial = null; sel = 'medio'; cambio(); avisar('Se quita la condición inicial'); }
  }

  let relojAviso = null;
  function avisar(txt, conDeshacer = true) {
    $('#aviso-texto').textContent = txt; $('#aviso').hidden = false;
    $('#aviso-deshacer').hidden = !conDeshacer || !historial?.puedeDeshacer;
    clearTimeout(relojAviso); relojAviso = setTimeout(() => { $('#aviso').hidden = true; }, conDeshacer ? 5000 : 4000);
  }
  $('#aviso-deshacer').addEventListener('click', () => deshacer());

  // ---------------------------------------------------------------------
  // Escena: guardar, abrir, autoguardado, deshacer
  // ---------------------------------------------------------------------
  const copia = o => JSON.parse(JSON.stringify(o));
  const instantanea = () => { const o = copia(ESC); for (const d of Object.values(o.variables)) delete d.pintar; return o; };
  function escenaActual() { return crearEscena({ modulo: 'ondas', espacio: 'medio-1d', titulo: ESC.titulo, datos: instantanea() }); }
  const RUTA_OK = /^(tramos\.[0-5]\.(L|T|mu|v|h)|(izq|der)\.fuente\.(A|f|fase|ancho)|inicial\.(A|centro|ancho|desde|lambda|n)|beta|rho|S|correccion|duracion|sondas\.[01]|regla\.[01])$/;
  const GRAFICAS = ['yx', 'yt', 'px', 'pt', 'xt', 'espectro', 'respuesta'];
  // Valida y acota lo que viene de un archivo antes de usarlo
  function datosSeguros(d = {}) {
    const base = completa(ESCENAS.find(e => e.clave === d.clave) || ESCENAS[0]);
    const medio = ['cuerda', 'tubo', 'canal'].includes(d.medio) ? d.medio : base.medio;
    const pos = (v, def, min = 1e-6, max = 1e6) => numero(v, def, min, max);
    const propios = Array.isArray(d.tramos) ? d.tramos.filter(tr => tr && typeof tr === 'object' && !Array.isArray(tr)).slice(0, 6) : [];
    const lista = propios.length ? propios : base.medio === medio ? base.tramos : [{ L: 1, T: 10, mu: 0.1, v: 340, h: 0.1 }];
    const tramos = lista.map(o => {
      const L = pos(o.L, 1, 1e-3, 200);
      if (medio === 'cuerda') return { L, T: pos(o.T, 10, 1e-6, 1e7), mu: pos(o.mu, 0.1, 1e-7, 1e4) };
      if (medio === 'tubo') return { L, v: pos(o.v, 340, 1, 1e4) };
      return { L, h: pos(o.h, 0.1, 1e-3, 1e3) };
    });
    const tipos = medio === 'tubo' ? ['abierto', 'cerrado', 'absorbente'] : medio === 'canal' ? ['libre', 'absorbente'] : ['fijo', 'libre', 'absorbente'];
    const borde = (b, def) => {
      const o = b && typeof b === 'object' ? b : {}, tipo = tipos.includes(o.tipo) ? o.tipo : def.tipo && tipos.includes(def.tipo) ? def.tipo : tipos[0];
      let fuente = null;
      if (o.fuente && typeof o.fuente === 'object' && medio !== 'canal' && ['senoidal', 'pulso', 'medioSeno'].includes(o.fuente.forma)) {
        const f = o.fuente;
        fuente = { forma: medio === 'tubo' && tipo === 'absorbente' ? 'senoidal' : f.forma, A: numero(f.A, 0.01, -1e6, 1e6), f: pos(f.f, 1, 1e-4, 1e6), fase: numero(f.fase, 0, -100, 100), ancho: pos(f.ancho, 0.1, 1e-7, 100), inicio: f.inicio === null ? null : numero(f.inicio, 0, 0, 1e3) };
      }
      return { tipo, fuente };
    };
    const L = tramos.reduce((s, tr) => s + tr.L, 0), origen = numero(d.origen, base.origen, -1e3, 1e3), dentro = x => numero(x, origen + L / 2, origen, origen + L);
    let inicial = null;
    if (d.inicial && typeof d.inicial === 'object' && ['gauss', 'tren', 'senoidal', 'modo', 'triangulo'].includes(d.inicial.forma)) {
      const p = d.inicial;
      inicial = { forma: p.forma, A: numero(p.A, 0.01, -1e3, 1e3), centro: dentro(p.centro), ancho: pos(p.ancho, L / 20, 1e-6, 1e3), desde: numero(p.desde, origen, origen - 1e3, origen + L), lambda: pos(p.lambda, L / 4, 1e-6, 1e4), ciclos: Math.round(numero(p.ciclos, 1, 1, 50)), fase: numero(p.fase, 0, -100, 100), n: Math.round(numero(p.n, 1, 1, 20)), sentido: [-1, 0, 1].includes(p.sentido) ? p.sentido : 0 };
    }
    const variables = {};
    for (const [k, v] of Object.entries(d.variables && typeof d.variables === 'object' ? d.variables : {})) {
      if (!v || !Array.isArray(v.liga) || !/^[A-Za-z]\w{0,7}$/.test(k)) continue;
      const min = numero(v.min, 0, -1e9, 1e9), max = Math.max(min, numero(v.max, 1, -1e9, 1e9));
      const liga = v.liga.filter(r => typeof r === 'string' && RUTA_OK.test(r));
      if (!liga.length) continue;
      variables[k] = { sim: texto(v.sim, k, 3), sub: v.sub ? texto(v.sub, '', 4) : undefined, val: numero(v.val, min, min, max), min, max, paso: pos(v.paso, 0.1, 1e-9, 1e9), u: texto(v.u, '', 6), factor: pos(v.factor, 1, 1e-15, 1e15), liga };
    }
    const capas = {};
    for (const k of ['componentes', 'envolvente', 'nodos', 'rapidez', 'valores']) capas[k] = typeof d.capas?.[k] === 'boolean' ? d.capas[k] : !!base.capas[k];
    const resp = d.respuesta && typeof d.respuesta === 'object' && ['f', 'L'].includes(d.respuesta.eje)
      ? { eje: d.respuesta.eje, min: pos(d.respuesta.min, 1, 1e-6, 1e6), max: pos(d.respuesta.max, 2, 1e-6, 1e6) } : null;
    if (resp && resp.max <= resp.min) resp.max = resp.min * 2;
    const graf = Array.isArray(d.graficas) && d.graficas.length === 3 && d.graficas.every(g => GRAFICAS.includes(g)) ? d.graficas.slice() : base.graficas.slice();
    return {
      clave: ESCENAS.some(e => e.clave === d.clave) ? d.clave : 'propio', titulo: texto(d.titulo, base.titulo, 80),
      tipo: ['Tutorial', 'Ejemplo', 'MEXT', 'Propio'].includes(d.tipo) ? d.tipo : 'Propio', anio: d.anio ? texto(d.anio, '', 14) : undefined,
      medio, origen, rho: pos(d.rho, RHO_AIRE, 1e-3, 1e4), S: pos(d.S, 1e-3, 1e-8, 10), correccion: numero(d.correccion, 0, 0, 0.2), piston: !!d.piston && medio === 'tubo',
      tramos, izq: borde(d.izq, base.izq), der: borde(d.der, base.der), inicial,
      beta: numero(d.beta, 0, 0, 1e4), duracion: numero(d.duracion, base.duracion, 1e-4, 60),
      sondas: (Array.isArray(d.sondas) ? d.sondas : []).slice(0, 2).filter(Number.isFinite).map(dentro),
      regla: Array.isArray(d.regla) && d.regla.length === 2 && d.regla.every(Number.isFinite) ? d.regla.map(dentro) : null,
      puntos: (Array.isArray(d.puntos) ? d.puntos : []).slice(0, 6).filter(p => p && Number.isFinite(p.x)).map(p => ({ x: dentro(p.x), nombre: texto(p.nombre, '·', 3) })),
      respuesta: resp, graficas: graf, capas, analitica: !!d.analitica, variables,
      velocidad: numero(d.velocidad, base.velocidad, 1e-5, 100), sel: 'medio',
    };
  }
  function restaurar(d) {
    ESC = datosSeguros(d); aplicarVariables();
    if (!selValida(sel)) sel = 'medio';
    titulo(); construirVariables(); inspector(); recalcular();
  }
  const selValida = s => s === 'medio' || s === 'izq' || s === 'der' || (s === 'inicial' && !!ESC.inicial) || (s === 'regla' && !!ESC.regla)
    || (s.startsWith('sonda:') && +s.slice(6) < ESC.sondas.length) || (s.startsWith('tramo:') && +s.slice(6) < ESC.tramos.length);
  function botonesHistorial() { $('#b-deshacer').disabled = !historial?.puedeDeshacer; $('#b-rehacer').disabled = !historial?.puedeRehacer; }
  function registrar() { if (historial && historial.registrar(instantanea())) botonesHistorial(); }
  function deshacer() { const d = historial?.deshacer(); if (d) { restaurar(d); botonesHistorial(); avisar('Cambio deshecho', false); } }
  function rehacer() { const d = historial?.rehacer(); if (d) { restaurar(d); botonesHistorial(); avisar('Cambio rehecho', false); } }
  $('#b-deshacer').addEventListener('click', deshacer);
  $('#b-rehacer').addEventListener('click', rehacer);

  function abrirEscena1(clave) {
    ESC = completa(escenaDe(clave)); aplicarVariables();
    sel = ESC.sel || 'medio'; t = 0; jugando = false; vistaTocada = false; herramienta = null; marcarHerramienta();
    titulo(); construirVariables(); inspector(); recalcular();
    escala0 = tz.vista.escala; zoomTexto();
    if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); }
  }
  function guardar() { guardarEscena(escenaActual()).then(r => { if (r) avisar('Escena guardada', false); }, e => avisar(`No se pudo guardar: ${e}`, false)); }
  function abrir() {
    abrirEscena({ modulo: 'ondas' }).then(e => {
      restaurar(e.datos); t = 0; vistaTocada = false; encuadrar(); escala0 = tz.vista.escala; zoomTexto(); todo();
      if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); }
      avisar(`Escena abierta: ${texto(e.titulo, 'sin título', 60)}`, false);
    }).catch(err => avisar(err.message, false));
  }

  // ---------------------------------------------------------------------
  // Exportar: datos (CSV con toda la precisión, en SI) e imágenes
  // ---------------------------------------------------------------------
  function exportarCSV() {
    if (!SIM) { avisar('No hay datos: la escena no se puede simular.', false); return; }
    const cols = ['t (s)'];
    ESC.sondas.forEach((x, k) => { cols.push(`y_S${k + 1} (m) en x = ${x} m`); if (esTubo()) cols.push(`dP_S${k + 1} (Pa)`); });
    cols.push('Ek (J)', 'U (J)', 'E (J)', 'W fuentes (J)', 'Q extremos (J)', 'Q amortiguamiento (J)', 'residuo (J)');
    const filas = [];
    for (let q = 0; q < SIM.cuadros; q++) {
      const yq = cuadroMedio(SIM, q), p = esTubo() ? esfuerzoMedio(SIM, yq) : null, e = energiaMedio(SIM, SIM.t[q]);
      const f = [SIM.t[q]];
      ESC.sondas.forEach(xs => { f.push(valorY(yq, xs)); if (p) f.push(valorY(p, xs) / ESC.S); });
      f.push(e.K, e.U, e.E, e.W, e.absorbida, e.disipada, e.residuo);
      filas.push(f);
    }
    descargarTexto(`${nombreArchivo(ESC.titulo)}-datos.csv`, aCSV(cols, filas)).then(r => { if (r) avisarLienzo(area, `Datos exportados: ${filas.length} filas`); }, e => avisar(`No se pudo exportar: ${e}`, false));
  }
  function exportarInstantanea() {
    if (!SIM) return;
    const y = estadoMedio(SIM, t), p = esTubo() ? esfuerzoMedio(SIM, y) : null, filas = [];
    for (let i = 0; i <= SIM.N; i++) filas.push(p ? [SIM.x[i], y[i], p[i] / ESC.S] : [SIM.x[i], y[i]]);
    descargarTexto(`${nombreArchivo(ESC.titulo)}-instantanea-t${fmt(t, 3)}s.csv`, aCSV(p ? ['x (m)', 'xi (m)', 'dP (Pa)'] : ['x (m)', 'y (m)'], filas))
      .then(r => { if (r) avisarLienzo(area, `Instantánea exportada: ${filas.length} puntos`); });
  }
  function exportarPNG() { descargarLienzo(lienzo, `${nombreArchivo(ESC.titulo)}-t${fmt(t, 3)}s.png`).then(r => { if (r) avisarLienzo(area, 'Imagen del lienzo exportada'); }); }
  $('#b-exportar').addEventListener('click', exportarCSV);

  // ---------------------------------------------------------------------
  // Reproducción
  // ---------------------------------------------------------------------
  function cuadro(ahora) {
    if (jugando) {
      const d = Math.min(0.05, (ahora - ultimo) / 1000) * velocidad;
      t = Math.min(ESC.duracion, t + d);
      if (t >= ESC.duracion) jugando = false;
      todo();
    }
    ultimo = ahora;
    requestAnimationFrame(cuadro);
  }
  function alternar() { if (t >= ESC.duracion) t = 0; jugando = !jugando; todo(); }
  const pasoCuadro = () => (SIM ? SIM.dt * SIM.cada : ESC.duracion / 600);
  const irA = nt => { jugando = false; t = Math.max(0, Math.min(ESC.duracion, nt)); todo(); };
  $('#b-play').addEventListener('click', alternar);
  $('#b-reiniciar').addEventListener('click', () => irA(0));
  $('#b-atras').addEventListener('click', () => irA(t - pasoCuadro()));
  $('#b-adelante').addEventListener('click', () => irA(t + pasoCuadro()));
  $('#velocidades').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) velocidad = parseFloat(b.dataset.v); });
  function ponerCapa(k, on) { ESC.capas[k] = on; document.querySelectorAll(`.capa-btn[data-capa="${k}"]`).forEach(b => b.setAttribute('aria-pressed', String(on))); }
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => { ponerCapa(b.dataset.capa, !ESC.capas[b.dataset.capa]); registrar(); dibujar(); }));
  $('#pest').addEventListener('click', () => setTimeout(todo, 0));

  // ---------------------------------------------------------------------
  // Paleta de objetos e instrumentos
  // ---------------------------------------------------------------------
  const CON_CLIC = ['pulso', 'oscilador', 'union', 'piston', 'sonda', 'regla'];
  function marcarHerramienta() {
    document.querySelectorAll('.herr').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.herr === herramienta)));
    lienzo.style.cursor = herramienta ? 'crosshair' : 'default';
  }
  function ponerHerramienta(h) {
    if (h === 'cuerda' || h === 'tubo') { herramienta = null; marcarHerramienta(); convertirMedio(h); return; }
    if (h === 'analitica') { ESC.analitica = !ESC.analitica; registrar(); todo(); avisar(ESC.analitica ? (analitica() ? 'Onda analítica superpuesta' : 'No hay solución analítica para esta escena') : 'Sin onda analítica', false); return; }
    if (h === 'espectro' || h === 'frecuencimetro') {
      const tipo = h === 'espectro' ? 'espectro' : 'respuesta';
      if (tipo === 'respuesta' && !configRespuesta()) {
        if (!ESC.respuesta && ESC.izq.fuente && ESC.izq.fuente.forma === 'senoidal') ESC.respuesta = { eje: 'f', min: Math.max(0.1, ESC.izq.fuente.f / 10), max: ESC.izq.fuente.f * 3 };
        if (!configRespuesta()) { avisar('La curva de respuesta necesita un medio uniforme con fuente senoidal en el extremo izquierdo', false); return; }
      }
      ESC.graficas[2] = ESC.graficas[2] === tipo ? (esTubo() ? 'xt' : 'xt') : tipo;
      registrar(); const b = document.querySelector('#pest [aria-controls="p-graficas"]'); if (b) b.click(); else todo();
      return;
    }
    herramienta = herramienta === h ? null : h; marcarHerramienta();
    const msj = { pulso: 'Pulso: clic en el medio para lanzarlo hacia la derecha · Mayús: hacia la izquierda', oscilador: 'Oscilador: clic cerca de un extremo', union: 'Unión: clic donde empieza el segundo tramo', piston: 'Pistón: clic donde se cierra el tubo', sonda: 'Sonda: clic en el medio para colocarla', regla: 'Regla: arrastra entre dos puntos' }[herramienta];
    if (msj) avisar(`${msj} · Esc termina`, false);
  }
  document.querySelectorAll('.herr').forEach(b => b.addEventListener('click', () => ponerHerramienta(b.dataset.herr)));

  function usarHerramienta(x, ev) {
    const xa = X0(), xb = X1(), dentro = Math.max(xa, Math.min(xb, x)), L = L_TOTAL();
    if (herramienta === 'sonda') {
      if (ESC.sondas.length >= 2) ESC.sondas[1] = dentro; else ESC.sondas.push(dentro);
      sel = 'sonda:' + (ESC.sondas.length - 1); cambio(); avisar(`Sonda en x = ${cantidad(dentro, 'm', 4)}`);
    } else if (herramienta === 'pulso') {
      if (esTubo()) { avisar('En un tubo, usa un altavoz en un extremo', false); return; }
      const prev = ESC.inicial && ESC.inicial.forma === 'gauss' ? ESC.inicial : null;
      ESC.inicial = { forma: 'gauss', A: prev ? prev.A : 0.05 * L, centro: dentro, ancho: prev ? prev.ancho : 0.03 * L, sentido: ev.shiftKey ? -1 : 1 };
      sel = 'inicial'; t = 0; cambio(); avisar(`Pulso en x = ${cantidad(dentro, 'm', 3)} hacia ${ev.shiftKey ? '−x' : '+x'}`);
    } else if (herramienta === 'oscilador') {
      const lado = x - xa < xb - x ? 'izq' : 'der';
      if (!ESC[lado].fuente) cambiarFuente(lado, 'senoidal');
      sel = lado; inspector(); todo();
    } else if (herramienta === 'union') {
      const i = tramoIndiceEn(dentro); let a = xa; for (let k = 0; k < i; k++) a += ESC.tramos[k].L;
      const u = dentro - a, tr = ESC.tramos[i];
      if (u < 0.02 * L || tr.L - u < 0.02 * L || ESC.tramos.length >= 6) { avisar('La unión tiene que quedar dentro de un tramo', false); return; }
      const nuevo = { ...tr, L: tr.L - u };
      if (ESC.medio === 'cuerda') nuevo.mu = tr.mu * 4; else if (ESC.medio === 'tubo') nuevo.v = tr.v / 2; else nuevo.h = tr.h / 4;
      tr.L = u; ESC.tramos.splice(i + 1, 0, nuevo); desplazarRutas(i + 1, 1);
      sel = 'tramo:' + (i + 1); cambio(); avisar(`Unión en x = ${cantidad(dentro, 'm', 3)}: el segundo tramo es ${ESC.medio === 'cuerda' ? 'cuatro veces más denso' : 'el doble de lento'}`);
    } else if (herramienta === 'piston') {
      if (!esTubo()) { avisar('El pistón cierra un tubo: convierte el medio en tubo primero', false); return; }
      const nuevoL = dentro - xa; if (nuevoL < 0.02) return;
      const resto = nuevoL - (L - ESC.tramos[ESC.tramos.length - 1].L);
      if (resto <= 0.005) { avisar('El pistón tiene que quedar en el último tramo', false); return; }
      ESC.tramos[ESC.tramos.length - 1].L = resto; ESC.der.tipo = 'cerrado'; ESC.piston = true;
      ESC.sondas = ESC.sondas.map(s => Math.min(s, xa + nuevoL)); if (ESC.regla) ESC.regla = ESC.regla.map(s => Math.min(s, xa + nuevoL));
      sincronizarVariables(`tramos.${ESC.tramos.length - 1}.L`);
      sel = 'der'; cambio(); avisar(`Pistón en x = ${cantidad(xa + nuevoL, 'm', 3)}`);
    }
    if (!ev.shiftKey || herramienta === 'pulso') { herramienta = null; marcarHerramienta(); }
  }

  // ---------------------------------------------------------------------
  // Lienzo: selección, arrastre de sondas y regla, zoom y paneo
  // ---------------------------------------------------------------------
  function objetoEn(X, Y) {
    const v = tz.vista, y = SIM ? estadoMedio(SIM, t) : null, Y0 = v.Y(0);
    for (let k = ESC.sondas.length - 1; k >= 0; k--) if (Math.abs(X - v.X(ESC.sondas[k])) < 7) return 'sonda:' + k;
    if (ESC.regla) {
      const Yr = rielRegla();
      for (const j of [0, 1]) if (Math.hypot(X - v.X(ESC.regla[j]), Y - Yr) < 9) return 'regla:' + j;
      if (Math.abs(Y - Yr) < 8 && X > v.X(Math.min(...ESC.regla)) && X < v.X(Math.max(...ESC.regla))) return 'regla';
    }
    for (const [lado, x] of [['izq', X0()], ['der', X1()]]) if (Math.abs(X - v.X(x)) < 14 && Math.abs(Y - Y0) < 60) return lado;
    if (y && X >= v.X(X0()) && X <= v.X(X1())) {
      const x = v.mx(X), cerca = esTubo() ? Math.abs(Y - Y0) < altoTubo() : Math.abs(Y - v.Y(valorY(y, x))) < 10;
      if (ESC.inicial && frentesEn(SIM, t).some(f => Math.abs(v.X(f.x) - X) < 12) && cerca) return 'inicial';
      if (cerca) return 'tramo:' + tramoIndiceEn(x);
    }
    return null;
  }
  // Ordenada de pantalla de la regla (la misma que usa dibujarRegla)
  function rielRegla() {
    const v = tz.vista, Y0 = v.Y(0), amp = D.ymax * v.escalaY;
    if (esTubo()) return Y0 - altoTubo() - (ESC.puntos.length ? 66 : 30);
    return Math.max(56, Y0 - amp * 1.35 - 28) - 22;
  }
  lienzo.addEventListener('pointerdown', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top;
    if (ev.button === 1 || ev.button === 2 || espacioPulsado) { paneo = [X, Y, tz.vista.ox, tz.vista.oy]; lienzo.setPointerCapture(ev.pointerId); return; }
    if (herramienta === 'regla') { const x = tz.vista.mx(X); arrastre = { tipo: 'regla-nueva', x0: x }; ESC.regla = [x, x]; lienzo.setPointerCapture(ev.pointerId); return; }
    if (herramienta && CON_CLIC.includes(herramienta)) { usarHerramienta(tz.vista.mx(X), ev); return; }
    const ob = objetoEn(X, Y);
    if (ob && ob.startsWith('sonda:')) { arrastre = { tipo: 'sonda', k: +ob.slice(6), movido: false }; if (sel !== ob) seleccionar(ob); lienzo.setPointerCapture(ev.pointerId); return; }
    if (ob && ob.startsWith('regla')) { arrastre = { tipo: ob, X, r0: ESC.regla.slice(), movido: false }; if (sel !== 'regla') seleccionar('regla'); lienzo.setPointerCapture(ev.pointerId); return; }
    if (ob) { seleccionar(ob); return; }
    seleccionar('medio');
    paneo = [X, Y, tz.vista.ox, tz.vista.oy]; lienzo.setPointerCapture(ev.pointerId);
  });
  const acotar = x => Math.max(X0(), Math.min(X1(), x));
  lienzo.addEventListener('pointermove', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, v = tz.vista;
    cursorX = v.mx(X);
    $('#cx').textContent = cantidad(cursorX, 'm', 4);
    if (SIM) {
      const [uy, fy] = D.uy;
      if (esTubo()) { const y = estadoMedio(SIM, t), p = esfuerzoMedio(SIM, y); $('#cy').textContent = cursorX >= SIM.x[0] && cursorX <= SIM.x[SIM.N] ? valorCon(valorY(p, cursorX) / ESC.S, 'Pa', 4) : '—'; }
      else $('#cy').textContent = cantidad(v.my(Y) * fy, uy, 4);
    }
    if (paneo) { vistaTocada = true; v.ox = paneo[2] + X - paneo[0]; v.oy = paneo[3] + Y - paneo[1]; dibujar(); return; }
    if (arrastre) {
      const x = acotar(v.mx(X)), fino = ev.shiftKey ? 1e-3 : 1e-2 * Math.pow(10, Math.floor(Math.log10(L_TOTAL())));
      const red = u => Math.round(u / fino) * fino;
      if (arrastre.tipo === 'sonda') { ESC.sondas[arrastre.k] = acotar(red(x)); arrastre.movido = true; }
      else if (arrastre.tipo === 'regla-nueva') ESC.regla = [acotar(red(arrastre.x0)), acotar(red(x))];
      else if (arrastre.tipo === 'regla:0' || arrastre.tipo === 'regla:1') { ESC.regla[+arrastre.tipo.slice(6)] = acotar(red(x)); arrastre.movido = true; }
      else if (arrastre.tipo === 'regla') {
        const d = (X - arrastre.X) / v.escala, a = arrastre.r0.map(u => u + d);
        if (Math.min(...a) >= X0() && Math.max(...a) <= X1()) ESC.regla = a.map(red);
        arrastre.movido = true;
      }
      D.espectro = null; todo(); return;
    }
    if (herramienta) return;
    const ob = objetoEn(X, Y);
    const h = ob && ob.startsWith('regla') ? 'regla' : ob && ob.startsWith('tramo:') ? 'medio' : ob;
    lienzo.style.cursor = ob ? (ob.startsWith('sonda') || ob.startsWith('regla') ? 'ew-resize' : 'pointer') : 'default';
    if (h !== hover) { hover = h; dibujar(); }
  });
  lienzo.addEventListener('pointerup', () => {
    if (arrastre) {
      const a = arrastre; arrastre = null;
      if (a.tipo === 'regla-nueva') {
        if (Math.abs(ESC.regla[1] - ESC.regla[0]) < 1e-9) ESC.regla = null;
        herramienta = null; marcarHerramienta(); sel = ESC.regla ? 'regla' : 'medio'; cambio();
      } else if (a.movido) { cambio(); }
    }
    paneo = null;
  });
  lienzo.addEventListener('pointerleave', () => { cursorX = null; if (hover) { hover = null; dibujar(); } });
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
  // Menú de escenas
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
  document.addEventListener('pointerdown', ev => { if (!ev.target.closest('#menu-escenas, #b-escenas')) $('#menu-escenas').hidden = true; });

  // ---------------------------------------------------------------------
  // Teclado y paleta de comandos
  // ---------------------------------------------------------------------
  const alternarCapa = k => { ponerCapa(k, !ESC.capas[k]); registrar(); dibujar(); };
  const COMANDOS = [
    ['i-reproducir', 'Reproducir o pausar', 'Espacio', alternar],
    ['i-reiniciar', 'Reiniciar la simulación', 'Inicio', () => irA(0)],
    ['i-encuadrar', 'Encuadrar todo', 'F', encuadrarTodo],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['i-capas', 'Mostrar u ocultar las componentes incidente y reflejada', 'C', () => alternarCapa('componentes')],
    ['i-capas', 'Mostrar u ocultar la envolvente', 'E', () => alternarCapa('envolvente')],
    ['i-capas', 'Mostrar u ocultar los nodos y antinodos', 'N', () => alternarCapa('nodos')],
    ['o-onda-analitica', 'Superponer la onda analítica', 'O', () => ponerHerramienta('analitica')],
    ['n-microfono', 'Colocar una sonda', 'S', () => ponerHerramienta('sonda')],
    ['n-regla', 'Medir con la regla', 'R', () => ponerHerramienta('regla')],
    ['n-espectro', 'Analizador de espectro', '', () => ponerHerramienta('espectro')],
    ['n-frecuencimetro', 'Curva de respuesta (barrido)', '', () => ponerHerramienta('frecuencimetro')],
    ['o-pulso', 'Lanzar un pulso', 'P', () => ponerHerramienta('pulso')],
    ['o-union-medios', 'Añadir una unión entre medios', 'U', () => ponerHerramienta('union')],
    ['i-historial', 'Restablecer la escena original', '', () => { if (ESCENAS.some(e => e.clave === ESC.clave)) { abrirEscena1(ESC.clave); avisar('Escena original restablecida', false); } }],
    ['i-deshacer', 'Deshacer', 'Ctrl Z', deshacer],
    ['i-rehacer', 'Rehacer', 'Ctrl Y', rehacer],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar],
    ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
    ['i-exportar', 'Exportar datos a CSV', '', exportarCSV],
    ['i-tabla', 'Exportar la instantánea y(x) a CSV', '', exportarInstantanea],
    ['i-imagen', 'Exportar imagen del lienzo', '', exportarPNG],
    ...ESCENAS.map(e => [ICONO_TIPO[e.tipo], `Abrir escena: ${e.titulo}`, e.tipo === 'MEXT' ? `MEXT ${e.anio}` : e.tipo, () => abrirEscena1(e.clave), 'Escenas']),
  ];
  let selCmd = 0;
  function pintarComandos() {
    const q = $('#cmd-q').value.trim().toLowerCase();
    const lista = COMANDOS.filter(c => c[1].toLowerCase().includes(q));
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
    if (mod) return;
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) alternar(); espacioPulsado = true; }
    else if (ev.key === 'ArrowRight') irA(t + pasoCuadro());
    else if (ev.key === 'ArrowLeft') irA(t - pasoCuadro());
    else if (ev.key === 'Home') irA(0);
    else if (ev.key === 'Escape') { if (herramienta) { herramienta = null; marcarHerramienta(); } $('#menu-escenas').hidden = true; }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') quitarSeleccion();
    else if (tecla === 'f') encuadrarTodo();
    else if (tecla === 'c') alternarCapa('componentes');
    else if (tecla === 'e') alternarCapa('envolvente');
    else if (tecla === 'n') alternarCapa('nodos');
    else if (tecla === 'o') ponerHerramienta('analitica');
    else if (tecla === 's') ponerHerramienta('sonda');
    else if (tecla === 'r') ponerHerramienta('regla');
    else if (tecla === 'p') ponerHerramienta('pulso');
    else if (tecla === 'u') ponerHerramienta('union');
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });

  // ---------------------------------------------------------------------
  // Arranque. Parámetros para capturas: ?escena=union&t=0.6&pest=energia&sel=izq&capas=nodos
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); D.xt = null; todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); if (!vistaTocada && SIM) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } if (SIM) todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search);
    const limpio = ![...q.keys()].length;
    const previa = escenaPendiente('ondas') || (limpio ? autoguardado.leer('ondas', { modulo: 'ondas' }) : null);
    tz.ajustar();
    if (q.has('escena') || !previa) { ESC = completa(escenaDe(q.get('escena') || 'pulso-fijo')); sel = ESC.sel || 'medio'; }
    else { ESC = datosSeguros(previa.datos); sel = 'medio'; }
    aplicarVariables();
    if (q.has('capas')) for (const k of q.get('capas').split(',')) if (k in ESC.capas) ESC.capas[k] = true;
    if (q.has('sel')) { const s = q.get('sel'); if (selValida(s)) sel = s; }
    autoguardar = limpio || !!previa;
    titulo(); construirVariables(); inspector();
    recalcular(); escala0 = tz.vista.escala; zoomTexto();
    if (q.has('t')) t = Math.max(0, Math.min(ESC.duracion, parseFloat(q.get('t')) || 0));
    if (q.has('fase')) t = Math.max(0, Math.min(1, parseFloat(q.get('fase')) || 0)) * ESC.duracion;
    const pe = q.get('pest'); if (pe) { const b = document.querySelector(`#pest [aria-controls="p-${pe}"]`); if (b) b.click(); }
    todo();
    historial = new Historial(instantanea()); botonesHistorial();
    requestAnimationFrame(a => { ultimo = a; requestAnimationFrame(cuadro); });
  });
})();
