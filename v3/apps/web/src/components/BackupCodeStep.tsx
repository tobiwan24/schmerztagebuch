// Backup-Code anzeigen — Weiter erst nach Bestätigung (Spec 03: Pflicht, kein Überspringen; CRY-08).
import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { de } from '@/i18n/de';

function download(code: string) {
  const blob = new Blob([`${de.onboarding.backupFileText}\n\n${code}\n`], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = de.onboarding.backupFileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function BackupCodeStep({ code, busy, onConfirmed }: { code: string; busy?: boolean; onConfirmed: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{de.onboarding.backupTitle}</CardTitle>
        <CardDescription>{de.onboarding.backupWarning}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p data-testid="backup-code" className="rounded-md bg-muted p-3 text-center font-mono text-base tracking-wider break-all">
          {code}
        </p>
        <Button variant="outline" onClick={() => download(code)}>
          <Download aria-hidden />
          {de.onboarding.backupDownload}
        </Button>
        <Label className="min-h-11">
          <Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          {de.onboarding.backupConfirm}
        </Label>
        <Button disabled={!confirmed || busy} onClick={onConfirmed}>
          {de.onboarding.backupNext}
        </Button>
      </CardContent>
    </Card>
  );
}
