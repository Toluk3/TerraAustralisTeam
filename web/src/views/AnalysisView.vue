<script setup>
import { onMounted, shallowRef, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { loadDataset, calendarRows } from '@/features/dataset.js';
import { analysis, initAnalysis, setPeriod } from '@/stores/analysis.js';
import TimeSlider from '@/components/map/TimeSlider.vue';
import CompareMap from '@/components/map/CompareMap.vue';
import MapToolbar from '@/components/map/MapToolbar.vue';

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
  <section class="wrap wrap--wide" style="padding-block: 32px">
    <h1>{{ t('analysis.title') }}</h1>
    <div v-if="ds && analysis.ready" class="card" style="margin-top: 16px; padding: 12px">
      <MapToolbar />
      <CompareMap :dataset="ds" />
      <TimeSlider v-model="monthA" :rows="rows" :markers="analysis.compare ? { b: analysis.periodB.to } : {}"
        :switch-month="ds.meta.switch_date.slice(0, 7)" style="margin-top: 12px" />
    </div>
  </section>
</template>
