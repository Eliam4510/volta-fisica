// Escenas propias de Termodinámica (sistema/prototipos/termodinamica-montaje.js):
// lo que se monta con las paletas se valida (lo que el motor no sabe simular
// junto se rechaza con un mensaje), se convierte en la entrada del motor y se
// sanea al abrirlo de un archivo. Una escena del catálogo convertida en
// montaje da la misma entrada del motor y la misma simulación.
import { describe, it, expect } from 'vitest';
import {
  montajeLabVacio, colocarLab, quitarLab, ajustarLab, reordenarLab, validarLab, entradaLab, escenaLab, sanearLab, tipoMontajeLab,
  firmaRecipientes, guionValidoLab, montajeDesdeCilindro, montajeDesdeRecipientes, montajeDesdeGlobo, montajeDesdeBurbuja, piezaLab,
  nuevoInstrumento, sanearInstrumentos, lecturaCronometro,
  montajeMolVacio, colocarMol, quitarMol, ajustarMol, moverMol, validarMol, entradaMol, sanearMol, montajeDesdeMolecular, finalEmbolo,
  montajeCalorVacio, colocarCalor, quitarCalor, ajustarCalor, moverCalor, contactosCalor, tocanBano, entradaCalor, sanearCalor, guionValidoCalor, escenaCalor,
  libertadEstado, moverEstadoCiclo,
} from '../sistema/prototipos/termodinamica-montaje.js';
import { escenaPorClave, entradaCilindro, valores, guionDe, simularEscena, examenDe } from '../sistema/prototipos/termodinamica-escenas.js';
import { simularGas, R_GAS } from '../sistema/motores/gas.js';
import { simularRecipientes, equilibrioAislado, simularBurbuja } from '../sistema/motores/recipientes.js';
import { simularMolecular } from '../sistema/motores/cinetica.js';
import { simularCalor, temperaturaMezcla } from '../sistema/motores/calor.js';
import { simularCiclo, cicloRectangular } from '../sistema/motores/ciclos.js';

const pon = (m, h, donde) => colocarLab(m, h, donde).montaje;
const falla = (f, re) => expect(f).toThrow(re);

describe('Laboratorio de gases · montar', () => {
  it('un cilindro trae su gas y su émbolo y da la entrada del motor en SI', () => {
    let m = pon(montajeLabVacio(), 'cilindro');
    m = pon(m, 'pesa'); m = pon(m, 'calentador'); m = pon(m, 'bano');
    expect(tipoMontajeLab(m)).toBe('cilindro');
    const x = entradaLab(m), e = x.entrada;
    expect(e).toMatchObject({ n: 1, A: 0.05, P0: 101300, T0: 300, m: 50, M: 150, Fc: 300, G: 6, b: 300, angulo: 0, especie: 'mono' });
    expect(x.geo).toMatchObject({ Hc: 0.7, hMax: 0.62, tanque: true });
    // El gas empieza en equilibrio con el baño: h = nRT/((P0 + mg/A)·A)
    const sim = simularGas({ ...e, hMax: x.geo.hMax }, [], { duracion: 0.2 });
    expect(sim.muestras[0].h).toBeCloseTo(R_GAS * 300 / ((101300 + 50 * 9.8 / 0.05) * 0.05), 10);
  });

  it('impide los montajes que el motor no sabe simular, con un mensaje que dice por qué', () => {
    const cil = pon(montajeLabVacio(), 'cilindro');
    falla(() => colocarLab(cil, 'recipiente'), /no se puede conectar/);
    falla(() => colocarLab(cil, 'cilindro'), /un solo|uno solo/);
    falla(() => colocarLab(cil, 'globo'), /solo/);
    falla(() => colocarLab(cil, 'valvula', { obj: 'c1' }), /no tiene válvulas/);
    falla(() => colocarLab(cil, 'embolo', { obj: 'c1' }), /ya tiene su émbolo/);
    falla(() => colocarLab(cil, 'resorte'), /resortes/);
    falla(() => colocarLab(montajeLabVacio(), 'pesa'), /coloca antes un cilindro/);
    const rec = pon(montajeLabVacio(), 'recipiente');
    falla(() => colocarLab(rec, 'cilindro'), /no se puede conectar/);
    falla(() => colocarLab(rec, 'pesa'), /cilindro/);
    falla(() => colocarLab(rec, 'valvula', {}), /entre dos recipientes/);
    const glo = pon(montajeLabVacio(), 'globo');
    falla(() => colocarLab(glo, 'recipiente'), /se simula solo/);
    falla(() => colocarLab(glo, 'calentador'), /quemador/);
    falla(() => colocarLab(pon(montajeLabVacio(), 'columna'), 'cilindro'), /se simula sola/);
    // Baño con el cilindro inclinado, topes por encima de la boca, émbolo que se sale
    const conBano = pon(cil, 'bano');
    falla(() => ajustarLab(conBano, 'c1', 'angulo', 30), /cilindro vertical/);
    falla(() => ajustarLab(cil, 'c1', 'hTopes', 0.9), /por debajo de la boca/);
    falla(() => ajustarLab(ajustarLab(ajustarLab(cil, 'c1/embolo', 'm', 5000), 'c1', 'A', 50), 'c1', 'angulo', 180), /saca del cilindro/);
    // Un montaje rechazado no cambia el original
    expect(cil.objetos).toHaveLength(1);
  });

  it('recipientes: válvula, tabique o émbolo en cada hueco; el émbolo necesita gas a los dos lados y la misma sección', () => {
    let m = pon(pon(montajeLabVacio(), 'recipiente'), 'recipiente');
    expect(m.separadores.map(s => s.tipo)).toEqual(['valvula']);
    m = ajustarLab(m, 'r2/gas', 'n', 0);
    falla(() => colocarLab(m, 'embolo', { hueco: 0 }), /gas a los dos lados/);
    m = ajustarLab(m, 'r2/gas', 'n', 0.4);
    m = pon(m, 'embolo', { hueco: 0 });
    falla(() => ajustarLab(m, 'r2', 'S', 200), /misma sección/);
    falla(() => quitarLab(m, 'r1/gas'), /gas a los dos lados/);
    m = pon(m, 'tabique', { hueco: 0 });
    expect(entradaLab(m).entrada.separadores).toEqual([{ tipo: 'pared', G: 0 }]);
    // Quitar el tabique deja otra vez una válvula cerrada; una válvula no se quita
    m = quitarLab(m, 'sep:0').montaje;
    expect(m.separadores[0].tipo).toBe('valvula');
    falla(() => quitarLab(m, 'sep:0'), /siempre hay algo/);
    // Un recipiente nuevo en medio parte el hueco con otra válvula
    m = pon(m, 'recipiente', { indice: 1 });
    expect(m.objetos.map(o => o.id)).toEqual(['r1', 'r3', 'r2']);
    expect(m.separadores).toHaveLength(2);
    expect(validarLab(m)).toBeNull();
  });

  it('dos recipientes con gas distinto: al abrir la válvula se llega al equilibrio aislado', () => {
    let m = pon(pon(montajeLabVacio(), 'recipiente'), 'recipiente');
    m = ajustarLab(ajustarLab(m, 'r1/gas', 'T', 300), 'r2/gas', 'T', 500);
    m = ajustarLab(m, 'r2/gas', 'especie', 'n2');
    const { entrada } = entradaLab(m);
    expect(entrada.especies.map(e => e.nombre)).toEqual(['Monoatómico', 'N₂']);
    const sim = simularRecipientes(entrada, [{ t: 0.5, tipo: 'valvula', i: 0, valor: true }], { duracion: 12, dt: 0.002, muestra: 0.1 });
    const q = sim.muestras[sim.muestras.length - 1], eq = equilibrioAislado(entrada);
    expect(q.T[0]).toBeCloseTo(eq.T, 3); expect(q.T[1]).toBeCloseTo(eq.T, 3);
    expect(q.P[0] / eq.P).toBeCloseTo(1, 4);
  });

  it('reordenar la fila y quitar piezas renumera las acciones por la identidad de cada pieza', () => {
    let m = pon(pon(pon(montajeLabVacio(), 'recipiente'), 'recipiente'), 'recipiente');
    m = pon(m, 'calentador', { obj: 'r3' });
    const guion = [{ t: 1, tipo: 'valvula', i: 1, valor: true }, { t: 2, tipo: 'calentador', i: 2, valor: true }, { t: 3, tipo: 'pesa', valor: true }];
    const antes = firmaRecipientes(m), m2 = reordenarLab(m, 'r3', 0);
    expect(m2.objetos.map(o => o.id)).toEqual(['r3', 'r1', 'r2']);
    // El calentador de r3 pasa al índice 0; la válvula del hueco 1 sigue en el hueco 1; la pesa no existe aquí
    expect(guionValidoLab(m2, guion, antes)).toEqual([{ t: 1, tipo: 'valvula', i: 1, valor: true }, { t: 2, tipo: 'calentador', i: 0, valor: true }]);
    const m3 = quitarLab(m2, 'r3/calentador').montaje;
    expect(guionValidoLab(m3, guion, antes).map(a => a.tipo)).toEqual(['valvula']);
    // Cilindro: las acciones de la pesa se van con la pesa
    const c = pon(pon(montajeLabVacio(), 'cilindro'), 'pesa');
    const g = [{ t: 1, tipo: 'pesa', valor: true }, { t: 2, tipo: 'paredes', valor: 'adiabaticas' }];
    expect(guionValidoLab(c, g)).toHaveLength(2);
    expect(guionValidoLab(quitarLab(c, 'c1/pesa').montaje, g)).toEqual([g[1]]);
  });

  it('globo y columna de líquido: entradas de simularAbierto y simularBurbuja', () => {
    const g = entradaLab(pon(montajeLabVacio(), 'globo'));
    expect(g.tipo).toBe('abierto');
    expect(g.entrada).toMatchObject({ V: 3000, P0: 101300, T0: 300, Mm: 0.029, M: 500, Fc: 5e6, Tobj: 400 });
    const l = entradaLab(pon(montajeLabVacio(), 'columna'));
    const sim = simularBurbuja(l.entrada, { duracion: l.duracion });
    const fin = sim.muestras[sim.muestras.length - 1];
    // P·V/T se conserva al subir
    expect(fin.P * fin.V / fin.T).toBeCloseTo(sim.muestras[0].P * sim.muestras[0].V / sim.muestras[0].T, 12);
  });
});

describe('Laboratorio de gases · escenas del catálogo convertidas en montaje', () => {
  it('MEXT 2019 P4: el montaje da la misma entrada del motor y las mismas respuestas', () => {
    const esc = escenaPorClave('mext-2019-p4'), v = valores(esc), e = entradaCilindro(esc, v);
    const m = montajeDesdeCilindro(e, { Hc: esc.geo.Hc, hMax: esc.geo.hMax, tanque: esc.geo.tanque });
    expect(validarLab(m)).toBeNull();
    const x = entradaLab(m);
    for (const k of ['n', 'A', 'P0', 'T0', 'm', 'M', 'Fc', 'G', 'b', 'especie']) expect(x.entrada[k], k).toEqual(e[k]);
    // La escena propia, simulada con el mismo guion, da las mismas respuestas del examen
    const propia = { ...escenaLab(m), examen: esc.examen };
    const simA = simularEscena(esc, v), simB = simularGas({ ...x.entrada, hMax: x.geo.hMax }, guionDe(esc, v), { modelo: 'dinamico', duracion: esc.duracion, dt: 2e-4, muestra: 0.01, tauCarga: 4 });
    const filasA = examenDe(esc, simA, v), filasB = examenDe(propia, simB, v);
    filasA.forEach((f, i) => expect(filasB[i].valor).toBeCloseTo(f.valor, 9));
  });

  it('recipientes, globo y burbuja del catálogo se convierten sin cambiar su entrada', () => {
    for (const clave of ['mext-2016-p4', 'mext-2023-1-4', 'mext-2010-2-b', 'mext-2027-p4-1']) {
      const esc = escenaPorClave(clave), e = esc.construir(valores(esc)), m = montajeDesdeRecipientes(e, esc.seccion || 0);
      expect(validarLab(m), clave).toBeNull();
      const x = entradaLab(m).entrada;
      x.compartimientos.forEach((c, i) => {
        const o = e.compartimientos[i];
        expect(c.V).toBeCloseTo(o.V, 12); expect(c.T).toBeCloseTo(o.T, 9);
        expect(c.n.reduce((a, b) => a + b, 0)).toBeCloseTo(o.n.reduce((a, b) => a + b, 0), 6);
        expect(c.Fc ?? 0).toBeCloseTo(o.Fc ?? 0, 9); expect(c.Gb ?? 0).toBeCloseTo(o.Gb ?? 0, 9);
        expect(c.bano ?? true).toBe(o.bano ?? true);
      });
      expect(x.separadores.map(s => s.tipo)).toEqual(e.separadores.map(s => s.tipo));
    }
    // Una mezcla de especies en un mismo recipiente no se puede montar con la paleta
    expect(montajeDesdeRecipientes({ especies: [{ nombre: 'a', f: 3 }, { nombre: 'b', f: 5 }], compartimientos: [{ V: 0.01, n: [1, 1], T: 300 }], separadores: [] })).toBeNull();
    const glo = escenaPorClave('mext-2020-p4'), eg = glo.construir(valores(glo)), xg = entradaLab(montajeDesdeGlobo(eg)).entrada;
    for (const k of ['V', 'P0', 'T0', 'M', 'Fc', 'Mm', 'CdA']) expect(xg[k], k).toBeCloseTo(eg[k], 6);
    const bur = escenaPorClave('mext-2008-1-3'), eb = bur.construir(valores(bur)), xb = entradaLab(montajeDesdeBurbuja(eb)).entrada;
    for (const k of ['V0', 'prof', 'P0', 'rho', 'Tfondo', 'Tsup']) expect(xb[k], k).toBeCloseTo(eb[k], 6);
  });
});

describe('Laboratorio de gases · archivos', () => {
  it('un montaje guardado se recupera igual y lo que llega mal se acota o se descarta', () => {
    let m = pon(pon(pon(montajeLabVacio(), 'recipiente'), 'recipiente'), 'embolo', { hueco: 0 });
    m = pon(m, 'bano', { obj: 'r2' });
    const ida = JSON.parse(JSON.stringify(m));
    expect(sanearLab(ida)).toEqual({ montaje: m, error: null });
    // Números fuera de rango, tipos desconocidos, ids con marcado
    const r = sanearLab({ atm: { P0: 1e9, T0: 'x' }, objetos: [{ tipo: 'cilindro', id: '<b>', A: -5, gas: { n: 1e6, especie: 'plasma' } }, { tipo: 'nave' }, null] });
    expect(r.error).toBeNull();
    expect(r.montaje.atm).toEqual({ P0: 300, T0: 300 });
    const c = r.montaje.objetos[0];
    expect(c.id).toMatch(/^[a-z]+\d+$/); expect(c.A).toBe(50); expect(c.gas).toEqual({ n: 5, especie: 'mono' });
    expect(r.montaje.objetos).toHaveLength(1);
    // Un montaje imposible se abre vacío y dice por qué
    const malo = sanearLab({ objetos: [{ tipo: 'cilindro' }, { tipo: 'recipiente' }] });
    expect(malo.montaje.objetos).toHaveLength(0); expect(malo.error).toMatch(/no se puede conectar/);
    expect(sanearLab('basura').montaje).toEqual(montajeLabVacio());
    // Faltan separadores: se ponen válvulas
    expect(sanearLab({ objetos: [{ tipo: 'recipiente' }, { tipo: 'recipiente' }] }).montaje.separadores.map(s => s.tipo)).toEqual(['valvula']);
  });

  it('piezas del inspector con su nombre y sus parámetros', () => {
    const m = pon(pon(pon(montajeLabVacio(), 'recipiente'), 'recipiente'), 'calentador', { obj: 'r2' });
    expect(piezaLab(m, 'r2/calentador')).toMatchObject({ clase: 'calRec', nombre: 'Calentador de B' });
    expect(piezaLab(m, 'sep:0')).toMatchObject({ clase: 'valvula' });
    expect(piezaLab(m, 'r9')).toBeNull();
    expect(ajustarLab(m, 'r1', 'V', 1e9).objetos[0].V).toBe(200);
    expect(() => ajustarLab(m, 'r1', 'V', 'abc')).toThrow(/no es válido/);
  });

  it('instrumentos: anclados a una región o libres, saneados y con el cronómetro entre sus instantes', () => {
    const L = [];
    L.push(nuevoInstrumento(L, 'termometro', { en: 'r0', u: 2, w: 0.5 }));
    L.push(nuevoInstrumento(L, 'regla', { a: [0, 0], b: [0, 0.3] }));
    L.push(nuevoInstrumento(L, 'cronometro', { x: 1, y: 1 }));
    expect(L.map(o => o.id)).toEqual(['i1', 'i2', 'i3']);
    expect(L[0]).toMatchObject({ en: 'r0', u: 1, w: 0.5 });
    expect(sanearInstrumentos([...L, { tipo: 'bomba' }, { tipo: 'regla', a: [0, 'x'] }, { tipo: 'manometro', x: 0, y: 1, en: '<script>' }])).toHaveLength(4);
    expect(lecturaCronometro({ t0: 2, t1: 0 }, 5)).toBe(3);
    expect(lecturaCronometro({ t0: 2, t1: 4 }, 5)).toBe(2);
    expect(lecturaCronometro({ t0: 2, t1: 4 }, 1)).toBe(0);
    const muchos = []; for (let i = 0; i < 12; i++) muchos.push(nuevoInstrumento(muchos, 'termometro', {}));
    expect(() => nuevoInstrumento(muchos, 'termometro', {})).toThrow(/doce/);
  });
});

describe('Gas molecular · montar', () => {
  it('una caja trae una bomba y simula; la bomba elige su lado del tabique', () => {
    let m = colocarMol(montajeMolVacio(), 'caja').montaje;
    m = colocarMol(m, 'orificio', { x: 50 }).montaje;
    m = colocarMol(m, 'bomba', { x: 80 }).montaje;
    const e = entradaMol(m);
    expect(e.especies.map(s => [s.nombre, s.N, s.region])).toEqual([['Ar', 150, 'izq'], ['He', 100, 'der']]);
    expect(e.tabique.x).toBeCloseTo(50e-9, 20); expect(e.tabique.hueco).toBeCloseTo(4e-9, 20); expect(e.tabique.abierto).toBe(true);
    const sim = simularMolecular(e, { duracion: 2e-10, cuadro: 2e-11 });
    expect(sim.N).toBe(250);
    expect(sim.medidas[0].izq).toBe(150);
    // Mover la bomba al otro lado cambia dónde empiezan sus moléculas
    expect(entradaMol(moverMol(m, 'b2', 10)).especies[1].region).toBe('izq');
  });

  it('impide el émbolo que choca con el tabique, demasiadas moléculas y piezas sin caja', () => {
    expect(() => colocarMol(montajeMolVacio(), 'bomba')).toThrow(/caja/);
    let m = colocarMol(montajeMolVacio(), 'caja').montaje;
    m = colocarMol(m, 'orificio', { x: 50 }).montaje;
    m = colocarMol(m, 'embolo').montaje;
    expect(finalEmbolo(m)).toBeGreaterThan(m.tabique.x + 4);
    expect(() => ajustarMol(m, 'embolo', 't1', 50)).toThrow(/tabique/);
    expect(() => ajustarMol(m, 'b1', 'N', 500)).not.toThrow();
    expect(() => ajustarMol(colocarMol(ajustarMol(m, 'b1', 'N', 500), 'bomba', { x: 20 }).montaje, 'b2', 'N', 200)).toThrow(/Demasiadas/);
    expect(() => colocarMol(m, 'caja')).toThrow(/Ya hay una caja/);
    const sin = quitarMol(m, 'caja').montaje;
    expect(entradaMol(sin)).toBeNull();
    expect(validarMol(sin)).toBeNull();
  });

  it('las escenas del catálogo se convierten y los archivos se sanean', () => {
    for (const clave of ['efusion', 'expansion', 'compresion', 'paredes-termicas']) {
      const esc = escenaPorClave(clave), v = valores(esc), e = esc.construir(v), dur = esc.duracionDe ? esc.duracionDe(v) : esc.duracion;
      const m = montajeDesdeMolecular(e, dur), x = entradaMol(m);
      expect(validarMol(m), clave).toBeNull();
      expect(x.Lx).toBeCloseTo(e.Lx, 15); expect(x.paredes).toBe(e.paredes || 'adiabatica');
      expect(x.especies.map(s => [s.nombre, s.N, s.region])).toEqual(e.especies.map(s => [s.nombre, s.N, s.region || 'toda']));
      if (e.tabique) expect(x.tabique.abierto).toBe(e.tabique.abierto !== false);
      if (e.orificio) expect(x.orificio[0].t).toBeCloseTo(e.orificio[0].t, 15);
      if (e.embolo) expect(x.embolo[0].u).toBe(e.embolo[0].u);
    }
    const r = sanearMol({ caja: { Lx: 1e6 }, bombas: [{ especie: 'Xx', N: -3, x: 1e9 }, 7], embolo: { u: 'a' } });
    expect(r.montaje.caja.Lx).toBe(300);
    expect(r.montaje.bombas[0]).toMatchObject({ especie: 'Ar', N: 1, x: 298 });
    expect(sanearMol({ caja: {}, bombas: [{ N: 500 }, { N: 500 }] }).error).toMatch(/Demasiadas/);
  });
});

describe('Calor · montar', () => {
  it('calorímetro con un bloque dentro del agua: los contactos salen de la geometría y se llega a Σm·c·T/Σm·c', () => {
    let m = colocarCalor(montajeCalorVacio(), 'calorimetro', { x: 0 }).montaje;
    const agua = m.cuerpos[1];
    m = colocarCalor(m, 'cuerpo', { x: 0, y: 0.05, en: agua.id }).montaje;
    expect(m.cuerpos.map(c => c.material)).toEqual(['aluminio', 'agua', 'cobre']);
    // El bloque toca solo el agua (su recipiente), no el vaso
    expect(contactosCalor(m).map(c => [c.a, c.b])).toEqual([[0, 1], [1, 2]]);
    const { entrada } = entradaCalor(m);
    expect(entrada.ambiente).toBeUndefined();
    const sim = simularCalor(entrada, [], { duracion: 400, dt: 0.05, muestra: 1 });
    const T = sim.muestras[sim.muestras.length - 1].T;
    for (const x of T) expect(x).toBeCloseTo(temperaturaMezcla(entrada.cuerpos), 2);
  });

  it('dos bloques que se tocan intercambian calor; separados, no; el baño solo con lo que lo toca', () => {
    let m = colocarCalor(montajeCalorVacio(), 'cuerpo', { x: 0, y: 0.025 }).montaje;
    m = colocarCalor(m, 'cuerpo', { x: 0.06, y: 0.025 }).montaje;
    expect(contactosCalor(m)).toHaveLength(1);
    expect(contactosCalor(moverCalor(m, m.cuerpos[1].id, 0.2, 0))).toHaveLength(0);
    // Apilado: el segundo se apoya encima del primero
    const encima = moverCalor(m, m.cuerpos[1].id, 0.005, 0.06);
    expect(encima.cuerpos[1].y).toBeCloseTo(0.05, 9);
    expect(contactosCalor(encima)).toHaveLength(1);
    // Baño: el bloque dentro intercambia calor con él; el vaso de un calorímetro, nunca
    let b = colocarCalor(montajeCalorVacio(), 'bano', { x: 0 }).montaje;
    b = ajustarCalor(b, 'bano', 'w', 100);
    b = colocarCalor(b, 'cuerpo', { x: -0.4, y: 0.02 }).montaje;
    b = colocarCalor(b, 'calorimetro', { x: 0.9 }).montaje;
    b = moverCalor(b, b.cuerpos[1].id, 0.2, 0);          // el calorímetro, metido en el baño
    expect(b.cuerpos[2].x).toBeCloseTo(0.2, 9);
    expect(tocanBano(b)).toEqual([true, false, false]);
    const x = entradaCalor(b).entrada;
    expect(x.ambiente).toEqual({ T: 293.15, G: [5, 0, 0] });
    // Mover el vaso se lleva el agua de dentro
    const v0 = b.cuerpos.find(c => c.tipo === 'vaso'), a0 = b.cuerpos.find(c => c.material === 'agua');
    const b2 = moverCalor(b, v0.id, v0.x + 0.3, 0);
    expect(b2.cuerpos.find(c => c.material === 'agua').x - a0.x).toBeCloseTo(0.3, 9);
  });

  it('calentador en un cuerpo, hielo bajo cero, un solo baño y acciones que siguen a su contacto', () => {
    let m = colocarCalor(montajeCalorVacio(), 'calorimetro', { x: 0 }).montaje;
    expect(() => colocarCalor(m, 'calentador', {})).toThrow(/dentro de un cuerpo/);
    m = colocarCalor(m, 'calentador', { en: m.cuerpos[1].id }).montaje;
    expect(entradaCalor(m).entrada.calentadores).toEqual([{ cuerpo: 1, P: 100, activo: true }]);
    m = colocarCalor(m, 'bano', { x: 1 }).montaje;
    expect(() => colocarCalor(m, 'bano', { x: 2 })).toThrow(/un solo entorno/);
    const hielo = ajustarCalor(m, m.cuerpos[1].id, 'material', 'hielo');
    expect(hielo.cuerpos[1].T).toBeLessThanOrEqual(0);
    expect(entradaCalor(hielo).entrada.cuerpos[1].fusion).toBeDefined();
    expect(() => ajustarCalor(hielo, hielo.cuerpos[1].id, 'T', 5)).toThrow(/0 °C o menos/);
    // Quitar el agua quita su calentador; las acciones del contacto vaso–agua se van con él
    const antes = entradaCalor(m).claves, sinAgua = quitarCalor(m, m.cuerpos[1].id).montaje;
    expect(sinAgua.calentadores).toHaveLength(0);
    expect(guionValidoCalor([{ t: 1, tipo: 'contacto', i: 0, valor: false }, { t: 2, tipo: 'calentador', i: 0, valor: false }], antes, entradaCalor(sinAgua) ? entradaCalor(sinAgua).claves : { contactos: [], calentadores: [] })).toEqual([]);
    expect(escenaCalor(montajeCalorVacio()).vacia).toBe(true);
  });

  it('los archivos se sanean: nombres sin marcado, números acotados, calentadores de cuerpos que existen', () => {
    const r = sanearCalor({ cuerpos: [{ id: 'cu1', nombre: '<img src=x>Cobre', material: 'cobre', m: -1, T: 5000, w: 6, h: 5, x: 0, y: 0 }], calentadores: [{ en: 'cu1', P: 1e9 }, { en: 'cu9', P: 1 }], bano: { T: 20 } });
    expect(r.error).toBeNull();
    expect(r.montaje.cuerpos[0]).toMatchObject({ nombre: 'img src=xCobre', m: 1, T: 1000 });
    expect(r.montaje.calentadores).toEqual([{ id: 'ca1', en: 'cu1', P: 5000, activo: 'si' }]);
    expect(sanearCalor({ cuerpos: [{ material: 'hielo', T: 20 }] }).error).toMatch(/hielo/);
  });
});

describe('Ciclos · arrastrar un estado', () => {
  const rect = cicloRectangular({ n: 0.5, f: 3, P1: 100e3, P2: 200e3, V1: 10e-3, V2: 20e-3 });
  it('cada estado se mueve por lo que su tramo deja libre', () => {
    expect(libertadEstado(rect, -1)).toEqual({ P: true, V: true });
    const lib = rect.tramos.map((_, i) => libertadEstado(rect, i));
    // A → B isobárico (V), B → C isocórico (P), C → D isobárico (V), D → A cierra el ciclo (fijo)
    expect(lib.map(l => (l.P ? 'P' : '') + (l.V ? 'V' : ''))).toEqual(rect.tramos.map(tr => (tr.hasta ? '' : tr.tipo === 'isocorico' ? 'P' : tr.tipo === 'recta' ? 'PV' : 'V')));
  });
  it('mover un estado da un ciclo nuevo coherente con el motor', () => {
    const i = rect.tramos.findIndex(tr => tr.tipo === 'isocorico' && !tr.hasta);
    const n = moverEstadoCiclo(rect, i, 300e3, 1);       // el volumen no cuenta en una isócora
    const sim = simularCiclo(n), a = simularCiclo(rect);
    const nombre = sim.tramos[i].hasta;
    expect(sim.estados[nombre].P).toBeCloseTo(300e3, 6);
    expect(sim.estados[nombre].V).toBeCloseTo(a.estados[nombre].V, 12);
    // El inicial se mueve en P y V; si el último tramo ya no puede cerrar el ciclo, el motor lo dice
    const m2 = simularCiclo(moverEstadoCiclo(rect, -1, 100e3, 12e-3));
    expect(m2.estados[m2.inicio].V).toBeCloseTo(12e-3, 12); expect(m2.ciclo).toBe(true);
    expect(() => simularCiclo(moverEstadoCiclo(rect, -1, 120e3, 12e-3))).toThrow(/no llega/);
    expect(() => moverEstadoCiclo(rect, -1, -1, 1)).toThrow(/positivos/);
  });
});
