/* ==========================================================================
   Volta — gramática del lienzo (núcleo)
   Implementa la sección 7 de docs/04_lenguaje_de_diseno.md sobre Canvas 2D.
   Todos los colores salen de los tokens CSS; los grosores y tamaños, de aquí.
   Los dominios (electrostática, termodinámica…) añaden símbolos en
   sistema/lienzo/dominios/<modulo>.js extendiendo Volta.Trazo.prototype.
   ========================================================================== */
import { ESP, fmt, fmtMarca, cantidad, conPrefijo, pasoAgradable } from '../nucleo/formato.js';

(function (global) {
  'use strict';

  // ---------------------------------------------------------------------
  // Tokens
  // ---------------------------------------------------------------------
  const FAMILIAS = ['movimiento', 'cambio', 'interaccion', 'inercia', 'electrico', 'magnetico', 'corriente', 'termico'];

  function leerTokens() {
    const cs = getComputedStyle(document.documentElement);
    const g = n => cs.getPropertyValue('--' + n).trim();
    const t = {};
    ['lienzo', 'fondo', 'panel', 'campo', 'campo-hover', 'campo-activo', 'linea-suave', 'linea', 'linea-fuerte',
      'texto-4', 'texto-3', 'texto-2', 'texto', 'tinta', 'sobre-tinta', 'error', 'cuadricula-menor', 'cuadricula-mayor', 'eje',
      'mapa-divergente-negativo', 'mapa-divergente-positivo'].forEach(k => { t[k] = g(k); });
    t.f = {}; t.tinte = {};
    FAMILIAS.forEach(f => { t.f[f] = g('f-' + f); t.tinte[f] = g('f-' + f + '-tinte'); });
    return t;
  }

  // Grosores y medidas de la gramática (px de pantalla, no escalan con el zoom)
  const G = {
    materia: 2, real: 1.5, previsto: 1.5, auxiliar: 1, cota: 1, vector: 2.25, componente: 1.25,
    particula: 6, carga: 9, asa: 7, halo: 3, rayadoPaso: 6, rayadoProf: 10,
  };
  const PATRON = {
    continuo: [], previsto: [6, 4], auxiliar: [1.5, 3], componente: [4, 3], eje: [10, 3, 2, 3], seleccion: [3, 3],
  };
  const FUENTE = {
    sim: (px) => `italic ${px}px "STIX Two Text", "Cambria Math", Georgia, serif`,
    simRecta: (px) => `${px}px "STIX Two Text", "Cambria Math", Georgia, serif`,
    num: (px) => `${px}px "IBM Plex Mono", Consolas, monospace`,
    ui: (px, peso = 400) => `${peso} ${px}px "IBM Plex Sans", "Segoe UI", sans-serif`,
  };

  // ---------------------------------------------------------------------
  // Formato de cantidades (ISO 80000)
  // ---------------------------------------------------------------------
  // ---------------------------------------------------------------------
  // Vista: mundo (m, y hacia arriba) ↔ pantalla (px, y hacia abajo)
  // ---------------------------------------------------------------------
  class Vista {
    constructor() { this.escala = 100; this.ox = 0; this.oy = 0; }
    X(x) { return this.ox + this.escala * x; }
    Y(y) { return this.oy - this.escala * y; }
    P(p) { return [this.X(p[0]), this.Y(p[1])]; }
    mx(px) { return (px - this.ox) / this.escala; }
    my(py) { return (this.oy - py) / this.escala; }
    // Encaja la caja de mundo {x0,x1,y0,y1} dentro del rectángulo de pantalla {x,y,w,h}
    encuadrar(caja, r, margen = 32) {
      const sx = (r.w - 2 * margen) / (caja.x1 - caja.x0);
      const sy = (r.h - 2 * margen) / (caja.y1 - caja.y0);
      this.escala = Math.min(sx, sy);
      this.ox = r.x + r.w / 2 - this.escala * (caja.x0 + caja.x1) / 2;
      this.oy = r.y + r.h / 2 + this.escala * (caja.y0 + caja.y1) / 2;
    }
    zoom(factor, px, py) {
      const wx = this.mx(px), wy = this.my(py);
      this.escala *= factor;
      this.ox = px - this.escala * wx;
      this.oy = py + this.escala * wy;
    }
  }

  // ---------------------------------------------------------------------
  // Trazo
  // ---------------------------------------------------------------------
  class Trazo {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.vista = new Vista();
      this.t = leerTokens();
      this.w = 0; this.h = 0;
    }

    // Ajusta el búfer a la densidad de píxeles y relee los tokens del tema
    ajustar() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = global.devicePixelRatio || 1;
      this.w = r.width; this.h = r.height;
      this.canvas.width = Math.round(r.width * dpr);
      this.canvas.height = Math.round(r.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.t = leerTokens();
    }
    temas() { this.t = leerTokens(); }
    color(familiaOToken) {
      if (this.t.f[familiaOToken]) return this.t.f[familiaOToken];
      return this.t[familiaOToken] || familiaOToken;
    }

    limpiar() {
      const c = this.ctx;
      c.save(); c.setLineDash([]);
      c.fillStyle = this.t.lienzo; c.fillRect(0, 0, this.w, this.h);
      c.restore();
    }

    // ------------------------------------------------ estilo de línea
    _estilo(o = {}) {
      const c = this.ctx;
      c.strokeStyle = this.color(o.color || 'tinta');
      c.lineWidth = o.grosor || G.materia;
      c.setLineDash(PATRON[o.patron || 'continuo'] || []);
      c.lineCap = o.patron === 'auxiliar' ? 'round' : (o.extremo || 'round');
      c.lineJoin = 'round';
      c.globalAlpha = o.opacidad == null ? 1 : o.opacidad;
    }

    // Polilínea en coordenadas de pantalla
    lineaPx(pts, o = {}) {
      if (pts.length < 2) return;
      const c = this.ctx; c.save(); this._estilo(o);
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
      if (o.cerrar) c.closePath();
      c.stroke(); c.restore();
    }
    // Polilínea en coordenadas de mundo
    linea(ptsMundo, o) { this.lineaPx(ptsMundo.map(p => this.vista.P(p)), o); }

    // ------------------------------------------------ cuadrícula y ejes
    cuadricula() {
      const c = this.ctx, v = this.vista;
      const mayor = pasoAgradable(90 / v.escala);       // ~90 px entre líneas mayores
      const menor = mayor / (String(mayor).startsWith('2') ? 4 : 5);
      const x0 = v.mx(0), x1 = v.mx(this.w), y0 = v.my(this.h), y1 = v.my(0);
      c.save(); c.lineWidth = 1; c.setLineDash([]);
      for (const [paso, col] of [[menor, this.t['cuadricula-menor']], [mayor, this.t['cuadricula-mayor']]]) {
        c.strokeStyle = col; c.beginPath();
        for (let x = Math.ceil(x0 / paso) * paso; x <= x1; x += paso) { const X = Math.round(v.X(x)) + 0.5; c.moveTo(X, 0); c.lineTo(X, this.h); }
        for (let y = Math.ceil(y0 / paso) * paso; y <= y1; y += paso) { const Y = Math.round(v.Y(y)) + 0.5; c.moveTo(0, Y); c.lineTo(this.w, Y); }
        c.stroke();
      }
      c.restore();
      this._pasoMayor = mayor;
    }

    ejes(o = {}) {
      const c = this.ctx, v = this.vista, t = this.t;
      const paso = this._pasoMayor || pasoAgradable(90 / v.escala);
      const X0 = Math.round(v.X(0)) + 0.5, Y0 = Math.round(v.Y(0)) + 0.5;
      c.save(); c.strokeStyle = t.eje; c.lineWidth = 1; c.setLineDash([]);
      c.beginPath(); c.moveTo(0, Y0); c.lineTo(this.w, Y0); c.moveTo(X0, 0); c.lineTo(X0, this.h); c.stroke();
      c.restore();
      const x0 = v.mx(0), x1 = v.mx(this.w), y0 = v.my(this.h), y1 = v.my(0);
      const marca = n => fmtMarca(n, paso);
      // o.huecos: [[x, y, r] px] — zonas ocupadas por objetos donde no se escribe ningún número
      const tapado = (x, y) => (o.huecos || []).some(([hx, hy, hr]) => Math.hypot(x - hx, y - hy) < hr + 10);
      for (let x = Math.ceil(x0 / paso) * paso; x <= x1; x += paso) {
        if (Math.abs(x) < paso / 2 || v.X(x) > this.w - 60 || v.X(x) < 20 || tapado(v.X(x), Y0 + 10)) continue;
        this.texto(marca(x), v.X(x), Y0 + 5, { fuente: 'num', tam: 11, color: 'texto-3', alinear: 'center', base: 'top', halo: true });
      }
      for (let y = Math.ceil(y0 / paso) * paso; y <= y1; y += paso) {
        if (Math.abs(y) < paso / 2 || v.Y(y) < 34 || v.Y(y) > this.h - 12 || tapado(X0 - 14, v.Y(y))) continue;
        this.texto(marca(y), X0 - 6, v.Y(y), { fuente: 'num', tam: 11, color: 'texto-3', alinear: 'right', base: 'middle', halo: true });
      }
      // Las etiquetas de los ejes no van debajo de las barras flotantes del
      // lienzo (capas, zoom): se apartan de o.zonas o de las .flotante hermanas
      const zonas = o.zonas || this.zonasFlotantes();
      const choca = (x, y, w, h) => zonas.find(z => x < z.x + z.w && x + w > z.x && y < z.y + z.h && y + h > z.y);
      if (o.x) {
        let xd = this.w - 12, z;
        for (let i = 0; i < 4 && (z = choca(xd - 70, Y0 - 22, 70, 20)); i++) xd = z.x - 8;
        this.compuesto([{ t: o.x, f: 'sim', tam: 14 }, { t: ' (' + (o.ux || 'm') + ')', f: 'ui', tam: 11 }], xd, Y0 - 8, { color: 'texto-3', alinear: 'right' });
      }
      if (o.y) {
        let yb = 18, z;
        for (let i = 0; i < 4 && (z = choca(X0 + 8, yb - 14, 70, 20)); i++) yb = z.y + z.h + 18;
        this.compuesto([{ t: o.y, f: 'sim', tam: 14 }, { t: ' (' + (o.uy || 'm') + ')', f: 'ui', tam: 11 }], X0 + 8, yb, { color: 'texto-3' });
      }
    }

    /** Rectángulos (px del lienzo) de las barras .flotante que hay sobre él. */
    zonasFlotantes() {
      const padre = this.canvas && this.canvas.parentElement;
      if (!padre || typeof padre.querySelectorAll !== 'function') return [];
      const r0 = this.canvas.getBoundingClientRect();
      return [...padre.querySelectorAll(':scope > .flotante')]
        .filter(el => !el.hidden && el.getClientRects().length)
        .map(el => { const r = el.getBoundingClientRect(); return { x: r.left - r0.left, y: r.top - r0.top, w: r.width, h: r.height }; });
    }

    // ------------------------------------------------ texto
    _fuente(f, tam, peso) { return f === 'sim' ? FUENTE.sim(tam) : f === 'simRecta' ? FUENTE.simRecta(tam) : f === 'num' ? FUENTE.num(tam) : FUENTE.ui(tam, peso); }

    texto(str, x, y, o = {}) {
      const c = this.ctx; c.save();
      c.font = this._fuente(o.fuente || 'ui', o.tam || 12, o.peso);
      c.textAlign = o.alinear || 'left'; c.textBaseline = o.base || 'alphabetic';
      c.setLineDash([]);
      if (o.halo) { c.lineWidth = G.halo * 2; c.lineJoin = 'round'; c.strokeStyle = this.t.lienzo; c.strokeText(str, x, y); }
      c.fillStyle = this.color(o.color || 'texto'); c.fillText(str, x, y);
      c.restore();
    }

    // Texto compuesto de segmentos con distinta fuente: [{t, f:'sim'|'num'|'ui', tam, dy, color}]
    compuesto(segs, x, y, o = {}) {
      const c = this.ctx; c.save(); c.setLineDash([]);
      c.textBaseline = o.base || 'alphabetic';
      let ancho = 0;
      for (const s of segs) { c.font = this._fuente(s.f, s.tam || 12); ancho += c.measureText(s.t).width; }
      const x0 = o.alinear === 'right' ? x - ancho : o.alinear === 'center' ? x - ancho / 2 : x;
      // Primero todos los halos y después todo el texto: así el halo de un
      // segmento nunca tapa al anterior (subíndices como P₀A).
      for (const pasada of o.halo === false ? ['texto'] : ['halo', 'texto']) {
        let cx = x0;
        for (const s of segs) {
          c.font = this._fuente(s.f, s.tam || 12);
          const yy = y + (s.dy || 0);
          if (pasada === 'halo') { c.lineWidth = G.halo * 2; c.lineJoin = 'round'; c.strokeStyle = this.t.lienzo; c.strokeText(s.t, cx, yy); }
          else { c.fillStyle = this.color(s.color || o.color || 'texto'); c.fillText(s.t, cx, yy); }
          cx += c.measureText(s.t).width;
        }
      }
      c.restore();
      return { x: x0, ancho };
    }

    // "v = 4.96 m/s" con símbolo en cursiva, subíndice opcional y valor en mono
    etiquetaMagnitud(x, y, { simbolo, sub, subRecto, valor, unidad, color, alinear, tam = 14, cifras, prefijo }) {
      const segs = [{ t: simbolo, f: 'sim', tam, color }];
      if (sub) segs.push({ t: sub, f: subRecto ? 'simRecta' : 'sim', tam: tam * 0.68, dy: 3, color });
      const txt = valor == null ? null : prefijo ? conPrefijo(valor, unidad, cifras) : cantidad(valor, unidad, cifras);
      if (txt != null) segs.push({ t: ' = ', f: 'num', tam: 11.5, color: 'texto-2' }, { t: txt, f: 'num', tam: 11.5, color: 'texto-2' });
      return this.compuesto(segs, x, y, { alinear });
    }

    // Ficha con línea guía: lineas = [segmentos] o strings
    ficha(x, y, lineas, o = {}) {
      const c = this.ctx; c.save(); c.setLineDash([]);
      const padX = 8, padY = 6, alto = 16;
      let ancho = 0;
      const filas = lineas.map(l => (typeof l === 'string' ? [{ t: l, f: 'num', tam: 11.5 }] : l));
      for (const segs of filas) {
        let w = 0; for (const s of segs) { c.font = this._fuente(s.f, s.tam || 11.5); w += c.measureText(s.t).width; }
        ancho = Math.max(ancho, w);
      }
      const W = ancho + 2 * padX, H = filas.length * alto + 2 * padY - 2;
      if (o.ancla) {
        c.strokeStyle = this.t['linea-fuerte']; c.lineWidth = 1;
        c.beginPath(); c.moveTo(o.ancla[0], o.ancla[1]);
        c.lineTo(x + (o.ancla[0] < x ? 0 : W), y + H / 2); c.stroke();
      }
      c.fillStyle = this.t.panel; c.strokeStyle = this.t.linea; c.lineWidth = 1;
      c.beginPath(); c.roundRect(x + 0.5, y + 0.5, W, H, 5); c.fill(); c.stroke();
      c.restore();
      filas.forEach((segs, i) => this.compuesto(segs, x + padX, y + padY + 11 + i * alto, { halo: false, color: i === 0 ? 'texto' : 'texto-2' }));
      return { w: W, h: H };
    }

    // ------------------------------------------------ flechas y vectores
    _punta(x1, y1, x2, y2, grosor, tipo = 'llena', color) {
      const c = this.ctx, ang = Math.atan2(y2 - y1, x2 - x1);
      if (tipo === 'llena') {
        const L = Math.max(9, 4.5 * grosor), A = Math.max(7, 3.5 * grosor) / 2;
        c.save(); c.setLineDash([]); c.fillStyle = color;
        c.translate(x2, y2); c.rotate(ang);
        c.beginPath(); c.moveTo(0, 0); c.lineTo(-L, A); c.lineTo(-L * 0.86, 0); c.lineTo(-L, -A); c.closePath(); c.fill();
        c.restore();
        return L * 0.86;
      }
      const L = 7;
      c.save(); c.setLineDash([]); c.strokeStyle = color; c.lineWidth = 1; c.lineCap = 'round';
      c.translate(x2, y2); c.rotate(ang);
      c.beginPath(); c.moveTo(-L, -3.2); c.lineTo(0, 0); c.lineTo(-L, 3.2); c.stroke();
      c.restore();
      return 0;
    }

    // Flecha en pantalla. o: {color, grosor, patron, punta:'llena'|'abierta'|'ninguna', ambas}
    flechaPx(x1, y1, x2, y2, o = {}) {
      const c = this.ctx, col = this.color(o.color || 'tinta'), w = o.grosor || G.vector;
      const largo = Math.hypot(x2 - x1, y2 - y1); if (largo < 0.5) return;
      const ux = (x2 - x1) / largo, uy = (y2 - y1) / largo;
      const recorte = (o.punta || 'llena') === 'llena' ? Math.min(largo, Math.max(9, 4.5 * w) * 0.86) : 0;
      c.save(); this._estilo({ ...o, color: col, grosor: w }); c.lineCap = 'butt';
      c.beginPath();
      const ini = o.ambas && o.punta === 'llena' ? recorte : 0;
      c.moveTo(x1 + ux * ini, y1 + uy * ini); c.lineTo(x2 - ux * recorte, y2 - uy * recorte); c.stroke();
      c.restore();
      if (o.punta !== 'ninguna') this._punta(x1, y1, x2, y2, w, o.punta || 'llena', col);
      if (o.ambas) this._punta(x2, y2, x1, y1, w, o.punta || 'llena', col);
    }

    // Vector físico anclado en un punto del mundo.
    // v en unidades físicas; escalaPx = píxeles por unidad física.
    // o.desdeRadio: radio en px del cuerpo al que se aplica; el vector nace en su
    // borde (no en el centro) para no tapar la materia ni sus signos.
    vector(pMundo, v, o = {}) {
      let [x, y] = this.vista.P(pMundo);
      const k = o.escalaPx || 20;
      const mod = Math.hypot(v[0], v[1]);
      if (o.desdeRadio && mod > 0) { x += v[0] / mod * o.desdeRadio; y -= v[1] / mod * o.desdeRadio; }
      const x2 = x + v[0] * k, y2 = y - v[1] * k;
      const col = o.familia || 'tinta';
      if (o.componentes) {
        this.flechaPx(x, y, x2, y, { color: col, grosor: G.componente, patron: 'componente', opacidad: 0.9 });
        this.flechaPx(x2, y, x2, y2, { color: col, grosor: G.componente, patron: 'componente', opacidad: 0.9 });
        if (o.subX) this.compuesto([{ t: o.simbolo, f: 'sim', tam: 13, color: col }, { t: 'x', f: 'sim', tam: 9, dy: 3, color: col }], (x + x2) / 2, y + (v[1] > 0 ? 15 : -7), { alinear: 'center' });
        if (o.subY) this.compuesto([{ t: o.simbolo, f: 'sim', tam: 13, color: col }, { t: 'y', f: 'sim', tam: 9, dy: 3, color: col }], x2 + 7, (y + y2) / 2 + 4);
      }
      this.flechaPx(x, y, x2, y2, { color: col, grosor: G.vector });
      if (o.simbolo) {
        const ang = Math.atan2(y2 - y, x2 - x);
        const lx = x2 + Math.cos(ang) * 10 + (Math.cos(ang) >= 0 ? 2 : -2);
        const ly = y2 + Math.sin(ang) * 10 + 5;
        this.etiquetaMagnitud(lx, ly, { simbolo: o.simbolo, sub: o.sub, subRecto: o.subRecto, valor: o.valor, unidad: o.unidad, color: col, alinear: Math.cos(ang) >= -0.2 ? 'left' : 'right' });
      }
      return [x2, y2];
    }

    // ------------------------------------------------ construcción
    trayectoria(ptsMundo, tipo = 'real') {
      if (tipo === 'prevista') this.linea(ptsMundo, { color: 'texto-3', grosor: G.previsto, patron: 'previsto', extremo: 'butt' });
      else this.linea(ptsMundo, { color: 'texto-2', grosor: G.real });
    }

    // Cota entre dos puntos de mundo, desplazada d píxeles a la izquierda del sentido p1→p2
    cota(p1, p2, o = {}) {
      const [x1, y1] = this.vista.P(p1), [x2, y2] = this.vista.P(p2);
      const L = Math.hypot(x2 - x1, y2 - y1), nx = -(y2 - y1) / L, ny = (x2 - x1) / L, d = o.desplazamiento || 16;
      const a = [x1 + nx * d, y1 + ny * d], b = [x2 + nx * d, y2 + ny * d];
      this.lineaPx([[x1 + nx * 3, y1 + ny * 3], [x1 + nx * (d + 4), y1 + ny * (d + 4)]], { color: 'texto-3', grosor: 1 });
      this.lineaPx([[x2 + nx * 3, y2 + ny * 3], [x2 + nx * (d + 4), y2 + ny * (d + 4)]], { color: 'texto-3', grosor: 1 });
      this.flechaPx(a[0], a[1], b[0], b[1], { color: 'texto-2', grosor: 1, punta: 'abierta', ambas: true });
      if (o.texto) {
        const mx = (a[0] + b[0]) / 2 + nx * 12, my = (a[1] + b[1]) / 2 + ny * 12 + 4;
        if (Array.isArray(o.texto)) this.compuesto(o.texto, mx, my, { alinear: 'center', color: 'texto-2' });
        else this.compuesto([{ t: o.texto, f: 'sim', tam: 15 }], mx, my, { alinear: 'center', color: 'texto-2' });
      }
    }

    // Ángulo entre dos direcciones (radianes, sentido matemático) con centro en mundo
    angulo(cMundo, a0, a1, o = {}) {
      const [x, y] = this.vista.P(cMundo), r = o.radio || 30, c = this.ctx;
      c.save(); this._estilo({ color: 'texto-2', grosor: 1 });
      c.beginPath(); c.arc(x, y, r, -a0, -a1, a1 > a0); c.stroke(); c.restore();
      if (o.texto) {
        const am = (a0 + a1) / 2, rr = r + 11;
        this.compuesto([{ t: o.texto, f: 'sim', tam: 15 }], x + Math.cos(am) * rr, y - Math.sin(am) * rr + 5, { alinear: 'center', color: 'texto-2' });
      }
    }

    barraEscala(x, y) {
      const v = this.vista, m = pasoAgradable(80 / v.escala), L = m * v.escala;
      this.lineaPx([[x, y - 4], [x, y + 4]], { color: 'texto-2', grosor: 1.5 });
      this.lineaPx([[x + L, y - 4], [x + L, y + 4]], { color: 'texto-2', grosor: 1.5 });
      this.lineaPx([[x, y], [x + L, y]], { color: 'texto-2', grosor: 1.5 });
      this.texto(cantidad(m, 'm', 2).replace(/\.0+(?= )/, ''), x + L / 2, y - 9, { fuente: 'num', tam: 11, color: 'texto-2', alinear: 'center', halo: true });
    }

    // ------------------------------------------------ geometría fija
    // Superficie: polilínea de mundo con rayado del lado sólido ('der' = a la derecha del sentido de recorrido)
    superficie(ptsMundo, o = {}) {
      const pts = ptsMundo.map(p => this.vista.P(p)), c = this.ctx;
      const lado = o.lado === 'izq' ? -1 : 1;
      c.save(); c.strokeStyle = this.t['texto-3']; c.lineWidth = 1; c.setLineDash([]); c.lineCap = 'butt';
      c.beginPath();
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        const L = Math.hypot(x2 - x1, y2 - y1); if (L < 1) continue;
        const dx = (x2 - x1) / L, dy = (y2 - y1) / L;
        const nx = -dy * lado, ny = dx * lado;              // normal hacia el lado sólido (pantalla)
        const hx = (nx - dx) * G.rayadoProf * 0.72, hy = (ny - dy) * G.rayadoProf * 0.72;
        for (let s = G.rayadoPaso / 2; s < L; s += G.rayadoPaso) {
          const px = x1 + dx * s, py = y1 + dy * s;
          c.moveTo(px, py); c.lineTo(px + hx, py + hy);
        }
      }
      c.stroke(); c.restore();
      this.lineaPx(pts, { color: 'tinta', grosor: G.materia });
    }

    // Región sólida rellena de rayado completo (para cortes)
    regionRayada(ptsMundo, o = {}) {
      const pts = ptsMundo.map(p => this.vista.P(p)), c = this.ctx;
      c.save(); c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
      if (o.relleno) { c.fillStyle = this.color(o.relleno); c.fill(); }
      c.clip(); c.strokeStyle = this.t['linea']; c.lineWidth = 1; c.beginPath();
      for (let k = -this.h; k < this.w + this.h; k += o.paso || 8) { c.moveTo(k, 0); c.lineTo(k - this.h, this.h); }
      c.stroke(); c.restore();
    }

    // Apoyo o pivote fijo en un punto de mundo
    apoyo(pMundo) {
      const [x, y] = this.vista.P(pMundo), c = this.ctx, s = 9;
      c.save(); c.setLineDash([]); c.strokeStyle = this.t.tinta; c.lineWidth = G.materia; c.fillStyle = this.t.lienzo; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - s, y + s * 1.3); c.lineTo(x + s, y + s * 1.3); c.closePath(); c.fill(); c.stroke();
      c.restore();
      this.superficie([[this.vista.mx(x - s - 4), this.vista.my(y + s * 1.3)], [this.vista.mx(x + s + 4), this.vista.my(y + s * 1.3)]]);
      this.pivote(pMundo);
    }
    pivote(pMundo) {
      const [x, y] = this.vista.P(pMundo), c = this.ctx;
      c.save(); c.setLineDash([]); c.fillStyle = this.t.lienzo; c.strokeStyle = this.t.tinta; c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, 4, 0, 2 * Math.PI); c.fill(); c.stroke();
      c.fillStyle = this.t.tinta; c.beginPath(); c.arc(x, y, 1.2, 0, 2 * Math.PI); c.fill(); c.restore();
    }

    // ------------------------------------------------ materia
    particula(pMundo, o = {}) {
      const [x, y] = this.vista.P(pMundo), c = this.ctx, r = o.radio || G.particula;
      c.save(); c.setLineDash([]);
      c.fillStyle = this.t.tinta; c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.fill();
      c.restore();
      if (o.etiqueta) this.texto(o.etiqueta, x - r - 7, y - r - 3, { fuente: 'ui', tam: 12, peso: 500, color: 'texto', alinear: 'right', halo: true });
      if (o.seleccionada) this.seleccionCirculo(x, y, r + 5);
      return [x, y];
    }

    // Imagen estroboscópica: contorno tenue
    fantasma(pMundo, o = {}) {
      const [x, y] = this.vista.P(pMundo), c = this.ctx, r = o.radio || G.particula;
      c.save(); c.setLineDash([]); c.globalAlpha = 0.55;
      c.fillStyle = this.t.lienzo; c.strokeStyle = this.t['texto-3']; c.lineWidth = 1.25;
      c.beginPath(); c.arc(x, y, r - 0.5, 0, 2 * Math.PI); c.fill(); c.stroke();
      c.restore();
    }

    // Cuerpo rígido: polígono de mundo
    cuerpo(ptsMundo, o = {}) {
      const pts = ptsMundo.map(p => this.vista.P(p)), c = this.ctx;
      c.save(); c.setLineDash([]); c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
      c.fillStyle = this.t.campo; c.fill();
      // o.grueso: estado hover (+0.5 px, nada cambia de color)
      c.strokeStyle = this.t.tinta; c.lineWidth = G.materia + (o.grueso ? 0.5 : 0); c.lineJoin = 'round'; c.stroke(); c.restore();
      if (o.centroMasa) this.centroMasa(o.centroMasa);
    }
    centroMasa(pMundo) {
      const [x, y] = this.vista.P(pMundo), c = this.ctx, r = 5;
      c.save(); c.setLineDash([]); c.strokeStyle = this.t.tinta; c.lineWidth = 1; c.fillStyle = this.t.tinta;
      c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.stroke();
      c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, -Math.PI / 2, 0); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, Math.PI / 2, Math.PI); c.closePath(); c.fill();
      c.restore();
    }

    // Resorte entre dos puntos de mundo
    resorte(p1, p2, o = {}) {
      const [x1, y1] = this.vista.P(p1), [x2, y2] = this.vista.P(p2);
      const L = Math.hypot(x2 - x1, y2 - y1), dx = (x2 - x1) / L, dy = (y2 - y1) / L, nx = -dy, ny = dx;
      const extremo = Math.min(6, L * 0.15), dientes = o.dientes || 8, ancho = o.ancho || 7;
      const pts = [[x1, y1], [x1 + dx * extremo, y1 + dy * extremo]];
      const tramo = (L - 2 * extremo) / dientes;
      for (let i = 0; i < dientes; i++) {
        const s = extremo + tramo * (i + 0.5), sg = i % 2 ? -1 : 1;
        pts.push([x1 + dx * s + nx * ancho * sg, y1 + dy * s + ny * ancho * sg]);
      }
      pts.push([x2 - dx * extremo, y2 - dy * extremo], [x2, y2]);
      this.lineaPx(pts, { color: 'tinta', grosor: 1.5 });
    }

    cuerda(p1, p2) { this.linea([p1, p2], { color: 'texto-2', grosor: G.real }); }

    // Carga puntual: signo +1 o −1
    carga(pMundo, signo, o = {}) {
      const [x, y] = this.vista.P(pMundo), c = this.ctx, r = o.radio || G.carga;
      c.save(); c.setLineDash([]); c.lineWidth = 1.5; c.strokeStyle = this.t.tinta;
      c.fillStyle = signo > 0 ? this.t.tinta : this.t.lienzo;
      c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.fill(); c.stroke();
      c.strokeStyle = signo > 0 ? this.t['sobre-tinta'] : this.t.tinta; c.lineWidth = 1.75; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x + 4, y); if (signo > 0) { c.moveTo(x, y - 4); c.lineTo(x, y + 4); } c.stroke();
      c.restore();
      if (o.etiqueta) this.compuesto(o.etiqueta, x + r + 6, y - r, {});
      if (o.seleccionada) this.seleccionCirculo(x, y, r + 5);
    }

    // ------------------------------------------------ edición
    seleccionCirculo(x, y, r) {
      const c = this.ctx; c.save(); c.setLineDash(PATRON.seleccion); c.strokeStyle = this.t.tinta; c.lineWidth = 1;
      c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.stroke(); c.restore();
    }
    seleccionCaja(x, y, w, h) {
      const c = this.ctx, m = 5; c.save(); c.setLineDash(PATRON.seleccion); c.strokeStyle = this.t.tinta; c.lineWidth = 1;
      c.strokeRect(Math.round(x - m) + 0.5, Math.round(y - m) + 0.5, Math.round(w + 2 * m), Math.round(h + 2 * m)); c.restore();
      [[x - m, y - m], [x + w + m, y - m], [x - m, y + h + m], [x + w + m, y + h + m]].forEach(([a, b]) => this.asa(a, b));
    }
    // Selección de una región limitada por paredes (gas, émbolo): el contorno va
    // hacia dentro en los lados donde hay pared, para no montarse sobre ella.
    seleccionRegion(X, Y, W, H, o = {}) {
      const c = this.ctx, m = 5, dx = o.dentroX ? m : -m, dy = o.dentroY ? m : -m;
      c.save(); c.setLineDash(PATRON.seleccion); c.strokeStyle = this.t.tinta; c.lineWidth = 1;
      c.strokeRect(Math.round(X + dx) + 0.5, Math.round(Y + dy) + 0.5, Math.round(W - 2 * dx), Math.round(H - 2 * dy));
      c.restore();
    }
    asa(x, y) {
      const c = this.ctx, s = G.asa; c.save(); c.setLineDash([]);
      c.fillStyle = this.t.lienzo; c.strokeStyle = this.t.tinta; c.lineWidth = 1.5;
      c.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s); c.strokeRect(Math.round(x - s / 2) + 0.5, Math.round(y - s / 2) + 0.5, s - 1, s - 1);
      c.restore();
    }
    asaVector(x, y, activa) {
      const c = this.ctx; c.save(); c.setLineDash([]);
      c.fillStyle = activa ? this.t.tinta : this.t.lienzo; c.strokeStyle = this.t.tinta; c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, 5, 0, 2 * Math.PI); c.fill(); c.stroke(); c.restore();
    }
    guia(ptsPx, texto) {
      this.lineaPx(ptsPx, { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
      if (texto) { const p = ptsPx[ptsPx.length - 1]; this.ficha(p[0] + 8, p[1] - 10, [texto]); }
    }

    // ------------------------------------------------ eventos
    eventoAnillo(pMundo, o = {}) {
      const [x, y] = this.vista.P(pMundo), c = this.ctx;
      c.save(); c.setLineDash([]); c.strokeStyle = this.t.tinta; c.lineWidth = 1.25; c.fillStyle = this.t.lienzo;
      c.beginPath(); c.arc(x, y, 7, 0, 2 * Math.PI); c.fill(); c.stroke();
      c.fillStyle = this.t.tinta; c.beginPath(); c.moveTo(x, y - 3.5); c.lineTo(x + 3.5, y); c.lineTo(x, y + 3.5); c.lineTo(x - 3.5, y); c.closePath(); c.fill();
      c.restore();
      return [x, y];
    }
  }

  // Rombo de evento en pantalla (línea de tiempo, gráficas)
  function rombo(ctx, x, y, s, color) {
    ctx.save(); ctx.setLineDash([]); ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  global.Volta = Object.assign(global.Volta || {}, { Trazo, Vista, leerTokens, fmt, fmtMarca, cantidad, conPrefijo, pasoAgradable, rombo, G, PATRON, FUENTE, ESP, FAMILIAS });
})(window);
