/* ==========================================================================
   Volta · prototipo de Termodinámica — "Laboratorio de gases"
   Escenas del laboratorio (menú de escenas: Tutoriales, Ejemplos y MEXT),
   cada una con su montaje:
   - cilindro: cilindro con émbolo de masa m bajo la atmósfera P0, gas ideal,
     pesa M que se pone y se quita, calentador, paredes conductoras (baño a
     T0) o adiabáticas; el cilindro puede estar inclinado o girar (motor puro
     sistema/motores/gas.js, pruebas/gas.test.js). Es la escena original de
     la pantalla (MEXT 2019 P4) y sus variantes;
   - recipientes: recipientes rígidos conectados por válvulas, paredes o
     émbolos libres, con baños y calentadores (sistema/motores/recipientes.js);
   - abierto: globo aerostático o habitación abierta a la atmósfera;
   - burbuja: burbuja que sube por una columna de líquido.
   Las escenas y sus respuestas del examen están en termodinamica-escenas.js
   (pruebas/termodinamica-mext.test.js).
   Misma estructura que mecanica.js: motor → estado(t) → lienzo → paneles.
   ========================================================================== */
import { aCSV } from '../nucleo/csv.js';
import { crearEscena, numero, texto } from '../nucleo/escena.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';
import { descargarTexto, avisar as avisarLienzo } from '../componentes/exportar.js';
import { simularGas, estadoEn, banderas, NOMBRES_ACCION as NOMBRES, calorTotal, residuoGas, residuoEmbolo, R_GAS } from '../motores/gas.js';
import { simularRecipientes, simularAbierto, simularBurbuja, estadoRecipientes, estadoMuestras } from '../motores/recipientes.js';
import { ESCENAS_LAB, escenaPorClave, guionDe, entradaCilindro, examenDe } from './termodinamica-escenas.js';
import { ponerTitulo, iniciarMenuEscenas, aOtroEspacio, irAEscenaDeOtroEspacio, examenHTML, filaLectura, chipDe, ICONO_TIPO, filasParametros, enlazarParametros, botonQuitar, iniciarPaleta } from './termodinamica-comun.js';
import {
  PARAMS_LAB, PARAMS_INSTR, montajeLabVacio, colocarLab, quitarLab, ajustarLab, reordenarLab, piezaLab, escenaLab, sanearLab, firmaRecipientes, guionValidoLab,
  montajeDesdeCilindro, montajeDesdeRecipientes, montajeDesdeGlobo, montajeDesdeBurbuja, nuevoInstrumento, sanearInstrumentos, lecturaCronometro, ponerParametro,
} from './termodinamica-montaje.js';

(function () {
  'use strict';
  const { Trazo, fmt, cantidad, conPrefijo, grafica, LineaTiempo, Termo } = Volta;
  const $ = s => document.querySelector(s);
  const ESPACIO = 'laboratorio-de-gases';
  const RAD = Math.PI / 180;

  // ---------------------------------------------------------------------
  // Física: motores puros (gas.js y recipientes.js)
  // ---------------------------------------------------------------------
  const DT = 2e-4;                       // paso de integración del cilindro (s)
  const MUESTRA = 0.01;                  // cada cuánto se guarda el estado (s)
  const TAU_Q = 4;                       // cuasiestático: tiempo en cargar o descargar la pesa (s)
  const ESCENA_INICIAL = 'mext-2019-p4';
  /** @type {any} */ let ESC = escenaPorClave(ESCENA_INICIAL);
  let MONT = 'cilindro', DUR = 42;
  // Geometría de la escena (m). y = 0 es el fondo del cilindro y del tanque.
  let GEO = { Hc: 0.70, yTope: 0.66, ep: 0.04, hPesa: 0.08, colchon: 0.17, nivel: 0.56, borde: 0.62, hCal: 0.035, tanque: true, simEmbolo: 'm' };
  let H_MAX = GEO.yTope - GEO.ep;        // el émbolo toca los topes con el gas a esta altura
  function geoDe(e) {
    const g = e.geo || {}, Hc = g.Hc ?? 0.70;
    return { Hc, yTope: (g.hMax ?? 0.62) + 0.04, ep: 0.04, hPesa: 0.08, colchon: 0.17, nivel: Hc * 0.8, borde: Hc * 0.886, hCal: 0.035, tanque: g.tanque !== false, simEmbolo: g.simEmbolo || 'm' };
  }

  function simularCilindro(guionUsado) {
    const p = { ...entradaCilindro(ESC, vals()), especie: ESC.propio ? ESC.especie : especie, hMax: H_MAX };
    const sim = simularGas(p, guionUsado, { modelo: motor, duracion: DUR, dt: DT, muestra: MUESTRA, tauCarga: TAU_Q, ...(ESC.opciones || {}) });
    const Rcil = Math.sqrt(sim.A / Math.PI);       // radio del cilindro (dibujo)
    fasesMoleculas(sim, Rcil);
    return { ...sim, Rcil };
  }

  // Fases de las moléculas (cosméticas, no son física): avanzan con √T y, en
  // vertical, con 1/h. Se integran sobre las muestras con la regla del trapecio.
  function fasesMoleculas(sim, Rcil, alto = q => q.h) {
    const ms = sim.muestras, ritmo = q => 0.6 * Math.sqrt(Math.max(q.T, 1) / 300);
    const vertical = q => ritmo(q) * (2 * Rcil) / Math.max(alto(q), 0.02);
    let fx = 0, fy = 0;
    ms.forEach((q, i) => {
      if (i) { const p = ms[i - 1], d = q.t - p.t; fx += 0.5 * (ritmo(p) + ritmo(q)) * d; fy += 0.5 * (vertical(p) + vertical(q)) * d; }
      q.fx = fx; q.fy = fy;
    });
  }

  // ---------------------------------------------------------------------
  // Parámetros (variables de la escena) y acciones
  // ---------------------------------------------------------------------
  /** @type {Record<string, any>} */ let VAR = {};
  const vals = () => Object.fromEntries(Object.entries(VAR).map(([k, d]) => [k, d.val]));
  const copia = o => JSON.parse(JSON.stringify(o));
  let guion = [], guionPropio = false;
  let motor = 'dinamico', especie = 'mono';
  const capas = { moleculas: true, vectores: true, instrumentos: true, cotas: true };
  let sel = 'gas', hover = null, cursorPx = null;
  const MOL = Termo.crearMoleculas(150);
  const MOLR = [0, 1, 2, 3].map(k => Termo.crearMoleculas(70, 11 + k));

  let SIM, ESCA, FILAS = [];   // simulación, escalas fijas de la corrida y examen
  function simular() {
    if (!guionPropio) guion = guionDe(ESC, vals());
    if (MONT === 'vacio') { SIM = null; FILAS = []; GIRA = false; REC = null; return; }
    if (MONT === 'cilindro') SIM = simularCilindro(guion);
    else if (MONT === 'recipientes') { SIM = simularRecipientes(ESC.construir(vals()), guion, { duracion: DUR, dt: 0.002, muestra: 0.02, modo: modoValvula }); prepararRecipientes(); }
    else if (MONT === 'abierto') { SIM = simularAbierto(ESC.construir(vals()), guion, { duracion: DUR, dt: 0.01, muestra: 0.05 }); fasesMoleculas(SIM, 1, () => 1); }
    else { SIM = simularBurbuja(ESC.construir(vals()), { duracion: DUR }); }
    FILAS = guionPropio ? [] : examenDe(ESC, SIM, vals());
    GIRA = MONT === 'cilindro' && (!GEO.tanque || SIM.muestras.some(q => q.ang !== 0));
    if (MONT === 'cilindro') escalasCilindro();
  }
  function escalasCilindro() {
    // Escalas fijas para toda la corrida: ni las gráficas ni las barras saltan
    const ms = SIM.muestras, ext = (f) => { let lo = Infinity, hi = -Infinity; for (const q of ms) { const x = f(q); if (x < lo) lo = x; if (x > hi) hi = x; } return [lo, hi]; };
    const marg = ([lo, hi], fr = 0.08) => { const d = Math.max(hi - lo, Math.abs(hi) * 0.02, 1e-9); return [lo - d * fr, hi + d * fr]; };
    const absMax = (...fs) => Math.max(1e-9, ...ms.map(q => Math.max(...fs.map(f => Math.abs(f(q))))));
    const Q = calorTotal;
    ESCA = {
      V: marg(ext(q => q.V * 1e3), 0.12), P: marg(ext(q => q.P / 1e3), 0.12),
      T: marg(ext(q => q.T)), h: marg(ext(q => q.h)),
      E: marg([Math.min(0, ...ms.map(q => Math.min(Q(q), q.W, q.dU))), Math.max(0, ...ms.map(q => Math.max(Q(q), q.W, q.dU)))], 0.06),
      gas: absMax(q => q.Qcal, q => q.Qbano, q => q.Edis, q => q.W, q => q.dU),
      emb: absMax(q => q.Watm, q => q.Ep, q => q.Ek, q => q.Edis, q => q.Emano),
      // Flechas de calor: la mayor de la corrida mide 72 px (lineal, sin recortes)
      kCalor: Math.min(0.25, 72 / absMax(q => q.Fb, q => q.Fcal)),
    };
  }
  // Estado interpolado en t (las banderas salen del guion, no de la muestra)
  const estado = t => (MONT === 'cilindro' ? estadoEn(SIM, t) : MONT === 'recipientes' ? estadoRecipientes(SIM, t) : estadoMuestras(SIM, t));
  const Qtot = calorTotal;
  let GIRA = false;
  const girado = () => GIRA;

  // ---------------------------------------------------------------------
  // Estado de la interfaz
  // ---------------------------------------------------------------------
  let t = 0, jugando = false, velocidad = 1, ultimo = 0, encuadreHecho = false;
  const lienzo = $('#lienzo');
  const tz = new Trazo(lienzo);
  let paneo = null;
  let modoValvula = 'gradual';

  // ---------------------------------------------------------------------
  // Dibujo del lienzo: cilindro con el baño (vertical)
  // ---------------------------------------------------------------------
  const geo = () => { const R = SIM.Rcil; return { R, Rt: R + GEO.colchon, xc: Math.min(0.075, 0.6 * R), anchoPesa: Math.min(0.18, 1.4 * R) }; };
  function encuadrar() {
    if (!SIM) tz.vista.encuadrar({ x0: -0.6, x1: 0.6, y0: -0.1, y1: 0.8 }, { x: 0, y: 40, w: tz.w, h: tz.h - 80 }, 36);
    else if (MONT === 'cilindro' && girado()) encuadrarGirado();
    else if (MONT === 'cilindro') { const { Rt } = geo(), fichas = INSTR.some(o => o.tipo === 'termometro' || o.tipo === 'manometro') ? 0.24 : 0; tz.vista.encuadrar({ x0: -Rt - 0.21, x1: Rt + 0.36 + fichas, y0: -0.06, y1: GEO.Hc + 0.14 }, { x: 0, y: 40, w: tz.w, h: tz.h - 80 }, 36); }
    else if (MONT === 'recipientes') tz.vista.encuadrar(cajaRecipientes(), { x: 0, y: 40, w: tz.w, h: tz.h - 80 }, 36);
    else if (MONT === 'abierto') encuadrarAbierto(0);
    else encuadrarBurbuja();
    encuadreHecho = true;
  }
  const hayPesa = () => (ESC.propio ? !!(cilM() && cilM().pesa) : !!VAR.M && VAR.M.val > 0);
  const hayCal = () => MONT === 'cilindro' && (entradaCilindro(ESC, vals()).Fc ?? 0) > 0;
  const pesaPrevista = () => hayPesa() && !banderas(guion, t).pesa && guion.some(a => a.tipo === 'pesa' && a.valor && a.t > t + 1e-9);

  function dibujar() {
    if (!encuadreHecho) encuadrar();
    if (!SIM) dibujarVacio();
    else if (MONT === 'recipientes') dibujarRecipientes();
    else if (MONT === 'abierto') dibujarAbierto();
    else if (MONT === 'burbuja') dibujarBurbuja();
    else if (girado()) dibujarGirado();
    else dibujarCilindro();
    capaEdicion();
  }
  function dibujarCilindro() {
    const v = tz.vista, s = estado(t), fl = banderas(guion, t), { R, Rt, xc, anchoPesa } = geo();
    const tipo = fl.adiab ? 'adiabatica' : 'conductora', anchoP = tz.anchoPared(tipo);
    const hp = s.h, ySup = hp + GEO.ep;
    tz.limpiar(); tz.cuadricula();

    // 3 · Geometría fija: tanque del baño (su fondo es el del cilindro), paredes y topes
    tz.superficie([[-Rt, GEO.borde], [-Rt, 0], [Rt, 0], [Rt, GEO.borde]]);
    tz.paredes([[-R, GEO.Hc], [-R, 0]], { tipo, grueso: hover === 'paredes' });
    tz.paredes([[R, 0], [R, GEO.Hc]], { tipo, grueso: hover === 'paredes' });
    tz.topes(-R, R, GEO.yTope);

    // 4 · Medios: agua del baño y gas
    tz.bano({ xi: -Rt, xd: Rt, xa: -R, xb: R, nivel: GEO.nivel, pared: anchoP });
    if (capas.moleculas) tz.moleculas({ x0: -R, x1: R, y0: 0, y1: hp }, Termo.posicionesMoleculas(MOL, s.fx, s.fy));

    // 5 · Construcción: eje de simetría del cilindro y cota de la altura del gas
    tz.linea([[0, -0.035], [0, GEO.Hc + 0.05]], { color: 'texto-3', grosor: 1, patron: 'eje', extremo: 'butt' });
    if (capas.cotas) {
      const d = (Rt - R) * v.escala + 26;
      tz.cota([-R, hp], [-R, 0], { desplazamiento: d, texto: 'h' });
      tz.texto(cantidad(hp, 'm', 4), v.X(-R) - d - 7, v.Y(hp / 2) + 22, { fuente: 'num', tam: 11, color: 'texto-2', alinear: 'right', halo: true });
    }

    // 6 · Materia: calentador, émbolo y pesa
    const bbCal = hayCal() ? tz.calentador(-xc, xc, GEO.hCal, 0, { grueso: hover === 'calentador' }) : null;
    const bbEmb = tz.embolo(-R, R, hp, GEO.ep, { grueso: hover === 'embolo', simbolo: [{ t: GEO.simEmbolo, f: 'sim', tam: 14 }] });
    const carga = SIM.cuasi ? s.carga : (fl.pesa ? 1 : 0);
    let bbPesa = null;
    if (hayPesa() && carga > 0.004) bbPesa = tz.pesa(0, ySup, anchoPesa, GEO.hPesa, { fraccion: carga, grueso: hover === 'pesa', simbolo: [{ t: 'M', f: 'sim', tam: 14 }] });
    else if (hayPesa() && (hover === 'pesa' || pesaPrevista())) bbPesa = tz.pesa(0, ySup, anchoPesa, GEO.hPesa, { prevista: true });

    // 7 · Magnitudes: calor (térmico), fuerzas (interacción), velocidad (movimiento)
    if (capas.vectores && $('#m-q').checked) {
      const k = ESCA.kCalor;
      if (s.Fcal > 0.5) {
        const L = s.Fcal * k, y0 = v.Y(GEO.hCal) - 10;
        for (const x of [-0.55 * xc, 0, 0.55 * xc]) tz.flechaCalor(v.X(x), y0, v.X(x), y0 - L);
        tz.etiquetaCalor(v.X(-R) + 7, y0 - L - 9, 'cal', s.Fcal, 'left');
      }
      if (!fl.adiab && Math.abs(s.Fb) * k > 3) {
        const L = Math.abs(s.Fb) * k, sg = Math.sign(s.Fb);  // + : del baño al gas
        const alturas = [0.42, 0.78].map(fr => Math.min(GEO.nivel - 0.04, hp * fr));
        alturas.forEach((y, i) => {
          const Y = v.Y(y), xl = v.X(-R) - anchoP / 2, xr = v.X(R) + anchoP / 2;
          tz.flechaCalor(xl - sg * L / 2, Y, xl + sg * L / 2, Y);
          tz.flechaCalor(xr + sg * L / 2, Y, xr - sg * L / 2, Y);
          // Etiqueta fuera del tanque, junto a las flechas de la derecha (dentro del gas no cabe)
          if (i === 1) tz.etiquetaCalor(v.X(Rt) + 16, Y + 5, 'baño', Math.abs(s.Fb), 'left');
        });
      }
    }
    if (capas.vectores && $('#m-f').checked) fuerzas(s, R, hp);
    if (capas.vectores && $('#m-v').checked && !SIM.cuasi) {
      // En el hueco entre la pesa y la pared, para no montarse sobre la pesa
      const kv = 250, L = s.v * kv, xv = (anchoPesa / 2 + R) / 2;
      if (Math.abs(L) > 10) tz.vector([xv, hp + GEO.ep / 2], [0, s.v], { familia: 'movimiento', escalaPx: kv, simbolo: 'v', valor: Math.abs(s.v), unidad: 'm/s' });
    }

    // 8 · Instrumentos: manómetro con tubo y termómetro con sonda en el gas
    // (los de la escena; en una escena propia solo están los que se colocan)
    if (capas.instrumentos && !ESC.propio) {
      const Xi = v.X(Rt + 0.075);
      const Ym = v.Y(0.05);
      tz.tuboPx([[v.X(R) - 1, Ym], [Xi - 11, Ym]]);
      tz.manometro(Xi, Ym, s.P / 300e3);
      tz.ficha(Xi + 20, Ym - 16, [
        [{ t: 'Manómetro', f: 'ui', tam: 11.5 }],
        [{ t: 'P', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(s.P / 1e3, 'kPa'), f: 'num', tam: 11.5 }],
      ]);
      const Yt = v.Y(Math.min(0.16, hp * 0.4)), Xs = v.X(R) - 14;
      tz.lineaPx([[Xs, Yt], [Xi, Yt]], { color: 'texto-2', grosor: 1 });
      tz.sondaTermica(Xs, Yt);
      tz.termometro(Xi, Yt, (s.T - 200) / 300);
      tz.ficha(Xi + 20, Yt - 34, [
        [{ t: 'Termómetro', f: 'ui', tam: 11.5 }],
        [{ t: 'T', f: 'sim', tam: 13, color: 'termico' }, { t: ' = ' + cantidad(s.T, 'K'), f: 'num', tam: 11.5 }],
      ]);
    }

    // 9 · Anotaciones: atmósfera, baño y el evento más reciente
    tz.compuesto([{ t: 'Atmósfera   ', f: 'ui', tam: 11.5, color: 'texto-3' }, { t: 'P', f: 'sim', tam: 14 },
      { t: '0', f: 'simRecta', tam: 9.5, dy: 3 }, { t: ' = ' + cantidad(SIM.P0 / 1e3, 'kPa'), f: 'num', tam: 11.5, color: 'texto-2' }],
    v.X(-Rt), v.Y(GEO.Hc + 0.10), {});
    const Xb = (v.X(-Rt) + v.X(-R) - anchoP) / 2;
    tz.texto('Baño', Xb, v.Y(0.05) - 17, { tam: 11.5, color: 'texto-2', alinear: 'center', halo: true });
    tz.compuesto([{ t: 'T', f: 'sim', tam: 13, color: 'termico' }, { t: '0', f: 'simRecta', tam: 9, dy: 3, color: 'termico' },
      { t: ' = ' + cantidad(SIM.T0, 'K', 3), f: 'num', tam: 11.5, color: 'texto-2' }], Xb, v.Y(0.05), { alinear: 'center' });
    const rec = SIM.eventos.filter(e => e.t <= t + 1e-9 && t - e.t < 2.5).pop();
    if (rec) {
      const anc = rec.tipo === 'pesa' ? [-anchoPesa / 2, ySup + GEO.hPesa] : rec.tipo === 'calentador' ? [-xc, GEO.hCal]
        : rec.tipo === 'topes' ? [-R, GEO.yTope] : [-R, GEO.nivel + 0.04];
      const [ax, ay] = tz.eventoAnillo(anc);
      tz.ctx.save(); tz.ctx.font = Volta.FUENTE.ui(11.5); const wf = tz.ctx.measureText(rec.nombre).width + 16; tz.ctx.restore();
      tz.ficha(v.X(-Rt) - 20 - wf, v.Y(GEO.Hc * 0.74 / 0.70), [
        [{ t: rec.nombre, f: 'ui', tam: 11.5 }],
        [{ t: 't', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(rec.t, 's'), f: 'num', tam: 11.5 }],
      ], { ancla: [ax - 6, ay - 4] });
    }

    // 10 · Edición: selección, pista de la acción bajo el cursor y escala
    if (sel === 'gas') { const [X, Y, W, H] = tz.rectPx(-R, 0, R, hp); tz.seleccionRegion(X, Y, W, H, { dentroX: true, dentroY: true }); }
    else if (sel === 'embolo') tz.seleccionRegion(...bbEmb, { dentroX: true });
    else if (sel === 'pesa' && bbPesa) tz.seleccionCaja(...bbPesa);
    else if (sel === 'calentador' && bbCal) tz.seleccionCaja(...bbCal);
    else if (sel === 'cilindro') { const [X, Y, W, H] = tz.rectPx(-R, 0, R, GEO.Hc); tz.seleccionCaja(X - anchoP, Y, W + 2 * anchoP, H); }
    else if (sel === 'bano') { const [X, Y, W, H] = tz.rectPx(-Rt, 0, Rt, GEO.nivel); tz.seleccionCaja(X, Y, W, H); }
    if (hover && PISTAS[hover] && cursorPx) tz.ficha(cursorPx[0] + 14, cursorPx[1] + 14, [[{ t: PISTAS[hover](fl), f: 'ui', tam: 11.5 }]]);
    tz.barraEscala(16, tz.h - 56);
  }
  const PISTAS = {
    pesa: fl => (fl.pesa ? 'Clic: quitar la pesa' : 'Clic: poner la pesa'),
    calentador: fl => (fl.cal ? 'Clic: apagar el calentador' : 'Clic: encender el calentador'),
    paredes: fl => (fl.adiab ? 'Clic: paredes conductoras' : 'Clic: paredes adiabáticas'),
  };

  // Fuerzas sobre el émbolo (con la pesa): gas hacia arriba, atmósfera y peso hacia abajo
  function fuerzas(s, R, hp) {
    const v = tz.vista, kF = 0.012, A = SIM.A, g = SIM.g;   // kF en px/N
    const Fg = s.P * A, Fa = SIM.P0 * A, Fp = s.me * g;
    const xg = v.X(-0.55 * R), yb = v.Y(hp);
    tz.flechaPx(xg, yb + Fg * kF, xg, yb, { color: 'interaccion' });
    tz.compuesto([{ t: 'PA', f: 'sim', tam: 14, color: 'interaccion' }], xg - 7, yb + Fg * kF * 0.55, { alinear: 'right' });
    const xa = v.X(R - 0.016), yt = v.Y(hp + GEO.ep);
    tz.flechaPx(xa, yt - Fa * kF, xa, yt, { color: 'interaccion' });
    tz.compuesto([{ t: 'P', f: 'sim', tam: 14, color: 'interaccion' }, { t: '0 ', f: 'simRecta', tam: 9.5, dy: 3, color: 'interaccion' }, { t: 'A', f: 'sim', tam: 14, color: 'interaccion' }], xa, yt - Fa * kF - 7, { alinear: 'center' });
    const xp = v.X(0), yc = v.Y(hp + GEO.ep / 2);
    tz.flechaPx(xp, yc, xp, yc + Fp * kF, { color: 'interaccion' });
    const conPesa = s.me > SIM.m + 1e-6;
    tz.compuesto(conPesa ? [{ t: '(', f: 'simRecta', tam: 14, color: 'interaccion' }, { t: 'm', f: 'sim', tam: 14, color: 'interaccion' }, { t: ' + ', f: 'simRecta', tam: 14, color: 'interaccion' }, { t: 'M', f: 'sim', tam: 14, color: 'interaccion' }, { t: ')', f: 'simRecta', tam: 14, color: 'interaccion' }, { t: 'g', f: 'sim', tam: 14, color: 'interaccion' }]
      : [{ t: GEO.simEmbolo === 'M' ? 'Mg' : 'mg', f: 'sim', tam: 14, color: 'interaccion' }], xp, yc + Fp * kF + 16, { alinear: 'center' });
  }

  // ---------------------------------------------------------------------
  // Cilindro inclinado o que gira: se dibuja en su propio marco (eje local y
  // del fondo hacia la boca) girado alrededor del fondo; los textos van
  // después, sin girar, en los puntos girados.
  // ---------------------------------------------------------------------
  const giro = ang => { const [Ox, Oy] = tz.vista.P([0, 0]), c = Math.cos(ang * RAD), s2 = Math.sin(ang * RAD); return ([X, Y]) => [Ox + (X - Ox) * c - (Y - Oy) * s2, Oy + (X - Ox) * s2 + (Y - Oy) * c]; };
  const alMundo = (ang, [x, y]) => { const c = Math.cos(ang * RAD), s2 = Math.sin(ang * RAD); return [x * c + y * s2, -x * s2 + y * c]; };
  function encuadrarGirado() {
    const R = SIM.Rcil, angs = new Set([0]);
    for (const q of SIM.muestras) angs.add(Math.round(q.ang));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const a of angs) for (const p of [[-R - 0.05, -0.05], [R + 0.05, -0.05], [R + 0.05, GEO.Hc + 0.06], [-R - 0.05, GEO.Hc + 0.06]]) {
      const [x, y] = alMundo(a, p); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    tz.vista.encuadrar({ x0: x0 - 0.12, x1: x1 + 0.42, y0: y0 - 0.06, y1: y1 + 0.12 }, { x: 0, y: 40, w: tz.w, h: tz.h - 80 }, 36);
  }
  function dibujarGirado() {
    const v = tz.vista, s = estado(t), fl = banderas(guion, t), R = SIM.Rcil, xc = Math.min(0.075, 0.6 * R), anchoPesa = Math.min(0.18, 1.4 * R);
    const ang = s.ang, tipo = fl.adiab ? 'adiabatica' : 'conductora', anchoP = tz.anchoPared(tipo), hp = s.h, ySup = hp + GEO.ep;
    const G = giro(ang), [Ox, Oy] = v.P([0, 0]), c = tz.ctx;
    tz.limpiar(); tz.cuadricula();
    c.save(); c.translate(Ox, Oy); c.rotate(ang * RAD); c.translate(-Ox, -Oy);
    // Fondo cerrado, paredes y topes; la boca queda abierta
    tz.paredes([[-R, GEO.Hc], [-R, 0], [R, 0], [R, GEO.Hc]], { tipo, grueso: hover === 'paredes' });
    tz.topes(-R, R, GEO.yTope);
    if (capas.moleculas) tz.moleculas({ x0: -R, x1: R, y0: 0, y1: hp }, Termo.posicionesMoleculas(MOL, s.fx, s.fy));
    tz.linea([[0, -0.035], [0, GEO.Hc + 0.05]], { color: 'texto-3', grosor: 1, patron: 'eje', extremo: 'butt' });
    if (capas.cotas) tz.cota([-R, hp], [-R, 0], { desplazamiento: anchoP + 18 });
    const bbCal = hayCal() ? tz.calentador(-xc, xc, GEO.hCal, 0, { grueso: hover === 'calentador' }) : null;
    const bbEmb = tz.embolo(-R, R, hp, GEO.ep, { grueso: hover === 'embolo', centroMasa: true });
    const carga = SIM.cuasi ? s.carga : (fl.pesa ? 1 : 0);
    if (hayPesa() && carga > 0.004) tz.pesa(0, ySup, anchoPesa, GEO.hPesa, { fraccion: carga, grueso: hover === 'pesa' });
    if (capas.vectores && $('#m-q').checked && s.Fcal > 0.5) {
      const L = s.Fcal * ESCA.kCalor, y0 = v.Y(GEO.hCal) - 10;
      for (const x of [-0.55 * xc, 0, 0.55 * xc]) tz.flechaCalor(v.X(x), y0, v.X(x), y0 - L);
    }
    if (capas.vectores && $('#m-q').checked && !fl.adiab && Math.abs(s.Fb) * ESCA.kCalor > 3) {
      // Calor del aire de fuera: hacia dentro si entra, hacia fuera si sale
      const L = Math.min(60, Math.abs(s.Fb) * ESCA.kCalor), entra = s.Fb > 0, Y = v.Y(hp * 0.5), xl = v.X(-R) - 4, xr = v.X(R) + 4;
      if (entra) { tz.flechaCalor(xl - L, Y, xl, Y); tz.flechaCalor(xr + L, Y, xr, Y); }
      else { tz.flechaCalor(xl, Y, xl - L, Y); tz.flechaCalor(xr, Y, xr + L, Y); }
    }
    if (sel === 'gas') { const [X, Y, W, H] = tz.rectPx(-R, 0, R, hp); tz.seleccionRegion(X, Y, W, H, { dentroX: true, dentroY: true }); }
    else if (sel === 'embolo') tz.seleccionRegion(...bbEmb, { dentroX: true });
    else if (sel === 'calentador' && bbCal) tz.seleccionCaja(...bbCal);
    else if (sel === 'cilindro') { const [X, Y, W, H] = tz.rectPx(-R, 0, R, GEO.Hc); tz.seleccionCaja(X - anchoP, Y, W + 2 * anchoP, H); }
    c.restore();
    // Textos sin girar en los puntos girados
    const pe = G(v.P([0, hp + GEO.ep / 2]));
    tz.compuesto([{ t: GEO.simEmbolo, f: 'sim', tam: 14 }], pe[0] + 14, pe[1] - 10, { alinear: 'left' });
    if (capas.cotas) {
      // Texto de la cota por fuera de su línea: centrado si queda arriba o abajo, a un lado si queda a la izquierda o a la derecha
      const pc = G(v.P([-R, hp / 2])), dx = -Math.cos(ang * RAD), dy = -Math.sin(ang * RAD), d = anchoP + 30;
      const al = dx > 0.5 ? 'left' : dx < -0.5 ? 'right' : 'center';
      tz.compuesto([{ t: 'h', f: 'sim', tam: 15 }, { t: ' = ' + cantidad(hp, 'm', 4), f: 'num', tam: 11, color: 'texto-2' }], pc[0] + dx * d, pc[1] + dy * d + (al === 'center' ? (dy < 0 ? -2 : 12) : 4), { alinear: al });
    }
    if (capas.vectores && $('#m-q').checked && s.Fcal > 0.5) { const p = G(v.P([xc + 0.02, GEO.hCal + 0.06])); tz.etiquetaCalor(p[0] + 4, p[1], 'cal', s.Fcal, 'left'); }
    if (capas.vectores && $('#m-v').checked && !SIM.cuasi && Math.abs(s.v) * 250 > 10) tz.vector(alMundo(ang, [(anchoPesa / 2 + R) / 2, hp + GEO.ep / 2]), alMundo(ang, [0, s.v]), { familia: 'movimiento', escalaPx: 250, simbolo: 'v', valor: Math.abs(s.v), unidad: 'm/s' });
    // Gravedad: la vertical de referencia
    const b = tz.vista, xg = b.mx(28), yg = b.my(120);
    tz.vector([xg, yg], [0, -1], { familia: 'cambio', escalaPx: 44, simbolo: 'g' });
    tz.compuesto([{ t: 'α', f: 'sim', tam: 14 }, { t: ` = ${fmt(ang, 3)}°`, f: 'num', tam: 11.5, color: 'texto-2' }], b.X(xg) + 18, b.Y(yg) - 4, {});
    // Instrumentos a la derecha, con línea guía al gas (los de la escena)
    if (capas.instrumentos && !ESC.propio) {
      const centro = G(v.P([0, hp / 2])), Xi = tz.w - 230;
      let Yi = 92;
      tz.lineaPx([centro, [Xi - 12, Yi + 16]], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
      tz.manometro(Xi, Yi + 16, s.P / 300e3);
      tz.ficha(Xi + 20, Yi, [[{ t: 'Manómetro', f: 'ui', tam: 11.5 }], [{ t: 'P', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(s.P / 1e3, 'kPa'), f: 'num', tam: 11.5 }]]);
      Yi += 64;
      tz.termometro(Xi, Yi + 34, (s.T - 200) / 300);
      tz.ficha(Xi + 20, Yi + 4, [[{ t: 'Termómetro', f: 'ui', tam: 11.5 }], [{ t: 'T', f: 'sim', tam: 13, color: 'termico' }, { t: ' = ' + cantidad(s.T, 'K'), f: 'num', tam: 11.5 }]]);
    }
    tz.compuesto([{ t: 'Atmósfera   ', f: 'ui', tam: 11.5, color: 'texto-3' }, { t: 'P', f: 'sim', tam: 14 }, { t: '0', f: 'simRecta', tam: 9.5, dy: 3 }, { t: ' = ' + cantidad(SIM.P0 / 1e3, 'kPa'), f: 'num', tam: 11.5, color: 'texto-2' },
      ...(GEO.tanque ? [] : [{ t: fl.adiab ? '   · paredes adiabáticas' : `   · aire a T₀ = ${cantidad(SIM.T0, 'K', 4)}`, f: 'ui', tam: 11.5, color: 'texto-3' }])], 16, 62, {});
    const rec = SIM.eventos.filter(e => e.t <= t + 1e-9 && t - e.t < 2.5).pop();
    if (rec) {
      // Ficha del evento a la izquierda del cilindro, para no taparlo
      const [ax, ay] = tz.eventoAnillo(alMundo(ang, [-R, GEO.Hc * 0.9]));
      tz.ctx.save(); tz.ctx.font = Volta.FUENTE.ui(11.5); const wf = tz.ctx.measureText(rec.nombre).width + 16; tz.ctx.restore();
      tz.ficha(ax - 24 - wf, ay - 20, [[{ t: rec.nombre, f: 'ui', tam: 11.5 }], [{ t: 't', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(rec.t, 's'), f: 'num', tam: 11.5 }]], { ancla: [ax - 6, ay] });
    }
    if (hover && PISTAS[hover] && cursorPx) tz.ficha(cursorPx[0] + 14, cursorPx[1] + 14, [[{ t: PISTAS[hover](fl), f: 'ui', tam: 11.5 }]]);
    tz.barraEscala(16, tz.h - 56);
  }

  // ---------------------------------------------------------------------
  // Recipientes conectados
  // ---------------------------------------------------------------------
  let REC = null;     // escena del motor, nombres y geometría fija
  const ALTO_REC = 0.24;
  function prepararRecipientes() {
    const e = ESC.construir(vals()), V0 = e.compartimientos.map(c => c.V), k = 0.86 / V0.reduce((a, b) => a + b, 0);
    REC = { e, k, nombres: ESC.nombres || e.compartimientos.map((_, i) => String(i + 1)), nMax: Math.max(1e-12, ...SIM.muestras.map(m => Math.max(...m.n))) };
  }
  /**
   * Rectángulos (mundo) de cada recipiente en t: anchos ∝ V; las válvulas
   * dejan un hueco con su tubo. En una escena propia el dibujo está a escala:
   * cada recipiente es una caja de sección S (cara de √S × √S) y ancho V/S,
   * así que la regla mide longitudes reales (el desplazamiento de un émbolo).
   */
  function layoutRec(s) {
    const { e, k } = REC, rects = [], sec = ESC.secciones;
    let x = 0;
    e.compartimientos.forEach((c, i) => {
      const w = sec ? s.V[i] / sec[i] : k * s.V[i], alto = sec ? Math.sqrt(sec[i]) : ALTO_REC;
      rects.push({ x0: x, x1: x + w, y0: 0.06, y1: 0.06 + alto });
      x += w + (e.separadores[i] && e.separadores[i].tipo === 'valvula' ? (sec ? 0.12 : 0.16) : 0);
    });
    return rects;
  }
  function cajaRecipientes() {
    const r = layoutRec(SIM.muestras[0]), alto = Math.max(...r.map(q => q.y1 - q.y0)), conFichas = INSTR.some(o => o.tipo === 'termometro' || o.tipo === 'manometro');
    return { x0: r[0].x0 - 0.12, x1: r[r.length - 1].x1 + 0.12, y0: conFichas ? -0.16 : -0.06, y1: 0.06 + alto + 0.2 };
  }
  function banderasRec(tt) {
    const e = REC.e, b = { valvulas: e.separadores.map(s => s.tipo === 'valvula' && !!s.abierta), cal: e.compartimientos.map(() => false), bano: e.compartimientos.map(c => (c.Gb ?? 0) > 0 && c.bano !== false) };
    for (const a of [...guion].sort((p, q) => p.t - q.t)) {
      if (a.t > tt + 1e-9) break;
      if (a.tipo === 'valvula') b.valvulas[a.i] = !!a.valor; else if (a.tipo === 'calentador') b.cal[a.i] = !!a.valor; else if (a.tipo === 'bano') b.bano[a.i] = !!a.valor;
    }
    return b;
  }
  const MOLDE = Termo.crearMoleculas(90, 23);
  function dibujarRecipientes() {
    const v = tz.vista, s = estado(t), b = banderasRec(t), { e } = REC, rects = layoutRec(s), N = e.compartimientos.length;
    tz.limpiar(); tz.cuadricula();
    tz.superficie([[rects[0].x0 - 0.08, 0], [rects[N - 1].x1 + 0.08, 0]]);
    const aislado = i => !((e.compartimientos[i].Gb ?? 0) > 0);
    // Baños bajo los recipientes que tienen: en contacto, o separados un poco
    e.compartimientos.forEach((c, i) => {
      if (!((c.Gb ?? 0) > 0)) return;
      const r = rects[i], gap = b.bano[i] ? 0 : 0.025, [X, Y, W, H] = tz.rectPx(r.x0 + 0.01, 0, r.x1 - 0.01, 0.06 - gap);
      tz.fluidoPx(X, X + W, Y, Y + H);
      tz.texto('Baño', X + W / 2, Y + H + 14, { tam: 11, color: 'texto-3', alinear: 'center', halo: true });
      tz.compuesto([{ t: 'T', f: 'sim', tam: 12, color: 'termico' }, { t: 'b', f: 'simRecta', tam: 8.5, dy: 3, color: 'termico' }, { t: ' = ' + cantidad(c.Tb, 'K', 4), f: 'num', tam: 11, color: 'texto-2' }], X + W / 2, Y + H + 28, { alinear: 'center' });
      if (capas.vectores && $('#m-q').checked && b.bano[i]) {
        const k1 = SIM.muestras[Math.max(0, Math.round(t / SIM.muestra) - 2)], k2 = estado(t), F = (k2.Qbano[i] - k1.Qbano[i]) / Math.max(1e-9, t - k1.t);
        if (Math.abs(F) > 0.01 && t > 0.05) { const Xc = X + W / 2, Y0 = v.Y(0.06); tz.flechaCalor(Xc - 30, F > 0 ? Y0 + 2 : Y0 - 22, Xc - 30, F > 0 ? Y0 - 22 : Y0 + 2); }
      }
    });
    // Grupos contiguos (paredes y émbolos) en una sola caja; las válvulas, con su tubo
    let i0 = 0;
    for (let i = 0; i < N; i++) {
      if (i < N - 1 && e.separadores[i].tipo !== 'valvula') continue;
      const r0 = rects[i0], r1 = rects[i];
      tz.termoCaja(r0.x0, r0.y0, r1.x1, r1.y1, { tipo: [...Array(i - i0 + 1).keys()].every(q => aislado(i0 + q)) ? 'adiabatica' : 'conductora', grueso: hover === 'r' + i0 });
      i0 = i + 1;
    }
    let finEtq = -Infinity, fila = 0;
    e.compartimientos.forEach((c, i) => {
      const r = rects[i], nn = s.n[i];
      // Gas: más moléculas cuanto más gas
      if (capas.moleculas && nn > 1e-9) {
        const cuantas = Math.max(3, Math.round(70 * nn / REC.nMax)), fase = t * 0.6 * Math.sqrt(Math.max(s.T[i], 1) / 300);
        tz.moleculas({ x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1 }, Termo.posicionesMoleculas(MOLR[i % 4].slice(0, cuantas), fase, fase * 1.3));
      } else if (nn <= 1e-9) tz.texto('vacío', v.X((r.x0 + r.x1) / 2), v.Y((r.y0 + r.y1) / 2) + 4, { tam: 11.5, color: 'texto-3', alinear: 'center' });
      if ((c.Fc ?? 0) > 0) {
        const xm = (r.x0 + r.x1) / 2, xc2 = Math.min(0.04, (r.x1 - r.x0) * 0.3);
        tz.calentador(xm - xc2, xm + xc2, r.y0 + 0.03, r.y0, { grueso: hover === 'c' + i });
        if (b.cal[i] && capas.vectores && $('#m-q').checked) {
          const F = (estado(t).Qcal[i] - estado(Math.max(0, t - 0.1)).Qcal[i]) / 0.1;
          if (F > 0.01) { const Y = v.Y(r.y0 + 0.03) - 10; for (const dx of [-0.6, 0, 0.6]) tz.flechaCalor(v.X(xm + dx * xc2), Y, v.X(xm + dx * xc2), Y - 22); tz.etiquetaCalor(v.X(xm), Y - 30, 'cal', F, 'center'); }
        }
      }
      // Lecturas encima (una fila más arriba si no caben al lado de las del vecino)
      const X = v.X(r.x0);
      fila = X < finEtq + 12 ? fila + 1 : 0;
      const Y = v.Y(r.y1) - 12 - fila * 34;
      tz.ctx.save(); tz.ctx.font = Volta.FUENTE.num(11); finEtq = X + tz.ctx.measureText(`T = ${cantidad(s.T[i] || 0, 'K', 4)}  n = ${cantidad(nn, 'mol', 3)}`).width + 16; tz.ctx.restore();
      tz.compuesto([{ t: REC.nombres[i] + '  ', f: 'ui', tam: 12, peso: 600 }, { t: 'P', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(s.P[i] / 1e3, 'kPa', 4), f: 'num', tam: 11, color: 'texto-2' }], X, Y - 15, {});
      if (nn > 1e-9) tz.compuesto([{ t: 'T', f: 'sim', tam: 13, color: 'termico' }, { t: ' = ' + cantidad(s.T[i], 'K', 4) + '  ', f: 'num', tam: 11, color: 'texto-2' }, { t: 'n', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(nn, 'mol', 3), f: 'num', tam: 11, color: 'texto-2' }], X, Y, {});
    });
    // Separadores: émbolos y paredes interiores; válvulas con su tubo
    e.separadores.forEach((sp, j) => {
      const a = rects[j], c2 = rects[j + 1];
      if (sp.tipo === 'embolo') tz.embolo(a.x1 - 0.012, a.x1 + 0.012, a.y0, a.y1 - a.y0, { grueso: hover === 's' + j, centroMasa: false });
      else if (sp.tipo === 'pared') tz.linea([[a.x1, a.y0], [a.x1, a.y1]], { grosor: 2 });
      else {
        const yt = (a.y0 + a.y1) / 2, [X0, Y] = v.P([a.x1, yt]), X1 = v.X(c2.x0), ap = tz.anchoPared('adiabatica');
        tz.tuboPx([[X0 + ap, Y], [X1 - ap, Y]]);
        const abierta = b.valvulas[j];
        tz.termoValvula((X0 + X1) / 2, Y, abierta, { grueso: hover === 's' + j });
        tz.texto(abierta ? 'abierta' : 'cerrada', (X0 + X1) / 2, Y + 22, { tam: 11, color: 'texto-3', alinear: 'center', halo: true });
      }
    });
    const rec = SIM.eventos.filter(x => x.t <= t + 1e-9 && t - x.t < 2.5).pop();
    if (rec) {
      const r = rects[Math.min(rec.i, N - 1)], p = rec.tipo === 'valvula' ? [(r.x1 + rects[rec.i + 1].x0) / 2, r.y1 - 0.02] : [(r.x0 + r.x1) / 2, r.y0 + 0.04];
      const [ax, ay] = tz.eventoAnillo(p);
      tz.ficha(ax + 14, v.Y(Math.max(...rects.map(q => q.y1))) - 104, [[{ t: nombreAccion(rec.tipo, rec.valor, rec.i), f: 'ui', tam: 11.5 }], [{ t: 't', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(rec.t, 's'), f: 'num', tam: 11.5 }]], { ancla: [ax + 5, ay - 5] });
    }
    // Selección
    if (/^[rg]\d+$/.test(sel)) { const r = rects[+sel.slice(1)]; if (r) { const [X, Y, W, H] = tz.rectPx(r.x0, r.y0, r.x1, r.y1); tz.seleccionRegion(X, Y, W, H, { dentroX: true, dentroY: true }); } }
    else if (/^b\d+$/.test(sel)) { const r = rects[+sel.slice(1)]; if (r) { const [X, Y, W, H] = tz.rectPx(r.x0 + 0.01, 0, r.x1 - 0.01, 0.06); tz.seleccionCaja(X, Y, W, H); } }
    else if (/^c\d+$/.test(sel)) { const r = rects[+sel.slice(1)]; if (r) { const xm = (r.x0 + r.x1) / 2, xc2 = Math.min(0.04, (r.x1 - r.x0) * 0.3), [X, Y, W, H] = tz.rectPx(xm - xc2, r.y0, xm + xc2, r.y0 + 0.03); tz.seleccionCaja(X, Y, W, H); } }
    else if (/^s\d+$/.test(sel)) { const j = +sel.slice(1), a = rects[j]; if (a && rects[j + 1]) { const [X, Y, W, H] = tz.rectPx(a.x1 - 0.02, a.y0, (e.separadores[j].tipo === 'valvula' ? rects[j + 1].x0 : a.x1 + 0.02), a.y1); tz.seleccionCaja(X, Y, W, H); } }
    // Recipiente que se arrastra: su contorno previsto donde se suelte
    if (arrastre && arrastre.tipo === 'rec' && arrastre.movido) {
      const r = rects[arrastre.i], dx = arrastre.x - arrastre.desde[0];
      if (r) { const [X, Y, W, H] = tz.rectPx(r.x0 + dx, r.y0, r.x1 + dx, r.y1); tz.lineaPx([[X, Y], [X + W, Y], [X + W, Y + H], [X, Y + H], [X, Y]], { color: 'texto-2', grosor: 1.5, patron: 'previsto' }); }
    }
    tz.barraEscala(16, tz.h - 56);
  }

  // ---------------------------------------------------------------------
  // Recipiente abierto: globo o habitación
  // ---------------------------------------------------------------------
  const esGlobo = () => MONT === 'abierto' && !SIM.fijo;
  const radioGlobo = () => Math.cbrt(3 * SIM.e.V / (4 * Math.PI));
  function encuadrarAbierto(z) {
    if (esGlobo()) { const R = radioGlobo(); tz.vista.encuadrar({ x0: -R * 2.6, x1: R * 3.4, y0: z - R * 0.8, y1: z + R * 3.3 }, { x: 0, y: 40, w: tz.w, h: tz.h - 80 }, 36); }
    else { const L = Math.cbrt(SIM.e.V); tz.vista.encuadrar({ x0: -L * 1.1, x1: L * 1.8, y0: -L * 0.25, y1: L * 1.25 }, { x: 0, y: 40, w: tz.w, h: tz.h - 80 }, 36); }
  }
  let vistaManual = false;
  function dibujarAbierto() {
    const s = estado(t), v = tz.vista, e = SIM.e, cal = guion.some(a => a.t <= t + 1e-9) && [...guion].filter(a => a.t <= t + 1e-9).pop().valor;
    if (esGlobo() && !vistaManual) encuadrarAbierto(Math.max(0, s.z - radioGlobo() * 0.5));
    tz.limpiar(); tz.cuadricula();
    if (esGlobo()) {
      const R = radioGlobo(), z = s.z;
      tz.superficie([[-R * 5, 0], [R * 6, 0]]);
      const g = tz.termoGlobo(0, z + 0.2, R, { grueso: hover === 'globo' });
      ULT.globo = g;
      if (capas.moleculas) { const [X, Y] = g.centro, r = g.r * 0.92, cuantas = Math.round(110 * s.n / SIM.n0), lst = Termo.posicionesMoleculas(MOL.slice(0, cuantas), s.fx, s.fy * 0.7); tz.ctx.save(); tz.ctx.beginPath(); tz.ctx.arc(X, Y, r, 0, 2 * Math.PI); tz.ctx.clip(); tz.moleculas({ x0: v.mx(X - r), x1: v.mx(X + r), y0: v.my(Y + r), y1: v.my(Y - r) }, lst); tz.ctx.restore(); }
      // Quemador: calor hacia la boca
      if (cal && capas.vectores && $('#m-q').checked && s.Fq > 0) { const [bx, by] = g.boca; tz.flechaCalor(bx, by + 30, bx, by + 4); tz.etiquetaMagnitud(bx + 10, by + 22, { simbolo: 'Φ', sub: 'q', subRecto: true, valor: s.Fq, unidad: 'W', color: 'termico', prefijo: true }); }
      // Flotación y peso (interacción)
      if (capas.vectores && $('#m-f').checked) {
        const kF = 60 / Math.max(s.B, 1), [X, Y] = g.centro;
        tz.flechaPx(X + g.r + 18, Y, X + g.r + 18, Y - s.B * kF, { color: 'interaccion' });
        tz.etiquetaMagnitud(X + g.r + 26, Y - s.B * kF + 10, { simbolo: 'F', sub: 'B', subRecto: true, valor: s.B, unidad: 'N', color: 'interaccion', prefijo: true });
        tz.flechaPx(g.cesta[0], g.cesta[1] + 4, g.cesta[0], g.cesta[1] + 4 + s.Peso * kF, { color: 'interaccion' });
        tz.compuesto([{ t: '(M + m', f: 'sim', tam: 14, color: 'interaccion' }, { t: 'aire', f: 'simRecta', tam: 9.5, dy: 3, color: 'interaccion' }, { t: ')g', f: 'sim', tam: 14, color: 'interaccion' }, { t: ' = ' + conPrefijo(s.Peso, 'N', 4), f: 'num', tam: 11.5, color: 'texto-2' }], g.cesta[0] + 10, g.cesta[1] + 4 + s.Peso * kF - 4, {});
      }
      if (capas.cotas && z > 0.5) {
        if (v.Y(0) < tz.h - 60) tz.cota([-R * 1.6, z], [-R * 1.6, 0], { desplazamiento: 10, texto: [{ t: 'z', f: 'sim', tam: 14 }, { t: ` = ${fmt(z, 3)} m`, f: 'num', tam: 11 }] });
        else tz.compuesto([{ t: 'z', f: 'sim', tam: 14 }, { t: ` = ${fmt(z, 3)} m sobre el suelo`, f: 'num', tam: 11.5, color: 'texto-2' }], g.cesta[0] - 30, g.cesta[1] + 22, { alinear: 'right' });
      }
      if (capas.instrumentos) tz.ficha(g.centro[0] + g.r + 70, g.centro[1] - 40, [[{ t: 'Aire de dentro', f: 'ui', tam: 11.5 }],
        [{ t: 'T', f: 'sim', tam: 13, color: 'termico' }, { t: ' = ' + cantidad(s.T, 'K', 4), f: 'num', tam: 11.5 }],
        [{ t: 'ρ', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(s.rhoIn, 'kg/m³', 4), f: 'num', tam: 11.5 }],
        [{ t: 'ρ', f: 'sim', tam: 13, color: 'texto-3' }, { t: 'fuera', f: 'simRecta', tam: 9, dy: 3, color: 'texto-3' }, { t: ' = ' + cantidad(s.rhoExt, 'kg/m³', 4), f: 'num', tam: 11.5 }]]);
      if (sel === 'globo') tz.seleccionCaja(...g.caja);
    } else {
      // Habitación: caja rígida con una rendija por la que sale el aire
      const L = Math.cbrt(e.V), [X, Y, W, H] = tz.rectPx(0, 0, L, L);
      tz.superficie([[-L * 0.6, 0], [L * 1.6, 0]]);
      tz.termoCaja(0, 0, L, L, { tipo: 'conductora', grueso: hover === 'recinto' });
      // Rendija en la pared derecha
      tz.ctx.save(); tz.ctx.fillStyle = tz.t.lienzo; tz.ctx.fillRect(X + W - 3, Y + H * 0.42, 6, H * 0.12); tz.ctx.restore();
      if (capas.moleculas) tz.moleculas({ x0: 0, x1: L, y0: 0, y1: L }, Termo.posicionesMoleculas(MOL.slice(0, Math.round(140 * s.n / SIM.n0)), s.fx, s.fy * 0.3));
      tz.calentador(L * 0.4, L * 0.6, 0.06 * L, 0, { grueso: hover === 'calentador' });
      if (cal && s.Fq > 0 && capas.vectores && $('#m-q').checked) { const Yc = v.Y(0.06 * L) - 10; for (const dx of [0.45, 0.5, 0.55]) tz.flechaCalor(v.X(L * dx), Yc, v.X(L * dx), Yc - 26); tz.etiquetaMagnitud(v.X(L * 0.62), Yc - 14, { simbolo: 'Φ', sub: 'cal', subRecto: true, valor: s.Fq, unidad: 'W', color: 'termico', prefijo: true }); }
      // Aire que sale por la rendija
      const k0 = Math.max(0, Math.round(t / SIM.muestra) - 4), dm = (s.mSale - SIM.muestras[k0].mSale);
      if (dm > 1e-6) { const Yr = Y + H * 0.48; tz.flechaPx(X + W + 4, Yr, X + W + 34, Yr, { color: 'texto-2', grosor: 1.5 }); tz.texto('aire', X + W + 40, Yr + 4, { tam: 11.5, color: 'texto-2', halo: true }); }
      if (capas.instrumentos) tz.ficha(X + W + 24, Y + 8, [[{ t: 'Habitación', f: 'ui', tam: 11.5 }],
        [{ t: 'T', f: 'sim', tam: 13, color: 'termico' }, { t: ' = ' + cantidad(s.T, 'K', 4), f: 'num', tam: 11.5 }],
        [{ t: 'm', f: 'sim', tam: 13 }, { t: 'aire', f: 'simRecta', tam: 9, dy: 3 }, { t: ' = ' + cantidad(s.m, 'kg', 4), f: 'num', tam: 11.5 }],
        [{ t: 'm', f: 'sim', tam: 13 }, { t: 'sale', f: 'simRecta', tam: 9, dy: 3 }, { t: ' = ' + cantidad(s.mSale, 'kg', 4), f: 'num', tam: 11.5 }]]);
      if (sel === 'recinto') tz.seleccionCaja(X, Y, W, H);
    }
    tz.compuesto([{ t: 'Atmósfera   ', f: 'ui', tam: 11.5, color: 'texto-3' }, { t: 'P', f: 'sim', tam: 14 }, { t: '0', f: 'simRecta', tam: 9.5, dy: 3 }, { t: ' = ' + cantidad(e.P0 / 1e3, 'kPa', 4), f: 'num', tam: 11.5, color: 'texto-2' }, { t: '   ', f: 'ui', tam: 11.5 }, { t: 'T', f: 'sim', tam: 13, color: 'termico' }, { t: '0', f: 'simRecta', tam: 9, dy: 3, color: 'termico' }, { t: ' = ' + cantidad(e.T0, 'K', 4), f: 'num', tam: 11.5, color: 'texto-2' }], 16, 62, {});
    const rec = SIM.eventos.filter(x => x.t <= t + 1e-9 && t - x.t < 3).pop();
    if (rec) tz.ficha(16, 76, [[{ t: rec.nombre, f: 'ui', tam: 11.5 }], [{ t: 't', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(rec.t, 's'), f: 'num', tam: 11.5 }, ...(rec.T ? [{ t: '   T', f: 'sim', tam: 13, color: 'termico' }, { t: ' = ' + cantidad(rec.T, 'K', 4), f: 'num', tam: 11.5 }] : [])]]);
    tz.barraEscala(16, tz.h - 56);
  }

  // ---------------------------------------------------------------------
  // Burbuja en una columna de líquido
  // ---------------------------------------------------------------------
  function encuadrarBurbuja() { const d = SIM.e.prof; tz.vista.encuadrar({ x0: -d * 0.55, x1: d * 0.75, y0: -d * 1.06, y1: d * 0.1 }, { x: 0, y: 40, w: tz.w, h: tz.h - 80 }, 36); }
  function dibujarBurbuja() {
    const s = estado(t), v = tz.vista, e = SIM.e, d = e.prof, a = d * 0.16;
    tz.limpiar(); tz.cuadricula();
    tz.superficie([[-a, 0.02 * d], [-a, -d], [a, -d], [a, 0.02 * d]]);
    const [X, Y] = v.P([-a, 0]), [X2, Y2] = v.P([a, -d]);
    tz.fluidoPx(X + 1, X2 - 1, Y, Y2 - 1);
    // Profundidades cada 10 m
    for (let z = 10; z < d + 1e-9; z += 10) { const Yz = v.Y(-z); tz.lineaPx([[X2 + 2, Yz], [X2 + 8, Yz]], { color: 'texto-3', grosor: 1 }); tz.texto(`${fmt(z, 2)} m`, X2 + 12, Yz + 4, { fuente: 'num', tam: 11, color: 'texto-3' }); }
    // Burbuja (tamaño exagerado: radio ∝ ∛V)
    const r = 7 * Math.cbrt(s.V / e.V0), [Xb, Yb] = v.P([0, -s.z]);
    tz.termoBurbuja(Xb, Yb, r, { grueso: hover === 'burbuja' });
    if (sel === 'burbuja') tz.seleccionCirculo(Xb, Yb, r + 5);
    if (capas.instrumentos) tz.ficha(Xb + r + 18, Yb - 30, [[{ t: 'Burbuja (tamaño exagerado)', f: 'ui', tam: 11.5 }],
      [{ t: 'V', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(s.V * 1e6, 'cm³', 4), f: 'num', tam: 11.5 }],
      [{ t: 'P', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(s.P / 1e3, 'kPa', 4), f: 'num', tam: 11.5 }],
      [{ t: 'T', f: 'sim', tam: 13, color: 'termico' }, { t: ' = ' + cantidad(s.T - 273.15, '°C', 3), f: 'num', tam: 11.5 }]], { ancla: [Xb + r + 2, Yb] });
    if (capas.cotas && s.z > 0.5) tz.cota([-a * 0.55, 0], [-a * 0.55, -s.z], { desplazamiento: 10, texto: [{ t: 'd', f: 'sim', tam: 14 }, { t: ` = ${fmt(s.z, 3)} m`, f: 'num', tam: 11 }] });
    tz.compuesto([{ t: 'Superficie   ', f: 'ui', tam: 11.5, color: 'texto-3' }, { t: 'P', f: 'sim', tam: 14 }, { t: '0', f: 'simRecta', tam: 9.5, dy: 3 }, { t: ' = ' + cantidad(e.P0 / 1e3, 'kPa', 4), f: 'num', tam: 11.5, color: 'texto-2' }, { t: '   T = ' + cantidad(e.Tsup - 273.15, '°C', 3), f: 'num', tam: 11.5, color: 'texto-2' }], X - 4, Y - 12, {});
    tz.compuesto([{ t: 'Fondo   ', f: 'ui', tam: 11.5, color: 'texto-3' }, { t: 'T = ' + cantidad(e.Tfondo - 273.15, '°C', 3), f: 'num', tam: 11.5, color: 'texto-2' }], X2 + 12, Y2 + 18, {});
    const rec = SIM.eventos.find(x => x.t <= t + 1e-9 && t - x.t < 4);
    if (rec) { const [ax, ay] = tz.eventoAnillo([0, 0]); tz.ficha(ax + 14, ay - 50, [[{ t: rec.nombre, f: 'ui', tam: 11.5 }], [{ t: 't', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(rec.t, 's'), f: 'num', tam: 11.5 }]], { ancla: [ax + 5, ay - 5] }); }
  }

  // Objeto bajo el cursor (px de pantalla)
  function objetoEn(x, y) {
    const ins = instrumentoEn(x, y); if (ins) return ins.id;
    if (!SIM) return null;
    const v = tz.vista;
    if (MONT === 'recipientes') {
      const w = [v.mx(x), v.my(y)], rects = layoutRec(estado(t));
      for (let j = 0; j < rects.length - 1; j++) { const a = rects[j], b2 = rects[j + 1], sp = REC.e.separadores[j]; if (w[1] >= a.y0 && w[1] <= a.y1 && w[0] >= a.x1 - 0.02 && w[0] <= (sp.tipo === 'valvula' ? b2.x0 : a.x1 + 0.02)) return 's' + j; }
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i], c = REC.e.compartimientos[i];
        if (w[0] < r.x0 || w[0] > r.x1 || w[1] < r.y0 - 0.06 || w[1] > r.y1) continue;
        if (w[1] < r.y0) return (c.Gb ?? 0) > 0 ? 'b' + i : 'r' + i;
        return (c.Fc ?? 0) > 0 && w[1] < r.y0 + 0.05 ? 'c' + i : 'r' + i;
      }
      return null;
    }
    if (MONT === 'abierto') {
      const s = estado(t), w = [v.mx(x), v.my(y)];
      if (esGlobo()) { const R = radioGlobo(); return w[0] > -R * 1.1 && w[0] < R * 1.1 && w[1] > s.z && w[1] < s.z + 3 * R ? 'globo' : null; }
      const L = Math.cbrt(SIM.e.V); return w[0] > 0 && w[0] < L && w[1] > 0 && w[1] < L ? 'recinto' : null;
    }
    if (MONT === 'burbuja') { const s = estado(t), [Xb, Yb] = v.P([0, -s.z]); return Math.hypot(x - Xb, y - Yb) < 14 ? 'burbuja' : null; }
    const s = estado(t), fl = banderas(guion, t), { R, Rt, xc, anchoPesa } = geo(), hp = s.h, ySup = hp + GEO.ep;
    if (girado()) {
      // Al marco del cilindro: se deshace el giro
      const [Ox, Oy] = v.P([0, 0]), c = Math.cos(-s.ang * RAD), sn = Math.sin(-s.ang * RAD);
      const X = Ox + (x - Ox) * c - (y - Oy) * sn, Y = Oy + (x - Ox) * sn + (y - Oy) * c;
      x = X; y = Y;
    }
    const dentro = (x0, y0, x1, y1, m = 0) => { const [X, Y, W, H] = tz.rectPx(x0, y0, x1, y1); return x >= X - m && x <= X + W + m && y >= Y - m && y <= Y + H + m; };
    if (hayPesa() && dentro(-anchoPesa / 2, ySup, anchoPesa / 2, ySup + GEO.hPesa, 3)) return 'pesa';
    if (dentro(-R, hp, R, ySup, 2)) return 'embolo';
    if (hayCal() && dentro(-xc, 0, xc, GEO.hCal, 8)) return 'calentador';
    const ap = tz.anchoPared(fl.adiab ? 'adiabatica' : 'conductora'), XL = v.X(-R), XR = v.X(R);
    if (y >= v.Y(GEO.Hc) - 4 && y <= v.Y(0) && ((x >= XL - ap - 5 && x <= XL + 5) || (x >= XR - 5 && x <= XR + ap + 5))) return 'paredes';
    if (dentro(-R, 0, R, hp)) return 'gas';
    if (!girado() && dentro(-Rt, 0, Rt, GEO.nivel)) return 'bano';
    return null;
  }

  // ---------------------------------------------------------------------
  // Escena propia: lo que se monta con la paleta (termodinamica-montaje.js).
  // Una escena del catálogo se convierte en propia al colocar, quitar o
  // arrastrar un objeto; los instrumentos se pueden poner en cualquiera.
  // ---------------------------------------------------------------------
  /** @type {any} */ let MONTAJE = null;     // montaje de la escena propia (null: escena del catálogo)
  /** @type {any[]} */ let INSTR = [];        // instrumentos colocados
  let herramienta = null, arrastre = null, trazo = null;
  const ULT = { globo: null, zonas: [] };     // geometría dibujada que necesita el ratón
  const INSTRUMENTOS = ['termometro', 'manometro', 'regla', 'cronometro'];
  const NOMBRE_HERR = {
    cilindro: 'Cilindro', recipiente: 'Recipiente', embolo: 'Émbolo', tabique: 'Tabique', valvula: 'Válvula', pesa: 'Pesa', calentador: 'Calentador', bano: 'Baño térmico',
    gas: 'Gas', resorte: 'Resorte', globo: 'Globo', columna: 'Columna de líquido', termometro: 'Termómetro', manometro: 'Manómetro', regla: 'Regla', cronometro: 'Cronómetro',
  };
  const PISTA_HERR = {
    cilindro: 'clic en el lienzo', recipiente: 'clic donde va en la fila de recipientes', embolo: 'clic en el hueco entre dos recipientes', tabique: 'clic en el hueco entre dos recipientes',
    valvula: 'clic en el hueco entre dos recipientes', pesa: 'clic sobre el cilindro', calentador: 'clic sobre el cilindro o un recipiente', bano: 'clic sobre el cilindro o un recipiente',
    gas: 'clic sobre un recipiente vacío', globo: 'clic en el lienzo', columna: 'clic en el lienzo', termometro: 'clic en el gas que quieres medir', manometro: 'clic en el gas que quieres medir',
    regla: 'arrastra de un extremo al otro', cronometro: 'clic donde va',
  };
  const FEMENINO = new Set(['pesa', 'valvula', 'columna', 'regla']);
  const participio = (h, raiz) => `${NOMBRE_HERR[h]} ${raiz}${FEMENINO.has(h) ? 'a' : 'o'}`;
  const ICONO_INSTR = { termometro: 'n-termometro', manometro: 'n-manometro', regla: 'n-regla', cronometro: 'n-cronometro' };
  const cilM = () => (MONTAJE ? MONTAJE.objetos.find(o => o.tipo === 'cilindro') : null);
  const recM = () => (MONTAJE ? MONTAJE.objetos.filter(o => o.tipo === 'recipiente') : []);
  const esInstr = s => /^i\d+$/.test(String(s));

  /** Pone un montaje propio como escena (sin simular). */
  function ponerMontaje(m, titulo) {
    MONTAJE = copia(m); ESC = escenaLab(MONTAJE, titulo || 'Escena propia'); MONT = ESC.montaje; DUR = ESC.duracion; VAR = {};
    if (MONT === 'cilindro') { GEO = geoDe(ESC); H_MAX = GEO.yTope - GEO.ep; especie = ESC.especie || 'mono'; }
    lt.duracion = DUR; ponerTitulo(ESC, 'Laboratorio de gases');
  }
  /** Montaje de la escena actual: el propio o el de la escena del catálogo (null si la paleta no lo sabe montar). */
  function montajeDeEscena() {
    if (ESC.propio) return MONTAJE;
    const m = montajeCatalogo();
    if (m) m.escena.duracion = Math.min(300, Math.max(2, Math.round(DUR)));
    return m;
  }
  function montajeCatalogo() {
    const v = vals();
    if (MONT === 'cilindro') return montajeDesdeCilindro({ ...entradaCilindro(ESC, v), especie }, { Hc: GEO.Hc, hMax: H_MAX, tanque: GEO.tanque });
    if (MONT === 'recipientes') return montajeDesdeRecipientes(ESC.construir(v), ESC.seccion || 0);
    if (MONT === 'abierto') return esGlobo() ? montajeDesdeGlobo(ESC.construir(v)) : null;
    if (MONT === 'burbuja') return montajeDesdeBurbuja(ESC.construir(v));
    return null;
  }
  // Identidad de las piezas en el montaje (el convertido numera c1, r1, r2…, g1 y l1)
  const idCilindro = () => (ESC.propio ? (cilM() || {}).id : 'c1');
  const idRecipiente = i => (ESC.propio ? (recM()[i] || {}).id : 'r' + (i + 1));
  /**
   * Cambia el montaje con fn(montaje) → {montaje, sel}. Una escena del
   * catálogo pasa a ser propia (o empieza una vacía si la paleta no sabe
   * montarla). Lo que el motor no sabe simular no se hace: se avisa por qué.
   */
  function cambiarMontaje(fn, mensaje, o = {}) {
    let base = montajeDeEscena(), titulo = ESC.propio ? ESC.titulo : `${ESC.titulo} (modificada)`, nueva = false;
    if (!base) { base = montajeLabVacio(); titulo = 'Escena propia'; nueva = true; }
    let r;
    try { r = fn(base); } catch (e) { avisar(e.message); return false; }
    const firma = firmaRecipientes(base), eraPropia = !!ESC.propio;
    guardarHistorial();
    if (nueva) guion = [];
    ponerMontaje(r.montaje, titulo);
    guion = guionValidoLab(MONTAJE, guion.filter(a => a.t <= DUR + 1e-9), firma);
    guionPropio = true;
    if (r.sel) sel = selPantalla(r.sel);
    if (o.encuadrar !== false) { encuadreHecho = false; vistaManual = false; }
    construirVariables(); recalcular(); inspector();
    if (o.encuadrar !== false) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); todo(); }
    if (mensaje) avisar((typeof mensaje === 'function' ? mensaje(r) : mensaje) + (eraPropia ? '' : nueva ? ' · escena propia nueva' : ' · la escena pasa a ser propia'));
    return true;
  }
  /** Selección del montaje → la de la pantalla (cilindro, gas, r0, c0, g0, b0, s0, globo…). */
  function selPantalla(ms) {
    if (ms === 'atm' || ms === 'escena') return ms;
    if (/^sep:\d+$/.test(ms)) return 's' + ms.slice(4);
    const [id, parte] = ms.split('/'), o = MONTAJE.objetos.find(x => x.id === id);
    if (!o) return 'escena';
    if (o.tipo === 'cilindro') return parte || 'cilindro';
    if (o.tipo === 'recipiente') { const i = recM().indexOf(o); return ({ calentador: 'c', gas: 'g', bano: 'b' }[parte] || 'r') + i; }
    return o.tipo === 'globo' ? 'globo' : 'burbuja';
  }
  /** Selección de la pantalla → la pieza del montaje m (null si no es una pieza). */
  function selMontaje(s, m = MONTAJE) {
    if (!m) return null;
    if (s === 'atm' || s === 'escena') return s;
    const c = m.objetos.find(o => o.tipo === 'cilindro'), rs = m.objetos.filter(o => o.tipo === 'recipiente');
    if (c && (s === 'cilindro' || s === 'paredes')) return c.id;
    if (c && ['gas', 'embolo', 'pesa', 'calentador', 'bano'].includes(s)) return `${c.id}/${s}`;
    let mm = /^([rcgb])(\d+)$/.exec(s);
    if (mm && rs[+mm[2]]) { const id = rs[+mm[2]].id; return mm[1] === 'r' ? id : `${id}/${{ c: 'calentador', g: 'gas', b: 'bano' }[mm[1]]}`; }
    mm = /^s(\d+)$/.exec(s); if (mm) return 'sep:' + mm[1];
    if ((s === 'globo' || s === 'burbuja') && m.objetos[0]) return m.objetos[0].id;
    return null;
  }
  const selPorOmision = () => (ESC.propio || MONT === 'recipientes' ? 'escena' : MONT === 'cilindro' ? 'gas' : MONT === 'abierto' ? (esGlobo() ? 'globo' : 'recinto') : 'burbuja');
  function selValida(s) {
    if (esInstr(s)) return INSTR.some(o => o.id === s);
    if (ESC.propio) { const ms = selMontaje(s); return !!(ms && piezaLab(MONTAJE, ms)); }
    return true;
  }
  /** Escena propia vacía. */
  function escenaVacia() {
    guardarHistorial();
    ponerMontaje(montajeLabVacio(), 'Escena propia'); guion = []; guionPropio = true; INSTR = []; sel = 'escena';
    encuadreHecho = false; vistaManual = false; t = 0; jugando = false;
    construirVariables(); recalcular(); inspector(); encuadrar(); escala0 = tz.vista.escala; zoomTexto(); todo();
    avisar('Escena vacía: elige un objeto en la paleta y haz clic en el lienzo');
  }

  // Herramienta de la paleta
  const marcarHerr = iniciarPaleta('.panel-izq', h => ponerHerramienta(herramienta === h ? null : h));
  function ponerHerramienta(h) {
    if (h === 'resorte') { herramienta = null; marcarHerr(null); try { colocarLab(montajeLabVacio(), 'resorte'); } catch (e) { avisar(e.message); } return; }
    herramienta = h; marcarHerr(h);
    lienzo.style.cursor = h ? 'crosshair' : 'default';
    if (h) avisar(`${NOMBRE_HERR[h]}: ${PISTA_HERR[h]} · Mayús para poner varios · Esc termina`);
    dibujar();
  }
  /** Qué hay bajo el punto de colocación: objeto, hueco entre recipientes y posición en la fila. */
  function dondeLab(X, Y, w) {
    const d = { x: w[0] };
    if (!SIM) return d;
    const ob = objetoEn(X, Y);
    if (MONT === 'cilindro' && ob && !esInstr(ob)) d.obj = idCilindro();
    if (MONT === 'recipientes') {
      const rects = layoutRec(estado(t));
      let mm;
      if (ob && (mm = /^[rcgb](\d+)$/.exec(ob))) d.obj = idRecipiente(+mm[1]);
      if (ob && (mm = /^s(\d+)$/.exec(ob))) d.hueco = +mm[1];
      if (d.hueco == null && !d.obj) for (let j = 0; j < rects.length - 1; j++) if (w[0] >= rects[j].x1 - 0.03 && w[0] <= rects[j + 1].x0 + 0.03) d.hueco = j;
      d.indice = rects.filter(r => (r.x0 + r.x1) / 2 < w[0]).length;
    }
    return d;
  }
  function colocar(X, Y, ev) {
    const w = [tz.vista.mx(X), tz.vista.my(Y)], h = herramienta;
    if (INSTRUMENTOS.includes(h)) colocarInstrumento(h, w);
    else if (cambiarMontaje(m => colocarLab(m, h, dondeLab(X, Y, w)), h === 'pesa' ? `Pesa sobre el émbolo en t = ${cantidad(t, 's')}` : h === 'calentador' ? `Calentador colocado: enciéndelo en Acciones${MONT === 'cilindro' || (MONTAJE && MONTAJE.objetos.some(o => o.tipo === 'cilindro')) ? ' (tecla C)' : ''}` : participio(h, 'colocad'), { encuadrar: !['pesa', 'calentador', 'bano', 'gas', 'embolo', 'tabique', 'valvula'].includes(h) }) && h === 'pesa') {
      // La pesa se pone sobre el émbolo en este instante (una acción más del guion)
      guion = guion.filter(a => !(a.tipo === 'pesa' && Math.abs(a.t - t) < 1e-9)); guion.push({ t, tipo: 'pesa', valor: true }); guion.sort((p, q) => p.t - q.t);
      recalcular(); inspector();
    }
    if (!ev.shiftKey) ponerHerramienta(null);
  }
  function colocarInstrumento(tipo, w, b) {
    const redondo = p => p.map(x => Number(x.toPrecision(5)));
    const donde = tipo === 'regla' ? { a: redondo(w), b: redondo(b || [w[0], w[1] + 120 / tz.vista.escala]) } : tipo === 'cronometro' ? { x: w[0], y: w[1] } : regionEn(w);
    let o;
    try { o = nuevoInstrumento(INSTR, tipo, donde); } catch (e) { avisar(e.message); return; }
    guardarHistorial(); INSTR.push(o); sel = o.id;
    inspector(); todo(); guardarAuto();
    const L = SIM && (tipo === 'termometro' || tipo === 'manometro') ? lecturaInstr(o, estado(t)) : null;
    avisar(`${participio(tipo, 'colocad')}${L ? ` en ${L.donde}` : ''}`);
  }
  function guardarAuto() { if (autoguardar) autoguardado.guardar('termodinamica', escenaActual()); }
  /** Quita lo seleccionado (Supr): un instrumento o una pieza del montaje. */
  function quitarSeleccion() {
    if (esInstr(sel)) {
      const i = INSTR.findIndex(o => o.id === sel); if (i < 0) return;
      guardarHistorial(); const tipo = INSTR[i].tipo; INSTR.splice(i, 1); sel = selPorOmision();
      inspector(); todo(); guardarAuto(); avisar(participio(tipo, 'quitad')); return;
    }
    const ms = selMontaje(sel, montajeDeEscena());
    if (!ms || ms === 'escena') { avisar('Selecciona en el lienzo o en el árbol lo que quieres quitar'); return; }
    const p = piezaLab(montajeDeEscena(), ms);
    cambiarMontaje(m => quitarLab(m, ms), `Se quita: ${p ? p.nombre.toLowerCase() : 'el objeto'}`, { encuadrar: !/\//.test(ms) });
  }

  // Instrumentos: regiones de gas, lecturas y dibujo
  const alLocal = (ang, [x, y]) => { const c = Math.cos(ang * RAD), s2 = Math.sin(ang * RAD); return [x * c - y * s2, x * s2 + y * c]; };
  /** Regiones de gas en t (mundo): id, rectángulo y si está en el marco girado del cilindro. */
  function regiones(s) {
    if (!SIM) return [];
    if (MONT === 'cilindro') return [{ id: 'gas', r: [-SIM.Rcil, 0, SIM.Rcil, s.h], local: girado() }];
    if (MONT === 'recipientes') return layoutRec(s).map((q, i) => ({ id: 'r' + i, r: [q.x0, q.y0, q.x1, q.y1] }));
    if (MONT === 'abierto' && esGlobo() && ULT.globo) { const g = ULT.globo, v = tz.vista; return [{ id: 'globo', r: [v.mx(g.centro[0] - g.r), v.my(g.centro[1] + g.r), v.mx(g.centro[0] + g.r), v.my(g.centro[1] - g.r)] }]; }
    if (MONT === 'abierto' && !esGlobo()) { const L = Math.cbrt(SIM.e.V); return [{ id: 'recinto', r: [0, 0, L, L] }]; }
    return [];
  }
  /** Ancla de un instrumento soltado en w: la región de gas que lo contiene (u, w relativos) o el punto libre. */
  function regionEn(w) {
    const s = SIM ? estado(t) : null;
    for (const g of s ? regiones(s) : []) {
      const p = g.local ? alLocal(s.ang, w) : w, [x0, y0, x1, y1] = g.r;
      if (p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1) return { en: g.id, u: (p[0] - x0) / ((x1 - x0) || 1), w: (p[1] - y0) / ((y1 - y0) || 1) };
    }
    return { x: w[0], y: w[1] };
  }
  function puntoInstr(o, s) {
    if (!o.en) return [o.x, o.y];
    const g = regiones(s).find(q => q.id === o.en); if (!g) return null;
    const p = [g.r[0] + o.u * (g.r[2] - g.r[0]), g.r[1] + o.w * (g.r[3] - g.r[1])];
    return g.local ? alMundo(s.ang, p) : p;
  }
  /** Presión, temperatura y lugar que mide un termómetro o un manómetro en t. */
  function lecturaInstr(o, s) {
    const p = puntoInstr(o, s); if (!p) return null;
    if (o.en === 'gas') return { P: s.P, T: s.T, donde: 'el gas', corto: 'gas' };
    if (/^r\d$/.test(o.en || '')) { const i = +o.en.slice(1); return { P: s.P[i], T: s.n[i] > 1e-9 ? s.T[i] : NaN, donde: `el recipiente ${REC.nombres[i]}`, corto: REC.nombres[i] }; }
    if (o.en === 'globo') return { P: s.P, T: s.T, donde: 'el aire del globo', corto: 'globo' };
    if (o.en === 'recinto') return { P: SIM.e.P0, T: s.T, donde: 'la habitación', corto: 'habitación' };
    const [x, y] = p, atm = MONTAJE ? MONTAJE.atm : { P0: 101.325, T0: 300 };
    if (MONT === 'cilindro') {
      if (GEO.tanque && !girado() && Math.abs(x) <= geo().Rt && y >= 0 && y <= GEO.nivel) return { P: SIM.P0 + 1000 * SIM.g * (GEO.nivel - y), T: SIM.T0, donde: 'el agua del baño', corto: 'baño' };
      return { P: SIM.P0, T: ESC.propio ? atm.T0 : SIM.T0, donde: 'el aire', corto: 'aire' };
    }
    if (MONT === 'burbuja') {
      const e = SIM.e, a = e.prof * 0.16;
      if (Math.abs(x) <= a && y <= 0 && y >= -e.prof) { const z = -y; return { P: e.P0 + e.rho * e.g * z, T: e.Tsup + (e.Tfondo - e.Tsup) * z / e.prof, donde: `el agua a ${fmt(z, 3)} m`, corto: 'agua' }; }
      return { P: e.P0, T: e.Tsup, donde: 'el aire', corto: 'aire' };
    }
    if (MONT === 'abierto') { const e = SIM.e; return { P: e.P0 * Math.exp(-Math.max(0, y) / (e.H || Infinity)), T: e.T0, donde: 'el aire', corto: 'aire' }; }
    if (MONT === 'recipientes') {
      const rects = layoutRec(s);
      for (let i = 0; i < rects.length; i++) { const c = REC.e.compartimientos[i], r = rects[i]; if ((c.Gb ?? 0) > 0 && x >= r.x0 && x <= r.x1 && y >= 0 && y < r.y0) return { P: atm.P0 * 1e3, T: c.Tb, donde: `el baño de ${REC.nombres[i]}`, corto: 'baño' }; }
    }
    return { P: atm.P0 * 1e3, T: atm.T0, donde: 'el aire', corto: 'aire' };
  }
  /** Ancho en px de una ficha (el mismo cálculo que Trazo.ficha). */
  function anchoFicha(lineas) {
    const c = tz.ctx; let a = 0; c.save();
    for (const segs of lineas) { let w = 0; for (const sg of segs) { c.font = tz._fuente(sg.f, sg.tam || 11.5); w += c.measureText(sg.t).width; } a = Math.max(a, w); }
    c.restore(); return a + 16;
  }
  function dibujarInstrumentos() {
    ULT.zonas = [];
    if (!capas.instrumentos) return;
    const v = tz.vista, s = SIM ? estado(t) : null;
    // Termómetros y manómetros: la sonda donde mide y su ficha fuera de la escena,
    // con una línea guía: en una columna a la derecha del cilindro, en una fila
    // bajo el suelo con recipientes o junto al borde derecho del lienzo
    const fila = MONT === 'recipientes', orden = s ? INSTR.filter(o => o.tipo === 'termometro' || o.tipo === 'manometro').map(o => [o, puntoInstr(o, s)]).filter(q => q[1]) : [];
    if (fila) orden.sort((a, b) => a[1][0] - b[1][0]);
    let cx = fila ? 16 : MONT === 'cilindro' && !girado() ? v.X(geo().Rt) + 118 : tz.w - 210, cy = fila ? v.Y(0) + 44 : 96;
    const ranura = new Map();
    for (const [o] of orden) {
      const L = lecturaInstr(o, s), termo = o.tipo === 'termometro', W = anchoFicha(lineasInstr(o, L)), alto = termo ? 44 : 34;
      if (fila) { const X = v.X(puntoInstr(o, s)[0]), gx = Math.min(tz.w - 8 - W - 18, Math.max(cx + 12, X - 10)); ranura.set(o.id, [gx, cy]); cx = gx + 18 + W + 14; }
      else { const gx = Math.min(cx + 12, tz.w - 8 - W - 18); ranura.set(o.id, [gx, cy]); cy += alto + 10; }
    }
    for (const o of INSTR) {
      const grueso = hover === o.id, elegido = sel === o.id;
      if (o.tipo === 'regla') {
        const [xa, ya] = v.P(o.a), [xb, yb] = v.P(o.b), L = Math.hypot(xb - xa, yb - ya);
        if (L < 2) continue;
        const ux = (xb - xa) / L, uy = (yb - ya) / L, nx = -uy, ny = ux, Lm = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]);
        tz.lineaPx([[xa, ya], [xb, yb]], { color: 'texto-2', grosor: 1.5 + (grueso ? 0.5 : 0) });
        for (const [x, y] of [[xa, ya], [xb, yb]]) tz.lineaPx([[x - nx * 6, y - ny * 6], [x + nx * 6, y + ny * 6]], { color: 'texto-2', grosor: 1.5 });
        const paso = Volta.pasoAgradable(Lm / 8), k = paso * v.escala;
        if (k > 5) for (let d = k; d < L - 2; d += k) tz.lineaPx([[xa + ux * d, ya + uy * d], [xa + ux * d + nx * 3.5, ya + uy * d + ny * 3.5]], { color: 'texto-3', grosor: 1 });
        // El largo, debajo de una regla tumbada y a la izquierda de una de pie
        const tumbada = Math.abs(ny) > Math.abs(nx), lado = tumbada ? (ny > 0 ? 1 : -1) : (nx < 0 ? 1 : -1);
        tz.compuesto([{ t: cantidad(Lm, 'm', 4), f: 'num', tam: 11.5 }], (xa + xb) / 2 + nx * 14 * lado, (ya + yb) / 2 + ny * 14 * lado + (tumbada ? 8 : 4), { alinear: tumbada ? 'center' : 'right', color: 'texto-2', halo: true });
        if (elegido) { tz.asa(xa, ya); tz.asa(xb, yb); }
        ULT.zonas.push({ id: o.id, parte: 'a', c: [xa, ya, 8] }, { id: o.id, parte: 'b', c: [xb, yb, 8] }, { id: o.id, parte: 'todo', seg: [xa, ya, xb, yb] });
        continue;
      }
      if (o.tipo === 'cronometro') {
        const [X, Y] = v.P([o.x, o.y]), tc = lecturaCronometro(o, t), lin = [[{ t: 'Cronómetro', f: 'ui', tam: 11.5 }], [{ t: 't', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(tc, 's', 4), f: 'num', tam: 11.5 }]];
        tz.termoCronometro(X, Y, tc / 60, { grueso });
        const W = anchoFicha(lin), izq = X + 18 + W > tz.w - 8, fx = izq ? X - 18 - W : X + 18;
        const f = tz.ficha(fx, Y - 18, lin);
        if (elegido) tz.seleccionCirculo(X, Y - 1, 15);
        ULT.zonas.push({ id: o.id, parte: 'todo', c: [X, Y, 14] }, { id: o.id, parte: 'todo', r: [fx, Y - 18, f.w, f.h] });
        continue;
      }
      if (!s) continue;
      const p = puntoInstr(o, s); if (!p) continue;
      const L = lecturaInstr(o, s), [X, Y] = v.P(p), termo = o.tipo === 'termometro', lin = lineasInstr(o, L);
      const [gx, gy0] = ranura.get(o.id), gy = gy0 + (termo ? 34 : 14), fx = gx + 16, fy = gy0;
      // Línea guía de la sonda al instrumento (en arrastre, la sonda sigue al ratón)
      tz.lineaPx([[X, Y], [gx + (X > gx ? 4 : -4), termo ? gy - 6 : gy]], { color: 'linea-fuerte', grosor: 1 });
      tz.sondaTermica(X, Y);
      if (termo) tz.termometro(gx, gy, Number.isFinite(L.T) ? (L.T - 200) / 400 : 0, { grueso });
      else tz.manometro(gx, gy, L.P / 300e3, { grueso });
      const f = tz.ficha(fx, fy, lin);
      if (elegido) { tz.seleccionCirculo(X, Y, 7); tz.seleccionCaja(gx - 10, fy, f.w + 26, Math.max(f.h, termo ? 40 : 26)); }
      ULT.zonas.push({ id: o.id, parte: 'todo', c: [X, Y, 8] }, { id: o.id, parte: 'todo', r: [gx - 12, fy, f.w + 28, Math.max(f.h, termo ? 40 : 26)] });
    }
  }
  /** Ficha de un termómetro o un manómetro: lugar y lectura. */
  function lineasInstr(o, L) {
    const termo = o.tipo === 'termometro';
    return [[{ t: `${termo ? 'Termómetro' : 'Manómetro'} · ${L.corto}`, f: 'ui', tam: 11.5 }],
      termo ? [{ t: 'T', f: 'sim', tam: 13, color: 'termico' }, { t: ' = ' + (Number.isFinite(L.T) ? cantidad(L.T, 'K', 4) : '—'), f: 'num', tam: 11.5 }]
        : [{ t: 'P', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(L.P / 1e3, 'kPa', 4), f: 'num', tam: 11.5 }]];
  }
  /** Instrumento bajo el cursor (px): {id, parte}. */
  function instrumentoEn(X, Y) {
    for (let k = ULT.zonas.length - 1; k >= 0; k--) {
      const z = ULT.zonas[k];
      if (z.c && Math.hypot(X - z.c[0], Y - z.c[1]) <= z.c[2]) return z;
      if (z.r && X >= z.r[0] && X <= z.r[0] + z.r[2] && Y >= z.r[1] && Y <= z.r[1] + z.r[3]) return z;
      if (z.seg) { const [a, b, c, d] = z.seg, dx = c - a, dy = d - b, L2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((X - a) * dx + (Y - b) * dy) / L2)); if (Math.hypot(a + u * dx - X, b + u * dy - Y) < 6) return z; }
    }
    return null;
  }
  function dibujarVacio() {
    tz.limpiar(); tz.cuadricula();
    tz.superficie([[tz.vista.mx(40), 0], [tz.vista.mx(tz.w - 40), 0]]);
    const X = tz.w / 2, Y = tz.h / 2 - 30;
    tz.texto('Escena vacía', X, Y, { tam: 14, color: 'texto-2', alinear: 'center', halo: true });
    tz.texto('Elige un objeto en la paleta y haz clic en el lienzo:', X, Y + 22, { tam: 12, color: 'texto-3', alinear: 'center', halo: true });
    tz.texto('un cilindro, recipientes, un globo o una columna de líquido.', X, Y + 40, { tam: 12, color: 'texto-3', alinear: 'center', halo: true });
    tz.barraEscala(16, tz.h - 56);
  }
  /** Capa 10 · edición: instrumentos, regla o topes que se arrastran y pista de la herramienta. */
  function capaEdicion() {
    dibujarInstrumentos();
    const v = tz.vista;
    if (trazo) { const [xa, ya] = v.P(trazo.a), [xb, yb] = v.P(trazo.b); tz.lineaPx([[xa, ya], [xb, yb]], { color: 'texto-2', grosor: 1.5, patron: 'previsto' }); tz.ficha(xb + 10, yb - 10, [[{ t: cantidad(Math.hypot(trazo.b[0] - trazo.a[0], trazo.b[1] - trazo.a[1]), 'm', 4), f: 'num', tam: 11.5 }]]); }
    if (arrastre && arrastre.tipo === 'topes' && arrastre.y != null) {
      const R = SIM.Rcil, Y = v.Y(arrastre.y + GEO.ep);
      tz.guia([[v.X(-R) - 10, Y], [v.X(R) + 24, Y]], `Topes: ${cantidad(arrastre.y, 'm', 3)}`);
    }
    if (herramienta && cursorPx) tz.ficha(cursorPx[0] + 14, cursorPx[1] + 14, [[{ t: `${NOMBRE_HERR[herramienta]}: ${PISTA_HERR[herramienta]}`, f: 'ui', tam: 11.5 }]]);
  }

  // Inspector de una pieza del montaje o de un instrumento
  function estadoPieza(p, s) {
    const fl = MONT === 'cilindro' && SIM ? banderas(guion, t) : null, b = MONT === 'recipientes' && SIM ? banderasRec(t) : null, h = p.holder;
    const i = /^[rcgb](\d+)$/.exec(sel) ? +sel.slice(1) : -1;
    switch (p.clase) {
      case 'escena': return `${MONTAJE.objetos.length ? `${MONTAJE.objetos.length} objeto${MONTAJE.objetos.length > 1 ? 's' : ''}` : 'Vacía'} · ${fmt(DUR, 3)} s`;
      case 'atm': return `Presión y temperatura del aire de fuera`;
      case 'cilindro': return `${h.angulo ? `Inclinado ${fmt(h.angulo, 3)}°` : 'Vertical'} · paredes ${fl && fl.adiab ? 'adiabáticas' : 'conductoras'}`;
      case 'gasCil': return `Gas ideal ${h.especie === 'di' ? 'diatómico' : 'monoatómico'} · ${fmt(h.n, 3)} mol`;
      case 'emboloCil': return s ? `Cuerpo rígido · ${s.h >= H_MAX - 1e-6 ? 'en los topes' : Math.abs(s.v) > 2e-3 ? (s.v > 0 ? 'se aleja del fondo' : 'se acerca al fondo') : 'en reposo'}` : 'Cuerpo rígido';
      case 'pesa': return `Cuerpo rígido · ${fl && fl.pesa ? 'sobre el émbolo' : 'retirada'}`;
      case 'calCil': return `Resistencia · ${fl && fl.cal ? 'encendido' : 'apagado'}`;
      case 'banoCil': return `Agua a temperatura fija · ${fl && fl.adiab ? 'aislado' : 'en contacto'}`;
      case 'recipiente': return `Recipiente rígido · ${h.gas && h.gas.n > 0 ? 'con gas' : 'vacío'}`;
      case 'gasRec': return `Gas ideal · ${fmt(h.n, 3)} mol`;
      case 'calRec': return `Resistencia · ${b && i >= 0 && b.cal[i] ? 'encendido' : 'apagado'}`;
      case 'banoRec': return `Temperatura fija · ${b && i >= 0 && b.bano[i] ? 'en contacto' : 'aislado'}`;
      case 'valvula': return b ? (b.valvulas[+sel.slice(1)] ? 'Abierta' : 'Cerrada') : 'Cerrada';
      case 'tabique': return h.G > 0 ? 'Fijo · conduce calor' : 'Fijo · aislante';
      case 'emboloLibre': return 'Sin masa ni fricción';
      case 'globo': return s ? (s.enSuelo ? 'En el suelo' : `En el aire a ${fmt(s.z, 3)} m`) : 'En el suelo';
      case 'columna': return s ? `Burbuja a ${fmt(s.z, 3)} m de profundidad` : 'Agua quieta';
      default: return '';
    }
  }
  const AYUDA_PIEZA = {
    escena: 'Escena propia: coloca objetos con la paleta, arrástralos y cambia sus valores aquí. Las acciones (pesa, calentador, válvulas) se programan en la línea de tiempo.',
    recipiente: 'Arrástralo para cambiar su sitio en la fila. Una válvula, un tabique o un émbolo libre se ponen en el hueco entre dos recipientes.',
    cilindro: 'Arrastra los topes (las marcas de dentro) para cambiar su altura.',
    emboloLibre: 'Sin masa ni fricción: las presiones a los dos lados son iguales en todo momento y el trabajo de un lado lo recibe el otro.',
  };
  function objetoPropio() {
    let ms = selMontaje(sel), p = ms && piezaLab(MONTAJE, ms);
    if (!p) { sel = 'escena'; ms = 'escena'; p = piezaLab(MONTAJE, 'escena'); }
    const quitable = !['escena', 'atm', 'emboloCil'].includes(p.clase) && !(p.clase === 'gasCil') && !(p.clase === 'valvula');
    return {
      ico: p.ico, nombre: p.nombre,
      props: () => (AYUDA_PIEZA[p.clase] ? `<p class="ayuda-fila" style="margin:2px 0 8px">${AYUDA_PIEZA[p.clase]}</p>` : '') + filasParametros(PARAMS_LAB[p.clase] || [], p.holder) + (quitable ? botonQuitar() : ''),
      estado: s => estadoPieza(p, s),
      enlazar: (k, v) => cambiarMontaje(m => ({ montaje: ajustarLab(m, ms, k, v), sel: ms }), null, { encuadrar: ['A', 'V', 'S', 'Hc', 'hTopes', 'angulo', 'prof'].includes(k) }),
    };
  }
  function objetoInstrumento(o) {
    const nom = NOMBRE_HERR[o.tipo];
    return {
      ico: ICONO_INSTR[o.tipo], nombre: nom,
      props: () => (o.tipo === 'cronometro' ? filasParametros(PARAMS_INSTR.cronometro, o)
        + `<div class="fila"><span class="etq"></span><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-secundario btn-compacto" id="b-crono-0"><svg class="ico"><use href="#i-reproducir"/></svg><span>Arrancar aquí</span></button><button class="btn btn-secundario btn-compacto" id="b-crono-1"><svg class="ico"><use href="#i-pausar"/></svg><span>Parar aquí</span></button></div></div>`
        : `<p class="ayuda-fila" style="margin:2px 0 8px">${o.tipo === 'regla' ? 'Arrastra sus extremos para medir otra distancia, o la regla entera para moverla.' : 'Arrástralo hasta el gas que quieras medir; fuera de los recipientes mide el aire o el baño.'}</p>`) + botonQuitar(),
      estado: s => { if (o.tipo === 'regla') return 'Mide la distancia entre sus extremos'; if (o.tipo === 'cronometro') return o.t1 > o.t0 ? `De ${fmt(o.t0, 3)} s a ${fmt(o.t1, 3)} s` : `Desde ${fmt(o.t0, 3)} s`; const L = SIM && s ? lecturaInstr(o, s) : null; return L ? `Mide ${L.donde}` : 'Fuera de la escena'; },
      enlazar: (k, v) => { const n = copia(o); if (!ponerParametro(n, PARAMS_INSTR.cronometro, k, v)) { avisar('Ese valor no es válido'); inspector(); return; } guardarHistorial(); Object.assign(o, n); inspector(); todo(); guardarAuto(); },
    };
  }
  function lecturasInstrumento(o) {
    const s = SIM ? estado(t) : null;
    if (o.tipo === 'regla') { const dx = o.b[0] - o.a[0], dy = o.b[1] - o.a[1]; return [['<span class="sim">L</span>', Math.hypot(dx, dy), 'm'], ['Δ<span class="sim">x</span>', dx, 'm'], ['Δ<span class="sim">y</span>', dy, 'm']]; }
    if (o.tipo === 'cronometro') return [['<span class="sim">t</span>', lecturaCronometro(o, t), 's', 'Tiempo que marca|Stopwatch reading']];
    const L = s ? lecturaInstr(o, s) : null;
    if (!L) return [];
    return o.tipo === 'termometro' ? [['<span class="sim">T</span>', L.T, 'K'], ['<span class="sim">T</span>', L.T - 273.15, '°C']] : [['<span class="sim">P</span>', L.P / 1e3, 'kPa'], ['<span class="sim">P</span> − <span class="sim">P</span><sub class="r">0</sub>', (L.P - (SIM.P0 ?? SIM.e?.P0 ?? (MONTAJE ? MONTAJE.atm.P0 * 1e3 : 101325))) / 1e3, 'kPa', 'Presión manométrica|Gauge pressure']];
  }

  // ---------------------------------------------------------------------
  // Acciones (crean un evento en t) y deshacer
  // ---------------------------------------------------------------------
  const historial = [], porRehacer = [];
  const instantanea = () => ({ clave: ESC.propio ? 'propia' : ESC.clave, titulo: ESC.titulo, montaje: ESC.propio ? copia(MONTAJE) : null, instr: copia(INSTR),
    guion: guion.map(a => ({ ...a })), guionPropio, vars: vals(), motor, especie, modoValvula });
  function guardarHistorial() { historial.push(instantanea()); if (historial.length > 200) historial.shift(); porRehacer.length = 0; }
  /** Pone el estado de una instantánea (o de un archivo ya saneado) sin simular. forzar: cargar la escena aunque sea la misma. */
  function aplicarDatos(e, forzar = false) {
    if (e.montaje) ponerMontaje(e.montaje, e.titulo);
    else { if (forzar || e.clave !== ESC.clave || ESC.propio) cargarEscena(escenaPorClave(e.clave)); MONTAJE = null; }
    guion = e.guion.map(a => ({ ...a })); guionPropio = !!e.guionPropio; for (const k in e.vars) if (VAR[k]) VAR[k].val = e.vars[k]; motor = e.motor; especie = e.especie; modoValvula = e.modoValvula || 'gradual';
    INSTR = copia(e.instr || []);
    if (!selValida(sel)) sel = selPorOmision();
  }
  function restaurar(e, forzar = false) {
    aplicarDatos(e, forzar);
    construirVariables(); inspector(); recalcular();
  }
  function deshacer() { if (!historial.length) return; porRehacer.push(instantanea()); restaurar(historial.pop()); ocultarAviso(); }
  function rehacer() { if (!porRehacer.length) return; historial.push(instantanea()); restaurar(porRehacer.pop()); }

  // La historia se ramifica en t: las acciones posteriores se descartan
  function accion(tipo, valor, i) {
    guardarHistorial();
    const tt = t, descartadas = guion.filter(a => a.t > tt + 1e-9).length;
    const mismo = a => a.tipo === tipo && (i == null || a.i === i);
    const previa = guion.find(a => Math.abs(a.t - tt) < 1e-9 && mismo(a));
    guion = guion.filter(a => a.t < tt - 1e-9 || (a.t <= tt + 1e-9 && !mismo(a)));
    guionPropio = true;
    // Si sin la acción de este instante ya se llega a ese estado, la acción se anula
    let ya = false;
    if (MONT === 'cilindro') { const b = banderas(guion, tt); ya = tipo === 'pesa' ? b.pesa === valor : tipo === 'calentador' ? b.cal === valor : b.adiab === (valor === 'adiabaticas'); }
    else if (MONT === 'recipientes') { const b = banderasRec(tt); ya = (tipo === 'valvula' ? b.valvulas : tipo === 'calentador' ? b.cal : b.bano)[i] === valor; }
    else { const ult = [...guion].filter(a => a.t <= tt + 1e-9).pop(); ya = (ult ? ult.valor : false) === valor; }
    if (!ya) { guion.push(i == null ? { t: tt, tipo, valor } : { t: tt, tipo, i, valor }); guion.sort((p, q) => p.t - q.t); }
    recalcular();
    const cola = descartadas ? (descartadas > 1 ? ` · se descartan ${descartadas} acciones posteriores` : ' · se descarta 1 acción posterior') : '';
    const nombre = v2 => nombreAccion(tipo, v2, i);
    avisar((ya && previa ? `Se anula «${nombre(previa.valor)}» en t = ` : `${nombre(valor)} en t = `) + cantidad(tt, 's') + cola);
    inspector();
  }
  function nombreAccion(tipo, valor, i) {
    if (NOMBRES[tipo] && MONT === 'cilindro') return NOMBRES[tipo](valor);
    const n = REC ? REC.nombres[i] ?? '' : '';
    if (tipo === 'valvula') return valor ? 'Se abre la válvula' : 'Se cierra la válvula';
    if (tipo === 'bano') return valor ? `El recipiente ${n} toca el baño` : `El recipiente ${n} se aísla del baño`;
    if (tipo === 'calentador') return MONT === 'abierto' ? (valor ? 'Se enciende el quemador' : 'Se apaga el quemador') : valor ? `Se enciende el calentador ${n}` : `Se apaga el calentador ${n}`;
    return tipo;
  }
  const alternarPesa = () => { if (MONT === 'cilindro' && hayPesa()) accion('pesa', !banderas(guion, t).pesa); };
  const alternarCalentador = () => { if (MONT === 'cilindro') accion('calentador', !banderas(guion, t).cal); else if (MONT === 'abierto') { const ult = [...guion].filter(a => a.t <= t + 1e-9).pop(); accion('calentador', !(ult && ult.valor)); } };
  const alternarParedes = () => { if (MONT === 'cilindro') accion('paredes', banderas(guion, t).adiab ? 'conductoras' : 'adiabaticas'); };
  function cambiarMotor(mo) { if (mo === motor) return; guardarHistorial(); motor = mo; recalcular(); }
  function cambiarEspecie(es) { if (es === especie) return; guardarHistorial(); especie = es; recalcular(); inspector(); }

  let relojAviso = null;
  function avisar(txt) {
    $('#aviso-texto').textContent = txt; $('#aviso').hidden = false;
    clearTimeout(relojAviso); relojAviso = setTimeout(ocultarAviso, 5000);
  }
  function ocultarAviso() { $('#aviso').hidden = true; }
  $('#aviso-deshacer').addEventListener('click', deshacer);

  // ---------------------------------------------------------------------
  // Inspector
  // ---------------------------------------------------------------------
  const simHTML = d => `${d.sim}${d.sub ? `<sub class="r">${d.sub}</sub>` : ''}`;
  function fmtVar(d) {
    const dec = !(d.paso > 0) || d.paso >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(d.paso) - 1e-9));
    return d.val.toFixed(dec).replace('-', '−');
  }
  const campoFijo = (val, u, ayuda) => `<div class="campo"${ayuda ? ` data-ayuda="${ayuda}"` : ''}><input value="${val}" readonly tabindex="-1"><span class="u">${u}</span></div>`;
  // Campo ligado a una variable; si la escena no la tiene, el valor que usa el motor (fijo)
  const campoVar = (k, derivado, u, ayuda) => (VAR[k] ? `<div class="campo es-variable" data-ayuda="Ligado a la variable ${VAR[k].sim}${VAR[k].sub || ''}|Bound to variable"><span class="chip-var"><span class="sim">${simHTML(VAR[k])}</span></span><span class="valor-var" data-var="${k}"></span><span class="u">${VAR[k].u}</span></div>`
    : campoFijo(fmt(derivado, 4), u, ayuda || 'Fijo en esta escena|Fixed'));
  const fila = (etq, control) => `<div class="fila"><span class="etq">${etq}</span>${control}</div>`;
  const segmentado = (id, ops, actual) => `<div class="segmentado texto" id="${id}">${ops.map(([v, txt]) => `<button data-v="${v}" aria-pressed="${v === actual}">${txt}</button>`).join('')}</div>`;
  const notaHTML = () => (ESC.nota && !guionPropio ? `<p class="ayuda-fila" style="margin:2px 0 8px">${ESC.nota}</p>` : ESC.nota ? `<p class="ayuda-fila" style="margin:2px 0 8px">${ESC.nota} (Las acciones se han cambiado: el examen ya no se muestra.)</p>` : '');

  const OBJETOS_CIL = {
    gas: { ico: 'o-gas', nombre: 'Gas', props: () => notaHTML() + fila('Cantidad', campoVar('n', SIM.n, 'mol')) + fila('Especie', segmentado('p-especie', [['mono', 'Monoatómico'], ['di', 'Diatómico']], especie)),
      estado: () => `Gas ideal ${especie === 'di' ? 'diatómico' : 'monoatómico'} · ${fmt(SIM.n, 3)} mol` },
    embolo: { ico: 'o-embolo', nombre: 'Émbolo', props: () => fila('Masa', campoVar('m', SIM.m, 'kg')) + fila('Sección', campoVar('A', SIM.A * 1e4, 'cm²')) + fila('Disipación', campoVar('b', entradaCilindro(ESC, vals()).b ?? 0, 'kg/s')),
      estado: s => `Cuerpo rígido · ${s.h >= H_MAX - 1e-6 ? 'en los topes' : Math.abs(s.v) > 2e-3 ? (s.v > 0 ? 'se aleja del fondo' : 'se acerca al fondo') : 'en reposo'}` },
    pesa: { ico: 'o-pesa', nombre: 'Pesa', props: () => fila('Masa', campoVar('M', SIM.M, 'kg')),
      estado: (s, fl) => `Cuerpo rígido · ${fl.pesa ? 'sobre el émbolo' : 'retirada'}` },
    calentador: { ico: 'o-calentador', nombre: 'Calentador', props: () => fila('Potencia', campoVar('Fc', entradaCilindro(ESC, vals()).Fc, 'W', 'Potencia del calentador en esta escena|Heater power')),
      estado: (s, fl) => `Resistencia · ${fl.cal ? 'encendido' : 'apagado'}` },
    cilindro: { ico: 'o-cilindro', nombre: 'Cilindro', props: () => fila('Sección', campoVar('A', SIM.A * 1e4, 'cm²')) + fila('Altura de los topes', `<div class="campo" data-ayuda="Fija en esta escena: el émbolo se detiene en los topes|Stop height"><input value="${fmt(H_MAX, 3)}" readonly tabindex="-1"><span class="u">m</span></div>`) + fila('Conducción', campoVar('G', entradaCilindro(ESC, vals()).G, 'W/K')),
      estado: (s, fl) => `${s.ang ? `Inclinado ${fmt(s.ang, 3)}°` : 'Vertical'} · paredes ${fl.adiab ? 'adiabáticas' : 'conductoras'}` },
    bano: { ico: 'o-bano-termico', nombre: 'Baño térmico', props: () => fila('Temperatura', campoVar('T0', SIM.T0, 'K')) + fila('Conducción', campoVar('G', entradaCilindro(ESC, vals()).G, 'W/K')),
      estado: (s, fl) => `Agua a temperatura fija · ${fl.adiab ? 'aislado' : 'en contacto'}` },
  };
  function objetoActual() {
    const ins = esInstr(sel) ? INSTR.find(o => o.id === sel) : null;
    if (ins) return objetoInstrumento(ins);
    if (ESC.propio) return objetoPropio();
    if (MONT === 'cilindro') return OBJETOS_CIL[sel] || OBJETOS_CIL.gas;
    if (MONT === 'recipientes') {
      const e = REC.e;
      if (/^r\d+$/.test(sel) || /^c\d+$/.test(sel)) {
        const i = +sel.slice(1), c = e.compartimientos[i];
        return { ico: /^c/.test(sel) ? 'o-calentador' : 'o-recipiente', nombre: `Recipiente ${REC.nombres[i]}`,
          props: () => fila('Volumen inicial', campoFijo(fmt(c.V * 1e3, 4), 'L')) + fila('Gas', campoFijo(e.especies.map((q, s2) => (c.n[s2] > 0 ? `${fmt(c.n[s2], 3)} mol ${q.nombre}` : '')).filter(Boolean).join(', ') || 'vacío', ''))
            + ((c.Gb ?? 0) > 0 ? fila('Baño', campoFijo(`${fmt(c.Tb, 4)} K · G = ${fmt(c.Gb, 3)} W/K`, '')) : '') + ((c.Fc ?? 0) > 0 ? fila('Calentador', campoFijo(`${fmt(c.Fc, 3)} W${Number.isFinite(c.Tobj ?? Infinity) ? ` hasta ${fmt(c.Tobj, 4)} K` : ''}`, '')) : ''),
          estado: s => `${s.n[i] > 1e-9 ? 'Con gas' : 'Vacío'} · ${(c.Gb ?? 0) > 0 ? 'con baño' : 'aislado'}` };
      }
      if (/^s\d+$/.test(sel)) {
        const j = +sel.slice(1), sp = e.separadores[j];
        return { ico: sp.tipo === 'valvula' ? 'o-valvula' : sp.tipo === 'embolo' ? 'o-embolo' : 'o-tabique', nombre: sp.tipo === 'valvula' ? 'Válvula' : sp.tipo === 'embolo' ? 'Émbolo libre' : 'Tabique',
          props: () => (sp.tipo === 'valvula' ? fila('Tiempo', campoFijo(fmt(sp.tau ?? 0.5, 3), 's', 'Tiempo característico de la válvula|Valve time')) + fila('Al abrir', segmentado('p-modo', [['gradual', 'Gradual'], ['instantaneo', 'De golpe']], modoValvula)) : '')
            + (sp.tipo === 'embolo' ? '<p class="ayuda-fila">Sin masa ni fricción: las presiones a los dos lados son iguales en todo momento y el trabajo de un lado lo recibe el otro.</p>' : ''),
          estado: () => (sp.tipo === 'valvula' ? (banderasRec(t).valvulas[j] ? 'Abierta' : 'Cerrada') : sp.tipo === 'embolo' ? 'Se mueve con las presiones' : 'Fijo') };
      }
      return { ico: 'o-recipiente', nombre: 'Recipientes', props: () => notaHTML() + fila('Especies', campoFijo(e.especies.map(q => q.nombre).join(', '), '', `Grados de libertad: ${e.especies.map(q => `${q.nombre} f = ${q.f}`).join(', ')}|Species`)), estado: () => `${e.compartimientos.length} recipientes` };
    }
    if (MONT === 'abierto') {
      const e = SIM.e;
      return { ico: esGlobo() ? 'o-globo' : 'o-recipiente', nombre: esGlobo() ? 'Globo aerostático' : 'Habitación',
        props: () => notaHTML() + fila('Volumen', campoFijo(fmt(e.V, 4), 'm³')) + (esGlobo() ? fila('Masa', campoFijo(fmt(e.M, 4), 'kg', 'Estructura, sin el aire de dentro|Mass')) : '') + fila('Masa molar', campoFijo(fmt(e.Mm * 1e3, 4), 'g/mol')),
        estado: s => (esGlobo() ? (s.enSuelo ? 'En el suelo' : `En el aire a ${fmt(s.z, 3)} m`) : 'Abierta al exterior') };
    }
    return { ico: 'o-columna-liquido', nombre: 'Burbuja', props: () => notaHTML() + fila('Volumen inicial', campoFijo(fmt(SIM.e.V0 * 1e6, 4), 'cm³')) + fila('Profundidad', campoFijo(fmt(SIM.e.prof, 3), 'm')),
      estado: s => `A ${fmt(s.z, 3)} m de profundidad` };
  }
  function inspector() {
    const o = objetoActual();
    $('#insp-ico').setAttribute('href', '#' + o.ico);
    $('#insp-nombre').textContent = o.nombre;
    $('#propiedades').innerHTML = o.props();
    if (o.enlazar) enlazarParametros($('#propiedades'), o.enlazar);
    const bq = $('#b-quitar-pieza'); if (bq) bq.addEventListener('click', quitarSeleccion);
    for (const k of [0, 1]) { const b = $('#b-crono-' + k); if (b) b.addEventListener('click', () => { const ins = INSTR.find(x => x.id === sel); if (ins) o.enlazar(k ? 't1' : 't0', t); }); }
    const pe = $('#p-especie');
    if (pe) pe.addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) cambiarEspecie(b.dataset.v); });
    const pm = $('#p-modo');
    if (pm) pm.addEventListener('click', ev => { const b = ev.target.closest('button'); if (b && b.dataset.v !== modoValvula) { guardarHistorial(); modoValvula = b.dataset.v; recalcular(); inspector(); } });
    arbol(); acciones();
    document.querySelectorAll('[data-var]').forEach(e => { if (VAR[e.dataset.var]) e.textContent = fmtVar(VAR[e.dataset.var]); });
  }
  function seleccionar(s) { if (s && s !== sel) { sel = s; inspector(); todo(); } }
  function arbolPropio(nodo) {
    const m = MONTAJE, fl = MONT === 'cilindro' && SIM ? banderas(guion, t) : null;
    let h = nodo('escena', 'i-escena', 'Escena propia', m.objetos.length ? cantidad(DUR, 's', 3) : 'vacía');
    const c = cilM();
    if (c) {
      h += nodo('cilindro', 'o-cilindro', 'Cilindro', cantidad(c.A, 'cm²', 3)) + nodo('gas', 'o-gas', 'Gas', cantidad(c.gas.n, 'mol', 3)) + nodo('embolo', 'o-embolo', 'Émbolo', cantidad(c.embolo.m, 'kg', 3));
      if (c.pesa) h += nodo('pesa', 'o-pesa', 'Pesa', cantidad(c.pesa.M, 'kg', 3));
      if (c.calentador) h += nodo('calentador', 'o-calentador', 'Calentador', fl && fl.cal ? cantidad(c.calentador.Fc, 'W', 3) : 'apagado');
      if (c.bano) h += nodo('bano', 'o-bano-termico', 'Baño térmico', cantidad(c.bano.T, 'K', 3));
    }
    recM().forEach((r, i) => {
      const n = 'ABCDEFGH'[i];
      h += nodo('r' + i, 'o-recipiente', `Recipiente ${n}`, cantidad(r.V, 'L', 3));
      if (r.gas && r.gas.n > 0) h += nodo('g' + i, 'o-gas', `Gas de ${n}`, cantidad(r.gas.n, 'mol', 3));
      if (r.calentador) h += nodo('c' + i, 'o-calentador', `Calentador de ${n}`, cantidad(r.calentador.Fc, 'W', 3));
      if (r.bano) h += nodo('b' + i, 'o-bano-termico', `Baño de ${n}`, cantidad(r.bano.Tb, 'K', 3));
      const sp = m.separadores[i];
      if (sp) h += nodo('s' + i, sp.tipo === 'valvula' ? 'o-valvula' : sp.tipo === 'embolo' ? 'o-embolo' : 'o-tabique', sp.tipo === 'valvula' ? 'Válvula' : sp.tipo === 'embolo' ? 'Émbolo libre' : 'Tabique', `${n} | ${'ABCDEFGH'[i + 1]}`);
    });
    for (const o of m.objetos) {
      if (o.tipo === 'globo') h += nodo('globo', 'o-globo', 'Globo', cantidad(o.V, 'm³', 3));
      if (o.tipo === 'columna') h += nodo('burbuja', 'o-columna-liquido', 'Columna de líquido', cantidad(o.prof, 'm', 3));
    }
    h += nodo('atm', 'o-atmosfera', 'Atmósfera', cantidad(m.atm.P0, 'kPa', 4));
    return h;
  }

  function arbol() {
    const nodo = (s, ico, nom, dato = '', clase = '') => `<div class="nodo${clase}"${s ? ` data-sel="${s}" aria-selected="${sel === s}"` : ''}><svg class="ico"><use href="#${ico}"/></svg><span class="nombre">${nom}</span><span class="dato"${s === 'pesa' ? ' id="arbol-pesa"' : s === 'calentador' ? ' id="arbol-cal"' : s === 'bano' ? ' id="arbol-bano"' : ''}>${dato}</span></div>`;
    let h = '';
    if (MONT === 'cilindro') {
      h = nodo('cilindro', 'o-cilindro', 'Cilindro') + nodo('gas', 'o-gas', 'Gas') + nodo('embolo', 'o-embolo', 'Émbolo')
        + (hayPesa() ? nodo('pesa', 'o-pesa', 'Pesa') : '') + (hayCal() ? nodo('calentador', 'o-calentador', 'Calentador') : '') + (GEO.tanque ? nodo('bano', 'o-bano-termico', 'Baño térmico') : '')
        + nodo('', 'o-atmosfera', 'Atmósfera', `<span id="arbol-atm"></span>`, ' global') + nodo('', 'o-gravedad', 'Gravedad', `<span id="arbol-g"></span>`, ' global');
    } else if (MONT === 'recipientes') {
      h = nodo('escena', 'i-escena', 'Recipientes');
      REC.e.compartimientos.forEach((c, i) => { h += nodo('r' + i, 'o-recipiente', `Recipiente ${REC.nombres[i]}`, cantidad(c.V * 1e3, 'L', 3)); });
      REC.e.separadores.forEach((sp, j) => { h += nodo('s' + j, sp.tipo === 'valvula' ? 'o-valvula' : sp.tipo === 'embolo' ? 'o-embolo' : 'o-tabique', sp.tipo === 'valvula' ? 'Válvula' : sp.tipo === 'embolo' ? 'Émbolo libre' : 'Tabique', `${REC.nombres[j]} | ${REC.nombres[j + 1]}`); });
    } else if (MONT === 'abierto') h = nodo(esGlobo() ? 'globo' : 'recinto', esGlobo() ? 'o-globo' : 'o-recipiente', esGlobo() ? 'Globo' : 'Habitación') + nodo('', 'o-atmosfera', 'Atmósfera', cantidad(SIM.e.P0 / 1e3, 'kPa', 4), ' global');
    else if (MONT === 'burbuja') h = nodo('burbuja', 'o-gas', 'Burbuja') + nodo('', 'o-columna-liquido', 'Columna de agua', cantidad(SIM.e.prof, 'm', 3), ' global');
    if (ESC.propio) h = arbolPropio(nodo);
    for (const o of INSTR) h += nodo(o.id, ICONO_INSTR[o.tipo], NOMBRE_HERR[o.tipo], o.tipo === 'regla' ? cantidad(Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]), 'm', 3) : o.tipo === 'cronometro' ? cantidad(lecturaCronometro(o, t), 's', 3) : '');
    $('#arbol').innerHTML = h;
  }
  $('#arbol').addEventListener('click', ev => { const n = ev.target instanceof Element ? ev.target.closest('.nodo[data-sel]') : null; if (n) seleccionar(n.dataset.sel); });

  // Acciones de los montajes que no son el cilindro
  function acciones() {
    if (!SIM) {
      $('#acciones-cilindro').hidden = true; $('#acciones-otro').hidden = false;
      ['#c-m-f', '#c-m-v', '#c-m-r'].forEach(id => { $(id).hidden = true; });
      $('#acciones-otro').innerHTML = '<p class="ayuda-fila" style="margin-left:0">Sin objetos no hay acciones: coloca un cilindro, recipientes, un globo o una columna de líquido.</p>';
      return;
    }
    const cil = MONT === 'cilindro';
    $('#acciones-cilindro').hidden = !cil; $('#acciones-otro').hidden = cil;
    $('#fila-pesa').hidden = !hayPesa();
    $('#a-cal').closest('.fila').hidden = cil && !hayCal();
    ['#c-m-f', '#c-m-v', '#c-m-r'].forEach(id => { $(id).hidden = !cil; });
    if (MONT === 'abierto' && esGlobo()) { $('#c-m-f').hidden = false; $('#m-f-txt').textContent = 'Flotación y peso'; } else $('#m-f-txt').textContent = 'Fuerzas sobre el émbolo';
    if (cil) return;
    let h = '';
    if (MONT === 'recipientes') {
      const b = banderasRec(t);
      REC.e.separadores.forEach((sp, j) => { if (sp.tipo === 'valvula') h += fila(`Válvula ${REC.nombres[j]}|${REC.nombres[j + 1]}`, `<button class="btn btn-secundario btn-compacto" data-acc="valvula" data-i="${j}"><svg class="ico"><use href="#o-valvula"/></svg><span>${b.valvulas[j] ? 'Cerrar' : 'Abrir'}</span></button>`); });
      REC.e.compartimientos.forEach((c, i) => {
        if ((c.Fc ?? 0) > 0) h += fila(`Calentador ${REC.nombres[i]}`, `<label class="conmutador"><input type="checkbox" class="interruptor" data-acc="calentador" data-i="${i}"${b.cal[i] ? ' checked' : ''}><span>${b.cal[i] ? 'Encendido' : 'Apagado'}</span></label>`);
        if ((c.Gb ?? 0) > 0) h += fila(`Baño ${REC.nombres[i]}`, `<label class="conmutador"><input type="checkbox" class="interruptor" data-acc="bano" data-i="${i}"${b.bano[i] ? ' checked' : ''}><span>${b.bano[i] ? 'En contacto' : 'Aislado'}</span></label>`);
      });
    } else if (MONT === 'abierto') {
      const ult = [...guion].filter(a => a.t <= t + 1e-9).pop(), on = !!(ult && ult.valor);
      h = fila(esGlobo() ? 'Quemador' : 'Calefacción', `<label class="conmutador"><input type="checkbox" class="interruptor" data-acc="calentador"${on ? ' checked' : ''}><span>${on ? 'Encendido' : 'Apagado'}</span></label>`);
    } else h = '<p class="ayuda-fila" style="margin-left:0">La burbuja sube sola a ritmo constante: no hay acciones.</p>';
    $('#acciones-otro').innerHTML = h;
  }
  $('#acciones-otro').addEventListener('click', ev => {
    const el = ev.target instanceof Element ? ev.target.closest('button[data-acc]') : null; if (!el) return;
    const j = +el.dataset.i; accion('valvula', !banderasRec(t).valvulas[j], j);
  });
  $('#acciones-otro').addEventListener('change', ev => {
    const el = ev.target; if (!(el instanceof HTMLInputElement) || !el.dataset.acc) return;
    if (MONT === 'abierto') accion('calentador', el.checked); else accion(el.dataset.acc, el.checked, +el.dataset.i);
  });

  $('#a-pesa').addEventListener('click', alternarPesa);
  $('#a-cal').addEventListener('change', ev => { if (ev.target.checked !== banderas(guion, t).cal) alternarCalentador(); });
  $('#a-paredes').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b && (b.dataset.v === 'adiabaticas') !== banderas(guion, t).adiab) alternarParedes(); });
  $('#a-motor').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) cambiarMotor(b.dataset.v); });

  // ---------------------------------------------------------------------
  // Paneles: lecturas, variables, gráficas, energía, eventos, tabla
  // ---------------------------------------------------------------------
  const lectura = ([a, b, val, u, rec = true]) => `<span class="sim">${a}${b ? `<sub${rec ? ' class="r"' : ''}>${b}</sub>` : ''}</span><span class="v">${fmt(val, 4)}</span><span class="u">${u}</span>`;
  function lecturas() {
    if (!SIM) { lecturasVacio(); return; }
    lecturasEscena();
    const ins = esInstr(sel) ? INSTR.find(o => o.id === sel) : null;
    if (ins) $('#lecturas').innerHTML = lecturasInstrumento(ins).map(filaLectura).join('');
  }
  function lecturasVacio() {
    $('#reloj').innerHTML = `<span class="sim">t</span>${fmt(t, 4).padStart(6, ' ')}<span class="u">s</span>`;
    $('#lect-titulo').textContent = `Lecturas en t = ${fmt(t, 4)} s`;
    $('#acc-titulo').textContent = 'Acciones';
    $('#insp-estado').textContent = objetoActual().estado(null, null);
    $('#grupo-examen').hidden = true;
    $('#b-deshacer').disabled = !historial.length; $('#b-rehacer').disabled = !porRehacer.length;
    const atm = MONTAJE ? MONTAJE.atm : { P0: 101.3, T0: 300 };
    const ins = esInstr(sel) ? INSTR.find(o => o.id === sel) : null;
    $('#lecturas').innerHTML = (ins ? lecturasInstrumento(ins) : [['<span class="sim">P</span><sub class="r">0</sub>', atm.P0, 'kPa', 'Presión del aire|Air pressure'], ['<span class="sim">T</span><sub class="r">0</sub>', atm.T0, 'K', 'Temperatura del aire|Air temperature']]).map(filaLectura).join('');
  }
  function lecturasEscena() {
    const s = estado(t);
    $('#reloj').innerHTML = `<span class="sim">t</span>${fmt(t, 4).padStart(6, ' ')}<span class="u">s</span>`;
    $('#lect-titulo').textContent = `Lecturas en t = ${fmt(t, 4)} s`;
    $('#acc-titulo').textContent = `Acciones en t = ${fmt(t, 4)} s`;
    $('#insp-estado').textContent = objetoActual().estado(s, MONT === 'cilindro' ? banderas(guion, t) : null);
    $('#grupo-examen').hidden = !FILAS.length;
    if (FILAS.length) { $('#examen-titulo').textContent = `Examen · MEXT ${ESC.anio}`; $('#examen').innerHTML = examenHTML(FILAS, t); }
    $('#b-play').innerHTML = `<svg class="ico"><use href="#i-${jugando ? 'pausar' : 'reproducir'}"/></svg>`;
    $('#b-play').dataset.ayuda = jugando ? 'Pausar|Pause|Espacio' : 'Reproducir|Play|Espacio';
    $('#b-deshacer').disabled = !historial.length; $('#b-rehacer').disabled = !porRehacer.length;
    document.querySelectorAll('[data-var]').forEach(e => { if (VAR[e.dataset.var]) e.textContent = fmtVar(VAR[e.dataset.var]); });
    if (MONT !== 'cilindro') { lecturasOtro(s); return; }
    const fl = banderas(guion, t);
    const filas = sel === 'embolo'
      ? [['h', '', s.h, 'm'], ['v', '', s.v, 'm/s'], ['E', 'k', s.Ek, 'J'], ['P', 'ext', SIM.P0 / 1e3 + s.me * SIM.g * Math.cos(s.ang * RAD) / SIM.A / 1e3, 'kPa']]
      : [['P', '', s.P / 1e3, 'kPa'], ['V', '', s.V * 1e3, 'L'], ['T', '', s.T, 'K'], ['U', '', s.U, 'J']];
    let html = filas.map(lectura).join('');
    if (ESC.extra && !guionPropio) html += ESC.extra(s, SIM, vals()).map(filaLectura).join('');
    $('#lecturas').innerHTML = html;
    // Acciones: reflejan la configuración en t
    $('#a-pesa span').textContent = fl.pesa ? 'Quitar la pesa' : 'Poner la pesa';
    $('#a-cal').checked = fl.cal; $('#a-cal-txt').textContent = fl.cal ? 'Encendido' : 'Apagado';
    document.querySelectorAll('#a-paredes button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.v === 'adiabaticas') === fl.adiab)));
    document.querySelectorAll('#a-motor button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === motor)));
    // Árbol de escena
    const pon = (id, txt) => { const e = $(id); if (e) e.textContent = txt; };
    pon('#arbol-pesa', cantidad(SIM.M, 'kg', 3));
    pon('#arbol-cal', fl.cal ? cantidad(entradaCilindro(ESC, vals()).Fc, 'W', 3) : 'apagado');
    pon('#arbol-bano', cantidad(SIM.T0, 'K', 3));
    pon('#arbol-atm', cantidad(SIM.P0 / 1e3, 'kPa', 4));
    pon('#arbol-g', cantidad(SIM.g, 'm/s²', 3));
  }
  function lecturasOtro(s) {
    let filas = [];
    if (MONT === 'recipientes') {
      const i = /^[rcgb]\d+$/.test(sel) ? +sel.slice(1) : -1;
      if (i >= 0) filas = [['<span class="sim">P</span>', s.P[i] / 1e3, 'kPa'], ['<span class="sim">V</span>', s.V[i] * 1e3, 'L'], ['<span class="sim">T</span>', s.n[i] > 1e-9 ? s.T[i] : NaN, 'K'], ['<span class="sim">n</span>', s.n[i], 'mol'], ['<span class="sim">U</span>', s.U[i], 'J']];
      else filas = [['<span class="sim">U</span><sub class="r">total</sub>', s.Utot, 'J', 'Energía interna total: aislados, se conserva|Total internal energy'], ['<span class="sim">Q</span><sub class="r">exterior</sub>', s.Qext, 'J', 'Calor de baños y calentadores|Heat from outside'], ['Δ<span class="sim">S</span>', s.dS, 'J/K', 'Entropía creada|Entropy change']];
      const pv = REC.e.compartimientos.reduce((a, c, k) => a + s.P[k] * s.V[k], 0);
      if (i < 0) filas.push(['Σ<span class="sim">PV</span>', pv, 'J', 'Σ P·V = (2/f)·U para un gas monoatómico|Sum PV']);
    } else if (MONT === 'abierto') {
      filas = [['<span class="sim">T</span>', s.T, 'K'], ['<span class="sim">ρ</span><sub class="r">dentro</sub>', s.rhoIn, 'kg/m³'], ['<span class="sim">ρ</span><sub class="r">fuera</sub>', s.rhoExt, 'kg/m³'], ['<span class="sim">m</span><sub class="r">aire</sub>', s.m, 'kg']];
      if (esGlobo()) filas.push(['<span class="sim">F</span><sub class="r">B</sub>', s.B, 'N', 'Flotación: peso del aire de fuera desalojado|Buoyancy'], ['Peso', s.Peso, 'N', '(M + m_aire)·g|Weight'], ['<span class="sim">z</span>', s.z, 'm']);
      else filas.push(['<span class="sim">m</span><sub class="r">sale</sub>', s.mSale, 'kg', 'Aire que ha salido|Air that left']);
      filas.push(['<span class="sim">Q</span>', s.Q, 'J', 'Calor del quemador o la calefacción|Heat']);
    } else filas = [['<span class="sim">d</span>', s.z, 'm', 'Profundidad|Depth'], ['<span class="sim">P</span>', s.P / 1e3, 'kPa'], ['<span class="sim">T</span>', s.T, 'K'], ['<span class="sim">V</span>', s.V * 1e6, 'cm³'], ['<span class="sim">PV</span>/<span class="sim">T</span>', s.P * s.V / s.T, 'J/K', 'Constante: n·R|nR'], ['<span class="sim">W</span>', s.W, 'J', 'Trabajo de la burbuja al expandirse|Work'], ['<span class="sim">Q</span>', s.Q, 'J', 'Calor recibido del agua|Heat']];
    if (ESC.extra && !guionPropio) filas.push(...ESC.extra(s, SIM, vals()));
    $('#lecturas').innerHTML = filas.map(([a, val, u, ay]) => filaLectura([a, typeof val === 'number' && (u === 'J' || u === 'N') && Math.abs(val) >= 1e4 ? conPrefijo(val, u, 4).split(Volta.ESP)[0] : val, typeof val === 'number' && (u === 'J' || u === 'N') && Math.abs(val) >= 1e4 ? conPrefijo(val, u, 4).split(Volta.ESP)[1] : u, ay])).join('');
  }

  function construirVariables() {
    const cont = $('#variables'); cont.innerHTML = '';
    let arrastrandoVar = false;
    for (const [k, d] of Object.entries(VAR)) {
      const f = document.createElement('div'); f.className = 'var' + (d.constante ? ' constante' : '');
      if (d.ayuda) f.dataset.ayuda = d.ayuda;
      const control = d.constante
        ? '<span class="constante-etq">Constante</span>'
        : `<input class="deslizador" type="range" min="${d.min}" max="${d.max}" step="${d.paso}" value="${d.val}" aria-label="${d.sim}">`;
      f.innerHTML = `<span class="sim">${simHTML(d)}</span>${control}<span class="valor"></span>`;
      const ent = f.querySelector('input'), val = f.querySelector('.valor');
      const pintar = () => { val.innerHTML = `${fmtVar(d)}${d.u ? `<span class="u">${d.u}</span>` : ''}`; if (ent) Volta.pintarDeslizador(ent); };
      if (ent) {
        ent.addEventListener('input', () => { if (!arrastrandoVar) { guardarHistorial(); arrastrandoVar = true; } d.val = parseFloat(ent.value); pintar(); recalcular(); });
        ent.addEventListener('change', () => { arrastrandoVar = false; });
      }
      pintar(); cont.appendChild(f);
    }
    if (!Object.keys(VAR).length && ESC.propio) cont.innerHTML = '<p class="ayuda-fila" style="margin:2px 12px 10px">En una escena propia cada valor se cambia en el inspector del objeto.</p>';
  }

  const lt = new LineaTiempo($('#tl'), { duracion: DUR, eventos: [], alCambiar: nt => { t = nt; jugando = false; todo(); } });

  // Serie de la corrida hasta tFin como [[x, y], …]
  function serie(f, tFin = DUR) {
    const ms = SIM.muestras, paso = Math.max(1, Math.round(ms.length / 2200)), M = SIM.muestra, iFin = Math.min(ms.length - 1, Math.floor(tFin / M + 1e-9)), p = [];
    for (let i = 0; i <= iFin; i += MONT === 'cilindro' ? 2 : paso) p.push(f(ms[i]));
    if (tFin < DUR) p.push(f(estado(tFin)));
    return p;
  }
  const marcasEventos = () => SIM.eventos.filter(e => e.t > 0).map(e => ({ x: e.t }));
  function rango(xs, fr = 0.1) { const a = Math.min(...xs.filter(Number.isFinite)), b = Math.max(...xs.filter(Number.isFinite)), d = Math.max(b - a, Math.abs(b) * 0.04, 1e-9); return { min: a - d * fr, max: b + d * fr }; }
  const PATRONES = ['continuo', 'discontinuo', 'punteado'];

  function graficas() {
    if (!SIM) {
      for (const k of ['1', '2', '3']) { $('#t' + k).textContent = ''; $('#l' + k).textContent = ''; grafica($('#g' + k), { x: { min: 0, max: DUR }, y: { min: 0, max: 1 }, series: [], eventos: [] }); }
      if ($('#p-energia').hidden === false) { $('#e-gas').innerHTML = ''; $('#e-embolo').innerHTML = ''; grafica($('#g4'), { x: { min: 0, max: DUR }, y: { min: 0, max: 1 }, series: [], eventos: [] }); }
      return;
    }
    if ($('#p-graficas').hidden === false) {
      if (MONT !== 'cilindro') graficasOtro();
      else {
        const s = estado(t);
        $('#t1').innerHTML = '<span class="sim">P</span> (kPa) contra <span class="sim">V</span> (L)';
        $('#t2').innerHTML = '<span class="sim">T</span> contra <span class="sim">t</span>';
        $('#t3').innerHTML = '<span class="sim">h</span> contra <span class="sim">t</span>';
        graficaPV(s);
        const { X, Y } = grafica($('#g2'), { x: { min: 0, max: DUR }, y: { min: ESCA.T[0], max: ESCA.T[1] }, series: [{ tramos: [serie(q => [q.t, q.T])], familia: 'termico' }], cursor: t, puntoCursor: [t, s.T], eventos: marcasEventos() });
        referencia($('#g2'), X, Y, [[0, SIM.T0], [DUR, SIM.T0]], 'texto-3', [{ t: 'T', f: 'sim' }, { t: '0', f: 'sub' }], [0, DUR], ESCA.T);
        grafica($('#g3'), { x: { min: 0, max: DUR }, y: { min: ESCA.h[0], max: ESCA.h[1] }, series: [{ tramos: [serie(q => [q.t, q.h])], familia: 'tinta' }], cursor: t, puntoCursor: [t, s.h], eventos: marcasEventos() });
        $('#l1').textContent = `${cantidad(s.P / 1e3, 'kPa')} · ${cantidad(s.V * 1e3, 'L')}`;
        $('#l2').textContent = cantidad(s.T, 'K');
        $('#l3').textContent = cantidad(s.h, 'm');
      }
    }
    if ($('#p-energia').hidden === false) { if (MONT === 'cilindro') energiaPanel(); else energiaOtro(); }
  }
  function graficasOtro() {
    const s = estado(t), X = { min: 0, max: DUR }, ev = marcasEventos();
    // Las etiquetas de las series van al final de lo recorrido: solo cuando ya hay sitio
    const multi = (n, f, fam, etqs) => Array.from({ length: n }, (_, i) => ({ tramos: [serie(q => [q.t, f(q, i)], t)], familia: fam, patron: PATRONES[i % 3], etiqueta: etqs && t > DUR * 0.15 ? etqs[i] : null }));
    if (MONT === 'recipientes') {
      const N = REC.e.compartimientos.length, nom = REC.nombres;
      grafica($('#g1'), { x: X, y: rango(SIM.muestras.flatMap(q => q.P.map(p => p / 1e3)).concat(0)), cursor: t, eventos: ev, series: multi(N, (q, i) => q.P[i] / 1e3, 'tinta', nom) });
      grafica($('#g2'), { x: X, y: rango(SIM.muestras.flatMap(q => q.T.filter(Number.isFinite))), cursor: t, eventos: ev, series: multi(N, (q, i) => (Number.isFinite(q.T[i]) ? q.T[i] : NaN), 'termico', nom) });
      const pistones = REC.e.separadores.some(sp => sp.tipo === 'embolo');
      grafica($('#g3'), { x: X, y: rango(SIM.muestras.flatMap(q => (pistones ? q.V.map(x => x * 1e3) : q.n))), cursor: t, eventos: ev, series: multi(N, (q, i) => (pistones ? q.V[i] * 1e3 : q.n[i]), 'tinta', nom) });
      $('#t1').innerHTML = '<span class="sim">P</span> (kPa) contra <span class="sim">t</span>'; $('#t2').innerHTML = '<span class="sim">T</span> (K) contra <span class="sim">t</span>';
      $('#t3').innerHTML = pistones ? '<span class="sim">V</span> (L) contra <span class="sim">t</span>' : '<span class="sim">n</span> (mol) contra <span class="sim">t</span>';
      // Con tres recipientes o más no caben todas las lecturas: la del recipiente elegido, con su nombre
      const iL = N >= 3 ? Math.max(0, /^[rcgb]\d+$/.test(sel) ? +sel.slice(1) : 0) : -1, lista = (xs, f) => (iL >= 0 ? `${nom[iL]}: ${f(xs[iL])}` : xs.map(f).join(' · '));
      $('#l1').textContent = lista(s.P, p => fmt(p / 1e3, 4)) + ' kPa'; $('#l2').textContent = lista(s.T, x => (Number.isFinite(x) ? fmt(x, 4) : '—')) + ' K';
      $('#l3').textContent = pistones ? lista(s.V, x => fmt(x * 1e3, 4)) + ' L' : lista(s.n, x => fmt(x, 3)) + ' mol';
    } else if (MONT === 'abierto') {
      grafica($('#g1'), { x: X, y: rango(SIM.muestras.map(q => q.T)), cursor: t, eventos: ev, series: [{ tramos: [serie(q => [q.t, q.T], t)], familia: 'termico' }] });
      $('#t1').innerHTML = '<span class="sim">T</span> (K) contra <span class="sim">t</span>'; $('#l1').textContent = cantidad(s.T, 'K', 4);
      if (esGlobo()) {
        grafica($('#g2'), { x: X, y: rango(SIM.muestras.map(q => q.z).concat(0)), cursor: t, eventos: ev, series: [{ tramos: [serie(q => [q.t, q.z], t)], familia: 'tinta' }] });
        $('#t2').innerHTML = '<span class="sim">z</span> (m) contra <span class="sim">t</span>'; $('#l2').textContent = cantidad(s.z, 'm', 3);
        grafica($('#g3'), { x: X, y: rango(SIM.muestras.flatMap(q => [q.B, q.Peso])), cursor: t, eventos: ev, series: [{ tramos: [serie(q => [q.t, q.B], t)], familia: 'interaccion', etiqueta: 'flotación' }, { tramos: [serie(q => [q.t, q.Peso], t)], familia: 'interaccion', patron: 'discontinuo', etiqueta: 'peso' }] });
        $('#t3').innerHTML = '<span class="leyenda"><span style="color:var(--f-interaccion)"><i></i>Flotación</span><span style="color:var(--f-interaccion)"><i class="discontinua"></i>Peso</span></span>'; $('#l3').textContent = 'N';
      } else {
        grafica($('#g2'), { x: X, y: rango(SIM.muestras.map(q => q.m)), cursor: t, eventos: ev, series: [{ tramos: [serie(q => [q.t, q.m], t)], familia: 'tinta' }] });
        $('#t2').innerHTML = '<span class="sim">m</span> de aire (kg) contra <span class="sim">t</span>'; $('#l2').textContent = cantidad(s.m, 'kg', 4);
        grafica($('#g3'), { x: X, y: rango(SIM.muestras.map(q => q.Q).concat(0)), cursor: t, eventos: ev, series: [{ tramos: [serie(q => [q.t, q.Q], t)], familia: 'termico' }] });
        $('#t3').innerHTML = '<span class="sim">Q</span> (J) contra <span class="sim">t</span>'; $('#l3').textContent = conPrefijo(s.Q, 'J', 4);
      }
    } else {
      const ms = SIM.muestras;
      grafica($('#g1'), { x: { min: 0, max: SIM.e.prof }, y: rango(ms.map(q => q.V * 1e6).concat(0)), puntoCursor: [s.z, s.V * 1e6], eventos: [], series: [{ tramos: [ms.map(q => [q.z, q.V * 1e6])], familia: 'tinta' }] });
      $('#t1').innerHTML = '<span class="sim">V</span> (cm³) contra la profundidad <span class="sim">d</span> (m)'; $('#l1').textContent = cantidad(s.V * 1e6, 'cm³', 4);
      grafica($('#g2'), { x: X, y: rango(ms.map(q => q.P / 1e3)), cursor: t, eventos: ev, series: [{ tramos: [serie(q => [q.t, q.P / 1e3], t)], familia: 'tinta' }] });
      $('#t2').innerHTML = '<span class="sim">P</span> (kPa) contra <span class="sim">t</span>'; $('#l2').textContent = cantidad(s.P / 1e3, 'kPa', 4);
      grafica($('#g3'), { x: X, y: rango(ms.flatMap(q => [q.Q, q.W, q.dU]).concat(0)), cursor: t, eventos: ev, series: [{ tramos: [serie(q => [q.t, q.Q], t)], familia: 'termico' }, { tramos: [serie(q => [q.t, q.W], t)], familia: 'tinta', patron: 'discontinuo' }, { tramos: [serie(q => [q.t, q.dU], t)], familia: 'tinta' }] });
      $('#t3').innerHTML = '<span class="leyenda"><span style="color:var(--f-termico)"><i></i><span class="sim">Q</span></span><span style="color:var(--tinta)"><i class="discontinua"></i><span class="sim">W</span></span><span style="color:var(--tinta)"><i></i>Δ<span class="sim">U</span></span></span>'; $('#l3').textContent = 'J';
    }
  }

  // Diagrama P-V: el proceso se dibuja hasta t; la isoterma y la adiabática que
  // pasan por el estado actual van como construcción auxiliar (1 px punteado)
  function graficaPV(s) {
    const cv = $('#g1'), V0 = s.V * 1e3, P0 = s.P / 1e3;
    const { X, Y } = grafica(cv, { x: { min: ESCA.V[0], max: ESCA.V[1] }, y: { min: ESCA.P[0], max: ESCA.P[1] }, series: [{ tramos: [serie(q => [q.V * 1e3, q.P / 1e3], t)], familia: 'tinta' }], puntoCursor: [V0, P0], eventos: [] });
    const c = cv.getContext('2d'), tk = Volta.leerTokens();
    if ($('#m-r').checked) {
      const curva = fP => { const p = []; for (let i = 0; i <= 80; i++) { const x = ESCA.V[0] + (ESCA.V[1] - ESCA.V[0]) * i / 80; p.push([x, fP(x)]); } return p; };
      referencia(cv, X, Y, curva(x => P0 * V0 / x), 'termico', [{ t: 'isoterma', f: 'ui' }], ESCA.V, ESCA.P);
      referencia(cv, X, Y, curva(x => P0 * Math.pow(V0 / x, SIM.gam)), 'texto-3', [{ t: 'adiabática', f: 'ui' }], ESCA.V, ESCA.P, true);
    }
    // Eventos ya ocurridos: punto sobre la curva
    c.save(); c.fillStyle = tk.tinta;
    for (const e of SIM.eventos) if (e.t > 0 && e.t <= t + 1e-9) { c.beginPath(); c.arc(X(e.V * 1e3), Y(e.P / 1e3), 2.5, 0, 2 * Math.PI); c.fill(); }
    // El estado actual queda encima de las referencias
    c.fillStyle = tk.lienzo; c.strokeStyle = tk.tinta; c.lineWidth = 2;
    c.beginPath(); c.arc(X(V0), Y(P0), 3.5, 0, 2 * Math.PI); c.fill(); c.stroke(); c.restore();
  }
  // Curva de referencia auxiliar sobre una gráfica ya dibujada (1 px, punteado 1.5 · 3)
  // con su etiqueta con halo. alInicio: la etiqueta va donde la curva entra al
  // área (a su derecha y debajo); si no, donde sale (a su izquierda y encima).
  function referencia(cv, X, Y, pts, color, etiqueta, rx, ry, alInicio) {
    const c = cv.getContext('2d'), tk = Volta.leerTokens(), col = tk.f[color] || tk[color];
    const x0 = X(rx[0]), x1 = X(rx[1]), y0 = Y(ry[1]), y1 = Y(ry[0]);
    c.save(); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
    c.strokeStyle = col; c.lineWidth = 1; c.setLineDash(Volta.PATRON.auxiliar); c.lineCap = 'round';
    c.beginPath(); pts.forEach(([a, b], i) => (i ? c.lineTo(X(a), Y(b)) : c.moveTo(X(a), Y(b)))); c.stroke();
    c.restore();
    // Etiqueta: último punto dentro del área de trazado
    const dentro = pts.filter(([a, b]) => b >= ry[0] && b <= ry[1] && a >= rx[0] && a <= rx[1]);
    if (!dentro.length) return;
    const [a, b] = alInicio ? dentro[0] : dentro[dentro.length - 1];
    c.save(); c.textBaseline = 'alphabetic'; c.lineJoin = 'round';
    let ancho = 0; const fuente = sg => (sg.f === 'sim' ? 'italic 13px "STIX Two Text", serif' : sg.f === 'sub' ? '9.5px "STIX Two Text", serif' : '10.5px "IBM Plex Sans", sans-serif');
    for (const sg of etiqueta) { c.font = fuente(sg); ancho += c.measureText(sg.t).width; }
    let cx = alInicio ? Math.min(X(a) + 6, x1 - 2 - ancho) : Math.min(X(a), x1 - 2) - ancho;
    const y = Math.max(y0 + 10, Math.min(y1 - 4, Y(b) + (alInicio ? 13 : -5)));
    for (const sg of etiqueta) {
      c.font = fuente(sg); const dy = sg.f === 'sub' ? 3 : 0;
      c.lineWidth = 6; c.strokeStyle = tk.lienzo; c.textAlign = 'left'; c.strokeText(sg.t, cx, y + dy);
      c.fillStyle = col; c.fillText(sg.t, cx, y + dy); cx += c.measureText(sg.t).width;
    }
    c.restore();
  }

  const colorFam = f => (f === 'tinta' ? 'var(--tinta)' : `var(--f-${f})`);
  const barras = (cont, titulo, filas, escala, pie) => {
    cont.innerHTML = `<div class="barras-tit">${titulo}</div>` + filas.map(([n, fam, val, ayuda]) => {
      const p = Math.min(50, Math.abs(val) / escala * 50), pos = val >= 0 ? `left:50%;width:${p}%` : `left:${50 - p}%;width:${p}%`;
      return `<div class="barra-e" data-ayuda="${ayuda}"><span>${n}</span><span class="riel"><i style="${pos};background:${colorFam(fam)}"></i></span><span class="v">${Math.abs(val) >= 1e4 ? conPrefijo(val, 'J', 4) : cantidad(val, 'J', 4)}</span></div>`;
    }).join('') + `<div class="barras-pie">${pie}</div>`;
  };
  function energiaPanel() {
    const s = estado(t);
    const resGas = residuoGas(s), resEmb = residuoEmbolo(s);
    $('#t4').innerHTML = '<span style="color:var(--f-termico)"><i></i><span class="sim">Q</span></span><span style="color:var(--tinta)"><i class="discontinua"></i><span class="sim">W</span></span><span style="color:var(--tinta)"><i></i><span class="sim">ΔU</span></span>';
    barras($('#e-gas'), 'Gas · primera ley', [
      ['Calentador', 'termico', s.Qcal, 'Calor que da el calentador|Heater'],
      ['Baño', 'termico', s.Qbano, 'Calor que entra por las paredes desde el baño|Heat from the bath'],
      ['Disipación', 'termico', s.Edis, 'Energía disipada al mover el émbolo; vuelve al gas como calor|Dissipated energy'],
      ['Trabajo <span class="sim">W</span>', 'tinta', s.W, 'Trabajo que hace el gas sobre el émbolo|Work done by the gas'],
      ['Variación Δ<span class="sim">U</span>', 'tinta', s.dU, 'Variación de la energía interna del gas|Internal energy change'],
    ], ESCA.gas, `<span class="sim">Q</span> − <span class="sim">W</span> − Δ<span class="sim">U</span> = ${cantidad(resGas, 'J', 2)}`);
    const filasEmb = [
      ['Atmósfera', 'tinta', s.Watm, 'Trabajo contra la atmósfera, P₀ΔV|Work against the atmosphere'],
      ['Potencial', 'cambio', s.Ep, 'Energía potencial gravitatoria ganada por el émbolo y la pesa|Gravitational potential energy'],
      ['Cinética', 'movimiento', s.Ek, 'Energía cinética del émbolo|Kinetic energy'],
      ['Disipación', 'termico', s.Edis, 'Energía disipada por el amortiguamiento y los choques|Dissipated energy'],
    ];
    if (!SIM.cuasi) filasEmb.push(['Aporte de la mano', 'tinta', s.Emano, 'Energía cinética que la mano da a la pesa al ponerla o se lleva al quitarla|Work by the hand']);
    barras($('#e-embolo'), 'Émbolo · destino de <span class="sim">W</span>', filasEmb, ESCA.emb, `Residuo del balance = ${cantidad(resEmb, 'J', 2)}`);
    grafica($('#g4'), {
      x: { min: 0, max: DUR }, y: { min: ESCA.E[0], max: ESCA.E[1] },
      series: [
        { tramos: [serie(q => [q.t, Qtot(q)])], familia: 'termico' },
        { tramos: [serie(q => [q.t, q.W])], familia: 'tinta', patron: 'discontinuo' },
        { tramos: [serie(q => [q.t, q.dU])], familia: 'tinta' },
      ],
      cursor: t, eventos: marcasEventos(),
    });
  }
  function energiaOtro() {
    const s = estado(t), ev = marcasEventos();
    if (MONT === 'recipientes') {
      const N = REC.e.compartimientos.length, nom = REC.nombres, ms = SIM.muestras;
      const esc = Math.max(1e-9, ...ms.flatMap(q => [...q.Qbano, ...q.Qcal, ...q.Qint, ...q.H, ...q.W].map(Math.abs)), ...ms.map(q => Math.abs(q.Utot - SIM.muestras[0].Utot)));
      const filas = [];
      for (let i = 0; i < N; i++) filas.push([`Δ<span class="sim">U</span> ${nom[i]}`, 'tinta', s.U[i] - SIM.U0[i], 'Variación de energía interna|Internal energy change']);
      for (let i = 0; i < N; i++) if (Math.abs(s.H[i]) > 1e-9 * esc) filas.push([`Gas que entra ${nom[i]}`, 'tinta', s.H[i], 'Entalpía que llega o se va con el gas|Enthalpy with the gas']);
      for (let i = 0; i < N; i++) if (Math.abs(s.Qint[i]) > 1e-9 * esc) filas.push([`Calor de vecinos ${nom[i]}`, 'termico', s.Qint[i], 'Calor por paredes y mezcla|Heat between vessels']);
      barras($('#e-gas'), 'Por recipiente', filas.slice(0, 7), esc, `Σ Δ<span class="sim">U</span> = ${conPrefijo(s.Utot - SIM.muestras[0].Utot, 'J', 4)}`);
      const ext = [];
      for (let i = 0; i < N; i++) { if (Math.abs(s.Qbano[i]) > 0) ext.push([`Baño ${nom[i]}`, 'termico', s.Qbano[i], 'Calor del baño|Bath heat']); if (Math.abs(s.Qcal[i]) > 0) ext.push([`Calentador ${nom[i]}`, 'termico', s.Qcal[i], 'Calor del calentador|Heater']); if (Math.abs(s.W[i]) > 0) ext.push([`Trabajo ${nom[i]}`, 'tinta', s.W[i], 'Trabajo sobre el émbolo|Work']); }
      const resid = s.U.reduce((a, u, i) => a + (u - SIM.U0[i]) - (s.Qbano[i] + s.Qcal[i] + s.Qint[i] + s.H[i] - s.W[i]), 0);
      barras($('#e-embolo'), 'Exterior y émbolos', ext.length ? ext : [['Sin calor ni trabajo exterior', 'tinta', 0, 'Recipientes aislados|Isolated']], esc, `Residuo Σ(ΔU − Q − H + W) = ${cantidad(resid, 'J', 2)}`);
      $('#t4').innerHTML = '<span style="color:var(--tinta)"><i></i><span class="sim">U</span> total</span><span style="color:var(--f-termico)"><i></i><span class="sim">Q</span> exterior</span>';
      grafica($('#g4'), { x: { min: 0, max: DUR }, y: rango(ms.flatMap(q => [q.Utot, q.Qext + SIM.muestras[0].Utot]).concat(0)), cursor: t, eventos: ev, series: [{ tramos: [serie(q => [q.t, q.Utot])], familia: 'tinta' }, { tramos: [serie(q => [q.t, q.Qext + SIM.muestras[0].Utot])], familia: 'termico', patron: 'discontinuo' }] });
    } else if (MONT === 'abierto') {
      const ms = SIM.muestras, esc = Math.max(1e-9, ...ms.map(q => Math.abs(q.Q)));
      barras($('#e-gas'), 'Calor', [['Quemador o calefacción', 'termico', s.Q, 'Calor dado al aire de dentro|Heat'], ['Pérdidas', 'termico', -s.Qp, 'Calor perdido hacia fuera|Losses']], esc, 'A presión constante: dQ = n·Cp·dT con n variable');
      barras($('#e-embolo'), 'Aire de dentro', [['Masa que sale', 'tinta', s.mSale * esc / Math.max(1e-9, SIM.e.Mm * SIM.n0), 'Fracción del aire inicial que ha salido|Air that left']], esc, `Sale ${cantidad(s.mSale, 'kg', 4)} de ${cantidad(SIM.e.Mm * SIM.n0, 'kg', 4)}`);
      $('#t4').innerHTML = '<span style="color:var(--f-termico)"><i></i><span class="sim">Q</span></span>';
      grafica($('#g4'), { x: { min: 0, max: DUR }, y: rango(ms.map(q => q.Q).concat(0)), cursor: t, eventos: ev, series: [{ tramos: [serie(q => [q.t, q.Q])], familia: 'termico' }] });
    } else {
      const ms = SIM.muestras, esc = Math.max(1e-9, ...ms.flatMap(q => [Math.abs(q.Q), Math.abs(q.W), Math.abs(q.dU)]));
      barras($('#e-gas'), 'Burbuja · primera ley', [['Calor <span class="sim">Q</span>', 'termico', s.Q, 'Calor que recibe del agua|Heat'], ['Trabajo <span class="sim">W</span>', 'tinta', s.W, 'Trabajo de la burbuja al crecer|Work'], ['Δ<span class="sim">U</span>', 'tinta', s.dU, 'Variación de energía interna|Internal energy change']], esc, `<span class="sim">Q</span> − <span class="sim">W</span> − Δ<span class="sim">U</span> = ${cantidad(s.Q - s.W - s.dU, 'J', 2)}`);
      $('#e-embolo').innerHTML = '';
      $('#t4').innerHTML = '<span style="color:var(--f-termico)"><i></i><span class="sim">Q</span></span><span style="color:var(--tinta)"><i class="discontinua"></i><span class="sim">W</span></span>';
      grafica($('#g4'), { x: { min: 0, max: DUR }, y: rango(ms.flatMap(q => [q.Q, q.W]).concat(0)), cursor: t, eventos: ev, series: [{ tramos: [serie(q => [q.t, q.Q])], familia: 'termico' }, { tramos: [serie(q => [q.t, q.W])], familia: 'tinta', patron: 'discontinuo' }] });
    }
  }

  function tablas() {
    if (!SIM) { $('#t-eventos').innerHTML = ''; $('#t-datos').innerHTML = ''; return; }
    if (MONT !== 'cilindro') { tablasOtro(); return; }
    $('#t-eventos').innerHTML = '<tr><th>Evento</th><th>t (s)</th><th>P (kPa)</th><th>V (L)</th><th>T (K)</th><th>Q (J)</th><th>W (J)</th></tr>' +
      SIM.eventos.map(e => `<tr class="${Math.abs(e.t - t) < 0.006 ? 'actual' : ''}"><td style="font-family:var(--fuente-interfaz)">${e.nombre}</td><td>${fmt(e.t, 4)}</td><td>${fmt(e.P / 1e3, 5)}</td><td>${fmt(e.V * 1e3, 5)}</td><td>${fmt(e.T, 5)}</td><td>${fmt(e.Q, 4)}</td><td>${fmt(e.W, 4)}</td></tr>`).join('');
    let filas = '<tr><th>t (s)</th><th>P (kPa)</th><th>V (L)</th><th>T (K)</th><th>U (J)</th><th>Q (J)</th><th>W (J)</th><th>h (m)</th></tr>';
    for (let k = 0; k * 0.5 <= DUR + 1e-9; k++) {
      const tt = k * 0.5, s = estado(tt);
      filas += `<tr class="${Math.abs(tt - t) < 0.25 ? 'actual' : ''}"><td>${fmt(tt, 3)}</td><td>${fmt(s.P / 1e3, 5)}</td><td>${fmt(s.V * 1e3, 5)}</td><td>${fmt(s.T, 5)}</td><td>${fmt(s.U, 5)}</td><td>${fmt(Qtot(s), 4)}</td><td>${fmt(s.W, 4)}</td><td>${fmt(s.h, 4)}</td></tr>`;
    }
    $('#t-datos').innerHTML = filas;
  }
  function tablasOtro() {
    $('#t-eventos').innerHTML = '<tr><th>Evento</th><th>t (s)</th></tr>' + SIM.eventos.map(e => `<tr class="${Math.abs(e.t - t) < 0.05 ? 'actual' : ''}"><td style="font-family:var(--fuente-interfaz)">${e.nombre}</td><td>${fmt(e.t, 4)}</td></tr>`).join('');
    const paso = DUR / 60;
    let h;
    if (MONT === 'recipientes') {
      const nom = REC.nombres;
      h = `<tr><th>t (s)</th>${nom.map(n => `<th>P ${n} (kPa)</th>`).join('')}${nom.map(n => `<th>T ${n} (K)</th>`).join('')}${nom.map(n => `<th>n ${n} (mol)</th>`).join('')}</tr>`;
      for (let k = 0; k * paso <= DUR + 1e-9; k++) { const tt = k * paso, s = estado(tt); h += `<tr class="${Math.abs(tt - t) < paso / 2 ? 'actual' : ''}"><td>${fmt(tt, 3)}</td>${s.P.map(x => `<td>${fmt(x / 1e3, 5)}</td>`).join('')}${s.T.map(x => `<td>${Number.isFinite(x) ? fmt(x, 5) : '—'}</td>`).join('')}${s.n.map(x => `<td>${fmt(x, 4)}</td>`).join('')}</tr>`; }
    } else if (MONT === 'abierto') {
      h = '<tr><th>t (s)</th><th>T (K)</th><th>z (m)</th><th>m aire (kg)</th><th>ρ dentro (kg/m³)</th><th>Q (J)</th></tr>';
      for (let k = 0; k * paso <= DUR + 1e-9; k++) { const tt = k * paso, s = estado(tt); h += `<tr class="${Math.abs(tt - t) < paso / 2 ? 'actual' : ''}"><td>${fmt(tt, 3)}</td><td>${fmt(s.T, 5)}</td><td>${fmt(s.z, 4)}</td><td>${fmt(s.m, 5)}</td><td>${fmt(s.rhoIn, 4)}</td><td>${fmt(s.Q, 4)}</td></tr>`; }
    } else {
      h = '<tr><th>t (s)</th><th>d (m)</th><th>P (kPa)</th><th>T (K)</th><th>V (cm³)</th><th>W (J)</th><th>Q (J)</th></tr>';
      for (let k = 0; k * paso <= DUR + 1e-9; k++) { const tt = k * paso, s = estado(tt); h += `<tr class="${Math.abs(tt - t) < paso / 2 ? 'actual' : ''}"><td>${fmt(tt, 3)}</td><td>${fmt(s.z, 4)}</td><td>${fmt(s.P / 1e3, 5)}</td><td>${fmt(s.T, 5)}</td><td>${fmt(s.V * 1e6, 5)}</td><td>${fmt(s.W, 4)}</td><td>${fmt(s.Q, 4)}</td></tr>`; }
    }
    $('#t-datos').innerHTML = h;
  }

  function todo() {
    dibujar(); lecturas(); lt.poner(t); graficas();
    if (!$('#p-eventos').hidden || !$('#p-tabla').hidden) tablas();
    if (MONT !== 'cilindro') acciones();
  }
  function recalcular() {
    try { simular(); }
    catch (e) { avisar(e.message); return; }
    lt.duracion = DUR; lt.simulado = DUR;
    lt.eventos = SIM ? SIM.eventos.filter(e => e.t > 0).map(e => ({ t: e.t, nombre: e.nombre })) : [];
    if (t > DUR) t = DUR;
    todo();
    if (autoguardar) autoguardado.guardar('termodinamica', escenaActual());
  }

  // ---------------------------------------------------------------------
  // Escenas: menú, guardar, abrir y autoguardado (formato .volta)
  // ---------------------------------------------------------------------
  /** Pone una escena del catálogo (sin simular). */
  function cargarEscena(e) {
    ESC = e; MONT = e.montaje; DUR = e.duracion; MONTAJE = null;
    VAR = copia(e.variables || {});
    GEO = geoDe(e); H_MAX = GEO.yTope - GEO.ep;
    guionPropio = false; guion = guionDe(e, vals());
    motor = e.modelo || 'dinamico'; especie = e.especie || 'mono'; modoValvula = 'gradual';
    sel = MONT === 'cilindro' ? 'gas' : MONT === 'recipientes' ? 'escena' : '';
    encuadreHecho = false; vistaManual = false;
    lt.duracion = DUR;
    ponerTitulo(e, 'Laboratorio de gases');
  }
  function abrirEscena1(clave) {
    const e = escenaPorClave(clave); if (!e) return;
    if (e.espacio !== ESPACIO) { irAEscenaDeOtroEspacio(e); return; }
    guardarHistorial();
    cargarEscena(e); construirVariables();
    jugando = false; t = 0;
    recalcular(); encuadrar(); escala0 = tz.vista.escala; zoomTexto(); inspector(); todo();
  }
  let autoguardar = false;
  const TIPOS_ACCION = { pesa: 'boolean', calentador: 'boolean', paredes: 'string', giro: 'number', valvula: 'boolean', bano: 'boolean' };
  function escenaActual() {
    return crearEscena({ modulo: 'termodinamica', espacio: ESPACIO, titulo: ESC.titulo, datos: instantanea() });
  }
  // Valida y acota lo que viene de un archivo antes de usarlo. Las escenas
  // guardadas antes del menú (sin clave) son el recorrido libre original.
  /** Acciones de un archivo: tipos conocidos, valores del tipo correcto y dentro de la duración. */
  function sanearGuion(acciones, dur) {
    return acciones
      .filter(a => a && TIPOS_ACCION[a.tipo] && typeof a.valor === TIPOS_ACCION[a.tipo] && Number.isFinite(a.t) && a.t >= 0 && a.t <= dur)
      .filter(a => a.tipo !== 'paredes' || a.valor === 'adiabaticas' || a.valor === 'conductoras')
      .filter(a => a.tipo !== 'giro' || (a.valor >= -180 && a.valor <= 180))
      .slice(0, 400)
      .map(a => ({ t: a.t, tipo: a.tipo, valor: a.valor, ...(Number.isInteger(a.i) && a.i >= 0 && a.i < 8 ? { i: a.i } : {}) }));
  }
  function datosSeguros(d = {}) {
    const instr = sanearInstrumentos(d.instr, INSTRUMENTOS), modoValvula = d.modoValvula === 'instantaneo' ? 'instantaneo' : 'gradual';
    const motorOk = d.motor === 'cuasiestatico' ? 'cuasiestatico' : 'dinamico';
    if (d.clave === 'propia') {
      // Escena propia: el montaje se sanea y se valida como el resto
      const { montaje, error } = sanearLab(d.montaje), e = escenaLab(montaje);
      const g = guionValidoLab(montaje, sanearGuion(Array.isArray(d.guion) ? d.guion : [], e.duracion));
      return { clave: 'propia', titulo: texto(d.titulo, 'Escena propia', 90), montaje, instr, guion: g, guionPropio: true, vars: {}, motor: motorOk, especie: e.especie || 'mono', modoValvula, error };
    }
    const base = ESCENAS_LAB.find(e => e.clave === d.clave) || escenaPorClave('recorrido');
    const vars = Object.fromEntries(Object.entries(base.variables).map(([k, def]) => [k, numero(d.vars?.[k], def.val, def.min, def.max)]));
    const guionOk = Array.isArray(d.guion) ? sanearGuion(d.guion, base.duracion) : null;
    return {
      clave: base.clave, guion: guionOk || guionDe(base, vars), guionPropio: d.clave ? !!d.guionPropio && !!guionOk : !!guionOk, vars, instr, montaje: null,
      motor: d.motor === 'cuasiestatico' ? 'cuasiestatico' : d.motor === 'dinamico' ? 'dinamico' : base.modelo || 'dinamico',
      especie: d.especie === 'di' ? 'di' : d.especie === 'mono' ? 'mono' : base.especie || 'mono', modoValvula,
    };
  }
  function guardar() {
    guardarEscena(escenaActual()).then(r => { if (r) avisar('Escena guardada'); }, e => avisar(`No se pudo guardar: ${e}`));
  }
  function abrir() {
    abrirEscena({ modulo: 'termodinamica' }).then(e => {
      if (aOtroEspacio(e, ESPACIO)) return;
      guardarHistorial(); const d = datosSeguros(e.datos); restaurar(d, true); encuadreHecho = false; vistaManual = false; irA(0); encuadrar(); escala0 = tz.vista.escala; zoomTexto(); todo();
      avisar(d.error ? `Escena abierta sin su montaje: ${d.error}` : `Escena abierta: ${texto(e.titulo, 'sin título', 60)}`);
    }).catch(err => avisar(err.message));
  }

  // Exportar datos a CSV (muestras)
  // Piezas compartidas: CSV con precisión completa y BOM (nucleo/csv.js) y
  // diálogo nativo «Guardar como» en la aplicación (componentes/exportar.js)
  $('#b-exportar').addEventListener('click', () => {
    if (!SIM) { avisar('No hay datos: la escena está vacía'); return; }
    let cols, filas;
    if (MONT === 'cilindro') { cols = ['t (s)', 'P (Pa)', 'V (m³)', 'T (K)', 'U (J)', 'Q (J)', 'W (J)', 'h (m)', 'v (m/s)']; filas = SIM.muestras.map(q => [q.t, q.P, q.V, q.T, q.U, Qtot(q), q.W, q.h, q.v]); }
    else if (MONT === 'recipientes') { cols = ['t (s)', ...REC.nombres.flatMap(n => [`P ${n} (Pa)`, `V ${n} (m³)`, `T ${n} (K)`, `n ${n} (mol)`])]; filas = SIM.muestras.map(q => [q.t, ...q.P.flatMap((p, i) => [p, q.V[i], q.T[i], q.n[i]])]); }
    else { const k = Object.keys(SIM.muestras[0]); cols = k; filas = SIM.muestras.map(q => k.map(c => q[c])); }
    descargarTexto('laboratorio-de-gases-datos.csv', aCSV(cols, filas)).then(r => { if (r) avisarExportado(filas.length); }, () => {});
  });
  function avisarExportado(n) {
    const area = document.getElementById('area') || document.querySelector('.lienzo-area');
    if (area) avisarLienzo(area, `Datos exportados: ${n} filas`);
  }

  // ---------------------------------------------------------------------
  // Reproducción
  // ---------------------------------------------------------------------
  // A 1×, las corridas largas (globo, burbuja) avanzan más deprisa
  const ritmo = () => (DUR > 50 ? DUR / 40 : 1);
  function cuadro(ahora) {
    if (jugando) {
      const dt = Math.min(0.05, (ahora - ultimo) / 1000) * velocidad * ritmo();
      t = Math.min(DUR, t + dt);
      if (t >= DUR) jugando = false;
      todo();
    }
    ultimo = ahora;
    requestAnimationFrame(cuadro);
  }
  function alternar() { if (t >= DUR) t = 0; jugando = !jugando; todo(); }
  const irA = nt => { jugando = false; t = Math.max(0, Math.min(DUR, nt)); todo(); };
  $('#b-play').addEventListener('click', alternar);
  $('#b-reiniciar').addEventListener('click', () => irA(0));
  $('#b-atras').addEventListener('click', () => irA(t - DUR / 2520));
  $('#b-adelante').addEventListener('click', () => irA(t + DUR / 2520));
  $('#b-deshacer').addEventListener('click', deshacer);
  $('#b-rehacer').addEventListener('click', rehacer);
  $('#velocidades').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) velocidad = parseFloat(b.dataset.v); });
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.capa; capas[k] = !capas[k]; b.setAttribute('aria-pressed', String(capas[k])); dibujar();
  }));
  ['#m-q', '#m-f', '#m-v', '#m-r'].forEach(s => $(s).addEventListener('change', todo));
  $('#pest').addEventListener('click', () => setTimeout(todo, 0));

  // ---------------------------------------------------------------------
  // Lienzo: acciones con clic, selección, zoom y desplazamiento
  // ---------------------------------------------------------------------
  const ACCION_CLIC = { pesa: alternarPesa, calentador: alternarCalentador, paredes: alternarParedes };
  lienzo.addEventListener('pointerdown', ev => {
    const r = lienzo.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    if (ev.button === 1 || ev.button === 2 || espacioPulsado) { paneo = [x, y, tz.vista.ox, tz.vista.oy]; lienzo.setPointerCapture(ev.pointerId); return; }
    const w = [tz.vista.mx(x), tz.vista.my(y)];
    // Herramienta de la paleta: colocar (la regla se traza arrastrando)
    if (herramienta === 'regla') { trazo = { a: w, b: w }; lienzo.setPointerCapture(ev.pointerId); return; }
    if (herramienta) { colocar(x, y, ev); return; }
    // Instrumentos: se seleccionan y se arrastran
    const zi = instrumentoEn(x, y);
    if (zi) { seleccionar(zi.id); arrastre = { tipo: 'instr', id: zi.id, parte: zi.parte, desde: w, movido: false }; lienzo.setPointerCapture(ev.pointerId); return; }
    // Topes del cilindro (con el cilindro seleccionado): se arrastran
    if (cercaTopes(y, w)) { arrastre = { tipo: 'topes', y: null, desde: w, movido: false }; lienzo.setPointerCapture(ev.pointerId); return; }
    const ob = objetoEn(x, y);
    // Recipientes: se seleccionan y se arrastran para cambiar su sitio en la fila
    if (ob && MONT === 'recipientes' && /^r\d+$/.test(ob) && REC.e.compartimientos.length > 1) { seleccionar(ob); arrastre = { tipo: 'rec', i: +ob.slice(1), desde: w, x: w[0], movido: false }; lienzo.setPointerCapture(ev.pointerId); return; }
    if (ob && MONT === 'cilindro' && ACCION_CLIC[ob]) { ACCION_CLIC[ob](); seleccionar(ob === 'paredes' ? 'cilindro' : ob); return; }
    if (ob && MONT === 'recipientes' && /^s\d+$/.test(ob) && REC.e.separadores[+ob.slice(1)].tipo === 'valvula') { seleccionar(ob); accion('valvula', !banderasRec(t).valvulas[+ob.slice(1)], +ob.slice(1)); return; }
    if (ob) { seleccionar(ob); return; }
    paneo = [x, y, tz.vista.ox, tz.vista.oy]; lienzo.setPointerCapture(ev.pointerId);
  });
  lienzo.addEventListener('pointermove', ev => {
    const r = lienzo.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    $('#cx').textContent = cantidad(tz.vista.mx(x), 'm', 4); $('#cy').textContent = cantidad(tz.vista.my(y), 'm', 4);
    if (paneo) { tz.vista.ox = paneo[2] + x - paneo[0]; tz.vista.oy = paneo[3] + y - paneo[1]; vistaManual = true; dibujar(); return; }
    const w = [tz.vista.mx(x), tz.vista.my(y)];
    cursorPx = [x, y];
    if (trazo) { trazo.b = w; dibujar(); return; }
    if (arrastre) { moverArrastre(w); return; }
    const ob = objetoEn(x, y), antes = hover;
    hover = ob;
    const topes = cercaTopes(y, w);
    lienzo.style.cursor = herramienta ? 'crosshair' : topes ? 'ns-resize' : ob && (esInstr(ob) || (MONT === 'recipientes' && /^r\d+$/.test(ob))) ? 'grab' : ob ? 'pointer' : 'default';
    if (ob !== antes || (ob && PISTAS[ob]) || herramienta) dibujar();
  });
  /** Cursor sobre los topes del cilindro seleccionado (vertical): se pueden arrastrar. */
  const cercaTopes = (y, w) => !!(SIM && MONT === 'cilindro' && sel === 'cilindro' && Math.abs(estado(t).ang) < 1e-9 && Math.abs(y - tz.vista.Y(GEO.yTope)) < 7 && Math.abs(w[0]) <= SIM.Rcil + 0.01);
  /** Arrastre en curso: instrumento, regla, recipiente o topes. */
  function moverArrastre(w) {
    const a = arrastre, d = [w[0] - a.desde[0], w[1] - a.desde[1]];
    if (!a.movido && Math.hypot(d[0], d[1]) * tz.vista.escala < 3) return;
    if (a.tipo === 'instr') {
      const o = INSTR.find(q => q.id === a.id); if (!o) return;
      if (!a.movido) guardarHistorial();
      if (o.tipo === 'regla') {
        if (a.parte === 'a' || a.parte === 'todo') o.a = [o.a[0] + d[0], o.a[1] + d[1]];
        if (a.parte === 'b' || a.parte === 'todo') o.b = [o.b[0] + d[0], o.b[1] + d[1]];
      } else {
        if (o.en) { const p = puntoInstr(o, estado(t)) || [0, 0]; delete o.en; delete o.u; delete o.w; o.x = p[0]; o.y = p[1]; }
        o.x += d[0]; o.y += d[1];
      }
      a.desde = w;
    } else if (a.tipo === 'rec') a.x = w[0];
    else if (a.tipo === 'topes') a.y = Math.max(0.05, Math.min(GEO.Hc - 0.08, w[1] - GEO.ep));
    a.movido = true; dibujar();
  }
  lienzo.addEventListener('pointerup', ev => {
    paneo = null;
    if (trazo) {
      const { a, b } = trazo; trazo = null;
      colocarInstrumento('regla', a, Math.hypot(b[0] - a[0], b[1] - a[1]) * tz.vista.escala < 8 ? null : b);
      if (!ev.shiftKey) ponerHerramienta(null);
      return;
    }
    const a = arrastre; arrastre = null;
    if (!a || !a.movido) return;
    if (a.tipo === 'instr') {
      const o = INSTR.find(q => q.id === a.id);
      if (o && o.tipo === 'regla') { o.a = o.a.map(x => Number(x.toPrecision(5))); o.b = o.b.map(x => Number(x.toPrecision(5))); }
      else if (o && o.tipo !== 'cronometro') { const r = regionEn([o.x, o.y]); delete o.x; delete o.y; Object.assign(o, r); }
      inspector(); todo(); guardarAuto();
    } else if (a.tipo === 'rec') {
      const rects = layoutRec(estado(t)), r = rects[a.i], cx = (r.x0 + r.x1) / 2 + a.x - a.desde[0];
      const k = rects.filter((q, j) => j !== a.i && (q.x0 + q.x1) / 2 < cx).length;
      if (k === a.i) { dibujar(); return; }
      const id = idRecipiente(a.i);
      cambiarMontaje(m => ({ montaje: reordenarLab(m, id, k), sel: id }), 'Recipiente movido en la fila');
    } else if (a.tipo === 'topes') {
      const id = idCilindro(), h = Number(a.y.toFixed(2));
      cambiarMontaje(m => ({ montaje: ajustarLab(m, id, 'hTopes', h), sel: id }), `Topes a ${cantidad(h, 'm', 3)}`, { encuadrar: false });
    }
  });
  lienzo.addEventListener('pointerleave', () => { cursorPx = null; if (hover || herramienta) { hover = null; dibujar(); } });
  lienzo.addEventListener('contextmenu', ev => ev.preventDefault());
  lienzo.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = lienzo.getBoundingClientRect();
    tz.vista.zoom(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top);
    vistaManual = true; zoomTexto(); dibujar();
  }, { passive: false });
  // Mientras el usuario no mueva la vista, el encuadre sigue al tamaño del lienzo
  let escala0 = 1;
  function zoomTexto() { $('#zoom').textContent = Math.round(tz.vista.escala / escala0 * 100) + ' %'; }
  function zoomCentro(f) { tz.vista.zoom(f, tz.w / 2, tz.h / 2); vistaManual = true; zoomTexto(); dibujar(); }
  function encuadrarTodo() { encuadrar(); escala0 = tz.vista.escala; vistaManual = false; zoomTexto(); dibujar(); }
  $('#b-zoom-mas').addEventListener('click', () => zoomCentro(1.25));
  $('#b-zoom-menos').addEventListener('click', () => zoomCentro(0.8));
  $('#b-encuadrar').addEventListener('click', encuadrarTodo);
  $('#b-vacia').addEventListener('click', escenaVacia);

  // ---------------------------------------------------------------------
  // Menú de escenas, teclado y paleta de comandos
  // ---------------------------------------------------------------------
  iniciarMenuEscenas(ESCENAS_LAB, () => ESC.clave, abrirEscena1);
  let espacioPulsado = false;
  const COMANDOS = () => [
    ['i-reproducir', 'Reproducir o pausar', 'Espacio', alternar],
    ['i-reiniciar', 'Reiniciar la simulación', 'Inicio', () => irA(0)],
    ...(MONT === 'cilindro' ? [
      ...(hayPesa() ? [['o-pesa', 'Poner o quitar la pesa', 'P', alternarPesa]] : []),
      ['o-calentador', 'Encender o apagar el calentador', 'C', alternarCalentador],
      ['o-cilindro', 'Cambiar las paredes: conductoras o adiabáticas', 'A', alternarParedes],
      ['o-embolo', 'Modelo cuasiestático o dinámico', '', () => cambiarMotor(motor === 'dinamico' ? 'cuasiestatico' : 'dinamico')],
    ] : []),
    ...(ESC.propio ? [] : [['i-historial', 'Restaurar las acciones de la escena', '', () => { guardarHistorial(); guionPropio = false; recalcular(); inspector(); }]]),
    ['i-mas', 'Escena vacía', '', escenaVacia],
    ['i-borrar', 'Quitar lo seleccionado', 'Supr', quitarSeleccion],
    ...Object.keys(NOMBRE_HERR).filter(h => h !== 'resorte').map(h => [INSTRUMENTOS.includes(h) ? ICONO_INSTR[h] : `o-${{ bano: 'bano-termico', columna: 'columna-liquido' }[h] || h}`, `Colocar: ${NOMBRE_HERR[h].toLowerCase()}`, '', () => ponerHerramienta(h), 'Paleta']),
    ['i-encuadrar', 'Encuadrar todo', 'F', encuadrarTodo],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['i-exportar', 'Exportar datos a CSV', '', () => $('#b-exportar').click()],
    ['i-guardar', 'Guardar escena', 'Ctrl S', () => guardar()],
    ['i-carpeta', 'Abrir escena', 'Ctrl O', () => abrir()],
    ...ESCENAS_LAB.map(e => [ICONO_TIPO[e.tipo], `Abrir escena: ${e.titulo}`, chipDe(e), () => abrirEscena1(e.clave), 'Escenas']),
  ];
  let selCmd = 0;
  function pintarComandos() {
    const q = $('#cmd-q').value.trim().toLowerCase();
    const todos = COMANDOS(), lista = todos.filter(c => c[1].toLowerCase().includes(q));
    selCmd = Math.min(selCmd, Math.max(0, lista.length - 1));
    let grupo = null, html = '';
    lista.forEach((c, i) => {
      const g = c[4] || 'Acciones';
      if (g !== grupo) { html += `<div class="menu-titulo">${g}</div>`; grupo = g; }
      html += `<div class="menu-item${i === selCmd ? ' activo' : ''}" data-i="${i}"><svg class="ico"><use href="#${c[0]}"/></svg>${c[1]}<span class="atajo">${c[2]}</span></div>`;
    });
    $('#cmd-lista').innerHTML = html;
    return lista;
  }
  function abrirComandos() { $('#menu-escenas').hidden = true; $('#velo-comandos').hidden = false; $('#cmd-q').value = ''; selCmd = 0; pintarComandos(); $('#cmd-q').focus(); }
  function cerrarComandos() { $('#velo-comandos').hidden = true; }
  $('#b-comandos').addEventListener('click', abrirComandos);
  $('#cmd-q').addEventListener('input', () => { selCmd = 0; pintarComandos(); });
  $('#cmd-lista').addEventListener('click', ev => { const it = ev.target.closest('.menu-item'); if (it) { const l = pintarComandos(); cerrarComandos(); l[+it.dataset.i][3](); } });
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
    if (mod && tecla === 'z') { ev.preventDefault(); deshacer(); return; }
    if (mod && tecla === 'y') { ev.preventDefault(); rehacer(); return; }
    if ((ev.target instanceof Element && ev.target.matches('input:not([type=checkbox]), textarea, select')) || mod) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); quitarSeleccion(); return; }
    if (ev.key === 'Escape' && (herramienta || trazo)) { trazo = null; ponerHerramienta(null); return; }
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) alternar(); espacioPulsado = true; }
    else if (ev.key === 'ArrowRight') irA(t + DUR / 2520);
    else if (ev.key === 'ArrowLeft') irA(t - DUR / 2520);
    else if (ev.key === 'Home') irA(0);
    else if (ev.key === 'Escape') $('#menu-escenas').hidden = true;
    else if (tecla === 'f') encuadrarTodo();
    else if (tecla === 'p') alternarPesa();
    else if (tecla === 'c') alternarCalentador();
    else if (tecla === 'a') alternarParedes();
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });

  // ---------------------------------------------------------------------
  // Arranque. Parámetros para capturas: ?escena=…&t=12&sel=embolo&pestana=energia&modelo=cuasiestatico
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  // Antes del arranque no hay escena que dibujar; después, también la vacía se vuelve a encuadrar
  let arrancado = false;
  window.addEventListener('resize', () => { tz.ajustar(); if (!arrancado) return; if (!vistaManual) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search);
    // Escena abierta desde Inicio, o la última sesión (no en capturas ni con parámetros)
    const limpio = ![...q.keys()].filter(k => k !== 'tema').length;
    const pend = escenaPendiente('termodinamica');
    if (pend && aOtroEspacio(pend, ESPACIO)) return;
    const previa = pend || (limpio ? autoguardado.leer('termodinamica', { modulo: 'termodinamica' }) : null);
    const pedida = q.has('escena') ? escenaPorClave(q.get('escena')) : null;
    if (pedida && pedida.espacio !== ESPACIO) { irAEscenaDeOtroEspacio(pedida); return; }
    if (pedida) cargarEscena(pedida);
    else if (previa) aplicarDatos(datosSeguros(previa.datos), true);
    else if (q.has('montaje')) {
      // Escena propia para capturas: ?montaje=<JSON>&guion=<JSON>&instr=<JSON> (se sanea como un archivo)
      const json = k => { try { return JSON.parse(q.get(k) || 'null'); } catch { return null; } };
      const d = datosSeguros({ clave: 'propia', titulo: 'Escena propia', montaje: json('montaje'), guion: json('guion') || [], instr: json('instr') || [] });
      aplicarDatos(d, true);
    } else if (q.has('vacia')) { ponerMontaje(montajeLabVacio(), 'Escena propia'); guion = []; guionPropio = true; sel = 'escena'; }
    else cargarEscena(ESC);
    if (q.has('instr') && !q.has('montaje')) { try { INSTR = sanearInstrumentos(JSON.parse(q.get('instr')), INSTRUMENTOS); } catch { INSTR = []; } }
    if (q.get('modelo') === 'cuasiestatico') motor = 'cuasiestatico';
    if (q.get('especie') === 'di') especie = 'di';
    if (q.has('sel')) sel = q.get('sel');
    if (!selValida(sel)) sel = selPorOmision();
    if (q.has('mostrar')) q.get('mostrar').split(',').forEach(k => { const c = $('#m-' + k); if (c) c.checked = true; });
    autoguardar = limpio || !!previa;
    simular(); construirVariables(); inspector();
    if (q.has('t')) t = Math.max(0, Math.min(DUR, parseFloat(q.get('t')) || 0));
    const pe = q.get('pestana') || q.get('pest'); if (pe) { const b = document.querySelector(`[aria-controls="p-${pe}"]`); if (b) b.click(); }
    tz.ajustar(); encuadrar(); escala0 = tz.vista.escala;
    recalcular(); zoomTexto();
    requestAnimationFrame(a => { ultimo = a; requestAnimationFrame(cuadro); });
    arrancado = true;
  });
})();
