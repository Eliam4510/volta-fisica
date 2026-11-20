// Actualizaciones desde GitHub: lógica pura del aviso y configuración del
// actualizador de Tauri (dirección del manifiesto, clave pública, permisos,
// flujo de release) y que ninguna clave privada acabe en el repositorio.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { compararVersiones, debeBuscar, resumenNotas, porcentaje, INTERVALO_BUSQUEDA, PAGINA_RELEASES } from '../sistema/componentes/actualizacion.js';

const raiz = join(import.meta.dirname, '..');
const leer = p => readFileSync(join(raiz, p), 'utf8');

describe('comparar versiones', () => {
  it('por número, no por texto', () => {
    expect(compararVersiones('0.15.0', '0.9.0')).toBeGreaterThan(0);
    expect(compararVersiones('0.16.0', '0.16.0')).toBe(0);
    expect(compararVersiones('v1.0.0', '0.99.9')).toBeGreaterThan(0);
    expect(compararVersiones('1.2', '1.2.0')).toBe(0);
    expect(compararVersiones('1.2.3', '1.2.10')).toBeLessThan(0);
  });
  it('una versión previa (-beta) va antes de la final', () => {
    expect(compararVersiones('1.0.0-beta', '1.0.0')).toBeLessThan(0);
    expect(compararVersiones('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0);
    expect(compararVersiones('1.0.0-alfa', '1.0.0-beta')).toBeLessThan(0);
  });
});

describe('cuándo buscar sola', () => {
  const t0 = 1_800_000_000_000;
  it('la primera vez, y después cada intervalo', () => {
    expect(debeBuscar(null, t0)).toBe(true);
    expect(debeBuscar({}, t0)).toBe(true);
    expect(debeBuscar({ ultima: t0 }, t0 + INTERVALO_BUSQUEDA - 1)).toBe(false);
    expect(debeBuscar({ ultima: t0 }, t0 + INTERVALO_BUSQUEDA)).toBe(true);
  });
  it('un reloj que va hacia atrás no la bloquea', () => {
    expect(debeBuscar({ ultima: t0 }, t0 - 1000)).toBe(true);
  });
});

describe('notas de la versión', () => {
  it('quita títulos y marcas de Markdown y deja los puntos', () => {
    const r = resumenNotas('## [0.16.0] - 2026-11-20\n\nTexto.\n\n### Añadido\n\n- **Mecánica**: `bloques` y [enlace](https://x)\n* otro');
    expect(r).toBe('Texto.\n• Mecánica: bloques y enlace\n• otro');
  });
  it('se corta en un final de línea', () => {
    const r = resumenNotas(Array.from({ length: 50 }, (_, k) => `- punto ${k}`).join('\n'), 60);
    expect(r.length).toBeLessThanOrEqual(62);
    expect(r.endsWith('\n…')).toBe(true);
    expect(resumenNotas('')).toBe('');
  });
  it('porcentaje de la descarga', () => {
    expect(porcentaje(50, 200)).toBe(25);
    expect(porcentaje(10, 0)).toBe(0);
    expect(porcentaje(300, 200)).toBe(100);
  });
});

describe('configuración del actualizador', () => {
  const conf = JSON.parse(leer('src-tauri/tauri.conf.json'));
  it('consulta latest.json de la última release del repositorio, con la clave pública del proyecto', () => {
    const u = conf.plugins.updater;
    expect(u.endpoints).toEqual(['https://github.com/Eliam4510/volta-fisica/releases/latest/download/latest.json']);
    expect(PAGINA_RELEASES.startsWith('https://github.com/Eliam4510/volta-fisica/')).toBe(true);
    const pub = Buffer.from(u.pubkey, 'base64').toString('utf8');
    expect(pub.startsWith('untrusted comment: minisign public key')).toBe(true);
    expect(u.windows.installMode).toBe('passive');
  });
  it('los artefactos firmados solo se piden en CI (con la clave): una compilación local sin clave no falla', () => {
    expect(conf.bundle.createUpdaterArtifacts).toBeUndefined();
    const flujo = leer('.github/workflows/release.yml');
    expect(flujo).toContain('secrets.TAURI_SIGNING_PRIVATE_KEY');
    expect(flujo).toContain('createUpdaterArtifacts');
    expect(flujo).toContain('latest.json');
    expect(flujo).toContain("'windows-x86_64'");
  });
  it('la ventana tiene permiso para buscar, reiniciar y abrir solo la página del repositorio', () => {
    const cap = JSON.parse(leer('src-tauri/capabilities/default.json')).permissions;
    expect(cap).toContain('updater:default');
    expect(cap).toContain('process:allow-restart');
    const op = cap.find(p => p.identifier === 'opener:allow-open-url');
    expect(op.allow).toEqual([{ url: 'https://github.com/Eliam4510/volta-fisica/*' }]);
    const rust = leer('src-tauri/src/lib.rs');
    for (const t of ['tauri_plugin_updater', 'tauri_plugin_process', 'tauri_plugin_opener', 'instalada']) expect(rust).toContain(t);
  });
  it('ninguna clave privada de firma está en el repositorio', () => {
    // Cabecera de una clave privada de Tauri en base64 (se construye aquí para
    // que este archivo no la contenga literalmente)
    const firmaPrivada = Buffer.from('untrusted comment: rsign encrypted secret key').toString('base64').slice(0, 40);
    const omitir = new Set(['node_modules', '.git', 'target', 'gen', '.claude']);
    const revisar = dir => {
      for (const n of readdirSync(dir)) {
        if (omitir.has(n)) continue;
        const p = join(dir, n), st = statSync(p);
        if (st.isDirectory()) revisar(p);
        else if (st.size < 2e6 && /\.(js|json|html|css|md|yml|yaml|toml|rs|txt|key|pub|mjs|cjs)$/i.test(n)) expect(readFileSync(p, 'utf8').includes(firmaPrivada), p).toBe(false);
      }
    };
    revisar(raiz);
  });
});
