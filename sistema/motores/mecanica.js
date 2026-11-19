/* ==========================================================================
   Volta — motor general de Mecánica (partículas con restricciones y eventos)

   Autómata híbrido:
   - Estado: posición y velocidad de cada partícula.
   - Modo: qué restricciones unilaterales están activas (contacto con una
     superficie, cuerda tensa). Las bilaterales (varillas) siempre lo están.
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
       · velocidad tangencial nula con fricción        → reposo o sigue
   Regla post-Zeno: cerca del límite de eventos se declara el contacto.
   Puro: sin DOM.
   ========================================================================== */
import { integrar, interpolar } from '../nucleo/integradores.js';

/**
 * @typedef {Object} Particula
 * @property {string} id
 * @property {number} m                Masa (kg)
 * @property {[number, number]} p      Posición (m)
 * @property {[number, number]} v      Velocidad (m/s)
 * @property {number} [radio=0]        Radio para choques entre partículas (m)
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
  for (const [i, s] of Object.entries(modo.contactos)) {
    const sup = S.sup[s.sup], iP = Number(i);
    lista.push({ clave: `contacto:${iP}`, unilateral: true, ...restriccionSuperficie(sup, iP) });
  }
  for (const c of S.con) {
    if (c.tipo === 'varilla') lista.push({ clave: `varilla:${c.id}`, unilateral: false, ...restriccionDistancia(c, modo, true) });
    if (c.tipo === 'cuerda' && modo.cuerdas[c.id]?.tensa) lista.push({ clave: `cuerda:${c.id}`, unilateral: true, ...restriccionDistancia(c, modo, false) });
    if (c.tipo === 'polea' && modo.cuerdas[c.id]?.tensa) lista.push({ clave: `polea:${c.id}`, unilateral: true, ...restriccionPolea(c) });
  }
  return lista;
}

function restriccionSuperficie(sup, i) {
  if (sup.tipo === 'segmento') {
    const { n } = sup.geo;
    return {
      evaluar(y) {
        const p = [y[4 * i], y[4 * i + 1]], v = [y[4 * i + 2], y[4 * i + 3]];
        return { C: dot(n, sub(p, sup.a)), Cp: dot(n, v), grad: [[i, n[0], n[1]]], jdv: 0 };
      },
    };
  }
  // Arco: exterior C = |d| − r; interior C = r − |d|
  const sg = sup.cara === 'interior' ? -1 : 1;
  return {
    evaluar(y) {
      const d = [y[4 * i] - sup.c[0], y[4 * i + 1] - sup.c[1]], v = [y[4 * i + 2], y[4 * i + 3]];
      const D = norm(d), u = [d[0] / D, d[1] / D], uv = dot(u, v);
      return { C: sg * (D - sup.r), Cp: sg * uv, grad: [[i, sg * u[0], sg * u[1]]], jdv: sg * (dot(v, v) - uv * uv) / D };
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
    for (const [i, s] of Object.entries(modo.contactos)) {
      const sup = S.sup[s.sup], iP = Number(i);
      if (!(sup.mu > 0) || s.pegado) continue;
      const N = Math.max(0, lambdasPrevias[`contacto:${iP}`] || 0);
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
    for (const [i, s] of Object.entries(modo.contactos)) {
      if (!s.pegado) continue;
      const iP = Number(i), t = tangente(S.sup[s.sup], [y[4 * iP], y[4 * iP + 1]]);
      const vt = t[0] * y[4 * iP + 2] + t[1] * y[4 * iP + 3];
      pegadas.push({ clave: `pegado:${iP}`, evaluar: () => ({ C: 0, Cp: vt, grad: [[iP, t[0], t[1]]], jdv: 0 }) });
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

function eventosDelModo(S, modo, restr) {
  /** @type {import('../nucleo/integradores.js').DefinicionEvento[]} */
  const ev = [];
  const n = S.n;
  // Impactos con superficies no activas
  for (let i = 0; i < n; i++) {
    if (modo.contactos[i]) continue;
    S.sup.forEach((sup, js) => {
      const r = restriccionSuperficie(sup, i);
      ev.push({
        nombre: `impacto:${i}:${js}`, direccion: -1, terminal: true,
        g: (t, y) => {
          const { C } = r.evaluar(y);
          // Solo cuenta dentro de la extensión de la superficie
          return dentroDeSuperficie(sup, [y[4 * i], y[4 * i + 1]]) ? C : 1;
        },
      });
    });
  }
  // Contactos activos: despegue (λ → 0), fin del segmento, fricción
  for (const [i, s] of Object.entries(modo.contactos)) {
    const iP = Number(i), sup = S.sup[s.sup];
    ev.push({
      nombre: `despegue:${iP}`, direccion: -1, terminal: true,
      g: (t, y) => (dinamica(S, modo, y, restr).lambdas[`contacto:${iP}`] ?? 0),
    });
    if (sup.tipo === 'segmento' || sup.a0 != null) {
      ev.push({ nombre: `fin:${iP}`, direccion: -1, terminal: true, g: (t, y) => margenSuperficie(sup, [y[4 * iP], y[4 * iP + 1]]) });
    }
    if (sup.mu > 0) {
      if (s.pegado) {
        // Deja de estar pegado cuando la fricción necesaria supera μs·N
        ev.push({
          nombre: `desliza:${iP}`, direccion: -1, terminal: true,
          g: (t, y) => { const L = dinamica(S, modo, y, restr).lambdas; return (sup.muS ?? sup.mu) * Math.max(0, L[`contacto:${iP}`]) - Math.abs(L[`pegado:${iP}`]); },
        });
      } else {
        ev.push({
          nombre: `vt0:${iP}`, direccion: 0, terminal: true,
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
      ev.push({ nombre: `floja:${c.id}`, direccion: -1, terminal: true, g: (t, y) => dinamica(S, modo, y, restr).lambdas[`${c.tipo}:${c.id}`] ?? 0 });
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
            const dp = sub(p, punto);
            if (dot(dn, dp) <= 0) return 1;         // el clavo está del otro lado del pivote
            return dn[0] * dp[1] - dn[1] * dp[0];   // cruce de la cuerda por el clavo
          },
        });
      });
    }
  }
  // Choques entre partículas con radio
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const R = (S.P[i].radio || 0) + (S.P[j].radio || 0);
    if (!(R > 0)) continue;
    ev.push({ nombre: `choque:${i}:${j}`, direccion: -1, terminal: true, g: (t, y) => Math.hypot(y[4 * i] - y[4 * j], y[4 * i + 1] - y[4 * j + 1]) - R });
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
  /** @type {{contactos: Record<string, any>, cuerdas: Record<string, any>}} */
  let modo = { contactos: {}, cuerdas: {} };
  for (const c of S.con) {
    if (c.tipo === 'cuerda' || c.tipo === 'polea') {
      const r = c.tipo === 'polea' ? restriccionPolea(c) : restriccionDistancia(c, { cuerdas: { [c.id]: { clavos: [] } } }, false);
      modo.cuerdas[c.id] = { tensa: Math.abs(r.evaluar(y).C) < 1e-9, clavos: [], sentido: [], Lrest: c.L };
    }
  }
  // Contactos iniciales: partícula apoyada sobre una superficie (C ≈ 0 y sin velocidad hacia fuera)
  S.sup.forEach((sup, js) => {
    for (let i = 0; i < S.n; i++) {
      const { C, Cp } = restriccionSuperficie(sup, i).evaluar(y);
      if (Math.abs(C) < 1e-9 && Math.abs(Cp) < 1e-9 && dentroDeSuperficie(sup, [y[4 * i], y[4 * i + 1]])) modo.contactos[i] = { sup: js, pegado: false };
    }
  });

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
      for (const i of Object.keys(modo.contactos)) {
        if ((lambdas[`contacto:${i}`] ?? 0) < -UMBRAL_LAMBDA) { delete modo.contactos[i]; cambio = true; }
      }
      for (const c of S.con) if ((c.tipo === 'cuerda' || c.tipo === 'polea') && modo.cuerdas[c.id].tensa && (lambdas[`${c.tipo}:${c.id}`] ?? 0) < -UMBRAL_LAMBDA) { modo.cuerdas[c.id].tensa = false; cambio = true; }
    }
  };
  revisarDespegues();
  // Fricción estática al arrancar: un apoyo en reposo queda pegado si μs alcanza
  for (const [i, s] of Object.entries(modo.contactos)) {
    const sup = S.sup[s.sup];
    if (!(sup.mu > 0)) continue;
    const iP = Number(i), tg = tangente(sup, [y[4 * iP], y[4 * iP + 1]]);
    if (Math.abs(tg[0] * y[4 * iP + 2] + tg[1] * y[4 * iP + 3]) > 1e-12) continue;
    s.pegado = true;
    const L = dinamica(S, modo, y, restriccionesDelModo(S, modo)).lambdas;
    if ((sup.muS ?? sup.mu) * Math.max(0, L[`contacto:${iP}`]) < Math.abs(L[`pegado:${iP}`])) s.pegado = false;
  }

  while (t < DUR - 1e-12 && k < LIMITE) {
    k++;
    const restr = restriccionesDelModo(S, modo);
    const m = modo;
    const f = (tt, yy) => {
      const { acc } = dinamica(S, m, yy, restr);
      const d = new Array(yy.length);
      for (let i = 0; i < S.n; i++) { d[4 * i] = yy[4 * i + 2]; d[4 * i + 1] = yy[4 * i + 3]; d[4 * i + 2] = acc[2 * i]; d[4 * i + 3] = acc[2 * i + 1]; }
      return d;
    };
    // Paso máximo acotado: un evento cuya función baja y vuelve a subir dentro de un
    // paso (dos partículas que se cruzan) no se detecta por el signo en los extremos.
    const sol = integrar(f, t, y, DUR, { rtol: RTOL, atol: RTOL * 1e-2, eventos: eventosDelModo(S, modo, restr), maxPasos: 200000, hMax: escena.pasoMax ?? Math.max(1e-3, DUR / 400) });
    const tFin = sol.t[sol.t.length - 1];
    tramos.push({ t0: t, t1: tFin, sol, modo: copiarModo(modo) });
    t = tFin; y = sol.y[sol.y.length - 1].slice();
    if (sol.estado !== 'evento') {
      if (sol.estado !== 'completo') throw new Error(`El integrador se detuvo (${sol.estado}) en t = ${t}.`);
      break;
    }
    const ev = sol.eventos[sol.eventos.length - 1];
    const nombre = ev.nombre || '';
    const K0 = energiaCinetica(S, y);
    const zeno = k > LIMITE - 10;
    modo = copiarModo(modo);
    const partes = nombre.split(':');
    let descripcion = '';
    if (partes[0] === 'impacto') {
      const i = Number(partes[1]), js = Number(partes[2]), sup = S.sup[js];
      const n = normalLibre(sup, [y[4 * i], y[4 * i + 1]]);
      const v = [y[4 * i + 2], y[4 * i + 3]], vn = dot(v, n);
      const e = sup.e ?? 1, vn2 = -e * vn;
      if (vn >= 0) {
        // Cruce espurio (la partícula no se acerca a la superficie): se ignora
        descripcion = '';
      } else if (vn2 < UMBRAL || zeno) {
        y[4 * i + 2] -= vn * n[0]; y[4 * i + 3] -= vn * n[1];
        modo.contactos[i] = { sup: js, pegado: false };
        descripcion = `Choque y contacto con ${sup.id}`;
      } else {
        y[4 * i + 2] += (vn2 - vn) * n[0]; y[4 * i + 3] += (vn2 - vn) * n[1];
        descripcion = `Choque con ${sup.id}`;
      }
    } else if (partes[0] === 'despegue') {
      delete modo.contactos[partes[1]];
      descripcion = `Se despega (${S.P[Number(partes[1])].id})`;
    } else if (partes[0] === 'fin') {
      delete modo.contactos[partes[1]];
      descripcion = `Sale del borde (${S.P[Number(partes[1])].id})`;
    } else if (partes[0] === 'vt0') {
      const i = Number(partes[1]), s = modo.contactos[i];
      s.pegado = true;
      const restr2 = restriccionesDelModo(S, modo);
      const L = dinamica(S, modo, y, restr2).lambdas, sup = S.sup[s.sup];
      // ¿La fricción estática alcanza para mantenerlo quieto?
      if ((sup.muS ?? sup.mu) * Math.max(0, L[`contacto:${i}`]) < Math.abs(L[`pegado:${i}`])) s.pegado = false;
      descripcion = s.pegado ? `Se detiene (${S.P[i].id})` : `Invierte el deslizamiento (${S.P[i].id})`;
      if (!s.pegado) {
        // Empuja un poco para que el evento no se repita en el mismo instante
        const tg = tangente(sup, [y[4 * i], y[4 * i + 1]]), a = dinamica(S, modo, y, restr2).acc;
        const sgn = Math.sign(tg[0] * a[2 * i] + tg[1] * a[2 * i + 1]) || 1;
        y[4 * i + 2] += sgn * 1e-12 * tg[0]; y[4 * i + 3] += sgn * 1e-12 * tg[1];
      }
    } else if (partes[0] === 'desliza') {
      modo.contactos[partes[1]].pegado = false;
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
      est.Lrest = L - norm(dn); est.clavos.push(kk);
      // Sentido de giro alrededor del clavo (para detectar el desenganche)
      const dp = sub(p, nail);
      est.sentido.push(Math.sign(dp[0] * v[1] - dp[1] * v[0]) * Math.sign(dn[0] * dp[1] - dn[1] * dp[0]) || 1);
      descripcion = `La cuerda ${c.id} toca el clavo`;
    } else if (partes[0] === 'desengancha') {
      const c = S.con.find(x => x.id === partes[1]), est = modo.cuerdas[c.id];
      const kk = est.clavos.pop(); est.sentido.pop();
      const prev = est.clavos.length ? c.clavos[est.clavos[est.clavos.length - 1]] : c.ancla;
      est.Lrest += norm(sub(c.clavos[kk], prev));
      descripcion = `La cuerda ${c.id} se suelta del clavo`;
    } else if (partes[0] === 'choque') {
      const i = Number(partes[1]), j = Number(partes[2]);
      const e = escena.eParticulas ?? 1, mi = S.P[i].m, mj = S.P[j].m;
      const d = [y[4 * i] - y[4 * j], y[4 * i + 1] - y[4 * j + 1]], D = norm(d), n = [d[0] / D, d[1] / D];
      const vrel = (y[4 * i + 2] - y[4 * j + 2]) * n[0] + (y[4 * i + 3] - y[4 * j + 3]) * n[1];
      if (vrel < 0) {
        const J = -(1 + e) * vrel / (1 / mi + 1 / mj);
        y[4 * i + 2] += J * n[0] / mi; y[4 * i + 3] += J * n[1] / mi;
        y[4 * j + 2] -= J * n[0] / mj; y[4 * j + 3] -= J * n[1] / mj;
      }
      descripcion = `Choque entre ${S.P[i].id} y ${S.P[j].id}`;
    }
    const perdida = K0 - energiaCinetica(S, y);
    if (descripcion) eventos.push({ t, nombre: descripcion, clave: nombre, perdida: perdida > 0 ? perdida : 0, y: y.slice() });
    revisarDespegues();
  }
  if (t < DUR - 1e-9) throw new Error(`Se alcanzó el límite de ${LIMITE} eventos en t = ${t}.`);
  return { tramos, eventos, escena, S: { n: S.n, ids: S.P.map(p => p.id), m: S.P.map(p => p.m) }, duracion: DUR };
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
  let tr = sim.tramos[0];
  for (const q of sim.tramos) if (q.t0 <= t + 1e-15) tr = q;
  const tt = Math.max(tr.t0, Math.min(t, tr.t1));
  const y = interpolar(tr.sol, tt);
  return sim.S.ids.map((id, i) => ({ id, x: y[4 * i], y: y[4 * i + 1], vx: y[4 * i + 2], vy: y[4 * i + 3] }));
}

/**
 * Energía mecánica en t: cinética, potencial gravitatoria y elástica.
 * @param {ReturnType<typeof simularMecanica>} sim @param {number} t
 */
export function energiaMecanica(sim, t) {
  const e = sim.escena, g = e.g ?? [0, -9.8], est = estadoMecanica(sim, t);
  let K = 0, Ug = 0, Ue = 0;
  est.forEach((s, i) => {
    const m = sim.S.m[i];
    K += 0.5 * m * (s.vx * s.vx + s.vy * s.vy);
    Ug -= m * (g[0] * s.x + g[1] * s.y);
  });
  const pos = Object.fromEntries(est.map(s => [s.id, [s.x, s.y]]));
  for (const c of e.conectores || []) {
    if (c.tipo !== 'resorte') continue;
    const pb = c.b != null ? pos[c.b] : c.ancla;
    Ue += 0.5 * c.k * (norm(sub(pos[c.a], pb)) - c.L0) ** 2;
  }
  return { K, Ug, Ue, E: K + Ug + Ue };
}
