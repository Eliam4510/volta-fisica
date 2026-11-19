// Escritura de cantidades según ISO 80000 (docs/04_lenguaje_de_diseno.md, 4.3)
import { describe, it, expect } from 'vitest';
import { ESP, fmt, cantidad, conPrefijo, pasoAgradable, fmtMarca, fmtPaso } from '../sistema/nucleo/formato.js';

describe('fmt: cifras significativas', () => {
  it('usa 4 cifras significativas por defecto', () => {
    expect(fmt(4)).toBe('4.000');
    expect(fmt(2.559)).toBe('2.559');
    expect(fmt(11.57)).toBe('11.57');
    expect(fmt(0.5716)).toBe('0.5716');
  });
  it('escribe el signo menos verdadero (U+2212)', () => {
    expect(fmt(-2.94)).toBe('−2.940');
    expect(fmt(-2.94)).not.toContain('-');
  });
  it('escribe cero como 0', () => {
    expect(fmt(0)).toBe('0');
    expect(fmt(1e-15)).toBe('0');
  });
  it('usa notación científica con potencia volada fuera de [1e-3, 1e5)', () => {
    expect(fmt(6.674e-11, 3)).toBe('6.67 × 10⁻¹¹');
    expect(fmt(123456)).toBe('1.235 × 10⁵');
    expect(fmt(5e-4, 2)).toBe('5.0 × 10⁻⁴');
  });
  it('renormaliza la mantisa cuando el redondeo llega a 10', () => {
    expect(fmt(9.99996e5, 4)).toBe('1.000 × 10⁶');
  });
  it('conserva las cifras significativas cuando el redondeo sube de orden', () => {
    expect(fmt(-0.99999999999, 4)).toBe('−1.000');
    expect(fmt(9.99999, 3)).toBe('10.0');
    expect(fmt(0.099999, 2)).toBe('0.10');
    expect(fmt(99999.7, 4)).toBe('1.000 × 10⁵');
  });
  it('no devuelve NaN ni Infinity', () => {
    expect(fmt(NaN)).toBe('—');
    expect(fmt(Infinity)).toBe('—');
  });
});

describe('cantidad y prefijos SI', () => {
  it('separa número y unidad con espacio fino que no se corta', () => {
    expect(cantidad(4.964, 'm/s')).toBe(`4.964${ESP}m/s`);
    expect(ESP).toBe(' ');
  });
  it('elige el prefijo SI adecuado', () => {
    expect(conPrefijo(12710, 'V')).toBe(`12.71${ESP}kV`);
    expect(conPrefijo(6.355e-3, 'N')).toBe(`6.355${ESP}mN`);
    expect(conPrefijo(2e-6, 'C', 2)).toBe(`2.0${ESP}µC`);
    expect(conPrefijo(-1.5e-9, 'F', 2)).toBe(`−1.5${ESP}nF`);
    expect(conPrefijo(1, 'J')).toBe(`1.000${ESP}J`);
  });
});

describe('marcas de ejes y variables', () => {
  it('pasoAgradable sigue la serie 1-2-5', () => {
    expect(pasoAgradable(0.9)).toBeCloseTo(1);
    expect(pasoAgradable(1.3)).toBeCloseTo(2);
    expect(pasoAgradable(3)).toBeCloseTo(5);
    expect(pasoAgradable(0.13)).toBeCloseTo(0.2);
    expect(pasoAgradable(70)).toBeCloseTo(100);
  });
  it('las marcas llevan los decimales del paso y sin ceros finales', () => {
    expect(fmtMarca(1, 0.5)).toBe('1');
    expect(fmtMarca(1.5, 0.5)).toBe('1.5');
    expect(fmtMarca(0, 0.5)).toBe('0');
    expect(fmtMarca(0.25, 0.25)).toBe('0.25');
    expect(fmtMarca(-2, 2)).toBe('−2');
  });
  it('las variables llevan los decimales de su paso', () => {
    expect(fmtPaso(35, 1)).toBe('35');
    expect(fmtPaso(3, 0.05)).toBe('3.00');
    expect(fmtPaso(0.5, 0.01)).toBe('0.50');
    expect(fmtPaso(9.8, 0)).toBe('10');
  });
});
