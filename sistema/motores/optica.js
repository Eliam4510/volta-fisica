/* ==========================================================================
   Volta — motor de óptica
   Cuatro partes, todas en SI y puras (sin DOM):
   1. Trazado de rayos 2D. Medios de forma libre (rectángulo, lámina,
      prisma, círculo, semicírculo, polígono, lente gruesa y recipiente con
      líquido) cuyo contorno se describe con segmentos y arcos de
      circunferencia; índice fijo o dispersivo (fórmula de Cauchy, con
      materiales predefinidos). Espejos planos y esféricos, lentes ideales
      (delgadas), divisores de haz, bloqueadores, pantallas y el ojo.
      Intersecciones exactas rayo-segmento y rayo-arco; en cada interfaz,
      ley de Snell, reflexión total interna y reparto de la intensidad entre
      el reflejado y el transmitido con los coeficientes de Fresnel para luz
      no polarizada (R + T = 1). La luz blanca viaja como un solo rayo hasta
      la primera interfaz dispersiva, donde se separa en sus longitudes de
      onda. Límite de rebotes y de segmentos: el trazado nunca aborta; lo
      que no se pudo seguir se anota en `avisos`.
   2. Formación de imágenes: ecuación de lentes y espejos, aumento, imagen
      real o virtual; y la imagen hallada con los rayos trazados (punto que
      mejor ajusta, por mínimos cuadrados, al haz que sale de un punto: el
      cruce de los rayos o el de sus prolongaciones).
   3. Óptica ondulatoria por fasores (Huygens–Fresnel en 2D): cada rendija
      se divide en fuentes puntuales y en cada punto de la pantalla se suman
      sus fasores con la fase del camino óptico (índice n del medio entre
      las rendijas y la pantalla). Young, rendija simple, N rendijas y red;
      la forma cerrada de Fraunhofer para comparar y para redes de muchas
      líneas.
   4. Películas e interferómetros: reflectancia de una película (suma de
      Airy de las reflexiones múltiples con los coeficientes de Fresnel, que
      llevan el cambio de fase de π al reflejarse contra un índice mayor),
      cuña, anillos de Newton y Michelson (espejo móvil, lámina insertable o
      girada, conteo de franjas).
   Colorimetría: funciones de igualación CIE 1931 (aproximación analítica
   de Wyman, Sloan y Shirley, 2013) → XYZ → sRGB lineal (matriz D65). Así se
   calcula el color de cada longitud de onda y el de la luz que llega a una
   pantalla o refleja una película.
   Lo usan las pantallas de Óptica y las pruebas (pruebas/optica.test.js).
   ========================================================================== */

const DOS_PI = 2 * Math.PI;

/** Rapidez de la luz en el vacío, m/s. */
export const C_LUZ = 299792458;
/** Línea D del sodio (m): longitud de onda de referencia del índice. */
export const LAMBDA_D = 589.3e-9;
/** Longitudes de onda (m) en que se separa la luz blanca de un rayo. */
export const LAMBDAS_BLANCA = [400e-9, 450e-9, 500e-9, 550e-9, 600e-9, 650e-9, 700e-9];

/**
 * @typedef {[number, number]} Vec
 */

// ---------------------------------------------------------------------------
// Vectores 2D
// ---------------------------------------------------------------------------
/** @param {Vec} a @param {Vec} b @returns {Vec} */
const mas = (a, b) => [a[0] + b[0], a[1] + b[1]];
/** @param {Vec} a @param {Vec} b @returns {Vec} */
const menos = (a, b) => [a[0] - b[0], a[1] - b[1]];
/** @param {Vec} a @param {number} k @returns {Vec} */
const por = (a, k) => [a[0] * k, a[1] * k];
/** @param {Vec} a @param {Vec} b */
const punto = (a, b) => a[0] * b[0] + a[1] * b[1];
/** @param {Vec} a @param {Vec} b */
const cruz = (a, b) => a[0] * b[1] - a[1] * b[0];
/** @param {Vec} a */
const norma = a => Math.hypot(a[0], a[1]);
/** @param {Vec} a @returns {Vec} */
const unitario = a => { const n = norma(a); return [a[0] / n, a[1] / n]; };
/** @param {number} ang @returns {Vec} */
const dir = ang => [Math.cos(ang), Math.sin(ang)];
/** Gira p un ángulo g alrededor del origen. @param {Vec} p @param {number} g @returns {Vec} */
const girar = (p, g) => { const c = Math.cos(g), s = Math.sin(g); return [c * p[0] - s * p[1], s * p[0] + c * p[1]]; };

// ---------------------------------------------------------------------------
// Materiales e índice de refracción
// ---------------------------------------------------------------------------

/**
 * Materiales con dispersión de Cauchy n(λ) = A + B/λ² (B en m²). A y B
 * ajustan los índices en las líneas F (486.1 nm) y C (656.3 nm); en la
 * línea D dan el índice de tabla: agua 1.333, crown BK7 1.517, flint F2
 * 1.620, diamante 2.418.
 * @type {Record<string, {nombre: string, A: number, B: number}>}
 */
export const MATERIALES = {
  vacio: { nombre: 'Vacío', A: 1, B: 0 },
  aire: { nombre: 'Aire', A: 1.000293, B: 0 },
  agua: { nombre: 'Agua', A: 1.32402, B: 3.09e-15 },
  crown: { nombre: 'Vidrio crown (BK7)', A: 1.50445, B: 4.24e-15 },
  flint: { nombre: 'Vidrio flint (F2)', A: 1.5942, B: 8.95e-15 },
  diamante: { nombre: 'Diamante', A: 2.3791, B: 1.33e-14 },
};

/** Índice de Cauchy. @param {number} A @param {number} B m² @param {number} lambda m */
export const indiceCauchy = (A, B, lambda) => A + B / (lambda * lambda);

/**
 * @typedef {Object} Indice
 * @property {number} [n]         índice fijo
 * @property {string} [material]  clave de MATERIALES (dispersivo)
 * @property {{A: number, B: number}} [cauchy] coeficientes propios
 */

/**
 * Índice de un medio para la longitud de onda λ (la luz blanca sin separar
 * usa la línea D).
 * @param {Indice | number | undefined} m @param {number | null} [lambda]
 */
export function indiceDe(m, lambda = LAMBDA_D) {
  const l = lambda ?? LAMBDA_D;
  if (m == null) return 1;
  if (typeof m === 'number') return m;
  if (m.material) {
    const mat = MATERIALES[m.material];
    if (!mat) throw new Error(`Material desconocido: ${m.material}`);
    return indiceCauchy(mat.A, mat.B, l);
  }
  if (m.cauchy) return indiceCauchy(m.cauchy.A, m.cauchy.B, l);
  return m.n ?? 1;
}

/** ¿El índice depende de λ? @param {Indice | number | undefined} m */
export function esDispersivo(m) {
  if (m == null || typeof m === 'number') return false;
  if (m.material) return (MATERIALES[m.material]?.B ?? 0) !== 0;
  if (m.cauchy) return m.cauchy.B !== 0;
  return false;
}

// ---------------------------------------------------------------------------
// Refracción, reflexión y Fresnel
// ---------------------------------------------------------------------------

/**
 * Ángulo de refracción por la ley de Snell n₁ sen θ₁ = n₂ sen θ₂; NaN si hay
 * reflexión total.
 * @param {number} n1 @param {number} n2 @param {number} theta1 rad
 */
export function snell(n1, n2, theta1) {
  const s = n1 / n2 * Math.sin(theta1);
  return Math.abs(s) > 1 ? NaN : Math.asin(s);
}

/** Ángulo crítico de n₁ a n₂ (NaN si n₁ ≤ n₂). @param {number} n1 @param {number} n2 */
export const anguloCritico = (n1, n2) => (n1 > n2 ? Math.asin(n2 / n1) : NaN);

/** Ángulo de Brewster de n₁ a n₂. @param {number} n1 @param {number} n2 */
export const anguloBrewster = (n1, n2) => Math.atan(n2 / n1);

/**
 * Coeficientes de Fresnel. Amplitudes r y t para las polarizaciones s y p
 * (convención r_p = (n₂cos θ₁ − n₁cos θ₂)/(n₂cos θ₁ + n₁cos θ₂)) y
 * fracciones de potencia: R = r², T = (n₂cos θ₂)/(n₁cos θ₁)·t². Para luz no
 * polarizada, R y T son la media de s y p. Con reflexión total, R = 1.
 * @param {number} n1 @param {number} n2 @param {number} theta1 rad (0 ≤ θ₁ ≤ π/2)
 */
export function fresnel(n1, n2, theta1) {
  const ci = Math.cos(theta1), s2 = n1 / n2 * Math.sin(theta1);
  if (Math.abs(s2) >= 1) return { R: 1, T: 0, Rs: 1, Rp: 1, Ts: 0, Tp: 0, rs: 1, rp: 1, ts: 0, tp: 0, theta2: NaN, total: true };
  const ct = Math.sqrt(1 - s2 * s2);
  const rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct), rp = (n2 * ci - n1 * ct) / (n2 * ci + n1 * ct);
  const ts = 2 * n1 * ci / (n1 * ci + n2 * ct), tp = 2 * n1 * ci / (n2 * ci + n1 * ct);
  const k = (n2 * ct) / (n1 * ci);
  const Rs = rs * rs, Rp = rp * rp, Ts = k * ts * ts, Tp = k * tp * tp;
  return { R: (Rs + Rp) / 2, T: (Ts + Tp) / 2, Rs, Rp, Ts, Tp, rs, rp, ts, tp, theta2: Math.asin(s2), total: false };
}

/**
 * Desviación de un rayo que atraviesa un prisma de ángulo A en el plano de
 * su sección principal: δ = θ₁ + θ₄ − A (NaN si se refleja totalmente en la
 * segunda cara).
 * @param {number} A rad @param {number} n índice relativo al medio exterior @param {number} theta1 rad
 */
export function desviacionPrisma(A, n, theta1) {
  const t2 = Math.asin(Math.sin(theta1) / n), t3 = A - t2, s4 = n * Math.sin(t3);
  if (Math.abs(s4) > 1) return NaN;
  return theta1 + Math.asin(s4) - A;
}

/** Desviación mínima de un prisma: δ_m = 2·asen(n·sen(A/2)) − A. @param {number} A @param {number} n */
export function desviacionMinima(A, n) { return 2 * Math.asin(n * Math.sin(A / 2)) - A; }

/** Índice a partir de la desviación mínima: n = sen((A + δ_m)/2)/sen(A/2). @param {number} A @param {number} dm */
export const indiceDesdeDesviacion = (A, dm) => Math.sin((A + dm) / 2) / Math.sin(A / 2);

/**
 * Profundidad aparente (paraxial) de un objeto a una profundidad h en un
 * medio de índice nObjeto, visto desde un medio de índice nObservador.
 * @param {number} h @param {number} nObjeto @param {number} [nObservador=1]
 */
export const profundidadAparente = (h, nObjeto, nObservador = 1) => h * nObservador / nObjeto;

// ---------------------------------------------------------------------------
// Lentes y espejos (fórmulas)
// ---------------------------------------------------------------------------

/**
 * Lente delgada: 1/s + 1/s′ = 1/f con s > 0 para un objeto real delante de
 * la lente y s′ > 0 para una imagen real detrás. Aumento m = −s′/s.
 * @param {number} f m (> 0 convergente) @param {number} s m
 * @returns {{s2: number, m: number, real: boolean, infinito: boolean}}
 */
export function lenteDelgada(f, s) {
  const inv = 1 / f - 1 / s;
  if (Math.abs(inv) < 1e-13 / Math.abs(f)) return { s2: Infinity, m: Infinity, real: false, infinito: true };
  const s2 = 1 / inv;
  return { s2, m: -s2 / s, real: s2 > 0, infinito: false };
}

/**
 * Espejo esférico (paraxial): f = R/2 (R > 0 cóncavo), 1/s + 1/s′ = 1/f con
 * s′ > 0 para una imagen real delante del espejo.
 * @param {number} R m @param {number} s m
 */
export function espejoEsferico(R, s) { return { f: R / 2, ...lenteDelgada(R / 2, s) }; }

/**
 * Lente gruesa (paraxial, matrices de transferencia): radios R₁ y R₂ (> 0 si
 * el centro queda detrás del vértice), grosor central e, índice n en un
 * medio de índice nm. Devuelve la potencia Φ, la focal efectiva f = nm/Φ y
 * las distancias focales posterior (desde el segundo vértice) y anterior.
 * @param {number} n @param {number} R1 @param {number} R2 @param {number} e @param {number} [nm=1]
 */
export function lenteGruesa(n, R1, R2, e, nm = 1) {
  const P1 = Number.isFinite(R1) && R1 !== 0 ? (n - nm) / R1 : 0, P2 = Number.isFinite(R2) && R2 !== 0 ? (nm - n) / R2 : 0;
  const P = P1 + P2 - P1 * P2 * e / n;
  return { potencia: P, f: nm / P, posterior: nm * (1 - P1 * e / n) / P, anterior: nm * (1 - P2 * e / n) / P };
}

// ---------------------------------------------------------------------------
// Geometría: piezas (segmentos y arcos), intersecciones y contornos
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Pieza
 * @property {'segmento'|'arco'|'parabola'} tipo
 * @property {Vec} [a] @property {Vec} [b]          extremos del segmento
 * @property {Vec} [v] @property {Vec} [eje] @property {Vec} [lat] @property {number} [f] @property {number} [h]
 *           parábola: vértice, eje (hacia el foco), lateral, distancia focal y media apertura
 * @property {Vec} [c] @property {number} [r]       centro y radio del arco
 * @property {number} [a0] @property {number} [a1]  ángulos del arco (rad), de a0 a a1 en sentido antihorario (a1 > a0)
 */

/**
 * Intersección del rayo o + t·d (d unitario) con el segmento ab, para
 * t > tmin. Devuelve t, la posición u ∈ [0, 1] sobre el segmento y la normal
 * unitaria (a la izquierda de a→b).
 * @param {Vec} o @param {Vec} d @param {Vec} a @param {Vec} b @param {number} [tmin=0]
 * @returns {{t: number, u: number, normal: Vec} | null}
 */
export function interseccionSegmento(o, d, a, b, tmin = 0) {
  const e = menos(b, a), den = cruz(d, e), L = norma(e);
  if (Math.abs(den) < 1e-14 * L) return null;
  const ao = menos(a, o), t = cruz(ao, e) / den, u = cruz(ao, d) / den;
  if (!(t > tmin) || u < -1e-12 || u > 1 + 1e-12) return null;
  return { t, u, normal: [-e[1] / L, e[0] / L] };
}

/** Ángulo φ llevado al intervalo [a0, a0 + 2π). @param {number} phi @param {number} a0 */
const enRango = (phi, a0) => { let x = (phi - a0) % DOS_PI; if (x < 0) x += DOS_PI; return a0 + x; };

/**
 * Intersección del rayo o + t·d (d unitario) con el arco de centro c y radio
 * r entre a0 y a1, para t > tmin: la más cercana. Normal = (P − c)/r.
 * @param {Vec} o @param {Vec} d @param {Vec} c @param {number} r @param {number} a0 @param {number} a1 @param {number} [tmin=0]
 * @returns {{t: number, phi: number, normal: Vec} | null}
 */
export function interseccionArco(o, d, c, r, a0, a1, tmin = 0) {
  const oc = menos(o, c), b = punto(d, oc), q = punto(oc, oc) - r * r, disc = b * b - q;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  // Raíces estables: t₁·t₂ = q
  const t1 = b > 0 ? -b - s : -b + s, t2 = t1 !== 0 ? q / t1 : -b - Math.sign(b || 1) * s;
  const ts = t1 < t2 ? [t1, t2] : [t2, t1];
  const completo = a1 - a0 >= DOS_PI - 1e-12;
  for (const t of ts) {
    if (!(t > tmin)) continue;
    const P = mas(o, por(d, t)), phi = Math.atan2(P[1] - c[1], P[0] - c[0]);
    if (completo || enRango(phi, a0) <= a1 + 1e-12) return { t, phi, normal: [(P[0] - c[0]) / r, (P[1] - c[1]) / r] };
  }
  return null;
}

/**
 * Intersección del rayo o + t·d con la parábola X = Y²/(4f) de vértice v
 * (X a lo largo del eje, Y lateral, |Y| ≤ h), para t > tmin: la más cercana.
 * La normal es la de la cara del eje, (1, −Y/(2f)) normalizada, en el mundo.
 * @param {Vec} o @param {Vec} d @param {Pieza} p @param {number} [tmin=0]
 * @returns {{t: number, normal: Vec} | null}
 */
export function interseccionParabola(o, d, p, tmin = 0) {
  const ov = menos(o, /** @type {Vec} */ (p.v)), X = punto(ov, /** @type {Vec} */ (p.eje)), Y = punto(ov, /** @type {Vec} */ (p.lat));
  const dX = punto(d, /** @type {Vec} */ (p.eje)), dY = punto(d, /** @type {Vec} */ (p.lat)), f = /** @type {number} */ (p.f), h = /** @type {number} */ (p.h);
  // dY²·t² + (2·Y·dY − 4f·dX)·t + (Y² − 4f·X) = 0
  const A = dY * dY, B = 2 * Y * dY - 4 * f * dX, C = Y * Y - 4 * f * X;
  /** @type {number[]} */ let ts = [];
  if (Math.abs(A) < 1e-14 * Math.max(1, Math.abs(B))) { if (Math.abs(B) > 0) ts = [-C / B]; }
  else {
    const disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    const q = -0.5 * (B + Math.sign(B || 1) * Math.sqrt(disc));
    ts = [q / A, q !== 0 ? C / q : -B / (2 * A)].sort((a, b) => a - b);
  }
  for (const t of ts) {
    if (!(t > tmin)) continue;
    const y = Y + t * dY;
    if (Math.abs(y) > h + 1e-12) continue;
    const N = unitario(mas(/** @type {Vec} */ (p.eje), por(/** @type {Vec} */ (p.lat), -y / (2 * f))));
    return { t, normal: /** @type {Vec} */ (N) };
  }
  return null;
}

/** Intersección de un rayo con una pieza. @param {Vec} o @param {Vec} d @param {Pieza} p @param {number} tmin */
export function interseccionPieza(o, d, p, tmin) {
  if (p.tipo === 'segmento') return interseccionSegmento(o, d, p.a, p.b, tmin);
  if (p.tipo === 'parabola') return interseccionParabola(o, d, p, tmin);
  return interseccionArco(o, d, p.c, p.r, p.a0, p.a1, tmin);
}

// Dirección del rayo de prueba para el punto interior: ni horizontal ni
// vertical ni a 45°, para no pasar por vértices de las formas habituales
const DIR_PRUEBA = /** @type {Vec} */ ([Math.cos(0.4142135623), Math.sin(0.4142135623)]);

/**
 * ¿Está el punto p dentro del contorno cerrado? Regla de paridad con un rayo
 * de prueba (cuenta cortes con segmentos y arcos).
 * @param {Pieza[]} contorno @param {Vec} p
 */
export function contiene(contorno, p) {
  const d = DIR_PRUEBA;
  let cortes = 0;
  for (const q of contorno) {
    if (q.tipo === 'segmento') {
      const e = menos(q.b, q.a), den = cruz(d, e);
      if (Math.abs(den) < 1e-300) continue;
      const ao = menos(q.a, p), t = cruz(ao, e) / den, u = cruz(ao, d) / den;
      if (t > 0 && u >= 0 && u < 1) cortes++;
    } else {
      const oc = menos(p, q.c), b = punto(d, oc), qq = punto(oc, oc) - q.r * q.r, disc = b * b - qq;
      if (disc <= 0) continue;
      const s = Math.sqrt(disc), completo = q.a1 - q.a0 >= DOS_PI - 1e-12;
      for (const t of [-b - s, -b + s]) {
        if (!(t > 0)) continue;
        const phi = Math.atan2(p[1] + d[1] * t - q.c[1], p[0] + d[0] * t - q.c[0]);
        if (completo || enRango(phi, q.a0) < q.a1) cortes++;
      }
    }
  }
  return cortes % 2 === 1;
}

/**
 * @typedef {Object} Forma
 * @property {'rectangulo'|'lamina'|'prisma'|'circulo'|'semicirculo'|'poligono'|'lente'} tipo
 * @property {Vec} centro   centro (rectángulo, círculo), centroide (prisma), centro de la cara plana (semicírculo), centro del eje (lente)
 * @property {number} [giro=0] rad
 * @property {number} [ancho] @property {number} [alto]  rectángulo y lámina (m)
 * @property {number} [lado] @property {number} [angulo] prisma isósceles: lados iguales (m) y ángulo del vértice A (rad); con giro 0 el vértice apunta hacia +y
 * @property {number} [radio] círculo y semicírculo (m); el semicírculo, con giro 0, tiene la cara curva hacia +x
 * @property {Vec[]} [puntos] polígono: vértices relativos al centro
 * @property {number} [R1] @property {number} [R2] @property {number} [espesor] @property {number} [apertura]  lente gruesa con su eje a lo largo de giro (R = 0 o ∞: cara plana)
 */

/** @param {Vec[]} pts @returns {Pieza[]} */
function poligonoCerrado(pts) {
  return pts.map((a, i) => ({ tipo: /** @type {'segmento'} */ ('segmento'), a, b: pts[(i + 1) % pts.length] }));
}

/**
 * Vértices del prisma isósceles (relativos a su centroide, antes de girar).
 * @param {number} lado @param {number} A
 * @returns {Vec[]}
 */
function verticesPrisma(lado, A) {
  const b = lado * Math.sin(A / 2), H = lado * Math.cos(A / 2);
  return [[0, 2 * H / 3], [-b, -H / 3], [b, -H / 3]];
}

/** Cara de una lente: abscisa del vértice xv, radio R, semiapertura h. @param {number} xv @param {number} R @param {number} h */
function caraLente(xv, R, h) {
  if (!Number.isFinite(R) || R === 0) return { plana: true, xBorde: xv };
  if (h > Math.abs(R)) throw new RangeError('La apertura de la lente no puede superar el radio de sus caras.');
  const cx = xv + R, alfa = Math.asin(h / Math.abs(R));
  const xBorde = cx - Math.sign(R) * Math.sqrt(R * R - h * h);
  // R > 0: el arco queda a la izquierda de su centro (ángulos alrededor de π)
  return R > 0 ? { plana: false, c: /** @type {Vec} */ ([cx, 0]), r: R, a0: Math.PI - alfa, a1: Math.PI + alfa, xBorde }
    : { plana: false, c: /** @type {Vec} */ ([cx, 0]), r: -R, a0: -alfa, a1: alfa, xBorde };
}

/**
 * Contorno cerrado de una forma, en coordenadas del mundo.
 * @param {Forma} f
 * @returns {Pieza[]}
 */
export function contornoForma(f) {
  const g = f.giro ?? 0, C = f.centro;
  /** @param {Vec} p @returns {Vec} */
  const aMundo = p => mas(C, girar(p, g));
  /** @param {Pieza} p @returns {Pieza} */
  const piezaMundo = p => (p.tipo === 'segmento' ? { tipo: 'segmento', a: aMundo(p.a), b: aMundo(p.b) } : { tipo: 'arco', c: aMundo(p.c), r: p.r, a0: p.a0 + g, a1: p.a1 + g });
  switch (f.tipo) {
    case 'rectangulo': case 'lamina': {
      const w = f.ancho / 2, h = f.alto / 2;
      if (!(w > 0 && h > 0)) throw new RangeError('El ancho y el alto deben ser positivos.');
      return poligonoCerrado([[-w, -h], [w, -h], [w, h], [-w, h]].map(p => aMundo(/** @type {Vec} */ (p))));
    }
    case 'prisma': {
      if (!(f.lado > 0) || !(f.angulo > 0 && f.angulo < Math.PI)) throw new RangeError('El prisma necesita lados positivos y un ángulo entre 0° y 180°.');
      return poligonoCerrado(verticesPrisma(f.lado, f.angulo).map(aMundo));
    }
    case 'circulo': {
      if (!(f.radio > 0)) throw new RangeError('El radio debe ser positivo.');
      return [{ tipo: 'arco', c: C, r: f.radio, a0: 0, a1: DOS_PI }];
    }
    case 'semicirculo': {
      if (!(f.radio > 0)) throw new RangeError('El radio debe ser positivo.');
      return [{ tipo: 'arco', c: C, r: f.radio, a0: g - Math.PI / 2, a1: g + Math.PI / 2 }, { tipo: 'segmento', a: aMundo([0, f.radio]), b: aMundo([0, -f.radio]) }];
    }
    case 'poligono': {
      if (!Array.isArray(f.puntos) || f.puntos.length < 3) throw new RangeError('El polígono necesita al menos tres vértices.');
      return poligonoCerrado(f.puntos.map(aMundo));
    }
    case 'lente': {
      const e = f.espesor, h = (f.apertura ?? 0) / 2;
      if (!(e > 0 && h > 0)) throw new RangeError('La lente necesita grosor y apertura positivos.');
      const c1 = caraLente(-e / 2, f.R1 ?? Infinity, h), c2 = caraLente(e / 2, f.R2 ?? Infinity, h);
      if (!(c2.xBorde - c1.xBorde > 1e-12 * e)) throw new RangeError('Con esos radios, el borde de la lente tendría grosor negativo: aumenta el grosor o reduce la apertura.');
      /** @type {Pieza[]} */
      const loc = [];
      // Primera cara de abajo arriba, borde superior, segunda cara de arriba abajo, borde inferior
      loc.push(c1.plana ? { tipo: 'segmento', a: [c1.xBorde, -h], b: [c1.xBorde, h] } : { tipo: 'arco', c: c1.c, r: c1.r, a0: c1.a0, a1: c1.a1 });
      loc.push({ tipo: 'segmento', a: [c1.xBorde, h], b: [c2.xBorde, h] });
      loc.push(c2.plana ? { tipo: 'segmento', a: [c2.xBorde, h], b: [c2.xBorde, -h] } : { tipo: 'arco', c: c2.c, r: c2.r, a0: c2.a0, a1: c2.a1 });
      loc.push({ tipo: 'segmento', a: [c2.xBorde, -h], b: [c1.xBorde, -h] });
      return loc.map(piezaMundo);
    }
    default: throw new Error(`Forma desconocida: ${f.tipo}`);
  }
}

/**
 * Vértices de la forma para dibujarla como polígono (los arcos, muestreados).
 * @param {Forma} f @param {number} [porArco=48]
 * @returns {Vec[]}
 */
export function verticesForma(f, porArco = 48) {
  const tramos = contornoForma(f).map(p => {
    if (p.tipo === 'segmento') return [p.a, p.b];
    const n = Math.max(12, Math.ceil(porArco * (p.a1 - p.a0) / DOS_PI)), r = [];
    for (let i = 0; i <= n; i++) r.push(mas(p.c, por(dir(p.a0 + (p.a1 - p.a0) * i / n), p.r)));
    return r;
  });
  if (tramos.length === 1) return tramos[0].slice(0, -1);
  // Encadena las piezas: cada una empieza donde terminó la anterior (las
  // caras de una lente se recorren en sentidos alternos)
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const [t0, t1] = tramos;
  if (Math.min(d(t0[0], t1[0]), d(t0[0], t1[t1.length - 1])) < Math.min(d(t0[t0.length - 1], t1[0]), d(t0[t0.length - 1], t1[t1.length - 1]))) t0.reverse();
  const pts = [...t0];
  for (let k = 1; k < tramos.length; k++) {
    const t = tramos[k], fin = pts[pts.length - 1];
    if (d(t[t.length - 1], fin) < d(t[0], fin)) t.reverse();
    pts.push(...t.slice(1));
  }
  pts.pop();
  return pts;
}

// ---------------------------------------------------------------------------
// Escena óptica y trazado de rayos
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Elemento
 * @property {'medio'|'recipiente'|'espejo'|'lente'|'divisor'|'bloqueador'|'pantalla'|'ojo'|'rayo'|'haz'|'puntual'|'objeto'} tipo
 * @property {string} [nombre]
 * Medio: forma e índice.
 * @property {Forma} [forma] @property {number} [n] @property {string} [material] @property {{A: number, B: number}} [cauchy]
 * Elementos lineales (espejo plano, lente ideal, divisor, bloqueador, pantalla, ojo): centro, eje (giro) y largo.
 * El eje es la normal del elemento; con giro 0 el elemento queda vertical. El espejo refleja por la cara hacia la que apunta su eje.
 * @property {Vec} [centro] @property {number} [giro] @property {number} [largo]
 * @property {'plano'|'esferico'|'parabolico'} [espejo] forma del espejo (el parabólico usa R, su radio de curvatura en el vértice)
 * @property {number} [R]  espejo esférico: radio con signo (> 0 cóncavo, centro de curvatura del lado del eje); divisor: fracción reflejada
 * @property {number} [apertura] espejo esférico: cuerda (m)
 * @property {number} [reflectividad=1]
 * @property {number} [f]  lente ideal: distancia focal (m), > 0 convergente
 * Recipiente: centro del fondo, ancho, nivel del líquido, alto de las paredes.
 * @property {number} [ancho] @property {number} [nivel] @property {number} [alto]
 * Fuentes: origen, dirección (giro), longitud de onda (null: luz blanca), intensidad.
 * @property {Vec} [origen] @property {number | null} [lambda] @property {number} [I]
 * @property {number} [rayos] número de rayos (haz, puntual, objeto) @property {number} [abertura] rad (puntual, objeto)
 * @property {number} [altura] objeto: altura con signo, perpendicular a su eje (giro)
 * @property {number} [desvio=0] objeto: dirección central de sus abanicos respecto de su eje (rad)
 */

/**
 * @typedef {Object} EscenaOptica
 * @property {Elemento[]} elementos
 * @property {Indice} [ambiente]  medio exterior ({n: 1} por defecto)
 * @property {Object} [opciones]
 * @property {number} [opciones.maxRebotes=200] interacciones por camino
 * @property {number} [opciones.maxSegmentos=60000]
 * @property {number} [opciones.umbral=1e-3] intensidad relativa mínima para seguir un rayo
 * @property {boolean} [opciones.parciales=true] seguir los reflejos parciales de Fresnel
 * @property {number} [opciones.alcance] largo de los rayos que no chocan con nada (m)
 * @property {number[]} [opciones.lambdasBlanca]
 */

const ROLES_OPACOS = { bloqueador: 3, pantalla: 3, ojo: 3, espejo: 2, divisor: 2, lente: 1, interfaz: 0 };

/**
 * Prepara la escena: contornos de los medios, piezas con su papel y escala.
 * Lanza un error si un elemento no describe una situación física.
 * @param {EscenaOptica} escena
 */
export function prepararEscena(escena) {
  if (!escena || !Array.isArray(escena.elementos)) throw new Error('La escena necesita una lista de elementos.');
  const medios = [], piezas = [], fuentes = [];
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  /** @param {Vec} p */
  const caja = p => { xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]); ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); };
  /** @param {Pieza} p */
  const cajaPieza = p => {
    if (p.tipo === 'segmento') { caja(p.a); caja(p.b); }
    else if (p.tipo === 'parabola') { const X = p.h * p.h / (4 * p.f); caja(p.v); for (const sg of [-1, 1]) caja(mas(mas(p.v, por(p.lat, sg * p.h)), por(p.eje, X))); }
    else { caja(mas(p.c, [-p.r, -p.r])); caja(mas(p.c, [p.r, p.r])); }
  };
  /** @param {any} m */
  const validarIndice = m => { const n = indiceDe(m); if (!(n >= 1e-3 && n < 100)) throw new RangeError('El índice de refracción debe ser positivo.'); };
  escena.elementos.forEach((el, k) => {
    switch (el.tipo) {
      case 'medio': {
        validarIndice(el);
        const contorno = contornoForma(el.forma);
        medios.push({ k, contorno, indice: el });
        contorno.forEach(p => { piezas.push({ ...p, rol: 'interfaz', elemento: k }); cajaPieza(p); });
        break;
      }
      case 'recipiente': {
        validarIndice(el);
        const g = el.giro ?? 0, w = el.ancho, H = el.nivel, P = Math.max(el.alto ?? H, H);
        if (!(w > 0 && H > 0)) throw new RangeError('El recipiente necesita ancho y nivel positivos.');
        const forma = { tipo: 'rectangulo', centro: mas(el.centro, girar([0, H / 2], g)), ancho: w, alto: H, giro: g };
        const contorno = contornoForma(/** @type {Forma} */ (forma));
        medios.push({ k, contorno, indice: el });
        contorno.forEach(p => { piezas.push({ ...p, rol: 'interfaz', elemento: k }); cajaPieza(p); });
        /** @param {Vec} p @returns {Vec} */
        const m = p => mas(el.centro, girar(p, g));
        for (const [a, b] of [[[-w / 2, P], [-w / 2, 0]], [[-w / 2, 0], [w / 2, 0]], [[w / 2, 0], [w / 2, P]]]) {
          const s = { tipo: 'segmento', a: m(/** @type {Vec} */ (a)), b: m(/** @type {Vec} */ (b)) };
          piezas.push({ ...s, rol: 'bloqueador', elemento: k }); cajaPieza(/** @type {Pieza} */ (s));
        }
        break;
      }
      case 'espejo': {
        const g = el.giro ?? 0, eje = dir(g);
        if ((el.espejo ?? 'plano') === 'plano') {
          if (!(el.largo > 0)) throw new RangeError('El espejo necesita un largo positivo.');
          const t = /** @type {Vec} */ ([-eje[1], eje[0]]), a = mas(el.centro, por(t, -el.largo / 2)), b = mas(el.centro, por(t, el.largo / 2));
          const s = { tipo: 'segmento', a, b, rol: 'espejo', elemento: k, eje };
          piezas.push(s); cajaPieza(/** @type {Pieza} */ (s));
        } else if (el.espejo === 'parabolico') {
          // Parábola de vértice en el centro y radio de curvatura R en él (f = R/2):
          // todos los rayos paralelos al eje pasan por el foco, sin aberración esférica
          const R = el.R, h = (el.apertura ?? 0) / 2;
          if (!(Math.abs(R) > 0) || !(h > 0)) throw new RangeError('El espejo parabólico necesita un radio en el vértice y una apertura válidos.');
          const s = { tipo: 'parabola', v: el.centro, eje, lat: /** @type {Vec} */ ([-eje[1], eje[0]]), f: R / 2, h, rol: 'espejo', elemento: k };
          piezas.push(s); cajaPieza(/** @type {Pieza} */ (s));
        } else {
          const R = el.R, h = (el.apertura ?? 0) / 2;
          if (!(Math.abs(R) > 0) || !(h > 0) || h > Math.abs(R)) throw new RangeError('El espejo esférico necesita un radio y una apertura válidos (apertura ≤ 2|R|).');
          const c = mas(el.centro, por(eje, R)), alfa = Math.asin(h / Math.abs(R));
          // Dirección del vértice vista desde el centro de curvatura
          const av = Math.atan2(el.centro[1] - c[1], el.centro[0] - c[0]);
          const s = { tipo: 'arco', c, r: Math.abs(R), a0: av - alfa, a1: av + alfa, rol: 'espejo', elemento: k, concavo: R > 0 };
          piezas.push(s); cajaPieza(/** @type {Pieza} */ (s));
        }
        break;
      }
      case 'lente': case 'divisor': case 'bloqueador': case 'pantalla': case 'ojo': {
        if (!(el.largo > 0)) throw new RangeError('El elemento necesita un largo positivo.');
        if (el.tipo === 'lente' && !(Number.isFinite(el.f) && el.f !== 0)) throw new RangeError('La lente necesita una distancia focal distinta de cero.');
        if (el.tipo === 'divisor' && !(el.R >= 0 && el.R <= 1)) throw new RangeError('La fracción reflejada del divisor va de 0 a 1.');
        const g = el.giro ?? 0, eje = dir(g), t = /** @type {Vec} */ ([-eje[1], eje[0]]);
        const s = { tipo: 'segmento', a: mas(el.centro, por(t, -el.largo / 2)), b: mas(el.centro, por(t, el.largo / 2)), rol: el.tipo, elemento: k, eje, lat: t, centro: el.centro };
        piezas.push(s); cajaPieza(/** @type {Pieza} */ (s));
        break;
      }
      case 'rayo': case 'haz': case 'puntual': case 'objeto': {
        if (el.lambda != null && !(el.lambda > 1e-9 && el.lambda < 1e-3)) throw new RangeError('La longitud de onda debe ser positiva.');
        fuentes.push(k); caja(el.origen ?? el.centro);
        break;
      }
      default: throw new Error(`Tipo de elemento desconocido: ${el.tipo}`);
    }
  });
  piezas.forEach(p => { p.prioridad = ROLES_OPACOS[p.rol] ?? 0; });
  const escala = Math.max(1e-6, Math.hypot(xmax - xmin, ymax - ymin) || 1);
  return { medios, piezas, fuentes, escala, caja: { x0: xmin, x1: xmax, y0: ymin, y1: ymax } };
}

/**
 * Índice en un punto: el del último medio de la lista que lo contiene (los
 * de más arriba tapan a los de abajo) o el del ambiente.
 * @param {{medios: any[]}} prep @param {Indice | undefined} ambiente @param {Vec} p @param {number | null} lambda
 */
export function indiceEn(prep, ambiente, p, lambda) {
  for (let i = prep.medios.length - 1; i >= 0; i--) if (contiene(prep.medios[i].contorno, p)) return indiceDe(prep.medios[i].indice, lambda);
  return indiceDe(ambiente ?? { n: 1 }, lambda);
}

/** Medio (índice en la lista de elementos) que contiene p, o −1 si es el ambiente. @param {{medios: any[]}} prep @param {Vec} p */
function medioEn(prep, p) {
  for (let i = prep.medios.length - 1; i >= 0; i--) if (contiene(prep.medios[i].contorno, p)) return prep.medios[i];
  return null;
}

/**
 * Rayos que emite una fuente: [{o, d, I, lambda, punto, rayo}].
 * @param {Elemento} el
 */
export function rayosFuente(el) {
  const I = el.I ?? 1, lambda = el.lambda ?? null, g = el.giro ?? 0, r = [];
  if (el.tipo === 'rayo') r.push({ o: el.origen, d: dir(g), I, lambda, punto: 0, rayo: 0 });
  else if (el.tipo === 'haz') {
    const n = Math.max(1, Math.round(el.rayos ?? 7)), t = /** @type {Vec} */ ([-Math.sin(g), Math.cos(g)]), w = el.ancho ?? 0;
    for (let i = 0; i < n; i++) { const s = n === 1 ? 0 : -w / 2 + w * i / (n - 1); r.push({ o: mas(el.centro ?? el.origen, por(t, s)), d: dir(g), I: I / n, lambda, punto: 0, rayo: i }); }
  } else if (el.tipo === 'puntual' || el.tipo === 'objeto') {
    const n = Math.max(1, Math.round(el.rayos ?? 9)), ab = Math.min(DOS_PI, el.abertura ?? DOS_PI), lleno = ab >= DOS_PI - 1e-9;
    const puntos = el.tipo === 'objeto'
      ? [mas(el.origen, por([-Math.sin(g), Math.cos(g)], el.altura ?? 0)), el.origen]
      : [el.origen];
    puntos.forEach((p, k) => {
      for (let i = 0; i < n; i++) {
        const gc = g + (el.tipo === 'objeto' ? el.desvio ?? 0 : 0);
        const a = lleno ? gc + DOS_PI * i / n : n === 1 ? gc : gc - ab / 2 + ab * i / (n - 1);
        r.push({ o: p, d: dir(a), I: I / n, lambda, punto: k, rayo: i });
      }
    });
  }
  return r;
}

/**
 * Traza todos los rayos de la escena.
 * Devuelve:
 * - segmentos: {a, b, lambda (null: blanca), I, rel (intensidad relativa a la
 *   inicial de su componente), n (índice del medio), fuente, punto, rayo,
 *   nivel, infinito, tramo (identificador de la rama)};
 * - interacciones: cada choque con una interfaz, espejo, lente o divisor:
 *   {tipo: 'refraccion'|'total'|'espejo'|'lente'|'divisor', p, normal
 *   (hacia el lado de incidencia), d (dirección de llegada), salida
 *   (dirección del transmitido o del reflejado principal), theta1, theta2,
 *   n1, n2, R, T, lambda, I, I0 (inicial de su componente), nivel (número
 *   de la interacción en su camino), elemento, fuente, punto, rayo, tramo};
 * - impactos: rayos que llegan a una pantalla o al ojo {elemento, rol, s
 *   (posición sobre el elemento), p, lambda, I, angulo, fuente, punto, rayo};
 * - caminos: cada rama completa {fuente, punto, rayo, lambda, firma (lista
 *   de las interacciones que la desviaron), ultimo: {p, d} (tras la última
 *   desviación), termina: {rol, elemento} | null, I, linaje (tramos que la
 *   forman, del rayo emitido a la rama)};
 * - avisos e incompleta (límite de rebotes o de segmentos).
 * @param {EscenaOptica} escena
 */
export function trazar(escena) {
  const prep = prepararEscena(escena), op = escena.opciones || {};
  const amb = escena.ambiente ?? { n: 1 };
  const maxRebotes = op.maxRebotes ?? 200, maxSeg = op.maxSegmentos ?? 60000, umbral = op.umbral ?? 1e-3;
  const parciales = op.parciales ?? true, lambdasBlanca = op.lambdasBlanca ?? LAMBDAS_BLANCA;
  const esc = prep.escala, alcance = op.alcance ?? 20 * esc, tmin = 1e-10 * esc, eps = 1e-8 * esc;
  const dispersivos = prep.medios.some(m => esDispersivo(m.indice)) || esDispersivo(amb);
  const l0 = lambdasBlanca[0], l1 = lambdasBlanca[lambdasBlanca.length - 1];
  const segmentos = [], interacciones = [], impactos = [], caminos = [], avisos = [];
  let truncados = 0, cortado = false, ids = 0;

  /** @type {any[]} */
  const pila = [];
  for (const k of prep.fuentes) {
    for (const r of rayosFuente(escena.elementos[k]).reverse()) { const id = ids++; pila.push({ ...r, I0: r.I, fuente: k, nivel: 0, firma: [], ultimo: null, tramo: id, linaje: [id] }); }
  }
  /** @param {any} r @param {any} termina */
  const cerrar = (r, termina) => caminos.push({ fuente: r.fuente, punto: r.punto, rayo: r.rayo, lambda: r.lambda, firma: r.firma, ultimo: r.ultimo, termina, I: r.I, linaje: r.linaje });
  // Sigue el rayo r desde o en la dirección d (marca: interacción que lo
  // desvía; rama: abre un tramo nuevo porque el rayo se partió en dos)
  /** @param {any} r @param {Vec} o @param {Vec} d @param {number} I @param {string | null} marca @param {boolean} rama */
  const seguir = (r, o, d, I, marca, rama) => {
    if (I < umbral * r.I0) { cerrar({ ...r, I }, { rol: 'umbral' }); return; }
    const id = rama ? ids++ : r.tramo;
    pila.push({ ...r, o, d, I, nivel: r.nivel + 1, firma: marca ? [...r.firma, marca] : r.firma, ultimo: marca ? { p: o, d } : r.ultimo, tramo: id, linaje: rama ? [...r.linaje, id] : r.linaje });
  };
  /** @param {any} r @param {Vec} b @param {number} n @param {boolean} infinito */
  const segmento = (r, b, n, infinito) => segmentos.push({ a: r.o, b, lambda: r.lambda, I: r.I, rel: r.I / r.I0, n, fuente: r.fuente, punto: r.punto, rayo: r.rayo, nivel: r.nivel, infinito, tramo: r.tramo });

  while (pila.length) {
    const r = pila.pop();
    if (segmentos.length >= maxSeg) { cortado = true; break; }
    if (r.nivel > maxRebotes) { truncados++; cerrar(r, { rol: 'limite' }); continue; }
    // Choque más cercano (a igual distancia, lo opaco antes que una interfaz)
    let mejor = null, pz = null;
    for (const p of prep.piezas) {
      const h = interseccionPieza(r.o, r.d, p, tmin);
      if (!h) continue;
      if (!mejor || h.t < mejor.t - tmin * 10 || (Math.abs(h.t - mejor.t) <= tmin * 10 && p.prioridad > pz.prioridad)) { mejor = h; pz = p; }
    }
    const nSeg = indiceEn(prep, amb, mas(r.o, por(r.d, Math.min(mejor ? mejor.t / 2 : esc, esc))), r.lambda);
    if (!mejor) { segmento(r, mas(r.o, por(r.d, alcance)), nSeg, true); cerrar(r, null); continue; }
    const P = mas(r.o, por(r.d, mejor.t));
    segmento(r, P, nSeg, false);
    // Normal orientada hacia el lado al que va el rayo
    let N = /** @type {Vec} */ (mejor.normal);
    if (punto(N, r.d) < 0) N = por(N, -1);
    const cosi = Math.min(1, punto(N, r.d)), theta1 = Math.acos(cosi);
    const base = { p: P, normal: por(N, -1), d: r.d, theta1, lambda: r.lambda, I: r.I, I0: r.I0, nivel: r.nivel, elemento: pz.elemento, fuente: r.fuente, punto: r.punto, rayo: r.rayo, tramo: r.tramo };
    const reflejado = /** @type {Vec} */ (unitario(menos(r.d, por(N, 2 * cosi))));

    switch (pz.rol) {
      case 'bloqueador': cerrar(r, { rol: 'bloqueador', elemento: pz.elemento }); break;
      case 'pantalla': case 'ojo': {
        const s = punto(menos(P, pz.centro), pz.lat);
        impactos.push({ elemento: pz.elemento, rol: pz.rol, s, p: P, lambda: r.lambda, I: r.I, angulo: theta1, fuente: r.fuente, punto: r.punto, rayo: r.rayo, tramo: r.tramo });
        cerrar(r, { rol: pz.rol, elemento: pz.elemento });
        break;
      }
      case 'espejo': {
        // Solo refleja por su cara: la del eje (plano), la cóncava o la convexa (esférico)
        const frente = pz.tipo === 'segmento' ? punto(r.d, pz.eje) < 0 : pz.tipo === 'parabola' ? punto(r.d, mejor.normal) < 0 : (punto(r.d, menos(P, pz.c)) > 0) === pz.concavo;
        if (!frente) { cerrar(r, { rol: 'espejo-dorso', elemento: pz.elemento }); break; }
        const rho = escena.elementos[pz.elemento].reflectividad ?? 1;
        interacciones.push({ ...base, tipo: 'espejo', theta2: theta1, n1: nSeg, n2: nSeg, R: rho, T: 0, salida: reflejado });
        seguir(r, P, reflejado, r.I * rho, `${pz.elemento}R`, false);
        break;
      }
      case 'lente': {
        // Lente ideal: pendiente u′ = u − h/f en el marco (eje hacia donde avanza, lateral)
        const f = escena.elementos[pz.elemento].f, sgn = Math.sign(punto(r.d, pz.eje)) || 1, e1 = por(pz.eje, sgn);
        const u = punto(r.d, pz.lat) / punto(r.d, e1), h = punto(menos(P, pz.centro), pz.lat), u2 = u - h / f;
        const d2 = unitario(mas(e1, por(pz.lat, u2)));
        interacciones.push({ ...base, tipo: 'lente', theta2: Math.acos(Math.min(1, Math.abs(punto(d2, N)))), n1: nSeg, n2: nSeg, R: 0, T: 1, salida: d2 });
        seguir(r, P, d2, r.I, `${pz.elemento}L`, false);
        break;
      }
      case 'divisor': {
        const Rf = escena.elementos[pz.elemento].R;
        interacciones.push({ ...base, tipo: 'divisor', theta2: theta1, n1: nSeg, n2: nSeg, R: Rf, T: 1 - Rf, salida: reflejado });
        seguir(r, P, r.d, r.I * (1 - Rf), `${pz.elemento}t`, true);
        seguir(r, P, reflejado, r.I * Rf, `${pz.elemento}r`, true);
        break;
      }
      default: {
        // Interfaz entre medios: índices a cada lado del punto de choque
        const m1 = medioEn(prep, menos(P, por(N, eps))), m2 = medioEn(prep, mas(P, por(N, eps)));
        const ind1 = m1 ? m1.indice : amb, ind2 = m2 ? m2.indice : amb;
        // La luz blanca se separa donde el cociente n₁/n₂ depende de λ
        const separa = r.lambda == null && dispersivos
          && Math.abs(indiceDe(ind1, l0) / indiceDe(ind2, l0) - indiceDe(ind1, l1) / indiceDe(ind2, l1)) > 1e-12;
        const comps = separa ? lambdasBlanca.map(l => ({ ...r, lambda: l, I: r.I / lambdasBlanca.length, I0: r.I0 / lambdasBlanca.length })) : [r];
        for (const c of comps) {
          const n1 = indiceDe(ind1, c.lambda), n2 = indiceDe(ind2, c.lambda), rama = separa || parciales;
          // Mismo índice a los dos lados: la luz sigue de largo
          if (Math.abs(n1 - n2) < 1e-12) { seguir(c, P, c.d, c.I, null, separa); continue; }
          const F = fresnel(n1, n2, theta1), bc = { ...base, lambda: c.lambda, I: c.I, n1, n2 };
          if (F.total) {
            interacciones.push({ ...bc, tipo: 'total', theta2: NaN, R: 1, T: 0, salida: reflejado });
            seguir(c, P, reflejado, c.I, `${pz.elemento}R`, separa);
          } else {
            const eta = n1 / n2, ct = Math.cos(F.theta2);
            const dt = unitario(mas(por(c.d, eta), por(N, ct - eta * cosi)));
            interacciones.push({ ...bc, tipo: 'refraccion', theta2: F.theta2, R: F.R, T: 1 - F.R, salida: dt });
            seguir(c, P, dt, c.I * (1 - F.R), `${pz.elemento}T`, rama);
            if (parciales) seguir(c, P, reflejado, c.I * F.R, `${pz.elemento}R`, rama);
          }
        }
      }
    }
  }
  if (truncados) avisos.push(`${truncados} ${truncados === 1 ? 'rayo llegó' : 'rayos llegaron'} al límite de ${maxRebotes} rebotes.`);
  if (cortado) avisos.push(`Se alcanzó el límite de ${maxSeg} segmentos: el trazado está incompleto.`);
  return { segmentos, interacciones, impactos, caminos, avisos, incompleta: cortado || truncados > 0 ? { motivo: avisos.join(' ') } : null, prep };
}

// ---------------------------------------------------------------------------
// Imágenes halladas con los rayos
// ---------------------------------------------------------------------------

/**
 * Punto que mejor ajusta (mínimos cuadrados) a un haz de rectas p + τ·d:
 * minimiza Σ |(X − p) × d|². Devuelve null si las rectas son paralelas
 * (imagen en el infinito).
 * @param {Array<{p: Vec, d: Vec}>} rectas
 */
export function cruceRectas(rectas) {
  let a = 0, b = 0, c = 0, bx = 0, by = 0, dmin = Infinity, dmax = -Infinity;
  for (const { p, d } of rectas) {
    const xx = 1 - d[0] * d[0], xy = -d[0] * d[1], yy = 1 - d[1] * d[1];
    a += xx; b += xy; c += yy;
    bx += xx * p[0] + xy * p[1]; by += xy * p[0] + yy * p[1];
    const ang = Math.atan2(d[1], d[0]); dmin = Math.min(dmin, ang); dmax = Math.max(dmax, ang);
  }
  const det = a * c - b * b, n = rectas.length;
  if (n < 2 || det < 1e-18 * n * n || dmax - dmin < 1e-12) return null;
  const X = /** @type {Vec} */ ([(c * bx - b * by) / det, (a * by - b * bx) / det]);
  let s2 = 0, adelante = 0;
  const taus = [];
  for (const { p, d } of rectas) {
    const v = menos(X, p), tau = punto(v, d), perp = cruz(v, d);
    s2 += perp * perp; taus.push(tau); if (tau > 0) adelante++;
  }
  return { p: X, rms: Math.sqrt(s2 / n), real: adelante > n / 2, taus };
}

/**
 * Imágenes que forman los haces que salen de cada punto emisor (fuentes
 * puntuales y la punta y el pie de cada objeto luminoso). Se agrupan los
 * rayos que siguieron el mismo camino (misma secuencia de desviaciones y la
 * misma λ) y se halla su cruce: real si los rayos se cruzan delante de la
 * última desviación; virtual si se cruzan sus prolongaciones. Con un ojo en
 * la escena, también lo que ve el ojo (solo los rayos que le llegan).
 * @param {ReturnType<typeof trazar>} res
 * @param {{minimo?: number}} [o] rayos mínimos por grupo (3)
 */
export function imagenesTrazadas(res, o = {}) {
  const minimo = o.minimo ?? 3, grupos = new Map();
  const agregar = (clave, c, ojo) => {
    if (!grupos.has(clave)) grupos.set(clave, { fuente: c.fuente, punto: c.punto, lambda: c.lambda, firma: c.firma.join(' '), ojo, rectas: [] });
    grupos.get(clave).rectas.push({ p: c.ultimo.p, d: c.ultimo.d });
  };
  for (const c of res.caminos) {
    if (!c.ultimo || !c.firma.length) continue;
    const base = `${c.fuente}|${c.punto}|${c.lambda}|${c.firma.join(' ')}`;
    agregar(base, c, null);
    if (c.termina && c.termina.rol === 'ojo') agregar(`${base}|ojo${c.termina.elemento}`, c, c.termina.elemento);
  }
  const imgs = [];
  for (const g of grupos.values()) {
    if (g.rectas.length < minimo) continue;
    const x = cruceRectas(g.rectas);
    imgs.push({ fuente: g.fuente, punto: g.punto, lambda: g.lambda, firma: g.firma, ojo: g.ojo, rayos: g.rectas.length,
      p: x ? x.p : null, real: x ? x.real : false, rms: x ? x.rms : NaN, infinito: !x, rectas: g.rectas });
  }
  return imgs;
}

/**
 * Histograma de la intensidad que llega a una pantalla (o al ojo) a lo largo
 * de su largo, por longitud de onda (null = blanca).
 * @param {ReturnType<typeof trazar>} res @param {number} elemento @param {number} largo @param {number} [n=80]
 */
export function intensidadPantalla(res, elemento, largo, n = 80) {
  const total = new Float64Array(n), porLambda = new Map();
  for (const h of res.impactos) {
    if (h.elemento !== elemento) continue;
    const i = Math.min(n - 1, Math.max(0, Math.floor((h.s / largo + 0.5) * n)));
    total[i] += h.I;
    const k = h.lambda ?? 0;
    if (!porLambda.has(k)) porLambda.set(k, new Float64Array(n));
    porLambda.get(k)[i] += h.I;
  }
  const s = Array.from({ length: n }, (_, i) => -largo / 2 + largo * (i + 0.5) / n);
  return { s, total, porLambda, potencia: total.reduce((a, b) => a + b, 0) };
}

/**
 * Largo del camino óptico Σ n·ℓ (y geométrico) de un camino trazado, desde
 * la fuente hasta donde termina (sin el tramo final si se pierde en el
 * infinito), y el tiempo que tarda la luz.
 * @param {ReturnType<typeof trazar>} res @param {{linaje: number[]}} camino
 */
export function caminoOptico(res, camino) {
  const tramos = new Set(camino.linaje);
  let L = 0, Lg = 0;
  for (const s of res.segmentos) if (tramos.has(s.tramo) && !s.infinito) { const l = norma(menos(s.b, s.a)); L += s.n * l; Lg += l; }
  return { optico: L, geometrico: Lg, tiempo: L / C_LUZ };
}

// ---------------------------------------------------------------------------
// Color de la luz
// ---------------------------------------------------------------------------

/** Gaussiana de dos anchos (Wyman, Sloan y Shirley 2013). */
function lobulo(x, mu, s1, s2) { const u = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * u * u); }

/**
 * Funciones de igualación del observador CIE 1931 de 2° (aproximación
 * analítica de varios lóbulos de Wyman, Sloan y Shirley, 2013).
 * @param {number} lambda m @returns {[number, number, number]} x̄, ȳ, z̄
 */
export function cie1931(lambda) {
  const l = lambda * 1e9;
  return [
    1.056 * lobulo(l, 599.8, 37.9, 31.0) + 0.362 * lobulo(l, 442.0, 16.0, 26.7) - 0.065 * lobulo(l, 501.1, 20.4, 26.2),
    0.821 * lobulo(l, 568.8, 46.9, 40.5) + 0.286 * lobulo(l, 530.9, 16.3, 31.1),
    1.217 * lobulo(l, 437.0, 11.8, 36.0) + 0.681 * lobulo(l, 459.0, 26.0, 13.8),
  ];
}

/** XYZ → sRGB lineal (primarios y blanco D65 de IEC 61966-2-1). @param {number[]} xyz @returns {[number, number, number]} */
export function rgbLineal([X, Y, Z]) {
  return [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z];
}

/** Codificación sRGB (gamma) de una componente lineal en [0, 1]. @param {number} x */
export const gammaSRGB = x => { const v = Math.min(1, Math.max(0, x)); return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; };

/**
 * Color de una longitud de onda, saturado y con brillo máximo (para dibujar
 * rayos): XYZ de la CIE → sRGB lineal; como los colores espectrales quedan
 * fuera de la gama sRGB, se recortan a cero sus componentes negativas
 * y se escala para que la mayor valga 1. Devuelve sRGB lineal
 * (`lineal`) y codificado (`srgb`), en [0, 1].
 * @param {number} lambda m
 */
export function colorLongitudOnda(lambda) {
  // Fuera de la gama: se recortan las componentes negativas (sumar blanco
  // volvería rosados los rojos) y se escala para que la mayor valga 1
  const [r, g, b] = rgbLineal(cie1931(lambda)).map(x => Math.max(0, x));
  const M = Math.max(r, g, b) || 1;
  const lineal = /** @type {[number, number, number]} */ ([r / M, g / M, b / M]);
  return { lineal, srgb: lineal.map(gammaSRGB) };
}

/** Muestras del visible (m) para integrar espectros. @param {number} [n=36] */
export function muestrasVisible(n = 36) { return Array.from({ length: n }, (_, i) => (380 + 370 * (i + 0.5) / n) * 1e-9); }

const blancoCache = new Map();
/**
 * Color (sRGB lineal, sin acotar) de una luz con espectro dado por pesos en
 * las longitudes de onda `lambdas`, equilibrado para que el espectro plano
 * (todos los pesos 1) dé blanco (1, 1, 1).
 * @param {number[]} lambdas @param {ArrayLike<number>} pesos
 */
export function colorEspectro(lambdas, pesos) {
  const clave = lambdas.join(',');
  if (!blancoCache.has(clave)) {
    const w = [0, 0, 0];
    for (const l of lambdas) { const c = rgbLineal(cie1931(l)); w[0] += c[0]; w[1] += c[1]; w[2] += c[2]; }
    blancoCache.set(clave, { w, rgb: lambdas.map(l => rgbLineal(cie1931(l))) });
  }
  const { w, rgb } = blancoCache.get(clave), s = [0, 0, 0];
  for (let i = 0; i < lambdas.length; i++) { const c = rgb[i], p = pesos[i]; s[0] += p * c[0]; s[1] += p * c[1]; s[2] += p * c[2]; }
  return /** @type {[number, number, number]} */ ([s[0] / w[0], s[1] / w[1], s[2] / w[2]]);
}

// ---------------------------------------------------------------------------
// Óptica ondulatoria: rendijas y redes por fasores
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Rendija
 * @property {number} y  centro (m)
 * @property {number} a  ancho (m); 0 = rendija puntual
 */

/**
 * N rendijas iguales de ancho a separadas d (centro a centro), centradas en 0.
 * @param {{N: number, d?: number, a?: number}} p @returns {Rendija[]}
 */
export function rendijasRegulares({ N, d = 0, a = 0 }) {
  const n = Math.max(1, Math.round(N));
  return Array.from({ length: n }, (_, i) => ({ y: (i - (n - 1) / 2) * d, a }));
}

/**
 * Fuentes de Huygens de cada rendija: m puntos equiespaciados con su peso
 * (ancho que representa cada uno).
 * @param {Rendija[]} rendijas @param {number} m
 */
function subfuentes(rendijas, m) {
  return rendijas.map(r => {
    if (!(r.a > 0)) return [{ y: r.y, w: 1 }];
    return Array.from({ length: m }, (_, j) => ({ y: r.y - r.a / 2 + r.a * (j + 0.5) / m, w: r.a / m }));
  });
}

/**
 * Subfuentes por rendija para resolver la fase a lo largo de su ancho en
 * toda la pantalla (al menos 8 por cada vuelta de fase).
 * @param {Rendija[]} rendijas @param {number} lambda @param {number} n @param {number} L @param {number} ymax
 */
export function subdivisionRendija(rendijas, lambda, n, L, ymax) {
  const a = Math.max(0, ...rendijas.map(r => r.a || 0));
  if (!(a > 0)) return 1;
  const ymaxR = Math.max(...rendijas.map(r => Math.abs(r.y) + r.a / 2));
  const seno = Math.min(1, (Math.abs(ymax) + ymaxR) / Math.hypot(L, Math.abs(ymax) + ymaxR));
  return Math.max(6, Math.min(400, Math.ceil(8 * n * a * seno / lambda) + 6));
}

/**
 * @typedef {Object} EscenaRendijas
 * @property {number} lambda   m (en el vacío)
 * @property {number} [n=1]    índice del medio entre las rendijas y la pantalla
 * @property {number} L        distancia de las rendijas a la pantalla (m)
 * @property {Rendija[]} rendijas
 * @property {number} [sub]    subfuentes por rendija (si no, se eligen solas)
 */

/**
 * Fasor en un punto Y de la pantalla: suma de las ondas cilíndricas de
 * Huygens de cada subfuente, amplitud w/√(λₙ·r) con factor de oblicuidad
 * (1 + cos θ)/2 y fase 2π·n·r/λ. Devuelve el total, el fasor de cada
 * rendija y, con detalle, el de cada subfuente (para dibujar los fasores).
 * @param {EscenaRendijas} p @param {number} Y @param {number} [sub] @param {boolean} [detalle=false]
 */
export function fasoresEn(p, Y, sub, detalle = false) {
  const n = p.n ?? 1, lm = p.lambda / n, k = DOS_PI / lm, m = sub ?? p.sub ?? subdivisionRendija(p.rendijas, p.lambda, n, p.L, Y);
  const fuentesR = subfuentes(p.rendijas, m), fasores = [], subfasores = [];
  let re = 0, im = 0;
  for (const lista of fuentesR) {
    let fr = 0, fi = 0;
    const parte = [];
    for (const s of lista) {
      const dy = Y - s.y, r = Math.hypot(p.L, dy), A = s.w / Math.sqrt(lm * r) * 0.5 * (1 + p.L / r), ph = k * r;
      fr += A * Math.cos(ph); fi += A * Math.sin(ph);
      if (detalle) parte.push({ re: A * Math.cos(ph), im: A * Math.sin(ph) });
    }
    fasores.push({ re: fr, im: fi }); re += fr; im += fi;
    if (detalle) subfasores.push(parte);
  }
  return { re, im, I: re * re + im * im, fasores, subfasores: detalle ? subfasores : null };
}

/**
 * Factor de Fraunhofer normalizado (1 en el centro): (sen β/β)²·(sen Nα/(N sen α))²
 * con β = π·n·a·sen θ/λ y α = π·n·d·sen θ/λ.
 * @param {number} senTheta @param {{lambda: number, n?: number, a?: number, d?: number, N?: number}} p
 */
export function factorFraunhofer(senTheta, { lambda, n = 1, a = 0, d = 0, N = 1 }) {
  const beta = Math.PI * n * a * senTheta / lambda, alfa = Math.PI * n * d * senTheta / lambda;
  const env = Math.abs(beta) < 1e-12 ? 1 : (Math.sin(beta) / beta) ** 2;
  let red = 1;
  if (N > 1) { const s = Math.sin(alfa); red = Math.abs(s) < 1e-12 ? 1 : (Math.sin(N * alfa) / (N * s)) ** 2; }
  return env * red;
}

/**
 * Patrón de intensidad en la pantalla, entre y0 e y1 (m), con `puntos`
 * muestras. Método 'huygens' (suma de fasores con las distancias exactas:
 * vale cerca y lejos) o 'fraunhofer' (forma cerrada, campo lejano: N
 * rendijas iguales y equiespaciadas). 'auto' elige Huygens salvo que el
 * costo sea muy grande (redes de muchas líneas).
 * @param {EscenaRendijas} p @param {{y0: number, y1: number, puntos?: number, metodo?: 'auto'|'huygens'|'fraunhofer'}} pantalla
 */
export function patronRendijas(p, pantalla) {
  const n = p.n ?? 1, P = Math.max(2, Math.round(pantalla.puntos ?? 600)), y = new Float64Array(P), I = new Float64Array(P);
  if (!(p.lambda > 0) || !(p.L > 0) || !p.rendijas?.length) throw new RangeError('El patrón necesita λ > 0, L > 0 y al menos una rendija.');
  const ymax = Math.max(Math.abs(pantalla.y0), Math.abs(pantalla.y1));
  const sub = p.sub ?? subdivisionRendija(p.rendijas, p.lambda, n, p.L, ymax);
  let metodo = pantalla.metodo ?? 'auto';
  if (metodo === 'auto') metodo = p.rendijas.length * sub * P > 3e6 ? 'fraunhofer' : 'huygens';
  const lm = p.lambda / n, N = p.rendijas.length, a = p.rendijas[0].a || 0, d = N > 1 ? (p.rendijas[N - 1].y - p.rendijas[0].y) / (N - 1) : 0;
  const yc = p.rendijas.reduce((s, r) => s + r.y, 0) / N;
  for (let i = 0; i < P; i++) {
    const Y = pantalla.y0 + (pantalla.y1 - pantalla.y0) * i / (P - 1);
    y[i] = Y;
    if (metodo === 'huygens') I[i] = fasoresEn(p, Y, sub).I;
    else {
      const r = Math.hypot(p.L, Y - yc), sen = (Y - yc) / r, w = a > 0 ? a : 1, ob = 0.5 * (1 + p.L / r);
      I[i] = (N * w * ob) ** 2 / (lm * r) * factorFraunhofer(sen, { lambda: p.lambda, n, a, d, N });
    }
  }
  let Imax = 0; for (let i = 0; i < P; i++) Imax = Math.max(Imax, I[i]);
  return { y, I, Imax, metodo, sub };
}

/** Interfranja de Young (ángulos pequeños): Δy = λL/(n·d). @param {number} lambda @param {number} L @param {number} d @param {number} [n=1] */
export const interfranja = (lambda, L, d, n = 1) => lambda * L / (n * d);

/**
 * Máximos principales de N rendijas o de una red: n·d·sen θ = m·λ.
 * @param {number} lambda @param {number} d @param {number} [n=1]
 * @returns {Array<{m: number, theta: number}>}
 */
export function maximosRed(lambda, d, n = 1) {
  const r = [], mmax = Math.floor(n * d / lambda + 1e-12);
  for (let m = -mmax; m <= mmax; m++) { const s = m * lambda / (n * d); if (Math.abs(s) < 1) r.push({ m, theta: Math.asin(s) }); }
  return r;
}

/**
 * Mínimos de una rendija simple: n·a·sen θ = m·λ (m ≠ 0).
 * @param {number} lambda @param {number} a @param {number} [n=1]
 */
export function minimosRendija(lambda, a, n = 1) {
  const r = [], mmax = Math.floor(n * a / lambda + 1e-12);
  for (let m = -mmax; m <= mmax; m++) { if (m === 0) continue; const s = m * lambda / (n * a); if (Math.abs(s) <= 1) r.push({ m, theta: Math.asin(s) }); }
  return r;
}

/**
 * Diferencia de caminos ópticos desde dos rendijas (y₁, y₂) hasta el punto Y
 * de una pantalla a distancia L: Δ = n·(r₂ − r₁).
 * @param {{y1: number, y2: number, L: number, Y: number, n?: number}} p
 */
export function diferenciaCaminos({ y1, y2, L, Y, n = 1 }) {
  const r1 = Math.hypot(L, Y - y1), r2 = Math.hypot(L, Y - y2);
  return { r1, r2, delta: n * (r2 - r1) };
}

/**
 * Extremos locales (máximos o mínimos) de una muestra, afinados con una
 * parábola por los tres puntos.
 * @param {ArrayLike<number>} x @param {ArrayLike<number>} v @param {'max'|'min'} tipo
 */
export function extremos(x, v, tipo = 'max') {
  const s = tipo === 'max' ? 1 : -1, r = [];
  for (let i = 1; i < v.length - 1; i++) {
    const a = s * v[i - 1], b = s * v[i], c = s * v[i + 1];
    if (b > a && b >= c) {
      const den = a - 2 * b + c, dlt = den ? 0.5 * (a - c) / den : 0;
      r.push({ x: x[i] + dlt * (x[i + 1] - x[i]), v: s * (b - 0.25 * (a - c) * dlt) });
    }
  }
  return r;
}

// ---------------------------------------------------------------------------
// Películas delgadas, cuña y anillos de Newton
// ---------------------------------------------------------------------------

// Complejos mínimos: [re, im]
/** @typedef {[number, number]} Cx */
/** @param {Cx} a @param {Cx} b @returns {Cx} */
const cMas = (a, b) => [a[0] + b[0], a[1] + b[1]];
/** @param {Cx} a @param {Cx} b @returns {Cx} */
const cMul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
/** @param {Cx} a @param {Cx} b @returns {Cx} */
const cDiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
/** @param {Cx} z @returns {Cx} raíz principal */
const cRaiz = z => { const m = Math.hypot(z[0], z[1]), re = Math.sqrt(Math.max(0, (m + z[0]) / 2)), im = Math.sqrt(Math.max(0, (m - z[0]) / 2)); return [re, z[1] < 0 ? -im : im]; };
/** e^{i·z} @param {Cx} z @returns {Cx} */
const cExpI = z => { const e = Math.exp(-z[1]); return [e * Math.cos(z[0]), e * Math.sin(z[0])]; };
const cAbs2 = z => z[0] * z[0] + z[1] * z[1];

/**
 * Número de reflexiones con cambio de fase de π (contra un índice mayor) en
 * las dos caras de una película n₂ entre n₁ (arriba) y n₃ (abajo).
 * @param {number} n1 @param {number} n2 @param {number} n3
 */
export const cambiosFase = (n1, n2, n3) => (n2 > n1 ? 1 : 0) + (n3 > n2 ? 1 : 0);

/**
 * Reflectancia de una película (suma de Airy de todas las reflexiones):
 * r = (r₁₂ + r₂₃·e^{iδ})/(1 + r₁₂·r₂₃·e^{iδ}), δ = 4π·n₂·d·cos θ₂/λ, con
 * los coeficientes de Fresnel de cada cara (complejos si hay onda
 * evanescente). Luz no polarizada: media de s y p.
 * @param {{n1: number, n2: number, n3: number, d: number, lambda: number, theta1?: number, pol?: 's'|'p'|'media'}} p
 */
export function pelicula({ n1, n2, n3, d, lambda, theta1 = 0, pol = 'media' }) {
  const s1 = n1 * Math.sin(theta1);
  /** @param {number} nj @returns {Cx} n·cos θ en el medio j */
  const nc = nj => { const c = cRaiz([1 - (s1 / nj) ** 2, 0]); return [nj * c[0], nj * c[1]]; };
  const k1 = nc(n1), k2 = nc(n2), k3 = nc(n3);
  /** @param {Cx} a @param {Cx} b @returns {Cx} */
  const rS = (a, b) => cDiv([a[0] - b[0], a[1] - b[1]], cMas(a, b));
  // p: r = (n_b²·k_a − n_a²·k_b)/(n_b²·k_a + n_a²·k_b), con k = n·cos θ
  /** @param {number} na @param {Cx} ka @param {number} nb @param {Cx} kb @returns {Cx} */
  const rP = (na, ka, nb, kb) => { const u = [nb * nb * ka[0], nb * nb * ka[1]], v = [na * na * kb[0], na * na * kb[1]]; return cDiv([u[0] - v[0], u[1] - v[1]], [u[0] + v[0], u[1] + v[1]]); };
  const delta = /** @type {Cx} */ ([4 * Math.PI * d * k2[0] / lambda, 4 * Math.PI * d * k2[1] / lambda]), e = cExpI(delta);
  /** @param {Cx} r12 @param {Cx} r23 */
  const airy = (r12, r23) => { const t = cMul(r23, e); return cAbs2(cDiv(cMas(r12, t), cMas([1, 0], cMul(r12, t)))); };
  const Rs = airy(rS(k1, k2), rS(k2, k3)), Rp = airy(rP(n1, k1, n2, k2), rP(n2, k2, n3, k3));
  const R = pol === 's' ? Rs : pol === 'p' ? Rp : (Rs + Rp) / 2;
  const theta2 = Math.abs(s1 / n2) <= 1 ? Math.asin(s1 / n2) : NaN;
  return { R, T: 1 - R, Rs, Rp, theta2, delta: delta[0], cambios: cambiosFase(n1, n2, n3) };
}

/**
 * Grosores de la película con reflexión máxima (aproximación de dos haces):
 * 2·n₂·d·cos θ₂ = (m + ½)λ con un cambio de fase, = m·λ con cero o dos
 * (m ≥ 0; se omite d = 0).
 * @param {{n1: number, n2: number, n3: number, lambda: number, theta1?: number, cuantos?: number}} p
 */
export function espesoresMaximos({ n1, n2, n3, lambda, theta1 = 0, cuantos = 5 }) {
  const c2 = Math.sqrt(1 - (n1 * Math.sin(theta1) / n2) ** 2), medio = cambiosFase(n1, n2, n3) === 1 ? 0.5 : 0, r = [];
  for (let m = 0; r.length < cuantos; m++) { const d = (m + medio) * lambda / (2 * n2 * c2); if (d > 0) r.push({ m, d }); }
  return r;
}

/**
 * Color reflejado por una película iluminada con luz blanca de espectro
 * plano (sRGB lineal, equilibrado: un espejo perfecto da blanco).
 * @param {{n1: number, n2: number, n3: number, d: number, theta1?: number}} p @param {number[]} [lambdas]
 */
export function colorPelicula(p, lambdas = muestrasVisible(36)) {
  return colorEspectro(lambdas, lambdas.map(l => pelicula({ ...p, lambda: l }).R));
}

/**
 * Cuña de ángulo α y medio n: grosor d(x) = x·tan α; separación entre
 * franjas Δx = λ/(2·n·tan α·cos θ₂).
 * @param {{lambda: number, n?: number, alfa: number, theta2?: number}} p
 */
export const interfranjaCuna = ({ lambda, n = 1, alfa, theta2 = 0 }) => lambda / (2 * n * Math.tan(alfa) * Math.cos(theta2));

/** Hueco entre una lente de radio R apoyada en una placa plana, a la distancia r del centro. @param {number} R @param {number} r */
export const huecoNewton = (R, r) => (r < R ? R - Math.sqrt(R * R - r * r) : NaN);

/**
 * Radio del m-ésimo anillo oscuro de Newton en reflexión (un cambio de fase:
 * 2·n·d = m·λ con d ≈ r²/2R): r_m = √(m·λ·R/n).
 * @param {{m: number, lambda: number, R: number, n?: number}} p
 */
export const radioAnilloOscuro = ({ m, lambda, R, n = 1 }) => Math.sqrt(m * lambda * R / n);

/**
 * Reflectancia de los anillos de Newton a la distancia r del centro (suma
 * de Airy con el hueco exacto).
 * @param {{R: number, lambda: number, nLente?: number, nHueco?: number, nPlaca?: number}} p @param {number} r
 */
export function reflectanciaNewton({ R, lambda, nLente = 1.5, nHueco = 1, nPlaca = 1.5 }, r) {
  return pelicula({ n1: nLente, n2: nHueco, n3: nPlaca, d: huecoNewton(R, r), lambda }).R;
}

// ---------------------------------------------------------------------------
// Interferómetro de Michelson
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Lamina
 * @property {number} n @property {number} espesor  m
 * @property {number} [giro=0]  inclinación respecto al brazo (rad)
 */

/**
 * Camino óptico extra de una lámina de caras paralelas atravesada con
 * incidencia ψ, frente al mismo recorrido en el aire (una pasada):
 * t·(√(n² − sen²ψ) − cos ψ). En θ = 0 y sin giro, (n − 1)·t.
 * @param {Lamina} l @param {number} [psi=0]
 */
export function caminoLamina(l, psi = 0) {
  const s = Math.sin(psi);
  return l.espesor * (Math.sqrt(l.n * l.n - s * s) - Math.cos(psi));
}

/**
 * Diferencia de caminos del Michelson para un rayo a θ del eje: Δ = 2·d·cos θ
 * (+ dos pasadas por la lámina, si la hay). d = L₂ − L₁.
 * @param {{d: number, theta?: number, lamina?: Lamina | null}} p
 */
export function caminoMichelson({ d, theta = 0, lamina = null }) {
  return 2 * d * Math.cos(theta) + (lamina ? 2 * caminoLamina(lamina, (lamina.giro ?? 0) + theta) : 0);
}

/** Intensidad relativa de dos haces iguales con diferencia de caminos Δ: cos²(πΔ/λ). @param {number} delta @param {number} lambda */
export const intensidadDosHaces = (delta, lambda) => Math.cos(Math.PI * delta / lambda) ** 2;

/** Franjas que pasan por el centro al mover un espejo Δd: N = 2·Δd/λ. @param {number} dd @param {number} lambda */
export const franjasMichelson = (dd, lambda) => 2 * dd / lambda;

/**
 * Índice de una lámina a partir de las N franjas contadas al girarla de 0 a
 * φ (solución exacta de N·λ = 2t·[√(n² − sen²φ) − cos φ − (n − 1)]).
 * @param {{N: number, lambda: number, espesor: number, phi: number}} p
 */
export function indiceDesdeGiro({ N, lambda, espesor, phi }) {
  const s = Math.sin(phi), k = N * lambda / (2 * espesor) + Math.cos(phi) - 1;
  return -(s * s + k * k) / (2 * k);
}

/** Índice de una lámina insertada a partir de las N franjas que desplaza: n = 1 + N·λ/(2t). @param {{N: number, lambda: number, espesor: number}} p */
export const indiceDesdeLamina = ({ N, lambda, espesor }) => 1 + N * lambda / (2 * espesor);

/**
 * @typedef {Object} EscenaMichelson
 * @property {number} lambda m
 * @property {number} d0   diferencia inicial de brazos L₂ − L₁ (m)
 * @property {number} [v=0] velocidad del espejo móvil (m/s): d(t) = d0 + v·t
 * @property {Lamina | null} [lamina]
 * @property {number} [omega=0] velocidad angular de la lámina (rad/s): giro(t) = giro0 + ω·t
 * @property {number} [giroMax] giro máximo de la lámina (rad)
 * @property {number} duracion s
 */

/** Estado del Michelson en t: d, giro de la lámina y Δ en el centro. @param {EscenaMichelson} e @param {number} t */
export function michelsonEn(e, t) {
  const d = e.d0 + (e.v ?? 0) * t;
  let lamina = e.lamina ? { ...e.lamina } : null;
  if (lamina) { let g = (lamina.giro ?? 0) + (e.omega ?? 0) * t; if (e.giroMax != null) g = Math.min(g, e.giroMax); lamina.giro = g; }
  const delta = caminoMichelson({ d, lamina });
  return { d, lamina, delta, I: intensidadDosHaces(delta, e.lambda), franjas: (delta - caminoMichelson({ d: e.d0, lamina: e.lamina })) / e.lambda };
}

/**
 * Serie temporal en el centro de la pantalla: t, Δ, I y franjas pasadas
 * (las que cruzan el centro: máximos de I contados uno a uno).
 * @param {EscenaMichelson} e @param {number} [n=4000]
 */
export function serieMichelson(e, n = 4000) {
  if (!(e.lambda > 0) || !(e.duracion > 0)) throw new RangeError('El Michelson necesita λ > 0 y una duración positiva.');
  const t = new Float64Array(n + 1), I = new Float64Array(n + 1), delta = new Float64Array(n + 1), cuenta = new Float64Array(n + 1);
  let c = 0;
  for (let i = 0; i <= n; i++) {
    t[i] = e.duracion * i / n;
    const s = michelsonEn(e, t[i]);
    delta[i] = s.delta; I[i] = s.I;
    if (i >= 2 && I[i - 1] > I[i - 2] && I[i - 1] >= I[i]) c++;
    cuenta[i] = c;
  }
  return { t, I, delta, cuenta };
}

/**
 * Anillos del Michelson vistos a través de una lente de focal f: intensidad
 * a la distancia ρ del centro de la pantalla (θ = atan(ρ/f)).
 * @param {{d: number, lambda: number, lamina?: Lamina | null, f: number}} p @param {number} rho
 */
export function anilloMichelson({ d, lambda, lamina = null, f }, rho) {
  return intensidadDosHaces(caminoMichelson({ d, lamina, theta: Math.atan(rho / f) }), lambda);
}
