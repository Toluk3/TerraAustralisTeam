import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Sirve los datos del mapa en `dev` y `preview` sin copiarlos al build:
 *   GET /mock-<nombre>/<ruta>.json
 * Busca el archivo en la primera carpeta que lo tenga: TERRA_DATA_DIR (.env.local), ../frontend/map/public
 * y ./public. Si no existe responde 404 (nunca el HTML de la app, que el módulo leería como JSON roto).
 */
function mapData(env) {
  const roots = [env.TERRA_DATA_DIR, path.resolve(here, '../frontend/map/public'), path.resolve(here, 'public')]
    .filter(Boolean)
    .map((r) => path.resolve(r));

  const handler = (req, res, next) => {
    const url = decodeURIComponent((req.url || '').split('?')[0]);
    if (!/^\/mock-[\w-]+\/.+\.json$/.test(url)) return next();
    for (const root of roots) {
      const file = path.resolve(root, `.${url}`);
      // Protección: el archivo tiene que quedar dentro de la carpeta de datos
      if (file !== root && !file.startsWith(root + path.sep)) continue;
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(file).pipe(res);
        return;
      }
    }
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end('{"error":"not found"}');
  };

  return {
    name: 'terra-map-data',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
    // Si alguien dejó un mock-* en public/, no se publica con el build (pesa GB y se copia aparte)
    writeBundle(options) {
      const out = options.dir;
      if (!out || !fs.existsSync(out)) return;
      for (const name of fs.readdirSync(out)) {
        if (name.startsWith('mock-')) fs.rmSync(path.join(out, name), { recursive: true, force: true });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, here, ''), ...process.env };
  return {
    plugins: [vue(), mapData(env)],
    resolve: { alias: { '@': path.resolve(here, 'src') } },
    server: { port: 5175, strictPort: true },
    preview: { port: 5175 },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1600,
    },
  };
});
