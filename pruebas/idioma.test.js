// Idioma de la interfaz: el traductor (entradas exactas, patrones con huecos,
// ayudas), la coherencia del diccionario y que cada texto visible de las
// pantallas tenga su traducción al inglés.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { incluir } from '../herramientas/preparar-app.mjs';

const raiz = join(import.meta.dirname, '..', 'sistema');
const proto = join(raiz, 'prototipos');
const fuente = p => readFileSync(join(raiz, p), 'utf8');

/** Carga diccionario e idioma.js en un «window» de mentira con el idioma dado. */
function cargarIdioma(idioma) {
  const win = { localStorage: { getItem: k => (k === 'volta.idioma' ? idioma : null) }, navigator: { language: 'es-MX' } };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(fuente('componentes/idioma-en.js'), win);
  vm.runInContext(fuente('componentes/idioma.js'), win);
  return win;
}
const EN = cargarIdioma('en'), ES = cargarIdioma('es');
const V = EN.Volta;

describe('traductor', () => {
  it('entradas exactas, espacios de los bordes y lo que no está', () => {
    expect(V.idioma()).toBe('en');
    expect(V.t('Guardar')).toBe('Save');
    expect(V.traducirTexto('  Deshacer ')).toBe('  Undo ');
    expect(V.traducirTexto('Texto que no existe')).toBe('Texto que no existe');
    expect(V.idiomaFaltantes()).toContain('Texto que no existe');
    expect(V.traducirTexto('9.81 m/s²')).toBe('9.81 m/s²');
  });
  it('patrones: los huecos se llenan y lo que los llena se traduce si es una entrada', () => {
    expect(V.traducirTexto('Lecturas en t = 0.300 s')).toBe('Readings at t = 0.300 s');
    expect(V.traducirTexto('Elementos orbitales · respecto de Sol')).toBe('Orbital elements · relative to Sun');
    expect(V.traducirTexto('Planeta · elíptica alrededor de Sol')).toBe('Planet · elliptical around Sun');
    expect(V.traducirTexto('Volta · Mecánica · Laboratorio')).toBe('Volta · Mechanics · Laboratory');
    expect(V.traducirTexto('Si no los guardas, se pierden al cambiar de escena.')).toBe("If you don't save them, they will be lost when you change scene.");
    expect(V.t('¿Guardar los cambios de «{0}»?', 'Rampa')).toBe('Save the changes to “Rampa”?');
    expect(V.t('Hace {0} días', 3)).toBe('3 days ago');
  });
  it('las ayudas: la traducción, o el término en inglés si aún no la hay', () => {
    expect([...V.ayuda('Deshacer|Undo|Ctrl Z')]).toEqual(['Undo', '', 'Ctrl Z']);
    expect([...V.ayuda('Una ayuda larga sin traducir|Short term')]).toEqual(['Short term', '', '']);
    expect([...ES.Volta.ayuda('Deshacer|Undo|Ctrl Z')]).toEqual(['Deshacer', 'Undo', 'Ctrl Z']);
  });
  it('en español no cambia nada y los huecos se llenan igual', () => {
    expect(ES.Volta.idioma()).toBe('es');
    expect(ES.Volta.t('Guardar')).toBe('Guardar');
    expect(ES.Volta.t('Hace {0} días', 3)).toBe('Hace 3 días');
    expect(ES.Volta.traducirTexto('Deshacer')).toBe('Deshacer');
  });
  it('el idioma «sistema» sigue al de Windows', () => {
    expect(V.idiomaEfectivo('sistema')).toBe('es');
    expect(V.idiomaEfectivo('en')).toBe('en');
  });
});

describe('diccionario', () => {
  const dic = EN.VOLTA_EN;
  it('cada patrón tiene en inglés los mismos huecos que en español', () => {
    for (const [es, en] of Object.entries(dic)) {
      const h = s => (s.match(/\{\w+\}/g) || []).sort().join(',');
      expect(h(en), es).toBe(h(es));
      expect(en.trim(), es).not.toBe('');
    }
  });
  it('tiene cientos de entradas', () => {
    expect(Object.keys(dic).length).toBeGreaterThan(600);
  });
});

describe('las pantallas en inglés', () => {
  const paginas = readdirSync(proto).filter(f => f.endsWith('.html') && f !== 'guia.html');
  it('las 25 pantallas cargan el diccionario y el idioma en el head, antes de todo lo demás', () => {
    expect(paginas).toHaveLength(25);
    for (const f of paginas) {
      const h = readFileSync(join(proto, f), 'utf8'), cab = h.slice(0, h.indexOf('</head>'));
      expect(cab, f).toContain('<script src="../componentes/idioma-en.js"></script>\n<script src="../componentes/idioma.js"></script>');
    }
  });
  it('el idioma va dentro de la aplicación empaquetada', () => {
    for (const f of ['componentes/idioma.js', 'componentes/idioma-en.js']) expect(incluir(join(raiz, f)), f).toBe(true);
  });
  it('cada texto visible escrito en el HTML tiene traducción', () => {
    const IGNORAR = /^(?:[\d\s.,·×−+\-=()%°/²³⁻¹⁰µμ'’]|[A-Za-z]{1,3}\b|github\.com\S*)+$/;
    const faltan = new Set();
    for (const f of paginas) {
      let h = readFileSync(join(proto, f), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<(code|kbd)>[\s\S]*?<\/\1>/g, '');
      h = h.replace(/&shy;/g, '­').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
      const textos = [...h.matchAll(/>([^<>]+)</g)].map(m => m[1]);
      for (const m of h.matchAll(/(?:aria-label|title|placeholder)="([^"]+)"/g)) textos.push(m[1]);
      for (const x of textos) {
        const s = x.replace(/\s+/g, ' ').trim();
        if (!/[A-Za-zÁÉÍÓÚáéíóúñ]{2}/.test(s) || IGNORAR.test(s)) continue;
        if (!V.traducible(s)) faltan.add(`${f}: ${s}`);
      }
    }
    expect([...faltan]).toEqual([]);
  });
});
