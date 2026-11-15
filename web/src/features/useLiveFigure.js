/**
 * Dato vivo de la landing: focos equivalentes del último mes de calendar.json, con su mes. Es una cifra
 * armonizada (n_equiv), no un conteo de puntos. También devuelve los años de la serie (meta.coverage).
 */
import { computed, onMounted, shallowRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { loadDataset, calendarRows } from './dataset.js';
import { intlLocale } from '@/stores/ui.js';

export function useLiveFigure() {
  const { t } = useI18n();
  const data = shallowRef(null);
  const error = shallowRef(null);

  onMounted(async () => {
    try {
      const ds = await loadDataset();
      data.value = { meta: ds.meta, rows: calendarRows(ds.calendar) };
    } catch (e) {
      error.value = e;
    }
  });

  const last = computed(() => data.value?.rows.at(-1) ?? null);

  const years = computed(() => {
    const c = data.value?.meta?.coverage;
    if (!c) return null;
    const from = Number(c.from.slice(0, 4));
    const to = Number(c.to.slice(0, 4));
    return { from, to, n: to - from + 1 };
  });

  const liveText = computed(() => {
    if (error.value) return t('home.liveNone');
    const r = last.value;
    if (!r) return t('home.liveWait');
    const n = new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 0 }).format(r.value);
    const month = new Intl.DateTimeFormat(intlLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(r.year, r.month - 1, 1)));
    return t('home.live', { n, month });
  });

  return { data, error, last, years, liveText };
}
