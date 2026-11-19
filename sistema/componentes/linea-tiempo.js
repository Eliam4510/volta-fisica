/* ==========================================================================
   Volta — línea de tiempo
   Riel, progreso simulado, cabezal arrastrable, marcas de tiempo y eventos
   como rombos. Requiere trazo.js.
   Uso: const lt = new Volta.LineaTiempo(canvas, { duracion, eventos, alCambiar });
        lt.poner(t); lt.dibujar();
   ========================================================================== */
(function (global) {
  'use strict';
  const { leerTokens, fmt, fmtMarca, pasoAgradable, rombo } = global.Volta;

  class LineaTiempo {
    constructor(canvas, o) {
      this.canvas = canvas; this.duracion = o.duracion; this.eventos = o.eventos || [];
      this.simulado = o.simulado ?? o.duracion; this.t = 0; this.alCambiar = o.alCambiar || (() => {});
      this.hover = null;
      const aT = ev => {
        const r = canvas.getBoundingClientRect();
        return Math.max(0, Math.min(this.simulado, (ev.clientX - r.left - this.m) / (r.width - 2 * this.m) * this.duracion));
      };
      canvas.addEventListener('pointerdown', ev => { canvas.setPointerCapture(ev.pointerId); this.arrastrando = true; this.alCambiar(aT(ev)); });
      canvas.addEventListener('pointermove', ev => {
        if (this.arrastrando) { this.alCambiar(aT(ev)); return; }
        const r = canvas.getBoundingClientRect(), x = ev.clientX - r.left;
        const cerca = this.eventos.find(e => Math.abs(this._x(e.t) - x) < 6);
        if (cerca !== this.hover) { this.hover = cerca; this.dibujar(); }
      });
      canvas.addEventListener('pointerup', () => { this.arrastrando = false; });
      canvas.addEventListener('pointerleave', () => { if (this.hover) { this.hover = null; this.dibujar(); } });
      this.m = 10;
    }
    _x(t) { return this.m + (this.w - 2 * this.m) * t / this.duracion; }
    poner(t) { this.t = t; this.dibujar(); }

    dibujar() {
      const c = this.canvas, tk = leerTokens(), dpr = global.devicePixelRatio || 1;
      const r = c.getBoundingClientRect(); this.w = r.width; const H = r.height;
      c.width = Math.round(r.width * dpr); c.height = Math.round(H * dpr);
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, this.w, H);
      const yRiel = 22;

      // Riel, tramo ya simulado y progreso hasta el cabezal
      g.fillStyle = tk['campo-activo']; g.beginPath(); g.roundRect(this.m, yRiel - 2, this.w - 2 * this.m, 4, 2); g.fill();
      g.fillStyle = tk['linea-fuerte']; g.beginPath(); g.roundRect(this.m, yRiel - 2, this._x(this.simulado) - this.m, 4, 2); g.fill();
      g.fillStyle = tk.tinta; g.beginPath(); g.roundRect(this.m, yRiel - 2, Math.max(0, this._x(this.t) - this.m), 4, 2); g.fill();

      // Marcas de tiempo
      const paso = pasoAgradable(this.duracion / Math.max(4, Math.floor(this.w / 90)));
      g.font = '11px "IBM Plex Mono", Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillStyle = tk['texto-3']; g.strokeStyle = tk['linea']; g.lineWidth = 1;
      for (let v = 0; v <= this.duracion + 1e-9; v += paso) {
        const x = Math.round(this._x(v)) + 0.5;
        g.beginPath(); g.moveTo(x, yRiel + 6); g.lineTo(x, yRiel + 9); g.stroke();
        g.fillText(fmtMarca(v, paso), x, yRiel + 11);
      }

      // Eventos
      for (const e of this.eventos) rombo(g, this._x(e.t), yRiel - 9, 3.5, e === this.hover ? tk.tinta : tk['texto-2']);
      if (this.hover) {
        g.font = '500 11px "IBM Plex Sans", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
        const txt = `${this.hover.nombre} · ${fmt(this.hover.t, 4)} s`, wTxt = g.measureText(txt).width;
        let x = this._x(this.hover.t) + 8; if (x + wTxt + 12 > this.w) x = this._x(this.hover.t) - wTxt - 20;
        g.fillStyle = tk.tinta; g.beginPath(); g.roundRect(x, yRiel - 18, wTxt + 12, 18, 4); g.fill();
        g.fillStyle = tk['sobre-tinta']; g.fillText(txt, x + 6, yRiel - 9);
      }

      // Cabezal
      const xc = this._x(this.t);
      g.strokeStyle = tk.tinta; g.lineWidth = 1.5; g.beginPath(); g.moveTo(xc, yRiel - 12); g.lineTo(xc, yRiel + 8); g.stroke();
      g.fillStyle = tk.lienzo; g.beginPath(); g.arc(xc, yRiel, 6, 0, 2 * Math.PI); g.fill(); g.stroke();
    }
  }

  global.Volta.LineaTiempo = LineaTiempo;
})(window);
