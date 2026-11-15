/**
 * Reglas del juego "Apagá los incendios", sin DOM ni mapa (se prueban con `npm test`).
 *
 * El tablero es una lista de celdas. Los incendios aparecen cada vez más seguido, crecen en tres etapas
 * y, cuando llegan a la última, se contagian a una celda vecina. Un clic apaga la celda.
 *
 *   - Cada incendio apagado suma puntos: más cuanto antes se lo apaga (POINTS).
 *   - Se pierde si la fracción de celdas en llamas supera `loseFrac`.
 *   - Por defecto es infinito (`duration: Infinity`): se juega hasta perder y lo que cuenta es el puntaje.
 *     Con una duración, al llegar a ese tiempo se gana si la fracción es menor que `winFrac`; si no, se pierde.
 */

export const GAME_DEFAULTS = {
  duration: Infinity, // segundos de partida; Infinity = modo infinito, hasta perder
  loseFrac: 0.5,      // más de esta fracción del tablero en llamas: se pierde
  winFrac: 0.2,       // con duración: al terminar el tiempo, menos de esta fracción se gana
  // Ritmo en incendios por segundo, sin escalar con el tablero: el límite es cuántos clics por segundo
  // hace una persona. Sube en línea recta y sin techo: tarde o temprano el fuego gana.
  // Con estos valores una partida dura entre 1 y 3 minutos (1,5 a 3 aciertos por segundo).
  spawnStart: 1.2,    // al empezar
  spawnRamp: 1.0,     // cuánto sube por cada minuto de partida
  difficulty: 1,      // multiplica el ritmo
  growTime: 4,        // segundos que tarda un incendio en pasar de etapa (1 → 2 → 3)
  spreadEvery: 5,     // un incendio en etapa 3 contagia a una vecina cada tantos segundos
  initialFires: 6,
};

export const MAX_STAGE = 3;
/** Puntos por apagar un incendio según su etapa: vale más apagarlo cuando recién empieza. */
export const POINTS = [0, 30, 20, 10];

/**
 * @param cells      ids de las celdas del tablero
 * @param neighbors  (id) → ids vecinos (se ignoran los que no están en el tablero)
 * @param weights    opcional, Map id → peso relativo de que aparezca un incendio
 * @param rng        () → [0, 1)
 */
export function createEngine({ cells, neighbors = () => [], weights = null, rng = Math.random, ...options }) {
  const cfg = { ...GAME_DEFAULTS, ...options };
  const n = cells.length;
  if (!n) throw new Error('El tablero no tiene celdas');
  const board = new Set(cells);

  // Pesos acumulados para elegir dónde aparece un incendio
  const cum = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += Math.max(0, weights?.get(cells[i]) ?? 1) + 1e-9;
    cum[i] = acc;
  }

  const fires = new Map(); // id → { age, spread }
  const s = { t: 0, status: 'playing', reason: null, extinguished: 0, score: 0, ignited: 0, spreadCount: 0,
    peak: 0, pending: 0 };

  const frac = () => fires.size / n;
  const stageOf = (f) => Math.min(MAX_STAGE, 1 + Math.floor(f.age / cfg.growTime));

  function ignite(id) {
    if (fires.has(id) || !board.has(id)) return false;
    fires.set(id, { age: 0, spread: 0 });
    s.ignited++;
    return true;
  }

  function pickFree() {
    if (fires.size >= n) return null;
    for (let k = 0; k < 12; k++) {
      const x = rng() * acc;
      let lo = 0, hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] > x) hi = mid; else lo = mid + 1;
      }
      if (!fires.has(cells[lo])) return cells[lo];
    }
    // Tablero casi lleno: cualquiera de las libres
    const free = cells.filter((c) => !fires.has(c));
    return free[Math.floor(rng() * free.length)] ?? null;
  }

  function finish(status, reason) {
    s.status = status;
    s.reason = reason;
  }

  /** Avanza `dt` segundos. Devuelve las celdas que se encendieron en este paso. */
  function step(dt) {
    const lit = [];
    if (s.status !== 'playing' || !(dt > 0)) return lit;
    dt = Math.min(dt, cfg.duration - s.t);
    s.t += dt;

    s.pending += (cfg.spawnStart + cfg.spawnRamp * (s.t / 60)) * cfg.difficulty * dt;
    while (s.pending >= 1) {
      s.pending -= 1;
      const id = pickFree();
      if (id != null && ignite(id)) lit.push(id);
    }

    for (const [id, f] of [...fires]) {
      f.age += dt;
      if (stageOf(f) < MAX_STAGE) continue;
      f.spread += dt;
      if (f.spread < cfg.spreadEvery) continue;
      f.spread = 0;
      const free = neighbors(id).filter((c) => board.has(c) && !fires.has(c));
      if (!free.length) continue;
      const target = free[Math.floor(rng() * free.length)];
      if (ignite(target)) { lit.push(target); s.spreadCount++; }
    }

    s.peak = Math.max(s.peak, frac());
    if (frac() > cfg.loseFrac) finish('lost', 'overrun');
    else if (s.t >= cfg.duration - 1e-9) finish(frac() < cfg.winFrac ? 'won' : 'lost', 'time');
    return lit;
  }

  /** Apaga una celda. Devuelve los puntos ganados (0 si no estaba en llamas). */
  function extinguish(id) {
    const f = fires.get(id);
    if (s.status !== 'playing' || !f) return 0;
    const points = POINTS[stageOf(f)];
    fires.delete(id);
    s.extinguished++;
    s.score += points;
    return points;
  }

  for (let i = 0; i < Math.min(cfg.initialFires, n); i++) ignite(pickFree());
  s.peak = frac();

  return {
    config: cfg,
    size: n,
    step,
    extinguish,
    /** Etapa de una celda: 0 = sin fuego, 1 a 3 = en llamas. */
    stage: (id) => (fires.has(id) ? stageOf(fires.get(id)) : 0),
    burning: () => [...fires.keys()],
    get endless() { return !Number.isFinite(cfg.duration); },
    get time() { return s.t; },
    get timeLeft() { return Math.max(0, cfg.duration - s.t); },
    get frac() { return frac(); },
    get score() { return s.score; },
    get status() { return s.status; },
    get reason() { return s.reason; },
    get stats() {
      return { time: s.t, frac: frac(), peak: s.peak, score: s.score, extinguished: s.extinguished,
        ignited: s.ignited, spread: s.spreadCount, burning: fires.size, cells: n };
    },
  };
}
