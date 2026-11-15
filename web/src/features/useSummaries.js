/**
 * Calcula los resúmenes de los períodos A y B (zona completa o selección) y el histograma de FRP, y los
 * deja en `results` para la ficha, el histograma y la calidad del dato. Cancela cálculos viejos con un token.
 */
import { shallowReactive, watch } from 'vue';
import { analysis, periodMonths } from '@/stores/analysis.js';
import { createSummarizer } from './summaryLoader.js';
import { zonePeriodSummary, selectionPeriodSummary } from './compareLogic.js';
import { setExportData } from './exportSummary.js';

export const results = shallowReactive({
  loading: false,
  error: null,
  A: null,
  B: null,
  frpA: null,
  frpB: null,
  scope: 'zone', // 'zone' | 'selection'
});

export function useSummaries(dsRef, rowsRef) {
  let summarizer = null;
  let token = 0;

  async function compute() {
    const ds = dsRef.value;
    if (!ds || !analysis.ready) return;
    summarizer ??= createSummarizer(ds.source, ds.meta);
    const my = ++token;
    const sel = analysis.selection;
    const monthsA = periodMonths(analysis.periodA);
    const monthsB = analysis.compare ? periodMonths(analysis.periodB) : [];
    results.scope = sel ? 'selection' : 'zone';
    results.error = null;
    if (!sel) {
      results.A = zonePeriodSummary(rowsRef.value, monthsA, summarizer.info);
      results.B = analysis.compare ? zonePeriodSummary(rowsRef.value, monthsB, summarizer.info) : null;
      results.frpA = null;
      results.frpB = null;
      results.loading = false;
      publish();
      return;
    }
    results.loading = true;
    try {
      const [ra, rb] = await Promise.all([
        summarizer.run(sel, monthsA),
        analysis.compare ? summarizer.run(sel, monthsB) : Promise.resolve(null),
      ]);
      if (my !== token) return;
      results.A = selectionPeriodSummary(ra.summary);
      results.B = rb ? selectionPeriodSummary(rb.summary) : null;
      results.frpA = ra.frp;
      results.frpB = rb?.frp ?? null;
      publish();
    } catch (e) {
      if (my === token) results.error = e;
    } finally {
      if (my === token) results.loading = false;
    }
  }

  function publish() {
    const sel = analysis.selection;
    const periods = [];
    if (results.A) periods.push({ id: 'A', ...analysis.periodA, rows: results.A.rows, total: { n_equiv: results.A.value, p05: results.A.lo, p95: results.A.hi } });
    if (results.B) periods.push({ id: 'B', ...analysis.periodB, rows: results.B.rows, total: { n_equiv: results.B.value, p05: results.B.lo, p95: results.B.hi } });
    setExportData(periods.length ? {
      selection: sel ? { res: sel.res, cells: sel.cells.length, area: sel.area } : null,
      periods,
    } : null);
  }

  watch(
    () => [analysis.ready, analysis.selection, analysis.compare, analysis.periodA.from, analysis.periodA.to,
      analysis.periodB.from, analysis.periodB.to, dsRef.value],
    compute,
    { immediate: true },
  );
  return { results, compute };
}
