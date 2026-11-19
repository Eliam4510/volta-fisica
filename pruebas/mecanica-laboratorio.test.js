// Laboratorio de Mecánica: formato de escena, traducción al motor, fuerzas
// en vivo, nombres de eventos y escenarios incluidos (lógica pura de
// sistema/prototipos/mecanica-laboratorio.js).
import { describe, it, expect } from 'vitest';
import {
  cosd, sind, normalizarEscena, escenaVacia, escenaDeEscenario, ESCENARIOS, aMotor, huecoSuperficie, proyectarSobre,
  describirEvento, lugarDelEvento, fuerzasEn, conArticulo, nuevoId, nuevoNombre, tramoEn, contactosDe, HOLGURA_UNION, deslizarSobre,
} from '../sistema/prototipos/mecanica-laboratorio.js';
import { simularMecanica, estadoMecanica, energiaMecanica } from '../sistema/motores/mecanica.js';

const g = 9.8;
const cerca = (a, b, tol) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
const simular = esc => { const M = aMotor(esc); return { M, sim: simularMecanica(M.motor) }; };
const evento = (sim, M, texto) => sim.eventos.find(e => describirEvento(e, M).includes(texto));

describe('ángulos exactos', () => {
  it('cos y sen en grados son exactos en los múltiplos de 90°', () => {
    expect([cosd(-90), sind(-90), cosd(180), sind(180), cosd(90), sind(360)]).toEqual([0, -1, -1, 0, 0, 0]);
    cerca(cosd(30), Math.sqrt(3) / 2, 1e-15);
  });
});

describe('escena del laboratorio', () => {
  it('normalizar acota números, descarta lo desconocido y quita marcado de los nombres', () => {
    const e = normalizarEscena({
      titulo: '<b>Mi escena</b>', g: -5, duracion: 1e9, eParticulas: 3,
      objetos: [
        { id: 'p1', tipo: 'particula', nombre: '<img src=x onerror=alert(1)>', m: -2, x: 1, y: 2, v: 3, ang: 30, radio: -1 },
        { id: 'p1', tipo: 'particula', nombre: 'Duplicada', m: 1, x: 0, y: 0 },
        { id: 's1', tipo: 'superficie', forma: 'suelo', a: [0, 0], b: [0, 0] },
        { id: 's2', tipo: 'superficie', forma: 'arco', c: [0, 0], r: 1, a0: 0, a1: 900, cara: 'rara' },
        { id: 'c1', tipo: 'cuerda', a: 'p1', b: 'p9', L: 1 },
        { id: 'c2', tipo: 'resorte', a: 'p1', ancla: [0, 1], k: 10, L0: 0.5 },
        { id: 'x1', tipo: 'misil' },
        { id: 'p2', tipo: 'particula', m: 1, x: 0, y: 0, sobre: 's1' },
      ],
    });
    expect(e.titulo).toBe('bMi escena/b');
    expect(e.g).toBe(0); expect(e.duracion).toBe(120); expect(e.eParticulas).toBe(1);
    expect(e.objetos.map(o => o.id)).toEqual(['p1', 's2', 'c2', 'p2']);
    const p = e.objetos[0];
    expect(p.nombre).not.toMatch(/[<>"']/);
    expect(p.m).toBeGreaterThan(0); expect(p.radio).toBe(0);
    expect(e.objetos[1].a1 - e.objetos[1].a0).toBe(360);
    expect(e.objetos[1].cara).toBe('exterior');
    expect(e.objetos[3].sobre).toBeNull();          // el suelo degenerado no existe
  });

  it('cada escenario sobrevive a guardar y abrir sin cambios', () => {
    for (const s of ESCENARIOS) {
      const e = escenaDeEscenario(s.id);
      expect(normalizarEscena(JSON.parse(JSON.stringify(e)))).toEqual(e);
    }
    expect(escenaDeEscenario('no-existe')).toBeNull();
  });

  it('ids y nombres nuevos no se repiten', () => {
    const e = escenaDeEscenario('atwood');
    expect(nuevoId(e, 'p')).toBe('p3');
    expect(nuevoNombre(e, 'particula')).toBe('C');
    expect(nuevoNombre(e, 'suelo')).toBe('Suelo 2');
    expect(nuevoNombre(escenaVacia(), 'cuerda')).toBe('Cuerda');
  });
});

describe('traducción al motor', () => {
  it('una partícula apoyada queda exactamente sobre su superficie (también un disco en un arco)', () => {
    const plano = { id: 's1', tipo: 'superficie', forma: 'plano', a: [0, 1.5], b: [1.5 * Math.sqrt(3), 0] };
    const q = proyectarSobre(plano, [1, 1.2], 0.1);
    cerca(huecoSuperficie(plano, q, 0.1).C, 0, 1e-15);
    const cuenco = { id: 's2', tipo: 'superficie', forma: 'arco', c: [0, 1], r: 1, a0: 180, a1: 360, cara: 'interior' };
    const r = proyectarSobre(cuenco, [0.3, 0.2], 0.1);
    cerca(Math.hypot(r[0], r[1] - 1), 0.9, 1e-15);
  });

  it('la cuerda que no alcanza se avisa y se alarga; la varilla mide la distancia entre extremos', () => {
    const e = normalizarEscena({ objetos: [
      { id: 'p1', tipo: 'particula', m: 1, x: 3, y: 4 },
      { id: 'c1', tipo: 'cuerda', a: 'p1', ancla: [0, 0], L: 2 },
      { id: 'c2', tipo: 'varilla', a: 'p1', ancla: [0, 0], L: 7 },
    ] });
    const M = aMotor(e);
    expect(M.avisos.length).toBe(1);
    expect(M.motor.conectores.map(c => c.L)).toEqual([5, 5]);
  });

  it('la gravedad apunta según su dirección y la unión es una cuerda corta entre los discos', () => {
    const e = escenaDeEscenario('mext-2015-p3'), M = aMotor(e);
    expect(M.motor.g).toEqual([0, -g]);
    const u = M.motor.conectores.find(c => c.id === 'c2');
    expect(u.tipo).toBe('cuerda');
    cerca(u.L, 0.15 + HOLGURA_UNION, 1e-12);
  });
});

describe('escenarios', () => {
  it('todos se simulan completos', () => {
    for (const s of ESCENARIOS) {
      const { sim } = simular(escenaDeEscenario(s.id));
      expect(sim.incompleta ?? null, s.id).toBeNull();
    }
  });

  it('tutorial del plano: arranca apoyado y baja con a = g(sen θ − μ cos θ)', () => {
    const { sim, M } = simular(escenaDeEscenario('plano'));
    expect(sim.eventos[0].t).toBeGreaterThan(1);
    const a = g * (sind(30) - 0.2 * cosd(30)), s0 = estadoMecanica(sim, 0)[0], s = estadoMecanica(sim, 0.8)[0];
    cerca(Math.hypot(s.x - s0.x, s.y - s0.y), a * 0.8 * 0.8 / 2, 1e-7);
    const f = fuerzasEn(sim, M, 0.5).porParticula[0];
    cerca(f.find(x => x.tipo === 'normal').valor, g * cosd(30), 1e-6);
    cerca(f.find(x => x.tipo === 'friccion').valor, 0.2 * g * cosd(30), 1e-6);
  });

  it('Atwood: a = g(m₁ − m₂)/(m₁ + m₂) y T = 2m₁m₂g/(m₁ + m₂)', () => {
    const { sim, M } = simular(escenaDeEscenario('atwood'));
    cerca(estadoMecanica(sim, 0.5)[0].y, -1.5 - (g / 3) * 0.25 / 2, 1e-8);
    // B sube sin llegar a la polea (ni siquiera tras la cuerda floja)
    for (let t = 0; t <= 2; t += 0.01) expect(estadoMecanica(sim, t)[1].y).toBeLessThan(-0.2);
    const f = fuerzasEn(sim, M, 0.4);
    cerca(f.tensiones.c1, 2 * 2 * 1 * g / 3, 1e-6);
    expect(evento(sim, M, 'A choca con el suelo')).toBeTruthy();
  });

  it('péndulo: la tensión en vivo es m(g cos θ + v²/L)', () => {
    const { sim, M } = simular(escenaDeEscenario('pendulo'));
    for (const t of [0.3, 0.9, 1.7]) {
      const s = estadoMecanica(sim, t)[0], cos = -s.y / Math.hypot(s.x, s.y), v2 = s.vx * s.vx + s.vy * s.vy;
      cerca(fuerzasEn(sim, M, t).tensiones.c1, 0.2 * (g * cos + v2 / 1), 1e-6);
    }
  });

  it('MEXT 2017 P3: la bola deja el hemisferio en cos θ = 2/3 + v₀²/(3gR)', () => {
    const { sim, M } = simular(escenaDeEscenario('mext-2017-p3'));
    const d = evento(sim, M, 'se despega del hemisferio');
    expect(d).toBeTruthy();
    cerca(lugarDelEvento(d, M)[1], 2 / 3 + 0.02 ** 2 / (3 * g), 1e-7);
  });

  it('MEXT 2014 P3: soltada a la izquierda del clavo, la cuerda se afloja en y = −a/6 (igual que desde la derecha)', () => {
    const izq = simular(escenaDeEscenario('mext-2014-p3'));
    // Sin enganche falso en t = 0: el primer evento es tocar el clavo en el punto más bajo
    const primero = izq.sim.eventos[0];
    expect(describirEvento(primero, izq.M)).toBe('La cuerda toca el clavo');
    cerca(lugarDelEvento(primero, izq.M)[1], -1, 1e-9);
    const floja = evento(izq.sim, izq.M, 'Se afloja');
    cerca(lugarDelEvento(floja, izq.M)[1], -1 / 6, 1e-6);
    // Simetría: la misma escena reflejada da los mismos instantes
    const e = escenaDeEscenario('mext-2014-p3'); e.objetos[0].x = 1;
    const der = simular(e);
    expect(der.sim.eventos.length).toBe(izq.sim.eventos.length);
    der.sim.eventos.forEach((ev, k) => cerca(ev.t, izq.sim.eventos[k].t, 1e-9));
  });

  it('MEXT 2009 P3: la cuerda se afloja con θ = 60° sobre la horizontal', () => {
    const { sim, M } = simular(escenaDeEscenario('mext-2009-p3'));
    const f = evento(sim, M, 'Se afloja');
    cerca(lugarDelEvento(f, M)[1], Math.sqrt(3) / 2, 1e-7);
  });

  it('MEXT 2015 P3: quedan pegados, pierden Mm v²/(2(M + m)) y el resorte llega a su largo natural arriba', () => {
    const { sim, M } = simular(escenaDeEscenario('mext-2015-p3'));
    const mM = 1, m = 0.5, k = 50;
    const choque = sim.eventos[0];
    // Rapidez de la bola justo antes del choque, de la conservación de la energía
    const V = g * Math.sqrt(mM * (mM + 2 * m) / (k * (mM + m))), vb = V * (mM + m) / m;
    cerca(choque.perdida, mM * m * vb * vb / (2 * (mM + m)), 1e-6);
    expect(evento(sim, M, 'Se unen')).toBeTruthy();
    let ymax = -Infinity;
    for (let t = 0.1; t < 3; t += 0.002) ymax = Math.max(ymax, estadoMecanica(sim, t)[0].y);
    cerca(ymax, -0.5, 1e-5);
  });

  it('MEXT 2027 P2: el choque oblicuo en el origen conserva el momento', () => {
    const { sim, M } = simular(escenaDeEscenario('mext-2027-p2'));
    const c = evento(sim, M, 'Choque entre A y B');
    cerca(c.t, 0.5, 1e-9);
    const p = lugarDelEvento(c, M);
    cerca(p[0], 0, 1e-9); cerca(p[1], 0, 1e-9);
    const [A, B] = estadoMecanica(sim, 1.2);
    cerca(A.vx * 1 + B.vx * 2, 2, 1e-12);
    cerca(A.vy * 1 + B.vy * 2, 0, 1e-12);
    expect(energiaMecanica(sim, 1.2).E).toBeLessThan(energiaMecanica(sim, 0).E);
  });
});

describe('textos', () => {
  it('artículos y contracciones en los eventos', () => {
    expect(conArticulo('Suelo 2')).toBe('el suelo 2');
    expect(conArticulo('A')).toBe('A');
    // Al pie del plano, salir del borde y tocar el suelo ocurren en el mismo
    // instante; su orden depende del paso, así que se buscan por su clave
    const { sim, M } = simular(escenaDeEscenario('plano'));
    const fin = sim.eventos.find(e => e.clave.startsWith('fin:'));
    const choque = sim.eventos.find(e => e.clave.startsWith('impacto:'));
    expect(describirEvento(fin, M)).toBe('El bloque sale por el borde del plano');
    expect(describirEvento(choque, M)).toBe('El bloque choca con el suelo y queda en contacto');
    cerca(fin.t, choque.t, 1e-12);
    expect(describirEvento({ clave: 'despegue:0:1', nombre: 'Se despega' }, M)).toBe('El bloque se despega del suelo');
  });

  it('contactos en el formato del motor', () => {
    const { sim } = simular(escenaDeEscenario('resorte'));
    expect(contactosDe(tramoEn(sim, 1).modo)).toEqual([{ i: 0, sup: 0, pegado: false }]);
  });
});

describe('apoyos', () => {
  it('una partícula apoyada se desliza por su superficie al cambiar una coordenada', () => {
    const arco = { forma: 'arco', c: [0, 0], r: 1, a0: 0, a1: 180, cara: 'exterior' };
    const q = deslizarSobre(arco, [0, 1], 0, 0.6, 0);
    cerca(q[0], 0.6, 1e-15); cerca(q[1], 0.8, 1e-15);
    expect(deslizarSobre(arco, [0, 1], 0, 1.5, 0)).toBeNull();
    const plano = { forma: 'plano', a: [0, 1], b: [Math.sqrt(3), 0] };
    const p = deslizarSobre(plano, [0, 1], 0, Math.sqrt(3) / 2, 0.1);
    cerca(huecoSuperficie(plano, p, 0.1).C, 0, 1e-15);
    expect(deslizarSobre({ forma: 'pared', a: [0, 0], b: [0, 2] }, [0, 1], 0, 0.5, 0)).toBeNull();
  });
});
