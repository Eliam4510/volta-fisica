/* ==========================================================================
   Volta — gramática del lienzo · dominio Física moderna
   Símbolos propios del módulo, según la sección 7 de
   docs/04_lenguaje_de_diseno.md:
   - la luz se dibuja con el color de su longitud de onda. El color sale
     del motor de Óptica (funciones de igualación CIE 1931 → sRGB lineal,
     `colorLongitudOnda` de sistema/motores/optica.js) y aquí se ajusta su
     luminosidad en OKLab, sin cambiar el tono, hasta tener al menos 3:1 de
     contraste con el lienzo, igual que en el dominio de Óptica. Fuera del
     visible (λ < 380 nm o > 750 nm: ultravioleta e infrarrojo) la luz no
     tiene color: se dibuja en tinta, como la luz sin λ definida, y lleva
     el rótulo UV o IR;
   - lámpara: bombilla de tinta (materia) rellena con el tinte de su luz;
     haz hacia la placa con el tinte de la luz y su rayo central; fotones
     como paquetes de onda del color de la luz;
   - placa metálica y colector: conductores (relleno campo-activo con
     rayado cruzado fino, contorno de materia); tubo de vidrio: doble línea
     fina con el tinte del 5 % de tinta del vidrio;
   - fotoelectrones: cargas negativas pequeñas (disco de lienzo, contorno
     de tinta y glifo −) con su velocidad en la familia movimiento;
   - circuito: cables de 2 px, batería y medidores con símbolos IEC en
     tinta; campo eléctrico entre placa y colector en la familia eléctrico;
   - carta de núclidos N–Z: casillas de materia (estables llenas de tinta,
     radiactivos en campo con contorno), flechas de decaimiento en tinta
     rotuladas α, β⁻, β⁺, CE o γ (las ramas menores, discontinuas); valle
     de estabilidad y recta N = Z como construcción auxiliar;
   - núcleos y partículas del decaimiento puntual (materia en tinta; el
     fotón γ, fuera del visible, en tinta) con sus momentos en la familia
     inercia, que nacen en el borde de cada cuerpo.
   Métodos con prefijo moderna. Mismas convenciones que trazo.js: grosores
   en px de pantalla, patrones de PATRON, colores de this.t, halo en toda
   etiqueta. Requiere trazo.js.
   ========================================================================== */
import { colorLongitudOnda, gammaSRGB } from '../../motores/optica.js';

(function (global) {
  'use strict';
  const { Trazo, G, PATRON } = global.Volta;
  const P = Trazo.prototype;

  // Medidas propias del dominio (px de pantalla)
  const GM = {
    electron: 4.5,       // radio de un fotoelectrón
    foton: [22, 3.5],    // largo y amplitud de un paquete de onda
    bombilla: 12,        // radio de la bombilla de una lámpara
    placa: 7,            // grosor de la placa metálica
    colector: 5,         // grosor del colector
    medidor: 12,         // radio de un medidor
    bateria: [13, 7, 5], // media placa larga, media corta y medio hueco de la batería
    punta: [7, 6],       // flecha pequeña (decaimientos, campo)
  };
  const VISIBLE = [380e-9, 750e-9];

  // ---------------------------------------------------------------------
  // Color de la luz: sRGB, contraste y OKLab (como el dominio de Óptica)
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
  const css = (lin, alfa = 1) => `rgb(${lin.map(x => Math.round(255 * gammaSRGB(x))).join(' ')}${alfa < 1 ? ` / ${alfa}` : ''})`;

  /** ¿Se ve la luz de longitud de onda λ? @param {number} lambda */
  P.modernaVisible = lambda => lambda >= VISIBLE[0] && lambda <= VISIBLE[1];
  /** Rótulo de la región del espectro: 'UV', 'IR' o ''. */
  P.modernaRegion = lambda => (lambda < VISIBLE[0] ? 'UV' : lambda > VISIBLE[1] ? 'IR' : '');
  // sRGB lineal de la λ con contraste ≥ 3:1 sobre el lienzo (null fuera del visible)
  P._modernaLuz = function (lambda) {
    if (!this.modernaVisible(lambda)) return null;
    if (this._modernaTema !== this.t) { this._modernaTema = this.t; this._modernaCache = new Map(); }
    const k = Math.round(lambda * 1e11);
    if (this._modernaCache.has(k)) return this._modernaCache.get(k);
    const fondo = luminancia(rgbDe(this.t.lienzo).map(lineal)), oscuro = fondo < 0.2;
    let c = colorLongitudOnda(lambda).lineal;
    if (contraste(luminancia(c), fondo) < 3) {
      const [L, a, b] = oklab(c);
      let lo = oscuro ? L : 0, hi = oscuro ? 1 : L;
      for (let i = 0; i < 30; i++) {
        const m = (lo + hi) / 2, ok = contraste(luminancia(desdeOklab([m, a, b])), fondo) >= 3.05;
        if (oscuro) { if (ok) hi = m; else lo = m; } else if (ok) lo = m; else hi = m;
      }
      c = desdeOklab([oscuro ? hi : lo, a, b]);
    }
    this._modernaCache.set(k, c);
    return c;
  };
  /** Color css de la luz de longitud de onda λ (tinta fuera del visible). */
  P.modernaColorLuz = function (lambda, alfa = 1) {
    const c = this._modernaLuz(lambda);
    if (!c) { if (alfa >= 1) return this.t.tinta; const t = rgbDe(this.t.tinta).map(lineal); return css(t, alfa); }
    return css(c, alfa);
  };

  // ---------------------------------------------------------------------
  // Fototubo
  // ---------------------------------------------------------------------
  // Relleno de conductor en el camino actual (px): campo-activo y rayado cruzado fino
  function conductor(c, t, x0, y0, x1, y1) {
    c.fillStyle = t['campo-activo']; c.fill();
    c.save(); c.clip(); c.strokeStyle = t.linea; c.lineWidth = 1; c.beginPath();
    const h = y1 - y0;
    for (let k = x0 - h; k < x1 + h; k += 6) { c.moveTo(k, y0); c.lineTo(k + h, y1); c.moveTo(k + h, y0); c.lineTo(k, y1); }
    c.stroke(); c.restore();
  }

  /**
   * Placa vertical de conductor en x (mundo) entre y0 e y1, con su grosor
   * hacia el lado `lado` (−1: izquierda, +1: derecha).
   * o: {grosor (px), grueso (hover)}
   */
  P.modernaPlaca = function (x, y0, y1, lado = -1, o = {}) {
    const v = this.vista, X = v.X(x), Ya = v.Y(y1), Yb = v.Y(y0), e = o.grosor ?? GM.placa, c = this.ctx;
    const xa = lado < 0 ? X - e : X, xb = lado < 0 ? X : X + e;
    c.save(); c.setLineDash([]);
    c.beginPath(); c.rect(xa, Ya, xb - xa, Yb - Ya);
    conductor(c, this.t, xa, Ya, xb, Yb);
    c.beginPath(); c.rect(xa, Ya, xb - xa, Yb - Ya);
    c.strokeStyle = this.t.tinta; c.lineWidth = 1.5 + (o.grueso ? 0.5 : 0); c.stroke();
    c.restore();
    return { x: xa, y: Ya, w: xb - xa, h: Yb - Ya };
  };

  /** Tubo de vidrio al vacío: rectángulo redondeado de mundo [x0, x1, y0, y1]. */
  P.modernaTubo = function (caja, o = {}) {
    const v = this.vista, x0 = v.X(caja[0]), x1 = v.X(caja[1]), y0 = v.Y(caja[3]), y1 = v.Y(caja[2]), r = Math.min(26, (y1 - y0) / 4), c = this.ctx;
    const camino = (m) => { c.beginPath(); c.roundRect(x0 + m, y0 + m, x1 - x0 - 2 * m, y1 - y0 - 2 * m, Math.max(2, r - m)); };
    c.save(); c.setLineDash([]);
    // Pared de vidrio: tinte del 5 % entre dos líneas finas
    c.globalAlpha = 0.05; c.fillStyle = this.t.tinta;
    c.beginPath(); c.roundRect(x0, y0, x1 - x0, y1 - y0, r); c.roundRect(x0 + 4, y0 + 4, x1 - x0 - 8, y1 - y0 - 8, Math.max(2, r - 4)); c.fill('evenodd');
    c.globalAlpha = 1; c.strokeStyle = this.t['texto-2']; c.lineWidth = 1 + (o.grueso ? 0.5 : 0);
    camino(0); c.stroke(); camino(4); c.stroke();
    c.restore();
    // Marca de material del vidrio: tres trazos diagonales cortos en la esquina superior derecha
    const xm = x1 - 2, ym = y0 + 2;
    c.save(); c.strokeStyle = this.t['texto-3']; c.lineWidth = 1; c.lineCap = 'round'; c.beginPath();
    for (let i = 0; i < 3; i++) { const ox = xm - 14 - i * 3.5, oy = ym + 6 + i * 3.5; c.moveTo(ox - 2.5, oy + 2.5); c.lineTo(ox + 2.5, oy - 2.5); }
    c.stroke(); c.restore();
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };

  /** Lámpara en p (mundo) con la luz de λ; o: {encendida, grueso, apaga (bajo la mirada)} */
  P.modernaLampara = function (p, lambda, o = {}) {
    const [X, Y] = this.vista.P(p), r = GM.bombilla, c = this.ctx;
    c.save(); c.setLineDash([]);
    // Bombilla: tinte de su luz si está encendida
    c.beginPath(); c.arc(X, Y, r, 0, 2 * Math.PI);
    c.fillStyle = this.t.lienzo; c.fill();
    // En el tema oscuro el tinte va más lleno, para que la bombilla se vea encendida
    const oscuro = luminancia(rgbDe(this.t.lienzo).map(lineal)) < 0.2;
    if (o.encendida !== false) { c.fillStyle = this.modernaColorLuz(lambda, this.modernaVisible(lambda) ? (oscuro ? 0.9 : 0.5) : (oscuro ? 0.3 : 0.12)); c.fill(); }
    c.strokeStyle = this.t.tinta; c.lineWidth = 1.75 + (o.grueso ? 0.5 : 0); c.stroke();
    // Casquillo hacia el lado contrario a la salida de la luz
    const ang = o.direccion ?? 0, ux = Math.cos(ang), uy = -Math.sin(ang);
    const bx = X - ux * (r + 5), by = Y - uy * (r + 5), nx = -uy, ny = ux;
    c.beginPath(); c.moveTo(bx + nx * 6, by + ny * 6); c.lineTo(bx - nx * 6, by - ny * 6); c.lineTo(bx - nx * 6 - ux * 6, by - ny * 6 - uy * 6); c.lineTo(bx + nx * 6 - ux * 6, by + ny * 6 - uy * 6); c.closePath();
    c.fillStyle = this.t.tinta; c.fill();
    c.restore();
    return [X, Y];
  };

  /**
   * Haz de la lámpara (a, mundo) a la mancha (b, mundo): cono de luz con el
   * tinte de su color y el rayo central con flecha. o: {ancho (px junto a la lámpara), rel (0–1 intensidad)}
   */
  P.modernaHaz = function (a, b, lambda, o = {}) {
    const v = this.vista, [x1, y1] = v.P(a), [x2, y2] = v.P(b), L = Math.hypot(x2 - x1, y2 - y1); if (L < 4) return;
    const ux = (x2 - x1) / L, uy = (y2 - y1) / L, nx = -uy, ny = ux, w = (o.ancho ?? 10) / 2, rel = Math.max(0.15, Math.min(1, o.rel ?? 1)), c = this.ctx;
    const r0 = GM.bombilla + 2;
    c.save(); c.setLineDash([]);
    c.beginPath(); c.moveTo(x1 + ux * r0 + nx * w, y1 + uy * r0 + ny * w); c.lineTo(x2 + nx * 1.5, y2 + ny * 1.5); c.lineTo(x2 - nx * 1.5, y2 - ny * 1.5); c.lineTo(x1 + ux * r0 - nx * w, y1 + uy * r0 - ny * w); c.closePath();
    c.fillStyle = this.modernaColorLuz(lambda, 0.1 + 0.12 * rel); c.fill();
    const col = this.modernaColorLuz(lambda);
    c.globalAlpha = 0.45 + 0.55 * rel; c.strokeStyle = col; c.lineWidth = 1.5; c.lineCap = 'butt';
    if (!this.modernaVisible(lambda)) c.setLineDash(PATRON.previsto);
    c.beginPath(); c.moveTo(x1 + ux * r0, y1 + uy * r0); c.lineTo(x2, y2); c.stroke();
    // Punta llena a mitad del haz
    const mx = x1 + ux * (r0 + (L - r0) * 0.5), my = y1 + uy * (r0 + (L - r0) * 0.5), [lp, ap] = GM.punta;
    c.setLineDash([]); c.fillStyle = col; c.beginPath(); c.moveTo(mx + ux * lp / 2, my + uy * lp / 2);
    c.lineTo(mx - ux * lp / 2 + nx * ap / 2, my - uy * lp / 2 + ny * ap / 2); c.lineTo(mx - ux * lp * 0.3, my - uy * lp * 0.3); c.lineTo(mx - ux * lp / 2 - nx * ap / 2, my - uy * lp / 2 - ny * ap / 2); c.closePath(); c.fill();
    c.restore();
  };

  /** Fotón: paquete de onda centrado en p (mundo) que avanza en la dirección dir (mundo). */
  P.modernaFoton = function (p, dir, lambda, o = {}) {
    const [X, Y] = this.vista.P(p), [L, A] = GM.foton, ux = dir[0], uy = -dir[1], nx = -uy, ny = ux, c = this.ctx;
    c.save(); c.setLineDash([]); c.strokeStyle = this.modernaColorLuz(lambda); c.lineWidth = 1.5; c.lineCap = 'round'; c.lineJoin = 'round';
    c.globalAlpha = o.opacidad ?? 1;
    c.beginPath();
    for (let i = 0; i <= 40; i++) {
      const s = -L / 2 + L * i / 40, env = Math.exp(-((s / (L * 0.32)) ** 2)), d = A * env * Math.sin(2 * Math.PI * s / 5.5);
      const x = X + ux * s + nx * d, y = Y + uy * s + ny * d;
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.stroke(); c.restore();
  };

  /**
   * Fotoelectrón en p (mundo): carga negativa pequeña. o.v: velocidad en
   * px (pantalla, y hacia abajo) para dibujar su vector (familia movimiento).
   */
  P.modernaElectron = function (p, o = {}) {
    const [X, Y] = this.vista.P(p), r = GM.electron, c = this.ctx;
    c.save(); c.setLineDash([]); c.globalAlpha = o.opacidad ?? 1;
    c.fillStyle = this.t.lienzo; c.strokeStyle = this.t.tinta; c.lineWidth = 1.25;
    c.beginPath(); c.arc(X, Y, r, 0, 2 * Math.PI); c.fill(); c.stroke();
    c.lineWidth = 1.25; c.lineCap = 'round'; c.beginPath(); c.moveTo(X - 2.25, Y); c.lineTo(X + 2.25, Y); c.stroke();
    c.restore();
    if (o.v && Math.hypot(o.v[0], o.v[1]) > 3) {
      const L = Math.hypot(o.v[0], o.v[1]), ux = o.v[0] / L, uy = o.v[1] / L;
      this.flechaPx(X + ux * (r + 1), Y + uy * (r + 1), X + ux * (r + 1) + o.v[0], Y + uy * (r + 1) + o.v[1], { color: 'movimiento', grosor: 1.5, opacidad: o.opacidad ?? 1 });
    }
    return [X, Y];
  };

  /** Barra de escala en la unidad de pantalla (el mundo está en m): unidad 'cm', factor 100. */
  P.modernaBarraEscala = function (x, y, unidad = 'm', factor = 1) {
    const v = this.vista, m = global.Volta.pasoAgradable(80 / v.escala), L = m * v.escala;
    this.lineaPx([[x, y - 4], [x, y + 4]], { color: 'texto-2', grosor: 1.5 });
    this.lineaPx([[x + L, y - 4], [x + L, y + 4]], { color: 'texto-2', grosor: 1.5 });
    this.lineaPx([[x, y], [x + L, y]], { color: 'texto-2', grosor: 1.5 });
    this.texto(global.Volta.cantidad(m * factor, unidad, 2).replace(/\.0+(?=[\s ])/, ''), x + L / 2, y - 9, { fuente: 'num', tam: 11, color: 'texto-2', alinear: 'center', halo: true });
    return { x: x - 4, y: y - 22, w: L + 8, h: 30 };
  };

  /** Cable: polilínea de mundo en tinta (2 px). */
  P.modernaCable = function (pts, o = {}) { this.linea(pts, { color: 'tinta', grosor: G.materia + (o.grueso ? 0.5 : 0), extremo: 'round' }); };
  /** Nodo de unión de cables. */
  P.modernaNodo = function (p) { const [x, y] = this.vista.P(p), c = this.ctx; c.save(); c.fillStyle = this.t.tinta; c.beginPath(); c.arc(x, y, 3, 0, 2 * Math.PI); c.fill(); c.restore(); };

  /**
   * Batería IEC sobre un cable centrada en p (mundo): placa larga (+) hacia
   * el lado `positivo` (+1: derecha, o arriba si o.vertical; −1: al revés).
   * Tapa el cable por debajo del hueco.
   */
  P.modernaBateria = function (p, positivo = 1, o = {}) {
    const [X, Y] = this.vista.P(p), [larga, corta, h] = GM.bateria, c = this.ctx;
    c.save(); c.setLineDash([]); c.translate(X, Y); if (o.vertical) c.rotate(-Math.PI / 2);
    c.fillStyle = this.t.lienzo; c.fillRect(-h + 1, -larga - 1, 2 * h - 2, 2 * larga + 2);
    const xl = positivo * h, xc = -positivo * h;
    c.strokeStyle = this.t.tinta; c.lineCap = 'butt';
    c.lineWidth = G.materia + (o.grueso ? 0.5 : 0); c.beginPath(); c.moveTo(xl, -larga); c.lineTo(xl, larga); c.stroke();
    c.lineWidth = 4.5; c.beginPath(); c.moveTo(xc, -corta); c.lineTo(xc, corta); c.stroke();
    // Glifo + junto a la placa larga
    const gx = xl + positivo * 6, gy = -larga + 1;
    c.lineWidth = 1.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(gx - 3, gy); c.lineTo(gx + 3, gy); c.moveTo(gx, gy - 3); c.lineTo(gx, gy + 3); c.stroke();
    c.restore();
    return [X, Y];
  };

  /** Medidor IEC (círculo con su letra) en p (mundo). letra: 'A' | 'V'. */
  P.modernaMedidor = function (p, letra, o = {}) {
    const [X, Y] = this.vista.P(p), r = GM.medidor, c = this.ctx;
    c.save(); c.setLineDash([]); c.fillStyle = this.t.lienzo; c.strokeStyle = this.t.tinta; c.lineWidth = G.materia + (o.grueso ? 0.5 : 0);
    c.beginPath(); c.arc(X, Y, r, 0, 2 * Math.PI); c.fill(); c.stroke(); c.restore();
    this.texto(letra, X, Y + 0.5, { fuente: 'ui', tam: 13, peso: 600, alinear: 'center', base: 'middle', color: 'tinta' });
    return [X, Y];
  };

  /** Flecha del campo eléctrico de a a b (pantalla) con su símbolo. */
  P.modernaCampo = function (x1, y1, x2, y2, o = {}) {
    this.flechaPx(x1, y1, x2, y2, { color: 'electrico', grosor: 1.5, opacidad: o.opacidad ?? 1 });
    if (o.etiqueta !== false) this.compuesto([{ t: 'E', f: 'sim', tam: 14, color: 'electrico' }], (x1 + x2) / 2, Math.min(y1, y2) - 6, { alinear: 'center' });
  };

  // ---------------------------------------------------------------------
  // Carta de núclidos (mundo: x = N, y = Z; una casilla por unidad)
  // ---------------------------------------------------------------------
  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', m: 'ᵐ' };
  const volado = s => String(s).replace(/[0-9m]/g, d => SUP[d]);
  P.modernaVolado = volado;

  /**
   * Casilla del núclido (N, Z). o: {estable, simbolo, A, isomero, cadena
   * (contorno más grueso), grueso (hover), seleccionada, ocupacion (0–1)}
   */
  P.modernaCelda = function (N, Z, o = {}) {
    const v = this.vista, X = v.X(N), Y = v.Y(Z), lado = Math.max(3, v.escala * 0.88), c = this.ctx;
    const x0 = X - lado / 2, y0 = Y - lado / 2;
    c.save(); c.setLineDash([]);
    c.beginPath(); c.rect(x0, y0, lado, lado);
    c.fillStyle = o.estable ? this.t.tinta : this.t.campo; c.fill();
    if (!o.estable && o.ocupacion > 0) {
      // Ocupación de una muestra: barra de tinta desde abajo
      const h = lado * Math.min(1, o.ocupacion);
      c.fillStyle = this.t['texto-3']; c.fillRect(x0, y0 + lado - h, lado, h);
    }
    c.strokeStyle = this.t.tinta; c.lineWidth = (o.cadena ? 1.5 : 1) + (o.grueso ? 0.5 : 0); c.stroke();
    if (o.isomero) {
      // Isómero: esquina superior derecha recortada en diagonal
      c.beginPath(); c.moveTo(x0 + lado * 0.62, y0); c.lineTo(x0 + lado, y0 + lado * 0.38); c.strokeStyle = o.estable ? this.t['sobre-tinta'] : this.t.tinta; c.lineWidth = 1; c.stroke();
    }
    c.restore();
    if (o.seleccionada) this.seleccionCaja(x0, y0, lado, lado);
    if (lado >= 30 && o.simbolo) {
      const col = o.estable ? 'sobre-tinta' : 'texto';
      const tamS = Math.min(16, lado * 0.34), tamA = Math.min(11, lado * 0.24);
      this.compuesto([{ t: String(o.A) + (o.isomero ? 'm' : ''), f: 'num', tam: tamA, dy: -tamS * 0.38 }, { t: o.simbolo, f: 'ui', tam: tamS }], X, Y + tamS * 0.36, { alinear: 'center', color: col, halo: false });
    } else if (lado >= 18 && o.simbolo) {
      this.texto(o.simbolo, X, Y + 0.5, { fuente: 'ui', tam: Math.min(11, lado * 0.42), alinear: 'center', base: 'middle', color: o.estable ? 'sobre-tinta' : 'texto' });
    }
    return { x: x0, y: y0, w: lado, h: lado };
  };

  /**
   * Flecha de decaimiento entre las casillas de (N₁, Z₁) y (N₂, Z₂) con su
   * rótulo. o: {menor (rama < 50 %: discontinua y fina), rotulo: segmentos, grueso}
   */
  P.modernaFlechaDecaimiento = function (a, b, o = {}) {
    const v = this.vista, [x1, y1] = v.P(a), [x2, y2] = v.P(b), L = Math.hypot(x2 - x1, y2 - y1);
    const recorte = Math.min(L * 0.3, v.escala * 0.44 * Math.SQRT2 * 0.92);
    if (L < 2 * recorte + 6) return;
    const ux = (x2 - x1) / L, uy = (y2 - y1) / L;
    const ax = x1 + ux * recorte, ay = y1 + uy * recorte, bx = x2 - ux * recorte, by = y2 - uy * recorte;
    this.flechaPx(ax, ay, bx, by, { color: 'tinta', grosor: (o.menor ? 1 : 1.5) + (o.grueso ? 0.5 : 0), patron: o.menor ? 'componente' : 'continuo' });
    if (o.rotulo) {
      // Rótulo a un lado del tramo (primero del lado de arriba); si no cabe libre, del otro; si tampoco, no se escribe
      let nx = -uy, ny = ux; if (ny > 0 || (Math.abs(ny) < 1e-9 && nx > 0)) { nx = -nx; ny = -ny; }
      const al = n => (n < -0.3 ? 'right' : n > 0.3 ? 'left' : 'center');
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      this.modernaEtiqueta(o.rotulo, [[mx + nx * 8, my + ny * 8 + 4, al(nx)], [mx - nx * 8, my - ny * 8 + 4, al(-nx)]], { color: 'texto-2' });
    }
  };

  // ---------------------------------------------------------------------
  // Decaimiento puntual (pantalla)
  // ---------------------------------------------------------------------
  /** Núcleo: disco de tinta de radio r (px) en (x, y) de pantalla, con rótulo debajo. */
  P.modernaNucleoPx = function (x, y, r, o = {}) {
    const c = this.ctx;
    c.save(); c.setLineDash([]);
    if (o.fantasma) {
      c.globalAlpha = 0.6; c.fillStyle = this.t.lienzo; c.strokeStyle = this.t['texto-3']; c.lineWidth = 1.25; c.setLineDash(PATRON.previsto);
      c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.fill(); c.stroke();
    } else {
      c.fillStyle = this.t.tinta; c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.fill();
    }
    c.restore();
    if (o.rotulo) this.compuesto(o.rotulo, x, y + r + 15, { alinear: 'center', color: o.fantasma ? 'texto-3' : 'texto' });
  };

  /**
   * Partícula ligera en (x, y) de pantalla: 'alfa' (núcleo pequeño), 'e-',
   * 'e+' (cargas con su glifo), 'nu' (anillo pequeño), 'gamma' (paquete de
   * onda en tinta), 'n' (neutrón: disco de lienzo con contorno).
   */
  P.modernaParticulaPx = function (x, y, tipo, o = {}) {
    const c = this.ctx;
    c.save(); c.setLineDash([]); c.strokeStyle = this.t.tinta; c.fillStyle = this.t.tinta; c.lineWidth = 1.5;
    if (tipo === 'alfa') { c.beginPath(); c.arc(x, y, 5.5, 0, 2 * Math.PI); c.fill(); }
    else if (tipo === 'e-' || tipo === 'e+') {
      const r = 6; c.fillStyle = tipo === 'e+' ? this.t.tinta : this.t.lienzo; c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.fill(); c.stroke();
      c.strokeStyle = tipo === 'e+' ? this.t['sobre-tinta'] : this.t.tinta; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - 3, y); c.lineTo(x + 3, y);
      if (tipo === 'e+') { c.moveTo(x, y - 3); c.lineTo(x, y + 3); }
      c.stroke();
    } else if (tipo === 'nu') { c.lineWidth = 1.25; c.beginPath(); c.arc(x, y, 3.5, 0, 2 * Math.PI); c.stroke(); }
    else if (tipo === 'n') { c.fillStyle = this.t.lienzo; c.lineWidth = 1.25; c.beginPath(); c.arc(x, y, 4.5, 0, 2 * Math.PI); c.fill(); c.stroke(); }
    else if (tipo === 'gamma') {
      const ang = o.direccion ?? 0, ux = Math.cos(ang), uy = -Math.sin(ang), nx = -uy, ny = ux, [L, A] = GM.foton;
      c.lineWidth = 1.5; c.lineCap = 'round'; c.beginPath();
      for (let i = 0; i <= 40; i++) {
        const s = -L / 2 + L * i / 40, env = Math.exp(-((s / (L * 0.32)) ** 2)), d = A * env * Math.sin(2 * Math.PI * s / 4.5);
        if (i) c.lineTo(x + ux * s + nx * d, y + uy * s + ny * d); else c.moveTo(x + ux * s + nx * d, y + uy * s + ny * d);
      }
      c.stroke();
    }
    c.restore();
    if (o.rotulo) this.compuesto(o.rotulo, x + (o.rx ?? 0), y + (o.ry ?? -12), { alinear: o.alinear || 'center', color: 'texto' });
  };

  /** Radio (px) con que se dibuja una partícula ligera: para que su vector nazca en el borde. */
  P.modernaRadioParticula = tipo => ({ alfa: 5.5, 'e-': 6, 'e+': 6, nu: 3.5, n: 4.5, gamma: 11 })[tipo] ?? 4;

  // ---------------------------------------------------------------------
  // Etiquetas sin solaparse: modernaEtiquetas() vacía la lista al empezar
  // a dibujar (con las zonas reservadas: barras flotantes, símbolos);
  // modernaReservar() mide la etiqueta y la acepta si cabe libre;
  // modernaEtiqueta() prueba varias posiciones y escribe en la primera libre.
  // ---------------------------------------------------------------------
  P.modernaEtiquetas = function (zonas = []) { this._modernaOcupado = zonas.map(z => ({ ...z })); };
  P.modernaOcupar = function (z) { (this._modernaOcupado || (this._modernaOcupado = [])).push({ ...z }); };
  P.modernaReservar = function (segs, x, y, alinear = 'left') {
    const c = this.ctx; let w = 0;
    c.save(); for (const s of segs) { c.font = this._fuente(s.f, s.tam || 12); w += c.measureText(s.t).width; } c.restore();
    const x0 = alinear === 'right' ? x - w : alinear === 'center' ? x - w / 2 : x, r = { x: x0 - 2, y: y - 13, w: w + 4, h: 17 };
    if (r.x < 2 || r.x + r.w > this.w - 2 || r.y < 2 || r.y + r.h > this.h - 2) return false;
    const lista = this._modernaOcupado || (this._modernaOcupado = []);
    if (lista.some(q => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y)) return false;
    lista.push(r); return true;
  };
  /** cands: [[x, y, alinear]]; o: opciones de compuesto(). Devuelve si se escribió. */
  P.modernaEtiqueta = function (segs, cands, o = {}) {
    for (const [x, y, al] of cands) if (this.modernaReservar(segs, x, y, al || 'left')) { this.compuesto(segs, x, y, { ...o, alinear: al || 'left' }); return true; }
    return false;
  };
  /** Ficha que no se monta sobre otras etiquetas: prueba las esquinas dadas. cands: [[x, y]] (esquina superior izquierda). */
  P.modernaFicha = function (filas, cands, o = {}) {
    const c = this.ctx; let ancho = 0;
    c.save();
    for (const segs of filas) { let w = 0; for (const s of segs) { c.font = this._fuente(s.f, s.tam || 11.5); w += c.measureText(s.t).width; } ancho = Math.max(ancho, w); }
    c.restore();
    const W = ancho + 16, H = filas.length * 16 + 10, lista = this._modernaOcupado || (this._modernaOcupado = []);
    for (const [x, y] of cands) {
      const r = { x, y, w: W + 1, h: H + 1 };
      if (r.x < 2 || r.x + r.w > this.w - 2 || r.y < 2 || r.y + r.h > this.h - 2) continue;
      if (lista.some(q => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y)) continue;
      lista.push(r); this.ficha(x, y, filas, o); return r;
    }
    return null;
  };
})(window);
