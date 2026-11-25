// Einstellungen → Integrationen (Spec 07, EXP-27, A-094): lesende Zugänge anlegen (Zugangsstring einmalig), Liste, Widerruf.
import { useState } from 'react';
import { Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDiaryScope } from '@/data/diary-scope';
import { useIntegrations } from '@/data/useIntegrations';
import { deIntegrations as t } from '@/i18n/lazy/integrations';

const day = (ms: number) => new Date(ms).toLocaleDateString('de-DE');

export function IntegrationsCard() {
  const { diaryId, diaries } = useDiaryScope(false);
  const current = diaries.find((d) => d.id === (diaryId ?? diaries[0]?.id));
  const { query, create, revoke } = useIntegrations(current?.id ?? null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  const fail = (e: unknown) => setError(t.errors[(e as { code?: string }).code as keyof typeof t.errors] ?? t.failed);
  const closeSecret = () => {
    setSecret(null);
    setCopied(false);
  };

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setSecret(await create(name));
      setName('');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function doRevoke(id: string) {
    setBusy(true);
    setError(null);
    try {
      await revoke(id);
      setConfirm(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  if (!current) return null;
  const list = query.status === 'ok' ? query.data : [];
  return (
    <Card data-testid="integrations-card">
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t.intro}</p>
        <p className="text-sm text-muted-foreground">{t.rotationHint}</p>
        <p className="text-sm font-medium">{t.diaryLabel(current.name)}</p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="integration-name">{t.nameLabel}</Label>
          <Input id="integration-name" value={name} maxLength={60} placeholder={t.namePlaceholder} onChange={(e) => setName(e.target.value)} />
          <Button disabled={busy || !name.trim()} onClick={() => void run()}>
            {busy ? t.creating : t.create}
          </Button>
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <section aria-label={t.listTitle} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t.listTitle}</h3>
          {query.status === 'error' ? <p role="alert" className="text-sm text-destructive">{t.failed}</p> : null}
          {query.status === 'ok' && list.length === 0 ? <p className="text-sm text-muted-foreground">{t.listEmpty}</p> : null}
          <ul className="flex flex-col gap-2">
            {list.map((i) => (
              <li key={i.id} data-testid="integration-row" data-revoked={i.revokedAt !== null} className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{i.name ?? t.unnamed}</span>
                  <Badge variant={i.revokedAt === null ? 'default' : 'secondary'}>{i.revokedAt === null ? t.active : t.revokedBadge}</Badge>
                </div>
                <span className="text-sm text-muted-foreground">
                  {t.created(day(i.createdAt))} · {i.lastUsedAt === null ? t.neverUsed : t.lastUsed(day(i.lastUsedAt))}
                </span>
                {i.revokedAt === null ? (
                  confirm === i.id ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm">{t.revokeConfirmText}</p>
                      <div className="flex gap-2">
                        <Button variant="destructive" disabled={busy} onClick={() => void doRevoke(i.id)}>{t.revokeYes}</Button>
                        <Button variant="outline" onClick={() => setConfirm(null)}>{t.revokeNo}</Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" className="self-start" onClick={() => setConfirm(i.id)}>{t.revoke}</Button>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        </section>
        <Dialog open={secret !== null} onClose={closeSecret} aria-labelledby="integration-secret-title">
          <DialogTitle id="integration-secret-title">{t.createdTitle}</DialogTitle>
          <DialogDescription>{t.createdWarning}</DialogDescription>
          <div className="mt-4 flex flex-col gap-3">
            <Label htmlFor="integration-secret">{t.accessLabel}</Label>
            <Input id="integration-secret" data-testid="integration-secret" readOnly value={secret ?? ''} onFocus={(e) => e.currentTarget.select()} />
            <Button onClick={() => void navigator.clipboard.writeText(secret ?? '').then(() => setCopied(true)).catch(() => undefined)}>
              <Copy aria-hidden />
              {t.copy}
            </Button>
            {copied ? <p role="status" className="text-sm text-muted-foreground">{t.copied}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeSecret}>{t.close}</Button>
          </DialogFooter>
        </Dialog>
      </CardContent>
    </Card>
  );
}
