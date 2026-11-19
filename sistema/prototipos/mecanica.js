/* ==========================================================================
   Volta · prototipo de Mecánica — "Cinemática y proyectiles"
   Implementación de referencia del lenguaje de diseño: así se arma un
   espacio de trabajo. Física exacta por tramos con eventos (2019 P3).
   ========================================================================== */
import { simularProyectil, estadoEn, energiaEn } from '../motores/proyectiles.js';
import { aCSV, muestrear } from '../nucleo/csv.js';
import { descargarTexto, descargarLienzo, nombreArchivo, avisar } from '../componentes/exportar.js';
import { crearEscena, numero } from '../nucleo/escena.js';
import { Historial } from '../nucleo/historial.js';
import { evaluar, DIM } from '../nucleo/unidades.js';
import { fmtPaso } from '../nucleo/formato.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';

(function () {
  'use strict';
  const { Trazo, fmt, cantidad, grafica, LineaTiempo } = Volta;
  const $ = s => document.querySelector(s);

  // ---------------------------------------------------------------------
  // Parámetros (variables de la escena)
  // ---------------------------------------------------------------------
  const V = {
    h:  { sim: 'h',  val: 3.0, min: 0.5, max: 5,   paso: 0.05, u: 'm' },
    th: { sim: 'θ',  val: 35,  min: 10,  max: 70,  paso: 1,    u: '°' },
    v0: { sim: 'v',  sub: '0', val: 4.0, min: 0,   max: 10,  paso: 0.05, u: 'm/s' },
    e:  { sim: 'e',  val: 0.5, min: 0,   max: 1,   paso: 0.01, u: '' },
    g:  { sim: 'g',  val: 9.8, min: 9.8, max: 9.8, paso: 0.01, u: 'm/s²', constante: true },
  };
  let M = 0.5;            // masa (kg), editable en el inspector
  const DUR = 2.4;        // duración simulada (s)
  let alfa = 0;           // ángulo de lanzamiento (rad)
  const capas = { vectores: true, traza: true, estrobo: true, cotas: true };

  // ---------------------------------------------------------------------
  // Física: motor puro en sistema/motores/proyectiles.js (probado aparte)
  // ---------------------------------------------------------------------
  let SIM;
  function simular() {
    SIM = simularProyectil({
      h: V.h.val, theta: V.th.val * Math.PI / 180, v0: V.v0.val, alfa,
      e: V.e.val, g: V.g.val, masa: M, duracion: DUR,
    });
  }
  const estado = t => estadoEn(SIM, t);
  const energia = s => energiaEn(SIM, s);

  // ---------------------------------------------------------------------
  // Estado de la interfaz
  // ---------------------------------------------------------------------
  let t = 0, jugando = false, velocidad = 1, ultimo = 0, encuadreHecho = false;
  let vistaTocada = false;   // mientras el usuario no mueva la vista, se reencuadra al cambiar el tamaño
  const lienzo = $('#lienzo'), area = $('#area');
  const tz = new Trazo(lienzo);
  let arrastre = null, cursorMundo = null, paneo = null;

  // ---------------------------------------------------------------------
  // Dibujo del lienzo
  // ---------------------------------------------------------------------
  function encuadrar() {
    tz.vista.encuadrar({ x0: -1.7, x1: Math.max(6.5, SIM.L + 2.2), y0: -0.5, y1: SIM.h + 0.9 }, { x: 0, y: 40, w: tz.w, h: tz.h - 80 }, 36);
    encuadreHecho = true;
  }
  function dibujar() {
    if (!encuadreHecho) encuadrar();
    const v = tz.vista, h = SIM.h, L = SIM.L;
    tz.limpiar(); tz.cuadricula(); tz.ejes({ x: 'x', y: 'y' });

    // Geometría fija: plataforma, pendiente y suelo en un solo trazo continuo
    tz.superficie([[v.mx(-40), h], [0, h], [L, 0], [v.mx(tz.w + 40), 0]]);

    // Cotas
    if (capas.cotas) {
      tz.cota([-0.75, 0], [-0.75, h], { texto: 'h', desplazamiento: 0 });
      tz.angulo([L, 0], Math.PI - SIM.th, Math.PI, { radio: 34, texto: 'θ' });
    }

    // Trayectorias
    const muestra = (t0, t1, n) => { const p = []; for (let i = 0; i <= n; i++) { const s = estado(t0 + (t1 - t0) * i / n); p.push([s.x, s.y]); } return p; };
    if ($('#m-p').checked) tz.trayectoria(muestra(0, DUR, 480), 'prevista');
    if (capas.traza && t > 0) tz.trayectoria(muestra(0, t, Math.max(2, Math.ceil(t * 200))), 'real');

    // Estroboscopio cada 0.1 s
    if (capas.estrobo) for (let k = 0; k * 0.1 < t - 1e-9; k++) { const s = estado(k * 0.1); tz.fantasma([s.x, s.y]); }

    // Eventos ya ocurridos (choques) con ficha para el primero
    const pasados = SIM.eventos.filter(e => e.t > 0 && e.t <= t + 1e-9);
    const futuros = SIM.eventos.filter(e => e.t > t + 1e-9 && e.nombre.startsWith('Choque'));
    futuros.slice(0, 3).forEach(e => { const [x, y] = v.P([e.x, e.y]); tz.ctx.save(); tz.ctx.globalAlpha = .45; tz.eventoAnillo([e.x, e.y]); tz.ctx.restore(); });
    pasados.forEach(e => tz.eventoAnillo([e.x, e.y]));
    const primero = SIM.eventos.find(e => e.nombre.startsWith('Choque'));
    if (primero) {
      const [px, py] = v.P([primero.x, primero.y]);
      tz.ficha(px - 168, py + 22, [
        [{ t: 'Choque', f: 'ui', tam: 11.5 }, { t: ' · ', f: 'num', tam: 11.5, color: 'texto-3' }, { t: 't', f: 'sim', tam: 13 }, { t: ' = ' + cantidad(primero.t, 's'), f: 'num', tam: 11.5 }],
        [{ t: `(${fmt(primero.x, 4)}, ${fmt(primero.y, 4)}) m`, f: 'num', tam: 11.5 }],
      ], { ancla: [px - 6, py + 5] });
    }

    // Partícula, vectores y selección
    const s = estado(t);
    tz.particula([s.x, s.y], { etiqueta: 'Bola' });
    const escV = 0.2 * v.escala;
    if ($('#m-a').checked && s.fase === 'en vuelo') tz.vector([s.x, s.y], [0, -SIM.g], { familia: 'cambio', escalaPx: 0.05 * v.escala, simbolo: 'a', desdeRadio: Volta.G.particula + 1 });
    if (capas.vectores && $('#m-v').checked) {
      const [ex, ey] = tz.vector([s.x, s.y], [s.vx, s.vy], {
        desdeRadio: Volta.G.particula + 1,
        familia: 'movimiento', escalaPx: escV, simbolo: 'v', valor: Math.hypot(s.vx, s.vy), unidad: 'm/s',
        componentes: $('#m-c').checked, subX: true, subY: Math.abs(s.vy) > 0.3,
      });
      if (t === 0) tz.asaVector(ex, ey, arrastre === 'velocidad');
    }
    const [bx, by] = v.P([s.x, s.y]);
    tz.seleccionCirculo(bx, by, 11);
    tz.barraEscala(16, tz.h - 56);

    // Guía mientras se arrastra la velocidad
    if (arrastre === 'velocidad') {
      const [ex] = [bx + s.vx * escV];
      tz.guia([[bx, by], [bx + 120, by]], null);
      tz.ficha(bx + s.vx * escV + 14, by - s.vy * escV - 34, [
        [{ t: 'v', f: 'sim', tam: 13, color: 'movimiento' }, { t: '0', f: 'simRecta', tam: 9, dy: 3, color: 'movimiento' }, { t: ' = ' + cantidad(V.v0.val, 'm/s', 3), f: 'num', tam: 11.5 }],
        [{ t: 'α', f: 'sim', tam: 13 }, { t: ' = ' + fmt(alfa * 180 / Math.PI, 2) + '°', f: 'num', tam: 11.5 }],
      ]);
    }
  }

  // ---------------------------------------------------------------------
  // Paneles: lecturas, variables, gráficas, energía, eventos, tabla
  // ---------------------------------------------------------------------
  function lecturas() {
    const s = estado(t), { K, U } = energia(s);
    $('#reloj').innerHTML = `<span class="sim">t</span>${fmt(t, 4).padStart(6, ' ')}<span class="u">s</span>`;
    $('#lect-titulo').textContent = `Lecturas en t = ${fmt(t, 4)} s`;
    $('#estado-bola').textContent = 'Partícula · ' + s.fase;
    const filas = [
      ['x', '', s.x, 'm'], ['y', '', s.y, 'm'], ['v', 'x', s.vx, 'm/s'], ['v', 'y', s.vy, 'm/s'],
      ['|v|', '', Math.hypot(s.vx, s.vy), 'm/s'], ['E', 'k', K, 'J'],
    ];
    $('#lecturas').innerHTML = filas.map(([a, b, val, u]) =>
      `<span class="sim">${a}${b ? `<sub${b === 'k' ? ' class="r"' : ''}>${b}</sub>` : ''}</span><span class="v">${fmt(val, 4)}</span><span class="u">${u}</span>`).join('');
    $('#f-y').textContent = fmtVar(V.h); $('#f-v').textContent = fmtVar(V.v0);
    if (document.activeElement !== $('#f-a')) $('#f-a').value = Math.round(alfa * 180 / Math.PI);
    $('#arbol-g').textContent = cantidad(V.g.val, 'm/s²', 3);
    $('#b-play').innerHTML = `<svg class="ico"><use href="#i-${jugando ? 'pausar' : 'reproducir'}"/></svg>`;
    $('#b-play').dataset.ayuda = jugando ? 'Pausar|Pause|Espacio' : 'Reproducir|Play|Espacio';
  }

  // Un valor de variable se escribe con los decimales de su paso (35 °, 3.00 m, 0.50)
  function fmtVar(d) {
    const dec = !(d.paso > 0) || d.paso >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(d.paso) - 1e-9));
    return d.val.toFixed(dec).replace('-', '−');
  }
  function construirVariables() {
    const cont = $('#variables'); cont.innerHTML = '';
    for (const [k, d] of Object.entries(V)) {
      const fila = document.createElement('div'); fila.className = 'var' + (d.constante ? ' constante' : '');
      const sim = `<span class="sim">${d.sim}${d.sub ? `<sub class="r">${d.sub}</sub>` : ''}</span>`;
      const control = d.constante
        ? '<span class="constante-etq">Constante</span>'
        : `<input class="deslizador" type="range" min="${d.min}" max="${d.max}" step="${d.paso}" value="${d.val}" aria-label="${d.sim}">`;
      fila.innerHTML = `${sim}${control}<span class="valor"></span>`;
      const ent = fila.querySelector('input'), val = fila.querySelector('.valor');
      const pintar = () => { val.innerHTML = `${fmtVar(d)}${d.u ? `<span class="u">${d.u}</span>` : ''}`; if (ent) Volta.pintarDeslizador(ent); };
      if (ent) ent.addEventListener('input', () => { d.val = parseFloat(ent.value); pintar(); recalcular(); });
      if (ent) ent.addEventListener('change', registrar);   // un paso de deshacer por arrastre
      pintar(); cont.appendChild(fila);
    }
  }
  // Campos con unidades y expresiones (nucleo/unidades.js): "500 g", "30°", "2*h"
  function variablesSI() {
    const dims = { h: DIM.longitud, th: DIM.adimensional, v0: DIM.velocidad, e: DIM.adimensional, g: DIM.aceleracion };
    return Object.fromEntries(Object.entries(V).map(([k, d]) => [k, { valor: k === 'th' ? d.val * Math.PI / 180 : d.val, dim: dims[k] }]));
  }
  function campoConUnidad(id, opciones, aplicar) {
    const ent = $(id), caja = ent.closest('.campo'), fila = ent.closest('.fila');
    const mostrarError = msj => {
      caja.classList.toggle('es-error', !!msj);
      let p = fila.querySelector('.mensaje-error');
      if (msj && !p) { p = document.createElement('p'); p.className = 'mensaje-error'; fila.appendChild(p); }
      if (p) { if (msj) p.textContent = msj; else p.remove(); }
    };
    ent.addEventListener('change', () => {
      try { aplicar(evaluar(ent.value, { ...opciones, variables: variablesSI() }).valor); mostrarError(null); }
      catch (e) { mostrarError(e.message); }
    });
    ent.addEventListener('keydown', ev => { if (ev.key === 'Escape') { mostrarError(null); ent.blur(); lecturas(); } });
  }
  campoConUnidad('#f-a', { esperada: 'adimensional', unidadPorDefecto: '°' }, rad => {
    alfa = Math.max(-80, Math.min(80, rad * 180 / Math.PI)) * Math.PI / 180; recalcular(); registrar();
  });
  campoConUnidad('#f-m', { esperada: 'masa', unidadPorDefecto: 'kg' }, kg => {
    if (!(kg > 0)) throw new Error('La masa tiene que ser positiva.');
    M = kg; $('#f-m').value = fmtPaso(M, 0.01); recalcular(); registrar();
  });

  const lt = new LineaTiempo($('#tl'), { duracion: DUR, eventos: [], alCambiar: nt => { t = nt; jugando = false; todo(); } });

  function serie(f) { return SIM.tramos.map(tr => { const p = []; for (let i = 0; i <= 50; i++) { const tt = tr.t0 + tr.dur * i / 50; p.push(f(tt, estado(Math.min(tt, tr.t0 + tr.dur - 1e-9)))); } return p; }); }
  function graficas() {
    if ($('#p-graficas').hidden === false) {
      const s = estado(t), hmax = SIM.h * 1.08;
      grafica($('#g1'), { x: { min: 0, max: DUR }, y: { min: 0, max: hmax }, series: [{ tramos: serie((a, q) => [a, q.y]), familia: 'tinta' }], cursor: t, puntoCursor: [t, s.y], eventos: SIM.eventos.filter(e => e.t > 0).map(e => ({ x: e.t, y: e.y })) });
      const vys = SIM.tramos.flatMap(tr => [estado(tr.t0).vy, estado(tr.t0 + tr.dur - 1e-9).vy]);
      grafica($('#g2'), { x: { min: 0, max: DUR }, y: { min: Math.min(-1, ...vys) * 1.1, max: Math.max(1, ...vys) * 1.1 }, series: [{ tramos: serie((a, q) => [a, q.vy]), familia: 'movimiento' }], cursor: t, puntoCursor: [t, s.vy], eventos: SIM.eventos.filter(e => e.t > 0).map(e => ({ x: e.t })) });
      grafica($('#g3'), { x: { min: 0, max: Math.max(6, SIM.L + 1.5) }, y: { min: 0, max: hmax }, series: [{ tramos: serie((a, q) => [q.x, q.y]), familia: 'tinta' }], puntoCursor: [s.x, s.y], eventos: [] });
      $('#l1').textContent = cantidad(s.y, 'm');
      $('#l2').textContent = cantidad(s.vy, 'm/s');
      $('#l3').textContent = SIM.eventos.filter(e => e.nombre.startsWith('Choque')).length + ' choques';
    }
    if ($('#p-energia').hidden === false) energiaPanel();
  }

  function energiaPanel() {
    const s = estado(t), { K, U } = energia(s), E0 = energia(estado(0));
    const tot0 = E0.K + E0.U, dis = tot0 - K - U;
    const maxE = tot0 * 1.02;
    const filas = [
      ['Cinética', 'movimiento', K], ['Potencial gravitatoria', 'cambio', U], ['Disipada en choques', 'termico', dis], ['Total inicial', 'tinta', tot0],
    ];
    $('#barras').innerHTML = filas.map(([n, f, val]) => `<div class="barra-e"><span>${n}</span><span class="riel"><i style="width:${Math.max(0, val / maxE * 100)}%;background:${f === 'tinta' ? 'var(--tinta)' : `var(--f-${f})`}"></i></span><span class="v">${cantidad(val, 'J', 4)}</span></div>`).join('');
    grafica($('#g4'), {
      x: { min: 0, max: DUR }, y: { min: 0, max: maxE },
      series: [
        { tramos: serie((a, q) => [a, energia(q).K]), familia: 'movimiento' },
        { tramos: serie((a, q) => [a, energia(q).U]), familia: 'cambio' },
        { tramos: serie((a, q) => { const e = energia(q); return [a, tot0 - e.K - e.U]; }), familia: 'termico', patron: 'discontinuo' },
      ],
      cursor: t, eventos: SIM.eventos.filter(e => e.t > 0).map(e => ({ x: e.t })),
    });
  }

  function tablas() {
    $('#t-eventos').innerHTML = '<tr><th>Evento</th><th>t (s)</th><th>x (m)</th><th>y (m)</th><th>Energía perdida (J)</th></tr>' +
      SIM.eventos.map(e => `<tr class="${Math.abs(e.t - t) < 1e-9 ? 'actual' : ''}"><td style="font-family:var(--fuente-interfaz)">${e.nombre}</td><td>${fmt(e.t, 5)}</td><td>${fmt(e.x, 5)}</td><td>${fmt(e.y, 5)}</td><td>${e.perdida != null ? fmt(e.perdida, 4) : '—'}</td></tr>`).join('');
    let filas = '<tr><th>t (s)</th><th>x (m)</th><th>y (m)</th><th>vₓ (m/s)</th><th>v_y (m/s)</th></tr>';
    for (let k = 0; k * 0.05 <= DUR + 1e-9; k++) {
      const tt = k * 0.05, s = estado(tt);
      filas += `<tr class="${Math.abs(tt - t) < 0.025 ? 'actual' : ''}"><td>${fmt(tt, 3)}</td><td>${fmt(s.x, 4)}</td><td>${fmt(s.y, 4)}</td><td>${fmt(s.vx, 4)}</td><td>${fmt(s.vy, 4)}</td></tr>`;
    }
    $('#t-datos').innerHTML = filas.replace('v_y', 'v<sub>y</sub>');
  }

  function todo() {
    dibujar(); lecturas(); lt.poner(t); graficas();
    if (!$('#p-eventos').hidden || !$('#p-tabla').hidden) tablas();
  }
  function recalcular() {
    simular();
    lt.eventos = SIM.eventos.filter(e => e.t > 0).map(e => ({ t: e.t, nombre: e.nombre }));
    todo();
    if (autoguardar) autoguardado.guardar('mecanica', escenaActual());
  }

  // ---------------------------------------------------------------------
  // Escena: guardar, abrir y autoguardado (formato .volta)
  // ---------------------------------------------------------------------
  let autoguardar = false;
  const ORIGINAL = Object.fromEntries(Object.entries(V).map(([k, d]) => [k, d.val]));
  function escenaActual() {
    return crearEscena({
      modulo: 'mecanica', espacio: 'proyectiles', titulo: 'Salto hacia una pendiente',
      datos: { variables: Object.fromEntries(Object.entries(V).map(([k, d]) => [k, d.val])), alfaGrados: alfa * 180 / Math.PI, masa: M },
    });
  }
  // Aplica variables y ángulo de una escena o de un paso del historial
  function aplicarDatos(d = {}) {
    const vars = d.variables || {};
    M = numero(d.masa, M, 1e-6, 1e6); $('#f-m').value = fmtPaso(M, 0.01);
    for (const [k, def] of Object.entries(V)) if (!def.constante) def.val = numero(vars[k], def.val, def.min, def.max);
    alfa = numero(d.alfaGrados, 0, -80, 80) * Math.PI / 180;
    t = 0; jugando = false;
    construirVariables(); recalcular();
  }
  function aplicarEscena(escena) {
    aplicarDatos(escena.datos);
    if (historial) historial.reiniciar(escenaActual().datos);
    botonesHistorial();
  }

  // ---------------------------------------------------------------------
  // Deshacer y rehacer: un paso por cambio de condiciones iniciales
  // ---------------------------------------------------------------------
  let historial = null;
  function botonesHistorial() {
    $('#b-deshacer').disabled = !historial?.puedeDeshacer;
    $('#b-rehacer').disabled = !historial?.puedeRehacer;
  }
  function registrar() { if (historial && historial.registrar(escenaActual().datos)) botonesHistorial(); }
  function deshacer() { const d = historial?.deshacer(); if (d) { aplicarDatos(d); botonesHistorial(); avisar(area, 'Cambio deshecho'); } }
  function rehacer() { const d = historial?.rehacer(); if (d) { aplicarDatos(d); botonesHistorial(); avisar(area, 'Cambio rehecho'); } }
  $('#b-deshacer').addEventListener('click', deshacer);
  $('#b-rehacer').addEventListener('click', rehacer);

  function restablecer() {
    for (const [k, v] of Object.entries(ORIGINAL)) V[k].val = v;
    M = 0.5; $('#f-m').value = fmtPaso(M, 0.01);
    alfa = 0; t = 0; jugando = false; construirVariables(); recalcular(); registrar();
    avisar(area, 'Escena original restablecida');
  }
  function guardar() {
    guardarEscena(escenaActual()).then(r => { if (r) avisar(area, 'Escena guardada'); }, e => avisar(area, `No se pudo guardar: ${e}`));
  }
  function abrir() {
    abrirEscena({ modulo: 'mecanica' }).then(e => { aplicarEscena(e); avisar(area, `Escena abierta: ${e.titulo}`); })
      .catch(err => avisar(area, err.message));
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
  $('#b-play').addEventListener('click', alternar);
  $('#b-reiniciar').addEventListener('click', () => { t = 0; jugando = false; todo(); });
  $('#b-atras').addEventListener('click', () => { jugando = false; t = Math.max(0, t - 1 / 60); todo(); });
  $('#b-adelante').addEventListener('click', () => { jugando = false; t = Math.min(DUR, t + 1 / 60); todo(); });
  $('#velocidades').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) velocidad = parseFloat(b.dataset.v); });
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.capa; capas[k] = !capas[k]; b.setAttribute('aria-pressed', String(capas[k])); dibujar();
  }));
  ['#m-v', '#m-c', '#m-a', '#m-p'].forEach(s => $(s).addEventListener('change', dibujar));
  $('#pest').addEventListener('click', () => setTimeout(todo, 0));

  // ---------------------------------------------------------------------
  // Lienzo: arrastre de la velocidad, zoom y desplazamiento
  // ---------------------------------------------------------------------
  function puntaVelocidad() {
    const s = estado(0), k = 0.2 * tz.vista.escala;
    let [bx, by] = tz.vista.P([s.x, s.y]);
    const m = Math.hypot(s.vx, s.vy), r = Volta.G.particula + 1;
    const ox = m > 0 ? s.vx / m * r : 0, oy = m > 0 ? -s.vy / m * r : 0;
    return [bx + ox + s.vx * k, by + oy - s.vy * k, bx + ox, by + oy, k];
  }
  lienzo.addEventListener('pointerdown', ev => {
    const r = lienzo.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    if (ev.button === 1 || ev.button === 2 || espacioPulsado) { paneo = [x, y, tz.vista.ox, tz.vista.oy]; lienzo.setPointerCapture(ev.pointerId); return; }
    if (t === 0) {
      const [px, py] = puntaVelocidad();
      if (Math.hypot(x - px, y - py) < 10) { arrastre = 'velocidad'; lienzo.setPointerCapture(ev.pointerId); dibujar(); return; }
    }
    paneo = [x, y, tz.vista.ox, tz.vista.oy]; lienzo.setPointerCapture(ev.pointerId);
  });
  lienzo.addEventListener('pointermove', ev => {
    const r = lienzo.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    cursorMundo = [tz.vista.mx(x), tz.vista.my(y)];
    $('#cx').textContent = cantidad(cursorMundo[0], 'm', 4); $('#cy').textContent = cantidad(cursorMundo[1], 'm', 4);
    if (arrastre === 'velocidad') {
      const [, , bx, by, k] = puntaVelocidad();
      let vx = (x - bx) / k, vy = (by - y) / k;
      let ang = Math.atan2(vy, vx);
      ang = Math.max(-80, Math.min(80, Math.round(ang * 180 / Math.PI / (ev.shiftKey ? 1 : 5)) * (ev.shiftKey ? 1 : 5))) * Math.PI / 180;
      const mod = Math.min(V.v0.max, Math.round(Math.hypot(vx, vy) / 0.05) * 0.05);
      alfa = ang; V.v0.val = mod;
      const d = document.querySelectorAll('#variables input')[2]; d.value = mod; d.dispatchEvent(new Event('input'));
      return;
    }
    if (paneo) { vistaTocada = true; tz.vista.ox = paneo[2] + x - paneo[0]; tz.vista.oy = paneo[3] + y - paneo[1]; dibujar(); return; }
    if (t === 0) { const [px, py] = puntaVelocidad(); lienzo.style.cursor = Math.hypot(x - px, y - py) < 10 ? 'grab' : 'default'; }
  });
  lienzo.addEventListener('pointerup', () => { if (arrastre === 'velocidad') registrar(); arrastre = null; paneo = null; dibujar(); });
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
  $('#b-zoom-mas').addEventListener('click', () => zoomCentro(1.25));
  $('#b-zoom-menos').addEventListener('click', () => zoomCentro(0.8));
  $('#b-encuadrar').addEventListener('click', () => { vistaTocada = false; encuadrar(); zoomTexto(); dibujar(); });

  // ---------------------------------------------------------------------
  // Exportar: datos (CSV con toda la precisión) e imagen del lienzo
  // ---------------------------------------------------------------------
  const TITULO = 'Salto hacia una pendiente';
  function exportarCSV() {
    const filas = muestrear(0, DUR, 0.01, tt => {
      const s = estado(tt), { K, U } = energia(s);
      return [tt, s.x, s.y, s.vx, s.vy, Math.hypot(s.vx, s.vy), K, U, K + U, s.fase];
    });
    const csv = aCSV(['t (s)', 'x (m)', 'y (m)', 'vx (m/s)', 'vy (m/s)', '|v| (m/s)', 'Ek (J)', 'Ug (J)', 'E (J)', 'fase'], filas);
    descargarTexto(`${nombreArchivo(TITULO)}-datos.csv`, csv)
      .then(r => { if (r) avisar(area, `Datos exportados: ${filas.length} filas`); }, e => avisar(area, `No se pudo exportar: ${e}`));
  }
  function exportarPNG() {
    descargarLienzo(lienzo, `${nombreArchivo(TITULO)}-t${fmt(t, 3)}s.png`)
      .then(r => { if (r) avisar(area, 'Imagen del lienzo exportada'); });
  }
  $('#b-exportar').addEventListener('click', exportarCSV);

  // ---------------------------------------------------------------------
  // Teclado y paleta de comandos
  // ---------------------------------------------------------------------
  let espacioPulsado = false;
  const COMANDOS = [
    ['i-reproducir', 'Reproducir o pausar', 'Espacio', alternar],
    ['i-guardar', 'Guardar escena', 'Ctrl S', () => guardar()],
    ['i-carpeta', 'Abrir escena', 'Ctrl O', () => abrir()],
    ['i-historial', 'Restablecer la escena original', '', () => restablecer()],
    ['i-reiniciar', 'Reiniciar la simulación', 'Inicio', () => { t = 0; jugando = false; todo(); }],
    ['i-encuadrar', 'Encuadrar todo', 'F', () => { encuadrar(); zoomTexto(); dibujar(); }],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['o-particula', 'Añadir partícula', 'P', () => {}],
    ['o-plano-inclinado', 'Añadir plano inclinado', '', () => {}],
    ['n-regla', 'Colocar regla', 'R', () => {}],
    ['i-exportar', 'Exportar datos a CSV', '', () => exportarCSV()],
    ['i-imagen', 'Exportar imagen del lienzo', '', () => exportarPNG()],
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
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); abrirComandos(); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); guardar(); return; }
    if ((ev.ctrlKey || ev.metaKey) && !ev.target.matches('input, textarea') && (ev.key.toLowerCase() === 'y' || (ev.shiftKey && ev.key.toLowerCase() === 'z'))) { ev.preventDefault(); rehacer(); return; }
    if ((ev.ctrlKey || ev.metaKey) && !ev.target.matches('input, textarea') && ev.key.toLowerCase() === 'z') { ev.preventDefault(); deshacer(); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'o') { ev.preventDefault(); abrir(); return; }
    if (ev.target.matches('input, textarea')) return;
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) alternar(); espacioPulsado = true; }
    else if (ev.key === 'ArrowRight') { jugando = false; t = Math.min(DUR, t + 1 / 60); todo(); }
    else if (ev.key === 'ArrowLeft') { jugando = false; t = Math.max(0, t - 1 / 60); todo(); }
    else if (ev.key === 'Home') { t = 0; jugando = false; todo(); }
    else if (ev.key.toLowerCase() === 'f') { encuadrar(); zoomTexto(); dibujar(); }
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });

  // ---------------------------------------------------------------------
  // Arranque
  // ---------------------------------------------------------------------
  function redimensionar() { tz.ajustar(); if (!encuadreHecho) { encuadrar(); escala0 = tz.vista.escala; } todo(); }
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); if (!vistaTocada) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search);
    // El autoguardado se restaura al abrir normalmente, no en capturas ni enlaces con ?t
    const limpio = !q.has('t') && !q.has('captura');
    const guardada = escenaPendiente('mecanica') || (limpio ? autoguardado.leer('mecanica', { modulo: 'mecanica' }) : null);
    if (guardada) {
      const d = guardada.datos || {}, vars = d.variables || {};
      for (const [k, def] of Object.entries(V)) if (!def.constante) def.val = numero(vars[k], def.val, def.min, def.max);
      alfa = numero(d.alfaGrados, 0, -80, 80) * Math.PI / 180;
      M = numero(d.masa, M, 1e-6, 1e6); $('#f-m').value = fmtPaso(M, 0.01);
    }
    autoguardar = limpio;
    simular(); construirVariables();
    if (q.has('t')) t = Math.max(0, Math.min(DUR, parseFloat(q.get('t'))));
    tz.ajustar(); encuadrar(); escala0 = tz.vista.escala;
    recalcular(); zoomTexto();
    historial = new Historial(escenaActual().datos); botonesHistorial();
    requestAnimationFrame(a => { ultimo = a; requestAnimationFrame(cuadro); });
  });
})();
