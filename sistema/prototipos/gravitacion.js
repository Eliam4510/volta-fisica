/* ==========================================================================
   Volta · prototipo de Gravitación — "Órbitas"
   Un planeta fijo y un satélite (partícula de prueba). La trayectoria sale
   del motor de N cuerpos simpléctico (Yoshida de 4.º orden) en
   sistema/motores/gravitacion.js; la órbita prevista y los elementos
   orbitales son la solución de Kepler del estado actual.
   Escenas: el cañón de Newton, satélite en órbita circular, órbita elíptica
   con áreas barridas, órbita geoestacionaria (MEXT 2023 P3) y velocidad de
   escape (MEXT 2018 P3).
   Parámetros de URL para capturas: ?escena=canon|circular|eliptica|geo|escape|fuerza-altura|escape-horizontal|periodo-radio|masa-planeta|kepler-tercera|geo-luna,
   ?t= (s), ?fase= (fracción de la duración), ?pest=energia|eventos|tabla,
   ?areas=1, ?marco=rotante, ?mostrar=f
   ========================================================================== */
import {
  CUERPOS, G as G_UNIVERSAL, elementosOrbitales, puntosConica, simularGravitacion, estadoEn,
  alturaSincrona, semiejeDesdePeriodo, velocidadCircular, cuerposOrbita, escapeDesdeGravedad,
} from '../motores/gravitacion.js';
import { aCSV, muestrear } from '../nucleo/csv.js';
import { descargarTexto, descargarLienzo, nombreArchivo, avisar } from '../componentes/exportar.js';
import { crearEscena, numero, texto } from '../nucleo/escena.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';
import { registrarDocumento, confirmarCambios, documentoNuevo, hayCambios } from '../componentes/documento.js';
import { evaluar } from '../nucleo/unidades.js';

(function () {
  'use strict';
  const { Trazo, fmt, cantidad, grafica, LineaTiempo } = Volta;
  const $ = s => document.querySelector(s);
  const KM = 1000, GRADO = Math.PI / 180;

  // ---------------------------------------------------------------------
  // Escenas
  // ---------------------------------------------------------------------
  const TIERRA = CUERPOS.tierra;
  // MEXT 2018 P3: la Tierra con los datos redondeados del examen (g, R y G)
  const TIERRA_EXAMEN = { nombre: 'Tierra', mu: 9.8 * 6.4e6 * 6.4e6, radio: 6.4e6, periodoRotacion: TIERRA.periodoRotacion, g: 9.8, G: 6.67e-11 };
  const T_SIDEREO = TIERRA.periodoRotacion;
  const V_ELIPTICA = (() => {           // perigeo a 600 km y periodo de medio día sidéreo (tipo Molniya)
    const rp = TIERRA.radio + 600e3, a = semiejeDesdePeriodo(TIERRA.mu, T_SIDEREO / 2);
    return Math.sqrt(TIERRA.mu * (2 / rp - 1 / a)) / KM;
  })();

  /**
   * phi: dirección del punto de lanzamiento (°); sentido: +1 antihorario (el
   * del giro de la Tierra vista desde el norte), −1 horario; orbitas: vueltas
   * simuladas si la órbita está ligada; libre: duración si no lo está.
   */
  const ESCENAS = [
    {
      id: 'canon', titulo: 'El cañón de Newton', tipo: 'Tutorial', planeta: TIERRA, montana: true,
      cuerpo: 'Bala', icono: 'o-particula', phi: 90, sentido: -1,
      h: { val: 1000, min: 100, max: 3000, paso: 10 }, v0: { val: 8.0, min: 0, max: 12, paso: 0.01 },
      orbitas: 1, libre: 4 * 3600, maxDur: 8 * 3600, velocidad: 1000,
    },
    {
      id: 'circular', titulo: 'Satélite en órbita circular', tipo: 'Tutorial', planeta: TIERRA,
      cuerpo: 'Satélite', icono: 'o-satelite', phi: 45, sentido: 1,
      h: { val: 400, min: 150, max: 3000, paso: 10 }, v0: { val: velocidadCircular(TIERRA.mu, TIERRA.radio + 400e3) / KM, min: 5, max: 11, paso: 0.001 },
      orbitas: 2, libre: 4 * 3600, maxDur: 12 * 3600, velocidad: 500,
    },
    {
      id: 'eliptica', titulo: 'Órbita elíptica y áreas barridas', tipo: 'Ejemplo', planeta: TIERRA,
      cuerpo: 'Satélite', icono: 'o-satelite', phi: 0, sentido: 1,
      h: { val: 600, min: 150, max: 3000, paso: 10 }, v0: { val: V_ELIPTICA, min: 6, max: 11.5, paso: 0.001 },
      orbitas: 1, libre: 12 * 3600, maxDur: 36 * 3600, velocidad: 2000, areas: true,
    },
    {
      id: 'geo', titulo: 'Órbita geoestacionaria', tipo: 'MEXT', anio: 2023, planeta: TIERRA,
      cuerpo: 'Satélite', icono: 'o-satelite', phi: 35, sentido: 1, rotacion: true,
      h: { val: alturaSincrona(TIERRA.mu, TIERRA.radio, T_SIDEREO) / KM, min: 20000, max: 50000, paso: 1 },
      v0: { val: Math.cbrt(2 * Math.PI * TIERRA.mu / T_SIDEREO) / KM, min: 2, max: 4.5, paso: 0.001 },
      orbitas: 1, libre: 2 * 86400, maxDur: 3 * 86400, velocidad: 5000,
    },
    {
      id: 'escape', titulo: 'Velocidad de escape', tipo: 'MEXT', anio: 2018, planeta: TIERRA_EXAMEN, examen: true,
      cuerpo: 'Proyectil', icono: 'o-particula', phi: 0, sentido: 1,
      h: null, v0: { val: 11.2, min: 8, max: 15, paso: 0.01 },
      orbitas: 1, libre: 3 * 3600, maxDur: 24 * 3600, velocidad: 2000,
    },
  ];
  // Preguntas cortas MEXT: cada una con las lecturas que contestan el examen
  // (extra(s, el) → filas [símbolo, valor, unidad, ayuda] añadidas a las lecturas)
  const MU_EX = TIERRA_EXAMEN.mu, R_EX = TIERRA_EXAMEN.radio, G_EX = TIERRA_EXAMEN.g;
  const T_LUNA_27 = 27 * 86400;
  ESCENAS.push(
    {
      id: 'fuerza-altura', titulo: 'Fuerza gravitatoria a una altura', tipo: 'MEXT', anio: 2027, planeta: TIERRA_EXAMEN, examen: true,
      cuerpo: 'Satélite', icono: 'o-satelite', phi: 60, sentido: 1,
      h: { val: 1600, min: 150, max: 20000, paso: 10 }, v0: { val: velocidadCircular(MU_EX, R_EX + 1.6e6) / KM, min: 2, max: 11, paso: 0.001 },
      orbitas: 1, libre: 4 * 3600, maxDur: 12 * 3600, velocidad: 1000,
      extra: (s, el) => [['F/F<sub class="r">0</sub>', fmt((R_EX / el.r) ** 2, 4), '', 'Fuerza a esta distancia entre la fuerza en la superficie: (R/r)²|Force ratio']],
    },
    {
      id: 'escape-horizontal', titulo: 'Escape lanzando en horizontal', tipo: 'MEXT', anio: 2014, planeta: TIERRA_EXAMEN, examen: true,
      cuerpo: 'Proyectil', icono: 'o-particula', phi: 0, sentido: 1,
      h: null, v0: { val: escapeDesdeGravedad(G_EX, R_EX) / KM, min: 6, max: 14, paso: 0.01 },
      orbitas: 1, libre: 6 * 3600, maxDur: 24 * 3600, velocidad: 2000,
      extra: () => [
        ['√<span class="sim">gR</span>', fmt(Math.sqrt(G_EX * R_EX) / KM, 4), 'km/s', 'Órbita circular rasante: no basta para escapar|Grazing circular speed'],
        ['√<span class="sim">2gR</span>', fmt(escapeDesdeGravedad(G_EX, R_EX) / KM, 4), 'km/s', 'Mínima para escapar desde la superficie|Escape speed'],
      ],
    },
    {
      id: 'periodo-radio', titulo: 'Periodo de una órbita circular', tipo: 'MEXT', anio: 2010, planeta: TIERRA_EXAMEN, examen: true,
      cuerpo: 'Satélite', icono: 'o-satelite', phi: 45, sentido: 1,
      h: { val: 6400, min: 150, max: 30000, paso: 10 }, v0: { val: velocidadCircular(MU_EX, 2 * R_EX) / KM, min: 2, max: 11, paso: 0.001 },
      orbitas: 2, libre: 8 * 3600, maxDur: 24 * 3600, velocidad: 2000,
      extra: (s, el) => { const [v, u] = tiempoLegible(2 * Math.PI * (el.r / R_EX) * Math.sqrt(el.r / G_EX)); return [['2π(<span class="sim">r</span>/<span class="sim">R</span>)√(<span class="sim">r</span>/<span class="sim">g</span>)', v, u, 'Periodo de la órbita circular de radio r, con g y R de la superficie|Circular period']]; },
    },
    {
      id: 'masa-planeta', titulo: 'Masa de un planeta a partir de su luna', tipo: 'MEXT', anio: 2015, planeta: TIERRA,
      cuerpo: 'Luna', icono: 'o-satelite', phi: 30, sentido: 1,
      h: { val: (384400e3 - TIERRA.radio) / KM, min: 20000, max: 500000, paso: 100 }, v0: { val: velocidadCircular(TIERRA.mu, 384400e3) / KM, min: 0.5, max: 1.5, paso: 0.0001 },
      orbitas: 1, libre: 40 * 86400, maxDur: 80 * 86400, velocidad: 100000, escalaVel: 100,
      extra: (s, el) => T_MEDIDO == null ? [] : [
        ['4π²<span class="sim">a</span>³/(<span class="sim">G</span><span class="sim">T</span>²)', fmt(4 * Math.PI ** 2 * EL0.a ** 3 / (G_UNIVERSAL * T_MEDIDO ** 2), 4), 'kg', 'Masa deducida del semieje y del periodo medido|Mass from Kepler'],
        ['M', fmt(esc.planeta.masa, 4), 'kg', 'Masa del planeta|Planet mass'],
      ],
    },
    {
      id: 'kepler-tercera', titulo: 'Tercera ley de Kepler', tipo: 'MEXT', anio: 2013, planeta: CUERPOS.sol,
      cuerpo: 'Planeta', icono: 'o-planeta', phi: 0, sentido: 1,
      h: { val: (1.496e11 - CUERPOS.sol.radio) / KM, min: 3e7, max: 4e8, paso: 1e5 }, v0: { val: velocidadCircular(CUERPOS.sol.mu, 1.496e11) / KM, min: 15, max: 45, paso: 0.01 },
      orbitas: 1, libre: 2 * 365.25 * 86400, maxDur: 6 * 365.25 * 86400, velocidad: 2000000, escalaVel: 1000,
      extra: (s, el) => [
        ['<span class="sim">T</span>²/<span class="sim">a</span>³', ligada(el) ? fmt(el.periodo ** 2 / (el.a / KM) ** 3, 4) : '—', 's²/km³', 'Cambia la rapidez: la órbita cambia y el cociente no|Kepler ratio'],
        ['4π²/(<span class="sim">GM</span>)', fmt(4 * Math.PI ** 2 / esc.planeta.mu * KM ** 3, 4), 's²/km³', 'La constante k de la tercera ley|Kepler constant'],
      ],
    },
    {
      id: 'geo-luna', titulo: 'Satélite geoestacionario y la Luna', tipo: 'MEXT', anio: 2009, planeta: TIERRA, rotacion: true,
      cuerpo: 'Satélite', icono: 'o-satelite', phi: 35, sentido: 1,
      h: { val: alturaSincrona(TIERRA.mu, TIERRA.radio, 86400) / KM, min: 20000, max: 50000, paso: 1 },
      v0: { val: Math.cbrt(2 * Math.PI * TIERRA.mu / 86400) / KM, min: 2, max: 4.5, paso: 0.001 },
      orbitas: 1, libre: 2 * 86400, maxDur: 3 * 86400, velocidad: 5000,
      extra: (s, el) => {
        const rL = semiejeDesdePeriodo(esc.planeta.mu, T_LUNA_27);
        return [
          ['<span class="sim">r</span><sub class="r">L</sub>', fmt(rL / KM, 4), 'km', 'Radio de la órbita de la Luna con un periodo de 27 días (Kepler)|Moon orbit radius'],
          ['<span class="sim">a</span>/<span class="sim">r</span><sub class="r">L</sub>', ligada(el) ? fmt(el.a / rL, 4) : '—', '', '(T/T_L)^(2/3): con un día y 27 días, 1/9|Radius ratio'],
        ];
      },
    },
  );
  const escenaPorId = id => ESCENAS.find(e => e.id === id) || ESCENAS[0];
  const chipEscena = e => (e.tipo === 'MEXT' ? `MEXT ${e.anio}` : e.tipo);

  // ---------------------------------------------------------------------
  // Estado de la escena
  // ---------------------------------------------------------------------
  let esc = ESCENAS[0];
  /** @type {Record<string, any>} */
  let V = {};
  let alfa = 0, masa = 1000, marco = 'inercial';
  const capas = { vectores: true, traza: true, areas: false, apsides: true, cotas: true };
  // Escalas de dibujo (px por unidad), fijadas al cargar la escena
  let kV = 10, kA = 10, kF = 0.01;

  function construirV() {
    const pl = esc.planeta;
    V = {};
    if (esc.h) V.h = { sim: 'h', u: 'km', ...esc.h };
    V.v0 = { sim: 'v', sub: '0', u: 'km/s', ...esc.v0 };
    if (pl.g) {
      V.g = { sim: 'g', constante: true, texto: pl.g.toFixed(2), u: 'm/s²' };
      V.R = { sim: 'R', constante: true, texto: String(pl.radio / KM), u: 'km' };
      V.G = { sim: 'G', constante: true, texto: fmt(pl.G, 3), u: 'N·m²/kg²' };
    } else {
      V.M = { sim: 'M', constante: true, texto: fmt(pl.masa, 4), u: 'kg' };
      V.R = { sim: 'R', constante: true, texto: fmt(pl.radio / KM, 4), u: 'km' };
      V.G = { sim: 'G', constante: true, texto: fmt(G_UNIVERSAL, 4), u: 'N·m²/kg²' };
      if (esc.rotacion) V.T = { sim: 'T', constante: true, texto: fmt(pl.periodoRotacion, 5), u: 's' };
    }
  }
  const altura = () => (V.h ? V.h.val : 0) * KM;
  const OMEGA = () => 2 * Math.PI / esc.planeta.periodoRotacion;
  const esTierra = () => esc.planeta.nombre === 'Tierra';
  const ligada = el => el.tipo === 'circular' || el.tipo === 'elíptica';

  // ---------------------------------------------------------------------
  // Física: motor puro en sistema/motores/gravitacion.js (probado aparte)
  // ---------------------------------------------------------------------
  let SIM, EL0, DUR = 1, SERIES, IMPACTO = null, T_MEDIDO = null;
  function cuerposEscena() {
    return cuerposOrbita(esc.planeta, { altura: altura(), velocidad: V.v0.val * KM, alfa, phi: esc.phi * GRADO, sentido: esc.sentido, masa, nombre: esc.cuerpo });
  }
  function simular() {
    const cs = cuerposEscena(), sat = cs[1], mu = esc.planeta.mu, R = esc.planeta.radio;
    EL0 = elementosOrbitales(mu, [sat.x, sat.y], [sat.vx, sat.vy]);
    const dur = ligada(EL0) ? Math.min((esc.orbitas + 0.02) * EL0.periodo, esc.maxDur) : esc.libre;
    // Paso: la escala de tiempo más corta es el paso por el periapsis (o por la superficie, si choca)
    const rEf = Math.max(EL0.tipo === 'radial' ? EL0.r : EL0.rp, R);
    const w = Math.max(Math.abs(EL0.h) / (rEf * rEf), Math.sqrt(mu / (rEf * rEf * rEf)));
    const dt = Math.max(2 * Math.PI / w / 1500, dur / 250000);
    SIM = simularGravitacion({ cuerpos: cs, duracion: dur, dt, detenerAlPosarse: true });
    DUR = Math.max(SIM.duracion, 1);
    IMPACTO = SIM.eventos.find(e => e.tipo === 'impacto') || null;
    const v1 = SIM.eventos.find(e => e.tipo === 'vuelta');
    T_MEDIDO = v1 ? v1.t : null;
    // Series por muestra: r, |v|, área barrida acumulada (con el signo del giro) y energías
    const c = SIM.cuerpos[1], m = SIM.t.length;
    SERIES = { r: new Float64Array(m), v: new Float64Array(m), A: new Float64Array(m), K: new Float64Array(m), U: new Float64Array(m) };
    for (let k = 0; k < m; k++) {
      const r = Math.hypot(c.x[k], c.y[k]), v2 = c.vx[k] ** 2 + c.vy[k] ** 2;
      SERIES.r[k] = r; SERIES.v[k] = Math.sqrt(v2);
      SERIES.K[k] = 0.5 * masa * v2; SERIES.U[k] = -mu * masa / r;
      if (k) SERIES.A[k] = SERIES.A[k - 1] + 0.5 * EL0.sentido * (c.x[k - 1] * c.y[k] - c.x[k] * c.y[k - 1]);
    }
  }
  const estado = tt => estadoEn(SIM, Math.max(0, Math.min(tt, DUR)))[1];
  const indiceEn = tt => { let lo = 0, hi = SIM.t.length - 1; if (tt >= SIM.t[hi]) return hi; while (hi - lo > 1) { const md = (lo + hi) >> 1; if (SIM.t[md] <= tt) lo = md; else hi = md; } return lo; };
  function areaEn(tt) {
    const k = indiceEn(tt), c = SIM.cuerpos[1], s = estado(tt);
    return SERIES.A[k] + 0.5 * EL0.sentido * (c.x[k] * s.y - s.x * c.y[k]);
  }
  const energia = s => {
    const v2 = s.vx * s.vx + s.vy * s.vy, r = Math.hypot(s.x, s.y);
    const K = 0.5 * masa * v2, U = -esc.planeta.mu * masa / r;
    return { K, U, E: K + U };
  };
  function nombreEvento(e) {
    if (e.tipo === 'periapsis') return esTierra() ? 'Perigeo' : 'Periapsis';
    if (e.tipo === 'apoapsis') return esTierra() ? 'Apogeo' : 'Apoapsis';
    if (e.tipo === 'vuelta') return `Vuelta ${e.n}`;
    return 'Impacto con la superficie';
  }

  // ---------------------------------------------------------------------
  // Formato
  // ---------------------------------------------------------------------
  // Valor y unidad por separado (columnas de lecturas), con prefijo SI
  const PREF = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n']];
  function prefijado(v, u) {
    const a = Math.abs(v);
    if (!Number.isFinite(v) || a === 0) return [v, u];
    const [f, p] = PREF.find(([f]) => a >= f * 0.99995) || PREF[PREF.length - 1];
    return [v / f, p + u];
  }
  // Velocidad de reproducción compacta: 2000×, 5·10⁴×, 10⁶×
  function etiquetaVelocidad(v) {
    if (v < 1e4) return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '×';
    const e = Math.floor(Math.log10(v) + 1e-9), m = Math.round(v / 10 ** e);
    const sup = String(e).replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]);
    return (m === 1 ? '' : m + '·') + '10' + sup + '×';
  }
  // Duración legible: s, min, h o d según la magnitud
  function tiempoLegible(s) {
    if (!Number.isFinite(s)) return ['—', ''];
    if (s < 600) return [fmt(s, 4), 's'];
    if (s < 3 * 3600) return [fmt(s / 60, 4), 'min'];
    if (s < 3 * 86400) return [fmt(s / 3600, 4), 'h'];
    return [fmt(s / 86400, 4), 'd'];
  }
  // Notación científica para cantidades muy pequeñas (fmt redondea a 0 bajo 10⁻¹²)
  function cientifico(x, cifras = 2) {
    if (x === 0 || !Number.isFinite(x)) return '0';
    const e = Math.floor(Math.log10(Math.abs(x))), m = x / 10 ** e;
    const sup = String(e).replace('-', '⁻').replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]);
    return `${m.toFixed(cifras - 1).replace('-', '−')} × 10${sup}`;
  }
  const fmtVar = d => (d.texto != null ? d.texto : d.val.toFixed(!(d.paso > 0) || d.paso >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(d.paso) - 1e-9))).replace('-', '−'));
  const simHTML = (a, sub, recto = true) => `<span class="sim">${a}${sub ? `<sub${recto ? ' class="r"' : ''}>${sub}</sub>` : ''}</span>`;

  // ---------------------------------------------------------------------
  // Estado de la interfaz
  // ---------------------------------------------------------------------
  let t = 0, jugando = false, velocidad = 1000, ultimo = 0, encuadreHecho = false, vistaTocada = false;
  const lienzo = $('#lienzo'), area = $('#area');
  const tz = new Trazo(lienzo);
  let arrastre = null, paneo = null, espacioPulsado = false;
  const mostrar = () => ({
    v: $('#m-v').checked, a: $('#m-a').checked, F: $('#m-f').checked, p: $('#m-p').checked, ve: $('#m-ve').checked, ar: capas.areas,
  });

  // Posición en el lienzo (km) en el marco elegido: el que gira con el planeta
  // rota todo −Ω·t alrededor de su centro
  function W(x, y, tt) {
    if (marco !== 'rotante') return [x / KM, y / KM];
    const a = -OMEGA() * tt, c = Math.cos(a), s = Math.sin(a);
    return [(x * c - y * s) / KM, (x * s + y * c) / KM];
  }
  function velEnMarco(s, tt) {
    if (marco !== 'rotante') return [s.vx, s.vy];
    const w = OMEGA(), vx = s.vx + w * s.y, vy = s.vy - w * s.x, a = -w * tt, c = Math.cos(a), sn = Math.sin(a);
    return [vx * c - vy * sn, vx * sn + vy * c];
  }
  function vecEnMarco(ax, ay, tt) {
    if (marco !== 'rotante') return [ax, ay];
    const a = -OMEGA() * tt, c = Math.cos(a), sn = Math.sin(a);
    return [ax * c - ay * sn, ax * sn + ay * c];
  }
  const meridianoVisible = () => esc.rotacion || marco === 'rotante';

  // ---------------------------------------------------------------------
  // Dibujo del lienzo
  // ---------------------------------------------------------------------
  function encuadrar() {
    const c = SIM.cuerpos[1], R = esc.planeta.radio + (esc.montana ? altura() : 0);
    let x0 = -R, x1 = R, y0 = -R, y1 = R;
    const incluir = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
    for (let k = 0; k < c.x.length; k += Math.max(1, Math.floor(c.x.length / 2000))) incluir(c.x[k], c.y[k]);
    const s0 = estado(0);
    if (ligada(EL0)) for (const [x, y] of puntosConica(esc.planeta.mu, [s0.x, s0.y], [s0.vx, s0.vy], { n: 180 })) incluir(x, y);
    const m = 0.06 * Math.max(x1 - x0, y1 - y0);
    tz.vista.encuadrar({ x0: (x0 - m) / KM, x1: (x1 + m) / KM, y0: (y0 - m) / KM, y1: (y1 + m) / KM }, { x: 0, y: 40, w: tz.w, h: tz.h - 80 }, 36);
    encuadreHecho = true;
  }

  // Sectores de áreas barridas en intervalos iguales hasta el instante t
  function sectores() {
    const n = 12, dts = (ligada(EL0) ? EL0.periodo : DUR) / n, c = SIM.cuerpos[1];
    const arcos = [];
    for (let q = 0; q * dts < t - 1e-9 && arcos.length < 4 * n; q++) {
      const ta = q * dts, tb = Math.min((q + 1) * dts, t);
      if (IMPACTO && ta >= IMPACTO.t) break;
      const pts = [], sa = estado(ta);
      pts.push([sa.x / KM, sa.y / KM]);
      const ka = indiceEn(ta) + 1, kb = indiceEn(tb), salto = Math.max(1, Math.floor((kb - ka) / 80));
      for (let k = ka; k <= kb; k += salto) pts.push([c.x[k] / KM, c.y[k] / KM]);
      const sb = estado(tb); pts.push([sb.x / KM, sb.y / KM]);
      arcos.push(pts);
    }
    if (!arcos.length) return;
    tz.gravSectores([0, 0], arcos);
    // Ficha con el área de un intervalo (todas iguales: segunda ley de Kepler),
    // por fuera de la órbita, sobre el sector completo que queda más arriba
    if (arcos.length >= 2) {
      const v = tz.vista, [cx, cy] = v.P([0, 0]);
      let mejor = null;
      arcos.slice(0, -1).forEach(a => { const p = v.P(a[Math.floor(a.length / 2)]); if (!mejor || p[1] < mejor[1]) mejor = p; });
      const [ax, ay] = [cx + 0.82 * (mejor[0] - cx), cy + 0.82 * (mejor[1] - cy)], Wf = 230, Hf = 38;
      const fx = Math.max(8, Math.min(tz.w - Wf - 8, mejor[0] - Wf / 2)), fy = Math.max(48, Math.min(tz.h - Hf - 8, mejor[1] - Hf - 28));
      const A = (areaEn(dts) - areaEn(0)) / 1e12;
      tz.ficha(fx, fy, [
        [{ t: 'Áreas en intervalos iguales', f: 'ui', tam: 11.5 }],
        [{ t: 'Δ', f: 'num', tam: 11.5 }, { t: 't', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(dts, 's', 4) + '   ', f: 'num', tam: 11.5 }, { t: 'A', f: 'sim', tam: 13, color: 'inercia' }, { t: ' = ' + cantidad(A, 'Mm²', 4), f: 'num', tam: 11.5 }],
      ], { ancla: [ax, ay] });
    }
  }

  // Dirección (pantalla) de la etiqueta del cuerpo: detrás del movimiento y
  // hacia fuera del planeta, donde no hay vectores ni marcas
  function dirEtiqueta(s, sx, sy, ox, oy) {
    const [vx, vy] = velEnMarco(s, t), m = Math.hypot(vx, vy), L = Math.hypot(sx - ox, sy - oy) || 1;
    if (m < 1e-6 || (IMPACTO && t >= IMPACTO.t - 1e-9)) return [(sx - ox) / L, (sy - oy) / L];
    const ux = -vx / m * 0.6 + (sx - ox) / L * 0.8, uy = vy / m * 0.6 + (sy - oy) / L * 0.8, n = Math.hypot(ux, uy) || 1;
    return [ux / n, uy / n];
  }

  function dibujar() {
    if (!encuadreHecho) encuadrar();
    const v = tz.vista, pl = esc.planeta, R = pl.radio / KM, ver = mostrar(), rot = marco === 'rotante';
    const s = estado(t), el = elementosOrbitales(pl.mu, [s.x, s.y], [s.vx, s.vy]);
    const [ox, oy] = v.P([0, 0]);
    // Ningún número de eje bajo el planeta, el satélite o su etiqueta
    const [hx, hy] = v.P(W(s.x, s.y, t)), s0h = estado(0), [lx, ly] = v.P(W(s0h.x, s0h.y, 0));
    const [dex, dey] = dirEtiqueta(s, hx, hy, ox, oy);
    const huecos = [[ox, oy, R * v.escala + 6], [hx, hy, 16], [hx + dex * 34, hy + dey * 22, 22], [lx, ly, 14]];
    if (capas.apsides && !rot && el.e > 1e-6 && el.tipo !== 'radial') {
      const [ex, ey] = el.vectorE;
      for (const r of [el.rp, -el.ra]) {
        if (!Number.isFinite(r)) continue;
        const [ax, ay] = v.P([ex / el.e * r / KM, ey / el.e * r / KM]), L = Math.hypot(ax - ox, ay - oy) || 1;
        huecos.push([ax + (ax - ox) / L * 50, ay + (ay - oy) / L * 50 + 6, 46]);
      }
    }
    tz.limpiar(); tz.cuadricula(); tz.ejes({ x: 'x', y: 'y', ux: 'km', uy: 'km', huecos });

    // 5 · Construcción: áreas, órbita prevista, ápsides, traza y cotas
    if (ver.ar && !rot) sectores();
    if (ver.p && !rot && !(IMPACTO && t >= IMPACTO.t)) {
      const esq = [[0, 0], [tz.w, 0], [0, tz.h], [tz.w, tz.h]].map(([a, b]) => Math.hypot(v.mx(a), v.my(b)));
      const pts = puntosConica(pl.mu, [s.x, s.y], [s.vx, s.vy], { n: 540, rMax: 1.2 * Math.max(...esq) * KM });
      if (pts.length) tz.trayectoria(pts.map(([x, y]) => [x / KM, y / KM]), 'prevista');
    }
    if (capas.apsides && !rot && el.e > 1e-6 && el.tipo !== 'radial') {
      const [ex, ey] = el.vectorE, ue = [ex / el.e, ey / el.e];
      const peri = [ue[0] * el.rp / KM, ue[1] * el.rp / KM];
      const apo = Number.isFinite(el.ra) ? [-ue[0] * el.ra / KM, -ue[1] * el.ra / KM] : null;
      const nombres = esTierra() ? ['Perigeo', 'Apogeo'] : ['Periapsis', 'Apoapsis'];
      const alt = r => `h = ${cantidad((r - pl.radio) / KM, 'km', 4)}`;
      // La etiqueta de un ápside se omite mientras el satélite está encima (sus lecturas ya lo dicen)
      const [sx0, sy0] = v.P([s.x / KM, s.y / KM]), lejos = p => { const [a, b] = v.P(p); return Math.hypot(a - sx0, b - sy0) > 48; };
      const op = { nombreApo: nombres[1], subApo: apo ? alt(el.ra) : null };
      if (apo && !lejos(apo)) op.nombreApo = op.subApo = null;
      if (el.rp > pl.radio) tz.gravApsides([0, 0], peri, apo, { ...op, nombrePeri: lejos(peri) ? nombres[0] : null, subPeri: lejos(peri) ? alt(el.rp) : null });
      else if (apo) tz.gravApsides([0, 0], [0, 0], apo, op);
    }
    if (capas.traza && t > 0) {
      const c = SIM.cuerpos[1], kt = indiceEn(t), salto = Math.max(1, Math.floor(kt / 1500)), pts = [];
      for (let k = 0; k <= kt; k += salto) pts.push(W(c.x[k], c.y[k], SIM.t[k]));
      pts.push(W(s.x, s.y, t));
      tz.trayectoria(pts, 'real');
    }
    const s0 = estado(0), p0 = W(s0.x, s0.y, 0);
    const r0 = Math.hypot(s0.x, s0.y), u0 = [s0.x / r0, s0.y / r0];
    if (capas.cotas && altura() > 0) {
      // Cota de la altura de lanzamiento, del lado contrario a la velocidad inicial
      const pie = W(u0[0] * pl.radio, u0[1] * pl.radio, 0), [ax, ay] = v.P(pie), [bx, by] = v.P(p0);
      const L = Math.hypot(bx - ax, by - ay) || 1, n = [-(by - ay) / L, (bx - ax) / L], [vx0, vy0] = velEnMarco(s0, 0);
      const lado = n[0] * vx0 - n[1] * vy0 > 0;
      const base = esc.montana ? Math.max(0.02, Volta.grav.GG.montanaBase * altura() / pl.radio) * R * v.escala + 12 : 16;
      if (L > 16) tz.gravCota(lado ? p0 : pie, lado ? pie : p0, { texto: 'h', desplazamiento: Math.min(base, 60), hueco: esc.montana ? 28 : 3 });
    }

    const pW = W(s.x, s.y, t), [sx, sy] = v.P(pW);
    if (meridianoVisible()) tz.lineaPx([[ox, oy], [sx, sy]], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });

    // 6 · Materia: planeta, cañón y satélite
    const angMeridiano = esc.phi * GRADO + (rot ? 0 : OMEGA() * t);
    tz.gravPlaneta([0, 0], R, {
      nombre: pl.nombre,
      montana: esc.montana ? { angulo: esc.phi * GRADO, altura: altura() / KM } : null,
      meridiano: meridianoVisible() ? angMeridiano : null,
    });
    if (esc.montana) {
      const [vx0, vy0] = velEnMarco(s0, 0), m0 = Math.hypot(vx0, vy0);
      tz.gravCanon(p0, m0 > 0 ? Math.atan2(-vy0, vx0) : -esc.phi * GRADO, [ox, oy]);
    }
    tz.particula(pW);
    tz.texto(esc.cuerpo, sx + dex * 15, sy + dey * 15 + 4, { fuente: 'ui', tam: 12, peso: 500, color: 'texto', alinear: dex > 0.3 ? 'left' : dex < -0.3 ? 'right' : 'center', halo: true });

    // 7 · Magnitudes: v (movimiento), g (cambio), F (interacción)
    const enSuelo = IMPACTO && t >= IMPACTO.t - 1e-9;
    const r = Math.hypot(s.x, s.y), g = pl.mu / (r * r), [gx, gy] = vecEnMarco(-g * s.x / r, -g * s.y / r, t);
    const desde = Volta.G.particula + 1;
    if (capas.vectores && !enSuelo && (ver.a || ver.F)) {
      // g y F son paralelos (radiales): si van juntos, lado a lado a 3.5 px (sección 7.2).
      // Costado S de pantalla, perpendicular a g y contrario a la velocidad
      const ambos = ver.a && ver.F, mg = Math.hypot(gx, gy), [vxs, vys] = velEnMarco(s, t);
      let S = [gy / mg, gx / mg];
      if (S[0] * vxs - S[1] * vys > 0) S = [-S[0], -S[1]];
      // La punta tapa algo si cae sobre el centro de masa o el nombre del planeta
      const tapada = e => Math.hypot(e[0] - ox, e[1] - (oy + 12)) < 52;
      // Etiqueta en la punta (como vector()) si queda libre; si no, al costado, a media flecha
      const etiquetar = (bw, e, o, lado, alCostado) => {
        const b = v.P(bw);
        if (!alCostado && !tapada(e)) {
          const ang = Math.atan2(e[1] - b[1], e[0] - b[0]), c = Math.cos(ang);
          tz.etiquetaMagnitud(e[0] + c * 10 + (c >= 0 ? 2 : -2), e[1] + Math.sin(ang) * 10 + 5, { ...o, alinear: c >= -0.2 ? 'left' : 'right' });
        } else {
          const mx = (b[0] + e[0]) / 2, my = (b[1] + e[1]) / 2;
          tz.etiquetaMagnitud(mx + lado[0] * 12, my + lado[1] * 12 + 4, { ...o, alinear: lado[0] >= 0 ? 'left' : 'right' });
        }
      };
      const desp = k => [pW[0] + k * S[0] * 3.5 / v.escala, pW[1] - k * S[1] * 3.5 / v.escala];
      if (ver.a) {
        const bw = desp(ambos ? 1 : 0), e = tz.vector(bw, [gx, gy], { familia: 'cambio', escalaPx: kA, desdeRadio: desde });
        etiquetar(bw, e, { simbolo: 'g', valor: g, unidad: 'm/s²', color: 'cambio' }, S, ambos);
      }
      if (ver.F) {
        const [Fv, Fu] = prefijado(masa * g, 'N'), bw = desp(ambos ? -1 : 0);
        const e = tz.vector(bw, [gx * masa, gy * masa], { familia: 'interaccion', escalaPx: kF, desdeRadio: desde });
        etiquetar(bw, e, { simbolo: 'F', valor: Fv, unidad: Fu, color: 'interaccion' }, ambos ? [-S[0], -S[1]] : S, ambos);
      }
    }
    const [vxm, vym] = velEnMarco(s, t), mv = Math.hypot(vxm, vym);
    if (capas.vectores && ver.v && !enSuelo && mv > 1e-6) {
      const [ex, ey] = tz.vector(pW, [vxm / KM, vym / KM], { familia: 'movimiento', escalaPx: kV, desdeRadio: desde });
      const ux = vxm / mv, uy = -vym / mv, bx = sx + ux * desde, by = sy + uy * desde;
      let largo = mv / KM * kV;
      if (ver.ve && !rot) {
        const lado = (sx - ox) * -uy + (sy - oy) * ux > 0 ? 1 : -1;
        tz.gravMarcasVelocidad([bx, by], [ux, uy], kV, mv / KM, [
          { valor: el.vCircular / KM, sub: 'c', lado }, { valor: el.vEscape / KM, sub: 'e', lado },
        ]);
        largo = Math.max(largo, el.vEscape / KM * kV);
      }
      // Etiqueta en la prolongación del vector (como vector()), más allá de las marcas
      tz.etiquetaMagnitud(bx + ux * (largo + 10) + (ux >= 0 ? 2 : -2), by + uy * (largo + 10) + 5, { simbolo: 'v', valor: mv / KM, unidad: 'km/s', color: 'movimiento', alinear: ux >= -0.2 ? 'left' : 'right' });
      if (t === 0 && !rot) tz.asaVector(ex, ey, arrastre === 'velocidad');
    }

    // 8–9 · Eventos y anotaciones
    if (IMPACTO) {
      const pi = W(IMPACTO.x, IMPACTO.y, IMPACTO.t);
      if (t >= IMPACTO.t - 1e-9) {
        const [ix, iy] = tz.eventoAnillo(pi), sale = ix >= ox ? 1 : -1;
        tz.ficha(ix + (sale > 0 ? 18 : -170), iy - 34, [
          [{ t: 'Impacto', f: 'ui', tam: 11.5 }, { t: ' · ', f: 'num', tam: 11.5, color: 'texto-3' }, { t: 't', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(IMPACTO.t, 's'), f: 'num', tam: 11.5 }],
          [{ t: '|v|', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(IMPACTO.v / KM, 'km/s'), f: 'num', tam: 11.5 }],
        ], { ancla: [ix + sale * 7, iy] });
      } else { tz.ctx.save(); tz.ctx.globalAlpha = 0.45; tz.eventoAnillo(pi); tz.ctx.restore(); }
    }

    // 10 · Edición
    tz.seleccionCirculo(sx, sy, 11);
    tz.gravBarraEscala(16, tz.h - 56);
    if (arrastre === 'velocidad') {
      const [vx0] = velEnMarco(s0, 0);
      tz.ficha(sx + (vx0 >= 0 ? 24 : -150), sy - 58, [
        [{ t: 'v', f: 'sim', tam: 13, color: 'movimiento' }, { t: '0', f: 'simRecta', tam: 9, dy: 3, color: 'movimiento' }, { t: ' = ' + cantidad(V.v0.val, 'km/s', 4), f: 'num', tam: 11.5 }],
        [{ t: 'α', f: 'sim', tam: 13 }, { t: ' = ' + fmt(alfa / GRADO, 3) + '°', f: 'num', tam: 11.5 }],
      ]);
    }
  }

  // ---------------------------------------------------------------------
  // Paneles: inspector, elementos, lecturas, variables, árbol
  // ---------------------------------------------------------------------
  function estadoTexto(el) {
    if (IMPACTO && t >= IMPACTO.t - 1e-9) return 'en la superficie';
    if (el.tipo === 'circular') return 'órbita circular';
    if (el.tipo === 'elíptica') return IMPACTO ? 'cae (elipse que corta el planeta)' : 'órbita elíptica';
    if (el.tipo === 'parabólica') return 'escapa (parábola)';
    if (el.tipo === 'hiperbólica') return 'escapa (hipérbola)';
    return 'movimiento radial';
  }
  const fila = (sim, valor, unidad, ayuda) => `<span class="sim"${ayuda ? ` data-ayuda="${ayuda}"` : ''}>${sim}</span><span class="v">${valor}</span><span class="u">${unidad}</span>`;

  function lecturas() {
    const pl = esc.planeta, s = estado(t), el = elementosOrbitales(pl.mu, [s.x, s.y], [s.vx, s.vy]);
    $('#reloj').innerHTML = `<span class="sim">t</span>${fmt(t, 4).padStart(6, ' ')}<span class="u">s</span>`;
    $('#lect-titulo').textContent = `Lecturas en t = ${fmt(t, 4)} s`;
    $('#insp-estado').textContent = `${({ 'o-satelite': 'Satélite', 'o-planeta': 'Planeta' })[esc.icono] || 'Partícula'} · ${estadoTexto(el)}`;
    // Energía específica: un cero numérico se escribe 0 (parábola exacta)
    const eps = Math.abs(el.energia) < 1e-9 * pl.mu / el.r ? 0 : el.energia;
    const [ev, eu] = prefijado(eps, 'J/kg'), [Tv, Tu] = tiempoLegible(ligada(el) ? el.periodo : Infinity);
    const aTxt = Number.isFinite(el.a) && el.tipo !== 'parabólica' ? fmt(el.a / KM, 4) : '∞';
    const eTxt = el.e < 5e-5 ? '0.0000' : el.tipo === 'parabólica' ? '1.0000' : fmt(el.e, 4);
    let filas = fila('a', aTxt, 'km', 'Semieje mayor|Semi-major axis') + fila('e', eTxt, '', 'Excentricidad|Eccentricity')
      + fila('T', Tv, Tu, 'Periodo (tercera ley de Kepler)|Orbital period');
    if (T_MEDIDO != null) { const [mv, mu] = tiempoLegible(T_MEDIDO); filas += fila('T<sub class="r">med</sub>', mv, mu, 'Periodo medido en la simulación: primera vuelta completa|Measured period'); }
    filas += fila('ε', fmt(ev, 4), eu, 'Energía específica v²/2 − GM/r|Specific orbital energy')
      + fila('L', fmt(masa * Math.abs(el.h), 4), 'kg·m²/s', 'Momento angular respecto del centro del planeta|Angular momentum');
    $('#elementos').innerHTML = filas;
    $('#elem-titulo').textContent = `Elementos orbitales · ${el.tipo}`;
    $('#lecturas').innerHTML =
      fila('r', fmt(el.r / KM, 4), 'km', 'Distancia al centro del planeta|Distance')
      + fila('h', fmt((el.r - pl.radio) / KM, 4), 'km', 'Altura sobre la superficie|Altitude')
      + fila('|v|', fmt(el.v / KM, 4), 'km/s', 'Rapidez|Speed')
      + fila('v<sub class="r">c</sub>', fmt(el.vCircular / KM, 4), 'km/s', 'Velocidad circular a esta distancia, √(GM/r)|Circular velocity')
      + fila('v<sub class="r">e</sub>', fmt(el.vEscape / KM, 4), 'km/s', 'Velocidad de escape a esta distancia, √(2GM/r)|Escape velocity')
      + (esc.extra ? esc.extra(s, el).map(([sm, v, u, ay]) => fila(sm, v, u, ay)).join('') : '');
    $('#f-v').textContent = fmtVar(V.v0);
    if (V.h) { const fv = $('#f-h'); if (fv) fv.textContent = fmtVar(V.h); }
    if (document.activeElement !== $('#f-a')) $('#f-a').value = String(Math.round(alfa / GRADO * 10) / 10).replace('-', '−');
    $('#b-play').innerHTML = `<svg class="ico"><use href="#i-${jugando ? 'pausar' : 'reproducir'}"/></svg>`;
    $('#b-play').dataset.ayuda = jugando ? 'Pausar|Pause|Espacio' : 'Reproducir|Play|Espacio';
  }

  function construirInspector() {
    $('#insp-nombre').textContent = esc.cuerpo;
    $('#insp-ico').setAttribute('href', '#' + esc.icono);
    $('#f-altura').innerHTML = V.h
      ? `<div class="campo es-variable" data-ayuda="Ligado a la variable h|Bound to variable"><span class="chip-var">${simHTML('h')}</span><span class="valor-var" id="f-h"></span><span class="u">km</span></div>`
      : '<div class="campo" data-ayuda="Lanzado desde la superficie|Launched from the surface"><input value="0" disabled><span class="u">km</span></div>';
    $('#f-m').value = String(masa);
  }

  function construirArbol() {
    const pl = esc.planeta, ico = id => `<svg class="ico"><use href="#${id}"/></svg>`;
    $('#arbol').innerHTML =
      `<div class="nodo" data-ayuda="${pl.nombre}: radio ecuatorial|Central body">${ico('o-planeta')}<span class="nombre">${pl.nombre}${esc.examen ? ' (datos del examen)' : ''}</span><span class="acciones">${ico('i-candado')}</span></div>`
      + (esc.montana ? `<div class="nodo">${ico('o-lanzador')}<span class="nombre">Cañón en la montaña</span><span class="acciones">${ico('i-candado')}</span></div>` : '')
      + `<div class="nodo" aria-selected="true">${ico(esc.icono)}<span class="nombre">${esc.cuerpo}</span><span class="acciones fijas">${ico('i-ojo')}</span></div>`
      + `<div class="nodo global">${ico('o-gravedad')}<span class="nombre">Gravitación universal</span><span class="dato">${pl.g ? cantidad(pl.g, 'm/s²', 3) : cantidad(pl.mu / pl.radio ** 2, 'm/s²', 3)}</span></div>`;
  }

  function construirVariables() {
    const cont = $('#variables'); cont.innerHTML = '';
    for (const [, d] of Object.entries(V)) {
      const f = document.createElement('div'); f.className = 'var' + (d.constante ? ' constante' : '');
      const control = d.constante
        ? '<span class="constante-etq">Constante</span>'
        : `<input class="deslizador" type="range" min="${d.min}" max="${d.max}" step="${d.paso}" value="${d.val}" aria-label="${d.sim}">`;
      f.innerHTML = `${simHTML(d.sim, d.sub)}${control}<span class="valor"></span>`;
      const ent = f.querySelector('input'), val = f.querySelector('.valor');
      d.pintar = () => { val.innerHTML = `${fmtVar(d)}${d.u ? `<span class="u">${d.u}</span>` : ''}`; if (ent) { ent.value = d.val; Volta.pintarDeslizador(ent); } };
      if (ent) {
        let antes = null;
        const capturar = () => { if (antes == null) antes = instantanea(); };
        ent.addEventListener('pointerdown', capturar); ent.addEventListener('keydown', capturar);
        ent.addEventListener('input', () => { capturar(); d.val = parseFloat(ent.value); d.pintar(); recalcular(); });
        ent.addEventListener('change', () => { if (antes != null) { guardarHistorial(antes); antes = null; } });
      }
      d.pintar(); cont.appendChild(f);
    }
  }

  // ---------------------------------------------------------------------
  // Gráficas, energía, eventos y tabla
  // ---------------------------------------------------------------------
  function serie(f) {
    const m = SIM.t.length, salto = Math.max(1, Math.floor(m / 700)), p = [];
    for (let k = 0; k < m; k += salto) p.push(f(k));
    if ((m - 1) % salto) p.push(f(m - 1));
    return [p];
  }
  const eventosGrafica = () => SIM.eventos.filter(e => e.t > 0).map(e => ({ x: e.t }));

  function graficas() {
    if ($('#p-graficas').hidden === false) {
      const s = estado(t), r = Math.hypot(s.x, s.y), v = Math.hypot(s.vx, s.vy), R = esc.planeta.radio, mu = esc.planeta.mu;
      let rmin = Infinity, rmax = 0, vmax = 0;
      for (let k = 0; k < SERIES.r.length; k++) { rmin = Math.min(rmin, SERIES.r[k]); rmax = Math.max(rmax, SERIES.r[k]); vmax = Math.max(vmax, SERIES.v[k]); }
      // Unidad de distancia según la escala: Mm alrededor de un planeta, Gm
      // alrededor del Sol (si no, las marcas del eje no caben a la izquierda)
      const MM = rmax >= 1e10 ? 1e9 : 1e6, uD = MM === 1e9 ? 'Gm' : 'Mm';
      document.querySelectorAll('.u-dist').forEach(el => { el.textContent = uD; });
      const y0 = Math.min(rmin, R) / MM, y1 = rmax / MM, pad = Math.max(0.08 * (y1 - y0), 0.02 * y1);
      grafica($('#g1'), {
        x: { min: 0, max: DUR }, y: { min: Math.max(0, y0 - pad), max: y1 + pad },
        series: [
          { tramos: serie(k => [SIM.t[k], SERIES.r[k] / MM]), familia: 'tinta' },
          { tramos: [[[0, R / MM], [DUR, R / MM]]], familia: 'texto-3', auxiliar: true, etiqueta: 'R' },
        ],
        cursor: t, puntoCursor: [t, r / MM], eventos: eventosGrafica(),
      });
      const ve = serie(k => [SIM.t[k], Math.sqrt(2 * mu / SERIES.r[k]) / KM]);
      const vemax = Math.max(...ve[0].map(p => p[1]));
      grafica($('#g2'), {
        x: { min: 0, max: DUR }, y: { min: 0, max: Math.max(vmax / KM, Math.min(vemax, 1.25 * vmax / KM)) * 1.08 },
        series: [
          { tramos: serie(k => [SIM.t[k], SERIES.v[k] / KM]), familia: 'movimiento' },
          { tramos: ve, familia: 'texto-3', auxiliar: true, etiqueta: 'vₑ' },
        ],
        cursor: t, puntoCursor: [t, v / KM], eventos: eventosGrafica(),
      });
      const A = areaEn(t) / (MM * MM), Amax = SERIES.A[SERIES.A.length - 1] / (MM * MM);
      grafica($('#g3'), {
        x: { min: 0, max: DUR }, y: { min: 0, max: Math.max(Amax, 1e-9) * 1.06 },
        series: [{ tramos: serie(k => [SIM.t[k], SERIES.A[k] / (MM * MM)]), familia: 'inercia' }],
        cursor: t, puntoCursor: [t, A], eventos: eventosGrafica(),
      });
      $('#l1').textContent = cantidad(r / MM, uD, 4);
      $('#l2').textContent = cantidad(v / KM, 'km/s', 4);
      $('#l3').textContent = cantidad(A, uD + '²', 4);
    }
    if ($('#p-energia').hidden === false) energiaPanel();
  }

  function energiaPanel() {
    const s = estado(t), { K, U, E } = energia(s), E0 = energia(estado(0)).E;
    let escala = 0, umin = 0, kmax = 0;
    for (let k = 0; k < SERIES.K.length; k++) { escala = Math.max(escala, SERIES.K[k], -SERIES.U[k]); umin = Math.min(umin, SERIES.U[k]); kmax = Math.max(kmax, SERIES.K[k]); }
    const color = f => (f === 'tinta' ? 'var(--tinta)' : `var(--f-${f})`);
    const filas = [
      ['Cinética', 'movimiento', K, 'Energía cinética ½mv²|Kinetic energy'],
      ['Potencial gravitatoria', 'cambio', U, 'Energía potencial −GMm/r (cero en el infinito)|Gravitational potential energy'],
      ['Total', 'tinta', E, 'E = Eₖ + U: negativa si la órbita está ligada|Total energy'],
    ];
    const deriva = E - E0, [dv, du] = prefijado(deriva, 'J');
    $('#barras').innerHTML = '<div class="barras-tit">Satélite · energía mecánica</div>' + filas.map(([n, fam, val, ayuda]) => {
      const p = Math.min(50, Math.abs(val) / escala * 50), pos = val >= 0 ? `left:50%;width:${p}%` : `left:${50 - p}%;width:${p}%`;
      const [vv, vu] = prefijado(val, 'J');
      return `<div class="barra-e" data-ayuda="${ayuda}"><span>${n}</span><span class="riel"><i style="${pos};background:${color(fam)}"></i></span><span class="v">${cantidad(vv, vu, 4)}</span></div>`;
    }).join('') + `<div class="barras-pie">Deriva numérica <span class="sim">E</span> − <span class="sim">E</span><sub>0</sub> = ${cantidad(dv, du, 2)} (${cientifico(Math.abs(deriva / E0))} relativo)</div>`;
    const [, uE] = prefijado(escala, 'J'), f = escala / prefijado(escala, 'J')[0];
    $('#l4').textContent = uE;
    grafica($('#g4'), {
      x: { min: 0, max: DUR }, y: { min: umin / f * 1.06, max: Math.max(kmax / f * 1.08, 1e-9) },
      series: [
        { tramos: serie(k => [SIM.t[k], SERIES.K[k] / f]), familia: 'movimiento' },
        { tramos: serie(k => [SIM.t[k], SERIES.U[k] / f]), familia: 'cambio' },
        { tramos: serie(k => [SIM.t[k], (SERIES.K[k] + SERIES.U[k]) / f]), familia: 'tinta' },
      ],
      cursor: t, eventos: eventosGrafica(),
    });
  }

  function tablas() {
    const R = esc.planeta.radio;
    $('#t-eventos').innerHTML = '<tr><th>Evento</th><th>t (s)</th><th>r (km)</th><th>Altura (km)</th><th>|v| (km/s)</th></tr>' +
      SIM.eventos.map(e => `<tr class="${Math.abs(e.t - t) < DUR / 2000 ? 'actual' : ''}"><td class="texto">${nombreEvento(e)}</td><td>${fmt(e.t, 6)}</td><td>${fmt(e.r / KM, 6)}</td><td>${fmt((e.r - R) / KM, 5)}</td><td>${fmt(e.v / KM, 5)}</td></tr>`).join('');
    let filas = '<tr><th>t (s)</th><th>x (km)</th><th>y (km)</th><th>v<sub>x</sub> (km/s)</th><th>v<sub>y</sub> (km/s)</th><th>r (km)</th><th>|v| (km/s)</th></tr>';
    const n = 120;
    for (let k = 0; k <= n; k++) {
      const tt = DUR * k / n, s = estado(tt);
      filas += `<tr class="${Math.abs(tt - t) <= DUR / n / 2 ? 'actual' : ''}"><td>${fmt(tt, 5)}</td><td>${fmt(s.x / KM, 5)}</td><td>${fmt(s.y / KM, 5)}</td><td>${fmt(s.vx / KM, 4)}</td><td>${fmt(s.vy / KM, 4)}</td><td>${fmt(Math.hypot(s.x, s.y) / KM, 5)}</td><td>${fmt(Math.hypot(s.vx, s.vy) / KM, 4)}</td></tr>`;
    }
    $('#t-datos').innerHTML = filas;
  }

  const lt = new LineaTiempo($('#tl'), { duracion: 1, eventos: [], alCambiar: nt => { t = nt; jugando = false; todo(); } });

  function todo() {
    dibujar(); lecturas(); lt.poner(t); graficas();
    if (!$('#p-eventos').hidden || !$('#p-tabla').hidden) tablas();
  }
  function recalcular() {
    simular();
    t = Math.min(t, DUR);
    lt.duracion = DUR; lt.simulado = DUR;
    lt.eventos = SIM.eventos.filter(e => e.t > 0).map(e => ({ t: e.t, nombre: nombreEvento(e) }));
    todo(); botonesHistorial();
    if (autoguardar) autoguardado.guardar('gravitacion', escenaActual());
  }

  // ---------------------------------------------------------------------
  // Escena: guardar, abrir y autoguardado (formato .volta). Se guarda lo
  // mismo que en el historial: la escena de partida, sus variables, α y la
  // masa. Lo que llega de un archivo se valida y se acota.
  // ---------------------------------------------------------------------
  let autoguardar = false;
  function escenaActual() {
    return crearEscena({ modulo: 'gravitacion', espacio: 'orbitas', titulo: esc.titulo, datos: JSON.parse(instantanea()) });
  }
  function datosSeguros(d = {}) {
    const base = escenaPorId(typeof d.escena === 'string' ? d.escena : 'canon');
    const valores = {};
    for (const k of ['h', 'v0']) {
      const def = base[k];
      if (def) valores[k] = numero(d.valores?.[k], def.val, def.min, def.max);
    }
    return { escena: base.id, valores, alfa: numero(d.alfa, 0, -89 * GRADO, 89 * GRADO), masa: typeof d.masa === 'number' && d.masa > 0 && d.masa <= 1e30 ? d.masa : 1000 };
  }
  function guardar() {
    guardarEscena(escenaActual()).then(r => { if (r) avisar(area, 'Escena guardada'); }, err => avisar(area, `No se pudo guardar: ${err}`));
  }
  // Una escena de otro espacio de Gravitación (Sistema solar, Maniobras) se abre en su pantalla
  const PAGINAS = { orbitas: 'gravitacion.html', 'sistema-solar': 'gravitacion-sistema-solar.html', maniobras: 'gravitacion-maniobras.html' };
  function aOtroEspacio(e) {
    if (!e.espacio || e.espacio === 'orbitas' || !PAGINAS[e.espacio]) return false;
    try { sessionStorage.setItem('volta.abrir', JSON.stringify(e)); } catch { /* sin almacenamiento */ }
    location.href = PAGINAS[e.espacio];
    return true;
  }
  function abrir() {
    abrirEscena({ modulo: 'gravitacion' }).then(e => {
      if (aOtroEspacio(e)) return;
      guardarHistorial();
      const d = datosSeguros(e.datos);
      cargarEscena(d.escena, d);
      $('#f-m').value = String(masa);
      avisar(area, `Escena abierta: ${texto(e.titulo, 'sin título', 60)}`);
    }).catch(err => avisar(area, err.message));
  }

  // Carga una escena: variables, escalas de dibujo, inspector y encuadre
  function cargarEscena(id, o = {}) {
    esc = escenaPorId(id);
    alfa = 0; marco = 'inercial'; t = 0; jugando = false;
    construirV();
    if (o.valores) for (const [k, v] of Object.entries(o.valores)) if (V[k]) V[k].val = v;
    if (o.alfa != null) alfa = o.alfa;
    if (o.masa != null) masa = o.masa;
    ponerCapa('areas', !!esc.areas);
    document.querySelectorAll('#m-marco button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === marco)));
    // Escalas: la velocidad circular y la gravedad del punto de lanzamiento miden ~70 px y ~56 px
    const r0 = esc.planeta.radio + altura(), g0 = esc.planeta.mu / (r0 * r0);
    kV = 70 / (velocidadCircular(esc.planeta.mu, r0) / KM); kA = 56 / g0; kF = kA / masa;
    velocidad = esc.velocidad;
    // Las órbitas largas (la Luna, un año) piden otras velocidades de reproducción
    const factorVel = esc.escalaVel || 1;
    document.querySelectorAll('#velocidades button').forEach((b, k) => {
      const v = [200, 500, 1000, 2000, 5000][k] * factorVel;
      b.dataset.v = String(v); b.textContent = etiquetaVelocidad(v);
      b.setAttribute('aria-pressed', String(v === velocidad));
    });
    $('#escena-chip').textContent = chipEscena(esc);
    $('#escena-chip').className = 'chip' + (esc.tipo === 'MEXT' ? ' lleno' : '');
    $('#escena-nombre').textContent = esc.titulo;
    document.title = `Volta · Gravitación · ${esc.titulo}`;
    construirVariables(); construirInspector(); construirArbol();
    simular(); vistaTocada = false; tz.ajustar(); encuadrar(); escala0 = tz.vista.escala; zoomTexto();
    recalcular();
  }

  // ---------------------------------------------------------------------
  // Deshacer y rehacer: instantáneas de la escena, variables, α y masa
  // ---------------------------------------------------------------------
  const pilaDeshacer = [], pilaRehacer = [];
  const instantanea = () => JSON.stringify({ escena: esc.id, valores: Object.fromEntries(Object.entries(V).filter(([, d]) => !d.constante).map(([k, d]) => [k, d.val])), alfa, masa });
  function guardarHistorial(antes = instantanea()) {
    if (antes === instantanea() && antes === pilaDeshacer[pilaDeshacer.length - 1]) return;
    pilaDeshacer.push(antes); if (pilaDeshacer.length > 200) pilaDeshacer.shift();
    pilaRehacer.length = 0; botonesHistorial();
  }
  function restaurar(txt) {
    const o = JSON.parse(txt);
    if (o.escena !== esc.id) { cargarEscena(o.escena, o); return; }
    for (const [k, v] of Object.entries(o.valores)) if (V[k]) { V[k].val = v; V[k].pintar(); }
    alfa = o.alfa; masa = o.masa; $('#f-m').value = String(masa); kF = kA / masa;
    recalcular();
  }
  function deshacer() { if (!pilaDeshacer.length) return; pilaRehacer.push(instantanea()); restaurar(/** @type {string} */ (pilaDeshacer.pop())); botonesHistorial(); }
  function rehacer() { if (!pilaRehacer.length) return; pilaDeshacer.push(instantanea()); restaurar(/** @type {string} */ (pilaRehacer.pop())); botonesHistorial(); }
  function botonesHistorial() { $('#b-deshacer').disabled = !pilaDeshacer.length; $('#b-rehacer').disabled = !pilaRehacer.length; }
  $('#b-deshacer').addEventListener('click', deshacer);
  $('#b-rehacer').addEventListener('click', rehacer);

  // Campos del inspector
  // Campos del inspector con unidades y expresiones (nucleo/unidades.js):
  // «30°», «0.5 rad», «2 t», «1500 kg»
  function campoConUnidad(id, opciones, aplicar) {
    const ent = $(id), caja = ent.closest('.campo'), fila = ent.closest('.fila') || caja.parentElement;
    const mostrarError = msj => {
      caja.classList.toggle('es-error', !!msj);
      let p = fila.querySelector('.mensaje-error');
      if (msj && !p) { p = document.createElement('p'); p.className = 'mensaje-error'; fila.appendChild(p); }
      if (p) { if (msj) p.textContent = msj; else p.remove(); }
    };
    ent.addEventListener('change', () => {
      try { aplicar(evaluar(ent.value, opciones).valor); mostrarError(null); }
      catch (e) { mostrarError(e.message); }
    });
  }
  campoConUnidad('#f-a', { esperada: 'adimensional', unidadPorDefecto: '°' }, rad => {
    guardarHistorial(); alfa = Math.max(-89 * GRADO, Math.min(89 * GRADO, rad)); recalcular();
  });
  campoConUnidad('#f-m', { esperada: 'masa', unidadPorDefecto: 'kg' }, kg => {
    if (!(kg > 0)) throw new Error('La masa tiene que ser positiva.');
    guardarHistorial(); masa = kg; kF = kA / masa; $('#f-m').value = String(masa); recalcular();
  });

  // ---------------------------------------------------------------------
  // Reproducción
  // ---------------------------------------------------------------------
  const pasoManual = () => Math.max(1, Math.round(DUR / 600));
  function cuadro(ahora) {
    if (jugando) {
      const dt = Math.min(0.05, (ahora - ultimo) / 1000) * velocidad;
      t = Math.min(DUR, t + dt);
      if (t >= DUR) jugando = false;
      todo();
    }
    ultimo = ahora;
    requestAnimationFrame(cuadro);
  }
  function alternar() { if (t >= DUR) t = 0; jugando = !jugando; todo(); }
  function irA(nt) { jugando = false; t = Math.max(0, Math.min(DUR, nt)); todo(); }
  $('#b-play').addEventListener('click', alternar);
  $('#b-reiniciar').addEventListener('click', () => irA(0));
  $('#b-atras').addEventListener('click', () => irA(t - pasoManual()));
  $('#b-adelante').addEventListener('click', () => irA(t + pasoManual()));
  $('#velocidades').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) velocidad = parseFloat(b.dataset.v); });
  function ponerCapa(k, on) {
    capas[k] = on;
    document.querySelectorAll(`.capa-btn[data-capa="${k}"]`).forEach(b => b.setAttribute('aria-pressed', String(on)));
  }
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => { ponerCapa(b.dataset.capa, !capas[b.dataset.capa]); dibujar(); }));
  ['#m-v', '#m-a', '#m-f', '#m-p', '#m-ve'].forEach(s => $(s).addEventListener('change', dibujar));
  function ponerMarco(m) {
    marco = m;
    document.querySelectorAll('#m-marco button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === m)));
    todo();
  }
  $('#m-marco').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) ponerMarco(b.dataset.v); });
  $('#pest').addEventListener('click', () => setTimeout(todo, 0));

  // ---------------------------------------------------------------------
  // Lienzo: arrastre de la velocidad inicial, zoom y desplazamiento
  // ---------------------------------------------------------------------
  // Punta del vector velocidad en t = 0 (pantalla) y su base
  function puntaVelocidad() {
    const s = estado(0), [vx, vy] = velEnMarco(s, 0), m = Math.hypot(vx, vy), r = Volta.G.particula + 1;
    const [bx, by] = tz.vista.P(W(s.x, s.y, 0));
    const ux = m > 0 ? vx / m : 0, uy = m > 0 ? -vy / m : 0;
    return [bx + ux * r + vx / KM * kV, by + uy * r - vy / KM * kV, bx + ux * r, by + uy * r];
  }
  lienzo.addEventListener('pointerdown', ev => {
    const r = lienzo.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    if (ev.button === 1 || ev.button === 2 || espacioPulsado) { paneo = [x, y, tz.vista.ox, tz.vista.oy]; lienzo.setPointerCapture(ev.pointerId); return; }
    if (t === 0 && marco === 'inercial' && capas.vectores && $('#m-v').checked) {
      const [px, py] = puntaVelocidad();
      if (Math.hypot(x - px, y - py) < 10) { guardarHistorial(); arrastre = 'velocidad'; lienzo.setPointerCapture(ev.pointerId); dibujar(); return; }
    }
    paneo = [x, y, tz.vista.ox, tz.vista.oy]; lienzo.setPointerCapture(ev.pointerId);
  });
  lienzo.addEventListener('pointermove', ev => {
    const r = lienzo.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    $('#cx').textContent = cantidad(tz.vista.mx(x), 'km', 4); $('#cy').textContent = cantidad(tz.vista.my(y), 'km', 4);
    if (arrastre === 'velocidad') {
      const [, , bx, by] = puntaVelocidad();
      // Vector arrastrado → componentes radial y tangencial (en el sentido de la escena)
      const dx = (x - bx) / kV, dy = (by - y) / kV, phi = esc.phi * GRADO, sg = esc.sentido;
      const rad = dx * Math.cos(phi) + dy * Math.sin(phi), tan = sg * (-dx * Math.sin(phi) + dy * Math.cos(phi));
      const fino = ev.shiftKey;
      const ang = Math.max(-89, Math.min(89, Math.atan2(rad, tan) / GRADO));
      alfa = (fino ? Math.round(ang * 10) / 10 : Math.round(ang)) * GRADO;
      const p = V.v0.paso * (fino ? 0.1 : 1), mod = Math.max(V.v0.min, Math.min(V.v0.max, Math.round(Math.hypot(dx, dy) / p) * p));
      V.v0.val = mod; V.v0.pintar(); recalcular();
      return;
    }
    if (paneo) { vistaTocada = true; tz.vista.ox = paneo[2] + x - paneo[0]; tz.vista.oy = paneo[3] + y - paneo[1]; dibujar(); return; }
    if (t === 0) { const [px, py] = puntaVelocidad(); lienzo.style.cursor = Math.hypot(x - px, y - py) < 10 ? 'grab' : 'default'; }
  });
  lienzo.addEventListener('pointerup', () => { arrastre = null; paneo = null; dibujar(); });
  lienzo.addEventListener('contextmenu', ev => ev.preventDefault());
  lienzo.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = lienzo.getBoundingClientRect();
    vistaTocada = true; tz.vista.zoom(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top);
    zoomTexto(); dibujar();
  }, { passive: false });
  let escala0 = 1;
  function zoomTexto() { $('#zoom').textContent = Math.round(tz.vista.escala / escala0 * 100) + ' %'; }
  function zoomCentro(f) { vistaTocada = true; tz.vista.zoom(f, tz.w / 2, tz.h / 2); zoomTexto(); dibujar(); }
  function encuadrarTodo() { vistaTocada = false; encuadrar(); zoomTexto(); dibujar(); }
  $('#b-zoom-mas').addEventListener('click', () => zoomCentro(1.25));
  $('#b-zoom-menos').addEventListener('click', () => zoomCentro(0.8));
  $('#b-encuadrar').addEventListener('click', encuadrarTodo);

  // ---------------------------------------------------------------------
  // Exportar: datos (CSV con toda la precisión, en SI) e imagen del lienzo
  // ---------------------------------------------------------------------
  function exportarCSV() {
    const filas = muestrear(0, DUR, DUR / 1000, tt => {
      const s = estado(tt), { K, U, E } = energia(s);
      return [tt, s.x, s.y, s.vx, s.vy, Math.hypot(s.x, s.y), Math.hypot(s.vx, s.vy), K, U, E, areaEn(tt)];
    });
    const csv = aCSV(['t (s)', 'x (m)', 'y (m)', 'vx (m/s)', 'vy (m/s)', 'r (m)', '|v| (m/s)', 'Ek (J)', 'U (J)', 'E (J)', 'A (m²)'], filas);
    descargarTexto(`${nombreArchivo(esc.titulo)}-datos.csv`, csv);
    avisar(area, `Datos exportados: ${filas.length} filas`);
  }
  function exportarPNG() {
    descargarLienzo(lienzo, `${nombreArchivo(esc.titulo)}-t${Math.round(t)}s.png`);
    avisar(area, 'Imagen del lienzo exportada');
  }
  $('#b-exportar').addEventListener('click', exportarCSV);

  // ---------------------------------------------------------------------
  // Menú de escenas
  // ---------------------------------------------------------------------
  const GRUPOS = [['Tutorial', 'Tutoriales', 'i-tutorial'], ['Ejemplo', 'Ejemplos', 'i-ejemplo'], ['MEXT', 'MEXT', 'i-mext']];
  function abrirEscenas() {
    const menu = $('#menu-escenas'), b = $('#b-escenas').getBoundingClientRect();
    menu.innerHTML = GRUPOS.map(([tipo, titulo, ico], i) =>
      (i ? '<div class="menu-sep"></div>' : '') + `<div class="menu-titulo">${titulo}</div>` +
      ESCENAS.filter(e => e.tipo === tipo).map(e => `<div class="menu-item" role="menuitem" data-id="${e.id}"${e === esc ? ' aria-current="true"' : ''}><svg class="ico"><use href="#${ico}"/></svg>${e.titulo}${e.tipo === 'MEXT' ? `<span class="chip lleno">MEXT ${e.anio}</span>` : ''}</div>`).join('')).join('');
    menu.style.left = b.left + 'px'; menu.style.top = (b.bottom + 4) + 'px';
    menu.hidden = false;
  }
  const cerrarEscenas = () => { $('#menu-escenas').hidden = true; };
  async function irAEscena(id) { if (id === esc.id) return; if (hayCambios() && !(await confirmarCambios('cambiar de escena'))) return; guardarHistorial(); cargarEscena(id); documentoNuevo(); }
  $('#b-escenas').addEventListener('click', ev => { ev.stopPropagation(); if ($('#menu-escenas').hidden) abrirEscenas(); else cerrarEscenas(); });
  $('#menu-escenas').addEventListener('click', ev => { const it = ev.target.closest('.menu-item'); if (it) { cerrarEscenas(); irAEscena(it.dataset.id); } });
  document.addEventListener('pointerdown', ev => { if (!ev.target.closest('#menu-escenas, #b-escenas')) cerrarEscenas(); });

  // ---------------------------------------------------------------------
  // Teclado y paleta de comandos
  // ---------------------------------------------------------------------
  const COMANDOS = [
    ['i-reproducir', 'Reproducir o pausar', 'Espacio', alternar],
    ['i-reiniciar', 'Reiniciar la simulación', 'Inicio', () => irA(0)],
    ['i-encuadrar', 'Encuadrar todo', 'F', encuadrarTodo],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['i-rotar', 'Sistema de referencia que gira con el planeta', 'G', () => ponerMarco(marco === 'rotante' ? 'inercial' : 'rotante')],
    ['i-energia', 'Mostrar u ocultar las áreas barridas', 'A', () => { ponerCapa('areas', !capas.areas); dibujar(); }],
    ['i-deshacer', 'Deshacer', 'Ctrl Z', deshacer],
    ['i-rehacer', 'Rehacer', 'Ctrl Y', rehacer],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar],
    ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
    ['i-exportar', 'Exportar datos a CSV', '', exportarCSV],
    ['i-imagen', 'Exportar imagen del lienzo', '', exportarPNG],
    ...ESCENAS.map(e => [e.tipo === 'MEXT' ? 'i-mext' : e.tipo === 'Ejemplo' ? 'i-ejemplo' : 'i-tutorial', `Abrir escena: ${e.titulo}`, chipEscena(e), () => irAEscena(e.id), 'Escenas']),
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
  function abrirComandos() { cerrarEscenas(); $('#velo-comandos').hidden = false; $('#cmd-q').value = ''; selCmd = 0; pintarComandos(); $('#cmd-q').focus(); }
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
    if (ev.key === 'Escape') { cerrarEscenas(); return; }
    const ctrl = ev.ctrlKey || ev.metaKey, tecla = ev.key.toLowerCase();
    if (ctrl && tecla === 'k') { ev.preventDefault(); abrirComandos(); return; }
    if (ctrl && tecla === 's') { ev.preventDefault(); guardar(); return; }
    if (ctrl && tecla === 'o') { ev.preventDefault(); abrir(); return; }
    if (ev.target instanceof Element && ev.target.matches('input:not([type="range"]), textarea')) return;
    if (ctrl && tecla === 'z') { ev.preventDefault(); if (ev.shiftKey) rehacer(); else deshacer(); return; }
    if (ctrl && tecla === 'y') { ev.preventDefault(); rehacer(); return; }
    if (ctrl) return;
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) alternar(); espacioPulsado = true; }
    else if (ev.key === 'ArrowRight') irA(t + pasoManual());
    else if (ev.key === 'ArrowLeft') irA(t - pasoManual());
    else if (ev.key === 'Home') irA(0);
    else if (tecla === 'f') encuadrarTodo();
    else if (tecla === 'g') ponerMarco(marco === 'rotante' ? 'inercial' : 'rotante');
    else if (tecla === 'a') { ponerCapa('areas', !capas.areas); dibujar(); }
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });

  // ---------------------------------------------------------------------
  // Arranque. Parámetros para capturas: ?escena=geo&t=40000&fase=0.5&pest=energia&areas=1&marco=rotante&mostrar=f
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); if (!vistaTocada && SIM) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } if (SIM) todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search);
    tz.ajustar();
    // Escena abierta desde Inicio, o la última sesión (no en capturas ni con parámetros)
    const limpio = ![...q.keys()].length;
    const pend = escenaPendiente('gravitacion');
    if (pend && aOtroEspacio(pend)) return;
    const previa = pend || (limpio ? autoguardado.leer('gravitacion', { modulo: 'gravitacion' }) : null);
    autoguardar = true;
    registrarDocumento({ clave: 'gravitacion', escena: escenaActual, origen: (previa) || null, abrir, guardar });
    if (previa) { const d = datosSeguros(previa.datos); cargarEscena(d.escena, d); $('#f-m').value = String(masa); }
    else cargarEscena(q.get('escena') || 'canon');
    if (q.get('areas') === '1') ponerCapa('areas', true);
    if (q.get('areas') === '0') ponerCapa('areas', false);
    if (q.has('mostrar')) q.get('mostrar').split(',').forEach(k => { const c = $('#m-' + k); if (c) c.checked = true; });
    if (q.get('marco') === 'rotante') marco = 'rotante';
    document.querySelectorAll('#m-marco button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === marco)));
    if (q.has('fase')) t = Math.max(0, Math.min(1, parseFloat(q.get('fase')) || 0)) * DUR;
    if (q.has('t')) t = Math.max(0, Math.min(DUR, parseFloat(q.get('t')) || 0));
    const pe = q.get('pest'); if (pe) { const b = document.querySelector(`#pest [aria-controls="p-${pe}"]`); if (b) b.click(); }
    todo(); botonesHistorial();
    requestAnimationFrame(a => { ultimo = a; requestAnimationFrame(cuadro); });
  });
})();
