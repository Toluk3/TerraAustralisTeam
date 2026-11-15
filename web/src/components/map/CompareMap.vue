<script setup>
/**
 * El corazón de la pantalla: mapa A siempre montado y, comparando, mapa B encima.
 *   A   → solo A          B  → solo B (cubre a A)          AB → B recortado con clip-path y la barra
 * Cámara compartida (jumpTo con indicador de movimiento programático), mismo dominio de color.
 * Vista Diferencia: un solo mapa (A) con A − B por celda.
 */
import { computed, ref, shallowRef, watch, onBeforeUnmount, markRaw } from 'vue';
import { useI18n } from 'vue-i18n';
import FireMap from './FireMap.vue';
import MapLegend from './MapLegend.vue';
import { analysis, setSplit, clampSplit, setMapApi, setLasso, monthIndex } from '@/stores/analysis.js';
import { intlLocale } from '@/stores/ui.js';

const props = defineProps({
  dataset: { type: Object, required: true },
});
const { t } = useI18n();

const box = ref(null);
const mapA = ref(null);
const mapB = ref(null);
const stateA = shallowRef(null);
const camB = shallowRef(null);

const diffMode = computed(() => analysis.view === 'diff' && analysis.compare);
const showB = computed(() => analysis.compare && !diffMode.value);
const mode = computed(() => (showB.value ? analysis.mode : 'A'));
const mapView = computed(() => (analysis.view === 'anomaly' ? 'anomaly' : 'value'));
const diff = computed(() => (diffMode.value ? { a: analysis.periodA, b: analysis.periodB } : null));
const legendView = computed(() => {
  if (diffMode.value) return 'diff';
  return stateA.value?.metric === 'anomaly' ? 'anomaly' : 'value';
});
const res = computed(() => stateA.value?.res ?? 5);
const domain = computed(() => props.dataset.meta.map.domain?.[res.value] ?? 1);

// --- Etiquetas de período ---
const fmtMonth = (k) => new Intl.DateTimeFormat(intlLocale(), { month: 'short', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, 1)));
const fmtPeriod = (p) => (!p?.from ? '' : p.to && p.to !== p.from ? `${fmtMonth(p.from)} – ${fmtMonth(p.to)}` : fmtMonth(p.from));
const labelA = computed(() => `A · ${fmtPeriod(analysis.periodA)}`);
const labelB = computed(() => `B · ${fmtPeriod(analysis.periodB)}`);

// --- Avisos del período (chips) ---
const badges = computed(() => {
  const meta = props.dataset.meta;
  const out = [];
  const periods = showB.value || diffMode.value ? [analysis.periodA, analysis.periodB] : [analysis.periodA];
  const sw = meta.switch_date?.slice(0, 7);
  if (sw && periods.some((p) => p.to && p.to >= sw)) {
    const date = new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${meta.switch_date}T00:00:00Z`));
    out.push({ kind: 'est', text: t('badge.estimated', { date }) });
  }
  const seen = new Set();
  for (const p of periods) {
    if (!p.from) continue;
    for (const r of meta.reduced_coverage_months ?? []) {
      const k = `${r.year}-${String(r.month).padStart(2, '0')}`;
      if (k >= p.from && k <= p.to && !seen.has(k)) {
        seen.add(k);
        out.push({ kind: 'warn', text: t('badge.reduced', { month: fmtMonth(k), pct: Math.round(r.coverage_frac * 100) }) });
      }
    }
  }
  if (analysis.view === 'anomaly' && stateA.value && stateA.value.metric !== 'anomaly') out.push({ kind: '', text: t('badge.anomalyMonth') });
  if (analysis.layers.points && stateA.value?.points?.zoomedOut) out.push({ kind: '', text: t('legend.zoomIn') });
  else if (analysis.layers.points && stateA.value?.points?.truncated) out.push({ kind: '', text: t('legend.truncated') });
  return out;
});

// --- Mapa A ---
function onReadyA(api) { setMapApi(api); }
// markRaw: la selección puede tener cientos de miles de celdas; no hace falta que sea reactiva por dentro
function onSelection(s) { analysis.selection = s ? markRaw(s) : null; }
function onLasso(on) { analysis.lasso = on; if (on) notice.value = null; }
// Avisos del módulo (selección demasiado grande, error de carga), traducidos acá
const notice = ref(null);
let noticeTimer = null;
function onNotice(n) {
  const nf = new Intl.NumberFormat(intlLocale());
  notice.value = n.code === 'too-many-cells'
    ? t('map.tooManyCells', { max: nf.format(n.max), res: n.res })
    : t('map.loadFailed', { msg: n.message ?? '' });
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.value = null; }, 7000);
}
onBeforeUnmount(() => { setMapApi(null); analysis.lasso = false; });

// Al encender Comparar, B arranca con la cámara de A
watch(showB, (on) => { if (on) camB.value = mapA.value?.camera() ?? null; }, { immediate: false });

// --- Cámara sincronizada ---
let syncing = false;
function sync(from, to, ev) {
  if (syncing || !ev?.camera) return;
  const other = to.value?.api;
  if (!other) return;
  syncing = true;
  try { other.jumpTo(ev.camera); } finally { syncing = false; }
}
const onMoveA = (ev) => sync(mapA, mapB, ev);
const onMoveB = (ev) => sync(mapB, mapA, ev);
// Clic en una celda de B: la selección vive en A
function onCellB(d) { mapA.value?.api?.selectCell(d.cell, d.res); }

// --- Barra vertical (AB) ---
const dragging = ref(false);
function posFromEvent(e) {
  const r = box.value.getBoundingClientRect();
  return clampSplit((e.clientX - r.left) / r.width);
}
function onDown(e) {
  if (e.button != null && e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  dragging.value = true;
  e.currentTarget.setPointerCapture?.(e.pointerId);
  setSplit(posFromEvent(e));
}
let raf = 0, last = null;
function onMove(e) {
  if (!dragging.value) return;
  e.preventDefault();
  last = e;
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; if (last) setSplit(posFromEvent(last)); });
}
function onUp(e) {
  if (!dragging.value) return;
  dragging.value = false;
  e.currentTarget.releasePointerCapture?.(e.pointerId);
}
function onKey(e) {
  const d = { ArrowLeft: -0.02, ArrowDown: -0.02, ArrowRight: 0.02, ArrowUp: 0.02 }[e.key];
  if (d != null) { e.preventDefault(); setSplit(analysis.split + d); }
  else if (e.key === 'Home') { e.preventDefault(); setSplit(0); }
  else if (e.key === 'End') { e.preventDefault(); setSplit(1); }
}
const splitPct = computed(() => Math.round(analysis.split * 100));

const bStyle = computed(() => {
  if (mode.value === 'A') return { display: 'none' };
  const s = { clipPath: mode.value === 'AB' ? `inset(0 0 0 ${analysis.split * 100}%)` : 'none' };
  if (analysis.lasso) s.pointerEvents = 'none'; // el lazo se dibuja en A sobre toda la superficie
  return s;
});

const lassoLabel = computed(() => t('map.lassoTitle'));
// Diferencia de meses entre A y B (para el título accesible)
const sameMonths = computed(() => analysis.compare && monthIndex(analysis.periodA.from ?? '0-1') === monthIndex(analysis.periodB.from ?? '0-1'));
defineExpose({ mapA, mapB, sameMonths });
</script>

<template>
  <div ref="box" class="cmap" :class="[`cmap--${mode}`, { 'is-dragging': dragging }]">
    <div class="cmap__layer cmap__layer--a" :aria-hidden="mode === 'B' ? 'true' : undefined">
      <FireMap ref="mapA" :dataset="dataset" :period="analysis.periodA" :view="mapView" :layers="analysis.layers"
        :opacity="analysis.opacity" :selectable="true" :diff="diff" :label="t('compare.mapA')"
        @ready="onReadyA" @selection="onSelection" @lasso="onLasso" @notice="onNotice" @state="stateA = $event" @move="onMoveA" />
    </div>
    <div v-if="showB" class="cmap__layer cmap__layer--b" :style="bStyle">
      <FireMap ref="mapB" :dataset="dataset" :period="analysis.periodB" :view="mapView" :layers="analysis.layers"
        :opacity="analysis.opacity" :selectable="false" :camera="camB" :point-budget="150000" :label="t('compare.mapB')"
        @move="onMoveB" @cell-click="onCellB" />
    </div>

    <!-- Etiquetas de período -->
    <span v-if="mode !== 'B'" class="cmap__tag cmap__tag--a">{{ diffMode ? `A − B · ${labelA.slice(4)} / ${labelB.slice(4)}` : labelA }}</span>
    <span v-if="showB && mode !== 'A'" class="cmap__tag cmap__tag--b">{{ labelB }}</span>

    <!-- Avisos del período -->
    <div v-if="badges.length" class="cmap__badges" aria-live="polite">
      <span v-for="b in badges" :key="b.text" class="cmap__badge" :class="b.kind && `cmap__badge--${b.kind}`">{{ b.text }}</span>
    </div>

    <p v-if="notice" class="cmap__notice" role="status">{{ notice }}</p>

    <!-- Lazo (el del módulo queda debajo de B en AB: este siempre está arriba) -->
    <button type="button" class="cmap__lasso" :aria-pressed="analysis.lasso" :title="lassoLabel" @click="setLasso(!analysis.lasso)">
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 3c4.4 0 7 2 7 4.5S14.4 12 10 12c-1.2 0-2.3-.1-3.2-.4M3 7.5C3 5 5.6 3 10 3M3 7.5c0 1.4.8 2.6 2.2 3.4M5.2 10.9 4 17l3-3.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <span>{{ t('map.lasso') }}</span>
    </button>

    <!-- Barra vertical -->
    <div v-if="mode === 'AB'" class="cmap__divider" :style="{ left: `${analysis.split * 100}%` }"
      role="slider" tabindex="0" :aria-label="t('compare.split')" aria-valuemin="4" aria-valuemax="96"
      :aria-valuenow="splitPct" :aria-valuetext="t('compare.splitText', { pct: splitPct })"
      @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" @keydown="onKey">
      <span class="cmap__handle" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16"><path d="M9 7 4 12l5 5M15 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
    </div>

    <MapLegend class="cmap__legend" :view="legendView" :res="res" :domain="domain" :cells="analysis.layers.cells" :points="analysis.layers.points" />
  </div>
</template>

<style scoped>
.cmap {
  position: relative; width: 100%; aspect-ratio: 16 / 10; min-height: 420px; max-height: calc(100svh - var(--nav-h) - 40px);
  border-radius: var(--radius-s); overflow: hidden; background: #eceae4; border: 1px solid var(--line);
  isolation: isolate; color-scheme: light;
}
.cmap__layer { position: absolute; inset: 0; }
.cmap__layer--b { z-index: 1; will-change: clip-path; }
.is-dragging, .is-dragging * { cursor: ew-resize !important; user-select: none; }

/* Controles del módulo: el botón Lazo propio reemplaza al suyo */
.cmap :deep(.tam-map__tool) { display: none !important; }
.cmap :deep(.maplibregl-ctrl-top-right) { top: 4px; right: 4px; }

.cmap__tag {
  position: absolute; top: 10px; z-index: 4; padding: 4px 11px; border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.95); border: 1px solid rgba(0, 0, 0, 0.18); font-size: 0.8rem; font-weight: 500;
  pointer-events: none; white-space: nowrap;
}
.cmap__tag--a { left: 10px; color: #1d5fd1; }
.cmap__tag--b { right: 56px; color: #9a5208; }

.cmap__badges { position: absolute; top: 44px; left: 10px; right: 120px; z-index: 4; display: flex; flex-wrap: wrap; gap: 6px; pointer-events: none; }
.cmap__badge {
  background: rgba(255, 255, 255, 0.95); color: #2b2c2f; border: 1px solid rgba(0, 0, 0, 0.14); border-radius: var(--radius-pill);
  padding: 3px 10px; font-size: 0.74rem;
}
.cmap__badge--est { border-style: dashed; border-color: #b8650a; color: #7a4206; }
.cmap__badge--warn { border-color: #d9480f; color: #8f2f06; }

.cmap__lasso {
  position: absolute; top: 84px; right: 10px; z-index: 4; display: inline-flex; align-items: center; gap: 6px;
  min-height: 34px; padding: 0 10px; border: 0; border-radius: 6px; background: #fff; color: #1d1e20; font-size: 0.82rem; font-weight: 500;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1); transition: background-color var(--t-in) var(--ease), transform var(--t-in) var(--ease);
}
.cmap__lasso:hover { background: #f2f2f2; transform: translateY(-1px); }
.cmap__lasso[aria-pressed='true'] { background: #1d5fd1; color: #fff; }

.cmap__divider {
  position: absolute; top: 0; bottom: 0; z-index: 3; width: 22px; margin-left: -11px; cursor: ew-resize; touch-action: none;
}
.cmap__divider::before { content: ''; position: absolute; top: 0; bottom: 0; left: 10px; width: 2px; background: #111214; }
.cmap__handle {
  position: absolute; top: 50%; left: 50%; width: 32px; height: 32px; transform: translate(-50%, -50%);
  border-radius: 50%; background: #fff; border: 1.5px solid #111214; color: #111214; display: grid; place-items: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18); transition: transform var(--t-in) var(--ease);
}
.cmap__divider:hover .cmap__handle, .cmap__divider:focus-visible .cmap__handle { transform: translate(-50%, -50%) scale(1.08); }
.cmap__divider:focus-visible { outline: none; }
.cmap__divider:focus-visible .cmap__handle { box-shadow: 0 0 0 3px #1d5fd1; }

.cmap__notice {
  position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 5; margin: 0; max-width: min(520px, calc(100% - 32px));
  background: #111214; color: #fff; border-radius: 10px; padding: 9px 14px; font-size: 0.85rem; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}
.cmap__legend { position: absolute; left: 10px; bottom: 10px; z-index: 4; }

@media (max-width: 900px) {
  .cmap { aspect-ratio: 4 / 5; min-height: 360px; max-height: none; }
  .cmap__badges { right: 10px; top: 46px; }
}
</style>
