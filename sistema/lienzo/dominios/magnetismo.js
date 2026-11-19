/* ==========================================================================
   Volta — gramática del lienzo · dominio Magnetismo e inducción
   Símbolos propios del módulo, según la sección 7 de
   docs/04_lenguaje_de_diseno.md:
   - el campo B en la familia magnético: perpendicular al plano, rejilla de
     ⊙ (saliente) o ⊗ (entrante) cada 32 px, alineada con el mundo (no
     «nada» al desplazar la vista); en el plano, líneas de 1 px con una
     punta pequeña a mitad de línea, o una malla de vectores;
   - regiones de campo ideal con borde discontinuo de su familia (B:
     magnético, con su rejilla; E: eléctrico, con flechas paralelas);
   - la materia en tinta: hilos (anillo con el sentido de la corriente
     dentro: ⊙ o ⊗ en la familia corriente), espiras, rieles, barras
     (conductor: relleno de campo activo), placas, pantallas, imanes (N
     lleno de tinta con «N» en sobre-tinta; S lleno de lienzo con «S» en
     tinta) y partículas (disco con su signo, sin color);
   - la corriente inducida como puntas en la familia corriente a lo largo
     del circuito, en su sentido; el área del circuito dentro del campo,
     con el tinte de la familia magnético (el flujo);
   - brújulas (aguja: N en tinta, S en lienzo), sonda de B y lámina Hall
     con los portadores y las cargas acumuladas en sus bordes;
   - etiquetas con halo; un registro de zonas ocupadas evita que dos
     etiquetas se monten o que caigan sobre las barras flotantes.
   Métodos con prefijo magnetismo. Mismas convenciones que trazo.js:
   grosores en px de pantalla, patrones de PATRON, colores de this.t.
   Requiere trazo.js.
   ========================================================================== */
(function (global) {
  'use strict';
  const { Trazo, G, PATRON } = global.Volta;
  const P = Trazo.prototype;

  // Medidas propias del dominio (px de pantalla)
  const GM = {
    rejilla: 32,          // paso de la rejilla de ⊙/⊗ de un campo perpendicular
    simbolo: 5,           // radio de un ⊙/⊗ de campo
    hilo: 8,              // radio del anillo de un hilo perpendicular
    linea: 1,             // línea de campo
    punta: [7, 6],        // punta pequeña a mitad de línea (largo × ancho)
    brujula: 12,          // radio de una brújula
    sonda: 6.5,           // radio del anillo de la sonda
    barra: 7,             // grosor de una barra conductora
    riel: 2.5,            // grosor de un riel
    particula: 7,         // radio del disco de una partícula cargada
    corriente: [8, 6.5],  // punta de corriente sobre un conductor
    pasoCorriente: 74,    // separación entre puntas de corriente
  };

  // ---------------------------------------------------------------------
  // Etiquetas sin solaparse
  // ---------------------------------------------------------------------
  /** Vacía el registro de zonas ocupadas; `zonas` (px) quedan reservadas desde el principio. */
  P.magnetismoEtiquetas = function (zonas = []) { this._magOcupado = zonas.map(z => ({ ...z })); };
  /** Marca un rectángulo (px) como ocupado. */
  P.magnetismoOcupar = function (x, y, w, h) { (this._magOcupado || (this._magOcupado = [])).push({ x, y, w, h }); };
  /** Ancho de unos segmentos de texto. */
  P.magnetismoAncho = function (segs) {
    const c = this.ctx; let w = 0;
    c.save(); for (const s of segs) { c.font = this._fuente(s.f, s.tam || 12); w += c.measureText(s.t).width; } c.restore();
    return w;
  };
  /**
   * Reserva el sitio de una etiqueta si está libre y dentro del lienzo.
   * @returns {boolean} si se pudo reservar
   */
  P.magnetismoReservar = function (segs, x, y, alinear = 'left') {
    const w = this.magnetismoAncho(segs), x0 = alinear === 'right' ? x - w : alinear === 'center' ? x - w / 2 : x;
    const r = { x: x0 - 3, y: y - 13, w: w + 6, h: 18 };
    if (r.x < 4 || r.y < 4 || r.x + r.w > this.w - 4 || r.y + r.h > this.h - 4) return false;
    const lista = this._magOcupado || (this._magOcupado = []);
    if (lista.some(q => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y)) return false;
    lista.push(r); return true;
  };
  /**
   * Escribe una etiqueta en el primer sitio libre de una lista de candidatos
   * [[x, y, alinear]]. Devuelve el sitio usado o null.
   */
  P.magnetismoEtiqueta = function (segs, candidatos, o = {}) {
    for (const [x, y, al] of candidatos) {
      if (this.magnetismoReservar(segs, x, y, al || 'left')) { this.compuesto(segs, x, y, { alinear: al || 'left', color: o.color || 'texto-2' }); return [x, y, al]; }
    }
    return null;
  };
  /** Ficha (lecturas) en el primer sitio libre; reserva su rectángulo. */
  P.magnetismoFicha = function (filas, candidatos, ancla) {
    const c = this.ctx; let w = 0;
    c.save();
    for (const segs of filas) { let a = 0; for (const s of segs) { c.font = this._fuente(s.f, s.tam || 11.5); a += c.measureText(s.t).width; } w = Math.max(w, a); }
    c.restore();
    const W = w + 16, H = filas.length * 16 + 10, lista = this._magOcupado || (this._magOcupado = []);
    for (const [x, y] of candidatos) {
      const r = { x: x - 2, y: y - 2, w: W + 4, h: H + 4 };
      if (r.x < 4 || r.y < 4 || r.x + r.w > this.w - 4 || r.y + r.h > this.h - 4) continue;
      if (lista.some(q => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y)) continue;
      lista.push(r); this.ficha(x, y, filas, { ancla }); return [x, y];
    }
    return null;
  };

  // ---------------------------------------------------------------------
  // 1 · Fondo: ejes en la unidad de la escena y barra de escala
  // ---------------------------------------------------------------------
  /** o = {unidad: 'cm', factor: 100, huecos: [[x, y, r]] px} */
  P.magnetismoEjes = function (o = {}) {
    const c = this.ctx, v = this.vista, t = this.t, f = o.factor ?? 1, paso = this._pasoMayor || global.Volta.pasoAgradable(90 / v.escala);
    const X0 = Math.round(v.X(0)) + 0.5, Y0 = Math.round(v.Y(0)) + 0.5, fm = global.Volta.fmtMarca;
    c.save(); c.strokeStyle = t.eje; c.lineWidth = 1; c.setLineDash([]);
    c.beginPath(); c.moveTo(0, Y0); c.lineTo(this.w, Y0); c.moveTo(X0, 0); c.lineTo(X0, this.h); c.stroke(); c.restore();
    const tapado = (x, y) => (o.huecos || []).some(([hx, hy, hr]) => Math.hypot(x - hx, y - hy) < hr + 10);
    // Los números y los nombres de los ejes evitan las barras flotantes y lo ya reservado (materia, instrumentos)
    const zonas = [...this.zonasFlotantes(), ...(this._magOcupado || [])], enZona = (x, y, w, h) => zonas.some(z => x < z.x + z.w && x + w > z.x && y < z.y + z.h && y + h > z.y);
    for (let x = Math.ceil(v.mx(0) / paso) * paso; x <= v.mx(this.w); x += paso) {
      const X = v.X(x);
      if (Math.abs(x) < paso / 2 || X > this.w - 60 || X < 20 || tapado(X, Y0 + 10) || enZona(X - 16, Y0 + 3, 32, 15)) continue;
      this.texto(fm(x * f, paso * f), X, Y0 + 5, { fuente: 'num', tam: 11, color: 'texto-3', alinear: 'center', base: 'top', halo: true });
      this.magnetismoOcupar(X - 16, Y0 + 3, 32, 15);
    }
    for (let y = Math.ceil(v.my(this.h) / paso) * paso; y <= v.my(0); y += paso) {
      const Y = v.Y(y);
      if (Math.abs(y) < paso / 2 || Y < 34 || Y > this.h - 12 || tapado(X0 - 14, Y) || enZona(X0 - 40, Y - 8, 36, 16)) continue;
      this.texto(fm(y * f, paso * f), X0 - 6, Y, { fuente: 'num', tam: 11, color: 'texto-3', alinear: 'right', base: 'middle', halo: true });
      this.magnetismoOcupar(X0 - 40, Y - 8, 36, 16);
    }
    const choca = (x, y, w, h) => zonas.find(z => x < z.x + z.w && x + w > z.x && y < z.y + z.h && y + h > z.y);
    let xd = this.w - 12, z;
    for (let i = 0; i < 4 && (z = choca(xd - 70, Y0 - 22, 70, 20)); i++) xd = z.x - 8;
    if (Y0 > 20 && Y0 < this.h - 20) {
      this.compuesto([{ t: 'x', f: 'sim', tam: 14 }, { t: ` (${o.unidad || 'm'})`, f: 'ui', tam: 11 }], xd, Y0 - 8, { color: 'texto-3', alinear: 'right' });
      this.magnetismoOcupar(xd - 50, Y0 - 22, 52, 18);
    }
    let yb = 18;
    for (let i = 0; i < 4 && (z = choca(X0 + 8, yb - 14, 70, 20)); i++) yb = z.y + z.h + 18;
    if (X0 > 20 && X0 < this.w - 60) {
      this.compuesto([{ t: 'y', f: 'sim', tam: 14 }, { t: ` (${o.unidad || 'm'})`, f: 'ui', tam: 11 }], X0 + 8, yb, { color: 'texto-3' });
      this.magnetismoOcupar(X0 + 6, yb - 14, 52, 18);
    }
  };

  /** Barra de escala en la unidad de la escena. */
  P.magnetismoBarraEscala = function (x, y, unidad = 'm', factor = 1) {
    const v = this.vista, m = global.Volta.pasoAgradable(80 / v.escala), L = m * v.escala;
    this.lineaPx([[x, y - 4], [x, y + 4]], { color: 'texto-2', grosor: 1.5 });
    this.lineaPx([[x + L, y - 4], [x + L, y + 4]], { color: 'texto-2', grosor: 1.5 });
    this.lineaPx([[x, y], [x + L, y]], { color: 'texto-2', grosor: 1.5 });
    this.texto(global.Volta.cantidad(m * factor, unidad, 2).replace(/\.0+(?=[\s ])/, ''), x + L / 2, y - 9, { fuente: 'num', tam: 11, color: 'texto-2', alinear: 'center', halo: true });
    this.magnetismoOcupar(x - 4, y - 24, L + 8, 32);
  };

  // ---------------------------------------------------------------------
  // 2 · Campo perpendicular: ⊙ y ⊗
  // ---------------------------------------------------------------------
  /**
   * Símbolo ⊙ (signo > 0, saliente) o ⊗ (signo < 0, entrante) en px.
   * o = {r, color, grosor, fondo: rellena el círculo con el lienzo}
   */
  P.magnetismoSimbolo = function (x, y, signo, o = {}) {
    const c = this.ctx, r = o.r ?? GM.simbolo, col = this.color(o.color || 'magnetico');
    c.save(); c.setLineDash([]); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = o.grosor ?? 1.25; c.globalAlpha = o.opacidad ?? 1;
    if (o.fondo) { c.fillStyle = this.t.lienzo; c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.fill(); c.fillStyle = col; }
    c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.stroke();
    if (signo > 0) { c.beginPath(); c.arc(x, y, Math.max(1.2, r * 0.32), 0, 2 * Math.PI); c.fill(); }
    else { const k = r * 0.68; c.beginPath(); c.moveTo(x - k, y - k); c.lineTo(x + k, y + k); c.moveTo(x + k, y - k); c.lineTo(x - k, y + k); c.stroke(); }
    c.restore();
  };

  /**
   * Rejilla de ⊙/⊗ de un campo perpendicular al plano, en los nodos de una
   * rejilla de mundo de ~32 px. campoZ(x, y) → B_z (T) en mundo.
   * o = {recorte: polígono de mundo (región), Bref (T): con él, el radio del
   * símbolo crece con |B_z| (escala logarítmica); evitar: [[x, y, r]] px;
   * minimo: fracción de Bref por debajo de la cual no se dibuja; libres: no
   * pone símbolos sobre lo ya reservado con magnetismoEtiquetas/Ocupar, como
   * los números de los ejes y las etiquetas)
   */
  P.magnetismoRejilla = function (campoZ, o = {}) {
    const v = this.vista, paso = global.Volta.pasoAgradable(GM.rejilla / v.escala), c = this.ctx, evitar = o.evitar || [];
    const ocup = o.libres ? (this._magOcupado || []) : [], tapa = (x, y, r) => ocup.some(q => x + r > q.x && x - r < q.x + q.w && y + r > q.y && y - r < q.y + q.h);
    let x0 = v.mx(0), x1 = v.mx(this.w), y0 = v.my(this.h), y1 = v.my(0);
    if (o.recorte) {
      const xs = o.recorte.map(p => p[0]), ys = o.recorte.map(p => p[1]);
      x0 = Math.max(x0, Math.min(...xs)); x1 = Math.min(x1, Math.max(...xs)); y0 = Math.max(y0, Math.min(...ys)); y1 = Math.min(y1, Math.max(...ys));
      c.save(); c.beginPath(); o.recorte.forEach((p, i) => { const [X, Y] = v.P(p); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }); c.closePath(); c.clip();
    }
    // Media celda corrida: los símbolos no caen sobre los bordes de las regiones (que suelen ir por la cuadrícula)
    const des = paso / 2;
    for (let X = Math.ceil((x0 - des) / paso) * paso + des; X <= x1; X += paso) {
      for (let Y = Math.ceil((y0 - des) / paso) * paso + des; Y <= y1; Y += paso) {
        const px = v.X(X), py = v.Y(Y);
        if (evitar.some(([a, b, r]) => Math.hypot(px - a, py - b) < r) || (ocup.length && tapa(px, py, GM.simbolo + 1))) continue;
        const Bz = campoZ(X, Y);
        if (!Number.isFinite(Bz) || Bz === 0) continue;
        let r = GM.simbolo;
        if (o.Bref) {
          const f = Math.log10(Math.abs(Bz) / o.Bref);
          if (f < Math.log10(o.minimo ?? 0.02)) continue;
          r = Math.max(2.2, Math.min(6, 6 + 2.2 * f));
        }
        this.magnetismoSimbolo(px, py, Bz, { r });
      }
    }
    if (o.recorte) c.restore();
  };

  /**
   * Región de campo ideal: borde discontinuo de su familia; B con su
   * rejilla de ⊙/⊗; E con flechas paralelas a E (eléctrico).
   * pts: polígono de mundo. o = {tipo: 'B'|'E', B (T), E: [Ex, Ey], grueso, tenue,
   * libres (ver magnetismoRejilla), desfase: de las flechas de E, en pasos (0.5 por omisión; 0 las
   * intercala con los ⊙/⊗ de una región B superpuesta)}
   */
  P.magnetismoRegion = function (pts, o = {}) {
    if (pts.length < 3) return;
    const v = this.vista, Ps = pts.map(p => v.P(p)), c = this.ctx, fam = o.tipo === 'E' ? 'electrico' : 'magnetico';
    c.save(); c.setLineDash([]); c.beginPath(); Ps.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
    c.globalAlpha = o.tipo === 'E' ? 0.06 : 0.07; c.fillStyle = this.t.tinte[fam] || this.color(fam); c.fill(); c.restore();
    if (o.tipo === 'E') {
      const E = o.E || [0, 0], m = Math.hypot(E[0], E[1]);
      if (m > 0) this.magnetismoFlechasRegion(pts, [E[0] / m, E[1] / m], { opacidad: o.tenue ? 0.45 : 0.85, desfase: o.desfase });
    } else if (o.B) this.magnetismoRejilla(() => o.B, { recorte: pts, libres: o.libres });
    this.lineaPx(Ps, { color: fam, grosor: 1.25 + (o.grueso ? 0.5 : 0), patron: 'previsto', cerrar: true, extremo: 'butt' });
  };

  /** Flechas paralelas (dirección unitaria d, mundo) dentro de un polígono: campo E uniforme. */
  P.magnetismoFlechasRegion = function (pts, d, o = {}) {
    const v = this.vista, c = this.ctx, paso = global.Volta.pasoAgradable(44 / v.escala), col = this.color(o.color || 'electrico');
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.max(v.mx(0), Math.min(...xs)), x1 = Math.min(v.mx(this.w), Math.max(...xs)), y0 = Math.max(v.my(this.h), Math.min(...ys)), y1 = Math.min(v.my(0), Math.max(...ys));
    c.save(); c.beginPath(); pts.forEach((p, i) => { const [X, Y] = v.P(p); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }); c.closePath(); c.clip();
    c.globalAlpha = o.opacidad ?? 0.85;
    const L = 18, ang = Math.atan2(-d[1], d[0]), des = (o.desfase ?? 0.5) * paso;
    for (let X = Math.ceil((x0 - des) / paso) * paso + des; X <= x1; X += paso) {
      for (let Y = Math.ceil((y0 - des) / paso) * paso + des; Y <= y1; Y += paso) {
        const px = v.X(X), py = v.Y(Y), ux = Math.cos(ang), uy = Math.sin(ang);
        c.strokeStyle = col; c.lineWidth = G.componente; c.setLineDash([]); c.lineCap = 'round';
        c.beginPath(); c.moveTo(px - ux * L / 2, py - uy * L / 2); c.lineTo(px + ux * (L / 2 - 4), py + uy * (L / 2 - 4)); c.stroke();
        this._magPunta(px + ux * (L / 2 - 2.5), py + uy * (L / 2 - 2.5), ang, col);
      }
    }
    c.restore();
  };

  // Punta pequeña llena centrada en (x, y) y orientada según ang (px)
  P._magPunta = function (x, y, ang, color, tam = GM.punta) {
    const [L, A] = tam, c = this.ctx;
    c.save(); c.setLineDash([]); c.globalAlpha = c.globalAlpha; c.fillStyle = color;
    c.translate(x, y); c.rotate(ang);
    c.beginPath(); c.moveTo(L / 2, 0); c.lineTo(-L / 2, A / 2); c.lineTo(-L / 2 + L * 0.16, 0); c.lineTo(-L / 2, -A / 2); c.closePath(); c.fill();
    c.restore();
  };

  // ---------------------------------------------------------------------
  // 3 · Campo en el plano: líneas y vectores
  // ---------------------------------------------------------------------
  /**
   * Líneas de campo (polilíneas de mundo en el sentido de B), 1 px en la
   * familia magnético, con una punta pequeña a mitad de cada línea (en las
   * cerradas, dos puntas opuestas). o = {ocultar: [[x, y, r]] px, halo}
   */
  P.magnetismoLineas = function (lineas, o = {}) {
    const v = this.vista, c = this.ctx, col = this.color(o.color || 'magnetico'), ocultar = o.ocultar || [];
    const px = lineas.map(l => ({ pts: l.pts.map(p => v.P(p)), cerrada: l.cerrada }));
    c.save(); c.setLineDash([]); c.lineJoin = 'round'; c.lineCap = 'round';
    if (ocultar.length) {
      c.beginPath(); c.rect(0, 0, this.w, this.h);
      for (const [x, y, r] of ocultar) { c.moveTo(x + r, y); c.arc(x, y, r, 0, 2 * Math.PI); }
      c.clip('evenodd');
    }
    const ruta = () => { c.beginPath(); for (const l of px) { if (l.pts.length < 2) continue; c.moveTo(l.pts[0][0], l.pts[0][1]); for (let i = 1; i < l.pts.length; i++) c.lineTo(l.pts[i][0], l.pts[i][1]); } };
    if (o.halo) { ruta(); c.strokeStyle = this.t.lienzo; c.lineWidth = GM.linea + G.halo; c.globalAlpha = 0.6; c.stroke(); c.globalAlpha = 1; }
    ruta(); c.strokeStyle = col; c.lineWidth = GM.linea; c.stroke();
    for (const l of px) {
      const L = largoPx(l.pts); if (L < 30) continue;
      const marcas = l.cerrada ? [L / 4, 3 * L / 4] : [L / 2];
      for (const s of marcas) {
        const [x, y, ang] = puntoEn(l.pts, s);
        if (x < -10 || x > this.w + 10 || y < -10 || y > this.h + 10) continue;
        if (ocultar.some(([a, b, r]) => Math.hypot(x - a, y - b) < r + 4)) continue;
        this._magPunta(x, y, ang, col);
      }
    }
    c.restore();
  };

  /**
   * Malla de vectores de la componente de B en el plano (largo logarítmico
   * respecto de Bref). campo2(x, y) → [Bx, By] en mundo.
   */
  P.magnetismoVectores = function (campo2, o = {}) {
    const v = this.vista, paso = global.Volta.pasoAgradable((o.pasoPx || 44) / v.escala), pp = paso * v.escala;
    const Lmax = 0.78 * pp, Bref = o.Bref || 1, evitar = o.evitar || [], c = this.ctx, col = this.color(o.color || 'magnetico');
    const flechas = [];
    for (let X = Math.ceil(v.mx(0) / paso) * paso; X <= v.mx(this.w); X += paso) {
      for (let Y = Math.ceil(v.my(this.h) / paso) * paso; Y <= v.my(0); Y += paso) {
        const x = v.X(X), y = v.Y(Y);
        if (evitar.some(([a, b, r]) => Math.hypot(x - a, y - b) < r)) continue;
        const [bx, by] = campo2(X, Y), B = Math.hypot(bx, by);
        if (!(B > 0) || !Number.isFinite(B) || B < Bref * 1e-3) continue;
        const f = Math.min(1, Math.max(0.16, (Math.log10(B / Bref) + 1.6) / 2.4)), L = Lmax * f, ux = bx / B, uy = -by / B;
        flechas.push([x - ux * L / 2, y - uy * L / 2, x + ux * L / 2, y + uy * L / 2, Math.atan2(uy, ux)]);
      }
    }
    const [Lp] = GM.punta;
    c.save(); c.setLineDash([]); c.lineCap = 'round'; c.strokeStyle = col; c.lineWidth = G.componente; c.beginPath();
    for (const [x1, y1, x2, y2, a] of flechas) { c.moveTo(x1, y1); c.lineTo(x2 - Math.cos(a) * Lp * 0.6, y2 - Math.sin(a) * Lp * 0.6); }
    c.stroke(); c.restore();
    for (const [, , x2, y2, a] of flechas) this._magPunta(x2 - Math.cos(a) * Lp / 2, y2 - Math.sin(a) * Lp / 2, a, col);
  };

  // ---------------------------------------------------------------------
  // 4 · Fuentes del campo (materia en tinta)
  // ---------------------------------------------------------------------
  /** Hilo perpendicular al plano: anillo de tinta con ⊙ o ⊗ de la corriente. */
  P.magnetismoHilo = function (p, signo, o = {}) {
    const [x, y] = this.vista.P(p), c = this.ctx, r = GM.hilo;
    c.save(); c.setLineDash([]); c.fillStyle = this.t.lienzo; c.strokeStyle = this.t.tinta; c.lineWidth = G.materia + (o.grueso ? 0.5 : 0);
    c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.fill(); c.stroke(); c.restore();
    this.magnetismoSimbolo(x, y, signo, { r: r - 3.2, color: 'corriente', grosor: 1.6 });
    if (o.seleccionado) this.seleccionCirculo(x, y, r + 5);
    return [x, y];
  };

  /** Puntas de corriente a lo largo de una polilínea de pantalla (sentido del recorrido). */
  P._magPuntasCorriente = function (Ps, o = {}) {
    const L = largoPx(Ps); if (L < 16) return [];
    const paso = o.paso ?? GM.pasoCorriente, n = Math.max(1, Math.round(L / paso)), col = this.color('corriente'), r = [];
    for (let k = 0; k < n; k++) {
      const s = (k + 0.5) * L / n, [x, y, a] = puntoEn(Ps, s);
      this._magPunta(x, y, a, col, GM.corriente);
      r.push([x, y, a]);
    }
    return r;
  };

  /** Conductor rectilíneo del plano (hilo largo o segmento) con el sentido de la corriente. */
  P.magnetismoConductor = function (a, b, I, o = {}) {
    const v = this.vista, A = v.P(a), B = v.P(b);
    this.lineaPx([A, B], { color: 'tinta', grosor: G.materia + (o.grueso ? 0.5 : 0), extremo: o.extremo || 'butt' });
    if (I) return this._magPuntasCorriente(I > 0 ? [A, B] : [B, A], { paso: o.paso ?? 110 });
    return [];
  };

  /** Espira circular vista de frente: circunferencia de tinta y el sentido de la corriente (signo > 0: antihorario). */
  P.magnetismoEspiraFrente = function (cMundo, R, signo, o = {}) {
    const v = this.vista, [x, y] = v.P(cMundo), r = R * v.escala, c = this.ctx;
    c.save(); c.setLineDash([]); c.strokeStyle = this.t.tinta; c.lineWidth = G.materia + (o.grueso ? 0.5 : 0);
    c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.stroke(); c.restore();
    const n = Math.max(2, Math.min(8, Math.round(2 * Math.PI * r / GM.pasoCorriente))), col = this.color('corriente');
    for (let k = 0; k < n; k++) {
      const a = (k + 0.25) / n * 2 * Math.PI, px = x + r * Math.cos(a), py = y - r * Math.sin(a);
      this._magPunta(px, py, signo > 0 ? -a - Math.PI / 2 : -a + Math.PI / 2, col, GM.corriente);
    }
  };

  /** Espira vista de canto (su eje en el plano): los dos cruces del hilo y el eje. */
  P.magnetismoEspiraCorte = function (cMundo, eje, R, signo, o = {}) {
    const n = [-eje[1], eje[0]], a = [cMundo[0] + n[0] * R, cMundo[1] + n[1] * R], b = [cMundo[0] - n[0] * R, cMundo[1] - n[1] * R];
    this.linea([a, b], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
    this.linea([[cMundo[0] - eje[0] * R * 1.6, cMundo[1] - eje[1] * R * 1.6], [cMundo[0] + eje[0] * R * 1.6, cMundo[1] + eje[1] * R * 1.6]], { color: 'texto-3', grosor: 1, patron: 'eje', extremo: 'butt' });
    // Corriente antihoraria vista desde la punta del eje: sale del plano por el lado n
    this.magnetismoHilo(a, signo, o); this.magnetismoHilo(b, -signo, o);
  };

  /** Solenoide en corte: cuerpo, dos filas de ⊙/⊗ y eje. */
  P.magnetismoSolenoide = function (cMundo, eje, largo, R, N, signo, o = {}) {
    const v = this.vista, n = [-eje[1], eje[0]], h = largo / 2;
    const esq = [[-h, -R], [h, -R], [h, R], [-h, R]].map(([u, w]) => [cMundo[0] + eje[0] * u + n[0] * w, cMundo[1] + eje[1] * u + n[1] * w]);
    const c = this.ctx, Ps = esq.map(p => v.P(p));
    c.save(); c.setLineDash([]); c.beginPath(); Ps.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
    c.globalAlpha = 0.5; c.fillStyle = this.t.campo; c.fill(); c.globalAlpha = 1;
    c.strokeStyle = this.t['texto-3']; c.lineWidth = 1 + (o.grueso ? 0.5 : 0); c.stroke(); c.restore();
    this.linea([[cMundo[0] - eje[0] * (h + R), cMundo[1] - eje[1] * (h + R)], [cMundo[0] + eje[0] * (h + R), cMundo[1] + eje[1] * (h + R)]], { color: 'texto-3', grosor: 1, patron: 'eje', extremo: 'butt' });
    const Lpx = largo * v.escala, k = Math.max(2, Math.min(Math.round(N), Math.floor(Lpx / 11)));
    for (let i = 0; i < k; i++) {
      const u = -h + largo * (i + 0.5) / k;
      for (const [w, s] of [[R, signo], [-R, -signo]]) {
        const [x, y] = v.P([cMundo[0] + eje[0] * u + n[0] * w, cMundo[1] + eje[1] * u + n[1] * w]);
        const c2 = this.ctx; c2.save(); c2.fillStyle = this.t.lienzo; c2.strokeStyle = this.t.tinta; c2.lineWidth = 1.25; c2.setLineDash([]);
        c2.beginPath(); c2.arc(x, y, 4.2, 0, 2 * Math.PI); c2.fill(); c2.stroke(); c2.restore();
        this.magnetismoSimbolo(x, y, s, { r: 2.6, color: 'corriente', grosor: 1.1 });
      }
    }
    return esq;
  };

  /** Imán de barra: N lleno de tinta con «N» en sobre-tinta; S lleno de lienzo con «S» en tinta. eje: de S a N. */
  P.magnetismoIman = function (cMundo, eje, largo, ancho, o = {}) {
    const v = this.vista, n = [-eje[1], eje[0]], h = largo / 2, w = ancho / 2, c = this.ctx;
    const pt = (u, s) => v.P([cMundo[0] + eje[0] * u + n[0] * s, cMundo[1] + eje[1] * u + n[1] * s]);
    const mitad = (u0, u1, relleno) => { const Ps = [pt(u0, -w), pt(u1, -w), pt(u1, w), pt(u0, w)]; c.beginPath(); Ps.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fillStyle = relleno; c.fill(); return Ps; };
    c.save(); c.setLineDash([]);
    mitad(-h, 0, this.t.lienzo); mitad(0, h, this.t.tinta);
    const Ps = [pt(-h, -w), pt(h, -w), pt(h, w), pt(-h, w)];
    c.beginPath(); Ps.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
    c.strokeStyle = this.t.tinta; c.lineWidth = G.materia + (o.grueso ? 0.5 : 0); c.lineJoin = 'round'; c.stroke();
    const tam = Math.max(9, Math.min(15, ancho * v.escala * 0.62));
    if (ancho * v.escala > 11 && largo * v.escala > 30) {
      const [xn, yn] = pt(h / 2, 0), [xs, ys] = pt(-h / 2, 0);
      c.font = `600 ${tam}px "IBM Plex Sans", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = this.t['sobre-tinta']; c.fillText('N', xn, yn + 0.5);
      c.fillStyle = this.t.tinta; c.fillText('S', xs, ys + 0.5);
    }
    c.restore();
    return Ps;
  };

  // ---------------------------------------------------------------------
  // 5 · Instrumentos
  // ---------------------------------------------------------------------
  /** Brújula: aguja con N en tinta y S en lienzo; sin campo en el plano, la aguja no se dibuja. */
  P.magnetismoBrujula = function (pMundo, ang, o = {}) {
    const [x, y] = this.vista.P(pMundo), c = this.ctx, r = GM.brujula;
    c.save(); c.setLineDash([]); c.fillStyle = this.t.lienzo; c.strokeStyle = this.t.tinta; c.lineWidth = 1.25 + (o.grueso ? 0.5 : 0);
    c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.fill(); c.stroke();
    // Marcas de rosa cada 90°
    c.lineWidth = 1; c.strokeStyle = this.t['texto-3']; c.beginPath();
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; c.moveTo(x + Math.cos(a) * (r - 3), y + Math.sin(a) * (r - 3)); c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    c.stroke();
    if (ang == null) { c.setLineDash([2, 2.5]); c.beginPath(); c.arc(x, y, r - 5, 0, 2 * Math.PI); c.stroke(); c.restore(); return [x, y]; }
    const ux = Math.cos(ang), uy = -Math.sin(ang), nx = -uy, ny = ux, L = r - 2, A = 3.4;
    c.setLineDash([]); c.lineJoin = 'round'; c.lineWidth = 1.25; c.strokeStyle = this.t.tinta;
    c.beginPath(); c.moveTo(x + ux * L, y + uy * L); c.lineTo(x + nx * A, y + ny * A); c.lineTo(x - nx * A, y - ny * A); c.closePath(); c.fillStyle = this.t.tinta; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x - ux * L, y - uy * L); c.lineTo(x + nx * A, y + ny * A); c.lineTo(x - nx * A, y - ny * A); c.closePath(); c.fillStyle = this.t.lienzo; c.fill(); c.stroke();
    c.fillStyle = this.t.tinta; c.beginPath(); c.arc(x, y, 1.3, 0, 2 * Math.PI); c.fill();
    c.restore();
    if (o.seleccionado) this.seleccionCirculo(x, y, r + 5);
    return [x, y];
  };

  /** Sonda de B: anillo con retícula a 45°. */
  P.magnetismoSonda = function (pMundo, o = {}) {
    const [x, y] = this.vista.P(pMundo), c = this.ctx, r = GM.sonda;
    c.save(); c.setLineDash([]); c.lineCap = 'round'; c.strokeStyle = this.t.tinta; c.lineWidth = 1.5 + (o.grueso ? 0.5 : 0);
    c.beginPath();
    for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; c.moveTo(x + Math.cos(a) * (r + 2.5), y + Math.sin(a) * (r + 2.5)); c.lineTo(x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6)); }
    c.stroke();
    c.fillStyle = this.t.lienzo; c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.fill(); c.stroke();
    c.fillStyle = this.t.tinta; c.beginPath(); c.arc(x, y, 1.75, 0, 2 * Math.PI); c.fill();
    c.restore();
    if (o.seleccionado) this.seleccionCirculo(x, y, r + 10);
    return [x, y];
  };

  // ---------------------------------------------------------------------
  // 6 · Partículas y dispositivos
  // ---------------------------------------------------------------------
  /** Partícula cargada: disco con su signo (positiva llena de tinta; negativa de lienzo). */
  P.magnetismoParticula = function (pMundo, signo, o = {}) {
    this.carga(pMundo, signo >= 0 ? 1 : -1, { radio: o.radio ?? GM.particula });
    const [x, y] = this.vista.P(pMundo);
    if (o.grueso) { const c = this.ctx; c.save(); c.setLineDash([]); c.strokeStyle = this.t.tinta; c.lineWidth = 2; c.beginPath(); c.arc(x, y, (o.radio ?? GM.particula) + 0.5, 0, 2 * Math.PI); c.stroke(); c.restore(); }
    if (o.seleccionado) this.seleccionCirculo(x, y, (o.radio ?? GM.particula) + 5);
    return [x, y];
  };

  /** Fuente de iones: caja con una rendija de salida en la dirección ang (rad, mundo). */
  P.magnetismoFuenteIones = function (pMundo, ang, o = {}) {
    const [x, y] = this.vista.P(pMundo), c = this.ctx, w = 22, h = 16, a = -ang;
    c.save(); c.translate(x, y); c.rotate(a); c.setLineDash([]);
    c.fillStyle = this.t.campo; c.strokeStyle = this.t.tinta; c.lineWidth = G.materia + (o.grueso ? 0.5 : 0); c.lineJoin = 'round';
    c.beginPath(); c.rect(-w, -h / 2, w, h); c.fill(); c.stroke();
    c.fillStyle = this.t.lienzo; c.fillRect(-2.5, -2.5, 5, 5);
    c.strokeStyle = this.t['texto-3']; c.lineWidth = 1; c.beginPath();
    for (let i = 0; i < 3; i++) { c.moveTo(-w + 5 + i * 5, h / 2 - 3); c.lineTo(-w + 9 + i * 5, -h / 2 + 3); }
    c.stroke(); c.restore();
    if (o.seleccionado) this.seleccionCirculo(x - Math.cos(a) * w / 2, y - Math.sin(a) * w / 2, 18);
  };

  /** Placa conductora (capacitor, rendija): línea gruesa de tinta con agujeros [[s0, s1]] (fracciones de a→b). */
  P.magnetismoPlaca = function (a, b, agujeros = [], o = {}) {
    const v = this.vista, A = v.P(a), B = v.P(b), tramos = [];
    let s = 0;
    for (const [s0, s1] of agujeros.slice().sort((p, q) => p[0] - q[0])) { if (s0 > s) tramos.push([s, s0]); s = Math.max(s, s1); }
    if (s < 1) tramos.push([s, 1]);
    for (const [s0, s1] of tramos) {
      const p = [A[0] + (B[0] - A[0]) * s0, A[1] + (B[1] - A[1]) * s0], q = [A[0] + (B[0] - A[0]) * s1, A[1] + (B[1] - A[1]) * s1];
      this.lineaPx([p, q], { color: 'tinta', grosor: 3.5 + (o.grueso ? 0.5 : 0), extremo: 'butt' });
    }
    if (o.signo) {
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, n = [-(B[1] - A[1]) / L, (B[0] - A[0]) / L], k = o.ladoSigno ?? 1;
      const x = B[0] + (B[0] - A[0]) / L * 10 + n[0] * 9 * k, y = B[1] + (B[1] - A[1]) / L * 10 + n[1] * 9 * k;
      this.texto(o.signo > 0 ? '+' : '−', x, y + 5, { fuente: 'ui', tam: 15, peso: 500, color: 'tinta', alinear: 'center', halo: true });
    }
  };

  /** Pantalla detectora (placa fotográfica): franja de campo activo con las marcas de los impactos (s: fracciones de a→b). */
  P.magnetismoPantalla = function (a, b, marcas = [], o = {}) {
    const v = this.vista, A = v.P(a), B = v.P(b), L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 2) return;
    const u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], n = [-u[1], u[0]], e = 5, c = this.ctx, lado = o.lado ?? 1;
    const P0 = [A[0], A[1]], P1 = [B[0], B[1]], P2 = [B[0] + n[0] * e * lado, B[1] + n[1] * e * lado], P3 = [A[0] + n[0] * e * lado, A[1] + n[1] * e * lado];
    c.save(); c.setLineDash([]); c.beginPath(); [P0, P1, P2, P3].forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
    c.fillStyle = this.t['campo-activo']; c.fill(); c.strokeStyle = this.t.tinta; c.lineWidth = 1.25 + (o.grueso ? 0.5 : 0); c.stroke();
    c.strokeStyle = this.t.tinta; c.lineWidth = 2; c.beginPath();
    for (const s of marcas) { const x = A[0] + u[0] * L * s, y = A[1] + u[1] * L * s; c.moveTo(x - n[0] * 3 * lado, y - n[1] * 3 * lado); c.lineTo(x + n[0] * (e + 3) * lado, y + n[1] * (e + 3) * lado); }
    c.stroke(); c.restore();
  };

  /**
   * Lámina Hall vista desde arriba: rectángulo conductor, portadores [[x, y]]
   * (mundo) con su signo, y la carga acumulada en los bordes (fracción 0–1).
   * eje: dirección de la corriente; signoBorde: signo de la carga del borde
   * hacia eje × B̂ (el otro lleva la contraria).
   */
  P.magnetismoLaminaHall = function (cMundo, eje, largo, ancho, o = {}) {
    const v = this.vista, n = [-eje[1], eje[0]], h = largo / 2, w = ancho / 2, c = this.ctx;
    const pt = (u, s) => v.P([cMundo[0] + eje[0] * u + n[0] * s, cMundo[1] + eje[1] * u + n[1] * s]);
    const Ps = [pt(-h, -w), pt(h, -w), pt(h, w), pt(-h, w)];
    c.save(); c.setLineDash([]); c.beginPath(); Ps.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
    c.fillStyle = this.t['campo-activo']; c.fill(); c.strokeStyle = this.t.tinta; c.lineWidth = G.materia + (o.grueso ? 0.5 : 0); c.lineJoin = 'round'; c.stroke(); c.restore();
    // Portadores: puntos pequeños de materia (sin color), con su signo si caben
    const sp = o.signoPortador ?? -1;
    for (const p of o.portadores || []) {
      const [x, y] = v.P(p);
      c.save(); c.setLineDash([]); c.fillStyle = sp > 0 ? this.t.tinta : this.t.lienzo; c.strokeStyle = this.t.tinta; c.lineWidth = 1;
      c.beginPath(); c.arc(x, y, 3.2, 0, 2 * Math.PI); c.fill(); c.stroke();
      c.strokeStyle = sp > 0 ? this.t['sobre-tinta'] : this.t.tinta; c.beginPath(); c.moveTo(x - 1.8, y); c.lineTo(x + 1.8, y); if (sp > 0) { c.moveTo(x, y - 1.8); c.lineTo(x, y + 1.8); } c.stroke(); c.restore();
    }
    // Cargas acumuladas en los bordes (signos a lo largo de cada borde)
    const f = Math.max(0, Math.min(1, o.carga ?? 0)), Lpx = largo * v.escala, k = Math.round(f * Math.max(2, Math.floor(Lpx / 26)));
    const sb = o.signoBorde ?? 1;
    for (let i = 0; i < k; i++) {
      const u = -h + largo * (i + 0.5) / k;
      for (const [s, sg] of [[w, sb], [-w, -sb]]) {
        const [x, y] = pt(u, s), off = s > 0 ? -1 : 1, d = [n[0] * off * 8, -n[1] * off * 8];
        this.texto(sg > 0 ? '+' : '−', x + d[0], y + d[1] + 4.5, { fuente: 'ui', tam: 13, peso: 500, color: 'tinta', alinear: 'center' });
      }
    }
    return Ps;
  };

  // ---------------------------------------------------------------------
  // 7 · Circuitos de la inducción
  // ---------------------------------------------------------------------
  /** Área del circuito dentro del campo (polígonos de mundo), con el tinte de la familia magnético. */
  P.magnetismoAreaFlujo = function (poligonos, o = {}) {
    const v = this.vista, c = this.ctx;
    c.save(); c.setLineDash([]); c.globalAlpha = o.opacidad ?? 1; c.fillStyle = this.t.tinte.magnetico || this.color('magnetico');
    for (const pts of poligonos) { if (pts.length < 3) continue; c.beginPath(); pts.forEach((p, i) => { const [x, y] = v.P(p); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath(); c.fill(); }
    c.restore();
  };

  /** Espira rígida: polígono cerrado de materia. */
  P.magnetismoEspira = function (pts, o = {}) {
    this.lineaPx(pts.map(p => this.vista.P(p)), { color: 'tinta', grosor: G.materia + (o.grueso ? 0.5 : 0), cerrar: true });
  };

  /**
   * Corriente a lo largo de un circuito cerrado (polígono de mundo en
   * sentido antihorario): puntas en la familia corriente, en el sentido de
   * I (I > 0: antihorario). Devuelve las puntas [x, y, ang] en px.
   */
  P.magnetismoCorriente = function (pts, I, o = {}) {
    if (!I || !(Math.abs(I) > (o.umbral ?? 0))) return [];
    const Ps = pts.map(p => this.vista.P(p)); Ps.push(Ps[0]);
    return this._magPuntasCorriente(I > 0 ? Ps : Ps.slice().reverse(), o);
  };

  /** Resistencia (rectángulo IEC) entre dos puntos de mundo, con sus terminales. */
  P.magnetismoResistencia = function (a, b, o = {}) {
    const v = this.vista, A = v.P(a), B = v.P(b), L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 4) return;
    const u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], n = [-u[1], u[0]], lr = Math.min(26, L * 0.6), wr = 9, m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    this.lineaPx([A, [m[0] - u[0] * lr / 2, m[1] - u[1] * lr / 2]], { color: 'tinta', grosor: G.materia });
    this.lineaPx([[m[0] + u[0] * lr / 2, m[1] + u[1] * lr / 2], B], { color: 'tinta', grosor: G.materia });
    const c = this.ctx, q = [[-lr / 2, -wr / 2], [lr / 2, -wr / 2], [lr / 2, wr / 2], [-lr / 2, wr / 2]].map(([s, t]) => [m[0] + u[0] * s + n[0] * t, m[1] + u[1] * s + n[1] * t]);
    c.save(); c.setLineDash([]); c.beginPath(); q.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
    c.fillStyle = this.t.lienzo; c.fill(); c.strokeStyle = this.t.tinta; c.lineWidth = G.materia + (o.grueso ? 0.5 : 0); c.lineJoin = 'round'; c.stroke(); c.restore();
    return m;
  };

  /**
   * Rieles: dos líneas de materia desde el origen a lo largo de u, con la
   * resistencia que los une en el origen (o abiertos, con sus bornes).
   * g = {origen, u, w (unitarios), d, largo, R: número|null}
   */
  P.magnetismoRieles = function (g, o = {}) {
    const { origen: O, u, w, d, largo } = g, h = d / 2;
    const p = (s, k) => [O[0] + u[0] * s + w[0] * h * k, O[1] + u[1] * s + w[1] * h * k];
    const gr = GM.riel + (o.grueso ? 0.5 : 0);
    this.linea([p(0, -1), p(largo, -1)], { color: 'tinta', grosor: gr, extremo: 'butt' });
    this.linea([p(0, 1), p(largo, 1)], { color: 'tinta', grosor: gr, extremo: 'butt' });
    if (g.R != null) {
      // Cierre por el origen: un tramo que sale hacia atrás y la resistencia
      const atras = Math.min(0.12 * largo, 26 / this.vista.escala), a = [O[0] - u[0] * atras - w[0] * h, O[1] - u[1] * atras - w[1] * h], b = [O[0] - u[0] * atras + w[0] * h, O[1] - u[1] * atras + w[1] * h];
      this.linea([p(0, -1), a], { color: 'tinta', grosor: G.materia }); this.linea([p(0, 1), b], { color: 'tinta', grosor: G.materia });
      return this.magnetismoResistencia(a, b, o);
    }
    for (const k of [-1, 1]) {
      const [x, y] = this.vista.P(p(0, k)), c = this.ctx;
      c.save(); c.setLineDash([]); c.fillStyle = this.t.lienzo; c.strokeStyle = this.t.tinta; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, 3.5, 0, 2 * Math.PI); c.fill(); c.stroke(); c.restore();
    }
    return null;
  };

  /** Barra conductora entre dos puntos de mundo: relleno de campo activo y contorno de tinta. */
  P.magnetismoBarra = function (a, b, o = {}) {
    const v = this.vista, A = v.P(a), B = v.P(b), L = Math.hypot(B[0] - A[0], B[1] - A[1]); if (L < 1) return [];
    const u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], n = [-u[1], u[0]], e = (o.grosor ?? GM.barra) / 2, ext = o.extension ?? 5;
    const q = [[-ext, -e], [L + ext, -e], [L + ext, e], [-ext, e]].map(([s, t]) => [A[0] + u[0] * s + n[0] * t, A[1] + u[1] * s + n[1] * t]);
    const c = this.ctx;
    c.save(); c.setLineDash([]); c.beginPath(); q.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
    c.fillStyle = this.t['campo-activo']; c.fill(); c.strokeStyle = this.t.tinta; c.lineWidth = 1.5 + (o.grueso ? 0.5 : 0); c.lineJoin = 'round'; c.stroke(); c.restore();
    return q;
  };

  /** Cargas separadas en los extremos de un conductor abierto (+ en b si signo > 0). */
  P.magnetismoCargasExtremos = function (a, b, signo) {
    if (!signo) return;
    const v = this.vista, A = v.P(a), B = v.P(b), L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
    const [pos, neg] = signo > 0 ? [B, A] : [A, B], dir = signo > 0 ? 1 : -1;
    this.texto('+', pos[0] + u[0] * 14 * dir, pos[1] + u[1] * 14 * dir + 5, { fuente: 'ui', tam: 15, peso: 500, color: 'tinta', alinear: 'center', halo: true });
    this.texto('−', neg[0] - u[0] * 14 * dir, neg[1] - u[1] * 14 * dir + 5, { fuente: 'ui', tam: 15, peso: 500, color: 'tinta', alinear: 'center', halo: true });
  };

  /**
   * Bobina giratoria vista de frente: el eje vertical en el plano y la
   * espira proyectada (ancho × |cos θ|). Cara delantera (cos θ > 0) con el
   * tinte del flujo; trasera, sin relleno. Devuelve las esquinas (px).
   */
  P.magnetismoBobina = function (cMundo, ancho, alto, angulo, o = {}) {
    const v = this.vista, [x, y] = v.P(cMundo), W = ancho * v.escala, H = alto * v.escala, cs = Math.cos(angulo), c = this.ctx;
    const w = W / 2 * cs, esq = [[x - w, y - H / 2], [x + w, y - H / 2], [x + w, y + H / 2], [x - w, y + H / 2]];
    c.save(); c.setLineDash([]);
    if (Math.abs(cs) > 0.02) { c.beginPath(); esq.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.globalAlpha = 0.55 * Math.abs(cs); c.fillStyle = this.t.tinte.magnetico; c.fill(); c.globalAlpha = 1; }
    c.restore();
    this.lineaPx([[x, y - H / 2 - 16], [x, y + H / 2 + 22]], { color: 'texto-3', grosor: 1, patron: 'eje', extremo: 'butt' });
    this.lineaPx(esq, { color: 'tinta', grosor: G.materia + (o.grueso ? 0.5 : 0), cerrar: true, patron: cs < 0 ? 'previsto' : 'continuo' });
    return esq;
  };

  /**
   * Croquis de perfil de unos rieles inclinados (en una ficha): plano con
   * su ángulo θ y el sentido de B (vertical o perpendicular al plano).
   */
  P.magnetismoPerfil = function (x, y, theta, o = {}) {
    const c = this.ctx, W = 138, H = 92, th = Math.min(Math.max(theta, 0), 80 * Math.PI / 180);
    c.save(); c.setLineDash([]); c.fillStyle = this.t.panel; c.strokeStyle = this.t.linea; c.lineWidth = 1;
    c.beginPath(); c.roundRect(x + 0.5, y + 0.5, W, H, 5); c.fill(); c.stroke(); c.restore();
    // Plano que sube hacia la izquierda; el ángulo θ en la esquina de abajo a la derecha
    const L = Math.min(104, (H - 26) / Math.max(Math.sin(th), 0.3)), xa = x + W - 16, y0 = y + H - 14;
    const xt = xa - L * Math.cos(th), yt = y0 - L * Math.sin(th);
    this.lineaPx([[xt, y0], [xa, y0]], { color: 'texto-3', grosor: 1 });
    this.lineaPx([[xt, yt], [xt, y0]], { color: 'texto-3', grosor: 1 });
    this.lineaPx([[xa, y0], [xt, yt]], { color: 'tinta', grosor: 2 });
    c.save(); c.strokeStyle = this.t['texto-2']; c.lineWidth = 1; c.setLineDash([]); c.beginPath(); c.arc(xa, y0, 20, Math.PI, Math.PI + th, false); c.stroke(); c.restore();
    this.compuesto([{ t: 'θ', f: 'sim', tam: 13 }], xa - 34, y0 - 3, { color: 'texto-2', halo: false });
    // La barra sobre el plano (corte) y el campo B
    const nx = Math.sin(th), ny = -Math.cos(th), xb = xa - 0.45 * L * Math.cos(th), yb = y0 - 0.45 * L * Math.sin(th);
    c.save(); c.setLineDash([]); c.fillStyle = this.t['campo-activo']; c.strokeStyle = this.t.tinta; c.lineWidth = 1.25;
    c.beginPath(); c.arc(xb + nx * 4, yb + ny * 4, 3.6, 0, 2 * Math.PI); c.fill(); c.stroke(); c.restore();
    const col = this.color('magnetico'), dB = o.bVertical ? [0, -1] : [nx, ny];
    for (const k of [0.2, 0.72]) {
      const px = xa - k * L * Math.cos(th) + nx * 3, py = y0 - k * L * Math.sin(th) + ny * 3;
      this.flechaPx(px, py, px + dB[0] * 24, py + dB[1] * 24, { color: col, grosor: 1.25 });
    }
    this.compuesto([{ t: 'B', f: 'sim', tam: 13, color: 'magnetico' }], x + 10, y + 18, { halo: false });
    this.compuesto([{ t: o.bVertical ? 'vertical' : '⊥ al plano', f: 'ui', tam: 10.5, color: 'texto-3' }], x + 22, y + 18, { halo: false });
    return { x, y, w: W, h: H };
  };

  // ---------------------------------------------------------------------
  // Utilidades de polilíneas en px
  // ---------------------------------------------------------------------
  function largoPx(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
  function puntoEn(pts, s) {
    let acum = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], l = Math.hypot(dx, dy);
      if (acum + l >= s && l > 0) { const f = (s - acum) / l; return [pts[i - 1][0] + dx * f, pts[i - 1][1] + dy * f, Math.atan2(dy, dx)]; }
      acum += l;
    }
    const n = pts.length - 1; return [pts[n][0], pts[n][1], Math.atan2(pts[n][1] - pts[n - 1][1], pts[n][0] - pts[n - 1][0])];
  }

  global.Volta.magnetismo = { GM, largoPx, puntoEn, PATRON };
})(window);
