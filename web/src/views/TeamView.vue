<script setup>
/** Equipo: una tarjeta por integrante (datos en content/team.js; TODO(equipo) hasta que el equipo los complete). */
import { useI18n } from 'vue-i18n';
import { team } from '@/content/team.js';
import MemberAvatar from '@/components/layout/MemberAvatar.vue';

const { t, locale } = useI18n();
const REPO = 'https://github.com/Toluk3/TerraAustralisTeam';
const ICONS = {
  github: 'M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5a3.9 3.9 0 0 1 1-2.7c-.1-.3-.5-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .6 1.4.2 2.4.1 2.7a3.9 3.9 0 0 1 1 2.7c0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.8V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z',
  linkedin: 'M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm7 0h3.8v1.5h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6v5.5h-4v-4.9c0-1.2 0-2.7-1.6-2.7s-1.9 1.3-1.9 2.6v5h-4v-11Z',
};
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
          <MemberAvatar :member="m" :size="112" :alt="t('team.photoAlt', { name: m.name })" class="tm__photo" />
          <h2 class="tm__name">{{ m.name }}</h2>
          <p class="tm__role">{{ m.role[locale] ?? m.role.es }}</p>
          <p class="tm__bio">{{ m.bio[locale] ?? m.bio.es }}</p>
          <p v-if="m.links.length" class="tm__links">
            <a v-for="l in m.links" :key="l.url" :href="l.url" class="tm__link" target="_blank" rel="noopener"
              :aria-label="t(l.kind === 'github' ? 'team.linkGithub' : 'team.linkLinkedin', { name: m.name })">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path :d="ICONS[l.kind]" fill="currentColor" /></svg>
            </a>
          </p>
        </li>
      </ul>
    </section>

    <section class="tm__close" aria-labelledby="tm-thanks">
      <img src="/logo.webp" width="120" height="120" alt="" class="tm__logo" />
      <div>
        <h2 id="tm-thanks">{{ t('team.thanksTitle') }}</h2>
        <p>{{ t('team.thanks') }}</p>
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
  display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: clamp(20px, 2.4vw, 28px);
}
.tm__photo { width: 112px; height: 112px; margin-bottom: 12px; }
.tm__name { font-size: 1.3rem; font-weight: 400; }
.tm__role { margin: 0; color: var(--muted); font-size: 0.95rem; }
.tm__bio { margin: 8px 0 0; color: var(--ink-2); font-size: 0.95rem; }
.tm__links { display: flex; gap: 6px; margin: 8px 0 0; }
.tm__link {
  width: 44px; height: 44px; display: inline-grid; place-items: center; border-radius: 50%; color: var(--ink);
  border: 1px solid var(--line-strong); transition: transform var(--t-in) var(--ease), background-color var(--t-in) var(--ease);
}
.tm__link:hover { transform: translateY(-1px); background: var(--surface-2); }
.tm__close {
  display: grid; grid-template-columns: auto minmax(0, 1fr); gap: clamp(20px, 4vw, 48px); align-items: center;
  margin-top: clamp(56px, 10vh, 112px); padding-top: clamp(32px, 6vh, 56px); border-top: 1px solid var(--line);
}
.tm__logo { width: 120px; height: 120px; }
.tm__close h2 { font-size: clamp(1.6rem, 2.6vw, 2.2rem); margin-bottom: 14px; }
.tm__close p { color: var(--ink-2); max-width: 64ch; margin-bottom: 22px; }
@media (max-width: 900px) { .tm__card { flex-basis: calc((100% - clamp(14px, 2vw, 24px)) / 2); } }
@media (max-width: 600px) {
  .tm__card { flex-basis: 100%; }
  .tm__close { grid-template-columns: 1fr; }
  .tm__close .btn { width: 100%; }
}
</style>
