/* ==========================================================================
   Volta · Óptica — espacio de trabajo "Óptica geométrica"
   Rayos, medios de forma libre, espejos, lentes, pantallas y el ojo. La
   física está en el motor puro sistema/motores/optica.js (probado en
   pruebas/optica.test.js): trazado exacto contra segmentos y arcos, Snell,
   reflexión total, Fresnel, dispersión de Cauchy, luz blanca que se separa
   al refractarse, e imágenes halladas con el cruce de los rayos (o de sus
   prolongaciones). No hay evolución temporal: cada cambio se traza al
   instante (también mientras se arrastra un objeto).
   Misma estructura que ondas.js y circuitos.js: escena → motor → lienzo →
   paneles. Mundo en metros; la pantalla escribe las longitudes en la
   unidad de la escena (cm por defecto).
   Parámetros de URL para capturas: ?escena=…&tema=…&sel=<id>|escena
   &pest=interacciones|imagenes&capas=angulos,prolongaciones
   ========================================================================== */
import {
  trazar, imagenesTrazadas, intensidadPantalla, verticesForma, contornoForma, contiene, indiceDe, esDispersivo, MATERIALES,
  LAMBDA_D, snell, anguloCritico, anguloBrewster, fresnel, desviacionPrisma, desviacionMinima, lenteDelgada, lenteGruesa,
} from '../motores/optica.js';
import { aCSV } from '../nucleo/csv.js';
import { descargarTexto, descargarLienzo, nombreArchivo, avisar as avisarLienzo } from '../componentes/exportar.js';
import { crearEscena, numero, texto } from '../nucleo/escena.js';
import { Historial } from '../nucleo/historial.js';
import { evaluar } from '../nucleo/unidades.js';
import { guardarEscena, abrirEscena, autoguardado, escenaPendiente } from '../componentes/archivos.js';
import { registrarDocumento, confirmarCambios, documentoNuevo, hayCambios } from '../componentes/documento.js';

(function () {
  'use strict';
  const { Trazo, fmt, cantidad, grafica } = Volta;
  const $ = s => document.querySelector(s);
  const GR = Math.PI / 180, DOS_PI = 2 * Math.PI;
  const FAC = { m: 1, cm: 1e-2, mm: 1e-3, nm: 1e-9, '°': GR, '': 1, '%': 0.01 };
  const numCampo = x => String(Number(Number(x).toPrecision(6))).replace('-', '−');
  const simHTML = (a, sub, recto = true) => `<span class="sim">${a}${sub ? `<sub${recto ? ' class="r"' : ''}>${sub}</sub>` : ''}</span>`;
  const dir = a => [Math.cos(a), Math.sin(a)];
  const grados = r => fmt(r / GR, 3) + '°';
  const sub = n => String(n).replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[+d]);

  // ---------------------------------------------------------------------
  // Tipos de objeto
  // ---------------------------------------------------------------------
  const TIPOS = {
    rayo: { nombre: 'Rayo', en: 'Ray', ico: 'o-rayo', fuente: true },
    haz: { nombre: 'Haz paralelo', en: 'Parallel beam', ico: 'o-haz', fuente: true },
    puntual: { nombre: 'Fuente puntual', en: 'Point source', ico: 'o-fuente-luz', fuente: true },
    objeto: { nombre: 'Objeto luminoso', en: 'Luminous object', ico: 'o-objeto-luminoso', fuente: true },
    medio: { nombre: 'Medio', en: 'Medium', ico: 'o-medio' },
    recipiente: { nombre: 'Recipiente', en: 'Container', ico: 'o-recipiente-liquido' },
    espejo: { nombre: 'Espejo', en: 'Mirror', ico: 'o-espejo-plano' },
    lente: { nombre: 'Lente ideal', en: 'Ideal lens', ico: 'o-lente-ideal' },
    divisor: { nombre: 'Divisor de haz', en: 'Beam splitter', ico: 'o-divisor-haz' },
    bloqueador: { nombre: 'Bloqueador', en: 'Blocker', ico: 'o-bloqueador' },
    pantalla: { nombre: 'Pantalla', en: 'Screen', ico: 'o-pantalla-optica' },
    ojo: { nombre: 'Ojo', en: 'Eye', ico: 'o-ojo' },
  };
  const FORMAS = [['rectangulo', 'o-medio', 'Bloque rectangular'], ['prisma', 'o-poligono', 'Prisma'], ['circulo', 'o-disco', 'Círculo (gota)'], ['semicirculo', 'o-arco', 'Semicírculo']];
  const MATS = [['n', 'n fijo'], ['agua', 'Agua'], ['crown', 'Crown'], ['flint', 'Flint'], ['diamante', 'Diamante']];
  /** ¿Espejo curvo (esférico o parabólico)? Los dos usan R y apertura. */
  const curvo = el => el.tipo === 'espejo' && (el.espejo === 'esferico' || el.espejo === 'parabolico');
  const icoDe = el => (curvo(el) ? 'o-espejo-curvo'
    : el.tipo === 'medio' && el.forma.tipo === 'lente' ? 'o-lente-gruesa' : el.tipo === 'medio' && el.forma.tipo === 'lamina' ? 'o-capas' : TIPOS[el.tipo].ico);
  const esFuente = el => !!TIPOS[el.tipo]?.fuente;
  const esLineal = el => ['lente', 'divisor', 'bloqueador', 'pantalla', 'ojo'].includes(el.tipo) || (el.tipo === 'espejo' && !curvo(el));
  const indiceEl = el => (el.material ? { material: el.material } : { n: el.n ?? 1 });

  // ---------------------------------------------------------------------
  // Escenas (mundo en m). Variables: valor en su unidad de pantalla,
  // valor físico = val·factor + offset en cada ruta que fijan.
  // ---------------------------------------------------------------------
  const vari = (sim, val, min, max, paso, u, factor, liga, o = {}) => ({ sim, sub: o.sub, val, min, max, paso, u, factor, offset: o.offset ?? 0, liga });
  const rect = (cx, cy, w, h, g = 0) => ({ tipo: 'rectangulo', centro: [cx, cy], ancho: w, alto: h, giro: g });
  const medio = (nombre, forma, ind) => ({ tipo: 'medio', nombre, forma, ...ind });
  const rayo = (nombre, origen, giroG, lambda = LAMBDA_D) => ({ tipo: 'rayo', nombre, origen, giro: giroG * GR, lambda });
  const LD = LAMBDA_D, L589 = 589e-9;
  const BASE = () => ({
    unidad: 'cm', ambiente: { n: 1 }, parciales: false, maxRebotes: 120, elementos: [], variables: {}, regla: null,
    graficas: ['snell', 'fresnel', 'dispersion'], capas: { angulos: true, prolongaciones: true, imagenes: true, focos: true, valores: true },
    referencia: null, caja: null, sel: 'escena',
  });
  const ESCENAS = [
    {
      clave: 'refraccion', titulo: 'Refracción del aire al agua', tipo: 'Tutorial', parciales: true,
      elementos: [medio('Agua', rect(0, -0.2, 0.4, 0.4), { material: 'agua' }), rayo('Rayo', [-0.08, 0.08], -50, L589)],
      caja: [-0.14, 0.14, -0.12, 0.1], sel: 1,
      variables: { th: vari('θ', 40, 0, 89, 1, '°', GR, ['elementos.1.giro'], { offset: -Math.PI / 2, sub: '1' }) },
    },
    {
      clave: 'reflexion-total', titulo: 'Reflexión total en un semicírculo de vidrio', tipo: 'Tutorial', parciales: true, graficas: ['snell', 'fresnel', 'angulos'],
      elementos: [medio('Semicírculo de vidrio', { tipo: 'semicirculo', centro: [0, 0], radio: 0.06, giro: -35 * GR }, { material: 'crown' }), rayo('Rayo', [0.12, 0], 180, L589)],
      caja: [-0.14, 0.14, -0.09, 0.09], sel: 1,
      variables: { a: vari('α', 35, 0, 80, 0.5, '°', -GR, ['elementos.0.forma.giro']) },
    },
    {
      clave: 'lente-convergente', titulo: 'Lente convergente y su imagen', tipo: 'Tutorial', graficas: ['lente', 'inversas', 'aumento'],
      elementos: [
        { tipo: 'lente', nombre: 'Lente', centro: [0, 0], giro: 0, largo: 0.12, f: 0.1 },
        { tipo: 'objeto', nombre: 'Objeto', origen: [-0.3, 0], altura: 0.03, giro: 0, desvio: -6 * GR, abertura: 24 * GR, rayos: 7, lambda: L589 },
        { tipo: 'pantalla', nombre: 'Pantalla', centro: [0.2, -0.01], giro: Math.PI, largo: 0.1 },
      ],
      caja: [-0.34, 0.2, -0.09, 0.09], sel: 1,
      variables: {
        s: vari('s', 30, 4, 60, 0.5, 'cm', -0.01, ['elementos.1.origen.0']),
        f: vari('f', 10, 2, 30, 0.5, 'cm', 0.01, ['elementos.0.f']),
        xp: vari('x', 20, 2, 40, 0.5, 'cm', 0.01, ['elementos.2.centro.0'], { sub: 'P' }),
      },
    },
    {
      clave: 'espejo-concavo', titulo: 'Espejo cóncavo', tipo: 'Tutorial', graficas: ['lente', 'inversas', 'aumento'],
      elementos: [
        { tipo: 'espejo', nombre: 'Espejo cóncavo', espejo: 'esferico', centro: [0, 0], giro: Math.PI, R: 0.2, apertura: 0.12 },
        { tipo: 'objeto', nombre: 'Objeto', origen: [-0.3, 0], altura: 0.02, giro: 0, desvio: -4 * GR, abertura: 12 * GR, rayos: 5, lambda: L589 },
      ],
      caja: [-0.34, 0.04, -0.08, 0.08], sel: 1,
      variables: { s: vari('s', 30, 4, 60, 0.5, 'cm', -0.01, ['elementos.1.origen.0']), R: vari('R', 20, 6, 60, 1, 'cm', 0.01, ['elementos.0.R']) },
    },
    {
      clave: 'espejo-parabolico', titulo: 'Espejo parabólico y aberración esférica', tipo: 'Ejemplo', graficas: ['lente', 'inversas', 'aumento'],
      elementos: [
        { tipo: 'espejo', nombre: 'Espejo parabólico', espejo: 'parabolico', centro: [0, 0], giro: Math.PI, R: 0.2, apertura: 0.16 },
        { tipo: 'haz', nombre: 'Haz', origen: [-0.3, 0], giro: 0, ancho: 0.15, rayos: 15, lambda: L589 },
      ],
      caja: [-0.32, 0.02, -0.1, 0.1], sel: 0,
    },
    {
      clave: 'prisma-blanca', titulo: 'Prisma con luz blanca', tipo: 'Ejemplo', graficas: ['desviacion', 'dispersion', 'pantalla'],
      elementos: [
        medio('Prisma de flint', { tipo: 'prisma', centro: [0, 0], lado: 0.08, angulo: 60 * GR, giro: 0 }, { material: 'flint' }),
        { ...rayo('Luz blanca', [-0.12, -0.03], 20.5, null) },
        { tipo: 'pantalla', nombre: 'Pantalla', centro: [0.15, -0.075], giro: 160 * GR, largo: 0.1 },
      ],
      caja: [-0.14, 0.2, -0.13, 0.07], sel: 1,
      variables: { th: vari('θ', 50, 30, 80, 0.5, '°', GR, ['elementos.1.giro'], { offset: -30 * GR, sub: '1' }), A: vari('A', 60, 30, 75, 1, '°', GR, ['elementos.0.forma.angulo']) },
    },
    {
      clave: 'profundidad', titulo: 'Profundidad aparente', tipo: 'Ejemplo', graficas: ['snell', 'fresnel', 'angulos'],
      elementos: [
        { tipo: 'recipiente', nombre: 'Agua', centro: [0, -0.12], ancho: 0.24, nivel: 0.12, alto: 0.14, n: 1.333 },
        { tipo: 'puntual', nombre: 'Moneda', origen: [0, -0.118], giro: Math.PI / 2, abertura: 4 * GR, rayos: 9, lambda: L589 },
        { tipo: 'ojo', nombre: 'Ojo', centro: [0, 0.2], giro: -Math.PI / 2, largo: 0.02 },
      ],
      caja: [-0.2, 0.2, -0.14, 0.23], sel: 2, capas: { angulos: false },
      variables: { n: vari('n', 1.333, 1, 2.5, 0.001, '', 1, ['elementos.0.n']), h: vari('h', 11.8, 2, 11.8, 0.2, 'cm', -0.01, ['elementos.1.origen.1']) },
    },
    {
      clave: 'fibra', titulo: 'Fibra óptica', tipo: 'Ejemplo', graficas: ['snell', 'angulos', 'pantalla'], referencia: 1,
      elementos: [
        medio('Revestimiento', rect(0, 0, 0.32, 0.05), { n: 1.4 }),
        medio('Núcleo', rect(0, 0, 0.32, 0.024), { n: 1.5 }),
        rayo('Rayo', [-0.18, 0.004], -25, L589),
        { tipo: 'pantalla', nombre: 'Pantalla', centro: [0.2, 0], giro: Math.PI, largo: 0.08 },
      ],
      caja: [-0.2, 0.22, -0.07, 0.07], sel: 2,
      variables: { th: vari('θ', 25, 0, 80, 0.5, '°', -GR, ['elementos.2.giro'], { sub: '1' }), n2: vari('n', 1.4, 1, 1.5, 0.01, '', 1, ['elementos.0.n'], { sub: 'r' }) },
    },
    {
      clave: 'arcoiris', titulo: 'Arcoíris en una gota', tipo: 'Ejemplo', parciales: true, graficas: ['snell', 'fresnel', 'dispersion'],
      elementos: [
        medio('Gota de agua', { tipo: 'circulo', centro: [0, 0], radio: 0.05 }, { material: 'agua' }),
        { tipo: 'haz', nombre: 'Luz del Sol', origen: [-0.1, 0.0425], giro: 0, ancho: 0.003, rayos: 3, lambda: null },
      ],
      caja: [-0.12, 0.12, -0.09, 0.08], sel: 1, capas: { angulos: false },
      variables: { h: vari('h', 4.25, 0, 4.95, 0.05, 'cm', 0.01, ['elementos.1.origen.1']) },
    },
    {
      clave: 'lente-divergente', titulo: 'Lente divergente: imagen virtual', tipo: 'Ejemplo', graficas: ['lente', 'inversas', 'aumento'],
      elementos: [
        { tipo: 'lente', nombre: 'Lente', centro: [0, 0], giro: 0, largo: 0.12, f: -0.1 },
        { tipo: 'objeto', nombre: 'Objeto', origen: [-0.2, 0], altura: 0.03, giro: 0, desvio: -4 * GR, abertura: 24 * GR, rayos: 7, lambda: L589 },
      ],
      caja: [-0.24, 0.2, -0.09, 0.09], sel: 1,
      variables: { s: vari('s', 20, 2, 50, 0.5, 'cm', -0.01, ['elementos.1.origen.0']), f: vari('f', -10, -30, -2, 0.5, 'cm', 0.01, ['elementos.0.f']) },
    },
    {
      clave: 'lente-gruesa', titulo: 'Lente gruesa: aberración cromática', tipo: 'Ejemplo', graficas: ['dispersion', 'lente', 'pantalla'],
      elementos: [
        medio('Lente de flint', { tipo: 'lente', centro: [0, 0], giro: 0, R1: 0.12, R2: -0.12, espesor: 0.03, apertura: 0.08 }, { material: 'flint' }),
        { tipo: 'haz', nombre: 'Luz blanca', origen: [-0.12, 0], giro: 0, ancho: 0.06, rayos: 7, lambda: null },
        { tipo: 'pantalla', nombre: 'Pantalla', centro: [0.11, 0], giro: Math.PI, largo: 0.05 },
      ],
      caja: [-0.14, 0.18, -0.07, 0.07], sel: 0,
      variables: { xp: vari('x', 11, 5, 18, 0.1, 'cm', 0.01, ['elementos.2.centro.0'], { sub: 'P' }) },
    },
    // ----------------------------------------------------------------- MEXT
    {
      clave: 'mext-2023-1-5', titulo: 'Rayo que cruza tres capas', tipo: 'MEXT', anio: '2023 1-(5)', graficas: ['snell', 'invariante', 'fresnel'],
      elementos: [
        medio('Capa 1', rect(0, 0.03, 0.3, 0.03), { n: 1.4 }), medio('Capa 2', rect(0, 0, 0.3, 0.03), { n: 1.7 }), medio('Capa 3', rect(0, -0.03, 0.3, 0.03), { n: 1.2 }),
        rayo('Rayo', [-0.12, 0.044], -45, L589),
      ],
      caja: [-0.16, 0.16, -0.07, 0.06], sel: 3,
      variables: { n1: vari('n', 1.4, 1, 2, 0.01, '', 1, ['elementos.0.n'], { sub: '1' }), n2: vari('n', 1.7, 1, 2, 0.01, '', 1, ['elementos.1.n'], { sub: '2' }), n3: vari('n', 1.2, 1, 2, 0.01, '', 1, ['elementos.2.n'], { sub: '3' }) },
    },
    {
      clave: 'mext-2017-1-5', titulo: 'Moneda en el fondo de un recipiente lleno', tipo: 'MEXT', anio: '2017 1-(5)', graficas: ['snell', 'fresnel', 'invariante'],
      elementos: (() => {
        // El ojo mira al borde interior del recipiente (1 mm dentro) desde el ángulo con que veía la esquina lejana
        const h = 0.1, w = 0.1, d = 0.001, th = Math.atan2(h, w - d), u = [Math.cos(th), -Math.sin(th)], P = [-w / 2 + d, h];
        return [
          { tipo: 'recipiente', nombre: 'Recipiente con líquido', centro: [0, 0], ancho: w, nivel: h, alto: h, n: 1.33 },
          { tipo: 'ojo', nombre: 'Ojo', centro: [P[0] - 0.066 * u[0], P[1] - 0.066 * u[1]], giro: -th - Math.PI, largo: 0.006 },
          { tipo: 'rayo', nombre: 'Línea de visión', origen: [P[0] - 0.055 * u[0], P[1] - 0.055 * u[1]], giro: -th, lambda: L589 },
          // La moneda queda donde llega la línea de visión con n = 1.33
          { tipo: 'bloqueador', nombre: 'Moneda', centro: [P[0] + h * Math.tan(Math.asin(Math.sin(Math.PI / 2 - th) / 1.33)), 0.0015], giro: Math.PI / 2, largo: 0.012 },
        ];
      })(),
      caja: [-0.12, 0.08, -0.02, 0.16], sel: 2,
      variables: { n: vari('n', 1.33, 1, 2, 0.01, '', 1, ['elementos.0.n']) },
    },
    {
      clave: 'mext-2016-5', titulo: 'Reflexión total en un bloque entre dos vidrios', tipo: 'MEXT', anio: '2016 P5', graficas: ['snell', 'fresnel', 'angulos'], referencia: 1,
      elementos: [
        medio('Vidrio n₂ (arriba)', rect(0, 0.035, 0.3, 0.03), { n: 1.4 }), medio('Vidrio n₂ (abajo)', rect(0, -0.035, 0.3, 0.03), { n: 1.4 }),
        medio('Bloque n₁', rect(0, 0, 0.3, 0.04), { n: 1.5 }),
        rayo('Rayo', [0.153, 0.001], 210, L589),
      ],
      caja: [-0.17, 0.19, -0.06, 0.06], sel: 3,
      variables: { th: vari('θ', 30, 0, 80, 0.5, '°', GR, ['elementos.3.giro'], { offset: Math.PI }), n2: vari('n', 1.4, 1, 1.5, 0.01, '', 1, ['elementos.0.n', 'elementos.1.n'], { sub: '2' }) },
    },
    {
      clave: 'mext-2015-1-5', titulo: 'Rayo que pasa entre dos láminas', tipo: 'MEXT', anio: '2015 1-(5)', graficas: ['snell', 'fresnel', 'invariante'],
      elementos: [medio('Lámina n₁', rect(0, 0.03, 0.24, 0.06), { n: 1.6 }), medio('Lámina n₂', rect(0, -0.03, 0.24, 0.06), { n: 1.3 }), rayo('Rayo', [-0.035, 0.055], -70, L589)],
      caja: [-0.14, 0.14, -0.07, 0.07], sel: 2,
      variables: { n1: vari('n', 1.6, 1, 2, 0.01, '', 1, ['elementos.0.n'], { sub: '1' }), n2: vari('n', 1.3, 1, 2, 0.01, '', 1, ['elementos.1.n'], { sub: '2' }) },
    },
    {
      clave: 'mext-2014-1-5', titulo: 'Rayo que entra en una gota', tipo: 'MEXT', anio: '2014 1-(5)', graficas: ['snell', 'fresnel', 'angulos'],
      elementos: [medio('Gota', { tipo: 'circulo', centro: [0, 0], radio: 0.05 }, { n: 1.333 }), rayo('Rayo', [-0.1, 0.03], 0, L589)],
      caja: [-0.12, 0.08, -0.07, 0.07], sel: 1,
      variables: { h: vari('h', 3, 0, 4.9, 0.1, 'cm', 0.01, ['elementos.1.origen.1']), n: vari('n', 1.333, 1, 2, 0.001, '', 1, ['elementos.0.n']) },
    },
    {
      clave: 'mext-2012-1-4', titulo: 'Bloque sobre otro medio: reflexión total en B', tipo: 'MEXT', anio: '2012 1-(4)', graficas: ['snell', 'fresnel', 'angulos'], referencia: 1,
      elementos: [
        medio('Objeto 1 (n₁)', rect(0.05, -0.04, 0.3, 0.08), { n: 1.3 }),
        medio('Objeto 2 (n₂)', rect(0.05, 0.015, 0.12, 0.03), { n: 1.5 }),
        rayo('Rayo', [-0.015, 0.0285], -40, L589),
      ],
      caja: [-0.05, 0.17, -0.06, 0.06], sel: 2,
      variables: { th: vari('θ', 40, 0, 85, 0.5, '°', -GR, ['elementos.2.giro']) },
    },
    {
      clave: 'mext-2009-1-5', titulo: 'Espejo en el fondo de un líquido', tipo: 'MEXT', anio: '2009 1-(5)', graficas: ['snell', 'fresnel', 'angulos'],
      elementos: [
        medio('Líquido', rect(0, -0.05, 0.3, 0.1), { n: 1.43 }),
        { tipo: 'espejo', nombre: 'Espejo', centro: [0, -0.1], giro: Math.PI / 2, largo: 0.3 },
        { tipo: 'puntual', nombre: 'Objeto en la superficie', origen: [0, -1e-4], giro: -Math.PI / 2, abertura: 4 * GR, rayos: 9, lambda: L589 },
        { tipo: 'ojo', nombre: 'Ojo', centro: [0, 0.12], giro: -Math.PI / 2, largo: 0.02 },
      ],
      caja: [-0.17, 0.17, -0.17, 0.15], sel: 3, capas: { angulos: false },
      variables: { n: vari('n', 1.43, 1, 2, 0.01, '', 1, ['elementos.0.n']) },
    },
    {
      clave: 'mext-2010-3-c', titulo: 'Luz blanca: rendija y prisma', tipo: 'MEXT', anio: '2010 3-C', graficas: ['desviacion', 'dispersion', 'pantalla'],
      elementos: [
        { tipo: 'bloqueador', nombre: 'Rendija (arriba)', centro: [-0.1, 0.032], giro: 0, largo: 0.06 },
        { tipo: 'bloqueador', nombre: 'Rendija (abajo)', centro: [-0.1, -0.03], giro: 0, largo: 0.056 },
        medio('Prisma', { tipo: 'prisma', centro: [-0.01, -0.0123], lado: 0.06, angulo: 60 * GR, giro: -20 * GR }, { material: 'flint' }),
        { tipo: 'rayo', nombre: 'Luz blanca', origen: [-0.16, 0.001], giro: 0, lambda: null },
        { tipo: 'pantalla', nombre: 'Pantalla', centro: [0.12, -0.07], giro: Math.PI / 2, largo: 0.16 },
      ],
      caja: [-0.18, 0.2, -0.1, 0.07], sel: 4,
    },
  ];
  const completa = e => {
    const b = BASE(), o = JSON.parse(JSON.stringify({ ...b, ...e, capas: { ...b.capas, ...(e.capas || {}) } }));
    o.elementos.forEach((el, i) => { el.id = 'e' + (i + 1); if (!el.nombre) el.nombre = TIPOS[el.tipo].nombre; });
    if (typeof o.sel === 'number') o.sel = o.elementos[o.sel]?.id ?? 'escena';
    // las variables pueden llevar offset ±Infinity tras JSON: se normaliza
    for (const d of Object.values(o.variables)) d.offset = d.offset ?? 0;
    return o;
  };
  const escenaDe = clave => ESCENAS.find(e => e.clave === clave) || ESCENAS[0];

  // ---------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------
  /** @type {any} */ let ESC = completa(ESCENAS[0]);
  /** @type {any} */ let RES = null;
  let ERROR = null, IMGS = [];
  let sel = 'escena', herramienta = null, vistaTocada = false, escala0 = 1, espacioPulsado = false;
  let arrastre = null, paneo = null, hover = null, cursor = null;
  let autoguardar = false, historial = null, contador = 100;
  const lienzo = $('#lienzo'), area = $('#area');
  const tz = new Trazo(lienzo);
  const U = () => ESC.unidad || 'cm', FU = () => FAC[U()];
  const L = (v, cifras = 4) => cantidad(v / FU(), U(), cifras);
  const elDe = id => ESC.elementos.find(e => e.id === id);
  const idxDe = id => ESC.elementos.findIndex(e => e.id === id);

  // ---------------------------------------------------------------------
  // Escena → motor
  // ---------------------------------------------------------------------
  function escenaMotor() {
    return {
      elementos: ESC.elementos.map(({ id, nombre, ...el }) => { void id; void nombre; return el; }),
      ambiente: ESC.ambiente, opciones: { parciales: ESC.parciales, maxRebotes: ESC.maxRebotes, umbral: 2e-3, maxSegmentos: 40000 },
    };
  }
  function simular() {
    try { RES = trazar(escenaMotor()); ERROR = null; }
    catch (e) { RES = null; ERROR = e.message; }
    IMGS = RES ? imagenesVisibles() : [];
  }
  // Imágenes que se muestran: nítidas, de λ única o blanca sin separar
  function imagenesVisibles() {
    const todas = imagenesTrazadas(RES), r = [];
    for (const im of todas) {
      if (!im.p || im.infinito) continue;
      const el = ESC.elementos[im.fuente];
      if (!el || (el.tipo !== 'puntual' && el.tipo !== 'objeto' && el.tipo !== 'haz')) continue;
      // De un haz paralelo solo tiene sentido su foco (real), con varios rayos
      if (el.tipo === 'haz' && (!im.real || im.rayos < 4)) continue;
      if (el.lambda == null && im.lambda != null && Math.abs(im.lambda - 550e-9) > 1e-12) continue;
      // Nitidez: dispersión pequeña frente a la distancia a la última desviación
      const cx = im.rectas.reduce((s, q) => s + q.p[0], 0) / im.rectas.length, cy = im.rectas.reduce((s, q) => s + q.p[1], 0) / im.rectas.length;
      const dist = Math.hypot(im.p[0] - cx, im.p[1] - cy) || 1e-9;
      if (!(im.rms < 0.02 * dist + 1e-9)) continue;
      if (dist > 50 * (RES.prep.escala || 1)) continue;
      r.push(im);
    }
    return r;
  }
  // Camino principal de un rayo de una fuente: se sigue la salida principal
  // (transmitido o reflejado total) de cada interacción; con luz blanca
  // separada, la componente más cercana a 550 nm
  function principal(k, rayoIdx = null) {
    if (!RES) return [];
    const el = ESC.elementos[k]; if (!el) return [];
    const r = rayoIdx ?? rayoRef(k);
    const porNivel = new Map();
    for (const it of RES.interacciones) {
      if (it.fuente !== k || it.rayo !== r || it.punto !== 0) continue;
      if (!porNivel.has(it.nivel)) porNivel.set(it.nivel, []);
      porNivel.get(it.nivel).push(it);
    }
    const peso = it => it.I / (it.I0 || 1) - (it.lambda != null && el.lambda == null ? Math.abs(it.lambda - 550e-9) * 1e3 : 0);
    const camino = [];
    let prev = null;
    for (let n = 0; porNivel.has(n); n++) {
      const cands = porNivel.get(n).filter(it => !prev || (prev.salida && Math.abs(it.d[0] - prev.salida[0]) + Math.abs(it.d[1] - prev.salida[1]) < 1e-9
        && Math.abs((it.p[0] - prev.p[0]) * prev.salida[1] - (it.p[1] - prev.p[1]) * prev.salida[0]) < 1e-9 * (RES.prep.escala || 1)));
      if (!cands.length) break;
      prev = cands.reduce((a, b) => (peso(b) > peso(a) ? b : a));
      if (prev.I / (prev.I0 || 1) < 0.02) break;
      camino.push(prev);
    }
    return camino;
  }
  // Fuente de referencia: la seleccionada si es un rayo o un haz; si no, el primer rayo
  function fuenteRef() {
    const s = elDe(sel);
    if (s && (s.tipo === 'rayo' || s.tipo === 'haz' || s.tipo === 'puntual')) return idxDe(sel);
    for (const t of ['rayo', 'haz', 'puntual']) { const k = ESC.elementos.findIndex(e => e.tipo === t); if (k >= 0) return k; }
    return -1;
  }
  // Rayo de referencia de una fuente: el central de un haz; en una fuente
  // puntual, el que llega al ojo más cerca del centro, o el central
  function rayoRef(k) {
    const el = ESC.elementos[k];
    if (!el || el.tipo === 'rayo') return 0;
    const n = Math.max(1, Math.round(el.rayos ?? 7)), centro = Math.floor((n - 1) / 2);
    if (el.tipo !== 'puntual' || !RES) return centro;
    const vistos = RES.impactos.filter(h => h.fuente === k && h.rol === 'ojo').map(h => h.rayo);
    return vistos.length ? vistos.reduce((a, b) => (Math.abs(b - centro) < Math.abs(a - centro) ? b : a)) : centro;
  }
  // Interfaz de referencia (gráficas de Snell y Fresnel)
  function interfazRef() {
    const k = fuenteRef(); if (k < 0) return null;
    const camino = principal(k).filter(i => i.tipo === 'refraccion' || i.tipo === 'total');
    if (!camino.length) return null;
    if (ESC.referencia != null && camino[ESC.referencia]) return camino[ESC.referencia];
    return camino.find(i => i.theta1 > 1e-3) || camino[0];
  }

  // ---------------------------------------------------------------------
  // Geometría de cada objeto
  // ---------------------------------------------------------------------
  const posDe = el => (el.tipo === 'medio' ? el.forma.centro : esFuente(el) ? el.origen : el.centro);
  function moverA(el, p) {
    if (el.tipo === 'medio') el.forma.centro = p; else if (esFuente(el)) el.origen = p; else el.centro = p;
  }
  const giroDe = el => (el.tipo === 'medio' ? el.forma.giro ?? 0 : el.giro ?? 0);
  function girarA(el, g) { if (el.tipo === 'medio') el.forma.giro = g; else el.giro = g; }
  // Extremos de un elemento lineal (mundo)
  function extremos(el) {
    const e = dir(el.giro ?? 0), t = [-e[1], e[0]], h = el.largo / 2;
    return [[el.centro[0] - t[0] * h, el.centro[1] - t[1] * h], [el.centro[0] + t[0] * h, el.centro[1] + t[1] * h]];
  }
  // Arco de un espejo esférico: centro de curvatura y ángulos
  function arcoEspejo(el) {
    const e = dir(el.giro ?? 0), R = el.R, c = [el.centro[0] + e[0] * R, el.centro[1] + e[1] * R];
    const al = Math.asin(Math.min(1, el.apertura / 2 / Math.abs(R))), av = Math.atan2(el.centro[1] - c[1], el.centro[0] - c[0]);
    return { c, r: Math.abs(R), a0: av - al, a1: av + al };
  }
  /**
   * Puntos de un espejo curvo: el arco del esférico o la parábola
   * X = Y²/(2R) del parabólico (vértice en el centro, eje hacia su cara).
   */
  function curvaEspejo(el, n = 48) {
    if (el.espejo !== 'parabolico') return puntosArco(arcoEspejo(el), n);
    const e = dir(el.giro ?? 0), lat = [-e[1], e[0]], h = el.apertura / 2, r = [];
    for (let i = 0; i <= n; i++) { const y = -h + 2 * h * i / n, X = y * y / (2 * el.R); r.push([el.centro[0] + lat[0] * y + e[0] * X, el.centro[1] + lat[1] * y + e[1] * X]); }
    return r;
  }
  function puntosArco(a, n = 48) { const r = []; for (let i = 0; i <= n; i++) { const t = a.a0 + (a.a1 - a.a0) * i / n; r.push([a.c[0] + a.r * Math.cos(t), a.c[1] + a.r * Math.sin(t)]); } return r; }
  function formaRecipiente(el) { const g = el.giro ?? 0, H = el.nivel, d = dir(g + Math.PI / 2); return { tipo: 'rectangulo', centro: [el.centro[0] + d[0] * H / 2, el.centro[1] + d[1] * H / 2], ancho: el.ancho, alto: H, giro: g }; }
  function paredesRecipiente(el) {
    const g = el.giro ?? 0, w = el.ancho, P = Math.max(el.alto ?? el.nivel, el.nivel), c = Math.cos(g), s = Math.sin(g);
    const m = ([x, y]) => [el.centro[0] + c * x - s * y, el.centro[1] + s * x + c * y];
    return [m([-w / 2, P]), m([-w / 2, 0]), m([w / 2, 0]), m([w / 2, P])];
  }
  const verticesMedio = el => (el.tipo === 'recipiente' ? verticesForma(formaRecipiente(el)) : verticesForma(el.forma, 96));
  // Punto de la punta de un objeto luminoso
  const puntaObjeto = el => { const g = el.giro ?? 0; return [el.origen[0] - Math.sin(g) * el.altura, el.origen[1] + Math.cos(g) * el.altura]; };
  // Asa de giro (pantalla): a 46 px del centro en la dirección de giro
  function asaGiro(el) {
    if (el.tipo === 'objeto') return null;
    const [X, Y] = tz.vista.P(posDe(el)), g = giroDe(el), d = el.tipo === 'medio' && el.forma.tipo !== 'lente' ? 58 : 46;
    return [X + Math.cos(g) * d, Y - Math.sin(g) * d];
  }

  // ---------------------------------------------------------------------
  // Dibujo
  // ---------------------------------------------------------------------
  function encuadrar() {
    let caja = ESC.caja;
    if (!caja) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      const pt = p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); };
      for (const el of ESC.elementos) {
        if (el.tipo === 'medio' || el.tipo === 'recipiente') verticesMedio(el).forEach(pt);
        else if (curvo(el)) curvaEspejo(el, 6).forEach(pt);
        else if (esLineal(el)) extremos(el).forEach(pt);
        else { pt(el.origen); if (el.tipo === 'objeto') pt(puntaObjeto(el)); }
      }
      if (!Number.isFinite(x0)) { x0 = -0.1; x1 = 0.1; y0 = -0.1; y1 = 0.1; }
      const m = 0.12 * Math.max(x1 - x0, y1 - y0, 0.02);
      caja = [x0 - m, x1 + m, y0 - m, y1 + m];
    }
    tz.vista.encuadrar({ x0: caja[0], x1: caja[1], y0: caja[2], y1: caja[3] }, { x: 0, y: 0, w: tz.w, h: tz.h }, 48);
  }

  function dibujar() {
    // Zonas donde no van etiquetas: barras flotantes, barra de escala y números del eje x
    const Y0 = tz.vista.Y(0);
    const X0 = tz.vista.X(0), simbolos = [];
    for (const el of ESC.elementos) { if (esFuente(el)) { const [X, Y] = tz.vista.P(el.origen); simbolos.push({ x: X - 9, y: Y - 9, w: 18, h: 18 }); } else if (el.tipo === 'ojo') { const [X, Y] = tz.vista.P(el.centro); simbolos.push({ x: X - 13, y: Y - 13, w: 26, h: 26 }); } }
    tz.limpiar(); tz.opticaEtiquetas([...tz.zonasFlotantes(), ...simbolos, { x: 8, y: tz.h - 80, w: 170, h: 34 }]);
    tz.cuadricula();
    const huecos = [];
    for (const el of ESC.elementos) if (esFuente(el)) { const [X, Y] = tz.vista.P(el.origen); huecos.push([X, Y, 10]); }
    tz.opticaEjes({ unidad: U(), factor: 1 / FU(), huecos });

    // 4 · Medios
    for (const el of ESC.elementos) {
      if (el.tipo === 'medio') tz.opticaMedio(verticesMedio(el), { n: indiceDe(indiceEl(el)), grueso: hover === el.id });
      else if (el.tipo === 'recipiente') tz.opticaMedio(verticesMedio(el), { n: indiceDe(indiceEl(el)), fluido: true, grueso: hover === el.id });
    }
    // 5 · Construcción: ejes ópticos y focos, prolongaciones
    if (ESC.capas.focos) dibujarFocos();
    if (RES && ESC.capas.prolongaciones && ESC.capas.imagenes) dibujarProlongaciones();

    // 6 · Materia
    for (const el of ESC.elementos) dibujarElemento(el);

    // 7 · Rayos (los tenues debajo)
    if (RES) {
      const segs = RES.segmentos.slice().sort((a, b) => a.rel - b.rel);
      for (const s of segs) tz.opticaRayo(s.a, s.b, { lambda: s.lambda, rel: s.rel });
    }
    // Fuentes encima de sus rayos
    for (const el of ESC.elementos) if (esFuente(el)) dibujarFuente(el);
    // Imágenes
    if (RES && ESC.capas.imagenes) dibujarImagenes();
    // 8 · Instrumentos: ángulos y regla
    if (RES && ESC.capas.angulos) dibujarAngulos();
    dibujarRegla();
    // Valores junto a los objetos
    if (ESC.capas.valores) dibujarValores();
    // 10 · Selección
    dibujarSeleccion();
    if (ERROR) tz.texto(ERROR, tz.w / 2, tz.h / 2, { fuente: 'ui', tam: 13, color: 'error', alinear: 'center', halo: true });
    else if (RES && RES.incompleta) tz.texto(RES.avisos.join(' '), tz.w / 2, 26, { fuente: 'ui', tam: 12, color: 'aviso', alinear: 'center', halo: true });
    tz.opticaBarraEscala(16, tz.h - 56, U(), 1 / FU());
  }

  function dibujarElemento(el) {
    const g = hover === el.id;
    switch (el.tipo) {
      case 'recipiente': tz.superficie(paredesRecipiente(el)); break;
      case 'espejo':
        if (el.espejo === 'esferico') {
          const a = arcoEspejo(el), pts = puntosArco(a), p0 = pts[0], nf = R => [(a.c[0] - p0[0]) / a.r * Math.sign(R), (a.c[1] - p0[1]) / a.r * Math.sign(R)];
          tz.opticaEspejo(pts, nf(el.R), { grueso: g });
        } else if (el.espejo === 'parabolico') {
          // Normal de la cara en el primer punto (Y = −h): eje − lat·Y/(2f), con f = R/2
          const e = dir(el.giro ?? 0), lat = [-e[1], e[0]], y = -el.apertura / 2, k = -y / el.R, L = Math.hypot(1, k);
          tz.opticaEspejo(curvaEspejo(el), [(e[0] + lat[0] * k) / L, (e[1] + lat[1] * k) / L], { grueso: g });
        } else tz.opticaEspejo(extremos(el), dir(el.giro ?? 0), { grueso: g });
        break;
      case 'lente': { const [a, b] = extremos(el); tz.opticaLenteIdeal(a, b, el.f, { grueso: g }); break; }
      case 'divisor': { const [a, b] = extremos(el); tz.opticaDivisor(a, b, { grueso: g }); break; }
      case 'bloqueador': { const [a, b] = extremos(el); tz.opticaBloqueador(a, b, { grueso: g }); break; }
      case 'pantalla': {
        // La luz recibida se pinta en la cara de atrás (la contraria al eje)
        const [a, b] = extremos(el), e = dir(el.giro ?? 0), [x1, y1] = tz.vista.P(a), [x2, y2] = tz.vista.P(b);
        const lado = Math.sign(-(y2 - y1) * -e[0] + (x2 - x1) * e[1]) || 1;
        tz.opticaPantalla(a, b, bandasPantalla(el), { grueso: g, lado }); break;
      }
      case 'ojo': tz.opticaOjo(el.centro, dir((el.giro ?? 0) + Math.PI), { grueso: g }); break;
      default: break;
    }
  }
  function dibujarFuente(el) {
    const g = hover === el.id, d = dir(el.giro ?? 0);
    if (el.tipo === 'rayo') tz.opticaEmisor(el.origen, el.origen, d, { grueso: g });
    else if (el.tipo === 'haz') { const t = [-d[1], d[0]], w = el.ancho / 2; tz.opticaEmisor([el.origen[0] - t[0] * w, el.origen[1] - t[1] * w], [el.origen[0] + t[0] * w, el.origen[1] + t[1] * w], d, { grueso: g }); }
    else if (el.tipo === 'puntual') tz.opticaFuente(el.origen, { grueso: g });
    else if (el.tipo === 'objeto') tz.opticaObjeto(el.origen, puntaObjeto(el), { grueso: g });
  }
  // Luz que recibe una pantalla: histograma por λ, sumado con su color real
  function bandasPantalla(el) {
    if (!RES) return [];
    const k = ESC.elementos.indexOf(el), n = Math.max(16, Math.min(400, Math.round(el.largo * tz.vista.escala / 3))), h = intensidadPantalla(RES, k, el.largo, n);
    let max = 0; const lin = Array.from({ length: n }, () => [0, 0, 0]);
    for (const [l, arr] of h.porLambda) {
      const c = tz.opticaLuzLambda(l || null);
      for (let i = 0; i < n; i++) if (arr[i]) { lin[i][0] += arr[i] * c[0]; lin[i][1] += arr[i] * c[1]; lin[i][2] += arr[i] * c[2]; }
    }
    for (const c of lin) max = Math.max(max, c[0], c[1], c[2]);
    if (!(max > 0)) return [];
    // La franja va de un extremo (a) al otro (b): s crece de a a b
    return lin.map((c, i) => ({ s0: i / n, s1: (i + 1) / n, lin: c.map(x => x / max) })).filter(b => b.lin.some(x => x > 0));
  }
  function dibujarFocos() {
    for (const el of ESC.elementos) {
      const etq = s => [{ t: 'F', f: 'sim', tam: 13 }, ...(s ? [{ t: '′', f: 'simRecta', tam: 13 }] : [])];
      if (el.tipo === 'lente') {
        const e = dir(el.giro ?? 0), c = el.centro, f = el.f, R = 1.6 * Math.abs(f);
        tz.opticaEje([c[0] - e[0] * R, c[1] - e[1] * R], [c[0] + e[0] * R, c[1] + e[1] * R]);
        tz.opticaFoco([c[0] - e[0] * f, c[1] - e[1] * f], etq(false)); tz.opticaFoco([c[0] + e[0] * f, c[1] + e[1] * f], etq(true));
      } else if (curvo(el)) {
        const e = dir(el.giro ?? 0), c = el.centro, R = el.R;
        tz.opticaEje(c, [c[0] + e[0] * (Math.abs(R) * 1.3) * Math.sign(R || 1), c[1] + e[1] * Math.abs(R) * 1.3 * Math.sign(R || 1)]);
        tz.opticaFoco([c[0] + e[0] * R / 2, c[1] + e[1] * R / 2], etq(false));
        // El parabólico no tiene centro de curvatura (solo su vértice tiene radio R)
        if (el.espejo === 'esferico') tz.opticaFoco([c[0] + e[0] * R, c[1] + e[1] * R], [{ t: 'C', f: 'sim', tam: 13 }]);
      } else if (el.tipo === 'medio' && el.forma.tipo === 'lente') {
        const n = indiceDe(indiceEl(el), LAMBDA_D), G = lenteGruesa(n, el.forma.R1, el.forma.R2, el.forma.espesor, indiceDe(ESC.ambiente));
        if (!Number.isFinite(G.f)) continue;
        const e = dir(el.forma.giro ?? 0), c = el.forma.centro, x2 = el.forma.espesor / 2 + G.posterior, x1 = -el.forma.espesor / 2 - G.anterior;
        tz.opticaEje([c[0] + e[0] * Math.min(x1, -0.02) * 1.3, c[1] + e[1] * Math.min(x1, -0.02) * 1.3], [c[0] + e[0] * Math.max(x2, 0.02) * 1.3, c[1] + e[1] * Math.max(x2, 0.02) * 1.3]);
        tz.opticaFoco([c[0] + e[0] * x1, c[1] + e[1] * x1], etq(false)); tz.opticaFoco([c[0] + e[0] * x2, c[1] + e[1] * x2], etq(true));
      }
    }
  }
  // Prolongaciones hacia las imágenes virtuales
  function dibujarProlongaciones() {
    for (const im of IMGS) {
      if (im.real) continue;
      for (const r of im.rectas) tz.opticaProlongacion(r.p, im.p, { lambda: im.lambda ?? ESC.elementos[im.fuente].lambda ?? null, rel: 0.8 });
    }
  }
  function dibujarImagenes() {
    const usados = new Set();
    for (const im of IMGS) {
      const el = ESC.elementos[im.fuente], clave = `${im.fuente}|${im.firma}|${im.lambda}|${im.ojo}`;
      if (el.tipo === 'objeto') {
        if (im.punto !== 0 || usados.has(clave)) continue;
        const pie = IMGS.find(q => q.fuente === im.fuente && q.punto === 1 && q.firma === im.firma && q.lambda === im.lambda && q.ojo === im.ojo);
        usados.add(clave);
        if (pie) tz.opticaImagen(pie.p, im.p, im.real);
        else tz.opticaImagenPunto(im.p, im.real);
      } else if (el.tipo === 'puntual' || el.tipo === 'haz') tz.opticaImagenPunto(im.p, im.real);
    }
  }
  // Ángulos en las interfaces del camino principal de los rayos
  function dibujarAngulos() {
    const fuentes = ESC.elementos.map((el, k) => [el, k]).filter(([el]) => el.tipo === 'rayo' || (el.tipo === 'haz' && el.id === sel));
    for (const [el, k] of fuentes) {
      const camino = principal(k).filter(i => i.tipo !== 'lente' && i.tipo !== 'divisor').slice(0, 5);
      for (const it of camino) {
        const t1 = [{ t: 'θ', f: 'sim', tam: 13 }, { t: '1', f: 'simRecta', tam: 9, dy: 3 }, { t: ' = ' + grados(it.theta1).replace(' ', ' '), f: 'num', tam: 11 }];
        const refl = it.tipo === 'total' || it.tipo === 'espejo';
        const t2 = it.tipo === 'refraccion' ? [{ t: 'θ', f: 'sim', tam: 13 }, { t: '2', f: 'simRecta', tam: 9, dy: 3 }, { t: ' = ' + grados(it.theta2), f: 'num', tam: 11 }]
          : it.tipo === 'total' ? [{ t: 'reflexión total', f: 'ui', tam: 11 }] : null;
        tz.opticaAngulos(it.p, it.normal, it.d, it.salida, t1, t2, { reflexion: refl });
      }
      void el;
    }
  }
  function dibujarRegla() {
    if (!ESC.regla) return;
    const [a, b] = ESC.regla, v = tz.vista, [x1, y1] = v.P(a), [x2, y2] = v.P(b);
    if (Math.hypot(x2 - x1, y2 - y1) > 4) tz.flechaPx(x1, y1, x2, y2, { color: 'texto-2', grosor: 1, punta: 'abierta', ambas: true });
    tz.asa(x1, y1); tz.asa(x2, y2);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    tz.ficha((x1 + x2) / 2 + 10, (y1 + y2) / 2 - 34, [[{ t: 'd', f: 'sim', tam: 13 }, { t: ' = ' + L(d), f: 'num', tam: 11.5 }], [{ t: 'ángulo ' + grados(ang), f: 'num', tam: 11 }]], { ancla: [(x1 + x2) / 2, (y1 + y2) / 2] });
    if (sel === 'regla') tz.seleccionCaja(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  }
  const etqN = n => [{ t: 'n', f: 'sim', tam: 13 }, { t: ' = ' + fmt(n, 4), f: 'num', tam: 11.5, color: 'texto-2' }];
  function dibujarValores() {
    const v = tz.vista;
    for (const el of ESC.elementos) {
      if (el.tipo === 'medio' || el.tipo === 'recipiente') {
        // n dentro del medio, arriba a la izquierda de la parte visible
        const pts = verticesMedio(el).map(p => v.P(p)), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), n = indiceDe(indiceEl(el));
        const x0 = Math.max(Math.min(...xs), 0), y0 = Math.max(Math.min(...ys), 0), x1 = Math.min(Math.max(...xs), tz.w), y1 = Math.min(Math.max(...ys), tz.h - 4);
        const cand = [[x0 + 8, y1 - 8], [x0 + 8, y0 + 19], [x0 + 22, (y0 + y1) / 2 + 5], [x0 + 8, y0 + 40]];
        const cf = contornoForma(el.tipo === 'recipiente' ? formaRecipiente(el) : el.forma), segs = etqN(n);
        const pto = x1 - x0 > 76 && y1 - y0 > 24 && cand.find(([x, y]) => y < y1 && y > y0 && contiene(cf, [v.mx(x), v.my(y - 4)]) && contiene(cf, [v.mx(x + 60), v.my(y - 4)]) && tz.opticaReservar(segs, x, y));
        if (pto) tz.compuesto(segs, pto[0], pto[1], {});
      } else if (el.tipo === 'lente' || curvo(el)) {
        const pts = el.tipo === 'lente' ? extremos(el) : curvaEspejo(el, 4), top = pts.reduce((a, b) => (v.Y(b[1]) < v.Y(a[1]) ? b : a)), [X, Y] = v.P(top);
        const segs = [{ t: el.tipo === 'lente' ? 'f' : 'R', f: 'sim', tam: 13 }, { t: ' = ' + cantidad((el.tipo === 'lente' ? el.f : el.R) / FU(), U(), 3), f: 'num', tam: 11.5, color: 'texto-2' }];
        for (const [x, y, al] of [[X + 14, Y - 4, 'left'], [X + 14, Y + 16, 'left'], [X - 14, Y - 10, 'right']]) if (tz.opticaReservar(segs, x, y, al)) { tz.compuesto(segs, x, y, { alinear: al }); break; }
      } else if (esFuente(el)) {
        const [X, Y] = v.P(el.tipo === 'objeto' ? puntaObjeto(el) : el.origen);
        const segs = el.lambda == null ? [{ t: 'luz blanca', f: 'ui', tam: 11, color: 'texto-3' }] : [{ t: 'λ', f: 'sim', tam: 13, color: 'texto-2' }, { t: ' = ' + cantidad(el.lambda * 1e9, 'nm', 3), f: 'num', tam: 11, color: 'texto-3' }];
        for (const [x, y, al] of [[X - 10, Y - 12, 'right'], [X + 12, Y - 12, 'left'], [X - 10, Y + 22, 'right'], [X + 12, Y + 22, 'left']]) if (tz.opticaReservar(segs, x, y, al)) { tz.compuesto(segs, x, y, { alinear: al }); break; }
      }
    }
    // Imágenes: ficha con su tipo y, si es de un objeto, el aumento
    if (!ESC.capas.imagenes) return;
    const vistas = new Set();
    for (const im of IMGS) {
      const el = ESC.elementos[im.fuente];
      if (el.tipo === 'objeto' && im.punto !== 0) continue;
      const k = `${im.fuente}|${im.ojo}|${im.real}`; if (vistas.has(k)) continue; vistas.add(k);
      const [X, Y] = v.P(im.p), filas = [[{ t: im.ojo != null ? 'el ojo la ve aquí' : im.real ? 'imagen real' : 'imagen virtual', f: 'ui', tam: 11.5 }]];
      if (el.tipo === 'objeto') {
        const pie = IMGS.find(q => q.fuente === im.fuente && q.punto === 1 && q.firma === im.firma && q.ojo === im.ojo);
        if (pie) { const m = Math.hypot(im.p[0] - pie.p[0], im.p[1] - pie.p[1]) / Math.abs(el.altura) * Math.sign((im.p[1] - pie.p[1]) * el.altura) || 0; filas.push([{ t: 'm', f: 'sim', tam: 13 }, { t: ' = ' + fmt(m, 3), f: 'num', tam: 11.5 }]); }
      } else filas.push([{ t: 'y', f: 'sim', tam: 13 }, { t: ' = ' + L(im.p[1], 4), f: 'num', tam: 11.5 }]);
      const izq = X > tz.w - 180;
      tz.ficha(izq ? X - 140 : X + 16, Y + 10, filas, { ancla: [X, Y] });
    }
  }
  function dibujarSeleccion() {
    const el = elDe(sel), v = tz.vista; if (!el) return;
    if (el.tipo === 'medio' || el.tipo === 'recipiente') {
      const pts = (el.tipo === 'recipiente' ? [...verticesMedio(el), ...paredesRecipiente(el)] : verticesMedio(el)).map(p => v.P(p)), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      tz.seleccionCaja(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    } else if (curvo(el)) {
      const pts = curvaEspejo(el, 12).map(p => v.P(p)), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      tz.seleccionCaja(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    } else if (esLineal(el)) {
      const [a, b] = extremos(el).map(p => v.P(p));
      tz.seleccionCaja(Math.min(a[0], b[0]) - 3, Math.min(a[1], b[1]) - 3, Math.abs(b[0] - a[0]) + 6, Math.abs(b[1] - a[1]) + 6);
    } else if (el.tipo === 'objeto') {
      const [x1, y1] = v.P(el.origen), [x2, y2] = v.P(puntaObjeto(el));
      tz.seleccionCaja(Math.min(x1, x2) - 6, Math.min(y1, y2), Math.abs(x2 - x1) + 12, Math.abs(y2 - y1));
      tz.asaVector(x2, y2, arrastre && arrastre.tipo === 'altura');
    } else { const [X, Y] = v.P(el.origen); tz.seleccionCirculo(X, Y, 12); }
    const a = asaGiro(el);
    if (a) {
      const [X, Y] = v.P(posDe(el));
      tz.lineaPx([[X, Y], a], { color: 'texto-3', grosor: 1, patron: 'auxiliar' });
      tz.asaVector(a[0], a[1], arrastre && arrastre.tipo === 'giro');
    }
  }

  // ---------------------------------------------------------------------
  // Selección en el lienzo
  // ---------------------------------------------------------------------
  const distSeg = (P, A, B) => { const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L2)) : 0; return Math.hypot(P[0] - A[0] - t * dx, P[1] - A[1] - t * dy); };
  function objetoEn(X, Y) {
    const v = tz.vista, P = [X, Y], w = [v.mx(X), v.my(Y)];
    const s = elDe(sel);
    if (s) {
      const a = asaGiro(s); if (a && Math.hypot(X - a[0], Y - a[1]) < 8) return { id: s.id, asa: 'giro' };
      if (s.tipo === 'objeto') { const [px, py] = v.P(puntaObjeto(s)); if (Math.hypot(X - px, Y - py) < 8) return { id: s.id, asa: 'altura' }; }
    }
    if (ESC.regla) for (const j of [0, 1]) { const [x, y] = v.P(ESC.regla[j]); if (Math.hypot(X - x, Y - y) < 8) return { id: 'regla', asa: j }; }
    // Fuentes, después los elementos lineales y los espejos, al final los medios (de arriba abajo)
    for (let i = ESC.elementos.length - 1; i >= 0; i--) {
      const el = ESC.elementos[i]; if (!esFuente(el)) continue;
      if (el.tipo === 'objeto') { if (distSeg(P, v.P(el.origen), v.P(puntaObjeto(el))) < 7) return { id: el.id }; continue; }
      if (el.tipo === 'haz') { const d = dir(el.giro ?? 0), t = [-d[1], d[0]], h = el.ancho / 2; if (distSeg(P, v.P([el.origen[0] - t[0] * h, el.origen[1] - t[1] * h]), v.P([el.origen[0] + t[0] * h, el.origen[1] + t[1] * h])) < 8) return { id: el.id }; continue; }
      if (Math.hypot(...[0, 1].map(k => P[k] - v.P(el.origen)[k])) < 10) return { id: el.id };
    }
    for (let i = ESC.elementos.length - 1; i >= 0; i--) {
      const el = ESC.elementos[i];
      if (el.tipo === 'ojo') { if (Math.hypot(...[0, 1].map(k => P[k] - v.P(el.centro)[k])) < 12) return { id: el.id }; continue; }
      if (esLineal(el)) { const [a, b] = extremos(el); if (distSeg(P, v.P(a), v.P(b)) < 7) return { id: el.id }; }
      else if (el.tipo === 'espejo') { const pts = curvaEspejo(el, 24).map(p => v.P(p)); for (let k = 0; k < pts.length - 1; k++) if (distSeg(P, pts[k], pts[k + 1]) < 7) return { id: el.id }; }
      else if (el.tipo === 'recipiente') { const pw = paredesRecipiente(el).map(p => v.P(p)); for (let k = 0; k < 3; k++) if (distSeg(P, pw[k], pw[k + 1]) < 7) return { id: el.id }; }
    }
    for (let i = ESC.elementos.length - 1; i >= 0; i--) {
      const el = ESC.elementos[i];
      if (el.tipo === 'medio') { try { if (contiene(contornoForma(el.forma), w)) return { id: el.id }; } catch { /* forma inválida */ } }
      else if (el.tipo === 'recipiente') { if (contiene(contornoForma(formaRecipiente(el)), w)) return { id: el.id }; }
    }
    if (ESC.regla && distSeg(P, v.P(ESC.regla[0]), v.P(ESC.regla[1])) < 6) return { id: 'regla' };
    return null;
  }

  // ---------------------------------------------------------------------
  // Inspector, árbol, lecturas y variables
  // ---------------------------------------------------------------------
  const fila = (etq, control, ayuda = '') => `<div class="fila"${ayuda ? ` data-ayuda="${ayuda}"` : ''}><span class="etq">${etq}</span>${control}</div>`;
  const segmentado = (id, ops, actual) => `<div class="segmentado texto" id="${id}">${ops.map(([v, txt, ay]) => `<button data-v="${v}" aria-pressed="${String(v) === String(actual)}"${ay ? ` data-ayuda="${ay}"` : ''}>${txt}</button>`).join('')}</div>`;
  const segmentadoIconos = (id, ops, actual) => `<div class="segmentado" id="${id}">${ops.map(([v, ico, ay]) => `<button data-v="${v}" aria-pressed="${v === actual}" data-ayuda="${ay}"><svg class="ico"><use href="#${ico}"/></svg></button>`).join('')}</div>`;
  const leer = ruta => ruta.split('.').reduce((o, k) => (o == null ? o : o[k]), ESC);
  function escribir(ruta, val) { const ks = ruta.split('.'), u = ks.pop(), o = ks.reduce((a, k) => a[k], ESC); o[u] = val; }
  const ligadaA = ruta => Object.entries(ESC.variables).find(([, d]) => d.liga.includes(ruta));
  function campo(etq, ruta, dim, u, ayuda = '') {
    const lig = ligadaA(ruta);
    if (lig) {
      const [nv, d] = lig;
      return fila(etq, `<div class="campo es-variable" data-ayuda="Ligado a la variable ${d.sim}|Bound to variable"><span class="chip-var">${simHTML(d.sim, d.sub)}</span><span class="valor-var" data-var="${nv}"></span><span class="u">${d.u}</span></div>`, ayuda);
    }
    const val = leer(ruta);
    return fila(etq, `<div class="campo"><input data-ruta="${ruta}" data-dim="${dim}" data-u="${u}" value="${val == null ? '' : numCampo(val / (FAC[u] ?? 1))}"><span class="u">${u}</span></div>`, ayuda);
  }
  const boton = (id, ico, txt, ayuda) => `<button class="btn btn-secundario btn-compacto" id="${id}" data-ayuda="${ayuda}"><svg class="ico"><use href="#${ico}"/></svg>${txt}</button>`;

  function inspector() {
    const props = $('#propiedades'); props.innerHTML = '';
    const el = elDe(sel);
    let titulo = 'Propiedades', ico = 'i-escena', nombre = ESC.titulo;
    if (!el) {
      nombre = 'Escena'; titulo = 'Medio exterior';
      const amb = ESC.ambiente.material ? ESC.ambiente.material : 'n';
      props.innerHTML = fila('Índice', segmentado('p-amb', [['n', 'n fijo'], ['aire', 'Aire'], ['agua', 'Agua']], amb), 'Medio que rodea a los objetos|Surrounding medium')
        + (ESC.ambiente.material ? '' : campo('n', 'ambiente.n', 'adimensional', '', 'Índice de refracción del medio exterior|Refractive index'))
        + fila('Unidad', segmentado('p-unidad', [['mm', 'mm'], ['cm', 'cm'], ['m', 'm']], U()), 'Unidad de longitud de los ejes y los campos|Length unit')
        + campo('Rebotes', 'maxRebotes', 'adimensional', '', 'Interacciones máximas por rayo|Max bounces');
    } else {
      const i = idxDe(sel), b = `elementos.${i}`, u = U();
      nombre = el.nombre; ico = icoDe(el); titulo = TIPOS[el.tipo].nombre;
      const pos = (k = 'centro') => campo('x', `${b}.${k}.0`, 'longitud', u) + campo('y', `${b}.${k}.1`, 'longitud', u);
      const indice = () => fila('Índice', `<button class="btn btn-secundario btn-compacto" id="p-mat" aria-haspopup="menu" style="justify-self:start">${el.material ? MATERIALES[el.material].nombre : 'Índice fijo'}<svg class="ico"><use href="#i-chevron-abajo"/></svg></button>`, 'Índice fijo o material con dispersión (Cauchy)|Refractive index')
        + (el.material ? '' : campo('n', `${b}.n`, 'adimensional', '', 'Índice de refracción|Refractive index'));
      let h = '';
      switch (el.tipo) {
        case 'medio': {
          const f = el.forma, bf = `${b}.forma`;
          if (f.tipo !== 'lente') h += fila('Forma', segmentadoIconos('p-forma', FORMAS.map(([v, ic, ay]) => [v, ic, `${ay}|Shape`]), f.tipo === 'lamina' ? 'rectangulo' : f.tipo));
          h += pos('forma.centro');
          if (f.tipo === 'rectangulo' || f.tipo === 'lamina') h += campo('Ancho', `${bf}.ancho`, 'longitud', u) + campo('Alto', `${bf}.alto`, 'longitud', u);
          if (f.tipo === 'prisma') h += campo('Lado', `${bf}.lado`, 'longitud', u, 'Largo de las dos caras iguales|Side') + campo('Ángulo', `${bf}.angulo`, 'adimensional', '°', 'Ángulo del vértice A|Apex angle');
          if (f.tipo === 'circulo' || f.tipo === 'semicirculo') h += campo('Radio', `${bf}.radio`, 'longitud', u);
          if (f.tipo === 'lente') h += campo('R₁', `${bf}.R1`, 'longitud', u, 'Radio de la primera cara (positivo si su centro queda detrás)|Radius 1') + campo('R₂', `${bf}.R2`, 'longitud', u, 'Radio de la segunda cara|Radius 2')
            + campo('Grosor', `${bf}.espesor`, 'longitud', u, 'Grosor en el centro|Center thickness') + campo('Apertura', `${bf}.apertura`, 'longitud', u, 'Diámetro útil|Aperture');
          if (f.tipo !== 'circulo') h += campo('Giro', `${bf}.giro`, 'adimensional', '°');
          h += indice();
          break;
        }
        case 'recipiente': h += pos() + campo('Ancho', `${b}.ancho`, 'longitud', u) + campo('Nivel', `${b}.nivel`, 'longitud', u, 'Altura del líquido|Liquid level') + campo('Alto', `${b}.alto`, 'longitud', u, 'Altura de las paredes|Wall height') + indice(); break;
        case 'espejo':
          h += fila('Forma', segmentado('p-espejo', [['plano', 'Plano'], ['esferico', 'Esférico'], ['parabolico', 'Parabólico']], el.espejo || 'plano'), 'Espejo plano, esférico o parabólico (sin aberración esférica)|Mirror shape') + pos();
          h += curvo(el) ? campo('R', `${b}.R`, 'longitud', u, el.espejo === 'parabolico' ? 'Radio de curvatura en el vértice (f = R/2): positivo si es cóncavo hacia su cara|Vertex radius' : 'Radio de curvatura: positivo si es cóncavo hacia su cara|Radius of curvature') + campo('Apertura', `${b}.apertura`, 'longitud', u) : campo('Largo', `${b}.largo`, 'longitud', u);
          h += campo('Eje', `${b}.giro`, 'adimensional', '°', 'Dirección hacia la que mira la cara reflectante|Axis');
          break;
        case 'lente': h += pos() + campo('f', `${b}.f`, 'longitud', u, 'Distancia focal: positiva si converge|Focal length') + campo('Largo', `${b}.largo`, 'longitud', u) + campo('Eje', `${b}.giro`, 'adimensional', '°', 'Dirección del eje óptico|Optical axis'); break;
        case 'divisor': h += pos() + campo('Reflejada', `${b}.R`, 'adimensional', '%', 'Fracción de la intensidad que se refleja|Reflected fraction') + campo('Largo', `${b}.largo`, 'longitud', u) + campo('Eje', `${b}.giro`, 'adimensional', '°'); break;
        case 'bloqueador': case 'pantalla': case 'ojo': h += pos() + campo(el.tipo === 'ojo' ? 'Pupila' : 'Largo', `${b}.largo`, 'longitud', u) + campo('Eje', `${b}.giro`, 'adimensional', '°', el.tipo === 'ojo' ? 'Hacia dónde mira el ojo, al revés|Axis' : 'Dirección de la normal|Normal'); break;
        default: {
          // Fuentes
          h += pos('origen');
          h += fila('Luz', segmentado('p-luz', [['mono', 'Monocromática'], ['blanca', 'Blanca']], el.lambda == null ? 'blanca' : 'mono'), 'Una longitud de onda o luz blanca (se separa al refractarse en un medio dispersivo)|Light');
          if (el.lambda != null) h += campo('λ', `${b}.lambda`, 'longitud', 'nm', 'Longitud de onda en el vacío|Wavelength');
          h += el.tipo === 'objeto' ? campo('Eje', `${b}.giro`, 'adimensional', '°', 'Eje del objeto: la flecha queda perpendicular|Axis') : campo('Dirección', `${b}.giro`, 'adimensional', '°');
          if (el.tipo === 'haz') h += campo('Ancho', `${b}.ancho`, 'longitud', u) + campo('Rayos', `${b}.rayos`, 'adimensional', '');
          if (el.tipo === 'puntual' || el.tipo === 'objeto') h += campo('Abertura', `${b}.abertura`, 'adimensional', '°', 'Ángulo del abanico de rayos|Fan angle') + campo('Rayos', `${b}.rayos`, 'adimensional', '');
          if (el.tipo === 'objeto') h += campo('Altura', `${b}.altura`, 'longitud', u) + campo('Desvío', `${b}.desvio`, 'adimensional', '°', 'Inclinación de los abanicos respecto del eje del objeto|Fan tilt');
        }
      }
      h += `<div class="fila"><span class="etq">Objeto</span><div class="acciones-fila">${boton('p-duplicar', 'i-duplicar', 'Duplicar', 'Duplicar|Duplicate|Ctrl D')}${boton('p-quitar', 'i-borrar', 'Quitar', 'Quitar el objeto|Delete|Supr')}</div></div>`;
      props.innerHTML = h;
    }
    $('#insp-ico').setAttribute('href', '#' + ico);
    $('#insp-nombre').textContent = nombre;
    $('#props-titulo').textContent = titulo;
    document.querySelectorAll('#propiedades input[data-ruta]').forEach(campoConUnidad);
    const on = (id, f) => { const e = $(id); if (e) e.addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) f(b.dataset.v, b); }); };
    on('#p-amb', v => { ESC.ambiente = v === 'n' ? { n: indiceDe(ESC.ambiente) } : { material: v }; cambio(); });
    on('#p-unidad', v => { ESC.unidad = v; for (const d of Object.values(ESC.variables)) if (['mm', 'cm', 'm'].includes(d.u) && FAC[d.u]) { const k = FAC[d.u] / FAC[v]; d.min *= k; d.max *= k; d.val *= k; d.paso *= k; d.factor = Math.sign(d.factor) * FAC[v]; d.u = v; } cambio(); construirVariables(); });
    const bMat = $('#p-mat');
    if (bMat) bMat.addEventListener('click', ev => { ev.stopPropagation(); menuMaterial(bMat); });
    on('#p-forma', v => cambiarForma(elDe(sel), v));
    on('#p-espejo', v => { const e = elDe(sel); if (v === (e.espejo || 'plano')) return; e.espejo = v; if (v !== 'plano') { e.R = e.R || 2 * e.largo; e.apertura = e.apertura || e.largo; } else e.largo = e.largo || e.apertura || 0.1; limpiarVariables(); cambio(); });
    on('#p-luz', v => { const e = elDe(sel); e.lambda = v === 'blanca' ? null : (e.lambdaPrevia ?? LD); if (v === 'blanca') e.lambdaPrevia = undefined; limpiarVariables(); cambio(); });
    const b1 = $('#p-quitar'); if (b1) b1.addEventListener('click', quitarSeleccion);
    const b2 = $('#p-duplicar'); if (b2) b2.addEventListener('click', duplicar);
    arbol();
  }
  // Menú desplegable de materiales (índice fijo o con dispersión)
  function menuMaterial(boton) {
    let m = $('#menu-material');
    if (!m) { m = document.createElement('div'); m.className = 'menu'; m.id = 'menu-material'; m.setAttribute('role', 'menu'); m.style.cssText = 'position:fixed;z-index:40;min-width:220px'; document.body.appendChild(m); document.addEventListener('pointerdown', ev => { if (!ev.target.closest('#menu-material, #p-mat')) m.hidden = true; }); }
    if (!m.hidden && m.dataset.abierto === '1') { m.hidden = true; m.dataset.abierto = '0'; return; }
    const e = elDe(sel), actual = e.material || 'n';
    m.innerHTML = MATS.map(([k, txt]) => `<div class="menu-item" role="menuitem" data-v="${k}"${k === actual ? ' aria-current="true"' : ''}>${k === 'n' ? 'Índice fijo' : MATERIALES[k].nombre}<span class="atajo">${k === 'n' ? '' : 'n_D = ' + fmt(indiceDe({ material: k }), 4)}</span></div>`).join('');
    m.onclick = ev => {
      const it = ev.target.closest('.menu-item'); if (!it) return; m.hidden = true; m.dataset.abierto = '0';
      const v = it.dataset.v, q = elDe(sel); if (!q) return;
      if (v === 'n') { q.n = Number(indiceDe(indiceEl(q)).toFixed(4)); delete q.material; } else { q.material = v; delete q.n; limpiarVariables(); }
      cambio(); avisar(v === 'n' ? 'Índice fijo' : MATERIALES[v].nombre);
    };
    const r = boton.getBoundingClientRect(); m.style.left = r.left + 'px'; m.style.top = (r.bottom + 4) + 'px'; m.hidden = false; m.dataset.abierto = '1';
  }
  function cambiarForma(el, tipo) {
    const f = el.forma, viejo = f.tipo === 'lamina' ? 'rectangulo' : f.tipo; if (viejo === tipo) return;
    const tam = f.ancho ?? f.lado ?? (f.radio ? 2 * f.radio : 0.05);
    const nueva = { tipo, centro: f.centro, giro: f.giro ?? 0 };
    if (tipo === 'rectangulo') Object.assign(nueva, { ancho: tam, alto: f.alto ?? tam / 2 });
    if (tipo === 'prisma') Object.assign(nueva, { lado: tam, angulo: 60 * GR });
    if (tipo === 'circulo' || tipo === 'semicirculo') Object.assign(nueva, { radio: tam / 2 });
    el.forma = nueva; limpiarVariables(); cambio();
    avisar(`Forma: ${FORMAS.find(x => x[0] === tipo)[2].toLowerCase()}`);
  }

  // Validación de cada ruta (en SI)
  function validar(ruta, x) {
    const k = ruta.split('.').pop();
    if (['largo', 'ancho', 'alto', 'lado', 'radio', 'espesor', 'apertura', 'nivel'].includes(k) && !(x > 0)) throw new Error('Este valor tiene que ser positivo.');
    if (['largo', 'ancho', 'alto', 'lado', 'radio', 'espesor', 'apertura', 'nivel', 'R1', 'R2', 'f'].includes(k) && Math.abs(x) > 1e3) throw new Error('Este valor es demasiado grande (máximo 1 km).');
    if (k === 'f' && !(x !== 0)) throw new Error('La distancia focal no puede ser cero.');
    if (k === 'R' && ruta.startsWith('elementos.') && elDe(sel)?.tipo === 'divisor') { if (!(x >= 0 && x <= 1)) throw new Error('La fracción reflejada va de 0 % a 100 %.'); return x; }
    if (k === 'R' && !(x !== 0)) throw new Error('El radio no puede ser cero.');
    if (k === 'n' && !(x >= 1 && x <= 5)) throw new Error('El índice de refracción va de 1 a 5.');
    if (k === 'lambda' && !(x >= 300e-9 && x <= 800e-9)) throw new Error('La longitud de onda va de 300 nm a 800 nm.');
    if (k === 'angulo' && !(x > GR && x < 179 * GR)) throw new Error('El ángulo del prisma va de 1° a 179°.');
    if (k === 'abertura' && !(x > 0 && x <= DOS_PI)) throw new Error('La abertura va de 0° a 360°.');
    if (k === 'rayos') { if (!(x >= 1 && x <= 301)) throw new Error('El número de rayos va de 1 a 301.'); return Math.round(x); }
    if (k === 'maxRebotes') { if (!(x >= 1 && x <= 2000)) throw new Error('Los rebotes van de 1 a 2000.'); return Math.round(x); }
    if ((ruta.endsWith('.0') || ruta.endsWith('.1')) && Math.abs(x) > 1e3) throw new Error('La posición está demasiado lejos (máximo 1 km).');
    return x;
  }
  function campoConUnidad(ent) {
    const caja = ent.closest('.campo'), f = ent.closest('.fila');
    const mostrarError = msj => {
      caja.classList.toggle('es-error', !!msj);
      let p = f.querySelector('.mensaje-error');
      if (msj && !p) { p = document.createElement('p'); p.className = 'mensaje-error'; f.appendChild(p); }
      if (p) { if (msj) p.textContent = msj; else p.remove(); }
    };
    ent.addEventListener('change', () => {
      try {
        const dim = ent.dataset.dim, u = ent.dataset.u;
        let txt = ent.value.trim().replace(/−/g, '-');
        if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(txt) && u && u !== '°') txt = `${txt} ${u}`;
        const r = evaluar(txt, { esperada: dim, unidadPorDefecto: u || undefined });
        const ruta = ent.dataset.ruta, x = validar(ruta, r.valor);
        const previo = leer(ruta);
        escribir(ruta, x);
        try { trazar(escenaMotor()); } catch (e) { escribir(ruta, previo); throw e; }
        mostrarError(null); cambio();
      } catch (e) { mostrarError(e.message); }
    });
    ent.addEventListener('keydown', ev => { if (ev.key === 'Escape') { mostrarError(null); ent.blur(); inspector(); } });
  }

  function arbol() {
    const nodo = (s, ico, nombre, dato) => `<div class="nodo" data-sel="${s}" aria-selected="${sel === s}"><svg class="ico"><use href="#${ico}"/></svg><span class="nombre">${nombre}</span><span class="dato">${dato}</span></div>`;
    let h = nodo('escena', 'i-escena', 'Medio exterior', `n = ${fmt(indiceDe(ESC.ambiente), 4)}`);
    for (const el of ESC.elementos) h += nodo(el.id, icoDe(el), el.nombre, datoArbol(el));
    if (ESC.regla) h += nodo('regla', 'n-regla', 'Regla', L(Math.hypot(ESC.regla[1][0] - ESC.regla[0][0], ESC.regla[1][1] - ESC.regla[0][1]), 3));
    $('#arbol').innerHTML = h;
    $('#arbol').querySelectorAll('.nodo[data-sel]').forEach(n => n.addEventListener('click', () => seleccionar(n.dataset.sel)));
  }
  function datoArbol(el) {
    if (el.tipo === 'medio' || el.tipo === 'recipiente') return el.material ? el.material : `n = ${fmt(el.n, 4)}`;
    if (el.tipo === 'lente') return `f = ${L(el.f, 3)}`;
    if (el.tipo === 'espejo') return curvo(el) ? `${el.espejo === 'parabolico' ? 'parabólico, ' : ''}R = ${L(el.R, 3)}` : 'plano';
    if (el.tipo === 'divisor') return `${fmt(el.R * 100, 3)} %`;
    if (esFuente(el)) return el.lambda == null ? 'blanca' : cantidad(el.lambda * 1e9, 'nm', 3);
    return '';
  }
  function seleccionar(s) { if (s === sel) return; sel = s; inspector(); todo(); }

  const lectura = ([a, b, val, u, ayuda]) => `<span class="sim"${ayuda ? ` data-ayuda="${ayuda}"` : ''}>${a}${b ? `<sub class="r">${b}</sub>` : ''}</span><span class="v">${val}</span><span class="u">${u}</span>`;
  function lecturas() {
    document.querySelectorAll('[data-var]').forEach(e => { const d = ESC.variables[e.dataset.var]; if (d) e.textContent = fmtVar(d); });
    if (!RES) { $('#lecturas').innerHTML = '<span class="u">—</span>'; $('#insp-estado').textContent = ERROR || ''; return; }
    const el = elDe(sel), f = [], u = U();
    const Ll = (a, b, v, ay) => [a, b, fmt(v / FU(), 4), u, ay];
    const nAmb = indiceDe(ESC.ambiente);
    let estado = '';
    if (!el) {
      f.push(['n', '', fmt(nAmb, 4), '', 'Índice del medio exterior|Ambient index']);
      f.push(['N', 'rayos', String(RES.segmentos.length), '', 'Tramos de rayo trazados|Ray segments']);
      f.push(['N', 'imágenes', String(IMGS.length), '', 'Imágenes halladas|Images found']);
      estado = `${ESC.elementos.length} objetos`;
    } else if (el.tipo === 'medio' || el.tipo === 'recipiente') {
      const ind = indiceEl(el), n = indiceDe(ind, LAMBDA_D);
      f.push(['n', 'D', fmt(n, 5), '', 'Índice en la línea D del sodio (589.3 nm)|Refractive index']);
      if (esDispersivo(ind)) f.push(['n', 'F', fmt(indiceDe(ind, 486.1e-9), 5), '', 'Índice a 486.1 nm (azul)|Blue'], ['n', 'C', fmt(indiceDe(ind, 656.3e-9), 5), '', 'Índice a 656.3 nm (rojo)|Red']);
      if (n > nAmb) f.push(['θ', 'c', fmt(anguloCritico(n, nAmb) / GR, 4), '°', 'Ángulo crítico hacia el medio exterior|Critical angle']);
      f.push(['v', '', fmt(299792458 / n / 1e8, 4) + ' × 10⁸', 'm/s', 'Rapidez de la luz en el medio c/n|Speed of light']);
      if (el.tipo === 'medio' && el.forma.tipo === 'prisma') f.push(['δ', 'mín', fmt(desviacionMinima(el.forma.angulo, n / nAmb) / GR, 4), '°', 'Desviación mínima 2·asen(n·sen(A/2)) − A|Minimum deviation']);
      if (el.tipo === 'medio' && el.forma.tipo === 'lente') { const G = lenteGruesa(n, el.forma.R1, el.forma.R2, el.forma.espesor, nAmb); f.push(Ll('f', '', G.f, 'Focal paraxial (lente gruesa)|Focal length'), Ll('f', 'post', G.posterior, 'Distancia focal posterior, desde la segunda cara|Back focal distance')); }
      estado = el.material ? MATERIALES[el.material].nombre : `n = ${fmt(n, 4)}`;
    } else if (el.tipo === 'lente') {
      f.push(Ll('f', '', el.f), ['P', '', fmt(1 / el.f, 4), 'm⁻¹', 'Potencia 1/f (dioptrías)|Power']);
      estado = el.f > 0 ? 'Convergente' : 'Divergente';
    } else if (el.tipo === 'espejo') {
      if (curvo(el)) { f.push(Ll('R', '', el.R), Ll('f', '', el.R / 2, 'Distancia focal R/2|Focal length')); estado = `${el.R > 0 ? 'Cóncavo' : 'Convexo'}${el.espejo === 'parabolico' ? ' parabólico' : ''}`; }
      else estado = 'Plano';
    } else if (el.tipo === 'pantalla' || el.tipo === 'ojo') {
      const k = idxDe(sel), I = RES.impactos.filter(h => h.elemento === k), P = I.reduce((s, h) => s + h.I, 0);
      f.push(['P', '', fmt(P, 4), '', 'Intensidad que recibe (relativa a la de las fuentes)|Received power'], ['N', 'rayos', String(I.length), '']);
      if (I.length) { const ss = I.map(h => h.s); f.push(Ll('s', 'mín', Math.min(...ss), 'Posición del primer rayo sobre el elemento|Hit extent'), Ll('s', 'máx', Math.max(...ss))); }
      if (el.tipo === 'ojo') for (const im of IMGS.filter(q => q.ojo === k).slice(0, 2)) f.push(Ll('x', 'img', im.p[0], 'Dónde ve el ojo la imagen|Image seen'), Ll('y', 'img', im.p[1]));
      estado = I.length ? `${I.length} rayos` : 'No le llega luz';
    } else if (esFuente(el)) {
      const k = idxDe(sel), cam = principal(k);
      // La interfaz de referencia (la primera que de verdad desvía el rayo)
      const r = el.tipo === 'objeto' ? null : (fuenteRef() === k ? interfazRef() : null) || cam.find(i => i.tipo === 'refraccion' || i.tipo === 'total' || i.tipo === 'espejo');
      if (r) {
        f.push(['θ', '1', fmt(r.theta1 / GR, 4), '°', 'Ángulo de incidencia en la primera interfaz|Incidence angle']);
        if (r.tipo === 'refraccion') f.push(['θ', '2', fmt(r.theta2 / GR, 4), '°', 'Ángulo de refracción|Refraction angle'], ['R', '', fmt(r.R, 4), '', 'Fracción reflejada (Fresnel, luz no polarizada)|Reflectance'], ['T', '', fmt(r.T, 4), '', 'Fracción transmitida|Transmittance']);
        if (r.tipo === 'total') f.push(['θ', 'c', fmt(anguloCritico(r.n1, r.n2) / GR, 4), '°', 'Ángulo crítico|Critical angle']);
      }
      if (el.tipo === 'objeto') {
        const lente = ESC.elementos.find(e => e.tipo === 'lente' || curvo(e));
        if (lente) {
          const ax = dir(lente.giro ?? 0), s = Math.abs((el.origen[0] - lente.centro[0]) * ax[0] + (el.origen[1] - lente.centro[1]) * ax[1]);
          const fl = lente.tipo === 'lente' ? lente.f : lente.R / 2, F = lenteDelgada(fl, s);
          f.push(Ll('s', '', s, 'Distancia del objeto|Object distance'));
          if (!F.infinito) f.push(Ll('s′', '', F.s2, 'Distancia de la imagen (ecuación de la lente)|Image distance'), ['m', '', fmt(F.m, 4), '', 'Aumento −s′/s|Magnification']);
        }
        const im = IMGS.find(q => q.fuente === k && q.punto === 0 && q.ojo == null);
        if (im) f.push(Ll('x', 'img', im.p[0], 'Posición de la imagen hallada con los rayos|Traced image'), Ll('y', 'img', im.p[1]));
        estado = im ? (im.real ? 'Imagen real' : 'Imagen virtual') : 'Sin imagen nítida';
      } else estado = el.lambda == null ? 'Luz blanca' : `λ = ${cantidad(el.lambda * 1e9, 'nm', 4)}`;
    }
    $('#lecturas').innerHTML = f.map(lectura).join('');
    $('#insp-estado').textContent = estado;
  }

  function fmtVar(d) {
    const dec = !(d.paso > 0) || d.paso >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(d.paso) - 1e-9));
    return d.val.toFixed(dec).replace('-', '−');
  }
  function construirVariables() {
    const cont = $('#variables'); cont.innerHTML = '';
    for (const d of Object.values(ESC.variables)) {
      const f = document.createElement('div'); f.className = 'var';
      f.innerHTML = `${simHTML(d.sim, d.sub)}<input class="deslizador" type="range" min="${d.min}" max="${d.max}" step="${d.paso}" value="${d.val}" aria-label="${d.sim}"><span class="valor"></span>`;
      const ent = f.querySelector('input'), val = f.querySelector('.valor');
      const pintar = () => { val.innerHTML = `${fmtVar(d)}${d.u ? `<span class="u">${d.u}</span>` : ''}`; ent.value = d.val; Volta.pintarDeslizador(ent); };
      ent.addEventListener('input', () => { d.val = parseFloat(ent.value); aplicarVariables(); pintar(); recalcular(); });
      ent.addEventListener('change', () => { registrar(); inspector(); });
      pintar(); cont.appendChild(f);
    }
    if (!Object.keys(ESC.variables).length) cont.innerHTML = '<span class="ayuda-fila" style="margin:0">Sin variables: edita los valores en el inspector.</span>';
  }
  function aplicarVariables() {
    for (const d of Object.values(ESC.variables)) for (const r of d.liga) { try { if (leer(r) !== undefined) escribir(r, d.val * d.factor + (d.offset || 0)); } catch { /* ruta que ya no existe */ } }
  }
  // Un arrastre cambió una magnitud ligada: la variable la sigue
  function sincronizarVariables(rutas) {
    for (const d of Object.values(ESC.variables)) for (const r of rutas) if (d.liga.includes(r)) {
      d.val = Math.max(d.min, Math.min(d.max, (leer(r) - (d.offset || 0)) / d.factor));
      for (const q of d.liga) escribir(q, d.val * d.factor + (d.offset || 0));
    }
  }
  // Variables cuyas rutas ya no existen se sueltan; al borrar el objeto i, las rutas se corren
  function limpiarVariables(borrado = null) {
    for (const [k, d] of Object.entries(ESC.variables)) {
      d.liga = d.liga.map(r => {
        const m = /^elementos\.(\d+)\.(.+)$/.exec(r);
        if (!m || borrado == null) return r;
        if (+m[1] === borrado) return null;
        return +m[1] > borrado ? `elementos.${+m[1] - 1}.${m[2]}` : r;
      }).filter(r => r && leer(r) !== undefined && leer(r) !== null && typeof leer(r) === 'number');
      if (!d.liga.length) delete ESC.variables[k];
    }
    construirVariables();
  }

  // ---------------------------------------------------------------------
  // Gráficas
  // ---------------------------------------------------------------------
  const vacia = (n, msj) => { grafica($(`#g${n}`), { x: { min: 0, max: 1 }, y: { min: 0, max: 1 }, series: [] }); $(`#t${n}`).textContent = msj; $(`#l${n}`).textContent = ''; };
  function graficas() { if (!$('#p-graficas').hidden) ESC.graficas.forEach((g, j) => { try { grafica1(j + 1, g); } catch { vacia(j + 1, 'Sin datos'); } }); }
  const muestras = (a, b, n, f) => { const r = []; for (let i = 0; i <= n; i++) { const x = a + (b - a) * i / n, y = f(x); r.push([x, y]); } return r; };
  // Parte una curva donde deja de ser finita
  const tramosFinitos = pts => { const r = []; let t = []; for (const p of pts) { if (Number.isFinite(p[1])) t.push(p); else if (t.length) { r.push(t); t = []; } } if (t.length) r.push(t); return r; };
  function primeraLente() {
    const e = ESC.elementos.find(q => q.tipo === 'lente' || curvo(q) || (q.tipo === 'medio' && q.forma.tipo === 'lente'));
    if (!e) return null;
    const nAmb = indiceDe(ESC.ambiente);
    if (e.tipo === 'lente') return { el: e, f: e.f, centro: e.centro, eje: dir(e.giro ?? 0), nombre: 'lente' };
    if (e.tipo === 'espejo') return { el: e, f: e.R / 2, centro: e.centro, eje: dir(e.giro ?? 0), nombre: 'espejo' };
    return { el: e, f: lenteGruesa(indiceDe(indiceEl(e), LAMBDA_D), e.forma.R1, e.forma.R2, e.forma.espesor, nAmb).f, centro: e.forma.centro, eje: dir(e.forma.giro ?? 0), nombre: 'lente' };
  }
  function distanciaObjeto(Lf) {
    const o = ESC.elementos.find(e => e.tipo === 'objeto' || e.tipo === 'puntual'); if (!o) return null;
    return Math.abs((o.origen[0] - Lf.centro[0]) * Lf.eje[0] + (o.origen[1] - Lf.centro[1]) * Lf.eje[1]);
  }
  function grafica1(n, tipo) {
    const cv = $(`#g${n}`), T = $(`#t${n}`), Lc = $(`#l${n}`);
    if (!RES) { vacia(n, 'Sin trazado'); return; }
    if (tipo === 'snell' || tipo === 'fresnel') {
      const it = interfazRef();
      if (!it) { vacia(n, 'Sin interfaz: coloca un rayo que entre en un medio'); return; }
      const n1 = it.n1, n2 = it.n2, tc = anguloCritico(n1, n2), t1 = it.theta1 / GR;
      const ev = Number.isFinite(tc) ? [{ x: tc / GR }] : [];
      if (tipo === 'snell') {
        const pts = muestras(0, 89.9, 400, x => snell(n1, n2, x * GR) / GR);
        const y2 = it.tipo === 'total' ? NaN : it.theta2 / GR;
        grafica(cv, { x: { min: 0, max: 90 }, y: { min: 0, max: 90 }, series: [{ tramos: tramosFinitos(pts), familia: 'tinta' }, { tramos: [[[0, 0], [90, 90]]], familia: 'texto-3', auxiliar: true }], cursor: t1, puntoCursor: Number.isFinite(y2) ? [t1, y2] : null, eventos: ev });
        T.innerHTML = `${simHTML('θ', '2')} contra ${simHTML('θ', '1')} (°) · ${fmt(n1, 4)} → ${fmt(n2, 4)}`;
        Lc.textContent = Number.isFinite(y2) ? cantidad(y2, '°', 4) : 'total';
      } else {
        const R = muestras(0, 89.9, 400, x => fresnel(n1, n2, x * GR).R), Tt = R.map(([x, y]) => [x, 1 - y]);
        grafica(cv, { x: { min: 0, max: 90 }, y: { min: 0, max: 1.02 }, series: [{ tramos: [R], familia: 'tinta' }, { tramos: [Tt], familia: 'tinta', patron: 'discontinuo' }], cursor: t1, puntoCursor: [t1, it.R], eventos: [...ev, { x: anguloBrewster(n1, n2) / GR }] });
        T.innerHTML = `<span class="leyenda"><span style="color:var(--tinta)"><i></i>${simHTML('R')}</span><span style="color:var(--tinta)"><i class="discontinua"></i>${simHTML('T')}</span></span> contra ${simHTML('θ', '1')} (°)`;
        Lc.textContent = `R = ${fmt(it.R, 3)}`;
      }
      return;
    }
    if (tipo === 'angulos') {
      // Ángulo de incidencia y ángulo crítico en cada interfaz del camino del rayo
      const k = fuenteRef(), cam = k >= 0 ? principal(k).filter(i => i.tipo === 'refraccion' || i.tipo === 'total') : [];
      if (!cam.length) { vacia(n, 'Sin interfaces en el camino del rayo'); return; }
      const p1 = cam.map((i, j) => [j + 1, i.theta1 / GR]), pc = [];
      cam.forEach((i, j) => { const c = anguloCritico(i.n1, i.n2); if (Number.isFinite(c)) pc.push([j + 1, c / GR]); });
      grafica(cv, { x: { min: 0.5, max: cam.length + 0.5 }, y: { min: 0, max: 90 }, series: [{ tramos: [p1], familia: 'tinta' }, { tramos: pc.map(p => [[p[0] - 0.3, p[1]], [p[0] + 0.3, p[1]]]), familia: 'tinta', patron: 'discontinuo' }], eventos: p1.map(([x, y]) => ({ x, y })) });
      T.innerHTML = `<span class="leyenda"><span style="color:var(--tinta)"><i></i>${simHTML('θ', '1')}</span><span style="color:var(--tinta)"><i class="discontinua"></i>${simHTML('θ', 'c')}</span></span> (°) en cada interfaz`;
      const nt = cam.filter(i => i.tipo === 'total').length;
      Lc.textContent = nt ? `${nt} totales` : '';
      return;
    }
    if (tipo === 'invariante') {
      const k = fuenteRef(), cam = k >= 0 ? principal(k).filter(i => i.tipo === 'refraccion' || i.tipo === 'total') : [];
      if (!cam.length) { vacia(n, 'Sin interfaces en el camino del rayo'); return; }
      const pts = [], p2 = [];
      cam.forEach((i, j) => { pts.push([j + 1, i.n1 * Math.sin(i.theta1)]); if (i.tipo === 'refraccion') p2.push([j + 1, i.n2 * Math.sin(i.theta2)]); });
      const ymax = Math.max(...pts.map(p => p[1]), 0.1) * 1.3;
      grafica(cv, { x: { min: 0.5, max: cam.length + 0.5 }, y: { min: 0, max: ymax }, series: [{ tramos: [pts], familia: 'tinta' }, { tramos: [p2], familia: 'tinta', patron: 'discontinuo' }], eventos: pts.map(p => ({ x: p[0], y: p[1] })) });
      T.innerHTML = `${simHTML('n')} sen ${simHTML('θ')} a cada lado de cada interfaz`;
      Lc.textContent = fmt(pts[0][1], 4);
      return;
    }
    if (tipo === 'desviacion') {
      const e = ESC.elementos.find(q => q.tipo === 'medio' && q.forma.tipo === 'prisma'); if (!e) { vacia(n, 'Sin prisma'); return; }
      const k = fuenteRef(), src = ESC.elementos[k], lam = src && src.lambda != null ? src.lambda : 550e-9, nr = indiceDe(indiceEl(e), lam) / indiceDe(ESC.ambiente, lam), A = e.forma.angulo;
      const pts = muestras(0, 89.9, 360, x => desviacionPrisma(A, nr, x * GR) / GR), dm = desviacionMinima(A, nr) / GR, tm = Math.asin(nr * Math.sin(A / 2)) / GR;
      const it = k >= 0 ? principal(k).find(i => i.elemento === idxDe(e.id) && i.tipo === 'refraccion') : null;
      const fin = tramosFinitos(pts), ys = fin.flat().map(p => p[1]);
      grafica(cv, { x: { min: 0, max: 90 }, y: { min: Math.floor(Math.min(...ys, dm) - 2), max: Math.min(90, Math.max(...ys) + 2) }, series: [{ tramos: fin, familia: 'tinta' }], cursor: it ? it.theta1 / GR : null, puntoCursor: it ? [it.theta1 / GR, desviacionPrisma(A, nr, it.theta1) / GR] : null, eventos: [{ x: tm, y: dm }] });
      T.innerHTML = `${simHTML('δ')} (°) contra ${simHTML('θ', '1')} (°)`;
      Lc.textContent = `mín ${fmt(dm, 4)}°`;
      return;
    }
    if (tipo === 'dispersion') {
      const e = ESC.elementos.find(q => (q.tipo === 'medio' || q.tipo === 'recipiente') && esDispersivo(indiceEl(q))) || ESC.elementos.find(q => q.tipo === 'medio' || q.tipo === 'recipiente');
      if (!e) { vacia(n, 'Sin medios'); return; }
      const ind = indiceEl(e), pts = muestras(380, 750, 200, l => indiceDe(ind, l * 1e-9)), ys = pts.map(p => p[1]), a = Math.min(...ys), b = Math.max(...ys), m = Math.max(0.004, (b - a) * 0.15);
      grafica(cv, { x: { min: 380, max: 750 }, y: { min: a - m, max: b + m }, series: [{ tramos: [pts], familia: 'tinta' }], cursor: LAMBDA_D * 1e9, puntoCursor: [LAMBDA_D * 1e9, indiceDe(ind, LAMBDA_D)], eventos: [{ x: 486.1 }, { x: 656.3 }] });
      T.innerHTML = `${simHTML('n')} contra ${simHTML('λ')} (nm)`;
      Lc.textContent = `${fmt(indiceDe(ind, LAMBDA_D), 5)} en D`;
      return;
    }
    if (tipo === 'lente' || tipo === 'aumento' || tipo === 'inversas') {
      const Lf = primeraLente(); if (!Lf || !Number.isFinite(Lf.f)) { vacia(n, 'Sin lente ni espejo curvo'); return; }
      const f = Lf.f, fu = FU(), s0 = distanciaObjeto(Lf), smax = Math.max(4 * Math.abs(f), (s0 || 0) * 1.3), u = U();
      if (tipo === 'inversas') {
        const x1 = 1 / Math.max(0.2 * Math.abs(f), 1e-6), pts = muestras(0, x1, 50, x => 1 / f - x);
        const ys = pts.map(p => p[1]);
        grafica(cv, { x: { min: 0, max: x1 }, y: { min: Math.min(...ys, 0), max: Math.max(...ys, 0) }, series: [{ tramos: [pts], familia: 'tinta' }], puntoCursor: s0 ? [1 / s0, 1 / f - 1 / s0] : null, cursor: s0 ? 1 / s0 : null, eventos: [{ x: 1 / Math.abs(f) }] });
        T.innerHTML = `1/${simHTML('s′')} (m⁻¹) contra 1/${simHTML('s')} (m⁻¹)`;
        Lc.textContent = `1/f = ${fmt(1 / f, 4)} m⁻¹`;
        return;
      }
      const pts = muestras(1e-4, smax, 600, s => { const r = lenteDelgada(f, s); return tipo === 'lente' ? (Math.abs(r.s2) > 8 * Math.abs(f) ? NaN : r.s2 / fu) : (Math.abs(r.m) > 6 ? NaN : r.m); }).map(([x, y]) => [x / fu, y]);
      const yl = tipo === 'lente' ? 8 * Math.abs(f) / fu : 6;
      const act = s0 ? lenteDelgada(f, s0) : null, yA = act ? (tipo === 'lente' ? act.s2 / fu : act.m) : null;
      grafica(cv, { x: { min: 0, max: smax / fu }, y: { min: -yl, max: yl }, series: [{ tramos: tramosFinitos(pts), familia: 'tinta' }], cursor: s0 ? s0 / fu : null, puntoCursor: act && Number.isFinite(yA) && Math.abs(yA) < yl ? [s0 / fu, yA] : null, eventos: [{ x: Math.abs(f) / fu }] });
      T.innerHTML = tipo === 'lente' ? `${simHTML('s′')} (${u}) contra ${simHTML('s')} (${u}) · ${Lf.nombre}` : `${simHTML('m')} contra ${simHTML('s')} (${u})`;
      Lc.textContent = act && !act.infinito ? (tipo === 'lente' ? cantidad(act.s2 / fu, u, 4) : fmt(act.m, 4)) : '∞';
      return;
    }
    if (tipo === 'pantalla') {
      const k = ESC.elementos.findIndex(e => e.tipo === 'pantalla'); if (k < 0) { vacia(n, 'Sin pantalla'); return; }
      const el = ESC.elementos[k], N = 120, h = intensidadPantalla(RES, k, el.largo, N), max = Math.max(...h.total) || 1, fu = FU();
      const pts = []; h.s.forEach((s, i) => { const a = (s - el.largo / 2 / N) / fu, b = (s + el.largo / 2 / N) / fu; pts.push([a, h.total[i] / max], [b, h.total[i] / max]); });
      grafica(cv, { x: { min: -el.largo / 2 / fu, max: el.largo / 2 / fu }, y: { min: 0, max: 1.08 }, series: [{ tramos: [pts], familia: 'tinta' }] });
      T.innerHTML = `${simHTML('I')}/${simHTML('I', 'máx')} contra ${simHTML('s')} (${U()}) en ${el.nombre.toLowerCase()}`;
      Lc.textContent = `P = ${fmt(h.potencia, 3)}`;
      return;
    }
    vacia(n, '');
  }

  // ---------------------------------------------------------------------
  // Tablas y exportación
  // ---------------------------------------------------------------------
  const TIPO_INT = { refraccion: 'Refracción', total: 'Reflexión total', espejo: 'Espejo', lente: 'Lente', divisor: 'Divisor' };
  function tablas() {
    if (!RES) { $('#t-interacciones').innerHTML = ''; $('#t-imagenes').innerHTML = ''; return; }
    const u = U(), fu = FU(), ints = RES.interacciones.filter(i => i.I / (i.I0 || 1) > 0.01).slice(0, 400);
    $('#t-interacciones').innerHTML = `<tr><th>Interacción</th><th>Objeto</th><th>x (${u})</th><th>y (${u})</th><th>θ₁ (°)</th><th>θ₂ (°)</th><th>n₁</th><th>n₂</th><th>R</th><th>T</th><th>λ (nm)</th><th>I</th></tr>`
      + (ints.length ? ints.map(i => `<tr><td class="texto">${TIPO_INT[i.tipo]}</td><td class="texto">${ESC.elementos[i.elemento].nombre}</td><td>${fmt(i.p[0] / fu, 4)}</td><td>${fmt(i.p[1] / fu, 4)}</td><td>${fmt(i.theta1 / GR, 4)}</td><td>${Number.isFinite(i.theta2) ? fmt(i.theta2 / GR, 4) : '—'}</td><td>${fmt(i.n1, 4)}</td><td>${fmt(i.n2, 4)}</td><td>${fmt(i.R, 3)}</td><td>${fmt(i.T, 3)}</td><td>${i.lambda == null ? 'blanca' : fmt(i.lambda * 1e9, 4)}</td><td>${fmt(i.I, 3)}</td></tr>`).join('')
        : '<tr><td class="texto" colspan="12">Ningún rayo choca con un medio, un espejo o una lente.</td></tr>');
    $('#t-imagenes').innerHTML = `<tr><th>Imagen de</th><th>Tipo</th><th>x (${u})</th><th>y (${u})</th><th>Rayos</th><th>Dispersión (${u})</th><th>λ (nm)</th></tr>`
      + (IMGS.length ? IMGS.map(im => { const el = ESC.elementos[im.fuente]; return `<tr><td class="texto">${el.nombre}${el.tipo === 'objeto' ? (im.punto ? ' (pie)' : ' (punta)') : ''}${im.ojo != null ? ' · vista por el ojo' : ''}</td><td class="texto">${im.real ? 'Real' : 'Virtual'}</td><td>${fmt(im.p[0] / fu, 5)}</td><td>${fmt(im.p[1] / fu, 5)}</td><td>${im.rayos}</td><td>${fmt(im.rms / fu, 2)}</td><td>${im.lambda == null ? 'blanca' : fmt(im.lambda * 1e9, 4)}</td></tr>`; }).join('')
        : '<tr><td class="texto" colspan="7">No hay imágenes: hace falta una fuente puntual o un objeto cuyos rayos se desvíen.</td></tr>');
  }
  function exportarCSV() {
    if (!RES) { avisar('No hay datos: la escena no se puede trazar.', false); return; }
    const filas = RES.interacciones.map(i => [TIPO_INT[i.tipo], ESC.elementos[i.elemento].nombre, i.p[0], i.p[1], i.theta1 / GR, Number.isFinite(i.theta2) ? i.theta2 / GR : '', i.n1, i.n2, i.R, i.T, i.lambda == null ? '' : i.lambda * 1e9, i.I, i.nivel]);
    descargarTexto(`${nombreArchivo(ESC.titulo)}-interacciones.csv`, aCSV(['interaccion', 'objeto', 'x (m)', 'y (m)', 'theta1 (grados)', 'theta2 (grados)', 'n1', 'n2', 'R', 'T', 'lambda (nm)', 'I', 'nivel'], filas))
      .then(r => { if (r) avisarLienzo(area, `Datos exportados: ${filas.length} filas`); }, e => avisar(`No se pudo exportar: ${e}`, false));
  }
  function exportarImagenes() {
    if (!RES) return;
    const filas = IMGS.map(im => [ESC.elementos[im.fuente].nombre, im.punto, im.real ? 'real' : 'virtual', im.p[0], im.p[1], im.rayos, im.rms, im.lambda == null ? '' : im.lambda * 1e9, im.ojo != null ? 'ojo' : '']);
    descargarTexto(`${nombreArchivo(ESC.titulo)}-imagenes.csv`, aCSV(['fuente', 'punto', 'tipo', 'x (m)', 'y (m)', 'rayos', 'dispersion (m)', 'lambda (nm)', 'vista'], filas))
      .then(r => { if (r) avisarLienzo(area, `Imágenes exportadas: ${filas.length}`); });
  }
  function exportarRayos() {
    if (!RES) return;
    const filas = RES.segmentos.map(s => [s.a[0], s.a[1], s.b[0], s.b[1], s.lambda == null ? '' : s.lambda * 1e9, s.I, s.n, s.infinito ? 1 : 0, ESC.elementos[s.fuente].nombre]);
    descargarTexto(`${nombreArchivo(ESC.titulo)}-rayos.csv`, aCSV(['x1 (m)', 'y1 (m)', 'x2 (m)', 'y2 (m)', 'lambda (nm)', 'I', 'n', 'sin fin', 'fuente'], filas))
      .then(r => { if (r) avisarLienzo(area, `Rayos exportados: ${filas.length} tramos`); });
  }
  function exportarPNG() { descargarLienzo(lienzo, `${nombreArchivo(ESC.titulo)}.png`).then(r => { if (r) avisarLienzo(area, 'Imagen del lienzo exportada'); }); }
  $('#b-exportar').addEventListener('click', exportarCSV);

  // ---------------------------------------------------------------------
  // Ciclo
  // ---------------------------------------------------------------------
  function todo() {
    dibujar(); lecturas(); graficas();
    if (!$('#p-interacciones').hidden || !$('#p-imagenes').hidden) tablas();
  }
  function recalcular() {
    simular();
    if (!vistaTocada) encuadrar();
    todo();
    if (autoguardar) autoguardado.guardar('optica', escenaActual());
  }
  function cambio() { aplicarVariables(); recalcular(); registrar(); inspector(); }
  function titulo() {
    $('#escena-nombre').textContent = ESC.titulo;
    const chip = $('#escena-chip');
    chip.textContent = ESC.tipo === 'MEXT' ? `MEXT ${ESC.anio || ''}`.trim() : ESC.tipo || 'Propio';
    chip.className = 'chip' + (ESC.tipo === 'MEXT' ? ' lleno' : '');
    document.title = `Volta · Óptica geométrica · ${ESC.titulo}`;
    document.querySelectorAll('.capa-btn').forEach(b => b.setAttribute('aria-pressed', String(!!ESC.capas[b.dataset.capa])));
    $('#b-modo').setAttribute('aria-pressed', String(!!ESC.parciales));
    $('#b-modo').textContent = ESC.parciales ? 'Reflejos parciales' : 'Sin reflejos parciales';
  }
  let relojAviso = null;
  function avisar(txt, conDeshacer = true) {
    $('#aviso-texto').textContent = txt; $('#aviso').hidden = false;
    $('#aviso-deshacer').hidden = !conDeshacer || !historial?.puedeDeshacer;
    clearTimeout(relojAviso); relojAviso = setTimeout(() => { $('#aviso').hidden = true; }, conDeshacer ? 5000 : 4000);
  }
  $('#aviso-deshacer').addEventListener('click', () => deshacer());

  // ---------------------------------------------------------------------
  // Ediciones
  // ---------------------------------------------------------------------
  const nuevoId = () => { let id; do { id = 'e' + (++contador); } while (elDe(id)); return id; };
  function nombreNuevo(base) { let k = 1; while (ESC.elementos.some(e => e.nombre === `${base} ${k}`)) k++; return `${base} ${k}`; }
  function crear(h, p) {
    const S = 90 / tz.vista.escala, r = x => Number(x.toPrecision(3));
    const s = r(S), base = { id: nuevoId() };
    const tablas = {
      rayo: () => ({ tipo: 'rayo', nombre: nombreNuevo('Rayo'), origen: p, giro: 0, lambda: L589 }),
      haz: () => ({ tipo: 'haz', nombre: nombreNuevo('Haz'), origen: p, giro: 0, ancho: s, rayos: 7, lambda: L589 }),
      puntual: () => ({ tipo: 'puntual', nombre: nombreNuevo('Fuente'), origen: p, giro: 0, abertura: DOS_PI, rayos: 24, lambda: L589 }),
      objeto: () => ({ tipo: 'objeto', nombre: nombreNuevo('Objeto'), origen: p, altura: r(0.6 * S), giro: 0, desvio: 0, abertura: 30 * GR, rayos: 9, lambda: L589 }),
      medio: () => ({ tipo: 'medio', nombre: nombreNuevo('Medio'), forma: { tipo: 'rectangulo', centro: p, ancho: r(2 * S), alto: s, giro: 0 }, material: 'crown' }),
      'lente-gruesa': () => ({ tipo: 'medio', nombre: nombreNuevo('Lente gruesa'), forma: { tipo: 'lente', centro: p, giro: 0, R1: r(2 * S), R2: -r(2 * S), espesor: r(0.35 * S), apertura: r(1.4 * S) }, material: 'crown' }),
      recipiente: () => ({ tipo: 'recipiente', nombre: nombreNuevo('Recipiente'), centro: p, ancho: r(2 * S), nivel: s, alto: r(1.25 * S), material: 'agua' }),
      espejo: () => ({ tipo: 'espejo', nombre: nombreNuevo('Espejo'), espejo: 'plano', centro: p, giro: Math.PI, largo: r(1.5 * S) }),
      'espejo-curvo': () => ({ tipo: 'espejo', nombre: nombreNuevo('Espejo curvo'), espejo: 'esferico', centro: p, giro: Math.PI, R: r(3 * S), apertura: r(1.5 * S) }),
      lente: () => ({ tipo: 'lente', nombre: nombreNuevo('Lente'), centro: p, giro: 0, largo: r(1.5 * S), f: r(1.5 * S) }),
      divisor: () => ({ tipo: 'divisor', nombre: nombreNuevo('Divisor'), centro: p, giro: 3 * Math.PI / 4, largo: s, R: 0.5 }),
      bloqueador: () => ({ tipo: 'bloqueador', nombre: nombreNuevo('Bloqueador'), centro: p, giro: 0, largo: s }),
      pantalla: () => ({ tipo: 'pantalla', nombre: nombreNuevo('Pantalla'), centro: p, giro: Math.PI, largo: r(2 * S) }),
      ojo: () => ({ tipo: 'ojo', nombre: nombreNuevo('Ojo'), centro: p, giro: Math.PI, largo: r(0.15 * S) }),
    };
    const el = { ...base, ...tablas[h]() };
    ESC.elementos.push(el); sel = el.id;
    cambio(); avisar(`${el.nombre} colocado`);
  }
  function quitarSeleccion() {
    if (sel === 'regla') { ESC.regla = null; sel = 'escena'; cambio(); avisar('Se quita la regla'); return; }
    const i = idxDe(sel); if (i < 0) return;
    const nombre = ESC.elementos[i].nombre;
    ESC.elementos.splice(i, 1); limpiarVariables(i); sel = 'escena';
    cambio(); avisar(`Se quita ${nombre}`);
  }
  function duplicar() {
    const el = elDe(sel); if (!el) return;
    const c = JSON.parse(JSON.stringify(el)), d = 20 / tz.vista.escala;
    c.id = nuevoId(); c.nombre = texto(`${el.nombre} (copia)`, 'Copia', 40);
    const p = posDe(c); moverA(c, [p[0] + d, p[1] - d]);
    ESC.elementos.push(c); sel = c.id; cambio(); avisar(`${c.nombre} duplicado`);
  }

  // ---------------------------------------------------------------------
  // Escena: guardar, abrir, autoguardado, deshacer
  // ---------------------------------------------------------------------
  const copia = o => JSON.parse(JSON.stringify(o));
  const instantanea = () => { const o = copia(ESC); o.sel = sel; return o; };
  function escenaActual() { return crearEscena({ modulo: 'optica', espacio: 'geometrica', titulo: ESC.titulo, datos: instantanea() }); }
  const RUTA_OK = /^(ambiente\.n|elementos\.\d{1,2}\.(origen|centro)\.[01]|elementos\.\d{1,2}\.(giro|largo|f|R|apertura|n|lambda|ancho|altura|abertura|nivel|alto|desvio)|elementos\.\d{1,2}\.forma\.(giro|ancho|alto|lado|angulo|radio|R1|R2|espesor|apertura)|elementos\.\d{1,2}\.forma\.centro\.[01])$/;
  const TIPOS_OK = Object.keys(TIPOS), FORMAS_OK = ['rectangulo', 'lamina', 'prisma', 'circulo', 'semicirculo', 'poligono', 'lente'];
  // Valida y acota lo que viene de un archivo antes de usarlo (entrada no confiable)
  function datosSeguros(d = {}) {
    const base = completa(ESCENAS.find(e => e.clave === d.clave) || ESCENAS[0]);
    const pos = (v, def, min = 1e-6, max = 1e3) => numero(v, def, min, max);
    const coord = (p, def = [0, 0]) => (Array.isArray(p) && p.length === 2 ? [numero(p[0], def[0], -1e3, 1e3), numero(p[1], def[1], -1e3, 1e3)] : def.slice());
    const ang = (v, def = 0) => numero(v, def, -100, 100);
    const indice = o => (typeof o.material === 'string' && MATERIALES[o.material] ? { material: o.material } : { n: numero(o.n, 1.5, 1, 5) });
    const elementos = [], ids = new Set();
    for (const o of (Array.isArray(d.elementos) ? d.elementos : []).slice(0, 40)) {
      if (!o || typeof o !== 'object' || !TIPOS_OK.includes(o.tipo)) continue;
      let id = texto(o.id, '', 8); if (!/^e\d{1,4}$/.test(id) || ids.has(id)) { do { id = 'e' + (++contador); } while (ids.has(id)); }
      ids.add(id);
      const e = { id, tipo: o.tipo, nombre: texto(o.nombre, TIPOS[o.tipo].nombre, 40) };
      switch (o.tipo) {
        case 'medio': {
          const f = o.forma && typeof o.forma === 'object' ? o.forma : {}, tipo = FORMAS_OK.includes(f.tipo) ? f.tipo : 'rectangulo';
          const forma = { tipo, centro: coord(f.centro), giro: ang(f.giro) };
          if (tipo === 'rectangulo' || tipo === 'lamina') Object.assign(forma, { ancho: pos(f.ancho, 0.1), alto: pos(f.alto, 0.05) });
          if (tipo === 'prisma') Object.assign(forma, { lado: pos(f.lado, 0.05), angulo: numero(f.angulo, Math.PI / 3, GR, 179 * GR) });
          if (tipo === 'circulo' || tipo === 'semicirculo') forma.radio = pos(f.radio, 0.05);
          if (tipo === 'poligono') forma.puntos = (Array.isArray(f.puntos) ? f.puntos : []).slice(0, 16).map(p => coord(p));
          if (tipo === 'lente') Object.assign(forma, { R1: numero(f.R1, 0.1, -1e3, 1e3), R2: numero(f.R2, -0.1, -1e3, 1e3), espesor: pos(f.espesor, 0.01), apertura: pos(f.apertura, 0.04) });
          if (tipo === 'poligono' && forma.puntos.length < 3) continue;
          Object.assign(e, { forma }, indice(o));
          break;
        }
        case 'recipiente': Object.assign(e, { centro: coord(o.centro), giro: ang(o.giro), ancho: pos(o.ancho, 0.1), nivel: pos(o.nivel, 0.05), alto: pos(o.alto, 0.06) }, indice(o)); break;
        case 'espejo':
          Object.assign(e, { espejo: ['esferico', 'parabolico'].includes(o.espejo) ? o.espejo : 'plano', centro: coord(o.centro), giro: ang(o.giro, Math.PI), reflectividad: numero(o.reflectividad, 1, 0, 1) });
          if (e.espejo !== 'plano') { e.R = numero(o.R, 0.2, -1e3, 1e3) || 0.2; e.apertura = Math.min(pos(o.apertura, 0.1), 2 * Math.abs(e.R)); } else e.largo = pos(o.largo, 0.1);
          break;
        case 'lente': Object.assign(e, { centro: coord(o.centro), giro: ang(o.giro), largo: pos(o.largo, 0.1), f: numero(o.f, 0.1, -1e3, 1e3) || 0.1 }); break;
        case 'divisor': Object.assign(e, { centro: coord(o.centro), giro: ang(o.giro), largo: pos(o.largo, 0.05), R: numero(o.R, 0.5, 0, 1) }); break;
        case 'bloqueador': case 'pantalla': case 'ojo': Object.assign(e, { centro: coord(o.centro), giro: ang(o.giro), largo: pos(o.largo, 0.05) }); break;
        default:
          Object.assign(e, { origen: coord(o.origen), giro: ang(o.giro), lambda: o.lambda === null ? null : numero(o.lambda, LD, 300e-9, 800e-9) });
          if (o.tipo === 'haz') Object.assign(e, { ancho: pos(o.ancho, 0.02), rayos: Math.round(numero(o.rayos, 7, 1, 301)) });
          if (o.tipo === 'puntual' || o.tipo === 'objeto') Object.assign(e, { abertura: numero(o.abertura, DOS_PI, 1e-4, DOS_PI), rayos: Math.round(numero(o.rayos, 9, 1, 301)) });
          if (o.tipo === 'objeto') { e.altura = numero(o.altura, 0.02, -1e3, 1e3); e.desvio = numero(o.desvio, 0, -Math.PI, Math.PI); }
      }
      elementos.push(e);
    }
    const variables = {};
    for (const [k, v] of Object.entries(d.variables && typeof d.variables === 'object' ? d.variables : {})) {
      if (!v || !Array.isArray(v.liga) || !/^[A-Za-z]\w{0,7}$/.test(k)) continue;
      const min = numero(v.min, 0, -1e9, 1e9), max = Math.max(min, numero(v.max, 1, -1e9, 1e9));
      const liga = v.liga.filter(r => typeof r === 'string' && RUTA_OK.test(r) && +r.split('.')[1] < elementos.length);
      if (!liga.length) continue;
      variables[k] = { sim: texto(v.sim, k, 3), sub: v.sub ? texto(v.sub, '', 4) : undefined, val: numero(v.val, min, min, max), min, max, paso: pos(v.paso, 0.1, 1e-9, 1e9), u: ['mm', 'cm', 'm', '°', '', 'nm', '%'].includes(v.u) ? v.u : '', factor: numero(v.factor, 1, -1e15, 1e15) || 1, offset: numero(v.offset, 0, -100, 100), liga };
    }
    const capas = {};
    for (const k of Object.keys(base.capas)) capas[k] = typeof d.capas?.[k] === 'boolean' ? d.capas[k] : !!base.capas[k];
    const GRAF = ['snell', 'fresnel', 'invariante', 'angulos', 'desviacion', 'dispersion', 'lente', 'aumento', 'inversas', 'pantalla'];
    const regla = Array.isArray(d.regla) && d.regla.length === 2 ? [coord(d.regla[0]), coord(d.regla[1])] : null;
    const r = {
      clave: ESCENAS.some(e => e.clave === d.clave) ? d.clave : 'propio', titulo: texto(d.titulo, base.titulo, 80),
      tipo: ['Tutorial', 'Ejemplo', 'MEXT', 'Propio'].includes(d.tipo) ? d.tipo : 'Propio', anio: d.anio ? texto(d.anio, '', 14) : undefined,
      unidad: ['mm', 'cm', 'm'].includes(d.unidad) ? d.unidad : 'cm',
      ambiente: d.ambiente && typeof d.ambiente === 'object' ? indice(d.ambiente) : { n: 1 },
      parciales: !!d.parciales, maxRebotes: Math.round(numero(d.maxRebotes, 120, 1, 2000)), elementos, variables, regla, capas,
      graficas: Array.isArray(d.graficas) && d.graficas.length === 3 && d.graficas.every(g => GRAF.includes(g)) ? d.graficas.slice() : base.graficas.slice(),
      referencia: Number.isInteger(d.referencia) && d.referencia >= 0 && d.referencia < 20 ? d.referencia : null,
      caja: Array.isArray(d.caja) && d.caja.length === 4 && d.caja.every(Number.isFinite) && d.caja[1] > d.caja[0] && d.caja[3] > d.caja[2] ? d.caja.map(x => numero(x, 0, -1e3, 1e3)) : null,
      sel: typeof d.sel === 'string' && (d.sel === 'escena' || elementos.some(e => e.id === d.sel)) ? d.sel : 'escena',
    };
    if (r.ambiente.n && !(r.ambiente.n >= 1)) r.ambiente = { n: 1 };
    return r;
  }
  function restaurar(d) {
    ESC = datosSeguros(d); aplicarVariables();
    if (!(sel === 'escena' || sel === 'regla' && ESC.regla || elDe(sel))) sel = ESC.sel || 'escena';
    titulo(); construirVariables(); inspector(); recalcular();
  }
  function botonesHistorial() { $('#b-deshacer').disabled = !historial?.puedeDeshacer; $('#b-rehacer').disabled = !historial?.puedeRehacer; }
  function registrar() { if (historial && historial.registrar(sinSel(instantanea()))) botonesHistorial(); }
  const sinSel = o => { delete o.sel; return o; };
  function deshacer() { const d = historial?.deshacer(); if (d) { restaurar(d); botonesHistorial(); avisar('Cambio deshecho', false); } }
  function rehacer() { const d = historial?.rehacer(); if (d) { restaurar(d); botonesHistorial(); avisar('Cambio rehecho', false); } }
  $('#b-deshacer').addEventListener('click', deshacer);
  $('#b-rehacer').addEventListener('click', rehacer);

  async function abrirEscena1(clave) {
    if (hayCambios() && !(await confirmarCambios('cambiar de escena'))) return;
    ESC = completa(escenaDe(clave)); aplicarVariables();
    sel = ESC.sel || 'escena'; vistaTocada = false; herramienta = null; marcarHerramienta();
    titulo(); construirVariables(); inspector(); recalcular();
    escala0 = tz.vista.escala; zoomTexto();
    if (historial) { historial.reiniciar(sinSel(instantanea())); botonesHistorial(); }
    documentoNuevo();
  }
  function guardar() { guardarEscena(escenaActual()).then(r => { if (r) avisar('Escena guardada', false); }, e => avisar(`No se pudo guardar: ${e}`, false)); }
  const PAGINAS_OPTICA = { geometrica: 'optica.html', interferencia: 'optica-ondas.html', peliculas: 'optica-peliculas.html' };
  // Una escena de otro espacio de Óptica se abre en su pantalla
  function aOtroEspacio(e, propio) {
    if (!e.espacio || e.espacio === propio || !PAGINAS_OPTICA[e.espacio]) return false;
    try { sessionStorage.setItem('volta.abrir', JSON.stringify(e)); } catch { /* sin almacenamiento */ }
    location.href = PAGINAS_OPTICA[e.espacio];
    return true;
  }
  function abrir() {
    abrirEscena({ modulo: 'optica' }).then(e => {
      if (aOtroEspacio(e, 'geometrica')) return;
      sel = 'escena'; restaurar(e.datos); vistaTocada = false; encuadrar(); escala0 = tz.vista.escala; zoomTexto(); todo();
      if (historial) { historial.reiniciar(sinSel(instantanea())); botonesHistorial(); }
      avisar(`Escena abierta: ${texto(e.titulo, 'sin título', 60)}`, false);
    }).catch(err => avisar(err.message, false));
  }

  // ---------------------------------------------------------------------
  // Paleta, herramientas y capas
  // ---------------------------------------------------------------------
  function marcarHerramienta() {
    document.querySelectorAll('.herr').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.herr === herramienta || (b.dataset.herr === 'transportador' && ESC.capas.angulos))));
    lienzo.style.cursor = herramienta ? 'crosshair' : 'default';
  }
  function ponerHerramienta(h) {
    if (h === 'transportador') { alternarCapa('angulos'); avisar(ESC.capas.angulos ? 'Transportador: normales y ángulos en cada interfaz' : 'Sin transportador', false); marcarHerramienta(); return; }
    herramienta = herramienta === h ? null : h; marcarHerramienta();
    if (herramienta === 'regla') avisar('Regla: arrastra entre dos puntos · Esc termina', false);
    else if (herramienta) avisar(`${document.querySelector(`.herr[data-herr="${h}"] span`).textContent}: clic en el lienzo para colocarlo · Esc termina`, false);
  }
  document.querySelectorAll('.herr').forEach(b => b.addEventListener('click', () => ponerHerramienta(b.dataset.herr)));
  function ponerCapa(k, on) { ESC.capas[k] = on; document.querySelectorAll(`.capa-btn[data-capa="${k}"]`).forEach(b => b.setAttribute('aria-pressed', String(on))); }
  const alternarCapa = k => { ponerCapa(k, !ESC.capas[k]); registrar(); marcarHerramienta(); todo(); };
  document.querySelectorAll('.capa-btn').forEach(b => b.addEventListener('click', () => alternarCapa(b.dataset.capa)));
  function alternarParciales() { ESC.parciales = !ESC.parciales; titulo(); cambio(); avisar(ESC.parciales ? 'Con reflejos parciales (Fresnel)' : 'Sin reflejos parciales: solo el rayo transmitido', false); }
  $('#b-modo').addEventListener('click', alternarParciales);
  $('#pest').addEventListener('click', () => setTimeout(todo, 0));

  // ---------------------------------------------------------------------
  // Lienzo: colocar, seleccionar, arrastrar, girar, zoom y paneo
  // ---------------------------------------------------------------------
  // Paso de ajuste al arrastrar: la décima parte de la cuadrícula mayor (fino con Mayús)
  const ajuste = (x, fino) => { const p = Volta.pasoAgradable(90 / tz.vista.escala) / (fino ? 100 : 10); return Math.round(x / p) * p; };
  lienzo.addEventListener('pointerdown', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, v = tz.vista, w = [v.mx(X), v.my(Y)];
    if (ev.button === 1 || ev.button === 2 || espacioPulsado) { paneo = [X, Y, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId); return; }
    if (herramienta === 'regla') { const p = [ajuste(w[0]), ajuste(w[1])]; ESC.regla = [p, p.slice()]; arrastre = { tipo: 'regla-nueva' }; lienzo.setPointerCapture(ev.pointerId); return; }
    if (herramienta) { const h = herramienta; if (!ev.shiftKey) { herramienta = null; marcarHerramienta(); } crear(h, [ajuste(w[0]), ajuste(w[1])]); return; }
    const ob = objetoEn(X, Y);
    if (ob && ob.id === 'regla') { if (sel !== 'regla') seleccionar('regla'); arrastre = { tipo: ob.asa != null ? 'regla:' + ob.asa : 'regla', w0: w, r0: copia(ESC.regla), movido: false }; lienzo.setPointerCapture(ev.pointerId); return; }
    if (ob) {
      if (sel !== ob.id) seleccionar(ob.id);
      const el = elDe(ob.id);
      arrastre = { tipo: ob.asa || 'mover', id: ob.id, w0: w, p0: posDe(el).slice(), movido: false };
      lienzo.setPointerCapture(ev.pointerId); return;
    }
    seleccionar('escena');
    paneo = [X, Y, v.ox, v.oy]; lienzo.setPointerCapture(ev.pointerId);
  });
  lienzo.addEventListener('pointermove', ev => {
    const r = lienzo.getBoundingClientRect(), X = ev.clientX - r.left, Y = ev.clientY - r.top, v = tz.vista, w = [v.mx(X), v.my(Y)];
    cursor = w;
    $('#cx').textContent = L(w[0], 4); $('#cy').textContent = L(w[1], 4);
    if (paneo) { vistaTocada = true; v.ox = paneo[2] + X - paneo[0]; v.oy = paneo[3] + Y - paneo[1]; dibujar(); return; }
    if (arrastre) {
      const fino = ev.shiftKey, a = arrastre;
      if (a.tipo === 'regla-nueva') ESC.regla[1] = [ajuste(w[0], fino), ajuste(w[1], fino)];
      else if (a.tipo === 'regla:0' || a.tipo === 'regla:1') ESC.regla[+a.tipo.slice(6)] = [ajuste(w[0], fino), ajuste(w[1], fino)];
      else if (a.tipo === 'regla') { const dx = w[0] - a.w0[0], dy = w[1] - a.w0[1]; ESC.regla = a.r0.map(p => [ajuste(p[0] + dx, fino), ajuste(p[1] + dy, fino)]); }
      else {
        const el = elDe(a.id), i = idxDe(a.id);
        if (a.tipo === 'mover') { moverA(el, [ajuste(a.p0[0] + w[0] - a.w0[0], fino), ajuste(a.p0[1] + w[1] - a.w0[1], fino)]); sincronizarVariables(rutasPos(el, i)); }
        else if (a.tipo === 'giro') {
          const c = v.P(posDe(el)); let g = Math.atan2(c[1] - Y, X - c[0]);
          const paso = fino ? 0.1 * GR : 1 * GR; g = Math.round(g / paso) * paso;
          girarA(el, g); sincronizarVariables([el.tipo === 'medio' ? `elementos.${i}.forma.giro` : `elementos.${i}.giro`]);
        } else if (a.tipo === 'altura') {
          const gg = el.giro ?? 0, t = [-Math.sin(gg), Math.cos(gg)];
          el.altura = ajuste((w[0] - el.origen[0]) * t[0] + (w[1] - el.origen[1]) * t[1], fino) || el.altura;
          sincronizarVariables([`elementos.${i}.altura`]);
        }
      }
      a.movido = true;
      simular(); todo(); return;
    }
    if (herramienta) return;
    const ob = objetoEn(X, Y), h = ob ? ob.id : null;
    lienzo.style.cursor = ob ? (ob.asa === 'giro' ? 'grab' : ob.asa != null ? 'move' : 'pointer') : 'default';
    if (h !== hover) { hover = h; dibujar(); }
  });
  const rutasPos = (el, i) => (el.tipo === 'medio' ? [`elementos.${i}.forma.centro.0`, `elementos.${i}.forma.centro.1`] : esFuente(el) ? [`elementos.${i}.origen.0`, `elementos.${i}.origen.1`] : [`elementos.${i}.centro.0`, `elementos.${i}.centro.1`]);
  lienzo.addEventListener('pointerup', () => {
    if (arrastre) {
      const a = arrastre; arrastre = null;
      if (a.tipo === 'regla-nueva') {
        const [p, q] = ESC.regla;
        if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9) ESC.regla = null;
        herramienta = null; marcarHerramienta(); sel = ESC.regla ? 'regla' : 'escena'; cambio();
      } else if (a.movido) { cambio(); }
    }
    paneo = null;
  });
  lienzo.addEventListener('pointerleave', () => { cursor = null; if (hover) { hover = null; dibujar(); } });
  lienzo.addEventListener('contextmenu', ev => ev.preventDefault());
  lienzo.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = lienzo.getBoundingClientRect();
    vistaTocada = true; tz.vista.zoom(Math.exp(-ev.deltaY * 0.0015), ev.clientX - r.left, ev.clientY - r.top);
    zoomTexto(); dibujar();
  }, { passive: false });
  function zoomTexto() { $('#zoom').textContent = Math.round(tz.vista.escala / escala0 * 100) + ' %'; }
  function zoomCentro(f) { vistaTocada = true; tz.vista.zoom(f, tz.w / 2, tz.h / 2); zoomTexto(); dibujar(); }
  function encuadrarTodo() { vistaTocada = false; encuadrar(); escala0 = tz.vista.escala; zoomTexto(); dibujar(); }
  $('#b-zoom-mas').addEventListener('click', () => zoomCentro(1.25));
  $('#b-zoom-menos').addEventListener('click', () => zoomCentro(0.8));
  $('#b-encuadrar').addEventListener('click', encuadrarTodo);

  // ---------------------------------------------------------------------
  // Menú de escenas y paleta de comandos
  // ---------------------------------------------------------------------
  const ICONO_TIPO = { Tutorial: 'i-tutorial', Ejemplo: 'i-ejemplo', MEXT: 'i-mext' };
  function menuEscenas() {
    const m = $('#menu-escenas');
    if (!m.hidden) { m.hidden = true; return; }
    m.innerHTML = [['Tutorial', 'Tutoriales'], ['Ejemplo', 'Ejemplos'], ['MEXT', 'MEXT']].map(([g, tit], i) => (i ? '<div class="menu-sep"></div>' : '') + `<div class="menu-titulo">${tit}</div>` + ESCENAS.filter(e => e.tipo === g).map(e =>
      `<div class="menu-item" role="menuitem" data-clave="${e.clave}"${ESC.clave === e.clave ? ' aria-current="true"' : ''}><svg class="ico"><use href="#${ICONO_TIPO[g]}"/></svg>${e.titulo}${e.anio ? `<span class="chip lleno">${e.anio}</span>` : ''}</div>`).join('')).join('');
    const r = $('#b-escenas').getBoundingClientRect();
    m.style.left = r.left + 'px'; m.style.top = (r.bottom + 4) + 'px'; m.hidden = false;
  }
  $('#b-escenas').addEventListener('click', ev => { ev.stopPropagation(); menuEscenas(); });
  $('#menu-escenas').addEventListener('click', ev => { const it = ev.target.closest('.menu-item'); if (!it) return; $('#menu-escenas').hidden = true; abrirEscena1(it.dataset.clave); });
  document.addEventListener('pointerdown', ev => { if (!ev.target.closest('#menu-escenas, #b-escenas')) $('#menu-escenas').hidden = true; });

  const COMANDOS = [
    ['i-encuadrar', 'Encuadrar todo', 'F', encuadrarTodo],
    ['i-tema-oscuro', 'Cambiar tema claro u oscuro', '', () => Volta.ponerTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')],
    ['n-transportador', 'Mostrar u ocultar los ángulos (transportador)', 'A', () => alternarCapa('angulos')],
    ['i-capas', 'Mostrar u ocultar las prolongaciones', 'P', () => alternarCapa('prolongaciones')],
    ['i-capas', 'Mostrar u ocultar las imágenes', 'I', () => alternarCapa('imagenes')],
    ['i-capas', 'Mostrar u ocultar focos y ejes', '', () => alternarCapa('focos')],
    ['i-ajustes', 'Reflejos parciales sí o no', 'M', alternarParciales],
    ['n-regla', 'Medir con la regla', 'R', () => ponerHerramienta('regla')],
    ['i-duplicar', 'Duplicar el objeto seleccionado', 'Ctrl D', duplicar],
    ['i-borrar', 'Quitar el objeto seleccionado', 'Supr', quitarSeleccion],
    ['i-historial', 'Restablecer la escena original', '', () => { if (ESCENAS.some(e => e.clave === ESC.clave)) { abrirEscena1(ESC.clave); avisar('Escena original restablecida', false); } }],
    ['i-deshacer', 'Deshacer', 'Ctrl Z', deshacer],
    ['i-rehacer', 'Rehacer', 'Ctrl Y', rehacer],
    ['i-guardar', 'Guardar escena', 'Ctrl S', guardar],
    ['i-carpeta', 'Abrir escena', 'Ctrl O', abrir],
    ['i-exportar', 'Exportar las interacciones a CSV', '', exportarCSV],
    ['i-tabla', 'Exportar las imágenes a CSV', '', exportarImagenes],
    ['i-tabla', 'Exportar los rayos trazados a CSV', '', exportarRayos],
    ['i-imagen', 'Exportar imagen del lienzo', '', exportarPNG],
    ...Object.entries({ rayo: 'un rayo', haz: 'un haz paralelo', puntual: 'una fuente puntual', objeto: 'un objeto luminoso', medio: 'un medio', 'lente-gruesa': 'una lente gruesa', recipiente: 'un recipiente', espejo: 'un espejo plano', 'espejo-curvo': 'un espejo curvo', lente: 'una lente ideal', divisor: 'un divisor de haz', bloqueador: 'un bloqueador', pantalla: 'una pantalla', ojo: 'un ojo' })
      .map(([h, t]) => [document.querySelector(`.herr[data-herr="${h}"] use`)?.getAttribute('href').slice(1) || 'i-mas', `Colocar ${t}`, '', () => ponerHerramienta(h), 'Objetos']),
    ...ESCENAS.map(e => [ICONO_TIPO[e.tipo], `Abrir escena: ${e.titulo}`, e.tipo === 'MEXT' ? `MEXT ${e.anio}` : e.tipo, () => abrirEscena1(e.clave), 'Escenas']),
  ];
  let selCmd = 0;
  function pintarComandos() {
    const q = $('#cmd-q').value.trim().toLowerCase(), lista = COMANDOS.filter(c => c[1].toLowerCase().includes(q));
    selCmd = Math.min(selCmd, Math.max(0, lista.length - 1));
    let grupo = null, html = '';
    lista.forEach((c, i) => {
      const g = c[4] || 'Acciones';
      if (g !== grupo) { html += `<div class="menu-titulo">${g}</div>`; grupo = g; }
      html += `<div class="menu-item${i === selCmd ? ' activo' : ''}" data-i="${COMANDOS.indexOf(c)}"><svg class="ico"><use href="#${c[0]}"/></svg>${c[1]}<span class="atajo">${c[2]}</span></div>`;
    });
    $('#cmd-lista').innerHTML = html;
    return lista;
  }
  function abrirComandos() { $('#menu-escenas').hidden = true; $('#velo-comandos').hidden = false; $('#cmd-q').value = ''; selCmd = 0; pintarComandos(); $('#cmd-q').focus(); }
  function cerrarComandos() { $('#velo-comandos').hidden = true; }
  $('#b-comandos').addEventListener('click', abrirComandos);
  $('#cmd-q').addEventListener('input', () => { selCmd = 0; pintarComandos(); });
  $('#cmd-lista').addEventListener('click', ev => { const it = ev.target.closest('.menu-item'); if (it) { cerrarComandos(); COMANDOS[+it.dataset.i][3](); } });
  $('#velo-comandos').addEventListener('click', ev => { if (ev.target.id === 'velo-comandos') cerrarComandos(); });
  document.addEventListener('keydown', ev => {
    if (!$('#velo-comandos').hidden) {
      const lista = pintarComandos();
      if (ev.key === 'Escape') cerrarComandos();
      else if (ev.key === 'ArrowDown') { selCmd = Math.min(lista.length - 1, selCmd + 1); pintarComandos(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { selCmd = Math.max(0, selCmd - 1); pintarComandos(); ev.preventDefault(); }
      else if (ev.key === 'Enter' && lista[selCmd]) { cerrarComandos(); lista[selCmd][3](); }
      return;
    }
    const mod = ev.ctrlKey || ev.metaKey, tecla = ev.key.toLowerCase();
    if (mod && tecla === 'k') { ev.preventDefault(); abrirComandos(); return; }
    if (mod && tecla === 's') { ev.preventDefault(); guardar(); return; }
    if (mod && tecla === 'o') { ev.preventDefault(); abrir(); return; }
    if (ev.target instanceof Element && ev.target.matches('input:not([type=range]), textarea')) return;
    if (mod && (tecla === 'y' || (ev.shiftKey && tecla === 'z'))) { ev.preventDefault(); rehacer(); return; }
    if (mod && tecla === 'z') { ev.preventDefault(); deshacer(); return; }
    if (mod && tecla === 'd') { ev.preventDefault(); duplicar(); return; }
    if (mod) return;
    if (ev.code === 'Space') { espacioPulsado = true; return; }
    if (ev.key === 'Escape') { if (herramienta) { herramienta = null; marcarHerramienta(); } $('#menu-escenas').hidden = true; }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') quitarSeleccion();
    else if (tecla === 'f') encuadrarTodo();
    else if (tecla === 'a') alternarCapa('angulos');
    else if (tecla === 'p') alternarCapa('prolongaciones');
    else if (tecla === 'i') alternarCapa('imagenes');
    else if (tecla === 'm') alternarParciales();
    else if (tecla === 'r') ponerHerramienta('regla');
  });
  document.addEventListener('keyup', ev => { if (ev.code === 'Space') espacioPulsado = false; });

  // ---------------------------------------------------------------------
  // Arranque. Parámetros para capturas: ?escena=prisma-blanca&sel=e2&pest=imagenes
  // ---------------------------------------------------------------------
  Volta.alCambiarTema(() => { tz.temas(); todo(); });
  window.addEventListener('resize', () => { tz.ajustar(); if (!vistaTocada) { encuadrar(); escala0 = tz.vista.escala; zoomTexto(); } todo(); });
  document.fonts.ready.then(() => {
    const q = new URLSearchParams(location.search), limpio = ![...q.keys()].length;
    const pend = escenaPendiente('optica');
    const previa = (pend && (!pend.espacio || pend.espacio === 'geometrica') ? pend : null) || (limpio ? autoguardado.leer('optica', { modulo: 'optica' }) : null);
    tz.ajustar();
    if (q.has('escena') || !previa) { ESC = completa(escenaDe(q.get('escena') || 'refraccion')); sel = ESC.sel || 'escena'; }
    else { ESC = datosSeguros(previa.datos); sel = ESC.sel || 'escena'; }
    aplicarVariables();
    if (q.has('capas')) for (const k of q.get('capas').split(',')) if (k in ESC.capas) ESC.capas[k] = true;
    if (q.has('sel')) { const s = q.get('sel'); if (s === 'escena' || elDe(s)) sel = s; }
    autoguardar = true;
    registrarDocumento({ clave: 'optica', escena: escenaActual, origen: (!q.has('escena') && previa) || null, abrir, guardar });
    titulo(); construirVariables(); inspector();
    recalcular(); escala0 = tz.vista.escala; zoomTexto();
    const pe = q.get('pest'); if (pe) { const b = document.querySelector(`#pest [aria-controls="p-${pe}"]`); if (b) b.click(); }
    todo();
    historial = new Historial(sinSel(instantanea())); botonesHistorial();
  });
})();
