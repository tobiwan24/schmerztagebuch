// src/components/ManualBackupCard.tsx
// Karte für manuellen Backup-Export und -Import in den Settings

import { useState, useEffect, useRef } from 'react';
import { Download, Upload, Database } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { exportBackup, importBackup, peekBackup, getBackupStats, type ImportMode } from '@/utils/manualBackup';

export function ManualBackupCard() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState({ templates: 0, entries: 0, total: 0 });
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setStats(await getBackupStats());
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportBackup();
      localStorage.setItem('last_manual_backup', stats.entries.toString());
      toast({ title: '✅ Backup erfolgreich exportiert' });
    } catch {
      toast({ title: '❌ Export fehlgeschlagen', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // Schritt 1: Backup lesen & validieren ohne zu importieren
    const peek = await peekBackup(file);
    if (!peek.valid) {
      toast({ title: `❌ ${peek.message}`, variant: 'destructive' });
      return;
    }

    const backupDate = peek.stats
      ? new Date(peek.stats.exportedAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
      : 'unbekannt';

    // Schritt 2: Merge-Dialog – nur wenn bereits Daten vorhanden
    let mode: ImportMode = 'overwrite';
    if (stats.total > 0) {
      const choice = window.confirm(
        `Backup vom ${backupDate}\n` +
        `Enthält: ${peek.stats?.templates} Vorlagen · ${peek.stats?.entries} Einträge\n\n` +
        `Deine aktuelle Datenbank hat ${stats.templates} Vorlagen und ${stats.entries} Einträge.\n\n` +
        `OK  →  Zusammenführen (nur neue Einträge hinzufügen, vorhandene behalten)\n` +
        `Abbrechen  →  Alles überschreiben (aktuelle Daten werden gelöscht)`
      );
      if (choice) {
        mode = 'merge';
      } else {
        // Zweite Bestätigung nur beim destruktiven Pfad
        const sure = window.confirm(
          '⚠️ Alle aktuellen Daten werden unwiderruflich gelöscht und durch das Backup ersetzt.\n\nWirklich fortfahren?'
        );
        if (!sure) return;
        mode = 'overwrite';
      }
    }

    setImporting(true);
    try {
      const result = await importBackup(file, mode);
      if (result.success) {
        const modeLabel = mode === 'merge' ? 'zusammengeführt' : 'wiederhergestellt';
        toast({
          title: '✅ Import erfolgreich',
          description: `${result.stats?.templates} Vorlagen und ${result.stats?.entries} Einträge ${modeLabel}.`,
        });
        await loadStats();
        // Kurze Pause damit der Toast sichtbar ist, dann Seite neu laden
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast({ title: `❌ ${result.message}`, variant: 'destructive' });
      }
    } catch {
      toast({ title: '❌ Import fehlgeschlagen', variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card className="p-6">
      <CardHeader className="p-0 mb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database size={18} className="text-primary" />
          Manuelles Backup
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 space-y-4">
        <p className="text-sm text-muted-foreground">
          Sichere alle Daten als JSON-Datei – enthält auch Bilder.
        </p>
        <p className="text-xs text-muted-foreground">
          {stats.templates} Vorlagen · {stats.entries} Einträge
        </p>

        {/* Export */}
        <Button
          onClick={handleExport}
          disabled={exporting || stats.total === 0}
          className="w-full"
        >
          <Download className="mr-2 h-4 w-4" />
          {exporting ? 'Exportiere...' : 'Backup erstellen & herunterladen'}
        </Button>

        {/* Import */}
        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground mb-3">
            Backup-Datei (.json) importieren und Daten wiederherstellen.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            variant="outline"
            className="w-full"
          >
            <Upload className="mr-2 h-4 w-4" />
            {importing ? 'Importiere...' : 'Backup importieren'}
          </Button>
          <p className="text-xs text-red-600 mt-2 text-center">
            ⚠️ Vorhandene Daten können überschrieben werden
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
