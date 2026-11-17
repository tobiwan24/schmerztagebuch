// Freigabe je Vorgang (Spec 08, A-086): zeigt den genauen Text und den Empfänger, gesendet wird erst nach „Senden“.
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { deLlm } from '@/i18n/lazy/llm';

const t = deLlm.consent;

export function LlmConsentDialog({ open, title, content, extra, recipient, busy, error, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  /** Der Text, der gesendet wird (genau so). */
  content: string;
  /** Hinweis auf weitere mitgesendete Angaben (z. B. Feldbezeichnungen der Vorlage). */
  extra?: string;
  recipient: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} aria-labelledby="llm-consent-title">
      <DialogTitle id="llm-consent-title">{title}</DialogTitle>
      <DialogDescription>
        {t.recipientLabel} <strong data-testid="llm-consent-recipient">{recipient}</strong>
      </DialogDescription>
      <pre data-testid="llm-consent-text" className="mt-3 max-h-48 overflow-auto rounded-md border bg-muted p-3 text-sm whitespace-pre-wrap">{content}</pre>
      {extra ? <p className="mt-2 text-sm text-muted-foreground">{extra}</p> : null}
      <p className="mt-2 text-sm text-muted-foreground">{t.notice}</p>
      {error ? <p role="alert" data-testid="llm-consent-error" className="mt-3 text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>{t.cancel}</Button>
        <Button type="button" disabled={busy} onClick={onConfirm}>{busy ? t.sending : t.send}</Button>
      </DialogFooter>
    </Dialog>
  );
}
