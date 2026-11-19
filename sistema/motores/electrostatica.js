/* ==========================================================================
   Volta — motor de electrostática (modo 3D con vista plana)
   - Campo y potencial por superposición exacta de la ley de Coulomb (1/r²)
     de cargas puntuales y de distribuciones con fórmula cerrada: esfera
     (aislante o conductora), hilo infinito, segmento, anillo (integrales
     elípticas completas), lámina (franja finita o plano infinito) y campo
     uniforme. El plano de la vista es z = 0.
   - Fuerza sobre una carga y energía potencial del sistema.
   - Ley de Gauss: flujo por una esfera o un cilindro (cuadratura 3D) y
     carga encerrada exacta; trabajo del campo por un camino.
   - Dinámica de cargas libres entre las fuentes fijas (y entre ellas) con
     Dormand–Prince 5(4) del núcleo, con resorte y amortiguamiento
     opcionales; eventos localizados por Brent sobre la salida densa: "Pasa
     por O", cruces del eje x, alturas extremas, puntos de retorno y choques.
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

/** Distancia a la que el potencial de un hilo o una lámina vale 0 (m). */
export const R_REF = 1;

/**
 * Carga puntual o distribución de carga. Sin `tipo` (o con 'puntual') es una
 * carga puntual en (x, y, z). Las demás:
 * - 'esfera': centro (x, y), `radio`, carga total `q`; `conductora` pone la
 *   carga en la superficie (E = 0 dentro), si no está repartida en el volumen.
 * - 'hilo': recta infinita perpendicular al plano por (x, y), densidad `lambda` (C/m).
 * - 'segmento': en el plano, centro (x, y), `largo`, dirección `angulo` (rad), carga total `q`.
 * - 'anillo': centro (x, y), `radio`, eje en el plano con dirección `angulo`,
 *   carga total `q` (se ve de canto, como un segmento de largo 2·radio).
 * - 'lamina': franja infinita en z, de ancho `largo` (Infinity: plano
 *   infinito) a lo largo de `angulo`, centro (x, y), densidad `sigma` (C/m²).
 * - 'uniforme': campo `E0` (V/m) en la dirección `angulo`; V = −E·r.
 * @typedef {Object} CargaPuntual
 * @property {'puntual'|'esfera'|'hilo'|'segmento'|'anillo'|'lamina'|'uniforme'} [tipo]
 * @property {number} [x]  (m)
 * @property {number} [y]  (m)
 * @property {number} [q]  (C)
 * @property {number} [z=0] (m) solo para el flujo 3D
 * @property {number} [lambda] (C/m)
 * @property {number} [sigma]  (C/m²)
 * @property {number} [radio]  (m)
 * @property {number} [largo]  (m)
 * @property {number} [angulo] (rad)
 * @property {number} [E0]     (V/m)
 * @property {boolean} [conductora]
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
 * @property {{x: number, y: number, k: number, L0: number}} [resorte] Resorte
 *   ideal desde el punto fijo (x, y), constante k (N/m) y largo natural L0 (m)
 * @property {number} [b=0] Amortiguamiento viscoso F = −b·v (N·s/m)
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
    if (c.tipo && c.tipo !== 'puntual') { aporteFuente(c, x, y, 0, E3); ex += E3[0]; ey += E3[1]; continue; }
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
  for (const c of cargas) {
    if (c.tipo && c.tipo !== 'puntual') v += aporteFuente(c, x, y, 0, E3);
    else v += K_COULOMB * c.q / Math.max(R_MIN, Math.hypot(x - c.x, y - c.y));
  }
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
  const puntuales = cargas.every(c => !c.tipo || c.tipo === 'puntual');
  let total = 0;
  for (let i = 0; i < n; i++) {
    const ct = u[i], st = Math.sqrt(1 - ct * ct);
    let anillo = 0;
    for (let j = 0; j < nf; j++) {
      const ph = 2 * Math.PI * j / nf, nx = st * Math.cos(ph), ny = st * Math.sin(ph), nz = ct;
      const px = centro.x + R * nx, py = centro.y + R * ny, pz = cz + R * nz;
      let en = 0;
      if (puntuales) {
        for (const c of cargas) {
          const dx = px - c.x, dy = py - c.y, dz = pz - (c.z || 0), r2 = dx * dx + dy * dy + dz * dz;
          en += K_COULOMB * c.q * (dx * nx + dy * ny + dz * nz) / (r2 * Math.sqrt(r2));
        }
      } else {
        const [ex, ey, ez] = campo3D(cargas, px, py, pz);
        en = ex * nx + ey * ny + ez * nz;
      }
      anillo += en;
    }
    total += w[i] * anillo * (2 * Math.PI / nf);
  }
  return total * R * R;
}

// ---------------------------------------------------------------------------
// Distribuciones de carga
// ---------------------------------------------------------------------------

/** Vector de trabajo de aporteFuente (evita crear un arreglo en cada punto). */
const E3 = [0, 0, 0];

/**
 * Integrales elípticas completas de primera y segunda especie con parámetro
 * m = k² ∈ [0, 1), por la media aritmético-geométrica (convergencia
 * cuadrática): K(m) = π/(2·AGM(1, √(1 − m))), E(m) = K·(1 − Σ 2ⁿ⁻¹·cₙ²).
 * @param {number} m
 * @returns {[number, number]} [K(m), E(m)]
 */
export function elipticas(m) {
  let a = 1, b = Math.sqrt(1 - m), suma = 0.5 * m, pot = 0.5;
  for (let i = 0; i < 40 && Math.abs(a - b) > 1e-16 * a; i++) {
    const c = (a - b) / 2, an = (a + b) / 2;
    b = Math.sqrt(a * b); a = an; pot *= 2; suma += pot * c * c;
  }
  const K = Math.PI / (2 * a);
  return [K, K * (1 - suma)];
}

/** Ancho efectivo de una lámina: Infinity si no tiene uno finito positivo. */
const anchoLamina = f => (Number.isFinite(f.largo) && f.largo > 0 ? f.largo : Infinity);

/**
 * Campo de una fuente en el punto (x, y, z): lo suma en `out` = [Ex, Ey, Ez]
 * (lo sobrescribe) y devuelve su potencial. Sobre la propia carga (a menos
 * de 1 nm de un punto, de un hilo, de un segmento o del anillo) el campo no
 * se define: se devuelve 0 y el potencial con la distancia acotada a 1 nm.
 * @param {CargaPuntual} f
 * @param {number} x @param {number} y @param {number} z
 * @param {number[]} out
 * @returns {number} V (V)
 */
export function aporteFuente(f, x, y, z, out) {
  out[0] = 0; out[1] = 0; out[2] = 0;
  const k = K_COULOMB, tipo = f.tipo || 'puntual';
  if (tipo === 'uniforme') {
    const a = f.angulo || 0, E = f.E0 || 0, ex = E * Math.cos(a), ey = E * Math.sin(a);
    out[0] = ex; out[1] = ey;
    return -(ex * x + ey * y);
  }
  const dx = x - f.x, dy = y - f.y, dz = z - (f.z || 0);
  if (tipo === 'puntual' || tipo === 'esfera') {
    const r2 = dx * dx + dy * dy + dz * dz, r = Math.sqrt(r2), q = f.q || 0, R = tipo === 'esfera' ? f.radio || 0 : 0;
    if (r >= R) {
      if (r < R_MIN) return k * q / R_MIN;
      const s = k * q / (r2 * r); out[0] = s * dx; out[1] = s * dy; out[2] = s * dz;
      return k * q / r;
    }
    if (f.conductora) return k * q / R;                                    // dentro de una cáscara: E = 0
    const s = k * q / (R * R * R); out[0] = s * dx; out[1] = s * dy; out[2] = s * dz;
    return k * q * (3 * R * R - r2) / (2 * R * R * R);                      // esfera maciza uniforme
  }
  if (tipo === 'hilo') {
    const r2 = dx * dx + dy * dy, lam = f.lambda || 0;
    if (r2 < R_MIN * R_MIN) return -2 * k * lam * Math.log(R_MIN / R_REF);
    const s = 2 * k * lam / r2; out[0] = s * dx; out[1] = s * dy;
    return -k * lam * Math.log(r2 / (R_REF * R_REF));
  }
  const a = f.angulo || 0, tx = Math.cos(a), ty = Math.sin(a);
  const u0 = dx * tx + dy * ty;                          // coordenada a lo largo de la fuente
  if (tipo === 'lamina') {
    // Franja infinita en z: superposición de hilos de densidad σ·du
    const nx = -ty, ny = tx, n = dx * nx + dy * ny, sig = f.sigma || 0, L = anchoLamina(f);
    if (L === Infinity) {
      const s = 2 * Math.PI * k * sig * Math.sign(n);
      out[0] = s * nx; out[1] = s * ny;
      return -2 * Math.PI * k * sig * Math.abs(n);
    }
    const pa = u0 + L / 2, pb = u0 - L / 2, n2 = n * n;
    const ra = Math.max(pa * pa + n2, R_MIN * R_MIN), rb = Math.max(pb * pb + n2, R_MIN * R_MIN);
    const th = Math.atan2(n * L, n2 + pa * pb);          // ángulo que subtiende la franja (con signo)
    const En = 2 * k * sig * th, Eu = k * sig * Math.log(ra / rb);
    out[0] = Eu * tx + En * nx; out[1] = Eu * ty + En * ny;
    const F = (s, r) => (s === 0 ? 0 : s * Math.log(r));
    return -k * sig * (F(pa, ra) - F(pb, rb) - 2 * L + 2 * n * th);
  }
  // Segmento y anillo: distancia perpendicular en 3D a su recta (eje)
  const px = dx - u0 * tx, py = dy - u0 * ty, pz = dz, w = Math.hypot(px, py, pz);
  if (tipo === 'segmento') {
    const L = f.largo || 0, lam = L > 0 ? (f.q || 0) / L : 0, sA = u0 + L / 2, sB = u0 - L / 2;
    // s + r sin cancelación cuando s < 0: s + r = w²/(r − s)
    const masCon = (s, r, ww) => (s >= 0 ? s + r : (ww * ww) / (r - s));
    if (w < R_MIN && sA >= -R_MIN && sB <= R_MIN) {
      // sobre el segmento: solo el potencial, con la distancia acotada
      const ww = R_MIN, rA = Math.hypot(sA, ww), rB = Math.hypot(sB, ww);
      return k * lam * Math.log(masCon(sA, rA, ww) / masCon(sB, rB, ww));
    }
    const rA = Math.hypot(sA, w), rB = Math.hypot(sB, w);
    const mas = (s, r) => masCon(s, r, w);
    const V = k * lam * Math.log(mas(sA, rA) / mas(sB, rB));
    const Eu = k * lam * (1 / rB - 1 / rA);
    // E perpendicular = kλ/w·(sA/rA − sB/rB), en forma estable cerca del eje
    const Ap = (s, r) => 1 / (r * (r + s)), Bn = (s, r) => 1 / (r * (r - s));
    let Ew;
    if (sB >= 0) Ew = k * lam * w * (Ap(sB, rB) - Ap(sA, rA));
    else if (sA <= 0) Ew = k * lam * w * (Bn(sA, rA) - Bn(sB, rB));
    else Ew = k * lam * (2 / w - w * (Ap(sA, rA) + Bn(sB, rB)));
    out[0] = Eu * tx; out[1] = Eu * ty;
    if (w > 0) { out[0] += Ew * px / w; out[1] += Ew * py / w; out[2] = Ew * pz / w; }
    return V;
  }
  if (tipo === 'anillo') {
    const R = f.radio || 0, q = f.q || 0, zz = u0, rho = w;
    const A = (R + rho) ** 2 + zz * zz, B = (R - rho) ** 2 + zz * zz;
    if (B < R_MIN * R_MIN) {
      const [K] = elipticas(1 - R_MIN * R_MIN / A);
      return 2 * k * q / Math.PI * K / Math.sqrt(A);
    }
    const [K, E] = elipticas(4 * R * rho / A), sA = Math.sqrt(A);
    const V = 2 * k * q / Math.PI * K / sA;
    const Ez = 2 * k * q / Math.PI * zz * E / (B * sA);
    let Er;
    if (rho < 1e-4 * R) {
      // cerca del eje, por ∇·E = 0: E_ρ ≈ −(ρ/2)·∂E_z/∂z en el eje
      const s2 = R * R + zz * zz;
      Er = -0.5 * rho * k * q * (R * R - 2 * zz * zz) / (s2 * s2 * Math.sqrt(s2));
    } else {
      Er = k * q / (Math.PI * rho * sA) * (K - (R * R - rho * rho + zz * zz) * E / B);
    }
    out[0] = Ez * tx; out[1] = Ez * ty;
    if (rho > 0) { out[0] += Er * px / rho; out[1] += Er * py / rho; out[2] = Er * pz / rho; }
    return V;
  }
  return 0;
}

/**
 * Campo eléctrico en un punto del espacio (x, y, z) por superposición de
 * cualquier tipo de fuente.
 * @param {CargaPuntual[]} fuentes
 * @param {number} x @param {number} y @param {number} [z=0]
 * @returns {[number, number, number]} (V/m)
 */
export function campo3D(fuentes, x, y, z = 0) {
  let ex = 0, ey = 0, ez = 0;
  for (const f of fuentes) { aporteFuente(f, x, y, z, E3); ex += E3[0]; ey += E3[1]; ez += E3[2]; }
  return [ex, ey, ez];
}

/**
 * Potencial en un punto del espacio (x, y, z). Las cargas acotadas lo
 * refieren al infinito; los hilos y las láminas, a R_REF.
 * @param {CargaPuntual[]} fuentes
 * @param {number} x @param {number} y @param {number} [z=0]
 */
export function potencial3D(fuentes, x, y, z = 0) {
  let v = 0;
  for (const f of fuentes) v += aporteFuente(f, x, y, z, E3);
  return v;
}

/**
 * Carga total de una fuente acotada (C); por unidad de largo en z para un
 * hilo (λ) o una lámina (σ·ancho); 0 para el campo uniforme.
 * @param {CargaPuntual} f
 */
export function cargaDe(f) {
  const tipo = f.tipo || 'puntual';
  if (tipo === 'hilo') return f.lambda || 0;
  if (tipo === 'lamina') return (f.sigma || 0) * anchoLamina(f);
  if (tipo === 'uniforme') return 0;
  return f.q || 0;
}

/**
 * Distancia en el plano z = 0 del punto (x, y) a la superficie de la fuente
 * (al centro de una carga puntual, a un hilo, al segmento o franja, a los
 * dos puntos donde el anillo corta el plano, a la superficie de una esfera).
 * Infinity para un campo uniforme.
 * @param {CargaPuntual} f @param {number} x @param {number} y
 */
export function distanciaFuente(f, x, y) {
  const tipo = f.tipo || 'puntual';
  if (tipo === 'uniforme') return Infinity;
  const dx = x - f.x, dy = y - f.y;
  if (tipo === 'puntual' || tipo === 'hilo') return Math.hypot(dx, dy);
  if (tipo === 'esfera') return Math.abs(Math.hypot(dx, dy) - (f.radio || 0));
  const a = f.angulo || 0, tx = Math.cos(a), ty = Math.sin(a), u = dx * tx + dy * ty, n = -dx * ty + dy * tx;
  if (tipo === 'anillo') { const R = f.radio || 0; return Math.min(Math.hypot(u, n - R), Math.hypot(u, n + R)); }
  const L = tipo === 'lamina' ? anchoLamina(f) : f.largo || 0;
  return Math.hypot(Math.max(0, Math.abs(u) - L / 2), n);
}

// ---------------------------------------------------------------------------
// Ley de Gauss y trabajo por un camino
// ---------------------------------------------------------------------------

/**
 * Flujo por la superficie cerrada de un cilindro de eje z (perpendicular al
 * plano), centrado en (x, y, 0), de radio R y largo L: cara lateral y tapas
 * por cuadratura de Gauss–Legendre en z y en r, y regla del trapecio en φ.
 * Es la superficie de la ley de Gauss para hilos y láminas.
 * @param {CargaPuntual[]} fuentes
 * @param {{x: number, y: number}} centro
 * @param {number} R @param {number} L
 * @param {number} [n=48]
 * @returns {number} Φ (V·m)
 */
export function flujoCilindro(fuentes, centro, R, L, n = 48) {
  const { x: u, w } = gaussLegendre(n), nf = 4 * n, dphi = 2 * Math.PI / nf;
  let lado = 0, tapas = 0;
  for (let j = 0; j < nf; j++) {
    const ph = j * dphi, c = Math.cos(ph), s = Math.sin(ph), px = centro.x + R * c, py = centro.y + R * s;
    for (let i = 0; i < n; i++) {
      const zz = u[i] * L / 2, e = campo3D(fuentes, px, py, zz);
      lado += w[i] * (e[0] * c + e[1] * s);
      const r = (u[i] + 1) * R / 2, qx = centro.x + r * c, qy = centro.y + r * s;
      const arriba = campo3D(fuentes, qx, qy, L / 2)[2], abajo = campo3D(fuentes, qx, qy, -L / 2)[2];
      tapas += w[i] * r * (arriba - abajo);
    }
  }
  return lado * (L / 2) * R * dphi + tapas * (R / 2) * dphi;
}

/**
 * Carga encerrada exacta por una esfera de centro (x, y, z) y radio R, o por
 * un cilindro de eje z con centro (x, y, 0), radio R y largo L.
 * @param {CargaPuntual[]} fuentes
 * @param {{forma: 'esfera'|'cilindro', x: number, y: number, z?: number, R: number, L?: number}} s
 * @returns {number} Q (C)
 */
export function cargaEncerrada(fuentes, s) {
  let Q = 0;
  for (const f of fuentes) Q += s.forma === 'cilindro' ? encerradaCilindro(f, s) : encerradaEsfera(f, s);
  return Q;
}

// Largo del tramo [a, b] de una recta que queda dentro de [−h, h]
const solape = (a, b, h) => Math.max(0, Math.min(b, h) - Math.max(a, -h));
// ∫ 2√(r² − s²) ds entre −… y s (área de un segmento de círculo de radio r)
const segmentoCirculo = (s, r) => { const t = Math.max(-r, Math.min(r, s)); return t * Math.sqrt(r * r - t * t) + r * r * Math.asin(t / r); };

function encerradaEsfera(f, s) {
  const tipo = f.tipo || 'puntual', R = s.R, cz = s.z || 0;
  if (tipo === 'uniforme') return 0;
  const dx = f.x - s.x, dy = f.y - s.y, dz = (f.z || 0) - cz;
  if (tipo === 'puntual') return Math.hypot(dx, dy, dz) < R ? f.q : 0;
  if (tipo === 'esfera') {
    const a = f.radio, D = Math.hypot(dx, dy, dz);
    if (D + a <= R) return f.q;                          // entera dentro
    if (D >= R + a) return 0;                            // entera fuera
    if (f.conductora) {
      if (D + R <= a) return 0;                          // la gaussiana entera dentro de la cáscara
      // fracción del área de la cáscara a menos de R del centro de la gaussiana
      const cos0 = (D * D + a * a - R * R) / (2 * D * a);
      return f.q * (1 - Math.max(-1, Math.min(1, cos0))) / 2;
    }
    if (D + R <= a) return f.q * (R / a) ** 3;           // la gaussiana entera dentro de la esfera maciza
    // volumen de la lente que comparten las dos esferas
    const V = Math.PI * (R + a - D) ** 2 * (D * D + 2 * D * a - 3 * a * a + 2 * D * R + 6 * a * R - 3 * R * R) / (12 * D);
    return f.q * V / (4 / 3 * Math.PI * a ** 3);
  }
  const d2 = dx * dx + dy * dy, zz = dz * dz;
  if (tipo === 'hilo') { const r2 = R * R - d2; return r2 > 0 ? f.lambda * 2 * Math.sqrt(r2) : 0; }
  const ang = f.angulo || 0, tx = Math.cos(ang), ty = Math.sin(ang);
  const u = -(dx * tx + dy * ty), n = -(-dx * ty + dy * tx);   // centro de la gaussiana en ejes de la fuente
  if (tipo === 'segmento') {
    const h2 = R * R - n * n - zz; if (h2 <= 0) return 0;
    const L = f.largo, h = Math.sqrt(h2);
    return f.q / L * solape(-L / 2 - u, L / 2 - u, h);
  }
  if (tipo === 'lamina') {
    const r2 = R * R - n * n; if (r2 <= 0) return 0;
    const r = Math.sqrt(r2), L = anchoLamina(f), a0 = Math.max(-L / 2 - u, -r), a1 = Math.min(L / 2 - u, r);
    return a1 > a0 ? f.sigma * (segmentoCirculo(a1, r) - segmentoCirculo(a0, r)) : 0;
  }
  if (tipo === 'anillo') {
    // puntos del anillo: (u = 0, n = a·cos φ, z = a·sen φ) respecto de su centro
    const a = f.radio, D2 = u * u + n * n + zz;
    if (a === 0) return D2 < R * R ? f.q : 0;
    // |p(φ) − c|² = D² + a² − 2a(n·cos φ + dz·sen φ)… con c en (u, n, dz): se cuenta la fracción de φ
    const m = Math.hypot(n, dz), lim = (D2 + a * a - R * R) / (2 * a);
    if (m === 0) return lim < 0 ? f.q : 0;
    const c = lim / m;
    if (c <= -1) return f.q;
    if (c >= 1) return 0;
    return f.q * Math.acos(c) / Math.PI;
  }
  return 0;
}

function encerradaCilindro(f, s) {
  const tipo = f.tipo || 'puntual', R = s.R, L = s.L ?? 1, h = L / 2;
  if (tipo === 'uniforme') return 0;
  const dx = f.x - s.x, dy = f.y - s.y, dz = f.z || 0;
  if (tipo === 'puntual') return Math.hypot(dx, dy) < R && Math.abs(dz) < h ? f.q : 0;
  if (tipo === 'hilo') return Math.hypot(dx, dy) < R ? f.lambda * L : 0;
  const ang = f.angulo || 0, tx = Math.cos(ang), ty = Math.sin(ang);
  const u = -(dx * tx + dy * ty), n = -(-dx * ty + dy * tx);
  if (tipo === 'segmento' || tipo === 'lamina') {
    // el segmento está en su plano z: fuera de las tapas no cuenta (la lámina es infinita en z)
    const r2 = R * R - n * n; if (r2 <= 0 || (tipo === 'segmento' && Math.abs(dz) >= h)) return 0;
    const r = Math.sqrt(r2), W = tipo === 'lamina' ? anchoLamina(f) : f.largo, dentro = solape(-W / 2 - u, W / 2 - u, r);
    return tipo === 'lamina' ? f.sigma * dentro * L : f.q / W * dentro;
  }
  // Esfera y anillo: por cuadratura (rodajas en z para la esfera, ángulo para el anillo)
  const D = Math.hypot(dx, dy), { x: g, w } = gaussLegendre(64);
  if (tipo === 'esfera') {
    const a = f.radio;
    if (D + a <= R && Math.abs(dz) + a <= h) return f.q;
    let Q = 0;
    for (let i = 0; i < 64; i++) {
      const zz = g[i] * a, rr = Math.sqrt(Math.max(0, a * a - zz * zz));
      if (Math.abs(zz + dz) >= h) continue;               // rodaja fuera de las tapas
      // fracción del círculo (cáscara) o del disco (maciza) de radio rr que cae dentro del círculo R
      const frac = f.conductora ? arcoDentro(rr, D, R) : discoDentro(rr, D, R);
      Q += w[i] * (f.conductora ? frac / 2 : frac * 3 / 4 * (1 - g[i] * g[i]));
    }
    return f.q * Q;
  }
  if (tipo === 'anillo') {
    const a = f.radio, N = 720;
    let dentro = 0;
    for (let j = 0; j < N; j++) {
      const ph = (j + 0.5) * 2 * Math.PI / N, pn = n - a * Math.cos(ph), pz = a * Math.sin(ph);
      if (u * u + pn * pn < R * R && Math.abs(pz) < h) dentro++;
    }
    return f.q * dentro / N;
  }
  return 0;
}
// Fracción de una circunferencia de radio r, con centro a distancia D, dentro del círculo de radio R
function arcoDentro(r, D, R) {
  if (r === 0) return D < R ? 1 : 0;
  if (D + r <= R) return 1;
  if (Math.abs(D - r) >= R) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (D * D + r * r - R * R) / (2 * D * r)))) / Math.PI;
}
// Fracción del área de un disco de radio r, con centro a distancia D, dentro del círculo de radio R
function discoDentro(r, D, R) {
  if (r === 0) return D < R ? 1 : 0;
  if (D + r <= R) return 1;
  if (D >= R + r) return 0;
  if (D + R <= r) return R * R / (r * r);
  const a1 = r * r * Math.acos((D * D + r * r - R * R) / (2 * D * r)), a2 = R * R * Math.acos((D * D + R * R - r * r) / (2 * D * R));
  const a3 = 0.5 * Math.sqrt((-D + r + R) * (D + r - R) * (D - r + R) * (D + r + R));
  return (a1 + a2 - a3) / (Math.PI * r * r);
}

/**
 * Trabajo que hace el campo sobre una carga q llevada por una poligonal
 * (∫ q·E·dl, Gauss–Legendre en cada tramo) y el trabajo externo para
 * llevarla despacio (el opuesto). No depende del camino: es q·(V₀ − V₁).
 * @param {CargaPuntual[]} fuentes
 * @param {number} q
 * @param {Array<[number, number]>} puntos
 * @param {number} [n=24] nodos por tramo
 * @returns {{campo: number, externo: number}}
 */
export function trabajoCamino(fuentes, q, puntos, n = 24) {
  const { x: u, w } = gaussLegendre(n);
  let W = 0;
  for (let k = 1; k < puntos.length; k++) {
    const [x0, y0] = puntos[k - 1], [x1, y1] = puntos[k], hx = (x1 - x0) / 2, hy = (y1 - y0) / 2;
    for (let i = 0; i < n; i++) {
      const [ex, ey] = campo(fuentes, x0 + hx * (1 + u[i]), y0 + hy * (1 + u[i]));
      W += w[i] * (ex * hx + ey * hy);
    }
  }
  return { campo: q * W, externo: -q * W };
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
  const EXTRA = ['tipo', 'lambda', 'sigma', 'radio', 'largo', 'angulo', 'E0', 'conductora'];
  const fijas = escena.fijas.map((c, i) => {
    const r = { id: c.id ?? `F${i + 1}`, nombre: c.nombre ?? c.id ?? `F${i + 1}`, x: c.x, y: c.y, q: c.q };
    if (c.tipo && c.tipo !== 'puntual') for (const k of EXTRA) if (c[k] !== undefined) r[k] = c[k];
    return r;
  });
  const libres = escena.libres.map((c, i) => {
    const r = { id: c.id ?? `L${i + 1}`, nombre: c.nombre ?? c.id ?? `L${i + 1}`, x: c.x, y: c.y, q: c.q, m: c.m, vx: c.vx || 0, vy: c.vy || 0 };
    if (c.resorte) r.resorte = { x: c.resorte.x, y: c.resorte.y, k: c.resorte.k, L0: c.resorte.L0 };
    if (c.b > 0) r.b = c.b;
    return r;
  });
  const N = libres.length, mutua = o.interaccionLibres !== false;
  const R = o.radioChoque ?? 0.02;
  if (!libres.every(c => c.m > 0)) throw new RangeError('simularCargas: la masa de cada carga libre tiene que ser positiva');
  if (!libres.every(c => !c.resorte || (c.resorte.k >= 0 && c.resorte.L0 >= 0))) throw new RangeError('simularCargas: el resorte necesita k ≥ 0 y L0 ≥ 0');
  const soloPuntuales = fijas.every(c => !c.tipo) && libres.every(c => !c.resorte);
  // Con amortiguamiento, el estado lleva al final la energía disipada
  const disipa = libres.some(c => c.b > 0), iW = 4 * N;
  function y0Base() { const y = []; for (const c of libres) y.push(c.x, c.y, c.vx, c.vy); if (disipa) y.push(0); return y; }

  // Escalas características (clasificación de eventos y tolerancia en t)
  const escalas = libres.map((c, i) => {
    const otras = [...fijas, ...libres.filter((_, j) => j !== i)];
    if (soloPuntuales) {
      const dmin = Math.min(...otras.map(p => Math.hypot(p.x - c.x, p.y - c.y)));
      const L = o.escalaLongitud ?? (isFinite(dmin) && dmin > 0 ? dmin : 1);
      const Qs = otras.reduce((s, p) => s + Math.abs(p.q), 0);
      const vEst = o.escalaVelocidad ?? Math.sqrt(K_COULOMB * Math.abs(c.q) * Qs / (c.m * L));
      const v = vEst > 0 && isFinite(vEst) ? vEst : 1;     // carga neutra o sola: escala unitaria
      return { L, v, T: L / v };
    }
    // Con distribuciones o resortes: L, la distancia a la fuente más cercana;
    // v, la que da la aceleración inicial a lo largo de L
    const ds = otras.map(p => distanciaFuente(p, c.x, c.y)).filter(d => d > 0 && isFinite(d));
    if (c.resorte) ds.push(Math.max(c.resorte.L0, Math.hypot(c.x - c.resorte.x, c.y - c.resorte.y)));
    const dmin = ds.length ? Math.min(...ds) : NaN;
    const L = o.escalaLongitud ?? (dmin > 0 ? dmin : 1);
    const [ex, ey] = campo(otras, c.x, c.y), a0 = Math.abs(c.q / c.m) * Math.hypot(ex, ey) + (c.resorte ? c.resorte.k * L / c.m : 0);
    const vEst = o.escalaVelocidad ?? Math.max(Math.sqrt(a0 * L), Math.hypot(c.vx, c.vy));
    const v = vEst > 0 && isFinite(vEst) ? vEst : 1;
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
      const c = libres[i], qm = c.q / c.m;
      a[2 * i] = qm * ex; a[2 * i + 1] = qm * ey;
      if (c.resorte) {
        const dx = xi - c.resorte.x, dy = yi - c.resorte.y, l = Math.hypot(dx, dy);
        if (l > 0) { const f = -c.resorte.k * (l - c.resorte.L0) / (c.m * l); a[2 * i] += f * dx; a[2 * i + 1] += f * dy; }
      }
      if (c.b) { a[2 * i] -= c.b / c.m * s[4 * i + 2]; a[2 * i + 1] -= c.b / c.m * s[4 * i + 3]; }
    }
    return a;
  };
  const f = (_t, s) => {
    const a = acel(s), d = new Array(s.length);
    for (let i = 0; i < N; i++) { d[4 * i] = s[4 * i + 2]; d[4 * i + 1] = s[4 * i + 3]; d[4 * i + 2] = a[2 * i]; d[4 * i + 3] = a[2 * i + 1]; }
    if (disipa) { let p = 0; for (let i = 0; i < N; i++) if (libres[i].b) p += libres[i].b * (s[4 * i + 2] ** 2 + s[4 * i + 3] ** 2); d[iW] = p; }
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
      if (!c.tipo) defs.push({ g: (_t, s) => Math.hypot(s[b] - c.x, s[b + 1] - c.y) - R, direccion: -1, terminal: true });
      else if (c.tipo === 'uniforme') continue;
      else if (c.tipo === 'lamina' || c.tipo === 'segmento') {
        // Objeto delgado: llega a él cuando cruza su recta dentro de su largo.
        // g = máx(s·n, |u| − L/2) con s, el lado del que parte (si parte
        // sobre él, el lado hacia el que se va): solo es negativa detrás del
        // objeto y dentro de su largo, y empezar en g = 0 no cuenta.
        const ang = c.angulo || 0, tx = Math.cos(ang), ty = Math.sin(ang), L = c.tipo === 'lamina' ? anchoLamina(c) : c.largo || 0;
        const p0 = libres[i], n0 = -(p0.x - c.x) * ty + (p0.y - c.y) * tx;
        let lado = Math.sign(n0);
        if (Math.abs(n0) < 1e-12 * escalas[i].L) {
          const a0 = acel(y0Base()), vn = -p0.vx * ty + p0.vy * tx, an = -a0[2 * i] * ty + a0[2 * i + 1] * tx;
          lado = Math.sign(vn || an) || 1;
        }
        defs.push({ g: (_t, s) => { const dx = s[b] - c.x, dy = s[b + 1] - c.y; return Math.max(lado * (-dx * ty + dy * tx), Math.abs(dx * tx + dy * ty) - L / 2); }, direccion: -1, terminal: true });
      } else defs.push({ g: (_t, s) => distanciaFuente(c, s[b], s[b + 1]) - R, direccion: -1, terminal: true });
      info.push({ tipo: 'choque', i, contra: c, delgado: c.tipo === 'lamina' || c.tipo === 'segmento' });
    }
    if (mutua) {
      for (let j = i + 1; j < N; j++) {
        const bj = 4 * j;
        defs.push({ g: (_t, s) => Math.hypot(s[b] - s[bj], s[b + 1] - s[bj + 1]) - R, direccion: -1, terminal: true });
        info.push({ tipo: 'choque', i, contra: libres[j] });
      }
    }
  }

  const y0 = y0Base();
  const rap = (s, i) => Math.hypot(s[4 * i + 2], s[4 * i + 3]);

  /** @type {EventoCarga[]} */
  const eventos = libres.map((c, i) => ({ t: 0, nombre: rap(y0, i) > 0 ? 'Se lanza' : 'Se suelta', tipo: /** @type {'inicio'} */ ('inicio'), carga: c.id, x: c.x, y: c.y, v: rap(y0, i) }));

  // Una carga libre que empieza dentro del radio de choque: choque en t = 0
  /** @type {any} */
  let choqueInicial = null;
  for (let k = 0; k < defs.length && !choqueInicial; k++) {
    if (info[k].tipo === 'choque' && !info[k].delgado && defs[k].g(0, y0) <= 0) {
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
  // Energía total: cinética + eléctrica + elástica + la disipada hasta ese instante
  const E = s => { const { K, U, Ue, Wd } = energiaEstado(sim, s); return K + U + Ue + Wd; };
  sim.E0 = E(y0);
  let deriva = 0;
  for (const s of sol.y) deriva = Math.max(deriva, Math.abs(E(s) - sim.E0));
  sim.deriva = deriva / Math.abs(sim.E0 || 1);
  return sim;
}

/** Nombre del evento de choque de la carga libre `propia` con `contra`. */
function nombreChoque(propia, contra, contraEsFija) {
  if (contraEsFija && contra.tipo) return 'Choca con ' + contra.nombre;
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
 * Con resortes, Ue es su energía elástica; con amortiguamiento, Wd es la
 * energía disipada desde t = 0 (K + U + Ue + Wd se conserva).
 * @param {ReturnType<typeof simularCargas>} sim
 * @param {number[]} s
 * @returns {{K: number, U: number, Ue: number, Wd: number}}
 */
export function energiaEstado(sim, s) {
  const { fijas, libres } = sim;
  let K = 0, U = 0, Ue = 0;
  const Wd = s.length > 4 * libres.length ? s[4 * libres.length] : 0;
  for (let i = 0; i < libres.length; i++) {
    const b = 4 * i, c = libres[i];
    K += 0.5 * c.m * (s[b + 2] * s[b + 2] + s[b + 3] * s[b + 3]);
    U += c.q * potencial(fijas, s[b], s[b + 1]);
    if (c.resorte) Ue += 0.5 * c.resorte.k * (Math.hypot(s[b] - c.resorte.x, s[b + 1] - c.resorte.y) - c.resorte.L0) ** 2;
    if (sim.interaccionLibres) {
      for (let j = i + 1; j < libres.length; j++) {
        U += K_COULOMB * c.q * libres[j].q / Math.max(R_MIN, Math.hypot(s[b] - s[4 * j], s[b + 1] - s[4 * j + 1]));
      }
    }
  }
  return { K, U, Ue, Wd };
}

/**
 * Energía cinética y potencial en el instante t.
 * @param {ReturnType<typeof simularCargas>} sim
 * @param {number} t
 */
export function energiaEn(sim, t) {
  return energiaEstado(sim, interpolar(sim.solucion, t));
}
