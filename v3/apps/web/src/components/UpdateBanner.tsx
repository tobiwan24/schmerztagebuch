// Hinweis „Neue Version" mit Neustart-Button (Spec 04/10). Im Modus local-only bietet er vorher ein Backup an (UI-17).
import { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/AuthContext';
import { router } from '@/router';
import { applyUpdate, onUpdateAvailable } from '@/sw-client';
import { useAutoBackup } from '@/data/useAutoBackup';
import { de } from '@/i18n/de';

export function UpdateBanner() {
  const { accountMode } = useAuth();
  const autoBackup = useAutoBackup();
  const [available, setAvailable] = useState(false);
  useEffect(() => onUpdateAvailable(setAvailable), []);
  if (!available) return null;
  return (
    <div role="status" data-testid="update-banner" className="flex flex-wrap items-center justify-between gap-2 border-b bg-accent px-4 py-2 text-sm">
      <span>{de.update.available}</span>
      <div className="flex gap-2">
        {accountMode === 'local-only' && (
          <Button size="sm" variant="outline" onClick={() => void router.navigate('/more/export#backup')}>
            <ShieldCheck aria-hidden />
            {de.update.backupFirst}
          </Button>
        )}
        <Button size="sm" onClick={() => void autoBackup.run(true).then(applyUpdate)}>
          <RefreshCw aria-hidden />
          {de.update.restart}
        </Button>
      </div>
    </div>
  );
}
