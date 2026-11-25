// Start-Banner für ausgelöste Hinweis-Regeln (ANA-30): beschreibender Text, keine Empfehlung.
import { Button } from '@/components/ui/button';
import { useRuleHints } from '@/data/useRuleHints';
import { de } from '@/i18n/de';

export function RuleBanner() {
  const { hints, dismiss } = useRuleHints();
  if (!hints.length) return null;
  return (
    <>
      {hints.map((h) => (
        <div key={h.ruleId} role="status" data-testid="rule-banner" className="flex items-start justify-between gap-2 rounded-lg border bg-accent px-4 py-3 text-sm">
          <div className="flex flex-col gap-1">
            <span className="font-medium">{de.hints.bannerTitle}</span>
            <span>{h.text}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => dismiss(h.ruleId)}>
            {de.hints.dismiss}
          </Button>
        </div>
      ))}
    </>
  );
}
