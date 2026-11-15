<script setup>
/**
 * Calendario de quema (boceto, zona 7): grilla HTML años × meses (role=grid), mismo color que las celdas del
 * mapa. Clic fija A; Mayús + clic fija B y enciende Comparar. Flechas para moverse; Enter/Espacio elige.
 */
import { computed, nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { CELLS, PUOR, ramp, logScale, anomalyT, css } from '@/features/fire-map/colors.js';
import { analysis, setPeriod, setCompare } from '@/stores/analysis.js';
import { intlLocale } from '@/stores/ui.js';
import { quantile } from '@/features/fire-map/summary.js';

const props = defineProps({
  rows: { type: Array, required: true },
  meta: { type: Object, required: true },
});
const { t } = useI18n();
const mode = ref('value');

const byKey = computed(() => new Map(props.rows.map((r) => [r.key, r])));
const years = computed(() => [...new Set(props.rows.map((r) => r.year))]);
// Escala log entre p02 y p98 de los meses con fuego: los totales de zona van de miles a cientos de miles,
// y log1p(v)/log1p(p98) los dejaba a todos en el extremo rojo de la rampa
const positives = computed(() => props.rows.map((r) => r.value).filter((v) => v > 0).sort((a, b) => a - b));
const p98 = computed(() => quantile(positives.value, 0.98) || 1);
const p02 = computed(() => quantile(positives.value, 0.02) || 0);
const scale = (v) => {
  const lo = Math.log1p(p02.value), hi = Math.log1p(p98.value);
  return hi > lo ? (Math.log1p(v) - lo) / (hi - lo) : logScale(v, p98.value);
};
const switchYear = computed(() => Number(props.meta.switch_date?.slice(0, 4)));
const monthNames = computed(() => {
  const f = new Intl.DateTimeFormat(intlLocale(), { month: 'narrow', timeZone: 'UTC' });
  const l = new Intl.DateTimeFormat(intlLocale(), { month: 'long', timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, i) => ({ short: f.format(new Date(Date.UTC(2020, i, 1))), long: l.format(new Date(Date.UTC(2020, i, 1))) }));
});
const key = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const nf = (d) => new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: d });
const fmtV = (v) => (v == null ? '—' : nf(v < 10 ? 1 : 0).format(v));
const fmtMonth = (k) => new Intl.DateTimeFormat(intlLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, 1)));

function color(r) {
  if (!r) return 'transparent';
  if (mode.value === 'anomaly') {
    const tt = anomalyT(r.anomalyPct);
    return tt == null ? '#a0a0a0' : css(ramp(PUOR, tt));
  }
  return r.value > 0 ? css(ramp(CELLS, Math.max(0.02, scale(r.value)))) : 'var(--surface-2)';
}
const inA = (k) => analysis.periodA.from && k >= analysis.periodA.from && k <= analysis.periodA.to;
const inB = (k) => analysis.compare && analysis.periodB.from && k >= analysis.periodB.from && k <= analysis.periodB.to;

function describe(r) {
  if (!r) return '';
  const parts = [t('charts.calendar.cell', { month: fmtMonth(r.key), value: fmtV(r.value) })];
  if (r.p05 != null && r.p95 != null && r.p95 - r.p05 > 0.5) parts.push(t('charts.calendar.cellInterval', { lo: fmtV(r.p05), hi: fmtV(r.p95) }));
  if (r.anomalyPct != null) parts.push(t('charts.calendar.cellAnomaly', { pct: `${r.anomalyPct > 0 ? '+' : ''}${nf(0).format(r.anomalyPct * 100)} %` }));
  parts.push(r.key >= (props.meta.switch_date ?? '9999').slice(0, 7) ? t('charts.calendar.statusEstimated') : t('charts.calendar.statusObserved'));
  if (r.coverage < 1) parts.push(`${t('charts.calendar.reduced')} (${nf(0).format(r.coverage * 100)} %)`);
  return parts.join(' · ');
}

// --- Interacción ---
const hover = ref(null);
const focusKey = ref(null);
function pick(r, shift) {
  if (!r) return;
  if (shift) { setPeriod('B', r.key, r.key); setCompare(true); }
  else setPeriod('A', r.key, r.key);
}
const grid = ref(null);
const activeKey = computed(() => focusKey.value ?? analysis.periodA.to ?? props.rows.at(-1)?.key);
function onKey(e, y, m) {
  const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
  if (d) {
    e.preventDefault();
    let yi = years.value.indexOf(y) + d[0], mi = m + d[1];
    if (mi < 1) { mi = 12; yi -= 1; } else if (mi > 12) { mi = 1; yi += 1; }
    if (yi < 0 || yi >= years.value.length) return;
    const k = key(years.value[yi], mi);
    if (!byKey.value.has(k)) return;
    focusKey.value = k;
    hover.value = byKey.value.get(k);
    nextTick(() => grid.value?.querySelector(`[data-k="${k}"]`)?.focus());
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    pick(byKey.value.get(key(y, m)), e.shiftKey);
  }
}
const readout = computed(() => (hover.value ? describe(hover.value) : t('charts.calendar.hint')));
</script>

<template>
  <section class="card bc" aria-labelledby="bc-title">
    <header class="chart-head">
      <h2 id="bc-title" class="chart-title">{{ t('charts.calendar.title') }}</h2>
      <div class="seg chart-seg" role="group" :aria-label="t('charts.calendar.title')">
        <button type="button" :aria-pressed="mode === 'value'" @click="mode = 'value'">{{ t('charts.calendar.value') }}</button>
        <button type="button" :aria-pressed="mode === 'anomaly'" @click="mode = 'anomaly'">{{ t('charts.calendar.anomaly') }}</button>
      </div>
    </header>
    <div ref="grid" class="bc__grid" role="grid" :aria-label="t('charts.calendar.aria')" @mouseleave="hover = null">
      <div class="bc__row bc__row--head" role="row">
        <span class="bc__year" role="columnheader"><span class="visually-hidden">{{ t('charts.calendar.year') }}</span></span>
        <span v-for="(mn, i) in monthNames" :key="i" class="bc__mh" role="columnheader" :aria-label="mn.long">{{ mn.short }}</span>
      </div>
      <div v-for="y in years" :key="y" class="bc__row" :class="{ 'bc__row--switch': y === switchYear }" role="row">
        <span class="bc__year" role="rowheader">{{ y }}</span>
        <template v-for="m in 12" :key="m">
          <span v-if="!byKey.has(key(y, m))" class="bc__cell bc__cell--empty" role="gridcell" aria-disabled="true"></span>
          <span v-else class="bc__cell" role="gridcell" :data-k="key(y, m)"
            :tabindex="activeKey === key(y, m) ? 0 : -1"
            :aria-label="describe(byKey.get(key(y, m)))" :aria-selected="inA(key(y, m)) || inB(key(y, m))"
            :class="{ 'is-a': inA(key(y, m)), 'is-b': inB(key(y, m)), 'is-reduced': byKey.get(key(y, m)).coverage < 1 }"
            :style="{ background: color(byKey.get(key(y, m))) }"
            @click="pick(byKey.get(key(y, m)), $event.shiftKey)" @mouseenter="hover = byKey.get(key(y, m))"
            @focus="hover = byKey.get(key(y, m)); focusKey = key(y, m)" @keydown="onKey($event, y, m)"></span>
        </template>
      </div>
    </div>
    <p class="bc__readout" aria-live="polite">{{ readout }}</p>
    <div class="chart-keys muted">
      <span><i class="bc__k bc__k--reduced"></i>{{ t('charts.calendar.reduced') }}</span>
      <span><i class="bc__k bc__k--est"></i>{{ t('charts.calendar.estimated', { year: switchYear }) }}</span>
      <span class="bc__key-a"><i class="bc__k bc__k--a"></i>A</span>
      <span v-if="analysis.compare" class="bc__key-b"><i class="bc__k bc__k--b"></i>B</span>
    </div>
    <details class="chart-table">
      <summary>{{ t('charts.table') }}</summary>
      <div class="chart-table__scroll">
        <table>
          <thead><tr><th scope="col">{{ t('charts.calendar.year') }}</th><th v-for="(mn, i) in monthNames" :key="i" scope="col">{{ mn.long }}</th></tr></thead>
          <tbody>
            <tr v-for="y in years" :key="y">
              <th scope="row">{{ y }}</th>
              <td v-for="m in 12" :key="m">{{ byKey.has(key(y, m)) ? (mode === 'anomaly' ? (byKey.get(key(y, m)).anomalyPct == null ? '—' : nf(0).format(byKey.get(key(y, m)).anomalyPct * 100) + ' %') : fmtV(byKey.get(key(y, m)).value)) : '' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </section>
</template>

<style scoped>
.bc { padding: 14px 16px 16px; min-width: 0; }
.bc__grid { display: flex; flex-direction: column; gap: 3px; }
.bc__row { display: grid; grid-template-columns: 44px repeat(12, minmax(0, 1fr)); gap: 3px; align-items: center; position: relative; }
.bc__row--switch::before { content: ''; position: absolute; left: 40px; right: 0; top: -2.5px; border-top: 1.5px dashed var(--muted); }
.bc__row--head { margin-bottom: 2px; }
.bc__year { font-size: 0.72rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.bc__mh { font-size: 0.72rem; color: var(--muted); text-align: center; text-transform: uppercase; }
.bc__cell { height: 16px; border-radius: 3px; cursor: pointer; position: relative; outline-offset: 1px; }
.bc__cell--empty { cursor: default; }
.bc__cell.is-reduced::after {
  content: ''; position: absolute; inset: 0; border-radius: 3px;
  background: repeating-linear-gradient(135deg, rgba(0, 0, 0, 0.45) 0 1.5px, transparent 1.5px 4px);
}
.bc__cell:hover { box-shadow: 0 0 0 1.5px var(--ink); z-index: 1; }
.bc__cell.is-a { box-shadow: 0 0 0 2px var(--period-a); z-index: 2; }
.bc__cell.is-b { box-shadow: 0 0 0 2px var(--period-b); z-index: 2; }
.bc__cell:focus-visible { outline: 2px solid var(--focus); }
.bc__readout { margin: 10px 0 6px; font-size: 0.8rem; color: var(--ink-2); min-height: 2.6em; }
.bc__k { display: inline-block; width: 12px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
.bc__k--reduced { background: repeating-linear-gradient(135deg, var(--muted) 0 1.5px, transparent 1.5px 4px); border: 1px solid var(--line-strong); }
.bc__k--est { width: 16px; height: 0; border-top: 1.5px dashed var(--muted); border-radius: 0; vertical-align: 3px; }
.bc__k--a { box-shadow: inset 0 0 0 2px var(--period-a); }
.bc__k--b { box-shadow: inset 0 0 0 2px var(--period-b); }
.bc__key-a { color: var(--period-a); }
.bc__key-b { color: var(--period-b); }
</style>
