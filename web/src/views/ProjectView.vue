<script setup>
/** Proyecto: metodología, con índice lateral fijo en escritorio y anclas por sección. */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { methodology } from '@/content/methodology.js';

const { t, locale } = useI18n();
const c = computed(() => methodology[locale.value] ?? methodology.es);

// Sección visible, para marcar el índice
const active = ref('metodologia');
let io = null;
onMounted(() => {
  io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) active.value = e.target.id;
  }, { rootMargin: '-30% 0px -60% 0px' });
  document.querySelectorAll('.pj__sec').forEach((s) => io.observe(s));
});
onBeforeUnmount(() => io?.disconnect());
</script>

<template>
  <div class="wrap pj">
    <header class="pj__head" data-enter>
      <p class="pj__kicker muted" style="--i: 0">{{ t('nav.project') }}</p>
      <h1 style="--i: 1">{{ c.title }}</h1>
      <p class="pj__lead" style="--i: 2">{{ c.lead }}</p>
    </header>

    <div class="pj__body">
      <nav class="pj__toc" :aria-label="c.toc">
        <p class="pj__toc-title muted">{{ c.toc }}</p>
        <ol>
          <li v-for="s in c.sections" :key="s.id">
            <RouterLink :to="{ hash: `#${s.id}` }" class="pj__toc-link" :class="{ 'is-active': active === s.id }"
              :aria-current="active === s.id ? 'location' : undefined">{{ s.title }}</RouterLink>
          </li>
        </ol>
      </nav>

      <div class="pj__content">
        <section v-for="s in c.sections" :id="s.id" :key="s.id" class="pj__sec" :aria-labelledby="`${s.id}-h`">
          <h2 :id="`${s.id}-h`">{{ s.title }}</h2>
          <p v-for="(p, i) in s.body ?? []" :key="i">{{ p }}</p>

          <figure v-if="s.diagram" class="pj__flow" role="img" :aria-label="c.flowLabel">
            <svg viewBox="0 0 760 92" aria-hidden="true">
              <g v-for="(step, i) in c.flow" :key="step" :transform="`translate(${i * 152},0)`">
                <rect x="2" y="22" width="128" height="48" rx="24" class="pj__flow-box" :class="{ 'is-last': i === c.flow.length - 1 }" />
                <text x="66" y="51" text-anchor="middle" class="pj__flow-txt" :class="{ 'is-last': i === c.flow.length - 1 }">{{ step }}</text>
                <path v-if="i < c.flow.length - 1" d="M134 46h16m-6-5 6 5-6 5" class="pj__flow-arrow" />
              </g>
            </svg>
          </figure>

          <div v-if="s.table" class="pj__table">
            <table>
              <thead><tr><th v-for="h in s.table.head" :key="h" scope="col">{{ h }}</th></tr></thead>
              <tbody><tr v-for="(r, i) in s.table.rows" :key="i"><td v-for="(v, j) in r" :key="j">{{ v }}</td></tr></tbody>
            </table>
          </div>
          <p v-for="(p, i) in s.after ?? []" :key="`a${i}`">{{ p }}</p>

          <ul v-if="s.list" class="pj__list"><li v-for="(l, i) in s.list" :key="i">{{ l }}</li></ul>

          <dl v-if="s.terms" class="pj__terms">
            <div v-for="[term, def] in s.terms" :key="term"><dt>{{ term }}</dt><dd>{{ def }}</dd></div>
          </dl>

          <p v-if="s.links" class="pj__links">
            <a v-for="l in s.links" :key="l.href" :href="l.href" class="link link--under" target="_blank" rel="noopener">{{ l.text }}<span class="visually-hidden"> ({{ t('nav.newTab') }})</span></a>
          </p>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pj { padding-top: clamp(32px, 6vh, 72px); }
.pj__head { max-width: 820px; margin-bottom: clamp(32px, 6vh, 64px); }
.pj__kicker { margin: 0 0 12px; font-size: 0.95rem; }
.pj__lead { margin: 20px 0 0; font-size: clamp(1.05rem, 1.3vw, 1.2rem); color: var(--ink-2); max-width: 62ch; }
.pj__body { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: clamp(24px, 4vw, 64px); align-items: start; }
.pj__toc { position: sticky; top: calc(var(--nav-h) + 24px); font-size: 0.92rem; }
.pj__toc-title { margin: 0 0 10px; font-size: 0.82rem; }
.pj__toc ol { list-style: none; margin: 0; padding: 0; border-left: 1px solid var(--line); }
.pj__toc-link {
  display: flex; align-items: center; min-height: 36px; padding: 0 12px; margin-left: -1px; border-left: 2px solid transparent;
  color: var(--muted); text-decoration: none; transition: color var(--t-in) var(--ease), border-color var(--t-in) var(--ease);
}
.pj__toc-link:hover { color: var(--ink); }
.pj__toc-link.is-active { color: var(--ink); border-left-color: var(--ink); }
.pj__content { max-width: 760px; min-width: 0; }
.pj__sec { padding-bottom: clamp(36px, 6vh, 64px); scroll-margin-top: calc(var(--nav-h) + 24px); }
.pj__sec + .pj__sec { padding-top: clamp(28px, 4vh, 40px); border-top: 1px solid var(--line); }
.pj__sec h2 { font-size: clamp(1.6rem, 2.6vw, 2.2rem); margin-bottom: 18px; }
.pj__sec p { color: var(--ink-2); max-width: 68ch; }
.pj__flow { margin: 28px 0 8px; }
.pj__flow svg { width: 100%; height: auto; overflow: visible; }
.pj__flow-box { fill: var(--surface); stroke: var(--line-strong); stroke-width: 1; }
.pj__flow-box.is-last { fill: var(--btn-bg); stroke: var(--btn-bg); }
.pj__flow-txt { fill: var(--ink); font: 400 15px var(--font-body); }
.pj__flow-txt.is-last { fill: var(--btn-ink); }
.pj__flow-arrow { fill: none; stroke: var(--muted); stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.pj__table { overflow-x: auto; margin: 18px 0; border: 1px solid var(--line); border-radius: var(--radius-s); }
.pj__table table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
.pj__table th, .pj__table td { padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
.pj__table th { font-weight: 500; background: var(--surface-2); }
.pj__table tbody tr:last-child td { border-bottom: 0; }
.pj__list { margin: 0; padding-left: 1.2em; color: var(--ink-2); display: flex; flex-direction: column; gap: 8px; }
.pj__terms { margin: 0; display: grid; gap: 14px; }
.pj__terms div { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 16px; }
.pj__terms dt { font-weight: 500; }
.pj__terms dd { margin: 0; color: var(--ink-2); }
.pj__links { display: flex; flex-wrap: wrap; gap: 12px 28px; }
.pj__links .link { min-height: 44px; display: inline-flex; align-items: center; background-position: 0 calc(50% + 0.75em); padding: 0; }
@media (max-width: 900px) {
  .pj__body { grid-template-columns: minmax(0, 1fr); }
  .pj__toc { position: static; }
  .pj__toc ol { display: flex; flex-wrap: wrap; border-left: 0; gap: 4px; }
  .pj__toc-link { border-left: 0; border: 1px solid var(--line); border-radius: var(--radius-pill); min-height: 40px; }
  .pj__toc-link.is-active { border-color: var(--ink); }
  .pj__terms div { grid-template-columns: 1fr; gap: 2px; }
}
</style>
