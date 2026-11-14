import { createFireMap } from './map/index.js';

const $ = (selector, root) => root.querySelector(selector);
const monthFormat = (month) => {
  const [year, value] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, value - 1, 1)));
};
const daysInMonth = (month) => {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value, 0)).getUTCDate();
};

function syncCamera(a, b) {
  const sync = (source, target) => source.map.on('moveend', () => {
    const center = source.map.getCenter();
    const other = target.map.getCenter();
    if (Math.abs(center.lat - other.lat) < 1e-6 && Math.abs(center.lng - other.lng) < 1e-6
      && Math.abs(source.map.getZoom() - target.map.getZoom()) < 1e-4
      && Math.abs(source.map.getBearing() - target.map.getBearing()) < 1e-4
      && Math.abs(source.map.getPitch() - target.map.getPitch()) < 1e-4) return;
    target.map.jumpTo({
      center: [center.lng, center.lat], zoom: source.map.getZoom(),
      bearing: source.map.getBearing(), pitch: source.map.getPitch(),
    });
  });
  sync(a, b);
  sync(b, a);
}

function setSplit(stage, clip, divider, value) {
  const split = Math.max(10, Math.min(90, Number(value)));
  clip.style.clipPath = `inset(0 0 0 ${split}%)`;
  divider.style.left = `${split}%`;
  divider.setAttribute('aria-valuenow', String(Math.round(split)));
  divider.setAttribute('aria-valuetext', `${Math.round(split)} por ciento del mapa inicial visible`);
  stage.style.setProperty('--compare-split', `${split}%`);
}

function setupDivider(stage, clip, divider) {
  let dragging = false;
  const move = (clientX) => {
    const bounds = stage.getBoundingClientRect();
    setSplit(stage, clip, divider, ((clientX - bounds.left) / bounds.width) * 100);
  };
  divider.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    dragging = true;
    divider.setPointerCapture(event.pointerId);
  });
  divider.addEventListener('pointermove', (event) => { if (dragging) move(event.clientX); });
  const stop = () => { dragging = false; };
  divider.addEventListener('pointerup', stop);
  divider.addEventListener('pointercancel', stop);
  divider.addEventListener('keydown', (event) => {
    const current = Number(divider.getAttribute('aria-valuenow'));
    const changes = { ArrowLeft: -2, ArrowDown: -2, ArrowRight: 2, ArrowUp: 2, PageDown: -10, PageUp: 10 };
    if (event.key === 'Home') setSplit(stage, clip, divider, 10);
    else if (event.key === 'End') setSplit(stage, clip, divider, 90);
    else if (event.key in changes) setSplit(stage, clip, divider, current + changes[event.key]);
    else return;
    event.preventDefault();
  });
  setSplit(stage, clip, divider, 50);
}

function makeWindow(month, date) {
  const day = Number(date.slice(-2));
  const start = Math.max(1, day - 7);
  return {
    from: `${month}-${String(start).padStart(2, '0')}`,
    to: date,
    count: day - start + 1,
  };
}

export async function createCompareView({ root, source, basemap, onSelect, onReady }) {
  const [meta, calendar] = await Promise.all([source.getMeta(), source.getCalendar()]);
  const months = Array.from({ length: calendar.length }, (_, index) =>
    `${calendar.year[index]}-${String(calendar.month[index]).padStart(2, '0')}`);
  const monthA = $('#compare-month-a', root);
  const monthB = $('#compare-month-b', root);
  const dayA = $('#compare-day-a', root);
  const dayB = $('#compare-day-b', root);
  const labelA = $('#compare-label-a', root);
  const labelB = $('#compare-label-b', root);
  const summary = $('#compare-summary', root);
  const status = $('#compare-status', root);
  const sideState = {};

  const setOptions = (select, selected) => {
    select.innerHTML = months.map((month) =>
      `<option value="${month}"${month === selected ? ' selected' : ''}>${monthFormat(month)}</option>`).join('');
  };
  if (!months.length) throw new Error('El calendario publicado no contiene períodos para comparar.');
  const finalMonth = months[months.length - 1];
  const initialMonth = months[Math.max(0, months.length - 13)];
  setOptions(monthA, initialMonth);
  setOptions(monthB, finalMonth);

  const resetDate = (input, month) => {
    input.min = `${month}-01`;
    input.max = `${month}-${daysInMonth(month)}`;
    if (!input.value || input.value.slice(0, 7) !== month) input.value = input.max;
  };
  resetDate(dayA, initialMonth);
  resetDate(dayB, finalMonth);

  const initialA = makeWindow(monthA.value, dayA.value);
  const initialB = makeWindow(monthB.value, dayB.value);
  const [mapA, mapB] = await Promise.all([
    createFireMap($('#compare-map-a', root), { source, basemap, period: initialA }),
    createFireMap($('#compare-map-b', root), { source, basemap, period: initialB }),
  ]);
  syncCamera(mapA, mapB);

  const stage = $('#compare-stage', root);
  const clip = $('#compare-map-clip', root);
  const divider = $('#compare-divider', root);
  setupDivider(stage, clip, divider);

  function updateSide(key, map, monthControl, dayControl, label) {
    const month = monthControl.value;
    const window = makeWindow(month, dayControl.value);
    label.textContent = monthFormat(month);
    const daysLabel = window.count === 8 ? 'detecciones · 8 días' : `detecciones · ${window.count} días`;
    label.title = `${monthFormat(month)}; ${daysLabel}`;
    status.textContent = '';
    map.setPeriod({ from: window.from, to: window.to }).then(() => {
      const state = map.getState();
      const detections = state.points.periodVisible;
      const cells = state.cells;
      sideState[key] = state.points.zoomedOut
        ? `${key}: acercá el mapa para consultar detecciones FIRMS; las celdas armonizadas siguen disponibles.`
        : `${key}: ${detections} ${detections === 1 ? 'detección' : 'detecciones'} FIRMS en las teselas cargadas${state.points.truncated ? ' (muestra parcial; acercá el mapa)' : ''}; ${cells} ${cells === 1 ? 'celda' : 'celdas'} con valor armonizado. La ausencia de detecciones no descarta fuego.`;
      summary.textContent = `${sideState.A || ''} ${sideState.B || ''}`.trim();
    }).catch((error) => {
      status.textContent = `No se pudo actualizar el período: ${error.message}`;
    });
  }
  const updateA = () => updateSide('A', mapA, monthA, dayA, labelA);
  const updateB = () => updateSide('B', mapB, monthB, dayB, labelB);
  monthA.addEventListener('change', () => { resetDate(dayA, monthA.value); updateA(); });
  monthB.addEventListener('change', () => { resetDate(dayB, monthB.value); updateB(); });
  dayA.addEventListener('change', () => updateA());
  dayB.addEventListener('change', () => updateB());
  $('#compare-fit', root).addEventListener('click', () => { mapA.fitZone(); });
  mapA.on('click', (info) => { if (info) onSelect(mapA, info); });
  mapB.on('click', (info) => { if (info) onSelect(mapB, info); });
  mapA.on('error', (error) => { status.textContent = `Período inicial: ${error.message}`; });
  mapB.on('error', (error) => { status.textContent = `Período final: ${error.message}`; });
  updateA();
  updateB();
  onReady?.({ meta, mapA, mapB });
  return { mapA, mapB, destroy() { mapA.destroy(); mapB.destroy(); } };
}
