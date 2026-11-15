<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ui, setLocale, toggleTheme, effectiveTheme } from '@/stores/ui.js';

const { t } = useI18n();
const REPO = 'https://github.com/Toluk3/TerraAustralisTeam';

const links = [
  { to: '/', key: 'nav.home', name: 'home' },
  { to: '/analisis', key: 'nav.analysis', name: 'analysis' },
  { to: '/proyecto', key: 'nav.project', name: 'project' },
  { to: '/equipo', key: 'nav.team', name: 'team' },
  { to: '/edu', label: 'EduAustralis', name: 'edu' },
];

// --nav-h sigue el alto real de la barra (bajo 1100 px pasa a dos filas): las pantallas de una
// pantalla de alto y los anclajes lo usan.
const header = ref(null);
let ro = null;
onMounted(() => {
  ro = new ResizeObserver(() => {
    if (header.value) document.documentElement.style.setProperty('--nav-h', `${header.value.offsetHeight}px`);
  });
  ro.observe(header.value);
});
onBeforeUnmount(() => ro?.disconnect());

const dark = computed(() => effectiveTheme() === 'dark');
const themeLabel = computed(() => t(dark.value ? 'nav.themeToLight' : 'nav.themeToDark'));
</script>

<template>
  <header ref="header" class="nav">
    <div class="nav__inner">
      <RouterLink to="/" class="nav__brand" :aria-label="t('nav.homeLabel')">
        <img src="/logo.webp" width="56" height="56" alt="" class="nav__logo" />
        <span class="brand-word nav__word" aria-hidden="true">Terra<br />Australis</span>
      </RouterLink>

      <nav class="nav__pill" :aria-label="t('nav.label')">
        <ul>
          <li v-for="l in links" :key="l.to">
            <RouterLink :to="l.to" v-slot="{ href, navigate, isExactActive }" custom>
              <a :href="href" class="nav__link" :class="{ 'is-active': isExactActive }" :aria-current="isExactActive ? 'page' : undefined" @click="navigate">{{ l.label ?? t(l.key) }}</a>
            </RouterLink>
          </li>
        </ul>
      </nav>

      <div class="nav__tools">
        <div class="seg seg--sm" role="group" :aria-label="t('nav.language')">
          <button type="button" :aria-pressed="ui.locale === 'es'" lang="es" @click="setLocale('es')">ES</button>
          <button type="button" :aria-pressed="ui.locale === 'en'" lang="en" @click="setLocale('en')">EN</button>
        </div>
        <button type="button" class="nav__theme" :aria-label="themeLabel" :title="themeLabel" @click="toggleTheme">
          <svg v-if="dark" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <svg v-else viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 14.2A8 8 0 1 1 9.8 4a6.4 6.4 0 0 0 10.2 10.2Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
        </button>
        <a :href="REPO" class="nav__repo" target="_blank" rel="noopener">
          <span class="dot" aria-hidden="true"></span>{{ t('nav.repo') }}<span class="visually-hidden"> ({{ t('nav.newTab') }})</span>
        </a>
      </div>
    </div>
  </header>
</template>

<style scoped>
.nav {
  position: sticky; top: 0; z-index: 50;
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  backdrop-filter: saturate(1.4) blur(14px); -webkit-backdrop-filter: saturate(1.4) blur(14px);
  border-bottom: 1px solid transparent;
}
.nav__inner {
  max-width: calc(1640px + 2 * var(--gutter)); margin-inline: auto; padding: 14px var(--gutter);
  display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; min-height: 84px;
}
.nav__brand { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; color: var(--ink); justify-self: start; border-radius: 12px; }
.nav__logo { width: 56px; height: 56px; object-fit: contain; }
.nav__word { font-size: 1.32rem; }

.nav__pill { background: var(--pill); border-radius: var(--radius-pill); padding: 6px 10px; }
.nav__pill ul { list-style: none; display: flex; gap: clamp(2px, 1.6vw, 34px); margin: 0; padding: 0; }
.nav__link {
  position: relative; display: inline-flex; align-items: center; min-height: 48px; padding: 0 clamp(10px, 1.4vw, 22px);
  text-decoration: none; color: var(--ink-2); font-weight: 300; font-size: 1.05rem; white-space: nowrap; border-radius: var(--radius-pill);
}
.nav__link::after {
  content: ''; position: absolute; left: 50%; right: 50%; bottom: 8px; height: 2px; background: currentColor;
  border-radius: 2px; transition: left 220ms var(--ease), right 220ms var(--ease);
}
.nav__link:hover { color: var(--ink); }
.nav__link:hover::after { left: 22%; right: 22%; opacity: 0.45; }
.nav__link.is-active { color: var(--ink); font-weight: 400; }
.nav__link.is-active::after { left: 18%; right: 18%; opacity: 1; }

.nav__tools { justify-self: end; display: flex; align-items: center; gap: 10px; }
.seg--sm > button { min-height: 36px; min-width: 40px; padding: 0 10px; font-size: 0.82rem; }
.nav__theme {
  width: 44px; height: 44px; display: inline-grid; place-items: center; border-radius: 50%;
  border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink);
  transition: transform var(--t-in) var(--ease), background-color var(--t-in) var(--ease);
}
.nav__theme:hover { transform: translateY(-1px); background: var(--surface-2); }
.nav__repo {
  display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 18px;
  background: var(--btn-bg); color: var(--btn-ink); border-radius: var(--radius-pill); text-decoration: none;
  font-size: 0.95rem; letter-spacing: -0.01em; transition: transform var(--t-in) var(--ease), background-color var(--t-in) var(--ease);
}
.nav__repo:hover { transform: translateY(-1px); background: var(--btn-bg-hover); }

@media (max-width: 1100px) {
  .nav__inner { grid-template-columns: auto 1fr; row-gap: 8px; padding-block: 10px; }
  .nav__pill { grid-column: 1 / -1; grid-row: 2; justify-self: center; max-width: 100%; overflow-x: auto; scrollbar-width: none; }
  .nav__pill::-webkit-scrollbar { display: none; }
  .nav__repo { display: none; }
}
@media (max-width: 520px) {
  .nav__logo { width: 44px; height: 44px; }
  .nav__word { font-size: 1.05rem; }
  .nav__link { font-size: 0.95rem; padding: 0 12px; min-height: 44px; }
  .nav__pill { padding: 2px 6px; justify-self: stretch; }
}
</style>
