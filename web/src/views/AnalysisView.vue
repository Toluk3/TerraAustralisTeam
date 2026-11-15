<script setup>
import { onMounted, shallowRef, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { loadDataset, calendarRows } from '@/features/dataset.js';
import { analysis, initAnalysis, setPeriod } from '@/stores/analysis.js';
import TimeSlider from '@/components/map/TimeSlider.vue';
import CompareMap from '@/components/map/CompareMap.vue';
import MapToolbar from '@/components/map/MapToolbar.vue';
import FilterBar from '@/components/map/FilterBar.vue';
import LayerPanel from '@/components/map/LayerPanel.vue';

const { t } = useI18n();
const route = useRoute();
const ds = shallowRef(null);
const rows = shallowRef([]);

onMounted(async () => {
  ds.value = await loadDataset();
  rows.value = calendarRows(ds.value.calendar);
  initAnalysis(rows.value, { demo: route.query.demo === 'compare' });
});

const monthA = computed({
  get: () => analysis.periodA.to,
  set: (k) => setPeriod('A', k, k),
});
</script>

<template>
  <div class="wrap wrap--wide an">
    <header class="an__head">
      <h1 class="an__title">{{ t('analysis.title') }}</h1>
    </header>
    <template v-if="ds && analysis.ready">
      <div class="card an__filters"><FilterBar :meta="ds.meta" /></div>
      <div class="an__maprow">
        <div class="card an__layers"><LayerPanel /></div>
        <section class="card an__map" aria-labelledby="map-title">
          <MapToolbar />
          <CompareMap :dataset="ds" />
          <TimeSlider v-model="monthA" :rows="rows" :markers="analysis.compare ? { b: analysis.periodB.to } : {}"
            :switch-month="ds.meta.switch_date.slice(0, 7)" class="an__time" />
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.an { display: flex; flex-direction: column; gap: 16px; padding-block: 20px 0; }
.an__title { font-size: clamp(1.8rem, 2.6vw, 2.4rem); }
.an__filters { padding: 10px 12px; }
.an__maprow { display: grid; grid-template-columns: 168px minmax(0, 1fr); gap: 16px; align-items: start; }
.an__layers { padding: 16px 14px; position: sticky; top: calc(var(--nav-h) + 12px); }
.an__map { padding: 12px; }
.an__time { margin-top: 12px; }
@media (max-width: 900px) {
  .an__maprow { grid-template-columns: 1fr; }
  .an__layers { position: static; padding: 10px 12px; }
}
</style>
