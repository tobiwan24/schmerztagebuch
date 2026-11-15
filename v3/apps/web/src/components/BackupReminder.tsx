// Backup-Erinnerung (Spec 07, EXP-12): nur im Modus „nur auf diesem Gerät", wenn das letzte Backup älter als die Frist ist.
import { Link } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useBackupState } from '@/data/useBackupState';
import { de } from '@/i18n/de';

export function BackupReminder() {
  const state = useBackupState();
  if (state.status !== 'ok' || !state.data.due) return null;
  return (
    <Card data-testid="backup-reminder" className="border-orange-300 dark:border-orange-800">
      <CardContent className="flex flex-col gap-2">
        <p className="flex items-center gap-2 font-medium">
          <ShieldAlert className="size-4 text-orange-600" aria-hidden />
          {de.exportPage.reminderTitle}
        </p>
        <p className="text-sm text-muted-foreground">{de.exportPage.reminderHint(state.data.days)}</p>
        <Button asChild size="sm" className="self-start">
          <Link to="/more/export">{de.exportPage.reminderAction}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
