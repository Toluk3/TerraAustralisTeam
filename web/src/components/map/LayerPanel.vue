<script setup>
/** Capas (boceto, zona 4): mostrar, vista Valor/Anomalía/Diferencia, opacidad y recordatorio del lazo. Sin selector de mapa base. */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { analysis, setView } from '@/stores/analysis.js';

const { t } = useI18n();
const open = ref(false); // cajón en pantallas angostas
const layers = ['cells', 'points'];
const singleMonth = computed(() => analysis.periodA.from === analysis.periodA.to);
const views = computed(() => [
  { id: 'value', disabled: false, note: null },
  { id: 'anomaly', disabled: !singleMonth.value, note: singleMonth.value ? null : t('layers.anomalyOnlyMonth') },
  { id: 'diff', disabled: !analysis.compare, note: analysis.compare ? null : t('layers.diffOnlyCompare') },
]);
const opacityPct = computed(() => Math.round(analysis.opacity * 100));
</script>

<template>
  <aside class="lp" :class="{ 'is-open': open }" :aria-label="t('layers.title')">
    <button type="button" class="lp__toggle btn btn--sm btn--ghost" :aria-expanded="open" aria-controls="lp-body" @click="open = !open">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 2 1.5 5.5 8 9l6.5-3.5zM1.5 8.5 8 12l6.5-3.5M1.5 11 8 14.5 14.5 11" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
      {{ open ? t('layers.close') : t('layers.open') }}
    </button>
    <div id="lp-body" class="lp__body">
      <h2 class="lp__title">{{ t('layers.title') }}</h2>
      <fieldset class="lp__group">
        <legend>{{ t('layers.show') }}</legend>
        <label v-for="l in layers" :key="l" class="lp__check">
          <input v-model="analysis.layers[l]" type="checkbox" />
          <span>{{ t(`layers.${l}`) }}</span>
        </label>
      </fieldset>
      <fieldset class="lp__group">
        <legend>{{ t('layers.view') }}</legend>
        <div class="lp__views">
          <button v-for="v in views" :key="v.id" type="button" class="lp__view" :aria-pressed="analysis.view === v.id"
            :disabled="v.disabled" :title="v.note || undefined" @click="setView(v.id)">{{ t(`layers.${v.id}`) }}</button>
        </div>
        <p v-for="v in views.filter((x) => x.note)" :key="v.id" class="lp__note muted">{{ v.note }}</p>
      </fieldset>
      <div class="lp__group">
        <label for="lp-opacity" class="lp__legend">{{ t('layers.opacity') }}</label>
        <input id="lp-opacity" v-model.number="analysis.opacity" class="lp__range" type="range" min="0.1" max="1" step="0.05"
          :aria-valuetext="`${opacityPct} %`" />
      </div>
      <p class="lp__note muted">{{ t('layers.lassoHint') }}</p>
    </div>
  </aside>
</template>

<style scoped>
.lp { font-size: 0.88rem; }
.lp__toggle { display: none; }
.lp__body { display: flex; flex-direction: column; gap: 16px; }
.lp__title { font-size: 1.05rem; font-weight: 500; letter-spacing: 0; }
.lp__group { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.lp__group legend, .lp__legend { color: var(--muted); font-size: 0.8rem; margin-bottom: 4px; padding: 0; }
.lp__check { display: flex; align-items: center; gap: 8px; min-height: 34px; cursor: pointer; }
.lp__check input { width: 18px; height: 18px; accent-color: var(--period-a); margin: 0; }
.lp__views { display: flex; flex-direction: column; gap: 6px; }
.lp__view {
  min-height: 36px; border: 1px solid var(--line-strong); border-radius: var(--radius-pill); background: var(--surface);
  color: var(--ink-2); font-size: 0.85rem; padding: 0 12px; text-align: center;
  transition: background-color var(--t-in) var(--ease), color var(--t-in) var(--ease);
}
.lp__view:hover:not(:disabled) { background: var(--surface-2); color: var(--ink); }
.lp__view[aria-pressed='true'] { background: var(--period-a-bg); color: var(--period-a); border-color: var(--period-a); font-weight: 500; }
.lp__view:disabled { opacity: 0.45; cursor: not-allowed; }
.lp__note { font-size: 0.76rem; margin: 2px 0 0; line-height: 1.4; }
.lp__range { width: 100%; accent-color: var(--period-a); min-height: 28px; }

@media (max-width: 900px) {
  .lp__toggle { display: inline-flex; }
  .lp__body { display: none; margin-top: 12px; }
  .lp.is-open .lp__body { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; }
  .lp__title { display: none; }
  .lp__views { flex-direction: row; flex-wrap: wrap; }
}
</style>
