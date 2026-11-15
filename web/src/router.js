import { createRouter, createWebHashHistory } from 'vue-router';

// Historial con # : el servidor estático (Nginx try_files … =404) no necesita reescrituras.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
    { path: '/analisis', name: 'analysis', component: () => import('./views/AnalysisView.vue') },
    { path: '/proyecto', name: 'project', component: () => import('./views/ProjectView.vue') },
    { path: '/equipo', name: 'team', component: () => import('./views/TeamView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior(to, from, saved) {
    if (saved) return saved;
    if (to.hash) return { el: to.hash, top: 96, behavior: 'smooth' };
    return { top: 0 };
  },
});
