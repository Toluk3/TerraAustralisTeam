<script setup>
/**
 * MapView.vue
 * El mapa de focos (módulo frontend/map: MapLibre + deck.gl) dentro de la página. Lo usan la página Mapa
 * y EduAustralis.
 *
 * - El marco de 1085 × 622 coincide con el viewBox de RocketTrajectory, que va en el slot y queda encima
 *   del mapa sin tapar los clics.
 * - `timebar` agrega debajo la barra de tiempo del módulo del mapa (map/src/timebar), que elige el
 *   período que se muestra.
 * - `game` agrega el botón "Jugar" (juego de apagar incendios). Mientras se juega, el mapa pasa a
 *   pantalla completa.
 * - El mapa se crea la primera vez que el marco se ve: las páginas ocultas no gastan un contexto WebGL.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { loadMapModule } from './mapData.js'

const props = defineProps({
  timebar: { type: Boolean, default: false },
  game: { type: Boolean, default: false },
  basemap: { type: String, default: 'claro' }, // claro | calles | oscuro | satelite
})

const frameEl = ref(null)
const mapEl = ref(null)
const timebarEl = ref(null)
const status = ref('Cargando el mapa…')
const playing = ref(false)

let map = null
let timebarApi = null
let gameApi = null
let observer = null
let started = false
let destroyed = false

// La atribución arranca desplegada y la leyenda abierta: en un marco chico (EduAustralis) tapan medio
// mapa. Las dos quedan a un clic.
function tidyForSmallFrame() {
  mapEl.value.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
  mapEl.value.querySelector('.maplibregl-ctrl-attrib')?.removeAttribute('open')
  if (frameEl.value.clientWidth < 900) {
    const legend = mapEl.value.querySelector('.tam-map__legend details')
    if (legend) legend.open = false
  }
}

// Mientras se juega, el mapa pasa a pantalla completa y la barra de navegación (que se dibuja por encima
// de la sección activa) se oculta
function setPlaying(on) {
  playing.value = on
  document.documentElement.classList.toggle('map-game-open', on)
}

function destroyAll() {
  gameApi?.destroy()
  timebarApi?.destroy()
  map?.destroy()
  gameApi = timebarApi = map = null
}

async function start() {
  if (started) return
  started = true
  try {
    const { createFireMap, createTimebar, createFireGame, source } = await loadMapModule()
    const meta = await source.getMeta()
    if (destroyed) return
    // Igual que en la demo del mapa: arranca en el último mes con datos
    const period = { from: meta.coverage.to.slice(0, 7) }
    ;[map, timebarApi] = await Promise.all([
      createFireMap(mapEl.value, { source, basemap: props.basemap, period }),
      props.timebar ? createTimebar(timebarEl.value, { source, value: period }) : null,
    ])
    if (destroyed) {
      destroyAll()
      return
    }
    timebarApi?.on('input', (p) => map.setPeriod(p))
    if (props.game) {
      gameApi = createFireGame(map)
      gameApi.on('open', () => setPlaying(true))
      gameApi.on('exit', () => setPlaying(false))
    }
    tidyForSmallFrame()
    status.value = ''
  } catch (error) {
    destroyAll()
    started = false
    status.value = `No se pudo cargar el mapa: ${error.message ?? error}`
  }
}

onMounted(() => {
  observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) start()
    else {
      // Al cambiar de página, nada sigue corriendo escondido
      gameApi?.close()
      timebarApi?.pause()
    }
  })
  observer.observe(frameEl.value)
})

onBeforeUnmount(() => {
  destroyed = true
  if (playing.value) setPlaying(false)
  observer?.disconnect()
  destroyAll()
})

defineExpose({ getMap: () => map, getTimebar: () => timebarApi, getGame: () => gameApi })
</script>

<template>
  <div class="map-view">
    <div ref="frameEl" class="map-view-frame" :class="{ 'has-timebar': props.timebar, 'is-playing': playing }">
      <div ref="mapEl" class="map-view-map"></div>
      <slot />
      <span v-if="status" class="map-view-label">{{ status }}</span>
    </div>
    <div v-if="props.timebar" v-show="!playing" ref="timebarEl" class="map-view-timebar"></div>
  </div>
</template>

<style scoped>
.map-view {
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 0.5rem;
  background: rgba(8, 10, 13, 0.3);
}

.map-view-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 1085 / 622;
  min-height: 320px;
  color: rgba(255, 255, 255, 0.7);
}

/* Mientras se juega, el mapa ocupa toda la pantalla: en el marco de EduAustralis los hexágonos quedarían
   demasiado chicos para acertarles */
.map-view-frame.is-playing {
  position: fixed;
  inset: 0;
  z-index: 100;
  width: 100vw;
  height: 100dvh;
  max-height: none;
  aspect-ratio: auto;
  background: #0e1117;
}

/* La trayectoria del cohete (slot) no va sobre el juego */
.map-view-frame.is-playing :deep(.rocket-stage) {
  display: none;
}

/* Con la barra de tiempo debajo, que las dos entren en la pantalla sin scroll */
.map-view-frame.has-timebar {
  max-height: calc(100dvh - 22rem);
}

.map-view-map {
  position: absolute;
  inset: 0;
}

.map-view-label {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 1rem;
  text-align: center;
  pointer-events: none;
}
</style>

<style>
/* Global: la barra de navegación está fuera de este componente */
.map-game-open .site-header {
  visibility: hidden;
}
</style>
