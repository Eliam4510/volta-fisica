/* ==========================================================================
   Volta · Electrostática — espacio «Cargas y campos»
   Escena MEXT 2020 P2: dos cargas +q fijas en A(−a, 0) y B(a, 0) y una
   partícula de carga −q y masa m que se suelta en C(0, a). La física
   (Coulomb 1/r², superposición, Dormand–Prince 5(4) con salida densa y
   eventos por Brent) vive en el motor puro sistema/motores/electrostatica.js,
   probado aparte. Misma estructura que la pantalla de Mecánica.
   ========================================================================== */
import {
  K_COULOMB as K, campo, potencial, simularCargas, estadoEn, energiaEstado, componentesVelocidad,
} from '../motores/electrostatica.js';
import { aCSV, muestrear } from '../nucleo/csv.js';
import { evaluar, DIM as DIMS } from '../nucleo/unidades.js';
import { crearEscena, numero, texto, magnitud } from '../nucleo/escena.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';
import { descargarTexto, descargarLienzo } from '../componentes/exportar.js';

(function () {
  'use strict';
  const { Trazo, G, fmt, cantidad, grafica, LineaTiempo } = Volta;
  const { conPrefijo, nivelesAuto } = Volta.electro;
  const $ = s => document.querySelector(s);
  const DUR = 6.5;            // duración simulada (s)
  const R_CHOQUE = 0.02;      // distancia a una carga fija que cuenta como choque (m)

  // ---------------------------------------------------------------------
  // Variables de la escena (valor en la unidad que se muestra; si = factor a SI)
  // ---------------------------------------------------------------------
  const V = {
    q:  { sim: 'q', val: 1.0, min: 0.1, max: 3, paso: 0.05, u: 'µC', si: 1e-6 },
    a:  { sim: 'a', val: 1.0, min: 0.4, max: 2, paso: 0.05, u: 'm', si: 1 },
    m:  { sim: 'm', val: 2.0, min: 0.5, max: 10, paso: 0.1, u: 'g', si: 1e-3 },
    v0: { sim: 'v', sub: '0', val: 0, min: 0, max: 5, paso: 0.05, u: 'm/s', si: 1 },
    k:  { sim: 'k', val: K, constante: true, u: 'N·m²/C²', si: 1 },
  };
  const vsi = n => V[n].val * V[n].si;
  const VAL0 = Object.fromEntries(Object.entries(V).map(([k, d]) => [k, d.val]));
  const NOMBRES_VAR = Object.keys(V).filter(k => !V[k].constante);

  // ---------------------------------------------------------------------
  // Escena. Una magnitud ligada a una variable se guarda como {v, f}
  // (valor = f · variable); una libre, como número en SI.
  // ---------------------------------------------------------------------
  function escenaInicial() {
    return {
      cargas: [
        { id: 'A', nombre: 'A', fija: true, q: { v: 'q', f: 1 }, x: { v: 'a', f: -1 }, y: 0 },
        { id: 'B', nombre: 'B', fija: true, q: { v: 'q', f: 1 }, x: { v: 'a', f: 1 }, y: 0 },
        { id: 'P', nombre: 'Partícula', fija: false, q: { v: 'q', f: -1 }, x: 0, y: { v: 'a', f: 1 }, m: { v: 'm', f: 1 }, v0: { v: 'v0', f: 1 }, alfa: -90 },
      ],
      sonda: { x: -1.5, y: 1.05 },
    };
  }
  let escena = escenaInicial();
  const ligada = p => p != null && typeof p === 'object';
  const valor = p => (ligada(p) ? p.f * vsi(p.v) : p);
  const cargaPorId = id => escena.cargas.find(c => c.id === id);

  let FIJAS = [], PART = null;           // cargas resueltas en SI
  function resolverEscena() {
    const r = escena.cargas.map(c => ({ id: c.id, nombre: c.nombre, fija: c.fija, q: valor(c.q), x: valor(c.x), y: valor(c.y), m: c.m != null ? valor(c.m) : 0, v0: c.v0 != null ? valor(c.v0) : 0, alfa: c.alfa || 0 }));
    FIJAS = r.filter(c => c.fija); PART = r.find(c => !c.fija);
  }

  // ---------------------------------------------------------------------
  // Física: motor puro en sistema/motores/electrostatica.js (probado aparte).
  // campo(lista, x, y) y potencial(lista, x, y) son la superposición de
  // Coulomb; simularCargas integra la partícula y localiza los eventos.
  // ---------------------------------------------------------------------
  let SIM;
  function simular() {
    resolverEscena();
    const P = PART, a = vsi('a');
    // Ángulo exacto en los múltiplos de 90°: lanzada a −90° no sale del eje
    const [vx, vy] = componentesVelocidad(P.v0, P.alfa);
    const sim = simularCargas(
      { fijas: FIJAS, libres: [{ id: 'P', nombre: P.nombre, x: P.x, y: P.y, q: P.q, m: P.m, vx, vy }] },
      {
        duracion: DUR, rtol: 1e-10, atol: 1e-10, maxPasos: 200000, radioChoque: R_CHOQUE,
        hMax: 0.004,                  // muestras densas para trazos y gráficas
        // Escalas de la figura: "pasa por O" y "vuelve" a menos de 10⁻³·a;
        // un retorno con rapidez < 10⁻³·√(kq²/(m·a))
        escalaLongitud: a, escalaVelocidad: Math.sqrt(Math.abs(K * P.q * P.q / (P.m * a))),
      });
    // Nombres de la figura del examen cuando la partícula sale de C(0, a)
    const c = cargaPorId('P'), enC = ligada(c.y) && c.x === 0;
    const eventos = sim.eventos.map(e => {
      if (!enC) return e;
      if (e.tipo === 'inicio') return { ...e, nombre: e.nombre + ' en C' };
      return e.nombre === 'Vuelve al inicio' ? { ...e, nombre: 'Vuelve a C' } : e;
    });
    // T, S: instantes y estados [x, y, vx, vy] de los pasos aceptados
    SIM = { sim, T: sim.solucion.t, S: sim.solucion.y, eventos, tFin: sim.tFin, choque: sim.choque, E0: sim.E0, deriva: sim.deriva };
  }
  const estado = tt => estadoEn(SIM.sim, tt);
  const energia = s => energiaEstado(SIM.sim, [s.x, s.y, s.vx, s.vy]);

  // ---------------------------------------------------------------------
  // Estado de la interfaz
  // ---------------------------------------------------------------------
  let t = 0, jugando = false, velocidad = 1, ultimo = 0, encuadreHecho = false;
  const lienzo = $('#lienzo'), area = $('#area');
  const tz = new Trazo(lienzo);
  let arrastre = null, paneo = null, hover = null, herramienta = null, sel = 'P';
  const capas = { lineas: true, equi: true, mapa: false, malla: false, vectores: true, traza: true };
  // La escena MEXT guarda su vista: el campo dibujado es el de las cargas
  // fijas, el que actúa sobre la partícula (U = qV). "Todas las cargas"
  // añade el campo propio de la partícula.
  const vista = { fuentes: 'fijas', porMicro: 16, dVauto: true, dV: 2000, malla: 'log', vectorSonda: true, fichaSonda: true };
  const mostrar = { fuerza: true, velocidad: true, prevista: true, fuerzaFija: {} };
  let NIV = { paso: 2000, niveles: [], lo: 0, hi: 1 }, claveNiveles = '';

  // Escalas de dibujo fijadas por las magnitudes características de la escena
  function escalas() {
    const q = vsi('q'), a = vsi('a'), m = vsi('m');
    const Fref = K * q * q / (a * a), Eref = K * q / (a * a), vref = Math.sqrt(K * q * q / (m * a));
    return { F: 0.9 * a / Fref, E: 0.45 * a / Eref, v: 0.5 * a / vref, Eref };
  }
  const fuentesEn = s => (vista.fuentes === 'todas' ? [...FIJAS, { id: 'P', q: PART.q, x: s.x, y: s.y }] : FIJAS);

  // Niveles de equipotencial: dependen de la vista y de la escena en t = 0,
  // no del instante, para que no cambien mientras se reproduce.
  function actualizarNiveles() {
    const v = tz.vista, s0 = estado(0), f0 = fuentesEn(s0);
    const clave = [v.escala, v.ox, v.oy, tz.w, tz.h, vista.fuentes, vista.dVauto, vista.dV, JSON.stringify(f0.map(c => [c.x, c.y, c.q]))].join('|');
    if (clave === claveNiveles) return;
    claveNiveles = clave;
    NIV = nivelesAuto(tz, (x, y) => potencial(f0, x, y), vista.dVauto ? 0 : vista.dV);
  }
  // Número sin ceros sobrantes: 12.5 → "12.5", 10 → "10", −4 → "−4"
  const limpio = (n, dec = 3) => (Math.abs(n) < 1e-12 ? '0' : String(+n.toFixed(dec)).replace('-', '−'));
  const etiquetaV = Vn => limpio(Vn / 1e3) + ' kV';

  // ---------------------------------------------------------------------
  // Dibujo del lienzo
  // ---------------------------------------------------------------------
  function encuadrar() {
    const a = vsi('a'), xs = [...FIJAS.map(c => c.x), PART.x], ys = [...FIJAS.map(c => c.y), PART.y, -Math.abs(PART.y)];
    tz.vista.encuadrar({ x0: Math.min(...xs) - 1.2 * a, x1: Math.max(...xs) + 1.2 * a, y0: Math.min(...ys) - 0.45 * a, y1: Math.max(...ys) + 0.55 * a }, { x: 0, y: 40, w: tz.w, h: tz.h - 80 }, 24);
    encuadreHecho = true; claveNiveles = '';
  }

  function dibujar() {
    if (!encuadreHecho) encuadrar();
    actualizarNiveles();
    const v = tz.vista, s = estado(t), ES = escalas();
    const fuentes = fuentesEn(s);
    const Vdib = (x, y) => potencial(fuentes, x, y), Edib = (x, y) => campo(fuentes, x, y);
    const todas = [...FIJAS, { id: 'P', q: PART.q, x: s.x, y: s.y }];
    const huecos = todas.map(c => [...v.P([c.x, c.y]), G.carga + 3]);
    const huecosEjes = [...huecos, ...SIM.eventos.filter(e => e.t > 0).map(e => [...v.P([e.x, e.y]), 10])];

    // 1–2. Fondo, mapa de potencial y equipotenciales (son un mapa de V)
    tz.limpiar(); tz.cuadricula();
    if (capas.mapa) tz.mapaPotencial(Vdib, { escala: Math.max(Math.abs(NIV.lo), Math.abs(NIV.hi), 1) });
    const polis = capas.equi ? tz.equipotenciales(Vdib, NIV.niveles) : [];

    // 5. Construcción: ejes, trayectorias, posición inicial, eventos
    tz.ejesLibres({ x: 'x', y: 'y' }, huecosEjes);
    const muestra = (t0, t1) => { const p = []; for (let i = 0; i < SIM.T.length && SIM.T[i] <= t1; i++) if (SIM.T[i] >= t0) p.push([SIM.S[i][0], SIM.S[i][1]]); const e = estado(t1); p.push([e.x, e.y]); return p; };
    if (mostrar.prevista) tz.trayectoria(muestra(0, SIM.tFin), 'prevista');
    if (capas.traza && t > 0) tz.trayectoria(muestra(0, Math.min(t, SIM.tFin)), 'real');
    const s0 = SIM.S[0];
    if (Math.hypot(s.x - s0[0], s.y - s0[1]) * v.escala > 3) tz.fantasma([s0[0], s0[1]], { radio: G.carga });
    const evs = SIM.eventos.filter(e => e.t > 0);
    const vistos = [];
    const unaVez = e => { const [x, y] = v.P([e.x, e.y]); if (vistos.some(([a, b]) => Math.hypot(a - x, b - y) < 4)) return false; vistos.push([x, y]); return true; };
    evs.filter(e => e.t <= t + 1e-9).forEach(e => { if (unaVez(e)) tz.eventoAnillo([e.x, e.y]); });
    evs.filter(e => e.t > t + 1e-9).forEach(e => { if (unaVez(e)) { tz.ctx.save(); tz.ctx.globalAlpha = 0.45; tz.eventoAnillo([e.x, e.y]); tz.ctx.restore(); } });

    // 6. Materia: cargas fijas y partícula
    for (const c of FIJAS) tz.carga([c.x, c.y], c.q >= 0 ? 1 : -1, { seleccionada: sel === c.id });
    tz.carga([s.x, s.y], PART.q >= 0 ? 1 : -1, { seleccionada: sel === 'P' });

    // 7. Magnitudes: líneas de campo, malla de E, fuerza y velocidad
    // Con "Solo las fijas" la partícula no es fuente: las líneas pasan por detrás de su disco
    const ocultar = vista.fuentes === 'fijas' ? [[...v.P([s.x, s.y]), G.carga + 1.5]] : [];
    if (capas.lineas) tz.lineasCampo(fuentes.map(c => ({ p: [c.x, c.y], q: c.q })), Edib, { porCoulomb: vista.porMicro * 1e6, halo: capas.mapa, ocultar });
    if (capas.malla) tz.mallaCampo(Edib, { Eref: ES.Eref, escalaTipo: vista.malla, evitar: huecos.map(h => [h[0], h[1], 22]), halo: capas.mapa });
    const etiquetasVec = [];
    if (capas.vectores) {
      vectoresParticula(s, ES, etiquetasVec);
      for (const c of FIJAS) if (mostrar.fuerzaFija[c.id]) vectorFuerzaFija(c, s, ES, etiquetasVec);
    }

    // 8. Instrumentos: sonda de campo con su lectura
    const ocupado = dibujarSonda(Edib, Vdib, ES);

    // 9. Anotaciones: valores de las equipotenciales, nombres de puntos y cargas, ficha de evento
    const evitar = [...huecos.map(h => [h[0], h[1], 16]), [...v.P([escena.sonda.x, escena.sonda.y]), 18]];
    const [X0, Y0] = v.P([0, 0]), bandasEjes = [[0, Y0 + 2, tz.w, Y0 + 18], [X0 - 44, 0, X0 - 2, tz.h]];   // números de los ejes
    if (capas.equi) tz.etiquetasEquipotenciales(polis, { formato: etiquetaV, evitar, ocupado: [...ocupado, ...etiquetasVec, ...bandasEjes] });
    etiquetasEscena(s);
    const primero = SIM.eventos.find(e => e.nombre === 'Pasa por O');
    if (primero) {
      const [px, py] = v.P([primero.x, primero.y]);
      tz.ficha(px - 200, py + 56, [
        [{ t: 'Pasa por O', f: 'ui', tam: 11.5 }, { t: ' · ', f: 'num', tam: 11.5, color: 'texto-3' }, { t: 't', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(primero.t, 's'), f: 'num', tam: 11.5 }],
        [{ t: 'v', f: 'sim', tam: 13, color: 'movimiento' }, { t: ' = ' + cantidad(primero.v, 'm/s'), f: 'num', tam: 11.5 }],
      ], { ancla: [px - 3, py + 8] });
    }

    // 10. Edición: hover, guías de arrastre, colocación
    if (hover && !arrastre) {
      if (hover === 'sonda') tz.contornoHover([escena.sonda.x, escena.sonda.y], Volta.electro.GE.sonda);
      else { const c = hover === 'P' ? { x: s.x, y: s.y } : FIJAS.find(f => f.id === hover); if (c) tz.contornoHover([c.x, c.y], G.carga); }
    }
    if (arrastre && arrastre.tipo === 'carga') guiaArrastre(arrastre.id);
    tz.barraEscala(16, tz.h - 56);
  }

  // Vector fuerza (interacción) y velocidad (movimiento) sobre la partícula.
  // Si son casi paralelos y del mismo sentido (al caer hacia O) se dibujan
  // lado a lado, separados 3.5 px de la recta de acción, para que ninguno
  // tape al otro; las etiquetas se separan si coinciden.
  function vectoresParticula(s, ES, ocupado) {
    const v = tz.vista, [ex, ey] = campo(FIJAS, s.x, s.y), F = [PART.q * ex, PART.q * ey], Fm = Math.hypot(...F), vm = Math.hypot(s.vx, s.vy);
    const items = [];
    if (mostrar.fuerza && Fm * ES.F * v.escala > 2) items.push({ vec: F, k: ES.F * v.escala, familia: 'interaccion', simbolo: 'F', valor: Fm * 1e3, unidad: 'mN' });
    if (mostrar.velocidad && vm * ES.v * v.escala > 2) items.push({ vec: [s.vx, s.vy], k: ES.v * v.escala, familia: 'movimiento', simbolo: 'v', valor: vm, unidad: 'm/s' });
    items.sort((p, q) => Math.hypot(...q.vec) * q.k - Math.hypot(...p.vec) * p.k);
    const [x, y] = v.P([s.x, s.y]);
    const unit = w => { const m = Math.hypot(...w); return [w[0] / m, w[1] / m]; };
    const paralelos = items.length === 2 && (([a, b], [c, d]) => a * c + b * d)(unit(items[0].vec), unit(items[1].vec)) > 0.985;
    items.forEach((it, i) => {
      const [ux, uy] = unit(it.vec), d = paralelos ? (i ? 3.5 : -3.5) / v.escala : 0;
      it.origen = [s.x - uy * d, s.y + ux * d];
      it.punta = tz.vector(it.origen, it.vec, { familia: it.familia, escalaPx: it.k, desdeRadio: Volta.G.carga + 1 });
      // El vector nace en el borde de la carga: el origen de la etiqueta también
      const rBorde = (Volta.G.carga + 1) / v.escala;
      it.origen = [it.origen[0] + ux * rBorde, it.origen[1] + uy * rBorde];
      const [ox, oy] = v.P(it.origen), [px, py] = it.punta;
      ocupado.push([Math.min(ox, px) - 6, Math.min(oy, py) - 6, Math.max(ox, px) + 6, Math.max(oy, py) + 6]);
    });
    items.slice().reverse().forEach(it => etiquetaVector(...v.P(it.origen), it, ocupado));
  }
  function vectorFuerzaFija(c, s, ES, ocupado) {
    const otras = [...FIJAS.filter(f => f.id !== c.id), { q: PART.q, x: s.x, y: s.y }];
    const [ex, ey] = campo(otras, c.x, c.y), F = [c.q * ex, c.q * ey], Fm = Math.hypot(...F), k = ES.F * tz.vista.escala;
    if (Fm * k < 2) return;
    const [x, y] = tz.vista.P([c.x, c.y]), it = { vec: F, k, familia: 'interaccion', simbolo: 'F', sub: c.nombre, valor: Fm * 1e3, unidad: 'mN' };
    it.punta = tz.vector([c.x, c.y], F, { familia: 'interaccion', escalaPx: k, desdeRadio: Volta.G.carga + 1 });
    const r = (Volta.G.carga + 1) / Fm;
    etiquetaVector(x + F[0] * r, y - F[1] * r, it, ocupado);
  }
  // Etiqueta ISO en la punta (misma regla que Trazo.vector), desplazada si choca
  function etiquetaVector(x, y, it, ocupado) {
    const [x2, y2] = it.punta, ang = Math.atan2(y2 - y, x2 - x), c = Math.cos(ang);
    let lx = x2 + c * 10 + (c >= 0 ? 2 : -2), ly = y2 + Math.sin(ang) * 10 + 5;
    const alinear = c >= -0.2 ? 'left' : 'right', w = 104;
    const caja = () => (alinear === 'left' ? [lx, ly - 13, lx + w, ly + 4] : [lx - w, ly - 13, lx, ly + 4]);
    for (let n = 0; n < 4 && ocupado.some(r => r[0] < caja()[2] && caja()[0] < r[2] && r[1] < caja()[3] && caja()[1] < r[3]); n++) ly += Math.sin(ang) >= 0 ? 17 : -17;
    tz.etiquetaMagnitud(lx, ly, { simbolo: it.simbolo, sub: it.sub, subRecto: true, valor: it.valor, unidad: it.unidad, color: it.familia, alinear });
    ocupado.push(caja());
  }

  // Sonda: vector E (eléctrico) y ficha con E y V. Devuelve las cajas que ocupa.
  function dibujarSonda(Edib, Vdib, ES) {
    const p = escena.sonda, [ex, ey] = Edib(p.x, p.y), E = Math.hypot(ex, ey), Vp = Vdib(p.x, p.y), v = tz.vista;
    const ocupado = [];
    if (vista.vectorSonda && E > 0) {
      let k = ES.E * v.escala; if (E * k > 150) k = 150 / E;   // largo máximo; el valor exacto está en la ficha
      const [x2, y2] = tz.vector([p.x, p.y], [ex, ey], { familia: 'electrico', escalaPx: k, simbolo: 'E' });
      ocupado.push([x2 - 14, y2 - 14, x2 + 24, y2 + 18]);
    }
    const [x, y] = tz.sonda([p.x, p.y], { seleccionada: sel === 'sonda', hover: hover === 'sonda' && !arrastre });
    if (vista.fichaSonda) {
      const lineas = [
        [{ t: 'Sonda P', f: 'ui', tam: 11.5 }],
        [{ t: 'E', f: 'sim', tam: 13, color: 'electrico' }, { t: ' = ' + conPrefijo(E, 'V/m'), f: 'num', tam: 11.5 }],
        [{ t: 'V', f: 'sim', tam: 13, color: 'electrico' }, { t: ' = ' + conPrefijo(Vp, 'V'), f: 'num', tam: 11.5 }],
      ];
      const W = 132, Hf = 56, izquierda = ex > 0 ? x - 26 - W > 8 : x + 26 + W > tz.w - 8;
      const fx = izquierda ? x - 26 - W : x + 26, fy = Math.max(48, Math.min(tz.h - Hf - 48, y + (ey > 0 ? 8 : -Hf - 8)));
      tz.ficha(fx, fy, lineas, { ancla: [x + (izquierda ? -10 : 10), y] });
      ocupado.push([fx, fy, fx + W, fy + Hf]);
    }
    return ocupado;
  }

  // Nombres de cargas y puntos, como en la figura del examen: A(−a, 0), B(a, 0), C(0, a), O
  function coordTexto(c) {
    const parte = p => (ligada(p) ? { t: (p.f < 0 ? '−' : '') + V[p.v].sim, f: 'sim', tam: 13, color: 'texto-2' } : { t: fmt(p, 3), f: 'num', tam: 11, color: 'texto-2' });
    const libres = !ligada(c.x) && !ligada(c.y);
    if (libres && (c.x !== 0 || c.y !== 0)) return [{ t: ` (${fmt(c.x, 3)}, ${fmt(c.y, 3)}) m`, f: 'num', tam: 11, color: 'texto-3' }];
    return [{ t: ' (', f: 'ui', tam: 12, color: 'texto-2' }, parte(c.x), { t: ', ', f: 'ui', tam: 12, color: 'texto-2' }, parte(c.y), { t: ')', f: 'ui', tam: 12, color: 'texto-2' }];
  }
  function etiquetasEscena(s) {
    const v = tz.vista, [X0, Y0] = v.P([0, 0]);
    if (X0 > 0 && X0 < tz.w && Y0 > 0 && Y0 < tz.h) tz.compuesto([{ t: 'O', f: 'ui', tam: 12 }], X0 - 9, Y0 - 7, { alinear: 'right', color: 'texto-2' });
    for (const c of escena.cargas.filter(c => c.fija)) {
      const r = FIJAS.find(f => f.id === c.id), [x, y] = v.P([r.x, r.y]);
      tz.compuesto([{ t: c.nombre, f: 'ui', tam: 12, color: 'texto' }, ...coordTexto(c)], x, y - G.carga - 8, { alinear: 'center' });
    }
    // Partícula y su punto de partida C
    const P = cargaPorId('P'), [px, py] = v.P([s.x, s.y]);
    const qTxt = ligada(P.q) ? (P.q.f < 0 ? '−' : '') + 'q' : conPrefijo(valor(P.q), 'C', 3);
    tz.compuesto([{ t: qTxt, f: ligada(P.q) ? 'sim' : 'num', tam: ligada(P.q) ? 14 : 11.5 }, { t: ', ', f: 'ui', tam: 12, color: 'texto-2' }, { t: 'm', f: 'sim', tam: 14 }], px + G.carga + 7, py - 6, {});
    const s0 = SIM.S[0], [cx, cy] = v.P([s0[0], s0[1]]);
    if (ligada(P.y) && P.x === 0) tz.compuesto([{ t: 'C', f: 'ui', tam: 12, color: 'texto' }, ...coordTexto(P)], cx - G.carga - 7, cy - 6, { alinear: 'right' });
  }

  // Guías de construcción y ficha mientras se arrastra una carga
  function guiaArrastre(id) {
    const c = id === 'P' ? { x: PART.x, y: PART.y, nombre: 'Partícula' } : FIJAS.find(f => f.id === id);
    if (!c) return;
    const v = tz.vista, [x, y] = v.P([c.x, c.y]), [X0, Y0] = v.P([0, 0]);
    tz.lineaPx([[x, y], [x, Y0]], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
    tz.lineaPx([[x, y], [X0, y]], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
    tz.ficha(x + 18, y - 44, [
      [{ t: id === 'P' ? 'Partícula' : 'Carga ' + c.nombre, f: 'ui', tam: 11.5 }],
      [{ t: 'x', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(c.x, 'm', 3) + '   ', f: 'num', tam: 11.5 }, { t: 'y', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(c.y, 'm', 3), f: 'num', tam: 11.5 }],
    ]);
  }

  // ---------------------------------------------------------------------
  // Unidades de los campos del inspector
  // ---------------------------------------------------------------------
  // Campos con unidades y expresiones (nucleo/unidades.js): «3 µC», «−2q»,
  // «30 cm», «k q/a». Sin unidad, se usa la del campo.
  const UNI = { carga: { u: 'µC', f: 1e-6 }, longitud: { u: 'm', f: 1 }, masa: { u: 'g', f: 1e-3 }, velocidad: { u: 'm/s', f: 1 }, potencial: { u: 'kV', f: 1e3 } };
  const DIM = { q: 'carga', x: 'longitud', y: 'longitud', m: 'masa', v0: 'velocidad', dV: 'potencial' };
  const DIM_VAR = { q: DIMS.carga, a: DIMS.longitud, m: DIMS.masa, v0: DIMS.velocidad, k: DIMS.fuerza.map((e, i) => e + 2 * DIMS.longitud[i] - 2 * DIMS.carga[i]) };
  function leerCantidad(txt, dim) {
    const variables = Object.fromEntries(Object.keys(V).map(n => [n, { valor: vsi(n), dim: DIM_VAR[n] }]));
    try { return { valor: evaluar(txt, { variables, esperada: dim, unidadPorDefecto: UNI[dim] && UNI[dim].u }).valor }; }
    catch (e) { return { error: e.message }; }
  }


  // ---------------------------------------------------------------------
  // Paneles: árbol, inspector, lecturas, variables
  // ---------------------------------------------------------------------
  const ico = id => `<svg class="ico"><use href="#${id}"/></svg>`;
  const simHTML = (a, b, recta) => `<span class="sim">${a}${b ? `<sub${recta ? ' class="r"' : ''}>${b}</sub>` : ''}</span>`;
  const conSigno = (v, u, c = 3) => (v > 0 ? '+' : '') + cantidad(v, u, c);

  function construirArbol() {
    const filas = escena.cargas.map(c => {
      const q = valor(c.q), nombre = c.fija ? 'Carga ' + c.nombre : c.nombre;
      const acc = sel === c.id ? `<span class="acciones fijas">${ico('i-ojo')}</span>` : c.fija ? `<span class="acciones">${ico('i-candado')}</span>` : '';
      return `<div class="nodo" data-sel="${c.id}" aria-selected="${sel === c.id}">${ico(q >= 0 ? 'o-carga-positiva' : 'o-carga-negativa')}<span class="nombre">${nombre}</span><span class="dato">${conSigno(q * 1e6, 'µC')}</span>${acc}</div>`;
    });
    filas.push(`<div class="nodo" data-sel="sonda" aria-selected="${sel === 'sonda'}">${ico('n-sonda-campo')}<span class="nombre">Sonda P</span><span class="dato" id="arbol-sonda"></span>${sel === 'sonda' ? `<span class="acciones fijas">${ico('i-ojo')}</span>` : ''}</div>`);
    filas.push(`<div class="nodo global" data-sel="campo" aria-selected="${sel === 'campo'}">${ico('i-capas')}<span class="nombre">Vista del campo</span><span class="dato" id="arbol-campo"></span></div>`);
    $('#arbol').innerHTML = filas.join('');
    if (SIM) lecturas();
  }
  $('#arbol').addEventListener('click', ev => { const n = ev.target.closest('.nodo'); if (n) seleccionar(n.dataset.sel); });
  function seleccionar(id) { sel = id; construirArbol(); construirInspector(); todo(); }

  // Campo numérico del inspector: ligado (chip con la variable) o libre (entrada)
  // compacto: el campo va en media fila (fila-doble). Ahí un campo ligado con
  // signo (−a) no cabe con la letra del eje delante, y el chip ocupa su lugar.
  function campoHTML(clave, prop, dim, eje, compacto) {
    const u = UNI[dim], e = eje && !(compacto && ligada(prop) && prop.f < 0) ? `<span class="eje">${eje}</span>` : '';
    if (ligada(prop)) {
      const d = V[prop.v], nombre = d.sim + (d.sub || '');
      return `<div class="campo es-variable" data-desligar="${clave}" data-ayuda="${eje ? eje + ' ligado' : 'Ligado'} a la variable ${nombre} · doble clic para desligar|Bound to variable">${e}<span class="chip-var">${simHTML((prop.f < 0 ? '−' : '') + d.sim, d.sub, true)}</span><span class="valor-var" data-ligado="${clave}"></span><span class="u">${u.u}</span></div>`;
    }
    return `<div class="campo">${e}<input data-clave="${clave}" value="${fmt(prop / u.f, 3)}" spellcheck="false"><span class="u">${u.u}</span></div>`;
  }
  const casilla = (clave, txt, color, discontinua, marcada) => `<label class="casilla"><input type="checkbox" data-mostrar="${clave}"${marcada ? ' checked' : ''}>${txt}${color ? `<span class="muestra${discontinua ? ' discontinua' : ''}" style="color:var(--${color})"></span>` : ''}</label>`;
  const grupo = (titulo, cuerpo, id) => `<details class="grupo" open><summary>${ico('i-chevron-abajo')}<span${id ? ` id="${id}"` : ''}>${titulo}</span></summary>${cuerpo}</details>`;

  function construirInspector() {
    let h = '';
    if (sel === 'sonda') {
      const p = escena.sonda;
      h += `<div class="insp-cab"><div class="miniatura">${ico('n-sonda-campo')}</div><div><div class="t1">Sonda P</div><div class="t2">Sonda de campo · instrumento</div></div></div>`;
      h += grupo('Posición', `<div class="fila"><span class="etq">Posición</span><div class="fila-doble">${campoHTML('sonda.x', p.x, 'longitud', 'x', true)}${campoHTML('sonda.y', p.y, 'longitud', 'y', true)}</div></div>`);
      h += grupo('Mostrar', casilla('vectorSonda', 'Vector campo', 'f-electrico', false, vista.vectorSonda) + casilla('fichaSonda', 'Ficha de lectura', null, false, vista.fichaSonda));
      h += grupo('Lecturas', '<div class="lecturas" id="lecturas"></div>', 'lect-titulo');
    } else if (sel === 'campo') {
      h += `<div class="insp-cab"><div class="miniatura">${ico('i-capas')}</div><div><div class="t1">Vista del campo</div><div class="t2" id="insp-estado">Superposición de cargas puntuales</div></div></div>`;
      h += grupo('Fuentes', `<div class="fila"><span class="etq">Campo de</span><div class="segmentado texto" data-ajuste="fuentes"><button data-v="todas" aria-pressed="${vista.fuentes === 'todas'}">Todas las cargas</button><button data-v="fijas" aria-pressed="${vista.fuentes === 'fijas'}">Solo las fijas</button></div></div>`);
      h += grupo('Líneas de campo', casilla('capa.lineas', 'Mostrar líneas de campo', 'f-electrico', false, capas.lineas) +
        `<div class="fila"><label for="f-dens">Densidad</label><div class="campo"><input id="f-dens" data-clave="vista.porMicro" value="${vista.porMicro}"><span class="u">líneas/µC</span></div></div>`);
      h += grupo('Equipotenciales', casilla('capa.equi', 'Mostrar equipotenciales', 'f-electrico', true, capas.equi) + casilla('dVauto', 'Separación automática', null, false, vista.dVauto) +
        `<div class="fila"><label for="f-dv">Separación</label><div class="campo"><span class="eje">ΔV</span><input id="f-dv" data-clave="vista.dV" value="${limpio(NIV.paso / 1e3)}"${vista.dVauto ? ' readonly' : ''}><span class="u">kV</span></div></div>`);
      h += grupo('Mapa y malla', casilla('capa.mapa', 'Mapa de potencial', null, false, capas.mapa) + casilla('capa.malla', 'Malla de vectores', 'f-electrico', false, capas.malla) +
        `<div class="fila"><span class="etq">Escala</span><div class="segmentado texto" data-ajuste="malla"><button data-v="log" aria-pressed="${vista.malla === 'log'}">Logarítmica</button><button data-v="lineal" aria-pressed="${vista.malla === 'lineal'}">Lineal</button></div></div>`);
      h += grupo('Lecturas', '<div class="lecturas" id="lecturas"></div>', 'lect-titulo');
    } else {
      const c = cargaPorId(sel); if (!c) { sel = 'P'; return construirInspector(); }
      const q = valor(c.q), libre = !c.fija;
      h += `<div class="insp-cab"><div class="miniatura">${ico(q >= 0 ? 'o-carga-positiva' : 'o-carga-negativa')}</div><div><div class="t1">${libre ? c.nombre : 'Carga ' + c.nombre}</div><div class="t2" id="insp-estado">${libre ? 'Carga puntual libre' : 'Carga puntual fija'}</div></div></div>`;
      let cuerpo = `<div class="fila"><span class="etq">Carga</span>${campoHTML(c.id + '.q', c.q, 'carga')}</div>`;
      if (libre) cuerpo += `<div class="fila"><span class="etq">Masa</span>${campoHTML(c.id + '.m', c.m, 'masa')}</div>`;
      // La partícula usa la fila doble de Mecánica; una carga fija (inspector corto) lleva x e y en filas
      // completas, donde cabe un campo ligado con signo como x = −a.
      if (libre) cuerpo += `<div class="fila"><span class="etq">Posición</span><div class="fila-doble">${campoHTML(c.id + '.x', c.x, 'longitud', 'x', true)}${campoHTML(c.id + '.y', c.y, 'longitud', 'y', true)}</div></div>`;
      else cuerpo += `<div class="fila"><span class="etq">Posición</span>${campoHTML(c.id + '.x', c.x, 'longitud', 'x')}</div><div class="fila"><span class="etq"></span>${campoHTML(c.id + '.y', c.y, 'longitud', 'y')}</div>`;
      if (libre) cuerpo += `<div class="fila"><span class="etq">Velocidad</span><div class="fila-doble">${campoHTML(c.id + '.v0', c.v0, 'velocidad')}<div class="campo"><span class="eje">α</span><input data-clave="${c.id}.alfa" value="${limpio(c.alfa, 2)}"><span class="u">°</span></div></div></div>`;
      h += grupo(libre ? 'Condiciones iniciales' : 'Propiedades', cuerpo);
      h += grupo('Mostrar', libre
        ? casilla('fuerza', 'Fuerza eléctrica', 'f-interaccion', false, mostrar.fuerza) + casilla('velocidad', 'Velocidad', 'f-movimiento', false, mostrar.velocidad) + casilla('prevista', 'Trayectoria prevista', 'texto-3', true, mostrar.prevista)
        : casilla('fuerzaFija', 'Fuerza sobre la carga', 'f-interaccion', false, !!mostrar.fuerzaFija[c.id]));
      h += grupo('Lecturas', '<div class="lecturas" id="lecturas"></div>', 'lect-titulo');
    }
    $('#inspector').innerHTML = h;
    if (SIM) lecturas(); else refrescarLigados();
  }

  // Delegación de eventos del inspector
  const insp = $('#inspector');
  insp.addEventListener('change', ev => {
    const el = ev.target;
    if (el.dataset.clave) aplicarCampo(el.dataset.clave, el.value, el);
    else if (el.dataset.mostrar) {
      const k = el.dataset.mostrar;
      if (k.startsWith('capa.')) { const n = k.slice(5); capas[n] = el.checked; const b = document.querySelector(`.capa-btn[data-capa="${n}"]`); if (b) b.setAttribute('aria-pressed', String(el.checked)); }
      else if (k === 'fuerzaFija') mostrar.fuerzaFija[sel] = el.checked;
      else if (k === 'dVauto') { vista.dVauto = el.checked; if (!el.checked) vista.dV = NIV.paso; claveNiveles = ''; actualizarNiveles(); construirInspector(); }
      else if (k in vista) vista[k] = el.checked;
      else mostrar[k] = el.checked;
      todo();
    }
  });
  insp.addEventListener('click', ev => {
    const b = ev.target.closest('.segmentado button'); if (!b) return;
    const g = b.parentElement, ajuste = g.dataset.ajuste;
    g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    vista[ajuste] = b.dataset.v; claveNiveles = ''; todo(); if (ajuste === 'fuentes') construirInspector();
  });
  insp.addEventListener('dblclick', ev => {
    const el = ev.target.closest('[data-desligar]'); if (!el) return;
    const [id, prop] = el.dataset.desligar.split('.'), c = cargaPorId(id); if (!c) return;
    const antes = instantanea(); c[prop] = valor(c[prop]); registrar(antes);
    construirInspector(); recalcular();
    const ent = insp.querySelector(`input[data-clave="${id}.${prop}"]`); if (ent) { ent.focus(); ent.select(); }
  });
  insp.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.matches('input[data-clave]')) ev.target.blur(); });

  function marcarError(el, msg) {
    const campoEl = el.closest('.campo'), fila = el.closest('.fila');
    campoEl.classList.add('es-error');
    let p = fila.querySelector('.mensaje-error'); if (!p) { p = document.createElement('p'); p.className = 'mensaje-error'; fila.appendChild(p); }
    p.textContent = msg;
  }
  function aplicarCampo(clave, texto, el) {
    const [obj, prop] = clave.split('.');
    let r;
    if (prop === 'alfa') { const n = parseFloat(String(texto).replace(/−/g, '-').replace('°', '')); r = isFinite(n) ? { valor: n } : { error: 'Escribe un ángulo en grados, por ejemplo −90.' }; }
    else if (prop === 'porMicro') { const n = parseFloat(texto); r = isFinite(n) && n >= 2 && n <= 64 ? { valor: Math.round(n) } : { error: 'Escribe un número de líneas entre 2 y 64 por µC.' }; }
    else r = leerCantidad(texto, DIM[prop]);
    if (!r.error && prop === 'm' && !(r.valor > 0)) r = { error: 'La masa tiene que ser positiva.' };
    if (!r.error && prop === 'q' && r.valor === 0) r = { error: 'Una carga puntual necesita q ≠ 0; para quitarla usa Suprimir.' };
    if (!r.error && prop === 'dV' && !(r.valor > 0)) r = { error: 'La separación tiene que ser positiva.' };
    if (r.error) { marcarError(el, r.error); return; }
    if (obj === 'vista') { vista[prop] = r.valor; claveNiveles = ''; construirInspector(); todo(); return; }
    const antes = instantanea();
    if (obj === 'sonda') escena.sonda[prop] = r.valor;
    else { const c = cargaPorId(obj); if (!c) return; c[prop] = r.valor; }
    registrar(antes); recalcular(); construirArbol(); construirInspector();
  }

  // Valores mostrados en los campos ligados a variables
  function fmtVar(d, f = 1) {
    const dec = !(d.paso > 0) || d.paso >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(d.paso) - 1e-9));
    return (f * d.val).toFixed(dec).replace('-', '−');
  }
  function refrescarLigados() {
    insp.querySelectorAll('[data-ligado]').forEach(el => {
      const [id, prop] = el.dataset.ligado.split('.'), c = cargaPorId(id), p = c && c[prop];
      if (ligada(p)) el.textContent = fmtVar(V[p.v], p.f);
    });
  }

  function lecturas() {
    const s = estado(t), fila = ([a, b, val, u, recta]) => `${simHTML(a, b, recta)}<span class="v">${typeof val === 'string' ? val : fmt(val, 4)}</span><span class="u">${u}</span>`;
    $('#reloj').innerHTML = `<span class="sim">t</span>${fmt(t, 4).padStart(6, ' ')}<span class="u">s</span>`;
    const tit = $('#lect-titulo'); if (tit) tit.textContent = `Lecturas en t = ${fmt(t, 4)} s`;
    let filas = [];
    if (sel === 'sonda') {
      const p = escena.sonda, f = fuentesEn(s), [ex, ey] = campo(f, p.x, p.y);
      filas = [['E', 'x', ex / 1e3, 'kV/m'], ['E', 'y', ey / 1e3, 'kV/m'], ['|E|', '', Math.hypot(ex, ey) / 1e3, 'kV/m'], ['V', '', potencial(f, p.x, p.y) / 1e3, 'kV']];
    } else if (sel === 'campo') {
      const f = fuentesEn(s), Q = f.reduce((a, c) => a + c.q, 0);
      filas = [['Q', '', Q * 1e6, 'µC'], ['ΔV', '', limpio(NIV.paso / 1e3), 'kV'], ['N', '', String(NIV.niveles.length), 'niveles']];
      const est = $('#insp-estado'); if (est) est.textContent = `Superposición de ${f.length} cargas puntuales`;
    } else if (sel === 'P') {
      const { K: Ek, U } = energia(s), [ex, ey] = campo(FIJAS, s.x, s.y);
      filas = [['x', '', s.x, 'm'], ['y', '', s.y, 'm'], ['v', 'y', s.vy, 'm/s'], ['|v|', '', Math.hypot(s.vx, s.vy), 'm/s'],
        ['|F|', '', Math.abs(PART.q) * Math.hypot(ex, ey) * 1e3, 'mN'], ['V', '', potencial(FIJAS, s.x, s.y) / 1e3, 'kV'], ['U', '', U * 1e3, 'mJ'], ['E', 'k', Ek * 1e3, 'mJ', true]];
      const est = $('#insp-estado');
      if (est) est.textContent = 'Carga puntual libre · ' + (SIM.choque ? (t >= SIM.choque.t ? 'chocó' : 'choca') + ' con ' + SIM.choque.nombre.split(' ').pop() : SIM.E0 < 0 ? 'oscila' : 'escapa');
    } else {
      const c = FIJAS.find(f => f.id === sel);
      if (c) {
        const otras = [...FIJAS.filter(f => f.id !== c.id), { q: PART.q, x: s.x, y: s.y }], [ex, ey] = campo(otras, c.x, c.y);
        filas = [['x', '', c.x, 'm'], ['y', '', c.y, 'm'], ['F', 'x', c.q * ex * 1e3, 'mN'], ['F', 'y', c.q * ey * 1e3, 'mN'], ['|F|', '', Math.abs(c.q) * Math.hypot(ex, ey) * 1e3, 'mN'], ['V', '', potencial(otras, c.x, c.y) / 1e3, 'kV']];
      }
    }
    const l = $('#lecturas'); if (l) l.innerHTML = filas.map(fila).join('');
    const p = escena.sonda, [sx, sy] = campo(fuentesEn(s), p.x, p.y);
    if ($('#arbol-sonda')) $('#arbol-sonda').textContent = conPrefijo(Math.hypot(sx, sy), 'V/m', 3);
    if ($('#arbol-campo')) $('#arbol-campo').textContent = 'ΔV ' + etiquetaV(NIV.paso);
    $('#b-play').innerHTML = ico(jugando ? 'i-pausar' : 'i-reproducir');
    $('#b-play').dataset.ayuda = jugando ? 'Pausar|Pause|Espacio' : 'Reproducir|Play|Espacio';
    refrescarLigados();
  }

  function construirVariables() {
    const cont = $('#variables'); cont.innerHTML = '';
    for (const [k, d] of Object.entries(V)) {
      const fila = document.createElement('div'); fila.className = 'var' + (d.constante ? ' constante' : '');
      const control = d.constante
        ? `<span class="constante-etq">Constante · ${d.u}</span>`
        : `<input class="deslizador" type="range" min="${d.min}" max="${d.max}" step="${d.paso}" value="${d.val}" aria-label="${d.sim}" data-var="${k}">`;
      fila.innerHTML = `${simHTML(d.sim, d.sub, true)}${control}<span class="valor"></span>`;
      const ent = fila.querySelector('input'), val = fila.querySelector('.valor');
      d.pintar = () => {
        val.innerHTML = d.constante ? fmt(d.val, 3) : `${fmtVar(d)}<span class="u">${d.u}</span>`;
        if (ent) { ent.value = d.val; Volta.pintarDeslizador(ent); }
      };
      if (ent) {
        let antes = null;
        const capturar = () => { if (antes == null) antes = instantanea(); };
        ent.addEventListener('pointerdown', capturar); ent.addEventListener('keydown', capturar);
        ent.addEventListener('input', () => { capturar(); d.val = parseFloat(ent.value); d.pintar(); recalcular(); construirArbol(); });
        ent.addEventListener('change', () => { if (antes != null) registrar(antes); antes = null; });
      }
      d.pintar(); cont.appendChild(fila);
    }
  }

  // ---------------------------------------------------------------------
  // Deshacer y rehacer: instantáneas de la escena y de las variables
  // ---------------------------------------------------------------------
  const historial = { atras: [], adelante: [] };
  const instantanea = () => JSON.stringify({ escena, vars: Object.fromEntries(Object.entries(V).map(([k, d]) => [k, d.val])) });
  function restaurar(txt) {
    const o = JSON.parse(txt); escena = o.escena;
    for (const [k, v] of Object.entries(o.vars)) { V[k].val = v; if (V[k].pintar) V[k].pintar(); }
    if (sel !== 'sonda' && sel !== 'campo' && !cargaPorId(sel)) sel = 'P';
    recalcular(); construirArbol(); construirInspector();
  }
  function registrar(antes) {
    if (antes === instantanea()) return;
    historial.atras.push(antes); if (historial.atras.length > 200) historial.atras.shift();
    historial.adelante = []; botonesHistorial();
  }
  function deshacer() { if (!historial.atras.length) return; historial.adelante.push(instantanea()); restaurar(historial.atras.pop()); botonesHistorial(); }
  function rehacer() { if (!historial.adelante.length) return; historial.atras.push(instantanea()); restaurar(historial.adelante.pop()); botonesHistorial(); }
  function botonesHistorial() { $('#b-deshacer').disabled = !historial.atras.length; $('#b-rehacer').disabled = !historial.adelante.length; }
  $('#b-deshacer').addEventListener('click', deshacer);
  $('#b-rehacer').addEventListener('click', rehacer);

  // ---------------------------------------------------------------------
  // Panel inferior: gráficas, energía, eventos, tabla
  // ---------------------------------------------------------------------
  const lt = new LineaTiempo($('#tl'), { duracion: DUR, eventos: [], alCambiar: nt => { t = nt; jugando = false; todo(); } });

  const serie = f => [SIM.T.map((tt, i) => f(tt, { x: SIM.S[i][0], y: SIM.S[i][1], vx: SIM.S[i][2], vy: SIM.S[i][3] }))];
  const rangoSim = (vals, minimo) => { const m = Math.max(minimo, ...vals.map(Math.abs)) * 1.12; return { min: -m, max: m }; };
  function graficas() {
    const s = estado(t), evs = SIM.eventos.filter(e => e.t > 0), a = vsi('a');
    if (!$('#p-graficas').hidden) {
      grafica($('#g1'), { x: { min: 0, max: DUR }, y: rangoSim(SIM.S.map(q => q[1]), 0.1 * a), series: [{ tramos: serie((tt, q) => [tt, q.y]), familia: 'tinta' }], cursor: t, puntoCursor: [t, s.y], eventos: evs.map(e => ({ x: e.t, y: e.y })) });
      grafica($('#g2'), { x: { min: 0, max: DUR }, y: rangoSim(SIM.S.map(q => q[3]), 0.1), series: [{ tramos: serie((tt, q) => [tt, q.vy]), familia: 'movimiento' }], cursor: t, puntoCursor: [t, s.vy], eventos: evs.map(e => ({ x: e.t })) });
      // Perfil U(y) a lo largo del eje x = 0, con la energía total como nivel
      const yr = Math.max(1.6 * a, Math.min(4 * a, 1.05 * Math.max(...SIM.S.map(q => Math.abs(q[1]))))), pts = [];
      for (let i = 0; i <= 240; i++) { const y = -yr + 2 * yr * i / 240; pts.push([y, PART.q * potencial(FIJAS, 0, y) * 1e3]); }
      const E = SIM.E0 * 1e3, Uref = K * vsi('q') ** 2 / a * 1e3, fin = pts.map(p => p[1]).filter(v => isFinite(v) && Math.abs(v - E) < 4 * Uref);
      const lo = Math.min(E, ...fin), hi = Math.max(E, ...fin), pad = (hi - lo) * 0.12 || 1;
      const Up = energia(s).U * 1e3;
      grafica($('#g3'), { x: { min: -yr, max: yr }, y: { min: lo - pad, max: hi + pad }, series: [{ tramos: [pts], familia: 'electrico' }, { tramos: [[[-yr, E], [yr, E]]], familia: 'tinta' }], cursor: s.y, puntoCursor: [s.y, Up], eventos: [] });
      $('#l1').textContent = cantidad(s.y, 'm');
      $('#l2').textContent = cantidad(s.vy, 'm/s');
      $('#l3').textContent = cantidad(Up, 'mJ');
    }
    if (!$('#p-energia').hidden) energiaPanel();
  }

  function energiaPanel() {
    const s = estado(t), { K: Ek, U } = energia(s), E0 = SIM.E0;
    const Ks = SIM.S.map(q => 0.5 * PART.m * (q[2] * q[2] + q[3] * q[3])), Us = SIM.S.map(q => PART.q * potencial(FIJAS, q[0], q[1]));
    const lo = Math.min(0, E0, ...Us), hi = Math.max(0, E0, ...Ks), rango = (hi - lo) * 1.04 || 1, z = (-lo + (hi - lo) * 0.02) / rango * 100;
    const filas = [['Cinética', 'movimiento', Ek], ['Potencial eléctrica', 'electrico', U], ['Total', 'tinta', Ek + U]];
    $('#barras').innerHTML = filas.map(([n, f, val]) => {
      const w = Math.abs(val) / rango * 100, izq = val >= 0 ? z : z - w;
      return `<div class="barra-e"><span>${n}</span><span class="riel"><i style="left:${izq}%;width:${w}%;background:${f === 'tinta' ? 'var(--tinta)' : `var(--f-${f})`}"></i><b class="cero" style="left:${z}%"></b></span><span class="v">${cantidad(val * 1e3, 'mJ', 4)}</span></div>`;
    }).join('');
    $('#deriva').innerHTML = `Variación relativa máxima de la energía total: <span class="num">${SIM.deriva < 1e-12 ? '&lt; 1 × 10⁻¹²' : fmt(SIM.deriva, 2)}</span>`;
    const ser = arr => [SIM.T.map((tt, i) => [tt, arr[i] * 1e3])];
    grafica($('#g4'), {
      x: { min: 0, max: DUR }, y: { min: lo * 1.08e3, max: hi * 1.12e3 + 1e-6 },
      series: [
        { tramos: ser(Ks), familia: 'movimiento' },
        { tramos: ser(Us), familia: 'electrico' },
        { tramos: [[[0, E0 * 1e3], [SIM.tFin, E0 * 1e3]]], familia: 'tinta' },
      ],
      cursor: t, eventos: SIM.eventos.filter(e => e.t > 0).map(e => ({ x: e.t })),
    });
  }

  function tablas() {
    $('#t-eventos').innerHTML = '<tr><th>Evento</th><th>t (s)</th><th>x (m)</th><th>y (m)</th><th>|v| (m/s)</th><th>U (mJ)</th></tr>' +
      SIM.eventos.map(e => `<tr class="${Math.abs(e.t - t) < 1e-9 ? 'actual' : ''}"><td style="font-family:var(--fuente-interfaz)">${e.nombre}</td><td>${fmt(e.t, 5)}</td><td>${fmt(e.x, 4)}</td><td>${fmt(e.y, 4)}</td><td>${fmt(e.v, 4)}</td><td>${fmt(PART.q * potencial(FIJAS, e.x, e.y) * 1e3, 4)}</td></tr>`).join('');
    let filas = '<tr><th>t (s)</th><th>x (m)</th><th>y (m)</th><th>vₓ (m/s)</th><th>v_y (m/s)</th><th>E_k (mJ)</th><th>U (mJ)</th></tr>';
    for (let k = 0; k * 0.05 <= DUR + 1e-9; k++) {
      const tt = k * 0.05, s = estado(tt), e = energia(s);
      filas += `<tr class="${Math.abs(tt - t) < 0.025 ? 'actual' : ''}"><td>${fmt(tt, 3)}</td><td>${fmt(s.x, 4)}</td><td>${fmt(s.y, 4)}</td><td>${fmt(s.vx, 4)}</td><td>${fmt(s.vy, 4)}</td><td>${fmt(e.K * 1e3, 4)}</td><td>${fmt(e.U * 1e3, 4)}</td></tr>`;
    }
    $('#t-datos').innerHTML = filas.replace('v_y', 'v<sub>y</sub>').replace('E_k', 'E<sub>k</sub>');
  }

  function todo() {
    dibujar(); lecturas(); lt.poner(t); graficas();
    if (!$('#p-eventos').hidden || !$('#p-tabla').hidden) tablas();
  }
  function recalcular() {
    simular();
    lt.duracion = DUR; lt.simulado = SIM.tFin;
    lt.eventos = SIM.eventos.filter(e => e.t > 0).map(e => ({ t: e.t, nombre: e.nombre }));
    todo();
    if (autoguardar) autoguardado.guardar('electrostatica', escenaActual());
  }

  // ---------------------------------------------------------------------
  // Escena: guardar, abrir y autoguardado (formato .volta). Lo que llega de
  // un archivo se valida y se acota antes de usarlo: los nombres se insertan
  // en el marcado y las magnitudes van al integrador.
  // ---------------------------------------------------------------------
  let autoguardar = false;
  function escenaActual() {
    return crearEscena({ modulo: 'electrostatica', espacio: 'cargas-y-campos', titulo: 'Cargas y campos', datos: JSON.parse(instantanea()) });
  }
  function cargaSegura(c, libre) {
    const mag = (v, min, max) => magnitud(v, NOMBRES_VAR, NaN, min, max);
    const ok = v => typeof v === 'object' || Number.isFinite(v);
    const id = libre ? 'P' : texto(c.id, '', 12);
    const q = mag(c.q, -1, 1), x = mag(c.x, -1e3, 1e3), y = mag(c.y, -1e3, 1e3);
    if (!id || !ok(q) || !ok(x) || !ok(y)) return null;
    if (typeof q === 'number' ? q === 0 : q.f === 0) return null;
    const carga = { id, nombre: texto(c.nombre, libre ? 'Partícula' : id), fija: !libre, q, x, y };
    if (!libre) return carga;
    const m = mag(c.m, 1e-9, 1e6), v0 = mag(c.v0, 0, 1e4);
    if (!ok(m) || (typeof m === 'object' && !(m.f > 0))) return null;
    return { ...carga, m, v0: ok(v0) ? v0 : 0, alfa: numero(c.alfa, 0, -360, 360) };
  }
  function datosSeguros(d = {}) {
    const vars = Object.fromEntries(NOMBRES_VAR.map(k => [k, numero(d.vars?.[k], VAL0[k], V[k].min, V[k].max)]));
    const base = escenaInicial(), e = d.escena && typeof d.escena === 'object' ? d.escena : {};
    const fuente = Array.isArray(e.cargas) ? e.cargas.slice(0, 40).filter(c => c && typeof c === 'object') : [];
    const ids = new Set(['P']), fijas = [];
    for (const c of fuente.filter(c => c.fija !== false)) {
      const r = cargaSegura(c, false);
      if (r && !ids.has(r.id)) { ids.add(r.id); fijas.push(r); }
    }
    const libre = fuente.filter(c => c.fija === false).map(c => cargaSegura(c, true)).find(Boolean);
    // Sin partícula válida no hay nada que simular: se conserva la del examen
    const cargas = libre ? [...fijas, libre] : base.cargas;
    const sonda = { x: numero(e.sonda?.x, base.sonda.x, -1e3, 1e3), y: numero(e.sonda?.y, base.sonda.y, -1e3, 1e3) };
    return { escena: { cargas, sonda }, vars };
  }
  function cargarDatos(d) {
    const antes = instantanea();
    restaurar(JSON.stringify(d)); registrar(antes); irA(0); encuadrar(); zoomTexto(); dibujar();
  }
  function guardar() {
    guardarEscena(escenaActual()).then(r => { if (r) aviso('Escena guardada'); }, err => aviso(`No se pudo guardar: ${err}`));
  }
  function abrir() {
    abrirEscena({ modulo: 'electrostatica' }).then(e => { cargarDatos(datosSeguros(e.datos)); aviso(`Escena abierta: ${texto(e.titulo, 'sin título', 60)}`); })
      .catch(err => aviso(texto(err.message, 'No se pudo abrir la escena.', 200)));
  }
  function escenaDelExamen() {
    cargarDatos({ escena: escenaInicial(), vars: Object.fromEntries(NOMBRES_VAR.map(k => [k, VAL0[k]])) });
    aviso('Escena inicial: MEXT 2020 P2');
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
  const irA = nt => { t = nt; jugando = false; todo(); };
  function alternar() { if (t >= DUR) t = 0; jugando = !jugando; todo(); }
  $('#b-play').addEventListener('click', alternar);
  $('#b-reiniciar').addEventListener('click', () => irA(0));
  $('#b-atras').addEventListener('click', () => irA(Math.max(0, t - 1 / 60)));
  $('#b-adelante').addEventListener('click', () => irA(Math.min(DUR, t + 1 / 60)));
  $('#velocidades').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) velocidad = parseFloat(b.dataset.v); });
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.capa; capas[k] = !capas[k]; b.setAttribute('aria-pressed', String(capas[k]));
    const c = insp.querySelector(`[data-mostrar="capa.${k}"]`); if (c) c.checked = capas[k];
    dibujar();
  }));
  $('#pest').addEventListener('click', () => setTimeout(todo, 0));

  // Avisos breves sobre el lienzo (componente "Notificación")
  let relojAviso = null;
  function aviso(texto, accion) {
    let el = $('#aviso');
    if (!el) { el = document.createElement('div'); el.id = 'aviso'; el.className = 'aviso-flotante'; area.appendChild(el); }
    el.innerHTML = `${ico('i-info')}<span>${texto}</span>${accion ? `<button class="btn btn-compacto">${accion[0]}</button>` : ''}`;
    if (accion) el.querySelector('button').addEventListener('click', () => { accion[1](); el.hidden = true; });
    el.hidden = false; clearTimeout(relojAviso); relojAviso = setTimeout(() => { el.hidden = true; }, 3600);
  }

  // ---------------------------------------------------------------------
  // Lienzo: selección, arrastre de cargas (t = 0) y de la sonda, colocación,
  // zoom y desplazamiento
  // ---------------------------------------------------------------------
  function objetoEn(x, y) {
    const v = tz.vista, s = estado(t);
    if (Math.hypot(x - v.X(escena.sonda.x), y - v.Y(escena.sonda.y)) < 12) return 'sonda';
    if (Math.hypot(x - v.X(s.x), y - v.Y(s.y)) < G.carga + 4) return 'P';
    for (const c of FIJAS) if (Math.hypot(x - v.X(c.x), y - v.Y(c.y)) < G.carga + 4) return c.id;
    return null;
  }
  const ajustar = (w, libre) => (libre ? Math.round(w * 1000) / 1000 : Math.round(w / 0.05) * 0.05);
  function posLienzo(ev) { const r = lienzo.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }

  lienzo.addEventListener('pointerdown', ev => {
    const [x, y] = posLienzo(ev);
    if (ev.button === 1 || ev.button === 2 || espacioPulsado) { paneo = [x, y, tz.vista.ox, tz.vista.oy]; lienzo.setPointerCapture(ev.pointerId); return; }
    const obj = objetoEn(x, y);
    if (herramienta && !obj) { colocarCarga(herramienta, x, y, ev.shiftKey); return; }
    if (obj) {
      if (sel !== obj) seleccionar(obj);
      if (obj === 'sonda') { arrastre = { tipo: 'sonda' }; lienzo.setPointerCapture(ev.pointerId); return; }
      if (t > 0) { aviso('Las cargas se colocan en t = 0.', ['Ir a t = 0', () => irA(0)]); return; }
      arrastre = { tipo: 'carga', id: obj, antes: instantanea() };
      lienzo.setPointerCapture(ev.pointerId); dibujar(); return;
    }
    paneo = [x, y, tz.vista.ox, tz.vista.oy]; lienzo.setPointerCapture(ev.pointerId);
  });
  lienzo.addEventListener('pointermove', ev => {
    const [x, y] = posLienzo(ev), v = tz.vista, wx = v.mx(x), wy = v.my(y);
    $('#cx').textContent = cantidad(wx, 'm', 4); $('#cy').textContent = cantidad(wy, 'm', 4);
    $('#cv').textContent = conPrefijo(potencial(fuentesEn(estado(t)), wx, wy), 'V', 4);
    if (arrastre && arrastre.tipo === 'carga') {
      const c = cargaPorId(arrastre.id);
      c.x = ajustar(wx, ev.shiftKey); c.y = ajustar(wy, ev.shiftKey);
      recalcular(); return;
    }
    if (arrastre && arrastre.tipo === 'sonda') { escena.sonda.x = ajustar(wx, ev.shiftKey); escena.sonda.y = ajustar(wy, ev.shiftKey); dibujar(); lecturas(); return; }
    if (paneo) { v.ox = paneo[2] + x - paneo[0]; v.oy = paneo[3] + y - paneo[1]; dibujar(); return; }
    const h = objetoEn(x, y);
    if (h !== hover) { hover = h; dibujar(); }
    lienzo.style.cursor = herramienta && !h ? 'crosshair' : h === 'sonda' || (h && t === 0) ? 'grab' : 'default';
  });
  lienzo.addEventListener('pointerup', () => {
    if (arrastre && arrastre.tipo === 'carga') { registrar(arrastre.antes); construirArbol(); construirInspector(); }
    arrastre = null; paneo = null; dibujar(); lecturas();
  });
  lienzo.addEventListener('pointerleave', () => { if (hover && !arrastre) { hover = null; dibujar(); } });
  lienzo.addEventListener('contextmenu', ev => ev.preventDefault());
  lienzo.addEventListener('wheel', ev => {
    ev.preventDefault();
    const [x, y] = posLienzo(ev);
    tz.vista.zoom(Math.exp(-ev.deltaY * 0.0015), x, y);
    zoomTexto(); dibujar();
  }, { passive: false });
  let escala0 = 1;
  function zoomTexto() { $('#zoom').textContent = Math.round(tz.vista.escala / escala0 * 100) + ' %'; }
  function zoomCentro(f) { tz.vista.zoom(f, tz.w / 2, tz.h / 2); zoomTexto(); dibujar(); }
  $('#b-zoom-mas').addEventListener('click', () => zoomCentro(1.25));
  $('#b-zoom-menos').addEventListener('click', () => zoomCentro(0.8));
  $('#b-encuadrar').addEventListener('click', () => { encuadrar(); zoomTexto(); dibujar(); });

  // Paleta: las cargas puntuales se colocan con un clic en el lienzo
  // (espacio.js marca el botón pulsado después de este oyente; por eso se decide en el siguiente turno)
  $('#paleta-objetos').addEventListener('click', ev => {
    const b = ev.target.closest('.herr'); if (!b) return;
    const tipo = b.dataset.objeto;
    setTimeout(() => {
      if (tipo !== 'carga+' && tipo !== 'carga-') { soltarHerramienta(); aviso('Este espacio coloca cargas puntuales; conductores, dieléctricos y placas llegan en una próxima versión.'); return; }
      if (herramienta === tipo) { soltarHerramienta(); return; }
      herramienta = tipo; aviso('Haz clic en el lienzo para colocar la carga. Esc cancela.');
    }, 0);
  });
  $('#paleta-instrumentos').addEventListener('click', ev => {
    const b = ev.target.closest('.herr'); if (!b) return;
    const tipo = b.dataset.instrumento;
    setTimeout(() => {
      document.querySelectorAll('#paleta-instrumentos .herr').forEach(x => x.setAttribute('aria-pressed', 'false'));
      if (tipo === 'sonda') seleccionar('sonda');
      else aviso('Este espacio trae la sonda de campo; los demás instrumentos llegan en una próxima versión.');
    }, 0);
  });
  function soltarHerramienta() { herramienta = null; document.querySelectorAll('#paleta-objetos .herr').forEach(b => b.setAttribute('aria-pressed', 'false')); lienzo.style.cursor = 'default'; }
  function colocarCarga(tipo, x, y, libre) {
    if (t > 0) { aviso('Las cargas se colocan en t = 0.', ['Ir a t = 0', () => irA(0)]); return; }
    const antes = instantanea(), usadas = new Set(escena.cargas.map(c => c.nombre));
    let letra = 'D'; while (usadas.has(letra)) letra = String.fromCharCode(letra.charCodeAt(0) + 1);
    escena.cargas.splice(escena.cargas.length - 1, 0, { id: letra, nombre: letra, fija: true, q: (tipo === 'carga+' ? 1 : -1) * 1e-6, x: ajustar(tz.vista.mx(x), libre), y: ajustar(tz.vista.my(y), libre) });
    registrar(antes); soltarHerramienta(); sel = letra; recalcular(); construirArbol(); construirInspector();
  }
  function borrarSeleccion() {
    const c = cargaPorId(sel); if (!c || !c.fija) return;
    const antes = instantanea(); escena.cargas = escena.cargas.filter(x => x !== c); delete mostrar.fuerzaFija[c.id];
    registrar(antes); sel = 'P'; recalcular(); construirArbol(); construirInspector();
  }

  // ---------------------------------------------------------------------
  // Exportación
  // ---------------------------------------------------------------------
  // CSV con precisión completa y BOM (nucleo/csv.js) y diálogo nativo
  // «Guardar como» en la aplicación (componentes/exportar.js). Muestras cada
  // 0.01 s hasta donde llega la simulación (un choque la termina antes).
  function exportarCSV() {
    const filas = muestrear(0, SIM.tFin, 0.01, tt => { const s = estado(tt), e = energia(s); return [tt, s.x, s.y, s.vx, s.vy, e.K, e.U]; });
    const csv = aCSV(['t (s)', 'x (m)', 'y (m)', 'vx (m/s)', 'vy (m/s)', 'Ek (J)', 'U (J)'], filas);
    descargarTexto('cargas-y-campos-datos.csv', csv).then(r => { if (r) aviso(`Datos exportados: ${filas.length} filas`); }, () => {});
  }
  function exportarImagen() {
    descargarLienzo(lienzo, 'cargas-y-campos.png').then(r => { if (r) aviso('Imagen exportada'); });
  }
  $('#b-exportar').addEventListener('click', exportarCSV);

  // ---------------------------------------------------------------------
  // Teclado y paleta de comandos
  // ---------------------------------------------------------------------
  let espacioPulsado = false;
  const alternarCapa = k => () => { const b = document.querySelector(`.capa-btn[data-capa="${k}"]`); if (b) b.click(); };
  const COMANDOS = [
    ['i-reproducir', 'Reproducir o pausar', 'Espacio', alternar],
    ['i-reiniciar', 'Reiniciar la simulación', 'Inicio', () => irA(0)],
    ['i-encuadrar', 'Encuadrar todo', 'F', () => { encuadrar(); zoomTexto(); dibujar(); }],
    ['i-deshacer', 'Deshacer', 'Ctrl Z', deshacer],
    ['i-rehacer', 'Rehacer', 'Ctrl Y', rehacer],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar],
    ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
    ['i-reiniciar', 'Volver a la escena del examen (MEXT 2020 P2)', '', escenaDelExamen],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['o-carga-positiva', 'Añadir carga positiva', '', () => { irA(0); document.querySelector('[data-objeto="carga+"]').click(); }],
    ['o-carga-negativa', 'Añadir carga negativa', '', () => { irA(0); document.querySelector('[data-objeto="carga-"]').click(); }],
    ['n-sonda-campo', 'Seleccionar la sonda de campo', '', () => seleccionar('sonda')],
    ['i-capas', 'Mostrar u ocultar líneas de campo', 'L', alternarCapa('lineas')],
    ['i-capas', 'Mostrar u ocultar equipotenciales', 'E', alternarCapa('equi')],
    ['i-capas', 'Mostrar u ocultar el mapa de potencial', 'M', alternarCapa('mapa')],
    ['i-ajustes', 'Ajustes de la vista del campo', '', () => seleccionar('campo')],
    ['i-exportar', 'Exportar datos a CSV', '', exportarCSV],
    ['i-imagen', 'Exportar imagen del lienzo', '', exportarImagen],
  ];
  let selCmd = 0;
  function pintarComandos() {
    const q = $('#cmd-q').value.trim().toLowerCase();
    const lista = COMANDOS.filter(c => c[1].toLowerCase().includes(q));
    selCmd = Math.min(selCmd, Math.max(0, lista.length - 1));
    $('#cmd-lista').innerHTML = '<div class="menu-titulo">Acciones</div>' + lista.map((c, i) =>
      `<div class="menu-item${i === selCmd ? ' activo' : ''}" data-i="${COMANDOS.indexOf(c)}">${ico(c[0])}${c[1]}<span class="atajo">${c[2]}</span></div>`).join('');
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
    const ctrl = ev.ctrlKey || ev.metaKey, tecla = ev.key.toLowerCase();
    if (ctrl && tecla === 'k') { ev.preventDefault(); abrirComandos(); return; }
    if (ev.target.matches && ev.target.matches('input, textarea')) return;
    if (ctrl && tecla === 'z') { ev.preventDefault(); if (ev.shiftKey) rehacer(); else deshacer(); return; }
    if (ctrl && tecla === 'y') { ev.preventDefault(); rehacer(); return; }
    if (ctrl && tecla === 's') { ev.preventDefault(); guardar(); return; }
    if (ctrl && tecla === 'o') { ev.preventDefault(); abrir(); return; }
    if (ctrl) return;
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) alternar(); espacioPulsado = true; }
    else if (ev.key === 'ArrowRight') irA(Math.min(DUR, t + 1 / 60));
    else if (ev.key === 'ArrowLeft') irA(Math.max(0, t - 1 / 60));
    else if (ev.key === 'Home') irA(0);
    else if (ev.key === 'Escape') soltarHerramienta();
    else if (ev.key === 'Delete' || ev.key === 'Backspace') borrarSeleccion();
    else if (tecla === 'f') { encuadrar(); zoomTexto(); dibujar(); }
    else if (tecla === 'l') alternarCapa('lineas')();
    else if (tecla === 'e') alternarCapa('equi')();
    else if (tecla === 'm') alternarCapa('mapa')();
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });

  // ---------------------------------------------------------------------
  // Arranque. Parámetros de URL para capturas: ?t=, ?sel=, ?mapa=1,
  // ?malla=1, ?fuentes=todas, ?pest=energia|eventos|tabla
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); claveNiveles = ''; todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('mapa') === '1') capas.mapa = true;
    if (q.get('malla') === '1') capas.malla = true;
    if (q.get('fuentes') === 'todas') vista.fuentes = 'todas';
    document.querySelectorAll('.capa-btn').forEach(b => b.setAttribute('aria-pressed', String(capas[b.dataset.capa])));
    // Escena abierta desde Inicio, o la última sesión (no en capturas ni con parámetros)
    const limpio = ![...q.keys()].length;
    const previa = escenaPendiente('electrostatica') || (limpio ? autoguardado.leer('electrostatica', { modulo: 'electrostatica' }) : null);
    if (previa) { const d = datosSeguros(previa.datos); escena = d.escena; for (const k in d.vars) V[k].val = d.vars[k]; }
    autoguardar = limpio || !!previa;
    simular(); construirVariables();
    if (q.has('sel')) sel = q.get('sel');
    if (q.has('t')) t = Math.max(0, Math.min(DUR, parseFloat(q.get('t'))));
    if (q.has('pest')) { const b = document.querySelector(`#pest [aria-controls="p-${q.get('pest')}"]`); if (b) b.click(); }
    tz.ajustar(); encuadrar(); escala0 = tz.vista.escala;
    construirArbol(); construirInspector(); botonesHistorial();
    recalcular(); zoomTexto();
    requestAnimationFrame(a => { ultimo = a; requestAnimationFrame(cuadro); });
  });
})();
