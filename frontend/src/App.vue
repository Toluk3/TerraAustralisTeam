<script setup>
import { ref, computed, nextTick } from 'vue'
import MapSlider from './components/MapSlider.vue'
import MapView from './components/MapView.vue'
import RocketTrajectory from './components/RocketTrajectory.vue'
import HowItWorks from './components/HowItWorks.vue'
import HowItWorksSimple from './components/HowItWorksSimple.vue'

const launched = ref(false)
const launching = ref(false)
const currentPage = ref('mapa')

let launchFallback

function launch() {
  if (launching.value) return
  launching.value = true
  // Safety net in case animationend never fires (e.g. tab hidden, reduced motion)
  launchFallback = setTimeout(finishLaunch, 4200)
}

// The launch ends once the rocket has flown off the top of the screen
function onRocketAnimationEnd(event) {
  if (event.animationName === 'rocket-ascend') finishLaunch()
}

function finishLaunch() {
  clearTimeout(launchFallback)
  launched.value = true
}

// Every navigation button launches the rocket; see flyRocket below.
function navigate(pageId, event) {
  if (pageId === currentPage.value) return
  if (activeFlight) {
    if (!activeFlight.interruptible) return
    activeFlight.stop()
  }
  flyRocket(pageId, event.currentTarget)
}

// ---- Rocket flights ----------------------------------------------------------
// Every navigation button launches the same rocket from the top of the button.
// Most pages use the "arc" route: up and back down along a cubic bezier,
// growing as it goes, leaving through the lower-left corner. EduAustralis uses
// the "edu" route: after lifting off it swoops into the RocketTrajectory path
// drawn over the map and follows it, popping up the milestone cards.
// In both, the new page is revealed behind the rocket: a circle centred where
// the rocket topped out, whose edge follows the rocket's nose.
const flyingPage = ref(null)
const flyingRocket = ref(null)
const transitionFrom = ref(null) // old page, kept visible while the reveal runs
const pageContent = ref(null)
const trajectory = ref(null) // RocketTrajectory on the EduAustralis map
const eduProgress = ref(0) // 0..1 along the EduAustralis path

const EDU_PAGE = 'contact'

// EduAustralis milestone cards. `at` is how far along the path (0..1) the
// rocket must be for the card to pop up. `side` puts the card next to the part
// of the map the rocket is passing: the path runs clockwise from the top right,
// along the bottom and up the left side. `body` is trusted static HTML.
const eduMilestones = [
  {
    id: 1,
    at: 0.12,
    side: 'right',
    title: '¿Qué muestra este mapa?🤔',
    body: `
      <p>🛰️ Hay satélites que dan vueltas alrededor de la Tierra y sacan algo así como "fotos de calor". Cuando ven un lugar muy caliente, como un fuego, lo marcan con un puntito.</p>
      <p>Este mapa junta los puntitos de muchos años en seis países: Argentina, Chile, Uruguay, Paraguay, Bolivia y Brasil. Así podemos ver dónde y cuándo hubo fuego.</p>`,
  },
  {
    id: 2,
    at: 0.32,
    side: 'right',
    title: '¿Para qué sirve?🧐',
    body: `
      <p>Podemos saber en qué meses hay más fuego y si un año tuvo más o menos que lo normal. No en todos lados pasa en la misma época: en gran parte de Sudamérica los incendios aparecen entre julio y octubre, cuando casi no llueve, y en el sur de Argentina, de diciembre a marzo, en pleno verano. Saberlo ayuda a los brigadistas y guardaparques a estar listos en el momento justo 🚒.</p>
      <p>Un puntito quiere decir "acá el satélite vio algo muy caliente". No siempre es un incendio grande. Y si hay nubes, a veces el satélite no ve nada.</p>`,
  },
  {
    id: 3,
    at: 0.52,
    side: 'bottom',
    title: 'Tipos de incendios🔥',
    body: `
      <p>Los incendios que pasan en la naturaleza pueden avanzar de tres maneras:</p>
      <ul>
        <li>🌾 <strong>El que corre por el piso:</strong> quema pasto, hojas y ramitas.</li>
        <li>🌲 <strong>El que salta a los árboles:</strong> sube hasta las copas y avanza por arriba.</li>
        <li>🪨 <strong>El que se esconde abajo:</strong> arde bajo la tierra, quemando raíces.</li>
      </ul>`,
  },
  {
    id: 4,
    at: 0.7,
    side: 'left',
    title: '¿Qué pasa después de un incendio?🛘',
    body: `
      <ul>
        <li>🐆 Muchos animales pierden su casa. En 2020, los incendios del Pantanal, en Brasil, afectaron a casi la mitad de los yaguaretés que viven ahí.</li>
        <li>💨 El humo tiene partículas tan chiquitas que se meten hasta el fondo de los pulmones. Y el viento lo puede llevar hasta otros países.</li>
        <li>🌧️ El suelo queda pelado y la lluvia y el viento se lo llevan.</li>
        <li>🌳 Algunas plantas aguantan el fuego y vuelven a crecer rápido, como las del Cerrado de Brasil, que tienen una corteza muy gruesa. Otras no: la lenga, un árbol de la cordillera, puede tardar siglos en volver, y a veces no vuelve nunca.</li>
      </ul>`,
  },
  {
    id: 5,
    at: 0.88,
    side: 'left',
    title: '¿Cómo podemos cuidarnos?🧯',
    body: `
      <p>¿Sabías que casi todos los incendios forestales empiezan por algo que hizo una persona? Eso quiere decir que entre todos podemos evitarlos.</p>
      <ul>
        <li>🚫 <strong>Fósforos y encendedores no son juguetes.</strong> Si encontrás uno, dáselo a un adulto.</li>
        <li>💧 <strong>Fogón bien apagado.</strong> En un campamento, ayudá a echar mucha agua hasta que las cenizas estén frías.</li>
        <li>🗑️ <strong>Llevate tu basura.</strong> Las latas y los vidrios pueden hacer de lupa con el sol y empezar un fuego.</li>
        <li>📞 <strong>Si ves humo, avisá.</strong> Contale enseguida a un adulto para que llame a emergencias.</li>
      </ul>`,
  },
]
// Left column reads top-to-bottom as 5 then 4 (the rocket climbs the left side)
const eduLeft = eduMilestones.filter((m) => m.side === 'left').reverse()
const eduRight = eduMilestones.filter((m) => m.side === 'right')
const eduBottom = eduMilestones.filter((m) => m.side === 'bottom')

// Accordion: only one card is open at a time. Clicking the open card closes
// it; clicking another one switches to it.
const openCard = ref(null)
const toggleCard = (id) => {
  openCard.value = openCard.value === id ? null : id
}

// Points on the rocket image, as fractions of its 512px source:
// the middle of the body (pivot) and the tip of the nose
const BODY = { x: 300 / 512, y: 210 / 512 }
const NOSE = { x: 495 / 512, y: 17 / 512 }
const CLIMB_MS = 1575
const DIVE_MS = 945
const EDU_LEAD_MS = 1200 // button -> start of the map path
const EDU_PATH_MS = 8000 // along the map path
const EDU_EXIT_MS = 1800 // end of the path -> off screen (at most)
const REVEAL_FEATHER = 40 // soft edge of the reveal circle, px

const cubic = (a, b, c, d, t) => {
  const u = 1 - t
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d
}
const cubicSlope = (a, b, c, d, t) => {
  const u = 1 - t
  return 3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c)
}
const pointAt = (p, t) => ({
  x: cubic(p[0].x, p[1].x, p[2].x, p[3].x, t),
  y: cubic(p[0].y, p[1].y, p[2].y, p[3].y, t),
})
const angleAt = (p, t) =>
  Math.atan2(
    cubicSlope(p[0].y, p[1].y, p[2].y, p[3].y, t),
    cubicSlope(p[0].x, p[1].x, p[2].x, p[3].x, t),
  ) * (180 / Math.PI)

const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2
const smoothstep = (t) => t * t * (3 - 2 * t)
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

// Climb easing: eases in from the pad but keeps `endSlope` of its speed at the
// end, so the next stage can carry on without a pause
const easeInKeepSpeed = (endSlope) => (p) => (1 - endSlope) * easeInOutSine(p) + endSlope * p

// Log-scale growth with an ease-in-out: no jump at takeoff, settles gently
const growth = (from, to) => (p) => from * Math.pow(to / from, easeInOutCubic(Math.min(p, 1)))

const setMask = (el, value) => {
  el.style.maskImage = value
  el.style.webkitMaskImage = value
}

// The arc used by most pages. Returns { maxSize, sample(elapsed) }, where
// sample gives the body position, heading, size and reveal catch-up (or null
// once the flight is over).
function arcRoute(start, startSize) {
  const W = window.innerWidth
  const H = window.innerHeight
  const diag = Math.hypot(W, H)
  const maxSize = Math.max(startSize * 3, Math.min(W, H) * 0.35)
  const centre = { x: W / 2, y: H / 2 }
  const dir = { x: -W / diag, y: H / diag } // from the centre towards the lower-left corner

  const climb = [
    start,
    { x: Math.min(start.x + W * 0.3, W * 0.95), y: -H * 0.12 },
    { x: centre.x - dir.x * diag * 0.35, y: centre.y - dir.y * diag * 0.35 },
    centre,
  ]
  const exit = diag / 2 + maxSize * 0.85
  const dive = [
    centre,
    { x: centre.x + dir.x * exit * 0.33, y: centre.y + dir.y * exit * 0.33 },
    { x: centre.x + dir.x * exit * 0.66 - W * 0.1, y: centre.y + dir.y * exit * 0.66 },
    { x: centre.x + dir.x * exit, y: centre.y + dir.y * exit },
  ]

  // Keep the speed continuous where the climb hands over to the dive
  const CLIMB_END_SLOPE = 0.5
  const climbEase = easeInKeepSpeed(CLIMB_END_SLOPE)
  const climbEndSpeed =
    (Math.hypot(climb[3].x - climb[2].x, climb[3].y - climb[2].y) * 3 * CLIMB_END_SLOPE) / CLIMB_MS
  const diveStartRate = Math.hypot(dive[1].x - dive[0].x, dive[1].y - dive[0].y) * 3 / DIVE_MS
  const diveLinear = Math.min(1, Math.max(0, climbEndSpeed / diveStartRate))
  const diveEase = (d) => diveLinear * d + (1 - diveLinear) * d * d
  const sizeAt = growth(startSize, maxSize)

  return {
    maxSize,
    sample(elapsed) {
      if (elapsed < CLIMB_MS) {
        const p = elapsed / CLIMB_MS
        const t = climbEase(p)
        return { body: pointAt(climb, t), heading: angleAt(climb, Math.max(t, 0.001)), size: sizeAt(p), catchUp: 0 }
      }
      const d = (elapsed - CLIMB_MS) / DIVE_MS
      if (d >= 1) return null
      const t = diveEase(d)
      return { body: pointAt(dive, t), heading: angleAt(dive, Math.max(t, 0.001)), size: maxSize, catchUp: smoothstep(d) }
    },
  }
}

// The EduAustralis route: lift-off -> the trajectory path over the map -> off screen
function eduRoute(start, startSize) {
  const { pathEl, stageEl, viewBox } = trajectory.value
  const [, , vbW, vbH] = viewBox.split(/[\s,]+/).map(Number)
  const W = window.innerWidth
  const H = window.innerHeight

  // Path point (viewBox units) -> window px. The SVG is stretched to the map
  // frame, so x and y scale separately. Re-read the frame every frame in case
  // the section scrolls.
  const toWindow = (pt) => {
    const r = stageEl.getBoundingClientRect()
    return { x: r.left + (pt.x / vbW) * r.width, y: r.top + (pt.y / vbH) * r.height }
  }

  // Sample the path in window px so the rocket moves at a constant on-screen speed
  const total = pathEl.getTotalLength()
  const SAMPLES = 240
  const samples = []
  let length = 0
  for (let i = 0; i <= SAMPLES; i++) {
    const vb = pathEl.getPointAtLength((i / SAMPLES) * total)
    const win = toWindow(vb)
    if (i > 0) length += Math.hypot(win.x - samples[i - 1].win.x, win.y - samples[i - 1].win.y)
    samples.push({ vb, win, at: length })
  }
  const along = (dist) => {
    // Binary search the sample whose cumulative length straddles `dist`
    let lo = 0
    let hi = SAMPLES
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (samples[mid].at < dist) lo = mid
      else hi = mid
    }
    const a = samples[lo]
    const b = samples[hi]
    const f = b.at > a.at ? (dist - a.at) / (b.at - a.at) : 0
    const vb = { x: a.vb.x + (b.vb.x - a.vb.x) * f, y: a.vb.y + (b.vb.y - a.vb.y) * f }
    const pa = toWindow(a.vb)
    const pb = toWindow(b.vb)
    return {
      body: toWindow(vb),
      heading: Math.atan2(pb.y - pa.y, pb.x - pa.x) * (180 / Math.PI),
      // Share of the path's own length (samples are evenly spaced along it)
      fraction: (lo + f) / SAMPLES,
    }
  }

  const frame0 = stageEl.getBoundingClientRect()
  const cruiseSize = Math.min(90, Math.max(40, frame0.width * 0.07))

  // The path opens with a small hook (it points up-left, then curls right).
  // Aiming the lift-off into that hook made the rocket loop and spin on the
  // spot, so the lift-off joins the path at the top of the hook instead,
  // already heading right, and from there follows the path exactly.
  let join = 0
  for (let i = 1; i <= SAMPLES * 0.25; i++) {
    if (samples[i].win.y < samples[join].win.y) join = i
  }
  const joinAt = samples[join].at
  const pathLength = length - joinAt
  const speed = pathLength / EDU_PATH_MS // px per ms along the map path

  // Lift-off: rise from the button, then arc onto the path at the join point,
  // arriving along the path's direction at the path's speed (no pause)
  const entry = samples[join].win
  const next = samples[Math.min(join + 2, SAMPLES)].win
  const entryLen = Math.hypot(next.x - entry.x, next.y - entry.y) || 1
  const entryDir = { x: (next.x - entry.x) / entryLen, y: (next.y - entry.y) / entryLen }
  const LEAD_END_SLOPE = 0.5
  const handle = Math.min(320, Math.max(40, (speed * EDU_LEAD_MS) / (3 * LEAD_END_SLOPE)))
  const lead = [
    start,
    { x: start.x, y: start.y - H * 0.15 },
    { x: entry.x - entryDir.x * handle, y: entry.y - entryDir.y * handle },
    entry,
  ]
  const leadEase = easeInKeepSpeed(LEAD_END_SLOPE)
  const sizeAt = growth(startSize, cruiseSize)

  // Exit: keep going the way the path ends until the rocket is off screen.
  // It leaves at the path's own speed and only speeds up gently if it needs
  // to, so the ending is unhurried.
  const exitFrom = samples[SAMPLES].win
  const before = samples[SAMPLES - 2].win
  const exitLen = Math.hypot(exitFrom.x - before.x, exitFrom.y - before.y) || 1
  const exitDir = { x: (exitFrom.x - before.x) / exitLen, y: (exitFrom.y - before.y) / exitLen }
  const exitHeading = Math.atan2(exitDir.y, exitDir.x) * (180 / Math.PI)
  // Distance until the whole rocket is past whichever screen edge it reaches first
  const margin = cruiseSize
  const toEdge = [
    exitDir.x < 0 ? (exitFrom.x + margin) / -exitDir.x : Infinity,
    exitDir.x > 0 ? (W - exitFrom.x + margin) / exitDir.x : Infinity,
    exitDir.y < 0 ? (exitFrom.y + margin) / -exitDir.y : Infinity,
    exitDir.y > 0 ? (H - exitFrom.y + margin) / exitDir.y : Infinity,
  ]
  const exitDistance = Math.min(...toEdge)
  const exitExtra = Math.max(0, exitDistance - speed * EDU_EXIT_MS)

  return {
    maxSize: cruiseSize,
    sample(elapsed) {
      if (elapsed < EDU_LEAD_MS) {
        const p = elapsed / EDU_LEAD_MS
        const t = leadEase(p)
        eduProgress.value = 0
        return { body: pointAt(lead, t), heading: angleAt(lead, Math.max(t, 0.001)), size: sizeAt(p), catchUp: 0 }
      }
      const pathTime = elapsed - EDU_LEAD_MS
      if (pathTime < EDU_PATH_MS) {
        const progress = pathTime / EDU_PATH_MS
        const { body, heading, fraction } = along(joinAt + progress * pathLength)
        eduProgress.value = fraction // drives the trail and the milestone cards
        // The page is fully revealed a third of the way along the path
        return { body, heading, size: cruiseSize, catchUp: smoothstep(Math.min(1, progress * 3)) }
      }
      eduProgress.value = 1
      const e = (pathTime - EDU_PATH_MS) / EDU_EXIT_MS
      const s = speed * EDU_EXIT_MS * e + exitExtra * e * e
      if (e >= 1 || s >= exitDistance) return null
      return {
        body: { x: exitFrom.x + exitDir.x * s, y: exitFrom.y + exitDir.y * s },
        heading: exitHeading,
        size: cruiseSize,
        catchUp: 1,
      }
    },
  }
}

// The flight in progress. It can be interrupted by another click once the new
// page is fully revealed (the EduAustralis rocket keeps cruising for a while).
let activeFlight = null

async function flyRocket(pageId, button) {
  const fromId = currentPage.value

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    currentPage.value = pageId
    eduProgress.value = 1
    return
  }

  // Rocket coordinates are in the window (it flies over the navigation bar)
  const source = button.querySelector('.nav-rocket img')
  const rect = source.getBoundingClientRect()
  const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  const startSize = source.offsetWidth || 32

  // Show both pages stacked; the masks decide which one is visible where
  flyingPage.value = pageId
  transitionFrom.value = fromId
  currentPage.value = pageId
  eduProgress.value = 0
  await nextTick()
  const el = flyingRocket.value
  const oldPanel = document.getElementById(`${fromId}-page`)
  const newPanel = document.getElementById(`${pageId}-page`)

  const route = pageId === EDU_PAGE ? eduRoute(start, startSize) : arcRoute(start, startSize)
  const { maxSize } = route

  // The image is laid out at its largest flight size and only ever scaled
  // down, so the browser never has to blow up a small raster
  el.style.width = el.style.height = `${maxSize}px`
  const pivot = { x: BODY.x * maxSize, y: BODY.y * maxSize }
  el.style.transformOrigin = `${pivot.x}px ${pivot.y}px`

  // The image natively points up-right (-45deg), so add 45deg to the heading.
  // Returns where the nose tip ends up, for the reveal.
  const place = ({ x, y }, heading, size) => {
    const rotation = heading + 45
    el.style.transform =
      `translate(${x - pivot.x}px, ${y - pivot.y}px) rotate(${rotation}deg) scale(${size / maxSize})`
    const rad = rotation * (Math.PI / 180)
    const nx = (NOSE.x - BODY.x) * size
    const ny = (NOSE.y - BODY.y) * size
    return {
      x: x + nx * Math.cos(rad) - ny * Math.sin(rad),
      y: y + nx * Math.sin(rad) + ny * Math.cos(rad),
    }
  }

  // The reveal circle only appears once the rocket has topped out above the
  // navigation bar and starts coming down. It's centred on where the nose was
  // at that moment, and its edge then follows the nose.
  let origin = null
  let fullRadius = 0
  let reached = 0
  let prevY = start.y
  let revealed = false

  const hideNewPage = () => {
    setMask(newPanel, 'linear-gradient(transparent, transparent)')
    setMask(oldPanel, '')
  }

  const clearMasks = () => {
    setMask(newPanel, '')
    setMask(oldPanel, '')
    transitionFrom.value = null
  }

  // `catchUp` (0..1) guarantees the far corners are revealed by the end
  const reveal = (body, nose, catchUp) => {
    if (revealed) return
    if (!origin) {
      const descending = body.y > prevY
      prevY = body.y
      if (!descending) {
        hideNewPage()
        return
      }
      origin = { ...nose }
      // Distance the reveal needs to cover every visible corner of the
      // content. Only the part inside the active section counts: content
      // scrolled out of view is uncovered when the masks are removed, and
      // counting it made the circle jump to catch up at the very end.
      const c = pageContent.value.getBoundingClientRect()
      const v = pageContent.value.closest('.active-section').getBoundingClientRect()
      const box = {
        left: Math.max(c.left, v.left),
        right: Math.min(c.right, v.right),
        top: Math.max(c.top, v.top),
        bottom: Math.min(c.bottom, v.bottom),
      }
      fullRadius = REVEAL_FEATHER + Math.max(
        ...[[box.left, box.top], [box.right, box.top], [box.left, box.bottom], [box.right, box.bottom]]
          .map(([x, y]) => Math.hypot(x - origin.x, y - origin.y)),
      )
    }

    reached = Math.max(reached, Math.hypot(nose.x - origin.x, nose.y - origin.y), fullRadius * catchUp)
    if (reached >= fullRadius) {
      // Fully revealed: drop the old page and allow the next click
      revealed = true
      clearMasks()
      return
    }
    const inner = Math.max(0, reached - REVEAL_FEATHER)
    // Both panels share the page-content origin (stacked in one grid cell)
    const content = pageContent.value.getBoundingClientRect()
    const at = `circle at ${origin.x - content.left}px ${origin.y - content.top}px`
    setMask(newPanel, `radial-gradient(${at}, #000 ${inner}px, transparent ${reached}px)`)
    setMask(oldPanel, `radial-gradient(${at}, transparent ${inner}px, #000 ${reached}px)`)
  }

  let rafId = 0
  const flight = {
    get interruptible() {
      return revealed
    },
    stop() {
      cancelAnimationFrame(rafId)
      if (!revealed) clearMasks()
      flyingPage.value = null
      activeFlight = null
    },
  }
  activeFlight = flight

  const startTime = performance.now()
  const frame = (now) => {
    const s = route.sample(now - startTime)
    if (!s) {
      flight.stop()
      return
    }
    reveal(s.body, place(s.body, s.heading, s.size), s.catchUp)
    rafId = requestAnimationFrame(frame)
  }

  place(start, -90, startSize)
  hideNewPage()
  rafId = requestAnimationFrame(frame)
}

// Receiver-screen clouds. `top` is within the bottom 20% band of the screen;
// negative delays start each one part-way across so the sky isn't empty at load.
const passingClouds = [
  { id: 1, top: '8%', scale: 0.8, opacity: 0.5, duration: '38s', delay: '-4s' },
  { id: 2, top: '45%', scale: 0.8, opacity: 0.3, duration: '46s', delay: '-20s' },
  { id: 3, top: '20%', scale: 0.5, opacity: 0.4, duration: '42s', delay: '-31s' },
  { id: 4, top: '62%', scale: 0.9, opacity: 0.2, duration: '52s', delay: '-12s' },
  { id: 5, top: '30%', scale: 0.7, opacity: 0.35, duration: '34s', delay: '-26s' },
]

// The slider picks the month shown on the map: its value is an index into the
// list of months the map reports once it has loaded.
const mapValue = ref(0)
const mapMonths = ref([])
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre']
const mapMonthLabel = computed(() => {
  const month = mapMonths.value[mapValue.value]
  if (!month) return 'Mes del mapa'
  const [year, m] = month.split('-')
  return `Mes del mapa: ${MONTH_NAMES[Number(m) - 1]} de ${year}`
})

async function onMapReady({ months, index }) {
  mapMonths.value = months
  await nextTick() // the slider needs its new range before the value
  mapValue.value = index
}

const pages = [
  { id: 'mapa', label: 'Mapa', heading: 'Mapa' },
  { id: 'about', label: 'Acerca del Equipo', heading: 'This is the Terra Australis team!' },
  { id: 'projects', label: '¿Cómo funciona?', heading: '¿Cómo funciona?' },
  { id: 'simplified', label: 'Cómo funciona: Simplificado', heading: 'Cómo funciona: Simplificado' },
  { id: 'contact', label: 'EduAustralis', heading: 'EduAustralis' },
]

</script>

<template>
  <div id="stars" :class="{ 'is-launching': launching }" aria-hidden="true">
    <img src="/images/stars.png" alt="">
  </div>

  <div
    class="launch-cover"
    :class="{ 'is-active': launching }"
    aria-hidden="true"
  ></div>

  <Transition name="screen">
    <section
      v-if="!launched"
      key="receiver"
      class="receiver-screen"
      :class="{ 'is-launching': launching }"
    >
      <!-- Clouds drifting past along the bottom of the sky -->
      <div class="passing-clouds" aria-hidden="true">
        <span
          v-for="cloud in passingClouds"
          :key="cloud.id"
          class="cloud passing-cloud"
          :style="{
            '--cloud-top': cloud.top,
            '--cloud-scale': cloud.scale,
            '--cloud-opacity': cloud.opacity,
            '--cloud-duration': cloud.duration,
            '--cloud-delay': cloud.delay,
          }"
        ></span>
      </div>

      <button class="launch-button" type="button" :disabled="launching" @click="launch">
        <span class="launch-label">
          <span class="cloud label-cloud" aria-hidden="true"></span>
          <span class="launch-label-text">Click the rocket to launch!</span>
        </span>
        <span class="coheteReceiver" @animationend="onRocketAnimationEnd">
          <img src="/images/PLACEHOLDER_cohete.png" alt="">
        </span>
      </button>
    </section>

    <main v-else key="website" class="website-screen">
      <header class="site-header">
        <nav class="site-navigation" aria-label="Main navigation">
          <button
            v-for="page in pages"
            :key="page.id"
            type="button"
            class="navigation-button"
            :class="{
              'is-active': currentPage === page.id,
              'is-flying': flyingPage === page.id,
            }"
            :aria-controls="`${page.id}-page`"
            :aria-current="currentPage === page.id ? 'page' : undefined"
            @click="navigate(page.id, $event)"
          >
            <span class="nav-rocket" aria-hidden="true">
              <img src="/images/PLACEHOLDER_cohete.png" alt="">
            </span>
            {{ page.label }}
          </button>
        </nav>
      </header>

      <!-- Flies over the navigation bar and the active section -->
      <img
        v-if="flyingPage"
        ref="flyingRocket"
        class="flying-rocket"
        src="/images/PLACEHOLDER_cohete.png"
        alt=""
        aria-hidden="true"
      >

      <!-- Active section: everything below the navigation bar -->
      <div class="active-section">

        <div class="content-layout">
          <section ref="pageContent" class="page-content" aria-live="polite">
            <div
              v-for="page in pages"
              v-show="currentPage === page.id || transitionFrom === page.id"
              :id="`${page.id}-page`"
              :key="page.id"
              class="page-panel"
              :aria-labelledby="`${page.id}-heading`"
              :aria-hidden="transitionFrom === page.id ? 'true' : undefined"
            >
              <h1 :id="`${page.id}-heading`">{{ page.heading }}</h1>
              <p v-if="page.text">{{ page.text }}</p>
              <template v-if="page.id === 'mapa'">
                <MapView :month-index="mapMonths.length ? mapValue : null" @ready="onMapReady" />
                <MapSlider
                  v-model="mapValue"
                  :max="Math.max(1, mapMonths.length - 1)"
                  :label="mapMonthLabel"
                />
              </template>

              <!-- EduAustralis: the same map, with the milestone cards around it -->
              <div v-if="page.id === 'contact'" class="edu-layout">
                <div
                  v-for="column in [
                    { name: 'left', cards: eduLeft },
                    { name: 'right', cards: eduRight },
                    { name: 'bottom', cards: eduBottom },
                  ]"
                  :key="column.name"
                  class="edu-column"
                  :class="`edu-${column.name}`"
                >
                  <!-- Always rendered (hidden) so each card's space is held from the start -->
                  <!-- Collapsible: the whole card toggles; the header button gives
                       keyboard access (its click bubbles up to the card) -->
                  <article
                    v-for="m in column.cards"
                    :key="m.id"
                    class="milestone-card"
                    :class="{ 'is-shown': eduProgress >= m.at, 'is-open': openCard === m.id }"
                    @click="toggleCard(m.id)"
                  >
                    <h3>
                      <button
                        type="button"
                        class="milestone-toggle"
                        :aria-expanded="openCard === m.id ? 'true' : 'false'"
                        :aria-controls="`milestone-${m.id}`"
                      >
                        <span>{{ m.title }}</span>
                        <span class="milestone-chevron" aria-hidden="true"></span>
                      </button>
                    </h3>
                    <div :id="`milestone-${m.id}`" class="milestone-body" v-html="m.body"></div>
                  </article>
                </div>

                <MapView class="edu-map">
                  <RocketTrajectory
                    :ref="(c) => { trajectory = c }"
                    :progress="eduProgress"
                  />
                </MapView>
              </div>

              <HowItWorks v-if="page.id === 'projects'" />
              <HowItWorksSimple v-if="page.id === 'simplified'" />

              <template v-if="page.id === 'about'">
                <article class="about-block" lang="en">
                  <h2>About us!</h2>
                  <p>
                    The Terra Australis team combined engineering students from two disciplines:
                    telecommunications and software development. Two young collaborators also joined
                    the project, contributing ideas about the design and overall feel of the app so
                    that it would be welcoming to people beyond specialists. Our goal was to make the
                    project a bridge between two audiences. On one side, it is a technical tool that
                    professionals can use to analyze hotspot data from satellite imagery. On the
                    other, it includes a dedicated Education section that translates the same
                    information into elementary-level language, introducing younger users to
                    environmental awareness and fire prevention.
                  </p>
                </article>

                <article class="about-block" lang="es">
                  <h2>Acerca de nosotros!</h2>
                  <p>
                    El equipo Terra Australis combinó estudiantes de ingeniería de dos áreas:
                    telecomunicaciones e informática. Además, dos niños colaboraron en el proyecto
                    aportando ideas sobre el diseño y la identidad visual de la app, para que resultara
                    accesible y atractiva también para quienes no son especialistas. Nuestro objetivo
                    fue que el proyecto funcionara como un punto de encuentro entre dos públicos. Por
                    un lado, es una herramienta técnica que los profesionales pueden usar para analizar
                    los focos de calor captados por satélite. Por otro, incluye una sección educativa
                    que adapta esa misma información a un nivel de primaria, introduciendo a los más
                    jóvenes en la conciencia ambiental y en la prevención de incendios.
                  </p>
                </article>

                <!-- PLACEHOLDER: replace with <img src="/images/team.jpg" alt="The Terra Australis team"> -->
                <figure class="team-photo">
                  <div class="team-photo-placeholder">Team photo</div>
                </figure>
              </template>
            </div>
          </section>
        </div>
      </div>
    </main>
  </Transition>
</template>
