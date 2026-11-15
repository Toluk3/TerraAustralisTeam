// Estado compartido de Análisis (src/stores/analysis.js), sin DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analysis, resetAnalysis, initAnalysis, setPeriod, setCompare, setMode, setSplit, setView,
  monthIndex, monthKey, addMonths, monthsBetween,
} from '../src/stores/analysis.js';

const rows = [
  { key: '2023-02', value: 50 }, { key: '2023-03', value: 10 },
  { key: '2024-01', value: 0 }, { key: '2024-02', value: 80 }, { key: '2024-03', value: 0 },
];

test('utilidades de meses', () => {
  assert.equal(monthKey(monthIndex('2024-02')), '2024-02');
  assert.equal(addMonths('2024-01', -1), '2023-12');
  assert.equal(addMonths('2023-12', 13), '2025-01');
  assert.deepEqual(monthsBetween('2023-11', '2024-02'), ['2023-11', '2023-12', '2024-01', '2024-02']);
  assert.deepEqual(monthsBetween('2024-02', '2023-12'), ['2023-12', '2024-01', '2024-02']);
});

test('initAnalysis: A = último mes con valor > 0, B = mismo mes del año anterior', () => {
  resetAnalysis();
  initAnalysis(rows);
  assert.deepEqual(analysis.periodA, { from: '2024-02', to: '2024-02' });
  assert.deepEqual(analysis.periodB, { from: '2023-02', to: '2023-02' });
  assert.equal(analysis.compare, false);
  assert.equal(analysis.ready, true);
  initAnalysis(rows, { demo: true });
  assert.equal(analysis.compare, true);
  assert.equal(analysis.mode, 'AB');
});

test('initAnalysis: sin el mes del año anterior, B cae en el primer mes de la serie', () => {
  resetAnalysis();
  initAnalysis([{ key: '2024-05', value: 3 }, { key: '2024-06', value: 4 }]);
  assert.deepEqual(analysis.periodB, { from: '2024-05', to: '2024-05' });
});

test('setPeriod invierte un rango al revés', () => {
  resetAnalysis();
  initAnalysis(rows);
  setPeriod('A', '2024-03', '2023-11');
  assert.deepEqual(analysis.periodA, { from: '2023-11', to: '2024-03' });
  setPeriod('B', '2020-01');
  assert.deepEqual(analysis.periodB, { from: '2020-01', to: '2020-01' });
});

test('setCompare: al encender AB y barra al 50 %; al apagar con Diferencia vuelve a Valor', () => {
  resetAnalysis();
  initAnalysis(rows);
  setMode('B');
  setSplit(0.8);
  setCompare(true);
  assert.equal(analysis.mode, 'AB');
  assert.equal(analysis.split, 0.5);
  setView('diff');
  assert.equal(analysis.view, 'diff');
  setCompare(false);
  assert.equal(analysis.view, 'value');
  setView('diff'); // sin comparar no se puede
  assert.equal(analysis.view, 'value');
});

test('setMode: AB recentra la barra; A y B no la tocan', () => {
  resetAnalysis();
  initAnalysis(rows, { demo: true });
  setSplit(0.3);
  setMode('A');
  assert.equal(analysis.split, 0.3);
  setMode('AB');
  assert.equal(analysis.split, 0.5);
  setMode('X');
  assert.equal(analysis.mode, 'AB');
});

test('Anomalía solo con un mes', () => {
  resetAnalysis();
  initAnalysis(rows);
  setView('anomaly');
  assert.equal(analysis.view, 'anomaly');
  setPeriod('A', '2024-01', '2024-03');
  assert.equal(analysis.view, 'value');
  setView('anomaly');
  assert.equal(analysis.view, 'value');
});
