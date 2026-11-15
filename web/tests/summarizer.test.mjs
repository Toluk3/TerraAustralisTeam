// createSummarizer (src/features/summaryLoader.js) contra una fuente falsa en memoria.
import test from 'node:test';
import assert from 'node:assert/strict';
import { latLngToCell, cellToParent } from 'h3-js';
import { createSummarizer, frpBin, FRP_EDGES, calcRes } from '../src/features/summaryLoader.js';

const lat = -40, lon = -70;
const a = latLngToCell(lat, lon, 7);
const b = latLngToCell(lat + 1, lon, 7);
const tile = cellToParent(a, 2);
const day = (iso) => Date.parse(iso) / 86400000;

const META = {
  switch_date: '2022-01-01',
  cell_res: 7,
  reduced_coverage_months: [],
  map: { resolutions: [5, 6, 7], months: ['2021-12', '2022-01'] },
  points: { tile_res: 2, months: ['2022-01'] },
  uncertainty: { res: 7, months: ['2022-01'] },
};

function fakeSource({ withEst = true } = {}) {
  const cells = {
    '2021-12': { length: 2, cell: [a, b], n_equiv: [3, 100] },
    '2022-01': { length: 2, cell: [a, b], n_equiv: [10, 100] },
  };
  const d = day('2022-01-05');
  const pts = { length: 4, lat: [lat, lat, lat, lat + 1], lon: [lon, lon, lon, lon], d: [d, d, d, d],
    frp: [0.5, 30, 600, 999], day: [1, 0, 1, 1], platform: ['aqua', 'noaa20', 'noaa20', 'aqua'] };
  const calls = [];
  return {
    calls,
    getCells: async (res, m) => { calls.push(`cells ${res} ${m}`); return cells[m] ?? { length: 0, cell: [], n_equiv: [] }; },
    getEst: async (m) => (withEst && m === '2022-01' ? { length: 2, cell: [a, b], g: [0, 0], n_est: [10, 100] } : { length: 0, cell: [], g: [], n_est: [] }),
    getEstRatios: async () => (withEst ? { reps: 4, ratio: [[0.8, 0.9, 1.1, 1.2]] } : { reps: 0, ratio: [] }),
    getPointIndex: async (m) => (m === '2022-01' ? { tiles: { [tile]: 4 } } : { tiles: {} }),
    getPoints: async () => pts,
  };
}

test('calcRes: la de la serie si el mapa la publica; si no, la más fina', () => {
  assert.equal(calcRes(META), 7);
  assert.equal(calcRes({ ...META, cell_res: 8 }), 7);
});

test('frpBin: intervalos [0,1) [1,2) [2,5) … [500,∞)', () => {
  assert.equal(FRP_EDGES.length - 1, 10);
  assert.equal(frpBin(0), 0);
  assert.equal(frpBin(0.99), 0);
  assert.equal(frpBin(1), 1);
  assert.equal(frpBin(30), 5);
  assert.equal(frpBin(600), 9);
  assert.equal(frpBin(null), 0);
});

test('createSummarizer: valor, intervalo e histograma de FRP por familia de la selección', async () => {
  const src = fakeSource();
  const s = createSummarizer(src, META);
  const out = await s.run({ cells: [a] }, ['2021-12', '2022-01']);
  const { total, rows } = out.summary;
  assert.equal(total.nEquiv, 13);
  assert.deepEqual(rows.map((r) => r.origin), ['modis', 'viirs']);
  // 3 observados fijos + 10 convertidos × réplicas → p05/p95 como en summary.test.mjs
  assert.ok(Math.abs(total.lo - 11.15) < 1e-9 && Math.abs(total.hi - 14.85) < 1e-9, `${total.lo}–${total.hi}`);
  // Focos dentro de la celda a: aqua 0,5 MW (MODIS), noaa20 30 y 600 MW (VIIRS); el de la celda b no entra
  assert.equal(out.frp.MODIS.reduce((x, y) => x + y, 0), 1);
  assert.equal(out.frp.MODIS[0], 1);
  assert.equal(out.frp.VIIRS[5], 1);
  assert.equal(out.frp.VIIRS[9], 1);
  // Siempre en r7, sea cual sea el zoom
  assert.ok(src.calls.every((c) => c.startsWith('cells 7')));
});

test('createSummarizer: sin est/ (p. ej. mock-conosur) no se rompe y no inventa intervalo', async () => {
  const s = createSummarizer(fakeSource({ withEst: false }), META);
  const out = await s.run({ cells: new Set([a]) }, ['2022-01']);
  assert.equal(out.summary.total.nEquiv, 10);
  assert.equal(out.summary.total.lo, null);
});

test('createSummarizer: meses sin datos devuelven cero', async () => {
  const s = createSummarizer(fakeSource(), META);
  const out = await s.run({ cells: [a] }, ['2019-05']);
  assert.equal(out.summary.total.nEquiv, 0);
  assert.equal(out.frp.MODIS.reduce((x, y) => x + y, 0) + out.frp.VIIRS.reduce((x, y) => x + y, 0), 0);
});
