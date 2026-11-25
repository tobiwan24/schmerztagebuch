// Install-Banner auf Start (UI-19): nur im Browser-Modus, wegklickbar (bleibt verborgen); unter iOS in einem anderen
// Browser als Safari zusätzlich der Hinweis, dass dort nur Safari installieren kann.
import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { currentInstallEnv, installContext } from '@/lib/install';
import { deInstall } from '@/i18n/lazy/install';

const KEY = 'stb.install-banner.dismissed';

const wasDismissed = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

export function InstallBanner() {
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [context] = useState(() => installContext(currentInstallEnv()));
  if (dismissed || context === 'standalone') return null;
  const dismiss = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // Ohne Speicher bleibt das Banner nur bis zum Neuladen verborgen.
    }
    setDismissed(true);
  };
  return (
    <div role="status" data-testid="install-banner" className="flex items-start justify-between gap-2 rounded-lg border bg-accent px-4 py-3 text-sm">
      <div className="flex flex-col gap-1">
        <span className="font-medium">{deInstall.title}</span>
        <span>{deInstall.hint}</span>
        {context === 'ios-other-browser' ? <span data-testid="install-safari-hint">{deInstall.safariHint}</span> : null}
      </div>
      <Button variant="ghost" size="icon" aria-label={deInstall.dismiss} onClick={dismiss}>
        <X aria-hidden />
      </Button>
    </div>
  );
}
