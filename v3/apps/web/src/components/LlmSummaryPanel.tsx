// „Zusammenfassung für den Arzt“ (Spec 08, VOI-15): standardmäßig gehen nur Kennzahlen raus, Notizen nur per Häkchen.
// Freigabe je Vorgang mit genauem Inhalt und Empfänger; das Ergebnis ist ein bearbeitbarer Entwurf mit Hinweis
// „keine Diagnose“ und kann optional als Abschnitt in den PDF-Export. Nichts wird gespeichert.
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { summaryPreview, type SummaryInput } from '@stb/export';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LlmConsentDialog } from '@/components/LlmConsentDialog';
import { llmErrorMessage } from '@/components/LlmFillButton';
import { requestSummary } from '@/llm/client';
import { useLlm } from '@/llm/useLlm';
import { de } from '@/i18n/de';

const t = de.llm.summary;

export function LlmSummaryPanel({ buildInput, disabled = false, text, onText, includeInPdf, onIncludeInPdf }: {
  /** Kennzahlen (und mit `includeNotes` auch Notizen) für den aktuell gewählten Zeitraum und Filter. */
  buildInput: (includeNotes: boolean) => Promise<SummaryInput>;
  disabled?: boolean;
  text: string;
  onText: (text: string) => void;
  includeInPdf: boolean;
  onIncludeInPdf: (on: boolean) => void;
}) {
  const llm = useLlm();
  const [includeNotes, setIncludeNotes] = useState(false);
  const [input, setInput] = useState<SummaryInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (llm.availability === 'hidden' || !llm.status) return null;

  async function prepare() {
    setError(null);
    try {
      setInput(await buildInput(includeNotes));
    } catch {
      setError(de.llm.errors.failed!);
    }
  }

  async function send() {
    if (!input) return;
    setBusy(true);
    setError(null);
    try {
      const r = await requestSummary({ period: input.period, facts: input.facts, ...(input.notes?.length ? { notes: input.notes } : {}) });
      onText(r.summary);
      onIncludeInPdf(true);
      setInput(null);
    } catch (e) {
      setError(llmErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-3" aria-labelledby="llm-summary-heading" data-testid="llm-summary">
      <h3 id="llm-summary-heading" className="font-medium">{t.heading}</h3>
      <p className="text-sm text-muted-foreground">{t.hint}</p>
      <div className="flex items-center gap-2">
        <Checkbox id="llm-summary-notes" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} />
        <Label htmlFor="llm-summary-notes" className="font-normal">{t.includeNotes}</Label>
      </div>
      <Button type="button" variant="outline" disabled={disabled || llm.availability === 'disabled'} onClick={() => void prepare()} data-testid="llm-summary-open">
        <Sparkles aria-hidden />
        {t.button}
      </Button>
      {llm.availability === 'disabled' ? <p className="text-sm text-muted-foreground">{de.llm.offlineHint}</p> : null}
      {error && !input ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      {text ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="llm-summary-text">{t.textLabel}</Label>
          <Textarea id="llm-summary-text" rows={6} value={text} onChange={(e) => onText(e.target.value)} />
          <p className="text-sm text-muted-foreground" data-testid="llm-summary-notice">{t.notice}</p>
          <div className="flex items-center gap-2">
            <Checkbox id="llm-summary-pdf" checked={includeInPdf} onChange={(e) => onIncludeInPdf(e.target.checked)} />
            <Label htmlFor="llm-summary-pdf" className="font-normal">{t.includeInPdf}</Label>
          </div>
        </div>
      ) : null}

      <LlmConsentDialog
        open={input !== null} title={t.consentTitle} content={input ? summaryPreview(input) : ''}
        extra={input?.notes?.length ? t.extraNotes : t.extraFactsOnly} recipient={de.llm.recipient(llm.status.provider, llm.status.thirdParty)}
        busy={busy} error={error} onConfirm={() => void send()} onCancel={() => { setInput(null); setError(null); }}
      />
    </section>
  );
}
