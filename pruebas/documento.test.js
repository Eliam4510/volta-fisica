// Documento común de las pantallas: a qué pantalla va cada escena, huella de
// cambios, nombres y títulos; y que la aplicación se empaquete sin las
// herramientas de desarrollo y con la extensión .volta registrada.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { paginaDe, claveDe, huella, nombreDeRuta, tituloVentana, nombreSugerido, PANTALLAS, ESPACIOS } from '../sistema/componentes/documento.js';
import { incluir, EXCLUIR } from '../herramientas/preparar-app.mjs';

const raiz = join(import.meta.dirname, '..');
const proto = join(raiz, 'sistema', 'prototipos');
const leer = p => readFileSync(join(raiz, p), 'utf8');

/** Módulo y espacio que guarda cada pantalla (de su escenaActual). */
function espacioDePantalla(js) {
  const s = readFileSync(join(proto, js), 'utf8');
  const m = s.match(/crearEscena\(\{\s*modulo: '([a-z]+)', espacio: ('([a-z0-9-]+)'|ESPACIO)/);
  if (!m) return null;
  let esp = m[3];
  if (!esp) { const c = s.match(/(?:export )?const ESPACIO = '([a-z0-9-]+)'/); esp = c && c[1]; }
  return { modulo: m[1], espacio: esp };
}

describe('cada escena va a su pantalla', () => {
  const pantallas = readdirSync(proto).filter(f => f.endsWith('.html') && !['inicio.html', 'guia.html'].includes(f));
  it('las 23 pantallas guardan un módulo y un espacio que vuelven a abrirlas', () => {
    expect(pantallas).toHaveLength(23);
    for (const html of pantallas) {
      const e = espacioDePantalla(html.replace('.html', '.js'));
      expect(e, html).toBeTruthy();
      expect(paginaDe(e), `${html}: ${e.modulo}/${e.espacio}`).toBe(html);
    }
  });
  it('las páginas del mapa existen y la clave de autoguardado es el nombre de la página', () => {
    for (const p of [...Object.values(PANTALLAS), ...Object.values(ESPACIOS)]) expect(readdirSync(proto)).toContain(p);
    expect(claveDe('optica-ondas.html')).toBe('optica-ondas');
    expect(paginaDe({ modulo: 'quimica', espacio: 'x' })).toBeNull();
  });
});

describe('huella, nombres y título', () => {
  it('la huella cambia con los datos o el título y no con el orden de lectura', () => {
    const a = { titulo: 'Plano', datos: { m: 1, objetos: [{ x: 0.1 }] } };
    expect(huella(a)).toBe(huella(JSON.parse(JSON.stringify(a))));
    expect(huella(a)).not.toBe(huella({ ...a, titulo: 'Plano 2' }));
    expect(huella(a)).not.toBe(huella({ ...a, datos: { m: 1, objetos: [{ x: 0.1000001 }] } }));
    expect(Number.isSafeInteger(huella(a))).toBe(true);
  });
  it('nombres de archivo y título de la ventana', () => {
    expect(nombreDeRuta('C:\\Users\\a\\Documentos\\Mi rampa.volta')).toBe('Mi rampa');
    expect(nombreDeRuta('/home/a/tiro.json')).toBe('tiro');
    expect(nombreDeRuta(null)).toBe('');
    expect(tituloVentana({ nombre: 'Mi rampa', modificado: true, modulo: 'mecanica' })).toBe('Mi rampa • — Mecánica — Volta');
    expect(tituloVentana({ nombre: '', modificado: false })).toBe('Sin título — Volta');
    expect(nombreSugerido('Ciclo: P/V <rect>')).toBe('Ciclo P V rect');
    expect(nombreSugerido('')).toBe('Escena');
  });
});

describe('la aplicación como producto', () => {
  const conf = JSON.parse(leer('src-tauri/tauri.conf.json'));
  it('se empaqueta desde dist/ sin la guía, el catálogo ni los generadores', () => {
    expect(conf.build.frontendDist).toBe('../dist');
    expect(conf.build.beforeBuildCommand).toContain('preparar-app.mjs');
    const s = p => join(raiz, 'sistema', p);
    for (const x of ['prototipos/guia.html', 'iconos/catalogo.html', 'iconos/svg/o-bloque.svg', 'tokens/tokens.ts', 'iconos/construir.mjs']) expect(incluir(s(x)), x).toBe(false);
    for (const x of ['prototipos/inicio.html', 'prototipos/optica.js', 'iconos/sprite.js', 'tokens/tokens.css', 'componentes/documento.js']) expect(incluir(s(x)), x).toBe(true);
    expect(EXCLUIR.length).toBeGreaterThan(5);
  });
  it('Inicio no enseña herramientas de desarrollo ni escenas inventadas', () => {
    const inicio = leer('sistema/prototipos/inicio.html');
    expect(inicio).not.toContain('guia.html');
    expect(inicio).not.toContain('catalogo.html');
    expect(inicio).not.toContain('Mi rampa');
    expect(inicio).toContain('id="buscar"');
  });
  it('ninguna pantalla deja botones que solo avisan de algo futuro', () => {
    for (const f of readdirSync(proto).filter(x => x.endsWith('.html') && x !== 'guia.html')) {
      expect(readFileSync(join(proto, f), 'utf8'), f).not.toContain('data-pendiente');
    }
  });
  it('las escenas .volta se abren con Volta desde Windows', () => {
    expect(conf.bundle.fileAssociations[0].ext).toEqual(['volta']);
    const rust = leer('src-tauri/src/lib.rs');
    for (const t of ['tauri_plugin_single_instance', 'archivo_inicial', 'leer_escena', 'escribir_escena', 'abrir-archivo']) expect(rust).toContain(t);
    const cap = JSON.parse(leer('src-tauri/capabilities/default.json')).permissions;
    for (const p of ['core:window:allow-set-title', 'core:window:allow-destroy', 'core:window:allow-set-theme', 'core:webview:allow-set-webview-zoom']) expect(cap).toContain(p);
  });
  it('todas las pantallas registran su documento y tienen Abrir y Guardar a la vista', () => {
    for (const f of readdirSync(proto).filter(x => x.endsWith('.html') && !['inicio.html', 'guia.html'].includes(x))) {
      const html = readFileSync(join(proto, f), 'utf8'), js = readFileSync(join(proto, f.replace('.html', '.js')), 'utf8');
      expect(/data-accion="abrir"|id="b-abrir"/.test(html), f).toBe(true);
      expect(/data-accion="guardar"|id="b-guardar"/.test(html), f).toBe(true);
      expect(js, f).toContain('registrarDocumento(');
    }
  });
});
