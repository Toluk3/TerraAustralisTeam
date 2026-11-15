/**
 * Barra de tiempo: franja con el valor armonizado de la zona y un cursor que se arrastra.
 *
 *   const tb = await createTimebar(el, { source, value: { from: '2025-02' } });
 *   tb.on('input', (p) => map.setPeriod(p));   // mientras se arrastra (una vez por cuadro)
 *   tb.on('change', (p) => ...);                // al soltar, con teclado o al reproducir
 *
 * Dos modos (ARQUITECTURA.md §4.4, "Barra de tiempo"):
 * - 'month': todos los meses de la serie; el período es el mes del cursor.
 * - 'day': los días de un año; el período es la ventana de `windowDays` días que termina en el cursor,
 *   y el valor que se muestra es el de la ventana de 8 días de la serie (no el del día suelto: la guía
 *   MODIS advierte sesgos en series de menos de ~8 días).
 *
 * Los números son siempre de la serie armonizada de la zona (calendar / timeline_8d), nunca de los puntos.
 */
import { CELLS, ramp, logScale, css } from '../map/colors.js';
import { toDay, dayToIso, dayToDate } from '../map/period.js';
import './timebar.css';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const nf = (d = 0) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: d });
const fmt = (v) => (v == null ? '—' : nf(v < 10 ? 1 : 0).format(v));
const pad = (n) => String(n).padStart(2, '0');

function quantile(values, q) {
  const v = values.filter((x) => x != null && x > 0).sort((a, b) => a - b);
  return v.length ? v[Math.floor(q * (v.length - 1))] : 1;
}

const DEFAULTS = { mode: 'month', windowDays: 8, playMonthMs: 700, playDayMs: 140 };

export async function createTimebar(container, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const { source } = opts;
  const [meta, cal, t8] = await Promise.all([source.getMeta(), source.getCalendar(), source.getTimeline8d()]);
  const switchDay = toDay(meta.switch_date);

  // --- Serie mensual (una fila por mes, sin huecos) ---
  const months = [];
  for (let i = 0; i < cal.length; i++) {
    months.push({
      year: cal.year[i], month: cal.month[i], value: cal.n_equiv[i], p05: cal.p05[i], p95: cal.p95[i],
      median: cal.median[i], anomaly: cal.anomaly_pct[i], status: cal.status[i],
      d0: toDay(`${cal.year[i]}-${pad(cal.month[i])}`),
    });
  }
  const monthDomain = quantile(months.map((m) => m.value), 0.98);

  // --- Ventanas de 8 días: día → ventana que lo contiene ---
  const bins = [];
  for (let i = 0; i < t8.length; i++) {
    bins.push({ d0: toDay(String(t8.period_start[i]).slice(0, 10)), value: t8.n_equiv[i], p05: t8.p05[i],
      p95: t8.p95[i], median: t8.median[i], anomaly: t8.anomaly_pct[i], status: t8.status[i] });
  }
  bins.sort((a, b) => a.d0 - b.d0);
  for (let i = 0; i < bins.length; i++) {
    const next = bins[i + 1];
    bins[i].d1 = next && dayToDate(next.d0).getUTCFullYear() === dayToDate(bins[i].d0).getUTCFullYear()
      ? next.d0 - 1 : toDay(`${dayToDate(bins[i].d0).getUTCFullYear()}-12-31`);
  }
  const binDomain = quantile(bins.map((b) => b.value), 0.98);
  const binAt = (d) => {
    let lo = 0, hi = bins.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (bins[mid].d1 < d) lo = mid + 1;
      else if (bins[mid].d0 > d) hi = mid - 1;
      else return bins[mid];
    }
    return null;
  };

  const firstDay = months.length ? months[0].d0 : toDay(meta.coverage.from);
  const lastDay = toDay(meta.coverage.to);
  const years = [...new Set(months.map((m) => m.year))];

  // --- DOM ---
  const root = document.createElement('div');
  root.className = 'tam-tb';
  root.innerHTML = `
    <div class="tam-tb__controls">
      <button type="button" class="tam-tb__play" aria-label="Reproducir">▶</button>
      <div class="tam-tb__modes" role="group" aria-label="Paso">
        <button type="button" data-mode="month">Mes</button>
        <button type="button" data-mode="day">Día</button>
      </div>
      <div class="tam-tb__year" hidden>
        <button type="button" data-step="-1" aria-label="Año anterior">‹</button>
        <span></span>
        <button type="button" data-step="1" aria-label="Año siguiente">›</button>
      </div>
      <div class="tam-tb__readout" aria-live="polite"></div>
    </div>
    <div class="tam-tb__track">
      <canvas class="tam-tb__canvas"></canvas>
      <div class="tam-tb__sel"></div>
      <div class="tam-tb__cursor" role="slider" tabindex="0" aria-label="Fecha"></div>
    </div>
    <div class="tam-tb__ticks"></div>`;
  container.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const canvas = $('.tam-tb__canvas');
  const track = $('.tam-tb__track');
  const cursor = $('.tam-tb__cursor');

  const listeners = {};
  const emit = (ev, p) => (listeners[ev] || []).forEach((cb) => cb(p));

  // --- Estado: el cursor es un día; en modo mes se ajusta al primer día del mes ---
  const state = { mode: opts.mode, day: lastDay, year: dayToDate(lastDay).getUTCFullYear(), playing: null };
  if (opts.value?.to || opts.value?.from) {
    const v = opts.value.to ?? opts.value.from;
    state.day = Math.min(lastDay, Math.max(firstDay, toDay(v, true)));
  }
  state.year = dayToDate(state.day).getUTCFullYear();

  /** Rango de días que cubre la franja en el modo actual. */
  function range() {
    if (state.mode === 'month') return { a: firstDay, b: lastDay };
    return { a: Math.max(firstDay, toDay(`${state.year}-01-01`)), b: Math.min(lastDay, toDay(`${state.year}-12-31`)) };
  }

  /** Índice del mes (en `months`) que contiene el día. */
  function monthIndex(d) {
    const x = dayToDate(d);
    const i = (x.getUTCFullYear() - months[0].year) * 12 + x.getUTCMonth() - (months[0].month - 1);
    return Math.max(0, Math.min(months.length - 1, i));
  }

  function period() {
    if (state.mode === 'month') {
      const m = months[monthIndex(state.day)];
      const k = `${m.year}-${pad(m.month)}`;
      return { from: k, to: k };
    }
    const from = Math.max(firstDay, state.day - opts.windowDays + 1);
    return { from: dayToIso(from), to: dayToIso(state.day) };
  }

  // --- Dibujo ---
  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const w = track.clientWidth, h = track.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const { a, b } = range();
    const span = b - a + 1;
    const x = (d) => ((d - a) / span) * w;

    const paint = (d0, d1, item, domain) => {
      const x0 = x(Math.max(a, d0)), x1 = x(Math.min(b, d1) + 1);
      if (x1 <= x0) return;
      if (item.status === 'sin_datos' || item.value == null) {
        ctx.fillStyle = '#3a3f48';
      } else {
        ctx.fillStyle = css(ramp(CELLS, logScale(item.value, domain)));
      }
      ctx.fillRect(x0, 6, Math.max(1, x1 - x0 - (x1 - x0 > 3 ? 0.5 : 0)), h - 12);
      if (item.status === 'parcial') { // cobertura reducida: marca naranja arriba
        ctx.fillStyle = '#ff8a65';
        ctx.fillRect(x0, 0, Math.max(1, x1 - x0), 4);
      }
    };
    if (state.mode === 'month') {
      months.forEach((m, i) => paint(m.d0, (months[i + 1]?.d0 ?? lastDay + 1) - 1, m, monthDomain));
    } else {
      for (const bin of bins) if (bin.d1 >= a && bin.d0 <= b) paint(bin.d0, bin.d1, bin, binDomain);
    }
    // Desde switch_date la serie es estimada: línea punteada abajo
    if (switchDay <= b) {
      ctx.strokeStyle = '#fdb863';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x(Math.max(a, switchDay)), h - 2);
      ctx.lineTo(w, h - 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    drawTicks(a, b, x);
    place();
  }

  function drawTicks(a, b) {
    const span = b - a + 1;
    const w = track.clientWidth;
    const marks = [];
    if (state.mode === 'month') {
      const every = w / years.length < 34 ? Math.ceil(34 / (w / years.length)) : 1;
      years.forEach((y, i) => {
        if (i % every) return;
        const d = Math.max(a, toDay(`${y}-01-01`));
        marks.push([d, String(y)]);
      });
    } else {
      for (let m = 1; m <= 12; m++) {
        const d = toDay(`${state.year}-${pad(m)}-01`);
        if (d >= a && d <= b) marks.push([d, MESES[m - 1]]);
      }
    }
    $('.tam-tb__ticks').innerHTML = marks
      .map(([d, t]) => `<span style="left:${((d - a) / span) * 100}%">${t}</span>`).join('')
      + (switchDay <= b && switchDay >= a
        ? `<span class="tam-tb__est" style="left:${((switchDay - a) / span) * 100}%">estimado →</span>` : '');
  }

  /** Ubica el cursor y la selección, y actualiza la lectura. */
  function place() {
    const { a, b } = range();
    const span = b - a + 1;
    const p = period();
    const s0 = toDay(p.from), s1 = toDay(p.to, true);
    const left = ((Math.max(a, s0) - a) / span) * 100;
    const right = ((Math.min(b, s1) + 1 - a) / span) * 100;
    const sel = $('.tam-tb__sel');
    sel.style.left = `${left}%`;
    sel.style.width = `${Math.max(0.3, right - left)}%`;
    cursor.style.left = `${right}%`;

    const item = state.mode === 'month' ? months[monthIndex(state.day)] : binAt(state.day);
    const label = state.mode === 'month'
      ? `${MESES[dayToDate(s0).getUTCMonth()]} ${dayToDate(s0).getUTCFullYear()}`
      : `${dayToDate(s0).getUTCDate()} ${MESES[dayToDate(s0).getUTCMonth()]} – ${dayToDate(s1).getUTCDate()} ${MESES[dayToDate(s1).getUTCMonth()]} ${dayToDate(s1).getUTCFullYear()}`;
    let txt = `<b>${label}</b>`;
    if (item && item.status !== 'sin_datos' && item.value != null) {
      const band = item.p95 - item.p05 > 0.5 ? ` <span class="tam-tb__muted">(${fmt(item.p05)}–${fmt(item.p95)})</span>` : '';
      const unit = state.mode === 'month' ? 'focos equivalentes' : 'focos eq. en la ventana de 8 días';
      txt += ` · ${fmt(item.value)} ${unit}${band}`;
      if (item.median != null) {
        const an = item.anomaly != null
          ? `${item.anomaly >= 0 ? '+' : ''}${nf(0).format(item.anomaly * 100)} %`
          : `${item.value - item.median >= 0 ? '+' : ''}${fmt(item.value - item.median)}`;
        txt += ` · <span class="${item.value >= item.median ? 'tam-tb__up' : 'tam-tb__down'}">${an}</span> <span class="tam-tb__muted">vs mediana ${fmt(item.median)}</span>`;
      }
      if (item.status === 'parcial') txt += ' · <span class="tam-tb__warn">cobertura reducida</span>';
      if (s1 >= switchDay) txt += ' · <span class="tam-tb__estimated">estimado</span>';
    } else {
      txt += ' · <span class="tam-tb__muted">sin datos</span>';
    }
    $('.tam-tb__readout').innerHTML = txt;
    cursor.setAttribute('aria-valuetext', label);
    cursor.setAttribute('aria-valuemin', String(a));
    cursor.setAttribute('aria-valuemax', String(b));
    cursor.setAttribute('aria-valuenow', String(state.day));
    $('.tam-tb__year span').textContent = state.year;
    root.querySelectorAll('[data-mode]').forEach((btn) => btn.setAttribute('aria-pressed', btn.dataset.mode === state.mode));
    $('.tam-tb__year').hidden = state.mode !== 'day';
  }

  // --- Interacción ---
  let lastEmitted = '';
  let raf = 0;
  function set(day, ev = 'change') {
    const { a, b } = range();
    let d = Math.min(b, Math.max(a, Math.round(day)));
    if (state.mode === 'month') d = months[monthIndex(d)].d0;
    state.day = d;
    place();
    const p = period();
    const key = `${p.from}|${p.to}`;
    if (ev === 'input') {
      if (key === lastEmitted) return;
      lastEmitted = key;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => emit('input', p));
    } else {
      lastEmitted = key;
      emit('input', p);
      emit('change', p);
    }
  }

  const dayAtX = (clientX) => {
    const r = track.getBoundingClientRect();
    const { a, b } = range();
    return a + ((clientX - r.left) / r.width) * (b - a + 1) - 0.5;
  };

  let dragging = false;
  track.addEventListener('pointerdown', (e) => {
    dragging = true;
    track.setPointerCapture(e.pointerId);
    track.classList.add('is-dragging');
    pause();
    set(dayAtX(e.clientX), 'input');
    cursor.focus({ preventScroll: true });
  });
  track.addEventListener('pointermove', (e) => { if (dragging) set(dayAtX(e.clientX), 'input'); });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    track.classList.remove('is-dragging');
    set(state.day, 'change');
  };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);

  /** Avanza `n` pasos (mes o día según el modo). */
  function step(n) {
    if (state.mode === 'month') {
      const i = Math.max(0, Math.min(months.length - 1, monthIndex(state.day) + n));
      set(months[i].d0);
    } else {
      const d = state.day + n;
      const y = dayToDate(Math.min(lastDay, Math.max(firstDay, d))).getUTCFullYear();
      if (y !== state.year) { state.year = y; draw(); }
      set(d);
    }
  }

  cursor.addEventListener('keydown', (e) => {
    const big = state.mode === 'month' ? 12 : 8;
    const map = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1, PageDown: -big, PageUp: big };
    if (e.key in map) step(map[e.key]);
    else if (e.key === 'Home') set(range().a);
    else if (e.key === 'End') set(range().b);
    else if (e.key === ' ') { state.playing ? pause() : play(); }
    else return;
    e.preventDefault();
  });

  root.querySelectorAll('[data-mode]').forEach((btn) => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
  root.querySelectorAll('[data-step]').forEach((btn) => btn.addEventListener('click', () => {
    const y = Math.min(dayToDate(lastDay).getUTCFullYear(), Math.max(dayToDate(firstDay).getUTCFullYear(),
      state.year + Number(btn.dataset.step)));
    if (y === state.year) return;
    const doy = state.day - toDay(`${state.year}-01-01`);
    state.year = y;
    draw();
    set(toDay(`${y}-01-01`) + doy);
  }));

  function play() {
    if (state.playing) return;
    if (state.day >= range().b) set(range().a);
    $('.tam-tb__play').textContent = '⏸';
    $('.tam-tb__play').setAttribute('aria-label', 'Pausa');
    state.playing = setInterval(() => {
      if (state.day >= range().b) return pause();
      step(1);
    }, state.mode === 'month' ? opts.playMonthMs : opts.playDayMs);
  }
  function pause() {
    clearInterval(state.playing);
    state.playing = null;
    $('.tam-tb__play').textContent = '▶';
    $('.tam-tb__play').setAttribute('aria-label', 'Reproducir');
  }
  $('.tam-tb__play').addEventListener('click', () => (state.playing ? pause() : play()));

  function setMode(mode) {
    if (mode !== 'month' && mode !== 'day') return;
    const wasPlaying = Boolean(state.playing);
    pause();
    state.mode = mode;
    // Al pasar a días, el cursor va al último día del mes elegido
    if (mode === 'day') state.day = Math.min(lastDay, toDay(dayToIso(state.day).slice(0, 7), true));
    state.year = dayToDate(state.day).getUTCFullYear();
    draw();
    set(state.day);
    if (wasPlaying) play();
  }

  const ro = new ResizeObserver(() => draw());
  ro.observe(track);
  draw();

  return {
    getValue: period,
    getMode: () => state.mode,
    /** Mueve el cursor desde afuera (no emite 'input'). Acepta 'YYYY-MM' o 'YYYY-MM-DD'. */
    setValue(p) {
      const d = toDay(p.to ?? p.from, true);
      state.year = dayToDate(Math.min(lastDay, Math.max(firstDay, d))).getUTCFullYear();
      state.day = Math.min(lastDay, Math.max(firstDay, d));
      if (state.mode === 'month') state.day = months[monthIndex(state.day)].d0;
      draw();
    },
    setMode,
    play,
    pause,
    on(ev, cb) { (listeners[ev] ||= []).push(cb); return () => { listeners[ev] = listeners[ev].filter((x) => x !== cb); }; },
    destroy() { pause(); ro.disconnect(); root.remove(); },
  };
}
