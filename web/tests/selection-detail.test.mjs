// Lógica pura de la ventana de la selección: unidades de masa y CSV exploratorio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtMassParts, explCsv } from '../src/features/selectionDetail.js';

test('fmtMassParts elige la unidad según el tamaño', () => {
  assert.equal(fmtMassParts(null), null);
  assert.deepEqual(fmtMassParts(0.25), { value: 250, unit: 'kg', digits: 0 });
  assert.deepEqual(fmtMassParts(5), { value: 5, unit: 't', digits: 1 });
  assert.deepEqual(fmtMassParts(5000), { value: 5000, unit: 't', digits: 0 });
  assert.deepEqual(fmtMassParts(25000), { value: 25, unit: 'kt', digits: 1 });
  assert.deepEqual(fmtMassParts(3e6), { value: 3, unit: 'mt', digits: 2 });
});

test('explCsv: una fila por mes con las columnas del panel original', () => {
  const csv = explCsv([
    { month: '2025-01', detections: 12, frpSum: 100.26, frpMax: 40.04, activeDays: 3, fre: 1234.6, biomass: 0.4543, co2: 0.7269, family: 'MODIS' },
    { month: '2025-02', detections: 0, frpSum: 0, frpMax: 0, activeDays: 0, fre: 0, biomass: 0, co2: 0, family: null },
  ]).split('\n');
  assert.equal(csv.length, 3);
  assert.equal(csv[0].split(',').length, 9);
  assert.equal(csv[1], '2025-01,12,100.3,40.0,3,1235,0.454,0.727,MODIS');
  assert.equal(csv[2], '2025-02,0,0.0,0.0,0,0,0.000,0.000,');
});

test('chartMonths: completa un año hacia atrás y no pasa del inicio de la serie', async () => {
  const { chartMonths } = await import('../src/features/selectionDetail.js');
  const one = chartMonths({ from: '2025-03', to: '2025-03' }, '2000-11');
  assert.equal(one.length, 12);
  assert.equal(one[0], '2024-04');
  assert.equal(one.at(-1), '2025-03');
  assert.deepEqual(chartMonths({ from: '2001-01', to: '2001-01' }, '2000-11'), ['2000-11', '2000-12', '2001-01']);
  assert.equal(chartMonths({ from: '2020-01', to: '2023-12' }, '2000-11').length, 48);
  assert.deepEqual(chartMonths({}, '2000-11'), []);
});

test('chartAxis: tope redondo con 2 a 4 líneas', async () => {
  const { chartAxis } = await import('../src/features/selectionDetail.js');
  assert.deepEqual(chartAxis(0), { top: 1, ticks: [] });
  const a = chartAxis(87);
  assert.ok(a.top >= 87 && a.ticks.length >= 2 && a.ticks.length <= 4);
  assert.equal(a.ticks.at(-1), a.top);
});
