<script setup>
/**
 * Comparar años (boceto, zona 8): una línea por año (A en azul, B en naranja, hasta 6 más en grises),
 * mediana histórica punteada y banda p05–p95 del año de A. Clic en un punto fija A; Mayús + clic, B.
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useChart } from './useChart.js';
import { analysis, setPeriod, setCompare } from '@/stores/analysis.js';
import { intlLocale } from '@/stores/ui.js';

const props = defineProps({ rows: { type: Array, required: true } });
const { t } = useI18n();
const el = ref(null);
const extra = ref([]);

const allYears = computed(() => [...new Set(props.rows.map((r) => r.year))]);
const yearA = computed(() => Number(analysis.periodA.to?.slice(0, 4)));
const yearB = computed(() => (analysis.compare ? Number(analysis.periodB.to?.slice(0, 4)) : null));
const byYear = computed(() => {
  const m = new Map();
  for (const r of props.rows) {
    if (!m.has(r.year)) m.set(r.year, new Array(12).fill(null));
    m.get(r.year)[r.month - 1] = r;
  }
  return m;
});
// Mediana histórica por mes calendario (la columna median de calendar.json)
const median = computed(() => {
  const out = new Array(12).fill(null);
  for (const r of props.rows) if (r.median != null) out[r.month - 1] = r.median;
  return out;
});
const available = computed(() => allYears.value.filter((y) => y !== yearA.value && y !== yearB.value && !extra.value.includes(y)).reverse());
const addPick = ref('');
function addYear() {
  const y = Number(addPick.value);
  if (y && extra.value.length < 6) extra.value = [...extra.value, y];
  addPick.value = '';
}
function removeYear(y) { extra.value = extra.value.filter((x) => x !== y); }

const monthNames = computed(() => {
  const f = new Intl.DateTimeFormat(intlLocale(), { month: 'short', timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, i) => f.format(new Date(Date.UTC(2020, i, 1))));
});
const nf = (d = 0) => new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: d });
const GREYS = ['#8a8f98', '#a7792f', '#5f8f7a', '#9a6f9a', '#6f8fb0', '#b07a6f'];

useChart(el, (c) => {
  const vals = (y) => (byYear.value.get(y) ?? []).map((r) => (r ? r.value : null));
  const series = [];
  const a = byYear.value.get(yearA.value) ?? [];
  // Banda p05–p95 del año de A: base invisible + ancho apilado
  series.push({ name: 'p05', type: 'line', data: a.map((r) => r?.p05 ?? null), stack: 'band', symbol: 'none', lineStyle: { opacity: 0 }, silent: true, z: 1 });
  series.push({ name: t('charts.years.band', { year: yearA.value }), type: 'line', data: a.map((r) => (r?.p05 != null && r?.p95 != null ? r.p95 - r.p05 : null)),
    stack: 'band', symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color: c.a, opacity: 0.18 }, silent: true, z: 1 });
  series.push({ name: t('charts.years.median'), type: 'line', data: median.value, symbol: 'none', lineStyle: { type: 'dashed', width: 1.3, color: c.muted }, z: 2 });
  extra.value.forEach((y, i) => series.push({ name: String(y), type: 'line', data: vals(y), symbolSize: 5, lineStyle: { width: 1.4, color: GREYS[i % GREYS.length] }, itemStyle: { color: GREYS[i % GREYS.length] }, z: 3 }));
  if (yearB.value) series.push({ name: String(yearB.value), type: 'line', data: vals(yearB.value), symbolSize: 6, lineStyle: { width: 2.2, color: c.b }, itemStyle: { color: c.b }, z: 4 });
  series.push({ name: String(yearA.value), type: 'line', data: vals(yearA.value), symbolSize: 6, lineStyle: { width: 2.4, color: c.a }, itemStyle: { color: c.a }, z: 5 });
  return {
    animation: false,
    textStyle: { fontFamily: c.font, color: c.ink2 },
    grid: { left: 8, right: 12, top: 12, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis', backgroundColor: c.surface, borderColor: c.lineStrong, textStyle: { color: c.ink, fontSize: 12 },
      valueFormatter: (v) => (v == null ? '—' : nf(0).format(v)),
      formatter: (ps) => {
        const shown = ps.filter((p) => p.seriesName !== 'p05' && !String(p.seriesName).startsWith('p05–'));
        return `<b>${ps[0]?.axisValueLabel ?? ''}</b><br>${shown.map((p) => `${p.marker}${p.seriesName}: ${p.value == null ? '—' : nf(0).format(p.value)}`).join('<br>')}`;
      },
    },
    xAxis: { type: 'category', data: monthNames.value, boundaryGap: false, axisLine: { lineStyle: { color: c.lineStrong } }, axisTick: { show: false }, axisLabel: { color: c.muted } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: c.line } }, axisLabel: { color: c.muted, formatter: (v) => nf(0).format(v) } },
    series,
  };
}, () => [yearA.value, yearB.value, extra.value, props.rows], {
  onClick: (p) => {
    const y = Number(p.seriesName);
    if (!y || p.dataIndex == null) return;
    const k = `${y}-${String(p.dataIndex + 1).padStart(2, '0')}`;
    if (p.event?.event?.shiftKey) { setPeriod('B', k, k); setCompare(true); } else setPeriod('A', k, k);
  },
});

const tableYears = computed(() => [yearA.value, ...(yearB.value ? [yearB.value] : []), ...extra.value]);
</script>

<template>
  <section class="card yc" aria-labelledby="yc-title">
    <header class="chart-head">
      <h2 id="yc-title" class="chart-title">{{ t('charts.years.title') }}</h2>
      <label class="visually-hidden" for="yc-add">{{ t('charts.years.add') }}</label>
      <select id="yc-add" v-model="addPick" class="yc__add" :disabled="extra.length >= 6" :title="t('charts.years.max')" @change="addYear">
        <option value="">+ {{ t('charts.years.add') }}</option>
        <option v-for="y in available" :key="y" :value="y">{{ y }}</option>
      </select>
    </header>
    <div ref="el" class="chart-canvas" role="img" :aria-label="t('charts.years.aria')"></div>
    <div class="chart-keys muted">
      <span class="yc__a">━ {{ yearA }}</span>
      <span v-if="yearB" class="yc__b">━ {{ yearB }}</span>
      <span>┄ {{ t('charts.years.median') }}</span>
      <span>▒ {{ t('charts.years.band', { year: yearA }) }}</span>
      <button v-for="y in extra" :key="y" type="button" class="chip yc__chip" :aria-label="t('charts.years.remove', { year: y })" @click="removeYear(y)">{{ y }} ×</button>
    </div>
    <p class="chart-note">{{ t('charts.years.hint') }}</p>
    <details class="chart-table">
      <summary>{{ t('charts.table') }}</summary>
      <div class="chart-table__scroll">
        <table>
          <thead><tr><th scope="col">{{ t('charts.month') }}</th><th v-for="y in tableYears" :key="y" scope="col">{{ y }}</th><th scope="col">{{ t('charts.years.median') }}</th></tr></thead>
          <tbody>
            <tr v-for="(mn, i) in monthNames" :key="i">
              <th scope="row">{{ mn }}</th>
              <td v-for="y in tableYears" :key="y">{{ byYear.get(y)?.[i] ? nf(0).format(byYear.get(y)[i].value) : '—' }}</td>
              <td>{{ median[i] == null ? '—' : nf(0).format(median[i]) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </section>
</template>

<style scoped>
.yc { padding: 14px 16px 16px; min-width: 0; }
.yc__add { min-height: 34px; border: 1px solid var(--line-strong); border-radius: var(--radius-pill); background: var(--surface); padding: 0 10px; font-size: 0.8rem; }
.yc__a { color: var(--period-a); }
.yc__b { color: var(--period-b); }
.yc__chip { min-height: 28px; cursor: pointer; }
.yc__chip:hover { border-color: var(--ink); }
</style>
