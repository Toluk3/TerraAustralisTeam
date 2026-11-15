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
