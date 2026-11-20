// Genera tokens.css (y tokens.ts) a partir de tokens.json, la fuente única.
// Uso: node sistema/tokens/construir.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const t = JSON.parse(readFileSync(join(dir, 'tokens.json'), 'utf8'));

// Convierte #RRGGBB en "r g b" para poder escribir rgb(r g b / a).
function rgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(' ');
}

function bloqueColor(tema) {
  const lineas = [];
  for (const [k, v] of Object.entries(t.color[tema])) lineas.push(`  --${k}: ${v};`);
  for (const [k, v] of Object.entries(t.fisica[tema])) {
    lineas.push(`  --f-${k}: ${v};`);
    lineas.push(`  --f-${k}-tinte: rgb(${rgb(v)} / ${t.fisica.tinte});`);
  }
  return lineas.join('\n');
}

function bloqueFijo() {
  const l = [];
  for (const [k, v] of Object.entries(t.tipografia.familias)) l.push(`  --fuente-${k}: ${v};`);
  for (const [k, [tam, alto]] of Object.entries(t.tipografia.escala)) {
    l.push(`  --t-${k}: ${tam}px;`);
    l.push(`  --t-${k}-alto: ${alto}px;`);
  }
  for (const [k, v] of Object.entries(t.tipografia.pesos)) l.push(`  --peso-${k}: ${v};`);
  for (const [k, v] of Object.entries(t.espacio)) l.push(`  --e-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(t.radio)) l.push(`  --r-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(t.control)) l.push(`  --h-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(t.estructura)) l.push(`  --est-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(t.trazo)) l.push(`  --trazo-${k}: ${v};`);
  for (const [k, v] of Object.entries(t.lienzo)) l.push(`  --lz-${k}: ${v};`);
  for (const [k, v] of Object.entries(t.movimiento)) l.push(`  --mov-${k}: ${v};`);
  for (const [k, v] of Object.entries(t.mapas)) l.push(`  --mapa-${k}: ${v};`);
  return l.join('\n');
}

const css = `/* ==========================================================================
   Volta — tokens de diseño
   ARCHIVO GENERADO desde tokens.json con construir.mjs. No editar a mano.
   Temas: sin atributo o data-tema="claro" → claro; data-tema="oscuro" → oscuro;
   data-tema="sistema" → sigue la preferencia del sistema operativo.
   ========================================================================== */

:root {
  color-scheme: light;
${bloqueFijo()}
${bloqueColor('claro')}
}

:root[data-tema="oscuro"] {
  color-scheme: dark;
${bloqueColor('oscuro')}
}

@media (prefers-color-scheme: dark) {
  :root[data-tema="sistema"] {
    color-scheme: dark;
${bloqueColor('oscuro').replace(/^/gm, '  ')}
  }
}
`;
// Acentos y matices (Configuración): atributos data-acento y data-matiz en <html>
function bloquesPreferencias() {
  const nl = '\n';
  const bloque = (sel, pares) => `${sel} {${nl}${pares.map(([k, v]) => `  --${k}: ${v};`).join(nl)}${nl}}`;
  const b = [bloque(':root', [['acento', 'var(--tinta)'], ['sobre-acento', 'var(--sobre-tinta)']])];
  for (const [nombre, c] of Object.entries(t.acentos.colores)) {
    b.push(bloque(`:root[data-acento="${nombre}"]`, [['acento', c.claro], ['sobre-acento', t.acentos.sobre.claro]]));
    b.push(bloque(`:root[data-tema="oscuro"][data-acento="${nombre}"]`, [['acento', c.oscuro], ['sobre-acento', t.acentos.sobre.oscuro]]));
  }
  for (const [nombre, m] of Object.entries(t.matices)) {
    if (nombre.startsWith('$')) continue;
    b.push(bloque(`:root[data-matiz="${nombre}"]`, Object.entries(m.claro)));
    b.push(bloque(`:root[data-tema="oscuro"][data-matiz="${nombre}"]`, Object.entries(m.oscuro)));
  }
  return b.join(nl + nl) + nl;
}

writeFileSync(join(dir, 'tokens.css'), css + '\n' + bloquesPreferencias());

// Versión para TypeScript y para el lienzo (que necesita valores numéricos).
const ts = `// ARCHIVO GENERADO desde tokens.json. No editar a mano.
export const tokens = ${JSON.stringify(t, null, 2)} as const;
`;
writeFileSync(join(dir, 'tokens.ts'), ts);

console.log('tokens.css y tokens.ts generados');
