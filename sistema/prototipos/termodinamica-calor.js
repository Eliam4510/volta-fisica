/* ==========================================================================
   Volta · Termodinámica — espacio de trabajo "Calor y calorimetría"
   Cuerpos con masa, calor específico y temperatura que intercambian calor
   por contacto; calorímetro, calentador (efecto Joule), fusión del hielo con
   su calor latente y un automóvil que convierte energía química en cinética
   y la cinética en calor al frenar. La física está en el motor puro
   sistema/motores/calor.js (probado en pruebas/calor.test.js); las escenas,
   en termodinamica-escenas.js. Las acciones (poner en contacto, encender el
   calentador, acelerar, frenar) se programan en la línea de tiempo.
   Parámetros de URL: ?escena=…&t=…&sel=c0|escena&pest=energia
   ========================================================================== */
import { estadoCalor, residuoCalor } from '../motores/calor.js';
import { ESCENAS_CALOR, valores, examenDe, escenaPorClave, simularEscena, guionDe } from './termodinamica-escenas.js';
import {
  ponerTitulo, iniciarMenuEscenas, aOtroEspacio, irAEscenaDeOtroEspacio, construirVariables, filaLectura, examenHTML,
  crearAvisador, iniciarComandos, crearReproductor, pintarReloj, ICONO_TIPO, chipDe, filasParametros, enlazarParametros, botonQuitar, iniciarPaleta,
} from './termodinamica-comun.js';
import {
  PARAMS_CALOR, colocarCalor, quitarCalor, ajustarCalor, moverCalor, piezaCalor, escenaCalor, montajeCalorVacio, sanearCalor, guionValidoCalor, entradaCalor, rectCalor,
  nuevoInstrumento, sanearInstrumentos,
} from './termodinamica-montaje.js';
import { aCSV } from '../nucleo/csv.js';
import { crearEscena, numero, texto } from '../nucleo/escena.js';
import { Historial } from '../nucleo/historial.js';
import { descargarTexto, descargarLienzo, nombreArchivo } from '../componentes/exportar.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';
import { registrarDocumento, confirmarCambios, documentoNuevo, hayCambios } from '../componentes/documento.js';

(function () {
  'use strict';
  const { Trazo, fmt, cantidad, conPrefijo, grafica, LineaTiempo } = Volta;
  const $ = s => document.querySelector(s);
  const ESPACIO = 'calor', NOMBRE_ESPACIO = 'Calor y calorimetría', K0 = 273.15;
  const PATRONES = ['continuo', 'discontinuo', 'punteado'];
  const C = T => T - K0;
  const gradC = (T, c = 4) => cantidad(C(T), '°C', c);
  const kJ = (x, c = 4) => conPrefijo(x, 'J', c);
  /** Etiqueta Φ de un flujo de calor con prefijo SI (W, kW). */
  const etiquetaPhi = (x, y, sub, val, alinear) => tz.etiquetaMagnitud(x, y, { simbolo: 'Φ', sub, subRecto: true, valor: val, unidad: 'W', color: 'termico', alinear, prefijo: true });
  const corto = i => E.cuerpos[i].nombre.split(' ')[0].toLowerCase();
  /** Valor y unidad con prefijo SI para julios y vatios (lecturas). */
  const conU = ([a, val, u, ay]) => { if (!['J', 'W'].includes(u) || !Number.isFinite(val) || Math.abs(val) < 1e-3) return [a, val, u, ay]; const txt = conPrefijo(val, u, 4), i = txt.lastIndexOf(Volta.ESP); return [a, txt.slice(0, i), txt.slice(i + 1), ay]; };

  /** @type {any} */ let ESC = ESCENAS_CALOR[0];
  /** @type {Record<string, any>} */ let VAR = {};
  let guion = [], guionPropio = false;
  /** @type {any} */ let SIM = null, E = null;
  let FILAS = [], POS = [], kFlujo = 1;
  let sel = 'escena', hover = null;
  const capas = { flujos: true, temperaturas: true };
  let historial = null, autoguardar = false, vistaTocada = false, escala0 = 1, espacioPulsado = false, paneo = null;
  const lienzo = $('#lienzo'), tz = new Trazo(lienzo);
  const avisar = crearAvisador(() => deshacer());
  const vals = () => Object.fromEntries(Object.entries(VAR).map(([k, d]) => [k, d.val]));
  const copia = o => JSON.parse(JSON.stringify(o));
  const DIB = () => ESC.dibujo || [];
  // Escena propia (termodinamica-montaje.js) e instrumentos colocados
  /** @type {any} */ let MONTAJE = null;
  /** @type {any[]} */ let INSTR = [];
  let herramienta = null, arrastre = null, cursorPx = null;
  const ULT = { zonas: [] };
  const NOMBRE_HERR = { cuerpo: 'Cuerpo', calorimetro: 'Calorímetro', calentador: 'Calentador', bano: 'Baño térmico', termometro: 'Termómetro' };
  const PISTA_HERR = { cuerpo: 'clic donde va (dentro del agua, se sumerge)', calorimetro: 'clic donde va', calentador: 'clic sobre un cuerpo', bano: 'clic donde va', termometro: 'clic sobre el cuerpo que quieres medir' };
  const esInstr = x => /^i\d+$/.test(String(x));
  const esAuto = () => !!(E && E.vehiculo);

  // ---------------------------------------------------------------------
  // Simulación
  // ---------------------------------------------------------------------
  function simular() {
    if (!guionPropio) guion = guionDe(ESC, vals());
    E = ESC.construir(vals());
    if (!E) { SIM = null; FILAS = []; return; }
    SIM = simularEscena(ESC, vals(), guion);
    FILAS = guionPropio ? [] : examenDe(ESC, SIM, vals());
    // Posición del vehículo: integral de su rapidez
    POS = [0];
    for (let i = 1; i < SIM.muestras.length; i++) POS.push(POS[i - 1] + 0.5 * (SIM.muestras[i - 1].v + SIM.muestras[i].v) * SIM.muestra);
    // Escala de las flechas de calor: la mayor de la corrida mide 46 px
    let fmax = 1e-9; for (const s of SIM.muestras) for (const f of s.flujos) fmax = Math.max(fmax, Math.abs(f));
    kFlujo = 46 / fmax;
  }
  const est = t => estadoCalor(SIM, t);
  const pos = t => { const x = Math.max(0, Math.min(POS.length - 1, t / SIM.muestra)), i = Math.min(POS.length - 2, Math.floor(x)); return POS.length > 1 ? POS[i] + (POS[i + 1] - POS[i]) * (x - i) : 0; };
  /** Configuración (contacto, calentador, motor, freno) en el instante t según el guion. */
  function banderas(t) {
    const b = { contactos: (E.contactos || []).map(c => c.activo !== false), calentadores: (E.calentadores || []).map(c => !!c.activo), acelera: false, frena: false };
    for (const a of [...guion].sort((p, q) => p.t - q.t)) {
      if (a.t > t + 1e-9) break;
      if (a.tipo === 'contacto') b.contactos[a.i] = !!a.valor;
      else if (a.tipo === 'calentador') b.calentadores[a.i] = !!a.valor;
      else if (a.tipo === 'acelerar') { b.acelera = !!a.valor; if (a.valor) b.frena = false; }
      else if (a.tipo === 'frenar') { b.frena = !!a.valor; if (a.valor) b.acelera = false; }
    }
    for (const e of SIM.eventos) if (e.t <= t + 1e-9) { if (e.tipo === 'crucero') b.acelera = false; if (e.tipo === 'parada') b.frena = false; }
    return b;
  }
  /** Instante en que se activa el contacto de un cuerpo que «cae» al agua. */
  const tContacto = i => { const k = (E.contactos || []).findIndex(c => (c.a === i || c.b === i) && c.activo === false); if (k < 0) return 0; const a = [...guion].sort((p, q) => p.t - q.t).find(x => x.tipo === 'contacto' && x.i === k && x.valor); return a ? a.t : Infinity; };

  // ---------------------------------------------------------------------
  // Dibujo
  // ---------------------------------------------------------------------
  function caja() {
    if (esAuto()) return { x0: -3.4, x1: 3.4, y0: -0.6, y1: 2.6 };
    const d = DIB(); let x0 = Infinity, x1 = -Infinity, y1 = 0;
    d.forEach(q => { x0 = Math.min(x0, q.x - q.w / 2 - (q.separado || 0)); x1 = Math.max(x1, q.x + q.w / 2 + (q.separado || 0)); y1 = Math.max(y1, q.y + q.h + (q.cae ? 0.12 : 0)); });
    if (MONTAJE && MONTAJE.bano) { const r = rectCalor(MONTAJE.bano); x0 = Math.min(x0, r.x0); x1 = Math.max(x1, r.x1); y1 = Math.max(y1, r.y1); }
    if (MONTAJE && MONTAJE.calentadores.length) x0 -= 0.14;   // sitio para la etiqueta Φ de un calentador en un vaso
    if (!Number.isFinite(x0)) return { x0: -0.4, x1: 0.4, y0: -0.06, y1: 0.4 };
    return { x0: x0 - 0.08, x1: x1 + 0.24, y0: -0.06, y1: y1 + 0.08 };
  }
  function encuadrar() { tz.vista.encuadrar(caja(), { x: 0, y: 40, w: tz.w, h: tz.h - 84 }, 36); }
  /** Rectángulo de dibujo del cuerpo i en t (con la caída y el desplazamiento animados). */
  function rect(i, t) {
    const q = DIB()[i]; if (!q) return null;
    let x = q.x, y = q.y;
    if (q.cae) {
      const te = tContacto(i), agua = DIB().find(o => o.forma === 'agua'), ySobre = agua ? agua.y + agua.h + 0.03 : y + 0.1;
      const s = Math.max(0, Math.min(1, (t - te) / 0.6));
      y = ySobre + (y - ySobre) * s * s;
    }
    if (q.separado) { const te = tContacto(i); const s = Math.max(0, Math.min(1, (t - te) / 0.5)); x = q.x + q.separado * (1 - s); }
    return { x0: x - q.w / 2, x1: x + q.w / 2, y0: y, y1: y + q.h, cx: x, cy: y + q.h / 2 };
  }

  let t = 0;
  function dibujar() {
    ULT.zonas = [];
    if (!SIM) { dibujarVacio(); edicion(); return; }
    if (esAuto()) { dibujarAuto(); dibujarTermometros(); return; }
    const v = tz.vista, s = est(t), b = banderas(t), d = DIB();
    tz.limpiar(); tz.cuadricula();
    const cj = caja();
    tz.superficie([[cj.x0 + 0.02, 0], [cj.x1 - 0.02, 0]]);
    // Baño (escena propia): depósito de líquido a temperatura fija
    if (MONTAJE && MONTAJE.bano) {
      const r = rectCalor(MONTAJE.bano), [X, Y, W, H] = tz.rectPx(r.x0, r.y0, r.x1, r.y1);
      tz.fluidoPx(X + 1, X + W - 1, Y + H * 0.12, Y + H - 1);
      tz.superficie([[r.x0, r.y1], [r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1]], { grueso: hover === 'bano' });
      tz.compuesto([{ t: 'Baño  ', f: 'ui', tam: 11.5, color: 'texto-3' }, { t: 'T', f: 'sim', tam: 13, color: 'termico' }, { t: 'b', f: 'simRecta', tam: 9, dy: 3, color: 'termico' }, { t: ' = ' + cantidad(MONTAJE.bano.T, '°C', 3), f: 'num', tam: 11.5, color: 'texto-2' }], X + W, Y - 8, { alinear: 'right' });
      if (sel === 'bano') tz.seleccionCaja(X, Y, W, H);
      ULT.bano = [X, Y, W, H];
    } else ULT.bano = null;
    // Orden de capas: vaso (geometría), agua (medio), cuerpos (materia)
    const capa = f => ({ vaso: 0, agua: 1 })[f] ?? 2;
    const orden = d.map((q, i) => i).sort((a, c) => capa(d[a].forma) - capa(d[c].forma));
    const cajas = [];
    for (const i of orden) {
      const q = d[i], r = rect(i, t), grueso = hover === 'c' + i;
      if (q.forma === 'vaso') { tz.termoVaso(r.x0, r.y0, r.x1, r.y1, { grueso }); cajas[i] = tz.rectPx(r.x0, r.y0, r.x1, r.y1); continue; }
      if (q.forma === 'agua') {
        const [X, Y, W, H] = tz.rectPx(r.x0, r.y0, r.x1, r.y1); tz.fluidoPx(X, X + W, Y, Y + H); cajas[i] = [X, Y, W, H];
        if (grueso) tz.lineaPx([[X, Y], [X + W, Y]], { grosor: 2.5 });
        continue;
      }
      // Hilo del que cuelga la pieza antes de caer
      if (q.cae && t < tContacto(i)) tz.linea([[r.cx, r.y1], [r.cx, r.y1 + 0.08]], { color: 'texto-2', grosor: 1.5 });
      if (q.forma === 'hielo') {
        // El hielo que flota se hace más pequeño al fundirse; fundido del todo ya es agua
        const queda = 1 - s.x[i];
        cajas[i] = queda > 0.002 ? tz.termoCuerpo(r.x0, r.y1 - (r.y1 - r.y0) * queda, r.x1, r.y1, { grueso }) : tz.rectPx(r.x0, r.y1 - 0.01, r.x1, r.y1);
        continue;
      }
      cajas[i] = tz.termoCuerpo(r.x0, r.y0, r.x1, r.y1, { grueso, nombre: E.cuerpos[i].nombre });
    }
    // Calentadores en su cuerpo
    (E.calentadores || []).forEach((c, k) => {
      const r = rect(c.cuerpo, t); if (!r) return;
      // En un líquido de una escena propia, el calentador va a un lado del fondo (en medio suele haber un cuerpo)
      const hw = ESC.propio ? Math.min(0.03, (r.x1 - r.x0) * 0.12) : Math.min(0.05, (r.x1 - r.x0) * 0.35), hh = Math.min(0.03, (r.y1 - r.y0) * 0.45);
      const xh = ESC.propio && DIB()[c.cuerpo].forma === 'agua' ? r.x0 + hw + 0.01 : r.cx, ah = Math.min(0.03, hw * 0.6);
      const bb = tz.calentador(xh - hw, xh + hw, r.y0 + hh, r.y0, { grueso: hover === 'h' + k });
      if (bb) { ULT.zonas.push({ id: 'h' + k, r: bb }); if (sel === 'h' + k) tz.seleccionCaja(...bb); }
      if (b.calentadores[k] && capas.flujos) {
        const Y = v.Y(r.y0 + hh) - 8;
        for (const dx of [-ah, 0, ah]) tz.flechaCalor(v.X(xh + dx), Y, v.X(xh + dx), Y - 26);
        // Escena propia: la etiqueta fuera del vaso que contiene el líquido (a su izquierda), o encima de las flechas
        const q = DIB()[c.cuerpo], vaso = q.forma === 'agua' ? DIB().map((o2, j) => (o2.forma === 'vaso' ? rect(j, t) : null)).find(o2 => o2 && o2.x0 <= r.x0 + 1e-9 && o2.x1 >= r.x1 - 1e-9) : null;
        if (!ESC.propio) etiquetaPhi(v.X(xh + 0.06), Y - 18, 'cal', c.P, 'left');
        else if (vaso) { const Xv = v.X(vaso.x0) - tz.anchoPared('adiabatica') - 8; tz.lineaPx([[Xv + 2, Y - 13], [v.X(xh - hw) - 3, Y - 13]], { color: 'linea-fuerte', grosor: 1 }); etiquetaPhi(Xv, Y - 9, 'cal', c.P, 'right'); }
        else etiquetaPhi(v.X(xh), Y - 34, 'cal', c.P, 'center');
      }
    });
    // Flujos de calor por los contactos (del cuerpo caliente al frío)
    if (capas.flujos) (E.contactos || []).forEach((c, k) => {
      const f = s.flujos[k]; if (!b.contactos[k] || Math.abs(f) * kFlujo < 4) return;
      const de = f > 0 ? c.a : c.b, a = f > 0 ? c.b : c.a, R1 = rect(de, t), R2 = rect(a, t);
      if (!R1 || !R2) return;
      const L = Math.max(10, Math.abs(f) * kFlujo);
      const dentro = (p, q) => p.x0 >= q.x0 - 1e-9 && p.x1 <= q.x1 + 1e-9 && p.y0 >= q.y0 - 1e-9;
      let x1, y1, x2, y2;
      if (dentro(R1, R2) || dentro(R2, R1)) {
        // Uno dentro del otro: la flecha cruza el borde derecho del interior
        const ini = dentro(R1, R2) ? R1 : R2, sentido = dentro(R1, R2) ? 1 : -1;
        const X = v.X(ini.x1) + (sentido > 0 ? 4 : 4 + L), Y = v.Y(ini.y0 + Math.min(0.03, (ini.y1 - ini.y0) / 2));
        x1 = X; y1 = Y; x2 = X + sentido * L; y2 = Y;
        if (sentido < 0) { x1 = v.X(ini.x1) + 4 + L; x2 = v.X(ini.x1) + 4; }
      } else {
        const dir = R2.cx > R1.cx ? 1 : -1, X = v.X(dir > 0 ? R1.x1 : R1.x0), Y = v.Y((R1.cy + R2.cy) / 2);
        x1 = X - dir * L / 2; y1 = Y; x2 = X + dir * L / 2; y2 = Y;
      }
      tz.flechaCalor(x1, y1, x2, y2);
      etiquetaPhi(Math.min(x1, x2), y1 - 10, corto(de), Math.abs(f), 'left');
    });
    // Termómetros antes que las etiquetas: el halo de cada texto tapa las líneas guía que lo cruzan
    dibujarTermometros();
    // Temperatura de cada cuerpo (el vaso, a su lado)
    if (capas.temperaturas) d.forEach((q, i) => {
      if (INSTR.some(o => o.en === 'c' + i)) return;   // ya lo dice su termómetro
      const r = rect(i, t), [X, Y, W, H] = tz.rectPx(r.x0, r.y0, r.x1, r.y1);
      let x, y, al = 'left';
      if (q.forma === 'vaso') { x = X + W + 14; y = Y + H * 0.45; }
      else if (q.forma === 'agua') { x = X + 8; y = Y + H - 9; }
      else {
        x = X + W / 2; y = Y - 8; al = 'center';
        // Escena propia: un cuerpo sumergido lleva su temperatura encima de la superficie del líquido (no entre las flechas del calentador)
        const liq = ESC.propio ? d.map((o2, j) => (o2.forma === 'agua' && j !== i ? rect(j, t) : null)).find(o2 => o2 && r.x0 >= o2.x0 - 1e-9 && r.x1 <= o2.x1 + 1e-9 && r.y0 >= o2.y0 - 1e-9 && r.y1 <= o2.y1 + 1e-9) : null;
        if (liq) y = v.Y(liq.y1) - 8;
      }
      const segs = [{ t: 'T', f: 'sim', tam: 13, color: 'termico' }, { t: ' = ' + gradC(s.T[i]), f: 'num', tam: 11.5, color: 'texto-2' }];
      if (q.forma === 'vaso') segs.unshift({ t: E.cuerpos[i].nombre + '  ', f: 'ui', tam: 11.5, color: 'texto-3' });
      if (q.forma === 'agua') segs.unshift({ t: E.cuerpos[i].nombre + '  ', f: 'ui', tam: 11.5, color: 'texto-3' });
      if (q.forma === 'hielo') segs.unshift({ t: (s.x[i] > 0.998 ? 'Agua del hielo' : s.x[i] > 0.001 ? `Hielo, ${fmt(s.x[i] * 100, 3)} % fundido` : 'Hielo') + '  ', f: 'ui', tam: 11.5, color: 'texto-3' });
      if (q.forma === 'hielo') { x = X - 12; y = Y + H / 2 + 4; al = 'right'; }
      tz.compuesto(segs, x, y, { alinear: al });
    });
    eventoReciente();
    seleccion(cajas);
    edicion();
  }
  function dibujarVacio() {
    tz.limpiar(); tz.cuadricula();
    tz.superficie([[tz.vista.mx(40), 0], [tz.vista.mx(tz.w - 40), 0]]);
    const X = tz.w / 2, Y = tz.h / 2 - 30;
    tz.texto('Escena vacía', X, Y, { tam: 14, color: 'texto-2', alinear: 'center', halo: true });
    tz.texto('Coloca cuerpos, un calorímetro o un baño con la paleta de objetos.', X, Y + 22, { tam: 12, color: 'texto-3', alinear: 'center', halo: true });
  }
  /** Termómetros: sonda en su cuerpo, termómetro al lado y ficha con la temperatura. */
  function dibujarTermometros() {
    if (!SIM || !capas.temperaturas && !INSTR.length) return;
    const v = tz.vista, s = est(t);
    for (const o of INSTR) {
      const i = /^c(\d+)$/.test(o.en || '') ? +o.en.slice(1) : -1, r = i >= 0 ? rect(i, t) : null;
      if (!r) continue;
      const [X, Y] = v.P([r.x0 + o.u * (r.x1 - r.x0), r.y0 + o.w * (r.y1 - r.y0)]), lin = [[{ t: `Termómetro · ${E.cuerpos[i].nombre}`, f: 'ui', tam: 11.5 }], [{ t: 'T', f: 'sim', tam: 13, color: 'termico' }, { t: ' = ' + gradC(s.T[i]), f: 'num', tam: 11.5 }]];
      tz.ctx.save(); let wf = 0; for (const segs of lin) { let w = 0; for (const sg of segs) { tz.ctx.font = tz._fuente(sg.f, sg.tam); w += tz.ctx.measureText(sg.t).width; } wf = Math.max(wf, w + 16); } tz.ctx.restore();
      // La ficha va donde iría la etiqueta de temperatura del cuerpo (que ya no se escribe):
      // encima de un bloque, encima del vaso para el agua de dentro, a la derecha de un vaso
      const forma = DIB()[i].forma, [Xr, Yr, Wr, Hr] = tz.rectPx(r.x0, r.y0, r.x1, r.y1);
      const vaso = forma === 'agua' ? DIB().map((q, j) => (q.forma === 'vaso' ? rect(j, t) : null)).find(q => q && q.x0 <= r.x0 + 1e-9 && q.x1 >= r.x1 - 1e-9) : null;
      let fx, fy;
      if (forma === 'vaso') { fx = Xr + Wr + 40; fy = Yr + Hr * 0.45 - 20; }
      else if (vaso) { const [Xv, Yv] = tz.rectPx(vaso.x0, vaso.y0, vaso.x1, vaso.y1); fx = Xv + 18; fy = Yv - 52; }
      else { fx = Xr + Wr / 2 - (wf - 18) / 2; fy = Yr - 48; }
      fx = Math.max(30, Math.min(tz.w - 8 - wf, fx));
      const gx = fx - 12, gy = fy + 36;
      tz.lineaPx([[X, Y], [gx + (X > gx ? 4 : -4), gy - 6]], { color: 'linea-fuerte', grosor: 1 }); tz.sondaTermica(X, Y);
      tz.termometro(gx, gy, (C(s.T[i]) + 20) / 140, { grueso: hover === o.id });
      const f = tz.ficha(fx, fy, lin);
      if (sel === o.id) { tz.seleccionCirculo(X, Y, 7); tz.seleccionCaja(gx - 8, fy, f.w + 20, 40); }
      ULT.zonas.push({ id: o.id, r: [X - 6, Y - 6, 12, 12] }, { id: o.id, r: [gx - 10, fy, f.w + 22, 40] });
    }
  }
  /** Capa de edición: cuerpo que se arrastra y pista de la herramienta. */
  function edicion() {
    const v = tz.vista;
    if (arrastre && arrastre.movido && arrastre.ghost) { const [x0, y0, x1, y1] = arrastre.ghost, [X, Y, W, H] = tz.rectPx(x0, y0, x1, y1); tz.lineaPx([[X, Y], [X + W, Y], [X + W, Y + H], [X, Y + H], [X, Y]], { color: 'texto-2', grosor: 1.5, patron: 'previsto' }); }
    if (herramienta && cursorPx) tz.ficha(cursorPx[0] + 14, cursorPx[1] + 14, [[{ t: `${NOMBRE_HERR[herramienta]}: ${PISTA_HERR[herramienta]}`, f: 'ui', tam: 11.5 }]]);
    void v;
  }
  function eventoReciente() {
    const ev = SIM.eventos.filter(e => e.t <= t + 1e-9 && t - e.t < 2.5).pop();
    if (!ev) return;
    const v = tz.vista;
    let p = [caja().x0 + 0.06, caja().y1 - 0.04];
    if (ev.tipo === 'contacto') { const c = E.contactos[ev.i], r = rect(c.b, t); if (r) p = [r.cx, r.y1]; }
    else if (ev.tipo === 'calentador') { const r = rect(E.calentadores[ev.i].cuerpo, t); if (r) p = [r.cx, r.y0 + 0.03]; }
    if (esAuto()) p = [pos(t) - 0.3, 1.5];
    const [ax, ay] = tz.eventoAnillo(p);
    const lado = esAuto() || ax > tz.w * 0.6 ? -1 : 1;
    tz.ctx.save(); tz.ctx.font = Volta.FUENTE.ui(11.5); const w = tz.ctx.measureText(ev.nombre).width + 16; tz.ctx.restore();
    tz.ficha(lado > 0 ? ax + 16 : ax - 16 - w, ay - 46, [[{ t: ev.nombre, f: 'ui', tam: 11.5 }], [{ t: 't', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(ev.t, 's', 4), f: 'num', tam: 11.5 }]], { ancla: [ax + lado * 5, ay - 5] });
    void v;
  }
  function seleccion(cajas) {
    if (/^c\d+$/.test(sel) && cajas[+sel.slice(1)]) { const [X, Y, W, H] = cajas[+sel.slice(1)]; tz.seleccionCaja(X, Y, W, H); }
  }

  // Automóvil: la cámara lo sigue y la cuadrícula del suelo muestra el movimiento
  function dibujarAuto() {
    const v = tz.vista, s = est(t), b = banderas(t), x = pos(t);
    if (!vistaTocada) { const cj = caja(); tz.vista.encuadrar({ ...cj, x0: x + cj.x0, x1: x + cj.x1 }, { x: 0, y: 40, w: tz.w, h: tz.h - 84 }, 36); }
    tz.limpiar(); tz.cuadricula();
    tz.superficie([[x - 40, 0], [x + 40, 0]]);
    // Marcas cada 10 m en el suelo
    for (let m = Math.ceil((x - 40) / 10) * 10; m <= x + 40; m += 10) { const X = v.X(m), Y = v.Y(0); tz.texto(`${m} m`, X, Y + 24, { fuente: 'num', tam: 11, color: 'texto-3', alinear: 'center', halo: true }); }
    // Carrocería, ruedas, motor y frenos
    const carro = [[x - 2, 0.42], [x + 2, 0.42], [x + 2, 0.95], [x + 1.2, 1.05], [x + 0.6, 1.5], [x - 1.2, 1.5], [x - 1.7, 1.05], [x - 2, 1.0]];
    tz.cuerpo(carro, { grueso: hover === 'vehiculo' });
    const rueda = (cx, sel2) => { const [X, Y] = v.P([cx, 0.35]), r = 0.35 * v.escala, c = tz.ctx; c.save(); c.fillStyle = tz.t.campo; c.strokeStyle = tz.t.tinta; c.lineWidth = 2 + (hover === sel2 ? 0.5 : 0); c.beginPath(); c.arc(X, Y, r, 0, 2 * Math.PI); c.fill(); c.stroke(); c.restore(); return [X, Y, r]; };
    rueda(x + 1.25, 'vehiculo');
    const [Xd, Yd, rd] = rueda(x - 1.25, 'c1');
    // Disco de freno en el buje trasero
    const c = tz.ctx; c.save(); c.strokeStyle = tz.t.tinta; c.lineWidth = 1.5; c.beginPath(); c.arc(Xd, Yd, rd * 0.55, 0, 2 * Math.PI); c.stroke(); c.restore();
    const motor = tz.termoCuerpo(x + 0.95, 0.55, x + 1.85, 0.92, { grueso: hover === 'c0', nombre: 'Motor' });
    // Velocidad
    if (s.v > 0.05) tz.vector([x, 1.85], [s.v, 0], { familia: 'movimiento', escalaPx: 4, simbolo: 'v', valor: s.v, unidad: 'm/s' });
    // Calor del motor y de los frenos
    // Calor que sale del motor (por delante) y de los frenos (por detrás)
    if (capas.flujos && b.acelera) { const X = v.X(x + 2) + 4, Y = motor[1] + motor[3] / 2; tz.flechaCalor(X, Y, X + 30, Y); etiquetaPhi(X, Y - 10, 'motor', E.vehiculo.P * (1 / E.vehiculo.eta - 1), 'left'); }
    if (capas.flujos && b.frena && s.v > 0) { const X = v.X(x - 2) - 4; tz.flechaCalor(X, Yd, X - 30, Yd); etiquetaPhi(X, Yd - 10, 'frenos', E.vehiculo.F * s.v, 'right'); }
    if (capas.temperaturas) {
      const [Xm, Ym] = v.P([x + 1.25, 0.35]);
      tz.compuesto([{ t: 'Motor  ', f: 'ui', tam: 11.5, color: 'texto-3' }, { t: 'T', f: 'sim', tam: 13, color: 'termico' }, { t: ' = ' + gradC(s.T[0]), f: 'num', tam: 11.5, color: 'texto-2' }], Xm, Ym + rd + 46, { alinear: 'center' });
      tz.compuesto([{ t: 'Frenos  ', f: 'ui', tam: 11.5, color: 'texto-3' }, { t: 'T', f: 'sim', tam: 13, color: 'termico' }, { t: ' = ' + gradC(s.T[1]), f: 'num', tam: 11.5, color: 'texto-2' }], Xd, Yd + rd + 46, { alinear: 'center' });
    }
    // Energías en una ficha: química → cinética → calor
    tz.ficha(16, 54, [[{ t: 'Energía del recorrido', f: 'ui', tam: 11.5 }],
      [{ t: 'E', f: 'sim', tam: 13 }, { t: 'química', f: 'simRecta', tam: 9, dy: 3 }, { t: ' = ' + kJ(s.Equim), f: 'num', tam: 11.5 }],
      [{ t: 'E', f: 'sim', tam: 13, color: 'movimiento' }, { t: 'k', f: 'simRecta', tam: 9, dy: 3, color: 'movimiento' }, { t: ' = ' + kJ(s.Ek), f: 'num', tam: 11.5 }],
      [{ t: 'Q', f: 'sim', tam: 13, color: 'termico' }, { t: 'motor', f: 'simRecta', tam: 9, dy: 3, color: 'termico' }, { t: ' = ' + kJ(s.Qmotor), f: 'num', tam: 11.5 }],
      [{ t: 'Q', f: 'sim', tam: 13, color: 'termico' }, { t: 'frenos', f: 'simRecta', tam: 9, dy: 3, color: 'termico' }, { t: ' = ' + kJ(s.Qfrenos), f: 'num', tam: 11.5 }]]);
    eventoReciente();
    if (sel === 'c0') tz.seleccionCaja(...motor);
    else if (sel === 'c1') tz.seleccionCirculo(Xd, Yd, rd + 5);
    else if (sel === 'vehiculo') { const [X, Y, W, H] = tz.rectPx(x - 2, 0, x + 2, 1.5); tz.seleccionCaja(X, Y, W, H); }
  }

  function objetoEn(X, Y) {
    for (let q = ULT.zonas.length - 1; q >= 0; q--) { const z = ULT.zonas[q]; if (X >= z.r[0] && X <= z.r[0] + z.r[2] && Y >= z.r[1] && Y <= z.r[1] + z.r[3]) return z.id; }
    if (!SIM) return ULT.bano && X >= ULT.bano[0] && X <= ULT.bano[0] + ULT.bano[2] && Y >= ULT.bano[1] && Y <= ULT.bano[1] + ULT.bano[3] ? 'bano' : null;
    const v = tz.vista, w = [v.mx(X), v.my(Y)];
    if (esAuto()) {
      const x = pos(t);
      if (w[0] >= x + 0.95 && w[0] <= x + 1.85 && w[1] >= 0.55 && w[1] <= 0.92) return 'c0';
      if (Math.hypot(w[0] - (x - 1.25), w[1] - 0.35) < 0.36) return 'c1';
      if (w[0] >= x - 2 && w[0] <= x + 2 && w[1] >= 0 && w[1] <= 1.5) return 'vehiculo';
      return null;
    }
    // Primero lo pequeño (piezas), después el agua y el vaso
    const d = DIB(), orden = d.map((q, i) => i).sort((a, c) => (d[a].w * d[a].h) - (d[c].w * d[c].h));
    for (const i of orden) { const r = rect(i, t); if (w[0] >= r.x0 - 0.01 && w[0] <= r.x1 + 0.01 && w[1] >= r.y0 - 0.01 && w[1] <= r.y1 + 0.01) return 'c' + i; }
    if (ULT.bano && X >= ULT.bano[0] && X <= ULT.bano[0] + ULT.bano[2] && Y >= ULT.bano[1] && Y <= ULT.bano[1] + ULT.bano[3]) return 'bano';
    return null;
  }

  // ---------------------------------------------------------------------
  // Inspector, acciones, lecturas
  // ---------------------------------------------------------------------
  const fila = (etq, control) => `<div class="fila"><span class="etq">${etq}</span>${control}</div>`;
  const campoFijo = (val, u, ayuda) => `<div class="campo"${ayuda ? ` data-ayuda="${ayuda}"` : ''}><input value="${val}" readonly tabindex="-1"><span class="u">${u}</span></div>`;
  const icoDe = i => { const f = DIB()[i]?.forma; return f === 'vaso' ? 'o-calorimetro' : f === 'agua' ? 'o-columna-liquido' : esAuto() && i === 0 ? 'o-motor' : 'o-cuerpo-termico'; };
  /** Pieza del montaje para una selección de la pantalla (c0 → cuerpo, h0 → calentador). */
  function selMontaje(sx) {
    if (!MONTAJE) return null;
    if (sx === 'escena' || sx === 'bano') return sx;
    if (/^c\d+$/.test(sx)) return (MONTAJE.cuerpos[+sx.slice(1)] || {}).id || null;
    if (/^h\d+$/.test(sx)) return (MONTAJE.calentadores[+sx.slice(1)] || {}).id || null;
    return null;
  }
  function selPantalla(ms) {
    const i = MONTAJE.cuerpos.findIndex(c => c.id === ms); if (i >= 0) return 'c' + i;
    const k = MONTAJE.calentadores.findIndex(h => h.id === ms); if (k >= 0) return 'h' + k;
    return ms;
  }
  const AYUDA = {
    escena: 'Escena propia: coloca cuerpos, un calorímetro, calentadores y un baño con la paleta. Dos cuerpos que se tocan (o uno dentro de otro) intercambian calor; arrástralos para juntarlos o separarlos.',
    cuerpo: 'Arrástralo: si toca otro cuerpo (o queda dentro del agua) intercambian calor. Suelto cerca de otro, se apoya en él.',
    vaso: 'El vaso del calorímetro está aislado por fuera: solo intercambia calor con lo que tiene dentro. Al arrastrarlo se lleva lo de dentro.',
    bano: 'Cada cuerpo que toca el baño (o está dentro) intercambia calor con él; el baño no cambia de temperatura.',
    calentador: 'Encendido, da su potencia al cuerpo. Se enciende y se apaga en Acciones.',
  };
  function inspector() {
    let ico = E && E.vehiculo ? 'o-motor' : 'o-calorimetro', nombre = ESC.titulo, estado = '', html = '', enlazar = null;
    const ins = esInstr(sel) ? INSTR.find(o => o.id === sel) : null;
    const ms = ESC.propio ? selMontaje(sel) : null, p = ms ? piezaCalor(MONTAJE, ms) : null;
    if (ins) {
      const i = +String(ins.en).slice(1);
      ico = 'n-termometro'; nombre = 'Termómetro'; estado = E && E.cuerpos[i] ? `Mide ${E.cuerpos[i].nombre.toLowerCase()}` : '';
      html = '<p class="ayuda-fila" style="margin:2px 0 8px">Arrástralo a otro cuerpo para medir su temperatura.</p>' + botonQuitar();
    } else if (p) {
      ico = p.ico; nombre = p.nombre; estado = p.clase === 'escena' ? `${MONTAJE.cuerpos.length} cuerpos` : p.clase === 'calentador' ? 'Resistencia' : p.clase === 'bano' ? 'Temperatura fija' : p.clase === 'vaso' ? 'Calorímetro aislado' : 'Cuerpo con capacidad calorífica';
      html = (AYUDA[p.clase] ? `<p class="ayuda-fila" style="margin:2px 0 8px">${AYUDA[p.clase]}</p>` : '') + filasParametros(PARAMS_CALOR[p.clase], p.holder) + (p.clase !== 'escena' ? botonQuitar() : '');
      enlazar = (k, v2) => cambiarMontaje(m => ({ montaje: ajustarCalor(m, ms, k, v2), sel: ms }), null, { encuadrar: ['w', 'h'].includes(k) });
      if (p.clase !== 'escena') { $('#insp-ico').setAttribute('href', '#' + ico); }
    } else if (ESC.propio) {
      sel = 'escena'; inspector(); return;
    } else if (/^c\d+$/.test(sel) && E.cuerpos[+sel.slice(1)]) {
      const i = +sel.slice(1), cpo = E.cuerpos[i];
      ico = icoDe(i); nombre = cpo.nombre; estado = cpo.fusion ? 'Cuerpo con cambio de fase' : 'Cuerpo con capacidad calorífica';
      html = fila('Masa', campoFijo(fmt(cpo.m * 1e3, 4), 'g')) + fila('Calor específico', campoFijo(fmt(cpo.c, 4), 'J/(kg·K)'))
        + fila('Capacidad', campoFijo(fmt(cpo.m * cpo.c, 4), 'J/K', 'm·c|Heat capacity')) + fila('Temperatura inicial', campoFijo(fmt(C(cpo.T), 4), '°C'))
        + (cpo.fusion ? fila('Fusión', campoFijo(`${fmt(C(cpo.fusion.Tf), 3)} °C · L = ${fmt(cpo.fusion.L / 1e3, 3)} kJ/kg`, '')) : '');
    } else if (sel === 'vehiculo' && E.vehiculo) {
      const q = E.vehiculo; ico = 'o-motor'; nombre = 'Automóvil'; estado = 'Motor y frenos';
      html = fila('Masa', campoFijo(fmt(q.m, 4), 'kg')) + fila('Potencia', campoFijo(fmt(q.P / 1e3, 4), 'kW')) + fila('Rendimiento', campoFijo(fmt(q.eta * 100, 3), '%'))
        + fila('Frenado', campoFijo(fmt(q.F, 4), 'N')) + fila('Crucero', campoFijo(fmt(q.vmax, 3), 'm/s'));
    } else {
      sel = 'escena'; estado = chipDe(ESC);
      html = (ESC.nota ? `<p class="ayuda-fila" style="margin:2px 0 8px">${ESC.nota}</p>` : '') + fila('Cuerpos', campoFijo(String(E.cuerpos.length), ''))
        + fila('Exterior', campoFijo(E.ambiente ? `Aire a ${fmt(C(E.ambiente.T), 3)} °C` : 'Aislado', ''));
    }
    $('#insp-ico').setAttribute('href', '#' + ico);
    $('#insp-nombre').textContent = nombre; $('#insp-estado').textContent = estado;
    $('#propiedades').innerHTML = html;
    if (enlazar) enlazarParametros($('#propiedades'), enlazar);
    const bq = $('#b-quitar-pieza'); if (bq) bq.addEventListener('click', quitarSeleccion);
    arbol(); acciones();
  }
  function arbol() {
    const nodo = (s, ico, nom, dato) => `<div class="nodo" data-sel="${s}" aria-selected="${sel === s}"><svg class="ico"><use href="#${ico}"/></svg><span class="nombre">${nom}</span><span class="dato">${dato}</span></div>`;
    if (!SIM) { $('#arbol').innerHTML = nodo('escena', 'i-escena', 'Escena propia', 'vacía') + (MONTAJE && MONTAJE.bano ? nodo('bano', 'o-bano-termico', 'Baño térmico', cantidad(MONTAJE.bano.T, '°C', 3)) : ''); return; }
    const s = est(t);
    let h = nodo('escena', 'i-escena', ESC.propio ? 'Escena propia' : 'Escena', E.ambiente ? (ESC.propio ? 'con baño' : 'con aire') : 'aislada');
    E.cuerpos.forEach((c, i) => { h += nodo('c' + i, icoDe(i), c.nombre, gradC(s.T[i], 3)); });
    if (E.vehiculo) h += nodo('vehiculo', 'o-motor', 'Automóvil', cantidad(s.v, 'm/s', 3));
    if (ESC.propio) { MONTAJE.calentadores.forEach((q, k) => { h += nodo('h' + k, 'o-calentador', `Calentador de ${(MONTAJE.cuerpos.find(c => c.id === q.en) || { nombre: '?' }).nombre.toLowerCase()}`, cantidad(q.P, 'W', 3)); }); if (MONTAJE.bano) h += nodo('bano', 'o-bano-termico', 'Baño térmico', cantidad(MONTAJE.bano.T, '°C', 3)); }
    for (const o of INSTR) { const i = +String(o.en).slice(1); h += nodo(o.id, 'n-termometro', 'Termómetro', E.cuerpos[i] ? gradC(s.T[i], 3) : ''); }
    $('#arbol').innerHTML = h;
  }
  $('#arbol').addEventListener('click', ev => { const n = ev.target instanceof Element ? ev.target.closest('.nodo') : null; if (n) seleccionar(n.dataset.sel); });
  function seleccionar(s) { sel = s; inspector(); lecturas(); dibujar(); }

  function acciones() {
    if (!SIM) { $('#grupo-acciones').hidden = true; return; }
    const b = banderas(t), filas = [];
    (E.contactos || []).forEach((c, k) => {
      const a = E.cuerpos[c.a].nombre, d = E.cuerpos[c.b].nombre;
      filas.push(fila('Contacto', `<button class="btn btn-secundario btn-compacto" data-acc="contacto" data-i="${k}" data-ayuda="${a} y ${d}|Thermal contact"><svg class="ico"><use href="#o-cuerpo-termico"/></svg><span>${b.contactos[k] ? 'Separar' : 'Juntar'} ${a.split(' ')[0].toLowerCase()} y ${d.split(' ')[0].toLowerCase()}</span></button>`));
    });
    (E.calentadores || []).forEach((c, k) => {
      filas.push(fila('Calentador', `<label class="conmutador" data-ayuda="Encender o apagar en este instante|Heater on/off"><input type="checkbox" class="interruptor" data-acc="calentador" data-i="${k}"${b.calentadores[k] ? ' checked' : ''}><span>${b.calentadores[k] ? 'Encendido' : 'Apagado'}</span></label>`));
    });
    if (E.vehiculo) {
      filas.push(fila('Motor', `<button class="btn btn-secundario btn-compacto" data-acc="acelerar" data-ayuda="El motor da su potencia hasta la rapidez de crucero|Accelerate"><svg class="ico"><use href="#o-motor"/></svg><span>${b.acelera ? 'Dejar de acelerar' : 'Acelerar'}</span></button>`));
      filas.push(fila('Frenos', `<button class="btn btn-secundario btn-compacto" data-acc="frenar" data-ayuda="Frena con la fuerza de frenado hasta pararse|Brake"><svg class="ico"><use href="#i-pausar"/></svg><span>${b.frena ? 'Soltar el freno' : 'Frenar'}</span></button>`));
    }
    $('#grupo-acciones').hidden = !filas.length;
    $('#acc-titulo').textContent = `Acciones en t = ${fmt(t, 4)} s`;
    $('#acciones').innerHTML = filas.join('');
  }
  $('#acciones').addEventListener('click', ev => {
    const el = ev.target instanceof Element ? ev.target.closest('[data-acc]') : null; if (!el || el.tagName === 'INPUT') return;
    const b = banderas(t), tipo = el.dataset.acc, i = +(el.dataset.i ?? 0);
    accion(tipo, i, tipo === 'contacto' ? !b.contactos[i] : tipo === 'acelerar' ? !b.acelera : !b.frena);
  });
  $('#acciones').addEventListener('change', ev => { const el = ev.target; if (el instanceof HTMLInputElement && el.dataset.acc === 'calentador') accion('calentador', +el.dataset.i, el.checked); });

  // La historia se ramifica en t: las acciones posteriores se descartan
  function accion(tipo, i, valor) {
    const tt = t, descartadas = guion.filter(a => a.t > tt + 1e-9).length;
    guion = guion.filter(a => a.t < tt - 1e-9 || (a.t <= tt + 1e-9 && !(a.tipo === tipo && (a.i ?? 0) === i)));
    guion.push({ t: tt, tipo, i, valor }); guion.sort((p, q) => p.t - q.t);
    guionPropio = true;
    recalcular(); registrar(); inspector();
    const nombres = { contacto: valor ? 'Contacto' : 'Separación', calentador: valor ? 'Calentador encendido' : 'Calentador apagado', acelerar: valor ? 'Acelera' : 'Deja de acelerar', frenar: valor ? 'Frena' : 'Suelta el freno' };
    avisar(`${nombres[tipo]} en t = ${cantidad(tt, 's')}${descartadas ? (descartadas > 1 ? ` · se descartan ${descartadas} acciones posteriores` : ' · se descarta 1 acción posterior') : ''}`, true);
  }

  function lecturas() {
    pintarReloj(t);
    $('#lect-titulo').textContent = `Lecturas en t = ${fmt(t, 4)} s`;
    if (!SIM) { $('#lecturas').innerHTML = '<p class="ayuda-fila" style="margin-left:0">Sin cuerpos no hay lecturas.</p>'; $('#grupo-examen').hidden = true; return; }
    const s = est(t);
    let filas;
    const ins = esInstr(sel) ? INSTR.find(o => o.id === sel) : null, iSel = ins ? +String(ins.en).slice(1) : /^c\d+$/.test(sel) ? +sel.slice(1) : -1;
    if (iSel >= 0 && E.cuerpos[iSel]) {
      const i = iSel;
      filas = [['<span class="sim">T</span>', C(s.T[i]), '°C'], ['<span class="sim">T</span>', s.T[i], 'K'], ['<span class="sim">Q</span>', s.dH[i], 'J', 'Calor neto recibido desde el principio|Heat received'],
        ['<span class="sim">Q</span><sub class="r">contactos</sub>', s.Qcont[i], 'J', 'Calor recibido de los otros cuerpos|Heat from contacts']];
      if (E.cuerpos[i].fusion) filas.push(['<span class="sim">x</span>', s.x[i], '', 'Fracción fundida|Melted fraction']);
      if (s.Qcal[i]) filas.push(['<span class="sim">Q</span><sub class="r">cal</sub>', s.Qcal[i], 'J', 'Calor del calentador|Heater']);
    } else {
      filas = E.cuerpos.map((c, i) => [`<span class="sim">T</span><sub class="r">${c.nombre.split(' ')[0].toLowerCase()}</sub>`, C(s.T[i]), '°C']);
      const tot = a => a.reduce((x, y) => x + y, 0);
      if (tot(s.Qcal)) filas.push(['<span class="sim">Q</span><sub class="r">cal</sub>', tot(s.Qcal), 'J', 'Energía eléctrica convertida en calor|Joule heat']);
      if (E.vehiculo) filas.push(['<span class="sim">v</span>', s.v, 'm/s'], ['<span class="sim">E</span><sub class="r">k</sub>', s.Ek, 'J', 'Energía cinética|Kinetic energy'], ['<span class="sim">E</span><sub class="r">química</sub>', s.Equim, 'J', 'Energía química gastada|Chemical energy']);
      filas.push(['Residuo', residuoCalor(s), 'J', 'Σ ΔH − (Q_cal + Q_aire + E_química − ΔE_k): cero salvo redondeo|Energy balance residual']);
      if (ESC.extra && !guionPropio) filas.push(...ESC.extra(s, SIM, vals()));
    }
    $('#lecturas').innerHTML = filas.map(f => filaLectura(conU(f))).join('');
    $('#grupo-examen').hidden = !FILAS.length;
    if (FILAS.length) { $('#examen-titulo').textContent = `Examen · MEXT ${ESC.anio}`; $('#examen').innerHTML = examenHTML(FILAS, t); }
    $('#acc-titulo').textContent = `Acciones en t = ${fmt(t, 4)} s`;
    // Los botones de acción reflejan la configuración en t
    const b = banderas(t);
    document.querySelectorAll('#acciones [data-acc]').forEach(el => {
      const i = +(el.dataset.i ?? 0), tipo = el.dataset.acc;
      if (tipo === 'calentador') { if (b.calentadores[i] == null) return; el.checked = b.calentadores[i]; el.nextElementSibling.textContent = b.calentadores[i] ? 'Encendido' : 'Apagado'; }
      else if (tipo === 'contacto') { const c = (E.contactos || [])[i]; if (!c) return; el.querySelector('span').textContent = `${b.contactos[i] ? 'Separar' : 'Juntar'} ${E.cuerpos[c.a].nombre.split(' ')[0].toLowerCase()} y ${E.cuerpos[c.b].nombre.split(' ')[0].toLowerCase()}`; }
      else if (tipo === 'acelerar') el.querySelector('span').textContent = b.acelera ? 'Dejar de acelerar' : 'Acelerar';
      else if (tipo === 'frenar') el.querySelector('span').textContent = b.frena ? 'Soltar el freno' : 'Frenar';
    });
  }

  // ---------------------------------------------------------------------
  // Paneles inferiores
  // ---------------------------------------------------------------------
  const lt = new LineaTiempo($('#tl'), { duracion: 1, eventos: [], alCambiar: nt => repro.irA(nt) });
  function rango(xs, fr = 0.08) { const a = Math.min(...xs), b = Math.max(...xs), d = Math.max(b - a, Math.abs(b) * 0.05, 1e-9); return { min: a - d * fr, max: b + d * fr }; }
  const serie = (f, hasta = SIM.duracion) => { const p = [], ms = SIM.muestras, paso = Math.max(1, Math.floor(ms.length / 300)); for (let i = 0; i < ms.length && ms[i].t <= hasta + 1e-9; i += paso) p.push([ms[i].t, f(ms[i])]); if (hasta < SIM.duracion) p.push([hasta, f(est(hasta))]); return p; };
  const eventosG = () => SIM.eventos.map(e => ({ x: e.t }));
  // Las etiquetas de las series van al final de lo recorrido: solo cuando ya hay sitio
  const hayEtq = () => t > SIM.duracion * 0.15;
  function graficas() {
    if (!SIM) { for (const q of ['1', '2', '3']) { $('#t' + q).textContent = ''; $('#l' + q).textContent = ''; grafica($('#g' + q), { x: { min: 0, max: ESC.duracion }, y: { min: 0, max: 1 }, series: [], eventos: [] }); } return; }
    if ($('#p-graficas').hidden) return;
    const s = est(t), N = E.cuerpos.length, X = { min: 0, max: SIM.duracion };
    const leyenda = (items) => `<span class="leyenda">${items.map(([col, pat, nom]) => `<span style="color:${col}"><i${pat ? ' class="discontinua"' : ''}></i>${nom}</span>`).join('')}</span>`;
    // 1 · Temperaturas
    const todasT = SIM.muestras.flatMap(m => m.T.map(C));
    grafica($('#g1'), { x: X, y: rango(todasT), cursor: t, eventos: eventosG(),
      series: E.cuerpos.map((c, i) => ({ tramos: [serie(m => C(m.T[i]), t)], familia: 'termico', patron: PATRONES[i % 3], etiqueta: hayEtq() ? c.nombre.split(' ')[0] : null })) });
    $('#t1').innerHTML = '<span><span class="sim">T</span> (°C) contra <span class="sim">t</span> (s)</span>';
    $('#l1').textContent = N <= 3 ? E.cuerpos.map((c, i) => fmt(C(s.T[i]), 3)).join(' · ') + ' °C' : '';
    if (esAuto()) {
      grafica($('#g2'), { x: X, y: rango(SIM.muestras.map(m => m.v)), cursor: t, eventos: eventosG(), series: [{ tramos: [serie(m => m.v, t)], familia: 'movimiento' }] });
      $('#t2').innerHTML = '<span><span class="sim">v</span> (m/s) contra <span class="sim">t</span></span>'; $('#l2').textContent = cantidad(s.v, 'm/s', 3);
      const todas = SIM.muestras.flatMap(m => [m.Equim, m.Ek, m.Qmotor + m.Qfrenos]);
      grafica($('#g3'), { x: X, y: rango([0, ...todas]), cursor: t, eventos: eventosG(), series: [
        { tramos: [serie(m => m.Equim, t)], familia: 'tinta', patron: 'discontinuo', etiqueta: hayEtq() ? 'química' : null },
        { tramos: [serie(m => m.Ek, t)], familia: 'movimiento', etiqueta: hayEtq() ? 'cinética' : null },
        { tramos: [serie(m => m.Qmotor + m.Qfrenos, t)], familia: 'termico', etiqueta: hayEtq() ? 'calor' : null }] });
      $('#t3').innerHTML = leyenda([['var(--tinta)', 1, 'Química'], ['var(--f-movimiento)', 0, 'Cinética'], ['var(--f-termico)', 0, 'Calor']]);
      $('#l3').textContent = 'J';
      return;
    }
    // 2 · Calor recibido por cada cuerpo
    const todasQ = SIM.muestras.flatMap(m => m.dH);
    grafica($('#g2'), { x: X, y: rango([0, ...todasQ]), cursor: t, eventos: eventosG(),
      series: E.cuerpos.map((c, i) => ({ tramos: [serie(m => m.dH[i], t)], familia: 'termico', patron: PATRONES[i % 3], etiqueta: hayEtq() ? c.nombre.split(' ')[0] : null })) });
    $('#t2').innerHTML = '<span><span class="sim">Q</span> recibido (J) contra <span class="sim">t</span></span>'; $('#l2').textContent = '';
    // 3 · Fracción fundida o flujo de calor por cada contacto
    const hielo = E.cuerpos.findIndex(c => c.fusion);
    if (hielo >= 0) {
      grafica($('#g3'), { x: X, y: { min: 0, max: 1.05 }, cursor: t, eventos: eventosG(), series: [{ tramos: [serie(m => m.x[hielo], t)], familia: 'tinta' }] });
      $('#t3').innerHTML = '<span>Fracción de hielo fundida contra <span class="sim">t</span></span>'; $('#l3').textContent = fmt(s.x[hielo] * 100, 3) + ' %';
    } else if ((E.contactos || []).length) {
      const todasF = SIM.muestras.flatMap(m => m.flujos);
      grafica($('#g3'), { x: X, y: rango([0, ...todasF]), cursor: t, eventos: eventosG(),
        series: E.contactos.map((c, k) => ({ tramos: [serie(m => m.flujos[k], t)], familia: 'termico', patron: PATRONES[k % 3], etiqueta: hayEtq() ? `${E.cuerpos[c.a].nombre.split(' ')[0]}→${E.cuerpos[c.b].nombre.split(' ')[0]}` : null })) });
      $('#t3').innerHTML = '<span><span class="sim">Φ</span> por contacto (W) contra <span class="sim">t</span></span>'; $('#l3').textContent = '';
    } else {
      const tot = m => m.Qcal.reduce((a, b) => a + b, 0);
      grafica($('#g3'), { x: X, y: rango([0, ...SIM.muestras.map(tot)]), cursor: t, eventos: eventosG(), series: [{ tramos: [serie(tot, t)], familia: 'termico' }] });
      $('#t3').innerHTML = '<span><span class="sim">Q</span><sub>cal</sub> (J) contra <span class="sim">t</span></span>'; $('#l3').textContent = kJ(s.Qcal.reduce((a, b) => a + b, 0));
    }
  }
  function tablas() {
    if (!SIM) { for (const id of ['#e-cuerpos', '#e-fuentes', '#t-eventos', '#t-datos']) $(id).innerHTML = ''; return; }
    const s = est(t);
    if (!$('#p-energia').hidden) {
      const esc = Math.max(1e-9, ...SIM.muestras.flatMap(m => m.dH.map(Math.abs)), ...SIM.muestras.map(m => Math.abs(m.Equim)));
      const barra = (n, fam, val, ayuda) => { const p = Math.min(50, Math.abs(val) / esc * 50), pos2 = val >= 0 ? `left:50%;width:${p}%` : `left:${50 - p}%;width:${p}%`; return `<div class="barra-e" data-ayuda="${ayuda}"><span>${n}</span><span class="riel"><i style="${pos2};background:${fam === 'tinta' ? 'var(--tinta)' : `var(--f-${fam})`}"></i></span><span class="v">${kJ(val)}</span></div>`; };
      $('#e-cuerpos').innerHTML = '<div class="barras-tit">Calor recibido por cada cuerpo, Δ<span class="sim">H</span></div>' + E.cuerpos.map((c, i) => barra(c.nombre, 'termico', s.dH[i], `Calor neto que ha recibido ${c.nombre}|Heat received`)).join('')
        + `<div class="barras-pie">Σ Δ<span class="sim">H</span> = ${kJ(s.dH.reduce((a, b) => a + b, 0))}</div>`;
      const tot = a => a.reduce((x, y) => x + y, 0);
      $('#e-fuentes').innerHTML = '<div class="barras-tit">De dónde sale</div>'
        + barra('Calentadores', 'termico', tot(s.Qcal), 'Energía eléctrica convertida en calor|Joule heating')
        + barra('Aire', 'termico', tot(s.Qaire), 'Calor intercambiado con el aire|Heat from air')
        + barra('Energía química', 'tinta', s.Equim, 'Energía química gastada por el motor|Chemical energy')
        + barra('−Δ<span class="sim">E</span><sub>k</sub>', 'movimiento', -s.dEk, 'Energía cinética perdida|Kinetic energy lost')
        + `<div class="barras-pie">Residuo del balance = ${cantidad(residuoCalor(s), 'J', 2)}</div>`;
    }
    if (!$('#p-eventos').hidden) {
      $('#t-eventos').innerHTML = `<tr><th>Evento</th><th>t (s)</th>${E.cuerpos.map(c => `<th>${c.nombre} (°C)</th>`).join('')}</tr>` + SIM.eventos.map(e => `<tr class="${Math.abs(e.t - t) < 0.06 ? 'actual' : ''}"><td class="texto">${e.nombre}</td><td>${fmt(e.t, 4)}</td>${e.T.map(T => `<td>${fmt(C(T), 4)}</td>`).join('')}</tr>`).join('');
    }
    if (!$('#p-tabla').hidden) {
      let h = `<tr><th>t (s)</th>${E.cuerpos.map(c => `<th>${c.nombre} (°C)</th>`).join('')}<th>Σ Q cal (J)</th></tr>`;
      const paso = Math.max(1, Math.round(SIM.muestras.length / 60));
      for (let i = 0; i < SIM.muestras.length; i += paso) { const m = SIM.muestras[i]; h += `<tr class="${Math.abs(m.t - t) < paso * SIM.muestra / 2 ? 'actual' : ''}"><td>${fmt(m.t, 4)}</td>${m.T.map(T => `<td>${fmt(C(T), 5)}</td>`).join('')}<td>${fmt(m.Qcal.reduce((a, b) => a + b, 0), 4)}</td></tr>`; }
      $('#t-datos').innerHTML = h;
    }
  }

  // ---------------------------------------------------------------------
  // Escena: abrir, guardar, deshacer
  // ---------------------------------------------------------------------
  function titulo() { ponerTitulo(ESC, NOMBRE_ESPACIO); }
  function construirVars() { construirVariables($('#variables'), VAR, () => { recalcular(); lecturas(); }, () => setTimeout(registrar, 0)); }
  const instantanea = () => ({ clave: ESC.propio ? 'propia' : ESC.clave, titulo: ESC.titulo, montaje: ESC.propio ? copia(MONTAJE) : null, instrumentos: copia(INSTR), vars: vals(), guion: guionPropio ? guion : null, capas: { ...capas } });
  function registrar() { if (historial && historial.registrar(instantanea())) botonesHistorial(); if (autoguardar) autoguardado.guardar('termodinamica-calor', escenaActual()); }
  function botonesHistorial() { $('#b-deshacer').disabled = !historial?.puedeDeshacer; $('#b-rehacer').disabled = !historial?.puedeRehacer; }
  function deshacer() { const d = historial?.deshacer(); if (d) { restaurar(d); botonesHistorial(); } }
  function rehacer() { const d = historial?.rehacer(); if (d) { restaurar(d); botonesHistorial(); } }
  const TIPOS_ACCION = ['contacto', 'calentador', 'acelerar', 'frenar'];
  function datosSeguros(d = {}) {
    const propia = d.clave === 'propia', r = propia ? sanearCalor(d.montaje) : null;
    const base = propia ? escenaCalor(r.montaje) : ESCENAS_CALOR.find(e => e.clave === d.clave) || ESCENAS_CALOR[0], vars = {};
    for (const [k, def] of Object.entries(base.variables || {})) vars[k] = numero(d.vars?.[k], def.val, def.min, def.max);
    let g = Array.isArray(d.guion) ? d.guion.filter(a => a && TIPOS_ACCION.includes(a.tipo) && typeof a.valor === 'boolean' && Number.isFinite(a.t) && a.t >= 0 && a.t <= base.duracion)
      .slice(0, 200).map(a => ({ t: a.t, tipo: a.tipo, i: Math.round(numero(a.i, 0, 0, 20)), valor: a.valor })) : null;
    // En una escena propia, solo las acciones sobre contactos y calentadores que existen
    if (propia && g) g = g.filter(a => (a.tipo === 'contacto' ? a.i < base.claves.contactos.length : a.tipo === 'calentador' ? a.i < base.claves.calentadores.length : false));
    const capasOk = {}; for (const k of Object.keys(capas)) capasOk[k] = typeof d.capas?.[k] === 'boolean' ? d.capas[k] : true;
    const instrumentos = sanearInstrumentos(d.instrumentos, ['termometro']).filter(o => /^c\d+$/.test(o.en || ''));
    return { clave: propia ? 'propia' : base.clave, titulo: texto(d.titulo, 'Escena propia', 90), montaje: propia ? r.montaje : null, error: propia ? r.error : null, instrumentos, vars, guion: g, capas: capasOk };
  }
  function restaurar(d) {
    const s = datosSeguros(d);
    if (s.montaje) ponerMontaje(s.montaje, s.titulo); else { MONTAJE = null; ESC = escenaPorClave(s.clave); VAR = copia(ESC.variables || {}); }
    for (const k in s.vars) if (VAR[k]) VAR[k].val = s.vars[k];
    guionPropio = !!s.guion || !!s.montaje; guion = s.guion || []; Object.assign(capas, s.capas); INSTR = s.instrumentos;
    if (s.error) avisar(`Escena abierta sin su montaje: ${s.error}`);
    document.querySelectorAll('.capa-btn').forEach(b => b.setAttribute('aria-pressed', String(!!capas[b.dataset.capa])));
    titulo(); construirVars(); recalcular(false); inspector();
  }
  async function abrirEscena1(clave) {
    if (hayCambios() && !(await confirmarCambios('cambiar de escena'))) return;
    const e = escenaPorClave(clave); if (!e) return;
    if (e.espacio !== ESPACIO) { irAEscenaDeOtroEspacio(e); return; }
    ESC = e; VAR = copia(e.variables || {}); guionPropio = false; sel = 'escena'; MONTAJE = null; INSTR = [];
    titulo(); construirVars(); recalcular(false);
    vistaTocada = false; encuadrar(); escala0 = tz.vista.escala; zoomTexto();
    inspector(); repro.irA(0);
    if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); }
    documentoNuevo();
  }
  function escenaActual() { return crearEscena({ modulo: 'termodinamica', espacio: ESPACIO, titulo: ESC.titulo, datos: instantanea() }); }
  function guardar() { guardarEscena(escenaActual()).then(r => { if (r) avisar('Escena guardada'); }, e => avisar(`No se pudo guardar: ${e}`)); }
  function abrir() {
    abrirEscena({ modulo: 'termodinamica' }).then(e => {
      if (aOtroEspacio(e, ESPACIO)) return;
      restaurar(e.datos); repro.irA(0);
      if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); }
      avisar(`Escena abierta: ${texto(e.titulo, 'sin título', 60)}`);
    }).catch(err => avisar(err.message));
  }
  function recalcular(guardarAuto = true) {
    try { simular(); } catch (e) { avisar(e.message); return; }
    lt.duracion = ESC.duracion; lt.simulado = ESC.duracion;
    lt.eventos = SIM ? SIM.eventos.map(e => ({ t: e.t, nombre: e.nombre })) : [];
    if (t > ESC.duracion) t = ESC.duracion;
    arbol(); acciones(); todo();
    if (guardarAuto && autoguardar) autoguardado.guardar('termodinamica-calor', escenaActual());
  }
  function todo() { dibujar(); lecturas(); lt.poner(t); graficas(); tablas(); arbol(); }

  function exportarCSV() {
    if (!SIM) { avisar('No hay datos: la escena está vacía'); return; }
    const filas = SIM.muestras.map(m => [m.t, ...m.T, ...m.dH, m.Qcal.reduce((a, b) => a + b, 0), m.Equim, m.Ek]);
    descargarTexto(nombreArchivo(ESC.titulo) + '-calor.csv', aCSV(['t (s)', ...E.cuerpos.map(c => `T ${c.nombre} (K)`), ...E.cuerpos.map(c => `Q ${c.nombre} (J)`), 'Q cal (J)', 'E química (J)', 'Ek (J)'], filas))
      .then(r => { if (r) avisar(`Datos exportados: ${filas.length} filas`); }, () => {});
  }
  $('#b-exportar').addEventListener('click', exportarCSV);

  // ---------------------------------------------------------------------
  // Capas, lienzo, reproducción, comandos
  // ---------------------------------------------------------------------
  // ---------------------------------------------------------------------
  // Escena propia: paleta, colocar, quitar y arrastrar (termodinamica-montaje.js).
  // Una escena del catálogo no se convierte: sus cuerpos caen o se juntan con
  // acciones que la geometría no describe, así que la paleta empieza una
  // escena propia nueva (los termómetros sí se ponen en cualquier escena).
  // ---------------------------------------------------------------------
  function ponerMontaje(m, tit) { MONTAJE = copia(m); ESC = escenaCalor(MONTAJE, tit || 'Escena propia'); VAR = {}; titulo(); }
  /** Cambia el montaje con fn(montaje) → {montaje, sel}. Las acciones y los termómetros siguen a su pieza. */
  function cambiarMontaje(fn, mensaje, o = {}) {
    const nueva = !ESC.propio, base = nueva ? montajeCalorVacio() : MONTAJE;
    let r;
    try { r = fn(base); } catch (e) { avisar(e.message); return false; }
    const antes = nueva ? { contactos: [], calentadores: [] } : ESC.claves, idsAntes = base.cuerpos.map(c => c.id);
    ponerMontaje(r.montaje, nueva ? 'Escena propia' : ESC.titulo);
    guion = nueva ? [] : guionValidoCalor(guion, antes, ESC.claves); guionPropio = true;
    INSTR = (nueva ? [] : INSTR).map(q => { const i = MONTAJE.cuerpos.findIndex(c => c.id === idsAntes[+q.en.slice(1)]); return i < 0 ? null : { ...q, en: 'c' + i }; }).filter(Boolean);
    if (r.sel) sel = selPantalla(r.sel);
    if (o.encuadrar !== false || nueva) vistaTocada = false;
    construirVars(); recalcular(false);
    if (!vistaTocada) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); }
    inspector(); todo(); registrar();
    if (mensaje) avisar(mensaje + (nueva ? ' · escena propia nueva' : ''), true);
    return true;
  }
  function escenaVacia() {
    ponerMontaje(montajeCalorVacio(), 'Escena propia'); guion = []; guionPropio = true; INSTR = []; sel = 'escena'; vistaTocada = false;
    construirVars(); recalcular(false); encuadrar(); escala0 = tz.vista.escala; zoomTexto(); inspector(); todo(); registrar(); repro.irA(0);
    avisar('Escena vacía: coloca cuerpos, un calorímetro o un baño con la paleta de objetos');
  }
  const marcarHerr = iniciarPaleta('.panel-izq', h => ponerHerramienta(herramienta === h ? null : h));
  function ponerHerramienta(h) {
    herramienta = h; marcarHerr(h); lienzo.style.cursor = h ? 'crosshair' : 'default';
    if (h) avisar(`${NOMBRE_HERR[h]}: ${PISTA_HERR[h]}${h !== 'termometro' && !ESC.propio ? ' · empieza una escena propia' : ''} · Esc termina`);
    dibujar();
  }
  function colocar(X, Y, ev) {
    const v = tz.vista, w = [v.mx(X), v.my(Y)], ob = objetoEn(X, Y), h = herramienta;
    if (h === 'termometro') {
      if (!ob || !/^c\d+$/.test(ob)) { avisar('El termómetro mide la temperatura de un cuerpo: haz clic sobre uno.'); return; }
      const r = rect(+ob.slice(1), t);
      let o; try { o = nuevoInstrumento(INSTR, 'termometro', { en: ob, u: (w[0] - r.x0) / ((r.x1 - r.x0) || 1), w: (w[1] - r.y0) / ((r.y1 - r.y0) || 1) }); } catch (e) { avisar(e.message); return; }
      INSTR.push(o); sel = o.id; inspector(); todo(); registrar();
      avisar(`Termómetro colocado en ${E.cuerpos[+ob.slice(1)].nombre.toLowerCase()}`, true);
    } else {
      const en = ESC.propio && ob ? selMontaje(ob) : null;
      cambiarMontaje(m => colocarCalor(m, h, { x: w[0], y: w[1], en: en && /^cu/.test(en) ? en : null }), `${NOMBRE_HERR[h]} colocad${h === 'cuerpo' || h === 'calorimetro' || h === 'calentador' ? 'o' : 'o'}`, { encuadrar: h !== 'calentador' });
    }
    if (!ev.shiftKey) ponerHerramienta(null);
  }
  function quitarSeleccion() {
    if (esInstr(sel)) { const i = INSTR.findIndex(o => o.id === sel); if (i < 0) return; INSTR.splice(i, 1); sel = 'escena'; inspector(); todo(); registrar(); avisar('Termómetro quitado', true); return; }
    if (!ESC.propio) { avisar('Las escenas del catálogo no se modifican: empieza una escena propia con la paleta o con «+».'); return; }
    const ms = selMontaje(sel);
    if (!ms || ms === 'escena') { avisar('Selecciona en el lienzo o en el árbol lo que quieres quitar'); return; }
    const p2 = piezaCalor(MONTAJE, ms);
    cambiarMontaje(m => quitarCalor(m, ms), `Se quita: ${p2 ? p2.nombre.toLowerCase() : 'el objeto'}`, { encuadrar: false });
  }
  $('#b-vacia').addEventListener('click', escenaVacia);
  const alternarCapa = k => { capas[k] = !capas[k]; document.querySelectorAll(`.capa-btn[data-capa="${k}"]`).forEach(b => b.setAttribute('aria-pressed', String(capas[k]))); registrar(); dibujar(); };
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => alternarCapa(b.dataset.capa)));
  $('#pest').addEventListener('click', () => setTimeout(() => { graficas(); tablas(); }, 0));
  lienzo.addEventListener('pointerdown', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, v = tz.vista;
    if (ev.button === 1 || ev.button === 2 || espacioPulsado) { paneo = [X, Y, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId); return; }
    if (herramienta) { colocar(X, Y, ev); return; }
    const ob = objetoEn(X, Y);
    if (ob) {
      seleccionar(ob);
      // Se arrastran los termómetros, y en una escena propia los cuerpos y el baño
      if (esInstr(ob) || (ESC.propio && (/^c\d+$/.test(ob) || ob === 'bano'))) { arrastre = { ob, desde: [v.mx(X), v.my(Y)], movido: false }; try { lienzo.setPointerCapture(ev.pointerId); } catch { /* sin captura */ } }
      return;
    }
    seleccionar('escena');
    paneo = [X, Y, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId);
  });
  lienzo.addEventListener('pointermove', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, v = tz.vista;
    $('#cx').textContent = cantidad(v.mx(X), 'm', 3); $('#cy').textContent = cantidad(v.my(Y), 'm', 3);
    if (paneo) { vistaTocada = true; v.ox = paneo[2] + X - paneo[0]; v.oy = paneo[3] + Y - paneo[1]; dibujar(); return; }
    cursorPx = [X, Y];
    if (arrastre) {
      const a = arrastre, w = [v.mx(X), v.my(Y)], d = [w[0] - a.desde[0], w[1] - a.desde[1]];
      if (!a.movido && Math.hypot(d[0], d[1]) * v.escala < 3) return;
      a.movido = true; a.d = d;
      if (esInstr(a.ob)) a.punto = w;
      else { const o = a.ob === 'bano' ? MONTAJE.bano : MONTAJE.cuerpos[+a.ob.slice(1)], r = rectCalor(o); a.ghost = [r.x0 + d[0], Math.max(0, r.y0 + d[1]), r.x1 + d[0], Math.max(0, r.y0 + d[1]) + (r.y1 - r.y0)]; }
      dibujar();
      if (a.punto) { const [Xp, Yp] = v.P(a.punto); tz.sondaTermica(Xp, Yp); }
      return;
    }
    if (herramienta) { dibujar(); return; }
    const ob = objetoEn(X, Y);
    lienzo.style.cursor = ob && (esInstr(ob) || (ESC.propio && (/^c\d+$/.test(ob) || ob === 'bano'))) ? 'grab' : ob ? 'pointer' : 'default';
    if (ob !== hover) { hover = ob; dibujar(); }
  });
  lienzo.addEventListener('pointerup', ev => {
    paneo = null;
    const a = arrastre; arrastre = null;
    if (!a || !a.movido) return;
    if (esInstr(a.ob)) {
      // El termómetro se queda en el cuerpo donde se suelta
      const [X, Y] = tz.vista.P(a.punto), ob = objetoEn(X, Y), o = INSTR.find(q => q.id === a.ob);
      if (o && ob && /^c\d+$/.test(ob)) { const r = rect(+ob.slice(1), t); Object.assign(o, { en: ob, u: (a.punto[0] - r.x0) / ((r.x1 - r.x0) || 1), w: (a.punto[1] - r.y0) / ((r.y1 - r.y0) || 1) }); registrar(); }
      else avisar('El termómetro mide un cuerpo: suéltalo sobre uno.');
      inspector(); todo(); return;
    }
    const ms = a.ob === 'bano' ? 'bano' : selMontaje(a.ob), o = a.ob === 'bano' ? MONTAJE.bano : MONTAJE.cuerpos[+a.ob.slice(1)];
    cambiarMontaje(m => ({ montaje: moverCalor(m, ms, o.x + a.d[0], o.y + a.d[1]), sel: ms }), null, { encuadrar: false });
    void ev;
  });
  lienzo.addEventListener('pointerleave', () => { cursorPx = null; if (hover || herramienta) { hover = null; dibujar(); } });
  lienzo.addEventListener('contextmenu', ev => ev.preventDefault());
  lienzo.addEventListener('wheel', ev => { ev.preventDefault(); const r = lienzo.getBoundingClientRect(); vistaTocada = true; tz.vista.zoom(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top); zoomTexto(); dibujar(); }, { passive: false });
  function zoomTexto() { $('#zoom').textContent = Math.round(tz.vista.escala / escala0 * 100) + ' %'; }
  function zoomCentro(f) { vistaTocada = true; tz.vista.zoom(f, tz.w / 2, tz.h / 2); zoomTexto(); dibujar(); }
  function encuadrarTodo() { vistaTocada = false; encuadrar(); escala0 = tz.vista.escala; zoomTexto(); dibujar(); }
  $('#b-zoom-mas').addEventListener('click', () => zoomCentro(1.25));
  $('#b-zoom-menos').addEventListener('click', () => zoomCentro(0.8));
  $('#b-encuadrar').addEventListener('click', encuadrarTodo);
  $('#b-deshacer').addEventListener('click', deshacer);
  $('#b-rehacer').addEventListener('click', rehacer);

  // A 1×, la corrida entera dura unos 15 s de reloj
  const repro = crearReproductor({ duracion: () => (SIM ? SIM.duracion : 1), escala: () => (SIM ? Math.max(1, SIM.duracion / 15) : 1), alCambiar: nt => { t = nt; todo(); acciones(); } });
  iniciarMenuEscenas(ESCENAS_CALOR, () => ESC.clave, abrirEscena1);
  const cmd = iniciarComandos(() => [
    ['i-reproducir', 'Reproducir o pausar', 'Espacio', repro.alternar],
    ['i-reiniciar', 'Volver al principio', 'Inicio', () => repro.irA(0)],
    ['i-capas', 'Mostrar u ocultar los flujos de calor', 'Q', () => alternarCapa('flujos')],
    ['i-capas', 'Mostrar u ocultar las temperaturas', 'T', () => alternarCapa('temperaturas')],
    ...(ESC.propio ? [] : [['i-historial', 'Restablecer las acciones de la escena', '', () => { guionPropio = false; recalcular(); registrar(); inspector(); }]]),
    ['i-mas', 'Escena vacía', '', escenaVacia], ['i-borrar', 'Quitar lo seleccionado', 'Supr', quitarSeleccion],
    ...Object.keys(NOMBRE_HERR).map(h => [h === 'termometro' ? 'n-termometro' : `o-${{ cuerpo: 'cuerpo-termico', calorimetro: 'calorimetro', bano: 'bano-termico' }[h] || h}`, `Colocar: ${NOMBRE_HERR[h].toLowerCase()}`, '', () => ponerHerramienta(h), 'Paleta']),
    ['i-encuadrar', 'Encuadrar todo', 'F', encuadrarTodo],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['i-deshacer', 'Deshacer', 'Ctrl Z', deshacer], ['i-rehacer', 'Rehacer', 'Ctrl Y', rehacer],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar], ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
    ['i-exportar', 'Exportar los datos a CSV', '', exportarCSV],
    ['i-imagen', 'Exportar imagen del lienzo', '', () => descargarLienzo(lienzo, nombreArchivo(ESC.titulo) + '.png')],
    ...ESCENAS_CALOR.map(e => [ICONO_TIPO[e.tipo], `Abrir escena: ${e.titulo}`, chipDe(e), () => abrirEscena1(e.clave), 'Escenas']),
  ]);
  document.addEventListener('keydown', ev => {
    if (cmd.tecla(ev)) return;
    const mod = ev.ctrlKey || ev.metaKey, tecla = ev.key.toLowerCase();
    if (mod && tecla === 'k') { ev.preventDefault(); cmd.abrir(); return; }
    if (mod && tecla === 's') { ev.preventDefault(); guardar(); return; }
    if (mod && tecla === 'o') { ev.preventDefault(); abrir(); return; }
    if (ev.target instanceof Element && ev.target.matches('input:not([type=range]):not([type=checkbox]), textarea')) return;
    if (mod && (tecla === 'y' || (ev.shiftKey && tecla === 'z'))) { ev.preventDefault(); rehacer(); return; }
    if (mod && tecla === 'z') { ev.preventDefault(); deshacer(); return; }
    if (mod) return;
    if (ev.target instanceof Element && ev.target.matches('select')) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); quitarSeleccion(); return; }
    if (ev.key === 'Escape' && herramienta) { ponerHerramienta(null); return; }
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) repro.alternar(); espacioPulsado = true; }
    else if (ev.key === 'ArrowRight') repro.irA(t + repro.paso());
    else if (ev.key === 'ArrowLeft') repro.irA(t - repro.paso());
    else if (ev.key === 'Home') repro.irA(0);
    else if (tecla === 'f') encuadrarTodo();
    else if (tecla === 'q') alternarCapa('flujos');
    else if (tecla === 't') alternarCapa('temperaturas');
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });

  // ---------------------------------------------------------------------
  // Arranque. Parámetros: ?escena=hielo&t=60&sel=c1&pest=energia
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  // Antes del arranque no hay escena que dibujar; después, también la vacía se vuelve a encuadrar
  let arrancado = false;
  window.addEventListener('resize', () => { tz.ajustar(); if (!arrancado) return; if (!vistaTocada) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search), limpio = ![...q.keys()].filter(k => k !== 'tema').length;
    const pend = escenaPendiente('termodinamica');
    if (pend && aOtroEspacio(pend, ESPACIO)) return;
    const previa = pend || (limpio ? autoguardado.leer('termodinamica-calor', { modulo: 'termodinamica' }) : null);
    tz.ajustar();
    if (q.has('montaje')) {
      // Escena propia para capturas: ?montaje=<JSON>&guion=<JSON>&instr=<JSON> (se sanea como un archivo)
      const json = k => { try { return JSON.parse(q.get(k) || 'null'); } catch { return null; } };
      restaurar({ clave: 'propia', titulo: 'Escena propia', montaje: json('montaje'), guion: json('guion'), instrumentos: json('instr') || [] });
    } else if (q.has('vacia')) { ponerMontaje(montajeCalorVacio(), 'Escena propia'); guion = []; guionPropio = true; construirVars(); recalcular(false); }
    else if (q.has('escena') || !previa) {
      const e = escenaPorClave(q.get('escena') || '') || ESCENAS_CALOR[0];
      if (e.espacio !== ESPACIO) { irAEscenaDeOtroEspacio(e); return; }
      ESC = e; VAR = copia(e.variables || {});
      titulo(); construirVars(); recalcular(false);
    } else restaurar(previa.datos);
    if (q.has('sel')) sel = q.get('sel');
    autoguardar = true;
    registrarDocumento({ clave: 'termodinamica-calor', escena: escenaActual, origen: (!q.has('montaje') && !q.has('vacia') && !q.has('escena') && previa) || null, abrir, guardar });
    encuadrar(); escala0 = tz.vista.escala; zoomTexto();
    inspector();
    const pe = q.get('pest'); if (pe) { const b = document.querySelector(`#pest [aria-controls="p-${pe}"]`); if (b) b.click(); }
    repro.irA(q.has('t') ? parseFloat(q.get('t')) || 0 : 0);
    historial = new Historial(instantanea()); botonesHistorial();
    repro.arrancar();
    arrancado = true;
  });
})();
