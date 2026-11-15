/**
 * Estado compartido de la pantalla Análisis. Única fuente de verdad: los componentes lo leen y lo
 * modifican; nada se comunica "de a pares".
 */
import { reactive } from 'vue';

/** 'YYYY-MM' → índice de mes (año*12 + mes-1). */
export function monthIndex(key) {
  const [y, m] = String(key).split('-').map(Number);
  return y * 12 + (m - 1);
}
/** Índice de mes → 'YYYY-MM'. */
export function monthKey(i) {
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}
export const addMonths = (key, n) => monthKey(monthIndex(key) + n);
/** Meses entre dos claves, ambas incluidas. */
export function monthsBetween(from, to = from) {
  const a = monthIndex(from), b = monthIndex(to);
  const out = [];
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(monthKey(i));
  return out;
}

export const SPLIT_MIN = 0.04;
export const SPLIT_MAX = 0.96;
/** Posición de la barra de AB, limitada a 4 %–96 %. */
export function clampSplit(x) {
  if (!Number.isFinite(x)) return 0.5;
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, x));
}

const defaults = () => ({
  ready: false,
  periodA: { from: null, to: null },
  periodB: { from: null, to: null },
  compare: false,
  mode: 'AB',          // 'A' | 'AB' | 'B'
  split: 0.5,
  view: 'value',       // 'value' | 'anomaly' | 'diff'
  // La máscara (todo menos la zona) va siempre; el contorno de la zona no se dibuja
  layers: { cells: true, points: true, outline: false, mask: true },
  opacity: 0.75,
  selection: null,     // payload del evento `selection` de la instancia A, o null
  lasso: false,
});

export const analysis = reactive(defaults());

/** Vuelve al estado inicial (pruebas, o al salir y volver a la pantalla). */
export function resetAnalysis() { Object.assign(analysis, defaults()); }

/**
 * Arranque con las filas del calendario: A = último mes con valor > 0; B = el mismo mes del año anterior
 * (si existe en la serie). `demo` enciende Comparar (enlace "Ver una comparación").
 */
export function initAnalysis(rows, { demo = false } = {}) {
  const keys = new Set(rows.map((r) => r.key));
  const last = [...rows].reverse().find((r) => r.value > 0) ?? rows.at(-1);
  const a = last?.key ?? null;
  let b = a ? addMonths(a, -12) : null;
  if (b && !keys.has(b)) b = rows[0]?.key ?? a;
  analysis.periodA = { from: a, to: a };
  analysis.periodB = { from: b, to: b };
  analysis.compare = Boolean(demo);
  analysis.mode = 'AB';
  analysis.split = 0.5;
  analysis.view = 'value';
  analysis.selection = null;
  analysis.ready = true;
}

/** Fija el período A o B; si el rango queda al revés, lo invierte. */
export function setPeriod(which, from, to = from) {
  if (!from) return;
  const [f, t] = monthIndex(from) <= monthIndex(to) ? [from, to] : [to, from];
  const key = which === 'B' ? 'periodB' : 'periodA';
  analysis[key] = { from: f, to: t };
  // La anomalía es por mes: con un rango vuelve a Valor
  if (key === 'periodA' && analysis.view === 'anomaly' && f !== t) analysis.view = 'value';
}

export function setCompare(on) {
  analysis.compare = Boolean(on);
  if (analysis.compare) {
    analysis.mode = 'AB';
    analysis.split = 0.5;
  } else if (analysis.view === 'diff') {
    analysis.view = 'value';
  }
}

export function setMode(m) {
  if (!['A', 'AB', 'B'].includes(m)) return;
  analysis.mode = m;
  if (m === 'AB') analysis.split = 0.5;
}

export function setSplit(x) { analysis.split = clampSplit(x); }

export function setView(v) {
  if (v === 'diff' && !analysis.compare) return;
  if (v === 'anomaly' && analysis.periodA.from !== analysis.periodA.to) return;
  if (['value', 'anomaly', 'diff'].includes(v)) analysis.view = v;
}

export const periodMonths = (p) => (p?.from ? monthsBetween(p.from, p.to ?? p.from) : []);

// --- API de la instancia A del mapa (para borrar la selección o activar el lazo desde la UI) ---
let mapA = null;
export function setMapApi(api) { mapA = api; }
export function getMapApi() { return mapA; }
export function clearSelection() {
  mapA?.clearSelection();
  analysis.selection = null;
}
export function setLasso(on) {
  mapA?.setLassoMode(Boolean(on));
}
