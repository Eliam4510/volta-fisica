/* ==========================================================================
   Volta — motor general de Mecánica (partículas con restricciones y eventos)

   Autómata híbrido:
   - Estado: posición y velocidad de cada partícula.
   - Modo: qué restricciones unilaterales están activas (apoyos de cada
     partícula en una o varias superficies, «i:js»; discos apoyados entre sí,
     «i:j»; cuerdas tensas). Las bilaterales (varillas) siempre lo están.
   - En cada modo, la dinámica es M·a = F + Σ λ_j ∇C_j con J·a = −J̇·v
     − 2α·Ċ − β²·C (estabilización de Baumgarte), resuelta por evaluación.
   - Los cambios de modo son eventos localizados por el integrador
     (Dormand–Prince 5(4) con salida densa y método de Brent):
       · impacto con una superficie (hueco C → 0)      → choque con e
       · normal nula (λ → 0)                           → despegue
       · fin de un segmento                            → vuelo
       · cuerda floja que se tensa (C → 0)             → tirón inelástico
       · tensión nula (λ → 0)                          → cuerda floja
       · cuerda que toca un clavo                      → pivote nuevo
       · choque entre partículas (distancia → r1 + r2) → impulso con e
       · contacto entre partículas que deja de empujar → se separan
       · velocidad tangencial nula con fricción        → reposo o sigue
   El radio de una partícula cuenta también contra las superficies (un disco
   apoya su borde). Tras cada evento se resuelven los choques que ocurren en
   el mismo instante (impulsos secuenciales), y el paso se acota según la
   rapidez para que dos cuerpos no se crucen dentro de un paso.
   Regla post-Zeno: un rebote más lento que `umbral`, o cerca del límite de
   eventos, se convierte en contacto persistente. Si aun así se alcanza el
   límite, se devuelve lo simulado con `incompleta`.
   Puro: sin DOM.
   ========================================================================== */
import { integrar, interpolar } from '../nucleo/integradores.js';

/**
 * @typedef {Object} Particula
 * @property {string} id
 * @property {number} m                Masa (kg)
 * @property {[number, number]} p      Posición (m)
 * @property {[number, number]} v      Velocidad (m/s)
 * @property {number} [radio=0]        Radio del disco (m): cuenta en los choques entre partículas y contra las superficies
 * @property {number} [inercia]        Con radio: el disco gira, con momento de inercia I = inercia·m·r² (½ disco
 *                                     o cilindro macizo, 2/5 esfera maciza, 2/3 esfera hueca, 1 aro). La fricción
 *                                     actúa en el punto de contacto: rueda sin deslizar o desliza girando
 * @property {number} [w=0]            Velocidad angular inicial (rad/s, positiva antihoraria)
 * @property {number} [theta=0]        Ángulo inicial (rad)
 * @property {[number, number]} [Fpunto] Punto de aplicación de F en el marco del cuerpo que gira (desde su
 *                                     centro, gira con él): F hace par. Sin giro, F actúa en el centro
 * @property {'bloque'} [forma]        Bloque rígido: rectángulo de ancho × alto que gira (I = m(a² + h²)/12) y
 *                                     se apoya en las superficies por sus cuatro vértices (puede volcar)
 * @property {number} [ancho]          Bloque: ancho (m)
 * @property {number} [alto]           Bloque: alto (m)
 * @property {[number, number]} [F]    Fuerza constante aplicada (N)
 * @property {boolean} [cinematica]    Conductor de masa infinita que se mueve con velocidad constante v
 *   (una mano que sube despacio, una cinta): no siente fuerzas; su trabajo sale en energiaMecanica().W
 * @property {Array<[number, number, number]>} [perfil] Solo con cinematica: aceleración impuesta por
 *   tramos, [hasta t (s), ax, ay] en orden; después del último, aceleración nula (un ascensor que
 *   arranca y frena, un coche que sigue una gráfica v–t)
 *
 * @typedef {Object} Superficie
 * @property {string} id
 * @property {'segmento'|'arco'} tipo
 * @property {[number, number]} [a]    Segmento: extremo inicial
 * @property {[number, number]} [b]    Segmento: extremo final (el lado sólido queda a la derecha de a→b)
 * @property {[number, number]} [c]    Arco: centro
 * @property {number} [r]              Arco: radio
 * @property {'exterior'|'interior'} [cara] Arco: la partícula va por fuera (esfera) o por dentro (cuenco)
 * @property {number} [e=1]            Coeficiente de restitución
 * @property {number} [mu=0]           Fricción cinética
 * @property {number} [muS]            Fricción estática (por defecto, igual a mu)
 * @property {string} [sobre]          Id del cuerpo que lleva la superficie: a, b o c son relativos a su
 *   posición y la superficie se traslada con él; la reacción y la fricción lo empujan al revés
 *
 * @typedef {Object} Conector
 * @property {string} id
 * @property {'resorte'|'cuerda'|'varilla'|'polea'|'prensa'} tipo
 * @property {string} a                Partícula
 * @property {string} [b]              Otra partícula (o ancla fija)
 * @property {[number, number]} [ancla] Punto fijo si no hay b
 * @property {number} [k]              Resorte: constante (N/m)
 * @property {number} [L0]             Resorte: longitud natural (m)
 * @property {number} [c]              Resorte: amortiguamiento (N·s/m)
 * @property {boolean} [soloTira]      Resorte: cuerda elástica (de goma), que no empuja cuando está más corta que L0
 * @property {number} [L]              Cuerda o varilla: longitud; polea: longitud total
 * @property {[number, number]} [polea] Polea: punto fijo sobre el que pasa la cuerda (a y b son los extremos)
 * @property {Array<[number, number]>} [clavos] Cuerda: clavos donde puede engancharse
 * @property {number} [n]              Prensa hidráulica: el émbolo b tiene n veces el área del a. El
 *   líquido (incompresible, sin peso) conserva el volumen: Δy_a + n·Δy_b = 0; la presión es la misma
 *   en los dos émbolos, así que la fuerza sobre b es n veces la de a (Pascal)
 *
 * @typedef {Object} EscenaMecanica
 * @property {[number, number]} [g]    Gravedad (m/s²)
 * @property {number} [b]              Arrastre lineal (N·s/m)
 * @property {number} [cAire]          Arrastre cuadrático (N·s²/m²)
 * @property {Particula[]} particulas
 * @property {Superficie[]} [superficies]
 * @property {Conector[]} [conectores]
 * @property {number} [duracion=5]
 * @property {number} [eParticulas=1]  Restitución entre partículas (también contra las caras de un bloque)
 * @property {number} [muCuerpos=0]    Fricción en los contactos con las caras de un bloque y entre dos discos
 *                                     apoyados uno en otro si alguno gira
 * @property {number} [umbral=1e-3]    Rapidez normal (m/s) bajo la cual un rebote se convierte en contacto
 * @property {number} [rtol=1e-10]
 * @property {number} [maxEventos=2000] Límite de eventos (regla post-Zeno cerca del límite)
 * @property {number} [maxPasos=150000] Presupuesto total de pasos del integrador: una escena
 *   patológica (cientos de contactos que cambian sin parar) devuelve lo simulado en vez de
 *   bloquear la pantalla
 * @property {number} [tiempoMax=5000] Red de seguridad en milisegundos de reloj, revisada tras
 *   cada tramo (solo actúa en escenas patológicas; las normales tardan menos de 100 ms)
 * @property {number} [pasoMax]        Paso máximo del integrador (s)
 */

const UMBRAL_LAMBDA = 1e-12;
/** Regularización relativa de la diagonal de J M⁻¹ Jᵀ (ver `dinamica`). */
const REGULARIZACION = 1e-9;
/** Constantes de la estabilización de Baumgarte: C̈ + 2α Ċ + β² C = 0. */
const ALFA_B = 20, BETA_B = 20;
/** Aceleración estabilizada (m/s²) por debajo de la cual una restricción soltada vuelve a penetrar. */
const UMBRAL_W = 1e-9;

// ---------------------------------------------------------------------------
// Geometría
// ---------------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const norm = a => Math.hypot(a[0], a[1]);
/** Largo actual de un resorte en el estado y. */
function largoResorte(c, y) {
  const pa = [y[4 * c.ia], y[4 * c.ia + 1]], pb = c.ib < 0 ? c.ancla : [y[4 * c.ib], y[4 * c.ib + 1]];
  return norm(sub(pa, pb));
}
/** Claves de las restricciones unilaterales activas de un modo. */
const activas = modo => new Set([
  ...Object.keys(modo.contactos).map(k => 'contacto:' + k),
  ...Object.keys(modo.pares).map(k => 'par:' + k),
  ...Object.entries(modo.cuerdas).filter(([, e]) => e.tensa).map(([id]) => 'cuerda:' + id),
]);
/** Radio de la partícula i (0 si es puntual). */
const radio = (S, i) => S.P[i].radio || 0;
/** Hueco por debajo del cual dos cuerpos se consideran en contacto tras un evento (m). */
const TOL_HUECO = 1e-9;
/** Penetración máxima que todavía se trata como contacto con una superficie (m). */
const TOL_PENETRACION = 1e-6;
/** Duración de la pausa en la que se silencia un evento descartado (s). */
const PAUSA = 1e-7;
/** Fuerza de contacto mínima (N) para que dos discos sigan apoyados uno en otro. */
const LAMBDA_PAR_MIN = 1e-9;
/** Distancia (m) a la que un disco lento ya se considera apoyado (contacto persistente). */
const tolContacto = R => Math.max(1e-6, 1e-3 * R);

/** Datos derivados de un segmento: dirección unitaria, normal (lado libre a la izquierda de a→b) y largo. */
function geoSegmento(s) {
  const d = sub(s.b, s.a), L = norm(d), t = [d[0] / L, d[1] / L];
  // El sólido queda a la derecha de a→b; la normal apunta al lado libre (izquierda)
  return { t, n: [-t[1], t[0]], L };
}

// ---------------------------------------------------------------------------
// Construcción del sistema
// ---------------------------------------------------------------------------

/**
 * Prepara la escena: índices de partículas y restricciones posibles.
 * @param {EscenaMecanica} e
 */
function preparar(e) {
  const P = e.particulas;
  const idx = Object.fromEntries(P.map((p, i) => [p.id, i]));
  const g = e.g ?? [0, -9.8];
  // Una superficie puede ir sobre un cuerpo (sobre: id): su geometría es
  // relativa a la posición de ese cuerpo y se traslada con él (sin girar)
  /** @type {any[]} */
  const sup = (e.superficies || []).map(s => ({ ...s, geo: s.tipo === 'segmento' ? geoSegmento(s) : null, j: s.sobre != null ? idx[s.sobre] : -1 }));
  for (const s of sup) if (s.j == null) throw new Error(`La superficie ${s.id} va sobre un cuerpo que no existe.`);
  const con = (e.conectores || []).map(c => ({ ...c, ia: idx[c.a], ib: c.b != null ? idx[c.b] : -1 }));
  for (const c of con) {
    if (c.ia == null || (c.b != null && c.ib == null)) throw new Error(`El conector ${c.id} une partículas que no existen.`);
    if (c.tipo === 'prensa') {
      if (!(c.ib >= 0) || !(c.n > 0)) throw new Error(`La prensa ${c.id} necesita dos émbolos y una razón de áreas positiva.`);
      Object.assign(c, { xa0: P[c.ia].p[0], ya0: P[c.ia].p[1], xb0: P[c.ib].p[0], yb0: P[c.ib].p[1] });
    }
  }
  // Masas inversas. Un cuerpo cinemático (cinematica: true) es un conductor de
  // masa infinita que se mueve a velocidad constante pase lo que pase: la mano
  // que sube un peso despacio, una cinta, un ascensor. Su masa inversa es 0.
  const im = P.map(p => (p.cinematica ? 0 : 1 / p.m));
  // Tramos de aceleración impuesta de los cinemáticos, ordenados por su final
  const perfiles = P.map(p => (p.cinematica && Array.isArray(p.perfil) && p.perfil.length
    ? p.perfil.filter(f => Array.isArray(f) && f.length >= 3 && f.every(Number.isFinite)).map(f => [f[0], f[1], f[2]]).sort((a, b) => a[0] - b[0])
    : null));
  // Giro: un disco con inercia (I = k·m·r²) suma dos componentes al final del
  // estado, su ángulo θ y su velocidad angular ω. En las filas de las
  // restricciones su giro es un grado de libertad más, con índice n + k y
  // masa inversa 1/I: una entrada [n + k, coef, 0] del gradiente es el
  // coeficiente de ω (solo se usa la primera componente)
  const rot = P.map(() => -1), I = [];
  // Un bloque (rectángulo) siempre gira: I = m(a² + h²)/12 respecto de su
  // centro; sus vértices, en su propio marco, son los puntos de apoyo
  /** @type {(number[][] | null)[]} */
  const vert = P.map(p => (p.forma === 'bloque' && !p.cinematica && p.ancho > 0 && p.alto > 0
    ? [[-p.ancho / 2, -p.alto / 2], [p.ancho / 2, -p.alto / 2], [p.ancho / 2, p.alto / 2], [-p.ancho / 2, p.alto / 2]] : null));
  P.forEach((p, i) => {
    if (p.cinematica) return;
    if (vert[i]) { rot[i] = I.length; I.push(p.m * (p.ancho ** 2 + p.alto ** 2) / 12); }
    else if (p.inercia > 0 && p.radio > 0) { rot[i] = I.length; I.push(p.inercia * p.m * p.radio ** 2); }
  });
  for (const Ik of I) im.push(1 / Ik);
  // Caras de los bloques: cuatro segmentos que giran con él (gira: true, en su
  // marco). Los vértices van en sentido antihorario, así que de b a a el
  // sólido queda a la derecha y la normal libre apunta hacia fuera. Con ellas,
  // los vértices de otro bloque y los discos chocan con el bloque y se apoyan
  // en él con la misma maquinaria que contra el suelo (apilar cajas)
  const nReales = sup.length, caras = [];
  vert.forEach((vs, i) => {
    if (!vs) return;
    for (let q = 0; q < 4; q++) {
      const s0 = { id: `${P[i].id}#${q}`, tipo: 'segmento', a: vs[(q + 1) % 4], b: vs[q], e: e.eParticulas ?? 1, mu: e.muCuerpos ?? 0 };
      sup.push({ ...s0, geo: geoSegmento(s0), j: i, gira: true });
      caras.push([i, q]);
    }
  });
  // Esquinas de los bloques: un disco que llega a la esquina choca con ella
  // (arco de radio 0 en el vértice). Sin ellas, un disco que entra por la
  // esquina pasa por detrás de las dos caras y atraviesa el bloque
  vert.forEach((vs, i) => {
    if (!vs) return;
    for (let q = 0; q < 4; q++) {
      sup.push({ id: `${P[i].id}#v${q}`, tipo: 'arco', c: vs[q], r: 0, cara: 'exterior', e: e.eParticulas ?? 1, mu: e.muCuerpos ?? 0, geo: null, j: i, gira: true, esquina: true });
      caras.push([i, 4 + q]);
    }
  });
  const S = { P, idx, g, sup, con, n: P.length, im, perfiles, aImp: P.map(() => [0, 0]), b: e.b || 0, cAire: e.cAire || 0, rot, I, nr: I.length, base: 4 * P.length + 2, vert, nReales, caras, muPares: e.muCuerpos ?? 0 };
  actualizarImpuestas(S, 0);
  return S;
}

/**
 * Suma (dx, dy) a la velocidad del grado de libertad i: una partícula, o el
 * giro de un disco si i ≥ n (entonces solo cuenta dx, que va a ω).
 * @param {any} S @param {number[]} y @param {number} i @param {number} dx @param {number} dy
 */
function sumarVelocidad(S, y, i, dx, dy) {
  if (i < S.n) { y[4 * i + 2] += dx; y[4 * i + 3] += dy; } else y[S.base + 2 * (i - S.n) + 1] += dx;
}
/** Igual que `sumarVelocidad`, para las posiciones (θ en un giro). @param {any} S @param {number[]} y @param {number} i @param {number} dx @param {number} dy */
function sumarPosicion(S, y, i, dx, dy) {
  if (i < S.n) { y[4 * i] += dx; y[4 * i + 1] += dy; } else y[S.base + 2 * (i - S.n)] += dx;
}

/**
 * ¿Hay fricción en el contacto entre los discos i y j? Solo si alguno gira:
 * entre partículas que no giran el radio solo sirve para chocar, y así las
 * escenas de antes no cambian.
 * @param {any} S @param {number} i @param {number} j
 */
const friccionPar = (S, i, j) => S.muPares > 0 && (S.rot[i] >= 0 || S.rot[j] >= 0);
/** Estado de un par de discos apoyados: true, o {par, pegado, sentido} si hay fricción. */
const nuevoPar = (/** @type {any} */ S, /** @type {number} */ i, /** @type {number} */ j) => (friccionPar(S, i, j) ? { par: true, pegado: false, sentido: 0 } : true);
/**
 * Deslizamiento en el punto de contacto de dos discos: con û = (p_i − p_j)/D
 * y t̂ = ẑ×û, t̂·(v_i − v_j) − r_i·ω_i − r_j·ω_j. Gradiente con los dos giros;
 * J̇v = −(û·w)(û×w)/D (el giro de la recta de los centros), w = v_i − v_j.
 * @param {any} S @param {number[]} y @param {number} i @param {number} j
 */
function deslizamientoPar(S, y, i, j) {
  const d = [y[4 * i] - y[4 * j], y[4 * i + 1] - y[4 * j + 1]], D = norm(d), u = [d[0] / D, d[1] / D], t = [-u[1], u[0]];
  const w = [y[4 * i + 2] - y[4 * j + 2], y[4 * i + 3] - y[4 * j + 3]];
  const ri = radio(S, i), rj = radio(S, j), qi = S.rot[i], qj = S.rot[j];
  const wi = qi >= 0 ? y[S.base + 2 * qi + 1] : 0, wj = qj >= 0 ? y[S.base + 2 * qj + 1] : 0;
  const grad = [[i, t[0], t[1]], [j, -t[0], -t[1]]];
  if (qi >= 0) grad.push([S.n + qi, -ri, 0]);
  if (qj >= 0) grad.push([S.n + qj, -rj, 0]);
  return { t, vt: dot(t, w) - ri * wi - rj * wj, grad, jdv: -dot(u, w) * (u[0] * w[1] - u[1] * w[0]) / D };
}

/**
 * Apoyos de la partícula i: −1 es su centro (con su radio); un bloque se
 * apoya por sus vértices 0..3. La clave de un apoyo de vértice es «i.k».
 * @param {any} S @param {number} i @returns {number[]}
 */
const apoyosDe = (S, i) => (S.vert[i] ? [0, 1, 2, 3] : [-1]);
/** Clave «i:js» o «i.k:js» del apoyo k de la partícula i en la superficie js. */
const claveApoyo = (/** @type {number} */ i, /** @type {number} */ k, /** @type {number} */ js) => (k >= 0 ? `${i}.${k}:${js}` : `${i}:${js}`);
/** Partícula y vértice de «i» o «i.k». @param {string} txt @returns {[number, number]} */
function apoyoDe(txt) { const [a, b] = String(txt).split('.'); return [Number(a), b == null ? -1 : Number(b)]; }
/** ¿Pueden chocar las partículas i y j como discos? (los bloques no chocan entre sí ni con discos) */
const parPosible = (/** @type {any} */ S, /** @type {number} */ i, /** @type {number} */ j) => !S.vert[i] && !S.vert[j] && radio(S, i) + radio(S, j) > 0;
/** Punto de aplicación de la fuerza de i girado con θ (R·b), o null si F actúa en el centro. @param {any} S @param {number[]} y @param {number} i */
function brazoFuerza(S, y, i) {
  const b = S.P[i].Fpunto;
  if (!b || !S.P[i].F || S.rot[i] < 0 || (!b[0] && !b[1])) return null;
  const th = y[S.base + 2 * S.rot[i]], c = Math.cos(th), s = Math.sin(th);
  return [c * b[0] - s * b[1], s * b[0] + c * b[1]];
}
/** Vector del centro del bloque i a su vértice k, girado con θ: R(θ)·v_k. */
function brazo(S, y, i, k) {
  const th = y[S.base + 2 * S.rot[i]], c = Math.cos(th), s = Math.sin(th), [vx, vy] = S.vert[i][k];
  return [c * vx - s * vy, s * vx + c * vy];
}
/**
 * Punto de apoyo k de i en el mundo: posición P, velocidad V, la parte de su
 * aceleración que no depende de las aceleraciones (A0, la centrípeta de un
 * vértice) y sus entradas del gradiente para una dirección d.
 * @param {any} S @param {number[]} y @param {number} i @param {number} k
 */
function datosPunto(S, y, i, k) {
  const P = [y[4 * i], y[4 * i + 1]], V = [y[4 * i + 2], y[4 * i + 3]];
  if (k < 0) return { P, V, A0: [0, 0], entradas: (/** @type {number[]} */ d) => [[i, d[0], d[1]]] };
  const b = brazo(S, y, i, k), w = y[S.base + 2 * S.rot[i] + 1], q = S.n + S.rot[i];
  return {
    P: [P[0] + b[0], P[1] + b[1]], V: [V[0] - w * b[1], V[1] + w * b[0]], A0: [-w * w * b[0], -w * w * b[1]],
    entradas: (/** @type {number[]} */ d) => [[i, d[0], d[1]], [q, d[1] * b[0] - d[0] * b[1], 0]],
  };
}
/** Centro, velocidad, ángulo y ω del cuerpo que lleva una superficie que gira. @param {any} S @param {any} sup @param {number[]} y */
function marcoPortador(S, sup, y) {
  const B = sup.j, q = S.base + 2 * S.rot[B], th = y[q];
  return { c: [y[4 * B], y[4 * B + 1]], v: [y[4 * B + 2], y[4 * B + 3]], w: y[q + 1], co: Math.cos(th), si: Math.sin(th) };
}
/** Vector del marco del portador llevado al mundo. */
const alMundo = (/** @type {any} */ m, /** @type {number[]} */ u) => [m.co * u[0] - m.si * u[1], m.si * u[0] + m.co * u[1]];

/**
 * Fila de una dirección d (normal o tangente, en el mundo) para el punto pt
 * contra un portador que gira: valor d·(Ṗ − v_B − ω_B ẑ×r) con r = P − c_B
 * (la velocidad relativa al punto material del portador que está ahí), sus
 * entradas del gradiente y J̇v = ω_B(ẑ×d)·rel + d·A0 − ω_B·d·(ẑ×(Ṗ − v_B)).
 */
function filaGirando(S, sup, m, pt, d) {
  const r = sub(pt.P, m.c), VB = sub(pt.V, m.v), rel = [VB[0] + m.w * r[1], VB[1] - m.w * r[0]];
  const grad = [...pt.entradas(d), [sup.j, -d[0], -d[1]], [S.n + S.rot[sup.j], d[0] * r[1] - d[1] * r[0], 0]];
  const jdv = m.w * (-d[1] * rel[0] + d[0] * rel[1]) + dot(d, pt.A0) - m.w * (-d[0] * VB[1] + d[1] * VB[0]);
  return { valor: dot(d, rel), grad, jdv, r };
}

/** Posición del apoyo k de i en el marco de la superficie. @param {any} S @param {any} sup @param {number[]} y @param {number} i @param {number} k */
function puntoApoyo(S, sup, y, i, k) {
  if (sup.gira) {
    // En el marco del portador que gira: R_Bᵀ·(P − c_B)
    const m = marcoPortador(S, sup, y), d = sub(datosPunto(S, y, i, k).P, m.c);
    return [m.co * d[0] + m.si * d[1], -m.si * d[0] + m.co * d[1]];
  }
  const p = puntoRel(sup, y, i);
  if (k < 0) return p;
  const b = brazo(S, y, i, k);
  return [p[0] + b[0], p[1] + b[1]];
}
/** Velocidad del apoyo k de i respecto de la superficie: v + ω ẑ×(R·v_k). */
function velocidadApoyo(S, sup, y, i, k) {
  if (sup.gira) {
    const m = marcoPortador(S, sup, y), pt = datosPunto(S, y, i, k), r = sub(pt.P, m.c);
    return [pt.V[0] - m.v[0] + m.w * r[1], pt.V[1] - m.v[1] - m.w * r[0]];
  }
  const v = velocidadRel(sup, y, i);
  if (k < 0) return v;
  const b = brazo(S, y, i, k), w = y[S.base + 2 * S.rot[i] + 1];
  return [v[0] - w * b[1], v[1] + w * b[0]];
}

/**
 * Hueco entre el apoyo k de la partícula i y una superficie (C ≥ 0 libre).
 * El de un vértice de bloque tiene también una entrada de giro: ∂C/∂θ =
 * n̂·(ẑ×R·v_k), y J̇·v = −ω²·n̂·R·v_k (más la curvatura en un arco).
 * @param {any} S @param {any} sup @param {number} i @param {number} k
 */
function restriccionApoyo(S, sup, i, k) {
  if (sup.gira) {
    // Cara de un bloque: el hueco se mide en el marco del bloque; la velocidad
    // y el gradiente, en el mundo (con el giro del bloque)
    const rr = k < 0 ? radio(S, i) : 0;
    if (sup.esquina) {
      // Esquina Q = c_B + R·c0 contra el centro de un disco: C = |P − Q| − r.
      // J̇v: la curvatura (|ḋ|² − (û·ḋ)²)/D y la centrípeta de la esquina
      return {
        evaluar(y) {
          const m = marcoPortador(S, sup, y), pt = datosPunto(S, y, i, k), rho = alMundo(m, sup.c), Q = [m.c[0] + rho[0], m.c[1] + rho[1]];
          const d = sub(pt.P, Q), D = norm(d), u = [d[0] / D, d[1] / D], f = filaGirando(S, sup, m, pt, u);
          const VQ = [m.v[0] - m.w * rho[1], m.v[1] + m.w * rho[0]], dd = sub(pt.V, VQ), ud = dot(u, dd);
          const jdv = dot(u, pt.A0) + m.w * m.w * dot(u, rho) + (dot(dd, dd) - ud * ud) / D;
          return { C: D - rr, Cp: f.valor, grad: f.grad, jdv };
        },
      };
    }
    return {
      evaluar(y) {
        const m = marcoPortador(S, sup, y), pt = datosPunto(S, y, i, k), n = alMundo(m, sup.geo.n), d = sub(pt.P, m.c);
        const pb = [m.co * d[0] + m.si * d[1], -m.si * d[0] + m.co * d[1]], f = filaGirando(S, sup, m, pt, n);
        return { C: dot(sup.geo.n, sub(pb, sup.a)) - rr, Cp: f.valor, grad: f.grad, jdv: f.jdv };
      },
    };
  }
  if (k < 0) return restriccionSuperficie(sup, i, radio(S, i));
  const j = sup.j, q = S.n + S.rot[i];
  if (sup.tipo === 'segmento') {
    const { n } = sup.geo;
    return {
      evaluar(y) {
        const p = puntoApoyo(S, sup, y, i, k), v = velocidadApoyo(S, sup, y, i, k), b = brazo(S, y, i, k), w = y[S.base + 2 * S.rot[i] + 1];
        const grad = [[i, n[0], n[1]], [q, n[1] * b[0] - n[0] * b[1], 0]];
        if (j >= 0) grad.push([j, -n[0], -n[1]]);
        return { C: dot(n, sub(p, sup.a)), Cp: dot(n, v), grad, jdv: -w * w * dot(n, b) };
      },
    };
  }
  const sg = sup.cara === 'interior' ? -1 : 1;
  return {
    evaluar(y) {
      const p = puntoApoyo(S, sup, y, i, k), v = velocidadApoyo(S, sup, y, i, k), b = brazo(S, y, i, k), w = y[S.base + 2 * S.rot[i] + 1];
      const d = sub(p, sup.c), D = norm(d), u = [d[0] / D, d[1] / D], uv = dot(u, v);
      const grad = [[i, sg * u[0], sg * u[1]], [q, sg * (u[1] * b[0] - u[0] * b[1]), 0]];
      if (j >= 0) grad.push([j, -sg * u[0], -sg * u[1]]);
      return { C: sg * (D - sup.r), Cp: sg * uv, grad, jdv: sg * ((dot(v, v) - uv * uv) / D - w * w * dot(u, b)) };
    },
  };
}

/**
 * Deslizamiento de la partícula i sobre una superficie: velocidad tangencial
 * del punto de contacto respecto de la superficie. En un disco que gira, el
 * punto de contacto está en −r·n̂ desde el centro y se mueve con v + ω ẑ×(−r n̂):
 * su componente tangencial es t̂·v + cr·ω, con cr = −r·t̂·(ẑ×n̂) (en un suelo
 * horizontal recorrido hacia +x, cr = r: rueda sin deslizar con ω = −v/r).
 * @param {any} S @param {any} sup @param {number[]} y @param {number} i @param {number} [kv=-1] vértice del bloque
 * @returns {{t: number[], vt: number, cr: number, grad: number[][], jdv: number}} grad: gradiente de vt respecto de
 *   las velocidades; jdv: la parte de dvt/dt que no depende de las aceleraciones
 */
function deslizamiento(S, sup, y, i, kv = -1) {
  if (sup.gira) {
    // Contra la cara de un bloque: el punto de contacto es el vértice, o el
    // borde del disco (c − r·n̂, que gira con el disco si gira)
    const m = marcoPortador(S, sup, y);
    let t, n;
    if (sup.esquina) {
      // En la esquina, la normal va de la esquina al centro del disco
      const rho = alMundo(m, sup.c), d = sub([y[4 * i], y[4 * i + 1]], [m.c[0] + rho[0], m.c[1] + rho[1]]), D = norm(d);
      n = [d[0] / D, d[1] / D]; t = [-n[1], n[0]];
    } else { t = alMundo(m, sup.geo.t); n = alMundo(m, sup.geo.n); }
    let pt = datosPunto(S, y, i, kv);
    if (kv < 0) {
      const r = radio(S, i), q = S.rot[i], w = q >= 0 ? y[S.base + 2 * q + 1] : 0, b = [-r * n[0], -r * n[1]];
      pt = {
        P: [pt.P[0] + b[0], pt.P[1] + b[1]], V: [pt.V[0] - w * b[1], pt.V[1] + w * b[0]], A0: [-w * w * b[0], -w * w * b[1]],
        entradas: (/** @type {number[]} */ d) => [[i, d[0], d[1]], ...(q >= 0 ? [[S.n + q, d[1] * b[0] - d[0] * b[1], 0]] : [])],
      };
    }
    const f = filaGirando(S, sup, m, pt, t);
    return { t, vt: f.valor, cr: 0, grad: f.grad, jdv: f.jdv };
  }
  if (kv >= 0) {
    // Vértice de un bloque: el punto de contacto es el vértice
    const p = puntoApoyo(S, sup, y, i, kv), t = tangente(sup, p), vr = velocidadApoyo(S, sup, y, i, kv), b = brazo(S, y, i, kv);
    const cr = t[1] * b[0] - t[0] * b[1], grad = [[i, t[0], t[1]], [S.n + S.rot[i], cr, 0]], w = y[S.base + 2 * S.rot[i] + 1];
    if (sup.j >= 0) grad.push([sup.j, -t[0], -t[1]]);
    // El vértice gira alrededor del centro: su aceleración tiene la centrípeta −ω²·R·v_k
    return { t, vt: t[0] * vr[0] + t[1] * vr[1], cr, grad, jdv: -w * w * dot(t, b) };
  }
  const p = puntoRel(sup, y, i), t = tangente(sup, p), vr = velocidadRel(sup, y, i), k = S.rot[i];
  let vt = t[0] * vr[0] + t[1] * vr[1], cr = 0;
  const grad = [[i, t[0], t[1]]];
  if (k >= 0) {
    const n = normalLibre(sup, p);
    cr = -radio(S, i) * (t[1] * n[0] - t[0] * n[1]);
    vt += cr * y[S.base + 2 * k + 1];
    grad.push([S.n + k, cr, 0]);
  }
  if (sup.j >= 0) grad.push([sup.j, -t[0], -t[1]]);
  return { t, vt, cr, grad, jdv: 0 };
}

/**
 * Aceleración impuesta de cada cinemático en el tramo que empieza en t. Los
 * tramos de la simulación se cortan en los cambios de tramo del perfil, así
 * que dentro de cada uno es constante (no hace falta pasar t a la dinámica).
 * @param {any} S @param {number} t
 */
function actualizarImpuestas(S, t) {
  S.perfiles.forEach((pf, i) => {
    if (!pf) return;
    const k = pf.find(f => t < f[0] - 1e-12);
    S.aImp[i] = k ? [k[1], k[2]] : [0, 0];
  });
}
/** Próximo cambio de tramo de algún perfil después de t (Infinity si no hay). @param {any} S @param {number} t */
function proximoCorte(S, t) {
  let c = Infinity;
  for (const pf of S.perfiles) if (pf) for (const f of pf) if (f[0] > t + 1e-12) { c = Math.min(c, f[0]); break; }
  return c;
}

/**
 * ¿La partícula i y la superficie no interactúan? Un cuerpo no choca con su
 * propia superficie, y un cinemático no siente una superficie fija o llevada
 * por otro cinemático: ninguno de los dos puede ceder (la fila de la
 * restricción sería nula).
 * @param {any} S @param {number} i @param {any} sup
 */
function ajenos(S, i, sup) {
  // (un bloque no se apoya con sus vértices en la esquina de otro: vértice contra vértice no cuenta)
  return sup.j === i || (S.im[i] === 0 && (sup.j < 0 || S.im[sup.j] === 0)) || (sup.esquina === true && !!S.vert[i]);
}

/** Estado inicial empaquetado [x, y, vx, vy] por partícula. @param {any} S */
function estadoInicial(S) {
  const y = [];
  for (const p of S.P) y.push(p.p[0], p.p[1], p.v[0], p.v[1]);
  // Dos componentes más: la energía disipada de forma continua (fricción,
  // arrastre, amortiguadores y la estabilización de las restricciones) y el
  // trabajo hecho por los cuerpos cinemáticos (la mano, la cinta)
  y.push(0, 0);
  // Y el ángulo y la velocidad angular de cada disco que gira
  S.P.forEach((p, i) => { if (S.rot[i] >= 0) y.push(p.theta || 0, p.w || 0); });
  return y;
}

// ---------------------------------------------------------------------------
// Restricciones: cada una da C, gradiente (por partícula), J̇·v y tipo
// ---------------------------------------------------------------------------

/**
 * Lista de restricciones del modo. Cada restricción:
 * { clave, unilateral, evaluar(y) → { C, Cp, grad: [[i, gx, gy], ...], jdv } }
 * C ≥ 0 es lo permitido para las unilaterales; λ ≥ 0 es la reacción que empuja hacia C > 0.
 */
function restriccionesDelModo(S, modo) {
  const lista = [];
  for (const [clave, s] of Object.entries(modo.contactos)) {
    lista.push({ clave: `contacto:${clave}`, unilateral: true, ...restriccionApoyo(S, S.sup[s.sup], s.i, s.k ?? -1) });
  }
  for (const par of Object.keys(modo.pares)) {
    const [i, j] = par.split(':').map(Number);
    lista.push({ clave: `par:${par}`, unilateral: true, ...restriccionPar(S, i, j) });
  }
  for (const c of S.con) {
    if (c.tipo === 'varilla') lista.push({ clave: `varilla:${c.id}`, unilateral: false, ...restriccionDistancia(c, modo, true) });
    if (c.tipo === 'prensa') {
      lista.push({ clave: `prensa:${c.id}`, unilateral: false, ...restriccionPrensa(c) });
      // Cada émbolo va por su cilindro: no se mueve en horizontal
      lista.push({ clave: `prensa-guia:${c.id}:a`, unilateral: false, ...restriccionGuia(c.ia, c.xa0) });
      lista.push({ clave: `prensa-guia:${c.id}:b`, unilateral: false, ...restriccionGuia(c.ib, c.xb0) });
    }
    if (c.tipo === 'cuerda' && modo.cuerdas[c.id]?.tensa) lista.push({ clave: `cuerda:${c.id}`, unilateral: true, ...restriccionDistancia(c, modo, false) });
    if (c.tipo === 'polea' && modo.cuerdas[c.id]?.tensa) lista.push({ clave: `polea:${c.id}`, unilateral: true, ...restriccionPolea(c) });
  }
  return lista;
}

/** Posición de la partícula i en el marco de la superficie (relativa a su cuerpo, si va sobre uno). */
function puntoRel(sup, y, i) {
  return sup.j >= 0 ? [y[4 * i] - y[4 * sup.j], y[4 * i + 1] - y[4 * sup.j + 1]] : [y[4 * i], y[4 * i + 1]];
}
/** Velocidad de la partícula i respecto de la superficie. */
function velocidadRel(sup, y, i) {
  return sup.j >= 0 ? [y[4 * i + 2] - y[4 * sup.j + 2], y[4 * i + 3] - y[4 * sup.j + 3]] : [y[4 * i + 2], y[4 * i + 3]];
}

/**
 * Hueco entre la partícula i (de radio r) y una superficie: C ≥ 0 es el lado
 * libre. Si la superficie va sobre un cuerpo j, el gradiente también actúa
 * sobre j (la reacción lo empuja al revés) y todo se mide relativo a j.
 * @param {any} sup @param {number} i @param {number} [r=0]
 */
function restriccionSuperficie(sup, i, r = 0) {
  const j = sup.j;
  if (sup.tipo === 'segmento') {
    const { n } = sup.geo;
    return {
      evaluar(y) {
        const p = puntoRel(sup, y, i), v = velocidadRel(sup, y, i);
        const grad = [[i, n[0], n[1]]];
        if (j >= 0) grad.push([j, -n[0], -n[1]]);
        return { C: dot(n, sub(p, sup.a)) - r, Cp: dot(n, v), grad, jdv: 0 };
      },
    };
  }
  // Arco: exterior C = |d| − (R + r); interior C = (R − r) − |d|
  const sg = sup.cara === 'interior' ? -1 : 1, Rc = sup.r + sg * r;
  return {
    evaluar(y) {
      const q = puntoRel(sup, y, i), d = [q[0] - sup.c[0], q[1] - sup.c[1]], v = velocidadRel(sup, y, i);
      const D = norm(d), u = [d[0] / D, d[1] / D], uv = dot(u, v);
      const grad = [[i, sg * u[0], sg * u[1]]];
      if (j >= 0) grad.push([j, -sg * u[0], -sg * u[1]]);
      return { C: sg * (D - Rc), Cp: sg * uv, grad, jdv: sg * (dot(v, v) - uv * uv) / D };
    },
  };
}

/**
 * Contacto entre dos discos: C = |pi − pj| − (ri + rj) ≥ 0; λ ≥ 0 los separa.
 * @param {any} S @param {number} i @param {number} j
 */
function restriccionPar(S, i, j) {
  const R = radio(S, i) + radio(S, j);
  return {
    evaluar(y) {
      const d = [y[4 * i] - y[4 * j], y[4 * i + 1] - y[4 * j + 1]], D = norm(d), u = [d[0] / D, d[1] / D];
      const w = [y[4 * i + 2] - y[4 * j + 2], y[4 * i + 3] - y[4 * j + 3]], uw = dot(u, w);
      return { C: D - R, Cp: uw, grad: [[i, u[0], u[1]], [j, -u[0], -u[1]]], jdv: (dot(w, w) - uw * uw) / D };
    },
  };
}

/** Pivote actual de una cuerda (ancla o último clavo enganchado) y largo libre. */
function pivoteCuerda(c, modo) {
  const est = modo.cuerdas[c.id];
  if (est && est.clavos.length) {
    const k = est.clavos[est.clavos.length - 1];
    return { punto: c.clavos[k], L: est.Lrest };
  }
  return { punto: c.ancla, L: c.L };
}

/**
 * Distancia: varilla (bilateral, |d| = L) o cuerda tensa (C = L − |d| ≥ 0).
 * Con b = otra partícula; o con ancla/pivote fijo.
 */
function restriccionDistancia(c, modo, bilateral) {
  const ia = c.ia, ib = c.ib;
  return {
    evaluar(y) {
      const piv = ib < 0 ? pivoteCuerda(c, modo) : { punto: null, L: c.L };
      const pa = [y[4 * ia], y[4 * ia + 1]], va = [y[4 * ia + 2], y[4 * ia + 3]];
      const pb = ib < 0 ? piv.punto : [y[4 * ib], y[4 * ib + 1]];
      const vb = ib < 0 ? [0, 0] : [y[4 * ib + 2], y[4 * ib + 3]];
      const d = sub(pa, pb), D = norm(d), u = [d[0] / D, d[1] / D], w = sub(va, vb), uw = dot(u, w);
      const s = bilateral ? 1 : -1;     // varilla: C = D − L; cuerda: C = L − D
      const grad = [[ia, s * u[0], s * u[1]]];
      if (ib >= 0) grad.push([ib, -s * u[0], -s * u[1]]);
      return { C: s * (D - piv.L), Cp: s * uw, grad, jdv: s * (dot(w, w) - uw * uw) / D };
    },
  };
}

/**
 * Prensa hidráulica entre los émbolos a y b (verticales): el volumen de
 * líquido se conserva, (y_a − y_a0) + n·(y_b − y_b0) = 0. Bilateral y lineal.
 */
function restriccionPrensa(c) {
  const ia = c.ia, ib = c.ib, n = c.n;
  return {
    evaluar(y) {
      return { C: (y[4 * ia + 1] - c.ya0) + n * (y[4 * ib + 1] - c.yb0), Cp: y[4 * ia + 3] + n * y[4 * ib + 3], grad: [[ia, 0, 1], [ib, 0, n]], jdv: 0 };
    },
  };
}

/** Guía vertical: la partícula i se queda en x = x0. @param {number} i @param {number} x0 */
function restriccionGuia(i, x0) {
  return { evaluar: y => ({ C: y[4 * i] - x0, Cp: y[4 * i + 2], grad: [[i, 1, 0]], jdv: 0 }) };
}

/** Polea fija: C = L − |pa − P| − |pb − P| ≥ 0 (cuerda tensa sobre la polea). */
function restriccionPolea(c) {
  const ia = c.ia, ib = c.ib, P = c.polea;
  return {
    evaluar(y) {
      let C = c.L, Cp = 0, jdv = 0; const grad = [];
      for (const i of [ia, ib]) {
        const d = [y[4 * i] - P[0], y[4 * i + 1] - P[1]], v = [y[4 * i + 2], y[4 * i + 3]];
        const D = norm(d), u = [d[0] / D, d[1] / D], uv = dot(u, v);
        C -= D; Cp -= uv; jdv -= (dot(v, v) - uv * uv) / D;
        grad.push([i, -u[0], -u[1]]);
      }
      return { C, Cp, grad, jdv };
    },
  };
}

// ---------------------------------------------------------------------------
// Dinámica de un modo
// ---------------------------------------------------------------------------

/**
 * Resuelve A·x = b por eliminación gaussiana con pivoteo parcial (A pequeña).
 * Con tolRel > 0 devuelve null si algún pivote es menor que tolRel por la
 * mayor diagonal: el sistema es singular o casi (restricciones redundantes).
 * @param {number[][]} A @param {number[]} b @param {number} [tolRel=0]
 * @returns {number[] | null}
 */
function resolver(A, b, tolRel = 0) {
  const n = b.length, M = A.map((f, i) => [...f, b[i]]);
  let escala = 0;
  for (let i = 0; i < n; i++) escala = Math.max(escala, Math.abs(A[i][i]));
  const tolPiv = Math.max(1e-300, tolRel * escala);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    [M[k], M[p]] = [M[p], M[k]];
    const piv = M[k][k];
    if (Math.abs(piv) < tolPiv) { if (tolRel > 0) return null; continue; }
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / piv;
      for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = Math.abs(M[i][i]) < 1e-300 ? 0 : s / M[i][i];
  }
  return x;
}

/**
 * J M⁻¹ Jᵀ de una lista de filas {grad: [[i, gx, gy], ...]}. Cada fila toca a
 * una o dos partículas: se suma por partícula en vez de comparar todas las
 * filas con todas (con 40 apoyos en un montón, el doble bucle denso era la
 * mitad del cálculo).
 * @param {{grad: number[][]}[]} filas @param {number[]} im masas inversas (0 en los cuerpos cinemáticos)
 * @returns {number[][]}
 */
function matrizJMJ(filas, im) {
  const k = filas.length, A = Array.from({ length: k }, () => new Array(k).fill(0));
  /** @type {Map<number, number[][]>} */
  const porParticula = new Map();
  filas.forEach((e, r) => {
    for (const [i, gx, gy] of e.grad) {
      let l = porParticula.get(i);
      if (!l) { l = []; porParticula.set(i, l); }
      l.push([r, gx, gy]);
    }
  });
  for (const [i, l] of porParticula) for (const [r, gx, gy] of l) for (const [q, hx, hy] of l) A[r][q] += (gx * hx + gy * hy) * im[i];
  return A;
}

/** Copia de A con la diagonal regularizada. @param {number[][]} A */
const regularizada = A => A.map((f, r) => f.map((v, q) => (r === q ? v * (1 + REGULARIZACION) : v)));

/**
 * A·x = b con la diagonal regularizada (el CFM de ODE y MuJoCo) y un paso de
 * refinamiento iterativo. Con apoyos redundantes (una fila de discos de pared
 * a pared, un disco encajado en un hueco justo) J M⁻¹ Jᵀ es singular o casi y
 * la eliminación sola daría reacciones arbitrarias y enormes, y pasos de
 * integración diminutos. La regularización acota esos modos; el refinamiento
 * quita su sesgo en los bien condicionados (sin él, un disco apoyado quedaría
 * ε·g/β² ≈ 2·10⁻¹¹ m por debajo del suelo).
 * @param {number[][]} A @param {number[]} b @returns {number[]}
 */
function resolverRegularizado(A, b) {
  // Bien condicionado (todos los pivotes por encima de 10⁻⁶ de la diagonal):
  // basta la eliminación; es el caso habitual y cuesta la mitad
  const directo = resolver(A, b, 1e-6);
  if (directo) return directo;
  const n = b.length, R = regularizada(A);
  const x = resolver(R, b) ?? new Array(n).fill(0);
  const res = b.map((bi, r) => { let v = bi; for (let s = 0; s < n; s++) v -= A[r][s] * x[s]; return v; });
  const dx = resolver(R, res) ?? new Array(n).fill(0);
  return x.map((xi, r) => xi + dx[r]);
}

/**
 * Problema de complementariedad lineal pequeño: halla z con w = A·z + q,
 * z ≥ 0, w ≥ 0 y z·w = 0, por pivoteo principal (Murty): en cada vuelta se
 * cambia solo el primer índice que viola su condición. Con A definida
 * positiva (aquí siempre regularizada) termina en un número finito de vueltas.
 * Las filas libres (restricciones bilaterales) están siempre activas, con
 * w = 0 y z de cualquier signo. activoInicial acelera el caso habitual en que
 * el conjunto activo anterior sigue siendo el bueno (una sola resolución).
 * @param {number[][]} A @param {number[]} q
 * @param {boolean[]} [libres] @param {boolean[]} [activoInicial]
 * @returns {number[]}
 */
export function resolverLCP(A, q, libres = [], activoInicial) {
  const n = q.length, activo = activoInicial ? activoInicial.map((a, i) => a || !!libres[i]) : q.map((x, i) => x < 0 || !!libres[i]);
  const escala = Math.max(1e-300, ...q.map(Math.abs));
  let z = new Array(n).fill(0);
  for (let vuelta = 0; vuelta < 10 * n + 20; vuelta++) {
    const idx = [];
    for (let i = 0; i < n; i++) if (activo[i]) idx.push(i);
    const zA = idx.length ? resolver(idx.map(i => idx.map(j => A[i][j])), idx.map(i => -q[i])) ?? [] : [];
    z = new Array(n).fill(0);
    idx.forEach((i, k) => { z[i] = zA[k]; });
    let cambio = -1;
    for (let i = 0; i < n && cambio < 0; i++) {
      if (libres[i]) continue;
      if (activo[i]) { if (z[i] < -1e-12 * escala) cambio = i; }
      else {
        let w = q[i];
        for (let j = 0; j < n; j++) w += A[i][j] * z[j];
        if (w < -1e-12 * escala) cambio = i;
      }
    }
    if (cambio < 0) break;
    activo[cambio] = !activo[cambio];
  }
  return z.map((x, i) => (libres[i] ? x : Math.max(0, x)));
}

/** Fuerzas aplicadas (gravedad, arrastre, resortes, fuerzas constantes, fricción). */
function fuerzas(S, modo, y, lambdasPrevias) {
  const n = S.n, F = new Array(2 * (n + S.nr)).fill(0);
  for (let i = 0; i < n; i++) {
    const p = S.P[i], vx = y[4 * i + 2], vy = y[4 * i + 3];
    if (p.cinematica) continue;
    // Fuerza aplicada fuera del centro: par (R·b) × F sobre el giro
    const bF = brazoFuerza(S, y, i);
    if (bF) F[2 * (n + S.rot[i])] += bF[0] * p.F[1] - bF[1] * p.F[0];
    F[2 * i] += p.m * S.g[0] + (p.F ? p.F[0] : 0);
    F[2 * i + 1] += p.m * S.g[1] + (p.F ? p.F[1] : 0);
    if (S.b) { F[2 * i] -= S.b * vx; F[2 * i + 1] -= S.b * vy; }
    if (S.cAire) { const sp = Math.hypot(vx, vy); F[2 * i] -= S.cAire * sp * vx; F[2 * i + 1] -= S.cAire * sp * vy; }
  }
  for (const c of S.con) {
    if (c.tipo !== 'resorte') continue;
    const ia = c.ia, ib = c.ib;
    const pa = [y[4 * ia], y[4 * ia + 1]], pb = ib < 0 ? c.ancla : [y[4 * ib], y[4 * ib + 1]];
    const va = [y[4 * ia + 2], y[4 * ia + 3]], vb = ib < 0 ? [0, 0] : [y[4 * ib + 2], y[4 * ib + 3]];
    const d = sub(pa, pb), D = norm(d), u = [d[0] / D, d[1] / D];
    if (c.soloTira && D <= c.L0) continue;      // cuerda elástica floja: no empuja
    const f = -c.k * (D - c.L0) - (c.c || 0) * dot(u, sub(va, vb));
    F[2 * ia] += f * u[0]; F[2 * ia + 1] += f * u[1];
    if (ib >= 0) { F[2 * ib] -= f * u[0]; F[2 * ib + 1] -= f * u[1]; }
  }
  // Fricción cinética en contactos que deslizan: −μ·N·signo(v_t) a lo largo
  // del gradiente del deslizamiento (fuerza en el centro, par en el giro y
  // reacción en el cuerpo que lleva la superficie)
  if (lambdasPrevias) {
    for (const [clave, s] of Object.entries(modo.contactos)) {
      const sup = S.sup[s.sup], iP = s.i;
      if (!(sup.mu > 0) || s.pegado) continue;
      const N = Math.max(0, lambdasPrevias[`contacto:${clave}`] || 0);
      const { vt, grad } = deslizamiento(S, sup, y, iP, s.k ?? -1);
      // Sentido fijado al empezar el tramo (ver `simularMecanica`): así el
      // campo es suave dentro del tramo y el integrador no ve el salto de la
      // fricción en las etapas que pasan del cero; el cero es el evento vt0
      const sentido = s.sentido || Math.sign(vt);
      if (!sentido || (!s.sentido && Math.abs(vt) < 1e-15)) continue;
      const f = -sup.mu * N * sentido;
      for (const [i, gx, gy] of grad) { F[2 * i] += f * gx; F[2 * i + 1] += f * gy; }
    }
    // Entre discos apoyados que deslizan: −μ·N en el punto de contacto (los
    // dos centros y los dos giros, por el gradiente del deslizamiento)
    for (const [clave, est] of Object.entries(modo.pares)) {
      if (typeof est !== 'object' || est.pegado) continue;
      const [i, j] = clave.split(':').map(Number), N = Math.max(0, lambdasPrevias[`par:${clave}`] || 0);
      const { vt, grad } = deslizamientoPar(S, y, i, j);
      const sentido = est.sentido || Math.sign(vt);
      if (!sentido || (!est.sentido && Math.abs(vt) < 1e-15)) continue;
      const f = -S.muPares * N * sentido;
      for (const [q, gx, gy] of grad) { F[2 * q] += f * gx; F[2 * q + 1] += f * gy; }
    }
  }
  return F;
}

/** Tangente unitaria de una superficie en el punto de contacto. */
function tangente(sup, p) {
  if (sup.tipo === 'segmento') return sup.geo.t;
  const d = sub(p, sup.c), D = norm(d);
  return [-d[1] / D, d[0] / D];
}

/**
 * Aceleraciones y multiplicadores de un modo en el estado y. Con fricción
 * cinética, la normal depende de la fricción y viceversa: se itera (converge
 * en 2–3 pasadas porque la fricción no cambia la dirección normal).
 */
function dinamica(S, modo, y, restr) {
  const n = S.n, im = S.im;
  let lambdas = null, acc = null;
  /** @type {number[]} fuerza total (aplicadas + reacciones) sobre cada cuerpo */
  let fuerzaTotal = [];
  /** @type {null | {A: number[][], b: number[], claves: string[], unilateral: boolean[]}} */
  let sistema = null;
  const iteraciones = Object.values(modo.contactos).some(s => S.sup[s.sup].mu > 0 && !s.pegado) || Object.values(modo.pares).some(p => typeof p === 'object' && !p.pegado) ? 4 : 1;
  for (let it = 0; it < iteraciones; it++) {
    const F = fuerzas(S, modo, y, lambdas);
    const ev = restr.map(r => r.evaluar(y));
    // Restricciones adicionales de adherencia (fricción estática)
    const pegadas = [];
    for (const [clave, s] of Object.entries(modo.contactos)) {
      if (!s.pegado) continue;
      // Sin deslizar en el punto de contacto: en un disco que gira es la
      // rodadura (el centro avanza y el disco gira a la vez)
      const { vt, grad, jdv } = deslizamiento(S, S.sup[s.sup], y, s.i, s.k ?? -1);
      pegadas.push({ clave: `pegado:${clave}`, evaluar: () => ({ C: 0, Cp: vt, grad, jdv }) });
      ev.push(pegadas[pegadas.length - 1].evaluar());
    }
    // Dos discos que ruedan uno sobre otro sin deslizar
    for (const [clave, est] of Object.entries(modo.pares)) {
      if (typeof est !== 'object' || !est.pegado) continue;
      const [i, j] = clave.split(':').map(Number), { vt, grad, jdv } = deslizamientoPar(S, y, i, j);
      pegadas.push({ clave: `pegadoPar:${clave}`, evaluar: () => ({ C: 0, Cp: vt, grad, jdv }) });
      ev.push(pegadas[pegadas.length - 1].evaluar());
    }
    const k = ev.length;
    const a0 = new Array(2 * (n + S.nr));
    for (let i = 0; i < n; i++) {
      // Un cinemático lleva la aceleración de su perfil (cero si no tiene)
      if (S.P[i].cinematica) { a0[2 * i] = S.aImp[i][0]; a0[2 * i + 1] = S.aImp[i][1]; continue; }
      a0[2 * i] = F[2 * i] * im[i]; a0[2 * i + 1] = F[2 * i + 1] * im[i];
    }
    for (let q = n; q < n + S.nr; q++) { a0[2 * q] = F[2 * q] * im[q]; a0[2 * q + 1] = 0; }
    let lam = [];
    if (k) {
      // (J M⁻¹ Jᵀ) λ = −J a0 − J̇v − 2α Ċ − β² C
      const alfa = ALFA_B, beta = BETA_B;
      const A = matrizJMJ(ev, im), b = new Array(k).fill(0);
      for (let r = 0; r < k; r++) {
        let Ja0 = 0;
        for (const [i, gx, gy] of ev[r].grad) Ja0 += gx * a0[2 * i] + gy * a0[2 * i + 1];
        b[r] = -Ja0 - ev[r].jdv - 2 * alfa * ev[r].Cp - beta * beta * ev[r].C;
      }
      lam = resolverRegularizado(A, b);
      sistema = { A, b, claves: [...restr.map(r => r.clave), ...pegadas.map(r => r.clave)], unilateral: [...restr.map(r => !!r.unilateral), ...pegadas.map(() => false)] };
    }
    acc = a0.slice();
    fuerzaTotal = F.slice();
    for (let r = 0; r < k; r++) for (const [i, gx, gy] of ev[r].grad) {
      acc[2 * i] += lam[r] * gx * im[i]; acc[2 * i + 1] += lam[r] * gy * im[i];
      fuerzaTotal[2 * i] += lam[r] * gx; fuerzaTotal[2 * i + 1] += lam[r] * gy;
    }
    lambdas = {};
    restr.forEach((r, j) => { lambdas[r.clave] = lam[j]; });
    pegadas.forEach((r, j) => { lambdas[r.clave] = lam[restr.length + j]; });
  }
  return { acc, lambdas, sistema, fuerzaTotal };
}

// ---------------------------------------------------------------------------
// Eventos del modo
// ---------------------------------------------------------------------------

/**
 * Eventos del modo. y0 es el estado al empezar el tramo: si dos cuerpos ya se
 * solapan un poco (la estabilización deja restos de 10⁻⁶ m), el choque se mide
 * desde ese solape; si no, un hueco que ya es negativo nunca cambiaría de signo
 * y los cuerpos se atravesarían.
 * din(y) es la dinámica del modo en y (con caché: el integrador evalúa f y
 * todos los eventos sobre el mismo arreglo al final de cada paso).
 * @param {any} S @param {any} modo @param {any[]} restr @param {number[]} y0
 * @param {(y: number[]) => {acc: number[], lambdas: Record<string, number>}} [din]
 */
function eventosDelModo(S, modo, restr, y0, din = yy => dinamica(S, modo, yy, restr)) {
  /** @type {import('../nucleo/integradores.js').DefinicionEvento[]} */
  const ev = [];
  const n = S.n;
  // Impactos con las superficies en las que la partícula no se apoya (una que
  // rueda por el suelo puede chocar con la pared)
  for (let i = 0; i < n; i++) {
    S.sup.forEach((sup, js) => {
      if (ajenos(S, i, sup)) return;
      for (const kv of apoyosDe(S, i)) {
        const clave = claveApoyo(i, kv, js);
        if (modo.contactos[clave]) continue;
        const r = restriccionApoyo(S, sup, i, kv);
        const C0 = r.evaluar(y0).C, dentro0 = margenSuperficie(sup, puntoApoyo(S, sup, y0, i, kv)) >= 0;
        // Un punto detrás de la cara de un bloque (al otro lado de su recta)
        // no puede chocar con ella sin pasar antes al lado libre: se espera a
        // ese paso (C → 0 creciendo) y entonces se rehacen los eventos. Con
        // max(C, −margen), el punto de un bloque apoyado sobre otro, justo en
        // la recta de la cara de al lado, cruzaba el borde con el ruido de cada
        // paso y el evento descartado se repetía sin fin
        if (sup.gira && C0 < -TOL_PENETRACION) {
          ev.push({ nombre: `frente:${clave}`, direccion: 1, terminal: true, g: (t, y) => r.evaluar(y).C });
          continue;
        }
        // Un hueco inicial nulo o negativo no cambiaría de signo: se mide desde él
        const off = C0 <= TOL_HUECO && C0 > -tolContacto(Math.max(radio(S, i), 1e-3)) * 100 && dentro0 ? Math.min(C0, 0) - TOL_HUECO : 0;
        ev.push({
          nombre: `impacto:${clave}`, direccion: -1, terminal: true,
          // Solo cuenta dentro de la extensión de la superficie. max(C, −margen)
          // es continua (no salta al cruzar el borde), así que el cambio de signo
          // entre dos pasos es fiable; un cruce por el borde con C < 0 (desde
          // detrás) se descarta al tratarlo.
          g: (t, y) => Math.max(r.evaluar(y).C - off, -margenSuperficie(sup, puntoApoyo(S, sup, y, i, kv))),
        });
      }
    });
  }
  // Contactos activos: despegue (λ → 0), fin del segmento, fricción
  for (const [clave, s] of Object.entries(modo.contactos)) {
    const iP = s.i, sup = S.sup[s.sup];
    ev.push({
      nombre: `despegue:${clave}`, direccion: -1, terminal: true,
      g: (t, y) => (din(y).lambdas[`contacto:${clave}`] ?? 0),
    });
    if (sup.tipo === 'segmento' || sup.a0 != null) {
      ev.push({ nombre: `fin:${clave}`, direccion: -1, terminal: true, g: (t, y) => margenSuperficie(sup, puntoApoyo(S, sup, y, iP, s.k ?? -1)) });
    }
    if (sup.mu > 0) {
      if (s.pegado) {
        // Deja de estar pegado cuando la fricción necesaria supera μs·N
        ev.push({
          nombre: `desliza:${clave}`, direccion: -1, terminal: true,
          g: (t, y) => { const L = din(y).lambdas; return (sup.muS ?? sup.mu) * Math.max(0, L[`contacto:${clave}`]) - Math.abs(L[`pegado:${clave}`]); },
        });
      } else {
        ev.push({
          nombre: `vt0:${clave}`, direccion: 0, terminal: true,
          g: (t, y) => deslizamiento(S, sup, y, iP, s.k ?? -1).vt,
        });
      }
    }
  }
  // Cuerdas elásticas: pasan por su largo natural (la fuerza tiene un quiebre)
  for (const c of S.con) {
    if (c.tipo !== 'resorte' || !c.soloTira) continue;
    ev.push({ nombre: `elastica:${c.id}`, direccion: 0, terminal: true, g: (t, y) => largoResorte(c, y) - c.L0 });
  }
  // Cuerdas: se tensa (C → 0 desde C > 0), se afloja (λ → 0), toca un clavo
  for (const c of S.con) {
    if (c.tipo !== 'cuerda' && c.tipo !== 'polea') continue;
    const est = modo.cuerdas[c.id];
    const r = c.tipo === 'polea' ? restriccionPolea(c) : restriccionDistancia(c, modo, false);
    if (est.tensa) {
      ev.push({ nombre: `floja:${c.id}`, direccion: -1, terminal: true, g: (t, y) => din(y).lambdas[`${c.tipo}:${c.id}`] ?? 0 });
    } else {
      ev.push({ nombre: `tensa:${c.id}`, direccion: -1, terminal: true, g: (t, y) => r.evaluar(y).C });
    }
    // Enganche y desenganche solo con la cuerda tensa: floja no tiene geometría que enrollar
    if (c.tipo === 'cuerda' && c.ib < 0 && c.clavos?.length && est.tensa) {
      // Enganche: el clavo cruza la recta pivote → partícula (dentro del largo)
      const piv = () => pivoteCuerda(c, modo);
      est.clavos.length && ev.push({
        // Con el sentido elegido al enganchar, g crece mientras la cuerda
        // envuelve el clavo y baja a cero al realinearse: solo el paso de + a −
        nombre: `desengancha:${c.id}`, direccion: -1, terminal: true,
        g: (t, y) => {
          // Se suelta del último clavo cuando la cuerda vuelve a alinearse con el tramo anterior
          const k = est.clavos[est.clavos.length - 1], prev = est.clavos.length > 1 ? c.clavos[est.clavos[est.clavos.length - 2]] : c.ancla;
          const nail = c.clavos[k], p = [y[4 * c.ia], y[4 * c.ia + 1]];
          const d1 = sub(nail, prev), d2 = sub(p, nail);
          return (d1[0] * d2[1] - d1[1] * d2[0]) * est.sentido[est.sentido.length - 1];
        },
      });
      c.clavos.forEach((nail, k) => {
        if (est.clavos.includes(k)) return;
        ev.push({
          nombre: `engancha:${c.id}:${k}`, direccion: 0, terminal: true,
          g: (t, y) => {
            const { punto, L } = piv(), p = [y[4 * c.ia], y[4 * c.ia + 1]];
            const dn = sub(nail, punto);
            if (norm(dn) >= L) return 1;            // el clavo queda fuera del alcance
            // Cruce de la recta pivote → partícula por el clavo. Es continua por
            // los dos lados: un valor fijo del otro lado del pivote cambiaba de
            // signo en la frontera si la partícula empezaba a la izquierda del
            // clavo (enganche falso en t = 0). El cruce del lado opuesto al
            // clavo se descarta al atender el evento.
            const dp = sub(p, punto);
            return dn[0] * dp[1] - dn[1] * dp[0];
          },
        });
      });
    }
  }
  // Choques entre partículas con radio; los pares en contacto se separan cuando λ → 0
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (!parPosible(S, i, j)) continue;
    const R = radio(S, i) + radio(S, j);
    const estPar = modo.pares[`${i}:${j}`];
    if (estPar) {
      ev.push({ nombre: `separa:${i}:${j}`, direccion: -1, terminal: true, g: (t, y) => din(y).lambdas[`par:${i}:${j}`] ?? 0 });
      if (typeof estPar === 'object') {
        // Fricción entre los dos: deja de deslizar (v_t → 0) o la adherencia ya no alcanza
        if (estPar.pegado) ev.push({ nombre: `resbala:${i}:${j}`, direccion: -1, terminal: true, g: (t, y) => { const L = din(y).lambdas; return S.muPares * Math.max(0, L[`par:${i}:${j}`]) - Math.abs(L[`pegadoPar:${i}:${j}`]); } });
        else ev.push({ nombre: `rueda:${i}:${j}`, direccion: 0, terminal: true, g: (t, y) => deslizamientoPar(S, y, i, j).vt });
      }
    } else {
      const h0 = Math.hypot(y0[4 * i] - y0[4 * j], y0[4 * i + 1] - y0[4 * j + 1]) - R;
      const off = h0 <= TOL_HUECO && h0 > -0.5 * R ? Math.min(h0, 0) - TOL_HUECO : 0;
      ev.push({ nombre: `choque:${i}:${j}`, direccion: -1, terminal: true, g: (t, y) => Math.hypot(y[4 * i] - y[4 * j], y[4 * i + 1] - y[4 * j + 1]) - R - off });
    }
  }
  return ev;
}

/** ¿El punto proyecta dentro de la superficie? (para segmentos: 0 ≤ s ≤ L) */
function dentroDeSuperficie(sup, p) { return margenSuperficie(sup, p) >= 0; }

/**
 * Margen hasta el borde: positivo dentro, negativo fuera. La extensión es
 * cerrada, con una holgura mínima: un punto justo en el extremo (el pie de
 * una pared que arranca en el suelo) cuenta como dentro, y un margen que
 * empieza en el borde no es exactamente 0 (el integrador no contaría un cero
 * inicial como cruce y el choque o la salida por el borde se perderían).
 */
function margenSuperficie(sup, p) {
  if (sup.tipo === 'segmento') {
    const s = dot(sub(p, sup.a), sup.geo.t);
    return Math.min(s, sup.geo.L - s) + 1e-12 * Math.max(1, sup.geo.L);
  }
  if (sup.a0 == null) return 1;   // arco completo
  const ang = Math.atan2(p[1] - sup.c[1], p[0] - sup.c[0]);
  const a = normalizarAngulo(ang - sup.a0), total = normalizarAngulo(sup.a1 - sup.a0) || 2 * Math.PI;
  return Math.min(a, total - a) * sup.r + 1e-12 * Math.max(1, sup.r);
}
function normalizarAngulo(a) { const d = 2 * Math.PI; return ((a % d) + d) % d; }

// ---------------------------------------------------------------------------
// Transiciones
// ---------------------------------------------------------------------------

function copiarModo(m) {
  return {
    contactos: Object.fromEntries(Object.entries(m.contactos).map(([k, v]) => [k, { ...v }])),
    pares: Object.fromEntries(Object.entries(m.pares).map(([k, v]) => [k, typeof v === 'object' ? { ...v } : v])),
    cuerdas: Object.fromEntries(Object.entries(m.cuerdas).map(([k, v]) => [k, { ...v, clavos: [...v.clavos], sentido: [...v.sentido] }])),
  };
}

/**
 * Energía mecánica del estado y: cinética, gravitatoria, elástica y la de las
 * fuerzas constantes (la misma que `energiaMecanica`, sin pasar por la escena).
 * @param {any} S @param {number[]} y
 */
function energiaEstado(S, y) {
  let E = 0;
  for (let i = 0; i < S.n; i++) {
    const p = S.P[i], vx = y[4 * i + 2], vy = y[4 * i + 3], x = y[4 * i], yy = y[4 * i + 1];
    if (p.cinematica) continue;
    E += 0.5 * p.m * (vx * vx + vy * vy) - p.m * (S.g[0] * x + S.g[1] * yy);
    if (p.F) E -= p.F[0] * x + p.F[1] * yy;
    // F fija en el mundo aplicada en un punto que gira: U_F = −F·(r + R·b)
    const bF = brazoFuerza(S, y, i);
    if (bF) E -= p.F[0] * bF[0] + p.F[1] * bF[1];
  }
  E += energiaGiro(S, y);
  for (const c of S.con) {
    if (c.tipo !== 'resorte') continue;
    const D = largoResorte(c, y);
    if (c.soloTira && D <= c.L0) continue;
    E += 0.5 * c.k * (D - c.L0) ** 2;
  }
  return E;
}

/**
 * Potencia que pierde la energía mecánica: −dE/dt con las aceleraciones acc.
 * dE/dt = Σ vᵢ·(mᵢaᵢ − mᵢg − Fᵢ) + Σ k(D − L0)·Ḋ deja solo el trabajo de las
 * fuerzas no conservativas (fricción, arrastre, amortiguadores) y el de las
 * restricciones (cero si se cumplen exactamente; la estabilización hace un
 * poco). Integrada como una componente más del estado, E + disipada se
 * conserva a la tolerancia del integrador.
 * @param {any} S @param {number[]} y @param {number[]} acc
 */
function potenciaDisipada(S, y, acc) {
  let dE = 0;
  for (let i = 0; i < S.n; i++) {
    const p = S.P[i], vx = y[4 * i + 2], vy = y[4 * i + 3];
    if (p.cinematica) continue;
    dE += vx * (p.m * acc[2 * i] - p.m * S.g[0] - (p.F ? p.F[0] : 0)) + vy * (p.m * acc[2 * i + 1] - p.m * S.g[1] - (p.F ? p.F[1] : 0));
  }
  // Giro: d(½Iω²)/dt = ω·I·α (ninguna fuerza conservativa hace par)
  for (let q = 0; q < S.nr; q++) dE += y[S.base + 2 * q + 1] * S.I[q] * acc[2 * (S.n + q)];
  // y dU_F/dt de una fuerza aplicada fuera del centro: −ω·τ_F
  for (let i = 0; i < S.n; i++) {
    const bF = brazoFuerza(S, y, i);
    if (bF) dE -= y[S.base + 2 * S.rot[i] + 1] * (bF[0] * S.P[i].F[1] - bF[1] * S.P[i].F[0]);
  }
  for (const c of S.con) {
    if (c.tipo !== 'resorte') continue;
    const ia = c.ia, ib = c.ib;
    const pa = [y[4 * ia], y[4 * ia + 1]], pb = ib < 0 ? c.ancla : [y[4 * ib], y[4 * ib + 1]];
    const va = [y[4 * ia + 2], y[4 * ia + 3]], vb = ib < 0 ? [0, 0] : [y[4 * ib + 2], y[4 * ib + 3]];
    const d = sub(pa, pb), D = norm(d);
    if (c.soloTira && D <= c.L0) continue;
    dE += c.k * (D - c.L0) * dot(d, sub(va, vb)) / D;
  }
  return -dE;
}

/**
 * Potencia que entregan los cuerpos cinemáticos al resto: −F·v de cada uno,
 * con F la fuerza que el sistema hace sobre él (reacciones y fricción).
 * @param {any} S @param {number[]} y @param {number[]} fuerzaTotal
 */
function potenciaConductores(S, y, fuerzaTotal) {
  let P = 0;
  for (let j = 0; j < S.n; j++) if (S.P[j].cinematica) P -= fuerzaTotal[2 * j] * y[4 * j + 2] + fuerzaTotal[2 * j + 1] * y[4 * j + 3];
  return P;
}

function energiaCinetica(S, y) {
  let K = 0;
  for (let i = 0; i < S.n; i++) if (!S.P[i].cinematica) K += 0.5 * S.P[i].m * (y[4 * i + 2] ** 2 + y[4 * i + 3] ** 2);
  return K + energiaGiro(S, y);
}
/** Energía cinética de rotación ½Iω² de los discos que giran. @param {any} S @param {number[]} y */
function energiaGiro(S, y) {
  let K = 0;
  for (let q = 0; q < S.nr; q++) K += 0.5 * S.I[q] * y[S.base + 2 * q + 1] ** 2;
  return K;
}

/** Normal unitaria hacia el lado libre de una superficie en p. */
function normalLibre(sup, p) {
  if (sup.tipo === 'segmento') return sup.geo.n;
  const d = sub(p, sup.c), D = norm(d), sg = sup.cara === 'interior' ? -1 : 1;
  return [sg * d[0] / D, sg * d[1] / D];
}

// ---------------------------------------------------------------------------
// Simulación
// ---------------------------------------------------------------------------

/**
 * Simula la escena. Devuelve tramos (soluciones del integrador por modo) y
 * eventos con su energía perdida.
 * @param {EscenaMecanica} escena
 */
export function simularMecanica(escena) {
  const S = preparar(escena);
  const hayCinematicos = S.P.some(p => p.cinematica);
  const DUR = escena.duracion ?? 5, UMBRAL = escena.umbral ?? 1e-3, RTOL = escena.rtol ?? 1e-10;
  let y = estadoInicial(S), t = 0;
  /** @type {{contactos: Record<string, {i: number, sup: number, pegado: boolean, sentido?: number, k?: number}>, pares: Record<string, any>, cuerdas: Record<string, any>}} */
  let modo = { contactos: {}, pares: {}, cuerdas: {} };
  for (const c of S.con) {
    if (c.tipo === 'cuerda' || c.tipo === 'polea') {
      const r = c.tipo === 'polea' ? restriccionPolea(c) : restriccionDistancia(c, { contactos: {}, pares: {}, cuerdas: { [c.id]: { clavos: [] } } }, false);
      modo.cuerdas[c.id] = { tensa: Math.abs(r.evaluar(y).C) < 1e-9, clavos: [], sentido: [], Lrest: c.L };
    }
  }
  // Contactos iniciales: partícula apoyada sobre una superficie (C ≈ 0 y sin velocidad hacia fuera)
  S.sup.forEach((sup, js) => {
    for (let i = 0; i < S.n; i++) {
      if (ajenos(S, i, sup)) continue;
      for (const kv of apoyosDe(S, i)) {
        const { C, Cp } = restriccionApoyo(S, sup, i, kv).evaluar(y);
        if (Math.abs(C) < 1e-9 && Math.abs(Cp) < 1e-9 && dentroDeSuperficie(sup, puntoApoyo(S, sup, y, i, kv))) modo.contactos[claveApoyo(i, kv, js)] = { i, sup: js, pegado: false, k: kv };
      }
    }
  });
  // Discos que empiezan tocándose y en reposo relativo (una pila, una fila)
  for (let i = 0; i < S.n; i++) for (let j = i + 1; j < S.n; j++) {
    if (!parPosible(S, i, j)) continue;
    const { C, Cp } = restriccionPar(S, i, j).evaluar(y);
    if (Math.abs(C) < 1e-9 && Math.abs(Cp) < 1e-9) modo.pares[`${i}:${j}`] = nuevoPar(S, i, j);
  }

  const tramos = [], eventos = [];
  const LIMITE = escena.maxEventos ?? 2000;
  let k = 0;
  // Un contacto recién creado puede tener la normal negativa (la partícula
  // se despega enseguida): se comprueba antes de integrar.
  // El conjunto activo se elige como un problema de complementariedad (LCP)
  // sobre el sistema de las restricciones activas: cada unilateral que sigue
  // activa empuja (λ ≥ 0) y cada una que se suelta no vuelve a penetrar
  // (aceleración estabilizada w ≥ 0). Soltar todas las de λ < 0 a la vez, como
  // antes, podía soltar de más: un par recién apoyado sin carga se soltaba
  // aunque su aceleración lo volviera a juntar, y el montón traqueteaba con
  // choques cada pocos microsegundos. Las bilaterales (varillas, adherencia)
  // son filas libres. Un apoyo degenerado (λ = 0 y w = 0) se conserva; un par
  // de discos sin carga se suelta, como antes, para que el ruido de λ ≈ 0 no
  // dispare eventos de separación.
  const masas = S.im;
  const revisarDespegues = () => {
    for (let ronda = 0; ronda < 4; ronda++) {
      const restr = restriccionesDelModo(S, modo);
      const { sistema } = dinamica(S, modo, y, restr);
      if (!sistema) return;
      const { A, b, claves, unilateral } = sistema, Ar = regularizada(A), q = b.map(x => -x);
      const z = resolverLCP(Ar, q, unilateral.map(u => !u), claves.map(() => true));
      let cambio = false;
      claves.forEach((claveR, r) => {
        if (!unilateral[r]) return;
        let w = q[r];
        for (let c = 0; c < z.length; c++) w += Ar[r][c] * z[c];
        const [tipo, ...resto] = claveR.split(':'), clave = resto.join(':');
        if (tipo === 'par') {
          if (!(z[r] > LAMBDA_PAR_MIN) && w > -UMBRAL_W) { delete modo.pares[clave]; cambio = true; }
        } else if (z[r] <= 0 && w > UMBRAL_W) {
          if (tipo === 'contacto') delete modo.contactos[clave];
          else modo.cuerdas[clave].tensa = false;
          cambio = true;
        }
      });
      if (!cambio) return;
    }
  };
  // Velocidades iniciales incompatibles con una varilla o una prensa (dar
  // velocidad a un solo émbolo): se proyectan como un impulso a través de la
  // restricción, conservando el momento. Sin esto, la estabilización las
  // corregía después como una oscilación ficticia.
  {
    const filas = restriccionesDelModo(S, modo).filter(r => !r.unilateral).map(r => r.evaluar(y)).filter(e => Math.abs(e.Cp) > 1e-12);
    if (filas.length) {
      const P = resolverRegularizado(matrizJMJ(filas, S.im), filas.map(e => -e.Cp));
      filas.forEach((e, r) => { for (const [i, gx, gy] of e.grad) sumarVelocidad(S, y, i, P[r] * gx * S.im[i], P[r] * gy * S.im[i]); });
    }
  }
  revisarDespegues();
  // Fricción estática al arrancar: los apoyos en reposo se pegan todos a la
  // vez y se suelta, de uno en uno, el que más se pasa de μs·N. Uno a uno, el
  // primer vértice de un bloque cargaba con toda la fricción (el otro aún no
  // estaba pegado), no le alcanzaba y el bloque arrancaba deslizando.
  /** Pega a la vez los apoyos dados y suelta, de uno en uno, el que más se pasa de μs·N. @param {[string, any][]} quietos */
  const pegarQuietos = quietos => {
    for (const [, s] of quietos) s.pegado = true;
    for (let vuelta = 0; vuelta < quietos.length; vuelta++) {
      const L = dinamica(S, modo, y, restriccionesDelModo(S, modo)).lambdas;
      let peor = null, exceso = 1e-12;
      for (const [clave, s] of quietos) {
        if (!s.pegado) continue;
        // Un par de discos (s.par) usa sus propias claves y la fricción entre cuerpos
        const [kp, kn, mu] = s.par ? [`pegadoPar:${clave}`, `par:${clave}`, S.muPares] : [`pegado:${clave}`, `contacto:${clave}`, S.sup[s.sup].muS ?? S.sup[s.sup].mu];
        const ex = Math.abs(L[kp]) - mu * Math.max(0, L[kn]);
        if (ex > exceso) { exceso = ex; peor = s; }
      }
      if (!peor) break;
      peor.pegado = false;
    }
  };
  pegarQuietos([
    ...Object.entries(modo.contactos).filter(([, s]) => S.sup[s.sup].mu > 0 && Math.abs(deslizamiento(S, S.sup[s.sup], y, s.i, s.k ?? -1).vt) <= 1e-12),
    ...Object.entries(modo.pares).filter(([c, p]) => { const [a, b] = c.split(':').map(Number); return typeof p === 'object' && Math.abs(deslizamientoPar(S, y, a, b).vt) <= 1e-12; }),
  ]);

  // Paso máximo según la rapidez: en un paso, nada recorre más de un cuarto de
  // la escala menor de la escena (radio, medio segmento, medio radio de arco).
  // Así un choque no puede empezar y terminar dentro de un mismo paso.
  let escalaPaso = Infinity;
  for (let i = 0; i < S.n; i++) if (radio(S, i) > 0) escalaPaso = Math.min(escalaPaso, radio(S, i));
  // Un bloque: medio lado menor; sus vértices van a v + ω·(media diagonal)
  const semidiag = S.P.map((p, i) => (S.vert[i] ? Math.hypot(p.ancho, p.alto) / 2 : 0));
  S.P.forEach((p, i) => { if (S.vert[i]) escalaPaso = Math.min(escalaPaso, Math.min(p.ancho, p.alto) / 2); });
  for (const sup of S.sup) escalaPaso = Math.min(escalaPaso, sup.tipo === 'segmento' ? sup.geo.L / 2 : sup.r / 2);
  const hMaxDe = Number.isFinite(escalaPaso) ? (/** @type {number} */ tt, /** @type {number[]} */ yy) => {
    let v = 0;
    for (let i = 0; i < S.n; i++) v = Math.max(v, Math.hypot(yy[4 * i + 2], yy[4 * i + 3]) + (semidiag[i] ? semidiag[i] * Math.abs(yy[S.base + 2 * S.rot[i] + 1]) : 0));
    return v > 0 ? 0.25 * escalaPaso / v : Infinity;
  } : undefined;

  // Trabajo de los cuerpos cinemáticos en los impulsos de un instante: el
  // impulso sobre el conductor es −P·grad y él lo entrega a su velocidad
  let trabajoImpulsivo = 0;
  const impulsoFila = (grad, P) => {
    for (const [i, gx, gy] of grad) {
      if (S.im[i] === 0) trabajoImpulsivo -= P * (gx * y[4 * i + 2] + gy * y[4 * i + 3]);
      else sumarVelocidad(S, y, i, P * gx * S.im[i], P * gy * S.im[i]);
    }
  };
  /**
   * Impacto del apoyo kv de la partícula i con la superficie js; devuelve la
   * descripción o '' si no hay choque. El impulso va a lo largo del
   * gradiente del hueco, repartido con las masas (y la inercia, en el vértice
   * de un bloque): J = −(1 + e)·Ċ / (∇C·M⁻¹·∇C). Si la superficie es fija o va
   * sobre un cuerpo cinemático, solo cambia la partícula.
   */
  const impacto = (i, js, zeno, kv = -1) => {
    const sup = S.sup[js];
    if (S.im[i] === 0) return '';
    const { Cp: vn, grad } = restriccionApoyo(S, sup, i, kv).evaluar(y);
    const e = sup.e ?? 1, vn2 = -e * vn;
    if (vn >= 0) return '';
    let den = 0;
    for (const [q, gx, gy] of grad) den += (gx * gx + gy * gy) * S.im[q];
    const contacto = vn2 < UMBRAL || zeno;
    const J = -(1 + (contacto ? 0 : e)) * vn / den;
    impulsoFila(grad, J);
    if (contacto) {
      modo.contactos[claveApoyo(i, kv, js)] = { i, sup: js, pegado: false, k: kv };
      return `Choque y contacto con ${sup.id}`;
    }
    return `Choque con ${sup.id}`;
  };
  /** Choque entre las partículas i y j; un rebote lento las deja en contacto. */
  const choque = (i, j, zeno) => {
    const e = escena.eParticulas ?? 1, wi = S.im[i], wj = S.im[j];
    if (wi + wj === 0) return '';   // dos cuerpos cinemáticos no se empujan
    const d = [y[4 * i] - y[4 * j], y[4 * i + 1] - y[4 * j + 1]], D = norm(d), n = [d[0] / D, d[1] / D];
    const vrel = (y[4 * i + 2] - y[4 * j + 2]) * n[0] + (y[4 * i + 3] - y[4 * j + 3]) * n[1];
    if (vrel >= 0) return '';
    const contacto = e * -vrel < UMBRAL || zeno;
    const J = -(1 + (contacto ? 0 : e)) * vrel / (wi + wj);
    impulsoFila([[i, n[0], n[1]], [j, -n[0], -n[1]]], J);
    if (contacto) { modo.pares[`${i}:${j}`] = nuevoPar(S, i, j); return `Choque y contacto entre ${S.P[i].id} y ${S.P[j].id}`; }
    return `Choque entre ${S.P[i].id} y ${S.P[j].id}`;
  };
  /** Registra un cambio instantáneo con la energía cinética que disipa. */
  let perdidaAnotada = 0;
  const anotar = (clave, aplicar) => {
    const K0 = energiaCinetica(S, y), W0 = trabajoImpulsivo, descripcion = aplicar(), perdida = K0 - energiaCinetica(S, y) + trabajoImpulsivo - W0;
    if (descripcion) {
      // El mismo choque repetido en el instante (los impulsos secuenciales
      // entre dos vértices de un bloque que cae de plano) es un solo evento
      let previo = null;
      for (let q = eventos.length - 1; q >= 0 && eventos[q].t === t; q--) if (eventos[q].clave === clave) { previo = eventos[q]; break; }
      if (previo) { previo.perdida += perdida > 0 ? perdida : 0; previo.y = y.slice(); }
      else eventos.push({ t, nombre: descripcion, clave, perdida: perdida > 0 ? perdida : 0, y: y.slice() });
      perdidaAnotada += perdida > 0 ? perdida : 0;
    }
    return descripcion;
  };
  // Choques en el mismo instante (una bola que toca a dos, un disco que llega
  // a la pared mientras choca con otro): impulsos secuenciales hasta que ningún
  // par en contacto se acerca. Sin esto, un hueco ya nulo o apenas negativo no
  // cambia de signo y el choque se perdería (los cuerpos se atravesarían).
  // excluir: pares («i:j») o apoyos («i:js») que acaban de separarse en este
  // instante por un evento; no se vuelven a juntar en el mismo instante.
  // Un hueco pequeño se da por cerrado (contacto persistente) solo si el
  // movimiento relativo entero es lento, no solo su componente normal: en una
  // geometría casi tangente (un disco que cae en un hueco justo de su
  // diámetro) la velocidad normal es diminuta aunque el disco caiga deprisa,
  // y ese «contacto» lo dejaba flotando milímetros por encima de su sitio.
  const lentos = (i, j) => Math.hypot(y[4 * i + 2] - (j < 0 ? 0 : y[4 * j + 2]), y[4 * i + 3] - (j < 0 ? 0 : y[4 * j + 3])) <= UMBRAL;
  const resolverSimultaneos = (zeno, excluir = new Set()) => {
    for (let vuelta = 0; vuelta < 4 * S.n + 10; vuelta++) {
      let hubo = false;
      for (let i = 0; i < S.n; i++) for (let j = i + 1; j < S.n; j++) {
        if (!parPosible(S, i, j)) continue;
        const R = radio(S, i) + radio(S, j);
        const clave = `${i}:${j}`, { C, Cp } = restriccionPar(S, i, j).evaluar(y);
        if (modo.pares[clave]) {
          // Apoyados: un impulso que llega (otro choque) se transmite como choque;
          // si un impulso los separa, dejan de estar apoyados (si vuelven a
          // juntarse, es un choque). Un resto lento de acercamiento lo quita la
          // proyección inelástica del final, de una vez y sin evento.
          if (Cp < -UMBRAL) {
            const antes = modo.pares[clave];
            delete modo.pares[clave];
            if (anotar(`choque:${clave}`, () => choque(i, j, zeno))) hubo = true;
            // Un choque que los deja apoyados no les quita la adherencia
            if (antes && typeof antes === 'object' && antes.pegado && typeof modo.pares[clave] === 'object') modo.pares[clave].pegado = true;
          }
          else if (Cp > UMBRAL) delete modo.pares[clave];
        } else if (!excluir.has('par:' + clave) && Cp < -1e-12 && ((C <= TOL_HUECO && Cp < -UMBRAL) || (C > TOL_HUECO && C <= tolContacto(R) && lentos(i, j)))) {
          // Se tocan y se acercan de verdad: choque (si es lento, quedan
          // apoyados). Si se tocan y el acercamiento es un resto lento, se
          // apoyan en la proyección inelástica, sin anotar un choque de ruido.
          if (anotar(`choque:${clave}`, () => choque(i, j, zeno))) hubo = true;
        }
      }
      for (let i = 0; i < S.n; i++) {
        const ri = radio(S, i);
        S.sup.forEach((sup, js) => {
          if (ajenos(S, i, sup)) return;     // su propia superficie, o dos cuerpos que no pueden empujarse
          for (const kv of apoyosDe(S, i)) {
            const clave = claveApoyo(i, kv, js), actual = modo.contactos[clave], p = puntoApoyo(S, sup, y, i, kv);
            const { C, Cp } = restriccionApoyo(S, sup, i, kv).evaluar(y);
            if (actual) {
              // Apoyada: un impulso hacia la superficie es un choque; uno que la
              // aleja la despega; un resto lento lo quita la proyección del final
              if (Cp < -UMBRAL) {
                delete modo.contactos[clave];
                if (anotar(`impacto:${clave}`, () => impacto(i, js, zeno, kv))) hubo = true;
                if (modo.contactos[clave] && actual.pegado) modo.contactos[clave].pegado = true;
              } else if (Cp > UMBRAL) delete modo.contactos[clave];
              continue;
            }
            if (excluir.has('sup:' + clave)) continue;
            if (C < -TOL_PENETRACION || margenSuperficie(sup, p) < 0) continue;
            const lento = Math.hypot(...velocidadApoyo(S, sup, y, i, kv)) <= UMBRAL;
            if (Cp < -1e-12 && ((C <= TOL_HUECO && Cp < -UMBRAL) || (C > TOL_HUECO && C <= tolContacto(ri) && lento))) {
              if (anotar(`impacto:${clave}`, () => impacto(i, js, zeno, kv))) hubo = true;
            }
          }
        });
      }
      if (!hubo) break;
    }
    proyeccionInelastica(excluir);
  };
  // Cierre del instante: ningún par que se toca puede quedar acercándose. Los
  // impulsos secuenciales convergen muy despacio en una cuña (un disco que cae
  // en un hueco justo de su diámetro entre vecinos que no pueden apartarse) y
  // dejaban velocidades de acercamiento que provocaban otro choque al poco.
  // Aquí se resuelve de una vez el LCP de impulsos inelásticos: P ≥ 0,
  // Ċ' = Ċ + J M⁻¹ Jᵀ P ≥ 0, P·Ċ' = 0, sobre los apoyos activos y los que se
  // tocan; los que reciben impulso quedan apoyados.
  const proyeccionInelastica = (excluir = new Set()) => {
    /** @type {{e: {C: number, Cp: number, grad: number[][], jdv: number}, alta: null | (() => void)}[]} */
    const cand = [];
    for (const s of Object.values(modo.contactos)) cand.push({ e: restriccionApoyo(S, S.sup[s.sup], s.i, s.k ?? -1).evaluar(y), alta: null });
    for (let i = 0; i < S.n; i++) for (let j = i + 1; j < S.n; j++) {
      if (!parPosible(S, i, j)) continue;
      const clave = `${i}:${j}`;
      if (!modo.pares[clave] && excluir.has('par:' + clave)) continue;
      const e = restriccionPar(S, i, j).evaluar(y);
      if (modo.pares[clave]) cand.push({ e, alta: null });
      else if (e.C <= TOL_HUECO) cand.push({ e, alta: () => { modo.pares[clave] = nuevoPar(S, i, j); } });
    }
    for (let i = 0; i < S.n; i++) {
      S.sup.forEach((sup, js) => {
        if (ajenos(S, i, sup)) return;
        for (const kv of apoyosDe(S, i)) {
          const clave = claveApoyo(i, kv, js), p = puntoApoyo(S, sup, y, i, kv);
          if (modo.contactos[clave] || excluir.has('sup:' + clave) || margenSuperficie(sup, p) < 0) continue;
          const e = restriccionApoyo(S, sup, i, kv).evaluar(y);
          if (e.C <= TOL_HUECO && e.C >= -TOL_PENETRACION) cand.push({ e, alta: () => { modo.contactos[clave] = { i, sup: js, pegado: false, k: kv }; } });
        }
      });
    }
    if (!cand.some(c => c.e.Cp < -1e-12)) return;
    const k = cand.length, A = regularizada(matrizJMJ(cand.map(c => c.e), masas));
    const P = resolverLCP(A, cand.map(c => c.e.Cp));
    for (let r = 0; r < k; r++) {
      if (!(P[r] > 0)) continue;
      impulsoFila(cand[r].e.grad, P[r]);
      if (cand[r].alta) cand[r].alta();
    }
  };
  // Post-estabilización (Cline y Pai, 2003): al empezar cada tramo se llevan
  // las posiciones a la variedad de las restricciones activas violadas
  // (solapes, cuerdas pasadas de largo) con el paso de Gauss–Newton de
  // mínima energía Δq = M⁻¹Jᵀ(J M⁻¹ Jᵀ)⁻¹(−C). Así la estabilización de
  // Baumgarte no arrastra restos de solape de un tramo a otro como empujes
  // lentos que vuelven a juntar discos ya en reposo.
  const proyectarPosiciones = () => {
    for (let vuelta = 0; vuelta < 3; vuelta++) {
      const restr = restriccionesDelModo(S, modo);
      const filas = [];
      for (const r of restr) {
        // Solo solapes de cuerpos: corregir el largo de una cuerda movería la
        // partícula a lo largo de la recta pivote–clavo, justo la frontera del
        // enganche, y el redondeo la cruzaría una y otra vez
        if (!r.clave.startsWith('contacto:') && !r.clave.startsWith('par:')) continue;
        const e = r.evaluar(y);
        if (e.C < -1e-15) filas.push(e);
      }
      if (!filas.length) return;
      const k = filas.length, A = regularizada(matrizJMJ(filas, masas)), b = filas.map(e => -e.C);
      const mu = resolver(A, b) ?? [];
      for (let r = 0; r < k; r++) for (const [i, gx, gy] of filas[r].grad) sumarPosicion(S, y, i, mu[r] * gx * S.im[i], mu[r] * gy * S.im[i]);
    }
  };
  resolverSimultaneos(false);
  revisarDespegues();
  proyectarPosiciones();

  /** Anota como eventos los apoyos, pares y cuerdas que se perdieron en este instante (salvo «excepto»). */
  const anotarPerdidas = (activasAntes, excepto) => {
    const activasDespues = activas(modo);
    for (const a of activasAntes) {
      if (activasDespues.has(a) || a === excepto) continue;
      const [tipo, ...resto2] = a.split(':');
      let nombreEv = '', claveEv = '';
      if (tipo === 'contacto') {
        const [i, kv] = apoyoDe(resto2[0]), sup = S.sup[Number(resto2[1])];
        const borde = margenSuperficie(sup, puntoApoyo(S, sup, y, i, kv)) <= 1e-6;
        nombreEv = borde ? `Sale del borde (${S.P[i].id})` : `Se despega (${S.P[i].id})`;
        claveEv = `${borde ? 'fin' : 'despegue'}:${resto2.join(':')}`;
      } else if (tipo === 'par') {
        nombreEv = `Se separan ${S.P[Number(resto2[0])].id} y ${S.P[Number(resto2[1])].id}`;
        claveEv = `separa:${resto2.join(':')}`;
      } else {
        nombreEv = `La cuerda ${resto2.join(':')} se afloja`;
        claveEv = `floja:${resto2.join(':')}`;
      }
      eventos.push({ t, nombre: nombreEv, clave: claveEv, perdida: 0, y: y.slice() });
    }
  };

  // Los eventos del clavo no son monótonos (cambian de forma al entrar en el
  // alcance de la cuerda): con clavos, el paso se acota también por la duración
  const hayClavos = S.con.some(c => c.clavos && c.clavos.length);
  /** @type {null | {t: number, motivo: string}} */
  let incompleta = null;
  const PRESUPUESTO = escena.maxPasos ?? 150000, TIEMPO_MAX = escena.tiempoMax ?? 5000;
  const reloj = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const inicioReloj = reloj();
  let pasosUsados = 0;
  // Eventos descartados (un cruce sin choque): se silencian durante una pausa
  // muy breve para que no se repitan en el mismo instante
  let silencio = new Set(), tSilencio = -Infinity;
  // Un cruce descartado silencia su evento durante una pausa; si en el mismo
  // instante se descarta otro (dos bordes a la vez), se silencian los dos
  const silenciar = nombreEv => {
    if (t - tSilencio <= 2 * PAUSA) for (const n of silenciadosActuales) silencio.add(n);
    silencio.add(nombreEv); tSilencio = t;
  };
  let silenciadosActuales = new Set();
  while (t < DUR - 1e-12 && k < LIMITE) {
    k++;
    // Sentido de la fricción cinética de cada apoyo que desliza, fijo en el
    // tramo: con signo(v_t) evaluado en cada etapa, el paso que contiene el
    // cero mezclaba los dos sentidos y el instante en que una bola empieza a
    // rodar salía 10⁻⁸ s tarde. Si el deslizamiento empieza en cero (justo al
    // soltarse), se usa el signo instantáneo como antes.
    for (const s of Object.values(modo.contactos)) {
      if (s.pegado || !(S.sup[s.sup].mu > 0)) { s.sentido = 0; continue; }
      const vt = deslizamiento(S, S.sup[s.sup], y, s.i, s.k ?? -1).vt;
      s.sentido = Math.abs(vt) > 1e-13 ? Math.sign(vt) : 0;
    }
    for (const [c, p] of Object.entries(modo.pares)) {
      if (typeof p !== 'object') continue;
      if (p.pegado) { p.sentido = 0; continue; }
      const [a, b] = c.split(':').map(Number), vt = deslizamientoPar(S, y, a, b).vt;
      p.sentido = Math.abs(vt) > 1e-13 ? Math.sign(vt) : 0;
    }
    const restr = restriccionesDelModo(S, modo);
    const m = modo;
    // Caché de la última evaluación: f(tR, yR) y los eventos en tR comparten arreglo
    /** @type {number[] | null} */
    let ultY = null;
    /** @type {any} */
    let ultD = null;
    const din = (/** @type {number[]} */ yy) => { if (yy !== ultY) { ultD = dinamica(S, m, yy, restr); ultY = yy; } return ultD; };
    const f = (tt, yy) => {
      const { acc, fuerzaTotal } = din(yy);
      const d = new Array(yy.length);
      for (let i = 0; i < S.n; i++) { d[4 * i] = yy[4 * i + 2]; d[4 * i + 1] = yy[4 * i + 3]; d[4 * i + 2] = acc[2 * i]; d[4 * i + 3] = acc[2 * i + 1]; }
      for (let q = 0; q < S.nr; q++) { d[S.base + 2 * q] = yy[S.base + 2 * q + 1]; d[S.base + 2 * q + 1] = acc[2 * (S.n + q)]; }
      // E + Qc + Qi = E0 + W: lo que entra por los conductores menos lo que sube E
      const W = hayCinematicos ? potenciaConductores(S, yy, fuerzaTotal) : 0;
      d[4 * S.n] = potenciaDisipada(S, yy, acc) + W;
      d[4 * S.n + 1] = W;
      return d;
    };
    // Paso máximo acotado: un evento cuya función baja y vuelve a subir dentro de un
    // paso (dos partículas que se cruzan) no se detecta por el signo en los extremos.
    const silenciados = silencio;
    silenciadosActuales = silenciados;
    silencio = new Set();
    // Cada tramo acaba como muy tarde en el próximo cambio de aceleración impuesta
    actualizarImpuestas(S, t);
    const tHasta = Math.min(silenciados.size ? Math.min(DUR, t + PAUSA) : DUR, proximoCorte(S, t));
    const sol = integrar(f, t, y, tHasta, {
      rtol: RTOL, atol: RTOL * 1e-2, maxPasos: Math.max(1, PRESUPUESTO - pasosUsados), hMaxDe,
      detener: () => reloj() - inicioReloj > TIEMPO_MAX,
      eventos: eventosDelModo(S, modo, restr, y, din).filter(e => !silenciados.has(e.nombre)),
      hMax: escena.pasoMax ?? (hayClavos ? Math.max(1e-3, DUR / 400) : undefined),
    });
    const tFin = sol.t[sol.t.length - 1];
    tramos.push({ t0: t, t1: tFin, sol, modo: copiarModo(modo) });
    t = tFin; y = sol.y[sol.y.length - 1].slice();
    pasosUsados += sol.pasosAceptados + sol.pasosRechazados;
    if (t < DUR - 1e-12 && (sol.estado === 'detenido' || reloj() - inicioReloj > TIEMPO_MAX)) {
      incompleta = { t, motivo: `La simulación tardaba demasiado (más de ${Math.round(TIEMPO_MAX / 1000)} s de cálculo): la escena tiene demasiados contactos o eventos para simularla entera.` };
      break;
    }
    if (sol.estado !== 'evento') {
      if (sol.estado === 'maxPasos' && pasosUsados >= PRESUPUESTO) {
        incompleta = { t, motivo: `Se alcanzó el límite de cálculo (${PRESUPUESTO} pasos): la escena tiene demasiados contactos o eventos para simularla entera.` };
        break;
      }
      if (sol.estado !== 'completo') { incompleta = { t, motivo: `El integrador se detuvo (${sol.estado}).` }; break; }
      // Cambio de aceleración impuesta: un apoyo que sostenía puede pasar a
      // tirar (un ascensor que frena más que g) y debe soltarse aquí
      if (t < DUR - 1e-12 && Math.abs(t - proximoCorte(S, t - 1e-9)) <= 1e-9) {
        actualizarImpuestas(S, t);
        modo = copiarModo(modo);
        const antes = activas(modo);
        revisarDespegues();
        anotarPerdidas(antes, '');
      }
      continue;     // llegó al final, o al final de la pausa
    }
    const ev = sol.eventos[sol.eventos.length - 1];
    const nombre = ev.nombre || '';
    // Energía mecánica entera (no solo la cinética): la proyección de las
    // posiciones del instante cambia también la potencial
    const K0 = energiaEstado(S, y);
    trabajoImpulsivo = 0;
    const zeno = k > LIMITE - 10;
    modo = copiarModo(modo);
    const activasAntes = activas(modo);
    const partes = nombre.split(':');
    const excluir = new Set();
    let descripcion = '';
    if (partes[0] === 'impacto') {
      const [i, kv] = apoyoDe(partes[1]), js = Number(partes[2]);
      const { C } = restriccionApoyo(S, S.sup[js], i, kv).evaluar(y);
      // Si el evento lo disparó el borde (la partícula entra en la extensión de
      // la superficie estando detrás, C < 0), o no se acerca, no hay choque.
      // Dentro de la extensión es un impacto aunque haya un solape pequeño.
      const porBorde = margenSuperficie(S.sup[js], puntoApoyo(S, S.sup[js], y, i, kv)) <= TOL_HUECO && C < -TOL_PENETRACION;
      descripcion = porBorde ? '' : impacto(i, js, zeno, kv);
      if (!descripcion) silenciar(nombre);
    } else if (partes[0] === 'frente') {
      // Pasó al lado libre de la cara de un bloque: solo se rehacen los eventos
    } else if (partes[0] === 'despegue') {
      const clave = `${partes[1]}:${partes[2]}`;
      excluir.add('sup:' + clave);
      delete modo.contactos[clave];
      descripcion = `Se despega (${S.P[apoyoDe(partes[1])[0]].id})`;
    } else if (partes[0] === 'fin') {
      const clave = `${partes[1]}:${partes[2]}`;
      excluir.add('sup:' + clave);
      delete modo.contactos[clave];
      descripcion = `Sale del borde (${S.P[apoyoDe(partes[1])[0]].id})`;
    } else if (partes[0] === 'vt0') {
      const clave = `${partes[1]}:${partes[2]}`, i = apoyoDe(partes[1])[0], s = modo.contactos[clave], sup = S.sup[s.sup];
      const restr2 = restriccionesDelModo(S, modo);
      // Adherencia que haría falta para que no deslice (para el sentido si no alcanza)
      s.pegado = true;
      const L = dinamica(S, modo, y, restr2).lambdas;
      // ¿La fricción estática alcanza para mantenerlo quieto? Con los demás
      // apoyos del mismo cuerpo que tampoco deslizan (los vértices de un
      // bloque que se detiene dejan de deslizar a la vez)
      const hermanos = Object.entries(modo.contactos).filter(([c, x]) => c !== clave && !x.pegado && x.i === i && S.sup[x.sup].mu > 0 && Math.abs(deslizamiento(S, S.sup[x.sup], y, x.i, x.k ?? -1).vt) <= 1e-9);
      pegarQuietos([[clave, s], ...hermanos]);
      let invierte = false;
      if (!s.pegado) {
        // Empuja un poco para que el evento no se repita en el mismo instante,
        // en un sentido coherente: con la fricción cinética opuesta a ese
        // sentido, el deslizamiento tiene que acelerar hacia él. Con el sentido
        // del tramo anterior (el de antes de invertirse) la aceleración salía
        // al revés en un bloque que vuelca, y el evento se repetía sin fin.
        const { t: tg, grad } = deslizamiento(S, sup, y, i, s.k ?? -1);
        const acelDesliz = sentido => {
          s.sentido = sentido;
          const a = dinamica(S, modo, y, restr2).acc;
          let at = 0;
          for (const [q, gx, gy] of grad) at += gx * a[2 * q] + gy * a[2 * q + 1];
          return at;
        };
        // Si los dos o ninguno son coherentes (paradoja de Painlevé), el
        // sentido en que tiraba la adherencia que no alcanzó: desliza al revés
        const tendencia = -Math.sign(L[`pegado:${clave}`] || 0) || 1;
        const ok = [1, -1].filter(sg => Math.sign(acelDesliz(sg)) === sg);
        s.sentido = 0;
        if (ok.length === 0) {
          // Ningún sentido es coherente y la adherencia pide un poco más que
          // μs·N (la normal depende de la fricción: un bloque que vuelca sobre
          // su arista). Es la paradoja de Painlevé; como los motores con
          // conos de fricción, se queda pegado en el límite del cono
          s.pegado = true;
        } else {
          const sgn = ok.length === 1 ? ok[0] : tendencia;
          y[4 * i + 2] += sgn * 1e-12 * tg[0]; y[4 * i + 3] += sgn * 1e-12 * tg[1];
          invierte = true;
        }
      }
      descripcion = !invierte ? (S.vert[i] ? `Deja de deslizar (${S.P[i].id})` : S.rot[i] >= 0 ? `Rueda sin deslizar (${S.P[i].id})` : `Se detiene (${S.P[i].id})`) : `Invierte el deslizamiento (${S.P[i].id})`;
    } else if (partes[0] === 'desliza') {
      modo.contactos[`${partes[1]}:${partes[2]}`].pegado = false;
      descripcion = `Empieza a deslizar (${S.P[apoyoDe(partes[1])[0]].id})`;
    } else if (partes[0] === 'tensa') {
      const c = S.con.find(x => x.id === partes[1]);
      modo.cuerdas[c.id].tensa = true;
      aplicarTiron(S, c, modo, y);
      descripcion = `La cuerda ${c.id} se tensa`;
    } else if (partes[0] === 'floja') {
      modo.cuerdas[partes[1]].tensa = false;
      descripcion = `La cuerda ${partes[1]} se afloja`;
    } else if (partes[0] === 'engancha') {
      const c = S.con.find(x => x.id === partes[1]), kk = Number(partes[2]), est = modo.cuerdas[c.id];
      const { punto, L } = pivoteCuerda(c, modo), nail = c.clavos[kk];
      const dn = sub(nail, punto), p = [y[4 * c.ia], y[4 * c.ia + 1]], v = [y[4 * c.ia + 2], y[4 * c.ia + 3]];
      if (dot(dn, sub(p, punto)) > 0) {
        est.Lrest = L - norm(dn); est.clavos.push(kk);
        // Sentido de giro alrededor del clavo (para detectar el desenganche):
        // tras enganchar, (clavo − pivote) × (p − clavo) crece como t·(dn × v).
        // Antes se multiplicaba por el signo de dn × dp, que en este instante
        // es cero por definición: un signo de redondeo que a veces lo invertía
        // y la cuerda se enganchaba y soltaba sin fin.
        est.sentido.push(Math.sign(dn[0] * v[1] - dn[1] * v[0]) || 1);
        descripcion = `La cuerda ${c.id} toca el clavo`;
        // En este instante la función del desenganche vale cero: su ruido de
        // signo no debe soltarla enseguida
        silenciar(`desengancha:${c.id}`);
      } else {
        // La partícula cruzó la recta del clavo del otro lado del pivote: la cuerda no lo toca
        silenciar(nombre);
      }
    } else if (partes[0] === 'desengancha') {
      const c = S.con.find(x => x.id === partes[1]), est = modo.cuerdas[c.id];
      const kk = est.clavos.pop(); est.sentido.pop();
      const prev = est.clavos.length ? c.clavos[est.clavos[est.clavos.length - 1]] : c.ancla;
      est.Lrest += norm(sub(c.clavos[kk], prev));
      descripcion = `La cuerda ${c.id} se suelta del clavo`;
      silenciar(`engancha:${c.id}:${kk}`);
    } else if (partes[0] === 'choque') {
      descripcion = choque(Number(partes[1]), Number(partes[2]), zeno);
      if (!descripcion) silenciar(nombre);
    } else if (partes[0] === 'elastica') {
      const c = S.con.find(x => x.id === partes[1]);
      const pa = [y[4 * c.ia], y[4 * c.ia + 1]], pb = c.ib < 0 ? c.ancla : [y[4 * c.ib], y[4 * c.ib + 1]];
      const va = [y[4 * c.ia + 2], y[4 * c.ia + 3]], vb = c.ib < 0 ? [0, 0] : [y[4 * c.ib + 2], y[4 * c.ib + 3]];
      const d = sub(pa, pb), alarga = dot(d, sub(va, vb)) > 0;
      descripcion = alarga ? `La cuerda elástica ${c.id} se tensa` : `La cuerda elástica ${c.id} queda floja`;
      // Pasa por el largo natural con g ≈ 0: se silencia una pausa para no repetirlo
      silenciar(nombre);
    } else if (partes[0] === 'rueda') {
      // Dos discos dejan de deslizar uno sobre otro: ¿alcanza la adherencia?
      const i = Number(partes[1]), j = Number(partes[2]), clave = `${i}:${j}`, est = modo.pares[clave];
      const restr2 = restriccionesDelModo(S, modo);
      est.pegado = true;
      const L = dinamica(S, modo, y, restr2).lambdas;
      pegarQuietos([[clave, est]]);
      let invierte = false;
      if (!est.pegado) {
        // Empujón en un sentido coherente con la fricción cinética (como en vt0)
        const { t: tg, grad } = deslizamientoPar(S, y, i, j);
        const acel = sentido => {
          est.sentido = sentido;
          const a = dinamica(S, modo, y, restr2).acc;
          let at = 0;
          for (const [q, gx, gy] of grad) at += gx * a[2 * q] + gy * a[2 * q + 1];
          return at;
        };
        const tendencia = -Math.sign(L[`pegadoPar:${clave}`] || 0) || 1;
        const ok = [1, -1].filter(sg => Math.sign(acel(sg)) === sg);
        est.sentido = 0;
        if (ok.length === 0) est.pegado = true;      // Painlevé: pegados en el límite del cono
        else {
          const sgn = ok.length === 1 ? ok[0] : tendencia, q = S.im[i] > 0 ? i : j, sg2 = q === i ? 1 : -1;
          y[4 * q + 2] += sg2 * sgn * 1e-12 * tg[0]; y[4 * q + 3] += sg2 * sgn * 1e-12 * tg[1];
          invierte = true;
        }
      }
      descripcion = invierte ? `Invierten el deslizamiento ${S.P[i].id} y ${S.P[j].id}` : `Ruedan sin deslizar ${S.P[i].id} y ${S.P[j].id}`;
    } else if (partes[0] === 'resbala') {
      const est = modo.pares[`${partes[1]}:${partes[2]}`];
      if (typeof est === 'object') est.pegado = false;
      descripcion = `Empiezan a deslizar ${S.P[Number(partes[1])].id} y ${S.P[Number(partes[2])].id}`;
    } else if (partes[0] === 'separa') {
      excluir.add(`par:${partes[1]}:${partes[2]}`);
      delete modo.pares[`${partes[1]}:${partes[2]}`];
      descripcion = `Se separan ${S.P[Number(partes[1])].id} y ${S.P[Number(partes[2])].id}`;
    }
    const iEvento = eventos.length;
    if (descripcion) eventos.push({ t, nombre: descripcion, clave: nombre, perdida: 0, y: y.slice() });
    perdidaAnotada = 0;
    resolverSimultaneos(zeno, excluir);
    revisarDespegues();
    proyectarPosiciones();
    // Energía del instante que no registró ningún choque simultáneo: la del
    // evento principal más la de las proyecciones sin evento
    const resto = K0 - energiaEstado(S, y) + trabajoImpulsivo - perdidaAnotada;
    // El trabajo impulsivo de los conductores se suma al acumulado del estado
    if (trabajoImpulsivo) y[4 * S.n + 1] += trabajoImpulsivo;
    if (resto > 0) {
      const destino = eventos[iEvento] ?? eventos[eventos.length - 1];
      if (destino) destino.perdida += resto;
    }
    // Apoyos, pares y cuerdas que se pierden en este instante por otra causa
    // (un choque simultáneo, una superficie nueva): también son eventos
    const propia = { despegue: 'contacto', fin: 'contacto', separa: 'par', floja: 'cuerda' }[partes[0]];
    anotarPerdidas(activasAntes, propia ? `${propia}:${partes.slice(1).join(':')}` : '');
  }
  if (!incompleta && t < DUR - 1e-9) incompleta = { t, motivo: `Se alcanzó el límite de ${LIMITE} eventos.` };
  return { tramos, eventos, escena, S: { n: S.n, ids: S.P.map(p => p.id), m: S.P.map(p => p.m), rot: S.rot, I: S.I, base: S.base }, duracion: DUR, tFin: t, incompleta };
}

/** Tirón de una cuerda que se tensa: se anula la velocidad de alejamiento (inelástico). */
function aplicarTiron(S, c, modo, y) {
  const r = c.tipo === 'polea' ? restriccionPolea(c) : restriccionDistancia(c, modo, false);
  const { Cp, grad } = r.evaluar(y);
  if (Cp >= 0) return;   // no se aleja: no hay tirón
  // Impulso λ en la dirección del gradiente que lleva Ċ a 0
  let den = 0;
  for (const [i, gx, gy] of grad) den += (gx * gx + gy * gy) * S.im[i];
  const L = -Cp / den;
  for (const [i, gx, gy] of grad) sumarVelocidad(S, y, i, L * gx * S.im[i], L * gy * S.im[i]);
}

/**
 * Estado de todas las partículas en el instante t. th y w son el ángulo (rad)
 * y la velocidad angular (rad/s, positiva antihoraria) de los discos que
 * giran; 0 en los demás.
 * @param {ReturnType<typeof simularMecanica>} sim @param {number} t
 * @returns {Array<{id: string, x: number, y: number, vx: number, vy: number, th: number, w: number}>}
 */
export function estadoMecanica(sim, t) {
  const y = vectorEn(sim, t), { rot, base } = sim.S;
  return sim.S.ids.map((id, i) => {
    const q = rot[i];
    return { id, x: y[4 * i], y: y[4 * i + 1], vx: y[4 * i + 2], vy: y[4 * i + 3], th: q >= 0 ? y[base + 2 * q] : 0, w: q >= 0 ? y[base + 2 * q + 1] : 0 };
  });
}

/** Vector de estado completo en t (con la disipada continua al final). */
function vectorEn(sim, t) {
  // Último tramo que empieza en t o antes (búsqueda binaria: puede haber miles)
  const T = sim.tramos;
  let lo = 0, hi = T.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (T[mid].t0 <= t + 1e-15) lo = mid; else hi = mid - 1; }
  const tr = T[lo];
  return interpolar(tr.sol, Math.max(tr.t0, Math.min(t, tr.t1)));
}

/**
 * Energía mecánica en t: cinética, potencial gravitatoria, elástica y la de
 * las fuerzas constantes aplicadas (U_F = −F·r, conservativa como un campo
 * uniforme: así el trabajo de F no se confunde con energía disipada).
 * @param {ReturnType<typeof simularMecanica>} sim @param {number} t
 */
export function energiaMecanica(sim, t) {
  const e = sim.escena, g = e.g ?? [0, -9.8], est = estadoMecanica(sim, t);
  let K = 0, Kr = 0, Ug = 0, Ue = 0, UF = 0;
  est.forEach((s, i) => {
    // Un cuerpo cinemático es un agente externo: su energía no cuenta (lo que
    // entrega va en W)
    if (e.particulas[i].cinematica) return;
    const m = sim.S.m[i], F = e.particulas[i].F;
    if (sim.S.rot[i] >= 0) Kr += 0.5 * sim.S.I[sim.S.rot[i]] * s.w * s.w;
    K += 0.5 * m * (s.vx * s.vx + s.vy * s.vy);
    Ug -= m * (g[0] * s.x + g[1] * s.y);
    if (F) UF -= F[0] * s.x + F[1] * s.y;
    const b = e.particulas[i].Fpunto;
    if (F && b && sim.S.rot[i] >= 0) UF -= F[0] * (Math.cos(s.th) * b[0] - Math.sin(s.th) * b[1]) + F[1] * (Math.sin(s.th) * b[0] + Math.cos(s.th) * b[1]);
  });
  const pos = Object.fromEntries(est.map(s => [s.id, [s.x, s.y]]));
  for (const c of e.conectores || []) {
    if (c.tipo !== 'resorte') continue;
    const pb = c.b != null ? pos[c.b] : c.ancla, D = norm(sub(pos[c.a], pb));
    if (c.soloTira && D <= c.L0) continue;
    Ue += 0.5 * c.k * (D - c.L0) ** 2;
  }
  // Disipada hasta t: la continua (fricción, arrastre, amortiguadores,
  // estabilización) y la de los choques y demás cambios instantáneos
  const vec = vectorEn(sim, t), Qc = vec[4 * sim.S.n] ?? 0, W = vec[4 * sim.S.n + 1] ?? 0;
  let Qi = 0;
  for (const ev of sim.eventos) if (ev.t <= t + 1e-12) Qi += ev.perdida;
  // K incluye la energía de rotación Kr (½Iω²)
  K += Kr;
  return { K, Kr, Ug, Ue, UF, E: K + Ug + Ue + UF, Qc, Qi, W };
}
