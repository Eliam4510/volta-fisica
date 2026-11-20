/* ==========================================================================
   Volta · Física moderna — espacio de trabajo "Efecto fotoeléctrico"
   Fototubo con su placa metálica, el colector, la fuente de voltaje, el
   amperímetro y el voltímetro; una o varias lámparas de luz monocromática.
   La física está en el motor puro sistema/motores/moderna.js (probado en
   pruebas/moderna.test.js): umbral, K_max = hf − W, corriente I(V) con el
   corte en −V₀ y la saturación, transporte exacto de cada fotoelectrón en
   el campo uniforme del tubo y medida de h con V₀ contra f.
   Evolución temporal: la luz se enciende en t = 0; los electrones que se
   dibujan son una muestra (cada punto representa muchos electrones reales)
   con sus instantes de emisión, energías y direcciones; su vuelo se
   recalcula al instante si cambia el voltaje. El tiempo va en ns.
   Misma estructura que circuitos.js y optica.js: escena → motor → lienzo →
   paneles. Mundo en metros; las longitudes se escriben en cm.
   Parámetros de URL para capturas: ?escena=…&tema=…&sel=<id>|escena
   &pest=mediciones|tabla&t=<ns>
   ========================================================================== */
import {
  METALES, EV, E_CARGA, H, C_LUZ, frecuencia, energiaFoton, frecuenciaUmbral, longitudUmbral, kMax, potencialFrenado,
  tasaFotones, tasasElectrones, corrienteSaturacion, corriente, curvaIV, potencialCorte, medirPotencialFrenado, medirPlanck,
  fraccionPorEnergia, emitirElectrones, vueloElectron, estadoElectron,
} from '../motores/moderna.js';
import { aCSV } from '../nucleo/csv.js';
import { descargarTexto, descargarLienzo, nombreArchivo, avisar as avisarLienzo } from '../componentes/exportar.js';
import { crearEscena, numero, texto } from '../nucleo/escena.js';
import { Historial } from '../nucleo/historial.js';
import { evaluar } from '../nucleo/unidades.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';
import { registrarDocumento, confirmarCambios, documentoNuevo, hayCambios } from '../componentes/documento.js';

(function () {
  'use strict';
  const { Trazo, fmt, cantidad, conPrefijo, grafica, LineaTiempo, ESP } = Volta;
  const $ = s => document.querySelector(s);
  const NS = 1e-9;
  const FAC = { m: 1, cm: 1e-2, mm: 1e-3, nm: 1e-9, ns: 1e-9, mW: 1e-3, W: 1, eV: EV, J: 1, V: 1, '': 1, '%': 0.01 };
  const numCampo = x => String(Number(Number(x).toPrecision(6))).replace('-', '−');
  const simHTML = (a, sub, recto = true) => `<span class="sim">${a}${sub ? `<sub${recto ? ' class="r"' : ''}>${sub}</sub>` : ''}</span>`;
  const eV = J => J / EV;
  // Número con potencia volada también para los muy pequeños (fmt da 0 por debajo de 10⁻¹²): 3.781 × 10⁻¹⁹
  const SUPER = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  function fmtE(v, cifras = 4) {
    if (!Number.isFinite(v)) return '—';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e-3 && a < 1e5) return fmt(v, cifras);
    let e = Math.floor(Math.log10(a)), m = v / Math.pow(10, e);
    if (Math.abs(Number(m.toFixed(cifras - 1))) >= 10) { e += 1; m /= 10; }
    return `${m.toFixed(cifras - 1).replace('-', '−')} × 10${String(e).replace('-', '⁻').replace(/\d/g, d => SUPER[+d])}`;
  }
  // Cuentas grandes con espacio fino entre miles: 10 000; desde 10⁶, en notación científica
  const miles = n => (n >= 1e6 ? fmt(n, 3) : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f'));

  // ---------------------------------------------------------------------
  // Escenas (mundo en m). Variables: valor en su unidad de pantalla;
  // valor físico = val·factor + offset en cada ruta que fijan.
  // ---------------------------------------------------------------------
  const vari = (sim, val, min, max, paso, u, factor, liga, o = {}) => ({ sim, sub: o.sub, val, min, max, paso, u, factor, offset: o.offset ?? 0, liga });
  const lamp = (lambda, PmW, nombre) => ({ lambda: lambda * 1e-9, P: PmW * 1e-3, nombre });
  const placaDe = (metal, eta = 0.01, W = null) => ({ metal, W: W ?? METALES[metal].W * EV, eta });
  const BASE = () => ({
    placa: placaDe('na'), colector: { d: 0.02, R: 0.02, infinito: false }, V: 0, lamparas: [], mediciones: [],
    variables: {}, graficas: ['iv', 'kf', 'energias'],
    capas: { fotones: true, electrones: true, velocidades: true, campo: true, valores: true },
    duracion: 150e-9, porPunto: 3e4, semilla: 1, sel: 'escena',
  });
  const ESCENAS = [
    {
      clave: 'sodio', titulo: 'Efecto fotoeléctrico con sodio', tipo: 'Tutorial',
      lamparas: [lamp(400, 1, 'Lámpara violeta')], sel: 'l1',
      variables: { l: vari('λ', 400, 250, 700, 1, 'nm', 1e-9, ['lamparas.0.lambda']), V: vari('V', 0, -1.5, 4, 0.05, 'V', 1, ['V']) },
    },
    {
      clave: 'frenado', titulo: 'Potencial de frenado', tipo: 'Tutorial', V: -0.4, graficas: ['iv', 'energias', 'kf'],
      lamparas: [lamp(435.8, 1, 'Línea azul del mercurio')], sel: 'fuente',
      variables: { V: vari('V', -0.4, -1.2, 1, 0.01, 'V', 1, ['V']) },
    },
    {
      clave: 'planck', titulo: 'Medir la constante de Planck', tipo: 'Ejemplo', placa: placaDe('cs'), V: -0.6, graficas: ['v0f', 'iv', 'kf'],
      lamparas: [lamp(404.7, 1, 'Lámpara de mercurio')], sel: 'l1',
      // Líneas del mercurio ya medidas al abrir la escena
      mediciones: [365.0, 404.7, 435.8, 546.1].map(l => ({ lambda: l * 1e-9 })),
      variables: { l: vari('λ', 404.7, 300, 600, 0.1, 'nm', 1e-9, ['lamparas.0.lambda']), V: vari('V', -0.6, -2, 2, 0.01, 'V', 1, ['V']) },
    },
    {
      clave: 'umbral', titulo: 'El color decide, no la intensidad', tipo: 'Ejemplo', placa: placaDe('k'), V: 0.5, graficas: ['kf', 'iv', 'intensidad'],
      lamparas: [lamp(590, 5, 'Lámpara amarilla')], sel: 'l1',
      variables: { l: vari('λ', 590, 400, 700, 1, 'nm', 1e-9, ['lamparas.0.lambda']), P: vari('P', 5, 0.1, 10, 0.1, 'mW', 1e-3, ['lamparas.0.P']) },
    },
    {
      clave: 'saturacion', titulo: 'Intensidad y corriente de saturación', tipo: 'Ejemplo', V: 1, graficas: ['iv', 'intensidad', 'energias'],
      lamparas: [lamp(405, 1, 'Lámpara violeta')], sel: 'amperimetro',
      variables: { P: vari('P', 1, 0.1, 4, 0.1, 'mW', 1e-3, ['lamparas.0.P']), V: vari('V', 1, -1, 6, 0.05, 'V', 1, ['V']) },
    },
    {
      clave: 'cinc', titulo: 'Cinc con luz ultravioleta', tipo: 'Ejemplo', placa: placaDe('zn'), V: 0, graficas: ['kf', 'iv', 'energias'],
      lamparas: [lamp(253.7, 0.5, 'Lámpara germicida (UV)'), lamp(435.8, 3, 'Lámpara azul')], sel: 'l2',
      variables: { V: vari('V', 0, -2, 3, 0.05, 'V', 1, ['V']), P: vari('P', 3, 0.5, 10, 0.5, 'mW', 1e-3, ['lamparas.1.P'], { sub: 'azul' }) },
    },
    // ----------------------------------------------------------------- MEXT
    {
      clave: 'mext-2012-1-5', titulo: 'Umbral del sodio en 526 nm', tipo: 'MEXT', anio: '2012 1-(5)', graficas: ['kf', 'iv', 'energias'],
      // La emisión empieza por debajo de λ₀ = 526 nm: W = hc/λ₀ ≈ 3.78 × 10⁻¹⁹ J (con las constantes exactas)
      placa: placaDe('propio', 0.01, H * C_LUZ / 5.26e-7), V: 0,
      lamparas: [lamp(500, 1, 'Lámpara')], sel: 'placa',
      variables: { l: vari('λ', 500, 450, 600, 0.5, 'nm', 1e-9, ['lamparas.0.lambda']) },
    },
  ];
  const completa = e => {
    const b = BASE(), o = JSON.parse(JSON.stringify({ ...b, ...e, capas: { ...b.capas, ...(e.capas || {}) }, colector: { ...b.colector, ...(e.colector || {}) } }));
    o.lamparas.forEach((l, i) => { l.id = 'l' + (i + 1); if (!l.nombre) l.nombre = `Lámpara ${i + 1}`; });
    o.mediciones = o.mediciones.map(m => medicion(o, m.lambda));
    return o;
  };
  const escenaDe = clave => ESCENAS.find(e => e.clave === clave) || ESCENAS[0];

  // ---------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------
  /** @type {any} */ let ESC = completa(ESCENAS[0]);
  let sel = 'escena', vistaTocada = false, escala0 = 1, espacioPulsado = false, hover = null, arrastre = null, paneo = null;
  let autoguardar = false, historial = null, contador = 10;
  let t = 0, jugando = false, velocidad = 1, ultimo = 0;     // t en s
  let MUESTRA = [], claveMuestra = '', CURVA = null, claveCurva = '';
  const lienzo = $('#lienzo'), area = $('#area');
  const tz = new Trazo(lienzo);
  const lampDe = id => ESC.lamparas.find(l => l.id === id);
  const idxLamp = id => ESC.lamparas.findIndex(l => l.id === id);

  // ---------------------------------------------------------------------
  // Escena → motor
  // ---------------------------------------------------------------------
  const tuboDe = (e = ESC) => ({ W: e.placa.W, eta: e.placa.eta, d: e.colector.d, R: e.colector.infinito ? Infinity : e.colector.R, lamparas: e.lamparas.map(l => ({ lambda: l.lambda, P: l.P })) });
  // Una medición: V₀ medido con la corriente simulada (solo esa lámpara)
  function medicion(e, lambda) {
    const tb = tuboDe(e); tb.lamparas = [{ lambda, P: 1e-3 }];
    return { lambda, f: frecuencia(lambda), V0: medirPotencialFrenado(tb) };
  }
  function muestra() {
    const k = JSON.stringify([ESC.lamparas, ESC.placa, ESC.duracion, ESC.porPunto, ESC.semilla]);
    if (k !== claveMuestra) { claveMuestra = k; MUESTRA = emitirElectrones(tuboDe(), { t1: ESC.duracion, porPunto: ESC.porPunto, semilla: ESC.semilla, max: 3000 }); }
    return MUESTRA;
  }
  const kMaxL = l => kMax(frecuencia(l.lambda), ESC.placa.W);
  const V0max = () => potencialCorte(tuboDe());
  function rangoV() {
    const v0 = V0max(), Km = v0 * E_CARGA, d = ESC.colector.d, R = ESC.colector.R;
    const sat = ESC.colector.infinito || !(Km > 0) ? 1.5 : Math.min(30, 1.15 * Km * (2 * d / R) ** 2 / E_CARGA + 0.3);
    return [Math.min(-(1.25 * v0 + 0.25), ESC.V - 0.2), Math.max(1.5, sat, ESC.V + 0.2)];
  }
  function curva() {
    const [a, b] = rangoV(), tb = tuboDe(), k = JSON.stringify([tb, a, b]);
    if (k !== claveCurva) { claveCurva = k; CURVA = { Vmin: a, Vmax: b, puntos: curvaIV(tb, { Vmin: a, Vmax: b, n: 160 }) }; }
    return CURVA;
  }
  // Unidad de corriente según el valor más grande
  const unidadI = I => (I >= 0.9995e-3 ? ['mA', 1e-3] : I >= 0.9995e-6 ? ['µA', 1e-6] : I >= 0.9995e-9 ? ['nA', 1e-9] : ['pA', 1e-12]);

  // ---------------------------------------------------------------------
  // Geometría del esquema (mundo, m)
  // ---------------------------------------------------------------------
  function geometria() {
    const d = ESC.colector.d, inf = ESC.colector.infinito;
    const hR = inf ? 1.4 * d : Math.max(0.12 * d, Math.min(ESC.colector.R, 4 * d));
    const hP = inf ? hR : Math.max(0.5 * d, Math.min(hR, 1.4 * d));
    const top = Math.max(hP, hR) + 0.3 * d;
    const tubo = [-0.45 * d, 1.45 * d, -top, top];
    // Lámparas arriba a la derecha, con el haz por encima del colector
    const n = ESC.lamparas.length, phiMin = Math.atan2(hR, d) + 0.14, phiMax = 84 * Math.PI / 180, yl = top + 0.45 * d;
    const lamparas = ESC.lamparas.map((l, k) => {
      const phi = n === 1 ? Math.min(phiMax, phiMin + 0.12) : phiMin + (phiMax - phiMin) * (k + 0.5) / n;
      return { id: l.id, p: [yl / Math.tan(phi), yl], dir: [-Math.cos(phi), -Math.sin(phi)] };
    });
    // Circuito: la fuente en el cable de la placa (vertical), el voltímetro en
    // paralelo con ella y el amperímetro en el cable del colector
    const xL = -0.85 * d, xR = 1.85 * d, yB = -(top + 0.3 * d), xV = xL - 0.62 * d;
    return {
      d, hR, hP, top, tubo, lamparas, xL, xR, yB, xV,
      bateria: [xL, yB / 2], voltimetro: [xV, yB / 2], amperimetro: [xR, yB / 2], nodosV: [[xL, 0], [xL, yB]],
    };
  }

  // ---------------------------------------------------------------------
  // Dibujo
  // ---------------------------------------------------------------------
  function encuadrar() {
    const g = geometria(), xs = [g.xV, g.xR, ...g.lamparas.map(l => l.p[0])], ys = [g.yB, ...g.lamparas.map(l => l.p[1])];
    // A la derecha queda sitio para los rótulos de las lámparas
    const x0 = Math.min(...xs) - 0.3 * g.d, x1 = Math.max(...xs) + 0.95 * g.d, y0 = Math.min(...ys) - 0.12 * g.d, y1 = Math.max(...ys) + 0.2 * g.d;
    tz.vista.encuadrar({ x0, x1, y0, y1 }, { x: 0, y: 0, w: tz.w, h: tz.h }, 48);
  }

  function dibujar() {
    const g = geometria(), v = tz.vista, tb = tuboDe(), Vv = ESC.V;
    tz.limpiar();
    tz.modernaEtiquetas([...tz.zonasFlotantes()]);
    tz.cuadricula();

    // 3 · Tubo de vidrio y circuito (cables por debajo de los símbolos)
    tz.modernaTubo(g.tubo, { grueso: hover === 'escena-tubo' });
    const ePx = 7 / v.escala, eC = 5 / v.escala;
    tz.modernaCable([[-ePx, 0], [g.xL, 0], [g.xL, g.yB], [g.xR, g.yB], [g.xR, 0], [g.d + eC, 0]]);
    tz.modernaCable([[g.xL, 0], [g.xV, 0], [g.xV, g.yB], [g.xL, g.yB]]);
    tz.modernaNodo(g.nodosV[0]); tz.modernaNodo(g.nodosV[1]);

    // 4 · Luz: haces (debajo de la materia)
    g.lamparas.forEach(gl => { const l = lampDe(gl.id); tz.modernaHaz(gl.p, [0, 0], l.lambda, { rel: Math.min(1, l.P / 2e-3), ancho: 12 }); });

    // 5 · Campo eléctrico en el hueco
    if (ESC.capas.campo && Math.abs(Vv) > 1e-6) {
      const yE = v.Y(-0.78 * Math.min(g.hP, g.hR)), xa = v.X(0.3 * g.d), xb = v.X(0.7 * g.d);
      if (Vv > 0) tz.modernaCampo(xb, yE, xa, yE); else tz.modernaCampo(xa, yE, xb, yE);
      tz.modernaOcupar({ x: Math.min(xa, xb) - 4, y: yE - 24, w: Math.abs(xb - xa) + 8, h: 30 });
    }

    // 6 · Materia: placa, colector, batería y medidores
    const rp = tz.modernaPlaca(0, -g.hP, g.hP, -1, { grueso: hover === 'placa' });
    const rc = tz.modernaPlaca(g.d, -g.hR, g.hR, 1, { grosor: 5, grueso: hover === 'colector' });
    tz.modernaOcupar({ x: rp.x - 2, y: rp.y - 2, w: rp.w + 4, h: rp.h + 4 }); tz.modernaOcupar({ x: rc.x - 2, y: rc.y - 2, w: rc.w + 4, h: rc.h + 4 });
    // Con V > 0 el borne positivo va hacia el colector (abajo, por el amperímetro)
    tz.modernaBateria(g.bateria, Vv >= 0 ? -1 : 1, { vertical: true, grueso: hover === 'fuente' });
    const [ax, ay] = tz.modernaMedidor(g.amperimetro, 'A', { grueso: hover === 'amperimetro' });
    const [vx, vy] = tz.modernaMedidor(g.voltimetro, 'V', { grueso: hover === 'voltimetro' });
    const [bx, by] = v.P(g.bateria);
    for (const [x, y] of [[ax, ay], [vx, vy]]) tz.modernaOcupar({ x: x - 14, y: y - 14, w: 28, h: 28 });
    tz.modernaOcupar({ x: bx - 16, y: by - 16, w: 32, h: 32 });

    // 7 · Fotones y electrones
    if (ESC.capas.fotones) dibujarFotones(g);
    if (ESC.capas.electrones) dibujarElectrones(g);
    // Lámparas encima de sus haces
    g.lamparas.forEach(gl => {
      const l = lampDe(gl.id), [X, Y] = tz.modernaLampara(gl.p, l.lambda, { direccion: Math.atan2(gl.dir[1], gl.dir[0]), grueso: hover === gl.id });
      tz.modernaOcupar({ x: X - 24, y: Y - 24, w: 48, h: 48 });
    });

    // 8 · Instrumentos y valores
    dibujarValores(g, tb);
    // 10 · Selección
    dibujarSeleccion(g);
    tz.modernaBarraEscala(16, tz.h - 56, 'cm', 100);
  }

  // Fotones: paquetes del color de la luz que viajan a c de la lámpara a la
  // placa; su número sigue a la tasa de fotones de cada lámpara
  function dibujarFotones(g) {
    const PHI_REF = 2.5e15;
    g.lamparas.forEach((gl, k) => {
      const l = lampDe(gl.id), a = gl.p, L = Math.hypot(a[0], a[1]), n = Math.max(2, Math.min(14, Math.round(6 * tasaFotones(l) / PHI_REF)));
      const r0 = 18 / tz.vista.escala, recorrido = c => c * C_LUZ * 1, u = [-a[0] / L, -a[1] / L];
      for (let j = 0; j < n; j++) {
        // Instante de salida de cada paquete: uno cada L/(c·n), con un desfase fijo por paquete
        const periodo = L / C_LUZ, fase = ((j + 0.37 * ((j * 7 + k * 3) % 5) / 5) / n) * periodo;
        const viaje = t - fase; if (viaje < 0) continue;
        const s = r0 + ((recorrido(viaje) % L) + L) % L * (L - r0 - 6 / tz.vista.escala) / L;
        tz.modernaFoton([a[0] + u[0] * s, a[1] + u[1] * s], u, l.lambda, { opacidad: 0.95 });
      }
    });
  }

  // Electrones en vuelo en el instante t
  function dibujarElectrones(g) {
    const tb = tuboDe(), es = muestra(), vmax = Math.sqrt(2 * Math.max(...ESC.lamparas.map(kMaxL), 1e-30) / 9.1093837015e-31 + 2 * Math.max(0, ESC.V) * E_CARGA / 9.1093837015e-31);
    const kv = 26 / (vmax || 1), v = tz.vista;
    for (const e of es) {
      if (e.t > t) break;
      const vu = vueloElectron(e, tb, ESC.V, { pared: g.top }), tau = t - e.t;
      if (tau > vu.T) continue;
      const s = estadoElectron(vu, tau), p = [s.p[0], s.p[1]];
      if (v.X(p[0]) < -10 || v.X(p[0]) > tz.w + 10) continue;
      const vel = ESC.capas.velocidades ? [s.v[0] * kv, -s.v[1] * kv] : null;
      tz.modernaElectron(p, { v: vel });
    }
    void g;
  }

  const etq = (sim, sub, valor, o = {}) => [{ t: sim, f: 'sim', tam: 13, color: o.color }, ...(sub ? [{ t: sub, f: o.subSim ? 'sim' : 'simRecta', tam: 9, dy: 3, color: o.color }] : []), { t: ' = ' + valor, f: 'num', tam: 11, color: 'texto-2' }];
  function dibujarValores(g, tb) {
    const v = tz.vista, I = corriente(tb, ESC.V), [uI, fI] = unidadI(Math.max(corrienteSaturacion(tb), I, 1e-12));
    const [ax, ay] = v.P(g.amperimetro), [vx, vy] = v.P(g.voltimetro), [bx, by] = v.P(g.bateria);
    // Lecturas de los medidores (siempre: son instrumentos)
    tz.modernaEtiqueta([{ t: 'I', f: 'sim', tam: 13, color: 'corriente' }, { t: ' = ' + fmt(I / fI, 4) + ESP + uI, f: 'num', tam: 11.5, color: 'texto-2' }], [[ax + 18, ay + 4, 'left'], [ax, ay - 20, 'center'], [ax, ay + 32, 'center']]);
    tz.modernaEtiqueta([{ t: 'V', f: 'sim', tam: 13, color: 'electrico' }, { t: ' = ' + fmt(ESC.V, 4) + ESP + 'V', f: 'num', tam: 11.5, color: 'texto-2' }], [[vx - 18, vy + 4, 'right'], [vx, vy + 32, 'center'], [vx, vy - 20, 'center']]);
    if (!ESC.capas.valores) return;
    tz.modernaEtiqueta([{ t: 'fuente', f: 'ui', tam: 11, color: 'texto-3' }], [[bx + 22, by + 4, 'left'], [bx, by - 24, 'center']]);
    // Placa: metal y función trabajo, fuera del tubo a la izquierda; colector, a la derecha
    const [tx0, ty0] = v.P([g.tubo[0], g.hP]), [tx1, ty1] = v.P([g.tubo[1], g.hR]), m = ESC.placa.metal, nombre = METALES[m] ? `Placa de ${METALES[m].nombre.toLowerCase()}` : 'Placa metálica';
    tz.modernaEtiqueta([{ t: nombre, f: 'ui', tam: 11.5, color: 'texto-2' }], [[tx0 - 10, ty0 + 4, 'right'], [tx0 - 10, ty0 - 30, 'right']]);
    tz.modernaEtiqueta(etq('W', '', fmt(eV(ESC.placa.W), 3) + ESP + 'eV'), [[tx0 - 10, ty0 + 21, 'right'], [tx0 - 10, ty0 - 13, 'right']]);
    tz.modernaEtiqueta([{ t: ESC.colector.infinito ? 'Colector (plano infinito)' : 'Colector', f: 'ui', tam: 11.5, color: 'texto-2' }], [[tx1 + 10, ty1 + 4, 'left'], [tx1 + 10, ty1 + 40, 'left']]);
    // Lámparas: λ y potencia
    g.lamparas.forEach(gl => {
      const l = lampDe(gl.id), [X, Y] = v.P(gl.p), reg = tz.modernaRegion(l.lambda);
      const s1 = [{ t: 'λ', f: 'sim', tam: 13, color: 'texto-2' }, { t: ' = ' + cantidad(l.lambda * 1e9, 'nm', 4) + (reg ? ' · ' + reg : ''), f: 'num', tam: 11, color: 'texto-2' }];
      const s2 = etq('P', '', conPrefijo(l.P, 'W', 3));
      tz.modernaEtiqueta(s1, [[X + 28, Y - 2, 'left'], [X - 28, Y - 2, 'right'], [X, Y - 30, 'center']]);
      tz.modernaEtiqueta(s2, [[X + 28, Y + 15, 'left'], [X - 28, Y + 15, 'right'], [X, Y + 40, 'center']]);
    });
    // K_max de los electrones, bajo la placa (fuera del tubo)
    const Km = Math.max(...ESC.lamparas.map(kMaxL), 0);
    const segs = Km > 0 ? etq('K', 'máx', fmt(eV(Km), 3) + ESP + 'eV', { color: 'movimiento' }) : [{ t: 'sin emisión: hf < W', f: 'ui', tam: 11, color: 'texto-3' }];
    tz.modernaEtiqueta(segs, [[tx0 - 10, ty0 + 38, 'right'], [tx0 - 10, ty0 + 4, 'right']]);
    // Representación de la muestra, bajo el tubo
    if (ESC.capas.electrones && Km > 0) {
      const [tx, ty] = v.P([(g.tubo[0] + g.tubo[1]) / 2, g.tubo[2]]);
      tz.modernaEtiqueta([{ t: `cada electrón dibujado representa ${miles(ESC.porPunto)}`, f: 'ui', tam: 11, color: 'texto-3' }], [[tx, ty + 16, 'center'], [tx, ty - 8, 'center']]);
    }
  }

  function dibujarSeleccion(g) {
    const v = tz.vista;
    const caja = c => { if (c) tz.seleccionCaja(c.x, c.y, c.w, c.h); };
    if (sel === 'placa') caja(cajaDe('placa', g));
    else if (sel === 'colector') caja(cajaDe('colector', g));
    else if (sel === 'fuente') caja(cajaDe('fuente', g));
    else if (sel === 'amperimetro' || sel === 'voltimetro') { const [x, y] = v.P(g[sel]); tz.seleccionCirculo(x, y, 18); }
    else { const gl = g.lamparas.find(q => q.id === sel); if (gl) { const [x, y] = v.P(gl.p); tz.seleccionCirculo(x, y, 20); } }
  }
  // Caja de pantalla de cada objeto (selección y clic)
  function cajaDe(id, g = geometria()) {
    const v = tz.vista;
    if (id === 'placa') { const x = v.X(0), y0 = v.Y(g.hP), y1 = v.Y(-g.hP); return { x: x - 7, y: y0, w: 7, h: y1 - y0 }; }
    if (id === 'colector') { const x = v.X(g.d), y0 = v.Y(g.hR), y1 = v.Y(-g.hR); return { x, y: y0, w: 5, h: y1 - y0 }; }
    if (id === 'fuente') { const [x, y] = v.P(g.bateria); return { x: x - 14, y: y - 10, w: 28, h: 20 }; }
    return null;
  }

  // ---------------------------------------------------------------------
  // Selección en el lienzo
  // ---------------------------------------------------------------------
  function objetoEn(X, Y) {
    const g = geometria(), v = tz.vista;
    for (const gl of g.lamparas) { const [x, y] = v.P(gl.p); if (Math.hypot(X - x, Y - y) < 18) return gl.id; }
    for (const id of ['amperimetro', 'voltimetro']) { const [x, y] = v.P(g[id]); if (Math.hypot(X - x, Y - y) < 15) return id; }
    for (const id of ['placa', 'colector', 'fuente']) { const c = cajaDe(id, g); if (X > c.x - 6 && X < c.x + c.w + 6 && Y > c.y - 4 && Y < c.y + c.h + 4) return id; }
    const [x0, y0] = v.P([g.tubo[0], g.tubo[3]]), [x1, y1] = v.P([g.tubo[1], g.tubo[2]]);
    if (X > x0 && X < x1 && Y > y0 && Y < y1) return 'escena-tubo';
    return null;
  }

  // ---------------------------------------------------------------------
  // Inspector, árbol, lecturas y variables
  // ---------------------------------------------------------------------
  const fila = (etqt, control, ayuda = '') => `<div class="fila"${ayuda ? ` data-ayuda="${ayuda}"` : ''}><span class="etq">${etqt}</span>${control}</div>`;
  const segmentado = (id, ops, actual) => `<div class="segmentado texto" id="${id}">${ops.map(([v, txt, ay]) => `<button data-v="${v}" aria-pressed="${String(v) === String(actual)}"${ay ? ` data-ayuda="${ay}"` : ''}>${txt}</button>`).join('')}</div>`;
  const leer = ruta => ruta.split('.').reduce((o, k) => (o == null ? o : o[k]), ESC);
  function escribir(ruta, val) { const ks = ruta.split('.'), u = ks.pop(), o = ks.reduce((a, k) => a[k], ESC); o[u] = val; }
  const ligadaA = ruta => Object.entries(ESC.variables).find(([, d]) => d.liga.includes(ruta));
  function campo(etqt, ruta, dim, u, ayuda = '') {
    const lig = ligadaA(ruta);
    if (lig) {
      const [nv, d] = lig;
      return fila(etqt, `<div class="campo es-variable" data-ayuda="Ligado a la variable ${d.sim}|Bound to variable"><span class="chip-var">${simHTML(d.sim, d.sub)}</span><span class="valor-var" data-var="${nv}"></span><span class="u">${d.u}</span></div>`, ayuda);
    }
    const val = leer(ruta);
    return fila(etqt, `<div class="campo"><input data-ruta="${ruta}" data-dim="${dim}" data-u="${u}" value="${val == null ? '' : numCampo(val / (FAC[u] ?? 1))}"><span class="u">${u}</span></div>`, ayuda);
  }
  // Frecuencia de una lámpara en THz: escribirla cambia λ = c/f
  function campoFrecuencia(i) {
    const l = ESC.lamparas[i], v = numCampo(frecuencia(l.lambda) / 1e12);
    if (ligadaA(`lamparas.${i}.lambda`)) return fila('f', `<div class="campo"><input readonly value="${v}"><span class="u">THz</span></div>`, 'Frecuencia c/λ; la longitud de onda está ligada a una variable|Frequency');
    return fila('f', `<div class="campo"><input data-frecuencia="${i}" value="${v}"><span class="u">THz</span></div>`, 'Frecuencia: escribirla cambia la longitud de onda λ = c/f|Frequency');
  }
  const boton = (id, ico, txt, ayuda) => `<button class="btn btn-secundario btn-compacto" id="${id}" data-ayuda="${ayuda}"><svg class="ico"><use href="#${ico}"/></svg>${txt}</button>`;
  const ICONOS = { escena: 'i-escena', placa: 'o-placa-metal', colector: 'o-colector', fuente: 'o-bateria', amperimetro: 'n-amperimetro', voltimetro: 'n-voltimetro' };
  const NOMBRES_OBJ = { escena: 'Fototubo', placa: 'Placa metálica', colector: 'Colector', fuente: 'Fuente de voltaje', amperimetro: 'Amperímetro', voltimetro: 'Voltímetro' };

  function inspector() {
    const props = $('#propiedades'); let h = '', titulo = 'Propiedades', ico = ICONOS[sel] || 'o-lampara', nombre = NOMBRES_OBJ[sel] || '';
    const l = lampDe(sel);
    if (sel === 'escena') {
      titulo = 'Simulación';
      h = campo('Duración', 'duracion', 'tiempo', 'ns', 'Tiempo que dura la línea de tiempo desde que se enciende la luz|Duration')
        + campo('Por punto', 'porPunto', 'adimensional', '', 'Electrones reales que representa cada electrón dibujado|Electrons per dot')
        + campo('Semilla', 'semilla', 'adimensional', '', 'Semilla de la muestra aleatoria de electrones: la misma semilla da la misma animación|Random seed');
    } else if (sel === 'placa') {
      const m = ESC.placa.metal;
      h = fila('Metal', `<button class="btn btn-secundario btn-compacto" id="p-metal" aria-haspopup="menu" style="justify-self:start">${METALES[m] ? METALES[m].nombre : 'Función trabajo propia'}<svg class="ico"><use href="#i-chevron-abajo"/></svg></button>`, 'Metal de la placa o una función trabajo propia|Metal')
        + campo('W', 'placa.W', 'energia', 'eV', 'Función trabajo: energía mínima para arrancar un electrón|Work function')
        + campo('η', 'placa.eta', 'adimensional', '%', 'Rendimiento cuántico: fracción de los fotones útiles que arrancan un electrón|Quantum efficiency');
    } else if (sel === 'colector') {
      h = campo('d', 'colector.d', 'longitud', 'cm', 'Distancia de la placa al colector|Gap')
        + (ESC.colector.infinito ? fila('R', '<span class="ayuda-fila" style="margin:0">Plano infinito</span>') : campo('R', 'colector.R', 'longitud', 'cm', 'Radio del colector|Collector radius'))
        + fila('Forma', segmentado('p-colector', [['finito', 'Radio R'], ['infinito', 'Plano infinito']], ESC.colector.infinito ? 'infinito' : 'finito'), 'Colector de radio R o plano infinito|Collector shape');
    } else if (sel === 'fuente') {
      h = campo('V', 'V', 'potencial', 'V', 'Voltaje del colector respecto de la placa|Voltage')
        + fila('Polaridad', segmentado('p-polaridad', [['+', 'Acelera', 'Colector positivo: el campo empuja los electrones hacia él'], ['-', 'Frena', 'Colector negativo: el campo frena los electrones']], ESC.V >= 0 ? '+' : '-'), 'Polaridad de la fuente|Polarity');
    } else if (l) {
      nombre = l.nombre; titulo = 'Lámpara'; ico = 'o-lampara';
      const i = idxLamp(sel);
      h = campo('λ', `lamparas.${i}.lambda`, 'longitud', 'nm', 'Longitud de onda en el vacío|Wavelength')
        + campoFrecuencia(i)
        + campo('P', `lamparas.${i}.P`, 'potencia', 'mW', 'Potencia luminosa que llega a la placa|Light power')
        + `<div class="fila"><span class="etq">Objeto</span><div class="acciones-fila">${boton('p-medir', 'n-espectro', 'Medir V₀', 'Busca el voltaje en que se anula la corriente con esta luz y lo anota|Measure|N')}${ESC.lamparas.length > 1 ? boton('p-quitar', 'i-borrar', 'Quitar', 'Quitar la lámpara|Delete|Supr') : ''}</div></div>`;
    } else if (sel === 'amperimetro' || sel === 'voltimetro') {
      titulo = 'Instrumento';
      h = `<p class="ayuda-fila" style="margin:4px 0">${sel === 'amperimetro' ? 'Mide la corriente que llega al colector (régimen estacionario).' : 'Mide el voltaje del colector respecto de la placa.'}</p>`;
    }
    props.innerHTML = h;
    $('#insp-ico').setAttribute('href', '#' + ico);
    $('#insp-nombre').textContent = nombre;
    $('#props-titulo').textContent = titulo;
    document.querySelectorAll('#propiedades input[data-ruta]').forEach(campoConUnidad);
    document.querySelectorAll('#propiedades input[data-frecuencia]').forEach(ent => conError(ent, () => {
      // THz no es una unidad del analizador: se convierte aquí; Hz, kHz y MHz, con el analizador
      const txt = ent.value.trim().replace(/−/g, '-'), m = /^(.*?)\s*THz$/i.exec(txt);
      const f = m ? evaluar(m[1], { esperada: 'adimensional' }).valor * 1e12
        : /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(txt) ? parseFloat(txt) * 1e12 : evaluar(txt, { esperada: 'frecuencia' }).valor;
      if (!(f > 0)) throw new Error('La frecuencia tiene que ser positiva.');
      const i = +ent.dataset.frecuencia;
      escribir(`lamparas.${i}.lambda`, validar(`lamparas.${i}.lambda`, C_LUZ / f));
      cambio();
    }));
    const on = (id, f) => { const e = $(id); if (e) e.addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) f(b.dataset.v, b); }); };
    on('#p-colector', v => { ESC.colector.infinito = v === 'infinito'; cambio(); titulo2(); });
    on('#p-polaridad', v => { if ((v === '-') !== (ESC.V < 0)) { ESC.V = -ESC.V || (v === '-' ? -0.5 : 0.5); sincronizarVariables(['V']); cambio(); } });
    const bm = $('#p-metal'); if (bm) bm.addEventListener('click', ev => { ev.stopPropagation(); menuMetal(bm); });
    const b1 = $('#p-medir'); if (b1) b1.addEventListener('click', () => medir());
    const b2 = $('#p-quitar'); if (b2) b2.addEventListener('click', quitarSeleccion);
    arbol();
  }
  function menuMetal(boton) {
    let m = $('#menu-metal');
    if (!m) { m = document.createElement('div'); m.className = 'menu'; m.id = 'menu-metal'; m.setAttribute('role', 'menu'); m.style.cssText = 'position:fixed;z-index:40;min-width:220px'; document.body.appendChild(m); document.addEventListener('pointerdown', ev => { if (ev.target instanceof Element && !ev.target.closest('#menu-metal, #p-metal')) m.hidden = true; }); }
    if (!m.hidden && m.dataset.abierto === '1') { m.hidden = true; m.dataset.abierto = '0'; return; }
    const actual = ESC.placa.metal;
    m.innerHTML = Object.entries(METALES).map(([k, x]) => `<div class="menu-item" role="menuitem" data-v="${k}"${k === actual ? ' aria-current="true"' : ''}>${x.nombre} (${x.simbolo})<span class="atajo">W = ${fmt(x.W, 3)} eV</span></div>`).join('')
      + `<div class="menu-sep"></div><div class="menu-item" role="menuitem" data-v="propio"${actual === 'propio' ? ' aria-current="true"' : ''}>Función trabajo propia</div>`;
    m.onclick = ev => {
      const it = ev.target.closest('.menu-item'); if (!it) return; m.hidden = true; m.dataset.abierto = '0';
      const k = it.dataset.v;
      ESC.placa.metal = k; if (METALES[k]) ESC.placa.W = METALES[k].W * EV;
      limpiarVariables(); cambio(); avisar(METALES[k] ? `Placa de ${METALES[k].nombre.toLowerCase()}: W = ${fmt(METALES[k].W, 3)} eV` : 'Función trabajo propia');
    };
    const r = boton.getBoundingClientRect(); m.style.left = r.left + 'px'; m.style.top = (r.bottom + 4) + 'px'; m.hidden = false; m.dataset.abierto = '1';
  }

  // Validación de cada ruta (en SI)
  function validar(ruta, x) {
    const k = ruta.split('.').pop();
    if (k === 'lambda' && !(x >= 100e-9 && x <= 2000e-9)) throw new Error('La longitud de onda va de 100 nm a 2000 nm.');
    if (k === 'P' && !(x > 0 && x <= 1)) throw new Error('La potencia va de 0 a 1 W.');
    if (k === 'W' && !(x >= 0.5 * EV && x <= 10 * EV)) throw new Error('La función trabajo va de 0.5 eV a 10 eV.');
    if (k === 'eta' && !(x > 0 && x <= 1)) throw new Error('El rendimiento cuántico va de 0 % a 100 %.');
    if (k === 'd' && !(x >= 1e-3 && x <= 0.5)) throw new Error('La distancia va de 1 mm a 50 cm.');
    if (k === 'R' && !(x >= 5e-4 && x <= 1)) throw new Error('El radio va de 0.5 mm a 1 m.');
    if (k === 'V' && !(x >= -100 && x <= 100)) throw new Error('El voltaje va de −100 V a 100 V.');
    if (k === 'duracion' && !(x >= 10e-9 && x <= 10e-6)) throw new Error('La duración va de 10 ns a 10 µs.');
    if (k === 'porPunto') { if (!(x >= 1 && x <= 1e12)) throw new Error('Cada punto representa de 1 a 10¹² electrones.'); return Math.round(x); }
    if (k === 'semilla') { if (!(x >= 1 && x <= 1e9)) throw new Error('La semilla es un entero de 1 a 10⁹.'); return Math.round(x); }
    return x;
  }
  // Campo con mensaje de error bajo la fila: aplicar() lanza si el valor no sirve
  function conError(ent, aplicar) {
    const caja = ent.closest('.campo'), f = ent.closest('.fila');
    const mostrarError = msj => {
      caja.classList.toggle('es-error', !!msj);
      let p = f.querySelector('.mensaje-error');
      if (msj && !p) { p = document.createElement('p'); p.className = 'mensaje-error'; f.appendChild(p); }
      if (p) { if (msj) p.textContent = msj; else p.remove(); }
    };
    ent.addEventListener('change', () => { try { aplicar(); mostrarError(null); } catch (e) { mostrarError(e.message); } });
    ent.addEventListener('keydown', ev => { if (ev.key === 'Escape') { mostrarError(null); ent.blur(); inspector(); } });
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
        let txt = ent.value.trim().replace(/−/g, '-');
        if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(txt) && u) txt = `${txt} ${u}`;
        const r = evaluar(txt, { esperada: dim, unidadPorDefecto: u || undefined });
        const ruta = ent.dataset.ruta, x = validar(ruta, r.valor);
        escribir(ruta, x);
        if (ruta === 'placa.W') ESC.placa.metal = Object.keys(METALES).find(k => Math.abs(METALES[k].W * EV - x) < 1e-6 * EV) || 'propio';
        mostrarError(null); cambio();
      } catch (e) { mostrarError(e.message); }
    });
    ent.addEventListener('keydown', ev => { if (ev.key === 'Escape') { mostrarError(null); ent.blur(); inspector(); } });
  }

  function arbol() {
    const tb = tuboDe(), I = corriente(tb, ESC.V), [uI, fI] = unidadI(Math.max(I, corrienteSaturacion(tb), 1e-12));
    const nodo = (s, ico, nombre, dato) => `<div class="nodo" data-sel="${s}" aria-selected="${sel === s}"><svg class="ico"><use href="#${ico}"/></svg><span class="nombre">${nombre}</span><span class="dato">${dato}</span></div>`;
    let h = nodo('escena', 'i-escena', 'Fototubo', `d = ${cantidad(ESC.colector.d * 100, 'cm', 3)}`);
    for (const l of ESC.lamparas) h += nodo(l.id, 'o-lampara', l.nombre, cantidad(l.lambda * 1e9, 'nm', 4));
    h += nodo('placa', 'o-placa-metal', 'Placa metálica', METALES[ESC.placa.metal] ? METALES[ESC.placa.metal].simbolo : `${fmt(eV(ESC.placa.W), 3)} eV`);
    h += nodo('colector', 'o-colector', 'Colector', ESC.colector.infinito ? 'infinito' : `R = ${cantidad(ESC.colector.R * 100, 'cm', 3)}`);
    h += nodo('fuente', 'o-bateria', 'Fuente de voltaje', cantidad(ESC.V, 'V', 3));
    h += nodo('amperimetro', 'n-amperimetro', 'Amperímetro', cantidad(I / fI, uI, 3));
    h += nodo('voltimetro', 'n-voltimetro', 'Voltímetro', cantidad(ESC.V, 'V', 3));
    $('#arbol').innerHTML = h;
    $('#arbol').querySelectorAll('.nodo[data-sel]').forEach(n => n.addEventListener('click', () => seleccionar(n.dataset.sel)));
  }
  function seleccionar(s) { if (s === 'escena-tubo') s = 'escena'; if (s === sel) return; sel = s; inspector(); todo(); }

  const lectura = ([a, b, val, u, ayuda]) => `<span class="sim"${ayuda ? ` data-ayuda="${ayuda}"` : ''}>${a}${b ? `<sub class="r">${b}</sub>` : ''}</span><span class="v">${val}</span><span class="u">${u}</span>`;
  function lecturas() {
    document.querySelectorAll('[data-var]').forEach(e => { const d = ESC.variables[e.dataset.var]; if (d) e.textContent = fmtVar(d); });
    $('#reloj').innerHTML = `<span class="sim">t</span>${fmt(t / NS, 4).padStart(6, ' ')}<span class="u">ns</span>`;
    $('#b-play').innerHTML = `<svg class="ico"><use href="#i-${jugando ? 'pausar' : 'reproducir'}"/></svg>`;
    $('#b-play').dataset.ayuda = jugando ? 'Pausar|Pause|Espacio' : 'Reproducir|Play|Espacio';
    const tb = tuboDe(), I = corriente(tb, ESC.V), Is = corrienteSaturacion(tb), [uI, fI] = unidadI(Math.max(I, Is, 1e-12)), f = [];
    const LI = (a, b, x, ay) => [a, b, fmt(x / fI, 4), uI, ay];
    const l = lampDe(sel);
    let estado = '';
    if (l) {
      const fr = frecuencia(l.lambda), Km = kMaxL(l);
      f.push(['f', '', fmt(fr, 4), 'Hz', 'Frecuencia c/λ|Frequency'], ['E', 'fotón', fmt(eV(energiaFoton(fr)), 4), 'eV', 'Energía de cada fotón hf|Photon energy'],
        ['Φ', '', fmt(tasaFotones(l), 4), 's⁻¹', 'Fotones por segundo P/(hf)|Photon rate'], ['K', 'máx', fmt(eV(Km), 4), 'eV', 'Energía cinética máxima hf − W|Maximum kinetic energy'],
        ['V', '0', fmt(potencialFrenado(fr, ESC.placa.W), 4), 'V', 'Potencial de frenado K_max/e|Stopping potential']);
      estado = Km > 0 ? `${tz.modernaRegion(l.lambda) || 'Visible'} · arranca electrones` : 'Por debajo del umbral: no arranca electrones';
    } else if (sel === 'placa') {
      const W = ESC.placa.W;
      f.push(['W', '', fmt(eV(W), 4), 'eV', 'Función trabajo|Work function'], ['W', '', fmtE(W, 4), 'J'], ['f', '0', fmt(frecuenciaUmbral(W), 4), 'Hz', 'Frecuencia umbral W/h|Threshold frequency'],
        ['λ', '0', fmt(longitudUmbral(W) * 1e9, 4), 'nm', 'Longitud de onda umbral hc/W|Threshold wavelength'], ['η', '', fmt(ESC.placa.eta * 100, 3), '%', 'Rendimiento cuántico|Quantum efficiency']);
      estado = METALES[ESC.placa.metal] ? METALES[ESC.placa.metal].nombre : 'Función trabajo propia';
    } else if (sel === 'colector' || sel === 'fuente' || sel === 'amperimetro' || sel === 'voltimetro') {
      const v0 = V0max();
      f.push(['V', '', fmt(ESC.V, 4), 'V', 'Voltaje del colector respecto de la placa|Voltage'], LI('I', '', I, 'Corriente en el colector|Current'), LI('I', 'sat', Is, 'Corriente de saturación: todos los electrones emitidos|Saturation current'),
        ['I/I', 'sat', Is > 0 ? fmt(I / Is, 4) : '—', '', 'Fracción de los electrones que llega|Collected fraction'], ['V', '0', fmt(v0, 4), 'V', 'Potencial de frenado (el corte está en −V₀)|Stopping potential']);
      estado = !(Is > 0) ? 'Sin emisión' : I <= 0 ? 'Corriente cortada: V ≤ −V₀' : I >= Is * (1 - 1e-9) ? 'Saturación: llegan todos' : ESC.V < 0 ? 'Frenando' : 'Acelerando';
    } else {
      const v0 = V0max(), es = muestra(), tb2 = tb;
      let vuelo = 0; for (const e of es) { if (e.t > t) break; const vu = vueloElectron(e, tb2, ESC.V); if (t - e.t <= vu.T) vuelo++; }
      f.push(LI('I', '', I, 'Corriente en el colector|Current'), ['V', '', fmt(ESC.V, 4), 'V'], ['V', '0', fmt(v0, 4), 'V', 'Potencial de frenado|Stopping potential'], ['N', 'vuelo', String(vuelo), '', 'Electrones dibujados en vuelo|Electrons in flight']);
      estado = `${ESC.lamparas.length} ${ESC.lamparas.length > 1 ? 'lámparas' : 'lámpara'} · ${METALES[ESC.placa.metal]?.nombre || 'placa propia'}`;
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
    for (const d of Object.values(ESC.variables)) for (const r of d.liga) { try { if (leer(r) !== undefined) escribir(r, d.val * d.factor + (d.offset || 0)); } catch { /* ruta que ya no existe */ } }
  }
  function sincronizarVariables(rutas) {
    for (const d of Object.values(ESC.variables)) for (const r of rutas) if (d.liga.includes(r)) {
      d.val = Math.max(d.min, Math.min(d.max, (leer(r) - (d.offset || 0)) / d.factor));
      for (const q of d.liga) escribir(q, d.val * d.factor + (d.offset || 0));
    }
    construirVariables();
  }
  // Variables cuyas rutas ya no existen se sueltan; al quitar la lámpara i, las rutas se corren
  function limpiarVariables(quitada = null) {
    for (const [k, d] of Object.entries(ESC.variables)) {
      d.liga = d.liga.map(r => {
        const m = /^lamparas\.(\d+)\.(.+)$/.exec(r);
        if (!m || quitada == null) return r;
        if (+m[1] === quitada) return null;
        return +m[1] > quitada ? `lamparas.${+m[1] - 1}.${m[2]}` : r;
      }).filter(r => r && typeof leer(r) === 'number');
      // Una función trabajo de tabla no se liga a una variable
      if (ESC.placa.metal !== 'propio') d.liga = d.liga.filter(r => r !== 'placa.W');
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
  const F14 = 1e14;
  // Lámpara de referencia de las gráficas: la seleccionada (con emisión, si se pide) o la de mayor K_max
  function lampRef(conEmision = false) { const l = lampDe(sel); return l && (!conEmision || kMaxL(l) > 0) ? l : ESC.lamparas.reduce((a, b) => (kMaxL(b) > kMaxL(a) ? b : a), ESC.lamparas[0]); }
  function ajusteMediciones() {
    const ok = ESC.mediciones.filter(m => m.V0 > 0);
    return ok.length >= 2 ? medirPlanck(ok) : null;
  }
  function grafica1(n, tipo) {
    const cv = $(`#g${n}`), T = $(`#t${n}`), Lc = $(`#l${n}`), tb = tuboDe(), W = ESC.placa.W;
    if (!ESC.lamparas.length) { vacia(n, 'Sin lámparas'); return; }
    if (tipo === 'iv') {
      const c = curva(), Is = corrienteSaturacion(tb), I = corriente(tb, ESC.V), [uI, fI] = unidadI(Math.max(Is, 1e-12));
      const pts = c.puntos.map(([V, i]) => [V, i / fI]), ymaxI = Is > 0 ? Is / fI * 1.1 : 1;
      const ev = ESC.lamparas.map(l => potencialFrenado(frecuencia(l.lambda), W)).filter(x => x > 0).map(x => ({ x: -x }));
      grafica(cv, { x: { min: c.Vmin, max: c.Vmax }, y: { min: 0, max: ymaxI }, series: [{ tramos: [pts], familia: 'corriente' }, { tramos: [[[c.Vmin, Is / fI], [c.Vmax, Is / fI]]], familia: 'texto-3', auxiliar: true }], cursor: ESC.V, puntoCursor: [ESC.V, I / fI], eventos: ev });
      T.innerHTML = `${simHTML('I')} (${uI}) contra ${simHTML('V')} (V)`;
      Lc.textContent = Is > 0 ? cantidad(I / fI, uI, 4) : 'sin emisión';
      return;
    }
    if (tipo === 'kf' || tipo === 'v0f') {
      const lr = lampRef(), f0 = frecuenciaUmbral(W), fs = ESC.lamparas.map(l => frecuencia(l.lambda)), fm = ESC.mediciones.map(m => m.f);
      const xmax = Math.max(1.25 * Math.max(...fs, ...fm, f0), 1.6 * f0) / F14;
      const esV = tipo === 'v0f', y = x => (esV ? (H * x * F14 - W) / E_CARGA : eV(H * x * F14 - W));
      const ymin = Math.min(y(0) * 1.08, -0.2), ymax = Math.max(y(xmax) * 1.12, 0.5);
      const real = [[f0 / F14, 0], [xmax, y(xmax)]], ext = [[0, y(0)], [f0 / F14, 0]];
      const ajuste = ajusteMediciones();
      const series = [{ tramos: [real], familia: esV ? 'electrico' : 'movimiento' }, { tramos: [ext], familia: 'texto-3', auxiliar: true }];
      if (esV && ajuste) series.push({ tramos: [[[0, ajuste.ordenada], [xmax, ajuste.ordenada + ajuste.pendiente * xmax * F14]]], familia: 'electrico', patron: 'discontinuo' });
      const evs = [{ x: f0 / F14 }, ...ESC.mediciones.filter(m => m.V0 > 0).map(m => ({ x: m.f / F14, y: esV ? m.V0 : m.V0 }))];
      const fl = frecuencia(lr.lambda), yl = esV ? Math.max(0, (H * fl - W) / E_CARGA) : eV(kMaxL(lr));
      grafica(cv, { x: { min: 0, max: xmax }, y: { min: ymin, max: ymax }, series, cursor: fl / F14, puntoCursor: [fl / F14, yl], eventos: evs });
      if (esV) {
        T.innerHTML = `${simHTML('V', '0')} (V) contra ${simHTML('f')} (10¹⁴ Hz)`;
        Lc.textContent = ajuste ? `h = ${fmtE(ajuste.h, 4)} J·s` : 'faltan mediciones';
      } else {
        T.innerHTML = `${simHTML('K', 'máx')} (eV) contra ${simHTML('f')} (10¹⁴ Hz)`;
        Lc.textContent = cantidad(yl, 'eV', 4);
      }
      return;
    }
    if (tipo === 'energias') {
      const lr = lampRef(true), Km = kMaxL(lr);
      if (!(Km > 0)) { vacia(n, 'La luz no arranca electrones: hf < W'); return; }
      const geo = { d: ESC.colector.d, R: ESC.colector.infinito ? Infinity : ESC.colector.R };
      const pts = muestras(0, eV(Km), 120, k => fraccionPorEnergia(Math.max(1e-6, k) * EV, ESC.V, geo));
      const ev = ESC.V < 0 ? [{ x: -ESC.V }] : [];
      grafica(cv, { x: { min: 0, max: eV(Km) * 1.04 }, y: { min: 0, max: 1.08 }, series: [{ tramos: [pts], familia: 'movimiento' }, { tramos: [[[0, 1], [eV(Km), 1]]], familia: 'texto-3', auxiliar: true }], eventos: ev });
      T.innerHTML = `Fracción recogida contra ${simHTML('K')} (eV)`;
      const Is = corrienteSaturacion(tb);
      Lc.textContent = Is > 0 ? cantidad(100 * corriente(tb, ESC.V) / Is, '%', 3) : '';
      return;
    }
    if (tipo === 'intensidad') {
      const lr = lampRef(), i = ESC.lamparas.indexOf(lr), Pmax = Math.max(2 * lr.P, 1e-3);
      const conP = P => { const q = JSON.parse(JSON.stringify(tb)); q.lamparas[i].P = P; return q; };
      const Imax = corrienteSaturacion(conP(Pmax)), [uI, fI] = unidadI(Math.max(Imax, 1e-12));
      const sat = [[0, corrienteSaturacion(conP(0)) / fI], [Pmax * 1e3, Imax / fI]];
      const act = [[0, corriente(conP(0), ESC.V) / fI], [Pmax * 1e3, corriente(conP(Pmax), ESC.V) / fI]];
      grafica(cv, { x: { min: 0, max: Pmax * 1e3 }, y: { min: 0, max: Imax > 0 ? Imax / fI * 1.1 : 1 }, series: [{ tramos: [act], familia: 'corriente' }, { tramos: [sat], familia: 'corriente', patron: 'discontinuo' }], cursor: lr.P * 1e3, puntoCursor: [lr.P * 1e3, corriente(tb, ESC.V) / fI] });
      T.innerHTML = `<span class="leyenda"><span style="color:var(--f-corriente)"><i></i>${simHTML('I')}</span><span style="color:var(--f-corriente)"><i class="discontinua"></i>${simHTML('I', 'sat')}</span></span> (${uI}) contra ${simHTML('P')} (mW)`;
      Lc.textContent = Imax > 0 ? cantidad(corriente(tb, ESC.V) / fI, uI, 4) : 'sin emisión';
      return;
    }
    vacia(n, '');
  }

  // ---------------------------------------------------------------------
  // Tablas y exportación
  // ---------------------------------------------------------------------
  function tablas() {
    const aj = ajusteMediciones();
    $('#t-mediciones').innerHTML = '<tr><th>Medición</th><th>λ (nm)</th><th>f (10¹⁴ Hz)</th><th>V₀ (V)</th><th>K<sub>máx</sub> (eV)</th></tr>'
      + (ESC.mediciones.length ? ESC.mediciones.map((m, i) => `<tr><td class="texto">${i + 1}</td><td>${fmt(m.lambda * 1e9, 5)}</td><td>${fmt(m.f / F14, 5)}</td><td>${fmt(m.V0, 5)}</td><td>${fmt(m.V0, 5)}</td></tr>`).join('')
        + (aj ? `<tr class="actual"><td class="texto">Ajuste de ${aj.n} puntos</td><td colspan="2" class="texto">h = ${fmtE(aj.h, 5)} J·s</td><td colspan="2" class="texto">W = ${fmt(eV(aj.W), 4)} eV · f₀ = ${fmt(aj.f0 / F14, 4)} × 10¹⁴ Hz</td></tr>` : '')
        : '<tr><td class="texto" colspan="5">Sin mediciones: selecciona una lámpara y pulsa «Medir V₀» (N).</td></tr>');
    const c = curva(), Is = corrienteSaturacion(tuboDe()), [uI, fI] = unidadI(Math.max(Is, 1e-12)), paso = Math.max(1, Math.round(c.puntos.length / 40));
    let filas = `<tr><th>V (V)</th><th>I (${uI})</th><th>I/I<sub>sat</sub></th></tr>`;
    let cerca = 0; c.puntos.forEach(([V], i) => { if (Math.abs(V - ESC.V) < Math.abs(c.puntos[cerca][0] - ESC.V)) cerca = i; });
    c.puntos.forEach(([V, I], i) => { if (i % paso && i !== cerca) return; filas += `<tr class="${i === cerca ? 'actual' : ''}"><td>${fmt(V, 4)}</td><td>${fmt(I / fI, 4)}</td><td>${Is > 0 ? fmt(I / Is, 4) : '—'}</td></tr>`; });
    $('#t-datos').innerHTML = filas;
  }
  function exportarCSV() {
    if (!$('#p-mediciones').hidden) { exportarMediciones(); return; }
    const c = curva(), tb = tuboDe(), Is = corrienteSaturacion(tb);
    const filas = c.puntos.map(([V, I]) => [V, I, Is > 0 ? I / Is : '']);
    descargarTexto(`${nombreArchivo(ESC.titulo)}-curva-iv.csv`, aCSV(['V (V)', 'I (A)', 'I/Isat'], filas))
      .then(r => { if (r) avisarLienzo(area, `Datos exportados: ${filas.length} filas`); }, e => avisar(`No se pudo exportar: ${e}`, false));
  }
  function exportarMediciones() {
    const filas = ESC.mediciones.map(m => [m.lambda * 1e9, m.f, m.V0, m.V0 * E_CARGA]);
    descargarTexto(`${nombreArchivo(ESC.titulo)}-mediciones.csv`, aCSV(['lambda (nm)', 'f (Hz)', 'V0 (V)', 'Kmax (J)'], filas))
      .then(r => { if (r) avisarLienzo(area, `Mediciones exportadas: ${filas.length}`); });
  }
  function exportarElectrones() {
    const tb = tuboDe(), filas = muestra().map(e => { const vu = vueloElectron(e, tb, ESC.V); return [e.t, e.lampara + 1, e.K / EV, Math.asin(Math.sqrt(e.mu)) * 180 / Math.PI, e.phi * 180 / Math.PI, vu.destino, vu.T]; });
    descargarTexto(`${nombreArchivo(ESC.titulo)}-electrones.csv`, aCSV(['t emision (s)', 'lampara', 'K (eV)', 'theta (grados)', 'phi (grados)', 'destino', 'tiempo de vuelo (s)'], filas))
      .then(r => { if (r) avisarLienzo(area, `Electrones exportados: ${filas.length}`); });
  }
  function exportarPNG() { descargarLienzo(lienzo, `${nombreArchivo(ESC.titulo)}-t${fmt(t / NS, 3)}ns.png`).then(r => { if (r) avisarLienzo(area, 'Imagen del lienzo exportada'); }); }
  $('#b-exportar').addEventListener('click', exportarCSV);

  // ---------------------------------------------------------------------
  // Ciclo
  // ---------------------------------------------------------------------
  const lt = new LineaTiempo($('#tl'), { duracion: 150, eventos: [], alCambiar: x => { t = x * NS; jugando = false; todo(); } });
  function todo() {
    dibujar(); lecturas(); lt.poner(t / NS); graficas();
    if (!$('#p-mediciones').hidden || !$('#p-tabla').hidden) tablas();
  }
  function recalcular() {
    lt.duracion = ESC.duracion / NS; lt.simulado = lt.duracion;
    t = Math.min(t, ESC.duracion);
    if (!vistaTocada) encuadrar();
    todo(); arbol();
    if (autoguardar) autoguardado.guardar('moderna', escenaActual());
  }
  function cambio() { aplicarVariables(); recalcular(); registrar(); inspector(); }
  function titulo2() {
    $('#escena-nombre').textContent = ESC.titulo;
    const chip = $('#escena-chip');
    chip.textContent = ESC.tipo === 'MEXT' ? `MEXT ${ESC.anio || ''}`.trim() : ESC.tipo || 'Propio';
    chip.className = 'chip' + (ESC.tipo === 'MEXT' ? ' lleno' : '');
    document.title = `Volta · Efecto fotoeléctrico · ${ESC.titulo}`;
    document.querySelectorAll('.capa-btn').forEach(b => b.setAttribute('aria-pressed', String(!!ESC.capas[b.dataset.capa])));
    $('#b-modo').setAttribute('aria-pressed', String(!ESC.colector.infinito));
    $('#b-modo').textContent = ESC.colector.infinito ? 'Colector infinito' : 'Colector finito';
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
  function nuevaLampara() {
    if (ESC.lamparas.length >= 4) { avisar('Caben hasta cuatro lámparas sobre la placa', false); return; }
    const usadas = new Set(ESC.lamparas.map(l => Math.round(l.lambda * 1e9))), cand = [365, 405, 436, 546, 577, 254].find(x => !usadas.has(x)) || 500;
    let id; do { id = 'l' + (++contador); } while (lampDe(id));
    const l = { id, nombre: texto(`Lámpara ${ESC.lamparas.length + 1}`, 'Lámpara', 40), lambda: cand * 1e-9, P: 1e-3 };
    ESC.lamparas.push(l); sel = id; cambio(); avisar(`${l.nombre} encendida: ${cand} nm`);
  }
  function quitarSeleccion() {
    const i = idxLamp(sel);
    if (i < 0) return;
    if (ESC.lamparas.length < 2) { avisar('El fototubo necesita al menos una lámpara', false); return; }
    const nombre = ESC.lamparas[i].nombre;
    ESC.lamparas.splice(i, 1); limpiarVariables(i); sel = 'escena'; cambio(); avisar(`Se quita ${nombre}`);
  }
  // Mide V₀ con la lámpara seleccionada (o la de mayor frecuencia) y lo anota
  function medir() {
    const l = lampDe(sel) || lampRef();
    if (!l) return;
    const m = medicion(ESC, l.lambda);
    if (!(m.V0 > 0)) { avisar(`Con ${cantidad(l.lambda * 1e9, 'nm', 4)} no hay corriente a ningún voltaje: no hay V₀`, false); return; }
    ESC.mediciones.push(m); ESC.mediciones.sort((a, b) => a.f - b.f);
    recalcular(); registrar();
    avisar(`V₀ = ${cantidad(m.V0, 'V', 4)} con ${cantidad(l.lambda * 1e9, 'nm', 4)} (medición ${ESC.mediciones.length})`);
  }
  function borrarMediciones() { if (!ESC.mediciones.length) return; ESC.mediciones = []; recalcular(); registrar(); avisar('Mediciones borradas'); }

  // ---------------------------------------------------------------------
  // Escena: guardar, abrir, autoguardado, deshacer
  // ---------------------------------------------------------------------
  const copia = o => JSON.parse(JSON.stringify(o));
  const instantanea = () => { const o = copia(ESC); o.sel = sel; return o; };
  function escenaActual() { return crearEscena({ modulo: 'moderna', espacio: 'fotoelectrico', titulo: ESC.titulo, datos: instantanea() }); }
  const RUTA_OK = /^(V|duracion|porPunto|semilla|placa\.(W|eta)|colector\.(d|R)|lamparas\.[0-3]\.(lambda|P))$/;
  // Valida y acota lo que viene de un archivo antes de usarlo (entrada no confiable)
  function datosSeguros(d = {}) {
    const base = completa(ESCENAS.find(e => e.clave === d.clave) || ESCENAS[0]);
    const pl = d.placa && typeof d.placa === 'object' ? d.placa : {}, co = d.colector && typeof d.colector === 'object' ? d.colector : {};
    const metal = typeof pl.metal === 'string' && (METALES[pl.metal] || pl.metal === 'propio') ? pl.metal : base.placa.metal;
    const placa = { metal, W: METALES[metal] ? METALES[metal].W * EV : numero(pl.W, base.placa.W, 0.5 * EV, 10 * EV), eta: numero(pl.eta, 0.01, 1e-6, 1) };
    const colector = { d: numero(co.d, 0.02, 1e-3, 0.5), R: numero(co.R, 0.02, 5e-4, 1), infinito: co.infinito === true };
    const lamparas = [], ids = new Set();
    for (const o of (Array.isArray(d.lamparas) ? d.lamparas : []).slice(0, 4)) {
      if (!o || typeof o !== 'object') continue;
      let id = texto(o.id, '', 8); if (!/^l\d{1,4}$/.test(id) || ids.has(id)) { do { id = 'l' + (++contador); } while (ids.has(id)); }
      ids.add(id);
      lamparas.push({ id, nombre: texto(o.nombre, `Lámpara ${lamparas.length + 1}`, 40), lambda: numero(o.lambda, 500e-9, 100e-9, 2000e-9), P: numero(o.P, 1e-3, 1e-9, 1) });
    }
    if (!lamparas.length) lamparas.push({ id: 'l1', nombre: 'Lámpara', lambda: 400e-9, P: 1e-3 });
    const variables = {};
    for (const [k, v] of Object.entries(d.variables && typeof d.variables === 'object' ? d.variables : {})) {
      if (!v || !Array.isArray(v.liga) || !/^[A-Za-z]\w{0,7}$/.test(k)) continue;
      const min = numero(v.min, 0, -1e9, 1e9), max = Math.max(min, numero(v.max, 1, -1e9, 1e9));
      const liga = v.liga.filter(r => typeof r === 'string' && RUTA_OK.test(r) && (!r.startsWith('lamparas.') || +r.split('.')[1] < lamparas.length));
      if (!liga.length) continue;
      variables[k] = { sim: texto(v.sim, k, 3), sub: v.sub ? texto(v.sub, '', 6) : undefined, val: numero(v.val, min, min, max), min, max, paso: numero(v.paso, 0.1, 1e-9, 1e9), u: ['nm', 'V', 'mW', 'eV', 'cm', '%', ''].includes(v.u) ? v.u : '', factor: numero(v.factor, 1, -1e15, 1e15) || 1, offset: numero(v.offset, 0, -100, 100), liga };
    }
    const capas = {};
    for (const k of Object.keys(base.capas)) capas[k] = typeof d.capas?.[k] === 'boolean' ? d.capas[k] : !!base.capas[k];
    const GRAF = ['iv', 'kf', 'v0f', 'energias', 'intensidad'];
    const mediciones = (Array.isArray(d.mediciones) ? d.mediciones : []).slice(0, 40).filter(m => m && typeof m === 'object')
      .map(m => ({ lambda: numero(m.lambda, 500e-9, 100e-9, 2000e-9) })).map(m => medicion({ placa, colector, lamparas: [] }, m.lambda));
    const SELS = ['escena', 'placa', 'colector', 'fuente', 'amperimetro', 'voltimetro'];
    return {
      clave: ESCENAS.some(e => e.clave === d.clave) ? d.clave : 'propio', titulo: texto(d.titulo, base.titulo, 80),
      tipo: ['Tutorial', 'Ejemplo', 'MEXT', 'Propio'].includes(d.tipo) ? d.tipo : 'Propio', anio: d.anio ? texto(d.anio, '', 14) : undefined,
      placa, colector, V: numero(d.V, 0, -100, 100), lamparas, mediciones, variables, capas,
      graficas: Array.isArray(d.graficas) && d.graficas.length === 3 && d.graficas.every(g => GRAF.includes(g)) ? d.graficas.slice() : base.graficas.slice(),
      duracion: numero(d.duracion, 150e-9, 10e-9, 10e-6), porPunto: Math.round(numero(d.porPunto, 1e4, 1, 1e12)), semilla: Math.round(numero(d.semilla, 1, 1, 1e9)),
      sel: typeof d.sel === 'string' && (SELS.includes(d.sel) || lamparas.some(l => l.id === d.sel)) ? d.sel : 'escena',
    };
  }
  function restaurar(d) {
    ESC = datosSeguros(d); aplicarVariables();
    if (!(NOMBRES_OBJ[sel] || lampDe(sel))) sel = ESC.sel || 'escena';
    titulo2(); construirVariables(); inspector(); recalcular();
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
    sel = ESC.sel || 'escena'; vistaTocada = false; t = 0; jugando = false;
    titulo2(); construirVariables(); inspector(); recalcular();
    escala0 = tz.vista.escala; zoomTexto();
    if (historial) { historial.reiniciar(sinSel(instantanea())); botonesHistorial(); }
    documentoNuevo();
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
      if (aOtroEspacio(e, 'fotoelectrico')) return;
      sel = 'escena'; t = 0; jugando = false; restaurar(e.datos); vistaTocada = false; encuadrar(); escala0 = tz.vista.escala; zoomTexto(); todo();
      if (historial) { historial.reiniciar(sinSel(instantanea())); botonesHistorial(); }
      avisar(`Escena abierta: ${texto(e.titulo, 'sin título', 60)}`, false);
    }).catch(err => avisar(err.message, false));
  }

  // ---------------------------------------------------------------------
  // Paleta, instrumentos y capas
  // ---------------------------------------------------------------------
  function marcarHerramientas() {
    document.querySelectorAll('.herr').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.herr === sel || (b.dataset.herr === 'lampara' && !!lampDe(sel)))));
  }
  function herramienta(h) {
    if (h === 'lampara') { if (ESC.lamparas.length >= 4) { seleccionar(ESC.lamparas[0].id); avisar('Caben hasta cuatro lámparas sobre la placa', false); } else nuevaLampara(); }
    else if (h === 'medir') medir();
    else seleccionar(h);
    marcarHerramientas();
  }
  document.querySelectorAll('.herr').forEach(b => b.addEventListener('click', () => herramienta(b.dataset.herr)));
  function ponerCapa(k, on) { ESC.capas[k] = on; document.querySelectorAll(`.capa-btn[data-capa="${k}"]`).forEach(b => b.setAttribute('aria-pressed', String(on))); }
  const alternarCapa = k => { ponerCapa(k, !ESC.capas[k]); registrar(); dibujar(); };
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => alternarCapa(b.dataset.capa)));
  function alternarColector() { ESC.colector.infinito = !ESC.colector.infinito; titulo2(); cambio(); avisar(ESC.colector.infinito ? 'Colector plano infinito: la corriente se satura en 0 V' : `Colector de radio ${cantidad(ESC.colector.R * 100, 'cm', 3)}: se satura poco a poco`, false); }
  $('#b-modo').addEventListener('click', alternarColector);
  $('#pest').addEventListener('click', () => setTimeout(todo, 0));

  // ---------------------------------------------------------------------
  // Lienzo: seleccionar, arrastrar el colector, zoom y paneo
  // ---------------------------------------------------------------------
  lienzo.addEventListener('pointerdown', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, v = tz.vista;
    if (ev.button === 1 || ev.button === 2 || espacioPulsado) { paneo = [X, Y, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId); return; }
    const ob = objetoEn(X, Y);
    if (ob && ob !== 'escena-tubo') {
      seleccionar(ob); marcarHerramientas();
      if (ob === 'colector') { arrastre = { tipo: 'colector', movido: false }; lienzo.setPointerCapture(ev.pointerId); }
      return;
    }
    seleccionar('escena'); marcarHerramientas();
    paneo = [X, Y, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId);
  });
  lienzo.addEventListener('pointermove', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, v = tz.vista, w = [v.mx(X), v.my(Y)];
    $('#cx').textContent = cantidad(w[0] * 100, 'cm', 4); $('#cy').textContent = cantidad(w[1] * 100, 'cm', 4);
    if (paneo) { vistaTocada = true; v.ox = paneo[2] + X - paneo[0]; v.oy = paneo[3] + Y - paneo[1]; dibujar(); return; }
    if (arrastre && arrastre.tipo === 'colector') {
      // La distancia placa–colector, con el paso de la cuadrícula (fino con Mayús)
      const paso = Volta.pasoAgradable(90 / v.escala) / (ev.shiftKey ? 100 : 10), dd = Math.max(1e-3, Math.min(0.5, Math.round(w[0] / paso) * paso));
      if (dd !== ESC.colector.d) { ESC.colector.d = dd; sincronizarVariables(['colector.d']); arrastre.movido = true; vistaTocada = true; todo(); }
      return;
    }
    const ob = objetoEn(X, Y);
    lienzo.style.cursor = ob === 'colector' ? 'ew-resize' : ob && ob !== 'escena-tubo' ? 'pointer' : 'default';
    if (ob !== hover) { hover = ob; dibujar(); }
  });
  lienzo.addEventListener('pointerup', () => {
    if (arrastre) { const a = arrastre; arrastre = null; if (a.movido) { cambio(); avisar(`d = ${cantidad(ESC.colector.d * 100, 'cm', 3)}`); } }
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
  // Reproducción: a 1× la línea de tiempo entera dura 10 s
  // ---------------------------------------------------------------------
  function cuadro(ahora) {
    if (jugando) {
      const dt = Math.min(0.05, (ahora - ultimo) / 1000) * velocidad * ESC.duracion / 10;
      t = Math.min(ESC.duracion, t + dt);
      if (t >= ESC.duracion) jugando = false;
      todo();
    }
    ultimo = ahora;
    requestAnimationFrame(cuadro);
  }
  function alternar() { if (t >= ESC.duracion) t = 0; jugando = !jugando; todo(); }
  const irA = nt => { jugando = false; t = Math.max(0, Math.min(ESC.duracion, nt)); todo(); };
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
    ['i-encuadrar', 'Encuadrar todo', 'F', encuadrarTodo],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['o-lampara', 'Añadir una lámpara', 'L', nuevaLampara],
    ['n-espectro', 'Medir V₀ con la lámpara seleccionada', 'N', medir],
    ['i-borrar', 'Borrar las mediciones', '', borrarMediciones],
    ['i-borrar', 'Quitar la lámpara seleccionada', 'Supr', quitarSeleccion],
    ['o-colector', 'Colector finito o plano infinito', 'M', alternarColector],
    ['i-capas', 'Mostrar u ocultar los fotones', '', () => alternarCapa('fotones')],
    ['i-capas', 'Mostrar u ocultar los electrones', 'E', () => alternarCapa('electrones')],
    ['i-capas', 'Mostrar u ocultar las velocidades', 'V', () => alternarCapa('velocidades')],
    ['i-capas', 'Mostrar u ocultar el campo eléctrico', '', () => alternarCapa('campo')],
    ['i-historial', 'Restablecer la escena original', '', () => { if (ESCENAS.some(e => e.clave === ESC.clave)) { abrirEscena1(ESC.clave); avisar('Escena original restablecida', false); } }],
    ['i-deshacer', 'Deshacer', 'Ctrl Z', deshacer],
    ['i-rehacer', 'Rehacer', 'Ctrl Y', rehacer],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar],
    ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
    ['i-exportar', 'Exportar la curva I–V a CSV', '', () => { const c = curva(), Is = corrienteSaturacion(tuboDe()); descargarTexto(`${nombreArchivo(ESC.titulo)}-curva-iv.csv`, aCSV(['V (V)', 'I (A)', 'I/Isat'], c.puntos.map(([V, I]) => [V, I, Is > 0 ? I / Is : '']))).then(r => { if (r) avisarLienzo(area, 'Curva I–V exportada'); }); }],
    ['i-tabla', 'Exportar las mediciones a CSV', '', exportarMediciones],
    ['i-tabla', 'Exportar los electrones de la muestra a CSV', '', exportarElectrones],
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
    else if (ev.key === 'Escape') $('#menu-escenas').hidden = true;
    else if (ev.key === 'Delete' || ev.key === 'Backspace') quitarSeleccion();
    else if (tecla === 'f') encuadrarTodo();
    else if (tecla === 'm') alternarColector();
    else if (tecla === 'n') medir();
    else if (tecla === 'l') nuevaLampara();
    else if (tecla === 'e') alternarCapa('electrones');
    else if (tecla === 'v') alternarCapa('velocidades');
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });

  // ---------------------------------------------------------------------
  // Arranque. Parámetros para capturas: ?escena=planck&t=80&sel=l1&pest=mediciones
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); if (!vistaTocada) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search), limpio = ![...q.keys()].length;
    const pend = escenaPendiente('moderna');
    const previa = (pend && (!pend.espacio || pend.espacio === 'fotoelectrico') ? pend : null) || (limpio ? autoguardado.leer('moderna', { modulo: 'moderna' }) : null);
    tz.ajustar();
    if (q.has('escena') || !previa) { ESC = completa(escenaDe(q.get('escena') || 'sodio')); sel = ESC.sel || 'escena'; }
    else { ESC = datosSeguros(previa.datos); sel = ESC.sel || 'escena'; }
    aplicarVariables();
    if (q.has('sel')) { const s = q.get('sel'); if (NOMBRES_OBJ[s] || lampDe(s)) sel = s; }
    autoguardar = true;
    registrarDocumento({ clave: 'moderna', escena: escenaActual, origen: (!q.has('escena') && previa) || null, abrir, guardar });
    t = q.has('t') ? Math.max(0, Math.min(ESC.duracion, (parseFloat(q.get('t')) || 0) * NS)) : 0;
    titulo2(); construirVariables(); inspector();
    recalcular(); escala0 = tz.vista.escala; zoomTexto();
    const pe = q.get('pest'); if (pe) { const b = document.querySelector(`#pest [aria-controls="p-${pe}"]`); if (b) b.click(); }
    todo();
    historial = new Historial(sinSel(instantanea())); botonesHistorial();
    requestAnimationFrame(a => { ultimo = a; requestAnimationFrame(cuadro); });
  });
})();
