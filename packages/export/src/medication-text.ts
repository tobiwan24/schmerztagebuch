// Textform des Medikamenten-Blocks für CSV und PDF (EXP-20): „Ibuprofen 400 mg 08:00; Paracetamol 500 mg“.
// Die Uhrzeit steht in der Zeitzone des Tagebuchs (Positionen speichern einen ISO-Zeitpunkt).
const formatters = new Map<string, Intl.DateTimeFormat>();

function clock(iso: string, timeZone: string): string {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('de-DE', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    formatters.set(timeZone, f);
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : f.format(d);
}

/** `raw` = Rohwert `{ items }` des Eintrags; liefert `undefined`, wenn er keine Positionen enthält. */
export function medicationText(raw: unknown, timeZone: string): string | undefined {
  const items = (raw as { items?: { name: string; dose?: number; unit?: string; at?: string }[] } | undefined)?.items;
  if (!Array.isArray(items) || items.length === 0) return undefined;
  return items
    .map((i) => [i.name, i.dose !== undefined ? String(i.dose) : '', i.unit ?? '', i.at ? clock(i.at, timeZone) : ''].filter(Boolean).join(' '))
    .join('; ');
}
