<script setup>
/**
 * EduAustralis: la versión para escuelas, dentro de la app.
 *
 * Es lo que antes vivía en frontend/ (mapa + juego "Jugar" + cohete que recorre el mapa y va mostrando
 * las tarjetas de cada hito), con el estilo de la app. El contenido va en español (público escolar).
 * El cohete despega solo al entrar a la página, desde el ítem del navbar.
 */
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { loadDataset } from '@/features/dataset.js';
import FireMap from '@/components/map/FireMap.vue';

// Cada tarjeta aparece cuando el cohete pasó `at` (0..1) de la trayectoria. `side` la ubica junto a la
// parte del mapa que va recorriendo. `body` es HTML estático de confianza.
const milestones = [
  {
    id: 1, at: 0.12, side: 'right', title: '¿Qué muestra este mapa? 🤔',
    body: `
      <p>🛰️ Hay satélites que dan vueltas alrededor de la Tierra y sacan algo así como "fotos de calor". Cuando ven un lugar muy caliente, como un fuego, lo marcan con un puntito.</p>
      <p>Este mapa junta los puntitos de muchos años en seis países: Argentina, Chile, Uruguay, Paraguay, Bolivia y Brasil. Así podemos ver dónde y cuándo hubo fuego.</p>`,
  },
  {
    id: 2, at: 0.32, side: 'right', title: '¿Para qué sirve? 🧐',
    body: `
      <p>Podemos saber en qué meses hay más fuego y si un año tuvo más o menos que lo normal. No en todos lados pasa en la misma época: en gran parte de Sudamérica los incendios aparecen entre julio y octubre, cuando casi no llueve, y en el sur de Argentina, de diciembre a marzo, en pleno verano. Saberlo ayuda a los brigadistas y guardaparques a estar listos en el momento justo 🚒.</p>
      <p>Un puntito quiere decir "acá el satélite vio algo muy caliente". No siempre es un incendio grande. Y si hay nubes, a veces el satélite no ve nada.</p>`,
  },
  {
    id: 3, at: 0.52, side: 'bottom', title: 'Tipos de incendios 🔥',
    body: `
      <p>Los incendios que pasan en la naturaleza pueden avanzar de tres maneras:</p>
      <ul>
        <li>🌾 <strong>El que corre por el piso:</strong> quema pasto, hojas y ramitas.</li>
        <li>🌲 <strong>El que salta a los árboles:</strong> sube hasta las copas y avanza por arriba.</li>
        <li>🪨 <strong>El que se esconde abajo:</strong> arde bajo la tierra, quemando raíces.</li>
      </ul>`,
  },
  {
    id: 4, at: 0.7, side: 'left', title: '¿Qué pasa después de un incendio? 🌱',
    body: `
      <ul>
        <li>🐆 Muchos animales pierden su casa. En 2020, los incendios del Pantanal, en Brasil, afectaron a casi la mitad de los yaguaretés que viven ahí.</li>
        <li>💨 El humo tiene partículas tan chiquitas que se meten hasta el fondo de los pulmones. Y el viento lo puede llevar hasta otros países.</li>
        <li>🌧️ El suelo queda pelado y la lluvia y el viento se lo llevan.</li>
        <li>🌳 Algunas plantas aguantan el fuego y vuelven a crecer rápido, como las del Cerrado de Brasil, que tienen una corteza muy gruesa. Otras no: la lenga, un árbol de la cordillera, puede tardar siglos en volver, y a veces no vuelve nunca.</li>
      </ul>`,
  },
  {
    id: 5, at: 0.88, side: 'left', title: '¿Cómo podemos cuidarnos? 🧯',
    body: `
      <p>¿Sabías que casi todos los incendios forestales empiezan por algo que hizo una persona? Eso quiere decir que entre todos podemos evitarlos.</p>
      <ul>
        <li>🚫 <strong>Fósforos y encendedores no son juguetes.</strong> Si encontrás uno, dáselo a un adulto.</li>
        <li>💧 <strong>Fogón bien apagado.</strong> En un campamento, ayudá a echar mucha agua hasta que las cenizas estén frías.</li>
        <li>🗑️ <strong>Llevate tu basura.</strong> Las latas y los vidrios pueden hacer de lupa con el sol y empezar un fuego.</li>
        <li>📞 <strong>Si ves humo, avisá.</strong> Contale enseguida a un adulto para que llame a emergencias.</li>
      </ul>`,
  },
];
// La columna izquierda se lee de arriba abajo como 5 y 4 (el cohete sube por ese lado)
const columns = [
  { name: 'left', cards: milestones.filter((m) => m.side === 'left').reverse() },
  { name: 'right', cards: milestones.filter((m) => m.side === 'right') },
  { name: 'bottom', cards: milestones.filter((m) => m.side === 'bottom') },
];

// --- Datos y mapa ---
const ds = ref(null);
const dsError = ref('');
const period = ref(null);
const mapApi = shallowRef(null);
let gameApi = null;
const playing = ref(false);

function onReady(m) {
  mapApi.value = m;
  // Atribución plegada: en un marco chico tapa medio mapa
  m.root?.querySelector('.maplibregl-ctrl-attrib')?.removeAttribute('open');
  import('@/features/game/index.js').then(({ createFireGame }) => {
    if (!mapApi.value) return;
    gameApi = createFireGame(m);
    gameApi.on('open', () => { playing.value = true; });
    gameApi.on('exit', () => { playing.value = false; });
  });
}

// --- Cohete: el mismo vuelo de siempre ---
// Despega de arriba del ítem "EduAustralis" del navbar, se mete en la trayectoria dibujada sobre el mapa,
// la sigue a velocidad constante (apareciendo las tarjetas a su paso) y sale de la pantalla.
const PATH =
  'M713,68 C700,40 740,14 792,18 C885,24 962,95 966,225 C970,335 972,435 900,520 ' +
  'C820,600 650,610 480,604 C340,598 268,520 240,382 C222,292 192,222 140,162 ' +
  'C100,114 50,100 -40,95';
const VIEWBOX = '0 0 1085 622';
// Puntos de un cuadro del sprite (cohete-nav.svg, 500 × 500 por cuadro): el cuerpo (pivote) y la punta
const BODY = { x: 367 / 500, y: 180 / 500 };
const LEAD_MS = 1200; // del botón al comienzo de la trayectoria
const PATH_MS = 8000; // a lo largo del mapa
const EXIT_MS = 1800; // del final de la trayectoria a fuera de pantalla (como mucho)
const NAV_SPRITE = 64;

const stageEl = ref(null);
const pathEl = ref(null);
const flyEl = ref(null);
const flying = ref(false);
const progress = ref(0); // 0..1 a lo largo de la trayectoria: muestra las tarjetas
let raf = 0;
let dead = false;

const cubic = (a, b, c, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };
const slope = (a, b, c, d, t) => { const u = 1 - t; return 3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c); };
const pointAt = (p, t) => ({ x: cubic(p[0].x, p[1].x, p[2].x, p[3].x, t), y: cubic(p[0].y, p[1].y, p[2].y, p[3].y, t) });
const angleAt = (p, t) => Math.atan2(slope(p[0].y, p[1].y, p[2].y, p[3].y, t), slope(p[0].x, p[1].x, p[2].x, p[3].x, t)) * (180 / Math.PI);
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeInKeepSpeed = (end) => (p) => (1 - end) * easeInOutSine(p) + end * p;
const growth = (from, to) => (p) => from * Math.pow(to / from, easeInOutCubic(Math.min(p, 1)));

function route(start, startSize) {
  const vb = VIEWBOX.split(' ').map(Number);
  const W = window.innerWidth;
  const H = window.innerHeight;
  const toWindow = (pt) => {
    const r = stageEl.value.getBoundingClientRect();
    return { x: r.left + (pt.x / vb[2]) * r.width, y: r.top + (pt.y / vb[3]) * r.height };
  };

  // La trayectoria muestreada en píxeles de pantalla: el cohete avanza a velocidad constante
  const total = pathEl.value.getTotalLength();
  const N = 240;
  const samples = [];
  let length = 0;
  for (let i = 0; i <= N; i++) {
    const v = pathEl.value.getPointAtLength((i / N) * total);
    const win = toWindow(v);
    if (i > 0) length += Math.hypot(win.x - samples[i - 1].win.x, win.y - samples[i - 1].win.y);
    samples.push({ vb: v, win, at: length });
  }
  const along = (dist) => {
    let lo = 0;
    let hi = N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid].at < dist) lo = mid; else hi = mid; }
    const a = samples[lo];
    const b = samples[hi];
    const f = b.at > a.at ? (dist - a.at) / (b.at - a.at) : 0;
    const v = { x: a.vb.x + (b.vb.x - a.vb.x) * f, y: a.vb.y + (b.vb.y - a.vb.y) * f };
    const pa = toWindow(a.vb);
    const pb = toWindow(b.vb);
    return { body: toWindow(v), heading: Math.atan2(pb.y - pa.y, pb.x - pa.x) * (180 / Math.PI), fraction: (lo + f) / N };
  };

  const cruise = Math.min(170, Math.max(80, stageEl.value.getBoundingClientRect().width * 0.14));

  // La trayectoria abre con un pequeño gancho: el despegue se une en lo más alto del gancho, ya rumbo a la derecha
  let join = 0;
  for (let i = 1; i <= N * 0.25; i++) if (samples[i].win.y < samples[join].win.y) join = i;
  const joinAt = samples[join].at;
  const pathLength = length - joinAt;
  const speed = pathLength / PATH_MS;

  const entry = samples[join].win;
  const next = samples[Math.min(join + 2, N)].win;
  const eLen = Math.hypot(next.x - entry.x, next.y - entry.y) || 1;
  const eDir = { x: (next.x - entry.x) / eLen, y: (next.y - entry.y) / eLen };
  const LEAD_END = 0.5;
  const handle = Math.min(320, Math.max(40, (speed * LEAD_MS) / (3 * LEAD_END)));
  const lead = [start, { x: start.x, y: start.y - H * 0.15 }, { x: entry.x - eDir.x * handle, y: entry.y - eDir.y * handle }, entry];
  const leadEase = easeInKeepSpeed(LEAD_END);
  const sizeAt = growth(startSize, cruise);

  // Salida: sigue en la dirección con que termina la trayectoria hasta salir de la pantalla
  const exitFrom = samples[N].win;
  const before = samples[N - 2].win;
  const xLen = Math.hypot(exitFrom.x - before.x, exitFrom.y - before.y) || 1;
  const xDir = { x: (exitFrom.x - before.x) / xLen, y: (exitFrom.y - before.y) / xLen };
  const xHeading = Math.atan2(xDir.y, xDir.x) * (180 / Math.PI);
  const toEdge = [
    xDir.x < 0 ? (exitFrom.x + cruise) / -xDir.x : Infinity,
    xDir.x > 0 ? (W - exitFrom.x + cruise) / xDir.x : Infinity,
    xDir.y < 0 ? (exitFrom.y + cruise) / -xDir.y : Infinity,
    xDir.y > 0 ? (H - exitFrom.y + cruise) / xDir.y : Infinity,
  ];
  const exitDistance = Math.min(...toEdge);
  const exitExtra = Math.max(0, exitDistance - speed * EXIT_MS);

  return {
    size: Math.max(startSize, cruise),
    sample(elapsed) {
      if (elapsed < LEAD_MS) {
        const p = elapsed / LEAD_MS;
        const t = leadEase(p);
        progress.value = 0;
        return { body: pointAt(lead, t), heading: angleAt(lead, Math.max(t, 0.001)), size: sizeAt(p) };
      }
      const pt = elapsed - LEAD_MS;
      if (pt < PATH_MS) {
        const { body, heading, fraction } = along(joinAt + (pt / PATH_MS) * pathLength);
        progress.value = fraction;
        return { body, heading, size: cruise };
      }
      progress.value = 1;
      const e = (pt - PATH_MS) / EXIT_MS;
      const s = speed * EXIT_MS * e + exitExtra * e * e;
      if (e >= 1 || s >= exitDistance) return null;
      return { body: { x: exitFrom.x + xDir.x * s, y: exitFrom.y + xDir.y * s }, heading: xHeading, size: cruise };
    },
  };
}

async function launch() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { progress.value = 1; return; }
  // Sale de arriba del ítem EduAustralis del navbar (donde antes salía del botón); sin él, del centro de la barra
  const link = document.querySelector('.nav__link[href$="/edu"]');
  const r = link?.getBoundingClientRect();
  const start = r
    ? { x: r.left + r.width / 2, y: Math.max(NAV_SPRITE / 2, r.top - NAV_SPRITE / 2 - 6) }
    : { x: window.innerWidth / 2, y: 48 };
  await nextTick();
  await new Promise((res) => requestAnimationFrame(res));
  if (dead || !stageEl.value || !pathEl.value) return;

  const rt = route(start, NAV_SPRITE);
  flying.value = true;
  await nextTick();
  const el = flyEl.value;
  if (!el) return;
  el.style.width = el.style.height = `${rt.size}px`;
  const pivot = { x: BODY.x * rt.size, y: BODY.y * rt.size };
  el.style.transformOrigin = `${pivot.x}px ${pivot.y}px`;
  // La imagen apunta arriba a la derecha (-45°): al rumbo se le suman 45°
  const place = ({ x, y }, heading, size) => {
    el.style.transform = `translate(${x - pivot.x}px, ${y - pivot.y}px) rotate(${heading + 45}deg) scale(${size / rt.size})`;
  };
  place(start, -90, NAV_SPRITE);
  const t0 = performance.now();
  const frame = (now) => {
    const s = rt.sample(now - t0);
    if (!s || dead) { flying.value = false; return; }
    place(s.body, s.heading, s.size);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}

// --- Tarjetas: una abierta a la vez ---
const openId = ref(null);
const toggle = (id) => { openId.value = openId.value === id ? null : id; };

onMounted(async () => {
  launch();
  try {
    ds.value = await loadDataset();
    period.value = { from: ds.value.meta.coverage.to.slice(0, 7) };
  } catch (e) {
    dsError.value = e?.message ?? String(e);
  }
});

onBeforeUnmount(() => {
  dead = true;
  cancelAnimationFrame(raf);
  gameApi?.destroy?.();
  gameApi = null;
  mapApi.value = null;
});
</script>

<template>
  <div class="edu wrap" lang="es">
    <header class="edu__head">
      <h1>EduAustralis</h1>
      <p class="edu__lead">Mirá cómo los satélites ven el fuego desde el espacio, y probá apagarlo vos.</p>
    </header>

    <!-- El cohete vuela por encima de todo, desde el navbar -->
    <span v-if="flying" ref="flyEl" class="edu__rocket" aria-hidden="true"></span>

    <div class="edu__layout">
      <div v-for="c in columns" :key="c.name" class="edu__col" :class="`edu__col--${c.name}`">
        <article
          v-for="m in c.cards"
          :key="m.id"
          class="card"
          :class="{ 'is-shown': progress >= m.at, 'is-open': openId === m.id }"
          @click="toggle(m.id)"
        >
          <h2 class="card__title">
            <button
              type="button"
              class="card__toggle"
              :aria-expanded="openId === m.id ? 'true' : 'false'"
              :aria-controls="`edu-card-${m.id}`"
              @click.stop="toggle(m.id)"
            >
              <span>{{ m.title }}</span>
              <span class="card__chev" aria-hidden="true"></span>
            </button>
          </h2>
          <div :id="`edu-card-${m.id}`" class="card__body" v-html="m.body"></div>
        </article>
      </div>

      <div class="edu__map">
        <div class="edu__frame" :class="{ 'is-playing': playing }">
          <FireMap
            v-if="ds && period"
            :dataset="ds"
            :period="period"
            :selectable="false"
            label="Mapa de focos de calor"
            @ready="onReady"
          />
          <p v-else class="edu__state" :role="dsError ? 'alert' : undefined">
            {{ dsError ? `No se pudo cargar el mapa: ${dsError}` : 'Cargando el mapa…' }}
          </p>

          <!-- Trayectoria del cohete (invisible): encima del mapa, sin tapar los clics -->
          <div ref="stageEl" class="edu__stage" aria-hidden="true">
            <svg class="edu__svg" :viewBox="VIEWBOX" preserveAspectRatio="none">
              <path ref="pathEl" :d="PATH" fill="none" stroke="none" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.edu { padding-block: clamp(24px, 4vw, 56px) clamp(48px, 6vw, 96px); }
.edu__head { display: grid; justify-items: start; gap: 12px; margin-bottom: 28px; }
.edu__head h1 { margin: 0; }
.edu__lead { margin: 0; color: var(--muted); max-width: 60ch; }

/* El mapa en el centro y una columna de tarjetas a cada lado: nunca se tapan entre sí */
.edu__layout {
  display: grid; gap: 24px; align-items: start;
  grid-template-columns: minmax(200px, 1fr) minmax(0, 2.2fr) minmax(200px, 1fr);
  grid-template-areas: 'left map right' 'left bottom right';
}
.edu__col { display: grid; gap: 24px; }
.edu__col--left { grid-area: left; }
.edu__col--right { grid-area: right; }
.edu__col--bottom { grid-area: bottom; }
.edu__map { grid-area: map; }

.edu__frame {
  position: relative; width: 100%; aspect-ratio: 1085 / 622; min-height: 320px;
  overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-l);
  background: #eceae4; box-shadow: var(--shadow);
}
/* Jugando, el mapa ocupa toda la pantalla: en el marco chico los hexágonos serían muy pequeños */
.edu__frame.is-playing {
  position: fixed; inset: 0; z-index: 100; width: 100vw; height: 100dvh; max-height: none;
  aspect-ratio: auto; border: 0; border-radius: 0;
}
.edu__state { position: absolute; inset: 0; display: grid; place-content: center; margin: 0; padding: 24px; text-align: center; color: #3b3d42; }
.edu__stage { position: absolute; inset: 0; pointer-events: none; }
.edu__svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }

/* Cohete: 4 cuadros lado a lado en un SVG; el fondo avanza un cuadro cada 0,3 s */
.edu__rocket {
  position: fixed; top: 0; left: 0; z-index: 120; max-width: none; pointer-events: none;
  background: url('/images/cohete-nav.svg') no-repeat 0 0 / 400% 100%;
  animation: edu-flip 1.2s step-end infinite;
}
@keyframes edu-flip {
  0% { background-position: 0 0; }
  25% { background-position: 33.3333% 0; }
  50% { background-position: 66.6667% 0; }
  75% { background-position: 100% 0; }
}

/* Tarjetas */
.card {
  padding: 18px 20px; border: 1px solid var(--line); border-radius: var(--radius-m);
  background: var(--surface); box-shadow: var(--shadow); cursor: pointer;
  transition: transform 0.2s var(--ease), border-color 0.2s var(--ease), box-shadow 0.2s var(--ease);
}
.card:hover { transform: translateY(-2px); border-color: var(--line-strong); }
.card__title { margin: 0 0 8px; font-size: 1.05rem; font-weight: 500; line-height: 1.3; }
.card__toggle {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; width: 100%;
  padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.card__toggle:focus-visible { outline: 2px solid var(--focus); outline-offset: 4px; border-radius: 6px; }
.card__chev {
  flex: none; width: 0.55em; height: 0.55em; margin-top: 0.4em;
  border-right: 2px solid currentColor; border-bottom: 2px solid currentColor;
  transform: rotate(45deg); transition: transform 0.25s var(--ease);
}
.card.is-open .card__chev { transform: translateY(0.25em) rotate(-135deg); }

/* Cerrada: vista previa de dos renglones que se desvanece. Abierta: el texto completo. */
.card__body {
  max-height: 2.9em; overflow: hidden; font-size: 0.9rem; line-height: 1.5; color: var(--muted);
  -webkit-mask-image: linear-gradient(180deg, #000 40%, transparent); mask-image: linear-gradient(180deg, #000 40%, transparent);
  transition: max-height 0.4s var(--ease);
}
.card.is-open .card__body { max-height: 48rem; -webkit-mask-image: none; mask-image: none; }
.card__body :deep(p), .card__body :deep(ul) { margin: 0 0 0.6em; }
.card__body :deep(ul) { padding: 0; list-style: none; }
.card__body :deep(li + li) { margin-top: 0.4em; }
.card__body :deep(strong) { color: var(--ink); font-weight: 600; }
.card__body > :deep(:last-child) { margin-bottom: 0; }

/* Ocultas (pero con su lugar) hasta que el cohete llega; aparecen con un pequeño rebote */
.card:not(.is-shown) { visibility: hidden; }
.card.is-shown { animation: edu-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes edu-pop {
  from { opacity: 0; transform: scale(0.6) translateY(16px); }
  to { opacity: 1; transform: none; }
}

@media (max-width: 900px) {
  .edu__layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'map' 'right' 'bottom' 'left';
  }
  .edu__col--left { display: flex; flex-direction: column-reverse; }
}
@media (prefers-reduced-motion: reduce) {
  .edu__rocket, .card.is-shown { animation: none; }
}
</style>
