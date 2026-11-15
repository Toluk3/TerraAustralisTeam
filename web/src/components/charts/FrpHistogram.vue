<script setup>
/**
 * Intensidad (FRP), boceto zona 9. Eje Y = porcentaje de las detecciones de cada familia de sensor, nunca
 * cantidad: los focos no se cuentan ni se comparan entre sensores. Solo con una selección.
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useChart } from './useChart.js';
import { analysis } from '@/stores/analysis.js';
import { results } from '@/features/useSummaries.js';
import { FRP_EDGES } from '@/features/summaryLoader.js';
import { intlLocale } from '@/stores/ui.js';

const { t } = useI18n();
const el = ref(null);
const nf = (d = 0) => new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: d });
const labels = computed(() => FRP_EDGES.slice(0, -1).map((a, i) => (FRP_EDGES[i + 1] === Infinity ? `≥ ${nf().format(a)}` : `${nf().format(a)}–${nf().format(FRP_EDGES[i + 1])}`)));

const pctOf = (arr) => {
  const total = arr.reduce((s, v) => s + v, 0);
  return total ? arr.map((v) => (v / total) * 100) : null;
};
/** Series presentes: período × familia, solo las que tienen detecciones. */
const sets = computed(() => {
  const out = [];
  const add = (p, h) => {
    if (!h) return;
    for (const fam of ['MODIS', 'VIIRS']) {
      const pct = pctOf(h[fam]);
      if (pct) out.push({ p, fam, pct, n: h[fam].reduce((s, v) => s + v, 0) });
    }
  };
  add('A', results.frpA);
  if (analysis.compare) add('B', results.frpB);
  return out;
});
const state = computed(() => {
  if (!analysis.selection) return 'empty';
  if (results.loading) return 'loading';
  return sets.value.length ? 'data' : 'none';
});

useChart(el, (c) => {
  if (state.value !== 'data') return null;
  const color = (s) => (s.p === 'A' ? c.a : c.b);
  return {
    animation: false,
    textStyle: { fontFamily: c.font, color: c.ink2 },
    grid: { left: 8, right: 12, top: 16, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: c.surface, borderColor: c.lineStrong, textStyle: { color: c.ink, fontSize: 12 },
      valueFormatter: (v) => `${nf(1).format(v)} %`,
    },
    xAxis: { type: 'category', data: labels.value, name: t('charts.frp.axisX'), nameLocation: 'middle', nameGap: 28, nameTextStyle: { color: c.muted },
      axisLabel: { color: c.muted, fontSize: 10, interval: 0, rotate: 30 }, axisTick: { show: false }, axisLine: { lineStyle: { color: c.lineStrong } } },
    yAxis: { type: 'value', name: t('charts.frp.axisY'), nameTextStyle: { color: c.muted, align: 'left' }, max: (v) => Math.min(100, Math.ceil(v.max / 10) * 10),
      splitLine: { lineStyle: { color: c.line } }, axisLabel: { color: c.muted, formatter: (v) => `${v} %` } },
    series: sets.value.map((s) => ({
      name: `${s.p} · ${s.fam}`, type: 'bar', data: s.pct, barGap: '8%',
      itemStyle: { color: color(s), opacity: s.fam === 'MODIS' ? 0.95 : 0.55, borderRadius: [2, 2, 0, 0] },
    })),
  };
}, () => [state.value, sets.value]);
</script>

<template>
  <section class="card frp chart-fill" aria-labelledby="frp-title">
    <header class="chart-head"><h2 id="frp-title" class="chart-title">{{ t('charts.frp.title') }}</h2></header>
    <div v-show="state === 'data'" ref="el" class="chart-canvas" role="img" :aria-label="t('charts.frp.aria')"></div>
    <p v-if="state === 'empty'" class="chart-empty">{{ t('charts.frp.empty') }}</p>
    <p v-else-if="state === 'loading'" class="chart-empty">{{ t('charts.frp.loading') }}</p>
    <p v-else-if="state === 'none'" class="chart-empty">{{ t('charts.frp.none') }}</p>
    <div v-if="state === 'data'" class="chart-keys muted">
      <span v-for="s in sets" :key="s.p + s.fam" :class="`frp__k frp__k--${s.p}`"><i :class="{ 'is-light': s.fam === 'VIIRS' }"></i>{{ s.p }} · {{ s.fam }}</span>
    </div>
    <p class="chart-note">{{ t('charts.frp.note') }}</p>
    <details v-if="state === 'data'" class="chart-table">
      <summary>{{ t('charts.table') }}</summary>
      <div class="chart-table__scroll">
        <table>
          <thead><tr><th scope="col">{{ t('charts.frp.axisX') }}</th><th v-for="s in sets" :key="s.p + s.fam" scope="col">{{ s.p }} · {{ s.fam }} (%)</th></tr></thead>
          <tbody>
            <tr v-for="(l, i) in labels" :key="l"><th scope="row">{{ l }}</th><td v-for="s in sets" :key="s.p + s.fam">{{ nf(1).format(s.pct[i]) }}</td></tr>
          </tbody>
        </table>
      </div>
    </details>
  </section>
</template>

<style scoped>
.frp { padding: 14px 16px 16px; min-width: 0; }
.frp .chart-canvas { min-height: 240px; }
.frp__k i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; background: currentColor; }
.frp__k i.is-light { opacity: 0.55; }
.frp__k--A { color: var(--period-a); }
.frp__k--B { color: var(--period-b); }
</style>
