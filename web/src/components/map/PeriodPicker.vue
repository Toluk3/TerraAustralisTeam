<script setup>
/** Selector de período (mes + año, con "hasta" opcional) limitado a la cobertura de la serie. */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { intlLocale } from '@/stores/ui.js';

const props = defineProps({
  which: { type: String, required: true },          // 'A' | 'B'
  modelValue: { type: Object, required: true },     // { from, to }
  coverage: { type: Object, required: true },       // meta.coverage { from: 'YYYY-MM-DD', to }
  label: { type: String, required: true },
});
const emit = defineEmits(['update:modelValue']);
const { t } = useI18n();

const first = computed(() => props.coverage.from.slice(0, 7));
const last = computed(() => props.coverage.to.slice(0, 7));
const years = computed(() => {
  const out = [];
  for (let y = +first.value.slice(0, 4); y <= +last.value.slice(0, 4); y++) out.push(y);
  return out;
});
const monthNames = computed(() => {
  const f = new Intl.DateTimeFormat(intlLocale(), { month: 'short', timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, i) => f.format(new Date(Date.UTC(2020, i, 1))));
});
const range = ref(props.modelValue.from !== props.modelValue.to);
watch(() => props.modelValue, (v) => { if (v.from !== v.to) range.value = true; });

const clamp = (k) => (k < first.value ? first.value : k > last.value ? last.value : k);
const key = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
function set(part, field, value) {
  const cur = props.modelValue[part] ?? props.modelValue.from;
  let y = +cur.slice(0, 4), m = +cur.slice(5, 7);
  if (field === 'y') y = +value; else m = +value;
  const k = clamp(key(y, m));
  const next = { ...props.modelValue, [part]: k };
  if (!range.value) next.to = next.from;
  emit('update:modelValue', next);
}
function toggleRange() {
  range.value = !range.value;
  if (!range.value) emit('update:modelValue', { from: props.modelValue.from, to: props.modelValue.from });
}
const disabledMonth = (y, m) => key(y, m) < first.value || key(y, m) > last.value;
const id = `pp-${props.which}`;
</script>

<template>
  <fieldset class="pp" :class="`pp--${which.toLowerCase()}`">
    <legend class="pp__legend">{{ label }}</legend>
    <template v-for="part in range ? ['from', 'to'] : ['from']" :key="part">
      <span v-if="range" class="pp__sep muted">{{ t(`filters.${part}`) }}</span>
      <label class="visually-hidden" :for="`${id}-${part}-m`">{{ label }} · {{ t('filters.month') }}</label>
      <select :id="`${id}-${part}-m`" class="pp__sel" :value="+modelValue[part].slice(5, 7)" @change="set(part, 'm', $event.target.value)">
        <option v-for="(n, i) in monthNames" :key="i" :value="i + 1" :disabled="disabledMonth(+modelValue[part].slice(0, 4), i + 1)">{{ n }}</option>
      </select>
      <label class="visually-hidden" :for="`${id}-${part}-y`">{{ label }} · {{ t('filters.year') }}</label>
      <select :id="`${id}-${part}-y`" class="pp__sel" :value="+modelValue[part].slice(0, 4)" @change="set(part, 'y', $event.target.value)">
        <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
      </select>
    </template>
    <button type="button" class="pp__range" :aria-pressed="range" :title="t('filters.range')" @click="toggleRange">
      {{ range ? t('filters.single') : t('filters.range') }}
    </button>
  </fieldset>
</template>

<style scoped>
.pp {
  display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 0; min-width: 0;
  border: 1px solid var(--line-strong); border-radius: var(--radius-pill); padding: 3px 4px 3px 12px; background: var(--surface);
}
.pp--a { border-color: var(--period-a); background: var(--period-a-bg); }
.pp--b { border-color: var(--period-b); background: var(--period-b-bg); }
.pp__legend { float: left; padding: 0; margin-right: 4px; font-size: 0.85rem; font-weight: 500; }
.pp--a .pp__legend { color: var(--period-a); }
.pp--b .pp__legend { color: var(--period-b); }
.pp__sep { font-size: 0.8rem; }
.pp__sel {
  min-height: 36px; border: 1px solid var(--line); border-radius: var(--radius-pill); background: var(--surface);
  padding: 0 8px; font-size: 0.85rem; color: var(--ink); text-transform: capitalize;
}
.pp__range {
  min-height: 36px; border: 0; background: transparent; color: var(--muted); font-size: 0.8rem; padding: 0 10px; border-radius: var(--radius-pill);
}
.pp__range:hover { color: var(--ink); background: var(--surface-2); }
</style>
