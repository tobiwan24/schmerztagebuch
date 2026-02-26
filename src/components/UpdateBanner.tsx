import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { exportBackup } from '../utils/manualBackup';
import { Download, RefreshCw, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export default function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupError, setBackupError] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then((reg) => {
      setRegistration(reg);

      // Neuer SW bereits wartend beim App-Start?
      if (reg.waiting && navigator.serviceWorker.controller) {
        setUpdateAvailable(true);
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
          }
        });
      });
    });
  }, []);

  function applyUpdate() {
    if (!registration?.waiting) return;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });
  }

  async function handleYes() {
    setIsBackingUp(true);
    setBackupError(false);
    try {
      await exportBackup();
      applyUpdate(); // nur bei Erfolg
    } catch {
      setIsBackingUp(false);
      setBackupError(true);
    }
  }

  function handleNo() {
    // Update bleibt pending – wird beim nächsten App-Start erneut angezeigt
    setUpdateAvailable(false);
  }

  return (
    // onOpenChange no-op: Dialog darf nur über die Buttons geschlossen werden
    <Dialog open={updateAvailable} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-sm"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Update verfügbar</DialogTitle>
          <DialogDescription>
            Eine neue Version der App ist bereit. Vor dem Update empfehlen wir ein Backup deiner Daten.
          </DialogDescription>
        </DialogHeader>

        {backupError && (
          <div className="flex items-center gap-2 text-sm text-destructive p-3 bg-destructive/10 rounded-md">
            <AlertCircle size={16} className="shrink-0" />
            Backup fehlgeschlagen. Bitte versuche es erneut oder aktualisiere ohne Backup.
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleYes}
            disabled={isBackingUp}
            className="w-full"
          >
            {isBackingUp ? (
              <>
                <RefreshCw size={16} className="mr-2 animate-spin" />
                Backup wird erstellt...
              </>
            ) : (
              <>
                <Download size={16} className="mr-2" />
                {backupError ? 'Erneut versuchen' : 'Ja, Backup erstellen & aktualisieren'}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleNo}
            disabled={isBackingUp}
            className="w-full"
          >
            Jetzt nicht
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
