/**
 * Mapas base abiertos, sin clave ni registro.
 *
 * - OpenFreeMap (https://openfreemap.org): teselas vectoriales de OpenStreetMap, gratis y sin límite de uso.
 * - Esri World Imagery: imágenes satelitales (sirven para ver las cicatrices de los incendios). Uso libre con
 *   atribución para proyectos no comerciales; si la app pasa a producción comercial, revisar los términos de Esri.
 *
 * Cualquier otro estilo de MapLibre se puede pasar como URL o como objeto en `basemap`.
 */

export const BASEMAPS = {
  claro: { label: 'Claro', style: 'https://tiles.openfreemap.org/styles/positron' },
  calles: { label: 'Calles', style: 'https://tiles.openfreemap.org/styles/liberty' },
  oscuro: { label: 'Oscuro', style: 'https://tiles.openfreemap.org/styles/dark' },
  satelite: {
    label: 'Satélite',
    style: {
      version: 8,
      sources: {
        esri: {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          maxzoom: 19,
          attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics',
        },
      },
      layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
    },
  },
};

export const DEFAULT_BASEMAP = 'claro';

/** Acepta una clave de BASEMAPS, una URL de estilo o un objeto de estilo de MapLibre. */
export function resolveBasemap(b) {
  if (b == null) return BASEMAPS[DEFAULT_BASEMAP].style;
  if (typeof b === 'string' && BASEMAPS[b]) return BASEMAPS[b].style;
  return b;
}
