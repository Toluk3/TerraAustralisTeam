<script setup>
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
const { t } = useI18n();
// Análisis ya muestra el aviso y los créditos en su recuadro fijo: acá no se repiten
const route = useRoute();
const year = new Date().getFullYear();
</script>

<template>
  <footer class="foot">
    <div class="wrap foot__inner">
      <div class="foot__brand">
        <img src="/logo.webp" width="44" height="44" alt="" />
        <div>
          <div class="brand-word">Terra Australis</div>
          <div class="muted">NASA Space Apps Challenge · {{ year }}</div>
        </div>
      </div>
      <template v-if="route.name !== 'analysis'">
        <p class="foot__note">{{ t('footer.notice') }}</p>
        <p class="foot__credit muted">{{ t('footer.credit') }}</p>
      </template>
    </div>
  </footer>
</template>

<style scoped>
.foot { border-top: 1px solid var(--line); margin-top: clamp(48px, 8vw, 96px); padding-block: 40px 48px; font-size: 0.92rem; }
.foot__inner { display: grid; grid-template-columns: auto 1fr; gap: 18px 40px; align-items: start; }
.foot__brand { display: flex; gap: 12px; align-items: center; grid-row: span 2; }
.foot__brand img { width: 44px; height: 44px; }
.foot__brand .brand-word { font-size: 1rem; margin-bottom: 4px; }
.foot__note, .foot__credit { margin: 0; max-width: 72ch; }
@media (max-width: 700px) { .foot__inner { grid-template-columns: 1fr; } .foot__brand { grid-row: auto; } }
</style>
