/* ==========================================================================
   Volta · Ondas y sonido — espacio de trabajo "Doppler y acústica"
   Fuentes sonoras y observadores que se mueven en línea recta, fuentes que
   van de vaivén sobre un arco (la rejilla de un ventilador que oscila),
   viento y paredes reflectantes (quietas o en movimiento a lo largo de su
   normal).
   Modelo cinemático exacto del motor sistema/motores/ondas.js (probado en
   pruebas/ondas.test.js): cada frente nace donde estaba la fuente y viaja
   con el aire; la frecuencia recibida sale del instante de emisión resuelto
   con Brent; el eco de una pared que se mueve, de su fuente imagen.
   Lo que oye el observador seleccionado se sintetiza con Web Audio solo al
   pulsar «Escuchar» (nunca suena solo), con el retraso y la amplitud 1/r de
   cada camino: las pulsaciones se oyen.
   Parámetros de URL para capturas: ?escena=…&t=…&pest=energia|eventos|tabla&obs=1
   ========================================================================== */
import { recepcion, frentesOnda, posicionEn, velocidadEn, frecuenciaPulsacion, velocidadSonido } from '../motores/ondas.js';
import { aCSV } from '../nucleo/csv.js';
import { descargarTexto, descargarLienzo, nombreArchivo, avisar as avisarLienzo } from '../componentes/exportar.js';
import { crearEscena, numero, texto } from '../nucleo/escena.js';
import { Historial } from '../nucleo/historial.js';
import { evaluar } from '../nucleo/unidades.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';

(function () {
  'use strict';
  const { Trazo, fmt, cantidad, grafica, LineaTiempo } = Volta;
  const $ = s => document.querySelector(s);
  const DOS_PI = 2 * Math.PI, KMH = 1 / 3.6;
  const subs = n => String(n).replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[+d]);
  const simHTML = (a, sub) => `<span class="sim">${a}${sub ? `<sub class="r">${sub}</sub>` : ''}</span>`;
  const numCampo = x => String(Number(Number(x).toPrecision(6))).replace('-', '−');

  // ---------------------------------------------------------------------
  // Escenas. Posiciones en m (en t = 0), velocidades en m/s, f en Hz;
  // inicio: instante en que empieza a sonar (null: suena desde siempre).
  // Paredes: punto, normal hacia el lado del sonido y velocidad a lo largo
  // de ella (positiva: se acerca al sonido).
  // ---------------------------------------------------------------------
  const vari = (sim, val, min, max, paso, u, liga, sub, factor = 1) => ({ sim, sub, val, min, max, paso, u, factor, liga });
  const ESCENAS = [
    {
      clave: 'fuente-movil', titulo: 'Fuente que se mueve: Doppler visto y escuchado', tipo: 'Tutorial', c: 340, duracion: 3,
      fuentes: [{ nombre: 'S', p: [-80, 0], v: [80, 0], f: 440, inicio: 0 }],
      observadores: [{ nombre: 'O₁', p: [100, 10] }, { nombre: 'O₂', p: [-100, 10] }],
      variables: { u: vari('u', 80, 0, 200, 1, 'm/s', ['fuentes.0.v.0']), f: vari('f', 440, 100, 1000, 10, 'Hz', ['fuentes.0.f']) },
    },
    {
      clave: 'pulsaciones', titulo: 'Pulsaciones entre dos diapasones', tipo: 'Ejemplo', c: 340, duracion: 2,
      fuentes: [{ nombre: 'S₁', p: [0, 2], f: 440, inicio: null }, { nombre: 'S₂', p: [0, -2], f: 444, inicio: null }],
      observadores: [{ nombre: 'O', p: [12, 0] }],
      variables: { f: vari('f', 444, 430, 460, 0.5, 'Hz', ['fuentes.1.f'], '2') },
    },
    {
      clave: 'observador-movil', titulo: 'Observador que pasa junto a una fuente', tipo: 'Ejemplo', c: 340, duracion: 12,
      fuentes: [{ nombre: 'S', p: [0, 0], f: 500, inicio: null }],
      observadores: [{ nombre: 'O', p: [-180, 12], v: [30, 0] }],
      variables: { u: vari('u', 30, 0, 80, 1, 'm/s', ['observadores.0.v.0'], 'O') },
    },
    {
      clave: 'pared', titulo: 'Reflexión en una pared que se acerca', tipo: 'Ejemplo', c: 340, duracion: 4,
      fuentes: [{ nombre: 'S', p: [0, 6], f: 1000, inicio: null }],
      observadores: [{ nombre: 'O', p: [-12, -10] }],
      paredes: [{ nombre: 'Pared', punto: [120, 0], normal: [-1, 0], velocidad: 10, largo: 80 }],
      variables: { u: vari('u', 10, -30, 30, 0.5, 'm/s', ['paredes.0.velocidad']) },
    },
    {
      clave: 'mext-2018-1-5', titulo: 'Observador que se aleja de un altavoz', tipo: 'MEXT', anio: '2018 1-(5)', c: 330, duracion: 1.5,
      fuentes: [{ nombre: 'S', p: [-9, 12], f: 660, inicio: null }],
      observadores: [{ nombre: 'O', p: [0, 0], v: [5, 0] }],
    },
    {
      clave: 'mext-2014-5', titulo: 'Altavoz entre una pared y un observador', tipo: 'MEXT', anio: '2014 P5', c: 340, duracion: 2,
      fuentes: [{ nombre: 'B', p: [0, 0], v: [10, 0], f: 500, inicio: null }],
      observadores: [{ nombre: 'A', p: [50, 0] }, { nombre: 'C', p: [-49.5, 0], v: [0, 0] }],
      paredes: [{ nombre: 'D', punto: [-50, 0], normal: [1, 0], velocidad: 0, largo: 30 }],
      variables: { v: vari('v', 10, 0, 30, 0.5, 'm/s', ['fuentes.0.v.0'], 'B'), w: vari('v', 0, 0, 30, 0.5, 'm/s', ['paredes.0.velocidad', 'observadores.1.v.0'], 'D') },
    },
    {
      clave: 'mext-2020-5', titulo: 'Dos altavoces y un observador', tipo: 'MEXT', anio: '2020 P5', c: 340, duracion: 1,
      fuentes: [{ nombre: 'S₁', p: [30, 0], v: [5, 0], f: 500, inicio: null }, { nombre: 'S₂', p: [30, 40], v: [0, 0], f: 500, inicio: null }],
      observadores: [{ nombre: 'O', p: [0, 0] }],
      variables: { u1: vari('u', 5, 0, 20, 0.5, 'm/s', ['fuentes.0.v.0'], '1'), u2: vari('u', 0, 0, 20, 0.5, 'm/s', ['fuentes.1.v.0'], '2') },
    },
    {
      clave: 'mext-2013-5', titulo: 'Ambulancia que se acerca a un cruce', tipo: 'MEXT', anio: '2013 P5', temperatura: 288.15, duracion: 20,
      fuentes: [{ nombre: 'Ambulancia', p: [-300, 0], v: [60 * KMH, 0], f: 440, inicio: null }],
      observadores: [{ nombre: 'O', p: [0, 4] }],
    },
    {
      // Reconstrucción sin figura: la rejilla (de donde sale el sonido) a 0.2 m del eje del vaivén,
      // ±45° con velocidad angular máxima 1 rad/s; el aire que sale del ventilador (3 m/s) como viento
      // uniforme hacia las personas; una delante, a 1.2 m, y otra lejos, a 10 m
      clave: 'mext-2012-5', titulo: 'Ventilador que oscila', tipo: 'MEXT', anio: '2012 P5', c: 344, viento: [3, 0], duracion: 10,
      fuentes: [{ nombre: 'Rejilla', p: [0.2, 0], f: 300, inicio: null, vaiven: { centro: [0, 0], radio: 0.2, amplitud: Math.PI / 4, omegaMax: 1, angulo: 0 } }],
      observadores: [{ nombre: 'Delante', p: [1.2, 0] }, { nombre: 'Lejos', p: [10, 0] }],
      variables: { w: vari('ω', 1, 0, 3, 0.1, 'rad/s', ['fuentes.0.vaiven.omegaMax'], 'máx'), W: vari('w', 3, 0, 10, 0.5, 'm/s', ['viento.0']) },
    },
    {
      clave: 'mext-2009-5', titulo: 'Ambulancia con viento a favor', tipo: 'MEXT', anio: '2009 P5', c: 340, viento: [8, 0], duracion: 30,
      fuentes: [{ nombre: 'Ambulancia', p: [-300, 0], v: [20, 0], f: 600, inicio: null }],
      observadores: [{ nombre: 'O', p: [0, 6] }],
      variables: { W: vari('W', 8, -20, 20, 0.5, 'm/s', ['viento.0']), U: vari('U', 20, 0, 40, 0.5, 'm/s', ['fuentes.0.v.0']) },
    },
    {
      clave: 'mext-2008-1-4', titulo: 'Tren que pasa junto a la señal de un cruce', tipo: 'MEXT', anio: '2008 1-(4)', c: 340, duracion: 30,
      fuentes: [{ nombre: 'Señal', p: [0, 6], f: 680, inicio: null }],
      observadores: [{ nombre: 'Pasajero', p: [-300, 0], v: [72 * KMH, 0] }],
    },
    {
      clave: 'mext-2007-5', titulo: 'Ambulancia que pasa por A y por B', tipo: 'MEXT', anio: '2007 P5', c: 340, duracion: 30, viento: [0, 0],
      fuentes: [{ nombre: 'Ambulancia', p: [300, 100], v: [-60 * KMH, 0], f: 880, inicio: null }],
      observadores: [{ nombre: 'O', p: [0, 0] }],
      marcas: [{ nombre: 'A', p: [100, 100] }, { nombre: 'B', p: [-100, 100] }, { nombre: 'C', p: [0, 100] }],
      variables: { wx: vari('w', 0, -10, 10, 0.5, 'm/s', ['viento.0'], 'x'), wy: vari('w', 0, -10, 10, 0.5, 'm/s', ['viento.1'], 'y') },
    },
    {
      clave: 'mext-2006-5', titulo: 'Barco que cabecea mientras avanza', tipo: 'MEXT', anio: '2006 P5', c: 2, duracion: 40, medio: 'agua',
      fuentes: [{ nombre: 'Barco', p: [0, 0], v: [0.5, 0], f: 0.5, inicio: 0 }],
      observadores: [{ nombre: 'Delante', p: [40, 6] }, { nombre: 'Detrás', p: [-40, 6] }],
      variables: { V: vari('V', 0.5, 0, 1.8, 0.05, 'm/s', ['fuentes.0.v.0'], '0') },
    },
  ];
  const BASE = () => ({ c: 340, temperatura: null, viento: [0, 0], fuentes: [], observadores: [], paredes: [], marcas: [], duracion: 5, variables: {}, medio: 'aire', obs: 0, capas: { frentes: true, ecos: true, emision: true, vectores: true, valores: true } });
  const completa = e => {
    const o = JSON.parse(JSON.stringify({ ...BASE(), ...e }));
    for (const f of o.fuentes) { f.v = f.v || [0, 0]; if (f.inicio === undefined) f.inicio = null; }
    for (const ob of o.observadores) ob.v = ob.v || [0, 0];
    if (o.temperatura) o.c = velocidadSonido(o.temperatura);
    return o;
  };

  // ---------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------
  /** @type {any} */ let ESC = completa(ESCENAS[0]);
  let t = 0, jugando = false, velocidad = 1, ultimo = 0, sel = 'fuente:0', herramienta = null;
  let vistaTocada = false, escala0 = 1, arrastre = null, paneo = null, hover = null, espacioPulsado = false;
  let autoguardar = false, historial = null, SERIES = null, EVENTOS = [];
  const lienzo = $('#lienzo'), area = $('#area'), tz = new Trazo(lienzo);

  // Vaivén de la pantalla (con la velocidad angular máxima) → vaivén del motor (con su frecuencia angular)
  const vaivenMotor = w => (w ? { centro: w.centro, radio: w.radio, amplitud: w.amplitud, omega: w.amplitud > 0 ? w.omegaMax / w.amplitud : 0, angulo: w.angulo } : undefined);
  const movil = f => (f.vaiven ? { p: f.p, v: f.v, vaiven: vaivenMotor(f.vaiven) } : f);
  const posF = (f, tt) => posicionEn(movil(f), tt);
  function escenaMotor() {
    return {
      c: ESC.c, viento: ESC.viento,
      fuentes: ESC.fuentes.map(f => ({ p: f.p, v: f.v, f: f.f, inicio: f.inicio == null ? -Infinity : f.inicio, amplitud: 1, vaiven: vaivenMotor(f.vaiven) })),
      observadores: ESC.observadores.map(o => ({ p: o.p, v: o.v })),
      paredes: ESC.paredes.map(p => ({ punto: p.punto, normal: p.normal, velocidad: p.velocidad || 0 })),
    };
  }
  let MOTOR = escenaMotor();
  // Componentes que oye el observador k en tr: [{fuente, camino, f, ...}]
  function componentes(k, tr) {
    const r = [];
    MOTOR.fuentes.forEach((_, i) => { for (const c of recepcion(MOTOR, i, k, tr)) if (c.camino === 'directo' || ESC.capas.ecos) r.push({ ...c, fuente: i }); });
    return r;
  }
  const nombreComp = c => `${ESC.fuentes[c.fuente].nombre}${c.camino === 'directo' ? '' : ' · eco'}`;

  // Series del observador seleccionado: f′ de cada componente y pulsación
  function calcularSeries() {
    const k = ESC.obs, n = 600, dur = ESC.duracion, porClave = new Map(), ts = [];
    for (let j = 0; j <= n; j++) {
      const tr = dur * j / n; ts.push(tr);
      for (const c of componentes(k, tr)) {
        const clave = `${c.fuente}|${c.camino}`;
        if (!porClave.has(clave)) porClave.set(clave, { fuente: c.fuente, camino: c.camino, pts: [], niv: [] });
        const s = porClave.get(clave); s.pts.push([tr, c.f]); s.niv.push([tr, 20 * Math.log10(Math.max(1e-9, c.amplitud))]);
      }
    }
    const lista = [...porClave.values()].sort((a, b) => (a.camino === 'directo' ? 0 : 1) - (b.camino === 'directo' ? 0 : 1) || a.fuente - b.fuente);
    // Pulsación entre las dos primeras componentes cuando las dos suenan
    const pul = [];
    if (lista.length >= 2) {
      const [a, b] = lista, mb = new Map(b.pts.map(([x, y]) => [x, y]));
      for (const [x, y] of a.pts) if (mb.has(x)) pul.push([x, frecuenciaPulsacion(y, mb.get(x))]);
    }
    // Distancia fuente–observador (la primera fuente)
    const dist = ts.map(tr => { const s = posicionEn(MOTOR.fuentes[0], tr), o = posicionEn(MOTOR.observadores[k], tr); return [tr, Math.hypot(s[0] - o[0], s[1] - o[1])]; });
    SERIES = { lista, pul, dist };
  }

  // Eventos: primer frente que llega, paso por el punto más cercano y llegada de su sonido, primer eco
  function calcularEventos() {
    const ev = [], dur = ESC.duracion;
    const llegada = (k, i, camino, te) => {
      // El primer t_r con t_e ≥ te (t_e crece con t_r)
      let lo = te, hi = te + 1;
      const teDe = tr => { const c = recepcion(MOTOR, i, k, tr).find(x => x.camino === camino); return c ? c.te : -Infinity; };
      for (let j = 0; j < 60 && teDe(hi) < te; j++) hi = te + (hi - te) * 2;
      if (teDe(hi) < te) return null;
      for (let j = 0; j < 80; j++) { const m = (lo + hi) / 2; if (teDe(m) < te) lo = m; else hi = m; }
      return hi;
    };
    ESC.observadores.forEach((o, k) => {
      ESC.fuentes.forEach((f, i) => {
        if (f.inicio != null) {
          const tr = llegada(k, i, 'directo', f.inicio);
          if (tr != null && tr <= dur) ev.push({ t: tr, nombre: `El primer frente de ${f.nombre} llega a ${o.nombre}` });
          ESC.paredes.forEach((p, j) => { const te = llegada(k, i, `pared ${j + 1}`, f.inicio); if (te != null && te <= dur) ev.push({ t: te, nombre: `Llega a ${o.nombre} el eco de ${p.nombre || 'la pared'}` }); });
        }
        if (f.vaiven) return;
        const dv = [f.v[0] - o.v[0], f.v[1] - o.v[1]], dp = [f.p[0] - o.p[0], f.p[1] - o.p[1]], v2 = dv[0] ** 2 + dv[1] ** 2;
        if (v2 > 1e-12) {
          const tc = -(dp[0] * dv[0] + dp[1] * dv[1]) / v2;
          if (tc > 0 && tc < dur) {
            ev.push({ t: tc, nombre: `${f.nombre} pasa por el punto más cercano a ${o.nombre}` });
            const tr = llegada(k, i, 'directo', tc);
            if (tr != null && tr <= dur) ev.push({ t: tr, nombre: `${o.nombre} oye el sonido emitido al pasar: f′ = f` });
          }
        }
      });
    });
    EVENTOS = ev.sort((a, b) => a.t - b.t).slice(0, 30);
  }

  // ---------------------------------------------------------------------
  // Lienzo
  // ---------------------------------------------------------------------
  function caja() {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const incl = p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); };
    for (const m of [...ESC.fuentes, ...ESC.observadores]) {
      if (m.vaiven) { const w = m.vaiven; incl([w.centro[0] - w.radio, w.centro[1] - w.radio]); incl([w.centro[0] + w.radio, w.centro[1] + w.radio]); continue; }
      incl(m.p); incl(posicionEn(m, ESC.duracion));
    }
    for (const p of ESC.paredes) { incl(p.punto); incl(posPared(p, ESC.duracion)); }
    for (const m of ESC.marcas) incl(m.p);
    const w = Math.max(x1 - x0, 10), h = Math.max(y1 - y0, 10), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, m = 0.2;
    return { x0: cx - w * (0.5 + m), x1: cx + w * (0.5 + m), y0: cy - h * (0.5 + m), y1: cy + h * (0.5 + m) };
  }
  function encuadrar() { tz.vista.encuadrar(caja(), { x: 0, y: 44, w: tz.w, h: tz.h - 96 }, 40); }

  // Frentes cada n periodos: separación en pantalla de al menos 12 px
  const cadaFrentes = f => Math.max(1, Math.ceil(12 / (ESC.c / f.f * tz.vista.escala)));
  const posPared = (p, tt) => { const d = p.velocidad || 0; return [p.punto[0] + p.normal[0] * d * tt, p.punto[1] + p.normal[1] * d * tt]; };

  function dibujar() {
    const v = tz.vista;
    tz.limpiar(); tz.cuadricula(); tz.ejes({ x: 'x', y: 'y', ux: 'm', uy: 'm' });
    const diag = Math.hypot(tz.w, tz.h) / v.escala;
    // Recorte de los frentes al lado del sonido de la primera pared
    const P = ESC.paredes[0], recorte = P ? { n: P.normal, d: P.normal[0] * posPared(P, t)[0] + P.normal[1] * posPared(P, t)[1] } : null;
    // 5 · Construcción: frentes de onda
    if (ESC.capas.frentes) {
      ESC.fuentes.forEach((f, i) => {
        const cada = cadaFrentes(f);
        for (const fr of frentesOnda(MOTOR, i, t, { cada, max: 220, rMax: 1.5 * diag })) {
          if (fr.pared >= 0 && !ESC.capas.ecos) continue;
          tz.ondasFrente(fr.centro, fr.radio, { recorte, opacidad: fr.pared >= 0 ? 0.32 : 0.6 });
        }
      });
    }
    // Línea de emisión del observador seleccionado: del punto de emisión al observador
    const k = ESC.obs, o = posicionEn(ESC.observadores[k], t), comps = componentes(k, t);
    if (ESC.capas.emision) {
      for (const c of comps.filter(x => x.camino === 'directo')) {
        const pe = posF(ESC.fuentes[c.fuente], c.te);
        tz.linea([pe, o], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
        tz.fantasma(pe);
      }
    }
    // 3 · Paredes y marcas del examen
    for (const p of ESC.paredes) {
      const c0 = posPared(p, t), tg = [-p.normal[1], p.normal[0]], L = (p.largo || 40) / 2;
      tz.ondasPared([c0[0] - tg[0] * L, c0[1] - tg[1] * L], [c0[0] + tg[0] * L, c0[1] + tg[1] * L], p.normal);
      tz.texto(p.nombre || 'Pared', v.X(c0[0] + tg[0] * L) + 6, v.Y(c0[1] + tg[1] * L) - 6, { fuente: 'ui', tam: 12, peso: 500, color: 'texto-2', halo: true });
    }
    for (const m of ESC.marcas) {
      const [X, Y] = v.P(m.p);
      tz.lineaPx([[X - 4, Y], [X + 4, Y]], { color: 'texto-3', grosor: 1 }); tz.lineaPx([[X, Y - 4], [X, Y + 4]], { color: 'texto-3', grosor: 1 });
      tz.texto(m.nombre, X + 6, Y - 6, { fuente: 'ui', tam: 12, peso: 500, color: 'texto-3', halo: true });
    }
    // 6 · Materia: fuentes y observadores; 7 · velocidades (familia movimiento)
    const vmax = Math.max(1, ...[...ESC.fuentes, ...ESC.observadores].map(m => Math.hypot(m.v[0], m.v[1])));
    const kV = 46 / vmax;
    ESC.fuentes.forEach((f, i) => {
      const p = posF(f, t), vf = velocidadEn(movil(f), t);
      if (f.vaiven) {
        // Arco que recorre (construcción), eje del vaivén y brazo hasta la rejilla
        const w = f.vaiven, arco = [];
        for (let k = 0; k <= 40; k++) { const a = w.angulo - w.amplitud + 2 * w.amplitud * k / 40; arco.push([w.centro[0] + w.radio * Math.cos(a), w.centro[1] + w.radio * Math.sin(a)]); }
        tz.linea(arco, { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
        tz.linea([w.centro, p], { color: 'tinta', grosor: 1.5 });
        tz.pivote(w.centro);
      }
      const [X, Y] = tz.ondasFuenteSonora(p, { seleccionada: sel === 'fuente:' + i });
      tz.texto(f.nombre, X, Y - 16, { fuente: 'ui', tam: 12, peso: 500, color: 'texto', alinear: 'center', halo: true });
      if (ESC.capas.vectores && Math.hypot(...vf) > 1e-9) tz.vector(p, vf, { familia: 'movimiento', escalaPx: f.vaiven ? 46 / Math.max(1e-9, f.vaiven.radio * f.vaiven.omegaMax) : kV, desdeRadio: 10, simbolo: 'v', valor: ESC.capas.valores ? Math.hypot(...vf) : null, unidad: 'm/s' });
    });
    ESC.observadores.forEach((ob, i) => {
      const p = posicionEn(ob, t), [X, Y] = tz.ondasObservador(p, { seleccionada: sel === 'obs:' + i, grueso: i === ESC.obs });
      tz.texto(ob.nombre, X, Y + 28, { fuente: 'ui', tam: 12, peso: i === ESC.obs ? 600 : 500, color: 'texto', alinear: 'center', halo: true });
      if (ESC.capas.vectores && Math.hypot(...ob.v) > 1e-9) tz.vector(p, ob.v, { familia: 'movimiento', escalaPx: kV, desdeRadio: 12, simbolo: 'v', valor: ESC.capas.valores ? Math.hypot(...ob.v) : null, unidad: 'm/s' });
      // 8 · Frecuencímetro: ficha con lo que oye
      if (ESC.capas.valores) {
        const cs = componentes(i, t);
        if (cs.length) {
          const filas = cs.slice(0, 3).map(c => [{ t: 'f′', f: 'sim', tam: 13 }, { t: ` = ${cantidad(c.f, 'Hz', 4)}`, f: 'num', tam: 11.5 }, { t: `  ${nombreComp(c)}`, f: 'ui', tam: 11, color: 'texto-3' }]);
          if (cs.length >= 2) filas.push([{ t: 'f', f: 'sim', tam: 13 }, { t: 'pul', f: 'simRecta', tam: 9, dy: 3 }, { t: ` = ${cantidad(frecuenciaPulsacion(cs[0].f, cs[1].f), 'Hz', 4)}`, f: 'num', tam: 11.5 }]);
          tz.ficha(X + 18, Y - 46 - 16 * (filas.length - 1), filas, { ancla: [X + 8, Y - 6] });
        } else tz.ficha(X + 18, Y - 40, [[{ t: 'Aún no llega el sonido', f: 'ui', tam: 11.5 }]], { ancla: [X + 8, Y - 6] });
      }
    });
    // Viento: flecha de la familia movimiento arriba a la izquierda
    if (Math.hypot(...ESC.viento) > 1e-9) {
      const w = ESC.viento, m = Math.hypot(...w), X = 64, Y = 92, L = 34;
      tz.flechaPx(X - w[0] / m * L / 2, Y + w[1] / m * L / 2, X + w[0] / m * L / 2, Y - w[1] / m * L / 2, { color: 'movimiento', grosor: Volta.G.vector });
      tz.etiquetaMagnitud(X + 26, Y + 5, { simbolo: 'w', valor: m, unidad: 'm/s', color: 'movimiento', tam: 13, cifras: 3 });
    }
    tz.barraEscala(16, tz.h - 56);
    $('#leyenda-frentes').innerHTML = ESC.fuentes.length ? `<span>Frentes cada ${cadaFrentes(ESC.fuentes[0])} ${cadaFrentes(ESC.fuentes[0]) === 1 ? 'periodo' : 'periodos'}</span><span class="sep"></span><span class="sim">λ</span><span class="num">${cantidad(ESC.c / ESC.fuentes[0].f, 'm', 3)}</span>` : '';
  }

  // ---------------------------------------------------------------------
  // Paneles
  // ---------------------------------------------------------------------
  const fila = (etq, control, ayuda = '') => `<div class="fila"${ayuda ? ` data-ayuda="${ayuda}"` : ''}><span class="etq">${etq}</span>${control}</div>`;
  const leer = r => r.split('.').reduce((o, k) => (o == null ? o : o[k]), ESC);
  function escribir(r, val) { const ks = r.split('.'), u = ks.pop(); ks.reduce((a, k) => a[k], ESC)[u] = val; }
  const ligadaA = r => Object.entries(ESC.variables).find(([, d]) => d.liga.includes(r));
  function campo(etq, ruta, dim, u, ayuda = '') {
    const lig = ligadaA(ruta);
    if (lig) return fila(etq, `<div class="campo es-variable" data-ayuda="Ligado a la variable ${lig[1].sim}|Bound to variable"><span class="chip-var">${simHTML(lig[1].sim, lig[1].sub)}</span><span class="valor-var" data-var="${lig[0]}"></span><span class="u">${lig[1].u}</span></div>`, ayuda);
    return fila(etq, `<div class="campo"><input data-ruta="${ruta}" data-dim="${dim}" data-u="${u}" value="${numCampo(leer(ruta))}"><span class="u">${u}</span></div>`, ayuda);
  }
  function inspector() {
    const props = $('#propiedades'); let nombre = '', ico = 'o-fuente-sonora', estado = '';
    if (sel.startsWith('fuente:')) {
      const i = +sel.slice(7), f = ESC.fuentes[i], b = `fuentes.${i}`;
      nombre = f.nombre; estado = f.vaiven ? 'Fuente sonora · vaivén' : 'Fuente sonora';
      props.innerHTML = fila('Movimiento', `<div class="segmentado texto" id="p-mov"><button data-v="recta" aria-pressed="${!f.vaiven}">En línea recta</button><button data-v="vaiven" aria-pressed="${!!f.vaiven}">De vaivén</button></div>`, 'De vaivén: gira de un lado a otro sobre un arco, como la rejilla de un ventilador que oscila|Motion')
        + (f.vaiven
          ? campo('Eje x', `${b}.vaiven.centro.0`, 'longitud', 'm', 'Eje del vaivén|Pivot') + campo('Eje y', `${b}.vaiven.centro.1`, 'longitud', 'm')
            + campo('Radio', `${b}.vaiven.radio`, 'longitud', 'm', 'Distancia del eje a la fuente|Radius')
            + fila('Amplitud', `<div class="campo"><input id="p-amp" value="${numCampo(f.vaiven.amplitud * 180 / Math.PI)}"><span class="u">°</span></div>`, 'El ángulo va de un lado a otro ± esta amplitud|Swing amplitude')
            + campo('ω máx', `${b}.vaiven.omegaMax`, 'frecuencia', 'rad/s', 'Velocidad angular máxima (al pasar por el centro del arco)|Peak angular velocity')
          : campo('Posición x', `${b}.p.0`, 'longitud', 'm', 'Posición en t = 0|Position') + campo('Posición y', `${b}.p.1`, 'longitud', 'm')
            + campo('Velocidad x', `${b}.v.0`, 'velocidad', 'm/s', 'Velocidad constante: «60 km/h» también vale|Velocity') + campo('Velocidad y', `${b}.v.1`, 'velocidad', 'm/s'))
        + campo('Frecuencia', `${b}.f`, 'frecuencia', 'Hz', 'Frecuencia que emite la fuente|Frequency')
        + fila('Suena', `<div class="segmentado texto" id="p-inicio"><button data-v="siempre" aria-pressed="${f.inicio == null}">Desde siempre</button><button data-v="t0" aria-pressed="${f.inicio != null}">Desde t = 0</button></div>`, 'Si suena desde siempre, el sonido ya llena el aire al empezar|Emission start');
    } else if (sel.startsWith('obs:')) {
      const i = +sel.slice(4), o = ESC.observadores[i], b = `observadores.${i}`;
      nombre = o.nombre; ico = 'o-observador'; estado = i === ESC.obs ? 'Observador · se grafica y se escucha' : 'Observador';
      props.innerHTML = campo('Posición x', `${b}.p.0`, 'longitud', 'm') + campo('Posición y', `${b}.p.1`, 'longitud', 'm')
        + campo('Velocidad x', `${b}.v.0`, 'velocidad', 'm/s') + campo('Velocidad y', `${b}.v.1`, 'velocidad', 'm/s')
        + (i === ESC.obs ? '' : `<div class="fila"><span class="etq">Gráficas</span><div><button class="btn btn-secundario btn-compacto" id="p-obs">Graficar y escuchar este</button></div></div>`);
    } else if (sel.startsWith('pared:')) {
      const i = +sel.slice(6), b = `paredes.${i}`;
      nombre = ESC.paredes[i].nombre || 'Pared'; ico = 'o-pared-reflectante'; estado = 'Pared reflectante';
      props.innerHTML = campo('Posición x', `${b}.punto.0`, 'longitud', 'm') + campo('Velocidad', `${b}.velocidad`, 'velocidad', 'm/s', 'A lo largo de su normal; positiva si se acerca al sonido|Wall velocity');
    } else {
      nombre = ESC.medio === 'agua' ? 'Agua' : 'Aire'; ico = 'o-viento'; estado = ESC.medio === 'agua' ? 'Ondas en la superficie' : 'Medio del sonido';
      props.innerHTML = campo('Rapidez', 'c', 'velocidad', 'm/s', 'Rapidez del sonido respecto del aire|Speed of sound')
        + (ESC.medio === 'aire' ? fila('Temperatura', `<div class="campo"><input id="p-temp" value="${ESC.temperatura ? numCampo(ESC.temperatura) : ''}" placeholder="—"><span class="u">K</span></div>`, 'La rapidez sale de √(γRT/M)|Temperature') : '')
        + campo('Viento x', 'viento.0', 'velocidad', 'm/s', 'Velocidad del aire|Wind') + campo('Viento y', 'viento.1', 'velocidad', 'm/s')
        + campo('Duración', 'duracion', 'tiempo', 's');
    }
    $('#insp-nombre').textContent = nombre; $('#insp-estado').textContent = estado; $('#insp-ico').setAttribute('href', '#' + ico);
    props.querySelectorAll('input[data-ruta]').forEach(campoConUnidad);
    const pt = $('#p-temp');
    if (pt) pt.addEventListener('change', () => {
      try {
        const T = evaluar(/^[\d.]+$/.test(pt.value.trim()) ? pt.value + ' K' : pt.value, { esperada: 'temperatura' }).valor;
        if (!(T > 0 && T < 5000)) throw new Error('La temperatura va de 0 a 5000 K.');
        ESC.temperatura = T; ESC.c = velocidadSonido(T); cambio();
      } catch (e) { avisar(e.message, false); }
    });
    const pm = $('#p-mov');
    if (pm) pm.addEventListener('click', ev => {
      const bt = ev.target.closest('button'); if (!bt) return;
      const f = ESC.fuentes[+sel.slice(7)];
      if (bt.dataset.v === 'vaiven' && !f.vaiven) { f.vaiven = { centro: [f.p[0], f.p[1] - 1], radio: 1, amplitud: Math.PI / 4, omegaMax: 1, angulo: Math.PI / 2 }; f.v = [0, 0]; }
      else if (bt.dataset.v === 'recta' && f.vaiven) { f.p = posF(f, 0); delete f.vaiven; }
      else return;
      for (const [k, d] of Object.entries(ESC.variables)) { d.liga = d.liga.filter(r => leer(r) !== undefined); if (!d.liga.length) delete ESC.variables[k]; }
      construirVariables(); cambio();
    });
    const pa = $('#p-amp');
    if (pa) pa.addEventListener('change', () => {
      try {
        const a = evaluar(/^[\d.]+$/.test(pa.value.trim()) ? pa.value + ' °' : pa.value, { esperada: 'adimensional', unidadPorDefecto: '°' }).valor;
        if (!(a > 0 && a <= Math.PI)) throw new Error('La amplitud del vaivén va de 0° a 180°.');
        ESC.fuentes[+sel.slice(7)].vaiven.amplitud = a; cambio();
      } catch (e) { avisar(e.message, false); }
    });
    const pi = $('#p-inicio');
    if (pi) pi.addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; ESC.fuentes[+sel.slice(7)].inicio = b.dataset.v === 'siempre' ? null : 0; cambio(); });
    const po = $('#p-obs'); if (po) po.addEventListener('click', () => { ESC.obs = +sel.slice(4); cambio(); });
    arbol();
  }
  function campoConUnidad(ent) {
    const caja = ent.closest('.campo'), f = ent.closest('.fila');
    const error = msj => {
      caja.classList.toggle('es-error', !!msj);
      let p = f.querySelector('.mensaje-error');
      if (msj && !p) { p = document.createElement('p'); p.className = 'mensaje-error'; f.appendChild(p); }
      if (p) { if (msj) p.textContent = msj; else p.remove(); }
    };
    ent.addEventListener('change', () => {
      try {
        let txt = ent.value.trim().replace(/−/g, '-');
        if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(txt)) txt += ' ' + ent.dataset.u;
        const x = evaluar(txt, { esperada: ent.dataset.dim }).valor, r = ent.dataset.ruta;
        if ((r === 'c' || r.endsWith('.f') || r === 'duracion' || r.endsWith('.radio')) && !(x > 0)) throw new Error('Este valor tiene que ser positivo.');
        if (r.endsWith('.omegaMax') && !(x >= 0)) throw new Error('La velocidad angular no puede ser negativa.');
        if (r.endsWith('.omegaMax') || r.endsWith('.radio')) {
          const w = leer(r.replace(/\.(omegaMax|radio)$/, '')), rr = r.endsWith('.radio') ? x : w.radio, om = r.endsWith('.omegaMax') ? x : w.omegaMax;
          if (rr * om >= 0.95 * ESC.c) throw new Error('El modelo es para movimientos por debajo de la rapidez del sonido.');
        }
        if (r === 'duracion' && x > 120) throw new Error('La duración máxima es 120 s.');
        if (r.includes('.v.') || r.startsWith('viento') || r.endsWith('velocidad')) { if (Math.abs(x) >= 0.95 * ESC.c) throw new Error('El modelo es para movimientos por debajo de la rapidez del sonido.'); }
        if (Math.abs(x) > 1e6) throw new Error('El valor es demasiado grande.');
        escribir(r, x); if (r === 'c') ESC.temperatura = null;
        error(null); cambio();
      } catch (e) { error(e.message); }
    });
  }
  function arbol() {
    const n = (s, ico, nom, dato, cl = '') => `<div class="nodo${cl}" data-sel="${s}" aria-selected="${sel === s}"><svg class="ico"><use href="#${ico}"/></svg><span class="nombre">${nom}</span><span class="dato">${dato}</span></div>`;
    $('#arbol').innerHTML = n('medio', 'o-viento', ESC.medio === 'agua' ? 'Agua' : 'Aire', cantidad(ESC.c, 'm/s', 4))
      + ESC.fuentes.map((f, i) => n('fuente:' + i, 'o-fuente-sonora', f.nombre, cantidad(f.f, 'Hz', 4))).join('')
      + ESC.observadores.map((o, i) => n('obs:' + i, 'o-observador', o.nombre + (i === ESC.obs ? ' ·' : ''), Math.hypot(...o.v) ? cantidad(Math.hypot(...o.v), 'm/s', 3) : 'quieto')).join('')
      + ESC.paredes.map((p, i) => n('pared:' + i, 'o-pared-reflectante', p.nombre || 'Pared', p.velocidad ? cantidad(p.velocidad, 'm/s', 3) : 'quieta')).join('');
    $('#arbol').querySelectorAll('.nodo').forEach(e => e.addEventListener('click', () => { sel = e.dataset.sel; inspector(); todo(); }));
  }
  function lecturas() {
    $('#reloj').innerHTML = `<span class="sim">t</span>${fmt(t, 4).padStart(6, ' ')}<span class="u">s</span>`;
    $('#lect-titulo').textContent = `Lecturas en t = ${fmt(t, 4)} s`;
    $('#b-play').innerHTML = `<svg class="ico"><use href="#i-${jugando ? 'pausar' : 'reproducir'}"/></svg>`;
    document.querySelectorAll('[data-var]').forEach(e => { const d = ESC.variables[e.dataset.var]; if (d) e.textContent = fmtVar(d); });
    const k = sel.startsWith('obs:') ? +sel.slice(4) : ESC.obs, cs = componentes(k, t), filas = [];
    const L = (a, b, v, u, ay = '') => `<span class="sim"${ay ? ` data-ayuda="${ay}"` : ''}>${a}${b ? `<sub class="r">${b}</sub>` : ''}</span><span class="v">${v}</span><span class="u">${u}</span>`;
    filas.push(L('c', '', fmt(ESC.c, 4), 'm/s', 'Rapidez del sonido|Speed of sound'));
    if (sel.startsWith('fuente:')) {
      const f = ESC.fuentes[+sel.slice(7)];
      const s = Math.hypot(...velocidadEn(movil(f), t));
      filas.push(L('f', '', fmt(f.f, 4), 'Hz'), L('λ', '', fmt(ESC.c / f.f, 4), 'm', 'Longitud de onda con la fuente quieta|Wavelength'), L('|v|', '', fmt(s, 4), 'm/s', f.vaiven ? 'Rapidez de la fuente en este instante|Speed' : ''));
      if (s > 0) filas.push(L('λ', 'delante', fmt((ESC.c - s) / f.f, 4), 'm', 'Separación de los frentes delante de la fuente|Wavelength ahead'), L('λ', 'detrás', fmt((ESC.c + s) / f.f, 4), 'm', 'Separación de los frentes detrás|Wavelength behind'));
    } else {
      cs.slice(0, 4).forEach(c => filas.push(L('f′', nombreComp(c), fmt(c.f, 5), 'Hz', 'Frecuencia recibida|Received frequency'), L('r', nombreComp(c), fmt(c.r, 4), 'm', 'Distancia recorrida por el sonido|Path length')));
      if (cs.length >= 2) filas.push(L('f', 'pul', fmt(frecuenciaPulsacion(cs[0].f, cs[1].f), 4), 'Hz', 'Frecuencia de pulsación |f₁′ − f₂′||Beat frequency'));
      if (!cs.length) filas.push('<span class="sim">f′</span><span class="v">—</span><span class="u">aún no llega</span>');
    }
    $('#lecturas').innerHTML = filas.join('');
  }
  const fmtVar = d => d.val.toFixed(!(d.paso > 0) || d.paso >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(d.paso) - 1e-9))).replace('-', '−');
  function construirVariables() {
    const cont = $('#variables'); cont.innerHTML = '';
    for (const d of Object.values(ESC.variables)) {
      const e = document.createElement('div'); e.className = 'var';
      e.innerHTML = `${simHTML(d.sim, d.sub)}<input class="deslizador" type="range" min="${d.min}" max="${d.max}" step="${d.paso}" value="${d.val}" aria-label="${d.sim}"><span class="valor"></span>`;
      const ent = e.querySelector('input'), val = e.querySelector('.valor');
      const pintar = () => { val.innerHTML = `${fmtVar(d)}<span class="u">${d.u}</span>`; Volta.pintarDeslizador(ent); };
      ent.addEventListener('input', () => { d.val = parseFloat(ent.value); aplicarVariables(); pintar(); recalcular(); });
      ent.addEventListener('change', () => { registrar(); inspector(); });
      pintar(); cont.appendChild(e);
    }
    if (!Object.keys(ESC.variables).length) cont.innerHTML = '<span class="ayuda-fila" style="margin:0">Sin variables: edita los valores en el inspector.</span>';
  }
  function aplicarVariables() { for (const d of Object.values(ESC.variables)) for (const r of d.liga) if (leer(r) !== undefined) escribir(r, d.val * d.factor); }

  // ---------------------------------------------------------------------
  // Gráficas, intensidad, eventos y tabla
  // ---------------------------------------------------------------------
  const PATRON = ['continuo', 'discontinuo', 'punteado'];
  function graficas() {
    if (!$('#p-graficas').hidden) {
      const ev = EVENTOS.map(e => ({ x: e.t })), cs = componentes(ESC.obs, t), on = ESC.observadores[ESC.obs].nombre;
      // 1 · Frecuencia recibida
      const L = SERIES.lista;
      let fmin = Infinity, fmax = -Infinity;
      for (const s of L) for (const [, y] of s.pts) { fmin = Math.min(fmin, y); fmax = Math.max(fmax, y); }
      if (!Number.isFinite(fmin)) { fmin = 0; fmax = 1; }
      const pad = Math.max(0.08 * (fmax - fmin), 0.01 * fmax, 0.5);
      grafica($('#g1'), { x: { min: 0, max: ESC.duracion }, y: { min: fmin - pad, max: fmax + pad }, series: L.map((s, j) => ({ tramos: [s.pts], familia: 'tinta', patron: PATRON[j % 3] })), cursor: t, puntoCursor: cs.length ? [t, cs[0].f] : null, eventos: ev });
      $('#t1').innerHTML = `<span class="leyenda">${L.slice(0, 3).map((s, j) => `<span style="color:var(--tinta)"><i${j ? ' class="discontinua"' : ''}${j === 2 ? ' style="border-top-style:dotted"' : ''}></i>${nombreComp(s)}</span>`).join('')}</span> ${simHTML('f′')} (Hz) en ${on}`;
      $('#l1').textContent = cs.length ? cantidad(cs[0].f, 'Hz', 5) : '—';
      // 2 · Micrófono: la señal en una ventana que acaba en t
      const fp = cs.length >= 2 ? frecuenciaPulsacion(cs[0].f, cs[1].f) : 0, fref = cs.length ? cs[0].f : ESC.fuentes[0].f;
      const W = fp > 0.05 ? Math.min(3 / fp, ESC.duracion) : Math.min(8 / fref, ESC.duracion), n = 1200, pts = [];
      let amax = 0;
      for (let j = 0; j <= n; j++) {
        const tr = t - W + W * j / n; let s = 0;
        for (const c of componentes(ESC.obs, tr)) s += c.amplitud * Math.sin(c.fase);
        pts.push([tr - t, s]); amax = Math.max(amax, Math.abs(s));
      }
      const ua = 1 / (amax || 1);
      grafica($('#g2'), { x: { min: -W, max: 0 }, y: { min: -1.1, max: 1.1 }, series: [{ tramos: [pts.map(([x, y]) => [x, y * ua])], familia: 'tinta' }], cursor: 0 });
      $('#t2').innerHTML = `Señal en ${on} (normalizada) contra ${simHTML('t')} − ${simHTML('t')}<sub class="r">actual</sub> (s)`;
      $('#l2').textContent = fp > 0.05 ? `pulsación ${cantidad(fp, 'Hz', 3)}` : '';
      // 3 · Pulsación o distancia
      if (SERIES.pul.length) {
        const m = Math.max(...SERIES.pul.map(p => p[1])) || 1;
        grafica($('#g3'), { x: { min: 0, max: ESC.duracion }, y: { min: 0, max: m * 1.1 }, series: [{ tramos: [SERIES.pul], familia: 'tinta' }], cursor: t, puntoCursor: fp ? [t, fp] : null, eventos: ev });
        $('#t3').innerHTML = `Pulsación ${simHTML('f', 'pul')} = |${simHTML('f′')}<sub>1</sub> − ${simHTML('f′')}<sub>2</sub>| (Hz)`;
        $('#l3').textContent = cantidad(fp, 'Hz', 4);
      } else {
        const m = Math.max(...SERIES.dist.map(p => p[1])) || 1, d = SERIES.dist[Math.round(t / ESC.duracion * (SERIES.dist.length - 1))][1];
        grafica($('#g3'), { x: { min: 0, max: ESC.duracion }, y: { min: 0, max: m * 1.08 }, series: [{ tramos: [SERIES.dist], familia: 'tinta' }], cursor: t, eventos: ev });
        $('#t3').innerHTML = `Distancia ${ESC.fuentes[0].nombre}–${on} ${simHTML('d')} (m) contra ${simHTML('t')} (s)`;
        $('#l3').textContent = cantidad(d, 'm', 4);
      }
    }
    if (!$('#p-energia').hidden) intensidad();
  }
  // Nivel relativo de cada sonido (amplitud ∝ 1/r): 20·log₁₀(1 m / r)
  function intensidad() {
    const cs = componentes(ESC.obs, t), on = ESC.observadores[ESC.obs].nombre;
    const max = Math.max(1e-12, ...cs.map(c => c.amplitud));
    $('#barras').innerHTML = `<div class="barras-tit">Intensidad de cada sonido en ${on}</div>` + (cs.length ? cs.map(c => `<div class="barra-e" data-ayuda="La intensidad cae como 1/r²|Intensity"><span>${nombreComp(c)}</span><span class="riel"><i style="width:${(c.amplitud / max) ** 2 * 100}%;background:var(--tinta)"></i></span><span class="v">${fmt(20 * Math.log10(c.amplitud), 3)} dB</span></div>`).join('') : '<p class="ayuda-fila" style="margin:0">Todavía no llega el sonido.</p>')
      + '<div class="barras-pie">Nivel relativo 20·log₁₀(1 m/r): la intensidad cae como 1/r²</div>';
    const series = SERIES.lista.map((s, j) => ({ tramos: [s.niv], familia: 'tinta', patron: PATRON[j % 3] }));
    let lo = Infinity, hi = -Infinity; for (const s of SERIES.lista) for (const [, y] of s.niv) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
    if (!Number.isFinite(lo)) { lo = -1; hi = 0; }
    grafica($('#g4'), { x: { min: 0, max: ESC.duracion }, y: { min: lo - 3, max: hi + 3 }, series, cursor: t });
    $('#t4').innerHTML = `Nivel relativo (dB) contra ${simHTML('t')} (s)`;
    $('#l4').textContent = cs.length ? `${fmt(20 * Math.log10(cs[0].amplitud), 3)} dB` : '';
  }
  function tablas() {
    $('#t-eventos').innerHTML = '<tr><th>Evento</th><th>t (s)</th></tr>' + (EVENTOS.length ? EVENTOS.map(e => `<tr class="${Math.abs(e.t - t) < ESC.duracion / 200 ? 'actual' : ''}"><td class="texto">${e.nombre}</td><td>${fmt(e.t, 5)}</td></tr>`).join('') : '<tr><td class="texto" colspan="2">Sin eventos.</td></tr>');
    const L = SERIES.lista;
    let html = '<tr><th>t (s)</th>' + L.map(s => `<th>f′ ${nombreComp(s)} (Hz)</th>`).join('') + (SERIES.pul.length ? '<th>f pul (Hz)</th>' : '') + '</tr>';
    for (let j = 0; j <= 100; j++) {
      const tr = ESC.duracion * j / 100, q = Math.round(j * 6);
      html += `<tr class="${Math.abs(tr - t) < ESC.duracion / 200 ? 'actual' : ''}"><td>${fmt(tr, 4)}</td>` + L.map(s => { const p = s.pts.find(x => Math.abs(x[0] - tr) < 1e-9); return `<td>${p ? fmt(p[1], 6) : '—'}</td>`; }).join('') + (SERIES.pul.length ? `<td>${SERIES.pul[q] ? fmt(SERIES.pul[q][1], 4) : '—'}</td>` : '') + '</tr>';
    }
    $('#t-datos').innerHTML = html;
  }

  // ---------------------------------------------------------------------
  // Ciclo
  // ---------------------------------------------------------------------
  const lt = new LineaTiempo($('#tl'), { duracion: 1, eventos: [], alCambiar: nt => { t = nt; jugando = false; todo(); } });
  function todo() { dibujar(); lecturas(); lt.poner(t); graficas(); if (!$('#p-eventos').hidden || !$('#p-tabla').hidden) tablas(); }
  function recalcular() {
    MOTOR = escenaMotor(); calcularSeries(); calcularEventos();
    lt.duracion = ESC.duracion; lt.simulado = ESC.duracion; lt.eventos = EVENTOS.map(e => ({ t: e.t, nombre: e.nombre }));
    t = Math.min(t, ESC.duracion);
    todo();
    if (autoguardar) autoguardado.guardar('ondas-doppler', escenaActual());
  }
  function cambio() { aplicarVariables(); recalcular(); registrar(); inspector(); }
  function titulo() {
    $('#escena-nombre').textContent = ESC.titulo;
    const chip = $('#escena-chip'); chip.textContent = ESC.tipo === 'MEXT' ? `MEXT ${ESC.anio || ''}`.trim() : ESC.tipo || 'Propio';
    chip.className = 'chip' + (ESC.tipo === 'MEXT' ? ' lleno' : '');
    document.title = `Volta · Ondas y sonido · ${ESC.titulo}`;
    document.querySelectorAll('.capa-btn').forEach(b => b.setAttribute('aria-pressed', String(!!ESC.capas[b.dataset.capa])));
    const audible = ESC.fuentes.some(f => f.f >= 20 && f.f <= 16000);
    $('#b-escuchar').disabled = !audible;
    $('#b-escuchar').dataset.ayuda = audible ? 'Escuchar lo que oye el observador seleccionado, en tiempo real|Listen|L' : 'No se puede escuchar: la frecuencia está fuera del oído humano|Listen';
  }
  let relojAviso = null;
  function avisar(txt, conDeshacer = true) {
    $('#aviso-texto').textContent = txt; $('#aviso').hidden = false; $('#aviso-deshacer').hidden = !conDeshacer || !historial?.puedeDeshacer;
    clearTimeout(relojAviso); relojAviso = setTimeout(() => { $('#aviso').hidden = true; }, 4500);
  }
  $('#aviso-deshacer').addEventListener('click', () => deshacer());

  // ---------------------------------------------------------------------
  // Escena: guardar, abrir, autoguardado, deshacer
  // ---------------------------------------------------------------------
  const instantanea = () => JSON.parse(JSON.stringify(ESC));
  function escenaActual() { return crearEscena({ modulo: 'ondas', espacio: 'doppler', titulo: ESC.titulo, datos: instantanea() }); }
  const RUTA_OK = /^((fuentes|observadores)\.[0-7]\.(p|v)\.[01]|fuentes\.[0-7]\.f|fuentes\.[0-7]\.vaiven\.(radio|amplitud|omegaMax|centro\.[01])|paredes\.[0-3]\.(velocidad|punto\.[01])|viento\.[01]|c|duracion)$/;
  function datosSeguros(d = {}) {
    const base = completa(ESCENAS.find(e => e.clave === d.clave) || ESCENAS[0]);
    const c = numero(d.c, base.c, 0.1, 1e4), lim = 0.95 * c;
    const vec = (v, def, m = 1e5) => (Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) ? v.map(x => Math.max(-m, Math.min(m, x))) : def);
    const nombre = (v, def) => texto(v, def, 16);
    const fuentes = (Array.isArray(d.fuentes) ? d.fuentes : base.fuentes).filter(f => f && typeof f === 'object').slice(0, 8)
      .map((f, i) => {
        const o = { nombre: nombre(f.nombre, `S${subs(i + 1)}`), p: vec(f.p, [0, 0]), v: vec(f.v, [0, 0], lim), f: numero(f.f, 440, 1e-3, 1e5), inicio: f.inicio === null ? null : numero(f.inicio, 0, 0, 1e3) };
        const w = f.vaiven;
        if (w && typeof w === 'object') {
          const radio = numero(w.radio, 1, 1e-4, 1e4);
          o.vaiven = { centro: vec(w.centro, [0, 0]), radio, amplitud: numero(w.amplitud, Math.PI / 4, 1e-3, Math.PI), omegaMax: numero(w.omegaMax, 1, 0, 0.95 * c / radio), angulo: numero(w.angulo, Math.PI / 2, -10, 10) };
          o.v = [0, 0];
        }
        return o;
      });
    const observadores = (Array.isArray(d.observadores) ? d.observadores : base.observadores).filter(o => o && typeof o === 'object').slice(0, 8)
      .map((o, i) => ({ nombre: nombre(o.nombre, `O${subs(i + 1)}`), p: vec(o.p, [10, 0]), v: vec(o.v, [0, 0], lim) }));
    const paredes = (Array.isArray(d.paredes) ? d.paredes : []).filter(p => p && typeof p === 'object').slice(0, 4).map(p => {
      let n = vec(p.normal, [-1, 0], 1), L = Math.hypot(...n);
      if (!(L > 1e-6)) { n = [-1, 0]; L = 1; }
      return { nombre: nombre(p.nombre, 'Pared'), punto: vec(p.punto, [50, 0]), normal: [n[0] / L, n[1] / L], velocidad: numero(p.velocidad, 0, -lim, lim), largo: numero(p.largo, 40, 1, 1e4) };
    });
    const variables = {};
    for (const [k, v] of Object.entries(d.variables && typeof d.variables === 'object' ? d.variables : {})) {
      if (!v || !Array.isArray(v.liga) || !/^[A-Za-z]\w{0,7}$/.test(k)) continue;
      const min = numero(v.min, 0, -1e6, 1e6), max = Math.max(min, numero(v.max, 1, -1e6, 1e6)), liga = v.liga.filter(r => typeof r === 'string' && RUTA_OK.test(r));
      if (liga.length) variables[k] = { sim: texto(v.sim, k, 3), sub: v.sub ? texto(v.sub, '', 6) : undefined, val: numero(v.val, min, min, max), min, max, paso: numero(v.paso, 0.1, 1e-9, 1e6), u: texto(v.u, '', 6), factor: numero(v.factor, 1, 1e-9, 1e9), liga };
    }
    const capas = {}; for (const k of Object.keys(base.capas)) capas[k] = typeof d.capas?.[k] === 'boolean' ? d.capas[k] : base.capas[k];
    return {
      clave: ESCENAS.some(e => e.clave === d.clave) ? d.clave : 'propio', titulo: texto(d.titulo, base.titulo, 80), tipo: ['Tutorial', 'Ejemplo', 'MEXT', 'Propio'].includes(d.tipo) ? d.tipo : 'Propio',
      anio: d.anio ? texto(d.anio, '', 14) : undefined, medio: d.medio === 'agua' ? 'agua' : 'aire', c, temperatura: d.temperatura ? numero(d.temperatura, 293, 1, 5000) : null,
      viento: vec(d.viento, [0, 0], lim), fuentes: fuentes.length ? fuentes : base.fuentes, observadores: observadores.length ? observadores : base.observadores, paredes,
      marcas: (Array.isArray(d.marcas) ? d.marcas : []).filter(m => m && typeof m === 'object').slice(0, 8).map(m => ({ nombre: texto(m.nombre, '·', 3), p: vec(m.p, [0, 0]) })),
      duracion: numero(d.duracion, base.duracion, 0.01, 120), variables, obs: 0, capas,
    };
  }
  function restaurar(d) { ESC = datosSeguros(d); aplicarVariables(); if (!selValida(sel)) sel = 'medio'; titulo(); construirVariables(); inspector(); recalcular(); }
  const selValida = s => s === 'medio' || (s.startsWith('fuente:') && +s.slice(7) < ESC.fuentes.length) || (s.startsWith('obs:') && +s.slice(4) < ESC.observadores.length) || (s.startsWith('pared:') && +s.slice(6) < ESC.paredes.length);
  function botonesHistorial() { $('#b-deshacer').disabled = !historial?.puedeDeshacer; $('#b-rehacer').disabled = !historial?.puedeRehacer; }
  function registrar() { if (historial && historial.registrar(instantanea())) botonesHistorial(); }
  function deshacer() { const d = historial?.deshacer(); if (d) { restaurar({ ...d, obs: d.obs }); ESC.obs = Math.min(d.obs || 0, ESC.observadores.length - 1); recalcular(); botonesHistorial(); avisar('Cambio deshecho', false); } }
  function rehacer() { const d = historial?.rehacer(); if (d) { restaurar(d); ESC.obs = Math.min(d.obs || 0, ESC.observadores.length - 1); recalcular(); botonesHistorial(); avisar('Cambio rehecho', false); } }
  $('#b-deshacer').addEventListener('click', deshacer); $('#b-rehacer').addEventListener('click', rehacer);
  function abrirEscena1(clave) {
    detenerAudio();
    ESC = completa(ESCENAS.find(e => e.clave === clave) || ESCENAS[0]); aplicarVariables();
    sel = 'fuente:0'; t = 0; jugando = false; vistaTocada = false;
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
      if (aOtroEspacio(e, 'doppler')) return;
      if (e.espacio && e.espacio !== 'doppler') throw new Error('Esta escena es de otro espacio de trabajo de Ondas y sonido.');
      restaurar(e.datos); t = 0; vistaTocada = false; encuadrar(); escala0 = tz.vista.escala; zoomTexto(); todo();
      if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); }
      avisar(`Escena abierta: ${texto(e.titulo, 'sin título', 60)}`, false);
    }).catch(err => avisar(err.message, false));
  }

  // ---------------------------------------------------------------------
  // Exportar
  // ---------------------------------------------------------------------
  function exportarCSV() {
    const L = SERIES.lista, cols = ['t (s)', ...L.map(s => `f ${nombreComp(s)} (Hz)`), ...L.map(s => `nivel ${nombreComp(s)} (dB)`)];
    const filas = SERIES.dist.map(([tr]) => [tr, ...L.map(s => { const p = s.pts.find(x => x[0] === tr); return p ? p[1] : ''; }), ...L.map(s => { const p = s.niv.find(x => x[0] === tr); return p ? p[1] : ''; })]);
    descargarTexto(`${nombreArchivo(ESC.titulo)}-datos.csv`, aCSV(cols, filas)).then(r => { if (r) avisarLienzo(area, `Datos exportados: ${filas.length} filas`); });
  }
  function exportarPNG() { descargarLienzo(lienzo, `${nombreArchivo(ESC.titulo)}-t${fmt(t, 3)}s.png`).then(r => { if (r) avisarLienzo(area, 'Imagen del lienzo exportada'); }); }
  $('#b-exportar').addEventListener('click', exportarCSV);

  // ---------------------------------------------------------------------
  // Audio: síntesis de lo que oye el observador (solo al pulsar Escuchar)
  // ---------------------------------------------------------------------
  let audio = null;
  function detenerAudio() {
    if (audio) { try { audio.fuente.stop(); } catch { /* ya parada */ } audio.ctx.close(); audio = null; }
    $('#b-escuchar').setAttribute('aria-pressed', 'false'); $('#escuchar-txt').textContent = 'Escuchar';
  }
  function escuchar() {
    if (audio) { detenerAudio(); jugando = false; todo(); return; }
    const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!AC) { avisar('Este sistema no permite reproducir audio.', false); return; }
    if (t >= ESC.duracion - 0.05) t = 0;
    const ctx = new AC(), sr = ctx.sampleRate, t0 = t, dur = Math.min(ESC.duracion - t0, 20), n = Math.max(1, Math.floor(dur * sr));
    // Instante de emisión y amplitud de cada camino cada 1 ms; la fase se interpola
    const paso = 1e-3, m = Math.ceil(dur / paso) + 1, caminos = new Map();
    for (let j = 0; j < m; j++) {
      const tr = t0 + j * paso;
      for (const c of componentes(ESC.obs, tr)) {
        const k = `${c.fuente}|${c.camino}`;
        if (!caminos.has(k)) caminos.set(k, { f: ESC.fuentes[c.fuente].f, te: new Float64Array(m).fill(NaN), a: new Float64Array(m) });
        const cm = caminos.get(k); cm.te[j] = c.te; cm.a[j] = c.amplitud;
      }
    }
    const datos = new Float32Array(n);
    let pico = 0;
    for (let s = 0; s < n; s++) {
      const u = s / sr / paso, j = Math.min(m - 2, Math.floor(u)), a = u - j;
      let v = 0;
      for (const cm of caminos.values()) {
        if (Number.isNaN(cm.te[j]) || Number.isNaN(cm.te[j + 1])) continue;
        const te = cm.te[j] + a * (cm.te[j + 1] - cm.te[j]), A = cm.a[j] + a * (cm.a[j + 1] - cm.a[j]);
        v += A * Math.sin(DOS_PI * cm.f * te);
      }
      datos[s] = v; pico = Math.max(pico, Math.abs(v));
    }
    const g = 0.3 / (pico || 1), rampa = Math.floor(0.02 * sr);
    for (let s = 0; s < n; s++) datos[s] *= g * Math.min(1, s / rampa, (n - 1 - s) / rampa);
    const buf = ctx.createBuffer(1, n, sr); buf.copyToChannel(datos, 0);
    const fuente = ctx.createBufferSource(); fuente.buffer = buf; fuente.connect(ctx.destination);
    fuente.onended = () => { if (audio && audio.fuente === fuente) detenerAudio(); };
    fuente.start();
    audio = { ctx, fuente };
    $('#b-escuchar').setAttribute('aria-pressed', 'true'); $('#escuchar-txt').textContent = 'Detener';
    // La animación acompaña al sonido en tiempo real
    velocidad = 1; document.querySelectorAll('#velocidades button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === 1)));
    jugando = true; todo();
    avisar(`Escuchando lo que oye ${ESC.observadores[ESC.obs].nombre}`, false);
  }
  $('#b-escuchar').addEventListener('click', escuchar);

  // ---------------------------------------------------------------------
  // Reproducción
  // ---------------------------------------------------------------------
  function cuadro(ahora) {
    if (jugando) { t = Math.min(ESC.duracion, t + Math.min(0.05, (ahora - ultimo) / 1000) * velocidad); if (t >= ESC.duracion) jugando = false; todo(); }
    ultimo = ahora; requestAnimationFrame(cuadro);
  }
  function alternar() { if (audio) detenerAudio(); if (t >= ESC.duracion) t = 0; jugando = !jugando; todo(); }
  const irA = nt => { if (audio) detenerAudio(); jugando = false; t = Math.max(0, Math.min(ESC.duracion, nt)); todo(); };
  $('#b-play').addEventListener('click', alternar);
  $('#b-reiniciar').addEventListener('click', () => irA(0));
  $('#b-atras').addEventListener('click', () => irA(t - ESC.duracion / 200));
  $('#b-adelante').addEventListener('click', () => irA(t + ESC.duracion / 200));
  $('#velocidades').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) velocidad = parseFloat(b.dataset.v); });
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => { const k = b.dataset.capa; ESC.capas[k] = !ESC.capas[k]; b.setAttribute('aria-pressed', String(ESC.capas[k])); if (k === 'ecos') recalcular(); else todo(); registrar(); }));
  $('#pest').addEventListener('click', () => setTimeout(todo, 0));

  // ---------------------------------------------------------------------
  // Paleta: colocar fuentes, observadores y paredes
  // ---------------------------------------------------------------------
  function ponerHerramienta(h) {
    if (h === 'viento') { sel = 'medio'; inspector(); todo(); return; }
    if (h === 'frecuencimetro') { ESC.capas.valores = !ESC.capas.valores; titulo(); todo(); return; }
    if (h === 'microfono') { const b = document.querySelector('#pest [aria-controls="p-graficas"]'); if (b) b.click(); return; }
    herramienta = herramienta === h ? null : h;
    document.querySelectorAll('#paleta-objetos .herr').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.herr === herramienta)));
    lienzo.style.cursor = herramienta ? 'crosshair' : 'default';
    if (herramienta) avisar(`${{ fuente: 'Fuente sonora', observador: 'Observador', pared: 'Pared reflectante' }[herramienta]}: clic en el lienzo · Esc termina`, false);
  }
  document.querySelectorAll('.herr').forEach(b => b.addEventListener('click', () => ponerHerramienta(b.dataset.herr)));
  function colocar(p) {
    const p0 = [Math.round(p[0]), Math.round(p[1])];
    if (herramienta === 'fuente' && ESC.fuentes.length < 8) { ESC.fuentes.push({ nombre: `S${subs(ESC.fuentes.length + 1)}`, p: p0, v: [0, 0], f: ESC.fuentes[0]?.f || 440, inicio: null }); sel = 'fuente:' + (ESC.fuentes.length - 1); }
    else if (herramienta === 'observador' && ESC.observadores.length < 8) { ESC.observadores.push({ nombre: `O${subs(ESC.observadores.length + 1)}`, p: p0, v: [0, 0] }); sel = 'obs:' + (ESC.observadores.length - 1); }
    else if (herramienta === 'pared' && ESC.paredes.length < 4) {
      // Normal hacia la primera fuente
      const s = ESC.fuentes[0] ? ESC.fuentes[0].p : [0, 0];
      ESC.paredes.push({ nombre: 'Pared', punto: p0, normal: [s[0] >= p0[0] ? 1 : -1, 0], velocidad: 0, largo: 0.6 * (tz.h / tz.vista.escala) }); sel = 'pared:' + (ESC.paredes.length - 1);
    } else return;
    herramienta = null; document.querySelectorAll('#paleta-objetos .herr').forEach(b => b.setAttribute('aria-pressed', 'false')); lienzo.style.cursor = 'default';
    cambio();
  }
  function quitarSeleccion() {
    if (sel.startsWith('fuente:') && ESC.fuentes.length > 1) { ESC.fuentes.splice(+sel.slice(7), 1); }
    else if (sel.startsWith('obs:') && ESC.observadores.length > 1) { ESC.observadores.splice(+sel.slice(4), 1); ESC.obs = 0; }
    else if (sel.startsWith('pared:')) ESC.paredes.splice(+sel.slice(6), 1);
    else return;
    for (const [k, d] of Object.entries(ESC.variables)) { d.liga = d.liga.filter(r => leer(r) !== undefined); if (!d.liga.length) delete ESC.variables[k]; }
    sel = 'medio'; construirVariables(); cambio(); avisar('Objeto quitado');
  }

  // ---------------------------------------------------------------------
  // Lienzo: selección, arrastre, zoom y paneo
  // ---------------------------------------------------------------------
  function objetoEn(X, Y) {
    const v = tz.vista;
    for (let i = ESC.fuentes.length - 1; i >= 0; i--) { const [a, b] = v.P(posF(ESC.fuentes[i], t)); if (Math.hypot(X - a, Y - b) < 13) return 'fuente:' + i; }
    for (let i = ESC.observadores.length - 1; i >= 0; i--) { const [a, b] = v.P(posicionEn(ESC.observadores[i], t)); if (Math.hypot(X - a, Y - b - 2) < 15) return 'obs:' + i; }
    for (let i = 0; i < ESC.paredes.length; i++) { const p = ESC.paredes[i], c0 = posPared(p, t), [a] = v.P(c0); if (Math.abs(X - a) < 8 && Math.abs(v.my(Y) - c0[1]) < (p.largo || 40) / 2) return 'pared:' + i; }
    return null;
  }
  lienzo.addEventListener('pointerdown', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top;
    if (ev.button === 1 || ev.button === 2 || espacioPulsado) { paneo = [X, Y, tz.vista.ox, tz.vista.oy]; lienzo.setPointerCapture(ev.pointerId); return; }
    if (herramienta) { colocar([tz.vista.mx(X), tz.vista.my(Y)]); return; }
    const ob = objetoEn(X, Y);
    if (ob) { if (sel !== ob) { sel = ob; inspector(); todo(); } arrastre = { ob, movido: false }; lienzo.setPointerCapture(ev.pointerId); return; }
    paneo = [X, Y, tz.vista.ox, tz.vista.oy]; lienzo.setPointerCapture(ev.pointerId);
  });
  lienzo.addEventListener('pointermove', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, v = tz.vista;
    $('#cx').textContent = cantidad(v.mx(X), 'm', 4); $('#cy').textContent = cantidad(v.my(Y), 'm', 4);
    if (paneo) { vistaTocada = true; v.ox = paneo[2] + X - paneo[0]; v.oy = paneo[3] + Y - paneo[1]; dibujar(); return; }
    if (arrastre) {
      // Se arrastra la posición actual: la inicial es la actual menos v·t
      const p = [v.mx(X), v.my(Y)], red = x => Math.round(x * (ev.shiftKey ? 10 : 1)) / (ev.shiftKey ? 10 : 1), a = arrastre.ob;
      if (a.startsWith('fuente:') && ESC.fuentes[+a.slice(7)].vaiven) {
        // El eje se mueve con la fuente: la fuente queda bajo el puntero
        const m = ESC.fuentes[+a.slice(7)], q = posF(m, t);
        m.vaiven.centro = [red(m.vaiven.centro[0] + p[0] - q[0]), red(m.vaiven.centro[1] + p[1] - q[1])];
      } else if (a.startsWith('fuente:') || a.startsWith('obs:')) {
        const m = a.startsWith('fuente:') ? ESC.fuentes[+a.slice(7)] : ESC.observadores[+a.slice(4)];
        m.p = [red(p[0] - m.v[0] * t), red(p[1] - m.v[1] * t)];
      } else { const w = ESC.paredes[+a.slice(6)]; w.punto = [red(p[0] - w.normal[0] * (w.velocidad || 0) * t), w.punto[1]]; }
      arrastre.movido = true; MOTOR = escenaMotor(); dibujar(); lecturas(); return;
    }
    const h = objetoEn(X, Y); lienzo.style.cursor = herramienta ? 'crosshair' : h ? 'grab' : 'default'; hover = h;
  });
  lienzo.addEventListener('pointerup', () => { if (arrastre && arrastre.movido) cambio(); arrastre = null; paneo = null; });
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
  document.addEventListener('pointerdown', ev => { if (!ev.target.closest('#menu-escenas, #b-escenas')) $('#menu-escenas').hidden = true; });
  const COMANDOS = [
    ['i-reproducir', 'Reproducir o pausar', 'Espacio', alternar],
    ['n-microfono', 'Escuchar lo que oye el observador', 'L', () => { if (!$('#b-escuchar').disabled) escuchar(); }],
    ['i-reiniciar', 'Reiniciar', 'Inicio', () => irA(0)],
    ['i-encuadrar', 'Encuadrar todo', 'F', encuadrarTodo],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['o-fuente-sonora', 'Colocar una fuente sonora', '', () => ponerHerramienta('fuente')],
    ['o-observador', 'Colocar un observador', '', () => ponerHerramienta('observador')],
    ['o-pared-reflectante', 'Colocar una pared reflectante', '', () => ponerHerramienta('pared')],
    ['i-deshacer', 'Deshacer', 'Ctrl Z', deshacer], ['i-rehacer', 'Rehacer', 'Ctrl Y', rehacer],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar], ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
    ['i-exportar', 'Exportar datos a CSV', '', exportarCSV], ['i-imagen', 'Exportar imagen del lienzo', '', exportarPNG],
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
    else if (ev.key === 'ArrowRight') irA(t + ESC.duracion / 200);
    else if (ev.key === 'ArrowLeft') irA(t - ESC.duracion / 200);
    else if (ev.key === 'Home') irA(0);
    else if (ev.key === 'Escape') { if (herramienta) ponerHerramienta(herramienta); detenerAudio(); }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') quitarSeleccion();
    else if (tecla === 'f') encuadrarTodo();
    else if (tecla === 'l' && !$('#b-escuchar').disabled) escuchar();
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });

  // ---------------------------------------------------------------------
  // Arranque. Parámetros para capturas: ?escena=pared&t=2&pest=eventos&obs=1
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); if (!vistaTocada) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } todo(); });
  document.fonts.ready.then(() => {
    const qp = new URLSearchParams(location.search), limpio = ![...qp.keys()].length;
    const pend = escenaPendiente('ondas');
    if (pend && aOtroEspacio(pend, 'doppler')) return;
    const previa = pend || (limpio ? autoguardado.leer('ondas-doppler', { modulo: 'ondas' }) : null);
    tz.ajustar();
    if (qp.has('escena') || !previa || previa.espacio !== 'doppler') ESC = completa(ESCENAS.find(e => e.clave === qp.get('escena')) || ESCENAS[0]);
    else ESC = datosSeguros(previa.datos);
    aplicarVariables();
    if (qp.has('obs')) ESC.obs = Math.max(0, Math.min(ESC.observadores.length - 1, parseInt(qp.get('obs'), 10) || 0));
    autoguardar = limpio || !!previa;
    titulo(); construirVariables(); inspector(); encuadrar(); escala0 = tz.vista.escala; zoomTexto(); recalcular();
    if (qp.has('t')) t = Math.max(0, Math.min(ESC.duracion, parseFloat(qp.get('t')) || 0));
    const pe = qp.get('pest'); if (pe) { const b = document.querySelector(`#pest [aria-controls="p-${pe}"]`); if (b) b.click(); }
    todo();
    historial = new Historial(instantanea()); botonesHistorial();
    requestAnimationFrame(a => { ultimo = a; requestAnimationFrame(cuadro); });
  });
})();
