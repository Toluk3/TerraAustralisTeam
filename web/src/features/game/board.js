/** Tablero del juego: las celdas H3 que cubren la zona del mapa y dónde es más probable el fuego. */
import { polygonToCells, cellToParent, cellToBoundary } from 'h3-js';

/** Celdas H3 de resolución `res` con el centro dentro de la zona (GeoJSON Polygon o MultiPolygon). */
export function zoneCells(outline, res) {
  const out = new Set();
  for (const f of outline.features ?? [outline]) {
    const g = f.geometry ?? f;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const p of polys) for (const c of polygonToCells(p, res, true)) out.add(c);
  }
  return out;
}

/**
 * Elige la resolución que deja el tablero más cerca de `target` celdas: suficientes para que el
 * porcentaje se mueva de a poco y lo bastante grandes para acertarles con el dedo.
 */
export function buildBoard(outline, { target = 200, minRes = 1, maxRes = 6 } = {}) {
  let best = null;
  for (let res = minRes; res <= maxRes; res++) {
    const cells = [...zoneCells(outline, res)];
    const score = cells.length ? Math.abs(Math.log(cells.length / target)) : Infinity;
    if (!best || score < best.score) best = { res, cells, score };
    if (cells.length >= target) break; // cada resolución tiene ~7 veces más celdas: las siguientes se alejan
  }
  return { res: best.res, cells: best.cells };
}

/**
 * Caja [[oeste, sur], [este, norte]] de las celdas. Se encuadra el tablero y no la zona: una zona con
 * islas lejanas (Pascua, Trindade) dejaría los hexágonos demasiado chicos. No contempla el antimeridiano.
 */
export function cellsBounds(cells) {
  const b = [[180, 90], [-180, -90]];
  for (const c of cells) {
    for (const [lat, lng] of cellToBoundary(c)) {
      b[0][0] = Math.min(b[0][0], lng); b[0][1] = Math.min(b[0][1], lat);
      b[1][0] = Math.max(b[1][0], lng); b[1][1] = Math.max(b[1][1], lat);
    }
  }
  return b;
}

/**
 * Peso de cada celda del tablero según los focos reales: se suman las celdas del mapa de los meses con
 * más fuego de la serie. Devuelve null si no hay datos para armarlo (el fuego aparece parejo).
 */
export async function loadWeights(source, meta, board, { months = 6 } = {}) {
  const dataRes = Math.min(...(meta.map?.resolutions ?? []));
  if (!(dataRes >= board.res)) return null;
  const cal = await source.getCalendar();
  const available = new Set(meta.map.months);
  const top = Array.from({ length: cal.length }, (_, i) => ({
    key: `${cal.year[i]}-${String(cal.month[i]).padStart(2, '0')}`, v: cal.n_equiv[i] ?? 0,
  })).filter((m) => available.has(m.key) && m.v > 0).sort((a, b) => b.v - a.v).slice(0, months);
  if (!top.length) return null;

  const inBoard = new Set(board.cells);
  const sum = new Map();
  for (const t of await Promise.all(top.map((m) => source.getCells(dataRes, m.key)))) {
    for (let i = 0; i < t.length; i++) {
      const parent = dataRes === board.res ? t.cell[i] : cellToParent(t.cell[i], board.res);
      if (inBoard.has(parent)) sum.set(parent, (sum.get(parent) ?? 0) + t.n_equiv[i]);
    }
  }
  if (!sum.size) return null;
  const max = Math.max(...sum.values());
  // Raíz cuadrada y un piso: el fuego se concentra donde hubo focos, pero puede aparecer en cualquier celda
  return new Map(board.cells.map((c) => [c, 0.15 + Math.sqrt((sum.get(c) ?? 0) / max)]));
}
