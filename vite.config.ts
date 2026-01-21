import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// import basicSsl from '@vitejs/plugin-basic-ssl' // Nur für Development

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()], // basicSsl() nur für lokale Entwicklung
  server: {
    // https: true, // Nur für lokale Entwicklung mit basicSsl
    host: true // Erlaubt Zugriff von anderen Geräten im Netzwerk
  }
})
