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

  // =====================================================================
  // Distribuciones de carga (espacio «Cargas y campos»)
  // Los métodos nuevos llevan el prefijo electro (pendiente del lenguaje:
  // espacio de nombres de los dominios). La materia va en tinta; el signo
  // de la carga es un glifo (+ o −), nunca un color.
  // =====================================================================
  const GD = {
    signo: 3.25,        // medio largo del glifo de signo
    pasoSignos: 22,     // separación de los glifos a lo largo de una distribución
    lamina: 7,          // grosor en pantalla de una lámina vista de canto
    anilloMenor: 4,     // semieje menor del anillo visto de canto (perspectiva)
    aroHilo: 3.5,       // anillo exterior que distingue un hilo de una carga puntual
    punto: 2.75,        // punto con nombre (C, P, D…)
  };

  // Glifo de signo en tinta (o en el color dado)
  P._electroSigno = function (x, y, signo, o = {}) {
    const c = this.ctx, s = o.tam || GD.signo;
    c.save(); c.setLineDash([]); c.strokeStyle = this.color(o.color || 'tinta'); c.lineWidth = o.grosor || 1.5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - s, y); c.lineTo(x + s, y);
    if (signo > 0) { c.moveTo(x, y - s); c.lineTo(x, y + s); }
    c.stroke(); c.restore();
  };

  // Recorte de una recta infinita (por p, dirección u) a la vista, con margen en px
  P._electroRecta = function (p, u, margen = 40) {
    const v = this.vista, [x, y] = v.P(p), ux = u[0], uy = -u[1], L = Math.hypot(this.w, this.h) + 2 * margen;
    const d0 = (x - this.w / 2) * ux + (y - this.h / 2) * uy;
    return [[x - (d0 + L / 2) * ux, y - (d0 + L / 2) * uy], [x - (d0 - L / 2) * ux, y - (d0 - L / 2) * uy]];
  };

  /*
   * Dibuja una fuente del motor (tipo, x, y, q | lambda | sigma, radio,
   * largo, angulo, conductora) con su símbolo. o: {seleccionada, hover}.
   * Devuelve la geometría en pantalla para la selección: {tipo, x, y, r} o
   * {tipo, a: [x, y], b: [x, y]}.
   */
  P.electroFuente = function (f, o = {}) {
    const v = this.vista, c = this.ctx, tipo = f.tipo || 'puntual', [x, y] = v.P([f.x || 0, f.y || 0]);
    const sg = Math.sign(tipo === 'hilo' ? f.lambda : tipo === 'lamina' ? f.sigma : f.q) || 1;
    const grueso = o.hover ? 0.5 : 0;
    if (tipo === 'uniforme') return null;
    if (tipo === 'puntual') {
      this.carga([f.x, f.y], sg, { seleccionada: o.seleccionada });
      if (o.hover) this.contornoHover([f.x, f.y], G.carga);
      return { tipo, x, y, r: G.carga };
    }
    if (tipo === 'hilo') {
      c.save(); c.setLineDash([]); c.strokeStyle = this.t.tinta; c.lineWidth = 1 + grueso;
      c.beginPath(); c.arc(x, y, G.carga + GD.aroHilo, 0, 2 * Math.PI); c.stroke(); c.restore();
      this.carga([f.x, f.y], sg);
      if (o.seleccionada) this.seleccionCirculo(x, y, G.carga + GD.aroHilo + 5);
      return { tipo, x, y, r: G.carga + GD.aroHilo };
    }
    if (tipo === 'esfera') {
      const r = Math.max(G.carga, (f.radio || 0) * v.escala);
      c.save(); c.setLineDash([]);
      c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI);
      c.fillStyle = f.conductora ? this.t['campo-activo'] : this.t.campo; c.fill();
      if (f.conductora && r > 14) {                       // rayado cruzado fino del conductor
        c.save(); c.clip(); c.strokeStyle = this.t.linea; c.lineWidth = 1; c.beginPath();
        for (let k = -r; k <= r; k += 7) { c.moveTo(x + k - r, y - r); c.lineTo(x + k + r, y + r); c.moveTo(x + k + r, y - r); c.lineTo(x + k - r, y + r); }
        c.stroke(); c.restore();
      }
      c.strokeStyle = this.t.tinta; c.lineWidth = G.materia + grueso; c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.stroke();
      c.restore();
      // Glifos: en la superficie (conductora) o repartidos por el volumen (aislante)
      if (r < 16) this._electroSigno(x, y, sg);
      else if (f.conductora) {
        const n = Math.max(6, Math.min(24, Math.round(2 * Math.PI * r / GD.pasoSignos)));
        for (let k = 0; k < n; k++) { const a = 2 * Math.PI * (k + 0.5) / n; this._electroSigno(x + (r - 7) * Math.cos(a), y + (r - 7) * Math.sin(a), sg, { tam: 2.75 }); }
      } else {
        const paso = Math.max(16, r / 2.5);
        for (let yy = -r + paso / 2; yy < r; yy += paso) for (let xx = -r + paso / 2; xx < r; xx += paso) if (Math.hypot(xx, yy) < r - 7) this._electroSigno(x + xx, y + yy, sg, { tam: 2.75 });
      }
      if (o.seleccionada) this.seleccionCirculo(x, y, r + 5);
      return { tipo, x, y, r };
    }
    const a = f.angulo || 0, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;   // dirección y normal (mundo)
    if (tipo === 'anillo') {
      // De canto: el plano del anillo es perpendicular a su eje (dirección a)
      const R = (f.radio || 0) * v.escala, A = Math.max(R, 4);
      // Eje de simetría (raya y punto)
      const e = A * 1.6;
      this.lineaPx([[x - ux * e, y + uy * e], [x + ux * e, y - uy * e]], { color: 'texto-3', grosor: 1, patron: 'eje' });
      c.save(); c.setLineDash([]); c.strokeStyle = this.t.tinta; c.lineWidth = G.materia + grueso;
      c.beginPath(); c.ellipse(x, y, A, GD.anilloMenor, -Math.atan2(ny, nx), 0, 2 * Math.PI); c.stroke(); c.restore();
      for (const s of [-1, 1]) {
        const ex = x + nx * A * s, ey = y - ny * A * s;
        this._electroSigno(ex + nx * 9 * s, ey - ny * 9 * s, sg);
      }
      if (o.seleccionada) this.seleccionCirculo(x, y, A + 8);
      return { tipo, x, y, a: [x + nx * A, y - ny * A], b: [x - nx * A, y + ny * A] };
    }
    // Segmento y lámina (de canto), en la dirección a
    const infinita = tipo === 'lamina' && !(Number.isFinite(f.largo) && f.largo > 0);
    let p1, p2;
    if (infinita) [p1, p2] = this._electroRecta([f.x, f.y], [ux, uy]);
    else { const L = (f.largo || 0) * v.escala / 2; p1 = [x - ux * L, y + uy * L]; p2 = [x + ux * L, y - uy * L]; }
    const largo = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), dx = (p2[0] - p1[0]) / (largo || 1), dy = (p2[1] - p1[1]) / (largo || 1);
    const qx = -dy, qy = dx;                                    // normal en pantalla
    if (tipo === 'segmento') {
      this.lineaPx([p1, p2], { color: 'tinta', grosor: G.materia + grueso, extremo: 'butt' });
      for (const p of [p1, p2]) this.lineaPx([[p[0] - qx * 3.5, p[1] - qy * 3.5], [p[0] + qx * 3.5, p[1] + qy * 3.5]], { color: 'tinta', grosor: 1.5 });
      const n = Math.max(1, Math.floor(largo / GD.pasoSignos));
      for (let k = 0; k < n; k++) { const s = largo * (k + 0.5) / n; this._electroSigno(p1[0] + dx * s - qx * 9, p1[1] + dy * s - qy * 9, sg); }
    } else {
      const h = GD.lamina / 2;
      c.save(); c.setLineDash([]);
      c.beginPath(); c.moveTo(p1[0] + qx * h, p1[1] + qy * h); c.lineTo(p2[0] + qx * h, p2[1] + qy * h); c.lineTo(p2[0] - qx * h, p2[1] - qy * h); c.lineTo(p1[0] - qx * h, p1[1] - qy * h); c.closePath();
      c.fillStyle = this.t.lienzo; c.fill(); c.strokeStyle = this.t.tinta; c.lineWidth = 1.5 + grueso; c.stroke(); c.restore();
      const n = Math.max(1, Math.floor(largo / GD.pasoSignos));
      for (let k = 0; k < n; k++) { const s = largo * (k + 0.5) / n; this._electroSigno(p1[0] + dx * s, p1[1] + dy * s, sg, { tam: 2.25, grosor: 1.25 }); }
    }
    if (o.seleccionada) {
      c.save(); c.setLineDash(PATRON.seleccion); c.strokeStyle = this.t.tinta; c.lineWidth = 1; const m = 9;
      c.beginPath(); c.moveTo(p1[0] + qx * m - dx * (infinita ? 0 : 5), p1[1] + qy * m - dy * (infinita ? 0 : 5)); c.lineTo(p2[0] + qx * m + dx * (infinita ? 0 : 5), p2[1] + qy * m + dy * (infinita ? 0 : 5));
      c.lineTo(p2[0] - qx * m + dx * (infinita ? 0 : 5), p2[1] - qy * m + dy * (infinita ? 0 : 5)); c.lineTo(p1[0] - qx * m - dx * (infinita ? 0 : 5), p1[1] - qy * m - dy * (infinita ? 0 : 5)); c.closePath(); c.stroke(); c.restore();
    }
    return { tipo, x, y, a: p1, b: p2 };
  };

  // Distancia en px de (px, py) a la geometría devuelta por electroFuente (0 dentro de un disco)
  function distanciaGeo(g, px, py) {
    if (!g) return Infinity;
    if (g.r != null) return Math.max(0, Math.hypot(px - g.x, py - g.y) - g.r);
    const [ax, ay] = g.a, [bx, by] = g.b, dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
    return Math.hypot(px - ax - u * dx, py - ay - u * dy);
  }

  /*
   * Líneas de campo de cualquier conjunto de fuentes del motor. Cada fuente
   * emite (o recibe) un número de líneas proporcional a su carga: q para
   * las acotadas, λ·1 m para un hilo, σ·L·1 m para una franja; el plano
   * infinito y el campo uniforme, según su densidad de flujo (σ y ε₀·E₀ por
   * metro de lado visible). Las líneas que llegan a una fuente de signo
   * opuesto terminan en su borde; las que faltan en las negativas salen de
   * ellas hacia atrás.
   * fuentes: lista del motor (SI); campo(x, y) → [Ex, Ey];
   * o: {porCoulomb, halo, ocultar: [[x, y, r] px], giro, epsilon0}
   */
  P.electroLineas = function (fuentes, campo, o = {}) {
    const v = this.vista, porQ = o.porCoulomb || 16e6, giro = o.giro || 0, e0 = o.epsilon0 || 8.8541878128e-12;
    const m = Math.max(this.w, this.h) * 0.6, caja = { x0: -m, y0: -m, x1: this.w + m, y1: this.h + m };
    const dirE = (x, y, s) => {
      const e = campo(v.mx(x), v.my(y)), ex = e[0], ey = -e[1], L = Math.hypot(ex, ey);
      return L > 0 && isFinite(L) ? [s * ex / L, s * ey / L] : null;
    };
    // Geometría en pantalla de cada fuente (sin dibujar): discos y tramos
    const geo = fuentes.map(f => geometriaPx(this, f));
    const signo = f => Math.sign(f.tipo === 'hilo' ? f.lambda : f.tipo === 'lamina' ? f.sigma : f.tipo === 'uniforme' ? 0 : f.q) || 0;
    const cercana = (x, y) => { let d = Infinity, i = -1; geo.forEach((g, k) => { const dd = distanciaGeo(g, x, y); if (dd < d) { d = dd; i = k; } }); return { d, i }; };
    const ocultar = o.ocultar || [];
    function integrar(p0, sentido, origen) {
      const pts = [[p0[0], p0[1]]];
      let x = p0[0], y = p0[1], ux = 0, uy = 0, primero = true;
      for (let n = 0; n < 5000; n++) {
        const { d, i } = cercana(x, y);
        if (n > 1 && i >= 0 && i !== origen && d < 1.2 && signo(fuentes[i]) === -sentido) return { pts, fin: 'fuente', fuente: i };
        if (n > 1 && i === origen && d < 0.6 && geo[i].r == null) return { pts, fin: 'fuente', fuente: i };
        const h = Math.max(0.75, Math.min(6, 0.22 * d));
        const k1 = dirE(x, y, sentido); if (!k1) return { pts, fin: 'nulo' };
        const k2 = dirE(x + k1[0] * h / 2, y + k1[1] * h / 2, sentido); if (!k2) return { pts, fin: 'nulo' };
        const k3 = dirE(x + k2[0] * h / 2, y + k2[1] * h / 2, sentido); if (!k3) return { pts, fin: 'nulo' };
        const k4 = dirE(x + k3[0] * h, y + k3[1] * h, sentido); if (!k4) return { pts, fin: 'nulo' };
        const dx = (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6, dy = (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6;
        if (!primero && dx * ux + dy * uy < 0) return { pts, fin: 'nulo' };
        ux = dx; uy = dy; primero = false;
        x += dx * h; y += dy * h; pts.push([x, y]);
        if (x < caja.x0 || x > caja.x1 || y < caja.y0 || y > caja.y1) return { pts, fin: 'sale' };
      }
      return { pts, fin: 'largo' };
    }
    // Semillas de una fuente: puntos en su borde (px), con el número de líneas
    const semillas = (f, g, n) => {
      const r = [];
      if (n <= 0 || !g) return r;
      if (g.r != null && f.tipo !== 'anillo') {
        for (let k = 0; k < n; k++) { const a = (k + 0.5) / n * 2 * Math.PI + giro; r.push([g.x + (g.r + 0.8) * Math.cos(a), g.y + (g.r + 0.8) * Math.sin(a)]); }
        return r;
      }
      if (f.tipo === 'anillo') {
        for (const [px, py] of [g.a, g.b]) {
          const m2 = Math.max(1, Math.round(n / 2));
          for (let k = 0; k < m2; k++) { const a = (k + 0.5) / m2 * 2 * Math.PI + giro; r.push([px + (GD.anilloMenor + 2) * Math.cos(a), py + (GD.anilloMenor + 2) * Math.sin(a)]); }
        }
        return r;
      }
      const [ax, ay] = g.a, [bx, by] = g.b, L = Math.hypot(bx - ax, by - ay) || 1, dx = (bx - ax) / L, dy = (by - ay) / L, h = (f.tipo === 'lamina' ? GD.lamina / 2 : 0) + 1.5;
      if (f.tipo === 'lamina') {
        // Una lámina reparte sus líneas entre sus dos caras según el flujo que
        // sale de cada una (E·n): en un par de placas ±σ casi todas van por dentro
        const K = 64, bins = [], sg = signo(f);
        for (const lado of [1, -1]) for (let k = 0; k < K; k++) {
          const s = L * (k + 0.5) / K, px = ax + dx * s - dy * h * lado, py = ay + dy * s + dx * h * lado;
          const e = campo(v.mx(px), v.my(py)), fl = sg * (e[0] * -dy * lado + e[1] * -dx * lado);
          bins.push({ px, py, w: Math.max(0, fl) || 0 });
        }
        const tot = bins.reduce((a, b) => a + b.w, 0);
        if (tot > 0) {
          let acum = 0, j = 0;
          for (const b of bins) {
            const desde = acum; acum += b.w;
            for (; j < n && (j + 0.5) / n * tot <= acum; j++) {
              const u = b.w ? ((j + 0.5) / n * tot - desde) / b.w - 0.5 : 0;
              r.push([b.px + dx * u * L / K, b.py + dy * u * L / K]);
            }
          }
          return r;
        }
      }
      const porLado = Math.max(1, Math.round(n / 2));
      for (const lado of [1, -1]) for (let k = 0; k < porLado; k++) {
        const s = L * (k + 0.5) / porLado;
        r.push([ax + dx * s - dy * h * lado, ay + dy * s + dx * h * lado]);
      }
      return r;
    };
    const lineasDe = f => {
      const t = f.tipo || 'puntual';
      if (t === 'hilo') return Math.round(Math.abs(f.lambda) * porQ);
      if (t === 'lamina') {
        const L = Number.isFinite(f.largo) && f.largo > 0 ? f.largo : 0;
        if (L) return Math.round(Math.abs(f.sigma) * L * porQ);
        // Plano infinito: densidad de líneas por metro de lado visible
        const visible = Math.hypot(this.w, this.h) / v.escala;
        return Math.min(160, Math.round(Math.abs(f.sigma) * visible * porQ));
      }
      return Math.max(1, Math.round(Math.abs(f.q) * porQ));
    };
    const lineas = [], llegadas = fuentes.map(() => 0), llegAng = fuentes.map(() => []);
    fuentes.forEach((f, i) => {
      if (signo(f) <= 0) return;
      for (const p of semillas(f, geo[i], lineasDe(f))) {
        const r = integrar(p, 1, i);
        if (r.fin === 'fuente') { llegadas[r.fuente]++; const g = geo[r.fuente]; if (g.r != null) llegAng[r.fuente].push(Math.atan2(r.pts[r.pts.length - 1][1] - g.y, r.pts[r.pts.length - 1][0] - g.x)); }
        lineas.push({ pts: r.pts, desde: 'carga', hasta: r.fin === 'fuente' ? 'carga' : 'abierto' });
      }
    });
    // Campo uniforme: líneas desde el borde de la vista contra la corriente
    fuentes.forEach(f => {
      if (f.tipo !== 'uniforme' || !f.E0) return;
      const a = f.angulo || 0, ux = Math.cos(a), uy = -Math.sin(a), sx = Math.sign(f.E0);
      const paso = Math.max(24, Math.min(90, 1 / (e0 * Math.abs(f.E0) * porQ) * v.escala));
      // Recta de partida: perpendicular a E, en el borde de entrada de la vista
      const cx = this.w / 2 - sx * ux * (this.w + this.h) / 2, cy = this.h / 2 - sx * uy * (this.w + this.h) / 2;
      const D = Math.hypot(this.w, this.h);
      for (let s = -D / 2 + (paso / 2) % paso; s < D / 2; s += paso) {
        const p = [cx - uy * s, cy + ux * s];
        const r = integrar(p, 1, -1);
        if (r.fin === 'fuente') llegadas[r.fuente]++;
        if (r.pts.length > 1) lineas.push({ pts: r.pts, desde: 'abierto', hasta: r.fin === 'fuente' ? 'carga' : 'abierto' });
      }
    });
    fuentes.forEach((f, i) => {
      if (signo(f) >= 0) return;
      const n = lineasDe(f), faltan = n - llegadas[i], g = geo[i];
      if (faltan <= 0) return;
      let pts;
      if (g && g.r != null && f.tipo !== 'anillo' && llegAng[i].length) {
        const angs = llegAng[i].slice(); pts = [];
        for (let k = 0; k < faltan; k++) { const a = mayorHueco(angs); angs.push(a); pts.push([g.x + (g.r + 0.8) * Math.cos(a), g.y + (g.r + 0.8) * Math.sin(a)]); }
      } else pts = semillas(f, g, n === faltan ? n : faltan);
      for (const p of pts) {
        const r = integrar(p, -1, i);
        r.pts.reverse();
        lineas.push({ pts: r.pts, desde: r.fin === 'fuente' ? 'carga' : 'abierto', hasta: 'carga' });
      }
    });
    // Dibujo: un solo trazo; halo si van sobre un mapa
    const c = this.ctx, col = this.color(o.color || 'electrico');
    const ruta = () => { c.beginPath(); for (const l of lineas) { const p = l.pts; if (p.length < 2) continue; c.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) c.lineTo(p[i][0], p[i][1]); } };
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
      if (l.desde === 'abierto' && l.hasta === 'abierto') {
        // Línea que cruza la vista de lado a lado (campo uniforme): flecha en la mitad de lo visible
        const vis = l.pts.filter(([x, y]) => x > 0 && x < this.w && y > 0 && y < this.h);
        if (vis.length < 2) continue;
        const k = Math.floor(vis.length / 2), m = vis[k], prev = vis[k - 1];
        this._puntaLinea(m[0], m[1], Math.atan2(m[1] - prev[1], m[0] - prev[0]), col);
        continue;
      }
      const s = l.desde === 'carga' && l.hasta === 'carga' ? L / 2 : l.desde === 'carga' ? Math.min(L / 2, GE.tramoFlecha) : L - Math.min(L / 2, GE.tramoFlecha);
      const [x, y, ang] = puntoEn(l.pts, s);
      this._puntaLinea(x, y, ang, col);
    }
    c.restore();
    return lineas;
  };

  // Geometría en pantalla de una fuente sin dibujarla (misma que electroFuente)
  function geometriaPx(tz, f) {
    const v = tz.vista, tipo = f.tipo || 'puntual';
    if (tipo === 'uniforme') return null;
    const [x, y] = v.P([f.x || 0, f.y || 0]);
    if (tipo === 'puntual') return { tipo, x, y, r: G.carga };
    if (tipo === 'hilo') return { tipo, x, y, r: G.carga + GD.aroHilo };
    if (tipo === 'esfera') return { tipo, x, y, r: Math.max(G.carga, (f.radio || 0) * v.escala) };
    const a = f.angulo || 0, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
    if (tipo === 'anillo') { const A = Math.max((f.radio || 0) * v.escala, 4); return { tipo, x, y, a: [x + nx * A, y - ny * A], b: [x - nx * A, y + ny * A] }; }
    if (tipo === 'lamina' && !(Number.isFinite(f.largo) && f.largo > 0)) { const [p1, p2] = tz._electroRecta([f.x, f.y], [ux, uy]); return { tipo, x, y, a: p1, b: p2 }; }
    const L = (f.largo || 0) * v.escala / 2;
    return { tipo, x, y, a: [x - ux * L, y + uy * L], b: [x + ux * L, y - uy * L] };
  }
  P.electroGeometria = function (f) { return geometriaPx(this, f); };
  P.electroDistancia = function (f, x, y) { return distanciaGeo(geometriaPx(this, f), x, y); };

  // Punto con nombre (C, P, D, O…): punto de tinta y su etiqueta con halo
  P.electroPunto = function (pMundo, segs, o = {}) {
    const [x, y] = this.vista.P(pMundo), c = this.ctx;
    c.save(); c.setLineDash([]); c.fillStyle = this.t.tinta; c.beginPath(); c.arc(x, y, GD.punto, 0, 2 * Math.PI); c.fill(); c.restore();
    if (segs) {
      const lado = o.lado || 'ne', dx = lado.includes('o') ? -7 : 7, dy = lado.includes('s') ? 16 : -6;
      this.compuesto(segs, x + dx, y + dy, { alinear: lado.includes('o') ? 'right' : 'left' });
    }
    return [x, y];
  };

  /*
   * Superficie gaussiana vista en el plano: esfera o cilindro de eje z (los
   * dos se ven como una circunferencia). Discontinua 6 · 4 en tinta, con su
   * normal hacia fuera marcada en cuatro puntos. o: {seleccionada, hover}
   */
  P.electroGauss = function (cMundo, R, o = {}) {
    const [x, y] = this.vista.P(cMundo), r = R * this.vista.escala, c = this.ctx;
    c.save(); c.strokeStyle = this.t.tinta; c.lineWidth = G.previsto + (o.hover ? 0.5 : 0); c.setLineDash(PATRON.previsto);
    c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.stroke(); c.restore();
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2, x1 = x + r * Math.cos(a), y1 = y + r * Math.sin(a);
      this.flechaPx(x1, y1, x1 + 12 * Math.cos(a), y1 + 12 * Math.sin(a), { color: 'texto-3', grosor: 1, punta: 'abierta' });
    }
    if (o.seleccionada) { this.seleccionCirculo(x, y, r + 6); this.asa(x + r, y); }
    return [x, y, r];
  };

  /*
   * Camino de una carga de prueba que se lleva despacio: polilínea auxiliar
   * discontinua con punta abierta al final y el tramo recorrido hasta s
   * (fracción del largo) en trazo real.
   */
  P.electroCamino = function (ptsMundo, s = 0) {
    const pts = ptsMundo.map(p => this.vista.P(p));
    this.lineaPx(pts, { color: 'texto-3', grosor: G.previsto, patron: 'previsto', extremo: 'butt' });
    const L = longitud(pts);
    if (s > 0 && L > 0) {
      const hasta = [], objetivo = s * L; let acum = 0;
      hasta.push(pts[0]);
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (acum + d >= objetivo) { const u = (objetivo - acum) / (d || 1); hasta.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u]); break; }
        acum += d; hasta.push(pts[i]);
      }
      this.lineaPx(hasta, { color: 'texto-2', grosor: G.real });
    }
    if (L > 30) { const [x, y, ang] = puntoEn(pts, L - 12); this._punta(x - Math.cos(ang) * 0.1, y - Math.sin(ang) * 0.1, x, y, 1, 'abierta', this.t['texto-2']); }
    return pts;
  };

  // =====================================================================
  // Conductores y dieléctricos (espacio «Conductores y dieléctricos»)
  // Todo en coordenadas de pantalla: el capacitor se dibuja como esquema
  // (el hueco real es de milímetros) y el sistema radial a escala.
  // =====================================================================

  // Relleno de material en un camino ya trazado: conductor (campo-activo y
  // rayado cruzado fino) o dieléctrico (puntos regulares)
  P._electroRelleno = function (tipo, x0, y0, x1, y1) {
    const c = this.ctx;
    if (tipo === 'conductor') {
      c.fillStyle = this.t['campo-activo']; c.fill();
      c.save(); c.clip(); c.strokeStyle = this.t.linea; c.lineWidth = 1; c.beginPath();
      const h = y1 - y0;
      for (let k = x0 - h; k < x1 + h; k += 7) { c.moveTo(k, y0); c.lineTo(k + h, y1); c.moveTo(k + h, y0); c.lineTo(k, y1); }
      c.stroke(); c.restore();
    } else if (tipo === 'dielectrico') {
      c.fillStyle = this.t.lienzo; c.fill();
      c.save(); c.clip(); c.fillStyle = this.t['texto-3'];
      for (let yy = y0 + 4; yy < y1; yy += 7) for (let xx = x0 + 4 + ((yy - y0) % 14 ? 3.5 : 0); xx < x1; xx += 7) { c.beginPath(); c.arc(xx, yy, 0.9, 0, 2 * Math.PI); c.fill(); }
      c.restore();
    }
  };

  /** Rectángulo de material (px): 'conductor' | 'dielectrico' | 'placa'. o: {seleccionada, hover} */
  P.electroBloque = function (x0, y0, x1, y1, tipo, o = {}) {
    const c = this.ctx;
    c.save(); c.setLineDash([]);
    c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0);
    this._electroRelleno(tipo === 'placa' ? 'conductor' : tipo, x0, y0, x1, y1);
    c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0);
    c.strokeStyle = this.t.tinta; c.lineWidth = (tipo === 'dielectrico' ? 1 : 1.5) + (o.hover ? 0.5 : 0); c.stroke();
    c.restore();
    if (o.seleccionada) this.seleccionCaja(x0, y0, x1 - x0, y1 - y0);
  };

  /** Fila de glifos de signo entre x0 y x1 a la altura y; n glifos. */
  P.electroSignos = function (x0, x1, y, signo, n, o = {}) {
    if (!(n > 0) || !signo) return;
    for (let k = 0; k < n; k++) this._electroSigno(x0 + (x1 - x0) * (k + 0.5) / n, y, signo, o);
  };

  /** Pila (símbolo IEC) con su borne positivo hacia arriba, centrada en (x, y). */
  P.electroBateria = function (x, y, o = {}) {
    const c = this.ctx;
    c.save(); c.setLineDash([]); c.strokeStyle = this.t.tinta; c.lineCap = 'butt';
    c.lineWidth = 2; c.beginPath(); c.moveTo(x - 13, y - 4); c.lineTo(x + 13, y - 4); c.stroke();
    c.lineWidth = 4; c.beginPath(); c.moveTo(x - 7, y + 4); c.lineTo(x + 7, y + 4); c.stroke();
    c.restore();
    this._electroSigno(x + 20, y - 10, 1, { tam: 3 });
    if (o.etiqueta) this.compuesto(o.etiqueta, x - 22, y + 5, { alinear: 'right' });
  };

  /** Interruptor entre dos puntos (px) de un cable vertical: abierto o cerrado. */
  P.electroInterruptor = function (x, y0, y1, cerrado) {
    const c = this.ctx;
    c.save(); c.setLineDash([]); c.strokeStyle = this.t.tinta; c.fillStyle = this.t.lienzo; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x, y0); c.lineTo(cerrado ? x : x + 11, cerrado ? y1 : y1 + (y0 - y1) * 0.2); c.stroke();
    for (const yy of [y0, y1]) { c.beginPath(); c.arc(x, yy, 2.5, 0, 2 * Math.PI); c.fill(); c.stroke(); }
    c.restore();
  };

  /** Voltímetro: círculo con «V» en su centro (instrumento, en tinta). */
  P.electroVoltimetro = function (x, y) {
    const c = this.ctx, r = 11;
    c.save(); c.setLineDash([]); c.fillStyle = this.t.lienzo; c.strokeStyle = this.t.tinta; c.lineWidth = 1.5;
    c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.fill(); c.stroke(); c.restore();
    this.texto('V', x, y + 0.5, { fuente: 'ui', tam: 12, peso: 500, color: 'tinta', alinear: 'center', base: 'middle' });
  };

  /** Toma de tierra bajo (x, y). */
  P.electroTierra = function (x, y) {
    const c = this.ctx;
    c.save(); c.setLineDash([]); c.strokeStyle = this.t.tinta; c.lineWidth = 1.5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 8); c.moveTo(x - 9, y + 8); c.lineTo(x + 9, y + 8); c.moveTo(x - 5.5, y + 11.5); c.lineTo(x + 5.5, y + 11.5); c.moveTo(x - 2, y + 15); c.lineTo(x + 2, y + 15); c.stroke();
    c.restore();
  };

  /** Corona circular (px) de material entre los radios r1 y r2. */
  P.electroCorona = function (x, y, r1, r2, tipo, o = {}) {
    const c = this.ctx;
    c.save(); c.setLineDash([]);
    c.beginPath(); c.arc(x, y, r2, 0, 2 * Math.PI); if (r1 > 0) c.arc(x, y, r1, 0, 2 * Math.PI, true);
    this._electroRelleno(tipo, x - r2, y - r2, x + r2, y + r2);
    c.strokeStyle = this.t.tinta; c.lineWidth = (tipo === 'dielectrico' ? 1 : 1.5) + (o.hover ? 0.5 : 0);
    c.beginPath(); c.arc(x, y, r2, 0, 2 * Math.PI); c.stroke();
    if (r1 > 0) { c.beginPath(); c.arc(x, y, r1, 0, 2 * Math.PI); c.stroke(); }
    c.restore();
    if (o.seleccionada) this.seleccionCirculo(x, y, r2 + 5);
  };

  /** Glifos de signo repartidos sobre una circunferencia de radio r (px). */
  P.electroSignosCirculo = function (x, y, r, signo, n, o = {}) {
    if (!(n > 0) || !signo) return;
    for (let k = 0; k < n; k++) { const a = 2 * Math.PI * (k + 0.5) / n + (o.giro || 0); this._electroSigno(x + r * Math.cos(a), y + r * Math.sin(a), signo, o); }
  };

  global.Volta.electro = { GE, GD, aRGB, conPrefijo, integrarLinea, isolineas, nivelesAuto, puntoEn, longitud, distanciaGeo };
})(window);
