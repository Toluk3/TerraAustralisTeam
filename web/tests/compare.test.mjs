// Lógica pura de la ficha y de la barra de comparación.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compareAB, intervalsOverlap, zonePeriodSummary } from '../src/features/compareLogic.js';
import { clampSplit, SPLIT_MIN, SPLIT_MAX } from '../src/stores/analysis.js';

test('intervalsOverlap', () => {
  assert.equal(intervalsOverlap({ lo: 1, hi: 5 }, { lo: 4, hi: 9 }), true);
  assert.equal(intervalsOverlap({ lo: 1, hi: 3 }, { lo: 4, hi: 9 }), false);
  assert.equal(intervalsOverlap({ lo: 5, hi: 5 }, { lo: 5, hi: 8 }), true); // se tocan
  assert.equal(intervalsOverlap({ lo: null, hi: null }, { lo: 4, hi: 9 }), null);
});

test('compareAB: intervalos que se solapan → diferencia no concluyente', () => {
  const d = compareAB({ value: 105, lo: 95, hi: 115 }, { value: 100, lo: 90, hi: 110 });
  assert.equal(d.kind, 'inconclusive');
  assert.equal(d.conclusive, false);
});

test('compareAB: sin solaparse → porcentaje (A − B) / B, concluyente', () => {
  const d = compareAB({ value: 1240, lo: 1080, hi: 1410 }, { value: 610, lo: 540, hi: 690 });
  assert.equal(d.kind, 'relative');
  assert.equal(d.conclusive, true);
  assert.ok(Math.abs(d.rel - (1240 - 610) / 610) < 1e-12);
});

test('compareAB: sin intervalos → porcentaje sin poder decir si es concluyente', () => {
  const d = compareAB({ value: 20, lo: null, hi: null }, { value: 10, lo: null, hi: null });
  assert.equal(d.kind, 'relative');
  assert.equal(d.conclusive, null);
  assert.equal(d.rel, 1);
});

test('compareAB: B = 0 → diferencia absoluta', () => {
  const d = compareAB({ value: 7, lo: 7, hi: 7 }, { value: 0, lo: 0, hi: 0 });
  assert.equal(d.kind, 'absolute');
  assert.equal(d.abs, 7);
  assert.equal(d.rel, null);
});

test('posición de la barra: límites 4 %–96 %', () => {
  assert.equal(clampSplit(0.5), 0.5);
  assert.equal(clampSplit(-1), SPLIT_MIN);
  assert.equal(clampSplit(0), 0.04);
  assert.equal(clampSplit(1), SPLIT_MAX);
  assert.equal(clampSplit(2), 0.96);
  assert.equal(clampSplit(NaN), 0.5);
});

test('zonePeriodSummary: un mes con intervalo; varios meses suman sin intervalo', () => {
  const rows = [
    { key: '2021-12', value: 10, p05: 10, p95: 10, coverage: 1 },
    { key: '2022-01', value: 20, p05: 18, p95: 23, coverage: 0.5 },
  ];
  const info = { origin: (m) => (m >= '2022-01' ? 'viirs' : 'modis') };
  const one = zonePeriodSummary(rows, ['2022-01'], info);
  assert.deepEqual([one.value, one.lo, one.hi, one.origin, one.estimated], [20, 18, 23, 'viirs', true]);
  const two = zonePeriodSummary(rows, ['2021-12', '2022-01'], info);
  assert.deepEqual([two.value, two.lo, two.hi, two.noIntervalReason, two.origin, two.coverage], [30, null, null, 'months', 'mixed', 0.5]);
  assert.equal(zonePeriodSummary(rows, ['1999-01'], info), null);
});
