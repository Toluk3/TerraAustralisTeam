# .

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Compile and Minify for Production

```sh
npm run build
```

## Mapa y juego

`src/components/MapView.vue` monta el mapa de focos de [`map/`](map/README.md) (MapLibre + deck.gl) y el juego "Apagá los incendios" en las páginas Mapa y EduAustralis. El slider de la página Mapa elige el mes.

- **Datos:** el mapa lee los JSON de `map/public/mock-*` (no están en Git: se generan con `map/scripts/build_mocks.py` o se bajan del release, ver `map/README.md`). `npm run dev` y `npm run preview` los sirven en `/mock-*`. Se usa la primera carpeta que exista entre `mock-s1`, `mock-conosur` y `mock-api`, o la de `VITE_MOCK_BASE`.
- **Build:** `npm run build` no copia los datos a `dist/`; el servidor web tiene que publicarlos en `/<carpeta>/`, igual que hace hoy `scripts/deploy_vps.sh` con la demo de `map/`.
