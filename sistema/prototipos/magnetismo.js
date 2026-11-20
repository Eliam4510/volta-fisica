/* ==========================================================================
   Volta · Magnetismo e inducción — espacio de trabajo «Campos magnéticos»
   Hilos, segmentos, espiras, solenoides e imanes; sondas de B, brújulas y
   la fuerza entre corrientes. La física está en el motor puro
   sistema/motores/magnetismo.js (probado en pruebas/magnetismo.test.js):
   Biot–Savart exacto (hilo, segmento, espira con integrales elípticas,
   solenoide de lámina de corriente), dipolos, superposición y líneas de
   campo. El mundo es el plano z = 0 de un espacio 3D: un hilo puede ser
   perpendicular al plano (⊙ o ⊗) o estar en él; una espira se ve de frente
   o de canto. Sin evolución temporal: cada cambio se recalcula al
   instante, también mientras se arrastra.
   Misma estructura que optica.js: escena → motor → lienzo → paneles.
   Mundo en metros; la pantalla escribe las longitudes en la unidad de la
   escena (cm por defecto).
   Parámetros de URL para capturas: ?escena=…&tema=…&sel=<id>|escena
   &pest=sondas|fuerzas&capas=vectores,lineas
   ========================================================================== */
import {
  MU0, campoB, campoEspiraEje, campoSolenoideEje, campoDipolo, fuerzaPorLargo, fuerzaSegmento, lineasCampo, anguloBrujula,
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
  const { Trazo, fmt, cantidad, conPrefijo, grafica } = Volta;
  const $ = s => document.querySelector(s);
  const GR = Math.PI / 180;
  const FAC = { m: 1, cm: 1e-2, mm: 1e-3, A: 1, mA: 1e-3, '°': GR, '': 1, 'A·m²': 1 };
  const numCampo = x => String(Number(Number(x).toPrecision(6))).replace('-', '−');
  const simHTML = (a, sub, recto = true) => `<span class="sim">${a}${sub ? `<sub${recto ? ' class="r"' : ''}>${sub}</sub>` : ''}</span>`;
  const dir = a => [Math.cos(a), Math.sin(a)];
  const grados = r => fmt(r / GR, 3) + '°';
  const DIM_MOMENTO = [2, 0, 0, 1, 0, 0];

  // ---------------------------------------------------------------------
  // Tipos de objeto
  // ---------------------------------------------------------------------
  const TIPOS = {
    hilo: { nombre: 'Hilo infinito', en: 'Long straight wire', ico: 'o-hilo-corriente' },
    segmento: { nombre: 'Segmento con corriente', en: 'Current segment', ico: 'o-segmento-corriente' },
    espira: { nombre: 'Espira circular', en: 'Current loop', ico: 'o-espira' },
    'espira-rect': { nombre: 'Espira rectangular', en: 'Rectangular loop', ico: 'o-espira-movil' },
    solenoide: { nombre: 'Solenoide', en: 'Solenoid', ico: 'o-solenoide' },
    iman: { nombre: 'Imán de barra', en: 'Bar magnet', ico: 'o-iman' },
    sonda: { nombre: 'Sonda de B', en: 'Field probe', ico: 'n-sonda-b', instrumento: true },
    brujula: { nombre: 'Brújula', en: 'Compass', ico: 'n-brujula', instrumento: true },
  };
  const esFuente = el => !TIPOS[el.tipo]?.instrumento;

  // ---------------------------------------------------------------------
  // Escenas (mundo en m). Variables: valor en su unidad de pantalla;
  // valor físico = val·factor + offset en cada ruta que fijan.
  // ---------------------------------------------------------------------
  const vari = (sim, val, min, max, paso, u, factor, liga, o = {}) => ({ sim, sub: o.sub, val, min, max, paso, u, factor, offset: o.offset ?? 0, liga, factores: o.factores });
  const hilo = (nombre, centro, I, sentido = 1) => ({ tipo: 'hilo', nombre, centro, I, sentido });
  const sonda = (nombre, centro) => ({ tipo: 'sonda', nombre, centro });
  const brujula = (nombre, centro) => ({ tipo: 'brujula', nombre, centro });
  const anilloBrujulas = (r, n, a0 = 0) => Array.from({ length: n }, (_, k) => brujula(`Brújula ${k + 1}`, [r * Math.cos(a0 + 2 * Math.PI * k / n), r * Math.sin(a0 + 2 * Math.PI * k / n)]));
  const BASE = () => ({
    unidad: 'cm', elementos: [], variables: {}, regla: null,
    graficas: ['perfil', 'vertical', 'distancia'], capas: { lineas: true, vectores: false, perpendicular: true, fuerzas: true, valores: true },
    caja: null, sel: 'escena', nota: '',
  });
  const ESCENAS = [
    {
      clave: 'hilo-brujulas', titulo: 'Campo de un hilo y brújulas', tipo: 'Tutorial', graficas: ['distancia', 'perfil', 'vertical'],
      nota: 'Las brújulas se alinean con las circunferencias del campo. Cambia el sentido de la corriente en el inspector o mueve una brújula.',
      elementos: [hilo('Hilo', [0, 0], 5), ...anilloBrujulas(0.04, 8, Math.PI / 8), sonda('Sonda', [0.07, 0])],
      caja: [-0.1, 0.1, -0.07, 0.07], sel: 0,
      variables: { I: vari('I', 5, 0.5, 20, 0.5, 'A', 1, ['elementos.0.I']) },
    },
    {
      clave: 'espira-frente', titulo: 'Espira circular vista de frente', tipo: 'Tutorial', graficas: ['perfil', 'eje', 'vertical'],
      nota: 'Dentro de la espira el campo sale del plano (⊙) y fuera entra (⊗): el tamaño de los símbolos sigue a |B|.',
      elementos: [{ tipo: 'espira', nombre: 'Espira', centro: [0, 0], R: 0.04, I: 4, N: 10, vista: 'frente', angulo: 0, sentido: 1 }, sonda('Sonda', [0, 0])],
      caja: [-0.09, 0.09, -0.065, 0.065], sel: 0,
      variables: { I: vari('I', 4, 0.5, 20, 0.5, 'A', 1, ['elementos.0.I']), R: vari('R', 4, 1, 7, 0.5, 'cm', 0.01, ['elementos.0.R']) },
    },
    {
      clave: 'hilos-atraen', titulo: 'Dos hilos paralelos que se atraen', tipo: 'Ejemplo', graficas: ['fuerza', 'perfil', 'vertical'],
      nota: 'Corrientes en el mismo sentido: se atraen con μ0·I₁·I₂/(2π·d) por metro.',
      elementos: [hilo('Hilo 1', [-0.03, 0], 10), hilo('Hilo 2', [0.03, 0], 6), sonda('Sonda', [0, 0.04])],
      caja: [-0.11, 0.11, -0.07, 0.07], sel: 1,
      variables: { I1: vari('I', 10, 0, 30, 0.5, 'A', 1, ['elementos.0.I'], { sub: '1' }), I2: vari('I', 6, 0, 30, 0.5, 'A', 1, ['elementos.1.I'], { sub: '2' }), d: vari('x', 3, 1, 8, 0.1, 'cm', 0.01, ['elementos.1.centro.0'], { sub: '2' }) },
    },
    {
      clave: 'hilos-repelen', titulo: 'Dos hilos con corrientes opuestas se repelen', tipo: 'Ejemplo', graficas: ['fuerza', 'perfil', 'vertical'],
      nota: 'Con corrientes opuestas el campo entre los hilos se suma y se repelen.',
      elementos: [hilo('Hilo 1', [-0.03, 0], 10), hilo('Hilo 2', [0.03, 0], 10, -1), sonda('Sonda', [0, 0])],
      caja: [-0.11, 0.11, -0.07, 0.07], sel: 1,
      variables: { I: vari('I', 10, 0, 30, 0.5, 'A', 1, ['elementos.0.I', 'elementos.1.I']) },
    },
    {
      clave: 'solenoide', titulo: 'Campo de un solenoide', tipo: 'Ejemplo', graficas: ['eje', 'perfil', 'vertical'],
      nota: 'Dentro, el campo es casi uniforme y vale μ0·n·I; fuera de los extremos se abre como el de un imán.',
      elementos: [{ tipo: 'solenoide', nombre: 'Solenoide', centro: [0, 0], angulo: 0, largo: 0.12, R: 0.02, N: 200, I: 2, modo: 'finito', sentido: 1 }, sonda('Sonda', [0, 0]), brujula('Brújula', [0.1, 0.03])],
      caja: [-0.13, 0.13, -0.075, 0.075], sel: 0,
      variables: { I: vari('I', 2, 0.1, 5, 0.1, 'A', 1, ['elementos.0.I']), N: vari('N', 200, 20, 600, 10, '', 1, ['elementos.0.N']), L: vari('ℓ', 12, 3, 20, 0.5, 'cm', 0.01, ['elementos.0.largo']) },
    },
    {
      clave: 'espira-eje', titulo: 'Espira de canto: campo en su eje', tipo: 'Ejemplo', graficas: ['eje', 'perfil', 'vertical'],
      nota: 'La espira se ve de canto: sus dos cruces con el plano llevan corrientes opuestas. En el eje, B = μ0·N·I·R²/(2(R² + z²)^{3/2}).',
      elementos: [{ tipo: 'espira', nombre: 'Espira', centro: [0, 0], R: 0.03, I: 3, N: 20, vista: 'corte', angulo: 0, sentido: 1 }, sonda('Sonda', [0.03, 0])],
      caja: [-0.1, 0.1, -0.065, 0.065], sel: 1,
      variables: { z: vari('z', 3, -9, 9, 0.1, 'cm', 0.01, ['elementos.1.centro.0']), R: vari('R', 3, 1, 5, 0.1, 'cm', 0.01, ['elementos.0.R']) },
    },
    {
      clave: 'iman-brujulas', titulo: 'Imán de barra y brújulas', tipo: 'Ejemplo', graficas: ['eje', 'perfil', 'vertical'],
      nota: 'Las líneas salen del polo N y entran por el S; la aguja N de cada brújula señala a lo largo de ellas.',
      elementos: [{ tipo: 'iman', nombre: 'Imán', centro: [0, 0], angulo: 0, largo: 0.08, ancho: 0.016, momento: 2, modelo: 'bloque' }, ...anilloBrujulas(0.075, 10, Math.PI / 10), sonda('Sonda', [0.08, 0])],
      caja: [-0.12, 0.12, -0.08, 0.08], sel: 0,
      variables: { m: vari('m', 2, 0.2, 6, 0.1, 'A·m²', 1, ['elementos.0.momento']) },
    },
    {
      clave: 'segmento', titulo: 'Segmento con corriente junto a un hilo', tipo: 'Ejemplo', graficas: ['perfil', 'vertical', 'distancia'],
      nota: 'Un tramo de corriente en el plano crea un campo perpendicular a él (⊙ a un lado, ⊗ al otro). La fuerza sobre el tramo es I·L × B.',
      elementos: [{ tipo: 'segmento', nombre: 'Segmento', a: [-0.05, -0.02], b: [0.05, -0.02], I: 8 }, { tipo: 'hilo', nombre: 'Hilo del plano', centro: [0, 0.03], I: 15, sentido: 1, enPlano: true, angulo: 0 }, sonda('Sonda', [0, 0.005])],
      caja: [-0.1, 0.1, -0.065, 0.065], sel: 0,
      variables: { I: vari('I', 8, 0, 20, 0.5, 'A', 1, ['elementos.0.I']) },
    },
    // ----------------------------------------------------------------- MEXT
    {
      clave: 'mext-2019-1-3', titulo: 'Dos hilos con corrientes opuestas: H en P', tipo: 'MEXT', anio: '2019 1-(3)', graficas: ['vertical', 'perfil', 'distancia'],
      nota: 'Hilos a 2d con corrientes iguales y opuestas; P a una distancia d de su punto medio. La sonda lee H = B/μ0.',
      elementos: [hilo('Hilo izquierdo', [-0.05, 0], 2, 1), hilo('Hilo derecho', [0.05, 0], 2, -1), sonda('P', [0, 0.05])],
      caja: [-0.11, 0.11, -0.04, 0.09], sel: 2,
      // El hilo izquierdo sigue a d con signo contrario
      variables: { d: vari('d', 5, 1, 9, 0.1, 'cm', 0.01, ['elementos.1.centro.0', 'elementos.2.centro.1', 'elementos.0.centro.0'], { factores: { 'elementos.0.centro.0': -0.01 } }), I: vari('I', 2, 0.5, 10, 0.5, 'A', 1, ['elementos.0.I', 'elementos.1.I']) },
    },
  ];
  const completa = e => {
    const b = BASE(), o = JSON.parse(JSON.stringify({ ...b, ...e, capas: { ...b.capas, ...(e.capas || {}) } }));
    o.elementos.forEach((el, i) => { el.id = 'e' + (i + 1); if (!el.nombre) el.nombre = TIPOS[el.tipo].nombre; });
    if (typeof o.sel === 'number') o.sel = o.elementos[o.sel]?.id ?? 'escena';
    for (const d of Object.values(o.variables)) { d.offset = d.offset ?? 0; d.factores = d.factores || {}; }
    return o;
  };
  const escenaDe = clave => ESCENAS.find(e => e.clave === clave) || ESCENAS[0];

  // ---------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------
  /** @type {any} */ let ESC = completa(ESCENAS[0]);
  let FUENTES = [], MAPA = [], LINEAS = null, claveLineas = '';
  let sel = 'escena', herramienta = null, vistaTocada = false, escala0 = 1, espacioPulsado = false;
  let arrastre = null, paneo = null, hover = null;
  let autoguardar = false, historial = null, contador = 100;
  const lienzo = $('#lienzo'), area = $('#area');
  const tz = new Trazo(lienzo);
  const U = () => ESC.unidad || 'cm', FU = () => FAC[U()];
  const L = (v, cifras = 4) => cantidad(v / FU(), U(), cifras);
  const elDe = id => ESC.elementos.find(e => e.id === id);
  const idxDe = id => ESC.elementos.findIndex(e => e.id === id);
  const Bt = (v, cifras = 4) => conPrefijo(v, 'T', cifras);

  // ---------------------------------------------------------------------
  // Escena → motor (fuentes 3D)
  // ---------------------------------------------------------------------
  const ejeDe = el => dir(el.angulo ?? 0);
  function fuenteDe(el) {
    const c = [el.centro?.[0] ?? 0, el.centro?.[1] ?? 0, 0];
    switch (el.tipo) {
      case 'hilo': return el.enPlano ? { tipo: 'hilo', p: c, dir: [...dir(el.angulo ?? 0), 0], I: el.I } : { tipo: 'hilo', p: c, dir: [0, 0, el.sentido >= 0 ? 1 : -1], I: el.I };
      case 'segmento': return { tipo: 'segmento', a: [el.a[0], el.a[1], 0], b: [el.b[0], el.b[1], 0], I: el.I };
      case 'espira': return { tipo: 'espira', centro: c, normal: el.vista === 'corte' ? [...ejeDe(el).map(x => x * (el.sentido >= 0 ? 1 : -1)), 0] : [0, 0, el.sentido >= 0 ? 1 : -1], R: el.R, I: el.I, N: el.N };
      case 'espira-rect': return { tipo: 'poligonal', puntos: rectEsquinas(el).map(p => [p[0], p[1], 0]), I: el.I * (el.sentido >= 0 ? 1 : -1), N: el.N };
      case 'solenoide': return { tipo: 'solenoide', centro: c, eje: [...ejeDe(el).map(x => x * (el.sentido >= 0 ? 1 : -1)), 0], largo: el.largo, R: el.R, n: el.N / el.largo, I: el.I, ideal: el.modo === 'ideal' };
      case 'iman': return { tipo: 'iman', centro: c, eje: [...ejeDe(el), 0], momento: el.momento, modelo: el.modelo === 'dipolo' ? 'dipolo' : 'bloque', R: el.ancho / 2, largo: el.largo };
      default: return null;
    }
  }
  function rectEsquinas(el) {
    const w = el.ancho / 2, h = el.alto / 2, c = el.centro;
    return [[c[0] - w, c[1] - h], [c[0] + w, c[1] - h], [c[0] + w, c[1] + h], [c[0] - w, c[1] + h]];
  }
  function simular() {
    FUENTES = []; MAPA = [];
    ESC.elementos.forEach((el, i) => { const f = fuenteDe(el); if (f) { MAPA.push(i); FUENTES.push(f); } });
  }
  const campoEn = p => campoB(FUENTES, [p[0], p[1], 0]);
  const fuenteIndice = el => MAPA.indexOf(ESC.elementos.indexOf(el));
  const hilosPerp = () => ESC.elementos.filter(e => e.tipo === 'hilo' && !e.enPlano);

  // ---------------------------------------------------------------------
  // Líneas de campo (con caché: solo se trazan de nuevo si cambia algo)
  // ---------------------------------------------------------------------
  function semillas() {
    const v = tz.vista, s = [], k = 1 / v.escala;
    const hs = hilosPerp(), Imax = Math.max(1e-12, ...hs.map(h => Math.abs(h.I)));
    const porHilo = hs.map(h => { const n = Math.max(2, Math.min(9, Math.round(7 * Math.abs(h.I) / Imax))), r = []; for (let j = 0; j < n; j++) { const rr = 16 * k * Math.pow(1.55, j); r.push([h.centro[0] + rr * Math.cos(0.35), h.centro[1] + rr * Math.sin(0.35)]); } return r; });
    for (let j = 0; j < 9; j++) for (const r of porHilo) if (r[j]) s.push(r[j]);
    for (const el of ESC.elementos) {
      const e = ejeDe(el), n = [-e[1], e[0]], c = el.centro;
      const cruz = (ancho, m) => { for (let i = 0; i < m; i++) { const f = -0.5 + (i + 0.5) / m; s.push([c[0] + n[0] * ancho * f, c[1] + n[1] * ancho * f]); } };
      if (el.tipo === 'espira' && el.vista === 'corte') cruz(2 * el.R * 0.92, 7);
      if (el.tipo === 'solenoide') cruz(2 * el.R * 0.9, 7);
      if (el.tipo === 'iman') {
        if (el.modelo === 'dipolo') { for (let i = 0; i < 8; i++) { const a = (i - 3.5) / 8 * Math.PI * 0.9, r = 14 * k; s.push([c[0] + r * (e[0] * Math.cos(a) - e[1] * Math.sin(a)), c[1] + r * (e[1] * Math.cos(a) + e[0] * Math.sin(a))]); } }
        else cruz(el.ancho * 0.9, 7);
      }
    }
    return s;
  }
  function evitar() {
    const r = [];
    for (const el of ESC.elementos) {
      if (el.tipo === 'hilo' && !el.enPlano) r.push([el.centro[0], el.centro[1], 5 / tz.vista.escala]);
      if (el.tipo === 'espira' && el.vista === 'corte') { const e = ejeDe(el), n = [-e[1], e[0]]; for (const k of [1, -1]) r.push([el.centro[0] + n[0] * el.R * k, el.centro[1] + n[1] * el.R * k, 4 / tz.vista.escala]); }
      if (el.tipo === 'iman' && el.modelo === 'dipolo') r.push([el.centro[0], el.centro[1], 8 / tz.vista.escala]);
    }
    return r;
  }
  function lineas() {
    const v = tz.vista, clave = JSON.stringify([ESC.elementos.filter(esFuente), Math.round(v.escala), tz.w, tz.h, Math.round(v.ox / 40), Math.round(v.oy / 40)]);
    if (clave === claveLineas && LINEAS) return LINEAS;
    const x0 = v.mx(0), x1 = v.mx(tz.w), y0 = v.my(tz.h), y1 = v.my(0), mx = (x1 - x0) * 0.25, my = (y1 - y0) * 0.25;
    LINEAS = lineasCampo(FUENTES, semillas(), { paso: 2.5 / v.escala, separacion: 13 / v.escala, maxPasos: 2600, caja: [x0 - mx, x1 + mx, y0 - my, y1 + my], evitar: evitar() });
    claveLineas = clave;
    return LINEAS;
  }

  // ---------------------------------------------------------------------
  // Geometría de cada objeto
  // ---------------------------------------------------------------------
  const posDe = el => (el.tipo === 'segmento' ? [(el.a[0] + el.b[0]) / 2, (el.a[1] + el.b[1]) / 2] : el.centro);
  function moverA(el, p) {
    if (el.tipo === 'segmento') { const c = posDe(el), d = [p[0] - c[0], p[1] - c[1]]; el.a = [el.a[0] + d[0], el.a[1] + d[1]]; el.b = [el.b[0] + d[0], el.b[1] + d[1]]; }
    else el.centro = p;
  }
  const girable = el => el.tipo === 'solenoide' || el.tipo === 'iman' || (el.tipo === 'espira' && el.vista === 'corte') || (el.tipo === 'hilo' && el.enPlano);
  // Rectángulo girado (solenoide, imán) en mundo
  function rectGirado(el, ancho) {
    const e = ejeDe(el), n = [-e[1], e[0]], h = el.largo / 2, w = ancho / 2, c = el.centro;
    return [[-h, -w], [h, -w], [h, w], [-h, w]].map(([u, s]) => [c[0] + e[0] * u + n[0] * s, c[1] + e[1] * u + n[1] * s]);
  }
  function asaGiro(el) {
    if (!girable(el)) return null;
    const [X, Y] = tz.vista.P(el.centro), g = el.angulo ?? 0;
    const d = el.tipo === 'espira' ? Math.max(30, el.R * tz.vista.escala + 22) : el.tipo === 'hilo' ? 46 : Math.max(36, el.largo * tz.vista.escala / 2 + 22);
    return [X + Math.cos(g) * d, Y - Math.sin(g) * d];
  }
  // Extremos visibles de un hilo del plano (recta larga recortada a la vista)
  function extremosHiloPlano(el) {
    const e = ejeDe(el), v = tz.vista, R = 2 * Math.hypot(tz.w, tz.h) / v.escala, c = el.centro;
    return [[c[0] - e[0] * R, c[1] - e[1] * R], [c[0] + e[0] * R, c[1] + e[1] * R]];
  }

  // ---------------------------------------------------------------------
  // Dibujo
  // ---------------------------------------------------------------------
  function encuadrar() {
    let caja = ESC.caja;
    if (!caja) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      const pt = p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); };
      for (const el of ESC.elementos) {
        if (el.tipo === 'segmento') { pt(el.a); pt(el.b); }
        else if (el.tipo === 'espira') { pt([el.centro[0] - el.R, el.centro[1] - el.R]); pt([el.centro[0] + el.R, el.centro[1] + el.R]); }
        else if (el.tipo === 'espira-rect') rectEsquinas(el).forEach(pt);
        else if (el.tipo === 'solenoide' || el.tipo === 'iman') rectGirado(el, el.tipo === 'iman' ? el.ancho : 2 * el.R).forEach(pt);
        else pt(el.centro);
      }
      if (!Number.isFinite(x0)) { x0 = -0.05; x1 = 0.05; y0 = -0.05; y1 = 0.05; }
      const m = 0.35 * Math.max(x1 - x0, y1 - y0, 0.04);
      caja = [x0 - m, x1 + m, y0 - m, y1 + m];
    }
    tz.vista.encuadrar({ x0: caja[0], x1: caja[1], y0: caja[2], y1: caja[3] }, { x: 0, y: 0, w: tz.w, h: tz.h }, 48);
  }

  // Referencia de |B| para el tamaño de los ⊙/⊗ y el largo de los vectores: percentil 85 en la vista
  function referencia(comp) {
    const v = tz.vista, vals = [];
    for (let i = 1; i < 12; i++) for (let j = 1; j < 8; j++) {
      const B = campoEn([v.mx(tz.w * i / 12), v.my(tz.h * j / 8)]), x = comp === 'z' ? Math.abs(B[2]) : Math.hypot(B[0], B[1]);
      if (Number.isFinite(x) && x > 0) vals.push(x);
    }
    if (!vals.length) return 0;
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length * 0.85)] || vals[vals.length - 1];
  }

  function dibujar() {
    const v = tz.vista, ocupados = [...tz.zonasFlotantes(), { x: 8, y: tz.h - 80, w: 170, h: 34 }];
    for (const el of ESC.elementos) {
      const [X, Y] = v.P(posDe(el));
      if (el.tipo === 'hilo' && !el.enPlano) ocupados.push({ x: X - 11, y: Y - 11, w: 22, h: 22 });
      if (el.tipo === 'sonda' || el.tipo === 'brujula') ocupados.push({ x: X - 14, y: Y - 14, w: 28, h: 28 });
    }
    tz.limpiar(); tz.magnetismoEtiquetas(ocupados);
    tz.cuadricula();
    const huecos = ESC.elementos.filter(e => e.tipo === 'hilo' || e.tipo === 'sonda' || e.tipo === 'brujula').map(e => [...v.P(e.centro), 12]);
    tz.magnetismoEjes({ unidad: U(), factor: 1 / FU(), huecos });

    // Etiquetas de las fuentes y de las fuerzas: se reservan antes de la
    // rejilla de ⊙/⊗, que deja libre su sitio, y se escriben al final
    PLAN = [];
    if (ESC.capas.valores) planearEtiquetas();
    // 2 · Campo perpendicular (⊙/⊗ con el tamaño según |B_z|) y 7 · campo en el plano
    const evitarPx = ESC.elementos.filter(e => e.tipo === 'hilo' && !e.enPlano || e.tipo === 'sonda' || e.tipo === 'brujula').map(e => [...v.P(e.centro), 16]);
    if (ESC.capas.perpendicular) {
      const Bref = referencia('z');
      if (Bref > 0) tz.magnetismoRejilla((x, y) => campoEn([x, y])[2], { Bref, minimo: 0.06, evitar: evitarPx, libres: true });
    }
    // 6 · Materia: espiras de frente, segmentos, hilos del plano, solenoides, imanes
    for (const el of ESC.elementos) dibujarFuente(el);
    if (ESC.capas.lineas) {
      const ocultar = [];
      for (const el of ESC.elementos) if (el.tipo === 'iman' && el.modelo !== 'dipolo') { /* las líneas pasan por dentro del imán: se ven */ }
      tz.magnetismoLineas(lineas(), { ocultar });
    }
    if (ESC.capas.vectores) {
      const Bref = referencia('xy');
      if (Bref > 0) tz.magnetismoVectores((x, y) => campoEn([x, y]), { Bref, evitar: evitarPx });
    }
    // Hilos perpendiculares encima de sus líneas
    for (const el of ESC.elementos) if (el.tipo === 'hilo' && !el.enPlano) tz.magnetismoHilo(el.centro, el.sentido, { grueso: hover === el.id });
    // Fuerzas
    if (ESC.capas.fuerzas) dibujarFuerzas();
    // 8 · Instrumentos
    for (const el of ESC.elementos) {
      if (el.tipo === 'brujula') tz.magnetismoBrujula(el.centro, anguloBrujula(FUENTES, [el.centro[0], el.centro[1], 0]), { grueso: hover === el.id });
      if (el.tipo === 'sonda') dibujarSonda(el);
    }
    dibujarRegla();
    if (ESC.capas.valores) dibujarValores();
    dibujarSeleccion();
    tz.magnetismoBarraEscala(16, tz.h - 56, U(), 1 / FU());
  }

  function dibujarFuente(el) {
    const g = hover === el.id;
    switch (el.tipo) {
      case 'hilo': if (el.enPlano) { const [a, b] = extremosHiloPlano(el); tz.magnetismoConductor(a, b, el.I, { grueso: g, paso: 160 }); } break;
      case 'segmento': tz.magnetismoConductor(el.a, el.b, el.I, { grueso: g, extremo: 'round' }); break;
      case 'espira':
        if (el.vista === 'corte') tz.magnetismoEspiraCorte(el.centro, ejeDe(el), el.R, el.sentido >= 0 ? 1 : -1, { grueso: g });
        else tz.magnetismoEspiraFrente(el.centro, el.R, el.sentido >= 0 ? 1 : -1, { grueso: g });
        break;
      case 'espira-rect': { const pts = rectEsquinas(el); tz.magnetismoEspira(pts, { grueso: g }); tz.magnetismoCorriente(pts, el.I * (el.sentido >= 0 ? 1 : -1)); break; }
      case 'solenoide': tz.magnetismoSolenoide(el.centro, ejeDe(el), el.largo, el.R, el.N, el.sentido >= 0 ? 1 : -1, { grueso: g }); break;
      case 'iman': tz.magnetismoIman(el.centro, ejeDe(el), el.largo, el.ancho, { grueso: g }); break;
      default: break;
    }
  }
  function dibujarSonda(el) {
    const B = campoEn(el.centro), bp = Math.hypot(B[0], B[1]);
    // Vector de la componente en el plano, con largo logarítmico
    if (bp > 0 && Number.isFinite(bp)) {
      const Bref = referencia('xy') || bp, f = Math.min(1, Math.max(0.3, (Math.log10(bp / Bref) + 1.5) / 2.2)), k = 46 * f / bp;
      tz.vector(el.centro, [B[0], B[1]], { familia: 'magnetico', escalaPx: k, desdeRadio: 7 });
    }
    tz.magnetismoSonda(el.centro, { grueso: hover === el.id });
  }
  function dibujarFuerzas() {
    const v = tz.vista, hs = ESC.elementos.filter(e => (e.tipo === 'hilo' && !e.enPlano) || e.tipo === 'segmento');
    const datos = hs.map(el => ({ el, F: fuerzaDe(el) })).filter(d => d.F && Math.hypot(d.F[0], d.F[1]) > 0);
    const Fmax = Math.max(0, ...datos.map(d => Math.hypot(d.F[0], d.F[1])));
    if (!(Fmax > 0)) return;
    for (const { el, F } of datos) {
      const m = Math.hypot(F[0], F[1]), k = 44 * Math.max(0.35, m / Fmax) / m;
      tz.vector(posDe(el), [F[0], F[1]], { familia: 'interaccion', escalaPx: k, desdeRadio: el.tipo === 'hilo' ? 10 : 4 });
    }
    void v;
  }
  // Plan de etiquetas (antes de la rejilla): los cuerpos de los vectores quedan reservados y después van las etiquetas
  let PLAN = [];
  const colocar = (segs, cands) => { for (const [x, y, al] of cands) if (tz.magnetismoReservar(segs, x, y, al || 'left')) { PLAN.push([segs, x, y, al || 'left']); return true; } return false; };
  function planearEtiquetas() {
    const v = tz.vista;
    const fuerzas = ESC.capas.fuerzas ? ESC.elementos.filter(e => (e.tipo === 'hilo' && !e.enPlano) || e.tipo === 'segmento').map(el => ({ el, F: fuerzaDe(el) })).filter(d => d.F && Math.hypot(d.F[0], d.F[1]) > 0) : [];
    const Fmax = Math.max(0, ...fuerzas.map(d => Math.hypot(d.F[0], d.F[1])));
    const puntas = fuerzas.map(({ el, F }) => {
      const m = Math.hypot(F[0], F[1]), L = 44 * Math.max(0.35, m / Fmax), r0 = el.tipo === 'hilo' ? 10 : 4, [x, y] = v.P(posDe(el)), ux = F[0] / m, uy = -F[1] / m;
      const a = [x + ux * r0, y + uy * r0], b = [a[0] + ux * L, a[1] + uy * L];
      tz.magnetismoOcupar(Math.min(a[0], b[0]) - 4, Math.min(a[1], b[1]) - 4, Math.abs(b[0] - a[0]) + 8, Math.abs(b[1] - a[1]) + 8);
      return { el, m, fin: b, der: ux >= -0.2 };
    });
    for (const { el, m, fin, der } of puntas) {
      const segs = el.tipo === 'hilo' ? [{ t: 'F', f: 'sim', tam: 13, color: 'interaccion' }, { t: '/ℓ', f: 'simRecta', tam: 12, color: 'interaccion' }, { t: ' = ' + conPrefijo(m, 'N/m', 3), f: 'num', tam: 11, color: 'texto-2' }]
        : [{ t: 'F', f: 'sim', tam: 13, color: 'interaccion' }, { t: ' = ' + conPrefijo(m, 'N', 3), f: 'num', tam: 11, color: 'texto-2' }];
      colocar(segs, [[fin[0] + (der ? 8 : -8), fin[1] + 4, der ? 'left' : 'right'], [fin[0] + (der ? 8 : -8), fin[1] + 20, der ? 'left' : 'right'], [fin[0], fin[1] - 10, 'center'], [fin[0], fin[1] + 22, 'center'], [fin[0] + (der ? 8 : -8), fin[1] - 12, der ? 'left' : 'right']]);
    }
    etiquetasFuentes();
  }
  function fuerzaDe(el) {
    const k = fuenteIndice(el); if (k < 0) return null;
    if (el.tipo === 'hilo') return fuerzaPorLargo(FUENTES, k);
    if (el.tipo === 'segmento') return fuerzaSegmento(FUENTES, el.a, el.b, el.I, { excluir: k, puntos: 32 });
    return null;
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
  function dibujarValores() {
    const v = tz.vista;
    for (const [segs, x, y, al] of PLAN) tz.compuesto(segs, x, y, { alinear: al, color: 'texto-2' });
    for (const el of ESC.elementos) {
      if (el.tipo !== 'sonda') continue;
      const [X, Y] = v.P(posDe(el));
      const B = campoEn(el.centro), m = Math.hypot(B[0], B[1], B[2]);
      const filas = [[{ t: el.nombre, f: 'ui', tam: 11.5 }], [{ t: 'B', f: 'sim', tam: 13, color: 'magnetico' }, { t: ' = ' + Bt(m), f: 'num', tam: 11.5 }]];
      if (Math.abs(B[2]) > 1e-3 * m && Math.hypot(B[0], B[1]) > 1e-3 * m) filas.push([{ t: 'B', f: 'sim', tam: 13, color: 'magnetico' }, { t: 'z', f: 'sim', tam: 9, dy: 3, color: 'magnetico' }, { t: ' = ' + Bt(B[2]), f: 'num', tam: 11.5 }]);
      else if (Math.abs(B[2]) > 1e-3 * m) filas[1].push({ t: B[2] > 0 ? '  ⊙' : '  ⊗', f: 'ui', tam: 11.5, color: 'magnetico' });
      tz.magnetismoFicha(filas, [[X + 16, Y + 12], [X + 16, Y - 60], [X - 140, Y + 12], [X - 140, Y - 60]], [X, Y]);
    }
  }
  function etiquetasFuentes() {
    const v = tz.vista, etq = colocar;
    for (const el of ESC.elementos) {
      const [X, Y] = v.P(posDe(el));
      if (el.tipo === 'hilo' && !el.enPlano) {
        const segs = [{ t: 'I', f: 'sim', tam: 13, color: 'corriente' }, { t: ' = ' + conPrefijo(el.I, 'A', 3), f: 'num', tam: 11, color: 'texto-2' }];
        etq(segs, [[X + 14, Y + 22, 'left'], [X - 14, Y + 22, 'right'], [X + 14, Y - 14, 'left'], [X - 14, Y - 14, 'right']]);
      } else if (el.tipo === 'segmento' || (el.tipo === 'hilo' && el.enPlano)) {
        const segs = [{ t: 'I', f: 'sim', tam: 13, color: 'corriente' }, { t: ' = ' + conPrefijo(el.I, 'A', 3), f: 'num', tam: 11, color: 'texto-2' }];
        etq(segs, [[X, Y + 22, 'center'], [X, Y - 12, 'center'], [X + 40, Y + 22, 'left']]);
      } else if (el.tipo === 'espira' || el.tipo === 'solenoide' || el.tipo === 'espira-rect') {
        const r = el.tipo === 'espira' ? el.R * v.escala : el.tipo === 'solenoide' ? el.R * v.escala : el.alto * v.escala / 2;
        const segs = [{ t: el.tipo === 'solenoide' ? 'N·I' : 'I', f: 'sim', tam: 13, color: 'corriente' }, { t: ' = ' + conPrefijo(el.tipo === 'solenoide' ? el.N * el.I : el.I, 'A', 3), f: 'num', tam: 11, color: 'texto-2' }];
        etq(segs, [[X, Y + r + 26, 'center'], [X, Y - r - 14, 'center'], [X + r + 30, Y + 4, 'left']]);
      } else if (el.tipo === 'iman') {
        const segs = [{ t: 'm', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(el.momento, 'A·m²', 3), f: 'num', tam: 11, color: 'texto-2' }];
        etq(segs, [[X, Y + el.ancho * v.escala / 2 + 22, 'center'], [X, Y - el.ancho * v.escala / 2 - 12, 'center']]);
      }
    }
  }
  function dibujarSeleccion() {
    const el = elDe(sel), v = tz.vista; if (!el) return;
    const caja = pts => { const P = pts.map(p => v.P(p)), xs = P.map(p => p[0]), ys = P.map(p => p[1]); tz.seleccionCaja(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)); };
    if (el.tipo === 'segmento') { const A = v.P(el.a), B = v.P(el.b); tz.lineaPx([A, B], { color: 'tinta', grosor: 1, patron: 'seleccion' }); tz.asa(A[0], A[1]); tz.asa(B[0], B[1]); }
    else if (el.tipo === 'hilo' && el.enPlano) { const [X, Y] = v.P(el.centro); tz.seleccionCirculo(X, Y, 10); }
    else if (el.tipo === 'espira') {
      if (el.vista === 'corte') { const e = ejeDe(el), n = [-e[1], e[0]]; caja([[el.centro[0] + n[0] * el.R, el.centro[1] + n[1] * el.R], [el.centro[0] - n[0] * el.R, el.centro[1] - n[1] * el.R]].flatMap(p => [[p[0] - 8 / v.escala, p[1] - 8 / v.escala], [p[0] + 8 / v.escala, p[1] + 8 / v.escala]])); }
      else caja([[el.centro[0] - el.R, el.centro[1] - el.R], [el.centro[0] + el.R, el.centro[1] + el.R]]);
    } else if (el.tipo === 'espira-rect') caja(rectEsquinas(el));
    else if (el.tipo === 'solenoide' || el.tipo === 'iman') caja(rectGirado(el, el.tipo === 'iman' ? el.ancho : 2 * el.R));
    else { const [X, Y] = v.P(el.centro); tz.seleccionCirculo(X, Y, el.tipo === 'brujula' ? 17 : 14); }
    const a = asaGiro(el);
    if (a) {
      const [X, Y] = v.P(el.centro);
      tz.lineaPx([[X, Y], a], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
      tz.asaVector(a[0], a[1], arrastre && arrastre.tipo === 'giro');
    }
  }

  // ---------------------------------------------------------------------
  // Selección en el lienzo
  // ---------------------------------------------------------------------
  const distSeg = (P, A, B) => { const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2)) : 0; return Math.hypot(P[0] - A[0] - t * dx, P[1] - A[1] - t * dy); };
  const dentroPoli = (P, pts) => { let d = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > P[1]) !== (b[1] > P[1]) && P[0] < (b[0] - a[0]) * (P[1] - a[1]) / (b[1] - a[1]) + a[0]) d = !d; } return d; };
  function objetoEn(X, Y) {
    const v = tz.vista, P = [X, Y], s = elDe(sel);
    if (s) {
      const a = asaGiro(s); if (a && Math.hypot(X - a[0], Y - a[1]) < 8) return { id: s.id, asa: 'giro' };
      if (s.tipo === 'segmento') for (const k of ['a', 'b']) { const [x, y] = v.P(s[k]); if (Math.hypot(X - x, Y - y) < 8) return { id: s.id, asa: k }; }
    }
    if (ESC.regla) for (const j of [0, 1]) { const [x, y] = v.P(ESC.regla[j]); if (Math.hypot(X - x, Y - y) < 8) return { id: 'regla', asa: j }; }
    // Instrumentos y hilos primero (son pequeños), después las demás fuentes
    for (let i = ESC.elementos.length - 1; i >= 0; i--) {
      const el = ESC.elementos[i];
      if (el.tipo === 'sonda' || el.tipo === 'brujula' || (el.tipo === 'hilo' && !el.enPlano)) { const [x, y] = v.P(el.centro); if (Math.hypot(X - x, Y - y) < 13) return { id: el.id }; }
    }
    for (let i = ESC.elementos.length - 1; i >= 0; i--) {
      const el = ESC.elementos[i], c = el.centro ? v.P(el.centro) : null;
      switch (el.tipo) {
        case 'segmento': if (distSeg(P, v.P(el.a), v.P(el.b)) < 7) return { id: el.id }; break;
        case 'hilo': if (el.enPlano) { const [a, b] = extremosHiloPlano(el); if (distSeg(P, v.P(a), v.P(b)) < 7) return { id: el.id }; } break;
        case 'espira':
          if (el.vista === 'corte') { const e = ejeDe(el), n = [-e[1], e[0]], a = v.P([el.centro[0] + n[0] * el.R, el.centro[1] + n[1] * el.R]), b = v.P([el.centro[0] - n[0] * el.R, el.centro[1] - n[1] * el.R]); if (distSeg(P, a, b) < 9) return { id: el.id }; }
          else if (Math.abs(Math.hypot(X - c[0], Y - c[1]) - el.R * v.escala) < 8 || Math.hypot(X - c[0], Y - c[1]) < 10) return { id: el.id };
          break;
        case 'espira-rect': { const pts = rectEsquinas(el).map(p => v.P(p)); for (let k = 0; k < 4; k++) if (distSeg(P, pts[k], pts[(k + 1) % 4]) < 7) return { id: el.id }; break; }
        case 'solenoide': case 'iman': if (dentroPoli(P, rectGirado(el, el.tipo === 'iman' ? el.ancho : 2 * el.R).map(p => v.P(p)))) return { id: el.id }; break;
        default: break;
      }
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
      // Muestra el valor de su propia ruta (puede llevar otro factor que la variable: el hilo izquierdo de 2019 1-(3) está en −d)
      return fila(etq, `<div class="campo es-variable" data-ayuda="Ligado a la variable ${d.sim}|Bound to variable"><span class="chip-var">${simHTML(d.sim, d.sub)}</span><span class="valor-var" data-var="${nv}" data-ruta-var="${ruta}" data-uvar="${u}"></span><span class="u">${u}</span></div>`, ayuda);
    }
    const val = leer(ruta);
    return fila(etq, `<div class="campo"><input data-ruta="${ruta}" data-dim="${dim}" data-u="${u}" value="${val == null ? '' : numCampo(val / (FAC[u] ?? 1))}"><span class="u">${u}</span></div>`, ayuda);
  }
  const boton = (id, ico, txt, ayuda) => `<button class="btn btn-secundario btn-compacto" id="${id}" data-ayuda="${ayuda}"><svg class="ico"><use href="#${ico}"/></svg>${txt}</button>`;

  function inspector() {
    const props = $('#propiedades'); props.innerHTML = '';
    const el = elDe(sel);
    let titulo = 'Propiedades', ico = 'm-magnetismo', nombre = ESC.titulo;
    if (sel === 'regla' && ESC.regla) {
      nombre = 'Regla'; ico = 'n-regla'; titulo = 'Regla';
      props.innerHTML = `<div class="fila"><span class="etq">Objeto</span><div class="acciones-fila">${boton('p-quitar', 'i-borrar', 'Quitar', 'Quitar la regla|Delete|Supr')}</div></div>`;
    } else if (!el) {
      nombre = 'Escena'; titulo = 'Escena';
      props.innerHTML = fila('Unidad', segmentado('p-unidad', [['mm', 'mm'], ['cm', 'cm'], ['m', 'm']], U()), 'Unidad de longitud de los ejes y los campos|Length unit')
        + (ESC.nota ? `<p class="ayuda-fila" style="margin:6px 0 2px">${ESC.nota}</p>` : '');
    } else {
      const i = idxDe(sel), b = `elementos.${i}`, u = U();
      nombre = el.nombre; ico = TIPOS[el.tipo].ico; titulo = TIPOS[el.tipo].nombre;
      const pos = (k = 'centro') => campo('x', `${b}.${k}.0`, 'longitud', u) + campo('y', `${b}.${k}.1`, 'longitud', u);
      const corriente = () => campo('I', `${b}.I`, 'corriente', 'A', 'Corriente|Current');
      let h = '';
      switch (el.tipo) {
        case 'hilo':
          h += fila('Hilo', segmentado('p-plano', [['perp', 'Perpendicular'], ['plano', 'En el plano']], el.enPlano ? 'plano' : 'perp'), 'Perpendicular al plano (⊙/⊗) o contenido en él|Wire orientation') + pos() + corriente();
          h += el.enPlano ? campo('Dirección', `${b}.angulo`, 'adimensional', '°', 'Sentido de la corriente en el plano|Current direction')
            : fila('Sentido', segmentado('p-sentido', [['1', '⊙ Saliente', 'La corriente sale del plano|Out of page'], ['-1', '⊗ Entrante', 'La corriente entra en el plano|Into page']], el.sentido >= 0 ? '1' : '-1'));
          break;
        case 'segmento':
          h += campo('x₁', `${b}.a.0`, 'longitud', u) + campo('y₁', `${b}.a.1`, 'longitud', u) + campo('x₂', `${b}.b.0`, 'longitud', u) + campo('y₂', `${b}.b.1`, 'longitud', u) + corriente();
          h += `<div class="fila"><span class="etq">Sentido</span><div class="acciones-fila">${boton('p-invertir', 'i-rotar', 'Invertir', 'La corriente va de 1 a 2; invertir intercambia los extremos|Reverse current')}</div></div>`;
          break;
        case 'espira':
          h += fila('Vista', segmentado('p-vista', [['frente', 'De frente', 'La espira está en el plano|Face on'], ['corte', 'De canto', 'Su eje está en el plano: se ven sus dos cruces|Edge on']], el.vista)) + pos()
            + campo('R', `${b}.R`, 'longitud', u, 'Radio|Radius') + corriente() + campo('N', `${b}.N`, 'adimensional', '', 'Vueltas|Turns');
          h += el.vista === 'corte' ? campo('Eje', `${b}.angulo`, 'adimensional', '°', 'Dirección del eje (hacia donde apunta B en el centro)|Axis') : '';
          h += fila('Sentido', segmentado('p-sentido', [['1', el.vista === 'corte' ? 'Según el eje' : 'Antihorario'], ['-1', el.vista === 'corte' ? 'Contra el eje' : 'Horario']], el.sentido >= 0 ? '1' : '-1'));
          break;
        case 'espira-rect':
          h += pos() + campo('Ancho', `${b}.ancho`, 'longitud', u) + campo('Alto', `${b}.alto`, 'longitud', u) + corriente() + campo('N', `${b}.N`, 'adimensional', '', 'Vueltas|Turns')
            + fila('Sentido', segmentado('p-sentido', [['1', 'Antihorario'], ['-1', 'Horario']], el.sentido >= 0 ? '1' : '-1'));
          break;
        case 'solenoide':
          h += fila('Modelo', segmentado('p-modo', [['finito', 'Finito', 'Lámina de corriente de largo finito (exacto)|Finite'], ['ideal', 'Ideal', 'Uniforme dentro y nulo fuera|Ideal']], el.modo)) + pos()
            + campo('Largo', `${b}.largo`, 'longitud', u) + campo('R', `${b}.R`, 'longitud', u, 'Radio|Radius') + campo('N', `${b}.N`, 'adimensional', '', 'Vueltas totales|Turns') + corriente()
            + campo('Eje', `${b}.angulo`, 'adimensional', '°', 'Dirección del eje|Axis')
            + fila('Sentido', segmentado('p-sentido', [['1', 'Según el eje'], ['-1', 'Contra el eje']], el.sentido >= 0 ? '1' : '-1'));
          break;
        case 'iman':
          h += fila('Modelo', segmentado('p-modelo', [['bloque', 'Bloque', 'Cilindro magnetizado (su solenoide equivalente)|Magnetized block'], ['dipolo', 'Dipolo', 'Dipolo puntual en el centro|Point dipole']], el.modelo)) + pos()
            + campo('Largo', `${b}.largo`, 'longitud', u) + campo('Ancho', `${b}.ancho`, 'longitud', u)
            + campo('m', `${b}.momento`, 'momento', 'A·m²', 'Momento magnético|Magnetic moment')
            + campo('Eje', `${b}.angulo`, 'adimensional', '°', 'Dirección de S a N|Axis');
          break;
        default: h += pos(); break;
      }
      h += `<div class="fila"><span class="etq">Objeto</span><div class="acciones-fila">${boton('p-duplicar', 'i-duplicar', 'Duplicar', 'Duplicar|Duplicate|Ctrl D')}${boton('p-quitar', 'i-borrar', 'Quitar', 'Quitar el objeto|Delete|Supr')}</div></div>`;
      props.innerHTML = h;
    }
    $('#insp-ico').setAttribute('href', '#' + ico);
    $('#insp-nombre').textContent = nombre;
    $('#props-titulo').textContent = titulo;
    document.querySelectorAll('#propiedades input[data-ruta]').forEach(campoConUnidad);
    const on = (id, f) => { const e = $(id); if (e) e.addEventListener('click', ev => { const bt = ev.target.closest('button'); if (bt) f(bt.dataset.v, bt); }); };
    on('#p-unidad', v => { ESC.unidad = v; for (const d of Object.values(ESC.variables)) if (['mm', 'cm', 'm'].includes(d.u) && FAC[d.u]) { const k = FAC[d.u] / FAC[v]; d.min *= k; d.max *= k; d.val *= k; d.paso *= k; d.factor = Math.sign(d.factor) * FAC[v]; d.u = v; } cambio(); construirVariables(); });
    on('#p-sentido', v => { const e = elDe(sel); e.sentido = Number(v); cambio(); });
    on('#p-plano', v => { const e = elDe(sel); e.enPlano = v === 'plano'; e.angulo = e.angulo ?? 0; limpiarVariables(); cambio(); });
    on('#p-vista', v => { const e = elDe(sel); e.vista = v; e.angulo = e.angulo ?? 0; limpiarVariables(); cambio(); });
    on('#p-modo', v => { elDe(sel).modo = v; cambio(); });
    on('#p-modelo', v => { elDe(sel).modelo = v; cambio(); });
    const bi = $('#p-invertir'); if (bi) bi.addEventListener('click', () => { const e = elDe(sel); [e.a, e.b] = [e.b, e.a]; limpiarVariables(); cambio(); avisar('Corriente invertida'); });
    const b1 = $('#p-quitar'); if (b1) b1.addEventListener('click', quitarSeleccion);
    const b2 = $('#p-duplicar'); if (b2) b2.addEventListener('click', duplicar);
    arbol();
  }

  // Validación de cada ruta (en SI)
  function validar(ruta, x) {
    const k = ruta.split('.').pop();
    if (['R', 'largo', 'ancho', 'alto'].includes(k)) { if (!(x > 0)) throw new Error('Este valor tiene que ser positivo.'); if (x > 1e3) throw new Error('Este valor es demasiado grande (máximo 1 km).'); }
    if (k === 'I' && !(Math.abs(x) <= 1e6)) throw new Error('La corriente va de −1 MA a 1 MA.');
    if (k === 'N') { if (!(x >= 1 && x <= 1e5)) throw new Error('Las vueltas van de 1 a 100 000.'); return Math.round(x); }
    if (k === 'momento' && !(Math.abs(x) <= 1e6)) throw new Error('El momento magnético es demasiado grande.');
    if ((ruta.endsWith('.0') || ruta.endsWith('.1')) && Math.abs(x) > 1e3) throw new Error('La posición está demasiado lejos (máximo 1 km).');
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
        const dim = ent.dataset.dim === 'momento' ? DIM_MOMENTO : ent.dataset.dim, u = ent.dataset.u;
        let txt = ent.value.trim().replace(/−/g, '-');
        if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(txt) && u && u !== '°') txt = `${txt} ${u}`;
        const r = evaluar(txt, { esperada: dim, unidadPorDefecto: u || undefined });
        const ruta = ent.dataset.ruta, x = validar(ruta, r.valor);
        escribir(ruta, x);
        mostrarError(null); cambio();
      } catch (e) { mostrarError(e.message); }
    });
    ent.addEventListener('keydown', ev => { if (ev.key === 'Escape') { mostrarError(null); ent.blur(); inspector(); } });
  }

  function arbol() {
    const nodo = (s, ico, nombre, dato) => `<div class="nodo" data-sel="${s}" aria-selected="${sel === s}"><svg class="ico"><use href="#${ico}"/></svg><span class="nombre">${nombre}</span><span class="dato">${dato}</span></div>`;
    let h = nodo('escena', 'm-magnetismo', 'Escena', `${FUENTES.length} ${FUENTES.length === 1 ? 'fuente' : 'fuentes'}`);
    for (const el of ESC.elementos) h += nodo(el.id, TIPOS[el.tipo].ico, el.nombre, datoArbol(el));
    if (ESC.regla) h += nodo('regla', 'n-regla', 'Regla', L(Math.hypot(ESC.regla[1][0] - ESC.regla[0][0], ESC.regla[1][1] - ESC.regla[0][1]), 3));
    $('#arbol').innerHTML = h;
    $('#arbol').querySelectorAll('.nodo[data-sel]').forEach(n => n.addEventListener('click', () => seleccionar(n.dataset.sel)));
  }
  function datoArbol(el) {
    if (el.tipo === 'hilo') return `${conPrefijo(el.I, 'A', 3)}${el.enPlano ? '' : el.sentido >= 0 ? ' ⊙' : ' ⊗'}`;
    if (el.tipo === 'segmento' || el.tipo === 'espira' || el.tipo === 'espira-rect') return conPrefijo(el.I, 'A', 3);
    if (el.tipo === 'solenoide') return `${el.N} vueltas`;
    if (el.tipo === 'iman') return cantidad(el.momento, 'A·m²', 2);
    if (el.tipo === 'sonda') { const B = campoEn(el.centro); return Bt(Math.hypot(...B), 3); }
    if (el.tipo === 'brujula') { const a = anguloBrujula(FUENTES, [el.centro[0], el.centro[1], 0]); return a == null ? '—' : grados(a); }
    return '';
  }
  function seleccionar(s) { if (s === sel) return; sel = s; inspector(); todo(); }

  const lectura = ([a, b, val, u, ayuda]) => `<span class="sim"${ayuda ? ` data-ayuda="${ayuda}"` : ''}>${a}${b ? `<sub class="r">${b}</sub>` : ''}</span><span class="v">${val}</span><span class="u">${u}</span>`;
  // Valor con prefijo SI separado en número y unidad (columnas de las lecturas)
  // conPrefijo separa número y unidad con el espacio fino que no se corta (U+202F)
  const partes = (v, u, cifras = 4) => { const s = conPrefijo(v, u, cifras), i = s.lastIndexOf(Volta.ESP); return i > 0 ? [s.slice(0, i), s.slice(i + Volta.ESP.length)] : [s, u]; };
  const fl = (a, b, v, u, ay) => { const [n, uu] = partes(v, u); return [a, b, n, uu, ay]; };
  function lecturas() {
    document.querySelectorAll('[data-var]').forEach(e => { const d = ESC.variables[e.dataset.var]; if (!d) return; const x = e.dataset.rutaVar ? leer(e.dataset.rutaVar) : null; e.textContent = typeof x === 'number' ? numCampo(x / (FAC[e.dataset.uvar] ?? 1)) : fmtVar(d); });
    const el = elDe(sel), f = [];
    let estado = '';
    if (!el) {
      f.push(['N', 'fuentes', String(FUENTES.length), '', 'Fuentes de campo|Field sources']);
      const pts = ESC.elementos.filter(e => e.tipo === 'sonda');
      for (const s of pts.slice(0, 3)) { const B = campoEn(s.centro); f.push(fl('B', s.nombre.slice(0, 6), Math.hypot(...B), 'T', `|B| en ${s.nombre}|Field magnitude`)); }
      estado = `${ESC.elementos.length} objetos`;
    } else if (el.tipo === 'sonda') {
      const B = campoEn(el.centro), m = Math.hypot(...B), bp = Math.hypot(B[0], B[1]);
      f.push(fl('B', 'x', B[0], 'T'), fl('B', 'y', B[1], 'T'), fl('B', 'z', B[2], 'T', 'Componente perpendicular al plano: + saliente (⊙), − entrante (⊗)|Out of plane'), fl('|B|', '', m, 'T'));
      f.push(fl('H', '', m / MU0, 'A/m', 'H = B/μ0 (en el vacío)|Magnetic field strength'));
      if (bp > 1e-9 * m) f.push(['θ', '', fmt(Math.atan2(B[1], B[0]) / GR, 4), '°', 'Dirección de B en el plano|Field direction']);
      estado = m > 0 ? Bt(m) : 'Sin campo';
    } else if (el.tipo === 'brujula') {
      const a = anguloBrujula(FUENTES, [el.centro[0], el.centro[1], 0]), B = campoEn(el.centro);
      f.push(fl('B', 'plano', Math.hypot(B[0], B[1]), 'T', 'Componente de B en el plano|In-plane field'));
      if (a != null) f.push(['θ', '', fmt(a / GR, 4), '°', 'Hacia donde apunta el polo N|Needle direction']);
      estado = a == null ? 'Sin campo en el plano' : `Apunta a ${grados(a)}`;
    } else if (el.tipo === 'hilo') {
      f.push(fl('I', '', el.I, 'A'));
      const d = 0.01; f.push(fl('B', '1 cm', MU0 * Math.abs(el.I) / (2 * Math.PI * d), 'T', 'Su propio campo a 1 cm: μ0·I/(2π·r)|Own field at 1 cm'));
      if (!el.enPlano) { const F = fuerzaDe(el); if (F) { const m = Math.hypot(F[0], F[1]); f.push(fl('F', '/ℓ', m, 'N/m', 'Fuerza por metro de los demás campos|Force per length')); } }
      estado = el.enPlano ? 'En el plano' : el.sentido >= 0 ? 'Saliente ⊙' : 'Entrante ⊗';
    } else if (el.tipo === 'segmento') {
      const Lg = Math.hypot(el.b[0] - el.a[0], el.b[1] - el.a[1]), F = fuerzaDe(el);
      f.push(fl('I', '', el.I, 'A'), [`ℓ`, '', fmt(Lg / FU(), 4), U(), 'Largo|Length']);
      if (F) f.push(fl('F', '', Math.hypot(F[0], F[1]), 'N', 'Fuerza I·L × B de los demás campos|Force on segment'));
      estado = `${L(Lg, 3)} de largo`;
    } else if (el.tipo === 'espira') {
      const Bc = campoEspiraEje(el.R, el.I, 0, el.N);
      f.push(fl('B', 'centro', Bc, 'T', 'Su campo en el centro: μ0·N·I/(2R)|Field at center'), fl('m', '', el.N * el.I * Math.PI * el.R * el.R, 'A·m²', 'Momento magnético N·I·π·R²|Magnetic moment'));
      estado = el.vista === 'corte' ? 'De canto' : 'De frente';
    } else if (el.tipo === 'espira-rect') {
      f.push(fl('m', '', el.N * el.I * el.ancho * el.alto, 'A·m²', 'Momento magnético N·I·A|Magnetic moment'));
      estado = el.sentido >= 0 ? 'Antihoraria' : 'Horaria';
    } else if (el.tipo === 'solenoide') {
      const n = el.N / el.largo;
      f.push([`n`, '', fmt(n, 4), 'm⁻¹', 'Vueltas por metro|Turns per meter'], fl('B', 'centro', campoSolenoideEje(el.R, el.largo, n * el.I, 0), 'T', 'Campo en el centro (lámina finita)|Center field'), fl('μ₀nI', '', MU0 * n * el.I, 'T', 'Valor del solenoide ideal (infinito)|Ideal value'));
      estado = el.modo === 'ideal' ? 'Ideal' : 'Finito';
    } else if (el.tipo === 'iman') {
      f.push(fl('m', '', el.momento, 'A·m²'), fl('B', '2ℓ', campoDipolo([el.momento, 0, 0], [el.largo * 2, 0, 0])[0], 'T', 'Campo de su dipolo en el eje a dos largos del centro|Dipole field on axis'));
      estado = el.modelo === 'dipolo' ? 'Dipolo' : 'Bloque magnetizado';
    }
    $('#lecturas').innerHTML = f.map(lectura).join('') || '<span class="u">—</span>';
    $('#insp-estado').textContent = estado;
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
    for (const d of Object.values(ESC.variables)) for (const r of d.liga) { try { if (leer(r) !== undefined) escribir(r, d.val * factorDe(d, r) + (d.offset || 0)); } catch { /* ruta que ya no existe */ } }
  }
  function sincronizarVariables(rutas) {
    for (const d of Object.values(ESC.variables)) for (const r of rutas) if (d.liga.includes(r)) {
      d.val = Math.max(d.min, Math.min(d.max, (leer(r) - (d.offset || 0)) / factorDe(d, r)));
      for (const q of d.liga) escribir(q, d.val * factorDe(d, q) + (d.offset || 0));
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
    perfil: { nombre: 'Perfil de B a lo largo de x (por la sonda)', titulo: () => `${simHTML('|B|')} contra ${simHTML('x')} (${U()})` },
    vertical: { nombre: 'Perfil de B a lo largo de y (por la sonda)', titulo: () => `${simHTML('|B|')} contra ${simHTML('y')} (${U()})` },
    distancia: { nombre: 'B contra la distancia a un hilo (y μ0I/2πr)', titulo: () => `${simHTML('B')} contra ${simHTML('r')} (${U()})` },
    eje: { nombre: 'B en el eje (espira, solenoide o imán)', titulo: () => `${simHTML('B')} en el eje contra ${simHTML('z')} (${U()})` },
    fuerza: { nombre: 'Fuerza entre dos hilos contra su separación', titulo: () => `${simHTML('F')}/ℓ contra ${simHTML('d')} (${U()})` },
  };
  const vacia = (n, msj) => { grafica($(`#g${n}`), { x: { min: 0, max: 1 }, y: { min: 0, max: 1 }, series: [] }); $(`#t${n}`).textContent = msj; $(`#l${n}`).textContent = ''; };
  function graficas() { if (!$('#p-graficas').hidden) ESC.graficas.forEach((g, j) => { try { grafica1(j + 1, g); } catch { vacia(j + 1, 'Sin datos'); } }); }
  const muestras = (a, b, n, f) => { const r = []; for (let i = 0; i <= n; i++) { const x = a + (b - a) * i / n; r.push([x, f(x)]); } return r; };
  const tramosFinitos = pts => { const r = []; let t = []; for (const p of pts) { if (Number.isFinite(p[1])) t.push(p); else if (t.length) { r.push(t); t = []; } } if (t.length) r.push(t); return r; };
  // Escala de B para un eje: T con prefijo según el máximo
  function escalaB(max) { const PF = [[1, 'T'], [1e-3, 'mT'], [1e-6, 'µT'], [1e-9, 'nT']]; const [f, u] = PF.find(([f]) => max >= f * 0.99) || PF[PF.length - 1]; return { f, u }; }
  const rangoY = (pts, cero = true) => { const ys = pts.flat().map(p => p[1]).filter(Number.isFinite); let a = Math.min(...ys, cero ? 0 : Infinity), b = Math.max(...ys, cero ? 0 : -Infinity); if (!(b > a)) { a -= 1; b += 1; } const m = (b - a) * 0.08; return { min: cero && a >= 0 ? 0 : a - m, max: b + m }; };
  function sondaRef() { return ESC.elementos.find(e => e.tipo === 'sonda' && e.id === sel) || ESC.elementos.find(e => e.tipo === 'sonda'); }
  function grafica1(n, tipo) {
    const cv = $(`#g${n}`), Tt = $(`#t${n}`), Lc = $(`#l${n}`), v = tz.vista, fu = FU();
    if (!FUENTES.length) { vacia(n, 'Sin fuentes de campo'); return; }
    if (tipo === 'perfil' || tipo === 'vertical') {
      // Recta horizontal (o vertical) que pasa por la sonda; sin sonda, por el origen
      const s = sondaRef(), vert = tipo === 'vertical', k = vert ? 1 : 0, fijo = s ? s.centro[1 - k] : 0;
      const a0 = vert ? v.my(tz.h) : v.mx(0), a1 = vert ? v.my(0) : v.mx(tz.w), punto = a => (vert ? [fijo, a] : [a, fijo]);
      const pts = muestras(a0, a1, 360, a => Math.hypot(...campoEn(punto(a))));
      const bz = muestras(a0, a1, 360, a => campoEn(punto(a))[2]);
      const max = Math.max(...pts.map(p => p[1]).filter(Number.isFinite)), E = escalaB(max), tope = Math.min(max, 6 * (pts.map(p => p[1]).sort((a, b) => a - b)[Math.floor(pts.length * 0.9)] || max)) / E.f;
      const sc = p => p.map(([x, y]) => [x / fu, Number.isFinite(y) && Math.abs(y / E.f) <= tope * 1.05 ? y / E.f : NaN]);
      const hayZ = bz.some(p => Math.abs(p[1]) > 1e-3 * max);
      const series = [{ tramos: tramosFinitos(sc(pts)), familia: 'magnetico' }];
      if (hayZ) series.push({ tramos: tramosFinitos(sc(bz)), familia: 'magnetico', patron: 'discontinuo' });
      // Rombos donde la recta pasa por un hilo perpendicular
      const ev = ESC.elementos.filter(e => e.tipo === 'hilo' && !e.enPlano && Math.abs(e.centro[1 - k] - fijo) < 1e-9).map(e => ({ x: e.centro[k] / fu }));
      const yr = hayZ ? { min: -tope * 1.08, max: tope * 1.08 } : { min: 0, max: tope * 1.08 };
      grafica(cv, { x: { min: a0 / fu, max: a1 / fu }, y: yr, series, cursor: s ? s.centro[k] / fu : null, puntoCursor: s ? [s.centro[k] / fu, Math.hypot(...campoEn(s.centro)) / E.f] : null, eventos: ev });
      Tt.innerHTML = `<span class="leyenda"><span style="color:var(--f-magnetico)"><i></i>${simHTML('|B|')}</span>${hayZ ? `<span style="color:var(--f-magnetico)"><i class="discontinua"></i>${simHTML('B', 'z', false)}</span>` : ''}</span> (${E.u}) ${hayZ ? '·' : 'contra'} ${simHTML(vert ? 'y' : 'x')} (${U()})`;
      Lc.textContent = s ? Bt(Math.hypot(...campoEn(s.centro)), 4) : '';
      return;
    }
    if (tipo === 'distancia') {
      const hs = ESC.elementos.filter(e => e.tipo === 'hilo'), h = hs.find(e => e.id === sel) || hilosPerp()[0] || hs[0];
      if (!h) { vacia(n, 'Sin hilos'); return; }
      // Pie de la perpendicular: el centro del hilo perpendicular, o el punto del hilo del plano más cercano a la sonda
      const s = sondaRef(), e0 = ejeDe(h), pie = !h.enPlano || !s ? h.centro : (() => { const k = (s.centro[0] - h.centro[0]) * e0[0] + (s.centro[1] - h.centro[1]) * e0[1]; return [h.centro[0] + e0[0] * k, h.centro[1] + e0[1] * k]; })();
      const d0 = s ? [s.centro[0] - pie[0], s.centro[1] - pie[1]] : h.enPlano ? [-e0[1], e0[0]] : [1, 0], dl = Math.hypot(d0[0], d0[1]) || 1, u = [d0[0] / dl, d0[1] / dl];
      const rmax = Math.max(0.6 * (v.mx(tz.w) - v.mx(0)), (s ? dl : 0) * 1.4), r0 = 6 / v.escala;
      const num = muestras(r0, rmax, 300, r => Math.hypot(...campoEn([pie[0] + u[0] * r, pie[1] + u[1] * r])));
      const ana = muestras(r0, rmax, 300, r => MU0 * Math.abs(h.I) / (2 * Math.PI * r));
      const ref = MU0 * Math.abs(h.I) / (2 * Math.PI * (24 / v.escala)), E = escalaB(ref * 2), tope = ref * 2.2 / E.f;
      const sc = p => p.map(([x, y]) => [x / fu, y / E.f > tope * 1.05 ? NaN : y / E.f]);
      grafica(cv, { x: { min: 0, max: rmax / fu }, y: { min: 0, max: tope }, series: [{ tramos: tramosFinitos(sc(num)), familia: 'magnetico' }, { tramos: tramosFinitos(sc(ana)), familia: 'texto-3', auxiliar: true, etiqueta: 'μ₀I/(2πr)' }], cursor: s ? dl / fu : null, puntoCursor: s ? [dl / fu, Math.hypot(...campoEn(s.centro)) / E.f] : null });
      Tt.innerHTML = `${simHTML('B')} (${E.u}) contra ${simHTML('r')} (${U()})`;
      Tt.parentElement.dataset.ayuda = `B medido desde ${h.nombre} en la dirección de la sonda; punteada, μ0·I/(2π·r) de ese hilo solo|Field vs distance`;
      Lc.textContent = s ? Bt(Math.hypot(...campoEn(s.centro)), 4) : '';
      return;
    }
    if (tipo === 'eje') {
      const e = ESC.elementos.find(q => q.id === sel && ['espira', 'solenoide', 'iman'].includes(q.tipo)) || ESC.elementos.find(q => ['espira', 'solenoide', 'iman'].includes(q.tipo) && !(q.tipo === 'espira' && q.vista === 'frente')) || ESC.elementos.find(q => q.tipo === 'espira');
      if (!e) { vacia(n, 'Sin espira, solenoide ni imán'); return; }
      const ax = e.tipo === 'espira' && e.vista === 'frente' ? null : ejeDe(e), sg = e.tipo === 'iman' ? 1 : e.sentido >= 0 ? 1 : -1;
      const largo = e.tipo === 'espira' ? 4 * e.R : 1.6 * e.largo + 2 * (e.R ?? e.ancho);
      const proy = z => { const p = ax ? [e.centro[0] + ax[0] * z, e.centro[1] + ax[1] * z] : null; if (!p) return NaN; const B = campoEn(p); return (B[0] * ax[0] + B[1] * ax[1]) * sg; };
      const exacta = z => (e.tipo === 'espira' ? campoEspiraEje(e.R, e.I, z, e.N) : e.tipo === 'solenoide' ? (e.modo === 'ideal' ? (Math.abs(z) < e.largo / 2 ? MU0 * e.N / e.largo * e.I : 0) : campoSolenoideEje(e.R, e.largo, e.N / e.largo * e.I, z)) : (Math.abs(z) > e.largo / 2 ? MU0 * 2 * e.momento / (4 * Math.PI * Math.abs(z) ** 3) : NaN));
      if (!ax) {
        // Espira de frente: su eje es perpendicular al plano; solo se ve la fórmula
        const pts = muestras(-largo, largo, 300, exacta), max = Math.max(...pts.map(p => p[1])), E = escalaB(max);
        grafica(cv, { x: { min: -largo / fu, max: largo / fu }, y: { min: 0, max: max / E.f * 1.1 }, series: [{ tramos: [pts.map(([z, y]) => [z / fu, y / E.f])], familia: 'magnetico' }], cursor: 0, puntoCursor: [0, exacta(0) / E.f] });
        Tt.innerHTML = `${simHTML('B')} (${E.u}) en el eje · ${simHTML('z')} (${U()})`;
        Lc.textContent = Bt(exacta(0), 4);
        return;
      }
      const num = muestras(-largo, largo, 300, proy), ana = muestras(-largo, largo, 300, exacta);
      const vals = [...num, ...ana].map(p => p[1]).filter(Number.isFinite), max = Math.max(...vals.map(Math.abs)), E = escalaB(max);
      const tope = (e.tipo === 'iman' ? Math.min(max, 3 * Math.abs(proy(e.largo))) : max) / E.f * 1.1;
      const sc = p => p.map(([z, y]) => [z / fu, Number.isFinite(y) && Math.abs(y / E.f) <= tope ? y / E.f : NaN]);
      const s = sondaRef(), zs = s ? (s.centro[0] - e.centro[0]) * ax[0] + (s.centro[1] - e.centro[1]) * ax[1] : null;
      const enEje = s && Math.abs((s.centro[0] - e.centro[0]) * -ax[1] + (s.centro[1] - e.centro[1]) * ax[0]) < 1e-6;
      grafica(cv, { x: { min: -largo / fu, max: largo / fu }, y: { min: Math.min(0, ...vals.map(x => x / E.f)) * 1.1, max: tope }, series: [{ tramos: tramosFinitos(sc(num)), familia: 'magnetico' }, { tramos: tramosFinitos(sc(ana)), familia: 'tinta', patron: 'discontinuo' }], cursor: enEje ? zs / fu : null, puntoCursor: enEje ? [zs / fu, proy(zs) / E.f] : null });
      const formula = e.tipo === 'espira' ? 'exacta' : e.tipo === 'solenoide' ? (e.modo === 'ideal' ? 'ideal' : 'exacta') : 'dipolo';
      Tt.innerHTML = `<span class="leyenda"><span style="color:var(--f-magnetico)"><i></i>${simHTML('B')}</span><span style="color:var(--tinta)"><i class="discontinua"></i>${formula}</span></span> (${E.u}) · ${simHTML('z')} (${U()})`;
      Lc.textContent = enEje ? Bt(proy(zs), 4) : Bt(proy(0), 4);
      return;
    }
    if (tipo === 'fuerza') {
      const hs = hilosPerp();
      if (hs.length < 2) { vacia(n, 'Hacen falta dos hilos perpendiculares'); return; }
      const [a, b] = hs, d = Math.hypot(b.centro[0] - a.centro[0], b.centro[1] - a.centro[1]), I1 = a.I * a.sentido, I2 = b.I * b.sentido;
      const dmax = Math.max(3 * d, 0.05), curva = muestras(dmax / 60, dmax, 300, x => MU0 * Math.abs(I1 * I2) / (2 * Math.PI * x));
      const F = fuerzaDe(b), Fm = F ? Math.hypot(F[0], F[1]) : 0, ref = MU0 * Math.abs(I1 * I2) / (2 * Math.PI * d), PF = [[1, 'N/m'], [1e-3, 'mN/m'], [1e-6, 'µN/m']], [fac, uu] = PF.find(([f]) => ref * 3 >= f) || PF[2];
      grafica(cv, { x: { min: 0, max: dmax / fu }, y: { min: 0, max: ref * 3 / fac }, series: [{ tramos: tramosFinitos(curva.map(([x, y]) => [x / fu, y / fac > ref * 3.2 / fac ? NaN : y / fac])), familia: 'interaccion' }], cursor: d / fu, puntoCursor: [d / fu, Fm / fac] });
      Tt.innerHTML = `${simHTML('F')}/ℓ (${uu}) contra ${simHTML('d')} (${U()}) · ${I1 * I2 > 0 ? 'se atraen' : 'se repelen'}`;
      Lc.textContent = conPrefijo(Fm, 'N/m', 4);
      return;
    }
    vacia(n, '');
  }
  function cabecerasGraficas() { ESC.graficas.forEach((g, j) => { const t = $(`#t${j + 1}`); if (t && GRAFICAS[g] && !t.innerHTML) t.innerHTML = GRAFICAS[g].titulo(); }); }
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
  // Tablas y exportación
  // ---------------------------------------------------------------------
  function tablas() {
    const u = U(), fu = FU();
    const inst = ESC.elementos.filter(e => e.tipo === 'sonda' || e.tipo === 'brujula');
    $('#t-sondas').innerHTML = `<tr><th>Instrumento</th><th>x (${u})</th><th>y (${u})</th><th>Bx (T)</th><th>By (T)</th><th>Bz (T)</th><th>|B| (T)</th><th>H (A/m)</th><th>θ (°)</th></tr>`
      + (inst.length ? inst.map(e => { const B = campoEn(e.centro), m = Math.hypot(...B), bp = Math.hypot(B[0], B[1]); return `<tr><td class="texto">${e.nombre}</td><td>${fmt(e.centro[0] / fu, 4)}</td><td>${fmt(e.centro[1] / fu, 4)}</td><td>${fmt(B[0], 4)}</td><td>${fmt(B[1], 4)}</td><td>${fmt(B[2], 4)}</td><td>${fmt(m, 4)}</td><td>${fmt(m / MU0, 4)}</td><td>${bp > 1e-9 * m ? fmt(Math.atan2(B[1], B[0]) / GR, 4) : '—'}</td></tr>`; }).join('')
        : '<tr><td class="texto" colspan="9">Sin sondas ni brújulas: colócalas desde Instrumentos.</td></tr>');
    const con = ESC.elementos.filter(e => (e.tipo === 'hilo' && !e.enPlano) || e.tipo === 'segmento');
    $('#t-fuerzas').innerHTML = '<tr><th>Corriente</th><th>I (A)</th><th>Fx</th><th>Fy</th><th>|F|</th><th>Unidad</th></tr>'
      + (con.length ? con.map(e => { const F = fuerzaDe(e) || [0, 0, 0], ud = e.tipo === 'hilo' ? 'N/m' : 'N'; return `<tr><td class="texto">${e.nombre}</td><td>${fmt(e.I, 4)}</td><td>${fmt(F[0], 4)}</td><td>${fmt(F[1], 4)}</td><td>${fmt(Math.hypot(F[0], F[1]), 4)}</td><td class="texto">${ud}</td></tr>`; }).join('')
        : '<tr><td class="texto" colspan="6">Sin hilos perpendiculares ni segmentos.</td></tr>');
  }
  function exportarCSV() {
    const s = sondaRef(), y0 = s ? s.centro[1] : 0, v = tz.vista, x0 = v.mx(0), x1 = v.mx(tz.w), n = 400;
    const filas = []; for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, B = campoEn([x, y0]); filas.push([x, y0, B[0], B[1], B[2], Math.hypot(...B)]); }
    descargarTexto(`${nombreArchivo(ESC.titulo)}-perfil.csv`, aCSV(['x (m)', 'y (m)', 'Bx (T)', 'By (T)', 'Bz (T)', '|B| (T)'], filas))
      .then(r => { if (r) avisarLienzo(area, `Perfil exportado: ${filas.length} filas`); }, e => avisar(`No se pudo exportar: ${e}`, false));
  }
  function exportarSondas() {
    const filas = ESC.elementos.filter(e => e.tipo === 'sonda' || e.tipo === 'brujula').map(e => { const B = campoEn(e.centro); return [e.nombre, e.centro[0], e.centro[1], B[0], B[1], B[2], Math.hypot(...B), Math.hypot(...B) / MU0]; });
    descargarTexto(`${nombreArchivo(ESC.titulo)}-sondas.csv`, aCSV(['instrumento', 'x (m)', 'y (m)', 'Bx (T)', 'By (T)', 'Bz (T)', '|B| (T)', 'H (A/m)'], filas))
      .then(r => { if (r) avisarLienzo(area, `Lecturas exportadas: ${filas.length}`); });
  }
  function exportarFuerzas() {
    const filas = ESC.elementos.filter(e => (e.tipo === 'hilo' && !e.enPlano) || e.tipo === 'segmento').map(e => { const F = fuerzaDe(e) || [0, 0, 0]; return [e.nombre, e.I, F[0], F[1], Math.hypot(F[0], F[1]), e.tipo === 'hilo' ? 'N/m' : 'N']; });
    descargarTexto(`${nombreArchivo(ESC.titulo)}-fuerzas.csv`, aCSV(['corriente', 'I (A)', 'Fx', 'Fy', '|F|', 'unidad'], filas))
      .then(r => { if (r) avisarLienzo(area, `Fuerzas exportadas: ${filas.length}`); });
  }
  function exportarPNG() { descargarLienzo(lienzo, `${nombreArchivo(ESC.titulo)}.png`).then(r => { if (r) avisarLienzo(area, 'Imagen del lienzo exportada'); }); }
  $('#b-exportar').addEventListener('click', exportarCSV);

  // ---------------------------------------------------------------------
  // Ciclo
  // ---------------------------------------------------------------------
  function todo() {
    dibujar(); lecturas(); graficas();
    if (!$('#p-sondas').hidden || !$('#p-fuerzas').hidden) tablas();
    document.querySelectorAll('#arbol .nodo[data-sel]').forEach(nd => { const e = elDe(nd.dataset.sel); if (e && (e.tipo === 'sonda' || e.tipo === 'brujula')) nd.querySelector('.dato').textContent = datoArbol(e); });
  }
  function recalcular() {
    simular();
    if (!vistaTocada) encuadrar();
    todo();
    if (autoguardar) autoguardado.guardar('magnetismo', escenaActual());
  }
  function cambio() { aplicarVariables(); recalcular(); registrar(); inspector(); }
  function titulo() {
    $('#escena-nombre').textContent = ESC.titulo;
    const chip = $('#escena-chip');
    chip.textContent = ESC.tipo === 'MEXT' ? `MEXT ${ESC.anio || ''}`.trim() : ESC.tipo || 'Propio';
    chip.className = 'chip' + (ESC.tipo === 'MEXT' ? ' lleno' : '');
    document.title = `Volta · Campos magnéticos · ${ESC.titulo}`;
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
    const tablas = {
      hilo: () => ({ tipo: 'hilo', nombre: nombreNuevo('Hilo'), centro: p, I: 5, sentido: 1 }),
      segmento: () => ({ tipo: 'segmento', nombre: nombreNuevo('Segmento'), a: [p[0] - s / 2, p[1]], b: [p[0] + s / 2, p[1]], I: 5 }),
      espira: () => ({ tipo: 'espira', nombre: nombreNuevo('Espira'), centro: p, R: r(0.4 * S), I: 2, N: 10, vista: 'corte', angulo: 0, sentido: 1 }),
      'espira-rect': () => ({ tipo: 'espira-rect', nombre: nombreNuevo('Espira'), centro: p, ancho: r(0.9 * S), alto: r(0.6 * S), I: 2, N: 1, sentido: 1 }),
      solenoide: () => ({ tipo: 'solenoide', nombre: nombreNuevo('Solenoide'), centro: p, angulo: 0, largo: r(1.4 * S), R: r(0.25 * S), N: 100, I: 1, modo: 'finito', sentido: 1 }),
      iman: () => ({ tipo: 'iman', nombre: nombreNuevo('Imán'), centro: p, angulo: 0, largo: r(0.9 * S), ancho: r(0.18 * S), momento: 1, modelo: 'bloque' }),
      sonda: () => ({ tipo: 'sonda', nombre: nombreNuevo('Sonda'), centro: p }),
      brujula: () => ({ tipo: 'brujula', nombre: nombreNuevo('Brújula'), centro: p }),
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
  function escenaActual() { return crearEscena({ modulo: 'magnetismo', espacio: 'campos', titulo: ESC.titulo, datos: instantanea() }); }
  const RUTA_OK = /^elementos\.\d{1,2}\.((centro|a|b)\.[01]|I|R|N|largo|ancho|alto|angulo|momento)$/;
  const TIPOS_OK = Object.keys(TIPOS);
  // Valida y acota lo que viene de un archivo antes de usarlo (entrada no confiable)
  function datosSeguros(d = {}) {
    const base = completa(ESCENAS.find(e => e.clave === d.clave) || ESCENAS[0]);
    const pos = (v, def, min = 1e-6, max = 1e3) => numero(v, def, min, max);
    const coord = (p, def = [0, 0]) => (Array.isArray(p) && p.length === 2 ? [numero(p[0], def[0], -1e3, 1e3), numero(p[1], def[1], -1e3, 1e3)] : def.slice());
    const sg = v => (v === -1 ? -1 : 1), corr = v => numero(v, 1, -1e6, 1e6);
    const elementos = [], ids = new Set();
    for (const o of (Array.isArray(d.elementos) ? d.elementos : []).slice(0, 60)) {
      if (!o || typeof o !== 'object' || !TIPOS_OK.includes(o.tipo)) continue;
      let id = texto(o.id, '', 8); if (!/^e\d{1,4}$/.test(id) || ids.has(id)) { do { id = 'e' + (++contador); } while (ids.has(id)); }
      ids.add(id);
      const e = { id, tipo: o.tipo, nombre: texto(o.nombre, TIPOS[o.tipo].nombre, 40) };
      switch (o.tipo) {
        case 'hilo': Object.assign(e, { centro: coord(o.centro), I: corr(o.I), sentido: sg(o.sentido), enPlano: !!o.enPlano, angulo: numero(o.angulo, 0, -100, 100) }); break;
        case 'segmento': Object.assign(e, { a: coord(o.a, [-0.05, 0]), b: coord(o.b, [0.05, 0]), I: corr(o.I) }); if (Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) < 1e-9) e.b = [e.a[0] + 0.05, e.a[1]]; break;
        case 'espira': Object.assign(e, { centro: coord(o.centro), R: pos(o.R, 0.03), I: corr(o.I), N: Math.round(numero(o.N, 1, 1, 1e5)), vista: o.vista === 'frente' ? 'frente' : 'corte', angulo: numero(o.angulo, 0, -100, 100), sentido: sg(o.sentido) }); break;
        case 'espira-rect': Object.assign(e, { centro: coord(o.centro), ancho: pos(o.ancho, 0.05), alto: pos(o.alto, 0.03), I: corr(o.I), N: Math.round(numero(o.N, 1, 1, 1e5)), sentido: sg(o.sentido) }); break;
        case 'solenoide': Object.assign(e, { centro: coord(o.centro), angulo: numero(o.angulo, 0, -100, 100), largo: pos(o.largo, 0.1), R: pos(o.R, 0.02), N: Math.round(numero(o.N, 100, 1, 1e5)), I: corr(o.I), modo: o.modo === 'ideal' ? 'ideal' : 'finito', sentido: sg(o.sentido) }); break;
        case 'iman': Object.assign(e, { centro: coord(o.centro), angulo: numero(o.angulo, 0, -100, 100), largo: pos(o.largo, 0.06), ancho: pos(o.ancho, 0.015), momento: numero(o.momento, 1, -1e6, 1e6), modelo: o.modelo === 'dipolo' ? 'dipolo' : 'bloque' }); break;
        default: e.centro = coord(o.centro);
      }
      elementos.push(e);
    }
    const variables = {};
    for (const [k, v] of Object.entries(d.variables && typeof d.variables === 'object' ? d.variables : {})) {
      if (!v || !Array.isArray(v.liga) || !/^[A-Za-z]\w{0,7}$/.test(k)) continue;
      const min = numero(v.min, 0, -1e9, 1e9), max = Math.max(min, numero(v.max, 1, -1e9, 1e9));
      const liga = v.liga.filter(r => typeof r === 'string' && RUTA_OK.test(r) && +r.split('.')[1] < elementos.length);
      if (!liga.length) continue;
      const factores = {};
      if (v.factores && typeof v.factores === 'object') for (const r of liga) if (typeof v.factores[r] === 'number' && Number.isFinite(v.factores[r])) factores[r] = numero(v.factores[r], 1, -1e15, 1e15);
      variables[k] = { sim: texto(v.sim, k, 3), sub: v.sub ? texto(v.sub, '', 4) : undefined, val: numero(v.val, min, min, max), min, max, paso: pos(v.paso, 0.1, 1e-9, 1e9), u: ['mm', 'cm', 'm', '°', '', 'A', 'A·m²'].includes(v.u) ? v.u : '', factor: numero(v.factor, 1, -1e15, 1e15) || 1, offset: numero(v.offset, 0, -100, 100), liga, factores };
    }
    const capas = {};
    for (const k of Object.keys(base.capas)) capas[k] = typeof d.capas?.[k] === 'boolean' ? d.capas[k] : !!base.capas[k];
    const regla = Array.isArray(d.regla) && d.regla.length === 2 ? [coord(d.regla[0]), coord(d.regla[1])] : null;
    return {
      clave: ESCENAS.some(e => e.clave === d.clave) ? d.clave : 'propio', titulo: texto(d.titulo, base.titulo, 80),
      tipo: ['Tutorial', 'Ejemplo', 'MEXT', 'Propio'].includes(d.tipo) ? d.tipo : 'Propio', anio: d.anio ? texto(d.anio, '', 14) : undefined,
      unidad: ['mm', 'cm', 'm'].includes(d.unidad) ? d.unidad : 'cm', elementos, variables, regla, capas,
      graficas: Array.isArray(d.graficas) && d.graficas.length === 3 && d.graficas.every(g => GRAFICAS[g]) ? d.graficas.slice() : base.graficas.slice(),
      caja: Array.isArray(d.caja) && d.caja.length === 4 && d.caja.every(Number.isFinite) && d.caja[1] > d.caja[0] && d.caja[3] > d.caja[2] ? d.caja.map(x => numero(x, 0, -1e3, 1e3)) : null,
      sel: typeof d.sel === 'string' && (d.sel === 'escena' || elementos.some(e => e.id === d.sel)) ? d.sel : 'escena',
      nota: typeof d.nota === 'string' ? texto(d.nota, '', 240) : '',
    };
  }
  function restaurar(d) {
    ESC = datosSeguros(d); aplicarVariables();
    if (!(sel === 'escena' || (sel === 'regla' && ESC.regla) || elDe(sel))) sel = ESC.sel || 'escena';
    titulo(); construirVariables(); simular(); inspector(); recalcular();
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
    sel = ESC.sel || 'escena'; vistaTocada = false; herramienta = null; marcarHerramienta();
    titulo(); construirVariables(); simular(); inspector(); recalcular();
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
      if (aOtroEspacio(e, 'campos')) return;
      sel = 'escena'; restaurar(e.datos); vistaTocada = false; encuadrar(); escala0 = tz.vista.escala; zoomTexto(); todo();
      if (historial) { historial.reiniciar(sinSel(instantanea())); botonesHistorial(); }
      avisar(`Escena abierta: ${texto(e.titulo, 'sin título', 60)}`, false);
    }).catch(err => avisar(err.message, false));
  }

  // ---------------------------------------------------------------------
  // Paleta, herramientas y capas
  // ---------------------------------------------------------------------
  function marcarHerramienta() {
    document.querySelectorAll('.herr').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.herr === herramienta)));
    lienzo.style.cursor = herramienta ? 'crosshair' : 'default';
  }
  function ponerHerramienta(h) {
    herramienta = herramienta === h ? null : h; marcarHerramienta();
    if (herramienta === 'regla') avisar('Regla: arrastra entre dos puntos · Esc termina', false);
    else if (herramienta) avisar(`${document.querySelector(`.herr[data-herr="${h}"] span`).textContent}: clic en el lienzo para colocarlo · Esc termina`, false);
  }
  document.querySelectorAll('.herr').forEach(b => b.addEventListener('click', () => ponerHerramienta(b.dataset.herr)));
  function ponerCapa(k, on) { ESC.capas[k] = on; document.querySelectorAll(`.capa-btn[data-capa="${k}"]`).forEach(b => b.setAttribute('aria-pressed', String(on))); }
  const alternarCapa = k => { ponerCapa(k, !ESC.capas[k]); registrar(); todo(); };
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => alternarCapa(b.dataset.capa)));
  $('#pest').addEventListener('click', () => setTimeout(todo, 0));

  // ---------------------------------------------------------------------
  // Lienzo: colocar, seleccionar, arrastrar, girar, zoom y paneo
  // ---------------------------------------------------------------------
  const ajuste = (x, fino) => { const p = Volta.pasoAgradable(90 / tz.vista.escala) / (fino ? 100 : 10); return Math.round(x / p) * p; };
  const rutasPos = (el, i) => (el.tipo === 'segmento' ? [`elementos.${i}.a.0`, `elementos.${i}.a.1`, `elementos.${i}.b.0`, `elementos.${i}.b.1`] : [`elementos.${i}.centro.0`, `elementos.${i}.centro.1`]);
  lienzo.addEventListener('pointerdown', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, v = tz.vista, w = [v.mx(X), v.my(Y)];
    if (ev.button === 1 || ev.button === 2 || espacioPulsado) { paneo = [X, Y, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId); return; }
    if (herramienta === 'regla') { const p = [ajuste(w[0]), ajuste(w[1])]; ESC.regla = [p, p.slice()]; arrastre = { tipo: 'regla-nueva' }; lienzo.setPointerCapture(ev.pointerId); return; }
    if (herramienta) { const h = herramienta; if (!ev.shiftKey) { herramienta = null; marcarHerramienta(); } crear(h, [ajuste(w[0]), ajuste(w[1])]); return; }
    const ob = objetoEn(X, Y);
    if (ob && ob.id === 'regla') { if (sel !== 'regla') seleccionar('regla'); arrastre = { tipo: ob.asa != null ? 'regla:' + ob.asa : 'regla', w0: w, r0: copia(ESC.regla), movido: false }; lienzo.setPointerCapture(ev.pointerId); return; }
    if (ob) {
      if (sel !== ob.id) seleccionar(ob.id);
      const el = elDe(ob.id);
      arrastre = { tipo: ob.asa || 'mover', id: ob.id, w0: w, p0: posDe(el).slice(), movido: false };
      lienzo.setPointerCapture(ev.pointerId); return;
    }
    seleccionar('escena');
    paneo = [X, Y, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId);
  });
  lienzo.addEventListener('pointermove', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, v = tz.vista, w = [v.mx(X), v.my(Y)];
    $('#cx').textContent = L(w[0], 4); $('#cy').textContent = L(w[1], 4);
    const Bc = FUENTES.length ? Math.hypot(...campoEn(w)) : 0; $('#cb').textContent = Bt(Bc, 3);
    if (paneo) { vistaTocada = true; v.ox = paneo[2] + X - paneo[0]; v.oy = paneo[3] + Y - paneo[1]; dibujar(); return; }
    if (arrastre) {
      const fino = ev.shiftKey, a = arrastre;
      if (a.tipo === 'regla-nueva') ESC.regla[1] = [ajuste(w[0], fino), ajuste(w[1], fino)];
      else if (a.tipo === 'regla:0' || a.tipo === 'regla:1') ESC.regla[+a.tipo.slice(6)] = [ajuste(w[0], fino), ajuste(w[1], fino)];
      else if (a.tipo === 'regla') { const dx = w[0] - a.w0[0], dy = w[1] - a.w0[1]; ESC.regla = a.r0.map(p => [ajuste(p[0] + dx, fino), ajuste(p[1] + dy, fino)]); }
      else {
        const el = elDe(a.id), i = idxDe(a.id);
        if (a.tipo === 'mover') { moverA(el, [ajuste(a.p0[0] + w[0] - a.w0[0], fino), ajuste(a.p0[1] + w[1] - a.w0[1], fino)]); sincronizarVariables(rutasPos(el, i)); }
        else if (a.tipo === 'a' || a.tipo === 'b') { el[a.tipo] = [ajuste(w[0], fino), ajuste(w[1], fino)]; sincronizarVariables(rutasPos(el, i)); }
        else if (a.tipo === 'giro') {
          const c = v.P(el.centro); let g = Math.atan2(c[1] - Y, X - c[0]);
          const paso = fino ? 0.1 * GR : 1 * GR; g = Math.round(g / paso) * paso;
          el.angulo = g; sincronizarVariables([`elementos.${i}.angulo`]);
        }
      }
      a.movido = true;
      simular(); todo(); return;
    }
    if (herramienta) return;
    const ob = objetoEn(X, Y), h = ob ? ob.id : null;
    lienzo.style.cursor = ob ? (ob.asa === 'giro' ? 'grab' : ob.asa != null ? 'move' : 'pointer') : 'default';
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
    ['i-encuadrar', 'Encuadrar todo', 'F', encuadrarTodo],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['i-capas', 'Mostrar u ocultar las líneas de campo', 'L', () => alternarCapa('lineas')],
    ['i-capas', 'Mostrar u ocultar los vectores de B', 'V', () => alternarCapa('vectores')],
    ['i-capas', 'Mostrar u ocultar ⊙ y ⊗ (campo perpendicular)', 'P', () => alternarCapa('perpendicular')],
    ['i-capas', 'Mostrar u ocultar las fuerzas', '', () => alternarCapa('fuerzas')],
    ['n-regla', 'Medir con la regla', 'R', () => ponerHerramienta('regla')],
    ['i-duplicar', 'Duplicar el objeto seleccionado', 'Ctrl D', duplicar],
    ['i-borrar', 'Quitar el objeto seleccionado', 'Supr', quitarSeleccion],
    ['i-historial', 'Restablecer la escena original', '', () => { if (ESCENAS.some(e => e.clave === ESC.clave)) { abrirEscena1(ESC.clave); avisar('Escena original restablecida', false); } }],
    ['i-deshacer', 'Deshacer', 'Ctrl Z', deshacer],
    ['i-rehacer', 'Rehacer', 'Ctrl Y', rehacer],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar],
    ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
    ['i-exportar', 'Exportar el perfil de B a CSV', '', exportarCSV],
    ['i-tabla', 'Exportar las lecturas de las sondas a CSV', '', exportarSondas],
    ['i-tabla', 'Exportar las fuerzas a CSV', '', exportarFuerzas],
    ['i-imagen', 'Exportar imagen del lienzo', '', exportarPNG],
    ['o-particula-cargada', 'Ir a Partículas en E y B', '', () => { location.href = 'magnetismo-particulas.html'; }, 'Espacios'],
    ['o-rieles', 'Ir a Inducción', '', () => { location.href = 'magnetismo-induccion.html'; }, 'Espacios'],
    ...Object.entries({ hilo: 'un hilo infinito', segmento: 'un segmento con corriente', espira: 'una espira circular', 'espira-rect': 'una espira rectangular', solenoide: 'un solenoide', iman: 'un imán de barra', sonda: 'una sonda de B', brujula: 'una brújula' })
      .map(([h, t]) => [document.querySelector(`.herr[data-herr="${h}"] use`)?.getAttribute('href').slice(1) || 'i-mas', `Colocar ${t}`, '', () => ponerHerramienta(h), 'Objetos']),
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
    if (ev.code === 'Space') { espacioPulsado = true; return; }
    if (ev.key === 'Escape') { if (herramienta) { herramienta = null; marcarHerramienta(); } $('#menu-escenas').hidden = true; $('#menu-flotante').hidden = true; }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') quitarSeleccion();
    else if (tecla === 'f') encuadrarTodo();
    else if (tecla === 'l') alternarCapa('lineas');
    else if (tecla === 'v') alternarCapa('vectores');
    else if (tecla === 'p') alternarCapa('perpendicular');
    else if (tecla === 'r') ponerHerramienta('regla');
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });

  // ---------------------------------------------------------------------
  // Arranque. Parámetros para capturas: ?escena=solenoide&sel=e1&pest=sondas
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); if (!vistaTocada) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search), limpio = ![...q.keys()].length;
    const pend = escenaPendiente('magnetismo');
    if (pend && aOtroEspacio(pend, 'campos')) return;
    const previa = (pend && (!pend.espacio || pend.espacio === 'campos') ? pend : null) || (limpio ? autoguardado.leer('magnetismo', { modulo: 'magnetismo' }) : null);
    tz.ajustar();
    if (q.has('escena') || !previa) { ESC = completa(escenaDe(q.get('escena') || 'hilo-brujulas')); sel = ESC.sel || 'escena'; }
    else { ESC = datosSeguros(previa.datos); sel = ESC.sel || 'escena'; }
    aplicarVariables();
    if (q.has('capas')) for (const k of q.get('capas').split(',')) if (k in ESC.capas) ESC.capas[k] = true;
    if (q.has('sel')) { const s = q.get('sel'); if (s === 'escena' || elDe(s)) sel = s; }
    autoguardar = true;
    registrarDocumento({ clave: 'magnetismo', escena: escenaActual, origen: (!q.has('escena') && previa) || null, abrir, guardar });
    titulo(); construirVariables(); simular(); inspector();
    recalcular(); escala0 = tz.vista.escala; zoomTexto();
    cabecerasGraficas();
    const pe = q.get('pest'); if (pe) { const b = document.querySelector(`#pest [aria-controls="p-${pe}"]`); if (b) b.click(); }
    todo();
    historial = new Historial(sinSel(instantanea())); botonesHistorial();
  });
})();
