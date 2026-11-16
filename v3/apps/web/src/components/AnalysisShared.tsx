// Gemeinsame Bausteine der Auswertungs-Ansichten: Abfrage an den Analyse-Worker und Feldauswahl.
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAnalysis } from '@/data/AnalysisContext';
import { de } from '@/i18n/de';
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
export function BlockPicker({ blocks, value, onChange, label = de.analysis.block }: { blocks: { blockId: string; label: string; templateName: string }[]; value: string | undefined; onChange: (id: string) => void; label?: string }) {
  if (blocks.length < 2) return null;
  const dup = (l: string) => blocks.filter((b) => b.label === l).length > 1;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {blocks.map((b) => (
        <Button key={b.blockId} size="sm" variant={b.blockId === value ? 'default' : 'outline'} aria-pressed={b.blockId === value} onClick={() => onChange(b.blockId)}>
          {dup(b.label) ? de.analysis.blockOf(b.label, b.templateName) : b.label}
        </Button>
      ))}
    </div>
  );
}
