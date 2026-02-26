import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Download } from 'lucide-react';
import { APP_VERSION } from '../utils/version';

export default function UpdateControl() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  // Ref für stale-closure-freie Prüfung im setTimeout
  const updateAvailableRef = useRef(false);

  function handleUpdate() {
    if (!registration || !registration.waiting) return;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });
  }

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then((reg) => {
      setRegistration(reg);

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
            updateAvailableRef.current = true;
            // Kein auto-apply hier – UpdateBanner ist der primäre Mechanismus
          }
        });
      });
    });
  }, []);

  function handleCheckUpdate() {
    if (!registration) return;
    setIsChecking(true);
    registration.update().then(() => {
      setTimeout(() => {
        if (!updateAvailableRef.current) {
          alert('App ist auf dem neuesten Stand! ✅');
        }
        setIsChecking(false);
      }, 2000);
    }).catch((error) => {
      console.error('[Update] Check failed:', error);
      alert('Update-Prüfung fehlgeschlagen');
      setIsChecking(false);
    });
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">App-Updates</h3>

      <div className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Aktuelle Version</p>
          <p className="font-medium">{APP_VERSION}</p>
        </div>

        <Separator />

        {updateAvailable && (
          <>
            <Card className="p-4 bg-blue-50 border-blue-200">
              <div className="flex gap-3 items-start mb-3">
                <span className="text-2xl">🎉</span>
                <div className="flex-1">
                  <p className="font-semibold text-blue-900">
                    Neue Version verfügbar!
                  </p>
                  <p className="text-sm text-blue-900 mt-1">
                    Installiere das Update um neue Features zu nutzen
                  </p>
                </div>
              </div>
              <Button onClick={handleUpdate} className="w-full">
                <Download size={16} className="mr-2" />
                Jetzt aktualisieren
              </Button>
            </Card>
            <Separator />
          </>
        )}

        <Button
          onClick={handleCheckUpdate}
          disabled={isChecking}
          variant="outline"
          className="w-full"
        >
          <RefreshCw size={16} className={`mr-2 ${isChecking ? 'animate-spin' : ''}`} />
          {isChecking ? 'Prüfe auf Updates...' : 'Nach Updates suchen'}
        </Button>
      </div>
    </Card>
  );
}
