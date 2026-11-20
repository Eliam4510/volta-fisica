// Laboratorio de Mecánica: formato de escena, traducción al motor, fuerzas
// en vivo, nombres de eventos y escenarios incluidos (lógica pura de
// sistema/prototipos/mecanica-laboratorio.js).
import { describe, it, expect } from 'vitest';
import {
  cosd, sind, normalizarEscena, escenaVacia, escenaDeEscenario, ESCENARIOS, aMotor, huecoSuperficie, proyectarSobre,
  describirEvento, lugarDelEvento, fuerzasEn, conArticulo, nuevoId, nuevoNombre, tramoEn, contactosDe, HOLGURA_UNION, deslizarSobre, pasosFotopuerta, INSTRUMENTOS,
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

  it('las notas de los escenarios no pierden caracteres al normalizarse (tan θ > μs)', () => {
    for (const s of ESCENARIOS) if (s.nota) expect(escenaDeEscenario(s.id).nota, s.id).toEqual(s.nota);
    expect(escenaDeEscenario('plano').nota[0]).toContain('tan θ > μs');
    // Una nota hostil se conserva como texto (se muestra escapada), sin caracteres de control
    const n = normalizarEscena({ ...escenaVacia(), nota: ['<img src=x onerror=alert(1)>\u0007 fin', 7] }).nota;
    expect(n).toEqual(['<img src=x onerror=alert(1)> fin']);
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

describe('fuerza aplicada', () => {
  it('llega al motor con su dirección y se sanea al abrir', () => {
    const esc = escenaDeEscenario('caida');
    const p = esc.objetos.find(o => o.tipo === 'particula');
    p.F = 5; p.angF = 90;
    const M = aMotor(esc), F = M.motor.particulas[0].F;
    expect(F[0]).toBeCloseTo(0, 12);
    expect(F[1]).toBeCloseTo(5, 12);
    // Sin fuerza, el motor no recibe F
    p.F = 0;
    expect(aMotor(esc).motor.particulas[0].F).toBeUndefined();
    // Un archivo con una fuerza inválida se acota
    const raro = normalizarEscena({ ...esc, objetos: esc.objetos.map(o => (o.tipo === 'particula' ? { ...o, F: -3, angF: 'x' } : o)) });
    const q = raro.objetos.find(o => o.tipo === 'particula');
    expect(q.F).toBe(0);
    expect(q.angF).toBe(0);
  });
  it('fuerzasEn la cuenta como fuerza conocida: la normal no la absorbe', () => {
    // Bloque sobre el suelo empujado hacia abajo con 10 N: N = m·g + 10
    const esc = escenaDeEscenario('resorte');
    const p = esc.objetos.find(o => o.tipo === 'particula');
    p.F = 10; p.angF = -90;
    const M = aMotor(esc), sim = simularMecanica(M.motor);
    const f = fuerzasEn(sim, M, 0.3).porParticula[0];
    const N = f.find(x => x.tipo === 'normal');
    expect(N.valor).toBeCloseTo(p.m * 9.8 + 10, 6);
    expect(f.find(x => x.tipo === 'aplicada').valor).toBeCloseTo(10, 12);
  });
});

describe('instrumentos: regla y fotopuerta', () => {
  const conInstrumentos = () => normalizarEscena({
    ...escenaVacia(), duracion: 1.5,
    objetos: [
      { id: 'p1', tipo: 'particula', nombre: 'Bola', m: 1, x: 0, y: 1, v: 4, ang: 0, radio: 0 },
      { id: 'n1', tipo: 'fotopuerta', nombre: 'Fotopuerta', a: [2, -1], b: [2, 2] },
      { id: 'n2', tipo: 'regla', nombre: 'Regla', a: [0, 0], b: [3, 4] },
      { id: 'n3', tipo: 'regla', nombre: 'Degenerada', a: [1, 1], b: [1, 1] },
    ],
  });
  it('se guardan y abren sin cambios, pero no llegan al motor', () => {
    const e = conInstrumentos();
    expect(e.objetos.map(o => o.id)).toEqual(['p1', 'n1', 'n2']);     // la regla sin largo se descarta
    expect(normalizarEscena(JSON.parse(JSON.stringify(e)))).toEqual(e);
    const M = aMotor(e);
    expect(M.motor.particulas).toHaveLength(1);
    expect(M.motor.superficies).toEqual([]);
    expect(M.motor.conectores).toEqual([]);
    expect(INSTRUMENTOS).toEqual(['regla', 'fotopuerta']);
  });
  it('la fotopuerta anota el instante y la rapidez exactos del paso (tiro horizontal)', () => {
    const e = conInstrumentos(), M = aMotor(e), sim = simularMecanica(M.motor);
    const pasos = pasosFotopuerta(sim, M, e.objetos[1]);
    expect(pasos).toHaveLength(1);
    // x = 4t → cruza x = 2 en t = 0.5; vy = −g·t
    cerca(pasos[0].t, 0.5, 1e-10);
    cerca(pasos[0].v[0], 4, 1e-9); cerca(pasos[0].v[1], -g * 0.5, 1e-9);
    // Fuera del haz (la bola pasa por debajo de un haz corto) no cuenta
    expect(pasosFotopuerta(sim, M, { a: [2, 1.5], b: [2, 3] })).toEqual([]);
  });
});

describe('variables de la escena', () => {
  it('se normalizan: solo propiedades conocidas de objetos que existen, valores dentro del rango', () => {
    const e = normalizarEscena({
      ...escenaVacia(),
      objetos: [{ id: 'p1', tipo: 'particula', nombre: 'P', m: 1, x: 0, y: 1, v: 2, ang: 0, radio: 0 }],
      variables: [
        { sim: 'v', tipo: 'velocidad', min: 0, max: 10, paso: 0.1, val: 99, liga: [['p1', 'v'], ['p9', 'v'], ['p1', 'innerHTML']] },
        { sim: '<b>', tipo: 'masa', min: 1, max: 2, val: 1.5, liga: [['p1', 'm']] },
        { sim: 'x', tipo: 'desconocido', min: 0, max: 1, liga: [['p1', 'x']] },
        { sim: 'y', tipo: 'longitud', min: 0, max: 1, liga: [] },
      ],
    });
    expect(e.variables).toHaveLength(2);
    expect(e.variables[0]).toMatchObject({ sim: 'v', val: 10, liga: [['p1', 'v']] });
    expect(e.variables[1].sim).toBe('b');
    expect(normalizarEscena(JSON.parse(JSON.stringify(e)))).toEqual(e);
  });
  it('las escenas con variables las traen ligadas a sus objetos', () => {
    for (const id of ['plano', 'mext-2018-1-1', 'mext-2008-1-1', 'mext-2016-p3', 'mext-2015-1-1']) {
      const e = escenaDeEscenario(id);
      expect(e.variables.length, id).toBeGreaterThan(0);
      for (const v of e.variables) for (const [obj] of v.liga) expect(e.objetos.some(o => o.id === obj), id).toBe(true);
    }
  });
});

describe('discos que giran en el laboratorio', () => {
  it('inercia y ω se sanean al abrir y solo llegan al motor en un disco libre', () => {
    const e = normalizarEscena({
      ...escenaVacia(),
      objetos: [
        { id: 'p1', tipo: 'particula', nombre: 'Disco', m: 1, x: 0, y: 1, radio: 0.1, inercia: 0.5, w: 7 },
        { id: 'p2', tipo: 'particula', nombre: 'Punto', m: 1, x: 1, y: 1, radio: 0, inercia: 0.5 },
        { id: 'p3', tipo: 'particula', nombre: 'Raro', m: 1, x: 2, y: 1, radio: 0.1, inercia: 9, w: 1e9 },
        { id: 'p4', tipo: 'particula', nombre: 'Mano', m: 1, x: 3, y: 1, radio: 0.1, inercia: 0.5, cinematica: true },
      ],
    });
    expect(e.objetos.map(o => [o.inercia, o.w])).toEqual([[0.5, 7], [0.5, 0], [1, 1e4], [0.5, 0]]);
    expect(normalizarEscena(JSON.parse(JSON.stringify(e)))).toEqual(e);
    const P = aMotor(e).motor.particulas;
    expect(P.map(p => p.inercia ?? 0)).toEqual([0.5, 0, 1, 0]);
    expect(P[0].w).toBe(7);
  });

  it('carrera de rodadura: llegan esfera, disco y aro, cada uno en t = √(2d(1 + k)/(g·sen θ))', () => {
    const e = escenaDeEscenario('rodadura'), M = aMotor(e), sim = simularMecanica(M.motor);
    expect(sim.incompleta).toBeNull();
    const th = 20 * Math.PI / 180, tiempos = {};
    for (const [q, k] of [[1, 1], [2, 0.5], [3, 0.4]]) {
      const p = e.objetos.find(o => o.id === `p${q}`), gate = e.objetos.find(o => o.id === `f${q}`);
      const pasos = pasosFotopuerta(sim, M, gate);
      expect(pasos).toHaveLength(1);
      const d = (2.4 - M.motor.particulas[M.indice[p.id]].p[0]) / Math.cos(th);
      cerca(pasos[0].t, Math.sqrt(2 * d * (1 + k) / (g * Math.sin(th))), 1e-7);
      tiempos[p.nombre] = pasos[0].t;
    }
    expect(tiempos.Esfera).toBeLessThan(tiempos.Disco);
    expect(tiempos.Disco).toBeLessThan(tiempos.Aro);
  });

  it('fuerzasEn: un disco que rueda por el plano tiene fricción m·g·sen θ·k/(1 + k) y normal m·g·cos θ', () => {
    const e = escenaDeEscenario('rodadura'), M = aMotor(e), sim = simularMecanica(M.motor);
    const th = 20 * Math.PI / 180, i = M.indice.p2, f = fuerzasEn(sim, M, 0.5).porParticula[i];
    const N = f.find(x => x.tipo === 'normal'), fr = f.find(x => x.tipo === 'friccion');
    cerca(N.valor, g * Math.cos(th), 1e-7);
    cerca(fr.valor, g * Math.sin(th) * 0.5 / 1.5, 1e-7);
  });

  it('bola que desliza: el evento dice que rueda sin deslizar y fuerzasEn da μ·N mientras desliza', () => {
    const e = escenaDeEscenario('bolos'), M = aMotor(e), sim = simularMecanica(M.motor);
    const ev = evento(sim, M, 'rueda sin deslizar');
    expect(ev).toBeTruthy();
    cerca(ev.t, 2 * 5 / (7 * 0.2 * g), 1e-8);
    const fr = fuerzasEn(sim, M, 0.3).porParticula[0].find(x => x.tipo === 'friccion');
    cerca(fr.valor, 0.2 * 6 * g, 1e-7);
    expect(fr.F[0]).toBeLessThan(0);
    cerca(estadoMecanica(sim, 1.5)[0].vx, 25 / 7, 1e-8);
  });
});

describe('bloques rígidos en el laboratorio', () => {
  it('se sanean al abrir, sobreviven a guardar y abrir, y llegan al motor con la orientación de su apoyo', () => {
    const e = escenaDeEscenario('vuelco');
    expect(normalizarEscena(JSON.parse(JSON.stringify(e)))).toEqual(e);
    const raro = normalizarEscena({ ...escenaVacia(), objetos: [{ id: 'p1', tipo: 'particula', nombre: 'B', m: 1, x: 0, y: 0, forma: 'bloque', ancho: -3, alto: 1e9, orient: 999 }] }).objetos[0];
    expect([raro.forma, raro.ancho, raro.alto, raro.orient]).toEqual(['bloque', 1e-3, 100, 360]);
    const M = aMotor(e), P = M.motor.particulas[M.indice.p1];
    expect(P.forma).toBe('bloque');
    cerca(P.theta, -25 * Math.PI / 180, 1e-12);
    expect(P.radio).toBe(0);
  });

  it('en el plano de 25° con μ = 0.9 el ancho se queda y el alto vuelca (tan θ > a/h)', () => {
    const e = escenaDeEscenario('vuelco'), M = aMotor(e), sim = simularMecanica(M.motor);
    expect(sim.incompleta).toBeNull();
    const [A0, B0] = estadoMecanica(sim, 0), [A, B] = estadoMecanica(sim, 0.8);
    cerca(A.x, A0.x, 1e-9); cerca(A.y, A0.y, 1e-9); cerca(A.th, -25 * Math.PI / 180, 1e-9);
    expect(B.th).toBeLessThan(B0.th - 0.3);
  });

  it('fuerzasEn de un bloque quieto: las normales suman m·g·cos θ y las fricciones m·g·sen θ', () => {
    const e = escenaDeEscenario('vuelco'), M = aMotor(e), sim = simularMecanica(M.motor);
    const f = fuerzasEn(sim, M, 0.5).porParticula[M.indice.p1], th = 25 * Math.PI / 180;
    const suma = tipo => f.filter(x => x.tipo === tipo).reduce((s, x) => s + x.valor, 0);
    expect(f.filter(x => x.tipo === 'normal')).toHaveLength(2);
    cerca(suma('normal'), g * Math.cos(th), 1e-7);
    cerca(suma('friccion'), g * Math.sin(th), 1e-7);
  });

  it('los eventos de un vértice («i.k») se describen con el nombre del bloque', () => {
    const e = escenaDeEscenario('vuelco'), M = aMotor(e);
    expect(describirEvento({ clave: 'despegue:1.0:0', nombre: 'Se despega (p2)' }, M)).toBe('Alto se despega del plano');
    expect(describirEvento({ clave: 'vt0:1.1:0', nombre: 'Deja de deslizar (p2)' }, M)).toBe('Alto deja de deslizar');
  });
});

describe('fuerza aplicada en un punto del bloque', () => {
  it('llega al motor solo en un cuerpo que gira, y fuerzasEn la dibuja desde su punto con su par', () => {
    const e = escenaDeEscenario('empuje'), M = aMotor(e), P = M.motor.particulas[0];
    expect(P.Fpunto).toEqual([-0.2, 0.3]);
    const sim = simularMecanica(M.motor), f = fuerzasEn(sim, M, 0.3).porParticula[0];
    const ap = f.find(x => x.tipo === 'aplicada');
    expect(ap.rel).toBeTruthy();
    // Volcando sobre la arista de delante: la normal está toda en ese vértice
    const normales = f.filter(x => x.tipo === 'normal');
    expect(normales).toHaveLength(1);
    // Un disco sin giro ignora el punto
    const d = aMotor(normalizarEscena({ ...escenaVacia(), objetos: [{ id: 'p1', tipo: 'particula', nombre: 'A', m: 1, x: 0, y: 0, radio: 0.1, F: 2, Fbx: 0.1 }] }));
    expect(d.motor.particulas[0].Fpunto).toBeUndefined();
  });
  it('la variable y′ decide: por debajo de 0.09 m se queda, por encima vuelca', () => {
    const conAltura = h => { const e = escenaDeEscenario('empuje'); e.objetos.find(o => o.id === 'p1').Fby = h; const M = aMotor(e); return estadoMecanica(simularMecanica(M.motor), 1)[0].th; };
    expect(Math.abs(conAltura(0.05))).toBeLessThan(1e-9);
    expect(conAltura(0.15)).toBeLessThan(-0.05);
  });
});

describe('cajas apiladas en el laboratorio', () => {
  it('se sostienen por sus caras: normales en cadena y nombres de los eventos con las cajas', () => {
    const e = escenaDeEscenario('apiladas'), M = aMotor(e), sim = simularMecanica(M.motor);
    expect(sim.incompleta).toBeNull();
    expect(M.caras).toHaveLength(3 * 8);
    // Antes del golpe: la caja 1 recibe del suelo el peso de las tres y de la caja 2 el de las dos de arriba
    const f = fuerzasEn(sim, M, 0.2).porParticula, suma = (l, tipo) => l.filter(x => x.tipo === tipo).reduce((s, x) => s + x.valor, 0);
    cerca(suma(f[0].filter(x => x.id === 's1'), 'normal'), 4.5 * g, 1e-7);
    cerca(suma(f[0].filter(x => x.id === 'p2'), 'normal'), 2.5 * g, 1e-7);
    cerca(suma(f[2], 'normal'), 1 * g, 1e-7);
    expect(describirEvento(sim.eventos[0], M)).toBe('La bola choca con Caja 3');
    // La bola no atraviesa ninguna caja: su centro queda fuera de las tres
    const fin = estadoMecanica(sim, 2.5), bola = fin[3];
    for (const k of [0, 1, 2]) {
      const c = fin[k], o = e.objetos.find(x => x.id === `p${k + 1}`), dx = bola.x - c.x, dy = bola.y - c.y;
      const lx = Math.cos(c.th) * dx + Math.sin(c.th) * dy, ly = -Math.sin(c.th) * dx + Math.cos(c.th) * dy;
      expect(Math.abs(lx) > o.ancho / 2 || Math.abs(ly) > o.alto / 2).toBe(true);
    }
    const en = energiaMecanica(sim, 2.5);
    cerca(en.E + en.Qc + en.Qi, energiaMecanica(sim, 0).E, 1e-7);
  });
});

describe('fricción entre discos en el laboratorio', () => {
  it('fuerzasEn reparte normal y fricción entre los dos discos, y los eventos se nombran', () => {
    const e = normalizarEscena({
      ...escenaVacia(), g: 0, duracion: 1, muCuerpos: 0.4, eParticulas: 0,
      objetos: [
        { id: 'p1', tipo: 'particula', nombre: 'A', m: 1, x: -0.1, y: 0, radio: 0.1, inercia: 0.5, w: 20 },
        { id: 'p2', tipo: 'particula', nombre: 'B', m: 2, x: 0.1, y: 0, radio: 0.1, inercia: 0.5 },
        { id: 'c1', tipo: 'resorte', nombre: 'Resorte', a: 'p1', b: 'p2', k: 200, L0: 0.15, amort: 0 },
      ],
    });
    const M = aMotor(e), sim = simularMecanica(M.motor);
    const f = fuerzasEn(sim, M, 0.05).porParticula;
    const fa = f[0].find(x => x.tipo === 'friccion'), fb = f[1].find(x => x.tipo === 'friccion');
    const na = f[0].find(x => x.tipo === 'normal' && x.id === '0:1');
    // Mientras deslizan: |f| = μ·N y opuestas
    cerca(fa.valor, 0.4 * na.valor, 1e-7);
    cerca(fa.F[0] + fb.F[0], 0, 1e-12); cerca(fa.F[1] + fb.F[1], 0, 1e-12);
    expect(sim.eventos.map(x => describirEvento(x, M))).toContain('A y B ruedan sin deslizar');
  });
});

describe('fuerza aplicada que cambia con el tiempo', () => {
  const amplitud = (sim, T) => { let a = 0; for (let t = T - 2; t <= T; t += 0.01) a = Math.max(a, Math.abs(estadoMecanica(sim, t)[0].x - 1.3)); return a; };
  it('resonancia forzada: amplitud F/(cω) en 1 Hz y mucho menor lejos de ella', () => {
    const e = escenaDeEscenario('resonancia');
    expect(e.objetos.find(o => o.id === 'p1').Fforma).toBe('seno');
    const { M, sim } = simular(e);
    expect(M.motor.particulas[0].Fvar).toEqual({ forma: 'seno', f: 1, fase: 0 });
    cerca(amplitud(sim, 20), 1 / (0.4 * 2 * Math.PI), 0.02);
    const lejos = simular({ ...e, objetos: e.objetos.map(o => (o.id === 'p1' ? { ...o, Ff: 2 } : o)) });
    expect(amplitud(lejos.sim, 20)).toBeLessThan(0.05);
    // La fuerza que se dibuja es la del instante: F·sen(2πft)
    const f = fuerzasEn(sim, M, 0.25).porParticula[0].find(x => x.tipo === 'aplicada');
    cerca(f.valor, 1, 1e-9);
    expect(fuerzasEn(sim, M, 0.5).porParticula[0].find(x => x.tipo === 'aplicada')?.valor ?? 0).toBeLessThan(1e-9);
  });
  it('el pulso se guarda, se valida y llega al motor', () => {
    const e = normalizarEscena({ objetos: [{ id: 'p1', tipo: 'particula', m: 2, x: 0, y: 0, F: 4, angF: 0, Fforma: 'pulso', Ft0: 1, Ft1: 0.5 }], g: 0, duracion: 2 });
    const o = e.objetos[0];
    expect([o.Fforma, o.Ft0, o.Ft1]).toEqual(['pulso', 1, 1]);
    const p = normalizarEscena({ objetos: [{ ...o, Ft1: 1.5 }], g: 0, duracion: 2 });
    const { M, sim } = simular(p);
    expect(M.motor.particulas[0].Fvar).toEqual({ forma: 'pulso', t0: 1, t1: 1.5 });
    cerca(estadoMecanica(sim, 2)[0].vx, 1, 1e-9);
    cerca(energiaMecanica(sim, 2).W, 1, 1e-9);
  });
});

describe('ejemplos clásicos', () => {
  const amp = (sim, i, t0, t1, x0) => { let a = 0; for (let t = t0; t <= t1; t += 0.005) a = Math.max(a, Math.abs(estadoMecanica(sim, t)[i].x - x0)); return a; };
  it('osciladores acoplados: la energía pasa al segundo bloque a media pulsación', () => {
    const { sim } = simular(escenaDeEscenario('acoplados'));
    const T = 2 * Math.PI / (Math.sqrt(48) - Math.sqrt(40));
    expect(amp(sim, 0, 0, 1, 1)).toBeGreaterThan(0.19);
    expect(amp(sim, 1, 0, 0.3, 2)).toBeLessThan(0.03);
    expect(amp(sim, 0, T / 2 - 0.25, T / 2 + 0.25, 1)).toBeLessThan(0.03);
    expect(amp(sim, 1, T / 2 - 0.5, T / 2 + 0.5, 2)).toBeGreaterThan(0.19);
  });
  it('escalera sin fricción: deja la pared cuando su centro baja a 2/3 de su altura (barra delgada)', () => {
    const e = escenaDeEscenario('escalera');
    const { M, sim } = simular(e);
    const ev0 = sim.eventos[0];
    expect(describirEvento(ev0, M)).toContain('despega de la pared');
    const y0 = estadoMecanica(sim, 0)[0].y, ys = estadoMecanica(sim, ev0.t)[0].y;
    cerca(ys / y0, 2 / 3, 0.025);
    // Más delgada, más cerca de la teoría de la barra
    const f = Math.PI / 6, an = 0.004, fina = { ...e, objetos: e.objetos.map(o => (o.id === 'p1' ? { ...o, ancho: an, x: an / 2 * Math.cos(f) + Math.sin(f), y: an / 2 * Math.sin(f) + Math.cos(f) } : o)) };
    const r = simular(fina), yf = estadoMecanica(r.sim, r.sim.eventos[0].t)[0].y / estadoMecanica(r.sim, 0)[0].y;
    cerca(yf, 2 / 3, 0.003);
  });
});
