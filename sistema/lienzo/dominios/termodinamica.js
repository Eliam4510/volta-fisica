/* ==========================================================================
   Volta — gramática del lienzo · dominio Termodinámica
   Símbolos propios del módulo, según la sección 7 de
   docs/04_lenguaje_de_diseno.md:
   - paredes de recipiente: adiabática = doble línea con relleno de rayado;
     conductora = línea simple de materia;
   - topes del émbolo (geometría fija, rayados);
   - baño térmico como fluido (tinte del 6 % de tinta y rayitas bajo la
     superficie);
   - gas como moléculas (discos de 2 a 4 px en --texto-2);
   - émbolo y pesa como cuerpos rígidos (relleno --campo, contorno de
     materia, centro de masa ⊕);
   - calentador (resistencia en zigzag en tinta: la materia no tiene color);
   - flechas de calor en la familia térmico, con su etiqueta Φ;
   - termómetro y manómetro con tubo o sonda hasta el gas.
   Extiende Volta.Trazo.prototype con las mismas convenciones que trazo.js:
   grosores en px de pantalla (no escalan con el zoom), patrones de PATRON,
   colores de this.t, halo en toda etiqueta.
   Requiere trazo.js.
   ========================================================================== */
(function (global) {
  'use strict';
  const { Trazo, G, PATRON } = global.Volta;
  const P = Trazo.prototype;

  // Medidas propias del dominio (px de pantalla)
  const GT = {
    paredAdiabatica: 8,       // separación entre las dos líneas de la pared adiabática
    rayadoPared: 5,           // paso del rayado dentro de la pared adiabática
    molecula: [1.25, 2],      // radio de las moléculas: discos de 2.5 a 4 px
    margenGas: 3,             // las moléculas no tocan las paredes
    calentadorDientes: 7, calentadorAmplitud: 4.5,
    tope: [6, 9],             // ancho y alto de cada tope
    termometro: { ancho: 6, alto: 30, bulbo: 4.5 },
    manometro: 11,            // radio de la esfera
    tubo: 4,                  // ancho exterior del tubo del manómetro
  };

  // ---------------------------------------------------------------------
  // Auxiliares de pantalla
  // ---------------------------------------------------------------------
  // Desplaza una polilínea de pantalla d px hacia el lado indicado, con
  // inglete en los vértices. Mismo convenio que superficie(): lado 1 = a la
  // derecha del sentido de recorrido (en pantalla).
  function desplazar(pts, d, lado) {
    const nor = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], L = Math.hypot(x2 - x1, y2 - y1) || 1;
      nor.push([-(y2 - y1) / L * lado, (x2 - x1) / L * lado]);
    }
    return pts.map((p, i) => {
      if (i === 0) return [p[0] + nor[0][0] * d, p[1] + nor[0][1] * d];
      if (i === pts.length - 1) { const k = nor[nor.length - 1]; return [p[0] + k[0] * d, p[1] + k[1] * d]; }
      const a = nor[i - 1], b = nor[i];
      let mx = a[0] + b[0], my = a[1] + b[1]; const L = Math.hypot(mx, my) || 1; mx /= L; my /= L;
      const k = d / Math.max(0.2, mx * b[0] + my * b[1]);
      return [p[0] + mx * k, p[1] + my * k];
    });
  }

  // Rellena un polígono de pantalla con --lienzo y rayado a 45° (como los cortes)
  P._rayarPoligono = function (pts, paso, color) {
    const c = this.ctx;
    c.save(); c.setLineDash([]);
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
    c.fillStyle = this.t.lienzo; c.fill(); c.clip();
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), alto = y1 - y0;
    c.strokeStyle = this.color(color || 'texto-3'); c.lineWidth = 1; c.lineCap = 'butt'; c.beginPath();
    for (let k = x0 - alto - paso; k < x1 + paso; k += paso) { c.moveTo(k, y1); c.lineTo(k + alto, y0); }
    c.stroke(); c.restore();
  };

  // Rectángulo de mundo → [x, y, w, h] de pantalla
  P.rectPx = function (x0, y0, x1, y1) {
    const [a, b] = this.vista.P([x0, y1]), [c, d] = this.vista.P([x1, y0]);
    return [a, b, c - a, d - b];
  };

  // ---------------------------------------------------------------------
  // 3 · Geometría fija
  // ---------------------------------------------------------------------
  // Paredes de un recipiente: polilínea de mundo por la cara interior (la que
  // toca el gas). o.tipo: 'adiabatica' | 'conductora'; o.lado: lado exterior
  // ('der' por defecto, como superficie); o.grueso: hover (+0.5 px).
  P.paredes = function (ptsMundo, o = {}) {
    const pts = ptsMundo.map(p => this.vista.P(p)), lado = o.lado === 'izq' ? -1 : 1;
    const w = G.materia + (o.grueso ? 0.5 : 0);
    if (o.tipo === 'adiabatica') {
      const fuera = desplazar(pts, GT.paredAdiabatica, lado);
      this._rayarPoligono(pts.concat(fuera.slice().reverse()), GT.rayadoPared);
      this.lineaPx(pts, { grosor: w });
      this.lineaPx(fuera, { grosor: w });
      // Cierre de los extremos abiertos de la doble línea
      this.lineaPx([pts[0], fuera[0]], { grosor: G.real });
      this.lineaPx([pts[pts.length - 1], fuera[fuera.length - 1]], { grosor: G.real });
      return GT.paredAdiabatica;
    }
    this.lineaPx(pts, { grosor: w });
    return 0;
  };
  P.anchoPared = tipo => (tipo === 'adiabatica' ? GT.paredAdiabatica : 0);

  // Topes que limitan la carrera del émbolo: bloques rayados fijos a las caras
  // interiores xIzq y xDer; y es la cara inferior del tope (donde choca el émbolo).
  P.topes = function (xIzq, xDer, y) {
    const [w, h] = GT.tope;
    for (const [x, s] of [[xIzq, 1], [xDer, -1]]) {
      const [X, Y] = this.vista.P([x, y]);
      const pts = [[X, Y], [X + s * w, Y], [X + s * w, Y - h], [X, Y - h]];
      this._rayarPoligono(pts, 3);
      this.lineaPx(pts.slice(0, 3).concat([[X, Y - h]]), { grosor: G.real });
    }
  };

  // ---------------------------------------------------------------------
  // 4 · Medios: baño (fluido) y gas
  // ---------------------------------------------------------------------
  // Fluido en un rectángulo de pantalla: tinte del 6 % de tinta, línea de
  // superficie y dos rayitas horizontales cortas bajo ella.
  P.fluidoPx = function (x0, x1, ySup, yFondo) {
    if (x1 - x0 < 4) return;
    const c = this.ctx;
    c.save(); c.globalAlpha = 0.06; c.fillStyle = this.t.tinta; c.fillRect(x0, ySup, x1 - x0, yFondo - ySup); c.restore();
    this.lineaPx([[x0, ySup + 0.5], [x1, ySup + 0.5]], { color: 'texto-3', grosor: 1, extremo: 'butt' });
    const cx = (x0 + x1) / 2, a = Math.min(10, (x1 - x0) * 0.2);
    this.lineaPx([[cx - a, ySup + 5.5], [cx + a, ySup + 5.5]], { color: 'texto-3', grosor: 1, extremo: 'butt' });
    this.lineaPx([[cx - a * 0.5, ySup + 9.5], [cx + a * 0.5, ySup + 9.5]], { color: 'texto-3', grosor: 1, extremo: 'butt' });
  };

  // Baño térmico alrededor de un cilindro: el fluido ocupa el espacio entre
  // la cara interior del tanque (xi, xd) y la cara exterior de las paredes del
  // cilindro (xa, xb, más el ancho de la pared en px), desde el fondo y = 0
  // hasta el nivel. El tanque se dibuja aparte con superficie().
  P.bano = function ({ xi, xd, xa, xb, nivel, pared = 0 }) {
    const v = this.vista, Ys = v.Y(nivel), Yf = v.Y(0) - 1;
    this.fluidoPx(v.X(xi) + 1, v.X(xa) - pared - 1, Ys, Yf);
    this.fluidoPx(v.X(xb) + pared + 1, v.X(xd) - 1, Ys, Yf);
  };

  // Moléculas: discos de 2 a 4 px en --texto-2 dentro de un rectángulo de
  // mundo {x0, x1, y0, y1}; lista de {u, w, r} normalizados a [0, 1].
  P.moleculas = function (rect, lista) {
    const c = this.ctx, [X, Y, W, H] = this.rectPx(rect.x0, rect.y0, rect.x1, rect.y1), m = GT.margenGas;
    if (W <= 2 * m || H <= 2 * m) return;
    c.save(); c.setLineDash([]);
    c.beginPath(); c.rect(X, Y, W, H); c.clip();
    c.fillStyle = this.t['texto-2'];
    c.beginPath();
    for (const q of lista) {
      const x = X + m + q.u * (W - 2 * m), y = Y + H - m - q.w * (H - 2 * m);
      c.moveTo(x + q.r, y); c.arc(x, y, q.r, 0, 2 * Math.PI);
    }
    c.fill(); c.restore();
  };

  // ---------------------------------------------------------------------
  // 6 · Materia
  // ---------------------------------------------------------------------
  // Cuerpo rígido rectangular con hover (+0.5 px) y centro de masa ⊕
  P.bloque = function (x0, y0, x1, y1, o = {}) {
    const c = this.ctx, [X, Y, W, H] = this.rectPx(x0, y0, x1, y1);
    c.save(); c.setLineDash([]);
    c.fillStyle = this.t.campo; c.fillRect(X, Y, W, H);
    c.strokeStyle = this.t.tinta; c.lineWidth = G.materia + (o.grueso ? 0.5 : 0); c.lineJoin = 'round';
    c.strokeRect(X, Y, W, H); c.restore();
    if (o.centroMasa !== false && H > 13) this.centroMasa([(x0 + x1) / 2, (y0 + y1) / 2]);
    if (o.simbolo && H > 13) {
      this.compuesto(o.simbolo, X + W / 2 + 10, Y + H / 2 + 5, { color: 'texto' });
    }
    return [X, Y, W, H];
  };

  // Émbolo: cuerpo rígido que llena la sección entre las caras interiores
  P.embolo = function (xIzq, xDer, yBase, espesor, o = {}) {
    return this.bloque(xIzq, yBase, xDer, yBase + espesor, o);
  };

  // Pesa: bloque sobre el émbolo. o.fraccion < 1 la dibuja a medio cargar
  // (cuasiestático: la carga se pone poco a poco). o.prevista: contorno
  // discontinuo de estado futuro, sin relleno.
  P.pesa = function (cx, yBase, ancho, alto, o = {}) {
    if (o.prevista) {
      const [X, Y, W, H] = this.rectPx(cx - ancho / 2, yBase, cx + ancho / 2, yBase + alto);
      this.lineaPx([[X, Y], [X + W, Y], [X + W, Y + H], [X, Y + H]], { color: 'texto-3', grosor: G.previsto, patron: 'previsto', cerrar: true, extremo: 'butt' });
      return [X, Y, W, H];
    }
    const f = o.fraccion == null ? 1 : o.fraccion;
    return this.bloque(cx - ancho / 2, yBase, cx + ancho / 2, yBase + alto * f, { grueso: o.grueso, simbolo: f > 0.6 ? o.simbolo : null });
  };

  // Calentador: resistencia en zigzag sobre dos postes que salen del fondo.
  // Mundo: extremos x0, x1 a la altura y; fondo en yFondo. Se dibuja en tinta
  // encendido o apagado: lo que cambia es el calor (flechas térmicas).
  P.calentador = function (x0, x1, y, yFondo, o = {}) {
    const [X0, Y] = this.vista.P([x0, y]), X1 = this.vista.X(x1), YF = this.vista.Y(yFondo);
    const w = G.real + (o.grueso ? 0.5 : 0);
    this.lineaPx([[X0, YF], [X0, Y]], { grosor: w });
    this.lineaPx([[X1, YF], [X1, Y]], { grosor: w });
    const n = GT.calentadorDientes, a = GT.calentadorAmplitud, L = X1 - X0, e = Math.min(6, L * 0.12);
    const pts = [[X0, Y], [X0 + e, Y]];
    for (let i = 0; i < n; i++) pts.push([X0 + e + (L - 2 * e) * (i + 0.5) / n, Y + (i % 2 ? a : -a)]);
    pts.push([X1 - e, Y], [X1, Y]);
    this.lineaPx(pts, { grosor: w });
    // Bornes en el fondo
    const c = this.ctx; c.save(); c.fillStyle = this.t.tinta;
    for (const X of [X0, X1]) { c.beginPath(); c.arc(X, YF, 2.5, 0, 2 * Math.PI); c.fill(); }
    c.restore();
    return [X0, Y - a, L, 2 * a];
  };

  // ---------------------------------------------------------------------
  // 7 · Magnitudes: calor
  // ---------------------------------------------------------------------
  // Flecha de calor en pantalla: vector de la familia térmico. El calor es una
  // magnitud, así que usa el trazo de vector (2.25 px, punta llena) y siempre
  // lleva su etiqueta: el color nunca va solo.
  P.flechaCalor = function (x1, y1, x2, y2) {
    this.flechaPx(x1, y1, x2, y2, { color: 'termico', grosor: G.vector });
  };
  // Etiqueta Φ (flujo de calor, ISO 80000-5) con subíndice descriptivo en redonda
  P.etiquetaCalor = function (x, y, sub, valorW, alinear) {
    return this.etiquetaMagnitud(x, y, { simbolo: 'Φ', sub, subRecto: true, valor: valorW, unidad: 'W', color: 'termico', alinear });
  };

  // ---------------------------------------------------------------------
  // 8 · Instrumentos
  // ---------------------------------------------------------------------
  // Tubo hueco (conexión del manómetro): polilínea de pantalla
  P.tuboPx = function (pts) {
    this.lineaPx(pts, { grosor: GT.tubo, extremo: 'butt' });
    this.lineaPx(pts, { grosor: GT.tubo - 2, color: 'lienzo', extremo: 'butt' });
  };

  // Termómetro: tubo con bulbo lleno; la columna sube con la fracción de su
  // escala. (x, y) = centro del bulbo en px.
  P.termometro = function (x, y, frac, o = {}) {
    const c = this.ctx, { ancho, alto, bulbo } = GT.termometro, f = Math.max(0, Math.min(1, frac));
    c.save(); c.setLineDash([]);
    c.beginPath(); c.roundRect(x - ancho / 2, y - alto, ancho, alto, ancho / 2);
    c.fillStyle = this.t.lienzo; c.fill();
    c.strokeStyle = this.t.tinta; c.lineWidth = 1.25 + (o.grueso ? 0.5 : 0); c.stroke();
    c.fillStyle = this.t.tinta;
    c.beginPath(); c.arc(x, y, bulbo, 0, 2 * Math.PI); c.fill();
    const hc = (alto - bulbo - 4) * f;
    c.fillRect(x - 1.25, y - bulbo - hc, 2.5, hc + 1);
    c.strokeStyle = this.t['texto-3']; c.lineWidth = 1; c.beginPath();
    for (let i = 1; i <= 4; i++) { const yy = Math.round(y - bulbo - (alto - bulbo - 4) * i / 5) + 0.5; c.moveTo(x + ancho / 2 + 1.5, yy); c.lineTo(x + ancho / 2 + 4.5, yy); }
    c.stroke(); c.restore();
  };

  // Manómetro: esfera con escala de 270° y aguja; frac ∈ [0, 1] de la escala.
  P.manometro = function (x, y, frac, o = {}) {
    const c = this.ctx, r = GT.manometro, f = Math.max(0, Math.min(1, frac));
    const a0 = Math.PI * 0.75, barrido = Math.PI * 1.5;  // de abajo-izquierda a abajo-derecha, por arriba
    c.save(); c.setLineDash([]);
    c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI);
    c.fillStyle = this.t.lienzo; c.fill();
    c.strokeStyle = this.t.tinta; c.lineWidth = G.real + (o.grueso ? 0.5 : 0); c.stroke();
    c.strokeStyle = this.t['texto-3']; c.lineWidth = 1; c.lineCap = 'round'; c.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = a0 + barrido * i / 6, ca = Math.cos(a), sa = Math.sin(a);
      c.moveTo(x + ca * (r - 2.5), y + sa * (r - 2.5)); c.lineTo(x + ca * (r - 5), y + sa * (r - 5));
    }
    c.stroke();
    const a = a0 + barrido * f;
    c.strokeStyle = this.t.tinta; c.lineWidth = 1.5; c.beginPath();
    c.moveTo(x, y); c.lineTo(x + Math.cos(a) * (r - 3), y + Math.sin(a) * (r - 3)); c.stroke();
    c.fillStyle = this.t.tinta; c.beginPath(); c.arc(x, y, 2, 0, 2 * Math.PI); c.fill();
    c.restore();
  };

  // Sonda: punto de medida dentro del gas (disco lleno de 2.5 px de radio)
  P.sondaTermica = function (x, y) {
    const c = this.ctx; c.save(); c.fillStyle = this.t.tinta;
    c.beginPath(); c.arc(x, y, 2.5, 0, 2 * Math.PI); c.fill(); c.restore();
  };

  // ---------------------------------------------------------------------
  // 10 · Edición: selección de regiones acotadas por paredes (gas, émbolo).
  // El contorno 3 · 3 va a 5 px del objeto, pero hacia dentro en los lados
  // donde lo limita una pared, para no montarse sobre ella. Sin asas: su
  // tamaño lo fijan las paredes y el estado del gas.
  // ---------------------------------------------------------------------
  // seleccionRegion() vive ahora en el núcleo (trazo.js)


  // ---------------------------------------------------------------------
  // Moléculas cosméticas (coherentes con V y T, no con la dinámica real):
  // posiciones base uniformes y velocidades con componentes normales
  // (distribución de Maxwell). La posición en t se obtiene plegando
  // u0 + cx·fx en [0, 1] (rebote en las paredes); fx y fy son fases que
  // avanzan con √T, y fy además con 1/h para que la rapidez en el mundo no
  // dependa de la altura del gas.
  // ---------------------------------------------------------------------
  function crearMoleculas(N, semilla = 7) {
    let s = semilla >>> 0;
    const azar = () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let x = Math.imul(s ^ (s >>> 15), 1 | s);
      x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    const normal = () => Math.sqrt(-2 * Math.log(1 - azar())) * Math.cos(2 * Math.PI * azar());
    return Array.from({ length: N }, () => ({
      u0: azar(), w0: azar(), cx: normal(), cy: normal(),
      r: GT.molecula[0] + (GT.molecula[1] - GT.molecula[0]) * azar(),
    }));
  }
  const pliegue = x => { const y = ((x % 2) + 2) % 2; return y > 1 ? 2 - y : y; };
  function posicionesMoleculas(lista, fx, fy) {
    return lista.map(q => ({ u: pliegue(q.u0 + q.cx * fx), w: pliegue(q.w0 + q.cy * fy), r: q.r }));
  }

  // ---------------------------------------------------------------------
  // Ampliación: símbolos de los espacios Ciclos, Gas molecular, Calor y de
  // los montajes nuevos del Laboratorio. Prefijo «termo» (espacio de nombres
  // del dominio, docs/04 §11).
  // ---------------------------------------------------------------------

  // Caja cerrada (recipiente rígido) de mundo: pared conductora = línea de
  // materia; adiabática = doble línea con rayado por fuera. o.sinTecho: sin
  // la pared de arriba (vaso abierto). Devuelve el ancho de la pared en px.
  P.termoCaja = function (x0, y0, x1, y1, o = {}) {
    const [X, Y, W, H] = this.rectPx(x0, y0, x1, y1), c = this.ctx, w = G.materia + (o.grueso ? 0.5 : 0);
    const d = o.tipo === 'adiabatica' ? GT.paredAdiabatica : 0, techo = !o.sinTecho;
    if (d) {
      const fuera = techo ? [[X - d, Y - d], [X + W + d, Y - d], [X + W + d, Y + H + d], [X - d, Y + H + d]] : [[X - d, Y], [X + W + d, Y], [X + W + d, Y + H + d], [X - d, Y + H + d]];
      c.save(); c.beginPath(); fuera.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
      c.rect(X, techo ? Y : Y - d - 1, W, H + (techo ? 0 : d + 1)); c.clip('evenodd');
      this._rayarPoligono(fuera, GT.rayadoPared);
      c.restore();
      this.lineaPx(techo ? fuera.concat([fuera[0]]) : [fuera[0], fuera[3], fuera[2], fuera[1]], { grosor: w });
    }
    this.lineaPx(techo ? [[X, Y], [X + W, Y], [X + W, Y + H], [X, Y + H], [X, Y]] : [[X, Y], [X, Y + H], [X + W, Y + H], [X + W, Y]], { grosor: w });
    if (d && !techo) { this.lineaPx([[X - d, Y], [X, Y]], { grosor: G.real }); this.lineaPx([[X + W, Y], [X + W + d, Y]], { grosor: G.real }); }
    return d;
  };

  // Válvula en (x, y) px sobre un tubo horizontal: dos triángulos que se tocan
  // por el vértice; cerrada, llenos de tinta; abierta, solo el contorno.
  P.termoValvula = function (x, y, abierta, o = {}) {
    const c = this.ctx, s = 7;
    c.save(); c.setLineDash([]); c.lineJoin = 'round';
    c.beginPath(); c.moveTo(x - s, y - s * 0.75); c.lineTo(x, y); c.lineTo(x - s, y + s * 0.75); c.closePath();
    c.moveTo(x + s, y - s * 0.75); c.lineTo(x, y); c.lineTo(x + s, y + s * 0.75); c.closePath();
    c.fillStyle = abierta ? this.t.lienzo : this.t.tinta; c.fill();
    c.strokeStyle = this.t.tinta; c.lineWidth = G.real + (o.grueso ? 0.5 : 0); c.stroke();
    // Vástago y volante
    c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 12); c.moveTo(x - 5, y - 12); c.lineTo(x + 5, y - 12); c.stroke();
    c.restore();
    return [x - s, y - 14, 2 * s, 14 + s];
  };

  // Tabique vertical de mundo (x, y0 → y1) con un orificio [ya, yb]: dos
  // tramos de materia; el orificio cerrado se dibuja como estado futuro
  // (discontinuo) para que se vea dónde se abrirá.
  P.termoTabique = function (x, y0, y1, ya, yb, abierto, o = {}) {
    const w = G.materia + (o.grueso ? 0.5 : 0);
    if (yb > ya) {
      this.linea([[x, y0], [x, ya]], { grosor: w, extremo: 'butt' });
      this.linea([[x, yb], [x, y1]], { grosor: w, extremo: 'butt' });
      if (!abierto) this.linea([[x, ya], [x, yb]], { grosor: G.previsto, patron: 'previsto', color: 'texto-3', extremo: 'butt' });
    } else this.linea([[x, y0], [x, y1]], { grosor: w });
  };

  // Moléculas de varias especies en pantalla: [x, y, especie] px. La materia
  // no tiene color: las especies se distinguen por la forma (disco lleno,
  // anillo, anillo con punto) y por el tamaño. o.marcada: índice con traza.
  P.termoMoleculasPx = function (lista, radios) {
    const c = this.ctx, col = this.t['texto-2'];
    c.save(); c.setLineDash([]);
    for (let e = 0; e < radios.length; e++) {
      const r = radios[e], estilo = e % 3;
      c.beginPath();
      for (const [x, y, s] of lista) if (s === e) { c.moveTo(x + r, y); c.arc(x, y, r, 0, 2 * Math.PI); }
      if (estilo === 0) { c.fillStyle = col; c.fill(); }
      else { c.fillStyle = this.t.lienzo; c.fill(); c.strokeStyle = col; c.lineWidth = 1.25; c.stroke(); }
      if (estilo === 2) { c.fillStyle = col; c.beginPath(); for (const [x, y, s] of lista) if (s === e) { c.moveTo(x + 1, y); c.arc(x, y, 1, 0, 2 * Math.PI); } c.fill(); }
    }
    c.restore();
  };
  // Muestra de una especie para leyendas (la misma forma que en el lienzo)
  P.termoMuestraEspecie = function (x, y, e, r) {
    this.termoMoleculasPx([[x, y, e]], Array.from({ length: e + 1 }, (_, i) => (i === e ? r : 0)));
  };

  // Flecha de trabajo en pantalla: el trabajo es energía en tránsito, sin
  // quien la guarde: tinta discontinua (docs/04 §3.2), con su etiqueta W.
  P.termoFlechaTrabajo = function (x1, y1, x2, y2, etiqueta) {
    this.flechaPx(x1, y1, x2, y2, { color: 'tinta', grosor: G.vector, patron: 'previsto' });
    if (etiqueta) this.compuesto(etiqueta, x2 + (x2 >= x1 ? 6 : -6), y2 - 6, { alinear: x2 >= x1 ? 'left' : 'right' });
  };

  // Globo aerostático: envoltura (circunferencia con faldón abierto abajo),
  // cuerdas, cesta y quemador. (cx, yCesta) de mundo; R radio de la envoltura.
  P.termoGlobo = function (cx, yCesta, R, o = {}) {
    const v = this.vista, w = G.materia + (o.grueso ? 0.5 : 0), yc = yCesta + 0.9 * R + R * 1.05;
    const [X, Y] = v.P([cx, yc]), r = R * v.escala, c = this.ctx;
    const a0 = Math.PI * 0.5 + 0.55, a1 = Math.PI * 0.5 - 0.55;           // faldón abierto abajo
    c.save(); c.setLineDash([]);
    c.beginPath(); c.arc(X, Y, r, a0, a1 + 2 * Math.PI, false);
    c.fillStyle = this.t.lienzo; c.fill();
    c.strokeStyle = this.t.tinta; c.lineWidth = w; c.stroke(); c.restore();
    const izq = [X + r * Math.cos(a0), Y + r * Math.sin(a0)], der = [X + r * Math.cos(a1), Y + r * Math.sin(a1)];
    const cesta = v.P([cx, yCesta]), ac = Math.max(6, 0.22 * R * v.escala), hc = Math.max(5, 0.16 * R * v.escala);
    this.lineaPx([izq, [cesta[0] - ac, cesta[1] - hc]], { color: 'texto-2', grosor: 1 });
    this.lineaPx([der, [cesta[0] + ac, cesta[1] - hc]], { color: 'texto-2', grosor: 1 });
    this.lineaPx([[cesta[0] - ac, cesta[1] - hc], [cesta[0] + ac, cesta[1] - hc], [cesta[0] + ac * 0.85, cesta[1]], [cesta[0] - ac * 0.85, cesta[1]]], { grosor: w, cerrar: true });
    return { centro: [X, Y], r, boca: [(izq[0] + der[0]) / 2, (izq[1] + der[1]) / 2], cesta, caja: [X - r, Y - r, 2 * r, cesta[1] - Y + r] };
  };

  // Burbuja de gas en pantalla: contorno de materia y lleno de lienzo
  P.termoBurbuja = function (x, y, r, o = {}) {
    const c = this.ctx; c.save(); c.setLineDash([]);
    c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI); c.fillStyle = this.t.lienzo; c.fill();
    c.strokeStyle = this.t.tinta; c.lineWidth = G.real + (o.grueso ? 0.5 : 0); c.stroke(); c.restore();
  };

  // Cuerpo térmico: cuerpo rígido con su nombre dentro (si cabe). o.fundido:
  // fracción ya fundida, que se dibuja como fluido en la parte baja.
  P.termoCuerpo = function (x0, y0, x1, y1, o = {}) {
    const [X, Y, W, H] = this.bloque(x0, y0, x1, y1, { grueso: o.grueso, centroMasa: false });
    if (o.fundido > 0.002) {
      const h = H * Math.min(1, o.fundido);
      const c = this.ctx; c.save(); c.globalAlpha = 0.06; c.fillStyle = this.t.tinta; c.fillRect(X + 1, Y + H - h, W - 2, h - 1); c.restore();
      this.lineaPx([[X + 1, Y + H - h + 0.5], [X + W - 1, Y + H - h + 0.5]], { color: 'texto-3', grosor: 1, extremo: 'butt' });
    }
    if (o.nombre && W > 46 && H > 18) this.texto(o.nombre, X + W / 2, Y + H / 2 + 4, { tam: 11.5, color: 'texto-2', alinear: 'center' });
    return [X, Y, W, H];
  };

  // Vaso de calorímetro: pared adiabática abierta arriba (el aislante del
  // calorímetro) con el vaso conductor por dentro.
  P.termoVaso = function (x0, y0, x1, y1, o = {}) {
    return this.termoCaja(x0, y0, x1, y1, { tipo: 'adiabatica', sinTecho: true, grueso: o.grueso });
  };

  global.Volta.Termo = { GT, crearMoleculas, posicionesMoleculas, desplazar };
})(window);
