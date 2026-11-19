import { describe, it, expect } from 'vitest';
import { evaluar, DIM, nombreDimension, factor } from '../sistema/nucleo/unidades.js';

const cerca = (a, b) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(b)));

describe('números con unidad', () => {
  it('convierte a SI', () => {
    cerca(evaluar('72 km/h').valor, 20);
    cerca(evaluar('500 g').valor, 0.5);
    cerca(evaluar('5 cm').valor, 0.05);
    cerca(evaluar('2 µF').valor, 2e-6);
    cerca(evaluar('2 uF').valor, 2e-6);
    cerca(evaluar('1 atm').valor, 101325);
    cerca(evaluar('35°').valor, 35 * Math.PI / 180);
    cerca(evaluar('3 kΩ').valor, 3000);
    cerca(evaluar('1.5 L').valor, 1.5e-3);
  });
  it('reconoce exponentes en volado y en texto', () => {
    expect(evaluar('9.8 m/s²').dim).toEqual(DIM.aceleracion);
    cerca(evaluar('9.8 m/s^2').valor, 9.8);
    cerca(evaluar('1 cm³').valor, 1e-6);
    expect(evaluar('6.674e-11 N·m²/kg²').valor).toBeCloseTo(6.674e-11, 20);
  });
  it('acepta el signo menos verdadero y notación científica', () => {
    cerca(evaluar('−2.94 m/s').valor, -2.94);
    cerca(evaluar('1.6e-19 C').valor, 1.6e-19);
  });
  it('da la dimensión correcta', () => {
    expect(evaluar('72 km/h').dim).toEqual(DIM.velocidad);
    expect(evaluar('3 kN').dim).toEqual(DIM.fuerza);
    expect(evaluar('2 mJ').dim).toEqual(DIM.energia);
    expect(evaluar('1 V/m').dim).toEqual(DIM.campoElectrico);
  });
});

describe('expresiones con variables', () => {
  const variables = { h: { valor: 3, dim: DIM.longitud }, g: { valor: 9.8, dim: DIM.aceleracion } };
  it('evalúa sqrt(2*g*h) como una velocidad', () => {
    const r = evaluar('sqrt(2*g*h)', { variables, esperada: 'velocidad' });
    cerca(r.valor, Math.sqrt(2 * 9.8 * 3));
  });
  it('respeta la precedencia de operadores', () => {
    cerca(evaluar('2 + 3 * 4').valor, 14);
    cerca(evaluar('2^3^1').valor, 8);
    cerca(evaluar('-2^2').valor, -4);
    cerca(evaluar('(1 + 1) * h', { variables }).valor, 6);
  });
  it('multiplicación implícita', () => {
    cerca(evaluar('2*h', { variables }).valor, 6);
    cerca(evaluar('2(3+1)').valor, 8);
  });
  it('tras un número se lee primero la unidad, salvo que la dimensión pida la variable', () => {
    // Sin dimensión esperada, "2 h" son dos horas
    expect(evaluar('2 h', { variables }).dim).toEqual(DIM.tiempo);
    // En un campo de longitud, "2 h" es dos veces la altura h
    cerca(evaluar('2 h', { variables, esperada: 'longitud' }).valor, 6);
    // Con una variable g (gravedad) en la escena, "250 g" en un campo de masa son gramos
    cerca(evaluar('250 g', { variables, esperada: 'masa', unidadPorDefecto: 'kg' }).valor, 0.25);
    // y "2 g" en un campo de aceleración es dos veces la gravedad
    cerca(evaluar('2 g', { variables, esperada: 'aceleracion' }).valor, 19.6);
  });
  it('si ninguna lectura encaja, el error describe la lectura como unidad', () => {
    expect(() => evaluar('250 g', { variables, esperada: 'longitud' })).toThrow('La expresión da una masa y este campo espera una longitud.');
  });
  it('funciones trigonométricas con grados', () => {
    cerca(evaluar('sin(30°)').valor, 0.5);
    cerca(evaluar('cos(pi)').valor, -1);
  });
  it('la variable de la escena tiene prioridad sobre la unidad del mismo nombre', () => {
    // "h" es hora como unidad, pero aquí es la altura de la escena
    expect(evaluar('h', { variables }).dim).toEqual(DIM.longitud);
    expect(evaluar('2 h').dim).toEqual(DIM.tiempo);
  });
});

describe('análisis dimensional y errores', () => {
  it('rechaza dimensiones que no corresponden, con un mensaje útil', () => {
    expect(() => evaluar('3 kg', { esperada: 'longitud' })).toThrow('La expresión da una masa y este campo espera una longitud.');
    expect(() => evaluar('5 s', { esperada: DIM.velocidad })).toThrow(/un tiempo y este campo espera una velocidad/);
  });
  it('no deja sumar magnitudes distintas', () => {
    expect(() => evaluar('3 m + 2 s')).toThrow(/No se pueden sumar una longitud y un tiempo/);
  });
  it('usa la unidad por defecto si el número no trae unidad', () => {
    cerca(evaluar('0.5', { esperada: 'masa', unidadPorDefecto: 'kg' }).valor, 0.5);
    cerca(evaluar('250', { esperada: 'masa', unidadPorDefecto: 'g' }).valor, 0.25);
  });
  it('explica lo que no entiende', () => {
    expect(() => evaluar('')).toThrow(/vacío/);
    expect(() => evaluar('3 furlongs')).toThrow(/No conozco «furlongs»/);
    expect(() => evaluar('(2 + 3')).toThrow(/paréntesis/);
    expect(() => evaluar('sin(3 m)')).toThrow(/sin\(\) necesita un número sin unidad/);
    expect(() => evaluar('2 ^ (1 m)')).toThrow(/exponente/);
    expect(() => evaluar('2 $ 3')).toThrow(/No entiendo/);
  });
  it('rechaza resultados no finitos', () => {
    expect(() => evaluar('1/0')).toThrow(/finito/);
  });
  it('nombra dimensiones sin nombre propio con su fórmula SI', () => {
    expect(nombreDimension([1, 0, -3, 0, 0, 0])).toBe('una cantidad en m·s^-3');
  });
  it('factor() convierte de SI a la unidad del campo', () => {
    cerca(factor('g'), 1e-3);
    expect(() => factor('xx')).toThrow();
  });
});
