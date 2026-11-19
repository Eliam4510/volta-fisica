/* ==========================================================================
   Volta · Ondas y sonido — espacio de trabajo "Cubeta de ondas"
   Ondas en 2D: fuentes puntuales y lineales, arreglos de fuentes, barreras,
   rendijas y zonas de otra rapidez (aguas someras, aire a otra
   temperatura). La física está en el motor puro sistema/motores/ondas2d.js
   (probado en pruebas/ondas2d.test.js): ecuación de onda en una malla por
   diferencias finitas con condición CFL, paredes rígidas y bordes
   absorbentes; y la superposición analítica de las fuentes puntuales para
   comparar y para dibujar al instante.
   Cálculo: la malla avanza por pasos dentro de requestAnimationFrame con un
   presupuesto de tiempo por cuadro (sin WebGL: Canvas 2D e ImageData); la
   película del motor guarda cuadros de la región visible, así que la línea
   de tiempo vuelve a cualquier instante ya calculado sin recalcular.
   El desplazamiento se pinta en escala de tinta (tablas de color hechas
   con los tokens --lienzo y --tinta mezclados en OKLab; ver ondasLut en
   sistema/lienzo/dominios/ondas.js).
   Parámetros de URL para capturas: ?escena=…&t=…&vista=onda|frentes|intensidad
   &pest=energia|eventos|tabla&sel=medio|punto|pantalla|regla|fuente:0&capas=nodales
   ========================================================================== */
import {
  crearCubeta, fasorAnalitico, campoAnalitico, lineasInterferencia, diferenciaCaminos, rapidezEn, segmentosRendija,
} from '../motores/ondas2d.js';
import { velocidadAguasSomeras } from '../motores/ondas.js';
import { aCSV } from '../nucleo/csv.js';
import { descargarTexto, descargarLienzo, nombreArchivo, avisar as avisarLienzo } from '../componentes/exportar.js';
import { crearEscena, numero, texto } from '../nucleo/escena.js';
import { Historial } from '../nucleo/historial.js';
import { evaluar } from '../nucleo/unidades.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';

(function () {
  'use strict';
  const { Trazo, fmt, cantidad, grafica, LineaTiempo, pasoAgradable } = Volta;
  const $ = s => document.querySelector(s);
  const DOS_PI = 2 * Math.PI, GRADO = Math.PI / 180;
  const subs = n => String(n).replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[+d]);
  const simHTML = (a, sub, recto = true) => `<span class="sim">${a}${sub ? `<sub${recto ? ' class="r"' : ''}>${sub}</sub>` : ''}</span>`;
  const numCampo = x => String(Number(Number(x).toPrecision(6))).replace('-', '−');

  // ---------------------------------------------------------------------
  // Unidades de pantalla
  // ---------------------------------------------------------------------
  const FAC = { m: 1, cm: 1e-2, mm: 1e-3, 'µm': 1e-6, nm: 1e-9, s: 1, ms: 1e-3, Hz: 1, 'm/s': 1, '°': GRADO };
  // Longitud SI → [número, unidad con prefijo]
  function enLargo(v) {
    const a = Math.abs(v), u = !(a > 0) || a >= 1 ? 'm' : a >= 0.01 ? 'cm' : a >= 1e-3 ? 'mm' : a >= 1e-6 ? 'µm' : 'nm';
    return [v / FAC[u], u];
  }
  const largo = (v, c = 4) => { const [x, u] = enLargo(v); return cantidad(x, u, c); };

  // ---------------------------------------------------------------------
  // Escenas. Posiciones en m; f en Hz; A en m (amplitud a una longitud de
  // onda de una fuente puntual, o de la onda plana de una fuente lineal);
  // fases y ángulos en rad; ul: unidad de los campos de longitud; ua: de la
  // amplitud. Variables: valor en su unidad, factor a SI y rutas que fija
  // (una ruta puede llevar su propio factor: [ruta, k]).
  // ---------------------------------------------------------------------
  const G0 = 9.80665;
  const BASE = () => ({
    medio: 'agua', ul: 'cm', ua: 'mm', caja: { x0: -0.2, x1: 0.2, y0: -0.15, y1: 0.15 }, rapidez: 0.3,
    bordes: { izq: 'absorbente', der: 'absorbente', abajo: 'absorbente', arriba: 'absorbente' },
    fuentes: [], lineas: [], barreras: [], rendijas: [], zonas: [], marcas: [],
    P: null, nombreP: 'P', regla: null, pantalla: null,
    duracion: 4, ppl: 14, vista: 'onda', mapa: 'tinta', modelo: 'malla', contraste: 1,
    capas: { nodales: false, valores: true }, variables: {}, velocidad: 0.5,
  });
  const vari = (sim, val, min, max, paso, u, factor, liga, sub) => ({ sim, sub, val, min, max, paso, u, factor, liga });
  const fp = (nombre, x, y, f, A, fase = 0) => ({ nombre, p: [x, y], f, A, fase });
  const VAGUA = h => Number(velocidadAguasSomeras(h, G0).toPrecision(4));
  // Vidrio de 2010 3-A: orilla inclinada 30° (cm → m)
  const vidrio = (() => { const m = Math.tan(30 * GRADO), y0 = -0.02; return [[-0.35, y0 - 0.35 * m], [0.35, y0 + 0.35 * m], [0.35, -0.35], [-0.35, -0.35]]; })();
  const ESCENAS = [
    {
      clave: 'una-fuente', titulo: 'Una fuente puntual: frentes circulares', tipo: 'Tutorial',
      rapidez: 0.3, fuentes: [fp('S', -0.1, 0, 6, 0.001)], P: [0.06, 0], regla: [[0.0, -0.07], [0.05, -0.07]], pantalla: [[-0.08, 0.04], [0.19, 0.04]],
      duracion: 4, velocidad: 0.25,
      variables: { f: vari('f', 6, 2, 12, 0.5, 'Hz', 1, ['fuentes.0.f']), v: vari('v', 30, 10, 50, 1, 'cm/s', 0.01, ['rapidez']) },
    },
    {
      clave: 'dos-fuentes', titulo: 'Dos fuentes en fase: interferencia', tipo: 'Tutorial',
      rapidez: 0.3, caja: { x0: -0.2, x1: 0.2, y0: -0.13, y1: 0.15 }, fuentes: [fp('S₁', -0.0625, -0.1, 6, 0.001), fp('S₂', 0.0625, -0.1, 6, 0.001)],
      P: [0.0875, 0.0565], pantalla: [[-0.19, 0.11], [0.19, 0.11]], duracion: 5, velocidad: 0.25, capas: { nodales: true, valores: true },
      variables: { d: vari('d', 12.5, 2, 25, 0.5, 'cm', 0.01, [['fuentes.0.p.0', -0.5], ['fuentes.1.p.0', 0.5]]), f: vari('f', 6, 2, 12, 0.5, 'Hz', 1, ['fuentes.0.f', 'fuentes.1.f']) },
    },
    {
      clave: 'rendija', titulo: 'Difracción en una rendija', tipo: 'Ejemplo',
      rapidez: 0.3, caja: { x0: -0.2, x1: 0.25, y0: -0.16, y1: 0.16 }, lineas: [{ nombre: 'Generador', a: [-0.17, -0.4], b: [-0.17, 0.4], f: 6, A: 0.001, fase: 0, desvio: 0 }],
      rendijas: [{ nombre: 'Rendija', centro: [-0.08, 0], angulo: Math.PI / 2, ancho: 0.05, n: 1, separacion: 0.1, grosor: 0.008 }],
      pantalla: [[0.2, -0.15], [0.2, 0.15]], P: [0.12, 0.08], duracion: 5, velocidad: 0.25, contraste: 2,
      variables: { a: vari('a', 5, 1, 20, 0.5, 'cm', 0.01, ['rendijas.0.ancho']), f: vari('f', 6, 2, 12, 0.5, 'Hz', 1, ['lineas.0.f']) },
    },
    {
      clave: 'doble-rendija', titulo: 'Doble rendija en la cubeta', tipo: 'Ejemplo',
      rapidez: 0.3, caja: { x0: -0.2, x1: 0.25, y0: -0.18, y1: 0.18 }, lineas: [{ nombre: 'Generador', a: [-0.17, -0.45], b: [-0.17, 0.45], f: 6, A: 0.001, fase: 0, desvio: 0 }],
      rendijas: [{ nombre: 'Rendijas', centro: [-0.1, 0], angulo: Math.PI / 2, ancho: 0.02, n: 2, separacion: 0.1, grosor: 0.008 }],
      pantalla: [[0.21, -0.17], [0.21, 0.17]], P: [0.21, 0], duracion: 6, velocidad: 0.25, contraste: 2, capas: { nodales: true, valores: true },
      variables: { d: vari('d', 10, 3, 20, 0.5, 'cm', 0.01, ['rendijas.0.separacion']), a: vari('a', 2, 0.5, 5, 0.1, 'cm', 0.01, ['rendijas.0.ancho']) },
    },
    {
      clave: 'aguas-someras', titulo: 'Refracción en aguas someras', tipo: 'Ejemplo',
      rapidez: VAGUA(0.02), lineas: [{ nombre: 'Generador', a: [-0.35, 0.14], b: [0.35, 0.14], f: 8, A: 0.001, fase: 0, desvio: 0 }],
      zonas: [{ nombre: 'Agua somera', forma: 'poligono', puntos: vidrio, rapidez: VAGUA(0.008) }],
      P: [0.03, -0.1], regla: [[0.17, -0.13], [0.17, -0.095]], pantalla: [[-0.05, 0.12], [-0.05, -0.14]], duracion: 3, velocidad: 0.25, vista: 'frentes',
      variables: { v2: vari('v', 28, 10, 44, 0.5, 'cm/s', 0.01, ['zonas.0.rapidez'], '2') },
    },
    {
      clave: 'arreglo', titulo: 'Onda plana de un arreglo de fuentes', tipo: 'Ejemplo',
      rapidez: 0.3, fuentes: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => fp(`S${subs(k + 1)}`, -0.14, -0.08 + 0.02 * k, 6, 0.0006)),
      pantalla: [[0.15, -0.14], [0.15, 0.14]], duracion: 4, velocidad: 0.25,
      variables: { dphi: vari('Δφ', 0, -90, 90, 5, '°', GRADO, [0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => [`fuentes.${k}.fase`, k])) },
    },
    {
      clave: 'reflexion', titulo: 'Reflexión en una pared: fuente imagen', tipo: 'Ejemplo',
      rapidez: 0.3, fuentes: [{ ...fp('S', -0.06, 0.03, 6, 0.002), forma: 'ondicula' }], barreras: [{ nombre: 'Pared', a: [-0.3, -0.06], b: [0.3, -0.06], grosor: 0.01 }],
      P: [0.09, 0.07], pantalla: [[0.185, -0.045], [0.185, 0.14]], marcas: [{ nombre: 'S′', p: [-0.06, -0.14] }], duracion: 1.4, velocidad: 0.1,
    },
    {
      clave: 'mext-2017-5', titulo: 'Dos altavoces en fase', tipo: 'MEXT', anio: '2017 P5', medio: 'aire', ul: 'm', ua: 'µm',
      rapidez: 340, caja: { x0: -8, x1: 12, y0: -2.5, y1: 10.5 }, fuentes: [fp('A', -3, 0, 85, 1e-6), fp('B', 3, 0, 85, 1e-6)],
      P: [3, 8], nombreP: 'X', pantalla: [[-7, 8], [11, 8]], marcas: [{ nombre: 'O', p: [0, 8] }, { nombre: 'P', p: [-7, 8] }, { nombre: 'Q', p: [11, 8] }],
      duracion: 0.2, velocidad: 0.02, capas: { nodales: true, valores: true },
      variables: { f: vari('f', 85, 40, 300, 1, 'Hz', 1, ['fuentes.0.f', 'fuentes.1.f']), v: vari('v', 340, 300, 380, 1, 'm/s', 1, ['rapidez']) },
    },
    {
      clave: 'mext-2007-1-4', titulo: 'Dos fuentes en fase y el punto A', tipo: 'MEXT', anio: '2007 1-(4)',
      rapidez: 0.24, caja: { x0: -0.12, x1: 0.26, y0: -0.1, y1: 0.24 }, fuentes: [fp('S₁', 0, 0, 3, 0.001), fp('S₂', 0.12, 0, 3, 0.001)],
      P: [0.12, 0.16], nombreP: 'A', regla: [[0.12, 0], [0.12, 0.16]], pantalla: [[-0.11, 0.16], [0.25, 0.16]], duracion: 8, velocidad: 0.5, capas: { nodales: true, valores: true },
      variables: { f: vari('f', 3, 1, 6, 0.1, 'Hz', 1, ['fuentes.0.f', 'fuentes.1.f']) },
    },
    {
      clave: 'mext-2010-3-a', titulo: 'Ondas planas sobre un vidrio', tipo: 'MEXT', anio: '2010 3-A',
      rapidez: VAGUA(0.02), lineas: [{ nombre: 'Generador', a: [-0.35, 0.14], b: [0.35, 0.14], f: 8, A: 0.001, fase: 0, desvio: 0 }],
      zonas: [{ nombre: 'Sobre el vidrio', forma: 'poligono', puntos: vidrio, rapidez: VAGUA(0.008) }],
      P: [0.03, -0.1], regla: [[0.17, -0.13], [0.17, -0.095]], pantalla: [[-0.05, 0.12], [-0.05, -0.14]], duracion: 3, velocidad: 0.25, vista: 'frentes',
    },
    {
      clave: 'mext-2010-3-b', titulo: 'Sonido en una noche fría', tipo: 'MEXT', anio: '2010 3-B', medio: 'aire', ul: 'm', ua: 'µm',
      rapidez: 340, caja: { x0: 0, x1: 120, y0: 0, y1: 40 }, bordes: { izq: 'absorbente', der: 'absorbente', abajo: 'reflectante', arriba: 'absorbente' },
      zonas: [{ nombre: 'Aire (gradiente exagerado)', forma: 'rect', x0: -1000, x1: 1000, y0: 0, y1: 40, rapidez: 340, rapidez1: 420 }],
      fuentes: [fp('S', 5, 2, 68, 1e-6)], P: [100, 1], pantalla: [[10, 1], [118, 1]], ppl: 10, duracion: 0.6, velocidad: 0.05,
      variables: { vh: vari('v', 420, 280, 440, 5, 'm/s', 1, ['zonas.0.rapidez1'], 'h') },
    },
  ];
  const completa = e => {
    const b = BASE(), o = JSON.parse(JSON.stringify({ ...b, ...e, capas: { ...b.capas, ...(e.capas || {}) }, bordes: { ...b.bordes, ...(e.bordes || {}) } }));
    return o;
  };
  const escenaDe = clave => ESCENAS.find(e => e.clave === clave) || ESCENAS[0];

  // ---------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------
  /** @type {any} */ let ESC = completa(ESCENAS[0]);
  /** @type {any} */ let SIM = null;
  let ERROR = null, pendiente = null;
  /** @type {any} */ let D = {};
  let t = 0, jugando = false, velocidad = 0.5, ultimo = 0;
  let sel = 'medio', herramienta = null, vistaTocada = false, escala0 = 1, espacioPulsado = false;
  let arrastre = null, paneo = null, trazoNuevo = null, autoguardar = false, historial = null;
  let rendimiento = { pasos: 0, ms: 0 };
  const lienzo = $('#lienzo'), area = $('#area'), tz = new Trazo(lienzo);

  // ---------------------------------------------------------------------
  // Escena → motor
  // ---------------------------------------------------------------------
  const fuentesMotor = () => ESC.fuentes.map(f => ({ p: f.p, forma: f.forma || 'senoidal', frecuencia: f.f, amplitud: f.A, fase: f.fase || 0, inicio: 0 }));
  function escenaMotor() {
    return {
      caja: ESC.caja, rapidez: ESC.rapidez, bordes: ESC.bordes, puntosPorLambda: ESC.ppl, maxNodos: 260000,
      fuentes: fuentesMotor(),
      lineas: ESC.lineas.map(l => ({ a: l.a, b: l.b, frecuencia: l.f, amplitud: l.A, fase: l.fase || 0, desvio: l.desvio || 0, inicio: 0 })),
      barreras: ESC.barreras.map(b => ({ a: b.a, b: b.b, grosor: b.grosor })),
      rendijas: ESC.rendijas.map(r => ({ centro: r.centro, angulo: r.angulo, ancho: r.ancho, n: r.n, separacion: r.separacion, grosor: r.grosor })),
      zonas: ESC.zonas.map(z => ({ ...z })),
    };
  }
  const frecuencias = () => [...ESC.fuentes.map(f => f.f), ...ESC.lineas.map(l => l.f)].filter(f => f > 0);
  const fRef = () => (frecuencias()[0] || 1);
  const lambdaRef = () => ESC.rapidez / fRef();
  const periodoMax = () => 1 / Math.min(...(frecuencias().length ? frecuencias() : [1]));
  // ¿Vale el modelo analítico? Solo fuentes puntuales en un medio uniforme sin paredes
  const analiticoValido = () => ESC.fuentes.length > 0 && ESC.fuentes.every(f => (f.forma || 'senoidal') === 'senoidal') && !ESC.lineas.length && !ESC.barreras.length && !ESC.rendijas.length && !ESC.zonas.length;
  const usarAnalitico = () => ESC.modelo === 'analitico';

  // Escala del color: amplitud típica a un tercio del tamaño de la cubeta
  function escalaCampo() {
    const L = Math.hypot(ESC.caja.x1 - ESC.caja.x0, ESC.caja.y1 - ESC.caja.y0);
    let s = 0;
    for (const f of ESC.fuentes) s += Math.abs(f.A) * Math.sqrt((ESC.rapidez / f.f) / Math.max(L / 3, ESC.rapidez / f.f));
    for (const l of ESC.lineas) s = Math.max(s, Math.abs(l.A) * 1.4);
    if (ESC.fuentes.length > 2) s /= Math.sqrt(ESC.fuentes.length / 2);
    return (s || 1e-3) / (ESC.contraste || 1);
  }

  function construir() {
    ERROR = null; SIM = null; D = { tCampo: null };
    try {
      if (!frecuencias().length) throw new Error('Coloca una fuente para que haya ondas.');
      const escala = escalaCampo();
      SIM = crearCubeta(escenaMotor(), { pelicula: { intervalo: Math.min(...frecuencias().map(f => 1 / f)) / 16, escala: 6 * escala, maxBytes: 80e6 } });
      D.escala = escala;
    } catch (e) { ERROR = e.message; D.escala = escalaCampo(); }
    rendimiento = { pasos: 0, ms: 0 };
  }

  // Avanza la malla hacia tObjetivo sin pasar del presupuesto de tiempo del cuadro
  function avanzarSim(tObjetivo, presupuesto = 12) {
    if (!SIM) return;
    const t0 = performance.now(), fin = Math.min(tObjetivo, ESC.duracion);
    let n = 0;
    while (SIM.t + SIM.dt / 2 <= fin) {
      SIM.paso(); n++;
      if ((n & 7) === 0 && performance.now() - t0 > presupuesto) break;
    }
    const ms = performance.now() - t0;
    if (n) { rendimiento.pasos = 0.8 * rendimiento.pasos + 0.2 * (n / Math.max(ms, 0.1) * 1000); rendimiento.ms = ms; }
  }
  const frontera = () => (usarAnalitico() || !SIM ? ESC.duracion : SIM.t);

  // ---------------------------------------------------------------------
  // Campo en la ventana visible
  // ---------------------------------------------------------------------
  function ventana() {
    if (SIM) return SIM.ventana;
    if (D.vent) return D.vent;
    const c = ESC.caja, h = Math.max((c.x1 - c.x0) / 240, lambdaRef() / 10);
    D.vent = { nx: Math.ceil((c.x1 - c.x0) / h) + 1, ny: Math.ceil((c.y1 - c.y0) / h) + 1, x0: c.x0, y0: c.y0, h };
    return D.vent;
  }
  // u en la ventana en tt y, para las crestas, un instante antes
  function campoEn(tt) {
    const V = ventana(), n = V.nx * V.ny;
    if (!D.u || D.u.length !== n) { D.u = new Float32Array(n); D.uPrev = new Float32Array(n); D.amp = new Float32Array(n); }
    if (D.tCampo === tt && D.modeloCampo === ESC.modelo) return D;
    if (usarAnalitico()) {
      const fu = fuentesMotor(), v = ESC.rapidez, dtt = 1 / fRef() / 40;
      for (let j = 0; j < V.ny; j++) for (let i = 0; i < V.nx; i++) {
        const x = V.x0 + i * V.h, y = V.y0 + j * V.h, k = j * V.nx + i;
        D.u[k] = campoAnalitico(fu, x, y, tt, v, { exacta: true });
        D.uPrev[k] = campoAnalitico(fu, x, y, tt - dtt, v, { exacta: true });
      }
    } else if (SIM) {
      if (Math.abs(tt - SIM.t) < SIM.dt / 2) { SIM.copiarVentana(D.u); SIM.copiarVentana(D.uPrev, true); }
      else { const P = SIM.pelicula; P.campo(tt, D.u); P.campo(Math.max(0, tt - P.K * SIM.dt), D.uPrev); }
    } else { D.u.fill(0); D.uPrev.fill(0); }
    D.tCampo = tt; D.modeloCampo = ESC.modelo; D.ampDe = null;
    return D;
  }
  // Amplitud (máx − mín)/2 del último periodo en cada nodo de la ventana
  function amplitudEn(tt) {
    campoEn(tt);
    if (D.ampDe === tt) return D.amp;
    const V = ventana();
    if (usarAnalitico()) {
      const fu = fuentesMotor(), v = ESC.rapidez;
      for (let j = 0; j < V.ny; j++) for (let i = 0; i < V.nx; i++) {
        const x = V.x0 + i * V.h, y = V.y0 + j * V.h;
        // Solo las fuentes cuyo frente ya pasó por el punto
        const vivas = fu.filter(f => Math.hypot(x - f.p[0], y - f.p[1]) <= v * tt);
        D.amp[j * V.nx + i] = vivas.length ? fasorAnalitico(vivas, x, y, v, { exacta: true }).amplitud : 0;
      }
    } else if (SIM) SIM.pelicula.amplitudCampo(tt, periodoMax(), D.amp);
    D.ampDe = tt;
    return D.amp;
  }
  // Valor bilineal de un campo de la ventana en (x, y)
  function enVentana(campo, x, y) {
    const V = ventana(), u = (x - V.x0) / V.h, w = (y - V.y0) / V.h;
    const i = Math.max(0, Math.min(V.nx - 2, Math.floor(u))), j = Math.max(0, Math.min(V.ny - 2, Math.floor(w)));
    const a = Math.max(0, Math.min(1, u - i)), b = Math.max(0, Math.min(1, w - j)), k = j * V.nx + i;
    return (1 - a) * (1 - b) * campo[k] + a * (1 - b) * campo[k + 1] + (1 - a) * b * campo[k + V.nx] + a * b * campo[k + V.nx + 1];
  }
  // Crestas: cruces por cero de u(t) − u(t − δ) (∂u/∂t = 0) donde u es positivo,
  // con cuadrados de marcha; segmentos en px de pantalla
  function crestas(u, up, umbral) {
    const V = ventana(), v = tz.vista, out = [];
    const X = i => v.X(V.x0 + i * V.h), Y = j => v.Y(V.y0 + j * V.h);
    for (let j = 0; j < V.ny - 1; j++) for (let i = 0; i < V.nx - 1; i++) {
      const k = j * V.nx + i, ks = [k, k + 1, k + 1 + V.nx, k + V.nx];
      const d = ks.map(q => u[q] - up[q]);
      if ((d[0] > 0 && d[1] > 0 && d[2] > 0 && d[3] > 0) || (d[0] <= 0 && d[1] <= 0 && d[2] <= 0 && d[3] <= 0)) continue;
      const esq = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], pts = [];
      for (let e = 0; e < 4; e++) {
        const a = e, b = (e + 1) % 4;
        if ((d[a] > 0) === (d[b] > 0)) continue;
        const s = d[a] / (d[a] - d[b]), uu = u[ks[a]] + s * (u[ks[b]] - u[ks[a]]);
        if (uu <= umbral) continue;
        pts.push([X(esq[a][0] + s * (esq[b][0] - esq[a][0])), Y(esq[a][1] + s * (esq[b][1] - esq[a][1]))]);
      }
      for (let q = 0; q + 1 < pts.length; q += 2) out.push(pts[q][0], pts[q][1], pts[q + 1][0], pts[q + 1][1]);
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // Interferencia: dos fuentes coherentes (las dos primeras fuentes puntuales
  // de la misma frecuencia, o las dos aberturas de una doble rendija)
  // ---------------------------------------------------------------------
  function parCoherente() {
    if (ESC.fuentes.length >= 2 && ESC.fuentes[0].f === ESC.fuentes[1].f) {
      const [a, b] = ESC.fuentes;
      return { s1: a.p, s2: b.p, n1: a.nombre, n2: b.nombre, f: a.f, desfase: (a.fase || 0) - (b.fase || 0) };
    }
    const r = ESC.rendijas.find(q => q.n === 2), L = ESC.lineas[0];
    if (r && L) {
      const t0 = [Math.cos(r.angulo), Math.sin(r.angulo)], d = r.separacion / 2;
      return { s1: [r.centro[0] - t0[0] * d, r.centro[1] - t0[1] * d], s2: [r.centro[0] + t0[0] * d, r.centro[1] + t0[1] * d], n1: 'R₁', n2: 'R₂', f: L.f, desfase: 0, rendija: true };
    }
    return null;
  }
  const fraccionLambda = d => {
    const m = Math.round(Math.abs(d) * 2) / 2, ent = Math.floor(m), medio = m - ent > 0.25;
    if (m === 0) return '0';
    return `${ent ? ent : ''}${medio ? '½' : ''}λ`.replace(/^1λ$/, 'λ');
  };

  // ---------------------------------------------------------------------
  // Lienzo
  // ---------------------------------------------------------------------
  function caja() { const c = ESC.caja, m = 0.02 * Math.max(c.x1 - c.x0, c.y1 - c.y0); return { x0: c.x0 - m, x1: c.x1 + m, y0: c.y0 - m, y1: c.y1 + m }; }
  function encuadrar() { tz.vista.encuadrar(caja(), { x: 0, y: 44, w: tz.w, h: tz.h - 92 }, 36); }

  function dibujar() {
    const v = tz.vista, c = ESC.caja;
    tz.limpiar(); tz.cuadricula();
    // 2 · Mapa del campo
    const V = ventana(), esc = D.escala || 1;
    if (!ERROR || usarAnalitico()) {
      const d = campoEn(t), cx = tz.ctx;
      cx.save(); cx.beginPath(); cx.rect(v.X(c.x0), v.Y(c.y1), (c.x1 - c.x0) * v.escala, (c.y1 - c.y0) * v.escala); cx.clip();
      if (ESC.vista === 'onda') tz.ondasCampo(d.u, V, ESC.mapa, esc);
      else if (ESC.vista === 'intensidad') tz.ondasCampo(amplitudEn(t), V, 'grises', 1.2 * esc);
      else tz.ondasCrestas(crestas(d.u, d.uPrev, 0.12 * esc));   // frentes: crestas como líneas sobre el papel
      cx.restore();
    }
    // Ningún número de los ejes debajo de un objeto o de su etiqueta
    const huecos = [...ESC.fuentes.map(f => [...v.P(f.p), 12]), ...(ESC.P ? [[...v.P(ESC.P), 14]] : [])];
    if (ESC.regla) {
      // Texto de la cota: a 14 + 12 px a la izquierda del sentido de la regla
      const [a, b] = ESC.regla.map(p => v.P(p)), L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
      const mx = (a[0] + b[0]) / 2 + n[0] * 26, my = (a[1] + b[1]) / 2 + n[1] * 26;
      for (const dx of [-60, -30, 0, 30, 60]) huecos.push([mx + dx, my, 14]);
    }
    if (ESC.P && ESC.capas.valores) { const r = fichaPunto(); if (r) for (let x = r.x; x <= r.x + r.w; x += 20) for (let y = r.y; y <= r.y + r.h; y += 16) huecos.push([x, y, 6]); }
    if (ESC.pantalla) huecos.push([...v.P(extremoPantalla()), 30]);
    for (const m of ESC.marcas) huecos.push([...v.P(m.p), 16]);
    const N = ESC.capas.nodales ? nodales() : null;
    if (N && ESC.capas.valores) for (const e of N.etiquetas) huecos.push([e.X, e.Y, 14]);
    tz.ejes({ x: 'x', y: 'y', ux: 'm', uy: 'm', huecos });
    tz.ondasCubeta(c, ESC.bordes);
    // 4 · Zonas de otra rapidez
    ESC.zonas.forEach((z, i) => {
      const pts = recortarPoligono(z.forma === 'poligono' ? z.puntos : [[z.x0, z.y0], [z.x1, z.y0], [z.x1, z.y1], [z.x0, z.y1]], c);
      if (pts.length < 3) return;
      tz.ondasZona(pts, { grueso: sel === 'zona:' + i });
      if (ESC.capas.valores) etiquetaZona(z, pts);
    });
    // 3 · Barreras y rendijas
    ESC.barreras.forEach((b, i) => { const [a, bb] = recorteSegmento(b.a, b.b); if (a) tz.ondasBarrera(a, bb, b.grosor, { grueso: sel === 'barrera:' + i }); });
    ESC.rendijas.forEach((r, i) => {
      for (const s of segmentosRendija(r, 3 * Math.hypot(c.x1 - c.x0, c.y1 - c.y0))) {
        const [a, b] = recorteSegmento(s.a, s.b); if (a) tz.ondasBarrera(a, b, r.grosor, { grueso: sel === 'rendija:' + i });
      }
    });
    // 5 · Construcción: líneas nodales y antinodales, regla
    if (N) dibujarNodales(N);
    if (ESC.regla) dibujarRegla();
    // 6 · Materia: fuentes
    ESC.lineas.forEach((l, i) => {
      const [a, b] = recorteSegmento(l.a, l.b); if (!a) return;
      tz.ondasFuenteLineal(a, b, { seleccionada: sel === 'linea:' + i, grueso: arrastre?.ob === 'linea:' + i });
    });
    ESC.fuentes.forEach((f, i) => {
      const [X, Y] = tz.ondasFuentePuntual(f.p, { seleccionada: sel === 'fuente:' + i });
      if (ESC.fuentes.length <= 4) tz.texto(f.nombre, X, Y - 15, { fuente: 'ui', tam: 12, peso: 500, color: 'texto', alinear: 'center', halo: true });
    });
    for (const m of ESC.marcas) {
      const [X, Y] = v.P(m.p);
      tz.lineaPx([[X - 4, Y], [X + 4, Y]], { color: 'texto-2', grosor: 1 }); tz.lineaPx([[X, Y - 4], [X, Y + 4]], { color: 'texto-2', grosor: 1 });
      // Debajo de la marca, salvo junto al borde inferior de la cubeta
      const arriba = v.Y(c.y0) - Y < 24;
      tz.texto(m.nombre, X + 6, arriba ? Y - 6 : Y + 16, { fuente: 'ui', tam: 12, peso: 500, color: 'texto-2', halo: true });
    }
    // 8 · Instrumentos
    if (ESC.pantalla) {
      tz.ondasPantalla(ESC.pantalla[0], ESC.pantalla[1], { seleccionada: sel === 'pantalla' });
      const [X, Y] = v.P(extremoPantalla());
      tz.texto('Pantalla', X - 4, Y - 9, { fuente: 'ui', tam: 11.5, peso: 500, color: 'texto-2', alinear: 'right', halo: true });
    }
    if (ESC.P) dibujarPunto();
    // Trazo en curso (regla, pantalla, barrera, línea, zona)
    if (trazoNuevo) {
      const { a, b, h } = trazoNuevo;
      if (h === 'zona') tz.linea([[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]], [a[0], a[1]]], { color: 'texto-2', grosor: 1, patron: 'previsto' });
      else tz.linea([a, b], { color: 'texto-2', grosor: 1.5, patron: 'previsto' });
    }
    tz.ondasBarraEscala(16, tz.h - 56);
    if (ERROR && !usarAnalitico()) tz.texto(ERROR, tz.w / 2, tz.h / 2, { fuente: 'ui', tam: 13, color: 'texto-2', alinear: 'center', halo: true });
    leyenda();
  }
  // Recorta un polígono (Sutherland–Hodgman) o un segmento a la cubeta: las
  // fuentes, paredes y zonas largas siguen dentro de la capa absorbente
  function recortarPoligono(pts, c) {
    const planos = [[p => p[0] >= c.x0, (a, b) => [c.x0, a[1] + (b[1] - a[1]) * (c.x0 - a[0]) / (b[0] - a[0])]],
      [p => p[0] <= c.x1, (a, b) => [c.x1, a[1] + (b[1] - a[1]) * (c.x1 - a[0]) / (b[0] - a[0])]],
      [p => p[1] >= c.y0, (a, b) => [a[0] + (b[0] - a[0]) * (c.y0 - a[1]) / (b[1] - a[1]), c.y0]],
      [p => p[1] <= c.y1, (a, b) => [a[0] + (b[0] - a[0]) * (c.y1 - a[1]) / (b[1] - a[1]), c.y1]]];
    let out = pts;
    for (const [dentro, corte] of planos) {
      const ent = out; out = [];
      for (let i = 0; i < ent.length; i++) {
        const a = ent[(i + ent.length - 1) % ent.length], b = ent[i];
        if (dentro(b)) { if (!dentro(a)) out.push(corte(a, b)); out.push(b); } else if (dentro(a)) out.push(corte(a, b));
      }
      if (!out.length) break;
    }
    return out;
  }
  function recorteSegmento(a, b) {
    // Liang–Barsky contra la caja
    const c = ESC.caja, dx = b[0] - a[0], dy = b[1] - a[1];
    let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, a[0] - c.x0], [dx, c.x1 - a[0]], [-dy, a[1] - c.y0], [dy, c.y1 - a[1]]]) {
      if (p === 0) { if (q < 0) return [null, null]; continue; }
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    }
    if (t0 > t1) return [null, null];
    return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
  }
  function etiquetaZona(z, pts) {
    const v = tz.vista, c = ESC.caja;
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let X = v.X(cx), Y = v.Y(cy);
    if (z.forma === 'rect' && z.rapidez1 != null) { X = v.X(Math.min(c.x1, z.x1)) - 12; Y = v.Y(Math.min(c.y1, z.y1)) + 22; }
    const val = z.rapidez1 != null ? `${fmt(z.rapidez, 3)} → ${fmt(z.rapidez1, 3)} m/s` : cantidad(z.rapidez, 'm/s', 3);
    tz.compuesto([{ t: 'v', f: 'sim', tam: 14, color: 'movimiento' }, { t: ' = ' + val, f: 'num', tam: 11.5, color: 'texto-2' }], X, Y, { alinear: z.rapidez1 != null ? 'right' : 'center' });
  }
  // Líneas nodales y antinodales de las dos fuentes coherentes, con la
  // etiqueta de |Δ| donde cada una sale de la cubeta (px de pantalla)
  function nodales() {
    const par = parCoherente(); if (!par) return null;
    const v = tz.vista, c = ESC.caja, lam = ESC.rapidez / par.f;
    const L = lineasInterferencia(par.s1, par.s2, lam, { desfase: par.desfase, caja: c, puntos: 220 });
    // Lado de la cubeta hacia el que se miran las franjas: el de la pantalla o de P; si no, +normal
    const ex = [par.s2[0] - par.s1[0], par.s2[1] - par.s1[1]], ey = [-ex[1], ex[0]], mid = [(par.s1[0] + par.s2[0]) / 2, (par.s1[1] + par.s2[1]) / 2];
    const ref = ESC.pantalla ? ESC.pantalla[0] : ESC.P || [mid[0] + ey[0], mid[1] + ey[1]];
    const lado = Math.sign((ref[0] - mid[0]) * ey[0] + (ref[1] - mid[1]) * ey[1]) || 1;
    const etiquetas = [];
    for (const l of L) {
      const pts = l.puntos.filter(p => ((p[0] - mid[0]) * ey[0] + (p[1] - mid[1]) * ey[1]) * lado > 0);
      pts.sort((p, q) => Math.hypot(p[0] - mid[0], p[1] - mid[1]) - Math.hypot(q[0] - mid[0], q[1] - mid[1]));
      let ult = null; for (const p of pts) { if (p[0] < c.x0 || p[0] > c.x1 || p[1] < c.y0 || p[1] > c.y1) break; ult = p; }
      if (!ult) continue;
      let [X, Y] = v.P(ult);
      X = Math.max(v.X(c.x0) + 14, Math.min(v.X(c.x1) - 14, X)); Y = Math.max(v.Y(c.y1) + 12, Math.min(v.Y(c.y0) - 10, Y));
      if (etiquetas.some(e => Math.abs(e.X - X) < 26 && Math.abs(e.Y - Y) < 14)) continue;
      etiquetas.push({ X, Y, txt: fraccionLambda(l.delta / lam), tipo: l.tipo });
    }
    // Detrás de una doble rendija no hay ondas de las aberturas: solo el lado de delante
    const delante = par.rendija ? p => ((p[0] - mid[0]) * ey[0] + (p[1] - mid[1]) * ey[1]) * lado > 0 : null;
    return { lineas: L, etiquetas, lado: delante };
  }
  function dibujarNodales(N) {
    const v = tz.vista, c = ESC.caja;
    const cx = tz.ctx; cx.save(); cx.beginPath(); cx.rect(v.X(c.x0), v.Y(c.y1), (c.x1 - c.x0) * v.escala, (c.y1 - c.y0) * v.escala); cx.clip();
    for (const l of N.lineas) tz.ondasLineaInterferencia(N.lado ? l.puntos.filter(N.lado) : l.puntos, l.tipo);
    cx.restore();
    if (ESC.capas.valores) for (const e of N.etiquetas) tz.texto(e.txt, e.X, e.Y, { fuente: 'num', tam: 11, color: e.tipo === 'nodal' ? 'texto-2' : 'texto', alinear: 'center', base: 'middle', halo: true });
  }
  function dibujarRegla() {
    const [a, b] = ESC.regla, L = Math.hypot(b[0] - a[0], b[1] - a[1]), lam = lambdaEn(a);
    tz.cota(a, b, { desplazamiento: 14, texto: ESC.capas.valores ? [{ t: 'L', f: 'sim', tam: 14 }, { t: ` = ${largo(L, 3)} = ${fmt(L / lam, 3)} λ`, f: 'num', tam: 11.5, color: 'texto-2' }] : null });
    if (sel === 'regla') { const [xa, ya] = tz.vista.P(a), [xb, yb] = tz.vista.P(b); tz.asa(xa, ya); tz.asa(xb, yb); }
  }
  // Extremo de la pantalla donde va su nombre: el más apartado del punto de prueba, las fuentes y las marcas
  function extremoPantalla() {
    const [a, b] = ESC.pantalla, otros = [...(ESC.P ? [ESC.P] : []), ...ESC.fuentes.map(f => f.p), ...ESC.marcas.map(m => m.p)];
    if (!otros.length) return b;
    const holgura = q => Math.min(...otros.map(o => Math.hypot(q[0] - o[0], q[1] - o[1])));
    return holgura(a) > holgura(b) ? a : b;
  }
  // λ en un punto (según su zona)
  const lambdaEn = p => rapidezEn(ESC, p[0], p[1]) / fRef();
  function dibujarPunto() {
    const P = ESC.P, par = parCoherente();
    if (par && ESC.capas.valores) {
      tz.linea([par.s1, P], { color: 'texto-2', grosor: 1, patron: 'auxiliar' });
      tz.linea([par.s2, P], { color: 'texto-2', grosor: 1, patron: 'auxiliar' });
    }
    tz.ondasPunto(P, ESC.nombreP || 'P', { seleccionada: sel === 'punto' });
    if (!ESC.capas.valores) return;
    const r = fichaPunto();
    tz.ficha(r.x, r.y, r.filas, { ancla: r.ancla });
  }
  // Filas y posición de la ficha del punto de prueba (la misma para dibujarla y para apartar los ejes)
  function fichaPunto() {
    const v = tz.vista, P = ESC.P, par = parCoherente(), [X, Y] = v.P(P);
    const filas = [];
    const uP = enVentana(campoEn(t).u, P[0], P[1]);
    if (par) {
      const lam = ESC.rapidez / par.f, d = diferenciaCaminos(P, par.s1, par.s2);
      const r1 = Math.hypot(P[0] - par.s1[0], P[1] - par.s1[1]), r2 = Math.hypot(P[0] - par.s2[0], P[1] - par.s2[1]);
      filas.push([{ t: 'r', f: 'sim', tam: 13 }, { t: '1', f: 'simRecta', tam: 9, dy: 3 }, { t: ` = ${largo(r1, 4)}   `, f: 'num', tam: 11.5 }, { t: 'r', f: 'sim', tam: 13 }, { t: '2', f: 'simRecta', tam: 9, dy: 3 }, { t: ` = ${largo(r2, 4)}`, f: 'num', tam: 11.5 }]);
      filas.push([{ t: 'Δ', f: 'simRecta', tam: 13 }, { t: ` = |r₁ − r₂| = ${largo(Math.abs(d), 4)}`, f: 'num', tam: 11.5 }]);
      filas.push([{ t: 'Δ/λ', f: 'sim', tam: 13 }, { t: ` = ${fmt(Math.abs(d) / lam, 4)}`, f: 'num', tam: 11.5 }]);
    }
    const [uu, un] = enLargo(uP || 0);
    filas.push([{ t: 'u', f: 'sim', tam: 13 }, { t: ` = ${cantidad(uu, un, 3)}`, f: 'num', tam: 11.5 }]);
    // Ficha hacia el lado con más sitio (dentro del lienzo)
    // (debajo del punto: arriba a la derecha está el chip con su nombre)
    const W = anchoFicha(filas), H = 16 * filas.length + 10, derecha = X + 26 + W < tz.w - 12;
    const fx = derecha ? X + 18 : X - 18 - W, abajo = Y + 14 + H < tz.h - 60, fy = abajo ? Y + 12 : Y - H - 28;
    return { x: fx, y: fy, w: W, h: H, filas, ancla: [X + (derecha ? 5 : -5), Y] };
  }
  // Ancho de una ficha (como la mide trazo.ficha)
  function anchoFicha(filas) {
    const c = tz.ctx; let w = 0;
    c.save();
    for (const segs of filas) { let a = 0; for (const g of segs) { c.font = tz._fuente(g.f, g.tam || 11.5); a += c.measureText(g.t).width; } w = Math.max(w, a); }
    c.restore();
    return w + 16;
  }
  function leyenda() {
    const lam = lambdaRef(), f = fRef(), partes = [];
    partes.push(`<span class="sim">λ</span><span class="num">${largo(lam, 3)}</span>`, `<span class="sim">f</span><span class="num">${cantidad(f, 'Hz', 3)}</span>`, `<span class="sim">v</span><span class="num">${cantidad(ESC.rapidez, 'm/s', 3)}</span>`);
    $('#leyenda').innerHTML = partes.join('<span class="sep"></span>');
  }

  // ---------------------------------------------------------------------
  // Paneles: inspector, árbol, lecturas
  // ---------------------------------------------------------------------
  const fila = (etq, control, ayuda = '') => `<div class="fila"${ayuda ? ` data-ayuda="${ayuda}"` : ''}><span class="etq">${etq}</span>${control}</div>`;
  const leer = r => r.split('.').reduce((o, k) => (o == null ? o : o[k]), ESC);
  function escribir(r, val) { const ks = r.split('.'), u = ks.pop(); const o = ks.reduce((a, k) => (a == null ? a : a[k]), ESC); if (o != null) o[u] = val; }
  const rutaDe = l => (Array.isArray(l) ? l[0] : l), factorDe = l => (Array.isArray(l) ? l[1] : 1);
  const ligadaA = r => Object.entries(ESC.variables).find(([, d]) => d.liga.some(l => rutaDe(l) === r));
  // dim: longitud | velocidad | frecuencia | angulo | numero; u: unidad de pantalla
  function campo(etq, ruta, dim, u, ayuda = '') {
    const lig = ligadaA(ruta);
    if (lig) return fila(etq, `<div class="campo es-variable" data-ayuda="Ligado a la variable ${lig[1].sim}|Bound to variable"><span class="chip-var">${simHTML(lig[1].sim, lig[1].sub)}</span><span class="valor-var" data-var="${lig[0]}"></span><span class="u">${lig[1].u}</span></div>`, ayuda);
    const val = leer(ruta), f = FAC[u] ?? 1;
    return fila(etq, `<div class="campo"><input data-ruta="${ruta}" data-dim="${dim}" data-u="${u}" value="${numCampo(val / f)}"><span class="u">${u}</span></div>`, ayuda);
  }
  const seg = (id, ops, actual) => `<div class="segmentado texto" id="${id}">${ops.map(([v, t]) => `<button data-v="${v}" aria-pressed="${v === actual}">${t}</button>`).join('')}</div>`;
  const quitar = (ayuda) => `<div class="fila"><span class="etq"></span><div><button class="btn btn-secundario btn-compacto" id="p-quitar" data-ayuda="${ayuda}|Delete|Supr"><svg class="ico"><use href="#i-borrar"/></svg>Quitar</button></div></div>`;
  function inspector() {
    const props = $('#propiedades'), ul = ESC.ul, ua = ESC.ua;
    let nombre = '', ico = 'o-fuente-puntual', estado = '', h = '';
    if (sel.startsWith('fuente:')) {
      const i = +sel.slice(7), b = `fuentes.${i}`; nombre = ESC.fuentes[i].nombre; estado = 'Fuente puntual';
      h = campo('Posición x', `${b}.p.0`, 'longitud', ul) + campo('Posición y', `${b}.p.1`, 'longitud', ul)
        + fila('Señal', seg('p-forma', [['senoidal', 'Continua'], ['ondicula', 'Pulso']], ESC.fuentes[i].forma || 'senoidal'), 'Continua: senoidal desde t = 0; pulso: una sola ondícula (frente compacto)|Signal')
        + campo('Frecuencia', `${b}.f`, 'frecuencia', 'Hz', ESC.fuentes[i].forma === 'ondicula' ? 'Frecuencia central del pulso|Frequency' : 'Frecuencia de la fuente|Frequency')
        + campo('Amplitud', `${b}.A`, 'longitud', ua, 'Amplitud a una longitud de onda de la fuente; cae como 1/√r|Amplitude')
        + campo('Fase', `${b}.fase`, 'angulo', '°', 'Fase inicial: dos fuentes con la misma fase están en fase|Phase')
        + quitar('Quitar la fuente');
    } else if (sel.startsWith('linea:')) {
      const i = +sel.slice(6), b = `lineas.${i}`; nombre = ESC.lineas[i].nombre; ico = 'o-fuente-lineal'; estado = 'Fuente lineal · ondas planas';
      h = campo('Extremo 1 x', `${b}.a.0`, 'longitud', ul) + campo('Extremo 1 y', `${b}.a.1`, 'longitud', ul) + campo('Extremo 2 x', `${b}.b.0`, 'longitud', ul) + campo('Extremo 2 y', `${b}.b.1`, 'longitud', ul)
        + campo('Frecuencia', `${b}.f`, 'frecuencia', 'Hz') + campo('Amplitud', `${b}.A`, 'longitud', ua, 'Amplitud de la onda plana|Amplitude')
        + campo('Desvío', `${b}.desvio`, 'angulo', '°', 'Dirección de la onda respecto de la normal a la fuente|Steering angle') + quitar('Quitar la fuente lineal');
    } else if (sel.startsWith('barrera:')) {
      const i = +sel.slice(8), b = `barreras.${i}`; nombre = ESC.barreras[i].nombre; ico = 'o-barrera'; estado = 'Barrera reflectante';
      h = campo('Extremo 1 x', `${b}.a.0`, 'longitud', ul) + campo('Extremo 1 y', `${b}.a.1`, 'longitud', ul) + campo('Extremo 2 x', `${b}.b.0`, 'longitud', ul) + campo('Extremo 2 y', `${b}.b.1`, 'longitud', ul)
        + campo('Grosor', `${b}.grosor`, 'longitud', ul) + quitar('Quitar la barrera');
    } else if (sel.startsWith('rendija:')) {
      const i = +sel.slice(8), b = `rendijas.${i}`, r = ESC.rendijas[i]; nombre = r.nombre; ico = 'o-rendija'; estado = r.n > 1 ? `${r.n} rendijas` : 'Rendija';
      h = campo('Centro x', `${b}.centro.0`, 'longitud', ul) + campo('Centro y', `${b}.centro.1`, 'longitud', ul)
        + campo('Ancho', `${b}.ancho`, 'longitud', ul, 'Ancho de cada abertura|Slit width')
        + fila('Aberturas', seg('p-nrend', [[1, '1'], [2, '2'], [3, '3'], [4, '4']], r.n))
        + (r.n > 1 ? campo('Separación', `${b}.separacion`, 'longitud', ul, 'Distancia entre los centros de dos aberturas vecinas|Slit separation') : '')
        + campo('Dirección', `${b}.angulo`, 'angulo', '°', 'Dirección de la pared: 90° es vertical|Wall direction') + quitar('Quitar la pared con rendijas');
    } else if (sel.startsWith('zona:')) {
      const i = +sel.slice(5), b = `zonas.${i}`, z = ESC.zonas[i]; nombre = z.nombre; ico = 'o-zona-velocidad'; estado = z.rapidez1 != null ? 'Zona con gradiente' : 'Zona de otra rapidez';
      h = campo('Rapidez', `${b}.rapidez`, 'velocidad', 'm/s', z.rapidez1 != null ? 'Rapidez abajo (y₀)|Speed' : 'Rapidez de las ondas en la zona|Speed')
        + (z.rapidez1 != null ? campo('Rapidez arriba', `${b}.rapidez1`, 'velocidad', 'm/s', 'Rapidez arriba (y₁); en medio cambia linealmente|Speed at top') : '')
        + (ESC.medio === 'agua' ? fila('Profundidad', `<div class="campo"><input id="p-prof" value="${numCampo(z.rapidez ** 2 / G0 / FAC.cm)}"><span class="u">cm</span></div>`, 'En aguas someras v = √(gh)|Depth') : '')
        + (z.forma === 'rect' ? campo('x₀', `${b}.x0`, 'longitud', ul) + campo('x₁', `${b}.x1`, 'longitud', ul) + campo('y₀', `${b}.y0`, 'longitud', ul) + campo('y₁', `${b}.y1`, 'longitud', ul) : '')
        + quitar('Quitar la zona');
    } else if (sel === 'punto' && ESC.P) {
      nombre = `Punto ${ESC.nombreP || 'P'}`; ico = 'n-microfono'; estado = 'Punto de prueba';
      h = campo('Posición x', 'P.0', 'longitud', ul) + campo('Posición y', 'P.1', 'longitud', ul) + quitar('Quitar el punto');
    } else if (sel === 'regla' && ESC.regla) {
      nombre = 'Regla'; ico = 'n-regla'; estado = 'Instrumento';
      h = campo('Desde x', 'regla.0.0', 'longitud', ul) + campo('Desde y', 'regla.0.1', 'longitud', ul) + campo('Hasta x', 'regla.1.0', 'longitud', ul) + campo('Hasta y', 'regla.1.1', 'longitud', ul) + quitar('Quitar la regla');
    } else if (sel === 'pantalla' && ESC.pantalla) {
      nombre = 'Pantalla'; ico = 'n-detector'; estado = 'Detector de línea';
      h = campo('Desde x', 'pantalla.0.0', 'longitud', ul) + campo('Desde y', 'pantalla.0.1', 'longitud', ul) + campo('Hasta x', 'pantalla.1.0', 'longitud', ul) + campo('Hasta y', 'pantalla.1.1', 'longitud', ul) + quitar('Quitar la pantalla');
    } else {
      sel = 'medio'; nombre = ESC.medio === 'agua' ? 'Agua de la cubeta' : 'Aire'; ico = ESC.medio === 'agua' ? 'o-fluido' : 'o-viento';
      estado = SIM ? `Malla ${SIM.ventana.nx} × ${SIM.ventana.ny}` : 'Medio';
      h = campo('Rapidez', 'rapidez', 'velocidad', 'm/s', ESC.medio === 'agua' ? 'Rapidez de las ondas; en aguas someras v = √(gh)|Wave speed' : 'Rapidez del sonido|Speed of sound')
        + campo('Duración', 'duracion', 'tiempo', 's')
        + ['izq', 'der', 'abajo', 'arriba'].map(l => fila({ izq: 'Borde izq.', der: 'Borde der.', abajo: 'Borde abajo', arriba: 'Borde arriba' }[l], seg('p-borde-' + l, [['absorbente', 'Abierto'], ['reflectante', 'Pared']], ESC.bordes[l]), 'Abierto: la onda sale sin volver (capa absorbente); pared: se refleja|Boundary')).join('')
        + fila('Resolución', seg('p-ppl', [[10, 'Gruesa'], [14, 'Normal'], [20, 'Fina']], ESC.ppl), 'Nodos de la malla por la longitud de onda más corta|Grid resolution')
        + fila('Mapa', seg('p-mapa', [['tinta', 'Tinta'], ['divergente', 'Divergente']], ESC.mapa), 'Color del desplazamiento|Color map')
        + fila('Contraste', seg('p-contraste', [[0.5, '½×'], [1, '1×'], [2, '2×'], [4, '4×']], ESC.contraste), 'Amplitud que llega al extremo del mapa|Contrast')
        + fila('Modelo', seg('p-modelo', [['malla', 'Malla'], ['analitico', 'Analítico']], ESC.modelo), 'Malla: diferencias finitas; analítico: superposición exacta de las fuentes puntuales|Model');
    }
    $('#insp-nombre').textContent = nombre; $('#insp-estado').textContent = estado; $('#insp-ico').setAttribute('href', '#' + ico);
    props.innerHTML = h;
    props.querySelectorAll('input[data-ruta]').forEach(campoConUnidad);
    const on = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) fn(b.dataset.v); }); };
    for (const l of ['izq', 'der', 'abajo', 'arriba']) on('#p-borde-' + l, v => { ESC.bordes[l] = v; cambio(); });
    on('#p-ppl', v => { ESC.ppl = +v; cambio(); });
    on('#p-mapa', v => { ESC.mapa = v; registrar(); inspector(); todo(); });
    on('#p-contraste', v => { ESC.contraste = +v; D.escala = escalaCampo(); registrar(); inspector(); todo(); });
    on('#p-modelo', v => ponerModelo(v));
    on('#p-forma', v => { ESC.fuentes[+sel.slice(7)].forma = v; if (usarAnalitico() && !analiticoValido()) ESC.modelo = 'malla'; titulo(); cambio(); });
    on('#p-nrend', v => { const r = ESC.rendijas[+sel.slice(8)]; r.n = +v; if (r.n > 1 && !(r.separacion > r.ancho)) r.separacion = 2 * r.ancho; cambio(); });
    const pq = $('#p-quitar'); if (pq) pq.addEventListener('click', quitarSeleccion);
    const pp = $('#p-prof');
    if (pp) pp.addEventListener('change', () => {
      try {
        const hh = evaluar(/^[\d.]+$/.test(pp.value.trim()) ? pp.value + ' cm' : pp.value, { esperada: 'longitud' }).valor;
        if (!(hh > 0 && hh < 100)) throw new Error('La profundidad va de 0 a 100 m.');
        ESC.zonas[+sel.slice(5)].rapidez = Math.sqrt(G0 * hh); cambio();
      } catch (e) { avisar(e.message, false); }
    });
    arbol();
  }
  function validar(ruta, x) {
    if (!Number.isFinite(x) || Math.abs(x) > 1e7) throw new Error('El valor es demasiado grande.');
    if (/(^rapidez|\.rapidez1?|\.f|\.ancho|\.grosor|^duracion)$/.test(ruta) && !(x > 0)) throw new Error('Este valor tiene que ser positivo.');
    if (ruta === 'duracion' && x > 600 * periodoMax()) throw new Error('La duración máxima es de 600 periodos.');
    if (ruta.endsWith('.separacion')) { const r = ESC.rendijas[+ruta.split('.')[1]]; if (!(x > r.ancho)) throw new Error('La separación tiene que ser mayor que el ancho de cada abertura.'); }
  }
  function campoConUnidad(ent) {
    const cajaC = ent.closest('.campo'), f = ent.closest('.fila');
    const error = msj => {
      cajaC.classList.toggle('es-error', !!msj);
      let p = f.querySelector('.mensaje-error');
      if (msj && !p) { p = document.createElement('p'); p.className = 'mensaje-error'; f.appendChild(p); }
      if (p) { if (msj) p.textContent = msj; else p.remove(); }
    };
    ent.addEventListener('change', () => {
      try {
        let txt = ent.value.trim().replace(/−/g, '-');
        const dim = ent.dataset.dim, u = ent.dataset.u;
        if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(txt)) txt += ' ' + (u === 'cm/s' ? 'cm/s' : u);
        const x = dim === 'angulo' ? evaluar(txt, { esperada: 'adimensional', unidadPorDefecto: '°' }).valor : evaluar(txt, { esperada: dim }).valor;
        validar(ent.dataset.ruta, x);
        escribir(ent.dataset.ruta, x); error(null); cambio();
      } catch (e) { error(e.message); }
    });
  }
  function arbol() {
    const n = (s, ico, nom, dato) => `<div class="nodo" data-sel="${s}" aria-selected="${sel === s}"><svg class="ico"><use href="#${ico}"/></svg><span class="nombre">${nom}</span><span class="dato">${dato}</span></div>`;
    let h = n('medio', ESC.medio === 'agua' ? 'o-fluido' : 'o-viento', ESC.medio === 'agua' ? 'Agua' : 'Aire', cantidad(ESC.rapidez, 'm/s', 3));
    h += ESC.fuentes.map((f, i) => n('fuente:' + i, 'o-fuente-puntual', f.nombre, cantidad(f.f, 'Hz', 3))).join('');
    h += ESC.lineas.map((l, i) => n('linea:' + i, 'o-fuente-lineal', l.nombre, cantidad(l.f, 'Hz', 3))).join('');
    h += ESC.rendijas.map((r, i) => n('rendija:' + i, 'o-rendija', r.nombre, largo(r.ancho, 2))).join('');
    h += ESC.barreras.map((b, i) => n('barrera:' + i, 'o-barrera', b.nombre, largo(Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]), 2))).join('');
    h += ESC.zonas.map((z, i) => n('zona:' + i, 'o-zona-velocidad', z.nombre, cantidad(z.rapidez, 'm/s', 3))).join('');
    if (ESC.P) h += n('punto', 'n-microfono', `Punto ${ESC.nombreP || 'P'}`, '');
    if (ESC.pantalla) h += n('pantalla', 'n-detector', 'Pantalla', largo(Math.hypot(ESC.pantalla[1][0] - ESC.pantalla[0][0], ESC.pantalla[1][1] - ESC.pantalla[0][1]), 3));
    if (ESC.regla) h += n('regla', 'n-regla', 'Regla', largo(Math.hypot(ESC.regla[1][0] - ESC.regla[0][0], ESC.regla[1][1] - ESC.regla[0][1]), 3));
    $('#arbol').innerHTML = h;
    $('#arbol').querySelectorAll('.nodo').forEach(e => e.addEventListener('click', () => seleccionar(e.dataset.sel)));
  }
  function seleccionar(s) { if (s === sel) return; sel = s; inspector(); todo(); }
  function lecturas() {
    $('#reloj').innerHTML = `<span class="sim">t</span>${fmtT(t).padStart(6, ' ')}<span class="u">${ESC.duracion < 0.5 ? 'ms' : 's'}</span>`;
    $('#lect-titulo').textContent = `Lecturas en t = ${fmtT(t)} ${ESC.duracion < 0.5 ? 'ms' : 's'}`;
    $('#b-play').innerHTML = `<svg class="ico"><use href="#i-${jugando ? 'pausar' : 'reproducir'}"/></svg>`;
    document.querySelectorAll('[data-var]').forEach(e => { const d = ESC.variables[e.dataset.var]; if (d) e.textContent = fmtVar(d); });
    const filas = [];
    const L = (a, b, v, u, ay = '') => `<span class="sim"${ay ? ` data-ayuda="${ay}"` : ''}>${a}${b ? `<sub class="r">${b}</sub>` : ''}</span><span class="v">${v}</span><span class="u">${u}</span>`;
    const Ll = (a, b, v, ay) => { const [x, u] = enLargo(v); return L(a, b, fmt(x, 4), u, ay); };
    if (sel.startsWith('fuente:') || sel.startsWith('linea:')) {
      const o = sel.startsWith('fuente:') ? ESC.fuentes[+sel.slice(7)] : ESC.lineas[+sel.slice(6)], p = o.p || o.a, v = rapidezEn(ESC, p[0], p[1]);
      filas.push(L('f', '', fmt(o.f, 4), 'Hz'), L('T', '', fmt(1 / o.f, 4), 's', 'Periodo|Period'), Ll('λ', '', v / o.f, 'Longitud de onda λ = v/f|Wavelength'), L('v', '', fmt(v, 4), 'm/s'));
    } else if (sel.startsWith('zona:')) {
      const z = ESC.zonas[+sel.slice(5)], f = fRef();
      filas.push(L('v', '', fmt(z.rapidez, 4), 'm/s'), Ll('λ', '', z.rapidez / f, 'Longitud de onda en la zona (la frecuencia no cambia)|Wavelength'), L('n', '', fmt(ESC.rapidez / z.rapidez, 4), '', 'Índice relativo n = v₁/v₂ al entrar desde el medio|Relative index'));
      if (z.rapidez1 != null) filas.push(L('v', 'arriba', fmt(z.rapidez1, 4), 'm/s'));
      if (ESC.medio === 'agua') filas.push(Ll('h', '', z.rapidez ** 2 / G0, 'Profundidad del agua: v = √(gh)|Depth'));
    } else if (sel === 'punto' && ESC.P) {
      const P = ESC.P, par = parCoherente(), u = enVentana(campoEn(t).u, P[0], P[1]), A = enVentana(amplitudEn(t), P[0], P[1]);
      if (par) {
        const lam = ESC.rapidez / par.f, d = diferenciaCaminos(P, par.s1, par.s2);
        filas.push(Ll('r', '1', Math.hypot(P[0] - par.s1[0], P[1] - par.s1[1]), `Distancia a ${par.n1}|Distance`), Ll('r', '2', Math.hypot(P[0] - par.s2[0], P[1] - par.s2[1]), `Distancia a ${par.n2}|Distance`));
        filas.push(Ll('Δ', '', Math.abs(d), 'Diferencia de caminos |r₁ − r₂||Path difference'), L('Δ/λ', '', fmt(Math.abs(d) / lam, 4), '', 'Diferencia de caminos en longitudes de onda|In wavelengths'));
      }
      filas.push(Ll('u', '', u, 'Desplazamiento en este instante|Displacement'), Ll('A', '', A, 'Amplitud durante el último periodo|Amplitude'));
    } else if (sel === 'regla' && ESC.regla) {
      const [a, b] = ESC.regla, Lr = Math.hypot(b[0] - a[0], b[1] - a[1]);
      filas.push(Ll('L', '', Lr), L('L/λ', '', fmt(Lr / lambdaEn(a), 4), '', 'Medida en longitudes de onda (λ donde empieza la regla)|In wavelengths'));
    } else if (sel === 'pantalla' && ESC.pantalla) {
      const pts = puntosPantalla(60), am = amplitudesPantalla(pts);
      filas.push(Ll('L', '', Math.hypot(ESC.pantalla[1][0] - ESC.pantalla[0][0], ESC.pantalla[1][1] - ESC.pantalla[0][1])), Ll('A', 'máx', Math.max(...am)), Ll('A', 'mín', Math.min(...am)));
    } else {
      filas.push(L('v', '', fmt(ESC.rapidez, 4), 'm/s'), Ll('λ', '', lambdaRef()), L('f', '', fmt(fRef(), 4), 'Hz'));
      if (SIM) {
        filas.push(Ll('h', '', SIM.h, 'Paso de la malla|Grid spacing'), L('Δt', '', fmt(SIM.dt * (ESC.duracion < 0.5 ? 1e3 : 1), 4), ESC.duracion < 0.5 ? 'ms' : 's', 'Paso de tiempo bajo la condición CFL|Time step'));
        filas.push(L('C', '', fmt(SIM.courant, 3), '', 'Número de Courant C = v·Δt/h; estable si C ≤ 1/√2|Courant number'));
        if (rendimiento.pasos) filas.push(L('', '', fmt(rendimiento.pasos, 3), 'pasos/s', 'Rendimiento del cálculo|Steps per second'));
      }
    }
    $('#lecturas').innerHTML = filas.join('');
  }
  const fmtT = s => (ESC.duracion < 0.5 ? fmt(s * 1e3, 4) : fmt(s, 4));
  const fmtVar = d => d.val.toFixed(!(d.paso > 0) || d.paso >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(d.paso) - 1e-9))).replace('-', '−');
  function construirVariables() {
    const cont = $('#variables'); cont.innerHTML = '';
    for (const d of Object.values(ESC.variables)) {
      const e = document.createElement('div'); e.className = 'var';
      e.innerHTML = `${simHTML(d.sim, d.sub)}<input class="deslizador" type="range" min="${d.min}" max="${d.max}" step="${d.paso}" value="${d.val}" aria-label="${d.sim}"><span class="valor"></span>`;
      const ent = e.querySelector('input'), val = e.querySelector('.valor');
      const pintar = () => { val.innerHTML = `${fmtVar(d)}<span class="u">${d.u}</span>`; Volta.pintarDeslizador(ent); };
      ent.addEventListener('input', () => { d.val = parseFloat(ent.value); pintar(); aplicarVariables(); if (usarAnalitico()) { D.tCampo = null; todo(); } });
      ent.addEventListener('change', () => { cambio(); });
      pintar(); cont.appendChild(e);
    }
    if (!Object.keys(ESC.variables).length) cont.innerHTML = '<span class="ayuda-fila" style="margin:0">Sin variables: edita los valores en el inspector.</span>';
  }
  // Una variable no puede dejar un valor que no describe una situación física (rapidez 0, f < 0…)
  function aplicarVariables() {
    for (const d of Object.values(ESC.variables)) for (const l of d.liga) {
      const r = rutaDe(l), x = d.val * d.factor * factorDe(l);
      if (leer(r) === undefined) continue;
      try { validar(r, x); escribir(r, x); } catch { /* se queda el valor anterior */ }
    }
  }

  // ---------------------------------------------------------------------
  // Gráficas, intensidad, eventos y tabla
  // ---------------------------------------------------------------------
  function puntosPantalla(n = 240) {
    const [a, b] = ESC.pantalla, L = Math.hypot(b[0] - a[0], b[1] - a[1]), r = [];
    for (let k = 0; k <= n; k++) { const s = k / n; r.push({ s: s * L, p: [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s] }); }
    return r;
  }
  function amplitudesPantalla(pts) {
    if (usarAnalitico()) return pts.map(q => fasorAnalitico(fuentesMotor().filter(f => Math.hypot(q.p[0] - f.p[0], q.p[1] - f.p[1]) <= ESC.rapidez * t), q.p[0], q.p[1], ESC.rapidez, { exacta: true }).amplitud);
    if (!SIM) return pts.map(() => 0);
    return SIM.pelicula.amplitudes(pts.map(q => q.p), t, periodoMax());
  }
  // Serie u(t) en P hasta t (de la película o del modelo analítico)
  function serieP() {
    const P = ESC.P;
    if (usarAnalitico()) {
      const n = 500, ts = [], ys = [], fu = fuentesMotor();
      for (let k = 0; k <= n; k++) { const tt = t * k / n; ts.push(tt); ys.push(campoAnalitico(fu, P[0], P[1], tt, ESC.rapidez, { exacta: true })); }
      return { t: ts, y: ys };
    }
    if (!SIM) return { t: [], y: [] };
    const s = SIM.pelicula.serie(P[0], P[1], t);
    if (s.t.length && s.t[s.t.length - 1] < t) { s.t.push(t); s.y.push(enVentana(campoEn(t).u, P[0], P[1])); }
    return s;
  }
  const vacia = (n, msj) => { grafica($(`#g${n}`), { x: { min: 0, max: 1 }, y: { min: -1, max: 1 }, series: [] }); $(`#t${n}`).textContent = msj; $(`#l${n}`).textContent = ''; };
  function graficas() {
    if (!$('#p-graficas').hidden) {
      const ut = ESC.duracion < 0.5 ? 'ms' : 's', ft = FAC[ut], [, ua] = enLargo(2 * D.escala), fa = FAC[ua];
      const ym = 2.2 * D.escala / fa;
      // 1 · u(t) en P
      if (ESC.P) {
        const s = serieP(), pts = s.t.map((x, k) => [x / ft, s.y[k] / fa]);
        const yMax = Math.max(ym, ...pts.map(p => Math.abs(p[1]) * 1.1));
        grafica($('#g1'), { x: { min: 0, max: ESC.duracion / ft }, y: { min: -yMax, max: yMax }, series: [{ tramos: [pts], familia: 'tinta' }], cursor: t / ft, puntoCursor: pts.length ? pts[pts.length - 1] : null, eventos: eventos().filter(e => e.P).map(e => ({ x: e.t / ft })) });
        $('#t1').innerHTML = `${simHTML('u')} (${ua}) en ${ESC.nombreP || 'P'} contra ${simHTML('t')} (${ut})`;
        $('#l1').textContent = pts.length ? cantidad(pts[pts.length - 1][1], ua, 3) : '';
      } else vacia(1, 'Coloca el punto de prueba para registrar u(t)');
      // 2 · Perfil a lo largo de la pantalla; 3 · amplitud en la pantalla
      if (ESC.pantalla) {
        const pts = puntosPantalla(), L = pts[pts.length - 1].s, [, us] = enLargo(L), fs = FAC[us];
        const u = campoEn(t).u, perfil = pts.map(q => [q.s / fs, enVentana(u, q.p[0], q.p[1]) / fa]);
        const series = [{ tramos: [perfil], familia: 'tinta' }];
        const an = !usarAnalitico() && analiticoValido();
        if (an) series.push({ tramos: [pts.map(q => [q.s / fs, campoAnalitico(fuentesMotor(), q.p[0], q.p[1], t, ESC.rapidez, { exacta: true }) / fa])], familia: 'texto-3', auxiliar: true, etiqueta: 'analítica' });
        const yMax = Math.max(ym, ...perfil.map(p => Math.abs(p[1]) * 1.1));
        grafica($('#g2'), { x: { min: 0, max: L / fs }, y: { min: -yMax, max: yMax }, series, puntoCursor: null, eventos: marcasPantalla(pts).map(x => ({ x: x / fs })) });
        $('#t2').innerHTML = `Perfil ${simHTML('u')} (${ua}) a lo largo de la pantalla, ${simHTML('s')} (${us})`;
        $('#l2').textContent = '';
        const am = amplitudesPantalla(pts), sa = [{ tramos: [pts.map((q, k) => [q.s / fs, am[k] / fa])], familia: 'tinta' }];
        if (an) sa.push({ tramos: [pts.map(q => [q.s / fs, fasorAnalitico(fuentesMotor(), q.p[0], q.p[1], ESC.rapidez, { exacta: true }).amplitud / fa])], familia: 'texto-3', auxiliar: true, etiqueta: 'régimen' });
        // Sin onda todavía en la pantalla: la escala del color fija el eje
        const datos = Math.max(0, ...am.map(a => a / fa), ...(an ? sa[1].tramos[0].map(p => p[1]) : []));
        const aMax = datos > 0.02 * ym ? datos : 0.5 * ym;
        grafica($('#g3'), { x: { min: 0, max: L / fs }, y: { min: 0, max: aMax * 1.12 }, series: sa, eventos: marcasPantalla(pts).map(x => ({ x: x / fs })) });
        $('#t3').innerHTML = `Amplitud ${simHTML('A')} (${ua}) en la pantalla contra ${simHTML('s')} (${us})`;
        $('#l3').textContent = `máx ${cantidad(Math.max(...am) / fa, ua, 3)}`;
      } else { vacia(2, 'Coloca una pantalla para el perfil'); vacia(3, 'Coloca una pantalla para la amplitud'); }
    }
    if (!$('#p-energia').hidden) intensidadPanel();
  }
  // Posiciones (s) de la pantalla donde Δ = (m + ½)λ: mínimos de las dos fuentes coherentes
  function marcasPantalla(pts) {
    const par = parCoherente(); if (!par) return [];
    const lam = ESC.rapidez / par.f, base = par.desfase / DOS_PI, r = [];
    const g = q => diferenciaCaminos(q.p, par.s1, par.s2) / lam - base - 0.5;
    for (let k = 1; k < pts.length; k++) {
      const a = g(pts[k - 1]), b = g(pts[k]);
      if (Math.floor(a) !== Math.floor(b)) { const m = Math.max(Math.floor(a), Math.floor(b)), s = (m - a) / (b - a); r.push(pts[k - 1].s + s * (pts[k].s - pts[k - 1].s)); }
    }
    return r;
  }
  function intensidadPanel() {
    const P = ESC.P, [, ua] = enLargo(2 * D.escala), fa = FAC[ua];
    let h = `<div class="barras-tit">Amplitud en ${ESC.nombreP || 'P'}</div>`;
    if (!P) h += '<p class="ayuda-fila" style="margin:0">Coloca el punto de prueba.</p>';
    else {
      const filas = [];
      if (analiticoValido() || ESC.fuentes.length) {
        ESC.fuentes.slice(0, 3).forEach((f, i) => filas.push([`Solo ${f.nombre} (analítica)`, fasorAnalitico([fuentesMotor()[i]], P[0], P[1], ESC.rapidez, { exacta: true }).amplitud]));
        if (ESC.fuentes.length >= 2) filas.push(['Juntas (analítica)', fasorAnalitico(fuentesMotor(), P[0], P[1], ESC.rapidez, { exacta: true }).amplitud]);
      }
      filas.push([usarAnalitico() ? 'En este instante (analítica)' : 'Medida en la malla', enVentana(amplitudEn(t), P[0], P[1])]);
      const m = Math.max(1e-30, ...filas.map(f => f[1]));
      h += filas.map(([n, a]) => `<div class="barra-e" data-ayuda="Amplitud: la intensidad va como A²|Amplitude"><span>${n}</span><span class="riel"><i style="width:${a / m * 100}%;background:var(--tinta)"></i></span><span class="v">${fmt(a / fa, 3)} ${ua}</span></div>`).join('');
    }
    if (P && ESC.fuentes.length) h += '<div class="barras-pie">Analíticas: medio uniforme y sin paredes</div>';
    $('#barras').innerHTML = h;
    if (ESC.pantalla) {
      const pts = puntosPantalla(), am = amplitudesPantalla(pts), I = am.map(a => a * a), m = Math.max(1e-60, ...I), L = pts[pts.length - 1].s, [, us] = enLargo(L), fs = FAC[us];
      grafica($('#g4'), { x: { min: 0, max: L / fs }, y: { min: 0, max: 1.08 }, series: [{ tramos: [pts.map((q, k) => [q.s / fs, I[k] / m])], familia: 'tinta' }], eventos: marcasPantalla(pts).map(x => ({ x: x / fs })) });
      $('#t4').innerHTML = `Intensidad relativa ${simHTML('I')}/${simHTML('I')}<sub class="r">máx</sub> en la pantalla contra ${simHTML('s')} (${us})`;
      $('#l4').textContent = '';
    } else vacia(4, 'Coloca una pantalla');
  }
  // Llegada del primer frente de cada fuente al punto P y a la pantalla (recta, rapidez del medio)
  function eventos() {
    const ev = [], v = ESC.rapidez;
    const lleg = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]) / v;
    ESC.fuentes.slice(0, 6).forEach(f => {
      if (ESC.P) ev.push({ t: lleg(f.p, ESC.P), nombre: `El primer frente de ${f.nombre} llega a ${ESC.nombreP || 'P'}`, P: true });
      if (ESC.pantalla) { const pts = puntosPantalla(60); ev.push({ t: Math.min(...pts.map(q => lleg(f.p, q.p))), nombre: `El primer frente de ${f.nombre} llega a la pantalla` }); }
    });
    ESC.lineas.forEach(l => {
      const d = q => { const ab = [l.b[0] - l.a[0], l.b[1] - l.a[1]], L2 = ab[0] ** 2 + ab[1] ** 2, s = Math.max(0, Math.min(1, ((q[0] - l.a[0]) * ab[0] + (q[1] - l.a[1]) * ab[1]) / L2)); return Math.hypot(q[0] - l.a[0] - s * ab[0], q[1] - l.a[1] - s * ab[1]); };
      if (ESC.P) ev.push({ t: d(ESC.P) / v, nombre: `La onda de ${l.nombre} llega a ${ESC.nombreP || 'P'}`, P: true });
    });
    return ev.filter(e => e.t <= ESC.duracion).sort((a, b) => a.t - b.t).slice(0, 20);
  }
  function tablas() {
    const ut = ESC.duracion < 0.5 ? 'ms' : 's', ft = FAC[ut];
    $('#t-eventos').innerHTML = `<tr><th>Evento</th><th>t (${ut})</th></tr>` + (eventos().map(e => `<tr class="${Math.abs(e.t - t) < ESC.duracion / 200 ? 'actual' : ''}"><td class="texto">${e.nombre}</td><td>${fmt(e.t / ft, 5)}</td></tr>`).join('') || '<tr><td class="texto" colspan="2">Sin eventos.</td></tr>');
    if (!ESC.P) { $('#t-datos').innerHTML = '<tr><td class="texto">Coloca el punto de prueba para tabular u(t).</td></tr>'; return; }
    const s = serieP(), paso = Math.max(1, Math.ceil(s.t.length / 150));
    let h = `<tr><th>t (${ut})</th><th>u en ${ESC.nombreP || 'P'} (m)</th></tr>`;
    for (let k = 0; k < s.t.length; k += paso) h += `<tr class="${Math.abs(s.t[k] - t) < ESC.duracion / 200 ? 'actual' : ''}"><td>${fmt(s.t[k] / ft, 5)}</td><td>${fmt(s.y[k], 4)}</td></tr>`;
    $('#t-datos').innerHTML = h;
  }

  // ---------------------------------------------------------------------
  // Ciclo de actualización
  // ---------------------------------------------------------------------
  const lt = new LineaTiempo($('#tl'), { duracion: 1, eventos: [], alCambiar: nt => { t = Math.min(nt, frontera()); jugando = false; pendiente = null; todo(); } });
  function todo() {
    lt.simulado = frontera(); lt.duracion = ESC.duracion;
    dibujar(); lecturas(); lt.poner(t); graficas();
    if (!$('#p-eventos').hidden || !$('#p-tabla').hidden) tablas();
  }
  // Rehace la malla; la simulación vuelve a calcularse hasta el instante en que estaba
  function recalcular() {
    const tPrevio = t;
    construir();
    D.vent = null;
    lt.eventos = eventos().map(e => ({ t: e.t, nombre: e.nombre }));
    t = 0; pendiente = null;
    if (!usarAnalitico() && SIM && tPrevio > 0) pendiente = Math.min(tPrevio, ESC.duracion);
    else if (usarAnalitico()) t = Math.min(tPrevio, ESC.duracion);
    $('#modo').textContent = usarAnalitico() ? 'Analítico' : 'Malla';
    $('#modo').dataset.ayuda = usarAnalitico()
      ? 'Superposición analítica exacta de las fuentes puntuales (función de Green 2D)|Analytic superposition'
      : `Malla de ${SIM ? `${SIM.nx} × ${SIM.ny} nodos (${SIM.ventana.nx} × ${SIM.ventana.ny} visibles)` : 'diferencias finitas'}: salto de rana bajo la condición CFL, con bordes absorbentes|Finite differences on a grid`;
    if (SIM && SIM.aviso) avisar('La resolución se redujo para no pasar del máximo de nodos', false);
    if (ERROR && !usarAnalitico()) avisar(ERROR, false);
    todo();
    if (autoguardar) autoguardado.guardar('ondas-cubeta', escenaActual());
  }
  function cambio() { aplicarVariables(); recalcular(); registrar(); inspector(); }
  function titulo() {
    $('#escena-nombre').textContent = ESC.titulo;
    const chip = $('#escena-chip');
    chip.textContent = ESC.tipo === 'MEXT' ? `MEXT ${ESC.anio || ''}`.trim() : ESC.tipo || 'Propio';
    chip.className = 'chip' + (ESC.tipo === 'MEXT' ? ' lleno' : '');
    document.title = `Volta · Ondas y sonido · ${ESC.titulo}`;
    const base = ESC.velocidad || 0.5, k = ESCALERA.reduce((m, v, i) => (Math.abs(Math.log(v / base)) < Math.abs(Math.log(ESCALERA[m] / base)) ? i : m), 0);
    const i0 = Math.max(0, Math.min(ESCALERA.length - 4, k - 2)), ops = ESCALERA.slice(i0, i0 + 4);
    velocidad = ESCALERA[k];
    $('#velocidades').innerHTML = ops.map(v => `<button data-v="${v}" aria-pressed="${v === velocidad}">${fmtVel(v)}</button>`).join('');
    document.querySelectorAll('.capa-btn').forEach(b => b.setAttribute('aria-pressed', String(!!ESC.capas[b.dataset.capa])));
    document.querySelectorAll('#vistas button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.vista === ESC.vista)));
    document.querySelectorAll('.herr[data-herr="analitica"]').forEach(b => b.setAttribute('aria-pressed', String(usarAnalitico())));
    document.querySelectorAll('.herr[data-herr="intensidad"]').forEach(b => b.setAttribute('aria-pressed', String(ESC.vista === 'intensidad')));
  }
  const ESCALERA = [0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2];
  const fmtVel = v => (v === 0.25 ? '¼×' : v === 0.5 ? '½×' : `${String(v)}×`);
  let relojAviso = null;
  function avisar(txt, conDeshacer = true) {
    $('#aviso-texto').textContent = txt; $('#aviso').hidden = false;
    $('#aviso-deshacer').hidden = !conDeshacer || !historial?.puedeDeshacer;
    clearTimeout(relojAviso); relojAviso = setTimeout(() => { $('#aviso').hidden = true; }, conDeshacer ? 5000 : 4000);
  }
  $('#aviso-deshacer').addEventListener('click', () => deshacer());

  function ponerModelo(m) {
    if (m === 'analitico' && !analiticoValido()) { avisar('El modelo analítico solo vale para fuentes puntuales en un medio uniforme, sin paredes ni zonas', false); return; }
    ESC.modelo = m; titulo(); recalcular(); registrar(); inspector();
    avisar(m === 'analitico' ? 'Superposición analítica de las fuentes puntuales' : 'Diferencias finitas en la malla', false);
  }
  function ponerVista(v) { ESC.vista = v; titulo(); registrar(); todo(); }

  // ---------------------------------------------------------------------
  // Escena: guardar, abrir, autoguardado, deshacer
  // ---------------------------------------------------------------------
  const copia = o => JSON.parse(JSON.stringify(o));
  const instantanea = () => copia(ESC);
  function escenaActual() { return crearEscena({ modulo: 'ondas', espacio: 'cubeta', titulo: ESC.titulo, datos: instantanea() }); }
  // Rutas que una variable puede fijar
  const RUTA_OK = /^((fuentes)\.(\d|1[01])\.(p\.[01]|f|A|fase)|lineas\.[0-3]\.(a\.[01]|b\.[01]|f|A|fase|desvio)|rendijas\.[0-3]\.(ancho|separacion|centro\.[01]|angulo)|barreras\.[0-7]\.(a\.[01]|b\.[01])|zonas\.[0-5]\.(rapidez|rapidez1)|rapidez|duracion|P\.[01])$/;
  // Valida y acota lo que viene de un archivo (entrada no confiable)
  function datosSeguros(d = {}) {
    const base = completa(escenaDe(d.clave));
    const c0 = d.caja && typeof d.caja === 'object' ? d.caja : base.caja;
    const x0 = numero(c0.x0, base.caja.x0, -1e5, 1e5), y0 = numero(c0.y0, base.caja.y0, -1e5, 1e5);
    const caja = { x0, y0, x1: numero(c0.x1, x0 + 1, x0 + 1e-3, x0 + 1e5), y1: numero(c0.y1, y0 + 1, y0 + 1e-3, y0 + 1e5) };
    const L = Math.max(caja.x1 - caja.x0, caja.y1 - caja.y0), lim = 50 * L;
    const pt = (p, def) => (Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) ? [numero(p[0], def[0], caja.x0 - lim, caja.x1 + lim), numero(p[1], def[1], caja.y0 - lim, caja.y1 + lim)] : def);
    const cen = [(caja.x0 + caja.x1) / 2, (caja.y0 + caja.y1) / 2];
    const lista = (v, n) => (Array.isArray(v) ? v.filter(o => o && typeof o === 'object').slice(0, n) : []);
    const rapidez = numero(d.rapidez, base.rapidez, 1e-4, 1e5);
    const fuentes = lista(d.fuentes, 12).map((f, i) => ({ nombre: texto(f.nombre, `S${subs(i + 1)}`, 16), p: pt(f.p, cen), forma: f.forma === 'ondicula' ? 'ondicula' : 'senoidal', f: numero(f.f, 1, 1e-4, 1e7), A: numero(f.A, 1e-3, -1, 1), fase: numero(f.fase, 0, -100, 100) }));
    const lineas = lista(d.lineas, 4).map((l, i) => ({ nombre: texto(l.nombre, `Generador ${i + 1}`, 24), a: pt(l.a, [caja.x0, caja.y0]), b: pt(l.b, [caja.x0, caja.y1]), f: numero(l.f, 1, 1e-4, 1e7), A: numero(l.A, 1e-3, -1, 1), fase: numero(l.fase, 0, -100, 100), desvio: numero(l.desvio, 0, -1.4, 1.4) }));
    const barreras = lista(d.barreras, 8).map((b, i) => ({ nombre: texto(b.nombre, `Barrera ${i + 1}`, 24), a: pt(b.a, cen), b: pt(b.b, [cen[0], caja.y1]), grosor: numero(b.grosor, L / 50, 1e-6, L / 4) }));
    const rendijas = lista(d.rendijas, 4).map((r, i) => {
      const ancho = numero(r.ancho, L / 20, 1e-6, L), n = Math.round(numero(r.n, 1, 1, 6));
      return { nombre: texto(r.nombre, `Rendija ${i + 1}`, 24), centro: pt(r.centro, cen), angulo: numero(r.angulo, Math.PI / 2, -10, 10), ancho, n, separacion: numero(r.separacion, 2 * ancho, ancho * 1.0001, 2 * L), grosor: numero(r.grosor, L / 50, 1e-6, L / 4) };
    });
    const zonas = lista(d.zonas, 6).map((z, i) => {
      const nombre = texto(z.nombre, `Zona ${i + 1}`, 32), vz = numero(z.rapidez, rapidez / 2, 1e-4, 1e5);
      if (z.forma === 'poligono') {
        const puntos = lista(z.puntos, 12).length ? z.puntos.filter(p => Array.isArray(p)).slice(0, 12).map(p => pt(p, cen)) : [];
        if (puntos.length >= 3) return { nombre, forma: 'poligono', puntos, rapidez: vz };
      }
      const zx0 = numero(z.x0, caja.x0, -1e6, 1e6), zy0 = numero(z.y0, caja.y0, -1e6, 1e6);
      const o = { nombre, forma: 'rect', x0: zx0, x1: numero(z.x1, zx0 + L / 4, zx0 + 1e-6, 1e6), y0: zy0, y1: numero(z.y1, zy0 + L / 4, zy0 + 1e-6, 1e6), rapidez: vz };
      if (z.rapidez1 != null) o.rapidez1 = numero(z.rapidez1, vz, 1e-4, 1e5);
      return o;
    });
    const par = v => (Array.isArray(v) && v.length === 2 ? [pt(v[0], cen), pt(v[1], cen)] : null);
    const variables = {};
    for (const [k, v] of Object.entries(d.variables && typeof d.variables === 'object' ? d.variables : {})) {
      if (!v || !Array.isArray(v.liga) || !/^[A-Za-z]\w{0,7}$/.test(k)) continue;
      const min = numero(v.min, 0, -1e6, 1e6), max = Math.max(min, numero(v.max, 1, -1e6, 1e6));
      const liga = v.liga.map(l => (typeof l === 'string' ? l : Array.isArray(l) && typeof l[0] === 'string' ? [l[0], numero(l[1], 1, -1e3, 1e3)] : null)).filter(l => l && RUTA_OK.test(rutaDe(l))).slice(0, 16);
      if (liga.length) variables[k] = { sim: texto(v.sim, k, 3), sub: v.sub ? texto(v.sub, '', 6) : undefined, val: numero(v.val, min, min, max), min, max, paso: numero(v.paso, 0.1, 1e-9, 1e6), u: texto(v.u, '', 6), factor: numero(v.factor, 1, 1e-12, 1e12), liga };
    }
    const capas = {}; for (const k of Object.keys(base.capas)) capas[k] = typeof d.capas?.[k] === 'boolean' ? d.capas[k] : base.capas[k];
    const bordes = {}; for (const k of ['izq', 'der', 'abajo', 'arriba']) bordes[k] = d.bordes?.[k] === 'reflectante' ? 'reflectante' : 'absorbente';
    const r = {
      clave: ESCENAS.some(e => e.clave === d.clave) ? d.clave : 'propio', titulo: texto(d.titulo, base.titulo, 80), tipo: ['Tutorial', 'Ejemplo', 'MEXT', 'Propio'].includes(d.tipo) ? d.tipo : 'Propio',
      anio: d.anio ? texto(d.anio, '', 14) : undefined, medio: d.medio === 'aire' ? 'aire' : 'agua', ul: ['m', 'cm', 'mm'].includes(d.ul) ? d.ul : 'm', ua: ['mm', 'µm', 'nm', 'cm', 'm'].includes(d.ua) ? d.ua : 'mm',
      caja, rapidez, bordes, fuentes, lineas, barreras, rendijas, zonas,
      marcas: lista(d.marcas, 8).map(m => ({ nombre: texto(m.nombre, '·', 3), p: pt(m.p, cen) })),
      P: Array.isArray(d.P) ? pt(d.P, cen) : null, nombreP: texto(d.nombreP, 'P', 3), regla: par(d.regla), pantalla: par(d.pantalla),
      duracion: numero(d.duracion, base.duracion, 1e-6, 1e5), ppl: [10, 14, 20].includes(d.ppl) ? d.ppl : 14,
      vista: ['onda', 'frentes', 'intensidad'].includes(d.vista) ? d.vista : 'onda', mapa: d.mapa === 'divergente' ? 'divergente' : 'tinta',
      modelo: d.modelo === 'analitico' ? 'analitico' : 'malla', contraste: [0.5, 1, 2, 4].includes(d.contraste) ? d.contraste : 1,
      capas, variables, velocidad: numero(d.velocidad, base.velocidad, 1e-4, 10),
    };
    const per = 1 / Math.min(...[...r.fuentes.map(f => f.f), ...r.lineas.map(l => l.f), 1e7]);
    r.duracion = Math.min(r.duracion, 600 * per);
    if (r.modelo === 'analitico' && !(r.fuentes.length && r.fuentes.every(f => f.forma === 'senoidal') && !r.lineas.length && !r.barreras.length && !r.rendijas.length && !r.zonas.length)) r.modelo = 'malla';
    return r;
  }
  const selValida = s => s === 'medio' || (s === 'punto' && ESC.P) || (s === 'regla' && ESC.regla) || (s === 'pantalla' && ESC.pantalla)
    || [['fuente:', 'fuentes'], ['linea:', 'lineas'], ['barrera:', 'barreras'], ['rendija:', 'rendijas'], ['zona:', 'zonas']].some(([p, k]) => s.startsWith(p) && +s.slice(p.length) < ESC[k].length);
  function restaurar(d) { ESC = datosSeguros(d); aplicarVariables(); if (!selValida(sel)) sel = 'medio'; titulo(); construirVariables(); inspector(); recalcular(); }
  function botonesHistorial() { $('#b-deshacer').disabled = !historial?.puedeDeshacer; $('#b-rehacer').disabled = !historial?.puedeRehacer; }
  function registrar() { if (historial && historial.registrar(instantanea())) botonesHistorial(); }
  function deshacer() { const d = historial?.deshacer(); if (d) { restaurar(d); botonesHistorial(); avisar('Cambio deshecho', false); } }
  function rehacer() { const d = historial?.rehacer(); if (d) { restaurar(d); botonesHistorial(); avisar('Cambio rehecho', false); } }
  $('#b-deshacer').addEventListener('click', deshacer);
  $('#b-rehacer').addEventListener('click', rehacer);
  function abrirEscena1(clave) {
    ESC = completa(escenaDe(clave)); aplicarVariables();
    sel = 'medio'; t = 0; jugando = false; vistaTocada = false; herramienta = null; marcarHerramienta();
    titulo(); construirVariables(); inspector(); encuadrar(); escala0 = tz.vista.escala; zoomTexto(); recalcular();
    if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); }
  }
  function guardar() { guardarEscena(escenaActual()).then(r => { if (r) avisar('Escena guardada', false); }, e => avisar(`No se pudo guardar: ${e}`, false)); }
  const PAGINAS_ONDAS = { 'medio-1d': 'ondas.html', doppler: 'ondas-doppler.html', cubeta: 'ondas-cubeta.html' };
  // Una escena de otro espacio de Ondas y sonido se abre en su pantalla
  function aOtroEspacio(e, propio) {
    if (!e.espacio || e.espacio === propio || !PAGINAS_ONDAS[e.espacio]) return false;
    try { sessionStorage.setItem('volta.abrir', JSON.stringify(e)); } catch { /* sin almacenamiento */ }
    location.href = PAGINAS_ONDAS[e.espacio];
    return true;
  }
  function abrir() {
    abrirEscena({ modulo: 'ondas' }).then(e => {
      if (aOtroEspacio(e, 'cubeta')) return;
      t = 0; restaurar(e.datos); vistaTocada = false; encuadrar(); escala0 = tz.vista.escala; zoomTexto(); todo();
      if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); }
      avisar(`Escena abierta: ${texto(e.titulo, 'sin título', 60)}`, false);
    }).catch(err => avisar(err.message, false));
  }

  // ---------------------------------------------------------------------
  // Exportar
  // ---------------------------------------------------------------------
  function exportarSerie() {
    if (!ESC.P) { avisar('Coloca el punto de prueba para exportar u(t)', false); return; }
    const s = serieP(), filas = s.t.map((x, k) => [x, s.y[k]]);
    descargarTexto(`${nombreArchivo(ESC.titulo)}-u-en-${ESC.nombreP || 'P'}.csv`, aCSV(['t (s)', `u en ${ESC.nombreP || 'P'} (m)`], filas)).then(r => { if (r) avisarLienzo(area, `Datos exportados: ${filas.length} filas`); });
  }
  function exportarPantalla() {
    if (!ESC.pantalla) { avisar('Coloca una pantalla para exportar su amplitud', false); return; }
    const pts = puntosPantalla(), am = amplitudesPantalla(pts), u = campoEn(t).u;
    const filas = pts.map((q, k) => [q.s, q.p[0], q.p[1], enVentana(u, q.p[0], q.p[1]), am[k]]);
    descargarTexto(`${nombreArchivo(ESC.titulo)}-pantalla-t${fmt(t, 3)}s.csv`, aCSV(['s (m)', 'x (m)', 'y (m)', 'u (m)', 'A (m)'], filas)).then(r => { if (r) avisarLienzo(area, `Pantalla exportada: ${filas.length} puntos`); });
  }
  function exportarPNG() { descargarLienzo(lienzo, `${nombreArchivo(ESC.titulo)}-t${fmt(t, 3)}s.png`).then(r => { if (r) avisarLienzo(area, 'Imagen del lienzo exportada'); }); }
  $('#b-exportar').addEventListener('click', () => (ESC.P ? exportarSerie() : exportarPantalla()));

  // ---------------------------------------------------------------------
  // Reproducción: la malla avanza por pasos dentro de cada cuadro
  // ---------------------------------------------------------------------
  function cuadro(ahora) {
    const dtReal = Math.min(0.05, Math.max(0, (ahora - ultimo) / 1000));
    ultimo = ahora;
    let hubo = false;
    if (pendiente != null && SIM && !usarAnalitico()) {
      // Recalcula hasta donde estaba la reproducción, mostrando el avance
      avanzarSim(pendiente, 30);
      t = SIM.t;
      if (SIM.t + SIM.dt / 2 > pendiente) { t = Math.min(pendiente, SIM.t); pendiente = null; }
      hubo = true;
    } else if (jugando) {
      const deseado = Math.min(ESC.duracion, t + dtReal * velocidad);
      if (!usarAnalitico() && SIM && deseado > SIM.t) avanzarSim(deseado);
      t = Math.min(deseado, frontera());
      if (t >= ESC.duracion - 1e-12) jugando = false;
      hubo = true;
    }
    if (hubo) todo();
    requestAnimationFrame(cuadro);
  }
  function alternar() { if (t >= ESC.duracion - 1e-12) t = 0; jugando = !jugando; pendiente = null; todo(); }
  const pasoCuadro = () => (SIM ? SIM.pelicula.K * SIM.dt : ESC.duracion / 400);
  const irA = nt => { jugando = false; pendiente = null; t = Math.max(0, Math.min(frontera(), nt)); todo(); };
  $('#b-play').addEventListener('click', alternar);
  $('#b-reiniciar').addEventListener('click', () => irA(0));
  $('#b-atras').addEventListener('click', () => irA(t - pasoCuadro()));
  $('#b-adelante').addEventListener('click', () => {
    if (SIM && !usarAnalitico() && t + pasoCuadro() > SIM.t) { avanzarSim(Math.min(ESC.duracion, t + pasoCuadro()), 200); }
    irA(t + pasoCuadro());
  });
  $('#velocidades').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) velocidad = parseFloat(b.dataset.v); });
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => { const k = b.dataset.capa; ESC.capas[k] = !ESC.capas[k]; b.setAttribute('aria-pressed', String(ESC.capas[k])); registrar(); todo(); }));
  $('#vistas').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) ponerVista(b.dataset.vista); });
  $('#pest').addEventListener('click', () => setTimeout(todo, 0));

  // ---------------------------------------------------------------------
  // Paleta de objetos e instrumentos
  // ---------------------------------------------------------------------
  const CON_ARRASTRE = ['linea', 'barrera', 'zona', 'regla', 'pantalla'];
  function marcarHerramienta() {
    document.querySelectorAll('.herr').forEach(b => { if (!['analitica', 'intensidad'].includes(b.dataset.herr)) b.setAttribute('aria-pressed', String(b.dataset.herr === herramienta)); });
    lienzo.style.cursor = herramienta ? 'crosshair' : 'default';
  }
  function ponerHerramienta(h) {
    if (h === 'analitica') { ponerModelo(usarAnalitico() ? 'malla' : 'analitico'); titulo(); return; }
    if (h === 'intensidad') { ponerVista(ESC.vista === 'intensidad' ? 'onda' : 'intensidad'); return; }
    herramienta = herramienta === h ? null : h; marcarHerramienta();
    const msj = {
      fuente: 'Fuente puntual: clic en la cubeta', linea: 'Fuente lineal: arrastra de un extremo al otro', arreglo: 'Arreglo de fuentes: clic donde va su centro',
      barrera: 'Barrera: arrastra de un extremo al otro', rendija: 'Rendija: clic donde va la abertura (pared vertical)', zona: 'Zona de rapidez: arrastra un rectángulo',
      punto: 'Punto de prueba: clic donde va', regla: 'Regla: arrastra entre dos puntos', pantalla: 'Pantalla: arrastra de un extremo al otro',
    }[herramienta];
    if (msj) avisar(`${msj} · Esc termina`, false);
  }
  document.querySelectorAll('.herr').forEach(b => b.addEventListener('click', () => ponerHerramienta(b.dataset.herr)));
  // Ajuste de las posiciones al colocar: un paso de unos pocos píxeles, redondo
  const ajuste = (p, fino) => { const q = pasoAgradable((fino ? 1 : 4) / tz.vista.escala); return [Math.round(p[0] / q) * q, Math.round(p[1] / q) * q].map(x => Number(x.toPrecision(10))); };
  function colocar(p, ev) {
    const f0 = ESC.fuentes[0]?.f || ESC.lineas[0]?.f || Number((ESC.rapidez / (0.08 * (ESC.caja.x1 - ESC.caja.x0))).toPrecision(2));
    const A0 = ESC.fuentes[0]?.A || ESC.lineas[0]?.A || (ESC.medio === 'agua' ? 0.001 : 1e-6), lam = ESC.rapidez / f0;
    if (herramienta === 'fuente' && ESC.fuentes.length < 12) { ESC.fuentes.push({ nombre: `S${subs(ESC.fuentes.length + 1)}`, p, f: f0, A: A0, fase: 0 }); sel = 'fuente:' + (ESC.fuentes.length - 1); }
    else if (herramienta === 'arreglo' && ESC.fuentes.length <= 5) {
      for (let k = 0; k < 7; k++) ESC.fuentes.push({ nombre: `S${subs(ESC.fuentes.length + 1)}`, p: [p[0], Number((p[1] + (k - 3) * lam / 4).toPrecision(10))], f: f0, A: A0 * 0.6, fase: 0 });
      sel = 'fuente:' + (ESC.fuentes.length - 4);
    } else if (herramienta === 'rendija' && ESC.rendijas.length < 4) { ESC.rendijas.push({ nombre: 'Rendija', centro: p, angulo: Math.PI / 2, ancho: Number(lam.toPrecision(3)), n: 1, separacion: Number((3 * lam).toPrecision(3)), grosor: Number((0.02 * (ESC.caja.x1 - ESC.caja.x0)).toPrecision(2)) }); sel = 'rendija:' + (ESC.rendijas.length - 1); }
    else if (herramienta === 'punto') { ESC.P = p; sel = 'punto'; }
    else { avisar('No caben más objetos de este tipo', false); return; }
    if (!ev.shiftKey) { herramienta = null; marcarHerramienta(); }
    cambio();
  }
  function terminarTrazo(a, b, h) {
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 8 / tz.vista.escala) { avisar('Arrastra un poco más para trazarlo', false); return; }
    const f0 = ESC.fuentes[0]?.f || ESC.lineas[0]?.f || 5, A0 = ESC.fuentes[0]?.A || ESC.lineas[0]?.A || (ESC.medio === 'agua' ? 0.001 : 1e-6);
    if (h === 'regla') { ESC.regla = [a, b]; sel = 'regla'; }
    else if (h === 'pantalla') { ESC.pantalla = [a, b]; sel = 'pantalla'; }
    else if (h === 'linea' && ESC.lineas.length < 4) { ESC.lineas.push({ nombre: `Generador ${ESC.lineas.length + 1}`, a, b, f: f0, A: A0, fase: 0, desvio: 0 }); sel = 'linea:' + (ESC.lineas.length - 1); }
    else if (h === 'barrera' && ESC.barreras.length < 8) { ESC.barreras.push({ nombre: `Barrera ${ESC.barreras.length + 1}`, a, b, grosor: Number((0.02 * (ESC.caja.x1 - ESC.caja.x0)).toPrecision(2)) }); sel = 'barrera:' + (ESC.barreras.length - 1); }
    else if (h === 'zona' && ESC.zonas.length < 6) { ESC.zonas.push({ nombre: `Zona ${ESC.zonas.length + 1}`, forma: 'rect', x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]), rapidez: Number((ESC.rapidez * 0.6).toPrecision(3)) }); sel = 'zona:' + (ESC.zonas.length - 1); }
    else { avisar('No caben más objetos de este tipo', false); return; }
    cambio();
  }
  function quitarSeleccion() {
    const quita = (pref, k, txt) => { if (!sel.startsWith(pref)) return false; ESC[k].splice(+sel.slice(pref.length), 1); limpiarVariables(); sel = 'medio'; construirVariables(); cambio(); avisar(txt); return true; };
    if (quita('fuente:', 'fuentes', 'Se quita la fuente') || quita('linea:', 'lineas', 'Se quita la fuente lineal') || quita('barrera:', 'barreras', 'Se quita la barrera') || quita('rendija:', 'rendijas', 'Se quita la rendija') || quita('zona:', 'zonas', 'Se quita la zona')) {
      if (usarAnalitico() && !analiticoValido()) ponerModelo('malla');
      return;
    }
    if (sel === 'punto') { ESC.P = null; limpiarVariables(); }
    else if (sel === 'regla') ESC.regla = null;
    else if (sel === 'pantalla') ESC.pantalla = null;
    else return;
    const que = { punto: 'el punto de prueba', regla: 'la regla', pantalla: 'la pantalla' }[sel];
    sel = 'medio'; cambio(); avisar(`Se quita ${que}`);
  }
  // Las variables que apuntaban a algo que ya no existe se quitan
  function limpiarVariables() { for (const [k, d] of Object.entries(ESC.variables)) { d.liga = d.liga.filter(l => leer(rutaDe(l)) !== undefined && leer(rutaDe(l)) !== null); if (!d.liga.length) delete ESC.variables[k]; } }

  // ---------------------------------------------------------------------
  // Lienzo: selección, arrastre, zoom y paneo
  // ---------------------------------------------------------------------
  const distSeg = (X, Y, a, b) => { const v = tz.vista, [xa, ya] = v.P(a), [xb, yb] = v.P(b), dx = xb - xa, dy = yb - ya, L2 = dx * dx + dy * dy || 1, s = Math.max(0, Math.min(1, ((X - xa) * dx + (Y - ya) * dy) / L2)); return Math.hypot(X - xa - s * dx, Y - ya - s * dy); };
  function objetoEn(X, Y) {
    const v = tz.vista, cerca = (p, r) => Math.hypot(X - v.X(p[0]), Y - v.Y(p[1])) < r;
    if (ESC.P && cerca(ESC.P, 9)) return 'punto';
    for (const [k, nom] of [['regla', 'regla'], ['pantalla', 'pantalla']]) if (ESC[k]) { for (const j of [0, 1]) if (cerca(ESC[k][j], 8)) return `${nom}:${j}`; }
    for (let i = ESC.fuentes.length - 1; i >= 0; i--) if (cerca(ESC.fuentes[i].p, 10)) return 'fuente:' + i;
    for (let i = ESC.lineas.length - 1; i >= 0; i--) { const [a, b] = recorteSegmento(ESC.lineas[i].a, ESC.lineas[i].b); if (a && distSeg(X, Y, a, b) < 7) return 'linea:' + i; }
    if (ESC.regla && distSeg(X, Y, ESC.regla[0], ESC.regla[1]) < 6) return 'regla';
    if (ESC.pantalla && distSeg(X, Y, ESC.pantalla[0], ESC.pantalla[1]) < 6) return 'pantalla';
    for (let i = ESC.barreras.length - 1; i >= 0; i--) { const b = ESC.barreras[i]; if (distSeg(X, Y, b.a, b.b) < Math.max(6, b.grosor / 2 * v.escala + 3)) return 'barrera:' + i; }
    for (let i = ESC.rendijas.length - 1; i >= 0; i--) { const r = ESC.rendijas[i]; if (segmentosRendija(r, 3 * Math.hypot(ESC.caja.x1 - ESC.caja.x0, ESC.caja.y1 - ESC.caja.y0)).some(s => distSeg(X, Y, s.a, s.b) < Math.max(6, r.grosor / 2 * v.escala + 3))) return 'rendija:' + i; }
    const x = v.mx(X), y = v.my(Y);
    for (let i = ESC.zonas.length - 1; i >= 0; i--) {
      const z = ESC.zonas[i];
      const dentroZ = z.forma === 'poligono' ? rapidezEn({ rapidez: -1, zonas: [z] }, x, y) !== -1 : x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;
      if (dentroZ && x >= ESC.caja.x0 && x <= ESC.caja.x1 && y >= ESC.caja.y0 && y <= ESC.caja.y1) return 'zona:' + i;
    }
    return null;
  }
  // Mover un objeto entero d (mundo)
  function mover(ob, d) {
    const m = p => [p[0] + d[0], p[1] + d[1]];
    if (ob === 'punto') ESC.P = m(ESC.P);
    else if (ob === 'regla' || ob === 'pantalla') ESC[ob] = ESC[ob].map(m);
    else if (/^(regla|pantalla):[01]$/.test(ob)) { const [k, j] = ob.split(':'); ESC[k][+j] = m(ESC[k][+j]); }
    else if (ob.startsWith('fuente:')) { const f = ESC.fuentes[+ob.slice(7)]; f.p = m(f.p); }
    else if (ob.startsWith('linea:')) { const l = ESC.lineas[+ob.slice(6)]; l.a = m(l.a); l.b = m(l.b); }
    else if (ob.startsWith('barrera:')) { const b = ESC.barreras[+ob.slice(8)]; b.a = m(b.a); b.b = m(b.b); }
    else if (ob.startsWith('rendija:')) { const r = ESC.rendijas[+ob.slice(8)]; r.centro = m(r.centro); }
    else if (ob.startsWith('zona:')) { const z = ESC.zonas[+ob.slice(5)]; if (z.forma === 'poligono') z.puntos = z.puntos.map(m); else { z.x0 += d[0]; z.x1 += d[0]; z.y0 += d[1]; z.y1 += d[1]; } }
  }
  const redondear = o => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' ? Number(v.toPrecision(8)) : v)));
  lienzo.addEventListener('pointerdown', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, v = tz.vista;
    if (ev.button === 1 || ev.button === 2 || espacioPulsado) { paneo = [X, Y, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId); return; }
    const p = ajuste([v.mx(X), v.my(Y)], ev.shiftKey);
    if (herramienta && CON_ARRASTRE.includes(herramienta)) { trazoNuevo = { a: p, b: p, h: herramienta }; lienzo.setPointerCapture(ev.pointerId); return; }
    if (herramienta) { colocar(p, ev); return; }
    const ob = objetoEn(X, Y);
    if (ob) {
      const s = ob.replace(/:[01]$/, m => (/^(regla|pantalla)/.test(ob) ? '' : m));
      if (sel !== s) { sel = s; inspector(); todo(); }
      arrastre = { ob, desde: [v.mx(X), v.my(Y)], movido: false }; lienzo.setPointerCapture(ev.pointerId); return;
    }
    if (sel !== 'medio') { sel = 'medio'; inspector(); todo(); }
    paneo = [X, Y, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId);
  });
  lienzo.addEventListener('pointermove', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, v = tz.vista;
    $('#cx').textContent = largo(v.mx(X), 4); $('#cy').textContent = largo(v.my(Y), 4);
    if (paneo) { vistaTocada = true; v.ox = paneo[2] + X - paneo[0]; v.oy = paneo[3] + Y - paneo[1]; dibujar(); return; }
    if (trazoNuevo) { trazoNuevo.b = ajuste([v.mx(X), v.my(Y)], ev.shiftKey); dibujar(); return; }
    if (arrastre) {
      const p = [v.mx(X), v.my(Y)], q = ajuste([p[0] - arrastre.desde[0], p[1] - arrastre.desde[1]], ev.shiftKey);
      if (q[0] || q[1]) { mover(arrastre.ob, q); arrastre.desde = [arrastre.desde[0] + q[0], arrastre.desde[1] + q[1]]; arrastre.movido = true; D.tCampo = usarAnalitico() ? null : D.tCampo; dibujar(); }
      return;
    }
    const h = objetoEn(X, Y);
    lienzo.style.cursor = herramienta ? 'crosshair' : h ? 'grab' : 'default';
  });
  lienzo.addEventListener('pointerup', () => {
    if (trazoNuevo) { const { a, b, h } = trazoNuevo; trazoNuevo = null; terminarTrazo(a, b, h); if (herramienta && !espacioPulsado) { herramienta = null; marcarHerramienta(); } }
    if (arrastre && arrastre.movido) { ESC = Object.assign(ESC, redondear(ESC)); cambio(); }
    arrastre = null; paneo = null;
  });
  lienzo.addEventListener('contextmenu', ev => ev.preventDefault());
  lienzo.addEventListener('wheel', ev => { ev.preventDefault(); const r = lienzo.getBoundingClientRect(); vistaTocada = true; tz.vista.zoom(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top); zoomTexto(); dibujar(); }, { passive: false });
  function zoomTexto() { $('#zoom').textContent = Math.round(tz.vista.escala / escala0 * 100) + ' %'; }
  function zoomCentro(f) { vistaTocada = true; tz.vista.zoom(f, tz.w / 2, tz.h / 2); zoomTexto(); dibujar(); }
  function encuadrarTodo() { vistaTocada = false; encuadrar(); escala0 = tz.vista.escala; zoomTexto(); dibujar(); }
  $('#b-zoom-mas').addEventListener('click', () => zoomCentro(1.25)); $('#b-zoom-menos').addEventListener('click', () => zoomCentro(0.8)); $('#b-encuadrar').addEventListener('click', encuadrarTodo);

  // ---------------------------------------------------------------------
  // Menú de escenas, comandos y teclado
  // ---------------------------------------------------------------------
  const ICONO_TIPO = { Tutorial: 'i-tutorial', Ejemplo: 'i-ejemplo', MEXT: 'i-mext' };
  function menuEscenas() {
    const m = $('#menu-escenas'); if (!m.hidden) { m.hidden = true; return; }
    m.innerHTML = [['Tutorial', 'Tutoriales'], ['Ejemplo', 'Ejemplos'], ['MEXT', 'MEXT']].map(([g, tit], i) => (i ? '<div class="menu-sep"></div>' : '') + `<div class="menu-titulo">${tit}</div>` + ESCENAS.filter(e => e.tipo === g).map(e =>
      `<div class="menu-item" role="menuitem" data-clave="${e.clave}"${ESC.clave === e.clave ? ' aria-current="true"' : ''}><svg class="ico"><use href="#${ICONO_TIPO[g]}"/></svg>${e.titulo}${e.anio ? `<span class="chip lleno">${e.anio}</span>` : ''}</div>`).join('')).join('');
    const r = $('#b-escenas').getBoundingClientRect(); m.style.left = r.left + 'px'; m.style.top = (r.bottom + 4) + 'px'; m.hidden = false;
  }
  $('#b-escenas').addEventListener('click', ev => { ev.stopPropagation(); menuEscenas(); });
  $('#menu-escenas').addEventListener('click', ev => { const it = ev.target.closest('.menu-item'); if (!it) return; $('#menu-escenas').hidden = true; abrirEscena1(it.dataset.clave); });
  document.addEventListener('pointerdown', ev => { if (ev.target instanceof Element && !ev.target.closest('#menu-escenas, #b-escenas')) $('#menu-escenas').hidden = true; });
  const COMANDOS = [
    ['i-reproducir', 'Reproducir o pausar', 'Espacio', alternar],
    ['i-reiniciar', 'Reiniciar', 'Inicio', () => irA(0)],
    ['i-encuadrar', 'Encuadrar todo', 'F', encuadrarTodo],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['o-onda-analitica', 'Vista: onda', '', () => ponerVista('onda')], ['o-onda-analitica', 'Vista: frentes (crestas)', 'W', () => ponerVista('frentes')], ['n-intensidad', 'Vista: intensidad', 'I', () => ponerVista('intensidad')],
    ['o-onda-analitica', 'Cambiar entre malla y modelo analítico', 'O', () => ponerModelo(usarAnalitico() ? 'malla' : 'analitico')],
    ['i-capas', 'Mostrar u ocultar las líneas nodales', 'N', () => { ESC.capas.nodales = !ESC.capas.nodales; titulo(); registrar(); todo(); }],
    ['o-fuente-puntual', 'Colocar una fuente puntual', '', () => ponerHerramienta('fuente')], ['o-fuente-lineal', 'Colocar una fuente lineal', '', () => ponerHerramienta('linea')],
    ['o-arreglo-fuentes', 'Colocar un arreglo de fuentes', '', () => ponerHerramienta('arreglo')], ['o-barrera', 'Colocar una barrera', '', () => ponerHerramienta('barrera')],
    ['o-rendija', 'Colocar una rendija', '', () => ponerHerramienta('rendija')], ['o-zona-velocidad', 'Colocar una zona de otra rapidez', '', () => ponerHerramienta('zona')],
    ['n-microfono', 'Colocar el punto de prueba', 'P', () => ponerHerramienta('punto')], ['n-regla', 'Medir con la regla', 'R', () => ponerHerramienta('regla')], ['n-detector', 'Colocar una pantalla', '', () => ponerHerramienta('pantalla')],
    ['i-deshacer', 'Deshacer', 'Ctrl Z', deshacer], ['i-rehacer', 'Rehacer', 'Ctrl Y', rehacer],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar], ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
    ['i-exportar', 'Exportar u(t) en el punto de prueba (CSV)', '', exportarSerie], ['i-exportar', 'Exportar la amplitud en la pantalla (CSV)', '', exportarPantalla], ['i-imagen', 'Exportar imagen del lienzo', '', exportarPNG],
    ...ESCENAS.map(e => [ICONO_TIPO[e.tipo], `Abrir escena: ${e.titulo}`, e.tipo === 'MEXT' ? `MEXT ${e.anio}` : e.tipo, () => abrirEscena1(e.clave), 'Escenas']),
  ];
  let selCmd = 0;
  function pintarComandos() {
    const qq = $('#cmd-q').value.trim().toLowerCase(), lista = COMANDOS.filter(c => c[1].toLowerCase().includes(qq));
    selCmd = Math.min(selCmd, Math.max(0, lista.length - 1)); let g0 = null, html = '';
    lista.forEach((c, i) => { const g = c[4] || 'Acciones'; if (g !== g0) { html += `<div class="menu-titulo">${g}</div>`; g0 = g; } html += `<div class="menu-item${i === selCmd ? ' activo' : ''}" data-i="${COMANDOS.indexOf(c)}"><svg class="ico"><use href="#${c[0]}"/></svg>${c[1]}<span class="atajo">${c[2]}</span></div>`; });
    $('#cmd-lista').innerHTML = html; return lista;
  }
  function abrirComandos() { $('#menu-escenas').hidden = true; $('#velo-comandos').hidden = false; $('#cmd-q').value = ''; selCmd = 0; pintarComandos(); $('#cmd-q').focus(); }
  const cerrarComandos = () => { $('#velo-comandos').hidden = true; };
  $('#b-comandos').addEventListener('click', abrirComandos);
  $('#cmd-q').addEventListener('input', () => { selCmd = 0; pintarComandos(); });
  $('#cmd-lista').addEventListener('click', ev => { const it = ev.target.closest('.menu-item'); if (it) { cerrarComandos(); COMANDOS[+it.dataset.i][3](); } });
  $('#velo-comandos').addEventListener('click', ev => { if (ev.target instanceof Element && ev.target.id === 'velo-comandos') cerrarComandos(); });
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
    else if (ev.key === 'ArrowRight') $('#b-adelante').click();
    else if (ev.key === 'ArrowLeft') irA(t - pasoCuadro());
    else if (ev.key === 'Home') irA(0);
    else if (ev.key === 'Escape') { if (herramienta) { herramienta = null; marcarHerramienta(); } trazoNuevo = null; }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') quitarSeleccion();
    else if (tecla === 'f') encuadrarTodo();
    else if (tecla === 'w') ponerVista('frentes');
    else if (tecla === 'i') ponerVista(ESC.vista === 'intensidad' ? 'onda' : 'intensidad');
    else if (tecla === 'o') ponerModelo(usarAnalitico() ? 'malla' : 'analitico');
    else if (tecla === 'n') { ESC.capas.nodales = !ESC.capas.nodales; titulo(); registrar(); todo(); }
    else if (tecla === 'p') ponerHerramienta('punto');
    else if (tecla === 'r') ponerHerramienta('regla');
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });

  // ---------------------------------------------------------------------
  // Arranque. Parámetros para capturas: ?escena=…&t=…&vista=…&pest=…&sel=…&capas=nodales
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); if (!vistaTocada) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search), limpio = ![...q.keys()].filter(k => k !== 'tema').length;
    const pend = escenaPendiente('ondas');
    if (pend && aOtroEspacio(pend, 'cubeta')) return;
    const previa = pend || (limpio ? autoguardado.leer('ondas-cubeta', { modulo: 'ondas' }) : null);
    tz.ajustar();
    if (q.has('escena') || !previa || (previa.espacio && previa.espacio !== 'cubeta')) ESC = completa(escenaDe(q.get('escena')));
    else ESC = datosSeguros(previa.datos);
    aplicarVariables();
    if (q.has('vista') && ['onda', 'frentes', 'intensidad'].includes(q.get('vista'))) ESC.vista = q.get('vista');
    if (q.has('capas')) for (const k of q.get('capas').split(',')) if (k in ESC.capas) ESC.capas[k] = true;
    if (q.has('modelo') && q.get('modelo') === 'analitico' && analiticoValido()) ESC.modelo = 'analitico';
    if (q.has('sel')) { const s = q.get('sel'); if (selValida(s)) sel = s; }
    autoguardar = limpio || !!previa;
    titulo(); construirVariables(); inspector(); encuadrar(); escala0 = tz.vista.escala; zoomTexto();
    recalcular();
    // Instante pedido (capturas): se calcula de una vez antes de dibujar
    if (q.has('t')) {
      const tt = Math.max(0, Math.min(ESC.duracion, parseFloat(q.get('t')) || 0));
      if (SIM && !usarAnalitico()) { while (SIM.t + SIM.dt / 2 <= tt) SIM.paso(); t = SIM.t; } else t = tt;
      pendiente = null;
    }
    const pe = q.get('pest'); if (pe) { const b = document.querySelector(`#pest [aria-controls="p-${pe}"]`); if (b) b.click(); }
    inspector(); todo();
    historial = new Historial(instantanea()); botonesHistorial();
    requestAnimationFrame(a => { ultimo = a; requestAnimationFrame(cuadro); });
  });
})();
