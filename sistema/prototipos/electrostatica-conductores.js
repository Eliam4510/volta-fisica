/* ==========================================================================
   Volta · Electrostática — espacio «Conductores y dieléctricos»
   Dos geometrías con solución exacta (motor puro
   sistema/motores/electrostatica-conductores.js, probado en
   pruebas/electrostatica-conductores.test.js):
   1. Capacitor de placas paralelas con láminas conductoras o dieléctricas
      (enteras o metidas a medias), batería con interruptor y procesos
      cuasiestáticos en el tiempo: separar las placas, meter o sacar una
      lámina y conectar o desconectar la batería, con el registro de energía
      (batería, agente externo y calor).
   2. Simetría esférica o cilíndrica: carga, esfera o hilo central y cáscaras
      concéntricas conductoras (aisladas o a tierra) o dieléctricas, con su
      superficie gaussiana.
   El capacitor se dibuja como esquema (el hueco real es de milímetros): el
   área se reparte a lo ancho y la separación a lo alto. Escenas agrupadas en
   Tutoriales, Ejemplos y MEXT (E2 y E3).
   Parámetros de URL para capturas: ?escena=<clave>&tema=…&t=…&sel=…&pest=…
   ========================================================================== */
import { EPSILON_0, capacitancia, estadoCapacitor, simularCapacitor, capacitorEn, resolverRadial, flujoRadial, energiaRadial } from '../motores/electrostatica-conductores.js';
import { aCSV } from '../nucleo/csv.js';
import { evaluar, DIM as DIMS } from '../nucleo/unidades.js';
import { crearEscena, numero, texto, magnitud } from '../nucleo/escena.js';
import { Historial } from '../nucleo/historial.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';
import { descargarTexto, descargarLienzo } from '../componentes/exportar.js';

(function () {
  'use strict';
  const { Trazo, G, fmt, cantidad, conPrefijo, grafica, LineaTiempo, PATRON } = Volta;
  const { GE } = Volta.electro;
  const $ = s => document.querySelector(s);
  const ESPACIO = 'conductores';

  // ---------------------------------------------------------------------
  // Dimensiones de los campos y de las variables
  // ---------------------------------------------------------------------
  const resta = (a, b, k = 1) => a.map((x, i) => x - k * b[i]);
  const DIMEN = {
    area: { u: 'cm²', si: 1e-4, dim: DIMS.area },
    mm: { u: 'mm', si: 1e-3, dim: DIMS.longitud, simple: 'mm' },
    cm: { u: 'cm', si: 1e-2, dim: DIMS.longitud, simple: 'cm' },
    potencial: { u: 'V', si: 1, dim: DIMS.potencial, simple: 'V' },
    carga: { u: 'nC', si: 1e-9, dim: DIMS.carga, simple: 'nC' },
    lambda: { u: 'nC/m', si: 1e-9, dim: resta(DIMS.carga, DIMS.longitud) },
    adim: { u: '', si: 1, dim: DIMS.adimensional },
    fraccion: { u: '%', si: 0.01, dim: DIMS.adimensional, simple: '%' },
    permitividad: { u: 'F/m', si: 1, dim: resta(DIMS.capacitancia, DIMS.longitud) },
  };

  // ---------------------------------------------------------------------
  // Escenas. Magnitud ligada: {v, f} (valor = f · variable, en SI); suma de
  // ligadas: {suma: [...]}; libre: número en SI.
  // ---------------------------------------------------------------------
  const L = (v, f = 1) => ({ v, f });
  const VE0 = () => ({ sim: 'ε', sub: '0', val: EPSILON_0, constante: true, u: 'F/m', si: 1, dim: 'permitividad' });
  const vS = (val = 200) => ({ sim: 'S', val, min: 50, max: 600, paso: 10, u: 'cm²', si: 1e-4, dim: 'area' });
  const vd = (val = 1, sim = 'd') => ({ sim, val, min: 0.2, max: 4, paso: 0.05, u: 'mm', si: 1e-3, dim: 'mm' });
  const vV = (val = 100, sim = 'V') => ({ sim, val, min: 1, max: 300, paso: 1, u: 'V', si: 1, dim: 'potencial' });
  const vQ = (val = 20, sim = 'Q') => ({ sim, val, min: 1, max: 100, paso: 0.5, u: 'nC', si: 1e-9, dim: 'carga' });
  const vK = (sim = 'κ', val = 3, sub) => ({ sim, sub, val, min: 1, max: 10, paso: 0.1, u: '', si: 1, dim: 'adim' });
  const vR = (sim, val, min = 1, max = 30, sub) => ({ sim, sub, val, min, max, paso: 0.5, u: 'cm', si: 1e-2, dim: 'cm' });
  const placas = o => ({ S: L('S'), d: L('d'), V: L('V'), conectada: true, Q0: null, capas: [], acciones: [], entra: 'derecha', ...o });
  const diel = (z0, espesor, kappa, o = {}) => ({ tipo: 'dielectrico', nombre: o.nombre || 'Dieléctrico', z0, espesor, kappa, a0: o.a0 ?? 0, a1: o.a1 ?? 1 });
  const cond = (z0, espesor, o = {}) => ({ tipo: 'conductor', nombre: o.nombre || 'Conductor', z0, espesor, a0: o.a0 ?? 0, a1: o.a1 ?? 1 });

  const ESCENAS = [
    // ------------------------------------------------------------ Tutoriales
    {
      clave: 'capacitor', titulo: 'Capacitor de placas y voltímetro', tipo: 'Tutorial', modo: 'placas',
      vars: { S: vS(), d: vd(), V: vV(), e0: VE0() }, placas: placas(),
    },
    {
      clave: 'carga-cascara', titulo: 'Carga dentro de una cáscara', tipo: 'Tutorial', modo: 'radial',
      vars: { Q: vQ(10), q2: vQ(5, 'q'), R: vR('R', 8, 2, 20), e0: VE0() },
      radial: { simetria: 'esferica', q: L('Q'), a: 0, capas: [{ tipo: 'conductor', nombre: 'Cáscara conductora', r1: L('R'), r2: L('R', 1.5), q: L('q2') }] },
      gauss: { r: L('R', 2) },
    },
    // ------------------------------------------------------------ Ejemplos
    {
      clave: 'dielectrico-entra', titulo: 'Dieléctrico que entra', tipo: 'Ejemplo', modo: 'placas',
      vars: { S: vS(), d: vd(), V: vV(), k: vK(), e0: VE0() },
      placas: placas({ capas: [diel(0, L('d'), L('k'), { a1: 0 })], acciones: [{ tipo: 'insertar', capa: 0, t0: 1, t1: 5, hasta: 1 }] }), duracion: 6,
    },
    {
      clave: 'separar', titulo: 'Separar las placas', tipo: 'Ejemplo', modo: 'placas',
      vars: { S: vS(), d: vd(), V: vV(), e0: VE0() },
      placas: placas({ acciones: [{ tipo: 'separar', t0: 1, t1: 4, hasta: L('d', 2) }] }), duracion: 5, conmutaBateria: true,
    },
    {
      clave: 'capacitor-esferico', titulo: 'Capacitor esférico', tipo: 'Ejemplo', modo: 'radial',
      vars: { Q: vQ(10), a: vR('a', 5, 1, 15), b: vR('b', 9, 2, 25), e0: VE0() },
      radial: { simetria: 'esferica', q: L('Q'), a: L('a'), capas: [{ tipo: 'conductor', nombre: 'Cáscara exterior', r1: L('b'), r2: L('b', 1.15), q: L('Q', -1) }] },
      gauss: { r: L('a', 1.4) },
    },
    {
      clave: 'coaxial', titulo: 'Cable coaxial', tipo: 'Ejemplo', modo: 'radial',
      vars: { l: { sim: 'λ', val: 5, min: 0.5, max: 20, paso: 0.1, u: 'nC/m', si: 1e-9, dim: 'lambda' }, a: vR('a', 2, 0.5, 6), b: vR('b', 7, 2, 15), e0: VE0() },
      radial: { simetria: 'cilindrica', q: L('l'), a: L('a'), capas: [{ tipo: 'conductor', nombre: 'Malla exterior', r1: L('b'), r2: L('b', 1.15), q: L('l', -1) }], rRef: L('b', 1.15) },
      gauss: { r: L('a', 1.8) },
    },
    {
      clave: 'dielectrico-esferico', titulo: 'Cáscara dieléctrica', tipo: 'Ejemplo', modo: 'radial',
      vars: { Q: vQ(10), k: vK('κ', 4), R: vR('R', 6, 2, 15), e0: VE0() },
      radial: { simetria: 'esferica', q: L('Q'), a: 0, capas: [{ tipo: 'dielectrico', nombre: 'Cáscara dieléctrica', r1: L('R'), r2: L('R', 2), kappa: L('k') }] },
      gauss: { r: L('R', 1.5) },
    },
    {
      clave: 'tierra', titulo: 'Cáscara conectada a tierra', tipo: 'Ejemplo', modo: 'radial',
      vars: { Q: vQ(10), R: vR('R', 8, 2, 20), e0: VE0() },
      radial: { simetria: 'esferica', q: L('Q'), a: 0, capas: [{ tipo: 'conductor', nombre: 'Cáscara a tierra', r1: L('R'), r2: L('R', 1.3), tierra: true }] },
      gauss: { r: L('R', 1.8) },
    },
    // ------------------------------------------------------------ MEXT E2 y E3
    {
      clave: 'mext-2025-t4', titulo: 'Gauss para un hilo infinito', tipo: 'MEXT', anio: '2025 T4', modo: 'radial',
      vars: { l: { sim: 'λ', val: 5, min: 0.5, max: 20, paso: 0.1, u: 'nC/m', si: 1e-9, dim: 'lambda' }, r: vR('r', 5, 1, 20), e0: VE0() },
      radial: { simetria: 'cilindrica', q: L('l'), a: 0, capas: [], rRef: 0.2 }, gauss: { r: L('r') }, vista: 0.25,
    },
    {
      clave: 'mext-2009-1-3', titulo: 'Q en el centro de una cáscara', tipo: 'MEXT', anio: '2009 1-(3)', modo: 'radial',
      vars: { Q: vQ(10), R: vR('R', 6, 2, 12), e0: VE0() },
      radial: { simetria: 'esferica', q: L('Q'), a: 0, capas: [{ tipo: 'conductor', nombre: 'Cáscara conductora', r1: L('R'), r2: L('R', 2), q: 0 }] },
      gauss: { r: L('R', 1.5) },
    },
    {
      clave: 'mext-2020-1-3', titulo: 'Separar las placas sin batería', tipo: 'MEXT', anio: '2020 1-(3)', modo: 'placas',
      vars: { S: vS(), d: vd(), V: vV(), Dd: { sim: 'Δd', val: 0.5, min: 0.05, max: 3, paso: 0.05, u: 'mm', si: 1e-3, dim: 'mm' }, e0: VE0() },
      placas: placas({ acciones: [{ tipo: 'bateria', t0: 0.5, conectada: false }, { tipo: 'separar', t0: 1, t1: 4, hasta: { suma: [L('d'), L('Dd')] } }] }), duracion: 5,
      formula: 'mext-2020-1-3',
    },
    {
      clave: 'mext-2017-2-b', titulo: 'Dieléctrico de espesor d/2', tipo: 'MEXT', anio: '2017 P2', modo: 'placas',
      vars: { S: vS(), d: vd(), V: vV(), e: vK('ε', 3), e0: VE0() },
      placas: placas({ capas: [diel(0, L('d', 0.5), L('e'))] }), formula: 'mext-2017-2-b',
    },
    {
      clave: 'mext-2017-2-d', titulo: 'Dos dieléctricos lado a lado', tipo: 'MEXT', anio: '2017 P2', modo: 'placas',
      vars: { S: vS(), d: vd(), V: vV(), e1: vK('ε', 2, '1'), e2: vK('ε', 5, '2'), e0: VE0() },
      placas: placas({ capas: [diel(0, L('d'), L('e1'), { a0: 0, a1: 0.5, nombre: 'Dieléctrico 1' }), diel(0, L('d'), L('e2'), { a0: 0.5, a1: 1, nombre: 'Dieléctrico 2' })] }), formula: 'mext-2017-2-d',
    },
    {
      clave: 'mext-2016-1-3', titulo: 'Campo con la carga Q fija', tipo: 'MEXT', anio: '2016 1-(3)', modo: 'placas',
      vars: { S: vS(), d: vd(), Q: vQ(20), e0: VE0() },
      placas: placas({ V: 100, conectada: false, Q0: L('Q') }), formula: 'mext-2016-1-3',
    },
    {
      clave: 'mext-2010-4-b', titulo: 'Conductor entre las placas', tipo: 'MEXT', anio: '2010 4-B', modo: 'placas',
      vars: { S: vS(), d: vd(0.75), Q: vQ(20), e0: VE0() },
      placas: placas({ d: L('d', 2), V: 100, conectada: false, Q0: L('Q'), capas: [cond(L('d', 0.5), L('d'), { a1: 0 })], acciones: [{ tipo: 'insertar', capa: 0, t0: 1, t1: 4, hasta: 1 }] }), duracion: 5,
      formula: 'mext-2010-4-b',
    },
    {
      clave: 'mext-2008-1-2', titulo: 'Triplicar la separación', tipo: 'MEXT', anio: '2008 1-(2)', modo: 'placas',
      vars: { S: vS(), d: vd(0.75), Q: vQ(20), e0: VE0() },
      placas: placas({ V: 100, conectada: false, Q0: L('Q'), acciones: [{ tipo: 'separar', t0: 1, t1: 4, hasta: L('d', 3) }] }), duracion: 5,
      formula: 'mext-2008-1-2',
    },
    {
      clave: 'mext-2007-2', titulo: 'Conductor de d/3 entra y sale', tipo: 'MEXT', anio: '2007 P2', modo: 'placas',
      vars: { S: vS(), d: vd(1.2), E: vV(9, 'E'), e0: VE0() },
      placas: placas({ V: L('E'), capas: [cond(L('d', 1 / 3), L('d', 1 / 3), { a1: 0 })], acciones: [{ tipo: 'insertar', capa: 0, t0: 1, t1: 3, hasta: 1 }, { tipo: 'bateria', t0: 4, conectada: false }, { tipo: 'insertar', capa: 0, t0: 5, t1: 7, hasta: 0 }] }), duracion: 8,
      formula: 'mext-2007-2', bateria: 'E',
    },
    // Bases para objetos nuevos (no salen en el menú)
    {
      clave: 'nuevo-esferico', titulo: 'Simetría esférica', tipo: 'Propio', oculta: true, modo: 'radial',
      vars: { Q: vQ(10), e0: VE0() }, radial: { simetria: 'esferica', q: L('Q'), a: 0, capas: [] }, gauss: { r: 0.06 }, vista: 0.15,
    },
    {
      clave: 'nuevo-cilindrico', titulo: 'Simetría cilíndrica', tipo: 'Propio', oculta: true, modo: 'radial',
      vars: { l: { sim: 'λ', val: 5, min: 0.5, max: 20, paso: 0.1, u: 'nC/m', si: 1e-9, dim: 'lambda' }, e0: VE0() }, radial: { simetria: 'cilindrica', q: L('l'), a: 0, capas: [], rRef: 0.2 }, gauss: { r: 0.06 }, vista: 0.15,
    },
  ];
  const copia = o => JSON.parse(JSON.stringify(o));
  const completa = def => {
    const o = copia({ duracion: 0, ...def });
    o.capas = { lineas: true, equi: true, cargas: true, cotas: true, ...(def.capasVista || {}) };
    return o;
  };
  const escenaDe = clave => ESCENAS.find(e => e.clave === clave) || ESCENAS[0];

  // ---------------------------------------------------------------------
  // Estado y resolución a SI
  // ---------------------------------------------------------------------
  /** @type {any} */ let ESC = completa(ESCENAS[0]);
  const V = () => ESC.vars;
  const vsi = n => { const d = V()[n]; return d ? d.val * d.si : NaN; };
  const ligada = p => p != null && typeof p === 'object' && !Array.isArray(p) && !p.suma;
  const valor = p => (p && typeof p === 'object' && Array.isArray(p.suma) ? p.suma.reduce((s, x) => s + valor(x), 0) : ligada(p) ? p.f * vsi(p.v) : p);
  const esPlacas = () => ESC.modo === 'placas';
  const estatica = () => !esPlacas() || !(ESC.placas.acciones || []).length;
  const DUR = () => (estatica() ? 1 : ESC.duracion || 1);

  function resolverPlacas() {
    const p = ESC.placas;
    return {
      S: valor(p.S), d: valor(p.d), V: valor(p.V), conectada: p.conectada !== false, ...(p.Q0 != null ? { Q0: valor(p.Q0) } : {}),
      capas: p.capas.map(c => ({ tipo: c.tipo, nombre: c.nombre, z0: valor(c.z0), espesor: valor(c.espesor), ...(c.tipo === 'dielectrico' ? { kappa: valor(c.kappa) } : {}), a0: valor(c.a0 ?? 0), a1: valor(c.a1 ?? 1) })),
      acciones: (p.acciones || []).map(a => ({ ...a, ...(a.hasta != null ? { hasta: valor(a.hasta) } : {}) })),
    };
  }
  function resolverRadialEsc() {
    const r = ESC.radial;
    return {
      simetria: r.simetria, q: valor(r.q), a: valor(r.a || 0), rRef: r.rRef != null ? valor(r.rRef) : 1,
      capas: r.capas.map(c => ({ tipo: c.tipo, nombre: c.nombre, r1: valor(c.r1), r2: valor(c.r2), ...(c.tipo === 'conductor' ? { q: valor(c.q || 0), tierra: !!c.tierra } : { kappa: valor(c.kappa ?? 1) }) })),
    };
  }

  let SIM = null, RAD = null, ERROR = null, PL = null;
  function simular() {
    ERROR = null;
    try {
      if (esPlacas()) {
        PL = resolverPlacas();
        SIM = simularCapacitor(PL, { duracion: DUR() });
        RAD = null;
      } else {
        RAD = resolverRadial(resolverRadialEsc());
        SIM = null;
      }
    } catch (e) { ERROR = e.message; }
  }
  const estadoEn = tt => capacitorEn(SIM, tt);
  // Mensaje del motor para la interfaz: sin el prefijo técnico y como frase
  const mensajeMotor = m => { const t0 = String(m).replace(/^(capacitor|radial):\s*/, ''); return t0.charAt(0).toUpperCase() + t0.slice(1) + (t0.endsWith('.') ? '' : '.'); };

  // ---------------------------------------------------------------------
  // Interfaz
  // ---------------------------------------------------------------------
  let t = 0, jugando = false, velocidad = 1, ultimo = 0, sel = 'capacitor', herramienta = null, historial = null, autoguardar = false;
  let arrastre = null, hover = null;
  const lienzo = $('#lienzo'), area = $('#area');
  const tz = new Trazo(lienzo);
  const limpio = (n, dec = 3) => (Math.abs(n) < 1e-12 ? '0' : String(+n.toFixed(dec)).replace('-', '−'));
  const nombreVar = d => d.sim + (d.sub || '');
  function factorTexto(f) {
    const s = f < 0 ? '−' : '', a = Math.abs(f);
    if (Math.abs(a - 1) < 1e-9) return { pre: s, post: '' };
    for (const den of [1, 2, 3, 4, 6, 8]) { const n = Math.round(a * den); if (n >= 1 && n <= 24 && Math.abs(a * den - n) < 1e-7) return { pre: s + (n > 1 ? n : ''), post: den > 1 ? '/' + den : '' }; }
    return { pre: s + fmt(a, 3) + '·', post: '' };
  }
  const textoLigada = p => { if (!ligada(p)) return null; const d = V()[p.v], ft = factorTexto(p.f); return ft.pre + nombreVar(d) + ft.post; };

  // ---------------------------------------------------------------------
  // Dibujo del capacitor (esquema en px)
  // ---------------------------------------------------------------------
  let GEO = null;     // geometría en pantalla del último dibujo (para la selección)
  function geometriaPlacas(st) {
    const w = tz.w, h = tz.h, entra = SIM.escena.acciones.some(a => a.tipo === 'insertar');
    // A la izquierda, el circuito con la lectura del voltímetro (245 px); a la derecha, las
    // etiquetas de las equipotenciales y la cota (150 px) o la parte de fuera de la lámina
    const IZQ = 245, DER = entra ? 10 : 150;
    const W = entra ? Math.min(400, (w - IZQ - DER) / 2) : Math.min(420, w - IZQ - DER);
    const ds = [SIM.geometria(0).d, ...SIM.escena.acciones.filter(a => a.tipo === 'separar').map(a => a.hasta)];
    const dMin = Math.min(...ds), dMax = Math.max(...ds);
    // La ficha de lecturas ocupa la esquina de arriba a la izquierda: el capacitor empieza debajo
    const arriba = 200, abajo = 76, alto = Math.max(80, h - arriba - abajo);
    let k = 120 / dMin; if (dMax * k > Math.min(0.58 * h, alto)) k = Math.min(0.58 * h, alto) / dMax;
    // Circuito (150 px) + placas (+ la lámina de fuera, si entra una)
    const total = IZQ + W * (entra ? 2 : 1) + DER, X0 = Math.round(Math.max(0, (w - total) / 2) + IZQ), X1 = X0 + W, yTop = Math.round(Math.max(arriba, Math.min(h / 2 - dMax * k / 2 + 6, h - abajo - dMax * k)));
    const yBot = yTop + st.d * k;
    // Si una lámina entra, entra por la derecha (como en las figuras): el área se cuenta desde ese lado
    const fx = f => (entra && ESC.placas.entra === 'derecha' ? X1 - f * W : X0 + f * W);
    const zy = z => yTop + z * k;
    return { W, X0, X1, yTop, yBot, k, fx, zy, grosor: 8 };
  }
  function dibujarPlacas() {
    const st = estadoEn(t), g = geometriaPlacas(st), { X0, X1, yTop, yBot, fx, zy } = g, c = tz.ctx;
    GEO = { modo: 'placas', g, capas: [] };
    const st0 = estadoEn(0), E0 = Math.max(...st0.columnas.flatMap(cl => cl.regiones.map(r => r.E)).filter(isFinite), 1e-30);
    const sig0 = Math.max(...st0.columnas.map(cl => Math.abs(cl.sigma)), 1e-30);
    const ocupado = [];

    // Capas: regiones dentro y la parte que todavía está fuera (a la derecha)
    const capas = st.capas;
    const aMax = capas.map((cp, i) => Math.max(cp.a1 ?? 1, ...SIM.escena.acciones.filter(a => a.tipo === 'insertar' && a.capa === i).map(a => a.hasta), ...(ESC.placas.capas[i].a1 != null ? [valor(ESC.placas.capas[i].a1)] : [])));
    capas.forEach((cp, i) => {
      const y0 = zy(cp.z0), y1 = zy(cp.z0 + cp.espesor), xa = fx(cp.a0 ?? 0), xb = fx(cp.a1 ?? 1);
      const caja = [Math.min(xa, xb), y0, Math.max(xa, xb), y1];
      if (caja[2] - caja[0] > 0.5) tz.electroBloque(caja[0], y0, caja[2], y1, cp.tipo, { seleccionada: sel === 'capa' + i, hover: hover === 'capa' + i });
      // Parte de fuera: de la boca del capacitor hacia la derecha
      const fuera = (aMax[i] - (cp.a1 ?? 1)) * g.W;
      if (fuera > 0.5) tz.electroBloque(X1, y0, X1 + fuera, y1, cp.tipo, { hover: hover === 'capa' + i });
      GEO.capas.push([Math.min(caja[0], X1), y0, Math.max(caja[2], fuera > 0.5 ? X1 + fuera : caja[2]), y1]);
    });

    // Líneas de campo: verticales, de la placa + a la −, con densidad ∝ E en cada región
    if (ESC.capas.lineas) {
      const N0 = 15;
      for (const col of st.columnas) {
        const xa = fx(col.f0), xb = fx(col.f1), x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
        for (const r of col.regiones) {
          if (!(r.E > 0)) continue;
          const n = Math.round(N0 * (col.f1 - col.f0) * r.E / E0);
          const ya = zy(r.z0) + 2, yb = zy(r.z1) - 2; if (yb - ya < 6) continue;
          for (let j = 0; j < n; j++) {
            const x = x0 + (x1 - x0) * (j + 0.5) / n;
            tz.lineaPx([[x, ya], [x, yb]], { color: 'electrico', grosor: GE.lineaCampo });
            if (yb - ya > 26) tz._puntaLinea(x, (ya + yb) / 2, Math.PI / 2, tz.color('electrico'));
          }
        }
      }
    }
    // Equipotenciales: tramos horizontales donde V(z) cruza cada nivel
    if (ESC.capas.equi && st.V > 0) {
      const paso = Volta.pasoAgradable(st.V / 5);
      const etiquetas = new Map();
      c.save(); c.strokeStyle = tz.color('electrico'); c.lineWidth = GE.equipotencial; c.setLineDash(PATRON.componente);
      for (const col of st.columnas) {
        const xa = fx(col.f0), xb = fx(col.f1), x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
        for (let Vk = paso; Vk < st.V - 1e-9 * st.V; Vk += paso) {
          for (const r of col.regiones) {
            if (r.E === 0 || !((r.V0 - Vk) * (r.V1 - Vk) < 0)) continue;
            const z = r.z0 + (r.V0 - Vk) / r.E, y = zy(z);
            c.beginPath(); c.moveTo(x0 + 3, y); c.lineTo(x1 - 3, y); c.stroke();
            if (!etiquetas.has(Vk) || x1 > etiquetas.get(Vk)[0]) etiquetas.set(Vk, [x1, y]);
          }
        }
      }
      c.restore();
      for (const [Vk, [x, y]] of etiquetas) if (x > X1 - 2 && !GEO.capas.some(cj => y > cj[1] - 7 && y < cj[3] + 7 && cj[2] > X1 + 4)) {
        tz.texto(cantidad(Vk, 'V', 3), X1 + 8, y, { fuente: 'num', tam: 11, color: 'electrico', base: 'middle', halo: true });
      }
    }
    // Placas: la + arriba (z = 0) y la − abajo
    tz.electroBloque(X0, yTop - g.grosor, X1, yTop, 'placa', { hover: hover === 'capacitor' });
    tz.electroBloque(X0, yBot, X1, yBot + g.grosor, 'placa', { hover: hover === 'capacitor' });
    if (sel === 'capacitor') tz.seleccionRegion(X0, yTop - g.grosor, X1 - X0, yBot - yTop + 2 * g.grosor);
    // Cargas: libres en las placas; inducidas en los conductores; de polarización (más tenues) en los dieléctricos
    if (ESC.capas.cargas) {
      for (const col of st.columnas) {
        const xa = fx(col.f0), xb = fx(col.f1), x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
        for (const s of col.superficies) {
          const n = Math.round(15 * (col.f1 - col.f0) * Math.abs(s.sigma) / sig0); if (!n) continue;
          const y = zy(s.z), dentro = s.tipo === 'placa' ? (s.z === 0 ? 5 : -5) : s.sigma < 0 ? 5 : -5;
          tz.electroSignos(x0, x1, y + dentro, Math.sign(s.sigma), n, s.tipo === 'polarizacion' ? { color: 'texto-3', tam: 2.5, grosor: 1.25 } : {});
        }
      }
    }
    // Circuito: batería con interruptor y voltímetro, a la izquierda
    const xb = X0 - 62, xv = X0 - 132, ym = (yTop + yBot) / 2;
    const yT = yTop - g.grosor / 2, yB = yBot + g.grosor / 2;
    tz.lineaPx([[X0, yT], [xv, yT], [xv, yB], [X0, yB]], { color: 'tinta', grosor: 1.5 });
    // rama de la batería: interruptor arriba, pila abajo
    c.save(); c.fillStyle = tz.t.lienzo; c.fillRect(xb - 16, ym - 30, 32, 60); c.restore();
    tz.lineaPx([[xb, yT], [xb, ym - 30]], { color: 'tinta', grosor: 1.5 });
    tz.lineaPx([[xb, ym + 8], [xb, yB]], { color: 'tinta', grosor: 1.5 });
    tz.electroInterruptor(xb, ym - 30, ym - 12, st.conectada);
    tz.lineaPx([[xb, ym - 12], [xb, ym - 4]], { color: 'tinta', grosor: 1.5 });
    tz.electroBateria(xb, ym + 1);
    tz.compuesto([{ t: ESC.bateria || 'V', f: 'sim', tam: 14, color: 'texto' }, ...(ESC.bateria ? [] : [{ t: '0', f: 'simRecta', tam: 9.5, dy: 3, color: 'texto' }])], xb - 20, ym + 6, { alinear: 'right' });
    // voltímetro entre las placas
    c.save(); c.fillStyle = tz.t.lienzo; c.fillRect(xv - 14, ym - 14, 28, 28); c.restore();
    tz.electroVoltimetro(xv, ym);
    const lv = tz.compuesto([{ t: 'V', f: 'sim', tam: 14, color: 'electrico' }, { t: ' = ' + cantidad(st.V, 'V', 4), f: 'num', tam: 11.5, color: 'texto-2' }], xv - 18, ym + 4, { alinear: 'right' });
    ocupado.push([lv.x, ym - 10, xv, ym + 8]);
    GEO.circuito = [xv - 20, Math.min(yT, ym - 32), xb + 18, Math.max(yB, ym + 32)];
    GEO.voltimetro = [xv - 14, ym - 14, xv + 14, ym + 14];
    // Nombres de las placas y cotas
    if (ESC.capas.cotas) {
      tz.compuesto([{ t: '+', f: 'ui', tam: 12 }, { t: 'Q', f: 'sim', tam: 14 }, { t: ' = ' + conPrefijo(st.Q, 'C', 4), f: 'num', tam: 11, color: 'texto-2' }], X0, yTop - g.grosor - 12, {});
      tz.compuesto([{ t: '−', f: 'ui', tam: 12 }, { t: 'Q', f: 'sim', tam: 14 }], X0, yBot + g.grosor + 22, {});
      const insertando = SIM.escena.acciones.some(a => a.tipo === 'insertar');
      const xc = insertando ? X0 - 20 : X1 + 70;
      tz.flechaPx(xc, yTop + 1, xc, yBot - 1, { color: 'texto-2', grosor: 1, punta: 'abierta', ambas: true });
      const dTxt = textoLigada(ESC.placas.d);
      if (insertando) tz.compuesto([{ t: dTxt || 'd', f: 'sim', tam: 14, color: 'texto-2' }], xc - 6, ym + 5, { alinear: 'right' });
      else tz.compuesto([{ t: 'd', f: 'sim', tam: 14, color: 'texto-2' }, { t: ' = ' + cantidad(st.d * 1e3, 'mm', 3), f: 'num', tam: 11, color: 'texto-2' }], xc + 8, ym + 5, {});
      // Permitividad de cada dieléctrico, dentro de su región si cabe
      capas.forEach((cp, i) => {
        if (cp.tipo !== 'dielectrico') return;
        const cj = GEO.capas[i], xa = fx(cp.a0 ?? 0), xbb = fx(cp.a1 ?? 1), w = Math.abs(xbb - xa), hh = cj[3] - cj[1];
        if (w < 70 || hh < 18) return;
        const d0 = ESC.placas.capas[i].kappa, sim = ligada(d0) ? V()[d0.v] : { sim: 'κ' };
        tz.compuesto([{ t: sim.sim, f: 'sim', tam: 14 }, ...(sim.sub ? [{ t: sim.sub, f: 'simRecta', tam: 9.5, dy: 3 }] : []), { t: ' = ' + limpio(cp.kappa, 2), f: 'num', tam: 11.5, color: 'texto-2' }], (xa + xbb) / 2, (cj[1] + cj[3]) / 2 + 5, { alinear: 'center' });
      });
    }
    fichaPlacas(st);
  }
  function fichaPlacas(st) {
    const E1 = st.columnas[0]?.regiones.find(r => r.tipo === 'vacio')?.E ?? st.E;
    const filas = [
      [{ t: 'Capacitor', f: 'ui', tam: 11.5 }, { t: st.conectada ? ' · batería conectada' : ' · batería desconectada', f: 'ui', tam: 11.5, color: 'texto-3' }],
      [{ t: 'C', f: 'sim', tam: 13 }, { t: ' = ' + conPrefijo(st.C, 'F', 4), f: 'num', tam: 11.5 }],
      [{ t: 'Q', f: 'sim', tam: 13 }, { t: ' = ' + conPrefijo(st.Q, 'C', 4), f: 'num', tam: 11.5 }],
      [{ t: 'E', f: 'sim', tam: 13, color: 'electrico' }, { t: ' = ' + conPrefijo(E1, 'V/m', 4) + (st.columnas.length > 1 || st.capas.length ? ' (en el vacío)' : ''), f: 'num', tam: 11.5 }],
      [{ t: 'U', f: 'sim', tam: 13, color: 'electrico' }, { t: ' = ' + conPrefijo(st.U, 'J', 4), f: 'num', tam: 11.5 }],
    ];
    tz.ficha(16, 52, filas);
  }

  // ---------------------------------------------------------------------
  // Dibujo del sistema radial (a escala, mundo en m)
  // ---------------------------------------------------------------------
  const radioG = () => valor(ESC.gauss?.r ?? 0);
  function encuadrarRadial() {
    const Rs = [RAD.a, ...RAD.capas.map(cp => cp.r2), radioG()].filter(r => r > 0);
    const R = ESC.vista || 1.18 * Math.max(...Rs, 0.02);
    tz.vista.encuadrar({ x0: -R, x1: R, y0: -R, y1: R }, { x: 0, y: 40, w: tz.w, h: tz.h - 80 }, 24);
  }
  function dibujarRadial() {
    const v = tz.vista, [cx, cy] = v.P([0, 0]), esc = v.escala, sol = RAD, c = tz.ctx;
    GEO = { modo: 'radial', capas: [] };
    tz.cuadricula();
    const Rvis = Math.hypot(tz.w, tz.h) / esc;
    const bordes = [...new Set([sol.a, ...sol.capas.flatMap(cp => [cp.r1, cp.r2])].filter(r => r > 0))].sort((a, b) => a - b);
    const Qref = Math.max(Math.abs(sol.q), ...sol.superficies.map(s => Math.abs(s.q)), 1e-30);
    // Equipotenciales: circunferencias en niveles agradables
    if (ESC.capas.equi) {
      const rs = []; for (let i = 1; i <= 60; i++) rs.push(Rvis * i / 60 / 1.6);
      const Vs = rs.map(r => sol.V(r)).filter(isFinite), lo = Math.min(...Vs), hi = Math.max(...Vs);
      const paso = Volta.pasoAgradable((hi - lo) / 7 || 1);
      c.save(); c.strokeStyle = tz.color('electrico'); c.lineWidth = GE.equipotencial; c.setLineDash(PATRON.componente);
      const etiquetas = [];
      for (let Vk = Math.ceil(lo / paso) * paso; Vk <= hi; Vk += paso) {
        // radio donde V(r) = Vk fuera de los conductores (bisección en cada tramo monótono)
        const tramos = [1e-6 * Rvis, ...bordes, Rvis];
        for (let i = 0; i + 1 < tramos.length; i++) {
          let a = tramos[i] * (1 + 1e-9), b = tramos[i + 1] * (1 - 1e-9);
          if (sol.E((a + b) / 2) === 0) continue;
          const fa = sol.V(a) - Vk, fb = sol.V(b) - Vk; if (!(fa * fb < 0)) continue;
          for (let k = 0; k < 60; k++) { const m = (a + b) / 2, fm = sol.V(m) - Vk; if (fa * fm <= 0) b = m; else a = m; }
          const r = (a + b) / 2 * esc; if (r < 6) continue;
          c.beginPath(); c.arc(cx, cy, r, 0, 2 * Math.PI); c.stroke();
          etiquetas.push([Vk, r]);
        }
      }
      c.restore();
      GEO.equi = etiquetas;
    }
    // Materia: cáscaras y cuerpo central
    sol.capas.forEach((cp, i) => {
      tz.electroCorona(cx, cy, cp.r1 * esc, cp.r2 * esc, cp.tipo, { seleccionada: sel === 'capa' + i, hover: hover === 'capa' + i });
      if (cp.tierra) {
        const yb = cy + cp.r2 * esc;
        tz.lineaPx([[cx, yb], [cx, yb + 14]], { color: 'tinta', grosor: 1.5 });
        tz.electroTierra(cx, yb + 14);
      }
    });
    if (sol.a > 0) tz.electroCorona(cx, cy, 0, sol.a * esc, 'conductor', { seleccionada: sel === 'central', hover: hover === 'central' });
    // Líneas de campo radiales en cada tramo con campo, número ∝ |carga total encerrada|
    if (ESC.capas.lineas) {
      const tramos = [sol.a > 0 ? sol.a : 0, ...bordes.filter(b => b > (sol.a || 0)), Rvis];
      for (let i = 0; i + 1 < tramos.length; i++) {
        const r0 = tramos[i], r1 = tramos[i + 1], m = (r0 + r1) / 2;
        if (sol.E(m) === 0) continue;
        const Qt = sol.Qtotal(m), n = Math.round(16 * Math.abs(Qt) / Qref); if (!n) continue;
        const p0 = Math.max(r0 * esc + 3, sol.a > 0 || i > 0 ? 0 : G.carga + 2), p1 = Math.min(r1 * esc - 3, Math.hypot(tz.w, tz.h));
        if (p1 - p0 < 8) continue;
        for (let k = 0; k < n; k++) {
          const ang = 2 * Math.PI * (k + 0.5) / n + 0.2, ux = Math.cos(ang), uy = Math.sin(ang);
          tz.lineaPx([[cx + ux * p0, cy + uy * p0], [cx + ux * p1, cy + uy * p1]], { color: 'electrico', grosor: GE.lineaCampo });
          const pm = Math.min((p0 + p1) / 2, p0 + 70);
          tz._puntaLinea(cx + ux * pm, cy + uy * pm, Qt > 0 ? ang : ang + Math.PI, tz.color('electrico'));
        }
      }
    }
    // Cargas en las superficies: libres e inducidas en tinta, de polarización tenues
    if (ESC.capas.cargas) {
      for (const s of sol.superficies) {
        const n = Math.round(14 * Math.abs(s.q) / Qref); if (!n || s.tipo === 'central') continue;
        const capa = s.capa, esInterior = capa && Math.abs(s.r - capa.r1) < 1e-12 * s.r;
        const r = s.r * esc + (esInterior ? 5 : -5);
        if (r < 4) continue;
        tz.electroSignosCirculo(cx, cy, r, Math.sign(s.q), n, s.tipo === 'polarizacion' ? { color: 'texto-3', tam: 2.5, grosor: 1.25, giro: 0.12 } : { tam: 2.75 });
      }
      if (sol.a > 0) tz.electroSignosCirculo(cx, cy, sol.a * esc - 6, Math.sign(sol.q), Math.round(14 * Math.abs(sol.q) / Qref), { tam: 2.75 });
    }
    if (!(sol.a > 0)) {
      if (sol.simetria === 'cilindrica') tz.electroFuente({ tipo: 'hilo', x: 0, y: 0, lambda: sol.q }, { seleccionada: sel === 'central' });
      else tz.carga([0, 0], Math.sign(sol.q) || 1, { seleccionada: sel === 'central' });
    }
    // Superficie gaussiana
    if (ESC.gauss) tz.electroGauss([0, 0], radioG(), { seleccionada: sel === 'gauss', hover: hover === 'gauss' });
    // Cotas: radios sobre el semieje +x
    if (ESC.capas.cotas) {
      const radios = [];
      if (sol.a > 0) radios.push([sol.a, ESC.radial.a]);
      ESC.radial.capas.forEach((cp, i) => { radios.push([sol.capas[i].r1, cp.r1], [sol.capas[i].r2, cp.r2]); });
      tz.lineaPx([[cx, cy], [cx + Math.max(...radios.map(r => r[0]), 0) * esc + 10, cy]], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
      let ultimo = -Infinity;
      radios.sort((a, b) => a[0] - b[0]).forEach(([r, p], i) => {
        const x = cx + r * esc; if (x - ultimo < 22) return; ultimo = x;
        tz.lineaPx([[x, cy - 3], [x, cy + 3]], { color: 'texto-2', grosor: 1 });
        const txt = textoLigada(p);
        tz.compuesto(txt ? [{ t: txt, f: 'sim', tam: 13, color: 'texto-2' }] : [{ t: cantidad(r * 100, 'cm', 3), f: 'num', tam: 10.5, color: 'texto-2' }], x + 3, cy + (i % 2 ? -7 : 16), { alinear: 'left' });
      });
      // Etiquetas de las equipotenciales (arriba, sobre el semieje +y)
      let yPrev = Infinity;
      for (const [Vk, r] of (GEO.equi || []).slice().sort((a, b) => a[1] - b[1])) if (r > 14 && cy - r > 50 && yPrev - (cy - r) > 15) { tz.texto(conPrefijo(Vk, 'V', 3), cx + 4, cy - r - 2, { fuente: 'num', tam: 11, color: 'electrico', base: 'bottom', halo: true }); yPrev = cy - r; }
      // Nombres de las cáscaras
      sol.capas.forEach((cp, i) => {
        const a = 0.8 + 0.25 * i, r = cp.r2 * esc + 8, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a) + 12;
        tz.compuesto([{ t: cp.nombre || (cp.tipo === 'conductor' ? 'Conductor' : 'Dieléctrico'), f: 'ui', tam: 12 }, ...(cp.tipo === 'dielectrico' ? [{ t: '  κ = ' + limpio(cp.kappa, 2), f: 'num', tam: 11, color: 'texto-2' }] : [])], x, y, { alinear: 'left' });
      });
    }
    fichaRadial();
    tz.barraEscala(16, tz.h - 56);
  }
  function fichaRadial() {
    const sol = RAD, r = radioG(); if (!(r > 0)) return;
    const f = flujoRadial(sol, r), cil = sol.simetria === 'cilindrica';
    const filas = [
      [{ t: cil ? 'Cilindro gaussiano · L = 1 m' : 'Superficie gaussiana', f: 'ui', tam: 11.5 }, { t: '  r = ' + cantidad(r * 100, 'cm', 4), f: 'num', tam: 11.5, color: 'texto-3' }],
      [{ t: 'Φ', f: 'sim', tam: 13, color: 'electrico' }, { t: 'E', f: 'sim', tam: 9.5, dy: 3, color: 'electrico' }, { t: ' = ' + conPrefijo(f.E, 'V·m', 4), f: 'num', tam: 11.5 }],
      [{ t: 'Q', f: 'sim', tam: 13 }, { t: 'total', f: 'simRecta', tam: 9.5, dy: 3 }, { t: '/', f: 'num', tam: 11.5 }, { t: 'ε', f: 'sim', tam: 13 }, { t: '0', f: 'simRecta', tam: 9.5, dy: 3 }, { t: ' = ' + conPrefijo(sol.Qtotal(r) / EPSILON_0, 'V·m', 4), f: 'num', tam: 11.5 }],
      [{ t: 'Φ', f: 'sim', tam: 13 }, { t: 'D', f: 'sim', tam: 9.5, dy: 3 }, { t: ' = ' + conPrefijo(f.D, 'C', 4), f: 'num', tam: 11.5 }, { t: '  (carga libre)', f: 'ui', tam: 11, color: 'texto-3' }],
      [{ t: 'E', f: 'sim', tam: 13, color: 'electrico' }, { t: ' = ' + conPrefijo(sol.E(r), 'V/m', 4), f: 'num', tam: 11.5 }, { t: '   V', f: 'sim', tam: 13, color: 'electrico' }, { t: ' = ' + conPrefijo(sol.V(r), 'V', 4), f: 'num', tam: 11.5 }],
    ];
    tz.ficha(16, 52, filas);
  }

  function dibujar() {
    tz.limpiar();
    if (ERROR && !SIM && !RAD) { tz.texto(ERROR, tz.w / 2, tz.h / 2, { alinear: 'center', color: 'error' }); return; }
    if (esPlacas() && SIM) dibujarPlacas(); else if (RAD) dibujarRadial();
  }

  // ---------------------------------------------------------------------
  // Paneles: árbol, inspector, lecturas, variables
  // ---------------------------------------------------------------------
  const ico = id => `<svg class="ico"><use href="#${id}"/></svg>`;
  const simHTML = (a, b, recta) => `<span class="sim">${a}${b ? `<sub${recta ? ' class="r"' : ''}>${b}</sub>` : ''}</span>`;
  const conSigno = (v, u, c = 3) => (v > 0 ? '+' : '') + conPrefijo(v, u, c);

  function construirArbol() {
    const filas = [], nodo = (id, icono, nombre, dato = '') => `<div class="nodo" data-sel="${id}" aria-selected="${sel === id}">${ico(icono)}<span class="nombre">${nombre}</span><span class="dato" data-dato="${id}">${dato}</span></div>`;
    if (esPlacas()) {
      filas.push(nodo('capacitor', 'o-capacitor-placas', 'Capacitor de placas'));
      ESC.placas.capas.forEach((cp, i) => filas.push(nodo('capa' + i, cp.tipo === 'conductor' ? 'o-conductor' : 'o-dielectrico', cp.nombre || (cp.tipo === 'conductor' ? 'Conductor' : 'Dieléctrico'))));
      filas.push(nodo('bateria', 'o-bateria', 'Batería e interruptor'));
      filas.push(nodo('voltimetro', 'n-voltimetro', 'Voltímetro'));
      if (!estatica()) filas.push(nodo('proceso', 'i-historial', 'Proceso'));
    } else {
      const cil = ESC.radial.simetria === 'cilindrica';
      filas.push(nodo('central', cil ? 'o-hilo-infinito' : RAD && RAD.a > 0 ? 'o-esfera-cargada' : 'o-carga-positiva', cil ? (RAD && RAD.a > 0 ? 'Conductor central' : 'Hilo central') : RAD && RAD.a > 0 ? 'Esfera central' : 'Carga central'));
      ESC.radial.capas.forEach((cp, i) => filas.push(nodo('capa' + i, cp.tipo === 'conductor' ? 'o-conductor' : 'o-dielectrico', cp.nombre || (cp.tipo === 'conductor' ? 'Cáscara conductora' : 'Cáscara dieléctrica'))));
      if (ESC.gauss) filas.push(nodo('gauss', 'n-superficie-gauss', cil ? 'Cilindro gaussiano' : 'Superficie gaussiana'));
    }
    $('#arbol').innerHTML = filas.join('');
    lecturas();
  }
  $('#arbol').addEventListener('click', ev => { const n = /** @type {HTMLElement} */ (/** @type {Element} */ (ev.target).closest('.nodo')); if (n) seleccionar(n.dataset.sel); });
  function seleccionar(id) { sel = id; construirArbol(); construirInspector(); todo(); }
  const selValida = id => (esPlacas() ? ['capacitor', 'bateria', 'voltimetro', ...(estatica() ? [] : ['proceso'])].includes(id) || (/^capa\d+$/.test(id) && ESC.placas.capas[+id.slice(4)]) : id === 'central' || (id === 'gauss' && ESC.gauss) || (/^capa\d+$/.test(id) && ESC.radial.capas[+id.slice(4)]));

  function campoHTML(clave, prop, dim, eje) {
    const u = DIMEN[dim];
    if (ligada(prop)) {
      const d = V()[prop.v], ft = factorTexto(prop.f), mismo = eje && (eje === d.sim || eje === nombreVar(d));
      return `<div class="campo es-variable" data-desligar="${clave}" data-ayuda="Ligado a la variable ${nombreVar(d)} · doble clic para desligar|Bound to variable">${eje && !mismo ? `<span class="eje">${eje}</span>` : ''}<span class="chip-var"><span class="sim">${ft.pre}${d.sim}${d.sub ? `<sub class="r">${d.sub}</sub>` : ''}${ft.post}</span></span><span class="valor-var" data-ligado="${clave}"></span><span class="u">${u.u}</span></div>`;
    }
    const val = valor(prop);
    return `<div class="campo">${eje ? `<span class="eje">${eje}</span>` : ''}<input data-clave="${clave}" value="${val == null ? '' : fmt(val / u.si, 4)}" spellcheck="false"${prop && prop.suma ? ' readonly' : ''}><span class="u">${u.u}</span></div>`;
  }
  const casilla = (clave, txt, marcada) => `<label class="casilla"><input type="checkbox" data-mostrar="${clave}"${marcada ? ' checked' : ''}>${txt}</label>`;
  const grupo = (titulo, cuerpo, id) => `<details class="grupo" open><summary>${ico('i-chevron-abajo')}<span${id ? ` id="${id}"` : ''}>${titulo}</span></summary>${cuerpo}</details>`;
  const fila = (etq, control) => `<div class="fila"><span class="etq">${etq}</span>${control}</div>`;
  const cab = (icono, t1, t2) => `<div class="insp-cab"><div class="miniatura">${ico(icono)}</div><div><div class="t1">${t1}</div><div class="t2" id="insp-estado">${t2}</div></div></div>`;
  const segm = (clave, ops, actual) => `<div class="segmentado texto" data-ajuste="${clave}">${ops.map(([v, txt]) => `<button data-v="${v}" aria-pressed="${actual === v}">${txt}</button>`).join('')}</div>`;

  function construirInspector() {
    if (!selValida(sel)) sel = esPlacas() ? 'capacitor' : ESC.gauss ? 'gauss' : 'central';
    let h = '';
    const lect = grupo('Lecturas', '<div class="lecturas" id="lecturas"></div>', 'lect-titulo');
    if (esPlacas()) {
      const p = ESC.placas;
      if (sel === 'capacitor') {
        h += cab('o-capacitor-placas', 'Capacitor de placas', 'Placas paralelas ideales (sin efecto de borde)');
        h += grupo('Geometría', fila('Área', campoHTML('placas.S', p.S, 'area', 'S')) + fila('Separación', campoHTML('placas.d', p.d, 'mm', 'd')));
        h += lect;
      } else if (sel === 'bateria') {
        h += cab('o-bateria', 'Batería e interruptor', 'Fuente ideal de voltaje');
        let cuerpo = fila('Voltaje', campoHTML('placas.V', p.V, 'potencial', ESC.bateria || 'V₀'));
        cuerpo += fila('Al empezar', segm('placas.conectada', [['si', 'Conectada'], ['no', 'Desconectada']], p.conectada !== false ? 'si' : 'no'));
        if (p.conectada === false) cuerpo += fila('Carga', campoHTML('placas.Q0', p.Q0 ?? 0, 'carga', 'Q₀'));
        if (ESC.conmutaBateria) cuerpo += '<p style="margin:2px var(--e-3) var(--e-2);font-size:var(--t-micro);color:var(--texto-3)">Compara el mismo proceso con la batería conectada y desconectada.</p>';
        h += grupo('Propiedades', cuerpo) + lect;
      } else if (sel === 'voltimetro') {
        h += cab('n-voltimetro', 'Voltímetro', 'Ideal: no toma carga') + lect;
      } else if (sel === 'proceso') {
        const nombres = { separar: 'Separar las placas hasta', insertar: 'Lámina', bateria: 'Batería' };
        const items = SIM.escena.acciones.map(a => {
          let txt = nombres[a.tipo];
          if (a.tipo === 'separar') txt += ` d = ${cantidad(a.hasta * 1e3, 'mm', 3)}`;
          if (a.tipo === 'insertar') txt = `${a.hasta > 0 ? 'Meter' : 'Sacar'} «${ESC.placas.capas[a.capa]?.nombre || 'capa'}»${a.hasta > 0 && a.hasta < 1 ? ` hasta el ${limpio(a.hasta * 100, 1)} %` : ''}`;
          if (a.tipo === 'bateria') txt = a.conectada ? 'Se conecta la batería' : 'Se desconecta la batería';
          return `<li><span class="num">${a.t1 > a.t0 ? `${limpio(a.t0, 2)}–${limpio(a.t1, 2)} s` : `${limpio(a.t0, 2)} s`}</span>${txt}</li>`;
        }).join('');
        h += cab('i-historial', 'Proceso', 'Cuasiestático: en cada instante, equilibrio') + grupo('Acciones', `<ol class="proceso">${items}</ol>`) + lect;
      } else {
        const i = +sel.slice(4), cp = p.capas[i];
        h += cab(cp.tipo === 'conductor' ? 'o-conductor' : 'o-dielectrico', cp.nombre, cp.tipo === 'conductor' ? 'Lámina conductora sin carga neta' : 'Lámina dieléctrica lineal');
        let c = fila('Material', segm(`capa${i}.tipo`, [['dielectrico', 'Dieléctrico'], ['conductor', 'Conductor']], cp.tipo));
        if (cp.tipo === 'dielectrico') c += fila('Permitividad', campoHTML(`capa${i}.kappa`, cp.kappa, 'adim', 'κ'));
        c += fila('Altura', campoHTML(`capa${i}.z0`, cp.z0, 'mm', 'z₀')) + fila('Espesor', campoHTML(`capa${i}.espesor`, cp.espesor, 'mm', 't'));
        c += fila('Área desde', campoHTML(`capa${i}.a0`, cp.a0 ?? 0, 'fraccion')) + fila('Área hasta', campoHTML(`capa${i}.a1`, cp.a1 ?? 1, 'fraccion'));
        h += grupo('Propiedades', c) + lect;
      }
    } else {
      const r = ESC.radial, cil = r.simetria === 'cilindrica';
      if (sel === 'central') {
        h += cab(cil ? 'o-hilo-infinito' : 'o-esfera-cargada', cil ? 'Centro: hilo o conductor' : 'Centro: carga o esfera conductora', cil ? 'Carga por unidad de largo' : 'Carga libre');
        h += grupo('Propiedades', fila(cil ? 'Densidad' : 'Carga', campoHTML('radial.q', r.q, cil ? 'lambda' : 'carga', cil ? 'λ' : 'Q')) + fila('Radio', campoHTML('radial.a', r.a || 0, 'cm', 'a')) + '<p style="margin:2px var(--e-3) var(--e-2);font-size:var(--t-micro);color:var(--texto-3)">Radio 0: carga puntual o hilo.</p>') + lect;
      } else if (sel === 'gauss') {
        h += cab('n-superficie-gauss', cil ? 'Cilindro gaussiano' : 'Superficie gaussiana', 'Concéntrica · arrastra su borde en el lienzo');
        h += grupo('Geometría', fila('Radio', campoHTML('gauss.r', ESC.gauss.r, 'cm', 'r'))) + lect;
      } else {
        const i = +sel.slice(4), cp = r.capas[i];
        h += cab(cp.tipo === 'conductor' ? 'o-conductor' : 'o-dielectrico', cp.nombre, cp.tipo === 'conductor' ? 'Cáscara conductora' : 'Cáscara dieléctrica');
        let c = fila('Material', segm(`capa${i}.tipo`, [['conductor', 'Conductor'], ['dielectrico', 'Dieléctrico']], cp.tipo));
        c += fila('Radio interior', campoHTML(`capa${i}.r1`, cp.r1, 'cm', 'r₁')) + fila('Radio exterior', campoHTML(`capa${i}.r2`, cp.r2, 'cm', 'r₂'));
        if (cp.tipo === 'dielectrico') c += fila('Permitividad', campoHTML(`capa${i}.kappa`, cp.kappa ?? 1, 'adim', 'κ'));
        else if (!cp.tierra) c += fila(cil ? 'Carga/largo' : 'Carga neta', campoHTML(`capa${i}.q`, cp.q || 0, cil ? 'lambda' : 'carga', 'q'));
        if (cp.tipo === 'conductor' && !cil) c += casilla('tierra', 'Conectada a tierra (V = 0)', !!cp.tierra);
        h += grupo('Propiedades', c) + lect;
      }
    }
    $('#inspector').innerHTML = h;
    lecturas();
  }

  // Objeto y propiedad de una clave "placas.d", "capa0.kappa", "radial.q", "gauss.r"
  function objetoYProp(clave) {
    const [id, prop] = clave.split('.');
    const obj = id === 'placas' ? ESC.placas : id === 'radial' ? ESC.radial : id === 'gauss' ? ESC.gauss : /^capa\d+$/.test(id) ? (esPlacas() ? ESC.placas.capas : ESC.radial.capas)[+id.slice(4)] : null;
    return [obj, prop];
  }
  const DIM_PROP = { S: 'area', d: 'mm', V: 'potencial', Q0: 'carga', kappa: 'adim', z0: 'mm', espesor: 'mm', a0: 'fraccion', a1: 'fraccion', a: 'cm', r1: 'cm', r2: 'cm', r: 'cm' };
  function leerCantidad(txt, dimNombre) {
    const D = DIMEN[dimNombre];
    const variables = Object.fromEntries(Object.entries(V()).map(([n, d]) => [n, { valor: d.val * d.si, dim: DIMEN[d.dim].dim }]));
    try {
      if (D.simple) return { valor: evaluar(txt, { variables, esperada: D.dim, unidadPorDefecto: D.simple }).valor };
      const r = evaluar(txt, { variables });
      if (r.dim.every(e => Math.abs(e) < 1e-9)) return { valor: r.valor * D.si };
      return { valor: evaluar(txt, { variables, esperada: D.dim }).valor };
    } catch (e) { return { error: e.message }; }
  }
  const insp = $('#inspector');
  insp.addEventListener('change', ev => {
    const el = /** @type {HTMLInputElement} */ (ev.target);
    if (el.dataset.clave) { aplicarCampo(el.dataset.clave, el.value, el); return; }
    if (el.dataset.mostrar === 'tierra') { const [obj] = objetoYProp(sel + '.x'); obj.tierra = el.checked; if (el.checked) delete obj.q; else obj.q = 0; cambio(); }
  });
  insp.addEventListener('click', ev => {
    const b = /** @type {HTMLElement} */ (/** @type {Element} */ (ev.target).closest('.segmentado button')); if (!b) return;
    const g = /** @type {HTMLElement} */ (b.parentElement), [id, prop] = g.dataset.ajuste.split('.'), val = b.dataset.v;
    if (id === 'placas' && prop === 'conectada') {
      const p = ESC.placas; p.conectada = val === 'si';
      if (!p.conectada && p.Q0 == null) p.Q0 = capacitancia(PL) * valor(p.V);
      if (p.conectada) p.Q0 = null;
    } else {
      const [obj] = objetoYProp(id + '.x');
      obj.tipo = val;
      if (val === 'dielectrico' && obj.kappa == null) obj.kappa = 3;
      if (val === 'conductor' && !esPlacas() && obj.q == null) obj.q = 0;
    }
    cambio();
  });
  insp.addEventListener('dblclick', ev => {
    const el = /** @type {HTMLElement} */ (/** @type {Element} */ (ev.target).closest('[data-desligar]')); if (!el) return;
    const [obj, prop] = objetoYProp(el.dataset.desligar); if (!obj) return;
    obj[prop] = valor(obj[prop]); cambio();
    const ent = insp.querySelector(`input[data-clave="${el.dataset.desligar}"]`); if (ent) { /** @type {HTMLInputElement} */ (ent).focus(); /** @type {HTMLInputElement} */ (ent).select(); }
  });
  insp.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target instanceof Element && ev.target.matches('input[data-clave]')) /** @type {HTMLElement} */ (ev.target).blur(); });
  function marcarError(el, msg) {
    el.closest('.campo').classList.add('es-error');
    const f = el.closest('.fila');
    let p = f.querySelector('.mensaje-error'); if (!p) { p = document.createElement('p'); p.className = 'mensaje-error'; f.appendChild(p); }
    p.textContent = msg;
  }
  function aplicarCampo(clave, txt, el) {
    const [obj, prop] = objetoYProp(clave); if (!obj) return;
    const r = leerCantidad(txt, DIM_PROP[prop] || (prop === 'q' ? (ESC.radial?.simetria === 'cilindrica' ? 'lambda' : 'carga') : 'adim'));
    if (r.error) { marcarError(el, r.error); return; }
    if (['S', 'd', 'r', 'r2'].includes(prop) && !(r.valor > 0)) { marcarError(el, 'Tiene que ser positiva.'); return; }
    if (['espesor', 'z0', 'a', 'r1', 'a0', 'a1', 'V'].includes(prop) && !(r.valor >= 0)) { marcarError(el, 'No puede ser negativa.'); return; }
    if (prop === 'kappa' && !(r.valor >= 1)) { marcarError(el, 'La permitividad relativa es ≥ 1.'); return; }
    if ((prop === 'a0' || prop === 'a1') && r.valor > 1) { marcarError(el, 'Escribe un porcentaje entre 0 y 100.'); return; }
    const antes = obj[prop]; obj[prop] = r.valor;
    simular();
    if (ERROR) { const msg = mensajeMotor(ERROR); obj[prop] = antes; simular(); marcarError(el, msg); return; }
    cambio();
  }
  function fmtVar(d, f = 1) {
    const dec = !(d.paso > 0) || d.paso >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(d.paso) - 1e-9));
    return (f * d.val).toFixed(dec).replace('-', '−');
  }
  function refrescarLigados() {
    insp.querySelectorAll('[data-ligado]').forEach(el => { const [obj, p] = objetoYProp(/** @type {HTMLElement} */ (el).dataset.ligado), x = obj && obj[p]; if (ligada(x)) el.textContent = fmtVar(V()[x.v], x.f); });
  }

  function lecturas() {
    const filaL = ([a, b, val, u, recta]) => `${simHTML(a, b, recta)}<span class="v">${typeof val === 'string' ? val : fmt(val, 4)}</span><span class="u">${u}</span>`;
    const fp = (sim, sub, v, u, recta) => { const [n, uu] = conPrefijo(v, u, 4).split(Volta.ESP); return [sim, sub, n, uu ?? u, recta]; };
    $('#reloj').innerHTML = estatica() ? '<span class="sim">t</span><span class="u">estática</span>' : `<span class="sim">t</span>${fmt(t, 4).padStart(6, ' ')}<span class="u">s</span>`;
    $('#cx').textContent = estatica() ? '—' : cantidad(t, 's', 4);
    const tit = $('#lect-titulo'); if (tit) tit.textContent = estatica() ? 'Lecturas' : `Lecturas en t = ${fmt(t, 4)} s`;
    let filas = [];
    if (esPlacas() && SIM) {
      const st = estadoEn(t), C0 = EPSILON_0 * PL.S / st.d;
      if (sel === 'capacitor' || sel === 'voltimetro') {
        filas = [fp('C', '', st.C, 'F'), fp('C', '0', C0, 'F', true), ['C/C', '0', st.C / C0, '', true], fp('Q', '', st.Q, 'C'), fp('V', '', st.V, 'V'), fp('σ', '', st.columnas[0].sigma, 'C/m²'), fp('U', '', st.U, 'J'), fp('F', '', st.F, 'N')];
        if (sel === 'voltimetro') filas = [fp('V', '', st.V, 'V'), fp('E', 'vacío', st.columnas[0].regiones.find(r => r.tipo === 'vacio')?.E ?? 0, 'V/m', true)];
        formulas(filas, st);
      } else if (sel === 'bateria') {
        filas = [fp('V', 'bat', valor(ESC.placas.V), 'V', true), ['', '', st.conectada ? 'conectada' : 'abierta', ''], fp('W', 'bat', st.Wbat, 'J', true), fp('Q', '', st.Q, 'C')];
      } else if (sel === 'proceso') {
        filas = [fp('ΔU', '', st.U - SIM.U0, 'J'), fp('W', 'bat', st.Wbat, 'J', true), fp('W', 'ext', st.Wext, 'J', true), fp('Q', 'calor', st.calor, 'J', true), fp('F', '', st.F, 'N')];
      } else if (/^capa\d+$/.test(sel)) {
        const i = +sel.slice(4), cp = st.capas[i], col = st.columnas.find(cl => cl.regiones.some(r => r.capa === cp));
        const reg = col && col.regiones.find(r => r.capa === cp);
        filas = reg ? [fp('E', 'dentro', reg.E, 'V/m', true), fp('D', '', reg.D, 'C/m²'), fp('ΔV', '', reg.V0 - reg.V1, 'V')] : [['', '', 'fuera', '']];
        const sup = col && col.superficies.find(s => s.capa === cp && s.sigma > 0);
        if (sup) filas.push(fp('σ', cp.tipo === 'conductor' ? 'ind' : 'pol', sup.sigma, 'C/m²', true));
        filas.push(['metido', '', limpio(((cp.a1 ?? 1) - (cp.a0 ?? 0)) * 100, 1), '%', true]);
      }
    } else if (RAD) {
      const sol = RAD, cil = sol.simetria === 'cilindrica', uQ = cil ? 'C/m' : 'C';
      if (sel === 'gauss') {
        const r = radioG(), f = flujoRadial(sol, r);
        filas = [['r', '', r * 100, 'cm'], fp('Φ', 'E', f.E, 'V·m'), fp('Q', 'total', sol.Qtotal(r), uQ, true), fp('Φ', 'D', f.D, cil ? 'C/m' : 'C'), fp('Q', 'libre', sol.Qlibre(r), uQ, true), fp('E', '', sol.E(r), 'V/m'), fp('D', '', sol.D(r), cil ? 'C/m²' : 'C/m²'), fp('V', '', sol.V(r), 'V')];
        if (cil) filas.splice(1, 0, ['L', '', '1', 'm']);
      } else if (sel === 'central') {
        filas = [fp(cil ? 'λ' : 'Q', '', sol.q, uQ), fp('V', '', sol.V(sol.a > 0 ? sol.a : 1e-9), 'V')];
        const ext = sol.capas.find(cp => cp.tipo === 'conductor');
        if (sol.a > 0 && ext) { const dV = sol.V(sol.a) - sol.V(ext.r1); filas.push(fp(cil ? 'C/L' : 'C', '', sol.q / dV, cil ? 'F/m' : 'F')); }
        filas.push(fp('U', 'campo', energiaRadial(sol, sol.a > 0 ? sol.a : 1e-4 * (sol.capas[0]?.r1 || 0.01), Infinity), cil ? 'J/m' : 'J', true));
      } else if (/^capa\d+$/.test(sel)) {
        const i = +sel.slice(4), cp = sol.capas[i], sup = sol.superficies.filter(s => s.capa === cp);
        filas = [fp('q', 'int', sup[0].q, uQ, true), fp('q', 'ext', sup[1].q, uQ, true)];
        if (cp.tipo === 'conductor') filas.push(fp('q', 'neta', cp.q, uQ, true), fp('V', '', sol.V((cp.r1 + cp.r2) / 2), 'V'));
        else filas.push(fp('E', 'dentro', sol.E((cp.r1 + cp.r2) / 2), 'V/m', true));
      }
    }
    const l = $('#lecturas'); if (l) l.innerHTML = filas.map(filaL).join('');
    document.querySelectorAll('#arbol [data-dato]').forEach(el => { el.textContent = datoArbol(/** @type {HTMLElement} */ (el).dataset.dato); });
    $('#b-play').innerHTML = ico(jugando ? 'i-pausar' : 'i-reproducir');
    refrescarLigados();
  }
  // Respuesta del examen junto a la lectura de la simulación (para comparar)
  function formulas(filas, st) {
    const C0 = EPSILON_0 * PL.S / SIM.geometria(0).d, f = ESC.formula;
    if (f === 'mext-2017-2-b') { const e = valor(ESC.placas.capas[0].kappa); filas.push(fpTeo('2ε/(ε + 1)·C', 2 * e / (e + 1) * C0, 'F')); }
    if (f === 'mext-2017-2-d') { const e1 = valor(ESC.placas.capas[0].kappa), e2 = valor(ESC.placas.capas[1].kappa); filas.push(fpTeo('(ε₁ + ε₂)/2·C', (e1 + e2) / 2 * C0, 'F')); }
    if (f === 'mext-2016-1-3') filas.push(fpTeo('Q/(Cd)', st.Q / (st.C * st.d), 'V/m'));
    if (f === 'mext-2020-1-3') { const d = SIM.geometria(0).d, Dd = valor(ESC.vars.Dd ? L('Dd') : 0), Vb = valor(ESC.placas.V); filas.push(fpTeo('ε₀SV²Δd/(2d²)', EPSILON_0 * PL.S * Vb * Vb * Dd / (2 * d * d), 'J'), fpTeo('W', st.Wext, 'J', 'ext')); }
    if (f === 'mext-2008-1-2') { const Q = valor(ESC.placas.Q0); filas.push(fpTeo('Q²/C', Q * Q / C0, 'J'), fpTeo('W', st.Wext, 'J', 'ext')); }
    if (f === 'mext-2010-4-b') filas.push(['U/U', '0', st.U / SIM.U0, '', true]);
    if (f === 'mext-2007-2') filas.push(fpTeo('W', st.Wext, 'J', 'ext'), fpTeo('W', st.Wbat, 'J', 'bat'));
  }
  function fpTeo(txt, v, u, sub) { const [n, uu] = conPrefijo(v, u, 4).split(Volta.ESP); return [txt, sub || '', n, uu ?? u, true]; }
  function datoArbol(id) {
    if (esPlacas() && SIM) {
      const st = estadoEn(t);
      if (id === 'capacitor') return conPrefijo(st.C, 'F', 3);
      if (id === 'bateria') return st.conectada ? 'conectada' : 'abierta';
      if (id === 'voltimetro') return conPrefijo(st.V, 'V', 3);
      if (id === 'proceso') return conPrefijo(st.Wext, 'J', 3);
      if (/^capa\d+$/.test(id)) { const cp = st.capas[+id.slice(4)]; if (!cp) return ''; return cp.tipo === 'dielectrico' ? 'κ ' + limpio(cp.kappa, 2) : limpio(((cp.a1 ?? 1) - (cp.a0 ?? 0)) * 100, 0) + ' %'; }
    } else if (RAD) {
      const cil = RAD.simetria === 'cilindrica';
      if (id === 'central') return conSigno(RAD.q, cil ? 'C/m' : 'C');
      if (id === 'gauss') return conPrefijo(RAD.Qtotal(radioG()), cil ? 'C/m' : 'C', 3);
      if (/^capa\d+$/.test(id)) { const cp = RAD.capas[+id.slice(4)]; if (!cp) return ''; return cp.tipo === 'dielectrico' ? 'κ ' + limpio(cp.kappa, 2) : cp.tierra ? 'a tierra' : conSigno(cp.q, cil ? 'C/m' : 'C'); }
    }
    return '';
  }

  function construirVariables() {
    const cont = $('#variables'); cont.innerHTML = '';
    for (const [k, d] of Object.entries(V())) {
      const filaV = document.createElement('div'); filaV.className = 'var' + (d.constante ? ' constante' : '');
      const control = d.constante ? `<span class="constante-etq">Constante · ${d.u}</span>` : `<input class="deslizador" type="range" min="${d.min}" max="${d.max}" step="${d.paso}" value="${d.val}" aria-label="${nombreVar(d)}" data-var="${k}">`;
      filaV.innerHTML = `${simHTML(d.sim, d.sub, true)}${control}<span class="valor"></span>`;
      const ent = filaV.querySelector('input'), val = filaV.querySelector('.valor');
      d.pintar = () => { val.innerHTML = d.constante ? fmt(d.val, 4) : `${fmtVar(d)}<span class="u">${d.u}</span>`; if (ent) { ent.value = String(d.val); Volta.pintarDeslizador(ent); } };
      if (ent) {
        ent.addEventListener('input', () => {
          const antes = d.val; d.val = parseFloat(ent.value); simular();
          if (ERROR) { const msg = mensajeMotor(ERROR); d.val = antes; simular(); aviso(msg); }
          d.pintar(); recalcular(); construirArbol();
        });
        ent.addEventListener('change', () => registrar());
      }
      d.pintar(); cont.appendChild(filaV);
    }
  }

  // ---------------------------------------------------------------------
  // Deshacer, rehacer y cambios
  // ---------------------------------------------------------------------
  const instantanea = () => copia(ESC);
  function botonesHistorial() { $('#b-deshacer').disabled = !historial?.puedeDeshacer; $('#b-rehacer').disabled = !historial?.puedeRehacer; }
  function registrar() { if (historial && historial.registrar(instantanea())) botonesHistorial(); if (autoguardar) autoguardado.guardar('electrostatica-conductores', escenaActual()); }
  function restaurar(d) { ESC = d; $('#arbol').innerHTML = ''; titulo(); construirVariables(); recalcular(); construirArbol(); construirInspector(); }
  function deshacer() { const d = historial?.deshacer(); if (d) { restaurar(d); botonesHistorial(); } }
  function rehacer() { const d = historial?.rehacer(); if (d) { restaurar(d); botonesHistorial(); } }
  $('#b-deshacer').addEventListener('click', deshacer);
  $('#b-rehacer').addEventListener('click', rehacer);
  function cambio() { recalcular(); registrar(); construirArbol(); construirInspector(); }

  // ---------------------------------------------------------------------
  // Panel inferior: gráficas, energía, eventos y tabla
  // ---------------------------------------------------------------------
  const lt = new LineaTiempo($('#tl'), { duracion: 1, eventos: [], alCambiar: nt => { t = nt; jugando = false; todo(); } });
  const sim = s => `<span class="sim">${s}</span>`;
  const cabG = (id, html) => { $(id).innerHTML = html; };
  function unidadDe(vals, u) {
    const abs = vals.filter(isFinite).map(Math.abs).sort((a, b) => a - b), m = abs.length ? abs[Math.min(abs.length - 1, Math.floor(0.98 * abs.length))] : 0;
    const [f, p] = [[1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']].find(([x]) => m >= x * 0.999) || [1e-12, 'p'];
    return { f, u: p + u };
  }
  const rango = (vals, desdeCero) => { const fin = vals.filter(isFinite); let lo = Math.min(...fin, ...(desdeCero ? [0] : [])), hi = Math.max(...fin, ...(desdeCero ? [0] : [])); if (hi - lo < 1e-30) { hi += 1; lo -= desdeCero ? 0 : 1; } const pad = (hi - lo) * 0.1; return { min: desdeCero && lo >= 0 ? 0 : lo - pad, max: hi + pad }; };
  let MUESTRAS = null;
  function muestras() {
    if (MUESTRAS) return MUESTRAS;
    const n = 300, r = [];
    for (let i = 0; i <= n; i++) { const tt = DUR() * i / n, s = estadoEn(tt); r.push({ t: tt, d: s.d, C: s.C, Q: s.Q, V: s.V, E: s.columnas[0]?.regiones.find(x => x.tipo === 'vacio')?.E ?? 0, U: s.U, Wbat: s.Wbat, Wext: s.Wext, calor: s.calor, F: s.F }); }
    MUESTRAS = r; return r;
  }

  function graficas() {
    if (!$('#p-energia').hidden) energiaPanel();
    if ($('#p-graficas').hidden) return;
    if (esPlacas() && SIM) { if (estatica()) graficasPerfil(); else graficasProceso(); }
    else if (RAD) graficasRadial();
  }
  function graficasProceso() {
    const m = muestras(), st = estadoEn(t), evs = SIM.eventos.map(e => ({ x: e.t }));
    const uQ = unidadDe(m.map(x => x.Q), 'C'), uV = unidadDe(m.map(x => x.V), 'V'), uE = unidadDe(m.flatMap(x => [x.U, x.Wbat, x.Wext, x.calor]), 'J');
    cabG('#t1', `${sim('Q')} contra ${sim('t')}`); cabG('#t2', `${sim('V')} contra ${sim('t')}`);
    cabG('#t3', `Energía: ${sim('U')}, <span class="sim">W<sub>bat</sub></span>, <span class="sim">W<sub>ext</sub></span>`);
    grafica($('#g1'), { x: { min: 0, max: DUR() }, y: rango(m.map(x => x.Q / uQ.f), true), series: [{ tramos: [m.map(x => [x.t, x.Q / uQ.f])], familia: 'tinta' }], cursor: t, puntoCursor: [t, st.Q / uQ.f], eventos: evs });
    grafica($('#g2'), { x: { min: 0, max: DUR() }, y: rango(m.map(x => x.V / uV.f), true), series: [{ tramos: [m.map(x => [x.t, x.V / uV.f])], familia: 'electrico' }], cursor: t, puntoCursor: [t, st.V / uV.f], eventos: evs });
    const series = [{ tramos: [m.map(x => [x.t, x.U / uE.f])], familia: 'electrico', etiqueta: 'U' }, { tramos: [m.map(x => [x.t, x.Wbat / uE.f])], familia: 'tinta', patron: 'discontinuo', etiqueta: 'W bat' }, { tramos: [m.map(x => [x.t, x.Wext / uE.f])], familia: 'tinta', patron: 'punteado', etiqueta: 'W ext' }];
    if (m.some(x => x.calor > 0)) series.push({ tramos: [m.map(x => [x.t, x.calor / uE.f])], familia: 'termico', etiqueta: 'calor' });
    grafica($('#g3'), { x: { min: 0, max: DUR() }, y: rango(m.flatMap(x => [x.U, x.Wbat, x.Wext, x.calor].map(v => v / uE.f))), series, cursor: t, eventos: evs });
    $('#l1').textContent = cantidad(st.Q / uQ.f, uQ.u); $('#l2').textContent = cantidad(st.V / uV.f, uV.u); $('#l3').textContent = uE.u;
  }
  // Capacitor sin proceso: V(z) y E(z) a través del hueco (primera columna) y C contra d
  function graficasPerfil() {
    const st = estadoEn(0), col = st.columnas[0], d = st.d, pv = [], pe = [];
    for (const r of col.regiones) { pv.push([r.z0 * 1e3, r.V0], [r.z1 * 1e3, r.V1]); pe.push([r.z0 * 1e3, r.E], [r.z1 * 1e3, r.E]); }
    const uE = unidadDe(pe.map(p => p[1]), 'V/m');
    const titCol = st.columnas.length > 1 ? ' · primera columna' : '';
    cabG('#t1', `${sim('V')} contra ${sim('z')} (mm)${titCol}`); cabG('#t2', `${sim('E')} contra ${sim('z')} (mm)`); cabG('#t3', `${sim('C')} contra ${sim('d')} (mm), mismas capas`);
    grafica($('#g1'), { x: { min: 0, max: d * 1e3 }, y: rango(pv.map(p => p[1]), true), series: [{ tramos: [pv], familia: 'electrico' }], eventos: [] });
    grafica($('#g2'), { x: { min: 0, max: d * 1e3 }, y: rango(pe.map(p => p[1] / uE.f), true), series: [{ tramos: [pe.map(p => [p[0], p[1] / uE.f])], familia: 'electrico' }], eventos: [] });
    const espesor = Math.max(0, ...st.capas.map(c => c.z0 + c.espesor)), pts = [];
    for (let i = 1; i <= 120; i++) {
      const dd = Math.max(espesor * 1.0001, d * 0.25) + (d * 3 - Math.max(espesor * 1.0001, d * 0.25)) * i / 120;
      try { pts.push([dd * 1e3, capacitancia({ ...PL, d: dd })]); } catch { /* geometría imposible */ }
    }
    const uC = unidadDe(pts.map(p => p[1]), 'F');
    grafica($('#g3'), { x: { min: pts[0]?.[0] ?? 0, max: pts[pts.length - 1]?.[0] ?? 1 }, y: rango(pts.map(p => p[1] / uC.f), true), series: [{ tramos: [pts.map(p => [p[0], p[1] / uC.f])], familia: 'tinta' }], cursor: d * 1e3, puntoCursor: [d * 1e3, st.C / uC.f], eventos: [] });
    $('#l1').textContent = cantidad(st.V, 'V'); $('#l2').textContent = cantidad(col.regiones[0].E / uE.f, uE.u); $('#l3').textContent = cantidad(st.C / uC.f, uC.u);
  }
  function graficasRadial() {
    const sol = RAD, rg = radioG(), Rmax = 1 / tz.vista.escala * Math.min(tz.w, tz.h) / 2 * 1.4, pts = [];
    // Sin cuerpo central, E y V divergen en r = 0: la gráfica empieza en 6 % del rango
    const r0 = sol.a > 0 ? 0 : 0.06 * Rmax;
    for (let i = 0; i <= 400; i++) { const r = r0 + (Rmax - r0) * i / 400 || 1e-9; pts.push([r, sol.E(r), sol.V(r), sol.Qtotal(r), sol.Qlibre(r)]); }
    const uE = unidadDe(pts.map(p => p[1]), 'V/m'), uV = unidadDe(pts.map(p => p[2]), 'V'), cil = sol.simetria === 'cilindrica', uQ = unidadDe(pts.flatMap(p => [p[3], p[4]]), cil ? 'C/m' : 'C');
    cabG('#t1', `${sim('E')} contra ${sim('r')} (cm)`); cabG('#t2', `${sim('V')} contra ${sim('r')} (cm)`); cabG('#t3', `${sim('Q')} encerrada contra ${sim('r')}`);
    const X = { min: 0, max: Rmax * 100 };
    grafica($('#g1'), { x: X, y: { min: 0, max: Math.max(...pts.map(p => p[1] / uE.f).filter(isFinite)) * 1.15 || 1 }, series: [{ tramos: [pts.map(p => [p[0] * 100, p[1] / uE.f])], familia: 'electrico' }], cursor: rg * 100, puntoCursor: [rg * 100, sol.E(rg) / uE.f], eventos: [] });
    const vs = pts.map(p => p[2] / uV.f).filter(isFinite).sort((a, b) => a - b);
    grafica($('#g2'), { x: X, y: rango([vs[0], vs[vs.length - 1], 0]), series: [{ tramos: [pts.map(p => [p[0] * 100, p[2] / uV.f])], familia: 'electrico' }], cursor: rg * 100, puntoCursor: [rg * 100, sol.V(rg) / uV.f], eventos: [] });
    grafica($('#g3'), { x: X, y: rango(pts.flatMap(p => [p[3] / uQ.f, p[4] / uQ.f]).concat([0])), series: [{ tramos: [pts.map(p => [p[0] * 100, p[3] / uQ.f])], familia: 'tinta', etiqueta: 'total' }, { tramos: [pts.map(p => [p[0] * 100, p[4] / uQ.f])], familia: 'tinta', patron: 'discontinuo', etiqueta: 'libre' }], cursor: rg * 100, eventos: [] });
    $('#l1').textContent = cantidad(sol.E(rg) / uE.f, uE.u); $('#l2').textContent = cantidad(sol.V(rg) / uV.f, uV.u); $('#l3').textContent = cantidad(sol.Qtotal(rg) / uQ.f, uQ.u);
  }

  function energiaPanel() {
    const nota = $('#nota-energia');
    if (esPlacas() && SIM) {
      const st = estadoEn(t), m = muestras(), uE = unidadDe(m.flatMap(x => [x.U, x.Wbat, x.Wext, x.calor]).concat([st.U]), 'J');
      pintarBarras([['Almacenada U', 'electrico', st.U], ['Variación ΔU', 'electrico', st.U - SIM.U0], ['Batería W_bat', 'tinta', st.Wbat], ['Agente W_ext', 'tinta', st.Wext], ['Calor', 'termico', st.calor]], uE);
      nota.innerHTML = `W<sub>ext</sub> + W<sub>bat</sub> = ΔU + calor: <span class="num">${cantidad((st.Wext + st.Wbat) / uE.f, uE.u, 4)} = ${cantidad((st.U - SIM.U0 + st.calor) / uE.f, uE.u, 4)}</span>`;
      const uF = unidadDe(m.map(x => x.F), 'N');
      cabG('#t4', `Fuerza entre las placas ${sim('F')} contra ${sim('t')}`); $('#l4').textContent = cantidad(st.F / uF.f, uF.u);
      grafica($('#g4'), { x: { min: 0, max: DUR() }, y: rango(m.map(x => x.F / uF.f), true), series: [{ tramos: [m.map(x => [x.t, x.F / uF.f])], familia: 'interaccion' }], cursor: estatica() ? null : t, eventos: SIM.eventos.map(e => ({ x: e.t })) });
    } else if (RAD) {
      const sol = RAD, cil = sol.simetria === 'cilindrica', r0 = sol.a > 0 ? sol.a : 1e-3 * Math.max(sol.capas[0]?.r1 || 0.05, 0.01);
      const tramos = [], bordes = [r0, ...[...new Set(sol.capas.flatMap(c => [c.r1, c.r2]))].filter(r => r > r0).sort((a, b) => a - b), Infinity];
      for (let i = 0; i + 1 < bordes.length; i++) { const U = energiaRadial(sol, bordes[i], bordes[i + 1]); if (U > 0) tramos.push([`${limpio(bordes[i] * 100, 2)}–${isFinite(bordes[i + 1]) ? limpio(bordes[i + 1] * 100, 2) : '∞'} cm`, 'electrico', U]); }
      const uE = unidadDe(tramos.map(x => x[2]), cil ? 'J/m' : 'J');
      pintarBarras(tramos, uE);
      nota.textContent = cil ? 'Energía del campo ½∫D·E por metro de largo, por tramos.' : `Energía del campo ½∫D·E por tramos${sol.a > 0 ? '' : ' (desde 1/1000 del primer radio: la de una carga puntual no es finita)'}.`;
      const pts = []; for (let i = 1; i <= 200; i++) { const r = r0 + (bordes[bordes.length - 2] * 1.6 - r0) * i / 200; pts.push([r * 100, energiaRadial(sol, r0, r)]); }
      cabG('#t4', `Energía dentro de ${sim('r')} contra ${sim('r')} (cm)`); $('#l4').textContent = uE.u;
      grafica($('#g4'), { x: { min: pts[0][0], max: pts[pts.length - 1][0] }, y: rango(pts.map(p => p[1] / uE.f), true), series: [{ tramos: [pts.map(p => [p[0], p[1] / uE.f])], familia: 'electrico' }], eventos: [] });
    }
  }
  function pintarBarras(filas, un) {
    const vals = filas.map(f => f[2]), lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), rangoB = (hi - lo) * 1.04 || 1, z = (-lo + (hi - lo) * 0.02) / rangoB * 100;
    $('#barras').innerHTML = filas.map(([n, f, val]) => {
      const w = Math.abs(val) / rangoB * 100, izq = val >= 0 ? z : z - w;
      return `<div class="barra-e"><span>${n.replace(/_(\w+)/, '<sub>$1</sub>')}</span><span class="riel"><i style="left:${izq}%;width:${w}%;background:${f === 'tinta' ? 'var(--tinta)' : `var(--f-${f})`}"></i><b class="cero" style="left:${z}%"></b></span><span class="v">${cantidad(val / un.f, un.u, 4)}</span></div>`;
    }).join('');
  }
  function tablas() {
    if (esPlacas() && SIM) {
      const fila = (n, s, tt) => `<tr class="${Math.abs(tt - t) < 1e-9 ? 'actual' : ''}"><td style="font-family:var(--fuente-interfaz)">${n}</td><td>${fmt(tt, 4)}</td><td>${fmt(s.d * 1e3, 4)}</td><td>${fmt(s.C * 1e12, 5)}</td><td>${fmt(s.Q * 1e9, 5)}</td><td>${fmt(s.V, 5)}</td><td>${fmt(s.U * 1e9, 5)}</td><td>${fmt(s.Wbat * 1e9, 5)}</td><td>${fmt(s.Wext * 1e9, 5)}</td></tr>`;
      const cabT = '<tr><th>Estado</th><th>t (s)</th><th>d (mm)</th><th>C (pF)</th><th>Q (nC)</th><th>V (V)</th><th>U (nJ)</th><th>W<sub>bat</sub> (nJ)</th><th>W<sub>ext</sub> (nJ)</th></tr>';
      if (estatica()) {
        const st = estadoEn(0);
        $('#t-eventos').innerHTML = '<tr><th>Columna</th><th>Región</th><th>z₀ (mm)</th><th>z₁ (mm)</th><th>κ</th><th>E (kV/m)</th><th>V₀ (V)</th><th>V₁ (V)</th></tr>' +
          st.columnas.flatMap((col, i) => col.regiones.map(r => `<tr><td>${i + 1} · ${limpio(col.f0 * 100, 1)}–${limpio(col.f1 * 100, 1)} %</td><td style="font-family:var(--fuente-interfaz)">${{ vacio: 'Vacío', dielectrico: 'Dieléctrico', conductor: 'Conductor' }[r.tipo]}</td><td>${fmt(r.z0 * 1e3, 4)}</td><td>${fmt(r.z1 * 1e3, 4)}</td><td>${r.kappa === Infinity ? '∞' : fmt(r.kappa, 3)}</td><td>${fmt(r.E / 1e3, 5)}</td><td>${fmt(r.V0, 5)}</td><td>${fmt(r.V1, 5)}</td></tr>`)).join('');
      } else {
        $('#t-eventos').innerHTML = cabT + fila('Inicio', estadoEn(0), 0) + SIM.eventos.map(e => fila(e.nombre, estadoEn(e.t), e.t)).join('') + fila('Final', estadoEn(DUR()), DUR());
      }
      $('#t-datos').innerHTML = cabT.replace('Estado', 'n') + muestras().filter((_, i) => i % 6 === 0).map((m, i) => fila(String(i), estadoEn(m.t), m.t)).join('');
    } else if (RAD) {
      const sol = RAD, cil = sol.simetria === 'cilindrica', u = cil ? 'nC/m' : 'nC';
      $('#t-eventos').innerHTML = `<tr><th>Superficie</th><th>r (cm)</th><th>Tipo de carga</th><th>q (${u})</th></tr>` + sol.superficies.map(s => `<tr><td style="font-family:var(--fuente-interfaz)">${s.capa ? s.capa.nombre || '' : 'Centro'}</td><td>${fmt(s.r * 100, 4)}</td><td style="font-family:var(--fuente-interfaz)">${{ central: 'Libre', inducida: 'Inducida y libre', polarizacion: 'De polarización' }[s.tipo]}</td><td>${fmt(s.q * 1e9, 5)}</td></tr>`).join('');
      let filas = `<tr><th>r (cm)</th><th>E (V/m)</th><th>D (C/m²)</th><th>V (V)</th><th>Q total (${u})</th><th>Q libre (${u})</th></tr>`;
      const Rmax = 1.3 * Math.max(...sol.capas.map(c => c.r2), sol.a, radioG(), 0.02);
      for (let i = 1; i <= 60; i++) { const r = Rmax * i / 60; filas += `<tr><td>${fmt(r * 100, 4)}</td><td>${fmt(sol.E(r), 5)}</td><td>${fmt(sol.D(r), 5)}</td><td>${fmt(sol.V(r), 5)}</td><td>${fmt(sol.Qtotal(r) * 1e9, 5)}</td><td>${fmt(sol.Qlibre(r) * 1e9, 5)}</td></tr>`; }
      $('#t-datos').innerHTML = filas;
    }
  }

  function todo() {
    dibujar(); lecturas(); lt.poner(Math.min(t, DUR())); graficas();
    if (!$('#p-eventos').hidden || !$('#p-tabla').hidden) tablas();
  }
  function recalcular() {
    MUESTRAS = null; simular();
    if (ERROR) aviso(mensajeMotor(ERROR));
    const est = estatica();
    lt.duracion = DUR(); lt.simulado = DUR();
    lt.eventos = SIM && !est ? SIM.eventos.map(e => ({ t: e.t, nombre: e.nombre })) : [];
    $('#panel-inf').classList.toggle('estatica', est);
    document.querySelectorAll('.transporte button, #velocidades button').forEach(b => { /** @type {HTMLButtonElement} */ (b).disabled = est; });
    $('#pest-eventos').textContent = esPlacas() ? (est ? 'Regiones' : 'Eventos') : 'Superficies';
    if (est) { t = 0; jugando = false; }
    if (!esPlacas() && RAD) encuadrarRadial();
    todo();
  }

  // ---------------------------------------------------------------------
  // Escenas: título, menú, guardar, abrir, autoguardado (datos no confiables)
  // ---------------------------------------------------------------------
  function titulo() {
    $('#escena-nombre').textContent = ESC.titulo;
    const chip = $('#escena-chip');
    chip.textContent = ESC.tipo === 'MEXT' ? `MEXT ${ESC.anio || ''}`.trim() : ESC.tipo || 'Propio';
    chip.className = 'chip' + (ESC.tipo === 'MEXT' ? ' lleno' : '');
    document.title = `Volta · Conductores y dieléctricos · ${ESC.titulo}`;
    document.querySelectorAll('.capa-btn').forEach(b => b.setAttribute('aria-pressed', String(!!ESC.capas[/** @type {HTMLElement} */ (b).dataset.capa])));
  }
  function escenaActual() { return crearEscena({ modulo: 'electrostatica', espacio: ESPACIO, titulo: ESC.titulo, datos: instantanea() }); }
  function abrirEscena1(clave) {
    ESC = completa(escenaDe(clave));
    sel = esPlacas() ? 'capacitor' : ESC.gauss ? 'gauss' : 'central'; t = 0; jugando = false; $('#arbol').innerHTML = '';
    titulo(); construirVariables(); recalcular(); construirArbol(); construirInspector();
    if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); }
    if (autoguardar) autoguardado.guardar('electrostatica-conductores', escenaActual());
  }
  // Valida y acota lo que viene de un archivo
  function datosSeguros(d = {}) {
    const base = completa(escenaDe(typeof d.clave === 'string' ? d.clave : 'capacitor'));
    const nombres = Object.keys(base.vars).filter(k => !base.vars[k].constante);
    for (const k of nombres) { const b = base.vars[k], x = d.vars && d.vars[k]; b.val = numero(x && typeof x === 'object' ? x.val : x, b.val, b.min, b.max); }
    const ok = x => typeof x === 'object' || Number.isFinite(x);
    const mag = (x, min, max, def) => { if (x && typeof x === 'object' && Array.isArray(x.suma)) { const s = x.suma.slice(0, 4).map(y => magnitud(y, nombres, NaN, min, max)); return s.every(ok) ? { suma: s } : def; } const m = magnitud(x, nombres, NaN, min, max); return ok(m) ? m : def; };
    const r = { ...base, titulo: texto(d.titulo, base.titulo, 80) };
    for (const k of Object.keys(r.capas)) if (typeof d.capas?.[k] === 'boolean') r.capas[k] = d.capas[k];
    if (base.modo === 'placas') {
      const p = d.placas && typeof d.placas === 'object' ? d.placas : {}, b = base.placas;
      r.placas = { ...b, S: mag(p.S, 1e-8, 1e3, b.S), d: mag(p.d, 1e-7, 1, b.d), V: mag(p.V, 0, 1e7, b.V), conectada: p.conectada !== false, Q0: p.Q0 == null ? null : mag(p.Q0, -1, 1, null), entra: 'derecha' };
      if (!r.placas.conectada && r.placas.Q0 == null) r.placas.Q0 = b.Q0 ?? 0;
      r.placas.capas = (Array.isArray(p.capas) ? p.capas : b.capas).slice(0, 8).filter(c => c && typeof c === 'object').map(c => ({
        tipo: c.tipo === 'conductor' ? 'conductor' : 'dielectrico', nombre: texto(c.nombre, c.tipo === 'conductor' ? 'Conductor' : 'Dieléctrico', 24),
        z0: mag(c.z0, 0, 1, 0), espesor: mag(c.espesor, 0, 1, 0), kappa: mag(c.kappa, 1, 1e4, 1), a0: mag(c.a0, 0, 1, 0), a1: mag(c.a1, 0, 1, 1),
      }));
      const nc = r.placas.capas.length;
      r.placas.acciones = (Array.isArray(p.acciones) ? p.acciones : b.acciones).slice(0, 12).filter(a => a && typeof a === 'object' && ['separar', 'insertar', 'bateria'].includes(a.tipo)).map(a => {
        const o = { tipo: a.tipo, t0: numero(a.t0, 0, 0, 1e4) };
        if (a.tipo !== 'bateria') o.t1 = numero(a.t1, o.t0, o.t0, 1e4);
        if (a.tipo === 'separar') o.hasta = mag(a.hasta, 1e-7, 1, valor(r.placas.d));
        if (a.tipo === 'insertar') { o.capa = Math.round(numero(a.capa, 0, 0, Math.max(0, nc - 1))); o.hasta = numero(a.hasta, 1, 0, 1); }
        if (a.tipo === 'bateria') o.conectada = !!a.conectada;
        return o;
      }).filter(a => a.tipo !== 'insertar' || nc > 0);
      r.duracion = numero(d.duracion, base.duracion || 5, 0, 1e4);
      if (r.placas.acciones.length && !(r.duracion > 0)) r.duracion = Math.max(...r.placas.acciones.map(a => a.t1 ?? a.t0)) + 1;
    } else {
      const q = d.radial && typeof d.radial === 'object' ? d.radial : {}, b = base.radial;
      r.radial = { ...b, simetria: q.simetria === 'cilindrica' ? 'cilindrica' : b.simetria, q: mag(q.q, -1, 1, b.q), a: mag(q.a, 0, 1e3, b.a || 0) };
      r.radial.capas = (Array.isArray(q.capas) ? q.capas : b.capas).slice(0, 8).filter(c => c && typeof c === 'object').map(c => {
        const o = { tipo: c.tipo === 'dielectrico' ? 'dielectrico' : 'conductor', nombre: texto(c.nombre, c.tipo === 'dielectrico' ? 'Cáscara dieléctrica' : 'Cáscara conductora', 24), r1: mag(c.r1, 0, 1e3, 0.05), r2: mag(c.r2, 1e-6, 1e3, 0.06) };
        if (o.tipo === 'dielectrico') o.kappa = mag(c.kappa, 1, 1e4, 1); else if (c.tierra && r.radial.simetria === 'esferica') o.tierra = true; else o.q = mag(c.q, -1, 1, 0);
        return o;
      });
      r.gauss = d.gauss && typeof d.gauss === 'object' ? { r: mag(d.gauss.r, 1e-6, 1e3, base.gauss?.r ?? 0.05) } : base.gauss;
    }
    return r;
  }
  function cargarDatos(d) {
    ESC = d; sel = esPlacas() ? 'capacitor' : 'central'; t = 0; jugando = false; $('#arbol').innerHTML = '';
    titulo(); construirVariables(); recalcular();
    if (ERROR) { aviso('La escena del archivo no describe un sistema válido; se abre la escena de partida.'); ESC = completa(ESCENAS[0]); titulo(); construirVariables(); recalcular(); }
    construirArbol(); construirInspector();
    if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); }
  }
  function guardar() { guardarEscena(escenaActual()).then(r => { if (r) aviso('Escena guardada'); }, err => aviso(`No se pudo guardar: ${err}`)); }
  function aOtroEspacio(e) {
    if (!e || e.espacio === ESPACIO) return false;
    try { sessionStorage.setItem('volta.abrir', JSON.stringify(e)); } catch { /* sin almacenamiento */ }
    location.href = 'electrostatica.html';
    return true;
  }
  function abrir() {
    abrirEscena({ modulo: 'electrostatica' }).then(e => { if (aOtroEspacio(e)) return; cargarDatos(datosSeguros(e.datos)); aviso(`Escena abierta: ${texto(e.titulo, 'sin título', 60)}`); })
      .catch(err => aviso(texto(err.message, 'No se pudo abrir la escena.', 200)));
  }

  // ---------------------------------------------------------------------
  // Reproducción y avisos
  // ---------------------------------------------------------------------
  function cuadro(ahora) {
    if (jugando) { t = Math.min(DUR(), t + Math.min(0.05, (ahora - ultimo) / 1000) * velocidad); if (t >= DUR()) jugando = false; todo(); }
    ultimo = ahora; requestAnimationFrame(cuadro);
  }
  const irA = nt => { if (estatica()) return; t = nt; jugando = false; todo(); };
  function alternar() { if (estatica()) return; if (t >= DUR()) t = 0; jugando = !jugando; todo(); }
  $('#b-play').addEventListener('click', alternar);
  $('#b-reiniciar').addEventListener('click', () => irA(0));
  $('#b-atras').addEventListener('click', () => irA(Math.max(0, t - 1 / 30)));
  $('#b-adelante').addEventListener('click', () => irA(Math.min(DUR(), t + 1 / 30)));
  $('#velocidades').addEventListener('click', ev => { const b = /** @type {HTMLElement} */ (/** @type {Element} */ (ev.target).closest('button')); if (b) velocidad = parseFloat(b.dataset.v); });
  function ponerCapa(k, on) { ESC.capas[k] = on; document.querySelectorAll(`.capa-btn[data-capa="${k}"]`).forEach(b => b.setAttribute('aria-pressed', String(on))); }
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => { const k = /** @type {HTMLElement} */ (b).dataset.capa; ponerCapa(k, !ESC.capas[k]); registrar(); dibujar(); }));
  $('#pest').addEventListener('click', () => setTimeout(todo, 0));
  let relojAviso = null;
  function aviso(txt) {
    let el = $('#aviso');
    if (!el) { el = document.createElement('div'); el.id = 'aviso'; el.className = 'aviso-flotante'; area.appendChild(el); }
    el.innerHTML = `${ico('i-info')}<span></span>`; el.querySelector('span').textContent = txt;
    el.hidden = false; clearTimeout(relojAviso); relojAviso = setTimeout(() => { el.hidden = true; }, 3800);
  }
  document.addEventListener('click', ev => {
    const b = ev.target instanceof Element ? ev.target.closest('button[data-pendiente]') : null;
    if (!b) return;
    setTimeout(() => b.setAttribute('aria-pressed', 'false'), 0);
    aviso(/** @type {HTMLElement} */ (b).dataset.pendiente);
  });

  // ---------------------------------------------------------------------
  // Lienzo: selección y arrastre (superficie gaussiana, lámina que entra)
  // ---------------------------------------------------------------------
  function objetoEn(x, y) {
    if (!GEO) return null;
    if (GEO.modo === 'placas') {
      const g = GEO.g;
      if (GEO.voltimetro && x > GEO.voltimetro[0] && x < GEO.voltimetro[2] && y > GEO.voltimetro[1] && y < GEO.voltimetro[3]) return 'voltimetro';
      if (GEO.circuito && x > GEO.circuito[0] + 20 && x < GEO.circuito[2] && y > GEO.circuito[1] && y < GEO.circuito[3]) return 'bateria';
      for (let i = GEO.capas.length - 1; i >= 0; i--) { const c = GEO.capas[i]; if (x > c[0] && x < c[2] && y > c[1] && y < c[3]) return 'capa' + i; }
      if (x > g.X0 && x < g.X1 && (Math.abs(y - (g.yTop - 4)) < 7 || Math.abs(y - (g.yBot + 4)) < 7)) return 'capacitor';
      return null;
    }
    const v = tz.vista, [cx, cy] = v.P([0, 0]), r = Math.hypot(x - cx, y - cy) / v.escala;
    if (ESC.gauss && Math.abs(r - radioG()) * v.escala < 6) return 'gauss';
    for (let i = RAD.capas.length - 1; i >= 0; i--) if (r > RAD.capas[i].r1 && r < RAD.capas[i].r2) return 'capa' + i;
    if (r * v.escala < Math.max(G.carga + 3, RAD.a * v.escala)) return 'central';
    return null;
  }
  const pos = ev => { const r = lienzo.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
  lienzo.addEventListener('pointerdown', ev => {
    const [x, y] = pos(ev), o = objetoEn(x, y);
    if (!o) return;
    if (sel !== o) seleccionar(o);
    if (o === 'gauss') { arrastre = { tipo: 'gauss' }; lienzo.setPointerCapture(ev.pointerId); }
  });
  lienzo.addEventListener('pointermove', ev => {
    const [x, y] = pos(ev);
    if (arrastre && arrastre.tipo === 'gauss') {
      const v = tz.vista, [cx, cy] = v.P([0, 0]), r = Math.hypot(x - cx, y - cy) / v.escala, p = Volta.pasoAgradable(90 / v.escala) / (ev.shiftKey ? 100 : 10);
      ESC.gauss.r = Math.max(p, Math.round(r / p) * p); arrastre.movido = true; todo(); return;
    }
    const h = objetoEn(x, y);
    if (h !== hover) { hover = h; dibujar(); }
    lienzo.style.cursor = h === 'gauss' ? 'ew-resize' : h ? 'pointer' : 'default';
  });
  lienzo.addEventListener('pointerup', () => { if (arrastre && arrastre.movido) { registrar(); construirInspector(); } arrastre = null; });
  lienzo.addEventListener('pointerleave', () => { if (hover) { hover = null; dibujar(); } });
  $('#b-encuadrar').addEventListener('click', () => { if (!esPlacas() && RAD) encuadrarRadial(); todo(); });

  // Paleta
  $('#paleta-objetos').addEventListener('click', ev => {
    const b = /** @type {HTMLElement} */ (/** @type {Element} */ (ev.target).closest('.herr')); if (!b) return;
    const tipo = b.dataset.objeto;
    setTimeout(() => b.setAttribute('aria-pressed', 'false'), 0);
    if (tipo === 'capacitor') { abrirEscena1('capacitor'); return; }
    if (tipo === 'esfera') { abrirEscena1('nuevo-esferico'); aviso('Simetría esférica: añade cáscaras con Conductor o Dieléctrico.'); return; }
    if (tipo === 'hilo') { abrirEscena1('nuevo-cilindrico'); aviso('Simetría cilíndrica: añade cáscaras con Conductor o Dieléctrico.'); return; }
    if (tipo === 'bateria') {
      if (!esPlacas()) { aviso('La batería se conecta a un capacitor de placas.'); return; }
      const p = ESC.placas; p.conectada = !(p.conectada !== false);
      if (!p.conectada) p.Q0 = capacitancia(PL) * valor(p.V); else p.Q0 = null;
      sel = 'bateria'; cambio(); aviso(p.conectada ? 'Batería conectada al empezar' : 'Batería desconectada: la carga queda fija'); return;
    }
    if (tipo === 'tierra') {
      const i = /^capa\d+$/.test(sel) ? +sel.slice(4) : -1, cp = !esPlacas() && i >= 0 ? ESC.radial.capas[i] : null;
      if (!cp || cp.tipo !== 'conductor' || ESC.radial.simetria !== 'esferica') { aviso('Selecciona una cáscara conductora de un sistema esférico para conectarla a tierra.'); return; }
      cp.tierra = !cp.tierra; if (cp.tierra) delete cp.q; else cp.q = 0; cambio(); return;
    }
    if (tipo === 'conductor' || tipo === 'dielectrico') anadirCapa(tipo);
  });
  function anadirCapa(tipo) {
    if (esPlacas()) {
      const d = valor(ESC.placas.d), ocupadas = PL.capas.filter(c => (c.a1 ?? 1) > (c.a0 ?? 0)).map(c => [c.z0, c.z0 + c.espesor]).sort((a, b) => a[0] - b[0]);
      const t0 = d / 4; let z = 0;
      for (const [a, b] of ocupadas) { if (a - z >= t0) break; z = Math.max(z, b); }
      if (d - z < t0 - 1e-12) { aviso('No queda hueco libre entre las placas para otra lámina.'); return; }
      ESC.placas.capas.push(tipo === 'conductor' ? cond(z, t0, { nombre: `Conductor ${ESC.placas.capas.length + 1}` }) : diel(z, t0, 3, { nombre: `Dieléctrico ${ESC.placas.capas.length + 1}` }));
      sel = 'capa' + (ESC.placas.capas.length - 1);
    } else {
      const ultimo = Math.max(RAD.a, ...RAD.capas.map(c => c.r2), 0.02), r1 = ultimo * 1.3, r2 = ultimo * 1.6;
      ESC.radial.capas.push(tipo === 'conductor' ? { tipo, nombre: 'Cáscara conductora', r1, r2, q: 0 } : { tipo, nombre: 'Cáscara dieléctrica', r1, r2, kappa: 3 });
      sel = 'capa' + (ESC.radial.capas.length - 1);
    }
    cambio();
  }
  $('#paleta-instrumentos').addEventListener('click', ev => {
    const b = /** @type {HTMLElement} */ (/** @type {Element} */ (ev.target).closest('.herr')); if (!b || b.dataset.pendiente) return;
    setTimeout(() => b.setAttribute('aria-pressed', 'false'), 0);
    if (b.dataset.instrumento === 'voltimetro') { if (esPlacas()) seleccionar('voltimetro'); else aviso('El voltímetro mide entre las placas de un capacitor; aquí, V(r) está en la superficie gaussiana.'); }
    if (b.dataset.instrumento === 'gauss') {
      if (esPlacas()) { aviso('Con placas ideales el campo es uniforme: la ley de Gauss da σ/ε₀ en cada región (ver las lecturas de las capas).'); return; }
      if (!ESC.gauss) { ESC.gauss = { r: Math.max(RAD.a, ...RAD.capas.map(c => c.r2), 0.03) * 1.2 }; sel = 'gauss'; cambio(); } else seleccionar('gauss');
    }
  });
  function borrarSeleccion() {
    if (!/^capa\d+$/.test(sel)) return;
    const i = +sel.slice(4);
    if (esPlacas()) {
      ESC.placas.capas.splice(i, 1);
      ESC.placas.acciones = ESC.placas.acciones.filter(a => a.tipo !== 'insertar' || a.capa !== i).map(a => (a.tipo === 'insertar' && a.capa > i ? { ...a, capa: a.capa - 1 } : a));
    } else ESC.radial.capas.splice(i, 1);
    sel = esPlacas() ? 'capacitor' : 'central'; cambio();
  }

  // ---------------------------------------------------------------------
  // Exportar, menú de escenas, comandos y teclado
  // ---------------------------------------------------------------------
  function exportarCSV() {
    let csv, n;
    if (esPlacas() && SIM) {
      const m = muestras(); n = m.length;
      csv = aCSV(['t (s)', 'd (m)', 'C (F)', 'Q (C)', 'V (V)', 'E vacío (V/m)', 'U (J)', 'W bat (J)', 'W ext (J)', 'calor (J)', 'F (N)'], m.map(x => [x.t, x.d, x.C, x.Q, x.V, x.E, x.U, x.Wbat, x.Wext, x.calor, x.F]));
    } else {
      const Rmax = 1.5 * Math.max(...RAD.capas.map(c => c.r2), RAD.a, radioG(), 0.02), filas = [];
      for (let i = 1; i <= 500; i++) { const r = Rmax * i / 500; filas.push([r, RAD.E(r), RAD.D(r), RAD.V(r), RAD.Qtotal(r), RAD.Qlibre(r)]); }
      n = filas.length; csv = aCSV(['r (m)', 'E (V/m)', 'D (C/m²)', 'V (V)', 'Q total (C)', 'Q libre (C)'], filas);
    }
    descargarTexto('conductores-y-dielectricos-datos.csv', csv).then(r => { if (r) aviso(`Datos exportados: ${n} filas`); }, () => {});
  }
  $('#b-exportar').addEventListener('click', exportarCSV);
  const ICONO_TIPO = { Tutorial: 'i-tutorial', Ejemplo: 'i-ejemplo', MEXT: 'i-mext' };
  const visibles = () => ESCENAS.filter(e => !e.oculta);
  function menuEscenas() {
    const m = $('#menu-escenas');
    if (!m.hidden) { m.hidden = true; return; }
    m.innerHTML = [['Tutorial', 'Tutoriales'], ['Ejemplo', 'Ejemplos'], ['MEXT', 'MEXT · conductores y Gauss (E2) y capacitores (E3)']].map(([g, tit], i) => (i ? '<div class="menu-sep"></div>' : '') + `<div class="menu-titulo">${tit}</div>` + visibles().filter(e => e.tipo === g).map(e =>
      `<div class="menu-item" role="menuitem" data-clave="${e.clave}"${ESC.clave === e.clave ? ' aria-current="true"' : ''}>${ico(ICONO_TIPO[g])}${e.titulo}${e.anio ? `<span class="chip lleno">${e.anio}</span>` : ''}</div>`).join('')).join('') +
      `<div class="menu-sep"></div><div class="menu-titulo">Otro espacio de Electrostática</div><a class="menu-item" role="menuitem" href="electrostatica.html">${ico('o-carga-positiva')}Cargas y campos<span class="atajo">MEXT E1</span></a>`;
    const r = $('#b-escenas').getBoundingClientRect();
    m.style.left = r.left + 'px'; m.style.top = (r.bottom + 4) + 'px'; m.hidden = false;
  }
  $('#b-escenas').addEventListener('click', ev => { ev.stopPropagation(); menuEscenas(); });
  $('#menu-escenas').addEventListener('click', ev => { const it = /** @type {HTMLElement} */ (/** @type {Element} */ (ev.target).closest('.menu-item[data-clave]')); if (!it) return; $('#menu-escenas').hidden = true; abrirEscena1(it.dataset.clave); });
  document.addEventListener('pointerdown', ev => { if (!(ev.target instanceof Element) || !ev.target.closest('#menu-escenas, #b-escenas')) $('#menu-escenas').hidden = true; });
  const alternarCapa = k => () => /** @type {HTMLElement} */ (document.querySelector(`.capa-btn[data-capa="${k}"]`)).click();
  const COMANDOS = [
    ['i-reproducir', 'Reproducir o pausar', 'Espacio', alternar],
    ['i-reiniciar', 'Reiniciar el proceso', 'Inicio', () => irA(0)],
    ['i-deshacer', 'Deshacer', 'Ctrl Z', deshacer], ['i-rehacer', 'Rehacer', 'Ctrl Y', rehacer],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar], ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
    ['i-historial', 'Restablecer la escena original', '', () => abrirEscena1(ESC.clave)],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['i-capas', 'Mostrar u ocultar líneas de campo', 'L', alternarCapa('lineas')], ['i-capas', 'Mostrar u ocultar equipotenciales', 'E', alternarCapa('equi')],
    ['i-capas', 'Mostrar u ocultar las cargas', 'C', alternarCapa('cargas')],
    ['o-conductor', 'Añadir una capa conductora', '', () => anadirCapa('conductor'), 'Objetos'], ['o-dielectrico', 'Añadir una capa dieléctrica', '', () => anadirCapa('dielectrico'), 'Objetos'],
    ['i-borrar', 'Quitar la capa seleccionada', 'Supr', borrarSeleccion],
    ['i-exportar', 'Exportar datos a CSV', '', exportarCSV], ['i-imagen', 'Exportar imagen del lienzo', '', () => descargarLienzo(lienzo, 'conductores-y-dielectricos.png').then(r => { if (r) aviso('Imagen exportada'); })],
    ...visibles().map(e => [ICONO_TIPO[e.tipo], `Abrir escena: ${e.titulo}`, e.tipo === 'MEXT' ? `MEXT ${e.anio}` : e.tipo, () => abrirEscena1(e.clave), 'Escenas']),
    ['o-carga-positiva', 'Ir a Cargas y campos', '', () => { location.href = 'electrostatica.html'; }, 'Escenas'],
  ];
  let selCmd = 0;
  function pintarComandos() {
    const q = $('#cmd-q').value.trim().toLowerCase(), lista = COMANDOS.filter(c => c[1].toLowerCase().includes(q));
    selCmd = Math.min(selCmd, Math.max(0, lista.length - 1));
    let g0 = null, html = '';
    lista.forEach((c, i) => { const g = c[4] || 'Acciones'; if (g !== g0) { html += `<div class="menu-titulo">${g}</div>`; g0 = g; } html += `<div class="menu-item${i === selCmd ? ' activo' : ''}" data-i="${COMANDOS.indexOf(c)}">${ico(c[0])}${c[1]}<span class="atajo">${c[2]}</span></div>`; });
    $('#cmd-lista').innerHTML = html; return lista;
  }
  function abrirComandos() { $('#menu-escenas').hidden = true; $('#velo-comandos').hidden = false; $('#cmd-q').value = ''; selCmd = 0; pintarComandos(); $('#cmd-q').focus(); }
  function cerrarComandos() { $('#velo-comandos').hidden = true; }
  $('#b-comandos').addEventListener('click', abrirComandos);
  $('#cmd-q').addEventListener('input', () => { selCmd = 0; pintarComandos(); });
  $('#cmd-lista').addEventListener('click', ev => { const it = /** @type {HTMLElement} */ (/** @type {Element} */ (ev.target).closest('.menu-item')); if (it) { cerrarComandos(); COMANDOS[+it.dataset.i][3](); } });
  $('#velo-comandos').addEventListener('click', ev => { if (/** @type {Element} */ (ev.target).id === 'velo-comandos') cerrarComandos(); });
  document.addEventListener('keydown', ev => {
    if (!$('#velo-comandos').hidden) {
      const lista = pintarComandos();
      if (ev.key === 'Escape') cerrarComandos();
      else if (ev.key === 'ArrowDown') { selCmd = Math.min(lista.length - 1, selCmd + 1); pintarComandos(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { selCmd = Math.max(0, selCmd - 1); pintarComandos(); ev.preventDefault(); }
      else if (ev.key === 'Enter' && lista[selCmd]) { cerrarComandos(); lista[selCmd][3](); }
      return;
    }
    const ctrl = ev.ctrlKey || ev.metaKey, tecla = ev.key.toLowerCase();
    if (ctrl && tecla === 'k') { ev.preventDefault(); abrirComandos(); return; }
    if (ctrl && tecla === 's') { ev.preventDefault(); guardar(); return; }
    if (ctrl && tecla === 'o') { ev.preventDefault(); abrir(); return; }
    if (ev.target instanceof Element && ev.target.matches('input:not([type=range]), textarea')) return;
    if (ctrl && (tecla === 'y' || (ev.shiftKey && tecla === 'z'))) { ev.preventDefault(); rehacer(); return; }
    if (ctrl && tecla === 'z') { ev.preventDefault(); deshacer(); return; }
    if (ctrl) return;
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) alternar(); }
    else if (ev.key === 'ArrowRight') irA(Math.min(DUR(), t + 1 / 30));
    else if (ev.key === 'ArrowLeft') irA(Math.max(0, t - 1 / 30));
    else if (ev.key === 'Home') irA(0);
    else if (ev.key === 'Escape') $('#menu-escenas').hidden = true;
    else if (ev.key === 'Delete' || ev.key === 'Backspace') borrarSeleccion();
    else if (tecla === 'l') alternarCapa('lineas')();
    else if (tecla === 'e') alternarCapa('equi')();
    else if (tecla === 'c') alternarCapa('cargas')();
  });

  // ---------------------------------------------------------------------
  // Arranque
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); if (!esPlacas() && RAD) encuadrarRadial(); todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search), limpioURL = ![...q.keys()].length;
    const pend = escenaPendiente('electrostatica');
    if (pend && aOtroEspacio(pend)) return;
    const previa = pend || (limpioURL ? autoguardado.leer('electrostatica-conductores', { modulo: 'electrostatica' }) : null);
    tz.ajustar();
    if (q.has('escena') || !previa) ESC = completa(escenaDe(q.get('escena') || 'capacitor'));
    else ESC = datosSeguros(previa.datos);
    autoguardar = limpioURL || !!previa;
    sel = esPlacas() ? 'capacitor' : ESC.gauss ? 'gauss' : 'central';
    titulo(); construirVariables(); recalcular();
    if (q.has('sel')) sel = q.get('sel');
    if (q.has('t') && !estatica()) t = Math.max(0, Math.min(DUR(), parseFloat(q.get('t'))));
    if (q.has('pest')) { const b = /** @type {HTMLElement} */ (document.querySelector(`#pest [aria-controls="p-${q.get('pest')}"]`)); if (b) b.click(); }
    construirArbol(); construirInspector(); todo();
    historial = new Historial(instantanea()); botonesHistorial();
    requestAnimationFrame(a => { ultimo = a; requestAnimationFrame(cuadro); });
  });
})();
