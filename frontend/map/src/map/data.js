/**
 * Fuentes de datos del mapa y de la barra de tiempo. Los módulos solo dependen de esta interfaz
 * (`month` siempre es 'YYYY-MM'):
 *
 *   getMeta()                  → { outline, switch_date, coverage, reduced_coverage_months, attribution,
 *                                  map: {resolutions, domain, months}, points: {tile_res, min_zoom, months} }
 *   getCalendar()              → columnar { year[], month[], n_equiv[], p05[], p95[], status[], median[], anomaly_pct[], ... }
 *   getTimeline8d()            → columnar { year[], period_8d[], period_start[], n_equiv[], ... }
 *   getCells(res, month)       → columnar { length, cell[], n_equiv[], anomaly_pct[] }
 *   getPointIndex(month)       → { tile_res, tiles: { <h3 r2>: cantidad } }
 *   getPoints(month, tile)     → columnar { length, lat[], lon[], t[], d[], frp[], day[], platform[], conf[] }
 *
 * `createStaticSource` lee los JSON de public/mock-api (scripts/build_mocks.py).
 * `createApiSource` habla con el backend (formato propuesto en README.md).
 * Las dos guardan en caché lo que ya bajaron; un mes o tesela sin datos devuelve una tabla vacía.
 */

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`${url}: HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

/** Igual que getJson, pero un 404 (o un HTML de fallback del servidor de desarrollo) es "sin datos". */
async function getJsonOr(url, empty) {
  try {
    return await getJson(url);
  } catch (e) {
    if (e.status === 404 || e instanceof SyntaxError) return empty;
    throw e;
  }
}

function cached(fn) {
  const cache = new Map();
  return (...args) => {
    const key = args.join('|');
    if (!cache.has(key)) {
      const p = fn(...args).catch((e) => {
        cache.delete(key); // no guardar errores: el próximo pedido reintenta
        throw e;
      });
      cache.set(key, p);
    }
    return cache.get(key);
  };
}

const EMPTY_CELLS = { length: 0, cell: [], n_equiv: [], anomaly_pct: [] };
const EMPTY_POINTS = { length: 0, lat: [], lon: [], t: [], d: [], frp: [], day: [], platform: [], conf: [] };
const EMPTY_INDEX = { tiles: {} };

export function createStaticSource(baseUrl = '/mock-api') {
  const base = baseUrl.replace(/\/$/, '');
  return {
    getMeta: cached(() => getJson(`${base}/meta.json`)),
    getCalendar: cached(() => getJson(`${base}/calendar.json`)),
    getTimeline8d: cached(() => getJson(`${base}/timeline_8d.json`)),
    getCells: cached((res, month) => getJsonOr(`${base}/map/res=${res}/${month}.json`, EMPTY_CELLS)),
    getPointIndex: cached((month) => getJsonOr(`${base}/points/${month}/index.json`, EMPTY_INDEX)),
    getPoints: cached((month, tile) => getJsonOr(`${base}/points/${month}/${tile}.json`, EMPTY_POINTS)),
  };
}

export function createApiSource(baseUrl = '/api') {
  const base = baseUrl.replace(/\/$/, '');
  return {
    getMeta: cached(() => getJson(`${base}/meta`)),
    getCalendar: cached(() => getJson(`${base}/calendar`)),
    getTimeline8d: cached(() => getJson(`${base}/timeline?step=8d`)),
    getCells: cached((res, month) => getJsonOr(`${base}/map?res=${res}&month=${month}`, EMPTY_CELLS)),
    getPointIndex: cached((month) => getJsonOr(`${base}/points/index?month=${month}`, EMPTY_INDEX)),
    getPoints: cached((month, tile) => getJsonOr(`${base}/points?month=${month}&tile=${tile}`, EMPTY_POINTS)),
  };
}
