<script setup>
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import AppNavbar from './components/layout/AppNavbar.vue';
import AppFooter from './components/layout/AppFooter.vue';

const { t, locale } = useI18n();
const route = useRoute();

// Fondo de cielo (y estrellas en oscuro) en todas las pantallas menos Análisis
const space = computed(() => Boolean(route.name) && route.name !== 'analysis');
watch(space, (on) => document.documentElement.classList.toggle('space', on), { immediate: true });

// Con historial por hash, href="#main" cambiaría de ruta: el salto se hace a mano
function skip() {
  const main = document.getElementById('main');
  main?.focus({ preventScroll: true });
  main?.scrollIntoView();
}

// <title> del documento según la pantalla y el idioma
watch(
  () => [route.name, locale.value],
  () => {
    const page = { home: null, analysis: 'nav.analysis', project: 'nav.project', team: 'nav.team', edu: 'EduAustralis' }[route.name];
    document.title = page ? `${page.startsWith('nav.') ? t(page) : page} · Terra Australis` : `Terra Australis · ${t('meta.title')}`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.description'));
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="space" class="stars" aria-hidden="true"></div>
  <a class="skip-link" href="#main" @click.prevent="skip">{{ t('nav.skip') }}</a>
  <AppNavbar />
  <main id="main" tabindex="-1">
    <RouterView />
  </main>
  <AppFooter />
</template>

<style>
/* Sin z-index propio: el juego a pantalla completa y el cohete de Edu tienen que quedar sobre el navbar */
#main { outline: none; min-height: 60vh; }
</style>
