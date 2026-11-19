/* ==========================================================================
   Volta · Termodinámica — espacio de trabajo "Gas molecular"
   Moléculas como discos duros en una caja plana: cada choque se calcula
   exactamente (dinámica por eventos, motor puro sistema/motores/cinetica.js,
   probado en pruebas/cinetica.test.js). La presión se mide con el impulso
   que las moléculas dan a las paredes y la temperatura con su energía
   cinética media (½·m·⟨v²⟩ = k·T en la caja plana). Histograma de rapideces
   con la curva de Maxwell–Boltzmann, émbolo que comprime, tabique con
   orificio (efusión, expansión libre) y paredes térmicas.
   La corrida se calcula entera al abrir la escena (cuadros de posiciones) y
   la línea de tiempo la recorre. Mundo en nm.
   Parámetros de URL: ?escena=…&t=<ns>&sel=caja|e0|e1|tabique&pest=especies
   ========================================================================== */
import { K_B, maxwell2D, rapidezRms2D, rapidezProbable2D } from '../motores/cinetica.js';
import { ESCENAS_MOLECULAR, valores, examenDe, escenaPorClave, simularEscena, medidasEspecie } from './termodinamica-escenas.js';
import {
  ponerTitulo, iniciarMenuEscenas, aOtroEspacio, irAEscenaDeOtroEspacio, construirVariables, filaLectura, examenHTML,
  crearAvisador, iniciarComandos, crearReproductor, ICONO_TIPO, chipDe,
} from './termodinamica-comun.js';
import { aCSV } from '../nucleo/csv.js';
import { crearEscena, numero, texto } from '../nucleo/escena.js';
import { Historial } from '../nucleo/historial.js';
import { descargarTexto, descargarLienzo, nombreArchivo } from '../componentes/exportar.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';

(function () {
  'use strict';
  const { Trazo, fmt, cantidad, conPrefijo, grafica, LineaTiempo, pasoAgradable } = Volta;
  const $ = s => document.querySelector(s);
  const ESPACIO = 'molecular', NOMBRE_ESPACIO = 'Gas molecular';
  const NM = 1e9, NS = 1e9;          // m → nm, s → ns

  /** @type {any} */ let ESC = ESCENAS_MOLECULAR[0];
  /** @type {Record<string, any>} */ let VAR = {};
  /** @type {any} */ let SIM = null, E = null;
  let FILAS = [], RADIOS = [], ORDEN = [];
  let sel = 'caja', hover = null, marcada = 0, ventana = 0.5e-9;
  const capas = { velocidades: false, trazas: true, instrumentos: true, cotas: true };
  const instr = { marcada: true, histograma: true, manometro: true, termometro: true };
  let historial = null, autoguardar = false, vistaTocada = false, escala0 = 1, espacioPulsado = false, paneo = null, reloj = null;
  const lienzo = $('#lienzo'), tz = new Trazo(lienzo);
  const avisar = crearAvisador(() => deshacer());
  const vals = () => Object.fromEntries(Object.entries(VAR).map(([k, d]) => [k, d.val]));
  const copia = o => JSON.parse(JSON.stringify(o));
  const ns = t => cantidad(t * NS, 'ns', 4);
  const ZJ = 1e21;                     // las energías de unas pocas moléculas, en zeptojulios (10⁻²¹ J)
  const miles = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, Volta.ESP);

  // ---------------------------------------------------------------------
  // Simulación y medidas
  // ---------------------------------------------------------------------
  function simular() {
    E = ESC.construir(vals());
    SIM = simularEscena(ESC, vals());
    FILAS = examenDe(ESC, SIM, vals());
    // Tamaño de dibujo por especie: las más ligeras, más pequeñas (la forma distingue la especie)
    const S = E.especies.length;
    ORDEN = E.especies.map((s, i) => i).sort((a, b) => E.especies[a].m - E.especies[b].m);
    RADIOS = Array(S).fill(0); ORDEN.forEach((s, k) => { RADIOS[s] = [2.6, 3.3, 3.8][Math.min(2, k)]; });
    if (marcada >= SIM.N) marcada = 0;
  }
  const kDe = t => Math.max(0, Math.min(SIM.cuadros - 1, Math.round(t / SIM.cuadro)));
  const medida = t => SIM.medidas[kDe(t)];
  /** Energía cinética de las moléculas de una especie en el cuadro k. */
  const especie = (k, s) => medidasEspecie(SIM, k, s);
  const Tde = k => SIM.medidas[k].Ek / (SIM.N * K_B);
  const area = m => m.Xp * E.Ly;
  // Presión medida: impulso sobre las paredes exteriores en la ventana, por unidad de tiempo y de longitud
  function presion(t) {
    const k = kDe(t), k0 = Math.max(0, k - Math.max(1, Math.round(ventana / SIM.cuadro))), a = SIM.medidas[k0], b = SIM.medidas[k];
    if (k === k0) return NaN;
    const J = i => b.J[i] - a.J[i], dt = b.t - a.t, per = 2 * (b.Xp + E.Ly);
    return { total: (J(0) + J(1) + J(2) + J(3)) / (dt * per), izq: J(0) / (dt * E.Ly), der: J(1) / (dt * E.Ly) };
  }
  const Pideal = k => SIM.N * K_B * Tde(k) / area(SIM.medidas[k]);

  // ---------------------------------------------------------------------
  // Dibujo del lienzo
  // ---------------------------------------------------------------------
  function encuadrar() {
    const Lx = E.Lx * NM, Ly = E.Ly * NM, Xmax = Math.max(Lx, ...SIM.medidas.map(m => m.Xp * NM));
    tz.vista.encuadrar({ x0: -6, x1: Xmax + (capas.instrumentos ? 44 : 10), y0: -12, y1: Ly + 14 }, { x: 0, y: 40, w: tz.w, h: tz.h - 84 }, 26);
  }
  let t = 0;
  function dibujar() {
    if (!SIM) return;
    const v = tz.vista, c = tz.ctx, k = kDe(t), m = SIM.medidas[k], Ly = E.Ly * NM, Xp = m.Xp * NM, termica = E.paredes === 'termica';
    const Xfin = Math.max(E.Lx * NM, ...SIM.medidas.map(q => q.Xp * NM)) + 4;   // las paredes llegan hasta donde llega el émbolo
    tz.limpiar(); tz.cuadricula();
    // Caja: paredes por fuera de la región de las moléculas
    const tipo = termica ? 'conductora' : 'adiabatica';
    tz.paredes([[Xfin, Ly], [0, Ly], [0, 0], [Xfin, 0]], { tipo, grueso: hover === 'caja' });
    // Émbolo: la pared derecha
    tz.embolo(Xp, Xp + 3, 0, Ly, { grueso: hover === 'embolo', centroMasa: false });
    tz.linea([[Xp + 3, Ly / 2], [Xfin + 6, Ly / 2]], { grosor: 2 });
    // Tabique con orificio
    if (E.tabique) {
      const x = E.tabique.x * NM, h = E.tabique.hueco * NM;
      tz.termoTabique(x, 0, Ly, Ly / 2 - h / 2, Ly / 2 + h / 2, !!m.abierto, { grueso: hover === 'tabique' });
    }
    // Traza de la molécula marcada (lo recorrido en los últimos cuadros)
    const base = k * 2 * SIM.N;
    if (instr.marcada && capas.trazas) {
      const pts = []; for (let q = Math.max(0, k - 60); q <= k; q++) { const b = q * 2 * SIM.N; pts.push(v.P([SIM.pos[b + 2 * marcada] * NM, SIM.pos[b + 2 * marcada + 1] * NM])); }
      tz.lineaPx(pts, { color: 'texto-2', grosor: 1.5 });
    }
    // Moléculas
    const lista = [];
    for (let i = 0; i < SIM.N; i++) { const [X, Y] = v.P([SIM.pos[base + 2 * i] * NM, SIM.pos[base + 2 * i + 1] * NM]); lista.push([X, Y, SIM.especie[i]]); }
    tz.termoMoleculasPx(lista, RADIOS);
    // Velocidades (familia movimiento)
    const vmax = Math.max(...E.especies.map(s => rapidezRms2D(s.m, Math.max(1, Tde(k)))));
    const kv = 22 / vmax;
    if (capas.velocidades) for (let i = 0; i < SIM.N; i++) { const [X, Y] = lista[i]; tz.flechaPx(X, Y, X + SIM.vel[base + 2 * i] * kv, Y - SIM.vel[base + 2 * i + 1] * kv, { color: 'movimiento', grosor: 1.25 }); }
    if (instr.marcada) {
      const [X, Y] = lista[marcada], vx = SIM.vel[base + 2 * marcada], vy = SIM.vel[base + 2 * marcada + 1], r = RADIOS[SIM.especie[marcada]] + 4;
      tz.seleccionCirculo(X, Y, r);
      tz.flechaPx(X + vx / Math.hypot(vx, vy) * r, Y - vy / Math.hypot(vx, vy) * r, X + vx * kv * 1.6, Y - vy * kv * 1.6, { color: 'movimiento' });
      tz.etiquetaMagnitud(X + vx * kv * 1.6 + (vx >= 0 ? 8 : -8), Y - vy * kv * 1.6 - 6, { simbolo: 'v', valor: Math.hypot(vx, vy), unidad: 'm/s', color: 'movimiento', alinear: vx >= 0 ? 'left' : 'right', cifras: 3 });
    }
    // Calor de las paredes térmicas
    if (termica && capas.instrumentos) {
      const k0 = Math.max(0, k - 20), dQ = (SIM.medidas[k].Qpared - SIM.medidas[k0].Qpared) / Math.max(1e-30, SIM.medidas[k].t - SIM.medidas[k0].t);
      if (Math.abs(dQ) > 1e-12 && k > 0) {
        const ent = dQ > 0, X = v.X(-1) - (tz.anchoPared('conductora')), Y = v.Y(Ly / 2);
        tz.flechaCalor(ent ? X - 34 : X - 6, Y, ent ? X - 6 : X - 34, Y);
        tz.etiquetaCalor(X - 36, Y - 10, 'pared', Math.abs(dQ) * 1e9, 'right');
      }
    }
    // Cotas
    if (capas.cotas) {
      tz.cota([0, 0], [Xp, 0], { desplazamiento: 22, texto: [{ t: 'L', f: 'sim', tam: 14 }, { t: ` = ${fmt(Xp, 3)} nm`, f: 'num', tam: 11 }] });
      tz.cota([0, Ly], [0, 0], { desplazamiento: 22, texto: [{ t: `${fmt(Ly, 3)} nm`, f: 'num', tam: 11 }] });
    }
    // Instrumentos: fichas a la derecha de la caja
    if (capas.instrumentos) {
      const Xi = v.X(Xfin + 12), P = presion(t), T = Tde(k);
      let Yi = v.Y(Ly) + 4;
      if (instr.manometro) {
        tz.manometro(Xi, Yi + 14, Number.isFinite(P.total) ? P.total / (2 * Pideal(0)) : 0);
        const f = tz.ficha(Xi + 18, Yi, [[{ t: 'Manómetro', f: 'ui', tam: 11.5 }], [{ t: 'P', f: 'sim', tam: 13 }, { t: ' = ' + (Number.isFinite(P.total) ? conPrefijo(P.total, 'N/m', 4) : '—'), f: 'num', tam: 11.5 }],
          [{ t: 'NkT/A', f: 'sim', tam: 13, color: 'texto-3' }, { t: ' = ' + conPrefijo(Pideal(k), 'N/m', 4), f: 'num', tam: 11.5 }]]);
        Yi += f.h + 12;
      }
      if (instr.termometro) {
        tz.termometro(Xi, Yi + 34, (T - 0) / Math.max(1200, T * 1.2));
        const f = tz.ficha(Xi + 18, Yi, [[{ t: 'Termómetro', f: 'ui', tam: 11.5 }], [{ t: 'T', f: 'sim', tam: 13, color: 'termico' }, { t: ' = ' + cantidad(T, 'K', 4), f: 'num', tam: 11.5 }]]);
        Yi += Math.max(f.h, 40) + 12;
      }
      // Leyenda de especies (forma y nombre: la materia no tiene color)
      E.especies.forEach((s, i) => {
        tz.termoMuestraEspecie(Xi, Yi + 7, i, RADIOS[i]);
        tz.texto(`${s.nombre} · ${SIM.medidas.length ? contar(k, i) : s.N}`, Xi + 10, Yi + 11, { tam: 11.5, color: 'texto-2' });
        Yi += 18;
      });
      tz.texto(`${miles(SIM.eventos)} eventos calculados`, Xi - 4, Yi + 12, { tam: 10.5, color: 'texto-3' });
    }
    // Evento reciente: orificio que se abre o émbolo que arranca o se para
    const ev = eventos().filter(e => e.t <= t + 1e-15 && t - e.t < SIM.duracion * 0.06).pop();
    if (ev) {
      const p = ev.donde, [ax, ay] = tz.eventoAnillo(p);
      tz.ficha(ax + 12, ay - 40, [[{ t: ev.nombre, f: 'ui', tam: 11.5 }], [{ t: 't', f: 'sim', tam: 13 }, { t: ' = ' + ns(ev.t), f: 'num', tam: 11.5 }]], { ancla: [ax + 5, ay - 5] });
    }
    // Selección
    if (sel === 'caja') { const [X, Y, W, H] = tz.rectPx(0, 0, Xp, Ly); tz.seleccionRegion(X, Y, W, H, { dentroX: true, dentroY: true }); }
    else if (sel === 'embolo') { const [X, Y, W, H] = tz.rectPx(Xp, 0, Xp + 3, Ly); tz.seleccionRegion(X, Y, W, H, { dentroY: true }); }
    else if (sel === 'tabique' && E.tabique) { const [X, Y, W, H] = tz.rectPx(E.tabique.x * NM - 1, 0, E.tabique.x * NM + 1, Ly); tz.seleccionCaja(X, Y, W, H); }
    escala();
    void c;
  }
  // Barra de escala en nm (el núcleo la escribe en m)
  function escala() {
    const v = tz.vista, m = pasoAgradable(80 / v.escala), L = m * v.escala, x = 16, y = tz.h - 56;
    tz.lineaPx([[x, y - 4], [x, y + 4]], { color: 'texto-2', grosor: 1.5 }); tz.lineaPx([[x + L, y - 4], [x + L, y + 4]], { color: 'texto-2', grosor: 1.5 });
    tz.lineaPx([[x, y], [x + L, y]], { color: 'texto-2', grosor: 1.5 });
    tz.texto(`${fmt(m, 2)} nm`, x + L / 2, y - 9, { fuente: 'num', tam: 11, color: 'texto-2', alinear: 'center', halo: true });
  }
  const contar = (k, s) => { if (!E.tabique) return SIM.especie.filter(e => e === s).length; const b = k * 2 * SIM.N; let iz = 0, de = 0; for (let i = 0; i < SIM.N; i++) if (SIM.especie[i] === s) { if (SIM.pos[b + 2 * i] < E.tabique.x) iz++; else de++; } return `${iz} | ${de}`; };
  function eventos() {
    const L = [], Ly = E.Ly * NM;
    for (const o of E.orificio || []) L.push({ t: o.t, nombre: o.abierto ? 'Se abre el orificio' : 'Se cierra el orificio', donde: [E.tabique.x * NM, Ly / 2] });
    for (const s of E.embolo || []) {
      const Xp = q => SIM.medidas[kDe(q)].Xp * NM;
      L.push({ t: s.t0, nombre: s.u < 0 ? 'El émbolo empieza a comprimir' : 'El émbolo empieza a retirarse', donde: [Xp(s.t0), Ly] });
      if (s.t1 < SIM.duracion) L.push({ t: s.t1, nombre: 'El émbolo se detiene', donde: [Xp(s.t1), Ly] });
    }
    return L.sort((a, b) => a.t - b.t);
  }

  function objetoEn(X, Y) {
    if (!SIM) return null;
    const v = tz.vista, k = kDe(t), base = k * 2 * SIM.N, Ly = E.Ly * NM, Xp = SIM.medidas[k].Xp * NM;
    for (let i = 0; i < SIM.N; i++) { const [x, y] = v.P([SIM.pos[base + 2 * i] * NM, SIM.pos[base + 2 * i + 1] * NM]); if (Math.hypot(x - X, y - Y) < 6) return 'm' + i; }
    const w = [v.mx(X), v.my(Y)];
    if (w[0] >= Xp - 1 && w[0] <= Xp + 9 && w[1] >= 0 && w[1] <= Ly) return 'embolo';
    if (E.tabique && Math.abs(w[0] - E.tabique.x * NM) < 1.5 && w[1] >= 0 && w[1] <= Ly) return 'tabique';
    if (w[0] >= 0 && w[0] <= Xp && w[1] >= 0 && w[1] <= Ly) return 'caja';
    if (w[0] >= -3 && w[0] <= Xp + 3 && w[1] >= -3 && w[1] <= Ly + 3) return 'caja';
    return null;
  }

  // ---------------------------------------------------------------------
  // Inspector, árbol, lecturas y examen
  // ---------------------------------------------------------------------
  const fila = (etq, control) => `<div class="fila"><span class="etq">${etq}</span>${control}</div>`;
  const campoFijo = (val, u, ayuda) => `<div class="campo"${ayuda ? ` data-ayuda="${ayuda}"` : ''}><input value="${val}" readonly tabindex="-1"><span class="u">${u}</span></div>`;
  function inspector() {
    let ico = 'o-caja-molecular', nombre = 'Caja', html = '', estado = '';
    if (/^e\d$/.test(sel) && E.especies[+sel.slice(1)]) {
      const s = E.especies[+sel.slice(1)];
      ico = 'o-gas'; nombre = `Especie ${s.nombre}`; estado = 'Esferas duras';
      html = fila('Masa', campoFijo(fmt(s.m / 1.66053906660e-27, 4), 'u')) + fila('Radio', campoFijo(fmt(s.r * NM, 3), 'nm')) + fila('Moléculas', campoFijo(String(s.N), ''))
        + `<p class="ayuda-fila">En la caja plana: ½·m·⟨v²⟩ = k·T y v<sub>rms</sub> = √(2kT/m). Haz clic en una molécula para seguirla.</p>`;
    } else if (sel === 'tabique' && E.tabique) {
      ico = 'o-orificio'; nombre = 'Tabique con orificio'; estado = SIM.medidas[kDe(t)].abierto ? 'Orificio abierto' : 'Orificio cerrado';
      html = fila('Posición', campoFijo(fmt(E.tabique.x * NM, 3), 'nm')) + fila('Orificio', campoFijo(fmt(E.tabique.hueco * NM, 3), 'nm'));
    } else if (sel === 'embolo') {
      ico = 'o-embolo'; nombre = 'Émbolo'; estado = (E.embolo || []).length ? 'Se mueve a velocidad dada' : 'Quieto';
      html = (E.embolo || []).map(s => fila('Tramo', campoFijo(`${fmt(s.u, 3)} m/s de ${fmt(s.t0 * NS, 3)} a ${fmt(s.t1 * NS, 3)} ns`, ''))).join('') || '<p class="ayuda-fila">La pared derecha no se mueve en esta escena.</p>';
      html += '<p class="ayuda-fila">Cada molécula rebota en la pared móvil con v′ = 2u − v: el trabajo del émbolo es la energía cinética ganada.</p>';
    } else {
      sel = 'caja';
      html = (ESC.nota ? `<p class="ayuda-fila" style="margin:2px 0 8px">${ESC.nota}</p>` : '')
        + fila('Tamaño', campoFijo(`${fmt(E.Lx * NM, 3)} × ${fmt(E.Ly * NM, 3)}`, 'nm'))
        + fila('Paredes', campoFijo(E.paredes === 'termica' ? `Térmicas a ${fmt(E.Tpared, 4)} K` : 'Adiabáticas', '', E.paredes === 'termica' ? 'Devuelven cada molécula con la distribución de su temperatura|Thermal walls' : 'Rebote elástico: no dan ni quitan energía|Adiabatic walls'))
        + fila('Promedio', `<div class="segmentado texto" id="p-ventana" data-ayuda="Ventana de promedio del manómetro|Averaging window">${[0.2, 0.5, 1].map(w => `<button data-w="${w}" aria-pressed="${Math.abs(ventana * NS - w) < 1e-9}">${w} ns</button>`).join('')}</div>`);
      estado = `${SIM.N} moléculas · ${E.especies.map(s => s.nombre).join(', ')}`;
    }
    $('#insp-ico').setAttribute('href', '#' + ico);
    $('#insp-nombre').textContent = nombre;
    $('#insp-estado').textContent = estado;
    $('#propiedades').innerHTML = html;
    const pv = $('#p-ventana'); if (pv) pv.addEventListener('click', ev => { const b = ev.target instanceof Element ? ev.target.closest('button') : null; if (b) { ventana = +b.dataset.w / NS; inspector(); todo(); } });
    arbol();
  }
  function arbol() {
    const nodo = (s, ico, nom, dato) => `<div class="nodo" data-sel="${s}" aria-selected="${sel === s}"><svg class="ico"><use href="#${ico}"/></svg><span class="nombre">${nom}</span><span class="dato">${dato}</span></div>`;
    let h = nodo('caja', 'o-caja-molecular', 'Caja', E.paredes === 'termica' ? 'térmica' : 'adiabática');
    E.especies.forEach((s, i) => { h += nodo('e' + i, 'o-gas', s.nombre, `${s.N} · ${fmt(s.m / 1.66053906660e-27, 3)} u`); });
    h += nodo('embolo', 'o-embolo', 'Émbolo', (E.embolo || []).length ? 'móvil' : 'quieto');
    if (E.tabique) h += nodo('tabique', 'o-orificio', 'Tabique', `${fmt(E.tabique.hueco * NM, 3)} nm`);
    $('#arbol').innerHTML = h;
  }
  $('#arbol').addEventListener('click', ev => { const n = ev.target instanceof Element ? ev.target.closest('.nodo') : null; if (n) seleccionar(n.dataset.sel); });
  function seleccionar(s) { sel = s; inspector(); lecturas(); dibujar(); }

  function lecturas() {
    if (!SIM) return;
    const k = kDe(t), m = SIM.medidas[k], P = presion(t), T = Tde(k);
    $('#reloj').innerHTML = `<span class="sim">t</span>${fmt(t * NS, 4).padStart(6, ' ')}<span class="u">ns</span>`;
    $('#lect-titulo').textContent = `Lecturas en t = ${ns(t)}`;
    let filas;
    if (/^e\d$/.test(sel)) {
      const s = +sel.slice(1), q = especie(k, s), Ts = q.Ek / K_B;
      filas = [['<span class="sim">N</span>', q.N, ''], ['⟨<span class="sim">E</span><sub class="r">k</sub>⟩', q.Ek * ZJ, 'zJ', 'Energía cinética media de la especie (1 zJ = 10⁻²¹ J)|Mean kinetic energy'],
        ['<span class="sim">T</span><sub class="r">especie</sub>', Ts, 'K', '⟨E_k⟩/k de esta especie|Species temperature'], ['<span class="sim">v</span><sub class="r">rms</sub>', q.vrms, 'm/s', 'Rapidez cuadrática media medida|RMS speed'],
        ['√(2<span class="sim">kT</span>/<span class="sim">m</span>)', rapidezRms2D(q.m, T), 'm/s', 'v_rms con la temperatura de toda la caja|Expected RMS speed']];
    } else {
      filas = [['<span class="sim">N</span>', SIM.N, ''], ['<span class="sim">T</span>', T, 'K', 'Temperatura: ⟨E_k⟩/k en la caja plana|Temperature'],
        ['<span class="sim">P</span>', Number.isFinite(P.total) ? P.total : NaN, 'N/m', 'Presión medida en las paredes (fuerza por unidad de longitud) en la ventana elegida|Measured pressure'],
        ['<span class="sim">NkT</span>/<span class="sim">A</span>', Pideal(k), 'N/m', 'Presión del gas ideal plano|Ideal-gas pressure'],
        ['<span class="sim">A</span>', area(m) * NM * NM, 'nm²', 'Área de la caja|Box area'], ['<span class="sim">E</span><sub class="r">k</sub>', m.Ek * ZJ, 'zJ', 'Energía cinética total (1 zJ = 10⁻²¹ J)|Total kinetic energy']];
      if ((E.embolo || []).length) filas.push(['<span class="sim">W</span><sub class="r">émbolo</sub>', m.Wemb * ZJ, 'zJ', 'Trabajo del émbolo sobre el gas|Piston work']);
      if (E.paredes === 'termica') filas.push(['<span class="sim">Q</span><sub class="r">pared</sub>', m.Qpared * ZJ, 'zJ', 'Calor que dan las paredes|Heat from walls']);
      if (E.tabique) filas.push(['<span class="sim">P</span><sub class="r">izq</sub>', P.izq, 'N/m', 'Presión en la pared izquierda|Left wall'], ['<span class="sim">P</span><sub class="r">der</sub>', P.der, 'N/m', 'Presión en el émbolo|Right wall']);
      filas.push(['Choques', m.choques, '', 'Choques entre moléculas desde el principio|Collisions']);
    }
    // Presiones con prefijo SI (µN/m); el resto con su unidad
    const conU = ([a, val, u, ay]) => { if (u !== 'N/m' || !Number.isFinite(val)) return [a, val, u, ay]; const txt = conPrefijo(val, u, 4), i = txt.lastIndexOf(Volta.ESP); return [a, txt.slice(0, i), txt.slice(i + 1), ay]; };
    $('#lecturas').innerHTML = filas.map(f => filaLectura(conU(f))).join('');
    $('#grupo-examen').hidden = !FILAS.length;
    if (FILAS.length) { $('#examen-titulo').textContent = `Examen · MEXT ${ESC.anio}`; $('#examen').innerHTML = examenHTML(FILAS, t); }
  }

  // ---------------------------------------------------------------------
  // Paneles inferiores
  // ---------------------------------------------------------------------
  const lt = new LineaTiempo($('#tl'), { duracion: 1, eventos: [], alCambiar: nt => repro.irA(nt / NS) });
  const PATRONES = ['continuo', 'discontinuo', 'punteado'];
  function leyendaEspecies() {
    return `<span class="leyenda">${E.especies.map((s, i) => `<span style="color:var(--texto-2)"><i${i ? ` class="${i === 1 ? 'discontinua' : 'discontinua'}"` : ''}></i>${s.nombre}</span>`).join('')}</span>`;
  }
  function graficas() {
    if ($('#p-graficas').hidden || !SIM) return;
    const k = kDe(t), T = Math.max(1, Tde(k));
    // 1 · Histograma de rapideces (promedio de los últimos cuadros) con la curva de Maxwell–Boltzmann 2D
    const vmax = 3.2 * Math.max(...E.especies.map(s => rapidezProbable2D(s.m, T)));
    const B = 24, dv = vmax / B, k0 = Math.max(0, k - 24);
    const series = [];
    let ymax = 0;
    E.especies.forEach((s, si) => {
      const cuenta = Array(B).fill(0); let n = 0;
      for (let q = k0; q <= k; q++) { const b = q * 2 * SIM.N; for (let i = 0; i < SIM.N; i++) if (SIM.especie[i] === si) { const vv = Math.hypot(SIM.vel[b + 2 * i], SIM.vel[b + 2 * i + 1]), j = Math.floor(vv / dv); n++; if (j < B) cuenta[j]++; } }
      const esc = 1 / Math.max(1, n) / dv, escalon = [];
      cuenta.forEach((cc, j) => { const y = cc * esc; ymax = Math.max(ymax, y); escalon.push([j * dv, y], [(j + 1) * dv, y]); });
      series.push({ tramos: [escalon], familia: 'texto-2', patron: PATRONES[si % 3] });
      const curva = []; for (let j = 0; j <= 100; j++) { const vv = vmax * j / 100, y = maxwell2D(vv, s.m, T); ymax = Math.max(ymax, y); curva.push([vv, y]); }
      series.push({ tramos: [curva], familia: 'movimiento', auxiliar: true, etiqueta: E.especies.length > 1 ? s.nombre : null });
    });
    $('#t1').innerHTML = `<span class="leyenda"><span style="color:var(--texto-2)"><i></i>Histograma</span><span style="color:var(--f-movimiento)" data-ayuda="Distribución de Maxwell–Boltzmann en 2D|Maxwell–Boltzmann"><i class="discontinua"></i>Maxwell</span></span>`;
    grafica($('#g1'), { x: { min: 0, max: vmax }, y: { min: 0, max: ymax * 1.1 || 1 }, series, eventos: [] });
    $('#l1').textContent = 'v (m/s)';
    // 2 · Presión medida y N·k·T/A
    const pts = [], ideal = [], N = SIM.cuadros, paso = Math.max(1, Math.floor(N / 200));
    for (let q = 0; q < N; q += paso) { const tt = SIM.medidas[q].t, p = presion(tt); if (Number.isFinite(p.total)) pts.push([tt * NS, p.total]); ideal.push([tt * NS, Pideal(q)]); }
    const ys = [...pts.map(p => p[1]), ...ideal.map(p => p[1])], hasta = pts.filter(p => p[0] <= t * NS + 1e-9);
    grafica($('#g2'), { x: { min: 0, max: SIM.duracion * NS }, y: { min: 0, max: Math.max(...ys) * 1.15 || 1 }, cursor: t * NS, eventos: eventos().map(e => ({ x: e.t * NS })),
      series: [{ tramos: [hasta], familia: 'tinta' }, { tramos: [ideal], familia: 'texto-3', auxiliar: true }] });
    $('#t2').innerHTML = '<span class="leyenda"><span style="color:var(--tinta)"><i></i><span class="sim">P</span> medida</span><span style="color:var(--texto-3)"><i class="discontinua"></i><span class="sim">NkT</span>/<span class="sim">A</span></span></span>';
    const P = presion(t); $('#l2').textContent = Number.isFinite(P.total) ? conPrefijo(P.total, 'N/m', 3) : '—';
    // 3 · Temperatura de cada especie
    const tser = E.especies.map((s, si) => { const p = []; for (let q = 0; q < N && SIM.medidas[q].t <= t + 1e-15; q += paso) p.push([SIM.medidas[q].t * NS, especie(q, si).Ek / K_B]); return { tramos: [p], familia: 'termico', patron: PATRONES[si % 3], etiqueta: E.especies.length > 1 && t > SIM.duracion * 0.15 ? s.nombre : null }; });
    const todasT = []; for (let q = 0; q < N; q += paso) E.especies.forEach((s, si) => todasT.push(especie(q, si).Ek / K_B));
    const tMin = Math.min(...todasT), tMax = Math.max(...todasT), dT = Math.max(tMax - tMin, tMax * 0.1);
    grafica($('#g3'), { x: { min: 0, max: SIM.duracion * NS }, y: { min: Math.max(0, tMin - dT * 0.3), max: tMax + dT * 0.3 }, cursor: t * NS, eventos: eventos().map(e => ({ x: e.t * NS })), series: tser });
    $('#t3').innerHTML = `<span><span class="sim">T</span> (K) contra <span class="sim">t</span> (ns)${E.especies.length > 1 ? ', por especie' : ''}</span>`;
    $('#l3').textContent = cantidad(Tde(k), 'K', 4);
    void leyendaEspecies;
  }
  function tablas() {
    if (!SIM) return;
    const k = kDe(t), T = Tde(k);
    if (!$('#p-especies').hidden) {
      let h = '<tr><th>Especie</th><th>m (u)</th><th>N</th><th>⟨Ek⟩ (zJ)</th><th>T especie (K)</th><th>v rms (m/s)</th><th>√(2kT/m) (m/s)</th><th>v p (m/s)</th></tr>';
      E.especies.forEach((s, si) => { const q = especie(k, si); h += `<tr><td class="texto">${s.nombre}</td><td>${fmt(s.m / 1.66053906660e-27, 4)}</td><td>${q.N}</td><td>${fmt(q.Ek * ZJ, 4)}</td><td>${fmt(q.Ek / K_B, 4)}</td><td>${fmt(q.vrms, 4)}</td><td>${fmt(rapidezRms2D(s.m, T), 4)}</td><td>${fmt(rapidezProbable2D(s.m, T), 4)}</td></tr>`; });
      $('#t-especies').innerHTML = h;
    }
    if (!$('#p-tabla').hidden) {
      let h = '<tr><th>t (ns)</th><th>T (K)</th><th>P medida (µN/m)</th><th>NkT/A (µN/m)</th><th>Ek (zJ)</th><th>W émbolo (zJ)</th><th>Q paredes (zJ)</th><th>choques</th></tr>';
      const paso = Math.max(1, Math.round(SIM.cuadros / 40));
      for (let q = 0; q < SIM.cuadros; q += paso) {
        const m = SIM.medidas[q], p = presion(m.t);
        h += `<tr class="${Math.abs(q - k) < paso / 2 ? 'actual' : ''}"><td>${fmt(m.t * NS, 4)}</td><td>${fmt(Tde(q), 4)}</td><td>${Number.isFinite(p.total) ? fmt(p.total * 1e6, 4) : '—'}</td><td>${fmt(Pideal(q) * 1e6, 4)}</td><td>${fmt(m.Ek * ZJ, 4)}</td><td>${fmt(m.Wemb * ZJ, 4)}</td><td>${fmt(m.Qpared * ZJ, 4)}</td><td>${m.choques}</td></tr>`;
      }
      $('#t-datos').innerHTML = h;
    }
  }

  // ---------------------------------------------------------------------
  // Escena: abrir, guardar, deshacer
  // ---------------------------------------------------------------------
  function titulo() { ponerTitulo(ESC, NOMBRE_ESPACIO); }
  function recalcularPronto() { clearTimeout(reloj); reloj = setTimeout(() => { recalcular(); registrar(); }, 120); }
  function construirVars() { construirVariables($('#variables'), VAR, recalcularPronto); }
  const instantanea = () => ({ clave: ESC.clave, vars: vals(), capas: { ...capas }, instr: { ...instr }, ventana, marcada });
  function registrar() { if (historial && historial.registrar(instantanea())) botonesHistorial(); if (autoguardar) autoguardado.guardar('termodinamica-molecular', escenaActual()); }
  function botonesHistorial() { $('#b-deshacer').disabled = !historial?.puedeDeshacer; $('#b-rehacer').disabled = !historial?.puedeRehacer; }
  function deshacer() { const d = historial?.deshacer(); if (d) { restaurar(d); botonesHistorial(); } }
  function rehacer() { const d = historial?.rehacer(); if (d) { restaurar(d); botonesHistorial(); } }
  function datosSeguros(d = {}) {
    const base = ESCENAS_MOLECULAR.find(e => e.clave === d.clave) || ESCENAS_MOLECULAR[0], vars = {};
    for (const [k, def] of Object.entries(base.variables || {})) vars[k] = numero(d.vars?.[k], def.val, def.min, def.max);
    const bool = (o, def) => Object.fromEntries(Object.keys(def).map(k => [k, typeof o?.[k] === 'boolean' ? o[k] : def[k]]));
    return { clave: base.clave, vars, capas: bool(d.capas, { velocidades: false, trazas: true, instrumentos: true, cotas: true }), instr: bool(d.instr, { marcada: true, histograma: true, manometro: true, termometro: true }),
      ventana: numero(d.ventana, 0.5e-9, 0.1e-9, 2e-9), marcada: Math.round(numero(d.marcada, 0, 0, 1e4)) };
  }
  function restaurar(d) {
    const s = datosSeguros(d);
    ESC = escenaPorClave(s.clave); VAR = copia(ESC.variables || {});
    for (const k in s.vars) if (VAR[k]) VAR[k].val = s.vars[k];
    Object.assign(capas, s.capas); Object.assign(instr, s.instr); ventana = s.ventana; marcada = s.marcada;
    pintarBotones(); titulo(); construirVars(); recalcular(false); inspector();
  }
  function abrirEscena1(clave) {
    const e = escenaPorClave(clave); if (!e) return;
    if (e.espacio !== ESPACIO) { irAEscenaDeOtroEspacio(e); return; }
    ESC = e; VAR = copia(e.variables || {}); sel = 'caja'; marcada = 0;
    titulo(); construirVars(); recalcular(false);
    vistaTocada = false; encuadrar(); escala0 = tz.vista.escala; zoomTexto();
    inspector(); repro.irA(0);
    if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); }
  }
  function escenaActual() { return crearEscena({ modulo: 'termodinamica', espacio: ESPACIO, titulo: ESC.titulo, datos: instantanea() }); }
  function guardar() { guardarEscena(escenaActual()).then(r => { if (r) avisar('Escena guardada'); }, e => avisar(`No se pudo guardar: ${e}`)); }
  function abrir() {
    abrirEscena({ modulo: 'termodinamica' }).then(e => {
      if (aOtroEspacio(e, ESPACIO)) return;
      restaurar(e.datos); repro.irA(0);
      if (historial) { historial.reiniciar(instantanea()); botonesHistorial(); }
      avisar(`Escena abierta: ${texto(e.titulo, 'sin título', 60)}`);
    }).catch(err => avisar(err.message));
  }
  function recalcular(guardarAuto = true) {
    try { simular(); }
    catch (e) { avisar(e.message); return; }
    if (SIM.incompleta) avisar(`Simulación incompleta en ${ns(SIM.incompleta.t)}: ${SIM.incompleta.motivo}`);
    lt.duracion = SIM.duracion * NS; lt.simulado = lt.duracion;
    lt.eventos = eventos().map(e => ({ t: e.t * NS, nombre: e.nombre }));
    if (t > SIM.duracion) t = SIM.duracion;
    if (!vistaTocada) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); }
    arbol(); todo();
    if (guardarAuto && autoguardar) autoguardado.guardar('termodinamica-molecular', escenaActual());
  }
  function todo() { dibujar(); lecturas(); lt.poner(t * NS); graficas(); tablas(); }

  function exportarCSV() {
    const filas = SIM.medidas.map((m, q) => { const p = presion(m.t); return [m.t, Tde(q), Number.isFinite(p.total) ? p.total : '', Pideal(q), m.Ek, m.Wemb, m.Qpared, m.choques, m.Xp]; });
    descargarTexto(nombreArchivo(ESC.titulo) + '-medidas.csv', aCSV(['t (s)', 'T (K)', 'P medida (N/m)', 'NkT/A (N/m)', 'Ek (J)', 'W émbolo (J)', 'Q paredes (J)', 'choques', 'X émbolo (m)'], filas))
      .then(r => { if (r) avisar(`Datos exportados: ${filas.length} filas`); }, () => {});
  }
  $('#b-exportar').addEventListener('click', exportarCSV);

  // ---------------------------------------------------------------------
  // Instrumentos, capas, lienzo
  // ---------------------------------------------------------------------
  function pintarBotones() {
    document.querySelectorAll('.capa-btn').forEach(b => b.setAttribute('aria-pressed', String(!!capas[b.dataset.capa])));
    document.querySelectorAll('#paleta-instrumentos .herr').forEach(b => b.setAttribute('aria-pressed', String(!!instr[b.dataset.herr])));
  }
  const alternarCapa = k => { capas[k] = !capas[k]; pintarBotones(); if (k === 'instrumentos' && !vistaTocada) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } registrar(); dibujar(); };
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => alternarCapa(b.dataset.capa)));
  document.querySelectorAll('#paleta-instrumentos .herr').forEach(b => b.addEventListener('click', () => { const k = b.dataset.herr; instr[k] = !instr[k]; setTimeout(pintarBotones, 0); registrar(); todo(); }));
  $('#pest').addEventListener('click', () => setTimeout(() => { graficas(); tablas(); }, 0));

  lienzo.addEventListener('pointerdown', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, v = tz.vista;
    if (ev.button === 1 || ev.button === 2 || espacioPulsado) { paneo = [X, Y, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId); return; }
    const ob = objetoEn(X, Y);
    if (ob && ob.startsWith('m')) { marcada = +ob.slice(1); instr.marcada = true; pintarBotones(); seleccionar('e' + SIM.especie[marcada]); avisar(`Molécula de ${E.especies[SIM.especie[marcada]].nombre} marcada`); return; }
    if (ob) { seleccionar(ob); return; }
    paneo = [X, Y, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId);
  });
  lienzo.addEventListener('pointermove', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, v = tz.vista;
    $('#cx').textContent = cantidad(v.mx(X), 'nm', 4); $('#cy').textContent = cantidad(v.my(Y), 'nm', 4);
    if (paneo) { vistaTocada = true; v.ox = paneo[2] + X - paneo[0]; v.oy = paneo[3] + Y - paneo[1]; dibujar(); return; }
    const ob = objetoEn(X, Y), h = ob && ob.startsWith('m') ? null : ob;
    lienzo.style.cursor = ob ? 'pointer' : 'default';
    if (h !== hover) { hover = h; dibujar(); }
  });
  lienzo.addEventListener('pointerup', () => { paneo = null; });
  lienzo.addEventListener('pointerleave', () => { if (hover) { hover = null; dibujar(); } });
  lienzo.addEventListener('contextmenu', ev => ev.preventDefault());
  lienzo.addEventListener('wheel', ev => { ev.preventDefault(); const r = lienzo.getBoundingClientRect(); vistaTocada = true; tz.vista.zoom(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top); zoomTexto(); dibujar(); }, { passive: false });
  function zoomTexto() { $('#zoom').textContent = Math.round(tz.vista.escala / escala0 * 100) + ' %'; }
  function zoomCentro(f) { vistaTocada = true; tz.vista.zoom(f, tz.w / 2, tz.h / 2); zoomTexto(); dibujar(); }
  function encuadrarTodo() { vistaTocada = false; encuadrar(); escala0 = tz.vista.escala; zoomTexto(); dibujar(); }
  $('#b-zoom-mas').addEventListener('click', () => zoomCentro(1.25));
  $('#b-zoom-menos').addEventListener('click', () => zoomCentro(0.8));
  $('#b-encuadrar').addEventListener('click', encuadrarTodo);
  $('#b-deshacer').addEventListener('click', deshacer);
  $('#b-rehacer').addEventListener('click', rehacer);

  // Reproducción: a 1×, 1 s real recorre la duración en unos 8 s
  const repro = crearReproductor({ duracion: () => (SIM ? SIM.duracion : 1), escala: () => (SIM ? SIM.duracion / 8 : 1), alCambiar: nt => { t = nt; todo(); } });
  iniciarMenuEscenas(ESCENAS_MOLECULAR, () => ESC.clave, abrirEscena1);
  const cmd = iniciarComandos(() => [
    ['i-reproducir', 'Reproducir o pausar', 'Espacio', repro.alternar],
    ['i-reiniciar', 'Volver al principio', 'Inicio', () => repro.irA(0)],
    ['i-capas', 'Mostrar u ocultar las velocidades', 'V', () => alternarCapa('velocidades')],
    ['i-capas', 'Mostrar u ocultar la traza', 'T', () => alternarCapa('trazas')],
    ['o-particula', 'Marcar otra molécula', 'M', () => { marcada = (marcada + 1) % SIM.N; dibujar(); }],
    ['i-historial', 'Restablecer la escena original', '', () => abrirEscena1(ESC.clave)],
    ['i-encuadrar', 'Encuadrar todo', 'F', encuadrarTodo],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['i-deshacer', 'Deshacer', 'Ctrl Z', deshacer], ['i-rehacer', 'Rehacer', 'Ctrl Y', rehacer],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar], ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
    ['i-exportar', 'Exportar las medidas a CSV', '', exportarCSV],
    ['i-imagen', 'Exportar imagen del lienzo', '', () => descargarLienzo(lienzo, nombreArchivo(ESC.titulo) + '.png')],
    ...ESCENAS_MOLECULAR.map(e => [ICONO_TIPO[e.tipo], `Abrir escena: ${e.titulo}`, chipDe(e), () => abrirEscena1(e.clave), 'Escenas']),
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
    else if (tecla === 'f') encuadrarTodo();
    else if (tecla === 'v') alternarCapa('velocidades');
    else if (tecla === 't') alternarCapa('trazas');
    else if (tecla === 'm') { marcada = (marcada + 1) % SIM.N; dibujar(); }
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });

  // ---------------------------------------------------------------------
  // Arranque. Parámetros: ?escena=efusion&t=2&sel=e0&pest=especies
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); if (!vistaTocada && SIM) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } if (SIM) todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search), limpio = ![...q.keys()].filter(k => k !== 'tema').length;
    const pend = escenaPendiente('termodinamica');
    if (pend && aOtroEspacio(pend, ESPACIO)) return;
    const previa = pend || (limpio ? autoguardado.leer('termodinamica-molecular', { modulo: 'termodinamica' }) : null);
    tz.ajustar();
    if (q.has('escena') || !previa) {
      const e = escenaPorClave(q.get('escena') || '') || ESCENAS_MOLECULAR[0];
      if (e.espacio !== ESPACIO) { irAEscenaDeOtroEspacio(e); return; }
      ESC = e; VAR = copia(e.variables || {});
      titulo(); construirVars(); recalcular(false);
    } else restaurar(previa.datos);
    if (q.has('sel')) sel = q.get('sel');
    autoguardar = limpio || !!previa;
    pintarBotones(); encuadrar(); escala0 = tz.vista.escala; zoomTexto();
    inspector();
    const pe = q.get('pest'); if (pe) { const b = document.querySelector(`#pest [aria-controls="p-${pe}"]`); if (b) b.click(); }
    repro.irA(q.has('t') ? (parseFloat(q.get('t')) || 0) / NS : 0);
    historial = new Historial(instantanea()); botonesHistorial();
    repro.arrancar();
  });
})();
