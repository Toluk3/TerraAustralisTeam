<script setup>
/**
 * Una instancia del módulo del mapa (createFireMap). MapLibre y deck.gl se importan bajo demanda para que
 * no se descarguen fuera de /analisis. El mapa base es siempre claro, también con la app en oscuro.
 */
import { onBeforeUnmount, onMounted, ref, shallowRef, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { intlLocale } from '@/stores/ui.js';
import { periodMonths } from '@/stores/analysis.js';

const props = defineProps({
  dataset: { type: Object, required: true },          // { source, meta }
  period: { type: Object, required: true },           // { from, to } 'YYYY-MM'
  view: { type: String, default: 'value' },           // 'value' | 'anomaly' | 'diff'
  layers: { type: Object, default: () => ({ cells: true, points: true, outline: true, mask: true }) },
  opacity: { type: Number, default: 0.75 },
  selectable: { type: Boolean, default: true },
  diff: { type: Object, default: null },              // { a: {from,to}, b: {from,to} } o null
  pointBudget: { type: Number, default: 250000 },
  camera: { type: Object, default: null },            // cámara inicial (segunda instancia)
  label: { type: String, default: '' },               // nombre accesible del mapa
});
const emit = defineEmits(['ready', 'selection', 'lasso', 'cell-click', 'move', 'state', 'error']);

const { t, locale } = useI18n();
const el = ref(null);
const failed = ref(null);
const loading = ref(true);
const api = shallowRef(null);
let mod = null;
let H3HexagonLayer = null;
let destroyed = false;
let offs = [];
let diffToken = 0;

const labels = computed(() => ({
  locale: intlLocale(),
  lasso: t('map.lasso'),
  lassoTitle: t('map.lassoTitle'),
  equivalentHotspots: t('map.tip.equivalent'),
  perMonth: t('map.tip.perMonth'),
  anomaly: t('map.tip.anomalyLabel'),
  anomalyVs: t('map.tip.anomaly'),
  hotspotOf: t('map.tip.hotspot'),
  day: t('map.tip.day'),
  night: t('map.tip.night'),
  confidence: t('map.tip.confidence'),
  periodText: periodText(props.period),
}));

function periodText(p) {
  if (!p?.from) return '';
  const f = new Intl.DateTimeFormat(intlLocale(), { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const d = (k) => f.format(new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, 1)));
  return p.to && p.to !== p.from ? `${d(p.from)} – ${d(p.to)}` : d(p.from);
}

const cellsVisible = () => props.layers.cells && !props.diff;

onMounted(async () => {
  try {
    mod = await import('@/features/fire-map/index.js');
    if (destroyed) return;
    const m = await mod.createFireMap(el.value, {
      source: props.dataset.source,
      basemap: 'claro',
      period: { from: props.period.from, to: props.period.to ?? props.period.from },
      metric: props.view === 'anomaly' ? 'anomaly' : 'value',
      hexOpacity: props.opacity,
      layers: { ...props.layers, cells: cellsVisible() },
      ui: { legend: false, badges: false, panel: false },
      labels: labels.value,
      selectable: props.selectable,
      pointBudget: props.pointBudget,
    });
    if (destroyed) { m.destroy(); return; }
    api.value = m;
    if (props.camera) m.jumpTo(props.camera);
    offs = [
      m.on('selection', (s) => emit('selection', s)),
      m.on('lasso', (on) => emit('lasso', on)),
      m.on('click', (d) => { if (d?.kind === 'cell') emit('cell-click', d); }),
      m.on('change', (s) => emit('state', s)),
      m.on('resolution', () => { if (props.diff) drawDiff(); }),
      m.on('error', (e) => emit('error', e)),
    ];
    const onMove = (e) => emit('move', { camera: camera(), user: Boolean(e?.originalEvent) });
    m.map.on('move', onMove);
    offs.push(() => m.map.off('move', onMove));
    if (props.diff) drawDiff();
    loading.value = false;
    emit('ready', m);
    emit('state', m.getState());
  } catch (e) {
    if (destroyed) return;
    console.warn('[FireMap]', e);
    failed.value = e?.message ?? String(e);
    loading.value = false;
    emit('error', e);
  }
});

onBeforeUnmount(() => {
  destroyed = true;
  for (const off of offs) off?.();
  api.value?.destroy();
  api.value = null;
});

function camera() {
  const map = api.value?.map;
  if (!map) return null;
  const c = map.getCenter();
  return { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
}

// --- Props → mapa ---
watch(() => [props.period.from, props.period.to], () => {
  api.value?.setPeriod({ from: props.period.from, to: props.period.to ?? props.period.from });
  api.value?.setLabels({ periodText: periodText(props.period) });
});
watch(() => props.view, (v) => api.value?.setMetric(v === 'anomaly' ? 'anomaly' : 'value'));
watch(() => props.opacity, (o) => { api.value?.setHexOpacity(o); if (props.diff) drawDiff(); });
watch(() => ({ ...props.layers }), (l, old) => {
  if (!api.value) return;
  for (const k of ['points', 'outline', 'mask']) if (!old || l[k] !== old[k]) api.value.setLayerVisible(k, l[k]);
  api.value.setLayerVisible('cells', cellsVisible());
  if (props.diff) drawDiff();
}, { deep: true });
watch(() => props.diff && [props.diff.a?.from, props.diff.a?.to, props.diff.b?.from, props.diff.b?.to], () => {
  if (!api.value) return;
  api.value.setLayerVisible('cells', cellsVisible());
  drawDiff();
});
watch(labels, (l) => api.value?.setLabels(l));

// --- Capa de diferencia: promedio mensual de A menos el de B, por celda ---
async function drawDiff() {
  const m = api.value;
  if (!m) return;
  const my = ++diffToken;
  if (!props.diff || !props.layers.cells) { m.setExtraLayers([]); return; }
  H3HexagonLayer ??= (await import('@deck.gl/geo-layers')).H3HexagonLayer;
  const { ramp, PUOR } = await import('@/features/fire-map/colors.js');
  const meta = props.dataset.meta;
  const res = m.getState().res;
  const available = new Set(meta.map.months);
  const mean = async (p) => {
    const months = periodMonths(p);
    const acc = new Map();
    const tables = await Promise.all(months.filter((k) => available.has(k)).map((k) => props.dataset.source.getCells(res, k)));
    for (const tb of tables) for (let i = 0; i < tb.length; i++) acc.set(tb.cell[i], (acc.get(tb.cell[i]) ?? 0) + tb.n_equiv[i]);
    for (const [k, v] of acc) acc.set(k, v / Math.max(1, months.length));
    return acc;
  };
  const [a, b] = await Promise.all([mean(props.diff.a), mean(props.diff.b)]);
  if (my !== diffToken || !api.value) return;
  const rows = [];
  for (const [cell, va] of a) rows.push({ cell, d: va - (b.get(cell) ?? 0) });
  for (const [cell, vb] of b) if (!a.has(cell)) rows.push({ cell, d: -vb });
  const domain = meta.map.domain?.[res] ?? 1;
  const L = Math.log1p(domain);
  m.setExtraLayers([new H3HexagonLayer({
    id: 'diff-cells', data: rows, pickable: false, extruded: false, stroked: false, filled: true,
    highPrecision: 'auto', opacity: props.opacity,
    getHexagon: (r) => r.cell,
    getFillColor: (r) => ramp(PUOR, 0.5 + 0.5 * Math.sign(r.d) * Math.min(1, Math.log1p(Math.abs(r.d)) / L), 235),
    updateTriggers: { getFillColor: [res, domain] },
  })]);
}

defineExpose({ api, camera });
</script>

<template>
  <div class="fire-map" :aria-label="label || undefined" role="region">
    <div ref="el" class="fire-map__host"></div>
    <div v-if="loading && !failed" class="fire-map__state">{{ t('map.loading') }}</div>
    <div v-if="failed" class="fire-map__state fire-map__state--err" role="alert">
      <strong>{{ t('map.failed') }}</strong>
      <span>{{ failed }}</span>
    </div>
  </div>
</template>

<style scoped>
/* El mapa no hereda el tema: su marco y sus controles son siempre claros */
.fire-map { position: absolute; inset: 0; background: #eceae4; color-scheme: light; }
.fire-map__host { position: absolute; inset: 0; }
.fire-map__host :deep(.tam-map) { min-height: 0; }
.fire-map__state {
  position: absolute; inset: 0; display: grid; place-content: center; gap: 6px; text-align: center;
  color: #3b3d42; font-size: 0.95rem; padding: 24px; pointer-events: none;
}
.fire-map__state--err { background: #f4f2ec; pointer-events: auto; }
.fire-map__state--err span { font-size: 0.82rem; color: #6a6c70; }
</style>
