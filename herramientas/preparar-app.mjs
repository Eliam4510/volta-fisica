// Copia la interfaz de sistema/ a dist/ sin las herramientas de desarrollo
// (guía del lenguaje de diseño, catálogo y fuentes de los iconos, generadores
// de tokens). Tauri empaqueta dist/: el ejecutable solo lleva la aplicación.
// Uso: node herramientas/preparar-app.mjs (lo llama tauri build y tauri dev).
import { cpSync, rmSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const raiz = join(import.meta.dirname, '..');
const origen = join(raiz, 'sistema'), destino = join(raiz, 'dist');

/** Rutas (relativas a sistema/, con «/») que no van en la aplicación. */
export const EXCLUIR = [
  'prototipos/guia.html', 'prototipos/guia.js',
  'iconos/catalogo.html', 'iconos/construir.mjs', 'iconos/svg', 'iconos/fuente',
  'tokens/construir.mjs', 'tokens/tokens.json', 'tokens/tokens.ts',
  'marca/icono-app-1024.png',
];

/** ¿Va esta ruta (absoluta) en la aplicación? @param {string} ruta */
export function incluir(ruta) {
  const rel = relative(origen, ruta).split(sep).join('/');
  if (!rel) return true;
  if (/\.(md|mjs|ts|map)$/i.test(rel) && !rel.endsWith('.js')) return false;
  return !EXCLUIR.some(x => rel === x || rel.startsWith(x + '/'));
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('preparar-app.mjs')) {
  if (existsSync(destino)) rmSync(destino, { recursive: true, force: true });
  cpSync(origen, destino, { recursive: true, filter: incluir });
  console.log('Interfaz preparada en dist/ (sin herramientas de desarrollo).');
}
