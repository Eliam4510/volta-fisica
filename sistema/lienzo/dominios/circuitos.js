/* ==========================================================================
   Volta — gramática del lienzo · dominio Circuitos
   Símbolos propios del módulo, según la sección 7 de
   docs/04_lenguaje_de_diseno.md:
   - componentes con símbolos IEC en tinta (la materia no tiene color):
     resistencia (rectángulo), reóstato, batería (placa larga + y corta −),
     fuente de corriente, capacitor, inductor (espiras), bombilla (círculo
     con aspa), interruptores de una vía y de tres posiciones con sus
     contactos, voltímetro, amperímetro y tierra;
   - cables de 2 px y nodos con disco de 3 px;
   - corriente animada: puntos de la familia corriente que avanzan con la
     carga que pasa (velocidad proporcional a I);
   - potencial: banda bajo los cables con el mapa divergente (azul para
     potenciales negativos, bermellón para positivos, el lienzo en 0 V);
   - signos de carga en las placas de los capacitores, en número
     proporcional a la carga (los signos son glifos, no colores);
   - brillo de la bombilla como rayos en tinta (luz sin λ definida) y calor
     de las resistencias como tinte de la familia térmico.
   Las medidas de los símbolos van en unidades de la cuadrícula del esquema
   (escalan con el zoom); los grosores, en px de pantalla (no escalan).
   Métodos con prefijo circ, para poder cargarse junto a otros dominios.
   Extiende Volta.Trazo.prototype. Requiere trazo.js.
   ========================================================================== */
(function (global) {
  'use strict';
  const { Trazo, G, PATRON } = global.Volta;
  const P = Trazo.prototype;

  // Medidas propias del dominio. u: unidades de la cuadrícula; px: pantalla.
  const GC = {
    nodo: 3,                      // px: radio del disco de un nodo
    punto: 2.25,                  // px: radio de los puntos de corriente
    pasoPuntos: 0.25,             // u: separación entre puntos de corriente
    banda: 8,                     // px: ancho de la banda de potencial
    resistencia: [0.56, 0.2],     // u: medio largo y medio alto del rectángulo
    placa: 0.45, hueco: 0.13,     // u: capacitor: media placa y media separación
    bateria: [0.5, 0.25, 0.13],   // u: media placa larga, media corta, media separación
    fuenteCA: 0.42,               // u: radio del círculo de la fuente alterna
    diodo: [0.3, 0.26],           // u: medio largo y medio alto del triángulo
    trafo: [0.32, 0.6, 0.15],     // u: x de cada bobina, media altura de las bobinas, radio de cada vuelta
    espira: 0.14,                 // u: radio de cada espira del inductor (4 espiras)
    bombilla: 0.3, medidor: 0.3,  // u: radios
    contacto: 3.25,               // px: radio de los contactos de un interruptor
    abierto: 28,                  // grados que se levanta la cuchilla abierta
    signo: 2.75,                  // px: medio brazo de los glifos + y −
    signosMax: 4,
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
  // f en [−1, 1]: −1 azul, 0 lienzo, 1 bermellón
  P.circColorPotencial = function (f) {
    const t = this.t;
    if (this._mapaDe !== t) {
      this._mapaDe = t;
      this._mapa = { c: aOklab(rgbDe(t.lienzo)), n: aOklab(rgbDe(t['mapa-divergente-negativo'] || '#2B59C3')), p: aOklab(rgbDe(t['mapa-divergente-positivo'] || '#C8401E')) };
    }
    const k = Math.max(-1, Math.min(1, f)), { c, n, p } = this._mapa, e = k < 0 ? n : p, a = Math.abs(k);
    return deOklab(c.map((x, i) => x + (e[i] - x) * a));
  };

  // ---------------------------------------------------------------------
  // Cables, bandas de potencial, puntos de corriente y nodos
  // ---------------------------------------------------------------------
  P.circCable = function (p1, p2, o = {}) {
    this.linea([p1, p2], { color: 'tinta', grosor: G.materia + (o.grueso ? 0.5 : 0), extremo: 'round' });
  };

  // Banda de potencial bajo una polilínea de mundo (capa de mapas, bajo la materia)
  P.circBanda = function (pts, f) {
    if (Math.abs(f) < 0.02) return;
    this.linea(pts, { color: this.circColorPotencial(f), grosor: GC.banda, extremo: 'round' });
  };

  // Puntos de corriente sobre un tramo: fase en unidades de la cuadrícula
  // (carga que pasó × escala), de modo que la animación depende solo de t
  P.circPuntos = function (p1, p2, fase) {
    const [x1, y1] = this.vista.P(p1), [x2, y2] = this.vista.P(p2);
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]); if (L <= 0) return;
    const paso = GC.pasoPuntos, c = this.ctx;
    let d = ((fase % paso) + paso) % paso;
    c.save(); c.fillStyle = this.color('corriente');
    for (; d < L - 1e-9; d += paso) {
      const f = d / L;
      c.beginPath(); c.arc(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f, GC.punto, 0, 2 * Math.PI); c.fill();
    }
    c.restore();
  };

  P.circNodo = function (p) {
    const [x, y] = this.vista.P(p), c = this.ctx;
    c.save(); c.fillStyle = this.t.tinta; c.beginPath(); c.arc(x, y, GC.nodo, 0, 2 * Math.PI); c.fill(); c.restore();
  };

  // Etiqueta de un nodo con nombre (A, B…) y, si se da, su potencial
  P.circEtiquetaNodo = function (p, nombre, V, o = {}) {
    const [x, y] = this.vista.P(p), dx = o.dx ?? 9, dy = o.dy ?? -9;
    this.compuesto([{ t: nombre, f: 'simRecta', tam: 15 }], x + dx, y + dy, { color: 'texto', alinear: dx < 0 ? 'right' : 'left' });
    if (V != null) {
      this.compuesto([{ t: 'V', f: 'sim', tam: 13, color: 'electrico' }, { t: nombre, f: 'simRecta', tam: 9, dy: 3, color: 'electrico' }, { t: ' = ' + V, f: 'num', tam: 11, color: 'texto-2' }],
        x + dx, y + dy + 15, { alinear: dx < 0 ? 'right' : 'left' });
    }
  };

  // ---------------------------------------------------------------------
  // Componentes
  // ---------------------------------------------------------------------
  // Marco local de un componente: x de a hacia b, y hacia arriba del mundo.
  function marco(tz, centro, rot) {
    const th = rot * Math.PI / 180, cs = Math.round(Math.cos(th) * 1e9) / 1e9, sn = Math.round(Math.sin(th) * 1e9) / 1e9;
    const [X, Y] = tz.vista.P(centro), u = tz.vista.escala;
    const S = (lx, ly) => [X + u * (lx * cs - ly * sn), Y - u * (lx * sn + ly * cs)];
    return { S, u, th, X, Y };
  }
  function trazar(c, pts) { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); }

  // Glifo + o − en pantalla (no gira con el componente)
  P._circSigno = function (x, y, signo) {
    const c = this.ctx, s = GC.signo;
    c.beginPath(); c.moveTo(x - s, y); c.lineTo(x + s, y);
    if (signo > 0) { c.moveTo(x, y - s); c.lineTo(x, y + s); }
    c.stroke();
  };

  /**
   * Dibuja un componente. el: {tipo, c: [x, y] (centro), rot (grados)}.
   * o: {cerrado, posicion, q, qRef, brillo (0 a 1), calor (0 a 1), grueso,
   *     conectadas: {a, b, c} (posiciones con algo conectado),
   *     placa: {f, e} (capacitor: placa conductora de espesor e·d metida una fracción f)}
   */
  P.circElemento = function (el, o = {}) {
    const c = this.ctx, { S, u } = marco(this, el.c, el.rot || 0), t = this.t;
    const g = G.materia + (o.grueso ? 0.5 : 0);
    c.save(); c.setLineDash([]); c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = t.tinta; c.fillStyle = t.lienzo; c.lineWidth = g;
    const linea = (...pts) => { trazar(c, pts.map(p => S(p[0], p[1]))); c.stroke(); };
    const circulo = (lx, ly, r, relleno = t.lienzo) => { const [x, y] = S(lx, ly); c.beginPath(); c.arc(x, y, Math.max(0, r), 0, 2 * Math.PI); c.fillStyle = relleno; c.fill(); c.stroke(); };
    switch (el.tipo) {
      case 'resistencia': case 'reostato': {
        const [a, h] = GC.resistencia;
        linea([-1, 0], [-a, 0]); linea([a, 0], [1, 0]);
        trazar(c, [S(-a, -h), S(a, -h), S(a, h), S(-a, h)]); c.closePath();
        c.fillStyle = t.lienzo; c.fill();
        if (o.calor > 0.01) { c.fillStyle = t.tinte.termico; c.globalAlpha = Math.min(1, o.calor) * 0.9 + 0.1; c.fill(); c.globalAlpha = 1; }
        c.stroke();
        if (el.tipo === 'reostato') {
          // Flecha de ajuste a 45° a través del rectángulo
          const [x1, y1] = S(-0.48, -0.42), [x2, y2] = S(0.5, 0.42);
          c.lineWidth = 1.5; trazar(c, [[x1, y1], [x2, y2]]); c.stroke();
          const ang = Math.atan2(y2 - y1, x2 - x1), L = 9, A = 3.5;
          c.fillStyle = t.tinta; c.beginPath(); c.moveTo(x2, y2);
          c.lineTo(x2 - L * Math.cos(ang) + A * Math.sin(ang), y2 - L * Math.sin(ang) - A * Math.cos(ang));
          c.lineTo(x2 - L * Math.cos(ang) - A * Math.sin(ang), y2 - L * Math.sin(ang) + A * Math.cos(ang)); c.closePath(); c.fill();
        }
        break;
      }
      case 'fuente-ca': {
        // Círculo con una onda senoidal dentro (fuente de voltaje alterna)
        const rr = GC.fuenteCA;
        linea([-1, 0], [-rr, 0]); linea([rr, 0], [1, 0]);
        const [cx, cy] = S(0, 0), [ex] = S(rr, 0), R = Math.abs(ex - cx) || 1;
        c.beginPath(); c.arc(cx, cy, R, 0, 2 * Math.PI); c.stroke();
        const pts = [];
        for (let k = 0; k <= 24; k++) { const u = -0.6 + 1.2 * k / 24; pts.push(S(u * rr, 0.32 * rr * Math.sin(Math.PI * u / 0.6))); }
        trazar(c, pts); c.stroke();
        // + en el borne a, como en la batería
        const [px, py] = S(-rr - 0.2, rr * 0.75);
        c.lineWidth = 1.5; this._circSigno(px, py, 1);
        break;
      }
      case 'transformador': {
        // Dos bobinas enfrentadas con el núcleo en medio; bornes en las esquinas
        // (primario a la izquierda, secundario a la derecha) y puntos de polaridad
        const [xb, hb, rv] = GC.trafo;
        for (const sx of [-1, 1]) {
          linea([sx, 1], [sx * xb, 1]); linea([sx * xb, 1], [sx * xb, hb]);
          linea([sx, -1], [sx * xb, -1]); linea([sx * xb, -1], [sx * xb, -hb]);
          const [cx0] = S(sx * xb, 0), vueltas = 4, paso = 2 * hb / vueltas;
          for (let k = 0; k < vueltas; k++) {
            const yc = hb - paso * (k + 0.5), [cx, cy] = S(sx * xb, yc), [ex, ey] = S(sx * xb, yc + rv);
            const rr = Math.hypot(ex - cx, ey - cy);
            // Semicírculo hacia fuera del núcleo (girado con el componente)
            const [ox, oy] = S(sx * xb + sx * 0.3, yc), ang = Math.atan2(oy - cy, ox - cx);
            c.beginPath(); c.arc(cx, cy, rr, ang - Math.PI / 2, ang + Math.PI / 2); c.stroke();
            void cx0;
          }
        }
        c.save(); c.lineWidth = 1.5; linea([-0.07, hb + 0.05], [-0.07, -hb - 0.05]); linea([0.07, hb + 0.05], [0.07, -hb - 0.05]); c.restore();
        // Puntos de polaridad junto al principio de cada bobina
        for (const sx of [-1, 1]) { const [px, py] = S(sx * (xb + 0.24), hb - 0.05); c.fillStyle = t.tinta; c.beginPath(); c.arc(px, py, 2.25, 0, 2 * Math.PI); c.fill(); }
        break;
      }
      case 'transistor': {
        // Círculo, barra de la base y colector y emisor en diagonal; la flecha del
        // emisor sale (NPN) o entra (PNP)
        const [cx, cy] = S(-0.08, 0), [ex] = S(0.47, 0), rr = Math.abs(ex - cx) || 1;
        c.beginPath(); c.arc(cx, cy, rr, 0, 2 * Math.PI); c.stroke();
        linea([0, 1], [0, 0.55]); linea([0, -1], [0, -0.55]); linea([-1, 0], [-0.35, 0]);
        c.save(); c.lineWidth = 2.5; linea([-0.35, -0.38], [-0.35, 0.38]); c.restore();
        linea([-0.35, 0.18], [0, 0.55]); linea([-0.35, -0.18], [0, -0.55]);
        const pnp = o.polaridad === 'pnp', [ax, ay] = pnp ? S(-0.3, -0.23) : S(-0.03, -0.52), [bx, by] = pnp ? S(-0.1, -0.44) : S(-0.2, -0.34);
        const ang = Math.atan2(ay - by, ax - bx), L = 7, A = 3.2;
        c.fillStyle = t.tinta; c.beginPath(); c.moveTo(ax, ay);
        c.lineTo(ax - L * Math.cos(ang) + A * Math.sin(ang), ay - L * Math.sin(ang) - A * Math.cos(ang));
        c.lineTo(ax - L * Math.cos(ang) - A * Math.sin(ang), ay - L * Math.sin(ang) + A * Math.cos(ang)); c.closePath(); c.fill();
        break;
      }
      case 'opamp': {
        // Triángulo con las entradas − (arriba) y + (abajo) y la salida en la punta
        linea([-1, 1], [-0.4, 1]); linea([-1, -1], [-0.4, -1]); linea([1.6, 0], [2, 0]);
        trazar(c, [S(-0.4, 1.4), S(-0.4, -1.4), S(1.6, 0)]); c.closePath(); c.fillStyle = t.lienzo; c.fill(); c.stroke();
        c.save(); c.lineWidth = 1.5;
        linea([-0.28, 1], [-0.06, 1]);
        linea([-0.28, -1], [-0.06, -1]); linea([-0.17, -0.89], [-0.17, -1.11]);
        c.restore();
        break;
      }
      case 'zener': case 'diodo': case 'led': {
        // Triángulo hacia el cátodo (borne b) y la barra; el LED, con dos
        // flechas de luz que se encienden con su color según la corriente
        const [m, h] = GC.diodo;
        linea([-1, 0], [-m, 0]); linea([m, 0], [1, 0]);
        const tri = [S(-m, -h), S(-m, h), S(m, 0)];
        const luz = el.tipo === 'led' ? Math.max(0, Math.min(1, o.brillo || 0)) : 0;
        const colorLuz = el.tipo === 'led' && this.opticaColor ? this.opticaColor(o.lambda ?? null) : t.tinta;
        trazar(c, tri); c.closePath(); c.fillStyle = luz > 0.02 ? colorLuz : t.lienzo; c.globalAlpha = luz > 0.02 ? 0.35 + 0.65 * luz : 1; c.fill(); c.globalAlpha = 1; c.stroke();
        linea([m, -h], [m, h]);
        // Zener: la barra con las puntas dobladas
        if (el.tipo === 'zener') { linea([m, h], [m - 0.1, h + 0.04]); linea([m, -h], [m + 0.1, -h - 0.04]); }
        if (el.tipo === 'led') {
          c.save(); c.strokeStyle = luz > 0.02 ? colorLuz : t['texto-3']; c.lineWidth = 1.5;
          for (const dx of [-0.08, 0.14]) {
            const p0 = [dx, h + 0.08], p1 = [dx + 0.18, h + 0.3 + 0.12 * luz];
            linea(p0, p1);
            const [x1, y1] = S(...p1), [x0, y0] = S(...p0), ang = Math.atan2(y1 - y0, x1 - x0), L = 6, A = 3;
            c.fillStyle = c.strokeStyle; c.beginPath(); c.moveTo(x1, y1);
            c.lineTo(x1 - L * Math.cos(ang) + A * Math.sin(ang), y1 - L * Math.sin(ang) - A * Math.cos(ang));
            c.lineTo(x1 - L * Math.cos(ang) - A * Math.sin(ang), y1 - L * Math.sin(ang) + A * Math.cos(ang)); c.closePath(); c.fill();
          }
          c.restore();
        }
        break;
      }
      case 'bateria': {
        const [larga, corta, s] = GC.bateria;
        linea([-1, 0], [-s, 0]); linea([s, 0], [1, 0]);
        linea([-s, -larga], [-s, larga]);
        c.lineWidth = 4.5; c.lineCap = 'butt'; linea([s, -corta], [s, corta]);
        // + junto a la placa larga, en pantalla
        const [px, py] = S(-s - 0.2, larga * 0.72);
        c.lineWidth = 1.5; c.lineCap = 'round'; this._circSigno(px, py, 1);
        break;
      }
      case 'capacitor': {
        const p = GC.placa, s = GC.hueco;
        linea([-1, 0], [-s, 0]); linea([s, 0], [1, 0]);
        // Placa conductora (materia: relleno de conductor y contorno de tinta) de
        // espesor e·d, centrada en el hueco; entra a lo largo de las placas desde
        // el lado +y del marco local. f = 0: fuera, junto a ellas; f = 1: dentro.
        if (o.placa) {
          const f = Math.max(0, Math.min(1, o.placa.f)), m = s * Math.max(0.05, Math.min(0.9, o.placa.e)), y0 = p - 2 * p * f;
          trazar(c, [S(-m, y0), S(m, y0), S(m, y0 + 2 * p), S(-m, y0 + 2 * p)]); c.closePath();
          c.fillStyle = t['campo-activo']; c.fill(); c.lineWidth = 1; c.stroke();
          c.lineWidth = g;
        }
        c.lineWidth = 2.5; c.lineCap = 'butt';
        linea([-s, -p], [-s, p]); linea([s, -p], [s, p]);
        // Signos de carga en la cara exterior de cada placa, proporcionales a q
        const n = o.qRef > 0 ? Math.min(GC.signosMax, Math.round(GC.signosMax * Math.abs(o.q || 0) / o.qRef)) : 0;
        if (n > 0) {
          const ys = [0.17, -0.17, 0.36, -0.36].slice(0, n), sg = Math.sign(o.q);
          c.lineWidth = 1.5; c.lineCap = 'round';
          for (const y of ys) {
            const [ax, ay] = S(-s - 0.12, y), [bx, by] = S(s + 0.12, y);
            this._circSigno(ax, ay, sg); this._circSigno(bx, by, -sg);
          }
        }
        break;
      }
      case 'inductor': {
        const r = GC.espira, n = 4, x0 = -n * r;
        linea([-1, 0], [x0, 0]); linea([-x0, 0], [1, 0]);
        // Espiras: semicírculos hacia arriba del marco local
        c.beginPath();
        for (let k = 0; k < n; k++) {
          const [x, y] = S(x0 + r + 2 * k * r, 0), th = (el.rot || 0) * Math.PI / 180;
          c.arc(x, y, r * u, -Math.PI - th, -th, false);
        }
        c.stroke();
        break;
      }
      case 'bombilla': {
        const r = GC.bombilla, b = Math.max(0, Math.min(1, o.brillo || 0));
        linea([-1, 0], [-r, 0]); linea([r, 0], [1, 0]);
        // Brillo: rayos de luz (sin λ definida: tinta), más largos cuanto más brilla
        if (b > 0.02) {
          const [cx, cy] = S(0, 0), r0 = (r + 0.07) * u, r1 = r0 + (0.1 + 0.22 * b) * u;
          c.save(); c.lineWidth = 1.5; c.globalAlpha = 0.3 + 0.7 * b;
          for (let k = 0; k < 8; k++) {
            const a = (k + 0.5) * Math.PI / 4;
            c.beginPath(); c.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)); c.lineTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)); c.stroke();
          }
          c.restore();
        }
        circulo(0, 0, r * u, b > 0.02 ? t.tinte.termico : t.lienzo);
        const d = r * Math.SQRT1_2;
        c.lineWidth = 1.5; linea([-d, -d], [d, d]); linea([-d, d], [d, -d]);
        break;
      }
      case 'voltimetro': case 'amperimetro': case 'fuente-corriente': {
        const r = GC.medidor;
        linea([-1, 0], [-r, 0]); linea([r, 0], [1, 0]);
        circulo(0, 0, r * u);
        const [x, y] = S(0, 0);
        if (el.tipo === 'fuente-corriente') {
          // Flecha de a hacia b dentro del círculo
          const [x1, y1] = S(-0.17, 0), [x2, y2] = S(0.17, 0);
          c.lineWidth = 1.5; trazar(c, [[x1, y1], [x2, y2]]); c.stroke();
          const ang = Math.atan2(y2 - y1, x2 - x1);
          c.fillStyle = t.tinta; c.beginPath(); c.moveTo(x2 + 3 * Math.cos(ang), y2 + 3 * Math.sin(ang));
          c.lineTo(x2 - 5 * Math.cos(ang) + 3.5 * Math.sin(ang), y2 - 5 * Math.sin(ang) - 3.5 * Math.cos(ang));
          c.lineTo(x2 - 5 * Math.cos(ang) - 3.5 * Math.sin(ang), y2 - 5 * Math.sin(ang) + 3.5 * Math.cos(ang)); c.closePath(); c.fill();
        } else {
          c.restore();
          this.texto(el.tipo === 'voltimetro' ? 'V' : 'A', x, y + 0.5, { fuente: 'ui', tam: Math.max(11, Math.min(15, 0.36 * u)), peso: 600, alinear: 'center', base: 'middle', color: 'tinta' });
          return;
        }
        break;
      }
      case 'interruptor': {
        // Contacto de la cuchilla en −0.5 y contacto fijo en +0.5
        linea([-1, 0], [-0.5, 0]); linea([0.5, 0], [1, 0]);
        const ab = (o.cerrado ? 0 : GC.abierto) * Math.PI / 180;
        const [px, py] = S(-0.5, 0), [ex, ey] = S(-0.5 + Math.cos(ab), Math.sin(ab));
        circulo(0.5, 0, GC.contacto);
        trazar(c, [[px, py], [ex, ey]]); c.stroke();
        circulo(-0.5, 0, GC.contacto);
        break;
      }
      case 'interruptor-3': {
        // Común en (−0.5, 0); posiciones a (0.5, 1), b (0.91, 0), c (0.5, −1)
        const CON = { a: [0.5, 1], b: [0.91, 0], c: [0.5, -1] };
        linea([-1, 0], [-0.5, 0]);
        for (const [k, [x, y]] of Object.entries(CON)) {
          if (!o.conectadas || o.conectadas[k]) linea([x, y], [1, y]);
          circulo(x, y, GC.contacto);
          // Nombre de la posición, hacia fuera del arco
          const [cx, cy] = S(-0.5, 0), [qx, qy] = S(x, y), d = Math.hypot(qx - cx, qy - cy);
          this.texto(k, qx + (qx - cx) / d * 13, qy + (qy - cy) / d * 13 + 4, { fuente: 'simRecta', tam: 14, color: 'texto-2', alinear: 'center', halo: true });
        }
        const [px, py] = S(-0.5, 0);
        let fin;
        if (o.posicion && CON[o.posicion]) fin = S(...CON[o.posicion]);
        else { const a = 0.5 * Math.atan2(1, 1); fin = S(-0.5 + 1.25 * Math.cos(a), 1.25 * Math.sin(a)); }
        c.strokeStyle = t.tinta; c.lineWidth = g;
        trazar(c, [[px, py], fin]); c.stroke();
        circulo(-0.5, 0, GC.contacto);
        break;
      }
      case 'tierra': {
        linea([0, 0], [0, -0.32]);
        linea([-0.26, -0.32], [0.26, -0.32]);
        c.lineWidth = 1.75; linea([-0.16, -0.44], [0.16, -0.44]); linea([-0.06, -0.56], [0.06, -0.56]);
        break;
      }
      default: break;
    }
    c.restore();
  };

  // Caja de pantalla del cuerpo de un componente (selección, clic)
  P.circCaja = function (el) {
    const { S } = marco(this, el.c, el.rot || 0);
    const ext = el.tipo === 'interruptor-3' ? [[-0.6, -1.15], [1.05, 1.15]] : el.tipo === 'tierra' ? [[-0.34, -0.66], [0.34, 0.06]]
      : el.tipo === 'interruptor' ? [[-0.62, -0.18], [0.62, 0.62]] : [[-0.62, -0.5], [0.62, 0.5]];
    const pts = [S(ext[0][0], ext[0][1]), S(ext[1][0], ext[1][1])];
    const x0 = Math.min(pts[0][0], pts[1][0]), x1 = Math.max(pts[0][0], pts[1][0]), y0 = Math.min(pts[0][1], pts[1][1]), y1 = Math.max(pts[0][1], pts[1][1]);
    return [x0, y0, x1 - x0, y1 - y0];
  };

  // Selección: contorno discontinuo 3 · 3 a 5 px del componente
  P.circSeleccion = function (el) {
    const [x, y, w, h] = this.circCaja(el), c = this.ctx, m = 5;
    c.save(); c.setLineDash(PATRON.seleccion); c.strokeStyle = this.t.tinta; c.lineWidth = 1;
    c.strokeRect(Math.round(x - m) + 0.5, Math.round(y - m) + 0.5, Math.round(w + 2 * m), Math.round(h + 2 * m));
    c.restore();
  };

  // Nombre y valor de un componente junto a su cuerpo. lado: 'arr', 'aba', 'izq', 'der'
  P.circEtiqueta = function (el, nombre, valor, lado) {
    const [x, y, w, h] = this.circCaja(el);
    const segs = Array.isArray(nombre) ? nombre : [{ t: nombre, f: 'ui', tam: 12.5 }];
    const dosLineas = valor != null;
    let ax, ay, alinear;
    if (lado === 'izq') { ax = x - 8; ay = y + h / 2 + (dosLineas ? -2 : 4); alinear = 'right'; }
    else if (lado === 'der') { ax = x + w + 8; ay = y + h / 2 + (dosLineas ? -2 : 4); alinear = 'left'; }
    else if (lado === 'aba') { ax = x + w / 2; ay = y + h + 15; alinear = 'center'; }
    else { ax = x + w / 2; ay = y - (dosLineas ? 20 : 7); alinear = 'center'; }
    this.compuesto(segs, ax, ay, { alinear, color: 'texto' });
    if (dosLineas) this.texto(valor, ax, ay + 14, { fuente: 'num', tam: 11, color: 'texto-2', alinear, halo: true });
  };

  global.Volta.Circ = { GC };
})(window);
