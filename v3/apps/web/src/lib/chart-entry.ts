// „Diagramm als Eintrag speichern“ (ANA-21, Port v2 `saveChartAsEntry`): PNG der aktuellen Ansicht wird Bild-Anhang eines
// neuen Eintrags; der Text des Textarea-Blocks ist die Beschriftung. Eine Vorlage passt, wenn sie einen Textarea-Block mit
// erlaubten Anhängen hat und sonst keine Pflichtfelder (A-064).
import { attachmentMetaSchema, type Entry, type TemplateState, type TextareaValue } from '@stb/core';
import type { DataApi } from '@/data/DataContext';

/** ID des Textarea-Blocks, der das Bild aufnimmt — oder `null`, wenn die Vorlage nicht passt. */
export function chartBlockId(state: TemplateState): string | null {
  const { blocks } = state.version;
  const target = blocks.find((b) => b.type === 'textarea' && b.config.allowAttachments);
  if (!target || state.template.archived) return null;
  return blocks.some((b) => b.required && b.id !== target.id) ? null : target.id;
}

export interface ChartTarget {
  state: TemplateState;
  blockId: string;
}

/** Passende Vorlagen der angegebenen Tagebücher (Reihenfolge wie in der Vorlagenliste). */
export async function listChartTargets(diary: DataApi['diary'], diaryIds: readonly string[]): Promise<ChartTarget[]> {
  const out: ChartTarget[] = [];
  for (const id of diaryIds) {
    for (const t of await diary.listTemplates(id)) {
      const state = await diary.getTemplate(t.id);
      const blockId = state ? chartBlockId(state) : null;
      if (state && blockId) out.push({ state, blockId });
    }
  }
  return out;
}

export async function saveChartAsEntry(data: DataApi, target: ChartTarget, png: Blob, caption: string): Promise<string> {
  const { template, version } = target.state;
  const bytes = new Uint8Array(await png.arrayBuffer());
  const s = await data.stamper.stamp();
  const entryId = data.newId();
  const attachmentId = data.newId();
  const name = (caption.trim() || 'Diagramm').slice(0, 190);
  const meta = attachmentMetaSchema.parse({
    id: attachmentId, diaryId: template.diaryId, entryId, kind: 'image', mime: 'image/png', name: `${name}.png`, sizeBytes: bytes.length, createdAt: s.at,
  });
  await data.attachments.commit({ add: [{ meta, bytes }], removeIds: [] });
  const value: TextareaValue = { ...(caption.trim() ? { text: caption.trim() } : {}), attachmentIds: [attachmentId] };
  const entry: Entry = {
    id: entryId, diaryId: template.diaryId, templateId: template.id, templateVersion: version.version, occurredAt: s.at, recordedAt: s.at, updatedAt: s.at,
    authorId: s.authorId, values: { [target.blockId]: value }, tags: [],
    meta: { source: 'app', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }, hlc: s.hlc,
  };
  await data.diary.saveEntry(entry);
  return entryId;
}
