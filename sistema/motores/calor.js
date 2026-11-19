/* ==========================================================================
   Volta — motor de calor y calorimetría (Termodinámica · Calor)
   Cuerpos con masa, calor específico y temperatura que intercambian calor
   por contactos de conductancia G (W/K), con el aire a temperatura fija o
   aislados; calentadores de potencia fija (efecto Joule, P = V²/R); cambio
   de fase sólido → líquido con calor latente; y un vehículo cuyo motor
   convierte energía química en cinética (con un rendimiento) y cuyos frenos
   convierten la cinética en calor.
   Estado por cuerpo: la entalpía H (J). La temperatura sale de H: en un
   cuerpo con fusión hay una meseta a T_f mientras se funde (fracción
   x = (H − H_sólido)/(m·L)).
   Cada paso aplica a cada contacto la solución exponencial del par con las
   capacidades del momento (estable con cualquier paso; en la meseta la
   capacidad es infinita). Lo que sale de un cuerpo entra en el otro con el
   mismo número: la energía cierra hasta el redondeo.
     Σ ΔH = Q_cal + Q_aire + E_química − ΔE_k
   Un motor nunca aborta una simulación válida; solo lanza con escenas que no
   describen una situación física.
   Puro: sin DOM. Lo usan la pantalla «Calor y calorimetría» y las pruebas.
   ========================================================================== */

/**
 * @typedef {Object} CuerpoTermico
 * @property {string} nombre
 * @property {number} m   Masa (kg)
 * @property {number} c   Calor específico (J/(kg·K)); con fusión, el del sólido
 * @property {number} T   Temperatura inicial (K)
 * @property {{Tf: number, L: number, cl: number}} [fusion]  Temperatura de fusión (K), calor latente (J/kg) y calor específico del líquido
 * @property {number} [x=0]  Fracción ya fundida al empezar (solo si T = T_f)
 */

/** @typedef {{a: number, b: number, G: number, activo?: boolean}} Contacto */
/** @typedef {{cuerpo: number, P: number, activo?: boolean}} Calentador */

/**
 * Vehículo: el motor da la potencia P a la energía cinética hasta vmax
 * gastando P/η de energía química (el resto calienta el cuerpo `motor`); los
 * frenos lo paran con la fuerza F y su energía cinética calienta el cuerpo
 * `frenos`.
 * @typedef {{m: number, v0?: number, P: number, eta: number, F: number, vmax: number, motor: number, frenos: number}} Vehiculo
 */

/**
 * @typedef {Object} EscenaCalor
 * @property {CuerpoTermico[]} cuerpos
 * @property {Contacto[]} [contactos]
 * @property {{T: number, G: number[]}} [ambiente]  Aire a temperatura fija; conductancia con cada cuerpo (W/K)
 * @property {Calentador[]} [calentadores]
 * @property {Vehiculo} [vehiculo]
 */

/**
 * Acción programada.
 * @typedef {{t: number, tipo: 'contacto'|'calentador'|'acelerar'|'frenar', i?: number, valor: boolean}} AccionCalor
 */

/** Agua, hielo y materiales comunes (calor específico en J/(kg·K)). */
export const MATERIALES = Object.freeze({
  agua: { nombre: 'Agua', c: 4186 },
  hielo: { nombre: 'Hielo', c: 2100, fusion: { Tf: 273.15, L: 334e3, cl: 4186 } },
  cobre: { nombre: 'Cobre', c: 385 },
  aluminio: { nombre: 'Aluminio', c: 897 },
  hierro: { nombre: 'Hierro', c: 449 },
  acero: { nombre: 'Acero', c: 470 },
  vidrio: { nombre: 'Vidrio', c: 840 },
});

/** Capacidad calorífica de una mezcla de cuerpos sin cambio de fase: Σ m·c (J/K). */
export const capacidadTotal = cuerpos => cuerpos.reduce((s, b) => s + b.m * b.c, 0);

/**
 * Temperatura de equilibrio de cuerpos sin cambio de fase que solo
 * intercambian calor entre sí: T = Σ m·c·T / Σ m·c.
 * @param {{m: number, c: number, T: number}[]} cuerpos
 */
export const temperaturaMezcla = cuerpos => cuerpos.reduce((s, b) => s + b.m * b.c * b.T, 0) / capacidadTotal(cuerpos);

// ---------------------------------------------------------------------------
// Entalpía ↔ temperatura
// ---------------------------------------------------------------------------

/**
 * Entalpía de un cuerpo (J) a la temperatura T con la fracción fundida x.
 * Sin fusión: H = m·c·T. Con fusión, el cero es el sólido a T_f:
 * H = m·c_s·(T − T_f) (sólido), m·L·x (meseta), m·L + m·c_l·(T − T_f) (líquido).
 * @param {CuerpoTermico} b @param {number} T @param {number} [x=0]
 */
export function entalpia(b, T, x = 0) {
  if (!b.fusion) return b.m * b.c * T;
  const { Tf, L, cl } = b.fusion;
  if (T < Tf) return b.m * b.c * (T - Tf);
  if (T > Tf) return b.m * L + b.m * cl * (T - Tf);
  return b.m * L * Math.max(0, Math.min(1, x));
}

/**
 * Temperatura, fracción fundida y capacidad (dH/dT, J/K; Infinity en la
 * meseta) de un cuerpo con entalpía H.
 * @param {CuerpoTermico} b @param {number} H
 */
export function estadoTermico(b, H) {
  if (!b.fusion) return { T: H / (b.m * b.c), x: 0, C: b.m * b.c };
  const { Tf, L, cl } = b.fusion, mL = b.m * L;
  if (H < 0) return { T: Tf + H / (b.m * b.c), x: 0, C: b.m * b.c };
  if (H <= mL) return { T: Tf, x: H / mL, C: Infinity };
  return { T: Tf + (H - mL) / (b.m * cl), x: 1, C: b.m * cl };
}

/**
 * Valida la escena y lanza un Error si no describe cuerpos posibles.
 * @param {EscenaCalor} e
 */
function validar(e) {
  if (!Array.isArray(e.cuerpos) || !e.cuerpos.length) throw new Error('Falta al menos un cuerpo.');
  e.cuerpos.forEach((b, i) => {
    if (!(b.m > 0) || !(b.c > 0)) throw new Error(`El cuerpo ${b.nombre || i + 1} necesita masa y calor específico positivos.`);
    if (!(b.T > 0)) throw new Error(`El cuerpo ${b.nombre || i + 1} necesita una temperatura positiva (en kelvin).`);
    if (b.fusion && !(b.fusion.Tf > 0 && b.fusion.L > 0 && b.fusion.cl > 0)) throw new Error(`La fusión de ${b.nombre || i + 1} necesita temperatura, calor latente y calor específico del líquido positivos.`);
  });
  const N = e.cuerpos.length, ok = i => Number.isInteger(i) && i >= 0 && i < N;
  for (const c of e.contactos || []) if (!ok(c.a) || !ok(c.b) || c.a === c.b || !(c.G >= 0)) throw new Error('Cada contacto une dos cuerpos distintos con una conductancia no negativa.');
  for (const c of e.calentadores || []) if (!ok(c.cuerpo) || !(c.P >= 0)) throw new Error('Cada calentador va en un cuerpo y tiene una potencia no negativa.');
  if (e.ambiente) {
    if (!(e.ambiente.T > 0)) throw new Error('El aire necesita una temperatura positiva.');
    if (!Array.isArray(e.ambiente.G) || e.ambiente.G.length !== N || e.ambiente.G.some(g => !(g >= 0))) throw new Error('El aire necesita una conductancia no negativa con cada cuerpo.');
  }
  const v = e.vehiculo;
  if (v) {
    if (!(v.m > 0) || !(v.P >= 0) || !(v.eta > 0 && v.eta <= 1) || !(v.F >= 0) || !(v.vmax > 0)) throw new Error('El vehículo necesita masa, potencia, rendimiento entre 0 y 1, fuerza de frenado y rapidez máxima válidos.');
    if (!ok(v.motor) || !ok(v.frenos)) throw new Error('El motor y los frenos del vehículo tienen que ser cuerpos de la escena.');
  }
}

/**
 * Temperatura final de cuerpos aislados del exterior y todos en contacto
 * (con fusión incluida): la entalpía total se conserva y al final la
 * temperatura es la misma en todos. Bisección sobre T.
 * @param {EscenaCalor} e
 * @returns {{T: number, x: number[]}}
 */
export function equilibrioCalor(e) {
  validar(e);
  const Htot = e.cuerpos.reduce((s, b) => s + entalpia(b, b.T, b.x ?? 0), 0);
  const Hde = T => e.cuerpos.reduce((s, b) => s + entalpia(b, T, 0), 0);
  // Mesetas: si la entalpía total cae dentro de la meseta de un cuerpo, T = T_f
  for (const b of e.cuerpos) {
    if (!b.fusion) continue;
    const Tf = b.fusion.Tf, H0 = Hde(Tf), H1 = H0 + b.m * b.fusion.L;
    if (Htot >= H0 && Htot <= H1) return { T: Tf, x: e.cuerpos.map(q => (q === b ? (Htot - H0) / (b.m * b.fusion.L) : q.fusion ? (q.fusion.Tf < Tf ? 1 : 0) : 0)) };
  }
  // Fuera de las mesetas, H(T) es continua y creciente: bisección
  let lo = 1e-3, hi = Math.max(...e.cuerpos.map(b => b.T)) * 2 + 1000;
  for (let k = 0; k < 200; k++) { const mid = 0.5 * (lo + hi); if (Hde(mid) < Htot) lo = mid; else hi = mid; }
  const T = 0.5 * (lo + hi);
  return { T, x: e.cuerpos.map(b => (b.fusion ? (T > b.fusion.Tf ? 1 : 0) : 0)) };
}

/**
 * Simula los cuerpos con su guion de acciones.
 * @param {EscenaCalor} esc
 * @param {AccionCalor[]} [guion=[]]
 * @param {{duracion?: number, dt?: number, muestra?: number}} [opciones]
 */
export function simularCalor(esc, guion = [], opciones = {}) {
  validar(esc);
  const o = { duracion: 60, dt: 0.01, muestra: 0.1, ...opciones };
  const B = esc.cuerpos, N = B.length, DT = o.dt;
  const cada = Math.max(1, Math.round(o.muestra / DT)), pasos = Math.round(o.duracion / DT);
  const contactos = (esc.contactos || []).map(c => ({ ...c, activo: c.activo !== false }));
  const calentadores = (esc.calentadores || []).map(c => ({ ...c, activo: !!c.activo }));
  const amb = esc.ambiente || null, veh = esc.vehiculo || null;
  const acciones = guion.filter(a => a.t <= o.duracion + 1e-12).slice().sort((a, b) => a.t - b.t);

  const H = B.map(b => entalpia(b, b.T, b.x ?? 0)), H0 = H.slice();
  const est = () => H.map((h, i) => estadoTermico(B[i], h));
  // Registro (J): calor eléctrico por cuerpo, calor del aire por cuerpo,
  // calor recibido por cada cuerpo por contactos, energía química gastada,
  // calor del motor y de los frenos.
  const reg = { Qcal: B.map(() => 0), Qaire: B.map(() => 0), Qcont: B.map(() => 0), Equim: 0, Qmotor: 0, Qfrenos: 0 };
  let v = veh ? veh.v0 ?? 0 : 0, acelera = false, frena = false;
  const Ek = () => (veh ? 0.5 * veh.m * v * v : 0), Ek0 = Ek();
  const flujos = contactos.map(() => 0);    // flujo de a hacia b en el último paso (W)
  const muestras = [], eventos = [];

  const NOMBRES = {
    contacto: (val, i) => (val ? `Se ponen en contacto ${B[contactos[i].a].nombre} y ${B[contactos[i].b].nombre}` : `Se separan ${B[contactos[i].a].nombre} y ${B[contactos[i].b].nombre}`),
    calentador: (val, i) => (val ? `Se enciende el calentador de ${B[calentadores[i].cuerpo].nombre}` : `Se apaga el calentador de ${B[calentadores[i].cuerpo].nombre}`),
    acelerar: val => (val ? 'El motor empieza a acelerar' : 'El motor deja de acelerar'),
    frenar: val => (val ? 'Se pisa el freno' : 'Se suelta el freno'),
  };
  const instante = () => { const s = est(); return { T: s.map(q => q.T), x: s.map(q => q.x), v, Ek: Ek() }; };
  function evento(t, tipo, valor, nombre, i) { eventos.push({ t, tipo, valor, nombre, i, ...instante() }); }

  /** @param {AccionCalor} a @param {number} t */
  function aplicar(a, t) {
    const val = !!a.valor;
    if (a.tipo === 'contacto') { const c = contactos[a.i ?? -1]; if (!c || c.activo === val) return; c.activo = val; }
    else if (a.tipo === 'calentador') { const c = calentadores[a.i ?? -1]; if (!c || c.activo === val) return; c.activo = val; }
    else if (a.tipo === 'acelerar') { if (!veh || acelera === val) return; acelera = val; if (val) frena = false; }
    else if (a.tipo === 'frenar') { if (!veh || frena === val) return; frena = val; if (val) acelera = false; }
    else return;
    evento(t, a.tipo, val, NOMBRES[a.tipo](val, a.i ?? 0), a.i ?? 0);
  }

  function registrar(t) {
    const s = est();
    muestras.push({
      t, T: s.map(q => q.T), x: s.map(q => q.x), H: H.slice(), dH: H.map((h, i) => h - H0[i]),
      Qcal: reg.Qcal.slice(), Qaire: reg.Qaire.slice(), Qcont: reg.Qcont.slice(), flujos: flujos.slice(),
      Equim: reg.Equim, Qmotor: reg.Qmotor, Qfrenos: reg.Qfrenos, v, Ek: Ek(), dEk: Ek() - Ek0,
      contactos: contactos.map(c => (c.activo ? 1 : 0)), calentadores: calentadores.map(c => (c.activo ? 1 : 0)),
    });
  }

  function paso(t) {
    const s = est(), dH = B.map(() => 0);
    contactos.forEach((c, k) => {
      flujos[k] = 0;
      if (!c.activo || !(c.G > 0)) return;
      const a = s[c.a], b = s[c.b], inv = 1 / a.C + 1 / b.C;
      const q = inv > 0 ? (a.T - b.T) * (1 - Math.exp(-c.G * inv * DT)) / inv : c.G * (a.T - b.T) * DT;
      dH[c.a] -= q; dH[c.b] += q; reg.Qcont[c.a] -= q; reg.Qcont[c.b] += q;
      flujos[k] = q / DT;
    });
    if (amb) B.forEach((_, i) => {
      const G = amb.G[i]; if (!(G > 0)) return;
      const inv = 1 / s[i].C, q = inv > 0 ? (amb.T - s[i].T) * (1 - Math.exp(-G * inv * DT)) / inv : G * (amb.T - s[i].T) * DT;
      dH[i] += q; reg.Qaire[i] += q;
    });
    for (const c of calentadores) if (c.activo && c.P > 0) { const q = c.P * DT; dH[c.cuerpo] += q; reg.Qcal[c.cuerpo] += q; }
    if (veh) {
      if (acelera && veh.P > 0) {
        const E0 = Ek(), E1 = Math.min(0.5 * veh.m * veh.vmax ** 2, E0 + veh.P * DT), dE = E1 - E0;
        if (dE > 0) {
          const quim = dE / veh.eta, qm = quim - dE;
          reg.Equim += quim; reg.Qmotor += qm; dH[veh.motor] += qm;
          v = Math.sqrt(2 * E1 / veh.m);
        }
        if (E1 >= 0.5 * veh.m * veh.vmax ** 2 - 1e-9) { acelera = false; evento(t + DT, 'crucero', true, 'Llega a la rapidez de crucero', 0); }
      } else if (frena && veh.F > 0 && v > 0) {
        const E0 = Ek(); v = Math.max(0, v - veh.F / veh.m * DT);
        const q = E0 - Ek(); reg.Qfrenos += q; dH[veh.frenos] += q;
        if (v === 0) { frena = false; evento(t + DT, 'parada', true, 'El vehículo se detiene', 0); }
      }
    }
    for (let i = 0; i < N; i++) H[i] += dH[i];
  }

  let ia = 0;
  for (let p = 0; p <= pasos; p++) {
    const t = p * DT;
    while (ia < acciones.length && acciones[ia].t <= t + DT / 2) aplicar(acciones[ia++], t);
    if (p % cada === 0) registrar(t);
    if (p === pasos) break;
    paso(t);
  }
  eventos.sort((a, b) => a.t - b.t);
  return { muestras, eventos, cuerpos: B, contactos: contactos.map(c => ({ a: c.a, b: c.b, G: c.G })), H0, Ek0, duracion: o.duracion, muestra: cada * DT };
}

/**
 * Residuo del balance de energía de una muestra (J):
 * Σ ΔH − (Q_cal + Q_aire + E_química − ΔE_k). Cero salvo redondeo.
 * @param {ReturnType<typeof simularCalor>['muestras'][number]} s
 */
export function residuoCalor(s) {
  const suma = a => a.reduce((x, y) => x + y, 0);
  return suma(s.dH) - (suma(s.Qcal) + suma(s.Qaire) + s.Equim - s.dEk);
}

/**
 * Estado interpolado en el instante t (números y listas de números).
 * @param {ReturnType<typeof simularCalor>} sim @param {number} t
 * @returns {any}
 */
export function estadoCalor(sim, t) {
  const ms = sim.muestras, x = Math.max(0, Math.min(ms.length - 1, t / sim.muestra));
  const i = Math.max(0, Math.min(ms.length - 2, Math.floor(x))), a = x - i, p = ms[i], q = ms[i + 1] ?? p;
  /** @param {any} u @param {any} w @returns {any} */
  const mezcla = (u, w) => (Array.isArray(u) ? u.map((e, k) => mezcla(e, w[k])) : typeof u === 'number' ? u + (w - u) * a : u);
  /** @type {any} */
  const s = {};
  for (const k of Object.keys(p)) s[k] = mezcla(p[k], q[k]);
  return s;
}
