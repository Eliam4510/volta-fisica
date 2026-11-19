/* ==========================================================================
   Volta · Termodinámica — espacio de trabajo "Ciclos y diagrama P-V"
   Procesos guiados de un gas ideal en estados de equilibrio: isobárico,
   isocórico, isotérmico, adiabático y recta en el diagrama P-V. El lienzo es
   el propio diagrama P-V (como en el examen: estados con su letra, líneas de
   referencia a los ejes, flechas de sentido) con el cilindro del gas al lado.
   Se puede dibujar un ciclo con la paleta de procesos (clic en el diagrama).
   La física está en el motor puro sistema/motores/ciclos.js (probado en
   pruebas/ciclos.test.js); las escenas y sus respuestas del examen, en
   termodinamica-escenas.js (pruebas/termodinamica-mext.test.js).
   Parámetros de URL para capturas: ?escena=…&t=…&sel=A|t0|gas&pest=tramos
   ========================================================================== */
import { simularCiclo, estadoCiclo, curvaTramo, puntoTramo, NOMBRES_TRAMO, TIPOS_TRAMO } from '../motores/ciclos.js';
import { R_GAS } from '../motores/gas.js';
import { ESCENAS_CICLOS, valores, examenDe, escenaPorClave } from './termodinamica-escenas.js';
import {
  ponerTitulo, iniciarMenuEscenas, aOtroEspacio, irAEscenaDeOtroEspacio, construirVariables, filaLectura, examenHTML,
  crearAvisador, iniciarComandos, crearReproductor, pintarReloj, simHTML, fmtVar, ICONO_TIPO, chipDe,
} from './termodinamica-comun.js';
import { aCSV } from '../nucleo/csv.js';
import { crearEscena, numero, texto } from '../nucleo/escena.js';
import { Historial } from '../nucleo/historial.js';
import { descargarTexto, descargarLienzo, nombreArchivo } from '../componentes/exportar.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';

(function () {
  'use strict';
  const { Trazo, fmt, cantidad, conPrefijo, grafica, LineaTiempo, Termo, pasoAgradable, fmtMarca } = Volta;
  const $ = s => document.querySelector(s);
  const ESPACIO = 'ciclos', NOMBRE_ESPACIO = 'Ciclos y diagrama P-V';
  const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const GASES = [[3, 'Monoatómico'], [5, 'Diatómico'], [6, 'Triatómico']];
  const kJ = (x, c = 3) => conPrefijo(x, 'J', c);
  /** Nombre del proceso en minúscula inicial («recta en P-V»). */
  const proc = tipo => NOMBRES_TRAMO[tipo].charAt(0).toLowerCase() + NOMBRES_TRAMO[tipo].slice(1);
  const ICONO_PROCESO = { isobarico: 'o-embolo', isocorico: 'o-recipiente', isotermico: 'o-bano-termico', adiabatico: 'o-calorimetro', recta: 'i-grafica' };
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  const subN = s => String(s).replace(/\d/g, d => SUB[+d]);

  // ---------------------------------------------------------------------
  // Estado de la escena
  // ---------------------------------------------------------------------
  /** @type {any} */ let ESC = ESCENAS_CICLOS[0];
  /** @type {Record<string, any>} */ let VAR = {};
  let propio = false;               // la escena se editó: el ciclo es CIC
  /** @type {any} */ let CIC = null;
  let fGas = null;                  // grados de libertad elegidos en el inspector
  /** @type {any} */ let SIM = null;
  let FILAS = [], ERROR = null, FASES = [];
  let sel = 'gas', hover = null, herramienta = null, cursor = null;
  const capas = { referencias: true, calor: true, cilindro: true };
  let historial = null, autoguardar = false, vistaTocada = false, escala0 = 1, espacioPulsado = false, paneo = null;
  const lienzo = $('#lienzo'), tz = new Trazo(lienzo);
  const MOL = Termo.crearMoleculas(90, 5);
  const avisar = crearAvisador(() => deshacer());

  const vals = () => Object.fromEntries(Object.entries(VAR).map(([k, d]) => [k, d.val]));
  const copia = o => JSON.parse(JSON.stringify(o));
  function cicloActual() {
    const c = propio ? copia(CIC) : ESC.construir(vals());
    if (fGas != null && !(VAR.f && !propio)) c.f = fGas;
    return c;
  }
  const uV = () => (ESC.unidadV === 'cm³' && !propio ? 'cm³' : 'L'), fV = () => (uV() === 'cm³' ? 1e6 : 1e3);
  const Vtxt = (V, c = 4) => cantidad(V * fV(), uV(), c), Ptxt = (P, c = 4) => cantidad(P / 1e3, 'kPa', c);

  // ---------------------------------------------------------------------
  // Simulación y geometría del diagrama
  // ---------------------------------------------------------------------
  const DW = 1, DH = 0.72;          // tamaño del diagrama en el mundo
  let GEO = { Vax: 1, Pax: 1 };
  const xV = V => V / GEO.Vax * DW, yP = P => P / GEO.Pax * DH;
  const Vx = x => x / DW * GEO.Vax, Py = y => y / DH * GEO.Pax;
  function maximoBonito(x) { const p = pasoAgradable(x / 5); return Math.ceil(x / p) * p; }

  function simular() {
    try { SIM = simularCiclo(cicloActual()); ERROR = null; }
    catch (e) { ERROR = e.message; if (!SIM) throw e; return; }
    FILAS = propio ? [] : examenDe(ESC, SIM, vals());
    // Ejes: lo que recorre el gas, con margen, en números redondos de la unidad de pantalla
    let Vm = 0, Pm = 0;
    SIM.tramos.forEach((_, i) => { for (const [V, P] of curvaTramo(SIM, i, 48)) { Vm = Math.max(Vm, V); Pm = Math.max(Pm, P); } });
    for (const e of Object.values(SIM.estados)) { Vm = Math.max(Vm, e.V); Pm = Math.max(Pm, e.P); }
    GEO = { Vax: maximoBonito(Vm * 1.2 * fV()) / fV(), Pax: maximoBonito(Pm * 1.2 / 1e3) * 1e3 };
    // Fases de las moléculas del cilindro (cosméticas): avanzan con √T
    FASES = []; let f = 0;
    const N = 400, d = Math.max(SIM.duracion, 1e-9);
    for (let i = 0; i <= N; i++) {
      const s = estadoCiclo(SIM, d * i / N);
      if (i) f += 0.55 * Math.sqrt(Math.max(s.T, 1) / 300) * d / N;
      FASES.push(f);
    }
  }
  const fase = t => { if (!FASES.length) return 0; const x = Math.max(0, Math.min(1, t / Math.max(SIM.duracion, 1e-9))) * (FASES.length - 1), i = Math.min(FASES.length - 2, Math.floor(x)); return FASES[i] + (FASES[i + 1] - FASES[i]) * (x - i); };

  // ---------------------------------------------------------------------
  // Dibujo del lienzo
  // ---------------------------------------------------------------------
  const CIL = { x0: 1.2, largo: 0.56, yc: 0.4, alto: 0.2 };
  function encuadrar() {
    const caja = { x0: -0.2, x1: capas.cilindro ? 1.98 : 1.12, y0: -0.13, y1: 0.84 };
    tz.vista.encuadrar(caja, { x: 0, y: 40, w: tz.w, h: tz.h - 84 }, 28);
  }
  const Pw = (V, P) => [xV(V), yP(P)];
  const Pp = (V, P) => tz.vista.P(Pw(V, P));
  const tramoActual = t => { if (!SIM.tramos.length) return -1; const k = SIM.tramos.findIndex(x => t <= x.t1 + 1e-12); return k < 0 ? SIM.tramos.length - 1 : k; };
  const centroide = () => { const es = Object.values(SIM.estados); return [es.reduce((s, e) => s + xV(e.V), 0) / es.length, es.reduce((s, e) => s + yP(e.P), 0) / es.length]; };

  let t = 0;
  function dibujar() {
    if (!SIM) return;
    const v = tz.vista, c = tz.ctx;
    tz.limpiar();
    // Rejilla del diagrama en sus marcas
    const pasoV = pasoAgradable(GEO.Vax * fV() / 6) / fV(), pasoP = pasoAgradable(GEO.Pax / 1e3 / 5) * 1e3;
    const [X0, Y0] = v.P([0, 0]), [X1, Y1] = v.P([DW, DH]);
    c.save(); c.strokeStyle = tz.t['cuadricula-mayor']; c.lineWidth = 1; c.beginPath();
    for (let V = pasoV; V <= GEO.Vax * 1.0001; V += pasoV) { const X = Math.round(v.X(xV(V))) + 0.5; c.moveTo(X, Y0); c.lineTo(X, Y1); }
    for (let P = pasoP; P <= GEO.Pax * 1.0001; P += pasoP) { const Y = Math.round(v.Y(yP(P))) + 0.5; c.moveTo(X0, Y); c.lineTo(X1, Y); }
    c.stroke(); c.restore();

    // Área encerrada por el ciclo: el trabajo neto
    if (SIM.ciclo) {
      c.save(); c.beginPath();
      SIM.tramos.forEach((_, i) => curvaTramo(SIM, i, 48).forEach(([V, P], j) => { const [X, Y] = Pp(V, P); if (i === 0 && j === 0) c.moveTo(X, Y); else c.lineTo(X, Y); }));
      c.closePath(); c.globalAlpha = 0.05; c.fillStyle = tz.t.tinta; c.fill(); c.restore();
    }

    // Ejes con punta abierta y sus nombres
    tz.flechaPx(X0, Y0, v.X(DW + 0.06), Y0, { color: 'texto-3', grosor: 1, punta: 'abierta' });
    tz.flechaPx(X0, Y0, X0, v.Y(DH + 0.06), { color: 'texto-3', grosor: 1, punta: 'abierta' });
    tz.compuesto([{ t: 'V', f: 'sim', tam: 15 }, { t: ` (${uV()})`, f: 'ui', tam: 11 }], v.X(DW + 0.06) + 8, Y0 + 5, { color: 'texto-3' });
    tz.compuesto([{ t: 'P', f: 'sim', tam: 15 }, { t: ' (kPa)', f: 'ui', tam: 11 }], X0 + 8, v.Y(DH + 0.06) + 4, { color: 'texto-3' });
    tz.texto('O', X0 - 8, Y0 + 14, { fuente: 'simRecta', tam: 13, color: 'texto-3', alinear: 'right' });

    // Marcas: simbólicas (p₀, 2p₀…) en los estados si la escena es del examen, o numéricas
    const simb = !propio && ESC.simbolos ? ESC.simbolos(vals()) : null;
    const huecosX = [], huecosY = [];
    const multiplo = (x, u) => { const k = x / u; for (const d of [1, 2, 3, 4, 6]) { const q = Math.round(k * d); if (Math.abs(k * d - q) < 1e-6 && q > 0) return d === 1 ? (q === 1 ? '' : String(q)) : `${q}/${d}`; } return null; };
    if (simb) {
      const vistosV = new Set(), vistosP = new Set();
      for (const e of Object.values(SIM.estados)) {
        const kv = multiplo(e.V, simb.V), kp = multiplo(e.P, simb.P), [X, Y] = Pp(e.V, e.P);
        if (kv != null && !vistosV.has(kv)) { vistosV.add(kv); tz.compuesto([{ t: kv, f: 'simRecta', tam: 13 }, { t: simb.v, f: 'sim', tam: 13 }, { t: '0', f: 'simRecta', tam: 9, dy: 3 }], X, Y0 + 18, { alinear: 'center', color: 'texto-2' }); huecosX.push(X); }
        if (kp != null && !vistosP.has(kp)) { vistosP.add(kp); tz.compuesto([{ t: kp, f: 'simRecta', tam: 13 }, { t: simb.p, f: 'sim', tam: 13 }, { t: '0', f: 'simRecta', tam: 9, dy: 3 }], X0 - 7, Y + 4, { alinear: 'right', color: 'texto-2' }); huecosY.push(Y); }
      }
    }
    for (let V = pasoV; V <= GEO.Vax * 1.0001; V += pasoV) { const X = v.X(xV(V)); if (huecosX.some(h => Math.abs(h - X) < 34)) continue; tz.texto(fmtMarca(V * fV(), pasoV * fV()), X, Y0 + 5, { fuente: 'num', tam: 11, color: 'texto-3', alinear: 'center', base: 'top' }); }
    for (let P = pasoP; P <= GEO.Pax * 1.0001; P += pasoP) { const Y = v.Y(yP(P)); if (huecosY.some(h => Math.abs(h - Y) < 14)) continue; tz.texto(fmtMarca(P / 1e3, pasoP / 1e3), X0 - 6, Y, { fuente: 'num', tam: 11, color: 'texto-3', alinear: 'right', base: 'middle' }); }

    const s = estadoCiclo(SIM, t), k = tramoActual(t);
    // Curvas de referencia por el estado actual (construcción auxiliar)
    if (capas.referencias) {
      c.save(); c.beginPath(); c.rect(X0, Y1, X1 - X0, Y0 - Y1); c.clip();
      const curva = (fP, col) => { const pts = []; for (let i = 1; i <= 120; i++) { const V = GEO.Vax * i / 120; pts.push(Pp(V, fP(V))); } tz.lineaPx(pts, { color: col, grosor: 1, patron: 'auxiliar' }); return pts; };
      const iso = curva(V => s.P * s.V / V, 'termico'), adi = curva(V => s.P * (s.V / V) ** SIM.gas.gam, 'texto-3');
      c.restore();
      const etiqueta = (pts, txt, col) => { const p = pts.filter(([x, y]) => x > X0 + 4 && x < X1 - 4 && y > Y1 + 10 && y < Y0 - 6).pop(); if (p) tz.texto(txt, Math.min(p[0], X1 - 4), p[1] - 6, { tam: 10.5, color: col, alinear: 'right', halo: true }); };
      etiqueta(iso, 'isoterma', 'termico'); etiqueta(adi, 'adiabática', 'texto-3');
    }

    // Tramos: lo recorrido continuo; lo que falta, previsto
    const etiquetasQ = [];
    SIM.tramos.forEach((x, i) => {
      const pts = curvaTramo(SIM, i, 64).map(([V, P]) => Pp(V, P));
      const grueso = sel === 't' + i || hover === 't' + i ? 0.5 : 0;
      if (i < k || t >= x.t1 - 1e-12) tz.lineaPx(pts, { grosor: 2 + grueso });
      else if (i > k) tz.lineaPx(pts, { color: 'texto-3', grosor: 1.5 + grueso, patron: 'previsto', extremo: 'butt' });
      else {
        const hecho = [], N = 64, sx = (t - x.t0) / (x.t1 - x.t0);
        for (let j = 0; j <= N; j++) { const q = puntoTramo(SIM.gas, x.tipo, x.a, x.b, Math.min(sx, j / N)); hecho.push(Pp(q.V, q.P)); if (j / N >= sx) break; }
        tz.lineaPx(pts, { color: 'texto-3', grosor: 1.5, patron: 'previsto', extremo: 'butt' });
        tz.lineaPx(hecho, { grosor: 2 + grueso });
      }
      // Flecha de sentido a mitad del tramo
      const m = puntoTramo(SIM.gas, x.tipo, x.a, x.b, 0.5), m2 = puntoTramo(SIM.gas, x.tipo, x.a, x.b, 0.53);
      const [ax, ay] = Pp(m.V, m.P), [bx, by] = Pp(m2.V, m2.P), L = Math.hypot(bx - ax, by - ay) || 1;
      tz.flechaPx(ax - (bx - ax) / L * 5, ay - (by - ay) / L * 5, ax + (bx - ax) / L * 5, ay + (by - ay) / L * 5, { color: i <= k ? 'tinta' : 'texto-3', grosor: 1.5 });
      if (capas.calor && t >= x.t1 - 1e-12) etiquetasQ.push(i);
    });

    // Estados: líneas de referencia a los ejes, punto y letra
    const [cx, cy] = centroide();
    for (const e of Object.values(SIM.estados)) {
      const [X, Y] = Pp(e.V, e.P);
      tz.lineaPx([[X, Y], [X, Y0]], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
      tz.lineaPx([[X, Y], [X0, Y]], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
    }
    const cajasLetras = [];
    for (const e of Object.values(SIM.estados)) {
      const [X, Y] = Pp(e.V, e.P), [ex, ey] = Pw(e.V, e.P);
      c.save(); c.fillStyle = tz.t.tinta; c.beginPath(); c.arc(X, Y, 3.5, 0, 2 * Math.PI); c.fill(); c.restore();
      let dx = ex - cx, dy = ey - cy; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      if (Object.keys(SIM.estados).length < 3) { dx = -0.7; dy = 0.7; }
      const lx = X + dx * 15, ly = Y - dy * 15 + 5;
      cajasLetras.push([lx - 8, ly - 13, 16, 17], [X - 6, Y - 6, 12, 12]);
      tz.texto(e.nombre, lx, ly, { tam: 13, peso: 600, alinear: 'center', halo: true });
      if (sel === 'e:' + e.nombre) tz.seleccionCirculo(X, Y, 9);
      else if (hover === 'e:' + e.nombre) tz.seleccionCirculo(X, Y, 7);
    }
    // Calor de cada tramo junto a su curva: fuera del ciclo si cabe, sin pisar
    // los ejes, las letras de los estados ni otras etiquetas
    const ocupado = cajasLetras.slice();
    const choca = ([a, b, w, h]) => a < X0 + 4 || b + h > Y0 - 4 || b < Y1 - 14 || a + w > X1 + 70 || ocupado.some(([p, q, r, u]) => a < p + r && a + w > p && b < q + u && b + h > q);
    for (const i of etiquetasQ) {
      const x = SIM.tramos[i], txt = x.tipo === 'adiabatico' ? ' = 0' : ` = ${x.Q >= 0 ? '+' : '−'}${kJ(Math.abs(x.Q))}`;
      c.save(); c.font = Volta.FUENTE.num(11); const ancho = c.measureText(txt).width + 16; c.restore();
      const Xc = v.X(cx), Yc = v.Y(cy);
      let puesto = null;
      for (const sx of [0.5, 0.32, 0.68]) for (const d of [16, -16, 30, -30]) {
        if (puesto) break;
        const m = puntoTramo(SIM.gas, x.tipo, x.a, x.b, sx), m2 = puntoTramo(SIM.gas, x.tipo, x.a, x.b, Math.min(1, sx + 0.03));
        const [ax, ay] = Pp(m.V, m.P), [bx, by] = Pp(m2.V, m2.P), L = Math.hypot(bx - ax, by - ay) || 1;
        let nx = -(by - ay) / L, ny = (bx - ax) / L;
        if ((ax - Xc) * nx + (ay - Yc) * ny < 0) { nx = -nx; ny = -ny; }
        const px = ax + nx * Math.abs(d) * Math.sign(d), py = ay + ny * Math.abs(d) * Math.sign(d) + 4;
        const izq = nx * Math.sign(d) < -0.3, cen = Math.abs(nx) <= 0.3;
        const caja = [izq ? px - ancho : cen ? px - ancho / 2 : px, py - 12, ancho, 16];
        if (!choca(caja)) puesto = { px, py, caja, alinear: izq ? 'right' : cen ? 'center' : 'left' };
      }
      if (!puesto) continue;
      ocupado.push(puesto.caja);
      tz.compuesto([{ t: 'Q', f: 'sim', tam: 13, color: 'termico' }, { t: subN(i + 1), f: 'simRecta', tam: 10, dy: 3, color: 'termico' }, { t: txt, f: 'num', tam: 11, color: 'texto-2' }], puesto.px, puesto.py, { alinear: puesto.alinear });
    }

    // Estado actual
    const [Xs, Ys] = Pp(s.V, s.P);
    c.save(); c.fillStyle = tz.t.lienzo; c.strokeStyle = tz.t.tinta; c.lineWidth = 2; c.beginPath(); c.arc(Xs, Ys, 5, 0, 2 * Math.PI); c.fill(); c.stroke(); c.restore();
    // Evento reciente: llegada a un estado
    const ev = SIM.tramos.filter(x => x.t1 <= t + 1e-9 && t - x.t1 < 1.2).pop();
    if (ev && t < SIM.duracion - 1e-9) tz.eventoAnillo(Pw(SIM.estados[ev.hasta].V, SIM.estados[ev.hasta].P));

    // Vista previa del tramo que se va a añadir
    if (herramienta && cursor) previa();
    if (capas.cilindro) cilindro(s, k);
    if (ERROR) tz.ficha(v.X(0.05), v.Y(DH) - 4, [[{ t: ERROR, f: 'ui', tam: 11.5, color: 'error' }]]);
  }

  // Cilindro horizontal con el gas en el estado actual, el calor y el trabajo del tramo
  function cilindro(s, k) {
    const v = tz.vista, x0 = CIL.x0, L = CIL.largo, yb = CIL.yc - CIL.alto / 2, yt = CIL.yc + CIL.alto / 2;
    const xp = x0 + L * Math.min(1.05, s.V / GEO.Vax), x = k >= 0 ? SIM.tramos[k] : null, tipo = x ? x.tipo : '';
    const enCurso = x && t > x.t0 + 1e-9 && t < x.t1 - 1e-9;
    const adiab = enCurso && tipo === 'adiabatico';
    tz.paredes([[x0 + L + 0.08, yt], [x0, yt], [x0, yb], [x0 + L + 0.08, yb]], { tipo: adiab ? 'adiabatica' : 'conductora', grueso: hover === 'gas' });
    tz.moleculas({ x0, x1: xp, y0: yb, y1: yt }, Termo.posicionesMoleculas(MOL, fase(t), fase(t) * 2.2));
    const bb = tz.embolo(xp, xp + 0.032, yb, yt - yb, { centroMasa: false });
    void bb;
    tz.linea([[xp + 0.032, CIL.yc], [xp + 0.13, CIL.yc]], { grosor: 2 });
    if (sel === 'gas') { const [X, Y, W, H] = tz.rectPx(x0, yb, xp, yt); tz.seleccionRegion(X, Y, W, H, { dentroX: true, dentroY: true }); }
    // Rumbo del tramo en este instante: signo del calor y del cambio de volumen
    if (enCurso) {
      const a = estadoCiclo(SIM, t - 1e-3), b = estadoCiclo(SIM, t + 1e-3), dQ = b.Q - a.Q, dV = b.V - a.V;
      const s0 = estadoCiclo(SIM, t);
      if (Math.abs(dQ) > 1e-9 * Math.max(1, Math.abs(SIM.total.Qabs))) {
        const ent = dQ > 0, Yb = v.Y(yb) + (adiab ? 10 : 2), L1 = 30;
        for (const fx of [0.3, 0.6]) { const X = v.X(x0 + (xp - x0) * fx); tz.flechaCalor(X, ent ? Yb + L1 : Yb + 4, X, ent ? Yb + 4 : Yb + L1); }
        tz.etiquetaMagnitud(v.X(x0 + (xp - x0) * 0.6) + 10, Yb + 26, { simbolo: 'Q', valor: s0.tramo.Q, unidad: 'J', color: 'termico', cifras: 3, prefijo: true });
      }
      if (Math.abs(dV) > 1e-12) {
        const Yr = v.Y(CIL.yc) - 16, Xa = v.X(xp + 0.07), d = dV > 0 ? 1 : -1;
        tz.termoFlechaTrabajo(Xa - d * 18, Yr, Xa + d * 18, Yr, [{ t: 'W', f: 'sim', tam: 13 }, { t: ` = ${kJ(s0.tramo.W)}`, f: 'num', tam: 11, color: 'texto-2' }]);
      }
    }
    // Ficha con el estado del gas
    const Xf = v.X(x0), Yf = v.Y(yb) + 46;
    tz.ficha(Xf, Yf, [
      [{ t: x ? (enCurso ? `Tramo ${x.desde} → ${x.hasta} · ${proc(tipo)}` : t >= SIM.duracion - 1e-9 ? 'Final del recorrido' : `Estado ${t <= 1e-9 ? SIM.inicio : x.hasta}`) : `Estado ${SIM.inicio}`, f: 'ui', tam: 11.5 }],
      [{ t: 'P', f: 'sim', tam: 13 }, { t: ' = ' + Ptxt(s.P) + '   ', f: 'num', tam: 11.5 }, { t: 'V', f: 'sim', tam: 13 }, { t: ' = ' + Vtxt(s.V), f: 'num', tam: 11.5 }],
      [{ t: 'T', f: 'sim', tam: 13, color: 'termico' }, { t: ' = ' + cantidad(s.T, 'K', 4) + '   ', f: 'num', tam: 11.5 }, { t: 'U', f: 'sim', tam: 13 }, { t: ' = ' + kJ(s.U, 4), f: 'num', tam: 11.5 }],
    ]);
    const nom = GASES.find(g => g[0] === SIM.gas.f);
    tz.compuesto([{ t: 'Gas ideal ' + (nom ? nom[1].toLowerCase() : `(f = ${fmt(SIM.gas.f, 3)})`) + ' · ', f: 'ui', tam: 11.5, color: 'texto-3' }, { t: 'n', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(SIM.gas.n, 'mol', 3), f: 'num', tam: 11.5, color: 'texto-2' }], Xf, v.Y(yt) - 14, {});
  }

  // Tramo candidato bajo el cursor con la herramienta elegida
  function candidato(w) {
    const ult = SIM.estados[SIM.final], V = Math.max(1e-9, Vx(w[0])), P = Math.max(1, Py(w[1]));
    const tr = { tipo: herramienta };
    if (herramienta === 'isocorico') tr.P = P; else if (herramienta === 'recta') { tr.V = V; tr.P = P; } else tr.V = V;
    void ult;
    return tr;
  }
  function previa() {
    const tr = candidato(cursor);
    let prueba;
    try { const cc = cicloActual(); cc.tramos = [...cc.tramos, tr]; prueba = simularCiclo(cc); } catch { return; }
    const i = prueba.tramos.length - 1, x = prueba.tramos[i];
    tz.lineaPx(curvaTramo(prueba, i, 48).map(([V, P]) => Pp(V, P)), { color: 'texto-2', grosor: 1.5, patron: 'previsto', extremo: 'butt' });
    const [X, Y] = Pp(x.b.V, x.b.P);
    tz.ficha(X + 12, Y - 34, [[{ t: `${NOMBRES_TRAMO[x.tipo]} → ${x.hasta}`, f: 'ui', tam: 11.5 }],
      [{ t: 'Q', f: 'sim', tam: 13, color: 'termico' }, { t: ` = ${kJ(x.Q)}   `, f: 'num', tam: 11.5 }, { t: 'W', f: 'sim', tam: 13 }, { t: ` = ${kJ(x.W)}`, f: 'num', tam: 11.5 }]]);
  }

  // Objeto bajo el cursor (px)
  function objetoEn(X, Y) {
    if (!SIM) return null;
    for (const e of Object.values(SIM.estados)) { const [x, y] = Pp(e.V, e.P); if (Math.hypot(x - X, y - Y) < 9) return 'e:' + e.nombre; }
    for (let i = SIM.tramos.length - 1; i >= 0; i--) {
      const pts = curvaTramo(SIM, i, 48).map(([V, P]) => Pp(V, P));
      for (let j = 0; j < pts.length - 1; j++) {
        const [ax, ay] = pts[j], [bx, by] = pts[j + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
        const u = Math.max(0, Math.min(1, ((X - ax) * dx + (Y - ay) * dy) / L2));
        if (Math.hypot(ax + u * dx - X, ay + u * dy - Y) < 6) return 't' + i;
      }
    }
    if (capas.cilindro) {
      const s = estadoCiclo(SIM, t), xp = CIL.x0 + CIL.largo * Math.min(1.05, s.V / GEO.Vax);
      const [x, y, w, h] = tz.rectPx(CIL.x0, CIL.yc - CIL.alto / 2, xp + 0.13, CIL.yc + CIL.alto / 2);
      if (X >= x && X <= x + w && Y >= y && Y <= y + h) return 'gas';
    }
    return null;
  }

  // ---------------------------------------------------------------------
  // Inspector, árbol, lecturas y examen
  // ---------------------------------------------------------------------
  const fila = (etq, control) => `<div class="fila"><span class="etq">${etq}</span>${control}</div>`;
  const campoNum = (id, val, u, ayuda) => `<div class="campo"${ayuda ? ` data-ayuda="${ayuda}"` : ''}><input id="${id}" value="${val}" inputmode="decimal"><span class="u">${u}</span></div>`;
  const campoFijo = (val, u, ayuda) => `<div class="campo"${ayuda ? ` data-ayuda="${ayuda}"` : ''}><input value="${val}" readonly tabindex="-1"><span class="u">${u}</span></div>`;
  const campoVar = k => `<div class="campo es-variable" data-ayuda="Ligado a la variable ${VAR[k].sim}|Bound to variable"><span class="chip-var"><span class="sim">${simHTML(VAR[k])}</span></span><span class="valor-var">${fmtVar(VAR[k])}</span><span class="u">${VAR[k].u}</span></div>`;
  const numCampo = x => String(Number(Number(x).toPrecision(5))).replace('-', '−');
  /** Tramo que define un estado (para editar su valor final). */
  const tramoDe = nombre => { const c = cicloActual(); let actual = c.inicio.nombre || 'A'; const nombres = [actual]; for (let i = 0; i < c.tramos.length; i++) { const tr = c.tramos[i]; if (tr.hasta) { actual = tr.hasta; continue; } const nom = tr.nombre && !nombres.includes(tr.nombre) ? tr.nombre : [...LETRAS].find(l => !nombres.includes(l)); nombres.push(nom); if (nom === nombre) return i; actual = nom; } return -1; };

  function inspector() {
    if (!SIM) return;
    let ico = 'o-gas', nombre = 'Gas', html = '', titulo = 'Propiedades';
    if (sel.startsWith('e:') && SIM.estados[sel.slice(2)]) {
      const e = SIM.estados[sel.slice(2)], i = tramoDe(e.nombre), c = cicloActual();
      ico = 'i-escena'; nombre = `Estado ${e.nombre}`; titulo = 'Estado';
      const tr = i >= 0 ? c.tramos[i] : null, inicial = e.nombre === SIM.inicio;
      const editP = inicial || (tr && (tr.tipo === 'isocorico' || tr.tipo === 'recta') && tr.P != null && !tr.corta);
      const editV = inicial || (tr && tr.tipo !== 'isocorico' && tr.V != null && !tr.corta);
      html = fila('Presión', editP ? campoNum('c-P', numCampo(e.P / 1e3), 'kPa', 'Edita la presión del estado|Pressure') : campoFijo(numCampo(e.P / 1e3), 'kPa'))
        + fila('Volumen', editV ? campoNum('c-V', numCampo(e.V * fV()), uV(), 'Edita el volumen del estado|Volume') : campoFijo(numCampo(e.V * fV()), uV()))
        + fila('Temperatura', campoFijo(numCampo(e.T), 'K'))
        + `<p class="ayuda-fila">${inicial ? 'Estado inicial del recorrido.' : tr ? `Llega con un tramo ${proc(tr.tipo)}${tr.corta ? ', donde corta la curva de otro estado' : ''}.` : 'Estado que cierra el ciclo.'}${(editP || editV) && !propio ? ' Al editarlo, la escena pasa a ser propia.' : ''}</p>`;
    } else if (sel.startsWith('t') && SIM.tramos[+sel.slice(1)]) {
      const i = +sel.slice(1), x = SIM.tramos[i];
      ico = ICONO_PROCESO[x.tipo]; nombre = `Tramo ${x.desde} → ${x.hasta}`; titulo = 'Proceso';
      html = fila('Proceso', campoFijo(NOMBRES_TRAMO[x.tipo], ''))
        + `<div class="acciones-fila" style="padding:4px 0 2px"><button class="btn btn-secundario btn-compacto" id="b-quitar-desde"><svg class="ico"><use href="#i-borrar"/></svg>Quitar este tramo y los siguientes</button></div>`;
    } else {
      sel = 'gas';
      html = (ESC.nota && !propio ? `<p class="ayuda-fila" style="margin:2px 0 8px">${ESC.nota}</p>` : '')
        + fila('Cantidad', VAR.n && !propio ? campoVar('n') : propio ? campoVar('n') : campoFijo(numCampo(SIM.gas.n), 'mol'))
        + (VAR.f && !propio ? fila('Gas', `<div class="segmentado texto" id="p-gas">${[[3, 'Ar (f = 3)'], [5, 'N₂ (f = 5)']].map(([f, txt]) => `<button data-f="${f}" aria-pressed="${VAR.f.val === f}">${txt}</button>`).join('')}</div>`)
          : fila('Especie', `<div class="segmentado texto" id="p-gas" data-ayuda="Grados de libertad: 3 monoatómico, 5 diatómico, 6 triatómico|Degrees of freedom">${GASES.map(([f, txt]) => `<button data-f="${f}" aria-pressed="${SIM.gas.f === f}" data-ayuda="${txt}|${f === 3 ? 'Monatomic' : f === 5 ? 'Diatomic' : 'Triatomic'}"><span class="sim">f</span> = ${f}</button>`).join('')}</div>`));
    }
    $('#insp-ico').setAttribute('href', '#' + ico);
    $('#insp-nombre').textContent = nombre;
    $('#props-titulo').textContent = titulo;
    $('#propiedades').innerHTML = html;
    const pg = $('#p-gas'); if (pg) pg.addEventListener('click', ev => { const b = ev.target instanceof Element ? ev.target.closest('button') : null; if (b) cambiarGas(+b.dataset.f); });
    const bq = $('#b-quitar-desde'); if (bq) bq.addEventListener('click', () => quitarDesde(+sel.slice(1)));
    for (const [id, cual] of [['#c-P', 'P'], ['#c-V', 'V']]) { const ent = $(id); if (ent) ent.addEventListener('change', () => editarEstado(sel.slice(2), cual, ent.value)); }
    arbol();
  }

  function arbol() {
    const nodo = (s, ico, nom, dato) => `<div class="nodo" data-sel="${s}" aria-selected="${sel === s}"><svg class="ico"><use href="#${ico}"/></svg><span class="nombre">${nom}</span><span class="dato">${dato}</span></div>`;
    let h = nodo('gas', 'o-gas', 'Gas', cantidad(SIM.gas.n, 'mol', 3));
    for (const nom of SIM.orden) h += nodo('e:' + nom, 'i-escena', `Estado ${nom}`, cantidad(SIM.estados[nom].T, 'K', 4));
    SIM.tramos.forEach((x, i) => { h += nodo('t' + i, ICONO_PROCESO[x.tipo], `${x.desde} → ${x.hasta}`, proc(x.tipo)); });
    $('#arbol').innerHTML = h;
  }
  $('#arbol').addEventListener('click', ev => { const n = ev.target instanceof Element ? ev.target.closest('.nodo') : null; if (n) seleccionar(n.dataset.sel); });
  function seleccionar(s) { sel = s; inspector(); lecturas(); dibujar(); }

  function lecturas() {
    if (!SIM) return;
    const s = estadoCiclo(SIM, t);
    pintarReloj(t);
    $('#lect-titulo').textContent = `Lecturas en t = ${fmt(t, 4)} s`;
    let filas;
    if (sel.startsWith('t') && SIM.tramos[+sel.slice(1)]) {
      const x = SIM.tramos[+sel.slice(1)];
      filas = [['Q', x.Q, 'J', 'Calor que recibe el gas|Heat'], ['W', x.W, 'J', 'Trabajo que hace el gas|Work'], ['Δ<span class="sim">U</span>', x.dU, 'J', 'Variación de energía interna|Internal energy change'],
        ['Δ<span class="sim">S</span>', x.dS, 'J/K', 'Variación de entropía|Entropy change'], ['Q<sub class="r">abs</sub>', x.Qabs, 'J', 'Calor absorbido en el tramo|Heat absorbed'], ['Q<sub class="r">ced</sub>', x.Qced, 'J', 'Calor cedido en el tramo|Heat released']];
      $('#insp-estado').textContent = `${NOMBRES_TRAMO[x.tipo]} · de ${fmt(x.t0, 3)} s a ${fmt(x.t1, 3)} s`;
    } else if (sel.startsWith('e:') && SIM.estados[sel.slice(2)]) {
      const e = SIM.estados[sel.slice(2)];
      filas = [['P', e.P / 1e3, 'kPa'], ['V', e.V * fV(), uV()], ['T', e.T, 'K'], ['U', e.U, 'J', 'Energía interna, f/2·n·R·T|Internal energy'], ['S', e.S, 'J/K', `Entropía respecto del estado ${SIM.inicio}|Entropy`]];
      $('#insp-estado').textContent = `P·V = n·R·T · ${cantidad(e.P * e.V, 'J', 4)}`;
    } else {
      filas = [['P', s.P / 1e3, 'kPa'], ['V', s.V * fV(), uV()], ['T', s.T, 'K'], ['U', s.U, 'J', 'Energía interna|Internal energy'],
        ['Q', s.Q, 'J', 'Calor recibido desde el estado inicial|Heat'], ['W', s.W, 'J', 'Trabajo hecho por el gas desde el estado inicial|Work'], ['Δ<span class="sim">U</span>', s.dU, 'J', 'Q − W|Internal energy change']];
      if (SIM.ciclo) filas.push(['η', SIM.rendimiento ?? NaN, '', 'Rendimiento W/Q_abs (solo si el ciclo hace trabajo)|Efficiency'], ['η<sub class="r">C</sub>', SIM.carnot, '', 'Rendimiento de Carnot entre T_mín y T_máx|Carnot efficiency']);
      if (ESC.extra && !propio) filas.push(...ESC.extra(SIM, vals()));
      $('#insp-estado').textContent = `Gas ideal · ${SIM.ciclo ? 'ciclo cerrado' : SIM.tramos.length ? `${SIM.tramos.length} tramo${SIM.tramos.length > 1 ? 's' : ''}` : 'sin tramos'}`;
    }
    $('#lecturas').innerHTML = filas.map(([a, val, u, ay]) => filaLectura([/^[A-Za-zηΔ]/.test(a) && !a.includes('<') ? `<span class="sim">${a}</span>` : a.startsWith('Δ') || a.includes('<') ? a.replace(/^([A-Za-zη])/, '<span class="sim">$1</span>') : a, val, u, ay])).join('');
    $('#grupo-examen').hidden = !FILAS.length;
    if (FILAS.length) { $('#examen-titulo').textContent = `Examen · MEXT ${ESC.anio}`; $('#examen').innerHTML = examenHTML(FILAS, t); }
    document.querySelectorAll('[data-var]').forEach(e => { e.textContent = fmtVar(VAR[e.dataset.var]); });
  }

  // ---------------------------------------------------------------------
  // Paneles inferiores: gráficas, tramos, energía, estados
  // ---------------------------------------------------------------------
  const lt = new LineaTiempo($('#tl'), { duracion: 1, eventos: [], alCambiar: nt => repro.irA(nt) });
  function rango(xs, fr = 0.1) { let a = Math.min(...xs), b = Math.max(...xs); const d = Math.max(b - a, Math.abs(b) * 0.05, 1e-9); return { min: a - d * fr, max: b + d * fr }; }
  function camino(f, hasta = SIM.duracion) { const p = [], N = 240; for (let i = 0; i <= N; i++) { const tt = SIM.duracion * i / N; if (tt > hasta + 1e-12) break; p.push(f(estadoCiclo(SIM, tt))); } if (hasta < SIM.duracion) p.push(f(estadoCiclo(SIM, hasta))); return p; }
  function graficas() {
    if ($('#p-graficas').hidden || !SIM) return;
    const s = estadoCiclo(SIM, t), todo = camino(q => q);
    $('#uV').textContent = uV();
    const gT = rango(todo.map(q => q.T)), gV = rango(todo.map(q => q.V * fV())), gP = rango(todo.map(q => q.P / 1e3));
    const est = Object.values(SIM.estados);
    const dibujarDiag = (cv, fy, ry) => {
      const r = grafica(cv, { x: gT, y: ry, series: [{ tramos: [todo.map(q => [q.T, fy(q)])], familia: 'texto-3', auxiliar: true }, { tramos: [camino(q => [q.T, fy(q)], t)], familia: 'tinta' }], puntoCursor: [s.T, fy(s)], eventos: [] });
      const c = cv.getContext('2d'), tk = Volta.leerTokens();
      c.save(); c.font = '600 11px "IBM Plex Sans", sans-serif'; c.fillStyle = tk.tinta; c.textAlign = 'left';
      for (const e of est) { c.beginPath(); c.arc(r.X(e.T), r.Y(fy(e)), 2.5, 0, 2 * Math.PI); c.fill(); c.fillText(e.nombre, r.X(e.T) + 5, r.Y(fy(e)) - 4); }
      c.restore();
    };
    dibujarDiag($('#g1'), q => q.V * fV(), gV);
    dibujarDiag($('#g2'), q => q.P / 1e3, gP);
    $('#l1').textContent = `${Vtxt(s.V)} · ${cantidad(s.T, 'K', 4)}`;
    $('#l2').textContent = `${Ptxt(s.P)} · ${cantidad(s.T, 'K', 4)}`;
    const N = 240, serieE = (k, hasta = SIM.duracion) => { const p = []; for (let i = 0; i <= N; i++) { const tt = SIM.duracion * i / N; if (tt > hasta) break; p.push([tt, estadoCiclo(SIM, tt)[k]]); } return p; };
    const todos = ['Q', 'W', 'dU'].flatMap(k => serieE(k).map(p => p[1]));
    grafica($('#g3'), { x: { min: 0, max: SIM.duracion }, y: rango([0, ...todos], 0.08), cursor: t, eventos: SIM.tramos.map(x => ({ x: x.t1 })),
      series: [{ tramos: [serieE('Q')], familia: 'termico' }, { tramos: [serieE('W')], familia: 'tinta', patron: 'discontinuo' }, { tramos: [serieE('dU')], familia: 'tinta' }] });
    $('#l3').textContent = `Q = ${kJ(s.Q)}`;
  }
  function tablas() {
    if (!SIM) return;
    const k = tramoActual(t);
    if (!$('#p-tramos').hidden) {
      let h = '<tr><th>Tramo</th><th>Proceso</th><th>Q (J)</th><th>W (J)</th><th>ΔU (J)</th><th>ΔS (J/K)</th><th>Q abs (J)</th><th>Q ced (J)</th></tr>';
      SIM.tramos.forEach((x, i) => { h += `<tr class="${i === k ? 'actual' : ''}"><td class="texto">${x.desde} → ${x.hasta}</td><td class="texto">${NOMBRES_TRAMO[x.tipo]}</td><td>${fmt(x.Q, 5)}</td><td>${fmt(x.W, 5)}</td><td>${fmt(x.dU, 5)}</td><td>${fmt(x.dS, 4)}</td><td>${fmt(x.Qabs, 5)}</td><td>${fmt(x.Qced, 5)}</td></tr>`; });
      const T = SIM.total;
      h += `<tr><td class="texto"><b>Total</b></td><td class="texto">${SIM.ciclo ? 'ciclo cerrado' : 'recorrido abierto'}</td><td>${fmt(T.Q, 5)}</td><td>${fmt(T.W, 5)}</td><td>${fmt(T.dU, 5)}</td><td>${fmt(T.dS, 4)}</td><td>${fmt(T.Qabs, 5)}</td><td>${fmt(T.Qced, 5)}</td></tr>`;
      $('#t-tramos').innerHTML = h;
    }
    if (!$('#p-estados').hidden) {
      let h = `<tr><th>Estado</th><th>P (kPa)</th><th>V (${uV()})</th><th>T (K)</th><th>U (J)</th><th>S (J/K)</th></tr>`;
      for (const nom of SIM.orden) { const e = SIM.estados[nom]; h += `<tr class="${sel === 'e:' + nom ? 'actual' : ''}"><td class="texto">${nom}</td><td>${fmt(e.P / 1e3, 5)}</td><td>${fmt(e.V * fV(), 5)}</td><td>${fmt(e.T, 5)}</td><td>${fmt(e.U, 5)}</td><td>${fmt(e.S, 4)}</td></tr>`; }
      $('#t-estados').innerHTML = h;
    }
    if (!$('#p-energia').hidden) energia();
  }
  function energia() {
    const T = SIM.total, esc = Math.max(1e-9, T.Qabs, T.Qced, Math.abs(T.W));
    const barra = (n, fam, val, ayuda, escala = esc, u = 'J') => {
      const p = Math.min(50, Math.abs(val) / escala * 50), pos = val >= 0 ? `left:50%;width:${p}%` : `left:${50 - p}%;width:${p}%`;
      const col = fam === 'tinta' ? 'var(--tinta)' : `var(--f-${fam})`;
      return `<div class="barra-e" data-ayuda="${ayuda}"><span>${n}</span><span class="riel"><i style="${pos};background:${col}"></i></span><span class="v">${u === '%' ? fmt(val * 100, 4) + ' %' : cantidad(val, u, 4)}</span></div>`;
    };
    $('#e-flujo').className = 'barras con-signo';
    $('#e-flujo').innerHTML = `<div class="barras-tit">Flujo de energía ${SIM.ciclo ? 'en un ciclo' : 'del recorrido'}</div>`
      + barra('Calor absorbido', 'termico', T.Qabs, 'Suma del calor que entra en los tramos que absorben|Heat absorbed')
      + barra('Calor cedido', 'termico', -T.Qced, 'Calor que sale en los tramos que ceden|Heat released')
      + barra('Trabajo neto <span class="sim">W</span>', 'tinta', T.W, 'Trabajo neto que hace el gas: el área encerrada|Net work')
      + barra('Δ<span class="sim">U</span>', 'tinta', T.dU, 'En un ciclo cerrado es cero|Internal energy change')
      + `<div class="barras-pie"><span class="sim">Q</span><sub>abs</sub> − <span class="sim">Q</span><sub>ced</sub> − <span class="sim">W</span> = ${cantidad(T.Qabs - T.Qced - T.W - T.dU, 'J', 2)}</div>`;
    $('#e-rend').className = 'barras';
    $('#e-rend').innerHTML = '<div class="barras-tit">Rendimiento frente a Carnot</div>'
      + (SIM.rendimiento != null ? barra('Ciclo  W/Q<sub>abs</sub>', 'tinta', SIM.rendimiento, 'Rendimiento del ciclo|Efficiency', 0.5, '%') : '<p class="ayuda-fila">Sin rendimiento: el recorrido no es un ciclo que haga trabajo neto.</p>')
      + barra('Carnot  1 − T<sub>mín</sub>/T<sub>máx</sub>', 'termico', SIM.carnot, 'El mayor rendimiento posible entre las temperaturas extremas del recorrido|Carnot efficiency', 0.5, '%')
      + `<div class="barras-pie">T<sub>mín</sub> = ${cantidad(SIM.Tmin, 'K', 4)} · T<sub>máx</sub> = ${cantidad(SIM.Tmax, 'K', 4)}</div>`;
  }

  // ---------------------------------------------------------------------
  // Edición del ciclo
  // ---------------------------------------------------------------------
  function hacerPropio() {
    if (propio) return;
    CIC = cicloActual(); propio = true;
    VAR = { n: { sim: 'n', val: CIC.n, min: Math.min(0.01, CIC.n), max: Math.max(5, CIC.n), paso: 0.01, u: 'mol' } };
    construirVars(); titulo();
  }
  function aplicar(nuevo, mensaje) {
    try { simularCiclo({ ...nuevo, f: fGas ?? nuevo.f }); }
    catch (e) { avisar(e.message); return false; }
    hacerPropio(); CIC = nuevo; CIC.n = VAR.n.val;
    recalcular(); registrar(); if (mensaje) avisar(mensaje, true);
    return true;
  }
  function anadirTramo(w) {
    const c = cicloActual(), tr = candidato(w), n = { ...c, tramos: [...c.tramos, tr] };
    if (aplicar(n, `${NOMBRES_TRAMO[tr.tipo]} añadido`)) { const nueva = SIM.tramos.length - 1; repro.irA(SIM.tramos[nueva].t1); }
  }
  function cerrarCiclo() {
    if (!SIM.tramos.length) { avisar('Primero añade algún tramo'); return; }
    if (SIM.ciclo) { avisar('El ciclo ya está cerrado'); return; }
    const c = cicloActual(), A = SIM.inicio;
    for (const tipo of [herramienta, 'isocorico', 'isobarico', 'isotermico', 'adiabatico', 'recta']) {
      if (!tipo) continue;
      try { simularCiclo({ ...c, tramos: [...c.tramos, { tipo, hasta: A }] }); }
      catch { continue; }
      aplicar({ ...c, tramos: [...c.tramos, { tipo, hasta: A }] }, `Ciclo cerrado con un tramo ${proc(tipo)}`);
      return;
    }
  }
  function quitarDesde(i) {
    const c = cicloActual();
    if (!c.tramos.length) return;
    aplicar({ ...c, tramos: c.tramos.slice(0, Math.max(0, i)) }, i >= c.tramos.length - 1 ? 'Último tramo quitado' : 'Tramos quitados');
    sel = 'gas'; inspector();
  }
  function editarEstado(nombre, cual, txt) {
    const x = parseFloat(String(txt).replace('−', '-').replace(',', '.'));
    if (!(x > 0)) { avisar('El valor tiene que ser un número positivo'); inspector(); return; }
    const c = cicloActual(), SI = cual === 'P' ? x * 1e3 : x / fV();
    if (nombre === (c.inicio.nombre || 'A')) { c.inicio = { nombre: c.inicio.nombre || 'A', P: cual === 'P' ? SI : SIM.estados[nombre].P, V: cual === 'V' ? SI : SIM.estados[nombre].V }; }
    else { const i = tramoDe(nombre); if (i < 0) return; c.tramos[i] = { ...c.tramos[i], [cual]: SI }; delete c.tramos[i].T; }
    aplicar(c, `Estado ${nombre} cambiado`);
    inspector();
  }
  function cambiarGas(f) {
    if (VAR.f && !propio) { VAR.f.val = f; construirVars(); }
    else fGas = f;
    recalcular(); registrar(); inspector();
  }

  // ---------------------------------------------------------------------
  // Escena: abrir, guardar, autoguardado, deshacer
  // ---------------------------------------------------------------------
  function titulo() {
    ponerTitulo(propio ? { ...ESC, tipo: 'Propio', titulo: `${ESC.titulo} (modificada)` } : ESC, NOMBRE_ESPACIO);
  }
  function construirVars() { construirVariables($('#variables'), VAR, () => { if (propio && VAR.n) CIC.n = VAR.n.val; recalcular(); lecturas(); }, () => { setTimeout(registrar, 0); }); }
  const instantanea = () => ({ clave: ESC.clave, vars: vals(), propio, ciclo: propio ? CIC : null, f: fGas, capas: { ...capas } });
  function registrar() { if (historial && historial.registrar(instantanea())) botonesHistorial(); if (autoguardar) autoguardado.guardar('termodinamica-ciclos', escenaActual()); }
  function botonesHistorial() { $('#b-deshacer').disabled = !historial?.puedeDeshacer; $('#b-rehacer').disabled = !historial?.puedeRehacer; }
  function deshacer() { const d = historial?.deshacer(); if (d) { restaurar(d); botonesHistorial(); } }
  function rehacer() { const d = historial?.rehacer(); if (d) { restaurar(d); botonesHistorial(); } }

  // Valida y acota lo que viene de un archivo (entrada no confiable)
  function datosSeguros(d = {}) {
    const base = ESCENAS_CICLOS.find(e => e.clave === d.clave) || ESCENAS_CICLOS[0];
    const vars = {};
    for (const [k, def] of Object.entries(base.variables || {})) vars[k] = numero(d.vars?.[k], def.val, def.min, def.max);
    let ciclo = null;
    if (d.propio && d.ciclo && typeof d.ciclo === 'object') {
      const c = d.ciclo, nombre = s => (typeof s === 'string' && /^[A-Za-z]{1,2}$/.test(s) ? s : undefined);
      const positivo = (x, max) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.min(x, max) : undefined);
      const ini = c.inicio && typeof c.inicio === 'object' ? c.inicio : {};
      ciclo = {
        n: numero(c.n, 1, 1e-3, 100), f: numero(c.f, 3, 1, 20),
        inicio: { P: positivo(ini.P, 1e9), V: positivo(ini.V, 1e3), T: positivo(ini.T, 1e5), nombre: nombre(ini.nombre) || 'A' },
        tramos: (Array.isArray(c.tramos) ? c.tramos : []).slice(0, 24).filter(tr => tr && TIPOS_TRAMO.includes(tr.tipo)).map(tr => {
          const o = { tipo: tr.tipo };
          for (const k of ['V', 'P', 'T']) { const x = positivo(tr[k], k === 'V' ? 1e3 : k === 'P' ? 1e9 : 1e5); if (x != null) o[k] = x; }
          for (const k of ['hasta', 'desde', 'nombre']) { const s = nombre(tr[k]); if (s) o[k] = s; }
          if (tr.corta && typeof tr.corta === 'object' && ['isobarico', 'isocorico', 'isotermico', 'adiabatico'].includes(tr.corta.tipo) && nombre(tr.corta.estado)) o.corta = { tipo: tr.corta.tipo, estado: nombre(tr.corta.estado) };
          return o;
        }),
      };
      if (ciclo.inicio.T == null) delete ciclo.inicio.T;
      if (ciclo.inicio.P == null) delete ciclo.inicio.P;
      if (ciclo.inicio.V == null) delete ciclo.inicio.V;
      try { simularCiclo(ciclo); } catch { ciclo = null; }
    }
    const capasOk = {};
    for (const k of Object.keys(capas)) capasOk[k] = typeof d.capas?.[k] === 'boolean' ? d.capas[k] : true;
    return { clave: base.clave, vars, propio: !!ciclo, ciclo, f: [3, 5, 6].includes(d.f) ? d.f : null, capas: capasOk };
  }
  function restaurar(d) {
    const s = datosSeguros(d);
    ESC = escenaPorClave(s.clave) || ESCENAS_CICLOS[0];
    VAR = copia(ESC.variables || {});
    for (const k in s.vars) if (VAR[k]) VAR[k].val = s.vars[k];
    propio = s.propio; CIC = s.ciclo; fGas = s.f; Object.assign(capas, s.capas);
    if (propio) VAR = { n: { sim: 'n', val: CIC.n, min: Math.min(0.01, CIC.n), max: Math.max(5, CIC.n), paso: 0.01, u: 'mol' } };
    document.querySelectorAll('.capa-btn').forEach(b => b.setAttribute('aria-pressed', String(!!capas[b.dataset.capa])));
    titulo(); construirVars(); SIM = null; simular();
    if (!SIM.estados[sel.slice(2)] && !SIM.tramos[+sel.slice(1)]) sel = 'gas';
    inspector(); recalcular(false);
  }
  function abrirEscena1(clave) {
    const e = escenaPorClave(clave);
    if (!e) return;
    if (e.espacio !== ESPACIO) { irAEscenaDeOtroEspacio(e); return; }
    ESC = e; VAR = copia(e.variables || {}); propio = false; CIC = null; fGas = null; sel = 'gas'; herramienta = null; marcarHerramienta();
    titulo(); construirVars(); SIM = null; simular();
    vistaTocada = false; encuadrar(); escala0 = tz.vista.escala; zoomTexto();
    inspector(); recalcular(false); repro.irA(0);
    if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); }
  }
  function escenaActual() {
    return crearEscena({ modulo: 'termodinamica', espacio: ESPACIO, titulo: propio ? `${ESC.titulo} (modificada)` : ESC.titulo, datos: instantanea() });
  }
  function guardar() { guardarEscena(escenaActual()).then(r => { if (r) avisar('Escena guardada'); }, e => avisar(`No se pudo guardar: ${e}`)); }
  function abrir() {
    abrirEscena({ modulo: 'termodinamica' }).then(e => {
      if (aOtroEspacio(e, ESPACIO)) return;
      restaurar(e.datos); repro.irA(0);
      if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); }
      avisar(`Escena abierta: ${texto(e.titulo, 'sin título', 60)}`);
    }).catch(err => avisar(err.message));
  }

  function recalcular(registrarCambio = true) {
    simular();
    lt.duracion = Math.max(SIM.duracion, 1e-6); lt.simulado = lt.duracion;
    lt.eventos = SIM.tramos.map(x => ({ t: x.t1, nombre: `Llega a ${x.hasta} (${proc(x.tipo)})` }));
    if (t > SIM.duracion) t = SIM.duracion;
    if (!SIM.estados[sel.slice(2)] && !SIM.tramos[+sel.slice(1)] && sel !== 'gas') { sel = 'gas'; inspector(); } else arbol();
    todo();
    if (registrarCambio && autoguardar) autoguardado.guardar('termodinamica-ciclos', escenaActual());
  }
  function todo() { dibujar(); lecturas(); lt.poner(t); graficas(); tablas(); }

  // ---------------------------------------------------------------------
  // Exportar
  // ---------------------------------------------------------------------
  function exportarCSV() {
    const filas = SIM.orden.map(n => { const e = SIM.estados[n]; return ['estado', n, '', e.P, e.V, e.T, e.U, '', '', '']; })
      .concat(SIM.tramos.map(x => ['tramo', `${x.desde}-${x.hasta}`, x.tipo, '', '', '', '', x.Q, x.W, x.dU]));
    descargarTexto(nombreArchivo(ESC.titulo) + '-ciclo.csv', aCSV(['tipo', 'nombre', 'proceso', 'P (Pa)', 'V (m³)', 'T (K)', 'U (J)', 'Q (J)', 'W (J)', 'ΔU (J)'], filas))
      .then(r => { if (r) avisar(`Datos exportados: ${filas.length} filas`); }, () => {});
  }
  $('#b-exportar').addEventListener('click', exportarCSV);

  // ---------------------------------------------------------------------
  // Paleta de procesos, capas, lienzo
  // ---------------------------------------------------------------------
  function marcarHerramienta() {
    document.querySelectorAll('#paleta-procesos .herr').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.herr === herramienta)));
    lienzo.style.cursor = herramienta ? 'crosshair' : 'default';
  }
  function ponerHerramienta(h) {
    herramienta = herramienta === h ? null : h; marcarHerramienta();
    if (herramienta) avisar(`${NOMBRES_TRAMO[h]}: clic en el diagrama para elegir el final del tramo desde ${SIM.final} · Esc termina`);
    dibujar();
  }
  document.querySelectorAll('#paleta-procesos .herr').forEach(b => b.addEventListener('click', () => ponerHerramienta(b.dataset.herr)));
  $('#b-cerrar').addEventListener('click', cerrarCiclo);
  $('#b-quitar').addEventListener('click', () => quitarDesde(SIM.tramos.length - 1));
  const alternarCapa = k => { capas[k] = !capas[k]; document.querySelectorAll(`.capa-btn[data-capa="${k}"]`).forEach(b => b.setAttribute('aria-pressed', String(capas[k]))); if (k === 'cilindro' && !vistaTocada) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } registrar(); dibujar(); };
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => alternarCapa(b.dataset.capa)));
  $('#pest').addEventListener('click', () => setTimeout(() => { graficas(); tablas(); }, 0));

  lienzo.addEventListener('pointerdown', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, v = tz.vista;
    if (ev.button === 1 || ev.button === 2 || espacioPulsado) { paneo = [X, Y, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId); return; }
    if (herramienta) { const w = [v.mx(X), v.my(Y)]; if (w[0] > 0 && w[1] > 0) { anadirTramo(w); if (!ev.shiftKey) { herramienta = null; marcarHerramienta(); } } return; }
    const ob = objetoEn(X, Y);
    if (ob) { seleccionar(ob); if (ob.startsWith('e:')) { const nom = ob.slice(2), x = SIM.tramos.find(q => q.hasta === nom); repro.irA(nom === SIM.inicio ? 0 : x ? x.t1 : t); } return; }
    paneo = [X, Y, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId);
  });
  lienzo.addEventListener('pointermove', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, v = tz.vista, w = [v.mx(X), v.my(Y)];
    const dentro = w[0] >= 0 && w[1] >= 0 && w[0] <= DW * 1.1 && w[1] <= DH * 1.1;
    $('#cx').textContent = dentro ? Vtxt(Vx(w[0])) : '—'; $('#cy').textContent = dentro ? Ptxt(Py(w[1])) : '—';
    if (paneo) { vistaTocada = true; v.ox = paneo[2] + X - paneo[0]; v.oy = paneo[3] + Y - paneo[1]; dibujar(); return; }
    if (herramienta) { cursor = dentro ? w : null; dibujar(); return; }
    const ob = objetoEn(X, Y);
    lienzo.style.cursor = ob ? 'pointer' : 'default';
    if (ob !== hover) { hover = ob; dibujar(); }
  });
  lienzo.addEventListener('pointerup', () => { paneo = null; });
  lienzo.addEventListener('pointerleave', () => { cursor = null; if (hover) { hover = null; } dibujar(); });
  lienzo.addEventListener('contextmenu', ev => ev.preventDefault());
  lienzo.addEventListener('wheel', ev => {
    ev.preventDefault(); const r = lienzo.getBoundingClientRect();
    vistaTocada = true; tz.vista.zoom(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top); zoomTexto(); dibujar();
  }, { passive: false });
  function zoomTexto() { $('#zoom').textContent = Math.round(tz.vista.escala / escala0 * 100) + ' %'; }
  function zoomCentro(f) { vistaTocada = true; tz.vista.zoom(f, tz.w / 2, tz.h / 2); zoomTexto(); dibujar(); }
  function encuadrarTodo() { vistaTocada = false; encuadrar(); escala0 = tz.vista.escala; zoomTexto(); dibujar(); }
  $('#b-zoom-mas').addEventListener('click', () => zoomCentro(1.25));
  $('#b-zoom-menos').addEventListener('click', () => zoomCentro(0.8));
  $('#b-encuadrar').addEventListener('click', encuadrarTodo);
  $('#b-deshacer').addEventListener('click', deshacer);
  $('#b-rehacer').addEventListener('click', rehacer);

  // ---------------------------------------------------------------------
  // Reproducción, menú de escenas, comandos y teclado
  // ---------------------------------------------------------------------
  const repro = crearReproductor({ duracion: () => (SIM ? SIM.duracion : 1), alCambiar: nt => { t = nt; todo(); } });
  iniciarMenuEscenas(ESCENAS_CICLOS, () => (propio ? '' : ESC.clave), abrirEscena1);
  const cmd = iniciarComandos(() => [
    ['i-reproducir', 'Reproducir o pausar', 'Espacio', repro.alternar],
    ['i-reiniciar', 'Volver al estado inicial', 'Inicio', () => repro.irA(0)],
    ...TIPOS_TRAMO.map((tp, i) => [ICONO_PROCESO[tp], `Añadir un tramo ${proc(tp)}`, String(i + 1), () => ponerHerramienta(tp), 'Procesos']),
    ['i-check', 'Cerrar el ciclo', 'C', cerrarCiclo, 'Procesos'],
    ['i-borrar', 'Quitar el último tramo', 'Supr', () => quitarDesde(SIM.tramos.length - 1), 'Procesos'],
    ['i-capas', 'Mostrar u ocultar la isoterma y la adiabática', 'R', () => alternarCapa('referencias')],
    ['i-capas', 'Mostrar u ocultar el calor de cada tramo', 'Q', () => alternarCapa('calor')],
    ['o-cilindro', 'Mostrar u ocultar el cilindro', '', () => alternarCapa('cilindro')],
    ['i-historial', 'Restablecer la escena original', '', () => abrirEscena1(ESC.clave)],
    ['i-encuadrar', 'Encuadrar todo', 'F', encuadrarTodo],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['i-deshacer', 'Deshacer', 'Ctrl Z', deshacer], ['i-rehacer', 'Rehacer', 'Ctrl Y', rehacer],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar], ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
    ['i-exportar', 'Exportar estados y tramos a CSV', '', exportarCSV],
    ['i-imagen', 'Exportar imagen del lienzo', '', () => descargarLienzo(lienzo, nombreArchivo(ESC.titulo) + '.png')],
    ...ESCENAS_CICLOS.map(e => [ICONO_TIPO[e.tipo], `Abrir escena: ${e.titulo}`, chipDe(e), () => abrirEscena1(e.clave), 'Escenas']),
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
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) repro.alternar(); espacioPulsado = true; }
    else if (ev.key === 'ArrowRight') repro.irA(t + repro.paso());
    else if (ev.key === 'ArrowLeft') repro.irA(t - repro.paso());
    else if (ev.key === 'Home') repro.irA(0);
    else if (ev.key === 'Escape') { if (herramienta) { herramienta = null; marcarHerramienta(); dibujar(); } }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') quitarDesde(SIM.tramos.length - 1);
    else if (tecla >= '1' && tecla <= '5') ponerHerramienta(TIPOS_TRAMO[+tecla - 1]);
    else if (tecla === 'c') cerrarCiclo();
    else if (tecla === 'f') encuadrarTodo();
    else if (tecla === 'r') alternarCapa('referencias');
    else if (tecla === 'q') alternarCapa('calor');
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });

  // ---------------------------------------------------------------------
  // Arranque. Parámetros: ?escena=mext-2018-p4&t=3&sel=t1&pest=tramos
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); if (!vistaTocada) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search), limpio = ![...q.keys()].filter(k => k !== 'tema').length;
    const pend = escenaPendiente('termodinamica');
    if (pend && aOtroEspacio(pend, ESPACIO)) return;
    const previa = pend || (limpio ? autoguardado.leer('termodinamica-ciclos', { modulo: 'termodinamica' }) : null);
    tz.ajustar();
    if (q.has('escena') || !previa) {
      const e = escenaPorClave(q.get('escena') || '') || ESCENAS_CICLOS[0];
      if (e.espacio !== ESPACIO) { irAEscenaDeOtroEspacio(e); return; }
      ESC = e; VAR = copia(e.variables || {});
      titulo(); construirVars(); simular();
    } else restaurar(previa.datos);
    if (q.has('sel')) { const s = q.get('sel'); if (s === 'gas' || SIM.estados[s] || /^t\d+$/.test(s)) sel = SIM.estados[s] ? 'e:' + s : s; }
    autoguardar = limpio || !!previa;
    encuadrar(); escala0 = tz.vista.escala; zoomTexto();
    inspector(); recalcular(false);
    const pe = q.get('pest'); if (pe) { const b = document.querySelector(`#pest [aria-controls="p-${pe}"]`); if (b) b.click(); }
    if (q.has('t')) repro.irA(parseFloat(q.get('t')) || 0); else repro.irA(0);
    historial = new Historial(instantanea()); botonesHistorial();
    repro.arrancar();
  });
})();
