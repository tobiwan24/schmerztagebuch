// src/components/BackupReminder.tsx
// Zeigt Backup-Erinnerung bei Meilenstein-Eintragsanzahlen (10, 25, 50, ...)

import { useState, useEffect } from 'react';
import { AlertTriangle, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import db from '../db';
import { exportBackup } from '@/utils/manualBackup';

const REMINDER_THRESHOLDS = [10, 25, 50, 100, 200, 500, 1000];
const DISMISSED_KEY = 'backup_reminder_dismissed';
const LAST_BACKUP_KEY = 'last_manual_backup';

export function BackupReminder() {
  const { toast } = useToast();
  const [shouldShow, setShouldShow] = useState(false);
  const [entryCount, setEntryCount] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    checkReminder();
  }, []);

  async function checkReminder() {
    const count = await db.entries.count();
    setEntryCount(count);

    const atThreshold = REMINDER_THRESHOLDS.includes(count);
    const notDismissed = localStorage.getItem(DISMISSED_KEY) !== count.toString();
    const lastBackup = localStorage.getItem(LAST_BACKUP_KEY);
    const needsBackup = !lastBackup || Number(lastBackup) < count;

    if (atThreshold && notDismissed && needsBackup) {
      setShouldShow(true);
    }
  }

  async function handleBackup() {
    setExporting(true);
    try {
      await exportBackup();
      localStorage.setItem(LAST_BACKUP_KEY, entryCount.toString());
      localStorage.setItem(DISMISSED_KEY, entryCount.toString());
      toast({ title: '✅ Backup erfolgreich erstellt' });
      setShouldShow(false);
    } catch {
      toast({ title: '❌ Backup fehlgeschlagen', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  }

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, entryCount.toString());
    setShouldShow(false);
  }

  if (!shouldShow) return null;

  return (
    <div className="mb-3 border border-yellow-400 bg-yellow-50 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1">
          <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-yellow-900 text-sm">💾 Backup empfohlen</p>
            <p className="text-sm text-yellow-800 mt-0.5">
              {entryCount} Einträge – sichere jetzt deine Daten!
            </p>
            <div className="flex gap-2 mt-2">
              <Button size="sm" onClick={handleBackup} disabled={exporting} className="h-7 text-xs">
                <Download className="mr-1 h-3 w-3" />
                {exporting ? 'Exportiere...' : 'Jetzt sichern'}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDismiss} className="h-7 text-xs">
                Später
              </Button>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="h-7 w-7 p-0 flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
