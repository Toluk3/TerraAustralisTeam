<script setup>
/**
 * Pantalla Análisis (boceto-analisis.html): filtros → [capas | mapa + barra de tiempo] → ficha →
 * [calendario | comparar años] → [FRP | calidad del dato] → pie fijo de advertencias.
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { loadDataset, calendarRows, CANDIDATES } from '@/features/dataset.js';
import { analysis, initAnalysis, setPeriod, setCompare } from '@/stores/analysis.js';
import TimeSlider from '@/components/map/TimeSlider.vue';
import CompareMap from '@/components/map/CompareMap.vue';
import MapToolbar from '@/components/map/MapToolbar.vue';
import FilterBar from '@/components/map/FilterBar.vue';
import LayerPanel from '@/components/map/LayerPanel.vue';
import SelectionSummary from '@/components/summary/SelectionSummary.vue';
import { useSummaries } from '@/features/useSummaries.js';
import BurnCalendar from '@/components/charts/BurnCalendar.vue';
import YearCompare from '@/components/charts/YearCompare.vue';
import FrpHistogram from '@/components/charts/FrpHistogram.vue';
import DataQuality from '@/components/charts/DataQuality.vue';
import '@/components/charts/charts.css';

const { t } = useI18n();
const route = useRoute();
const ds = shallowRef(null);
const rows = shallowRef([]);
const status = ref('loading'); // 'loading' | 'ready' | 'nodata' | 'error'
const errorMsg = ref('');
useSummaries(ds, rows);

async function load() {
  status.value = 'loading';
  try {
    ds.value = await loadDataset();
    rows.value = calendarRows(ds.value.calendar);
    initAnalysis(rows.value, { demo: route.query.demo === 'compare' });
    status.value = 'ready';
  } catch (e) {
    console.warn('[Análisis]', e);
    status.value = e.code === 'NO_DATA' ? 'nodata' : 'error';
    errorMsg.value = e.message ?? String(e);
  }
}
onMounted(load);

// "Ver una comparación" con la pantalla ya abierta
watch(() => route.query.demo, (d) => { if (d === 'compare' && analysis.ready) setCompare(true); });

// El mapa (WebGL) no se crea hasta que su contenedor se ve
const mapSlot = ref(null);
const mapVisible = ref(false);
let io = null;
watch(status, async (s) => {
  if (s !== 'ready') return;
  await nextTick();
  if (!mapSlot.value) return;
  io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { mapVisible.value = true; io.disconnect(); }
  }, { rootMargin: '200px' });
  io.observe(mapSlot.value);
});
onBeforeUnmount(() => io?.disconnect());

const monthA = computed({
  get: () => analysis.periodA.to,
  set: (k) => setPeriod('A', k, k),
});
const expected = CANDIDATES.map((c) => `/${c}/`).join(', ');
</script>

<template>
  <div class="wrap wrap--wide an">
    <header class="an__head">
      <h1 class="an__title">{{ t('analysis.title') }}</h1>
      <p class="an__lead muted">{{ t('analysis.lead') }}</p>
    </header>

    <div v-if="status === 'loading'" class="card an__state" role="status">
      <span class="skeleton an__sk"></span>
      <span>{{ t('analysis.loading') }}</span>
    </div>
    <div v-else-if="status === 'nodata' || status === 'error'" class="card an__state an__state--err" role="alert">
      <strong>{{ status === 'nodata' ? t('analysis.noData') : t('analysis.error', { msg: errorMsg }) }}</strong>
      <span v-if="status === 'nodata'" class="muted">{{ t('analysis.noDataHint', { list: expected }) }}</span>
      <button type="button" class="btn btn--sm" @click="load">{{ t('analysis.retry') }}</button>
    </div>

    <template v-else-if="ds && analysis.ready">
      <div class="card an__filters"><FilterBar :meta="ds.meta" /></div>
      <div class="an__maprow">
        <div class="card an__layers"><LayerPanel /></div>
        <section class="card an__map" aria-labelledby="map-title">
          <MapToolbar />
          <div ref="mapSlot" class="an__mapslot">
            <CompareMap v-if="mapVisible" :dataset="ds" />
            <div v-else class="an__mapwait" aria-hidden="true"></div>
          </div>
          <TimeSlider v-model="monthA" :rows="rows" :markers="analysis.compare ? { b: analysis.periodB.to } : {}"
            :switch-month="ds.meta.switch_date.slice(0, 7)" class="an__time" />
        </section>
      </div>
      <SelectionSummary :meta="ds.meta" :rows="rows" />
      <div class="an__pair an__pair--cal">
        <BurnCalendar :rows="rows" :meta="ds.meta" />
        <YearCompare :rows="rows" />
      </div>
      <div class="an__pair">
        <FrpHistogram />
        <DataQuality />
      </div>
      <aside class="card an__warn" :aria-label="t('fixedFooter.label')">
        <ul>
          <li>{{ t('fixedFooter.hotspot') }}</li>
          <li>{{ t('fixedFooter.harmonized') }}</li>
          <li>{{ t('fixedFooter.window') }}</li>
          <li>{{ t('fixedFooter.version', { version: ds.meta.dataset_version ?? '—', hash: ds.meta.config_hash ?? '—' }) }}</li>
          <li>{{ t('fixedFooter.attribution') }}</li>
        </ul>
      </aside>
    </template>
  </div>
</template>

<style scoped>
.an { display: flex; flex-direction: column; gap: 16px; padding-block: 20px 0; }
.an__head { display: flex; align-items: baseline; gap: 6px 18px; flex-wrap: wrap; }
.an__title { font-size: clamp(1.8rem, 2.6vw, 2.4rem); }
.an__lead { margin: 0; font-size: 0.95rem; }
.an__state { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 28px; }
.an__state--err strong { font-weight: 500; }
.an__sk { width: 100%; height: 320px; }
.an__filters { padding: 10px 12px; }
.an__maprow { display: grid; grid-template-columns: 168px minmax(0, 1fr); gap: 16px; align-items: stretch; }
.an__layers { padding: 16px 14px; display: flex; flex-direction: column; }
.an__layers > * { flex: 1; }
.an__map { padding: 12px; }
.an__mapwait { width: 100%; aspect-ratio: 16 / 10; min-height: 420px; border-radius: var(--radius-s); background: #eceae4; }
.an__time { margin-top: 12px; }
/* Los dos gráficos de cada fila miden lo mismo y su contenido llena la tarjeta (sin huecos abajo) */
.an__pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: stretch; }
.an__pair--cal { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); }
.an__warn { padding: 12px 16px; font-size: 0.82rem; color: var(--ink-2); }
.an__warn ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 0; }
.an__warn li + li::before { content: '·'; margin: 0 10px; color: var(--muted); }
@media (max-width: 900px) {
  .an__maprow, .an__pair, .an__pair--cal { grid-template-columns: 1fr; }
  .an__layers { padding: 10px 12px; }
  .an__pair { align-items: start; }
  .an__mapwait { aspect-ratio: 4 / 5; min-height: 360px; }
}
</style>
