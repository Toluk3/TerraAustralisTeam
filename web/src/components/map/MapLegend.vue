<script setup>
/** Leyenda propia del mapa (plegable): rampa del valor, de la anomalía o de A − B, y la de FRP de los focos. */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { CELLS, PUOR, FIRE, gradientCss, FRP_MAX, ANOMALY_MAX } from '@/features/fire-map/colors.js';
import { intlLocale } from '@/stores/ui.js';

const props = defineProps({
  view: { type: String, default: 'value' },       // efectivo: 'value' | 'anomaly' | 'diff'
  res: { type: Number, default: 7 },
  domain: { type: Number, default: 1 },
  cells: { type: Boolean, default: true },
  points: { type: Boolean, default: true },
});
const { t } = useI18n();
const open = ref(typeof window === 'undefined' ? true : window.innerWidth > 640);

const RES_AREA = { 3: 12400, 4: 1770, 5: 250, 6: 36, 7: 5, 8: 0.7 };
const nf = (d) => new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: d });
const tick = (x) => nf(props.domain < 10 ? 1 : 0).format(Math.expm1(x * Math.log1p(props.domain)));
const area = computed(() => nf(1).format(RES_AREA[props.res] ?? 0));
const ramp = computed(() => gradientCss(props.view === 'value' ? CELLS : PUOR));
</script>

<template>
  <div class="legend">
    <details :open="open" @toggle="open = $event.target.open">
      <summary>{{ t('legend.title') }}</summary>
      <template v-if="cells">
        <template v-if="view === 'value'">
          <div class="legend__title">{{ t('legend.value') }}</div>
          <div class="legend__bar" :style="{ background: ramp }"></div>
          <div class="legend__ticks"><span>0</span><span>{{ tick(0.5) }}</span><span>{{ tick(1) }}+</span></div>
        </template>
        <template v-else-if="view === 'anomaly'">
          <div class="legend__title">{{ t('legend.anomaly') }}</div>
          <div class="legend__bar" :style="{ background: ramp }"></div>
          <div class="legend__ticks"><span>{{ t('legend.less') }}</span><span>{{ t('legend.median') }}</span><span>+{{ ANOMALY_MAX * 100 }} %</span></div>
          <div class="legend__note"><i class="legend__sw"></i>{{ t('legend.noMedian') }}</div>
        </template>
        <template v-else>
          <div class="legend__title">{{ t('legend.diff') }}</div>
          <div class="legend__bar" :style="{ background: ramp }"></div>
          <div class="legend__ticks"><span>−{{ tick(1) }}</span><span>0</span><span>+{{ tick(1) }}</span></div>
          <div class="legend__ticks"><span>{{ t('legend.lessB') }}</span><span>{{ t('legend.moreB') }}</span></div>
        </template>
        <div class="legend__note">{{ t('legend.cell', { res, area }) }}</div>
      </template>
      <template v-if="points">
        <div class="legend__title">{{ t('legend.frp') }}</div>
        <div class="legend__bar" :style="{ background: gradientCss(FIRE) }"></div>
        <div class="legend__ticks"><span>0</span><span>{{ Math.round(Math.sqrt(FRP_MAX)) }}</span><span>{{ FRP_MAX }}+</span></div>
        <div class="legend__note">{{ t('legend.frpNote') }}</div>
      </template>
    </details>
  </div>
</template>

<style scoped>
/* Sobre el mapa (siempre claro): colores fijos claros, no los del tema */
.legend {
  width: 236px; max-width: calc(100% - 20px); background: rgba(255, 255, 255, 0.94); color: #1d1e20;
  border-radius: 10px; padding: 8px 12px 10px; box-shadow: 0 1px 6px rgba(0, 0, 0, 0.18); font-size: 0.78rem; line-height: 1.35;
}
summary { cursor: pointer; font-weight: 500; color: #44464b; min-height: 28px; display: flex; align-items: center; gap: 6px; }
summary::-webkit-details-marker { display: none; }
summary::before { content: '▸'; transition: transform var(--t-in) var(--ease); }
details[open] summary::before { transform: rotate(90deg); }
.legend__title { font-weight: 500; margin-top: 8px; }
.legend__bar { height: 9px; border-radius: 3px; margin: 5px 0 3px; }
.legend__ticks { display: flex; justify-content: space-between; color: #55575c; font-size: 0.72rem; }
.legend__note { color: #55575c; font-size: 0.72rem; margin-top: 4px; }
.legend__sw { display: inline-block; width: 9px; height: 9px; background: #a0a0a0; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
</style>
