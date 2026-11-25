// Gemeinsame Bausteine der Auswertungs-Ansichten: Abfrage an den Analyse-Worker und Feldauswahl.
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAnalysis } from '@/data/AnalysisContext';
import { deAnalysis } from '@/i18n/lazy/analysis';
import type { AnalysisClient } from '@/workers/analysis-service';

/** Abfrage an den Worker, neu bei geändertem Arbeitsset (`version`) oder Abhängigkeiten. */
export function useWorker<T>(fn: (c: AnalysisClient) => Promise<T>, deps: readonly unknown[]): T | null {
  const { client, version } = useAnalysis();
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    void fn(client).then((d) => !cancelled && setData(d));
    return () => {
      cancelled = true;
    };
    // `fn` ist pro Render neu; neu geladen wird über `deps` und `version`.
  }, [client, version, ...deps]);
  return data;
}

/** Feldauswahl; gleich benannte Felder verschiedener Vorlagen tragen den Vorlagennamen. */
export function BlockPicker({ blocks, value, onChange, label = deAnalysis.block, showLabel = false }: { blocks: { blockId: string; label: string; templateName: string }[]; value: string | undefined; onChange: (id: string) => void; label?: string; showLabel?: boolean }) {
  const labelId = useId();
  if (blocks.length < 2) return null;
  const dup = (l: string) => blocks.filter((b) => b.label === l).length > 1;
  const group = (
    <div role="group" {...(showLabel ? { 'aria-labelledby': labelId } : { 'aria-label': label })} className="flex flex-wrap gap-2">
      {blocks.map((b) => (
        <Button key={b.blockId} size="sm" className="h-auto min-h-9 max-w-full whitespace-normal py-1 text-left" variant={b.blockId === value ? 'default' : 'outline'} aria-pressed={b.blockId === value} onClick={() => onChange(b.blockId)}>
          {dup(b.label) ? deAnalysis.blockOf(b.label, b.templateName) : b.label}
        </Button>
      ))}
    </div>
  );
  if (!showLabel) return group;
  return (
    <div className="flex flex-col gap-1">
      <p id={labelId} className="text-sm font-medium">{label}</p>
      {group}
    </div>
  );
}
