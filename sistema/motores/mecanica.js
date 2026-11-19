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
 * @property {[number, number]} [F]    Fuerza constante aplicada (N)
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
 *
 * @typedef {Object} Conector
 * @property {string} id
 * @property {'resorte'|'cuerda'|'varilla'|'polea'} tipo
 * @property {string} a                Partícula
 * @property {string} [b]              Otra partícula (o ancla fija)
 * @property {[number, number]} [ancla] Punto fijo si no hay b
 * @property {number} [k]              Resorte: constante (N/m)
 * @property {number} [L0]             Resorte: longitud natural (m)
 * @property {number} [c]              Resorte: amortiguamiento (N·s/m)
 * @property {number} [L]              Cuerda o varilla: longitud; polea: longitud total
 * @property {[number, number]} [polea] Polea: punto fijo sobre el que pasa la cuerda (a y b son los extremos)
 * @property {Array<[number, number]>} [clavos] Cuerda: clavos donde puede engancharse
 *
 * @typedef {Object} EscenaMecanica
 * @property {[number, number]} [g]    Gravedad (m/s²)
 * @property {number} [b]              Arrastre lineal (N·s/m)
 * @property {number} [cAire]          Arrastre cuadrático (N·s²/m²)
 * @property {Particula[]} particulas
 * @property {Superficie[]} [superficies]
 * @property {Conector[]} [conectores]
 * @property {number} [duracion=5]
 * @property {number} [eParticulas=1]  Restitución entre partículas
 * @property {number} [umbral=1e-3]    Rapidez normal (m/s) bajo la cual un rebote se convierte en contacto
 * @property {number} [rtol=1e-10]
 * @property {number} [maxEventos=2000] Límite de eventos (regla post-Zeno cerca del límite)
 * @property {number} [pasoMax]        Paso máximo del integrador (s)
 */

const UMBRAL_LAMBDA = 1e-12;

// ---------------------------------------------------------------------------
// Geometría
// ---------------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const norm = a => Math.hypot(a[0], a[1]);
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
  const sup = (e.superficies || []).map(s => ({ ...s, geo: s.tipo === 'segmento' ? geoSegmento(s) : null }));
  const con = (e.conectores || []).map(c => ({ ...c, ia: idx[c.a], ib: c.b != null ? idx[c.b] : -1 }));
  for (const c of con) {
    if (c.ia == null || (c.b != null && c.ib == null)) throw new Error(`El conector ${c.id} une partículas que no existen.`);
  }
  return { P, idx, g, sup, con, n: P.length, b: e.b || 0, cAire: e.cAire || 0 };
}

/** Estado inicial empaquetado [x, y, vx, vy] por partícula. */
function estadoInicial(P) {
  const y = [];
  for (const p of P) y.push(p.p[0], p.p[1], p.v[0], p.v[1]);
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
    lista.push({ clave: `contacto:${clave}`, unilateral: true, ...restriccionSuperficie(S.sup[s.sup], s.i, radio(S, s.i)) });
  }
  for (const par of Object.keys(modo.pares)) {
    const [i, j] = par.split(':').map(Number);
    lista.push({ clave: `par:${par}`, unilateral: true, ...restriccionPar(S, i, j) });
  }
  for (const c of S.con) {
    if (c.tipo === 'varilla') lista.push({ clave: `varilla:${c.id}`, unilateral: false, ...restriccionDistancia(c, modo, true) });
    if (c.tipo === 'cuerda' && modo.cuerdas[c.id]?.tensa) lista.push({ clave: `cuerda:${c.id}`, unilateral: true, ...restriccionDistancia(c, modo, false) });
    if (c.tipo === 'polea' && modo.cuerdas[c.id]?.tensa) lista.push({ clave: `polea:${c.id}`, unilateral: true, ...restriccionPolea(c) });
  }
  return lista;
}

/**
 * Hueco entre la partícula i (de radio r) y una superficie: C ≥ 0 es el lado libre.
 * @param {any} sup @param {number} i @param {number} [r=0]
 */
function restriccionSuperficie(sup, i, r = 0) {
  if (sup.tipo === 'segmento') {
    const { n } = sup.geo;
    return {
      evaluar(y) {
        const p = [y[4 * i], y[4 * i + 1]], v = [y[4 * i + 2], y[4 * i + 3]];
        return { C: dot(n, sub(p, sup.a)) - r, Cp: dot(n, v), grad: [[i, n[0], n[1]]], jdv: 0 };
      },
    };
  }
  // Arco: exterior C = |d| − (R + r); interior C = (R − r) − |d|
  const sg = sup.cara === 'interior' ? -1 : 1, Rc = sup.r + sg * r;
  return {
    evaluar(y) {
      const d = [y[4 * i] - sup.c[0], y[4 * i + 1] - sup.c[1]], v = [y[4 * i + 2], y[4 * i + 3]];
      const D = norm(d), u = [d[0] / D, d[1] / D], uv = dot(u, v);
      return { C: sg * (D - Rc), Cp: sg * uv, grad: [[i, sg * u[0], sg * u[1]]], jdv: sg * (dot(v, v) - uv * uv) / D };
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

/** Resuelve A·x = b por eliminación gaussiana con pivoteo parcial (A pequeña). */
function resolver(A, b) {
  const n = b.length, M = A.map((f, i) => [...f, b[i]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    [M[k], M[p]] = [M[p], M[k]];
    const piv = M[k][k];
    if (Math.abs(piv) < 1e-300) continue;
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

/** Fuerzas aplicadas (gravedad, arrastre, resortes, fuerzas constantes, fricción). */
function fuerzas(S, modo, y, lambdasPrevias) {
  const n = S.n, F = new Array(2 * n).fill(0);
  for (let i = 0; i < n; i++) {
    const p = S.P[i], vx = y[4 * i + 2], vy = y[4 * i + 3];
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
    const f = -c.k * (D - c.L0) - (c.c || 0) * dot(u, sub(va, vb));
    F[2 * ia] += f * u[0]; F[2 * ia + 1] += f * u[1];
    if (ib >= 0) { F[2 * ib] -= f * u[0]; F[2 * ib + 1] -= f * u[1]; }
  }
  // Fricción cinética en contactos que deslizan: −μ·N·t̂·signo(v_t)
  if (lambdasPrevias) {
    for (const [clave, s] of Object.entries(modo.contactos)) {
      const sup = S.sup[s.sup], iP = s.i;
      if (!(sup.mu > 0) || s.pegado) continue;
      const N = Math.max(0, lambdasPrevias[`contacto:${clave}`] || 0);
      const t = tangente(sup, [y[4 * iP], y[4 * iP + 1]]);
      const vt = t[0] * y[4 * iP + 2] + t[1] * y[4 * iP + 3];
      if (Math.abs(vt) < 1e-15) continue;
      const f = -sup.mu * N * Math.sign(vt);
      F[2 * iP] += f * t[0]; F[2 * iP + 1] += f * t[1];
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
  const n = S.n, m = S.P.map(p => p.m);
  let lambdas = null, acc = null;
  const iteraciones = Object.values(modo.contactos).some(s => S.sup[s.sup].mu > 0 && !s.pegado) ? 4 : 1;
  for (let it = 0; it < iteraciones; it++) {
    const F = fuerzas(S, modo, y, lambdas);
    const ev = restr.map(r => r.evaluar(y));
    // Restricciones adicionales de adherencia (fricción estática)
    const pegadas = [];
    for (const [clave, s] of Object.entries(modo.contactos)) {
      if (!s.pegado) continue;
      const iP = s.i, t = tangente(S.sup[s.sup], [y[4 * iP], y[4 * iP + 1]]);
      const vt = t[0] * y[4 * iP + 2] + t[1] * y[4 * iP + 3];
      pegadas.push({ clave: `pegado:${clave}`, evaluar: () => ({ C: 0, Cp: vt, grad: [[iP, t[0], t[1]]], jdv: 0 }) });
      ev.push(pegadas[pegadas.length - 1].evaluar());
    }
    const k = ev.length;
    const a0 = new Array(2 * n);
    for (let i = 0; i < n; i++) { a0[2 * i] = F[2 * i] / m[i]; a0[2 * i + 1] = F[2 * i + 1] / m[i]; }
    let lam = [];
    if (k) {
      // (J M⁻¹ Jᵀ) λ = −J a0 − J̇v − 2α Ċ − β² C
      const alfa = 20, beta = 20;
      const A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
      for (let r = 0; r < k; r++) {
        let Ja0 = 0;
        for (const [i, gx, gy] of ev[r].grad) Ja0 += gx * a0[2 * i] + gy * a0[2 * i + 1];
        b[r] = -Ja0 - ev[r].jdv - 2 * alfa * ev[r].Cp - beta * beta * ev[r].C;
        for (let s = 0; s < k; s++) {
          let v = 0;
          for (const [i, gx, gy] of ev[r].grad) for (const [j, hx, hy] of ev[s].grad) if (i === j) v += (gx * hx + gy * hy) / m[i];
          A[r][s] = v;
        }
      }
      lam = resolver(A, b);
    }
    acc = a0.slice();
    for (let r = 0; r < k; r++) for (const [i, gx, gy] of ev[r].grad) { acc[2 * i] += lam[r] * gx / m[i]; acc[2 * i + 1] += lam[r] * gy / m[i]; }
    lambdas = {};
    restr.forEach((r, j) => { lambdas[r.clave] = lam[j]; });
    pegadas.forEach((r, j) => { lambdas[r.clave] = lam[restr.length + j]; });
  }
  return { acc, lambdas };
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
      if (modo.contactos[`${i}:${js}`]) return;
      const r = restriccionSuperficie(sup, i, radio(S, i));
      const C0 = r.evaluar(y0).C, dentro0 = margenSuperficie(sup, [y0[4 * i], y0[4 * i + 1]]) >= 0;
      // Un hueco inicial nulo o negativo no cambiaría de signo: se mide desde él
      const off = C0 <= TOL_HUECO && C0 > -tolContacto(Math.max(radio(S, i), 1e-3)) * 100 && dentro0 ? Math.min(C0, 0) - TOL_HUECO : 0;
      ev.push({
        nombre: `impacto:${i}:${js}`, direccion: -1, terminal: true,
        // Solo cuenta dentro de la extensión de la superficie. max(C, −margen)
        // es continua (no salta al cruzar el borde), así que el cambio de signo
        // entre dos pasos es fiable; un cruce por el borde con C < 0 (desde
        // detrás) se descarta al tratarlo.
        g: (t, y) => Math.max(r.evaluar(y).C - off, -margenSuperficie(sup, [y[4 * i], y[4 * i + 1]])),
      });
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
      ev.push({ nombre: `fin:${clave}`, direccion: -1, terminal: true, g: (t, y) => margenSuperficie(sup, [y[4 * iP], y[4 * iP + 1]]) });
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
          g: (t, y) => { const tg = tangente(sup, [y[4 * iP], y[4 * iP + 1]]); return tg[0] * y[4 * iP + 2] + tg[1] * y[4 * iP + 3]; },
        });
      }
    }
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
        nombre: `desengancha:${c.id}`, direccion: 0, terminal: true,
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
    const R = radio(S, i) + radio(S, j);
    if (!(R > 0)) continue;
    if (modo.pares[`${i}:${j}`]) {
      ev.push({ nombre: `separa:${i}:${j}`, direccion: -1, terminal: true, g: (t, y) => din(y).lambdas[`par:${i}:${j}`] ?? 0 });
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

/** Margen hasta el borde: positivo dentro, negativo fuera. */
function margenSuperficie(sup, p) {
  if (sup.tipo === 'segmento') {
    const s = dot(sub(p, sup.a), sup.geo.t);
    return Math.min(s, sup.geo.L - s);
  }
  if (sup.a0 == null) return 1;   // arco completo
  const ang = Math.atan2(p[1] - sup.c[1], p[0] - sup.c[0]);
  const a = normalizarAngulo(ang - sup.a0), total = normalizarAngulo(sup.a1 - sup.a0) || 2 * Math.PI;
  return Math.min(a, total - a) * sup.r;
}
function normalizarAngulo(a) { const d = 2 * Math.PI; return ((a % d) + d) % d; }

// ---------------------------------------------------------------------------
// Transiciones
// ---------------------------------------------------------------------------

function copiarModo(m) {
  return {
    contactos: Object.fromEntries(Object.entries(m.contactos).map(([k, v]) => [k, { ...v }])),
    pares: { ...m.pares },
    cuerdas: Object.fromEntries(Object.entries(m.cuerdas).map(([k, v]) => [k, { ...v, clavos: [...v.clavos], sentido: [...v.sentido] }])),
  };
}

function energiaCinetica(S, y) {
  let K = 0;
  for (let i = 0; i < S.n; i++) K += 0.5 * S.P[i].m * (y[4 * i + 2] ** 2 + y[4 * i + 3] ** 2);
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
  const DUR = escena.duracion ?? 5, UMBRAL = escena.umbral ?? 1e-3, RTOL = escena.rtol ?? 1e-10;
  let y = estadoInicial(S.P), t = 0;
  /** @type {{contactos: Record<string, {i: number, sup: number, pegado: boolean}>, pares: Record<string, boolean>, cuerdas: Record<string, any>}} */
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
      const { C, Cp } = restriccionSuperficie(sup, i, radio(S, i)).evaluar(y);
      if (Math.abs(C) < 1e-9 && Math.abs(Cp) < 1e-9 && dentroDeSuperficie(sup, [y[4 * i], y[4 * i + 1]])) modo.contactos[`${i}:${js}`] = { i, sup: js, pegado: false };
    }
  });
  // Discos que empiezan tocándose y en reposo relativo (una pila, una fila)
  for (let i = 0; i < S.n; i++) for (let j = i + 1; j < S.n; j++) {
    if (!(radio(S, i) + radio(S, j) > 0)) continue;
    const { C, Cp } = restriccionPar(S, i, j).evaluar(y);
    if (Math.abs(C) < 1e-9 && Math.abs(Cp) < 1e-9) modo.pares[`${i}:${j}`] = true;
  }

  const tramos = [], eventos = [];
  const LIMITE = escena.maxEventos ?? 2000;
  let k = 0;
  // Un contacto recién creado puede tener la normal negativa (la partícula
  // se despega enseguida): se comprueba antes de integrar.
  const revisarDespegues = () => {
    let cambio = true, vueltas = 0;
    while (cambio && vueltas++ < 5) {
      cambio = false;
      const restr = restriccionesDelModo(S, modo);
      const { lambdas } = dinamica(S, modo, y, restr);
      for (const clave of Object.keys(modo.contactos)) {
        if ((lambdas[`contacto:${clave}`] ?? 0) < -UMBRAL_LAMBDA) { delete modo.contactos[clave]; cambio = true; }
      }
      for (const c of S.con) if ((c.tipo === 'cuerda' || c.tipo === 'polea') && modo.cuerdas[c.id].tensa && (lambdas[`${c.tipo}:${c.id}`] ?? 0) < -UMBRAL_LAMBDA) { modo.cuerdas[c.id].tensa = false; cambio = true; }
      for (const par of Object.keys(modo.pares)) if (!((lambdas[`par:${par}`] ?? 0) > LAMBDA_PAR_MIN)) { delete modo.pares[par]; cambio = true; }
    }
  };
  revisarDespegues();
  // Fricción estática al arrancar: un apoyo en reposo queda pegado si μs alcanza
  for (const [clave, s] of Object.entries(modo.contactos)) {
    const sup = S.sup[s.sup];
    if (!(sup.mu > 0)) continue;
    const iP = s.i, tg = tangente(sup, [y[4 * iP], y[4 * iP + 1]]);
    if (Math.abs(tg[0] * y[4 * iP + 2] + tg[1] * y[4 * iP + 3]) > 1e-12) continue;
    s.pegado = true;
    const L = dinamica(S, modo, y, restriccionesDelModo(S, modo)).lambdas;
    if ((sup.muS ?? sup.mu) * Math.max(0, L[`contacto:${clave}`]) < Math.abs(L[`pegado:${clave}`])) s.pegado = false;
  }

  // Paso máximo según la rapidez: en un paso, nada recorre más de un cuarto de
  // la escala menor de la escena (radio, medio segmento, medio radio de arco).
  // Así un choque no puede empezar y terminar dentro de un mismo paso.
  let escalaPaso = Infinity;
  for (let i = 0; i < S.n; i++) if (radio(S, i) > 0) escalaPaso = Math.min(escalaPaso, radio(S, i));
  for (const sup of S.sup) escalaPaso = Math.min(escalaPaso, sup.tipo === 'segmento' ? sup.geo.L / 2 : sup.r / 2);
  const hMaxDe = Number.isFinite(escalaPaso) ? (/** @type {number} */ tt, /** @type {number[]} */ yy) => {
    let v = 0;
    for (let i = 0; i < S.n; i++) v = Math.max(v, Math.hypot(yy[4 * i + 2], yy[4 * i + 3]));
    return v > 0 ? 0.25 * escalaPaso / v : Infinity;
  } : undefined;

  /** Impacto de la partícula i con la superficie js; devuelve la descripción o '' si no hay choque. */
  const impacto = (i, js, zeno) => {
    const sup = S.sup[js];
    const n = normalLibre(sup, [y[4 * i], y[4 * i + 1]]);
    const v = [y[4 * i + 2], y[4 * i + 3]], vn = dot(v, n);
    const e = sup.e ?? 1, vn2 = -e * vn;
    if (vn >= 0) return '';
    if (vn2 < UMBRAL || zeno) {
      y[4 * i + 2] -= vn * n[0]; y[4 * i + 3] -= vn * n[1];
      modo.contactos[`${i}:${js}`] = { i, sup: js, pegado: false };
      return `Choque y contacto con ${sup.id}`;
    }
    y[4 * i + 2] += (vn2 - vn) * n[0]; y[4 * i + 3] += (vn2 - vn) * n[1];
    return `Choque con ${sup.id}`;
  };
  /** Choque entre las partículas i y j; un rebote lento las deja en contacto. */
  const choque = (i, j, zeno) => {
    const e = escena.eParticulas ?? 1, mi = S.P[i].m, mj = S.P[j].m;
    const d = [y[4 * i] - y[4 * j], y[4 * i + 1] - y[4 * j + 1]], D = norm(d), n = [d[0] / D, d[1] / D];
    const vrel = (y[4 * i + 2] - y[4 * j + 2]) * n[0] + (y[4 * i + 3] - y[4 * j + 3]) * n[1];
    if (vrel >= 0) return '';
    const contacto = e * -vrel < UMBRAL || zeno;
    const J = -(1 + (contacto ? 0 : e)) * vrel / (1 / mi + 1 / mj);
    y[4 * i + 2] += J * n[0] / mi; y[4 * i + 3] += J * n[1] / mi;
    y[4 * j + 2] -= J * n[0] / mj; y[4 * j + 3] -= J * n[1] / mj;
    if (contacto) { modo.pares[`${i}:${j}`] = true; return `Choque y contacto entre ${S.P[i].id} y ${S.P[j].id}`; }
    return `Choque entre ${S.P[i].id} y ${S.P[j].id}`;
  };
  /** Registra un cambio instantáneo con la energía cinética que disipa. */
  let perdidaAnotada = 0;
  const anotar = (clave, aplicar) => {
    const K0 = energiaCinetica(S, y), descripcion = aplicar(), perdida = K0 - energiaCinetica(S, y);
    if (descripcion) { eventos.push({ t, nombre: descripcion, clave, perdida: perdida > 0 ? perdida : 0, y: y.slice() }); perdidaAnotada += perdida > 0 ? perdida : 0; }
    return descripcion;
  };
  // Choques en el mismo instante (una bola que toca a dos, un disco que llega
  // a la pared mientras choca con otro): impulsos secuenciales hasta que ningún
  // par en contacto se acerca. Sin esto, un hueco ya nulo o apenas negativo no
  // cambia de signo y el choque se perdería (los cuerpos se atravesarían).
  /** Quita la velocidad de acercamiento de un contacto (impulso inelástico mínimo, sin evento). */
  const proyectar = (grad, Cp) => {
    let den = 0;
    for (const [i, gx, gy] of grad) den += (gx * gx + gy * gy) / S.P[i].m;
    const L = -Cp / den;
    for (const [i, gx, gy] of grad) { y[4 * i + 2] += L * gx / S.P[i].m; y[4 * i + 3] += L * gy / S.P[i].m; }
  };
  // excluir: pares («i:j») o apoyos («i:js») que acaban de separarse en este
  // instante por un evento; no se vuelven a juntar en el mismo instante.
  const resolverSimultaneos = (zeno, excluir = new Set()) => {
    for (let vuelta = 0; vuelta < 4 * S.n + 10; vuelta++) {
      let hubo = false;
      for (let i = 0; i < S.n; i++) for (let j = i + 1; j < S.n; j++) {
        const R = radio(S, i) + radio(S, j);
        if (!(R > 0)) continue;
        const clave = `${i}:${j}`, { C, Cp, grad } = restriccionPar(S, i, j).evaluar(y);
        if (modo.pares[clave]) {
          // Apoyados: un impulso que llega (otro choque) se transmite como choque;
          // un resto lento de acercamiento se quita sin evento; si un impulso los
          // separa, dejan de estar apoyados (si vuelven a juntarse, es un choque)
          if (Cp < -UMBRAL) { delete modo.pares[clave]; if (anotar(`choque:${clave}`, () => choque(i, j, zeno))) hubo = true; }
          else if (Cp > UMBRAL) delete modo.pares[clave];
          else if (Cp < -1e-12) { proyectar(grad, Cp); hubo = true; }
        } else if (!excluir.has('par:' + clave) && Cp < -1e-12 && (C <= TOL_HUECO || (C <= tolContacto(R) && Cp >= -UMBRAL))) {
          // Se tocan y se acercan: choque (si es lento, quedan apoyados)
          if (anotar(`choque:${clave}`, () => choque(i, j, zeno))) hubo = true;
        }
      }
      for (let i = 0; i < S.n; i++) {
        const ri = radio(S, i), p = [y[4 * i], y[4 * i + 1]];
        S.sup.forEach((sup, js) => {
          const clave = `${i}:${js}`, actual = modo.contactos[clave];
          const { C, Cp, grad } = restriccionSuperficie(sup, i, ri).evaluar(y);
          if (actual) {
            // Apoyada: un impulso hacia la superficie es un choque; uno que la
            // aleja la despega; un resto lento se quita sin evento
            if (Cp < -UMBRAL) {
              delete modo.contactos[clave];
              if (anotar(`impacto:${clave}`, () => impacto(i, js, zeno))) hubo = true;
              if (modo.contactos[clave] && actual.pegado) modo.contactos[clave].pegado = true;
            } else if (Cp > UMBRAL) delete modo.contactos[clave];
            else if (Cp < -1e-12) { proyectar(grad, Cp); hubo = true; }
            return;
          }
          if (excluir.has('sup:' + clave)) return;
          if (C < -TOL_PENETRACION || margenSuperficie(sup, p) < 0) return;
          if (Cp < -1e-12 && (C <= TOL_HUECO || (C <= tolContacto(ri) && Cp >= -UMBRAL))) {
            if (anotar(`impacto:${clave}`, () => impacto(i, js, zeno))) hubo = true;
          }
        });
      }
      if (!hubo) break;
    }
  };
  resolverSimultaneos(false);
  revisarDespegues();

  // Los eventos del clavo no son monótonos (cambian de forma al entrar en el
  // alcance de la cuerda): con clavos, el paso se acota también por la duración
  const hayClavos = S.con.some(c => c.clavos && c.clavos.length);
  /** @type {null | {t: number, motivo: string}} */
  let incompleta = null;
  // Eventos descartados (un cruce sin choque): se silencian durante una pausa
  // muy breve para que no se repitan en el mismo instante
  let silencio = new Set();
  while (t < DUR - 1e-12 && k < LIMITE) {
    k++;
    const restr = restriccionesDelModo(S, modo);
    const m = modo;
    // Caché de la última evaluación: f(tR, yR) y los eventos en tR comparten arreglo
    /** @type {number[] | null} */
    let ultY = null;
    /** @type {any} */
    let ultD = null;
    const din = (/** @type {number[]} */ yy) => { if (yy !== ultY) { ultD = dinamica(S, m, yy, restr); ultY = yy; } return ultD; };
    const f = (tt, yy) => {
      const { acc } = din(yy);
      const d = new Array(yy.length);
      for (let i = 0; i < S.n; i++) { d[4 * i] = yy[4 * i + 2]; d[4 * i + 1] = yy[4 * i + 3]; d[4 * i + 2] = acc[2 * i]; d[4 * i + 3] = acc[2 * i + 1]; }
      return d;
    };
    // Paso máximo acotado: un evento cuya función baja y vuelve a subir dentro de un
    // paso (dos partículas que se cruzan) no se detecta por el signo en los extremos.
    const silenciados = silencio;
    silencio = new Set();
    const tHasta = silenciados.size ? Math.min(DUR, t + PAUSA) : DUR;
    const sol = integrar(f, t, y, tHasta, {
      rtol: RTOL, atol: RTOL * 1e-2, maxPasos: 200000, hMaxDe,
      eventos: eventosDelModo(S, modo, restr, y, din).filter(e => !silenciados.has(e.nombre)),
      hMax: escena.pasoMax ?? (hayClavos ? Math.max(1e-3, DUR / 400) : undefined),
    });
    const tFin = sol.t[sol.t.length - 1];
    tramos.push({ t0: t, t1: tFin, sol, modo: copiarModo(modo) });
    t = tFin; y = sol.y[sol.y.length - 1].slice();
    if (sol.estado !== 'evento') {
      if (sol.estado !== 'completo') { incompleta = { t, motivo: `El integrador se detuvo (${sol.estado}).` }; break; }
      continue;     // llegó al final, o al final de la pausa
    }
    const ev = sol.eventos[sol.eventos.length - 1];
    const nombre = ev.nombre || '';
    const K0 = energiaCinetica(S, y);
    const zeno = k > LIMITE - 10;
    modo = copiarModo(modo);
    const activasAntes = activas(modo);
    const partes = nombre.split(':');
    const excluir = new Set();
    let descripcion = '';
    if (partes[0] === 'impacto') {
      const i = Number(partes[1]), js = Number(partes[2]);
      const { C } = restriccionSuperficie(S.sup[js], i, radio(S, i)).evaluar(y);
      // Si el evento lo disparó el borde (la partícula entra en la extensión de
      // la superficie estando detrás, C < 0), o no se acerca, no hay choque.
      // Dentro de la extensión es un impacto aunque haya un solape pequeño.
      const porBorde = margenSuperficie(S.sup[js], [y[4 * i], y[4 * i + 1]]) <= TOL_HUECO && C < -TOL_PENETRACION;
      descripcion = porBorde ? '' : impacto(i, js, zeno);
      if (!descripcion) silencio.add(nombre);
    } else if (partes[0] === 'despegue') {
      const clave = `${partes[1]}:${partes[2]}`;
      excluir.add('sup:' + clave);
      delete modo.contactos[clave];
      descripcion = `Se despega (${S.P[Number(partes[1])].id})`;
    } else if (partes[0] === 'fin') {
      const clave = `${partes[1]}:${partes[2]}`;
      excluir.add('sup:' + clave);
      delete modo.contactos[clave];
      descripcion = `Sale del borde (${S.P[Number(partes[1])].id})`;
    } else if (partes[0] === 'vt0') {
      const clave = `${partes[1]}:${partes[2]}`, i = Number(partes[1]), s = modo.contactos[clave];
      s.pegado = true;
      const restr2 = restriccionesDelModo(S, modo);
      const L = dinamica(S, modo, y, restr2).lambdas, sup = S.sup[s.sup];
      // ¿La fricción estática alcanza para mantenerlo quieto?
      if ((sup.muS ?? sup.mu) * Math.max(0, L[`contacto:${clave}`]) < Math.abs(L[`pegado:${clave}`])) s.pegado = false;
      descripcion = s.pegado ? `Se detiene (${S.P[i].id})` : `Invierte el deslizamiento (${S.P[i].id})`;
      if (!s.pegado) {
        // Empuja un poco para que el evento no se repita en el mismo instante
        const tg = tangente(sup, [y[4 * i], y[4 * i + 1]]), a = dinamica(S, modo, y, restr2).acc;
        const sgn = Math.sign(tg[0] * a[2 * i] + tg[1] * a[2 * i + 1]) || 1;
        y[4 * i + 2] += sgn * 1e-12 * tg[0]; y[4 * i + 3] += sgn * 1e-12 * tg[1];
      }
    } else if (partes[0] === 'desliza') {
      modo.contactos[`${partes[1]}:${partes[2]}`].pegado = false;
      descripcion = `Empieza a deslizar (${S.P[Number(partes[1])].id})`;
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
        // Sentido de giro alrededor del clavo (para detectar el desenganche)
        const dp = sub(p, nail);
        est.sentido.push(Math.sign(dp[0] * v[1] - dp[1] * v[0]) * Math.sign(dn[0] * dp[1] - dn[1] * dp[0]) || 1);
        descripcion = `La cuerda ${c.id} toca el clavo`;
      } else {
        // La partícula cruzó la recta del clavo del otro lado del pivote: la cuerda no lo toca
        silencio.add(nombre);
      }
    } else if (partes[0] === 'desengancha') {
      const c = S.con.find(x => x.id === partes[1]), est = modo.cuerdas[c.id];
      const kk = est.clavos.pop(); est.sentido.pop();
      const prev = est.clavos.length ? c.clavos[est.clavos[est.clavos.length - 1]] : c.ancla;
      est.Lrest += norm(sub(c.clavos[kk], prev));
      descripcion = `La cuerda ${c.id} se suelta del clavo`;
    } else if (partes[0] === 'choque') {
      descripcion = choque(Number(partes[1]), Number(partes[2]), zeno);
      if (!descripcion) silencio.add(nombre);
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
    // Energía del instante que no registró ningún choque simultáneo: la del
    // evento principal más la de las proyecciones sin evento
    const resto = K0 - energiaCinetica(S, y) - perdidaAnotada;
    if (resto > 0) {
      const destino = eventos[iEvento] ?? eventos[eventos.length - 1];
      if (destino) destino.perdida += resto;
    }
    // Apoyos, pares y cuerdas que se pierden en este instante por otra causa
    // (un choque simultáneo, una superficie nueva): también son eventos
    const propia = { despegue: 'contacto', fin: 'contacto', separa: 'par', floja: 'cuerda' }[partes[0]];
    const activasDespues = activas(modo);
    for (const a of activasAntes) {
      if (activasDespues.has(a) || (propia && a === `${propia}:${partes.slice(1).join(':')}`)) continue;
      const [tipo, ...resto2] = a.split(':');
      let nombreEv = '', claveEv = '';
      if (tipo === 'contacto') {
        const i = Number(resto2[0]), sup = S.sup[Number(resto2[1])];
        const borde = margenSuperficie(sup, [y[4 * i], y[4 * i + 1]]) <= 1e-6;
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
  }
  if (!incompleta && t < DUR - 1e-9) incompleta = { t, motivo: `Se alcanzó el límite de ${LIMITE} eventos.` };
  return { tramos, eventos, escena, S: { n: S.n, ids: S.P.map(p => p.id), m: S.P.map(p => p.m) }, duracion: DUR, tFin: t, incompleta };
}

/** Tirón de una cuerda que se tensa: se anula la velocidad de alejamiento (inelástico). */
function aplicarTiron(S, c, modo, y) {
  const r = c.tipo === 'polea' ? restriccionPolea(c) : restriccionDistancia(c, modo, false);
  const { Cp, grad } = r.evaluar(y);
  if (Cp >= 0) return;   // no se aleja: no hay tirón
  // Impulso λ en la dirección del gradiente que lleva Ċ a 0
  let den = 0;
  for (const [i, gx, gy] of grad) den += (gx * gx + gy * gy) / S.P[i].m;
  const L = -Cp / den;
  for (const [i, gx, gy] of grad) { y[4 * i + 2] += L * gx / S.P[i].m; y[4 * i + 3] += L * gy / S.P[i].m; }
}

/**
 * Estado de todas las partículas en el instante t.
 * @param {ReturnType<typeof simularMecanica>} sim @param {number} t
 * @returns {Array<{id: string, x: number, y: number, vx: number, vy: number}>}
 */
export function estadoMecanica(sim, t) {
  // Último tramo que empieza en t o antes (búsqueda binaria: puede haber miles)
  const T = sim.tramos;
  let lo = 0, hi = T.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (T[mid].t0 <= t + 1e-15) lo = mid; else hi = mid - 1; }
  const tr = T[lo];
  const tt = Math.max(tr.t0, Math.min(t, tr.t1));
  const y = interpolar(tr.sol, tt);
  return sim.S.ids.map((id, i) => ({ id, x: y[4 * i], y: y[4 * i + 1], vx: y[4 * i + 2], vy: y[4 * i + 3] }));
}

/**
 * Energía mecánica en t: cinética, potencial gravitatoria, elástica y la de
 * las fuerzas constantes aplicadas (U_F = −F·r, conservativa como un campo
 * uniforme: así el trabajo de F no se confunde con energía disipada).
 * @param {ReturnType<typeof simularMecanica>} sim @param {number} t
 */
export function energiaMecanica(sim, t) {
  const e = sim.escena, g = e.g ?? [0, -9.8], est = estadoMecanica(sim, t);
  let K = 0, Ug = 0, Ue = 0, UF = 0;
  est.forEach((s, i) => {
    const m = sim.S.m[i], F = e.particulas[i].F;
    K += 0.5 * m * (s.vx * s.vx + s.vy * s.vy);
    Ug -= m * (g[0] * s.x + g[1] * s.y);
    if (F) UF -= F[0] * s.x + F[1] * s.y;
  });
  const pos = Object.fromEntries(est.map(s => [s.id, [s.x, s.y]]));
  for (const c of e.conectores || []) {
    if (c.tipo !== 'resorte') continue;
    const pb = c.b != null ? pos[c.b] : c.ancla;
    Ue += 0.5 * c.k * (norm(sub(pos[c.a], pb)) - c.L0) ** 2;
  }
  return { K, Ug, Ue, UF, E: K + Ug + Ue + UF };
}
