/* ==========================================================================
   Volta — gramática del lienzo · dominio Gravitación
   Símbolos propios del módulo, según la sección 7 de
   docs/04_lenguaje_de_diseno.md:
   - planeta como materia: relleno --campo, contorno de materia en tinta,
     media elipse del ecuador (como el icono o-planeta) y centro de masa;
     montaña opcional (el cañón de Newton) y meridiano de referencia que gira
     con el planeta;
   - cañón: tubo macizo de tinta (materia) en la cima;
   - áreas barridas (segunda ley de Kepler): sectores con el tinte de la
     familia inercia, porque la velocidad areolar es L/2m;
   - línea de ápsides (eje de simetría, raya y punto) con sus marcas;
   - indicador de velocidad circular y de escape sobre la dirección de v
     (marcas auxiliares en --texto-3);
   - barra de escala en km.
   Extiende Volta.Trazo.prototype con prefijo grav (sección 11: cada dominio
   nombra sus métodos con prefijo propio). Mismas convenciones que trazo.js:
   grosores en px de pantalla, patrones de PATRON, colores de this.t, halo en
   toda etiqueta. Coordenadas de mundo en km (y hacia arriba).
   Requiere trazo.js.
   ========================================================================== */
(function (global) {
  'use strict';
  const { Trazo, G, PATRON, cantidad, pasoAgradable } = global.Volta;
  const P = Trazo.prototype;

  // Medidas del dominio (px de pantalla salvo que se diga)
  const GG = {
    ecuador: 2.5 / 6.75,     // semieje menor del ecuador / radio (proporción del icono o-planeta)
    meridiano: 8,            // marca del meridiano de referencia fuera de la superficie
    canon: [22, 6],          // largo y grueso del tubo del cañón
    apside: 6,               // semilargo de la marca de ápside
    marcaV: 5,               // semilargo de las marcas de v_c y v_e
    montanaBase: 1.0,        // semiancho angular de la montaña en la base / (altura/R): laderas de ~45°
  };

  // ---------------------------------------------------------------------
  // Auxiliares
  // ---------------------------------------------------------------------
  // Contorno del planeta en mundo, con la montaña si la hay
  function contornoPlaneta(c, R, montana, n = 240) {
    if (!montana) return null;
    const { angulo: phi, altura: h } = montana;
    const beta = Math.max(0.02, GG.montanaBase * h / R);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const th = phi + beta + (2 * Math.PI - 2 * beta) * i / n;
      pts.push([c[0] + R * Math.cos(th), c[1] + R * Math.sin(th)]);
    }
    pts.push([c[0] + (R + h) * Math.cos(phi), c[1] + (R + h) * Math.sin(phi)]);
    return pts;
  }

  // ---------------------------------------------------------------------
  // 6 · Materia: planeta
  // ---------------------------------------------------------------------
  // c: centro (mundo), R: radio (mundo). o: { nombre, montana: {angulo, altura},
  // meridiano: ángulo (rad) | null, grueso }
  P.gravPlaneta = function (c, R, o = {}) {
    const ctx = this.ctx, v = this.vista, [cx, cy] = v.P(c), Rp = R * v.escala;
    const w = G.materia + (o.grueso ? 0.5 : 0);
    ctx.save(); ctx.setLineDash([]);
    ctx.beginPath();
    const borde = contornoPlaneta(c, R, o.montana);
    if (borde) borde.forEach((p, i) => { const [x, y] = v.P(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    else ctx.arc(cx, cy, Rp, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.fillStyle = this.t.campo; ctx.fill();
    ctx.strokeStyle = this.t.tinta; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.stroke();
    // Ecuador: media elipse inferior, como en el icono
    if (Rp > 18) {
      ctx.beginPath(); ctx.ellipse(cx, cy, Rp, Rp * GG.ecuador, 0, 0, Math.PI);
      ctx.strokeStyle = this.t['texto-3']; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
    // Meridiano de referencia: un punto fijo del ecuador que gira con el planeta
    if (o.meridiano != null && Rp > 14) {
      const ux = Math.cos(o.meridiano), uy = -Math.sin(o.meridiano);
      this.lineaPx([[cx + ux * 9, cy + uy * 9], [cx + ux * Rp, cy + uy * Rp]], { color: 'texto-3', grosor: 1, patron: 'eje', extremo: 'butt' });
      this.lineaPx([[cx + ux * Rp, cy + uy * Rp], [cx + ux * (Rp + GG.meridiano), cy + uy * (Rp + GG.meridiano)]], { color: 'tinta', grosor: G.materia, extremo: 'butt' });
    }
    if (Rp > 10) this.centroMasa(c);
    if (o.nombre && Rp > 40) this.texto(o.nombre, cx, cy + 24, { fuente: 'ui', tam: 12, peso: 500, color: 'texto-2', alinear: 'center', halo: false });
    return [cx, cy, Rp];
  };

  // Cañón en la cima: tubo macizo de tinta detrás del punto de disparo p,
  // orientado según la dirección de lanzamiento (ángulo de pantalla en rad), y
  // rueda del lado del suelo (abajo: punto de pantalla hacia el que está el suelo)
  P.gravCanon = function (p, angPantalla, abajo) {
    const [x, y] = this.vista.P(p), [L, a] = GG.canon, ctx = this.ctx;
    const ux = Math.cos(angPantalla), uy = Math.sin(angPantalla);
    let nx = -uy, ny = ux;
    if (abajo && (abajo[0] - x) * nx + (abajo[1] - y) * ny < 0) { nx = -nx; ny = -ny; }
    ctx.save(); ctx.setLineDash([]);
    ctx.strokeStyle = this.t.tinta; ctx.lineCap = 'butt'; ctx.lineWidth = a;
    ctx.beginPath(); ctx.moveTo(x - ux * L, y - uy * L); ctx.lineTo(x + ux * 2, y + uy * 2); ctx.stroke();
    // Rueda de la cureña bajo el tubo
    const rx = x - ux * L * 0.55 + nx * (a / 2 + 1), ry = y - uy * L * 0.55 + ny * (a / 2 + 1);
    ctx.fillStyle = this.t.lienzo; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(rx, ry, 4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.fillStyle = this.t.tinta; ctx.beginPath(); ctx.arc(rx, ry, 1.2, 0, 2 * Math.PI); ctx.fill();
    ctx.restore();
    return L + 6;
  };

  // Cota como la de trazo.js, con un hueco inicial en las líneas de
  // referencia (o.hueco px) para no atravesar lo que hay junto a los extremos
  P.gravCota = function (p1, p2, o = {}) {
    const [x1, y1] = this.vista.P(p1), [x2, y2] = this.vista.P(p2);
    const L = Math.hypot(x2 - x1, y2 - y1), nx = -(y2 - y1) / L, ny = (x2 - x1) / L, d = o.desplazamiento || 16, h0 = o.hueco ?? 3;
    const a = [x1 + nx * d, y1 + ny * d], b = [x2 + nx * d, y2 + ny * d];
    for (const [x, y] of [[x1, y1], [x2, y2]]) {
      if (d + 4 > h0) this.lineaPx([[x + nx * h0, y + ny * h0], [x + nx * (d + 4), y + ny * (d + 4)]], { color: 'texto-3', grosor: 1 });
    }
    this.flechaPx(a[0], a[1], b[0], b[1], { color: 'texto-2', grosor: 1, punta: 'abierta', ambas: true });
    if (o.texto) this.compuesto([{ t: o.texto, f: 'sim', tam: 15 }], (a[0] + b[0]) / 2 + nx * 12, (a[1] + b[1]) / 2 + ny * 12 + 4, { alinear: 'center', color: 'texto-2' });
  };

  // ---------------------------------------------------------------------
  // 5 · Construcción
  // ---------------------------------------------------------------------
  // Áreas barridas: sectores [centro, ...arco] (mundo). Los pares van con el
  // tinte de inercia; los impares, solo con sus radios. o.etiquetas: subíndices.
  P.gravSectores = function (c, arcos, o = {}) {
    const ctx = this.ctx, v = this.vista, [cx, cy] = v.P(c);
    arcos.forEach((arco, k) => {
      if (arco.length < 2) return;
      const pts = arco.map(p => v.P(p));
      ctx.save(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(cx, cy); pts.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.closePath();
      if (k % 2 === 0) { ctx.fillStyle = this.t.tinte.inercia; ctx.fill(); }
      ctx.restore();
      const ult = pts[pts.length - 1];
      this.lineaPx([[cx, cy], pts[0]], { color: 'inercia', grosor: G.auxiliar, patron: 'auxiliar', opacidad: 0.8 });
      if (k === arcos.length - 1 || o.cerrarUltimo) this.lineaPx([[cx, cy], ult], { color: 'inercia', grosor: G.auxiliar, patron: 'auxiliar', opacidad: 0.8 });
    });
  };

  // Línea de ápsides (eje de simetría) y marcas de periapsis y apoapsis.
  // peri/apo: puntos de mundo (apo puede ser null en una órbita abierta).
  P.gravApsides = function (c, peri, apo, o = {}) {
    const v = this.vista, [cx, cy] = v.P(c), pp = v.P(peri);
    const extremo = apo ? v.P(apo) : [cx, cy];
    this.lineaPx([pp, extremo], { color: 'texto-3', grosor: 1, patron: 'eje', extremo: 'butt' });
    const marca = ([x, y], txt, sub) => {
      const L = Math.hypot(x - cx, y - cy) || 1, ux = (x - cx) / L, uy = (y - cy) / L, s = GG.apside;
      this.lineaPx([[x - uy * s, y + ux * s], [x + uy * s, y - ux * s]], { color: 'texto-2', grosor: 1.5, extremo: 'butt' });
      if (!txt) return;
      // Etiqueta por fuera de la órbita, en la prolongación del eje
      const ex = x + ux * 14, ey = y + uy * 14, alinear = ux > 0.35 ? 'left' : ux < -0.35 ? 'right' : 'center';
      const dy = uy > 0.35 ? 12 : uy < -0.35 ? -8 : 4;
      this.texto(txt, ex, ey + dy, { fuente: 'ui', tam: 11.5, peso: 500, color: 'texto-2', alinear, halo: true });
      if (sub) this.texto(sub, ex, ey + dy + 14, { fuente: 'num', tam: 11, color: 'texto-3', alinear, halo: true });
    };
    marca(pp, o.nombrePeri, o.subPeri);
    if (apo) marca(extremo, o.nombreApo, o.subApo);
  };

  // ---------------------------------------------------------------------
  // 8 · Instrumentos
  // ---------------------------------------------------------------------
  // Marcas de v_c y v_e sobre la dirección de la velocidad. base: punto de
  // pantalla donde nace el vector; dir: unitario de pantalla; k: px por unidad.
  P.gravMarcasVelocidad = function (base, dir, k, v, marcas) {
    const [bx, by] = base, [ux, uy] = dir, s = GG.marcaV;
    const lejos = Math.max(v, ...marcas.map(m => m.valor)) * k;
    // Prolongación auxiliar de la dirección de v hasta la marca más lejana
    if (lejos > v * k + 2) this.lineaPx([[bx + ux * v * k, by + uy * v * k], [bx + ux * lejos, by + uy * lejos]], { color: 'texto-3', grosor: G.auxiliar, patron: 'auxiliar' });
    for (const m of marcas) {
      const x = bx + ux * m.valor * k, y = by + uy * m.valor * k;
      this.lineaPx([[x - uy * s, y + ux * s], [x + uy * s, y - ux * s]], { color: 'texto-3', grosor: 1.25, extremo: 'butt' });
      // Etiqueta al lado de la marca, del lado de fuera del giro
      const lado = m.lado ?? 1, lx = x - uy * (s + 7) * lado, ly = y + ux * (s + 7) * lado + 4;
      this.compuesto([{ t: 'v', f: 'sim', tam: 12.5, color: 'texto-3' }, { t: m.sub, f: 'simRecta', tam: 8.5, dy: 3, color: 'texto-3' }], lx, ly, { alinear: (-uy * lado) >= 0 ? 'left' : 'right' });
    }
  };

  // Barra de escala con la unidad del lienzo (km)
  P.gravBarraEscala = function (x, y, unidad = 'km') {
    const v = this.vista, m = pasoAgradable(80 / v.escala), L = m * v.escala;
    this.lineaPx([[x, y - 4], [x, y + 4]], { color: 'texto-2', grosor: 1.5 });
    this.lineaPx([[x + L, y - 4], [x + L, y + 4]], { color: 'texto-2', grosor: 1.5 });
    this.lineaPx([[x, y], [x + L, y]], { color: 'texto-2', grosor: 1.5 });
    this.texto(cantidad(m, unidad, 2).replace(/\.0+(?= )/, ''), x + L / 2, y - 9, { fuente: 'num', tam: 11, color: 'texto-2', alinear: 'center', halo: true });
  };

  global.Volta.grav = { GG, contornoPlaneta };
})(window);
