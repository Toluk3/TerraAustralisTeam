<script setup>
/**
 * Gráficos de la ventana de la selección (los del panel original del módulo, en Vue):
 *   1. Fuego por mes: focos equivalentes de la selección con su intervalo p05–p95. Es la serie citable.
 *   2. Qué detectó cada satélite: detecciones crudas de MODIS y de VIIRS, que explican por qué hace falta
 *      una escala común.
 * Muestran el período A y, si es corto, los meses anteriores hasta completar un año (el período queda
 * resaltado). Con más de 24 meses se agrupa por año. Al pasar el mouse se leen los valores.
 */
import { computed, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { createSummarizer } from '@/features/summaryLoader.js';
import { groupByYear } from '@/features/fire-map/summary.js';
import { chartAxis, chartMonths, viirsStart } from '@/features/selectionDetail.js';
import { intlLocale } from '@/stores/ui.js';

const props = defineProps({
  selection: { type: Object, required: true },
  dataset: { type: Object, required: true },
  /** Período A: { from, to } */
  period: { type: Object, required: true },
});
const { t, locale } = useI18n();

const rows = shallowRef([]);
const state = ref('loading'); // loading | data | error
let summarizer = null;
let token = 0;

async function compute() {
  const my = ++token;
  const months = chartMonths(props.period, props.dataset.meta.coverage?.from?.slice(0, 7));
  if (!months.length) { rows.value = []; state.value = 'data'; return; }
  state.value = 'loading';
  try {
    summarizer ??= createSummarizer(props.dataset.source, props.dataset.meta);
    const { summary } = await summarizer.run(props.selection, months);
    if (my !== token) return;
    rows.value = summary.rows;
    state.value = 'data';
  } catch {
    if (my === token) state.value = 'error';
  }
}
// La selección se vuelve a emitir con cada período: se compara por sus celdas, no por el objeto
watch(() => [props.selection.cells, props.period.from, props.period.to, props.dataset], compute, { immediate: true });

const nf = (d = 0) => { locale.value; return new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: d }); };
const fmt = (v, d = 0) => (v == null || Number.isNaN(v) ? '—' : nf(d).format(v));
const fmtV = (v) => (v == null ? '—' : nf(v < 10 ? 1 : 0).format(v));
const fmtTick = (v) => (v >= 1e6 ? `${fmt(v / 1e6, 1)} M` : v >= 10000 ? `${fmt(v / 1000)} k` : fmt(v, v < 10 ? 1 : 0));
const fmtMonth = (k) => { locale.value; return new Intl.DateTimeFormat(intlLocale(), { month: 'short', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, 1))); };
const hasBand = (b) => b.lo != null && b.hi != null && b.hi - b.lo >= 0.05;

const byYear = computed(() => rows.value.length > 24);
const bins = computed(() => (byYear.value ? groupByYear(rows.value) : rows.value.map((r) => ({ ...r, from: r.month, to: r.month }))));
const label = (b) => (byYear.value ? (b.months < 12 ? t('selwin.charts.partialYear', { year: b.year, n: b.months }) : b.year) : fmtMonth(b.month));
const inPeriod = (b) => b.to >= props.period.from && b.from <= (props.period.to ?? props.period.from);

// 1. Focos equivalentes
const a1 = computed(() => chartAxis(Math.max(0, ...bins.value.map((b) => Math.max(b.nEquiv, b.hi ?? 0)))));
const y1 = (v) => 100 - (v / a1.value.top) * 100;
const eqLines = computed(() => bins.value.map((b, i) => ({
  cls: b.origin === 'modis' ? 'obs' : 'conv',
  points: `${i},${y1(bins.value[Math.max(0, i - 1)].nEquiv)} ${i},${y1(b.nEquiv)} ${i + 1},${y1(b.nEquiv)}`,
})));
const peak = computed(() => bins.value.reduce((best, b) => (b.nEquiv > (best?.nEquiv ?? 0) ? b : best), null));
const withFire = computed(() => bins.value.filter((b) => b.nEquiv > 0).length);
const keys1 = computed(() => {
  const k = ['obs'];
  if (bins.value.some((b) => b.origin !== 'modis')) k.push('conv');
  if (bins.value.some(hasBand)) k.push('band');
  if (bins.value.some((b) => b.coverage < 1)) k.push('partial');
  return k;
});

// 2. Detecciones por sensor
const a2 = computed(() => chartAxis(Math.max(0, ...bins.value.map((b) => Math.max(b.detModis, b.detViirs)))));
const y2 = (v) => 100 - (v / a2.value.top) * 100;
const step = (key) => bins.value.map((b, i) => `${i},${y2(b[key])} ${i + 1},${y2(b[key])}`).join(' ');
const sensors = computed(() => {
  const vs = viirsStart(props.dataset.meta);
  const both = rows.value.filter((r) => vs && r.month >= vs);
  const sm = both.reduce((x, r) => x + r.detModis, 0), sv = both.reduce((x, r) => x + r.detViirs, 0);
  if (sm > 0 && sv > 0) return t('selwin.charts.ratio', { x: fmt(sv / sm, 1) });
  if (!both.length && vs) return t('selwin.charts.onlyModis', { since: fmtMonth(vs) });
  return t('selwin.charts.noCompare');
});

// Marcas del eje horizontal
const xMarks = computed(() => {
  const n = bins.value.length;
  if (!n) return [];
  let marks;
  if (byYear.value) marks = bins.value.map((b, i) => [i, b.year]);
  else marks = [...new Set([0, Math.floor((n - 1) / 2), n - 1])].map((i) => [i, fmtMonth(bins.value[i].month)]);
  const every = Math.ceil(marks.length / 6);
  return marks.filter((_, k) => k % every === 0).map(([i, text]) => ({ left: `${((i + 0.5) / n) * 100}%`, text }));
});

// Lectura al pasar el mouse
const hover = ref(-1);
function onMove(ev) {
  const r = ev.currentTarget.getBoundingClientRect();
  hover.value = Math.min(bins.value.length - 1, Math.max(0, Math.floor(((ev.clientX - r.left) / r.width) * bins.value.length)));
}
const cur = computed(() => bins.value[hover.value] ?? null);
const cursorStyle = computed(() => ({ left: `${(hover.value / bins.value.length) * 100}%`, width: `${100 / bins.value.length}%` }));
</script>

<template>
  <div class="sc" :aria-busy="state === 'loading'">
    <p v-if="state === 'error'" class="sc__cap">{{ t('selwin.charts.error') }}</p>
    <p v-else-if="!bins.length" class="sc__cap">{{ t('summary.loading') }}</p>
    <template v-else>
      <div class="sc__head"><b>{{ byYear ? t('selwin.charts.fireByYear') : t('selwin.charts.fireByMonth') }}</b><span>{{ t('summary.unit') }}</span></div>
      <p class="sc__cap">
        {{ peak ? t(byYear ? 'selwin.charts.peakYears' : 'selwin.charts.peak', { when: label(peak), v: fmtV(peak.nEquiv), n: withFire, of: bins.length }) : t('selwin.charts.noFire') }}
      </p>
      <div class="sc__plot" style="height: 96px" @pointermove="onMove" @pointerleave="hover = -1">
        <div v-for="v in a1.ticks" :key="v" class="sc__grid" :style="{ bottom: `${(v / a1.top) * 100}%` }"><span>{{ fmtTick(v) }}</span></div>
        <svg :viewBox="`0 0 ${bins.length} 100`" preserveAspectRatio="none" aria-hidden="true">
          <template v-for="(b, i) in bins" :key="i">
            <rect v-if="inPeriod(b)" :x="i" y="0" width="1" height="100" class="sc__sel" />
            <rect v-if="b.coverage < 1" :x="i" y="0" width="1" height="100" class="sc__partial" />
            <rect v-if="hasBand(b)" :x="i" :y="y1(b.hi)" width="1" :height="y1(b.lo) - y1(b.hi)" class="sc__band" />
          </template>
          <polyline v-for="(l, i) in eqLines" :key="`l${i}`" class="sc__line" :class="`sc__line--${l.cls}`" :points="l.points" />
        </svg>
        <div v-if="cur" class="sc__cursor" :style="cursorStyle"></div>
      </div>
      <div class="sc__x"><span v-for="m in xMarks" :key="m.left" :style="{ left: m.left }">{{ m.text }}</span></div>
      <div class="sc__keys">
        <span v-for="k in keys1" :key="k"><i :class="`sc__k sc__k--${k}`"></i>{{ t(`selwin.charts.keys.${k}`) }}</span>
        <span><i class="sc__k sc__k--sel"></i>{{ t('selwin.charts.keys.period') }}</span>
      </div>

      <div class="sc__head sc__head--2"><b>{{ t('selwin.charts.sensors') }}</b><span>{{ t('selwin.charts.rawDet') }}</span></div>
      <p class="sc__cap">{{ sensors }}</p>
      <div class="sc__plot" style="height: 56px" @pointermove="onMove" @pointerleave="hover = -1">
        <div v-for="v in a2.ticks" :key="v" class="sc__grid" :style="{ bottom: `${(v / a2.top) * 100}%` }"><span>{{ fmtTick(v) }}</span></div>
        <svg :viewBox="`0 0 ${bins.length} 100`" preserveAspectRatio="none" aria-hidden="true">
          <polyline class="sc__line sc__line--viirs" :points="step('detViirs')" />
          <polyline class="sc__line sc__line--modis" :points="step('detModis')" />
        </svg>
        <div v-if="cur" class="sc__cursor" :style="cursorStyle"></div>
      </div>
      <div class="sc__x"><span v-for="m in xMarks" :key="m.left" :style="{ left: m.left }">{{ m.text }}</span></div>
      <div class="sc__keys">
        <span><i class="sc__k sc__k--modis"></i>MODIS</span><span><i class="sc__k sc__k--viirs"></i>VIIRS</span>
      </div>

      <div class="sc__read" aria-live="polite">
        <template v-if="cur">
          <b>{{ label(cur) }}</b>
          <span><i class="sc__k sc__k--obs"></i>{{ fmtV(cur.nEquiv) }} {{ t('selwin.charts.eqShort') }}<template v-if="hasBand(cur)"> ({{ fmtV(cur.lo) }}–{{ fmtV(cur.hi) }})</template></span>
          <span><i class="sc__k sc__k--modis"></i>MODIS {{ fmt(cur.detModis) }}</span>
          <span><i class="sc__k sc__k--viirs"></i>VIIRS {{ fmt(cur.detViirs) }}</span>
        </template>
        <template v-else>{{ t('selwin.charts.hint') }}</template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sc { margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(0, 0, 0, 0.08); }
.sc__head { display: flex; align-items: baseline; gap: 6px; }
.sc__head--2 { margin-top: 10px; }
.sc__head span { color: #5f6166; font-size: 0.7rem; }
.sc__cap { margin: 2px 0 6px; color: #5f6166; font-size: 0.72rem; }
.sc__plot { position: relative; margin-left: 34px; border-bottom: 1px solid rgba(0, 0, 0, 0.4); touch-action: none; }
.sc__plot svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.sc__plot rect { shape-rendering: crispEdges; }
.sc__grid { position: absolute; left: 0; right: 0; height: 0; border-top: 1px dashed rgba(0, 0, 0, 0.14); pointer-events: none; }
.sc__grid span { position: absolute; right: 100%; margin-right: 4px; transform: translateY(-50%); color: #5f6166; font-size: 0.62rem; white-space: nowrap; }
.sc__cursor { position: absolute; top: 0; bottom: 0; background: rgba(0, 0, 0, 0.1); pointer-events: none; }
.sc__x { position: relative; height: 14px; margin-left: 34px; color: #5f6166; font-size: 0.62rem; }
.sc__x span { position: absolute; top: 2px; transform: translateX(-50%); white-space: nowrap; }
.sc__x span:first-child { transform: translateX(-20%); }
.sc__x span:last-child:not(:first-child) { transform: translateX(-80%); }
.sc__line { fill: none; stroke-width: 2; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.sc__line--obs { stroke: #2e9d32; }
.sc__line--conv { stroke: #1565c0; }
.sc__line--modis { stroke: #c76a00; }
.sc__line--viirs { stroke: #1d7fb8; }
.sc__band { fill: #000; opacity: 0.14; }
.sc__partial { fill: #d9480f; opacity: 0.1; }
.sc__sel { fill: #1d5fd1; opacity: 0.12; }
.sc__keys { display: flex; flex-wrap: wrap; gap: 2px 10px; color: #5f6166; font-size: 0.68rem; margin-top: 2px; }
.sc__k { display: inline-block; width: 12px; height: 3px; margin-right: 4px; vertical-align: 3px; border-radius: 1px; }
.sc__k--obs { background: #2e9d32; }
.sc__k--conv { background: #1565c0; }
.sc__k--modis { background: #c76a00; }
.sc__k--viirs { background: #1d7fb8; }
.sc__k--band, .sc__k--partial, .sc__k--sel { width: 9px; height: 9px; vertical-align: -1px; }
.sc__k--band { background: rgba(0, 0, 0, 0.2); }
.sc__k--partial { background: rgba(217, 72, 15, 0.22); }
.sc__k--sel { background: rgba(29, 95, 209, 0.25); }
.sc__read {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; min-height: 32px; margin-top: 6px; padding: 4px 7px;
  border-radius: 6px; background: #f4f4f1; color: #5f6166; font-size: 0.72rem;
}
.sc__read b, .sc__read span { color: #1d1e20; white-space: nowrap; }
</style>
