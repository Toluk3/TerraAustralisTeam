<script setup>
/**
 * Barra de filtros (boceto, zona 3): zona (solo lectura), período A, período B (solo comparando), métrica
 * y Exportar. Comparar y A | AB | B van en la línea de controles del mapa, como en el boceto.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import PeriodPicker from './PeriodPicker.vue';
import { analysis, setPeriod } from '@/stores/analysis.js';
import { exportSummary } from '@/features/exportSummary.js';

const props = defineProps({ meta: { type: Object, required: true } });
const { t } = useI18n();

const periodA = computed({ get: () => analysis.periodA, set: (p) => setPeriod('A', p.from, p.to) });
const periodB = computed({ get: () => analysis.periodB, set: (p) => setPeriod('B', p.from, p.to) });

const menu = ref(false);
const menuEl = ref(null);
function onDoc(e) { if (menu.value && !menuEl.value?.contains(e.target)) menu.value = false; }
function onKey(e) { if (e.key === 'Escape') menu.value = false; }
onMounted(() => { document.addEventListener('pointerdown', onDoc); document.addEventListener('keydown', onKey); });
onBeforeUnmount(() => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey); });
function doExport(kind) { exportSummary(kind, props.meta); menu.value = false; }
</script>

<template>
  <div class="fb" role="group" :aria-label="t('filters.label')">
    <span class="chip fb__zone" :title="meta.zone">{{ t('filters.zone') }}: {{ meta.zone }}</span>
    <PeriodPicker v-model="periodA" which="A" :coverage="meta.coverage" :label="t('filters.periodA')" />
    <PeriodPicker v-if="analysis.compare" v-model="periodB" which="B" :coverage="meta.coverage" :label="t('filters.periodB')" />
    <span class="chip">{{ t('filters.metric') }}: {{ t('filters.metricValue') }}</span>
    <div ref="menuEl" class="fb__export">
      <button type="button" class="btn btn--sm btn--ghost" aria-haspopup="menu" :aria-expanded="menu" @click="menu = !menu">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 2v8m0 0-3-3m3 3 3-3M3 13h10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        {{ t('filters.export') }}
      </button>
      <div v-if="menu" class="fb__menu" role="menu">
        <button type="button" role="menuitem" @click="doExport('csv')">{{ t('filters.exportCsv') }}</button>
        <button type="button" role="menuitem" @click="doExport('json')">{{ t('filters.exportJson') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fb { display: flex; align-items: center; gap: 8px 10px; flex-wrap: wrap; }
.fb__zone { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fb__export { margin-left: auto; position: relative; }
.fb__export .btn { min-height: 40px; }
.fb__menu {
  position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 180px; padding: 6px;
  background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius-s); box-shadow: var(--shadow);
  display: flex; flex-direction: column;
}
.fb__menu button {
  min-height: 40px; border: 0; background: transparent; text-align: left; padding: 0 12px; border-radius: 6px; font-size: 0.9rem;
}
.fb__menu button:hover, .fb__menu button:focus-visible { background: var(--surface-2); }
@media (max-width: 640px) { .fb__export { margin-left: 0; } }
</style>
