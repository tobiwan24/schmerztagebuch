// Liste der Versionen mit ihren Neuigkeiten — im Dialog „Neu in Version x“ und unter Einstellungen → Über (UI-27).
import type { Release } from '@/data/whats-new';

/** `2026-11-16` → `16.11.2026` (Datum ohne Zeitzone, deshalb kein `Date`). */
export const formatReleaseDate = (iso: string): string => iso.split('-').reverse().join('.');

export function ReleaseList({ releases, testId }: { releases: readonly Release[]; testId: string }) {
  return (
    <ol data-testid={testId} className="flex flex-col gap-4">
      {releases.map((r) => (
        <li key={r.version} data-testid="release">
          <h3 className="text-sm font-semibold tabular-nums">
            {r.version} <span className="font-normal text-muted-foreground">· {formatReleaseDate(r.date)}</span>
          </h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {r.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
