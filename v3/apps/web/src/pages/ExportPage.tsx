// Mehr → Export & Backup (Spec 07): Export (JSON v1, CSV long/wide, optional gefiltert), verschlüsseltes Backup,
// Import mit Vorschau (neu / geändert / unverändert, „Als Kopie"). Alles entsteht und bleibt auf dem Gerät.
import { useEffect, useState, type FormEvent } from 'react';
import { Download, FileUp, ShieldCheck } from 'lucide-react';
import type { BackupSecret } from '@stb/crypto';
import { parseExport, type CsvProfile, type ExportV1, type PdfImageSize, type PdfLayout } from '@stb/export';
import type { FilterSpec, SavedFilter } from '@stb/analysis';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/auth/AuthContext';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { downloadText, useBackup, type ExportFormat } from '@/data/useBackup';
import type { ImportPlan } from '@/data/import-export';
import { de } from '@/i18n/de';

const t = de.exportPage;
const errorText = (e: unknown) => t.errors[(e as { code?: string }).code as keyof typeof t.errors] ?? t.errors.unknown;

export function ExportPage() {
  const { accountMode } = useAuth();
  return (
    <>
      <PageHeader title={de.more.export} back />
      <ExportCard />
      <BackupCard localOnly={accountMode === 'local-only'} />
      <ImportCard />
    </>
  );
}

function ExportCard() {
  const { diary } = useData();
  const { exportFile } = useBackup();
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [profile, setProfile] = useState<CsvProfile>('standard');
  const [filter, setFilter] = useState<SavedFilter | null>(null);
  const [imageSize, setImageSize] = useState<PdfImageSize>('a5');
  const [layout, setLayout] = useState<PdfLayout>('table');
  const [pdfPassword, setPdfPassword] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const saved = useQuery(async () => (await Promise.all((await diary.listDiaries()).map((d) => diary.listSavedFilters(d.id)))).flat(), [diary]);
  const diaryIds = useQuery(async () => (await diary.listDiaries()).map((d) => d.id), [diary]);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const spec = effectiveFilter(filter?.filter, period, { month, from: rangeFrom, to: rangeTo }, diaryIds.status === 'ok' ? diaryIds.data : []);
      const f = await exportFile(format, { profile, imageSize, layout, ...(pdfPassword ? { password: pdfPassword } : {}), ...(spec ? { filter: spec } : {}) });
      downloadText(f.name, f.text, f.mime);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.exportTitle}</CardTitle>
        <CardDescription>{t.exportHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ToggleGroup aria-label={t.format}>
          {(['pdf', 'json', 'csv-long', 'csv-wide'] as ExportFormat[]).map((f) => (
            <ToggleGroupItem key={f} pressed={format === f} onClick={() => setFormat(f)}>
              {t.formats[f]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {format === 'pdf' ? (
          <>
            <ToggleGroup aria-label={t.layout}>
              {(['table', 'cards'] as PdfLayout[]).map((l) => (
                <ToggleGroupItem key={l} pressed={layout === l} onClick={() => setLayout(l)}>
                  {t.layouts[l]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <ToggleGroup aria-label={t.imageSize}>
              {(['a4', 'a5', 'a6', 'none'] as PdfImageSize[]).map((s) => (
                <ToggleGroupItem key={s} pressed={imageSize === s} onClick={() => setImageSize(s)}>
                  {t.imageSizes[s]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pdf-password">{t.pdfPassword}</Label>
              <Input id="pdf-password" type="password" autoComplete="new-password" value={pdfPassword} onChange={(ev) => setPdfPassword(ev.target.value)} />
            </div>
          </>
        ) : null}
        {format === 'csv-long' || format === 'csv-wide' ? (
          <ToggleGroup aria-label={t.profile}>
            {(['standard', 'excel-de'] as CsvProfile[]).map((p) => (
              <ToggleGroupItem key={p} pressed={profile === p} onClick={() => setProfile(p)}>
                {t.profiles[p]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}
        <div role="group" aria-label={t.filter} className="flex flex-wrap gap-2">
          <Button size="sm" variant={filter === null ? 'default' : 'outline'} aria-pressed={filter === null} onClick={() => setFilter(null)}>
            {t.allEntries}
          </Button>
          {(saved.status === 'ok' ? saved.data : []).map((f) => (
            <Button key={f.id} size="sm" variant={filter?.id === f.id ? 'default' : 'outline'} aria-pressed={filter?.id === f.id} onClick={() => setFilter(f)}>
              {f.name}
            </Button>
          ))}
        </div>
        <ToggleGroup aria-label={t.period}>
          {(['all', 'month', 'range'] as Period[]).map((p) => (
            <ToggleGroupItem key={p} pressed={period === p} onClick={() => setPeriod(p)}>
              {t.periods[p]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {period === 'month' ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="export-month">{t.periodMonth}</Label>
            <Input id="export-month" type="month" value={month} onChange={(ev) => setMonth(ev.target.value)} />
          </div>
        ) : null}
        {period === 'range' ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="export-from">{t.periodFrom}</Label>
              <Input id="export-from" type="date" value={rangeFrom} onChange={(ev) => setRangeFrom(ev.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="export-to">{t.periodTo}</Label>
              <Input id="export-to" type="date" value={rangeTo} onChange={(ev) => setRangeTo(ev.target.value)} />
            </div>
          </div>
        ) : null}
        <Button disabled={busy || (period === 'range' && (!rangeFrom || !rangeTo || rangeTo < rangeFrom)) || (period === 'month' && !month)} onClick={() => void run()}>
          <Download aria-hidden />
          {t.download}
        </Button>
      </CardContent>
    </Card>
  );
}

type Period = 'all' | 'month' | 'range';

/** Zeitraum (Monat oder von–bis, Spec 06 Custom-Zeitraum) mit einem gespeicherten Filter kombinieren. `undefined` = alles. */
function effectiveFilter(saved: FilterSpec | undefined, period: Period, p: { month: string; from: string; to: string }, diaryIds: string[]): FilterSpec | undefined {
  if (period === 'all') return saved;
  let range: { from: string; to: string };
  if (period === 'month') {
    const [y, m] = p.month.split('-').map(Number) as [number, number];
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    range = { from: `${p.month}-01`, to: `${p.month}-${String(last).padStart(2, '0')}` };
  } else range = { from: p.from, to: p.to };
  return { ...(saved ?? { diaryIds }), range };
}

function SecretFields({ kind, onKind, value, onValue, repeat, onRepeat, idPrefix }: {
  kind: BackupSecret['kind']; onKind: (k: BackupSecret['kind']) => void; value: string; onValue: (v: string) => void; repeat?: string; onRepeat?: (v: string) => void; idPrefix: string;
}) {
  return (
    <>
      <ToggleGroup aria-label={t.secret}>
        <ToggleGroupItem pressed={kind === 'backup-code'} onClick={() => onKind('backup-code')}>
          {t.withCode}
        </ToggleGroupItem>
        <ToggleGroupItem pressed={kind === 'password'} onClick={() => onKind('password')}>
          {t.withPassword}
        </ToggleGroupItem>
      </ToggleGroup>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-secret`}>{kind === 'backup-code' ? de.lock.recoveryCodeLabel : t.backupPassword}</Label>
        <Input id={`${idPrefix}-secret`} type={kind === 'password' ? 'password' : 'text'} autoComplete="off" spellCheck={false} value={value} onChange={(e) => onValue(e.target.value)} />
      </div>
      {onRepeat && kind === 'password' ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-repeat`}>{t.backupPasswordRepeat}</Label>
          <Input id={`${idPrefix}-repeat`} type="password" autoComplete="off" value={repeat ?? ''} onChange={(e) => onRepeat(e.target.value)} />
        </div>
      ) : null}
    </>
  );
}

function BackupCard({ localOnly }: { localOnly: boolean }) {
  const { state, checkBackupCode, backupFile, saveReminderDays } = useBackup();
  const [kind, setKind] = useState<BackupSecret['kind']>('backup-code');
  const [value, setValue] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (window.location.hash === '#backup') document.getElementById('backup')?.scrollIntoView?.();
  }, []);

  async function run(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (kind === 'password' && value.length < 8) return setError(de.onboarding.passwordTooShort);
    if (kind === 'password' && value !== repeat) return setError(de.onboarding.passwordMismatch);
    setBusy(true);
    try {
      if (kind === 'backup-code' && !(await checkBackupCode(value))) return setError(t.errors['wrong-backup-code']);
      const f = await backupFile(kind === 'backup-code' ? { kind, code: value } : { kind, password: value });
      downloadText(f.name, f.text, 'application/octet-stream');
      setDone(true);
      setValue('');
      setRepeat('');
    } finally {
      setBusy(false);
    }
  }

  const last = state.status === 'ok' ? state.data.last : null;
  return (
    <Card id="backup">
      <CardHeader>
        <CardTitle>{t.backupTitle}</CardTitle>
        <CardDescription>{t.backupHint}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3" onSubmit={(e) => void run(e)}>
          <SecretFields kind={kind} onKind={setKind} value={value} onValue={setValue} repeat={repeat} onRepeat={setRepeat} idPrefix="backup" />
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={busy || !value}>
            <ShieldCheck aria-hidden />
            {busy ? de.onboarding.working : t.backupDownload}
          </Button>
          {done ? <p role="status" className="text-sm text-muted-foreground">{t.backupDone}</p> : null}
          <p className="text-xs text-muted-foreground" data-testid="last-backup">
            {last ? t.lastBackup(new Date(last).toLocaleDateString('de-DE')) : t.noBackupYet}
          </p>
          {localOnly && state.status === 'ok' ? (
            <div className="flex items-center gap-2">
              <Label htmlFor="reminder-days" className="font-normal">{t.reminderDays}</Label>
              <Input id="reminder-days" type="number" min={1} max={365} className="w-20" defaultValue={state.data.days} onBlur={(e) => void saveReminderDays(Number(e.target.value) || 7)} />
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

function ImportCard() {
  const { readBackup, plan, apply } = useBackup();
  const [file, setFile] = useState<string | null>(null);
  const [needsSecret, setNeedsSecret] = useState(false);
  const [kind, setKind] = useState<BackupSecret['kind']>('backup-code');
  const [value, setValue] = useState('');
  const [doc, setDoc] = useState<ExportV1 | null>(null);
  const [preview, setPreview] = useState<{ plan: ImportPlan; asCopy: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  function reset() {
    setFile(null); setNeedsSecret(false); setDoc(null); setPreview(null); setError(null); setValue('');
  }

  async function onFile(f: File | undefined) {
    reset();
    setDone(false);
    if (!f) return;
    const text = await f.text();
    let format: unknown;
    try {
      format = (JSON.parse(text) as { format?: unknown }).format;
    } catch {
      return setError(t.errors['not-json']);
    }
    setFile(text);
    if (format === 'stb-backup') return setNeedsSecret(true);
    try {
      await show(parseExport(text), false);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function show(d: ExportV1, asCopy: boolean) {
    setDoc(d);
    setPreview({ plan: await plan(d, asCopy), asCopy });
  }

  async function unlock(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await show(await readBackup(file, kind === 'backup-code' ? { kind, code: value } : { kind, password: value }), false);
      setNeedsSecret(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!preview) return;
    setBusy(true);
    try {
      await apply(preview.plan);
      reset();
      setDone(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.importTitle}</CardTitle>
        <CardDescription>{t.importHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Label htmlFor="import-file">{t.chooseFile}</Label>
        <Input id="import-file" type="file" accept=".json,.stbbackup,application/json" onChange={(e) => void onFile(e.target.files?.[0])} />
        {needsSecret ? (
          <form className="flex flex-col gap-3" onSubmit={(e) => void unlock(e)}>
            <SecretFields kind={kind} onKind={setKind} value={value} onValue={setValue} idPrefix="import" />
            <Button type="submit" disabled={busy || !value}>{busy ? de.onboarding.working : t.openBackup}</Button>
          </form>
        ) : null}
        {preview && doc ? (
          <div data-testid="import-preview" className="flex flex-col gap-2 rounded-md border p-3 text-sm">
            <p>{t.previewCounts(preview.plan.diaries, preview.plan.templates, preview.plan.entries)}</p>
            <p className="text-muted-foreground">{t.previewChanges(preview.plan.added, preview.plan.updated, preview.plan.unchanged)}</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || preview.plan.writes.length === 0} onClick={() => void run()}>
                <FileUp aria-hidden />
                {preview.asCopy ? t.importAsCopy : t.importNow}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void show(doc, !preview.asCopy)}>
                {preview.asCopy ? t.importOriginal : t.previewAsCopy}
              </Button>
            </div>
          </div>
        ) : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {done ? <p role="status" className="text-sm text-muted-foreground">{t.importDone}</p> : null}
      </CardContent>
    </Card>
  );
}
