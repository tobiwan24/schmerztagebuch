// Hinweis „Neue Version" mit Neustart-Button (Spec 04/10). Im Modus local-only bietet er vorher ein Backup an (UI-17).
import { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/AuthContext';
import { router } from '@/router';
import { SHOW_UPDATE_EVENT, applyUpdate, onUpdateAvailable } from '@/sw-client';
import { useAutoBackup } from '@/data/useAutoBackup';
import { DEFAULT_UPDATE_MODE, UPDATE_MODE_EVENT, loadUpdateMode, type UpdateMode } from '@/data/update-settings';
import { de } from '@/i18n/de';

export function UpdateBanner() {
  const { accountMode, db } = useAuth();
  const autoBackup = useAutoBackup();
  const [available, setAvailable] = useState(false);
  const [forced, setForced] = useState(false);
  const [mode, setMode] = useState<UpdateMode>(DEFAULT_UPDATE_MODE);
  useEffect(() => onUpdateAvailable(setAvailable), []);
  useEffect(() => {
    const show = () => setForced(true);
    window.addEventListener(SHOW_UPDATE_EVENT, show);
    return () => window.removeEventListener(SHOW_UPDATE_EVENT, show);
  }, []);
  useEffect(() => {
    const load = () => void loadUpdateMode(db).then(setMode);
    load();
    window.addEventListener(UPDATE_MODE_EVENT, load);
    return () => window.removeEventListener(UPDATE_MODE_EVENT, load);
  }, [db, available]);
  // „Automatisch“ (UI-22): ohne Hinweis; die neue Version wird aktiv, sobald die App in den Hintergrund geht.
  useEffect(() => {
    if (!available || mode !== 'auto' || forced) return;
    const onHide = () => {
      if (document.visibilityState === 'hidden') void autoBackup.run(true).then(applyUpdate);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [available, mode, forced, autoBackup]);
  if (!available || (mode === 'auto' && !forced)) return null;
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
