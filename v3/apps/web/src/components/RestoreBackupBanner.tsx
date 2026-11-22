// Hinweis „Backup wiederherstellen" bei leerer DB nach dem Onboarding (Spec 07, EXP-16): Datei (Export-Seite) oder
// Auto-Sicherung; wegklickbar. Nicht bei v2-Daten mit Einträgen (dort greift die Migration).
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ArchiveRestore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAuth } from '@/auth/AuthContext';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { useV2Status } from '@/migration/status';
import { de } from '@/i18n/de';

const t = de.restoreBanner;
const DISMISSED = 'restore-banner:dismissed';

export function RestoreBackupBanner() {
  const { db } = useAuth();
  const data = useData();
  const v2 = useV2Status();
  const state = useQuery(async () => {
    const [entries, dismissed] = await Promise.all([data.diary.listAllEntries(), db.keys.get(DISMISSED)]);
    const { autoBackupCreatedAt } = await import('@/data/restore-auto-backup');
    return { empty: entries.length === 0, dismissed: !!dismissed, auto: await autoBackupCreatedAt() };
  }, [db, data.diary]);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'backup' | 'password'>('backup');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [restored, setRestored] = useState<number | null>(null);

  if (restored !== null) return <p role="status" data-testid="restore-done" className="text-sm text-muted-foreground">{t.done(restored)}</p>;
  if (state.status !== 'ok' || !state.data.empty || state.data.dismissed) return null;
  if (v2.status !== 'ok' || (v2.data.counts && v2.data.counts.entries > 0 && !v2.data.state?.migratedFromV2At)) return null;

  async function dismiss() {
    await db.keys.put({ id: DISMISSED, value: true });
    state.retry();
  }

  async function restore(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const { restoreFromAutoBackup } = await import('@/data/restore-auto-backup');
      const n = await restoreFromAutoBackup(data, kind === 'backup' ? { kind, code: value } : { kind, password: value });
      data.bumpRevision();
      setOpen(false);
      setRestored(n);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="restore-banner">
      <CardContent className="flex flex-col gap-2">
        <p className="flex items-center gap-2 font-medium">
          <ArchiveRestore className="size-4" aria-hidden />
          {t.title}
        </p>
        <p className="text-sm text-muted-foreground">{t.hint}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to="/more/export">{t.file}</Link>
          </Button>
          {state.data.auto ? (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              {t.auto(new Date(state.data.auto).toLocaleDateString('de-DE'))}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => void dismiss()}>
            {t.dismiss}
          </Button>
        </div>
      </CardContent>
      <Dialog open={open} onClose={() => setOpen(false)} aria-labelledby="restore-auto-title">
        <DialogTitle id="restore-auto-title">{t.dialogTitle}</DialogTitle>
        <DialogDescription>{t.dialogHint}</DialogDescription>
        <form className="mt-3 flex flex-col gap-3" onSubmit={(e) => void restore(e)}>
          <ToggleGroup aria-label={t.secretKind}>
            <ToggleGroupItem pressed={kind === 'backup'} onClick={() => setKind('backup')}>{t.secretCode}</ToggleGroupItem>
            <ToggleGroupItem pressed={kind === 'password'} onClick={() => setKind('password')}>{t.secretPassword}</ToggleGroupItem>
          </ToggleGroup>
          <div className="flex flex-col gap-2">
            <Label htmlFor="restore-secret">{kind === 'backup' ? t.secretCode : t.secretPassword}</Label>
            <Input id="restore-secret" type={kind === 'password' ? 'password' : 'text'} autoComplete="off" spellCheck={false} value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{t.wrong}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t.cancel}</Button>
            <Button type="submit" disabled={busy || !value}>{t.restore}</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </Card>
  );
}
