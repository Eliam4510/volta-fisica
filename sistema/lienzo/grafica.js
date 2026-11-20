/* ==========================================================================
   Volta — gráficas (Canvas 2D) con el lenguaje de diseño
   En la aplicación final se usará uPlot con este mismo estilo; esta versión
   fija el aspecto: series del color de su familia, distinguidas entre sí por
   el patrón de trazo, cursor sincronizado y eventos como rombos.
   Requiere trazo.js.
   ========================================================================== */
(function (global) {
  'use strict';
  const { leerTokens, fmtMarca, pasoAgradable, rombo, fmt } = global.Volta;

  function marcas(min, max, n = 5) {
    const paso = pasoAgradable((max - min) / n);
    const r = [];
    for (let v = Math.ceil(min / paso - 1e-9) * paso; v <= max + 1e-9; v += paso) r.push(Math.abs(v) < paso * 1e-9 ? 0 : v);
    r.paso = paso;
    return r;
  }

  /*
   * grafica(canvas, {
   *   x: {min, max}, y: {min, max},
   *   series: [{ tramos: [[[x,y],...], ...], familia: 'movimiento', patron: 'continuo'|'discontinuo'|'punteado' }],
   *   cursor: x | null, puntoCursor: [x,y] | null, eventos: [{x, y?}]
   * })
   */
  // ---------------------------------------------------------------------
  // Interacción común a todas las gráficas (sin tocar las pantallas): rueda
  // para acercar o alejar alrededor del cursor, arrastrar para desplazar,
  // doble clic para volver a verlo todo, y lectura de los valores de cada
  // serie bajo el cursor. Cada pantalla sigue llamando a grafica() con sus
  // datos y rangos; aquí se recuerda la última llamada y la vista ampliada.
  // ---------------------------------------------------------------------
  const estados = new WeakMap();
  /** Valor de una serie en x, por interpolación lineal en su tramo (null fuera). */
  function valorEn(s, x) {
    for (const tramo of s.tramos) {
      for (let i = 1; i < tramo.length; i++) {
        const [x0, y0] = tramo[i - 1], [x1, y1] = tramo[i];
        if ((x0 <= x && x <= x1) || (x1 <= x && x <= x0)) return x1 === x0 ? y1 : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      }
    }
    return null;
  }
  function estadoDe(canvas) {
    let e = estados.get(canvas);
    if (e) return e;
    e = { o: null, vista: null, base: null, hover: null, arrastre: null, margen: null };
    estados.set(canvas, e);
    const redibujar = () => { if (e.o) dibujar(canvas, e.o, e); };
    const aDatos = (px, py) => {
      const m = e.margen, v = e.vista || e.base, r = canvas.getBoundingClientRect();
      const fx = (px - m.l) / (r.width - m.l - m.r), fy = (r.height - m.b - py) / (r.height - m.t - m.b);
      return [v.x.min + fx * (v.x.max - v.x.min), v.y.min + fy * (v.y.max - v.y.min)];
    };
    const local = ev => { const r = canvas.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    canvas.addEventListener('wheel', ev => {
      if (!e.o || !e.margen) return;
      ev.preventDefault();
      const [px, py] = local(ev), [cx, cy] = aDatos(px, py), v = e.vista || e.base;
      const k = Math.exp(Math.max(-0.5, Math.min(0.5, ev.deltaY * 0.0015)));
      // Mayús: solo el eje y; Ctrl: solo el x; sin tecla, los dos
      const kx = ev.shiftKey ? 1 : k, ky = ev.ctrlKey ? 1 : k;
      e.vista = { x: { min: cx + (v.x.min - cx) * kx, max: cx + (v.x.max - cx) * kx }, y: { min: cy + (v.y.min - cy) * ky, max: cy + (v.y.max - cy) * ky } };
      redibujar();
    }, { passive: false });
    canvas.addEventListener('pointerdown', ev => {
      if (ev.button !== 0 || !e.margen) return;
      canvas.setPointerCapture(ev.pointerId);
      e.arrastre = { p: local(ev), v: JSON.parse(JSON.stringify(e.vista || e.base)) };
    });
    canvas.addEventListener('pointermove', ev => {
      const p = local(ev);
      e.hover = p;
      if (e.arrastre) {
        const r = canvas.getBoundingClientRect(), m = e.margen, v = e.arrastre.v;
        const dx = (p[0] - e.arrastre.p[0]) / (r.width - m.l - m.r) * (v.x.max - v.x.min);
        const dy = (p[1] - e.arrastre.p[1]) / (r.height - m.t - m.b) * (v.y.max - v.y.min);
        if (Math.abs(p[0] - e.arrastre.p[0]) + Math.abs(p[1] - e.arrastre.p[1]) > 2) {
          e.vista = { x: { min: v.x.min - dx, max: v.x.max - dx }, y: { min: v.y.min + dy, max: v.y.max + dy } };
          canvas.style.cursor = 'grabbing';
        }
      }
      redibujar();
    });
    const soltar = () => { e.arrastre = null; canvas.style.cursor = ''; };
    canvas.addEventListener('pointerup', soltar);
    canvas.addEventListener('pointercancel', soltar);
    canvas.addEventListener('pointerleave', () => { e.hover = null; if (!e.arrastre) redibujar(); });
    canvas.addEventListener('dblclick', () => { e.vista = null; redibujar(); });
    return e;
  }

  /**
   * Dibuja la gráfica. La vista ampliada se mantiene mientras la pantalla
   * no cambie el rango de x (otra escena u otra magnitud la deshacen).
   */
  function grafica(canvas, o) {
    const e = estadoDe(canvas);
    if (e.base && (Math.abs(e.base.x.min - o.x.min) > 1e-12 * (Math.abs(o.x.max) + 1) || Math.abs(e.base.x.max - o.x.max) > 1e-9 * (Math.abs(o.x.max) + 1))) e.vista = null;
    e.o = o; e.base = { x: { ...o.x }, y: { ...o.y } };
    return dibujar(canvas, o, e);
  }

  function dibujar(canvas, o0, e) {
    const o = e.vista ? { ...o0, x: e.vista.x, y: e.vista.y } : o0;
    const t = leerTokens();
    const r = canvas.getBoundingClientRect(), dpr = global.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = r.width, H = r.height, m = { l: 34, r: 12, t: 8, b: 20 };
    c.clearRect(0, 0, W, H);

    // Rejilla y números de los ejes. El margen izquierdo crece con la marca más
    // ancha del eje y (valores grandes como 50000 se cortaban a la izquierda)
    c.font = '11px "IBM Plex Mono", Consolas, monospace'; c.lineWidth = 1;
    c.fillStyle = t['texto-3'];
    c.textAlign = 'right'; c.textBaseline = 'middle';
    const my = marcas(o.y.min, o.y.max, Math.max(2, Math.floor((H - m.t - m.b) / 28)));
    for (const v of my) m.l = Math.max(m.l, Math.ceil(c.measureText(fmtMarca(v, my.paso)).width) + 10);
    const X = v => m.l + (W - m.l - m.r) * (v - o.x.min) / (o.x.max - o.x.min);
    const Y = v => H - m.b - (H - m.t - m.b) * (v - o.y.min) / (o.y.max - o.y.min);
    for (const v of my) {
      const yy = Math.round(Y(v)) + 0.5;
      c.strokeStyle = v === 0 ? t.eje : t['cuadricula-mayor'];
      c.beginPath(); c.moveTo(m.l, yy); c.lineTo(W - m.r, yy); c.stroke();
      c.fillText(fmtMarca(v, my.paso), m.l - 6, yy);
    }
    c.textAlign = 'center'; c.textBaseline = 'top';
    const mx = marcas(o.x.min, o.x.max, Math.max(2, Math.floor((W - m.l - m.r) / 60)));
    for (const v of mx) {
      const xx = Math.round(X(v)) + 0.5;
      c.strokeStyle = t['cuadricula-menor'];
      c.beginPath(); c.moveTo(xx, m.t); c.lineTo(xx, H - m.b); c.stroke();
      c.fillText(o.x.formato ? o.x.formato(v) : fmtMarca(v, mx.paso), xx, H - m.b + 5);
    }

    // Series. s.auxiliar: curva de referencia (1 px punteada); s.etiqueta: nombre junto a su extremo
    const colorDe = s => t.f[s.familia] || t[s.familia] || t.tinta;
    for (const s of o.series) {
      c.save();
      c.strokeStyle = colorDe(s); c.lineJoin = 'round'; c.lineCap = 'round';
      c.lineWidth = s.auxiliar ? 1 : 1.75;
      c.setLineDash(s.auxiliar || s.patron === 'punteado' ? [1.5, 3.5] : s.patron === 'discontinuo' ? [6, 4] : []);
      c.beginPath(); c.rect(m.l, m.t - 2, W - m.l - m.r, H - m.t - m.b + 4); c.clip();
      for (const tramo of s.tramos) {
        c.beginPath();
        tramo.forEach(([a, b], i) => (i ? c.lineTo(X(a), Y(b)) : c.moveTo(X(a), Y(b))));
        c.stroke();
      }
      c.restore();
      if (s.etiqueta) {
        const ult = s.tramos.flat().filter(([a, b]) => a >= o.x.min && a <= o.x.max && b >= o.y.min && b <= o.y.max).pop();
        if (ult) {
          c.save(); c.font = '11px "IBM Plex Sans", sans-serif'; c.textAlign = 'right'; c.textBaseline = 'bottom';
          c.lineWidth = 6; c.lineJoin = 'round'; c.strokeStyle = t.lienzo; c.strokeText(s.etiqueta, X(ult[0]) - 2, Y(ult[1]) - 3);
          c.fillStyle = colorDe(s); c.fillText(s.etiqueta, X(ult[0]) - 2, Y(ult[1]) - 3); c.restore();
        }
      }
    }

    // Eventos: rombos sobre el eje x (y punto sobre la curva si se da y)
    for (const e of o.eventos || []) {
      rombo(c, X(e.x), H - m.b, 3.5, t.tinta);
      if (e.y != null) { c.fillStyle = t.tinta; c.beginPath(); c.arc(X(e.x), Y(e.y), 2.5, 0, 2 * Math.PI); c.fill(); }
    }

    // Cursor sincronizado con la línea de tiempo
    if (o.cursor != null) {
      const xx = Math.round(X(o.cursor)) + 0.5;
      c.save(); c.strokeStyle = t['texto-3']; c.setLineDash([3, 3]); c.lineWidth = 1;
      c.beginPath(); c.moveTo(xx, m.t); c.lineTo(xx, H - m.b); c.stroke(); c.restore();
    }
    if (o.puntoCursor) {
      const [a, b] = o.puntoCursor;
      c.save(); c.fillStyle = t.lienzo; c.strokeStyle = t.f[o.series[0].familia] || t.tinta; c.lineWidth = 2;
      c.beginPath(); c.arc(X(a), Y(b), 3.5, 0, 2 * Math.PI); c.fill(); c.stroke(); c.restore();
    }

    // Interacción: margen para traducir el ratón, lectura bajo el cursor y
    // aviso de vista ampliada
    e.margen = { ...m };
    const dentro = e.hover && e.hover[0] >= m.l && e.hover[0] <= W - m.r && e.hover[1] >= m.t && e.hover[1] <= H - m.b;
    if (dentro && !e.arrastre) {
      const px = e.hover[0], xv = o.x.min + (px - m.l) / (W - m.l - m.r) * (o.x.max - o.x.min);
      c.save(); c.strokeStyle = t['texto-2']; c.lineWidth = 1;
      c.beginPath(); c.moveTo(Math.round(px) + 0.5, m.t); c.lineTo(Math.round(px) + 0.5, H - m.b); c.stroke(); c.restore();
      const lineas = [{ txt: o.x.lectura ? o.x.lectura(xv) : `x = ${fmt(xv, 4)}`, color: t['texto-2'] }];
      for (const s of o.series) {
        if (s.auxiliar) continue;
        const yv = valorEn(s, xv);
        if (yv == null || !Number.isFinite(yv)) continue;
        c.save(); c.fillStyle = t.lienzo; c.strokeStyle = colorDe(s); c.lineWidth = 1.5;
        c.beginPath(); c.arc(X(xv), Y(yv), 3, 0, 2 * Math.PI); c.fill(); c.stroke(); c.restore();
        lineas.push({ txt: `${s.etiqueta ? s.etiqueta + ' = ' : 'y = '}${fmt(yv, 4)}`, color: colorDe(s) });
        if (lineas.length > 6) break;
      }
      c.save(); c.font = '11px "IBM Plex Mono", Consolas, monospace';
      const ancho = Math.max(...lineas.map(l => c.measureText(l.txt).width)) + 12, alto = lineas.length * 14 + 8;
      let bx = px + 10; if (bx + ancho > W - m.r) bx = px - 10 - ancho;
      const by = m.t + 4;
      c.fillStyle = t.panel || t.lienzo; c.strokeStyle = t.linea || t['texto-3']; c.lineWidth = 1;
      c.beginPath(); c.rect(Math.round(bx) + 0.5, by + 0.5, Math.round(ancho), alto); c.fill(); c.stroke();
      c.textAlign = 'left'; c.textBaseline = 'top';
      lineas.forEach((l, k) => { c.fillStyle = l.color; c.fillText(l.txt, bx + 6, by + 5 + k * 14); });
      c.restore();
    }
    if (e.vista) {
      c.save(); c.font = '10px "IBM Plex Sans", sans-serif'; c.fillStyle = t['texto-3']; c.textAlign = 'right'; c.textBaseline = 'top';
      c.fillText('Ampliada · doble clic: ver todo', W - m.r - 2, m.t + 2); c.restore();
    }
    canvas.style.cursor = e.arrastre ? 'grabbing' : 'crosshair';
    return { X, Y };
  }

  global.Volta.grafica = grafica;
})(window);
