/**
 * Selección de celdas y panel de análisis.
 *
 * - Clic en una celda la selecciona (Mayús + clic la suma o la saca).
 * - Con la herramienta de lazo activa, se dibuja con el mouse: quedan seleccionadas las celdas H3 cuyo
 *   centro cae dentro del dibujo (Mayús + lazo suma a la selección). Esc borra la selección.
 * - La selección y todos los números son siempre de la resolución de la serie (H3 r7), sea cual sea el
 *   zoom: el mismo dibujo da el mismo resultado. Un clic en una celda más gruesa selecciona sus hijas r7,
 *   que es como el pipeline armó esa celda.
 * - El panel suma los meses que se elijan (o "Seguir incendio", que extiende el rango mientras la
 *   selección tenga fuego). La cifra principal son los focos equivalentes con su intervalo p05–p95, el
 *   origen de cada mes y su cobertura; las detecciones son descriptivas y la biomasa, exploratoria.
 *
 * El cálculo está en summary.js.
 */
import { GeoJsonLayer } from '@deck.gl/layers';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { polygonToCells, cellToParent, cellToChildren, cellToBoundary, cellToLatLng, cellArea, cellsToMultiPolygon,
  getHexagonEdgeLengthAvg, getHexagonAreaAvg } from 'h3-js';
import { dayToIso } from './period.js';
import { summarize, seriesInfo, groupByYear, COMBUSTION_COEF, EF_CO2, ORIGIN } from './summary.js';

export { summarize, seriesInfo, COMBUSTION_COEF, EF_CO2 } from './summary.js';

const MAX_CELLS = 300_000;            // celdas r7 (~1,5 millones de km²)
const OUTLINE_MAX_CELLS = 60_000;     // hasta acá se dibuja el borde exacto de las celdas
const MAX_MONTHS = 120;             // rango máximo del panel (10 años)
const FOLLOW_STEPS = 24;              // "Seguir incendio": hasta 24 meses para cada lado
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const ORIGIN_SHORT = { modis: 'directo', viirs: 'VIIRS conv.', terra: 'Terra conv.' };

const nf = (d = 1) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: d });
const fmt = (v, d = 1) => (v == null || Number.isNaN(v) ? '—' : nf(d).format(v));
const mlabel = (m) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const addMonth = (m, k) => {
  const i = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 + k;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
};
const idx = (m) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
const fromIdx = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
const span = (n) => (n % 12 === 0 ? `${n / 12} ${n === 12 ? 'año' : 'años'}` : `${n} ${n === 1 ? 'mes' : 'meses'}`);
const monthsBetween = (a, b) => {
  const out = [];
  for (let m = a; m <= b && out.length < 1000; m = addMonth(m, 1)) out.push(m);
  return out;
};
/** Toneladas con la unidad que se lea mejor. */
export function fmtMass(t) {
  if (t == null) return '—';
  if (t < 1) return `${fmt(t * 1000, 0)} kg`;
  if (t < 1e4) return `${fmt(t, t < 10 ? 1 : 0)} t`;
  if (t < 1e6) return `${fmt(t / 1e3, 1)} mil t`;
  return `${fmt(t / 1e6, 2)} Mt`;
}
/** Intervalo p05–p95; "—" si el valor es observado (sin incertidumbre de conversión) o no hay datos. */
/** Con miles no hacen falta decimales (y el intervalo entra en una línea). */
const fmtN = (v) => fmt(v, Math.abs(v ?? 0) >= 1000 ? 0 : 1);
const fmtRange = (lo, hi) => (lo == null || hi == null || hi - lo < 0.05 ? '—' : `${fmtN(lo)} – ${fmtN(hi)}`);
const pctCov = (c) => (c >= 1 ? '100 %' : `${fmt(c * 100, 0)} %`);

const download = (name, text, type) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/**
 * ctx: { map, root, meta, source, tileRes, cellMonths:Set, pointMonths:Set, getRes(), getPeriodMonths(),
 *        setPeriod(p), rerender(), emit(ev, payload), pickCell(x, y) }
 */
export function createSelection(ctx) {
  const { map, root, meta } = ctx;
  const allMonths = meta.map.months;
  // Resolución del cálculo: la de la serie (o la más fina publicada, si esa no está en el mapa)
  const finest = Math.max(...meta.map.resolutions);
  const CALC = meta.map.resolutions.includes(meta.cell_res) ? meta.cell_res : finest;
  const info = seriesInfo(meta);
  const estMonths = new Set(meta.uncertainty?.res === CALC ? meta.uncertainty.months : []);
  // Escala validada: la región de calibración más fina (r3, ~12.400 km²)
  const levelRes = Number(/^r(\d+)$/.exec(meta.calibration_levels?.[0] ?? 'r3')?.[1] ?? 3);
  const validatedArea = getHexagonAreaAvg(levelRes, 'km2');
  const openState = { main: true, sensors: true, months: false, det: false, expl: true, method: false };
  let chartBy = null;           // 'month' | 'year' elegido en el gráfico; null = según el largo del rango
  let bins = [];                // lo que está dibujado en los gráficos (meses o años)
  // Desde cuándo hay un VIIRS en operación (para comparar los sensores solo donde volaron los dos)
  const viirsStart = (meta.platform_periods ?? []).filter((x) => x.kind === 'operación' && !['terra', 'aqua'].includes(x.platform))
    .map((x) => x.valid_from.slice(0, 7)).sort()[0] ?? null;
  let sel = null;               // { res, cells:Set, rings, outline, bbox, area }
  let mode = false;
  let range = null;             // { from, to } elegido en el panel; null = sigue al período del mapa
  let rangeNote = null;         // aviso si hubo que ajustar lo que se eligió
  // Meses que se pueden elegir: toda la cobertura publicada, tengan o no fuego
  const FIRST = idx(meta.coverage.from.slice(0, 7));
  const LAST = idx(meta.coverage.to.slice(0, 7));
  let summary = null;
  let token = 0;

  // --- DOM ---
  const tool = document.createElement('button');
  tool.type = 'button';
  tool.className = 'tam-map__tool';
  tool.title = 'Dibujar una selección con el mouse (L). Se desactiva al soltar; Mayús suma, Esc borra.';
  tool.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 3c4.4 0 7 2 7 4.5S14.4 12 10 12c-1.2 0-2.3-.1-3.2-.4M3 7.5C3 5 5.6 3 10 3M3 7.5c0 1.4.8 2.6 2.2 3.4M5.2 10.9 4 17l3-3.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><span>Lazo</span>';
  tool.setAttribute('aria-pressed', 'false');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'tam-map__lasso');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  svg.appendChild(path);
  const panel = document.createElement('div');
  panel.className = 'tam-sel';
  panel.hidden = true;
  root.append(tool, svg, panel);

  // --- Lazo ---
  const canvasBox = map.getCanvasContainer();
  let drawing = null;
  const onDown = (ev) => {
    if (!mode || ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const r = canvasBox.getBoundingClientRect();
    drawing = { pts: [[ev.clientX - r.left, ev.clientY - r.top]], add: ev.shiftKey, r };
    canvasBox.setPointerCapture?.(ev.pointerId);
  };
  const onMove = (ev) => {
    if (!drawing) return;
    const p = [ev.clientX - drawing.r.left, ev.clientY - drawing.r.top];
    const q = drawing.pts.at(-1);
    if ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 < 9) return;
    drawing.pts.push(p);
    path.setAttribute('d', `M${drawing.pts.map((x) => x.join(',')).join('L')}Z`);
  };
  const onUp = () => {
    if (!drawing) return;
    const { pts, add } = drawing;
    drawing = null;
    path.setAttribute('d', '');
    // El lazo es de un solo uso: después de dibujar vuelve a moverse el mapa (para otro, apretar Lazo o L)
    setMode(false);
    if (pts.length < 4) {
      // Fue un clic: el pointerdown no llegó a deck.gl, así que la celda se busca acá
      const hit = ctx.pickCell(pts[0][0], pts[0][1]);
      if (hit) clickCell(hit, ctx.getRes(), add);
      return;
    }
    const ring = pts.map((p) => map.unproject(p)).map((ll) => [ll.lng, ll.lat]);
    ring.push(ring[0]);
    selectPolygon(ring, add);
  };
  canvasBox.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  const onKey = (ev) => {
    if (ev.target.closest?.('input, select, textarea')) return;
    if (ev.key === 'Escape') { if (mode && !sel) setMode(false); else clear(); }
    if (ev.key === 'l' || ev.key === 'L') setMode(!mode);
  };
  window.addEventListener('keydown', onKey);
  tool.addEventListener('click', () => setMode(!mode));

  function setMode(on) {
    mode = Boolean(on);
    tool.setAttribute('aria-pressed', String(mode));
    root.classList.toggle('tam-map--lasso', mode);
    for (const h of [map.dragPan, map.boxZoom, map.doubleClickZoom]) (mode ? h.disable() : h.enable());
  }

  /** `cells` y `rings` son la selección completa (ya combinada con la anterior si correspondía). */
  function setSelection(cells, rings) {
    if (!cells.size) { clear(); return; }
    if (cells.size > MAX_CELLS) {
      showMessage(`La selección tiene ${fmt(cells.size, 0)} celdas r${CALC} (máximo ${fmt(MAX_CELLS, 0)}): dibujá un área más chica.`);
      return;
    }
    let area = 0, w = 180, s = 90, e = -180, n = -90;
    for (const c of cells) {
      area += cellArea(c, 'km2');
      const [lat, lng] = cellToLatLng(c);
      w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat);
    }
    // Caja de las celdas: sus centros más dos lados de celda (en longitud, corregido por la latitud)
    const padLat = (getHexagonEdgeLengthAvg(CALC, 'km') / 111) * 2;
    const padLng = padLat / Math.max(0.1, Math.cos((Math.max(Math.abs(s), Math.abs(n)) * Math.PI) / 180));
    // Borde exacto de las celdas elegidas; con selecciones enormes se muestra el dibujo original
    const outline = cells.size <= OUTLINE_MAX_CELLS
      ? { type: 'MultiPolygon', coordinates: cellsToMultiPolygon([...cells], true) }
      : { type: 'MultiPolygon', coordinates: rings.map((r) => [r]) };
    sel = { res: CALC, cells, rings, outline, area, bbox: [w - padLng, s - padLat, e + padLng, n + padLat] };
    panel.hidden = false;
    refresh();
  }

  function selectPolygon(ring, add) {
    const latlng = ring.map(([lng, lat]) => [lat, lng]);
    // Antes de pedir las celdas finas, una cuenta gruesa: un dibujo continental no entra en memoria
    const coarse = Math.max(0, CALC - 3);
    if (polygonToCells(latlng, coarse).length * 7 ** (CALC - coarse) > MAX_CELLS * 1.5) {
      showMessage(`El área dibujada supera las ${fmt(MAX_CELLS, 0)} celdas r${CALC} (~${fmt(MAX_CELLS * getHexagonAreaAvg(CALC, 'km2') / 1e6, 1)} millones de km²): dibujá un área más chica.`);
      return;
    }
    const cells = new Set(polygonToCells(latlng, CALC));
    let rings = [ring];
    if (add && sel) {
      for (const c of sel.cells) cells.add(c);
      rings = [...sel.rings, ring];
    }
    setSelection(cells, rings);
  }

  /** Clic en una celda del mapa (de cualquier resolución): selecciona sus celdas r7; Mayús las suma o las saca. */
  function clickCell(cell, res, shift) {
    const kids = res < CALC ? cellToChildren(cell, CALC) : res > CALC ? [cellToParent(cell, CALC)] : [cell];
    const ring = cellToBoundary(cell, true);
    if (shift && sel) {
      const cells = new Set(sel.cells);
      if (kids.every((c) => cells.has(c))) for (const c of kids) cells.delete(c);
      else for (const c of kids) cells.add(c);
      setSelection(cells, [...sel.rings, ring]);
      return;
    }
    setSelection(new Set(kids), [ring]);
  }

  function clear() {
    sel = null;
    summary = null;
    range = null;
    token++;
    panel.hidden = true;
    ctx.rerender();
    ctx.emit('selection', null);
  }

  function currentMonths() {
    const want = range ? monthsBetween(range.from, range.to) : ctx.getPeriodMonths();
    return want.slice(-MAX_MONTHS);
  }

  /**
   * Fija el rango del panel (índices de mes). `keep` es el extremo que el usuario acaba de tocar ('from' o
   * 'to'): ese no se mueve. Si el rango queda invertido, el otro extremo lo acompaña conservando el largo
   * que había; si supera el máximo, se acorta el otro extremo y se avisa.
   */
  function applyRange(a, b, keep) {
    const clamp = (i) => Math.min(LAST, Math.max(FIRST, i));
    const len = currentMonths().length;
    a = clamp(a); b = clamp(b);
    rangeNote = null;
    if (b < a) {
      if (keep === 'from') b = clamp(a + len - 1); else a = clamp(b - len + 1);
    }
    if (b - a + 1 > MAX_MONTHS) {
      if (keep === 'from') b = a + MAX_MONTHS - 1; else a = b - MAX_MONTHS + 1;
      rangeNote = `El panel suma como mucho ${span(MAX_MONTHS)}: se ajustó "${keep === 'from' ? 'Hasta' : 'Desde'}".`;
    }
    range = { from: fromIdx(a), to: fromIdx(b) };
    refresh();
  }

  async function loadMonths(months) {
    const cellTables = new Map();
    const pointTables = new Map();
    const estTables = new Map();
    // Los focos de una celda están en su tesela madre (así los parte build_mocks.py)
    const tiles = new Set();
    for (const c of sel.cells) tiles.add(cellToParent(c, ctx.tileRes));
    const ratios = estMonths.size && ctx.source.getEstRatios ? await ctx.source.getEstRatios() : null;
    await Promise.all(months.map(async (m) => {
      if (ctx.cellMonths.has(m)) cellTables.set(m, await ctx.source.getCells(CALC, m));
      if (ratios?.reps && estMonths.has(m)) estTables.set(m, await ctx.source.getEst(m));
      if (!ctx.pointMonths.has(m)) return;
      const idx = await ctx.source.getPointIndex(m);
      const need = Object.keys(idx.tiles).filter((t) => tiles.has(t));
      pointTables.set(m, await Promise.all(need.map((t) => ctx.source.getPoints(m, t))));
    }));
    return { cellTables, pointTables, extra: { info, estTables, ratios: ratios?.reps ? ratios : null } };
  }

  async function refresh() {
    const my = ++token;
    const months = currentMonths();
    renderPanel(true);
    ctx.rerender();
    try {
      const { cellTables, pointTables, extra } = await loadMonths(months);
      if (my !== token) return;
      summary = summarize(sel, months, cellTables, pointTables, extra);
      ctx.rerender();
      renderPanel(false);
      ctx.emit('selection', { res: sel.res, cells: [...sel.cells], area: sel.area, ...summary,
        fireCellIds: [...summary.fireCellIds] });
    } catch (e) {
      if (my === token) showMessage(`No se pudieron cargar los datos: ${e.message}`);
    }
  }

  /** Extiende el rango hacia atrás y adelante mientras la selección tenga fuego (valor armonizado > 0). */
  async function follow() {
    const months = currentMonths();
    const my = ++token;
    renderPanel(true);
    const hasFire = async (m) => {
      if (!ctx.cellMonths.has(m)) return false;
      const t = await ctx.source.getCells(CALC, m);
      for (let i = 0; i < t.length; i++) if (sel.cells.has(t.cell[i]) && t.n_equiv[i] > 0) return true;
      return false;
    };
    let from = months[0], to = months.at(-1);
    for (let k = 0; k < FOLLOW_STEPS && from > allMonths[0] && (await hasFire(addMonth(from, -1))); k++) from = addMonth(from, -1);
    for (let k = 0; k < FOLLOW_STEPS && to < allMonths.at(-1) && (await hasFire(addMonth(to, 1))); k++) to = addMonth(to, 1);
    if (my !== token) return;
    if (idx(to) - idx(from) + 1 > MAX_MONTHS) from = fromIdx(idx(to) - MAX_MONTHS + 1);
    rangeNote = null;
    range = { from, to };
    refresh();
  }

  function showMessage(msg) {
    panel.hidden = false;
    const box = panel.querySelector('.tam-sel__msg');
    if (box) box.textContent = msg;
    else panel.innerHTML = `<div class="tam-sel__head"><b>Selección</b><button type="button" class="tam-sel__x" aria-label="Cerrar">×</button></div><p class="tam-sel__msg">${msg}</p>`;
    panel.querySelector('.tam-sel__x')?.addEventListener('click', clear);
  }

  // --- Panel ---
  // --- Gráficos ---
  /** Tope "redondo" del eje y sus líneas de referencia (2 a 4). */
  function axis(max) {
    if (!(max > 0)) return { top: 1, ticks: [] };
    const pow = 10 ** Math.floor(Math.log10(max));
    const step = [1, 2, 5, 10].map((k) => (k * pow) / 2).find((st) => max / st <= 4) ?? pow * 5;
    const top = Math.ceil(max / step - 1e-9) * step;
    const ticks = [];
    for (let v = step; v <= top + 1e-9; v += step) ticks.push(v);
    return { top, ticks };
  }
  const fmtTick = (v) => (v >= 1e6 ? `${fmt(v / 1e6, 1)} M` : v >= 10000 ? `${fmt(v / 1000, 0)} mil` : fmt(v, v < 10 ? 1 : 0));

  /** Marcas del eje horizontal: años (en enero) o, en rangos cortos, primer, medio y último mes. */
  function xLabels(by) {
    const n = bins.length;
    let marks = [];
    if (by === 'year') marks = bins.map((b, i) => [i, b.year]);
    else {
      marks = bins.map((b, i) => [i, b.month]).filter(([, m]) => m.endsWith('-01')).map(([i, m]) => [i, m.slice(0, 4)]);
      if (n <= 14 || marks.length < 2) marks = [...new Set([0, Math.floor((n - 1) / 2), n - 1])].map((i) => [i, mlabel(bins[i].month)]);
    }
    const every = Math.ceil(marks.length / 6);
    return marks.filter((_, k) => k % every === 0)
      .map(([i, text]) => `<span style="left:${((i + 0.5) / n) * 100}%">${text}</span>`).join('');
  }

  const plot = (kind, top, ticks, inner, height) => `
    <div class="tam-chart__plot" data-plot="${kind}" style="height:${height}px">
      ${ticks.map((v) => `<div class="tam-chart__grid" style="bottom:${(v / top) * 100}%"><span>${fmtTick(v)}</span></div>`).join('')}
      <svg viewBox="0 0 ${bins.length} 100" preserveAspectRatio="none" aria-hidden="true">${inner}</svg>
      <div class="tam-chart__cursor" hidden></div>
    </div>`;

  /**
   * Dos gráficos alineados mes a mes (o año a año en rangos largos):
   *   1. Fuego: focos equivalentes con su intervalo. Es la serie citable.
   * Los dos son líneas escalonadas (un escalón por período): no se enciman por más meses que haya.
   *   2. Qué detectó cada satélite: detecciones crudas de MODIS y de VIIRS, que explican por qué hace falta
   *      una escala común.
   * Al pasar el mouse se leen los valores del período debajo; un clic lleva el mapa a ese período.
   */
  function charts(rows) {
    const canGroup = rows.length > 24;
    // Siempre por mes, que es lo que se eligió en Desde / Hasta; por año solo si se pide con el botón
    const by = canGroup && chartBy === 'year' ? 'year' : 'month';
    bins = by === 'year' ? groupByYear(rows) : rows.map((r) => ({ ...r, from: r.month, to: r.month }));
    const label = (b) => (by === 'year' ? (b.months < 12 ? `${b.year} (${b.months} ${b.months === 1 ? 'mes' : 'meses'})` : b.year) : mlabel(b.month));
    const unit = by === 'year' ? 'año' : 'mes';

    // 1. Focos equivalentes
    const a1 = axis(Math.max(...bins.map((b) => Math.max(b.nEquiv, b.hi ?? 0))));
    const y1 = (v) => 100 - (v / a1.top) * 100;
    // Línea escalonada (un tramo por período, del color de su origen), con el intervalo como banda detrás
    // y una franja de fondo en los períodos de cobertura parcial
    const bars1 = bins.map((b, i) => (b.coverage < 1 ? `<rect x="${i}" y="0" width="1" height="100" class="tam-chart__partial"/>` : '')).join('')
      + bins.map((b, i) => (fmtRange(b.lo, b.hi) === '—' ? '' : `<rect x="${i}" y="${y1(b.hi)}" width="1" height="${y1(b.lo) - y1(b.hi)}" class="tam-chart__band"/>`)).join('')
      + bins.map((b, i) => `<polyline class="tam-chart__line tam-chart__line--${b.origin === 'modis' ? 'obs' : 'conv'}" points="${i},${y1(bins[Math.max(0, i - 1)].nEquiv)} ${i},${y1(b.nEquiv)} ${i + 1},${y1(b.nEquiv)}"/>`).join('');
    const peak = bins.reduce((best, b) => (b.nEquiv > (best?.nEquiv ?? 0) ? b : best), null);
    const withFire = bins.filter((b) => b.nEquiv > 0).length;
    const cap1 = peak
      ? `Pico en <b>${label(peak)}</b> con ${fmtN(peak.nEquiv)} focos equivalentes; ${withFire} de ${bins.length} ${by === 'year' ? 'años' : 'meses'} con fuego.`
      : 'Sin fuego en la selección en este período.';
    const keys1 = ['<span><i class="tam-chart__k tam-chart__k--obs"></i>MODIS directo</span>'];
    if (bins.some((b) => b.origin !== 'modis')) keys1.push('<span><i class="tam-chart__k tam-chart__k--conv"></i>convertido a escala MODIS</span>');
    if (bins.some((b) => fmtRange(b.lo, b.hi) !== '—')) keys1.push('<span><i class="tam-chart__k tam-chart__k--band"></i>intervalo p05–p95</span>');
    if (bins.some((b) => b.coverage < 1)) keys1.push('<span><i class="tam-chart__k tam-chart__k--partial"></i>cobertura parcial</span>');

    // 2. Detecciones por sensor
    const a2 = axis(Math.max(...bins.map((b) => Math.max(b.detModis, b.detViirs))));
    const y2 = (v) => 100 - (v / a2.top) * 100;
    const step = (key, cls) => `<polyline class="tam-chart__line tam-chart__line--${cls}" points="${bins.map((b, i) => `${i},${y2(b[key])} ${i + 1},${y2(b[key])}`).join(' ')}"/>`;
    const bars2 = step('detViirs', 'viirs') + step('detModis', 'modis');
    // Cociente solo donde operaban los dos sensores
    const both = rows.filter((r) => viirsStart && r.month >= viirsStart);
    const sm = both.reduce((x, r) => x + r.detModis, 0), sv = both.reduce((x, r) => x + r.detViirs, 0);
    const since = viirsStart ? mlabel(viirsStart) : null;
    const cap2 = sm > 0 && sv > 0
      ? `VIIRS detectó <b>${fmt(sv / sm, 1)} veces</b> lo que MODIS${both.length < rows.length ? ` desde ${since}` : ''}: ve fuegos más chicos. Por eso la serie de arriba lleva todo a una escala común.`
      : !both.length && since ? `En este período solo hay MODIS: VIIRS opera desde ${since}.`
        : 'Sin detecciones de los dos sensores para comparar en este período.';

    return `
      <div class="tam-chart" data-by="${by}">
        <div class="tam-chart__head"><b>Fuego por ${unit}</b><span>focos equivalentes</span>
          ${canGroup ? `<button type="button" data-act="chart-${by === 'year' ? 'month' : 'year'}" title="Cambiar el agrupado del gráfico">${by === 'year' ? 'Ver por mes' : 'Ver por año'}</button>` : ''}</div>
        <p class="tam-chart__cap">${cap1}</p>
        ${plot('eq', a1.top, a1.ticks, bars1, 104)}
        <div class="tam-chart__x">${xLabels(by)}</div>
        <div class="tam-chart__keys">${keys1.join('')}</div>
        <div class="tam-chart__read" aria-live="polite">Pasá el mouse por un ${unit} para ver sus valores; un clic lo muestra en el mapa.</div>
        <details class="tam-chart__sensors" data-k="sensors" ${openState.sensors ? 'open' : ''}>
          <summary><b>Qué detectó cada satélite</b><span>detecciones crudas</span></summary>
          <p class="tam-chart__cap">${cap2}</p>
          ${plot('det', a2.top, a2.ticks, bars2, 60)}
          <div class="tam-chart__x">${xLabels(by)}</div>
          <div class="tam-chart__keys"><span><i class="tam-chart__k tam-chart__k--modis"></i>MODIS</span><span><i class="tam-chart__k tam-chart__k--viirs"></i>VIIRS</span></div>
        </details>
      </div>`;
  }

  /** Lectura al pasar el mouse (una línea que cruza los dos gráficos) y clic para llevar el mapa a ese período. */
  function wireCharts() {
    const box = panel.querySelector('.tam-chart');
    if (!box) return;
    const by = box.dataset.by;
    const read = box.querySelector('.tam-chart__read');
    const idle = read.innerHTML;
    const cursors = [...box.querySelectorAll('.tam-chart__cursor')];
    const at = (ev, el) => {
      const r = el.getBoundingClientRect();
      return Math.min(bins.length - 1, Math.max(0, Math.floor(((ev.clientX - r.left) / r.width) * bins.length)));
    };
    const show = (i) => {
      const b = bins[i];
      for (const c of cursors) { c.hidden = false; c.style.left = `${(i / bins.length) * 100}%`; c.style.width = `${100 / bins.length}%`; }
      const range = fmtRange(b.lo, b.hi);
      const origin = b.origin === 'mixto' ? 'parte directo, parte convertido' : ORIGIN[b.origin];
      read.innerHTML = `<b>${by === 'year' ? b.year + (b.months < 12 ? ` (${b.months} meses)` : '') : mlabel(b.month)}</b>
        <span><i class="tam-chart__k tam-chart__k--obs"></i>${fmtN(b.nEquiv)} focos eq.${range === '—' ? '' : ` (${range})`}</span>
        <span><i class="tam-chart__k tam-chart__k--modis"></i>MODIS ${fmt(b.detModis, 0)}</span>
        <span><i class="tam-chart__k tam-chart__k--viirs"></i>VIIRS ${fmt(b.detViirs, 0)}</span>
        <small>${origin}${b.coverage < 1 ? ` · cobertura ${pctCov(b.coverage)}` : ''}</small>`;
    };
    for (const el of box.querySelectorAll('.tam-chart__plot')) {
      el.addEventListener('pointermove', (ev) => show(at(ev, el)));
      el.addEventListener('pointerleave', () => { for (const c of cursors) c.hidden = true; read.innerHTML = idle; });
      el.addEventListener('click', (ev) => {
        const b = bins[at(ev, el)];
        // El panel conserva su rango aunque el mapa pase a mostrar solo ese período
        if (!range) { const m = currentMonths(); range = { from: m[0], to: m.at(-1) }; }
        ctx.setPeriod({ from: b.from, to: b.to });
      });
    }
  }

  /** Mes y año por separado (un solo desplegable tenía un renglón por cada mes de la serie). */
  function monthPicker(key, label, m) {
    const y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)) - 1;
    const months = MESES.map((name, i) => {
      const out = y * 12 + i < FIRST || y * 12 + i > LAST;
      return `<option value="${i}"${i === mo ? ' selected' : ''}${out ? ' disabled' : ''}>${name}</option>`;
    }).join('');
    let years = '';
    for (let yy = Math.floor(FIRST / 12); yy <= Math.floor(LAST / 12); yy++) years += `<option${yy === y ? ' selected' : ''}>${yy}</option>`;
    return `<div class="tam-sel__pick"><span>${label}</span>
      <div><select data-r="${key}-m" aria-label="${label}: mes">${months}</select><select data-r="${key}-y" aria-label="${label}: año">${years}</select></div></div>`;
  }

  /** Avisos sobre qué tan citable es la cifra principal. */
  function notices(t) {
    const out = [];
    const parts = [];
    if (t.convertedMonths) parts.push(`${t.convertedMonths} ${t.convertedMonths === 1 ? 'mes convertido' : 'meses convertidos'} a escala MODIS`);
    if (t.partialMonths) parts.push(`${t.partialMonths} con cobertura parcial (valor subestimado)`);
    if (parts.length) out.push(`Incluye ${parts.join(' y ')}.`);
    if (t.convertedMonths && t.lo == null) out.push('Esta publicación no trae los datos para el intervalo de los meses convertidos.');
    if (sel.area < validatedArea) {
      out.push(`Selección por debajo de la escala validada (~${fmt(validatedArea, 0)} km², una región de calibración): tomar como indicativo.`);
    }
    return out.map((x) => `<p class="tam-sel__warn">${x}</p>`).join('');
  }

  let focusKey = null;
  function renderPanel(loading) {
    if (!sel) return;
    const months = currentMonths();
    const t = summary?.total;
    const det = (k) => (openState[k] ? 'open' : '');
    const body = loading || !summary
      ? '<p class="tam-sel__msg">Calculando…</p>'
      : `
      <div class="tam-sel__hero">
        <div><span class="tam-sel__big">${fmtN(t.nEquiv)}</span><span class="tam-sel__lbl">focos equivalentes (escala MODIS)</span></div>
        ${fmtRange(t.lo, t.hi) === '—' ? '' : `<div><span class="tam-sel__mid">${fmtRange(t.lo, t.hi)}</span><span class="tam-sel__lbl">intervalo p05–p95</span></div>`}
      </div>
      ${notices(t)}
      ${summary.rows.length > 1 ? charts(summary.rows) : ''}
      <dl class="tam-sel__grid">
        <dt>Área seleccionada</dt><dd>${fmt(sel.area, 0)} km²</dd>
        <dt>Celdas con fuego</dt><dd>${fmt(t.fireCells, 0)} de ${fmt(sel.cells.size, 0)}</dd>
        <dt>Área de celdas con fuego</dt><dd>${fmt(t.fireArea, 0)} km² <small>(no es área quemada)</small></dd>
        <dt>Meses con fuego</dt><dd>${fmt(t.monthsWithFire, 0)} de ${fmt(summary.rows.length, 0)}</dd>
        <dt>Mes pico</dt><dd>${t.peakMonth ? `${mlabel(t.peakMonth.month)} · ${fmt(t.peakMonth.nEquiv)} focos eq.` : '—'}</dd>
      </dl>
      <details class="tam-sel__sec" data-k="months" ${det('months')}><summary>Detalle por mes</summary>
        <table><thead><tr><th>Mes</th><th>Focos eq.</th><th>p05–p95</th><th>MODIS</th><th>VIIRS</th><th>Origen</th><th>Cob.</th></tr></thead>
        <tbody>${summary.rows.map((r) => `<tr><td>${mlabel(r.month)}</td><td>${fmt(r.nEquiv)}</td><td>${fmtRange(r.lo, r.hi)}</td><td>${fmt(r.detModis, 0)}</td><td>${fmt(r.detViirs, 0)}</td>
          <td title="${ORIGIN[r.origin]}">${ORIGIN_SHORT[r.origin]}</td><td>${pctCov(r.coverage)}</td></tr>`).join('')}</tbody></table>
      </details>
      <details class="tam-sel__sec" data-k="det" ${det('det')}><summary>Detecciones (descriptivo)</summary>
        <p>Focos de FIRMS dentro de las celdas. No son comparables entre sensores ni entre años
          (VIIRS ve varias veces más píxeles que MODIS): para comparar, usar los focos equivalentes.</p>
        <dl class="tam-sel__grid">
          <dt>Detecciones crudas</dt><dd>${fmt(t.detections, 0)} <small>(${fmt(t.dayDet, 0)} día · ${fmt(t.nightDet, 0)} noche)</small></dd>
          <dt>Por plataforma</dt><dd>${Object.entries(t.byPlatform).map(([k, v]) => `${k} ${fmt(v, 0)}`).join(' · ') || '—'}</dd>
          <dt>FRP mediana / p90 / máx</dt><dd>${fmt(t.frpMedian)} / ${fmt(t.frpP90)} / ${fmt(t.frpMax)} MW</dd>
          <dt>Días con detección</dt><dd>${fmt(t.activeDays, 0)}</dd>
          <dt>Primera / última</dt><dd>${t.first != null ? `${dayToIso(t.first)} / ${dayToIso(t.last)}` : '—'}</dd>
          <dt>Centroide (pond. FRP)</dt><dd>${t.centroid ? `${t.centroid[1].toFixed(4)}, ${t.centroid[0].toFixed(4)}` : '—'}</dd>
        </dl>
      </details>
      <details class="tam-sel__sec tam-sel__expl" data-k="expl" ${det('expl')}><summary>Exploratorio: biomasa y CO₂</summary>
        <div class="tam-sel__hero">
          <div><span class="tam-sel__mid tam-sel__mid--expl">${fmtMass(t.biomass)}</span><span class="tam-sel__lbl">biomasa quemada (materia seca)</span></div>
          <div><span class="tam-sel__mid">${fmtMass(t.co2)}</span><span class="tam-sel__lbl">CO₂ emitido</span></div>
        </div>
        <p><b>Estimación de primer orden, no validada.</b> Para un mismo día, calcularla con MODIS o con VIIRS
          cambia el resultado típicamente ×2 y hasta ×10. Sirve para órdenes de magnitud, no para citar.</p>
        <dl class="tam-sel__grid">
          <dt>FRE total</dt><dd>${fmt(t.fre / 1e6, 2)} TJ</dd>
          <dt>Día pico (FRE)</dt><dd>${t.peak ? `${dayToIso(t.peak.day)} · ${fmtMass((t.peak.fre * COMBUSTION_COEF) / 1000)}` : '—'}</dd>
          <dt>ΣFRP</dt><dd>${fmt(t.frpSum, 0)} MW</dd>
        </dl>
        <p>FRE = Σ días (ΣFRP de una familia de sensores ÷ pasadas nominales) × 86 400 s; biomasa = FRE ×
          ${COMBUSTION_COEF} kg/MJ (Wooster et al. 2005); CO₂ = biomasa × ${EF_CO2} kg/kg (Andreae 2019). Las pasadas no
          capturan el ciclo diurno, una detección aislada se extiende a todo el día y los fuegos chicos, cortos o
          bajo nubes no se ven.</p>
        <div class="tam-sel__actions"><button type="button" data-act="csv-expl">CSV exploratorio</button></div>
      </details>
      <details class="tam-sel__sec" data-k="method" ${det('method')}><summary>Método y limitaciones</summary>
        <p><b>Focos equivalentes</b>: serie armonizada del pipeline (métrica <code>${meta.metric ?? '—'}</code>), sumada sobre
          las celdas H3 r${CALC} con el centro dentro de la selección y los meses elegidos. Miden actividad de fuego
          detectada por satélite, no superficie quemada ni emisiones.</p>
        <p><b>Escala MODIS</b>: MODIS tiene la historia larga (2000–2021) y es la referencia. Desde
          ${meta.switch_date} la serie usa VIIRS multiplicado por un factor k calibrado en los años en que volaron
          juntos; antes de Aqua (2002), Terra sola con su propio factor.</p>
        <p><b>Intervalo p05–p95</b>: bootstrap de k (${meta.uncertainty?.reps ?? '—'} réplicas). Solo refleja la incertidumbre
          de la conversión: no incluye el error de aplicar un k regional a pocas celdas, que domina en
          selecciones chicas. Un mes MODIS directo no tiene intervalo.</p>
        <p><b>Cobertura</b>: fracción del mes con datos de la plataforma de la serie; con menos de 100 % el valor
          está subestimado.</p>
        <p>Datos ${meta.dataset_version ?? '—'} · configuración ${meta.config_hash ?? '—'}.</p>
      </details>
      <div class="tam-sel__actions">
        <button type="button" data-act="csv">CSV</button>
        <button type="button" data-act="json">JSON</button>
        <button type="button" data-act="cells">Celdas</button>
      </div>`;
    panel.innerHTML = `
      <details data-k="main" ${det('main')}>
        <summary class="tam-sel__head"><b>Selección · ${fmt(sel.cells.size, 0)} celda${sel.cells.size === 1 ? '' : 's'} r${sel.res}</b>
          <button type="button" class="tam-sel__x" aria-label="Borrar selección" title="Borrar selección (Esc)">×</button></summary>
        <div class="tam-sel__range">
          ${monthPicker('from', 'Desde', months[0])}
          ${monthPicker('to', 'Hasta', months.at(-1))}
        </div>
        <div class="tam-sel__step">
          <button type="button" data-act="prev" title="Mover el rango hacia atrás"${idx(months[0]) <= FIRST ? ' disabled' : ''} aria-label="Rango anterior">◀</button>
          <span><b>${span(months.length)}</b>${range ? '' : ' · período del mapa'}</span>
          <button type="button" data-act="next" title="Mover el rango hacia adelante"${idx(months.at(-1)) >= LAST ? ' disabled' : ''} aria-label="Rango siguiente">▶</button>
          <span class="tam-sel__presets">${[12, 36, 120].filter((n) => n <= MAX_MONTHS).map((n) =>
            `<button type="button" data-act="last-${n}" title="Los ${span(n)} que terminan en ${mlabel(months.at(-1))}"${months.length === n ? ' aria-pressed="true"' : ''}>${span(n)}</button>`).join('')}</span>
        </div>
        ${rangeNote ? `<p class="tam-sel__warn">${rangeNote}</p>` : ''}
        <div class="tam-sel__range-actions">
          <button type="button" data-act="follow" title="Extiende el rango mientras la selección tenga fuego">Seguir incendio</button>
          <button type="button" data-act="show" title="Muestra en el mapa la suma de estos meses">Ver en el mapa</button>
          ${range ? '<button type="button" data-act="sync" title="Volver al período de la barra de tiempo">Usar período del mapa</button>' : ''}
        </div>
        ${body}
      </details>`;
    for (const d of panel.querySelectorAll('details[data-k]')) {
      d.addEventListener('toggle', () => { openState[d.dataset.k] = d.open; });
    }
    panel.querySelector('.tam-sel__x').addEventListener('click', (e) => { e.preventDefault(); clear(); });
    const picked = (key) => Number(panel.querySelector(`[data-r=${key}-y]`).value) * 12
      + Number(panel.querySelector(`[data-r=${key}-m]`).value);
    for (const s of panel.querySelectorAll('select[data-r]')) {
      s.addEventListener('change', () => {
        focusKey = s.dataset.r;
        applyRange(picked('from'), picked('to'), s.dataset.r.startsWith('from') ? 'from' : 'to');
      });
    }
    // El panel se vuelve a dibujar con cada cambio: el foco vuelve al control que se estaba usando
    if (focusKey) panel.querySelector(`[data-r=${focusKey}], [data-act=${focusKey}]`)?.focus({ preventScroll: true });
    panel.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => action(b.dataset.act)));
    wireCharts();
  }

  const num = (v, d) => (v == null ? '' : v.toFixed(d));
  function action(act) {
    const months = currentMonths();
    const name = `seleccion_r${sel.res}_${months[0]}_${months.at(-1)}`;
    const provenance = { zone: meta.zone, dataset_version: meta.dataset_version, config_hash: meta.config_hash,
      metric: meta.metric, reference: meta.reference, switch_date: meta.switch_date };
    const a = idx(months[0]), b = idx(months.at(-1)), n = months.length;
    if (act === 'prev' || act === 'next' || act.startsWith('last-')) focusKey = act;
    if (act === 'follow') follow();
    else if (act.startsWith('chart-')) { chartBy = act.slice(6); focusKey = null; renderPanel(false); }
    else if (act === 'prev') { const d = Math.min(n, a - FIRST); applyRange(a - d, b - d, 'from'); }
    else if (act === 'next') { const d = Math.min(n, LAST - b); applyRange(a + d, b + d, 'to'); }
    else if (act.startsWith('last-')) applyRange(b - Number(act.slice(5)) + 1, b, 'to');
    else if (act === 'show') ctx.setPeriod({ from: months[0], to: months.at(-1) });
    else if (act === 'sync') { range = null; rangeNote = null; refresh(); }
    else if (act === 'csv' && summary) {
      const head = 'mes,focos_equivalentes,p05,p95,origen,cobertura,celdas_con_fuego,detecciones_modis,detecciones_viirs,dias_con_deteccion,metrica,version_datos,config_hash';
      const lines = summary.rows.map((r) => [r.month, r.nEquiv.toFixed(3), num(r.lo, 3), num(r.hi, 3), r.origin,
        r.coverage.toFixed(3), r.fireCells, r.detModis, r.detViirs, r.activeDays, meta.metric ?? '', meta.dataset_version ?? '',
        meta.config_hash ?? ''].join(','));
      download(`${name}.csv`, [head, ...lines].join('\n'), 'text/csv');
    } else if (act === 'csv-expl' && summary) {
      const head = 'mes,detecciones,frp_suma_mw,frp_max_mw,dias_con_deteccion,fre_mj,biomasa_t_no_validada,co2_t_no_validado,familia_sensor';
      const lines = summary.rows.map((r) => [r.month, r.detections, r.frpSum.toFixed(1), r.frpMax.toFixed(1), r.activeDays,
        r.fre.toFixed(0), r.biomass.toFixed(3), r.co2.toFixed(3), r.family ?? ''].join(','));
      download(`${name}_exploratorio.csv`, [head, ...lines].join('\n'), 'text/csv');
    } else if (act === 'json' && summary) {
      const t = summary.total;
      const series = ({ month, nEquiv, lo, hi, origin, coverage, fireCells, detModis, detViirs }) =>
        ({ month, n_equiv: nEquiv, p05: lo, p95: hi, origin, coverage_frac: coverage, fire_cells: fireCells,
          detections_modis: detModis, detections_viirs: detViirs });
      download(`${name}.json`, JSON.stringify({
        ...provenance,
        h3_res: sel.res, cells: [...sel.cells], selected_area_km2: sel.area, months,
        below_validated_scale: sel.area < validatedArea, validated_area_km2: validatedArea,
        interval: meta.uncertainty ? `p05–p95, ${meta.uncertainty.source}; solo la incertidumbre de k` : null,
        total: { n_equiv: t.nEquiv, p05: t.lo, p95: t.hi, fire_cells: t.fireCells, fire_cells_area_km2: t.fireArea,
          months_with_fire: t.monthsWithFire, peak_month: t.peakMonth, converted_months: t.convertedMonths,
          partial_coverage_months: t.partialMonths },
        monthly: summary.rows.map(series),
        detections: { note: 'descriptivo: no comparable entre sensores ni entre años', total: t.detections,
          day: t.dayDet, night: t.nightDet, by_platform: t.byPlatform, frp_median_mw: t.frpMedian, frp_p90_mw: t.frpP90,
          frp_max_mw: t.frpMax, days_with_detection: t.activeDays,
          first: t.first != null ? dayToIso(t.first) : null, last: t.last != null ? dayToIso(t.last) : null,
          centroid_lon_lat: t.centroid },
        exploratory: { note: 'biomasa y CO2: estimación de primer orden, no validada; no citar',
          combustion_coefficient_kg_per_mj: COMBUSTION_COEF, ef_co2_kg_per_kg: EF_CO2,
          fre: 'sum over local days of (sum FRP of one sensor family / nominal overpasses) * 86400 s',
          fre_mj: t.fre, biomass_t: t.biomass, co2_t: t.co2, frp_sum_mw: t.frpSum,
          peak_day: t.peak ? { day: dayToIso(t.peak.day), fre_mj: t.peak.fre } : null },
      }, null, 2), 'application/json');
    } else if (act === 'cells') {
      download(`${name}_celdas.txt`, [...sel.cells].join('\n'), 'text/plain');
    }
  }

  // --- Capas ---
  function layers(beforeId) {
    if (!sel) return [];
    const out = [new GeoJsonLayer({
      id: 'selection-outline', beforeId, pickable: false, stroked: true, filled: true,
      data: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: sel.outline }] },
      getFillColor: [0, 190, 255, 30], getLineColor: [0, 190, 255, 240], lineWidthUnits: 'pixels', getLineWidth: 2,
    })];
    if (summary?.fireCellIds.size) {
      out.push(new H3HexagonLayer({
        id: 'selection-cells', data: [...summary.fireCellIds], beforeId, pickable: false, extruded: false,
        filled: false, stroked: true, getHexagon: (d) => d, getLineColor: [0, 190, 255, 255],
        lineWidthUnits: 'pixels', getLineWidth: 1.5,
      }));
    }
    return out;
  }

  return {
    layers,
    clickCell,
    selectPolygon,
    clear,
    setMode,
    isLasso: () => mode,
    /** El período del mapa cambió: si el panel sigue al mapa, recalcular. */
    periodChanged() { if (sel && !range) refresh(); },
    setRange(r) { range = r; rangeNote = null; if (sel) refresh(); },
    get: () => (sel ? { res: sel.res, cells: [...sel.cells], area: sel.area, summary } : null),
    destroy() {
      canvasBox.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    },
  };
}
