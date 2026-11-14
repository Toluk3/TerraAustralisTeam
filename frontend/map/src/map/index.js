/**
 * Módulo del mapa: MapLibre GL (open source) con mapas base de OpenStreetMap y una capa de deck.gl
 * intercalada en el mismo contexto WebGL, que muestra la zona analizada, la grilla H3 con el valor
 * armonizado y los focos de FIRMS. No necesita claves.
 *
 *   import { createFireMap, createStaticSource } from './map/index.js';
 *   const map = await createFireMap(el, { source: createStaticSource('/mock-api'), period: { from: '2025-02' } });
 *   map.setPeriod({ from: '2025-01-15', to: '2025-02-10' });
 *   map.on('click', (info) => console.log(info));
 *
 * Escala a zonas grandes (varios países): las celdas se bajan por mes y los focos por tesela H3 r2 y mes,
 * solo las que se ven en pantalla y hasta `pointBudget` focos.
 *
 * Regla de producto: los números son siempre de la serie armonizada (n_equiv). Los puntos se dibujan
 * para ver dónde y cuándo hubo fuego, pero nunca se cuentan.
 */
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { polygonToCells, gridDisk, cellToLatLng, latLngToCell } from 'h3-js';
import { aggregateCells, hexLayer, maskLayer, outlineBounds, outlineLayer, pointsLayer } from './layers.js';
import { VIRIDIS, PUOR, FIRE, FRP_MAX, ANOMALY_MAX, gradientCss } from './colors.js';
import { normalizePeriod, periodLabel, toDay, dayToIso, ym } from './period.js';
import { BASEMAPS, resolveBasemap } from './basemaps.js';
import './map.css';

export { createStaticSource, createApiSource } from './data.js';
export { BASEMAPS } from './basemaps.js';

/**
 * Resolución H3 según el zoom de MapLibre (ARQUITECTURA.md §4.4). MapLibre usa teselas de 512 px,
 * así que su zoom es uno menos que el de Google Maps para la misma escala:
 * Google ≤ 6 → r5, 7–8 → r6, ≥ 9 → r7.
 */
export const zoomToRes = (zoom) => (zoom < 6 ? 5 : zoom < 8 ? 6 : 7);
const RES_AREA = { 5: '≈ 250 km²', 6: '≈ 36 km²', 7: '≈ 5 km²' };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const SENSOR = { terra: 'MODIS', aqua: 'MODIS', snpp: 'VIIRS', noaa20: 'VIIRS', noaa21: 'VIIRS' };

const nf = (digits = 1) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: digits });
const fmt = (v, digits = 1) => (v == null ? '—' : nf(digits).format(v));
const pct = (a) => (a == null ? '—' : `${a >= 0 ? '+' : ''}${nf(0).format(a * 100)} %`);
const monthKey = (m) => `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;

const DEFAULTS = {
  basemap: 'claro',            // clave de BASEMAPS, URL de un estilo de MapLibre o un objeto de estilo
  metric: 'value',             // 'value' (focos equivalentes) | 'anomaly' (contra la mediana, solo un mes)
  hexOpacity: 0.75,
  maskOpacity: 0.35,
  fadeOldPoints: true,
  labelsOnTop: true,           // las etiquetas del mapa base quedan encima de las celdas
  pointBudget: 400_000,        // máximo de focos cargados a la vez; se priorizan las teselas del centro
  maxCellMonths: 36,           // períodos más largos se pintan con los últimos N meses (y se avisa)
  layers: { cells: true, points: true, outline: true, mask: true },
};

/** Primera capa de etiquetas del estilo: las capas de deck.gl se insertan antes, así no las tapan. */
function firstSymbolLayer(map) {
  return map.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
}

/** Teselas H3 de los focos que tocan la vista actual. */
function visibleTiles(map, res) {
  const b = map.getBounds();
  const w = Math.max(-180, b.getWest()), e = Math.min(180, b.getEast());
  const s = Math.max(-85, b.getSouth()), n = Math.min(85, b.getNorth());
  // H3 interpreta mal polígonos de más de 180° de ancho: con zoom muy lejano se parte la vista
  const cuts = e - w > 170 ? [[w, (w + e) / 2], [(w + e) / 2, e]] : [[w, e]];
  const cells = cuts.flatMap(([a, z]) => polygonToCells([[s, a], [s, z], [n, z], [n, a], [s, a]], res));
  // polygonToCells solo devuelve las celdas con el centro adentro: se suma un anillo para los bordes
  const out = new Set(cells);
  if (cells.length < 400) for (const c of cells) for (const x of gridDisk(c, 1)) out.add(x);
  // Vista más chica que una tesela: ninguna tiene el centro adentro, se usa la del centro y sus vecinas
  const c = map.getCenter();
  for (const x of gridDisk(latLngToCell(c.lat, c.lng, res), 1)) out.add(x);
  return out;
}

export async function createFireMap(container, options = {}) {
  const opts = { ...DEFAULTS, ...options, layers: { ...DEFAULTS.layers, ...options.layers } };
  if (!opts.source) throw new Error('Falta source: createStaticSource() o createApiSource()');

  // --- DOM ---
  const root = document.createElement('div');
  root.className = 'tam-map';
  root.innerHTML = `
    <div class="tam-map__canvas"></div>
    <div class="tam-map__badges" aria-live="polite"></div>
    <div class="tam-map__legend"></div>
    <div class="tam-map__status" hidden></div>`;
  container.appendChild(root);
  const $ = (s) => root.querySelector(s);

  const listeners = {};
  const emit = (ev, payload) => (listeners[ev] || []).forEach((cb) => cb(payload));
  const status = (msg) => {
    $('.tam-map__status').hidden = !msg;
    $('.tam-map__status').textContent = msg || '';
  };

  // --- Datos iniciales ---
  status('Cargando datos…');
  const meta = await opts.source.getMeta();
  const switchDay = toDay(meta.switch_date);
  const reduced = new Map(meta.reduced_coverage_months.map((r) => [ym(r.year, r.month), r.coverage_frac]));
  const firstDay = toDay(meta.coverage.from);
  const lastDay = toDay(meta.coverage.to);
  const cellMonths = new Set(meta.map.months);
  const pointMonths = new Set(meta.points.months);
  const tileRes = meta.points.tile_res;
  const pointsMinZoom = meta.points.min_zoom ?? 0;
  const bbox = outlineBounds(meta.outline);

  // --- MapLibre ---
  const map = new maplibregl.Map({
    container: $('.tam-map__canvas'),
    style: resolveBasemap(opts.basemap),
    bounds: bbox,
    fitBoundsOptions: { padding: 24 },
    minZoom: 2,
    maxZoom: 14,
    attributionControl: false,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
  map.addControl(new maplibregl.AttributionControl({
    compact: true,
    customAttribution: `Focos: <a href="https://www.earthdata.nasa.gov/data/tools/firms" target="_blank" rel="noopener">${
      meta.attribution.replace(/\s*https?:\/\/\S+/g, '').replace(/\.\s*$/, '')}</a>`,
  }), 'bottom-right');

  const overlay = new MapboxOverlay({
    interleaved: true,
    getTooltip: (info) => tooltip(info),
    onClick: (info) => info.picked && emit('click', describe(info)),
    onHover: (info) => emit('hover', info.picked ? describe(info) : null),
  });
  map.addControl(overlay);

  await new Promise((resolve, reject) => {
    if (map.loaded()) resolve();
    map.once('load', resolve);
    map.once('error', (e) => (map.loaded() ? null : reject(e.error ?? e)));
  }).catch((e) => {
    status(`No se pudo cargar el mapa base: ${e.message ?? e}`);
    throw e;
  });
  // El contenedor puede cambiar de tamaño (p. ej. al aparecer la barra de tiempo): reajustar y, si el
  // usuario todavía no movió el mapa, volver a encuadrar la zona.
  let userMoved = false;
  map.once('dragstart', () => { userMoved = true; });
  map.once('wheel', () => { userMoved = true; });
  const ro = new ResizeObserver(() => {
    map.resize();
    if (!userMoved) map.fitBounds(bbox, { padding: 24, animate: false });
  });
  ro.observe(root);

  // --- Estado ---
  const state = {
    period: normalizePeriod(opts.period ?? { from: meta.coverage.to.slice(0, 7) }),
    res: zoomToRes(map.getZoom()),
    metric: opts.metric,
    hexOpacity: opts.hexOpacity,
    fade: opts.fadeOldPoints,
    layers: { ...opts.layers },
    beforeId: opts.labelsOnTop ? firstSymbolLayer(map) : undefined,
    cells: { key: null, rows: [], months: 0, clipped: false },
    points: { chunks: [], zoomedOut: false, truncated: false, total: 0, periodVisible: 0 },
  };
  const tables = new Map(); // `${res}|${mes}` → tabla de celdas, `p|${mes}|${tesela}` → tabla de focos
  let loadToken = 0;

  /** Meses del período, como 'YYYY-MM'. Para las celdas, como mucho los últimos maxCellMonths. */
  function periodMonths(max = Infinity) {
    const { m0, m1 } = state.period;
    const from = Math.max(m0, m1 - max + 1);
    const out = [];
    for (let m = from; m <= m1; m++) out.push(monthKey(m));
    return { months: out, clipped: from > m0 };
  }

  async function loadCells(token) {
    const { res } = state;
    const { months, clipped } = periodMonths(opts.maxCellMonths);
    const key = `${res}|${months[0]}|${months.at(-1)}`;
    if (state.cells.key === key) return;
    const want = months.filter((m) => cellMonths.has(m));
    const list = await Promise.all(want.map(async (m) => {
      const k = `${res}|${m}`;
      if (!tables.has(k)) tables.set(k, await opts.source.getCells(res, m));
      return tables.get(k);
    }));
    if (token !== loadToken) return;
    state.cells = { key, rows: aggregateCells(list, months.length), months: months.length, clipped };
  }

  async function loadPoints(token) {
    if (!state.layers.points) return;
    if (map.getZoom() < pointsMinZoom) {
      state.points = { chunks: [], zoomedOut: true, truncated: false, total: 0, periodVisible: 0 };
      return;
    }
    const months = periodMonths().months.filter((m) => pointMonths.has(m));
    const tiles = visibleTiles(map, tileRes);
    const [lat0, lng0] = [map.getCenter().lat, map.getCenter().lng];
    // Candidatos: teselas visibles con focos, de la más cercana al centro a la más lejana
    const candidates = [];
    for (const m of months) {
      const idx = await opts.source.getPointIndex(m);
      for (const [tile, count] of Object.entries(idx.tiles)) {
        if (!tiles.has(tile)) continue;
        const [la, lo] = cellToLatLng(tile);
        candidates.push({ m, tile, count, dist: (la - lat0) ** 2 + (lo - lng0) ** 2 });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    const chosen = [];
    let total = 0;
    let truncated = false;
    for (const c of candidates) {
      if (total + c.count > opts.pointBudget) { truncated = true; continue; }
      chosen.push(c);
      total += c.count;
    }
    const chunks = await Promise.all(chosen.map(async ({ m, tile }) => {
      const k = `p|${m}|${tile}`;
      if (!tables.has(k)) tables.set(k, await opts.source.getPoints(m, tile));
      return { id: `${m}-${tile}`, table: tables.get(k) };
    }));
    if (token !== loadToken) return;
    const visibleChunks = chunks.filter((c) => c.table.length);
    const periodVisible = visibleChunks.reduce((count, chunk) => {
      for (let i = 0; i < chunk.table.length; i++) {
        if (chunk.table.d[i] >= state.period.d0 && chunk.table.d[i] <= state.period.d1) count++;
      }
      return count;
    }, 0);
    state.points = { chunks: visibleChunks, zoomedOut: false, truncated, total, periodVisible };
  }

  async function ensureData() {
    const token = ++loadToken;
    const slow = setTimeout(() => token === loadToken && status('Cargando datos…'), 250);
    try {
      await Promise.all([loadCells(token), loadPoints(token)]);
    } catch (e) {
      status(`No se pudieron cargar los datos: ${e.message}`);
      emit('error', e);
      throw e;
    } finally {
      clearTimeout(slow);
    }
    if (token === loadToken) status(null);
  }

  function effectiveMetric() {
    return state.metric === 'anomaly' && state.period.nMonths === 1 ? 'anomaly' : 'value';
  }

  function render() {
    const { res, period, layers: vis, beforeId } = state;
    const metric = effectiveMetric();
    const layers = [
      maskLayer(meta.outline, { visible: vis.mask, opacity: opts.maskOpacity, beforeId }),
      hexLayer(state.cells.rows, { res, domain: meta.map.domain[res] ?? 1, metric, opacity: state.hexOpacity,
        visible: vis.cells, beforeId }),
      outlineLayer(meta.outline, { visible: vis.outline, beforeId }),
      // Los focos van encima de todo, etiquetas incluidas
      ...state.points.chunks.map((c) =>
        pointsLayer(c.id, c.table, { d0: period.d0, d1: period.d1, fade: state.fade, visible: vis.points })),
    ];
    overlay.setProps({ layers });
    renderLegend(metric);
    renderBadges(metric);
    emit('change', getState());
  }

  async function update() {
    render(); // lo que ya está en caché se ve enseguida (el filtro de fecha de los focos corre en la GPU)
    try {
      await ensureData();
      render();
    } catch { /* el error ya se mostró en el mapa */ }
  }

  // --- Leyenda y marcas ---
  function renderLegend(metric) {
    const { res } = state;
    const domain = meta.map.domain[res] ?? 1;
    const tick = (t) => fmt(Math.expm1(t * Math.log1p(domain)), domain < 10 ? 1 : 0);
    const cells = metric === 'anomaly'
      ? `<div class="tam-legend__title">Anomalía del mes contra su mediana</div>
         <div class="tam-legend__bar" style="background:${gradientCss(PUOR)}"></div>
         <div class="tam-legend__ticks"><span>−100 %</span><span>mediana</span><span>+${ANOMALY_MAX * 100} %</span></div>
         <div class="tam-legend__note"><i class="tam-swatch" style="background:#a0a0a0"></i>sin mediana (casi nunca hubo fuego)</div>`
      : `<div class="tam-legend__title">Focos equivalentes por mes</div>
         <div class="tam-legend__bar" style="background:${gradientCss(VIRIDIS)}"></div>
         <div class="tam-legend__ticks"><span>0</span><span>${tick(0.5)}</span><span>${tick(1)}+</span></div>`;
    const legend = $('.tam-map__legend');
    // Plegable: en pantallas chicas arranca cerrada y después respeta lo que elija el usuario
    if (legend.dataset.open == null) legend.dataset.open = root.clientWidth > 600 ? '1' : '0';
    legend.innerHTML = `<details ${legend.dataset.open === '1' ? 'open' : ''}><summary>Leyenda</summary>
      ${state.layers.cells ? `${cells}<div class="tam-legend__note">Celda H3 r${res} (${RES_AREA[res]}) · serie armonizada MODIS + VIIRS</div>` : ''}
      ${state.layers.points ? `
        <div class="tam-legend__title">Focos detectados · FRP (MW)</div>
        <div class="tam-legend__bar" style="background:${gradientCss(FIRE)}"></div>
        <div class="tam-legend__ticks"><span>0</span><span>${Math.round(Math.sqrt(FRP_MAX))}</span><span>${FRP_MAX}+</span></div>
        <div class="tam-legend__note">Ubicación de cada detección. No se cuentan: el valor es el de las celdas.</div>` : ''}
      </details>`;
    legend.querySelector('details').addEventListener('toggle', (e) => { legend.dataset.open = e.target.open ? '1' : '0'; });
  }

  function renderBadges(metric) {
    const { period } = state;
    const out = [];
    if (period.d1 >= switchDay) {
      out.push(`<span class="tam-badge tam-badge--est">Estimado desde VIIRS × k (desde ${dayToIso(switchDay)})</span>`);
    }
    for (let m = period.m0; m <= period.m1; m++) {
      if (reduced.has(m)) {
        out.push(`<span class="tam-badge tam-badge--warn">Cobertura reducida: ${MESES[m % 12]} ${Math.floor(m / 12)} (${Math.round(reduced.get(m) * 100)} %)</span>`);
      }
    }
    if (period.d0 > lastDay || period.d1 < firstDay) {
      out.push('<span class="tam-badge tam-badge--warn">Sin datos publicados para este período</span>');
    }
    if (state.metric === 'anomaly' && metric !== 'anomaly') {
      out.push('<span class="tam-badge">La anomalía es por mes: elegí un solo mes para verla</span>');
    }
    if (state.cells.clipped) {
      out.push(`<span class="tam-badge">Celdas: últimos ${opts.maxCellMonths} meses del período</span>`);
    }
    if (state.layers.points && state.points.zoomedOut) {
      out.push(`<span class="tam-badge">Acercá el mapa para ver los focos</span>`);
    } else if (state.layers.points && state.points.truncated) {
      out.push('<span class="tam-badge">Focos parciales: se muestran los del centro, acercá para ver todos</span>');
    }
    $('.tam-map__badges').innerHTML = `<span class="tam-badge tam-badge--period">${periodLabel(period)}</span>${out.join('')}`;
  }

  // --- Picking ---
  function describe(info) {
    const id = info.layer?.id ?? '';
    if (id === 'cells') {
      const d = info.object;
      return { kind: 'cell', cell: d.cell, res: state.res, total: d.total, monthlyMean: d.value, anomaly: d.anomaly,
        period: { from: state.period.from, to: state.period.to } };
    }
    if (id.startsWith('points-')) {
      const t = info.layer.props.data.src;
      const i = info.index;
      return { kind: 'point', lat: t.lat[i], lon: t.lon[i], cell: latLngToCell(t.lat[i], t.lon[i], state.res),
        res: state.res, datetimeUtc: new Date(t.t[i] * 1000).toISOString(),
        localDate: dayToIso(t.d[i]), frp: t.frp[i], tMir: t.t_mir?.[i] ?? null, tTir: t.t_tir?.[i] ?? null,
        scanKm: t.scan?.[i] ?? null, trackKm: t.track?.[i] ?? null, isDay: Boolean(t.day[i]),
        sensor: SENSOR[t.platform[i]] ?? '', platform: t.platform[i], confidence: t.conf[i] };
    }
    return null;
  }

  function tooltip(info) {
    if (!info.picked) return null;
    const d = describe(info);
    if (!d) return null;
    const html = d.kind === 'cell'
      ? `<b>${fmt(d.total)} focos equivalentes</b>
         ${state.cells.months > 1 ? `<br>${fmt(d.monthlyMean)} por mes en promedio` : ''}
         ${d.anomaly != null ? `<br>Anomalía: ${pct(d.anomaly)} contra la mediana del mes` : ''}
         <br><small>${periodLabel(state.period)} · H3 r${d.res} ${d.cell}</small>`
      : `<b>Foco del ${d.localDate}</b> (${d.isDay ? 'día' : 'noche'})
         <br>FRP ${fmt(d.frp)} MW · ${d.datetimeUtc.slice(11, 16)} UTC
         <br><small>${d.sensor} · ${d.platform} · confianza ${d.confidence}</small>`;
    return { html, className: 'tam-tooltip' };
  }

  // --- Movimiento del mapa ---
  map.on('zoom', () => {
    const res = zoomToRes(map.getZoom());
    if (res !== state.res) {
      state.res = res;
      emit('resolution', res);
      update();
    }
  });
  // Al mover el mapa cambian las teselas de focos visibles
  let moveTimer = null;
  map.on('moveend', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(update, 150);
  });

  // --- API pública ---
  function getState() {
    return { period: { from: state.period.from, to: state.period.to }, res: state.res, metric: effectiveMetric(),
      requestedMetric: state.metric, hexOpacity: state.hexOpacity, layers: { ...state.layers },
      estimated: state.period.d1 >= switchDay, cells: state.cells.rows.length,
      points: { tiles: state.points.chunks.length, loaded: state.points.total, periodVisible: state.points.periodVisible,
        zoomedOut: state.points.zoomedOut, truncated: state.points.truncated } };
  }

  const api = {
    map, overlay, meta,
    getState,
    setPeriod(p) { state.period = normalizePeriod(p); return update(); },
    setMetric(m) { state.metric = m === 'anomaly' ? 'anomaly' : 'value'; render(); },
    setHexOpacity(x) { state.hexOpacity = Math.min(1, Math.max(0, x)); render(); },
    setLayerVisible(name, on) { state.layers[name] = Boolean(on); return update(); },
    setFadeOldPoints(on) { state.fade = Boolean(on); render(); },
    /** Cambia el mapa base sin perder las capas: clave de BASEMAPS, URL o estilo de MapLibre. */
    setBasemap(b) {
      return new Promise((resolve) => {
        map.once('style.load', () => {
          state.beforeId = opts.labelsOnTop ? firstSymbolLayer(map) : undefined;
          render();
          resolve();
        });
        map.setStyle(resolveBasemap(b));
      });
    },
    fitZone() { map.fitBounds(bbox, { padding: 24 }); },
    on(ev, cb) { (listeners[ev] ||= []).push(cb); return () => { listeners[ev] = listeners[ev].filter((x) => x !== cb); }; },
    destroy() { ro.disconnect(); map.removeControl(overlay); map.remove(); root.remove(); },
  };

  await update();
  emit('ready', getState());
  return api;
}

export const basemapOptions = () => Object.entries(BASEMAPS).map(([id, b]) => ({ id, label: b.label }));
