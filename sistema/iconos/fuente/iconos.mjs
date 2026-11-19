// Volta — fuente única de los iconos.
//
// Contrato: docs/04_lenguaje_de_diseno.md, secciones 1, 6 y 7.
// - Rejilla de 20 × 20 con 2 px de margen (zona viva 2..18); los emblemas de
//   módulo (m-*) usan 40 × 40 con 4 px de margen (zona viva 4..36).
// - Trazo de 1.5 (1.75 en emblemas), currentColor, extremos y uniones
//   redondeados, sin relleno. Solo van llenos los puntos (partículas y nodos,
//   radio 2) y lo que la gramática del lienzo pinta "lleno de tinta": carga
//   positiva, polo N, punta de vector. Los glifos interiores de esos rellenos
//   son huecos reales (fill-rule evenodd), así el icono sirve sobre cualquier
//   fondo.
// - Los iconos de objetos son el dibujo del lienzo en miniatura (sección 7.3).
//
// Cada icono es una cadena con el marcado SVG interior (sin la etiqueta <svg>).
// Los atributos de trazo comunes los pone construir.mjs en la raíz.

// ————————————————————————————————————————————————————————————————
// Utilidades de dibujo
// ————————————————————————————————————————————————————————————————

/** Redondea a centésimas y lo escribe sin ceros sobrantes. */
const n = (v) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

const camino = (d, extra = '') => `<path d="${d}"${extra}/>`;
const circulo = (cx, cy, r, extra = '') =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"${extra}/>`;
const rect = (x, y, w, h, rx = 0, extra = '') =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${rx ? ` rx="${n(rx)}"` : ''}${extra}/>`;
const elipse = (cx, cy, rx, ry, extra = '') =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}"${extra}/>`;

const LLENO = ' fill="currentColor"';

/** Punto lleno: partícula o nodo (radio 2 en la rejilla de 20). */
const punto = (x, y, r = 2) => circulo(x, y, r, ' fill="currentColor" stroke="none"');

/** Marca de un solo trazo (el punto de la i, el centro de un pivote). */
const marca = (x, y) => camino(`M${n(x)} ${n(y)}h.01`);

// Patrones de trazo (sección 7.2) reducidos a la escala del icono. Con extremos redondos el
// guion visible mide el valor más un grosor y el hueco, el valor menos un grosor:
// discontinuo = guion de 3.75 y hueco de 2 (la proporción 6 · 4 del lienzo).
const DISCONTINUO = ' stroke-dasharray="2.25 3.5"'; // previsto, bordes de región
const PUNTEADO = ' stroke-dasharray="0 3"'; // auxiliar
const EJE = ' stroke-dasharray="4 3 0 3"'; // eje de simetría: raya y punto
const EJE_40 = ' stroke-dasharray="7 3.75 0 3.75"'; // eje en los emblemas (rejilla de 40)

/** Punto de una circunferencia; ángulo en grados, 0 = +x, 90 = abajo. */
const pol = (cx, cy, r, a) => [
  cx + r * Math.cos((a * Math.PI) / 180),
  cy + r * Math.sin((a * Math.PI) / 180),
];

/** Arco de circunferencia de a0 a a1 (grados; a1 > a0 = sentido horario). */
function arco(cx, cy, r, a0, a1, mover = true) {
  const [x0, y0] = pol(cx, cy, r, a0);
  const [x1, y1] = pol(cx, cy, r, a1);
  const grande = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const barrido = a1 > a0 ? 1 : 0;
  return `${mover ? `M${n(x0)} ${n(y0)}` : ''}A${n(r)} ${n(r)} 0 ${grande} ${barrido} ${n(x1)} ${n(y1)}`;
}

/** Arco de circunferencia que pasa por tres puntos (inicio, intermedio, final). */
function arcoPor(x0, y0, xm, ym, x1, y1, mover = true) {
  const d = 2 * (x0 * (ym - y1) + xm * (y1 - y0) + x1 * (y0 - ym));
  const s0 = x0 * x0 + y0 * y0;
  const sm = xm * xm + ym * ym;
  const s1 = x1 * x1 + y1 * y1;
  const ux = (s0 * (ym - y1) + sm * (y1 - y0) + s1 * (y0 - ym)) / d;
  const uy = (s0 * (x1 - xm) + sm * (x0 - x1) + s1 * (xm - x0)) / d;
  const r = Math.hypot(x0 - ux, y0 - uy);
  // En pantalla (y hacia abajo), producto cruz positivo = giro horario = barrido 1.
  const cruz = (xm - x0) * (y1 - ym) - (ym - y0) * (x1 - xm);
  const lado = (a, b) => (x1 - x0) * (b - y0) - (y1 - y0) * (a - x0);
  const grande = Math.sign(lado(ux, uy)) === Math.sign(lado(xm, ym)) ? 1 : 0;
  return `${mover ? `M${n(x0)} ${n(y0)}` : ''}A${n(r)} ${n(r)} 0 ${grande} ${cruz > 0 ? 1 : 0} ${n(x1)} ${n(y1)}`;
}

/** Polilínea (o polígono si cerrar) a partir de pares [x, y]. */
const poli = (pts, cerrar = false) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join('') + (cerrar ? 'Z' : '');

/**
 * Punta llena de vector (sección 7.2: triángulo lleno, más largo que ancho).
 * (xt, yt) es la punta visible; el vértice geométrico se retrasa medio trazo
 * porque la unión redondeada lo hace crecer.
 */
function punta(xt, yt, ux, uy, { largo = 3, ancho = 2.5, g = 1.5 } = {}) {
  const vx = xt - ux * (g / 2);
  const vy = yt - uy * (g / 2);
  const bx = vx - ux * largo;
  const by = vy - uy * largo;
  const h = ancho / 2;
  const nx = -uy;
  const ny = ux;
  return camino(
    `M${n(vx)} ${n(vy)}L${n(bx + nx * h)} ${n(by + ny * h)}L${n(bx - nx * h)} ${n(by - ny * h)}Z`,
    LLENO,
  );
}

/** Vector de magnitud física: línea más punta llena en (x2, y2). */
function vector(x1, y1, x2, y2, opc = {}) {
  const { largo = 3, g = 1.5 } = opc;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L = Math.hypot(dx, dy);
  const ux = dx / L;
  const uy = dy / L;
  const fin = L - g / 2 - largo + 0.4; // la línea muere dentro de la punta
  return (
    camino(`M${n(x1)} ${n(y1)}L${n(x1 + ux * fin)} ${n(y1 + uy * fin)}`) + punta(x2, y2, ux, uy, opc)
  );
}

/** Punta llena centrada en (x, y): flecha a mitad de un rayo o de una corriente. */
function puntaMedia(x, y, ux, uy, opc = {}) {
  const { largo = 3, g = 1.5 } = opc;
  const avance = largo / 2 + g / 2;
  return punta(x + ux * avance, y + uy * avance, ux, uy, opc);
}

/** Punta abierta de dos trazos (cotas, ejes y flechas de interfaz). */
function puntaAbierta(x, y, ux, uy, l = 2.25) {
  const nx = -uy;
  const ny = ux;
  const ax = x - ux * l + nx * l;
  const ay = y - uy * l + ny * l;
  const bx = x - ux * l - nx * l;
  const by = y - uy * l - ny * l;
  return `M${n(ax)} ${n(ay)}L${n(x)} ${n(y)}L${n(bx)} ${n(by)}`;
}

/** Rayado: trazos paralelos que salen de cada punto con el desplazamiento (dx, dy). */
const rayas = (puntos, dx, dy) =>
  puntos.map(([x, y]) => `M${n(x)} ${n(y)}l${n(dx)} ${n(dy)}`).join('');

/**
 * Zigzag del resorte (sección 7.3): tramos rectos en los extremos y dientes
 * empinados. `medias` = número de vértices (dos por diente).
 */
function zigzag(x1, y1, x2, y2, { medias = 4, amp = 2.5, recto = 2 } = {}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L = Math.hypot(dx, dy);
  const ux = dx / L;
  const uy = dy / L;
  const nx = -uy;
  const ny = ux;
  const largo = L - 2 * recto;
  const pts = [
    [x1, y1],
    [x1 + ux * recto, y1 + uy * recto],
  ];
  for (let k = 0; k < medias; k++) {
    const s = recto + ((k + 0.5) * largo) / medias;
    const lado = k % 2 === 0 ? -1 : 1;
    pts.push([x1 + ux * s + nx * amp * lado, y1 + uy * s + ny * amp * lado]);
  }
  pts.push([x2 - ux * recto, y2 - uy * recto], [x2, y2]);
  return poli(pts);
}

/** Onda horizontal hecha de medios arcos elípticos (sinusoide de dibujo técnico). */
function onda(x1, y, x2, medias, amp, arribaPrimero = true, mover = true) {
  const w = (x2 - x1) / medias;
  let d = mover ? `M${n(x1)} ${n(y)}` : '';
  for (let k = 0; k < medias; k++) {
    const arriba = (k % 2 === 0) === arribaPrimero;
    d += `a${n(w / 2)} ${n(amp)} 0 0 ${arriba ? 1 : 0} ${n(w)} 0`;
  }
  return d;
}

/** Onda vertical que sube de y1 a y2 (y2 < y1): calor, fotón vertical. */
function ondaV(x, y1, y2, medias, amp, derechaPrimero = true) {
  const h = (y1 - y2) / medias;
  let d = `M${n(x)} ${n(y1)}`;
  for (let k = 0; k < medias; k++) {
    const der = (k % 2 === 0) === derechaPrimero;
    d += `a${n(amp)} ${n(h / 2)} 0 0 ${der ? 0 : 1} 0 ${n(-h)}`;
  }
  return d;
}

/** Signos físicos dibujados con trazo. */
const signoMas = (cx, cy, a) =>
  camino(`M${n(cx - a)} ${n(cy)}h${n(2 * a)}M${n(cx)} ${n(cy - a)}v${n(2 * a)}`);
const signoMenos = (cx, cy, a) => camino(`M${n(cx - a)} ${n(cy)}h${n(2 * a)}`);
const signoPor = (cx, cy, a) =>
  camino(`M${n(cx - a)} ${n(cy - a)}l${n(2 * a)} ${n(2 * a)}M${n(cx + a)} ${n(cy - a)}l${n(-2 * a)} ${n(2 * a)}`);

/** Glifo V con trazo, en la caja (x, y, w, h). */
const glifoV = (x, y, w, h) => `M${n(x)} ${n(y)}L${n(x + w / 2)} ${n(y + h)}L${n(x + w)} ${n(y)}`;

/** Glifo A con trazo. */
function glifoA(x, y, w, h) {
  const yb = Math.round((y + h * 0.66) * 2) / 2; // travesaño nítido
  const dx = (w / 2) * ((yb - y) / h);
  return `M${n(x)} ${n(y + h)}L${n(x + w / 2)} ${n(y)}L${n(x + w)} ${n(y + h)}M${n(x + dx + 0.15)} ${n(yb)}H${n(x + w - dx - 0.15)}`;
}

/** Glifo S con trazo: dos medias elipses encadenadas. */
function glifoS(x, y, w, h) {
  const rx = w / 2;
  const ry = h / 4;
  return (
    `M${n(x + w)} ${n(y + ry)}A${n(rx)} ${n(ry)} 0 1 0 ${n(x + rx)} ${n(y + 2 * ry)}` +
    `A${n(rx)} ${n(ry)} 0 1 1 ${n(x)} ${n(y + 3 * ry)}`
  );
}

/** Contorno poligonal de una N (para recortarla de un relleno). */
function contornoN(x, y, w, h, t) {
  const d = t * 1.15; // ancho horizontal de la diagonal, algo mayor que el de los astiles
  const s4 = (w - t - d) / (w - d);
  const s9 = t / (w - d);
  return poli(
    [
      [x, y + h],
      [x, y],
      [x + d, y],
      [x + w - t, y + h * s4],
      [x + w - t, y],
      [x + w, y],
      [x + w, y + h],
      [x + w - d, y + h],
      [x + t, y + h * s9],
      [x + t, y + h],
    ],
    true,
  );
}

/** Contorno de un círculo como subtrayecto (para combinar con evenodd). */
const contornoCirculo = (cx, cy, r) =>
  `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`;

/** Contorno de un signo + de brazos redondeados (semilongitud a, semigrosor t). */
function contornoMas(cx, cy, a, t = 0.75) {
  const e = a - t;
  return (
    `M${n(cx - t)} ${n(cy - e)}a${n(t)} ${n(t)} 0 0 1 ${n(2 * t)} 0V${n(cy - t)}H${n(cx + e)}` +
    `a${n(t)} ${n(t)} 0 0 1 0 ${n(2 * t)}H${n(cx + t)}V${n(cy + e)}` +
    `a${n(t)} ${n(t)} 0 0 1 ${n(-2 * t)} 0V${n(cy + t)}H${n(cx - e)}` +
    `a${n(t)} ${n(t)} 0 0 1 0 ${n(-2 * t)}H${n(cx - t)}Z`
  );
}

const RELLENO_HUECO = ' fill="currentColor" stroke="none" fill-rule="evenodd"';

/**
 * Carga positiva (sección 7.3): disco lleno de tinta con el + como hueco.
 * R es el radio exterior visible (igual al de un círculo de trazo r = R − g/2).
 */
const cargaPositiva = (cx, cy, R, a = R * 0.52, t = 0.75) =>
  camino(contornoCirculo(cx, cy, R) + contornoMas(cx, cy, a, t), RELLENO_HUECO);

/** Carga negativa: disco vacío con contorno y el − en tinta. */
const cargaNegativa = (cx, cy, R, a = R * 0.52, g = 1.5) =>
  circulo(cx, cy, R - g / 2) + signoMenos(cx, cy, a - g / 2);

/** Centro de masa ⊕ (cuerpo rígido). */
const centroMasa = (cx, cy, r = 2.5) =>
  circulo(cx, cy, r) + camino(`M${n(cx - r)} ${n(cy)}h${n(2 * r)}M${n(cx)} ${n(cy - r)}v${n(2 * r)}`);

/** Superficie fija horizontal: línea y tres rayas a 45° hacia abajo. */
const suelo = (x1, x2, y, paso = 5, prof = 4) => {
  const xs = [x2, x2 - paso, x2 - 2 * paso];
  return camino(`M${n(x1)} ${n(y)}H${n(x2)}` + rayas(xs.map((x) => [x, y]), -prof, prof));
};

// ————————————————————————————————————————————————————————————————
// Interfaz (i-)
// ————————————————————————————————————————————————————————————————

/** Engrane de dientes rectos con arcos en la cabeza y en el pie. */
function engrane(cx, cy, rExt, rInt, dientes, medioDiente, medioBase) {
  const paso = 360 / dientes;
  let d = '';
  for (let k = 0; k < dientes; k++) {
    const a = -90 + k * paso;
    const [x1, y1] = pol(cx, cy, rInt, a - medioBase);
    const [x2, y2] = pol(cx, cy, rExt, a - medioDiente);
    const [x3, y3] = pol(cx, cy, rExt, a + medioDiente);
    const [x4, y4] = pol(cx, cy, rInt, a + medioBase);
    const [x5, y5] = pol(cx, cy, rInt, a + paso - medioBase);
    d +=
      (k === 0 ? `M${n(x1)} ${n(y1)}` : '') +
      `L${n(x2)} ${n(y2)}A${n(rExt)} ${n(rExt)} 0 0 1 ${n(x3)} ${n(y3)}` +
      `L${n(x4)} ${n(y4)}A${n(rInt)} ${n(rInt)} 0 0 1 ${n(x5)} ${n(y5)}`;
  }
  return d + 'Z';
}

function estrella(cx, cy, R, r) {
  const pts = [];
  for (let k = 0; k < 10; k++) pts.push(pol(cx, cy, k % 2 ? r : R, -90 + k * 36));
  return poli(pts, true);
}

const rayosSol = (() => {
  let d = '';
  for (let k = 0; k < 8; k++) {
    const [x1, y1] = pol(10, 10, 5.5, k * 45);
    const [x2, y2] = pol(10, 10, 7.25, k * 45);
    d += `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`;
  }
  return d;
})();

// Lupa común a buscar, zoom-mas y zoom-menos.
const lupa = circulo(8.5, 8.5, 5.5) + camino('M12.5 12.5l4 4');

// Flecha circular antihoraria (reiniciar, historial).
const flechaCircular = camino('M4 10a6 6 0 1 0 1.76-4.24L4 7.5M4 4v3.5h3.5');

const interfaz = {
  'i-reproducir': camino('M6.5 4.5v11L15.5 10z'),
  'i-pausar': rect(5.5, 4.5, 3, 11, 0.75) + rect(11.5, 4.5, 3, 11, 0.75),
  'i-paso-adelante': camino('M4.5 5v10l7-5zM15 5v10'),
  'i-paso-atras': camino('M15.5 5v10l-7-5zM5 5v10'),
  'i-reiniciar': flechaCircular,
  'i-inicio': camino('M3 10l7-7 7 7M5 8v8.5a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V8M8.5 17v-4.5h3V17'),
  'i-deshacer': camino('M7 11.5L3.5 8 7 4.5M3.5 8H12a4.25 4.25 0 0 1 0 8.5H9'),
  'i-rehacer': camino('M13 11.5L16.5 8 13 4.5M16.5 8H8a4.25 4.25 0 0 0 0 8.5h3'),
  'i-buscar': lupa,
  'i-mas': camino('M10 4v12M4 10h12'),
  'i-menos': camino('M4 10h12'),
  'i-cerrar': camino('M5 5l10 10M15 5L5 15'),
  'i-menu': camino('M3 5h14M3 10h14M3 15h14'),
  'i-ajustes': camino(engrane(10, 10, 7.25, 5.25, 8, 10, 15)) + circulo(10, 10, 2.25),
  'i-capas': camino('M10 3l7 3.5-7 3.5-7-3.5zM3 10l7 3.5 7-3.5M3 13.5l7 3.5 7-3.5'),
  'i-ojo': camino('M3 10a8 8 0 0 1 14 0a8 8 0 0 1-14 0z') + circulo(10, 10, 2.5),
  'i-ojo-tachado':
    camino('M3 10a8 8 0 0 1 14 0a8 8 0 0 1-14 0z') + circulo(10, 10, 2.5) + camino('M4 3.5l12 13'),
  'i-candado': rect(4.5, 9, 11, 8, 1.5) + camino('M7 9V6.5a3 3 0 0 1 6 0V9M10 12.25v1.5'),
  'i-candado-abierto': rect(4.5, 9, 11, 8, 1.5) + camino('M7 9V6a3 3 0 0 1 6 0M10 12.25v1.5'),
  'i-duplicar':
    camino('M8 12H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v4') +
    rect(8, 8, 9, 9, 1) +
    camino('M12.5 10.5v4M10.5 12.5h4'),
  'i-borrar': camino(
    'M3.5 5.5h13M8 5.5v-2h4v2M5.5 5.5V16a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5.5M8.5 8.5v5.5M11.5 8.5v5.5',
  ),
  'i-mover': camino(
    'M10 3v14M3 10h14M7.75 5.25L10 3l2.25 2.25M7.75 14.75L10 17l2.25-2.25M5.25 7.75L3 10l2.25 2.25M14.75 7.75L17 10l-2.25 2.25',
  ),
  // Giro alrededor de un pivote: arco de 300° con punta abierta y el pivote del lienzo (aro con centro).
  'i-rotar': (() => {
    const [x, y] = pol(10, 10.5, 6.5, 240);
    return (
      camino(arco(10, 10.5, 6.5, -60, 240) + puntaAbierta(x, y, 0.87, -0.5, 2.25)) +
      circulo(10, 10.5, 1.75) +
      marca(10, 10.5)
    );
  })(),
  'i-zoom-mas': lupa + camino('M8.5 6.25v4.5M6.25 8.5h4.5'),
  'i-zoom-menos': lupa + camino('M6.25 8.5h4.5'),
  'i-encuadrar':
    camino(
      'M3 7V4a1 1 0 0 1 1-1h3M13 3h3a1 1 0 0 1 1 1v3M17 13v3a1 1 0 0 1-1 1h-3M7 17H4a1 1 0 0 1-1-1v-3',
    ) + rect(7, 7, 6, 6, 0.5),
  'i-cuadricula': rect(3, 3, 14, 14, 1.5) + camino('M7.5 3v14M12.5 3v14M3 7.5h14M3 12.5h14'),
  'i-ajuste-iman': camino(
    'M3.5 3.5v6.5a6.5 6.5 0 0 0 13 0V3.5M7.5 3.5v6.5a2.5 2.5 0 0 0 5 0V3.5M3.5 3.5h4M12.5 3.5h4M3.5 7h4M12.5 7h4',
  ),
  'i-grafica': camino('M3.5 3v13.5H17M6.5 13l3-3 2.5 2.5L16.5 8'),
  'i-tabla': rect(3, 4, 14, 12, 1.5) + camino('M3 8h14M3 12h14M8 4v12'),
  'i-energia': camino('M5 16.5V11M10 16.5V4M15 16.5V8'),
  'i-evento': camino('M10 5.5l4.5 4.5-4.5 4.5-4.5-4.5zM3 10h2.5M14.5 10H17'),
  'i-archivo': camino('M11 3H5.5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V7.5zM11 3v4.5h4.5'),
  'i-carpeta': camino('M3 5a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z'),
  'i-guardar': camino(
    'M4 3h9.5L17 6.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM6.5 3v3.5h6V3M6 17v-5h8v5',
  ),
  'i-exportar': camino('M3.5 12.5V16a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3.5M10 13V3.5M6.5 7L10 3.5 13.5 7'),
  'i-imagen': rect(3, 4, 14, 12, 1.5) + camino('M3 14l4-4 4 4 2-2 4 4') + circulo(12.75, 7.75, 1.25),
  'i-video': rect(3, 5, 10, 10, 1.5) + camino('M13 8.5l4-2.5v8l-4-2.5'),
  'i-variable': camino('M3 10h3M10 10h7M3 7.5v5M17 7.5v5') + circulo(8, 10, 2),
  'i-enlazar': camino('M8.5 6.5h-2a3.5 3.5 0 0 0 0 7h2M11.5 6.5h2a3.5 3.5 0 0 1 0 7h-2M7 10h6'),
  'i-expresion': camino('M3 11h2l2.5 5L12 3.5h5'),
  'i-info': circulo(10, 10, 7) + camino('M10 9v4.5') + marca(10, 6.5),
  'i-aviso': camino('M10 3.5l7 12.5H3z') + camino('M10 8v3.5') + marca(10, 13.75),
  'i-error': camino('M7.1 3h5.8L17 7.1v5.8L12.9 17H7.1L3 12.9V7.1z') + camino('M10 6.5v4') + marca(10, 13.25),
  'i-ayuda': circulo(10, 10, 7) + camino('M7.75 8a2.25 2.25 0 1 1 2.25 2.25v1.25') + marca(10, 14),
  'i-check': camino('M4 10.5l3.5 3.5L16 5.5'),
  'i-chevron-abajo': camino('M6 8l4 4 4-4'),
  'i-chevron-arriba': camino('M6 12l4-4 4 4'),
  'i-chevron-izquierda': camino('M12 6l-4 4 4 4'),
  'i-chevron-derecha': camino('M8 6l4 4-4 4'),
  'i-flecha-derecha': camino('M3.5 10h13M12 5.5l4.5 4.5-4.5 4.5'),
  'i-asa': camino('M7.5 12.5l5-5') + rect(3, 12.5, 4.5, 4.5) + rect(12.5, 3, 4.5, 4.5),
  'i-tema-claro': circulo(10, 10, 3) + camino(rayosSol),
  'i-tema-oscuro': camino('M9.48 3.52A6.5 6.5 0 1 0 16.48 10.52A5 5 0 0 1 9.48 3.52z'),
  'i-pantalla-completa': camino('M12 3h5v5M17 3l-5 5M8 17H3v-5M3 17l5-5'),
  'i-panel-izquierdo': rect(3, 4, 14, 12, 1.5) + camino('M7.5 4v12'),
  'i-panel-derecho': rect(3, 4, 14, 12, 1.5) + camino('M12.5 4v12'),
  'i-panel-inferior': rect(3, 4, 14, 12, 1.5) + camino('M3 11.5h14'),
  'i-filtro': camino('M3 5.5h14M5.5 10h9M8 14.5h4'),
  'i-estrella': camino(estrella(10, 10.75, 7.5, 3.25)),
  'i-historial': flechaCircular + camino('M10 7v3l2 2'),
  'i-rama': camino('M6 4.5v11M6 12.5h4a4 4 0 0 0 4-4v-4') + punto(6, 4.5) + punto(6, 15.5) + punto(14, 4.5),
  'i-precision': circulo(10, 10, 5.5) + camino('M10 2.75v3.5M10 13.75v3.5M2.75 10h3.5M13.75 10h3.5'),
  'i-velocidad-sim': camino('M3 5.5v9L9.5 10zM10.5 5.5v9L17 10z'),
  'i-copiar':
    rect(7, 7, 10, 10, 1.5) +
    camino('M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-7A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13H7'),
  'i-nota': camino(
    'M4 3h12a1 1 0 0 1 1 1v8.5L12.5 17H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM17 12.5h-3.5a1 1 0 0 0-1 1V17M6.5 7h7M6.5 10h4',
  ),
  'i-etiqueta': camino('M3 4.5v5L10.5 17 17 10.5 9.5 3H4.5A1.5 1.5 0 0 0 3 4.5z') + circulo(6.75, 6.75, 1.25),
  'i-tutorial': camino(
    'M3 4.5h4a3 3 0 0 1 3 3v9a2 2 0 0 0-2-2H3zM17 4.5h-4a3 3 0 0 0-3 3v9a2 2 0 0 1 2-2h5z',
  ),
  'i-ejemplo': camino(
    'M7 3h6M8 3v4.5L3.5 12v3.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V12L12 7.5V3M3.5 12.5h13',
  ),
  'i-mext':
    rect(4, 3, 12, 14, 1.5) +
    camino('M6.5 7.25l1.25 1.25 2.25-2.25M11.5 7.5h2M6.5 12.25l1.25 1.25 2.25-2.25M11.5 12.5h2'),
  // Escena: el lienzo como documento, con una trayectoria prevista y su partícula.
  'i-escena':
    rect(3, 4, 14, 12, 1.5) +
    camino('M5.75 13.25a4.25 4.25 0 0 1 7.2-3.1', DISCONTINUO) +
    punto(13.5, 11.75),
};

// ————————————————————————————————————————————————————————————————
// Objetos (o-) — por módulo
// ————————————————————————————————————————————————————————————————

/** Punto en un sistema local: origen o, dirección a lo largo u y a lo ancho v. */
const enEjes = (o, u, v) => (a, b) => [o[0] + u[0] * a + v[0] * b, o[1] + u[1] * a + v[1] * b];
const U45 = [Math.SQRT1_2, -Math.SQRT1_2]; // a 45°, hacia arriba a la derecha
const V45 = [Math.SQRT1_2, Math.SQRT1_2]; // perpendicular

// Barra uniforme: rectángulo esbelto a 45°.
const barraInclinada = (() => {
  const p = enEjes([10, 10], U45, V45);
  return poli([p(7.25, 1.75), p(7.25, -1.75), p(-7.25, -1.75), p(-7.25, 1.75)], true);
})();

// Lanzador: tubo a 45° y la trayectoria prevista que sale de la boca.
const tuboLanzador = (() => {
  const p = enEjes([4.25, 15], U45, V45);
  return poli([p(0, 1.75), p(7, 1.75), p(7, -1.75), p(0, -1.75)], true);
})();

/** Tres radios de un arco (traviesas de la pista, marcas del transportador). */
const radios = (cx, cy, r1, r2, angulos) =>
  angulos
    .map((a) => {
      const [x1, y1] = pol(cx, cy, r1, a);
      const [x2, y2] = pol(cx, cy, r2, a);
      return `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`;
    })
    .join('');

/** Punta llena al final de un arco de circunferencia recorrido de a0 a a1. */
function puntaDeArco(cx, cy, r, a1, sentido, opc = {}) {
  const [x, y] = pol(cx, cy, r, a1);
  const t = (a1 * Math.PI) / 180;
  // tangente: horaria (−sin, cos), antihoraria (sin, −cos)
  const ux = sentido > 0 ? -Math.sin(t) : Math.sin(t);
  const uy = sentido > 0 ? Math.cos(t) : -Math.cos(t);
  const avance = opc.avance ?? 2;
  return punta(x + ux * avance, y + uy * avance, ux, uy, opc);
}

const mecanica = {
  // Partícula: el punto de tinta en su trayectoria; recorrida continua, prevista discontinua.
  // (los dos guiones se colocan a mano para que no se peguen al punto)
  'o-particula':
    camino(arco(10, 16, 7, 200, 252)) +
    camino(arco(10, 16, 7, 305, 316) + arco(10, 16, 7, 341, 352)) +
    punto(10, 9),
  // Cuerpos rígidos: contorno de materia y centro de masa ⊕.
  'o-bloque': rect(3.5, 4.5, 13, 11) + centroMasa(10, 10),
  'o-disco': circulo(10, 10, 7) + centroMasa(10, 10),
  'o-barra': camino(barraInclinada),
  'o-poligono':
    camino(poli([[3.5, 12.5], [6.5, 4], [14.5, 3.5], [16.5, 11], [10, 16.5]], true)) +
    centroMasa(10, 10, 2.25),
  // Movimiento prescrito: el cuerpo y su avance previsto (discontinuo, con punta abierta).
  'o-movimiento-prescrito': rect(3, 6.5, 7, 7) + camino('M12.25 10h.75M15 10h2' + puntaAbierta(17, 10, 1, 0, 2.25)),
  // Superficies fijas: línea de materia y tres rayas a 45° del lado sólido.
  'o-suelo': suelo(3, 17, 8),
  'o-pared': camino('M8 3v14' + rayas([[8, 7], [8, 12], [8, 17]], 4, -4)),
  'o-plano-inclinado': camino('M3 15.5h14V7.5z') + camino(arco(3, 15.5, 6, -29.74, 0)),
  // Arco: hemisferio; el rayado queda dentro, del lado sólido.
  'o-arco': camino(
    'M3 13.5h14' + arco(10, 13.5, 7, 180, 360) + rayas([pol(10, 13.5, 7, -30), pol(10, 13.5, 7, -70), pol(10, 13.5, 7, -110)], -3, 3),
  ),
  // Curva y = f(x): rampa que se vuelve horizontal, con el rayado del lado sólido.
  'o-curva': camino('M3 4a9 9 0 0 0 9 9h5' + rayas([pol(12, 4, 9, 110), [13, 13], [17, 13]], -3, 3)),
  // Trazo libre: curva editable con sus asas (cuadrados) y un nodo intermedio.
  'o-trazo-libre':
    camino('M6 14.5a5 5 0 0 1 4-4.5a5 5 0 0 0 4-4.5') + rect(3, 13, 3, 3) + rect(14, 4, 3, 3) + punto(10, 10),
  // Pista: doble riel con traviesas (el cuerpo no puede despegarse).
  'o-pista': camino(arco(10, 14, 7, 180, 360) + arco(10, 14, 4, 180, 360) + radios(10, 14, 4, 7, [225, 270, 315])),
  // Conectores.
  'o-cuerda': camino('M4 7.5a6.5 6.5 0 0 0 12 0') + punto(4, 7.5) + punto(16, 7.5),
  'o-cuerda-elastica': camino(onda(4, 10, 16, 4, 1.75)) + punto(4, 10) + punto(16, 10),
  'o-resorte': camino(zigzag(3, 10, 17, 10, { medias: 4, amp: 2.5, recto: 2 })),
  'o-amortiguador': camino('M3 10h4M14 6.5H7v7h7M11 8v4M11 10h6'),
  'o-varilla': camino('M6.41 13.59L13.59 6.41') + circulo(5, 15, 2) + circulo(15, 5, 2),
  'o-polea': circulo(10, 9, 5) + punto(10, 9) + camino('M10 9V3M6.5 3h7M5 9v8M15 9v8'),
  // Clavo: péndulo con clavo; la cuerda baja del techo y se dobla sobre el clavo (aro).
  'o-clavo':
    camino('M6 5h7' + rayas([[6.5, 5], [9, 5], [11.5, 5]], 2, -2)) +
    camino(`M9 5V9.5${arco(12, 9.5, 3, 180, 135, false)}L14.25 16`) +
    circulo(12, 9.5, 1.5) +
    punto(14.25, 16),
  // Prensa hidráulica: vasos comunicantes de distinta sección cerrados por émbolos;
  // fuerza pequeña hacia abajo en el estrecho, grande hacia arriba en el ancho.
  'o-prensa-hidraulica':
    camino('M3 10v6.5h14V8.5M7 10v3h3V8.5M3 10h4M10 8.5h7') +
    vector(5, 3.25, 5, 9.25, { largo: 2.25, ancho: 2.25 }) +
    vector(13.5, 7.75, 13.5, 2.75),
  // Articulaciones: apoyo con pivote (triángulo, aro con centro y base rayada) y empotramiento.
  'o-pasador': camino('M10 9.25L6 14M10 9.25L14 14') + circulo(10, 7, 2.25) + marca(10, 7) + suelo(4, 16, 14, 5, 3),
  'o-fijacion': camino('M6 3v14' + rayas([[6, 6], [6, 11], [6, 16]], -3, -3)) + rect(6, 8, 11, 4),
  'o-riel': rect(3, 6.5, 14, 7, 3.5) + punto(7, 10),
  // Actuadores.
  'o-fuerza': punto(4.5, 15.5) + vector(4.5, 15.5, 16, 4),
  'o-motor':
    circulo(10, 10, 2.5) + marca(10, 10) + camino(arco(10, 10, 6.5, 150, 390)) + puntaDeArco(10, 10, 6.5, 390, 1, { avance: 2.5 }),
  // Impulso: el rombo del evento (un instante) y el vector J.
  'o-impulso': camino('M5.5 7.25l2.75 2.75-2.75 2.75L2.75 10z') + vector(8.25, 10, 17, 10),
  'o-lanzador': camino(tuboLanzador) + camino(arco(13.09, 13.94, 5.5, 248, 268) + arco(13.09, 13.94, 5.5, 290, 310)),
  // Campos y regiones.
  'o-gravedad': vector(10, 3, 10, 11) + suelo(4, 16, 13.5, 5, 3),
  'o-fluido': camino('M7.5 4h5L10 6.5z') + camino('M3 7.5h14M5 10.5h4M11 10.5h4M7.5 13.5h5'),
  'o-viento': camino('M3 7.5h8.5a2.25 2.25 0 1 0-2.25-2.25M3 12.5h11.5a2.25 2.25 0 1 1-2.25 2.25M3 10h5'),
  'o-campo-propio':
    vector(3, 6, 9, 6, { largo: 2.5, ancho: 2.25 }) +
    vector(14, 3, 14, 9, { largo: 2.5, ancho: 2.25 }) +
    vector(17, 14, 11, 14, { largo: 2.5, ancho: 2.25 }) +
    vector(6, 17, 6, 11, { largo: 2.5, ancho: 2.25 }),
  'o-marco-movil':
    camino('M5 3.5V15h11.5' + puntaAbierta(5, 3.5, 0, -1, 1.75) + puntaAbierta(16.5, 15, 1, 0, 1.75)) + vector(5, 15, 12, 8),
};

const gravitacion = {
  'o-planeta': circulo(10, 10, 6.75) + camino('M3.25 10a6.75 2.5 0 0 0 13.5 0'),
  // Satélite: órbita prevista (discontinua) alrededor del cuerpo central.
  'o-satelite': circulo(10, 10, 6.5, DISCONTINUO) + circulo(10, 10, 2.5) + punto(14.6, 5.4),
  'o-cuerpo-masivo': circulo(8, 12, 4.75) + centroMasa(8, 12, 2) + vector(11.5, 8.5, 16.5, 3.5),
  'o-nave': camino('M7.5 16.5V8.5L10 3l2.5 5.5v8zM7.5 11.5L5 14v2.5h2.5M12.5 11.5L15 14v2.5h-2.5'),
  'o-atmosfera':
    camino(arco(10, 24, 10, 230, 310)) +
    camino(arco(10, 24, 13, 240, 300), PUNTEADO) +
    camino(arco(10, 24, 16, 246, 294), PUNTEADO),
};

const termodinamica = {
  // Cilindro con su émbolo; las paredes son de materia.
  'o-cilindro': camino('M4.5 3v13a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V3') + rect(4.5, 9.5, 11, 2.5) + camino('M10 9.5V2.75'),
  'o-recipiente': rect(3.5, 6, 13, 11, 1.5) + camino('M8.5 6V3.5h3V6'),
  'o-embolo': rect(3, 9, 14, 3.5, 0.5) + camino('M10 9V3'),
  // Tabique: pared interior doble.
  'o-tabique': rect(3, 4, 14, 12, 1) + camino('M9 4v12M11 4v12'),
  // Válvula: símbolo técnico (dos triángulos opuestos) con su volante.
  'o-valvula': camino('M6 6v8l8-8v8zM3 10h3M14 10h3M10 10V4M7.5 4h5'),
  'o-pesa': camino('M4 16.5V10l2-2h8l2 2v6.5zM8 8V6a2 2 0 0 1 4 0v2'),
  // Calentador: resistencia (IEC) y el calor que sube (ondas).
  'o-calentador':
    rect(5.5, 12.5, 9, 4) +
    camino('M3 14.5h2.5M14.5 14.5H17') +
    camino(ondaV(7, 10, 3, 2, 1) + ondaV(10, 10, 3, 2, 1) + ondaV(13, 10, 3, 2, 1)),
  // Baño térmico: depósito de líquido a temperatura fija, con su termómetro.
  'o-bano-termico':
    camino('M3 6.5v9.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6.5M3 9h7.5M15.5 9H17M5.5 12h3.5M5.5 14.5h2') +
    camino('M11.5 12V4.5a1.5 1.5 0 0 1 3 0V12a2 2 0 1 1-3 0z'),
  // Gas: moléculas como puntos.
  'o-gas': punto(6, 6) + punto(13.5, 5) + punto(9.5, 11) + punto(15, 13.5) + punto(5.5, 15),
  // Columna de líquido: superficie libre, líneas de fluido y la cota de profundidad.
  'o-columna-liquido':
    camino('M4 3v14h6V3M4 6h6M5.5 8.5h3') +
    camino('M11.5 6h4.5M14 6v11' + puntaAbierta(14, 6, 0, -1, 1.75) + puntaAbierta(14, 17, 0, 1, 1.75)),
  // Globo: envoltura con sus gajos, abierta por abajo; cuerdas y barquilla.
  'o-globo':
    camino(arco(10, 8, 5.25, 160, 380) + 'L11.25 13.25M5.07 9.8L8.75 13.25') +
    camino('M10 2.75a2.5 5.25 0 0 0 0 10.5a2.5 5.25 0 0 0 0-10.5') +
    camino('M8.75 13.25L8.5 15M11.25 13.25l.25 1.75') +
    rect(8.5, 15, 3, 2, 0.5),
  'o-caja-molecular': rect(3, 3, 14, 14, 1) + punto(7, 7) + punto(13, 8) + punto(8.5, 12.5) + punto(13.5, 13.5),
  // Bomba: símbolo técnico (círculo con triángulo inscrito).
  'o-bomba': circulo(10, 10, 7) + camino(poli([pol(10, 10, 7, 0), pol(10, 10, 7, 120), pol(10, 10, 7, 240)], true)),
  // Orificio: recipiente con un tabique perforado; una molécula ya pasó.
  'o-orificio': rect(3, 4, 14, 12, 1) + camino('M10 4v4M10 12v4') + punto(6, 7.5) + punto(6.5, 12.75) + punto(13.75, 10),
  // Cuerpo térmico: bloque y el calor que entra (onda con punta).
  'o-cuerpo-termico':
    rect(9.5, 5, 7.5, 10) + camino(onda(2.75, 10, 6.5, 2, 1.25)) + punta(9.25, 10, 1, 0, { largo: 2.5, ancho: 2.5 }),
  // Calorímetro: pared doble (aislante), tapa y agitador.
  'o-calorimetro': camino('M3 6v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6M6 6v8h8V6M3 6h14M10 6V3M8.25 3h3.5'),
};

const electrostatica = {
  // Cargas (sección 7.3): positiva llena con "+" hueco; negativa vacía con "−".
  'o-carga-positiva': cargaPositiva(10, 10, 6.75, 3.5),
  'o-carga-negativa': cargaNegativa(10, 10, 6.75, 3.5),
  'o-esfera-cargada': circulo(10, 10, 7) + signoMas(10, 7, 1.5) + signoMas(7, 12, 1.5) + signoMas(13, 12, 1.5),
  'o-hilo-infinito':
    camino('M5 12.5h10') +
    camino('M2.75 12.5h1M16.25 12.5h1') +
    signoMas(5, 7.5, 1.5) + signoMas(10, 7.5, 1.5) + signoMas(15, 7.5, 1.5),
  'o-segmento-cargado': camino('M5 12.5h10M5 10.75v3.5M15 10.75v3.5') + signoMas(7.5, 7.5, 1.5) + signoMas(12.5, 7.5, 1.5),
  // Anillo: la carga repartida sobre la circunferencia (los signos interrumpen el trazo).
  'o-anillo':
    camino(arco(10, 10, 6, 26, 64) + arco(10, 10, 6, 116, 154) + arco(10, 10, 6, 206, 244) + arco(10, 10, 6, 296, 334)) +
    signoMas(10, 4, 1.25) + signoMas(16, 10, 1.25) + signoMas(10, 16, 1.25) + signoMas(4, 10, 1.25),
  'o-lamina': rect(7, 3, 6, 14, 0.5) + signoMas(10, 6.5, 1.25) + signoMas(10, 10, 1.25) + signoMas(10, 13.5, 1.25),
  'o-capacitor-placas':
    camino('M5 3v14M15 3v14') +
    signoMas(8, 6, 1.25) + signoMas(8, 10, 1.25) + signoMas(8, 14, 1.25) +
    signoMenos(12.25, 6, 1.25) + signoMenos(12.25, 10, 1.25) + signoMenos(12.25, 14, 1.25),
  // Conductor: rayado cruzado. Dieléctrico: puntos regulares.
  'o-conductor':
    rect(3.5, 3.5, 13, 13, 1) +
    camino('M3.5 9l7.5 7.5M3.5 3.5l13 13M9 3.5l7.5 7.5M3.5 11L11 3.5M3.5 16.5l13-13M9 16.5L16.5 9'),
  'o-dielectrico':
    rect(3.5, 3.5, 13, 13, 1) + [6.5, 10, 13.5].flatMap((y) => [6.5, 10, 13.5].map((x) => punto(x, y, 1))).join(''),
  'o-campo-uniforme':
    vector(3, 5, 17, 5, { largo: 2.75, ancho: 2.25 }) +
    vector(3, 10, 17, 10, { largo: 2.75, ancho: 2.25 }) +
    vector(3, 15, 17, 15, { largo: 2.75, ancho: 2.25 }),
  'o-tierra': camino('M10 3.5v6M4 9.5h12M6.5 12.5h7M9 15.5h2'),
};

// Circuitos: símbolos IEC.
const circuitos = {
  'o-bateria': camino('M3 10h5.5M11.5 10H17M8.5 4.5v11M11.5 7.5v5') + signoMas(5, 5.5, 1.25),
  'o-fuente-corriente':
    circulo(10, 10, 5.25) + camino('M3 10h1.75M15.25 10H17') + vector(6.75, 10, 13.5, 10, { largo: 2.5, ancho: 2.5 }),
  'o-resistencia': camino('M3 10h3M14 10h3') + rect(6, 7.5, 8, 5),
  'o-reostato': camino('M3 10h3M14 10h3') + rect(6, 7.5, 8, 5) + vector(5.5, 14.5, 15, 5),
  'o-bombilla': circulo(10, 10, 4.75) + camino('M6.64 6.64l6.72 6.72M13.36 6.64l-6.72 6.72M3 10h2.25M14.75 10H17'),
  'o-capacitor': camino('M3 10h5.5M11.5 10H17M8.5 4.5v11M11.5 4.5v11'),
  'o-inductor': camino('M3 11.5h1a2 2 0 0 1 4 0a2 2 0 0 1 4 0a2 2 0 0 1 4 0h1'),
  'o-interruptor': camino('M3 12.5h4L12 7.5M13 12.5h4M13 12.5v-1.5'),
  'o-interruptor-3': camino('M3 10h4l5-4.5M13 5.5h4M13 10h4M13 14.5h4'),
  'o-cable': camino('M3 14.5h5.5V5.5H17'),
  'o-nodo': camino('M3 10h14M10 10v7') + punto(10, 10),
};

const magnetismo = {
  // Hilo perpendicular al plano (⊙, corriente saliente) y su línea de campo con sentido.
  'o-hilo-corriente':
    circulo(10, 10, 3.5) + punto(10, 10, 1.25) + camino(arco(10, 10, 7, -60, 240)) +
    puntaDeArco(10, 10, 7, -60, -1, { largo: 2.5, ancho: 2.5, avance: 1.5 }),
  // Corriente: flecha a mitad del tramo.
  'o-segmento-corriente': camino('M4 10h12') + punto(4, 10) + punto(16, 10) + puntaMedia(10, 10, 1, 0),
  'o-espira': circulo(10, 10.25, 6) + puntaMedia(10, 4.25, 1, 0),
  'o-solenoide': elipse(5, 10, 1.75, 5.5) + elipse(8.33, 10, 1.75, 5.5) + elipse(11.67, 10, 1.75, 5.5) + elipse(15, 10, 1.75, 5.5),
  // Imán (sección 7.3): N lleno de tinta con la N hueca; S vacío con la S en tinta.
  'o-iman':
    camino(`M3 6.5H10V13.5H3Z${contornoN(4.75, 8, 3.5, 4, 1.35)}`, RELLENO_HUECO) +
    rect(3, 6.5, 14, 7) +
    camino(glifoS(11.8, 7.9, 3.4, 4.2)),
  // Regiones de campo: borde discontinuo; B perpendicular entrante (×), E con vectores.
  'o-region-b':
    rect(3, 3, 14, 14, 1, DISCONTINUO) +
    signoPor(7.25, 7.25, 1.5) + signoPor(12.75, 7.25, 1.5) + signoPor(7.25, 12.75, 1.5) + signoPor(12.75, 12.75, 1.5),
  'o-region-e':
    rect(3, 3, 14, 14, 1, DISCONTINUO) +
    vector(6, 7.5, 14, 7.5, { largo: 2.5, ancho: 2.25 }) +
    vector(6, 12.5, 14, 12.5, { largo: 2.5, ancho: 2.25 }),
  'o-particula-cargada': camino('M3 16.5a9 9 0 0 1 6.75-7.5', DISCONTINUO) + cargaPositiva(12.75, 7.25, 4.25, 2.25),
  'o-fuente-iones': camino('M8.5 7.5V6H3v8h5.5v-1.5') + punto(12, 10) + punto(16, 10),
  'o-placas-aceleradoras': camino('M7 3v5M7 12v5M13 3v5M13 12v5') + vector(3, 10, 17, 10, { largo: 2.5 }),
  // Pantalla detectora: placa y una trayectoria curva que llega a ella.
  'o-pantalla': rect(14, 3, 3, 14) + camino(arcoPor(3.5, 17, 7, 10.25, 13.25, 7), DISCONTINUO),
  'o-rieles': camino('M7 5h10M7 15h10M7 5H4.5v3M4.5 12v3H7') + rect(3, 8, 3, 4),
  'o-barra-conductora': camino('M3 5h14M3 15h14') + rect(6.5, 3, 2.5, 14) + vector(10, 10, 16.5, 10),
  'o-espira-movil': rect(3, 5, 7.5, 10) + vector(11.5, 10, 17, 10),
  // Bobina giratoria: la espira vista en giro (paralelogramo) y su eje de rotación.
  'o-bobina-giratoria': camino('M10 2.75v14.5', EJE) + camino('M5.5 5.5l9 2.5v7.5l-9-2.5z'),
  'o-lamina-hall': rect(3, 6.5, 14, 7) + vector(5, 10, 15, 10, { largo: 2.5 }) + camino('M10 6.5V3M10 13.5V17'),
};

const ondas = {
  // Onda estacionaria entre extremos fijos: los dos extremos de la oscilación.
  'o-cuerda-vibrante': camino('M3 5v10M17 5v10M3 10a3.5 3.5 0 0 1 7 0a3.5 3.5 0 0 0 7 0'),
  // Tubo abierto: envolvente del desplazamiento (nodo al centro).
  'o-tubo': camino('M3 6h14M3 14h14M3 8a13.25 13.25 0 0 0 14 0M3 12a13.25 13.25 0 0 1 14 0'),
  'o-piston': camino('M3 6h10M3 14h10') + rect(10, 6, 2.5, 8) + camino('M12.5 10H17'),
  'o-oscilador': circulo(10, 10, 6.75) + camino(onda(6, 10, 14, 2, 2.25)),
  'o-pulso': camino('M3 14h3.5a3.5 3.5 0 0 1 7 0H17') + vector(11.5, 6, 17, 6, { largo: 2.5 }),
  // Unión entre medios: un pulso que llega por la cuerda delgada a la gruesa.
  'o-union-medios': camino('M3 10h1.5a2.25 2.25 0 0 1 4.5 0H10') + rect(10, 8.5, 7, 3),
  'o-onda-analitica': camino(onda(3, 10, 17, 4, 3.25)),
  'o-fuente-puntual': punto(10, 10) + circulo(10, 10, 4.5) + circulo(10, 10, 7.25),
  'o-fuente-lineal': camino('M4 3v14M9 4.5v11M14 4.5v11'),
  'o-arreglo-fuentes':
    punto(4, 5.5) + punto(4, 10) + punto(4, 14.5) +
    camino(arco(4, 5.5, 5, -32, 32) + arco(4, 10, 5, -32, 32) + arco(4, 14.5, 5, -32, 32)) +
    camino('M13 3v14'),
  'o-barrera':
    rect(11, 3, 4.5, 14) +
    camino(rayas([[11, 8], [11, 12.5], [11, 17]], 4.5, -4.5)) +
    camino(arco(14, 10, 7.5, 145, 215) + arco(14, 10, 11, 155, 205)),
  'o-rendija': camino('M8 3v4.5M8 12.5V17M4 3v14') + camino(arco(8, 10, 4, -90, 90) + arco(8, 10, 7.5, -65, 65)),
  // Zona de otra velocidad: la longitud de onda se acorta al entrar.
  'o-zona-velocidad': rect(9.5, 3, 7.5, 14) + camino('M3.5 4.5v11M7 4.5v11M12 5.5v9M14.5 5.5v9'),
  'o-fuente-sonora': camino('M3 7.5h3l4-4v13l-4-4H3z') + camino(arco(10, 10, 3.5, -45, 45) + arco(10, 10, 6.5, -45, 45)),
  'o-observador': circulo(10, 6.5, 3) + camino('M4 17a6 6 0 0 1 12 0'),
  'o-pared-reflectante':
    camino('M13 3v14' + rayas([[13, 7], [13, 12], [13, 17]], 4, -4)) + camino(arco(1, 10, 9, -40, 40) + arco(1, 10, 5.5, -45, 45)),
};

const optica = {
  // Rayos: flecha a mitad del tramo.
  'o-rayo': camino('M3.5 16.5L16.5 3.5') + puntaMedia(10, 10, Math.SQRT1_2, -Math.SQRT1_2),
  'o-haz':
    camino('M3 5h14M3 10h14M3 15h14') +
    puntaMedia(10, 5, 1, 0, { largo: 2.5, ancho: 2.5 }) +
    puntaMedia(10, 10, 1, 0, { largo: 2.5, ancho: 2.5 }) +
    puntaMedia(10, 15, 1, 0, { largo: 2.5, ancho: 2.5 }),
  'o-fuente-luz': punto(5, 10) + camino('M5 10h12M5 10l7-7M5 10l7 7'),
  'o-objeto-luminoso': camino('M2.75 15.5h14.5', EJE) + vector(10, 15.5, 10, 3.5),
  // Medios: contorno y la marca de material (tres trazos diagonales en una esquina).
  'o-medio': rect(3, 5, 14, 10) + camino('M11 8.5l2-2M12.5 10l2-2M14 11.5l2-2'),
  'o-capas':
    rect(3, 3, 14, 14) + camino('M3 7.5h14M3 12h14') + camino('M14.25 6.25l1.5-1.5M12.5 10.75l1.5-1.5M14.5 10.75l1.5-1.5'),
  'o-recipiente-liquido': camino('M3 4v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4M3 8.5h14M5.5 11h6M8.5 13.5h5'),
  // Espejos: línea de materia con rayado corto en la cara trasera.
  'o-espejo-plano':
    camino('M9.5 3v14' + rayas([[9.5, 6], [9.5, 9.5], [9.5, 13], [9.5, 16.5]], 2.5, -2.5)) + camino('M3 3.5l6.5 6.5L3 16.5'),
  'o-espejo-curvo': (() => {
    const cx = 2.5;
    const r = 11;
    const a0 = -Math.asin(7 / r) * (180 / Math.PI);
    let d = arco(cx, 10, r, a0, -a0);
    for (const y of [5, 8.5, 12, 15.5]) {
      const x = cx + Math.sqrt(r * r - (y - 10) ** 2);
      d += `M${n(x)} ${n(y)}l2.25 -2.25`;
    }
    return camino(d) + camino('M2.75 10h7', EJE);
  })(),
  // Lentes: la ideal es el símbolo de doble punta; la gruesa, su sección real.
  'o-lente-ideal':
    camino('M10 3v14' + puntaAbierta(10, 3, 0, -1, 2.5) + puntaAbierta(10, 17, 0, 1, 2.5)) + camino('M2.75 10h14.5', EJE),
  'o-lente-gruesa': camino('M10 3a12 12 0 0 1 0 14a12 12 0 0 1 0-14z') + camino('M2.75 10h14.5', EJE),
  'o-divisor-haz': rect(5.5, 5.5, 9, 9) + camino('M5.5 14.5l9-9') + camino('M2.75 10h14.5M10 10V2.75'),
  'o-bloqueador':
    rect(11, 3.5, 4.5, 13) + camino(rayas([[11, 8], [11, 12.5], [11, 16.5]], 4, -4)) + camino('M3 10h8') + puntaMedia(6.5, 10, 1, 0),
  // Pantalla vista de frente con su patrón de franjas (la central, la más intensa).
  'o-pantalla-optica': rect(3, 3.5, 14, 13, 1) + camino('M10 6v8M7 7.5v5M13 7.5v5M5 9v2M15 9v2'),
  // Observador: el ojo de perfil (globo, córnea y cristalino) con la luz que le llega.
  'o-ojo':
    circulo(12, 10, 5) + camino(arcoPor(8.46, 6.46, 6.25, 10, 8.46, 13.54) + 'M9.5 7.5v5') +
    vector(2.75, 10, 6, 10, { largo: 2.25, ancho: 2.25 }),
  // Doble rendija: barrera, pantalla y los dos caminos que llegan al mismo punto.
  'o-rendija-doble': camino('M6 3v2.75M6 8.25v3.5M6 14.25V17M17 3v14M6.75 7l9.5 3M6.75 13l9.5-3'),
  'o-red-difraccion':
    camino('M8 3v14', ' stroke-dasharray="1.5 1.5" stroke-linecap="butt"') + camino('M3 10h14M8 10l7-7M8 10l7 7'),
  'o-pelicula': camino('M3 10h14M3 13h14') + camino('M3.5 3.5L7 10l3.5-6.5M7 10l1.5 3 1.5-3 3.5-6.5'),
  // Anillos de Newton: lente planoconvexa apoyada en una placa, con la luz que llega.
  'o-anillos-newton': camino('M4 9.5h12a6.5 6.5 0 0 1-12 0z') + rect(3, 13.5, 14, 3) + vector(10, 2.75, 10, 8.75, { largo: 2.5 }),
  // Michelson: fuente, divisor a 45°, los dos espejos al final de los brazos y la salida.
  'o-michelson': punto(4.25, 10) + camino('M6.5 10H15M10 5.5v11M7.75 12.25l4.5-4.5M15 7v6M7 5.5h6'),
};

const moderna = {
  'o-lampara': camino(arco(10, 8, 5, 135, 405) + 'L12 13H8z') + camino('M8 15h4M8.75 17h2.5'),
  // Placa metálica (conductor, rayado) y el fotón que llega.
  'o-placa-metal':
    rect(3, 12.5, 14, 4) +
    camino('M5 16.5l4-4M9.5 16.5l4-4M14 16.5l3-3') +
    camino(ondaV(8, 10.5, 3, 3, 1.1)) +
    punta(8, 11.75, 0, 1, { largo: 2.25, ancho: 2.5 }),
  'o-colector': camino('M13 3v14M13 10h4') + punto(4.5, 10) + vector(6.5, 10, 11.5, 10, { largo: 2.5 }),
  // Núcleo: protones llenos, neutrones vacíos.
  'o-nucleo':
    circulo(7.25, 7.25, 2.75, ' fill="currentColor" stroke="none"') +
    circulo(12.75, 7.25, 2) +
    circulo(7.25, 12.75, 2) +
    circulo(12.75, 12.75, 2.75, ' fill="currentColor" stroke="none"'),
  'o-muestra': rect(5.5, 12, 9, 5, 1) + camino('M10 9.5V4M7.5 10L4 6.5M12.5 10L16 6.5', ' stroke-dasharray="1.5 2"'),
  // Fotón: paquete ondulado con punta.
  'o-foton': camino(onda(3, 10, 13, 4, 1.75)) + vector(13, 10, 17, 10, { largo: 2.75 }),
};

// ————————————————————————————————————————————————————————————————
// Instrumentos (n-)
// ————————————————————————————————————————————————————————————————

/** Marca de sonda: aro con centro (el punto donde se mide). */
const sonda = (x, y) => circulo(x, y, 2.5) + marca(x, y);

const instrumentos = {
  'n-regla': rect(3, 6.5, 14, 7, 0.75) + camino('M5.5 6.5v2M8 6.5v3.5M10.5 6.5v2M13 6.5v3.5M15.5 6.5v2'),
  'n-transportador': camino('M3 14.5h14' + arco(10, 14.5, 7, 180, 360) + radios(10, 14.5, 7, 5.25, [225, 270, 315]) + 'M10 14.5v-1'),
  'n-cronometro': circulo(10, 11, 6) + camino('M8 3h4M10 3V5M10 11V7.75M14.5 5.75l1.25-1.25'),
  // Fotopuerta: horquilla con el haz de luz que cruza entre sus brazos (rayo con flecha a mitad).
  'n-fotopuerta':
    camino('M4 16V6a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10M4 12h12') + puntaMedia(10, 12, 1, 0, { largo: 2.5, ancho: 2.5 }),
  // Dinamómetro: anilla, resorte (el mismo zigzag) y gancho.
  'n-dinamometro':
    circulo(10, 4, 1.25) +
    camino('M10 5.25V6' + zigzag(10, 6, 10, 12.5, { medias: 4, amp: 2.25, recto: 0.75 }) + 'M10 12.5v.25a1.75 1.75 0 1 1-1.75 1.75'),
  'n-velocimetro': camino(arco(10, 11, 7, 135, 405)) + camino('M10 11l3.5-3.5') + punto(10, 11, 1.5),
  // Acelerómetro: masa entre dos resortes dentro de una caja.
  'n-acelerometro':
    rect(3, 6, 14, 8, 1) +
    punto(10, 10) +
    camino(zigzag(3, 10, 8, 10, { medias: 2, amp: 1.5, recto: 0.75 }) + zigzag(12, 10, 17, 10, { medias: 2, amp: 1.5, recto: 0.75 })),
  'n-balanza': camino(
    'M10 3.5v13M6.5 16.5h7M4 5.5h12M4 5.5l-1 5M4 5.5l1 5M16 5.5l-1 5M16 5.5l1 5M3 10.5h2a1 1 0 0 1-2 0M15 10.5h2a1 1 0 0 1-2 0',
  ),
  // Periodo: una oscilación con su cota T (punta abierta de cota).
  'n-periodo':
    camino('M3.5 12a3.25 3.25 0 0 1 6.5 0a3.25 3.25 0 0 0 6.5 0') +
    camino('M3.5 4.5h13' + puntaAbierta(3.5, 4.5, -1, 0, 1.75) + puntaAbierta(16.5, 4.5, 1, 0, 1.75) + 'M3.5 2.75v3.5M16.5 2.75v3.5'),
  // Sondas: aro de medida más lo que miden (vector E, valor V, línea de B).
  'n-sonda-campo': sonda(6, 14) + vector(7.77, 12.23, 16, 4),
  'n-sonda-potencial': sonda(6.5, 13.5) + camino(glifoV(10.5, 3.5, 5.5, 6.5)),
  'n-voltimetro': circulo(10, 10, 6.75) + camino(glifoV(7.6, 7.25, 4.8, 5.5)),
  'n-amperimetro': circulo(10, 10, 6.75) + camino(glifoA(7.5, 7.25, 5, 5.5)),
  'n-osciloscopio': rect(3, 4, 14, 12, 1.5) + camino(onda(5.5, 10, 14.5, 2, 2.75)) + camino('M3 10h14', PUNTEADO),
  'n-superficie-gauss': circulo(10, 10, 6.75, DISCONTINUO) + signoMas(10, 10, 2.25),
  'n-termometro': camino('M8.5 11.4V4.5a1.5 1.5 0 0 1 3 0v6.9a3 3 0 1 1-3 0zM10 13.25V7.5M13.5 5.5H15M13.5 8H15'),
  // Manómetro: tubo en U con desnivel.
  'n-manometro': camino('M4 3v7.5a6 6 0 0 0 12 0V3M7 3v7.5a3 3 0 0 0 6 0V3M4 8.5h3M13 5h3'),
  'n-histograma': camino('M3 16.5h14M3.5 16.5V11h3V6h3v2.5h3v4h3v4M6.5 11v5.5M9.5 6v10.5M12.5 8.5v8'),
  // Frecuencímetro: el diapasón.
  'n-frecuencimetro': camino('M7 3v6a3 3 0 0 0 6 0V3M10 12v5'),
  'n-microfono': rect(7.5, 2.75, 5, 8.5, 2.5) + camino('M4.75 9a5.25 5.25 0 0 0 10.5 0M10 14.25V17M7.5 17h5'),
  // Espectro: líneas espectrales sobre su eje.
  'n-espectro': camino('M3 16.5h14M5 16.5v-4M7.5 16.5V6M10 16.5v-3M12.5 16.5V4M15 16.5v-6'),
  'n-detector': rect(12, 6.5, 5, 7, 0.75) + camino(arco(14.5, 10, 7, 150, 210) + arco(14.5, 10, 10.5, 157, 203)),
  // Intensidad: perfil de difracción (máximo central y laterales).
  'n-intensidad': camino('M2.75 16h2a1.75 1.75 0 0 1 3.5 0A1.75 9 0 0 1 11.75 16a1.75 1.75 0 0 1 3.5 0h2'),
  'n-contador-franjas': camino('M4 3v9.5M8 3v9.5M12 3v9.5M16 3v9.5') + camino('M10 14.5l2 2.5H8z'),
  'n-sonda-b': sonda(10, 10) + camino(arco(10, 10, 6.5, -150, 120)) + puntaDeArco(10, 10, 6.5, 120, 1, { largo: 2.5, ancho: 2.5, avance: 2.25 }),
  // Brújula: aguja con el norte lleno y el sur vacío (misma convención que el imán).
  'n-brujula': circulo(10, 10, 7) + camino('M10 4.5l2 5.5H8z', LLENO) + camino('M8 10h4l-2 5.5z'),
  'n-flujo':
    elipse(10, 11.5, 6.75, 2.5) +
    vector(6.5, 16.5, 6.5, 3, { largo: 2.5, ancho: 2.25 }) +
    vector(10, 17, 10, 3, { largo: 2.5, ancho: 2.25 }) +
    vector(13.5, 16.5, 13.5, 3, { largo: 2.5, ancho: 2.25 }),
};

// ————————————————————————————————————————————————————————————————
// Emblemas de módulo (m-) — rejilla de 40, trazo 1.75, zona viva 4..36
// ————————————————————————————————————————————————————————————————

const G40 = { g: 1.75, largo: 5, ancho: 4.5 };
const G40_PEQ = { g: 1.75, largo: 4, ancho: 3.5 };

const modulos = {
  // Mecánica: oscilador masa-resorte; pared y suelo rayados, el mismo zigzag del resorte y un
  // cuerpo rígido con su centro de masa.
  'm-mecanica':
    camino('M9 11v18H35' + rayas([[9, 13], [9, 19], [9, 25]], -4, -4) + rayas([[35, 29], [26, 29], [17, 29]], -5, 5)) +
    camino(zigzag(9, 22, 25, 22, { medias: 4, amp: 2.9, recto: 1.5 })) +
    rect(25, 15, 10, 14) +
    centroMasa(30, 22, 2.75),
  // Gravitación: órbita elíptica con el cuerpo central en el foco, área barrida y velocidad.
  'm-gravitacion': (() => {
    const cx = 20;
    const cy = 21;
    const rx = 14;
    const ry = 11.5;
    const f = cx - Math.sqrt(rx * rx - ry * ry);
    const t = (-25 * Math.PI) / 180;
    const sat = [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
    // tangente en sentido antihorario
    const tx = rx * Math.sin(t);
    const ty = -ry * Math.cos(t);
    const tl = Math.hypot(tx, ty);
    const u = [tx / tl, ty / tl];
    return (
      elipse(cx, cy, rx, ry) +
      circulo(f, cy, 3.5) +
      camino(`M${n(f - 3.5)} ${n(cy)}a3.5 1.25 0 0 0 7 0`) +
      punto(sat[0], sat[1], 2.75) +
      vector(sat[0] + u[0] * 3.75, sat[1] + u[1] * 3.75, sat[0] + u[0] * 11, sat[1] + u[1] * 11, G40_PEQ)
    );
  })(),
  // Termodinámica: cilindro con émbolo, gas y calor que entra por abajo.
  'm-termodinamica':
    camino('M9 5v21a1.5 1.5 0 0 0 1.5 1.5h19a1.5 1.5 0 0 0 1.5-1.5V5') +
    rect(9, 10, 22, 4) +
    camino('M20 10V5') +
    punto(14.5, 18.5, 2.25) + punto(21, 23, 2.25) + punto(26, 18, 2.25) + punto(16.5, 24, 2.25) +
    camino(ondaV(13, 35, 29.5, 2, 1.5) + ondaV(20, 35, 29.5, 2, 1.5) + ondaV(27, 35, 29.5, 2, 1.5)),
  // Electrostática: dipolo con tres líneas de campo de + a −.
  'm-electrostatica':
    cargaPositiva(9.5, 20, 5, 2.75, 0.875) +
    cargaNegativa(30.5, 20, 5, 2.75, 1.75) +
    camino('M16.25 20h7.5') +
    puntaMedia(20, 20, 1, 0, G40_PEQ) +
    camino(arcoPor(13.84, 14.83, 20, 8.5, 26.16, 14.83) + arcoPor(13.84, 25.17, 20, 31.5, 26.16, 25.17)) +
    puntaMedia(20, 8.5, 1, 0, G40_PEQ) +
    puntaMedia(20, 31.5, 1, 0, G40_PEQ),
  // Circuitos: malla con batería, resistencia, capacitor y bombilla (IEC).
  'm-circuitos':
    camino('M9 18V9h6M25 9h6v9M31 22v9h-7.5M16.5 31H9v-9') +
    camino('M5 18h8M6.5 22h5') +
    signoMas(13.5, 14, 1.5) +
    rect(15, 6, 10, 6) +
    camino('M27.5 18h7M27.5 22h7') +
    circulo(20, 31, 3.5) +
    camino('M17.53 28.53l4.94 4.94M22.47 28.53l-4.94 4.94'),
  // Magnetismo: imán de barra (N lleno, S vacío) y sus líneas de campo de N a S por fuera.
  'm-magnetismo':
    camino(`M10 23.5H20V30.5H10Z${contornoN(12.6, 24.6, 4.6, 4.8, 1.55)}`, RELLENO_HUECO) +
    rect(10, 23.5, 20, 7) +
    camino(glifoS(23, 24.5, 4, 5)) +
    camino('M13 23.5a7 7.5 0 0 1 14 0M10 27H6.5a13.5 17 0 0 1 27 0H30') +
    puntaMedia(20, 16, 1, 0, G40_PEQ) +
    puntaMedia(20, 10, 1, 0, G40_PEQ),
  // Ondas: onda sobre su eje, con la cota de una longitud de onda y el sentido de avance.
  'm-ondas':
    camino('M5 23h30', EJE_40) +
    camino(onda(5, 23, 35, 4, 7)) +
    camino('M5 9.5h15' + puntaAbierta(5, 9.5, -1, 0, 2.5) + puntaAbierta(20, 9.5, 1, 0, 2.5) + 'M5 6.5v6M20 6.5v6') +
    vector(25, 9.5, 35, 9.5, G40),
  // Óptica: lente convergente, eje óptico y rayos paralelos que se juntan en el foco.
  'm-optica':
    camino('M15 6a22 22 0 0 1 0 28a22 22 0 0 1 0-28z') +
    camino('M5 20h30', EJE_40) +
    camino('M5 12h10L31 20M5 28h10L31 20M5 20h26') +
    puntaMedia(9.5, 12, 1, 0, G40_PEQ) +
    puntaMedia(9.5, 28, 1, 0, G40_PEQ) +
    punto(31, 20, 2.25),
  // Física moderna: efecto fotoeléctrico (fotón, placa metálica, electrón emitido).
  'm-moderna':
    rect(5, 28, 30, 7) +
    camino('M8 35l7-7M15 35l7-7M22 35l7-7M29 35l6-6') +
    camino(ondaV(13, 6, 22.5, 4, 2)) +
    punta(13, 26.5, 0, 1, G40) +
    punto(22.5, 24.5, 2.75) +
    vector(24.5, 22.5, 33, 14, G40),
};

// ————————————————————————————————————————————————————————————————
// Exportación
// ————————————————————————————————————————————————————————————————

export const grupos = [
  { prefijo: 'i', titulo: 'Interfaz', vista: 20, trazo: 1.5, iconos: interfaz },
  {
    prefijo: 'o',
    titulo: 'Objetos',
    vista: 20,
    trazo: 1.5,
    modulos: [
      { clave: 'mecanica', titulo: 'Mecánica', iconos: mecanica },
      { clave: 'gravitacion', titulo: 'Gravitación', iconos: gravitacion },
      { clave: 'termodinamica', titulo: 'Termodinámica', iconos: termodinamica },
      { clave: 'electrostatica', titulo: 'Electrostática', iconos: electrostatica },
      { clave: 'circuitos', titulo: 'Circuitos', iconos: circuitos },
      { clave: 'magnetismo', titulo: 'Magnetismo', iconos: magnetismo },
      { clave: 'ondas', titulo: 'Ondas', iconos: ondas },
      { clave: 'optica', titulo: 'Óptica', iconos: optica },
      { clave: 'moderna', titulo: 'Física moderna', iconos: moderna },
    ],
  },
  { prefijo: 'n', titulo: 'Instrumentos', vista: 20, trazo: 1.5, iconos: instrumentos },
  { prefijo: 'm', titulo: 'Módulos', vista: 40, trazo: 1.75, iconos: modulos },
];
