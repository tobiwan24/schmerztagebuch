import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { serviceWorkerPlugin } from './sw/build-sw';
import { APP_VERSION } from './src/version';

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorkerPlugin(APP_VERSION)],
  // Explizit leer: sonst sucht Vite aufwärts und findet die PostCSS-Config der v2-App im Repo-Root (Tailwind v3).
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: { outDir: 'dist', sourcemap: true },
  server: { port: 5173, strictPort: true },
});
