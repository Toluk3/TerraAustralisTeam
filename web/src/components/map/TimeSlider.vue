<script setup>
/**
 * Barra de tiempo propia (traducible): un range sobre los meses de la serie, con la línea del valor mensual
 * (escala log suave), marcas de año, meses con cobertura reducida, la línea punteada desde switch_date y
 * reproducir/pausar (700 ms por mes, nunca arranca sola).
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { intlLocale } from '@/stores/ui.js';

const props = defineProps({
  rows: { type: Array, required: true },            // calendarRows()
  modelValue: { type: String, default: null },      // 'YYYY-MM'
  markers: { type: Object, default: () => ({}) },   // { b: 'YYYY-MM' }
  switchMonth: { type: String, default: null },     // 'YYYY-MM' desde el que el valor es estimado
  label: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);
const { t } = useI18n();

const n = computed(() => props.rows.length);
const index = computed(() => Math.max(0, props.rows.findIndex((r) => r.key === props.modelValue)));
const current = computed(() => props.rows[index.value] ?? null);
const max = computed(() => props.rows.reduce((m, r) => Math.max(m, r.value || 0), 1));
const W = 1000, H = 56;
const x = (i) => (n.value > 1 ? (i / (n.value - 1)) * W : 0);
const pct = (i) => (n.value > 1 ? (i / (n.value - 1)) * 100 : 0);
const y = (v) => H - 4 - (Math.log1p(Math.max(0, v)) / Math.log1p(max.value)) * (H - 10);

const linePath = computed(() => props.rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(r.value).toFixed(1)}`).join(''));
const areaPath = computed(() => (n.value ? `${linePath.value}L${W} ${H}L0 ${H}Z` : ''));

const years = computed(() => {
  const out = [];
  props.rows.forEach((r, i) => { if (r.month === 1) out.push({ year: r.year, i }); });
  const step = out.length > 20 ? 5 : out.length > 10 ? 2 : 1;
  return out.map((o) => ({ ...o, labeled: o.year % step === 0 }));
});
const reduced = computed(() => props.rows.map((r, i) => ({ r, i })).filter(({ r }) => r.coverage < 1));
const switchIndex = computed(() => (props.switchMonth ? props.rows.findIndex((r) => r.key >= props.switchMonth) : -1));
const bIndex = computed(() => (props.markers?.b ? props.rows.findIndex((r) => r.key === props.markers.b) : -1));

const monthFmt = computed(() => new Intl.DateTimeFormat(intlLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }));
const numFmt = computed(() => new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 0 }));
const fmtMonth = (r) => (r ? monthFmt.value.format(new Date(Date.UTC(r.year, r.month - 1, 1))) : '—');
const valueText = computed(() => (current.value
  ? t('time.valueText', { month: fmtMonth(current.value), value: numFmt.value.format(current.value.value) })
  : ''));

// --- Arrastre: una emisión por cuadro ---
let pendingIdx = null;
let raf = 0;
function emitIndex(i) {
  const c = Math.min(n.value - 1, Math.max(0, i));
  pendingIdx = c;
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const key = props.rows[pendingIdx]?.key;
    if (key && key !== props.modelValue) emit('update:modelValue', key);
  });
}
function onInput(e) { emitIndex(Number(e.target.value)); }
function onKey(e) {
  const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -12, PageUp: 12 }[e.key];
  if (step != null) { e.preventDefault(); emitIndex(index.value + step); return; }
  if (e.key === 'Home') { e.preventDefault(); emitIndex(0); }
  if (e.key === 'End') { e.preventDefault(); emitIndex(n.value - 1); }
}

// --- Reproducir ---
const playing = ref(false);
let timer = null;
function stop() { playing.value = false; clearInterval(timer); timer = null; }
function play() {
  if (index.value >= n.value - 1) emitIndex(0);
  playing.value = true;
  timer = setInterval(() => {
    if (index.value >= n.value - 1) { stop(); return; }
    emit('update:modelValue', props.rows[index.value + 1].key);
  }, 700);
}
function toggle() { (playing.value ? stop : play)(); }
watch(() => props.rows, stop);
onBeforeUnmount(() => { stop(); if (raf) cancelAnimationFrame(raf); });
</script>

<template>
  <div class="ts" role="group" :aria-label="label || t('time.label')">
    <button type="button" class="ts__play" :aria-pressed="playing" :aria-label="playing ? t('time.pause') : t('time.play')" :title="playing ? t('time.pause') : t('time.play')" @click="toggle">
      <svg v-if="!playing" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>
      <svg v-else viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor"/></svg>
    </button>
    <div class="ts__now">
      <span class="ts__month">{{ fmtMonth(current) }}</span>
      <span class="ts__value muted">{{ current ? numFmt.format(current.value) : '' }}</span>
    </div>
    <div class="ts__track">
      <svg class="ts__spark" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" aria-hidden="true">
        <path :d="areaPath" class="ts__area" />
        <path :d="linePath" class="ts__line" vector-effect="non-scaling-stroke" />
      </svg>
      <div class="ts__marks" aria-hidden="true">
        <span v-for="yy in years" :key="yy.year" class="ts__year" :class="{ 'is-labeled': yy.labeled }" :style="{ left: pct(yy.i) + '%' }">
          <i v-if="yy.labeled">{{ yy.year }}</i>
        </span>
        <span v-for="m in reduced" :key="m.r.key" class="ts__reduced" :style="{ left: pct(m.i) + '%' }" :title="t('time.reduced')"></span>
        <span v-if="switchIndex > 0" class="ts__est" :style="{ left: pct(switchIndex) + '%' }"><i>{{ t('time.estimated') }}</i></span>
        <span v-if="bIndex >= 0" class="ts__b" :style="{ left: pct(bIndex) + '%' }"><i>B</i></span>
      </div>
      <input class="ts__range" type="range" min="0" :max="Math.max(0, n - 1)" step="1" :value="index"
        :aria-label="label || t('time.label')" :aria-valuetext="valueText" @input="onInput" @keydown="onKey" />
    </div>
  </div>
</template>

<style scoped>
.ts { display: grid; grid-template-columns: auto minmax(110px, auto) minmax(0, 1fr); align-items: center; gap: 12px 14px; }
.ts__play {
  width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--line-strong); background: var(--surface);
  color: var(--ink); display: grid; place-items: center; transition: transform var(--t-in) var(--ease), background-color var(--t-in) var(--ease);
}
.ts__play:hover { transform: translateY(-1px); background: var(--surface-2); }
.ts__now { display: flex; flex-direction: column; line-height: 1.25; }
.ts__month { font-weight: 500; font-size: 0.95rem; text-transform: capitalize; white-space: nowrap; }
.ts__value { font-size: 0.8rem; }
.ts__track { position: relative; height: 72px; }
.ts__spark { position: absolute; left: 0; right: 0; top: 0; width: 100%; height: 44px; }
.ts__area { fill: var(--ink); opacity: 0.1; }
.ts__line { fill: none; stroke: var(--ink); stroke-width: 1.2; opacity: 0.55; }
.ts__marks { position: absolute; inset: 0; pointer-events: none; }
.ts__year { position: absolute; top: 40px; height: 6px; border-left: 1px solid var(--line-strong); }
.ts__year i { position: absolute; top: 9px; left: 0; transform: translateX(-50%); font-style: normal; font-size: 0.72rem; color: var(--muted); }
.ts__reduced { position: absolute; top: 0; width: 7px; height: 7px; margin-left: -3.5px; border-radius: 50%; background: #e8820c; }
.ts__est { position: absolute; top: 0; bottom: 30px; right: 0; border-left: 1.5px dashed var(--muted); }
.ts__est i { position: absolute; top: -2px; left: 5px; font-style: normal; font-size: 0.7rem; color: var(--muted); white-space: nowrap; }
.ts__b { position: absolute; top: 0; height: 44px; border-left: 2px solid var(--period-b); }
.ts__b i { position: absolute; bottom: -2px; left: 3px; font-style: normal; font-size: 0.7rem; font-weight: 500; color: var(--period-b); }
.ts__range {
  position: absolute; left: 0; right: 0; top: 30px; width: 100%; height: 28px; margin: 0; background: transparent;
  -webkit-appearance: none; appearance: none; cursor: pointer;
}
.ts__range::-webkit-slider-runnable-track { height: 4px; background: var(--line-strong); border-radius: 2px; }
.ts__range::-moz-range-track { height: 4px; background: var(--line-strong); border-radius: 2px; }
.ts__range::-webkit-slider-thumb {
  -webkit-appearance: none; width: 8px; height: 26px; margin-top: -11px; border-radius: 3px; background: var(--period-a);
  border: 2px solid var(--surface); box-shadow: 0 0 0 1px var(--period-a);
}
.ts__range::-moz-range-thumb { width: 8px; height: 26px; border-radius: 3px; background: var(--period-a); border: 2px solid var(--surface); }
.ts__range:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
@media (max-width: 560px) {
  .ts { grid-template-columns: auto 1fr; }
  .ts__track { grid-column: 1 / -1; }
}
</style>
