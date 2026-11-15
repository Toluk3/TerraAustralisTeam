/** Capas de deck.gl: máscara y contorno de la zona, grilla H3 armonizada y focos. */
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { DataFilterExtension, MaskExtension } from '@deck.gl/extensions';
import { CELLS, PUOR, FIRE, ramp, logScale, anomalyT, frpT } from './colors.js';

// Una sola instancia: si cambia entre renders, deck.gl vuelve a inicializar la capa.
const DATE_FILTER = new DataFilterExtension({ filterSize: 1 });
const ZONE_MASK = new MaskExtension();

/**
 * Suma n_equiv por celda sobre las tablas mensuales del período. `value` es el promedio mensual (lo que
 * se pinta, comparable entre períodos de distinto largo) y `total`, la suma. La anomalía solo existe
 * para un mes: no se puede sumar entre meses.
 */
export function aggregateCells(tables, nMonths) {
  const byCell = new Map();
  for (const t of tables) {
    for (let i = 0; i < t.length; i++) {
      const c = t.cell[i];
      const row = byCell.get(c);
      if (row) row.total += t.n_equiv[i];
      else byCell.set(c, { cell: c, total: t.n_equiv[i], anomaly: nMonths === 1 ? t.anomaly_pct[i] : null });
    }
  }
  const rows = [...byCell.values()];
  for (const r of rows) r.value = r.total / nMonths;
  return rows;
}

/** Polígonos exteriores de la zona (acepta Polygon y MultiPolygon). */
function outerRings(geojson) {
  const rings = [];
  for (const f of geojson.features ?? [geojson]) {
    const g = f.geometry ?? f;
    if (g.type === 'Polygon') rings.push(g.coordinates[0]);
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) rings.push(p[0]);
  }
  return rings;
}

/** Caja [[oeste, sur], [este, norte]] de la zona. */
export function outlineBounds(outline) {
  const b = [[180, 90], [-180, -90]];
  for (const ring of outerRings(outline)) {
    for (const [lng, lat] of ring) {
      b[0][0] = Math.min(b[0][0], lng); b[0][1] = Math.min(b[0][1], lat);
      b[1][0] = Math.max(b[1][0], lng); b[1][1] = Math.max(b[1][1], lat);
    }
  }
  return b;
}

/**
 * Máscara: oscurece todo el mapa salvo la zona analizada. Devuelve dos capas (van con `...` en la lista de
 * capas).
 *
 * Una caja que cubre el mundo entero se pinta en todas partes salvo donde está la zona (máscara invertida
 * de la GPU). Va de −540° a 540° de longitud para tapar también las copias del mundo que MapLibre repite a
 * los costados con zoom lejano, y hasta el límite de Web Mercator en latitud. No se arma como un polígono
 * con la zona de agujero: si la zona son varios países, los agujeros comparten fronteras, la triangulación
 * se rompe y tapa países enteros (Uruguay, Paraguay).
 */
const MERCATOR_LAT = 85.0511;
export function maskLayer(outline, { visible = true, opacity = 0.35, beforeId } = {}) {
  const W = -540, E = 540, S = -MERCATOR_LAT, N = MERCATOR_LAT;
  const box = [[W, S], [E, S], [E, N], [W, N], [W, S]];
  return [
    // Mismo beforeId que la caja: en el modo intercalado de MapLibre, deck.gl dibuja las capas por grupo de
    // beforeId y la forma de la máscara tiene que estar en el grupo de la capa que la usa.
    // `visible` también acá: si no, la forma se sigue dibujando en cada cuadro aunque la máscara esté apagada.
    new GeoJsonLayer({ id: 'zone-mask-shape', data: outline, operation: 'mask', visible, beforeId, stroked: false, filled: true }),
    new GeoJsonLayer({
      id: 'zone-mask', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [box] } },
      visible, beforeId, stroked: false, filled: true, pickable: false,
      getFillColor: [15, 20, 30, Math.round(255 * opacity)],
      extensions: [ZONE_MASK], maskId: 'zone-mask-shape', maskInverted: true,
    }),
  ];
}

export function outlineLayer(outline, { visible = true, beforeId } = {}) {
  return new GeoJsonLayer({
    id: 'zone-outline', data: outline, visible, beforeId, stroked: true, filled: false,
    getLineColor: [255, 255, 255, 230], lineWidthUnits: 'pixels', getLineWidth: 2, pickable: false,
  });
}

export function hexLayer(rows, { res, domain, metric, opacity, visible, beforeId }) {
  const isAnomaly = metric === 'anomaly';
  return new H3HexagonLayer({
    id: 'cells', data: rows, visible, opacity, beforeId, pickable: true,
    extruded: false, stroked: res >= 6, filled: true,
    getHexagon: (d) => d.cell,
    getFillColor: isAnomaly
      ? (d) => (d.anomaly == null ? [160, 160, 160, 90] : ramp(PUOR, anomalyT(d.anomaly)))
      : (d) => ramp(CELLS, logScale(d.value, domain)),
    getLineColor: [255, 255, 255, 60], lineWidthUnits: 'pixels', getLineWidth: 0.5,
    updateTriggers: { getFillColor: [metric, domain] },
  });
}

/**
 * Focos de una tesela y mes. Los datos son columnares ({length, lat[], lon[], ...}): los accesores leen
 * por índice. `id` tiene que ser estable para que deck.gl no vuelva a subir los datos a la GPU.
 */
const wrapped = new WeakMap();
const asData = (table) => {
  if (!wrapped.has(table)) wrapped.set(table, { length: table.length, src: table });
  return wrapped.get(table);
};

export function pointsLayer(id, table, { d0, d1, fade, visible }) {
  const span = d1 - d0;
  // Con `fade`, la primera mitad de la ventana se desvanece: se ve hacia dónde avanza el fuego.
  const softFrom = fade && span >= 2 ? d0 + span * 0.5 : d0;
  return new ScatterplotLayer({
    id: `points-${id}`, data: asData(table), visible, pickable: true,
    radiusUnits: 'pixels',
    getPosition: (_, { index, data, target }) => {
      target[0] = data.src.lon[index];
      target[1] = data.src.lat[index];
      target[2] = 0;
      return target;
    },
    getRadius: (_, { index, data }) => 2.5 + 2 * Math.sqrt(frpT(data.src.frp[index]) * 4),
    getFillColor: (_, { index, data }) => ramp(FIRE, frpT(data.src.frp[index]), 235),
    stroked: true, getLineColor: [0, 25, 45, 200], lineWidthUnits: 'pixels', getLineWidth: 0.5,
    extensions: [DATE_FILTER],
    getFilterValue: (_, { index, data }) => data.src.d[index],
    filterRange: [d0, d1 + 0.999],
    filterSoftRange: [softFrom, d1 + 0.999],
    filterTransformColor: true,
    filterTransformSize: true,
  });
}
