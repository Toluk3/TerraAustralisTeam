/**
 * Lógica pura de la ficha (sin DOM, probada en tests/compare.test.mjs).
 */

/** ¿Se solapan los intervalos [lo, hi] de A y B? null si alguno no tiene intervalo. */
export function intervalsOverlap(a, b) {
  if (a?.lo == null || a?.hi == null || b?.lo == null || b?.hi == null) return null;
  return a.lo <= b.hi && b.lo <= a.hi;
}

/**
 * Diferencia A − B para la tarjeta de la ficha.
 *   kind 'inconclusive'  los intervalos se solapan: no se destaca un porcentaje
 *   kind 'absolute'      B = 0: se muestra la diferencia absoluta
 *   kind 'relative'      (A − B) / B, con `conclusive` true si los intervalos no se solapan y null si faltan
 */
export function compareAB(a, b) {
  if (!a || !b || a.value == null || b.value == null) return null;
  const abs = a.value - b.value;
  const overlap = intervalsOverlap(a, b);
  if (overlap === true) return { kind: 'inconclusive', abs, rel: b.value > 0 ? abs / b.value : null, conclusive: false };
  if (!(b.value > 0)) return { kind: 'absolute', abs, rel: null, conclusive: overlap === false ? true : null };
  return { kind: 'relative', abs, rel: abs / b.value, conclusive: overlap === false ? true : null };
}

/**
 * Resumen de un período con la zona completa, desde las filas de calendar.json.
 * Un mes: valor, p05–p95 y cobertura del calendario. Varios: suma de valores y sin intervalo (los
 * percentiles no se suman).
 */
export function zonePeriodSummary(rows, months, info) {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const sel = months.map((m) => byKey.get(m)).filter(Boolean);
  if (!sel.length) return null;
  const value = sel.reduce((s, r) => s + (r.value || 0), 0);
  const single = sel.length === 1;
  const origins = [...new Set(sel.map((r) => info?.origin(r.key) ?? 'modis'))];
  return {
    value,
    lo: single ? sel[0].p05 : null,
    hi: single ? sel[0].p95 : null,
    noIntervalReason: single ? (sel[0].p05 == null ? 'data' : null) : 'months',
    months: sel.length,
    coverage: Math.min(...sel.map((r) => r.coverage ?? 1)),
    origin: origins.length > 1 ? 'mixed' : origins[0],
    estimated: sel.some((r) => (info?.origin(r.key) ?? 'modis') !== 'modis'),
    rows: sel.map((r) => ({ month: r.key, nEquiv: r.value, lo: r.p05, hi: r.p95, origin: info?.origin(r.key) ?? 'modis', coverage: r.coverage })),
  };
}

/** Resumen de un período con selección, desde summarize() (summary.total y summary.rows). */
export function selectionPeriodSummary(summary) {
  if (!summary) return null;
  const { total, rows } = summary;
  const origins = [...new Set(rows.filter((r) => r.nEquiv > 0 || r.origin === 'modis').map((r) => r.origin))];
  return {
    value: total.nEquiv,
    lo: total.lo,
    hi: total.hi,
    noIntervalReason: total.lo == null ? 'data' : null,
    months: rows.length,
    coverage: rows.length ? Math.min(...rows.map((r) => r.coverage ?? 1)) : 1,
    origin: origins.length > 1 ? 'mixed' : origins[0] ?? 'modis',
    estimated: rows.some((r) => r.origin !== 'modis'),
    rows: rows.map((r) => ({ month: r.month, nEquiv: r.nEquiv, lo: r.lo, hi: r.hi, origin: r.origin, coverage: r.coverage })),
  };
}
