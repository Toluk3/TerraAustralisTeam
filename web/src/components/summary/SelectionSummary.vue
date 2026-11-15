<script setup>
/**
 * Ficha de la selección (boceto, zona 6), a todo el ancho bajo el mapa: A, B, A − B, anomalía de la zona y
 * origen del valor. Sin selección usa calendar.json (zona completa); con selección, summarize().
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { getHexagonAreaAvg } from 'h3-js';
import { analysis, clearSelection } from '@/stores/analysis.js';
import { results } from '@/features/useSummaries.js';
import { compareAB } from '@/features/compareLogic.js';
import { monthRank } from '@/features/dataset.js';
import { intlLocale } from '@/stores/ui.js';

const props = defineProps({
  meta: { type: Object, required: true },
  rows: { type: Array, required: true },
});
const { t, locale } = useI18n();

const nf = (d = 0) => new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: d, minimumFractionDigits: 0 });
const fmtV = (v) => (v == null ? '—' : nf(v < 10 ? 1 : 0).format(v));
const fmtPct = (x, signed = true) => (x == null ? '—' : `${signed && x > 0 ? '+' : ''}${nf(0).format(x * 100)} %`);
const fmtMonth = (k, style = 'short') => new Intl.DateTimeFormat(intlLocale(), { month: style, year: 'numeric', timeZone: 'UTC' })
  .format(new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, 1)));
const fmtPeriod = (p) => (!p?.from ? '' : p.to !== p.from ? `${fmtMonth(p.from)} – ${fmtMonth(p.to)}` : fmtMonth(p.from));

// Escala validada: la región de calibración más fina (r3, ~12.400 km²)
const levelRes = computed(() => Number(/^r(\d+)$/.exec(props.meta.calibration_levels?.[0] ?? 'r3')?.[1] ?? 3));
const validatedArea = computed(() => getHexagonAreaAvg(levelRes.value, 'km2'));

const sel = computed(() => analysis.selection);
const header = computed(() => (sel.value
  ? t('summary.selection', { n: nf(0).format(sel.value.cells.length), area: nf(0).format(sel.value.area) })
  : t('summary.zone', { zone: props.meta.zone })));
const belowScale = computed(() => sel.value && sel.value.area < validatedArea.value);

function intervalText(s) {
  if (!s) return '';
  if (s.lo == null) {
    const why = s.noIntervalReason === 'months' ? t('summary.noIntervalMonths', { n: s.months }) : t('summary.noIntervalData');
    return `${t('summary.noInterval')} · ${why}`;
  }
  return t('summary.interval', { lo: fmtV(s.lo), hi: fmtV(s.hi) });
}
const originText = (s) => (s ? t(`summary.origins.${s.origin}`) : '—');

const diff = computed(() => (analysis.compare ? compareAB(results.A, results.B) : null));
const diffMain = computed(() => {
  const d = diff.value;
  if (!d) return '—';
  if (d.kind === 'inconclusive') return t('summary.inconclusive');
  if (d.kind === 'absolute') return `${d.abs > 0 ? '+' : ''}${fmtV(d.abs)}`;
  return fmtPct(d.rel);
});
const diffSub = computed(() => {
  const d = diff.value;
  if (!d) return '';
  if (d.kind === 'inconclusive') return t('summary.inconclusiveWhy');
  if (d.kind === 'absolute') return t('summary.diffAbs');
  return d.conclusive ? t('summary.noOverlap') : t('summary.noIntervalCompare');
});
const diffWarn = computed(() => diff.value && diff.value.kind !== 'inconclusive' && Math.abs(diff.value.abs) > 0);

// Anomalía de la zona completa (la anomalía por selección no está en los datos)
const anomaly = computed(() => {
  locale.value;
  const p = analysis.periodA;
  if (!p.from || p.from !== p.to) return { main: '—', sub: t('summary.anomalyRange') };
  const row = props.rows.find((r) => r.key === p.from);
  if (!row) return { main: '—', sub: '' };
  const rk = monthRank(props.rows, p.from);
  const monthName = new Intl.DateTimeFormat(intlLocale(), { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2020, row.month - 1, 1)));
  let suffix = '';
  if (locale.value === 'en' && rk) {
    const pr = new Intl.PluralRules('en-US', { type: 'ordinal' }).select(rk.pos);
    suffix = { one: 'st', two: 'nd', few: 'rd', other: 'th' }[pr];
  }
  const rank = rk ? t('summary.rank', { pos: rk.pos, suffix, month: monthName, of: rk.of }) : '';
  if (row.anomalyPct != null) return { main: fmtPct(row.anomalyPct), sub: rank };
  if (row.anomalyAbs != null) return { main: `${row.anomalyAbs > 0 ? '+' : ''}${fmtV(row.anomalyAbs)}`, sub: `${t('summary.anomalyNone')} · ${rank}` };
  return { main: '—', sub: t('summary.anomalyNone') };
});
</script>

<template>
  <section class="card ss" aria-labelledby="ss-title" :aria-busy="results.loading">
    <header class="ss__head">
      <h2 id="ss-title" class="ss__title">{{ t('summary.title') }}</h2>
      <span class="ss__scope muted">{{ header }}</span>
      <button v-if="sel" type="button" class="btn btn--sm btn--ghost" @click="clearSelection">{{ t('summary.clear') }}</button>
    </header>
    <p v-if="belowScale" class="ss__warn" role="note">{{ t('summary.belowScale') }}</p>

    <div class="ss__grid" aria-live="polite">
      <!-- A -->
      <div class="ss__card ss__card--a">
        <span class="ss__lbl">A · {{ fmtPeriod(analysis.periodA) }}</span>
        <template v-if="results.loading"><span class="skeleton ss__sk"></span><span class="skeleton ss__sk ss__sk--s"></span></template>
        <template v-else>
          <b class="ss__val">{{ fmtV(results.A?.value) }}</b>
          <span class="ss__sub">{{ t('summary.unit') }}</span>
          <span class="ss__sub">{{ intervalText(results.A) }}</span>
        </template>
      </div>
      <!-- B -->
      <div v-if="analysis.compare" class="ss__card ss__card--b">
        <span class="ss__lbl">B · {{ fmtPeriod(analysis.periodB) }}</span>
        <template v-if="results.loading"><span class="skeleton ss__sk"></span><span class="skeleton ss__sk ss__sk--s"></span></template>
        <template v-else>
          <b class="ss__val">{{ fmtV(results.B?.value) }}</b>
          <span class="ss__sub">{{ t('summary.unit') }}</span>
          <span class="ss__sub">{{ intervalText(results.B) }}</span>
        </template>
      </div>
      <!-- A − B -->
      <div v-if="analysis.compare" class="ss__card" :class="{ 'ss__card--warn': diffWarn }">
        <span class="ss__lbl">{{ t('summary.diffTitle') }}</span>
        <template v-if="results.loading"><span class="skeleton ss__sk"></span></template>
        <template v-else>
          <b class="ss__val" :class="{ 'ss__val--text': diff?.kind === 'inconclusive' }">{{ diffMain }}</b>
          <span class="ss__sub">{{ diffSub }}</span>
        </template>
      </div>
      <!-- Anomalía -->
      <div class="ss__card">
        <span class="ss__lbl">{{ sel ? t('summary.anomalyZone') : t('summary.anomaly') }}</span>
        <b class="ss__val">{{ anomaly.main }}</b>
        <span class="ss__sub">{{ anomaly.sub }}</span>
      </div>
      <!-- Origen -->
      <div class="ss__card">
        <span class="ss__lbl">{{ t('summary.origin') }}</span>
        <template v-if="results.loading"><span class="skeleton ss__sk"></span></template>
        <template v-else>
          <b class="ss__val ss__val--text">{{ originText(results.A) }}</b>
          <span class="ss__sub">
            {{ results.A?.estimated ? t('summary.estimated') : t('summary.observed') }} ·
            {{ t('summary.coverage', { pct: nf(0).format((results.A?.coverage ?? 1) * 100) }) }}
          </span>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ss { padding: 14px 16px 16px; }
.ss__head { display: flex; align-items: center; gap: 8px 14px; flex-wrap: wrap; margin-bottom: 12px; }
.ss__title { font-size: 1.05rem; font-weight: 500; letter-spacing: 0; }
.ss__scope { margin-left: auto; font-size: 0.86rem; }
.ss__warn { margin: 0 0 12px; font-size: 0.85rem; color: var(--warn); background: var(--warn-bg); border-radius: var(--radius-s); padding: 8px 12px; }
.ss__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
.ss__card { background: var(--surface-2); border-radius: var(--radius-s); padding: 12px 14px; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ss__card--a { box-shadow: inset 3px 0 0 var(--period-a); }
.ss__card--b { box-shadow: inset 3px 0 0 var(--period-b-mark); }
.ss__card--warn { background: var(--warn-bg); color: var(--warn); }
.ss__card--warn .ss__lbl, .ss__card--warn .ss__sub { color: var(--warn); }
.ss__lbl { font-size: 0.8rem; color: var(--muted); }
.ss__card--a .ss__lbl { color: var(--period-a); }
.ss__card--b .ss__lbl { color: var(--period-b); }
.ss__val { font-size: 1.55rem; font-weight: 400; line-height: 1.15; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
.ss__val--text { font-size: 1.05rem; font-weight: 500; line-height: 1.3; }
.ss__sub { font-size: 0.78rem; color: var(--muted); line-height: 1.35; }
.ss__sk { height: 26px; width: 70%; margin-top: 4px; }
.ss__sk--s { height: 12px; width: 50%; }
@media (max-width: 640px) { .ss__scope { margin-left: 0; width: 100%; } }
</style>
