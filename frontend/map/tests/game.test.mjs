// Pruebas de las reglas del juego (src/game/engine.js) y del tablero (src/game/board.js).   npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { gridDisk, latLngToCell, getResolution } from 'h3-js';
import { createEngine, GAME_DEFAULTS, POINTS } from '../src/game/engine.js';
import { buildBoard, loadWeights } from '../src/game/board.js';
import { TIPS, DATA_TIP } from '../src/game/tips.js';

// Generador con semilla, para que las partidas de prueba sean repetibles
const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const CELLS = gridDisk(latLngToCell(-39.5, -68.5, 4), 8); // 217 celdas
const neighbors = (c) => gridDisk(c, 1);
const newGame = (extra = {}) => createEngine({ cells: CELLS, neighbors, rng: seeded(7), ...extra });

/** Juega una partida apagando `cps` incendios por segundo, siempre el más avanzado. */
function play(engine, cps) {
  let clicks = 0;
  while (engine.status === 'playing') {
    engine.step(0.05);
    clicks += cps * 0.05;
    while (clicks >= 1) {
      clicks -= 1;
      const burning = engine.burning();
      if (burning.length) engine.extinguish(burning.reduce((a, c) => (engine.stage(c) > engine.stage(a) ? c : a)));
    }
  }
  return engine;
}

test('sin jugar, el fuego supera el límite y se pierde antes de tiempo', () => {
  const e = play(newGame(), 0);
  assert.equal(e.status, 'lost');
  assert.equal(e.reason, 'overrun');
  assert.ok(e.frac > GAME_DEFAULTS.loseFrac);
  assert.ok(e.time < 60);
});

test('modo infinito: no hay tiempo límite y apagando se dura más y se suman puntos', () => {
  const slow = play(newGame(), 1.5);
  const fast = play(newGame(), 3);
  for (const e of [slow, fast]) {
    assert.equal(e.endless, true);
    assert.equal(e.status, 'lost');
    assert.equal(e.reason, 'overrun');
  }
  assert.ok(fast.time > slow.time + 30, ` vs `);
  assert.ok(fast.score > slow.score && slow.score > 0);
  assert.equal(GAME_DEFAULTS.duration, Infinity);
});

test('con duración: apagando rápido se llega al final con menos del 20 % y se gana', () => {
  const e = play(newGame({ duration: 60 }), 3);
  assert.equal(e.endless, false);
  assert.equal(e.status, 'won');
  assert.equal(e.reason, 'time');
  assert.ok(Math.abs(e.time - 60) < 1e-6);
  assert.ok(e.frac < GAME_DEFAULTS.winFrac);
});

test('con duración: al terminar el tiempo entre el 20 % y el límite, se pierde', () => {
  // Sin incendios nuevos ni contagio: el tablero queda como arrancó, con el 30 % en llamas
  const e = newGame({ duration: 30, spawnStart: 0, spawnRamp: 0, spreadEvery: Infinity, initialFires: Math.round(CELLS.length * 0.3) });
  while (e.status === 'playing') e.step(0.5);
  assert.equal(e.status, 'lost');
  assert.equal(e.reason, 'time');
});

test('cada vez aparecen más incendios', () => {
  const e = newGame({ loseFrac: 2, spreadEvery: Infinity });
  const start = e.stats.ignited;
  while (e.time < 15) e.step(0.05);
  const first = e.stats.ignited - start;
  while (e.time < 45) e.step(0.05);
  const mid = e.stats.ignited;
  while (e.time < 60) e.step(0.05);
  assert.ok(e.stats.ignited - mid > first + 5, `de 45 a 60 s: ${e.stats.ignited - mid}, primeros 15 s: ${first}`);
});

test('un incendio crece por etapas y en la última contagia a una vecina', () => {
  const e = createEngine({ cells: CELLS, neighbors, rng: seeded(3), spawnStart: 0, spawnRamp: 0, initialFires: 1 });
  const [origin] = e.burning();
  assert.equal(e.stage(origin), 1);
  for (let i = 0; i < 50; i++) e.step(0.1); // 5 s
  assert.equal(e.stage(origin), 2);
  for (let i = 0; i < 90; i++) e.step(0.1); // 14 s: etapa 3 desde los 8 s, contagia a los 13 s
  assert.equal(e.stage(origin), 3);
  const others = e.burning().filter((c) => c !== origin);
  assert.equal(others.length, 1);
  assert.ok(neighbors(origin).includes(others[0]));
});

test('apagar: suma puntos solo si la celda estaba en llamas, y más cuanto antes', () => {
  const e = newGame({ spawnStart: 0, spawnRamp: 0, spreadEvery: Infinity, initialFires: 3 });
  const [a, b, c] = e.burning();
  assert.equal(e.extinguish(a), POINTS[1]);
  assert.equal(e.extinguish(a), 0);
  assert.equal(e.stage(a), 0);
  for (let i = 0; i < 50; i++) e.step(0.1); // 5 s: etapa 2
  assert.equal(e.extinguish(b), POINTS[2]);
  for (let i = 0; i < 50; i++) e.step(0.1); // 10 s: etapa 3
  assert.equal(e.extinguish(c), POINTS[3]);
  assert.ok(POINTS[1] > POINTS[2] && POINTS[2] > POINTS[3] && POINTS[3] > 0);
  assert.equal(e.score, POINTS[1] + POINTS[2] + POINTS[3]);
  assert.equal(e.stats.extinguished, 3);
});

test('los pesos concentran el fuego', () => {
  const hot = new Set(CELLS.slice(0, 20));
  const weights = new Map(CELLS.map((c) => [c, hot.has(c) ? 1 : 0]));
  const e = createEngine({ cells: CELLS, weights, rng: seeded(11), initialFires: 15, spawnStart: 0, spawnRamp: 0 });
  assert.ok(e.burning().every((c) => hot.has(c)));
});

test('tablero: elige la resolución más cercana al tamaño buscado', () => {
  // Cuadrado de ~4° de lado en el norte de la Patagonia
  const outline = { type: 'Feature', geometry: { type: 'Polygon',
    coordinates: [[[-71, -41], [-67, -41], [-67, -37], [-71, -37], [-71, -41]]] } };
  const b = buildBoard(outline, { target: 200 });
  assert.ok(b.cells.length > 60 && b.cells.length < 600, `celdas: ${b.cells.length}`);
  assert.ok(b.cells.every((c) => getResolution(c) === b.res));
  assert.equal(new Set(b.cells).size, b.cells.length);
});

test('pesos desde los datos: suma las celdas del mapa en las del tablero', async () => {
  const outline = { type: 'Feature', geometry: { type: 'Polygon',
    coordinates: [[[-71, -41], [-67, -41], [-67, -37], [-71, -37], [-71, -41]]] } };
  const board = buildBoard(outline, { target: 200 });
  const hotCell = latLngToCell(-39, -69, 5);
  const source = {
    getCalendar: async () => ({ length: 2, year: [2024, 2025], month: [1, 2], n_equiv: [5, 50] }),
    getCells: async (res, month) => (month === '2025-02'
      ? { length: 1, cell: [hotCell], n_equiv: [40], anomaly_pct: [null] }
      : { length: 0, cell: [], n_equiv: [], anomaly_pct: [] }),
  };
  const meta = { map: { resolutions: [5, 6, 7], months: ['2024-01', '2025-02'] } };
  const w = await loadWeights(source, meta, board);
  assert.equal(w.size, board.cells.length);
  const top = [...w].sort((a, b) => b[1] - a[1])[0];
  assert.equal(top[0], latLngToCell(-39, -69, board.res));
  assert.ok(top[1] > 1 && Math.min(...w.values()) > 0);
});

test('mensajes: breves y sin repetir', () => {
  const all = [...TIPS, DATA_TIP];
  for (const t of all) assert.ok(t.text.length <= 95 && t.icon, `${t.text.length}: ${t.text}`);
  assert.equal(new Set(all.map((t) => t.text)).size, all.length);
});
