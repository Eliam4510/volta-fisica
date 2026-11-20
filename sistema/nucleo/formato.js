/* ==========================================================================
   Volta — núcleo: escritura de cantidades (ISO 80000)
   Puro: sin DOM. Lo usan el lienzo, las gráficas, los paneles y las pruebas.
   ========================================================================== */

import { decimalComa } from './numeros.js';

/** Espacio fino que no se corta (U+202F), entre número y unidad. */
export const ESP = ' ';

const SUPERINDICES = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/**
 * Número con `cifras` cifras significativas, signo menos verdadero (−) y
 * notación científica con potencia volada fuera de [1e-3, 1e5).
 * @param {number} v
 * @param {number} [cifras=4]
 * @returns {string}
 */
export function fmt(v, cifras = 4) {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) < 1e-12) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) {
    let e = Math.floor(Math.log10(a));
    let m = v / Math.pow(10, e);
    // El redondeo puede llevar la mantisa a 10.0: se renormaliza
    if (Math.abs(Number(m.toFixed(Math.max(0, cifras - 1)))) >= 10) { e += 1; m /= 10; }
    const sup = String(e).replace('-', '⁻').replace(/\d/g, d => SUPERINDICES[Number(d)]);
    return conSeparador(`${m.toFixed(Math.max(0, cifras - 1)).replace('-', '−')} × 10${sup}`);
  }
  const orden = Math.floor(Math.log10(a));
  const dec = Math.max(0, cifras - 1 - orden);
  let s = v.toFixed(Math.min(dec, 6));
  // El redondeo puede subir de orden (0.99999 → 1.0000, 9.99999 → 10.00):
  // entonces sobra un decimal para conservar las cifras significativas.
  if (Math.abs(Number(s)) >= Math.pow(10, orden + 1)) {
    if (Math.abs(Number(s)) >= 1e5) return fmt(Math.sign(v) * 1e5, cifras);
    s = v.toFixed(Math.min(Math.max(0, dec - 1), 6));
  }
  return conSeparador(s.replace('-', '−'));
}

/** Cambia el punto decimal por coma si es la preferencia (Ajustes). @param {string} s */
function conSeparador(s) { return decimalComa() ? s.replace('.', ',') : s; }

/**
 * Cantidad con unidad separada por espacio fino: "4.000 m/s".
 * @param {number} v @param {string} [unidad] @param {number} [cifras]
 */
export function cantidad(v, unidad, cifras) {
  return unidad ? fmt(v, cifras) + ESP + unidad : fmt(v, cifras);
}

const PREFIJOS = /** @type {Array<[number, string]>} */ ([
  [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'],
]);

/**
 * Cantidad con prefijo SI: 12 710 V → "12.71 kV"; 6.355e-3 N → "6.355 mN".
 * @param {number} v @param {string} unidad @param {number} [cifras=4]
 */
export function conPrefijo(v, unidad, cifras = 4) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a === 0) return cantidad(0, unidad);
  const [f, p] = PREFIJOS.find(([f]) => a >= f * 0.99995) || PREFIJOS[PREFIJOS.length - 1];
  return cantidad(v / f, p + unidad, cifras);
}

/**
 * Paso "agradable" 1-2-5 mayor o igual que `bruto` (cuadrículas, ejes).
 * @param {number} bruto
 */
export function pasoAgradable(bruto) {
  const e = Math.pow(10, Math.floor(Math.log10(bruto)));
  const m = bruto / e;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e;
}

/**
 * Número de una marca de eje: los decimales que pide el paso, sin ceros
 * finales (0, 0.5, 1, 1.5).
 * @param {number} v @param {number} paso
 */
export function fmtMarca(v, paso) {
  const dec = Math.max(0, Math.ceil(-Math.log10(paso) - 1e-9));
  let s = (Math.abs(v) < paso * 1e-6 ? 0 : v).toFixed(Math.min(dec + (String(paso).includes('25') ? 1 : 0), 6));
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return conSeparador(s.replace('-', '−'));
}

/**
 * Valor de una variable con los decimales de su paso de ajuste (35, 3.00, 0.50).
 * @param {number} valor @param {number} paso
 */
export function fmtPaso(valor, paso) {
  const dec = !(paso > 0) || paso >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(paso) - 1e-9));
  return conSeparador(valor.toFixed(dec).replace('-', '−'));
}
