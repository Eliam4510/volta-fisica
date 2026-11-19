/* ==========================================================================
   Volta — gramática del lienzo · dominio Electrostática
   Símbolos propios del módulo sobre Volta.Trazo: líneas de campo con
   flechas, equipotenciales con etiqueta, mapa de potencial, malla de
   vectores E y sonda de campo. Mismas convenciones que trazo.js:
   - grosores y tamaños en px de pantalla (no escalan con el zoom);
   - patrones de trazo de Volta.PATRON;
   - toda etiqueta sobre el lienzo con halo del color del lienzo;
   - colores solo de this.t (tokens del tema activo).
   Las funciones de campo se reciben como cierres en SI y en coordenadas de
   mundo: campo(x, y) → [Ex, Ey] en V/m, potencial(x, y) → V en V.
   Requiere trazo.js.
   ========================================================================== */
(function (global) {
  'use strict';
  const { Trazo, G, PATRON, cantidad, pasoAgradable } = global.Volta;

  // ---------------------------------------------------------------------
  // Medidas del dominio (px de pantalla)
  // ---------------------------------------------------------------------
  const GE = {
    lineaCampo: 1,             // línea de campo: la magnitud E vista en conjunto, muy por debajo de un vector (2.25)
    flechaLinea: [7, 6],       // punta pequeña a mitad de línea: largo × ancho
    equipotencial: 1,          // discontinua 4 · 3 (PATRON.componente)
    arranque: G.carga + 1,     // las líneas nacen y mueren en el borde del disco de la carga
    tramoFlecha: 110,          // en líneas abiertas, la flecha va a esta distancia de su carga
    celdaIso: 6,               // celda del marching squares
    celdaMapa: 3,              // resolución del mapa de potencial
    sonda: 6.5,                // radio del anillo de la sonda
    etiquetaMin: 70,           // una equipotencial más corta que esto no lleva etiqueta
  };

  // ---------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------
  // '#RRGGBB' o 'rgb(r g b / a)' → [r, g, b]
  function aRGB(col) {
    if (!col) return [0, 0, 0];
    if (col[0] === '#') {
      let h = col.slice(1);
      if (h.length === 3) h = h.split('').map(c => c + c).join('');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    const m = col.match(/[\d.]+/g);
    return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
  }

  // Cantidad con prefijo SI: 12 710 V → "12.71 kV"; 6.355e-3 N → "6.355 mN"
  const PREFIJOS = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  function conPrefijo(v, unidad, cifras = 4) {
    if (!isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a === 0) return cantidad(0, unidad);
    const [f, p] = PREFIJOS.find(([f]) => a >= f * 0.99995) || PREFIJOS[PREFIJOS.length - 1];
    return cantidad(v / f, p + unidad, cifras);
  }

  function longitud(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return L;
  }
  // Punto y tangente a la distancia s (px) a lo largo de una polilínea
  function puntoEn(pts, s) {
    let acum = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], d = Math.hypot(dx, dy);
      if (acum + d >= s && d > 0) {
        const u = (s - acum) / d;
        return [pts[i - 1][0] + dx * u, pts[i - 1][1] + dy * u, Math.atan2(dy, dx)];
      }
      acum += d;
    }
    const n = pts.length - 1;
    return [pts[n][0], pts[n][1], Math.atan2(pts[n][1] - pts[n - 1][1], pts[n][0] - pts[n - 1][0])];
  }
  // Ángulo medio del mayor hueco entre ángulos dados (rad)
  function mayorHueco(angs) {
    const a = angs.map(x => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((p, q) => p - q);
    let mejor = -1, centro = 0;
    for (let i = 0; i < a.length; i++) {
      const sig = i + 1 < a.length ? a[i + 1] : a[0] + 2 * Math.PI, hueco = sig - a[i];
      if (hueco > mejor) { mejor = hueco; centro = a[i] + hueco / 2; }
    }
    return centro;
  }

  // ---------------------------------------------------------------------
  // Líneas de campo: RK4 en pantalla con paso adaptativo
  // ---------------------------------------------------------------------
  // dirE(x, y, sentido) → vector unitario en px (y hacia abajo) o null.
  // El paso es proporcional a la distancia a la carga más cercana (0.75–6 px):
  // fino cerca de las cargas, donde la curvatura es grande, y largo lejos.
  function integrarLinea(p0, sentido, dirE, fuentes, caja, maxPasos = 6000) {
    const pts = [[p0[0], p0[1]]];
    let x = p0[0], y = p0[1], ux = 0, uy = 0, primero = true;
    for (let n = 0; n < maxPasos; n++) {
      let dmin = Infinity, imin = -1;
      for (let i = 0; i < fuentes.length; i++) {
        const d = Math.hypot(x - fuentes[i].x, y - fuentes[i].y);
        if (d < dmin) { dmin = d; imin = i; }
      }
      // Llega a una carga de signo opuesto al de su origen: termina en el borde del disco
      if (n > 0 && dmin < GE.arranque && Math.sign(fuentes[imin].q) === -sentido) {
        const f = fuentes[imin], k = GE.arranque / Math.max(dmin, 1e-6);
        pts[pts.length - 1] = [f.x + (x - f.x) * k, f.y + (y - f.y) * k];
        return { pts, fin: 'carga', carga: imin, angulo: Math.atan2(y - f.y, x - f.x) };
      }
      const h = Math.max(0.75, Math.min(6, 0.22 * (dmin - G.carga)));
      const k1 = dirE(x, y, sentido); if (!k1) return { pts, fin: 'nulo' };
      const k2 = dirE(x + k1[0] * h / 2, y + k1[1] * h / 2, sentido); if (!k2) return { pts, fin: 'nulo' };
      const k3 = dirE(x + k2[0] * h / 2, y + k2[1] * h / 2, sentido); if (!k3) return { pts, fin: 'nulo' };
      const k4 = dirE(x + k3[0] * h, y + k3[1] * h, sentido); if (!k4) return { pts, fin: 'nulo' };
      const dx = (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6, dy = (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6;
      // Un giro de más de 90° en un paso: la línea atraviesa un punto neutro (E = 0) y se detiene
      if (!primero && dx * ux + dy * uy < 0) return { pts, fin: 'nulo' };
      ux = dx; uy = dy; primero = false;
      x += dx * h; y += dy * h;
      pts.push([x, y]);
      if (x < caja.x0 || x > caja.x1 || y < caja.y0 || y > caja.y1) return { pts, fin: 'sale' };
    }
    return { pts, fin: 'largo' };
  }

  // ---------------------------------------------------------------------
  // Marching squares con desambiguación exacta de los puntos de silla y
  // encadenado de segmentos en polilíneas (para que el discontinuo sea
  // continuo y para poder etiquetar cada curva).
  // val: valores en los nodos (fila j, columna i: val[j*nx + i]).
  // centro(i, j): valor real en el centro de la celda (solo casos 5 y 10).
  // Devuelve polilíneas en coordenadas de nodo: [{pts: [[i, j]...], cerrada}]
  // ---------------------------------------------------------------------
  function isolineas(val, nx, ny, nivel, centro) {
    const H = nx * ny, segA = [], segB = [];
    const idH = (i, j) => j * nx + i;          // arista horizontal (i,j)–(i+1,j)
    const idV = (i, j) => H + j * nx + i;      // arista vertical (i,j)–(i,j+1)
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const tl = val[j * nx + i], tr = val[j * nx + i + 1], br = val[(j + 1) * nx + i + 1], bl = val[(j + 1) * nx + i];
        const caso = (tl >= nivel ? 8 : 0) | (tr >= nivel ? 4 : 0) | (br >= nivel ? 2 : 0) | (bl >= nivel ? 1 : 0);
        if (caso === 0 || caso === 15) continue;
        const T = idH(i, j), B = idH(i, j + 1), L = idV(i, j), R = idV(i + 1, j);
        const s = (a, b) => { segA.push(a); segB.push(b); };
        switch (caso) {
          case 1: case 14: s(L, B); break;
          case 2: case 13: s(B, R); break;
          case 3: case 12: s(L, R); break;
          case 4: case 11: s(T, R); break;
          case 6: case 9: s(T, B); break;
          case 7: case 8: s(L, T); break;
          case 5: if (centro(i, j) >= nivel) { s(L, T); s(B, R); } else { s(L, B); s(T, R); } break;
          case 10: if (centro(i, j) >= nivel) { s(T, R); s(L, B); } else { s(L, T); s(B, R); } break;
        }
      }
    }
    // Punto de cruce sobre una arista (interpolación lineal)
    const punto = id => {
      if (id < H) {
        const j = Math.floor(id / nx), i = id - j * nx, a = val[id], b = val[id + 1];
        return [i + (b !== a ? (nivel - a) / (b - a) : 0.5), j];
      }
      const k = id - H, j = Math.floor(k / nx), i = k - j * nx, a = val[k], b = val[k + nx];
      return [i, j + (b !== a ? (nivel - a) / (b - a) : 0.5)];
    };
    // Encadenado: cada arista toca como máximo dos segmentos
    const s1 = new Int32Array(2 * H).fill(-1), s2 = new Int32Array(2 * H).fill(-1);
    for (let k = 0; k < segA.length; k++) for (const e of [segA[k], segB[k]]) { if (s1[e] < 0) s1[e] = k; else s2[e] = k; }
    const usado = new Uint8Array(segA.length), polis = [];
    const avanzar = (e, actual, usar) => {
      const ids = [];
      for (;;) {
        const sig = s1[e] === actual ? s2[e] : s1[e];
        if (sig < 0 || usado[sig]) break;
        usado[sig] = 1;
        const e2 = segA[sig] === e ? segB[sig] : segA[sig];
        ids.push(e2); actual = sig; e = e2;
      }
      return ids;
    };
    for (let k = 0; k < segA.length; k++) {
      if (usado[k]) continue;
      usado[k] = 1;
      const adelante = avanzar(segB[k], k);
      const cerrada = adelante.length > 0 && adelante[adelante.length - 1] === segA[k];
      let ids = [segA[k], segB[k], ...adelante];
      if (cerrada) ids.pop();
      else ids = [...avanzar(segA[k], k).reverse(), ...ids];
      polis.push({ pts: ids.map(punto), cerrada });
    }
    return polis;
  }

  // Niveles de equipotencial "agradables" para lo que se ve. Se toma el
  // potencial en una malla gruesa de la vista; el intervalo va del
  // percentil 5 al 95 de V, recortado al percentil 90 de |V| (cerca de una
  // carga V diverge y los anillos se amontonarían). La separación es el
  // valor 1-2-2.5-5 que deja más cerca de 7 niveles. Depende de la vista y
  // de la escena, no del instante: los niveles no cambian al reproducir.
  function nivelesAuto(tz, potencial, dVmanual) {
    const v = tz.vista, vals = [];
    for (let y = 6; y < tz.h; y += 12) for (let x = 6; x < tz.w; x += 12) {
      const p = potencial(v.mx(x), v.my(y)); if (isFinite(p)) vals.push(p);
    }
    if (!vals.length) return { paso: dVmanual || 1, niveles: [], lo: 0, hi: 0 };
    vals.sort((a, b) => a - b);
    const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(f * arr.length))];
    const tope = q(vals.map(Math.abs).sort((a, b) => a - b), 0.9);
    const lo = Math.max(q(vals, 0.05), -tope), hi = Math.min(q(vals, 0.95), tope);
    const cuenta = p => Math.floor(hi / p + 1e-9) - Math.ceil(lo / p - 1e-9) + 1;
    let paso = dVmanual > 0 ? dVmanual : 0;
    if (!paso) {
      const e = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, hi - lo) / 7)));
      const candidatos = [1, 2, 2.5, 5, 10, 20].map(m => m * e);
      paso = candidatos.reduce((mejor, p) => (Math.abs(cuenta(p) - 7) < Math.abs(cuenta(mejor) - 7) ? p : mejor), candidatos[0]);
    }
    const niveles = [];
    for (let k = Math.ceil(lo / paso - 1e-9); k * paso <= hi + 1e-9 && niveles.length < 40; k++) niveles.push(k === 0 ? 0 : k * paso);
    return { paso, niveles, lo, hi };
  }

  // ---------------------------------------------------------------------
  // Símbolos sobre Volta.Trazo
  // ---------------------------------------------------------------------
  const P = Trazo.prototype;

  // Punta pequeña llena, centrada en (x, y) y orientada según ang
  P._puntaLinea = function (x, y, ang, color) {
    const [L, A] = GE.flechaLinea, c = this.ctx;
    c.save(); c.setLineDash([]); c.fillStyle = color;
    c.translate(x, y); c.rotate(ang);
    c.beginPath(); c.moveTo(L / 2, 0); c.lineTo(-L / 2, A / 2); c.lineTo(-L / 2 + L * 0.16, 0); c.lineTo(-L / 2, -A / 2); c.closePath(); c.fill();
    c.restore();
  };

  /*
   * Líneas de campo de un conjunto de cargas puntuales.
   * cargas: [{p: [x, y] (m), q (C)}]; campo(x, y) → [Ex, Ey].
   * o: {porCoulomb (líneas por C; por defecto 16 por µC), color, halo, giro,
   *     ocultar: [[x, y, r] px] — discos de materia que no son fuente de estas
   *     líneas (una carga de prueba): las líneas pasan por detrás}
   * - Cada carga positiva emite N = |q|·porCoulomb líneas repartidas en ángulo.
   * - Cada carga negativa recibe las que le llegan; si faltan para su N, se
   *   completan desde ella hacia atrás, en sus mayores huecos.
   * - Flecha pequeña a mitad de línea, en el sentido de E.
   */
  P.lineasCampo = function (cargas, campo, o = {}) {
    const v = this.vista, porQ = o.porCoulomb || 16e6, giro = o.giro || 0;
    const fuentes = cargas.map(c => { const [x, y] = v.P(c.p); return { x, y, q: c.q }; });
    const m = Math.max(this.w, this.h) * 0.6;
    const caja = { x0: -m, y0: -m, x1: this.w + m, y1: this.h + m };
    const dirE = (x, y, s) => {
      const e = campo(v.mx(x), v.my(y)), ex = e[0], ey = -e[1], L = Math.hypot(ex, ey);
      return L > 0 && isFinite(L) ? [s * ex / L, s * ey / L] : null;
    };
    const N = q => Math.max(1, Math.round(Math.abs(q) * porQ));
    const lineas = [], llegadas = fuentes.map(() => []);

    fuentes.forEach(f => {
      if (!(f.q > 0)) return;
      const n = N(f.q);
      for (let k = 0; k < n; k++) {
        const a = (k + 0.5) / n * 2 * Math.PI + giro;
        const r = integrarLinea([f.x + GE.arranque * Math.cos(a), f.y + GE.arranque * Math.sin(a)], 1, dirE, fuentes, caja);
        if (r.fin === 'carga') llegadas[r.carga].push(r.angulo);
        lineas.push({ pts: r.pts, desde: 'carga', hasta: r.fin === 'carga' ? 'carga' : 'abierto' });
      }
    });
    fuentes.forEach((f, i) => {
      if (!(f.q < 0)) return;
      const n = N(f.q), angs = llegadas[i].slice(), semillas = [];
      if (!angs.length) for (let k = 0; k < n; k++) semillas.push((k + 0.5) / n * 2 * Math.PI + giro);
      else for (let k = angs.length; k < n; k++) { const a = mayorHueco(angs); angs.push(a); semillas.push(a); }
      for (const a of semillas) {
        const r = integrarLinea([f.x + GE.arranque * Math.cos(a), f.y + GE.arranque * Math.sin(a)], -1, dirE, fuentes, caja);
        r.pts.reverse();
        lineas.push({ pts: r.pts, desde: r.fin === 'carga' ? 'carga' : 'abierto', hasta: 'carga' });
      }
    });

    // Dibujo: un solo trazo para todas las líneas; halo si van sobre un mapa
    const c = this.ctx, col = this.color(o.color || 'electrico');
    const ruta = () => {
      c.beginPath();
      for (const l of lineas) { const p = l.pts; if (p.length < 2) continue; c.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1]); }
    };
    const ocultar = o.ocultar || [];
    c.save(); c.setLineDash([]); c.lineJoin = 'round'; c.lineCap = 'round';
    if (ocultar.length) {
      c.beginPath(); c.rect(0, 0, this.w, this.h);
      for (const [x, y, r] of ocultar) { c.moveTo(x + r, y); c.arc(x, y, r, 0, 2 * Math.PI); }
      c.clip('evenodd');
    }
    if (o.halo) { ruta(); c.strokeStyle = this.t.lienzo; c.lineWidth = GE.lineaCampo + G.halo; c.globalAlpha = 0.6; c.stroke(); c.globalAlpha = 1; }
    ruta(); c.strokeStyle = col; c.lineWidth = GE.lineaCampo; c.stroke();
    for (const l of lineas) {
      const L = longitud(l.pts); if (L < 26) continue;
      const s = l.desde === 'carga' && l.hasta === 'carga' ? L / 2
        : l.desde === 'carga' ? Math.min(L / 2, GE.tramoFlecha)
          : L - Math.min(L / 2, GE.tramoFlecha);
      const [x, y, ang] = puntoEn(l.pts, s);
      this._puntaLinea(x, y, ang, col);
    }
    c.restore();
    return lineas;
  };

  /*
   * Equipotenciales por marching squares sobre una malla de pantalla.
   * potencial(x, y) → V; niveles: [V…]. Discontinuas 4 · 3 de la familia
   * eléctrico. Devuelve las polilíneas (px) para etiquetarlas después, en la
   * capa de anotaciones, por encima de las líneas de campo.
   */
  P.equipotenciales = function (potencial, niveles, o = {}) {
    const v = this.vista, cel = o.celda || GE.celdaIso;
    const nx = Math.ceil(this.w / cel) + 3, ny = Math.ceil(this.h / cel) + 3, x0 = -cel, y0 = -cel;
    const val = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) val[j * nx + i] = potencial(v.mx(x0 + i * cel), v.my(y0 + j * cel));
    const centro = (i, j) => potencial(v.mx(x0 + (i + 0.5) * cel), v.my(y0 + (j + 0.5) * cel));
    const polis = [];
    for (const nivel of niveles) {
      for (const p of isolineas(val, nx, ny, nivel, centro)) {
        if (p.pts.length < 2) continue;
        polis.push({ nivel, cerrada: p.cerrada, pts: p.pts.map(([a, b]) => [x0 + a * cel, y0 + b * cel]) });
      }
    }
    const c = this.ctx;
    c.save(); c.strokeStyle = this.color(o.color || 'electrico'); c.lineWidth = GE.equipotencial;
    c.setLineDash(PATRON.componente); c.lineCap = 'butt'; c.lineJoin = 'round';
    for (const p of polis) {
      c.beginPath(); c.moveTo(p.pts[0][0], p.pts[0][1]);
      for (let i = 1; i < p.pts.length; i++) c.lineTo(p.pts[i][0], p.pts[i][1]);
      if (p.cerrada) c.closePath();
      c.stroke();
    }
    c.restore();
    return polis;
  };

  /*
   * Etiquetas de valor de las equipotenciales: Plex Mono 11 px del color de
   * la familia, con halo, una por curva. La posición sale de la geometría de
   * la curva (no del orden del cálculo) para que no salte entre cuadros.
   * o: {formato(V) → texto, evitar: [[x, y, r] px], ocupado: [[x0, y0, x1, y1]]}
   * Devuelve las cajas ocupadas.
   */
  P.etiquetasEquipotenciales = function (polis, o = {}) {
    const c = this.ctx, colocadas = (o.ocupado || []).slice(), evitar = o.evitar || [];
    const formato = o.formato || (V => cantidad(V, 'V', 3));
    const canon = p => {
      let pts = p.pts.slice();
      if (p.cerrada) {
        let k = 0; for (let i = 1; i < pts.length; i++) if (pts[i][1] < pts[k][1]) k = i;
        pts = pts.slice(k).concat(pts.slice(0, k + 1));
        if (pts.length > 2 && pts[1][0] < pts[0][0]) pts.reverse();
      } else if (pts[0][0] > pts[pts.length - 1][0]) pts.reverse();
      return pts;
    };
    c.save(); c.font = this._fuente('num', 11);
    for (const p of polis) {
      const L = longitud(p.pts); if (L < GE.etiquetaMin) continue;
      const pts = canon(p), txt = formato(p.nivel), w = c.measureText(txt).width + 6, h = 14;
      const fracciones = p.cerrada ? [0.125, 0.375, 0.875, 0.625, 0, 0.25, 0.5, 0.75] : [0.5, 0.35, 0.65, 0.2, 0.8];
      for (const f of fracciones) {
        const [x, y] = puntoEn(pts, f * L);
        const caja = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
        if (caja[0] < 8 || caja[1] < 8 || caja[2] > this.w - 8 || caja[3] > this.h - 8) continue;
        if (evitar.some(([ex, ey, er]) => Math.hypot(Math.max(caja[0] - ex, 0, ex - caja[2]), Math.max(caja[1] - ey, 0, ey - caja[3])) < er)) continue;
        if (colocadas.some(r => r[0] < caja[2] + 4 && caja[0] < r[2] + 4 && r[1] < caja[3] + 2 && caja[1] < r[3] + 2)) continue;
        colocadas.push(caja);
        this.texto(txt, x, y + 0.5, { fuente: 'num', tam: 11, color: o.color || 'electrico', alinear: 'center', base: 'middle', halo: true });
        break;
      }
    }
    c.restore();
    return colocadas;
  };

  /*
   * Mapa de potencial con el mapa divergente (sección 3.3): azul ← lienzo →
   * bermellón. Se pinta como tinte sobre el lienzo (alfa proporcional a
   * tanh(|V| / escala)), así la cuadrícula sigue viéndose debajo.
   * o: {escala (V), opacidad máxima, celda}
   */
  P.mapaPotencial = function (potencial, o = {}) {
    const v = this.vista, cel = o.celda || GE.celdaMapa;
    const W = Math.ceil(this.w / cel), H = Math.ceil(this.h / cel);
    const cv = this._mapaCv || (this._mapaCv = document.createElement('canvas'));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    const neg = aRGB(this.t['mapa-divergente-negativo']), pos = aRGB(this.t['mapa-divergente-positivo']);
    const esc = o.escala || 1, max = o.opacidad == null ? 0.78 : o.opacidad;
    for (let j = 0; j < H; j++) {
      const y = v.my((j + 0.5) * cel);
      for (let i = 0; i < W; i++) {
        const V = potencial(v.mx((i + 0.5) * cel), y), s = Math.tanh(Math.abs(V) / esc) || 0, col = V >= 0 ? pos : neg, k = (j * W + i) * 4;
        d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = Math.round(255 * max * s);
      }
    }
    g.putImageData(img, 0, 0);
    const c = this.ctx; c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(cv, 0, 0, W * cel, H * cel); c.restore();
  };

  /*
   * Malla de vectores E en los nodos de una rejilla de mundo (no "nada" al
   * desplazar la vista). Cada flecha está centrada en su nodo; su largo es
   * logarítmico (por defecto) o lineal respecto de Eref.
   * o: {Eref (V/m), escalaTipo: 'log'|'lineal', pasoPx, evitar: [[x, y, r] px], halo}
   */
  P.mallaCampo = function (campo, o = {}) {
    const v = this.vista, paso = pasoAgradable((o.pasoPx || 46) / v.escala), pp = paso * v.escala;
    const Lmax = 0.8 * pp, Eref = o.Eref || 1, log = o.escalaTipo !== 'lineal', evitar = o.evitar || [];
    const c = this.ctx, col = this.color(o.color || 'electrico');
    const flechas = [];
    for (let X = Math.ceil(v.mx(0) / paso) * paso; X <= v.mx(this.w); X += paso) {
      for (let Y = Math.ceil(v.my(this.h) / paso) * paso; Y <= v.my(0); Y += paso) {
        const x = v.X(X), y = v.Y(Y);
        if (evitar.some(([a, b, r]) => Math.hypot(x - a, y - b) < r)) continue;
        const [ex, ey] = campo(X, Y), E = Math.hypot(ex, ey);
        if (!(E > 0) || !isFinite(E)) continue;
        const f = log ? Math.min(1, Math.max(0.14, (Math.log10(E / Eref) + 1.5) / 2.5)) : Math.min(1, 0.5 * E / Eref);
        const L = Lmax * f, ux = ex / E, uy = -ey / E;
        flechas.push([x - ux * L / 2, y - uy * L / 2, x + ux * L / 2, y + uy * L / 2, Math.atan2(uy, ux)]);
      }
    }
    const [Lp] = GE.flechaLinea;
    c.save(); c.setLineDash([]); c.lineCap = 'round';
    for (const pasada of o.halo ? ['halo', 'tinta'] : ['tinta']) {
      c.strokeStyle = pasada === 'halo' ? this.t.lienzo : col;
      c.lineWidth = pasada === 'halo' ? G.componente + G.halo : G.componente;
      c.beginPath();
      for (const [x1, y1, x2, y2, a] of flechas) { c.moveTo(x1, y1); c.lineTo(x2 - Math.cos(a) * Lp * 0.6, y2 - Math.sin(a) * Lp * 0.6); }
      c.stroke();
    }
    c.restore();
    for (const [, , x2, y2, a] of flechas) this._puntaLinea(x2 - Math.cos(a) * Lp / 2, y2 - Math.sin(a) * Lp / 2, a, col);
  };

  /*
   * Sonda de campo (instrumento, capa 8): anillo de lienzo con borde de
   * tinta, punto central y cuatro trazos de retícula a 45°. El vector E se
   * dibuja antes, desde el centro, y el anillo lo tapa en su arranque.
   */
  P.sonda = function (pMundo, o = {}) {
    const [x, y] = this.vista.P(pMundo), c = this.ctx, r = GE.sonda;
    c.save(); c.setLineDash([]); c.lineCap = 'round'; c.strokeStyle = this.t.tinta; c.lineWidth = 1.5;
    c.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2;
      c.moveTo(x + Math.cos(a) * (r + 2.5), y + Math.sin(a) * (r + 2.5)); c.lineTo(x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6));
    }
    c.stroke();
    c.fillStyle = this.t.lienzo; c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.fill(); c.stroke();
    c.fillStyle = this.t.tinta; c.beginPath(); c.arc(x, y, 1.75, 0, 2 * Math.PI); c.fill();
    c.restore();
    if (o.hover) this.contornoHover(pMundo, r);
    if (o.seleccionada) this.seleccionCirculo(x, y, r + 10);
    return [x, y];
  };

  // Hover (sección 7.5): el contorno del objeto se engrosa 0.5 px; nada cambia de color
  P.contornoHover = function (pMundo, r) {
    const [x, y] = this.vista.P(pMundo), c = this.ctx;
    c.save(); c.setLineDash([]); c.strokeStyle = this.t.tinta; c.lineWidth = 2;
    c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.stroke(); c.restore();
  };

  /*
   * Ejes de la gramática sin los números que quedarían tapados por un
   * objeto (una carga sobre x = 1 m tapa la marca "1"). Reutiliza
   * Trazo.ejes tal cual y solo filtra sus textos. huecos: [[x, y, r] px].
   */
  P.ejesLibres = function (o, huecos = []) {
    const propio = Object.prototype.hasOwnProperty.call(this, 'texto'), original = this.texto;
    this.texto = function (str, x, y, op = {}) {
      const c = this.ctx; c.save(); c.font = this._fuente(op.fuente || 'ui', op.tam || 12, op.peso);
      const w = c.measureText(str).width; c.restore();
      const x0 = op.alinear === 'right' ? x - w : op.alinear === 'center' ? x - w / 2 : x;
      const y0 = op.base === 'top' ? y : op.base === 'middle' ? y - 6 : y - 10;
      const tapa = huecos.some(([hx, hy, hr]) => Math.hypot(Math.max(x0 - hx, 0, hx - x0 - w), Math.max(y0 - hy, 0, hy - y0 - 12)) < hr);
      if (!tapa) original.call(this, str, x, y, op);
    };
    try { this.ejes(o); } finally { if (propio) this.texto = original; else delete this.texto; }
  };

  global.Volta.electro = { GE, aRGB, conPrefijo, integrarLinea, isolineas, nivelesAuto, puntoEn, longitud };
})(window);
