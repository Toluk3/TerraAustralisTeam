import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    // Con VITE_DATA_SOURCE=api, /api se redirige al backend de Django en desarrollo
    proxy: { '/api': 'http://localhost:8000' },
  },
  build: { target: 'es2022' },
});
