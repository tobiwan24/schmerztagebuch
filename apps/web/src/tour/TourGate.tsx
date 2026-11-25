// Zeigt je Seite beim ersten Besuch die Tour (UI-29). Im Normalfall kostet der Start nur das Lesen von localStorage;
// die Karte (`TourCard`) wird erst nachgeladen, wenn die Seite noch nicht erledigt ist.
import { lazy, Suspense, useState } from 'react';
import { useLocation } from 'react-router';
import { isPageDone, readTourState, tourPageForPath } from './tour';

const TourCard = lazy(() => import('./TourCard'));

export function TourGate() {
  const { pathname } = useLocation();
  const page = tourPageForPath(pathname);
  // Nach „Fertig/Überspringen“ liest das Gate den Zustand neu.
  const [, setVersion] = useState(0);
  if (!page || isPageDone(readTourState(), page)) return null;
  return (
    <Suspense fallback={null}>
      <TourCard key={page} page={page} onChange={() => setVersion((v) => v + 1)} />
    </Suspense>
  );
}
