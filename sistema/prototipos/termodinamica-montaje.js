/* ==========================================================================
   Volta · Termodinámica — escenas propias (lo que se monta con las paletas)
   Puro (sin DOM): lo usan las pantallas y las pruebas
   (pruebas/termodinamica-montaje.test.js).
   Cada espacio guarda su montaje como datos simples (JSON), en las unidades
   que ve el usuario (kPa, L, cm², g, °C, nm), y de aquí sale:
   - la validación: un montaje que el motor no sabe simular (un cilindro
     conectado a recipientes, un globo con otros objetos, un émbolo libre
     contra el vacío…) se rechaza con un mensaje claro, sin simular nada falso;
   - la entrada del motor en SI (gas.js, recipientes.js, cinetica.js, calor.js)
     y una escena con la misma forma que las del catálogo, para que la
     pantalla la dibuje y la simule igual;
   - el saneado de lo que llega de un archivo .volta (entrada no confiable,
     DECISIONES.md 12): tipos conocidos, números acotados, nombres limpios;
   - la conversión de una escena del catálogo en montaje, para modificarla.
   Parámetros de cada pieza: {k, etq, u, def, min, max, paso, opciones?, ayuda?}.
   ========================================================================== */
import { R_GAS } from '../motores/gas.js';
import { UMA } from '../motores/cinetica.js';
import { MATERIALES } from '../motores/calor.js';
import { numero, texto } from '../nucleo/escena.js';
import { MOLECULAS } from './termodinamica-escenas.js';

const R = R_GAS, G9 = 9.8, K0 = 273.15;
const copia = o => JSON.parse(JSON.stringify(o));
/** Especificación de un parámetro editable. */
const par = (k, etq, u, def, min, max, paso, o = {}) => ({ k, etq, u, def, min, max, paso, ...o });
/** Error de montaje: el mensaje se muestra tal cual. */
const fallo = msj => { throw new Error(msj); };
/** Id nuevo con prefijo que no está en la lista. */
function nuevoId(lista, pref) { const usados = new Set(lista.map(o => o.id)); let k = 1; while (usados.has(pref + k)) k++; return pref + k; }
const ID_OK = /^[a-z]{1,3}\d{1,3}$/;

/** Valores por omisión de una lista de parámetros. */
export const defectos = specs => Object.fromEntries(specs.map(s => [s.k, s.def]));
/** Acota (o pone por omisión) cada parámetro de un objeto según sus specs. */
export function acotar(fuente, specs) {
  const o = {};
  for (const s of specs) {
    const v = fuente ? fuente[s.k] : undefined;
    if (s.opciones) o[s.k] = s.opciones.some(([x]) => x === v) ? v : s.def;
    else o[s.k] = numero(v, s.def, s.min, s.max);
  }
  return o;
}
/** Cambia un parámetro (acotado); devuelve false si la clave no existe. */
export function ponerParametro(holder, specs, k, valor) {
  const s = specs.find(x => x.k === k); if (!s) return false;
  if (s.opciones) { if (!s.opciones.some(([x]) => x === valor)) return false; holder[k] = valor; return true; }
  const x = typeof valor === 'number' ? valor : parseFloat(String(valor).replace('−', '-').replace(',', '.'));
  if (!Number.isFinite(x)) return false;
  holder[k] = Math.min(s.max, Math.max(s.min, x));
  return true;
}

// ===========================================================================
// Laboratorio de gases
// ===========================================================================
/** Gases de los recipientes: grados de libertad y masa molar (kg/mol). */
export const ESPECIES_GAS = Object.freeze({
  mono: { nombre: 'Monoatómico', f: 3, M: 0.004 }, di: { nombre: 'Diatómico', f: 5, M: 0.029 },
  he: { nombre: 'He', f: 3, M: 0.004 }, ar: { nombre: 'Ar', f: 3, M: 0.040 },
  n2: { nombre: 'N₂', f: 5, M: 0.028 }, o2: { nombre: 'O₂', f: 5, M: 0.032 }, co2: { nombre: 'CO₂', f: 6, M: 0.044 },
});
const OPC_ESPECIE = Object.entries(ESPECIES_GAS).map(([k, e]) => [k, e.nombre]);

export const PARAMS_LAB = Object.freeze({
  atm: [par('P0', 'Presión', 'kPa', 101.3, 20, 300, 0.1, { ayuda: 'Presión de la atmósfera|Atmospheric pressure' }), par('T0', 'Temperatura', 'K', 300, 100, 1000, 1, { ayuda: 'Temperatura del aire de fuera|Air temperature' })],
  escena: [par('duracion', 'Duración', 's', 30, 2, 300, 1, { ayuda: 'Tiempo que se simula|Simulated time' })],
  cilindro: [
    par('A', 'Sección', 'cm²', 500, 50, 2000, 10), par('Hc', 'Altura', 'm', 0.7, 0.2, 2, 0.01, { ayuda: 'Altura del cilindro|Cylinder height' }),
    par('hTopes', 'Topes', 'm', 0.62, 0.05, 1.92, 0.01, { ayuda: 'Altura del gas con el émbolo apoyado en los topes|Stop height' }),
    par('angulo', 'Inclinación', '°', 0, 0, 180, 1, { ayuda: '0°: boca arriba; 90°: tumbado; 180°: boca abajo|Tilt' }),
    par('G', 'Conducción', 'W/K', 6, 0, 60, 0.5, { ayuda: 'Conductancia de las paredes conductoras con el baño o el aire|Wall conductance' }),
  ],
  gasCil: [par('n', 'Cantidad', 'mol', 1, 0.02, 5, 0.01), par('especie', 'Especie', '', 'mono', 0, 0, 0, { opciones: [['mono', 'Monoatómico'], ['di', 'Diatómico']] })],
  emboloCil: [par('m', 'Masa', 'kg', 50, 1, 5000, 1), par('b', 'Disipación', 'kg/s', 300, 0, 3000, 10, { ayuda: 'Rozamiento viscoso: lleva el émbolo al equilibrio|Damping' })],
  pesa: [par('M', 'Masa', 'kg', 150, 1, 2000, 5)],
  calCil: [par('Fc', 'Potencia', 'W', 300, 1, 5000, 10)],
  banoCil: [par('T', 'Temperatura', 'K', 300, 100, 1000, 1)],
  recipiente: [par('V', 'Volumen', 'L', 10, 0.2, 200, 0.1), par('S', 'Sección', 'cm²', 400, 20, 4000, 10, { ayuda: 'Área de la base: el ancho del recipiente es V/S|Base area' })],
  gasRec: [par('especie', 'Especie', '', 'mono', 0, 0, 0, { opciones: OPC_ESPECIE }), par('n', 'Cantidad', 'mol', 0.4, 0, 20, 0.01), par('T', 'Temperatura', 'K', 300, 50, 2000, 1)],
  calRec: [par('Fc', 'Potencia', 'W', 50, 1, 5000, 1), par('Tobj', 'Termostato', 'K', 0, 0, 2000, 1, { ayuda: 'La potencia baja a cero al llegar a esta temperatura; 0: sin termostato|Thermostat' })],
  banoRec: [par('Tb', 'Temperatura', 'K', 300, 50, 2000, 1), par('Gb', 'Conducción', 'W/K', 2, 0.01, 50, 0.01), par('contacto', 'Al empezar', '', 'si', 0, 0, 0, { opciones: [['si', 'En contacto'], ['no', 'Aislado']] })],
  valvula: [par('tau', 'Tiempo', 's', 0.5, 0.02, 20, 0.01, { ayuda: 'Tiempo característico: cuanto menor, más deprisa pasa el gas|Valve time' })],
  tabique: [par('G', 'Conducción', 'W/K', 0, 0, 50, 0.1, { ayuda: '0: tabique aislante; si no, conduce calor|Partition conductance' })],
  emboloLibre: [],
  globo: [par('V', 'Volumen', 'm³', 3000, 100, 10000, 10), par('M', 'Masa', 'kg', 500, 10, 5000, 10, { ayuda: 'Estructura, sin el aire de dentro|Mass' }),
    par('Fc', 'Quemador', 'MW', 5, 0.1, 20, 0.1), par('Tmax', 'Termostato', 'K', 400, 300, 600, 1, { ayuda: 'El quemador se apaga al llegar a esta temperatura|Thermostat' })],
  columna: [par('prof', 'Profundidad', 'm', 50, 2, 100, 1), par('V0', 'Burbuja', 'cm³', 1, 0.1, 10, 0.1, { ayuda: 'Volumen de la burbuja en el fondo|Bubble volume' }),
    par('Tf', 'Fondo', '°C', 17, 0, 40, 1), par('Ts', 'Superficie', '°C', 27, 0, 40, 1), par('rho', 'Densidad', 'kg/m³', 1000, 500, 14000, 10)],
});

/** Montaje vacío del laboratorio. */
export const montajeLabVacio = () => ({ atm: defectos(PARAMS_LAB.atm), escena: defectos(PARAMS_LAB.escena), objetos: [], separadores: [] });
const recipientes = m => m.objetos.filter(o => o.tipo === 'recipiente');
const cilindroDe = m => m.objetos.find(o => o.tipo === 'cilindro') || null;
/** Moles de un gas ideal a P (kPa), V (L) y T (K), redondeados. */
const molesDe = (PkPa, VL, T) => Number((PkPa * 1e3 * VL * 1e-3 / (R * T)).toPrecision(3));
const sepDefecto = id => ({ id, tipo: 'valvula', tau: 0.5 });

/** Montaje que simula la entrada: 'cilindro', 'recipientes', 'abierto', 'burbuja' o 'vacio'. */
export function tipoMontajeLab(m) {
  const o = m.objetos;
  if (!o.length) return 'vacio';
  if (o.some(x => x.tipo === 'cilindro')) return 'cilindro';
  if (o.some(x => x.tipo === 'globo')) return 'abierto';
  if (o.some(x => x.tipo === 'columna')) return 'burbuja';
  return 'recipientes';
}

/**
 * Pieza seleccionable: 'atm', 'escena', id de objeto, id/gas, id/embolo,
 * id/pesa, id/calentador, id/bano o sep:j. Devuelve su clase de
 * parámetros, el objeto que los guarda, su nombre y su icono.
 */
export function piezaLab(m, sel) {
  if (sel === 'atm') return { clase: 'atm', holder: m.atm, nombre: 'Atmósfera', ico: 'o-atmosfera' };
  if (sel === 'escena') return { clase: 'escena', holder: m.escena, nombre: 'Escena propia', ico: 'i-escena' };
  if (/^sep:\d+$/.test(sel)) {
    const s = m.separadores[+sel.slice(4)]; if (!s) return null;
    return s.tipo === 'valvula' ? { clase: 'valvula', holder: s, nombre: 'Válvula', ico: 'o-valvula' }
      : s.tipo === 'pared' ? { clase: 'tabique', holder: s, nombre: 'Tabique', ico: 'o-tabique' } : { clase: 'emboloLibre', holder: s, nombre: 'Émbolo libre', ico: 'o-embolo' };
  }
  const [id, parte] = String(sel).split('/'), o = m.objetos.find(x => x.id === id);
  if (!o) return null;
  const rec = o.tipo === 'recipiente', cil = o.tipo === 'cilindro', nom = rec ? `Recipiente ${nombreRecipiente(m, id)}` : '';
  if (!parte) return { clase: o.tipo, holder: o, nombre: cil ? 'Cilindro' : rec ? nom : o.tipo === 'globo' ? 'Globo aerostático' : 'Columna de líquido', ico: `o-${o.tipo === 'columna' ? 'columna-liquido' : o.tipo}` };
  if (parte === 'gas' && o.gas) return { clase: cil ? 'gasCil' : 'gasRec', holder: o.gas, nombre: rec ? `Gas de ${nombreRecipiente(m, id)}` : 'Gas', ico: 'o-gas' };
  if (parte === 'embolo' && cil) return { clase: 'emboloCil', holder: o.embolo, nombre: 'Émbolo', ico: 'o-embolo' };
  if (parte === 'pesa' && cil && o.pesa) return { clase: 'pesa', holder: o.pesa, nombre: 'Pesa', ico: 'o-pesa' };
  if (parte === 'calentador' && o.calentador) return { clase: cil ? 'calCil' : 'calRec', holder: o.calentador, nombre: rec ? `Calentador de ${nombreRecipiente(m, id)}` : 'Calentador', ico: 'o-calentador' };
  if (parte === 'bano' && o.bano) return { clase: cil ? 'banoCil' : 'banoRec', holder: o.bano, nombre: rec ? `Baño de ${nombreRecipiente(m, id)}` : 'Baño térmico', ico: 'o-bano-termico' };
  return null;
}
/** Letra de un recipiente por su orden de izquierda a derecha (A, B, C…). */
export const nombreRecipiente = (m, id) => 'ABCDEFGH'[recipientes(m).findIndex(o => o.id === id)] || '?';

/**
 * Valida un montaje del laboratorio: null si el motor lo sabe simular, o el
 * mensaje que explica por qué no y cómo arreglarlo.
 * @returns {string|null}
 */
export function validarLab(m) {
  const n = t => m.objetos.filter(o => o.tipo === t).length;
  const cil = n('cilindro'), rec = n('recipiente'), glo = n('globo'), col = n('columna');
  if (cil > 1) return 'Solo cabe un cilindro: el motor del cilindro simula uno.';
  if (cil && rec) return 'Un cilindro no se puede conectar con recipientes: el motor los simula por separado. Quita uno de los dos o empieza una escena vacía.';
  if (glo && m.objetos.length > 1) return 'El globo se simula solo: quita los demás objetos o empieza una escena vacía.';
  if (col && m.objetos.length > 1) return 'La columna de líquido se simula sola: quita los demás objetos o empieza una escena vacía.';
  if (rec > 6) return 'Caben seis recipientes como mucho.';
  if (m.separadores.length !== Math.max(0, rec - 1)) return 'Entre cada par de recipientes vecinos tiene que haber una válvula, un tabique o un émbolo.';
  const rs = recipientes(m), conGas = r => !!(r.gas && r.gas.n > 0);
  for (let j = 0; j < m.separadores.length; j++) {
    if (m.separadores[j].tipo !== 'valvula' && Math.abs(rs[j].S - rs[j + 1].S) > 1e-9) {
      return `${m.separadores[j].tipo === 'embolo' ? 'Un émbolo libre' : 'Un tabique'} separa dos partes de un mismo tubo: los recipientes ${'ABCDEFGH'[j]} y ${'ABCDEFGH'[j + 1]} tienen que tener la misma sección.`;
    }
    if (m.separadores[j].tipo === 'embolo' && (!conGas(rs[j]) || !conGas(rs[j + 1]))) {
      return `Un émbolo libre necesita gas a los dos lados: el recipiente ${!conGas(rs[j]) ? 'ABCDEFGH'[j] : 'ABCDEFGH'[j + 1]} está vacío y contra el vacío no hay equilibrio.`;
    }
  }
  const c = cilindroDe(m);
  if (c) {
    if (c.hTopes > c.Hc - 0.08 + 1e-9) return `Los topes tienen que quedar por debajo de la boca del cilindro: como mucho a ${(c.Hc - 0.08).toFixed(2)} m.`;
    if (c.bano && c.angulo !== 0) return 'El baño solo rodea un cilindro vertical: pon la inclinación a 0° o quita el baño.';
    const P0 = m.atm.P0 * 1e3, A = c.A * 1e-4, cos = Math.cos(c.angulo * Math.PI / 180);
    if (!(P0 + c.embolo.m * G9 * cos / A > 0) || (c.pesa && !(P0 + (c.embolo.m + c.pesa.M) * G9 * cos / A > 0))) {
      return 'Con esa inclinación el peso del émbolo supera a la atmósfera y lo saca del cilindro: reduce la masa o la inclinación.';
    }
  }
  return null;
}
const comprobar = m => { const e = validarLab(m); if (e) fallo(e); return m; };

/**
 * Coloca un objeto de la paleta. donde: {obj: id del objeto bajo el cursor,
 * hueco: índice del hueco entre recipientes, x: posición de mundo}. Devuelve
 * {montaje, sel} o lanza un Error con el motivo (el montaje no cambia).
 */
export function colocarLab(m0, herr, donde = {}) {
  const m = copia(m0), o = donde.obj ? m.objetos.find(x => x.id === donde.obj) : null;
  const cil = cilindroDe(m), rs = recipientes(m);
  const solo = { globo: 'El globo se simula solo', columna: 'La columna de líquido se simula sola' };
  const otro = m.objetos.find(x => solo[x.tipo]);
  if (otro && herr !== otro.tipo) fallo(`${solo[otro.tipo]}: ${herr === 'calentador' && otro.tipo === 'globo' ? 'ya tiene su quemador; cambia su potencia en el inspector' : 'empieza una escena vacía para montar otra cosa'}.`);
  switch (herr) {
    case 'cilindro': {
      if (cil) fallo('Ya hay un cilindro: el motor simula uno solo.');
      if (rs.length) fallo('Un cilindro no se puede conectar con recipientes: el motor los simula por separado. Empieza una escena vacía para montarlo.');
      const id = nuevoId(m.objetos, 'c');
      m.objetos.push({ id, tipo: 'cilindro', ...defectos(PARAMS_LAB.cilindro), gas: defectos(PARAMS_LAB.gasCil), embolo: defectos(PARAMS_LAB.emboloCil), pesa: null, calentador: null, bano: null });
      return { montaje: comprobar(m), sel: id };
    }
    case 'recipiente': {
      if (cil) fallo('Un recipiente no se puede conectar con el cilindro: el motor los simula por separado. Quita el cilindro o empieza una escena vacía.');
      if (rs.length >= 6) fallo('Caben seis recipientes como mucho.');
      const id = nuevoId(m.objetos, 'r'), V = 10;
      const nuevo = { id, tipo: 'recipiente', ...defectos(PARAMS_LAB.recipiente), gas: { especie: 'mono', n: molesDe(m.atm.P0, V, m.atm.T0), T: m.atm.T0 }, calentador: null, bano: null };
      const k = Number.isInteger(donde.indice) ? Math.max(0, Math.min(rs.length, donde.indice)) : rs.length;
      insertarRecipiente(m, nuevo, k);
      return { montaje: comprobar(m), sel: id };
    }
    case 'globo': case 'columna': {
      if (m.objetos.length) fallo(`${solo[herr]}: empieza una escena vacía o quita los demás objetos.`);
      const id = nuevoId(m.objetos, herr === 'globo' ? 'g' : 'l');
      m.objetos.push({ id, tipo: herr, ...defectos(PARAMS_LAB[herr]) });
      if (herr === 'globo') m.escena.duracion = 90;
      return { montaje: comprobar(m), sel: id };
    }
    case 'gas': {
      if (!o) fallo(cil ? 'El cilindro ya tiene su gas: cambia la cantidad en el inspector.' : 'El gas va dentro de un recipiente: haz clic sobre uno vacío.');
      if (o.tipo === 'cilindro') fallo('El cilindro ya tiene su gas: cambia la cantidad o la especie en el inspector.');
      if (o.gas && o.gas.n > 0) fallo(`El recipiente ${nombreRecipiente(m, o.id)} ya tiene gas: cambia su especie o su cantidad en el inspector.`);
      o.gas = { especie: 'mono', n: molesDe(m.atm.P0, o.V, m.atm.T0), T: m.atm.T0 };
      return { montaje: comprobar(m), sel: o.id + '/gas' };
    }
    case 'embolo': case 'tabique': case 'valvula': {
      const que = { embolo: 'El émbolo libre', tabique: 'El tabique', valvula: 'La válvula' }[herr];
      if (o && o.tipo === 'cilindro') fallo(herr === 'embolo' ? 'El cilindro ya tiene su émbolo: cambia su masa en el inspector.' : herr === 'valvula' ? 'El cilindro de este motor no tiene válvulas: monta recipientes unidos por una válvula.' : 'Este motor no divide el cilindro: monta dos recipientes con un tabique o un émbolo libre entre ellos.');
      if (!Number.isInteger(donde.hueco) || !m.separadores[donde.hueco]) fallo(`${que} va entre dos recipientes: ${rs.length < 2 ? 'coloca antes dos recipientes y ' : ''}haz clic en el hueco que hay entre ellos.`);
      const j = donde.hueco, id = m.separadores[j].id;
      m.separadores[j] = herr === 'embolo' ? { id, tipo: 'embolo' } : herr === 'tabique' ? { id, tipo: 'pared', ...defectos(PARAMS_LAB.tabique) } : { id, tipo: 'valvula', ...defectos(PARAMS_LAB.valvula) };
      return { montaje: comprobar(m), sel: 'sep:' + j };
    }
    case 'pesa': {
      if (!cil) fallo('La pesa va sobre el émbolo de un cilindro: coloca antes un cilindro.');
      if (cil.pesa) fallo('El cilindro ya tiene su pesa: cambia su masa en el inspector.');
      cil.pesa = defectos(PARAMS_LAB.pesa);
      return { montaje: comprobar(m), sel: cil.id + '/pesa' };
    }
    case 'calentador': case 'bano': {
      const destino = o || (cil && !rs.length ? cil : rs.length === 1 ? rs[0] : null);
      const que = herr === 'calentador' ? 'El calentador' : 'El baño';
      if (!destino) fallo(`${que} va en el cilindro o en un recipiente: haz clic sobre uno.`);
      if (destino[herr]) fallo(`${destino.tipo === 'cilindro' ? 'El cilindro' : `El recipiente ${nombreRecipiente(m, destino.id)}`} ya tiene ${herr === 'calentador' ? 'calentador' : 'baño'}: cambia sus valores en el inspector.`);
      if (destino.tipo === 'cilindro') destino[herr] = herr === 'calentador' ? defectos(PARAMS_LAB.calCil) : { T: m.atm.T0 };
      else destino[herr] = herr === 'calentador' ? defectos(PARAMS_LAB.calRec) : { ...defectos(PARAMS_LAB.banoRec), Tb: m.atm.T0 };
      return { montaje: comprobar(m), sel: `${destino.id}/${herr}` };
    }
    case 'resorte': fallo('El motor del cilindro aún no tiene resortes: la fuerza sobre el émbolo es la del gas, la atmósfera y los pesos.');
    // falls through
    default: fallo('Ese objeto no se puede colocar aquí.');
  }
  return null;
}
/** Inserta un recipiente en la posición k de la fila con una válvula cerrada en el hueco nuevo. */
function insertarRecipiente(m, nuevo, k) {
  const rs = recipientes(m), N = rs.length;
  if (N) { const sep = sepDefecto(nuevoId(m.separadores, 's')); m.separadores.splice(k < N ? k : k - 1, 0, sep); }
  const antes = k < N ? m.objetos.indexOf(rs[k]) : m.objetos.length;
  m.objetos.splice(antes, 0, nuevo);
}

/** Mueve un recipiente a la posición k de la fila (los separadores se quedan en sus huecos). */
export function reordenarLab(m0, id, k) {
  const m = copia(m0), rs = recipientes(m), o = rs.find(x => x.id === id);
  if (!o) return m;
  m.objetos.splice(m.objetos.indexOf(o), 1);
  const resto = recipientes(m), kk = Math.max(0, Math.min(resto.length, k));
  const antes = kk < resto.length ? m.objetos.indexOf(resto[kk]) : m.objetos.length;
  m.objetos.splice(antes, 0, o);
  return comprobar(m);
}

/** Quita la pieza seleccionada. Devuelve {montaje, sel} con la pieza padre seleccionada, o lanza con el motivo. */
export function quitarLab(m0, sel) {
  const m = copia(m0);
  if (sel === 'atm' || sel === 'escena') fallo(sel === 'atm' ? 'La atmósfera no se puede quitar: cambia su presión o su temperatura.' : 'Selecciona el objeto que quieres quitar.');
  if (/^sep:\d+$/.test(sel)) {
    const j = +sel.slice(4), s = m.separadores[j];
    if (!s) fallo('Ese separador ya no existe.');
    if (s.tipo === 'valvula') fallo('Entre dos recipientes siempre hay algo: pon un tabique o un émbolo encima de la válvula, o quita uno de los recipientes.');
    m.separadores[j] = sepDefecto(s.id);
    return { montaje: comprobar(m), sel: 'sep:' + j };
  }
  const [id, parte] = String(sel).split('/'), o = m.objetos.find(x => x.id === id);
  if (!o) fallo('Ese objeto ya no existe.');
  if (!parte) {
    if (o.tipo === 'recipiente') {
      const k = recipientes(m).indexOf(o);
      if (m.separadores.length) m.separadores.splice(k > 0 ? k - 1 : 0, 1);
    }
    m.objetos.splice(m.objetos.indexOf(o), 1);
    const v = validarLab(m);
    if (v) fallo(`No se puede quitar: ${v.charAt(0).toLowerCase()}${v.slice(1)}`);
    return { montaje: m, sel: 'escena' };
  }
  if (parte === 'gas') {
    if (o.tipo === 'cilindro') fallo('El cilindro necesita gas bajo el émbolo: cambia su cantidad, o quita el cilindro entero.');
    o.gas = null;
  } else if (parte === 'embolo') fallo('El émbolo es parte del cilindro: quita el cilindro entero.');
  else if (['pesa', 'calentador', 'bano'].includes(parte)) o[parte] = null;
  else fallo('Esa pieza no se puede quitar.');
  const v = validarLab(m);
  if (v) fallo(`No se puede quitar: ${v.charAt(0).toLowerCase()}${v.slice(1)}`);
  return { montaje: m, sel: id };
}

/** Cambia un parámetro de una pieza. Devuelve el montaje nuevo o lanza con el motivo. */
export function ajustarLab(m0, sel, k, valor) {
  const m = copia(m0), p = piezaLab(m, sel);
  if (!p || !ponerParametro(p.holder, PARAMS_LAB[p.clase], k, valor)) fallo('Ese valor no es válido.');
  const c = cilindroDe(m);
  if (c && sel === c.id && k === 'Hc' && c.hTopes > c.Hc - 0.08) c.hTopes = Number(Math.max(0.05, c.Hc - 0.08).toFixed(2));
  return comprobar(m);
}

/** Identidad de las piezas de los recipientes por índice: para no perder las acciones al cambiar la fila. */
export const firmaRecipientes = m => ({ comp: recipientes(m).map(o => o.id), sep: m.separadores.map(s => s.id) });
/**
 * Acciones que siguen teniendo sentido tras cambiar el montaje: las de los
 * recipientes se vuelven a numerar por la identidad de su pieza; las de una
 * pieza que ya no existe (o ya no es válvula, ya no tiene calentador o baño)
 * se quitan.
 */
export function guionValidoLab(m, guion, firmaAntes = null) {
  const tipo = tipoMontajeLab(m), ahora = firmaRecipientes(m), rs = recipientes(m), c = cilindroDe(m);
  return guion.filter(a => {
    if (tipo === 'cilindro') return a.tipo === 'pesa' ? !!(c && c.pesa) : a.tipo === 'calentador' ? !!(c && c.calentador) : a.tipo === 'paredes' || a.tipo === 'giro';
    if (tipo === 'abierto') return a.tipo === 'calentador';
    if (tipo !== 'recipientes' || !Number.isInteger(a.i)) return false;
    return true;
  }).map(a => {
    if (tipo !== 'recipientes') return { ...a };
    const lista = a.tipo === 'valvula' ? 'sep' : 'comp', id = firmaAntes ? firmaAntes[lista][a.i] : ahora[lista][a.i];
    const i = ahora[lista].indexOf(id);
    if (i < 0) return null;
    if (a.tipo === 'valvula' && m.separadores[i].tipo !== 'valvula') return null;
    if (a.tipo === 'calentador' && !rs[i].calentador) return null;
    if (a.tipo === 'bano' && !rs[i].bano) return null;
    return { ...a, i };
  }).filter(Boolean);
}

/** Geometría del cilindro para la pantalla (como la de las escenas del catálogo). */
const geoCilindro = c => ({ Hc: c.Hc, hMax: c.hTopes, tanque: !!c.bano, angulo: c.angulo, simEmbolo: 'm' });

/**
 * Entrada del motor (SI) del montaje y lo que la pantalla necesita para
 * dibujarlo. No valida: llama antes a validarLab.
 */
export function entradaLab(m) {
  const tipo = tipoMontajeLab(m), P0 = m.atm.P0 * 1e3, T0 = m.atm.T0;
  if (tipo === 'cilindro') {
    const c = cilindroDe(m);
    return { tipo, geo: geoCilindro(c), entrada: {
      n: c.gas.n, A: c.A * 1e-4, P0, T0: c.bano ? c.bano.T : T0, g: G9, m: c.embolo.m, M: c.pesa ? c.pesa.M : 0, Fc: c.calentador ? c.calentador.Fc : 0,
      G: c.G, b: c.embolo.b, angulo: c.angulo, especie: c.gas.especie,
    } };
  }
  if (tipo === 'recipientes') {
    const rs = recipientes(m), claves = [];
    for (const r of rs) if (r.gas && !claves.includes(r.gas.especie)) claves.push(r.gas.especie);
    if (!claves.length) claves.push('mono');
    const especies = claves.map(k => ({ nombre: ESPECIES_GAS[k].nombre, f: ESPECIES_GAS[k].f, M: ESPECIES_GAS[k].M }));
    const compartimientos = rs.map(r => {
      const n = claves.map(k => (r.gas && r.gas.especie === k ? r.gas.n : 0));
      const c = { V: r.V * 1e-3, n, T: r.gas ? r.gas.T : T0 };
      if (r.bano) Object.assign(c, { Tb: r.bano.Tb, Gb: r.bano.Gb, bano: r.bano.contacto !== 'no' });
      if (r.calentador) Object.assign(c, { Fc: r.calentador.Fc, ...(r.calentador.Tobj > 0 ? { Tobj: r.calentador.Tobj } : {}) });
      return c;
    });
    const separadores = m.separadores.map(s => (s.tipo === 'valvula' ? { tipo: 'valvula', tau: s.tau } : s.tipo === 'pared' ? { tipo: 'pared', G: s.G } : { tipo: 'embolo' }));
    return { tipo, entrada: { especies, compartimientos, separadores }, nombres: rs.map((_, i) => 'ABCDEFGH'[i]), secciones: rs.map(r => r.S * 1e-4) };
  }
  if (tipo === 'abierto') {
    const g = m.objetos[0], Mm = 0.029;
    return { tipo, entrada: { V: g.V, P0, T0, Mm, M: g.M, Fc: g.Fc * 1e6, Tobj: g.Tmax, H: R * T0 / (Mm * G9), CdA: 100, g: G9 } };
  }
  if (tipo === 'burbuja') {
    const l = m.objetos[0];
    return { tipo, entrada: { V0: l.V0 * 1e-6, prof: l.prof, P0, rho: l.rho, g: G9, Tfondo: K0 + l.Tf, Tsup: K0 + l.Ts, rapidez: 1, f: 5 }, duracion: l.prof * 1.15 };
  }
  return { tipo, entrada: null };
}

/**
 * Escena con la forma de las del catálogo (termodinamica-escenas.js) para un
 * montaje propio: la pantalla la simula y la dibuja igual.
 */
export function escenaLab(m, titulo = 'Escena propia') {
  const x = entradaLab(m), dur = x.duracion ?? m.escena.duracion;
  return {
    clave: 'propia', propio: true, espacio: 'laboratorio-de-gases', tipo: 'Propio', titulo, montaje: x.tipo, duracion: dur,
    variables: {}, construir: () => copia(x.entrada), guion: () => [], geo: x.geo, nombres: x.nombres, secciones: x.secciones,
    especie: x.entrada && x.entrada.especie, modelo: 'dinamico',
    nota: x.tipo === 'vacio' ? 'Escena vacía: coloca un cilindro, recipientes, un globo o una columna de líquido con la paleta de objetos.' : '',
  };
}

const TIPOS_LAB = ['cilindro', 'recipiente', 'globo', 'columna'];
/** Sanea un montaje leído de un archivo. Devuelve {montaje, error}: si no se puede simular, un montaje vacío y el motivo. */
export function sanearLab(d) {
  const m = montajeLabVacio();
  if (!d || typeof d !== 'object') return { montaje: m, error: null };
  m.atm = acotar(d.atm, PARAMS_LAB.atm); m.escena = acotar(d.escena, PARAMS_LAB.escena);
  const ids = new Set();
  const idDe = (x, pref, lista) => { const id = typeof x === 'string' && ID_OK.test(x) && !ids.has(x) ? x : nuevoId(lista, pref); ids.add(id); return id; };
  for (const o of (Array.isArray(d.objetos) ? d.objetos : []).slice(0, 8)) {
    if (!o || !TIPOS_LAB.includes(o.tipo)) continue;
    const n = { id: idDe(o.id, o.tipo[0], m.objetos), tipo: o.tipo, ...acotar(o, PARAMS_LAB[o.tipo]) };
    if (o.tipo === 'cilindro') {
      n.gas = acotar(o.gas, PARAMS_LAB.gasCil); n.embolo = acotar(o.embolo, PARAMS_LAB.emboloCil);
      n.pesa = o.pesa ? acotar(o.pesa, PARAMS_LAB.pesa) : null; n.calentador = o.calentador ? acotar(o.calentador, PARAMS_LAB.calCil) : null; n.bano = o.bano ? acotar(o.bano, PARAMS_LAB.banoCil) : null;
    } else if (o.tipo === 'recipiente') {
      n.gas = o.gas ? acotar(o.gas, PARAMS_LAB.gasRec) : null; n.calentador = o.calentador ? acotar(o.calentador, PARAMS_LAB.calRec) : null; n.bano = o.bano ? acotar(o.bano, PARAMS_LAB.banoRec) : null;
    }
    m.objetos.push(n);
  }
  const N = recipientes(m).length, seps = Array.isArray(d.separadores) ? d.separadores : [];
  for (let j = 0; j < Math.max(0, N - 1); j++) {
    const s = seps[j] || {}, id = idDe(s.id, 's', m.separadores);
    m.separadores.push(s.tipo === 'embolo' ? { id, tipo: 'embolo' } : s.tipo === 'pared' ? { id, tipo: 'pared', ...acotar(s, PARAMS_LAB.tabique) } : { id, tipo: 'valvula', ...acotar(s, PARAMS_LAB.valvula) });
  }
  const c = cilindroDe(m); if (c && c.hTopes > c.Hc - 0.08) c.hTopes = Number(Math.max(0.05, c.Hc - 0.08).toFixed(2));
  const error = validarLab(m);
  return error ? { montaje: montajeLabVacio(), error } : { montaje: m, error: null };
}

// ---------------------------------------------------------------------------
// Escena del catálogo → montaje (para modificarla con la paleta)
// ---------------------------------------------------------------------------
const redondo = x => Number(Number(x).toPrecision(12));
/** Cilindro: entrada del motor (SI) y geometría de la escena. */
export function montajeDesdeCilindro(e, geo) {
  const m = montajeLabVacio();
  m.atm = { P0: redondo(e.P0 / 1e3), T0: redondo(e.T0) };
  m.objetos.push({ id: 'c1', tipo: 'cilindro', A: redondo(e.A * 1e4), Hc: geo.Hc, hTopes: redondo(geo.hMax), angulo: redondo(e.angulo ?? 0), G: redondo(e.G ?? 0),
    gas: { n: redondo(e.n), especie: e.especie === 'di' ? 'di' : 'mono' }, embolo: { m: redondo(e.m), b: redondo(e.b ?? 0) },
    pesa: e.M > 0 ? { M: redondo(e.M) } : null, calentador: e.Fc > 0 ? { Fc: redondo(e.Fc) } : null, bano: geo.tanque ? { T: redondo(e.T0) } : null });
  return m;
}
/** Especie de la tabla más parecida a una del motor (por grados de libertad y masa molar). */
function claveEspecie(s) {
  let mejor = s.f === 5 ? 'di' : s.f >= 6 ? 'co2' : 'mono', d = Infinity;
  for (const [k, e] of Object.entries(ESPECIES_GAS)) if (e.f === s.f && Math.abs(e.M - (s.M ?? e.M)) < d) { d = Math.abs(e.M - (s.M ?? e.M)); mejor = k; }
  return mejor;
}
/** Recipientes: escena del motor. Devuelve null si algún recipiente mezcla especies (la paleta no lo monta). */
export function montajeDesdeRecipientes(e, seccion = 0) {
  const m = montajeLabVacio();
  for (const [i, c] of e.compartimientos.entries()) {
    const con = c.n.map((x, s) => [x, s]).filter(([x]) => x > 0);
    if (con.length > 1) return null;
    const S = seccion > 0 ? seccion * 1e4 : 400;
    const r = { id: 'r' + (i + 1), tipo: 'recipiente', V: redondo(c.V * 1e3), S: redondo(S), gas: con.length ? { especie: claveEspecie(e.especies[con[0][1]]), n: redondo(con[0][0]), T: redondo(c.T) } : null,
      calentador: (c.Fc ?? 0) > 0 ? { Fc: redondo(c.Fc), Tobj: Number.isFinite(c.Tobj ?? Infinity) ? redondo(c.Tobj) : 0 } : null,
      bano: (c.Gb ?? 0) > 0 ? { Tb: redondo(c.Tb), Gb: redondo(c.Gb), contacto: c.bano === false ? 'no' : 'si' } : null };
    m.objetos.push(r);
  }
  m.separadores = e.separadores.map((s, j) => (s.tipo === 'embolo' ? { id: 's' + (j + 1), tipo: 'embolo' } : s.tipo === 'pared' ? { id: 's' + (j + 1), tipo: 'pared', G: s.G ?? 0 } : { id: 's' + (j + 1), tipo: 'valvula', tau: s.tau ?? 0.5 }));
  const c0 = e.compartimientos.find(c => c.n.some(x => x > 0));
  if (c0) m.atm.T0 = redondo(c0.T);
  return m;
}
/** Globo: entrada de simularAbierto. */
export function montajeDesdeGlobo(e) {
  const m = montajeLabVacio();
  m.atm = { P0: redondo(e.P0 / 1e3), T0: redondo(e.T0) };
  m.escena.duracion = 90;
  m.objetos.push({ id: 'g1', tipo: 'globo', V: redondo(e.V), M: redondo(e.M), Fc: redondo(e.Fc / 1e6), Tmax: redondo(Math.min(600, Math.max(300, e.Tobj ?? 400))) });
  return m;
}
/** Burbuja: entrada de simularBurbuja. */
export function montajeDesdeBurbuja(e) {
  const m = montajeLabVacio();
  m.atm.P0 = redondo(e.P0 / 1e3);
  m.objetos.push({ id: 'l1', tipo: 'columna', prof: redondo(e.prof), V0: redondo(e.V0 * 1e6), Tf: redondo(e.Tfondo - K0), Ts: redondo(e.Tsup - K0), rho: redondo(e.rho) });
  return m;
}

// ===========================================================================
// Instrumentos (los mismos datos en los tres espacios con lienzo de objetos)
// ===========================================================================
/**
 * Instrumento: {id, tipo, …}. Termómetro y manómetro: anclados a una región
 * (en: id, u, w: posición relativa 0–1 dentro de ella) o libres (x, y de
 * mundo); regla: a y b (mundo); cronómetro: x, y, t0 (arranca), t1 (para; 0:
 * no se para).
 */
export const TIPOS_INSTRUMENTO = Object.freeze(['termometro', 'manometro', 'regla', 'cronometro', 'histograma']);
export const PARAMS_INSTR = Object.freeze({ cronometro: [par('t0', 'Arranca en', 's', 0, 0, 1e4, 0.01), par('t1', 'Para en', 's', 0, 0, 1e4, 0.01, { ayuda: '0: no se para|Stop time' })] });
const fin = x => typeof x === 'number' && Number.isFinite(x);
const punto = p => (Array.isArray(p) && p.length === 2 && fin(p[0]) && fin(p[1]) && Math.abs(p[0]) < 1e7 && Math.abs(p[1]) < 1e7 ? [p[0], p[1]] : null);

/** Instrumento nuevo. donde: {en, u, w} o {x, y}; para la regla, {a, b}. */
export function nuevoInstrumento(lista, tipo, donde = {}) {
  if (!TIPOS_INSTRUMENTO.includes(tipo)) fallo('Ese instrumento no existe.');
  if (lista.length >= 12) fallo('Caben doce instrumentos como mucho: quita alguno.');
  const id = nuevoId(lista, 'i'), o = { id, tipo };
  if (tipo === 'regla') { o.a = punto(donde.a) || [0, 0]; o.b = punto(donde.b) || [o.a[0], o.a[1] + 0.2]; }
  else if (donde.en && (tipo === 'termometro' || tipo === 'manometro' || tipo === 'histograma')) Object.assign(o, { en: String(donde.en), u: numero(donde.u, 0.5, 0, 1), w: numero(donde.w, 0.5, 0, 1) });
  else Object.assign(o, { x: numero(donde.x, 0, -1e7, 1e7), y: numero(donde.y, 0, -1e7, 1e7) });
  if (tipo === 'cronometro') Object.assign(o, defectos(PARAMS_INSTR.cronometro));
  return o;
}
/** Sanea la lista de instrumentos de un archivo. */
export function sanearInstrumentos(d, permitidos = TIPOS_INSTRUMENTO) {
  const lista = [];
  for (const x of (Array.isArray(d) ? d : []).slice(0, 12)) {
    if (!x || !permitidos.includes(x.tipo)) continue;
    const id = typeof x.id === 'string' && ID_OK.test(x.id) && !lista.some(o => o.id === x.id) ? x.id : nuevoId(lista, 'i');
    const o = { id, tipo: x.tipo };
    if (x.tipo === 'regla') { const a = punto(x.a), b = punto(x.b); if (!a || !b) continue; Object.assign(o, { a, b }); }
    else if (typeof x.en === 'string' && /^[a-z:0-9/-]{1,16}$/.test(x.en)) Object.assign(o, { en: x.en, u: numero(x.u, 0.5, 0, 1), w: numero(x.w, 0.5, 0, 1) });
    else if (fin(x.x) && fin(x.y)) Object.assign(o, { x: numero(x.x, 0, -1e7, 1e7), y: numero(x.y, 0, -1e7, 1e7) });
    else continue;
    if (x.columna === true) o.columna = true;
    if (x.tipo === 'cronometro') Object.assign(o, acotar(x, PARAMS_INSTR.cronometro));
    lista.push(o);
  }
  return lista;
}
/** Lectura del cronómetro en t: tiempo desde que arranca hasta t (o hasta que para). */
export const lecturaCronometro = (o, t) => Math.max(0, (o.t1 > o.t0 ? Math.min(t, o.t1) : t) - o.t0);

// ===========================================================================
// Gas molecular
// ===========================================================================
const OPC_MOLECULA = Object.entries(MOLECULAS).map(([k, e]) => [k, e.nombre]);
export const PARAMS_MOL = Object.freeze({
  caja: [par('Lx', 'Ancho', 'nm', 100, 20, 300, 1), par('Ly', 'Alto', 'nm', 60, 20, 200, 1)],
  bomba: [par('especie', 'Especie', '', 'Ar', 0, 0, 0, { opciones: OPC_MOLECULA }), par('N', 'Moléculas', '', 100, 1, 500, 1), par('T', 'Temperatura', 'K', 300, 20, 3000, 10)],
  tabique: [par('x', 'Posición', 'nm', 50, 5, 295, 1), par('hueco', 'Orificio', 'nm', 4, 0.5, 200, 0.5), par('abierto', 'Al empezar', '', 'si', 0, 0, 0, { opciones: [['si', 'Abierto'], ['no', 'Cerrado']] }),
    par('cambio', 'Cambia en', 'ns', 0, 0, 100, 0.1, { ayuda: 'Instante en que el orificio se abre o se cierra; 0: no cambia|Toggle time' })],
  embolo: [par('u', 'Velocidad', 'm/s', -20, -200, 200, 1, { ayuda: 'Negativa: comprime; positiva: expande|Piston velocity' }), par('t0', 'Desde', 'ns', 0.5, 0, 100, 0.1), par('t1', 'Hasta', 'ns', 2.5, 0, 100, 0.1)],
  calentador: [par('T', 'Temperatura', 'K', 600, 20, 3000, 10, { ayuda: 'Las paredes devuelven cada molécula con la distribución de esta temperatura|Wall temperature' })],
  escena: [par('duracion', 'Duración', 'ns', 4, 0.5, 40, 0.1)],
});
export const montajeMolVacio = () => ({ caja: null, bombas: [], tabique: null, embolo: null, calentador: null, escena: defectos(PARAMS_MOL.escena) });

export function piezaMol(m, sel) {
  if (sel === 'escena') return { clase: 'escena', holder: m.escena, nombre: 'Escena propia', ico: 'i-escena' };
  if (sel === 'caja' && m.caja) return { clase: 'caja', holder: m.caja, nombre: 'Caja', ico: 'o-caja-molecular' };
  if (sel === 'tabique' && m.tabique) return { clase: 'tabique', holder: m.tabique, nombre: 'Tabique con orificio', ico: 'o-orificio' };
  if (sel === 'embolo' && m.embolo) return { clase: 'embolo', holder: m.embolo, nombre: 'Émbolo', ico: 'o-embolo' };
  if (sel === 'calentador' && m.calentador) return { clase: 'calentador', holder: m.calentador, nombre: 'Paredes calientes', ico: 'o-calentador' };
  const b = m.bombas.find(x => x.id === sel);
  if (b) return { clase: 'bomba', holder: b, nombre: `Bomba de ${MOLECULAS[b.especie].nombre}`, ico: 'o-bomba' };
  return null;
}
/** Posición final de la pared derecha (nm) tras los tramos del émbolo. */
export const finalEmbolo = m => (m.caja ? m.caja.Lx + (m.embolo ? m.embolo.u * Math.max(0, m.embolo.t1 - m.embolo.t0) : 0) : 0);

export function validarMol(m) {
  if (!m.caja) return m.bombas.length || m.tabique || m.embolo || m.calentador ? 'Las bombas, el orificio, el émbolo y el calentador van en una caja: coloca antes una caja.' : null;
  const { Lx, Ly } = m.caja;
  if (m.bombas.length > 3) return 'Caben tres especies como mucho.';
  const N = m.bombas.reduce((s, b) => s + b.N, 0);
  if (N > 600) return `Demasiadas moléculas (${N}): el lienzo sigue bien hasta 600. Quita alguna.`;
  if (m.tabique) {
    if (!(m.tabique.x > 2 && m.tabique.x < Lx - 2)) return 'El tabique tiene que quedar dentro de la caja.';
    if (m.tabique.hueco >= Ly) return 'El orificio no puede ser más alto que la caja.';
  }
  if (m.embolo) {
    if (!(m.embolo.t1 > m.embolo.t0)) return 'El émbolo tiene que acabar de moverse después de empezar.';
    const X = finalEmbolo(m), min = m.tabique ? m.tabique.x + 4 : 10;
    if (X < min) return m.tabique ? 'El émbolo chocaría con el tabique: muévelo menos tiempo o más despacio.' : 'El émbolo aplastaría la caja: muévelo menos tiempo o más despacio.';
    if (X > 400) return 'El émbolo se iría demasiado lejos: muévelo menos tiempo o más despacio.';
  }
  // Las moléculas tienen que caber en su lado (área de los discos frente a la del lado)
  const lado = b => (m.tabique ? (b.x < m.tabique.x ? m.tabique.x : Lx - m.tabique.x) : Lx) * Ly;
  for (const b of m.bombas) {
    const r = MOLECULAS[b.especie].r * 1e9, ocupa = m.bombas.filter(q => !m.tabique || (q.x < m.tabique.x) === (b.x < m.tabique.x)).reduce((s, q) => s + q.N * Math.PI * (MOLECULAS[q.especie].r * 1e9) ** 2, 0);
    if (ocupa > 0.3 * lado(b)) return 'No caben tantas moléculas en ese lado de la caja: agranda la caja o quita moléculas.';
    void r;
  }
  return null;
}
const comprobarMol = m => { const e = validarMol(m); if (e) fallo(e); return m; };

/** Coloca un objeto en la caja. donde: {x} en nm. */
export function colocarMol(m0, herr, donde = {}) {
  const m = copia(m0), x = numero(donde.x, NaN);
  if (herr !== 'caja' && !m.caja) fallo('Primero coloca una caja: las moléculas, el orificio y el émbolo van dentro.');
  switch (herr) {
    case 'caja':
      if (m.caja) fallo('Ya hay una caja: cambia su tamaño en el inspector o arrastrando su émbolo.');
      m.caja = defectos(PARAMS_MOL.caja);
      if (!m.bombas.length) m.bombas.push({ id: 'b1', ...defectos(PARAMS_MOL.bomba), N: 150, x: 20 });
      return { montaje: comprobarMol(m), sel: 'caja' };
    case 'bomba': {
      if (m.bombas.length >= 3) fallo('Caben tres especies como mucho: cambia la cantidad de una bomba en el inspector.');
      const usadas = new Set(m.bombas.map(b => b.especie)), especie = ['Ar', 'He', 'N2', 'O2'].find(k => !usadas.has(k)) || 'Ar';
      const id = nuevoId(m.bombas, 'b');
      m.bombas.push({ id, ...defectos(PARAMS_MOL.bomba), especie, x: Number.isFinite(x) ? Math.max(2, Math.min(m.caja.Lx - 2, x)) : m.caja.Lx / 2 });
      return { montaje: comprobarMol(m), sel: id };
    }
    case 'orificio':
      if (m.tabique) fallo('Ya hay un tabique con orificio: arrástralo o cambia su orificio en el inspector.');
      m.tabique = { ...defectos(PARAMS_MOL.tabique), x: Number.isFinite(x) ? Math.round(Math.max(10, Math.min(m.caja.Lx - 10, x))) : Math.round(m.caja.Lx / 2) };
      return { montaje: comprobarMol(m), sel: 'tabique' };
    case 'embolo':
      if (m.embolo) fallo('La caja ya tiene su émbolo: cambia su velocidad en el inspector.');
      m.embolo = defectos(PARAMS_MOL.embolo);
      if (m.tabique && finalEmbolo(m) < m.tabique.x + 4) m.embolo.t1 = Number((m.embolo.t0 + 0.5 * (m.caja.Lx - m.tabique.x) / Math.abs(m.embolo.u)).toFixed(1));
      return { montaje: comprobarMol(m), sel: 'embolo' };
    case 'calentador':
      if (m.calentador) fallo('Las paredes ya están calientes: cambia su temperatura en el inspector.');
      m.calentador = defectos(PARAMS_MOL.calentador);
      return { montaje: comprobarMol(m), sel: 'calentador' };
    default: fallo('Ese objeto no se puede colocar aquí.');
  }
  return null;
}
export function quitarMol(m0, sel) {
  const m = copia(m0);
  if (sel === 'caja') return { montaje: montajeMolVacio(), sel: 'escena' };
  if (['tabique', 'embolo', 'calentador'].includes(sel)) { if (!m[sel]) fallo('Esa pieza ya no existe.'); m[sel] = null; return { montaje: comprobarMol(m), sel: 'caja' }; }
  const i = m.bombas.findIndex(b => b.id === sel);
  if (i < 0) fallo(sel === 'escena' ? 'Selecciona el objeto que quieres quitar.' : 'Esa pieza no se puede quitar.');
  m.bombas.splice(i, 1);
  return { montaje: comprobarMol(m), sel: 'caja' };
}
export function ajustarMol(m0, sel, k, valor) {
  const m = copia(m0), p = piezaMol(m, sel);
  if (!p || !ponerParametro(p.holder, PARAMS_MOL[p.clase], k, valor)) fallo('Ese valor no es válido.');
  if (m.caja) for (const b of m.bombas) b.x = Math.max(2, Math.min(m.caja.Lx - 2, b.x));
  return comprobarMol(m);
}
/** Mueve una pieza a la posición x (nm): bomba, tabique o la pared derecha (ancho de la caja). */
export function moverMol(m0, sel, x) {
  const m = copia(m0);
  if (!m.caja) return m;
  if (sel === 'tabique' && m.tabique) m.tabique.x = Math.round(Math.max(5, Math.min(m.caja.Lx - 5, x)));
  else if (sel === 'embolo' || sel === 'caja') { m.caja.Lx = Math.round(Math.max(m.tabique ? m.tabique.x + 6 : 20, Math.min(300, x))); for (const b of m.bombas) b.x = Math.min(b.x, m.caja.Lx - 2); }
  else { const b = m.bombas.find(q => q.id === sel); if (b) b.x = Math.round(Math.max(2, Math.min(m.caja.Lx - 2, x)) * 2) / 2; }
  return comprobarMol(m);
}

/** Entrada de simularMolecular (SI). */
export function entradaMol(m) {
  if (!m.caja || !m.bombas.length) return null;
  const nm = 1e-9, tab = m.tabique;
  const e = {
    Lx: m.caja.Lx * nm, Ly: m.caja.Ly * nm, T: m.bombas[0].T, semilla: 11, paredes: m.calentador ? 'termica' : 'adiabatica',
    especies: m.bombas.map(b => ({ nombre: MOLECULAS[b.especie].nombre, m: MOLECULAS[b.especie].u * UMA, r: MOLECULAS[b.especie].r, N: Math.round(b.N), T: b.T, region: tab ? (b.x < tab.x ? 'izq' : 'der') : 'toda' })),
  };
  if (m.calentador) e.Tpared = m.calentador.T;
  if (tab) { e.tabique = { x: tab.x * nm, hueco: tab.hueco * nm, abierto: tab.abierto !== 'no' }; if (tab.cambio > 0) e.orificio = [{ t: tab.cambio * nm, abierto: tab.abierto === 'no' }]; }
  if (m.embolo) e.embolo = [{ t0: m.embolo.t0 * nm, t1: m.embolo.t1 * nm, u: m.embolo.u }];
  return e;
}
export function escenaMol(m, titulo = 'Escena propia') {
  const e = entradaMol(m), dur = m.escena.duracion * 1e-9;
  return { clave: 'propia', propio: true, espacio: 'molecular', tipo: 'Propio', titulo, variables: {}, duracion: dur, cuadro: dur / 1000, construir: () => copia(e), vacia: !e,
    nota: e ? '' : 'Escena vacía: coloca una caja con la paleta de objetos; trae una bomba de argón.' };
}
export function sanearMol(d) {
  const m = montajeMolVacio();
  if (!d || typeof d !== 'object') return { montaje: m, error: null };
  m.escena = acotar(d.escena, PARAMS_MOL.escena);
  if (d.caja) {
    m.caja = acotar(d.caja, PARAMS_MOL.caja);
    for (const b of (Array.isArray(d.bombas) ? d.bombas : []).slice(0, 3)) {
      if (!b) continue;
      const id = typeof b.id === 'string' && ID_OK.test(b.id) && !m.bombas.some(q => q.id === b.id) ? b.id : nuevoId(m.bombas, 'b');
      m.bombas.push({ id, ...acotar(b, PARAMS_MOL.bomba), x: numero(b.x, m.caja.Lx / 2, 2, m.caja.Lx - 2) });
    }
    if (d.tabique) m.tabique = acotar(d.tabique, PARAMS_MOL.tabique);
    if (d.embolo) m.embolo = acotar(d.embolo, PARAMS_MOL.embolo);
    if (d.calentador) m.calentador = acotar(d.calentador, PARAMS_MOL.calentador);
  }
  const error = validarMol(m);
  return error ? { montaje: montajeMolVacio(), error } : { montaje: m, error: null };
}
/** Escena del catálogo (entrada del motor y duración en s) → montaje. */
export function montajeDesdeMolecular(e, duracion) {
  const m = montajeMolVacio(), nm = 1e9, especie = s => Object.keys(MOLECULAS).find(k => MOLECULAS[k].nombre === s.nombre) || 'Ar';
  m.caja = { Lx: redondo(e.Lx * nm), Ly: redondo(e.Ly * nm) };
  m.escena.duracion = redondo(duracion * nm);
  if (e.tabique) {
    const o = (e.orificio || [])[0];
    m.tabique = { x: redondo(e.tabique.x * nm), hueco: redondo(e.tabique.hueco * nm), abierto: e.tabique.abierto === false ? 'no' : 'si', cambio: o ? redondo(o.t * nm) : 0 };
  }
  const xt = m.tabique ? m.tabique.x : m.caja.Lx;
  m.bombas = e.especies.slice(0, 3).map((s, i) => ({ id: 'b' + (i + 1), especie: especie(s), N: s.N, T: redondo(s.T ?? e.T), x: s.region === 'der' ? redondo((xt + m.caja.Lx) / 2) : redondo(Math.min(xt, m.caja.Lx) * (0.2 + 0.25 * i)) }));
  if (e.embolo && e.embolo[0]) m.embolo = { u: e.embolo[0].u, t0: redondo(e.embolo[0].t0 * nm), t1: redondo(e.embolo[0].t1 * nm) };
  if (e.paredes === 'termica') m.calentador = { T: e.Tpared ?? e.T };
  return m;
}

// ===========================================================================
// Calor
// ===========================================================================
/** Materiales de los cuerpos (MATERIALES del motor) y su dibujo. */
export const MATERIALES_CALOR = Object.freeze({ ...MATERIALES, propio: { nombre: 'Otro', c: 1000 } });
const OPC_MATERIAL = Object.entries(MATERIALES_CALOR).map(([k, e]) => [k, e.nombre]);
export const PARAMS_CALOR = Object.freeze({
  cuerpo: [par('material', 'Material', '', 'cobre', 0, 0, 0, { opciones: OPC_MATERIAL }), par('m', 'Masa', 'g', 200, 1, 50000, 1), par('c', 'Calor específico', 'J/(kg·K)', 385, 50, 10000, 1),
    par('T', 'Temperatura', '°C', 80, -100, 1000, 1), par('w', 'Ancho', 'cm', 6, 1, 60, 0.5), par('h', 'Alto', 'cm', 5, 1, 60, 0.5)],
  vaso: [par('material', 'Material', '', 'aluminio', 0, 0, 0, { opciones: OPC_MATERIAL.filter(([k]) => !['agua', 'hielo'].includes(k)) }), par('m', 'Masa', 'g', 100, 1, 5000, 1), par('c', 'Calor específico', 'J/(kg·K)', 897, 50, 10000, 1),
    par('T', 'Temperatura', '°C', 20, -100, 1000, 1), par('w', 'Ancho', 'cm', 24, 6, 80, 0.5), par('h', 'Alto', 'cm', 20, 4, 60, 0.5)],
  calentador: [par('P', 'Potencia', 'W', 100, 1, 5000, 1), par('activo', 'Al empezar', '', 'si', 0, 0, 0, { opciones: [['si', 'Encendido'], ['no', 'Apagado']] })],
  bano: [par('T', 'Temperatura', '°C', 20, -50, 200, 1), par('G', 'Conducción', 'W/K', 5, 0.1, 100, 0.1, { ayuda: 'Conductancia con cada cuerpo que toca el baño|Bath conductance' }), par('w', 'Ancho', 'cm', 40, 10, 150, 1), par('h', 'Alto', 'cm', 16, 4, 60, 1)],
  escena: [par('duracion', 'Duración', 's', 120, 5, 3600, 5), par('G', 'Contacto', 'W/K', 10, 0.1, 100, 0.1, { ayuda: 'Conductancia entre dos cuerpos que se tocan|Contact conductance' })],
});
export const montajeCalorVacio = () => ({ cuerpos: [], calentadores: [], bano: null, escena: defectos(PARAMS_CALOR.escena) });
/** Rectángulo de mundo (m) de un cuerpo o del baño: x es el centro, y la base. */
export const rectCalor = o => ({ x0: o.x - o.w / 200, x1: o.x + o.w / 200, y0: o.y, y1: o.y + o.h / 100 });
const TOL = 0.002;
const dentroDe = (a, b) => a.x0 >= b.x0 - 1e-9 && a.x1 <= b.x1 + 1e-9 && a.y0 >= b.y0 - 1e-9 && a.y1 <= b.y1 + 1e-9;
const tocan = (a, b) => a.x0 <= b.x1 + TOL && b.x0 <= a.x1 + TOL && a.y0 <= b.y1 + TOL && b.y0 <= a.y1 + TOL
  && (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > TOL || Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > TOL);
/** Cuerpo más pequeño que contiene a otro (su recipiente), o null. */
function contenedor(m, c) {
  const r = rectCalor(c), area = q => (q.x1 - q.x0) * (q.y1 - q.y0);
  let mejor = null;
  for (const q of m.cuerpos) if (q !== c && dentroDe(r, rectCalor(q)) && area(rectCalor(q)) > area(r) && (!mejor || area(rectCalor(q)) < area(rectCalor(mejor)))) mejor = q;
  return mejor;
}
/**
 * Contactos que salen de la geometría: un cuerpo toca a su recipiente (el
 * más pequeño que lo contiene) y a los que toca por fuera; nunca a uno que
 * contiene a su recipiente. Devuelve [{a, b, clave}] con índices de cuerpos.
 */
export function contactosCalor(m) {
  const lista = [], N = m.cuerpos.length, cont = m.cuerpos.map(c => contenedor(m, c));
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const a = m.cuerpos[i], b = m.cuerpos[j], ra = rectCalor(a), rb = rectCalor(b);
    let si;
    if (dentroDe(ra, rb) || dentroDe(rb, ra)) si = cont[i] === b || cont[j] === a;
    else si = tocan(ra, rb) && cont[i] === cont[j];
    if (si) lista.push({ a: i, b: j, clave: `${a.id}|${b.id}` });
  }
  return lista;
}
/** Cuerpos que tocan el baño (por dentro o por fuera); los vasos del calorímetro están aislados por fuera. */
export function tocanBano(m) {
  if (!m.bano) return m.cuerpos.map(() => false);
  const rb = rectCalor(m.bano);
  // Solo lo que no está dentro de otro cuerpo: lo de dentro de un vaso o de un líquido intercambia calor con su recipiente
  return m.cuerpos.map(c => c.tipo !== 'vaso' && !contenedor(m, c) && (dentroDe(rectCalor(c), rb) || tocan(rectCalor(c), rb)));
}
export const formaCalor = c => (c.tipo === 'vaso' ? 'vaso' : c.material === 'agua' ? 'agua' : c.material === 'hielo' ? 'hielo' : 'bloque');

export function piezaCalor(m, sel) {
  if (sel === 'escena') return { clase: 'escena', holder: m.escena, nombre: 'Escena propia', ico: 'i-escena' };
  if (sel === 'bano' && m.bano) return { clase: 'bano', holder: m.bano, nombre: 'Baño térmico', ico: 'o-bano-termico' };
  const c = m.cuerpos.find(x => x.id === sel);
  if (c) return { clase: c.tipo === 'vaso' ? 'vaso' : 'cuerpo', holder: c, nombre: c.nombre, ico: c.tipo === 'vaso' ? 'o-calorimetro' : 'o-cuerpo-termico' };
  const h = m.calentadores.find(x => x.id === sel);
  if (h) { const en = m.cuerpos.find(x => x.id === h.en); return { clase: 'calentador', holder: h, nombre: `Calentador de ${en ? en.nombre.toLowerCase() : '?'}`, ico: 'o-calentador' }; }
  return null;
}
export function validarCalor(m) {
  if (m.cuerpos.length > 10) return 'Caben diez cuerpos como mucho.';
  for (const c of m.cuerpos) {
    if (c.material === 'hielo' && c.T > 0) return `El hielo tiene que estar a 0 °C o menos (${c.nombre} está a ${c.T} °C).`;
    if (c.material === 'agua' && c.T < 0) return `El agua líquida tiene que estar a 0 °C o más: para agua helada usa hielo (${c.nombre}).`;
  }
  for (const h of m.calentadores) if (!m.cuerpos.some(c => c.id === h.en)) return 'Cada calentador va dentro de un cuerpo.';
  return null;
}
const comprobarCalor = m => { const e = validarCalor(m); if (e) fallo(e); return m; };
/** Nombre libre para un cuerpo nuevo («Cobre», «Cobre 2»…). */
function nombreLibre(m, base) { let n = base, k = 2; while (m.cuerpos.some(c => c.nombre === n)) n = `${base} ${k++}`; return n; }

/**
 * Apoya un cuerpo: si su base queda cerca (1.5 cm) del suelo, de la cara de
 * arriba de otro o del fondo de un vaso, se pega a esa altura.
 */
function apoyar(m, c) {
  const r = rectCalor(c), cand = [0];
  for (const q of [...m.cuerpos, ...(m.bano ? [m.bano] : [])]) {
    if (q === c) continue;
    const rq = rectCalor(q);
    if (rq.x1 <= r.x0 || rq.x0 >= r.x1) continue;
    if (q.tipo === 'vaso' || q === m.bano) cand.push(rq.y0 + (q === m.bano ? 0 : 0.012));
    if (q.material !== 'agua' && q !== m.bano) cand.push(rq.y1);
  }
  let mejor = c.y, d = 0.015;
  for (const y of cand) if (Math.abs(y - c.y) < d) { d = Math.abs(y - c.y); mejor = y; }
  c.y = Number(Math.max(0, mejor).toFixed(4));
}
/** Coloca un objeto. donde: {x, y} de mundo (m) y en: id del cuerpo bajo el cursor. */
export function colocarCalor(m0, herr, donde = {}) {
  const m = copia(m0), x = numero(donde.x, 0, -50, 50), y = numero(donde.y, 0, 0, 50);
  const en = donde.en ? m.cuerpos.find(c => c.id === donde.en) : null;
  switch (herr) {
    case 'cuerpo': {
      if (m.cuerpos.length >= 10) fallo('Caben diez cuerpos como mucho.');
      const dentroAgua = en && en.material === 'agua';
      const c = { id: nuevoId(m.cuerpos, 'cu'), tipo: 'cuerpo', nombre: nombreLibre(m, 'Cobre'), ...defectos(PARAMS_CALOR.cuerpo), x: Number(x.toFixed(3)), y: 0 };
      c.y = Math.max(0, y - c.h / 200);
      if (dentroAgua) { const r = rectCalor(en); c.x = Math.min(r.x1 - c.w / 200, Math.max(r.x0 + c.w / 200, c.x)); c.y = Math.min(r.y1 - c.h / 100, Math.max(r.y0, c.y)); } else apoyar(m, c);
      m.cuerpos.push(c);
      return { montaje: comprobarCalor(m), sel: c.id };
    }
    case 'calorimetro': {
      if (m.cuerpos.length >= 9) fallo('Caben diez cuerpos como mucho: el calorímetro trae su vaso y su agua.');
      const v = { id: nuevoId(m.cuerpos, 'cu'), tipo: 'vaso', nombre: nombreLibre(m, 'Vaso'), ...defectos(PARAMS_CALOR.vaso), x: Number(x.toFixed(3)), y: 0 };
      m.cuerpos.push(v);
      const a = { id: nuevoId(m.cuerpos, 'cu'), tipo: 'cuerpo', nombre: nombreLibre(m, 'Agua'), material: 'agua', m: 200, c: MATERIALES.agua.c, T: 20, w: v.w - 4, h: Math.round(v.h * 0.6), x: v.x, y: 0.012 };
      m.cuerpos.push(a);
      return { montaje: comprobarCalor(m), sel: v.id };
    }
    case 'calentador': {
      if (!en) fallo('El calentador va dentro de un cuerpo: haz clic sobre uno (el agua de un calorímetro, por ejemplo).');
      if (m.calentadores.some(h => h.en === en.id)) fallo(`${en.nombre} ya tiene calentador: cambia su potencia en el inspector.`);
      const h = { id: nuevoId(m.calentadores, 'ca'), en: en.id, ...defectos(PARAMS_CALOR.calentador) };
      m.calentadores.push(h);
      return { montaje: comprobarCalor(m), sel: h.id };
    }
    case 'bano':
      if (m.bano) fallo('Ya hay un baño: el motor de calor tiene un solo entorno a temperatura fija. Arrástralo o cambia su temperatura.');
      m.bano = { ...defectos(PARAMS_CALOR.bano), x: Number(x.toFixed(3)), y: 0 };
      return { montaje: comprobarCalor(m), sel: 'bano' };
    default: fallo('Ese objeto no se puede colocar aquí.');
  }
  return null;
}
export function quitarCalor(m0, sel) {
  const m = copia(m0);
  if (sel === 'bano') { if (!m.bano) fallo('No hay baño.'); m.bano = null; return { montaje: m, sel: 'escena' }; }
  const i = m.cuerpos.findIndex(c => c.id === sel);
  if (i >= 0) { const id = m.cuerpos[i].id; m.cuerpos.splice(i, 1); m.calentadores = m.calentadores.filter(h => h.en !== id); return { montaje: m, sel: 'escena' }; }
  const k = m.calentadores.findIndex(h => h.id === sel);
  if (k >= 0) { const en = m.calentadores[k].en; m.calentadores.splice(k, 1); return { montaje: m, sel: en }; }
  fallo('Selecciona el objeto que quieres quitar.');
  return null;
}
export function ajustarCalor(m0, sel, k, valor) {
  const m = copia(m0), p = piezaCalor(m, sel);
  if (!p || !ponerParametro(p.holder, PARAMS_CALOR[p.clase], k, valor)) fallo('Ese valor no es válido.');
  const c = p.holder;
  if (k === 'material' && MATERIALES_CALOR[valor]) {
    c.c = MATERIALES_CALOR[valor].c;
    const viejo = c.nombre.replace(/ \d+$/, '');
    if (Object.values(MATERIALES_CALOR).some(q => q.nombre === viejo) && valor !== 'propio') c.nombre = nombreLibre({ cuerpos: m.cuerpos.filter(q => q !== c) }, MATERIALES_CALOR[valor].nombre);
    if (valor === 'hielo' && c.T > 0) c.T = -10;
    if (valor === 'agua' && c.T < 0) c.T = 20;
  }
  if (k === 'c' && (p.clase === 'cuerpo' || p.clase === 'vaso') && c.material !== 'propio' && Math.abs(c.c - MATERIALES_CALOR[c.material].c) > 1e-9) c.material = 'propio';
  return comprobarCalor(m);
}
/** Mueve un cuerpo (con lo que lleva dentro) o el baño a (x, y) y lo apoya. */
export function moverCalor(m0, sel, x, y) {
  const m = copia(m0), o = sel === 'bano' ? m.bano : m.cuerpos.find(c => c.id === sel);
  if (!o) return m;
  const r0 = rectCalor(o), dentro = sel === 'bano' ? [] : m.cuerpos.filter(q => q !== o && dentroDe(rectCalor(q), r0));
  const x0 = o.x, y0 = o.y;
  o.x = Number(numero(x, o.x, -50, 50).toFixed(4)); o.y = Number(numero(y, o.y, 0, 50).toFixed(4));
  if (sel !== 'bano') apoyar({ ...m, cuerpos: m.cuerpos.filter(q => !dentro.includes(q)) }, o);
  const dx = o.x - x0, dy = o.y - y0;
  for (const q of dentro) { q.x = Number((q.x + dx).toFixed(4)); q.y = Number((q.y + dy).toFixed(4)); }
  return m;
}
/** Entrada de simularCalor y dibujo de la pantalla. claves: identidad de cada contacto y calentador para el guion. */
export function entradaCalor(m) {
  if (!m.cuerpos.length) return null;
  const cuerpos = m.cuerpos.map(c => {
    const b = { nombre: c.nombre, m: c.m * 1e-3, c: c.c, T: K0 + c.T };
    if (c.material === 'hielo') b.fusion = { ...MATERIALES.hielo.fusion };
    return b;
  });
  const cs = contactosCalor(m), banos = tocanBano(m);
  const e = { cuerpos, contactos: cs.map(c => ({ a: c.a, b: c.b, G: m.escena.G })),
    calentadores: m.calentadores.map(h => ({ cuerpo: m.cuerpos.findIndex(c => c.id === h.en), P: h.P, activo: h.activo !== 'no' })) };
  if (m.bano && banos.some(Boolean)) e.ambiente = { T: K0 + m.bano.T, G: banos.map(b => (b ? m.bano.G : 0)) };
  return { entrada: e, claves: { contactos: cs.map(c => c.clave), calentadores: m.calentadores.map(h => h.id) },
    dibujo: m.cuerpos.map(c => ({ x: c.x, y: c.y, w: c.w / 100, h: c.h / 100, forma: formaCalor(c), calentador: m.calentadores.some(h => h.en === c.id) })) };
}
export function escenaCalor(m, titulo = 'Escena propia') {
  const x = entradaCalor(m);
  return { clave: 'propia', propio: true, espacio: 'calor', tipo: 'Propio', titulo, variables: {}, duracion: m.escena.duracion, vacia: !x,
    construir: () => copia(x ? x.entrada : null), guion: () => [], dibujo: x ? x.dibujo : [], claves: x ? x.claves : { contactos: [], calentadores: [] },
    nota: x ? '' : 'Escena vacía: coloca cuerpos, un calorímetro o un baño con la paleta de objetos.' };
}
/** Acciones del guion (contacto y calentador, por índice) tras un cambio del montaje: se renumeran por su identidad. */
export function guionValidoCalor(guion, antes, ahora) {
  return guion.map(a => {
    const lista = a.tipo === 'contacto' ? 'contactos' : a.tipo === 'calentador' ? 'calentadores' : null;
    if (!lista) return null;
    const i = ahora[lista].indexOf(antes[lista][a.i]);
    return i < 0 ? null : { ...a, i };
  }).filter(Boolean);
}
export function sanearCalor(d) {
  const m = montajeCalorVacio();
  if (!d || typeof d !== 'object') return { montaje: m, error: null };
  m.escena = acotar(d.escena, PARAMS_CALOR.escena);
  for (const c of (Array.isArray(d.cuerpos) ? d.cuerpos : []).slice(0, 10)) {
    if (!c) continue;
    const tipo = c.tipo === 'vaso' ? 'vaso' : 'cuerpo', id = typeof c.id === 'string' && ID_OK.test(c.id) && !m.cuerpos.some(q => q.id === c.id) ? c.id : nuevoId(m.cuerpos, 'cu');
    m.cuerpos.push({ id, tipo, nombre: texto(c.nombre, tipo === 'vaso' ? 'Vaso' : 'Cuerpo', 24), ...acotar(c, PARAMS_CALOR[tipo]), x: numero(c.x, 0, -50, 50), y: numero(c.y, 0, 0, 50) });
  }
  for (const h of (Array.isArray(d.calentadores) ? d.calentadores : []).slice(0, 10)) {
    if (!h || !m.cuerpos.some(c => c.id === h.en) || m.calentadores.some(q => q.en === h.en)) continue;
    const id = typeof h.id === 'string' && ID_OK.test(h.id) && !m.calentadores.some(q => q.id === h.id) ? h.id : nuevoId(m.calentadores, 'ca');
    m.calentadores.push({ id, en: h.en, ...acotar(h, PARAMS_CALOR.calentador) });
  }
  if (d.bano) m.bano = { ...acotar(d.bano, PARAMS_CALOR.bano), x: numero(d.bano.x, 0, -50, 50), y: numero(d.bano.y, 0, 0, 50) };
  const error = validarCalor(m);
  return error ? { montaje: montajeCalorVacio(), error } : { montaje: m, error: null };
}

// ===========================================================================
// Ciclos: arrastrar un estado en el diagrama P-V
// ===========================================================================
/**
 * Qué se puede arrastrar de un estado: el inicial, P y V; el final de un
 * tramo, lo que ese tramo fija (isocórico: P; recta: P y V; los demás: V).
 * i: índice del tramo que lleva al estado (−1: inicial). Devuelve {P, V}
 * booleanos.
 */
export function libertadEstado(c, i) {
  if (i < 0) return { P: true, V: true };
  const tr = c.tramos[i];
  if (!tr || tr.hasta || tr.corta) return { P: false, V: false };
  if (tr.tipo === 'isocorico') return { P: tr.P != null || tr.T != null, V: false };
  if (tr.tipo === 'recta') return { P: true, V: true };
  return { P: false, V: tr.V != null || tr.T != null };
}
/** Ciclo con el estado movido a (P, V) en SI, según lo que permite su tramo. */
export function moverEstadoCiclo(c, i, P, V) {
  const n = copia(c), lib = libertadEstado(c, i);
  if (!(P > 0) || !(V > 0)) fallo('La presión y el volumen tienen que ser positivos.');
  if (i < 0) { const ini = n.inicio || {}; n.inicio = { nombre: ini.nombre || 'A', P: lib.P ? P : ini.P, V: lib.V ? V : ini.V }; return n; }
  const tr = n.tramos[i];
  if (!lib.P && !lib.V) fallo('Ese estado lo fija otro: no se puede arrastrar.');
  if (lib.P) tr.P = P;
  if (lib.V) tr.V = V;
  delete tr.T;
  return n;
}
