// Volta — construcción del set de iconos.
//
// Uso (desde la carpeta del proyecto):  node sistema/iconos/construir.mjs
//
// Lee fuente/iconos.mjs y genera, junto a este archivo:
//   svg/<nombre>.svg  un archivo por icono, con los atributos de trazo en la raíz
//   sprite.svg        un <symbol id="nombre"> por icono
//   sprite.js         inserta el sprite en la página (sirve con file://, donde
//                     <use> hacia un SVG externo está bloqueado) y expone
//                     window.VoltaIconos = { nombres, svg(nombre, clase) }
//   catalogo.html     catálogo autocontenido (sprite en línea, sin fetch)
// Al final verifica que el set coincide exactamente con el inventario de la
// sección 6.2 del lenguaje de diseño; si falta o sobra algo, falla.
//
// Sin dependencias: solo Node (probado con Node 24).

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { grupos } from './fuente/iconos.mjs';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));

// ————————————————————————————————————————————————————————————————
// Inventario de la sección 6.2 (copia literal; es la referencia de la verificación)
// ————————————————————————————————————————————————————————————————

const lista = (prefijo, texto) =>
  texto
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `${prefijo}-${s}`);

const INVENTARIO = {
  i: lista(
    'i',
    `reproducir, pausar, paso-adelante, paso-atras,
    reiniciar, inicio, deshacer, rehacer, buscar, mas, menos, cerrar, menu,
    ajustes, capas, ojo, ojo-tachado, candado, candado-abierto, duplicar, borrar,
    mover, rotar, zoom-mas, zoom-menos, encuadrar, cuadricula, ajuste-iman,
    grafica, tabla, energia, evento, archivo, carpeta, guardar, exportar,
    imagen, video, variable, enlazar, expresion, info, aviso, error, ayuda,
    check, chevron-abajo, chevron-arriba, chevron-izquierda, chevron-derecha,
    flecha-derecha, asa, tema-claro, tema-oscuro, pantalla-completa,
    panel-izquierdo, panel-derecho, panel-inferior, filtro, estrella, historial,
    rama, precision, velocidad-sim, copiar, nota, etiqueta, tutorial, ejemplo,
    mext, escena`,
  ),
  o: {
    mecanica: lista(
      'o',
      `particula, bloque, disco, barra, poligono, movimiento-prescrito,
      suelo, pared, plano-inclinado, arco, curva, trazo-libre, pista, cuerda,
      cuerda-elastica, resorte, amortiguador, varilla, polea, clavo,
      prensa-hidraulica, pasador, fijacion, riel, fuerza, motor, impulso,
      lanzador, gravedad, fluido, viento, campo-propio, marco-movil`,
    ),
    gravitacion: lista('o', `planeta, satelite, cuerpo-masivo, nave, atmosfera`),
    termodinamica: lista(
      'o',
      `cilindro, recipiente, embolo, tabique, valvula, pesa,
      calentador, bano-termico, gas, columna-liquido, globo, caja-molecular,
      bomba, orificio, cuerpo-termico, calorimetro`,
    ),
    electrostatica: lista(
      'o',
      `carga-positiva, carga-negativa, esfera-cargada,
      hilo-infinito, segmento-cargado, anillo, lamina, capacitor-placas,
      conductor, dielectrico, campo-uniforme, tierra`,
    ),
    circuitos: lista(
      'o',
      `bateria, fuente-ca, fuente-corriente, resistencia, reostato, bombilla, diodo, led,
      capacitor, inductor, interruptor, interruptor-3, cable, nodo`,
    ),
    magnetismo: lista(
      'o',
      `hilo-corriente, segmento-corriente, espira, solenoide, iman,
      region-b, region-e, particula-cargada, fuente-iones, placas-aceleradoras,
      pantalla, rieles, barra-conductora, espira-movil, bobina-giratoria,
      lamina-hall`,
    ),
    ondas: lista(
      'o',
      `cuerda-vibrante, tubo, piston, oscilador, pulso, union-medios,
      onda-analitica, fuente-puntual, fuente-lineal, arreglo-fuentes, barrera,
      rendija, zona-velocidad, fuente-sonora, observador, pared-reflectante`,
    ),
    optica: lista(
      'o',
      `rayo, haz, fuente-luz, objeto-luminoso, medio, capas,
      recipiente-liquido, espejo-plano, espejo-curvo, lente-ideal, lente-gruesa,
      divisor-haz, bloqueador, pantalla-optica, ojo, rendija-doble,
      red-difraccion, pelicula, anillos-newton, michelson`,
    ),
    moderna: lista('o', `lampara, placa-metal, colector, nucleo, muestra, foton`),
  },
  n: lista(
    'n',
    `regla, transportador, cronometro, fotopuerta,
    dinamometro, velocimetro, acelerometro, balanza, periodo, sonda-campo,
    sonda-potencial, voltimetro, amperimetro, osciloscopio, superficie-gauss,
    termometro, manometro, histograma, frecuencimetro, microfono, espectro,
    detector, intensidad, contador-franjas, sonda-b, brujula, flujo`,
  ),
  m: lista(
    'm',
    `mecanica, gravitacion, termodinamica, electrostatica,
    circuitos, magnetismo, ondas, optica, moderna`,
  ),
};

// ————————————————————————————————————————————————————————————————
// Aplanado de la fuente
// ————————————————————————————————————————————————————————————————

/** Lista ordenada de { nombre, marcado, vista, trazo, prefijo, modulo }. */
function aplanar() {
  const salida = [];
  for (const g of grupos) {
    const bloques = g.modulos ?? [{ clave: null, titulo: null, iconos: g.iconos }];
    for (const b of bloques) {
      for (const [nombre, marcado] of Object.entries(b.iconos)) {
        salida.push({
          nombre,
          marcado,
          vista: g.vista,
          trazo: g.trazo,
          prefijo: g.prefijo,
          modulo: b.clave,
        });
      }
    }
  }
  return salida;
}

const atributosTrazo = (trazo) =>
  `fill="none" stroke="currentColor" stroke-width="${trazo}" stroke-linecap="round" stroke-linejoin="round"`;

const archivoSvg = (ic) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${ic.vista}" height="${ic.vista}" ` +
  `viewBox="0 0 ${ic.vista} ${ic.vista}" ${atributosTrazo(ic.trazo)}>${ic.marcado}</svg>\n`;

const simbolo = (ic) =>
  `<symbol id="${ic.nombre}" viewBox="0 0 ${ic.vista} ${ic.vista}" ${atributosTrazo(ic.trazo)}>${ic.marcado}</symbol>`;

const spriteSvg = (iconos, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg"${extra}>\n${iconos.map(simbolo).join('\n')}\n</svg>`;

// ————————————————————————————————————————————————————————————————
// sprite.js
// ————————————————————————————————————————————————————————————————

function spriteJs(iconos) {
  const sprite = spriteSvg(
    iconos,
    ' id="volta-iconos-sprite" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden"',
  ).replace(/\n/g, '');
  const nombres = iconos.map((ic) => ic.nombre);
  return `// Volta — sprite de iconos. Generado por construir.mjs; no se edita a mano.
//
// Uso:  <script src="../iconos/sprite.js"></script>
//       <svg class="ico"><use href="#i-reproducir"/></svg>
// Inserta el sprite como <svg> oculto al inicio de <body> (o al llegar
// DOMContentLoaded si <body> aún no existe). Funciona abriendo la página por
// file://, donde <use> hacia un archivo SVG externo está bloqueado.
(function () {
  'use strict';
  var SPRITE = ${JSON.stringify(sprite)};
  var NOMBRES = ${JSON.stringify(nombres)};
  var conjunto = {};
  for (var i = 0; i < NOMBRES.length; i++) conjunto[NOMBRES[i]] = true;

  function insertar() {
    if (document.getElementById('volta-iconos-sprite')) return;
    var plantilla = document.createElement('div');
    plantilla.innerHTML = SPRITE;
    var svg = plantilla.firstElementChild;
    document.body.insertBefore(svg, document.body.firstChild);
  }

  if (document.body) insertar();
  else document.addEventListener('DOMContentLoaded', insertar);

  window.VoltaIconos = {
    nombres: NOMBRES.slice(),
    /** Marcado de un icono: '<svg class="ico …" aria-hidden="true"><use href="#nombre"/></svg>'. */
    svg: function (nombre, clase) {
      if (!conjunto[nombre] && window.console) console.warn('Volta: no existe el icono "' + nombre + '"');
      return '<svg class="ico' + (clase ? ' ' + clase : '') + '" aria-hidden="true"><use href="#' + nombre + '"/></svg>';
    }
  };
})();
`;
}

// ————————————————————————————————————————————————————————————————
// catalogo.html
// ————————————————————————————————————————————————————————————————

function ficha(ic) {
  if (ic.vista === 40) {
    return `<figure class="ficha emblema" data-nombre="${ic.nombre}"><div class="muestras"><svg class="ico t40" aria-hidden="true"><use href="#${ic.nombre}"/></svg></div><figcaption>${ic.nombre}</figcaption></figure>`;
  }
  return `<figure class="ficha" data-nombre="${ic.nombre}"><div class="muestras"><svg class="ico t20" aria-hidden="true"><use href="#${ic.nombre}"/></svg><svg class="ico t16" aria-hidden="true"><use href="#${ic.nombre}"/></svg></div><figcaption>${ic.nombre}</figcaption></figure>`;
}

function catalogo(iconos) {
  const porNombre = new Map(iconos.map((ic) => [ic.nombre, ic]));
  const secciones = grupos
    .map((g) => {
      const total = g.modulos
        ? g.modulos.reduce((s, m) => s + Object.keys(m.iconos).length, 0)
        : Object.keys(g.iconos).length;
      const cabecera = `<header class="cab-seccion"><h2>${g.titulo}</h2><span class="meta"><code>${g.prefijo}-</code> · ${total} iconos · rejilla de ${g.vista} px, trazo de ${g.trazo} px</span></header>`;
      let cuerpo;
      if (g.modulos) {
        cuerpo = g.modulos
          .map(
            (m) =>
              `<section class="modulo" data-filtro="${m.clave}"><h3>${m.titulo} <span class="cuenta">${Object.keys(m.iconos).length}</span></h3><div class="rejilla">${Object.keys(m.iconos)
                .map((nm) => ficha(porNombre.get(nm)))
                .join('')}</div></section>`,
          )
          .join('');
      } else {
        cuerpo = `<div class="rejilla${g.vista === 40 ? ' rejilla-emblemas' : ''}">${Object.keys(g.iconos)
          .map((nm) => ficha(porNombre.get(nm)))
          .join('')}</div>`;
      }
      return `<section class="grupo" data-filtro="${g.prefijo}" id="grupo-${g.prefijo}">${cabecera}${cuerpo}</section>`;
    })
    .join('\n');

  const sprite = spriteSvg(
    iconos,
    ' width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden"',
  );

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Iconos de Volta</title>
<meta name="description" content="Catálogo del set de iconos de Volta: interfaz, objetos por módulo, instrumentos y emblemas de módulo.">
<link rel="stylesheet" href="../fuentes/fuentes.css">
<style>
:root {
  --fondo: #FAFAF8;
  --texto: #171716;
  --texto-2: #4B4B47;
  --texto-3: #7C7C76;
  --texto-4: #A8A8A2;
  --campo: #F0F0ED;
  --campo-hover: #E8E8E4;
  --linea-suave: #E6E6E2;
  --linea: #D3D3CE;
  --tinta: #0C0C0B;
  --sobre-tinta: #FFFFFF;
  --guia: rgb(0 0 0 / .045);
  --guia-zona: rgb(0 0 0 / .22);
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --fondo: #121213;
    --texto: #EDEDEF;
    --texto-2: #B5B5BB;
    --texto-3: #85858C;
    --texto-4: #55555B;
    --campo: #1A1A1C;
    --campo-hover: #212124;
    --linea-suave: #1F1F22;
    --linea: #303034;
    --tinta: #FAFAFA;
    --sobre-tinta: #0C0C0B;
    --guia: rgb(255 255 255 / .05);
    --guia-zona: rgb(255 255 255 / .25);
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --fondo: #121213;
  --texto: #EDEDEF;
  --texto-2: #B5B5BB;
  --texto-3: #85858C;
  --texto-4: #55555B;
  --campo: #1A1A1C;
  --campo-hover: #212124;
  --linea-suave: #1F1F22;
  --linea: #303034;
  --tinta: #FAFAFA;
  --sobre-tinta: #0C0C0B;
  --guia: rgb(255 255 255 / .05);
  --guia-zona: rgb(255 255 255 / .25);
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  background: var(--fondo);
  color: var(--texto);
  font: 400 13px/18px "IBM Plex Sans", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.pagina { max-width: 1240px; margin: 0 auto; padding: 32px 24px 64px; }
.barra {
  display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between;
  gap: 16px 24px; padding-bottom: 24px; border-bottom: 1px solid var(--linea-suave);
}
.barra h1 { margin: 0; font-weight: 600; font-size: 28px; line-height: 34px; letter-spacing: -0.01em; }
.barra p { margin: 6px 0 0; color: var(--texto-2); max-width: 64ch; }
.controles { display: flex; flex-wrap: wrap; gap: 12px; }
.segmentado {
  display: inline-flex; padding: 2px; gap: 2px; border-radius: 5px; background: var(--campo);
}
.segmentado button {
  font: 500 12px/16px "IBM Plex Sans", system-ui, sans-serif;
  color: var(--texto-2); background: transparent; border: 0; border-radius: 4px;
  height: 24px; padding: 0 10px; cursor: pointer;
  transition: background-color 90ms cubic-bezier(.2, 0, 0, 1), color 90ms cubic-bezier(.2, 0, 0, 1);
}
.segmentado button:hover { color: var(--texto); }
.segmentado button[aria-pressed="true"] { background: var(--fondo); color: var(--texto); box-shadow: 0 0 0 1px var(--linea); }
.segmentado button:focus-visible { outline: 2px solid var(--tinta); outline-offset: 2px; }
.indice { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 16px 0 0; padding: 0; list-style: none; }
.indice a { color: var(--texto-2); text-decoration: none; font-size: 12px; }
.indice a:hover { color: var(--texto); text-decoration: underline; text-underline-offset: 3px; }
.grupo { padding-top: 40px; }
.cab-seccion { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px; margin-bottom: 8px; }
.cab-seccion h2 { margin: 0; font-weight: 600; font-size: 20px; line-height: 26px; }
.meta { color: var(--texto-3); font-size: 12px; }
code { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12px; color: var(--texto-2); }
.modulo { padding-top: 20px; }
.modulo h3 { margin: 0 0 8px; font-weight: 500; font-size: 14px; line-height: 20px; color: var(--texto); }
.modulo h3 .cuenta { color: var(--texto-3); font-weight: 400; font-size: 12px; margin-left: 4px; }
.rejilla { display: grid; grid-template-columns: repeat(auto-fill, minmax(136px, 1fr)); gap: 2px; }
.ficha {
  margin: 0; padding: 14px 8px 10px; border-radius: 8px; text-align: center;
  transition: background-color 90ms cubic-bezier(.2, 0, 0, 1);
}
.ficha:hover { background: var(--campo); }
.muestras { display: flex; align-items: center; justify-content: center; gap: 16px; height: 44px; color: var(--texto); }
.ico { display: block; flex: none; }
.t20 { width: 20px; height: 20px; }
.t16 { width: 16px; height: 16px; }
.t40 { width: 40px; height: 40px; }
.ficha figcaption {
  margin-top: 6px; font: 400 11px/14px "IBM Plex Mono", ui-monospace, monospace;
  color: var(--texto-2); overflow-wrap: anywhere;
}
.rejilla-emblemas { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
.rejilla-emblemas .muestras { height: 64px; }

/* Vista ampliada: ×3 con la rejilla de unidades y la zona viva marcada. */
.ampliada .rejilla { grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); }
.ampliada .muestras { height: auto; }
.ampliada .t16 { display: none; }
.ampliada .t20, .ampliada .t40 {
  width: 84px; height: 84px; padding: 12px;
  background-image:
    linear-gradient(var(--guia-zona), var(--guia-zona)),
    linear-gradient(var(--guia-zona), var(--guia-zona)),
    linear-gradient(var(--guia-zona), var(--guia-zona)),
    linear-gradient(var(--guia-zona), var(--guia-zona)),
    linear-gradient(to right, var(--guia) 1px, transparent 1px),
    linear-gradient(to bottom, var(--guia) 1px, transparent 1px);
  background-size: 48px 1px, 48px 1px, 1px 48px, 1px 48px, 3px 3px, 3px 3px;
  background-position: 18px 18px, 18px 65px, 18px 18px, 65px 18px, 12px 12px, 12px 12px;
  background-repeat: no-repeat, no-repeat, no-repeat, no-repeat, repeat, repeat;
  background-origin: border-box;
  background-clip: content-box, content-box, content-box, content-box, content-box, content-box;
}
.ampliada .t40 {
  width: 144px; height: 144px;
  background-size: 96px 1px, 96px 1px, 1px 96px, 1px 96px, 3px 3px, 3px 3px;
  background-position: 24px 24px, 24px 119px, 24px 24px, 119px 24px, 12px 12px, 12px 12px;
}
.ampliada .rejilla-emblemas { grid-template-columns: repeat(auto-fill, minmax(176px, 1fr)); }
.oculto { display: none; }
@media (max-width: 600px) {
  .pagina { padding: 24px 16px 48px; }
  .barra h1 { font-size: 24px; line-height: 30px; }
  .rejilla { grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
</head>
<body>
${sprite}
<div class="pagina" id="pagina">
  <header class="barra">
    <div>
      <h1>Iconos de Volta</h1>
      <p>${iconos.length} iconos. Rejilla de 20 px con 2 px de margen, trazo de 1.5 px; emblemas de módulo en rejilla de 40 px con trazo de 1.75 px. Cada icono se muestra a 20 y a 16 px.</p>
    </div>
    <div class="controles">
      <div class="segmentado" role="group" aria-label="Tema">
        <button type="button" data-tema="light">Claro</button>
        <button type="button" data-tema="dark">Oscuro</button>
      </div>
      <div class="segmentado" role="group" aria-label="Vista">
        <button type="button" data-vista="real">Tamaño real</button>
        <button type="button" data-vista="ampliada">Ampliada</button>
      </div>
    </div>
  </header>
  <ul class="indice">
    ${grupos.map((g) => `<li><a href="#grupo-${g.prefijo}">${g.titulo}</a></li>`).join('\n    ')}
  </ul>
${secciones}
</div>
<script>
(function () {
  var raiz = document.documentElement;
  var pagina = document.getElementById('pagina');
  function leer(clave) { try { return localStorage.getItem(clave); } catch (e) { return null; } }
  function guardar(clave, valor) { try { localStorage.setItem(clave, valor); } catch (e) {} }
  function temaActual() {
    var t = raiz.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function pintarBotones() {
    var t = temaActual();
    document.querySelectorAll('[data-tema]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tema === t)); });
    var v = pagina.classList.contains('ampliada') ? 'ampliada' : 'real';
    document.querySelectorAll('[data-vista]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.vista === v)); });
  }
  function ponerTema(t) { raiz.setAttribute('data-theme', t); guardar('volta-iconos-tema', t); pintarBotones(); }
  function ponerVista(v) { pagina.classList.toggle('ampliada', v === 'ampliada'); guardar('volta-iconos-vista', v); pintarBotones(); }

  // Parámetros en el fragmento (útiles para enlazar o capturar): #oscuro, #claro, #ampliada, #solo=<prefijo|módulo>
  var frag = decodeURIComponent(location.hash.slice(1)).split('&');
  var temaGuardado = leer('volta-iconos-tema');
  if (temaGuardado) raiz.setAttribute('data-theme', temaGuardado);
  var vistaGuardada = leer('volta-iconos-vista');
  if (vistaGuardada === 'ampliada') pagina.classList.add('ampliada');
  frag.forEach(function (p) {
    if (p === 'oscuro') raiz.setAttribute('data-theme', 'dark');
    if (p === 'claro') raiz.setAttribute('data-theme', 'light');
    if (p === 'ampliada') pagina.classList.add('ampliada');
    if (p.indexOf('solo=') === 0) {
      var claves = p.slice(5).split(',');
      document.querySelectorAll('.grupo').forEach(function (g) {
        var visible = claves.indexOf(g.dataset.filtro) >= 0;
        g.querySelectorAll('.modulo').forEach(function (m) {
          var mv = visible || claves.indexOf(m.dataset.filtro) >= 0;
          m.classList.toggle('oculto', !mv);
          if (mv) visible = true;
        });
        g.classList.toggle('oculto', !visible);
      });
      document.querySelector('.indice').classList.add('oculto');
    }
  });
  document.querySelectorAll('[data-tema]').forEach(function (b) { b.addEventListener('click', function () { ponerTema(b.dataset.tema); }); });
  document.querySelectorAll('[data-vista]').forEach(function (b) { b.addEventListener('click', function () { ponerVista(b.dataset.vista); }); });
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', pintarBotones);
  pintarBotones();
})();
</script>
</body>
</html>
`;
}

// ————————————————————————————————————————————————————————————————
// Verificación del inventario
// ————————————————————————————————————————————————————————————————

function verificar(iconos) {
  const errores = [];
  const vistos = new Map();
  for (const ic of iconos) {
    if (vistos.has(ic.nombre)) errores.push(`Nombre repetido: ${ic.nombre}`);
    vistos.set(ic.nombre, ic);
    if (!ic.nombre.startsWith(`${ic.prefijo}-`))
      errores.push(`${ic.nombre} está en el grupo "${ic.prefijo}-" y no lleva ese prefijo`);
    if (/<text\b/.test(ic.marcado)) errores.push(`${ic.nombre} usa <text>; los signos se dibujan con trazos`);
    if (/NaN|undefined|Infinity/.test(ic.marcado)) errores.push(`${ic.nombre} tiene coordenadas no numéricas`);
    if (!ic.marcado.trim()) errores.push(`${ic.nombre} está vacío`);
  }

  const esperados = new Map(); // nombre → módulo esperado (o null)
  for (const nm of [...INVENTARIO.i, ...INVENTARIO.n, ...INVENTARIO.m]) esperados.set(nm, null);
  for (const [modulo, nombres] of Object.entries(INVENTARIO.o)) for (const nm of nombres) esperados.set(nm, modulo);

  const faltan = [...esperados.keys()].filter((nm) => !vistos.has(nm));
  const sobran = [...vistos.keys()].filter((nm) => !esperados.has(nm));
  for (const [nm, modulo] of esperados) {
    const ic = vistos.get(nm);
    if (ic && modulo && ic.modulo !== modulo)
      errores.push(`${nm} está en el módulo "${ic.modulo}" y el inventario lo pone en "${modulo}"`);
  }
  if (faltan.length) errores.push(`Faltan ${faltan.length} iconos del inventario: ${faltan.join(', ')}`);
  if (sobran.length) errores.push(`Sobran ${sobran.length} iconos que no están en el inventario: ${sobran.join(', ')}`);
  return { errores, esperados: esperados.size };
}

// ————————————————————————————————————————————————————————————————
// Programa
// ————————————————————————————————————————————————————————————————

const iconos = aplanar();

const dirSvg = path.join(RAIZ, 'svg');
await mkdir(dirSvg, { recursive: true });
for (const f of await readdir(dirSvg)) if (f.endsWith('.svg')) await rm(path.join(dirSvg, f));
await Promise.all(iconos.map((ic) => writeFile(path.join(dirSvg, `${ic.nombre}.svg`), archivoSvg(ic))));
await writeFile(path.join(RAIZ, 'sprite.svg'), spriteSvg(iconos) + '\n');
await writeFile(path.join(RAIZ, 'sprite.js'), spriteJs(iconos));
await writeFile(path.join(RAIZ, 'catalogo.html'), catalogo(iconos));

const cuenta = {};
for (const ic of iconos) cuenta[ic.prefijo] = (cuenta[ic.prefijo] ?? 0) + 1;
console.log(
  `Generados ${iconos.length} iconos (` +
    Object.entries(cuenta)
      .map(([p, c]) => `${p}-: ${c}`)
      .join(', ') +
    `) en ${path.relative(process.cwd(), RAIZ) || '.'}`,
);

const { errores, esperados } = verificar(iconos);
if (errores.length) {
  console.error(`\nEl set no coincide con el inventario de la sección 6.2 (${esperados} nombres esperados):`);
  for (const e of errores) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`Inventario verificado: los ${esperados} nombres de la sección 6.2 están presentes y no sobra ninguno.`);
