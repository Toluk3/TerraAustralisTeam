import { createApp } from 'vue';
import { createI18n } from 'vue-i18n';
import App from './App.vue';
import { router } from './router.js';
import { ui, initUi } from './stores/ui.js';
import es from './locales/es.json';
import en from './locales/en.json';
import './styles/base.css';

const i18n = createI18n({
  legacy: false,
  locale: ui.locale,
  fallbackLocale: 'es',
  messages: { es, en },
  missingWarn: import.meta.env.DEV,
  fallbackWarn: false,
});

initUi(i18n);

createApp(App).use(router).use(i18n).mount('#app');
