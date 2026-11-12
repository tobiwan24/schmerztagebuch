// Schnelleintrag (Spec 05): Vorlage + Blöcke pro Tagebuch einstellbar. Standard: erste aktive Vorlage, darin alle
// `outcome`-Blöcke, sonst der erste Slider.
import { compareByOrder } from './fractional-index.js';
import type { Diary } from './diary.js';
import type { BlockDef, TemplateState } from './templates.js';

export interface QuickEntrySelection {
  state: TemplateState;
  blocks: BlockDef[];
}

export function quickEntrySelection(diary: Diary, templates: readonly TemplateState[]): QuickEntrySelection | null {
  const active = templates.filter((t) => !t.template.archived && t.template.diaryId === diary.id);
  const configured = active.find((t) => t.template.id === diary.settings.quickEntryTemplateId);
  const state = configured ?? [...active].sort((a, b) => compareByOrder(a.template, b.template))[0];
  if (!state) return null;
  const sorted = [...state.version.blocks].sort(compareByOrder);

  const ids = configured ? diary.settings.quickEntryBlockIds : undefined;
  if (ids?.length) {
    const chosen = sorted.filter((b) => ids.includes(b.id));
    if (chosen.length) return { state, blocks: chosen };
  }
  const outcome = sorted.filter((b) => b.role === 'outcome');
  if (outcome.length) return { state, blocks: outcome };
  const slider = sorted.find((b) => b.type === 'slider');
  return { state, blocks: slider ? [slider] : [] };
}
