// Hinweis „Neue Version" mit Neustart-Button (Spec 04/10). Backup-Angebot nur in local-only folgt mit Export (M10).
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { applyUpdate, onUpdateAvailable } from '@/sw-client';
import { de } from '@/i18n/de';

export function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  useEffect(() => onUpdateAvailable(setAvailable), []);
  if (!available) return null;
  return (
    <div role="status" data-testid="update-banner" className="flex items-center justify-between gap-2 border-b bg-accent px-4 py-2 text-sm">
      <span>{de.update.available}</span>
      <Button size="sm" onClick={applyUpdate}>
        <RefreshCw aria-hidden />
        {de.update.restart}
      </Button>
    </div>
  );
}
