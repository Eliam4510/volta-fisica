/* ==========================================================================
   Volta — Idioma de la interfaz
   Script clásico que va en el <head> de cada pantalla, después del
   diccionario (idioma-en.js). La interfaz está escrita en español; en inglés,
   un observador traduce cada texto de la página en cuanto aparece (también
   los que las pantallas generan después: inspectores, avisos, menús), con el
   diccionario español → inglés:
   - entradas exactas («Guardar» → «Save»);
   - patrones con huecos («Se quita {0}» → «Removed {0}»): lo que llena cada
     hueco se traduce también si es una entrada exacta.
   El código usa Volta.t(texto, ...valores) para lo que no pasa por la página
   (título de la ventana, diálogos nativos, lienzos). Lo que falta en el
   diccionario se queda en español y se apunta en Volta.idiomaFaltantes().
   Preferencia: localStorage «volta.idioma» = es | en | sistema.
   ========================================================================== */
(function (global) {
  'use strict';
  const IDIOMAS = ['es', 'en'];
  function preferenciaIdioma() {
    try { const v = global.localStorage.getItem('volta.idioma'); return v === 'es' || v === 'en' || v === 'sistema' ? v : 'sistema'; } catch { return 'sistema'; }
  }
  /** Idioma efectivo: el elegido, o el de Windows (inglés si no empieza por «es»). */
  function idiomaEfectivo(pref = preferenciaIdioma()) {
    if (pref !== 'sistema') return pref;
    const n = (global.navigator && (global.navigator.languages?.[0] || global.navigator.language)) || 'es';
    return /^es\b/i.test(n) ? 'es' : 'en';
  }
  const IDIOMA = idiomaEfectivo();

  // ------------------------------------------------------------- diccionario
  // DIC: entradas exactas; PLANTILLAS: las que tienen huecos, para t(); PATRONES: sus expresiones
  const DIC = new Map(), PLANTILLAS = new Map(), PATRONES = [];
  const escaparRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function cargar(dic) {
    for (const [es, en] of Object.entries(dic || {})) {
      if (/\{\w+\}/.test(es)) {
        const nombres = [];
        const re = new RegExp('^' + es.split(/(\{\w+\})/).map(p => { const m = p.match(/^\{(\w+)\}$/); if (m) { nombres.push(m[1]); return '(.+?)'; } return escaparRe(p); }).join('') + '$', 's');
        PATRONES.push({ re, nombres, en, fijo: es.replace(/\{\w+\}/g, '').length });
        PLANTILLAS.set(es, en);
      } else DIC.set(es, en);
    }
    // Primero los patrones con más texto fijo: son los más específicos
    PATRONES.sort((a, b) => b.fijo - a.fijo);
    cache.clear();
  }
  // salidas: lo ya traducido (no se vuelve a buscar ni cuenta como faltante)
  const cache = new Map(), faltantes = new Set(), salidas = new Set();
  const rellenar = (plantilla, valores) => plantilla.replace(/\{(\w+)\}/g, (m, k) => (valores[k] ?? m));

  /** Traducción de un texto sin espacios de los bordes (null si no hay). */
  function traducirNucleo(s) {
    if (cache.has(s)) return cache.get(s);
    let r = DIC.has(s) ? DIC.get(s) : null;
    if (r == null) {
      for (const p of PATRONES) {
        const m = p.re.exec(s);
        if (!m) continue;
        const valores = {};
        p.nombres.forEach((k, i) => { const v = m[i + 1]; valores[k] = DIC.has(v) ? DIC.get(v) : v; });
        r = rellenar(p.en, valores);
        break;
      }
    }
    if (cache.size > 20000) cache.clear();
    cache.set(s, r);
    return r;
  }
  const LETRAS = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2}/;
  /** Texto traducido al idioma de la interfaz, conservando los espacios de los bordes. */
  function traducirTexto(texto) {
    if (IDIOMA === 'es' || !texto || !LETRAS.test(texto)) return texto;
    const a = texto.length - texto.trimStart().length, b = texto.trimEnd().length;
    const nucleo = texto.slice(a, b).replace(/\s+/g, ' ');
    const r = traducirNucleo(nucleo);
    if (r == null) { if (faltantes.size < 5000 && nucleo.length > 3 && !salidas.has(nucleo)) faltantes.add(nucleo); return texto; }
    if (salidas.size < 50000) salidas.add(r);
    return texto.slice(0, a) + r + texto.slice(b);
  }
  /**
   * t('Se quita {0}', nombre): el texto en el idioma de la interfaz con los
   * valores en sus huecos ({0}, {1}… o {nombre} con un objeto).
   */
  function t(texto, ...valores) {
    const vals = valores.length === 1 && valores[0] && typeof valores[0] === 'object' ? valores[0] : valores;
    if (IDIOMA === 'es') return rellenar(texto, vals);
    const en = DIC.get(texto) ?? PLANTILLAS.get(texto);
    if (en == null && !/\{\w+\}/.test(texto)) { const r = traducirTexto(texto); return r; }
    if (en == null) { if (faltantes.size < 5000) faltantes.add(texto); return rellenar(texto, vals); }
    return rellenar(en, vals);
  }

  // ------------------------------------------------------------- la página
  const ATRIBUTOS = ['aria-label', 'title', 'placeholder', 'alt'];
  const SALTAR = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'KBD']);
  const hechos = new WeakMap();
  function saltar(el) { return !el || SALTAR.has(el.nodeName) || (el.closest && el.closest('[translate="no"], [contenteditable="true"]')); }
  function traducirNodoTexto(n) {
    const v = n.nodeValue;
    if (hechos.get(n) === v) return;
    if (saltar(n.parentElement)) return;
    const r = traducirTexto(v);
    hechos.set(n, r);
    if (r !== v) n.nodeValue = r;
  }
  function traducirAtributos(el) {
    for (const a of ATRIBUTOS) {
      const v = el.getAttribute(a);
      if (!v) continue;
      const r = traducirTexto(v);
      if (r !== v) el.setAttribute(a, r);
    }
  }
  function traducirArbol(raiz) {
    if (!raiz) return;
    if (raiz.nodeType === 3) { traducirNodoTexto(raiz); return; }
    if (raiz.nodeType !== 1 || saltar(raiz)) return;
    traducirAtributos(raiz);
    const w = global.document.createTreeWalker(raiz, 1 | 4, { acceptNode: n => (n.nodeType === 1 && saltar(n) ? 2 : 1) });
    for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.nodeType === 3) traducirNodoTexto(n); else traducirAtributos(n); }
  }
  function observar() {
    const doc = global.document;
    doc.documentElement.lang = 'en';
    traducirArbol(doc.documentElement);
    new global.MutationObserver(cambios => {
      for (const c of cambios) {
        if (c.type === 'childList') for (const n of c.addedNodes) traducirArbol(n);
        else if (c.type === 'characterData') traducirNodoTexto(c.target);
        else if (c.type === 'attributes' && c.target.nodeType === 1) { const v = c.target.getAttribute(c.attributeName), r = traducirTexto(v); if (r !== v) c.target.setAttribute(c.attributeName, r); }
      }
    }).observe(doc.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
  }

  /**
   * Texto de una ayuda «Texto|Término en inglés|Atajo» en el idioma de la
   * interfaz: en inglés, la traducción del texto si está en el diccionario y
   * si no, el término en inglés. Devuelve [principal, secundario, atajo].
   */
  function ayuda(cadena) {
    const [txt = '', en = '', atajo = ''] = String(cadena).split('|');
    if (IDIOMA === 'es') return [txt, en, atajo];
    const r = traducirNucleo(txt.trim()), principal = r ?? (en || txt);
    salidas.add(principal);
    return [principal, '', atajo];
  }

  cargar(global.VOLTA_EN);
  global.Volta = Object.assign(global.Volta || {}, {
    idioma: () => IDIOMA, preferenciaIdioma, idiomaEfectivo, IDIOMAS, t, traducirTexto, ayuda, cargarIdioma: cargar,
    /** ¿Hay traducción (exacta o por patrón) para este texto? */
    traducible: (/** @type {string} */ s) => traducirNucleo(String(s).trim().replace(/\s+/g, ' ')) != null,
    idiomaFaltantes: () => [...faltantes].sort(),
  });
  if (IDIOMA !== 'es' && global.document && global.MutationObserver) observar();
  // Los lienzos (escena y gráficas) escriben con fillText: se traduce ahí, y
  // measureText mide el mismo texto para que las etiquetas se acomoden bien
  const C2D = global.CanvasRenderingContext2D;
  if (IDIOMA !== 'es' && C2D && !C2D.prototype.__voltaIdioma) {
    for (const m of ['fillText', 'strokeText', 'measureText']) {
      const original = C2D.prototype[m];
      C2D.prototype[m] = function (texto, ...resto) { return original.call(this, typeof texto === 'string' ? traducirTexto(texto) : texto, ...resto); };
    }
    C2D.prototype.__voltaIdioma = true;
  }
})(typeof window !== 'undefined' ? window : globalThis);
