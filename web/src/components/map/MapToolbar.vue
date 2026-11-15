<script setup>
/** Línea de controles sobre el mapa (boceto, zona 5): "Mapa", Comparar, A | AB | B y la ayuda de la barra. */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { analysis, setCompare, setMode } from '@/stores/analysis.js';

const { t } = useI18n();
const diffMode = computed(() => analysis.view === 'diff' && analysis.compare);
const modes = [
  { id: 'A', key: 'compare.modeA' },
  { id: 'AB', key: 'compare.modeAB' },
  { id: 'B', key: 'compare.modeB' },
];
</script>

<template>
  <div class="mtb">
    <h2 id="map-title" class="mtb__title">{{ t('analysis.mapSection') }}</h2>
    <button type="button" class="btn btn--sm btn--ghost mtb__cmp" :aria-pressed="analysis.compare" @click="setCompare(!analysis.compare)">
      {{ t('compare.button') }}
    </button>
    <div v-if="analysis.compare && !diffMode" class="seg mtb__seg" role="group" :aria-label="t('compare.modes')">
      <button v-for="m in modes" :key="m.id" type="button" :aria-pressed="analysis.mode === m.id" :title="t(m.key)"
        :aria-label="t(m.key)" @click="setMode(m.id)">{{ m.id }}</button>
    </div>
    <span v-if="analysis.compare && !diffMode && analysis.mode === 'AB'" class="mtb__hint muted">{{ t('compare.hint') }}</span>
    <span v-if="diffMode" class="mtb__hint muted">{{ t('compare.diffOn') }}</span>
  </div>
</template>

<style scoped>
.mtb { display: flex; align-items: center; gap: 10px 12px; flex-wrap: wrap; padding: 2px 2px 12px; }
.mtb__title { font-size: 1.05rem; font-weight: 500; letter-spacing: 0; margin-right: 4px; }
.mtb__cmp { min-height: 40px; }
.mtb__seg > button { min-height: 40px; min-width: 48px; }
.mtb__hint { font-size: 0.86rem; }
</style>
