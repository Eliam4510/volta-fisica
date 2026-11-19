/* ==========================================================================
   Volta · guía viva del lenguaje de diseño
   Usa las piezas reales del sistema: tokens (tokens.json y CSS calculado),
   componentes.css, espacio.js, Volta.Trazo, Volta.grafica y
   Volta.LineaTiempo. No inventa reglas: lo que el sistema aún no resuelve
   se muestra como pendiente.
   ========================================================================== */
(function () {
  'use strict';
  const V = window.Volta;
  const { Trazo, fmt, cantidad, rombo, G, ESP } = V;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const raiz = document.documentElement;
  const icono = (id, clase = 'ico') => `<svg class="${clase}"><use href="#${id}"/></svg>`;

  // =====================================================================
  // 0. Iconos provisionales
  //    Solo se inyectan los que el sprite (../iconos/sprite.js) no trae.
  //    Siguen las reglas de la sección 6: rejilla 20 × 20, trazo 1.5.
  // =====================================================================
  const PROVISIONALES = {
    'i-chevron-abajo': '<path d="M6 8l4 4 4-4"/>',
    'i-chevron-derecha': '<path d="M8 6l4 4-4 4"/>',
    'i-mas': '<path d="M10 4v12M4 10h12"/>',
    'i-cerrar': '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>',
    'i-check': '<path d="M4.5 10.5L8 14l7.5-8"/>',
    'i-reproducir': '<path d="M6.5 4.5v11l9-5.5z"/>',
    'i-pausar': '<path d="M7 5v10M13 5v10"/>',
    'i-paso-adelante': '<path d="M5 5v10l7-5zM15 5v10"/>',
    'i-paso-atras': '<path d="M15 5v10L8 10zM5 5v10"/>',
    'i-reiniciar': '<path d="M4.5 10a5.5 5.5 0 1 0 1.6-3.9"/><path d="M6.1 2.6v3.5h3.5"/>',
    'i-buscar': '<circle cx="9" cy="9" r="5"/><path d="M12.5 12.5L16 16"/>',
    'i-ojo': '<path d="M2.5 10a8.5 8.5 0 0 1 15 0a8.5 8.5 0 0 1-15 0z"/><circle cx="10" cy="10" r="2.25"/>',
    'i-ojo-tachado': '<path d="M2.5 10a8.5 8.5 0 0 1 15 0a8.5 8.5 0 0 1-15 0z"/><circle cx="10" cy="10" r="2.25"/><path d="M4 16L16 4"/>',
    'i-candado': '<rect x="5" y="9" width="10" height="7.5" rx="1.5"/><path d="M7 9V7a3 3 0 0 1 6 0v2"/>',
    'i-candado-abierto': '<rect x="5" y="9" width="10" height="7.5" rx="1.5"/><path d="M7 9V7a3 3 0 0 1 5.8-1"/>',
    'i-tema-oscuro': '<path d="M16 12.5A6.5 6.5 0 1 1 7.5 4a5 5 0 0 0 8.5 8.5z"/>',
    'i-tema-claro': '<circle cx="10" cy="10" r="3.25"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>',
    'i-exportar': '<path d="M10 3.5V12M6.5 7L10 3.5 13.5 7M4 12.5V16h12v-3.5"/>',
    'i-duplicar': '<rect x="7" y="7" width="9" height="9" rx="1.5"/><path d="M13 4.5H5.5a1 1 0 0 0-1 1V13"/>',
    'i-borrar': '<path d="M3.5 6h13M8 6V4h4v2M5.5 6l.8 10.5h7.4L14.5 6"/>',
    'i-aviso': '<path d="M10 3.5l7 12.5H3z"/><path d="M10 8.5v3.5"/><circle cx="10" cy="14" r=".9" fill="currentColor" stroke="none"/>',
    'i-error': '<circle cx="10" cy="10" r="7"/><path d="M7.5 7.5l5 5M12.5 7.5l-5 5"/>',
    'i-capas': '<path d="M10 3.5l7 3.5-7 3.5L3 7z"/><path d="M3 10.5l7 3.5 7-3.5"/>',
    'i-grafica': '<path d="M3.5 3.5v13h13"/><path d="M6 13l3.5-4.5 3 2.5 4-6"/>',
    'i-encuadrar': '<path d="M3.5 7.5v-4h4M12.5 3.5h4v4M16.5 12.5v4h-4M7.5 16.5h-4v-4"/>',
    'i-zoom-mas': '<circle cx="9" cy="9" r="5"/><path d="M12.5 12.5L16 16M7 9h4M9 7v4"/>',
    'i-zoom-menos': '<circle cx="9" cy="9" r="5"/><path d="M12.5 12.5L16 16M7 9h4"/>',
    'i-deshacer': '<path d="M7 5L3.5 8.5 7 12"/><path d="M3.5 8.5H12a4 4 0 0 1 0 8H9"/>',
    'i-cuadricula': '<rect x="3.5" y="3.5" width="13" height="13" rx="1"/><path d="M8 3.5v13M12 3.5v13M3.5 8h13M3.5 12h13"/>',
    'i-ajuste-iman': '<path d="M5.5 3.5V10a4.5 4.5 0 0 0 9 0V3.5"/><path d="M8.5 3.5V10a1.5 1.5 0 0 0 3 0V3.5"/><path d="M5.5 6.5h3M11.5 6.5h3"/>',
    'i-imagen': '<rect x="3" y="4" width="14" height="12" rx="1.5"/><path d="M3.5 14l4-4 3 3 2-2 4 4"/>',
    'i-video': '<rect x="2.5" y="5" width="11" height="10" rx="1.5"/><path d="M13.5 9l4-2.5v7l-4-2.5"/>',
    'i-tabla': '<rect x="3" y="4" width="14" height="12" rx="1.5"/><path d="M3 8h14M3 12h14M8 8v8"/>',
    'i-tutorial': '<path d="M3 7l7-3.5L17 7l-7 3.5z"/><path d="M6 8.5V13c2 2 6 2 8 0V8.5"/>',
    'i-ejemplo': '<rect x="4" y="3.5" width="12" height="13" rx="1.5"/><path d="M7 7.5h6M7 10.5h6M7 13.5h3"/>',
    'i-mext': '<circle cx="10" cy="8" r="4.5"/><path d="M7.5 12l-1 5 3.5-2 3.5 2-1-5"/>',
    'i-escena': '<rect x="3" y="4" width="14" height="12" rx="1.5"/><path d="M5.5 13.5h9"/><circle cx="12.5" cy="8.5" r="2" fill="currentColor" stroke="none"/>',
    'o-particula': '<circle cx="10" cy="10" r="3" fill="currentColor" stroke="none"/>',
    'o-bloque': '<rect x="5" y="6" width="10" height="9"/><path d="M2.5 15h15"/>',
    'o-suelo': '<path d="M2.5 9h15"/><path d="M7 9l-3 3M11 9l-3 3M15 9l-3 3"/>',
    'o-pared': '<path d="M9 3v14"/><path d="M9 6l-3 3M9 10l-3 3M9 14l-3 3"/>',
    'o-resorte': '<path d="M2 10h2.5l1.25-3.5 2.25 7 2.25-7 2.25 7 1.25-3.5H18"/>',
    'o-plano-inclinado': '<path d="M3 15.5h14V6.5z"/>',
    'o-gravedad': '<path d="M10 3.5V16M6.5 12.5L10 16l3.5-3.5"/>',
    'o-carga-positiva': '<circle cx="10" cy="10" r="6.5"/><path d="M10 7v6M7 10h6"/>',
    'm-mecanica': '<path d="M5 31h30"/><path d="M10 31l-3.5 3.5M17 31l-3.5 3.5M24 31l-3.5 3.5M31 31l-3.5 3.5"/><path d="M9 12a22 22 0 0 1 22 19" stroke-dasharray="3 3"/><circle cx="9" cy="12" r="3" fill="currentColor" stroke="none"/>',
    'm-electrostatica': '<circle cx="20" cy="20" r="6.5"/><path d="M20 16.5v7M16.5 20h7"/><path d="M20 9.5V5M20 35v-4.5M9.5 20H5M35 20h-4.5M12.5 12.5L9.5 9.5M27.5 27.5l3 3M12.5 27.5l-3 3M27.5 12.5l3-3"/>',
    'm-ondas': '<path d="M4 20a4 4 0 0 1 8 0a4 4 0 0 0 8 0a4 4 0 0 1 8 0a4 4 0 0 0 8 0"/>',
  };
  let iconosProvisionales = 0;
  function asegurarIconos() {
    const faltan = Object.keys(PROVISIONALES).filter(id => !document.getElementById(id));
    if (!faltan.length) return;
    iconosProvisionales += faltan.length;
    const simbolos = faltan.map(id => {
      const em = id.startsWith('m-'), lado = em ? 40 : 20;
      return `<symbol id="${id}" viewBox="0 0 ${lado} ${lado}" fill="none" stroke="currentColor" stroke-width="${em ? 1.75 : 1.5}" stroke-linecap="round" stroke-linejoin="round">${PROVISIONALES[id]}</symbol>`;
    }).join('');
    document.body.insertAdjacentHTML('beforeend', `<svg aria-hidden="true" data-iconos-provisionales style="position:absolute;width:0;height:0;overflow:hidden">${simbolos}</svg>`);
  }

  // =====================================================================
  // 1. Tokens de los dos temas
  // =====================================================================
  let TOK = null;
  const TK = {};
  async function cargarTokens() {
    try { const r = await fetch('../tokens/tokens.json', { cache: 'no-cache' }); if (r.ok) TOK = await r.json(); } catch { /* sin servidor */ }
    if (TOK) { TK.claro = tokensDe('claro'); TK.oscuro = tokensDe('oscuro'); }
  }
  // Mismo formato que Volta.leerTokens(), para pasarlo a un Trazo
  function tokensDe(tema) {
    const t = { ...TOK.color[tema] };
    t['mapa-divergente-negativo'] = TOK.mapas['divergente-negativo'];
    t['mapa-divergente-positivo'] = TOK.mapas['divergente-positivo'];
    t.f = { ...TOK.fisica[tema] }; t.tinte = {};
    for (const k in t.f) { const [r, g, b] = rgb(t.f[k]); t.tinte[k] = `rgb(${r} ${g} ${b} / ${TOK.fisica.tinte})`; }
    return t;
  }

  // =====================================================================
  // 2. Color: contraste WCAG y mezcla perceptual en OKLab
  // =====================================================================
  function rgb(hex) { const h = hex.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const gam = v => { v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.round(Math.max(0, Math.min(1, v)) * 255); };
  function luminancia(hex) { const [r, g, b] = rgb(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
  function contraste(a, b) { const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); }
  function aOklab(hex) {
    const [r, g, b] = rgb(hex).map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function deOklab([L, A, B]) {
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s].map(gam);
  }
  function mezcla(h1, h2, t) { const a = aOklab(h1), b = aOklab(h2); return deOklab(a.map((v, i) => v + (b[i] - v) * t)); }
  const css = ([r, g, b]) => `rgb(${r} ${g} ${b})`;
  const razon = c => (Math.round(c * 10) / 10).toFixed(1) + ':1';

  // Color aproximado de una longitud de onda visible (380–750 nm)
  function longitudOnda(nm) {
    let r = 0, g = 0, b = 0;
    if (nm < 440) { r = -(nm - 440) / 60; b = 1; } else if (nm < 490) { g = (nm - 440) / 50; b = 1; } else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; } else if (nm < 645) { r = 1; g = -(nm - 645) / 65; } else { r = 1; }
    const f = nm < 420 ? 0.3 + 0.7 * (nm - 380) / 40 : nm > 700 ? 0.3 + 0.7 * (750 - nm) / 50 : 1;
    const c = v => Math.round(255 * Math.pow(v * f, 0.8));
    return `rgb(${c(r)} ${c(g)} ${c(b)})`;
  }

  // =====================================================================
  // 3. Registro de lienzos: se repintan al cambiar el tema o el tamaño
  // =====================================================================
  const LIENZOS = [];
  function lienzo(el, dibujar, o = {}) {
    if (typeof el === 'string') el = $(el);
    if (!el) return null;
    const it = { el, tz: new Trazo(el), dibujar, tema: o.tema || null };
    LIENZOS.push(it); return it;
  }
  function pintar(it) {
    if (!it) return;
    const tz = it.tz; tz.ajustar();
    if (!tz.w || !tz.h) return;
    if (it.tema && TK[it.tema]) tz.t = TK[it.tema];
    tz.ctx.save(); tz.limpiar();
    try { it.dibujar(tz); } catch (e) { console.error('Lienzo de la guía:', e); }
    tz.ctx.restore();
  }
  const pintarTodo = () => LIENZOS.forEach(pintar);

  // Vista en píxeles de pantalla: W(x, y) da el punto de mundo que cae en (x, y)
  function pantalla(tz) { tz.vista.escala = 1; tz.vista.ox = 0; tz.vista.oy = 0; }
  const W = (x, y) => [x, -y];
  function encuadre(tz, caja, margen = 24) { tz.vista.encuadrar(caja, { x: 0, y: 0, w: tz.w, h: tz.h }, margen); }
  // Suelo de lado a lado del lienzo a la altura y (mundo)
  const suelo = (tz, y = 0) => tz.superficie([[tz.vista.mx(-20), y], [tz.vista.mx(tz.w + 20), y]]);
  function rect(x0, y0, w, h) { return [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]]; }
  function caja(tz, x, y, w, h, relleno, borde, radio = 0) {
    const c = tz.ctx; c.save(); c.setLineDash([]); c.beginPath(); c.roundRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1), radio);
    if (relleno) { c.fillStyle = tz.color(relleno); c.fill(); }
    if (borde) { c.strokeStyle = tz.color(borde); c.lineWidth = 1; c.stroke(); }
    c.restore();
  }
  // Símbolo de campo perpendicular al plano: ⊙ saliente, ⊗ entrante
  function campoPerp(tz, x, y, saliente, familia = 'magnetico') {
    const c = tz.ctx, col = tz.color(familia); c.save(); c.setLineDash([]); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1;
    c.beginPath(); c.arc(x, y, 4.5, 0, 2 * Math.PI); c.stroke();
    if (saliente) { c.beginPath(); c.arc(x, y, 1.3, 0, 2 * Math.PI); c.fill(); }
    else { c.beginPath(); c.moveTo(x - 2.8, y - 2.8); c.lineTo(x + 2.8, y + 2.8); c.moveTo(x + 2.8, y - 2.8); c.lineTo(x - 2.8, y + 2.8); c.stroke(); }
    c.restore();
  }
  function rayo(tz, x1, y1, x2, y2, color) {
    tz.lineaPx([[x1, y1], [x2, y2]], { color, grosor: 1.5 });
    const L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    tz.flechaPx(mx - ux * 6, my - uy * 6, mx + ux * 4, my + uy * 4, { color, grosor: 1.5 });
  }
  // Un vector aplicado a un cuerpo nace en su borde (sección 7.2): radios de partícula y carga
  const RP = G.particula + 1, RC = G.carga + 1;
  const sim = (t, tam = 13, color) => ({ t, f: 'sim', tam, color });
  const sub = (t, tam = 9, color, recto) => ({ t, f: recto ? 'simRecta' : 'sim', tam, dy: 3, color });
  const num = (t, tam = 11.5, color) => ({ t, f: 'num', tam, color });
  const ui = (t, tam = 11.5, color) => ({ t, f: 'ui', tam, color });
  const nota = (tz, s, x, y, o = {}) => tz.texto(s, x, y, { fuente: 'ui', tam: 11, color: 'texto-3', halo: true, ...o });

  // Proyectil auxiliar para varias demostraciones
  const proyectil = (p0, v0, g = 9.8) => t => [p0[0] + v0[0] * t, p0[1] + v0[1] * t - g * t * t / 2];
  const muestras = (f, a, b, n = 80) => Array.from({ length: n + 1 }, (_, i) => f(a + (b - a) * i / n));

  // =====================================================================
  // 4. Portada y principios
  // =====================================================================
  function dibujarPortada(tz) {
    const g = 9.8, h = 1.2, tc = Math.sqrt(2 * h / g), vx = 2.1 / tc, vr = g * tc, T = 2 * tc, ahora = 0.79 * T;
    const pos = t => t <= tc ? [-2.1 + vx * t, h - g * t * t / 2] : [-2.1 + vx * t, vr * (t - tc) - g * (t - tc) ** 2 / 2];
    const vel = t => t <= tc ? [vx, -g * t] : [vx, vr - g * (t - tc)];
    encuadre(tz, { x0: -3.2, x1: 3.2, y0: -0.28, y1: 1.5 }, 26);
    tz.cuadricula();
    suelo(tz);
    tz.cota([-2.6, 0], [-2.6, h], { texto: 'h', desplazamiento: 0 });
    tz.trayectoria(muestras(pos, 0, T, 240), 'prevista');
    tz.trayectoria(muestras(pos, 0, ahora, 240), 'real');
    for (let k = 0; k * 0.1 < ahora - 0.03; k++) tz.fantasma(pos(k * 0.1));
    const [ex, ey] = tz.eventoAnillo([0, 0]);
    tz.ficha(ex - 178, ey - 66, [
      [ui('Choque'), num(' · ', 11.5, 'texto-3'), sim('t'), num(' = ' + cantidad(tc, 's'))],
      [sim('e'), num(' = 1.000 · elástico', 11.5)],
    ], { ancla: [ex - 6, ey - 4] });
    const p = pos(ahora), v = vel(ahora);
    tz.vector(p, [0, -g], { desdeRadio: RP, familia: 'cambio', escalaPx: 4.2, simbolo: 'g' });
    tz.vector(p, v, { desdeRadio: RP, familia: 'movimiento', escalaPx: 20, simbolo: 'v', valor: Math.hypot(v[0], v[1]), unidad: 'm/s', componentes: true, subX: true, subY: true });
    tz.particula(p, { etiqueta: 'Bola' });
    tz.barraEscala(18, tz.h - 18);
  }

  function dibujarP1(tz) {
    encuadre(tz, { x0: -0.3, x1: 2.9, y0: -0.12, y1: 1.45 }, 18);
    tz.cuadricula(); suelo(tz);
    const f = proyectil([0, 0.35], [1.9, 3.6]), t = 0.2, tf = (3.6 + Math.sqrt(3.6 ** 2 + 2 * 9.8 * 0.35)) / 9.8;
    tz.trayectoria(muestras(f, t, tf), 'prevista'); tz.trayectoria(muestras(f, 0, t), 'real');
    const p = f(t), k = tz.vista.escala;
    tz.vector(p, [0, -9.8], { desdeRadio: RP, familia: 'cambio', escalaPx: 0.05 * k, simbolo: 'g' });
    tz.vector(p, [1.9, 3.6 - 9.8 * t], { desdeRadio: RP, familia: 'movimiento', escalaPx: 0.22 * k, simbolo: 'v' });
    tz.particula(p);
  }

  function dibujarP2(tz) {
    encuadre(tz, { x0: -0.5, x1: 4.4, y0: -0.15, y1: 1.75 }, 18);
    suelo(tz);
    const f = proyectil([0, 1.1], [2.2, 1.2]), t = 0.42, p = f(t);
    tz.superficie([[-0.7, 1.1], [0, 1.1], [0, 0]]);
    tz.trayectoria(muestras(f, 0, t), 'real');
    tz.trayectoria(muestras(f, t, (1.2 + Math.sqrt(1.44 + 4 * 4.9 * 1.1)) / 9.8), 'prevista');
    const [px, py] = tz.vista.P(p), [, y0] = tz.vista.P([0, 0]);
    tz.lineaPx([[px, py], [px, y0]], { color: 'texto-3', grosor: G.auxiliar, patron: 'auxiliar' });
    tz.cota([0, 0], [p[0], 0], { texto: [sim('x', 14)], desplazamiento: -16 });
    tz.particula(p);
    const x0 = tz.w - 168;
    [['continuo', 'real', {}], ['discontinuo', 'previsto', { color: 'texto-3', patron: 'previsto', extremo: 'butt' }], ['punteado', 'auxiliar', { color: 'texto-3', grosor: 1, patron: 'auxiliar' }]].forEach(([a, b, o], i) => {
      const y = 22 + i * 18;
      tz.lineaPx([[x0, y - 4], [x0 + 28, y - 4]], { color: 'texto-2', grosor: 1.5, ...o });
      tz.compuesto([ui(a, 11, 'texto-2'), ui(' · ' + b, 11, 'texto-3')], x0 + 36, y);
    });
  }

  function dibujarP4(tz) {
    pantalla(tz);
    const w = tz.w, h = tz.h, m = 18, X = m, Y = m, AW = w - 2 * m, AH = h - 2 * m;
    const iz = 90, de = 112, ba = 18, inf = 46;
    caja(tz, X, Y, AW, AH, 'fondo', 'linea-suave', 6);
    caja(tz, X, Y, AW, ba, 'panel', 'linea-suave');
    caja(tz, X, Y + ba, iz, AH - ba, 'panel', 'linea-suave');
    caja(tz, X + AW - de, Y + ba, de, AH - ba, 'panel', 'linea-suave');
    caja(tz, X + iz, Y + AH - inf, AW - iz - de, inf, 'panel', 'linea-suave');
    const barra = (x, y, l, col = 'linea') => caja(tz, x, y, l, 4, col, null, 2);
    [0, 1, 2, 3, 4, 5].forEach(i => { barra(X + 10, Y + ba + 14 + i * 14, 40 + (i % 3) * 14); barra(X + AW - de + 10, Y + ba + 14 + i * 14, 50 + (i % 2) * 30); });
    barra(X + 8, Y + 7, 26, 'linea-fuerte'); barra(X + AW / 2 - 20, Y + 7, 40);
    barra(X + iz + 12, Y + AH - inf + 14, AW - iz - de - 24, 'campo-activo');
    // Lienzo: el mayor contraste de la pantalla
    const L = { x: X + iz, y: Y + ba, w: AW - iz - de, h: AH - ba - inf };
    caja(tz, L.x, L.y, L.w, L.h, 'lienzo', null);
    const c = tz.ctx; c.save(); c.beginPath(); c.rect(L.x, L.y, L.w, L.h); c.clip();
    tz.vista.encuadrar({ x0: -0.4, x1: 3.4, y0: -0.15, y1: 1.4 }, L, 10);
    tz.superficie([[-1, 0], [5, 0]]);
    const f = proyectil([0, 1.0], [2.6, 1.0]);
    tz.trayectoria(muestras(f, 0.25, (1 + Math.sqrt(1 + 19.6)) / 9.8), 'prevista'); tz.trayectoria(muestras(f, 0, 0.25), 'real');
    tz.vector(f(0.25), [2.6, 1.0 - 9.8 * 0.25], { desdeRadio: RP, familia: 'movimiento', escalaPx: 0.28 * tz.vista.escala, simbolo: 'v' });
    tz.particula(f(0.25));
    c.restore();
  }

  function dibujarP5(tz, cual) {
    encuadre(tz, { x0: -1.6, x1: 1.6, y0: -0.75, y1: 0.95 }, 12);
    const k = tz.vista.escala;
    if (cual === 'a') {
      suelo(tz, -0.25);
      tz.cuerpo(rect(-0.75, -0.25, 0.6, 0.5), { centroMasa: [-0.45, 0] });
      tz.vector([-0.15, 0], [1, 0], { familia: 'interaccion', escalaPx: 0.85 * k, simbolo: 'F' });
    } else if (cual === 'b') {
      tz.carga([-0.75, 0], 1); tz.carga([0.95, 0], -1);
      tz.vector([-0.75, 0], [1, 0], { desdeRadio: RC, familia: 'interaccion', escalaPx: 0.75 * k, simbolo: 'F' });
    } else {
      // Rejilla de ⊙ cada 32 px; se deja libre el paso de los vectores y sus etiquetas
      const [qx, qy] = tz.vista.P([-0.4, -0.25]), libre = (x, y) => (Math.abs(y - qy) < 13 && x > qx - 14 && x < qx + 0.75 * k + 30) || (Math.abs(x - qx) < 13 && y < qy + 14 && y > qy - 0.75 * k - 30);
      for (let x = qx % 32 + 16; x < tz.w; x += 32) for (let y = qy % 32 + 16; y < tz.h; y += 32) if (!libre(x, y)) campoPerp(tz, x, y, true);
      tz.vector([-0.4, -0.25], [1, 0], { desdeRadio: 8, familia: 'movimiento', escalaPx: 0.75 * k, simbolo: 'v' });
      tz.vector([-0.4, -0.25], [0, 1], { desdeRadio: 8, familia: 'interaccion', escalaPx: 0.75 * k, simbolo: 'F' });
      tz.carga([-0.4, -0.25], 1, { radio: 7 });
    }
  }

  // =====================================================================
  // 5. Marca: símbolo real (marca/simbolo.svg) y rejilla de construcción
  // =====================================================================
  async function inyectarSimbolo() {
    let svg = null;
    try { const r = await fetch('../marca/simbolo.svg'); if (r.ok) svg = (await r.text()).replace(/<!--[\s\S]*?-->/g, ''); } catch { /* sin servidor */ }
    $$('[data-simbolo]').forEach(el => { el.innerHTML = svg || '<img src="../marca/simbolo.svg" alt="" width="22" height="22">'; });
    const rej = $('#g-construccion-rejilla');
    if (rej) {
      let s = '<rect x="0" y="0" width="32" height="32" style="fill:none;stroke:var(--linea)" stroke-width=".06"/>';
      for (let i = 1; i < 32; i++) s += `<path d="M${i} 0V32M0 ${i}H32" style="stroke:var(${i % 4 ? '--cuadricula-menor' : '--cuadricula-mayor'})" stroke-width=".05"/>`;
      s += '<path d="M16 0V32M0 23H32" style="stroke:var(--texto-4)" stroke-width=".06" stroke-dasharray=".5 .35"/>';
      s += '<circle cx="26" cy="6.5" r="4" style="fill:none;stroke:var(--texto-4)" stroke-width=".06" stroke-dasharray=".4 .3"/>';
      rej.innerHTML = s;
    }
  }

  // =====================================================================
  // 6. Color: neutros, paleta física, estados y mapas
  // =====================================================================
  const USO_NEUTRO = {
    lienzo: 'Fondo del lienzo de simulación', fondo: 'Fondo de la aplicación', panel: 'Paneles', campo: 'Campos, botones secundarios',
    'campo-hover': 'Hover', 'campo-activo': 'Presionado, riel de deslizador', 'linea-suave': 'Divisores', linea: 'Bordes de controles',
    'linea-fuerte': 'Bordes enfatizados', 'texto-4': 'Deshabilitado', 'texto-3': 'Terciario, ejes', 'texto-2': 'Secundario', texto: 'Principal',
    tinta: 'Sólidos (botón primario, materia)', 'sobre-tinta': 'Texto sobre --tinta',
  };
  const USO_LIENZO = { 'cuadricula-menor': 'Líneas menores de la cuadrícula', 'cuadricula-mayor': 'Líneas mayores de la cuadrícula', eje: 'Ejes del lienzo y cero de las gráficas' };
  // Familias físicas: token, nombre y significado (sección 3.2 del contrato)
  const FAMILIAS = [
    ['movimiento', 'Movimiento', 'Velocidad, energía cinética y rapidez de las ondas.'],
    ['cambio', 'Cambio', 'Aceleración, gravedad g y energía potencial gravitatoria.'],
    ['interaccion', 'Interacción', 'Toda fuerza: peso, normal, tensión, fricción, eléctrica y magnética.'],
    ['inercia', 'Inercia', 'Momento lineal, impulso y momento angular.'],
    ['electrico', 'Eléctrico', 'Campo E, potencial V, equipotenciales y energía elástica y eléctrica almacenada.'],
    ['magnetico', 'Magnético', 'Campo B, flujo y energía magnética.'],
    ['corriente', 'Corriente', 'Corriente eléctrica, flujo de carga y fem.'],
    ['termico', 'Térmico', 'Calor, flujo de calor, temperatura y energía disipada por fricción o efecto Joule.'],
  ];
  const pastillas = k => `<span class="g-pastillas"><i class="g-pastilla" style="background:${TOK.color.claro[k]}"></i><i class="g-pastilla" style="background:${TOK.color.oscuro[k]}"></i></span>`;

  function construirColor() {
    if (!TOK) { $('#g-neutros').innerHTML = '<tr><td>No se pudo leer tokens/tokens.json: abre la guía desde el servidor del proyecto.</td></tr>'; return; }
    const orden = Object.keys(USO_NEUTRO);
    $('#g-rampas').innerHTML = ['claro', 'oscuro'].map(tema =>
      `<span>${tema === 'claro' ? 'Claro' : 'Oscuro'}</span><div class="g-rampa">${orden.filter(k => k !== 'sobre-tinta').map(k => `<i style="background:${TOK.color[tema][k]}" title="--${k} · ${TOK.color[tema][k]}"></i>`).join('')}</div>`).join('');
    const contr = k => {
      const base = k === 'sobre-tinta' ? 'tinta' : 'panel';
      if (!/^texto|tinta/.test(k)) return '<span class="tenue">—</span>';
      return ['claro', 'oscuro'].map(t => razon(contraste(TOK.color[t][k], TOK.color[t][base]))).join(' · ');
    };
    const cab = '<thead><tr><th>Muestra</th><th>Token</th><th>Uso</th><th>Claro</th><th>Oscuro</th><th class="der">Contraste</th></tr></thead>';
    $('#g-neutros').innerHTML = cab + '<tbody>' + orden.map(k =>
      `<tr><td>${pastillas(k)}</td><td><code>--${k}</code></td><td>${USO_NEUTRO[k]}</td><td class="mono">${TOK.color.claro[k]}</td><td class="mono">${TOK.color.oscuro[k]}</td><td class="der mono">${contr(k)}</td></tr>`).join('') + '</tbody>';
    $('#g-neutros-lienzo').innerHTML = '<thead><tr><th>Muestra</th><th>Token</th><th>Uso</th><th>Claro</th><th>Oscuro</th></tr></thead><tbody>' + Object.keys(USO_LIENZO).map(k =>
      `<tr><td>${pastillas(k)}</td><td><code>--${k}</code></td><td>${USO_LIENZO[k]}</td><td class="mono">${TOK.color.claro[k]}</td><td class="mono">${TOK.color.oscuro[k]}</td></tr>`).join('') + '</tbody>';
    $('#g-estados-color').innerHTML = '<thead><tr><th>Muestra</th><th>Token</th><th>Claro</th><th>Oscuro</th><th class="der">Contraste</th></tr></thead><tbody>' + [['error', 'Error'], ['aviso', 'Aviso']].map(([k]) =>
      `<tr><td>${pastillas(k)}</td><td><code>--${k}</code></td><td class="mono">${TOK.color.claro[k]}</td><td class="mono">${TOK.color.oscuro[k]}</td><td class="der mono">${['claro', 'oscuro'].map(t => razon(contraste(TOK.color[t][k], TOK.color[t].panel))).join(' · ')}</td></tr>`).join('') + '</tbody>';

    // Paleta física
    const cont = $('#g-familias');
    cont.innerHTML = FAMILIAS.map(([k, nombre, significa]) => {
      const fila = tema => {
        const hex = TOK.fisica[tema][k], lz = TOK.color[tema].lienzo, c = contraste(hex, lz), tinte = TK[tema].tinte[k];
        return `<span>${tema === 'claro' ? 'Claro' : 'Oscuro'}</span><span class="mono"><i class="g-tinte" style="background:linear-gradient(${tinte}, ${tinte}), ${lz}"></i>${hex}</span><span class="mono ${c >= 3 ? 'g-cumple' : 'g-no-cumple'}">${razon(c)}${c >= 3 ? '' : ' · menos de 3:1'}</span>`;
      };
      return `<div class="g-familia"><div class="cab"><b>${nombre}</b><span class="sp"></span><code>--f-${k}</code></div><div class="significa">${significa}</div>
        <div class="g-dual"><canvas data-familia="${k}" data-tema="claro"></canvas><canvas data-familia="${k}" data-tema="oscuro"></canvas></div>
        <div class="valores">${fila('claro')}${fila('oscuro')}</div></div>`;
    }).join('') + `<div class="g-familia" style="grid-column:1 / -1"><div class="cab"><b>Luz</b><span class="sp"></span><span class="chip suave">Espectral</span></div>
      <div class="significa">La luz se dibuja con el color de su longitud de onda; la luz blanca y la luz sin λ definida, en tinta. No tiene token: su color es su física.</div>
      <div class="g-dual"><canvas data-luz data-tema="claro" style="height:150px"></canvas><canvas data-luz data-tema="oscuro" style="height:150px"></canvas></div>
      <div class="valores"><span>Rayos</span><span>1.5 px, color espectral de su λ o tinta si es luz blanca, con flecha a mitad del tramo.</span><span></span></div></div>`;
    $$('canvas[data-familia]', cont).forEach(c => lienzo(c, tz => dibujarFamilia(tz, c.dataset.familia, c.dataset.tema), { tema: c.dataset.tema }));
    $$('canvas[data-luz]', cont).forEach(c => lienzo(c, tz => dibujarLuz(tz, c.dataset.tema), { tema: c.dataset.tema }));

    // La energía toma el color de quien la guarda (componente real: .barras y .barra-e)
    const energias = [['Cinética', 'movimiento', 4.0], ['Potencial gravitatoria', 'cambio', 5.88], ['Elástica', 'electrico', 1.2], ['Magnética', 'magnetico', 0.4], ['Calor disipado', 'termico', 2.1], ['Total', null, 13.58]];
    $('#g-energias').innerHTML = `<div class="barras" style="width:100%">${energias.map(([n, f, e]) =>
      `<div class="barra-e"><span>${n}</span><span class="riel"><i style="width:${e / 13.58 * 100}%;background:var(${f ? '--f-' + f : '--tinta'})"></i></span><span class="v">${cantidad(e, 'J', 3)}</span></div>`).join('')}
      <div class="leyenda" style="margin-top:var(--e-2);font-size:var(--t-pequeno);color:var(--texto-2)"><span><i style="color:var(--tinta)"></i>energía interna&nbsp;<var class="sim">U</var></span><span><i class="discontinua" style="color:var(--tinta)"></i>trabajo&nbsp;<var class="sim">W</var></span></div></div>`;
  }

  function dibujarFamilia(tz, k, tema) {
    pantalla(tz);
    const w = tz.w, h = tz.h, cx = w / 2, cy = h / 2 + 8;
    switch (k) {
      case 'movimiento': tz.vector(W(cx - 58, cy + 14), [4, 1.6], { familia: k, escalaPx: 21, simbolo: 'v', desdeRadio: RP }); tz.particula(W(cx - 58, cy + 14)); break;
      case 'cambio': tz.vector(W(cx - 10, cy - 30), [0, -9.8], { familia: k, escalaPx: 5, simbolo: 'g', desdeRadio: RP }); tz.particula(W(cx - 10, cy - 30)); break;
      case 'interaccion':
        tz.superficie([W(cx - 112, cy + 22), W(cx + 104, cy + 22)]);
        tz.cuerpo([W(cx - 82, cy + 22), W(cx - 42, cy + 22), W(cx - 42, cy - 10), W(cx - 82, cy - 10)], { centroMasa: W(cx - 62, cy + 6) });
        tz.vector(W(cx - 42, cy + 6), [3.4, 0], { familia: k, escalaPx: 20, simbolo: 'F' }); break;
      case 'inercia': tz.vector(W(cx - 50, cy + 4), [3.8, 1.0], { familia: k, escalaPx: 21, simbolo: 'p', desdeRadio: RP }); tz.particula(W(cx - 50, cy + 4)); break;
      case 'electrico':
        tz.carga(W(cx - 70, cy + 2), 1);
        tz.vector(W(cx - 30, cy + 2), [3.2, 0], { familia: k, escalaPx: 20, simbolo: 'E' }); break;
      case 'magnetico':
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) campoPerp(tz, cx - 86 + i * 26, cy - 22 + j * 26, true, k);
        tz.vector(W(cx + 20, cy + 16), [2.4, 1.3], { familia: k, escalaPx: 20, simbolo: 'B' }); break;
      case 'corriente':
        tz.lineaPx([[cx - 112, cy + 14], [cx + 108, cy + 14]], { color: 'tinta', grosor: G.materia });
        tz.vector(W(cx - 50, cy - 2), [3.5, 0], { familia: k, escalaPx: 20, simbolo: 'I' }); break;
      case 'termico':
        tz.cuerpo([W(cx - 96, cy + 22), W(cx - 58, cy + 22), W(cx - 58, cy - 16), W(cx - 96, cy - 16)]);
        tz.vector(W(cx - 50, cy + 3), [3.4, 0], { familia: k, escalaPx: 20, simbolo: 'Φ' }); break;
    }
    tz.texto(tema === 'claro' ? 'Claro' : 'Oscuro', 10, 18, { tam: 11, color: 'texto-3' });
  }

  function dibujarLuz(tz, tema) {
    pantalla(tz);
    const w = tz.w, x0 = 24, x1 = w - 24, c = tz.ctx;
    for (let x = x0; x < x1; x++) { c.fillStyle = longitudOnda(380 + (x - x0) / (x1 - x0) * 370); c.fillRect(x, 26, 1.2, 10); }
    for (const nm of [400, 500, 600, 700]) {
      const x = x0 + (nm - 380) / 370 * (x1 - x0);
      tz.lineaPx([[x, 38], [x, 42]], { color: 'texto-3', grosor: 1 });
      tz.texto(nm + ESP + 'nm', x, 54, { fuente: 'num', tam: 10.5, color: 'texto-3', alinear: 'center', halo: true });
    }
    const sx = 30, sy = 104, px = w * 0.42;
    rayo(tz, sx, sy, px, sy, 'tinta');
    tz.compuesto([ui('luz blanca', 11, 'texto-3')], sx + 6, sy - 8);
    [[450, -30], [530, -2], [650, 26]].forEach(([nm, dy]) => {
      const col = longitudOnda(nm);
      rayo(tz, px, sy, w - 92, sy + dy, col);
      tz.compuesto([sim('λ', 13, col), num(' = ' + nm + ESP + 'nm', 10.5, 'texto-2')], w - 86, sy + dy + 4);
    });
    tz.texto(tema === 'claro' ? 'Claro' : 'Oscuro', 10, 16, { tam: 11, color: 'texto-3' });
  }

  // Reglas del color
  function dibujarRC1(tz) {
    encuadre(tz, { x0: -1.2, x1: 2.8, y0: -0.4, y1: 1.05 }, 14); const k = tz.vista.escala;
    suelo(tz, -0.3);
    tz.cuerpo(rect(-0.9, -0.3, 0.5, 0.45), { centroMasa: [-0.65, -0.075] });
    tz.vector([-0.4, -0.075], [1, 0], { familia: 'interaccion', escalaPx: 0.6 * k, simbolo: 'F' });
    tz.vector([1.3, 0.35], [1.0, 0.45], { desdeRadio: RP, familia: 'movimiento', escalaPx: 0.5 * k, simbolo: 'v' });
    tz.vector([1.3, 0.35], [0, -1], { desdeRadio: RP, familia: 'cambio', escalaPx: 0.26 * k, simbolo: 'a' });
    tz.particula([1.3, 0.35]);
  }
  function dibujarRC2(tz) {
    encuadre(tz, { x0: -1.5, x1: 2.5, y0: -0.5, y1: 0.8 }, 12);
    tz.carga([-1, 0.15], 1, { etiqueta: [sim('q', 14), sub('1', 9.5, null, true)] });
    tz.carga([0.1, 0.15], -1, { etiqueta: [sim('q', 14), sub('2', 9.5, null, true)] });
    tz.cuerpo(rect(1.05, -0.3, 0.6, 0.6), { centroMasa: [1.35, 0] });
    tz.particula([2.1, 0.15]);
  }
  function dibujarRC3(tz) {
    const { X, Y } = V.grafica(tz.canvas, {
      x: { min: 0, max: 2 }, y: { min: 0, max: 5 },
      series: [
        { tramos: [muestras(t => [t, 1 + 1.6 * t], 0, 2, 20)], familia: 'movimiento' },
        { tramos: [muestras(t => [t, 4.4 - 1.3 * t], 0, 2, 20)], familia: 'movimiento', patron: 'discontinuo' },
      ],
    });
    tz.compuesto([sim('v', 13, 'movimiento'), sub('A', 9, 'movimiento', true)], X(1.55), Y(1 + 1.6 * 1.55) - 9, { alinear: 'right' });
    tz.compuesto([sim('v', 13, 'movimiento'), sub('B', 9, 'movimiento', true)], X(1.62), Y(4.4 - 1.3 * 1.62) - 9, { alinear: 'left' });
  }
  function dibujarRC5(tz) {
    encuadre(tz, { x0: -1.5, x1: 2.5, y0: -0.5, y1: 0.8 }, 12);
    const c = tz.ctx, dibCarga = (p, col, signo) => {
      const [x, y] = tz.vista.P(p); c.save(); c.fillStyle = tz.color(col); c.beginPath(); c.arc(x, y, 9, 0, 2 * Math.PI); c.fill();
      c.strokeStyle = tz.color('lienzo'); c.lineWidth = 1.75; c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x + 4, y); if (signo > 0) { c.moveTo(x, y - 4); c.lineTo(x, y + 4); } c.stroke(); c.restore();
    };
    tz.vector([-1, 0.15], [1, 0], { familia: 'interaccion', escalaPx: 0.6 * tz.vista.escala });
    dibCarga([-1, 0.15], 'interaccion', 1); dibCarga([0.1, 0.15], 'movimiento', -1);
    tz.vector([1.4, 0.1], [0.9, 0.5], { familia: 'movimiento', escalaPx: 0.5 * tz.vista.escala });
  }

  // Mapas de color
  function dibujarRampa(tz, mapa, tema) {
    pantalla(tz);
    const t = tz.t, lz = t.lienzo, c = tz.ctx, n = 96;
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1); let col;
      if (mapa === 'grises') col = mezcla(lz, t.tinta, s);
      else if (mapa === 'familia') col = mezcla(lz, t.f.magnetico, s);
      else col = s < 0.5 ? mezcla(lz, t['mapa-divergente-negativo'], 1 - s * 2) : mezcla(lz, t['mapa-divergente-positivo'], (s - 0.5) * 2);
      c.fillStyle = css(col); c.fillRect(Math.floor(i * tz.w / n), 0, Math.ceil(tz.w / n) + 1, tz.h);
    }
  }
  function dibujarMapa(tz) {
    encuadre(tz, { x0: -3.2, x1: 3.2, y0: -1.25, y1: 1.25 }, 0);
    const t = tz.t, lz = t.lienzo, cv = tz.canvas, W0 = cv.width, H0 = cv.height, dpr = W0 / tz.w;
    const LUT = [];
    for (let i = 0; i <= 200; i++) { const s = i / 100 - 1; LUT.push(s < 0 ? mezcla(lz, t['mapa-divergente-negativo'], -s) : mezcla(lz, t['mapa-divergente-positivo'], s)); }
    const img = tz.ctx.createImageData(W0, H0), d = img.data, paso = 2;
    for (let py = 0; py < H0; py += paso) for (let px = 0; px < W0; px += paso) {
      const x = tz.vista.mx(px / dpr), y = tz.vista.my(py / dpr);
      const r1 = Math.hypot(x + 1, y) + 0.06, r2 = Math.hypot(x - 1, y) + 0.06;
      const s = Math.tanh((1 / r1 - 1 / r2) * 0.75), col = LUT[Math.round((s + 1) * 100)];
      for (let j = 0; j < paso && py + j < H0; j++) for (let i = 0; i < paso && px + i < W0; i++) {
        const o = ((py + j) * W0 + px + i) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      }
    }
    tz.ctx.putImageData(img, 0, 0);
    tz.carga([-1, 0], 1, { etiqueta: [sim('q', 14), sub('1', 9.5, null, true)] });
    tz.carga([1, 0], -1, { etiqueta: [sim('q', 14), sub('2', 9.5, null, true)] });
    const [ax, ay] = tz.vista.P([-1.9, 0.75]), [bx, by] = tz.vista.P([1.9, 0.75]);
    tz.compuesto([sim('V', 15), num(' > 0', 12, 'texto-2')], ax, ay, { alinear: 'center' });
    tz.compuesto([sim('V', 15), num(' < 0', 12, 'texto-2')], bx, by, { alinear: 'center' });
    tz.compuesto([sim('V', 15), num(' = 0', 12, 'texto-2')], tz.vista.X(0), tz.vista.Y(-0.9), { alinear: 'center' });
  }

  // =====================================================================
  // 7. Tipografía: ISO 80000 lado a lado y formateador real
  // =====================================================================
  const ISO = [
    ['Símbolo en cursiva serif, unidad en redonda', '<span class="sim">v</span><span class="num"> = 4.00&#8239;</span>m/s', 'v = 4.00 <i>m/s</i>', 'Símbolo en redonda y unidad en cursiva'],
    ['Espacio fino que no se corta entre número y unidad', '<span class="num">9.81&#8239;</span>m/s²', '<span class="num">9.81</span>m/s²', 'Número y unidad pegados'],
    ['Signo menos verdadero (U+2212)', '<span class="num">−9.807&#8239;</span>m/s²', '<span class="num">-9.807&#8239;</span>m/s²', 'Guion en lugar de signo menos'],
    ['Notación científica con potencia volada', '<span class="num">6.67 × 10⁻¹¹&#8239;</span>N·m²/kg²', '<span class="num">6.67e-11 N*m^2/kg^2</span>', 'Notación de programación'],
    ['Subíndices: cursiva si son variables, redonda si son descriptivos', '<span class="sim">v<sub>x</sub></span>, <span class="sim">E<sub class="r">k</sub></span>, <span class="sim">v<sub class="r">0</sub></span>', '<span class="sim">v<sub class="r">x</sub></span>, <span class="sim">E<sub>k</sub></span>, <span class="sim">v<sub>0</sub></span>', 'El índice x en redonda; «k» y «0» en cursiva'],
    ['Cuatro cifras significativas, punto decimal y siempre la unidad', '<span class="num">0.5716&#8239;</span>s', '<span class="num">0,571629</span>', 'Coma decimal, cifras de más y sin unidad'],
  ];
  function construirISO() {
    $('#g-iso').innerHTML = ISO.map(([regla, si, no, error]) =>
      `<div class="g-caso"><div class="cuerpo"><span class="g-cantidad">${si}</span></div><div class="pie"><span class="veredicto">${icono('i-check')}Correcto</span>${regla}.</div></div>` +
      `<div class="g-caso no"><div class="cuerpo"><span class="g-cantidad">${no}</span></div><div class="pie"><span class="veredicto">${icono('i-cerrar')}Incorrecto</span>${error}.</div></div>`).join('');
    const salida = $('#fmt-salida'); let cifras = 4;
    const act = () => {
      const v = parseFloat($('#fmt-valor').value.replace(/−/g, '-').replace(',', '.')), u = $('#fmt-unidad').value.trim();
      salida.textContent = !isFinite(v) ? '—' : $('#fmt-prefijo').checked ? V.conPrefijo(v, u, cifras) : cantidad(v, u, cifras);
      $('#fmt-valor').closest('.campo').classList.toggle('es-error', !isFinite(v));
    };
    $('#fmt-valor').addEventListener('input', act); $('#fmt-unidad').addEventListener('input', act); $('#fmt-prefijo').addEventListener('change', act);
    // Lecturas con prefijo SI, con el formateador real
    $('#g-lect-prefijo').innerHTML = [['E', '', 12710, 'V/m'], ['F', '', 0.006355, 'N'], ['q', '', 2.0e-6, 'C'], ['V', '', 12710, 'V']].map(([s, b, v, u]) => {
      const [n, uu] = V.conPrefijo(v, u, s === 'q' ? 2 : 4).split(ESP);
      return `<span class="sim">${s}</span><span class="v">${n}</span><span class="u">${uu}</span>`;
    }).join('');
    $('#fmt-cifras').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) { cifras = +b.dataset.c; act(); } });
    act();
  }

  // =====================================================================
  // 8. Geometría
  // =====================================================================
  function construirGeometria() {
    if (TOK) $('#g-espacios').innerHTML = Object.entries(TOK.espacio).sort((a, b) => a[1] - b[1]).map(([k, v]) =>
      `<span class="tok">--e-${k}</span><span class="med">${v}</span><i style="width:var(--e-${k})"></i>`).join('');
    const TRAZOS = [
      ['Materia', 2, 'continuo', 'Contornos de cuerpos, superficies, cables', tz => tz.lineaPx([[10, 17], [210, 17]], { grosor: G.materia })],
      ['Real secundario', 1.5, 'continuo', 'Cuerdas, trazas recorridas', tz => tz.lineaPx([[10, 17], [210, 17]], { grosor: G.real, color: 'texto-2' })],
      ['Previsto', 1.5, 'discontinuo 6 · 4', 'Trayectoria prevista, estado futuro', tz => tz.lineaPx([[10, 17], [210, 17]], { grosor: G.previsto, color: 'texto-3', patron: 'previsto', extremo: 'butt' })],
      ['Auxiliar', 1, 'punteado 1.5 · 3', 'Componentes, proyecciones, construcciones', tz => tz.lineaPx([[10, 17], [210, 17]], { grosor: G.auxiliar, color: 'texto-3', patron: 'auxiliar' })],
      ['Cota', 1, 'continuo, flechas abiertas', 'Medidas en el dibujo', tz => tz.flechaPx(10, 17, 210, 17, { grosor: G.cota, color: 'texto-2', punta: 'abierta', ambas: true })],
      ['Eje de simetría', 1, 'raya y punto 10 · 3 · 2 · 3', 'Ejes, normales', tz => tz.lineaPx([[10, 17], [210, 17]], { grosor: 1, color: 'texto-3', patron: 'eje', extremo: 'butt' })],
      ['Vector', 2.25, 'continuo, punta llena', 'Magnitudes', tz => tz.flechaPx(10, 17, 210, 17, { color: 'movimiento' })],
      ['Componente', 1.25, 'discontinuo 4 · 3, punta llena pequeña', 'Componentes de un vector', tz => tz.flechaPx(10, 17, 210, 17, { color: 'movimiento', grosor: G.componente, patron: 'componente' })],
    ];
    const tabla = $('#g-trazos');
    tabla.innerHTML = '<thead><tr><th>Tipo</th><th class="der">Grosor</th><th>Patrón</th><th>Uso</th><th>Muestra</th></tr></thead><tbody>' +
      TRAZOS.map(([n, g, p, u], i) => `<tr><td style="color:var(--texto)">${n}</td><td class="der mono">${String(g).replace('.', '.')}&#8239;<span class="tenue">px</span></td><td>${p}</td><td>${u}</td><td class="lz"><canvas data-trazo="${i}"></canvas></td></tr>`).join('') + '</tbody>';
    $$('canvas[data-trazo]', tabla).forEach(c => lienzo(c, tz => { pantalla(tz); TRAZOS[+c.dataset.trazo][4](tz); }));

    lienzo('#lz-puntas', tz => {
      pantalla(tz);
      const c = tz.ctx, k = 6, g = G.vector, L = Math.max(9, 4.5 * g), A = Math.max(7, 3.5 * g);
      // Punta llena, ampliada 6 veces
      const ox = 70, oy = tz.h / 2 + 6;
      c.save(); c.translate(ox, oy); c.scale(k, k); tz.flechaPx(0, 0, 44, 0, { color: 'movimiento' }); c.restore();
      const xp = ox + 44 * k, xb = xp - L * k;
      tz.flechaPx(xb, oy + A * k / 2 + 22, xp, oy + A * k / 2 + 22, { grosor: 1, color: 'texto-2', punta: 'abierta', ambas: true });
      tz.lineaPx([[xb, oy + A * k / 2 + 6], [xb, oy + A * k / 2 + 28]], { color: 'texto-3', grosor: 1 });
      tz.lineaPx([[xp, oy + 6], [xp, oy + A * k / 2 + 28]], { color: 'texto-3', grosor: 1 });
      tz.texto('4.5 × grosor', (xb + xp) / 2, oy + A * k / 2 + 40, { fuente: 'num', tam: 11, color: 'texto-2', alinear: 'center', halo: true });
      tz.flechaPx(xp + 22, oy - A * k / 2, xp + 22, oy + A * k / 2, { grosor: 1, color: 'texto-2', punta: 'abierta', ambas: true });
      tz.texto('3.5 × grosor', xp + 30, oy + 4, { fuente: 'num', tam: 11, color: 'texto-2', halo: true });
      tz.texto('mínimo 9 × 7 px', xp + 30, oy + 20, { fuente: 'num', tam: 11, color: 'texto-3', halo: true });
      nota(tz, 'Punta llena · vectores', ox, 24);
      // Punta abierta, ampliada
      const ax = tz.w - 330;
      c.save(); c.translate(ax, oy); c.scale(k, k); tz.flechaPx(0, 0, 40, 0, { grosor: 1, color: 'texto-2', punta: 'abierta' }); c.restore();
      nota(tz, 'Punta abierta de dos trazos · cotas y ejes', ax, 24);
      // A tamaño real
      nota(tz, 'A tamaño real: vector, componente y cota', ax, tz.h - 44);
      tz.flechaPx(ax, tz.h - 26, ax + 90, tz.h - 26, { color: 'movimiento' });
      tz.flechaPx(ax + 120, tz.h - 26, ax + 210, tz.h - 26, { color: 'movimiento', grosor: G.componente, patron: 'componente' });
      tz.flechaPx(ax + 240, tz.h - 26, ax + 310, tz.h - 26, { color: 'texto-2', grosor: 1, punta: 'abierta', ambas: true });
    });

    // Movimiento
    $('#b-mov').addEventListener('click', () => $('#g-mov').classList.toggle('movido'));
    lienzo('#lz-curva', tz => {
      const bz = s => [3 * (1 - s) ** 2 * s * 0.2 + s ** 3, 3 * (1 - s) * s * s + s ** 3];
      const { X, Y } = V.grafica(tz.canvas, {
        x: { min: 0, max: 1 }, y: { min: 0, max: 1 },
        series: [{ tramos: [muestras(bz, 0, 1, 120)], familia: 'tinta' }, { tramos: [[[0, 0], [1, 1]]], familia: 'texto-3', auxiliar: true }],
      });
      tz.compuesto([num('cubic-bezier(.2, 0, 0, 1)', 11, 'texto-2')], X(0.3), Y(0.9));
      tz.compuesto([ui('lineal', 11, 'texto-3')], X(0.62), Y(0.5));
    });
  }

  // =====================================================================
  // 9. Iconografía: rejilla y set completo
  // =====================================================================
  const INVENTARIO = {
    i: 'reproducir pausar paso-adelante paso-atras reiniciar inicio deshacer rehacer buscar mas menos cerrar menu ajustes capas ojo ojo-tachado candado candado-abierto duplicar borrar mover rotar zoom-mas zoom-menos encuadrar cuadricula ajuste-iman grafica tabla energia evento archivo carpeta guardar exportar imagen video variable enlazar expresion info aviso error ayuda check chevron-abajo chevron-arriba chevron-izquierda chevron-derecha flecha-derecha asa tema-claro tema-oscuro pantalla-completa panel-izquierdo panel-derecho panel-inferior filtro estrella historial rama precision velocidad-sim copiar nota etiqueta tutorial ejemplo mext escena',
    o: {
      'Mecánica': 'particula bloque disco barra poligono movimiento-prescrito suelo pared plano-inclinado arco curva trazo-libre pista cuerda cuerda-elastica resorte amortiguador varilla polea clavo prensa-hidraulica pasador fijacion riel fuerza motor impulso lanzador gravedad fluido viento campo-propio marco-movil',
      'Gravitación': 'planeta satelite cuerpo-masivo nave atmosfera',
      'Termodinámica': 'cilindro recipiente embolo tabique valvula pesa calentador bano-termico gas columna-liquido globo caja-molecular bomba orificio cuerpo-termico calorimetro',
      'Electrostática': 'carga-positiva carga-negativa esfera-cargada hilo-infinito segmento-cargado anillo lamina capacitor-placas conductor dielectrico campo-uniforme tierra',
      'Circuitos': 'bateria fuente-corriente resistencia reostato bombilla capacitor inductor interruptor interruptor-3 cable nodo',
      'Magnetismo': 'hilo-corriente segmento-corriente espira solenoide iman region-b region-e particula-cargada fuente-iones placas-aceleradoras pantalla rieles barra-conductora espira-movil bobina-giratoria lamina-hall',
      'Ondas': 'cuerda-vibrante tubo piston oscilador pulso union-medios onda-analitica fuente-puntual fuente-lineal arreglo-fuentes barrera rendija zona-velocidad fuente-sonora observador pared-reflectante',
      'Óptica': 'rayo haz fuente-luz objeto-luminoso medio capas recipiente-liquido espejo-plano espejo-curvo lente-ideal lente-gruesa divisor-haz bloqueador pantalla-optica ojo rendija-doble red-difraccion pelicula anillos-newton michelson',
      'Física moderna': 'lampara placa-metal colector nucleo muestra foton',
    },
    n: 'regla transportador cronometro fotopuerta dinamometro velocimetro acelerometro balanza periodo sonda-campo sonda-potencial voltimetro amperimetro osciloscopio superficie-gauss termometro manometro histograma frecuencimetro microfono espectro detector intensidad contador-franjas sonda-b brujula flujo',
    m: 'mecanica gravitacion termodinamica electrostatica circuitos magnetismo ondas optica moderna',
  };
  function gruposContrato() {
    const g = [['Interfaz', 'i-', INVENTARIO.i.split(' ').map(n => 'i-' + n)]];
    for (const [mod, lista] of Object.entries(INVENTARIO.o)) g.push(['Objetos · ' + mod, 'o-', lista.split(' ').map(n => 'o-' + n)]);
    g.push(['Instrumentos', 'n-', INVENTARIO.n.split(' ').map(n => 'n-' + n)], ['Módulos', 'm-', INVENTARIO.m.split(' ').map(n => 'm-' + n)]);
    return g;
  }
  function construirIconos() {
    const rej = $('#g-icono-rejilla');
    let s = '<rect x="0" y="0" width="20" height="20" style="fill:var(--lienzo)"/><path d="M0 0H20V20H0ZM2 2V18H18V2Z" fill-rule="evenodd" style="fill:var(--campo)"/>';
    for (let i = 0; i <= 20; i++) s += `<path d="M${i} 0V20M0 ${i}H20" style="stroke:var(--linea-suave)" stroke-width=".04"/>`;
    s += '<rect x="2" y="2" width="16" height="16" style="fill:none;stroke:var(--texto-3)" stroke-width=".07" stroke-dasharray=".35 .3"/>';
    s += '<use href="#o-resorte" x="0" y="0" width="20" height="20" style="color:var(--tinta)"/>';
    rej.innerHTML = s;

    const cont = $('#g-set'), VI = window.VoltaIconos;
    let nombres = null;
    if (VI && VI.nombres) nombres = Array.isArray(VI.nombres) ? VI.nombres.slice() : Object.values(VI.nombres).flat();
    const grupos = gruposContrato(), contrato = grupos.flatMap(g => g[2]);
    if (!nombres) {
      cont.innerHTML = `<div class="vacio">${icono('i-capas')}<b>El set de iconos aún no está publicado</b><span>Esta sección lee <code>window.VoltaIconos.nombres</code> de <code>iconos/sprite.js</code> en cuanto exista. Mientras, este es el inventario del contrato: ${contrato.length} nombres.</span><a class="btn btn-secundario" href="../iconos/catalogo.html">Abrir el catálogo de iconos</a></div>` +
        grupos.map(([t, , l]) => `<div class="g-set-grupo"><h5>${t}<span>${l.length}</span></h5><div class="g-inventario">${l.map(n => `<span class="chip suave">${n}</span>`).join('')}</div></div>`).join('');
      $('#set-cuenta').textContent = `${contrato.length} nombres en el contrato · sprite pendiente`;
      $('.g-set-cab .campo').style.display = 'none'; $('#set-tam').style.display = 'none';
      return;
    }
    const enSprite = new Set(nombres), faltan = contrato.filter(n => !enSprite.has(n)), extra = nombres.filter(n => !contrato.includes(n));
    const grupoHTML = (titulo, lista) => {
      const em = lista.every(n => n.startsWith('m-'));
      return `<div class="g-set-grupo" data-grupo-iconos><h5>${titulo}<span>${lista.length}</span></h5><div class="g-set t20">${lista.map(n =>
        `<div class="celda${enSprite.has(n) ? '' : ' falta'}" data-nombre="${n}" title="${n}${enSprite.has(n) ? '' : ' · falta en el sprite'}">${em ? `<svg class="ico" style="width:40px;height:40px"><use href="#${n}"/></svg>` : icono(n)}<span>${n}</span></div>`).join('')}</div></div>`;
    };
    cont.innerHTML = grupos.map(([t, , l]) => grupoHTML(t, l)).join('') + (extra.length ? grupoHTML('Fuera del inventario del contrato', extra) : '');
    $('#set-cuenta').textContent = `${nombres.length} iconos en el sprite` + (faltan.length ? ` · ${faltan.length} del contrato sin dibujar` : ' · inventario completo');
    $('#set-buscar').addEventListener('input', ev => {
      const q = ev.target.value.trim().toLowerCase();
      $$('.celda', cont).forEach(c => { c.hidden = !!q && !c.dataset.nombre.includes(q); });
      $$('[data-grupo-iconos]', cont).forEach(g => { g.hidden = !$$('.celda', g).some(c => !c.hidden); });
    });
    $('#set-tam').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) $$('.g-set', cont).forEach(s => s.classList.toggle('t20', b.dataset.t === '20')); });
  }

  // =====================================================================
  // 10. Componentes interactivos
  // =====================================================================
  // Notificación: breve, abajo al centro, se cierra sola
  let relojAviso = null;
  function aviso(texto) {
    const el = $('#g-aviso'); $('#g-aviso-texto').textContent = texto;
    el.classList.remove('oculto'); clearTimeout(relojAviso);
    relojAviso = setTimeout(() => el.classList.add('oculto'), 3200);
  }

  // Menús vivos (desplegable y contextual)
  let menuAbierto = null;
  function cerrarMenu() { if (menuAbierto) { menuAbierto.remove(); menuAbierto = null; } }
  function abrirMenu(x, y, items) {
    cerrarMenu();
    const m = document.createElement('div'); m.className = 'menu g-menu-vivo'; m.setAttribute('role', 'menu');
    m.innerHTML = items.map(it => it === '-' ? '<div class="menu-sep"></div>' : it.titulo ? `<div class="menu-titulo">${it.titulo}</div>`
      : `<div class="menu-item${it.peligro ? ' peligro' : ''}" role="menuitem" data-t="${it.t}">${icono(it.i)}${it.t}<span class="atajo">${it.a || ''}</span></div>`).join('');
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px'; m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
    m.addEventListener('click', ev => { const it = ev.target.closest('.menu-item'); if (it) { cerrarMenu(); aviso(it.dataset.t + ': hecho'); } });
    menuAbierto = m;
  }
  function iniciarMenus() {
    $('#b-menu-vivo').addEventListener('click', ev => {
      ev.stopPropagation();
      if (menuAbierto) { cerrarMenu(); return; }
      const r = ev.currentTarget.getBoundingClientRect();
      abrirMenu(r.left, r.bottom + 4, [{ titulo: 'Exportar' }, { i: 'i-imagen', t: 'Imagen PNG', a: 'Ctrl E' }, { i: 'i-imagen', t: 'Imagen SVG' }, { i: 'i-video', t: 'Video MP4' }, '-', { i: 'i-tabla', t: 'Datos en CSV', a: 'Ctrl Mayús E' }]);
    });
    $('#g-zona-ctx').addEventListener('contextmenu', ev => {
      ev.preventDefault();
      abrirMenu(ev.clientX, ev.clientY, [{ i: 'i-duplicar', t: 'Duplicar', a: 'Ctrl D' }, { i: 'i-candado', t: 'Bloquear', a: 'Ctrl L' }, { i: 'i-ojo-tachado', t: 'Ocultar', a: 'H' }, '-', { i: 'i-borrar', t: 'Borrar', a: 'Supr', peligro: true }]);
    });
    document.addEventListener('pointerdown', ev => { if (menuAbierto && !menuAbierto.contains(ev.target) && !ev.target.closest('#b-menu-vivo')) cerrarMenu(); });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape') cerrarMenu(); });
    window.addEventListener('scroll', cerrarMenu, { passive: true });
    lienzo('#lz-ctx', tz => {
      encuadre(tz, { x0: -1, x1: 2, y0: -0.2, y1: 1.2 }, 16);
      tz.cuadricula(); suelo(tz);
      tz.cuerpo(rect(0.1, 0, 0.7, 0.55), { centroMasa: [0.45, 0.275] });
      const [x0, y0] = tz.vista.P([0.1, 0.55]), [x1, y1] = tz.vista.P([0.8, 0]);
      tz.seleccionCaja(x0, y0, x1 - x0, y1 - y0);
    });
  }

  // Paleta de comandos
  const COMANDOS = [
    { g: 'Acciones', i: 'i-reproducir', t: 'Reproducir o pausar', a: 'Espacio', f: () => alternarSim() },
    { g: 'Acciones', i: 'i-reiniciar', t: 'Reiniciar la simulación', a: 'Inicio', f: () => { SIM.t = 0; SIM.jugando = false; refrescarSim(); } },
    { g: 'Acciones', i: 'i-encuadrar', t: 'Encuadrar todo', a: 'F' },
    { g: 'Acciones', i: 'i-exportar', t: 'Exportar datos a CSV', a: 'Ctrl Mayús E' },
    { g: 'Acciones', i: 'i-tema-oscuro', t: 'Cambiar tema claro u oscuro', a: '', f: () => V.ponerTema(raiz.dataset.tema === 'oscuro' ? 'claro' : 'oscuro') },
    { g: 'Objetos', i: 'o-particula', t: 'Añadir partícula', a: 'P' },
    { g: 'Objetos', i: 'o-resorte', t: 'Añadir resorte', a: '' },
    { g: 'Objetos', i: 'o-plano-inclinado', t: 'Añadir plano inclinado', a: '' },
    { g: 'Escenarios', i: 'i-escena', t: 'Abrir «Salto hacia una pendiente»', a: '' },
    { g: 'Escenarios', i: 'i-escena', t: 'Abrir «Péndulo simple»', a: '' },
  ];
  let selCmd = 0;
  function pintarComandos() {
    const q = $('#cmd-q').value.trim().toLowerCase();
    const lista = COMANDOS.filter(c => c.t.toLowerCase().includes(q));
    selCmd = Math.max(0, Math.min(selCmd, lista.length - 1));
    let html = '', grupo = null;
    lista.forEach((c, i) => {
      if (c.g !== grupo) { grupo = c.g; html += `<div class="menu-titulo">${grupo}</div>`; }
      html += `<div class="menu-item${i === selCmd ? ' activo' : ''}" data-i="${COMANDOS.indexOf(c)}">${icono(c.i)}${c.t}<span class="atajo">${c.a}</span></div>`;
    });
    $('#cmd-lista').innerHTML = html || `<div class="vacio" style="padding:var(--e-6)"><b>Sin resultados</b><span>Prueba con otra palabra, por ejemplo «exportar».</span></div>`;
    return lista;
  }
  function ejecutar(c) { if (c.f) c.f(); aviso('Comando: ' + c.t); }
  function iniciarComandos() {
    pintarComandos();
    $('#cmd-q').addEventListener('input', () => { selCmd = 0; pintarComandos(); });
    $('#cmd-q').addEventListener('keydown', ev => {
      const lista = pintarComandos();
      if (ev.key === 'ArrowDown') { selCmd = Math.min(lista.length - 1, selCmd + 1); pintarComandos(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { selCmd = Math.max(0, selCmd - 1); pintarComandos(); ev.preventDefault(); }
      else if (ev.key === 'Enter' && lista[selCmd]) ejecutar(lista[selCmd]);
      else if (ev.key === 'Escape') { $('#cmd-q').value = ''; selCmd = 0; pintarComandos(); }
    });
    $('#cmd-lista').addEventListener('click', ev => { const it = ev.target.closest('.menu-item'); if (it) ejecutar(COMANDOS[+it.dataset.i]); });
    document.addEventListener('keydown', ev => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); $('#c-comandos').scrollIntoView({ block: 'start' }); $('#cmd-q').focus(); }
    });
  }

  // Diálogo vivo
  function iniciarDialogo() {
    $('#b-dialogo-vivo').addEventListener('click', () => {
      const velo = document.createElement('div'); velo.className = 'velo g-velo-vivo';
      velo.innerHTML = `<div class="dialogo" role="dialog" aria-modal="true" aria-labelledby="g-dlg-t"><h2 id="g-dlg-t">¿Descartar los cambios de la escena?</h2><p>Los cambios desde la última vez que guardaste se perderán. La escena original sigue en la biblioteca.</p><div class="acciones"><button class="btn btn-secundario" data-r="no">Cancelar</button><button class="btn btn-primario" data-r="si">Descartar cambios</button></div></div>`;
      document.body.appendChild(velo);
      const cerrar = r => { velo.remove(); document.removeEventListener('keydown', tecla); if (r === 'si') aviso('Se descartaron los cambios de la escena'); };
      const tecla = ev => { if (ev.key === 'Escape') cerrar('no'); };
      velo.addEventListener('click', ev => { if (ev.target === velo) cerrar('no'); const b = ev.target.closest('[data-r]'); if (b) cerrar(b.dataset.r); });
      document.addEventListener('keydown', tecla);
      $('[data-r="si"]', velo).focus();
    });
    $('#b-aviso-vivo').addEventListener('click', () => aviso('Datos exportados a salto-pendiente.csv'));
  }

  // Árbol: selección con un clic
  function iniciarArbol() {
    $('#g-arbol').addEventListener('click', ev => {
      const n = ev.target.closest('.nodo'); if (!n || n.classList.contains('global')) return;
      $$('.nodo', $('#g-arbol')).forEach(x => x.setAttribute('aria-selected', String(x === n)));
    });
  }

  // Campo de expresión con análisis dimensional mínimo [longitud, tiempo]
  const VARS = { h: { v: 1.2, d: [1, 0] }, g: { v: 9.8, d: [1, -2] }, v0: { v: 4, d: [1, -1] }, t: { v: 0.5, d: [0, 1] } };
  const MAGNITUDES = { '1,0': 'una longitud', '1,-1': 'una velocidad', '1,-2': 'una aceleración', '0,1': 'un tiempo', '0,0': 'un número sin unidades', '2,0': 'un área', '2,-2': 'una velocidad al cuadrado', '0,-1': 'una frecuencia' };
  function evaluar(expr) {
    const s = expr.replace(/\s+/g, '').replace(/−/g, '-').replace(/[·×]/g, '*'); let i = 0;
    const fallo = (tipo, dato) => { const e = new Error(tipo); e.dato = dato; throw e; };
    const igual = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
    function prim() {
      if (s[i] === '(') { i++; const r = suma(); if (s[i] !== ')') fallo('sintaxis'); i++; return r; }
      if (s[i] === '-') { i++; const r = pot(); return { v: -r.v, d: r.d }; }
      const n = /^\d+(\.\d+)?/.exec(s.slice(i)); if (n) { i += n[0].length; return { v: parseFloat(n[0]), d: [0, 0] }; }
      const m = /^[A-Za-z_][A-Za-z_0-9]*/.exec(s.slice(i)); if (!m) fallo('sintaxis'); i += m[0].length;
      if (m[0] === 'sqrt') { if (s[i] !== '(') fallo('sintaxis'); i++; const r = suma(); if (s[i] !== ')') fallo('sintaxis'); i++; return { v: Math.sqrt(r.v), d: r.d.map(x => x / 2) }; }
      if (m[0] === 'pi') return { v: Math.PI, d: [0, 0] };
      const q = VARS[m[0]]; if (!q) fallo('variable', m[0]); return { v: q.v, d: q.d.slice() };
    }
    function pot() { const b = prim(); if (s[i] === '^') { i++; const e = prim(); if (!igual(e.d, [0, 0])) fallo('exponente'); return { v: Math.pow(b.v, e.v), d: b.d.map(x => x * e.v) }; } return b; }
    function prod() { let a = pot(); while (s[i] === '*' || s[i] === '/') { const op = s[i++], b = pot(); a = op === '*' ? { v: a.v * b.v, d: [a.d[0] + b.d[0], a.d[1] + b.d[1]] } : { v: a.v / b.v, d: [a.d[0] - b.d[0], a.d[1] - b.d[1]] }; } return a; }
    function suma() { let a = prod(); while (s[i] === '+' || s[i] === '-') { const op = s[i++], b = prod(); if (!igual(a.d, b.d)) fallo('suma'); a = { v: op === '+' ? a.v + b.v : a.v - b.v, d: a.d }; } return a; }
    if (!s) fallo('vacio');
    const r = suma(); if (i !== s.length) fallo('sintaxis'); return r;
  }
  function iniciarExpresion() {
    const ent = $('#c-expr'), campo = $('#c-expr-campo'), valor = $('#c-expr-valor'), err = $('#c-expr-error');
    const act = () => {
      let msg = null, r = null;
      try {
        r = evaluar(ent.value);
        if (Math.abs(r.d[0] - 1) > 1e-9 || Math.abs(r.d[1]) > 1e-9) msg = `La expresión da ${MAGNITUDES[r.d.map(x => Math.round(x * 2) / 2).join(',')] || 'otra magnitud'} y este campo espera una longitud.`;
      } catch (e) {
        msg = e.message === 'variable' ? `No hay ninguna variable llamada «${e.dato}». Las de esta escena son h, g, v0 y t.`
          : e.message === 'suma' ? 'No se pueden sumar cantidades de distinta magnitud: revisa cada término.'
          : e.message === 'vacio' ? 'Escribe un número o una expresión, por ejemplo 2*h.'
          : 'No se entiende la expresión: revisa los paréntesis y los operadores.';
      }
      campo.classList.toggle('es-error', !!msg);
      err.hidden = !msg; err.textContent = msg || '';
      valor.textContent = msg ? '' : '= ' + cantidad(r.v, 'm', 4);
    };
    ent.addEventListener('input', act); act();
    const d = $('#d-demo'); d.addEventListener('input', () => { $('#d-demo-v').textContent = (+d.value).toFixed(2); });
  }

  // =====================================================================
  // 11. Simulación de demostración: una bola que cae y rebota
  //     Enlaza la línea de tiempo, las gráficas, lecturas, variables y lienzo.
  // =====================================================================
  const SIM = {
    V: {
      h: { sim: 'h', val: 1.2, min: 0.4, max: 1.6, paso: 0.05, u: 'm' },
      e: { sim: 'e', val: 0.7, min: 0, max: 0.95, paso: 0.01, u: '' },
      v0: { sim: 'v', sub: '0', val: 2.0, min: 0, max: 3, paso: 0.05, u: 'm/s' },
      g: { sim: 'g', val: 9.8, constante: true, paso: 0.01, u: 'm/s²' },
    },
    DUR: 3, M: 0.5, t: 0.9, jugando: false, velocidad: 1, tramos: [], eventos: [],
  };
  function simular() {
    const g = SIM.V.g.val, e = SIM.V.e.val, vx = SIM.V.v0.val;
    let t0 = 0, x0 = 0, y0 = SIM.V.h.val, vy = 0;
    SIM.tramos = []; SIM.eventos = [];
    for (let k = 0; k < 80; k++) {
      const tc = (vy + Math.sqrt(vy * vy + 2 * g * y0)) / g;
      SIM.tramos.push({ tipo: 'vuelo', t0, x0, y0, vy0: vy, dur: Math.min(tc, SIM.DUR - t0) });
      if (t0 + tc >= SIM.DUR) return;
      const vimp = vy - g * tc; t0 += tc; x0 += vx * tc; y0 = 0; vy = -e * vimp;
      SIM.eventos.push({ t: t0, nombre: vy < 0.15 ? 'Queda rodando' : 'Choque con el suelo', x: x0, y: 0, perdida: 0.5 * SIM.M * vimp * vimp * (1 - e * e) });
      if (vy < 0.15) { SIM.tramos.push({ tipo: 'rodando', t0, x0, y0: 0, vy0: 0, dur: SIM.DUR - t0 }); return; }
    }
  }
  function estado(t) {
    let tr = SIM.tramos[0];
    for (const q of SIM.tramos) if (q.t0 <= t + 1e-12) tr = q;
    const d = Math.min(t - tr.t0, tr.dur), g = SIM.V.g.val, vx = SIM.V.v0.val;
    if (tr.tipo === 'vuelo') return { x: tr.x0 + vx * d, y: Math.max(0, tr.y0 + tr.vy0 * d - g * d * d / 2), vx, vy: tr.vy0 - g * d, fase: 'en vuelo' };
    return { x: tr.x0 + vx * d, y: 0, vx, vy: 0, fase: 'rodando' };
  }
  const energia = s => ({ K: 0.5 * SIM.M * (s.vx * s.vx + s.vy * s.vy), U: SIM.M * SIM.V.g.val * s.y });
  function serie(f) { return SIM.tramos.map(tr => muestras(tt => f(tt, estado(Math.min(tt, tr.t0 + tr.dur - 1e-9))), tr.t0, tr.t0 + tr.dur, 40)); }
  function fmtVar(d) { const dec = d.paso >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(d.paso) - 1e-9)); return d.val.toFixed(dec).replace('-', '−'); }

  let lt = null, lzSim = null;
  function construirVariables() {
    const cont = $('#g-variables'); cont.innerHTML = '';
    for (const d of Object.values(SIM.V)) {
      const fila = document.createElement('div'); fila.className = 'var' + (d.constante ? ' constante' : '');
      const s = `<span class="sim">${d.sim}${d.sub ? `<sub class="r">${d.sub}</sub>` : ''}</span>`;
      const control = d.constante ? '<span class="constante-etq">Constante</span>' : `<input class="deslizador" type="range" min="${d.min}" max="${d.max}" step="${d.paso}" value="${d.val}" aria-label="${d.sim}">`;
      fila.innerHTML = `${s}${control}<span class="valor"></span>`;
      const ent = $('input', fila), val = $('.valor', fila);
      const ver = () => { val.innerHTML = `${fmtVar(d)}${d.u ? `<span class="u">${d.u}</span>` : ''}`; if (ent) V.pintarDeslizador(ent); };
      if (ent) ent.addEventListener('input', () => { d.val = parseFloat(ent.value); ver(); recalcularSim(); });
      ver(); cont.appendChild(fila);
    }
  }
  function refrescarSim() {
    const t = SIM.t, s = estado(t), { K, U } = energia(s), E0 = energia(estado(0)), tot0 = E0.K + E0.U;
    $('#lt-reloj').innerHTML = `<span class="sim">t</span>${fmt(t, 4)}<span class="u">s</span>`;
    $('#lt-play').innerHTML = icono(SIM.jugando ? 'i-pausar' : 'i-reproducir');
    $('#lt-play').dataset.ayuda = SIM.jugando ? 'Pausar|Pause' : 'Reproducir|Play';
    lt.poner(t);
    const ev = SIM.eventos.map(e => ({ x: e.t }));
    V.grafica($('#g1'), { x: { min: 0, max: SIM.DUR }, y: { min: 0, max: SIM.V.h.val * 1.1 }, series: [{ tramos: serie((a, q) => [a, q.y]), familia: 'tinta' }], cursor: t, puntoCursor: [t, s.y], eventos: SIM.eventos.map(e => ({ x: e.t, y: 0 })) });
    const vmax = Math.sqrt(2 * SIM.V.g.val * SIM.V.h.val) * 1.12;
    V.grafica($('#g2'), { x: { min: 0, max: SIM.DUR }, y: { min: -vmax, max: vmax }, series: [{ tramos: serie((a, q) => [a, q.vy]), familia: 'movimiento' }], cursor: t, puntoCursor: [t, s.vy], eventos: ev });
    V.grafica($('#g3'), {
      x: { min: 0, max: SIM.DUR }, y: { min: 0, max: tot0 * 1.05 },
      series: [
        { tramos: serie((a, q) => [a, energia(q).K]), familia: 'movimiento' },
        { tramos: serie((a, q) => [a, energia(q).U]), familia: 'cambio' },
        { tramos: serie((a, q) => { const e = energia(q); return [a, tot0 - e.K - e.U]; }), familia: 'termico', patron: 'discontinuo' },
      ], cursor: t, eventos: ev,
    });
    $('#gl1').textContent = cantidad(s.y, 'm'); $('#gl2').textContent = cantidad(s.vy, 'm/s'); $('#gl3').textContent = cantidad(K + U, 'J');
    // Lecturas e inspector
    $('#lect-titulo').innerHTML = `Lecturas en <span class="sim">t</span> = ${fmt(t, 4)}&#8239;s`;
    const filas = [['x', '', s.x, 'm'], ['y', '', s.y, 'm'], ['v', 'x', s.vx, 'm/s'], ['v', 'y', s.vy, 'm/s'], ['|v|', '', Math.hypot(s.vx, s.vy), 'm/s'], ['E', 'k', K, 'J'], ['E', 'p', U, 'J']];
    $('#g-lecturas').innerHTML = filas.map(([a, b, v, u]) =>
      `<span class="sim">${a}${b ? `<sub${b === 'k' || b === 'p' ? ' class="r"' : ''}>${b}</sub>` : ''}</span><span class="v">${fmt(v, 4)}</span><span class="u">${u}</span>`).join('');
    $('#insp-estado').textContent = 'Partícula · ' + s.fase;
    const actual = SIM.eventos.filter(e => e.t <= t + 1e-9).pop();
    $('#g-tabla-eventos').innerHTML = '<thead><tr><th>Evento</th><th>t (s)</th><th>x (m)</th><th>Energía perdida (J)</th></tr></thead><tbody>' +
      SIM.eventos.map(e => `<tr class="${e === actual ? 'actual' : ''}"><td class="texto">${e.nombre}</td><td>${fmt(e.t, 4)}</td><td>${fmt(e.x, 4)}</td><td>${fmt(e.perdida, 4)}</td></tr>`).join('') + '</tbody>';
    const dis = tot0 - K - U, maxE = tot0 * 1.02;
    $('#g-barras').innerHTML = `<div class="barras-tit">Energía en <span class="sim">t</span> = ${fmt(t, 4)}&#8239;s</div>` +
      [['Cinética', 'movimiento', K], ['Potencial gravitatoria', 'cambio', U], ['Disipada en choques', 'termico', dis], ['Total', null, tot0]].map(([n, f, e]) =>
        `<div class="barra-e"><span>${n}</span><span class="riel"><i style="width:${Math.max(0, e / maxE * 100)}%;background:var(${f ? '--f-' + f : '--tinta'})"></i></span><span class="v">${cantidad(e, 'J', 4)}</span></div>`).join('') +
      `<div class="barras-pie"><span class="sim">E</span><sub>k</sub> + <span class="sim">E</span><sub>p</sub> + <span class="sim">Q</span> = ${cantidad(K + U + dis, 'J', 4)}</div>`;
    $('#insp-h').textContent = fmtVar(SIM.V.h); $('#insp-v').textContent = fmtVar(SIM.V.v0);
    pintar(lzSim);
  }
  function recalcularSim() { simular(); lt.eventos = SIM.eventos.map(e => ({ t: e.t, nombre: e.nombre })); refrescarSim(); }
  function alternarSim() { if (SIM.t >= SIM.DUR) SIM.t = 0; SIM.jugando = !SIM.jugando; refrescarSim(); if (SIM.jugando) requestAnimationFrame(a => { ultimo = a; requestAnimationFrame(cuadro); }); }
  let ultimo = 0;
  function cuadro(ahora) {
    if (!SIM.jugando) return;
    SIM.t = Math.min(SIM.DUR, SIM.t + Math.min(0.05, (ahora - ultimo) / 1000) * SIM.velocidad); ultimo = ahora;
    if (SIM.t >= SIM.DUR) SIM.jugando = false;
    refrescarSim();
    if (SIM.jugando) requestAnimationFrame(cuadro);
  }
  function dibujarSim(tz) {
    const h = SIM.V.h.val, xf = SIM.V.v0.val * SIM.DUR, t = SIM.t;
    encuadre(tz, { x0: -0.7, x1: Math.max(3, xf + 0.4), y0: -0.15, y1: h + 0.2 }, 24);
    const s0 = estado(t), huecos = [[...tz.vista.P([s0.x, s0.y]), G.particula], ...SIM.eventos.filter(e => e.t <= t + 1e-9 || e === SIM.eventos[0]).map(e => [...tz.vista.P([e.x, e.y]), 7])];
    tz.cuadricula(); tz.ejes({ x: 'x', y: 'y', huecos }); suelo(tz);
    tz.cota([-0.35, 0], [-0.35, h], { texto: 'h', desplazamiento: 0 });
    tz.trayectoria(muestras(q => { const s = estado(q); return [s.x, s.y]; }, 0, SIM.DUR, 600), 'prevista');
    if (t > 0) tz.trayectoria(muestras(q => { const s = estado(q); return [s.x, s.y]; }, 0, t, Math.max(4, Math.ceil(t * 240))), 'real');
    for (let k = 0; k * 0.1 < t - 1e-9; k++) { const s = estado(k * 0.1); tz.fantasma([s.x, s.y]); }
    const c = tz.ctx;
    SIM.eventos.filter(e => e.t > t + 1e-9).slice(0, 3).forEach(e => { c.save(); c.globalAlpha = 0.45; tz.eventoAnillo([e.x, e.y]); c.restore(); });
    SIM.eventos.filter(e => e.t <= t + 1e-9).forEach(e => tz.eventoAnillo([e.x, e.y]));
    const e1 = SIM.eventos[0];
    if (e1) {
      // Ficha en el hueco sobre el primer choque, entre el primer arco y el segundo
      const [px, py] = tz.vista.P([e1.x, e1.y]), [fx, fy] = tz.vista.P([e1.x + 0.14, h + 0.12]);
      tz.ficha(fx, fy, [[ui('Choque'), num(' · ', 11.5, 'texto-3'), sim('t'), num(' = ' + cantidad(e1.t, 's'))], [num('Energía perdida ' + cantidad(e1.perdida, 'J', 3), 11.5)]], { ancla: [px + 6, py - 5] });
    }
    const s = estado(t);
    if (s.fase === 'en vuelo') tz.vector([s.x, s.y], [0, -SIM.V.g.val], { desdeRadio: RP, familia: 'cambio', escalaPx: 0.035 * tz.vista.escala, simbolo: 'g' });
    tz.vector([s.x, s.y], [s.vx, s.vy], { desdeRadio: RP, familia: 'movimiento', escalaPx: 0.13 * tz.vista.escala, simbolo: 'v', valor: Math.hypot(s.vx, s.vy), unidad: 'm/s' });
    tz.particula([s.x, s.y], { etiqueta: 'Bola' });
    tz.barraEscala(tz.w - 120, tz.h - 18);
  }
  function iniciarSim() {
    simular(); construirVariables();
    lt = new V.LineaTiempo($('#lt'), { duracion: SIM.DUR, eventos: [], alCambiar: nt => { SIM.t = nt; SIM.jugando = false; refrescarSim(); } });
    lzSim = lienzo('#lz-sim', dibujarSim);
    $('#lt-play').addEventListener('click', alternarSim);
    $('#lt-reiniciar').addEventListener('click', () => { SIM.t = 0; SIM.jugando = false; refrescarSim(); });
    $('#lt-vel').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) SIM.velocidad = parseFloat(b.dataset.v); });
    // Para capturas: ?t=1.2 fija el instante y ?reproducir arranca la simulación
    const q = new URLSearchParams(location.search);
    if (q.has('t')) SIM.t = Math.max(0, Math.min(SIM.DUR, parseFloat(q.get('t')) || 0));
    recalcularSim();
    if (q.has('reproducir')) alternarSim();
  }

  // Miniaturas de escenarios y lienzo con flotantes
  function dibujarEscena(tz, cual) {
    if (cual === 'pendiente') {
      const h = 1.6, L = 2.3;
      encuadre(tz, { x0: -0.9, x1: 4.2, y0: -0.2, y1: 2.2 }, 10);
      tz.superficie([[-3, h], [0, h], [L, 0], [8, 0]]);
      const f = proyectil([0, h], [2.6, 0]);
      tz.trayectoria(muestras(f, 0, 0.42), 'prevista');
      tz.vector([0, h], [2.6, 0], { desdeRadio: RP, familia: 'movimiento', escalaPx: 0.32 * tz.vista.escala, simbolo: 'v' });
      tz.particula([0, h]);
      tz.angulo([L, 0], Math.PI - Math.atan2(h, L), Math.PI, { radio: 22, texto: 'θ' });
    } else if (cual === 'pendulo') {
      encuadre(tz, { x0: -1.4, x1: 1.4, y0: -1.35, y1: 0.2 }, 10);
      tz.superficie([[1.2, 0], [-1.2, 0]]);
      const th = 0.55, p = [Math.sin(th), -Math.cos(th)];
      tz.lineaPx([tz.vista.P([0, 0]), tz.vista.P([0, -1.15])], { color: 'texto-3', grosor: 1, patron: 'eje', extremo: 'butt' });
      tz.linea(muestras(a => [Math.sin(a), -Math.cos(a)], -th, th, 40), { color: 'texto-3', grosor: G.previsto, patron: 'previsto', extremo: 'butt' });
      tz.cuerda([0, 0], p); tz.pivote([0, 0]);
      tz.angulo([0, 0], -Math.PI / 2, -Math.PI / 2 + th, { radio: 30, texto: 'θ' });
      tz.particula(p);
    } else if (cual === 'cargas') {
      encuadre(tz, { x0: -1.6, x1: 1.6, y0: -0.7, y1: 0.7 }, 10);
      tz.carga([-1.1, 0], 1); tz.carga([1.1, 0], -1);
      tz.vector([-1.1, 0], [1, 0], { desdeRadio: RC, familia: 'interaccion', escalaPx: 0.42 * tz.vista.escala, simbolo: 'F' });
      tz.vector([1.1, 0], [-1, 0], { desdeRadio: RC, familia: 'interaccion', escalaPx: 0.42 * tz.vista.escala, simbolo: 'F' });
    } else {
      encuadre(tz, { x0: -0.2, x1: 2.6, y0: -0.25, y1: 1.0 }, 10);
      tz.superficie([[0, 0.9], [0, 0], [4, 0]]);
      tz.resorte([0, 0.25], [1.3, 0.25]);
      tz.cuerpo(rect(1.3, 0, 0.5, 0.5), { centroMasa: [1.55, 0.25] });
      tz.vector([1.8, 0.25], [1, 0], { familia: 'movimiento', escalaPx: 0.4 * tz.vista.escala, simbolo: 'v' });
    }
  }
  function iniciarFlotantes() {
    const it = lienzo('#lz-flot', tz => {
      encuadre(tz, { x0: -0.5, x1: 4.5, y0: -0.3, y1: 1.4 }, 30);
      const f = proyectil([0, 1], [2.4, 1.2]), p = f(0.3);
      tz.cuadricula(); tz.ejes({ x: 'x', y: 'y', huecos: [[...tz.vista.P(p), G.particula]] }); suelo(tz);
      tz.trayectoria(muestras(f, 0.3, (1.2 + Math.sqrt(1.44 + 19.6)) / 9.8), 'prevista'); tz.trayectoria(muestras(f, 0, 0.3), 'real'); tz.vector(p, [2.4, 1.2 - 9.8 * 0.3], { desdeRadio: RP, familia: 'movimiento', escalaPx: 0.25 * tz.vista.escala, simbolo: 'v' });
      tz.particula(p); tz.barraEscala(170, tz.h - 22);
    });
    it.el.addEventListener('pointermove', ev => {
      const r = it.el.getBoundingClientRect(), v = it.tz.vista;
      $('#flot-x').textContent = cantidad(v.mx(ev.clientX - r.left), 'm', 4); $('#flot-y').textContent = cantidad(v.my(ev.clientY - r.top), 'm', 4);
    });
  }

  // =====================================================================
  // 12. Gramática del lienzo
  // =====================================================================
  const CAPAS = ['Fondo y cuadrícula', 'Mapas de campo', 'Geometría fija', 'Medios y regiones', 'Construcción', 'Materia', 'Magnitudes', 'Instrumentos', 'Anotaciones', 'Edición'];
  const capasOn = CAPAS.map(() => true);
  function dibujarCapas(tz) {
    encuadre(tz, { x0: -0.6, x1: 7.6, y0: -0.3, y1: 2.5 }, 22);
    const k = tz.vista.escala, c = tz.ctx, on = i => capasOn[i];
    const tq = { x0: 4.7, x1: 7.2, y1: 1.6, agua: 1.15 };
    if (on(0)) tz.cuadricula();
    if (on(1)) { // presión hidrostática: más oscuro con la profundidad
      const [x0, y0] = tz.vista.P([tq.x0, tq.agua]), [x1, y1] = tz.vista.P([tq.x1, 0]);
      const gr = c.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, css(mezcla(tz.t.lienzo, tz.t.tinta, 0.02))); gr.addColorStop(1, css(mezcla(tz.t.lienzo, tz.t.tinta, 0.26)));
      c.fillStyle = gr; c.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    if (on(2)) { tz.superficie([[-0.35, 1.3], [-0.35, 0], [tq.x0, 0]]); tz.superficie([[tq.x0, tq.y1], [tq.x0, 0], [tq.x1, 0], [tq.x1, tq.y1]]); }
    if (on(3)) {
      const [x0, y0] = tz.vista.P([tq.x0, tq.agua]), [x1, y1] = tz.vista.P([tq.x1, 0]);
      c.save(); c.fillStyle = css(mezcla(tz.t.lienzo, tz.t.tinta, 0.06)); c.fillRect(x0, y0, x1 - x0, y1 - y0); c.restore();
      tz.lineaPx([[x0, y0], [x1, y0]], { color: 'texto-3', grosor: 1 });
      [[0.2, 7], [0.45, 13], [0.7, 7]].forEach(([fx, d]) => { const x = x0 + (x1 - x0) * fx; tz.lineaPx([[x - 9, y0 + d], [x + 9, y0 + d]], { color: 'texto-3', grosor: 1 }); });
    }
    const f = proyectil([2.1, 0.02], [2.3, 4.6]), ahora = 0.52, bola = f(ahora);
    if (on(4)) {
      tz.trayectoria(muestras(f, 0, 0.98), 'prevista'); tz.trayectoria(muestras(f, 0, ahora), 'real');
      for (let q = 0.1; q < ahora - 0.02; q += 0.1) tz.fantasma(f(q));
      tz.cota([-0.35, -0.02], [0.95, -0.02], { texto: [sim('x', 14)], desplazamiento: -18 });
      tz.angulo([2.1, 0.02], 0, Math.atan2(4.6, 2.3), { radio: 28, texto: 'α' });
    }
    if (on(5)) {
      tz.resorte([-0.35, 0.22], [0.95, 0.22]);
      tz.cuerpo(rect(0.95, 0, 0.55, 0.45), { centroMasa: [1.225, 0.225] });
      tz.particula(bola);
    }
    if (on(6)) {
      tz.vector(bola, [2.3, 4.6 - 9.8 * ahora], { desdeRadio: RP, familia: 'movimiento', escalaPx: 0.2 * k, simbolo: 'v' });
      tz.vector([0.95, 0.38], [-1, 0], { familia: 'interaccion', escalaPx: 0.42 * k, simbolo: 'F', sub: 'e', subRecto: true });
    }
    if (on(7)) { // fotopuerta: dos postes y el haz auxiliar
      const [gx, gy0] = tz.vista.P([3.7, 1.05]), [, gy1] = tz.vista.P([3.7, 2.15]);
      tz.lineaPx([[gx - 4, gy0], [gx - 4, gy0 - 10]], { grosor: 3 }); tz.lineaPx([[gx - 4, gy1], [gx - 4, gy1 + 10]], { grosor: 3 });
      tz.lineaPx([[gx - 4, gy0 - 12], [gx - 4, gy1 + 12]], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
      tz.ficha(gx + 8, gy1 - 6, [[ui('Fotopuerta')], [sim('t'), num(' = 0.412' + ESP + 's')]]);
    }
    if (on(8)) { const [ax, ay] = tz.vista.P([5.95, 1.95]); tz.compuesto([ui('Agua · ', 12, 'texto-2'), sim('ρ', 14, 'texto-2'), num(' = 1000' + ESP + 'kg/m³', 11.5, 'texto-2')], ax, ay, { alinear: 'center' }); }
    if (on(9)) {
      const [x0, y0] = tz.vista.P([0.95, 0.45]), [x1, y1] = tz.vista.P([1.5, 0]);
      tz.seleccionCaja(x0, y0, x1 - x0, y1 - y0);
      tz.guia([[x0 - 5, y1 + 14], [x0 - 5, y0 - 30]], null);
    }
  }
  function construirCapas() {
    const lista = $('#g-capas-lista');
    lista.innerHTML = '<div class="panel-cab" style="padding:0;height:28px">Capas, de abajo arriba</div>' + CAPAS.map((n, i) =>
      `<label class="casilla"><input type="checkbox" data-capa="${i}" checked>${n}<span class="n">${i + 1}</span></label>`).join('');
    const it = lienzo('#lz-capas', dibujarCapas);
    lista.addEventListener('change', ev => { const i = ev.target.dataset.capa; if (i != null) { capasOn[+i] = ev.target.checked; pintar(it); } });
  }

  // Tarjetas de la gramática: lienzo + regla en una frase + API
  let zoomEscala = 120, hoverBloque = false;
  const GRAMATICA = {
    geometria: [
      ['Superficie fija', 'Línea de materia con rayado a 45° del lado sólido: rayas de 1 px cada 6 px y 10 px de profundidad.', ['tz.superficie(pts, { lado })'], tz => {
        encuadre(tz, { x0: -0.4, x1: 6.2, y0: -0.35, y1: 2.4 }, 16);
        tz.superficie([[-1, 0], [1.0, 0], [3.0, 1.25], [3.8, 1.25], [3.8, 0], [5.6, 0], [5.6, 2.3]]);
        [['suelo', 0.3, -0.32], ['plano inclinado', 1.6, 0.95], ['pared', 5.25, 1.6]].forEach(([s, x, y]) => { const [a, b] = tz.vista.P([x, y]); nota(tz, s, a, b, { alinear: 'center' }); });
      }],
      ['Apoyo y pivote', 'Triángulo con base rayada; el pivote es un círculo de 4 px de radio con su centro marcado.', ['tz.apoyo(p)', 'tz.pivote(p)'], tz => {
        encuadre(tz, { x0: -0.3, x1: 5.6, y0: -0.2, y1: 2.3 }, 16);
        tz.cuerpo(rect(0.1, 0.95, 2.6, 0.14), { centroMasa: [1.4, 1.02] }); tz.apoyo([1.0, 0.95]);
        tz.superficie([[5.4, 2.1], [3.6, 2.1]]);
        const p = [4.5 + Math.sin(0.5) * 1.5, 2.1 - Math.cos(0.5) * 1.5];
        tz.lineaPx([tz.vista.P([4.5, 2.1]), tz.vista.P([4.5, 0.4])], { color: 'texto-3', grosor: 1, patron: 'eje', extremo: 'butt' });
        tz.cuerda([4.5, 2.1], p); tz.pivote([4.5, 2.1]); tz.particula(p);
      }],
    ],
    materia: [
      ['Partícula', 'Disco lleno de tinta de 6 px de radio en pantalla: no escala con el zoom.', ['tz.particula(p, { etiqueta })'], tz => {
        const mitad = tz.w / 2, c = tz.ctx;
        [[0, 60, '100 %'], [mitad, 240, '400 %']].forEach(([x0, esc, et]) => {
          c.save(); c.beginPath(); c.rect(x0, 0, mitad, tz.h); c.clip();
          tz.vista.escala = esc; tz.vista.ox = x0 + mitad / 2; tz.vista.oy = tz.h / 2 + 10;
          tz.cuadricula(); tz.particula([0, 0], { etiqueta: 'Bola' });
          c.restore(); nota(tz, 'Zoom ' + et, x0 + 12, 22);
        });
        tz.lineaPx([[mitad + 0.5, 0], [mitad + 0.5, tz.h]], { color: 'linea-suave', grosor: 1 });
      }],
      ['Cuerpo rígido', 'Relleno de --campo, contorno de materia y centro de masa con su símbolo, aunque caiga fuera del cuerpo.', ['tz.cuerpo(pts, { centroMasa })'], tz => {
        encuadre(tz, { x0: -0.3, x1: 5.3, y0: -0.3, y1: 1.6 }, 16); suelo(tz);
        tz.cuerpo(rect(0.2, 0, 1.1, 0.8), { centroMasa: [0.75, 0.4] });
        const disco = muestras(a => [2.55 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)], 0, 2 * Math.PI, 48); tz.cuerpo(disco, { centroMasa: [2.55, 0.5] });
        tz.cuerpo([[3.6, 0], [4.8, 0], [4.8, 0.3], [3.9, 0.3], [3.9, 1.0], [3.6, 1.0]], { centroMasa: [4.034 - 0.0, 0.334] });
      }],
      ['Resorte', 'Zigzag de 8 dientes con tramos rectos de 6 px en los extremos; comprimido o estirado conserva sus dientes.', ['tz.resorte(p1, p2)'], tz => {
        encuadre(tz, { x0: -0.3, x1: 5.6, y0: -0.1, y1: 2.0 }, 14);
        tz.superficie([[0, 1.95], [0, 0]]);
        [[1.6, 0.25, 'comprimido'], [2.6, 0.95, 'natural'], [3.8, 1.65, 'estirado']].forEach(([L, y, n]) => {
          tz.resorte([0, y], [L, y]); tz.cuerpo(rect(L, y - 0.2, 0.4, 0.4));
          const [a, b] = tz.vista.P([L + 0.55, y]); nota(tz, n, a, b + 4);
        });
      }],
      ['Cuerda', '1.5 px en --texto-2. Tensa es recta; floja sigue una catenaria.', ['tz.cuerda(p1, p2)'], tz => {
        encuadre(tz, { x0: -0.3, x1: 5.4, y0: -0.2, y1: 2.2 }, 14);
        tz.superficie([[2.0, 2.1], [-0.2, 2.1]]); tz.cuerda([0.9, 2.1], [0.9, 0.6]); tz.pivote([0.9, 2.1]); tz.particula([0.9, 0.6]);
        const a = 0.9, cx = 3.85, cy = 0.55 - a; tz.linea(muestras(x => [x, a * Math.cosh((x - cx) / a) + cy], 2.8, 4.9, 60), { color: 'texto-2', grosor: G.real });
        tz.pivote([2.8, a * Math.cosh((2.8 - cx) / a) + cy]); tz.pivote([4.9, a * Math.cosh((4.9 - cx) / a) + cy]);
        const [x1, y1] = tz.vista.P([0.9, 0.2]), [x2, y2] = tz.vista.P([3.85, 0.2]); nota(tz, 'tensa', x1, y1, { alinear: 'center' }); nota(tz, 'floja', x2, y2, { alinear: 'center' });
      }],
      ['Cargas', 'Disco de 9 px: positiva llena de tinta con «+», negativa con contorno de tinta y «−». El signo es un glifo, no un color.', ['tz.carga(p, ±1, { etiqueta })'], tz => {
        encuadre(tz, { x0: -1.6, x1: 2.6, y0: -0.6, y1: 0.7 }, 14);
        tz.carga([-0.9, 0], 1, { etiqueta: [sim('q', 14), sub('1', 9.5, null, true), num(' = +2.0' + ESP + 'µC', 11.5, 'texto-2')] });
        tz.carga([1.1, 0], -1, { etiqueta: [sim('q', 14), sub('2', 9.5, null, true), num(' = −1.0' + ESP + 'µC', 11.5, 'texto-2')] });
      }],
      ['Polea y fijación', 'La polea es un círculo con eje y soporte; aún no tiene método propio en la gramática.', ['por implementar: tz.polea()'], tz => {
        encuadre(tz, { x0: -0.6, x1: 4.6, y0: -0.2, y1: 2.2 }, 14);
        tz.superficie([[3.4, 2.1], [0.6, 2.1]]);
        const c = [2, 1.45], r = 0.35, [px, py] = tz.vista.P(c), R = r * tz.vista.escala;
        tz.lineaPx([tz.vista.P([2, 2.1]), [px, py]], { grosor: G.materia });
        const ctx = tz.ctx; ctx.save(); ctx.fillStyle = tz.t.campo; ctx.strokeStyle = tz.t.tinta; ctx.lineWidth = G.materia; ctx.beginPath(); ctx.arc(px, py, R, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); ctx.restore();
        tz.cuerda([2 - r, 1.45], [2 - r, 0.5]); tz.cuerda([2 + r, 1.45], [2 + r, 0.8]); tz.pivote(c);
        tz.cuerpo(rect(2 - r - 0.22, 0.1, 0.44, 0.4)); tz.cuerpo(rect(2 + r - 0.17, 0.48, 0.34, 0.32));
      }],
    ],
    magnitudes: [
      ['Vectores por familia', 'Trazo de 2.25 px con punta llena; el color dice la familia y el símbolo, la magnitud.', ['tz.vector(p, v, { familia, simbolo })'], tz => {
        pantalla(tz);
        const fam = [['movimiento', 'v'], ['cambio', 'a'], ['interaccion', 'F'], ['inercia', 'p'], ['electrico', 'E'], ['magnetico', 'B'], ['corriente', 'I'], ['termico', 'Φ']];
        const cw = (tz.w - 32) / 4;
        fam.forEach(([f, s], i) => { const x = 22 + (i % 4) * cw, y = i < 4 ? 82 : 168; tz.vector(W(x, y), [3, 1.9], { familia: f, escalaPx: 20, simbolo: s }); });
      }],
      ['Componentes', 'Discontinuo 4 · 3 de 1.25 px con punta pequeña, del color del vector y con su subíndice en cursiva.', ['tz.vector(p, v, { componentes: true, subX, subY })'], tz => {
        encuadre(tz, { x0: -0.4, x1: 4.4, y0: -0.3, y1: 2.3 }, 14); tz.cuadricula();
        const p = [0.6, 0.35], v = [3.2, 2.2];
        tz.vector(p, v, { desdeRadio: RP, familia: 'movimiento', escalaPx: 0.85 * tz.vista.escala, simbolo: 'v', valor: Math.hypot(...v), unidad: 'm/s', componentes: true, subX: true, subY: true });
        tz.angulo(p, 0, Math.atan2(v[1], v[0]), { radio: 34, texto: 'α' });
        tz.particula(p);
      }],
      ['Vector aplicado a un cuerpo', 'Nace en el borde del cuerpo, no en su centro, para no tapar la materia ni sus signos: una flecha sobre el «−» lo hace parecer «+».', ['tz.vector(p, v, { desdeRadio })'], tz => {
        encuadre(tz, { x0: -0.4, x1: 4.6, y0: -0.75, y1: 1.1 }, 14);
        const k = tz.vista.escala;
        tz.vector([1.2, -0.3], [0, 1], { familia: 'interaccion', escalaPx: 0.75 * k, simbolo: 'F', desdeRadio: RC }); tz.carga([1.2, -0.3], -1);
        tz.carga([3.4, -0.3], -1); tz.vector([3.4, -0.3], [0, 1], { familia: 'interaccion', escalaPx: 0.75 * k, simbolo: 'F' });
        const [a, b] = tz.vista.P([1.2, -0.68]), [c2, d] = tz.vista.P([3.4, -0.68]);
        nota(tz, 'desde el borde', a, b, { alinear: 'center' }); nota(tz, 'desde el centro: tapa el signo', c2, d, { alinear: 'center' });
      }],
      ['Vectores casi paralelos', 'Dos vectores del mismo punto casi paralelos se dibujan lado a lado, separados 3.5 px.', ['por implementar en tz.vector()'], tz => {
        encuadre(tz, { x0: -0.4, x1: 4.6, y0: -0.5, y1: 1.0 }, 14);
        const p = [0.6, 0.1], k = tz.vista.escala, ang = 0.18, n = [-Math.sin(ang), Math.cos(ang)], d = 3.5 / 2 / k;
        tz.vector([p[0] + n[0] * d, p[1] + n[1] * d], [Math.cos(ang), Math.sin(ang)], { familia: 'movimiento', escalaPx: 1.5 * k, simbolo: 'v', desdeRadio: RP });
        tz.vector([p[0] - n[0] * d, p[1] - n[1] * d], [Math.cos(ang), Math.sin(ang)], { familia: 'inercia', escalaPx: 1.1 * k, simbolo: 'p', desdeRadio: RP });
        tz.particula(p);
        const [a, b] = tz.vista.P([0.6, -0.35]); nota(tz, 'separados 3.5 px, sin solaparse', a, b);
      }],
    ],
    construccion: [
      ['Cotas', 'Línea de 1 px con flechas abiertas y líneas de referencia; el símbolo en cursiva o el valor con su unidad.', ['tz.cota(p1, p2, { texto, desplazamiento })'], tz => {
        encuadre(tz, { x0: -0.4, x1: 5.4, y0: -0.75, y1: 1.7 }, 14); suelo(tz);
        tz.cuerpo(rect(0.4, 0, 1.6, 0.9), { centroMasa: [1.2, 0.45] });
        tz.cota([0.4, 0.9], [2.0, 0.9], { texto: 'L', desplazamiento: -14 });
        tz.cota([2.0, 0], [2.0, 0.9], { texto: [num('0.90' + ESP, 11.5), ui('m', 11.5, 'texto-3')], desplazamiento: 24 });
        tz.superficie([[2.9, 0], [5.0, 1.3]]);
        tz.cota([2.9, 0], [5.0, 1.3], { texto: 's', desplazamiento: 20 });
      }],
      ['Ángulos', 'Arco de 1 px en --texto-2 con el símbolo del ángulo.', ['tz.angulo(c, a0, a1, { texto, radio })'], tz => {
        encuadre(tz, { x0: -0.3, x1: 5.4, y0: -0.25, y1: 2.0 }, 14);
        tz.superficie([[-0.5, 0], [0.4, 0], [3.0, 1.5], [3.0, 0], [6, 0]]);
        tz.angulo([0.4, 0], 0, Math.atan2(1.5, 2.6), { radio: 40, texto: 'θ' });
        const p = [4.0, 0.5]; tz.lineaPx([tz.vista.P(p), tz.vista.P([5.3, 0.5])], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
        tz.vector(p, [1, 1.2], { desdeRadio: RP, familia: 'movimiento', escalaPx: 0.85 * tz.vista.escala, simbolo: 'v' });
        tz.angulo(p, 0, Math.atan2(1.2, 1), { radio: 28, texto: 'α' }); tz.particula(p);
      }],
      ['Trayectoria real y prevista', 'Real: continua de 1.5 px en --texto-2. Prevista: discontinua 6 · 4 en --texto-3.', ['tz.trayectoria(pts, "real" | "prevista")'], tz => {
        encuadre(tz, { x0: -0.3, x1: 4.6, y0: -0.2, y1: 1.6 }, 14); suelo(tz);
        const f = proyectil([0, 0.4], [3.2, 3.6]), t = 0.42;
        tz.trayectoria(muestras(f, 0, 0.84), 'prevista'); tz.trayectoria(muestras(f, 0, t), 'real'); tz.particula(f(t));
        const [a, b] = tz.vista.P(f(0.2)), [c2, d] = tz.vista.P(f(0.7)); nota(tz, 'real', a - 8, b, { alinear: 'right' }); nota(tz, 'prevista', c2 + 10, d);
      }],
      ['Estroboscopio', 'Una imagen cada Δt como contorno tenue; solo la posición actual va llena.', ['tz.fantasma(p)'], tz => {
        encuadre(tz, { x0: -0.3, x1: 4.6, y0: -0.2, y1: 1.6 }, 14); suelo(tz);
        const f = proyectil([0, 0.4], [3.2, 3.6]), t = 0.72;
        tz.trayectoria(muestras(f, 0, t), 'real');
        for (let q = 0; q < t - 0.02; q += 0.08) tz.fantasma(f(q));
        tz.particula(f(t)); nota(tz, 'Δt = 0.08 s', 14, 22);
      }],
      ['Cuadrícula, ejes y escala', 'Pasos 1-2-5 que se adaptan al zoom; números de eje en Plex Mono con halo, nunca debajo de un objeto, y siempre una barra de escala.', ['tz.cuadricula()', 'tz.ejes({ x, y, huecos })', 'tz.barraEscala(x, y)'], tz => {
        tz.vista.escala = zoomEscala; tz.vista.ox = 46; tz.vista.oy = tz.h - 30;
        const paso = V.pasoAgradable(90 / zoomEscala), p = [paso * 2, 0], [px, py] = tz.vista.P(p);
        tz.cuadricula(); tz.ejes({ x: 'x', y: 'y', huecos: [[px, py, G.particula]] });
        tz.particula(p); tz.barraEscala(tz.w - 40 - V.pasoAgradable(80 / zoomEscala) * zoomEscala, 30);
      }, 'escala'],
      ['Estado futuro de un objeto', 'Contorno discontinuo 6 · 4, sin relleno: algo que todavía no está, como una pesa que se pondrá más adelante.', ['patron: "previsto"'], tz => {
        encuadre(tz, { x0: -0.4, x1: 4.6, y0: -0.3, y1: 1.6 }, 14); suelo(tz);
        tz.cuerpo(rect(0.6, 0, 1.2, 0.5), { centroMasa: [1.2, 0.25] });
        tz.linea(rect(0.85, 0.5, 0.7, 0.45), { color: 'tinta', grosor: G.materia, patron: 'previsto', cerrar: true, extremo: 'butt' });
        tz.cuerpo(rect(2.8, 0, 1.2, 0.5), { centroMasa: [3.4, 0.25] }); tz.cuerpo(rect(3.05, 0.5, 0.7, 0.45), { centroMasa: [3.4, 0.725] });
        const [a, b] = tz.vista.P([1.2, 1.25]), [c2, d] = tz.vista.P([3.4, 1.25]); nota(tz, 'antes: la pesa se pondrá', a, b, { alinear: 'center' }); nota(tz, 'después', c2, d, { alinear: 'center' });
      }],
      ['Ejes de simetría y proyecciones', 'Raya y punto para ejes y normales; punteado para proyecciones y construcciones auxiliares.', ['patron: "eje"', 'patron: "auxiliar"'], tz => {
        encuadre(tz, { x0: -0.6, x1: 5.0, y0: -0.3, y1: 2.0 }, 14);
        const tri = [[0.2, 0], [1.8, 0], [1.0, 1.4]]; tz.cuerpo(tri);
        tz.lineaPx([tz.vista.P([1.0, -0.2]), tz.vista.P([1.0, 1.8])], { color: 'texto-3', grosor: 1, patron: 'eje', extremo: 'butt' });
        tz.superficie([[2.4, 0.2], [4.8, 1.4]]);
        const m = [3.6, 0.8], n = [-1.2 / Math.hypot(2.4, 1.2) * 0.9, 2.4 / Math.hypot(2.4, 1.2) * 0.9];
        tz.lineaPx([tz.vista.P(m), tz.vista.P([m[0] + n[0], m[1] + n[1]])], { color: 'texto-3', grosor: 1, patron: 'eje', extremo: 'butt' });
        const p = [2.8, 1.75]; tz.particula(p);
        const [px, py] = tz.vista.P(p), [, y0] = tz.vista.P([0, 0.2]);
        tz.lineaPx([[px, py], [px, y0 + 6]], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
      }],
    ],
    etiquetas: [
      ['Etiqueta con halo', 'Toda etiqueta sobre el lienzo lleva un halo de 3 px del color del lienzo, pintado detrás del texto.', ['tz.etiquetaMagnitud(x, y, { simbolo, valor, unidad })'], tz => {
        encuadre(tz, { x0: -0.3, x1: 4.6, y0: -0.2, y1: 1.6 }, 14); tz.cuadricula();
        const f = proyectil([0, 0.2], [3.0, 3.6]); tz.trayectoria(muestras(f, 0, 0.8), 'prevista');
        const [a, b] = tz.vista.P([0.9, 0.8]);
        tz.etiquetaMagnitud(a, b, { simbolo: 'v', valor: 4.96, unidad: 'm/s', color: 'movimiento' });
        const [c2, d] = tz.vista.P([2.6, 0.62]);
        tz.compuesto([sim('v', 14, 'movimiento'), num(' = 4.960' + ESP + 'm/s', 11.5, 'texto-2')], c2, d, { halo: false });
        const [e, g] = tz.vista.P([0.9, 0.48]), [h2, i2] = tz.vista.P([2.6, 0.3]); nota(tz, 'con halo', e, g); nota(tz, 'sin halo', h2, i2);
      }],
      ['Ficha con línea guía', 'Fondo --panel, borde --linea, radio 5 y separación de 6 × 4 px, con una línea guía de 1 px hacia el punto.', ['tz.ficha(x, y, lineas, { ancla })'], tz => {
        encuadre(tz, { x0: -0.3, x1: 4.6, y0: -0.2, y1: 1.6 }, 14); suelo(tz);
        const p = [1.2, 0.6]; tz.particula(p); const [x, y] = tz.vista.P(p);
        tz.ficha(x + 70, y - 52, [[ui('Bola'), num(' · ', 11.5, 'texto-3'), sim('t'), num(' = 0.5716' + ESP + 's')], [num('(2.286, 1.399)' + ESP + 'm')], [sim('E', 13), sub('k', 9, null, true), num(' = 4.000' + ESP + 'J')]], { ancla: [x + 7, y - 4] });
      }],
    ],
    edicion: [
      ['Selección y asas', 'Contorno discontinuo 3 · 3 de tinta a 5 px del objeto y asas cuadradas de 7 px con relleno de lienzo.', ['tz.seleccionCaja(x, y, w, h)', 'tz.asa(x, y)'], tz => {
        encuadre(tz, { x0: -0.3, x1: 4.6, y0: -0.3, y1: 1.6 }, 14); suelo(tz);
        tz.cuerpo(rect(1.0, 0, 1.6, 0.9), { centroMasa: [1.8, 0.45] });
        const [x0, y0] = tz.vista.P([1.0, 0.9]), [x1, y1] = tz.vista.P([2.6, 0]); tz.seleccionCaja(x0, y0, x1 - x0, y1 - y0);
      }],
      ['Partícula y asa de vector', 'La partícula seleccionada lleva un círculo discontinuo; el asa de un vector es un círculo de 5 px en la punta.', ['tz.seleccionCirculo(x, y, r)', 'tz.asaVector(x, y, activa)'], tz => {
        encuadre(tz, { x0: -0.3, x1: 4.6, y0: -0.2, y1: 1.6 }, 14); suelo(tz);
        const p = [0.8, 0.5]; const [ex, ey] = tz.vector(p, [2.4, 1.3], { desdeRadio: RP, familia: 'movimiento', escalaPx: 0.75 * tz.vista.escala, simbolo: 'v' });
        tz.particula(p, { seleccionada: true }); tz.asaVector(ex, ey, false);
        const q = [3.4, 0.4]; const [fx, fy] = tz.vector(q, [0.9, 1.4], { desdeRadio: RP, familia: 'movimiento', escalaPx: 0.6 * tz.vista.escala }); tz.particula(q); tz.asaVector(fx, fy, true);
        nota(tz, 'arrastrando', fx + 10, fy + 18);
      }],
      ['Guía de ajuste', 'Línea punteada de --texto-3 con el valor del ajuste en una ficha.', ['tz.guia(pts, texto)'], tz => {
        encuadre(tz, { x0: -0.3, x1: 4.6, y0: -0.2, y1: 1.6 }, 14); tz.cuadricula(); suelo(tz);
        const p = [0.8, 0.4], [bx, by] = tz.vista.P(p);
        const [ex, ey] = tz.vector(p, [Math.cos(0.611) * 2.4, Math.sin(0.611) * 2.4], { desdeRadio: RP, familia: 'movimiento', escalaPx: 0.85 * tz.vista.escala, simbolo: 'v' });
        tz.particula(p); tz.asaVector(ex, ey, true);
        tz.guia([[bx, by], [bx + 190, by]], null);
        tz.ficha(ex + 16, ey + 12, [[sim('α'), num(' = 35°')], [sim('v'), sub('0', 9, null, true), num(' = 2.40' + ESP + 'm/s')]]);
      }],
      ['Selección de una región', 'En regiones limitadas por paredes (un gas, un émbolo) el contorno va hacia dentro en los lados donde hay pared.', ['tz.seleccionRegion(X, Y, W, H, { dentroX, dentroY })'], tz => {
        encuadre(tz, { x0: -0.4, x1: 4.6, y0: -0.3, y1: 1.85 }, 14);
        tz.superficie([[0.8, 1.5], [0.8, 0], [3.8, 0], [3.8, 1.5]]);
        const c = tz.ctx; const [gx0, gy0] = tz.vista.P([0.8, 1.0]), [gx1, gy1] = tz.vista.P([3.8, 0]);
        let sem = 7; const azar = () => (sem = (sem * 16807) % 2147483647) / 2147483647;
        c.save(); c.fillStyle = tz.t['texto-2']; for (let i = 0; i < 46; i++) { c.beginPath(); c.arc(gx0 + 6 + azar() * (gx1 - gx0 - 12), gy0 + 6 + azar() * (gy1 - gy0 - 12), 1.25 + azar() * 0.75, 0, 2 * Math.PI); c.fill(); } c.restore();
        tz.cuerpo(rect(0.8, 1.0, 3.0, 0.16));
        tz.seleccionRegion(gx0, gy0, gx1 - gx0, gy1 - gy0, { dentroX: true, dentroY: true });
        const [a, b] = tz.vista.P([2.3, 1.68]); nota(tz, 'gas: la selección no se monta sobre las paredes', a, b, { alinear: 'center' });
      }],
      ['Hover', 'El objeto bajo el puntero se engrosa 0.5 px; nada cambia de color. Pasa el puntero por el bloque.', ['contorno + 0.5 px'], tz => {
        encuadre(tz, { x0: -0.3, x1: 4.6, y0: -0.3, y1: 1.6 }, 14); suelo(tz);
        const pts = rect(1.4, 0, 1.6, 0.9); tz.cuerpo(pts, { centroMasa: [2.2, 0.45] });
        if (hoverBloque) tz.lineaPx(pts.map(p => tz.vista.P(p)), { grosor: G.materia + 0.5, cerrar: true });
        nota(tz, hoverBloque ? 'con el puntero encima: 2.5 px' : 'en reposo: 2 px', 14, 22);
      }, 'hover'],
    ],
    eventos: [
      ['Evento en el lienzo', 'Anillo de 7 px con un rombo y la ficha del evento. Los eventos futuros, atenuados.', ['tz.eventoAnillo(p)'], tz => {
        encuadre(tz, { x0: -0.3, x1: 4.8, y0: -0.25, y1: 1.6 }, 14); suelo(tz);
        const g = 9.8, tc = Math.sqrt(2 * 1.2 / g), vx = 1.1, vr = 0.6 * g * tc;
        const pos = t => t <= tc ? [vx * t, 1.2 - g * t * t / 2] : [vx * t, vr * (t - tc) - g * (t - tc) ** 2 / 2];
        tz.trayectoria(muestras(pos, 0, tc + 2 * vr / g, 120), 'prevista'); tz.trayectoria(muestras(pos, 0, tc + 0.25, 80), 'real');
        const [ex, ey] = tz.eventoAnillo(pos(tc)); tz.ctx.save(); tz.ctx.globalAlpha = 0.45; tz.eventoAnillo(pos(tc + 2 * vr / g)); tz.ctx.restore();
        tz.ficha(ex + 22, ey - 58, [[ui('Choque con el suelo')], [sim('t'), num(' = ' + cantidad(tc, 's'))]], { ancla: [ex + 6, ey - 5] });
        tz.particula(pos(tc + 0.25));
      }],
      ['Evento en la línea de tiempo', 'Rombo de 8 px en --tinta sobre el riel; en las gráficas, sobre el eje del tiempo.', ['Volta.rombo(ctx, x, y, s, color)'], tz => {
        pantalla(tz);
        const m = 24, w = tz.w - 2 * m, y = 70, c = tz.ctx;
        c.fillStyle = tz.t['campo-activo']; c.beginPath(); c.roundRect(m, y - 2, w, 4, 2); c.fill();
        c.fillStyle = tz.t.tinta; c.beginPath(); c.roundRect(m, y - 2, w * 0.42, 4, 2); c.fill();
        [0.165, 0.39, 0.55, 0.66, 0.73].forEach(f => rombo(c, m + w * f, y - 9, 3.5, f === 0.39 ? tz.t.tinta : tz.t['texto-2']));
        const xh = m + w * 0.39; c.font = '500 11px "IBM Plex Sans", sans-serif'; const txt = 'Choque con el suelo · 0.4949 s', tw = c.measureText(txt).width;
        c.fillStyle = tz.t.tinta; c.beginPath(); c.roundRect(xh + 8, y - 27, tw + 12, 18, 4); c.fill();
        c.fillStyle = tz.t['sobre-tinta']; c.textBaseline = 'middle'; c.fillText(txt, xh + 14, y - 18);
        const xc = m + w * 0.42; c.strokeStyle = tz.t.tinta; c.lineWidth = 1.5; c.beginPath(); c.moveTo(xc, y - 12); c.lineTo(xc, y + 8); c.stroke();
        c.fillStyle = tz.t.lienzo; c.beginPath(); c.arc(xc, y, 6, 0, 2 * Math.PI); c.fill(); c.stroke();
        const yg = 150; tz.lineaPx([[m, yg + 0.5], [m + w, yg + 0.5]], { color: 'eje', grosor: 1 });
        [0.165, 0.39, 0.55].forEach(f => rombo(c, m + w * f, yg, 3.5, tz.t.tinta));
        nota(tz, 'Línea de tiempo', m, 30); nota(tz, 'Eje del tiempo de una gráfica', m, yg - 18);
      }],
    ],
  };
  function construirGramatica() {
    for (const [grupo, tarjetas] of Object.entries(GRAMATICA)) {
      const cont = $(`[data-lienzos="${grupo}"]`); if (!cont) continue;
      tarjetas.forEach(([titulo, regla, api, dibujo, extra]) => {
        const t = document.createElement('div'); t.className = 'g-lienzo-tarjeta';
        const control = extra === 'escala' ? `<div class="control"><span>Zoom</span><input class="deslizador" type="range" min="20" max="600" step="1" value="${zoomEscala}" aria-label="Escala"><span class="num"></span></div>` : '';
        t.innerHTML = `<canvas></canvas>${control}<div class="g-regla"><b>${titulo}</b><p>${regla}</p><div class="api">${api.map(a => `<code>${a}</code>`).join('')}</div></div>`;
        cont.appendChild(t);
        const it = lienzo($('canvas', t), dibujo);
        if (extra === 'escala') {
          const d = $('input', t), n = $('.control .num', t);
          const ver = () => { n.textContent = `1 m = ${Math.round(zoomEscala)}${ESP}px`; V.pintarDeslizador(d); };
          d.addEventListener('input', () => { zoomEscala = +d.value; ver(); pintar(it); }); ver();
        }
        if (extra === 'hover') {
          it.el.addEventListener('pointermove', ev => {
            const r = it.el.getBoundingClientRect(), v = it.tz.vista, x = v.mx(ev.clientX - r.left), y = v.my(ev.clientY - r.top);
            const dentro = x >= 1.4 && x <= 3.0 && y >= 0 && y <= 0.9;
            if (dentro !== hoverBloque) { hoverBloque = dentro; it.el.style.cursor = dentro ? 'move' : 'default'; pintar(it); }
          });
          it.el.addEventListener('pointerleave', () => { if (hoverBloque) { hoverBloque = false; pintar(it); } });
        }
      });
    }
    construirDominios();
  }

  // Convenciones de la tabla 7.3 fuera del núcleo. El estado se comprueba
  // leyendo trazo.js y los dominios: [elemento, cómo se dibuja, [[archivo, método], …]]
  const CONVENCIONES = [
    ['Polea', 'Círculo con eje y soporte', [['trazo.js', 'polea']]],
    ['Cuerda floja', 'Curva catenaria de 1.5 px en --texto-2', [['trazo.js', 'catenaria'], ['trazo.js', 'cuerdaFloja']]],
    ['Fluido, baño térmico y líquidos', 'Tinte del 6 % de tinta con rayas cortas bajo la superficie; el recipiente es superficie fija', [['dominios/termodinamica.js', 'fluidoPx'], ['dominios/termodinamica.js', 'bano']]],
    ['Gas y moléculas', 'Discos de 2.5 a 4 px en --texto-2; su densidad y agitación siguen a V y T', [['dominios/termodinamica.js', 'moleculas']]],
    ['Pared adiabática', 'Doble línea con relleno de rayado; la pared conductora, línea simple', [['dominios/termodinamica.js', 'paredes']]],
    ['Calentador', 'Zigzag de resistencia en tinta; el calor que entrega lleva el color', [['dominios/termodinamica.js', 'calentador']]],
    ['Flujo de calor', 'Vector de la familia térmico con etiqueta Φ y subíndice descriptivo', [['dominios/termodinamica.js', 'flechaCalor'], ['dominios/termodinamica.js', 'etiquetaCalor']]],
    ['Estado futuro de un objeto', 'Contorno discontinuo 6 · 4', [['dominios/termodinamica.js', 'pesa']]],
    ['Líneas de campo eléctrico', '1 px en la familia eléctrico, punta de 7 × 6 px a mitad de línea; número proporcional a |q|', [['dominios/electrostatica.js', 'lineasCampo']]],
    ['Equipotenciales', '1 px discontinuas 4 · 3 en la familia eléctrico; valor en Plex Mono 11 px con halo', [['dominios/electrostatica.js', 'equipotenciales'], ['dominios/electrostatica.js', 'etiquetasEquipotenciales']]],
    ['Mapas de campo', 'Grises, divergente y familia; vectores y textos encima con halo', [['dominios/electrostatica.js', 'mapaPotencial']]],
    ['Sonda de campo', 'Anillo de 7 px con retícula a 45° y ficha con las lecturas', [['dominios/electrostatica.js', 'sonda']]],
    ['Hover', 'El objeto bajo el puntero se engrosa 0.5 px', [['dominios/electrostatica.js', 'contornoHover']]],
    ['Conductor', 'Relleno --campo-activo con rayado cruzado fino', [['dominios/electrostatica.js', 'conductor']]],
    ['Dieléctrico', 'Relleno de puntos regulares', [['dominios/electrostatica.js', 'dielectrico']]],
    ['Región de campo perpendicular', 'Borde discontinuo de la familia y rejilla de ⊙ o ⊗ cada 32 px', [['dominios/magnetismo.js', 'regionCampo'], ['trazo.js', 'regionCampo']]],
    ['Imanes', 'N lleno de tinta con «N» en --sobre-tinta; S lleno de lienzo con «S» en tinta', [['dominios/magnetismo.js', 'iman']]],
    ['Componentes de circuito', 'Símbolos IEC en tinta; cables de 2 px y nodos con disco de 3 px', [['dominios/circuitos.js', 'componente']]],
    ['Vidrio y medios', 'Tinte del 5 % de tinta, contorno de 1 px y tres trazos diagonales en una esquina', [['dominios/optica.js', 'medio']]],
    ['Espejo', 'Línea de materia con rayado corto en la cara trasera', [['dominios/optica.js', 'espejo']]],
    ['Rayos', '1.5 px, color espectral de su λ o tinta si es luz blanca; flecha a mitad del tramo', [['dominios/optica.js', 'rayo']]],
    ['Frentes de onda', '1 px de tinta al 60 %, sin flecha', [['dominios/ondas.js', 'frentesOnda']]],
  ];
  async function construirDominios() {
    let archivos = [...new Set(CONVENCIONES.flatMap(c => c[2].map(r => r[0])))];
    // El servidor de prototipos lista los directorios: así no se piden dominios que aún no existen
    try {
      const r = await fetch('../lienzo/dominios/');
      if (r.ok && /html/.test(r.headers.get('content-type') || '')) {
        const hay = new Set([...(await r.text()).matchAll(/href="([^"?#/]+\.js)"/g)].map(m => 'dominios/' + decodeURIComponent(m[1])));
        archivos = archivos.filter(a => !a.startsWith('dominios/') || hay.has(a));
      }
    } catch { /* sin listado: se piden todos */ }
    const metodos = {};
    await Promise.all(archivos.map(async a => {
      metodos[a] = new Set();
      try {
        const r = await fetch('../lienzo/' + a); if (!r.ok) return;
        const txt = await r.text();
        const re = a === 'trazo.js' ? /^ {4}(\w+)\s*\([^)]*\)\s*\{/gm : /\bP\.(\w+)\s*=/g;
        for (const m of txt.matchAll(re)) metodos[a].add(m[1]);
      } catch { /* sin servidor */ }
    }));
    let resueltas = 0;
    const filas = CONVENCIONES.map(([e, c, refs]) => {
      const hay = refs.filter(([a, m]) => metodos[a] && metodos[a].has(m));
      if (hay.length) resueltas++;
      const donde = hay.length ? hay.map(([a, m]) => `<code>${a} · ${m}()</code>`).join(' ') : `<span class="tenue">${refs[0][0]}</span>`;
      return `<tr><td style="color:var(--texto)">${e}</td><td>${c}</td><td>${donde}</td><td>${hay.length ? '<span class="chip lleno">Resuelta</span>' : '<span class="chip">Pendiente</span>'}</td></tr>`;
    });
    // Métodos definidos en más de un archivo: si se cargan juntos, el último reemplaza al anterior
    const choques = [], todos = new Map();
    for (const [a, set] of Object.entries(metodos)) for (const m of set) todos.set(m, [...(todos.get(m) || []), a]);
    for (const [m, en] of todos) if (en.length > 1 && !m.startsWith('_') && m !== 'constructor') choques.push(`<code>${m}()</code> en ${en.map(x => `<code>${x}</code>`).join(' y ')}`);
    $('#g-pendientes').innerHTML = `<thead><tr><th>Elemento</th><th>Cómo se dibuja según el contrato</th><th>Dónde</th><th>Estado</th></tr></thead><tbody>${filas.join('')}</tbody>` +
      (choques.length ? `<tfoot><tr><td colspan="4" style="color:var(--aviso)">${icono('i-aviso')} Mismo método en varios archivos: ${choques.join('; ')}. Si se cargan juntos, el último reemplaza al anterior.</td></tr></tfoot>` : '');
    $('#l-pendientes .g-desc').insertAdjacentHTML('beforeend', ` Resueltas: ${resueltas} de ${CONVENCIONES.length}.`);
  }

  // =====================================================================
  // 13. Plantillas: esquemas acotados con la propia gramática
  // =====================================================================
  // Medidas de la estructura leídas del CSS calculado (--est-*)
  function estructura() {
    const cs = getComputedStyle(raiz), v = n => parseFloat(cs.getPropertyValue('--est-' + n)) || 0;
    return { barra: v('barra'), izq: v('panel-izq'), der: v('panel-der'), inf: v('panel-inf') };
  }
  function dibujarPlantillaEspacio(tz) {
    pantalla(tz);
    const E = estructura(), AW = 1440, AH = 900, mI = 64, mS = 46, s = Math.min((tz.w - mI - 40) / AW, (tz.h - mS - 34) / AH);
    const ox = mI + (tz.w - mI - 40 - AW * s) / 2, oy = mS;
    const xL = E.izq, xD = AW - E.der, yL = E.barra, yI = AH - E.inf;   // bordes del lienzo
    const P = (x, y) => [ox + x * s, oy + y * s];
    const R = (x, y, w, h, rel, bor) => { const [a, b] = P(x, y); caja(tz, a, b, w * s, h * s, rel, bor); };
    R(0, 0, AW, AH, 'fondo', 'linea');
    R(0, 0, AW, yL, 'panel', 'linea-suave'); R(0, yL, xL, AH - yL, 'panel', 'linea-suave'); R(xD, yL, E.der, AH - yL, 'panel', 'linea-suave');
    R(xL, yI, xD - xL, E.inf, 'panel', 'linea-suave'); R(xL, yL, xD - xL, yI - yL, 'lienzo', 'linea-suave');
    // Contenido esquemático de bajo contraste
    const barra = (x, y, l, col = 'linea') => { const [a, b] = P(x, y); caja(tz, a, b, l * s, Math.max(3, 8 * s), col, null, 2); };
    const [mx, my] = P(14, 13); tz.compuesto([ui('Volta', 11, 'texto')], mx, my + 9);
    barra(110, 18, 220); barra(380, 18, 260); const [px, py] = P(650, 9); caja(tz, px, py, 36 * s, 26 * s, 'tinta', null, 3);
    barra(700, 18, 120); barra(1220, 18, 180);
    for (let i = 0; i < 4; i++) { barra(14 + (i % 2) * (xL / 2), yL + 20 + Math.floor(i / 2) * 40, xL / 2 - 30); barra(xD + 14, yL + 76 + i * 40, 150 + (i % 2) * 90); }
    for (let i = 0; i < 6; i++) { barra(20, 320 + i * 30, 120 + (i % 3) * 30); barra(xD + 14, 420 + i * 34, E.der - 44); }
    barra(xL + 16, yI + 38, xD - xL - 32, 'campo-activo');
    const gw = (xD - xL - 32 - 24) / 3;
    for (let i = 0; i < 3; i++) { const [a, b] = P(xL + 16 + i * (gw + 12), yI + 78); caja(tz, a, b, gw * s, (E.inf - 98) * s, 'lienzo', 'linea-suave', 4); }
    // Lienzo con la física: el mayor contraste
    const [lx, ly] = P(xL, yL), L = { x: lx, y: ly, w: (xD - xL) * s, h: (yI - yL) * s };
    const c = tz.ctx, vista = { ...tz.vista }; c.save(); c.beginPath(); c.rect(L.x, L.y, L.w, L.h); c.clip();
    tz.vista.encuadrar({ x0: -1.2, x1: 5.4, y0: -0.5, y1: 2.6 }, L, 20);
    tz.cuadricula(); tz.superficie([[-3, 1.6], [0, 1.6], [2.3, 0], [9, 0]]);
    const f = proyectil([0, 1.6], [3.2, 0]); tz.trayectoria(muestras(f, 0.22, (Math.sqrt(2 * 9.8 * 1.6)) / 9.8 * 0.9), 'prevista'); tz.trayectoria(muestras(f, 0, 0.22), 'real');
    tz.vector(f(0.22), [3.2, -9.8 * 0.22], { desdeRadio: RP, familia: 'movimiento', escalaPx: 0.3 * tz.vista.escala, simbolo: 'v' }); tz.particula(f(0.22));
    c.restore(); Object.assign(tz.vista, vista);
    // Etiquetas de región
    [['Barra superior', 1260, 30], ['Panel izquierdo', 20, 290], ['Lienzo', xL + 16, yL + 32], ['Panel derecho', xD + 14, yL + 32], ['Panel inferior', xL + 16, yI + 24]].forEach(([t, x, y]) => {
      const [a, b] = P(x, y); tz.texto(t, a, b, { tam: 11, peso: 500, color: 'texto-2', halo: true });
    });
    // Cotas: vista con y hacia arriba en píxeles de la aplicación
    tz.vista.escala = s; tz.vista.ox = ox; tz.vista.oy = oy + AH * s;
    const M = (x, y) => [x, AH - y], T = n => [num(String(n), 11, 'texto-2')];
    tz.cota(M(xL, 0), M(0, 0), { texto: T(E.izq), desplazamiento: 14 });
    tz.cota(M(xD, 0), M(xL, 0), { texto: [ui('flexible', 11, 'texto-3')], desplazamiento: 14 });
    tz.cota(M(AW, 0), M(xD, 0), { texto: T(E.der), desplazamiento: 14 });
    tz.cota(M(0, 0), M(0, yL), { texto: T(E.barra), desplazamiento: 16 });
    tz.cota(M(0, yL), M(0, AH), { texto: [ui('flexible', 11, 'texto-3')], desplazamiento: 16 });
    tz.cota(M(xD - 16, yI), M(xD - 16, AH), { texto: T(E.inf), desplazamiento: 0 });
    const [qx, qy] = P(AW, AH); tz.texto('1440 × 900 px', qx, qy + 20, { fuente: 'num', tam: 11, color: 'texto-3', alinear: 'right' });
  }

  function dibujarPlantillaInicio(tz) {
    pantalla(tz);
    const AW = 1440, AH = 900, gap = 64, mI = 48, s = Math.min((tz.w - mI * 2 - gap) / 2 / AW, (tz.h - 70) / AH);
    const x0 = (tz.w - (2 * AW * s + gap)) / 2;
    const bloques = [['Inicio', x0], ['Biblioteca', x0 + AW * s + gap]];
    bloques.forEach(([nombre, ox]) => {
      const oy = 40, P = (x, y) => [ox + x * s, oy + y * s];
      const R = (x, y, w, h, rel, bor, r = 0) => { const [a, b] = P(x, y); caja(tz, a, b, w * s, h * s, rel, bor, r); };
      const barra = (x, y, l, col = 'linea', alto = 10) => { const [a, b] = P(x, y); caja(tz, a, b, l * s, Math.max(3, alto * s), col, null, 2); };
      tz.texto(nombre, ox, oy - 14, { tam: 12, peso: 600, color: 'texto' });
      R(0, 0, AW, AH, 'fondo', 'linea'); R(0, 0, AW, 44, 'panel', 'linea-suave');
      barra(16, 17, 90, 'linea-fuerte'); barra(1220, 17, 200);
      if (nombre === 'Inicio') {
        for (let i = 0; i < 9; i++) { const col = i % 5, fila = Math.floor(i / 5); R(120 + col * 244, 130 + fila * 176, 228, 160, 'panel', 'linea-suave', 4); const [a, b] = P(140 + col * 244, 150 + fila * 176); tz.ctx.save(); tz.ctx.strokeStyle = tz.t.texto; tz.ctx.lineWidth = 1; tz.ctx.beginPath(); tz.ctx.arc(a + 20 * s, b + 20 * s, 20 * s, 0, 2 * Math.PI); tz.ctx.stroke(); tz.ctx.restore(); barra(140 + col * 244, 210 + fila * 176, 120, 'linea-fuerte'); barra(140 + col * 244, 236 + fila * 176, 180); }
        for (let i = 0; i < 4; i++) { R(120 + i * 304, 560, 288, 250, 'panel', 'linea-suave', 4); R(120 + i * 304, 560, 288, 170, 'lienzo', 'linea-suave', 4); barra(136 + i * 304, 748, 180, 'linea-fuerte'); barra(136 + i * 304, 776, 120); }
        [['Módulos', 120, 118], ['Recientes', 120, 550]].forEach(([t, x, y]) => { const [a, b] = P(x, y); tz.texto(t, a, b, { tam: 11, peso: 500, color: 'texto-2', halo: true }); });
      } else {
        const iz = estructura().izq, cw = (AW - iz - 64 - 48) / 4;
        R(0, 44, iz, 856, 'panel', 'linea-suave');
        for (let i = 0; i < 12; i++) barra(20, 76 + i * 36, 120 + (i % 3) * 30);
        for (let i = 0; i < 12; i++) { const col = i % 4, fila = Math.floor(i / 4); const x = iz + 32 + col * (cw + 16), y = 76 + fila * 270; R(x, y, cw, 250, 'panel', 'linea-suave', 4); R(x, y, cw, 170, 'lienzo', 'linea-suave', 4); barra(x + 16, y + 188, 170, 'linea-fuerte'); barra(x + 16, y + 216, 110); }
        [['Filtros', 20, 66], ['Escenarios', iz + 32, 66]].forEach(([t, x, y]) => { const [a, b] = P(x, y); tz.texto(t, a, b, { tam: 11, peso: 500, color: 'texto-2', halo: true }); });
      }
      tz.vista.escala = s; tz.vista.ox = ox; tz.vista.oy = oy + AH * s;
      tz.cota([0, AH], [0, AH - 44], { texto: [num('44', 11, 'texto-2')], desplazamiento: 14 });
    });
    // Miniaturas en los lienzos de las tarjetas de escenario
  }

  // =====================================================================
  // 14. Navegación: sección activa y subíndice abierto
  // =====================================================================
  function iniciarNav() {
    const enlaces = $$('.g-nav a[href^="#"]');
    const objetivos = enlaces.map(a => ({ a, el: document.getElementById(a.getAttribute('href').slice(1)) })).filter(o => o.el);
    let pendiente = false;
    function actualizar() {
      pendiente = false;
      const linea = parseFloat(getComputedStyle(raiz).getPropertyValue('--est-barra')) + 40;
      let actual = null;
      for (const o of objetivos) if (o.el.getBoundingClientRect().top <= linea) actual = o;
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) actual = objetivos[objetivos.length - 1];
      const seccion = actual && (actual.el.closest('[data-seccion]') || actual.el);
      enlaces.forEach(a => a.removeAttribute('aria-current'));
      $$('.g-nav li').forEach(li => li.classList.remove('abierta'));
      if (!actual) return;
      const principal = enlaces.find(a => a.getAttribute('href') === '#' + seccion.id);
      if (principal) { principal.setAttribute('aria-current', 'true'); principal.parentElement.classList.add('abierta'); }
      if (actual.a !== principal) actual.a.setAttribute('aria-current', 'true');
      const nav = $('.g-nav'), r = (actual.a.getBoundingClientRect()), rn = nav.getBoundingClientRect();
      if (r.top < rn.top + 40 || r.bottom > rn.bottom - 40) nav.scrollTop += r.top - rn.top - rn.height / 3;
    }
    window.addEventListener('scroll', () => { if (!pendiente) { pendiente = true; requestAnimationFrame(actualizar); } }, { passive: true });
    actualizar();
    return actualizar;
  }

  // =====================================================================
  // 15. Arranque
  // =====================================================================
  async function fuentes() {
    try {
      await Promise.all([
        document.fonts.load('italic 14px "STIX Two Text"', 'vgFEBIQpaθαλρ'), document.fonts.load('14px "STIX Two Text"', 'k0AB12'),
        document.fonts.load('12px "IBM Plex Mono"', '0123456789−.×'), document.fonts.load('500 12px "IBM Plex Sans"', 'Choque'), document.fonts.load('600 12px "IBM Plex Sans"', 'Volta'),
        document.fonts.load('12px "IBM Plex Sans"', 'suelo'),
      ]);
      await document.fonts.ready;
    } catch { /* se dibuja con las fuentes de respaldo */ }
  }

  // Rellena [data-token="est-panel-izq"] con el valor calculado del token: «264 px»
  function rellenarTokens() {
    const cs = getComputedStyle(raiz);
    $$('[data-token]').forEach(el => { el.textContent = parseFloat(cs.getPropertyValue('--' + el.dataset.token)) + ESP + 'px'; });
  }

  // La barra superior de ejemplo mide 1440 px como en la aplicación; se reduce para caber
  function escalarBarra() {
    const b = $('.g-barra-viva'), w = b && b.parentElement.clientWidth; if (!w) return;
    b.style.zoom = Math.min(1, w / 1440);
  }

  function temaIcono() { $('#b-tema').innerHTML = icono(raiz.dataset.tema === 'oscuro' ? 'i-tema-claro' : 'i-tema-oscuro'); }

  // Ayuda para capturas: ?solo=color,c-botones muestra solo esas secciones o subsecciones
  function aplicarSolo() {
    const solo = new URLSearchParams(location.search).get('solo');
    if (!solo) return;
    const ids = new Set(solo.split(','));
    $$('.g-portada, .g-seccion').forEach(sec => {
      if (ids.has(sec.id)) return;
      const subs = $$('.g-sub', sec).filter(s => ids.has(s.id));
      if (!subs.length) { sec.hidden = true; return; }
      $$('.g-sub, .g-principio', sec).forEach(s => { s.hidden = !ids.has(s.id); });
    });
  }

  async function iniciar() {
    aplicarSolo();
    asegurarIconos();
    rellenarTokens(); escalarBarra();
    const simbolo = inyectarSimbolo();
    await cargarTokens();
    construirColor(); construirISO(); construirGeometria(); construirIconos();
    iniciarMenus(); iniciarComandos(); iniciarDialogo(); iniciarArbol(); iniciarExpresion(); iniciarFlotantes();
    construirCapas(); construirGramatica();

    lienzo('#lz-portada', dibujarPortada);
    lienzo('#lz-p1', dibujarP1); lienzo('#lz-p2', dibujarP2); lienzo('#lz-p4', dibujarP4);
    lienzo('#lz-p5a', tz => dibujarP5(tz, 'a')); lienzo('#lz-p5b', tz => dibujarP5(tz, 'b')); lienzo('#lz-p5c', tz => dibujarP5(tz, 'c'));
    lienzo('#lz-rc1', dibujarRC1); lienzo('#lz-rc2', dibujarRC2); lienzo('#lz-rc3', dibujarRC3); lienzo('#lz-rc5', dibujarRC5);
    $$('canvas[data-mapa]').forEach(c => lienzo(c, tz => dibujarRampa(tz, c.dataset.mapa, c.dataset.tema), { tema: c.dataset.tema }));
    lienzo('#lz-mapa', dibujarMapa);
    $$('canvas[data-escena]').forEach(c => lienzo(c, tz => dibujarEscena(tz, c.dataset.escena)));
    lienzo('#lz-plantilla-espacio', dibujarPlantillaEspacio);
    lienzo('#lz-plantilla-inicio', dibujarPlantillaInicio);

    // Datos de la portada
    const nIconos = window.VoltaIconos && window.VoltaIconos.nombres ? (Array.isArray(window.VoltaIconos.nombres) ? window.VoltaIconos.nombres.length : Object.values(window.VoltaIconos.nombres).flat().length) : null;
    $('#g-datos').innerHTML = [
      '5 principios', '15 neutros', '9 familias físicas', (TOK ? Object.keys(TOK.tipografia.escala).length : 8) + ' tamaños de texto',
      '10 capas de lienzo', nIconos ? nIconos + ' iconos' : 'Iconos en preparación', 'Tema ' + (raiz.dataset.tema === 'oscuro' ? 'oscuro' : 'claro'),
    ].map((t, i, a) => `<span class="chip${i === a.length - 1 ? '' : ' suave'}" ${i === a.length - 1 ? 'id="g-dato-tema"' : ''}>${t}</span>`).join('');

    await Promise.all([fuentes(), simbolo]);
    pintarTodo();
    iniciarSim();
    temaIcono();

    V.alCambiarTema(() => { temaIcono(); $('#g-dato-tema').textContent = 'Tema ' + (raiz.dataset.tema === 'oscuro' ? 'oscuro' : 'claro'); pintarTodo(); refrescarSim(); });
    let rz = 0; window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { escalarBarra(); pintarTodo(); refrescarSim(); }); });
    $('#g-pest').addEventListener('click', () => setTimeout(pintarTodo, 0));
    window.addEventListener('load', asegurarIconos);

    // Con el contenido ya construido, vuelve al ancla pedida (capturas y enlaces)
    const actualizarNav = iniciarNav();
    const destino = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (destino) { destino.scrollIntoView({ block: 'start' }); actualizarNav(); }
    document.body.dataset.listo = '1';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
