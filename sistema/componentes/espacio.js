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
  const oscuroDelSistema = () => !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
  /** Tema elegido: 'claro', 'oscuro' o 'sistema' (por omisión, el de Windows). */
  const preferenciaTema = () => { const t = leerTema(); return t === 'claro' || t === 'oscuro' ? t : 'sistema'; };
  const temaEfectivo = () => { const p = preferenciaTema(); return p === 'sistema' ? (oscuroDelSistema() ? 'oscuro' : 'claro') : p; };
  const tauri = () => global.__TAURI__ || null;

  // Tema: el parámetro ?tema= manda (capturas); si no, la preferencia.
  const param = new URLSearchParams(location.search).get('tema');
  raiz.dataset.tema = param || temaEfectivo();
  /** La barra de título de Windows sigue al tema de la aplicación. */
  function temaVentana(t) { try { tauri()?.window?.getCurrentWindow?.().setTheme?.(t === 'oscuro' ? 'dark' : 'light'); } catch { /* fuera de la aplicación */ } }
  temaVentana(raiz.dataset.tema);

  function aplicarTema(t) {
    raiz.dataset.tema = t; temaVentana(t);
    document.querySelectorAll('[data-accion="tema"]').forEach(b => b.setAttribute('aria-label', t === 'oscuro' ? 'Tema claro' : 'Tema oscuro'));
    oyentesTema.forEach(f => f(t));
  }
  /** Tema explícito (el botón de la barra) o preferencia ('sistema' sigue a Windows). */
  function ponerTema(t) { guardarTema(t); aplicarTema(t === 'sistema' ? temaEfectivo() : t); }
  if (global.matchMedia) global.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (!param && preferenciaTema() === 'sistema') aplicarTema(temaEfectivo()); });

  // Tamaño de la interfaz (preferencia): zoom de la vista de la aplicación
  const ZOOMS = [0.9, 1, 1.1, 1.25, 1.5];
  function leerZoom() { try { const z = parseFloat(localStorage.getItem('volta.zoom') || '1'); return ZOOMS.includes(z) ? z : 1; } catch { return 1; } }
  function ponerZoom(z) {
    if (!ZOOMS.includes(z)) return false;
    try { localStorage.setItem('volta.zoom', String(z)); } catch { /* sin almacenamiento */ }
    const w = tauri()?.webview?.getCurrentWebview?.();
    if (!w?.setZoom) return false;
    w.setZoom(z).catch(() => {});
    return true;
  }
  { const z = leerZoom(); if (z !== 1) ponerZoom(z); }
  function alCambiarTema(f) { oyentesTema.push(f); }

  // Deslizador: pinta el tramo recorrido con --p
  function pintarDeslizador(d) {
    const p = (d.value - d.min) / (d.max - d.min) * 100;
    d.style.setProperty('--p', p + '%');
  }

  function iniciar() {
    document.querySelectorAll('[data-accion="tema"]').forEach(b => b.addEventListener('click', () => ponerTema(raiz.dataset.tema === 'oscuro' ? 'claro' : 'oscuro')));
    iniciarAplicacion();

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
    iniciarTeclado();
  }

  /**
   * Que no se comporte como un navegador: sin menú contextual de Edge fuera
   * de los campos de texto, sin recargar (F5, Ctrl R) ni imprimir la página
   * (Ctrl P), sin ir atrás con Alt+← ni con los botones del ratón, sin
   * seleccionar el texto de la interfaz y sin Ctrl+rueda (el tamaño se
   * cambia en Ajustes).
   */
  function iniciarAplicacion() {
    if (new URLSearchParams(location.search).has('captura')) return;
    document.documentElement.classList.add('app');
    document.addEventListener('contextmenu', ev => {
      if (ev.defaultPrevented) return;
      if (!ev.target.closest('input, textarea, [contenteditable="true"]')) ev.preventDefault();
    });
    document.addEventListener('keydown', ev => {
      const k = ev.key.toLowerCase();
      if (ev.key === 'F5' || ((ev.ctrlKey || ev.metaKey) && (k === 'r' || k === 'p')) || (ev.altKey && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) || ev.key === 'BrowserBack') ev.preventDefault();
    }, true);
    global.addEventListener('wheel', ev => { if (ev.ctrlKey) ev.preventDefault(); }, { passive: false });
    global.addEventListener('mouseup', ev => { if (ev.button === 3 || ev.button === 4) ev.preventDefault(); });
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
    { nombre: 'Gravitación', icono: 'm-gravitacion', espacios: [['gravitacion.html', 'Órbitas', 'o-satelite'], ['gravitacion-sistema-solar.html', 'Sistema solar', 'o-planeta'], ['gravitacion-maniobras.html', 'Maniobras', 'o-nave']] },
    { nombre: 'Termodinámica', icono: 'm-termodinamica', espacios: [['termodinamica.html', 'Laboratorio de gases', 'o-cilindro'], ['termodinamica-ciclos.html', 'Ciclos y diagrama P-V', 'o-embolo'], ['termodinamica-molecular.html', 'Gas molecular', 'o-caja-molecular'], ['termodinamica-calor.html', 'Calor y calorimetría', 'o-calorimetro']] },
    { nombre: 'Electrostática', icono: 'm-electrostatica', espacios: [['electrostatica.html', 'Cargas y campos', 'o-carga-positiva'], ['electrostatica-conductores.html', 'Conductores y dieléctricos', 'o-capacitor-placas']] },
    { nombre: 'Circuitos', icono: 'm-circuitos', espacios: [['circuitos.html', 'Transitorios', 'o-capacitor']] },
    { nombre: 'Magnetismo e inducción', icono: 'm-magnetismo', espacios: [['magnetismo.html', 'Campos magnéticos', 'o-hilo-corriente'], ['magnetismo-particulas.html', 'Partículas en E y B', 'o-particula-cargada'], ['magnetismo-induccion.html', 'Inducción', 'o-barra-conductora']] },
    { nombre: 'Ondas y sonido', icono: 'm-ondas', espacios: [['ondas.html', 'Medio 1D', 'o-cuerda'], ['ondas-doppler.html', 'Doppler y acústica', 'o-fuente-sonora'], ['ondas-cubeta.html', 'Cubeta de ondas', 'o-fuente-puntual']] },
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

  /**
   * Teclado de símbolos para los campos de valor (preferencia en
   * Configuración): al escribir en un campo con unidad aparece debajo una
   * fila con lo que no está en el teclado (×10ⁿ, potencias, √, π) y las
   * unidades de la misma magnitud. Los botones no le quitan el foco al campo.
   */
  const UNIDADES_DE = {
    masa: ['mg', 'g', 'kg'], longitud: ['mm', 'cm', 'm', 'km'], tiempo: ['ms', 's', 'min', 'h'],
    velocidad: ['cm/s', 'm/s', 'km/h', 'km/s'], aceleracion: ['m/s²'], fuerza: ['mN', 'N', 'kN'],
    energia: ['J', 'kJ', 'eV'], potencia: ['W', 'kW'], presion: ['Pa', 'kPa', 'bar', 'atm'], frecuencia: ['Hz', 'kHz', 'MHz'],
    carga: ['nC', 'µC', 'C'], potencial: ['mV', 'V', 'kV'], capacitancia: ['pF', 'nF', 'µF', 'F'], resistencia: ['Ω', 'kΩ', 'MΩ'],
    inductancia: ['mH', 'H'], campoMagnetico: ['µT', 'mT', 'T'], corriente: ['mA', 'A'], temperatura: ['K'], angulo: ['°', 'rad'],
  };
  const SIMBOLOS = [['×10ⁿ', '×10^', 'Potencia de diez: 2×10^30 (también 2e30)'], ['^', '^', 'Elevado a: m^2, 10^-3'], ['²', '²', 'Al cuadrado'], ['³', '³', 'Al cubo'],
    ['√', 'sqrt(', 'Raíz cuadrada: sqrt(2*9.8*5)'], ['π', 'π', 'Pi'], ['·', '·', 'Por'], ['/', '/', 'Entre'], ['(', '(', 'Abre paréntesis'], [')', ')', 'Cierra paréntesis'], ['−', '-', 'Menos']];
  function tecladoActivo() { try { return localStorage.getItem('volta.teclado') !== 'no'; } catch { return true; } }
  function iniciarTeclado() {
    const barra = document.createElement('div');
    barra.className = 'teclado'; barra.hidden = true; barra.setAttribute('role', 'toolbar'); barra.setAttribute('aria-label', 'Símbolos y unidades');
    document.body.appendChild(barra);
    let campo = null;
    const esCampo = el => el && el.matches && el.matches('.campo:not(.texto) input:not([type="checkbox"]):not([type="range"]):not([type="color"]):not([readonly])');
    const insertar = txt => {
      if (!campo) return;
      const a = campo.selectionStart ?? campo.value.length, b = campo.selectionEnd ?? a;
      campo.setRangeText(txt, a, b, 'end');
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const ponerUnidad = u => {
      if (!campo) return;
      // Cambia la unidad escrita al final (si la hay) o la añade
      const v = campo.value.replace(/\s+$/, '');
      const m = v.match(/^(.*?[\d)²³])\s*([A-Za-zµΩ°%][A-Za-zµΩ°%/²³·]*)?$/);
      campo.value = m ? `${m[1]} ${u}` : `${v}${v ? ' ' : ''}${u}`;
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const mostrar = el => {
      campo = el;
      const dim = el.dataset.dim && !el.dataset.dim.includes(',') ? el.dataset.dim : null;
      const unidades = (dim && UNIDADES_DE[dim]) || (el.dataset.u && ['°', 'rad'].includes(el.dataset.u) ? UNIDADES_DE.angulo : []);
      barra.innerHTML = SIMBOLOS.map(([t, ins, ayuda], k) => `<button type="button" class="tecla" data-k="${k}" title="${ayuda}">${t}</button>`).join('') +
        (unidades.length ? '<span class="tecla-sep"></span>' + unidades.map(u => `<button type="button" class="tecla unidad" data-u="${u}" title="Escribir en ${u}">${u}</button>`).join('') : '') +
        '<span class="tecla-nota">2e30 · 2×10^30 · 9.8 m/s² · sqrt(2*9.8*5) — Intro aplica</span>';
      barra.hidden = false;
      const r = (el.closest('.campo') || el).getBoundingClientRect();
      const ancho = barra.getBoundingClientRect().width;
      let x = Math.max(8, Math.min(innerWidth - ancho - 8, r.right - ancho));
      let y = r.bottom + 4; if (y + 40 > innerHeight) y = r.top - 40;
      barra.style.left = x + 'px'; barra.style.top = y + 'px';
    };
    // Los botones no le quitan el foco al campo
    barra.addEventListener('pointerdown', ev => ev.preventDefault());
    barra.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b || !campo) return;
      if (b.dataset.u) ponerUnidad(b.dataset.u); else insertar(SIMBOLOS[+b.dataset.k][1]);
      campo.focus();
    });
    document.addEventListener('focusin', ev => { if (tecladoActivo() && esCampo(ev.target)) mostrar(ev.target); else if (!barra.contains(ev.target)) { barra.hidden = true; campo = null; } });
    document.addEventListener('focusout', ev => { if (ev.target === campo) setTimeout(() => { if (document.activeElement !== campo) { barra.hidden = true; campo = null; } }, 0); });
    global.addEventListener('resize', () => { barra.hidden = true; });
    document.addEventListener('scroll', () => { if (campo) mostrar(campo); }, true);
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
    // Con el teclado (Tab), la ayuda sale al llegar al control
    document.addEventListener('focusin', ev => {
      const el = ev.target.closest && ev.target.closest('[data-ayuda]');
      clearTimeout(reloj); burbuja.hidden = true;
      if (!el || !el.matches(':focus-visible')) return;
      const [txt, en, atajo] = el.dataset.ayuda.split('|');
      burbuja.innerHTML = `<span>${txt}${atajo ? ` <kbd>${atajo}</kbd>` : ''}</span>${en ? `<span class="en">${en}</span>` : ''}`;
      burbuja.hidden = false;
      const r = el.getBoundingClientRect(), b = burbuja.getBoundingClientRect();
      let x = r.left + r.width / 2 - b.width / 2; x = Math.max(8, Math.min(innerWidth - b.width - 8, x));
      let y = r.bottom + 8; if (y + b.height > innerHeight - 8) y = r.top - b.height - 8;
      burbuja.style.left = x + 'px'; burbuja.style.top = y + 'px';
    });
    document.addEventListener('focusout', () => { clearTimeout(reloj); burbuja.hidden = true; });
    nombrarControles(document);
    // Los paneles se rehacen al cambiar de selección: los controles nuevos también
    new MutationObserver(cambios => { for (const c of cambios) for (const n of c.addedNodes) if (n.nodeType === 1) nombrarControles(n); })
      .observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Accesibilidad: un botón que solo tiene icono toma su nombre de la ayuda
   * («Deshacer|Undo|Ctrl Z» → «Deshacer»); los lienzos dicen qué son y los
   * avisos flotantes se anuncian al lector de pantalla.
   */
  function nombrarControles(raizNodo) {
    const lista = raizNodo.matches && raizNodo.matches('[data-ayuda]') ? [raizNodo] : [];
    for (const el of [...lista, ...raizNodo.querySelectorAll('[data-ayuda]')]) {
      if (el.hasAttribute('aria-label') || el.textContent.trim()) continue;
      el.setAttribute('aria-label', el.dataset.ayuda.split('|')[0]);
    }
    for (const c of raizNodo.querySelectorAll ? raizNodo.querySelectorAll('canvas:not([role])') : []) {
      c.setAttribute('role', 'img');
      if (!c.hasAttribute('aria-label')) c.setAttribute('aria-label', c.closest('.lienzo-area') ? 'Lienzo de la simulación' : 'Gráfica');
    }
    const avisos = raizNodo.matches && raizNodo.matches('.aviso-flotante') ? [raizNodo] : [...(raizNodo.querySelectorAll ? raizNodo.querySelectorAll('.aviso-flotante') : [])];
    for (const a of avisos) { a.setAttribute('role', 'status'); a.setAttribute('aria-live', 'polite'); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  global.Volta = Object.assign(global.Volta || {}, { ponerTema, alCambiarTema, pintarDeslizador, preferenciaTema, ponerZoom, leerZoom, ZOOMS, MODULOS });
})(window);
