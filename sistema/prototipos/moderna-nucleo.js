/* ==========================================================================
   Volta · Física moderna — espacio de trabajo "Núcleo"
   Carta de núclidos N–Z con las cadenas de decaimiento, una muestra
   radiactiva que decae al azar y un decaimiento puntual con el retroceso.
   La física está en el motor puro sistema/motores/moderna.js (probado en
   pruebas/moderna.test.js): tabla de núclidos, reglas α, β⁻, β⁺, CE y γ,
   cadenas con sus ramas, valor Q, fisión, decaimiento estocástico con
   semilla y retroceso con cinemática relativista exacta.
   El lienzo tiene tres zonas: la carta (a la izquierda, con zoom y
   desplazamiento; mundo: x = N, y = Z), la muestra y el decaimiento (a la
   derecha, en px). La evolución temporal es la de la muestra; el tiempo se
   escribe en la unidad de la escena (s, min, h, d o a).
   Misma estructura que moderna.js y optica.js: escena → motor → lienzo →
   paneles.
   Parámetros de URL para capturas: ?escena=…&tema=…&sel=<id>|escena
   &pest=cadena|balance|tabla&t=<en la unidad de la escena>
   ========================================================================== */
import {
  NUCLIDOS, SIMBOLOS, NOMBRES, TIPOS_DECAIMIENTO, nuclido, claveDeZA, nombreNuclido, constanteDecaimiento, hijoDe, valorQ, cadena,
  arbolDecaimiento, contarPasos, fision, retroceso, retrocesoFision, energiaEnlace, decaerMuestra, restantes, poblacion,
  desintegraciones, periodoMedido, leyExponencial, aplicarRegla, ANIO, MEV,
} from '../motores/moderna.js';
import { aCSV } from '../nucleo/csv.js';
import { descargarTexto, descargarLienzo, nombreArchivo, avisar as avisarLienzo } from '../componentes/exportar.js';
import { crearEscena, numero, texto } from '../nucleo/escena.js';
import { Historial } from '../nucleo/historial.js';
import { evaluar } from '../nucleo/unidades.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';

(function () {
  'use strict';
  const { Trazo, fmt, grafica, LineaTiempo, ESP } = Volta;
  const $ = s => document.querySelector(s);
  const GR = Math.PI / 180;
  const UNI = { s: 1, min: 60, h: 3600, d: 86400, a: ANIO };
  const FAC = { ...UNI, '°': GR, '%': 0.01, '': 1 };
  const numCampo = x => String(Number(Number(x).toPrecision(6))).replace('-', '−');
  const simHTML = (a, sub, recto = true) => `<span class="sim">${a}${sub ? `<sub${recto ? ' class="r"' : ''}>${sub}</sub>` : ''}</span>`;
  const SUPER = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  // Número con potencia volada también para los muy pequeños (fmt da 0 por debajo de 10⁻¹²)
  function fmtE(v, cifras = 4) {
    if (!Number.isFinite(v)) return '—';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e-3 && a < 1e5) return fmt(v, cifras);
    let e = Math.floor(Math.log10(a)), m = v / Math.pow(10, e);
    if (Math.abs(Number(m.toFixed(cifras - 1))) >= 10) { e += 1; m /= 10; }
    return `${m.toFixed(cifras - 1).replace('-', '−')} × 10${String(e).replace('-', '⁻').replace(/\d/g, d => SUPER[+d])}`;
  }
  const miles = n => (n >= 1e6 ? fmt(n, 3) : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
  // Periodo en una unidad cómoda: [valor, unidad]
  function periodoEn(T) {
    if (T == null) return ['estable', ''];
    if (T < 1e-3) return [fmt(T * 1e6, 4), 'µs'];
    if (T < 1) return [fmt(T * 1e3, 4), 'ms'];
    if (T < 120) return [fmt(T, 4), 's'];
    if (T < 2 * 3600) return [fmt(T / 60, 4), 'min'];
    if (T < 2 * 86400) return [fmt(T / 3600, 4), 'h'];
    if (T < 2 * ANIO) return [fmt(T / 86400, 4), 'd'];
    return [fmtE(T / ANIO, 4), 'a'];
  }
  const periodoTexto = T => { const [v, u] = periodoEn(T); return u ? v + ESP + u : v; };
  const unidadPara = T => (T < 120 ? 's' : T < 2 * 3600 ? 'min' : T < 2 * 86400 ? 'h' : T < 2 * ANIO ? 'd' : 'a');
  const SIMB = tipo => (TIPOS_DECAIMIENTO[tipo] ? TIPOS_DECAIMIENTO[tipo].simbolo : tipo === 'fision' ? 'fisión' : tipo);
  const FISIBLES = { 'U-235': [['Ba-144', 'Kr-89'], ['Ba-141', 'Kr-92'], ['Xe-140', 'Sr-94']] };
  // Etiqueta corta de un núclido: ²³⁸U
  const volado = k => { const n = nuclido(k); if (!n) return k; if (k === 'n') return 'n'; return Volta.Trazo.prototype.modernaVolado(String(n.A) + (k.endsWith('m') ? 'm' : '')) + SIMBOLOS[n.Z]; };

  // ---------------------------------------------------------------------
  // Escenas. Variables: valor en su unidad de pantalla; valor físico =
  // val·factor + offset en cada ruta que fijan.
  // ---------------------------------------------------------------------
  const vari = (sim, val, min, max, paso, u, factor, liga, o = {}) => ({ sim, sub: o.sub, val, min, max, paso, u, factor, offset: o.offset ?? 0, liga });
  const nucl = (clave, ramas = false) => ({ clave, ramas });
  const BASE = () => ({
    nuclidos: [], muestra: null, decaimiento: null, duracion: 1, unidadT: 's', variables: {},
    graficas: ['cadenaZA', 'cadenaT', 'cadenaQ'], capas: { cadenas: true, valle: true, momentos: true, valores: true, contador: true, cronometro: true },
    caja: null, sel: 'escena',
  });
  const ESCENAS = [
    {
      clave: 'cadena', titulo: 'Una cadena de decaimiento: el radón-222', tipo: 'Tutorial',
      nuclidos: [nucl('Rn-222')], muestra: { clave: 'Rn-222', N0: 2000, T: null, cadena: true, semilla: 1 },
      duracion: 20 * 86400, unidadT: 'd', graficas: ['N', 'actividad', 'cadenaQ'], sel: 'muestra',
      variables: { N: vari('N', 2000, 100, 10000, 100, '', 1, ['muestra.N0'], { sub: '0' }) },
    },
    {
      clave: 'serie-u238', titulo: 'Serie del uranio-238', tipo: 'Ejemplo', nuclidos: [nucl('U-238')],
      graficas: ['cadenaZA', 'cadenaT', 'cadenaQ'], sel: 'n1',
    },
    {
      clave: 'muestra', titulo: 'Decaimiento de una muestra de yodo-131', tipo: 'Ejemplo', nuclidos: [nucl('I-131')],
      muestra: { clave: 'I-131', N0: 10000, T: null, cadena: false, semilla: 1 }, duracion: 40 * 86400, unidadT: 'd',
      graficas: ['N', 'lnN', 'actividad'], sel: 'muestra',
      variables: { N: vari('N', 10000, 100, 50000, 100, '', 1, ['muestra.N0'], { sub: '0' }), T: vari('T', 8.0252, 1, 20, 0.0001, 'd', 86400, ['muestra.T'], { sub: '½' }) },
    },
    {
      clave: 'cuatro-series', titulo: 'Las cuatro series radiactivas', tipo: 'Ejemplo',
      nuclidos: [nucl('U-238'), nucl('Th-232', true), nucl('U-235', true), nucl('Np-237', true)], graficas: ['cadenaZA', 'cadenaT', 'cadenaQ'], sel: 'n1',
    },
    {
      clave: 'beta', titulo: 'Retroceso en el decaimiento β⁻: el antineutrino', tipo: 'Ejemplo', nuclidos: [nucl('C-14')],
      decaimiento: { clave: 'C-14', tipo: 'beta-', direccion: 25 * GR, reparto: 0.45, angulo: 140 * GR }, graficas: ['balanceBeta', 'momentoBeta', 'enlace'], sel: 'decaimiento',
      variables: { x: vari('x', 45, 0, 100, 1, '%', 0.01, ['decaimiento.reparto'], { sub: 'e' }), psi: vari('ψ', 140, 0, 180, 1, '°', GR, ['decaimiento.angulo']) },
    },
    // ----------------------------------------------------------------- MEXT
    {
      clave: 'mext-2008-1-5', titulo: 'Retroceso en el decaimiento α del uranio-238', tipo: 'MEXT', anio: '2008 1-(5)',
      decaimiento: { clave: 'U-238', tipo: 'alfa', direccion: 0 }, graficas: ['cocienteV', 'reparto', 'enlace'], sel: 'decaimiento',
      variables: { th: vari('θ', 0, -180, 180, 1, '°', GR, ['decaimiento.direccion']) },
    },
    {
      clave: 'mext-2007-1-5', titulo: 'Fisión del uranio-235', tipo: 'MEXT', anio: '2007 1-(5)',
      decaimiento: { clave: 'U-235', tipo: 'fision', fragmentos: ['Ba-144', 'Kr-89'], direccion: 20 * GR }, graficas: ['enlace', 'fisionQ', 'repartoFision'], sel: 'decaimiento',
    },
    {
      clave: 'mext-2006-1-4', titulo: 'Cadena del uranio-238: ¿dónde termina?', tipo: 'MEXT', anio: '2006 1-(4)', nuclidos: [nucl('U-238')],
      graficas: ['cadenaZA', 'cadenaQ', 'cadenaT'], sel: 'n1',
    },
  ];
  const completa = e => {
    const b = BASE(), o = JSON.parse(JSON.stringify({ ...b, ...e, capas: { ...b.capas, ...(e.capas || {}) } }));
    o.nuclidos.forEach((n, i) => { n.id = 'n' + (i + 1); });
    if (typeof o.sel === 'number') o.sel = o.nuclidos[o.sel]?.id ?? 'escena';
    return o;
  };
  const escenaDe = clave => ESCENAS.find(e => e.clave === clave) || ESCENAS[0];

  // ---------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------
  /** @type {any} */ let ESC = completa(ESCENAS[0]);
  let sel = 'escena', herramienta = null, vistaTocada = false, escala0 = 1, espacioPulsado = false, hover = null, paneo = null;
  let autoguardar = false, historial = null, contador = 10;
  let t = 0, jugando = false, velocidad = 1, ultimo = 0;      // t en s
  let MUESTRA = null, claveMuestra = '', ERROR = null;
  const lienzo = $('#lienzo'), area = $('#area');
  const tz = new Trazo(lienzo);
  const nuDe = id => ESC.nuclidos.find(n => n.id === id);
  const U = () => UNI[ESC.unidadT] || 1;

  // ---------------------------------------------------------------------
  // Escena → motor
  // ---------------------------------------------------------------------
  function muestra() {
    const m = ESC.muestra;
    if (!m) { MUESTRA = null; claveMuestra = ''; return null; }
    const k = JSON.stringify(m);
    if (k !== claveMuestra) {
      claveMuestra = k;
      try { MUESTRA = decaerMuestra({ clave: m.clave, T: m.T ?? undefined, N0: m.N0, semilla: m.semilla, cadena: m.cadena }); ERROR = null; }
      catch (e) { MUESTRA = null; ERROR = e.message; }
    }
    return MUESTRA;
  }
  const periodoMuestra = () => (ESC.muestra ? (ESC.muestra.T ?? nuclido(ESC.muestra.clave)?.T ?? null) : null);
  let RET = null, claveRet = '';
  function decaimiento() {
    const d = ESC.decaimiento;
    if (!d) return null;
    const k = JSON.stringify(d);
    if (k !== claveRet) {
      claveRet = k;
      try {
        RET = d.tipo === 'fision' ? { ...retrocesoFision(d.clave, d.fragmentos, { direccion: d.direccion }), tipo: 'fision', padre: d.clave }
          : retroceso(d.clave, d.tipo, { direccion: d.direccion, reparto: d.reparto ?? 0.4, angulo: d.angulo ?? 2 * Math.PI / 3 });
      } catch (e) { RET = { error: e.message }; }
    }
    return RET;
  }
  // Cadena de referencia (gráficas y pestaña Cadena): la del núclido seleccionado, la de la muestra o la del primero
  function claveRef() {
    const n = nuDe(sel); if (n) return n.clave;
    if (sel.startsWith('celda:')) return sel.slice(6);
    if (sel === 'muestra' && ESC.muestra) return ESC.muestra.clave;
    if (sel === 'decaimiento' && ESC.decaimiento) return ESC.decaimiento.clave;
    return ESC.nuclidos[0]?.clave || ESC.muestra?.clave || ESC.decaimiento?.clave || null;
  }
  // Pasos que se dibujan en la carta para cada núclido seguido
  const pasosDe = n => (n.ramas ? arbolDecaimiento(n.clave) : cadena(n.clave).pasos);
  const NZ = k => { const n = nuclido(k); return n ? [n.A - n.Z, n.Z] : null; };
  const NZregla = (k, tipo) => { const n = nuclido(k); if (!n) return null; const h = aplicarRegla(n, tipo); return [h.A - h.Z, h.Z]; };

  // ---------------------------------------------------------------------
  // Zonas del lienzo
  // ---------------------------------------------------------------------
  function regiones() {
    const W = tz.w, H = tz.h, hay = !!(ESC.muestra || ESC.decaimiento), xd = hay ? Math.round(W * 0.56) : W;
    const arriba = 52, abajo = H - 50;
    let mue = null, dec = null;
    if (ESC.muestra && ESC.decaimiento) { const m = Math.round((arriba + abajo) / 2); mue = { x: xd, y: arriba, w: W - xd, h: m - arriba }; dec = { x: xd, y: m, w: W - xd, h: abajo - m }; }
    else if (ESC.muestra) mue = { x: xd, y: arriba, w: W - xd, h: abajo - arriba };
    else if (ESC.decaimiento) dec = { x: xd, y: arriba, w: W - xd, h: abajo - arriba };
    return { xd, W, H, mue, dec };
  }

  // Caja de la carta que encierra todo lo que la escena muestra
  function cajaCarta() {
    if (ESC.caja) return ESC.caja;
    const pts = [];
    const pon = k => { const p = NZ(k); if (p) pts.push(p); };
    for (const n of ESC.nuclidos) { pon(n.clave); for (const p of pasosDe(n)) pon(p.hacia); }
    if (ESC.muestra) { pon(ESC.muestra.clave); for (const p of cadena(ESC.muestra.clave).pasos) pon(p.hacia); }
    if (ESC.decaimiento) {
      const d = ESC.decaimiento; pon(d.clave);
      if (d.tipo === 'fision') { (d.fragmentos || []).forEach(pon); const p = NZ(d.clave); if (p) pts.push([p[0] + 1, p[1]]); } else pon(hijoDe(d.clave, { tipo: d.tipo, rama: 1 }));
    }
    if (!pts.length) return [120, 150, 78, 96];
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    // Al menos 14 × 9 casillas, para que unas pocas no se vean enormes
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const w = Math.max(14, Math.max(...xs) - Math.min(...xs) + 5), h = Math.max(9, Math.max(...ys) - Math.min(...ys) + 5);
    return [cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2];
  }
  function encuadrar() {
    const r = regiones(), c = cajaCarta();
    tz.vista.encuadrar({ x0: c[0], x1: c[1], y0: c[2], y1: c[3] }, { x: 0, y: 0, w: r.xd, h: r.H }, 46);
  }

  // ---------------------------------------------------------------------
  // Dibujo
  // ---------------------------------------------------------------------
  function dibujar() {
    const r = regiones(), c = tz.ctx;
    tz.limpiar();
    tz.modernaEtiquetas([...tz.zonasFlotantes()]);
    c.save(); c.beginPath(); c.rect(0, 0, r.xd, r.H); c.clip();
    dibujarCarta(r);
    c.restore();
    if (r.xd < r.W) {
      // Separación entre la carta y la columna de la derecha
      tz.lineaPx([[r.xd + 0.5, 0], [r.xd + 0.5, r.H]], { color: 'linea-suave', grosor: 1, extremo: 'butt' });
      c.save(); c.beginPath(); c.rect(r.xd + 1, 0, r.W - r.xd - 1, r.H); c.clip(); c.fillStyle = tz.t.lienzo; c.fillRect(r.xd + 1, 0, r.W - r.xd, r.H); c.restore();
      if (r.mue) dibujarMuestra(r.mue);
      if (r.mue && r.dec) tz.lineaPx([[r.xd + 16, r.dec.y + 0.5], [r.W - 16, r.dec.y + 0.5]], { color: 'linea-suave', grosor: 1, extremo: 'butt' });
      if (r.dec) dibujarDecaimiento(r.dec);
    }
    if (ERROR) tz.texto(ERROR, r.xd / 2, r.H / 2, { fuente: 'ui', tam: 13, color: 'error', alinear: 'center', halo: true });
  }

  // ----------------------------------------------------- carta N–Z
  function dibujarCarta(r) {
    const v = tz.vista, ancho = r.xd;
    tz.cuadricula();
    const N0 = v.mx(0), N1 = v.mx(ancho), Z0 = v.my(r.H), Z1 = v.my(0);
    // 5 · Construcción: valle de estabilidad y N = Z
    if (ESC.capas.valle) {
      const valle = [];
      for (let A = 1; A <= 270; A += 1) { const Z = A / (1.98 + 0.0155 * Math.pow(A, 2 / 3)); valle.push([A - Z, Z]); }
      tz.linea(valle, { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
      tz.linea([[0, 0], [140, 140]], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
    }
    // 6 · Casillas de la tabla
    const enCadena = new Set(), m = muestra(), poblaciones = new Map();
    for (const n of ESC.nuclidos) { enCadena.add(n.clave); for (const p of pasosDe(n)) enCadena.add(p.hacia); }
    if (ESC.muestra) { enCadena.add(ESC.muestra.clave); if (m) m.especies.forEach((k, j) => { const q = poblacion(m, j, t); if (q > 0) poblaciones.set(k, q / m.N0); }); }
    const ocupadas = new Set();
    const selCelda = sel.startsWith('celda:') ? sel.slice(6) : nuDe(sel)?.clave;
    for (const [k, n] of Object.entries(NUCLIDOS)) {
      if (k.endsWith('m') && NUCLIDOS[k.slice(0, -1)]) continue;
      const N = n.A - n.Z;
      if (N < N0 - 1 || N > N1 + 1 || n.Z < Z0 - 1 || n.Z > Z1 + 1) continue;
      const iso = k.endsWith('m') || !!NUCLIDOS[k + 'm'];
      const caja = tz.modernaCelda(N, n.Z, {
        estable: n.T == null, simbolo: SIMBOLOS[n.Z], A: n.A, isomero: iso && k.endsWith('m'), cadena: enCadena.has(k) || enCadena.has(k + 'm'),
        grueso: hover === 'celda:' + k, seleccionada: selCelda === k || selCelda === k + 'm',
        ocupacion: ESC.capas.contador ? (poblaciones.get(k) || 0) + (poblaciones.get(k + 'm') || 0) : 0,
      });
      ocupadas.add(`${N},${n.Z}`);
      if (caja.w >= 18) tz.modernaOcupar({ x: caja.x, y: caja.y, w: caja.w, h: caja.h });
    }
    // Rótulos del valle y de N = Z donde cruzan la vista, sin tapar casillas
    if (ESC.capas.valle) {
      const valle = []; for (let A = 1; A <= 270; A += 1) { const Z = A / (1.98 + 0.0155 * Math.pow(A, 2 / 3)); valle.push([A - Z, Z]); }
      const enVista = pts => pts.filter(([x, y]) => v.X(x) > 60 && v.X(x) < ancho - 120 && v.Y(y) > 70 && v.Y(y) < r.H - 70);
      const pv = enVista(valle), pz = enVista(Array.from({ length: 141 }, (_, i) => [i, i]));
      const rotular = (pts, segs) => { for (const f of [0.8, 0.6, 0.4, 0.2, 0.9]) { const [x, y] = pts[Math.floor((pts.length - 1) * f)]; if (tz.modernaEtiqueta(segs, [[v.X(x) + 8, v.Y(y) + 4, 'left'], [v.X(x) - 8, v.Y(y) - 6, 'right']])) return; } };
      if (pv.length) rotular(pv, [{ t: 'valle de estabilidad', f: 'ui', tam: 11, color: 'texto-3' }]);
      if (pz.length) rotular(pz, [{ t: 'N', f: 'sim', tam: 12, color: 'texto-3' }, { t: ' = ', f: 'num', tam: 11, color: 'texto-3' }, { t: 'Z', f: 'sim', tam: 12, color: 'texto-3' }]);
    }
    // 7 · Cadenas
    if (ESC.capas.cadenas) {
      const hechos = new Set();
      const flecha = (desde, hacia, tipo, rama, grueso = false) => {
        const a = NZ(desde), b = NZ(hacia) || NZregla(desde, tipo); if (!a || !b) return;
        const k = `${desde}>${hacia}`; if (hechos.has(k)) return; hechos.add(k);
        if (a[0] === b[0] && a[1] === b[1]) {
          // γ: la casilla no cambia; se rotula junto a ella
          const [X, Y] = v.P(a); tz.modernaEtiqueta([{ t: 'γ', f: 'simRecta', tam: 12, color: 'texto-2' }], [[X + v.escala * 0.5 + 3, Y - v.escala * 0.3, 'left'], [X - v.escala * 0.5 - 3, Y - v.escala * 0.3, 'right']]);
          return;
        }
        const rot = v.escala >= 14 ? [{ t: SIMB(tipo), f: 'simRecta', tam: 12 }, ...(rama < 0.5 ? [{ t: ` ${fmt(rama * 100, 2)} %`, f: 'num', tam: 10 }] : [])] : null;
        tz.modernaFlechaDecaimiento(a, b, { menor: rama < 0.5, rotulo: rot, grueso });
      };
      for (const n of ESC.nuclidos) for (const p of pasosDe(n)) flecha(p.desde, p.hacia, p.tipo, p.rama);
      if (ESC.muestra) for (const p of cadena(ESC.muestra.clave).pasos) flecha(p.desde, p.hacia, p.tipo, p.rama);
    }
    const d = ESC.decaimiento;
    if (d) {
      if (d.tipo === 'fision') {
        const a = NZ(d.clave); if (a) {
          const comp = [a[0] + 1, a[1]];
          tz.modernaFlechaDecaimiento(a, comp, { rotulo: [{ t: '+n', f: 'simRecta', tam: 12 }], grueso: true });
          for (const fk of d.fragmentos || []) { const b = NZ(fk); if (b) tz.modernaFlechaDecaimiento(comp, b, { rotulo: [{ t: 'fisión', f: 'ui', tam: 11 }], grueso: true }); }
          if (!ocupadas.has(`${comp[0]},${comp[1]}`)) tz.modernaCelda(comp[0], comp[1], { simbolo: SIMBOLOS[a[1]], A: a[0] + a[1] + 1, cadena: true });
        }
      } else {
        const h = hijoDe(d.clave, nuclido(d.clave)?.modos.find(x => x.tipo === d.tipo) || { tipo: d.tipo, rama: 1 });
        const a = NZ(d.clave), b = NZ(h) || NZregla(d.clave, d.tipo);
        if (a && b && (a[0] !== b[0] || a[1] !== b[1])) tz.modernaFlechaDecaimiento(a, b, { rotulo: [{ t: SIMB(d.tipo), f: 'simRecta', tam: 12 }], grueso: true });
      }
    }
    // Contador: núcleos de cada especie de la muestra junto a su casilla
    if (m && ESC.capas.contador && ESC.capas.valores) {
      m.especies.forEach((k, j) => {
        const q = poblacion(m, j, t), p = NZ(k); if (!(q > 0) || !p) return;
        const [X, Y] = v.P(p), h = v.escala * 0.44;
        tz.modernaEtiqueta([{ t: 'N', f: 'sim', tam: 12, color: 'texto-2' }, { t: ' = ' + miles(q), f: 'num', tam: 11, color: 'texto-2' }], [[X + h + 5, Y + 4, 'left'], [X - h - 5, Y + 4, 'right'], [X, Y + h + 14, 'center'], [X, Y - h - 6, 'center']]);
      });
    }
    dibujarEjesCarta(r);
  }
  // Números de N (arriba) y de Z (a la izquierda) en el borde de la carta
  function dibujarEjesCarta(r) {
    const v = tz.vista, paso = Math.max(1, Volta.pasoAgradable(46 / v.escala));
    const N0 = Math.ceil(v.mx(24) / paso) * paso, N1 = v.mx(r.xd - 30), Z0 = Math.ceil(v.my(r.H - 56) / paso) * paso, Z1 = v.my(40);
    for (let N = N0; N <= N1; N += paso) { const X = v.X(N); tz.modernaEtiqueta([{ t: String(N), f: 'num', tam: 11, color: 'texto-3' }], [[X, 18, 'center']]); }
    for (let Z = Z0; Z <= Z1; Z += paso) { const Y = v.Y(Z); tz.modernaEtiqueta([{ t: String(Z), f: 'num', tam: 11, color: 'texto-3' }], [[8, Y + 4, 'left']]); }
    tz.modernaEtiqueta([{ t: 'N', f: 'sim', tam: 14, color: 'texto-3' }, { t: ' (neutrones)', f: 'ui', tam: 11, color: 'texto-3' }], [[r.xd - 12, 34, 'right'], [r.xd - 12, 50, 'right']]);
    tz.modernaEtiqueta([{ t: 'Z', f: 'sim', tam: 14, color: 'texto-3' }, { t: ' (protones)', f: 'ui', tam: 11, color: 'texto-3' }], [[36, 40, 'left'], [36, 56, 'left']]);
  }

  // ----------------------------------------------------- muestra
  function dibujarMuestra(R) {
    const m = muestra(), M = ESC.muestra, x0 = R.x + 18;
    const enc = tz.compuesto([{ t: 'Muestra de ', f: 'ui', tam: 12, color: 'texto-2' }, { t: nombreNuclido(M.clave).toLowerCase(), f: 'ui', tam: 12, color: 'texto' }], x0, R.y + 16, {});
    tz.modernaOcupar({ x: x0 - 2, y: R.y + 2, w: enc.ancho + 4, h: 18 });
    if (!m) return;
    const N = restantes(m, t);
    if (ESC.capas.contador) {
      tz.compuesto([{ t: 'N', f: 'sim', tam: 14 }, { t: ' = ' + miles(N), f: 'num', tam: 12 }, { t: ` de ${miles(m.N0)} sin decaer`, f: 'ui', tam: 11.5, color: 'texto-3' }], x0, R.y + 36, {});
    }
    // Rejilla de núcleos: hasta 400, muestreados de forma estratificada entre los tiempos de vida
    const n = Math.min(m.N0, 400), aw = R.w - 36, ah = R.h - 96;
    if (n > 0 && aw > 40 && ah > 30) {
      const cols = Math.max(1, Math.ceil(Math.sqrt(n * aw / ah))), filas = Math.ceil(n / cols), paso = Math.min(aw / cols, ah / filas, 26);
      const rr = Math.max(1.6, Math.min(5.5, paso * 0.32)), gx = x0 + (aw - paso * cols) / 2 + paso / 2, gy = R.y + 52 + paso / 2;
      const flash = ESC.duracion / 60, c = tz.ctx;
      c.save(); c.setLineDash([]);
      for (let k = 0; k < n; k++) {
        const j = (k * 7919) % n, vida = m.vidas[Math.min(m.N0 - 1, Math.floor((j + 0.5) * m.N0 / n))];
        const X = gx + (k % cols) * paso, Y = gy + Math.floor(k / cols) * paso;
        c.beginPath(); c.arc(X, Y, rr, 0, 2 * Math.PI);
        if (vida > t) { c.fillStyle = tz.t.tinta; c.fill(); }
        else { c.fillStyle = tz.t.lienzo; c.fill(); c.strokeStyle = tz.t['texto-3']; c.lineWidth = 1; c.stroke(); if (t - vida < flash && rr >= 2.5) { c.strokeStyle = tz.t.tinta; c.lineWidth = 1.25; c.beginPath(); c.arc(X, Y, rr + 3.5, 0, 2 * Math.PI); c.stroke(); } }
      }
      c.restore();
    }
    // Leyenda y periodo medido
    const yl = R.y + R.h - 34, c = tz.ctx;
    c.save(); c.fillStyle = tz.t.tinta; c.beginPath(); c.arc(x0 + 4, yl - 4, 4, 0, 2 * Math.PI); c.fill();
    c.fillStyle = tz.t.lienzo; c.strokeStyle = tz.t['texto-3']; c.lineWidth = 1; c.beginPath(); c.arc(x0 + 104, yl - 4, 4, 0, 2 * Math.PI); c.fill(); c.stroke(); c.restore();
    tz.texto('sin decaer', x0 + 13, yl, { fuente: 'ui', tam: 11, color: 'texto-2' });
    tz.texto(m.especies.length > 2 ? 'ya decayó (cadena)' : 'ya decayó', x0 + 113, yl, { fuente: 'ui', tam: 11, color: 'texto-2' });
    if (m.N0 > n) tz.texto(`se dibujan ${n} de ${miles(m.N0)}`, R.x + R.w - 16, yl, { fuente: 'ui', tam: 11, color: 'texto-3', alinear: 'right' });
    const T = periodoMuestra(), pm = periodoMedido(m, t);
    const segs = [{ t: 'T', f: 'sim', tam: 13 }, { t: '½', f: 'simRecta', tam: 9, dy: 3 }, { t: ' = ' + periodoTexto(T), f: 'num', tam: 11, color: 'texto-2' }];
    if (ESC.capas.cronometro) segs.push({ t: '   medido: ', f: 'ui', tam: 11, color: 'texto-3' }, { t: pm.mediana != null ? periodoTexto(pm.mediana) : 'aún no decae la mitad', f: pm.mediana != null ? 'num' : 'ui', tam: 11, color: 'texto-2' });
    tz.compuesto(segs, x0, yl + 20, {});
  }

  // ----------------------------------------------------- decaimiento puntual
  function dibujarDecaimiento(R) {
    const d = ESC.decaimiento, res = decaimiento(), x0 = R.x + 18;
    const titulo = d.tipo === 'fision' ? `Fisión del ${nombreNuclido(d.clave).toLowerCase()} con un neutrón lento` : `Decaimiento ${SIMB(d.tipo)} del ${nombreNuclido(d.clave).toLowerCase()}`;
    const enc = tz.compuesto([{ t: titulo, f: 'ui', tam: 12, color: 'texto' }], x0, R.y + 20, {});
    tz.modernaOcupar({ x: x0 - 2, y: R.y + 6, w: enc.ancho + 4, h: 18 });
    if (!res || res.error) { tz.texto(res ? res.error : '', R.x + R.w / 2, R.y + R.h / 2, { fuente: 'ui', tam: 12, color: 'error', alinear: 'center' }); return; }
    // Lo más lejos que llega algo (rapidez + vector + rótulo) cabe en la mitad de la zona
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2 + 4, mitad = Math.min(R.w / 2, R.h / 2 - 20), Dmax = mitad * 0.42, Lp = mitad * 0.32;
    const radio = A => 3.5 + 2.1 * Math.cbrt(A);
    const prods = res.productos.filter(p => p.pMeV > 0), vmax = Math.max(...prods.map(p => p.v), 1e-30), pmax = Math.max(...prods.map(p => p.pMeV), 1e-30);
    // Núcleo padre en reposo (antes), en trazo previsto
    const P = nuclido(d.clave);
    tz.modernaNucleoPx(cx, cy, radio(P.A + (d.tipo === 'fision' ? 1 : 0)), { fantasma: true });
    // Productos un instante después: a una distancia proporcional a su rapidez
    const tipoPart = p => (p.simbolo === 'α' ? 'alfa' : p.simbolo === 'e⁻' ? 'e-' : p.simbolo === 'e⁺' ? 'e+' : p.simbolo === 'γ' ? 'gamma' : p.simbolo === 'n' ? 'n' : p.simbolo.startsWith('ν') ? 'nu' : null);
    const etqP = p => (p.clave && p.clave !== 'He-4' ? volado(p.clave) : p.simbolo);
    const subP = p => (p.clave && p.clave !== 'He-4' ? SIMBOLOS[nuclido(p.clave).Z] : p.simbolo === 'e⁻' || p.simbolo === 'e⁺' ? 'e' : p.simbolo);
    for (const p of res.productos) {
      const ang = Math.atan2(p.p[1], p.p[0]), u = [Math.cos(ang), -Math.sin(ang)], s = p.pMeV > 0 ? Dmax * p.v / vmax : 0;
      let X = cx + u[0] * s, Y = cy + u[1] * s;
      const tp = tipoPart(p);
      if (tp === 'n') { const k = res.productos.filter(q => q.simbolo === 'n').indexOf(p); X = cx + 30 * Math.cos(-1.9 + k * 0.5); Y = cy + 30 * Math.sin(-1.9 + k * 0.5); }
      const r = tp ? tz.modernaRadioParticula(tp) : radio(nuclido(p.clave).A);
      if (tp) tz.modernaParticulaPx(X, Y, tp, { direccion: ang });
      else tz.modernaNucleoPx(X, Y, r, {});
      tz.modernaOcupar({ x: X - r - 2, y: Y - r - 2, w: 2 * r + 4, h: 2 * r + 4 });
      // Momento (familia inercia), desde el borde del cuerpo
      let tip = [X, Y];
      if (ESC.capas.momentos && p.pMeV > 0) {
        const L = Lp * p.pMeV / pmax, xa = X + u[0] * (r + 2), ya = Y + u[1] * (r + 2);
        if (L > 4) { tz.flechaPx(xa, ya, xa + u[0] * L, ya + u[1] * L, { color: 'inercia', grosor: 2.25 }); tip = [xa + u[0] * L, ya + u[1] * L]; }
        const segs = [{ t: 'p', f: 'sim', tam: 14, color: 'inercia' }, { t: subP(p), f: 'simRecta', tam: 9, dy: 3, color: 'inercia' }];
        const al = u[0] >= -0.2 ? 'left' : 'right', dx = u[0] >= -0.2 ? 8 : -8;
        tz.modernaEtiqueta(segs, [[tip[0] + dx, tip[1] + 5 + u[1] * 6, al], [tip[0] + dx, tip[1] - 10, al], [tip[0] + dx, tip[1] + 18, al]]);
      }
      // Nombre del producto
      if (tp !== 'n') tz.modernaEtiqueta([{ t: etqP(p), f: 'ui', tam: 11.5, color: 'texto' }], [[X, Y + r + 15, 'center'], [X, Y - r - 7, 'center'], [X - u[0] * (r + 8), Y - u[1] * (r + 8) + 4, u[0] >= 0 ? 'right' : 'left']]);
    }
    const nn = res.productos.filter(q => q.simbolo === 'n').length;
    if (nn) tz.modernaEtiqueta([{ t: `${nn} n`, f: 'ui', tam: 11.5, color: 'texto' }], [[cx + 30 * Math.cos(-1.9) - 10, cy + 30 * Math.sin(-1.9) - 6, 'right'], [cx, cy - 40, 'center']]);
    // Ficha con el balance
    if (ESC.capas.valores) {
      const filas = [[{ t: 'Q', f: 'sim', tam: 13 }, { t: ' = ' + fmt(res.Q.MeV, 4) + ESP + 'MeV', f: 'num', tam: 11.5 }]];
      if (prods.length === 2 && d.tipo !== 'fision') {
        const [a, b] = prods;
        filas.push([{ t: 'v', f: 'sim', tam: 13 }, { t: subP(a), f: 'simRecta', tam: 9, dy: 3 }, { t: '/', f: 'num', tam: 11.5 }, { t: 'V', f: 'sim', tam: 13 }, { t: ' = ' + fmt(a.v / b.v, 4), f: 'num', tam: 11.5 }]);
      }
      if (d.tipo === 'fision') filas.push([{ t: `${nn} neutrones (conservación de A)`, f: 'ui', tam: 11.5 }]);
      tz.modernaFicha(filas, [[x0, R.y + R.h - 16 - filas.length * 16], [R.x + R.w - 200, R.y + 32]]);
    }
  }

  // ---------------------------------------------------------------------
  // Selección en el lienzo
  // ---------------------------------------------------------------------
  function celdaEn(X, Y) {
    const v = tz.vista, N = Math.round(v.mx(X)), Z = Math.round(v.my(Y));
    if (Math.abs(v.mx(X) - N) > 0.46 || Math.abs(v.my(Y) - Z) > 0.46) return null;
    return claveDeZA(Z, N + Z);
  }
  function objetoEn(X, Y) {
    const r = regiones();
    if (X >= r.xd) {
      if (r.mue && Y >= r.mue.y && Y < r.mue.y + r.mue.h) return 'muestra';
      if (r.dec && Y >= r.dec.y && Y < r.dec.y + r.dec.h) return 'decaimiento';
      return null;
    }
    const k = celdaEn(X, Y);
    return k ? 'celda:' + k : null;
  }

  // ---------------------------------------------------------------------
  // Inspector, árbol, lecturas y variables
  // ---------------------------------------------------------------------
  const fila = (etqt, control, ayuda = '') => `<div class="fila"${ayuda ? ` data-ayuda="${ayuda}"` : ''}><span class="etq">${etqt}</span>${control}</div>`;
  const segmentado = (id, ops, actual) => `<div class="segmentado texto" id="${id}">${ops.map(([v, txt, ay]) => `<button data-v="${v}" aria-pressed="${String(v) === String(actual)}"${ay ? ` data-ayuda="${ay}"` : ''}>${txt}</button>`).join('')}</div>`;
  const leer = ruta => ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ESC);
  const existe = ruta => { const ks = ruta.split('.'); ks.pop(); const o = ks.reduce((a, k) => (a == null ? undefined : a[k]), ESC); return o != null && typeof o === 'object'; };
  function escribir(ruta, val) { const ks = ruta.split('.'), u = ks.pop(), o = ks.reduce((a, k) => a[k], ESC); o[u] = val; }
  const ligadaA = ruta => Object.entries(ESC.variables).find(([, d]) => d.liga.includes(ruta));
  function campo(etqt, ruta, dim, u, ayuda = '', valorDefecto = null) {
    const lig = ligadaA(ruta);
    if (lig) {
      const [nv, d] = lig;
      return fila(etqt, `<div class="campo es-variable" data-ayuda="Ligado a la variable ${d.sim}|Bound to variable"><span class="chip-var">${simHTML(d.sim, d.sub)}</span><span class="valor-var" data-var="${nv}"></span><span class="u">${d.u}</span></div>`, ayuda);
    }
    const val = leer(ruta) ?? valorDefecto;
    return fila(etqt, `<div class="campo"><input data-ruta="${ruta}" data-dim="${dim}" data-u="${u}" value="${val == null ? '' : numCampo(val / (FAC[u] ?? 1))}"><span class="u">${u}</span></div>`, ayuda);
  }
  const campoNuclido = (etqt, ruta, ayuda) => fila(etqt, `<div class="campo"><input data-nuclido="${ruta}" value="${leer(ruta) || ''}" spellcheck="false"></div>`, ayuda);
  const boton = (id, ico, txt, ayuda) => `<button class="btn btn-secundario btn-compacto" id="${id}" data-ayuda="${ayuda}"><svg class="ico"><use href="#${ico}"/></svg>${txt}</button>`;

  function inspector() {
    const props = $('#propiedades'); let h = '', titulo = 'Propiedades', ico = 'o-nucleo', nombre = '';
    const nu = nuDe(sel), celda = sel.startsWith('celda:') ? sel.slice(6) : null;
    if (sel === 'escena') {
      nombre = 'Escena'; titulo = 'Tiempo'; ico = 'i-escena';
      h = fila('Unidad', segmentado('p-unidad', Object.keys(UNI).map(k => [k, k]), ESC.unidadT), 'Unidad de tiempo de la línea de tiempo y de las gráficas|Time unit')
        + campo('Duración', 'duracion', 'tiempo', ESC.unidadT, 'Duración de la línea de tiempo|Duration');
    } else if (nu) {
      nombre = nombreNuclido(nu.clave); titulo = 'Núclido seguido';
      h = campoNuclido('Núclido', `nuclidos.${ESC.nuclidos.indexOf(nu)}.clave`, 'Símbolo y número másico: U-238, 238U, Ba-137m|Nuclide')
        + fila('Cadena', segmentado('p-ramas', [['principal', 'Principal', 'Solo la rama más probable'], ['todas', 'Todas', 'Todas las ramas']], nu.ramas ? 'todas' : 'principal'), 'Seguir solo la rama más probable o todas|Branches')
        + `<div class="fila"><span class="etq">Objeto</span><div class="acciones-fila">${boton('p-a-muestra', 'o-muestra', 'Muestra', 'Muestra radiactiva de este núclido|Sample')}${boton('p-quitar', 'i-borrar', 'Quitar', 'Dejar de seguir este núclido|Delete|Supr')}</div></div>`;
    } else if (celda) {
      const n = nuclido(celda); nombre = nombreNuclido(celda); titulo = 'Núclido de la tabla';
      h = `<div class="fila"><span class="etq">Acciones</span><div class="acciones-fila">${boton('p-seguir', 'o-nucleo', 'Seguir su cadena', 'Dibujar su cadena de decaimiento|Follow chain')}${n && n.T != null ? boton('p-a-muestra', 'o-muestra', 'Muestra', 'Muestra radiactiva de este núclido|Sample') + boton('p-a-dec', 'o-impulso', 'Decaimiento', 'Decaimiento puntual de este núclido|Single decay') : ''}</div></div>`;
    } else if (sel === 'muestra' && ESC.muestra) {
      const M = ESC.muestra; nombre = `Muestra de ${nombreNuclido(M.clave).toLowerCase()}`; titulo = 'Muestra radiactiva'; ico = 'o-muestra';
      h = campoNuclido('Núclido', 'muestra.clave', 'Núclido de la muestra (radiactivo)|Nuclide')
        + campo('N₀', 'muestra.N0', 'adimensional', '', 'Núcleos al empezar (hasta 100 000; con la cadena, 20 000)|Initial nuclei')
        + fila('Periodo', segmentado('p-periodo', [['tabla', 'De la tabla'], ['propio', 'Propio']], M.T == null ? 'tabla' : 'propio'), 'Periodo de la tabla o uno propio|Half-life')
        + campo('T½', 'muestra.T', 'tiempo', ESC.unidadT, 'Periodo de semidesintegración|Half-life', nuclido(M.clave)?.T)
        + fila('Hijas', segmentado('p-cadena', [['no', 'Se quedan'], ['si', 'Siguen la cadena']], M.cadena ? 'si' : 'no'), 'Las hijas se quedan o decaen a su vez con los periodos de la tabla|Daughters')
        + campo('Semilla', 'muestra.semilla', 'adimensional', '', 'Semilla del azar: otra semilla, otra muestra con el mismo periodo|Random seed')
        + `<div class="fila"><span class="etq">Objeto</span><div class="acciones-fila">${boton('p-quitar', 'i-borrar', 'Quitar', 'Quitar la muestra|Delete|Supr')}</div></div>`;
    } else if (sel === 'decaimiento' && ESC.decaimiento) {
      const d = ESC.decaimiento, P = nuclido(d.clave); ico = 'o-impulso'; titulo = 'Decaimiento puntual';
      nombre = d.tipo === 'fision' ? `Fisión del ${nombreNuclido(d.clave).toLowerCase()}` : `Decaimiento ${SIMB(d.tipo)} del ${nombreNuclido(d.clave).toLowerCase()}`;
      const tipos = [...new Set((P?.modos || []).map(m => m.tipo))].map(k => [k, SIMB(k), TIPOS_DECAIMIENTO[k].nombre]);
      if (FISIBLES[d.clave]) tipos.push(['fision', 'Fisión', 'Fisión inducida por un neutrón lento']);
      h = campoNuclido('Padre', 'decaimiento.clave', 'Núcleo que decae, en reposo|Parent nucleus')
        + fila('Tipo', segmentado('p-tipo', tipos, d.tipo), 'Tipo de decaimiento|Decay mode')
        + (d.tipo === 'fision' ? fila('Fragmentos', `<button class="btn btn-secundario btn-compacto" id="p-frag" aria-haspopup="menu" style="justify-self:start">${volado(d.fragmentos[0])} + ${volado(d.fragmentos[1])} + ${fision(d.clave, d.fragmentos).neutrones} n<svg class="ico"><use href="#i-chevron-abajo"/></svg></button>`, 'Par de fragmentos|Fragments') : '')
        + campo('Dirección', 'decaimiento.direccion', 'adimensional', '°', 'Dirección en que sale la partícula ligera|Direction')
        + (d.tipo === 'beta-' || d.tipo === 'beta+' ? campo('Reparto', 'decaimiento.reparto', 'adimensional', '%', 'Fracción de la energía máxima que se lleva el electrón; el resto, el neutrino|Energy sharing') + campo('Ángulo e–ν', 'decaimiento.angulo', 'adimensional', '°', 'Ángulo entre el electrón y el neutrino|Angle') : '')
        + `<div class="fila"><span class="etq">Objeto</span><div class="acciones-fila">${boton('p-quitar', 'i-borrar', 'Quitar', 'Quitar el decaimiento|Delete|Supr')}</div></div>`;
    }
    props.innerHTML = h;
    $('#insp-ico').setAttribute('href', '#' + ico);
    $('#insp-nombre').textContent = nombre;
    $('#props-titulo').textContent = titulo;
    document.querySelectorAll('#propiedades input[data-ruta]').forEach(campoConUnidad);
    document.querySelectorAll('#propiedades input[data-nuclido]').forEach(campoNuclidoActivo);
    const on = (id, f) => { const e = $(id); if (e) e.addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) f(b.dataset.v, b); }); };
    on('#p-unidad', v => { if (v === ESC.unidadT) return; ESC.unidadT = v; cambio(); });
    on('#p-ramas', v => { const n = nuDe(sel); if (n) { n.ramas = v === 'todas'; cambio(); } });
    on('#p-periodo', v => { const M = ESC.muestra; if (!M) return; if (v === 'tabla') { M.T = null; for (const [k, d] of Object.entries(ESC.variables)) { d.liga = d.liga.filter(r => r !== 'muestra.T'); if (!d.liga.length) delete ESC.variables[k]; } construirVariables(); } else M.T = M.T ?? nuclido(M.clave)?.T ?? 1; cambio(); });
    on('#p-cadena', v => { const M = ESC.muestra; if (!M) return; M.cadena = v === 'si'; if (M.cadena) M.N0 = Math.min(M.N0, 20000); cambio(); });
    on('#p-tipo', v => { const d = ESC.decaimiento; if (!d || v === d.tipo) return; d.tipo = v; if (v === 'fision') d.fragmentos = FISIBLES[d.clave][0].slice(); else delete d.fragmentos; if (v === 'beta-' || v === 'beta+') { d.reparto = d.reparto ?? 0.4; d.angulo = d.angulo ?? 2 * Math.PI / 3; } limpiarVariables(); cambio(); });
    const bf = $('#p-frag'); if (bf) bf.addEventListener('click', ev => { ev.stopPropagation(); menuFragmentos(bf); });
    const clic = (id, f) => { const e = $(id); if (e) e.addEventListener('click', f); };
    clic('#p-quitar', quitarSeleccion);
    clic('#p-seguir', () => seguir(celda));
    clic('#p-a-muestra', () => ponerMuestra(nu ? nu.clave : celda));
    clic('#p-a-dec', () => ponerDecaimiento(celda));
    arbol();
  }

  // Menú de los pares de fragmentos de una fisión
  function menuFragmentos(boton) {
    let m = $('#menu-frag');
    if (!m) { m = document.createElement('div'); m.className = 'menu'; m.id = 'menu-frag'; m.setAttribute('role', 'menu'); m.style.cssText = 'position:fixed;z-index:40;min-width:240px'; document.body.appendChild(m); document.addEventListener('pointerdown', ev => { if (ev.target instanceof Element && !ev.target.closest('#menu-frag, #p-frag')) m.hidden = true; }); }
    if (!m.hidden && m.dataset.abierto === '1') { m.hidden = true; m.dataset.abierto = '0'; return; }
    const d = ESC.decaimiento; if (!d || !FISIBLES[d.clave]) return;
    m.innerHTML = FISIBLES[d.clave].map(([a, b], i) => { const f = fision(d.clave, [a, b]); return `<div class="menu-item" role="menuitem" data-v="${i}"${a === d.fragmentos[0] && b === d.fragmentos[1] ? ' aria-current="true"' : ''}>${volado(a)} + ${volado(b)} + ${f.neutrones} n<span class="atajo">Q = ${fmt(f.Q.MeV, 4)} MeV</span></div>`; }).join('');
    m.onclick = ev => {
      const it = ev.target.closest('.menu-item'); if (!it) return; m.hidden = true; m.dataset.abierto = '0';
      d.fragmentos = FISIBLES[d.clave][+it.dataset.v].slice(); cambio();
      avisar(`Fragmentos: ${d.fragmentos.join(' + ')} y ${fision(d.clave, d.fragmentos).neutrones} neutrones`);
    };
    const rr = boton.getBoundingClientRect(); m.style.left = rr.left + 'px'; m.style.top = (rr.bottom + 4) + 'px'; m.hidden = false; m.dataset.abierto = '1';
  }

  // Lee un núclido escrito: "U-238", "U238", "238U", "238mBa"
  function leerNuclido(txt) {
    const s = String(txt).trim().replace(/\s+/g, '');
    if (s === 'n') return 'n';
    let m = /^([A-Za-z]{1,2})-?(\d{1,3})(m?)$/.exec(s), sim, A, iso;
    if (m) [, sim, A, iso] = m; else { m = /^(\d{1,3})(m?)-?([A-Za-z]{1,2})$/.exec(s); if (m) [, A, iso, sim] = m; }
    if (!m) throw new Error('Escribe el símbolo y el número másico: U-238.');
    sim = sim[0].toUpperCase() + sim.slice(1).toLowerCase();
    if (!SIMBOLOS.includes(sim)) throw new Error(`No hay ningún elemento con el símbolo ${sim}.`);
    const k = `${sim}-${+A}${iso}`;
    if (nuclido(k)) return k;
    if (!iso && nuclido(k + 'm')) return k + 'm';
    throw new Error(`El ${NOMBRES[SIMBOLOS.indexOf(sim)].toLowerCase()}-${+A}${iso} no está en la tabla de Volta.`);
  }
  function campoNuclidoActivo(ent) {
    const caja = ent.closest('.campo'), f = ent.closest('.fila');
    const mostrarError = msj => {
      caja.classList.toggle('es-error', !!msj);
      let p = f.querySelector('.mensaje-error');
      if (msj && !p) { p = document.createElement('p'); p.className = 'mensaje-error'; f.appendChild(p); }
      if (p) { if (msj) p.textContent = msj; else p.remove(); }
    };
    ent.addEventListener('change', () => {
      try {
        const k = leerNuclido(ent.value), ruta = ent.dataset.nuclido, n = nuclido(k);
        if (ruta === 'muestra.clave' && n.T == null) throw new Error(`El ${nombreNuclido(k).toLowerCase()} es estable: no decae.`);
        if (ruta === 'decaimiento.clave') {
          const d = ESC.decaimiento;
          if (!n.modos.length && !FISIBLES[k]) throw new Error(`El ${nombreNuclido(k).toLowerCase()} es estable: no decae.`);
          const tipo = d.tipo === 'fision' && FISIBLES[k] ? 'fision' : n.modos.some(m => m.tipo === d.tipo) ? d.tipo : n.modos[0]?.tipo || 'fision';
          if (tipo !== 'fision' && !(valorQ(k, tipo).MeV > 0)) throw new Error('Su hija no está en la tabla: no se puede calcular el retroceso.');
          d.clave = k; d.tipo = tipo; if (tipo === 'fision') d.fragmentos = FISIBLES[k][0].slice(); else delete d.fragmentos;
          if (tipo === 'beta-' || tipo === 'beta+') { d.reparto = d.reparto ?? 0.4; d.angulo = d.angulo ?? 2 * Math.PI / 3; }
        } else escribir(ruta, k);
        // Otra muestra: su periodo de la tabla, y la línea de tiempo en su escala (5 T½)
        if (ruta === 'muestra.clave') {
          ESC.muestra.T = null; ESC.unidadT = unidadPara(n.T); ESC.duracion = 5 * n.T; t = 0; jugando = false;
          // Un periodo ligado a una variable era el del núclido anterior: se suelta
          for (const [kv, dv] of Object.entries(ESC.variables)) { dv.liga = dv.liga.filter(r => r !== 'muestra.T' && r !== 'duracion'); if (!dv.liga.length) delete ESC.variables[kv]; }
        }
        mostrarError(null); vistaTocada = false; limpiarVariables(); cambio();
      } catch (e) { mostrarError(e.message); }
    });
    ent.addEventListener('keydown', ev => { if (ev.key === 'Escape') { mostrarError(null); ent.blur(); inspector(); } });
  }

  // Validación de cada ruta (en SI)
  function validar(ruta, x) {
    const k = ruta.split('.').pop();
    if (k === 'N0') { const max = ESC.muestra?.cadena ? 20000 : 100000; if (!(x >= 1 && x <= max)) throw new Error(`Los núcleos van de 1 a ${miles(max)}.`); return Math.round(x); }
    if (k === 'T' && !(x >= 1e-9 && x <= 1e20)) throw new Error('El periodo va de 1 ns a 10²⁰ s.');
    if (k === 'semilla') { if (!(x >= 1 && x <= 1e9)) throw new Error('La semilla es un entero de 1 a 10⁹.'); return Math.round(x); }
    if (k === 'duracion' && !(x >= 1e-6 && x <= 1e20)) throw new Error('La duración va de 1 µs a 10²⁰ s.');
    if (k === 'reparto' && !(x >= 0 && x <= 1)) throw new Error('El reparto va de 0 % a 100 %.');
    if (k === 'angulo' && !(x >= 0 && x <= Math.PI)) throw new Error('El ángulo va de 0° a 180°.');
    if (k === 'direccion' && !(Math.abs(x) <= 2 * Math.PI)) throw new Error('La dirección va de −360° a 360°.');
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
        const dim = ent.dataset.dim, u = ent.dataset.u;
        let txt = ent.value.trim().replace(/−/g, '-'), valor;
        // Días y años no son unidades del analizador: se convierten aquí
        const dA = /^(.*?)\s*(d|a)$/.exec(txt);
        if (dim === 'tiempo' && dA && UNI[dA[2]]) valor = evaluar(dA[1], { esperada: 'adimensional' }).valor * UNI[dA[2]];
        else if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(txt) && u) valor = (UNI[u] && dim === 'tiempo') ? parseFloat(txt) * UNI[u] : evaluar(`${txt} ${u}`, { esperada: dim, unidadPorDefecto: u === '°' ? '°' : undefined }).valor;
        else valor = evaluar(txt, { esperada: dim, unidadPorDefecto: u === '°' ? '°' : undefined }).valor;
        const ruta = ent.dataset.ruta, x = validar(ruta, valor);
        escribir(ruta, x);
        mostrarError(null); cambio();
      } catch (e) { mostrarError(e.message); }
    });
    ent.addEventListener('keydown', ev => { if (ev.key === 'Escape') { mostrarError(null); ent.blur(); inspector(); } });
  }

  function arbol() {
    const nodo = (s, ico, nombre, dato) => `<div class="nodo" data-sel="${s}" aria-selected="${sel === s}"><svg class="ico"><use href="#${ico}"/></svg><span class="nombre">${nombre}</span><span class="dato">${dato}</span></div>`;
    let h = nodo('escena', 'i-escena', 'Escena', `${fmt(ESC.duracion / U(), 3)} ${ESC.unidadT}`);
    for (const n of ESC.nuclidos) { const c = cadena(n.clave); h += nodo(n.id, 'o-nucleo', nombreNuclido(n.clave), c.pasos.length ? `→ ${c.fin}` : 'estable'); }
    if (ESC.muestra) h += nodo('muestra', 'o-muestra', `Muestra de ${ESC.muestra.clave}`, `N₀ = ${miles(ESC.muestra.N0)}`);
    if (ESC.decaimiento) h += nodo('decaimiento', 'o-impulso', ESC.decaimiento.tipo === 'fision' ? 'Fisión' : `Decaimiento ${SIMB(ESC.decaimiento.tipo)}`, ESC.decaimiento.clave);
    if (sel.startsWith('celda:')) h += nodo(sel, 'o-nucleo', nombreNuclido(sel.slice(6)), 'en la carta');
    $('#arbol').innerHTML = h;
    $('#arbol').querySelectorAll('.nodo[data-sel]').forEach(n => n.addEventListener('click', () => seleccionar(n.dataset.sel)));
  }
  function seleccionar(s) { if (s === sel) return; sel = s; inspector(); todo(); marcarHerramientas(); }

  const lectura = ([a, b, val, u, ayuda]) => `<span class="sim"${ayuda ? ` data-ayuda="${ayuda}"` : ''}>${a}${b ? `<sub class="r">${b}</sub>` : ''}</span><span class="v">${val}</span><span class="u">${u}</span>`;
  function lecturasNuclido(k, f) {
    const n = nuclido(k); if (!n) return '';
    const [Tv, Tu] = periodoEn(n.T);
    f.push(['Z', '', String(n.Z), '', 'Protones|Atomic number'], ['N', '', String(n.A - n.Z), '', 'Neutrones|Neutron number'], ['A', '', String(n.A), '', 'Número másico|Mass number'],
      ['M', '', fmt(n.masa, 7), 'u', 'Masa atómica|Atomic mass'], ['T', '½', Tv, Tu, 'Periodo de semidesintegración|Half-life'], ['B/A', '', fmt(energiaEnlace(k).porNucleon, 4), 'MeV', 'Energía de enlace por nucleón|Binding energy per nucleon']);
    for (const m of n.modos) { const q = valorQ(k, m).MeV; f.push(['Q', SIMB(m.tipo), Number.isFinite(q) ? fmt(q, 4) : '—', 'MeV', `Energía liberada; rama ${fmt(m.rama * 100, 4)} %|Q value`]); }
    const c = cadena(k);
    if (c.pasos.length > 1) { const n2 = contarPasos(c.pasos); f.push(['n', 'α', String(n2.alfa), '', 'Decaimientos α hasta el final de la cadena|Alpha decays'], ['n', 'β⁻', String(n2['beta-']), '', 'Decaimientos β⁻ hasta el final|Beta decays']); }
    return n.T == null ? 'Estable' : `${n.modos.map(m => SIMB(m.tipo)).join(', ')} · T½ = ${periodoTexto(n.T)}${c.pasos.length > 1 ? ` · termina en ${c.fin}` : ''}`;
  }
  function lecturas() {
    document.querySelectorAll('[data-var]').forEach(e => { const d = ESC.variables[e.dataset.var]; if (d) e.textContent = fmtVar(d); });
    $('#reloj').innerHTML = `<span class="sim">t</span>${fmt(t / U(), 4).padStart(6, ' ')}<span class="u">${ESC.unidadT}</span>`;
    $('#b-play').innerHTML = `<svg class="ico"><use href="#i-${jugando ? 'pausar' : 'reproducir'}"/></svg>`;
    $('#b-play').dataset.ayuda = jugando ? 'Pausar|Pause|Espacio' : 'Reproducir|Play|Espacio';
    const hayT = !!ESC.muestra;
    ['#b-play', '#b-reiniciar', '#b-atras', '#b-adelante'].forEach(id => { $(id).disabled = !hayT; });
    const f = [], nu = nuDe(sel);
    let estado = '';
    $('#lect-titulo').textContent = sel === 'muestra' ? `Lecturas en t = ${fmt(t / U(), 4)} ${ESC.unidadT}` : 'Lecturas';
    if (nu) estado = lecturasNuclido(nu.clave, f);
    else if (sel.startsWith('celda:')) estado = lecturasNuclido(sel.slice(6), f);
    else if (sel === 'muestra' && ESC.muestra) {
      const m = muestra(), T = periodoMuestra();
      if (m) {
        const N = restantes(m, t), lam = constanteDecaimiento(T), pm = periodoMedido(m, t);
        f.push(['N', '', miles(N), '', 'Núcleos que quedan sin decaer|Remaining nuclei'], ['N', 'teo', fmt(leyExponencial(m.N0, T, t), 5), '', 'N₀·2^(−t/T½)|Exponential law'],
          ['A', '', fmtE(lam * N, 4), 'Bq', 'Actividad λN: desintegraciones por segundo|Activity'], ['λ', '', fmtE(lam, 4), 's⁻¹', 'Constante de decaimiento ln 2/T½|Decay constant'],
          ['T', '½', ...periodoEn(T), 'Periodo de semidesintegración|Half-life'],
          ['T', '½ med', ...(pm.mediana != null ? periodoEn(pm.mediana) : ['—', '']), 'Periodo medido: instante en que queda la mitad|Measured half-life'],
          ['T', '½ ajuste', ...(pm.ajuste != null ? periodoEn(pm.ajuste) : ['—', '']), 'Periodo de máxima verosimilitud con lo observado hasta t|Fitted half-life']);
        estado = `${miles(N)} de ${miles(m.N0)} sin decaer`;
      } else estado = ERROR || '';
    } else if (sel === 'decaimiento' && ESC.decaimiento) {
      const r = decaimiento();
      if (r && !r.error) {
        f.push(['Q', '', fmt(r.Q.MeV, 5), 'MeV', 'Energía liberada (masas atómicas)|Q value']);
        const prods = r.productos.filter(p => p.pMeV > 0);
        for (const p of prods) {
          const s = p.clave && p.clave !== 'He-4' ? SIMBOLOS[nuclido(p.clave).Z] : p.simbolo;
          f.push(['K', s, fmt(p.KMeV, 4), 'MeV', `Energía cinética: ${p.nombre}|Kinetic energy`]);
        }
        for (const p of prods) {
          const s = p.clave && p.clave !== 'He-4' ? SIMBOLOS[nuclido(p.clave).Z] : p.simbolo;
          f.push(['p', s, fmtE(Math.hypot(...p.p), 4), 'kg·m/s', `Momento: ${p.nombre}|Momentum`]);
        }
        for (const p of prods) {
          const s = p.clave && p.clave !== 'He-4' ? SIMBOLOS[nuclido(p.clave).Z] : p.simbolo;
          f.push(['v', s, p.mMeV > 0 ? fmtE(p.v, 4) : 'c', p.mMeV > 0 ? 'm/s' : '', `Rapidez: ${p.nombre}|Speed`]);
        }
        if (prods.length === 2) {
          const [a, b] = prods;
          f.push(['v/V', '', fmt(a.v / b.v, 5), '', 'Cociente de rapideces (relativista exacto)|Speed ratio']);
          if (a.mMeV > 0) f.push(['M/m', '', fmt(b.mMeV / a.mMeV, 5), '', 'Cociente de masas: el de rapideces según Newton|Mass ratio'], ['K/K', '', fmt(a.KMeV / b.KMeV, 5), '', 'Reparto de la energía cinética|Energy ratio']);
        }
        const pT = Math.hypot(...r.balance.p), pM = Math.max(...prods.map(p => Math.hypot(...p.p)));
        f.push(['|Σp|', '', pT < 1e-9 * pM ? '0' : fmtE(pT, 2), 'kg·m/s', 'Momento total: se conserva (era cero)|Total momentum']);
        estado = `${r.tipo === 'fision' ? 'Fisión' : 'Decaimiento ' + SIMB(r.tipo)}: ${volado(r.padre)} → ${r.productos.filter(p => p.simbolo !== 'n').map(p => p.clave && p.clave !== 'He-4' ? volado(p.clave) : p.simbolo).join(' + ')}${r.tipo === 'fision' ? ` + ${r.neutrones} n` : ''}`;
      } else estado = r?.error || '';
    } else {
      f.push(['n', '', String(ESC.nuclidos.length), '', 'Núclidos seguidos|Followed nuclides']);
      estado = [ESC.nuclidos.length ? `${ESC.nuclidos.length} ${ESC.nuclidos.length > 1 ? 'cadenas' : 'cadena'}` : '', ESC.muestra ? 'muestra' : '', ESC.decaimiento ? 'decaimiento' : ''].filter(Boolean).join(' · ');
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
  function aplicarVariables() {
    for (const d of Object.values(ESC.variables)) for (const r of d.liga) { if (existe(r)) { let x = d.val * d.factor + (d.offset || 0); if (r.endsWith('N0') || r.endsWith('semilla')) x = Math.round(x); escribir(r, x); } }
  }
  function limpiarVariables() {
    for (const [k, d] of Object.entries(ESC.variables)) {
      d.liga = d.liga.filter(r => existe(r) && !(r.startsWith('decaimiento.') && (r.endsWith('reparto') || r.endsWith('angulo')) && !['beta-', 'beta+'].includes(ESC.decaimiento?.tipo)));
      if (!d.liga.length) delete ESC.variables[k];
    }
    construirVariables();
  }

  // ---------------------------------------------------------------------
  // Gráficas
  // ---------------------------------------------------------------------
  const vacia = (n, msj) => { grafica($(`#g${n}`), { x: { min: 0, max: 1 }, y: { min: 0, max: 1 }, series: [] }); $(`#t${n}`).textContent = msj; $(`#l${n}`).textContent = ''; };
  function graficas() { if (!$('#p-graficas').hidden) ESC.graficas.forEach((g, j) => { try { grafica1(j + 1, g); } catch (e) { vacia(j + 1, 'Sin datos'); console.error(e); } }); }
  const muestras = (a, b, n, f) => { const r = []; for (let i = 0; i <= n; i++) { const x = a + (b - a) * i / n; r.push([x, f(x)]); } return r; };
  // Marcas cortas para nubes de puntos (la gráfica solo traza líneas)
  const marcas = (pts, ancho) => pts.map(([x, y]) => [[x - ancho, y], [x + ancho, y]]);
  // Emisores α de la tabla con su retroceso (para las gráficas de reparto)
  let EMISORES = null;
  function emisoresAlfa() {
    if (EMISORES) return EMISORES;
    EMISORES = [];
    for (const [k, n] of Object.entries(NUCLIDOS)) {
      if (!n.modos.some(m => m.tipo === 'alfa')) continue;
      try { const r = retroceso(k, 'alfa'); const [a, b] = r.productos; EMISORES.push({ k, A: n.A, cociente: a.v / b.v, reparto: a.KMeV / r.Q.MeV }); } catch { /* hija fuera de la tabla */ }
    }
    return EMISORES;
  }
  function grafica1(n, tipo) {
    const cv = $(`#g${n}`), T = $(`#t${n}`), Lc = $(`#l${n}`), u = ESC.unidadT, fu = U();
    if (tipo === 'N' || tipo === 'lnN' || tipo === 'actividad') {
      const m = muestra(); if (!m) { vacia(n, 'Sin muestra radiactiva'); return; }
      const Tp = periodoMuestra(), dur = ESC.duracion, lam = constanteDecaimiento(Tp);
      if (tipo === 'N') {
        const pts = muestras(0, dur, 300, x => restantes(m, x)).map(([x, y]) => [x / fu, y]);
        const teo = muestras(0, dur, 200, x => leyExponencial(m.N0, Tp, x)).map(([x, y]) => [x / fu, y]);
        const series = [{ tramos: [pts], familia: 'tinta' }, { tramos: [teo], familia: 'texto-3', auxiliar: true }];
        let hija = null;
        if (m.especies.length > 1) {
          let mejor = 1; for (let j = 1; j < m.especies.length; j++) if (poblacion(m, j, dur) > poblacion(m, mejor, dur)) mejor = j;
          hija = m.especies[mejor];
          series.push({ tramos: [muestras(0, dur, 300, x => poblacion(m, mejor, x)).map(([x, y]) => [x / fu, y])], familia: 'tinta', patron: 'discontinuo' });
        }
        const pm = periodoMedido(m, t), ev = ESC.capas.cronometro ? [...Array.from({ length: 8 }, (_, k) => (k + 1) * Tp).filter(x => x <= dur).map(x => ({ x: x / fu })), ...(pm.mediana != null ? [{ x: pm.mediana / fu, y: m.N0 / 2 }] : [])] : [];
        grafica(cv, { x: { min: 0, max: dur / fu }, y: { min: 0, max: m.N0 * 1.05 }, series, cursor: t / fu, puntoCursor: [t / fu, restantes(m, t)], eventos: ev });
        T.innerHTML = `<span class="leyenda"><span style="color:var(--tinta)"><i></i>${simHTML('N')}</span>${hija ? `<span style="color:var(--tinta)"><i class="discontinua"></i>${hija}</span>` : ''}</span> contra ${simHTML('t')} (${u})`;
        Lc.textContent = miles(restantes(m, t));
        return;
      }
      if (tipo === 'lnN') {
        const pts = []; for (let i = 0; i <= 120; i++) { const x = dur * i / 120, N = restantes(m, x); if (N > 0) pts.push([x / fu, Math.log(N)]); }
        const pm = periodoMedido(m, Math.max(t, dur * 1e-3)), lamA = pm.ajuste ? Math.LN2 / pm.ajuste : lam;
        const ys = pts.map(p => p[1]), ymin = Math.min(...ys, Math.log(m.N0) - lam * dur) - 0.3, ymax = Math.log(m.N0) + 0.3;
        grafica(cv, { x: { min: 0, max: dur / fu }, y: { min: ymin, max: ymax }, series: [{ tramos: [pts], familia: 'tinta' }, { tramos: [[[0, Math.log(m.N0)], [dur / fu, Math.log(m.N0) - lamA * dur]]], familia: 'tinta', patron: 'discontinuo' }], cursor: t / fu });
        T.innerHTML = `<span class="leyenda"><span style="color:var(--tinta)"><i></i>ln ${simHTML('N')}</span><span style="color:var(--tinta)"><i class="discontinua"></i>ajuste</span></span> contra ${simHTML('t')} (${u})`;
        Lc.textContent = pm.ajuste ? `T½ = ${periodoTexto(pm.ajuste)}` : '';
        return;
      }
      // Actividad: desintegraciones por unidad de tiempo en 40 intervalos
      const nb = 40, dt = dur / nb, pts = [];
      for (let i = 0; i < nb; i++) { const a = desintegraciones(m, i * dt, (i + 1) * dt) / (dt / fu); pts.push([i * dt / fu, a], [(i + 1) * dt / fu, a]); }
      const teo = muestras(0, dur, 200, x => lam * m.N0 * Math.exp(-lam * x) * fu).map(([x, y]) => [x / fu, y]);
      const ymax = Math.max(...pts.map(p => p[1]), lam * m.N0 * fu) * 1.1;
      const ia = Math.min(nb - 1, Math.floor(t / dt));
      grafica(cv, { x: { min: 0, max: dur / fu }, y: { min: 0, max: ymax }, series: [{ tramos: [pts], familia: 'tinta' }, { tramos: [teo], familia: 'texto-3', auxiliar: true }], cursor: t / fu });
      T.innerHTML = `${simHTML('A')} (desintegraciones/${u}) contra ${simHTML('t')} (${u})`;
      Lc.textContent = fmt(pts[2 * ia][1], 4);
      return;
    }
    if (tipo === 'cadenaZA' || tipo === 'cadenaT' || tipo === 'cadenaQ') {
      const k = claveRef(); if (!k) { vacia(n, 'Sin núclido: elige uno en la carta'); return; }
      const c = cadena(k);
      if (!c.pasos.length) { vacia(n, `${nombreNuclido(k)} es estable`); return; }
      if (tipo === 'cadenaZA') {
        const pts = [[nuclido(k).A, nuclido(k).Z]];
        for (const p of c.pasos) { const h = nuclido(p.hacia) || aplicarRegla(nuclido(p.desde), p.tipo); pts.push([h.A, h.Z]); }
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        grafica(cv, { x: { min: Math.min(...xs) - 2, max: Math.max(...xs) + 2 }, y: { min: Math.min(...ys) - 1, max: Math.max(...ys) + 1 }, series: [{ tramos: [pts], familia: 'tinta' }, { tramos: marcas(pts, 0.6), familia: 'tinta' }] });
        const n2 = contarPasos(c.pasos);
        T.innerHTML = `${simHTML('Z')} contra ${simHTML('A')} · ${k} → ${c.fin}`;
        Lc.textContent = `${n2.alfa} α · ${n2['beta-']} β⁻`;
        return;
      }
      if (tipo === 'cadenaT') {
        const pts = []; c.pasos.forEach((p, i) => { const y = Math.log10(p.T); pts.push([i + 0.6, y], [i + 1.4, y]); });
        const ys = pts.map(p => p[1]);
        grafica(cv, { x: { min: 0.4, max: c.pasos.length + 0.6 }, y: { min: Math.floor(Math.min(...ys)) - 1, max: Math.ceil(Math.max(...ys)) + 1 }, series: [{ tramos: c.pasos.map((p, i) => [[i + 0.6, Math.log10(p.T)], [i + 1.4, Math.log10(p.T)]]), familia: 'tinta' }] });
        T.innerHTML = `log₁₀(${simHTML('T', '½')}/s) de cada paso`;
        const larga = c.pasos.reduce((a, b) => (b.T > a.T ? b : a));
        Lc.textContent = `máx ${larga.desde}`;
        return;
      }
      const qs = c.pasos.map(p => (Number.isFinite(p.Q) ? p.Q : 0));
      grafica(cv, { x: { min: 0.4, max: c.pasos.length + 0.6 }, y: { min: 0, max: Math.max(...qs, 1) * 1.15 }, series: [{ tramos: c.pasos.map((p, i) => [[i + 0.6, qs[i]], [i + 1.4, qs[i]]]), familia: 'tinta' }] });
      T.innerHTML = `${simHTML('Q')} (MeV) de cada paso`;
      Lc.textContent = `Σ = ${fmt(qs.reduce((s, x) => s + x, 0), 4)} MeV`;
      return;
    }
    if (tipo === 'cocienteV' || tipo === 'reparto') {
      const E = emisoresAlfa(), d = ESC.decaimiento, esV = tipo === 'cocienteV';
      const pts = E.map(e => [e.A, esV ? e.cociente : e.reparto]);
      const Amin = Math.min(...E.map(e => e.A)) - 6, Amax = Math.max(...E.map(e => e.A)) + 4;
      const linea = muestras(Amin, Amax, 100, A => (esV ? (A - 4) / 4 : (A - 4) / A));
      const ys = [...pts.map(p => p[1]), ...linea.map(p => p[1])];
      let cursor = null;
      if (d && d.tipo === 'alfa') { const r = decaimiento(); if (r && !r.error) { const [a, b] = r.productos; cursor = [nuclido(d.clave).A, esV ? a.v / b.v : a.KMeV / r.Q.MeV]; } }
      grafica(cv, { x: { min: Amin, max: Amax }, y: { min: Math.min(...ys) - (esV ? 1 : 0.0005), max: Math.max(...ys) + (esV ? 1 : 0.0005) }, series: [{ tramos: marcas(pts, 0.9), familia: 'tinta' }, { tramos: [linea], familia: 'texto-3', auxiliar: true }], cursor: cursor ? cursor[0] : null, puntoCursor: cursor });
      T.innerHTML = esV ? `${simHTML('v', 'α')}/${simHTML('V')} contra ${simHTML('A')} del padre` : `${simHTML('K', 'α')}/${simHTML('Q')} contra ${simHTML('A')} del padre`;
      Lc.textContent = cursor ? fmt(cursor[1], 4) : 'solo α';
      return;
    }
    if (tipo === 'enlace') {
      const pts = Object.entries(NUCLIDOS).filter(([k, nn]) => nn.A >= 2 && !k.endsWith('m')).map(([k, nn]) => [nn.A, energiaEnlace(k).porNucleon]);
      const d = ESC.decaimiento, marcados = [];
      if (d) { const ks = [d.clave, ...(d.tipo === 'fision' ? d.fragmentos : [hijoDe(d.clave, { tipo: d.tipo, rama: 1 })])]; for (const k of ks) { const nn = nuclido(k); if (nn) marcados.push({ x: nn.A, y: energiaEnlace(k).porNucleon }); } }
      grafica(cv, { x: { min: 0, max: 250 }, y: { min: 0, max: 9.5 }, series: [{ tramos: marcas(pts, 1.6), familia: 'tinta' }], eventos: marcados });
      T.innerHTML = `${simHTML('B')}/${simHTML('A')} (MeV) contra ${simHTML('A')}`;
      Lc.textContent = d ? `${fmt(energiaEnlace(d.clave).porNucleon, 4)} MeV` : '';
      return;
    }
    if (tipo === 'fisionQ' || tipo === 'repartoFision') {
      const d = ESC.decaimiento; if (!d || d.tipo !== 'fision') { vacia(n, 'Sin fisión'); return; }
      const pares = FISIBLES[d.clave] || [];
      if (tipo === 'fisionQ') {
        const pts = pares.map(([a, b]) => [nuclido(a).A, fision(d.clave, [a, b]).Q.MeV]);
        const act = [nuclido(d.fragmentos[0]).A, fision(d.clave, d.fragmentos).Q.MeV];
        grafica(cv, { x: { min: 130, max: 150 }, y: { min: 150, max: 200 }, series: [{ tramos: marcas(pts, 0.35), familia: 'tinta' }], eventos: pts.map(([x, y]) => ({ x, y })), puntoCursor: act, cursor: act[0] });
        T.innerHTML = `${simHTML('Q')} (MeV) de cada par`;
        Lc.textContent = `${fmt(act[1], 4)} MeV`;
        return;
      }
      const r = decaimiento(); if (!r || r.error) { vacia(n, 'Sin datos'); return; }
      const [f1, f2] = r.productos, A1 = nuclido(f1.clave).A, A2 = nuclido(f2.clave).A, At = A1 + A2, Q = r.Q.MeV;
      const curva = muestras(60, 180, 120, A => Q * (At - A) / At);
      grafica(cv, { x: { min: 60, max: 180 }, y: { min: 0, max: Q * 0.9 }, series: [{ tramos: [curva], familia: 'texto-3', auxiliar: true }, { tramos: marcas([[A1, f1.KMeV], [A2, f2.KMeV]], 1.2), familia: 'movimiento' }], eventos: [{ x: A1, y: f1.KMeV }, { x: A2, y: f2.KMeV }] });
      T.innerHTML = `${simHTML('K')} (MeV) contra ${simHTML('A')}`;
      Lc.textContent = `${fmt(f1.KMeV, 4)} · ${fmt(f2.KMeV, 4)}`;
      return;
    }
    if (tipo === 'balanceBeta' || tipo === 'momentoBeta') {
      const d = ESC.decaimiento; if (!d || (d.tipo !== 'beta-' && d.tipo !== 'beta+')) { vacia(n, 'Sin decaimiento β'); return; }
      const datos = muestras(0, 1, 60, x => retroceso(d.clave, d.tipo, { reparto: x, angulo: d.angulo ?? 2 * Math.PI / 3, direccion: 0 }));
      const x100 = datos.map(([x]) => x * 100), esP = tipo === 'momentoBeta';
      const val = (r, i) => (esP ? r.productos[i].pMeV : r.productos[i].KMeV);
      const s = [0, 1, 2].map(i => datos.map(([, r], j) => [x100[j], val(r, i)]));
      const ymax = Math.max(...s.flat().map(p => p[1])) * 1.1;
      const act = retroceso(d.clave, d.tipo, { reparto: d.reparto ?? 0.4, angulo: d.angulo ?? 2 * Math.PI / 3, direccion: 0 });
      const fam = esP ? 'inercia' : 'movimiento';
      grafica(cv, { x: { min: 0, max: 100 }, y: { min: 0, max: ymax }, series: [{ tramos: [s[0]], familia: fam }, { tramos: [s[1]], familia: fam, patron: 'discontinuo' }, { tramos: [s[2]], familia: fam, patron: 'punteado' }], cursor: (d.reparto ?? 0.4) * 100, puntoCursor: [(d.reparto ?? 0.4) * 100, val(act, 0)] });
      const v = `var(--f-${fam})`, nu = d.tipo === 'beta-' ? 'ν̄' : 'ν';
      const hijo = act.productos[2].clave;
      const sim = esP ? 'p' : 'K', sn = SIMBOLOS[nuclido(hijo).Z];
      T.innerHTML = `<span class="leyenda"><span style="color:${v}"><i></i>${simHTML(sim, 'e')}</span><span style="color:${v}"><i class="discontinua"></i>${simHTML(esP ? 'p' : 'E', nu)}</span><span style="color:${v}">···${simHTML(sim, sn)}</span></span> (${esP ? 'MeV/c' : 'MeV'})`;
      Lc.textContent = esP ? `${fmt(val(act, 0), 3)} MeV/c` : `${fmt(val(act, 0), 3)} MeV`;
      return;
    }
    vacia(n, '');
  }

  // ---------------------------------------------------------------------
  // Pestañas: cadena, balance y tabla; exportación
  // ---------------------------------------------------------------------
  function tablas() {
    const k = claveRef(), c = k ? cadena(k) : null;
    if (c && c.pasos.length) {
      const n2 = contarPasos(c.pasos);
      $('#t-cadena').innerHTML = '<tr><th>Paso</th><th>Desde</th><th>Decaimiento</th><th>Hacia</th><th>T½ del que decae</th><th>Q (MeV)</th><th>Rama</th></tr>'
        + c.pasos.map((p, i) => `<tr><td class="texto">${i + 1}</td><td class="texto">${volado(p.desde)}</td><td class="texto">${SIMB(p.tipo)}</td><td class="texto">${nuclido(p.hacia) ? volado(p.hacia) : p.hacia + ' (fuera de la tabla)'}</td><td>${periodoTexto(p.T)}</td><td>${Number.isFinite(p.Q) ? fmt(p.Q, 4) : '—'}</td><td>${fmt(p.rama * 100, 4)} %</td></tr>`).join('')
        + `<tr class="actual"><td class="texto" colspan="7">${volado(k)} → ${volado(c.fin)}${c.estable ? ' (estable)' : ''}: ${n2.alfa} α, ${n2['beta-']} β⁻${n2['beta+'] ? `, ${n2['beta+']} β⁺` : ''}${n2.ce ? `, ${n2.ce} CE` : ''}${n2.gamma ? `, ${n2.gamma} γ` : ''}</td></tr>`;
    } else $('#t-cadena').innerHTML = `<tr><td class="texto">${k ? `${nombreNuclido(k)} es estable: no tiene cadena.` : 'Elige un núclido en la carta o sigue uno desde la paleta.'}</td></tr>`;
    // Balance del decaimiento puntual
    const r = decaimiento();
    if (r && !r.error) {
      const prods = r.productos.filter(p => p.pMeV > 0), pmax = Math.max(...prods.map(p => p.pMeV));
      const nombre = p => (p.clave && p.clave !== 'He-4' ? volado(p.clave) : p.nombre);
      $('#barras-k').innerHTML = '<div class="barras-tit">Energía cinética de cada producto</div>' + prods.map(p => `<div class="barra-e"><span>${nombre(p)}</span><span class="riel"><i style="width:${(100 * p.KMeV / r.Q.MeV).toFixed(2)}%;background:var(--f-movimiento)"></i></span><span class="v">${fmt(p.KMeV, 4)}${ESP}MeV</span></div>`).join('')
        + `<div class="barras-pie">Q = ${fmt(r.Q.MeV, 5)} MeV · ΣK = ${fmt(r.balance.K / MEV, 5)} MeV</div>`;
      $('#barras-p').innerHTML = '<div class="barras-tit">Momento de cada producto</div>' + prods.map(p => `<div class="barra-e"><span>${nombre(p)}</span><span class="riel"><i style="width:${(100 * p.pMeV / pmax).toFixed(2)}%;background:var(--f-inercia)"></i></span><span class="v">${fmtE(Math.hypot(...p.p), 3)}</span></div>`).join('')
        + `<div class="barras-pie">en kg·m/s · Σp = 0: se conserva</div>`;
    } else { $('#barras-k').innerHTML = '<div class="barras-tit">Sin decaimiento puntual</div><div class="barras-pie">Añade uno desde la paleta para ver el reparto de energía y de momento.</div>'; $('#barras-p').innerHTML = ''; }
    // N(t)
    const m = muestra();
    if (m) {
      const Tp = periodoMuestra(), nf = 40, dur = ESC.duracion, u = ESC.unidadT, fu = U();
      let filas = `<tr><th>t (${u})</th><th>N</th><th>N teórico</th><th>Desintegraciones desde la fila anterior</th></tr>`;
      let cerca = Math.round(t / dur * nf);
      for (let i = 0; i <= nf; i++) { const x = dur * i / nf; filas += `<tr class="${i === cerca ? 'actual' : ''}"><td>${fmt(x / fu, 4)}</td><td>${miles(restantes(m, x))}</td><td>${fmt(leyExponencial(m.N0, Tp, x), 5)}</td><td>${i ? miles(desintegraciones(m, dur * (i - 1) / nf, x)) : '—'}</td></tr>`; }
      $('#t-datos').innerHTML = filas;
    } else $('#t-datos').innerHTML = '<tr><td class="texto">Sin muestra radiactiva: añade una desde la paleta.</td></tr>';
  }
  function exportarCSV() {
    if (!$('#p-cadena').hidden) return exportarCadena();
    if (!$('#p-balance').hidden) return exportarBalance();
    return exportarMuestra();
  }
  function exportarCadena() {
    const k = claveRef(); if (!k) return;
    const filas = cadena(k).pasos.map((p, i) => [i + 1, p.desde, p.tipo, p.hacia, p.T, p.Q, p.rama]);
    descargarTexto(`${nombreArchivo(ESC.titulo)}-cadena.csv`, aCSV(['paso', 'desde', 'tipo', 'hacia', 'T1/2 (s)', 'Q (MeV)', 'rama'], filas)).then(r => { if (r) avisarLienzo(area, `Cadena exportada: ${filas.length} pasos`); });
  }
  function exportarBalance() {
    const r = decaimiento(); if (!r || r.error) { avisar('Sin decaimiento puntual', false); return; }
    const filas = r.productos.map(p => [p.nombre, p.mMeV, p.p[0], p.p[1], p.KMeV, p.v]);
    descargarTexto(`${nombreArchivo(ESC.titulo)}-balance.csv`, aCSV(['producto', 'masa (MeV/c2)', 'px (kg m/s)', 'py (kg m/s)', 'K (MeV)', 'v (m/s)'], filas)).then(x => { if (x) avisarLienzo(area, 'Balance exportado'); });
  }
  function exportarMuestra() {
    const m = muestra(); if (!m) { avisar('Sin muestra radiactiva', false); return; }
    const Tp = periodoMuestra(), n = 200, filas = [];
    for (let i = 0; i <= n; i++) { const x = ESC.duracion * i / n, fila = [x, restantes(m, x), leyExponencial(m.N0, Tp, x)]; m.especies.forEach((_, j) => { if (j) fila.push(poblacion(m, j, x)); }); filas.push(fila); }
    descargarTexto(`${nombreArchivo(ESC.titulo)}-muestra.csv`, aCSV(['t (s)', `N ${m.especies[0]}`, 'N teorico', ...m.especies.slice(1).map(k => `N ${k}`)], filas)).then(x => { if (x) avisarLienzo(area, `Datos exportados: ${filas.length} filas`); });
  }
  function exportarPNG() { descargarLienzo(lienzo, `${nombreArchivo(ESC.titulo)}.png`).then(r => { if (r) avisarLienzo(area, 'Imagen del lienzo exportada'); }); }
  $('#b-exportar').addEventListener('click', exportarCSV);

  // ---------------------------------------------------------------------
  // Ciclo
  // ---------------------------------------------------------------------
  const lt = new LineaTiempo($('#tl'), { duracion: 1, eventos: [], alCambiar: x => { if (!ESC.muestra) return; t = x * U(); jugando = false; todo(); } });
  function todo() {
    dibujar(); lecturas(); lt.poner(t / U()); graficas();
    if (!$('#p-cadena').hidden || !$('#p-balance').hidden || !$('#p-tabla').hidden) tablas();
  }
  function recalcular() {
    lt.duracion = ESC.duracion / U(); lt.simulado = lt.duracion;
    t = Math.min(t, ESC.duracion);
    muestra();
    if (!vistaTocada) encuadrar();
    todo(); arbol();
    if (autoguardar) autoguardado.guardar('moderna-nucleo', escenaActual());
  }
  function cambio() { aplicarVariables(); recalcular(); registrar(); inspector(); }
  function titulo2() {
    $('#escena-nombre').textContent = ESC.titulo;
    const chip = $('#escena-chip');
    chip.textContent = ESC.tipo === 'MEXT' ? `MEXT ${ESC.anio || ''}`.trim() : ESC.tipo || 'Propio';
    chip.className = 'chip' + (ESC.tipo === 'MEXT' ? ' lleno' : '');
    document.title = `Volta · Núcleo · ${ESC.titulo}`;
    document.querySelectorAll('.capa-btn').forEach(b => b.setAttribute('aria-pressed', String(!!ESC.capas[b.dataset.capa])));
    marcarHerramientas();
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
  function seguir(k) {
    if (!k || !nuclido(k)) return;
    const ya = ESC.nuclidos.find(n => n.clave === k);
    if (ya) { seleccionar(ya.id); return; }
    if (ESC.nuclidos.length >= 12) { avisar('Se siguen como mucho doce núclidos', false); return; }
    let id; do { id = 'n' + (++contador); } while (nuDe(id));
    ESC.nuclidos.push({ id, clave: k, ramas: false }); sel = id; vistaTocada = false;
    cambio(); const c = cadena(k); avisar(c.pasos.length ? `${nombreNuclido(k)}: ${c.pasos.length} pasos hasta ${c.fin}` : `${nombreNuclido(k)} es estable`);
  }
  function ponerMuestra(k) {
    const n = nuclido(k);
    if (!n || n.T == null) { avisar(k ? `${nombreNuclido(k)} es estable: no decae` : 'Elige un núclido radiactivo', false); return; }
    for (const [kv, d] of Object.entries(ESC.variables)) { d.liga = d.liga.filter(r => !r.startsWith('muestra.')); if (!d.liga.length) delete ESC.variables[kv]; }
    ESC.muestra = { clave: k, N0: 2000, T: null, cadena: false, semilla: 1 };
    ESC.unidadT = unidadPara(n.T); ESC.duracion = 5 * n.T; t = 0; sel = 'muestra'; vistaTocada = false;
    construirVariables(); cambio(); avisar(`Muestra de ${nombreNuclido(k).toLowerCase()}: T½ = ${periodoTexto(n.T)}`);
  }
  function ponerDecaimiento(k) {
    const n = nuclido(k);
    if (!n || (!n.modos.length && !FISIBLES[k])) { avisar(k ? `${nombreNuclido(k)} es estable: no decae` : 'Elige un núclido radiactivo', false); return; }
    const modo = n.modos.find(m => valorQ(k, m).MeV > 0);
    if (!modo) { avisar('Su hija no está en la tabla: no se puede calcular el retroceso', false); return; }
    for (const [kv, d] of Object.entries(ESC.variables)) { d.liga = d.liga.filter(r => !r.startsWith('decaimiento.')); if (!d.liga.length) delete ESC.variables[kv]; }
    ESC.decaimiento = { clave: k, tipo: modo.tipo, direccion: 0, ...(modo.tipo === 'beta-' || modo.tipo === 'beta+' ? { reparto: 0.4, angulo: 2 * Math.PI / 3 } : {}) };
    sel = 'decaimiento'; vistaTocada = false;
    construirVariables(); cambio(); avisar(`Decaimiento ${SIMB(modo.tipo)} del ${nombreNuclido(k).toLowerCase()}`);
  }
  function quitarSeleccion() {
    const nu = nuDe(sel);
    if (nu) { ESC.nuclidos.splice(ESC.nuclidos.indexOf(nu), 1); sel = 'escena'; cambio(); avisar(`Se deja de seguir ${nombreNuclido(nu.clave).toLowerCase()}`); return; }
    if (sel === 'muestra' && ESC.muestra) { ESC.muestra = null; t = 0; jugando = false; sel = 'escena'; limpiarVariables(); vistaTocada = false; cambio(); avisar('Se quita la muestra'); return; }
    if (sel === 'decaimiento' && ESC.decaimiento) { ESC.decaimiento = null; sel = 'escena'; limpiarVariables(); vistaTocada = false; cambio(); avisar('Se quita el decaimiento'); }
  }

  // ---------------------------------------------------------------------
  // Escena: guardar, abrir, autoguardado, deshacer
  // ---------------------------------------------------------------------
  const copia = o => JSON.parse(JSON.stringify(o));
  const instantanea = () => { const o = copia(ESC); o.sel = sel; return o; };
  function escenaActual() { return crearEscena({ modulo: 'moderna', espacio: 'nucleo', titulo: ESC.titulo, datos: instantanea() }); }
  const RUTA_OK = /^(duracion|muestra\.(N0|T|semilla)|decaimiento\.(direccion|reparto|angulo))$/;
  const claveSegura = k => (typeof k === 'string' && nuclido(k) ? k : null);
  // Valida y acota lo que viene de un archivo antes de usarlo (entrada no confiable)
  function datosSeguros(d = {}) {
    const base = completa(ESCENAS.find(e => e.clave === d.clave) || ESCENAS[0]);
    const nuclidos = [], ids = new Set();
    for (const o of (Array.isArray(d.nuclidos) ? d.nuclidos : []).slice(0, 12)) {
      if (!o || typeof o !== 'object' || !claveSegura(o.clave)) continue;
      let id = texto(o.id, '', 8); if (!/^n\d{1,4}$/.test(id) || ids.has(id)) { do { id = 'n' + (++contador); } while (ids.has(id)); }
      ids.add(id); nuclidos.push({ id, clave: o.clave, ramas: o.ramas === true });
    }
    let muestraS = null;
    const mo = d.muestra && typeof d.muestra === 'object' ? d.muestra : null;
    if (mo && claveSegura(mo.clave) && nuclido(mo.clave).T != null) {
      const cad = mo.cadena === true;
      muestraS = { clave: mo.clave, N0: Math.round(numero(mo.N0, 1000, 1, cad ? 20000 : 100000)), T: mo.T == null ? null : numero(mo.T, nuclido(mo.clave).T, 1e-9, 1e20), cadena: cad, semilla: Math.round(numero(mo.semilla, 1, 1, 1e9)) };
    }
    let decS = null;
    const de = d.decaimiento && typeof d.decaimiento === 'object' ? d.decaimiento : null;
    if (de && claveSegura(de.clave)) {
      const n = nuclido(de.clave), tipos = [...n.modos.map(m => m.tipo), ...(FISIBLES[de.clave] ? ['fision'] : [])];
      const tipo = tipos.includes(de.tipo) ? de.tipo : tipos[0];
      if (tipo) {
        decS = { clave: de.clave, tipo, direccion: numero(de.direccion, 0, -2 * Math.PI, 2 * Math.PI) };
        if (tipo === 'fision') { const par = Array.isArray(de.fragmentos) ? FISIBLES[de.clave].find(([a, b]) => a === de.fragmentos[0] && b === de.fragmentos[1]) : null; decS.fragmentos = (par || FISIBLES[de.clave][0]).slice(); }
        if (tipo === 'beta-' || tipo === 'beta+') { decS.reparto = numero(de.reparto, 0.4, 0, 1); decS.angulo = numero(de.angulo, 2 * Math.PI / 3, 0, Math.PI); }
        if (tipo !== 'fision' && !(valorQ(de.clave, tipo).MeV > 0)) decS = null;
      }
    }
    const variables = {};
    for (const [k, v] of Object.entries(d.variables && typeof d.variables === 'object' ? d.variables : {})) {
      if (!v || !Array.isArray(v.liga) || !/^[A-Za-z]\w{0,7}$/.test(k)) continue;
      const min = numero(v.min, 0, -1e20, 1e20), max = Math.max(min, numero(v.max, 1, -1e20, 1e20));
      const liga = v.liga.filter(r => typeof r === 'string' && RUTA_OK.test(r) && (!r.startsWith('muestra.') || muestraS) && (!r.startsWith('decaimiento.') || decS));
      if (!liga.length) continue;
      variables[k] = { sim: texto(v.sim, k, 3), sub: v.sub ? texto(v.sub, '', 6) : undefined, val: numero(v.val, min, min, max), min, max, paso: numero(v.paso, 0.1, 1e-9, 1e9), u: ['', '%', '°', ...Object.keys(UNI)].includes(v.u) ? v.u : '', factor: numero(v.factor, 1, -1e20, 1e20) || 1, offset: numero(v.offset, 0, -100, 100), liga };
    }
    const capas = {};
    for (const k of Object.keys(base.capas)) capas[k] = typeof d.capas?.[k] === 'boolean' ? d.capas[k] : !!base.capas[k];
    const GRAF = ['N', 'lnN', 'actividad', 'cadenaZA', 'cadenaT', 'cadenaQ', 'cocienteV', 'reparto', 'enlace', 'fisionQ', 'repartoFision', 'balanceBeta', 'momentoBeta'];
    const SELS = ['escena', ...(muestraS ? ['muestra'] : []), ...(decS ? ['decaimiento'] : []), ...nuclidos.map(n => n.id)];
    return {
      clave: ESCENAS.some(e => e.clave === d.clave) ? d.clave : 'propio', titulo: texto(d.titulo, base.titulo, 80),
      tipo: ['Tutorial', 'Ejemplo', 'MEXT', 'Propio'].includes(d.tipo) ? d.tipo : 'Propio', anio: d.anio ? texto(d.anio, '', 14) : undefined,
      nuclidos, muestra: muestraS, decaimiento: decS, variables, capas,
      duracion: numero(d.duracion, muestraS ? 5 * (muestraS.T ?? nuclido(muestraS.clave).T) : 1, 1e-6, 1e20), unidadT: UNI[d.unidadT] ? d.unidadT : 's',
      graficas: Array.isArray(d.graficas) && d.graficas.length === 3 && d.graficas.every(g => GRAF.includes(g)) ? d.graficas.slice() : base.graficas.slice(),
      caja: Array.isArray(d.caja) && d.caja.length === 4 && d.caja.every(Number.isFinite) && d.caja[1] > d.caja[0] && d.caja[3] > d.caja[2] ? d.caja.map(x => numero(x, 0, -10, 300)) : null,
      sel: typeof d.sel === 'string' && SELS.includes(d.sel) ? d.sel : 'escena',
    };
  }
  function restaurar(d) {
    ESC = datosSeguros(d); aplicarVariables();
    if (!(sel === 'escena' || nuDe(sel) || (sel === 'muestra' && ESC.muestra) || (sel === 'decaimiento' && ESC.decaimiento) || (sel.startsWith('celda:') && nuclido(sel.slice(6))))) sel = ESC.sel || 'escena';
    titulo2(); construirVariables(); inspector(); recalcular();
  }
  function botonesHistorial() { $('#b-deshacer').disabled = !historial?.puedeDeshacer; $('#b-rehacer').disabled = !historial?.puedeRehacer; }
  const sinSel = o => { delete o.sel; return o; };
  function registrar() { if (historial && historial.registrar(sinSel(instantanea()))) botonesHistorial(); }
  function deshacer() { const d = historial?.deshacer(); if (d) { restaurar(d); botonesHistorial(); avisar('Cambio deshecho', false); } }
  function rehacer() { const d = historial?.rehacer(); if (d) { restaurar(d); botonesHistorial(); avisar('Cambio rehecho', false); } }
  $('#b-deshacer').addEventListener('click', deshacer);
  $('#b-rehacer').addEventListener('click', rehacer);

  function abrirEscena1(clave) {
    ESC = completa(escenaDe(clave)); aplicarVariables();
    sel = ESC.sel || 'escena'; vistaTocada = false; herramienta = null; t = 0; jugando = false;
    titulo2(); construirVariables(); inspector(); recalcular();
    escala0 = tz.vista.escala; zoomTexto();
    if (historial) { historial.reiniciar(sinSel(instantanea())); botonesHistorial(); }
  }
  function guardar() { guardarEscena(escenaActual()).then(r => { if (r) avisar('Escena guardada', false); }, e => avisar(`No se pudo guardar: ${e}`, false)); }
  const PAGINAS = { fotoelectrico: 'moderna.html', nucleo: 'moderna-nucleo.html' };
  // Una escena de otro espacio de Física moderna se abre en su pantalla
  function aOtroEspacio(e, propio) {
    if (!e.espacio || e.espacio === propio || !PAGINAS[e.espacio]) return false;
    try { sessionStorage.setItem('volta.abrir', JSON.stringify(e)); } catch { /* sin almacenamiento */ }
    location.href = PAGINAS[e.espacio];
    return true;
  }
  function abrir() {
    abrirEscena({ modulo: 'moderna' }).then(e => {
      if (aOtroEspacio(e, 'nucleo')) return;
      sel = 'escena'; t = 0; jugando = false; restaurar(e.datos); vistaTocada = false; encuadrar(); escala0 = tz.vista.escala; zoomTexto(); todo();
      if (historial) { historial.reiniciar(sinSel(instantanea())); botonesHistorial(); }
      avisar(`Escena abierta: ${texto(e.titulo, 'sin título', 60)}`, false);
    }).catch(err => avisar(err.message, false));
  }

  // ---------------------------------------------------------------------
  // Paleta, instrumentos y capas
  // ---------------------------------------------------------------------
  function marcarHerramientas() {
    document.querySelectorAll('.herr').forEach(b => {
      const h = b.dataset.herr;
      const on = h === herramienta || (h === 'muestra' && sel === 'muestra') || (h === 'decaimiento' && sel === 'decaimiento') || (h === 'contador' && ESC.capas.contador) || (h === 'cronometro' && ESC.capas.cronometro);
      b.setAttribute('aria-pressed', String(!!on));
    });
    lienzo.style.cursor = herramienta ? 'crosshair' : 'default';
  }
  function ponerHerramienta(h) {
    const celda = sel.startsWith('celda:') ? sel.slice(6) : nuDe(sel)?.clave;
    if (h === 'contador' || h === 'cronometro') { alternarCapa(h); avisar(ESC.capas[h] ? (h === 'contador' ? 'Contador: núcleos que quedan' : 'Cronómetro: múltiplos de T½ y periodo medido') : 'Instrumento retirado', false); return; }
    if (h === 'muestra') { if (ESC.muestra && !celda) { seleccionar('muestra'); return; } ponerMuestra(celda || 'I-131'); return; }
    if (h === 'decaimiento') { if (ESC.decaimiento && !celda) { seleccionar('decaimiento'); return; } ponerDecaimiento(celda || 'U-238'); return; }
    if (h === 'nuclido') {
      if (sel.startsWith('celda:')) { seguir(sel.slice(6)); return; }
      herramienta = herramienta === 'nuclido' ? null : 'nuclido'; marcarHerramientas();
      if (herramienta) avisar('Núclido: clic en una casilla de la carta · Esc termina', false);
    }
  }
  document.querySelectorAll('.herr').forEach(b => b.addEventListener('click', () => ponerHerramienta(b.dataset.herr)));
  function ponerCapa(k, on) { ESC.capas[k] = on; document.querySelectorAll(`.capa-btn[data-capa="${k}"]`).forEach(b => b.setAttribute('aria-pressed', String(on))); }
  const alternarCapa = k => { ponerCapa(k, !ESC.capas[k]); registrar(); marcarHerramientas(); todo(); };
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => alternarCapa(b.dataset.capa)));
  $('#pest').addEventListener('click', () => setTimeout(todo, 0));

  // ---------------------------------------------------------------------
  // Lienzo: seleccionar, zoom y paneo de la carta
  // ---------------------------------------------------------------------
  lienzo.addEventListener('pointerdown', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, v = tz.vista;
    const ob = objetoEn(X, Y), enCarta = X < regiones().xd;
    if (ev.button === 1 || ev.button === 2 || espacioPulsado) { if (enCarta) { paneo = [X, Y, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId); } return; }
    if (herramienta === 'nuclido' && ob && ob.startsWith('celda:')) { const k = ob.slice(6); if (!ev.shiftKey) { herramienta = null; marcarHerramientas(); } seguir(k); return; }
    if (ob) {
      // Una casilla de un núclido seguido selecciona ese núclido
      const seguido = ob.startsWith('celda:') ? ESC.nuclidos.find(n => n.clave === ob.slice(6)) : null;
      seleccionar(seguido ? seguido.id : ob);
    } else if (enCarta) seleccionar('escena');
    if (enCarta) { paneo = [X, Y, v.ox, v.oy, false]; lienzo.setPointerCapture(ev.pointerId); }
  });
  lienzo.addEventListener('pointermove', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, v = tz.vista;
    const enCarta = X < regiones().xd;
    if (enCarta) { const N = Math.round(v.mx(X)), Z = Math.round(v.my(Y)); $('#cx').textContent = String(N); $('#cy').textContent = Z >= 0 && Z <= 100 ? `${Z} · ${SIMBOLOS[Z]}` : String(Z); }
    if (paneo) { vistaTocada = true; v.ox = paneo[2] + X - paneo[0]; v.oy = paneo[3] + Y - paneo[1]; dibujar(); return; }
    const ob = objetoEn(X, Y);
    lienzo.style.cursor = herramienta ? 'crosshair' : ob ? 'pointer' : enCarta ? 'grab' : 'default';
    if (ob !== hover) { hover = ob; dibujar(); }
  });
  lienzo.addEventListener('pointerup', () => { paneo = null; });
  lienzo.addEventListener('pointerleave', () => { if (hover) { hover = null; dibujar(); } });
  lienzo.addEventListener('contextmenu', ev => ev.preventDefault());
  lienzo.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left;
    if (X >= regiones().xd) return;
    vistaTocada = true; tz.vista.zoom(Math.exp(-ev.deltaY * 0.0015), X, ev.clientY - r.top);
    zoomTexto(); dibujar();
  }, { passive: false });
  function zoomTexto() { $('#zoom').textContent = Math.round(tz.vista.escala / escala0 * 100) + ' %'; }
  function zoomCentro(f) { vistaTocada = true; tz.vista.zoom(f, regiones().xd / 2, tz.h / 2); zoomTexto(); dibujar(); }
  function encuadrarTodo() { vistaTocada = false; encuadrar(); escala0 = tz.vista.escala; zoomTexto(); dibujar(); }
  $('#b-zoom-mas').addEventListener('click', () => zoomCentro(1.25));
  $('#b-zoom-menos').addEventListener('click', () => zoomCentro(0.8));
  $('#b-encuadrar').addEventListener('click', encuadrarTodo);

  // ---------------------------------------------------------------------
  // Reproducción: a 1× la línea de tiempo entera dura 10 s
  // ---------------------------------------------------------------------
  function cuadro(ahora) {
    if (jugando && ESC.muestra) {
      const dt = Math.min(0.05, (ahora - ultimo) / 1000) * velocidad * ESC.duracion / 10;
      t = Math.min(ESC.duracion, t + dt);
      if (t >= ESC.duracion) jugando = false;
      todo();
    }
    ultimo = ahora;
    requestAnimationFrame(cuadro);
  }
  function alternar() { if (!ESC.muestra) return; if (t >= ESC.duracion) t = 0; jugando = !jugando; todo(); }
  const irA = nt => { if (!ESC.muestra) return; jugando = false; t = Math.max(0, Math.min(ESC.duracion, nt)); todo(); };
  const pasoCuadro = () => ESC.duracion / 600;
  $('#b-play').addEventListener('click', alternar);
  $('#b-reiniciar').addEventListener('click', () => irA(0));
  $('#b-atras').addEventListener('click', () => irA(t - pasoCuadro()));
  $('#b-adelante').addEventListener('click', () => irA(t + pasoCuadro()));
  $('#velocidades').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) velocidad = parseFloat(b.dataset.v); });

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
  document.addEventListener('pointerdown', ev => { if (ev.target instanceof Element && !ev.target.closest('#menu-escenas, #b-escenas')) $('#menu-escenas').hidden = true; });

  const COMANDOS = [
    ['i-reproducir', 'Reproducir o pausar', 'Espacio', alternar],
    ['i-reiniciar', 'Volver a t = 0', 'Inicio', () => irA(0)],
    ['i-encuadrar', 'Encuadrar la carta', 'F', encuadrarTodo],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['o-nucleo', 'Seguir la cadena de un núclido de la carta', '', () => ponerHerramienta('nuclido')],
    ['o-muestra', 'Muestra radiactiva', '', () => ponerHerramienta('muestra')],
    ['o-impulso', 'Decaimiento puntual', '', () => ponerHerramienta('decaimiento')],
    ['i-borrar', 'Quitar lo seleccionado', 'Supr', quitarSeleccion],
    ['n-detector', 'Contador de núcleos sí o no', 'C', () => alternarCapa('contador')],
    ['n-cronometro', 'Cronómetro (periodos) sí o no', 'T', () => alternarCapa('cronometro')],
    ['i-capas', 'Mostrar u ocultar las cadenas', '', () => alternarCapa('cadenas')],
    ['i-capas', 'Mostrar u ocultar el valle de estabilidad', '', () => alternarCapa('valle')],
    ['i-capas', 'Mostrar u ocultar los momentos', 'P', () => alternarCapa('momentos')],
    ['i-historial', 'Restablecer la escena original', '', () => { if (ESCENAS.some(e => e.clave === ESC.clave)) { abrirEscena1(ESC.clave); avisar('Escena original restablecida', false); } }],
    ['i-deshacer', 'Deshacer', 'Ctrl Z', deshacer],
    ['i-rehacer', 'Rehacer', 'Ctrl Y', rehacer],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar],
    ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
    ['i-exportar', 'Exportar la cadena a CSV', '', exportarCadena],
    ['i-tabla', 'Exportar el balance del decaimiento a CSV', '', exportarBalance],
    ['i-tabla', 'Exportar N(t) de la muestra a CSV', '', exportarMuestra],
    ['i-imagen', 'Exportar imagen del lienzo', '', exportarPNG],
    ...ESCENAS.map(e => [ICONO_TIPO[e.tipo], `Abrir escena: ${e.titulo}`, e.tipo === 'MEXT' ? `MEXT ${e.anio}` : e.tipo, () => abrirEscena1(e.clave), 'Escenas']),
  ];
  let selCmd = 0;
  function pintarComandos() {
    const q = $('#cmd-q').value.trim().toLowerCase(), lista = COMANDOS.filter(c => c[1].toLowerCase().includes(q));
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
    if (mod) return;
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) alternar(); espacioPulsado = true; }
    else if (ev.key === 'ArrowRight') irA(t + pasoCuadro());
    else if (ev.key === 'ArrowLeft') irA(t - pasoCuadro());
    else if (ev.key === 'Home') irA(0);
    else if (ev.key === 'Escape') { if (herramienta) { herramienta = null; marcarHerramientas(); } $('#menu-escenas').hidden = true; }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') quitarSeleccion();
    else if (tecla === 'f') encuadrarTodo();
    else if (tecla === 'c') alternarCapa('contador');
    else if (tecla === 't') alternarCapa('cronometro');
    else if (tecla === 'p') alternarCapa('momentos');
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });

  // ---------------------------------------------------------------------
  // Arranque. Parámetros para capturas: ?escena=muestra&t=12&sel=muestra&pest=tabla
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); if (!vistaTocada) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search), limpio = ![...q.keys()].length;
    const pend = escenaPendiente('moderna');
    const previa = (pend && pend.espacio === 'nucleo' ? pend : null) || (limpio ? autoguardado.leer('moderna-nucleo', { modulo: 'moderna' }) : null);
    tz.ajustar();
    if (q.has('escena') || !previa) { ESC = completa(escenaDe(q.get('escena') || 'cadena')); sel = ESC.sel || 'escena'; }
    else { ESC = datosSeguros(previa.datos); sel = ESC.sel || 'escena'; }
    aplicarVariables();
    if (q.has('sel')) { const s = q.get('sel'); if (s === 'escena' || nuDe(s) || (s === 'muestra' && ESC.muestra) || (s === 'decaimiento' && ESC.decaimiento) || (s.startsWith('celda:') && nuclido(s.slice(6)))) sel = s; }
    autoguardar = limpio || !!previa;
    t = q.has('t') && ESC.muestra ? Math.max(0, Math.min(ESC.duracion, (parseFloat(q.get('t')) || 0) * U())) : 0;
    titulo2(); construirVariables(); inspector();
    recalcular(); escala0 = tz.vista.escala; zoomTexto();
    const pe = q.get('pest'); if (pe) { const b = document.querySelector(`#pest [aria-controls="p-${pe}"]`); if (b) b.click(); }
    todo();
    historial = new Historial(sinSel(instantanea())); botonesHistorial();
    requestAnimationFrame(a => { ultimo = a; requestAnimationFrame(cuadro); });
  });
})();
