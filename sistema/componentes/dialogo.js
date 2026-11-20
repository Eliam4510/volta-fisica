/* ==========================================================================
   Volta — diálogo modal de la aplicación
   Preguntas con dos o tres botones («Guardar», «No guardar», «Cancelar»),
   con el lenguaje de diseño y sin depender del navegador (no usa confirm()).
   Escape cancela; Intro elige el botón principal.
   ========================================================================== */

/**
 * @typedef {Object} BotonDialogo
 * @property {string} id
 * @property {string} texto
 * @property {boolean} [principal]
 */

/**
 * Muestra un diálogo y resuelve con el id del botón elegido (o 'cancelar'
 * si se cierra con Escape).
 * @param {{titulo: string, texto?: string, detalle?: string[], botones: BotonDialogo[]}} o
 * @returns {Promise<string>}
 */
export function preguntar(o) {
  return new Promise(resolver => {
    const fondo = document.createElement('div');
    fondo.className = 'dialogo-fondo';
    const caja = document.createElement('div');
    caja.className = 'dialogo'; caja.setAttribute('role', 'alertdialog'); caja.setAttribute('aria-modal', 'true');
    const h = document.createElement('h2'); h.textContent = o.titulo; h.id = 'dialogo-titulo';
    caja.setAttribute('aria-labelledby', h.id);
    caja.appendChild(h);
    if (o.texto) { const p = document.createElement('p'); p.textContent = o.texto; caja.appendChild(p); }
    if (o.detalle && o.detalle.length) {
      const ul = document.createElement('ul');
      for (const d of o.detalle) { const li = document.createElement('li'); li.textContent = d; ul.appendChild(li); }
      caja.appendChild(ul);
    }
    const acciones = document.createElement('div');
    acciones.className = 'dialogo-acciones';
    for (const b of o.botones) {
      const el = document.createElement('button');
      el.className = 'btn' + (b.principal ? ' btn-primario' : ' btn-secundario');
      el.textContent = b.texto; el.dataset.id = b.id;
      acciones.appendChild(el);
    }
    caja.appendChild(acciones);
    fondo.appendChild(caja);
    document.body.appendChild(fondo);
    const anterior = /** @type {HTMLElement | null} */ (document.activeElement);
    const terminar = (/** @type {string} */ id) => {
      document.removeEventListener('keydown', teclas, true);
      fondo.remove();
      anterior?.focus?.();
      resolver(id);
    };
    const teclas = (/** @type {KeyboardEvent} */ ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); terminar('cancelar'); }
      else if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); terminar((o.botones.find(b => b.principal) || o.botones[0]).id); }
      else if (ev.key === 'Tab') {
        // El foco no sale del diálogo
        const bs = [...acciones.querySelectorAll('button')], i = bs.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
        ev.preventDefault();
        bs[(i + (ev.shiftKey ? -1 : 1) + bs.length) % bs.length].focus();
      } else ev.stopPropagation();
    };
    document.addEventListener('keydown', teclas, true);
    acciones.addEventListener('click', ev => {
      const b = /** @type {HTMLElement} */ (ev.target).closest('button');
      if (b) terminar(/** @type {string} */ (b.dataset.id));
    });
    /** @type {HTMLButtonElement | null} */ (acciones.querySelector('.btn-primario') || acciones.querySelector('button'))?.focus();
  });
}
