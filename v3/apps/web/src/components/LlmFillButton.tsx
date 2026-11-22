// „Aus Text ausfüllen“ (Spec 08, VOI-14): Text eingeben → Freigabe mit Text und Empfänger → Entwurf für das Formular.
// Der Text lebt nur im Arbeitsspeicher dieses Dialogs (keine Outbox, kein IndexedDB) und wird nach dem Vorgang verworfen.
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { TemplateVersion } from '@stb/core';
import { LLM_TEXT_MAX_CHARS, type LlmFillResponse } from '@stb/sync-protocol';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LlmConsentDialog } from '@/components/LlmConsentDialog';
import { LlmClientError, requestFill } from '@/llm/client';
import { useLlm } from '@/llm/useLlm';
import { deLlm } from '@/i18n/lazy/llm';

const t = deLlm.fill;

export function llmErrorMessage(e: unknown): string {
  const code = e instanceof LlmClientError ? e.code : 'failed';
  return deLlm.errors[code] ?? deLlm.errors.failed!;
}

export function LlmFillButton({ templateName, version, onDraft }: { templateName: string; version: TemplateVersion; onDraft: (r: LlmFillResponse) => void }) {
  const llm = useLlm();
  const [step, setStep] = useState<'closed' | 'input' | 'consent'>('closed');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (llm.availability === 'hidden' || !llm.status) return null;

  const close = () => {
    setStep('closed');
    setText('');
    setError(null);
    setBusy(false);
  };

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const response = await requestFill({ templateName, version, text: text.trim(), now: new Date().toISOString() });
      close();
      onDraft(response);
    } catch (e) {
      setError(llmErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" disabled={llm.availability === 'disabled'} onClick={() => setStep('input')} data-testid="llm-fill-open">
        <Sparkles aria-hidden />
        {t.button}
      </Button>
      {llm.availability === 'disabled' ? <p className="text-sm text-muted-foreground">{deLlm.offlineHint}</p> : null}

      <Dialog open={step === 'input'} onClose={() => step === 'input' && close()} aria-labelledby="llm-fill-title">
        <DialogTitle id="llm-fill-title">{t.title}</DialogTitle>
        <DialogDescription>{t.hint}</DialogDescription>
        <div className="mt-3 flex flex-col gap-2">
          <Label htmlFor="llm-fill-text">{t.textLabel}</Label>
          <Textarea id="llm-fill-text" value={text} maxLength={LLM_TEXT_MAX_CHARS} placeholder={t.placeholder} onChange={(e) => setText(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>{deLlm.consent.cancel}</Button>
          <Button type="button" disabled={text.trim() === ''} onClick={() => setStep('consent')}>{t.next}</Button>
        </DialogFooter>
      </Dialog>

      <LlmConsentDialog
        open={step === 'consent'} title={t.consentTitle} content={text.trim()} extra={t.extra} recipient={deLlm.recipient(llm.status.provider, llm.status.thirdParty)}
        busy={busy} error={error} onConfirm={() => void send()} onCancel={() => step === 'consent' && close()}
      />
    </div>
  );
}
