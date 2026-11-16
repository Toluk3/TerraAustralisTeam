<script setup>
/** Equipo: una tarjeta por integrante con foto, nombre y carrera (datos en content/team.js). */
import { useI18n } from 'vue-i18n';
import { team } from '@/content/team.js';
import MemberAvatar from '@/components/layout/MemberAvatar.vue';

const { t, locale } = useI18n();
const REPO = 'https://github.com/Toluk3/TerraAustralisTeam';
// Mención especial en los agradecimientos
const special = { id: 'special', name: 'Valentino Melchor', photo: '/team/valentino.png' };
</script>

<template>
  <div class="wrap tm">
    <header class="tm__head" data-enter>
      <p class="tm__kicker muted" style="--i: 0">{{ t('team.kicker') }}</p>
      <h1 style="--i: 1">{{ t('team.title') }}</h1>
      <p class="tm__lead" style="--i: 2">{{ t('team.lead') }}</p>
    </header>

    <section :aria-label="t('team.membersLabel')">
      <ul class="tm__grid">
        <li v-for="m in team" :key="m.id" class="card tm__card">
          <MemberAvatar :member="m" :size="128" :alt="m.name" class="tm__photo" />
          <h2 class="tm__name">{{ m.name }}</h2>
          <p class="tm__role">{{ m.role[locale] ?? m.role.es }}</p>
        </li>
      </ul>
    </section>

    <section class="tm__close" aria-labelledby="tm-thanks">
      <img src="/logo.webp" width="120" height="120" alt="" class="tm__logo" />
      <div>
        <h2 id="tm-thanks">{{ t('team.thanksTitle') }}</h2>
        <p>{{ t('team.thanks') }}</p>
        <div class="tm__special">
          <!-- Foto provisoria: reemplazar public/team/valentino.png por la definitiva (mismo nombre) -->
          <MemberAvatar :member="special" :size="112" :alt="special.name" class="tm__special-photo" />
          <div>
            <p class="tm__special-kicker">{{ t('team.specialTitle') }}</p>
            <h3 class="tm__special-name">{{ special.name }}</h3>
            <p class="tm__special-role">{{ t('team.specialRole') }}</p>
            <p class="tm__special-body">{{ t('team.specialBody') }}</p>
          </div>
        </div>
        <a :href="REPO" class="btn" target="_blank" rel="noopener"><span class="dot" aria-hidden="true"></span>{{ t('team.repo') }}<span class="visually-hidden"> ({{ t('nav.newTab') }})</span></a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tm { padding-top: clamp(32px, 6vh, 72px); }
.tm__head { max-width: 820px; margin-bottom: clamp(32px, 6vh, 56px); }
.tm__kicker { margin: 0 0 12px; font-size: 0.95rem; }
.tm__lead { margin: 20px 0 0; font-size: clamp(1.05rem, 1.3vw, 1.2rem); color: var(--ink-2); max-width: 62ch; }
.tm__grid { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: clamp(14px, 2vw, 24px); }
.tm__card {
  flex: 0 1 calc((100% - 2 * clamp(14px, 2vw, 24px)) / 3); min-width: 0;
  display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: clamp(24px, 2.8vw, 36px) 20px;
}
.tm__photo { width: 128px; height: 128px; margin-bottom: 14px; box-shadow: 0 0 0 1px var(--line); }
.tm__name { font-size: 1.3rem; font-weight: 400; }
.tm__role { margin: 0; color: var(--muted); font-size: 0.95rem; }
.tm__close {
  display: grid; grid-template-columns: auto minmax(0, 1fr); gap: clamp(20px, 4vw, 48px); align-items: center;
  margin-top: clamp(56px, 10vh, 112px); padding-top: clamp(32px, 6vh, 56px); border-top: 1px solid var(--line);
}
.tm__logo { width: 120px; height: 120px; }
.tm__close h2 { font-size: clamp(1.6rem, 2.6vw, 2.2rem); margin-bottom: 14px; }
.tm__close p { color: var(--ink-2); max-width: 64ch; margin-bottom: 22px; }
.tm__special {
  display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 20px; align-items: center;
  margin: 0 0 24px; padding: 20px 24px; max-width: 640px;
  border: 1px solid var(--line); border-radius: var(--radius-m); background: var(--surface);
}
.tm__special-photo { width: 112px; height: 112px; box-shadow: 0 0 0 1px var(--line); }
.tm__special p { margin: 0; }
.tm__special-kicker { font-size: 0.85rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
.tm__special-name { margin: 4px 0 2px; font-size: 1.3rem; font-weight: 400; }
.tm__special .tm__special-role { color: var(--muted); font-size: 0.95rem; margin-bottom: 8px; }
.tm__close .tm__special-body { color: var(--ink-2); font-size: 0.95rem; margin-bottom: 0; }
@media (max-width: 900px) { .tm__card { flex-basis: calc((100% - clamp(14px, 2vw, 24px)) / 2); } }
@media (max-width: 600px) {
  .tm__card { flex-basis: 100%; }
  .tm__close { grid-template-columns: 1fr; }
  .tm__special { grid-template-columns: 1fr; justify-items: start; }
  .tm__close .btn { width: 100%; }
}
</style>
