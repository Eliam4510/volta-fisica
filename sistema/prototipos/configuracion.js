/* ==========================================================================
   Volta — Configuración
   Pantalla de preferencias de la aplicación, con secciones a la izquierda:
   apariencia (tema, acento, matiz, tamaño), números (separador decimal),
   escritura de valores (teclado de símbolos), actualizaciones (buscar,
   instalar, buscar al abrir), archivos (recientes y trabajo recuperado) y
   acerca de. Todo se guarda en este equipo y se aplica en todas las
   pantallas al momento.
   ========================================================================== */
import { decimalComa, ponerDecimalComa } from '../nucleo/numeros.js';
import { cantidad } from '../nucleo/formato.js';
import { buscarActualizacion, instalarActualizacion, abrirDescarga, leerEstado, resumenNotas, nativa, PAGINA_RELEASES } from '../componentes/actualizacion.js';
import { archivosRecientes, pendientesDeGuardar, NOMBRES_MODULO, nombreDeRuta } from '../componentes/documento.js';
import { preguntar } from '../componentes/dialogo.js';

(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const V = () => window.Volta;
  const tauri = () => window.__TAURI__ || null;
  const leer = (k, def) => { try { return localStorage.getItem(k) ?? def; } catch { return def; } };
  const guardar = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const seg = (nombre, ops, actual) => `<div class="segmentado texto" data-pref="${nombre}">${ops.map(([v, t]) => `<button data-v="${v}" aria-pressed="${v === actual}">${t}</button>`).join('')}</div>`;
  const opcion = (nombre, desc, control) => `<div class="opcion"><span class="nombre">${nombre}</span>${desc ? `<span class="desc">${desc}</span>` : ''}<div class="control">${control}</div></div>`;

  let version = '…', instalada = null;

  const SECCIONES = {
    apariencia: () => {
      const acento = V().acento(), matiz = V().matiz();
      const COLORES = { tinta: 'var(--tinta)', azul: '#1D5FD6', verde: '#0F7B4C', violeta: '#6A3FC9', ambar: '#A86200', rojo: '#C2261C' };
      const NOMBRES = { tinta: 'Tinta (blanco y negro)', azul: 'Azul', verde: 'Verde', violeta: 'Violeta', ambar: 'Ámbar', rojo: 'Rojo' };
      return `<section><h2>Apariencia</h2><p class="intro">Cómo se ve Volta en este equipo. Los colores de la física (velocidad, fuerzas, campos) no cambian: son parte del lenguaje de las escenas.</p>
        ${opcion('Idioma', 'Idioma de los menús, los paneles, los avisos y las ayudas. Al cambiarlo, la pantalla se vuelve a abrir.', `<div class="segmentado texto" data-pref="idioma" translate="no">${[['es', 'Español'], ['en', 'English'], ['sistema', V().t('Como Windows')]].map(([v, t]) => `<button data-v="${v}" aria-pressed="${v === V().preferenciaIdioma()}">${t}</button>`).join('')}</div>`)}
        ${opcion('Tema', 'Claro, oscuro o el que tenga Windows en cada momento.', seg('tema', [['claro', 'Claro'], ['oscuro', 'Oscuro'], ['sistema', 'Como Windows']], V().preferenciaTema()))}
        ${opcion('Color de acento', `Botón principal, foco, casillas, interruptores y deslizadores. Ahora: ${NOMBRES[acento]}.`,
          `<div class="muestras" data-pref="acento">${V().ACENTOS.map(a => `<button class="muestra" data-v="${a}" aria-pressed="${a === acento}" aria-label="${NOMBRES[a]}" title="${NOMBRES[a]}"><span style="background:${COLORES[a]}"></span></button>`).join('')}</div>`)}
        ${opcion('Matiz de las superficies', 'Neutro (gris), cálido (papel) o frío (gris azulado), en paneles, campos y lienzo.', seg('matiz', [['neutro', 'Neutro'], ['calido', 'Cálido'], ['frio', 'Frío']], matiz))}
        ${opcion('Tamaño de la interfaz', tauri()?.webview ? 'Agranda o achica todo: letra, botones y lienzos.' : 'En el navegador se cambia con Ctrl + y Ctrl −.',
          seg('zoom', V().ZOOMS.map(z => [String(z), `${Math.round(z * 100)} %`]), String(V().leerZoom())))}
        <div class="vista-previa"><div class="panel-muestra"><button class="btn btn-primario">Principal</button><button class="btn btn-secundario">Secundario</button>
          <label class="casilla"><input type="checkbox" checked> Casilla</label><input class="interruptor" type="checkbox" checked aria-label="Interruptor"></div>
          <span class="chip lleno">MEXT</span><span class="chip">Ejemplo</span></div>
      </section>`;
    },
    numeros: () => `<section><h2>Números</h2><p class="intro">Cómo se escriben y se leen las cantidades.</p>
      ${opcion('Separador decimal', `Ejemplo: ${esc(cantidad(9.8, 'm/s²'))}. Con coma, el CSV separa las columnas con punto y coma, como lo abre Excel en español de España.`,
        seg('decimal', [['punto', 'Punto (1.5)'], ['coma', 'Coma (1,5)']], decimalComa() ? 'coma' : 'punto'))}
      ${opcion('Unidades', 'Cada campo dice su unidad; puedes escribir otra («72 km/h», «500 g», «2 au») y Volta la convierte a SI.', '')}
      </section>`,
    escritura: () => `<section><h2>Escritura de valores</h2><p class="intro">Los campos aceptan números, unidades y expresiones. Intro aplica el valor; Escape lo deshace.</p>
      ${opcion('Teclado de símbolos', 'Al escribir en un campo, una fila con ×10ⁿ, potencias, √, π y las unidades de la misma magnitud.', seg('teclado', [['si', 'Mostrar'], ['no', 'Ocultar']], leer('volta.teclado', 'si') === 'no' ? 'no' : 'si'))}
      <div class="caja-info"><b>Cómo escribir</b><ul class="sintaxis">
        <li>Potencias de diez: <code>2e30</code>, <code>2×10^30</code>, <code>2*10^30</code> o <code>2·10³⁰</code></li>
        <li>Con unidad: <code>9.8 m/s²</code>, <code>72 km/h</code>, <code>500 g</code>, <code>30°</code>, <code>0.5 rad</code></li>
        <li>Expresiones: <code>sqrt(2*9.8*5)</code>, <code>3/4</code>, <code>(1.2 + 0.3)*2</code>, <code>pi/6</code></li>
        <li>Variables de la escena por su nombre (en los espacios que las tienen): <code>2*m</code>, <code>v0*cos(30°)</code></li>
        <li>Un número sin unidad está en la unidad del campo.</li></ul></div>
      </section>`,
    actualizaciones: () => {
      const est = leerEstado(), ultima = est.ultima ? new Date(est.ultima).toLocaleString('es-MX') : 'nunca';
      return `<section><h2>Actualizaciones</h2><p class="intro">Volta se actualiza desde las publicaciones de GitHub. Cada versión viene firmada: la instalación comprueba la firma antes de instalar.</p>
        ${opcion('Versión instalada', instalada === false ? 'Versión portátil: se actualiza descargando la nueva.' : instalada ? 'Instalada con el instalador: se actualiza sola.' : 'En el navegador no hay actualizaciones.', `<span class="num">${esc(version)}</span>`)}
        ${opcion('Buscar ahora', `Última búsqueda: ${esc(ultima)}.`, `<button class="btn btn-primario" id="b-buscar"${tauri()?.updater ? '' : ' disabled'}>Buscar actualizaciones</button>`)}
        <div id="resultado-act"></div>
        ${opcion('Buscar al abrir Inicio', 'Como mucho cada 6 horas; si hay una versión nueva, Inicio la anuncia.', seg('actualizar', [['si', 'Sí'], ['no', 'No']], leer('volta.actualizacion.auto', 'si') === 'no' ? 'no' : 'si'))}
        ${opcion('Todas las versiones', 'Notas y descargas de cada versión.', `<button class="btn btn-secundario" id="b-releases">Ver en GitHub</button>`)}
      </section>`;
    },
    archivos: () => {
      const rec = archivosRecientes(), pend = pendientesDeGuardar();
      return `<section><h2>Archivos</h2><p class="intro">Las escenas se guardan como archivos .volta donde tú elijas. Además, cada pantalla recuerda en este equipo lo último que hiciste, para recuperarlo aunque no lo hayas guardado.</p>
        ${opcion('Archivos recientes', rec.length ? `${rec.length} en la lista de Inicio.` : 'La lista está vacía.', `<button class="btn btn-secundario" id="b-vaciar-recientes"${rec.length ? '' : ' disabled'}>Vaciar la lista</button>`)}
        ${opcion('Trabajo recuperado', pend.length ? `Hay cambios sin guardar en: ${pend.map(p => esc(`${nombreDeRuta(p.meta.ruta) || p.meta.titulo} (${NOMBRES_MODULO[p.meta.modulo] || p.meta.modulo})`)).join(', ')}.` : 'Ninguna pantalla tiene cambios sin guardar.',
          `<button class="btn btn-secundario" id="b-borrar-trabajo">Borrar el trabajo recuperado</button>`)}
      </section>`;
    },
    acerca: () => `<section><h2>Acerca de Volta</h2>
      <dl class="fila-datos"><dt>Versión</dt><dd class="num">${esc(version)}</dd><dt>Instalación</dt><dd>${instalada === false ? 'Portátil' : instalada ? 'Instalada para este usuario' : 'Navegador (desarrollo)'}</dd>
      <dt>Licencia</dt><dd>MIT</dd><dt>Autor</dt><dd translate="no">Eliam Mojardin Ibarra</dd><dt>Motores</dt><dd>Nueve módulos de física con pruebas contra soluciones analíticas y problemas del temario MEXT.</dd></dl>
      ${opcion('Código y versiones', 'Proyecto abierto en GitHub.', `<button class="btn btn-secundario" id="b-github">Abrir en GitHub</button>`)}
      </section>`,
  };

  let actual = 'apariencia';
  function mostrar(sec) {
    actual = SECCIONES[sec] ? sec : 'apariencia';
    document.querySelectorAll('.config-nav [data-sec]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.sec === actual)));
    $('#cuerpo').innerHTML = SECCIONES[actual]();
    try { history.replaceState(null, '', `?seccion=${actual}`); } catch { /* sin historial */ }
  }

  // Cambios de los controles
  $('#cuerpo').addEventListener('click', async ev => {
    const b = ev.target.closest('button'); if (!b) return;
    const grupo = b.closest('[data-pref]');
    if (grupo) {
      const v = b.dataset.v;
      grupo.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      switch (grupo.dataset.pref) {
        case 'tema': V().ponerTema(v); break;
        case 'acento': V().ponerAcento(v); mostrar('apariencia'); break;
        case 'matiz': V().ponerMatiz(v); break;
        case 'zoom': V().ponerZoom(parseFloat(v)); break;
        case 'decimal': guardar('volta.decimal', v); ponerDecimalComa(v === 'coma'); mostrar('numeros'); break;
        case 'teclado': guardar('volta.teclado', v); break;
        case 'actualizar': guardar('volta.actualizacion.auto', v); break;
        case 'idioma': {
          // El idioma se aplica al abrir cada pantalla: si cambia el efectivo, se vuelve a abrir esta
          const antes = V().idioma();
          guardar('volta.idioma', v);
          if (V().idiomaEfectivo(v) !== antes) location.reload();
          break;
        }
      }
      return;
    }
    if (b.id === 'b-buscar') return buscar(b);
    if (b.id === 'b-releases') return abrirDescarga();
    if (b.id === 'b-github') { const u = 'https://github.com/Eliam4510/volta-fisica'; if (tauri()?.opener) tauri().opener.openUrl(u); else window.open(u, '_blank', 'noopener'); return; }
    if (b.id === 'b-vaciar-recientes') { guardar('volta.archivos', null); guardar('volta.recientes', null); mostrar('archivos'); return; }
    if (b.id === 'b-borrar-trabajo') {
      const r = await preguntar({ titulo: '¿Borrar el trabajo recuperado de todas las pantallas?', texto: 'Lo que no hayas guardado en un archivo se pierde. Los archivos .volta no se tocan.', botones: [{ id: 'cancelar', texto: 'Cancelar' }, { id: 'borrar', texto: 'Borrar', principal: true }] });
      if (r !== 'borrar') return;
      try { for (const k of Object.keys(localStorage)) if (k.startsWith('volta.escena.') || k.startsWith('volta.doc.')) localStorage.removeItem(k); localStorage.removeItem('volta.recientes'); } catch { /* sin almacenamiento */ }
      mostrar('archivos');
    }
  });

  async function buscar(boton) {
    const caja = $('#resultado-act');
    boton.disabled = true; caja.innerHTML = '<div class="caja-info">Buscando en GitHub…</div>';
    try {
      const r = await buscarActualizacion();
      if (r.estado !== 'disponible') { caja.innerHTML = `<div class="caja-info"><b>Volta está al día.</b><span>No hay una versión más nueva que la ${esc(version)}.</span></div>`; return; }
      caja.innerHTML = `<div class="caja-info"><b>Volta ${esc(r.version)} está disponible</b><span>Tienes la ${esc(r.actual)}.${r.instalada ? ' Se descarga, se comprueba su firma, se instala y Volta se reinicia; tus escenas no se tocan.' : ' Esta es la versión portátil: descarga la nueva desde GitHub.'}</span>
        <pre></pre><div><button class="btn btn-primario" id="b-instalar">${r.instalada ? 'Instalar y reiniciar' : 'Descargar'}</button> <span class="nota" id="progreso"></span></div></div>`;
      caja.querySelector('pre').textContent = resumenNotas(r.notas, 2000) || 'Sin notas.';
      caja.querySelector('#b-instalar').addEventListener('click', async ev => {
        if (!r.instalada) { abrirDescarga(); return; }
        if (pendientesDeGuardar().length) {
          const q = await preguntar({ titulo: 'Hay escenas con cambios sin guardar', texto: 'Al reiniciar, Volta las recupera, pero no quedan en ningún archivo. ¿Instalar de todos modos?', botones: [{ id: 'cancelar', texto: 'Cancelar' }, { id: 'seguir', texto: 'Instalar', principal: true }] });
          if (q !== 'seguir') return;
        }
        ev.target.disabled = true;
        const p = caja.querySelector('#progreso');
        try { await instalarActualizacion(r.upd, x => { p.textContent = x < 100 ? `Descargando… ${x} %` : 'Instalando…'; }); }
        catch (err) { p.textContent = `No se pudo instalar: ${err?.message || err}`; ev.target.disabled = false; }
      });
    } catch (err) {
      caja.innerHTML = `<div class="caja-info"><b>No se pudo consultar GitHub.</b><span>${esc(err?.message || err)}. Revisa la conexión y vuelve a intentarlo.</span></div>`;
    } finally { boton.disabled = false; }
  }

  // Navegación
  document.querySelector('.config-nav').addEventListener('click', ev => { const b = ev.target.closest('[data-sec]'); if (b) mostrar(b.dataset.sec); });
  const volver = () => { if (history.length > 1 && document.referrer && !document.referrer.includes('configuracion.html')) history.back(); else location.href = 'inicio.html'; };
  $('#b-volver').addEventListener('click', volver);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !document.querySelector('.dialogo-fondo')) volver(); });
  $('#b-restablecer').addEventListener('click', async () => {
    const r = await preguntar({ titulo: '¿Restablecer toda la configuración?', texto: 'Idioma, tema, acento, matiz, tamaño, separador decimal, teclado y actualizaciones vuelven a sus valores de fábrica. Tus escenas no se tocan.', botones: [{ id: 'cancelar', texto: 'Cancelar' }, { id: 'si', texto: 'Restablecer', principal: true }] });
    if (r !== 'si') return;
    const idiomaAntes = V().idioma();
    for (const k of ['volta.decimal', 'volta.teclado', 'volta.actualizacion.auto', 'volta.idioma']) guardar(k, null);
    V().ponerTema('sistema'); V().ponerAcento('tinta'); V().ponerMatiz('neutro'); V().ponerZoom(1); ponerDecimalComa(null);
    if (V().idiomaEfectivo('sistema') !== idiomaAntes) { location.reload(); return; }
    mostrar(actual);
  });

  // Versión y modo de instalación (en la aplicación)
  const t = tauri();
  if (t?.core) {
    t.core.invoke('version').then(v => { version = v; if (actual === 'actualizaciones' || actual === 'acerca') mostrar(actual); }).catch(() => {});
    t.core.invoke('instalada').then(v => { instalada = !!v; if (actual === 'actualizaciones' || actual === 'acerca') mostrar(actual); }).catch(() => {});
  } else { version = 'desarrollo'; }
  void nativa; void PAGINA_RELEASES;

  mostrar(new URLSearchParams(location.search).get('seccion') || 'apariencia');
})();
