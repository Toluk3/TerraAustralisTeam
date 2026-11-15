<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLiveFigure } from '@/features/useLiveFigure.js';
import { team } from '@/content/team.js';
import MemberAvatar from '@/components/layout/MemberAvatar.vue';
import { intlLocale } from '@/stores/ui.js';

const { t, locale } = useI18n();
const { liveText, years } = useLiveFigure();

// Hero: 5 integrantes con el logo en el medio (2 + logo + 3, como el boceto)
const left = team.slice(0, 2);
const right = team.slice(2);

const yearsText = computed(() => (years.value ? years.value.n : '…'));

const steps = ['gather', 'calibrate', 'explore'];
const facts = computed(() => {
  const nf = (v, d = 0) => new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
  return [
    { value: years.value ? nf(years.value.n) : '…', label: t('home.facts.yearsLabel', { from: years.value?.from ?? '…', to: years.value?.to ?? '…' }) },
    { value: `≈ ${nf(5)} km²`, label: t('home.facts.cellLabel') },
    { value: `+${nf(0.05, 2)} %`, label: t('home.facts.biasLabel') },
    { value: 'p05–p95', label: t('home.facts.intervalLabel') },
  ];
});

// --- Momento destacado: la frase del problema se ilumina palabra por palabra al recorrer su sección ---
const problemEl = ref(null);
const lit = ref(0);
const words = computed(() => { locale.value; return t('home.problem.statement').split(/\s+/); });
let raf = 0;
let io = null;
let active = false;
const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function measure() {
  raf = 0;
  const el = problemEl.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  // 0 cuando la sección asoma por abajo, 1 cuando su parte fija ya recorrió buena parte del alto
  const span = Math.max(1, r.height - vh * 0.55);
  const p = Math.min(1, Math.max(0, (vh * 0.62 - r.top) / span));
  lit.value = p * words.value.length;
}
const onScroll = () => { if (active && !raf) raf = requestAnimationFrame(measure); };

onMounted(() => {
  if (reduce) { lit.value = Infinity; return; }
  io = new IntersectionObserver(([e]) => { active = e.isIntersecting; if (active) measure(); });
  if (problemEl.value) io.observe(problemEl.value);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
});
onBeforeUnmount(() => {
  io?.disconnect();
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('resize', onScroll);
  if (raf) cancelAnimationFrame(raf);
});
</script>

<template>
  <div class="home">
    <!-- (1) Hero: una pantalla -->
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero__bg" aria-hidden="true"></div>
      <div class="wrap hero__inner" data-enter>
        <div class="hero__faces" role="group" :aria-label="t('home.teamLabel')" style="--i: 0">
          <MemberAvatar v-for="(m, i) in left" :key="m.id" :member="m" :size="96" class="hero__face"
            :alt="t('home.memberAlt', { n: i + 1 })" />
          <img src="/logo.webp" width="150" height="150" :alt="t('home.logoAlt')" class="hero__logo" />
          <MemberAvatar v-for="(m, i) in right" :key="m.id" :member="m" :size="96" class="hero__face"
            :alt="t('home.memberAlt', { n: i + 3 })" />
        </div>
        <h1 id="hero-title" class="hero__title" style="--i: 1" :aria-label="t('home.title')">
          <span aria-hidden="true">{{ t('home.titleLine1') }}</span>
          <span aria-hidden="true">{{ t('home.titleLine2') }}</span>
        </h1>
        <p class="hero__lead" style="--i: 2">{{ t('home.lead', { years: yearsText }) }}</p>
        <div class="hero__actions" style="--i: 3">
          <div class="hero__primary">
            <RouterLink to="/analisis" class="btn btn--xl">{{ t('home.cta') }}</RouterLink>
            <p class="hero__live" aria-live="polite"><span class="dot" aria-hidden="true"></span>{{ liveText }}</p>
          </div>
          <RouterLink :to="{ path: '/analisis', query: { demo: 'compare' } }" class="link hero__demo">{{ t('home.demo') }}</RouterLink>
        </div>
      </div>
    </section>

    <!-- (2) Problema: el momento destacado de la página -->
    <section ref="problemEl" class="problem" aria-labelledby="problem-title">
      <div class="problem__sticky">
        <div class="wrap">
          <h2 id="problem-title" class="problem__title">{{ t('home.problem.title') }}</h2>
          <p class="problem__statement">
            <template v-for="(w, i) in words" :key="i + w"><span class="problem__word" :class="{ 'is-lit': i < lit }">{{ w }}</span>{{ ' ' }}</template>
          </p>
        </div>
      </div>
    </section>

    <!-- (3) Del dato al mapa -->
    <section class="steps" aria-labelledby="steps-title">
      <div class="wrap">
        <h2 id="steps-title">{{ t('home.steps.title') }}</h2>
        <ol class="steps__list">
          <li v-for="(s, i) in steps" :key="s" class="card steps__card">
            <span class="steps__n" aria-hidden="true">0{{ i + 1 }}</span>
            <h3>{{ t(`home.steps.${s}.title`) }}</h3>
            <p>{{ t(`home.steps.${s}.body`) }}</p>
          </li>
        </ol>
      </div>
    </section>

    <!-- (4) Cifras -->
    <section class="facts" aria-labelledby="facts-title">
      <div class="wrap">
        <h2 id="facts-title">{{ t('home.facts.title') }}</h2>
        <dl class="facts__row">
          <div v-for="f in facts" :key="f.label" class="facts__item">
            <dt>{{ f.label }}</dt>
            <dd>{{ f.value }}</dd>
          </div>
        </dl>
        <p class="facts__note muted">{{ t('home.facts.note') }}</p>
      </div>
    </section>

    <!-- (5) Cierre -->
    <section class="close" aria-labelledby="close-title">
      <div class="wrap close__inner">
        <h2 id="close-title">{{ t('home.close.title') }}</h2>
        <div class="close__actions">
          <RouterLink to="/analisis" class="btn btn--xl">{{ t('home.cta') }}</RouterLink>
          <RouterLink to="/edu" class="link">{{ t('home.close.edu') }}</RouterLink>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ---------- Hero ---------- */
.hero {
  position: relative; isolation: isolate; overflow: hidden;
  min-height: calc(100svh - var(--nav-h)); display: grid; align-items: center;
  padding-block: clamp(24px, 4vh, 48px) clamp(40px, 7vh, 80px);
}
.hero__bg {
  position: absolute; inset: -4% -10%; z-index: -1; pointer-events: none;
  background: var(--outline-ink); opacity: var(--outline-alpha);
  -webkit-mask: url('/latam-outline.svg') center 38% / auto 135% no-repeat;
  mask: url('/latam-outline.svg') center 38% / auto 135% no-repeat;
}
.hero__inner { display: flex; flex-direction: column; align-items: center; text-align: center; }
.hero__faces { display: flex; align-items: center; justify-content: center; margin-bottom: clamp(20px, 3vh, 36px); }
.hero__face, .hero__logo { flex: none; position: relative; }
.hero__face { width: clamp(64px, 6.6vw, 96px); height: clamp(64px, 6.6vw, 96px); margin-inline: calc(clamp(64px, 6.6vw, 96px) * -0.12); box-shadow: 0 0 0 3px var(--bg); }
.hero__face:nth-child(1), .hero__face:nth-child(5) { z-index: 1; }
.hero__face:nth-child(2), .hero__face:nth-child(4) { z-index: 2; }
.hero__logo { width: clamp(100px, 10vw, 150px); height: auto; z-index: 3; margin-inline: calc(clamp(64px, 6.6vw, 96px) * -0.14); filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.14)); }
.hero__title {
  font-weight: 400; font-size: clamp(2rem, 3.95vw, 4.4rem); line-height: 1.16; letter-spacing: -0.025em;
}
.hero__title span { display: block; text-wrap: balance; }
.hero__lead {
  margin: clamp(18px, 3vh, 30px) 0 0; max-width: 610px; font-size: clamp(1rem, 1.18vw, 1.22rem); line-height: 1.6;
  color: var(--ink-2); text-wrap: pretty;
}
.hero__actions { margin-top: clamp(24px, 4vh, 40px); display: flex; align-items: flex-start; gap: 18px 36px; flex-wrap: wrap; justify-content: center; }
.hero__primary { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.hero__live { display: inline-flex; align-items: center; justify-content: center; text-align: center; gap: 8px; margin: 0; font-size: 0.98rem; color: var(--ink-2); }
.hero__demo { font-size: 1.15rem; min-height: 60px; display: inline-flex; align-items: center; background-position: 0 calc(50% + 0.8em); padding: 0; }

/* ---------- Problema ---------- */
.problem { position: relative; height: 200svh; }
.problem__sticky { position: sticky; top: var(--nav-h); min-height: calc(100svh - var(--nav-h)); display: grid; align-content: center; }
.problem__title { font-size: clamp(1.1rem, 1.6vw, 1.4rem); color: var(--muted); font-weight: 400; letter-spacing: 0; margin-bottom: clamp(18px, 3vh, 32px); }
.problem__statement { margin: 0; font-weight: 300; font-size: clamp(1.9rem, 4.3vw, 4.2rem); line-height: 1.16; letter-spacing: -0.025em; max-width: 22ch; text-wrap: balance; }
.problem__word { color: var(--ink); opacity: 0.16; transition: opacity 260ms var(--ease); }
.problem__word.is-lit { opacity: 1; }

/* ---------- Pasos ---------- */
.steps, .facts { min-height: calc(100svh - var(--nav-h)); display: grid; align-content: center; padding-block: clamp(56px, 9vh, 96px); }
.steps__list { list-style: none; margin: clamp(28px, 5vh, 48px) 0 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(14px, 2vw, 24px); }
.steps__card { display: flex; flex-direction: column; gap: 12px; padding: clamp(22px, 2.4vw, 32px); min-height: 260px; }
.steps__card p { margin: 0; color: var(--ink-2); }
.steps__n { font-family: var(--font-brand); font-weight: 800; font-size: 0.95rem; color: var(--muted); margin-bottom: auto; padding-bottom: 28px; }

/* ---------- Cifras ---------- */
.facts__row { margin: clamp(28px, 5vh, 48px) 0 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 1px solid var(--line); }
.facts__item { padding: 26px 20px 0 0; display: flex; flex-direction: column-reverse; justify-content: flex-end; gap: 8px; }
.facts__item + .facts__item { padding-left: 20px; border-left: 1px solid var(--line); }
.facts__item dd { margin: 0; font-weight: 300; font-size: clamp(2rem, 3.6vw, 3.3rem); line-height: 1; letter-spacing: -0.02em; white-space: nowrap; }
.facts__item dt { color: var(--muted); font-size: 0.95rem; }
.facts__note { margin-top: 32px; max-width: 60ch; }

/* ---------- Cierre ---------- */
.close { min-height: calc(70svh - var(--nav-h)); display: grid; align-content: center; padding-block: clamp(56px, 9vh, 96px); }
.close__inner { display: flex; flex-direction: column; align-items: center; text-align: center; gap: clamp(24px, 4vh, 40px); }
.close h2 { font-size: clamp(2.1rem, 4.6vw, 4.2rem); max-width: 16ch; text-wrap: balance; }
.close__actions { display: flex; align-items: center; gap: 18px 32px; flex-wrap: wrap; justify-content: center; }
.close__actions .link { min-height: 44px; display: inline-flex; align-items: center; background-position: 0 calc(50% + 0.8em); padding: 0; }

@media (max-width: 900px) {
  .steps__list { grid-template-columns: 1fr; }
  .steps__card { min-height: 0; }
  .steps__n { padding-bottom: 6px; }
  .facts__row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .facts__item:nth-child(3) { padding-left: 0; border-left: 0; }
  .facts__item:nth-child(n + 3) { padding-top: 26px; }
}
@media (max-width: 520px) {
  .hero__title { font-size: 2.05rem; }
  .hero__actions { flex-direction: column; align-items: stretch; width: 100%; }
  .hero__primary .btn { width: 100%; }
  .hero__demo { justify-content: center; align-self: center; }
  .problem { height: 170svh; }
  .facts__row { grid-template-columns: 1fr; }
  .facts__item + .facts__item { padding-left: 0; border-left: 0; padding-top: 22px; }
  .close__actions { flex-direction: column; width: 100%; }
  .close__actions .btn { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .problem { height: auto; }
  .problem__sticky { position: static; min-height: calc(100svh - var(--nav-h)); }
  .problem__word { opacity: 1; }
}
</style>
