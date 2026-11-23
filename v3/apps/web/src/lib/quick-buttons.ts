// Schnell-Buttons der Startseite (RDM-028 P2): je Vorlage aus `quickTemplateIds` ein Knopf, sonst der Tagebuch-Knopf.
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

/** Reihenfolge: Tagebücher wie übergeben, darin die Vorlagen in Vorlagen-Reihenfolge. Ohne Auswahl der bisherige Knopf. */
export function quickButtons(writable: readonly QuickDiary[], templates: readonly QuickTemplate[]): QuickButton[] {
  const many = writable.length > 1;
  const out: QuickButton[] = [];
  for (const d of writable) {
    const chosen = new Set(d.settings.quickTemplateIds ?? []);
    const own = templates.filter((t) => chosen.has(t.id) && t.diaryId === d.id && !t.archived && t.purpose !== 'training');
    if (own.length === 0) {
      out.push(many ? { to: `/quick?diary=${d.id}`, label: de.start.quickEntryFor(d.name) } : { to: '/quick', label: de.start.quickEntry });
      continue;
    }
    for (const t of own) {
      out.push({ to: `/quick?template=${t.id}${many ? `&diary=${d.id}` : ''}`, label: many ? de.start.quickTemplateIn(t.name, d.name) : de.start.quickTemplate(t.name) });
    }
  }
  return out.length > 0 ? out : [{ to: '/quick', label: de.start.quickEntry }];
}
