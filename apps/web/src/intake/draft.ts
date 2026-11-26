// Zwischenablage-Weg (Spec 08 „Einrichtungshilfe", VOI-09): dasselbe JSON wie beim Intake, aber lokal eingefügt.
// Ergibt einen **Entwurf** (Vorlage, abgebildete Werte, Probleme) — gespeichert wird erst nach Bestätigung.
import { mapIntakeToValues, type Entry, type IntakeInput, type IntakeMapping, type TemplateState } from '@stb/core';
import { intakeBodySchema } from '@stb/sync-protocol';
import type { DiaryRepository } from '../data/repositories/diary.js';

export interface ShortcutDraft {
  body: IntakeInput;
  state: TemplateState | null;
  mapping: IntakeMapping | null;
  problems: string[];
}

export async function draftFromText(text: string, diary: DiaryRepository, defaultTemplateId: string | undefined): Promise<ShortcutDraft> {
  let raw: unknown;
  try {
    raw = JSON.parse(text.trim());
  } catch {
    return { body: { text: text.trim() }, state: null, mapping: null, problems: ['Kein JSON — der Text wurde als Notiz übernommen'] };
  }
  const parsed = intakeBodySchema.safeParse(raw);
  if (!parsed.success) return { body: raw as IntakeInput, state: null, mapping: null, problems: ['Unbekanntes Format'] };
  const body = parsed.data;
  const templateId = body.templateId ?? defaultTemplateId;
  const state = templateId ? ((await diary.getTemplate(templateId)) ?? null) : null;
  if (!state) return { body, state: null, mapping: null, problems: [templateId ? `Vorlage ${templateId} nicht gefunden` : 'Keine Vorlage für Kurzbefehle festgelegt'] };
  const mapping = mapIntakeToValues(body, state.version);
  const problems = mapping.errors.map((e) => `${e.key}: ${e.message}`);
  if (mapping.note) problems.push(`Text ohne Notizfeld in der Vorlage: ${mapping.note}`);
  return { body, state, mapping, problems };
}

/** Bestätigter Entwurf → Eintrag (`meta.source = 'shortcut'`). */
export function entryFromDraft(d: ShortcutDraft, ctx: { id: string; diaryId: string; authorId: string; timezone: string; now: number; hlc: string }): Entry {
  if (!d.state || !d.mapping) throw new Error('Entwurf ohne Vorlage');
  const now = new Date(ctx.now).toISOString();
  return {
    id: ctx.id, diaryId: ctx.diaryId, templateId: d.state.template.id, templateVersion: d.state.version.version,
    occurredAt: d.body.occurredAt ?? now, recordedAt: now, updatedAt: now, authorId: ctx.authorId,
    values: d.mapping.values, tags: d.mapping.tags,
    meta: { source: 'shortcut', timezone: ctx.timezone, ...(d.mapping.dictation ? { dictation: d.mapping.dictation } : {}) }, hlc: ctx.hlc,
  };
}
