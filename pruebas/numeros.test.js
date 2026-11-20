// Separador decimal preferido (Ajustes): cómo se escriben y se leen los
// números y cómo sale el CSV con punto o con coma decimal.
import { describe, it, expect, afterEach } from 'vitest';
import { decimalComa, ponerDecimalComa } from '../sistema/nucleo/numeros.js';
import { fmt, cantidad, ESP } from '../sistema/nucleo/formato.js';
import { evaluar } from '../sistema/nucleo/unidades.js';
import { aCSV } from '../sistema/nucleo/csv.js';

afterEach(() => ponerDecimalComa(null));

describe('separador decimal', () => {
  it('por omisión, punto (y sin almacenamiento, como en Node)', () => {
    expect(decimalComa()).toBe(false);
    expect(fmt(1.5)).toBe('1.500');
    expect(evaluar('2,500').valor).toBe(2500);             // coma de miles
    expect(aCSV(['t (s)', 'x (m)'], [[0.5, 1.25]], { bom: false })).toBe('t (s),x (m)\r\n0.5,1.25\r\n');
  });
  it('con coma decimal: se escribe 1,500 y −2,5 × 10⁻⁴', () => {
    ponerDecimalComa(true);
    expect(fmt(1.5)).toBe('1,500');
    expect(fmt(-2.5e-4, 2)).toBe('−2,5 × 10⁻⁴');
    expect(cantidad(9.8, 'm/s²')).toBe(`9,800${ESP}m/s²`);
    expect(fmt(120)).toBe('120,0');
  });
  it('con coma decimal: «2,5» es 2.5, también dentro de unidades y funciones', () => {
    ponerDecimalComa(true);
    expect(evaluar('2,5').valor).toBe(2.5);
    expect(evaluar('2,5 km', { esperada: 'longitud' }).valor).toBe(2500);
    expect(evaluar('sqrt(6,25)').valor).toBe(2.5);
    expect(evaluar('1,5e3').valor).toBe(1500);
  });
  it('con coma decimal, el CSV usa punto y coma entre columnas (Excel en español)', () => {
    ponerDecimalComa(true);
    expect(aCSV(['t (s)', 'nota'], [[0.5, 'a;b']], { bom: false })).toBe('t (s);nota\r\n0,5;"a;b"\r\n');
  });
});
