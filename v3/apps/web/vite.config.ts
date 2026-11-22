import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { serviceWorkerPlugin } from './sw/build-sw';
import { APP_VERSION } from './src/version';
import { contentSecurityPolicy, SECURITY_HEADERS_BASE } from './csp';

const v2Api = process.env.VITE_V2_API_URL ? [new URL(process.env.VITE_V2_API_URL).origin] : [];

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
  // Vorschau = Produktions-Build mit denselben Sicherheits-Headern wie nginx (QA-04). Der Dev-Server bleibt ohne CSP (HMR).
  preview: {
    proxy: { '/api': process.env.STB_API_URL ?? 'http://127.0.0.1:3901' },
    headers: { 'Content-Security-Policy': contentSecurityPolicy(v2Api), ...SECURITY_HEADERS_BASE },
  },
});
