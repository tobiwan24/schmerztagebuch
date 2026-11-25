// Tagebuch → Kurzbefehl (Spec 08): Intake einrichten (nur mit Konto; Hinweisdialog mit Pflicht-Bestätigung, VOI-02),
// geführter Ablauf (Hinweis, installieren, Zugangsdaten kopieren, testen; FEAT-023), Schlüssel widerrufen; Zwischenablage-Weg mit Entwurf (VOI-09, auch local-only).
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Check } from 'lucide-react';
import { displayValue } from '@stb/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/StateView';
import { useInbox, useShortcut } from '@/data/useShortcut';
import { SHORTCUT_ICLOUD_URL } from '@/intake/config';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  if (!data) return null;
  const configured = data.keys.length > 0;
  async function confirm() {
    setBusy(true);
    setError(false);
    try {
      await sc.setup();
      setOpen(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    setChecking(true);
    try {
      await sc.checkArrival();
      setChecked(true);
    } finally {
      setChecking(false);
    }
  }
  const arrivedAt = data.lastShortcutEntryAt ? new Date(data.lastShortcutEntryAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <Card data-testid="intake-card">
      <CardHeader>
        <CardTitle className="text-base">{t.intakeTitle}</CardTitle>
        <CardDescription>{t.intakeHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <section data-testid="intake-step-1" className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-sm font-medium"><Badge>1</Badge>{t.step1Title}</h3>
          <p className="text-sm text-muted-foreground">{t.step1Text}</p>
          {configured ? <Badge variant="outline" className="self-start"><Check className="size-3" />{t.step1Done}</Badge> : null}
          <Button onClick={() => (setUnderstood(false), setOpen(true))}>{configured ? t.newToken : t.setup}</Button>
        </section>
        {configured ? (
          <>
            <Separator />
            <section data-testid="intake-step-2" className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-sm font-medium"><Badge>2</Badge>{t.step2Title}</h3>
              {SHORTCUT_ICLOUD_URL ? <Button onClick={() => window.open(SHORTCUT_ICLOUD_URL, '_blank', 'noopener')}>{t.download}</Button> : null}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm">{t.buildTitle}</Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ol className="ml-4 mt-2 list-decimal text-sm text-muted-foreground">
                    {t.steps.map((st) => <li key={st}>{st}</li>)}
                  </ol>
                </CollapsibleContent>
              </Collapsible>
            </section>
            <Separator />
            <section data-testid="intake-step-3" className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-sm font-medium"><Badge>3</Badge>{t.step3Title}</h3>
              <p className="text-sm text-muted-foreground">{t.step3Text}</p>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">{t.endpoint}</span>
                <code className="break-all text-xs">{data.endpoint}</code>
              </div>
              {data.connection ? (
                <Button variant="outline" onClick={() => (copy(data.connection!), setCopied(true))}>{copied ? t.copied : t.copyConnection}</Button>
              ) : (
                <p role="status" className="text-sm text-muted-foreground">{t.noConnection}</p>
              )}
            </section>
            <Separator />
            <section data-testid="intake-step-4" className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-sm font-medium"><Badge>4</Badge>{t.step4Title}</h3>
              <p className="text-sm text-muted-foreground">{t.step4Text}</p>
              <Button variant="outline" disabled={checking} onClick={() => void check()}>{t.check}</Button>
              {checked ? (
                <Badge data-testid="intake-arrival" variant={arrivedAt ? 'default' : 'outline'} className="self-start">
                  {arrivedAt ? t.arrived(arrivedAt) : t.notArrived}
                </Badge>
              ) : null}
            </section>
            <Separator />
            <ul data-testid="intake-keys" className="flex flex-col gap-2">
              {data.keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{t.keyCreated(new Date(k.createdAt).toLocaleString('de-DE'))}</span>
                  <Button size="sm" variant="outline" onClick={() => void sc.revoke(k)}>{t.revoke}</Button>
                </li>
              ))}
            </ul>
          </>
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
