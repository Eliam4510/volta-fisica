/* ==========================================================================
   Volta — gramática del lienzo · dominio Óptica
   Símbolos propios del módulo, según la sección 7 de
   docs/04_lenguaje_de_diseno.md:
   - la luz se dibuja con el color de su longitud de onda; la luz blanca
     (sin separar), en tinta. El color sale del motor (funciones de la CIE
     1931 → sRGB, `colorLongitudOnda`) y aquí se ajusta su luminosidad en
     OKLab, sin cambiar el tono, hasta tener al menos 3:1 de contraste con
     el lienzo: en claro se oscurecen los amarillos y verdes; en oscuro se
     aclaran los violetas y azules (por debajo de ~450 nm). El brillo del
     rayo (su opacidad) sigue a su intensidad;
   - rayos de 1.5 px con flecha a mitad del tramo; prolongaciones hacia una
     imagen virtual en trazo previsto (discontinuo 6 · 4);
   - medios y vidrio: tinte de tinta (5 % para n ≈ 1.5, un poco más claro u
     oscuro según el índice, para distinguir capas apiladas), contorno de
     1 px y la marca de material (tres trazos diagonales cortos); líquidos
     como fluido (6 % con rayitas bajo la superficie);
   - espejos: línea de materia con rayado corto en la cara trasera; lente
     ideal: el símbolo de doble punta (hacia fuera si converge, hacia dentro
     si diverge) con sus focos; divisor de haz, bloqueador, pantalla con la
     luz que recibe, ojo, fuentes y objeto luminoso (flecha en tinta);
   - imágenes: real en trazo continuo, virtual en discontinuo;
   - normales en raya y punto (eje de simetría) con los ángulos de
     incidencia y de refracción;
   - óptica ondulatoria: barrera con rendijas, frentes de onda planos (1 px
     de tinta al 60 %), franjas en la pantalla y diagrama de fasores.
   La pantalla y las franjas se pintan como una película fotográfica: fondo
   del tono más oscuro del tema (tinta en claro, lienzo en oscuro) y la luz
   sumada encima con su color real (sRGB lineal → gamma).
   Métodos con prefijo optica. Mismas convenciones que trazo.js: grosores
   en px de pantalla, patrones de PATRON, colores de this.t, halo en toda
   etiqueta. Requiere trazo.js.
   ========================================================================== */
import { colorLongitudOnda, gammaSRGB } from '../../motores/optica.js';

(function (global) {
  'use strict';
  const { Trazo, G, PATRON } = global.Volta;
  const P = Trazo.prototype;

  // Medidas propias del dominio (px de pantalla)
  const GO = {
    rayo: 1.5,            // grosor de un rayo
    punta: [7, 5.5],      // largo y ancho de la flecha a mitad del rayo
    rayado: [5, 6],       // paso y largo del rayado de un espejo
    marca: 6,             // largo de los trazos de la marca de material
    fuente: 4,            // radio del punto de una fuente
    ojo: 8,               // radio del globo del ojo
    normal: 36,           // semilargo de la normal dibujada
    arco: [26, 34],       // radios de los arcos de θ₁ y θ₂
    franja: 8,            // ancho de la franja de luz junto a una pantalla
  };

  // ---------------------------------------------------------------------
  // Color: sRGB, luminancia, contraste y OKLab
  // ---------------------------------------------------------------------
  function rgbDe(c) {
    c = String(c).trim();
    if (c[0] === '#') {
      const h = c.length === 4 ? [...c.slice(1)].map(x => x + x).join('') : c.slice(1, 7);
      return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
    }
    const m = c.match(/[\d.]+/g);
    return m ? m.slice(0, 3).map(x => +x / 255) : [0, 0, 0];
  }
  const lineal = x => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  const luminancia = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const contraste = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  function oklab([r, g, b]) {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function desdeOklab([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
      .map(x => Math.min(1, Math.max(0, x)));
  }
  const css = lin => `rgb(${lin.map(x => Math.round(255 * gammaSRGB(x))).join(' ')})`;

  // Color de la λ con contraste ≥ 3:1 sobre el lienzo (lineal y css)
  P.opticaColorLineal = function (lambda) {
    if (this._opticaTema !== this.t) { this._opticaTema = this.t; this._opticaCache = new Map(); }
    const k = Math.round(lambda * 1e11);
    if (this._opticaCache.has(k)) return this._opticaCache.get(k);
    const fondo = luminancia(rgbDe(this.t.lienzo).map(lineal)), oscuro = fondo < 0.2;
    let c = colorLongitudOnda(lambda).lineal;
    if (contraste(luminancia(c), fondo) < 3) {
      const [L, a, b] = oklab(c);
      // Bisección sobre la luminosidad L de OKLab (tono y croma fijos)
      let lo = oscuro ? L : 0, hi = oscuro ? 1 : L;
      for (let i = 0; i < 30; i++) {
        const m = (lo + hi) / 2, ok = contraste(luminancia(desdeOklab([m, a, b])), fondo) >= 3.05;
        if (oscuro) { if (ok) hi = m; else lo = m; } else if (ok) lo = m; else hi = m;
      }
      c = desdeOklab([oscuro ? hi : lo, a, b]);
    }
    const r = { lineal: c, css: css(c) };
    this._opticaCache.set(k, r);
    return r;
  };
  /** Color css de la luz de longitud de onda λ (null: blanca, en tinta). */
  P.opticaColor = function (lambda) { return lambda == null ? this.t.tinta : this.opticaColorLineal(lambda).css; };
  /** Fondo de una pantalla o película: el tono más oscuro del tema. */
  P.opticaFondoLuz = function () {
    const a = rgbDe(this.t.lienzo), b = rgbDe(this.t.tinta);
    return luminancia(a.map(lineal)) < luminancia(b.map(lineal)) ? this.t.lienzo : this.t.tinta;
  };
  /** Luz real sobre la pantalla: sRGB lineal (puede pasar de 1: se acota) → css. */
  P.opticaLuz = function (lin) {
    const f = this.opticaFondoLuz(), base = rgbDe(f).map(lineal);
    return css([0, 1, 2].map(i => Math.min(1, base[i] + Math.max(0, lin[i]))));
  };
  /** sRGB lineal de una λ, saturado y sin ajustar (para sumar luz). */
  P.opticaLuzLambda = lambda => (lambda == null ? [1, 1, 1] : colorLongitudOnda(lambda).lineal);

  // ---------------------------------------------------------------------
  // 1 · Fondo: ejes con unidad de pantalla (cm, mm)
  // ---------------------------------------------------------------------
  // o = {unidad: 'cm', factor: 100, huecos: [[x, y, r]]}: las marcas se
  // escriben en la unidad dada (el mundo está en m)
  P.opticaEjes = function (o = {}) {
    const c = this.ctx, v = this.vista, t = this.t, f = o.factor ?? 1, paso = this._pasoMayor || global.Volta.pasoAgradable(90 / v.escala);
    const X0 = Math.round(v.X(0)) + 0.5, Y0 = Math.round(v.Y(0)) + 0.5, fm = global.Volta.fmtMarca;
    c.save(); c.strokeStyle = t.eje; c.lineWidth = 1; c.setLineDash([]);
    c.beginPath(); c.moveTo(0, Y0); c.lineTo(this.w, Y0); c.moveTo(X0, 0); c.lineTo(X0, this.h); c.stroke(); c.restore();
    const tapado = (x, y) => (o.huecos || []).some(([hx, hy, hr]) => Math.hypot(x - hx, y - hy) < hr + 10);
    // Los números y rótulos de los ejes quedan reservados: otras etiquetas no los tapan
    const ocupar = r => { if (this._opticaOcupado) this._opticaOcupado.push(r); };
    for (let x = Math.ceil(v.mx(0) / paso) * paso; x <= v.mx(this.w); x += paso) {
      if (Math.abs(x) < paso / 2 || v.X(x) > this.w - 60 || v.X(x) < 20 || tapado(v.X(x), Y0 + 10)) continue;
      this.texto(fm(x * f, paso * f), v.X(x), Y0 + 5, { fuente: 'num', tam: 11, color: 'texto-3', alinear: 'center', base: 'top', halo: true });
      ocupar({ x: v.X(x) - 16, y: Y0 + 3, w: 32, h: 15 });
    }
    for (let y = Math.ceil(v.my(this.h) / paso) * paso; y <= v.my(0); y += paso) {
      if (Math.abs(y) < paso / 2 || v.Y(y) < 34 || v.Y(y) > this.h - 12 || tapado(X0 - 14, v.Y(y))) continue;
      this.texto(fm(y * f, paso * f), X0 - 6, v.Y(y), { fuente: 'num', tam: 11, color: 'texto-3', alinear: 'right', base: 'middle', halo: true });
      ocupar({ x: X0 - 40, y: v.Y(y) - 8, w: 36, h: 16 });
    }
    const zonas = this.zonasFlotantes(), choca = (x, y, w, h) => zonas.find(z => x < z.x + z.w && x + w > z.x && y < z.y + z.h && y + h > z.y);
    let xd = this.w - 12, z;
    for (let i = 0; i < 4 && (z = choca(xd - 70, Y0 - 22, 70, 20)); i++) xd = z.x - 8;
    this.compuesto([{ t: 'x', f: 'sim', tam: 14 }, { t: ` (${o.unidad || 'm'})`, f: 'ui', tam: 11 }], xd, Y0 - 8, { color: 'texto-3', alinear: 'right' });
    ocupar({ x: xd - 50, y: Y0 - 22, w: 52, h: 18 });
    let yb = 18;
    for (let i = 0; i < 4 && (z = choca(X0 + 8, yb - 14, 70, 20)); i++) yb = z.y + z.h + 18;
    this.compuesto([{ t: 'y', f: 'sim', tam: 14 }, { t: ` (${o.unidad || 'm'})`, f: 'ui', tam: 11 }], X0 + 8, yb, { color: 'texto-3' });
    ocupar({ x: X0 + 6, y: yb - 14, w: 52, h: 18 });
  };

  // Barra de escala en la unidad de pantalla
  P.opticaBarraEscala = function (x, y, unidad = 'm', factor = 1) {
    const v = this.vista, m = global.Volta.pasoAgradable(80 / v.escala), L = m * v.escala;
    this.lineaPx([[x, y - 4], [x, y + 4]], { color: 'texto-2', grosor: 1.5 });
    this.lineaPx([[x + L, y - 4], [x + L, y + 4]], { color: 'texto-2', grosor: 1.5 });
    this.lineaPx([[x, y], [x + L, y]], { color: 'texto-2', grosor: 1.5 });
    this.texto(global.Volta.cantidad(m * factor, unidad, 2).replace(/\.0+(?=[\s ])/, ''), x + L / 2, y - 9, { fuente: 'num', tam: 11, color: 'texto-2', alinear: 'center', halo: true });
  };

  // ---------------------------------------------------------------------
  // 4 · Medios
  // ---------------------------------------------------------------------
  // Medio de forma libre: polígono de mundo con su tinte y la marca de
  // material. o = {n, fluido, grueso, sinMarca}
  P.opticaMedio = function (pts, o = {}) {
    if (pts.length < 3) return;
    const c = this.ctx, v = this.vista, Ps = pts.map(p => v.P(p));
    const n = o.n ?? 1.5, alfa = o.fluido ? 0.06 : Math.max(0.03, Math.min(0.1, 0.05 + 0.04 * (n - 1.5)));
    c.save(); c.setLineDash([]);
    c.beginPath(); Ps.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
    c.globalAlpha = alfa; c.fillStyle = this.t.tinta; c.fill();
    c.globalAlpha = 1; c.strokeStyle = this.t[o.fluido ? 'texto-3' : 'texto-2']; c.lineWidth = 1 + (o.grueso ? 0.5 : 0); c.stroke();
    c.restore();
    if (o.fluido) {
      // Rayitas cortas bajo la superficie (borde superior)
      let top = Ps[0]; for (const p of Ps) if (p[1] < top[1]) top = p;
      const xs = Ps.filter(p => Math.abs(p[1] - top[1]) < 1).map(p => p[0]), x0 = Math.min(...xs), x1 = Math.max(...xs), xm = (x0 + x1) / 2, a = Math.min(12, (x1 - x0) / 6);
      if (x1 - x0 > 24) {
        this.lineaPx([[xm - a, top[1] + 6], [xm + a, top[1] + 6]], { color: 'texto-3', grosor: 1, extremo: 'butt' });
        this.lineaPx([[xm - a / 2, top[1] + 10], [xm + a / 2, top[1] + 10]], { color: 'texto-3', grosor: 1, extremo: 'butt' });
      }
    } else if (!o.sinMarca) this.opticaMarcaMaterial(Ps);
  };
  // Marca de material: tres trazos diagonales cortos, dentro de la forma,
  // hacia su esquina superior derecha (pts en pantalla)
  P.opticaMarcaMaterial = function (Ps) {
    let cx = 0, cy = 0; for (const p of Ps) { cx += p[0]; cy += p[1]; } cx /= Ps.length; cy /= Ps.length;
    let v = Ps[0]; for (const p of Ps) if (p[0] - p[1] > v[0] - v[1]) v = p;
    const d = Math.hypot(v[0] - cx, v[1] - cy); if (d < 18) return;
    const k = Math.max(0, (d - 16) / d), x = cx + (v[0] - cx) * k, y = cy + (v[1] - cy) * k, L = GO.marca;
    const c = this.ctx; c.save(); c.strokeStyle = this.t['texto-3']; c.lineWidth = 1; c.lineCap = 'round'; c.beginPath();
    for (let i = -1; i <= 1; i++) { const ox = x + i * 3.5 - 3, oy = y + i * 3.5 + 3; c.moveTo(ox - L / 2, oy + L / 2); c.lineTo(ox + L / 2, oy - L / 2); }
    c.stroke(); c.restore();
  };

  // ---------------------------------------------------------------------
  // 6 · Materia: espejos, lentes, divisor, bloqueador, pantalla, ojo, fuentes
  // ---------------------------------------------------------------------
  // Rayado corto del lado trasero de una polilínea de pantalla.
  // lado: +1 a la derecha del recorrido (en pantalla), −1 a la izquierda.
  function rayadoCorto(c, Ps, lado, color) {
    const [paso, largo] = GO.rayado;
    c.save(); c.strokeStyle = color; c.lineWidth = 1; c.setLineDash([]); c.lineCap = 'butt'; c.beginPath();
    let resto = paso / 2;
    for (let i = 0; i < Ps.length - 1; i++) {
      const [x1, y1] = Ps[i], [x2, y2] = Ps[i + 1], L = Math.hypot(x2 - x1, y2 - y1); if (L < 1e-9) continue;
      const dx = (x2 - x1) / L, dy = (y2 - y1) / L, nx = -dy * lado, ny = dx * lado;
      let s = resto;
      for (; s < L; s += paso) { const px = x1 + dx * s, py = y1 + dy * s; c.moveTo(px, py); c.lineTo(px + (nx - dx) * largo * 0.72, py + (ny - dy) * largo * 0.72); }
      resto = s - L;
    }
    c.stroke(); c.restore();
  }
  // Espejo: polilínea de mundo (plano: dos puntos; curvo: muestras del arco)
  // y normal de su cara reflectante (mundo) en el primer punto
  P.opticaEspejo = function (pts, normalFrente, o = {}) {
    const v = this.vista, Ps = pts.map(p => v.P(p));
    const t = [Ps[1][0] - Ps[0][0], Ps[1][1] - Ps[0][1]], nPant = [normalFrente[0], -normalFrente[1]];
    // a la derecha del recorrido en pantalla: (−t.y, t.x)
    const derecha = (-t[1]) * nPant[0] + t[0] * nPant[1];
    rayadoCorto(this.ctx, Ps, derecha > 0 ? -1 : 1, this.t['texto-3']);
    this.lineaPx(Ps, { color: 'tinta', grosor: G.materia + (o.grueso ? 0.5 : 0), extremo: 'butt' });
  };

  // Lente ideal: segmento a–b (mundo) con una punta abierta en cada extremo:
  // si converge (f > 0) las aletas vuelven hacia el centro (↕); si diverge,
  // se abren hacia fuera (puntas hacia dentro)
  P.opticaLenteIdeal = function (a, b, f, o = {}) {
    const v = this.vista, [x1, y1] = v.P(a), [x2, y2] = v.P(b), L = Math.hypot(x2 - x1, y2 - y1); if (L < 2) return;
    const dx = (x2 - x1) / L, dy = (y2 - y1) / L, w = G.materia + (o.grueso ? 0.5 : 0), c = this.ctx, k = 7, s = f > 0 ? -1 : 1;
    this.lineaPx([[x1, y1], [x2, y2]], { color: 'tinta', grosor: w, extremo: 'butt' });
    c.save(); c.strokeStyle = this.t.tinta; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
    for (const [px, py, ox, oy] of [[x1, y1, -dx, -dy], [x2, y2, dx, dy]]) {
      const bx = px + s * ox * k, by = py + s * oy * k;
      c.moveTo(bx - oy * k * 0.75, by + ox * k * 0.75); c.lineTo(px, py); c.lineTo(bx + oy * k * 0.75, by - ox * k * 0.75);
    }
    c.stroke(); c.restore();
  };
  // Focos de una lente o de un espejo: marca corta sobre el eje y su letra
  P.opticaFoco = function (p, etiqueta) {
    const [x, y] = this.vista.P(p), c = this.ctx;
    c.save(); c.fillStyle = this.t.lienzo; c.strokeStyle = this.t['texto-2']; c.lineWidth = 1.25; c.setLineDash([]);
    c.beginPath(); c.arc(x, y, 3, 0, 2 * Math.PI); c.fill(); c.stroke(); c.restore();
    if (etiqueta) this.compuesto(etiqueta, x, y + 16, { alinear: 'center', color: 'texto-2' });
  };
  // Eje óptico: raya y punto entre dos puntos de mundo
  P.opticaEje = function (a, b) { this.linea([a, b], { color: 'texto-3', grosor: 1, patron: 'eje', extremo: 'butt' }); };

  // Divisor de haz: placa delgada (tinte y contorno)
  P.opticaDivisor = function (a, b, o = {}) {
    const v = this.vista, [x1, y1] = v.P(a), [x2, y2] = v.P(b), L = Math.hypot(x2 - x1, y2 - y1); if (L < 2) return;
    const nx = -(y2 - y1) / L * 2.5, ny = (x2 - x1) / L * 2.5, c = this.ctx;
    const pts = [[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]];
    c.save(); c.setLineDash([]); c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
    c.globalAlpha = 0.08; c.fillStyle = this.t.tinta; c.fill(); c.globalAlpha = 1;
    c.strokeStyle = this.t['texto-2']; c.lineWidth = 1 + (o.grueso ? 0.5 : 0); c.stroke(); c.restore();
    this.lineaPx([[x1, y1], [x2, y2]], { color: 'tinta', grosor: 1.25, extremo: 'butt' });
  };
  // Bloqueador o diafragma: barra de materia rellena de rayado
  P.opticaBloqueador = function (a, b, o = {}) {
    const v = this.vista, [x1, y1] = v.P(a), [x2, y2] = v.P(b), L = Math.hypot(x2 - x1, y2 - y1); if (L < 2) return;
    const e = 3, nx = -(y2 - y1) / L * e, ny = (x2 - x1) / L * e, c = this.ctx;
    const pts = [[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]];
    c.save(); c.setLineDash([]); c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
    c.fillStyle = this.t['campo-activo']; c.fill();
    c.save(); c.clip(); c.strokeStyle = this.t['texto-3']; c.lineWidth = 1; c.beginPath();
    const x0 = Math.min(...pts.map(p => p[0])) - 10, xm = Math.max(...pts.map(p => p[0])) + 10, y0 = Math.min(...pts.map(p => p[1])) - 10, ym = Math.max(...pts.map(p => p[1])) + 10;
    for (let k = x0 - (ym - y0); k < xm; k += 4) { c.moveTo(k, ym); c.lineTo(k + (ym - y0), y0); }
    c.stroke(); c.restore();
    c.strokeStyle = this.t.tinta; c.lineWidth = 1.5 + (o.grueso ? 0.5 : 0); c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.stroke();
    c.restore();
  };
  // Pantalla: línea de materia y, del lado trasero, la franja con la luz que
  // recibe. bandas: [{s0, s1 (fracción 0–1 del largo), lin: [r,g,b]}]
  P.opticaPantalla = function (a, b, bandas, o = {}) {
    const v = this.vista, [x1, y1] = v.P(a), [x2, y2] = v.P(b), L = Math.hypot(x2 - x1, y2 - y1); if (L < 2) return;
    const dx = (x2 - x1) / L, dy = (y2 - y1) / L, lado = o.lado ?? 1, nx = -dy * lado, ny = dx * lado, W = GO.franja, c = this.ctx;
    const quad = (s0, s1) => [[x1 + dx * L * s0, y1 + dy * L * s0], [x1 + dx * L * s1, y1 + dy * L * s1], [x1 + dx * L * s1 + nx * W, y1 + dy * L * s1 + ny * W], [x1 + dx * L * s0 + nx * W, y1 + dy * L * s0 + ny * W]];
    const poly = q => { c.beginPath(); q.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); };
    c.save(); c.setLineDash([]);
    poly(quad(0, 1)); c.fillStyle = this.opticaFondoLuz(); c.fill();
    for (const bd of bandas || []) { poly(quad(bd.s0, bd.s1)); c.fillStyle = this.opticaLuz(bd.lin); c.fill(); }
    poly(quad(0, 1)); c.strokeStyle = this.t.linea; c.lineWidth = 1; c.stroke();
    c.restore();
    this.lineaPx([[x1, y1], [x2, y2]], { color: 'tinta', grosor: G.materia + (o.grueso ? 0.5 : 0), extremo: 'butt' });
  };
  // Ojo de perfil: globo, córnea y cristalino, mirando hacia dir (mundo)
  P.opticaOjo = function (p, dir, o = {}) {
    const [X, Y] = this.vista.P(p), ang = Math.atan2(-dir[1], dir[0]), r = GO.ojo, c = this.ctx;
    c.save(); c.translate(X, Y); c.rotate(ang); c.setLineDash([]);
    c.strokeStyle = this.t.tinta; c.fillStyle = this.t.lienzo; c.lineWidth = 1.5 + (o.grueso ? 0.5 : 0);
    c.beginPath(); c.arc(-r * 0.2, 0, r, 0, 2 * Math.PI); c.fill(); c.stroke();
    c.beginPath(); c.arc(r * 0.35, 0, r * 0.62, -1.05, 1.05); c.stroke();
    c.lineWidth = 1.25; c.beginPath(); c.moveTo(r * 0.5, -r * 0.42); c.lineTo(r * 0.5, r * 0.42); c.stroke();
    c.restore();
    return [X, Y];
  };
  // Fuente puntual: punto lleno de tinta con un anillo
  P.opticaFuente = function (p, o = {}) {
    const [X, Y] = this.vista.P(p), c = this.ctx;
    c.save(); c.setLineDash([]); c.fillStyle = this.t.tinta;
    c.beginPath(); c.arc(X, Y, GO.fuente + (o.grueso ? 0.5 : 0), 0, 2 * Math.PI); c.fill();
    c.strokeStyle = this.t.tinta; c.lineWidth = 1; c.beginPath(); c.arc(X, Y, GO.fuente + 3.5, 0, 2 * Math.PI); c.stroke();
    c.restore();
    return [X, Y];
  };
  // Emisor de un haz o de un rayo: barra de tinta de a a b (mundo), por
  // detrás de la salida de la luz; si es muy corta, de 12 px perpendicular a dir
  P.opticaEmisor = function (a, b, dir, o = {}) {
    const v = this.vista;
    let [x1, y1] = v.P(a), [x2, y2] = v.P(b);
    const ux = dir[0], uy = -dir[1];
    if (Math.hypot(x2 - x1, y2 - y1) < 12) { const xm = (x1 + x2) / 2, ym = (y1 + y2) / 2; x1 = xm + uy * 6; y1 = ym - ux * 6; x2 = xm - uy * 6; y2 = ym + ux * 6; }
    const e = 4 + (o.grueso ? 0.5 : 0), pts = [[x1, y1], [x2, y2], [x2 - ux * e, y2 - uy * e], [x1 - ux * e, y1 - uy * e]], c = this.ctx;
    c.save(); c.setLineDash([]); c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath();
    c.fillStyle = this.t.tinta; c.fill(); c.restore();
  };
  // Objeto luminoso: flecha de tinta del pie a la punta (mundo)
  P.opticaObjeto = function (pie, punta, o = {}) {
    const [x1, y1] = this.vista.P(pie), [x2, y2] = this.vista.P(punta);
    this.flechaPx(x1, y1, x2, y2, { color: 'tinta', grosor: G.vector + (o.grueso ? 0.5 : 0) });
    const c = this.ctx; c.save(); c.fillStyle = this.t.tinta; c.beginPath(); c.arc(x1, y1, 2.5, 0, 2 * Math.PI); c.fill(); c.restore();
  };
  // Imagen de un objeto: real en trazo continuo, virtual en discontinuo
  P.opticaImagen = function (pie, punta, real) {
    const [x1, y1] = this.vista.P(pie), [x2, y2] = this.vista.P(punta);
    this.flechaPx(x1, y1, x2, y2, { color: 'texto-2', grosor: G.real, patron: real ? 'continuo' : 'previsto' });
  };
  // Imagen de un punto: anillo (continuo si es real, discontinuo si es virtual)
  P.opticaImagenPunto = function (p, real) {
    const [x, y] = this.vista.P(p), c = this.ctx;
    c.save(); c.strokeStyle = this.t['texto-2']; c.lineWidth = 1.5; c.setLineDash(real ? [] : PATRON.previsto.map(x => x / 2));
    c.beginPath(); c.arc(x, y, 5, 0, 2 * Math.PI); c.stroke();
    c.setLineDash([]); c.fillStyle = this.t['texto-2']; c.beginPath(); c.arc(x, y, 1.5, 0, 2 * Math.PI); c.fill(); c.restore();
    return [x, y];
  };

  // ---------------------------------------------------------------------
  // 7 · Magnitudes: rayos
  // ---------------------------------------------------------------------
  // Opacidad según la intensidad relativa (los reflejos débiles se ven tenues)
  const opacidad = rel => Math.max(0.16, Math.min(1, 0.16 + 0.84 * Math.pow(Math.max(0, rel), 0.55)));
  // Recorta el segmento de pantalla al rectángulo del lienzo (Liang–Barsky)
  function recortar(x1, y1, x2, y2, w, h, m = 4) {
    let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
    for (const [p, q] of [[-dx, x1 + m], [dx, w + m - x1], [-dy, y1 + m], [dy, h + m - y1]]) {
      if (p === 0) { if (q < 0) return null; continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
  }
  // Rayo de a a b (mundo). o = {lambda, rel, flecha (true), grueso}
  P.opticaRayo = function (a, b, o = {}) {
    const v = this.vista, r = recortar(...v.P(a), ...v.P(b), this.w, this.h); if (!r) return;
    const [x1, y1, x2, y2] = r, L = Math.hypot(x2 - x1, y2 - y1); if (L < 0.5) return;
    const col = this.opticaColor(o.lambda ?? null), c = this.ctx, al = opacidad(o.rel ?? 1);
    c.save(); c.setLineDash([]); c.globalAlpha = al; c.strokeStyle = col; c.lineWidth = GO.rayo + (o.grueso ? 0.75 : 0); c.lineCap = 'butt';
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    if (o.flecha !== false && L > 34) {
      // Punta llena a mitad del tramo visible
      const ux = (x2 - x1) / L, uy = (y2 - y1) / L, mx = (x1 + x2) / 2 + ux * GO.punta[0] / 2, my = (y1 + y2) / 2 + uy * GO.punta[0] / 2, [lp, ap] = GO.punta;
      c.fillStyle = col; c.beginPath(); c.moveTo(mx, my); c.lineTo(mx - ux * lp - uy * ap / 2, my - uy * lp + ux * ap / 2); c.lineTo(mx - ux * lp * 0.82, my - uy * lp * 0.82); c.lineTo(mx - ux * lp + uy * ap / 2, my - uy * lp - ux * ap / 2); c.closePath(); c.fill();
    }
    c.restore();
  };
  // Prolongación de un rayo hacia una imagen virtual: previsto, más tenue
  P.opticaProlongacion = function (a, b, o = {}) {
    const v = this.vista, r = recortar(...v.P(a), ...v.P(b), this.w, this.h); if (!r) return;
    const c = this.ctx;
    c.save(); c.globalAlpha = 0.55 * opacidad(o.rel ?? 1); c.strokeStyle = this.opticaColor(o.lambda ?? null); c.lineWidth = 1; c.setLineDash(PATRON.previsto); c.lineCap = 'butt';
    c.beginPath(); c.moveTo(r[0], r[1]); c.lineTo(r[2], r[3]); c.stroke(); c.restore();
  };

  // Normal en raya y punto y ángulos de incidencia y de salida en p (mundo).
  // nInc: normal unitaria hacia el lado de incidencia; dIn, dOut: direcciones
  // de llegada y de salida (mundo; dOut null si no sale); etq1, etq2:
  // segmentos de compuesto(). o.reflexion: la salida va del lado incidente.
  P.opticaAngulos = function (p, nInc, dIn, dOut, etq1, etq2, o = {}) {
    const [X, Y] = this.vista.P(p), N = GO.normal, nx = nInc[0], ny = -nInc[1], c = this.ctx;
    this.lineaPx([[X - nx * N, Y - ny * N], [X + nx * N, Y + ny * N]], { color: 'texto-3', grosor: 1, patron: 'eje', extremo: 'butt' });
    // Ángulo de pantalla (y hacia abajo) de un vector de mundo
    const ang = w => Math.atan2(-w[1], w[0]);
    const arco = (r, a0, a1, etq) => {
      let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      if (Math.abs(d) < 0.005) return;
      c.save(); c.strokeStyle = this.t['texto-2']; c.lineWidth = 1; c.setLineDash([]); c.beginPath(); c.arc(X, Y, r, a0, a0 + d, d < 0); c.stroke(); c.restore();
      if (etq) {
        // La etiqueta se aleja por la bisectriz hasta un sitio libre; si no lo hay, se omite
        const am = a0 + d / 2, cx = Math.cos(am), sy = Math.sin(am), alinear = cx > 0.35 ? 'left' : cx < -0.35 ? 'right' : 'center';
        for (const rr of [r + 9, r + 22]) {
          const x = X + cx * rr, y = Y + sy * rr + 4;
          if (this.opticaReservar(etq, x, y, alinear)) { this.compuesto(etq, x, y, { alinear, color: 'texto-2' }); break; }
        }
      }
    };
    arco(GO.arco[0], ang(nInc), ang([-dIn[0], -dIn[1]]), etq1);
    if (dOut) arco(GO.arco[1], ang(o.reflexion ? nInc : [-nInc[0], -nInc[1]]), ang(dOut), etq2);
  };

  // Etiquetas sin solaparse: opticaEtiquetas() vacía la lista al empezar a
  // dibujar; opticaReservar() mide la etiqueta y la acepta si cabe libre
  P.opticaEtiquetas = function (zonas = []) { this._opticaOcupado = zonas.map(z => ({ ...z })); };
  P.opticaReservar = function (segs, x, y, alinear = 'left') {
    const c = this.ctx; let w = 0;
    c.save(); for (const s of segs) { c.font = this._fuente(s.f, s.tam || 12); w += c.measureText(s.t).width; } c.restore();
    const x0 = alinear === 'right' ? x - w : alinear === 'center' ? x - w / 2 : x, r = { x: x0 - 2, y: y - 13, w: w + 4, h: 17 };
    const lista = this._opticaOcupado || (this._opticaOcupado = []);
    if (lista.some(q => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y)) return false;
    lista.push(r); return true;
  };

  // ---------------------------------------------------------------------
  // Óptica ondulatoria (esquemas)
  // ---------------------------------------------------------------------
  // Barrera vertical en X (pantalla) entre Ya e Yb con aberturas [[y0, y1]] (pantalla)
  P.opticaBarrera = function (X, Ya, Yb, aberturas, o = {}) {
    const tramos = [], ords = aberturas.slice().sort((p, q) => p[0] - q[0]);
    let y = Ya;
    for (const [a, b] of ords) { if (a > y) tramos.push([y, a]); y = Math.max(y, b); }
    if (Yb > y) tramos.push([y, Yb]);
    const c = this.ctx, e = o.espesor ?? 6;
    for (const [a, b] of tramos) {
      if (b - a < 0.5) continue;
      c.save(); c.setLineDash([]); c.fillStyle = this.t['campo-activo']; c.fillRect(X - e / 2, a, e, b - a);
      c.beginPath(); c.rect(X - e / 2, a, e, b - a); c.clip(); c.strokeStyle = this.t['texto-3']; c.lineWidth = 1; c.beginPath();
      for (let k = a - e; k < b + e; k += 4) { c.moveTo(X - e / 2, k + e); c.lineTo(X + e / 2, k); }
      c.stroke(); c.restore();
      c.save(); c.strokeStyle = this.t.tinta; c.lineWidth = 1.5 + (o.grueso ? 0.5 : 0); c.setLineDash([]); c.strokeRect(X - e / 2, a, e, b - a); c.restore();
    }
  };
  // Frentes de onda planos (verticales) entre X0 y X1, separados paso px
  P.opticaFrentesPlanos = function (X0, X1, Ya, Yb, paso, desfase = 0) {
    const c = this.ctx; if (!(paso > 1.5)) return;
    c.save(); c.globalAlpha = 0.6; c.strokeStyle = this.t.tinta; c.lineWidth = 1; c.setLineDash([]); c.beginPath();
    for (let x = X1 - (desfase % paso); x > X0; x -= paso) { c.moveTo(Math.round(x) + 0.5, Ya); c.lineTo(Math.round(x) + 0.5, Yb); }
    c.stroke(); c.restore();
  };
  // Franjas sobre una pantalla vertical en X entre Ya e Yb: colores (css) por fila
  P.opticaFranjasVerticales = function (X, Ya, Yb, ancho, colores) {
    const c = this.ctx, n = colores.length, h = (Yb - Ya) / n;
    c.save(); c.setLineDash([]); c.fillStyle = this.opticaFondoLuz(); c.fillRect(X, Ya, ancho, Yb - Ya);
    for (let i = 0; i < n; i++) { c.fillStyle = colores[i]; c.fillRect(X, Ya + i * h, ancho, h + 0.6); }
    c.strokeStyle = this.t.linea; c.lineWidth = 1; c.strokeRect(X + 0.5, Ya + 0.5, ancho - 1, Yb - Ya - 1); c.restore();
  };
  // Imagen (ImageData ya calculada) dentro de un rectángulo de pantalla, con borde
  P.opticaPlaca = function (img, X, Y, W, H) {
    const c = this.ctx; c.save(); c.imageSmoothingEnabled = true; c.drawImage(img, X, Y, W, H);
    c.strokeStyle = this.t.linea; c.lineWidth = 1; c.strokeRect(X + 0.5, Y + 0.5, W - 1, H - 1); c.restore();
  };
  // Diagrama de fasores: flechas encadenadas (finas) y la resultante (vector)
  // en (cx, cy) de pantalla; fasores [{re, im}] ya escalados a px
  P.opticaFasores = function (cx, cy, fasores, o = {}) {
    const col = o.color || this.t.tinta, c = this.ctx;
    c.save(); c.strokeStyle = this.t['cuadricula-mayor']; c.lineWidth = 1; c.beginPath(); c.moveTo(cx - 8, cy); c.lineTo(cx + (o.ejeLargo ?? 120), cy); c.moveTo(cx, cy + 40); c.lineTo(cx, cy - 40); c.stroke(); c.restore();
    let x = cx, y = cy;
    for (const f of fasores) {
      const x2 = x + f.re, y2 = y - f.im;
      if (Math.hypot(f.re, f.im) > 3) this.flechaPx(x, y, x2, y2, { color: col, grosor: 1.25, punta: 'abierta' });
      else this.lineaPx([[x, y], [x2, y2]], { color: col, grosor: 1.25 });
      x = x2; y = y2;
    }
    if (Math.hypot(x - cx, y - cy) > 2) this.flechaPx(cx, cy, x, y, { color: col, grosor: G.vector });
    return [x, y];
  };

  global.Volta.optica = { GO, recortar };
})(window);
