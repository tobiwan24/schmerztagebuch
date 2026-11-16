// „Rollen vorschlagen“ im Vorlagen-Editor (Spec 05/08, BLK-53): Freigabe je Vorgang, dann einzeln übernehmen oder verwerfen.
// Gesendet werden nur Bezeichnungen, Beschreibungen und Typen der Bausteine; nichts davon wird gespeichert.
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { BlockDef } from '@stb/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { LlmConsentDialog } from '@/components/LlmConsentDialog';
import { llmErrorMessage } from '@/components/LlmFillButton';
import { requestRoles } from '@/llm/client';
import { draftVersion, rolesPreview, usableSuggestions, withRole, type RoleSuggestion } from '@/llm/roles';
import { useLlm } from '@/llm/useLlm';
import { de } from '@/i18n/de';

const t = de.llm.roles;

export function LlmRolesButton({ templateName, templateId, blocks, valid, now, onBlocks }: {
  templateName: string;
  templateId: string;
  blocks: BlockDef[];
  /** Nur gültige Entwürfe lassen sich senden (der Server prüft die Blöcke). */
  valid: boolean;
  now: string;
  onBlocks: (next: BlockDef[]) => void;
}) {
  const llm = useLlm();
  const [step, setStep] = useState<'closed' | 'consent' | 'result'>('closed');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<RoleSuggestion[]>([]);
  if (llm.availability === 'hidden' || !llm.status) return null;

  const close = () => {
    setStep('closed');
    setError(null);
    setBusy(false);
    setOpen([]);
  };

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const response = await requestRoles({ templateName: templateName.trim() || de.templates.editor.titleNew, version: draftVersion(templateId, blocks, now) });
      setOpen(usableSuggestions(blocks, response));
      setStep('result');
      setBusy(false);
    } catch (e) {
      setError(llmErrorMessage(e));
      setBusy(false);
    }
  }

  const drop = (blockId: string) => setOpen((list) => list.filter((s) => s.blockId !== blockId));

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" disabled={llm.availability === 'disabled' || !valid || blocks.length === 0} onClick={() => setStep('consent')} data-testid="llm-roles-open">
        <Sparkles aria-hidden />
        {t.button}
      </Button>
      {llm.availability === 'disabled' ? <p className="text-sm text-muted-foreground">{de.llm.offlineHint}</p> : null}
      {llm.availability === 'enabled' && !valid && blocks.length > 0 ? <p className="text-sm text-muted-foreground">{t.needValid}</p> : null}

      <LlmConsentDialog
        open={step === 'consent'} title={t.consentTitle} content={rolesPreview(blocks)} extra={t.extra} recipient={de.llm.recipient(llm.status.provider, llm.status.thirdParty)}
        busy={busy} error={error} onConfirm={() => void send()} onCancel={() => step === 'consent' && close()}
      />

      <Dialog open={step === 'result'} onClose={() => step === 'result' && close()} aria-labelledby="llm-roles-title">
        <DialogTitle id="llm-roles-title">{t.resultTitle}</DialogTitle>
        <DialogDescription>{open.length > 0 ? t.resultHint : t.none}</DialogDescription>
        <ul className="mt-3 flex flex-col gap-3" data-testid="llm-roles-list">
          {open.map((s) => (
            <li key={s.blockId} className="flex flex-col gap-2 rounded-md border p-3" data-testid="llm-roles-item">
              <p className="text-sm font-medium">
                {s.label} <Badge variant="secondary">{de.templates.editor.roles[s.role]}</Badge>
              </p>
              {s.reason ? <p className="text-sm text-muted-foreground">{s.reason}</p> : null}
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => { onBlocks(withRole(blocks, s.blockId, s.role)); drop(s.blockId); }}>{t.accept}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => drop(s.blockId)}>{t.reject}</Button>
              </div>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>{t.done}</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
