// src/components/CloudUnlockModal.tsx
// Analog zu AuthModal.tsx (lokales Passwort), aber für die Cloud-Session: wird gezeigt, wenn
// dieses Gerät mit einem Cloud-Account verknüpft ist, aber keine gültige Cloud-Session (DEK)
// mehr im sessionStorage vorliegt (App-Neustart, 24h-Timeout).

import { useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface CloudUnlockModalProps {
  onUnlock: () => Promise<boolean>;
  onCancel: () => void;
}

export default function CloudUnlockModal({ onUnlock, onCancel }: CloudUnlockModalProps) {
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleUnlock() {
    setIsLoading(true);
    setError('');
    try {
      const ok = await onUnlock();
      if (!ok) setError('Entsperren fehlgeschlagen. Bitte erneut versuchen.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Entsperren fehlgeschlagen.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Fingerprint size={20} className="text-primary" />
          <h3 className="text-lg font-semibold">Cloud-Sync entsperren</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Entsperre deine Cloud-Daten mit Face ID / iCloud-Schlüsselbund, um synchronisierte
          Einträge zu sehen und Änderungen hochzuladen.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={isLoading}>
            Später
          </Button>
          <Button className="flex-1" onClick={handleUnlock} disabled={isLoading}>
            {isLoading ? 'Entsperre…' : 'Mit Face ID entsperren'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
