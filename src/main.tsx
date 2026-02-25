import './index.css'
import './styles/global.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/tutorial.css'
import 'apexcharts/dist/apexcharts.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { TutorialProvider } from './contexts/TutorialContext'

// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((error) => {
        console.error('[PWA] Service Worker registration failed:', error);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TutorialProvider>
      <App />
    </TutorialProvider>
  </StrictMode>,
)
