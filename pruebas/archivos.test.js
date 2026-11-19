// Recientes de Inicio: el autoguardado de cada pantalla registra lo último
// que se trabajó en ella (una entrada por pantalla, la más nueva primero).
import { describe, it, expect, beforeEach } from 'vitest';
import { autoguardado, recientes } from '../sistema/componentes/archivos.js';
import { crearEscena } from '../sistema/nucleo/escena.js';

beforeEach(() => {
  const datos = new Map();
  globalThis.localStorage = {
    getItem: k => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => { datos.set(k, String(v)); },
    removeItem: k => { datos.delete(k); },
  };
});

describe('recientes', () => {
  it('sin nada guardado, la lista está vacía', () => {
    expect(recientes()).toEqual([]);
  });

  it('guardar y recuperar registran la pantalla, una vez, la más nueva primero', () => {
    const a = crearEscena({ modulo: 'mecanica', espacio: 'laboratorio', titulo: 'Péndulo', datos: {} });
    const b = crearEscena({ modulo: 'optica', espacio: 'geometrica', titulo: 'Prisma', datos: {} });
    autoguardado.guardar('mecanica-laboratorio', a);
    autoguardado.guardar('optica', b);
    autoguardado.guardar('mecanica-laboratorio', a);
    expect(recientes().map(r => r.clave)).toEqual(['mecanica-laboratorio', 'optica']);
    // Abrir una pantalla y recuperar su autoguardado la sube al principio
    expect(autoguardado.leer('optica', { modulo: 'optica' }).titulo).toBe('Prisma');
    expect(recientes().map(r => r.clave)).toEqual(['optica', 'mecanica-laboratorio']);
    expect(recientes()[0]).toMatchObject({ modulo: 'optica', espacio: 'geometrica', titulo: 'Prisma' });
  });

  it('guarda como mucho 8 y descarta entradas manipuladas', () => {
    for (let k = 0; k < 12; k++) autoguardado.guardar(`pantalla-${'abcdefghijkl'[k]}`, crearEscena({ modulo: 'ondas', titulo: 'x', datos: {} }));
    expect(recientes()).toHaveLength(8);
    localStorage.setItem('volta.recientes', JSON.stringify([{ clave: '../../x', modulo: 'm', t: 1 }, { clave: 'ok', modulo: 'ondas', t: 2 }, 'basura']));
    expect(recientes().map(r => r.clave)).toEqual(['ok']);
    localStorage.setItem('volta.recientes', 'no es JSON');
    expect(recientes()).toEqual([]);
  });
});
