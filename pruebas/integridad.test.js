// Integridad del proyecto: referencias locales, iconos y tokens generados.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prot = join(raiz, 'sistema', 'prototipos');
const paginas = readdirSync(prot).filter(f => f.endsWith('.html'));
const leer = p => readFileSync(p, 'utf8');

describe('pantallas', () => {
  it('existen las cinco pantallas principales', () => {
    for (const p of ['inicio.html', 'mecanica.html', 'electrostatica.html', 'termodinamica.html', 'guia.html']) {
      expect(paginas).toContain(p);
    }
  });

  for (const pagina of paginas) {
    it(`${pagina}: todos los archivos locales que cita existen`, () => {
      const html = leer(join(prot, pagina));
      const refs = [...html.matchAll(/(?:src|href)="([^"#?]+)"/g)].map(m => m[1])
        .filter(r => !/^(https?:|mailto:|data:|#|javascript:)/.test(r))
        // las plantillas de JavaScript (`${href}`) no son rutas
        .filter(r => !r.includes('${'));
      const faltan = refs.filter(r => !existsSync(join(prot, r)));
      expect(faltan).toEqual([]);
    });

    it(`${pagina}: no carga fuentes de internet`, () => {
      expect(leer(join(prot, pagina))).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
    });
  }
});

describe('módulos ES', () => {
  const archivosJs = [];
  const recorrer = d => readdirSync(d, { withFileTypes: true }).forEach(e => {
    const p = join(d, e.name);
    if (e.isDirectory()) recorrer(p); else if (e.name.endsWith('.js') && !p.includes(join('iconos', ''))) archivosJs.push(p);
  });
  recorrer(join(raiz, 'sistema'));

  it('todo import relativo apunta a un archivo existente', () => {
    const rotos = [];
    for (const f of archivosJs) {
      for (const m of leer(f).matchAll(/^\s*import\s[^'"]*['"](\.[^'"]+)['"]/gm)) {
        if (!existsSync(join(dirname(f), m[1]))) rotos.push(`${f}: ${m[1]}`);
      }
    }
    expect(rotos).toEqual([]);
  });
});

describe('iconos', () => {
  const sprite = leer(join(raiz, 'sistema', 'iconos', 'sprite.svg'));
  const ids = new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map(m => m[1]));

  it('el sprite tiene los 243 iconos del inventario', () => {
    expect(ids.size).toBe(243);
  });

  for (const pagina of paginas) {
    it(`${pagina}: todo icono estático que usa existe en el sprite`, () => {
      const html = leer(join(prot, pagina));
      const usados = [...html.matchAll(/<use href="#([a-z0-9-]+)"/g)].map(m => m[1]);
      expect(usados.filter(u => !ids.has(u))).toEqual([]);
    });
  }
});

describe('tokens', () => {
  it('tokens.css está generado a partir de la versión actual de tokens.json', () => {
    const json = JSON.parse(leer(join(raiz, 'sistema', 'tokens', 'tokens.json')));
    const css = leer(join(raiz, 'sistema', 'tokens', 'tokens.css'));
    for (const [k, v] of Object.entries(json.color.claro)) expect(css).toContain(`--${k}: ${v};`);
    for (const [k, v] of Object.entries(json.fisica.oscuro)) expect(css).toContain(`--f-${k}: ${v};`);
    expect(css).toContain(`--est-panel-izq: ${json.estructura['panel-izq']}px;`);
  });

  it('componentes.css no usa colores literales', () => {
    const css = leer(join(raiz, 'sistema', 'componentes', 'componentes.css'));
    const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(sinComentarios).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/);
  });
});
