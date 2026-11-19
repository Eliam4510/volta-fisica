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

    // Paletas cuyo contenido todavía no se puede colocar: dicen por qué en un
    // aviso sobre el lienzo y no dejan ningún botón pulsado
    document.querySelectorAll('.paleta[data-pendiente]').forEach(p => p.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b || !p.contains(b)) return;
      setTimeout(() => b.setAttribute('aria-pressed', 'false'), 0);
      avisoPendiente(p.dataset.pendiente);
    }));
    if (new URLSearchParams(location.search).has('captura')) document.body.classList.add('captura');
    iniciarAyudas();
    iniciarNavegacion();
  }

  let relojPendiente = null;
  function avisoPendiente(texto) {
    const area = document.querySelector('.lienzo-area') || document.body;
    let el = document.getElementById('aviso-pendiente');
    if (!el) { el = document.createElement('div'); el.id = 'aviso-pendiente'; el.className = 'aviso-flotante aviso-lienzo'; el.appendChild(document.createElement('span')); area.appendChild(el); }
    el.firstChild.textContent = texto; el.hidden = false;
    clearTimeout(relojPendiente); relojPendiente = setTimeout(() => { el.hidden = true; }, 5000);
  }

  // Navegación: las migas «Módulo / Espacio de trabajo» abren menús para ir a
  // otro módulo o a otro espacio del mismo módulo. Un módulo nuevo se añade
  // aquí con sus espacios (la primera página es la que abre el módulo).
  const MODULOS = [
    { nombre: 'Mecánica', icono: 'm-mecanica', espacios: [['mecanica.html', 'Cinemática y proyectiles', 'o-lanzador'], ['mecanica-laboratorio.html', 'Laboratorio', 'i-escena']] },
    { nombre: 'Gravitación', icono: 'm-gravitacion', espacios: [['gravitacion.html', 'Órbitas', 'o-satelite']] },
    { nombre: 'Termodinámica', icono: 'm-termodinamica', espacios: [['termodinamica.html', 'Laboratorio de gases', 'o-cilindro'], ['termodinamica-ciclos.html', 'Ciclos y diagrama P-V', 'o-embolo'], ['termodinamica-molecular.html', 'Gas molecular', 'o-caja-molecular'], ['termodinamica-calor.html', 'Calor y calorimetría', 'o-calorimetro']] },
    { nombre: 'Electrostática', icono: 'm-electrostatica', espacios: [['electrostatica.html', 'Cargas y campos', 'o-carga-positiva'], ['electrostatica-conductores.html', 'Conductores y dieléctricos', 'o-capacitor-placas']] },
    { nombre: 'Circuitos', icono: 'm-circuitos', espacios: [['circuitos.html', 'Transitorios', 'o-capacitor']] },
    { nombre: 'Magnetismo e inducción', icono: 'm-magnetismo', espacios: [['magnetismo.html', 'Campos magnéticos', 'o-hilo-corriente'], ['magnetismo-particulas.html', 'Partículas en E y B', 'o-particula-cargada'], ['magnetismo-induccion.html', 'Inducción', 'o-barra-conductora']] },
    { nombre: 'Ondas y sonido', icono: 'm-ondas', espacios: [['ondas.html', 'Medio 1D', 'o-cuerda'], ['ondas-doppler.html', 'Doppler y acústica', 'o-fuente-sonora']] },
    { nombre: 'Óptica', icono: 'm-optica', espacios: [['optica.html', 'Óptica geométrica', 'o-lente-ideal'], ['optica-ondas.html', 'Interferencia y difracción', 'o-rendija-doble'], ['optica-peliculas.html', 'Películas e interferómetros', 'o-michelson']] },
    { nombre: 'Física moderna', icono: 'm-moderna', espacios: [['moderna.html', 'Efecto fotoeléctrico', 'o-placa-metal'], ['moderna-nucleo.html', 'Núcleo', 'o-nucleo']] },
  ];
  function iniciarNavegacion() {
    const migas = document.querySelector('.migas');
    const botones = migas ? migas.querySelectorAll(':scope > button') : [];
    if (botones.length < 2) return;
    const pagina = location.pathname.split('/').pop() || '';
    const actual = MODULOS.find(m => m.espacios.some(([h]) => h === pagina));
    if (!actual) return;
    const menu = document.createElement('div');
    menu.className = 'menu'; menu.id = 'menu-navegacion'; menu.setAttribute('role', 'menu'); menu.hidden = true;
    document.body.appendChild(menu);
    const ico = id => `<svg class="ico"><use href="#${id}"/></svg>`;
    const item = (href, icono, texto, esActual) => `<a class="menu-item" role="menuitem" href="${href}"${esActual ? ' aria-current="true"' : ''}>${ico(icono)}${texto}${esActual ? '<span class="atajo">actual</span>' : ''}</a>`;
    let abiertoDesde = null;
    const abrir = (boton, html) => {
      if (abiertoDesde === boton && !menu.hidden) { menu.hidden = true; abiertoDesde = null; return; }
      const r = boton.getBoundingClientRect();
      menu.innerHTML = html; menu.style.left = r.left + 'px'; menu.style.top = (r.bottom + 4) + 'px';
      menu.hidden = false; abiertoDesde = boton;
    };
    const bModulo = botones[0], bEspacio = botones[botones.length - 1];
    bModulo.setAttribute('aria-haspopup', 'menu'); bEspacio.setAttribute('aria-haspopup', 'menu');
    bModulo.addEventListener('click', ev => {
      ev.stopPropagation();
      abrir(bModulo, '<div class="menu-titulo">Módulos</div>' +
        MODULOS.map(m => item(m.espacios[0][0], m.icono, m.nombre, m === actual)).join('') +
        '<div class="menu-sep"></div>' + item('inicio.html', 'i-inicio', 'Inicio', false));
    });
    bEspacio.addEventListener('click', ev => {
      ev.stopPropagation();
      abrir(bEspacio, `<div class="menu-titulo">Espacios de trabajo de ${actual.nombre}</div>` +
        actual.espacios.map(([h, t, i]) => item(h, i, t, h === pagina)).join(''));
    });
    document.addEventListener('pointerdown', ev => { if (!ev.target.closest('#menu-navegacion, .migas')) { menu.hidden = true; abiertoDesde = null; } });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { menu.hidden = true; abiertoDesde = null; } });
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
