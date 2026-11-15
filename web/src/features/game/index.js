/**
 * Juego "Apagá los incendios", montado sobre el módulo del mapa.
 *
 *   import { createFireGame } from './game/index.js';
 *   const game = createFireGame(map);          // map = lo que devuelve createFireMap(); agrega el botón "Jugar"
 *   game.on('end', ({ status, stats }) => …);  // también 'open', 'start' y 'exit'
 *
 * El tablero son celdas H3 de la zona del mapa. Aparecen incendios cada vez más seguido y se apagan con
 * un clic o un toque. Mientras tanto salen mensajes breves de prevención (tips.js). Las reglas están en
 * engine.js y no dependen del mapa.
 */
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { gridDisk, latLngToCell, cellToLatLng } from 'h3-js';
import { outlineBounds } from '../fire-map/layers.js';
import { createEngine, GAME_DEFAULTS, POINTS } from './engine.js';
import { buildBoard, cellsBounds, loadWeights } from './board.js';
import { TIPS, DATA_TIP, shuffled } from './tips.js';
import './game.css';

const UI_DEFAULTS = {
  button: true,        // agrega el botón "Jugar" al mapa; con false, abrirlo con game.open()
  boardCells: 200,     // tamaño buscado del tablero (se elige la resolución H3 que más se acerca)
  realData: true,      // el fuego aparece más donde hubo más focos reales
  tipFirst: 4,         // segundos hasta el primer mensaje
  tipEvery: 13,        // segundos entre mensajes
  tipShow: 7,          // segundos que queda visible cada uno
};

const STAGE_FILL = [null, [255, 209, 59], [255, 138, 28], [224, 36, 28]];
const IDLE_FILL = [56, 142, 60, 46];
const WATER = [0, 176, 255];
const SPLASH_MS = 650;
const MAP_LAYERS = ['cells', 'points', 'outline', 'mask'];
const HANDLERS = ['dragPan', 'scrollZoom', 'boxZoom', 'dragRotate', 'keyboard', 'doubleClickZoom', 'touchZoomRotate', 'touchPitch'];

const pct = (x) => `${Math.round(x * 100)} %`;
const clock = (s) => `${Math.floor(Math.ceil(s) / 60)}:${String(Math.ceil(s) % 60).padStart(2, '0')}`;
const nf = new Intl.NumberFormat('es-AR');

// Récord del modo infinito, guardado en el navegador (si no se puede, solo dura la sesión)
const BEST_KEY = 'tam-game-best';
let bestMemory = 0;
function readBest() {
  try { return Math.max(bestMemory, Number(localStorage.getItem(BEST_KEY)) || 0); } catch { return bestMemory; }
}
function saveBest(score) {
  bestMemory = Math.max(bestMemory, score);
  try { localStorage.setItem(BEST_KEY, String(bestMemory)); } catch { /* modo privado */ }
}

export function createFireGame(fireMap, options = {}) {
  const opts = { ...UI_DEFAULTS, ...options };
  const rules = { ...GAME_DEFAULTS, ...options.rules };
  const endless = !Number.isFinite(rules.duration);
  const { map, root, meta } = fireMap;
  const bbox = outlineBounds(meta.outline);

  const listeners = {};
  const emit = (ev, payload) => (listeners[ev] || []).forEach((cb) => cb(payload));

  // --- DOM ---
  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'tam-game__open';
  openBtn.innerHTML = '<span aria-hidden="true">🔥</span> Jugar';
  openBtn.title = 'Juego: apagá los incendios';
  openBtn.hidden = !opts.button;
  root.appendChild(openBtn);

  const ui = document.createElement('div');
  ui.className = 'tam-game';
  ui.hidden = true;
  ui.innerHTML = `
    <div class="tam-game__hud">
      <span class="tam-game__score" title="Puntos">⭐ 0</span>
      <div class="tam-game__meter" role="meter" aria-label="Parte del mapa en llamas" aria-valuemin="0"
           aria-valuemax="${Math.round(rules.loseFrac * 100)}" aria-valuenow="0"
           title="Fuego en el mapa: si se llena la barra (${pct(rules.loseFrac)}), perdés">
        <i class="tam-game__fill"></i>
        ${endless ? '' : `<b class="tam-game__goal" style="left:${(rules.winFrac / rules.loseFrac) * 100}%" title="Meta: menos del ${pct(rules.winFrac)}"></b>`}
      </div>
      <span class="tam-game__pct" title="Parte del mapa en llamas">🔥 0 %</span>
      <span class="tam-game__time" title="${endless ? 'Tiempo de partida' : 'Tiempo restante'}">${clock(endless ? 0 : rules.duration)}</span>
      <button type="button" class="tam-game__quit" aria-label="Salir del juego" title="Salir (Esc)">×</button>
    </div>
    <div class="tam-game__fx" aria-hidden="true"></div>
    <div class="tam-game__tip" role="status" aria-live="polite" hidden></div>
    <div class="tam-game__modal" role="dialog" aria-modal="true" hidden></div>`;
  root.appendChild(ui);
  const $ = (s) => ui.querySelector(s);
  const el = { time: $('.tam-game__time'), meter: $('.tam-game__meter'), fill: $('.tam-game__fill'), pct: $('.tam-game__pct'),
    score: $('.tam-game__score'), tip: $('.tam-game__tip'), fx: $('.tam-game__fx'), modal: $('.tam-game__modal'),
    hud: $('.tam-game__hud') };

  // --- Estado ---
  let phase = 'closed'; // closed | intro | playing | ended
  let board = null;     // { res, cells, rows, weights }
  let engine = null;
  let raf = 0;
  let last = 0;
  let frame = 0;
  let saved = null;     // lo que hay que devolverle al mapa al salir
  let tips = [];
  let nextTip = 0;
  let hideTip = Infinity;
  const splashes = new Map(); // celda → momento en que se apagó (para el destello azul)

  async function ensureBoard() {
    if (board) return board;
    const b = buildBoard(meta.outline, { target: opts.boardCells });
    b.rows = b.cells.map((cell, i) => ({ cell, phase: (i * 2.399) % (2 * Math.PI) }));
    b.bounds = cellsBounds(b.cells);
    b.weights = null;
    if (opts.realData) {
      try { b.weights = await loadWeights(fireMap.source, meta, b); } catch { /* sin datos: fuego parejo */ }
    }
    board = b;
    return b;
  }

  // --- Dibujo ---
  function fillColor(d, now) {
    const stage = engine ? engine.stage(d.cell) : 0;
    if (stage) {
      const pulse = 0.5 + 0.5 * Math.sin(now / (260 - stage * 50) + d.phase);
      const [r, g, b] = STAGE_FILL[stage];
      return [r, g, b, 185 + 60 * pulse];
    }
    const t0 = splashes.get(d.cell);
    if (t0 != null) {
      const k = 1 - (now - t0) / SPLASH_MS;
      if (k > 0) return [...WATER, 40 + 190 * k];
      splashes.delete(d.cell);
    }
    return IDLE_FILL;
  }

  function drawBoard() {
    if (!board || phase === 'closed') return;
    const now = performance.now();
    frame++;
    fireMap.setExtraLayers([new H3HexagonLayer({
      id: 'game-board', data: board.rows, pickable: false, extruded: false, filled: true, stroked: true,
      getHexagon: (d) => d.cell,
      getFillColor: (d) => fillColor(d, now),
      // La etapa 3 (la que contagia) también se distingue por el borde, no solo por el color
      getLineColor: (d) => (engine?.stage(d.cell) === 3 ? [110, 0, 0, 255] : [255, 255, 255, 150]),
      getLineWidth: (d) => (engine?.stage(d.cell) === 3 ? 3 : 1),
      lineWidthUnits: 'pixels',
      updateTriggers: { getFillColor: frame, getLineColor: frame, getLineWidth: frame },
    })]);
  }

  function renderHud() {
    const f = engine ? engine.frac : 0;
    el.time.textContent = endless
      ? clock(engine ? Math.floor(engine.time) : 0)
      : clock(engine ? engine.timeLeft : rules.duration);
    el.time.classList.toggle('is-ending', !endless && Boolean(engine) && engine.timeLeft <= 10);
    el.fill.style.width = `${Math.min(100, (f / rules.loseFrac) * 100)}%`;
    const k = f / rules.loseFrac; // qué tan cerca está de perder
    el.fill.dataset.level = k < 0.4 ? 'ok' : k < 0.7 ? 'warn' : 'danger';
    el.meter.setAttribute('aria-valuenow', Math.round(f * 100));
    el.pct.textContent = `🔥 ${pct(f)}`;
    el.score.textContent = `⭐ ${nf.format(engine ? engine.score : 0)}`;
  }

  // --- Mensajes ---
  function tickTips(t) {
    if (t >= hideTip) { el.tip.hidden = true; hideTip = Infinity; }
    if (t < nextTip) return;
    if (!tips.length) tips = shuffled(board.weights ? [...TIPS, DATA_TIP] : TIPS);
    const tip = tips.pop();
    el.tip.innerHTML = `<span aria-hidden="true">${tip.icon}</span><span>${tip.text}</span>`;
    el.tip.hidden = false;
    el.tip.style.animation = 'none';
    void el.tip.offsetWidth; // reinicia la animación de entrada
    el.tip.style.animation = '';
    hideTip = t + opts.tipShow;
    nextTip = t + opts.tipEvery;
  }

  // --- Bucle ---
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); // al volver de otra pestaña no avanza de golpe
    last = now;
    if (phase === 'playing') {
      engine.step(dt);
      tickTips(engine.time);
      renderHud();
      if (engine.status !== 'playing') finish();
    }
    drawBoard();
  }

  function splashAt(point, points) {
    const drop = document.createElement('span');
    drop.className = 'tam-game__drop';
    drop.textContent = `💧+${points}`;
    drop.style.left = `${point.x}px`;
    drop.style.top = `${point.y}px`;
    drop.addEventListener('animationend', () => drop.remove());
    el.fx.appendChild(drop);
  }

  function hit(lngLat, point) {
    if (phase !== 'playing') return;
    const cell = latLngToCell(lngLat.lat, lngLat.lng, board.res);
    const points = engine.extinguish(cell);
    if (!points) return;
    splashes.set(cell, performance.now());
    splashAt(point, points);
    renderHud();
  }
  const onMouseDown = (e) => hit(e.lngLat, e.point);
  const onTouchStart = (e) => (e.lngLats ?? [e.lngLat]).forEach((ll, i) => hit(ll, e.points?.[i] ?? e.point));
  const onKey = (e) => { if (e.key === 'Escape' && phase !== 'closed') close(); };

  function fit(animate = false) {
    // Arriba queda el marcador y abajo, los mensajes
    const h = map.getContainer().clientHeight;
    map.fitBounds(board?.bounds ?? bbox, {
      padding: { top: Math.min(70, h * 0.16), bottom: Math.min(100, h * 0.22), left: 24, right: 24 }, animate });
  }
  // En el próximo turno: el mapa también reencuadra al cambiar de tamaño, y tiene que ganar este encuadre
  const onResize = () => setTimeout(() => { if (phase !== 'closed') fit(); }, 0);

  // --- Carteles ---
  function modal(html) {
    el.modal.innerHTML = `<div class="tam-game__card">${html}</div>`;
    el.modal.hidden = false;
    el.modal.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.act === 'start') start(); else close();
    }));
    el.modal.querySelector('[data-act="start"]')?.focus();
  }

  function intro() {
    const mins = rules.duration / 60;
    modal(`
      <h2><span aria-hidden="true">🔥</span> Apagá los incendios</h2>
      <ul>
        <li><b>Tocá</b> los hexágonos en llamas para apagarlos y sumar puntos.</li>
        <li>El fuego <b>crece y se contagia</b>: cuanto antes lo apagás, más puntos.</li>
        <li>Si arde más del <b>${pct(rules.loseFrac)}</b> del mapa, perdés.</li>
        ${endless
          ? '<li>Cada vez aparecen más: <b>¿cuántos puntos hacés?</b></li>'
          : `<li>A los <b>${Number.isInteger(mins) ? `${mins} minutos` : `${rules.duration} segundos`}</b>, con menos del <b>${pct(rules.winFrac)}</b> en llamas, ganás.</li>`}
      </ul>
      ${endless && readBest() ? `<p class="tam-game__stats">Récord: <b>${nf.format(readBest())}</b> puntos</p>` : ''}
      <div class="tam-game__legend">
        <span><i style="background:rgb(${STAGE_FILL[1]})"></i>recién empieza · ${POINTS[1]}</span>
        <span><i style="background:rgb(${STAGE_FILL[2]})"></i>crece · ${POINTS[2]}</span>
        <span><i style="background:rgb(${STAGE_FILL[3]})"></i>se contagia · ${POINTS[3]}</span>
      </div>
      <div class="tam-game__actions">
        <button type="button" data-act="close">Volver al mapa</button>
        <button type="button" data-act="start" class="is-primary">Empezar</button>
      </div>`);
  }

  function finish() {
    phase = 'ended';
    el.tip.hidden = true;
    const { status, reason, stats } = engine;
    const previous = readBest();
    const record = stats.score > previous;
    if (record) saveBest(stats.score);
    const head = status === 'won'
      ? ['🎉', '¡Controlaste el fuego!', `Terminaste con solo el ${pct(stats.frac)} del mapa en llamas.`]
      : reason === 'overrun'
        ? ['🔥', endless ? 'El fuego ganó esta vez' : 'El fuego se descontroló',
          endless ? `Aguantaste ${clock(Math.floor(stats.time))} antes de que ardiera más del ${pct(rules.loseFrac)} del mapa.`
            : `Más del ${pct(rules.loseFrac)} del mapa quedó en llamas.`]
        : ['⏱️', 'Se acabó el tiempo', `Quedó el ${pct(stats.frac)} del mapa en llamas: había que bajar del ${pct(rules.winFrac)}.`];
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    modal(`
      <h2><span aria-hidden="true">${head[0]}</span> ${head[1]}</h2>
      <p class="tam-game__points"><b>${nf.format(stats.score)}</b> puntos
        ${record ? '<span class="tam-game__record">¡Récord!</span>' : previous ? `<small>Récord: ${nf.format(previous)}</small>` : ''}</p>
      <p>${head[2]}</p>
      <p class="tam-game__stats">Apagaste <b>${stats.extinguished}</b> incendios · ${stats.spread} se contagiaron</p>
      <p class="tam-game__moral"><span aria-hidden="true">${tip.icon}</span> ${tip.text}</p>
      <div class="tam-game__actions">
        <button type="button" data-act="close">Volver al mapa</button>
        <button type="button" data-act="start" class="is-primary">Jugar de nuevo</button>
      </div>`);
    emit('end', { status, reason, stats });
  }

  // --- API ---
  async function open() {
    if (phase !== 'closed') return;
    phase = 'intro';
    const vis = fireMap.getState().layers;
    saved = { layers: { ...vis }, center: map.getCenter(), zoom: map.getZoom(), minZoom: map.getMinZoom() };
    map.setMinZoom(0); // en un marco chico, el tablero de una zona grande no entra con el zoom mínimo del mapa
    fireMap.setLassoMode(false);
    fireMap.clearSelection();
    // Se apagan todas las capas del mapa: el tablero se redibuja en cada cuadro y el contorno de una zona
    // grande (varios países) es lo más caro de pintar
    for (const name of MAP_LAYERS) fireMap.setLayerVisible(name, false);
    root.classList.add('tam-map--game');
    for (const h of HANDLERS) map[h]?.disable();
    map.on('mousedown', onMouseDown);
    map.on('touchstart', onTouchStart);
    map.on('resize', onResize);
    window.addEventListener('keydown', onKey);
    ui.hidden = false;
    engine = null;
    renderHud();
    emit('open');
    await ensureBoard();
    if (phase !== 'intro') return; // se cerró mientras cargaba
    fit(true);
    intro();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (phase === 'closed' || !board) return;
    engine = createEngine({
      ...rules, cells: board.cells, weights: board.weights,
      neighbors: (c) => gridDisk(c, 1),
    });
    splashes.clear();
    tips = [];
    nextTip = opts.tipFirst;
    hideTip = Infinity;
    el.tip.hidden = true;
    el.modal.hidden = true;
    phase = 'playing';
    last = performance.now();
    renderHud();
    emit('start');
  }

  function close() {
    if (phase === 'closed') return;
    phase = 'closed';
    cancelAnimationFrame(raf);
    engine = null;
    ui.hidden = true;
    el.modal.hidden = true;
    el.tip.hidden = true;
    el.fx.replaceChildren();
    map.off('mousedown', onMouseDown);
    map.off('touchstart', onTouchStart);
    map.off('resize', onResize);
    window.removeEventListener('keydown', onKey);
    for (const h of HANDLERS) map[h]?.enable();
    root.classList.remove('tam-map--game');
    fireMap.setExtraLayers([]);
    for (const name of MAP_LAYERS) fireMap.setLayerVisible(name, saved.layers[name]);
    map.setMinZoom(saved.minZoom);
    map.jumpTo({ center: saved.center, zoom: saved.zoom });
    emit('exit');
  }

  openBtn.addEventListener('click', open);
  $('.tam-game__quit').addEventListener('click', close);

  return {
    open, start, close,
    get phase() { return phase; },
    getStats: () => engine?.stats ?? null,
    /** Celdas en llamas, con su centro: [{ cell, lat, lng, stage }]. */
    getBurning: () => (engine?.burning() ?? []).map((cell) => {
      const [lat, lng] = cellToLatLng(cell);
      return { cell, lat, lng, stage: engine.stage(cell) };
    }),
    on(ev, cb) { (listeners[ev] ||= []).push(cb); return () => { listeners[ev] = listeners[ev].filter((x) => x !== cb); }; },
    destroy() { close(); openBtn.remove(); ui.remove(); },
  };
}

export { GAME_DEFAULTS } from './engine.js';
export { TIPS } from './tips.js';
