/* ==========================================================================
   Volta — motor de proyectiles (Mecánica · Cinemática y proyectiles)
   Partícula lanzada desde una plataforma hacia una pendiente y el suelo,
   con choques de restitución e. Solución exacta por tramos: en cada tramo
   el movimiento es analítico y los eventos (choques, deslizamiento,
   rodadura) se calculan resolviendo la ecuación del contacto.
   Puro: sin DOM. Lo usan la pantalla de Mecánica y las pruebas.
   ========================================================================== */

/**
 * @typedef {Object} ParametrosProyectil
 * @property {number} h        Altura de la plataforma (m)
 * @property {number} theta    Ángulo de la pendiente (rad)
 * @property {number} v0       Rapidez de lanzamiento (m/s)
 * @property {number} [alfa=0] Ángulo de lanzamiento sobre la horizontal (rad)
 * @property {number} [e=1]    Coeficiente de restitución
 * @property {number} [g=9.8]  Gravedad (m/s²)
 * @property {number} [masa=1] Masa (kg)
 * @property {number} [duracion=3] Tiempo simulado (s)
 * @property {number} [umbral=0.12] Rapidez normal (m/s) bajo la cual deja de rebotar
 */

/**
 * @typedef {Object} Evento
 * @property {number} t
 * @property {string} nombre
 * @property {number} x
 * @property {number} y
 * @property {number} [perdida] Energía cinética perdida en el evento (J)
 */

/** Raíces reales de a·t² + b·t + c = 0 (lineal si a ≈ 0). */
export function raices(a, b, c) {
  if (Math.abs(a) < 1e-14) return Math.abs(b) < 1e-14 ? [] : [-c / b];
  const d = b * b - 4 * a * c;
  if (d < 0) return [];
  const s = Math.sqrt(d);
  // Forma numéricamente estable (evita cancelación catastrófica)
  const q = -0.5 * (b + Math.sign(b || 1) * s);
  const r1 = q / a, r2 = q !== 0 ? c / q : r1;
  return r1 < r2 ? [r1, r2] : [r2, r1];
}

/**
 * Simula el lanzamiento y devuelve los tramos analíticos y los eventos.
 * @param {ParametrosProyectil} p
 */
export function simularProyectil(p) {
  const { h, theta: th, v0 } = p;
  const alfa = p.alfa ?? 0, e = p.e ?? 1, g = p.g ?? 9.8, M = p.masa ?? 1;
  const DUR = p.duracion ?? 3, UMBRAL = p.umbral ?? 0.12;
  const sn = Math.sin(th), cs = Math.cos(th), tn = Math.tan(th), L = h / tn, S = h / sn;
  const tramos = [], /** @type {Evento[]} */ eventos = [];
  /** @type {any} */
  let st = { tipo: 'vuelo', t0: 0, x: 0, y: h, vx: v0 * Math.cos(alfa), vy: v0 * Math.sin(alfa) };
  eventos.push({ t: 0, nombre: 'Sale de la plataforma', x: 0, y: h });
  // Límite de eventos. Cerca del límite se declara el contacto (regla post-Zeno):
  // la acumulación de rebotes infinitos en tiempo finito termina en reposo.
  const LIMITE = 400;
  for (let k = 0; k < LIMITE && st.t0 < DUR; k++) {
    const zeno = k >= LIMITE - 5;
    if (st.tipo === 'vuelo') {
      let mejor = Infinity, sup = null;
      // Pendiente: y = h − x·tanθ, para 0 ≤ x ≤ L
      for (const r of raices(-g / 2, st.vy + st.vx * tn, st.y - h + st.x * tn)) {
        if (r > 1e-10 && r < mejor) { const x = st.x + st.vx * r; if (x >= 0 && x <= L) { mejor = r; sup = 'pendiente'; } }
      }
      // Suelo: y = 0, para x ≥ L
      for (const r of raices(-g / 2, st.vy, st.y)) {
        if (r > 1e-10 && r < mejor) { const x = st.x + st.vx * r; if (x >= L) { mejor = r; sup = 'suelo'; } }
      }
      // Plataforma: y = h, para x < 0
      for (const r of raices(-g / 2, st.vy, st.y - h)) {
        if (r > 1e-10 && r < mejor) { const x = st.x + st.vx * r; if (x < 0) { mejor = r; sup = 'plataforma'; } }
      }
      tramos.push({ ...st, dur: Math.min(mejor, DUR - st.t0) });
      if (st.t0 + mejor > DUR) break;
      const t = mejor, x = st.x + st.vx * t, y = st.y + st.vy * t - g * t * t / 2;
      let vx = st.vx, vy = st.vy - g * t;
      const t1 = st.t0 + t;
      if (sup === 'pendiente') {
        // Componentes normal (n = (senθ, cosθ)) y tangencial (d = (cosθ, −senθ))
        const vn = vx * sn + vy * cs, vt = vx * cs - vy * sn, vn2 = -e * vn;
        eventos.push({ t: t1, nombre: 'Choque con la pendiente', x, y, perdida: 0.5 * M * (vn * vn - vn2 * vn2) });
        if (vn2 < UMBRAL || zeno) {
          eventos.push({ t: t1, nombre: 'Desliza por la pendiente', x, y, perdida: 0.5 * M * vn2 * vn2 });
          st = { tipo: 'pendiente', t0: t1, s: x / cs, u: vt, L, S, sn, cs, h };
          continue;
        }
        vx = vt * cs + vn2 * sn; vy = -vt * sn + vn2 * cs;
      } else {
        eventos.push({ t: t1, nombre: sup === 'suelo' ? 'Choque con el suelo' : 'Choque con la plataforma', x, y, perdida: 0.5 * M * vy * vy * (1 - e * e) });
        if (-vy * e < UMBRAL || zeno) {
          eventos.push({ t: t1, nombre: 'Queda rodando', x, y, perdida: 0.5 * M * (vy * e) ** 2 });
          st = { tipo: 'rodando', t0: t1, x, y, vx };
          continue;
        }
        vy = -e * vy;
      }
      st = { tipo: 'vuelo', t0: t1, x, y, vx, vy };
    } else if (st.tipo === 'pendiente') {
      const a = g * st.sn, falta = st.S - st.s;
      const tf = raices(a / 2, st.u, -falta).filter(r => r > 0)[0];
      tramos.push({ ...st, a, dur: Math.min(tf, DUR - st.t0) });
      if (st.t0 + tf > DUR) break;
      const u = st.u + a * tf, t1 = st.t0 + tf;
      // En la arista se pierde la componente vertical de la velocidad
      eventos.push({ t: t1, nombre: 'Llega al pie de la pendiente', x: st.L, y: 0, perdida: 0.5 * M * (u * st.sn) ** 2 });
      st = { tipo: 'rodando', t0: t1, x: st.L, y: 0, vx: u * st.cs };
    } else {
      tramos.push({ ...st, dur: DUR - st.t0 });
      break;
    }
  }
  return { tramos, eventos, L, h, th, g, masa: M, duracion: DUR };
}

/**
 * Estado exacto en el instante t.
 * @param {ReturnType<typeof simularProyectil>} sim
 * @param {number} t
 */
export function estadoEn(sim, t) {
  let tr = sim.tramos[0];
  for (const q of sim.tramos) if (q.t0 <= t + 1e-12) tr = q;
  const d = Math.min(t - tr.t0, tr.dur), g = sim.g;
  if (tr.tipo === 'vuelo') return { x: tr.x + tr.vx * d, y: tr.y + tr.vy * d - g * d * d / 2, vx: tr.vx, vy: tr.vy - g * d, fase: 'en vuelo' };
  if (tr.tipo === 'pendiente') {
    const s = tr.s + tr.u * d + tr.a * d * d / 2, u = tr.u + tr.a * d;
    return { x: s * tr.cs, y: tr.h - s * tr.sn, vx: u * tr.cs, vy: -u * tr.sn, fase: 'deslizando' };
  }
  return { x: tr.x + tr.vx * d, y: 0, vx: tr.vx, vy: 0, fase: 'rodando' };
}

/**
 * Energía cinética y potencial gravitatoria (referencia y = 0).
 * @param {ReturnType<typeof simularProyectil>} sim
 * @param {{x:number,y:number,vx:number,vy:number}} s
 */
export function energiaEn(sim, s) {
  const K = 0.5 * sim.masa * (s.vx * s.vx + s.vy * s.vy), U = sim.masa * sim.g * s.y;
  return { K, U };
}
