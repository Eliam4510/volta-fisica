/* ==========================================================================
   Volta — núcleo: archivos de escena (.volta)
   Formato JSON con cabecera fija. Puro: sin DOM. Las pantallas deciden qué
   guardan en `datos`; aquí solo se valida la envoltura.
   ========================================================================== */

export const FORMATO = 'volta-escena';
export const VERSION_ESCENA = 1;
export const EXTENSION = '.volta';

/**
 * @typedef {Object} Escena
 * @property {string} formato   Siempre "volta-escena"
 * @property {number} version   Versión del formato
 * @property {string} modulo    "mecanica", "electrostatica", …
 * @property {string} espacio   Espacio de trabajo dentro del módulo
 * @property {string} titulo
 * @property {Object} datos     Contenido propio del módulo
 */

/**
 * @param {{modulo: string, espacio: string, titulo: string, datos: Object}} p
 * @returns {Escena}
 */
export function crearEscena({ modulo, espacio, titulo, datos }) {
  return { formato: FORMATO, version: VERSION_ESCENA, modulo, espacio, titulo, datos };
}

/** @param {Escena} escena */
export function serializar(escena) {
  return JSON.stringify(escena, null, 2) + '\n';
}

/**
 * Lee y valida un archivo de escena. Lanza un Error con un mensaje que dice
 * qué pasó y cómo arreglarlo.
 * @param {string} texto
 * @param {{modulo?: string}} [esperado]
 * @returns {Escena}
 */
export function leerEscena(texto, esperado = {}) {
  let obj;
  try { obj = JSON.parse(texto.replace(/^﻿/, '')); }
  catch { throw new Error('El archivo no es una escena de Volta: no tiene formato JSON válido.'); }
  if (!obj || typeof obj !== 'object' || obj.formato !== FORMATO) {
    throw new Error('El archivo no es una escena de Volta: le falta la cabecera "volta-escena".');
  }
  if (!Number.isInteger(obj.version) || obj.version < 1) {
    throw new Error('La escena no indica una versión de formato válida.');
  }
  if (obj.version > VERSION_ESCENA) {
    throw new Error(`La escena se guardó con una versión más nueva de Volta (formato ${obj.version}). Actualiza Volta para abrirla.`);
  }
  if (typeof obj.modulo !== 'string' || typeof obj.datos !== 'object' || obj.datos === null) {
    throw new Error('La escena está incompleta: le faltan el módulo o los datos.');
  }
  if (esperado.modulo && obj.modulo !== esperado.modulo) {
    throw new Error(`Esta escena es del módulo «${obj.modulo}»; ábrela desde ese módulo.`);
  }
  return obj;
}

/**
 * Toma un número de los datos de una escena, acotado a [min, max]. Si falta o
 * no es finito, devuelve el valor por defecto.
 * @param {unknown} v @param {number} defecto @param {number} [min] @param {number} [max]
 */
export function numero(v, defecto, min = -Infinity, max = Infinity) {
  const x = typeof v === 'number' && Number.isFinite(v) ? v : defecto;
  return Math.min(max, Math.max(min, x));
}
