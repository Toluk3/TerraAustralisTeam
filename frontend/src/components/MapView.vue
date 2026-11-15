<script setup>
/**
 * MapView.vue
 * El mapa de focos (módulo frontend/map: MapLibre + deck.gl) dentro de la página. Lo usan la página Mapa
 * y EduAustralis.
 *
 * - El marco de 1085 × 622 coincide con el viewBox de RocketTrajectory, que va en el slot y queda encima
 *   del mapa sin tapar los clics.
 * - `game` agrega el botón "Jugar" (juego de apagar incendios).
 * - `monthIndex` elige el mes que se muestra, como índice de la lista que llega en el evento `ready`.
 * - El mapa se crea la primera vez que el marco se ve: las páginas ocultas no gastan un contexto WebGL.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { loadMapModule } from './mapData.js'

const props = defineProps({
  game: { type: Boolean, default: true },
  monthIndex: { type: Number, default: null },
  basemap: { type: String, default: 'claro' }, // claro | calles | oscuro | satelite
})
// ready: { months: ['YYYY-MM', …], index } con el mes que quedó elegido
const emit = defineEmits(['ready'])

const frameEl = ref(null)
const mapEl = ref(null)
const status = ref('Cargando el mapa…')

let map = null
let game = null
let months = []
let observer = null
let started = false
let destroyed = false

const monthAt = (i) => months[Math.min(months.length - 1, Math.max(0, Math.round(i)))]

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

async function start() {
  if (started) return
  started = true
  try {
    const { createFireMap, createFireGame, source } = await loadMapModule()
    if (destroyed) return
    const meta = await source.getMeta()
    months = [...meta.map.months].sort()
    const index = props.monthIndex != null && props.monthIndex < months.length && props.monthIndex > 0
      ? props.monthIndex
      : months.length - 1
    map = await createFireMap(mapEl.value, { source, basemap: props.basemap, period: { from: monthAt(index) } })
    if (destroyed) {
      map.destroy()
      return
    }
    if (props.game) game = createFireGame(map)
    tidyForSmallFrame()
    status.value = ''
    emit('ready', { months, index })
  } catch (error) {
    started = false
    status.value = `No se pudo cargar el mapa: ${error.message ?? error}`
  }
}

watch(() => props.monthIndex, (i) => {
  if (map && i != null && months.length) map.setPeriod({ from: monthAt(i) })
})

onMounted(() => {
  observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) start()
    else game?.close() // al cambiar de página, el juego no sigue corriendo escondido
  })
  observer.observe(frameEl.value)
})

onBeforeUnmount(() => {
  destroyed = true
  observer?.disconnect()
  game?.destroy()
  map?.destroy()
})

defineExpose({ getMap: () => map, getGame: () => game })
</script>

<template>
  <div ref="frameEl" class="map-view">
    <div ref="mapEl" class="map-view-map"></div>
    <slot />
    <span v-if="status" class="map-view-label">{{ status }}</span>
  </div>
</template>

<style scoped>
.map-view {
  position: relative;
  width: 100%;
  aspect-ratio: 1085 / 622;
  /* Que entre en la pantalla sin scroll: debajo queda el slider de meses */
  max-height: calc(100dvh - 20rem);
  min-height: 320px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(8, 10, 13, 0.3);
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
