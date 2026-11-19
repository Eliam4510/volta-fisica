/* ==========================================================================
   Volta — núcleo: historial para deshacer y rehacer
   Guarda instantáneas (objetos JSON) del estado editable de una escena.
   Puro: sin DOM.
   ========================================================================== */

export class Historial {
  /**
   * @param {unknown} inicial Estado de partida
   * @param {number} [limite=200] Máximo de pasos que se pueden deshacer
   */
  constructor(inicial, limite = 200) {
    /** @type {string[]} */ this.pila = [JSON.stringify(inicial)];
    this.pos = 0;
    this.limite = limite;
  }

  /**
   * Registra un estado nuevo. Si es igual al actual no hace nada. Descarta
   * lo que se había deshecho (se abre una rama nueva).
   * @param {unknown} estado
   * @returns {boolean} si se registró
   */
  registrar(estado) {
    const s = JSON.stringify(estado);
    if (s === this.pila[this.pos]) return false;
    this.pila.splice(this.pos + 1);
    this.pila.push(s);
    if (this.pila.length > this.limite + 1) this.pila.shift();
    this.pos = this.pila.length - 1;
    return true;
  }

  get puedeDeshacer() { return this.pos > 0; }
  get puedeRehacer() { return this.pos < this.pila.length - 1; }

  /** @returns {any} el estado anterior, o null si no hay */
  deshacer() {
    if (!this.puedeDeshacer) return null;
    this.pos -= 1;
    return JSON.parse(this.pila[this.pos]);
  }

  /** @returns {any} el estado siguiente, o null si no hay */
  rehacer() {
    if (!this.puedeRehacer) return null;
    this.pos += 1;
    return JSON.parse(this.pila[this.pos]);
  }

  /** Estado actual (copia). */
  actual() { return JSON.parse(this.pila[this.pos]); }

  /** Vacía el historial y parte de un estado nuevo (al abrir otra escena). */
  reiniciar(estado) { this.pila = [JSON.stringify(estado)]; this.pos = 0; }
}
