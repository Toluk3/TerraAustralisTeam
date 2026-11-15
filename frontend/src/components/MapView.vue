<script setup>
/**
 * MapView.vue
 * PLACEHOLDER for the fire map. The Mapa page and EduAustralis both render
 * this, so replacing its contents with the real map updates both pages.
 * The 1085 × 622 frame matches RocketTrajectory's default viewBox, so the
 * rocket's path lines up with the map underneath it.
 */
</script>

<template>
  <div class="map-view">
    <slot />
    <span class="map-view-label">Mapa</span>
  </div>
</template>

<style scoped>
.map-view {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1085 / 622;
  border: 2px dashed rgba(255, 255, 255, 0.45);
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(8, 10, 13, 0.3);
}

.map-view-label {
  pointer-events: none;
}
</style>
