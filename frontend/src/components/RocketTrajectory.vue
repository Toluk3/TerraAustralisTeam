<script setup>
/**
 * RocketTrajectory.vue
 * La trayectoria SVG que recorre el cohete sobre el mapa de EduAustralis.
 *
 * El cohete en sí es el mismo de los botones de navegación: App.vue lo hace
 * despegar del botón, entrar en esta trayectoria y seguirla, y nos pasa el
 * avance en `progress` (0..1) para dibujar la estela. Las tarjetas de los hitos
 * las coloca App.vue alrededor del mapa.
 */
import { ref } from 'vue'

const props = defineProps({
  // Trayectoria en coordenadas del viewBox (la línea roja de tu boceto)
  path: {
    type: String,
    default:
      'M713,68 C700,40 740,14 792,18 C885,24 962,95 966,225 C970,335 972,435 900,520 ' +
      'C820,600 650,610 480,604 C340,598 268,520 240,382 C222,292 192,222 140,162 ' +
      'C100,114 50,100 -40,95',
  },
  viewBox: { type: String, default: '0 0 1085 622' },
  progress: { type: Number, default: 0 }, // 0..1, lo controla el padre
  showTrail: { type: Boolean, default: true },
  trailColor: { type: String, default: 'transparent' }, // p. ej. '#ff4d4d' para ver la guía
})

const pathEl = ref(null)
const stageEl = ref(null)

// App.vue mide la trayectoria y la convierte a coordenadas de pantalla
defineExpose({ pathEl, stageEl, viewBox: props.viewBox })
</script>

<template>
  <div ref="stageEl" class="rocket-stage">
    <svg class="rocket-svg" :viewBox="viewBox" preserveAspectRatio="none" aria-hidden="true">
      <!-- Trayectoria de referencia (invisible) que usamos para medir -->
      <path ref="pathEl" :d="path" fill="none" stroke="none" />
      <!-- Estela que se dibuja a medida que avanza el cohete -->
      <path
        v-if="showTrail"
        :d="path"
        pathLength="1"
        class="trail"
        :style="{ stroke: trailColor, strokeDasharray: 1, strokeDashoffset: 1 - progress }"
      />
    </svg>
  </div>
</template>

<style scoped>
.rocket-stage {
  position: absolute;
  inset: 0;
  pointer-events: none; /* no bloquea la UI de debajo */
}
.rocket-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.trail {
  fill: none;
  stroke: #ff4d4d;
  stroke-width: 3;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}
</style>
