/* ==========================================================================
   Volta — núcleo: datos tabulares a CSV
   Puro: sin DOM. RFC 4180: separador coma, punto decimal, fin de línea CRLF,
   comillas dobles cuando hace falta. Con coma decimal (Ajustes), como lo lee
   Excel en español de España: punto y coma entre columnas y coma decimal.
   Los números se escriben con toda su precisión (no con el formato de
   pantalla) para que sirvan para análisis.
   ========================================================================== */
import { decimalComa } from './numeros.js';

/** Marca de orden de bytes UTF-8: Excel la usa para leer bien los acentos. */
export const BOM = '﻿';

/**
 * Escapa un valor para CSV.
 * @param {unknown} v
 * @returns {string}
 */
export function celda(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? (decimalComa() ? String(v).replace('.', ',') : String(v)) : '';
  const s = String(v);
  return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Convierte columnas y filas en texto CSV.
 * @param {string[]} columnas Encabezados, con la unidad entre paréntesis: "x (m)"
 * @param {Array<Array<unknown>>} filas
 * @param {{bom?: boolean}} [o]
 * @returns {string}
 */
export function aCSV(columnas, filas, o = {}) {
  const sep = decimalComa() ? ';' : ',';
  const lineas = [columnas.map(celda).join(sep)];
  for (const f of filas) lineas.push(f.map(celda).join(sep));
  return (o.bom === false ? '' : BOM) + lineas.join('\r\n') + '\r\n';
}

/**
 * Muestrea una función del tiempo en [t0, t1] con paso dt (incluye t1).
 * @param {number} t0 @param {number} t1 @param {number} dt
 * @param {(t: number) => Array<unknown>} fila
 */
export function muestrear(t0, t1, dt, fila) {
  const n = Math.max(1, Math.round((t1 - t0) / dt));
  const filas = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + (t1 - t0) * i / n;
    filas.push(fila(t));
  }
  return filas;
}
