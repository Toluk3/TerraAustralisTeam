<script setup>
/** Calidad del dato (boceto, zona 10): cobertura del período, origen del valor y proporción estimada. */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { analysis } from '@/stores/analysis.js';
import { results } from '@/features/useSummaries.js';
import { intlLocale } from '@/stores/ui.js';

const { t } = useI18n();
const nf = (d = 0) => new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: d });
const ORIGINS = ['modis', 'viirs', 'terra'];

function quality(s) {
  if (!s?.rows?.length) return null;
  const total = s.rows.reduce((a, r) => a + (r.nEquiv || 0), 0);
  // Peso de cada origen: por valor si hubo fuego; si no, por cantidad de meses
  const w = (r) => (total > 0 ? (r.nEquiv || 0) / total : 1 / s.rows.length);
  const share = Object.fromEntries(ORIGINS.map((o) => [o, s.rows.filter((r) => r.origin === o).reduce((a, r) => a + w(r), 0)]));
  return {
    coverage: s.coverage ?? 1,
    share,
    estimated: share.viirs + share.terra,
    months: s.rows.length,
  };
}
const qa = computed(() => quality(results.A));
const qb = computed(() => (analysis.compare ? quality(results.B) : null));
const periods = computed(() => [['A', qa.value], ['B', qb.value]].filter(([, q]) => q));
</script>

<template>
  <section class="card dq" aria-labelledby="dq-title">
    <header class="chart-head"><h2 id="dq-title" class="chart-title">{{ t('charts.quality.title') }}</h2></header>
    <div v-for="[p, q] in periods" :key="p" class="dq__period">
      <span class="dq__p" :class="`dq__p--${p}`">{{ p }} · {{ t('charts.quality.months', { n: q.months }, q.months) }}</span>
      <div class="dq__row">
        <span class="dq__lbl">{{ t('charts.quality.coverage') }}</span>
        <div class="dq__bar" role="img" :aria-label="`${t('charts.quality.coverage')}: ${nf().format(q.coverage * 100)} %`">
          <i class="dq__fill dq__fill--ok" :style="{ width: `${q.coverage * 100}%` }"></i>
        </div>
        <span class="dq__num">{{ nf().format(q.coverage * 100) }} %</span>
      </div>
      <div class="dq__row">
        <span class="dq__lbl">{{ t('charts.quality.origin') }}</span>
        <div class="dq__bar dq__bar--stack" role="img"
          :aria-label="ORIGINS.map((o) => `${t(`summary.originsLong.${o}`)} ${nf().format(q.share[o] * 100)} %`).join(', ')">
          <i v-for="o in ORIGINS" :key="o" class="dq__fill" :class="`dq__fill--${o}`" :style="{ width: `${q.share[o] * 100}%` }"></i>
        </div>
      </div>
      <p class="dq__legend muted">
        <span v-for="o in ORIGINS" :key="o"><i class="dq__sw" :class="`dq__fill--${o}`"></i>{{ t(`summary.origins.${o}`) }} {{ nf().format(q.share[o] * 100) }} %</span>
      </p>
      <p class="dq__est">{{ t('charts.quality.estimated') }}: {{ t('charts.quality.estimatedText', { pct: nf().format(q.estimated * 100) }) }}</p>
    </div>
    <RouterLink to="/proyecto#metodologia" class="link dq__link">{{ t('charts.quality.method') }} →</RouterLink>
    <details class="chart-table">
      <summary>{{ t('charts.table') }}</summary>
      <div class="chart-table__scroll">
        <table>
          <thead><tr><th scope="col"></th><th v-for="[p] in periods" :key="p" scope="col">{{ p }}</th></tr></thead>
          <tbody>
            <tr><th scope="row">{{ t('charts.quality.coverage') }}</th><td v-for="[p, q] in periods" :key="p">{{ nf().format(q.coverage * 100) }} %</td></tr>
            <tr v-for="o in ORIGINS" :key="o"><th scope="row">{{ t(`summary.originsLong.${o}`) }}</th><td v-for="[p, q] in periods" :key="p">{{ nf().format(q.share[o] * 100) }} %</td></tr>
            <tr><th scope="row">{{ t('charts.quality.estimated') }}</th><td v-for="[p, q] in periods" :key="p">{{ nf().format(q.estimated * 100) }} %</td></tr>
          </tbody>
        </table>
      </div>
    </details>
  </section>
</template>

<style scoped>
.dq { padding: 14px 16px 16px; min-width: 0; display: flex; flex-direction: column; }
.dq__period + .dq__period { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.dq__p { font-size: 0.8rem; font-weight: 500; }
.dq__p--A { color: var(--period-a); }
.dq__p--B { color: var(--period-b); }
.dq__row { display: grid; grid-template-columns: 168px minmax(0, 1fr) auto; gap: 10px; align-items: center; margin-top: 8px; font-size: 0.82rem; }
.dq__lbl { color: var(--muted); }
.dq__num { font-variant-numeric: tabular-nums; font-size: 0.8rem; }
.dq__bar { height: 9px; background: var(--surface-2); border-radius: 5px; overflow: hidden; display: flex; }
.dq__fill { display: block; height: 100%; }
.dq__fill--ok { background: var(--ok); }
.dq__fill--modis { background: var(--period-a); }
.dq__fill--viirs { background: var(--period-b-mark); }
.dq__fill--terra { background: var(--muted); }
.dq__legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 0.76rem; margin: 6px 0 0; }
.dq__sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
.dq__est { font-size: 0.82rem; margin: 8px 0 0; }
.dq__link { align-self: flex-start; margin-top: 14px; font-size: 0.86rem; min-height: 32px; display: inline-flex; align-items: center; background-position: 0 calc(50% + 0.75em); padding: 0; }
@media (max-width: 520px) { .dq__row { grid-template-columns: 1fr auto; } .dq__row .dq__bar { grid-column: 1 / -1; grid-row: 2; } }
</style>
