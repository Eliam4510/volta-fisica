import { describe, it, expect } from 'vitest';
import { BOM, celda, aCSV, muestrear } from '../sistema/nucleo/csv.js';

describe('CSV (RFC 4180)', () => {
  it('escapa comas, comillas y saltos de línea', () => {
    expect(celda('a,b')).toBe('"a,b"');
    expect(celda('dijo "hola"')).toBe('"dijo ""hola"""');
    expect(celda('línea\nnueva')).toBe('"línea\nnueva"');
    expect(celda('sin cambios')).toBe('sin cambios');
  });
  it('escribe los números con toda su precisión y punto decimal', () => {
    expect(celda(0.1 + 0.2)).toBe('0.30000000000000004');
    expect(celda(-2.94)).toBe('-2.94');
    expect(celda(6.674e-11)).toBe('6.674e-11');
  });
  it('deja vacías las celdas sin valor o no finitas', () => {
    expect(celda(null)).toBe('');
    expect(celda(undefined)).toBe('');
    expect(celda(NaN)).toBe('');
    expect(celda(Infinity)).toBe('');
  });
  it('arma el archivo con BOM, encabezados y CRLF', () => {
    const t = aCSV(['t (s)', 'x (m)'], [[0, 1], [0.5, 2.5]]);
    expect(t.startsWith(BOM)).toBe(true);
    expect(t).toBe(`${BOM}t (s),x (m)\r\n0,1\r\n0.5,2.5\r\n`);
    expect(aCSV(['a'], [[1]], { bom: false })).toBe('a\r\n1\r\n');
  });
  it('muestrea incluyendo los dos extremos', () => {
    const f = muestrear(0, 1, 0.25, t => [t]);
    expect(f.map(r => r[0])).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
});
