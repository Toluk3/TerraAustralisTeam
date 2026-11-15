/**
 * Conjunto de datos de la app (una sola carga, compartida por todas las pantallas).
 * Prueba las carpetas en orden: VITE_MOCK_BASE, mock-s1, mock-conosur, mock-api, y usa la primera cuyo
 * meta.json responda JSON. No importa el módulo del mapa entero (MapLibre/deck.gl): solo su fuente de datos.
 */
import { createStaticSource } from './fire-map/data.js';

const ORDER = [import.meta.env?.VITE_MOCK_BASE, 'mock-s1', 'mock-conosur', 'mock-api']
  .filter(Boolean)
  .map((b) => String(b).replace(/^\/|\/$/g, ''));
// Carpetas que el servidor de desarrollo encontró (vite.config.js). Si hay lista, solo se prueban esas,
// así no queda un 404 en la consola por cada carpeta que no existe.
// eslint-disable-next-line no-undef
const FOUND = typeof __TERRA_DATASETS__ !== 'undefined' ? __TERRA_DATASETS__ : [];
export const CANDIDATES = FOUND.length
  ? [...ORDER.filter((b) => FOUND.includes(b)), ...FOUND.filter((b) => !ORDER.includes(b))]
  : ORDER;

let pending = null;

async function probe(base) {
  try {
    const r = await fetch(`/${base}/meta.json`, { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const type = r.headers.get('content-type') || '';
    if (!type.includes('json')) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export function loadDataset() {
  pending ??= (async () => {
    for (const base of [...new Set(CANDIDATES)]) {
      const meta = await probe(base);
      if (!meta) continue;
      const source = createStaticSource(`/${base}`);
      // La fuente cachea meta: se le pasa la que ya bajamos para no pedirla dos veces
      source.getMeta = () => Promise.resolve(meta);
      const calendar = await source.getCalendar();
      return { base, source, meta, calendar };
    }
    const err = new Error(`No se encontró ningún conjunto de datos (${CANDIDATES.map((c) => `/${c}/meta.json`).join(', ')})`);
    err.code = 'NO_DATA';
    err.candidates = CANDIDATES;
    throw err;
  })().catch((e) => { pending = null; throw e; });
  return pending;
}

const pad = (n) => String(n).padStart(2, '0');

/** calendar.json (columnar) → filas por mes. */
export function calendarRows(cal) {
  const rows = [];
  for (let i = 0; i < (cal?.length ?? 0); i++) {
    const year = cal.year[i];
    const month = cal.month[i];
    rows.push({
      key: `${year}-${pad(month)}`,
      year,
      month,
      value: cal.n_equiv[i] ?? 0,
      p05: cal.p05?.[i] ?? null,
      p95: cal.p95?.[i] ?? null,
      coverage: cal.coverage_frac?.[i] ?? 1,
      status: cal.status?.[i] ?? 'ok',
      median: cal.median?.[i] ?? null,
      anomalyPct: cal.anomaly_pct?.[i] ?? null,
      anomalyAbs: cal.anomaly_abs?.[i] ?? null,
      rank: cal.pct_rank?.[i] ?? null,
    });
  }
  return rows;
}

/**
 * Puesto del mes entre los mismos meses calendario de la serie (1 = el más activo). Sale de los valores
 * de calendar.json, igual que pct_rank, pero como posición legible ("3.º febrero más activo").
 */
export function monthRank(rows, key) {
  const row = rows.find((r) => r.key === key);
  if (!row) return null;
  const same = rows.filter((r) => r.month === row.month);
  const pos = same.filter((r) => r.value > row.value).length + 1;
  return { pos, of: same.length };
}
