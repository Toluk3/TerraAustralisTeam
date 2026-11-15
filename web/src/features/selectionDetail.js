/**
 * Lógica pura de la ventana de la selección (SelectionWindow): sin DOM ni Vue, para poder probarla.
 */

/**
 * Masa en toneladas → { value, unit, digits } con la unidad que mejor se lee.
 * unit: 'kg' | 't' | 'kt' | 'mt' (la ventana la traduce).
 */
export function fmtMassParts(tons) {
  if (tons == null || Number.isNaN(tons)) return null;
  if (tons < 1) return { value: tons * 1000, unit: 'kg', digits: 0 };
  if (tons < 1e4) return { value: tons, unit: 't', digits: tons < 10 ? 1 : 0 };
  if (tons < 1e6) return { value: tons / 1e3, unit: 'kt', digits: 1 };
  return { value: tons / 1e6, unit: 'mt', digits: 2 };
}

/** CSV exploratorio por mes: las mismas columnas que exportaba el panel del módulo del mapa. */
export function explCsv(rows) {
  const head = 'mes,detecciones,frp_suma_mw,frp_max_mw,dias_con_deteccion,fre_mj,biomasa_t_no_validada,co2_t_no_validado,familia_sensor';
  const lines = rows.map((r) => [r.month, r.detections, r.frpSum.toFixed(1), r.frpMax.toFixed(1), r.activeDays,
    r.fre.toFixed(0), r.biomass.toFixed(3), r.co2.toFixed(3), r.family ?? ''].join(','));
  return [head, ...lines].join('\n');
}

const mIdx = (k) => Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7)) - 1;
const mKey = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;

/**
 * Meses que dibujan los gráficos de la ventana: el período elegido y, si es corto, los meses anteriores
 * hasta completar `min` (para ver el mes en contexto). Nunca antes de `first` (inicio de la serie).
 */
export function chartMonths(period, first, min = 12) {
  if (!period?.from) return [];
  const b = mIdx(period.to ?? period.from);
  let a = Math.min(mIdx(period.from), b - min + 1);
  if (first) a = Math.max(a, mIdx(first));
  a = Math.min(a, b);
  const out = [];
  for (let i = a; i <= b; i++) out.push(mKey(i));
  return out;
}

/** Tope "redondo" del eje y sus líneas de referencia (2 a 4). */
export function chartAxis(max) {
  if (!(max > 0)) return { top: 1, ticks: [] };
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 5, 10].map((k) => (k * pow) / 2).find((st) => max / st <= 4) ?? pow * 5;
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks = [];
  for (let v = step; v <= top + 1e-9; v += step) ticks.push(v);
  return { top, ticks };
}

/** Primer mes con un VIIRS en operación (para comparar sensores solo donde volaron los dos), o null. */
export function viirsStart(meta) {
  return (meta?.platform_periods ?? [])
    .filter((x) => x.kind === 'operación' && !['terra', 'aqua'].includes(x.platform))
    .map((x) => x.valid_from.slice(0, 7)).sort()[0] ?? null;
}
