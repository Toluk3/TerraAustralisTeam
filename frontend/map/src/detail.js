import { cellToParent, latLngToCell } from 'h3-js';

const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const fmt = (value) => (value == null || !Number.isFinite(Number(value)) ? 'Sin dato' : number.format(value));
const PLATFORM = { terra: 'Terra', aqua: 'Aqua', snpp: 'Suomi-NPP', noaa20: 'NOAA-20', noaa21: 'NOAA-21' };
let detailRequestToken = 0;
const monthLabel = (month) => {
  const [year, value] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('es-AR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, value - 1, 1)));
};

async function cellHistory(source, meta, resolution, cell, endMonth) {
  const tileRes = meta.points?.tile_res;
  if (!Number.isInteger(tileRes) || tileRes > resolution) return [];
  const months = meta.map.months.filter((month) => month <= endMonth).slice(-24);
  const series = await source.getCellSeries(resolution, cellToParent(cell, tileRes));
  const values = new Map();
  for (let i = 0; i < series.length; i++) {
    if (series.cell[i] === cell) values.set(series.month[i], series.n_equiv[i]);
  }
  return months.map((month) => ({ month, value: values.get(month) ?? null }));
}

async function frpHistory(source, meta, resolution, cell, endMonth) {
  const tileRes = meta.points?.tile_res;
  if (!Number.isInteger(tileRes) || tileRes > resolution) return [];
  const tile = cellToParent(cell, tileRes);
  const months = meta.points.months.filter((month) => month <= endMonth).slice(-12);
  return Promise.all(months.map(async (month) => {
    const index = await source.getPointIndex(month);
    if (!index.tiles?.[tile]) return { month, value: null, samples: 0 };
    const points = await source.getPoints(month, tile);
    let total = 0, samples = 0;
    for (let i = 0; i < points.length; i++) {
      if (latLngToCell(points.lat[i], points.lon[i], resolution) !== cell) continue;
      const value = points.frp[i];
      if (Number.isFinite(value)) { total += value; samples++; }
    }
    return { month, value: samples ? total / samples : null, samples };
  }));
}

function chartSvg(history, { ariaLabel, unit }) {
  if (!history.length || history.every((item) => item.value == null)) {
    return '<p class="detail-chart-note">No hay una serie celular publicada para este período. Un valor ausente no se interpreta como cero.</p>';
  }
  const width = 640, height = 220, left = 48, right = 18, top = 18, bottom = 40;
  const values = history.map((item) => item.value).filter((value) => value != null);
  const max = Math.max(...values, 1);
  const x = (index) => left + index * (width - left - right) / Math.max(1, history.length - 1);
  const y = (value) => height - bottom - value * (height - top - bottom) / max;
  const paths = [];
  let segment = [];
  history.forEach((item, index) => {
    if (item.value == null) {
      if (segment.length) paths.push(segment);
      segment = [];
    } else {
      segment.push(`${x(index).toFixed(1)},${y(item.value).toFixed(1)}`);
    }
  });
  if (segment.length) paths.push(segment);
  const lines = paths.filter((path) => path.length > 1)
    .map((path) => `<polyline class="detail-chart__line" points="${path.join(' ')}"/>`).join('');
  const points = history.map((item, index) => item.value == null ? ''
    : `<circle class="detail-chart__point" cx="${x(index)}" cy="${y(item.value)}" r="3.5"><title>${escapeHtml(monthLabel(item.month))}: ${fmt(item.value)} ${escapeHtml(unit)}</title></circle>`)
    .join('');
  const first = escapeHtml(monthLabel(history[0].month));
  const last = escapeHtml(monthLabel(history[history.length - 1].month));
  return `<svg class="detail-chart" viewBox="0 0 ${width} ${height}" role="img"
      aria-label="${escapeHtml(ariaLabel)}">
    <line class="detail-chart__axis" x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}"/>
    <line class="detail-chart__axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"/>
    <line class="detail-chart__axis" x1="${left}" y1="${y(max / 2)}" x2="${width - right}" y2="${y(max / 2)}"/>
    <text x="${left - 8}" y="${top + 4}" text-anchor="end">${fmt(max)}</text>
    <text x="${left - 8}" y="${y(max / 2) + 4}" text-anchor="end">${fmt(max / 2)}</text>
    <text x="${left - 8}" y="${height - bottom + 4}" text-anchor="end">0</text>
    ${lines}${points}
    <text x="${left}" y="${height - 12}">${first}</text>
    <text x="${width - right}" y="${height - 12}" text-anchor="end">${last}</text>
  </svg>`;
}

function stats(items) {
  return `<div class="detail-stats">${items.map(([label, value, note = '']) => `
    <div class="detail-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>
      ${note ? `<small>${escapeHtml(note)}</small>` : ''}</div>`).join('')}</div>`;
}

function renderCellInfo(info, history) {
  const period = info.period?.from ?? '';
  return `<div class="detail-content">
    <p class="detail-kicker">Celda espacial · H3 r${escapeHtml(info.res)}</p>
    <h2 class="detail-title" id="detail-title">Actividad armonizada</h2>
    <p class="detail-subtitle">Celda ${escapeHtml(info.cell)} · ${escapeHtml(period)}</p>
    ${stats([
      ['Focos equivalentes', fmt(info.total), 'Estimación armonizada del período'],
      ['Promedio mensual', fmt(info.monthlyMean), 'n_equiv por mes'],
      ['Anomalía', info.anomaly == null ? 'No disponible' : `${info.anomaly >= 0 ? '+' : ''}${fmt(info.anomaly * 100)} %`, 'Contra la mediana de ese mes'],
      ['Resolución', `H3 r${info.res}`, 'La escala espacial depende del zoom'],
    ])}
    <h3 class="detail-chart-heading">Evolución de esta celda</h3>
    <p class="detail-chart-note">Valores mensuales de la serie armonizada (n_equiv). Los huecos indican que no hay un valor publicado; no equivalen a cero.</p>
    ${chartSvg(history, { ariaLabel: 'Valores mensuales de la serie armonizada en la celda seleccionada', unit: 'focos equivalentes' })}
    <p class="detail-disclaimer">La serie es una estimación calibrada entre sensores, no un conteo de detecciones ni una medición directa de superficie quemada. Los valores ausentes no prueban ausencia de fuego.</p>
  </div>`;
}

function renderPointInfo(info, cell, resolution, history, frpTimeline) {
  const footprint = info.scanKm != null && info.trackKm != null
    ? `${fmt(info.scanKm)} × ${fmt(info.trackKm)} km` : 'Sin dato';
  return `<div class="detail-content">
    <p class="detail-kicker">Detección satelital · ${escapeHtml(info.sensor || 'FIRMS')}</p>
    <h2 class="detail-title" id="detail-title">Observación de foco de calor</h2>
    <p class="detail-subtitle">${escapeHtml(info.localDate)} · ${escapeHtml(info.datetimeUtc?.slice(11, 16))} UTC · ${info.isDay ? 'día' : 'noche'}</p>
    ${stats([
      ['Potencia radiativa (FRP)', `${fmt(info.frp)} MW`, 'Observación instantánea del producto FIRMS'],
      ['Temperatura IR media', info.tMir == null ? 'Sin dato' : `${fmt(info.tMir)} K`, 'Canal infrarrojo medio'],
      ['Temperatura IR térmica', info.tTir == null ? 'Sin dato' : `${fmt(info.tTir)} K`, 'Canal térmico'],
      ['Huella nominal del píxel', footprint, 'Scan × track; no es área quemada'],
      ['Plataforma', PLATFORM[info.platform] ?? info.platform ?? 'Sin dato', info.sensor || ''],
      ['Confianza FIRMS', info.confidence ?? 'Sin dato', 'Categoría del producto fuente'],
    ])}
    <h3 class="detail-chart-heading">Contexto temporal de la celda</h3>
    <p class="detail-chart-note">Serie armonizada mensual en H3 r${escapeHtml(resolution)} alrededor de la detección; distinta de la potencia FRP observada en este punto.</p>
    ${chartSvg(history, { ariaLabel: 'Valores mensuales de la serie armonizada en la celda seleccionada', unit: 'focos equivalentes' })}
    <h3 class="detail-chart-heading">FRP media observada por mes</h3>
    <p class="detail-chart-note">Promedio en MW de las detecciones FIRMS dentro de esta celda H3, últimos 12 meses disponibles. No está armonizado: la mezcla de sensores y la cobertura pueden cambiar.</p>
    ${chartSvg(frpTimeline, { ariaLabel: 'FRP media observada por mes en detecciones de la celda seleccionada', unit: 'MW de FRP media' })}
    <p class="detail-disclaimer">FRP es potencia radiativa (MW) estimada por el sensor en el instante de observación; no representa energía total, perímetro, área quemada ni confirmación de un incendio. La huella del píxel describe la observación satelital, no el tamaño del fuego.</p>
  </div>`;
}

export async function showDetail({ dialog, content, source, meta, map, info }) {
  const token = ++detailRequestToken;
  dialog.showModal();
  content.innerHTML = '<p class="detail-loading">Cargando contexto temporal de la celda…</p>';
  const resolution = info.res ?? map.getState().res;
  const cell = info.cell;
  const month = info.kind === 'cell' ? info.period.from.slice(0, 7) : info.localDate.slice(0, 7);
  try {
    const [history, physicalHistory] = await Promise.all([
      cellHistory(source, meta, resolution, cell, month),
      info.kind === 'point' ? frpHistory(source, meta, resolution, cell, month) : [],
    ]);
    if (token !== detailRequestToken || !dialog.open) return;
    content.innerHTML = info.kind === 'cell'
      ? renderCellInfo(info, history)
      : renderPointInfo(info, cell, resolution, history, physicalHistory);
  } catch (error) {
    if (token !== detailRequestToken || !dialog.open) return;
    const fallback = info.kind === 'cell' ? renderCellInfo(info, []) : renderPointInfo(info, cell, resolution, [], []);
    content.innerHTML = fallback.replace(
      '<h3 class="detail-chart-heading">',
      `<p class="detail-error">No se pudo cargar la serie histórica: ${escapeHtml(error.message)}</p><h3 class="detail-chart-heading">`,
    );
  }
}
