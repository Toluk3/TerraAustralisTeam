// Página de prueba del mapa y la barra de tiempo. La app real los usa igual, con sus propios controles.
//   ?datos=mock-s1   usa public/mock-s1 en vez de public/mock-api (otra salida de build_mocks.py)
import { createFireMap, createStaticSource, createApiSource, basemapOptions } from './map/index.js';
import { createTimebar } from './timebar/index.js';

const env = import.meta.env;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const source = env.VITE_DATA_SOURCE === 'api'
  ? createApiSource(env.VITE_API_BASE || '/api')
  : createStaticSource(`/${params.get('datos') || env.VITE_MOCK_BASE || 'mock-api'}`.replace(/^\/+/, '/'));

const basemap = env.VITE_MAP_STYLE || 'claro';
$('basemap').innerHTML = basemapOptions()
  .map((b) => `<option value="${b.id}"${b.id === basemap ? ' selected' : ''}>${b.label}</option>`).join('');

// La barra de tiempo arranca en el último mes con datos y le dice al mapa qué período mostrar
const meta = await source.getMeta();
$('title').textContent = `Mapa de focos · ${meta.zone}`;
const start = { from: meta.coverage.to.slice(0, 7) };

const [map, timebar] = await Promise.all([
  createFireMap($('map'), { source, basemap, period: start }),
  createTimebar($('timebar'), { source, value: start }),
]);
timebar.on('input', (p) => map.setPeriod(p));
window.fireMap = map; // para probar desde la consola
window.timebar = timebar;

$('basemap').addEventListener('change', (e) => map.setBasemap(e.target.value));
$('metric').addEventListener('change', (e) => map.setMetric(e.target.value));
$('opacity').addEventListener('input', (e) => map.setHexOpacity(Number(e.target.value)));
for (const name of ['cells', 'points', 'mask']) {
  $(`l-${name}`).addEventListener('change', (e) => map.setLayerVisible(name, e.target.checked));
}
// Las celdas abren el panel de selección; el recuadro de abajo queda para los focos
map.on('click', (info) => { $('info').textContent = info?.kind === 'point' ? JSON.stringify(info, null, 2) : ''; });
map.on('selection', (s) => { window.selection = s; });
