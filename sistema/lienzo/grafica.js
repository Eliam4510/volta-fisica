/* ==========================================================================
   Volta — gráficas (Canvas 2D) con el lenguaje de diseño
   En la aplicación final se usará uPlot con este mismo estilo; esta versión
   fija el aspecto: series del color de su familia, distinguidas entre sí por
   el patrón de trazo, cursor sincronizado y eventos como rombos.
   Requiere trazo.js.
   ========================================================================== */
(function (global) {
  'use strict';
  const { leerTokens, fmtMarca, pasoAgradable, rombo } = global.Volta;

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
  function grafica(canvas, o) {
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
      c.fillText(fmtMarca(v, mx.paso), xx, H - m.b + 5);
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
    return { X, Y };
  }

  global.Volta.grafica = grafica;
})(window);
