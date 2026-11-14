import { createFireMap, createStaticSource, createApiSource, basemapOptions } from './map/index.js';
import { createTimebar } from './timebar/index.js';
import { createCompareView } from './compare.js';
import { showDetail } from './detail.js';
import './app.css';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const env = import.meta.env;
const source = env.VITE_DATA_SOURCE === 'api'
  ? createApiSource(env.VITE_API_BASE || '/api')
  : createStaticSource(`/${params.get('datos') || env.VITE_MOCK_BASE || 'mock-api'}`.replace(/^\/+/, '/'));
const basemap = env.VITE_MAP_STYLE || 'claro';
let explorePromise = null;
let comparePromise = null;
let exploreMeta = null;
let compareMeta = null;
let fireMap = null;
let timebar = null;

const detailArgs = (map, info, meta) => showDetail({
  dialog: $('detail-dialog'), content: $('detail-content'), source, meta, map, info,
});
const setStatus = (id, message) => { $(id).textContent = message || ''; };
const startupError = (error) => error instanceof SyntaxError
  ? 'No se encontró una publicación JSON válida. Generá los datos estáticos antes de abrir este modo.'
  : error.message;

function showScreen(name) {
  const isHome = name === 'home';
  $('home-screen').hidden = !isHome;
  $('explore-screen').hidden = name !== 'explore';
  $('compare-screen').hidden = name !== 'compare';
  $('mode-nav').hidden = isHome;
  document.querySelectorAll('#mode-nav [data-screen]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.screen === name));
  });
  if (name === 'explore') openExplore();
  if (name === 'compare') openCompare();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

async function openExplore() {
  if (explorePromise) return explorePromise;
  explorePromise = (async () => {
    setStatus('explore-status', 'Cargando publicación y mapa…');
    try {
      exploreMeta = await source.getMeta();
      $('zone-title').textContent = exploreMeta.zone || 'Zona de estudio';
      $('basemap').innerHTML = basemapOptions()
        .map((item) => `<option value="${item.id}"${item.id === basemap ? ' selected' : ''}>${item.label}</option>`)
        .join('');
      const start = { from: exploreMeta.coverage.to.slice(0, 7) };
      [fireMap, timebar] = await Promise.all([
        createFireMap($('explore-map'), { source, basemap, period: start }),
        createTimebar($('timebar'), { source, value: start }),
      ]);
      timebar.on('input', (period) => fireMap.setPeriod(period));
      fireMap.on('click', (info) => { if (info) detailArgs(fireMap, info, exploreMeta); });
      fireMap.on('error', (error) => setStatus('explore-status', `No se pudieron cargar algunos datos: ${error.message}`));
      $('basemap').addEventListener('change', (event) => {
        fireMap.setBasemap(event.target.value).catch((error) =>
          setStatus('explore-status', `No se pudo cambiar el mapa base: ${error.message}`));
      });
      $('metric').addEventListener('change', (event) => fireMap.setMetric(event.target.value));
      $('opacity').addEventListener('input', (event) => {
        fireMap.setHexOpacity(Number(event.target.value));
        $('opacity-value').textContent = `${Math.round(Number(event.target.value) * 100)} %`;
      });
      for (const name of ['cells', 'points', 'mask']) {
        $(`l-${name}`).addEventListener('change', (event) => fireMap.setLayerVisible(name, event.target.checked));
      }
      $('fit-zone').addEventListener('click', () => fireMap.fitZone());
      window.fireMap = fireMap;
      window.timebar = timebar;
      setStatus('explore-status', '');
    } catch (error) {
      explorePromise = null;
      setStatus('explore-status', `No se pudo iniciar el mapa: ${startupError(error)} Verificá frontend/map/public.`);
    }
  })();
  return explorePromise;
}

async function openCompare() {
  if (comparePromise) return comparePromise;
  comparePromise = (async () => {
    setStatus('compare-status', 'Cargando mapas sincronizados…');
    try {
      const compare = await createCompareView({
        root: $('compare-screen'),
        source,
        basemap,
        onSelect: (map, info) => { if (info && compareMeta) detailArgs(map, info, compareMeta); },
        onReady: ({ meta }) => { compareMeta = meta; },
      });
      compareMeta = compareMeta || await source.getMeta();
      window.fireMapCompare = compare;
      setStatus('compare-status', '');
    } catch (error) {
      comparePromise = null;
      setStatus('compare-status', `No se pudo iniciar el comparador: ${startupError(error)} Verificá frontend/map/public.`);
    }
  })();
  return comparePromise;
}

document.querySelectorAll('[data-screen]').forEach((button) => {
  button.addEventListener('click', () => showScreen(button.dataset.screen));
});
$('home-button').addEventListener('click', () => showScreen('home'));
$('explore-back').addEventListener('click', () => showScreen('home'));
$('compare-back').addEventListener('click', () => showScreen('home'));
$('detail-close').addEventListener('click', () => $('detail-dialog').close());
$('detail-dialog').addEventListener('click', (event) => {
  if (event.target === $('detail-dialog')) $('detail-dialog').close();
});
