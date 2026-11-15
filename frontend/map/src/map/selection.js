/**
 * Selección de celdas y panel de análisis.
 *
 * - Clic en una celda la selecciona (Mayús + clic la suma o la saca).
 * - Con la herramienta de lazo activa, se dibuja con el mouse: quedan seleccionadas las celdas H3 cuyo
 *   centro cae dentro del dibujo (Mayús + lazo suma a la selección). Esc borra la selección.
 * - El panel suma los meses que se elijan (o "Seguir incendio", que extiende el rango mientras la
 *   selección tenga fuego) y muestra, mes a mes y en total, el valor armonizado, las detecciones crudas y
 *   una estimación de biomasa quemada a partir de la energía radiativa del fuego (FRE).
 *
 * Biomasa (estimación de primer orden, no es un producto validado):
 *   1. Por día local y dentro de la selección se suma el FRP de una sola familia de sensores (MODIS si ese
 *      día hubo detecciones MODIS, si no VIIRS), para no contar dos veces el mismo fuego.
 *   2. FRP medio diario = ΣFRP / pasadas nominales del día (2 por satélite activo ese mes: día y noche).
 *   3. FRE diaria (MJ) = FRP medio (MW) × 86 400 s.
 *   4. Biomasa (kg materia seca) = FRE × 0,368 kg/MJ (Wooster et al. 2005, JGR 110, D24311).
 *   5. CO₂ ≈ biomasa × 1,6 kg/kg (factor medio de Andreae 2019, ACP 19, 8523).
 *   Sesgos: las pasadas de mediodía/tarde sobrestiman el ciclo diurno; los fuegos chicos o cortos entre
 *   pasadas y bajo nubes no se ven (subestima). Tomarlo como orden de magnitud (±50 % o más).
 */
import { GeoJsonLayer } from '@deck.gl/layers';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { polygonToCells, latLngToCell, cellToParent, cellToBoundary, cellArea, getHexagonEdgeLengthAvg } from 'h3-js';
import { dayToIso } from './period.js';

export const COMBUSTION_COEF = 0.368; // kg de materia seca por MJ (Wooster et al. 2005)
export const EF_CO2 = 1.6;            // kg de CO₂ por kg de materia seca (Andreae 2019)
const MODIS = new Set(['terra', 'aqua']);
const MAX_CELLS = 300_000;
const MAX_MONTHS = 36;
const FOLLOW_STEPS = 24;              // "Seguir incendio": hasta 24 meses para cada lado
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const nf = (d = 1) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: d });
const fmt = (v, d = 1) => (v == null || Number.isNaN(v) ? '—' : nf(d).format(v));
const mlabel = (m) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const addMonth = (m, k) => {
  const i = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 + k;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
};
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
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo);
}

/**
 * Resume la selección en los meses pedidos. Pura: recibe las tablas ya bajadas.
 *   sel          { res, cells: Set<string>, bbox: [w, s, e, n] }
 *   cellTables   Map mes → tabla de celdas en sel.res
 *   pointTables  Map mes → tablas de focos de las teselas que tocan la selección
 */
export function summarize(sel, months, cellTables, pointTables) {
  const [w, s, e, n] = sel.bbox;
  const fireCells = new Set();
  const frps = [];
  const byPlatform = {};
  const total = { nEquiv: 0, detections: 0, dayDet: 0, nightDet: 0, frpSum: 0, fre: 0, biomass: 0, activeDays: 0,
    first: null, last: null, peak: null, cx: 0, cy: 0 };
  const rows = [];
  for (const m of months) {
    const row = { month: m, nEquiv: 0, fireCells: 0, detections: 0, frpSum: 0, frpMax: 0, fre: 0, biomass: 0, co2: 0,
      activeDays: 0, family: null };
    const ct = cellTables.get(m);
    const monthCells = new Set();
    if (ct) {
      for (let i = 0; i < ct.length; i++) {
        if (sel.cells.has(ct.cell[i])) {
          row.nEquiv += ct.n_equiv[i];
          monthCells.add(ct.cell[i]);
          fireCells.add(ct.cell[i]);
        }
      }
    }
    row.fireCells = monthCells.size;
    // Satélites activos ese mes (en todas las teselas bajadas, no solo en la selección)
    const active = { MODIS: new Set(), VIIRS: new Set() };
    const days = new Map(); // d → { MODIS: ΣFRP, VIIRS: ΣFRP }
    for (const t of pointTables.get(m) ?? []) {
      for (let i = 0; i < t.length; i++) {
        const fam = MODIS.has(t.platform[i]) ? 'MODIS' : 'VIIRS';
        active[fam].add(t.platform[i]);
        const lat = t.lat[i], lon = t.lon[i];
        if (lon < w || lon > e || lat < s || lat > n) continue;
        if (!sel.cells.has(latLngToCell(lat, lon, sel.res))) continue;
        const frp = t.frp[i] ?? 0;
        row.detections++;
        row.frpSum += frp;
        if (frp > row.frpMax) row.frpMax = frp;
        frps.push(frp);
        byPlatform[t.platform[i]] = (byPlatform[t.platform[i]] ?? 0) + 1;
        if (t.day[i]) total.dayDet++; else total.nightDet++;
        total.cx += lon * frp; total.cy += lat * frp;
        const d = t.d[i];
        if (total.first == null || d < total.first) total.first = d;
        if (total.last == null || d > total.last) total.last = d;
        const acc = days.get(d) ?? { MODIS: 0, VIIRS: 0 };
        acc[fam] += frp;
        days.set(d, acc);
      }
    }
    const fams = new Set();
    for (const [d, acc] of days) {
      const fam = acc.MODIS > 0 ? 'MODIS' : 'VIIRS';
      fams.add(fam);
      const overpasses = 2 * Math.max(1, active[fam].size);
      const fre = (acc[fam] / overpasses) * 86400; // MJ
      row.fre += fre;
      if (!total.peak || fre > total.peak.fre) total.peak = { day: d, fre };
    }
    row.activeDays = days.size;
    row.family = [...fams].join(' + ') || null;
    row.biomass = (row.fre * COMBUSTION_COEF) / 1000; // t
    row.co2 = row.biomass * EF_CO2;
    rows.push(row);
    total.nEquiv += row.nEquiv; total.detections += row.detections; total.frpSum += row.frpSum;
    total.fre += row.fre; total.biomass += row.biomass; total.activeDays += row.activeDays;
  }
  frps.sort((a, b) => a - b);
  let fireArea = 0;
  for (const c of fireCells) fireArea += cellArea(c, 'km2');
  const { cx, cy, ...rest } = total;
  return {
    months, rows,
    total: {
      ...rest,
      co2: total.biomass * EF_CO2,
      fireCells: fireCells.size,
      fireArea,
      frpMax: frps.at(-1) ?? null,
      frpMedian: quantile(frps, 0.5),
      frpP90: quantile(frps, 0.9),
      byPlatform,
      centroid: total.frpSum > 0 ? [cx / total.frpSum, cy / total.frpSum] : null,
    },
    fireCellIds: fireCells,
  };
}

/** Polígono dibujado (en [lng, lat]) → celdas H3 con el centro adentro. */
function lassoToCells(ring, res) {
  return polygonToCells(ring.map(([lng, lat]) => [lat, lng]), res);
}

function boundsOf(rings, padDeg) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const r of rings) for (const [lng, lat] of r) {
    w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat);
  }
  return [w - padDeg, s - padDeg, e + padDeg, n + padDeg];
}

const download = (name, text, type) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/**
 * ctx: { map, root, meta, source, tileRes, cellMonths:Set, pointMonths:Set, getRes(), getPeriodMonths(),
 *        setPeriod(p), rerender(), emit(ev, payload) }
 */
export function createSelection(ctx) {
  const { map, root, meta } = ctx;
  const allMonths = meta.map.months;
  let sel = null;               // { res, cells:Set, rings, bbox, area }
  let mode = false;
  let range = null;             // { from, to } elegido en el panel; null = sigue al período del mapa
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

  function setSelection(res, cells, rings, add) {
    if (add && sel && sel.res === res) {
      for (const c of sel.cells) cells.add(c);
      rings = [...sel.rings, ...rings];
    }
    if (!cells.size) { clear(); return; }
    if (cells.size > MAX_CELLS) {
      showMessage(`La selección tiene ${fmt(cells.size, 0)} celdas r${res}: alejá el mapa (resolución más gruesa) o dibujá un área más chica.`);
      return;
    }
    let area = 0;
    for (const c of cells) area += cellArea(c, 'km2');
    const pad = (getHexagonEdgeLengthAvg(res, 'km') / 111) * 1.5;
    sel = { res, cells, rings, area, bbox: boundsOf(rings, pad) };
    panel.hidden = false;
    refresh();
  }

  function selectPolygon(ring, add) {
    const res = ctx.getRes();
    setSelection(res, new Set(lassoToCells(ring, res)), [ring], add);
  }

  /** Clic en una celda: la selecciona, o con Mayús la suma o la saca. */
  function clickCell(cell, res, shift) {
    if (shift && sel && sel.res === res) {
      const cells = new Set(sel.cells);
      const rings = sel.rings.filter((r) => r.cell !== cell);
      if (cells.has(cell)) cells.delete(cell);
      else { cells.add(cell); rings.push(cellRing(cell)); }
      sel = null;
      setSelection(res, cells, rings, false);
      return;
    }
    setSelection(res, new Set([cell]), [cellRing(cell)], false);
  }
  const cellRing = (cell) => {
    const r = cellToBoundary(cell, true);
    r.cell = cell;
    return r;
  };

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

  async function loadMonths(months, res, withPoints) {
    const cellTables = new Map();
    const pointTables = new Map();
    const tiles = new Set();
    if (withPoints) for (const c of sel.cells) tiles.add(cellToParent(c, ctx.tileRes));
    await Promise.all(months.map(async (m) => {
      if (ctx.cellMonths.has(m)) cellTables.set(m, await ctx.source.getCells(res, m));
      if (!withPoints || !ctx.pointMonths.has(m)) return;
      const idx = await ctx.source.getPointIndex(m);
      const need = Object.keys(idx.tiles).filter((t) => tiles.has(t));
      pointTables.set(m, await Promise.all(need.map((t) => ctx.source.getPoints(m, t))));
    }));
    return { cellTables, pointTables };
  }

  async function refresh() {
    const my = ++token;
    const months = currentMonths();
    renderPanel(true);
    try {
      const { cellTables, pointTables } = await loadMonths(months, sel.res, true);
      if (my !== token) return;
      summary = summarize(sel, months, cellTables, pointTables);
      ctx.rerender();
      renderPanel(false);
      ctx.emit('selection', { res: sel.res, cells: [...sel.cells], ...summary, fireCellIds: [...summary.fireCellIds] });
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
      const t = await ctx.source.getCells(sel.res, m);
      for (let i = 0; i < t.length; i++) if (sel.cells.has(t.cell[i]) && t.n_equiv[i] > 0) return true;
      return false;
    };
    let from = months[0], to = months.at(-1);
    for (let k = 0; k < FOLLOW_STEPS && from > allMonths[0] && (await hasFire(addMonth(from, -1))); k++) from = addMonth(from, -1);
    for (let k = 0; k < FOLLOW_STEPS && to < allMonths.at(-1) && (await hasFire(addMonth(to, 1))); k++) to = addMonth(to, 1);
    if (my !== token) return;
    const span = monthsBetween(from, to);
    if (span.length > MAX_MONTHS) from = span.at(-MAX_MONTHS);
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
  function chart(rows) {
    const max = Math.max(...rows.map((r) => r.biomass), 1e-9);
    const maxN = Math.max(...rows.map((r) => r.nEquiv), 1e-9);
    const W = 300, H = 64, bw = W / rows.length;
    const bars = rows.map((r, i) => {
      const h = (r.biomass / max) * (H - 6);
      const y = H - (r.nEquiv / maxN) * (H - 6);
      return `<g><title>${mlabel(r.month)}: ${fmtMass(r.biomass)} · ${fmt(r.nEquiv)} focos eq.</title>
        <rect x="${i * bw + bw * 0.12}" y="${H - h}" width="${Math.max(1, bw * 0.76)}" height="${Math.max(h, r.biomass > 0 ? 1 : 0)}" class="tam-sel__bar"/>
        <circle cx="${i * bw + bw / 2}" cy="${y}" r="${rows.length > 18 ? 1.6 : 2.4}" class="tam-sel__dot"/></g>`;
    }).join('');
    return `<svg class="tam-sel__chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
      aria-label="Biomasa estimada y focos equivalentes por mes">${bars}</svg>
      <div class="tam-sel__ticks"><span>${mlabel(rows[0].month)}</span><span>${rows.length > 1 ? mlabel(rows.at(-1).month) : ''}</span></div>
      <div class="tam-sel__keys"><span><i class="tam-sel__k-bar"></i>biomasa estimada</span><span><i class="tam-sel__k-dot"></i>focos equivalentes</span></div>`;
  }

  function monthOptions(selected) {
    return allMonths.map((m) => `<option value="${m}"${m === selected ? ' selected' : ''}>${mlabel(m)}</option>`).join('');
  }

  function renderPanel(loading) {
    if (!sel) return;
    const months = currentMonths();
    const open = panel.dataset.open !== '0';
    const t = summary?.total;
    const body = loading || !summary
      ? '<p class="tam-sel__msg">Calculando…</p>'
      : `
      <div class="tam-sel__hero">
        <div><span class="tam-sel__big">${fmtMass(t.biomass)}</span><span class="tam-sel__lbl">biomasa quemada (estimada, materia seca)</span></div>
        <div><span class="tam-sel__mid">${fmtMass(t.co2)}</span><span class="tam-sel__lbl">CO₂ emitido (aprox.)</span></div>
      </div>
      ${summary.rows.length > 1 ? chart(summary.rows) : ''}
      <dl class="tam-sel__grid">
        <dt>Focos equivalentes</dt><dd>${fmt(t.nEquiv)}</dd>
        <dt>Celdas con fuego</dt><dd>${fmt(t.fireCells, 0)} de ${fmt(sel.cells.size, 0)}</dd>
        <dt>Área con fuego</dt><dd>${fmt(t.fireArea, 0)} km² <small>(celdas, no área quemada)</small></dd>
        <dt>Área seleccionada</dt><dd>${fmt(sel.area, 0)} km²</dd>
        <dt>FRE total</dt><dd>${fmt(t.fre / 1e6, 2)} TJ</dd>
        <dt>Días con detección</dt><dd>${fmt(t.activeDays, 0)}</dd>
        <dt>Primera / última</dt><dd>${t.first != null ? `${dayToIso(t.first)} / ${dayToIso(t.last)}` : '—'}</dd>
        <dt>Día pico (FRE)</dt><dd>${t.peak ? `${dayToIso(t.peak.day)} · ${fmtMass((t.peak.fre * COMBUSTION_COEF) / 1000)}` : '—'}</dd>
        <dt>Detecciones crudas</dt><dd>${fmt(t.detections, 0)} <small>(${fmt(t.dayDet, 0)} día · ${fmt(t.nightDet, 0)} noche)</small></dd>
        <dt>Por plataforma</dt><dd>${Object.entries(t.byPlatform).map(([k, v]) => `${k} ${fmt(v, 0)}`).join(' · ') || '—'}</dd>
        <dt>FRP mediana / p90 / máx</dt><dd>${fmt(t.frpMedian)} / ${fmt(t.frpP90)} / ${fmt(t.frpMax)} MW</dd>
        <dt>ΣFRP</dt><dd>${fmt(t.frpSum, 0)} MW</dd>
        <dt>Centroide (pond. FRP)</dt><dd>${t.centroid ? `${t.centroid[1].toFixed(4)}, ${t.centroid[0].toFixed(4)}` : '—'}</dd>
      </dl>
      <details class="tam-sel__months"><summary>Detalle por mes</summary>
        <table><thead><tr><th>Mes</th><th>Focos eq.</th><th>Biomasa</th><th>Días</th><th>Det.</th><th>Sensor</th></tr></thead>
        <tbody>${summary.rows.map((r) => `<tr><td>${mlabel(r.month)}</td><td>${fmt(r.nEquiv)}</td><td>${fmtMass(r.biomass)}</td>
          <td>${r.activeDays}</td><td>${fmt(r.detections, 0)}</td><td>${r.family ?? '—'}</td></tr>`).join('')}</tbody></table>
      </details>
      <details class="tam-sel__method"><summary>Método y limitaciones</summary>
        <p><b>Focos equivalentes</b>: serie armonizada MODIS + VIIRS del pipeline, sumada sobre las celdas y meses elegidos.</p>
        <p><b>Biomasa</b>: FRE = Σ días (ΣFRP de una familia de sensores ÷ pasadas nominales) × 86 400 s;
          biomasa = FRE × ${COMBUSTION_COEF} kg/MJ (Wooster et al. 2005). CO₂ = biomasa × ${EF_CO2} kg/kg (Andreae 2019).</p>
        <p>Es una estimación de primer orden (±50 % o más): las pasadas no capturan bien el ciclo diurno, y los fuegos
          chicos, cortos o bajo nubes no se detectan. Las detecciones crudas no son comparables entre sensores
          (VIIRS ve ~4 veces más píxeles que MODIS). Celdas con centro dentro del dibujo, H3 r${sel.res}.</p>
      </details>
      <div class="tam-sel__actions">
        <button type="button" data-act="csv">CSV</button>
        <button type="button" data-act="json">JSON</button>
        <button type="button" data-act="cells">Celdas</button>
      </div>`;
    panel.innerHTML = `
      <details ${open ? 'open' : ''}>
        <summary class="tam-sel__head"><b>Selección · ${fmt(sel.cells.size, 0)} celda${sel.cells.size === 1 ? '' : 's'} r${sel.res}</b>
          <button type="button" class="tam-sel__x" aria-label="Borrar selección" title="Borrar selección (Esc)">×</button></summary>
        <div class="tam-sel__range">
          <label>Desde <select data-r="from">${monthOptions(months[0])}</select></label>
          <label>Hasta <select data-r="to">${monthOptions(months.at(-1))}</select></label>
        </div>
        <div class="tam-sel__range-actions">
          <button type="button" data-act="follow" title="Extiende el rango mientras la selección tenga fuego">Seguir incendio</button>
          <button type="button" data-act="show" title="Muestra en el mapa la suma de estos meses">Ver en el mapa</button>
          ${range ? '<button type="button" data-act="sync" title="Volver al período de la barra de tiempo">Usar período del mapa</button>' : ''}
        </div>
        ${months.length >= MAX_MONTHS ? `<p class="tam-sel__note">Como mucho ${MAX_MONTHS} meses.</p>` : ''}
        ${body}
      </details>`;
    panel.querySelector('details').addEventListener('toggle', (e) => { panel.dataset.open = e.target.open ? '1' : '0'; });
    panel.querySelector('.tam-sel__x').addEventListener('click', (e) => { e.preventDefault(); clear(); });
    for (const s of panel.querySelectorAll('select[data-r]')) {
      s.addEventListener('change', () => {
        let from = panel.querySelector('[data-r=from]').value;
        let to = panel.querySelector('[data-r=to]').value;
        if (to < from) [from, to] = [to, from];
        range = { from, to };
        refresh();
      });
    }
    panel.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => action(b.dataset.act)));
  }

  function action(act) {
    const months = currentMonths();
    const name = `seleccion_r${sel.res}_${months[0]}_${months.at(-1)}`;
    if (act === 'follow') follow();
    else if (act === 'show') ctx.setPeriod({ from: months[0], to: months.at(-1) });
    else if (act === 'sync') { range = null; refresh(); }
    else if (act === 'csv' && summary) {
      const head = 'mes,focos_equivalentes,celdas_con_fuego,detecciones,frp_suma_mw,frp_max_mw,dias_activos,fre_mj,biomasa_t,co2_t,familia_sensor';
      const lines = summary.rows.map((r) => [r.month, r.nEquiv.toFixed(3), r.fireCells, r.detections, r.frpSum.toFixed(1),
        r.frpMax.toFixed(1), r.activeDays, r.fre.toFixed(0), r.biomass.toFixed(3), r.co2.toFixed(3), r.family ?? ''].join(','));
      download(`${name}.csv`, [head, ...lines].join('\n'), 'text/csv');
    } else if (act === 'json' && summary) {
      download(`${name}.json`, JSON.stringify({
        zone: meta.zone, dataset_version: meta.dataset_version, config_hash: meta.config_hash,
        h3_res: sel.res, cells: [...sel.cells], selected_area_km2: sel.area, months,
        method: { combustion_coefficient_kg_per_mj: COMBUSTION_COEF, ef_co2_kg_per_kg: EF_CO2,
          fre: 'sum over local days of (sum FRP of one sensor family / nominal overpasses) * 86400 s' },
        total: { ...summary.total, first: summary.total.first != null ? dayToIso(summary.total.first) : null,
          last: summary.total.last != null ? dayToIso(summary.total.last) : null,
          peak: summary.total.peak ? { day: dayToIso(summary.total.peak.day), fre_mj: summary.total.peak.fre } : null },
        monthly: summary.rows,
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
      data: { type: 'FeatureCollection', features: sel.rings.map((r) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [r] } })) },
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
    setRange(r) { range = r; if (sel) refresh(); },
    get: () => (sel ? { res: sel.res, cells: [...sel.cells], summary } : null),
    destroy() {
      canvasBox.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    },
  };
}
