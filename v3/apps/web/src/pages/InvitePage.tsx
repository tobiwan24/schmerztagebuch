// Einladung annehmen (Spec 09): `/invite#<id>.<secret>` — das Geheimnis bleibt im Fragment (erreicht den Server nie,
// SHR-02). Zeigt Tagebuch, Rolle und wer einlädt; Annahme bindet den eigenen Identity-Key per HMAC an das Geheimnis.
import { useState } from 'react';
import { useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { useInvitation } from '@/data/useSharing';
import { parseInviteFragment } from '@/sharing/flow';
import { deInvite } from '@/i18n/lazy/invite';

const t = deInvite;

export function InvitePage() {
  const { hash } = useLocation();
  const parsed = parseInviteFragment(hash);
  const inv = useInvitation(parsed?.id ?? null, parsed?.secret ?? null);
  const [state, setState] = useState<'idle' | 'busy' | 'accepted' | 'error'>('idle');
  const d = inv.details;
  async function accept() {
    setState('busy');
    try {
      await inv.accept();
      setState('accepted');
    } catch {
      setState('error');
    }
  }
  return (
    <>
      <PageHeader title={t.title} back />
      {!parsed ? <p data-testid="invite-invalid">{t.invalid}</p> : null}
      {parsed && d.status === 'error' ? <p data-testid="invite-invalid">{t.gone}</p> : null}
      {parsed && d.status === 'ok' && d.data ? (
        <Card data-testid="invite-details">
          <CardHeader>
            <CardTitle>{d.data.diaryName}</CardTitle>
            <CardDescription>{t.details(d.data.inviterName, t.roles[d.data.role])}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {inv.isCloud.status === 'ok' && !inv.isCloud.data ? <p className="text-sm text-muted-foreground">{t.needsAccount}</p> : null}
            {state === 'accepted' ? (
              <p data-testid="invite-accepted" className="text-sm">{t.accepted}</p>
            ) : (
              <Button disabled={state === 'busy' || (inv.isCloud.status === 'ok' && !inv.isCloud.data)} onClick={() => void accept()}>{t.accept}</Button>
            )}
            {state === 'error' ? <p role="alert" className="text-sm text-destructive">{t.error}</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
