<script setup>
defineProps({
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
  // Image shown inside the slider's handle. Drop the file into /public/images and update this path.
  thumbImage: { type: String, default: '/images/PLACEHOLDER_slider.png' },
  label: { type: String, default: 'Map slider' },
})

const value = defineModel({ type: Number, default: 0 })
</script>

<template>
  <div class="map-slider" :style="{ '--thumb-image': `url('${thumbImage}')` }">
    <input
      v-model.number="value"
      class="map-slider-input"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :aria-label="label"
    >
  </div>
</template>

<style scoped>
.map-slider {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 5;
  display: flex;
  justify-content: center;
  padding: 1.25rem 2rem 1.75rem;
  background: linear-gradient(0deg, rgba(8, 10, 13, 0.75) 0%, rgba(8, 10, 13, 0) 100%);
}

.map-slider-input {
  --thumb-size: 48px;
  width: min(100%, 900px);
  height: var(--thumb-size);
  margin: 0;
  background: transparent;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
}

.map-slider-input:focus {
  outline: none;
}

/* Track */
.map-slider-input::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.35);
}

.map-slider-input::-moz-range-track {
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.35);
}

/* Handle: holds the image (falls back to a plain circle until the image exists) */
.map-slider-input::-webkit-slider-thumb {
  width: var(--thumb-size);
  height: var(--thumb-size);
  margin-top: calc((6px - var(--thumb-size)) / 2);
  border: 0;
  border-radius: 50%;
  background-color: #315a8f;
  background-image: var(--thumb-image);
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
  box-shadow: 0 4px 14px rgba(8, 10, 13, 0.6);
  -webkit-appearance: none;
  appearance: none;
  transition: transform 0.2s ease;
}

.map-slider-input::-moz-range-thumb {
  width: var(--thumb-size);
  height: var(--thumb-size);
  border: 0;
  border-radius: 50%;
  background-color: #315a8f;
  background-image: var(--thumb-image);
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
  box-shadow: 0 4px 14px rgba(8, 10, 13, 0.6);
  transition: transform 0.2s ease;
}

.map-slider-input:hover::-webkit-slider-thumb,
.map-slider-input:focus-visible::-webkit-slider-thumb {
  transform: scale(1.1);
}

.map-slider-input:hover::-moz-range-thumb,
.map-slider-input:focus-visible::-moz-range-thumb {
  transform: scale(1.1);
}

.map-slider-input:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 3px #fff, 0 4px 14px rgba(8, 10, 13, 0.6);
}

.map-slider-input:focus-visible::-moz-range-thumb {
  box-shadow: 0 0 0 3px #fff, 0 4px 14px rgba(8, 10, 13, 0.6);
}
</style>
