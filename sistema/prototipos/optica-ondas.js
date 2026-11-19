/* ==========================================================================
   Volta · Óptica — espacio de trabajo "Interferencia y difracción"
   Young, rendija simple, N rendijas y redes de difracción, con luz
   monocromática o blanca y un medio de índice n entre las rendijas y la
   pantalla. La física está en el motor puro sistema/motores/optica.js
   (probado en pruebas/optica.test.js): suma de fasores de Huygens–Fresnel
   con las distancias exactas (cerca y lejos) o la forma cerrada de
   Fraunhofer (campo lejano, redes de muchas líneas).
   El lienzo es un esquema: la fuente con sus frentes planos, la barrera
   con las rendijas ampliadas (su escala es propia), la distancia L
   acotada (no está a escala) y la pantalla con su patrón real en la escala
   de y que se elija; junto a ella, la curva I(y). El punto P muestra los
   dos caminos, su diferencia Δ = n(r₂ − r₁) y el diagrama de fasores.
   No hay evolución temporal.
   Parámetros de URL para capturas: ?escena=…&tema=…&sel=fuente|rendijas
   |medio|pantalla|punto|regla&pest=ordenes|tabla
   ========================================================================== */
import {
  patronRendijas, fasoresEn, rendijasRegulares, maximosRed, minimosRendija, interfranja, diferenciaCaminos, extremos,
  muestrasVisible, colorEspectro, colorLongitudOnda, cie1931, subdivisionRendija,
} from '../motores/optica.js';
import { aCSV } from '../nucleo/csv.js';
import { descargarTexto, descargarLienzo, nombreArchivo, avisar as avisarLienzo } from '../componentes/exportar.js';
import { crearEscena, numero, texto } from '../nucleo/escena.js';
import { Historial } from '../nucleo/historial.js';
import { evaluar } from '../nucleo/unidades.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';

(function () {
  'use strict';
  const { Trazo, fmt, cantidad, grafica } = Volta;
  const $ = s => document.querySelector(s);
  const FAC = { m: 1, cm: 1e-2, mm: 1e-3, 'µm': 1e-6, nm: 1e-9, '': 1, '1/mm': 1 };
  const numCampo = x => String(Number(Number(x).toPrecision(6))).replace('-', '−');
  const simHTML = (a, sub, recto = true) => `<span class="sim">${a}${sub ? `<sub${recto ? ' class="r"' : ''}>${sub}</sub>` : ''}</span>`;
  // Longitud en la unidad que le corresponde
  function largo(v, cifras = 4) {
    const a = Math.abs(v);
    const [f, u] = a >= 0.5 ? [1, 'm'] : a >= 0.01 ? [1e-2, 'cm'] : a >= 1e-4 || a === 0 ? [1e-3, 'mm'] : a >= 1e-7 ? [1e-6, 'µm'] : [1e-9, 'nm'];
    return cantidad(v / f, u, cifras);
  }
  const TIPOS = { simple: 'Rendija simple', doble: 'Doble rendija', n: 'N rendijas', red: 'Red de difracción' };
  const ICONOS = { simple: 'o-rendija', doble: 'o-rendija-doble', n: 'o-arreglo-fuentes', red: 'o-red-difraccion' };

  // ---------------------------------------------------------------------
  // Escenas. Variables: valor en su unidad, valor físico = val·factor.
  // ---------------------------------------------------------------------
  const vari = (sim, val, min, max, paso, u, factor, liga, sub) => ({ sim, sub, val, min, max, paso, u, factor, liga });
  const BASE = () => ({
    lambda: 600e-9, rendija: 'doble', N: 2, d: 0.25e-3, a: 0.04e-3, lineas: 500, L: 1, n: 1, alto: 0.012, P: null, regla: null,
    metodo: 'huygens', graficas: ['intensidad', 'fasores', 'seno'], capas: { frentes: true, curva: true, ordenes: true, valores: true }, variables: {}, sel: 'rendijas',
  });
  const ESCENAS = [
    {
      clave: 'young', titulo: 'Doble rendija de Young', tipo: 'Tutorial', lambda: 600e-9, tipo2: 'doble', d: 0.25e-3, a: 0.04e-3, L: 1, alto: 0.012, P: 0.0048, regla: [0.0024, 0.0048],
      variables: { l: vari('λ', 600, 380, 750, 5, 'nm', 1e-9, ['lambda']), d: vari('d', 0.25, 0.05, 1, 0.01, 'mm', 1e-3, ['d']), L: vari('L', 1, 0.2, 3, 0.05, 'm', 1, ['L']) },
    },
    {
      clave: 'rendija-simple', titulo: 'Difracción por una rendija', tipo: 'Ejemplo', lambda: 550e-9, tipo2: 'simple', N: 1, a: 50e-6, L: 2, alto: 0.08, P: 0.022,
      variables: { a: vari('a', 50, 10, 200, 1, 'µm', 1e-6, ['a']), l: vari('λ', 550, 380, 750, 5, 'nm', 1e-9, ['lambda']) },
    },
    {
      clave: 'n-rendijas', titulo: 'Cinco rendijas: máximos principales y secundarios', tipo: 'Ejemplo', lambda: 532e-9, tipo2: 'n', N: 5, d: 0.1e-3, a: 0.02e-3, L: 1, alto: 0.012, P: 0.00532,
      variables: { N: vari('N', 5, 2, 12, 1, '', 1, ['N']), d: vari('d', 0.1, 0.04, 0.4, 0.01, 'mm', 1e-3, ['d']) },
    },
    {
      clave: 'red-blanca', titulo: 'Red de difracción con luz blanca', tipo: 'Ejemplo', lambda: null, tipo2: 'red', N: 60, lineas: 500, a: 0.6e-6, L: 0.5, alto: 0.3, metodo: 'fraunhofer', P: 0.15,
      variables: { k: vari('k', 500, 100, 1200, 10, '1/mm', 1e3, ['lineas'], ''), L: vari('L', 0.5, 0.1, 1.5, 0.05, 'm', 1, ['L']) },
    },
    {
      clave: 'young-agua', titulo: 'Young con agua entre las rendijas y la pantalla', tipo: 'Ejemplo', lambda: 600e-9, tipo2: 'doble', d: 0.25e-3, a: 0.04e-3, L: 1, n: 1.333, alto: 0.012, P: 0.0036, regla: [0, 0.0036],
      variables: { n: vari('n', 1.333, 1, 2, 0.001, '', 1, ['n']) },
    },
    // ----------------------------------------------------------------- MEXT
    {
      clave: 'mext-2023-5', titulo: 'Doble rendija en el vacío y en un medio', tipo: 'MEXT', anio: '2023 P5', lambda: 500e-9, tipo2: 'doble', d: 1.0e-4, a: 1e-5, L: 2.4, n: 1.2, alto: 0.03, P: 0.01, regla: [0, 0.01],
      variables: { n: vari('n', 1.2, 1, 2, 0.01, '', 1, ['n']), l: vari('λ', 500, 380, 750, 5, 'nm', 1e-9, ['lambda']) },
    },
    {
      clave: 'mext-2018-1-4', titulo: 'Tercera franja oscura de Young', tipo: 'MEXT', anio: '2018 1-(4)', lambda: 600e-9, tipo2: 'doble', d: 0.3e-3, a: 0.03e-3, L: 1.5, alto: 0.01, P: 0.0075, regla: [0, 0.0075],
      variables: { d: vari('d', 0.3, 0.1, 1, 0.01, 'mm', 1e-3, ['d']), L: vari('L', 1.5, 0.5, 3, 0.05, 'm', 1, ['L']) },
    },
    {
      clave: 'mext-2027-5', titulo: 'Dos rendijas: caminos AP y BP', tipo: 'MEXT', anio: '2027 P5', lambda: 600e-9, tipo2: 'doble', d: 0.5e-3, a: 0, L: 1, alto: 0.005, P: 0.0024,
      variables: { yP: vari('y', 2.4, -5, 5, 0.01, 'mm', 1e-3, ['P'], 'P') },
    },
    {
      clave: 'mext-2010-3-c', titulo: 'Luz blanca y red de difracción', tipo: 'MEXT', anio: '2010 3-C', lambda: null, tipo2: 'red', N: 60, lineas: 300, a: 1e-6, L: 0.6, alto: 0.2, metodo: 'fraunhofer', P: null,
      variables: { k: vari('k', 300, 100, 1000, 10, '1/mm', 1e3, ['lineas'], '') },
    },
  ];
  const completa = e => {
    const b = BASE(), o = JSON.parse(JSON.stringify({ ...b, ...e, capas: { ...b.capas, ...(e.capas || {}) } }));
    if (e.tipo2) { o.tipo = e.tipo; o.rendija = e.tipo2; delete o.tipo2; } else o.rendija = o.rendija || 'doble';
    if (o.rendija === 'simple') o.N = 1; if (o.rendija === 'doble') o.N = 2;
    if (e.lambda === null) o.lambda = null;
    return o;
  };
  const escenaDe = clave => ESCENAS.find(e => e.clave === clave) || ESCENAS[0];

  // ---------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------
  /** @type {any} */ let ESC = completa(ESCENAS[0]);
  let sel = 'rendijas', herramienta = null, arrastre = null, hover = null;
  let autoguardar = false, historial = null, ERROR = null;
  /** @type {any} */ let R = null;   // resultado: patrón en la pantalla
  const lienzo = $('#lienzo'), area = $('#area'), tz = new Trazo(lienzo);
  const blanca = () => ESC.lambda == null;
  const dEf = () => (ESC.rendija === 'red' ? 1e-3 / ESC.lineas : ESC.d);
  const nRend = () => (ESC.rendija === 'simple' ? 1 : ESC.rendija === 'doble' ? 2 : Math.max(2, Math.round(ESC.N)));
  const rendijas = () => rendijasRegulares({ N: nRend(), d: dEf(), a: ESC.a });
  const lambdaRef = () => (blanca() ? 550e-9 : ESC.lambda);
  const LAMBDAS = muestrasVisible(24);

  // ---------------------------------------------------------------------
  // Cálculo del patrón (una o varias longitudes de onda)
  // ---------------------------------------------------------------------
  function calcular(filas) {
    const p0 = { L: ESC.L, n: ESC.n, rendijas: rendijas() }, y0 = -ESC.alto, y1 = ESC.alto;
    if (nRend() > 1 && !(dEf() > ESC.a)) throw new Error('Las rendijas se tocan: la separación d debe ser mayor que el ancho a.');
    const clave = JSON.stringify([ESC.lambda, ESC.rendija, nRend(), dEf(), ESC.a, ESC.L, ESC.n, ESC.alto, ESC.metodo, filas]);
    if (R && R.clave === clave) return;
    const metodo = ESC.metodo === 'fraunhofer' ? 'fraunhofer' : 'auto';
    const lambdas = blanca() ? LAMBDAS : [ESC.lambda];
    // Cada fila de la pantalla promedia k muestras (lo que mide un detector del tamaño de un píxel)
    const k = metodo === 'fraunhofer' || nRend() > 20 ? 8 : 3, dy = (y1 - y0) / filas;
    const pats = lambdas.map(l => {
      const fino = patronRendijas({ ...p0, lambda: l }, { y0: y0 + dy / (2 * k), y1: y1 - dy / (2 * k), puntos: filas * k, metodo });
      const I = new Float64Array(filas);
      for (let i = 0; i < filas; i++) { let s = 0; for (let j = 0; j < k; j++) s += fino.I[i * k + j]; I[i] = s / k; }
      let Imax = 0; for (let i = 0; i < filas; i++) Imax = Math.max(Imax, I[i]);
      return { I, Imax, metodo: fino.metodo, sub: fino.sub };
    });
    const y = Float64Array.from({ length: filas }, (_, i) => y0 + dy * (i + 0.5)), I = new Float64Array(filas), color = [];
    if (!blanca()) {
      const c = colorLongitudOnda(ESC.lambda).lineal, max = pats[0].Imax || 1;
      for (let i = 0; i < filas; i++) { I[i] = pats[0].I[i] / max; color.push(c.map(x => x * I[i])); }
    } else {
      // Luminancia relativa (ȳ) para la curva; color con el equilibrio de blanco del espectro plano
      const ybar = lambdas.map(l => cie1931(l)[1]);
      let maxC = 0, maxY = 0;
      const crudo = [];
      for (let i = 0; i < filas; i++) {
        const pesos = pats.map(p => p.I[i]), c = colorEspectro(lambdas, pesos);
        crudo.push(c); maxC = Math.max(maxC, ...c);
        I[i] = pesos.reduce((s, w, k) => s + w * ybar[k], 0); maxY = Math.max(maxY, I[i]);
      }
      for (let i = 0; i < filas; i++) { I[i] /= maxY || 1; color.push(crudo[i].map(x => x / (maxC || 1))); }
    }
    R = { clave, y, I, color, metodo: pats[0].metodo, sub: pats[0].sub, pats, lambdas };
  }
  function simular() {
    try { calcular(Math.max(120, Math.min(900, Math.round(2 * altoPx())))); ERROR = null; }
    catch (e) { ERROR = e.message; R = null; }
  }

  // ---------------------------------------------------------------------
  // Esquema en el lienzo
  // ---------------------------------------------------------------------
  const M = () => ({ arriba: 64, abajo: 64 });
  const altoPx = () => Math.max(60, (tz.h - M().arriba - M().abajo) / 2 - 6);
  const yc = () => (M().arriba + tz.h - M().abajo) / 2;
  const Xb = () => Math.round(0.27 * tz.w), Xs = () => Math.round(0.62 * tz.w), anchoFranja = 26;
  const Ys = y => yc() - y / ESC.alto * altoPx();
  const yDe = Y => (yc() - Y) / altoPx() * ESC.alto;
  // Escala propia de la barrera (las rendijas, ampliadas)
  function escalaBarrera() {
    const N = nRend(), span = N === 1 ? ESC.a : (N - 1) * dEf() + ESC.a;
    return Math.min(0.42 * altoPx() / (span / 2 || 1e-9), 1e12);
  }
  const yRend = y => yc() - y * escalaBarrera();

  function dibujar() {
    const c = tz.ctx;
    tz.limpiar(); tz.opticaEtiquetas([...tz.zonasFlotantes()]);
    if (!R) { tz.texto(ERROR || 'Sin cálculo', tz.w / 2, tz.h / 2, { fuente: 'ui', tam: 13, color: 'error', alinear: 'center', halo: true }); return; }
    const xb = Xb(), xs = Xs(), Yc = yc(), H = altoPx(), N = nRend(), lam = lambdaRef(), col = tz.opticaColor(blanca() ? null : ESC.lambda);
    // Eje óptico
    tz.lineaPx([[40, Yc], [xs + anchoFranja + 10, Yc]], { color: 'texto-3', grosor: 1, patron: 'eje', extremo: 'butt' });
    // 4 · Medio entre la barrera y la pantalla
    if (ESC.n !== 1) {
      c.save(); c.globalAlpha = Math.max(0.03, Math.min(0.1, 0.05 + 0.04 * (ESC.n - 1.5))); c.fillStyle = tz.t.tinta; c.fillRect(xb + 4, Yc - H - 6, xs - xb - 4, 2 * H + 12); c.restore();
      tz.lineaPx([[xb + 4, Yc - H - 6], [xs, Yc - H - 6]], { color: 'texto-3', grosor: 1, extremo: 'butt' });
      tz.lineaPx([[xb + 4, Yc + H + 6], [xs, Yc + H + 6]], { color: 'texto-3', grosor: 1, extremo: 'butt' });
      const segs = [{ t: 'n', f: 'sim', tam: 13 }, { t: ' = ' + fmt(ESC.n, 4), f: 'num', tam: 11.5, color: 'texto-2' }];
      if (tz.opticaReservar(segs, xb + 16, Yc + H - 4)) tz.compuesto(segs, xb + 16, Yc + H - 4, {});
    }
    // Fuente y frentes planos (esquema: un frente cada 14 px)
    tz.opticaFuente([tz.vista.mx(56), tz.vista.my(Yc)]);
    if (ESC.capas.frentes) tz.opticaFrentesPlanos(76, xb - 10, Yc - 0.55 * H, Yc + 0.55 * H, 14);
    tz.compuesto(blanca() ? [{ t: 'luz blanca', f: 'ui', tam: 11, color: 'texto-3' }] : [{ t: 'λ', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(ESC.lambda * 1e9, 'nm', 3), f: 'num', tam: 11.5, color: 'texto-2' }], 46, Yc - 0.55 * H - 12, {});
    // Frentes que salen de las rendijas (esquema)
    if (ESC.capas.frentes && N <= 3) {
      c.save(); c.beginPath(); c.rect(xb + 4, Yc - H, xs - xb - 8, 2 * H); c.clip();
      c.globalAlpha = 0.18; c.strokeStyle = tz.t.tinta; c.lineWidth = 1;
      for (const r of rendijas()) { const yr = yRend(r.y); for (let R0 = 14; R0 < 0.45 * (xs - xb); R0 += 14) { c.beginPath(); c.arc(xb, yr, R0, -Math.PI / 2, Math.PI / 2); c.stroke(); } }
      c.restore();
    }
    // Barrera con las rendijas
    dibujarBarrera();
    // Caminos al punto P
    if (ESC.P != null) dibujarCaminos(col);
    // Pantalla: franjas con su color real
    const filas = R.color.length, colores = [];
    for (let i = filas - 1; i >= 0; i--) colores.push(tz.opticaLuz(R.color[i]));
    tz.opticaFranjasVerticales(xs, Yc - H, Yc + H, anchoFranja, colores);
    tz.lineaPx([[xs, Yc - H - 10], [xs, Yc + H + 10]], { color: 'tinta', grosor: Volta.G.materia + (hover === 'pantalla' ? 0.5 : 0), extremo: 'butt' });
    ejeY(xs - 8);
    // Curva I(y) a la derecha de la pantalla
    if (ESC.capas.curva) dibujarCurva(col);
    if (ESC.capas.ordenes) dibujarOrdenes();
    // Cota de L (esquema)
    const Ycota = Yc + H + 30;
    tz.flechaPx(xb, Ycota, xs, Ycota, { color: 'texto-2', grosor: 1, punta: 'abierta', ambas: true });
    tz.compuesto([{ t: 'L', f: 'sim', tam: 14 }, { t: ' = ' + largo(ESC.L, 3), f: 'num', tam: 11.5, color: 'texto-2' }, { t: '  (no está a escala)', f: 'ui', tam: 11, color: 'texto-3' }], (xb + xs) / 2, Ycota - 6, { alinear: 'center' });
    dibujarRegla();
    dibujarSeleccion();
  }
  function dibujarBarrera() {
    const xb = Xb(), Yc = yc(), H = altoPx(), N = nRend(), sb = escalaBarrera(), c = tz.ctx;
    if (N > 14) {
      // Red: muchas líneas (como el icono): barrera discontinua
      c.save(); c.strokeStyle = tz.t.tinta; c.lineWidth = 2 + (hover === 'rendijas' ? 0.5 : 0); c.setLineDash([2, 2]); c.beginPath(); c.moveTo(xb, Yc - 0.6 * H); c.lineTo(xb, Yc + 0.6 * H); c.stroke(); c.restore();
      tz.lineaPx([[xb - 3, Yc - 0.6 * H], [xb + 3, Yc - 0.6 * H]], { grosor: 1.5 }); tz.lineaPx([[xb - 3, Yc + 0.6 * H], [xb + 3, Yc + 0.6 * H]], { grosor: 1.5 });
      if (ESC.capas.valores) tz.compuesto([{ t: fmt(ESC.lineas, 4) + ' líneas/mm', f: 'num', tam: 11.5, color: 'texto-2' }], xb - 10, Yc - 0.6 * H - 10, { alinear: 'center' });
      if (ESC.capas.valores) tz.compuesto([{ t: 'd', f: 'sim', tam: 13 }, { t: ' = ' + largo(dEf(), 3), f: 'num', tam: 11.5, color: 'texto-2' }], xb - 10, Yc + 0.6 * H + 20, { alinear: 'center' });
      return;
    }
    const ab = rendijas().map(r => [yRend(r.y) - Math.max(1.5, r.a * sb / 2), yRend(r.y) + Math.max(1.5, r.a * sb / 2)]);
    tz.opticaBarrera(xb, Yc - 0.75 * H, Yc + 0.75 * H, ab, { grueso: hover === 'rendijas' });
    if (!ESC.capas.valores) return;
    // Cotas de d (entre las dos primeras) y de a (la primera), a la izquierda
    const rs = rendijas(), y1 = yRend(rs[0].y), x = xb - 16;
    if (N >= 2) {
      const y2 = yRend(rs[1].y);
      tz.flechaPx(x, y1, x, y2, { color: 'texto-2', grosor: 1, punta: 'abierta', ambas: true });
      tz.compuesto([{ t: 'd', f: 'sim', tam: 13 }, { t: ' = ' + largo(dEf(), 3), f: 'num', tam: 11.5, color: 'texto-2' }], x - 6, (y1 + y2) / 2 + 4, { alinear: 'right' });
    }
    if (ESC.a > 0) {
      const ya = yRend(rs[rs.length - 1].y), h = Math.max(3, ESC.a * sb);
      tz.compuesto([{ t: 'a', f: 'sim', tam: 13 }, { t: ' = ' + largo(ESC.a, 3), f: 'num', tam: 11.5, color: 'texto-2' }], xb + 10, ya - h / 2 - 8, {});
    }
    tz.compuesto([{ t: TIPOS[ESC.rendija].toLowerCase() + (ESC.rendija === 'n' ? ` (N = ${N})` : ''), f: 'ui', tam: 11, color: 'texto-3' }], xb, Yc + 0.75 * H + 18, { alinear: 'center' });
  }
  function dibujarCaminos(col) {
    const xb = Xb(), xs = Xs(), Yp = Ys(ESC.P), rs = rendijas(), N = rs.length, c = tz.ctx;
    // Con muchas rendijas, solo las dos centrales
    const usar = N <= 3 ? rs : [rs[Math.floor(N / 2) - 1], rs[Math.floor(N / 2)]];
    c.save(); c.globalAlpha = 0.9;
    usar.forEach((r, k) => {
      const yr = yRend(r.y);
      tz.lineaPx([[xb, yr], [xs, Yp]], { color: blanca() ? 'tinta' : col, grosor: 1.25 });
      if (ESC.capas.valores && usar.length <= 3) {
        const t = 0.32, lx = xb + (xs - xb) * t, ly = yr + (Yp - yr) * t + (k ? 14 : -6);
        const segs = [{ t: 'r', f: 'sim', tam: 13 }, { t: String(k + 1), f: 'simRecta', tam: 9, dy: 3 }];
        if (tz.opticaReservar(segs, lx, ly)) tz.compuesto(segs, lx, ly, { color: 'texto-2' });
      }
    });
    c.restore();
    // P en la pantalla y su ficha con Δ
    const cx = c; cx.save(); cx.fillStyle = tz.t.lienzo; cx.strokeStyle = tz.t.tinta; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(xs, Yp, 5, 0, 2 * Math.PI); cx.fill(); cx.stroke(); cx.restore();
    const dc = diferenciaCaminos({ y1: usar[0].y, y2: usar[1] ? usar[1].y : usar[0].y, L: ESC.L, Y: ESC.P, n: ESC.n });
    const lam = lambdaRef();
    const filas = [[{ t: 'P', f: 'sim', tam: 13 }, { t: '  y = ' + largo(ESC.P, 4), f: 'num', tam: 11.5 }]];
    if (usar.length >= 2) filas.push([{ t: 'Δ', f: 'simRecta', tam: 13 }, { t: ' = ' + largo(Math.abs(dc.delta), 4), f: 'num', tam: 11.5 }], [{ t: 'Δ/λ', f: 'sim', tam: 13 }, { t: ' = ' + fmt(Math.abs(dc.delta) / lam, 4), f: 'num', tam: 11.5 }]);
    const fx = xs - 150;
    tz.ficha(fx, Yp - 66, filas, { ancla: [xs - 5, Yp] });
  }
  // Marcas de y junto a la pantalla, en la unidad que pida el alto
  function ejeY(x) {
    const H = altoPx(), [f, u] = ESC.alto >= 0.05 ? [1e-2, 'cm'] : [1e-3, 'mm'], paso = Volta.pasoAgradable(ESC.alto / f / 4);
    for (let v = -Math.floor(ESC.alto / f / paso) * paso; v <= ESC.alto / f + 1e-9; v += paso) {
      const Y = Ys(v * f); if (Y < yc() - H - 1 || Y > yc() + H + 1) continue;
      tz.lineaPx([[x + 3, Y], [x + 8, Y]], { color: 'eje', grosor: 1, extremo: 'butt' });
      tz.texto(Volta.fmtMarca(v, paso), x, Y, { fuente: 'num', tam: 11, color: 'texto-3', alinear: 'right', base: 'middle', halo: true });
    }
    tz.compuesto([{ t: 'y', f: 'sim', tam: 14 }, { t: ` (${u})`, f: 'ui', tam: 11 }], x + 8, yc() - H - 14, { color: 'texto-3', alinear: 'right' });
  }
  function dibujarCurva(col) {
    const x0 = Xs() + anchoFranja + 22, W = Math.max(60, Math.min(260, tz.w - x0 - 30)), H = altoPx(), Yc = yc(), n = R.I.length, pts = [];
    tz.lineaPx([[x0, Yc - H], [x0, Yc + H]], { color: 'eje', grosor: 1, extremo: 'butt' });
    for (let i = 0; i < n; i++) pts.push([x0 + W * R.I[i], Ys(R.y[i])]);
    tz.lineaPx(pts, { color: blanca() ? 'tinta' : col, grosor: 1.5 });
    tz.compuesto([{ t: 'I', f: 'sim', tam: 14 }, { t: '/', f: 'ui', tam: 11 }, { t: 'I', f: 'sim', tam: 14 }, { t: 'máx', f: 'simRecta', tam: 9, dy: 3 }], x0 + W, Yc - H - 14, { color: 'texto-3', alinear: 'right' });
    tz.texto('1', x0 + W, Yc + H + 14, { fuente: 'num', tam: 11, color: 'texto-3', alinear: 'center' });
    tz.texto('0', x0, Yc + H + 14, { fuente: 'num', tam: 11, color: 'texto-3', alinear: 'center' });
  }
  // Órdenes m: máximos principales (N ≥ 2) o mínimos (rendija simple)
  function ordenes() {
    const lam = lambdaRef(), L = ESC.L, N = nRend();
    const lista = N >= 2 ? maximosRed(lam, dEf(), ESC.n) : minimosRendija(lam, ESC.a || 1e-12, ESC.n);
    return lista.map(o => ({ ...o, y: L * Math.tan(o.theta) })).filter(o => Math.abs(o.y) <= ESC.alto);
  }
  function dibujarOrdenes() {
    const x = Xs() + anchoFranja + 4, N = nRend();
    let previo = -Infinity;
    for (const o of ordenes().sort((a, b) => Ys(a.y) - Ys(b.y))) {
      const Y = Ys(o.y); if (Y - previo < 13) continue; previo = Y;
      tz.lineaPx([[x - 4, Y], [x, Y]], { color: 'texto-2', grosor: 1, extremo: 'butt' });
      tz.texto(String(o.m).replace('-', '−'), x + 3, Y, { fuente: 'num', tam: 10.5, color: 'texto-3', base: 'middle', halo: true });
    }
    void N;
  }
  function dibujarRegla() {
    if (!ESC.regla) return;
    const x = Xs() + anchoFranja + 10, [a, b] = ESC.regla, Ya = Ys(a), Yb = Ys(b);
    tz.lineaPx([[Xs(), Ya], [x + 6, Ya]], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
    tz.lineaPx([[Xs(), Yb], [x + 6, Yb]], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
    if (Math.abs(Yb - Ya) > 4) tz.flechaPx(x, Ya, x, Yb, { color: 'texto-2', grosor: 1, punta: 'abierta', ambas: true });
    tz.asa(x, Ya); tz.asa(x, Yb);
    const d = Math.abs(b - a), fr = nRend() >= 2 ? interfranja(lambdaRef(), ESC.L, dEf(), ESC.n) : null;
    const filas = [[{ t: 'Δ', f: 'simRecta', tam: 13 }, { t: 'y', f: 'sim', tam: 13 }, { t: ' = ' + largo(d, 4), f: 'num', tam: 11.5 }]];
    if (fr) filas.push([{ t: 'λL/(nd)', f: 'sim', tam: 12 }, { t: ' = ' + largo(fr, 4), f: 'num', tam: 11.5 }]);
    tz.ficha(x + 14, (Ya + Yb) / 2 - 16, filas, {});
    if (sel === 'regla') tz.seleccionCaja(x - 6, Math.min(Ya, Yb), 12, Math.abs(Yb - Ya));
  }
  function dibujarSeleccion() {
    const xb = Xb(), xs = Xs(), Yc = yc(), H = altoPx();
    if (sel === 'rendijas') tz.seleccionCaja(xb - 8, Yc - 0.75 * H, 16, 1.5 * H);
    else if (sel === 'pantalla') tz.seleccionCaja(xs, Yc - H, anchoFranja, 2 * H);
    else if (sel === 'fuente') tz.seleccionCirculo(56, Yc, 11);
    else if (sel === 'medio') tz.seleccionRegion(xb + 4, Yc - H - 6, xs - xb - 4, 2 * H + 12, { dentroX: true });
    else if (sel === 'punto' && ESC.P != null) tz.seleccionCirculo(xs, Ys(ESC.P), 10);
  }

  // ---------------------------------------------------------------------
  // Inspector, árbol, lecturas y variables
  // ---------------------------------------------------------------------
  const fila = (etq, control, ayuda = '') => `<div class="fila"${ayuda ? ` data-ayuda="${ayuda}"` : ''}><span class="etq">${etq}</span>${control}</div>`;
  const segmentado = (id, ops, actual) => `<div class="segmentado texto" id="${id}">${ops.map(([v, txt]) => `<button data-v="${v}" aria-pressed="${String(v) === String(actual)}">${txt}</button>`).join('')}</div>`;
  const ligadaA = ruta => Object.entries(ESC.variables).find(([, d]) => d.liga.includes(ruta));
  function campo(etq, ruta, dim, u, ayuda = '') {
    const lig = ligadaA(ruta);
    if (lig) {
      const [nv, d] = lig;
      return fila(etq, `<div class="campo es-variable" data-ayuda="Ligado a la variable ${d.sim}|Bound to variable"><span class="chip-var">${simHTML(d.sim, d.sub)}</span><span class="valor-var" data-var="${nv}"></span><span class="u">${d.u}</span></div>`, ayuda);
    }
    const val = ESC[ruta];
    return fila(etq, `<div class="campo"><input data-ruta="${ruta}" data-dim="${dim}" data-u="${u}" value="${val == null ? '' : numCampo(val / (FAC[u] ?? 1))}"><span class="u">${u}</span></div>`, ayuda);
  }
  const uLargo = v => (Math.abs(v) >= 0.5 ? 'm' : Math.abs(v) >= 0.01 ? 'cm' : Math.abs(v) >= 1e-4 ? 'mm' : 'µm');
  function inspector() {
    const props = $('#propiedades');
    let h = '', ico = ICONOS[ESC.rendija], nombre = TIPOS[ESC.rendija], titulo = 'Propiedades';
    if (sel === 'fuente') {
      ico = 'o-fuente-luz'; nombre = 'Fuente'; titulo = 'Luz';
      h = fila('Luz', segmentado('p-luz', [['mono', 'Monocromática'], ['blanca', 'Blanca']], blanca() ? 'blanca' : 'mono'), 'Una longitud de onda o luz blanca (espectro plano de 380 a 750 nm)|Light')
        + (blanca() ? '' : campo('λ', 'lambda', 'longitud', 'nm', 'Longitud de onda en el vacío|Wavelength'));
    } else if (sel === 'rendijas') {
      titulo = 'Rendijas';
      h = fila('Tipo', segmentado('p-tipo', [['simple', 'Simple'], ['doble', 'Doble'], ['n', 'N'], ['red', 'Red']], ESC.rendija), 'Rendija simple, doble, N rendijas o red de difracción|Aperture');
      if (ESC.rendija === 'n' || ESC.rendija === 'red') h += campo('N', 'N', 'adimensional', '', ESC.rendija === 'red' ? 'Líneas iluminadas que se suman|Illuminated lines' : 'Número de rendijas|Slits');
      if (ESC.rendija === 'red') h += campo('Líneas', 'lineas', [-1, 0, 0, 0, 0, 0].join(','), '1/mm', 'Líneas por milímetro: d = 1/k|Lines per mm');
      else if (ESC.rendija !== 'simple') h += campo('d', 'd', 'longitud', uLargo(ESC.d), 'Separación entre centros de rendijas|Slit separation');
      h += campo('a', 'a', 'longitud', 'µm', 'Ancho de cada rendija (0: rendija puntual)|Slit width');
    } else if (sel === 'medio') {
      ico = 'o-medio'; nombre = 'Medio'; titulo = 'Medio entre las rendijas y la pantalla';
      h = campo('n', 'n', 'adimensional', '', 'Índice de refracción: la longitud de onda en el medio es λ/n|Refractive index');
    } else if (sel === 'pantalla') {
      ico = 'o-pantalla-optica'; nombre = 'Pantalla'; titulo = 'Pantalla';
      h = campo('L', 'L', 'longitud', uLargo(ESC.L), 'Distancia de las rendijas a la pantalla|Screen distance') + campo('Alto', 'alto', 'longitud', uLargo(ESC.alto), 'Mitad del tramo de pantalla que se ve (rueda del ratón sobre la pantalla)|Half height');
    } else if (sel === 'punto') {
      ico = 'n-detector'; nombre = 'Punto P'; titulo = 'Punto de la pantalla';
      h = ESC.P == null ? '' : campo('y', 'P', 'longitud', uLargo(ESC.alto), 'Altura de P sobre la pantalla|Position') + `<div class="fila"><span class="etq">Punto</span><div><button class="btn btn-secundario btn-compacto" id="p-quitar" data-ayuda="Quitar el punto P|Delete|Supr"><svg class="ico"><use href="#i-borrar"/></svg>Quitar</button></div></div>`;
    } else if (sel === 'regla') {
      ico = 'n-regla'; nombre = 'Regla'; titulo = 'Regla';
      h = ESC.regla ? fila('Desde', `<div class="campo"><input data-ruta="regla.0" data-dim="longitud" data-u="${uLargo(ESC.alto)}" value="${numCampo(ESC.regla[0] / FAC[uLargo(ESC.alto)])}"><span class="u">${uLargo(ESC.alto)}</span></div>`)
        + fila('Hasta', `<div class="campo"><input data-ruta="regla.1" data-dim="longitud" data-u="${uLargo(ESC.alto)}" value="${numCampo(ESC.regla[1] / FAC[uLargo(ESC.alto)])}"><span class="u">${uLargo(ESC.alto)}</span></div>`)
        + `<div class="fila"><span class="etq">Regla</span><div><button class="btn btn-secundario btn-compacto" id="p-quitar" data-ayuda="Quitar la regla|Delete|Supr"><svg class="ico"><use href="#i-borrar"/></svg>Quitar</button></div></div>` : '';
    }
    props.innerHTML = h;
    $('#insp-ico').setAttribute('href', '#' + ico); $('#insp-nombre').textContent = nombre; $('#props-titulo').textContent = titulo;
    props.querySelectorAll('input[data-ruta]').forEach(campoConUnidad);
    const on = (id, f) => { const e = $(id); if (e) e.addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) f(b.dataset.v); }); };
    on('#p-luz', v => { ESC.lambda = v === 'blanca' ? null : 600e-9; if (v === 'blanca' && ESC.metodo !== 'fraunhofer' && nRend() > 10) ESC.metodo = 'fraunhofer'; limpiarVariables(); cambio(); });
    on('#p-tipo', v => cambiarTipo(v));
    const q = $('#p-quitar'); if (q) q.addEventListener('click', quitarSeleccion);
    document.querySelectorAll('.herr').forEach(b => b.setAttribute('aria-current', String(b.dataset.herr === (sel === 'rendijas' ? ESC.rendija : sel))));
    arbol();
  }
  function cambiarTipo(t) {
    if (t === ESC.rendija) return;
    ESC.rendija = t;
    if (t === 'simple') { ESC.N = 1; ESC.a = ESC.a || 50e-6; }
    if (t === 'doble') { ESC.N = 2; ESC.d = ESC.d || 0.25e-3; }
    if (t === 'n') { ESC.N = Math.max(3, Math.min(12, ESC.N > 2 ? ESC.N : 5)); ESC.d = ESC.d || 0.1e-3; }
    if (t === 'red') { ESC.N = Math.max(40, ESC.N); ESC.a = Math.min(ESC.a, 0.5e-3 / ESC.lineas); ESC.metodo = 'fraunhofer'; ESC.alto = Math.max(ESC.alto, 0.6 * ESC.L * Math.tan(Math.asin(Math.min(0.95, lambdaRef() * ESC.lineas * 1e3)))); }
    if (t !== 'red' && ESC.metodo === 'fraunhofer' && nRend() <= 20) ESC.metodo = 'huygens';
    if (ESC.a >= dEf() && nRend() > 1) ESC.a = 0.2 * dEf();
    limpiarVariables(); cambio(); avisar(TIPOS[t]);
  }
  function validar(ruta, x) {
    if (ruta === 'lambda' && !(x >= 300e-9 && x <= 800e-9)) throw new Error('La longitud de onda va de 300 nm a 800 nm.');
    if (ruta === 'd' && !(x > 0 && x <= 0.1)) throw new Error('La separación va de 0 a 10 cm.');
    if (ruta === 'a' && !(x >= 0 && x <= 0.01)) throw new Error('El ancho va de 0 a 1 cm.');
    if (ruta === 'L' && !(x >= 1e-3 && x <= 50)) throw new Error('La distancia a la pantalla va de 1 mm a 50 m.');
    if (ruta === 'alto' && !(x >= 1e-5 && x <= 5)) throw new Error('El alto va de 10 µm a 5 m.');
    if (ruta === 'n' && !(x >= 1 && x <= 3)) throw new Error('El índice va de 1 a 3.');
    if (ruta === 'N') { if (!(x >= 1 && x <= 400)) throw new Error('El número de rendijas va de 1 a 400.'); return Math.round(x); }
    if (ruta === 'lineas' && !(x >= 1e3 && x <= 3e6)) throw new Error('La red va de 1 a 3000 líneas por milímetro.');
    if ((ruta === 'P' || ruta.startsWith('regla')) && !(Math.abs(x) <= ESC.alto)) throw new Error('El punto tiene que estar en la parte visible de la pantalla.');
    return ruta === 'lineas' ? x / 1e3 : x;
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
        if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(txt) && u) txt = u === '1/mm' ? `${txt} / mm` : `${txt} ${u}`;
        const r = evaluar(txt, { esperada: dim }), ruta = ent.dataset.ruta, x = validar(ruta, r.valor);
        if (ruta.startsWith('regla.')) ESC.regla[+ruta.slice(6)] = x; else ESC[ruta] = x;
        if (nRend() > 1 && !(dEf() > ESC.a)) { mostrarError('Las rendijas se tocan: la separación d debe ser mayor que el ancho a.'); return; }
        mostrarError(null); cambio();
      } catch (e) { mostrarError(e.message); }
    });
    ent.addEventListener('keydown', ev => { if (ev.key === 'Escape') { mostrarError(null); ent.blur(); inspector(); } });
  }
  function arbol() {
    const nodo = (s, ico, nombre, dato) => `<div class="nodo" data-sel="${s}" aria-selected="${sel === s}"><svg class="ico"><use href="#${ico}"/></svg><span class="nombre">${nombre}</span><span class="dato">${dato}</span></div>`;
    let h = nodo('fuente', 'o-fuente-luz', 'Fuente', blanca() ? 'blanca' : cantidad(ESC.lambda * 1e9, 'nm', 3))
      + nodo('rendijas', ICONOS[ESC.rendija], TIPOS[ESC.rendija], ESC.rendija === 'red' ? `${fmt(ESC.lineas, 4)}/mm` : nRend() > 1 ? `d = ${largo(ESC.d, 3)}` : `a = ${largo(ESC.a, 3)}`)
      + nodo('medio', 'o-medio', 'Medio', `n = ${fmt(ESC.n, 4)}`)
      + nodo('pantalla', 'o-pantalla-optica', 'Pantalla', `L = ${largo(ESC.L, 3)}`);
    if (ESC.P != null) h += nodo('punto', 'n-detector', 'Punto P', largo(ESC.P, 3));
    if (ESC.regla) h += nodo('regla', 'n-regla', 'Regla', largo(Math.abs(ESC.regla[1] - ESC.regla[0]), 3));
    $('#arbol').innerHTML = h;
    $('#arbol').querySelectorAll('.nodo').forEach(n => n.addEventListener('click', () => seleccionar(n.dataset.sel)));
  }
  function seleccionar(s) { if (s === sel) return; sel = s; inspector(); todo(); }

  const lectura = ([a, b, val, u, ayuda]) => `<span class="sim"${ayuda ? ` data-ayuda="${ayuda}"` : ''}>${a}${b ? `<sub class="r">${b}</sub>` : ''}</span><span class="v">${val}</span><span class="u">${u}</span>`;
  const partes = s => { const m = /^(−?[\d.]+(?: × 10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)?)\s(.+)$/.exec(s); return m ? [m[1], m[2]] : [s, '']; };
  const Lx = (a, b, v, ay) => { const [x, u] = partes(largo(v, 4)); return [a, b, x, u, ay]; };
  function lecturas() {
    document.querySelectorAll('[data-var]').forEach(e => { const d = ESC.variables[e.dataset.var]; if (d) e.textContent = fmtVar(d); });
    if (!R) { $('#lecturas').innerHTML = '<span class="u">—</span>'; $('#insp-estado').textContent = ERROR || ''; return; }
    const f = [], lam = lambdaRef(), N = nRend();
    let estado = '';
    if (sel === 'fuente') {
      f.push(Lx('λ', blanca() ? 'ref' : '', lam, 'Longitud de onda en el vacío|Wavelength'), Lx('λ', 'n', lam / ESC.n, 'Longitud de onda en el medio λ/n|Wavelength in medium'));
      f.push(['f', '', fmt(299792458 / lam / 1e12, 4), 'THz', 'Frecuencia c/λ|Frequency']);
      estado = blanca() ? 'Luz blanca' : 'Monocromática';
    } else if (sel === 'rendijas' || sel === 'medio' || sel === 'pantalla') {
      if (N >= 2) f.push(Lx('Δy', '', interfranja(lam, ESC.L, dEf(), ESC.n), 'Interfranja λL/(nd) (ángulos pequeños)|Fringe spacing'));
      if (N >= 2) { const m1 = maximosRed(lam, dEf(), ESC.n).find(o => o.m === 1); if (m1) f.push(['θ', '1', fmt(m1.theta * 180 / Math.PI, 4), '°', 'Primer máximo: n·d·sen θ = λ|First order']); }
      if (ESC.a > 0) { const m = minimosRendija(lam, ESC.a, ESC.n).find(o => o.m === 1); if (m) f.push(['θ', 'mín', fmt(m.theta * 180 / Math.PI, 4), '°', 'Primer mínimo de una rendija: n·a·sen θ = λ|First minimum']); }
      f.push(['N', 'máx', String(ordenes().length), '', N >= 2 ? 'Máximos principales que caben en la pantalla|Visible orders' : 'Mínimos que caben en la pantalla|Visible minima']);
      f.push(['F', '', fmt((ESC.a || dEf()) ** 2 / (lam * ESC.L), 3), '', 'Número de Fresnel a²/(λL): mucho menor que 1 es campo lejano|Fresnel number']);
      estado = `${N} ${N === 1 ? 'rendija' : 'rendijas'} · ${R.metodo === 'huygens' ? `Huygens, ${R.sub} fuentes por rendija` : 'Fraunhofer'}`;
    } else if (sel === 'punto' && ESC.P != null) {
      const rs = rendijas(), i = Math.max(0, Math.floor(N / 2) - 1), dc = diferenciaCaminos({ y1: rs[i].y, y2: (rs[i + 1] || rs[i]).y, L: ESC.L, Y: ESC.P, n: ESC.n });
      f.push(Lx('y', 'P', ESC.P), ['θ', '', fmt(Math.atan2(ESC.P, ESC.L) * 180 / Math.PI, 4), '°'], Lx('r', '1', dc.r1), Lx('r', '2', dc.r2));
      if (N >= 2) f.push(Lx('Δ', '', Math.abs(dc.delta), 'Diferencia de caminos ópticos n(r₂ − r₁)|Path difference'), ['Δ/λ', '', fmt(Math.abs(dc.delta) / lam, 4), '']);
      f.push(['I', '', fmt(intensidadEn(ESC.P), 4), '', 'Intensidad relativa al máximo de la pantalla|Relative intensity']);
      estado = N >= 2 ? (Math.abs(dc.delta / lam - Math.round(dc.delta / lam)) < 0.05 ? 'Interferencia constructiva' : Math.abs(Math.abs(dc.delta / lam - Math.round(dc.delta / lam)) - 0.5) < 0.05 ? 'Interferencia destructiva' : '') : '';
    } else if (sel === 'regla' && ESC.regla) {
      const d = Math.abs(ESC.regla[1] - ESC.regla[0]);
      f.push(Lx('Δy', '', d));
      if (N >= 2) f.push(['Δy/i', '', fmt(d / interfranja(lam, ESC.L, dEf(), ESC.n), 4), '', 'Distancia medida en interfranjas|In fringe spacings']);
    }
    $('#lecturas').innerHTML = f.map(lectura).join('');
    $('#insp-estado').textContent = estado;
  }
  function intensidadEn(y) {
    if (!R) return NaN;
    const k = (y - R.y[0]) / (R.y[R.y.length - 1] - R.y[0]) * (R.y.length - 1), i = Math.max(0, Math.min(R.y.length - 2, Math.floor(k))), t = k - i;
    return R.I[i] * (1 - t) + R.I[i + 1] * t;
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
  function aplicarVariables() {
    for (const d of Object.values(ESC.variables)) for (const r of d.liga) { if (r === 'P' && ESC.P == null) continue; ESC[r] = r === 'N' ? Math.round(d.val) : d.val * d.factor / (r === 'lineas' ? 1e3 : 1); }
    if (nRend() > 1 && ESC.a >= dEf()) ESC.a = 0.5 * dEf();
    if (ESC.P != null) ESC.P = Math.max(-ESC.alto, Math.min(ESC.alto, ESC.P));
  }
  function limpiarVariables() {
    for (const [k, d] of Object.entries(ESC.variables)) {
      d.liga = d.liga.filter(r => !(r === 'lambda' && blanca()) && !(r === 'N' && nRend() <= 2 && ESC.rendija !== 'n') && !(r === 'lineas' && ESC.rendija !== 'red') && !(r === 'd' && ESC.rendija === 'red'));
      if (!d.liga.length) delete ESC.variables[k];
    }
    construirVariables();
  }

  // ---------------------------------------------------------------------
  // Gráficas
  // ---------------------------------------------------------------------
  const vacia = (n, msj) => { grafica($(`#g${n}`), { x: { min: 0, max: 1 }, y: { min: 0, max: 1 }, series: [] }); $(`#t${n}`).textContent = msj; $(`#l${n}`).textContent = ''; };
  function graficas() { if (!$('#p-graficas').hidden) ESC.graficas.forEach((g, j) => grafica1(j + 1, g)); }
  function grafica1(n, tipo) {
    const cv = $(`#g${n}`), T = $(`#t${n}`), Lc = $(`#l${n}`);
    if (!R) { vacia(n, 'Sin cálculo'); return; }
    const [f, u] = ESC.alto >= 0.05 ? [1e-2, 'cm'] : [1e-3, 'mm'];
    if (tipo === 'intensidad') {
      const pts = Array.from(R.y, (y, i) => [y / f, R.I[i]]);
      grafica(cv, { x: { min: -ESC.alto / f, max: ESC.alto / f }, y: { min: 0, max: 1.05 }, series: [{ tramos: [pts], familia: 'tinta' }], cursor: ESC.P != null ? ESC.P / f : null, puntoCursor: ESC.P != null ? [ESC.P / f, intensidadEn(ESC.P)] : null, eventos: ordenes().map(o => ({ x: o.y / f })) });
      T.innerHTML = `${simHTML('I')}/${simHTML('I', 'máx')} contra ${simHTML('y')} (${u})`;
      Lc.textContent = ESC.P != null ? fmt(intensidadEn(ESC.P), 3) : '';
    } else if (tipo === 'seno') {
      // I contra sen θ: los máximos de la red caen en mλ/(nd); los mínimos de una rendija en mλ/(na)
      const pts = Array.from(R.y, (y, i) => [y / Math.hypot(ESC.L, y), R.I[i]]), s1 = ESC.alto / Math.hypot(ESC.L, ESC.alto);
      grafica(cv, { x: { min: -s1, max: s1 }, y: { min: 0, max: 1.05 }, series: [{ tramos: [pts], familia: 'tinta' }], eventos: ordenes().map(o => ({ x: Math.sin(o.theta) })) });
      const N = nRend();
      T.innerHTML = `${simHTML('I')}/${simHTML('I', 'máx')} contra sen ${simHTML('θ')}`;
      Lc.textContent = N >= 2 ? `◆ mλ/(nd)` : ESC.a > 0 ? `◆ mλ/(na)` : '';
    } else if (tipo === 'fasores') graficaFasores(n);
  }
  const tzF = new Trazo($('#g2'));
  function graficaFasores(n) {
    const cv = $(`#g${n}`), T = $(`#t${n}`), Lc = $(`#l${n}`);
    const t = n === 2 ? tzF : new Trazo(cv);
    t.ajustar(); t.limpiar();
    if (ESC.P == null) { T.textContent = 'Fasores: coloca el punto P en la pantalla'; Lc.textContent = ''; return; }
    const lam = lambdaRef(), p = { lambda: lam, L: ESC.L, n: ESC.n, rendijas: rendijas() };
    const N = nRend();
    // Una rendija: sus subfuentes; varias (hasta 40): un fasor por rendija
    const fa = N > 40 ? null : fasoresEn(p, ESC.P, N === 1 ? 36 : Math.min(R.sub || 6, 24), N === 1);
    if (!fa) { T.textContent = 'Fasores: demasiadas rendijas para dibujarlos'; Lc.textContent = ''; return; }
    const lista = N === 1 ? fa.subfasores[0] : fa.fasores;
    // Fase relativa a la de la primera rendija (la referencia gira con P)
    const ref = Math.atan2(lista[0].im, lista[0].re), c = Math.cos(-ref), s = Math.sin(-ref);
    const rot = lista.map(q => ({ re: q.re * c - q.im * s, im: q.re * s + q.im * c }));
    let x = 0, y = 0, xmin = 0, xmax = 0, ymin = 0, ymax = 0;
    for (const q of rot) { x += q.re; y += q.im; xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
    const total = rot.reduce((a, q) => a + Math.hypot(q.re, q.im), 0), W = t.w, H = t.h;
    const k = 0.8 * Math.min(W / Math.max(xmax - xmin, total * 0.25, 1e-30), H / Math.max(ymax - ymin, total * 0.25, 1e-30));
    const cx = W / 2 - k * (xmin + xmax) / 2, cy = H / 2 + k * (ymin + ymax) / 2;
    t.opticaFasores(cx, cy, rot.map(q => ({ re: q.re * k, im: q.im * k })), { color: blanca() ? t.t.tinta : t.opticaColor(lam), ejeLargo: Math.max(40, k * total * 0.3) });
    // Diferencia de fase 2π·n·Δr/λ entre dos rendijas vecinas (o entre los bordes de una rendija)
    const rs = rendijas(), ya = N === 1 ? rs[0].y - ESC.a / 2 : rs[0].y, yb = N === 1 ? rs[0].y + ESC.a / 2 : rs[1].y;
    const dfase = 2 * Math.PI * diferenciaCaminos({ y1: ya, y2: yb, L: ESC.L, Y: ESC.P, n: ESC.n }).delta / lam;
    T.innerHTML = N === 1 ? 'Fasores en P (subfuentes)' : 'Fasores en P (rendijas)';
    Lc.textContent = `Δφ = ${fmt(Math.abs(dfase) * 180 / Math.PI, 4)}°`;
  }

  // ---------------------------------------------------------------------
  // Tablas y exportación
  // ---------------------------------------------------------------------
  function tablas() {
    if (!R) { $('#t-ordenes').innerHTML = ''; $('#t-datos').innerHTML = ''; return; }
    const N = nRend(), med = extremos(R.y, R.I, N >= 2 ? 'max' : 'min');
    $('#t-ordenes').innerHTML = `<tr><th>${N >= 2 ? 'Máximo' : 'Mínimo'} m</th><th>sen θ (teoría)</th><th>θ (°)</th><th>y teoría (m)</th><th>y medido (m)</th><th>diferencia (m)</th></tr>`
      + (ordenes().map(o => { const c = med.reduce((b, q) => (!b || Math.abs(q.x - o.y) < Math.abs(b.x - o.y) ? q : b), null); return `<tr><td>${String(o.m).replace('-', '−')}</td><td>${fmt(Math.sin(o.theta), 5)}</td><td>${fmt(o.theta * 180 / Math.PI, 5)}</td><td>${fmt(o.y, 5)}</td><td>${c ? fmt(c.x, 5) : '—'}</td><td>${c ? fmt(c.x - o.y, 2) : '—'}</td></tr>`; }).join('')
        || '<tr><td class="texto" colspan="6">No cabe ningún orden en la pantalla.</td></tr>');
    let h = '<tr><th>y (m)</th><th>I/Imáx</th></tr>';
    const paso = Math.max(1, Math.floor(R.y.length / 120));
    for (let i = 0; i < R.y.length; i += paso) h += `<tr${ESC.P != null && Math.abs(R.y[i] - ESC.P) < paso * (R.y[1] - R.y[0]) / 2 ? ' class="actual"' : ''}><td>${fmt(R.y[i], 5)}</td><td>${fmt(R.I[i], 4)}</td></tr>`;
    $('#t-datos').innerHTML = h;
  }
  function exportarCSV() {
    if (!R) { avisar('No hay datos: revisa la escena.', false); return; }
    const cols = ['y (m)', blanca() ? 'luminancia relativa' : 'I/Imax'], filas = Array.from(R.y, (y, i) => [y, R.I[i]]);
    if (blanca()) { R.lambdas.forEach(l => cols.push(`I a ${Math.round(l * 1e9)} nm`)); filas.forEach((f, i) => R.pats.forEach(p => f.push(p.I[i]))); }
    descargarTexto(`${nombreArchivo(ESC.titulo)}-intensidad.csv`, aCSV(cols, filas)).then(r => { if (r) avisarLienzo(area, `Datos exportados: ${filas.length} filas`); }, e => avisar(`No se pudo exportar: ${e}`, false));
  }
  function exportarPNG() { descargarLienzo(lienzo, `${nombreArchivo(ESC.titulo)}.png`).then(r => { if (r) avisarLienzo(area, 'Imagen del lienzo exportada'); }); }
  $('#b-exportar').addEventListener('click', exportarCSV);

  // ---------------------------------------------------------------------
  // Ciclo, historial y archivos
  // ---------------------------------------------------------------------
  function todo() { dibujar(); lecturas(); graficas(); if (!$('#p-ordenes').hidden || !$('#p-tabla').hidden) tablas(); }
  function recalcular() { simular(); todo(); if (autoguardar) autoguardado.guardar('optica-ondas', escenaActual()); }
  function cambio() { aplicarVariables(); recalcular(); registrar(); inspector(); }
  function titulo() {
    $('#escena-nombre').textContent = ESC.titulo;
    const chip = $('#escena-chip');
    chip.textContent = ESC.tipo === 'MEXT' ? `MEXT ${ESC.anio || ''}`.trim() : ESC.tipo || 'Propio';
    chip.className = 'chip' + (ESC.tipo === 'MEXT' ? ' lleno' : '');
    document.title = `Volta · Interferencia y difracción · ${ESC.titulo}`;
    document.querySelectorAll('.capa-btn').forEach(b => b.setAttribute('aria-pressed', String(!!ESC.capas[b.dataset.capa])));
    const m = $('#b-modo'); m.textContent = ESC.metodo === 'fraunhofer' ? 'Fraunhofer (campo lejano)' : 'Suma de Huygens'; m.classList.toggle('lejano', ESC.metodo === 'fraunhofer');
  }
  let relojAviso = null;
  function avisar(txt, conDeshacer = true) {
    $('#aviso-texto').textContent = txt; $('#aviso').hidden = false;
    $('#aviso-deshacer').hidden = !conDeshacer || !historial?.puedeDeshacer;
    clearTimeout(relojAviso); relojAviso = setTimeout(() => { $('#aviso').hidden = true; }, conDeshacer ? 5000 : 4000);
  }
  $('#aviso-deshacer').addEventListener('click', () => deshacer());
  const copia = o => JSON.parse(JSON.stringify(o));
  const instantanea = () => copia(ESC);
  function escenaActual() { return crearEscena({ modulo: 'optica', espacio: 'interferencia', titulo: ESC.titulo, datos: instantanea() }); }
  // Valida y acota lo que viene de un archivo (entrada no confiable)
  function datosSeguros(d = {}) {
    const base = completa(ESCENAS.find(e => e.clave === d.clave) || ESCENAS[0]);
    const variables = {};
    for (const [k, v] of Object.entries(d.variables && typeof d.variables === 'object' ? d.variables : {})) {
      if (!v || !Array.isArray(v.liga) || !/^[A-Za-z]\w{0,7}$/.test(k)) continue;
      const min = numero(v.min, 0, -1e9, 1e9), max = Math.max(min, numero(v.max, 1, -1e9, 1e9));
      const liga = v.liga.filter(r => ['lambda', 'd', 'a', 'L', 'n', 'N', 'lineas', 'P', 'alto'].includes(r));
      if (!liga.length) continue;
      variables[k] = { sim: texto(v.sim, k, 3), sub: v.sub ? texto(v.sub, '', 4) : undefined, val: numero(v.val, min, min, max), min, max, paso: numero(v.paso, 0.1, 1e-9, 1e9), u: ['nm', 'µm', 'mm', 'cm', 'm', '', '1/mm'].includes(v.u) ? v.u : '', factor: numero(v.factor, 1, 1e-15, 1e15), liga };
    }
    const capas = {};
    for (const k of Object.keys(base.capas)) capas[k] = typeof d.capas?.[k] === 'boolean' ? d.capas[k] : !!base.capas[k];
    const rendija = Object.keys(TIPOS).includes(d.rendija) ? d.rendija : base.rendija;
    const r = {
      clave: ESCENAS.some(e => e.clave === d.clave) ? d.clave : 'propio', titulo: texto(d.titulo, base.titulo, 80),
      tipo: ['Tutorial', 'Ejemplo', 'MEXT', 'Propio'].includes(d.tipo) ? d.tipo : 'Propio', anio: d.anio ? texto(d.anio, '', 14) : undefined,
      lambda: d.lambda === null ? null : numero(d.lambda, 600e-9, 300e-9, 800e-9), rendija, N: Math.round(numero(d.N, 2, 1, 400)),
      d: numero(d.d, 0.25e-3, 1e-7, 0.1), a: numero(d.a, 0.04e-3, 0, 0.01), lineas: numero(d.lineas, 500, 1, 3000), L: numero(d.L, 1, 1e-3, 50), n: numero(d.n, 1, 1, 3),
      alto: numero(d.alto, 0.012, 1e-5, 5), P: d.P == null ? null : numero(d.P, 0, -5, 5), regla: Array.isArray(d.regla) && d.regla.length === 2 && d.regla.every(Number.isFinite) ? d.regla.map(x => numero(x, 0, -5, 5)) : null,
      metodo: d.metodo === 'fraunhofer' ? 'fraunhofer' : 'huygens', graficas: base.graficas.slice(), capas, variables,
    };
    if (r.rendija === 'simple') r.N = 1; if (r.rendija === 'doble') r.N = 2;
    if (r.P != null) r.P = Math.max(-r.alto, Math.min(r.alto, r.P));
    if (r.N > 1 && r.a >= (r.rendija === 'red' ? 1e-3 / r.lineas : r.d)) r.a = 0.2 * (r.rendija === 'red' ? 1e-3 / r.lineas : r.d);
    return r;
  }
  function restaurar(d) { ESC = datosSeguros(d); aplicarVariables(); if ((sel === 'punto' && ESC.P == null) || (sel === 'regla' && !ESC.regla)) sel = 'rendijas'; titulo(); construirVariables(); inspector(); recalcular(); }
  function botonesHistorial() { $('#b-deshacer').disabled = !historial?.puedeDeshacer; $('#b-rehacer').disabled = !historial?.puedeRehacer; }
  function registrar() { if (historial && historial.registrar(instantanea())) botonesHistorial(); }
  function deshacer() { const d = historial?.deshacer(); if (d) { restaurar(d); botonesHistorial(); avisar('Cambio deshecho', false); } }
  function rehacer() { const d = historial?.rehacer(); if (d) { restaurar(d); botonesHistorial(); avisar('Cambio rehecho', false); } }
  $('#b-deshacer').addEventListener('click', deshacer);
  $('#b-rehacer').addEventListener('click', rehacer);
  function abrirEscena1(clave) {
    ESC = completa(escenaDe(clave)); aplicarVariables(); sel = 'rendijas'; herramienta = null; marcarHerramienta();
    titulo(); construirVariables(); inspector(); recalcular();
    if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); }
  }
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
      if (aOtroEspacio(e, 'interferencia')) return;
      restaurar(e.datos); if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); }
      avisar(`Escena abierta: ${texto(e.titulo, 'sin título', 60)}`, false);
    }).catch(err => avisar(err.message, false));
  }
  function quitarSeleccion() {
    if (sel === 'punto' && ESC.P != null) { ESC.P = null; for (const [k, d] of Object.entries(ESC.variables)) if (d.liga.includes('P')) delete ESC.variables[k]; sel = 'rendijas'; construirVariables(); cambio(); avisar('Se quita el punto P'); }
    else if (sel === 'regla' && ESC.regla) { ESC.regla = null; sel = 'rendijas'; cambio(); avisar('Se quita la regla'); }
  }

  // ---------------------------------------------------------------------
  // Paleta, capas y modo
  // ---------------------------------------------------------------------
  function marcarHerramienta() {
    document.querySelectorAll('#paleta-instrumentos .herr').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.herr === herramienta)));
    lienzo.style.cursor = herramienta ? 'crosshair' : 'default';
  }
  function ponerHerramienta(h) {
    if (['simple', 'doble', 'n', 'red'].includes(h)) { cambiarTipo(h); if (sel !== 'rendijas') seleccionar('rendijas'); return; }
    if (['fuente', 'medio', 'pantalla'].includes(h)) { seleccionar(h); return; }
    herramienta = herramienta === h ? null : h; marcarHerramienta();
    if (herramienta) avisar(herramienta === 'punto' ? 'Diferencia de caminos: clic en la pantalla para colocar P · Esc termina' : 'Regla: arrastra sobre la pantalla entre dos franjas · Esc termina', false);
  }
  document.querySelectorAll('.herr').forEach(b => b.addEventListener('click', () => ponerHerramienta(b.dataset.herr)));
  function ponerCapa(k, on) { ESC.capas[k] = on; document.querySelectorAll(`.capa-btn[data-capa="${k}"]`).forEach(b => b.setAttribute('aria-pressed', String(on))); }
  const alternarCapa = k => { ponerCapa(k, !ESC.capas[k]); registrar(); dibujar(); };
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => alternarCapa(b.dataset.capa)));
  function alternarMetodo() { ESC.metodo = ESC.metodo === 'fraunhofer' ? 'huygens' : 'fraunhofer'; titulo(); cambio(); avisar(ESC.metodo === 'fraunhofer' ? 'Fraunhofer: forma cerrada de campo lejano' : 'Suma de Huygens con las distancias exactas', false); }
  $('#b-modo').addEventListener('click', alternarMetodo);
  $('#pest').addEventListener('click', () => setTimeout(todo, 0));

  // ---------------------------------------------------------------------
  // Lienzo: seleccionar, colocar P y la regla, arrastrar, rueda = alto
  // ---------------------------------------------------------------------
  function zonaEn(X, Y) {
    const xb = Xb(), xs = Xs(), Yc = yc(), H = altoPx(), xr = xs + anchoFranja + 10;
    if (ESC.regla) for (const j of [0, 1]) if (Math.hypot(X - xr, Y - Ys(ESC.regla[j])) < 8) return 'regla:' + j;
    if (ESC.P != null && Math.abs(Y - Ys(ESC.P)) < 7 && X > xs - 12 && X < tz.w - 20) return 'punto';
    if (X >= xs - 6 && X <= tz.w - 20 && Math.abs(Y - Yc) <= H + 6) return 'pantalla';
    if (Math.abs(X - xb) < 18 && Math.abs(Y - Yc) < 0.8 * H) return 'rendijas';
    if (X < xb - 18 && Math.abs(Y - Yc) < 0.6 * H) return 'fuente';
    if (X > xb && X < xs && Math.abs(Y - Yc) <= H + 6) return 'medio';
    return null;
  }
  const ajusteY = (y, fino) => { const p = ESC.alto / (fino ? 2000 : 200); return Math.max(-ESC.alto, Math.min(ESC.alto, Math.round(y / p) * p)); };
  lienzo.addEventListener('pointerdown', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, z = zonaEn(X, Y), enPantalla = X >= Xs() - 6 && Math.abs(Y - yc()) <= altoPx() + 6;
    if (herramienta === 'punto' && enPantalla) { ESC.P = ajusteY(yDe(Y), ev.shiftKey); herramienta = null; marcarHerramienta(); sel = 'punto'; cambio(); arrastre = { tipo: 'punto' }; lienzo.setPointerCapture(ev.pointerId); return; }
    if (herramienta === 'regla' && enPantalla) { const y = ajusteY(yDe(Y), ev.shiftKey); ESC.regla = [y, y]; arrastre = { tipo: 'regla:1', nueva: true }; herramienta = null; marcarHerramienta(); sel = 'regla'; lienzo.setPointerCapture(ev.pointerId); return; }
    if (!z) { seleccionar('rendijas'); return; }
    if (z.startsWith('regla:') || z === 'punto') { arrastre = { tipo: z }; if (sel !== (z === 'punto' ? 'punto' : 'regla')) seleccionar(z === 'punto' ? 'punto' : 'regla'); lienzo.setPointerCapture(ev.pointerId); return; }
    seleccionar(z);
  });
  lienzo.addEventListener('pointermove', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top;
    if (X >= Xs() - 6 && Math.abs(Y - yc()) <= altoPx()) { const y = yDe(Y); $('#cy').textContent = largo(y, 4); $('#ci').textContent = fmt(intensidadEn(y), 3); } else { $('#cy').textContent = '—'; $('#ci').textContent = '—'; }
    if (arrastre) {
      const y = ajusteY(yDe(Y), ev.shiftKey);
      if (arrastre.tipo === 'punto') { ESC.P = y; sincronizar('P'); }
      else if (arrastre.tipo.startsWith('regla:')) ESC.regla[+arrastre.tipo.slice(6)] = y;
      arrastre.movido = true; todo(); return;
    }
    if (herramienta) return;
    const z = zonaEn(X, Y), h = z && z.startsWith('regla') ? 'regla' : z;
    lienzo.style.cursor = z ? (z === 'punto' || z.startsWith('regla:') ? 'ns-resize' : 'pointer') : 'default';
    if (h !== hover) { hover = h; dibujar(); }
  });
  function sincronizar(ruta) { for (const d of Object.values(ESC.variables)) if (d.liga.includes(ruta)) d.val = Math.max(d.min, Math.min(d.max, ESC[ruta] / d.factor)); construirVariables(); }
  lienzo.addEventListener('pointerup', () => { if (arrastre) { const a = arrastre; arrastre = null; if (a.nueva && ESC.regla && ESC.regla[0] === ESC.regla[1]) { ESC.regla = null; sel = 'rendijas'; } cambio(); } });
  lienzo.addEventListener('pointerleave', () => { if (hover) { hover = null; dibujar(); } });
  let relojRueda = null;
  lienzo.addEventListener('wheel', ev => {
    ev.preventDefault();
    ESC.alto = Math.max(1e-5, Math.min(5, ESC.alto * Math.exp(ev.deltaY * 0.0012)));
    if (ESC.P != null) ESC.P = Math.max(-ESC.alto, Math.min(ESC.alto, ESC.P));
    recalcular(); clearTimeout(relojRueda); relojRueda = setTimeout(() => { registrar(); inspector(); }, 400);
  }, { passive: false });

  // ---------------------------------------------------------------------
  // Menú de escenas, comandos y teclado
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
  const COMANDOS = [
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['i-ajustes', 'Cambiar entre Huygens y Fraunhofer', 'M', alternarMetodo],
    ['n-detector', 'Colocar el punto P (diferencia de caminos)', 'P', () => ponerHerramienta('punto')],
    ['n-regla', 'Medir con la regla', 'R', () => ponerHerramienta('regla')],
    ['i-capas', 'Mostrar u ocultar los frentes de onda', '', () => alternarCapa('frentes')],
    ['i-capas', 'Mostrar u ocultar la curva de intensidad', '', () => alternarCapa('curva')],
    ['i-capas', 'Mostrar u ocultar los órdenes', '', () => alternarCapa('ordenes')],
    ['o-rendija', 'Rendija simple', '', () => ponerHerramienta('simple')],
    ['o-rendija-doble', 'Doble rendija', '', () => ponerHerramienta('doble')],
    ['o-arreglo-fuentes', 'N rendijas', '', () => ponerHerramienta('n')],
    ['o-red-difraccion', 'Red de difracción', '', () => ponerHerramienta('red')],
    ['i-historial', 'Restablecer la escena original', '', () => { if (ESCENAS.some(e => e.clave === ESC.clave)) { abrirEscena1(ESC.clave); avisar('Escena original restablecida', false); } }],
    ['i-deshacer', 'Deshacer', 'Ctrl Z', deshacer], ['i-rehacer', 'Rehacer', 'Ctrl Y', rehacer],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar], ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
    ['i-exportar', 'Exportar la intensidad a CSV', '', exportarCSV], ['i-imagen', 'Exportar imagen del lienzo', '', exportarPNG],
    ...ESCENAS.map(e => [ICONO_TIPO[e.tipo], `Abrir escena: ${e.titulo}`, e.tipo === 'MEXT' ? `MEXT ${e.anio}` : e.tipo, () => abrirEscena1(e.clave), 'Escenas']),
  ];
  let selCmd = 0;
  function pintarComandos() {
    const q = $('#cmd-q').value.trim().toLowerCase(), lista = COMANDOS.filter(c => c[1].toLowerCase().includes(q));
    selCmd = Math.min(selCmd, Math.max(0, lista.length - 1));
    let grupo = null, html = '';
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
    if (ev.key === 'Escape') { herramienta = null; marcarHerramienta(); $('#menu-escenas').hidden = true; }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') quitarSeleccion();
    else if (tecla === 'p') ponerHerramienta('punto');
    else if (tecla === 'r') ponerHerramienta('regla');
    else if (tecla === 'm') alternarMetodo();
  });

  // ---------------------------------------------------------------------
  // Arranque. Parámetros: ?escena=red-blanca&sel=punto&pest=ordenes
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); tzF.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); R = null; simular(); todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search), limpio = ![...q.keys()].length;
    const pend = escenaPendiente('optica');
    const previa = (pend && pend.espacio === 'interferencia' ? pend : null) || (limpio ? autoguardado.leer('optica-ondas', { modulo: 'optica' }) : null);
    tz.ajustar(); tz.vista.escala = 1; tz.vista.ox = 0; tz.vista.oy = 0;
    if (q.has('escena') || !previa) ESC = completa(escenaDe(q.get('escena') || 'young'));
    else ESC = datosSeguros(previa.datos);
    aplicarVariables();
    if (q.has('sel') && ['fuente', 'rendijas', 'medio', 'pantalla', 'punto', 'regla'].includes(q.get('sel'))) sel = q.get('sel');
    autoguardar = limpio || !!previa;
    titulo(); construirVariables(); inspector(); recalcular();
    const pe = q.get('pest'); if (pe) { const b = document.querySelector(`#pest [aria-controls="p-${pe}"]`); if (b) b.click(); }
    todo();
    historial = new Historial(instantanea()); botonesHistorial();
  });
})();
