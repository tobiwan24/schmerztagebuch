// Hinweis nach „Aus Text ausfüllen“: wie viele Felder gefüllt wurden, was verworfen wurde. Nichts ist gespeichert.
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { FillDraft } from '@/llm/fill';
import { cn } from '@/lib/utils';
import { de } from '@/i18n/de';

const t = de.llm.fill;

export function LlmDraftNotice({ draft, onDismiss }: { draft: FillDraft; onDismiss: () => void }) {
  return (
    <section role="status" data-testid="llm-draft-notice" className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
      <h2 className="font-medium">{t.draftTitle}</h2>
      <p>{draft.changed.length > 0 ? t.draftFilled(draft.changed.length) : t.draftNothing}</p>
      {draft.changed.length > 0 ? <p className="text-muted-foreground">{t.draftCheck}</p> : null}
      {draft.rejected.length > 0 ? (
        <div data-testid="llm-rejected">
          <p className="font-medium">{t.rejectedHeading}</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {draft.rejected.map((r, i) => (
              <li key={i}>{r.label ? `${r.label}: ${r.message ?? ''}` : t.rejectedUnknown}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {draft.unassigned ? (
        <p className="text-muted-foreground">
          {t.unassigned} <span data-testid="llm-unassigned">{draft.unassigned}</span>
        </p>
      ) : null}
      <Button type="button" variant="ghost" size="sm" className="self-start" onClick={onDismiss}>{t.dismiss}</Button>
    </section>
  );
}

/** Markiert ein vom Entwurf geändertes Feld, bis der Nutzer es selbst anfasst. */
export function LlmMarked({ marked, children }: { marked: boolean; children: ReactNode }) {
  return (
    <div data-llm-changed={marked || undefined} className={cn(marked && 'rounded-lg ring-2 ring-primary/50 ring-offset-2 ring-offset-background')}>
      {marked ? <Badge className="mb-1">{t.changedBadge}</Badge> : null}
      {children}
    </div>
  );
}
