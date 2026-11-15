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
