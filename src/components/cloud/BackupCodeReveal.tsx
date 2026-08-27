// src/components/cloud/BackupCodeReveal.tsx
// Einmalige Backup-Code-Anzeige: Pflicht-Download (.txt, iOS-Files-App-kompatibel via Blob-Download)
// + Pflicht-Checkbox "Ich habe den Code gespeichert". Beides zwingend — kein Weiterkommen ohne
// (Spec: "Backup-Code-Flow lässt sich nicht überspringen").

import { useState } from 'react';
import { Download, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';

interface BackupCodeRevealProps {
  code: string;
  onConfirmed: () => void;
  confirmLabel?: string;
}

export default function BackupCodeReveal({ code, onConfirmed, confirmLabel = 'Weiter' }: BackupCodeRevealProps) {
  const [downloaded, setDownloaded] = useState(false);
  const [checked, setChecked] = useState(false);

  function handleDownload() {
    const content =
      `Schmerztagebuch — Backup-Code\n\n${code}\n\n` +
      'Bewahre diesen Code sicher auf (z.B. Passwort-Manager oder Ausdruck). Er ermöglicht den ' +
      'Zugriff auf deinen Cloud-Account und die Entschlüsselung deiner Daten auf einem neuen Gerät, ' +
      'falls Face ID / iCloud-Schlüsselbund nicht verfügbar ist. Der Code wird nur dieses eine Mal angezeigt.\n\n' +
      `Erstellt: ${new Date().toLocaleString('de-DE')}\n`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schmerztagebuch-backup-code_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound size={20} className="text-primary" />
        <h3 className="text-lg font-semibold">Dein Backup-Code</h3>
      </div>

      <p className="text-sm text-muted-foreground">
        Dieser Code wird dir <strong>nur jetzt einmalig</strong> angezeigt. Er ist dein einziger Weg,
        auf einem neuen Gerät anzumelden oder deine Daten wiederherzustellen, falls Face ID /
        iCloud-Schlüsselbund nicht verfügbar ist.
      </p>

      <div className="rounded-md border bg-muted p-4 text-center font-mono text-base sm:text-lg tracking-wider break-all select-all">
        {code}
      </div>

      <Button onClick={handleDownload} variant={downloaded ? 'outline' : 'default'} className="w-full">
        <Download size={16} className="mr-2" />
        {downloaded ? 'Erneut herunterladen' : 'Als Datei herunterladen (.txt)'}
      </Button>

      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => setChecked(value === true)}
          disabled={!downloaded}
          className="mt-0.5"
        />
        <span>Ich habe den Backup-Code heruntergeladen und sicher gespeichert.</span>
      </label>

      <Button onClick={onConfirmed} disabled={!downloaded || !checked} className="w-full">
        {confirmLabel}
      </Button>
    </Card>
  );
}
