/* ==========================================================================
   Volta · Óptica — espacio de trabajo "Películas e interferómetros"
   Película delgada (uniforme o en cuña, como una lámina de jabón que se
   escurre), cuña de aire entre dos vidrios, anillos de Newton e
   interferómetro de Michelson. La física está en el motor puro
   sistema/motores/optica.js (probado en pruebas/optica.test.js): suma de
   Airy de las reflexiones múltiples con los coeficientes de Fresnel (el
   cambio de fase de π al reflejarse contra un índice mayor sale solo),
   color de la película con luz blanca, hueco exacto de los anillos y
   caminos del Michelson con lámina girada.
   Solo el Michelson cambia con el tiempo (el espejo móvil y la lámina que
   gira): allí aparecen el transporte, la línea de tiempo con las franjas
   contadas y el contador. Los esquemas no están a escala.
   Parámetros de URL para capturas: ?escena=…&tema=…&t=…&sel=objeto|fuente
   ========================================================================== */
import {
  pelicula, colorPelicula, espesoresMaximos, cambiosFase, interfranjaCuna, huecoNewton, radioAnilloOscuro, reflectanciaNewton,
  caminoLamina, michelsonEn, serieMichelson, anilloMichelson, indiceDesdeGiro, indiceDesdeLamina, franjasMichelson,
  colorLongitudOnda, colorEspectro, muestrasVisible, snell, extremos, gammaSRGB,
} from '../motores/optica.js';
import { aCSV } from '../nucleo/csv.js';
import { descargarTexto, descargarLienzo, nombreArchivo, avisar as avisarLienzo } from '../componentes/exportar.js';
import { crearEscena, numero, texto } from '../nucleo/escena.js';
import { Historial } from '../nucleo/historial.js';
import { evaluar } from '../nucleo/unidades.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';
import { registrarDocumento, confirmarCambios, documentoNuevo, hayCambios } from '../componentes/documento.js';

(function () {
  'use strict';
  const { Trazo, fmt, cantidad, grafica, LineaTiempo } = Volta;
  const $ = s => document.querySelector(s);
  const GR = Math.PI / 180;
  const FAC = { m: 1, cm: 1e-2, mm: 1e-3, 'µm': 1e-6, nm: 1e-9, '': 1, '°': GR, mrad: 1e-3, 'µm/s': 1e-6, 's': 1, '°/s': GR };
  const numCampo = x => String(Number(Number(x).toPrecision(6))).replace('-', '−');
  const simHTML = (a, sub, recto = true) => `<span class="sim">${a}${sub ? `<sub${recto ? ' class="r"' : ''}>${sub}</sub>` : ''}</span>`;
  function largo(v, cifras = 4) {
    const a = Math.abs(v);
    const [f, u] = a >= 0.5 ? [1, 'm'] : a >= 0.01 ? [1e-2, 'cm'] : a >= 1e-4 ? [1e-3, 'mm'] : a >= 1e-6 || a === 0 ? [1e-6, 'µm'] : [1e-9, 'nm'];
    return cantidad(v / f, u, cifras);
  }
  const MODOS = {
    pelicula: { nombre: 'Película delgada', ico: 'o-pelicula' }, cuna: { nombre: 'Cuña de aire', ico: 'o-capas' },
    newton: { nombre: 'Anillos de Newton', ico: 'o-anillos-newton' }, michelson: { nombre: 'Interferómetro de Michelson', ico: 'o-michelson' },
  };
  const LAMBDAS = muestrasVisible(30);

  // ---------------------------------------------------------------------
  // Escenas. Variables: valor en su unidad; valor físico = val·factor.
  // ---------------------------------------------------------------------
  const vari = (sim, val, min, max, paso, u, factor, liga, sub) => ({ sim, sub, val, min, max, paso, u, factor, liga });
  const BASE = () => ({
    modo: 'pelicula', lambda: 550e-9, n1: 1, n2: 1.33, n3: 1, d: 300e-9, theta1: 0, cuna: null,
    alfa: 2e-4, xmax: 0.01, nPlacas: 1.52, nCuna: 1, R: 1, rmax: 3e-3, nLente: 1.52, nHueco: 1, nPlaca: 1.52,
    mich: { d0: 0.5e-3, v: 0, lamina: null, omega: 0, giroMax: null, f: 0.2, rmax: 0.025 }, duracion: 5,
    capas: { rayos: true, fases: true, valores: true, contador: true }, variables: {}, sel: 'objeto',
  });
  const ESCENAS = [
    {
      clave: 'jabon', titulo: 'Película de jabón con luz blanca', tipo: 'Tutorial', modo: 'pelicula', lambda: null, n2: 1.33, d: 300e-9, cuna: { d0: 0, d1: 1.1e-6 },
      variables: { d: vari('d', 300, 0, 1100, 5, 'nm', 1e-9, ['d']) },
    },
    {
      clave: 'antirreflejo', titulo: 'Capa antirreflejo sobre vidrio', tipo: 'Ejemplo', modo: 'pelicula', lambda: 550e-9, n2: 1.38, n3: 1.52, d: 99.6e-9,
      variables: { d: vari('d', 99.6, 0, 400, 0.2, 'nm', 1e-9, ['d']), l: vari('λ', 550, 380, 750, 5, 'nm', 1e-9, ['lambda']) },
    },
    {
      clave: 'cuna', titulo: 'Cuña de aire entre dos vidrios', tipo: 'Ejemplo', modo: 'cuna', lambda: 589e-9, alfa: 2e-4, xmax: 0.01,
      variables: { a: vari('α', 0.2, 0.05, 1, 0.01, 'mrad', 1e-3, ['alfa']), l: vari('λ', 589, 380, 750, 1, 'nm', 1e-9, ['lambda']) },
    },
    {
      clave: 'newton', titulo: 'Anillos de Newton', tipo: 'Ejemplo', modo: 'newton', lambda: 589e-9, R: 1, rmax: 3e-3,
      variables: { R: vari('R', 1, 0.2, 3, 0.05, 'm', 1, ['R']), n: vari('n', 1, 1, 1.6, 0.01, '', 1, ['nHueco'], 'h') },
    },
    {
      clave: 'michelson-espejo', titulo: 'Michelson: franjas al mover un espejo', tipo: 'Ejemplo', modo: 'michelson', lambda: 632.8e-9, duracion: 5,
      mich: { d0: 0.5e-3, v: 1e-6, lamina: null, omega: 0, giroMax: null, f: 0.2, rmax: 0.025 },
      variables: { v: vari('v', 1, 0.1, 3, 0.1, 'µm/s', 1e-6, ['mich.v']) },
    },
    {
      clave: 'michelson-lamina', titulo: 'Michelson con una lámina de vidrio', tipo: 'Ejemplo', modo: 'michelson', lambda: 632.8e-9, duracion: 5,
      mich: { d0: 0.45e-3, v: 1e-6, lamina: { n: 1.5, espesor: 0.1e-3, giro: 0 }, omega: 0, giroMax: null, f: 0.2, rmax: 0.025 },
      variables: { n: vari('n', 1.5, 1, 2, 0.01, '', 1, ['mich.lamina.n'], 'L') },
    },
    // ----------------------------------------------------------------- MEXT
    {
      clave: 'mext-2019-5', titulo: 'Película de jabón con incidencia oblicua', tipo: 'MEXT', anio: '2019 P5', modo: 'pelicula', lambda: 600e-9, n2: 1.33, theta1: 30 * GR, d: 365.2e-9,
      variables: { d: vari('d', 365.2, 0, 800, 0.2, 'nm', 1e-9, ['d']), th: vari('θ', 30, 0, 80, 0.5, '°', GR, ['theta1']) },
    },
    {
      clave: 'mext-2013-1-5', titulo: 'Película en el aire con incidencia normal', tipo: 'MEXT', anio: '2013 1-(5)', modo: 'pelicula', lambda: 500e-9, n2: 1.5, d: 250e-9,
      variables: { d: vari('d', 250, 0, 600, 0.5, 'nm', 1e-9, ['d']), n: vari('n', 1.5, 1.1, 2, 0.01, '', 1, ['n2']) },
    },
    {
      clave: 'mext-2025-t8', titulo: 'Índice de una lámina con el interferómetro de Michelson', tipo: 'MEXT', anio: '2025 T8', modo: 'michelson', lambda: 632.8e-9, duracion: 8,
      mich: { d0: 0.5e-3, v: 0, lamina: { n: 1.5, espesor: 1e-3, giro: 0 }, omega: 10 * GR / 8, giroMax: 10 * GR, f: 0.2, rmax: 0.025 },
      variables: { n: vari('n', 1.5, 1.2, 2, 0.01, '', 1, ['mich.lamina.n'], 'L') },
    },
  ];
  const completa = e => {
    const b = BASE(), o = JSON.parse(JSON.stringify({ ...b, ...e, mich: { ...b.mich, ...(e.mich || {}) }, capas: { ...b.capas, ...(e.capas || {}) } }));
    if (e.lambda === null) o.lambda = null;
    return o;
  };
  const escenaDe = clave => ESCENAS.find(e => e.clave === clave) || ESCENAS[0];

  // ---------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------
  /** @type {any} */ let ESC = completa(ESCENAS[0]);
  let sel = 'objeto', t = 0, jugando = false, velocidad = 1, ultimo = 0, arrastre = null;
  let autoguardar = false, historial = null, SERIE = null, ERROR = null;
  const lienzo = $('#lienzo'), area = $('#area'), tz = new Trazo(lienzo);
  const blanca = () => ESC.lambda == null, lamRef = () => (blanca() ? 550e-9 : ESC.lambda);
  const esMich = () => ESC.modo === 'michelson';
  // Mundo = pantalla (escala 1, y hacia arriba): el esquema se dibuja en px
  const W = (X, Y) => [X, -Y];

  // ---------------------------------------------------------------------
  // Cálculo
  // ---------------------------------------------------------------------
  const escMich = () => ({ lambda: lamRef(), d0: ESC.mich.d0, v: ESC.mich.v, lamina: ESC.mich.lamina, omega: ESC.mich.omega, giroMax: ESC.mich.giroMax, duracion: ESC.duracion });
  function simular() {
    try {
      ERROR = null; SERIE = null;
      if (esMich()) SERIE = serieMichelson(escMich(), 4000);
      // Comprobaciones de la escena
      if (!(ESC.n2 > 0 && ESC.n1 > 0 && ESC.n3 > 0)) throw new Error('Los índices deben ser positivos.');
    } catch (e) { ERROR = e.message; }
  }
  // Reflectancia de la película activa en (d, λ, θ)
  const R = (d, l = lamRef(), th = ESC.theta1) => pelicula({ n1: ESC.n1, n2: ESC.n2, n3: ESC.n3, d, lambda: l, theta1: th }).R;
  // Luz reflejada (sRGB lineal) por una película de grosor d: blanca o de la λ
  function luzPelicula(n1, n2, n3, d, th, escala) {
    if (blanca()) return colorPelicula({ n1, n2, n3, d, theta1: th }, LAMBDAS).map(x => x * escala);
    const c = colorLongitudOnda(ESC.lambda).lineal, r = pelicula({ n1, n2, n3, d, lambda: ESC.lambda, theta1: th }).R * escala;
    return c.map(x => x * r);
  }
  // Fondo de la "película fotográfica" en sRGB lineal (para ImageData)
  function fondoLin() {
    const c = tz.opticaFondoLuz().trim(), h = c.length === 4 ? [...c.slice(1)].map(x => x + x).join('') : c.slice(1, 7);
    return [0, 2, 4].map(i => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  }
  // Imagen radial (anillos): I(r) → color, en un lienzo auxiliar
  function imagenRadial(Rpx, perfil) {
    const n = 2 * Rpx, img = new ImageData(n, n), bg = fondoLin(), N = perfil.length;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const r = Math.hypot(i + 0.5 - Rpx, j + 0.5 - Rpx) / Rpx, o = 4 * (j * n + i);
      if (r > 1) { img.data[o + 3] = 0; continue; }
      const k = Math.min(N - 1, Math.round(r * (N - 1))), c = perfil[k];
      for (let q = 0; q < 3; q++) img.data[o + q] = Math.round(255 * gammaSRGB(Math.min(1, bg[q] + Math.max(0, c[q]))));
      img.data[o + 3] = 255;
    }
    const off = document.createElement('canvas'); off.width = n; off.height = n; off.getContext('2d').putImageData(img, 0, 0);
    return off;
  }

  // ---------------------------------------------------------------------
  // Dibujo
  // ---------------------------------------------------------------------
  function dibujar() {
    tz.limpiar(); tz.opticaEtiquetas([...tz.zonasFlotantes()]);
    if (ERROR) { tz.texto(ERROR, tz.w / 2, tz.h / 2, { fuente: 'ui', tam: 13, color: 'error', alinear: 'center', halo: true }); return; }
    if (ESC.modo === 'pelicula') dibujarPelicula();
    else if (ESC.modo === 'cuna') dibujarCuna();
    else if (ESC.modo === 'newton') dibujarNewton();
    else dibujarMichelson();
  }
  const etqN = (sub, n) => [{ t: 'n', f: 'sim', tam: 13 }, { t: sub, f: 'simRecta', tam: 9, dy: 3 }, { t: ' = ' + fmt(n, 4), f: 'num', tam: 11.5, color: 'texto-2' }];
  const banda = (X0, Y0, X1, Y1, n) => tz.opticaMedio([W(X0, Y0), W(X1, Y0), W(X1, Y1), W(X0, Y1)], { n, sinMarca: true });

  function dibujarPelicula() {
    const x0 = 48, x1 = Math.round(0.6 * tz.w), Ytop = Math.round(0.4 * tz.h), H = 104, Ybot = Ytop + H, lam = lamRef();
    const col = blanca() ? null : ESC.lambda;
    // Medios: arriba n₁, película n₂, abajo n₃
    if (ESC.n1 !== 1) banda(x0, 64, x1, Ytop, ESC.n1);
    banda(x0, Ytop, x1, Ybot, ESC.n2);
    if (ESC.n3 !== 1) banda(x0, Ybot, x1, tz.h - 40, ESC.n3);
    tz.lineaPx([[x0, Ytop], [x1, Ytop]], { color: 'texto-2', grosor: 1 }); tz.lineaPx([[x0, Ybot], [x1, Ybot]], { color: 'texto-2', grosor: 1 });
    tz.compuesto(etqN('1', ESC.n1), x1 - 10, Ytop - 12, { alinear: 'right' });
    tz.compuesto(etqN('2', ESC.n2), x1 - 10, Ytop + H / 2 + 5, { alinear: 'right' });
    tz.compuesto(etqN('3', ESC.n3), x1 - 10, Ybot + 22, { alinear: 'right' });
    // Cota del grosor d (esquema: no está a escala)
    tz.flechaPx(x0 + 16, Ytop, x0 + 16, Ybot, { color: 'texto-2', grosor: 1, punta: 'abierta', ambas: true });
    tz.compuesto([{ t: 'd', f: 'sim', tam: 14 }, { t: ' = ' + largo(ESC.d, 4), f: 'num', tam: 11.5, color: 'texto-2' }], x0 + 24, Ytop + H / 2 + 4, {});
    // Rayos: incidente, reflejado en A, refractado A→B, reflejado B→C y salida en C
    // Con incidencia casi normal los rayos se dibujan algo inclinados (si no, se superponen)
    const th = Math.max(ESC.theta1, 12 * GR), phi = snell(ESC.n1, ESC.n2, th), xA = x0 + 0.3 * (x1 - x0), Lin = 150;
    if (ESC.capas.rayos && Number.isFinite(phi)) {
      const xB = xA + H * Math.tan(phi), xC = xB + H * Math.tan(phi), s = Math.sin(th), c = Math.cos(th);
      const P0 = [xA - Lin * s, Ytop - Lin * c];
      tz.opticaRayo(W(...P0), W(xA, Ytop), { lambda: col });
      tz.opticaRayo(W(xA, Ytop), W(xA + Lin * s, Ytop - Lin * c), { lambda: col, rel: 0.75 });
      tz.opticaRayo(W(xA, Ytop), W(xB, Ybot), { lambda: col, rel: 0.85 });
      tz.opticaRayo(W(xB, Ybot), W(xC, Ytop), { lambda: col, rel: 0.6 });
      tz.opticaRayo(W(xC, Ytop), W(xC + Lin * s, Ytop - Lin * c), { lambda: col, rel: 0.6 });
      const pt3 = snell(ESC.n2, ESC.n3, phi);
      if (Number.isFinite(pt3)) tz.opticaRayo(W(xB, Ybot), W(xB + 70 * Math.sin(pt3), Ybot + 70 * Math.cos(pt3)), { lambda: col, rel: 0.4 });
      // Normal y ángulos en A
      const nInc = [0, 1];
      if (ESC.theta1 > 0.5 * GR) tz.opticaAngulos(W(xA, Ytop), nInc, [s, -c], [Math.sin(phi), -Math.cos(phi)], [{ t: 'θ', f: 'sim', tam: 13 }], [{ t: 'φ', f: 'sim', tam: 13 }]);
      else { tz.lineaPx([[xA, Ytop - 40], [xA, Ybot + 30]], { color: 'texto-3', grosor: 1, patron: 'eje', extremo: 'butt' }); tz.texto('incidencia normal (rayos separados para verlos)', x0, Ytop - 52, { fuente: 'ui', tam: 11, color: 'texto-3', halo: true }); }
      for (const [nom, X, Y, dy] of [['A', xA, Ytop, -8], ['B', xB, Ybot, 18], ['C', xC, Ytop, -8]]) tz.texto(nom, X + 8, Y + dy, { fuente: 'ui', tam: 12, peso: 500, color: 'texto', halo: true });
      // Cambios de fase de π en las reflexiones contra un índice mayor
      if (ESC.capas.fases) {
        if (ESC.n2 > ESC.n1) tz.ficha(xA - 128, Ytop - 34, [[{ t: 'cambio de fase ', f: 'ui', tam: 11 }, { t: 'π', f: 'sim', tam: 13 }]], { ancla: [xA - 3, Ytop - 3] });
        if (ESC.n3 > ESC.n2) tz.ficha(xB + 12, Ybot + 28, [[{ t: 'cambio de fase ', f: 'ui', tam: 11 }, { t: 'π', f: 'sim', tam: 13 }]], { ancla: [xB + 2, Ybot + 2] });
      }
      if (ESC.capas.valores) {
        const phiR = snell(ESC.n1, ESC.n2, ESC.theta1), dOpt = 2 * ESC.n2 * ESC.d * Math.cos(phiR), ph = cambiosFase(ESC.n1, ESC.n2, ESC.n3) % 2 ? 0.5 : 0;
        const filas = [[{ t: '2', f: 'num', tam: 11.5 }, { t: 'n', f: 'sim', tam: 13 }, { t: '2', f: 'simRecta', tam: 9, dy: 3 }, { t: 'd', f: 'sim', tam: 13 }, { t: ' cos ', f: 'num', tam: 11.5 }, { t: 'φ', f: 'sim', tam: 13 }, { t: ' = ' + largo(dOpt, 4), f: 'num', tam: 11.5 }],
          [{ t: 'Δ/λ', f: 'sim', tam: 13 }, { t: ` = ${fmt(dOpt / lam + ph, 4)}`, f: 'num', tam: 11.5 }, { t: ph ? '  con ½ del cambio de fase' : '', f: 'ui', tam: 11, color: 'texto-3' }],
          [{ t: 'R', f: 'sim', tam: 13 }, { t: ' = ' + fmt(R(ESC.d), 4), f: 'num', tam: 11.5 }]];
        tz.ficha(Math.min(xC + 30, x1 - 250), Ytop - 122, filas, {});
      }
    }
    // Vista de frente: color de la película (en cuña si cambia el grosor)
    dibujarVistaFrente(x1 + 40, 70, tz.w - x1 - 80, tz.h - 120);
  }
  function dibujarVistaFrente(X, Y, Wd, Hd) {
    if (Wd < 60) return;
    const cuna = ESC.cuna, filas = Math.max(40, Math.round(Hd / 2)), colores = [];
    // Escala de brillo: el máximo de reflexión de la película más brillante
    const dMax = cuna ? Math.max(cuna.d0, cuna.d1) : ESC.d;
    let ref = 0;
    for (let k = 0; k <= 40; k++) { const d = dMax * k / 40, c = luzPelicula(ESC.n1, ESC.n2, ESC.n3, d, ESC.theta1, 1); ref = Math.max(ref, ...c); }
    ref = ref || 1;
    if (!cuna) {
      // Película uniforme: la superficie sin película (izquierda) junto a la que la tiene (derecha)
      const sin = luzPelicula(ESC.n1, ESC.n2, ESC.n3, 0, ESC.theta1, 1), con = luzPelicula(ESC.n1, ESC.n2, ESC.n3, ESC.d, ESC.theta1, 1), k = 1 / Math.max(ref, ...sin, ...con, 1e-12);
      const c = tz.ctx, mitad = Math.round(Wd / 2);
      c.save(); c.fillStyle = tz.opticaLuz(sin.map(v => v * k)); c.fillRect(X, Y, mitad, Hd); c.fillStyle = tz.opticaLuz(con.map(v => v * k)); c.fillRect(X + mitad, Y, Wd - mitad, Hd);
      c.strokeStyle = tz.t.linea; c.lineWidth = 1; c.strokeRect(X + 0.5, Y + 0.5, Wd - 1, Hd - 1); c.beginPath(); c.moveTo(X + mitad + 0.5, Y); c.lineTo(X + mitad + 0.5, Y + Hd); c.stroke(); c.restore();
      tz.texto('sin película', X + mitad / 2, Y + Hd + 16, { fuente: 'ui', tam: 11, color: 'texto-3', alinear: 'center', halo: true });
      tz.texto('con película', X + mitad + (Wd - mitad) / 2, Y + Hd + 16, { fuente: 'ui', tam: 11, color: 'texto-3', alinear: 'center', halo: true });
    } else {
      for (let i = 0; i < filas; i++) {
        const d = cuna.d0 + (cuna.d1 - cuna.d0) * (i + 0.5) / filas;
        colores.push(tz.opticaLuz(luzPelicula(ESC.n1, ESC.n2, ESC.n3, d, ESC.theta1, 1 / ref)));
      }
      tz.opticaFranjasVerticales(X, Y, Y + Hd, Wd, colores);
    }
    tz.compuesto([{ t: 'Vista de frente', f: 'ui', tam: 11.5, color: 'texto-2' }, { t: blanca() ? ' · luz blanca' : ` · λ = ${cantidad(ESC.lambda * 1e9, 'nm', 3)}`, f: 'ui', tam: 11, color: 'texto-3' }], X, Y - 10, {});
    if (cuna) {
      // Marcas del grosor y la del grosor del esquema
      const paso = Volta.pasoAgradable((cuna.d1 - cuna.d0) * 1e9 / 6);
      for (let v = Math.ceil(cuna.d0 * 1e9 / paso) * paso; v <= cuna.d1 * 1e9 + 1e-6; v += paso) {
        const Yv = Y + (v * 1e-9 - cuna.d0) / (cuna.d1 - cuna.d0) * Hd;
        tz.lineaPx([[X - 6, Yv], [X - 1, Yv]], { color: 'eje', grosor: 1, extremo: 'butt' });
        tz.texto(Volta.fmtMarca(v, paso), X - 9, Yv, { fuente: 'num', tam: 11, color: 'texto-3', alinear: 'right', base: 'middle', halo: true });
      }
      tz.compuesto([{ t: 'd', f: 'sim', tam: 14 }, { t: ' (nm)', f: 'ui', tam: 11 }], X - 9, Y + Hd + 18, { color: 'texto-3', alinear: 'right' });
      const Yd = Y + (ESC.d - cuna.d0) / (cuna.d1 - cuna.d0) * Hd;
      if (Yd >= Y && Yd <= Y + Hd) { tz.flechaPx(X + Wd + 16, Yd, X + Wd + 2, Yd, { color: 'tinta', grosor: 1.5 }); tz.asa(X + Wd + 18, Yd); }
    }
  }

  function dibujarCuna() {
    const lam = lamRef(), x0 = 70, x1 = tz.w - 70, Yc = Math.round(0.3 * tz.h), e = 24, ang = 2.2 * GR, Lp = x1 - x0;
    // Corte: placa de abajo, placa de arriba inclinada (ángulo exagerado) y el hilo que la levanta
    const abajo = [[x0, Yc], [x1, Yc], [x1, Yc + e], [x0, Yc + e]].map(p => W(...p));
    tz.opticaMedio(abajo, { n: ESC.nPlacas, sinMarca: false });
    const hx = Lp * Math.tan(ang), arriba = [[x0, Yc], [x1, Yc - hx], [x1, Yc - hx - e], [x0, Yc - e]].map(p => W(...p));
    tz.opticaMedio(arriba, { n: ESC.nPlacas });
    const c = tz.ctx; c.save(); c.fillStyle = tz.t.tinta; c.beginPath(); c.arc(x1 - 10, Yc - hx / 2 - 1, Math.max(2, hx / 2 - 1), 0, 2 * Math.PI); c.fill(); c.restore();
    tz.compuesto([{ t: 'α', f: 'sim', tam: 14 }, { t: ' = ' + cantidad(ESC.alfa * 1e3, 'mrad', 3), f: 'num', tam: 11.5, color: 'texto-2' }, { t: '  exagerado en el corte', f: 'ui', tam: 11, color: 'texto-3' }, { t: '     ', f: 'ui', tam: 11 }, ...etqN('c', ESC.nCuna)], x0, Yc + e + 20, {});
    if (ESC.capas.rayos) for (let k = 1; k <= 5; k++) { const X = x0 + Lp * k / 6; tz.opticaRayo(W(X, Yc - hx - e - 70), W(X, Yc - hx * k / 6 - e - 4), { lambda: blanca() ? null : ESC.lambda, flecha: true }); }
    // Franjas vistas desde arriba
    const Yf = Yc + 70, Hf = Math.max(60, tz.h - Yf - 70), filas = Math.round(Lp / 2), colores = [];
    let ref = 0; const lista = [];
    for (let i = 0; i < filas; i++) { const x = ESC.xmax * (i + 0.5) / filas, d = x * Math.tan(ESC.alfa); const cc = luzPelicula(ESC.nPlacas, ESC.nCuna, ESC.nPlacas, d, 0, 1); lista.push(cc); ref = Math.max(ref, ...cc); }
    lista.forEach(cc => colores.push(tz.opticaLuz(cc.map(v => v / (ref || 1)))));
    // Franjas verticales: dibujamos columnas
    c.save(); c.fillStyle = tz.opticaFondoLuz(); c.fillRect(x0, Yf, Lp, Hf);
    colores.forEach((cc, i) => { c.fillStyle = cc; c.fillRect(x0 + Lp * i / filas, Yf, Lp / filas + 0.6, Hf); });
    c.strokeStyle = tz.t.linea; c.lineWidth = 1; c.strokeRect(x0 + 0.5, Yf + 0.5, Lp - 1, Hf - 1); c.restore();
    const paso = Volta.pasoAgradable(ESC.xmax * 1e3 / 8);
    for (let v = 0; v <= ESC.xmax * 1e3 + 1e-9; v += paso) { const X = x0 + v * 1e-3 / ESC.xmax * Lp; tz.lineaPx([[X, Yf + Hf + 1], [X, Yf + Hf + 6]], { color: 'eje', grosor: 1, extremo: 'butt' }); tz.texto(Volta.fmtMarca(v, paso), X, Yf + Hf + 18, { fuente: 'num', tam: 11, color: 'texto-3', alinear: 'center', halo: true }); }
    tz.compuesto([{ t: 'x', f: 'sim', tam: 14 }, { t: ' (mm) desde el contacto', f: 'ui', tam: 11 }], x1, Yf + Hf + 34, { color: 'texto-3', alinear: 'right' });
    // Separación entre franjas (cota sobre dos mínimos)
    const fr = interfranjaCuna({ lambda: lam, n: ESC.nCuna, alfa: ESC.alfa });
    if (ESC.capas.valores && fr < ESC.xmax / 2) {
      const xa = x0 + 2 * fr / ESC.xmax * Lp, xb = x0 + 3 * fr / ESC.xmax * Lp;
      tz.flechaPx(xa, Yf - 10, xb, Yf - 10, { color: 'texto-2', grosor: 1, punta: 'abierta', ambas: true });
      tz.compuesto([{ t: 'Δ', f: 'simRecta', tam: 13 }, { t: 'x', f: 'sim', tam: 13 }, { t: ' = λ/(2nα) = ' + largo(fr, 4), f: 'num', tam: 11.5, color: 'texto-2' }], xb + 8, Yf - 6, {});
    }
  }

  function dibujarNewton() {
    const lam = lamRef(), Xc = Math.round(0.68 * tz.w), Yc = Math.round(tz.h / 2 + 4), Rpx = Math.round(Math.min(tz.h / 2 - 50, 0.28 * tz.w));
    // Corte: lente planoconvexa sobre una placa (curvatura exagerada)
    const x0 = 44, x1 = Math.round(0.42 * tz.w), Yp = Math.round(0.56 * tz.h), cx = (x0 + x1) / 2, rr = (x1 - x0) * 0.9;
    tz.opticaMedio([[x0, Yp], [x1, Yp], [x1, Yp + 22], [x0, Yp + 22]].map(p => W(...p)), { n: ESC.nPlaca });
    const pts = [], hw = (x1 - x0) * 0.42;
    for (let k = 0; k <= 40; k++) { const x = -hw + 2 * hw * k / 40, y = rr - Math.sqrt(rr * rr - x * x); pts.push(W(cx + x, Yp - 1 - y)); }
    const top = Yp - 1 - (rr - Math.sqrt(rr * rr - hw * hw)) - 26;
    tz.opticaMedio([...pts, W(cx + hw, top), W(cx - hw, top)], { n: ESC.nLente });
    tz.compuesto([{ t: 'R', f: 'sim', tam: 14 }, { t: ' = ' + largo(ESC.R, 3), f: 'num', tam: 11.5, color: 'texto-2' }, { t: '  curvatura exagerada', f: 'ui', tam: 11, color: 'texto-3' }], x0, Yp + 62, {});
    if (ESC.capas.rayos) for (const dx of [-0.6, -0.3, 0.3, 0.6]) tz.opticaRayo(W(cx + dx * hw, top - 80), W(cx + dx * hw, top - 2), { lambda: blanca() ? null : ESC.lambda });
    tz.compuesto(etqN('h', ESC.nHueco), x0, Yp + 40, {});
    // Anillos vistos desde arriba: R(r) con el hueco exacto
    const N = 600, perfil = [];
    let ref = 0;
    for (let k = 0; k < N; k++) { const r = ESC.rmax * k / (N - 1), d = huecoNewton(ESC.R, r); const c = luzPelicula(ESC.nLente, ESC.nHueco, ESC.nPlaca, d, 0, 1); perfil.push(c); ref = Math.max(ref, ...c); }
    const img = imagenRadial(Rpx, perfil.map(c => c.map(v => v / (ref || 1))));
    const c = tz.ctx; c.save(); c.drawImage(img, Xc - Rpx, Yc - Rpx); c.strokeStyle = tz.t.linea; c.lineWidth = 1; c.beginPath(); c.arc(Xc, Yc, Rpx, 0, 2 * Math.PI); c.stroke(); c.restore();
    // Escala de r y radios de los anillos oscuros √(mλR/n)
    const paso = Volta.pasoAgradable(ESC.rmax * 1e3 / 4);
    for (let v = 0; v <= ESC.rmax * 1e3 + 1e-9; v += paso) { const X = Xc + v * 1e-3 / ESC.rmax * Rpx; tz.lineaPx([[X, Yc + Rpx + 4], [X, Yc + Rpx + 9]], { color: 'eje', grosor: 1, extremo: 'butt' }); tz.texto(Volta.fmtMarca(v, paso), X, Yc + Rpx + 20, { fuente: 'num', tam: 11, color: 'texto-3', alinear: 'center', halo: true }); }
    tz.compuesto([{ t: 'r', f: 'sim', tam: 14 }, { t: ' (mm)', f: 'ui', tam: 11 }], Xc + Rpx, Yc + Rpx + 36, { color: 'texto-3', alinear: 'right' });
    if (ESC.capas.valores && !blanca()) {
      let previo = -Infinity;
      for (let m = 1; m < 60; m++) {
        const r = radioAnilloOscuro({ m, lambda: lam, R: ESC.R, n: ESC.nHueco }); if (r > ESC.rmax) break;
        const X = Xc - r / ESC.rmax * Rpx; if (Math.abs(X - previo) < 18) continue; previo = X;
        tz.lineaPx([[X, Yc - Rpx - 4], [X, Yc - Rpx - 10]], { color: 'texto-2', grosor: 1, extremo: 'butt' });
        tz.texto(String(m), X, Yc - Rpx - 14, { fuente: 'num', tam: 10.5, color: 'texto-3', alinear: 'center', halo: true });
      }
      tz.compuesto([{ t: 'anillos oscuros ', f: 'ui', tam: 11, color: 'texto-3' }, { t: 'm', f: 'sim', tam: 12, color: 'texto-3' }], Xc - Rpx, Yc - Rpx - 28, {});
    }
  }

  function dibujarMichelson() {
    const lam = lamRef(), s = michelsonEn(escMich(), t), m = ESC.mich;
    const Xc = Math.round(0.3 * tz.w), Yc = Math.round(0.47 * tz.h), brazo = Math.min(170, 0.22 * tz.w, 0.32 * tz.h), col = blanca() ? null : ESC.lambda;
    // Desplazamiento del espejo móvil (esquema: ±14 px para todo su recorrido)
    const dFin = m.d0 + m.v * ESC.duracion, desp = (m.v ? (s.d - m.d0) / Math.max(1e-12, Math.abs(dFin - m.d0)) : 0) * 14;
    const M1 = [Xc, Yc - brazo], M2 = [Xc + brazo + desp, Yc], F = [Xc - brazo, Yc], D = [Xc, Yc + brazo * 0.85];
    if (ESC.capas.rayos) {
      tz.opticaRayo(W(...F), W(Xc, Yc), { lambda: col });
      tz.opticaRayo(W(Xc, Yc), W(...M1), { lambda: col, rel: 0.7 }); tz.opticaRayo(W(...M1), W(Xc + 0.01, Yc), { lambda: col, rel: 0.7, flecha: false });
      tz.opticaRayo(W(Xc, Yc), W(M2[0], Yc), { lambda: col, rel: 0.7 }); tz.opticaRayo(W(M2[0], Yc + 4), W(Xc, Yc + 4), { lambda: col, rel: 0.7 });
      tz.opticaRayo(W(Xc, Yc), W(...D), { lambda: col, rel: 0.85 });
    }
    tz.opticaFuente(W(...F));
    tz.opticaDivisor(W(Xc - 18, Yc + 18), W(Xc + 18, Yc - 18), {});
    tz.opticaEspejo([W(Xc - 22, Yc - brazo), W(Xc + 22, Yc - brazo)], [0, -1]);
    tz.opticaEspejo([W(M2[0], Yc - 22), W(M2[0], Yc + 22)], [-1, 0]);
    tz.opticaPantalla(W(D[0] - 26, D[1]), W(D[0] + 26, D[1]), [], { lado: -1 });
    for (const [txt, X, Y, al] of [['M₁', Xc + 28, Yc - brazo + 4, 'left'], ['M₂', M2[0] + 10, Yc - 28, 'left'], ['divisor', Xc + 22, Yc + 30, 'left'], ['pantalla', D[0] + 34, D[1] + 4, 'left']]) tz.texto(txt, X, Y, { fuente: 'ui', tam: 11.5, color: 'texto-2', alinear: al, halo: true });
    // Velocidad del espejo (familia movimiento)
    if (m.v) { const L = 28, xa = M2[0] - 8 - L; tz.flechaPx(m.v > 0 ? xa : xa + L, Yc + 40, m.v > 0 ? xa + L : xa, Yc + 40, { color: 'movimiento', grosor: Volta.G.vector }); tz.etiquetaMagnitud(xa - 6, Yc + 45, { simbolo: 'v', valor: m.v * 1e6, unidad: 'µm/s', color: 'movimiento', cifras: 3, tam: 13, alinear: 'right' }); }
    // Lámina en el brazo 2 (girada)
    if (s.lamina) {
      const g = s.lamina.giro, Xl = Xc + brazo * 0.55, hl = 26, el = 5, cg = Math.cos(g), sg = Math.sin(g);
      const pts = [[-el, -hl], [el, -hl], [el, hl], [-el, hl]].map(([x, y]) => W(Xl + x * cg - y * sg, Yc + x * sg + y * cg));
      tz.opticaMedio(pts, { n: s.lamina.n, sinMarca: true });
      tz.compuesto([{ t: 'lámina', f: 'ui', tam: 11, color: 'texto-3' }, { t: `  φ = ${fmt(g / GR, 3)}°`, f: 'num', tam: 11, color: 'texto-2' }], Xl - 30, Yc + hl + 22, {});
    }
    // Anillos en la pantalla (vistos a través de una lente de focal f)
    const Rpx = Math.round(Math.min(0.32 * tz.h, 0.2 * tz.w)), Xa = Math.round(0.74 * tz.w), Ya = Math.round(0.45 * tz.h), N = 500, perfil = [], c0 = colorLongitudOnda(lam).lineal;
    for (let k = 0; k < N; k++) { const I = anilloMichelson({ d: s.d, lambda: lam, lamina: s.lamina, f: m.f }, m.rmax * k / (N - 1)); perfil.push(c0.map(x => x * I)); }
    const img = imagenRadial(Rpx, perfil), c = tz.ctx;
    c.save(); c.drawImage(img, Xa - Rpx, Ya - Rpx); c.strokeStyle = tz.t.linea; c.lineWidth = 1; c.beginPath(); c.arc(Xa, Ya, Rpx, 0, 2 * Math.PI); c.stroke(); c.restore();
    tz.compuesto([{ t: 'Pantalla', f: 'ui', tam: 11.5, color: 'texto-2' }, { t: '  (anillos de igual inclinación)', f: 'ui', tam: 11, color: 'texto-3' }], Xa - Rpx, Ya - Rpx - 12, {});
    // Contador de franjas y lecturas
    if (ESC.capas.contador && SERIE) {
      const N0 = cuentaEn(t), filas = [[{ t: 'Franjas contadas: ', f: 'ui', tam: 11.5 }, { t: String(N0), f: 'num', tam: 13 }],
        [{ t: 'Δ', f: 'simRecta', tam: 13 }, { t: ' = ' + largo(s.delta, 5), f: 'num', tam: 11.5 }],
        [{ t: 'Δ/λ', f: 'sim', tam: 13 }, { t: ' = ' + fmt(s.delta / lam, 6), f: 'num', tam: 11.5 }]];
      tz.ficha(Xa - Rpx, Ya + Rpx + 16, filas, {});
    }
  }
  function cuentaEn(tt) { if (!SERIE) return 0; const i = Math.max(0, Math.min(SERIE.t.length - 1, Math.round(tt / ESC.duracion * (SERIE.t.length - 1)))); return SERIE.cuenta[i]; }

  // ---------------------------------------------------------------------
  // Inspector, árbol, lecturas, variables
  // ---------------------------------------------------------------------
  const fila = (etq, control, ayuda = '') => `<div class="fila"${ayuda ? ` data-ayuda="${ayuda}"` : ''}><span class="etq">${etq}</span>${control}</div>`;
  const segmentado = (id, ops, actual) => `<div class="segmentado texto" id="${id}">${ops.map(([v, txt]) => `<button data-v="${v}" aria-pressed="${String(v) === String(actual)}">${txt}</button>`).join('')}</div>`;
  const leer = ruta => ruta.split('.').reduce((o, k) => (o == null ? o : o[k]), ESC);
  function escribir(ruta, val) { const ks = ruta.split('.'), u = ks.pop(), o = ks.reduce((a, k) => a[k], ESC); o[u] = val; }
  const ligadaA = ruta => Object.entries(ESC.variables).find(([, d]) => d.liga.includes(ruta));
  function campo(etq, ruta, dim, u, ayuda = '') {
    const lig = ligadaA(ruta);
    if (lig) { const [nv, d] = lig; return fila(etq, `<div class="campo es-variable" data-ayuda="Ligado a la variable ${d.sim}|Bound to variable"><span class="chip-var">${simHTML(d.sim, d.sub)}</span><span class="valor-var" data-var="${nv}"></span><span class="u">${d.u}</span></div>`, ayuda); }
    const val = leer(ruta);
    return fila(etq, `<div class="campo"><input data-ruta="${ruta}" data-dim="${dim}" data-u="${u}" value="${val == null ? '' : numCampo(val / (FAC[u] ?? 1))}"><span class="u">${u}</span></div>`, ayuda);
  }
  function inspector() {
    const props = $('#propiedades'), m = MODOS[ESC.modo];
    let h = '', ico = m.ico, nombre = m.nombre, titulo = 'Propiedades';
    if (sel === 'fuente') {
      ico = 'o-fuente-luz'; nombre = 'Fuente'; titulo = 'Luz';
      h = fila('Luz', segmentado('p-luz', [['mono', 'Monocromática'], ['blanca', 'Blanca']], blanca() ? 'blanca' : 'mono'), 'Monocromática o blanca (espectro plano)|Light')
        + (blanca() ? '' : campo('λ', 'lambda', 'longitud', 'nm', 'Longitud de onda en el vacío|Wavelength'));
      if (ESC.modo === 'pelicula') h += campo('θ', 'theta1', 'adimensional', '°', 'Ángulo de incidencia|Incidence angle');
    } else if (ESC.modo === 'pelicula') {
      titulo = 'Película';
      h = campo('n₁', 'n1', 'adimensional', '', 'Índice del medio de arriba|Upper medium') + campo('n₂', 'n2', 'adimensional', '', 'Índice de la película|Film index') + campo('n₃', 'n3', 'adimensional', '', 'Índice del medio de abajo|Lower medium')
        + campo('d', 'd', 'longitud', 'nm', 'Grosor de la película en el esquema|Thickness')
        + fila('Grosor', segmentado('p-cuna', [['no', 'Uniforme'], ['si', 'En cuña']], ESC.cuna ? 'si' : 'no'), 'En cuña: la vista de frente recorre grosores de d₀ (arriba) a d₁ (abajo)|Wedge');
      if (ESC.cuna) h += campo('d₀', 'cuna.d0', 'longitud', 'nm') + campo('d₁', 'cuna.d1', 'longitud', 'nm');
    } else if (ESC.modo === 'cuna') {
      titulo = 'Cuña';
      h = campo('α', 'alfa', 'adimensional', 'mrad', 'Ángulo entre las placas|Wedge angle') + campo('n', 'nCuna', 'adimensional', '', 'Índice del medio en la cuña|Gap index') + campo('Placas', 'nPlacas', 'adimensional', '', 'Índice del vidrio|Glass index') + campo('Largo', 'xmax', 'longitud', 'mm', 'Tramo que se ve|View length');
    } else if (ESC.modo === 'newton') {
      titulo = 'Lente sobre placa';
      h = campo('R', 'R', 'longitud', 'm', 'Radio de curvatura de la lente|Radius') + campo('n hueco', 'nHueco', 'adimensional', '', 'Índice entre la lente y la placa|Gap index') + campo('Lente', 'nLente', 'adimensional', '') + campo('Placa', 'nPlaca', 'adimensional', '') + campo('Radio', 'rmax', 'longitud', 'mm', 'Radio de la vista|View radius');
    } else {
      titulo = 'Interferómetro';
      h = campo('d₀', 'mich.d0', 'longitud', 'mm', 'Diferencia de brazos inicial L₂ − L₁|Arm difference') + campo('v', 'mich.v', 'velocidad', 'µm/s', 'Velocidad del espejo móvil M₂|Mirror speed') + campo('Duración', 'duracion', 'tiempo', 's')
        + fila('Lámina', segmentado('p-lamina', [['no', 'Sin lámina'], ['si', 'Con lámina']], ESC.mich.lamina ? 'si' : 'no'), 'Lámina de caras paralelas en el brazo de M₂|Glass plate');
      if (ESC.mich.lamina) h += campo('n', 'mich.lamina.n', 'adimensional', '') + campo('Grosor', 'mich.lamina.espesor', 'longitud', 'mm') + campo('Giro', 'mich.lamina.giro', 'adimensional', '°', 'Inclinación inicial|Tilt') + campo('ω', 'mich.omega', 'frecuencia', '°/s', 'Velocidad de giro de la lámina|Rotation speed');
    }
    props.innerHTML = h;
    $('#insp-ico').setAttribute('href', '#' + ico); $('#insp-nombre').textContent = nombre; $('#props-titulo').textContent = titulo;
    props.querySelectorAll('input[data-ruta]').forEach(campoConUnidad);
    const on = (id, f) => { const e = $(id); if (e) e.addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) f(b.dataset.v); }); };
    on('#p-luz', v => { ESC.lambda = v === 'blanca' ? null : (ESC.modo === 'michelson' ? 632.8e-9 : 550e-9); limpiarVariables(); cambio(); });
    on('#p-cuna', v => { ESC.cuna = v === 'si' ? { d0: 0, d1: Math.max(4 * ESC.d, 1e-6) } : null; cambio(); });
    on('#p-lamina', v => { ESC.mich.lamina = v === 'si' ? { n: 1.5, espesor: 0.1e-3, giro: 0 } : null; if (!ESC.mich.lamina) ESC.mich.omega = 0; limpiarVariables(); cambio(); });
    document.querySelectorAll('#paleta-objetos .herr').forEach(b => b.setAttribute('aria-current', String(b.dataset.herr === (sel === 'fuente' ? 'fuente' : ESC.modo))));
    arbol();
  }
  function validar(ruta, x) {
    const k = ruta.split('.').pop();
    if (['n1', 'n2', 'n3', 'nPlacas', 'nCuna', 'nLente', 'nHueco', 'nPlaca', 'n'].includes(k) && !(x >= 1 && x <= 4)) throw new Error('El índice va de 1 a 4.');
    if (k === 'lambda' && !(x >= 300e-9 && x <= 800e-9)) throw new Error('La longitud de onda va de 300 nm a 800 nm.');
    if (['d', 'd0', 'd1'].includes(k) && ruta !== 'mich.d0' && !(x >= 0 && x <= 20e-6)) throw new Error('El grosor va de 0 a 20 µm.');
    if (k === 'theta1' && !(x >= 0 && x < 89.5 * GR)) throw new Error('El ángulo va de 0° a 89°.');
    if (k === 'alfa' && !(x > 0 && x <= 0.05)) throw new Error('El ángulo de la cuña va de 0 a 50 mrad.');
    if (['xmax', 'rmax', 'R', 'espesor'].includes(k) && !(x > 0 && x <= 10)) throw new Error('Este valor tiene que ser positivo.');
    if (k === 'duracion' && !(x > 0 && x <= 600)) throw new Error('La duración va de 0 a 600 s.');
    if (ruta === 'mich.d0' && !(Math.abs(x) <= 0.05)) throw new Error('La diferencia de brazos va hasta 5 cm.');
    if (k === 'v' && !(Math.abs(x) <= 1e-3)) throw new Error('La velocidad del espejo va hasta 1 mm/s.');
    return x;
  }
  function campoConUnidad(ent) {
    const caja = ent.closest('.campo'), f = ent.closest('.fila');
    const mostrarError = msj => { caja.classList.toggle('es-error', !!msj); let p = f.querySelector('.mensaje-error'); if (msj && !p) { p = document.createElement('p'); p.className = 'mensaje-error'; f.appendChild(p); } if (p) { if (msj) p.textContent = msj; else p.remove(); } };
    ent.addEventListener('change', () => {
      try {
        const dim = ent.dataset.dim, u = ent.dataset.u;
        let txt = ent.value.trim().replace(/−/g, '-');
        if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(txt) && u && u !== '°') txt = u === 'mrad' ? `${txt}e-3` : u === '°/s' ? `${txt} ° / s` : `${txt} ${u}`;
        const r = evaluar(txt, { esperada: dim, unidadPorDefecto: u === '°' ? '°' : undefined });
        escribir(ent.dataset.ruta, validar(ent.dataset.ruta, r.valor)); mostrarError(null); cambio();
      } catch (e) { mostrarError(e.message); }
    });
    ent.addEventListener('keydown', ev => { if (ev.key === 'Escape') { mostrarError(null); ent.blur(); inspector(); } });
  }
  function arbol() {
    const nodo = (s, ico, nombre, dato) => `<div class="nodo" data-sel="${s}" aria-selected="${sel === s}"><svg class="ico"><use href="#${ico}"/></svg><span class="nombre">${nombre}</span><span class="dato">${dato}</span></div>`;
    const dato = ESC.modo === 'pelicula' ? `d = ${largo(ESC.d, 3)}` : ESC.modo === 'cuna' ? `α = ${cantidad(ESC.alfa * 1e3, 'mrad', 3)}` : ESC.modo === 'newton' ? `R = ${largo(ESC.R, 3)}` : `d = ${largo(michelsonEn(escMich(), t).d, 4)}`;
    $('#arbol').innerHTML = nodo('fuente', 'o-fuente-luz', 'Fuente', blanca() ? 'blanca' : cantidad(ESC.lambda * 1e9, 'nm', 4)) + nodo('objeto', MODOS[ESC.modo].ico, MODOS[ESC.modo].nombre, dato);
    $('#arbol').querySelectorAll('.nodo').forEach(n => n.addEventListener('click', () => { sel = n.dataset.sel; inspector(); todo(); }));
  }
  const lectura = ([a, b, val, u, ayuda]) => `<span class="sim"${ayuda ? ` data-ayuda="${ayuda}"` : ''}>${a}${b ? `<sub class="r">${b}</sub>` : ''}</span><span class="v">${val}</span><span class="u">${u}</span>`;
  const partes = s => { const m = /^(−?[\d.]+(?: × 10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)?)\s(.+)$/.exec(s); return m ? [m[1], m[2]] : [s, '']; };
  const Lx = (a, b, v, ay) => { const [x, u] = partes(largo(v, 4)); return [a, b, x, u, ay]; };
  function lecturas() {
    document.querySelectorAll('[data-var]').forEach(e => { const d = ESC.variables[e.dataset.var]; if (d) e.textContent = fmtVar(d); });
    $('#reloj').innerHTML = `<span class="sim">t</span>${fmt(t, 4).padStart(6, ' ')}<span class="u">s</span>`;
    $('#b-play').innerHTML = `<svg class="ico"><use href="#i-${jugando ? 'pausar' : 'reproducir'}"/></svg>`;
    const f = [], lam = lamRef();
    let estado = '';
    if (ESC.modo === 'pelicula') {
      const phi = snell(ESC.n1, ESC.n2, ESC.theta1), c = cambiosFase(ESC.n1, ESC.n2, ESC.n3);
      f.push(Lx('λ', 'película', lam / ESC.n2, 'Longitud de onda en la película λ/n₂|Wavelength in film'));
      if (Number.isFinite(phi)) f.push(['φ', '', fmt(phi / GR, 4), '°', 'Ángulo de refracción: n₁ sen θ = n₂ sen φ|Refraction angle'], Lx('2n₂d cos φ', '', 2 * ESC.n2 * ESC.d * Math.cos(phi), 'Diferencia de caminos ópticos de los dos haces|Optical path difference'));
      f.push(['R', '', fmt(R(ESC.d), 4), '', 'Reflectancia (suma de Airy, luz no polarizada)|Reflectance'], ['N', 'π', String(c), '', 'Reflexiones con cambio de fase de π|Phase changes']);
      const mx = espesoresMaximos({ n1: ESC.n1, n2: ESC.n2, n3: ESC.n3, lambda: lam, theta1: ESC.theta1, cuantos: 3 });
      mx.forEach((q, i) => f.push(Lx('d', `máx ${q.m}`, q.d, i ? '' : (c === 1 ? 'Refuerzo: 2n₂d cos φ = (m + ½)λ|Constructive' : 'Refuerzo: 2n₂d cos φ = mλ|Constructive'))));
      estado = c === 1 ? 'Un cambio de fase: refuerzo en (m + ½)λ' : 'Cero o dos cambios de fase: refuerzo en mλ';
    } else if (ESC.modo === 'cuna') {
      f.push(Lx('Δx', '', interfranjaCuna({ lambda: lam, n: ESC.nCuna, alfa: ESC.alfa }), 'Separación entre franjas λ/(2nα)|Fringe spacing'), Lx('d', 'fin', ESC.xmax * Math.tan(ESC.alfa), 'Grosor de la cuña al final de la vista|Thickness at end'));
      estado = 'Oscura en el contacto (un cambio de fase)';
    } else if (ESC.modo === 'newton') {
      for (let m = 1; m <= 4; m++) f.push(Lx('r', String(m), radioAnilloOscuro({ m, lambda: lam, R: ESC.R, n: ESC.nHueco }), m === 1 ? 'Anillos oscuros: r = √(mλR/n)|Dark rings' : ''));
      estado = 'Centro oscuro en reflexión';
    } else {
      const s = michelsonEn(escMich(), t), N = cuentaEn(t);
      f.push(Lx('d', '', s.d, 'Diferencia de brazos L₂ − L₁|Arm difference'), Lx('Δ', '', s.delta, 'Diferencia de caminos en el centro|Path difference'), ['N', '', String(N), '', 'Franjas que pasaron por el centro|Counted fringes'], ['I', 'centro', fmt(s.I, 4), '', 'Intensidad relativa en el centro|Center intensity']);
      if (ESC.mich.v) f.push(['2Δd/λ', '', fmt(franjasMichelson(s.d - ESC.mich.d0, lam), 4), '', 'Franjas esperadas por el movimiento del espejo|Expected fringes']);
      if (ESC.mich.lamina) {
        const l = ESC.mich.lamina;
        f.push(['N', 'lámina', fmt(2 * (l.n - 1) * l.espesor / lam, 5), '', 'Franjas que desplaza la lámina al insertarla: 2(n − 1)t/λ|Plate shift']);
        if (ESC.mich.omega && s.lamina.giro > 1e-6) { const nE = indiceDesdeGiro({ N, lambda: lam, espesor: l.espesor, phi: s.lamina.giro }); f.push(['n', 'medido', fmt(nE, 4), '', 'Índice que se deduce de las franjas contadas al girar la lámina|Measured index']); }
        else if (!ESC.mich.omega) f.push(['n', '', fmt(indiceDesdeLamina({ N: 2 * (l.n - 1) * l.espesor / lam, lambda: lam, espesor: l.espesor }), 4), '', 'n = 1 + Nλ/(2t)|Index']);
      }
      estado = `${N} franjas contadas`;
    }
    $('#lecturas').innerHTML = f.map(lectura).join('');
    $('#insp-estado').textContent = estado;
    $('#lect-titulo').textContent = esMich() ? `Lecturas en t = ${fmt(t, 4)} s` : 'Lecturas';
  }
  function fmtVar(d) { const dec = !(d.paso > 0) || d.paso >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(d.paso) - 1e-9)); return d.val.toFixed(dec).replace('-', '−'); }
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
  function aplicarVariables() { for (const d of Object.values(ESC.variables)) for (const r of d.liga) { if (leer(r) !== undefined && leer(r) !== null) escribir(r, d.val * d.factor); } }
  function limpiarVariables() { for (const [k, d] of Object.entries(ESC.variables)) { d.liga = d.liga.filter(r => typeof leer(r) === 'number'); if (!d.liga.length) delete ESC.variables[k]; } construirVariables(); }

  // ---------------------------------------------------------------------
  // Gráficas
  // ---------------------------------------------------------------------
  const vacia = (n, msj) => { grafica($(`#g${n}`), { x: { min: 0, max: 1 }, y: { min: 0, max: 1 }, series: [] }); $(`#t${n}`).textContent = msj; $(`#l${n}`).textContent = ''; };
  const muestras = (a, b, n, f) => Array.from({ length: n + 1 }, (_, i) => { const x = a + (b - a) * i / n; return [x, f(x)]; });
  function graficas() {
    if ($('#p-graficas').hidden) return;
    const lam = lamRef(), T = i => $(`#t${i}`), L = i => $(`#l${i}`), g = i => $(`#g${i}`);
    if (ESC.modo === 'pelicula' || ESC.modo === 'cuna') {
      const n1 = ESC.modo === 'cuna' ? ESC.nPlacas : ESC.n1, n2 = ESC.modo === 'cuna' ? ESC.nCuna : ESC.n2, n3 = ESC.modo === 'cuna' ? ESC.nPlacas : ESC.n3, th = ESC.modo === 'cuna' ? 0 : ESC.theta1;
      const d0 = ESC.modo === 'cuna' ? ESC.xmax / 2 * Math.tan(ESC.alfa) : ESC.d, Rf = (d, l) => pelicula({ n1, n2, n3, d, lambda: l, theta1: th }).R;
      // 1: R contra λ
      const pl = muestras(380, 750, 300, l => Rf(d0, l * 1e-9)), m1 = Math.max(...pl.map(p => p[1]), 1e-3);
      grafica(g(1), { x: { min: 380, max: 750 }, y: { min: 0, max: m1 * 1.1 }, series: [{ tramos: [pl], familia: 'tinta' }], cursor: blanca() ? null : lam * 1e9, puntoCursor: blanca() ? null : [lam * 1e9, Rf(d0, lam)] });
      T(1).innerHTML = `${simHTML('R')} contra ${simHTML('λ')} (nm) con ${simHTML('d')} = ${largo(d0, 3)}`; L(1).textContent = blanca() ? '' : `R = ${fmt(Rf(d0, lam), 3)}`;
      // 2: R contra d (con los grosores de refuerzo)
      const dm = Math.max(4 * lam / (2 * n2), d0 * 1.4), pd = muestras(0, dm, 500, d => Rf(d, lam)).map(([d, r]) => [d * 1e9, r]), m2 = Math.max(...pd.map(p => p[1]), 1e-3);
      const ev = espesoresMaximos({ n1, n2, n3, lambda: lam, theta1: th, cuantos: 12 }).filter(q => q.d <= dm).map(q => ({ x: q.d * 1e9 }));
      grafica(g(2), { x: { min: 0, max: dm * 1e9 }, y: { min: 0, max: m2 * 1.1 }, series: [{ tramos: [pd], familia: 'tinta' }], cursor: d0 * 1e9, puntoCursor: [d0 * 1e9, Rf(d0, lam)], eventos: ev });
      T(2).innerHTML = `${simHTML('R')} contra ${simHTML('d')} (nm) a ${simHTML('λ')} = ${cantidad(lam * 1e9, 'nm', 3)}`; L(2).textContent = '◆ refuerzo';
      // 3: R contra θ (película) o I(x) (cuña)
      if (ESC.modo === 'pelicula') {
        const pt = muestras(0, 89, 300, a => Rf(d0, lam) && pelicula({ n1, n2, n3, d: d0, lambda: lam, theta1: a * GR }).R), m3 = Math.max(...pt.map(p => p[1]), 1e-3);
        grafica(g(3), { x: { min: 0, max: 90 }, y: { min: 0, max: Math.min(1.02, m3 * 1.1) }, series: [{ tramos: [pt], familia: 'tinta' }], cursor: th / GR, puntoCursor: [th / GR, Rf(d0, lam)] });
        T(3).innerHTML = `${simHTML('R')} contra ${simHTML('θ')} (°)`; L(3).textContent = '';
      } else {
        const px = muestras(0, ESC.xmax, 800, x => Rf(x * Math.tan(ESC.alfa), lam)).map(([x, r]) => [x * 1e3, r]);
        grafica(g(3), { x: { min: 0, max: ESC.xmax * 1e3 }, y: { min: 0, max: Math.max(...px.map(p => p[1])) * 1.1 || 1 }, series: [{ tramos: [px], familia: 'tinta' }] });
        T(3).innerHTML = `${simHTML('R')} contra ${simHTML('x')} (mm)`; L(3).textContent = `Δx = ${largo(interfranjaCuna({ lambda: lam, n: ESC.nCuna, alfa: ESC.alfa }), 3)}`;
      }
    } else if (ESC.modo === 'newton') {
      const pr = muestras(0, ESC.rmax, 1500, r => reflectanciaNewton({ R: ESC.R, lambda: lam, nLente: ESC.nLente, nHueco: ESC.nHueco, nPlaca: ESC.nPlaca }, r)).map(([r, v]) => [r * 1e3, v]);
      const ev = []; for (let m = 1; m < 200; m++) { const r = radioAnilloOscuro({ m, lambda: lam, R: ESC.R, n: ESC.nHueco }); if (r > ESC.rmax) break; ev.push({ x: r * 1e3 }); }
      grafica(g(1), { x: { min: 0, max: ESC.rmax * 1e3 }, y: { min: 0, max: Math.max(...pr.map(p => p[1])) * 1.1 || 1 }, series: [{ tramos: [pr], familia: 'tinta' }], eventos: ev });
      T(1).innerHTML = `${simHTML('R')} contra ${simHTML('r')} (mm) · ◆ √(mλR/n)`; L(1).textContent = '';
      // 2: r² de los anillos oscuros medidos contra m: recta de pendiente λR/n
      const mins = extremos(pr.map(p => p[0]), pr.map(p => p[1]), 'min').filter(q => q.x > 1e-9).slice(0, 25), med = mins.map((q, i) => [i + 1, (q.x) ** 2]);
      const teo = med.length ? [[0, 0], [med.length + 1, (med.length + 1) * lam * ESC.R / ESC.nHueco * 1e6]] : [];
      grafica(g(2), { x: { min: 0, max: Math.max(2, med.length + 1) }, y: { min: 0, max: Math.max(1e-6, ...teo.map(p => p[1])) }, series: [{ tramos: [teo], familia: 'tinta', patron: 'discontinuo' }, { tramos: [med], familia: 'tinta' }], eventos: med.map(([x, y]) => ({ x, y })) });
      T(2).innerHTML = `${simHTML('r')}² (mm²) de los anillos oscuros contra ${simHTML('m')}`; L(2).textContent = `λR/n = ${fmt(lam * ESC.R / ESC.nHueco * 1e6, 3)} mm²`;
      // 3: grosor del hueco contra r
      const ph = muestras(0, ESC.rmax, 200, r => huecoNewton(ESC.R, r) * 1e9).map(([r, d]) => [r * 1e3, d]);
      grafica(g(3), { x: { min: 0, max: ESC.rmax * 1e3 }, y: { min: 0, max: ph[ph.length - 1][1] * 1.05 }, series: [{ tramos: [ph], familia: 'tinta' }] });
      T(3).innerHTML = `Hueco ${simHTML('d')} (nm) contra ${simHTML('r')} (mm)`; L(3).textContent = '';
    } else if (SERIE) {
      const S = SERIE, paso = Math.max(1, Math.floor(S.t.length / 800)), I = [], Nc = [], Nt = [];
      for (let i = 0; i < S.t.length; i += paso) { I.push([S.t[i], S.I[i]]); Nc.push([S.t[i], S.cuenta[i]]); Nt.push([S.t[i], (S.delta[i] - S.delta[0]) / lamRef()]); }
      const k = Math.round(t / ESC.duracion * (S.t.length - 1));
      grafica(g(1), { x: { min: 0, max: ESC.duracion }, y: { min: 0, max: 1.05 }, series: [{ tramos: [I], familia: 'tinta' }], cursor: t, puntoCursor: [t, S.I[k]] });
      T(1).innerHTML = `${simHTML('I')} en el centro contra ${simHTML('t')} (s)`; L(1).textContent = fmt(S.I[k], 3);
      const ymax = Math.max(1, ...Nt.map(p => Math.abs(p[1])), ...Nc.map(p => p[1])) * 1.08;
      grafica(g(2), { x: { min: 0, max: ESC.duracion }, y: { min: Math.min(0, ...Nt.map(p => p[1])), max: ymax }, series: [{ tramos: [Nc], familia: 'tinta' }, { tramos: [Nt], familia: 'tinta', patron: 'discontinuo' }], cursor: t, puntoCursor: [t, S.cuenta[k]] });
      T(2).innerHTML = `<span class="leyenda"><span style="color:var(--tinta)"><i></i>contadas</span><span style="color:var(--tinta)"><i class="discontinua"></i>Δ/λ</span></span> contra ${simHTML('t')} (s)`; L(2).textContent = String(S.cuenta[k]);
      const s = michelsonEn(escMich(), t), pa = muestras(0, ESC.mich.rmax, 600, r => anilloMichelson({ d: s.d, lambda: lamRef(), lamina: s.lamina, f: ESC.mich.f }, r)).map(([r, v]) => [r * 1e3, v]);
      grafica(g(3), { x: { min: 0, max: ESC.mich.rmax * 1e3 }, y: { min: 0, max: 1.05 }, series: [{ tramos: [pa], familia: 'tinta' }] });
      T(3).innerHTML = `${simHTML('I')} contra ${simHTML('ρ')} (mm) en la pantalla`; L(3).textContent = '';
    } else for (const i of [1, 2, 3]) vacia(i, 'Sin datos');
  }

  // ---------------------------------------------------------------------
  // Tabla, exportación, ciclo, historial
  // ---------------------------------------------------------------------
  function datosTabla() {
    const lam = lamRef();
    if (ESC.modo === 'pelicula') return { cols: ['d (nm)', `R a ${fmt(lam * 1e9, 4)} nm`], filas: muestras(0, Math.max(1e-6, 2 * ESC.d), 100, d => R(d)).map(([d, r]) => [d * 1e9, r]) };
    if (ESC.modo === 'cuna') return { cols: ['x (mm)', 'R'], filas: muestras(0, ESC.xmax, 200, x => pelicula({ n1: ESC.nPlacas, n2: ESC.nCuna, n3: ESC.nPlacas, d: x * Math.tan(ESC.alfa), lambda: lam }).R).map(([x, r]) => [x * 1e3, r]) };
    if (ESC.modo === 'newton') return { cols: ['r (mm)', 'hueco (nm)', 'R'], filas: muestras(0, ESC.rmax, 200, r => reflectanciaNewton({ R: ESC.R, lambda: lam, nLente: ESC.nLente, nHueco: ESC.nHueco, nPlaca: ESC.nPlaca }, r)).map(([r, v]) => [r * 1e3, huecoNewton(ESC.R, r) * 1e9, v]) };
    if (!SERIE) return { cols: [], filas: [] };
    const filas = []; for (let i = 0; i < SERIE.t.length; i += 20) filas.push([SERIE.t[i], SERIE.delta[i] * 1e6, SERIE.I[i], SERIE.cuenta[i]]);
    return { cols: ['t (s)', 'Δ (µm)', 'I centro', 'franjas'], filas };
  }
  function tablas() {
    const { cols, filas } = datosTabla();
    $('#t-datos').innerHTML = `<tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr>` + filas.map(f => `<tr>${f.map(v => `<td>${fmt(v, 5)}</td>`).join('')}</tr>`).join('');
  }
  function exportarCSV() {
    const { cols, filas } = datosTabla();
    if (!filas.length) { avisar('No hay datos.', false); return; }
    descargarTexto(`${nombreArchivo(ESC.titulo)}-datos.csv`, aCSV(cols, filas)).then(r => { if (r) avisarLienzo(area, `Datos exportados: ${filas.length} filas`); }, e => avisar(`No se pudo exportar: ${e}`, false));
  }
  function exportarPNG() { descargarLienzo(lienzo, `${nombreArchivo(ESC.titulo)}.png`).then(r => { if (r) avisarLienzo(area, 'Imagen del lienzo exportada'); }); }
  $('#b-exportar').addEventListener('click', exportarCSV);

  const lt = new LineaTiempo($('#tl'), { duracion: 1, eventos: [], alCambiar: nt => { t = nt; jugando = false; todo(); } });
  function todo() { dibujar(); lecturas(); graficas(); if (esMich()) lt.poner(t); if (!$('#p-tabla').hidden) tablas(); arbolDato(); }
  function arbolDato() { if (esMich()) { const n = $('#arbol .nodo[data-sel="objeto"] .dato'); if (n) n.textContent = `d = ${largo(michelsonEn(escMich(), t).d, 4)}`; } }
  function recalcular() {
    simular();
    document.body.classList.toggle('sin-tiempo', !esMich());
    for (const id of ['#transporte', '#reloj', '#velocidades']) $(id).hidden = !esMich();
    if (esMich()) {
      lt.duracion = ESC.duracion; lt.simulado = ESC.duracion; t = Math.min(t, ESC.duracion);
      // Eventos: cada franja contada (hasta 80)
      const ev = []; if (SERIE) for (let i = 1; i < SERIE.cuenta.length && ev.length < 80; i++) if (SERIE.cuenta[i] > SERIE.cuenta[i - 1]) ev.push({ t: SERIE.t[i], nombre: `Franja ${SERIE.cuenta[i]}` });
      lt.eventos = ev;
    }
    todo();
    if (autoguardar) autoguardado.guardar('optica-peliculas', escenaActual());
  }
  function cambio() { aplicarVariables(); recalcular(); registrar(); inspector(); }
  function titulo() {
    $('#escena-nombre').textContent = ESC.titulo;
    const chip = $('#escena-chip'); chip.textContent = ESC.tipo === 'MEXT' ? `MEXT ${ESC.anio || ''}`.trim() : ESC.tipo || 'Propio'; chip.className = 'chip' + (ESC.tipo === 'MEXT' ? ' lleno' : '');
    document.title = `Volta · Películas e interferómetros · ${ESC.titulo}`;
    document.querySelectorAll('.capa-btn').forEach(b => b.setAttribute('aria-pressed', String(!!ESC.capas[b.dataset.capa])));
    document.querySelectorAll('#paleta-instrumentos .herr').forEach(b => b.setAttribute('aria-pressed', String(!!ESC.capas[b.dataset.herr] && esMich())));
  }
  let relojAviso = null;
  function avisar(txt, conDeshacer = true) {
    $('#aviso-texto').textContent = txt; $('#aviso').hidden = false; $('#aviso-deshacer').hidden = !conDeshacer || !historial?.puedeDeshacer;
    clearTimeout(relojAviso); relojAviso = setTimeout(() => { $('#aviso').hidden = true; }, conDeshacer ? 5000 : 4000);
  }
  $('#aviso-deshacer').addEventListener('click', () => deshacer());
  const copia = o => JSON.parse(JSON.stringify(o));
  const instantanea = () => copia(ESC);
  function escenaActual() { return crearEscena({ modulo: 'optica', espacio: 'peliculas', titulo: ESC.titulo, datos: instantanea() }); }
  // Valida y acota lo que viene de un archivo (entrada no confiable)
  function datosSeguros(d = {}) {
    const base = completa(ESCENAS.find(e => e.clave === d.clave) || ESCENAS[0]), n = (v, def) => numero(v, def, 1, 4);
    const m = d.mich && typeof d.mich === 'object' ? d.mich : {}, l = m.lamina && typeof m.lamina === 'object' ? m.lamina : null;
    const variables = {}, RUTAS = ['lambda', 'n1', 'n2', 'n3', 'd', 'theta1', 'alfa', 'nCuna', 'nPlacas', 'R', 'nHueco', 'nLente', 'nPlaca', 'mich.v', 'mich.d0', 'mich.lamina.n', 'mich.lamina.espesor', 'mich.omega', 'duracion'];
    for (const [k, v] of Object.entries(d.variables && typeof d.variables === 'object' ? d.variables : {})) {
      if (!v || !Array.isArray(v.liga) || !/^[A-Za-z]\w{0,7}$/.test(k)) continue;
      const min = numero(v.min, 0, -1e9, 1e9), max = Math.max(min, numero(v.max, 1, -1e9, 1e9)), liga = v.liga.filter(r => RUTAS.includes(r));
      if (liga.length) variables[k] = { sim: texto(v.sim, k, 3), sub: v.sub ? texto(v.sub, '', 4) : undefined, val: numero(v.val, min, min, max), min, max, paso: numero(v.paso, 0.1, 1e-9, 1e9), u: Object.keys(FAC).includes(v.u) ? v.u : '', factor: numero(v.factor, 1, 1e-15, 1e15), liga };
    }
    const capas = {}; for (const k of Object.keys(base.capas)) capas[k] = typeof d.capas?.[k] === 'boolean' ? d.capas[k] : !!base.capas[k];
    const cuna = d.cuna && typeof d.cuna === 'object' ? { d0: numero(d.cuna.d0, 0, 0, 20e-6), d1: numero(d.cuna.d1, 1e-6, 1e-9, 20e-6) } : null;
    return {
      clave: ESCENAS.some(e => e.clave === d.clave) ? d.clave : 'propio', titulo: texto(d.titulo, base.titulo, 80), tipo: ['Tutorial', 'Ejemplo', 'MEXT', 'Propio'].includes(d.tipo) ? d.tipo : 'Propio', anio: d.anio ? texto(d.anio, '', 14) : undefined,
      modo: Object.keys(MODOS).includes(d.modo) ? d.modo : base.modo, lambda: d.lambda === null ? null : numero(d.lambda, 550e-9, 300e-9, 800e-9),
      n1: n(d.n1, 1), n2: n(d.n2, 1.33), n3: n(d.n3, 1), d: numero(d.d, 300e-9, 0, 20e-6), theta1: numero(d.theta1, 0, 0, 89 * GR), cuna,
      alfa: numero(d.alfa, 2e-4, 1e-6, 0.05), xmax: numero(d.xmax, 0.01, 1e-5, 10), nPlacas: n(d.nPlacas, 1.52), nCuna: n(d.nCuna, 1), R: numero(d.R, 1, 1e-4, 10), rmax: numero(d.rmax, 3e-3, 1e-5, 10), nLente: n(d.nLente, 1.52), nHueco: n(d.nHueco, 1), nPlaca: n(d.nPlaca, 1.52),
      mich: { d0: numero(m.d0, 0.5e-3, -0.05, 0.05), v: numero(m.v, 0, -1e-3, 1e-3), lamina: l ? { n: n(l.n, 1.5), espesor: numero(l.espesor, 1e-4, 1e-7, 0.1), giro: numero(l.giro, 0, -1.5, 1.5) } : null, omega: numero(m.omega, 0, -10, 10), giroMax: m.giroMax == null ? null : numero(m.giroMax, 0.2, 0, 1.5), f: numero(m.f, 0.2, 1e-3, 10), rmax: numero(m.rmax, 0.025, 1e-4, 1) },
      duracion: numero(d.duracion, 5, 1e-3, 600), capas, variables, sel: 'objeto',
    };
  }
  function restaurar(d) { ESC = datosSeguros(d); aplicarVariables(); titulo(); construirVariables(); inspector(); recalcular(); }
  function botonesHistorial() { $('#b-deshacer').disabled = !historial?.puedeDeshacer; $('#b-rehacer').disabled = !historial?.puedeRehacer; }
  function registrar() { if (historial && historial.registrar(instantanea())) botonesHistorial(); }
  function deshacer() { const d = historial?.deshacer(); if (d) { restaurar(d); botonesHistorial(); avisar('Cambio deshecho', false); } }
  function rehacer() { const d = historial?.rehacer(); if (d) { restaurar(d); botonesHistorial(); avisar('Cambio rehecho', false); } }
  $('#b-deshacer').addEventListener('click', deshacer); $('#b-rehacer').addEventListener('click', rehacer);
  async function abrirEscena1(clave) { if (hayCambios() && !(await confirmarCambios('cambiar de escena'))) return; ESC = completa(escenaDe(clave)); aplicarVariables(); sel = 'objeto'; t = 0; jugando = false; titulo(); construirVariables(); inspector(); recalcular(); if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); } documentoNuevo(); }
  function guardar() { guardarEscena(escenaActual()).then(r => { if (r) avisar('Escena guardada', false); }, e => avisar(`No se pudo guardar: ${e}`, false)); }
  const PAGINAS_OPTICA = { geometrica: 'optica.html', interferencia: 'optica-ondas.html', peliculas: 'optica-peliculas.html' };
  // Una escena de otro espacio de Óptica se abre en su pantalla
  function aOtroEspacio(e, propio) {
    if (!e.espacio || e.espacio === propio || !PAGINAS_OPTICA[e.espacio]) return false;
    try { sessionStorage.setItem('volta.abrir', JSON.stringify(e)); } catch { /* sin almacenamiento */ }
    location.href = PAGINAS_OPTICA[e.espacio];
    return true;
  }
  function abrir() {
    abrirEscena({ modulo: 'optica' }).then(e => {
      if (aOtroEspacio(e, 'peliculas')) return;
      t = 0; restaurar(e.datos); if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); }
      avisar(`Escena abierta: ${texto(e.titulo, 'sin título', 60)}`, false);
    }).catch(err => avisar(err.message, false));
  }
  // Cambiar de objeto: cada uno con valores de partida razonables
  function ponerModo(m) {
    if (m === ESC.modo) { sel = 'objeto'; inspector(); todo(); return; }
    const b = BASE(); ESC.modo = m; ESC.variables = {}; ESC.clave = 'propio'; ESC.tipo = 'Propio'; ESC.titulo = MODOS[m].nombre;
    if (m === 'michelson') { ESC.lambda = 632.8e-9; ESC.mich = { ...b.mich, v: 1e-6 }; ESC.duracion = 5; t = 0; }
    sel = 'objeto'; titulo(); construirVariables(); cambio(); avisar(MODOS[m].nombre);
  }

  // ---------------------------------------------------------------------
  // Paleta, capas, reproducción, lienzo y teclado
  // ---------------------------------------------------------------------
  document.querySelectorAll('#paleta-objetos .herr').forEach(b => b.addEventListener('click', () => { if (b.dataset.herr === 'fuente') { sel = 'fuente'; inspector(); todo(); } else ponerModo(b.dataset.herr); }));
  document.querySelectorAll('#paleta-instrumentos .herr').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.herr;
    if (k === 'contador' && !esMich()) { avisar('El contador de franjas es del interferómetro de Michelson', false); setTimeout(() => b.setAttribute('aria-pressed', 'false'), 0); return; }
    ESC.capas[k] = !ESC.capas[k]; titulo(); registrar(); todo();
  }));
  const alternarCapa = k => { ESC.capas[k] = !ESC.capas[k]; titulo(); registrar(); dibujar(); };
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => alternarCapa(b.dataset.capa)));
  $('#pest').addEventListener('click', () => setTimeout(todo, 0));
  function cuadro(ahora) {
    if (jugando) { t = Math.min(ESC.duracion, t + Math.min(0.05, (ahora - ultimo) / 1000) * velocidad); if (t >= ESC.duracion) jugando = false; todo(); }
    ultimo = ahora; requestAnimationFrame(cuadro);
  }
  function alternar() { if (!esMich()) return; if (t >= ESC.duracion) t = 0; jugando = !jugando; todo(); }
  const irA = nt => { jugando = false; t = Math.max(0, Math.min(ESC.duracion, nt)); todo(); };
  $('#b-play').addEventListener('click', alternar); $('#b-reiniciar').addEventListener('click', () => irA(0));
  $('#b-atras').addEventListener('click', () => irA(t - ESC.duracion / 200)); $('#b-adelante').addEventListener('click', () => irA(t + ESC.duracion / 200));
  $('#velocidades').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) velocidad = parseFloat(b.dataset.v); });
  // Lienzo: en la película en cuña, arrastrar la marca elige el grosor del esquema; la rueda cambia d
  lienzo.addEventListener('pointerdown', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top;
    if (ESC.modo === 'pelicula' && ESC.cuna && X > 0.6 * tz.w + 30 && Y > 70 && Y < tz.h - 50) { arrastre = true; moverMarca(Y); lienzo.setPointerCapture(ev.pointerId); return; }
    sel = X < 60 && ESC.modo !== 'michelson' ? 'fuente' : 'objeto'; inspector(); todo();
  });
  function moverMarca(Y) {
    const c = ESC.cuna, Hd = tz.h - 120, fr = Math.max(0, Math.min(1, (Y - 70) / Hd));
    ESC.d = c.d0 + (c.d1 - c.d0) * fr;
    for (const d of Object.values(ESC.variables)) if (d.liga.includes('d')) { d.val = Math.max(d.min, Math.min(d.max, ESC.d / d.factor)); ESC.d = d.val * d.factor; }
    construirVariables(); todo();
  }
  lienzo.addEventListener('pointermove', ev => {
    const r = lienzo.getBoundingClientRect(), Y = ev.clientY - r.top;
    if (arrastre) { moverMarca(Y); return; }
    if (ESC.modo === 'pelicula' && ESC.cuna) {
      const fr = (Y - 70) / (tz.h - 120); if (fr >= 0 && fr <= 1) { const d = ESC.cuna.d0 + (ESC.cuna.d1 - ESC.cuna.d0) * fr; $('#c1').textContent = largo(d, 4); $('#c2').textContent = fmt(R(d), 3); }
    } else { $('#c1').textContent = largo(ESC.d, 4); $('#c2').textContent = fmt(R(ESC.d), 3); }
  });
  lienzo.addEventListener('pointerup', () => { if (arrastre) { arrastre = null; cambio(); } });
  const ICONO_TIPO = { Tutorial: 'i-tutorial', Ejemplo: 'i-ejemplo', MEXT: 'i-mext' };
  function menuEscenas() {
    const m = $('#menu-escenas'); if (!m.hidden) { m.hidden = true; return; }
    m.innerHTML = [['Tutorial', 'Tutoriales'], ['Ejemplo', 'Ejemplos'], ['MEXT', 'MEXT']].map(([g, tit], i) => (i ? '<div class="menu-sep"></div>' : '') + `<div class="menu-titulo">${tit}</div>` + ESCENAS.filter(e => e.tipo === g).map(e =>
      `<div class="menu-item" role="menuitem" data-clave="${e.clave}"${ESC.clave === e.clave ? ' aria-current="true"' : ''}><svg class="ico"><use href="#${ICONO_TIPO[g]}"/></svg>${e.titulo}${e.anio ? `<span class="chip lleno">${e.anio}</span>` : ''}</div>`).join('')).join('');
    const r = $('#b-escenas').getBoundingClientRect(); m.style.left = r.left + 'px'; m.style.top = (r.bottom + 4) + 'px'; m.hidden = false;
  }
  $('#b-escenas').addEventListener('click', ev => { ev.stopPropagation(); menuEscenas(); });
  $('#menu-escenas').addEventListener('click', ev => { const it = ev.target.closest('.menu-item'); if (!it) return; $('#menu-escenas').hidden = true; abrirEscena1(it.dataset.clave); });
  document.addEventListener('pointerdown', ev => { if (!ev.target.closest('#menu-escenas, #b-escenas')) $('#menu-escenas').hidden = true; });
  const COMANDOS = [
    ['i-reproducir', 'Reproducir o pausar (Michelson)', 'Espacio', alternar], ['i-reiniciar', 'Reiniciar', 'Inicio', () => irA(0)],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['o-pelicula', 'Película delgada', '', () => ponerModo('pelicula')], ['o-capas', 'Cuña de aire', '', () => ponerModo('cuna')],
    ['o-anillos-newton', 'Anillos de Newton', '', () => ponerModo('newton')], ['o-michelson', 'Interferómetro de Michelson', '', () => ponerModo('michelson')],
    ['i-capas', 'Mostrar u ocultar los rayos', '', () => alternarCapa('rayos')], ['i-capas', 'Mostrar u ocultar los cambios de fase', '', () => alternarCapa('fases')],
    ['i-historial', 'Restablecer la escena original', '', () => { if (ESCENAS.some(e => e.clave === ESC.clave)) { abrirEscena1(ESC.clave); avisar('Escena original restablecida', false); } }],
    ['i-deshacer', 'Deshacer', 'Ctrl Z', deshacer], ['i-rehacer', 'Rehacer', 'Ctrl Y', rehacer],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar], ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
    ['i-exportar', 'Exportar datos a CSV', '', exportarCSV], ['i-imagen', 'Exportar imagen del lienzo', '', exportarPNG],
    ...ESCENAS.map(e => [ICONO_TIPO[e.tipo], `Abrir escena: ${e.titulo}`, e.tipo === 'MEXT' ? `MEXT ${e.anio}` : e.tipo, () => abrirEscena1(e.clave), 'Escenas']),
  ];
  let selCmd = 0;
  function pintarComandos() {
    const q = $('#cmd-q').value.trim().toLowerCase(), lista = COMANDOS.filter(c => c[1].toLowerCase().includes(q));
    selCmd = Math.min(selCmd, Math.max(0, lista.length - 1)); let grupo = null, html = '';
    lista.forEach((c, i) => { const g = c[4] || 'Acciones'; if (g !== grupo) { html += `<div class="menu-titulo">${g}</div>`; grupo = g; } html += `<div class="menu-item${i === selCmd ? ' activo' : ''}" data-i="${COMANDOS.indexOf(c)}"><svg class="ico"><use href="#${c[0]}"/></svg>${c[1]}<span class="atajo">${c[2]}</span></div>`; });
    $('#cmd-lista').innerHTML = html; return lista;
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
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) alternar(); }
    else if (ev.key === 'ArrowRight' && esMich()) irA(t + ESC.duracion / 200);
    else if (ev.key === 'ArrowLeft' && esMich()) irA(t - ESC.duracion / 200);
    else if (ev.key === 'Home') irA(0);
    else if (ev.key === 'Escape') $('#menu-escenas').hidden = true;
  });

  // ---------------------------------------------------------------------
  // Arranque. Parámetros: ?escena=newton&t=2.5&sel=fuente
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search), limpio = ![...q.keys()].length, pend = escenaPendiente('optica');
    const previa = (pend && pend.espacio === 'peliculas' ? pend : null) || (limpio ? autoguardado.leer('optica-peliculas', { modulo: 'optica' }) : null);
    tz.ajustar(); tz.vista.escala = 1; tz.vista.ox = 0; tz.vista.oy = 0;
    ESC = q.has('escena') || !previa ? completa(escenaDe(q.get('escena') || 'jabon')) : datosSeguros(previa.datos);
    aplicarVariables();
    if (q.get('sel') === 'fuente') sel = 'fuente';
    autoguardar = true;
    registrarDocumento({ clave: 'optica-peliculas', escena: escenaActual, origen: (!q.has('escena') && previa) || null, abrir, guardar });
    titulo(); construirVariables(); inspector(); recalcular();
    if (q.has('t')) t = Math.max(0, Math.min(ESC.duracion, parseFloat(q.get('t')) || 0));
    const pe = q.get('pest'); if (pe) { const b = document.querySelector(`#pest [aria-controls="p-${pe}"]`); if (b) b.click(); }
    todo();
    historial = new Historial(instantanea()); botonesHistorial();
    requestAnimationFrame(a => { ultimo = a; requestAnimationFrame(cuadro); });
  });
})();
