// Migrations-Assistent `/migrate` (Spec 11 „Ablauf", Spec 10): Erkennen → Entsperren (v2-Passwort, v2-Cloud-Login) →
// optional Server-Pull → Trockenlauf-Bericht → Bestätigen → Schreiben → Prüfen → Bericht. v2-Daten bleiben unverändert.
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, FileUp, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/PageHeader';
import { downloadText } from '@/data/useBackup';
import { reportText, useMigration } from '@/migration/useMigration';
import { deMigration } from '@/i18n/lazy/migration';

const t = deMigration;
const codeOf = (e: unknown) => (e as { code?: string; name?: string; message?: string }).code ?? (e as { message?: string }).message ?? '';

export function MigratePage() {
  const m = useMigration();
  const { detect } = m;
  const [status, setStatus] = useState<'detecting' | 'ready'>('detecting');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      await detect().catch(() => null);
      if (!cancelled) setStatus('ready');
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [detect]);

  async function step(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch {
      setError(t.error);
    } finally {
      setBusy(false);
    }
  }

  const counts = m.counts;
  return (
    <>
      <PageHeader title={t.title} back />
      <p className="text-sm text-muted-foreground">{t.intro}</p>
      {status === 'detecting' ? <p className="text-muted-foreground">{t.detecting}</p> : null}

      {status === 'ready' && m.phase === 'start' ? (
        <>
          {counts ? (
            <Card data-testid="v2-found">
              <CardHeader>
                <CardTitle>{t.found}</CardTitle>
                <CardDescription>
                  {t.counts(counts.templates, counts.entries)}
                  {counts.encryptedEntries ? ` · ${t.encrypted(counts.encryptedEntries)}` : ''}
                  {m.source === 'file' ? ` · ${t.fromFile}` : ''}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <p data-testid="v2-none">{t.noneFound}</p>
          )}
          <BackupFileCard onFile={(text) => m.useBackupFile(text)} />
          {counts && counts.hasPassword && counts.encryptedEntries > counts.cloudEntries ? <PasswordCard ok={m.passwordOk} onUnlock={m.unlockPassword} /> : null}
          {counts && (counts.cloudSync || counts.cloudEntries > 0) ? <CloudCard m={m} /> : null}
          {counts ? (
            <div className="flex flex-col gap-2">
              <Button disabled={busy} onClick={() => void step(m.dryRun)}>
                {t.dryRun}
              </Button>
              <p className="text-xs text-muted-foreground">{t.dryRunHint}</p>
            </div>
          ) : null}
        </>
      ) : null}

      {m.phase === 'planned' && m.plan ? (
        <Card data-testid="migration-plan">
          <CardHeader>
            <CardTitle>{t.planTitle}</CardTitle>
            <CardDescription>{t.planCounts(m.plan.result.report.counts.templates, m.plan.result.report.counts.entries, m.plan.result.report.counts.attachments)}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p>
              {t.planNew(m.plan.added + m.plan.updated)} · {t.planUnchanged(m.plan.unchanged)}
            </p>
            {m.plan.result.report.counts.skippedDeleted ? <p className="text-muted-foreground">{t.skipped(m.plan.result.report.counts.skippedDeleted)}</p> : null}
            <ReportList title={t.undecryptable} items={m.plan.result.report.undecryptable.map((u) => `${u.date.slice(0, 10)}: ${u.reason}`)} testId="report-undecryptable" />
            <ReportList title={t.unknownValues} items={m.plan.result.report.unknownValues.map((u) => `${u.date} · ${u.block}: ${u.value}`)} />
            <ReportList title={t.warnings} items={m.plan.result.report.warnings} />
            <Button disabled={busy} onClick={() => void step(m.apply)}>
              {busy ? t.writing : t.confirm}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {m.phase === 'done' && m.verify && m.state ? (
        <Card data-testid="migration-done">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {m.verify.ok ? <CheckCircle2 aria-hidden className="size-5" /> : <TriangleAlert aria-hidden className="size-5 text-destructive" />}
              {m.verify.ok ? t.doneOk : t.doneErrors}
            </CardTitle>
            <CardDescription>{t.verifySummary(m.verify.checkedEntries, m.verify.sampled)}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ReportList title={t.doneErrors} items={m.verify.errors} />
            <Button variant="outline" onClick={() => downloadText(`schmerztagebuch-migrationsbericht-${m.state!.lastRunAt.slice(0, 10)}.txt`, reportText(m.state!), 'text/plain;charset=utf-8')}>
              {t.downloadReport}
            </Button>
            <Button asChild>
              <Link to="/history">{t.toHistory}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}

function ReportList({ title, items, testId }: { title: string; items: readonly string[]; testId?: string }) {
  if (!items.length) return null;
  return (
    <section data-testid={testId}>
      <h3 className="font-medium">
        {title} ({items.length})
      </h3>
      <ul className="ml-4 list-disc text-muted-foreground">
        {items.slice(0, 50).map((i, n) => (
          <li key={n}>{i}</li>
        ))}
      </ul>
    </section>
  );
}

function BackupFileCard({ onFile }: { onFile: (text: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    try {
      onFile(await f.text());
    } catch (err) {
      setError(t.fileErrors[codeOf(err) as keyof typeof t.fileErrors] ?? t.error);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileUp aria-hidden className="size-4" />
          {t.fileTitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Label htmlFor="v2-backup-file">{t.fileLabel}</Label>
        <Input id="v2-backup-file" type="file" accept="application/json,.json" onChange={(e) => void pick(e)} />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PasswordCard({ ok, onUnlock }: { ok: boolean; onUnlock: (pw: string) => Promise<void> }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onUnlock(pw);
    } catch (err) {
      setError(codeOf(err) === 'wrong-password' ? t.wrongPassword : t.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.passwordTitle}</CardTitle>
        <CardDescription>{t.passwordHint}</CardDescription>
      </CardHeader>
      <CardContent>
        {ok ? (
          <p data-testid="v2-password-ok" className="flex items-center gap-2 text-sm">
            <CheckCircle2 aria-hidden className="size-4" />
            {t.unlocked}
          </p>
        ) : (
          <form className="flex flex-col gap-2" onSubmit={(e) => void submit(e)}>
            <Label htmlFor="v2-password">{t.passwordLabel}</Label>
            <Input id="v2-password" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={busy || !pw}>
              {t.unlock}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function CloudCard({ m }: { m: ReturnType<typeof useMigration> }) {
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [pull, setPull] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errText = (e: unknown) => {
    const c = codeOf(e);
    return t.cloudErrors[(c === 'wrong-backup-code' || c in t.cloudErrors ? c : e instanceof Error && e.name === 'PrfUnsupportedError' ? 'prf-unsupported' : 'login-failed') as keyof typeof t.cloudErrors];
  };
  async function run(p: Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await p;
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }
  if (m.cloudOk) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.cloudTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm" data-testid="v2-cloud-ok">
          <p className="flex items-center gap-2">
            <CheckCircle2 aria-hidden className="size-4" />
            {t.cloudOk}
          </p>
          {m.pulled ? <p className="text-muted-foreground">{t.pulledOk}</p> : null}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.cloudTitle}</CardTitle>
        <CardDescription>{t.cloudHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="v2-username">{t.username}</Label>
          <Input id="v2-username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} onBlur={() => username && void m.preparePasskey(username).catch(() => undefined)} />
        </div>
        <div className="flex items-center gap-3">
          <Checkbox id="v2-pull" checked={pull} onChange={(e) => setPull(e.target.checked)} />
          <Label htmlFor="v2-pull">{t.pullServer}</Label>
        </div>
        {/* Passkey: credentials.get startet direkt im Klick (Optionen wurden beim Verlassen des Namensfelds geladen) */}
        <Button variant="outline" disabled={busy || !username} onClick={() => void run(m.loginPasskey(username, pull))}>
          {t.withPasskey}
        </Button>
        <div className="flex flex-col gap-2">
          <Label htmlFor="v2-backup-code">{t.backupCode}</Label>
          <Input id="v2-backup-code" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
          <Button disabled={busy || !username || !code} onClick={() => void run(m.loginBackupCode(username, code, pull))}>
            {t.withBackupCode}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
