import { useState, useEffect } from 'react';

export default function UpdateControl() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [isChecking, setIsChecking] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    // Auto-Update Preference laden
    const autoUpdatePref = localStorage.getItem('autoUpdate');
    setAutoUpdate(autoUpdatePref === 'true');

    // Service Worker Registration holen
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        setRegistration(reg);
        
        // Version vom Service Worker holen
        if (reg.active) {
          const messageChannel = new MessageChannel();
          messageChannel.port1.onmessage = (event) => {
            if (event.data && event.data.version) {
              setCurrentVersion(event.data.version);
            }
          };
          reg.active.postMessage({ type: 'GET_VERSION' }, [messageChannel.port2]);
        }

        // Check für Updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[Update] New version available!');
                setUpdateAvailable(true);
                
                // Auto-Update wenn aktiviert
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
    
    // Warte auf Controller-Wechsel
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
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>
        App-Updates
      </h3>

      {/* Version */}
      <div style={{ marginBottom: '1rem' }}>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          Aktuelle Version
        </p>
        <p style={{ fontWeight: 500 }}>{currentVersion || '1.0.0'}</p>
      </div>

      {/* Auto-Update Toggle */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1rem',
        padding: '0.75rem',
        backgroundColor: 'var(--color-background)',
        borderRadius: '0.5rem'
      }}>
        <div>
          <p style={{ fontWeight: 500 }}>Automatische Updates</p>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            Updates werden automatisch installiert
          </p>
        </div>
        <button
          onClick={toggleAutoUpdate}
          className="btn btn-secondary"
          style={{
            backgroundColor: autoUpdate ? 'var(--color-primary)' : 'var(--color-secondary)',
            color: 'white',
            minWidth: '80px'
          }}
        >
          {autoUpdate ? 'An' : 'Aus'}
        </button>
      </div>

      {/* Update verfügbar Banner */}
      {updateAvailable && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#dbeafe',
          borderRadius: '0.5rem',
          border: '1px solid #3b82f6',
          marginBottom: '1rem'
        }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <span style={{ fontSize: '1.5rem' }}>🎉</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 600, color: '#1e40af' }}>
                Neue Version verfügbar!
              </p>
              <p style={{ fontSize: '0.875rem', color: '#1e40af', marginTop: '0.25rem' }}>
                Installiere das Update um neue Features zu nutzen
              </p>
            </div>
          </div>
          <button
            onClick={handleUpdate}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.75rem' }}
          >
            Jetzt aktualisieren
          </button>
        </div>
      )}

      {/* Manueller Update-Check */}
      <button
        onClick={handleCheckUpdate}
        className="btn btn-secondary"
        disabled={isChecking}
        style={{ width: '100%' }}
      >
        {isChecking ? '🔄 Prüfe auf Updates...' : '🔍 Nach Updates suchen'}
      </button>
    </div>
  );
}
