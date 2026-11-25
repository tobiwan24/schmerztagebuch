// Registrierung des Service Workers und Update-Erkennung (Spec 04: neuer SW → Hinweis „Neue Version" → Neustart).
type Listener = (waiting: boolean) => void;

let waitingWorker: ServiceWorker | null = null;
let updateRequested = false;
let registration: ServiceWorkerRegistration | null = null;
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

/** Nach „Nach Updates suchen“ soll der Hinweis auch im Modus „automatisch“ erscheinen. */
export const SHOW_UPDATE_EVENT = 'stb:show-update';
export type UpdateCheck = 'available' | 'current' | 'unsupported';

/** „Nach Updates suchen“ (UI-22): `registration.update()`, danach meldet es, ob ein neuer Service Worker wartet. */
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (waitingWorker) {
    window.dispatchEvent(new Event(SHOW_UPDATE_EVENT));
    return 'available';
  }
  if (!registration) return 'unsupported';
  try {
    await registration.update();
  } catch {
    return 'unsupported';
  }
  // Der neue Worker installiert sich asynchron; kurz warten, bis `installed` den Hinweis ausgelöst hat.
  const reg = registration;
  if (reg.installing) {
    const w = reg.installing;
    await new Promise<void>((resolve) => {
      const done = () => w.state === 'installed' || w.state === 'redundant' || w.state === 'activated' ? resolve() : undefined;
      w.addEventListener('statechange', done);
      done();
      setTimeout(resolve, 15_000);
    });
  }
  const found = waitingWorker !== null || reg.waiting !== null;
  if (found) window.dispatchEvent(new Event(SHOW_UPDATE_EVENT));
  return found ? 'available' : 'current';
}

function track(reg: ServiceWorkerRegistration) {
  registration = reg;
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
