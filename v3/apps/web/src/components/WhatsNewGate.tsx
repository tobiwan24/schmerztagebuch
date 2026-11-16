// Zeigt nach einem Update einmal die Neuigkeiten (UI-27). Der Inhalt (Changelog, Dialog) wird nur bei einem
// Versionssprung nachgeladen — im Normalfall kostet der Start nur den Vergleich zweier Zeichenketten.
import { lazy, Suspense, useState } from 'react';
import { readLastSeen } from '@/data/whats-new-state';
import { APP_VERSION } from '@/version';

const WhatsNewDialog = lazy(() => import('@/components/WhatsNewDialog'));

export function WhatsNewGate() {
  const [lastSeen] = useState(readLastSeen);
  if (lastSeen === APP_VERSION) return null;
  return (
    <Suspense fallback={null}>
      <WhatsNewDialog lastSeen={lastSeen} />
    </Suspense>
  );
}
