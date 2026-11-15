<script setup>
/**
 * Ventana flotante de la selección (lazo o clic), sobre el mapa A. Muestra solo lo que la ficha de abajo
 * (SelectionSummary) y los gráficos no muestran: actividad dentro de la selección, detalle por mes,
 * detecciones descriptivas y la estimación exploratoria de biomasa y CO₂.
 *
 * No calcula nada: lee el resumen que el módulo del mapa ya arma al seleccionar (summary.js) y deja en
 * analysis.selection. Por eso sus números son del período A y coinciden con los de la ficha.
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { COMBUSTION_COEF, EF_CO2 } from '@/features/fire-map/summary.js';
import { explCsv, fmtMassParts } from '@/features/selectionDetail.js';
import { intlLocale } from '@/stores/ui.js';

const props = defineProps({
  /** analysis.selection: { cells, area, months, rows, total } */
  selection: { type: Object, required: true },
});
const { t, locale } = useI18n();

const open = ref(true);       // false: queda solo el botón para volver a abrirla
const folded = ref(false);    // true: solo el encabezado

const nf = (d = 0) => { locale.value; return new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: d }); };
const fmt = (v, d = 0) => (v == null || Number.isNaN(v) ? '—' : nf(d).format(v));
const fmtV = (v) => (v == null ? '—' : nf(v < 10 ? 1 : 0).format(v));
const fmtMonth = (k) => { locale.value; return new Intl.DateTimeFormat(intlLocale(), { month: 'short', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, 1))); };
const fmtDay = (d) => (d == null ? '—' : new Date(d * 86400000).toISOString().slice(0, 10));
const fmtRange = (lo, hi) => (lo == null || hi == null || hi - lo < 0.05 ? '—' : `${fmtV(lo)}–${fmtV(hi)}`);
const fmtCov = (c) => `${fmt((c ?? 1) * 100)} %`;
function fmtMass(tons) {
  const p = fmtMassParts(tons);
  return p ? `${fmt(p.value, p.digits)} ${t(`selwin.units.${p.unit}`)}` : '—';
}

const tot = computed(() => props.selection.total ?? null);
const rows = computed(() => props.selection.rows ?? []);
const period = computed(() => {
  const m = props.selection.months ?? [];
  if (!m.length) return '';
  return m.length > 1 ? `${fmtMonth(m[0])} – ${fmtMonth(m.at(-1))}` : fmtMonth(m[0]);
});
const platforms = computed(() => Object.entries(tot.value?.byPlatform ?? {}).map(([k, v]) => `${k} ${fmt(v)}`).join(' · ') || '—');

function downloadCsv() {
  const m = props.selection.months ?? [];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([explCsv(rows.value)], { type: 'text/csv' }));
  a.download = `terra-australis_seleccion_${m[0] ?? ''}_${m.at(-1) ?? ''}_exploratorio.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
</script>

<template>
  <button v-if="!open" type="button" class="sw-open" @click="open = true">{{ t('selwin.open') }}</button>

  <section v-else-if="tot" class="sw" aria-labelledby="sw-title">
    <header class="sw__head">
      <button type="button" class="sw__fold" :aria-expanded="!folded" :title="folded ? t('selwin.expand') : t('selwin.collapse')"
        @click="folded = !folded">
        <span class="sw__caret" :class="{ 'is-folded': folded }" aria-hidden="true">▾</span>
        <span id="sw-title" class="sw__title">{{ t('selwin.title') }}</span>
      </button>
      <span class="sw__period">{{ period }}</span>
      <button type="button" class="sw__x" :aria-label="t('selwin.close')" :title="t('selwin.close')" @click="open = false">×</button>
    </header>

    <div v-show="!folded" class="sw__body">
      <!-- Actividad -->
      <dl class="sw__grid">
        <dt>{{ t('selwin.activity.fireCells') }}</dt>
        <dd>{{ t('selwin.activity.of', { n: fmt(tot.fireCells), of: fmt(selection.cells.length) }) }}</dd>
        <dt>{{ t('selwin.activity.fireArea') }}</dt>
        <dd>{{ fmt(tot.fireArea) }} km² <small>{{ t('selwin.activity.fireAreaNote') }}</small></dd>
        <dt>{{ t('selwin.activity.monthsWithFire') }}</dt>
        <dd>{{ t('selwin.activity.of', { n: fmt(tot.monthsWithFire), of: fmt(rows.length) }) }}</dd>
        <dt>{{ t('selwin.activity.peakMonth') }}</dt>
        <dd>{{ tot.peakMonth ? t('selwin.activity.peakValue', { month: fmtMonth(tot.peakMonth.month), v: fmtV(tot.peakMonth.nEquiv) }) : '—' }}</dd>
      </dl>

      <!-- Exploratorio: biomasa y CO₂ -->
      <details class="sw__sec sw__sec--expl" open>
        <summary>{{ t('selwin.expl.title') }}</summary>
        <div class="sw__hero">
          <div><b class="sw__big sw__big--expl">{{ fmtMass(tot.biomass) }}</b><span class="sw__lbl">{{ t('selwin.expl.biomass') }}</span></div>
          <div><b class="sw__big">{{ fmtMass(tot.co2) }}</b><span class="sw__lbl">{{ t('selwin.expl.co2') }}</span></div>
        </div>
        <p class="sw__warn" role="note">{{ t('selwin.expl.warn') }}</p>
        <dl class="sw__grid">
          <dt>{{ t('selwin.expl.fre') }}</dt><dd>{{ fmt(tot.fre / 1e6, 2) }} TJ</dd>
          <dt>{{ t('selwin.expl.peakDay') }}</dt>
          <dd>{{ tot.peak ? `${fmtDay(tot.peak.day)} · ${fmtMass((tot.peak.fre * COMBUSTION_COEF) / 1000)}` : '—' }}</dd>
          <dt>{{ t('selwin.expl.frpSum') }}</dt><dd>{{ fmt(tot.frpSum) }} MW</dd>
        </dl>
        <p class="sw__note">{{ t('selwin.expl.formula', { coef: fmt(COMBUSTION_COEF, 3), ef: fmt(EF_CO2, 1) }) }}</p>
        <button type="button" class="sw__btn" @click="downloadCsv">{{ t('selwin.expl.csv') }}</button>
      </details>

      <!-- Detecciones -->
      <details class="sw__sec">
        <summary>{{ t('selwin.det.title') }}</summary>
        <p class="sw__note">{{ t('selwin.det.note') }}</p>
        <dl class="sw__grid">
          <dt>{{ t('selwin.det.raw') }}</dt>
          <dd>{{ fmt(tot.detections) }} <small>{{ t('selwin.det.dayNight', { day: fmt(tot.dayDet), night: fmt(tot.nightDet) }) }}</small></dd>
          <dt>{{ t('selwin.det.byPlatform') }}</dt><dd>{{ platforms }}</dd>
          <dt>{{ t('selwin.det.frp') }}</dt><dd>{{ fmt(tot.frpMedian, 1) }} / {{ fmt(tot.frpP90, 1) }} / {{ fmt(tot.frpMax, 1) }} MW</dd>
          <dt>{{ t('selwin.det.days') }}</dt><dd>{{ fmt(tot.activeDays) }}</dd>
          <dt>{{ t('selwin.det.firstLast') }}</dt><dd>{{ tot.first != null ? `${fmtDay(tot.first)} / ${fmtDay(tot.last)}` : '—' }}</dd>
          <dt>{{ t('selwin.det.centroid') }}</dt>
          <dd>{{ tot.centroid ? `${tot.centroid[1].toFixed(4)}, ${tot.centroid[0].toFixed(4)}` : '—' }}</dd>
        </dl>
      </details>

      <!-- Detalle por mes -->
      <details class="sw__sec">
        <summary>{{ t('selwin.monthly.title') }}</summary>
        <div class="sw__scroll">
          <table>
            <thead><tr>
              <th scope="col">{{ t('selwin.monthly.month') }}</th><th scope="col">{{ t('selwin.monthly.nEquiv') }}</th>
              <th scope="col">p05–p95</th><th scope="col">MODIS</th><th scope="col">VIIRS</th>
              <th scope="col">{{ t('selwin.monthly.origin') }}</th><th scope="col">{{ t('selwin.monthly.cov') }}</th>
            </tr></thead>
            <tbody>
              <tr v-for="r in rows" :key="r.month">
                <th scope="row">{{ fmtMonth(r.month) }}</th><td>{{ fmtV(r.nEquiv) }}</td><td>{{ fmtRange(r.lo, r.hi) }}</td>
                <td>{{ fmt(r.detModis) }}</td><td>{{ fmt(r.detViirs) }}</td>
                <td>{{ t(`summary.origins.${r.origin}`) }}</td><td>{{ fmtCov(r.coverage) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  </section>
</template>

<style scoped>
/* Va sobre el mapa, que siempre es claro (CompareMap fija color-scheme: light): colores fijos como sus otros carteles */
.sw, .sw-open {
  position: absolute; top: 126px; right: 10px; z-index: 5;
  background: rgba(255, 255, 255, 0.97); color: #1d1e20; border: 1px solid rgba(0, 0, 0, 0.14);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18); font-size: 0.78rem; line-height: 1.4;
}
.sw { width: 330px; max-width: calc(100% - 20px); max-height: calc(100% - 150px); border-radius: 10px; display: flex; flex-direction: column; }
.sw-open { min-height: 34px; padding: 0 12px; border-radius: 6px; font-weight: 500; }
.sw-open:hover { background: #f2f2f2; }

.sw__head { display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 10px; border-bottom: 1px solid rgba(0, 0, 0, 0.08); }
.sw__fold { display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 0; border: 0; background: none; color: inherit; text-align: left; }
.sw__caret { display: inline-block; color: #5f6166; transition: transform var(--t-in) var(--ease); }
.sw__caret.is-folded { transform: rotate(-90deg); }
.sw__title { font-size: 0.86rem; font-weight: 600; white-space: nowrap; }
.sw__period { margin-left: auto; color: #1d5fd1; font-weight: 500; font-size: 0.72rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.sw__x { width: 28px; height: 28px; border: 0; border-radius: 6px; background: none; color: #5f6166; font-size: 1.15rem; line-height: 1; }
.sw__x:hover { background: #ececea; color: #1d1e20; }

.sw__body { overflow: auto; padding: 10px 12px 12px; }
.sw__grid { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; margin: 0; }
.sw__grid dt { color: #5f6166; }
.sw__grid dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
.sw__grid small, .sw__lbl { color: #5f6166; }

.sw__sec { margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(0, 0, 0, 0.08); }
.sw__sec > summary { cursor: pointer; font-weight: 600; margin-bottom: 6px; }
.sw__hero { display: flex; gap: 14px; margin: 4px 0 8px; }
.sw__hero > div { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.sw__big { font-size: 1.05rem; font-weight: 500; line-height: 1.2; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sw__big--expl { color: #8f2f06; }
.sw__lbl { font-size: 0.72rem; }
.sw__warn { margin: 0 0 8px; padding: 6px 9px; border-radius: 6px; background: #fdf0dd; color: #7a4206; }
.sw__note { margin: 6px 0; color: #5f6166; font-size: 0.72rem; }
.sw__btn { min-height: 30px; margin-top: 4px; padding: 0 10px; border: 1px solid rgba(0, 0, 0, 0.22); border-radius: 6px; background: #fff; color: inherit; font-weight: 500; }
.sw__btn:hover { background: #f2f2f2; }

.sw__scroll { overflow-x: auto; }
.sw table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sw th, .sw td { padding: 3px 6px; text-align: right; border-bottom: 1px solid rgba(0, 0, 0, 0.07); font-weight: 400; }
.sw thead th { color: #5f6166; font-weight: 500; }
.sw th:first-child { text-align: left; }

.sw button:focus-visible, .sw summary:focus-visible, .sw-open:focus-visible { outline: 2px solid #1d5fd1; outline-offset: 2px; }

@media (max-width: 900px) {
  .sw { left: 10px; width: auto; max-height: calc(100% - 190px); }
}
</style>
