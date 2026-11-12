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
  // `/api` → Sync-Server (Dev/E2E; in Produktion übernimmt das nginx, apps/web/Dockerfile). Port per STB_API_URL änderbar.
  server: { port: 5173, strictPort: true, proxy: { '/api': process.env.STB_API_URL ?? 'http://127.0.0.1:3901' } },
  preview: { proxy: { '/api': process.env.STB_API_URL ?? 'http://127.0.0.1:3901' } },
});
