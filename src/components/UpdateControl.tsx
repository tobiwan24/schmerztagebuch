import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Download } from 'lucide-react';

export default function UpdateControl() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [isChecking, setIsChecking] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const autoUpdatePref = localStorage.getItem('autoUpdate');
    setAutoUpdate(autoUpdatePref === 'true');

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        setRegistration(reg);
        
        if (reg.active) {
          const messageChannel = new MessageChannel();
          messageChannel.port1.onmessage = (event) => {
            if (event.data && event.data.version) {
              setCurrentVersion(event.data.version);
            }
          };
          reg.active.postMessage({ type: 'GET_VERSION' }, [messageChannel.port2]);
        }

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[Update] New version available!');
                setUpdateAvailable(true);
                
                if (autoUpdatePref === 'true') {
                  handleUpdate();
                }
              }
            });
          }
        });
      });
    }
  }, []);

  function handleCheckUpdate() {
    if (!registration) return;
    
    setIsChecking(true);
    
    registration.update().then(() => {
      setTimeout(() => {
        if (!updateAvailable) {
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

  function handleUpdate() {
    if (!registration || !registration.waiting) return;

    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }

  function toggleAutoUpdate() {
    const newValue = !autoUpdate;
    setAutoUpdate(newValue);
    localStorage.setItem('autoUpdate', String(newValue));
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">App-Updates</h3>

      <div className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Aktuelle Version</p>
          <p className="font-medium">{currentVersion || '1.0.0'}</p>
        </div>

        <Separator />

        <div className="flex justify-between items-center">
          <div>
            <p className="font-medium">Automatische Updates</p>
            <p className="text-sm text-muted-foreground">
              Updates werden automatisch installiert
            </p>
          </div>
          <Button
            onClick={toggleAutoUpdate}
            variant={autoUpdate ? 'default' : 'outline'}
            className="min-w-[80px]"
          >
            {autoUpdate ? 'An' : 'Aus'}
          </Button>
        </div>

        {updateAvailable && (
          <>
            <Separator />
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
