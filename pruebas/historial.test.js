import { describe, it, expect } from 'vitest';
import { Historial } from '../sistema/nucleo/historial.js';

describe('Historial (deshacer y rehacer)', () => {
  it('deshace y rehace en orden', () => {
    const h = new Historial({ h: 3 });
    h.registrar({ h: 4 }); h.registrar({ h: 5 });
    expect(h.deshacer()).toEqual({ h: 4 });
    expect(h.deshacer()).toEqual({ h: 3 });
    expect(h.deshacer()).toBeNull();
    expect(h.rehacer()).toEqual({ h: 4 });
    expect(h.rehacer()).toEqual({ h: 5 });
    expect(h.rehacer()).toBeNull();
  });
  it('no registra estados repetidos', () => {
    const h = new Historial({ a: 1 });
    expect(h.registrar({ a: 1 })).toBe(false);
    expect(h.puedeDeshacer).toBe(false);
  });
  it('un cambio después de deshacer descarta la rama rehacible', () => {
    const h = new Historial(1);
    h.registrar(2); h.registrar(3);
    h.deshacer();
    h.registrar(9);
    expect(h.puedeRehacer).toBe(false);
    expect(h.deshacer()).toBe(2);
  });
  it('respeta el límite de pasos', () => {
    const h = new Historial(0, 3);
    for (let i = 1; i <= 10; i++) h.registrar(i);
    let n = 0; while (h.deshacer() !== null) n++;
    expect(n).toBe(3);
    expect(h.actual()).toBe(7);
  });
  it('devuelve copias: modificar lo devuelto no altera el historial', () => {
    const h = new Historial({ v: [1, 2] });
    h.registrar({ v: [3] });
    const a = h.deshacer(); a.v.push(99);
    expect(h.actual()).toEqual({ v: [1, 2] });
  });
  it('reiniciar parte de cero', () => {
    const h = new Historial(1); h.registrar(2);
    h.reiniciar(5);
    expect(h.puedeDeshacer).toBe(false);
    expect(h.actual()).toBe(5);
  });
});
