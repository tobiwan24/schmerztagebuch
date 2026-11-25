// Tagebuch → Kurzbefehl (Spec 08): Intake einrichten (nur mit Konto; Hinweisdialog mit Pflicht-Bestätigung, VOI-02),
// Token einmalig, Endpunkt + Prompt kopieren, Schlüssel widerrufen; Zwischenablage-Weg mit Entwurf (VOI-09, auch local-only).
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { displayValue } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/StateView';
import { useInbox, useShortcut } from '@/data/useShortcut';
import type { ShortcutDraft } from '@/intake/draft';
import { de } from '@/i18n/de';

const t = de.shortcut;

function copy(text: string) {
  void navigator.clipboard?.writeText(text).catch(() => undefined);
}

export function ShortcutPage() {
  const { id = '' } = useParams();
  const sc = useShortcut(id);
  const info = sc.info;
  return (
    <>
      <PageHeader title={t.title} back />
      {info.status === 'error' ? <ErrorState onRetry={info.retry} /> : null}
      {info.status === 'ok' && info.data ? (
        <>
          <p className="text-sm text-muted-foreground">{info.data.diary.name}</p>
          {info.data.cloud ? <IntakeCard sc={sc} /> : <p className="text-sm text-muted-foreground">{t.localOnly}</p>}
          <ClipboardCard sc={sc} />
        </>
      ) : null}
    </>
  );
}

function IntakeCard({ sc }: { sc: ReturnType<typeof useShortcut> }) {
  const data = sc.info.status === 'ok' ? sc.info.data! : null;
  const [open, setOpen] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (!data) return null;
  async function confirm() {
    setBusy(true);
    setError(false);
    try {
      setToken(await sc.setup());
      setOpen(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card data-testid="intake-card">
      <CardHeader>
        <CardTitle className="text-base">{t.intakeTitle}</CardTitle>
        <CardDescription>{t.intakeHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {token ? (
          <div data-testid="intake-token" className="flex flex-col gap-2 rounded-md border p-3">
            <p className="text-sm font-medium">{t.tokenOnce}</p>
            <code className="break-all text-xs">{token}</code>
            <Button size="sm" variant="outline" onClick={() => copy(token)}>{t.copyToken}</Button>
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t.endpoint}</span>
          <code className="break-all text-xs">{data.endpoint}</code>
        </div>
        {data.prompt ? (
          <Button size="sm" variant="outline" onClick={() => copy(data.prompt!)}>{t.copyPrompt}</Button>
        ) : null}
        <ol className="ml-4 list-decimal text-sm text-muted-foreground">
          {t.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
        <Button onClick={() => (setUnderstood(false), setOpen(true))}>{data.keys.length ? t.newToken : t.setup}</Button>
        {data.keys.length ? (
          <ul data-testid="intake-keys" className="flex flex-col gap-2">
            {data.keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{t.keyCreated(new Date(k.createdAt).toLocaleString('de-DE'))}</span>
                <Button size="sm" variant="outline" onClick={() => void sc.revoke(k)}>{t.revoke}</Button>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
      <Dialog open={open} onClose={() => setOpen(false)} aria-labelledby="intake-notice-title">
        <DialogTitle id="intake-notice-title">{t.noticeTitle}</DialogTitle>
        <DialogDescription>{t.noticeText}</DialogDescription>
        <div className="mt-4 flex items-center gap-3">
          <Checkbox id="intake-understood" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
          <Label htmlFor="intake-understood">{t.understood}</Label>
        </div>
        {error ? <p role="alert" className="mt-2 text-sm text-destructive">{t.error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t.cancel}</Button>
          <Button disabled={!understood || busy} onClick={() => void confirm()}>{t.confirm}</Button>
        </DialogFooter>
      </Dialog>
    </Card>
  );
}

function ClipboardCard({ sc }: { sc: ReturnType<typeof useShortcut> }) {
  const [params] = useSearchParams();
  const inboxId = params.get('inbox') ?? undefined;
  const { items } = useInbox();
  const fromInbox = inboxId && items.status === 'ok' ? items.data.find((i) => i.id === inboxId) : undefined;
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<ShortcutDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const effectiveText = text || (fromInbox ? JSON.stringify(fromInbox.body, null, 2) : '');

  async function paste() {
    const clip = await navigator.clipboard?.readText().catch(() => '');
    if (clip) setText(clip);
  }
  async function preview() {
    setDraft(await sc.draft(effectiveText));
  }
  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const entryId = await sc.saveDraft(draft, fromInbox?.id);
      navigate(`/entry/${entryId}`);
    } finally {
      setBusy(false);
    }
  }
  const fields = draft?.state && draft.mapping
    ? draft.state.version.blocks.filter((b) => draft.mapping!.values[b.id] !== undefined).map((b) => ({ label: b.label, text: displayValue(b, draft.mapping!.values[b.id]) }))
    : [];
  return (
    <Card data-testid="clipboard-card">
      <CardHeader>
        <CardTitle className="text-base">{t.clipboardTitle}</CardTitle>
        <CardDescription>{t.clipboardHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button variant="outline" onClick={() => void paste()}>{t.paste}</Button>
        <Label htmlFor="shortcut-json">{t.jsonLabel}</Label>
        <Textarea id="shortcut-json" rows={5} value={effectiveText} onChange={(e) => (setText(e.target.value), setDraft(null))} />
        <Button disabled={!effectiveText.trim()} onClick={() => void preview()}>{t.preview}</Button>
        {draft ? (
          <section data-testid="shortcut-draft" className="flex flex-col gap-2 rounded-md border p-3 text-sm">
            <p className="font-medium">{draft.state ? t.draftTemplate(draft.state.template.name) : t.draftNoTemplate}</p>
            <ul>
              {fields.map((f) => <li key={f.label}>{f.label}: {f.text}</li>)}
            </ul>
            {draft.problems.length ? (
              <ul role="alert" className="text-destructive">
                {draft.problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            ) : null}
            <Button disabled={busy || !draft.state || draft.problems.length > 0} onClick={() => void save()}>{t.saveDraft}</Button>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
