/* ==========================================================================
   Volta — motor de recipientes (Termodinámica · Laboratorio de gases)
   Tres montajes macroscópicos de gas ideal, además del cilindro con émbolo
   de gas.js:
   1. Recipientes conectados: compartimientos rígidos en fila separados por
      paredes fijas, válvulas o émbolos libres (sin masa ni fricción). Cada
      compartimiento puede tocar un baño térmico y tener un calentador. Por
      las válvulas abiertas pasa gas según la diferencia de presión y lleva
      su entalpía; por paredes, válvulas y émbolos pasa calor según su
      conductancia. Los émbolos se mueven por estados de equilibrio
      (presiones iguales a ambos lados) y el trabajo que hace un lado lo
      recibe el otro. Hay mezcla de especies (cada una con sus grados de
      libertad y su masa molar). Con la válvula abierta el gas además se
      mezcla: temperaturas y composición se igualan con el mismo tiempo
      característico de la válvula (sin mezcla queda la expansión de Joule
      con un lado frío y otro caliente). Expansión libre hacia el vacío,
      mezcla de gases a distinta temperatura y cilindros divididos salen de
      aquí.
   2. Recipiente abierto a la atmósfera: globo aerostático (con su
      movimiento vertical: flotación, peso y arrastre en una atmósfera
      isoterma) o un recinto fijo que pierde aire al calentarse.
   3. Burbuja que sube despacio por una columna de líquido.
   Contabilidad exacta: en los recipientes conectados cada transferencia (gas,
   entalpía, calor, trabajo) se resta de un lado y se suma al otro con el
   mismo número, así que la energía y los moles totales se conservan hasta el
   redondeo. Las transferencias de cada paso usan la solución exponencial de
   cada par (relajación), estable con cualquier paso.
   Un motor nunca aborta una simulación válida; solo lanza con escenas que no
   describen una situación física.
   Puro: sin DOM. Lo usan la pantalla del Laboratorio de gases y las pruebas.
   ========================================================================== */
import { R_GAS } from './gas.js';

/**
 * @typedef {Object} Especie
 * @property {string} nombre
 * @property {number} f   Grados de libertad (3 monoatómico, 5 diatómico, 6 triatómico)
 * @property {number} [M] Masa molar (kg/mol)
 */

/**
 * @typedef {Object} Compartimiento
 * @property {number} V    Volumen (m³)
 * @property {number[]} n  Moles de cada especie
 * @property {number} T    Temperatura inicial (K); no cuenta si está vacío
 * @property {number} [Tb] Temperatura del baño con el que está en contacto (K)
 * @property {number} [Gb=0] Conductancia con el baño (W/K); 0: aislado
 * @property {number} [Fc=0] Potencia del calentador (W); se enciende con una acción
 * @property {number} [Tobj=Infinity] Termostato del calentador: la potencia baja a cero al llegar a esta temperatura (K)
 * @property {boolean} [bano=true] Contacto con el baño al empezar (si Gb > 0)
 */

/**
 * @typedef {Object} Separador
 * @property {'pared'|'valvula'|'embolo'} tipo
 * @property {boolean} [abierta=false] Válvula abierta al empezar
 * @property {number} [tau=0.5] Tiempo característico de la válvula (s)
 * @property {number} [G=0] Conductancia térmica (W/K)
 * @property {boolean} [mezcla=true] Válvula abierta: el gas de los dos lados se mezcla (temperatura y composición)
 */

/**
 * @typedef {Object} EscenaRecipientes
 * @property {Especie[]} especies
 * @property {Compartimiento[]} compartimientos  En fila, de izquierda a derecha
 * @property {Separador[]} separadores  Uno entre cada par de vecinos
 */

/**
 * Acción programada sobre los recipientes.
 * @typedef {{t: number, tipo: 'valvula'|'calentador'|'bano', i: number, valor: boolean}} AccionRecipientes
 */

/**
 * @typedef {Object} OpcionesRecipientes
 * @property {number} [duracion=20]
 * @property {number} [dt=0.002]
 * @property {number} [muestra=0.02]
 * @property {'gradual'|'instantaneo'} [modo='gradual']  Instantáneo: al abrir una válvula se mezcla de golpe
 */

const VACIO = 1e-15;   // moles por debajo de los cuales un compartimiento está vacío

/** Capacidad molar a volumen constante de cada especie. */
const cvDe = esp => esp.map(e => e.f / 2 * R_GAS);

/**
 * Entropía de un compartimiento (J/K), salvo una constante por especie que
 * se cancela si los moles de cada especie se conservan:
 * S = Σ n_s·(Cv_s·ln T + R·ln(V/n_s)). Mezcla ideal: misma especie, mismo
 * término (sin paradoja de Gibbs); especies distintas suman la entropía de
 * mezcla.
 * @param {number[]} n @param {number[]} cv @param {number} T @param {number} V
 */
export function entropiaCompartimiento(n, cv, T, V) {
  let S = 0;
  n.forEach((x, s) => { if (x > VACIO) S += x * (cv[s] * Math.log(T) + R_GAS * Math.log(V / x)); });
  return S;
}

/**
 * Valida la escena y lanza un Error si no describe recipientes posibles.
 * @param {EscenaRecipientes} esc
 */
function validar(esc) {
  const { especies, compartimientos: cs, separadores: ss } = esc;
  if (!Array.isArray(especies) || !especies.length) throw new Error('Falta al menos una especie de gas.');
  for (const e of especies) if (!(e.f > 0)) throw new Error(`La especie ${e.nombre} necesita grados de libertad positivos.`);
  if (!Array.isArray(cs) || !cs.length) throw new Error('Falta al menos un recipiente.');
  if (!Array.isArray(ss) || ss.length !== cs.length - 1) throw new Error('Hace falta un separador entre cada par de recipientes vecinos.');
  cs.forEach((c, i) => {
    if (!(c.V > 0)) throw new Error(`El recipiente ${i + 1} necesita un volumen positivo.`);
    if (!Array.isArray(c.n) || c.n.length !== especies.length || c.n.some(x => !(x >= 0))) throw new Error(`El recipiente ${i + 1} necesita una cantidad no negativa de cada especie.`);
    if (c.n.some(x => x > VACIO) && !(c.T > 0)) throw new Error(`El gas del recipiente ${i + 1} necesita una temperatura positiva.`);
    if ((c.Gb ?? 0) > 0 && !(c.Tb > 0)) throw new Error(`El baño del recipiente ${i + 1} necesita una temperatura positiva.`);
  });
  ss.forEach((s, j) => {
    if (!['pared', 'valvula', 'embolo'].includes(s.tipo)) throw new Error(`Separador desconocido: ${s.tipo}`);
    if (s.tipo === 'embolo' && (cs[j].n.every(x => x <= VACIO) || cs[j + 1].n.every(x => x <= VACIO))) {
      throw new Error('Un émbolo libre necesita gas a los dos lados (contra el vacío no tiene equilibrio).');
    }
    if (s.tipo === 'valvula' && !((s.tau ?? 0.5) > 0)) throw new Error('El tiempo de la válvula tiene que ser positivo.');
  });
}

/**
 * Estado de equilibrio final de unos recipientes aislados del exterior y
 * comunicados entre sí: energía interna, moles y volumen totales se
 * conservan, y al final temperatura, presión y composición son uniformes.
 * @param {EscenaRecipientes} esc
 * @returns {{T: number, P: number, n: number[], V: number, U: number, dS: number}}
 */
export function equilibrioAislado(esc) {
  validar(esc);
  const cv = cvDe(esc.especies), S = cv.length;
  const n = Array(S).fill(0);
  let U = 0, V = 0, S0 = 0;
  for (const c of esc.compartimientos) {
    c.n.forEach((x, s) => { n[s] += x; if (x > VACIO) U += x * cv[s] * c.T; });
    V += c.V;
    S0 += entropiaCompartimiento(c.n, cv, c.T, c.V);
  }
  const C = n.reduce((a, x, s) => a + x * cv[s], 0), ntot = n.reduce((a, x) => a + x, 0);
  const T = U / C, P = ntot * R_GAS * T / V;
  return { T, P, n, V, U, dS: entropiaCompartimiento(n, cv, T, V) - S0 };
}

/**
 * Simula los recipientes conectados con su guion de acciones.
 * @param {EscenaRecipientes} esc
 * @param {AccionRecipientes[]} [guion=[]]
 * @param {OpcionesRecipientes} [opciones]
 */
export function simularRecipientes(esc, guion = [], opciones = {}) {
  validar(esc);
  const o = { duracion: 20, dt: 0.002, muestra: 0.02, modo: 'gradual', ...opciones };
  const { especies, compartimientos: cs, separadores: ss } = esc;
  const N = cs.length, S = especies.length, cv = cvDe(especies), R = R_GAS;
  const DT = o.dt, cada = Math.max(1, Math.round(o.muestra / DT)), pasos = Math.round(o.duracion / DT);
  const acciones = guion.filter(a => a.t <= o.duracion + 1e-12).slice().sort((a, b) => a.t - b.t);

  // Estado: moles por especie, energía interna y volumen de cada compartimiento
  const n = cs.map(c => c.n.slice());
  const ntot = i => n[i].reduce((a, x) => a + x, 0);
  const capacidad = i => n[i].reduce((a, x, s) => a + x * cv[s], 0);       // n·Cv (J/K)
  const U = cs.map((c, i) => capacidad(i) * (ntot(i) > VACIO ? c.T : 0));
  const V = cs.map(c => c.V);
  const T = i => (ntot(i) > VACIO ? U[i] / capacidad(i) : NaN);
  const P = i => (ntot(i) > VACIO ? ntot(i) * R * T(i) / V[i] : 0);
  const abierta = ss.map(s => s.tipo === 'valvula' && !!s.abierta);
  const cal = cs.map(() => false), bano = cs.map(c => (c.Gb ?? 0) > 0 && c.bano !== false);
  // Conductancia de cada válvula (mol/(Pa·s)) a partir de su tiempo característico
  const Tref = Math.max(...cs.map(c => (c.n.some(x => x > VACIO) ? c.T : 0)), 1);
  const kv = ss.map((s, j) => (s.tipo === 'valvula' ? 1 / ((s.tau ?? 0.5) * R * Tref * (1 / V[j] + 1 / V[j + 1])) : 0));
  // Grupos de compartimientos unidos por émbolos (volumen total fijo)
  const grupos = [];
  for (let i = 0; i < N;) { let j = i; while (j < N - 1 && ss[j].tipo === 'embolo') j++; grupos.push(Array.from({ length: j - i + 1 }, (_, k) => i + k)); i = j + 1; }

  // Registro acumulado por compartimiento (J): calor exterior (baño y
  // calentador), calor de los vecinos, entalpía que llega con el gas y
  // trabajo hecho sobre los émbolos. ΔU = Qext + Qint + H − W.
  const reg = { Qbano: cs.map(() => 0), Qcal: cs.map(() => 0), Qint: cs.map(() => 0), H: cs.map(() => 0), W: cs.map(() => 0) };
  const U0 = U.slice(), S0 = entropia();
  const muestras = [], eventos = [];
  let incompleta = null;

  function entropia() { let s = 0; for (let i = 0; i < N; i++) if (ntot(i) > VACIO) s += entropiaCompartimiento(n[i], cv, T(i), V[i]); return s; }

  function registrar(t) {
    muestras.push({
      t, P: cs.map((_, i) => P(i)), V: V.slice(), T: cs.map((_, i) => T(i)), n: cs.map((_, i) => ntot(i)), nEsp: n.map(x => x.slice()), U: U.slice(),
      Qbano: reg.Qbano.slice(), Qcal: reg.Qcal.slice(), Qint: reg.Qint.slice(), H: reg.H.slice(), W: reg.W.slice(),
      Utot: U.reduce((a, x) => a + x, 0), Qext: reg.Qbano.reduce((a, x) => a + x, 0) + reg.Qcal.reduce((a, x) => a + x, 0),
      dS: entropia() - S0, abiertas: abierta.slice(),
    });
  }
  const NOMBRES = {
    valvula: (v, i) => (v ? `Se abre la válvula ${i + 1}` : `Se cierra la válvula ${i + 1}`),
    calentador: (v, i) => (v ? `Se enciende el calentador ${i + 1}` : `Se apaga el calentador ${i + 1}`),
    bano: (v, i) => (v ? `El recipiente ${i + 1} toca el baño` : `El recipiente ${i + 1} se aísla del baño`),
  };
  /** @param {AccionRecipientes} a */
  function aplicar(a, t) {
    if (a.tipo === 'valvula') { if (!ss[a.i] || ss[a.i].tipo !== 'valvula' || abierta[a.i] === !!a.valor) return; abierta[a.i] = !!a.valor; }
    else if (a.tipo === 'calentador') { if (!cs[a.i] || cal[a.i] === !!a.valor) return; cal[a.i] = !!a.valor; }
    else if (a.tipo === 'bano') { if (!cs[a.i] || !((cs[a.i].Gb ?? 0) > 0) || bano[a.i] === !!a.valor) return; bano[a.i] = !!a.valor; }
    else return;
    eventos.push({ t, tipo: a.tipo, i: a.i, valor: !!a.valor, nombre: NOMBRES[a.tipo](!!a.valor, a.i), P: cs.map((_, i) => P(i)), T: cs.map((_, i) => T(i)), V: V.slice() });
    if (a.tipo === 'valvula' && a.valor && o.modo === 'instantaneo') mezclarDeGolpe(a.i);
  }

  // Mezcla instantánea de todo lo que queda comunicado por válvulas abiertas
  function mezclarDeGolpe(j) {
    let a = j, b = j + 1;
    while (a > 0 && abierta[a - 1]) a--;
    while (b < N - 1 && abierta[b]) b++;
    const ids = Array.from({ length: b - a + 1 }, (_, k) => a + k);
    const tot = Array(S).fill(0); let Ut = 0, Vt = 0;
    for (const i of ids) { n[i].forEach((x, s) => { tot[s] += x; }); Ut += U[i]; Vt += V[i]; }
    for (const i of ids) {
      const Uantes = U[i];
      n[i] = tot.map(x => x * V[i] / Vt); U[i] = Ut * V[i] / Vt;
      reg.Qint[i] += U[i] - Uantes;
    }
  }

  // Un paso de transferencias explícitas con la solución exponencial de cada par
  function transferir() {
    const dn = cs.map(() => Array(S).fill(0)), dU = cs.map(() => 0);
    for (let j = 0; j < N - 1; j++) {
      const a = j, b = j + 1, la = ntot(a) > VACIO, lb = ntot(b) > VACIO;
      // Gas por la válvula abierta, del lado de mayor presión al de menor
      if (abierta[j]) {
        const Pa = P(a), Pb = P(b), [de, a2] = Pa >= Pb ? [a, b] : [b, a], dP = Math.abs(Pa - Pb);
        if (dP > 0 && ntot(de) > VACIO) {
          const Tde = T(de), Ta2 = ntot(a2) > VACIO ? T(a2) : Tde;
          const rig = R * (Tde / V[de] + Ta2 / V[a2]);                 // d(ΔP)/dn, linealizado
          const total = dP / rig * (1 - Math.exp(-kv[j] * rig * DT));   // moles que pasan en el paso
          const nde = ntot(de), x = Math.min(total, nde);
          let H = 0;
          n[de].forEach((m, s) => { const d = x * m / nde; dn[de][s] -= d; dn[a2][s] += d; H += d * (cv[s] + R) * Tde; });
          dU[de] -= H; dU[a2] += H; reg.H[de] -= H; reg.H[a2] += H;
        }
        // Mezcla: la composición y la temperatura se igualan sin cambiar los
        // moles de cada lado (intercambio de igual número de moles)
        if (ss[j].mezcla !== false && la && lb) {
          const fr = 1 - Math.exp(-DT / (ss[j].tau ?? 0.5));
          const na = ntot(a), nb = ntot(b), k = na * nb / (na + nb) * fr, Ta = T(a), Tb = T(b);
          if (S > 1) {
            let H = 0;
            for (let s2 = 0; s2 < S; s2++) {
              const jx = (n[a][s2] / na - n[b][s2] / nb) * k;         // de a hacia b
              dn[a][s2] -= jx; dn[b][s2] += jx;
              H += jx * (cv[s2] + R) * (jx > 0 ? Ta : Tb);
            }
            dU[a] -= H; dU[b] += H; reg.Qint[a] -= H; reg.Qint[b] += H;
          }
          const Ca = capacidad(a), Cb = capacidad(b), inv = 1 / Ca + 1 / Cb;
          const q = (Ta - Tb) * fr / inv;
          dU[a] -= q; dU[b] += q; reg.Qint[a] -= q; reg.Qint[b] += q;
        }
      }
      // Calor por el separador
      const G = ss[j].G ?? 0;
      if (G > 0 && la && lb) {
        const Ca = capacidad(a), Cb = capacidad(b), Ta = T(a), Tb = T(b), inv = 1 / Ca + 1 / Cb;
        const q = (Ta - Tb) * (1 - Math.exp(-G * inv * DT)) / inv;      // de a hacia b
        dU[a] -= q; dU[b] += q; reg.Qint[a] -= q; reg.Qint[b] += q;
      }
    }
    for (let i = 0; i < N; i++) {
      const c = cs[i];
      if (bano[i] && ntot(i) > VACIO) {
        const C = capacidad(i), q = (c.Tb - T(i)) * C * (1 - Math.exp(-(c.Gb) * DT / C));
        dU[i] += q; reg.Qbano[i] += q;
      }
      if (cal[i] && (c.Fc ?? 0) > 0) {
        // Termostato: la potencia baja a cero en el último medio kelvin
        const fr = ntot(i) > VACIO && Number.isFinite(c.Tobj ?? Infinity) ? Math.max(0, Math.min(1, (c.Tobj - T(i)) / 0.5)) : 1;
        const q = c.Fc * fr * DT; dU[i] += q; reg.Qcal[i] += q;
      }
    }
    for (let i = 0; i < N; i++) { for (let s = 0; s < S; s++) n[i][s] = Math.max(0, n[i][s] + dn[i][s]); U[i] += dU[i]; if (ntot(i) <= VACIO) U[i] = 0; }
  }

  // Émbolos: presiones iguales al final del paso con una presión media común
  // para el trabajo (lo que hace un lado lo recibe el otro: Σ P̄·ΔV = 0)
  function equilibrarEmbolos() {
    for (const g of grupos) {
      if (g.length < 2) continue;
      const Vg = g.reduce((a, i) => a + V[i], 0);
      const k = g.map(i => R * ntot(i) / capacidad(i));              // P·V = k·U
      const Pm = g.reduce((a, i, q) => a + k[q] * U[i], 0) / Vg;
      const Vn = Pf => { const Pb = 0.5 * (Pm + Pf); return g.map((i, q) => (U[i] + Pb * V[i]) / (Pf / k[q] + Pb)); };
      let lo = Pm * 1e-6, hi = Pm * 1e6;
      for (let it = 0; it < 200 && hi - lo > 1e-14 * hi; it++) {
        const mid = 0.5 * (lo + hi), s = Vn(mid).reduce((a, x) => a + x, 0);
        if (s > Vg) lo = mid; else hi = mid;
      }
      const Pf = 0.5 * (lo + hi), Pb = 0.5 * (Pm + Pf), nuevos = Vn(Pf);
      // Corrección para que la suma de volúmenes sea exacta y el trabajo cancele
      const err = nuevos.reduce((a, x) => a + x, 0) - Vg;
      nuevos[nuevos.length - 1] -= err;
      g.forEach((i, q) => { const W = Pb * (nuevos[q] - V[i]); U[i] -= W; reg.W[i] += W; V[i] = nuevos[q]; });
    }
  }

  let ia = 0;
  for (let p = 0; p <= pasos; p++) {
    const t = p * DT;
    while (ia < acciones.length && acciones[ia].t <= t + DT / 2) aplicar(acciones[ia++], t);
    if (p % cada === 0) registrar(t);
    if (p === pasos) break;
    transferir();
    equilibrarEmbolos();
    if (U.some(x => !Number.isFinite(x)) || V.some(x => !(x > 0))) { incompleta = { t, motivo: 'El estado dejó de ser físico (volumen o energía no válidos).' }; break; }
  }
  return {
    muestras, eventos, especies, cv, N, U0, S0, incompleta, duracion: o.duracion, muestra: cada * DT, modo: o.modo,
    separadores: ss.map(s => s.tipo), grupos,
  };
}

/**
 * Estado interpolado de los recipientes en el instante t.
 * @param {ReturnType<typeof simularRecipientes>} sim @param {number} t
 */
export function estadoRecipientes(sim, t) {
  const ms = sim.muestras, x = Math.max(0, Math.min(ms.length - 1, t / sim.muestra));
  const i = Math.max(0, Math.min(ms.length - 2, Math.floor(x))), a = x - i, p = ms[i], q = ms[i + 1] ?? p;
  /** @param {any} u @param {any} v @returns {any} */
  const mezcla = (u, v) => (Array.isArray(u) ? u.map((e, k) => mezcla(e, v[k])) : typeof u === 'number' ? (Number.isNaN(u) || Number.isNaN(v) ? (a < 0.5 ? u : v) : u + (v - u) * a) : u);
  /** @type {any} */
  const s = {};
  for (const k of Object.keys(p)) s[k] = mezcla(p[k], q[k]);
  return s;
}

// ---------------------------------------------------------------------------
// Recipiente abierto: globo aerostático o recinto que pierde aire
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} EscenaAbierta
 * @property {number} V    Volumen de la envoltura o del recinto (m³)
 * @property {number} P0   Presión atmosférica al nivel del suelo (Pa)
 * @property {number} T0   Temperatura del aire exterior (K)
 * @property {number} Mm   Masa molar del aire (kg/mol)
 * @property {number} [f=5]  Grados de libertad del aire
 * @property {number} [M=Infinity] Masa de la estructura (kg); Infinity: recinto fijo
 * @property {number} [Fc=0] Potencia del quemador o la calefacción (W)
 * @property {number} [Tobj=Infinity] Termostato: la potencia baja a cero al llegar a esta temperatura (K)
 * @property {number} [G=0]  Pérdidas de calor hacia fuera (W/K)
 * @property {number} [g=9.8]
 * @property {number} [H=Infinity] Escala de altura de la atmósfera isoterma (m)
 * @property {number} [CdA=0] Coeficiente de arrastre por el área frontal (m²)
 * @property {number} [Ti] Temperatura inicial del aire interior (K); por omisión T0
 */

/**
 * Simula un recipiente abierto por abajo a la presión exterior. El aire de
 * dentro está a la presión de fuera; al calentarlo sale aire y su masa baja:
 * dQ = n·Cp·dT. Si es un globo, flota cuando ρ_ext·V·g ≥ (M + m_aire)·g y se
 * mueve en vertical con flotación, peso y arrastre.
 * @param {EscenaAbierta} e
 * @param {{t: number, tipo: 'calentador', valor: boolean}[]} [guion=[]]
 * @param {{duracion?: number, dt?: number, muestra?: number}} [opciones]
 */
export function simularAbierto(e, guion = [], opciones = {}) {
  const o = { duracion: 60, dt: 0.01, muestra: 0.05, ...opciones };
  for (const k of ['V', 'P0', 'T0', 'Mm']) if (!(e[k] > 0)) throw new Error(`El recipiente abierto necesita ${k} positivo.`);
  const R = R_GAS, f = e.f ?? 5, cp = (f / 2 + 1) * R, g = e.g ?? 9.8, M = e.M ?? Infinity, H = e.H ?? Infinity;
  const Fc = e.Fc ?? 0, G = e.G ?? 0, Tobj = e.Tobj ?? Infinity, CdA = e.CdA ?? 0, fijo = !Number.isFinite(M);
  const Pz = z => e.P0 * Math.exp(-z / H);
  const rhoExt = z => e.Mm * Pz(z) / (R * e.T0);
  const nIn = (T, z) => Pz(z) * e.V / (R * T);
  const acciones = guion.filter(a => a.tipo === 'calentador').sort((a, b) => a.t - b.t);
  let cal = false, ia = 0;
  const potencia = T => (cal ? Fc * Math.max(0, Math.min(1, (Tobj - T) / 0.5)) : 0);
  // Estado: T, altura z, velocidad w, calor del quemador Q, pérdidas Qp
  let s = { T: e.Ti ?? e.T0, z: 0, w: 0, Q: 0, Qp: 0 }, enSuelo = true;
  const n0 = nIn(s.T, 0);
  const margen = (T, z) => rhoExt(z) * e.V - M - e.Mm * nIn(T, z);   // (flotación − peso)/g
  /** @param {typeof s} x */
  const deriv = x => {
    const n = nIn(x.T, x.z), Pin = potencia(x.T), perd = G * (x.T - e.T0);
    const dz = enSuelo ? 0 : x.w;
    // Al subir baja la presión: el aire de dentro se enfría como en una expansión adiabática
    const dT = (Pin - perd) / (n * cp) - (R / cp) * x.T * dz / H;
    let dw = 0;
    if (!enSuelo && !fijo) {
      const masa = M + e.Mm * n, F = margen(x.T, x.z) * g - 0.5 * rhoExt(x.z) * CdA * x.w * Math.abs(x.w);
      dw = F / masa;
    }
    return { T: dT, z: dz, w: dw, Q: Pin, Qp: perd };
  };
  const suma = (a, b, h) => ({ T: a.T + b.T * h, z: a.z + b.z * h, w: a.w + b.w * h, Q: a.Q + b.Q * h, Qp: a.Qp + b.Qp * h });
  const muestras = [], eventos = [], DT = o.dt, cada = Math.max(1, Math.round(o.muestra / DT)), pasos = Math.round(o.duracion / DT);
  const registrar = t => {
    const n = nIn(s.T, s.z);
    muestras.push({ t, T: s.T, z: s.z, w: s.w, n, m: e.Mm * n, mSale: e.Mm * (n0 - n), rhoIn: e.Mm * Pz(s.z) / (R * s.T), rhoExt: rhoExt(s.z),
      B: rhoExt(s.z) * e.V * g, Peso: fijo ? NaN : (M + e.Mm * n) * g, Q: s.Q, Qp: s.Qp, Fq: potencia(s.T), enSuelo: enSuelo ? 1 : 0, P: Pz(s.z) });
  };
  for (let p = 0; p <= pasos; p++) {
    const t = p * DT;
    while (ia < acciones.length && acciones[ia].t <= t + DT / 2) {
      const a = acciones[ia++];
      if (cal !== !!a.valor) { cal = !!a.valor; eventos.push({ t, tipo: 'calentador', valor: cal, nombre: cal ? 'Se enciende el quemador' : 'Se apaga el quemador', T: s.T, z: s.z }); }
    }
    if (p % cada === 0) registrar(t);
    if (p === pasos) break;
    const antes = s, m0 = margen(s.T, 0);
    const k1 = deriv(s), k2 = deriv(suma(s, k1, DT / 2)), k3 = deriv(suma(s, k2, DT / 2)), k4 = deriv(suma(s, k3, DT));
    s = { T: s.T + DT / 6 * (k1.T + 2 * k2.T + 2 * k3.T + k4.T), z: s.z + DT / 6 * (k1.z + 2 * k2.z + 2 * k3.z + k4.z),
      w: s.w + DT / 6 * (k1.w + 2 * k2.w + 2 * k3.w + k4.w), Q: s.Q + DT / 6 * (k1.Q + 2 * k2.Q + 2 * k3.Q + k4.Q), Qp: s.Qp + DT / 6 * (k1.Qp + 2 * k2.Qp + 2 * k3.Qp + k4.Qp) };
    if (!fijo && enSuelo) {
      const m1 = margen(s.T, 0);
      if (m0 < 0 && m1 >= 0) {
        // Despegue: instante y temperatura por interpolación entre los dos pasos
        const fr = m0 / (m0 - m1), tE = t + fr * DT, TE = antes.T + fr * (s.T - antes.T);
        enSuelo = false;
        eventos.push({ t: tE, tipo: 'despegue', valor: true, nombre: 'El globo despega', T: TE, z: 0 });
      }
    } else if (!fijo && s.z <= 0 && s.w < 0) {
      s = { ...s, z: 0, w: 0 }; enSuelo = true;
      eventos.push({ t: t + DT, tipo: 'aterrizaje', valor: true, nombre: 'El globo toca el suelo', T: s.T, z: 0 });
    }
  }
  return { muestras, eventos, fijo, n0, cp, duracion: o.duracion, muestra: cada * DT, e: { ...e, f, g, M, H } };
}

/**
 * Temperatura del aire interior a la que despega un globo:
 * T1 = m·P·V·T0 / (m·P·V − M·R·T0).
 * @param {{Mm: number, P0: number, V: number, T0: number, M: number}} e @param {number} [R=R_GAS]
 */
export const temperaturaDespegue = (e, R = R_GAS) => e.Mm * e.P0 * e.V * e.T0 / (e.Mm * e.P0 * e.V - e.M * R * e.T0);

// ---------------------------------------------------------------------------
// Burbuja que sube por una columna de líquido
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} EscenaBurbuja
 * @property {number} V0     Volumen de la burbuja en el fondo (m³)
 * @property {number} prof   Profundidad de partida (m)
 * @property {number} P0     Presión sobre la superficie (Pa)
 * @property {number} rho    Densidad del líquido (kg/m³)
 * @property {number} [g=9.8]
 * @property {number} Tfondo Temperatura del líquido en el fondo (K)
 * @property {number} Tsup   Temperatura en la superficie (K)
 * @property {number} [rapidez=1] Rapidez de subida (m/s)
 * @property {number} [f=5]  Grados de libertad del gas de la burbuja
 */

/**
 * La burbuja sube despacio: en cada profundidad está a la presión
 * P = P0 + ρ·g·z y a la temperatura del líquido (lineal entre el fondo y la
 * superficie). Trabajo exacto: con T = a + b·z y P = P0 + c·z,
 * W = n·R·(b·P0 − a·c)/c · ln((P0 + c·z)/(P0 + c·z0)).
 * @param {EscenaBurbuja} e @param {{duracion?: number, muestra?: number}} [opciones]
 */
export function simularBurbuja(e, opciones = {}) {
  for (const k of ['V0', 'prof', 'P0', 'rho', 'Tfondo', 'Tsup']) if (!(e[k] > 0)) throw new Error(`La burbuja necesita ${k} positivo.`);
  const R = R_GAS, g = e.g ?? 9.8, u = e.rapidez ?? 1, f = e.f ?? 5;
  if (!(u > 0)) throw new Error('La rapidez de subida tiene que ser positiva.');
  const tSube = e.prof / u, o = { duracion: tSube * 1.15, muestra: tSube / 400, ...opciones };
  const c = e.rho * g, a = e.Tsup, b = (e.Tfondo - e.Tsup) / e.prof;
  const Pz = z => e.P0 + c * z, Tz = z => a + b * z;
  const n = Pz(e.prof) * e.V0 / (R * Tz(e.prof));
  const W = z => n * R * (b * e.P0 - a * c) / c * Math.log(Pz(z) / Pz(e.prof));
  const muestras = [], N = Math.round(o.duracion / o.muestra);
  for (let i = 0; i <= N; i++) {
    const t = i * o.muestra, z = Math.max(0, e.prof - u * t), P = Pz(z), T = Tz(z), V = n * R * T / P;
    const dU = n * f / 2 * R * (T - Tz(e.prof)), w = W(z);
    muestras.push({ t, z, P, T, V, dU, W: w, Q: dU + w });
  }
  return { muestras, eventos: [{ t: tSube, tipo: 'superficie', nombre: 'La burbuja llega a la superficie' }], n, f, duracion: o.duracion, muestra: o.muestra, e: { ...e, g, rapidez: u } };
}

/**
 * Estado interpolado de una corrida con muestras de números (abierto o burbuja).
 * @param {{muestras: Record<string, number>[], muestra: number}} sim @param {number} t
 * @returns {Record<string, number>}
 */
export function estadoMuestras(sim, t) {
  const ms = sim.muestras, x = Math.max(0, Math.min(ms.length - 1, t / sim.muestra));
  const i = Math.max(0, Math.min(ms.length - 2, Math.floor(x))), a = x - i, p = ms[i], q = ms[i + 1] ?? p;
  /** @type {Record<string, number>} */
  const s = {};
  for (const k in p) s[k] = p[k] + (q[k] - p[k]) * a;
  return s;
}
