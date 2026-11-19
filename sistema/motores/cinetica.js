/* ==========================================================================
   Volta — motor de gas molecular (Termodinámica · Gas molecular)
   Dinámica molecular por eventos de discos duros en 2D dentro de una caja:
   los choques entre discos son elásticos y se calculan exactamente, sin paso
   de tiempo (cada choque es un evento en una cola de prioridad; listas de
   celdas para no comparar cada disco con todos). Paredes adiabáticas
   (rebote especular) o térmicas (devuelven cada molécula con la
   distribución de su temperatura). Pared derecha que puede moverse como un
   émbolo a velocidad dada (compresión o expansión) y tabique interior con
   un orificio que se abre o se cierra (efusión, expansión libre).
   Medidas: el manómetro suma el impulso que reciben las paredes; la
   temperatura sale de la energía cinética media. En 2D cada molécula tiene
   dos grados de libertad de traslación: ½·m·⟨v²⟩ = k·T, la presión es una
   fuerza por unidad de longitud con P·A = N·k·T (gas ideal; los discos duros
   la corrigen por el área excluida) y la distribución de rapideces de
   Maxwell–Boltzmann es f(v) = (m·v/kT)·exp(−m·v²/2kT).
   Determinista: la misma escena con la misma semilla da el mismo resultado.
   Puro: sin DOM. Lo usan la pantalla «Gas molecular» y las pruebas.
   ========================================================================== */

/** Constante de Boltzmann (J/K), exacta en el SI 2019. */
export const K_B = 1.380649e-23;
/** Constante de Avogadro (1/mol), exacta en el SI 2019. */
export const N_A = 6.02214076e23;
/** Unidad de masa atómica (kg). */
export const UMA = 1.66053906660e-27;

/**
 * @typedef {Object} EspecieMolecular
 * @property {string} nombre
 * @property {number} m   Masa de una molécula (kg)
 * @property {number} r   Radio del disco (m)
 * @property {number} N   Número de moléculas
 * @property {'izq'|'der'|'toda'} [region='toda']  Dónde empiezan (con tabique)
 * @property {number} [T]  Temperatura inicial propia (K)
 */

/**
 * @typedef {Object} EscenaMolecular
 * @property {number} Lx   Ancho inicial de la caja (m)
 * @property {number} Ly   Alto de la caja (m)
 * @property {number} T    Temperatura inicial (K)
 * @property {EspecieMolecular[]} especies
 * @property {'adiabatica'|'termica'} [paredes='adiabatica']
 * @property {number} [Tpared]  Temperatura de las paredes térmicas (K)
 * @property {{x: number, hueco: number, abierto?: boolean}} [tabique]  Tabique vertical con un orificio centrado
 * @property {{t0: number, t1: number, u: number}[]} [embolo]  Tramos de velocidad de la pared derecha (m/s, + expande)
 * @property {{t: number, abierto: boolean}[]} [orificio]  Abrir o cerrar el orificio del tabique en t
 * @property {number} [semilla=1]
 */

// Tipos de evento
const PAR = 0, PARED = 1, CELDA = 2, CARA = 3, ESQUINA = 4, GLOBAL = 5;

/**
 * Evento de la cola: instante, tipo, moléculas (o pared, celda, esquina),
 * contadores de las moléculas al predecirlo y época de las paredes.
 * @typedef {{t: number, k: number, i: number, j: number, ci: number, cj: number, ep: number}} EventoMolecular
 */

/** Generador pseudoaleatorio con semilla (mulberry32). */
function azarCon(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cola de prioridad mínima por t. */
class Cola {
  constructor() { /** @type {EventoMolecular[]} */ this.h = []; }
  get size() { return this.h.length; }
  /** @param {EventoMolecular} e */
  push(e) {
    const h = this.h; h.push(e); let i = h.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (h[p].t <= e.t) break; h[i] = h[p]; i = p; }
    h[i] = e;
  }
  pop() {
    const h = this.h, top = h[0], last = h.pop();
    if (h.length && last) {
      let i = 0; const n = h.length;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i, mt = last.t;
        if (l < n && h[l].t < mt) { m = l; mt = h[l].t; }
        if (r < n && h[r].t < mt) m = r;
        if (m === i) break;
        h[i] = h[m]; i = m;
      }
      h[i] = last;
    }
    return top;
  }
  peek() { return this.h[0]; }
}

/**
 * Valida la escena; lanza si no describe una caja posible.
 * @param {EscenaMolecular} e
 */
function validar(e) {
  if (!(e.Lx > 0 && e.Ly > 0)) throw new Error('La caja necesita ancho y alto positivos.');
  if (!(e.T > 0)) throw new Error('La temperatura inicial tiene que ser positiva.');
  if (!Array.isArray(e.especies) || !e.especies.length) throw new Error('Falta al menos una especie de moléculas.');
  for (const s of e.especies) {
    if (!(s.m > 0) || !(s.r > 0)) throw new Error(`La especie ${s.nombre} necesita masa y radio positivos.`);
    if (!(Number.isInteger(s.N) && s.N >= 0)) throw new Error(`El número de moléculas de ${s.nombre} tiene que ser un entero no negativo.`);
  }
  if (e.paredes === 'termica' && !((e.Tpared ?? e.T) > 0)) throw new Error('Las paredes térmicas necesitan una temperatura positiva.');
  if (e.tabique && !(e.tabique.x > 0 && e.tabique.x < e.Lx)) throw new Error('El tabique tiene que estar dentro de la caja.');
}

/** Posición de la pared derecha en el instante t según los tramos del émbolo. */
function posicionEmbolo(e, t) {
  let X = e.Lx;
  for (const s of e.embolo || []) { const a = Math.max(s.t0, 0), b = Math.min(s.t1, t); if (b > a) X += s.u * (b - a); }
  return X;
}
/** Velocidad de la pared derecha en t (tramo que contiene a t, por la derecha). */
function velocidadEmbolo(e, t) {
  for (const s of e.embolo || []) if (t >= s.t0 - 1e-18 && t < s.t1 - 1e-18) return s.u;
  return 0;
}

/**
 * Gas molecular: estado y avance por eventos.
 */
export class GasMolecular {
  /** @param {EscenaMolecular} esc */
  constructor(esc) {
    validar(esc);
    this.esc = esc;
    const az = azarCon(esc.semilla ?? 1);
    this.azar = az;
    const especies = esc.especies, N = especies.reduce((a, s) => a + s.N, 0);
    this.N = N;
    this.x = new Float64Array(N); this.y = new Float64Array(N);
    this.vx = new Float64Array(N); this.vy = new Float64Array(N);
    this.tp = new Float64Array(N);            // instante al que corresponde la posición guardada
    this.esp = new Int32Array(N); this.m = new Float64Array(N); this.r = new Float64Array(N);
    this.cnt = new Int32Array(N);             // contador de cambios de velocidad (invalida eventos)
    this.t = 0; this.epoca = 0;
    this.rmax = Math.max(...especies.map(s => s.r));
    // Extensión máxima de la caja (el émbolo puede expandirla)
    let Xmax = esc.Lx, X = esc.Lx;
    for (const s of (esc.embolo || []).slice().sort((a, b) => a.t0 - b.t0)) { X += s.u * (s.t1 - s.t0); Xmax = Math.max(Xmax, X); if (X < 4 * this.rmax + (esc.tabique ? esc.tabique.x : 0)) throw new Error('El émbolo no puede llegar tan lejos: la caja quedaría sin sitio.'); }
    this.Xmax = Xmax;
    this.Xp = esc.Lx; this.up = velocidadEmbolo(esc, 0); this.tXp = 0;
    this.tab = esc.tabique ? { x: esc.tabique.x, y1: esc.Ly / 2 - esc.tabique.hueco / 2, y2: esc.Ly / 2 + esc.tabique.hueco / 2, abierto: esc.tabique.abierto !== false && esc.tabique.hueco > 0 } : null;
    // Medidas acumuladas
    this.J = new Float64Array(5);             // impulso sobre: izquierda, derecha (émbolo), abajo, arriba, tabique
    this.Wemb = 0; this.Qpared = 0; this.choques = 0; this.eventos = 0;
    // Celdas: del tamaño necesario para que dos discos solo choquen si están en celdas vecinas
    const tam = Math.max(2.05 * this.rmax, Math.sqrt(Xmax * esc.Ly / Math.max(1, N)) * 1.6);
    this.nx = Math.max(1, Math.floor(Xmax / tam)); this.ny = Math.max(1, Math.floor(esc.Ly / tam));
    this.wc = Xmax / this.nx; this.hc = esc.Ly / this.ny;
    /** @type {number[][]} */
    this.celdas = Array.from({ length: this.nx * this.ny }, () => []);
    this.cx = new Int32Array(N); this.cy = new Int32Array(N);
    // Colocación sin solapes y velocidades de Maxwell–Boltzmann
    let k = 0;
    especies.forEach((s, si) => {
      const Ts = s.T ?? esc.T, sig = Math.sqrt(K_B * Ts / s.m);
      for (let q = 0; q < s.N; q++, k++) {
        this.esp[k] = si; this.m[k] = s.m; this.r[k] = s.r;
        let x0 = s.r, x1 = esc.Lx - s.r;
        if (this.tab && s.region === 'izq') x1 = this.tab.x - s.r;
        if (this.tab && s.region === 'der') x0 = this.tab.x + s.r;
        let ok = false;
        for (let intento = 0; intento < 20000 && !ok; intento++) {
          const px = x0 + (x1 - x0) * az(), py = s.r + (esc.Ly - 2 * s.r) * az();
          if (this.tab && Math.abs(px - this.tab.x) < s.r) continue;
          ok = true;
          for (let j = 0; j < k; j++) { const dx = this.x[j] - px, dy = this.y[j] - py, d = this.r[j] + s.r; if (dx * dx + dy * dy < d * d * 1.0001) { ok = false; break; } }
          if (ok) { this.x[k] = px; this.y[k] = py; }
        }
        if (!ok) throw new Error('No caben tantas moléculas en la caja: reduce su número o su radio.');
        const g = () => Math.sqrt(-2 * Math.log(1 - az())) * Math.cos(2 * Math.PI * az());
        this.vx[k] = sig * g(); this.vy[k] = sig * g();
      }
    });
    for (let i = 0; i < N; i++) { this.cx[i] = this.celdaX(this.x[i]); this.cy[i] = this.celdaY(this.y[i]); this.celdas[this.cy[i] * this.nx + this.cx[i]].push(i); }
    this.cola = new Cola();
    for (let i = 0; i < N; i++) this.predecir(i, -1);
    this.programarGlobales();
  }

  celdaX(x) { return Math.max(0, Math.min(this.nx - 1, Math.floor(x / this.wc))); }
  celdaY(y) { return Math.max(0, Math.min(this.ny - 1, Math.floor(y / this.hc))); }

  /** Lleva la posición guardada de i al instante actual. */
  mover(i) { const d = this.t - this.tp[i]; if (d !== 0) { this.x[i] += this.vx[i] * d; this.y[i] += this.vy[i] * d; this.tp[i] = this.t; } }
  /** Posición de la pared derecha ahora. */
  embolo() { return this.Xp + this.up * (this.t - this.tXp); }

  // Eventos globales: cambios de velocidad del émbolo y del orificio
  programarGlobales() {
    const e = this.esc, ts = new Set();
    for (const s of e.embolo || []) { ts.add(s.t0); ts.add(s.t1); }
    for (const a of e.orificio || []) ts.add(a.t);
    for (const t of ts) if (t > 0) this.cola.push({ t, k: GLOBAL, i: -1, j: -1, ci: 0, cj: 0, ep: -1 });
  }

  /** Tiempo hasta el choque de i con j (o Infinity). */
  tiempoPar(i, j) {
    const dt = this.t - this.tp[j];
    const dx = this.x[j] + this.vx[j] * dt - this.x[i], dy = this.y[j] + this.vy[j] * dt - this.y[i];
    const dvx = this.vx[j] - this.vx[i], dvy = this.vy[j] - this.vy[i];
    const b = dx * dvx + dy * dvy;
    if (b >= 0) return Infinity;
    const v2 = dvx * dvx + dvy * dvy, s = this.r[i] + this.r[j], r2 = dx * dx + dy * dy;
    const d = b * b - v2 * (r2 - s * s);
    if (d <= 0) return Infinity;
    if (r2 < s * s) return 0;                  // ya se tocan por redondeo y se acercan: choque inmediato
    return Math.max(0, (r2 - s * s) / (-b + Math.sqrt(d)));
  }

  /**
   * Programa los eventos de i desde el instante actual. `con`: −1 para
   * todos (tras un cambio de velocidad) o un código de celda nueva.
   */
  predecir(i, conCelda) {
    this.mover(i);
    const t = this.t, x = this.x[i], y = this.y[i], vx = this.vx[i], vy = this.vy[i], r = this.r[i], c = this.cola, ci = this.cnt[i];
    const nx = this.nx, ny = this.ny, cxi = this.cx[i], cyi = this.cy[i];
    // Pares con las celdas vecinas (o solo las recién alcanzadas)
    const vecinas = [];
    if (conCelda < 0) { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) vecinas.push([cxi + a, cyi + b]); }
    else if (conCelda < 2) { const a = conCelda === 0 ? -1 : 1; for (let b = -1; b <= 1; b++) vecinas.push([cxi + a, cyi + b]); }
    else { const b = conCelda === 2 ? -1 : 1; for (let a = -1; a <= 1; a++) vecinas.push([cxi + a, cyi + b]); }
    for (const [a, b] of vecinas) {
      if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      for (const j of this.celdas[b * nx + a]) {
        if (j === i) continue;
        const dtc = this.tiempoPar(i, j);
        if (dtc < Infinity) c.push({ t: t + dtc, k: PAR, i, j, ci, cj: this.cnt[j], ep: 0 });
      }
    }
    // Salida de la celda
    let tc = Infinity, dir = -1;
    if (vx > 0 && cxi < nx - 1) { const d = ((cxi + 1) * this.wc - x) / vx; if (d < tc) { tc = d; dir = 1; } }
    if (vx < 0 && cxi > 0) { const d = (cxi * this.wc - x) / vx; if (d < tc) { tc = d; dir = 0; } }
    if (vy > 0 && cyi < ny - 1) { const d = ((cyi + 1) * this.hc - y) / vy; if (d < tc) { tc = d; dir = 3; } }
    if (vy < 0 && cyi > 0) { const d = (cyi * this.hc - y) / vy; if (d < tc) { tc = d; dir = 2; } }
    if (tc < Infinity) c.push({ t: t + Math.max(0, tc), k: CELDA, i, j: dir, ci, cj: 0, ep: 0 });
    if (conCelda >= 0) return;
    this.predecirParedes(i);
  }

  /** Paredes, émbolo, tabique y esquinas del orificio. */
  predecirParedes(i) {
    const t = this.t, x = this.x[i], y = this.y[i], vx = this.vx[i], vy = this.vy[i], r = this.r[i], c = this.cola, ci = this.cnt[i], ep = this.epoca, Ly = this.esc.Ly;
    if (vx < 0) c.push({ t: t + Math.max(0, (r - x) / vx), k: PARED, i, j: 0, ci, cj: 0, ep });
    const Xp = this.embolo(), u = this.up;
    if (vx > u) c.push({ t: t + Math.max(0, (Xp - r - x) / (vx - u)), k: PARED, i, j: 1, ci, cj: 0, ep });
    if (vy < 0) c.push({ t: t + Math.max(0, (r - y) / vy), k: PARED, i, j: 2, ci, cj: 0, ep });
    if (vy > 0) c.push({ t: t + Math.max(0, (Ly - r - y) / vy), k: PARED, i, j: 3, ci, cj: 0, ep });
    const tb = this.tab;
    if (!tb) return;
    const xt = tb.x;
    let tf = Infinity;
    if (vx > 0 && x <= xt - r) tf = (xt - r - x) / vx;
    else if (vx < 0 && x >= xt + r) tf = (xt + r - x) / vx;
    if (tf < Infinity) {
      const yf = y + vy * tf;
      if (!tb.abierto || yf <= tb.y1 || yf >= tb.y2) { c.push({ t: t + Math.max(0, tf), k: CARA, i, j: 0, ci, cj: 0, ep }); }
    }
    if (tb.abierto) {
      [tb.y1, tb.y2].forEach((yc, q) => {
        const dx = x - xt, dy = y - yc, b = dx * vx + dy * vy;
        if (b >= 0) return;
        const v2 = vx * vx + vy * vy, d = b * b - v2 * (dx * dx + dy * dy - r * r);
        if (d <= 0) return;
        const tq = Math.max(0, (dx * dx + dy * dy - r * r) / (-b + Math.sqrt(d)));
        c.push({ t: t + tq, k: ESQUINA, i, j: q, ci, cj: 0, ep });
      });
    }
  }

  /** ¿Sigue vigente el evento? */
  vigente(ev) {
    if (ev.k === GLOBAL) return true;
    if (ev.ci !== this.cnt[ev.i]) return false;
    if (ev.k === PAR) return ev.cj === this.cnt[ev.j];
    if (ev.k === PARED || ev.k === CARA || ev.k === ESQUINA) return ev.ep === this.epoca;
    return true;
  }

  /** Velocidad que devuelve una pared térmica (componente normal saliente positiva). */
  rebotarTermico(i, normal) {
    const Tw = this.esc.Tpared ?? this.esc.T, s = Math.sqrt(K_B * Tw / this.m[i]), az = this.azar;
    const vn = s * Math.sqrt(-2 * Math.log(1 - az()));
    const vt = s * Math.sqrt(-2 * Math.log(1 - az())) * Math.cos(2 * Math.PI * az());
    return [vn * normal, vt];
  }

  /** Procesa un evento vigente en su instante. */
  procesar(ev) {
    const i = ev.i;
    if (ev.k === GLOBAL) { this.cambioGlobal(); return; }
    if (ev.k === CELDA) {
      this.mover(i);
      const viejo = this.cy[i] * this.nx + this.cx[i];
      if (ev.j === 0) this.cx[i]--; else if (ev.j === 1) this.cx[i]++; else if (ev.j === 2) this.cy[i]--; else this.cy[i]++;
      const lista = this.celdas[viejo], p = lista.indexOf(i); if (p >= 0) lista.splice(p, 1);
      this.celdas[this.cy[i] * this.nx + this.cx[i]].push(i);
      this.predecir(i, ev.j);
      return;
    }
    this.mover(i);
    const m = this.m[i], ek0 = 0.5 * m * (this.vx[i] ** 2 + this.vy[i] ** 2);
    if (ev.k === PAR) {
      const j = ev.j; this.mover(j);
      const dx = this.x[j] - this.x[i], dy = this.y[j] - this.y[i], d = Math.hypot(dx, dy) || 1, nxv = dx / d, nyv = dy / d;
      const dvn = (this.vx[j] - this.vx[i]) * nxv + (this.vy[j] - this.vy[i]) * nyv;
      const mi = this.m[i], mj = this.m[j], J = 2 * mi * mj / (mi + mj) * dvn;
      this.vx[i] += J / mi * nxv; this.vy[i] += J / mi * nyv;
      this.vx[j] -= J / mj * nxv; this.vy[j] -= J / mj * nyv;
      this.cnt[i]++; this.cnt[j]++; this.choques++;
      this.predecir(i, -1); this.predecir(j, -1);
      return;
    }
    if (ev.k === PARED) {
      // El émbolo en movimiento rebota como pared móvil; quieto, es una pared más
      const termica = this.esc.paredes === 'termica' && !(ev.j === 1 && this.up !== 0);
      if (ev.j <= 1) {
        const vAntes = this.vx[i];
        if (ev.j === 1) this.x[i] = Math.min(this.x[i], this.embolo() - this.r[i]);
        if (termica) { const [vn, vt] = this.rebotarTermico(i, ev.j === 0 ? 1 : -1); this.vx[i] = vn; this.vy[i] = vt; }
        else if (ev.j === 1) this.vx[i] = 2 * this.up - vAntes;
        else this.vx[i] = -vAntes;
        this.J[ev.j] += m * Math.abs(this.vx[i] - vAntes);
      } else {
        const vAntes = this.vy[i];
        if (termica) { const [vn, vt] = this.rebotarTermico(i, ev.j === 2 ? 1 : -1); this.vy[i] = vn; this.vx[i] = vt; }
        else this.vy[i] = -vAntes;
        this.J[ev.j] += m * Math.abs(this.vy[i] - vAntes);
      }
      const ek1 = 0.5 * m * (this.vx[i] ** 2 + this.vy[i] ** 2);
      if (termica) this.Qpared += ek1 - ek0; else if (ev.j === 1) this.Wemb += ek1 - ek0;
    } else if (ev.k === CARA) {
      const vAntes = this.vx[i]; this.vx[i] = -vAntes; this.J[4] += m * Math.abs(2 * vAntes);
    } else if (ev.k === ESQUINA) {
      const yc = ev.j === 0 ? this.tab.y1 : this.tab.y2, dx = this.x[i] - this.tab.x, dy = this.y[i] - yc, d = Math.hypot(dx, dy) || 1;
      const nxv = dx / d, nyv = dy / d, vn = this.vx[i] * nxv + this.vy[i] * nyv;
      this.vx[i] -= 2 * vn * nxv; this.vy[i] -= 2 * vn * nyv; this.J[4] += m * Math.abs(2 * vn);
    }
    this.cnt[i]++;
    this.predecir(i, -1);
  }

  /** Cambio de velocidad del émbolo o del orificio: se vuelven a predecir las paredes. */
  cambioGlobal() {
    const e = this.esc, t = this.t;
    this.Xp = this.embolo(); this.tXp = t; this.up = velocidadEmbolo(e, t);
    if (this.tab) for (const a of e.orificio || []) if (Math.abs(a.t - t) < 1e-18) this.tab.abierto = !!a.abierto && e.tabique.hueco > 0;
    this.epoca++;
    for (let i = 0; i < this.N; i++) { this.mover(i); this.predecirParedes(i); }
  }

  /** Avanza la simulación hasta el instante tFin (procesa todos los eventos previos). */
  avanzar(tFin) {
    const c = this.cola;
    let limite = 5e7;
    while (c.size && c.peek().t <= tFin && limite-- > 0) {
      const ev = c.pop();
      if (!this.vigente(ev)) continue;
      this.t = Math.max(this.t, ev.t);
      this.eventos++;
      this.procesar(ev);
    }
    this.t = tFin;
    for (let i = 0; i < this.N; i++) this.mover(i);
    if (limite <= 0) throw new Error('Demasiados eventos sin avanzar: la escena está atascada.');
  }

  /** Energía cinética total (J) y por especie. */
  energias() {
    const S = this.esc.especies.length, E = new Float64Array(S);
    for (let i = 0; i < this.N; i++) E[this.esp[i]] += 0.5 * this.m[i] * (this.vx[i] ** 2 + this.vy[i] ** 2);
    return { total: E.reduce((a, x) => a + x, 0), porEspecie: Array.from(E) };
  }

  /** Rapideces actuales de una especie (o de todas si s < 0). */
  rapideces(s = -1) {
    const v = [];
    for (let i = 0; i < this.N; i++) if (s < 0 || this.esp[i] === s) v.push(Math.hypot(this.vx[i], this.vy[i]));
    return v;
  }

  /** Menor distancia entre superficies de dos discos (m); negativa si se solapan. */
  holguraMinima() {
    let h = Infinity;
    for (let i = 0; i < this.N; i++) for (let j = i + 1; j < this.N; j++) {
      const d = Math.hypot(this.x[i] - this.x[j], this.y[i] - this.y[j]) - this.r[i] - this.r[j];
      if (d < h) h = d;
    }
    return h;
  }
}

// ---------------------------------------------------------------------------
// Corrida completa para la pantalla: cuadros con posiciones y medidas
// ---------------------------------------------------------------------------

/**
 * Simula la escena y guarda un cuadro cada `cuadro` segundos: posiciones de
 * todas las moléculas, impulso acumulado en cada pared, energía por especie,
 * trabajo del émbolo, calor de las paredes, choques y posición del émbolo.
 * @param {EscenaMolecular} esc
 * @param {{duracion?: number, cuadro?: number}} [opciones]
 */
export function simularMolecular(esc, opciones = {}) {
  const o = { duracion: 2e-9, cuadro: 2e-12, ...opciones };
  const gas = new GasMolecular(esc), N = gas.N, K = Math.max(1, Math.round(o.duracion / o.cuadro)), dtc = o.duracion / K;
  const pos = new Float32Array((K + 1) * 2 * N), vel = new Float32Array((K + 1) * 2 * N);
  const medidas = [];
  let incompleta = null;
  const S = esc.especies.length;
  for (let k = 0; k <= K; k++) {
    try { if (k) gas.avanzar(k * dtc); }
    catch (err) { incompleta = { t: (k - 1) * dtc, motivo: err instanceof Error ? err.message : String(err) }; break; }
    const base = k * 2 * N;
    for (let i = 0; i < N; i++) { pos[base + 2 * i] = gas.x[i]; pos[base + 2 * i + 1] = gas.y[i]; vel[base + 2 * i] = gas.vx[i]; vel[base + 2 * i + 1] = gas.vy[i]; }
    const E = gas.energias();
    let izq = 0; if (gas.tab) for (let i = 0; i < N; i++) if (gas.x[i] < gas.tab.x) izq++;
    medidas.push({ t: k * dtc, J: Array.from(gas.J), Ek: E.total, EkEsp: E.porEspecie, Wemb: gas.Wemb, Qpared: gas.Qpared, choques: gas.choques, Xp: gas.embolo(), izq, abierto: gas.tab ? (gas.tab.abierto ? 1 : 0) : 0 });
  }
  const cuadros = medidas.length;
  return { esc, N, especie: Array.from(gas.esp), radio: Array.from(gas.r), masa: Array.from(gas.m), pos, vel, medidas, cuadros, cuadro: dtc, duracion: o.duracion, S, incompleta, eventos: gas.eventos };
}

// ---------------------------------------------------------------------------
// Teoría cinética en 2D
// ---------------------------------------------------------------------------

/** Densidad de probabilidad de la rapidez en 2D (Maxwell–Boltzmann). */
export const maxwell2D = (v, m, T) => { const a = m / (K_B * T); return a * v * Math.exp(-0.5 * a * v * v); };
/** Rapidez media en 2D: √(π·k·T/(2m)). */
export const rapidezMedia2D = (m, T) => Math.sqrt(Math.PI * K_B * T / (2 * m));
/** Rapidez cuadrática media en 2D: √(2·k·T/m). */
export const rapidezRms2D = (m, T) => Math.sqrt(2 * K_B * T / m);
/** Rapidez más probable en 2D: √(k·T/m). */
export const rapidezProbable2D = (m, T) => Math.sqrt(K_B * T / m);
/** Rapidez cuadrática media en 3D (gas real): √(3·R·T/M), M en kg/mol. */
export const rapidezRms3D = (M, T) => Math.sqrt(3 * 8.314462618 * T / M);

/** Temperatura cinética en 2D de una lista de energías: T = ⟨E_k⟩/k. */
export const temperatura2D = (Ek, N) => (N > 0 ? Ek / (N * K_B) : NaN);

/**
 * Factor de compresibilidad de los discos duros, Z = P·A/(N·k·T), con la
 * ecuación de Henderson: Z = (1 + η²/8)/(1 − η)², η = N·π·r²/A.
 * @param {number} eta Fracción de área ocupada
 */
export const compresibilidadDiscos = eta => (1 + eta * eta / 8) / (1 - eta) ** 2;
