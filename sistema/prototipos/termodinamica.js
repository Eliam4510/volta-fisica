/* ==========================================================================
   Volta · prototipo de Termodinámica — "Laboratorio de gases"
   Escena inspirada en MEXT 2019 P4: cilindro vertical con émbolo de masa m y
   sección A bajo la atmósfera P0, un mol de gas ideal monoatómico dentro, una
   pesa M que se pone y se quita, un calentador y paredes conductoras (en
   contacto con un baño a T0) o adiabáticas.
   La física está en el motor puro sistema/motores/gas.js (probado aparte en
   pruebas/gas.test.js): estado del gas, émbolo con masa y amortiguamiento,
   calor por las paredes, calentador, acciones programadas, modo
   cuasiestático y registro de energía.
   Misma estructura que mecanica.js: motor → estado(t) → lienzo → paneles.
   ========================================================================== */
import { aCSV } from '../nucleo/csv.js';
import { crearEscena, numero } from '../nucleo/escena.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';
import { descargarTexto, avisar as avisarLienzo } from '../componentes/exportar.js';
import { simularGas, estadoEn, banderas, NOMBRES_ACCION as NOMBRES, calorTotal, residuoGas, residuoEmbolo } from '../motores/gas.js';

(function () {
  'use strict';
  const { Trazo, fmt, cantidad, grafica, LineaTiempo, Termo } = Volta;
  const $ = s => document.querySelector(s);

  // ---------------------------------------------------------------------
  // Física: motor puro en sistema/motores/gas.js
  // ---------------------------------------------------------------------
  const DUR = 42;                        // duración simulada (s)
  const DT = 2e-4;                       // paso de integración (s)
  const MUESTRA = 0.01;                  // cada cuánto se guarda el estado (s)
  const TAU_Q = 4;                       // cuasiestático: tiempo en cargar o descargar la pesa (s)
  // Geometría de la escena (m). y = 0 es el fondo del cilindro y del tanque.
  const GEO = { Hc: 0.70, yTope: 0.66, ep: 0.04, hPesa: 0.08, colchon: 0.17, nivel: 0.56, borde: 0.62, hCal: 0.035 };
  const H_MAX = GEO.yTope - GEO.ep;      // el émbolo toca los topes con el gas a esta altura

  function simularEscena(p, guion, motor, especie) {
    const sim = simularGas({ ...p, especie, hMax: H_MAX }, guion, { modelo: motor, duracion: DUR, dt: DT, muestra: MUESTRA, tauCarga: TAU_Q });
    const Rcil = Math.sqrt(sim.A / Math.PI);       // radio del cilindro (dibujo)
    fasesMoleculas(sim, Rcil);
    return { ...sim, Rcil };
  }

  // Fases de las moléculas (cosméticas, no son física): avanzan con √T y, en
  // vertical, con 1/h. Se integran sobre las muestras con la regla del trapecio.
  function fasesMoleculas(sim, Rcil) {
    const ms = sim.muestras, ritmo = q => 0.6 * Math.sqrt(Math.max(q.T, 1) / 300);
    const vertical = q => ritmo(q) * (2 * Rcil) / Math.max(q.h, 0.02);
    let fx = 0, fy = 0;
    ms.forEach((q, i) => {
      if (i) { const p = ms[i - 1], d = q.t - p.t; fx += 0.5 * (ritmo(p) + ritmo(q)) * d; fy += 0.5 * (vertical(p) + vertical(q)) * d; }
      q.fx = fx; q.fy = fy;
    });
  }

  // ---------------------------------------------------------------------
  // Parámetros (variables de la escena)
  // ---------------------------------------------------------------------
  const VAR = {
    n:  { sim: 'n', val: 1, min: 0.25, max: 2, paso: 0.05, u: 'mol' },
    m:  { sim: 'm', val: 50, min: 5, max: 150, paso: 1, u: 'kg' },
    M:  { sim: 'M', val: 150, min: 0, max: 300, paso: 5, u: 'kg' },
    A:  { sim: 'A', val: 500, min: 400, max: 800, paso: 10, u: 'cm²' },
    P0: { sim: 'P', sub: '0', val: 101.3, min: 80, max: 120, paso: 0.1, u: 'kPa' },
    T0: { sim: 'T', sub: '0', val: 300, min: 250, max: 380, paso: 1, u: 'K' },
    Fc: { sim: 'Φ', sub: 'cal', val: 300, min: 0, max: 800, paso: 10, u: 'W' },
    G:  { sim: 'G', val: 6, min: 0.5, max: 20, paso: 0.5, u: 'W/K' },
    b:  { sim: 'b', val: 300, min: 0, max: 1500, paso: 10, u: 'kg/s' },
    g:  { sim: 'g', val: 9.8, min: 9.8, max: 9.8, paso: 0.01, u: 'm/s²', constante: true },
  };
  // Acciones programadas de la escena (como en el enunciado): cada una es un evento
  const GUION_ESCENA = [
    { t: 1, tipo: 'paredes', valor: 'adiabaticas' },
    { t: 2, tipo: 'pesa', valor: true },
    { t: 8, tipo: 'calentador', valor: true },
    { t: 16, tipo: 'calentador', valor: false },
    { t: 18, tipo: 'paredes', valor: 'conductoras' },
    { t: 30, tipo: 'pesa', valor: false },
  ];
  let guion = GUION_ESCENA.map(a => ({ ...a }));
  let motor = 'dinamico', especie = 'mono';
  const capas = { moleculas: true, vectores: true, instrumentos: true, cotas: true };
  let sel = 'gas', hover = null, cursorPx = null;
  const MOL = Termo.crearMoleculas(150);

  let SIM, ESC;   // simulación y escalas fijas de la corrida
  function parametros() {
    return { n: VAR.n.val, A: VAR.A.val * 1e-4, P0: VAR.P0.val * 1e3, T0: VAR.T0.val, g: VAR.g.val,
      m: VAR.m.val, M: VAR.M.val, Fc: VAR.Fc.val, G: VAR.G.val, b: VAR.b.val };
  }
  function simular() {
    SIM = simularEscena(parametros(), guion, motor, especie);
    // Escalas fijas para toda la corrida: ni las gráficas ni las barras saltan
    const ms = SIM.muestras, ext = (f) => { let lo = Infinity, hi = -Infinity; for (const q of ms) { const x = f(q); if (x < lo) lo = x; if (x > hi) hi = x; } return [lo, hi]; };
    const marg = ([lo, hi], fr = 0.08) => { const d = Math.max(hi - lo, Math.abs(hi) * 0.02, 1e-9); return [lo - d * fr, hi + d * fr]; };
    const absMax = (...fs) => Math.max(1e-9, ...ms.map(q => Math.max(...fs.map(f => Math.abs(f(q))))));
    const Q = calorTotal;
    ESC = {
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
  const estado = t => estadoEn(SIM, t);
  const Qtot = calorTotal;

  // ---------------------------------------------------------------------
  // Estado de la interfaz
  // ---------------------------------------------------------------------
  let t = 0, jugando = false, velocidad = 1, ultimo = 0, encuadreHecho = false;
  const lienzo = $('#lienzo');
  const tz = new Trazo(lienzo);
  let paneo = null;

  // ---------------------------------------------------------------------
  // Dibujo del lienzo
  // ---------------------------------------------------------------------
  const geo = () => { const R = SIM.Rcil; return { R, Rt: R + GEO.colchon, xc: Math.min(0.075, 0.6 * R), anchoPesa: Math.min(0.18, 1.4 * R) }; };
  function encuadrar() {
    const { Rt } = geo();
    tz.vista.encuadrar({ x0: -Rt - 0.21, x1: Rt + 0.36, y0: -0.06, y1: 0.84 }, { x: 0, y: 40, w: tz.w, h: tz.h - 80 }, 36);
    encuadreHecho = true;
  }
  const pesaPrevista = () => !banderas(guion, t).pesa && guion.some(a => a.tipo === 'pesa' && a.valor && a.t > t + 1e-9);

  function dibujar() {
    if (!encuadreHecho) encuadrar();
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
    const bbCal = tz.calentador(-xc, xc, GEO.hCal, 0, { grueso: hover === 'calentador' });
    const bbEmb = tz.embolo(-R, R, hp, GEO.ep, { grueso: hover === 'embolo', simbolo: [{ t: 'm', f: 'sim', tam: 14 }] });
    const carga = SIM.cuasi ? s.carga : (fl.pesa ? 1 : 0);
    let bbPesa = null;
    if (carga > 0.004) bbPesa = tz.pesa(0, ySup, anchoPesa, GEO.hPesa, { fraccion: carga, grueso: hover === 'pesa', simbolo: [{ t: 'M', f: 'sim', tam: 14 }] });
    else if (hover === 'pesa' || pesaPrevista()) bbPesa = tz.pesa(0, ySup, anchoPesa, GEO.hPesa, { prevista: true });

    // 7 · Magnitudes: calor (térmico), fuerzas (interacción), velocidad (movimiento)
    if (capas.vectores && $('#m-q').checked) {
      const k = ESC.kCalor;
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
    if (capas.instrumentos) {
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
    v.X(-Rt), v.Y(0.80), {});
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
      tz.ficha(v.X(-Rt) - 20 - wf, v.Y(0.74), [
        [{ t: rec.nombre, f: 'ui', tam: 11.5 }],
        [{ t: 't', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(rec.t, 's'), f: 'num', tam: 11.5 }],
      ], { ancla: [ax - 6, ay - 4] });
    }

    // 10 · Edición: selección, pista de la acción bajo el cursor y escala
    if (sel === 'gas') { const [X, Y, W, H] = tz.rectPx(-R, 0, R, hp); tz.seleccionRegion(X, Y, W, H, { dentroX: true, dentroY: true }); }
    else if (sel === 'embolo') tz.seleccionRegion(...bbEmb, { dentroX: true });
    else if (sel === 'pesa' && bbPesa) tz.seleccionCaja(...bbPesa);
    else if (sel === 'calentador') tz.seleccionCaja(...bbCal);
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
    const v = tz.vista, kF = 0.012, A = SIM.A, g = VAR.g.val;   // kF en px/N
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
      : [{ t: 'mg', f: 'sim', tam: 14, color: 'interaccion' }], xp, yc + Fp * kF + 16, { alinear: 'center' });
  }

  // Objeto bajo el cursor (px de pantalla)
  function objetoEn(x, y) {
    const v = tz.vista, s = estado(t), fl = banderas(guion, t), { R, Rt, xc, anchoPesa } = geo(), hp = s.h, ySup = hp + GEO.ep;
    const dentro = (x0, y0, x1, y1, m = 0) => { const [X, Y, W, H] = tz.rectPx(x0, y0, x1, y1); return x >= X - m && x <= X + W + m && y >= Y - m && y <= Y + H + m; };
    if (dentro(-anchoPesa / 2, ySup, anchoPesa / 2, ySup + GEO.hPesa, 3)) return 'pesa';
    if (dentro(-R, hp, R, ySup, 2)) return 'embolo';
    if (dentro(-xc, 0, xc, GEO.hCal, 8)) return 'calentador';
    const ap = tz.anchoPared(fl.adiab ? 'adiabatica' : 'conductora'), XL = v.X(-R), XR = v.X(R);
    if (y >= v.Y(GEO.Hc) - 4 && y <= v.Y(0) && ((x >= XL - ap - 5 && x <= XL + 5) || (x >= XR - 5 && x <= XR + ap + 5))) return 'paredes';
    if (dentro(-R, 0, R, hp)) return 'gas';
    if (dentro(-Rt, 0, Rt, GEO.nivel)) return 'bano';
    return null;
  }

  // ---------------------------------------------------------------------
  // Acciones (crean un evento en t) y deshacer
  // ---------------------------------------------------------------------
  const historial = [], porRehacer = [];
  const instantanea = () => ({ guion: guion.map(a => ({ ...a })), vars: Object.fromEntries(Object.entries(VAR).map(([k, d]) => [k, d.val])), motor, especie });
  function guardarHistorial() { historial.push(instantanea()); if (historial.length > 200) historial.shift(); porRehacer.length = 0; }
  function restaurar(e) { guion = e.guion; for (const k in e.vars) VAR[k].val = e.vars[k]; motor = e.motor; especie = e.especie; construirVariables(); inspector(); recalcular(); }
  function deshacer() { if (!historial.length) return; porRehacer.push(instantanea()); restaurar(historial.pop()); ocultarAviso(); }
  function rehacer() { if (!porRehacer.length) return; historial.push(instantanea()); restaurar(porRehacer.pop()); }

  // La historia se ramifica en t: las acciones posteriores se descartan
  function accion(tipo, valor) {
    guardarHistorial();
    const tt = t, descartadas = guion.filter(a => a.t > tt + 1e-9).length;
    const previa = guion.find(a => Math.abs(a.t - tt) < 1e-9 && a.tipo === tipo);
    guion = guion.filter(a => a.t < tt - 1e-9 || (a.t <= tt + 1e-9 && a.tipo !== tipo));
    // Si sin la acción de este instante ya se llega a ese estado, la acción se anula
    const b = banderas(guion, tt), ya = tipo === 'pesa' ? b.pesa === valor : tipo === 'calentador' ? b.cal === valor : b.adiab === (valor === 'adiabaticas');
    if (!ya) { guion.push({ t: tt, tipo, valor }); guion.sort((p, q) => p.t - q.t); }
    recalcular();
    const cola = descartadas ? ` · se descartan ${descartadas} ${descartadas > 1 ? 'acciones posteriores' : 'acción posterior'}` : '';
    avisar((ya && previa ? `Se anula «${NOMBRES[tipo](previa.valor)}» en t = ` : `${NOMBRES[tipo](valor)} en t = `) + cantidad(tt, 's') + cola);
  }
  const alternarPesa = () => accion('pesa', !banderas(guion, t).pesa);
  const alternarCalentador = () => accion('calentador', !banderas(guion, t).cal);
  const alternarParedes = () => accion('paredes', banderas(guion, t).adiab ? 'conductoras' : 'adiabaticas');
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
  const campoVar = k => `<div class="campo es-variable" data-ayuda="Ligado a la variable ${VAR[k].sim}${VAR[k].sub || ''}|Bound to variable"><span class="chip-var"><span class="sim">${simHTML(VAR[k])}</span></span><span class="valor-var" data-var="${k}"></span><span class="u">${VAR[k].u}</span></div>`;
  const fila = (etq, control) => `<div class="fila"><span class="etq">${etq}</span>${control}</div>`;
  const segmentado = (id, ops, actual) => `<div class="segmentado texto" id="${id}">${ops.map(([v, txt]) => `<button data-v="${v}" aria-pressed="${v === actual}">${txt}</button>`).join('')}</div>`;

  const OBJETOS = {
    gas: { ico: 'o-gas', nombre: 'Gas', props: () => fila('Cantidad', campoVar('n')) + fila('Especie', segmentado('p-especie', [['mono', 'Monoatómico'], ['di', 'Diatómico']], especie)),
      estado: () => `Gas ideal ${especie === 'di' ? 'diatómico' : 'monoatómico'} · ${fmt(VAR.n.val, 3)} mol` },
    embolo: { ico: 'o-embolo', nombre: 'Émbolo', props: () => fila('Masa', campoVar('m')) + fila('Sección', campoVar('A')) + fila('Disipación', campoVar('b')),
      estado: s => `Cuerpo rígido · ${s.h >= H_MAX - 1e-6 ? 'en los topes' : Math.abs(s.v) > 2e-3 ? (s.v > 0 ? 'sube' : 'baja') : 'en reposo'}` },
    pesa: { ico: 'o-pesa', nombre: 'Pesa', props: () => fila('Masa', campoVar('M')),
      estado: (s, fl) => `Cuerpo rígido · ${fl.pesa ? 'sobre el émbolo' : 'retirada'}` },
    calentador: { ico: 'o-calentador', nombre: 'Calentador', props: () => fila('Potencia', campoVar('Fc')),
      estado: (s, fl) => `Resistencia · ${fl.cal ? 'encendido' : 'apagado'}` },
    cilindro: { ico: 'o-cilindro', nombre: 'Cilindro', props: () => fila('Sección', campoVar('A')) + fila('Altura de los topes', `<div class="campo" data-ayuda="Fija en esta escena: el émbolo se detiene en los topes|Stop height"><input value="${fmt(H_MAX, 3)}" readonly tabindex="-1"><span class="u">m</span></div>`) + fila('Conducción', campoVar('G')),
      estado: (s, fl) => `Vertical · paredes ${fl.adiab ? 'adiabáticas' : 'conductoras'}` },
    bano: { ico: 'o-bano-termico', nombre: 'Baño térmico', props: () => fila('Temperatura', campoVar('T0')) + fila('Conducción', campoVar('G')),
      estado: (s, fl) => `Agua a temperatura fija · ${fl.adiab ? 'aislado' : 'en contacto'}` },
  };
  function inspector() {
    const o = OBJETOS[sel];
    $('#insp-ico').setAttribute('href', '#' + o.ico);
    $('#insp-nombre').textContent = o.nombre;
    $('#propiedades').innerHTML = o.props();
    const pe = $('#p-especie');
    if (pe) pe.addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) cambiarEspecie(b.dataset.v); });
    document.querySelectorAll('#arbol .nodo[data-sel]').forEach(n => n.setAttribute('aria-selected', String(n.dataset.sel === sel)));
  }
  function seleccionar(s) { if (s && OBJETOS[s] && s !== sel) { sel = s; inspector(); todo(); } }
  document.querySelectorAll('#arbol .nodo[data-sel]').forEach(n => n.addEventListener('click', () => seleccionar(n.dataset.sel)));

  $('#a-pesa').addEventListener('click', alternarPesa);
  $('#a-cal').addEventListener('change', ev => { if (ev.target.checked !== banderas(guion, t).cal) alternarCalentador(); });
  $('#a-paredes').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b && (b.dataset.v === 'adiabaticas') !== banderas(guion, t).adiab) alternarParedes(); });
  $('#a-motor').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) cambiarMotor(b.dataset.v); });

  // ---------------------------------------------------------------------
  // Paneles: lecturas, variables, gráficas, energía, eventos, tabla
  // ---------------------------------------------------------------------
  const lectura = ([a, b, val, u, rec = true]) => `<span class="sim">${a}${b ? `<sub${rec ? ' class="r"' : ''}>${b}</sub>` : ''}</span><span class="v">${fmt(val, 4)}</span><span class="u">${u}</span>`;
  function lecturas() {
    const s = estado(t), fl = banderas(guion, t);
    $('#reloj').innerHTML = `<span class="sim">t</span>${fmt(t, 4).padStart(6, ' ')}<span class="u">s</span>`;
    $('#lect-titulo').textContent = `Lecturas en t = ${fmt(t, 4)} s`;
    $('#acc-titulo').textContent = `Acciones en t = ${fmt(t, 4)} s`;
    $('#insp-estado').textContent = OBJETOS[sel].estado(s, fl);
    const filas = sel === 'embolo'
      ? [['h', '', s.h, 'm'], ['v', '', s.v, 'm/s'], ['E', 'k', s.Ek, 'J'], ['P', 'ext', SIM.P0 / 1e3 + s.me * VAR.g.val / SIM.A / 1e3, 'kPa']]
      : [['P', '', s.P / 1e3, 'kPa'], ['V', '', s.V * 1e3, 'L'], ['T', '', s.T, 'K'], ['U', '', s.U, 'J']];
    $('#lecturas').innerHTML = filas.map(lectura).join('');
    document.querySelectorAll('[data-var]').forEach(e => { e.textContent = fmtVar(VAR[e.dataset.var]); });
    // Acciones: reflejan la configuración en t
    $('#a-pesa span').textContent = fl.pesa ? 'Quitar la pesa' : 'Poner la pesa';
    $('#a-cal').checked = fl.cal; $('#a-cal-txt').textContent = fl.cal ? 'Encendido' : 'Apagado';
    document.querySelectorAll('#a-paredes button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.v === 'adiabaticas') === fl.adiab)));
    document.querySelectorAll('#a-motor button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === motor)));
    // Árbol de escena
    $('#arbol-pesa').textContent = cantidad(VAR.M.val, 'kg', 3);
    $('#arbol-cal').textContent = fl.cal ? cantidad(VAR.Fc.val, 'W', 3) : 'apagado';
    $('#arbol-bano').textContent = cantidad(VAR.T0.val, 'K', 3);
    $('#arbol-atm').textContent = cantidad(VAR.P0.val, 'kPa', 4);
    $('#arbol-g').textContent = cantidad(VAR.g.val, 'm/s²', 3);
    $('#b-play').innerHTML = `<svg class="ico"><use href="#i-${jugando ? 'pausar' : 'reproducir'}"/></svg>`;
    $('#b-play').dataset.ayuda = jugando ? 'Pausar|Pause|Espacio' : 'Reproducir|Play|Espacio';
    $('#b-deshacer').disabled = !historial.length; $('#b-rehacer').disabled = !porRehacer.length;
  }

  let arrastrandoVar = false;
  function construirVariables() {
    const cont = $('#variables'); cont.innerHTML = '';
    for (const [k, d] of Object.entries(VAR)) {
      const f = document.createElement('div'); f.className = 'var' + (d.constante ? ' constante' : '');
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
  }

  const lt = new LineaTiempo($('#tl'), { duracion: DUR, eventos: [], alCambiar: nt => { t = nt; jugando = false; todo(); } });

  // Serie de la corrida hasta tFin (cada 2 muestras) como [[x, y], …]
  function serie(f, tFin = DUR) {
    const ms = SIM.muestras, iFin = Math.min(ms.length - 1, Math.floor(tFin / MUESTRA + 1e-9)), p = [];
    for (let i = 0; i <= iFin; i += 2) p.push(f(ms[i]));
    if (tFin < DUR) p.push(f(estado(tFin)));
    return p;
  }
  const marcasEventos = () => SIM.eventos.filter(e => e.t > 0).map(e => ({ x: e.t }));

  function graficas() {
    if ($('#p-graficas').hidden === false) {
      const s = estado(t);
      graficaPV(s);
      const { X, Y } = grafica($('#g2'), { x: { min: 0, max: DUR }, y: { min: ESC.T[0], max: ESC.T[1] }, series: [{ tramos: [serie(q => [q.t, q.T])], familia: 'termico' }], cursor: t, puntoCursor: [t, s.T], eventos: marcasEventos() });
      referencia($('#g2'), X, Y, [[0, SIM.T0], [DUR, SIM.T0]], 'texto-3', [{ t: 'T', f: 'sim' }, { t: '0', f: 'sub' }], [0, DUR], ESC.T);
      grafica($('#g3'), { x: { min: 0, max: DUR }, y: { min: ESC.h[0], max: ESC.h[1] }, series: [{ tramos: [serie(q => [q.t, q.h])], familia: 'tinta' }], cursor: t, puntoCursor: [t, s.h], eventos: marcasEventos() });
      $('#l1').textContent = `${cantidad(s.P / 1e3, 'kPa')} · ${cantidad(s.V * 1e3, 'L')}`;
      $('#l2').textContent = cantidad(s.T, 'K');
      $('#l3').textContent = cantidad(s.h, 'm');
    }
    if ($('#p-energia').hidden === false) energiaPanel();
  }

  // Diagrama P-V: el proceso se dibuja hasta t; la isoterma y la adiabática que
  // pasan por el estado actual van como construcción auxiliar (1 px punteado)
  function graficaPV(s) {
    const cv = $('#g1'), V0 = s.V * 1e3, P0 = s.P / 1e3;
    const { X, Y } = grafica(cv, { x: { min: ESC.V[0], max: ESC.V[1] }, y: { min: ESC.P[0], max: ESC.P[1] }, series: [{ tramos: [serie(q => [q.V * 1e3, q.P / 1e3], t)], familia: 'tinta' }], puntoCursor: [V0, P0], eventos: [] });
    const c = cv.getContext('2d'), tk = Volta.leerTokens();
    if ($('#m-r').checked) {
      const curva = fP => { const p = []; for (let i = 0; i <= 80; i++) { const x = ESC.V[0] + (ESC.V[1] - ESC.V[0]) * i / 80; p.push([x, fP(x)]); } return p; };
      referencia(cv, X, Y, curva(x => P0 * V0 / x), 'termico', [{ t: 'isoterma', f: 'ui' }], ESC.V, ESC.P);
      referencia(cv, X, Y, curva(x => P0 * Math.pow(V0 / x, SIM.gam)), 'texto-3', [{ t: 'adiabática', f: 'ui' }], ESC.V, ESC.P, true);
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

  function energiaPanel() {
    const s = estado(t);
    const color = f => (f === 'tinta' ? 'var(--tinta)' : `var(--f-${f})`);
    const barras = (cont, titulo, filas, escala, pie) => {
      cont.innerHTML = `<div class="barras-tit">${titulo}</div>` + filas.map(([n, fam, val, ayuda]) => {
        const p = Math.min(50, Math.abs(val) / escala * 50), pos = val >= 0 ? `left:50%;width:${p}%` : `left:${50 - p}%;width:${p}%`;
        return `<div class="barra-e" data-ayuda="${ayuda}"><span>${n}</span><span class="riel"><i style="${pos};background:${color(fam)}"></i></span><span class="v">${cantidad(val, 'J', 4)}</span></div>`;
      }).join('') + `<div class="barras-pie">${pie}</div>`;
    };
    const resGas = residuoGas(s), resEmb = residuoEmbolo(s);
    barras($('#e-gas'), 'Gas · primera ley', [
      ['Calentador', 'termico', s.Qcal, 'Calor que da el calentador|Heater'],
      ['Baño', 'termico', s.Qbano, 'Calor que entra por las paredes desde el baño|Heat from the bath'],
      ['Disipación', 'termico', s.Edis, 'Energía disipada al mover el émbolo; vuelve al gas como calor|Dissipated energy'],
      ['Trabajo <span class="sim">W</span>', 'tinta', s.W, 'Trabajo que hace el gas sobre el émbolo|Work done by the gas'],
      ['Variación Δ<span class="sim">U</span>', 'tinta', s.dU, 'Variación de la energía interna del gas|Internal energy change'],
    ], ESC.gas, `<span class="sim">Q</span> − <span class="sim">W</span> − Δ<span class="sim">U</span> = ${cantidad(resGas, 'J', 2)}`);
    const filasEmb = [
      ['Atmósfera', 'tinta', s.Watm, 'Trabajo contra la atmósfera, P₀ΔV|Work against the atmosphere'],
      ['Potencial', 'cambio', s.Ep, 'Energía potencial gravitatoria ganada por el émbolo y la pesa|Gravitational potential energy'],
      ['Cinética', 'movimiento', s.Ek, 'Energía cinética del émbolo|Kinetic energy'],
      ['Disipación', 'termico', s.Edis, 'Energía disipada por el amortiguamiento y los choques|Dissipated energy'],
    ];
    if (!SIM.cuasi) filasEmb.push(['Aporte de la mano', 'tinta', s.Emano, 'Energía cinética que la mano da a la pesa al ponerla o se lleva al quitarla|Work by the hand']);
    barras($('#e-embolo'), 'Émbolo · destino de <span class="sim">W</span>', filasEmb, ESC.emb, `Residuo del balance = ${cantidad(resEmb, 'J', 2)}`);
    grafica($('#g4'), {
      x: { min: 0, max: DUR }, y: { min: ESC.E[0], max: ESC.E[1] },
      series: [
        { tramos: [serie(q => [q.t, Qtot(q)])], familia: 'termico' },
        { tramos: [serie(q => [q.t, q.W])], familia: 'tinta', patron: 'discontinuo' },
        { tramos: [serie(q => [q.t, q.dU])], familia: 'tinta' },
      ],
      cursor: t, eventos: marcasEventos(),
    });
  }

  function tablas() {
    $('#t-eventos').innerHTML = '<tr><th>Evento</th><th>t (s)</th><th>P (kPa)</th><th>V (L)</th><th>T (K)</th><th>Q (J)</th><th>W (J)</th></tr>' +
      SIM.eventos.map(e => `<tr class="${Math.abs(e.t - t) < 0.006 ? 'actual' : ''}"><td style="font-family:var(--fuente-interfaz)">${e.nombre}</td><td>${fmt(e.t, 4)}</td><td>${fmt(e.P / 1e3, 5)}</td><td>${fmt(e.V * 1e3, 5)}</td><td>${fmt(e.T, 5)}</td><td>${fmt(e.Q, 4)}</td><td>${fmt(e.W, 4)}</td></tr>`).join('');
    let filas = '<tr><th>t (s)</th><th>P (kPa)</th><th>V (L)</th><th>T (K)</th><th>U (J)</th><th>Q (J)</th><th>W (J)</th><th>h (m)</th></tr>';
    for (let k = 0; k * 0.5 <= DUR + 1e-9; k++) {
      const tt = k * 0.5, s = estado(tt);
      filas += `<tr class="${Math.abs(tt - t) < 0.25 ? 'actual' : ''}"><td>${fmt(tt, 3)}</td><td>${fmt(s.P / 1e3, 5)}</td><td>${fmt(s.V * 1e3, 5)}</td><td>${fmt(s.T, 5)}</td><td>${fmt(s.U, 5)}</td><td>${fmt(Qtot(s), 4)}</td><td>${fmt(s.W, 4)}</td><td>${fmt(s.h, 4)}</td></tr>`;
    }
    $('#t-datos').innerHTML = filas;
  }

  function todo() {
    dibujar(); lecturas(); lt.poner(t); graficas();
    if (!$('#p-eventos').hidden || !$('#p-tabla').hidden) tablas();
  }
  function recalcular() {
    simular();
    lt.eventos = SIM.eventos.filter(e => e.t > 0).map(e => ({ t: e.t, nombre: e.nombre }));
    todo();
    if (autoguardar) autoguardado.guardar('termodinamica', escenaActual());
  }

  // ---------------------------------------------------------------------
  // Escena: guardar, abrir y autoguardado (formato .volta)
  // ---------------------------------------------------------------------
  let autoguardar = false;
  const TIPOS_ACCION = { pesa: 'boolean', calentador: 'boolean', paredes: 'string' };
  function escenaActual() {
    return crearEscena({ modulo: 'termodinamica', espacio: 'laboratorio-de-gases', titulo: 'Émbolo con pesa en un baño térmico', datos: instantanea() });
  }
  // Valida y acota lo que viene de un archivo antes de usarlo
  function datosSeguros(d = {}) {
    const vars = Object.fromEntries(Object.entries(VAR).map(([k, def]) => [k, numero(d.vars?.[k], def.val, def.min, def.max)]));
    const acciones = Array.isArray(d.guion) ? d.guion : GUION_ESCENA;
    const guionOk = acciones
      .filter(a => a && TIPOS_ACCION[a.tipo] && typeof a.valor === TIPOS_ACCION[a.tipo] && Number.isFinite(a.t) && a.t >= 0 && a.t <= DUR)
      .filter(a => a.tipo !== 'paredes' || a.valor === 'adiabaticas' || a.valor === 'conductoras')
      .map(a => ({ t: a.t, tipo: a.tipo, valor: a.valor }));
    return { guion: guionOk, vars, motor: d.motor === 'cuasiestatico' ? 'cuasiestatico' : 'dinamico', especie: d.especie === 'di' ? 'di' : 'mono' };
  }
  function guardar() {
    guardarEscena(escenaActual()).then(r => { if (r) avisar('Escena guardada'); }, e => avisar(`No se pudo guardar: ${e}`));
  }
  function abrir() {
    abrirEscena({ modulo: 'termodinamica' }).then(e => { guardarHistorial(); restaurar(datosSeguros(e.datos)); irA(0); avisar(`Escena abierta: ${e.titulo}`); })
      .catch(err => avisar(err.message));
  }

  // Exportar datos a CSV (muestras cada 0.01 s)
  // Piezas compartidas: CSV con precisión completa y BOM (nucleo/csv.js) y
  // diálogo nativo «Guardar como» en la aplicación (componentes/exportar.js)
  $('#b-exportar').addEventListener('click', () => {
    const filas = SIM.muestras.map(q => [q.t, q.P, q.V, q.T, q.U, Qtot(q), q.W, q.h, q.v]);
    const csv = aCSV(['t (s)', 'P (Pa)', 'V (m³)', 'T (K)', 'U (J)', 'Q (J)', 'W (J)', 'h (m)', 'v (m/s)'], filas);
    descargarTexto('laboratorio-de-gases-datos.csv', csv)
      .then(r => { if (r) avisarExportado(filas.length); }, () => {});
  });
  function avisarExportado(n) {
    const area = document.getElementById('area') || document.querySelector('.lienzo-area');
    if (area) avisarLienzo(area, `Datos exportados: ${n} filas`);
  }

  // ---------------------------------------------------------------------
  // Reproducción
  // ---------------------------------------------------------------------
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
  const irA = nt => { jugando = false; t = Math.max(0, Math.min(DUR, nt)); todo(); };
  $('#b-play').addEventListener('click', alternar);
  $('#b-reiniciar').addEventListener('click', () => irA(0));
  $('#b-atras').addEventListener('click', () => irA(t - 1 / 60));
  $('#b-adelante').addEventListener('click', () => irA(t + 1 / 60));
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
    const ob = objetoEn(x, y);
    if (ob && ACCION_CLIC[ob]) { ACCION_CLIC[ob](); seleccionar(ob === 'paredes' ? 'cilindro' : ob); return; }
    if (ob) { seleccionar(ob); return; }
    paneo = [x, y, tz.vista.ox, tz.vista.oy]; lienzo.setPointerCapture(ev.pointerId);
  });
  lienzo.addEventListener('pointermove', ev => {
    const r = lienzo.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    $('#cx').textContent = cantidad(tz.vista.mx(x), 'm', 4); $('#cy').textContent = cantidad(tz.vista.my(y), 'm', 4);
    if (paneo) { tz.vista.ox = paneo[2] + x - paneo[0]; tz.vista.oy = paneo[3] + y - paneo[1]; vistaManual = true; dibujar(); return; }
    const ob = objetoEn(x, y), antes = hover;
    hover = ob; cursorPx = [x, y];
    lienzo.style.cursor = ob ? 'pointer' : 'default';
    if (ob !== antes || (ob && PISTAS[ob])) dibujar();
  });
  lienzo.addEventListener('pointerup', () => { paneo = null; });
  lienzo.addEventListener('pointerleave', () => { if (hover) { hover = null; dibujar(); } });
  lienzo.addEventListener('contextmenu', ev => ev.preventDefault());
  lienzo.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = lienzo.getBoundingClientRect();
    tz.vista.zoom(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top);
    vistaManual = true; zoomTexto(); dibujar();
  }, { passive: false });
  // Mientras el usuario no mueva la vista, el encuadre sigue al tamaño del lienzo
  let escala0 = 1, vistaManual = false;
  function zoomTexto() { $('#zoom').textContent = Math.round(tz.vista.escala / escala0 * 100) + ' %'; }
  function zoomCentro(f) { tz.vista.zoom(f, tz.w / 2, tz.h / 2); vistaManual = true; zoomTexto(); dibujar(); }
  function encuadrarTodo() { encuadrar(); escala0 = tz.vista.escala; vistaManual = false; zoomTexto(); dibujar(); }
  $('#b-zoom-mas').addEventListener('click', () => zoomCentro(1.25));
  $('#b-zoom-menos').addEventListener('click', () => zoomCentro(0.8));
  $('#b-encuadrar').addEventListener('click', encuadrarTodo);

  // ---------------------------------------------------------------------
  // Teclado y paleta de comandos
  // ---------------------------------------------------------------------
  let espacioPulsado = false;
  const COMANDOS = [
    ['i-reproducir', 'Reproducir o pausar', 'Espacio', alternar],
    ['i-reiniciar', 'Reiniciar la simulación', 'Inicio', () => irA(0)],
    ['o-pesa', 'Poner o quitar la pesa', 'P', alternarPesa],
    ['o-calentador', 'Encender o apagar el calentador', 'C', alternarCalentador],
    ['o-cilindro', 'Cambiar las paredes: conductoras o adiabáticas', 'A', alternarParedes],
    ['o-embolo', 'Modelo cuasiestático o dinámico', '', () => cambiarMotor(motor === 'dinamico' ? 'cuasiestatico' : 'dinamico')],
    ['i-historial', 'Restaurar las acciones de la escena', '', () => { guardarHistorial(); guion = GUION_ESCENA.map(a => ({ ...a })); recalcular(); }],
    ['i-encuadrar', 'Encuadrar todo', 'F', encuadrarTodo],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['n-termometro', 'Colocar termómetro', '', () => {}],
    ['i-exportar', 'Exportar datos a CSV', '', () => $('#b-exportar').click()],
    ['i-guardar', 'Guardar escena', 'Ctrl S', () => guardar()],
    ['i-carpeta', 'Abrir escena', 'Ctrl O', () => abrir()],
  ];
  let selCmd = 0;
  function pintarComandos() {
    const q = $('#cmd-q').value.trim().toLowerCase();
    const lista = COMANDOS.filter(c => c[1].toLowerCase().includes(q));
    selCmd = Math.min(selCmd, Math.max(0, lista.length - 1));
    $('#cmd-lista').innerHTML = '<div class="menu-titulo">Acciones</div>' + lista.map((c, i) =>
      `<div class="menu-item${i === selCmd ? ' activo' : ''}" data-i="${COMANDOS.indexOf(c)}"><svg class="ico"><use href="#${c[0]}"/></svg>${c[1]}<span class="atajo">${c[2]}</span></div>`).join('');
    return lista;
  }
  function abrirComandos() { $('#velo-comandos').hidden = false; $('#cmd-q').value = ''; selCmd = 0; pintarComandos(); $('#cmd-q').focus(); }
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
    if (mod && tecla === 'z') { ev.preventDefault(); deshacer(); return; }
    if (mod && tecla === 'y') { ev.preventDefault(); rehacer(); return; }
    if ((ev.target instanceof Element && ev.target.matches('input:not([type=checkbox]), textarea')) || mod) return;
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) alternar(); espacioPulsado = true; }
    else if (ev.key === 'ArrowRight') irA(t + 1 / 60);
    else if (ev.key === 'ArrowLeft') irA(t - 1 / 60);
    else if (ev.key === 'Home') irA(0);
    else if (tecla === 'f') encuadrarTodo();
    else if (tecla === 'p') alternarPesa();
    else if (tecla === 'c') alternarCalentador();
    else if (tecla === 'a') alternarParedes();
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });

  // ---------------------------------------------------------------------
  // Arranque. Parámetros para capturas: ?t=12&sel=embolo&pestana=energia&modelo=cuasiestatico
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); if (!vistaManual && SIM) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } if (SIM) todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('modelo') === 'cuasiestatico') motor = 'cuasiestatico';
    if (q.get('especie') === 'di') especie = 'di';
    if (OBJETOS[q.get('sel')]) sel = q.get('sel');
    if (q.has('mostrar')) q.get('mostrar').split(',').forEach(k => { const c = $('#m-' + k); if (c) c.checked = true; });
    // Escena abierta desde Inicio, o la última sesión (no en capturas ni con parámetros)
    const limpio = ![...q.keys()].length;
    const previa = escenaPendiente('termodinamica') || (limpio ? autoguardado.leer('termodinamica', { modulo: 'termodinamica' }) : null);
    if (previa) { const d = datosSeguros(previa.datos); guion = d.guion; for (const k in d.vars) VAR[k].val = d.vars[k]; motor = d.motor; especie = d.especie; }
    autoguardar = limpio || !!previa;
    simular(); construirVariables(); inspector();
    if (q.has('t')) t = Math.max(0, Math.min(DUR, parseFloat(q.get('t')) || 0));
    const pe = q.get('pestana'); if (pe) { const b = document.querySelector(`[aria-controls="p-${pe}"]`); if (b) b.click(); }
    tz.ajustar(); encuadrar(); escala0 = tz.vista.escala;
    recalcular(); zoomTexto();
    requestAnimationFrame(a => { ultimo = a; requestAnimationFrame(cuadro); });
  });
})();
