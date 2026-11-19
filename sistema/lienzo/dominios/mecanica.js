/* ==========================================================================
   Volta — gramática del lienzo · dominio Mecánica
   Símbolos propios del módulo que trazo.js no resuelve, según la sección 7
   de docs/04_lenguaje_de_diseno.md:
   - arco de superficie (hemisferio, cuenco, pista circular) con el rayado
     a 45° del lado sólido, igual que superficie();
   - disco con radio físico como cuerpo: relleno --campo, contorno de materia
     y centro de masa (la partícula puntual sigue siendo particula());
   - cuerda tensa (recta, o quebrada en los clavos) y floja (catenaria con la
     misma longitud, colgando hacia donde apunta la gravedad);
   - varilla rígida: trazo de materia con pasadores en los extremos;
   - polea: rueda con eje, soporte hasta un techo rayado y la cuerda que
     abraza la rueda entre los dos ramales;
   - clavo: anillo de tinta sin centro (el pivote lleva centro);
   - selección de segmentos y arcos: contorno discontinuo 3 · 3 a 5 px.
   Extiende Volta.Trazo.prototype con prefijo mec (sección 11: cada dominio
   nombra sus métodos con prefijo propio). Mismas convenciones que trazo.js:
   grosores en px de pantalla (no escalan con el zoom), patrones de PATRON,
   colores de this.t. Coordenadas de mundo en metros (y hacia arriba).
   Requiere trazo.js.
   ========================================================================== */
(function (global) {
  'use strict';
  const { Trazo, G, PATRON } = global.Volta;
  const P = Trazo.prototype;

  // Medidas del dominio (px de pantalla)
  const GM = {
    clavo: 3.5,           // radio del anillo del clavo
    pasador: 2.5,         // radio de los pasadores de la varilla
    poleaMin: 6,          // radio mínimo de la rueda en pantalla
    soporte: 16,          // distancia del borde de la rueda al techo de su soporte
    techo: 12,            // medio ancho del techo del soporte, además del radio
    muestrasCuerda: 40,   // puntos de la catenaria
    seleccion: 5,         // separación del contorno de selección
  };

  // ---------------------------------------------------------------------
  // Auxiliares de geometría (mundo)
  // ---------------------------------------------------------------------
  const resta = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const largo = a => Math.hypot(a[0], a[1]);

  /**
   * Catenaria de longitud L entre p1 y p2 que cuelga en la dirección `abajo`
   * (vector unitario de la gravedad). Sin gravedad, la cuerda floja se
   * comba hacia la izquierda de p1 → p2. Devuelve puntos de mundo.
   * y = a·cosh((x − x0)/a) + c en el marco con «arriba» = −abajo:
   *   L² − v² = (2a·senh(h/2a))²,  x0 = (x1 + x2)/2 − a·atanh(v/L).
   */
  function catenaria(p1, p2, L, abajo, n = GM.muestrasCuerda) {
    const D = largo(resta(p2, p1));
    if (!(L > D * (1 + 1e-9)) || D < 1e-12) return [p1, p2];
    let ab = abajo && largo(abajo) > 0 ? abajo : null;
    if (!ab) { const u = resta(p2, p1); ab = [u[1] / D, -u[0] / D]; }
    const up = [-ab[0], -ab[1]], ex = [up[1], -up[0]];
    const X = p => p[0] * ex[0] + p[1] * ex[1], Y = p => p[0] * up[0] + p[1] * up[1];
    let q1 = p1, q2 = p2, invertido = false;
    if (X(q2) < X(q1)) { q1 = p2; q2 = p1; invertido = true; }
    const x1 = X(q1), y1 = Y(q1), x2 = X(q2), y2 = Y(q2), h = x2 - x1, v = y2 - y1;
    const mundo = (x, y) => [ex[0] * x + up[0] * y, ex[1] * x + up[1] * y];
    const pts = [];
    if (h < 1e-6 * L) {
      // Cuerda vertical floja: baja desde el extremo alto, da la vuelta y sube al bajo
      const fondo = Math.min(y1, y2) - (L - Math.abs(v)) / 2, ancho = Math.min(0.04 * L, (L - Math.abs(v)) / 6);
      const alto = y1 >= y2 ? q1 : q2, bajo = y1 >= y2 ? q2 : q1;
      pts.push(alto, mundo(X(alto) - ancho * 0.5, fondo + ancho), mundo(X(alto), fondo), mundo(X(alto) + ancho * 0.5, fondo + ancho), bajo);
      return y1 >= y2 ? (invertido ? pts.reverse() : pts) : (invertido ? pts : pts.reverse());
    }
    // senh(ξ)/ξ = √(L² − v²)/h, creciente en ξ > 0: bisección
    const objetivo = Math.sqrt(L * L - v * v) / h;
    let lo = 1e-9, hi = 1;
    while (Math.sinh(hi) / hi < objetivo && hi < 700) hi *= 2;
    for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (Math.sinh(m) / m < objetivo) lo = m; else hi = m; }
    const xi = (lo + hi) / 2, a = h / (2 * xi);
    const x0 = (x1 + x2) / 2 - a * Math.atanh(Math.max(-1 + 1e-15, Math.min(1 - 1e-15, v / L)));
    const c0 = y1 - a * Math.cosh((x1 - x0) / a);
    for (let k = 0; k <= n; k++) {
      const x = x1 + h * k / n;
      pts.push(mundo(x, a * Math.cosh((x - x0) / a) + c0));
    }
    pts[0] = q1; pts[n] = q2;
    return invertido ? pts.reverse() : pts;
  }

  // ---------------------------------------------------------------------
  // Superficies
  // ---------------------------------------------------------------------
  /**
   * Arco de superficie con centro c y radio r (mundo), de a0 a a1 (radianes,
   * sentido antihorario). cara 'exterior': sólido dentro (esfera,
   * hemisferio); 'interior': sólido fuera (cuenco, pista).
   * Rayado a 45° cada 6 px a lo largo del arco, como superficie().
   */
  P.mecArco = function (c, r, a0, a1, cara, o = {}) {
    const v = this.vista, [cx, cy] = v.P(c), R = r * v.escala, ctx = this.ctx;
    if (!(R > 0.5)) return;
    const total = a1 - a0, adentro = cara !== 'interior';
    // Rayado: en cada punto, normal hacia el sólido y tangente del recorrido antihorario
    ctx.save(); ctx.strokeStyle = this.t['texto-3']; ctx.lineWidth = 1; ctx.setLineDash([]); ctx.lineCap = 'butt';
    ctx.beginPath();
    const pasos = Math.max(1, Math.floor(R * Math.abs(total) / G.rayadoPaso));
    for (let k = 0; k < pasos; k++) {
      const ang = a0 + total * (k + 0.5) / pasos;
      const ux = Math.cos(ang), uy = -Math.sin(ang);          // radial hacia fuera (pantalla)
      const tx = -Math.sin(ang), ty = -Math.cos(ang);         // tangente antihoraria (pantalla)
      const nx = adentro ? -ux : ux, ny = adentro ? -uy : uy;  // hacia el sólido
      // Mismo sentido del rayado que superficie(): hacia el sólido y hacia atrás del recorrido
      const hx = (nx - tx) * G.rayadoProf * 0.72, hy = (ny - ty) * G.rayadoProf * 0.72;
      const px = cx + ux * R, py = cy + uy * R;
      ctx.moveTo(px, py); ctx.lineTo(px + hx, py + hy);
    }
    ctx.stroke();
    // Línea de materia
    ctx.strokeStyle = this.t.tinta; ctx.lineWidth = G.materia + (o.grueso ? 0.5 : 0); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, R, -a0, -a1, true); ctx.stroke();
    ctx.restore();
  };

  // ---------------------------------------------------------------------
  // Materia
  // ---------------------------------------------------------------------
  /**
   * Disco con radio físico r (mundo). Si en pantalla es menor que una
   * partícula, se dibuja como partícula. Devuelve [x, y, radioPx].
   */
  // o.lado: dirección en pantalla [dx, dy] del rótulo (por defecto arriba a la
  // izquierda, como particle()); la pantalla elige la que no pisa los vectores.
  P.mecDisco = function (p, r, o = {}) {
    const v = this.vista, [x, y] = v.P(p), R = r * v.escala, ctx = this.ctx;
    const rotulo = rr => {
      if (!o.etiqueta) return;
      const [dx, dy] = o.lado || [-1, -1], d = rr * Math.SQRT1_2 + 5;
      this.texto(o.etiqueta, x + Math.sign(dx) * d, y + Math.sign(dy) * d + (dy > 0 ? 9 : -1), { fuente: 'ui', tam: 12, peso: 500, color: 'texto', alinear: dx < 0 ? 'right' : 'left', halo: true });
    };
    if (!(R > G.particula)) {
      const rp = G.particula + (o.grueso ? 0.5 : 0);
      ctx.save(); ctx.setLineDash([]); ctx.fillStyle = this.t.tinta;
      ctx.beginPath(); ctx.arc(x, y, rp, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
      rotulo(rp + 2);
      return [x, y, G.particula];
    }
    ctx.save(); ctx.setLineDash([]);
    ctx.fillStyle = this.t.campo; ctx.strokeStyle = this.t.tinta; ctx.lineWidth = G.materia + (o.grueso ? 0.5 : 0);
    ctx.beginPath(); ctx.arc(x, y, R, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.restore();
    if (R >= 10) this.centroMasa(p);
    else { ctx.save(); ctx.fillStyle = this.t.tinta; ctx.beginPath(); ctx.arc(x, y, 1.75, 0, 2 * Math.PI); ctx.fill(); ctx.restore(); }
    rotulo(R);
    return [x, y, R];
  };

  // ---------------------------------------------------------------------
  // Conectores
  // ---------------------------------------------------------------------
  /**
   * Cuerda: tensa, polilínea de mundo (pivote → clavos → partícula); floja,
   * con o.longitud mayor que la distancia entre los dos últimos puntos, el
   * último tramo es una catenaria que cuelga hacia o.abajo.
   */
  P.mecCuerda = function (ptsMundo, o = {}) {
    if (ptsMundo.length < 2) return;
    let pts = ptsMundo;
    if (o.longitud != null) {
      const n = pts.length, p1 = pts[n - 2], p2 = pts[n - 1];
      const fijo = pts.slice(0, -1).reduce((s, p, i) => (i ? s + largo(resta(p, pts[i - 1])) : 0), 0);
      const resto = o.longitud - fijo;
      if (resto > largo(resta(p2, p1)) * (1 + 1e-6)) pts = [...pts.slice(0, -2), ...catenaria(p1, p2, resto, o.abajo)];
    }
    this.linea(pts, { color: 'texto-2', grosor: G.real + (o.grueso ? 0.5 : 0) });
  };

  P.mecCatenaria = catenaria;

  /** Varilla rígida: materia entre p1 y p2 con pasadores en los extremos. */
  P.mecVarilla = function (p1, p2, o = {}) {
    const [x1, y1] = this.vista.P(p1), [x2, y2] = this.vista.P(p2), ctx = this.ctx;
    this.lineaPx([[x1, y1], [x2, y2]], { color: 'tinta', grosor: G.materia + (o.grueso ? 0.5 : 0) });
    ctx.save(); ctx.setLineDash([]); ctx.fillStyle = this.t.lienzo; ctx.strokeStyle = this.t.tinta; ctx.lineWidth = 1.25;
    for (const [x, y] of [[x1, y1], [x2, y2]]) { ctx.beginPath(); ctx.arc(x, y, GM.pasador, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  };

  /**
   * Polea: rueda de radio r (mundo, con un mínimo en pantalla) centrada en c,
   * soporte de materia hacia `arriba` (unitario de mundo, contrario a la
   * gravedad) con un techo rayado, y eje como pivote. Devuelve el radio en px.
   */
  P.mecPolea = function (c, r, arriba, o = {}) {
    const v = this.vista, [x, y] = v.P(c), R = Math.max(GM.poleaMin, r * v.escala), ctx = this.ctx;
    const ux = arriba ? arriba[0] : 0, uy = arriba ? -arriba[1] : -1;     // arriba en pantalla
    if (o.soporte !== false) {
      const d = R + GM.soporte, tx = x + ux * d, ty = y + uy * d, w = R + GM.techo;
      this.lineaPx([[x, y], [tx, ty]], { color: 'tinta', grosor: G.materia });
      // Techo: perpendicular a «arriba», con el sólido del lado de arriba
      const px = -uy, py = ux;
      this.superficie([[v.mx(tx - px * w), v.my(ty - py * w)], [v.mx(tx + px * w), v.my(ty + py * w)]]);
    }
    ctx.save(); ctx.setLineDash([]);
    ctx.fillStyle = this.t.campo; ctx.strokeStyle = this.t.tinta; ctx.lineWidth = G.materia + (o.grueso ? 0.5 : 0);
    ctx.beginPath(); ctx.arc(x, y, R, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.restore();
    this.pivote(c);
    return R;
  };

  /**
   * Tramo de cuerda que abraza la rueda: arco de radio R (px) alrededor de
   * c (mundo) entre los ángulos de pantalla angA y angB, por el lado que
   * pasa por angMedio.
   */
  P.mecAbrazo = function (c, R, angA, angB, angMedio) {
    const [x, y] = this.vista.P(c), ctx = this.ctx, d = 2 * Math.PI;
    const norm = a => ((a % d) + d) % d;
    // En pantalla el ángulo crece en sentido horario; si ese recorrido de A a B
    // no pasa por el medio, se va por el otro lado (antihorario)
    const antihorario = norm(angMedio - angA) > norm(angB - angA);
    ctx.save(); ctx.setLineDash([]); ctx.strokeStyle = this.t['texto-2']; ctx.lineWidth = G.real; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, R + 1.25, angA, angB, antihorario); ctx.stroke(); ctx.restore();
  };

  /** Clavo: anillo de tinta sin centro (el pivote lleva centro). */
  P.mecClavo = function (p, o = {}) {
    const [x, y] = this.vista.P(p), ctx = this.ctx;
    ctx.save(); ctx.setLineDash([]); ctx.fillStyle = this.t.lienzo; ctx.strokeStyle = this.t.tinta; ctx.lineWidth = 1.5 + (o.grueso ? 0.5 : 0);
    ctx.beginPath(); ctx.arc(x, y, GM.clavo, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); ctx.restore();
    if (o.seleccionado) this.seleccionCirculo(x, y, GM.clavo + GM.seleccion);
    return [x, y];
  };

  // ---------------------------------------------------------------------
  // Edición
  // ---------------------------------------------------------------------
  /** Selección de un segmento (mundo): contorno discontinuo a 5 px y asas en los extremos. */
  P.mecSeleccionSegmento = function (a, b, o = {}) {
    const [x1, y1] = this.vista.P(a), [x2, y2] = this.vista.P(b), ctx = this.ctx, m = GM.seleccion;
    const L = Math.hypot(x2 - x1, y2 - y1) || 1, dx = (x2 - x1) / L, dy = (y2 - y1) / L, nx = -dy, ny = dx;
    ctx.save(); ctx.setLineDash(PATRON.seleccion); ctx.strokeStyle = this.t.tinta; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1 - dx * m + nx * m, y1 - dy * m + ny * m); ctx.lineTo(x2 + dx * m + nx * m, y2 + dy * m + ny * m);
    ctx.lineTo(x2 + dx * m - nx * m, y2 + dy * m - ny * m); ctx.lineTo(x1 - dx * m - nx * m, y1 - dy * m - ny * m);
    ctx.closePath(); ctx.stroke(); ctx.restore();
    if (o.asas !== false) { this.asa(x1, y1); this.asa(x2, y2); }
  };

  /** Selección de un arco (mundo, radianes): arcos discontinuos a ±5 px. */
  P.mecSeleccionArco = function (c, r, a0, a1) {
    const [x, y] = this.vista.P(c), R = r * this.vista.escala, ctx = this.ctx, m = GM.seleccion;
    ctx.save(); ctx.setLineDash(PATRON.seleccion); ctx.strokeStyle = this.t.tinta; ctx.lineWidth = 1;
    for (const rr of [R + m, Math.max(1, R - m)]) { ctx.beginPath(); ctx.arc(x, y, rr, -a0, -a1, true); ctx.stroke(); }
    ctx.restore();
  };

  global.Volta.GM = GM;
})(window);
