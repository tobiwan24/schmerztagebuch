// Einstellungen → KI-Funktionen (Spec 08, VOI-16): Opt-in (Standard aus), Anbieter, Modell und „Drittanbieter ja/nein“
// aus dem Serverstatus. Das Einschalten erklärt vorab, wohin der Text eines Vorgangs geht.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useLlm } from '@/llm/useLlm';
import { de } from '@/i18n/de';

const t = de.llm;

export function LlmSettingsCard() {
  const llm = useLlm();
  const [confirm, setConfirm] = useState(false);
  const { status } = llm;

  let body;
  if (!llm.syncAttached) body = <p className="text-sm text-muted-foreground" data-testid="llm-needs-account">{t.needAccount}</p>;
  else if (llm.loading) body = <p className="text-sm text-muted-foreground">{de.app.loading}</p>;
  else if (status === null) body = <p className="text-sm text-muted-foreground" data-testid="llm-off">{t.off}</p>;
  else if (!status) body = <p className="text-sm text-muted-foreground" data-testid="llm-unreachable">{t.unreachable}</p>;
  else {
    const recipient = t.recipient(status.provider, status.thirdParty);
    body = (
      <>
        <p className="text-sm text-muted-foreground">{t.intro}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm" data-testid="llm-status">
          <dt className="text-muted-foreground">{t.provider}</dt>
          <dd>{t.providerName[status.provider] ?? status.provider}</dd>
          <dt className="text-muted-foreground">{t.model}</dt>
          <dd>{status.model}</dd>
          <dt className="text-muted-foreground">{t.thirdParty}</dt>
          <dd data-testid="llm-third-party">{status.thirdParty ? t.thirdPartyYes : t.thirdPartyNo}</dd>
        </dl>
        <p className="text-sm text-muted-foreground">{t.usage(status.usedTokens, status.dailyTokens)}</p>
        <div className="flex flex-col gap-1">
          <Label className="min-h-11 gap-3">
            <Checkbox
              checked={llm.optIn}
              onChange={(e) => (e.target.checked ? setConfirm(true) : llm.setOptIn(false))}
            />
            {t.optIn}
          </Label>
          <p className="text-sm text-muted-foreground">{t.optInHint}</p>
          {llm.online ? null : <p role="status" className="text-sm text-muted-foreground" data-testid="llm-offline">{t.offlineHint}</p>}
        </div>
        <Dialog open={confirm} onClose={() => setConfirm(false)} aria-labelledby="llm-optin-title">
          <DialogTitle id="llm-optin-title">{t.optInDialogTitle}</DialogTitle>
          <DialogDescription data-testid="llm-optin-recipient">{t.optInDialogBody(recipient)}</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>{t.optInCancel}</Button>
            <Button onClick={() => { llm.setOptIn(true); setConfirm(false); }}>{t.optInConfirm}</Button>
          </DialogFooter>
        </Dialog>
      </>
    );
  }
  return (
    <Card data-testid="llm-card">
      <CardHeader>
        <CardTitle>{t.heading}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{body}</CardContent>
    </Card>
  );
}
