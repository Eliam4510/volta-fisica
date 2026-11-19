/* ==========================================================================
   Volta — núcleo: unidades, expresiones y análisis dimensional
   Los campos numéricos aceptan números con unidad ("72 km/h", "500 g"),
   variables de la escena y expresiones ("sqrt(2*g*h)"). Todo se convierte a
   SI y se comprueba la dimensión. Puro: sin DOM. Nunca usa eval.
   ========================================================================== */

/** Dimensión: exponentes de [longitud, masa, tiempo, corriente, temperatura, cantidad]. */
const D = (L = 0, M = 0, T = 0, I = 0, Th = 0, N = 0) => [L, M, T, I, Th, N];
export const DIM = {
  adimensional: D(), longitud: D(1), masa: D(0, 1), tiempo: D(0, 0, 1), corriente: D(0, 0, 0, 1),
  temperatura: D(0, 0, 0, 0, 1), cantidad: D(0, 0, 0, 0, 0, 1),
  velocidad: D(1, 0, -1), aceleracion: D(1, 0, -2), fuerza: D(1, 1, -2), energia: D(2, 1, -2),
  potencia: D(2, 1, -3), presion: D(-1, 1, -2), frecuencia: D(0, 0, -1), carga: D(0, 0, 1, 1),
  potencial: D(2, 1, -3, -1), capacitancia: D(-2, -1, 4, 2), resistencia: D(2, 1, -3, -2),
  inductancia: D(2, 1, -2, -2), campoElectrico: D(1, 1, -3, -1), campoMagnetico: D(0, 1, -2, -1),
  volumen: D(3), area: D(2), densidad: D(-3, 1), momento: D(1, 1, -1),
};
const NOMBRES = {
  adimensional: 'un número sin unidad', longitud: 'una longitud', masa: 'una masa', tiempo: 'un tiempo',
  corriente: 'una corriente', temperatura: 'una temperatura', cantidad: 'una cantidad de sustancia',
  velocidad: 'una velocidad', aceleracion: 'una aceleración', fuerza: 'una fuerza', energia: 'una energía',
  potencia: 'una potencia', presion: 'una presión', frecuencia: 'una frecuencia', carga: 'una carga',
  potencial: 'un potencial', capacitancia: 'una capacitancia', resistencia: 'una resistencia',
  inductancia: 'una inductancia', campoElectrico: 'un campo eléctrico', campoMagnetico: 'un campo magnético',
  volumen: 'un volumen', area: 'un área', densidad: 'una densidad', momento: 'un momento lineal',
};

/** Unidades: símbolo → [factor a SI, dimensión]. Los ángulos son adimensionales (rad). */
const U = {};
const def = (simbolos, factor, dim) => simbolos.split(' ').forEach(s => { U[s] = [factor, dim]; });
const prefijos = { G: 1e9, M: 1e6, k: 1e3, '': 1, c: 1e-2, m: 1e-3, 'µ': 1e-6, u: 1e-6, n: 1e-9, p: 1e-12 };
function conPrefijos(base, factor, dim, permitidos) {
  for (const p of permitidos) U[p + base] = [prefijos[p] * factor, dim];
}
conPrefijos('m', 1, DIM.longitud, ['k', '', 'c', 'm', 'µ', 'u', 'n']);
conPrefijos('g', 1e-3, DIM.masa, ['k', '', 'm', 'µ', 'u']);
conPrefijos('s', 1, DIM.tiempo, ['', 'm', 'µ', 'u', 'n']);
conPrefijos('N', 1, DIM.fuerza, ['k', '', 'm', 'µ', 'u']);
conPrefijos('J', 1, DIM.energia, ['M', 'k', '', 'm']);
conPrefijos('W', 1, DIM.potencia, ['M', 'k', '', 'm']);
conPrefijos('Pa', 1, DIM.presion, ['M', 'k', '']);
conPrefijos('Hz', 1, DIM.frecuencia, ['M', 'k', '']);
conPrefijos('C', 1, DIM.carga, ['', 'm', 'µ', 'u', 'n', 'p']);
conPrefijos('V', 1, DIM.potencial, ['M', 'k', '', 'm']);
conPrefijos('F', 1, DIM.capacitancia, ['', 'm', 'µ', 'u', 'n', 'p']);
conPrefijos('Ω', 1, DIM.resistencia, ['M', 'k', '']);
conPrefijos('ohm', 1, DIM.resistencia, ['M', 'k', '']);
conPrefijos('A', 1, DIM.corriente, ['', 'm', 'µ', 'u']);
conPrefijos('H', 1, DIM.inductancia, ['', 'm', 'µ', 'u']);
conPrefijos('T', 1, DIM.campoMagnetico, ['', 'm', 'µ', 'u']);
conPrefijos('L', 1e-3, DIM.volumen, ['', 'm']);
def('min', 60, DIM.tiempo); def('h', 3600, DIM.tiempo);
def('K', 1, DIM.temperatura); def('mol', 1, DIM.cantidad);
def('atm', 101325, DIM.presion); def('bar', 1e5, DIM.presion);
def('eV', 1.602176634e-19, DIM.energia); def('cal', 4.184, DIM.energia);
def('rad', 1, DIM.adimensional); def('° deg grados', Math.PI / 180, DIM.adimensional);
def('%', 0.01, DIM.adimensional);

const FUNCIONES = {
  sqrt: Math.sqrt, raiz: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10,
  sin: Math.sin, sen: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
};
const CONSTANTES = { pi: Math.PI, 'π': Math.PI, e: Math.E };

// ---------------------------------------------------------------------------
// Operaciones con dimensión
// ---------------------------------------------------------------------------
const igual = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
const suma = (a, b, k = 1) => a.map((x, i) => x + k * b[i]);
const escala = (a, k) => a.map(x => x * k);
const esAdim = a => a.every(x => Math.abs(x) < 1e-9);

/** Nombre legible de una dimensión ("una velocidad"), o su fórmula en SI. */
export function nombreDimension(dim) {
  for (const [k, v] of Object.entries(DIM)) if (igual(v, dim)) return NOMBRES[k];
  const base = ['m', 'kg', 's', 'A', 'K', 'mol'];
  const partes = dim.map((e, i) => (Math.abs(e) < 1e-9 ? '' : e === 1 ? base[i] : `${base[i]}^${+e.toFixed(3)}`)).filter(Boolean);
  return `una cantidad en ${partes.join('·')}`;
}

// ---------------------------------------------------------------------------
// Analizador léxico y sintáctico (descenso recursivo)
// ---------------------------------------------------------------------------
const SUPER = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };

function normalizar(texto) {
  return texto
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, m => '^' + [...m].map(c => SUPER[c]).join(''))
    .replace(/[−–]/g, '-').replace(/[·×]/g, '*').replace(/÷/g, '/')
    .replace(/(\d),(\d{3}(?!\d))/g, '$1$2')   // separador de miles con coma
    .trim();
}

function lexer(texto) {
  const t = [];
  const re = /\s*(?:(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-zµΩπ°%_][A-Za-z0-9µΩ_]*|°|%)|(\*\*|[-+*/^(),]))/y;
  let m, pos = 0;
  while (pos < texto.length) {
    re.lastIndex = pos;
    m = re.exec(texto);
    if (!m || m[0].length === 0) {
      if (/^\s*$/.test(texto.slice(pos))) break;
      throw new Error(`No entiendo «${texto.slice(pos).trim()}».`);
    }
    if (m[1] != null) t.push({ tipo: 'num', v: parseFloat(m[1]) });
    else if (m[2] != null) t.push({ tipo: 'id', v: m[2] });
    else t.push({ tipo: 'op', v: m[3] === '**' ? '^' : m[3] });
    pos = re.lastIndex;
  }
  return t;
}

/**
 * Evalúa una expresión con unidades.
 * @param {string} texto
 * @param {{variables?: Record<string, {valor: number, dim: number[]}>, esperada?: number[] | string, unidadPorDefecto?: string}} [o]
 * @returns {{valor: number, dim: number[]}}  valor en SI
 */
export function evaluar(texto, o = {}) {
  const fuente = normalizar(String(texto));
  if (!fuente) throw new Error('El campo está vacío: escribe un número.');
  const toks = lexer(fuente);
  if (o.esperada == null) return analizar(toks, o, true);
  // Un campo adimensional con unidad por defecto (un ángulo en grados): un
  // número sin ninguna unidad ni variable se lee en esa unidad («35» → 35°);
  // con unidad explícita («0.6 rad», «35°») manda la escrita.
  const esperadaDim = typeof o.esperada === 'string' ? DIM[o.esperada] : o.esperada;
  if (esAdim(esperadaDim) && o.unidadPorDefecto && U[o.unidadPorDefecto] && toks.every(t => t.tipo !== 'id')) {
    const r = analizar(toks, o, true);
    if (esAdim(r.dim)) return { valor: r.valor * U[o.unidadPorDefecto][0], dim: r.dim };
  }
  // Con dimensión esperada se prueban las dos lecturas de un identificador
  // que sigue a un número ("250 g": gramos o 250·g): gana la que encaja.
  let primero;
  for (const unidadPrimero of [true, false]) {
    try { return comprobar(analizar(toks, o, unidadPrimero), o); }
    catch (e) { if (!primero) primero = e; }
  }
  throw primero;
}

/** Comprueba (y completa con la unidad por defecto) la dimensión esperada. */
function comprobar(r, o) {
  const esperada = typeof o.esperada === 'string' ? DIM[o.esperada] : o.esperada;
  if (esAdim(r.dim) && !esAdim(esperada) && o.unidadPorDefecto && U[o.unidadPorDefecto]) {
    return { valor: r.valor * U[o.unidadPorDefecto][0], dim: esperada };
  }
  if (!igual(r.dim, esperada)) {
    throw new Error(`La expresión da ${nombreDimension(r.dim)} y este campo espera ${nombreDimension(esperada)}.`);
  }
  return r;
}

/**
 * @param {Array<{tipo: string, v: any}>} toks
 * @param {{variables?: Record<string, {valor: number, dim: number[]}>}} o
 * @param {boolean} unidadPrimero  un identificador justo tras un número se lee como unidad
 */
function analizar(toks, o, unidadPrimero) {
  let i = 0;
  const ver = () => toks[i], tomar = () => toks[i++];
  const esOp = (v) => ver() && ver().tipo === 'op' && ver().v === v;
  const vars = o.variables || {};

  // expresión := término (('+'|'-') término)*
  function expresion() {
    let a = termino();
    while (esOp('+') || esOp('-')) {
      const op = tomar().v, b = termino();
      if (!igual(a.dim, b.dim)) throw new Error(`No se pueden ${op === '+' ? 'sumar' : 'restar'} ${nombreDimension(a.dim)} y ${nombreDimension(b.dim)}.`);
      a = { valor: op === '+' ? a.valor + b.valor : a.valor - b.valor, dim: a.dim };
    }
    return a;
  }
  // término := factor (('*'|'/') factor | factor implícito)*
  function termino() {
    let a = unario();
    for (;;) {
      if (esOp('*') || esOp('/')) {
        const op = tomar().v, b = unario();
        a = op === '*' ? { valor: a.valor * b.valor, dim: suma(a.dim, b.dim) } : { valor: a.valor / b.valor, dim: suma(a.dim, b.dim, -1) };
      } else if (ver() && (ver().tipo === 'id' || ver().tipo === 'num' || esOp('('))) {
        // multiplicación implícita: "2 h", "72 km/h", "2(3+1)"
        const b = unario();
        a = { valor: a.valor * b.valor, dim: suma(a.dim, b.dim) };
      } else return a;
    }
  }
  function unario() {
    if (esOp('-')) { tomar(); const a = unario(); return { valor: -a.valor, dim: a.dim }; }
    if (esOp('+')) { tomar(); return unario(); }
    return potencia();
  }
  // potencia := atomo ('^' unario)?   (exponente adimensional)
  function potencia() {
    const base = atomo();
    if (esOp('^')) {
      tomar();
      const ex = unario();
      if (!esAdim(ex.dim)) throw new Error('El exponente debe ser un número sin unidad.');
      return { valor: Math.pow(base.valor, ex.valor), dim: escala(base.dim, ex.valor) };
    }
    return base;
  }
  function atomo() {
    const tk = tomar();
    if (!tk) throw new Error('La expresión está incompleta.');
    if (tk.tipo === 'num') return { valor: tk.v, dim: DIM.adimensional };
    if (tk.tipo === 'op' && tk.v === '(') {
      const a = expresion();
      if (!esOp(')')) throw new Error('Falta cerrar un paréntesis.');
      tomar(); return a;
    }
    if (tk.tipo === 'id') {
      const n = tk.v;
      if (FUNCIONES[n] && esOp('(')) {
        tomar(); const a = expresion();
        if (!esOp(')')) throw new Error('Falta cerrar un paréntesis.');
        tomar();
        if (n === 'sqrt' || n === 'raiz') return { valor: Math.sqrt(a.valor), dim: escala(a.dim, 0.5) };
        if (n === 'abs') return { valor: Math.abs(a.valor), dim: a.dim };
        if (!esAdim(a.dim)) throw new Error(`${n}() necesita un número sin unidad y recibió ${nombreDimension(a.dim)}.`);
        return { valor: FUNCIONES[n](a.valor), dim: DIM.adimensional };
      }
      // Tras un número ("250 g") se prefiere la unidad; en otro lugar, la variable
      const tras = i >= 2 && toks[i - 2].tipo === 'num';
      if (unidadPrimero && tras && U[n]) return { valor: U[n][0], dim: U[n][1] };
      if (Object.prototype.hasOwnProperty.call(vars, n)) return { valor: vars[n].valor, dim: vars[n].dim };
      if (U[n]) return { valor: U[n][0], dim: U[n][1] };
      if (CONSTANTES[n] != null) return { valor: CONSTANTES[n], dim: DIM.adimensional };
      throw new Error(`No conozco «${n}»: no es una variable de la escena ni una unidad.`);
    }
    throw new Error(`Sobra «${tk.v}».`);
  }

  const r = expresion();
  if (i < toks.length) throw new Error(`Sobra «${toks.slice(i).map(t => t.v).join(' ')}».`);
  if (!Number.isFinite(r.valor)) throw new Error('El resultado no es un número finito.');
  return r;
}

/** Factor de una unidad a SI (para mostrar un valor SI en la unidad del campo). */
export function factor(unidad) {
  if (!U[unidad]) throw new Error(`Unidad desconocida: ${unidad}`);
  return U[unidad][0];
}
