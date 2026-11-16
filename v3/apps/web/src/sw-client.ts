// Registrierung des Service Workers und Update-Erkennung (Spec 04: neuer SW → Hinweis „Neue Version" → Neustart).
type Listener = (waiting: boolean) => void;

let waitingWorker: ServiceWorker | null = null;
let updateRequested = false;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l(waitingWorker !== null));

export function onUpdateAvailable(listener: Listener): () => void {
  listeners.add(listener);
  listener(waitingWorker !== null);
  return () => listeners.delete(listener);
}

/** Testnaht (E2E): zeigt den Update-Hinweis ohne echten neuen Service Worker. */
if (typeof window !== 'undefined') {
  window.addEventListener('stb:test-update-available', () => {
    waitingWorker ??= { postMessage: () => undefined } as unknown as ServiceWorker;
    notify();
  });
}

/** Wartenden SW aktivieren; nach dem Wechsel lädt die App neu. */
export function applyUpdate(): void {
  updateRequested = true;
  waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
}

function track(reg: ServiceWorkerRegistration) {
  if (reg.waiting && navigator.serviceWorker.controller) {
    waitingWorker = reg.waiting;
    notify();
  }
  reg.addEventListener('updatefound', () => {
    const installing = reg.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        waitingWorker = installing;
        notify();
      }
    });
  });
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Nur nach „Neu starten" neu laden — clients.claim() beim Erst-Install darf die laufende Sitzung nicht unterbrechen.
    if (!updateRequested || reloading) return;
    reloading = true;
    window.location.reload();
  });
  void navigator.serviceWorker.register('/sw.js').then(track);
}
