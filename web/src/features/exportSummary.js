/**
 * Exportar la ficha (CSV y JSON): serie por mes con valor, p05, p95, origen y cobertura, más la métrica,
 * la versión de datos y el config_hash. Con comparación, ambos períodos. Columnas en inglés estable.
 * La ficha (SelectionSummary) deja acá lo último que calculó con setExportData().
 */
let data = null;

/** { selection: { cells, area } | null, periods: [{ id: 'A'|'B', from, to, rows: [{ month, nEquiv, lo, hi, origin, coverage }] }] } */
export function setExportData(d) { data = d; }
export function getExportData() { return data; }

const num = (v, d = 3) => (v == null || !Number.isFinite(v) ? '' : String(Math.round(v * 10 ** d) / 10 ** d));

export function toCsv(d, meta) {
  const head = ['period', 'month', 'n_equiv', 'p05', 'p95', 'origin', 'coverage_frac', 'metric', 'dataset_version', 'config_hash', 'scope'];
  const scope = d.selection ? `selection_${d.selection.cells}_cells` : 'zone';
  const lines = [];
  for (const p of d.periods) {
    for (const r of p.rows) {
      lines.push([p.id, r.month, num(r.nEquiv), num(r.lo), num(r.hi), r.origin ?? '', num(r.coverage), meta.metric ?? '',
        meta.dataset_version ?? '', meta.config_hash ?? '', scope].join(','));
    }
  }
  return [head.join(','), ...lines].join('\n');
}

export function toJson(d, meta) {
  return JSON.stringify({
    zone: meta.zone, metric: meta.metric ?? null, reference: meta.reference ?? null,
    dataset_version: meta.dataset_version ?? null, config_hash: meta.config_hash ?? null, switch_date: meta.switch_date ?? null,
    scope: d.selection ? 'selection' : 'zone',
    selection: d.selection ? { h3_res: d.selection.res, cells: d.selection.cells, area_km2: d.selection.area } : null,
    periods: d.periods.map((p) => ({
      id: p.id, from: p.from, to: p.to,
      total: p.total ?? null,
      monthly: p.rows.map((r) => ({ month: r.month, n_equiv: r.nEquiv, p05: r.lo, p95: r.hi, origin: r.origin, coverage_frac: r.coverage })),
    })),
  }, null, 2);
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function exportSummary(kind, meta) {
  if (!data) return false;
  const a = data.periods[0];
  const name = `terra-australis_${data.selection ? 'seleccion' : 'zona'}_${a.from}_${a.to}${data.periods[1] ? `_vs_${data.periods[1].from}` : ''}`;
  if (kind === 'csv') download(`${name}.csv`, toCsv(data, meta), 'text/csv');
  else download(`${name}.json`, toJson(data, meta), 'application/json');
  return true;
}
