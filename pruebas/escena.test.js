import { describe, it, expect } from 'vitest';
import { crearEscena, serializar, leerEscena, numero, FORMATO, VERSION_ESCENA } from '../sistema/nucleo/escena.js';

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
