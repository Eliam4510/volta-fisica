// Imprime las notas de una versión a partir del CHANGELOG, más la sección de
// descargas. Uso: node herramientas/notas-release.mjs 0.2.0 > notas.md
// Publicar: gh release create v0.2.0 --title "Volta 0.2.0" --notes-file notas.md
import { readFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('Uso: node herramientas/notas-release.mjs <versión, por ejemplo 0.2.0>');
  process.exit(1);
}
const texto = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const inicio = texto.indexOf(`## [${version}]`);
if (inicio < 0) { console.error(`El CHANGELOG no tiene la versión ${version}`); process.exit(1); }
const resto = texto.slice(inicio).split('\n').slice(1).join('\n');
const fin = resto.search(/^## \[|^\[[^\]]+\]: /m);
const cuerpo = (fin < 0 ? resto : resto.slice(0, fin)).trim();

process.stdout.write(`${cuerpo}

### Descargas

- \`Volta_${version}_x64-setup.exe\`: instalador para el usuario actual, sin permisos de administrador.
- \`Volta_${version}_x64_portable.exe\`: ejecutable portátil, sin instalación.

Requiere Windows 10 u 11 con WebView2 (incluido en Windows 11). Los ejecutables los adjunta el flujo de compilación unos minutos después de publicar la release.
`);
