// Schnell-Buttons der Startseite (RDM-028 P2, RDM-034): je Vorlage aus `quickTemplateIds` des gewählten Tagebuchs ein Knopf, sonst „Schnell eintragen“.
import { isEntryTemplate } from '@/lib/entry-template';
import { de } from '@/i18n/de';

export interface QuickDiary {
  id: string;
  name: string;
  settings: { quickTemplateIds?: string[] };
}
export interface QuickTemplate {
  id: string;
  diaryId: string;
  name: string;
  archived?: boolean;
  purpose?: string;
}
export interface QuickButton {
  to: string;
  label: string;
}

/** Auswahl speichern: angezeigte Checkboxen bestimmen nur ihren eigenen Status, andere IDs (archiviert/unbekannt) bleiben unverändert. */
export function mergeQuickIds(shown: readonly { id: string }[], chosen: ReadonlySet<string>, stored: readonly string[] = []): string[] {
  const shownIds = new Set(shown.map((x) => x.id));
  return [...shown.filter((x) => chosen.has(x.id)).map((x) => x.id), ...stored.filter((i) => !shownIds.has(i))];
}

/**
 * Schnell-Buttons des gewählten Tagebuchs (RDM-034, R1): je gewählter Vorlage ein Knopf in Vorlagen-Reihenfolge
 * (`templates` sortiert übergeben), ohne Auswahl ein Knopf „Schnell eintragen“. Vorlagen anderer Tagebücher entfallen.
 */
export function quickButtons(diary: QuickDiary, templates: readonly QuickTemplate[]): QuickButton[] {
  const chosen = new Set(diary.settings.quickTemplateIds ?? []);
  const own = templates.filter((t) => chosen.has(t.id) && t.diaryId === diary.id && isEntryTemplate(t));
  if (own.length === 0) return [{ to: `/quick?diary=${diary.id}`, label: de.start.quickEntry }];
  return own.map((t) => ({ to: `/quick?diary=${diary.id}&template=${t.id}`, label: de.start.quickTemplate(t.name) }));
}
