// Pruebas del cálculo del panel de selección (src/map/summary.js).   npm test
// Las que usan datos leen public/mock-api (scripts/build_mocks.py) y se saltean si no está generado.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { latLngToCell, cellToParent, cellToLatLng } from 'h3-js';
import { summarize, seriesInfo, groupByYear } from '../src/map/summary.js';

const META = {
  switch_date: '2022-01-01',
  reduced_coverage_months: [{ year: 2020, month: 8, coverage_frac: 0.484 }],
  platform_periods: [
    { platform: 'terra', valid_from: '2000-11-01', valid_to: null, kind: 'operación' },
    { platform: 'aqua', valid_from: '2002-07-04', valid_to: null, kind: 'operación' },
    { platform: 'aqua', valid_from: '2020-08-16', valid_to: '2020-09-02', kind: 'corte' },
    { platform: 'noaa20', valid_from: '2018-04-01', valid_to: null, kind: 'operación' },
    { platform: 'noaa21', valid_from: '2024-01-17', valid_to: null, kind: 'operación' },
    { platform: 'terra', valid_from: '2000-01-01', valid_to: '2025-12-31', kind: 'datos' },
    { platform: 'aqua', valid_from: '2000-01-01', valid_to: '2025-12-31', kind: 'datos' },
    { platform: 'noaa20', valid_from: '2018-01-01', valid_to: '2025-12-31', kind: 'datos' },
  ],
};
const day = (iso) => Date.parse(iso) / 86400000;

test('seriesInfo: origen, cobertura y pasadas por día', () => {
  const info = seriesInfo(META);
  assert.equal(info.origin('2001-05'), 'terra');
  assert.equal(info.origin('2002-07'), 'modis');
  assert.equal(info.origin('2021-12'), 'modis');
  assert.equal(info.origin('2022-01'), 'viirs');
  assert.equal(info.coverage('2020-08'), 0.484);
  assert.equal(info.coverage('2020-07'), 1);
  assert.equal(info.overpasses('MODIS', day('2001-01-10')), 2);   // Terra sola
  assert.equal(info.overpasses('MODIS', day('2010-01-10')), 4);   // Terra + Aqua, haya o no focos de las dos
  assert.equal(info.overpasses('MODIS', day('2020-08-20')), 2);   // corte de Aqua
  assert.equal(info.overpasses('VIIRS', day('2025-01-10')), 2);   // NOAA-21 opera pero no tiene archivos
});

test('summarize: intervalo, origen y focos de una selección sintética', () => {
  const lat = -40, lon = -70;
  const a = latLngToCell(lat, lon, 7);
  const b = latLngToCell(lat + 1, lon, 7);
  const sel = { res: 7, cells: new Set([a]), bbox: [lon - 1, lat - 1, lon + 1, lat + 1] };
  const cellTables = new Map([
    ['2021-12', { length: 2, cell: [a, b], n_equiv: [3, 100] }],
    ['2022-01', { length: 2, cell: [a, b], n_equiv: [10, 100] }],
  ]);
  const estTables = new Map([['2022-01', { length: 2, cell: [a, b], g: [0, 0], n_est: [10, 100] }]]);
  const ratios = { reps: 4, ratio: [[0.8, 0.9, 1.1, 1.2]] };
  const d = day('2022-01-05');
  const pts = { length: 3, lat: [lat, lat, lat + 1], lon: [lon, lon, lon], d: [d, d, d], frp: [10, 30, 999],
    day: [1, 0, 1], platform: ['aqua', 'terra', 'aqua'] };
  const out = summarize(sel, ['2021-12', '2022-01'], cellTables, new Map([['2022-01', [pts]]]),
    { info: seriesInfo(META), estTables, ratios });
  const [dec, jan] = out.rows;
  assert.deepEqual([dec.origin, dec.nEquiv, dec.lo, dec.hi], ['modis', 3, 3, 3]);
  assert.equal(jan.origin, 'viirs');
  assert.ok(Math.abs(jan.lo - 8.15) < 1e-9 && Math.abs(jan.hi - 11.85) < 1e-9, `${jan.lo}–${jan.hi}`);
  // total: lo observado (3) queda fijo y solo se mueve lo convertido
  assert.ok(Math.abs(out.total.lo - 11.15) < 1e-9 && Math.abs(out.total.hi - 14.85) < 1e-9);
  assert.equal(out.total.nEquiv, 13);
  assert.equal(out.total.detections, 2);          // el foco de la otra celda no entra
  assert.equal(out.total.convertedMonths, 1);
  assert.deepEqual([jan.detModis, jan.detViirs], [2, 0]);
  // FRE: (10 + 30) MW / 4 pasadas × 86 400 s
  assert.equal(jan.fre, (40 / 4) * 86400);
  // por año: 2021 es observado (sin ancho) y 2022 lleva el intervalo de su mes convertido
  const years = groupByYear(out.rows);
  assert.deepEqual(years.map((y) => [y.year, y.nEquiv, y.origin]), [['2021', 3, 'modis'], ['2022', 10, 'viirs']]);
  assert.deepEqual([years[0].lo, years[0].hi], [3, 3]);
  assert.ok(Math.abs(years[1].lo - 8.15) < 1e-9 && Math.abs(years[1].hi - 11.85) < 1e-9);
  // sin datos de incertidumbre no se inventa un intervalo
  const bare = summarize(sel, ['2022-01'], cellTables, new Map(), { info: seriesInfo(META) });
  assert.equal(bare.total.lo, null);
});

const base = fileURLToPath(new URL('../public/mock-api', import.meta.url));
const J = (p) => JSON.parse(fs.readFileSync(base + p, 'utf8'));
const skip = fs.existsSync(`${base}/meta.json`) ? false : 'falta public/mock-api (python scripts/build_mocks.py)';

test('datos: cada foco está en la tesela madre de su celda de la serie', { skip }, () => {
  const meta = J('/meta.json');
  let n = 0;
  for (const m of meta.points.months) {
    const idx = J(`/points/${m}/index.json`);
    for (const tile of Object.keys(idx.tiles)) {
      const t = J(`/points/${m}/${tile}.json`);
      for (let i = 0; i < t.length; i++, n++) {
        const cell = latLngToCell(t.lat[i], t.lon[i], meta.cell_res);
        assert.equal(cellToParent(cell, meta.points.tile_res), tile, `${m} ${tile} foco ${i}`);
      }
    }
  }
  assert.ok(n > 0);
});

test('datos: una selección de toda la zona no pierde focos y reproduce el intervalo del pipeline', { skip }, () => {
  const meta = J('/meta.json');
  const res = meta.cell_res;
  const cal = J('/calendar.json');
  const info = seriesInfo(meta);
  const ratios = J('/est/ratios.json');
  // Hasta 6 meses convertidos con fuego, repartidos en la serie
  const est = meta.uncertainty.months;
  const months = [...new Set([0, 0.2, 0.4, 0.6, 0.8, 0.999].map((f) => est[Math.floor(f * est.length)]))];
  for (const m of months) {
    const cells = new Set(J(`/map/res=${res}/${m}.json`).cell);
    const idx = J(`/points/${m}/index.json`);
    const tables = Object.keys(idx.tiles).map((t) => J(`/points/${m}/${t}.json`));
    let nPoints = 0;
    for (const t of tables) for (let i = 0; i < t.length; i++, nPoints++) cells.add(latLngToCell(t.lat[i], t.lon[i], res));
    let w = 180, s = 90, e = -180, n = -90;
    for (const c of cells) { const [la, lo] = cellToLatLng(c); w = Math.min(w, lo); e = Math.max(e, lo); s = Math.min(s, la); n = Math.max(n, la); }
    const sel = { res, cells, bbox: [w - 1, s - 1, e + 1, n + 1] };
    const out = summarize(sel, [m], new Map([[m, J(`/map/res=${res}/${m}.json`)]]), new Map([[m, tables]]),
      { info, estTables: new Map([[m, J(`/est/${m}.json`)]]), ratios });
    assert.equal(out.total.detections, nPoints, `${m}: focos`);
    const i = cal.year.findIndex((y, k) => `${y}-${String(cal.month[k]).padStart(2, '0')}` === m);
    const tol = 0.02 + 0.002 * cal.n_equiv[i]; // redondeos de los JSON
    assert.ok(Math.abs(out.total.nEquiv - cal.n_equiv[i]) < tol, `${m}: n_equiv ${out.total.nEquiv} vs ${cal.n_equiv[i]}`);
    assert.ok(Math.abs(out.total.lo - cal.p05[i]) < tol, `${m}: p05 ${out.total.lo} vs ${cal.p05[i]}`);
    assert.ok(Math.abs(out.total.hi - cal.p95[i]) < tol, `${m}: p95 ${out.total.hi} vs ${cal.p95[i]}`);
  }
});
