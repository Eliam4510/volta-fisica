// Escenas de Termodinámica (los cuatro espacios): cada escena simula sin
// errores y cada escena MEXT da la respuesta del examen. Las respuestas que
// comprueba esta prueba son las mismas filas que la pantalla muestra en
// «Examen»: el valor medido en la simulación y el del enunciado (fórmula del
// examen con los valores de la escena), con su tolerancia. Las escenas son
// reconstrucciones propias de cada situación (DECISIONES.md, 2).
import { describe, it, expect } from 'vitest';
import {
  ESCENAS, ESCENAS_LAB, ESCENAS_CICLOS, ESCENAS_MOLECULAR, ESCENAS_CALOR, PAGINAS,
  simularEscena, examenDe, valores, guionDe, escenaPorClave,
} from '../sistema/prototipos/termodinamica-escenas.js';

const cerca = (a, b, tol) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));

describe('catálogo', () => {
  it('claves únicas, cuatro espacios con su página y los tres tipos en cada uno', () => {
    const claves = ESCENAS.map(e => e.clave);
    expect(new Set(claves).size).toBe(claves.length);
    for (const lista of [ESCENAS_LAB, ESCENAS_CICLOS, ESCENAS_MOLECULAR, ESCENAS_CALOR]) {
      expect(PAGINAS[lista[0].espacio]).toMatch(/^termodinamica.*\.html$/);
      for (const tipo of ['Tutorial', 'Ejemplo', 'MEXT']) expect(lista.some(e => e.tipo === tipo), `${lista[0].espacio}: ${tipo}`).toBe(true);
    }
    // Las variables de cada escena tienen su valor dentro del rango
    for (const e of ESCENAS) for (const [k, d] of Object.entries(e.variables || {})) {
      expect(d.val, `${e.clave}.${k}`).toBeGreaterThanOrEqual(d.min); expect(d.val, `${e.clave}.${k}`).toBeLessThanOrEqual(d.max);
    }
  });

  it('las escenas MEXT llevan año y apartados, y cubren los temas T1–T6', () => {
    const mext = ESCENAS.filter(e => e.tipo === 'MEXT');
    expect(mext.length).toBeGreaterThanOrEqual(30);
    for (const e of mext) { expect(e.anio, e.clave).toMatch(/^20\d\d /); expect(typeof e.examen, e.clave).toBe('function'); }
    for (const anio of ['2020 P4', '2014 1-(3)', '2008 1-(3)', '2019 P4', '2015 P4', '2018 P4', '2017 P4', '2014 P4', '2016 P4', '2013 P4', '2012 P4', '2009 P4', '2008 P4', '2007 P4', '2010 2-A', '2010 2-C']) {
      expect(mext.some(e => e.anio === anio), anio).toBe(true);
    }
  });

  it('se mantiene la escena MEXT 2019 P4 del Laboratorio de gases con sus variables', () => {
    const e = escenaPorClave('mext-2019-p4');
    expect(e.espacio).toBe('laboratorio-de-gases');
    expect(Object.keys(e.variables)).toEqual(['n', 'm', 'M', 'A', 'P0', 'T0', 'Fc', 'G', 'b', 'g']);
  });
});

describe('cada escena simula sin errores y de forma determinista', () => {
  for (const e of ESCENAS.filter(x => x.tipo !== 'MEXT')) {
    it(`${e.espacio} · ${e.clave}`, () => {
      const sim = simularEscena(e), otra = simularEscena(e);
      expect(sim.incompleta ?? null).toBeNull();
      if (e.espacio === 'molecular') {
        // Comparar los Float32Array con toEqual es lento: se comparan sus bytes
        const igual = (a, b) => Buffer.from(a.buffer).equals(Buffer.from(b.buffer));
        expect(igual(sim.pos, otra.pos) && igual(sim.vel, otra.vel)).toBe(true);
        expect(otra.medidas).toEqual(sim.medidas);
      } else expect(otra).toEqual(sim);
      // El guion de la escena no se comparte entre llamadas
      const g = guionDe(e, valores(e));
      if (g.length) { g[0].t = -99; expect(guionDe(e, valores(e))[0].t).not.toBe(-99); }
    });
  }
});

describe('respuestas del examen', () => {
  for (const e of ESCENAS.filter(x => x.tipo === 'MEXT')) {
    it(`MEXT ${e.anio} · ${e.titulo}`, () => {
      const v = valores(e), sim = simularEscena(e, v), filas = examenDe(e, sim, v);
      expect(sim.incompleta ?? null).toBeNull();
      expect(filas.length).toBeGreaterThan(0);
      for (const f of filas) {
        expect(Number.isFinite(f.valor), `${f.n} ${f.formula}`).toBe(true);
        cerca(f.valor, f.esperado, f.tol ?? 1e-3);
        expect(f.t ?? 0).toBeLessThanOrEqual(sim.duracion ?? Infinity);
      }
    });
  }

  it('MEXT 2009 P4 con nitrógeno: c_v/R = 5/2 (mayor que la del argón) y c_p − c_v = R (igual)', () => {
    const e = escenaPorClave('mext-2009-p4'), v = { f: 5 }, filas = examenDe(e, simularEscena(e, v), v);
    expect(filas.map(f => f.n)).toEqual(['(3)', '(4)']);
    for (const f of filas) cerca(f.valor, f.esperado, 1e-12);
  });

  it('las respuestas siguen a las variables: 2016 P4 con otra presión y temperatura', () => {
    const e = escenaPorClave('mext-2016-p4'), v = { P: 150, T: 250, V: 5 };
    const filas = examenDe(e, simularEscena(e, v), v);
    cerca(filas.find(f => f.n === '(4)').valor, 450, 1e-5);
    cerca(filas.find(f => f.n === '(5)').valor, 225, 1e-5);
  });
});
