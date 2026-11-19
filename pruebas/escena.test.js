import { describe, it, expect } from 'vitest';
import { crearEscena, serializar, leerEscena, numero, texto, magnitud, FORMATO, VERSION_ESCENA } from '../sistema/nucleo/escena.js';

const base = () => crearEscena({ modulo: 'mecanica', espacio: 'proyectiles', titulo: 'Salto', datos: { h: 3, theta: 35 } });

describe('archivos de escena .volta', () => {
  it('ida y vuelta sin pérdida', () => {
    const e = base();
    expect(leerEscena(serializar(e))).toEqual(e);
    expect(e.formato).toBe(FORMATO);
    expect(e.version).toBe(VERSION_ESCENA);
  });
  it('acepta el BOM de UTF-8', () => {
    expect(leerEscena('﻿' + serializar(base())).titulo).toBe('Salto');
  });
  it('rechaza lo que no es JSON con un mensaje claro', () => {
    expect(() => leerEscena('hola')).toThrow(/no es una escena de Volta/);
  });
  it('rechaza JSON sin la cabecera de Volta', () => {
    expect(() => leerEscena('{"a":1}')).toThrow(/cabecera/);
  });
  it('rechaza versiones futuras pidiendo actualizar', () => {
    const e = { ...base(), version: VERSION_ESCENA + 1 };
    expect(() => leerEscena(JSON.stringify(e))).toThrow(/Actualiza Volta/);
  });
  it('rechaza escenas de otro módulo', () => {
    expect(() => leerEscena(serializar(base()), { modulo: 'optica' })).toThrow(/módulo «mecanica»/);
  });
  it('el mensaje de otro módulo no lleva marcado del archivo', () => {
    const e = { ...base(), modulo: '<img src=x onerror=alert(1)>' };
    expect(() => leerEscena(JSON.stringify(e), { modulo: 'optica' })).toThrow(/módulo «img src=x onerror=alert\(1\)»/);
  });
  it('rechaza escenas sin datos', () => {
    const e = { ...base(), datos: null };
    expect(() => leerEscena(JSON.stringify(e))).toThrow(/incompleta/);
  });
  it('numero() acota y sustituye valores inválidos', () => {
    expect(numero(5, 1, 0, 3)).toBe(3);
    expect(numero('x', 1)).toBe(1);
    expect(numero(NaN, 2)).toBe(2);
    expect(numero(-1, 0, 0)).toBe(0);
  });
});

describe('saneado de los datos de una escena', () => {
  it('texto quita lo que abriría marcado y recorta', () => {
    expect(texto('Carga <img src=x onerror=alert(1)>', 'X', 40)).toBe('Carga img src=x onerror=alert(1)');
    expect(texto("a\"b'c`d&e", 'X')).toBe('abcde');
    expect(texto('  ', 'X')).toBe('X');
    expect(texto(42, 'X')).toBe('X');
    expect(texto('Partícula', 'X')).toBe('Partícula');
    expect(texto('x'.repeat(40), 'X')).toHaveLength(24);
  });
  it('magnitud acepta números finitos acotados', () => {
    expect(magnitud(2.5, [], 0)).toBe(2.5);
    expect(magnitud(1e9, [], 0, -10, 10)).toBe(10);
    expect(magnitud(NaN, [], 7)).toBe(7);
    expect(magnitud('3', [], 7)).toBe(7);
  });
  it('magnitud acepta ligaduras solo a variables conocidas', () => {
    expect(magnitud({ v: 'a', f: -1 }, ['a', 'q'], 0)).toEqual({ v: 'a', f: -1 });
    expect(magnitud({ v: 'z', f: 1 }, ['a'], 0)).toBe(0);
    expect(magnitud({ v: 'a', f: Infinity }, ['a'], 0)).toBe(0);
    expect(magnitud({ v: 'a', f: 1, extra: '<b>' }, ['a'], 0)).toEqual({ v: 'a', f: 1 });
  });
});
