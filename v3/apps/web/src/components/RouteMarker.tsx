// Zuletzt gerenderte Route als `data-route` am <html>: macht für Tests und Diagnose sichtbar, wann der Router eine
// Navigation tatsächlich übernommen hat (die URL ändert sich schon vorher, gerendert wird asynchron).
import { useLayoutEffect } from 'react';
import { Outlet, useLocation } from 'react-router';

export function RouteMarker() {
  const { pathname, search, hash } = useLocation();
  useLayoutEffect(() => {
    document.documentElement.dataset.route = pathname + search + hash;
  }, [pathname, search, hash]);
  return <Outlet />;
}
