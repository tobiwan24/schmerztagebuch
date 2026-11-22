// Schnelleintrag (Spec 05): Blöcke je Vorlage im Vorlagen-Editor festgelegt (`Template.quickBlockIds`, A-070). Standardregel
// ohne Auswahl: alle `outcome`-Blöcke, sonst der erste Slider. Auswahl zwischen allen aktiven Vorlagen des Tagebuchs.
import { compareByOrder } from './fractional-index.js';
import type { Diary } from './diary.js';
import type { BlockDef, TemplateState } from './templates.js';

export interface QuickEntrySelection {
  state: TemplateState;
  blocks: BlockDef[];
}

/** Schnelleintrag-Blöcke einer Vorlage in Vorlagen-Reihenfolge (Auswahl des Editors, sonst Standardregel). */
export function quickBlocksOf(state: TemplateState): BlockDef[] {
  const sorted = [...state.version.blocks].sort(compareByOrder);
  const ids = state.template.quickBlockIds;
  if (ids?.length) {
    const chosen = sorted.filter((b) => ids.includes(b.id));
    if (chosen.length) return chosen;
  }
  const outcome = sorted.filter((b) => b.role === 'outcome');
  if (outcome.length) return outcome;
  const slider = sorted.find((b) => b.type === 'slider');
  return slider ? [slider] : [];
}

/** Alle aktiven Vorlagen des Tagebuchs in Vorlagen-Reihenfolge, je mit ihren Schnelleintrag-Blöcken. */
export function quickEntryOptions(diary: Diary, templates: readonly TemplateState[]): QuickEntrySelection[] {
  return templates
    .filter((t) => !t.template.archived && t.template.diaryId === diary.id)
    .sort((a, b) => compareByOrder(a.template, b.template))
    .map((state) => ({ state, blocks: quickBlocksOf(state) }));
}

/** Vorausgewählte Vorlage: `preferredTemplateId` (zuletzt genutzt), sonst die erste mit Feldern, sonst die erste. */
export function quickEntrySelection(diary: Diary, templates: readonly TemplateState[], preferredTemplateId?: string): QuickEntrySelection | null {
  const options = quickEntryOptions(diary, templates);
  return options.find((o) => o.state.template.id === preferredTemplateId) ?? options[0] ?? null;
}

/**
 * Frühere Tagebuch-Einstellung (`quickEntryTemplateId`/`quickEntryBlockIds`) → Auswahl der Vorlage (A-070). Liefert die zu
 * speichernde Vorlagen-Auswahl (nur wenn die Vorlage noch keine hat) und ob die Tagebuch-Einstellung entfernt werden muss.
 */
export function legacyQuickEntryMigration(
  diary: Diary,
  templates: readonly TemplateState[],
): { quickBlockIds: { templateId: string; ids: string[] } | null; clearDiarySettings: boolean } | null {
  const { quickEntryTemplateId: templateId, quickEntryBlockIds: blockIds } = diary.settings;
  if (templateId === undefined && blockIds === undefined) return null;
  const state = templates.find((t) => t.template.id === templateId);
  const known = new Set(state?.version.blocks.map((b) => b.id));
  const ids = (blockIds ?? []).filter((id) => known.has(id));
  const order = new Map(state?.version.blocks.map((b) => [b.id, b.order]));
  ids.sort((a, b) => ((order.get(a) ?? '') < (order.get(b) ?? '') ? -1 : 1));
  const take = state && !state.template.quickBlockIds?.length && ids.length > 0;
  return { quickBlockIds: take ? { templateId: state.template.id, ids } : null, clearDiarySettings: true };
}
