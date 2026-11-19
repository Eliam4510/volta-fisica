/* ==========================================================================
   Volta — núcleo · integradores de ecuaciones diferenciales ordinarias
   - Dormand–Prince 5(4) adaptativo (FSAL, control PI del paso) con salida
     densa de orden 4 (extensión continua de Hairer y Wanner).
   - Localización de eventos por el método de Brent sobre la salida densa,
     con dirección de cruce y eventos terminales.
   - RK4 clásico de paso fijo y Verlet de velocidad (simpléctico, orden 2),
     ambos con salida densa de Hermite cúbica y los mismos eventos.
   - Cuadratura de Gauss–Legendre (nodos y pesos).
   Puro: sin DOM. Lo usan los motores y las pruebas.

   Convenciones:
   - f(t, y) → dy/dt, con y un arreglo de números; f devuelve un arreglo
     nuevo y no guarda referencias a y.
   - Una "solución" es un objeto de datos (sin funciones) que se puede
     comparar, copiar o guardar; se evalúa en cualquier instante con
     interpolar(sol, t).
   - Solo se integra hacia adelante (tFin ≥ t0).
   ========================================================================== */

const EPS = Number.EPSILON;

/**
 * @typedef {(t: number, y: number[]) => number[]} FuncionDerivada
 */

/**
 * Evento: una función g(t, y) cuyo cruce por cero se localiza.
 * @typedef {Object} DefinicionEvento
 * @property {(t: number, y: number[]) => number} g
 * @property {-1|0|1} [direccion=0]  +1: g pasa de negativo a positivo; −1: de positivo a negativo; 0: ambos
 * @property {boolean} [terminal=false] Detiene la integración en el instante del evento
 * @property {string} [nombre]
 */

/**
 * Evento encontrado durante la integración.
 * @typedef {Object} EventoIntegrador
 * @property {number} t          Instante del cruce
 * @property {number[]} y        Estado en ese instante (de la salida densa)
 * @property {number} indice     Posición del evento en la lista de definiciones
 * @property {string} [nombre]
 * @property {-1|1} direccion    Sentido del cruce de g
 * @property {boolean} terminal
 */

/**
 * Solución de un integrador. Los nodos t[i], y[i] son los pasos aceptados;
 * el tramo i va de t[i] a t[i + 1].
 * @typedef {Object} Solucion
 * @property {'dopri5'|'rk4'|'verlet'} metodo
 * @property {number[]} t        Instantes de los nodos (t[0] = t0; el último es el final alcanzado)
 * @property {number[][]} y      Estado en cada nodo
 * @property {number[][]} dy     Derivada f(t, y) en cada nodo
 * @property {number[]} h        Largo completo de cada tramo (en el último puede exceder t[n] − t[n−1] si un evento terminal lo cortó)
 * @property {number[][][]} [coef] Dormand–Prince: coeficientes de la salida densa de cada tramo
 * @property {EventoIntegrador[]} eventos
 * @property {'completo'|'evento'|'maxPasos'|'pasoMinimo'} estado
 * @property {number} pasosAceptados
 * @property {number} pasosRechazados
 * @property {number} evaluaciones Evaluaciones de f
 */

// ---------------------------------------------------------------------------
// Método de Brent
// ---------------------------------------------------------------------------

/**
 * Raíz de g en [a, b] por el método de Brent (bisección, secante e
 * interpolación cuadrática inversa). g(a) y g(b) deben tener signos opuestos.
 * Converge con la garantía de la bisección y, cerca de la raíz, de forma
 * superlineal. Error en x ≲ tol + 4·ε·|x|.
 * @param {(x: number) => number} g
 * @param {number} a
 * @param {number} b
 * @param {{tol?: number, maxIter?: number, ga?: number, gb?: number}} [o]
 *   ga, gb: valores ya conocidos de g(a), g(b) (ahorra evaluaciones)
 * @returns {number}
 */
export function brent(g, a, b, o = {}) {
  const tol = o.tol ?? 1e-12, maxIter = o.maxIter ?? 200;
  let fa = o.ga ?? g(a), fb = o.gb ?? g(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (!(Math.sign(fa) * Math.sign(fb) < 0)) throw new RangeError('brent: g(a) y g(b) deben tener signos opuestos');
  let c = b, fc = fb, d = b - a, e = d;
  for (let i = 0; i < maxIter; i++) {
    if ((fb > 0 && fc > 0) || (fb < 0 && fc < 0)) { c = a; fc = fa; d = b - a; e = d; }
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
    const tol1 = 2 * EPS * Math.abs(b) + 0.5 * tol, xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      // Interpolación: secante (dos puntos) o cuadrática inversa (tres)
      const s = fb / fa;
      let p, q;
      if (a === c) { p = 2 * xm * s; q = 1 - s; }
      else {
        const qq = fa / fc, r = fb / fc;
        p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q; else p = -p;
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) { e = d; d = p / q; }
      else { d = xm; e = d; }
    } else { d = xm; e = d; }
    a = b; fa = fb;
    b += Math.abs(d) > tol1 ? d : (xm > 0 ? tol1 : -tol1);
    fb = g(b);
  }
  return b;
}

// ---------------------------------------------------------------------------
// Eventos (comunes a los tres métodos)
// ---------------------------------------------------------------------------

/** @param {Array<DefinicionEvento|((t: number, y: number[]) => number)>} [lista] */
function normalizarEventos(lista) {
  return (lista || []).map(e => (typeof e === 'function'
    ? { g: e, direccion: 0, terminal: false, nombre: undefined }
    : { g: e.g, direccion: e.direccion || 0, terminal: !!e.terminal, nombre: e.nombre }));
}

/**
 * Busca los cruces de cada g en el tramo (tL, tR]. gIzq: valores en tL.
 * Un valor exactamente nulo en tL no cuenta como cruce (ya se contó en el
 * tramo anterior, o es el instante inicial); uno nulo en tR sí.
 * Devuelve los cruces ordenados en el tiempo y los valores en tR.
 * @param {ReturnType<typeof normalizarEventos>} evs
 * @param {number[]} gIzq
 * @param {number} tL
 * @param {number} tR
 * @param {number[]} yR
 * @param {(t: number) => number[]} interp
 * @param {number} tolT
 */
function buscarCruces(evs, gIzq, tL, tR, yR, interp, tolT) {
  const gDer = new Array(evs.length), cruces = [];
  for (let k = 0; k < evs.length; k++) {
    const ev = evs[k], gl = gIzq[k], gr = ev.g(tR, yR);
    gDer[k] = gr;
    if (gl === 0 || !(gl < 0 || gl > 0) || !(gr < 0 || gr > 0 || gr === 0)) continue;
    if (gr !== 0 && Math.sign(gr) === Math.sign(gl)) continue;
    const dir = gl < 0 ? 1 : -1;
    if (ev.direccion !== 0 && ev.direccion !== dir) continue;
    const t = gr === 0 ? tR : brent(tt => ev.g(tt, interp(tt)), tL, tR, { tol: tolT, ga: gl, gb: gr });
    cruces.push({ t, indice: k, direccion: /** @type {-1|1} */ (dir) });
  }
  cruces.sort((p, q) => p.t - q.t || p.indice - q.indice);
  return { cruces, gDer };
}

/**
 * Registra los cruces de un tramo hasta el primer evento terminal (incluidos
 * los simultáneos con él). Devuelve el instante terminal o null.
 */
function registrarCruces(cruces, evs, eventos, interp, tR, yR) {
  let tTerm = null;
  for (const c of cruces) {
    if (tTerm !== null && c.t > tTerm) break;
    const ev = evs[c.indice];
    eventos.push({ t: c.t, y: c.t === tR ? yR.slice() : interp(c.t), indice: c.indice, nombre: ev.nombre, direccion: c.direccion, terminal: ev.terminal });
    if (ev.terminal && tTerm === null) tTerm = c.t;
  }
  return tTerm;
}

// ---------------------------------------------------------------------------
// Dormand–Prince 5(4)
// ---------------------------------------------------------------------------

// Tablero de Butcher (Dormand y Prince, 1980). La séptima etapa se evalúa en
// el nuevo punto: es la primera del paso siguiente (FSAL).
const C2 = 1 / 5, C3 = 3 / 10, C4 = 4 / 5, C5 = 8 / 9;
const A21 = 1 / 5;
const A31 = 3 / 40, A32 = 9 / 40;
const A41 = 44 / 45, A42 = -56 / 15, A43 = 32 / 9;
const A51 = 19372 / 6561, A52 = -25360 / 2187, A53 = 64448 / 6561, A54 = -212 / 729;
const A61 = 9017 / 3168, A62 = -355 / 33, A63 = 46732 / 5247, A64 = 49 / 176, A65 = -5103 / 18656;
const A71 = 35 / 384, A73 = 500 / 1113, A74 = 125 / 192, A75 = -2187 / 6784, A76 = 11 / 84;
// Error: diferencia entre la solución de orden 5 y la de orden 4
const E1 = 71 / 57600, E3 = -71 / 16695, E4 = 71 / 1920, E5 = -17253 / 339200, E6 = 22 / 525, E7 = -1 / 40;
// Salida densa de orden 4 (Hairer, Nørsett y Wanner, contd5)
const D1 = -12715105075 / 11282082432, D3 = 87487479700 / 32700410799, D4 = -10690763975 / 1880347072,
  D5 = 701980252875 / 199316789632, D6 = -1453857185 / 822651844, D7 = 69997945 / 29380423;

/**
 * Un paso de Dormand–Prince 5(4) desde (t, y) con k1 = f(t, y) ya conocido.
 * @param {FuncionDerivada} f
 * @param {number} t
 * @param {number[]} y
 * @param {number[]} k1
 * @param {number} h
 * @returns {{y: number[], k: number[][], err: number[]}} y: solución de orden 5;
 *   k: las siete etapas (k[6] = f(t + h, y)); err: estimación del error local
 */
export function pasoDormandPrince(f, t, y, k1, h) {
  const n = y.length;
  const etapa = (fn) => { const z = new Array(n); for (let i = 0; i < n; i++) z[i] = y[i] + h * fn(i); return z; };
  const k2 = f(t + C2 * h, etapa(i => A21 * k1[i]));
  const k3 = f(t + C3 * h, etapa(i => A31 * k1[i] + A32 * k2[i]));
  const k4 = f(t + C4 * h, etapa(i => A41 * k1[i] + A42 * k2[i] + A43 * k3[i]));
  const k5 = f(t + C5 * h, etapa(i => A51 * k1[i] + A52 * k2[i] + A53 * k3[i] + A54 * k4[i]));
  const k6 = f(t + h, etapa(i => A61 * k1[i] + A62 * k2[i] + A63 * k3[i] + A64 * k4[i] + A65 * k5[i]));
  const y1 = etapa(i => A71 * k1[i] + A73 * k3[i] + A74 * k4[i] + A75 * k5[i] + A76 * k6[i]);
  const k7 = f(t + h, y1);
  const err = new Array(n);
  for (let i = 0; i < n; i++) err[i] = h * (E1 * k1[i] + E3 * k3[i] + E4 * k4[i] + E5 * k5[i] + E6 * k6[i] + E7 * k7[i]);
  return { y: y1, k: [k1, k2, k3, k4, k5, k6, k7], err };
}

/** Coeficientes de la salida densa de un paso aceptado: [Δy, b, c, d]. */
function coeficientesDensa(y0, y1, k, h) {
  const n = y0.length, r2 = new Array(n), r3 = new Array(n), r4 = new Array(n), r5 = new Array(n);
  const [k1, , k3, k4, k5, k6, k7] = k;
  for (let i = 0; i < n; i++) {
    const dif = y1[i] - y0[i], bspl = h * k1[i] - dif;
    r2[i] = dif; r3[i] = bspl; r4[i] = dif - h * k7[i] - bspl;
    r5[i] = h * (D1 * k1[i] + D3 * k3[i] + D4 * k4[i] + D5 * k5[i] + D6 * k6[i] + D7 * k7[i]);
  }
  return [r2, r3, r4, r5];
}

/** Salida densa de Dormand–Prince en el tramo que empieza en (t0, y0) con paso h. */
function densaDP(t0, y0, coef, h, t) {
  const th = (t - t0) / h, th1 = 1 - th, [r2, r3, r4, r5] = coef, n = y0.length, z = new Array(n);
  for (let i = 0; i < n; i++) z[i] = y0[i] + th * (r2[i] + th1 * (r3[i] + th * (r4[i] + th1 * r5[i])));
  return z;
}
/** Derivada temporal de la salida densa de Dormand–Prince. */
function densaDPDerivada(t0, y0, coef, h, t) {
  const th = (t - t0) / h, th1 = 1 - th, [r2, r3, r4, r5] = coef, n = y0.length, z = new Array(n);
  for (let i = 0; i < n; i++) {
    const c = r4[i] + th1 * r5[i], b = r3[i] + th * c, a = r2[i] + th1 * b;
    const dc = -r5[i], db = c + th * dc, da = -b + th1 * db;
    z[i] = (a + th * da) / h;
  }
  return z;
}

/** Norma del error (máximo sobre componentes) escalada por la tolerancia. */
function normaError(err, y0, y1, rtol, atol) {
  let m = 0;
  for (let i = 0; i < err.length; i++) {
    const sk = (Array.isArray(atol) ? atol[i] : atol) + rtol * Math.max(Math.abs(y0[i]), Math.abs(y1[i]));
    const r = Math.abs(err[i]) / sk;
    if (!(r <= m)) m = r;          // también propaga NaN como "error enorme"
  }
  return Number.isNaN(m) ? Infinity : m;
}

/** Paso inicial (Hairer, Nørsett y Wanner, II.4). */
function pasoInicial(f, t0, y0, f0, rtol, atol, hMax) {
  const n = y0.length, sk = i => (Array.isArray(atol) ? atol[i] : atol) + rtol * Math.abs(y0[i]);
  let dnf = 0, dny = 0;
  for (let i = 0; i < n; i++) { dnf += (f0[i] / sk(i)) ** 2; dny += (y0[i] / sk(i)) ** 2; }
  let h = dnf <= 1e-10 || dny <= 1e-10 ? 1e-6 : Math.sqrt(dny / dnf) * 0.01;
  h = Math.min(h, hMax);
  const y1 = y0.map((v, i) => v + h * f0[i]), f1 = f(t0 + h, y1);
  let der2 = 0;
  for (let i = 0; i < n; i++) der2 += ((f1[i] - f0[i]) / sk(i)) ** 2;
  der2 = Math.sqrt(der2) / h;
  const der12 = Math.max(Math.abs(der2), Math.sqrt(dnf));
  const h1 = der12 <= 1e-15 ? Math.max(1e-6, h * 1e-3) : Math.pow(0.01 / der12, 1 / 5);
  return Math.min(100 * h, h1, hMax);
}

/**
 * Integra y' = f(t, y) de t0 a tFin con Dormand–Prince 5(4).
 * Control del paso: error local (norma máxima) ≤ atol + rtol·|y| en cada
 * componente, con controlador PI (β = 0.04) y factor de seguridad 0.9.
 * Con pasoFijo, da pasos iguales sin control de error (para medir el orden).
 * @param {FuncionDerivada} f
 * @param {number} t0
 * @param {number[]} y0
 * @param {number} tFin
 * @param {Object} [o]
 * @param {number} [o.rtol=1e-8]   Tolerancia relativa
 * @param {number|number[]} [o.atol=1e-10] Tolerancia absoluta (por componente si es arreglo)
 * @param {Array<DefinicionEvento|((t: number, y: number[]) => number)>} [o.eventos]
 * @param {number} [o.maxPasos=100000] Intentos de paso (aceptados y rechazados)
 * @param {number} [o.h0]          Paso inicial (si no, se estima)
 * @param {number} [o.hMax]        Paso máximo (por defecto tFin − t0)
 * @param {number} [o.hMin]        Paso mínimo; por debajo se detiene con estado 'pasoMinimo'
 * @param {number} [o.pasoFijo]    Paso constante, sin control de error
 * @param {number} [o.tolT=1e-12]  Tolerancia en t de la localización de eventos
 * @returns {Solucion}
 */
export function integrar(f, t0, y0, tFin, o = {}) {
  if (!(tFin >= t0)) throw new RangeError('integrar: se necesita tFin ≥ t0');
  const rtol = o.rtol ?? 1e-8, atol = o.atol ?? 1e-10, maxPasos = o.maxPasos ?? 100000, tolT = o.tolT ?? 1e-12;
  const largo = tFin - t0, hMax = Math.min(o.hMax ?? largo, largo) || largo;
  const hMin = o.hMin ?? 4 * EPS * Math.max(Math.abs(t0), Math.abs(tFin));
  const evs = normalizarEventos(o.eventos);
  let t = t0, y = y0.slice(), k1 = f(t, y), nf = 1;
  /** @type {Solucion} */
  const sol = { metodo: 'dopri5', t: [t], y: [y], dy: [k1], h: [], coef: [], eventos: [], estado: 'completo', pasosAceptados: 0, pasosRechazados: 0, evaluaciones: 0 };
  if (largo === 0) { sol.evaluaciones = nf; return sol; }
  let gIzq = evs.map(e => e.g(t, y));

  const fijo = o.pasoFijo > 0;
  const nFijo = fijo ? Math.max(1, Math.ceil(largo / o.pasoFijo - 1e-9)) : 0;
  let h = fijo ? largo / nFijo : (o.h0 ?? pasoInicial(f, t0, y, k1, rtol, atol, hMax));
  if (!fijo && o.h0 == null) nf++;
  let errViejo = 1e-4, rechazado = false;
  const BETA = 0.04, EXPO = 0.2 - 0.75 * BETA, SEG = 0.9;

  for (let intento = 0; ; intento++) {
    if (intento >= maxPasos) { sol.estado = 'maxPasos'; break; }
    let ultimo;
    if (fijo) {
      // Nodos t0 + i·H exactos (sin acumular redondeo)
      ultimo = sol.pasosAceptados === nFijo - 1;
      h = (ultimo ? tFin : t0 + (sol.pasosAceptados + 1) * (largo / nFijo)) - t;
    } else {
      // Si el paso deja menos de un 1 % de resto, se alarga hasta tFin
      ultimo = t + 1.01 * h >= tFin;
      if (ultimo) h = tFin - t;
      if (h < hMin) { sol.estado = 'pasoMinimo'; break; }
    }
    const r = pasoDormandPrince(f, t, y, k1, h);
    nf += 6;
    const err = fijo ? 0 : normaError(r.err, y, r.y, rtol, atol);
    if (err > 1) {
      // Rechazo: se reduce el paso (nunca a menos de 1/5) y se repite
      h /= Math.min(5, Math.pow(err, EXPO) / SEG);
      if (!isFinite(h)) h = 0;
      rechazado = true; sol.pasosRechazados++;
      continue;
    }
    // Paso aceptado
    const tR = ultimo ? tFin : t + h, yR = r.y, k7 = r.k[6];
    const coef = coeficientesDensa(y, yR, r.k, h);
    const t0p = t, y0p = y, hp = h;
    const interp = tt => densaDP(t0p, y0p, coef, hp, tt);
    sol.h.push(h); sol.coef.push(coef); sol.pasosAceptados++;
    let tTerm = null;
    if (evs.length) {
      const { cruces, gDer } = buscarCruces(evs, gIzq, t, tR, yR, interp, tolT);
      tTerm = registrarCruces(cruces, evs, sol.eventos, interp, tR, yR);
      gIzq = gDer;
    }
    if (tTerm !== null) {
      const yE = tTerm === tR ? yR : interp(tTerm);
      sol.t.push(tTerm); sol.y.push(yE); sol.dy.push(tTerm === tR ? k7 : f(tTerm, yE));
      if (tTerm !== tR) nf++;
      sol.estado = 'evento';
      break;
    }
    sol.t.push(tR); sol.y.push(yR); sol.dy.push(k7);
    t = tR; y = yR; k1 = k7;
    if (ultimo) break;
    if (!fijo) {
      // Controlador PI: tras un paso aceptado, el siguiente crece como mucho
      // ×10 y encoge como mucho ×5; tras un rechazo no crece
      const fac11 = Math.pow(err, EXPO);
      let fac = fac11 / Math.pow(errViejo, BETA);
      fac = Math.max(0.1, Math.min(5, fac / SEG));
      let hNuevo = h / fac;
      if (rechazado) hNuevo = Math.min(hNuevo, h);
      errViejo = Math.max(err, 1e-4); rechazado = false;
      h = Math.min(hNuevo, hMax);
    }
  }
  sol.evaluaciones = nf;
  return sol;
}

// ---------------------------------------------------------------------------
// RK4 clásico (paso fijo)
// ---------------------------------------------------------------------------

/**
 * Un paso de Runge–Kutta clásico de orden 4.
 * @param {FuncionDerivada} f
 * @param {number} t
 * @param {number[]} y
 * @param {number} h
 * @param {number[]} [k1] f(t, y), si ya se conoce
 * @returns {number[]}
 */
export function pasoRK4(f, t, y, h, k1 = f(t, y)) {
  const n = y.length;
  const etapa = (k, c) => { const z = new Array(n); for (let i = 0; i < n; i++) z[i] = y[i] + c * h * k[i]; return z; };
  const k2 = f(t + 0.5 * h, etapa(k1, 0.5));
  const k3 = f(t + 0.5 * h, etapa(k2, 0.5));
  const k4 = f(t + h, etapa(k3, 1));
  const y1 = new Array(n);
  for (let i = 0; i < n; i++) y1[i] = y[i] + h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6;
  return y1;
}

/** Interpolación cúbica de Hermite entre (t0, y0, d0) y (t1, y1, d1). */
function hermite(t0, y0, d0, t1, y1, d1, t) {
  const h = t1 - t0, u = (t - t0) / h, u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  const n = y0.length, z = new Array(n);
  for (let i = 0; i < n; i++) z[i] = h00 * y0[i] + h10 * h * d0[i] + h01 * y1[i] + h11 * h * d1[i];
  return z;
}
function hermiteDerivada(t0, y0, d0, t1, y1, d1, t) {
  const h = t1 - t0, u = (t - t0) / h, u2 = u * u;
  const a = (6 * u2 - 6 * u) / h, b = 3 * u2 - 4 * u + 1, c = (-6 * u2 + 6 * u) / h, d = 3 * u2 - 2 * u;
  const n = y0.length, z = new Array(n);
  for (let i = 0; i < n; i++) z[i] = a * y0[i] + b * d0[i] + c * y1[i] + d * d1[i];
  return z;
}

/** Número de pasos y paso de un integrador de paso fijo. */
function pasosFijos(t0, tFin, o) {
  const largo = tFin - t0;
  const n = o.pasos > 0 ? Math.round(o.pasos) : o.h > 0 ? Math.max(1, Math.ceil(largo / o.h - 1e-9)) : 0;
  if (!n) throw new RangeError('Se necesita h > 0 o pasos > 0');
  return { n, h: largo / n };
}

/**
 * Bucle común de los métodos de paso fijo con salida densa de Hermite.
 * paso(t, y, dy, h) → {y, dy} en t + h.
 */
function integrarFijo(metodo, paso, deriv, t0, y0, tFin, o) {
  if (!(tFin >= t0)) throw new RangeError('integrar: se necesita tFin ≥ t0');
  const evs = normalizarEventos(o.eventos), tolT = o.tolT ?? 1e-12;
  let t = t0, y = y0.slice(), dy = deriv(t, y);
  /** @type {Solucion} */
  const sol = { metodo, t: [t], y: [y], dy: [dy], h: [], eventos: [], estado: 'completo', pasosAceptados: 0, pasosRechazados: 0, evaluaciones: 0 };
  if (tFin === t0) return sol;
  const { n, h } = pasosFijos(t0, tFin, o);
  let gIzq = evs.map(e => e.g(t, y));
  for (let i = 0; i < n; i++) {
    const tR = i === n - 1 ? tFin : t0 + (i + 1) * h, r = paso(t, y, dy, tR - t);
    const tL = t, yL = y, dL = dy;
    const interp = tt => hermite(tL, yL, dL, tR, r.y, r.dy, tt);
    sol.h.push(tR - tL); sol.pasosAceptados++;
    let tTerm = null;
    if (evs.length) {
      const { cruces, gDer } = buscarCruces(evs, gIzq, tL, tR, r.y, interp, tolT);
      tTerm = registrarCruces(cruces, evs, sol.eventos, interp, tR, r.y);
      gIzq = gDer;
    }
    if (tTerm !== null) {
      const yE = tTerm === tR ? r.y : interp(tTerm);
      sol.t.push(tTerm); sol.y.push(yE); sol.dy.push(tTerm === tR ? r.dy : deriv(tTerm, yE));
      sol.h[sol.h.length - 1] = tTerm - tL;
      sol.estado = 'evento';
      break;
    }
    sol.t.push(tR); sol.y.push(r.y); sol.dy.push(r.dy);
    t = tR; y = r.y; dy = r.dy;
  }
  return sol;
}

/**
 * Integra y' = f(t, y) con RK4 clásico de paso fijo.
 * @param {FuncionDerivada} f
 * @param {number} t0
 * @param {number[]} y0
 * @param {number} tFin
 * @param {{h?: number, pasos?: number, eventos?: Array<DefinicionEvento|Function>, tolT?: number}} o
 *   h: paso deseado (se ajusta para caer justo en tFin) o pasos: número de pasos
 * @returns {Solucion}
 */
export function integrarRK4(f, t0, y0, tFin, o) {
  const paso = (t, y, dy, h) => { const y1 = pasoRK4(f, t, y, h, dy); return { y: y1, dy: f(t + h, y1) }; };
  return integrarFijo('rk4', paso, f, t0, y0, tFin, o || {});
}

// ---------------------------------------------------------------------------
// Verlet de velocidad (simpléctico, orden 2)
// ---------------------------------------------------------------------------

/**
 * Un paso de Verlet de velocidad para x'' = a(t, x):
 *   x₁ = x + h·v + h²/2·a(x);  v₁ = v + h/2·(a(x) + a(x₁)).
 * @param {(t: number, x: number[]) => number[]} aceleracion
 * @param {number} t
 * @param {number[]} x
 * @param {number[]} v
 * @param {number[]} a   a(t, x), ya conocida
 * @param {number} h
 * @returns {{x: number[], v: number[], a: number[]}}
 */
export function pasoVerlet(aceleracion, t, x, v, a, h) {
  const n = x.length, x1 = new Array(n), v1 = new Array(n);
  for (let i = 0; i < n; i++) x1[i] = x[i] + h * v[i] + 0.5 * h * h * a[i];
  const a1 = aceleracion(t + h, x1);
  for (let i = 0; i < n; i++) v1[i] = v[i] + 0.5 * h * (a[i] + a1[i]);
  return { x: x1, v: v1, a: a1 };
}

/**
 * Integra x'' = a(t, x) con Verlet de velocidad de paso fijo. El estado de la
 * solución (y de las funciones de evento) es y = [...x, ...v].
 * @param {(t: number, x: number[]) => number[]} aceleracion
 * @param {number} t0
 * @param {number[]} x0
 * @param {number[]} v0
 * @param {number} tFin
 * @param {{h?: number, pasos?: number, eventos?: Array<DefinicionEvento|Function>, tolT?: number}} o
 * @returns {Solucion}
 */
export function integrarVerlet(aceleracion, t0, x0, v0, tFin, o) {
  const n = x0.length;
  const deriv = (t, y) => [...y.slice(n), ...aceleracion(t, y.slice(0, n))];
  const paso = (t, y, dy, h) => {
    const r = pasoVerlet(aceleracion, t, y.slice(0, n), y.slice(n), dy.slice(n), h);
    return { y: [...r.x, ...r.v], dy: [...r.v, ...r.a] };
  };
  return integrarFijo('verlet', paso, deriv, t0, [...x0, ...v0], tFin, o || {});
}

// ---------------------------------------------------------------------------
// Evaluación de una solución en cualquier instante
// ---------------------------------------------------------------------------

/** Índice del tramo que contiene t (t[i] ≤ t < t[i + 1]). */
function tramo(T, t) {
  let lo = 0, hi = T.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
  return lo;
}

/**
 * Estado de la solución en el instante t (salida densa). Fuera de
 * [t0, tFinal] devuelve el estado del extremo más cercano.
 * @param {Solucion} sol
 * @param {number} t
 * @returns {number[]}
 */
export function interpolar(sol, t) {
  const T = sol.t, n = T.length - 1;
  if (n === 0 || t <= T[0]) return sol.y[0].slice();
  if (t >= T[n]) return sol.y[n].slice();
  const i = tramo(T, t);
  if (sol.metodo === 'dopri5') return densaDP(T[i], sol.y[i], sol.coef[i], sol.h[i], t);
  return hermite(T[i], sol.y[i], sol.dy[i], T[i + 1], sol.y[i + 1], sol.dy[i + 1], t);
}

/**
 * Derivada temporal de la salida densa en t (continua entre tramos).
 * @param {Solucion} sol
 * @param {number} t
 * @returns {number[]}
 */
export function derivadaInterpolada(sol, t) {
  const T = sol.t, n = T.length - 1;
  if (n === 0 || t <= T[0]) return sol.dy[0].slice();
  if (t >= T[n]) return sol.dy[n].slice();
  const i = tramo(T, t);
  if (sol.metodo === 'dopri5') return densaDPDerivada(T[i], sol.y[i], sol.coef[i], sol.h[i], t);
  return hermiteDerivada(T[i], sol.y[i], sol.dy[i], T[i + 1], sol.y[i + 1], sol.dy[i + 1], t);
}

// ---------------------------------------------------------------------------
// Cuadratura de Gauss–Legendre
// ---------------------------------------------------------------------------

const cacheGL = new Map();
/**
 * Nodos y pesos de Gauss–Legendre de n puntos en [−1, 1]: integra
 * exactamente los polinomios de grado ≤ 2n − 1. Raíces de Pₙ por Newton.
 * @param {number} n
 * @returns {{x: number[], w: number[]}}
 */
export function gaussLegendre(n) {
  if (cacheGL.has(n)) return cacheGL.get(n);
  const x = new Array(n), w = new Array(n);
  for (let i = 0; i < Math.ceil(n / 2); i++) {
    // Pₙ(z) y Pₙ'(z) por la recurrencia de Bonnet
    const legendre = z => {
      let p0 = 1, p1 = z;
      for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
      return [p1, n * (z * p1 - p0) / (z * z - 1)];
    };
    let z = Math.cos(Math.PI * (i + 0.75) / (n + 0.5));
    for (let it = 0; it < 100; it++) {
      const [p, dpz] = legendre(z), dz = p / dpz;
      z -= dz;
      if (Math.abs(dz) < 1e-16) break;
    }
    const dp = legendre(z)[1];      // derivada en la raíz ya convergida
    x[i] = -z; x[n - 1 - i] = z;
    w[i] = w[n - 1 - i] = 2 / ((1 - z * z) * dp * dp);
  }
  const r = { x, w };
  cacheGL.set(n, r);
  return r;
}
