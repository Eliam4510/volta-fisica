/* ==========================================================================
   Volta · Gravitación — espacio de trabajo «Sistema solar»
   Varios cuerpos que se atraen entre sí, colocados libremente o con datos
   reales (planetas en J2000, Tierra y Luna). La física está en el motor puro
   sistema/motores/gravitacion-n.js (probado en pruebas/gravitacion-n.test.js):
   N cuerpos con Yoshida de 4.º orden y Bulirsch–Stoer adaptativo en los
   encuentros cercanos, jerarquía de primarios por esferas de Hill, eventos
   de ápsides y vueltas, choques con fusión.
   Instrumentos: elementos orbitales en vivo de cada cuerpo respecto de su
   primario, órbita predicha, áreas barridas, centro de masa, gráfica T²
   contra a³ de todos los cuerpos, periodo medido, velocímetro, regla y
   escalas lineal y logarítmica de distancias.
   Misma estructura que optica.js: escena → motor → lienzo → paneles. Mundo
   en metros; la pantalla escribe las distancias en la unidad de la escena.
   Parámetros de URL para capturas: ?escena=…&tema=…&sel=<id>|escena&t=<0..1>
   &pest=energia|eventos|tabla&capas=areas,periodos&escala=log
   ========================================================================== */
import { G, CUERPOS, puntosConica } from '../motores/gravitacion.js';
import {
  UA, DIA, ANIO, PLANETAS, LUNA_ORBITA, sistemaSolar, tierraLuna, aBaricentro, primarios, estadoDesdeElementos,
  simularSistema, estadoSistema, estadoMuestra, indiceEn, tramoEn, centroMasas, energiaN, momentoAngularN, elementosRelativos,
} from '../motores/gravitacion-n.js';
import { aCSV, muestrear } from '../nucleo/csv.js';
import { descargarTexto, descargarLienzo, nombreArchivo } from '../componentes/exportar.js';
import { crearEscena, numero, texto } from '../nucleo/escena.js';
import { Historial } from '../nucleo/historial.js';
import { evaluar, DIM } from '../nucleo/unidades.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';
import { registrarDocumento, confirmarCambios, documentoNuevo, hayCambios } from '../componentes/documento.js';

(function () {
  'use strict';
  const { Trazo, fmt, cantidad, grafica, LineaTiempo, pasoAgradable } = Volta;
  const $ = s => document.querySelector(s);
  const ESPACIO = 'sistema-solar', CLAVE_AUTO = 'gravitacion-sistema-solar';
  const KM = 1000, MSOL = CUERPOS.sol.masa, MTIERRA = CUERPOS.tierra.masa, MLUNA = CUERPOS.luna.masa;
  const TU = Math.sqrt(UA ** 3 / CUERPOS.sol.mu);          // unidad de tiempo con UA y M☉ (G = 1): 58.13 d
  const VU = UA / TU;                                       // 29.78 km/s
  const FACTOR = { UA, km: KM };
  const SUP = n => String(n).replace('-', '⁻').replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]);
  const simHTML = (a, sub, recto = true) => `<span class="sim">${a}${sub ? `<sub${recto ? ' class="r"' : ''}>${sub}</sub>` : ''}</span>`;
  // Valor de un campo: con potencia volada fuera de [10⁻³, 10⁶) (el campo la vuelve a leer)
  function numCampo(x) {
    const v = Number(Number(x).toPrecision(7)), a = Math.abs(v);
    if (a === 0 || (a >= 1e-3 && a < 1e6)) return String(v).replace('-', '−');
    const e = Math.floor(Math.log10(a)), m = Number((v / 10 ** e).toPrecision(7));
    return `${String(m).replace('-', '−')} × 10${SUP(e)}`;
  }
  const copia = o => JSON.parse(JSON.stringify(o));
  // Unidades propias de los campos: UA, día, año y masas de referencia
  const VARS_U = {
    UA: { valor: UA, dim: DIM.longitud }, d: { valor: DIA, dim: DIM.tiempo }, a: { valor: ANIO, dim: DIM.tiempo },
    MS: { valor: MSOL, dim: DIM.masa }, MT: { valor: MTIERRA, dim: DIM.masa }, ML: { valor: MLUNA, dim: DIM.masa },
  };

  // ---------------------------------------------------------------------
  // Tipos de cuerpo y datos reales
  // ---------------------------------------------------------------------
  const TIPOS = {
    planeta: { nombre: 'Planeta', ico: 'o-planeta' },
    masivo: { nombre: 'Cuerpo masivo', ico: 'o-cuerpo-masivo' },
    satelite: { nombre: 'Satélite', ico: 'o-satelite' },
    nave: { nombre: 'Nave', ico: 'o-nave' },
  };
  const PRESETS = {
    sol: { nombre: 'Sol', masa: MSOL, radio: CUERPOS.sol.radio },
    ...Object.fromEntries(Object.entries(PLANETAS).map(([k, p]) => [k, { nombre: p.nombre, masa: p.masa, radio: p.radio }])),
    luna: { nombre: 'Luna', masa: MLUNA, radio: CUERPOS.luna.radio },
  };
  const NOMBRES_APSIDES = { sol: ['Perihelio', 'Afelio'], tierra: ['Perigeo', 'Apogeo'] };

  // ---------------------------------------------------------------------
  // Escenas
  // ---------------------------------------------------------------------
  const vari = (sim, val, min, max, paso, u, factor, liga, o = {}) => ({ sim, sub: o.sub, val, min, max, paso, u, factor, liga });
  const cuerpo = (nombre, tipo, masa, radio, p, v, o = {}) => ({ nombre, tipo, masa, radio, p, v, prueba: !!o.prueba, fijo: !!o.fijo, preset: o.preset });
  const delMotor = (cs, tipos = []) => cs.map((c, i) => cuerpo(c.nombre, tipos[i] || 'planeta', c.masa ?? c.mu / G, c.radio ?? 0, [c.x, c.y], [c.vx, c.vy], { preset: c.preset, prueba: c.prueba, fijo: c.fijo }));
  const BASE = () => ({
    unidad: 'UA', escala: 'lineal', integrador: 'auto', duracion: ANIO, seg: 24, mantenerCM: false, cuerpos: [], variables: {}, regla: null,
    capas: { trazas: true, orbitas: true, areas: false, cm: true, vectores: true, tamano: false, periodos: false, velocidades: false }, sel: 'escena', nota: null,
  });
  const MARTE_ANIO = 686.98 * DIA;
  const ESCENAS = [
    {
      clave: 'colocar', titulo: 'Planetas alrededor del Sol', tipo: 'Tutorial', duracion: 2 * ANIO,
      nota: 'Elige «Planeta» o «Cuerpo masivo» y haz clic en el lienzo: entra en órbita circular alrededor del Sol',
      crear: () => delMotor(sistemaSolar(['tierra'])), sel: 1, capas: { periodos: true },
    },
    {
      clave: 'binaria', titulo: 'Dos estrellas y su centro de masa', tipo: 'Tutorial', duracion: 3 * ANIO, mantenerCM: true,
      crear: () => {
        const d = 2 * UA, vrel = 0.85 * Math.sqrt(G * 3 * MSOL / d);
        return delMotor(aBaricentro([
          { nombre: 'Estrella A', masa: 2 * MSOL, radio: 1.7 * CUERPOS.sol.radio, x: -d / 3, y: 0, vx: 0, vy: -vrel / 3 },
          { nombre: 'Estrella B', masa: MSOL, radio: CUERPOS.sol.radio, x: 2 * d / 3, y: 0, vx: 0, vy: 2 * vrel / 3 },
        ]), ['masivo', 'masivo']);
      },
      sel: 1, variables: { mB: vari('m', 1, 0.1, 4, 0.05, 'M☉', MSOL, ['cuerpos.1.masa'], { sub: 'B' }) },
    },
    {
      clave: 'tierra-luna', titulo: 'Tierra y Luna', tipo: 'Ejemplo', unidad: 'km', duracion: 2 * LUNA_ORBITA.periodo, mantenerCM: true,
      crear: () => delMotor(tierraLuna()), sel: 1, capas: { periodos: true },
      variables: { mL: vari('m', 1, 0.5, 81, 0.5, 'M☾', MLUNA, ['cuerpos.1.masa'], { sub: 'L' }) },
    },
    {
      clave: 'interiores', titulo: 'Planetas interiores con datos reales', tipo: 'Ejemplo', duracion: 2 * MARTE_ANIO,
      crear: () => delMotor(sistemaSolar(['mercurio', 'venus', 'tierra', 'marte'])), sel: 3, capas: { periodos: true },
    },
    {
      clave: 'sistema-solar', titulo: 'Sistema solar completo', tipo: 'Ejemplo', duracion: 30 * ANIO, escala: 'log',
      crear: () => delMotor(sistemaSolar()), sel: 5, capas: { periodos: true },
    },
    {
      clave: 'halley', titulo: 'Cometa Halley y áreas barridas', tipo: 'Ejemplo', duracion: 75.32 * ANIO,
      crear: () => {
        const cs = sistemaSolar(['tierra', 'jupiter']), sol = cs[0];
        // Halley: q = 0.586 UA, e = 0.967, ϖ = 169.8°, órbita retrógrada; parte del afelio
        const a = 17.834 * UA, e = 0.96714, s = estadoDesdeElementos(sol.mu, { a, e, omega: 169.75 * Math.PI / 180, M: Math.PI, sentido: -1 });
        const halley = { nombre: 'Halley', masa: 2.2e14, radio: 5.5e3, prueba: true, x: sol.x + s.x, y: sol.y + s.y, vx: sol.vx + s.vx, vy: sol.vy + s.vy };
        return delMotor([...cs, halley], ['planeta', 'planeta', 'planeta', 'satelite']);
      },
      sel: 3, capas: { areas: true, orbitas: false },
    },
    {
      clave: 'tres-cuerpos', titulo: 'Problema de tres cuerpos (Burrau)', tipo: 'Ejemplo', duracion: 70 * TU, integrador: 'adaptativo', mantenerCM: true,
      crear: () => [[3, 1, 3], [4, -2, -1], [5, 1, -1]].map(([m, x, y], i) => cuerpo(`Estrella ${'ABC'[i]}`, 'masivo', m * MSOL, 0, [x * UA, y * UA], [0, 0])),
      sel: 0, capas: { orbitas: false, vectores: false },
      variables: { mA: vari('m', 3, 2.5, 3.5, 0.001, 'M☉', MSOL, ['cuerpos.0.masa'], { sub: 'A' }) },
    },
    {
      clave: 'ocho', titulo: 'Tres estrellas en ocho', tipo: 'Ejemplo', duracion: 2 * 6.32591398 * TU,
      crear: () => {
        const p = [0.97000436, -0.24308753], v = [-0.93240737, -0.86473146];
        return [
          cuerpo('Estrella A', 'masivo', MSOL, 0, [p[0] * UA, p[1] * UA], [-v[0] / 2 * VU, -v[1] / 2 * VU]),
          cuerpo('Estrella B', 'masivo', MSOL, 0, [-p[0] * UA, -p[1] * UA], [-v[0] / 2 * VU, -v[1] / 2 * VU]),
          cuerpo('Estrella C', 'masivo', MSOL, 0, [0, 0], [v[0] * VU, v[1] * VU]),
        ];
      },
      sel: 2, capas: { orbitas: false },
    },
    {
      clave: 'mext-2013-1-2', titulo: 'Tercera ley con los planetas', tipo: 'MEXT', anio: '2013 1-(2)', duracion: 12 * ANIO,
      // T²/a³ en SI frente a k = 4π²/(GM☉): el mismo número para todos los planetas
      extra: (i, el) => [
        ['T²/a³', '', fmt(el.periodo ** 2 / el.a ** 3, 4), 's²/m³', 'Cociente de la tercera ley de este planeta, en SI|Kepler ratio'],
        ['k', '', fmt(4 * Math.PI ** 2 / (G * MSOL), 4), 's²/m³', 'La constante de la tercera ley, 4π²/(GM☉)|Kepler constant'],
      ],
      ref: 'Pregunta también en «Órbitas» (Tercera ley de Kepler): aquí, con los planetas reales',
      crear: () => delMotor(sistemaSolar(['mercurio', 'venus', 'tierra', 'marte', 'jupiter'])), sel: 3, capas: { periodos: true, orbitas: false },
    },
    {
      clave: 'mext-2009-1-2', titulo: 'Satélite geoestacionario y la Luna', tipo: 'MEXT', anio: '2009 1-(2)', unidad: 'km', duracion: 30 * DIA,
      // a/a_L frente a (T/T_L)^(2/3) con los periodos medidos: con 1 d y 27 d sale 1/9
      extra: (i) => {
        const m = MEDIDAS[i], l = MEDIDAS[ESC.cuerpos.findIndex(c => c.nombre === 'Luna')];
        if (!m || !l || ESC.cuerpos[i].nombre === 'Luna') return [];
        return [
          ['a/a', 'L', fmt(m.a / l.a, 4), '', 'Radio de la órbita del satélite entre el de la Luna|Radius ratio'],
          ['(T/T<sub class="r">L</sub>)<sup>2/3</sup>', '', fmt((m.T / l.T) ** (2 / 3), 4), '', 'Lo que predice la tercera ley con los periodos medidos|Kepler prediction'],
          ['(1/27)<sup>2/3</sup>', '', fmt((1 / 27) ** (2 / 3), 4), '', 'La respuesta del examen, con un día y 27 días: 1/9|Exam answer'],
        ];
      },
      ref: 'Pregunta también en «Órbitas»: aquí, con la Luna real y la Tierra libre',
      crear: () => {
        const [t, l] = tierraLuna({ M: Math.PI / 3 }), r = Math.cbrt(t.mu * CUERPOS.tierra.periodoRotacion ** 2 / (4 * Math.PI ** 2)), v = Math.sqrt(t.mu / r);
        return delMotor([t, l, { nombre: 'Satélite', masa: 2000, radio: 5, prueba: true, x: t.x - r, y: t.y, vx: t.vx, vy: t.vy - v }], ['planeta', 'planeta', 'satelite']);
      },
      sel: 2, capas: { periodos: true },
    },
  ];
  const completa = e => {
    const b = BASE(), o = { ...b, ...e, capas: { ...b.capas, ...(e.capas || {}) }, cuerpos: e.crear(), variables: copia(e.variables || {}) };
    delete o.crear;
    o.cuerpos.forEach((c, i) => { c.id = 'c' + (i + 1); });
    o.sel = typeof e.sel === 'number' ? o.cuerpos[e.sel]?.id ?? 'escena' : 'escena';
    return o;
  };
  const escenaDe = clave => ESCENAS.find(e => e.clave === clave) || ESCENAS[0];

  // ---------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------
  /** @type {any} */ let ESC = completa(ESCENAS[0]);
  /** @type {any} */ let SIM = null;
  let DUR = 1, ERROR = null, MEDIDAS = [], PRIM0 = new Int32Array(0), cacheSel = null, cacheE = null;
  let t = 0, jugando = false, velocidad = 1, ultimo = 0;
  let sel = 'escena', herramienta = null, presetElegido = 'tierra', vistaTocada = false, escala0 = 1, espacioPulsado = false;
  let arrastre = null, paneo = null, hover = null, POS = [];
  let autoguardar = false, historial = null, contador = 100, kV = 1, kA = 1, R0_LOG = 0.1 * UA, CENTRO = [0, 0];
  // Recalcula como mucho una vez por cuadro mientras se arrastra o se mueve un deslizador
  let pendiente = null;
  function recalcularPronto() { if (pendiente) return; pendiente = requestAnimationFrame(() => { pendiente = null; simular(); ponerLinea(); if (!vistaTocada && !arrastre) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } todo(); }); }
  const lienzo = $('#lienzo'), area = $('#area');
  const tz = new Trazo(lienzo);
  const UN = () => FACTOR[ESC.unidad] || UA;
  const L = (v, cifras = 4) => cantidad(v / UN(), ESC.unidad, cifras);
  const idxDe = id => ESC.cuerpos.findIndex(c => c.id === id);
  const cDe = id => ESC.cuerpos.find(c => c.id === id);

  // ---------------------------------------------------------------------
  // Formato
  // ---------------------------------------------------------------------
  function tiempoLegible(s) {
    if (!Number.isFinite(s)) return ['—', ''];
    const a = Math.abs(s);
    if (a < 600) return [fmt(s, 4), 's'];
    if (a < 3 * 3600) return [fmt(s / 60, 4), 'min'];
    if (a < 3 * DIA) return [fmt(s / 3600, 4), 'h'];
    if (a < 2 * ANIO) return [fmt(s / DIA, 4), 'd'];
    return [fmt(s / ANIO, 4), 'a'];
  }
  const tiempoTxt = s => { const [v, u] = tiempoLegible(s); return u ? `${v} ${u}` : v; };
  const masaTxt = m => (m > 0 ? cantidad(m, 'kg', 4) : '0 kg');
  const escalaAceleracion = a => (a >= 1 ? [1, 'm/s²'] : a >= 1e-3 ? [1e3, 'mm/s²'] : [1e6, 'µm/s²']);
  function aceleracionTxt(a) { const [f, u] = escalaAceleracion(a); return [fmt(a * f, 4), u]; }

  // ---------------------------------------------------------------------
  // Escena → motor
  // ---------------------------------------------------------------------
  // Paso: la escala de tiempo más corta de los cuerpos que se mueven (el paso
  // por el periapsis de su órbita), con 160 pasos por ella; en los encuentros
  // más cercanos manda el integrador adaptativo
  function pasoAuto(cs, prim) {
    let dt = Infinity;
    const est = cs.map(c => ({ x: c.x, y: c.y, vx: c.vx, vy: c.vy }));
    const cfg = { mu: cs.map(c => (c.prueba ? 0 : G * c.masa)), movil: cs.map(c => (c.fijo ? 0 : 1)) };
    cs.forEach((c, i) => {
      if (c.fijo) return;
      const p = prim[i];
      if (p < 0) return;
      const el = elementosRelativos(cfg, est, i, p);
      if (!(el.mu > 0)) return;
      // En caída radial (parte del reposo) el periapsis es 0: vale la distancia actual
      const r = el.tipo === 'radial' ? el.r : el.tipo === 'circular' || el.tipo === 'elíptica' ? el.rp : Math.max(el.rp, 1e-3 * el.r);
      dt = Math.min(dt, 2 * Math.PI * Math.sqrt(r ** 3 / el.mu) / 160);
    });
    // Sin órbitas (cuerpos en reposo, tres cuerpos): el tiempo de caída del par más cercano
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const mu = cfg.mu[i] + cfg.mu[j], d = Math.hypot(cs[i].x - cs[j].x, cs[i].y - cs[j].y);
      if (mu > 0 && d > 0) dt = Math.min(dt, Math.sqrt(d ** 3 / mu) / 40);
    }
    if (!Number.isFinite(dt)) dt = ESC.duracion / 200;
    return Math.max(dt, ESC.duracion / 40000);
  }
  function escenaMotor() {
    const cs = ESC.cuerpos.map(c => ({ nombre: c.nombre, masa: c.masa, prueba: c.prueba, fijo: c.fijo, radio: c.radio, x: c.p[0], y: c.p[1], vx: c.fijo ? 0 : c.v[0], vy: c.fijo ? 0 : c.v[1] }));
    const prim = primarios(cs.map(c => ({ mu: c.prueba ? 0 : G * c.masa })), cs);
    return { cuerpos: cs, duracion: ESC.duracion, dt: pasoAuto(cs, prim), integrador: ESC.integrador, maxEvaluaciones: 6e6 };
  }
  function simular() {
    cacheSel = null; cacheE = null;
    try {
      if (!ESC.cuerpos.length) throw new Error('La escena no tiene cuerpos: coloca uno con la paleta.');
      SIM = simularSistema(escenaMotor()); ERROR = null;
    } catch (e) { SIM = null; ERROR = e.message; }
    DUR = SIM ? Math.max(SIM.duracion, 1e-9) : 1;
    PRIM0 = SIM ? SIM.primario : new Int32Array(ESC.cuerpos.length).fill(-1);
    medir();
  }
  // Periodo medido (primera vuelta alrededor del primario) y semieje medio en esa vuelta
  function medir() {
    MEDIDAS = [];
    if (!SIM) return;
    const tr = SIM.tramos[0], s0 = estadoMuestra(SIM, 0);
    ESC.cuerpos.forEach((c, i) => {
      const p = PRIM0[i];
      if (p < 0 || c.fijo) { MEDIDAS.push(null); return; }
      const el0 = elementosRelativos(tr, s0, i, p);
      const ligada = el0.tipo === 'circular' || el0.tipo === 'elíptica';
      // La última vuelta completa, medida desde el impulso anterior del cuerpo (o desde t = 0)
      const vueltas = SIM.eventos.filter(e => e.tipo === 'vuelta' && e.cuerpo === i && e.n === 1);
      const v = vueltas[vueltas.length - 1];
      const t0 = v ? SIM.eventos.filter(e => e.tipo === 'impulso' && e.cuerpo === i && e.t < v.t).reduce((a, e) => Math.max(a, e.t), 0) : 0;
      let a = el0.a;
      if (v) {
        let sa = 0, n = 0;
        const k0 = indiceEn(SIM, t0), k1 = indiceEn(SIM, v.t), paso = Math.max(1, Math.floor((k1 - k0) / 400));
        for (let k = k0; k <= k1; k += paso) { const tk = tramoEn(SIM, k); sa += elementosRelativos(tk, estadoMuestra(SIM, k), i, p).a; n++; }
        a = sa / n;
      }
      MEDIDAS.push({ p, a, T: v ? v.t - t0 : ligada ? el0.periodo : NaN, tFin: v ? v.t : NaN, medido: !!v, mu: el0.mu, ligada });
    });
  }
  const estado = tt => (SIM ? estadoSistema(SIM, Math.max(0, Math.min(tt, DUR))) : ESC.cuerpos.map(c => ({ x: c.p[0], y: c.p[1], vx: c.v[0], vy: c.v[1], activo: true, posado: false })));
  const configEn = tt => (SIM ? tramoEn(SIM, indiceEn(SIM, tt)) : null);
  const primarioEn = (i, tt) => { const tr = configEn(tt); return tr ? tr.primario[i] : -1; };

  // ---------------------------------------------------------------------
  // Transformación al lienzo: lineal o logarítmica alrededor del centro de masa
  // ---------------------------------------------------------------------
  function W(p) {
    const U = UN();
    if (ESC.escala !== 'log') return [p[0] / U, p[1] / U];
    const dx = p[0] - CENTRO[0], dy = p[1] - CENTRO[1], r = Math.hypot(dx, dy);
    if (r === 0) return [CENTRO[0] / U, CENTRO[1] / U];
    const u = R0_LOG * Math.log1p(r / R0_LOG);
    return [(CENTRO[0] + dx / r * u) / U, (CENTRO[1] + dy / r * u) / U];
  }
  function Winv(q) {
    const U = UN(), x = q[0] * U, y = q[1] * U;
    if (ESC.escala !== 'log') return [x, y];
    const dx = x - CENTRO[0], dy = y - CENTRO[1], u = Math.hypot(dx, dy);
    if (u === 0) return [CENTRO[0], CENTRO[1]];
    const r = R0_LOG * Math.expm1(u / R0_LOG);
    return [CENTRO[0] + dx / u * r, CENTRO[1] + dy / u * r];
  }
  const P = p => tz.vista.P(W(p));
  // Radio de referencia de la escala logarítmica: la cuarta parte de la órbita más interior
  function radioLog() {
    let rmin = Infinity;
    const cs = ESC.cuerpos, raiz = cs.reduce((b, c, i) => (!c.prueba && c.masa > (cs[b]?.masa ?? -1) ? i : b), -1);
    if (raiz >= 0) cs.forEach((c, i) => { if (i !== raiz) rmin = Math.min(rmin, Math.hypot(c.p[0] - cs[raiz].p[0], c.p[1] - cs[raiz].p[1])); });
    R0_LOG = Number.isFinite(rmin) && rmin > 0 ? 0.25 * rmin : 0.1 * UA;
  }

  // ---------------------------------------------------------------------
  // Dibujo
  // ---------------------------------------------------------------------
  function encuadrar() {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const inc = p => { const [x, y] = W(p); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
    if (SIM) {
      CENTRO = centroDe(0);
      const m = SIM.t.length, paso = Math.max(1, Math.floor(m / 600));
      SIM.cuerpos.forEach(c => { for (let k = 0; k < m; k += paso) inc([c.x[k], c.y[k]]); inc([c.x[m - 1], c.y[m - 1]]); });
      // y las órbitas ligadas de partida
      const s0 = estado(0), tr = SIM.tramos[0];
      ESC.cuerpos.forEach((c, i) => {
        const p = PRIM0[i]; if (p < 0) return;
        const el = elementosRelativos(tr, s0, i, p);
        if (el.tipo !== 'elíptica' && el.tipo !== 'circular') return;
        for (const [x, y] of puntosConica(el.mu, [s0[i].x - s0[p].x, s0[i].y - s0[p].y], [s0[i].vx - s0[p].vx, s0[i].vy - s0[p].vy], { n: 48 })) inc([s0[p].x + x, s0[p].y + y]);
      });
    } else ESC.cuerpos.forEach(c => inc(c.p));
    if (!Number.isFinite(x0)) { x0 = -1; x1 = 1; y0 = -1; y1 = 1; }
    const m = 0.06 * Math.max(x1 - x0, y1 - y0, 1e-9);
    tz.vista.encuadrar({ x0: x0 - m, x1: x1 + m, y0: y0 - m, y1: y1 + m }, { x: 0, y: 40, w: tz.w, h: tz.h - 80 }, 40);
  }
  function centroDe(tt) {
    if (!SIM) return [0, 0];
    const cm = centroMasas(configEn(tt), estado(tt));
    return cm.M > 0 ? [cm.x, cm.y] : [0, 0];
  }
  // Radio de pantalla de un cuerpo: simbólico (según su masa) o real si es mayor
  function radioPx(c) {
    const real = c.radio / UN() * tz.vista.escala;
    if (ESC.capas.tamano && ESC.escala !== 'log') return Math.max(real, 1.2);
    if (c.prueba) return 0;
    const simb = Math.max(4, Math.min(13, 4 + 1.6 * Math.log10(Math.max(c.masa, 1) / 1e22)));
    return ESC.escala === 'log' ? simb : Math.max(simb, real);
  }

  function dibujar() {
    const v = tz.vista;
    if (SIM) CENTRO = centroDe(t);
    tz.limpiar(); tz.cuadricula();
    const s = estado(t), tr = configEn(t);
    POS = s.map((q, i) => { const [x, y] = P([q.x, q.y]); return [x, y, radioPx(ESC.cuerpos[i]), q.activo]; });
    const obstaculos = ESC.escala === 'log' ? anillosLog() : [];
    if (ESC.escala !== 'log') tz.ejes({ x: 'x', y: 'y', ux: ESC.unidad, uy: ESC.unidad, huecos: [...POS.filter(p => p[3]).map(([x, y, r]) => [x, y, r + 14]), ...huecosMagnitudes(s, tr), [0, tz.vista.Y(0) + 10, 34]] });
    if (!SIM) { ESC.cuerpos.forEach(c => tz.gravCuerpo(W(c.p), radioPx(c) || 6)); return; }

    // 5 · Construcción: áreas, órbitas predichas, trazas, centro de masa
    const i0 = idxDe(sel);
    const fichaAreas = ESC.capas.areas && i0 >= 0 ? sectores(i0) : null;
    if (ESC.capas.orbitas) ESC.cuerpos.forEach((c, i) => { if (s[i].activo && !s[i].posado) orbitaPrevista(i, s, tr); });
    if (ESC.capas.trazas && t > 0) ESC.cuerpos.forEach((c, i) => traza(i, i === i0));
    const cm = ESC.capas.cm ? dibujarCM(s) : null;

    // 6 · Materia: cuerpos; 7 · magnitudes del seleccionado; y los nombres, que
    // esquivan los cuerpos, los vectores y sus etiquetas
    const etiquetas = [];
    ESC.cuerpos.forEach((c, i) => {
      if (!s[i].activo) return;
      const [x, y, r] = POS[i], grueso = hover === c.id;
      if (c.prueba) tz.particula(W([s[i].x, s[i].y]), { radio: 4.5 });
      else tz.gravCuerpo(W([s[i].x, s[i].y]), r, { grueso });
      if (c.id === sel) tz.seleccionCirculo(x, y, Math.max(r, 4.5) + 5);
      etiquetas.push({ i, x, y, r: Math.max(r, 4.5) });
    });
    if (ESC.capas.vectores && i0 >= 0 && s[i0].activo && !s[i0].posado) vectores(i0, s, tr, obstaculos);
    if (cm) etiquetas.push({ i: -1, x: cm[0], y: cm[1], r: 5, texto: 'CM' });
    const cajas = nombres(etiquetas, s, obstaculos);
    if (fichaAreas) colocarFicha(fichaAreas, cajas);
    // 8 · Eventos: choques
    for (const e of SIM.eventos) if (e.tipo === 'impacto' && e.t <= t + 1e-9) { const [ix, iy] = tz.eventoAnillo(W([e.x, e.y])); if (Math.abs(e.t - t) < DUR / 50) tz.ficha(ix + 14, iy - 30, [[{ t: e.fusion ? 'Choque y fusión' : 'Impacto', f: 'ui', tam: 11.5 }, { t: ' · ', f: 'num', tam: 11.5 }, { t: 't', f: 'sim', tam: 13 }, { t: ' = ' + tiempoTxt(e.t), f: 'num', tam: 11.5 }]], { ancla: [ix + 7, iy] }); }
    // 10 · Edición: regla y escala
    if (ESC.regla) dibujarRegla();
    if (ESC.escala !== 'log') tz.gravBarraUnidad(16, tz.h - 56, ESC.unidad, 2);
  }

  function anillosLog() {
    const c = W(CENTRO), U = UN(), anillos = [];
    let rmax = 0;
    ESC.cuerpos.forEach(q => { rmax = Math.max(rmax, Math.hypot(q.p[0] - CENTRO[0], q.p[1] - CENTRO[1])); });
    for (let e = -3; e <= 3; e++) for (const m of [1, 3]) {
      const r = m * 10 ** e * (ESC.unidad === 'UA' ? UA : KM * 1e3);
      if (r < 0.3 * R0_LOG || r > 2.5 * rmax) continue;
      const [x] = W([CENTRO[0] + r, CENTRO[1]]);
      anillos.push({ rPx: (x - c[0]) * tz.vista.escala, texto: cantidad(r / U, ESC.unidad, 1) });
    }
    // Las etiquetas de los anillos esquivan los cuerpos y sus nombres probables
    const libre = (x, y, w, h) => !POS.some(([px, py, rr, a]) => a && px > x - rr - 60 && px < x + w + rr + 10 && py > y - rr - 30 && py < y + h + rr + 30);
    return tz.gravAnillos(c, anillos, { libre });
  }

  // Traza del cuerpo i: la de un cuerpo ligado, solo su última vuelta y algo
  // más (muchas vueltas superpuestas forman una banda que no se lee)
  function traza(i, destacada) {
    const c = SIM.cuerpos[i], m = MEDIDAS[i], kt = indiceEn(SIM, t);
    const k0 = m && m.ligada && Number.isFinite(m.T) ? indiceEn(SIM, Math.max(0, t - 1.2 * m.T)) : 0;
    const salto = Math.max(1, Math.floor((kt - k0) / 1200)), pts = [];
    for (let k = k0; k <= kt; k += salto) pts.push(W([c.x[k], c.y[k]]));
    const s = estado(t)[i]; pts.push(W([s.x, s.y]));
    tz.linea(pts, { color: destacada ? 'texto-2' : 'texto-3', grosor: destacada ? 1.5 : 1.25 });
  }
  function orbitaPrevista(i, s, tr) {
    const p = tr.primario[i];
    if (p < 0 || !s[p].activo || ESC.cuerpos[i].fijo) return;
    const mu = tr.mu[p] + (tr.movil[p] ? tr.mu[i] : 0);
    if (!(mu > 0)) return;
    const pos = [s[i].x - s[p].x, s[i].y - s[p].y], vel = [s[i].vx - s[p].vx, s[i].vy - s[p].vy];
    const pts = puntosConica(mu, pos, vel, { n: 240, rMax: 3 * Math.hypot(...pos) });
    if (pts.length) tz.trayectoria(pts.map(([x, y]) => W([s[p].x + x, s[p].y + y])), 'prevista');
  }
  // Áreas barridas por el cuerpo i respecto de su primario, en intervalos iguales
  function sectores(i) {
    const p = PRIM0[i], m = MEDIDAS[i];
    if (p < 0 || !m || !m.ligada) return;
    const n = 12, dts = m.T / n, c = SIM.cuerpos[i], q = SIM.cuerpos[p];
    const sNow = estado(t), apex = [sNow[p].x, sNow[p].y];
    const arcos = [];
    for (let k = 0; k * dts < t - 1e-9 && arcos.length < 3 * n; k++) {
      const ta = k * dts, tb = Math.min((k + 1) * dts, t), pts = [];
      const sa = estado(ta); pts.push([sa[i].x - sa[p].x, sa[i].y - sa[p].y]);
      const ka = indiceEn(SIM, ta) + 1, kb = indiceEn(SIM, tb), salto = Math.max(1, Math.floor((kb - ka) / 80));
      for (let kk = ka; kk <= kb; kk += salto) pts.push([c.x[kk] - q.x[kk], c.y[kk] - q.y[kk]]);
      const sb = estado(tb); pts.push([sb[i].x - sb[p].x, sb[i].y - sb[p].y]);
      arcos.push(pts.map(([x, y]) => W([apex[0] + x, apex[1] + y])));
    }
    if (!arcos.length) return null;
    tz.gravSectores(W(apex), arcos);
    if (arcos.length < 2) return null;
    // Ficha con el área de un intervalo (todas iguales: segunda ley de Kepler), junto a un sector completo
    const serie = serieSel(i), A = areaEn(serie, dts) - areaEn(serie, 0), [U, uu] = uG();
    const anclas = arcos.slice(0, -1).map(a => tz.vista.P(a[Math.floor(a.length / 2)]));
    return {
      anclas, lineas: [
        [{ t: 'Áreas en intervalos iguales', f: 'ui', tam: 11.5 }],
        [{ t: 'Δ', f: 'num', tam: 11.5 }, { t: 't', f: 'sim', tam: 13 }, { t: ' = ' + tiempoTxt(dts) + '   ', f: 'num', tam: 11.5 }, { t: 'A', f: 'sim', tam: 13, color: 'inercia' }, { t: ' = ' + cantidad(A / (U * U), uu + '²', 4), f: 'num', tam: 11.5 }],
      ],
    };
  }
  // Coloca la ficha de las áreas en el primer sitio libre junto a un sector
  function colocarFicha(f, cajas) {
    const Wf = 236, Hf = 38, zonas = tz.zonasFlotantes();
    const choca = (x, y) => x < 8 || y < 8 || x + Wf > tz.w - 8 || y + Hf > tz.h - 8
      || cajas.some(b => x < b[0] + b[2] && x + Wf > b[0] && y < b[1] + b[3] && y + Hf > b[1])
      || zonas.some(z => x < z.x + z.w && x + Wf > z.x && y < z.y + z.h && y + Hf > z.y)
      || POS.some(([px, py, r, a]) => a && px > x - r - 4 && px < x + Wf + r + 4 && py > y - r - 4 && py < y + Hf + r + 4);
    for (const [ax, ay] of f.anclas) {
      for (const [dx, dy] of [[-Wf / 2, -Hf - 30], [-Wf / 2, 30], [30, -Hf / 2], [-Wf - 30, -Hf / 2], [30, -Hf - 20], [-Wf - 30, 20]]) {
        const x = ax + dx, y = ay + dy;
        if (!choca(x, y)) { tz.ficha(x, y, f.lineas, { ancla: [ax, ay] }); return; }
      }
    }
  }
  function dibujarCM(s) {
    const tr = configEn(t), cm = centroMasas(tr, s);
    if (!(cm.M > 0)) return;
    const c0 = centroMasas(SIM.tramos[0], estado(0)), pa = P([c0.x, c0.y]), pb = P([cm.x, cm.y]);
    if (Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) > 2) tz.lineaPx([pa, pb], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
    tz.centroMasa(W([cm.x, cm.y]));
    // Encima de un cuerpo no lleva etiqueta (la del cuerpo ya está ahí)
    return POS.some(([x, y, r, a]) => a && Math.hypot(x - pb[0], y - pb[1]) < r + 6) ? null : pb;
  }
  // Nombres (y periodo o rapidez) junto a cada cuerpo, sin que se monten
  function nombres(lista, s, obstaculos = []) {
    const cajas = obstaculos.slice(), ctx = tz.ctx;
    const ocupado = (x, y, w, h) => cajas.some(b => x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) || POS.some(([px, py, r, a]) => a && px > x - r && px < x + w + r && py > y - r && py < y + h + r);
    const zonas = tz.zonasFlotantes();
    const enZona = (x, y, w, h) => zonas.some(z => x < z.x + z.w && x + w > z.x && y < z.y + z.h && y + h > z.y);
    // El seleccionado primero (siempre se escribe)
    const esSel = e => e.i >= 0 && ESC.cuerpos[e.i].id === sel;
    lista.sort((a, b) => esSel(b) - esSel(a));
    for (const { i, x, y, r, texto: txt } of lista) {
      if (i < 0) {
        // Etiqueta del centro de masa
        const w = 18, sitio = [[x + 8, y - 7], [x + 8, y + 15], [x - 26, y - 7], [x - 26, y + 15]].find(([a, b]) => !ocupado(a, b - 10, w, 13));
        if (sitio) { cajas.push([sitio[0], sitio[1] - 10, w, 13]); tz.texto(txt, sitio[0], sitio[1], { fuente: 'ui', tam: 11, peso: 500, color: 'texto-2', halo: true }); }
        continue;
      }
      const c = ESC.cuerpos[i], lineas = [c.nombre];
      if (ESC.capas.periodos && MEDIDAS[i] && MEDIDAS[i].medido && t >= MEDIDAS[i].tFin - 1e-9) lineas.push('T = ' + tiempoTxt(MEDIDAS[i].T));
      if (ESC.capas.velocidades) { const p = primarioEn(i, t), vr = p >= 0 ? Math.hypot(s[i].vx - s[p].vx, s[i].vy - s[p].vy) : Math.hypot(s[i].vx, s[i].vy); lineas.push('|v| = ' + cantidad(vr / KM, 'km/s', 4)); }
      ctx.save(); ctx.font = '500 12px "IBM Plex Sans", sans-serif';
      const w = Math.max(...lineas.map((l, k) => { ctx.font = k ? '11px "IBM Plex Mono", monospace' : '500 12px "IBM Plex Sans", sans-serif'; return ctx.measureText(l).width; }));
      ctx.restore();
      const h = 14 * lineas.length, d = r + 6;
      const sitios = [[x + d, y - d - h + 10], [x + d, y + d], [x - d - w, y - d - h + 10], [x - d - w, y + d], [x - w / 2, y - d - h - 2], [x - w / 2, y + d + 4],
        [x + d + 14, y - h / 2 + 4], [x - d - 14 - w, y - h / 2 + 4], [x - w / 2, y - d - h - 18], [x - w / 2, y + d + 20]];
      const libre = sitios.find(([a, b]) => !ocupado(a, b - 10, w, h) && !enZona(a, b - 10, w, h) && a > 4 && a + w < tz.w - 4 && b > 14 && b + h < tz.h - 4);
      if (!libre && c.id !== sel) continue;
      void txt;
      const [lx, ly] = libre || sitios[0];
      cajas.push([lx, ly - 10, w, h]);
      lineas.forEach((l, k) => tz.texto(l, lx, ly + k * 14, k ? { fuente: 'num', tam: 11, color: 'texto-2', halo: true } : { fuente: 'ui', tam: 12, peso: 500, color: 'texto', halo: true }));
    }
    return cajas;
  }
  // Caja de la etiqueta de un vector (como la escribe etiquetaMagnitud en su punta) como
  // círculos para los huecos de los ejes
  function huecosEtiqueta(h, ex, ey, ux, uy, w) {
    const lx = ex + ux * 10 + (ux >= 0 ? 2 : -2), ly = ey + uy * 10 + 5 - 5, x0 = ux >= -0.2 ? lx : lx - w;
    for (let q = 0; q <= 4; q++) h.push([x0 + w * q / 4, ly, 12]);
  }
  // Zonas (círculos de pantalla) donde irán los vectores del seleccionado y sus
  // etiquetas: ningún número de los ejes se escribe ahí
  function huecosMagnitudes(s, tr) {
    const h = [], i = idxDe(sel);
    if (SIM && ESC.capas.vectores && i >= 0 && s[i].activo && !s[i].posado && POS[i]) {
      const [x, y, r] = POS[i], p = tr.primario[i], d = Math.max(r, 4.5) + 1;
      const vr = p >= 0 ? [s[i].vx - s[p].vx, s[i].vy - s[p].vy] : [s[i].vx, s[i].vy];
      let ax = 0, ay = 0;
      s.forEach((q, j) => { if (j === i || !q.activo || !(tr.mu[j] > 0)) return; const dx = q.x - s[i].x, dy = q.y - s[i].y, dd = Math.hypot(dx, dy); ax += tr.mu[j] * dx / dd ** 3; ay += tr.mu[j] * dy / dd ** 3; });
      for (const [vx, vy, k] of [[vr[0] / KM, vr[1] / KM, kV], [ax, ay, kA]]) {
        const m = Math.hypot(vx, vy); if (!(m > 0)) continue;
        const ux = vx / m, uy = -vy / m, L = d + m * k;
        h.push([x + ux * L / 2, y + uy * L / 2, 10]);
        huecosEtiqueta(h, x + ux * L, y + uy * L, ux, uy, 120);
      }
    }
    return h;
  }
  // Un vector y su etiqueta como obstáculos (cajas de pantalla) para los nombres
  function obstaculoVector(obs, x0, y0, x1, y1, etq) {
    for (let k = 1; k <= 6; k++) { const u = k / 6, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u; obs.push([x - 5, y - 5, 10, 10]); }
    if (etq) obs.push([etq.x - 2, etq.y - 13, etq.ancho + 4, 17]);
  }
  // ¿Cabe la etiqueta de un vector sin tapar a otro cuerpo? (su valor sigue en las lecturas)
  function etiquetaLibre(x, y, w, alinear, propio) {
    const x0 = alinear === 'right' ? x - w : x;
    return !POS.some(([px, py, r, a], j) => a && j !== propio && px > x0 - r - 3 && px < x0 + w + r + 3 && py > y - 14 - r && py < y + 4 + r);
  }
  function vectores(i, s, tr, obs = []) {
    const p = tr.primario[i], [x, y, r] = POS[i];
    const vr = p >= 0 ? [s[i].vx - s[p].vx, s[i].vy - s[p].vy] : [s[i].vx, s[i].vy], mv = Math.hypot(...vr);
    // Aceleración gravitatoria total sobre i
    let ax = 0, ay = 0;
    s.forEach((q, j) => { if (j === i || !q.activo || !(tr.mu[j] > 0)) return; const dx = q.x - s[i].x, dy = q.y - s[i].y, d = Math.hypot(dx, dy); ax += tr.mu[j] * dx / d ** 3; ay += tr.mu[j] * dy / d ** 3; });
    const ma = Math.hypot(ax, ay), desde = Math.max(r, 4.5) + 1, w = W([s[i].x, s[i].y]);
    if (ma > 0) {
      const e = tz.vector(w, [ax, ay], { familia: 'cambio', escalaPx: kA, desdeRadio: desde });
      const ang = Math.atan2(e[1] - y, e[0] - x), c = Math.cos(ang), [fa, ua] = escalaAceleracion(ma);
      const ly = e[1] + Math.sin(ang) * 10 + 5, lx = e[0] + c * 10 + (c >= 0 ? 2 : -2), al = c >= -0.2 ? 'left' : 'right';
      if (etiquetaLibre(lx, ly, 120, al, i)) { const et = tz.etiquetaMagnitud(lx, ly, { simbolo: 'g', valor: ma * fa, unidad: ua, color: 'cambio', alinear: al }); obstaculoVector(obs, x, y, e[0], e[1], { ...et, y: ly }); }
      else obstaculoVector(obs, x, y, e[0], e[1], null);
    }
    if (mv > 0) {
      const e = tz.vector(w, [vr[0] / KM, vr[1] / KM], { familia: 'movimiento', escalaPx: kV, desdeRadio: desde });
      const ang = Math.atan2(e[1] - y, e[0] - x), c = Math.cos(ang);
      const ly = e[1] + Math.sin(ang) * 10 + 5, lx = e[0] + c * 10 + (c >= 0 ? 2 : -2), al = c >= -0.2 ? 'left' : 'right';
      if (etiquetaLibre(lx, ly, 110, al, i)) { const et = tz.etiquetaMagnitud(lx, ly, { simbolo: 'v', valor: mv / KM, unidad: 'km/s', color: 'movimiento', alinear: al }); obstaculoVector(obs, x, y, e[0], e[1], { ...et, y: ly }); }
      else obstaculoVector(obs, x, y, e[0], e[1], null);
      if (t === 0 && !ESC.cuerpos[i].fijo) tz.asaVector(e[0], e[1], arrastre && arrastre.tipo === 'velocidad');
    }
  }
  function dibujarRegla() {
    const [a, b] = ESC.regla, pa = P(a), pb = P(b);
    tz.lineaPx([pa, pb], { color: 'texto-2', grosor: 1 });
    for (const q of [pa, pb]) tz.asa(q[0], q[1]);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    tz.ficha((pa[0] + pb[0]) / 2 + 10, (pa[1] + pb[1]) / 2 - 30, [[{ t: 'd', f: 'sim', tam: 13 }, { t: ' = ' + L(d, 4), f: 'num', tam: 11.5 }]]);
  }

  // ---------------------------------------------------------------------
  // Series del seleccionado (r y área barrida respecto de su primario) y del sistema
  // ---------------------------------------------------------------------
  function serieSel(i) {
    if (cacheSel && cacheSel.i === i) return cacheSel;
    const p = PRIM0[i], m = SIM.t.length, c = SIM.cuerpos[i];
    const r = new Float64Array(m), A = new Float64Array(m);
    if (p >= 0) {
      const q = SIM.cuerpos[p], sg = Math.sign((c.x[0] - q.x[0]) * (c.vy[0] - q.vy[0]) - (c.y[0] - q.y[0]) * (c.vx[0] - q.vx[0])) || 1;
      for (let k = 0; k < m; k++) {
        const x = c.x[k] - q.x[k], y = c.y[k] - q.y[k];
        r[k] = Math.hypot(x, y);
        if (k) A[k] = A[k - 1] + 0.5 * sg * ((c.x[k - 1] - q.x[k - 1]) * y - x * (c.y[k - 1] - q.y[k - 1]));
      }
      cacheSel = { i, p, r, A, sg };
    } else cacheSel = { i, p, r, A, sg: 1 };
    return cacheSel;
  }
  function areaEn(serie, tt) {
    const { i, p, A, sg } = serie;
    if (p < 0) return 0;
    const k = indiceEn(SIM, tt), c = SIM.cuerpos[i], q = SIM.cuerpos[p], s = estado(tt);
    const x0 = c.x[k] - q.x[k], y0 = c.y[k] - q.y[k], x1 = s[i].x - s[p].x, y1 = s[i].y - s[p].y;
    return A[k] + 0.5 * sg * (x0 * y1 - x1 * y0);
  }
  function serieEnergia() {
    if (cacheE) return cacheE;
    const m = SIM.t.length, salto = Math.max(1, Math.floor(m / 800)), K = [], U = [], E = [], T = [];
    for (let k = 0; k < m; k += salto) { const e = energiaN(tramoEn(SIM, k), estadoMuestra(SIM, k)); T.push(SIM.t[k]); K.push(e.K); U.push(e.U); E.push(e.E); }
    const e = energiaN(tramoEn(SIM, m - 1), estadoMuestra(SIM, m - 1)); T.push(SIM.t[m - 1]); K.push(e.K); U.push(e.U); E.push(e.E);
    cacheE = { T, K, U, E };
    return cacheE;
  }

  // ---------------------------------------------------------------------
  // Inspector, árbol, lecturas y variables
  // ---------------------------------------------------------------------
  const fila = (etq, control, ayuda = '') => `<div class="fila"${ayuda ? ` data-ayuda="${ayuda}"` : ''}><span class="etq">${etq}</span>${control}</div>`;
  const segmentado = (id, ops, actual) => `<div class="segmentado texto" id="${id}">${ops.map(([v, txt, ay]) => `<button data-v="${v}" aria-pressed="${String(v) === String(actual)}"${ay ? ` data-ayuda="${ay}"` : ''}>${txt}</button>`).join('')}</div>`;
  const leer = ruta => ruta.split('.').reduce((o, k) => (o == null ? o : o[k]), ESC);
  function escribir(ruta, val) { const ks = ruta.split('.'), u = ks.pop(), o = ks.reduce((a, k) => a[k], ESC); o[u] = val; }
  const ligadaA = ruta => Object.entries(ESC.variables).find(([, d]) => d.liga.includes(ruta));
  // Campos: dim, unidad de pantalla (texto) y factor a SI
  function campo(etq, ruta, dim, u, f, ayuda = '') {
    const lig = ligadaA(ruta);
    if (lig) {
      const [nv, d] = lig;
      return fila(etq, `<div class="campo es-variable" data-ayuda="Ligado a la variable ${d.sim}|Bound to variable"><span class="chip-var">${simHTML(d.sim, d.sub)}</span><span class="valor-var" data-var="${nv}"></span><span class="u">${d.u}</span></div>`, ayuda);
    }
    const val = leer(ruta);
    return fila(etq, `<div class="campo"><input data-ruta="${ruta}" data-dim="${dim}" data-u="${u}" data-f="${f}" value="${val == null ? '' : numCampo(val / f)}"><span class="u">${u}</span></div>`, ayuda);
  }
  const boton = (id, ico, txt, ayuda) => `<button class="btn btn-secundario btn-compacto" id="${id}" data-ayuda="${ayuda}"><svg class="ico"><use href="#${ico}"/></svg>${txt}</button>`;
  const casilla = (id, txt, on, ayuda) => `<label class="casilla" data-ayuda="${ayuda}"><input type="checkbox" id="${id}"${on ? ' checked' : ''}>${txt}</label>`;

  function inspector() {
    const props = $('#propiedades'), c = cDe(sel), U = UN(), u = ESC.unidad;
    let h = '';
    if (!c) {
      $('#insp-ico').setAttribute('href', '#i-escena'); $('#insp-nombre').textContent = 'Escena'; $('#props-titulo').textContent = 'Simulación';
      h += campo('Duración', 'duracion', 'tiempo', ESC.duracion >= 2 * ANIO ? 'a' : 'd', ESC.duracion >= 2 * ANIO ? ANIO : DIA, 'Tiempo simulado; acepta d y a (días y años)|Duration');
      h += fila('Integrador', segmentado('p-integrador', [['auto', 'Auto', 'Automático: simpléctico, y adaptativo en los encuentros cercanos|Auto'], ['adaptativo', 'Adaptativo', 'Bulirsch–Stoer en todo el recorrido|Adaptive'], ['yoshida4', 'Simpléctico', 'Yoshida de 4.º orden de paso fijo|Symplectic']], ESC.integrador));
      h += fila('Unidad', segmentado('p-unidad', [['UA', 'UA'], ['km', 'km']], ESC.unidad), 'Unidad de las distancias|Length unit');
      h += casilla('p-mantener', 'Centro de masa en reposo en el origen', ESC.mantenerCM, 'Al cambiar una masa con su variable, el sistema se recoloca para que el centro de masa siga quieto en el origen|Keep the center of mass at rest');
      h += `<div class="fila"><span class="etq"></span><div class="acciones-fila">${boton('p-cm', 'o-cuerpo-masivo', 'Llevar al centro de masa', 'Resta la posición y la velocidad del centro de masa a todos los cuerpos|Barycentric frame')}</div></div>`;
      if (ESC.ref) h += `<p class="nota-ref">${ESC.ref}</p>`;
      props.innerHTML = h;
      $('#grupo-elementos').hidden = true;
    } else {
      const i = idxDe(sel), b = `cuerpos.${i}`;
      $('#insp-ico').setAttribute('href', '#' + TIPOS[c.tipo].ico); $('#insp-nombre').textContent = c.nombre; $('#props-titulo').textContent = 'Condiciones iniciales';
      h += fila('Nombre', `<div class="campo"><input id="p-nombre" value="${c.nombre}"></div>`);
      if (!c.prueba) h += campo('Masa', `${b}.masa`, 'masa', 'kg', 1, 'Acepta MS, MT y ML (masas del Sol, la Tierra y la Luna)|Mass');
      else h += campo('Masa', `${b}.masa`, 'masa', 'kg', 1, 'Solo cuenta para su energía: una partícula de prueba no atrae|Mass');
      h += campo('Radio', `${b}.radio`, 'longitud', 'km', KM, 'Superficie para los choques (0: masa puntual)|Radius');
      h += campo('x', `${b}.p.0`, 'longitud', u, U) + campo('y', `${b}.p.1`, 'longitud', u, U);
      h += campo('<span class="sim">v<sub>x</sub></span>', `${b}.v.0`, 'velocidad', 'km/s', KM) + campo('<span class="sim">v<sub>y</sub></span>', `${b}.v.1`, 'velocidad', 'km/s', KM);
      h += casilla('p-fijo', 'Fijo (no se mueve)', c.fijo, 'Cuerpo central fijo|Fixed');
      h += casilla('p-prueba', 'Partícula de prueba (no atrae)', c.prueba, 'Siente la gravedad de los demás pero no atrae a nadie|Test particle');
      const p = PRIM0[i];
      h += `<div class="fila"><span class="etq">Objeto</span><div class="acciones-fila">${p >= 0 ? boton('p-circular', 'o-satelite', 'Órbita circular', `Velocidad de la órbita circular alrededor de ${ESC.cuerpos[p].nombre}|Circular orbit`) : ''}${boton('p-duplicar', 'i-duplicar', 'Duplicar', 'Duplicar|Duplicate|Ctrl D')}${boton('p-quitar', 'i-borrar', 'Quitar', 'Quitar el cuerpo|Delete|Supr')}</div></div>`;
      props.innerHTML = h;
      $('#grupo-elementos').hidden = false;
    }
    props.querySelectorAll('input[data-ruta]').forEach(campoConUnidad);
    const on = (id, f) => { const e = $(id); if (e) e.addEventListener('click', ev => { const bt = ev.target.closest('button'); if (bt) f(bt.dataset.v, bt); }); };
    on('#p-integrador', v => { ESC.integrador = v; cambio(); titulo(); });
    on('#p-unidad', v => { if (v === ESC.unidad) return; ESC.unidad = v; vistaTocada = false; cambio(); });
    const pm = $('#p-mantener'); if (pm) pm.addEventListener('change', () => { ESC.mantenerCM = pm.checked; cambio(); });
    const pcm = $('#p-cm'); if (pcm) pcm.addEventListener('click', () => { llevarAlCM(); cambio(); avisar('Sistema en el centro de masa'); });
    const pn = $('#p-nombre'); if (pn) pn.addEventListener('change', () => { const c2 = cDe(sel); if (c2) { c2.nombre = texto(pn.value, c2.nombre, 24); cambio(); } });
    const pf = $('#p-fijo'); if (pf) pf.addEventListener('change', () => { const c2 = cDe(sel); c2.fijo = pf.checked; if (c2.fijo) c2.v = [0, 0]; cambio(); });
    const pp = $('#p-prueba'); if (pp) pp.addEventListener('change', () => { const c2 = cDe(sel); c2.prueba = pp.checked; if (c2.prueba && c2.tipo !== 'nave') c2.tipo = 'satelite'; else if (!c2.prueba && c2.tipo === 'satelite') c2.tipo = 'masivo'; cambio(); });
    const pc = $('#p-circular'); if (pc) pc.addEventListener('click', () => { orbitaCircular(idxDe(sel)); cambio(); avisar('Velocidad de la órbita circular'); });
    const b2 = $('#p-duplicar'); if (b2) b2.addEventListener('click', duplicar);
    const b1 = $('#p-quitar'); if (b1) b1.addEventListener('click', quitarSeleccion);
    arbol();
  }
  function validar(ruta, x) {
    const k = ruta.split('.').pop(), r2 = ruta.split('.').slice(-2).join('.');
    if (ruta === 'duracion') { if (!(x >= 60 && x <= 500 * ANIO)) throw new Error('La duración va de 1 min a 500 años.'); return x; }
    if (k === 'masa') { if (!(x >= 0 && x <= 1e33)) throw new Error('La masa va de 0 a 10³³ kg.'); return x; }
    if (k === 'radio') { if (!(x >= 0 && x <= 1e10)) throw new Error('El radio va de 0 a 10⁷ km.'); return x; }
    if (/^p\.[01]$/.test(r2) && Math.abs(x) > 1e14) throw new Error('La posición está demasiado lejos (máximo 670 UA).');
    if (/^v\.[01]$/.test(r2) && Math.abs(x) > 1e6) throw new Error('La velocidad es demasiado grande (máximo 1000 km/s).');
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
        const dim = ent.dataset.dim, fac = parseFloat(ent.dataset.f);
        const txt = ent.value.trim().replace(/−/g, '-');
        // Un número solo se lee en la unidad del campo; con unidad o expresión, la evalúa el núcleo
        const valor = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(txt) ? parseFloat(txt) * fac : evaluar(txt, { esperada: dim, variables: VARS_U, factorPorDefecto: fac }).valor;
        escribir(ent.dataset.ruta, validar(ent.dataset.ruta, valor));
        mostrarError(null); cambio();
      } catch (e) { mostrarError(e.message); }
    });
    ent.addEventListener('keydown', ev => { if (ev.key === 'Escape') { mostrarError(null); ent.blur(); inspector(); } });
  }

  function arbol() {
    const nodo = (s, ico, nombre, dato) => `<div class="nodo" data-sel="${s}" aria-selected="${sel === s}"><svg class="ico"><use href="#${ico}"/></svg><span class="nombre">${nombre}</span><span class="dato">${dato}</span></div>`;
    let h = nodo('escena', 'i-escena', 'Escena', `${ESC.cuerpos.length} cuerpos`);
    for (const c of ESC.cuerpos) h += nodo(c.id, TIPOS[c.tipo].ico, c.nombre, c.prueba ? 'prueba' : masaCorta(c.masa));
    if (ESC.regla) h += nodo('regla', 'n-regla', 'Regla', L(Math.hypot(ESC.regla[1][0] - ESC.regla[0][0], ESC.regla[1][1] - ESC.regla[0][1]), 3));
    h += `<div class="nodo global"><svg class="ico"><use href="#o-gravedad"/></svg><span class="nombre">Gravitación universal</span><span class="dato">${ESC.integrador === 'auto' ? 'automático' : ESC.integrador === 'adaptativo' ? 'adaptativo' : 'simpléctico'}</span></div>`;
    $('#arbol').innerHTML = h;
    $('#arbol').querySelectorAll('.nodo[data-sel]').forEach(n => n.addEventListener('click', () => seleccionar(n.dataset.sel)));
  }
  // Masa corta para el árbol: en masas del Sol, de la Tierra o en kg
  function masaCorta(m) {
    if (m >= 0.05 * MSOL) return `${fmt(m / MSOL, 3)} M☉`;
    if (m >= 0.005 * MTIERRA) return `${fmt(m / MTIERRA, 3)} M⊕`;
    return cantidad(m, 'kg', 2);
  }
  function seleccionar(s) {
    if (s === sel) return;
    sel = s; cacheSel = null; escalasVector(); inspector(); if (SIM) lt.eventos = eventosLinea(); todo();
  }

  const lectura = ([a, b, val, u, ayuda]) => `<span class="sim"${ayuda ? ` data-ayuda="${ayuda}"` : ''}>${a}${b ? `<sub class="r">${b}</sub>` : ''}</span><span class="v">${val}</span><span class="u">${u}</span>`;
  function lecturas() {
    document.querySelectorAll('[data-var]').forEach(e => { const d = ESC.variables[e.dataset.var]; if (d) e.textContent = fmtVar(d); });
    const [tv, tu] = tiempoLegible(t);
    $('#reloj').innerHTML = `<span class="sim">t</span>${tv}<span class="u">${tu}</span>`;
    $('#lect-titulo').textContent = `Lecturas en t = ${tiempoTxt(t)}`;
    $('#b-play').innerHTML = `<svg class="ico"><use href="#i-${jugando ? 'pausar' : 'reproducir'}"/></svg>`;
    $('#b-play').dataset.ayuda = jugando ? 'Pausar|Pause|Espacio' : 'Reproducir|Play|Espacio';
    if (!SIM) { $('#lecturas').innerHTML = `<span class="u" style="grid-column:1/-1">${ERROR || '—'}</span>`; $('#elementos').innerHTML = ''; $('#insp-estado').textContent = ''; return; }
    const s = estado(t), tr = configEn(t), c = cDe(sel), i = idxDe(sel), U = UN(), f = [];
    if (!c) {
      const e = energiaN(tr, s), e0 = energiaN(SIM.tramos[0], estado(0)), cm = centroMasas(tr, s);
      const [Ev, Eu] = prefijo(e.E, 'J'), dE = (e.E - e0.E) / Math.abs(e0.E || 1);
      f.push(['N', '', String(ESC.cuerpos.filter((q, k) => s[k].activo).length), '', 'Cuerpos en la escena|Bodies']);
      f.push(['E', '', Ev, Eu, 'Energía mecánica del sistema: cinética más potencial de cada par|Total energy']);
      f.push(['ΔE/E', '0', fmtCient(dE), '', 'Deriva relativa de la energía desde t = 0 (error numérico, o energía disipada en un choque)|Energy drift']);
      f.push(['L', '', fmt(momentoAngularN(tr, s), 4), 'kg·m²/s', 'Momento angular total respecto del origen|Angular momentum']);
      f.push(['x', 'CM', fmt(cm.x / U, 4), ESC.unidad, 'Centro de masa|Center of mass'], ['y', 'CM', fmt(cm.y / U, 4), ESC.unidad]);
      f.push(['|v|', 'CM', fmt(Math.hypot(cm.vx, cm.vy), 3), 'm/s', 'Rapidez del centro de masa: constante sin fuerzas externas|Center of mass speed']);
      f.push(['n', 'pasos', String(SIM.pasos), '', `Muestras de la simulación; ${SIM.metodo.reduce((a, b) => a + b, 0)} con el integrador adaptativo|Steps`]);
      $('#insp-estado').textContent = SIM.incompleta ? `incompleta en t = ${tiempoTxt(SIM.incompleta.t)}` : `${ESC.cuerpos.length} cuerpos · ${ESC.tipo}`;
      $('#elementos').innerHTML = '';
    } else {
      const p = tr.primario[i];
      let estadoTxt = c.tipo === 'nave' ? 'Nave' : c.prueba ? 'Partícula de prueba' : TIPOS[c.tipo].nombre;
      if (!s[i].activo) estadoTxt += ' · absorbido en un choque';
      else if (s[i].posado) estadoTxt += ' · posado';
      const el = p >= 0 ? elementosRelativos(tr, s, i, p) : null;
      if (el) {
        estadoTxt += ` · ${el.tipo} alrededor de ${ESC.cuerpos[p].nombre}`;
        const ligada = el.tipo === 'circular' || el.tipo === 'elíptica', [Tv, Tu] = tiempoLegible(ligada ? el.periodo : Infinity), m = MEDIDAS[i];
        const e = [
          ['a', '', ligada ? fmt(el.a / U, 5) : '∞', ESC.unidad, 'Semieje mayor de la órbita osculadora|Semi-major axis'],
          ['e', '', el.e < 5e-5 ? '0.0000' : fmt(el.e, 4), '', 'Excentricidad|Eccentricity'],
          ['T', '', Tv, Tu, 'Periodo de la órbita osculadora (tercera ley de Kepler)|Orbital period'],
        ];
        if (m && m.medido) { const [mv, mu] = tiempoLegible(m.T); e.push(['T', 'med', mv, mu, 'Periodo medido en la simulación: primera vuelta completa alrededor del primario|Measured period']); }
        if (ligada) { const [ga, gu] = uG(), ua = ESC.unidad === 'UA'; e.push(['T²/a³', '', fmt((el.periodo / (ua ? ANIO : DIA)) ** 2 / (el.a / ga) ** 3, 5), ua ? 'a²/UA³' : `d²/${gu}³`, 'Cociente de la tercera ley: 4π²/G(M + m), igual para todos los cuerpos del mismo primario|Kepler ratio']); }
        const [ev, eu] = prefijo(el.energia, 'J/kg');
        e.push(['ε', '', ev, eu, 'Energía específica v²/2 − μ/r|Specific orbital energy']);
        e.push(['h', '', fmt(Math.abs(el.h), 4), 'm²/s', 'Momento angular específico: el doble de la velocidad areolar|Specific angular momentum']);
        $('#elementos').innerHTML = e.map(lectura).join('');
        $('#elem-titulo').textContent = `Elementos orbitales · respecto de ${ESC.cuerpos[p].nombre}`;
        f.push(['r', '', fmt(el.r / U, 5), ESC.unidad, `Distancia a ${ESC.cuerpos[p].nombre}|Distance`]);
        f.push(['|v|', '', fmt(el.v / KM, 4), 'km/s', 'Rapidez respecto del primario|Speed']);
        f.push(['v', 'c', fmt(el.vCircular / KM, 4), 'km/s', 'Velocidad circular a esta distancia, √(μ/r)|Circular velocity']);
        f.push(['v', 'e', fmt(el.vEscape / KM, 4), 'km/s', 'Velocidad de escape a esta distancia, √(2μ/r)|Escape velocity']);
        const ex = escenaDe(ESC.clave).extra;
        if (ex && ESC.clave === escenaDe(ESC.clave).clave && ligada) f.push(...ex(i, el));
      } else {
        $('#elementos').innerHTML = '<span class="u" style="grid-column:1/-1">Es el cuerpo dominante: no orbita a ninguno</span>';
        $('#elem-titulo').textContent = 'Elementos orbitales';
        f.push(['|v|', '', fmt(Math.hypot(s[i].vx, s[i].vy) / KM, 4), 'km/s', 'Rapidez respecto del origen|Speed']);
      }
      // Aceleración y fuerza gravitatoria totales
      let ax = 0, ay = 0;
      s.forEach((q, j) => { if (j === i || !q.activo || !(tr.mu[j] > 0)) return; const dx = q.x - s[i].x, dy = q.y - s[i].y, d = Math.hypot(dx, dy); ax += tr.mu[j] * dx / d ** 3; ay += tr.mu[j] * dy / d ** 3; });
      const [av, au] = aceleracionTxt(Math.hypot(ax, ay)), [Fv, Fu] = prefijo(tr.masa[i] * Math.hypot(ax, ay), 'N');
      f.push(['g', '', av, au, 'Aceleración de la gravedad de todos los demás cuerpos|Gravitational acceleration']);
      if (tr.masa[i] > 0) f.push(['F', '', Fv, Fu, 'Fuerza gravitatoria total sobre el cuerpo|Gravitational force']);
      $('#insp-estado').textContent = estadoTxt;
    }
    $('#lecturas').innerHTML = f.map(lectura).join('');
  }
  const PREF = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ']];
  // Prefijo SI hasta T; más allá, potencia de diez (3.627 × 10²² N, no «36.27 ZN»)
  function prefijo(v, u) {
    const a = Math.abs(v);
    if (!Number.isFinite(v) || a === 0) return [fmt(v, 4), u];
    if (a >= 1e15) return [fmt(v, 4), u];
    const [f, p] = PREF.find(([f]) => a >= f * 0.99995) || PREF[PREF.length - 1];
    return [fmt(v / f, 4), p + u];
  }
  // Escala de una gráfica de energías: [factor, unidad] con prefijo hasta T o potencia de diez
  function escalaEnergia(max) {
    if (!(max > 0)) return [1, 'J'];
    if (max >= 1e15) { const e = Math.floor(Math.log10(max)); return [10 ** e, `10${SUP(e)} J`]; }
    const [f, p] = PREF.find(([q]) => max >= q * 0.99995) || [1, ''];
    return [f, p + 'J'];
  }
  function fmtCient(x) {
    if (x === 0 || !Number.isFinite(x)) return '0';
    const e = Math.floor(Math.log10(Math.abs(x))), m = x / 10 ** e;
    return `${m.toFixed(1).replace('-', '−')} × 10${SUP(e)}`;
  }

  function fmtVar(d) { const dec = !(d.paso > 0) || d.paso >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(d.paso) - 1e-9)); return d.val.toFixed(dec).replace('-', '−'); }
  function construirVariables() {
    const cont = $('#variables'); cont.innerHTML = '';
    for (const d of Object.values(ESC.variables)) {
      const f = document.createElement('div'); f.className = 'var';
      f.innerHTML = `${simHTML(d.sim, d.sub)}<input class="deslizador" type="range" min="${d.min}" max="${d.max}" step="${d.paso}" value="${d.val}" aria-label="${d.sim}"><span class="valor"></span>`;
      const ent = f.querySelector('input'), val = f.querySelector('.valor');
      const pintar = () => { val.innerHTML = `${fmtVar(d)}${d.u ? `<span class="u">${d.u}</span>` : ''}`; ent.value = d.val; Volta.pintarDeslizador(ent); };
      ent.addEventListener('input', () => { d.val = parseFloat(ent.value); aplicarVariables(); if (ESC.mantenerCM) llevarAlCM(); pintar(); t = 0; jugando = false; recalcularPronto(); });
      ent.addEventListener('change', () => { if (pendiente) { cancelAnimationFrame(pendiente); pendiente = null; } recalcular(); registrar(); inspector(); });
      pintar(); cont.appendChild(f);
    }
    if (!Object.keys(ESC.variables).length) cont.innerHTML = '<span class="ayuda-fila" style="margin:0">Sin variables: edita los valores en el inspector.</span>';
  }
  function aplicarVariables() {
    for (const d of Object.values(ESC.variables)) for (const r of d.liga) { try { if (typeof leer(r) === 'number') escribir(r, d.val * d.factor); } catch { /* ruta que ya no existe */ } }
  }
  // Al quitar el cuerpo i, las rutas de las variables se corren; las que ya no existen se sueltan
  function limpiarVariables(borrado = null) {
    for (const [k, d] of Object.entries(ESC.variables)) {
      d.liga = d.liga.map(r => {
        const m = /^cuerpos\.(\d+)\.(.+)$/.exec(r);
        if (!m || borrado == null) return r;
        if (+m[1] === borrado) return null;
        return +m[1] > borrado ? `cuerpos.${+m[1] - 1}.${m[2]}` : r;
      }).filter(r => r && typeof leer(r) === 'number');
      if (!d.liga.length) delete ESC.variables[k];
    }
    construirVariables();
  }

  // ---------------------------------------------------------------------
  // Gráficas: T² contra a³ de todos, r(t) y área barrida del seleccionado
  // ---------------------------------------------------------------------
  const vacia = (n, msj) => { grafica($(`#g${n}`), { x: { min: 0, max: 1 }, y: { min: 0, max: 1 }, series: [] }); $(`#t${n}`).textContent = msj; $(`#l${n}`).textContent = ''; };
  function seleccionGrafica() {
    const i = idxDe(sel);
    if (i >= 0 && PRIM0[i] >= 0) return i;
    return PRIM0.findIndex((p, k) => p >= 0 && !ESC.cuerpos[k].fijo);
  }
  function graficas() {
    if ($('#p-graficas').hidden) return;
    if (!SIM) { [1, 2, 3].forEach(n => vacia(n, 'Sin datos')); return; }
    try { graficaKepler(); } catch { vacia(1, 'Sin datos'); }
    const i = seleccionGrafica();
    if (i < 0) { vacia(2, 'Sin órbitas'); vacia(3, 'Sin órbitas'); return; }
    graficaR(i); graficaArea(i);
  }
  function serieTiempo(f) {
    const m = SIM.t.length, salto = Math.max(1, Math.floor(m / 700)), pts = [];
    for (let k = 0; k < m; k += salto) pts.push(f(k));
    if ((m - 1) % salto) pts.push(f(m - 1));
    return pts;
  }
  const fT = () => (DUR >= 2 * ANIO ? [ANIO, 'a'] : DUR >= 3 * DIA ? [DIA, 'd'] : [3600, 'h']);
  // Unidades de las gráficas: en UA, o en Mm (r) y Gm (a³, A) si la escena va en km
  const uR = () => (ESC.unidad === 'UA' ? [UA, 'UA'] : [1e6, 'Mm']);
  const uG = () => (ESC.unidad === 'UA' ? [UA, 'UA'] : [1e9, 'Gm']);
  function graficaKepler() {
    const i = seleccionGrafica(), prim = i >= 0 ? PRIM0[i] : PRIM0.findIndex(p => p === -1);
    const grupo = ESC.cuerpos.map((c, k) => k).filter(k => MEDIDAS[k] && MEDIDAS[k].ligada && PRIM0[k] === prim && Number.isFinite(MEDIDAS[k].T));
    if (!grupo.length || prim < 0) { vacia(1, 'T² contra a³: sin órbitas cerradas'); return; }
    const UA_ = ESC.unidad === 'UA', [ua, uu] = uG(), ut = UA_ ? ANIO : DIA;
    const pts = grupo.map(k => ({ k, x: (MEDIDAS[k].a / ua) ** 3, y: (MEDIDAS[k].T / ut) ** 2, medido: MEDIDAS[k].medido }));
    const xmax = Math.max(...pts.map(q => q.x)), xmin = Math.min(...pts.map(q => q.x));
    const log = xmax / Math.max(xmin, 1e-30) > 300;
    const X = q => (log ? Math.log10(q) : q);
    const mu = MEDIDAS[grupo[0]].mu, kk = 4 * Math.PI ** 2 / mu * ua ** 3 / ut ** 2;
    const xs = pts.map(q => X(q.x)), ys = pts.map(q => X(q.y));
    let x0 = log ? Math.min(...xs) - 0.4 : 0, x1 = Math.max(...xs) + (log ? 0.4 : 0.08 * Math.max(...xs));
    let y0 = log ? Math.min(...ys) - 0.4 : 0, y1 = Math.max(...ys) + (log ? 0.4 : 0.08 * Math.max(...ys));
    if (!(x1 > x0)) x1 = x0 + 1; if (!(y1 > y0)) y1 = y0 + 1;
    const linea = [];
    for (let q = 0; q <= 40; q++) { const xv = x0 + (x1 - x0) * q / 40, real = log ? 10 ** xv : xv; linea.push([xv, X(kk * real)]); }
    $('#t1').innerHTML = `${simHTML('T')}² contra ${simHTML('a')}³ <span class="u">(${UA_ ? 'a²' : 'd²'}, ${uu}³${log ? '; log₁₀' : ''})</span>`;
    const ej = grafica($('#g1'), { x: { min: x0, max: x1 }, y: { min: y0, max: y1 }, series: [{ tramos: [linea], familia: 'texto-3', auxiliar: true }] });
    // Puntos: llenos los medidos, huecos los que aún no dan la vuelta
    const cv = $('#g1'), ctx = cv.getContext('2d'), tk = Volta.leerTokens(), R = cv.getBoundingClientRect();
    ctx.save(); ctx.lineWidth = 1.5;
    const P2 = pts.map(q => ({ ...q, px: ej.X(X(q.x)), py: ej.Y(X(q.y)) }));
    P2.forEach(q => {
      ctx.beginPath(); ctx.arc(q.px, q.py, q.k === i ? 4.5 : 3.5, 0, 2 * Math.PI);
      ctx.fillStyle = q.medido ? tk.tinta : tk.lienzo; ctx.strokeStyle = tk.tinta; ctx.fill(); ctx.stroke();
    });
    // Nombres: el seleccionado primero; cada uno en el primer sitio libre (si no hay, se omite)
    ctx.font = '11px "IBM Plex Sans", sans-serif'; ctx.textBaseline = 'alphabetic';
    const cajas = P2.map(q => [q.px - 5, q.py - 5, 10, 10]);
    const choca = (x, y, w, h) => x < 2 || x + w > R.width - 2 || y < 2 || y + h > R.height - 18 || cajas.some(b => x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]);
    [...P2].sort((a, b) => (b.k === i) - (a.k === i)).forEach(q => {
      const txt = ESC.cuerpos[q.k].nombre, w = ctx.measureText(txt).width;
      const sitio = [[q.px + 7, q.py - 4], [q.px - 7 - w, q.py - 4], [q.px + 7, q.py + 12], [q.px - 7 - w, q.py + 12], [q.px - w / 2, q.py - 8], [q.px - w / 2, q.py + 17]]
        .find(([x, y]) => !choca(x, y - 10, w, 13));
      if (!sitio) return;
      cajas.push([sitio[0], sitio[1] - 10, w, 13]);
      ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.strokeStyle = tk.lienzo; ctx.strokeText(txt, sitio[0], sitio[1]);
      ctx.fillStyle = q.k === i ? tk.texto : tk['texto-2']; ctx.fillText(txt, sitio[0], sitio[1]);
    });
    ctx.restore();
    $('#l1').textContent = '';
  }
  function graficaR(i) {
    const se = serieSel(i), [ft, ut] = fT(), [U, uu] = uR(), p = se.p;
    const r = estado(t), rr = Math.hypot(r[i].x - r[p].x, r[i].y - r[p].y);
    let rmin = Infinity, rmax = 0;
    for (let k = 0; k < se.r.length; k++) { rmin = Math.min(rmin, se.r[k]); rmax = Math.max(rmax, se.r[k]); }
    const pad = Math.max(0.08 * (rmax - rmin), 0.02 * rmax);
    $('#t2').innerHTML = `${simHTML('r')} a ${ESC.cuerpos[p].nombre} <span class="u">(${uu}, ${ut})</span>`;
    grafica($('#g2'), {
      x: { min: 0, max: DUR / ft }, y: { min: Math.max(0, (rmin - pad) / U), max: (rmax + pad) / U },
      series: [{ tramos: [serieTiempo(k => [SIM.t[k] / ft, se.r[k] / U])], familia: 'tinta' }],
      cursor: t / ft, puntoCursor: [t / ft, rr / U], eventos: SIM.eventos.filter(e => e.cuerpo === i && (e.tipo === 'periapsis' || e.tipo === 'apoapsis' || e.tipo === 'vuelta') && e.t > 0).map(e => ({ x: e.t / ft })),
    });
    $('#l2').textContent = cantidad(rr / U, uu, 4);
  }
  function graficaArea(i) {
    const se = serieSel(i), [ft, ut] = fT(), [U, uu] = uG(), A = areaEn(se, t), Amax = se.A[se.A.length - 1];
    $('#t3').innerHTML = `Área barrida ${simHTML('A')} <span class="u">(${uu}², ${ut})</span>`;
    grafica($('#g3'), {
      x: { min: 0, max: DUR / ft }, y: { min: Math.min(0, Amax / (U * U)) * 1.06, max: Math.max(Amax / (U * U), 1e-12) * 1.06 },
      series: [{ tramos: [serieTiempo(k => [SIM.t[k] / ft, se.A[k] / (U * U)])], familia: 'inercia' }],
      cursor: t / ft, puntoCursor: [t / ft, A / (U * U)],
    });
    $('#l3').textContent = cantidad(A / (U * U), uu + '²', 4);
  }
  function energiaPanel() {
    if (!SIM) { $('#barras').innerHTML = ''; return; }
    const s = estado(t), e = energiaN(configEn(t), s), e0 = energiaN(SIM.tramos[0], estado(0)), se = serieEnergia(), [ft, ut] = fT();
    let escala = 0; for (let k = 0; k < se.K.length; k++) escala = Math.max(escala, se.K[k], -se.U[k]);
    const color = f => (f === 'tinta' ? 'var(--tinta)' : `var(--f-${f})`);
    const filas = [['Cinética', 'movimiento', e.K, 'Energía cinética de todos los cuerpos|Kinetic energy'], ['Potencial gravitatoria', 'cambio', e.U, 'Suma de −Gmᵢmⱼ/rᵢⱼ de cada par (cero en el infinito)|Potential energy'], ['Total', 'tinta', e.E, 'Negativa si el sistema está ligado|Total energy']];
    const fusiones = SIM.eventos.filter(x => x.fusion && x.t <= t).length;
    $('#barras').innerHTML = '<div class="barras-tit">Sistema · energía mecánica</div>' + filas.map(([n, fam, val, ay]) => {
      const p = Math.min(50, Math.abs(val) / (escala || 1) * 50), pos = val >= 0 ? `left:50%;width:${p}%` : `left:${50 - p}%;width:${p}%`, [vv, vu] = prefijo(val, 'J');
      return `<div class="barra-e" data-ayuda="${ay}"><span>${n}</span><span class="riel"><i style="${pos};background:${color(fam)}"></i></span><span class="v">${vv} ${vu}</span></div>`;
    }).join('') + `<div class="barras-pie">${fusiones ? 'Tras un choque con fusión se disipa energía. ' : ''}Deriva <span class="sim">E</span> − <span class="sim">E</span><sub>0</sub>: ${fmtCient((e.E - e0.E) / Math.abs(e0.E || 1))} relativo</div>`;
    const [f, uE] = escalaEnergia(escala);
    $('#l4').textContent = `${uE} · ${ut}`;
    const sr = arr => [se.T.map((tt, k) => [tt / ft, arr[k] / f])];
    grafica($('#g4'), {
      x: { min: 0, max: DUR / ft }, y: { min: Math.min(...se.U) / f * 1.06, max: Math.max(Math.max(...se.K) / f * 1.08, 1e-9) },
      series: [{ tramos: sr(se.K), familia: 'movimiento' }, { tramos: sr(se.U), familia: 'cambio' }, { tramos: sr(se.E), familia: 'tinta' }], cursor: t / ft,
    });
  }
  function tablas() {
    if (!SIM) return;
    const U = UN(), nombre = e => {
      const pr = ESC.cuerpos[e.otro]?.preset, ap = NOMBRES_APSIDES[pr] || ['Periapsis', 'Apoapsis'];
      if (e.tipo === 'periapsis') return ap[0]; if (e.tipo === 'apoapsis') return ap[1];
      if (e.tipo === 'vuelta') return `Vuelta ${e.n}`; return e.fusion ? 'Choque y fusión' : 'Impacto';
    };
    const evs = SIM.eventos.slice(0, 400), [ft, ut] = fT();
    $('#t-eventos').innerHTML = `<tr><th>Evento</th><th>Cuerpo</th><th>Respecto de</th><th>t (${ut})</th><th>r (${ESC.unidad})</th><th>|v| (km/s)</th></tr>` +
      evs.map(e => `<tr class="${Math.abs(e.t - t) < DUR / 2000 ? 'actual' : ''}"><td class="texto">${nombre(e)}</td><td class="texto">${ESC.cuerpos[e.cuerpo].nombre}</td><td class="texto">${e.otro >= 0 ? ESC.cuerpos[e.otro].nombre : '—'}</td><td>${fmt(e.t / ft, 6)}</td><td>${fmt(e.r / U, 6)}</td><td>${fmt(e.v / KM, 5)}</td></tr>`).join('');
    const i = seleccionGrafica();
    if (i < 0) { $('#t-datos').innerHTML = ''; return; }
    const p = PRIM0[i];
    let h = `<tr><th>t (${ut})</th><th>x (${ESC.unidad})</th><th>y (${ESC.unidad})</th><th>v<sub>x</sub> (km/s)</th><th>v<sub>y</sub> (km/s)</th><th>r (${ESC.unidad})</th><th>|v| (km/s)</th></tr>`;
    for (let k = 0; k <= 120; k++) {
      const tt = DUR * k / 120, s = estado(tt), q = s[i], o = s[p];
      h += `<tr class="${Math.abs(tt - t) <= DUR / 240 ? 'actual' : ''}"><td>${fmt(tt / ft, 5)}</td><td>${fmt(q.x / U, 5)}</td><td>${fmt(q.y / U, 5)}</td><td>${fmt(q.vx / KM, 4)}</td><td>${fmt(q.vy / KM, 4)}</td><td>${fmt(Math.hypot(q.x - o.x, q.y - o.y) / U, 5)}</td><td>${fmt(Math.hypot(q.vx - o.vx, q.vy - o.vy) / KM, 4)}</td></tr>`;
    }
    $('#t-datos').innerHTML = h;
  }

  // ---------------------------------------------------------------------
  // Ciclo
  // ---------------------------------------------------------------------
  // Línea de tiempo en días o años (la común escribe segundos): solo cambia la
  // etiqueta del evento bajo el cursor, que lleva la unidad de la escena
  class LineaTiempoEscena extends LineaTiempo {
    dibujar() {
      const h = this.hover;
      this.hover = null; super.dibujar(); this.hover = h;
      if (!h) return;
      const g = this.canvas.getContext('2d'), tk = Volta.leerTokens(), y = 22, x0 = this._x(h.t);
      Volta.rombo(g, x0, y - 9, 3.5, tk.tinta);
      g.save(); g.font = '500 11px "IBM Plex Sans", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
      const txt = `${h.nombre} · ${tiempoTxt(h.t * FT)}`, w = g.measureText(txt).width;
      let x = x0 + 8; if (x + w + 12 > this.w) x = x0 - w - 20;
      g.fillStyle = tk.tinta; g.beginPath(); g.roundRect(x, y - 18, w + 12, 18, 4); g.fill();
      g.fillStyle = tk['sobre-tinta']; g.fillText(txt, x + 6, y - 9); g.restore();
    }
  }
  let FT = 1;
  const lt = new LineaTiempoEscena($('#tl'), { duracion: 1, eventos: [], alCambiar: nt => { t = nt * FT; jugando = false; todo(); } });
  function ponerLinea() { FT = fT()[0]; lt.duracion = DUR / FT; lt.simulado = DUR / FT; lt.eventos = eventosLinea(); }
  function eventosLinea() {
    if (!SIM) return [];
    const i = idxDe(sel), nombreDe = e => {
      const ap = NOMBRES_APSIDES[ESC.cuerpos[e.otro]?.preset] || ['Periapsis', 'Apoapsis'];
      return e.tipo === 'periapsis' ? `${ap[0]} de ${ESC.cuerpos[e.cuerpo].nombre}` : e.tipo === 'apoapsis' ? `${ap[1]} de ${ESC.cuerpos[e.cuerpo].nombre}` : e.tipo === 'vuelta' ? `${ESC.cuerpos[e.cuerpo].nombre}: vuelta ${e.n}` : e.fusion ? 'Choque y fusión' : 'Impacto';
    };
    return SIM.eventos.filter(e => e.t > 0 && (e.tipo === 'impacto' || (e.tipo === 'vuelta' && (e.n === 1 || e.cuerpo === i)) || (e.cuerpo === i && (e.tipo === 'periapsis' || e.tipo === 'apoapsis')))).slice(0, 300).map(e => ({ t: e.t / FT, nombre: nombreDe(e) }));
  }
  function todo() {
    dibujar(); lecturas(); lt.poner(t / FT); graficas();
    if (!$('#p-energia').hidden) energiaPanel();
    if (!$('#p-eventos').hidden || !$('#p-tabla').hidden) tablas();
  }
  function recalcular() {
    simular();
    t = Math.min(t, DUR);
    ponerLinea();
    if (!vistaTocada) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); }
    todo();
    if (SIM && SIM.incompleta) avisar(`La simulación se detuvo en t = ${tiempoTxt(SIM.incompleta.t)}: ${SIM.incompleta.motivo}`, false);
    if (autoguardar) autoguardado.guardar(CLAVE_AUTO, escenaActual());
  }
  function cambio() { aplicarVariables(); recalcular(); registrar(); inspector(); }
  function titulo() {
    $('#escena-nombre').textContent = ESC.titulo;
    const chip = $('#escena-chip');
    chip.textContent = ESC.tipo === 'MEXT' ? `MEXT ${ESC.anio || ''}`.trim() : ESC.tipo || 'Propio';
    chip.className = 'chip' + (ESC.tipo === 'MEXT' ? ' lleno' : '');
    document.title = `Volta · Sistema solar · ${ESC.titulo}`;
    document.querySelectorAll('.capa-btn').forEach(b => b.setAttribute('aria-pressed', String(!!ESC.capas[b.dataset.capa])));
    document.querySelectorAll('#b-escala button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === ESC.escala)));
    $('#b-modo').textContent = { auto: 'Automático', adaptativo: 'Adaptativo', yoshida4: 'Simpléctico' }[ESC.integrador];
    marcarHerramienta();
  }
  let relojAviso = null;
  function avisar(txt, conDeshacer = true) {
    $('#aviso-texto').textContent = txt; $('#aviso').hidden = false;
    $('#aviso-deshacer').hidden = !conDeshacer || !historial?.puedeDeshacer;
    clearTimeout(relojAviso); relojAviso = setTimeout(() => { $('#aviso').hidden = true; }, conDeshacer ? 5000 : 6000);
  }
  $('#aviso-deshacer').addEventListener('click', () => deshacer());
  // Escalas de los vectores del seleccionado: su rapidez y su aceleración
  // máximas en todo el recorrido miden 90 y 70 px (fijas durante la reproducción)
  function escalasVector() {
    const i = idxDe(sel);
    kV = 1; kA = 1;
    if (i < 0 || !SIM) return;
    const p = PRIM0[i], m = SIM.t.length, paso = Math.max(1, Math.floor(m / 500));
    let vmax = 0, amax = 0;
    for (let k = 0; k < m; k += paso) {
      const s = estadoMuestra(SIM, k), tr = tramoEn(SIM, k);
      if (!s[i].activo || s[i].posado) continue;
      vmax = Math.max(vmax, p >= 0 ? Math.hypot(s[i].vx - s[p].vx, s[i].vy - s[p].vy) : Math.hypot(s[i].vx, s[i].vy));
      let ax = 0, ay = 0;
      s.forEach((q, j) => { if (j === i || !q.activo || !(tr.mu[j] > 0)) return; const dx = q.x - s[i].x, dy = q.y - s[i].y, d = Math.hypot(dx, dy); ax += tr.mu[j] * dx / d ** 3; ay += tr.mu[j] * dy / d ** 3; });
      amax = Math.max(amax, Math.hypot(ax, ay));
    }
    kV = vmax > 0 ? 90 / (vmax / KM) : 1;
    kA = amax > 0 ? 70 / amax : 1;
  }

  // ---------------------------------------------------------------------
  // Ediciones
  // ---------------------------------------------------------------------
  const nuevoId = () => { let id; do { id = 'c' + (++contador); } while (cDe(id)); return id; };
  function nombreNuevo(base) { if (!ESC.cuerpos.some(c => c.nombre === base)) return base; let k = 2; while (ESC.cuerpos.some(c => c.nombre === `${base} ${k}`)) k++; return `${base} ${k}`; }
  // Primario de un punto: el masivo que domina allí (esferas de Hill de la escena en t = 0)
  function dominanteEn(p) {
    const cs = ESC.cuerpos.map(c => ({ mu: c.prueba ? 0 : G * c.masa, x: c.p[0], y: c.p[1] }));
    const prim = primarios([...cs, { mu: 0, x: p[0], y: p[1] }], [...cs, { x: p[0], y: p[1] }]);
    return prim[cs.length];
  }
  // Velocidad (absoluta) de la órbita circular alrededor de j en el punto p
  function velocidadCircularEn(p, j, masaPropia = 0) {
    const c = ESC.cuerpos[j], dx = p[0] - c.p[0], dy = p[1] - c.p[1], r = Math.hypot(dx, dy);
    if (!(r > 0)) return [c.v[0], c.v[1]];
    const mu = G * (c.masa + (c.fijo ? 0 : masaPropia)), v = Math.sqrt(mu / r);
    return [c.v[0] - dy / r * v, c.v[1] + dx / r * v];
  }
  function crear(h, p) {
    const j = dominanteEn(p);
    let c;
    if (h === 'planeta') {
      const pr = PRESETS[presetElegido];
      c = cuerpo(nombreNuevo(pr.nombre), 'planeta', pr.masa, pr.radio, p, [0, 0], { preset: presetElegido });
    } else if (h === 'masivo') {
      const ref = j >= 0 ? ESC.cuerpos[j].masa : MSOL;
      c = cuerpo(nombreNuevo('Cuerpo'), 'masivo', Number((0.001 * ref).toPrecision(2)), 0, p, [0, 0]);
      c.radio = Math.cbrt(3 * c.masa / (4 * Math.PI * 1300));
    } else c = cuerpo(nombreNuevo('Satélite'), 'satelite', 1000, 0, p, [0, 0], { prueba: true });
    if (j >= 0) c.v = velocidadCircularEn(p, j, c.prueba ? 0 : c.masa);
    c.id = nuevoId();
    ESC.cuerpos.push(c); sel = c.id; t = 0; jugando = false;
    cambio(); escalasVector(); todo();
    avisar(j >= 0 ? `${c.nombre} en órbita circular alrededor de ${ESC.cuerpos[j].nombre}` : `${c.nombre} colocado`);
  }
  function orbitaCircular(i) {
    const p = PRIM0[i]; if (p < 0) return;
    const c = ESC.cuerpos[i]; c.v = velocidadCircularEn(c.p, p, c.prueba ? 0 : c.masa);
  }
  function quitarSeleccion() {
    if (sel === 'regla') { ESC.regla = null; sel = 'escena'; cambio(); avisar('Se quita la regla'); return; }
    const i = idxDe(sel); if (i < 0) return;
    const nombre = ESC.cuerpos[i].nombre;
    ESC.cuerpos.splice(i, 1); limpiarVariables(i); sel = 'escena';
    cambio(); avisar(`Se quita ${nombre}`);
  }
  function duplicar() {
    const c = cDe(sel); if (!c) return;
    const d = copia(c), U = UN(), off = 24 / tz.vista.escala * U;
    d.id = nuevoId(); d.nombre = nombreNuevo(c.nombre); d.p = [c.p[0] + off, c.p[1] - off];
    const j = dominanteEn(d.p); if (j >= 0 && !d.fijo) d.v = velocidadCircularEn(d.p, j, d.prueba ? 0 : d.masa);
    ESC.cuerpos.push(d); sel = d.id; cambio(); avisar(`${d.nombre} duplicado`);
  }
  function llevarAlCM() {
    const cs = ESC.cuerpos.map(c => ({ masa: c.masa, mu: c.prueba ? 0 : G * c.masa, fijo: c.fijo, x: c.p[0], y: c.p[1], vx: c.v[0], vy: c.v[1] }));
    aBaricentro(cs);
    cs.forEach((q, i) => { ESC.cuerpos[i].p = [q.x, q.y]; ESC.cuerpos[i].v = [q.vx, q.vy]; });
  }
  // Descendientes de i (los que lo tienen por primario, y los de esos): se arrastran con él
  function descendientes(i) {
    const r = new Set([i]);
    let cambio_ = true;
    while (cambio_) { cambio_ = false; PRIM0.forEach((p, k) => { if (r.has(p) && !r.has(k)) { r.add(k); cambio_ = true; } }); }
    r.delete(i); return [...r];
  }

  // ---------------------------------------------------------------------
  // Escena: guardar, abrir, autoguardado y deshacer. Lo que llega de un
  // archivo se valida y se acota (entrada no confiable).
  // ---------------------------------------------------------------------
  const instantanea = () => { const o = copia(ESC); o.sel = sel; return o; };
  const sinSel = o => { delete o.sel; return o; };
  function escenaActual() { return crearEscena({ modulo: 'gravitacion', espacio: ESPACIO, titulo: ESC.titulo, datos: instantanea() }); }
  const RUTA_OK = /^cuerpos\.\d{1,2}\.(masa|radio|p\.[01]|v\.[01])$/;
  function datosSeguros(d = {}) {
    const base = ESCENAS.find(e => e.clave === d.clave), b = BASE();
    const cuerpos = [], ids = new Set();
    for (const o of (Array.isArray(d.cuerpos) ? d.cuerpos : []).slice(0, 30)) {
      if (!o || typeof o !== 'object') continue;
      let id = texto(o.id, '', 8); if (!/^c\d{1,4}$/.test(id) || ids.has(id)) { do { id = 'c' + (++contador); } while (ids.has(id)); }
      ids.add(id);
      const tipo = TIPOS[o.tipo] ? o.tipo : 'masivo';
      const par = (q, lim) => (Array.isArray(q) && q.length === 2 ? [numero(q[0], 0, -lim, lim), numero(q[1], 0, -lim, lim)] : [0, 0]);
      cuerpos.push({
        id, tipo, nombre: texto(o.nombre, TIPOS[tipo].nombre, 24), masa: numero(o.masa, MTIERRA, 0, 1e33), radio: numero(o.radio, 0, 0, 1e10),
        p: par(o.p, 1e14), v: par(o.v, 1e6), prueba: !!o.prueba, fijo: !!o.fijo, preset: PRESETS[o.preset] ? o.preset : undefined,
      });
    }
    const variables = {};
    for (const [k, v] of Object.entries(d.variables && typeof d.variables === 'object' ? d.variables : {})) {
      if (!v || !Array.isArray(v.liga) || !/^[A-Za-z]\w{0,7}$/.test(k)) continue;
      const min = numero(v.min, 0, -1e9, 1e9), max = Math.max(min, numero(v.max, 1, -1e9, 1e9));
      const liga = v.liga.filter(r => typeof r === 'string' && RUTA_OK.test(r) && +r.split('.')[1] < cuerpos.length);
      if (!liga.length) continue;
      variables[k] = { sim: texto(v.sim, k, 3), sub: v.sub ? texto(v.sub, '', 4) : undefined, val: numero(v.val, min, min, max), min, max, paso: numero(v.paso, 0.1, 1e-9, 1e9), u: texto(v.u, '', 6), factor: numero(v.factor, 1, -1e35, 1e35) || 1, liga };
    }
    const capas = {};
    for (const k of Object.keys(b.capas)) capas[k] = typeof d.capas?.[k] === 'boolean' ? d.capas[k] : !!b.capas[k];
    const regla = Array.isArray(d.regla) && d.regla.length === 2 && d.regla.every(q => Array.isArray(q) && q.length === 2) ? d.regla.map(q => [numero(q[0], 0, -1e14, 1e14), numero(q[1], 0, -1e14, 1e14)]) : null;
    return {
      clave: base ? base.clave : 'propio', titulo: texto(d.titulo, base ? base.titulo : 'Escena propia', 80),
      tipo: ['Tutorial', 'Ejemplo', 'MEXT', 'Propio'].includes(d.tipo) ? d.tipo : 'Propio', anio: d.anio ? texto(d.anio, '', 14) : undefined,
      ref: d.ref ? texto(d.ref, '', 140) : undefined, nota: null,
      unidad: d.unidad === 'km' ? 'km' : 'UA', escala: d.escala === 'log' ? 'log' : 'lineal',
      integrador: ['auto', 'adaptativo', 'yoshida4'].includes(d.integrador) ? d.integrador : 'auto',
      duracion: numero(d.duracion, ANIO, 60, 500 * ANIO), seg: numero(d.seg, 24, 4, 120), mantenerCM: !!d.mantenerCM,
      cuerpos, variables, capas, regla,
      sel: typeof d.sel === 'string' && (d.sel === 'escena' || cuerpos.some(c => c.id === d.sel)) ? d.sel : 'escena',
    };
  }
  function restaurar(d) {
    ESC = datosSeguros(d); aplicarVariables();
    if (!(sel === 'escena' || (sel === 'regla' && ESC.regla) || cDe(sel))) sel = ESC.sel || 'escena';
    titulo(); construirVariables(); radioLog(); recalcular(); escalasVector(); inspector(); todo();
  }
  function botonesHistorial() { $('#b-deshacer').disabled = !historial?.puedeDeshacer; $('#b-rehacer').disabled = !historial?.puedeRehacer; }
  function registrar() { if (historial && historial.registrar(sinSel(instantanea()))) botonesHistorial(); }
  function deshacer() { const d = historial?.deshacer(); if (d) { restaurar(d); botonesHistorial(); avisar('Cambio deshecho', false); } }
  function rehacer() { const d = historial?.rehacer(); if (d) { restaurar(d); botonesHistorial(); avisar('Cambio rehecho', false); } }
  $('#b-deshacer').addEventListener('click', deshacer);
  $('#b-rehacer').addEventListener('click', rehacer);

  async function abrirEscena1(clave) {
    if (hayCambios() && !(await confirmarCambios('cambiar de escena'))) return;
    ESC = completa(escenaDe(clave)); aplicarVariables();
    sel = ESC.sel || 'escena'; vistaTocada = false; herramienta = null; t = 0; jugando = false;
    titulo(); construirVariables(); radioLog(); recalcular(); escalasVector(); inspector(); todo();
    escala0 = tz.vista.escala; zoomTexto();
    if (historial) { historial.reiniciar(sinSel(instantanea())); botonesHistorial(); }
    if (ESC.nota) avisar(ESC.nota, false);
    documentoNuevo();
  }
  function guardar() { guardarEscena(escenaActual()).then(r => { if (r) avisar('Escena guardada', false); }, e => avisar(`No se pudo guardar: ${e}`, false)); }
  const PAGINAS = { orbitas: 'gravitacion.html', 'sistema-solar': 'gravitacion-sistema-solar.html', maniobras: 'gravitacion-maniobras.html' };
  // Una escena de otro espacio de Gravitación se abre en su pantalla
  function aOtroEspacio(e, propio) {
    const esp = e.espacio || 'orbitas';
    if (esp === propio || !PAGINAS[esp]) return false;
    try { sessionStorage.setItem('volta.abrir', JSON.stringify(e)); } catch { /* sin almacenamiento */ }
    location.href = PAGINAS[esp];
    return true;
  }
  function abrir() {
    abrirEscena({ modulo: 'gravitacion' }).then(e => {
      if (aOtroEspacio(e, ESPACIO)) return;
      sel = 'escena'; t = 0; jugando = false; vistaTocada = false; restaurar(e.datos); encuadrar(); escala0 = tz.vista.escala; zoomTexto(); todo();
      if (historial) { historial.reiniciar(sinSel(instantanea())); botonesHistorial(); }
      avisar(`Escena abierta: ${texto(e.titulo, 'sin título', 60)}`, false);
    }).catch(err => avisar(err.message, false));
  }

  // ---------------------------------------------------------------------
  // Paleta, instrumentos, capas, escala y reproducción
  // ---------------------------------------------------------------------
  const INSTRUMENTOS = { periodo: 'periodos', velocimetro: 'velocidades' };
  function marcarHerramienta() {
    document.querySelectorAll('.herr[data-herr]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.herr === herramienta || (INSTRUMENTOS[b.dataset.herr] && !!ESC.capas[INSTRUMENTOS[b.dataset.herr]]))));
    lienzo.style.cursor = herramienta ? 'crosshair' : 'default';
  }
  function ponerHerramienta(h) {
    if (INSTRUMENTOS[h]) {
      alternarCapa(INSTRUMENTOS[h]);
      avisar(h === 'periodo' ? (ESC.capas.periodos ? 'Periodo medido de cada cuerpo al completar su primera vuelta' : 'Sin periodos') : (ESC.capas.velocidades ? 'Rapidez de cada cuerpo respecto de su primario' : 'Sin velocímetro'), false);
      return;
    }
    if (h === 'regla' && ESC.escala === 'log') { avisar('La regla mide en la escala lineal: cambia la escala a «Lineal»', false); return; }
    herramienta = herramienta === h ? null : h; marcarHerramienta();
    if (herramienta === 'planeta') { menuPresets(); return; }
    if (herramienta === 'regla') avisar('Regla: arrastra entre dos puntos · Esc termina', false);
    else if (herramienta) avisar(`${document.querySelector(`.herr[data-herr="${h}"] span`).textContent}: clic en el lienzo para colocarlo · Esc termina`, false);
  }
  document.querySelectorAll('.herr[data-herr]').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); ponerHerramienta(b.dataset.herr); }));
  // Menú de planetas con datos reales
  function menuPresets() {
    const m = $('#menu-flotante'), b = document.querySelector('.herr[data-herr="planeta"]').getBoundingClientRect();
    m.innerHTML = '<div class="menu-titulo">Planeta con datos reales</div>' + Object.entries(PRESETS).map(([k, p]) =>
      `<div class="menu-item" role="menuitem" data-v="${k}"${k === presetElegido ? ' aria-current="true"' : ''}><svg class="ico"><use href="#o-planeta"/></svg>${p.nombre}<span class="atajo">${masaCorta(p.masa)}</span></div>`).join('');
    m.style.left = (b.right + 6) + 'px'; m.style.top = b.top + 'px'; m.hidden = false;
    m.onclick = ev => {
      const it = ev.target.closest('.menu-item'); if (!it) return;
      presetElegido = it.dataset.v; m.hidden = true;
      herramienta = 'planeta'; marcarHerramienta();
      avisar(`${PRESETS[presetElegido].nombre}: clic en el lienzo para colocarlo · Esc termina`, false);
    };
  }
  function ponerCapa(k, on) { ESC.capas[k] = on; document.querySelectorAll(`.capa-btn[data-capa="${k}"]`).forEach(b => b.setAttribute('aria-pressed', String(on))); marcarHerramienta(); }
  const alternarCapa = k => { ponerCapa(k, !ESC.capas[k]); registrar(); todo(); };
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => alternarCapa(b.dataset.capa)));
  function ponerEscala(v) {
    if (v === ESC.escala) return;
    ESC.escala = v; vistaTocada = false;
    document.querySelectorAll('#b-escala button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    if (v === 'log' && herramienta === 'regla') { herramienta = null; marcarHerramienta(); }
    encuadrar(); escala0 = tz.vista.escala; zoomTexto(); registrar(); todo();
    avisar(v === 'log' ? 'Escala logarítmica: la distancia al centro de masa se comprime; los anillos marcan 0.1, 1, 10… UA' : 'Escala lineal', false);
  }
  $('#b-escala').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) ponerEscala(b.dataset.v); });
  function alternarIntegrador() {
    const orden = ['auto', 'adaptativo', 'yoshida4'];
    ESC.integrador = orden[(orden.indexOf(ESC.integrador) + 1) % 3];
    titulo(); cambio();
    avisar({ auto: 'Integrador automático: simpléctico, y adaptativo en los encuentros cercanos', adaptativo: 'Integrador adaptativo (Bulirsch–Stoer) en todo el recorrido', yoshida4: 'Integrador simpléctico de Yoshida de paso fijo' }[ESC.integrador], false);
  }
  $('#b-modo').addEventListener('click', alternarIntegrador);
  $('#pest').addEventListener('click', () => setTimeout(todo, 0));

  function cuadro(ahora) {
    if (jugando) {
      const d = Math.min(0.05, (ahora - ultimo) / 1000) * velocidad * DUR / ESC.seg;
      t = Math.min(DUR, t + d);
      if (t >= DUR) jugando = false;
      todo();
    }
    ultimo = ahora;
    requestAnimationFrame(cuadro);
  }
  function alternar() { if (t >= DUR) t = 0; jugando = !jugando; todo(); }
  const irA = nt => { jugando = false; t = Math.max(0, Math.min(DUR, nt)); todo(); };
  const pasoT = () => DUR / 400;
  $('#b-play').addEventListener('click', alternar);
  $('#b-reiniciar').addEventListener('click', () => irA(0));
  $('#b-atras').addEventListener('click', () => irA(t - pasoT()));
  $('#b-adelante').addEventListener('click', () => irA(t + pasoT()));
  $('#velocidades').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) velocidad = parseFloat(b.dataset.v); });

  // ---------------------------------------------------------------------
  // Lienzo: colocar, seleccionar, arrastrar, zoom y paneo
  // ---------------------------------------------------------------------
  function objetoEn(X, Y) {
    const i0 = idxDe(sel);
    // Asa de la velocidad del seleccionado (en t = 0)
    if (t === 0 && i0 >= 0 && ESC.capas.vectores && !ESC.cuerpos[i0].fijo && SIM) {
      const a = puntaVelocidad(i0);
      if (a && Math.hypot(X - a[0], Y - a[1]) < 9) return { id: ESC.cuerpos[i0].id, asa: 'velocidad' };
    }
    if (ESC.regla) { const [a, b] = ESC.regla.map(P); for (const [k, q] of [a, b].entries()) if (Math.hypot(X - q[0], Y - q[1]) < 7) return { id: 'regla', asa: k }; }
    let mejor = null, dm = Infinity;
    POS.forEach(([x, y, r, activo], i) => { if (!activo) return; const d = Math.hypot(X - x, Y - y); if (d < Math.max(r, 6) + 5 && d < dm) { dm = d; mejor = { id: ESC.cuerpos[i].id }; } });
    if (mejor) return mejor;
    if (ESC.regla) { const [a, b] = ESC.regla.map(P); if (distSeg([X, Y], a, b) < 6) return { id: 'regla' }; }
    return null;
  }
  const distSeg = (q, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, s = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)) : 0; return Math.hypot(q[0] - a[0] - s * dx, q[1] - a[1] - s * dy); };
  // Punta del vector velocidad (relativa al primario) del cuerpo i en t = 0, en pantalla
  function puntaVelocidad(i) {
    const s = estado(0), p = PRIM0[i], vr = p >= 0 ? [s[i].vx - s[p].vx, s[i].vy - s[p].vy] : [s[i].vx, s[i].vy], m = Math.hypot(...vr);
    if (!(m > 0) || !POS[i]) return null;
    const [x, y, r] = POS[i], d = Math.max(r, 4.5) + 1, ux = vr[0] / m, uy = -vr[1] / m;
    return [x + ux * d + vr[0] / KM * kV, y + uy * d - vr[1] / KM * kV, x + ux * d, y + uy * d];
  }
  const mundo = (X, Y) => Winv([tz.vista.mx(X), tz.vista.my(Y)]);
  lienzo.addEventListener('pointerdown', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, v = tz.vista;
    $('#menu-flotante').hidden = true;
    if (ev.button === 1 || ev.button === 2 || espacioPulsado) { paneo = [X, Y, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId); return; }
    const w = mundo(X, Y);
    if (herramienta === 'regla') { ESC.regla = [w, w.slice()]; arrastre = { tipo: 'regla-nueva' }; lienzo.setPointerCapture(ev.pointerId); return; }
    if (herramienta) { const h = herramienta; if (!ev.shiftKey) { herramienta = null; marcarHerramienta(); } crear(h, w); return; }
    const ob = objetoEn(X, Y);
    if (ob && ob.id === 'regla') { if (sel !== 'regla') seleccionar('regla'); arrastre = { tipo: ob.asa != null ? 'regla:' + ob.asa : 'regla', w0: w, r0: copia(ESC.regla) }; lienzo.setPointerCapture(ev.pointerId); return; }
    if (ob) {
      if (sel !== ob.id) seleccionar(ob.id);
      const i = idxDe(ob.id), c = ESC.cuerpos[i];
      if (t !== 0) { t = 0; jugando = false; avisar('Las condiciones iniciales se editan en t = 0', false); }
      const desc = descendientes(i).map(k => ({ k, p: ESC.cuerpos[k].p.slice(), v: ESC.cuerpos[k].v.slice() }));
      arrastre = { tipo: ob.asa || 'mover', i, w0: w, p0: c.p.slice(), v0: c.v.slice(), desc, movido: false };
      lienzo.setPointerCapture(ev.pointerId); todo(); return;
    }
    seleccionar('escena');
    paneo = [X, Y, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId);
  });
  lienzo.addEventListener('pointermove', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, v = tz.vista, w = mundo(X, Y);
    $('#cx').textContent = L(w[0], 4); $('#cy').textContent = L(w[1], 4);
    if (paneo) { vistaTocada = true; v.ox = paneo[2] + X - paneo[0]; v.oy = paneo[3] + Y - paneo[1]; dibujar(); return; }
    if (arrastre) {
      const a = arrastre;
      if (a.tipo === 'regla-nueva') ESC.regla[1] = w;
      else if (a.tipo === 'regla:0' || a.tipo === 'regla:1') ESC.regla[+a.tipo.slice(6)] = w;
      else if (a.tipo === 'regla') { const dx = w[0] - a.w0[0], dy = w[1] - a.w0[1]; ESC.regla = a.r0.map(q => [q[0] + dx, q[1] + dy]); }
      else if (a.tipo === 'mover') moverCuerpo(a, w);
      else if (a.tipo === 'velocidad') arrastrarVelocidad(a, X, Y, ev.shiftKey);
      a.movido = true;
      if (a.tipo.startsWith('regla')) dibujar(); else recalcularPronto();
      return;
    }
    if (herramienta) return;
    const ob = objetoEn(X, Y), h = ob ? ob.id : null;
    lienzo.style.cursor = ob ? (ob.asa === 'velocidad' ? 'grab' : 'move') : 'default';
    if (h !== hover) { hover = h; dibujar(); }
  });
  // Mover un cuerpo: su velocidad respecto del primario gira y escala con la
  // posición (la órbita conserva su forma); sus satélites lo acompañan
  function moverCuerpo(a, w) {
    const c = ESC.cuerpos[a.i], p = PRIM0[a.i], np = [a.p0[0] + w[0] - a.w0[0], a.p0[1] + w[1] - a.w0[1]];
    let nv = a.v0.slice();
    if (p >= 0 && !c.fijo) {
      const q = ESC.cuerpos[p], r0 = [a.p0[0] - q.p[0], a.p0[1] - q.p[1]], r1 = [np[0] - q.p[0], np[1] - q.p[1]];
      const d0 = Math.hypot(...r0), d1 = Math.hypot(...r1);
      if (d0 > 0 && d1 > 0) {
        const giro = Math.atan2(r1[1], r1[0]) - Math.atan2(r0[1], r0[0]), k = Math.sqrt(d0 / d1), cg = Math.cos(giro), sg = Math.sin(giro);
        const vr = [a.v0[0] - q.v[0], a.v0[1] - q.v[1]];
        nv = [q.v[0] + k * (vr[0] * cg - vr[1] * sg), q.v[1] + k * (vr[0] * sg + vr[1] * cg)];
      }
    }
    c.p = np; if (!c.fijo) c.v = nv;
    for (const d of a.desc) { const o = ESC.cuerpos[d.k]; o.p = [d.p[0] + np[0] - a.p0[0], d.p[1] + np[1] - a.p0[1]]; if (!o.fijo) o.v = [d.v[0] + nv[0] - a.v0[0], d.v[1] + nv[1] - a.v0[1]]; }
  }
  function arrastrarVelocidad(a, X, Y, fino) {
    const c = ESC.cuerpos[a.i], p = PRIM0[a.i], base = puntaVelocidad(a.i);
    if (!base) return;
    const bx = base[2], by = base[3], ref = p >= 0 ? ESC.cuerpos[p].v : [0, 0];
    const paso = fino ? 0.001 : 0.01;
    const vr = [Math.round((X - bx) / kV / paso) * paso * KM, Math.round((by - Y) / kV / paso) * paso * KM];
    const nv = [ref[0] + vr[0], ref[1] + vr[1]];
    for (const d of a.desc) { const o = ESC.cuerpos[d.k]; if (!o.fijo) o.v = [d.v[0] + nv[0] - a.v0[0], d.v[1] + nv[1] - a.v0[1]]; }
    c.v = nv;
  }
  lienzo.addEventListener('pointerup', () => {
    if (arrastre) {
      const a = arrastre; arrastre = null;
      if (a.tipo === 'regla-nueva') {
        const [p, q] = ESC.regla;
        if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9 * UN()) ESC.regla = null;
        herramienta = null; marcarHerramienta(); sel = ESC.regla ? 'regla' : 'escena'; registrar(); inspector(); todo();
      } else if (a.tipo.startsWith('regla')) { registrar(); arbol(); todo(); }
      else if (a.movido) { if (pendiente) { cancelAnimationFrame(pendiente); pendiente = null; } cambio(); } else todo();
    }
    paneo = null;
  });
  lienzo.addEventListener('pointerleave', () => { if (hover) { hover = null; dibujar(); } });
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
  // Exportar: estado de todos los cuerpos (CSV en SI) e imagen del lienzo
  // ---------------------------------------------------------------------
  function exportarCSV() {
    if (!SIM) return;
    const cols = ['t (s)'];
    ESC.cuerpos.forEach(c => cols.push(`${c.nombre} x (m)`, `${c.nombre} y (m)`, `${c.nombre} vx (m/s)`, `${c.nombre} vy (m/s)`));
    cols.push('Ek (J)', 'U (J)', 'E (J)');
    const filas = muestrear(0, DUR, DUR / 1000, tt => {
      const s = estado(tt), e = energiaN(configEn(tt), s), f = [tt];
      s.forEach(q => f.push(q.x, q.y, q.vx, q.vy));
      return [...f, e.K, e.U, e.E];
    });
    descargarTexto(`${nombreArchivo(ESC.titulo)}-datos.csv`, aCSV(cols, filas)).then(r => { if (r) avisar(`Datos exportados: ${filas.length} filas`, false); });
  }
  function exportarEventos() {
    if (!SIM) return;
    const filas = SIM.eventos.map(e => [e.tipo, ESC.cuerpos[e.cuerpo].nombre, e.otro >= 0 ? ESC.cuerpos[e.otro].nombre : '', e.t, e.r, e.v]);
    descargarTexto(`${nombreArchivo(ESC.titulo)}-eventos.csv`, aCSV(['Evento', 'Cuerpo', 'Respecto de', 't (s)', 'r (m)', 'v (m/s)'], filas)).then(r => { if (r) avisar(`Eventos exportados: ${filas.length}`, false); });
  }
  function exportarPNG() { descargarLienzo(lienzo, `${nombreArchivo(ESC.titulo)}.png`).then(r => { if (r) avisar('Imagen del lienzo exportada', false); }); }
  $('#b-exportar').addEventListener('click', exportarCSV);

  // ---------------------------------------------------------------------
  // Menú de escenas y paleta de comandos
  // ---------------------------------------------------------------------
  const ICONO_TIPO = { Tutorial: 'i-tutorial', Ejemplo: 'i-ejemplo', MEXT: 'i-mext' };
  function menuEscenas() {
    const m = $('#menu-escenas');
    if (!m.hidden) { m.hidden = true; return; }
    m.innerHTML = [['Tutorial', 'Tutoriales'], ['Ejemplo', 'Ejemplos'], ['MEXT', 'MEXT (también en Órbitas)']].map(([g, tit], i) => (i ? '<div class="menu-sep"></div>' : '') + `<div class="menu-titulo">${tit}</div>` + ESCENAS.filter(e => e.tipo === g).map(e =>
      `<div class="menu-item" role="menuitem" data-clave="${e.clave}"${ESC.clave === e.clave ? ' aria-current="true"' : ''}><svg class="ico"><use href="#${ICONO_TIPO[g]}"/></svg>${e.titulo}${e.anio ? `<span class="chip lleno">${e.anio}</span>` : ''}</div>`).join('')).join('');
    const r = $('#b-escenas').getBoundingClientRect();
    m.style.left = r.left + 'px'; m.style.top = (r.bottom + 4) + 'px'; m.hidden = false;
  }
  $('#b-escenas').addEventListener('click', ev => { ev.stopPropagation(); menuEscenas(); });
  $('#menu-escenas').addEventListener('click', ev => { const it = ev.target.closest('.menu-item'); if (!it) return; $('#menu-escenas').hidden = true; abrirEscena1(it.dataset.clave); });
  document.addEventListener('pointerdown', ev => {
    if (!(ev.target instanceof Element)) return;
    if (!ev.target.closest('#menu-escenas, #b-escenas')) $('#menu-escenas').hidden = true;
    if (!ev.target.closest('#menu-flotante, .herr')) { if (!$('#menu-flotante').hidden && herramienta === 'planeta' && !ev.target.closest('#lienzo')) { herramienta = null; marcarHerramienta(); } $('#menu-flotante').hidden = true; }
  });

  const COMANDOS = [
    ['i-reproducir', 'Reproducir o pausar', 'Espacio', alternar],
    ['i-reiniciar', 'Volver al instante inicial', 'Inicio', () => irA(0)],
    ['i-encuadrar', 'Encuadrar todo', 'F', encuadrarTodo],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['i-cuadricula', 'Escala de distancias lineal o logarítmica', 'L', () => ponerEscala(ESC.escala === 'log' ? 'lineal' : 'log')],
    ['i-capas', 'Mostrar u ocultar las trazas', 'T', () => alternarCapa('trazas')],
    ['i-capas', 'Mostrar u ocultar las órbitas predichas', 'O', () => alternarCapa('orbitas')],
    ['i-energia', 'Mostrar u ocultar las áreas barridas', 'A', () => alternarCapa('areas')],
    ['o-cuerpo-masivo', 'Mostrar u ocultar el centro de masa', 'C', () => alternarCapa('cm')],
    ['n-periodo', 'Periodo medido de cada cuerpo', 'P', () => ponerHerramienta('periodo')],
    ['n-velocimetro', 'Rapidez de cada cuerpo', 'V', () => ponerHerramienta('velocimetro')],
    ['n-regla', 'Medir con la regla', 'R', () => ponerHerramienta('regla')],
    ['i-precision', 'Cambiar de integrador (automático, adaptativo, simpléctico)', 'M', alternarIntegrador],
    ['o-cuerpo-masivo', 'Llevar el sistema al centro de masa', '', () => { llevarAlCM(); cambio(); }],
    ['o-satelite', 'Órbita circular para el cuerpo seleccionado', '', () => { const i = idxDe(sel); if (i >= 0) { orbitaCircular(i); cambio(); } }],
    ['i-duplicar', 'Duplicar el cuerpo seleccionado', 'Ctrl D', duplicar],
    ['i-borrar', 'Quitar el cuerpo seleccionado', 'Supr', quitarSeleccion],
    ['i-historial', 'Restablecer la escena original', '', () => { if (ESCENAS.some(e => e.clave === ESC.clave)) { abrirEscena1(ESC.clave); avisar('Escena original restablecida', false); } }],
    ['i-deshacer', 'Deshacer', 'Ctrl Z', deshacer],
    ['i-rehacer', 'Rehacer', 'Ctrl Y', rehacer],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar],
    ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
    ['i-exportar', 'Exportar el estado de los cuerpos a CSV', '', exportarCSV],
    ['i-tabla', 'Exportar los eventos a CSV', '', exportarEventos],
    ['i-imagen', 'Exportar imagen del lienzo', '', exportarPNG],
    ['o-planeta', 'Colocar un planeta con datos reales', '', () => ponerHerramienta('planeta'), 'Objetos'],
    ['o-cuerpo-masivo', 'Colocar un cuerpo masivo', '', () => ponerHerramienta('masivo'), 'Objetos'],
    ['o-satelite', 'Colocar un satélite (partícula de prueba)', '', () => ponerHerramienta('satelite'), 'Objetos'],
    ...ESCENAS.map(e => [ICONO_TIPO[e.tipo], `Abrir escena: ${e.titulo}`, e.tipo === 'MEXT' ? `MEXT ${e.anio}` : e.tipo, () => abrirEscena1(e.clave), 'Escenas']),
  ];
  let selCmd = 0;
  function pintarComandos() {
    const q = $('#cmd-q').value.trim().toLowerCase(), lista = COMANDOS.filter(c => `${c[1]} ${c[2]}`.toLowerCase().includes(q));
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
    if (mod && tecla === 'd') { ev.preventDefault(); duplicar(); return; }
    if (mod) return;
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) alternar(); espacioPulsado = true; return; }
    if (ev.key === 'Escape') { if (herramienta) { herramienta = null; marcarHerramienta(); } $('#menu-escenas').hidden = true; $('#menu-flotante').hidden = true; }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') quitarSeleccion();
    else if (ev.key === 'ArrowRight') irA(t + pasoT());
    else if (ev.key === 'ArrowLeft') irA(t - pasoT());
    else if (ev.key === 'Home') irA(0);
    else if (tecla === 'f') encuadrarTodo();
    else if (tecla === 'l') ponerEscala(ESC.escala === 'log' ? 'lineal' : 'log');
    else if (tecla === 't') alternarCapa('trazas');
    else if (tecla === 'o') alternarCapa('orbitas');
    else if (tecla === 'a') alternarCapa('areas');
    else if (tecla === 'c') alternarCapa('cm');
    else if (tecla === 'p') ponerHerramienta('periodo');
    else if (tecla === 'v') ponerHerramienta('velocimetro');
    else if (tecla === 'r') ponerHerramienta('regla');
    else if (tecla === 'm') alternarIntegrador();
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });

  // ---------------------------------------------------------------------
  // Arranque. Parámetros para capturas: ?escena=interiores&sel=c4&t=0.4&pest=energia&capas=areas&escala=log
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); if (!vistaTocada) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search), limpio = ![...q.keys()].length;
    const pend = escenaPendiente('gravitacion');
    if (pend && aOtroEspacio(pend, ESPACIO)) return;
    const previa = pend || (limpio ? autoguardado.leer(CLAVE_AUTO, { modulo: 'gravitacion' }) : null);
    tz.ajustar();
    if (q.has('escena') || !previa) ESC = completa(escenaDe(q.get('escena') || 'interiores'));
    else ESC = datosSeguros(previa.datos);
    sel = ESC.sel || 'escena';
    aplicarVariables();
    if (q.has('capas')) for (const k of q.get('capas').split(',')) if (k in ESC.capas) ESC.capas[k] = true;
    if (q.get('escala') === 'log' || q.get('escala') === 'lineal') ESC.escala = q.get('escala');
    if (q.has('sel')) { const s = q.get('sel'); if (s === 'escena' || cDe(s)) sel = s; }
    autoguardar = true;
    registrarDocumento({ clave: 'gravitacion-sistema-solar', escena: escenaActual, origen: (!q.has('escena') && previa) || null, abrir, guardar });
    titulo(); construirVariables(); radioLog();
    recalcular(); escalasVector(); inspector();
    if (q.has('t')) t = Math.max(0, Math.min(1, parseFloat(q.get('t')) || 0)) * DUR;
    escala0 = tz.vista.escala; zoomTexto();
    const pe = q.get('pest'); if (pe) { const b = document.querySelector(`#pest [aria-controls="p-${pe}"]`); if (b) b.click(); }
    todo();
    historial = new Historial(sinSel(instantanea())); botonesHistorial();
    if (ESC.nota && !q.has('t')) avisar(ESC.nota, false);
    requestAnimationFrame(a => { ultimo = a; requestAnimationFrame(cuadro); });
  });
})();
