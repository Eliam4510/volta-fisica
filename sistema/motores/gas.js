/* ==========================================================================
   Volta — motor de gas (Termodinámica · Laboratorio de gases)
   Motor macroscópico de parámetros concentrados (docs/modulos/03): un volumen
   de control de gas ideal en un cilindro vertical, cerrado por un émbolo con
   masa bajo la atmósfera P0.
   - Estado del gas: n, U, V → P = (2/f)·U/V, T = U/(n·Cv).
   - Émbolo con masa, movido por la diferencia de presiones, el peso y la
     atmósfera, con amortiguamiento viscoso b; unos topes lo detienen.
   - Paredes conductoras (flujo G·(T0 − T) desde un baño a T0) o adiabáticas.
   - Calentador de potencia fija.
   - Acciones programadas (guion): poner o quitar la pesa M, encender o apagar
     el calentador, cambiar las paredes, girar el cilindro.
   - Orientación: el cilindro puede estar inclinado un ángulo α respecto de la
     vertical (0° con la boca hacia arriba, 90° horizontal, 180° boca abajo);
     el peso del émbolo y de la pesa empuja hacia el gas con g·cos α. Una
     acción «giro» lo lleva despacio (en tauGiro) a otro ángulo.
   - Modo cuasiestático: el émbolo pasa por estados de equilibrio y la pesa
     se carga poco a poco.
   - Registro de energía: calor (calentador, baño, disipación), trabajo W,
     ΔU, y el destino del trabajo del gas en el émbolo.
   Puro: sin DOM. Lo usan la pantalla de Termodinámica y las pruebas.

   Contabilidad exacta de energía. En cada paso se usa la MISMA presión P*
   (la del punto medio, por iteración) para la fuerza del gas sobre el émbolo
   y para el trabajo del gas, y la velocidad se integra con la regla del
   punto medio (amortiguamiento implícito). Así, paso a paso y sin error de
   truncamiento en el balance:
     gas:    ΔU = Q_cal + Q_baño + E_dis − W                (primera ley)
     émbolo: W + E_mano = ΔE_k + ΔE_p + P0·ΔV + E_dis
   La energía disipada por el amortiguamiento (viscosidad del gas al mover el
   émbolo) y la de los choques con los topes vuelve al gas como calor: por
   eso una compresión brusca con paredes adiabáticas termina donde dice la
   termodinámica irreversible, y no en la adiabática reversible.
   E_mano: energía cinética que la mano da a la pesa (o se lleva con ella) al
   ponerla o quitarla con el émbolo en movimiento.
   ========================================================================== */

/** Constante de los gases (J/(mol·K)), valor exacto del SI 2019. */
export const R_GAS = 8.314462618;

/** Grados de libertad que almacenan energía en cada especie (U = f/2·nRT). */
export const GRADOS_LIBERTAD = Object.freeze({ mono: 3, di: 5 });

/**
 * Opciones de integración por omisión (las de la pantalla).
 * @type {Readonly<Required<OpcionesGas>>}
 */
export const OPCIONES_GAS = Object.freeze({
  modelo: /** @type {'dinamico'} */ ('dinamico'),
  duracion: 42,      // tiempo simulado (s)
  dt: 2e-4,          // paso de integración (s)
  muestra: 0.01,     // cada cuánto se guarda el estado (s)
  tauCarga: 4,       // cuasiestático: tiempo en cargar o descargar la pesa (s)
  tauGiro: 4,        // tiempo que tarda un giro del cilindro (s)
});

/**
 * @typedef {'pesa'|'calentador'|'paredes'|'giro'} TipoAccion
 */

/**
 * Acción programada: cambia la configuración en el instante t.
 * @typedef {Object} Accion
 * @property {number} t  Instante (s)
 * @property {TipoAccion} tipo
 * @property {boolean|'adiabaticas'|'conductoras'|number} valor
 *   pesa y calentador: true (poner, encender) o false; paredes: 'adiabaticas' o 'conductoras';
 *   giro: ángulo final del cilindro respecto de la vertical (°)
 */

/**
 * Escena del laboratorio de gases (unidades SI).
 * @typedef {Object} EscenaGas
 * @property {number} n         Cantidad de gas (mol)
 * @property {number} A         Sección del cilindro (m²)
 * @property {number} P0        Presión atmosférica exterior (Pa)
 * @property {number} T0        Temperatura del baño térmico (K)
 * @property {number} m         Masa del émbolo (kg)
 * @property {number} [M=0]     Masa de la pesa (kg)
 * @property {number} [g=9.8]   Gravedad (m/s²)
 * @property {number} [Fc=0]    Potencia del calentador (W)
 * @property {number} [G=0]     Conductancia térmica de las paredes conductoras (W/K)
 * @property {number} [b=0]     Amortiguamiento viscoso del émbolo (kg/s)
 * @property {number} [hMax=Infinity] Altura del gas con el émbolo apoyado en los topes (m)
 * @property {'mono'|'di'} [especie='mono'] Gas monoatómico (Cv = 3/2·R) o diatómico (Cv = 5/2·R)
 * @property {number} [f]       Grados de libertad; si se da, manda sobre la especie
 * @property {number} [angulo=0] Inclinación del cilindro respecto de la vertical (°); 0: boca arriba
 */

/**
 * @typedef {Object} OpcionesGas
 * @property {'dinamico'|'cuasiestatico'} [modelo='dinamico']
 * @property {number} [duracion=42] Tiempo simulado (s)
 * @property {number} [dt=2e-4]     Paso de integración (s)
 * @property {number} [muestra=0.01] Intervalo entre muestras (s); múltiplo de dt
 * @property {number} [tauCarga=4]  Cuasiestático: tiempo en cargar o descargar la pesa (s)
 * @property {number} [tauGiro=4]   Tiempo que tarda cada giro del cilindro (s)
 */

/**
 * Registro acumulado de energía desde t = 0 (J).
 * @typedef {Object} RegistroEnergia
 * @property {number} Qcal   Calor del calentador
 * @property {number} Qbano  Calor que entra desde el baño por las paredes
 * @property {number} Edis   Energía disipada (amortiguamiento y choques), devuelta al gas como calor
 * @property {number} W      Trabajo hecho por el gas sobre el émbolo
 * @property {number} Watm   Trabajo contra la atmósfera, P0·ΔV
 * @property {number} Ep     Energía potencial gravitatoria ganada por el émbolo y la pesa
 *   (trabajo contra la componente del peso a lo largo del cilindro)
 * @property {number} Emano  Energía cinética que la mano da a la pesa (o se lleva)
 */

/**
 * Estado muestreado del sistema.
 * @typedef {RegistroEnergia & {
 *   t: number, h: number, v: number, P: number, V: number, T: number, U: number, dU: number,
 *   Ek: number, me: number, carga: number, Fb: number, Fcal: number, ang: number
 * }} MuestraGas
 * h: altura del gas (m); v: velocidad del émbolo (m/s); dU = U − U0; Ek: energía
 * cinética del émbolo; me: masa que carga el gas (émbolo y pesa); carga: fracción
 * de la pesa apoyada (0 a 1); Fb, Fcal: flujos de calor del baño y del calentador (W);
 * ang: inclinación del cilindro (°).
 */

/**
 * Evento de la corrida, con una instantánea del gas.
 * @typedef {Object} EventoGas
 * @property {number} t
 * @property {string} nombre
 * @property {TipoAccion|'topes'} tipo
 * @property {boolean|string|number} valor
 * @property {number} P
 * @property {number} V
 * @property {number} T
 * @property {number} h
 * @property {number} Q   Calor total recibido hasta el evento (J)
 * @property {number} W   Trabajo total hecho hasta el evento (J)
 * @property {number} dU  Variación de energía interna hasta el evento (J)
 */

/** Nombre del evento que produce cada acción. */
export const NOMBRES_ACCION = Object.freeze({
  /** @param {boolean|string|number} v */
  pesa: v => (v ? 'Se añade la pesa' : 'Se quita la pesa'),
  /** @param {boolean|string|number} v */
  calentador: v => (v ? 'Se enciende el calentador' : 'Se apaga el calentador'),
  /** @param {boolean|string|number} v */
  paredes: v => (v === 'adiabaticas' ? 'Paredes adiabáticas' : 'Paredes conductoras'),
  /** @param {boolean|string|number} v */
  giro: v => `Se gira el cilindro hasta ${Number(v)}°`,
});

/**
 * Configuración en el instante t según las acciones programadas (ordenadas
 * por t). Antes de la primera acción: sin pesa, calentador apagado y paredes
 * conductoras.
 * @param {Accion[]} guion
 * @param {number} t
 * @returns {{pesa: boolean, cal: boolean, adiab: boolean}}
 */
export function banderas(guion, t) {
  const b = { pesa: false, cal: false, adiab: false };
  for (const a of guion) {
    if (a.t > t + 1e-9) break;
    if (a.tipo === 'pesa') b.pesa = !!a.valor;
    else if (a.tipo === 'calentador') b.cal = !!a.valor;
    else if (a.tipo === 'paredes') b.adiab = a.valor === 'adiabaticas';
  }
  return b;
}

/**
 * Simula la escena con su guion de acciones y devuelve las muestras (cada
 * `muestra` s) y los eventos. El gas parte en equilibrio con el baño, con el
 * émbolo en reposo y sin la pesa.
 * @param {EscenaGas} p
 * @param {Accion[]} [guion=[]]
 * @param {OpcionesGas} [opciones]
 */
export function simularGas(p, guion = [], opciones = {}) {
  const o = { ...OPCIONES_GAS, ...opciones };
  const DUR = o.duracion, DT = o.dt, MUESTRA = o.muestra, TAU_Q = o.tauCarga, TAU_G = o.tauGiro;
  const { n, A, P0, T0, m } = p;
  const g = p.g ?? 9.8, Mp = p.M ?? 0, Fc = p.Fc ?? 0, Gc = p.G ?? 0, b = p.b ?? 0;
  const H_MAX = p.hMax ?? Infinity;
  const especie = p.especie ?? 'mono';
  const f = p.f ?? GRADOS_LIBERTAD[especie];
  if (!(f > 0)) throw new Error(`Especie de gas desconocida: ${especie}`);
  const cv = f / 2 * R_GAS, k = 2 / f;            // U = (f/2)·nRT = PV/k
  const cuasi = o.modelo === 'cuasiestatico';
  const acciones = guion.filter(a => a.t <= DUR).sort((x, y) => x.t - y.t);
  // Orientación: el peso empuja hacia el gas con g·cos α; un giro lleva α
  // linealmente del valor que tenga al pedido en TAU_G segundos
  const RAD = Math.PI / 180;
  let ang = p.angulo ?? 0, ang0 = ang, angFin = ang, tGiro = 0;
  const gEje = () => g * Math.cos(ang * RAD);
  if (!(P0 + m * gEje() / A > 0)) throw new Error('Con esa inclinación el peso del émbolo supera a la atmósfera: el émbolo se saldría del cilindro.');
  // Sin topes, un giro que deja el peso por encima de la atmósfera saca el émbolo del cilindro
  for (const a of acciones) {
    if (a.tipo === 'giro' && !Number.isFinite(H_MAX) && !(P0 + (m + Mp) * g * Math.cos(Number(a.valor) * RAD) / A > 0)) {
      throw new Error('Ese giro saca el émbolo del cilindro: añade topes o reduce la masa.');
    }
  }

  // Estado inicial: equilibrio con el baño, émbolo en reposo, sin pesa
  let pesa = false, cal = false, adiab = false, carga = 0, me = m;
  let h = Math.min(H_MAX, n * R_GAS * T0 / (P0 + me * gEje() / A) / A), v = 0;
  let Vg = A * h, U = n * cv * T0, Pg = k * U / Vg;
  let enTope = h >= H_MAX - 1e-12;
  const U0 = U;
  /** @type {RegistroEnergia} */
  const r = { Qcal: 0, Qbano: 0, Edis: 0, W: 0, Watm: 0, Ep: 0, Emano: 0 };
  let Fb = 0, Fcal = 0;
  /** @type {MuestraGas[]} */
  const muestras = [];
  /** @type {EventoGas[]} */
  const eventos = [];
  const T = () => U / (n * cv);
  const instante = () => ({ P: Pg, V: Vg, T: T(), h, Q: r.Qcal + r.Qbano + r.Edis, W: r.W, dU: U - U0 });

  /** @param {number} t */
  function registrar(t) {
    muestras.push({ t, h, v, P: Pg, V: Vg, T: T(), U, dU: U - U0, Ek: cuasi ? 0 : 0.5 * me * v * v, me,
      carga: cuasi ? carga : (pesa ? 1 : 0), Fb, Fcal, ang, ...r });
  }
  /**
   * @param {number} t @param {string} nombre
   * @param {TipoAccion|'topes'} tipo @param {boolean|string|number} valor
   */
  function evento(t, nombre, tipo, valor) { eventos.push({ t, nombre, tipo, valor, ...instante() }); }

  /** @param {Accion} a */
  function aplicar(a) {
    if (a.tipo === 'pesa') {
      if (!!a.valor === pesa) return;
      pesa = !!a.valor;
      if (!cuasi) {
        r.Emano += (pesa ? 1 : -1) * 0.5 * Mp * v * v;
        me = m + (pesa ? Mp : 0);
      }
    } else if (a.tipo === 'calentador') { if (!!a.valor === cal) return; cal = !!a.valor; }
    else if (a.tipo === 'paredes') { const ad = a.valor === 'adiabaticas'; if (ad === adiab) return; adiab = ad; }
    else if (a.tipo === 'giro') {
      const fin = Number(a.valor);
      if (!Number.isFinite(fin) || fin === angFin) return;
      ang0 = ang; angFin = fin; tGiro = a.t;
    }
    else return;
    evento(a.t, NOMBRES_ACCION[a.tipo](a.valor), a.tipo, a.valor);
  }

  // Calor del paso (explícito en T: el tiempo térmico es de segundos y el paso de 0.2 ms)
  function calor() {
    Fcal = cal ? Fc : 0;
    Fb = adiab ? 0 : Gc * (T0 - T());
    r.Qcal += Fcal * DT; r.Qbano += Fb * DT;
    return (Fcal + Fb) * DT;
  }

  // Ángulo del cilindro al final del paso que empieza en t
  /** @param {number} t */
  function girar(t) {
    if (ang === angFin) return;
    const s = TAU_G > 0 ? Math.min(1, (t + DT - tGiro) / TAU_G) : 1;
    ang = s >= 1 ? angFin : ang0 + (angFin - ang0) * s;
  }

  // El calor del paso entra en el registro después de decidir si el émbolo
  // deja los topes: así el evento guarda el estado al principio del paso, con
  // Q, W y ΔU del mismo instante.
  /** @param {number} t */
  function pasoDinamico(t) {
    girar(t);
    const gE = gEje(), F0 = -P0 * A - me * gE;         // atmósfera y peso, hacia el gas
    if (enTope) {
      if (Pg * A + F0 >= 0) { U += calor(); Pg = k * U / Vg; v = 0; return; }   // apoyado en los topes
      enTope = false; evento(t, 'El émbolo deja los topes', 'topes', false);
    }
    const dQ = calor();
    let Ps = Pg;
    let s = { v1: v, dh: 0, eDis: 0, W: 0, V1: Vg, U1: U, P1: Pg, choque: false };
    for (let it = 0; it < 3; it++) {
      const c1 = b * DT / (2 * me);
      let v1 = (v * (1 - c1) + DT / me * (Ps * A + F0)) / (1 + c1);
      const vm = 0.5 * (v + v1);
      let dh = vm * DT, eDis = b * vm * vm * DT, choque = false;
      if (h + dh > H_MAX) {
        // Choque inelástico con los topes: lo que pierde la energía cinética se disipa
        dh = H_MAX - h; v1 = 0; choque = true;
        eDis = (Ps * A + F0) * dh + 0.5 * me * v * v;
      }
      const W = Ps * A * dh, V1 = A * (h + dh), U1 = U + dQ + eDis - W;
      s = { v1, dh, eDis, W, V1, U1, P1: k * U1 / V1, choque };
      Ps = 0.5 * (Pg + s.P1);                          // presión del punto medio para la siguiente iteración
    }
    h += s.dh; v = s.v1; Vg = s.V1; U = s.U1; Pg = s.P1;
    r.W += s.W; r.Watm += P0 * A * s.dh; r.Ep += me * gE * s.dh; r.Edis += s.eDis;
    if (s.choque) { enTope = true; evento(t + DT, 'El émbolo llega a los topes', 'topes', true); }
  }

  /** @param {number} t */
  function pasoCuasi(t) {
    const objetivo = pesa ? 1 : 0;
    carga = objetivo > carga ? Math.min(objetivo, carga + DT / TAU_Q) : Math.max(objetivo, carga - DT / TAU_Q);
    me = m + carga * Mp;
    girar(t);
    const Pe = P0 + me * gEje() / A;                   // presión que equilibra el émbolo
    if (enTope) {
      if (Pg >= Pe) { U += calor(); Pg = k * U / Vg; v = 0; return; }
      enTope = false; evento(t, 'El émbolo deja los topes', 'topes', false);
    }
    const dQ = calor();
    // Siguiente estado de equilibrio: U1 = Pe·V1/k = U + dQ − ½(Pg + Pe)(V1 − V)
    let V1 = (U + dQ + 0.5 * (Pg + Pe) * Vg) / (Pe / k + 0.5 * (Pg + Pe)), llega = false;
    if (V1 > A * H_MAX || !(Pe > 0)) { V1 = A * H_MAX; llega = true; }
    const W = 0.5 * (Pg + Pe) * (V1 - Vg), dh = V1 / A - h;
    U += dQ - W;
    r.W += W; r.Watm += P0 * A * dh; r.Ep += W - P0 * A * dh;
    v = dh / DT; h = V1 / A; Vg = V1; Pg = k * U / Vg;
    if (llega) { enTope = true; v = 0; evento(t + DT, 'El émbolo llega a los topes', 'topes', true); }
  }

  const pasos = Math.round(DUR / DT), cada = Math.round(MUESTRA / DT);
  let ia = 0;
  for (let i = 0; i <= pasos; i++) {
    const t = i * DT;
    while (ia < acciones.length && acciones[ia].t <= t + DT / 2) aplicar(acciones[ia++]);
    if (i % cada === 0) registrar(t);
    if (i === pasos) break;
    if (cuasi) pasoCuasi(t); else pasoDinamico(t);
  }
  eventos.sort((x, y) => x.t - y.t);
  return {
    muestras, eventos, n, A, P0, T0, g, m, M: Mp, f, cv, cp: cv + R_GAS, gam: (f + 2) / f, U0,
    hMax: H_MAX, cuasi, modelo: o.modelo, duracion: DUR, muestra: cada * DT,
  };
}

/**
 * Estado en el instante t, interpolado linealmente entre muestras. Las
 * banderas de configuración no se interpolan: salen del guion (banderas()).
 * @param {ReturnType<typeof simularGas>} sim
 * @param {number} t
 * @returns {MuestraGas}
 */
export function estadoEn(sim, t) {
  /** @type {Record<string, number>[]} */
  const ms = /** @type {any} */ (sim.muestras);
  const x = Math.max(0, Math.min(ms.length - 1, t / sim.muestra));
  const i = Math.max(0, Math.min(ms.length - 2, Math.floor(x))), a = x - i, p = ms[i], q = ms[i + 1] ?? p;
  /** @type {Record<string, number>} */
  const s = {};
  for (const k in p) s[k] = p[k] + (q[k] - p[k]) * a;
  return /** @type {any} */ (s);
}

/**
 * Calor total recibido por el gas hasta la muestra (J): calentador, baño y
 * energía disipada que vuelve al gas.
 * @param {RegistroEnergia} s
 */
export const calorTotal = s => s.Qcal + s.Qbano + s.Edis;

/**
 * Residuo de la primera ley, Q − W − ΔU (J). Cero salvo redondeo.
 * @param {RegistroEnergia & {dU: number}} s
 */
export const residuoGas = s => calorTotal(s) - s.W - s.dU;

/**
 * Residuo del balance del émbolo, W + E_mano − (P0·ΔV + ΔE_p + E_k + E_dis) (J).
 * Cero salvo redondeo.
 * @param {RegistroEnergia & {Ek: number}} s
 */
export const residuoEmbolo = s => s.W + s.Emano - (s.Watm + s.Ep + s.Ek + s.Edis);
