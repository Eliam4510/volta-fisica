/* ==========================================================================
   Volta — núcleo: preferencia de separador decimal
   Punto (1.5, como en México y en inglés) o coma (1,5, como en España). La
   guardan los Ajustes; la leen el formato de las cantidades, la lectura de
   los campos y el CSV. Sin almacenamiento (pruebas, Node) vale el punto.
   ========================================================================== */

/** @type {boolean | null} */
let coma = null;

/** ¿Se escribe y se lee la coma como separador decimal? */
export function decimalComa() {
  if (coma === null) {
    try { coma = typeof localStorage !== 'undefined' && localStorage.getItem('volta.decimal') === 'coma'; }
    catch { coma = false; }
  }
  return coma;
}

/** Fija el separador (Ajustes y pruebas); `null` vuelve a leer la preferencia. @param {boolean | null} v */
export function ponerDecimalComa(v) { coma = v === null ? null : !!v; }
