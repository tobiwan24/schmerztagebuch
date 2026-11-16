// Arzt-Link erstellen (Spec 07, M18): Erklärung, Ablauf und Höchstzahl der Aufrufe wählen, Link kopieren oder teilen.
import { useState } from 'react';
import { Copy, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { de } from '@/i18n/de';
import type { CreatedReportLink } from '@/sharing/report-link';

const t = de.exportPage.reportLink;
const EXPIRY_DAYS = [1, 7, 14, 30];
const MAX_VIEWS = [1, 5, 10, 20];

export function ReportLinkDialog({ open, onClose, create }: { open: boolean; onClose: () => void; create: (o: { expiresInDays: number; maxViews: number }) => Promise<CreatedReportLink> }) {
  const [days, setDays] = useState(14);
  const [views, setViews] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedReportLink | null>(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setCreated(await create({ expiresInDays: days, maxViews: views }));
    } catch (e) {
      setError(t.errors[(e as { code?: string }).code as keyof typeof t.errors] ?? t.errors.failed);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setCreated(null);
    setError(null);
    setCopied(false);
    onClose();
  }

  async function copy() {
    if (!created) return;
    await navigator.clipboard.writeText(created.link);
    setCopied(true);
  }

  return (
    <Dialog open={open} onClose={close} aria-labelledby="report-link-title">
      <DialogTitle id="report-link-title">{t.title}</DialogTitle>
      <DialogDescription>{t.explain}</DialogDescription>
      <p className="mt-2 text-sm font-medium">{t.warning}</p>
      {created ? (
        <div className="mt-4 flex flex-col gap-3">
          <Label htmlFor="report-link-url">{t.linkLabel}</Label>
          <Input id="report-link-url" data-testid="report-link" readOnly value={created.link} onFocus={(e) => e.currentTarget.select()} />
          <p className="text-sm text-muted-foreground">{t.expiresAt(new Date(created.expiresAt).toLocaleDateString('de-DE'))}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void copy()}>
              <Copy aria-hidden />
              {t.copy}
            </Button>
            {typeof navigator.share === 'function' ? (
              <Button variant="outline" onClick={() => void navigator.share({ title: t.shareTitle, url: created.link }).catch(() => undefined)}>
                <Share2 aria-hidden />
                {t.share}
              </Button>
            ) : null}
          </div>
          {copied ? <p role="status" className="text-sm text-muted-foreground">{t.copied}</p> : null}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <ToggleGroup aria-label={t.expiry}>
            {EXPIRY_DAYS.map((n) => (
              <ToggleGroupItem key={n} pressed={days === n} onClick={() => setDays(n)}>
                {t.expiryDays(n)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup aria-label={t.maxViews}>
            {MAX_VIEWS.map((n) => (
              <ToggleGroupItem key={n} pressed={views === n} onClick={() => setViews(n)}>
                {t.maxViewsOption(n)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
      {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button variant="outline" onClick={close}>{t.close}</Button>
        {created ? null : (
          <Button disabled={busy} onClick={() => void run()}>
            {busy ? t.creating : t.create}
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
