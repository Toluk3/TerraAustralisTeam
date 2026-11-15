/**
 * Preferencias de la interfaz: idioma y tema. Se guardan en localStorage (terra-locale, terra-theme) y se
 * aplican a <html lang> y <html data-theme>. Con tema 'system' se quita el atributo y manda el sistema.
 */
import { reactive, watch } from 'vue';

const LOCALES = ['es', 'en'];
const THEMES = ['system', 'light', 'dark'];

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, value); } catch { /* sin almacenamiento: solo dura la sesión */ }
}

function initialLocale() {
  const saved = read('terra-locale');
  if (LOCALES.includes(saved)) return saved;
  const nav = (typeof navigator !== 'undefined' && navigator.language) || 'es';
  return nav.toLowerCase().startsWith('es') ? 'es' : 'en';
}
function initialTheme() {
  const saved = read('terra-theme');
  return THEMES.includes(saved) ? saved : 'system';
}

export const ui = reactive({ locale: initialLocale(), theme: initialTheme(), systemDark: false });

let mq = null;
export function effectiveTheme() {
  if (ui.theme === 'light' || ui.theme === 'dark') return ui.theme;
  return ui.systemDark ? 'dark' : 'light';
}

function apply(i18n) {
  const html = document.documentElement;
  html.setAttribute('lang', ui.locale);
  if (ui.theme === 'system') html.removeAttribute('data-theme');
  else html.setAttribute('data-theme', ui.theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', effectiveTheme() === 'dark' ? '#0d0e10' : '#fdfdfb');
  if (i18n) i18n.global.locale.value = ui.locale;
}

export function initUi(i18n) {
  if (typeof window !== 'undefined' && window.matchMedia) {
    mq = window.matchMedia('(prefers-color-scheme: dark)');
    ui.systemDark = mq.matches;
    mq.addEventListener?.('change', (e) => { ui.systemDark = e.matches; apply(i18n); });
  }
  apply(i18n);
  watch(() => [ui.locale, ui.theme], () => {
    apply(i18n);
    write('terra-locale', ui.locale);
    if (ui.theme === 'system') { try { localStorage.removeItem('terra-theme'); } catch { /* nada */ } }
    else write('terra-theme', ui.theme);
  });
}

export function setLocale(l) { if (LOCALES.includes(l)) ui.locale = l; }
export function setTheme(t) { if (THEMES.includes(t)) ui.theme = t; }
/** Botón de la navbar: alterna claro/oscuro a partir de lo que se ve ahora. */
export function toggleTheme() { setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark'); }
/** Locale de Intl para números y fechas. */
export const intlLocale = () => (ui.locale === 'en' ? 'en-US' : 'es-AR');
