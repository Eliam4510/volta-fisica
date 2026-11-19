/* ==========================================================================
   Volta — comportamiento común de la interfaz
   Tema claro/oscuro, pestañas, botones conmutables, controles segmentados,
   deslizadores con relleno y atajos básicos. Lo usan todos los prototipos.
   ========================================================================== */
(function (global) {
  'use strict';
  const raiz = document.documentElement;
  const oyentesTema = [];

  function leerTema() { try { return localStorage.getItem('volta.tema'); } catch { return null; } }
  function guardarTema(t) { try { localStorage.setItem('volta.tema', t); } catch { /* sin almacenamiento */ } }

  // Tema: el parámetro ?tema= manda (capturas); si no, lo guardado; si no, claro.
  const param = new URLSearchParams(location.search).get('tema');
  raiz.dataset.tema = param || leerTema() || 'claro';

  function ponerTema(t) {
    raiz.dataset.tema = t; guardarTema(t);
    document.querySelectorAll('[data-accion="tema"]').forEach(b => b.setAttribute('aria-label', t === 'oscuro' ? 'Tema claro' : 'Tema oscuro'));
    oyentesTema.forEach(f => f(t));
  }
  function alCambiarTema(f) { oyentesTema.push(f); }

  // Deslizador: pinta el tramo recorrido con --p
  function pintarDeslizador(d) {
    const p = (d.value - d.min) / (d.max - d.min) * 100;
    d.style.setProperty('--p', p + '%');
  }

  function iniciar() {
    document.querySelectorAll('[data-accion="tema"]').forEach(b => b.addEventListener('click', () => ponerTema(raiz.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')));

    // Pestañas: [role=tablist] > [role=tab]
    document.querySelectorAll('[role="tablist"]').forEach(lista => {
      lista.addEventListener('click', ev => {
        const tab = ev.target.closest('[role="tab"]'); if (!tab) return;
        lista.querySelectorAll('[role="tab"]').forEach(x => x.setAttribute('aria-selected', String(x === tab)));
        const panel = tab.getAttribute('aria-controls');
        if (panel) document.querySelectorAll(`[data-grupo="${lista.id}"]`).forEach(p => { p.hidden = p.id !== panel; });
      });
    });

    // Botones conmutables
    document.querySelectorAll('[data-conmuta]').forEach(b => b.addEventListener('click', () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'))));

    // Grupos exclusivos (paleta, segmentados): [data-exclusivo] > button
    document.querySelectorAll('[data-exclusivo]').forEach(g => g.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b || !g.contains(b)) return;
      g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    }));

    document.querySelectorAll('input.deslizador').forEach(d => { pintarDeslizador(d); d.addEventListener('input', () => pintarDeslizador(d)); });

    if (new URLSearchParams(location.search).has('captura')) document.body.classList.add('captura');
    iniciarAyudas();
  }

  // Ayudas emergentes: data-ayuda="Texto|Término en inglés|Atajo"
  function iniciarAyudas() {
    const burbuja = document.createElement('div');
    burbuja.className = 'ayuda'; burbuja.hidden = true;
    burbuja.style.cssText = 'position:fixed;z-index:100;pointer-events:none';
    document.body.appendChild(burbuja);
    let reloj = null;
    document.addEventListener('pointerover', ev => {
      const el = ev.target.closest('[data-ayuda]');
      clearTimeout(reloj); burbuja.hidden = true;
      if (!el) return;
      reloj = setTimeout(() => {
        const [txt, en, atajo] = el.dataset.ayuda.split('|');
        burbuja.innerHTML = `<span>${txt}${atajo ? ` <kbd>${atajo}</kbd>` : ''}</span>${en ? `<span class="en">${en}</span>` : ''}`;
        burbuja.hidden = false;
        const r = el.getBoundingClientRect(), b = burbuja.getBoundingClientRect();
        let x = r.left + r.width / 2 - b.width / 2; x = Math.max(8, Math.min(innerWidth - b.width - 8, x));
        let y = r.bottom + 8; if (y + b.height > innerHeight - 8) y = r.top - b.height - 8;
        burbuja.style.left = x + 'px'; burbuja.style.top = y + 'px';
      }, 450);
    });
    document.addEventListener('pointerdown', () => { clearTimeout(reloj); burbuja.hidden = true; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  global.Volta = Object.assign(global.Volta || {}, { ponerTema, alCambiarTema, pintarDeslizador });
})(window);
