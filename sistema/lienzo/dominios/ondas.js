/* ==========================================================================
   Volta — gramática del lienzo · dominio Ondas y sonido
   Símbolos propios del módulo, según la sección 7 de
   docs/04_lenguaje_de_diseno.md:
   - el medio es materia: la cuerda en tinta (más gruesa donde es más
     densa), la columna de aire entre paredes de tubo en tinta y el agua de
     un canal como fluido (tinte del 6 % de tinta con rayitas);
   - extremos: soporte fijo (superficie rayada), anillo libre que desliza
     por una varilla, extremo absorbente (la cuerda sigue en trazo previsto:
     nada vuelve), tubo cerrado por un tapón o un pistón (cuerpo rígido) y
     abierto sin más;
   - fuentes: oscilador (caja con una senoide, en tinta) y altavoz;
   - partículas del aire (discos en --texto-2, una de cada tantas en tinta
     para seguirla) y banda de presión con el mapa divergente (azul
     enrarecido ← lienzo → bermellón comprimido, en OKLab);
   - instrumentos: sondas con su línea de lectura, regla de λ (cota) y
     marcas de nodo N (disco lleno) y antinodo A (anillo);
   - magnitudes: rapidez de la onda en la familia movimiento y aceleración
     del medio en la familia cambio;
   - Doppler: frentes de onda (1 px de tinta al 60 %, sin flecha), fuente
     sonora, observador y pared reflectante.
   Métodos con prefijo ondas, para poder cargarse junto a otros dominios.
   Mismas convenciones que trazo.js: grosores en px de pantalla (no escalan
   con el zoom), patrones de PATRON, colores de this.t, halo en toda
   etiqueta. Coordenadas de mundo: x en m; y en las unidades que fije la
   pantalla (desplazamiento ampliado). Requiere trazo.js.
   ========================================================================== */
(function (global) {
  'use strict';
  const { Trazo, G } = global.Volta;
  const P = Trazo.prototype;

  // Medidas propias del dominio (px de pantalla)
  const GO = {
    soporte: 34,           // semialto del soporte fijo y de la varilla del anillo
    anillo: 4.5,           // radio del anillo del extremo libre
    oscilador: [22, 16],   // ancho y alto de la caja del oscilador
    previsto: 46,          // largo de la cuerda que sigue tras un extremo absorbente
    sonda: 4.5,            // radio del anillo de la sonda
    nodo: 3.5,             // radio de las marcas N y A
    particula: [1.6, 2.1], // radio de las partículas (normal, marcada)
    pared: 2,              // grosor de las paredes del tubo (materia)
    altavoz: [10, 12, 22], // ancho del imán, largo del cono y alto de la boca
    observador: 6,         // radio de la cabeza del observador
  };

  // ---------------------------------------------------------------------
  // Mapa divergente en OKLab: azul ← lienzo → bermellón
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
  const gamma = x => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  function aOklab(rgb) {
    const [r, g, b] = rgb.map(lineal);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function deOklab([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    return `rgb(${rgb.map(x => Math.round(255 * Math.min(1, Math.max(0, gamma(x))))).join(' ')})`;
  }
  // f en [−1, 1]: −1 azul (enrarecido), 0 lienzo, 1 bermellón (comprimido)
  P.ondasColorMapa = function (f) {
    const t = this.t;
    if (this._ondasMapaDe !== t) {
      this._ondasMapaDe = t;
      this._ondasMapa = { c: aOklab(rgbDe(t.lienzo)), n: aOklab(rgbDe(t['mapa-divergente-negativo'])), p: aOklab(rgbDe(t['mapa-divergente-positivo'])) };
    }
    const k = Math.max(-1, Math.min(1, f)), { c, n, p } = this._ondasMapa, e = k < 0 ? n : p, a = Math.abs(k);
    return deOklab(c.map((x, i) => x + (e[i] - x) * a));
  };

  // ---------------------------------------------------------------------
  // 1 · Fondo: cuadrícula y ejes con escala vertical propia
  // ---------------------------------------------------------------------
  // El desplazamiento de una onda se dibuja ampliado: la vista lleva
  // escalaY (px por unidad de y) además de escala (px por m en x). Mismos
  // tokens, pasos 1-2-5 y marcas que cuadricula() y ejes() del núcleo, cada
  // eje con su paso.
  const pasoMenor = m => m / (String(m).startsWith('2') ? 4 : 5);
  P.ondasCuadricula = function () {
    const c = this.ctx, v = this.vista, ey = v.escalaY ?? v.escala, pa = global.Volta.pasoAgradable;
    const mx = pa(90 / v.escala), my = pa(56 / ey);
    const x0 = v.mx(0), x1 = v.mx(this.w), y0 = v.my(this.h), y1 = v.my(0);
    c.save(); c.lineWidth = 1; c.setLineDash([]);
    for (const [px, py, col] of [[pasoMenor(mx), pasoMenor(my), this.t['cuadricula-menor']], [mx, my, this.t['cuadricula-mayor']]]) {
      c.strokeStyle = col; c.beginPath();
      for (let x = Math.ceil(x0 / px) * px; x <= x1; x += px) { const X = Math.round(v.X(x)) + 0.5; c.moveTo(X, 0); c.lineTo(X, this.h); }
      for (let y = Math.ceil(y0 / py) * py; y <= y1; y += py) { const Y = Math.round(v.Y(y)) + 0.5; c.moveTo(0, Y); c.lineTo(this.w, Y); }
      c.stroke();
    }
    c.restore();
    this._ondasPasos = [mx, my];
  };

  // Ejes: o = {x, ux, y, uy, fy (factor de las marcas de y: 100 para cm),
  // xEje (abscisa del eje y), huecos: [[x, y, r] px], sinY, yMarcasX (ordenada
  // de pantalla de los números de x si no van sobre el eje)}
  P.ondasEjes = function (o = {}) {
    const c = this.ctx, v = this.vista, [mx, my] = this._ondasPasos || [1, 1], t = this.t, fmtMarca = global.Volta.fmtMarca;
    const X0 = Math.round(v.X(o.xEje ?? 0)) + 0.5, Y0 = Math.round(v.Y(0)) + 0.5;
    c.save(); c.strokeStyle = t.eje; c.lineWidth = 1; c.setLineDash([]); c.beginPath();
    if (!o.sinY) { c.moveTo(0, Y0); c.lineTo(this.w, Y0); c.moveTo(X0, 0); c.lineTo(X0, this.h); }
    c.stroke(); c.restore();
    const tapado = (x, y) => (o.huecos || []).some(([hx, hy, hr]) => Math.hypot(x - hx, y - hy) < hr + 10);
    const yNum = o.yMarcasX ?? Y0 + 5;
    for (let x = Math.ceil(v.mx(0) / mx) * mx; x <= v.mx(this.w); x += mx) {
      const X = v.X(x);
      if ((!o.sinY && Math.abs(x - (o.xEje ?? 0)) < mx / 2) || X > this.w - 60 || X < 20 || tapado(X, yNum + 6)) continue;
      if (o.sinY) this.lineaPx([[X, yNum - 6], [X, yNum - 2]], { color: 'eje', grosor: 1, extremo: 'butt' });
      this.texto(fmtMarca(x, mx), X, yNum, { fuente: 'num', tam: 11, color: 'texto-3', alinear: 'center', base: 'top', halo: true });
    }
    const fy = o.fy ?? 1;
    if (!o.sinY) {
      for (let y = Math.ceil(v.my(this.h) / my) * my; y <= v.my(0); y += my) {
        const Y = v.Y(y);
        if (Math.abs(y) < my / 2 || Y < 34 || Y > this.h - 12 || tapado(X0 - 14, Y)) continue;
        this.texto(fmtMarca(y * fy, my * fy), X0 - 6, Y, { fuente: 'num', tam: 11, color: 'texto-3', alinear: 'right', base: 'middle', halo: true });
      }
    }
    // Rótulos de los ejes, apartados de las barras flotantes
    const zonas = this.zonasFlotantes();
    const choca = (x, y, w, h) => zonas.find(z => x < z.x + z.w && x + w > z.x && y < z.y + z.h && y + h > z.y);
    if (o.x) {
      let xd = this.w - 12, z; const yr = o.sinY ? yNum + 7 : Y0 - 8;
      for (let i = 0; i < 4 && (z = choca(xd - 70, yr - 14, 70, 20)); i++) xd = z.x - 8;
      this.compuesto([{ t: o.x, f: 'sim', tam: 14 }, { t: ' (' + (o.ux || 'm') + ')', f: 'ui', tam: 11 }], xd, yr + (o.sinY ? 4 : 0), { color: 'texto-3', alinear: 'right' });
    }
    if (o.y && !o.sinY) {
      let yb = 18, z;
      for (let i = 0; i < 4 && (z = choca(X0 + 8, yb - 14, 70, 20)); i++) yb = z.y + z.h + 18;
      this.compuesto([{ t: o.y, f: 'sim', tam: 14 }, { t: ' (' + (o.uy || 'm') + ')', f: 'ui', tam: 11 }], X0 + 8, yb, { color: 'texto-3' });
    }
  };

  // ---------------------------------------------------------------------
  // 3 · Geometría fija: soportes y paredes
  // ---------------------------------------------------------------------
  // Soporte fijo: pared vertical rayada del lado de fuera. p: punto de
  // anclaje (mundo); lado: 'izq' (la pared queda a la izquierda) o 'der'.
  P.ondasSoporte = function (p, lado, o = {}) {
    const v = this.vista, [x, y] = v.P(p), h = o.alto ?? GO.soporte;
    const arriba = [v.mx(x), v.my(y - h)], abajo = [v.mx(x), v.my(y + h)];
    // superficie(): el rayado va a la derecha del sentido de recorrido en pantalla
    if (lado === 'izq') this.superficie([arriba, abajo]); else this.superficie([abajo, arriba]);
  };

  // Extremo libre: varilla vertical (rayada en su base) por la que desliza un
  // anillo sin rozamiento. p0: punto de equilibrio; y: desplazamiento actual.
  P.ondasAnillo = function (p0, yMundo, o = {}) {
    const v = this.vista, [x, y0] = v.P(p0), h = o.alto ?? GO.soporte, [, y] = v.P([p0[0], yMundo]);
    const top = Math.min(y0 - h, y - 10), bot = Math.max(y0 + h, y + 10);
    this.lineaPx([[x, top], [x, bot]], { color: 'texto-2', grosor: G.real, extremo: 'butt' });
    this.superficie([[v.mx(x - 7), v.my(bot)], [v.mx(x + 7), v.my(bot)]]);
    const c = this.ctx;
    c.save(); c.setLineDash([]); c.fillStyle = this.t.lienzo; c.strokeStyle = this.t.tinta; c.lineWidth = G.materia + (o.grueso ? 0.5 : 0);
    c.beginPath(); c.arc(x, y, GO.anillo, 0, 2 * Math.PI); c.fill(); c.stroke(); c.restore();
    return [x, y];
  };

  // Extremo absorbente: la cuerda sigue más allá, en trazo previsto (lo que
  // sale no vuelve). p: extremo (mundo); lado: hacia dónde sigue.
  P.ondasAbsorbente = function (p, lado, o = {}) {
    const [x, y] = this.vista.P(p), s = lado === 'izq' ? -1 : 1, L = o.largo ?? GO.previsto;
    this.lineaPx([[x, y], [x + s * L, y]], { color: 'texto-3', grosor: G.previsto, patron: 'previsto', extremo: 'butt' });
    this.lineaPx([[x, y - 5], [x, y + 5]], { color: 'texto-3', grosor: 1, extremo: 'butt' });
  };

  // ---------------------------------------------------------------------
  // 4 · Medios
  // ---------------------------------------------------------------------
  // Cuerda: polilínea de mundo. o.grosores: [[x0, x1, px]] por tramos (la
  // cuerda más densa, más gruesa); o.grueso: hover.
  P.ondasCuerda = function (pts, o = {}) {
    const tramos = o.grosores || [[-Infinity, Infinity, G.materia]];
    const extra = o.grueso ? 0.5 : 0;
    for (const [x0, x1, w] of tramos) {
      const sel = [];
      for (let i = 0; i < pts.length; i++) {
        const x = pts[i][0];
        if (x >= x0 - 1e-12 && x <= x1 + 1e-12) sel.push(pts[i]);
      }
      if (sel.length > 1) this.linea(sel, { color: 'tinta', grosor: w + extra, extremo: 'butt' });
    }
  };

  // Unión entre dos medios: trazo corto vertical en la junta (eje auxiliar)
  P.ondasUnion = function (x, yMin, yMax) {
    const v = this.vista;
    this.lineaPx([[v.X(x), v.Y(yMax)], [v.X(x), v.Y(yMin)]], { color: 'texto-3', grosor: 1, patron: 'eje', extremo: 'butt' });
  };

  // Tubo: paredes de materia entre x0 y x1 (mundo) con semialto h (px)
  // alrededor de la línea y = yc. Devuelve [X0, X1, Ysup, Yinf] de pantalla.
  P.ondasTubo = function (x0, x1, yc, h, o = {}) {
    const v = this.vista, X0 = v.X(x0), X1 = v.X(x1), Y = v.Y(yc);
    const w = GO.pared + (o.grueso ? 0.5 : 0);
    this.lineaPx([[X0, Y - h], [X1, Y - h]], { grosor: w, extremo: 'butt' });
    this.lineaPx([[X0, Y + h], [X1, Y + h]], { grosor: w, extremo: 'butt' });
    return [X0, X1, Y - h, Y + h];
  };

  // Tapón de un extremo cerrado: pared rayada que cierra el tubo
  P.ondasTapon = function (x, yc, h, lado) {
    const v = this.vista, X = v.X(x), Y = v.Y(yc), s = lado === 'izq' ? -1 : 1, e = 8;
    const pts = [[X, Y - h - 1], [X + s * e, Y - h - 1], [X + s * e, Y + h + 1], [X, Y + h + 1]];
    const c = this.ctx;
    c.save(); c.setLineDash([]);
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
    c.fillStyle = this.t.lienzo; c.fill(); c.clip();
    c.strokeStyle = this.t['texto-3']; c.lineWidth = 1; c.beginPath();
    for (let k = -2 * h; k < e + 2 * h; k += 5) { c.moveTo(X + s * k, Y + h + 1); c.lineTo(X + s * (k - 2 * h - 2), Y - h - 1); }
    c.stroke(); c.restore();
    this.lineaPx([[X, Y - h], [X, Y + h]], { grosor: G.materia, extremo: 'butt' });
  };

  // Pistón: cuerpo rígido (relleno --campo, contorno de materia) que cierra
  // el tubo en x, con su vástago hacia fuera
  P.ondasPiston = function (x, yc, h, lado, o = {}) {
    const v = this.vista, X = v.X(x), Y = v.Y(yc), s = lado === 'izq' ? -1 : 1, e = 12;
    const c = this.ctx, a = Math.min(X, X + s * e);
    c.save(); c.setLineDash([]);
    c.fillStyle = this.t.campo; c.fillRect(a, Y - h + 1, e, 2 * h - 2);
    c.strokeStyle = this.t.tinta; c.lineWidth = G.materia + (o.grueso ? 0.5 : 0); c.strokeRect(a, Y - h + 1, e, 2 * h - 2);
    c.restore();
    const largo = o.vastago ?? 40;
    this.lineaPx([[X + s * e, Y - 2.5], [X + s * (e + largo), Y - 2.5]], { grosor: 1.5, extremo: 'butt' });
    this.lineaPx([[X + s * e, Y + 2.5], [X + s * (e + largo), Y + 2.5]], { grosor: 1.5, extremo: 'butt' });
    this.lineaPx([[X + s * (e + largo), Y - 2.5], [X + s * (e + largo), Y + 2.5]], { grosor: 1.5, extremo: 'butt' });
    return [a, Y - h, e, 2 * h];
  };

  // Partículas del aire: columnas en las posiciones de equilibrio xEq (mundo)
  // desplazadas dx (px); una columna de cada `marca` va en tinta para poder
  // seguirla. filas: número de filas entre Ysup e Yinf (pantalla).
  P.ondasParticulas = function (xEq, dxPx, Ysup, Yinf, o = {}) {
    const c = this.ctx, v = this.vista, filas = o.filas ?? 5, marca = o.marca ?? 8;
    const [r0, r1] = GO.particula, paso = (Yinf - Ysup) / (filas + 1);
    c.save(); c.setLineDash([]);
    c.beginPath(); c.rect(v.X(xEq[0]) - 4, Ysup + 2, v.X(xEq[xEq.length - 1]) - v.X(xEq[0]) + 8, Yinf - Ysup - 4); c.clip();
    for (const [color, r, sel] of [['texto-3', r0, i => i % marca !== 0], ['tinta', r1, i => i % marca === 0]]) {
      c.fillStyle = this.color(color); c.beginPath();
      for (let i = 0; i < xEq.length; i++) {
        if (!sel(i)) continue;
        const X = v.X(xEq[i]) + dxPx[i];
        for (let f = 1; f <= filas; f++) {
          // Filas alternas con medio paso de desfase: se lee como un gas, no como una rejilla
          const Y = Ysup + f * paso, d = (f % 2) * 0.35 * (v.X(xEq[1] ?? xEq[0]) - v.X(xEq[0]));
          c.moveTo(X + d + r, Y); c.arc(X + d, Y, r, 0, 2 * Math.PI);
        }
      }
      c.fill();
    }
    c.restore();
  };

  // Banda con el mapa divergente: x (mundo), valores f ∈ [−1, 1], entre las
  // ordenadas de pantalla Ya y Yb
  P.ondasBanda = function (xs, fs, Ya, Yb) {
    const c = this.ctx, v = this.vista;
    c.save(); c.setLineDash([]);
    for (let i = 0; i < xs.length - 1; i++) {
      const X0 = v.X(xs[i]), X1 = v.X(xs[i + 1]);
      c.fillStyle = this.ondasColorMapa((fs[i] + fs[i + 1]) / 2);
      c.fillRect(Math.floor(X0), Ya, Math.ceil(X1) - Math.floor(X0) + 1, Yb - Ya);
    }
    c.restore();
    this.lineaPx([[v.X(xs[0]), Ya + 0.5], [v.X(xs[xs.length - 1]), Ya + 0.5], [v.X(xs[xs.length - 1]), Yb - 0.5], [v.X(xs[0]), Yb - 0.5]], { color: 'linea', grosor: 1, cerrar: true, extremo: 'butt' });
  };

  // Agua de un canal: fluido bajo la superficie (puntos de mundo) hasta el
  // fondo (y de mundo), con su rayita bajo la superficie
  P.ondasAgua = function (pts, yFondo) {
    const c = this.ctx, v = this.vista, Yf = v.Y(yFondo);
    c.save(); c.setLineDash([]); c.globalAlpha = 0.06; c.fillStyle = this.t.tinta;
    c.beginPath(); pts.forEach((p, i) => { const [X, Y] = v.P(p); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); });
    c.lineTo(v.X(pts[pts.length - 1][0]), Yf); c.lineTo(v.X(pts[0][0]), Yf); c.closePath(); c.fill(); c.restore();
    const xm = (pts[0][0] + pts[pts.length - 1][0]) / 2, i = Math.round((pts.length - 1) / 2), Ym = v.Y(pts[i][1]), a = 10;
    this.lineaPx([[v.X(xm) - a, Ym + 7], [v.X(xm) + a, Ym + 7]], { color: 'texto-3', grosor: 1, extremo: 'butt' });
    this.lineaPx([[v.X(xm) - a / 2, Ym + 11], [v.X(xm) + a / 2, Ym + 11]], { color: 'texto-3', grosor: 1, extremo: 'butt' });
  };

  // ---------------------------------------------------------------------
  // 5 · Construcción: componentes, envolvente
  // ---------------------------------------------------------------------
  // Curva de construcción: 'incidente' (previsto) o 'reflejada' (auxiliar)
  P.ondasComponente = function (pts, tipo) {
    if (tipo === 'incidente') this.linea(pts, { color: 'texto-2', grosor: G.previsto, patron: 'previsto', extremo: 'butt' });
    else this.linea(pts, { color: 'texto-2', grosor: 1.25, patron: 'auxiliar' });
  };
  // Envolvente ±|y|max: dos curvas auxiliares
  P.ondasEnvolvente = function (xs, env, yc = 0) {
    const sup = [], inf = [];
    for (let i = 0; i < xs.length; i++) { sup.push([xs[i], yc + env[i]]); inf.push([xs[i], yc - env[i]]); }
    this.linea(sup, { color: 'texto-3', grosor: G.auxiliar, patron: 'auxiliar' });
    this.linea(inf, { color: 'texto-3', grosor: G.auxiliar, patron: 'auxiliar' });
  };

  // ---------------------------------------------------------------------
  // 6 · Materia: fuentes
  // ---------------------------------------------------------------------
  // Oscilador que mueve el extremo: caja con una senoide, unida al extremo
  // por un vástago vertical. p: extremo (mundo, en su posición actual);
  // yBase: ordenada de pantalla de la caja (debajo del medio).
  P.ondasOscilador = function (p, yBase, o = {}) {
    const v = this.vista, [x, y] = v.P(p), [W, H] = GO.oscilador, c = this.ctx;
    this.lineaPx([[x, y], [x, yBase - H / 2]], { grosor: 1.5, extremo: 'butt' });
    c.save(); c.setLineDash([]);
    c.fillStyle = this.t.campo; c.strokeStyle = this.t.tinta; c.lineWidth = G.materia + (o.grueso ? 0.5 : 0);
    c.beginPath(); c.roundRect(x - W / 2, yBase - H / 2, W, H, 3); c.fill(); c.stroke();
    c.lineWidth = 1.25; c.beginPath();
    for (let k = 0; k <= 16; k++) { const u = k / 16, X = x - W / 2 + 4 + u * (W - 8), Y = yBase - 3.5 * Math.sin(u * 2 * Math.PI); if (k) c.lineTo(X, Y); else c.moveTo(X, Y); }
    c.stroke(); c.restore();
    // Base rayada bajo la caja
    this.superficie([[v.mx(x - W / 2 - 3), v.my(yBase + H / 2 + 1)], [v.mx(x + W / 2 + 3), v.my(yBase + H / 2 + 1)]]);
    return [x - W / 2, yBase - H / 2, W, H];
  };

  // Altavoz junto a la boca de un tubo: imán y cono abiertos hacia el tubo.
  // X, Y: pantalla del centro de la boca del cono; lado: hacia dónde mira.
  P.ondasAltavoz = function (X, Y, lado = 'der', o = {}) {
    const [a, l, b] = GO.altavoz, s = lado === 'der' ? 1 : -1, c = this.ctx;
    const iman = [[X - s * (l + a), Y - 5], [X - s * l, Y - 5], [X - s * l, Y + 5], [X - s * (l + a), Y + 5]];
    const cono = [[X - s * l, Y - 5], [X, Y - b / 2], [X, Y + b / 2], [X - s * l, Y + 5]];
    c.save(); c.setLineDash([]); c.lineJoin = 'round';
    for (const pts of [iman, cono]) {
      c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
      c.fillStyle = this.t.campo; c.fill(); c.strokeStyle = this.t.tinta; c.lineWidth = 1.5 + (o.grueso ? 0.5 : 0); c.stroke();
    }
    c.restore();
    return [Math.min(X, X - s * (l + a)), Y - b / 2, l + a, b];
  };

  // ---------------------------------------------------------------------
  // 7 · Magnitudes
  // ---------------------------------------------------------------------
  // Rapidez de la onda: flecha horizontal de la familia movimiento sobre el
  // frente, con su etiqueta v = … m/s
  P.ondasRapidez = function (X, Y, sentido, valor, o = {}) {
    const L = o.largo ?? 36, s = sentido >= 0 ? 1 : -1;
    this.flechaPx(X - s * L / 2, Y, X + s * L / 2, Y, { color: 'movimiento', grosor: G.vector });
    this.etiquetaMagnitud(X + s * (L / 2 + 8), Y + 5, { simbolo: 'v', valor, unidad: 'm/s', color: 'movimiento', alinear: s > 0 ? 'left' : 'right', cifras: o.cifras ?? 3 });
  };

  // ---------------------------------------------------------------------
  // 8 · Instrumentos
  // ---------------------------------------------------------------------
  // Sonda: línea de lectura vertical (auxiliar) entre Ya e Yb, anillo en el
  // punto del medio y chip con su nombre (segmentos) arriba
  P.ondasSonda = function (X, Ymedio, Ya, Yb, nombre, o = {}) {
    this.lineaPx([[X, Ya], [X, Yb]], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
    const c = this.ctx;
    c.save(); c.setLineDash([]); c.fillStyle = this.t.lienzo; c.strokeStyle = this.t.tinta; c.lineWidth = 1.5 + (o.grueso ? 0.5 : 0);
    c.beginPath(); c.arc(X, Ymedio, GO.sonda, 0, 2 * Math.PI); c.fill(); c.stroke();
    c.fillStyle = this.t.tinta; c.beginPath(); c.arc(X, Ymedio, 1.5, 0, 2 * Math.PI); c.fill(); c.restore();
    if (nombre) {
      // Chip: fondo de tinta y texto sobre tinta (instrumento, no magnitud)
      c.save(); c.font = this._fuente('ui', 11, 500);
      const w = nombre.reduce((s, g) => { c.font = this._fuente(g.f || 'ui', g.tam || 11, 500); return s + c.measureText(g.t).width; }, 0) + 10;
      c.fillStyle = this.t.tinta; c.beginPath(); c.roundRect(X - w / 2, Ya - 17, w, 17, 4); c.fill(); c.restore();
      this.compuesto(nombre.map(g => ({ ...g, color: 'sobre-tinta' })), X, Ya - 5, { alinear: 'center', halo: false });
    }
    if (o.seleccionada) this.seleccionCirculo(X, Ymedio, GO.sonda + 6);
  };

  // Marcas de nodo (N, disco lleno) y antinodo (A, anillo) sobre la línea
  // de equilibrio; la letra va debajo, con halo
  P.ondasNodos = function (xs, yc, tipo, o = {}) {
    const v = this.vista, c = this.ctx, Y = v.Y(yc), r = GO.nodo;
    for (const x of xs) {
      const X = v.X(x);
      c.save(); c.setLineDash([]); c.lineWidth = 1.5; c.strokeStyle = this.t.tinta;
      c.fillStyle = tipo === 'N' ? this.t.tinta : this.t.lienzo;
      c.beginPath(); c.arc(X, Y, r, 0, 2 * Math.PI); c.fill(); c.stroke(); c.restore();
      this.texto(tipo, X, Y + (o.abajo ?? 18), { fuente: 'ui', tam: 11.5, peso: 500, color: 'texto-2', alinear: 'center', halo: true });
    }
  };

  // Regla entre dos abscisas (mundo) a la altura Y de pantalla: cota con
  // flechas abiertas, líneas de referencia hasta el medio y asas en los
  // extremos para arrastrarla. texto: segmentos de compuesto().
  P.ondasRegla = function (xa, xb, Y, texto, o = {}) {
    const v = this.vista, Xa = v.X(xa), Xb = v.X(xb), Yr = o.hasta;
    if (Yr != null) {
      this.lineaPx([[Xa, Y - 4], [Xa, Yr]], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
      this.lineaPx([[Xb, Y - 4], [Xb, Yr]], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
    }
    if (Math.abs(Xb - Xa) > 4) this.flechaPx(Xa, Y, Xb, Y, { color: 'texto-2', grosor: 1, punta: 'abierta', ambas: true });
    if (texto) this.compuesto(texto, (Xa + Xb) / 2, Y - 7, { alinear: 'center', color: 'texto-2' });
    if (o.asas !== false) { this.asa(Xa, Y); this.asa(Xb, Y); }
  };

  // Barra de escala en m (o la unidad dada)
  P.ondasBarraEscala = function (x, y, unidad = 'm') {
    const v = this.vista, m = global.Volta.pasoAgradable(80 / v.escala), L = m * v.escala;
    this.lineaPx([[x, y - 4], [x, y + 4]], { color: 'texto-2', grosor: 1.5 });
    this.lineaPx([[x + L, y - 4], [x + L, y + 4]], { color: 'texto-2', grosor: 1.5 });
    this.lineaPx([[x, y], [x + L, y]], { color: 'texto-2', grosor: 1.5 });
    this.texto(global.Volta.cantidad(m, unidad, 2).replace(/\.0+(?=[\s ])/, ''), x + L / 2, y - 9, { fuente: 'num', tam: 11, color: 'texto-2', alinear: 'center', halo: true });
  };

  // ---------------------------------------------------------------------
  // Doppler: frentes, fuente sonora, observador, pared
  // ---------------------------------------------------------------------
  // Frente de onda: circunferencia de 1 px de tinta al 60 %, sin flecha.
  // o.recorte: semiplano {n:[nx, ny] de mundo, d} donde vale (n·x ≥ d).
  P.ondasFrente = function (centro, radio, o = {}) {
    const v = this.vista, [X, Y] = v.P(centro), R = radio * v.escala, c = this.ctx;
    if (R < 0.5) return;
    c.save(); c.setLineDash([]); c.globalAlpha = o.opacidad ?? 0.6; c.strokeStyle = this.t.tinta; c.lineWidth = 1;
    if (o.recorte) {
      // Recorte al semiplano válido con un polígono grande de pantalla
      const { n, d } = o.recorte, p0 = [n[0] * d, n[1] * d], t = [-n[1], n[0]], M = 1e5;
      const q = [[p0[0] + t[0] * M, p0[1] + t[1] * M], [p0[0] - t[0] * M, p0[1] - t[1] * M], [p0[0] - t[0] * M + n[0] * M, p0[1] - t[1] * M + n[1] * M], [p0[0] + t[0] * M + n[0] * M, p0[1] + t[1] * M + n[1] * M]];
      c.beginPath(); q.forEach((p, i) => { const [a, b] = v.P(p); if (i) c.lineTo(a, b); else c.moveTo(a, b); }); c.closePath(); c.clip();
    }
    if (o.patron) c.setLineDash([6, 4]);
    c.beginPath(); c.arc(X, Y, R, 0, 2 * Math.PI); c.stroke(); c.restore();
  };

  // Fuente sonora (altavoz pequeño) en un punto de mundo, mirando a dir (rad)
  P.ondasFuenteSonora = function (p, o = {}) {
    const [X, Y] = this.vista.P(p), c = this.ctx;
    c.save(); c.setLineDash([]); c.lineJoin = 'round';
    c.fillStyle = this.t.tinta; c.beginPath();
    c.moveTo(X - 7, Y - 3.5); c.lineTo(X - 3, Y - 3.5); c.lineTo(X + 3, Y - 8); c.lineTo(X + 3, Y + 8); c.lineTo(X - 3, Y + 3.5); c.lineTo(X - 7, Y + 3.5); c.closePath(); c.fill();
    c.restore();
    if (o.seleccionada) this.seleccionCirculo(X, Y, 13);
    return [X, Y];
  };

  // Observador: cabeza y hombros (como el icono), centrado en p
  P.ondasObservador = function (p, o = {}) {
    const [X, Y] = this.vista.P(p), c = this.ctx, r = GO.observador;
    c.save(); c.setLineDash([]); c.strokeStyle = this.t.tinta; c.fillStyle = this.t.lienzo; c.lineWidth = G.materia + (o.grueso ? 0.5 : 0);
    c.beginPath(); c.arc(X, Y - 4, r * 0.75, 0, 2 * Math.PI); c.fill(); c.stroke();
    c.beginPath(); c.arc(X, Y + 9, r * 1.35, Math.PI, 2 * Math.PI); c.stroke();
    c.restore();
    if (o.seleccionada) this.seleccionCirculo(X, Y + 1, 15);
    return [X, Y];
  };

  // Pared reflectante: segmento de mundo con rayado del lado de atrás
  // (contrario a la normal n de mundo)
  P.ondasPared = function (a, b, n) {
    const t = [b[0] - a[0], b[1] - a[1]];
    // superficie() raya a la derecha del recorrido (en pantalla, y invertida)
    const derecha = [t[1], -t[0]], atras = derecha[0] * n[0] + derecha[1] * n[1] < 0;
    this.superficie(atras ? [a, b] : [b, a]);
  };

  global.Volta.ondas = { GO };
})(window);
