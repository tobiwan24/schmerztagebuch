// src/components/RestoreBackupBanner.tsx
// Zeigt bei leerem DB einen Hinweis, ein vorhandenes Backup zu importieren

import { useState, useEffect, useRef } from 'react';
import { Info, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import db from '../db';
import { importBackup } from '@/utils/manualBackup';

const BANNER_DISMISSED_KEY = 'restore_banner_dismissed';

export function RestoreBackupBanner() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [shouldShow, setShouldShow] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    checkIfEmpty();
  }, []);

  async function checkIfEmpty() {
    if (localStorage.getItem(BANNER_DISMISSED_KEY) === 'true') return;
    const [t, e] = await Promise.all([db.templates.count(), db.entries.count()]);
    if (t === 0 && e === 0) setShouldShow(true);
  }

  async function handleFileSelect(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const result = await importBackup(file);
      if (result.success) {
        toast({
          title: `✅ ${result.stats?.entries ?? 0} Einträge und ${result.stats?.templates ?? 0} Vorlagen wiederhergestellt`
        });
        localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
        setShouldShow(false);
        // Hard-Reload damit alle Komponenten die neuen Daten sehen
        window.location.reload();
      } else {
        toast({ title: `❌ ${result.message}`, variant: 'destructive' });
      }
    } catch {
      toast({ title: '❌ Import fehlgeschlagen', variant: 'destructive' });
    } finally {
      setImporting(false);
      ev.target.value = '';
    }
  }

  function dismiss() {
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
    setShouldShow(false);
  }

  if (!shouldShow) return null;

  return (
    <div className="mx-4 mb-3 border border-blue-300 bg-blue-50 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1">
          <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-blue-900 text-sm">Backup wiederherstellen?</p>
            <p className="text-sm text-blue-800 mt-0.5">
              Noch keine Daten vorhanden. Falls du ein Backup hast, kannst du es jetzt
              importieren.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="h-7 text-xs"
              >
                <Upload className="mr-1 h-3 w-3" />
                {importing ? 'Importiere...' : 'Backup importieren'}
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss} className="h-7 text-xs">
                Neu starten
              </Button>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={dismiss}
          className="h-7 w-7 p-0 flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
