import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

/**
 * Sirve los datos del mapa (map/public/mock-*, los JSON de map/scripts/build_mocks.py) en `/mock-*`
 * durante `npm run dev` y `npm run preview`. No se copian al build: son decenas de miles de archivos y
 * en producción los publica aparte el servidor web (ver scripts/deploy_vps.sh).
 */
function mapData() {
  const root = fileURLToPath(new URL('./map/public', import.meta.url))
  const serve = (req, res, next) => {
    let url
    try {
      url = decodeURIComponent((req.url ?? '').split('?')[0])
    } catch {
      return next()
    }
    if (!/^\/mock-[\w-]+\//.test(url)) return next()
    const file = path.join(root, url)
    if (!file.startsWith(root + path.sep)) return next()
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) {
        // Un mes o tesela sin datos es un 404, no la página de la app
        res.statusCode = 404
        res.end()
        return
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      fs.createReadStream(file).pipe(res)
    })
  }
  return {
    name: 'terra-map-data',
    configureServer(server) { server.middlewares.use(serve) },
    configurePreviewServer(server) { server.middlewares.use(serve) },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    mapData(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // map/ es un proyecto aparte con su propia demo: que Vite no tome su index.html como entrada
  // ni vigile sus datos
  optimizeDeps: { entries: ['index.html'] },
  server: {
    watch: { ignored: ['**/map/public/**', '**/map/dist/**', '**/map/node_modules/**'] },
  },
})
