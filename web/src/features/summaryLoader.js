/**
 * Resumen de una selección para la ficha y el histograma de FRP. Sin DOM: baja las tablas de la fuente y
 * llama a summarize() del módulo del mapa (el mismo cálculo que usaba su panel).
 */
import { cellToParent, cellToLatLng, latLngToCell } from 'h3-js';
import { summarize, seriesInfo } from './fire-map/summary.js';

/** Bordes de los intervalos de FRP (MW): [0,1), [1,2), [2,5) … [500, ∞). */
export const FRP_EDGES = [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, Infinity];
const MODIS = new Set(['terra', 'aqua']);
export const familyOf = (platform) => (MODIS.has(platform) ? 'MODIS' : 'VIIRS');

export function frpBin(frp) {
  const v = Number.isFinite(frp) ? Math.max(0, frp) : 0;
  for (let i = 0; i < FRP_EDGES.length - 1; i++) if (v < FRP_EDGES[i + 1]) return i;
  return FRP_EDGES.length - 2;
}

/** Resolución del cálculo: la de la serie si el mapa la publica; si no, la más fina. */
export function calcRes(meta) {
  const list = meta?.map?.resolutions ?? [];
  return list.includes(meta.cell_res) ? meta.cell_res : Math.max(...list);
}

/** Cajita [w, s, e, n] de una lista de celdas (con un margen), si la selección no la trae. */
export function bboxOf(cells) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const c of cells) {
    const [la, lo] = cellToLatLng(c);
    w = Math.min(w, lo); e = Math.max(e, lo); s = Math.min(s, la); n = Math.max(n, la);
  }
  return [w - 0.1, s - 0.1, e + 0.1, n + 0.1];
}

/**
 * Histograma de FRP de los focos que caen en las celdas, por familia de sensor. Usa el mismo criterio de
 * pertenencia que summarize (celda r7 del foco, dentro de la caja).
 */
export function frpHistogram(sel, months, pointTables) {
  const out = { MODIS: new Array(FRP_EDGES.length - 1).fill(0), VIIRS: new Array(FRP_EDGES.length - 1).fill(0) };
  const [w, s, e, n] = sel.bbox;
  for (const m of months) {
    for (const t of pointTables.get(m) ?? []) {
      for (let i = 0; i < t.length; i++) {
        const lat = t.lat[i], lon = t.lon[i];
        if (lon < w || lon > e || lat < s || lat > n) continue;
        if (!sel.cells.has(latLngToCell(lat, lon, sel.res))) continue;
        out[familyOf(t.platform[i])][frpBin(t.frp[i])]++;
      }
    }
  }
  return out;
}

export function createSummarizer(source, meta) {
  const info = seriesInfo(meta);
  const CALC = calcRes(meta);
  const cellMonths = new Set(meta.map?.months ?? []);
  const pointMonths = new Set(meta.points?.months ?? []);
  const tileRes = meta.points?.tile_res ?? 2;
  const estMonths = new Set(meta.uncertainty && (meta.uncertainty.res == null || meta.uncertainty.res === CALC)
    ? meta.uncertainty.months ?? [] : []);

  /**
   * selection: payload del evento `selection` ({ res?, cells: string[] | Set, bbox? })
   * months: lista de 'YYYY-MM'
   */
  async function run(selection, months) {
    const cells = selection.cells instanceof Set ? selection.cells : new Set(selection.cells ?? []);
    const bbox = selection.bbox ?? bboxOf(cells);
    const sel = { res: CALC, cells, bbox };

    const ratios = estMonths.size && source.getEstRatios ? await source.getEstRatios().catch(() => null) : null;
    const hasRatios = Boolean(ratios?.reps);
    const tiles = new Set();
    for (const c of cells) tiles.add(cellToParent(c, tileRes));

    const cellTables = new Map();
    const estTables = new Map();
    const pointTables = new Map();
    await Promise.all(months.map(async (m) => {
      if (cellMonths.has(m)) cellTables.set(m, await source.getCells(CALC, m));
      if (hasRatios && estMonths.has(m)) estTables.set(m, await source.getEst(m));
      if (!pointMonths.has(m)) return;
      const idx = await source.getPointIndex(m);
      const need = Object.keys(idx?.tiles ?? {}).filter((t) => tiles.has(t));
      pointTables.set(m, await Promise.all(need.map((t) => source.getPoints(m, t))));
    }));

    const summary = summarize(sel, months, cellTables, pointTables, {
      info, estTables, ratios: hasRatios ? ratios : null,
    });
    const frp = frpHistogram(sel, months, pointTables);
    return { summary, frp };
  }

  return { run, info, CALC };
}
