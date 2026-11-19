/* ==========================================================================
   Volta — motor de electrostática (cargas puntuales, modo 3D con vista plana)
   - Campo y potencial por superposición exacta de la ley de Coulomb (1/r²).
   - Fuerza sobre una carga y energía potencial del sistema.
   - Flujo del campo por una esfera (ley de Gauss, cuadratura 3D).
   - Dinámica de cargas libres entre cargas fijas (y entre ellas) con
     Dormand–Prince 5(4) del núcleo; eventos localizados por Brent sobre la
     salida densa: "Pasa por O", cruces del eje x, alturas extremas, puntos de
     retorno y choques.
   Puro: sin DOM. Lo usan la pantalla de Electrostática y las pruebas.
   Unidades SI en todo el motor.
   ========================================================================== */
import { integrar, interpolar, gaussLegendre } from '../nucleo/integradores.js';

/** Constante de Coulomb k = 1/(4πε₀) (N·m²/C², CODATA 2018). */
export const K_COULOMB = 8.9875517923e9;
/** Permitividad del vacío ε₀ = 1/(4πk) (F/m). */
export const EPSILON_0 = 1 / (4 * Math.PI * K_COULOMB);
/** Distancia bajo la cual una carga no contribuye al campo en ese punto (m). */
const R_MIN = 1e-9;

/**
 * @typedef {Object} CargaPuntual
 * @property {number} x  (m)
 * @property {number} y  (m)
 * @property {number} q  (C)
 * @property {number} [z=0] (m) solo para el flujo 3D
 * @property {string} [id]
 * @property {string} [nombre]
 */

/**
 * @typedef {Object} CargaLibre
 * @property {number} x   Posición inicial (m)
 * @property {number} y
 * @property {number} q   (C)
 * @property {number} m   Masa (kg)
 * @property {number} [vx=0] Velocidad inicial (m/s)
 * @property {number} [vy=0]
 * @property {string} [id]
 * @property {string} [nombre]
 */

/**
 * @typedef {Object} EventoCarga
 * @property {number} t
 * @property {string} nombre  Texto para la interfaz ("Pasa por O", "Punto de retorno"…)
 * @property {'inicio'|'eje'|'extremo'|'retorno'|'choque'} tipo
 * @property {string} carga   id de la carga libre
 * @property {number} x
 * @property {number} y
 * @property {number} v       Rapidez de esa carga (m/s)
 * @property {string} [contra] id de la carga con la que choca
 */

// ---------------------------------------------------------------------------
// Campo, potencial, fuerza y energía
// ---------------------------------------------------------------------------

/**
 * Campo eléctrico en (x, y) por superposición: E = Σ k·qᵢ·(r − rᵢ)/|r − rᵢ|³.
 * Una carga a menos de 1 nm del punto no contribuye (su propio campo).
 * @param {CargaPuntual[]} cargas
 * @param {number} x
 * @param {number} y
 * @returns {[number, number]} [Ex, Ey] (V/m)
 */
export function campo(cargas, x, y) {
  let ex = 0, ey = 0;
  for (const c of cargas) {
    const dx = x - c.x, dy = y - c.y, r2 = dx * dx + dy * dy, r = Math.sqrt(r2);
    if (r < R_MIN) continue;
    const f = K_COULOMB * c.q / (r2 * r);
    ex += f * dx; ey += f * dy;
  }
  return [ex, ey];
}

/**
 * Potencial en (x, y) con referencia en el infinito: V = Σ k·qᵢ/|r − rᵢ|.
 * La distancia se acota por debajo a 1 nm.
 * @param {CargaPuntual[]} cargas
 * @param {number} x
 * @param {number} y
 * @returns {number} V (V)
 */
export function potencial(cargas, x, y) {
  let v = 0;
  for (const c of cargas) v += K_COULOMB * c.q / Math.max(R_MIN, Math.hypot(x - c.x, y - c.y));
  return v;
}

/**
 * Fuerza eléctrica sobre una carga debida a otras: F = q·E(otras).
 * @param {CargaPuntual} carga
 * @param {CargaPuntual[]} otras  (sin la propia carga)
 * @returns {[number, number]} [Fx, Fy] (N)
 */
export function fuerzaSobre(carga, otras) {
  const [ex, ey] = campo(otras, carga.x, carga.y);
  return [carga.q * ex, carga.q * ey];
}

/**
 * Energía potencial eléctrica del sistema: U = Σᵢ<ⱼ k·qᵢ·qⱼ/rᵢⱼ.
 * @param {CargaPuntual[]} cargas
 * @returns {number} U (J)
 */
export function energiaPotencial(cargas) {
  let u = 0;
  for (let i = 0; i < cargas.length; i++) {
    for (let j = i + 1; j < cargas.length; j++) {
      const a = cargas[i], b = cargas[j];
      u += K_COULOMB * a.q * b.q / Math.max(R_MIN, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return u;
}

/**
 * Flujo del campo eléctrico por una esfera de radio R (ley de Gauss en 3D;
 * las cargas pueden estar fuera del plano con su z). Cuadratura de
 * Gauss–Legendre en cos θ y regla del trapecio (exponencial en funciones
 * periódicas) en φ. Para cargas interiores alejadas de la superficie da
 * Q_enc/ε₀ con error relativo del orden de 1e-12.
 * @param {CargaPuntual[]} cargas
 * @param {{x: number, y: number, z?: number}} centro
 * @param {number} R
 * @param {number} [n=48] Nodos en cos θ (2n en φ)
 * @returns {number} Φ (V·m)
 */
export function flujoEsfera(cargas, centro, R, n = 48) {
  const { x: u, w } = gaussLegendre(n), nf = 2 * n, cz = centro.z || 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const ct = u[i], st = Math.sqrt(1 - ct * ct);
    let anillo = 0;
    for (let j = 0; j < nf; j++) {
      const ph = 2 * Math.PI * j / nf, nx = st * Math.cos(ph), ny = st * Math.sin(ph), nz = ct;
      const px = centro.x + R * nx, py = centro.y + R * ny, pz = cz + R * nz;
      let en = 0;
      for (const c of cargas) {
        const dx = px - c.x, dy = py - c.y, dz = pz - (c.z || 0), r2 = dx * dx + dy * dy + dz * dz;
        en += K_COULOMB * c.q * (dx * nx + dy * ny + dz * nz) / (r2 * Math.sqrt(r2));
      }
      anillo += en;
    }
    total += w[i] * anillo * (2 * Math.PI / nf);
  }
  return total * R * R;
}

// ---------------------------------------------------------------------------
// Dinámica de cargas libres
// ---------------------------------------------------------------------------

/**
 * Componentes de una velocidad dada por su rapidez y su ángulo sobre el eje
 * x (grados). En los múltiplos de 90° las componentes son exactas: con
 * cos(−π/2) ≈ 6·10⁻¹⁷, una carga lanzada "hacia abajo" sobre un eje de
 * simetría saldría con vx ≠ 0 y, si ese movimiento es inestable (la
 * partícula de MEXT 2020 P2 entre A y B), el error de redondeo crecería
 * hasta sacarla del eje.
 * @param {number} v       Rapidez (m/s)
 * @param {number} grados  Ángulo (°)
 * @returns {[number, number]} [vx, vy]
 */
export function componentesVelocidad(v, grados) {
  const g = ((grados % 360) + 360) % 360;
  if (g % 90 === 0) return /** @type {[number, number]} */ ([[v, 0], [0, v], [-v, 0], [0, -v]][g / 90]);
  const a = grados * Math.PI / 180;
  return [v * Math.cos(a), v * Math.sin(a)];
}

/**
 * Simula cargas libres bajo el campo de cargas fijas y (por defecto) de las
 * demás libres. Estado: [x₁, y₁, vx₁, vy₁, x₂, …].
 *
 * Eventos de cada carga libre (nombres para la interfaz):
 * - cruce de y = 0: "Pasa por O" si |x| < 10⁻³·L, si no "Cruza el eje x";
 *   cruce de x = 0 con |y| < 10⁻³·L: "Pasa por O" (movimiento por el eje x);
 * - v_y = 0: "Altura mínima" o "Altura máxima"; si además la rapidez es
 *   < 10⁻³·v_ref, "Punto de retorno" (o "Vuelve al inicio" si está a menos de
 *   10⁻³·L del punto de partida);
 * - mínimo de rapidez (v·a pasa de − a +) con rapidez < 10⁻³·v_ref: punto de
 *   retorno de un movimiento en cualquier dirección;
 * - choque (terminal): distancia a otra carga menor que radioChoque.
 * L y v_ref son la longitud y la rapidez características de la escena.
 *
 * @param {{fijas: CargaPuntual[], libres: CargaLibre[]}} escena
 * @param {Object} o
 * @param {number} o.duracion           Tiempo simulado (s)
 * @param {number} [o.rtol=1e-10]
 * @param {number} [o.atol=1e-10]
 * @param {number} [o.hMax]             Paso máximo (s); acota la separación de las muestras
 * @param {number} [o.maxPasos=200000]
 * @param {number} [o.radioChoque=0.02] Distancia de choque (m)
 * @param {number} [o.escalaLongitud]   L; por defecto, la distancia inicial a la carga más cercana
 * @param {number} [o.escalaVelocidad]  v_ref; por defecto √(k·|q|·Σ|qⱼ|/(m·L))
 * @param {boolean} [o.interaccionLibres=true] Las cargas libres se atraen o repelen entre sí
 */
export function simularCargas(escena, o) {
  const fijas = escena.fijas.map((c, i) => ({ id: c.id ?? `F${i + 1}`, nombre: c.nombre ?? c.id ?? `F${i + 1}`, x: c.x, y: c.y, q: c.q }));
  const libres = escena.libres.map((c, i) => ({ id: c.id ?? `L${i + 1}`, nombre: c.nombre ?? c.id ?? `L${i + 1}`, x: c.x, y: c.y, q: c.q, m: c.m, vx: c.vx || 0, vy: c.vy || 0 }));
  const N = libres.length, mutua = o.interaccionLibres !== false;
  const R = o.radioChoque ?? 0.02;
  if (!libres.every(c => c.m > 0)) throw new RangeError('simularCargas: la masa de cada carga libre tiene que ser positiva');

  // Escalas características (clasificación de eventos y tolerancia en t)
  const escalas = libres.map((c, i) => {
    const otras = [...fijas, ...libres.filter((_, j) => j !== i)];
    const dmin = Math.min(...otras.map(p => Math.hypot(p.x - c.x, p.y - c.y)));
    const L = o.escalaLongitud ?? (isFinite(dmin) && dmin > 0 ? dmin : 1);
    const Qs = otras.reduce((s, p) => s + Math.abs(p.q), 0);
    const vEst = o.escalaVelocidad ?? Math.sqrt(K_COULOMB * Math.abs(c.q) * Qs / (c.m * L));
    const v = vEst > 0 && isFinite(vEst) ? vEst : 1;     // carga neutra o sola: escala unitaria
    return { L, v, T: L / v };
  });
  const Tref = Math.min(...escalas.map(e => e.T));

  // Aceleraciones de todas las cargas libres para un estado s
  const acel = s => {
    const a = new Array(2 * N);
    for (let i = 0; i < N; i++) {
      const xi = s[4 * i], yi = s[4 * i + 1];
      let [ex, ey] = campo(fijas, xi, yi);
      if (mutua) {
        for (let j = 0; j < N; j++) {
          if (j === i) continue;
          const dx = xi - s[4 * j], dy = yi - s[4 * j + 1], r2 = dx * dx + dy * dy, r = Math.sqrt(r2);
          if (r < R_MIN) continue;
          const f = K_COULOMB * libres[j].q / (r2 * r);
          ex += f * dx; ey += f * dy;
        }
      }
      const qm = libres[i].q / libres[i].m;
      a[2 * i] = qm * ex; a[2 * i + 1] = qm * ey;
    }
    return a;
  };
  const f = (_t, s) => {
    const a = acel(s), d = new Array(4 * N);
    for (let i = 0; i < N; i++) { d[4 * i] = s[4 * i + 2]; d[4 * i + 1] = s[4 * i + 3]; d[4 * i + 2] = a[2 * i]; d[4 * i + 3] = a[2 * i + 1]; }
    return d;
  };

  // Funciones de evento; cada una lleva su descripción para clasificarla
  // después. ejeX: cruza el eje x (y = 0); ejeY: cruza el eje y (x = 0).
  /** @type {import('../nucleo/integradores.js').DefinicionEvento[]} */
  const defs = [];
  const info = [];
  for (let i = 0; i < N; i++) {
    const b = 4 * i;
    defs.push({ g: (_t, s) => s[b + 1] }); info.push({ tipo: 'ejeX', i });
    defs.push({ g: (_t, s) => s[b] }); info.push({ tipo: 'ejeY', i });
    defs.push({ g: (_t, s) => s[b + 3] }); info.push({ tipo: 'vy', i });
    defs.push({ g: (_t, s) => { const a = acel(s); return s[b + 2] * a[2 * i] + s[b + 3] * a[2 * i + 1]; }, direccion: 1 }); info.push({ tipo: 'rapidezMin', i });
    for (const c of fijas) {
      defs.push({ g: (_t, s) => Math.hypot(s[b] - c.x, s[b + 1] - c.y) - R, direccion: -1, terminal: true });
      info.push({ tipo: 'choque', i, contra: c });
    }
    if (mutua) {
      for (let j = i + 1; j < N; j++) {
        const bj = 4 * j;
        defs.push({ g: (_t, s) => Math.hypot(s[b] - s[bj], s[b + 1] - s[bj + 1]) - R, direccion: -1, terminal: true });
        info.push({ tipo: 'choque', i, contra: libres[j] });
      }
    }
  }

  const y0 = [];
  for (const c of libres) y0.push(c.x, c.y, c.vx, c.vy);
  const rap = (s, i) => Math.hypot(s[4 * i + 2], s[4 * i + 3]);

  /** @type {EventoCarga[]} */
  const eventos = libres.map((c, i) => ({ t: 0, nombre: rap(y0, i) > 0 ? 'Se lanza' : 'Se suelta', tipo: /** @type {'inicio'} */ ('inicio'), carga: c.id, x: c.x, y: c.y, v: rap(y0, i) }));

  // Una carga libre que empieza dentro del radio de choque: choque en t = 0
  /** @type {any} */
  let choqueInicial = null;
  for (let k = 0; k < defs.length && !choqueInicial; k++) {
    if (info[k].tipo === 'choque' && defs[k].g(0, y0) <= 0) {
      const { i, contra } = info[k];
      choqueInicial = { t: 0, nombre: nombreChoque(libres[i], contra, fijas.includes(contra)), tipo: 'choque', carga: libres[i].id, x: y0[4 * i], y: y0[4 * i + 1], v: rap(y0, i), contra: contra.id };
    }
  }

  const sol = integrar(f, 0, y0, choqueInicial ? 0 : o.duracion, {
    rtol: o.rtol ?? 1e-10, atol: o.atol ?? 1e-10, hMax: o.hMax, maxPasos: o.maxPasos ?? 200000,
    eventos: defs, tolT: 1e-12 * Tref,
  });

  // Clasificación de los cruces en eventos con nombre
  let choque = choqueInicial;
  if (choqueInicial) eventos.push(choqueInicial);
  const ultimoRetorno = new Array(N).fill(-Infinity), ultimoO = new Array(N).fill(null);
  for (const ev of sol.eventos) {
    const { tipo, i, contra } = info[ev.indice], s = ev.y, b = 4 * i, { L, v: vRef, T } = escalas[i];
    const x = s[b], y = s[b + 1], v = rap(s, i), id = libres[i].id;
    const base = { t: ev.t, carga: id, v };
    if (tipo === 'ejeX' || tipo === 'ejeY') {
      const enO = tipo === 'ejeX' ? Math.abs(x) < 1e-3 * L : Math.abs(y) < 1e-3 * L;
      if (tipo === 'ejeY' && !enO) continue;            // solo interesa si pasa por O
      // Si cruza ambos ejes en O, es un único evento
      const previo = ultimoO[i];
      if (enO && previo && Math.abs(ev.t - previo.t) * Math.max(v, previo.v) < 2e-3 * L) continue;
      const e = { ...base, nombre: enO ? 'Pasa por O' : 'Cruza el eje x', tipo: /** @type {'eje'} */ ('eje'), x: tipo === 'ejeX' ? x : 0, y: tipo === 'ejeX' ? 0 : y };
      if (enO) ultimoO[i] = e;
      eventos.push(e);
    } else if (tipo === 'vy' || tipo === 'rapidezMin') {
      const enReposo = v < 1e-3 * vRef;
      if (tipo === 'rapidezMin' && !enReposo) continue;
      if (enReposo) {
        // El mismo retorno visto por v_y y por v·a: si el movimiento no es
        // del todo rectilíneo, los dos instantes difieren un poco. Cerca de un
        // retorno la rapidez cae de 10⁻³·v_ref a 0 en ~10⁻³·T, así que dos
        // retornos distintos no pueden estar más cerca que eso.
        if (Math.abs(ev.t - ultimoRetorno[i]) < 1e-3 * T) continue;
        ultimoRetorno[i] = ev.t;
        const vuelve = Math.hypot(x - libres[i].x, y - libres[i].y) < 1e-3 * L;
        eventos.push({ ...base, nombre: vuelve ? 'Vuelve al inicio' : 'Punto de retorno', tipo: 'retorno', x, y });
      } else {
        eventos.push({ ...base, nombre: ev.direccion > 0 ? 'Altura mínima' : 'Altura máxima', tipo: 'extremo', x, y });
      }
    } else if (tipo === 'choque') {
      choque = { ...base, nombre: nombreChoque(libres[i], contra, fijas.includes(contra)), tipo: /** @type {'choque'} */ ('choque'), x, y, contra: contra.id };
      eventos.push(choque);
    }
  }

  // Energía inicial y su variación máxima en los pasos aceptados
  const sim = { fijas, libres, interaccionLibres: mutua, solucion: sol, eventos, choque, tFin: sol.t[sol.t.length - 1], E0: 0, deriva: 0, escalas, estado: sol.estado };
  const E = s => { const { K, U } = energiaEstado(sim, s); return K + U; };
  sim.E0 = E(y0);
  let deriva = 0;
  for (const s of sol.y) deriva = Math.max(deriva, Math.abs(E(s) - sim.E0));
  sim.deriva = deriva / Math.abs(sim.E0 || 1);
  return sim;
}

/** Nombre del evento de choque de la carga libre `propia` con `contra`. */
function nombreChoque(propia, contra, contraEsFija) {
  return contraEsFija ? 'Choca con la carga ' + contra.nombre : `Choque entre ${propia.nombre} y ${contra.nombre}`;
}

/**
 * Estado de la carga libre i en el instante t (salida densa; fuera de
 * [0, tFin] se queda en el extremo).
 * @param {ReturnType<typeof simularCargas>} sim
 * @param {number} t
 * @param {number} [i=0]
 * @returns {{x: number, y: number, vx: number, vy: number}}
 */
export function estadoEn(sim, t, i = 0) {
  const s = interpolar(sim.solucion, t), b = 4 * i;
  return { x: s[b], y: s[b + 1], vx: s[b + 2], vy: s[b + 3] };
}

/**
 * Energía cinética y potencial de las cargas libres para un vector de
 * estado: U incluye la interacción libre–fija y libre–libre (la de las fijas
 * entre sí es constante y no se cuenta).
 * @param {ReturnType<typeof simularCargas>} sim
 * @param {number[]} s
 * @returns {{K: number, U: number}}
 */
export function energiaEstado(sim, s) {
  const { fijas, libres } = sim;
  let K = 0, U = 0;
  for (let i = 0; i < libres.length; i++) {
    const b = 4 * i, c = libres[i];
    K += 0.5 * c.m * (s[b + 2] * s[b + 2] + s[b + 3] * s[b + 3]);
    U += c.q * potencial(fijas, s[b], s[b + 1]);
    if (sim.interaccionLibres) {
      for (let j = i + 1; j < libres.length; j++) {
        U += K_COULOMB * c.q * libres[j].q / Math.max(R_MIN, Math.hypot(s[b] - s[4 * j], s[b + 1] - s[4 * j + 1]));
      }
    }
  }
  return { K, U };
}

/**
 * Energía cinética y potencial en el instante t.
 * @param {ReturnType<typeof simularCargas>} sim
 * @param {number} t
 */
export function energiaEn(sim, t) {
  return energiaEstado(sim, interpolar(sim.solucion, t));
}
