// „Als Kopie importieren" (Spec 07, EXP-04): neue IDs für Tagebücher, Vorlagen, Blöcke, Optionen, Einträge, gespeicherte
// Filter und eigene Body-Map-Bilder; alle Verweise werden konsistent umgeschrieben (Einträge → Vorlage/Blöcke/Optionen,
// Body-Map → eigenes Bild, Tagebuch-Einstellungen → Schnelleintrag, gespeicherte Filter → Tagebuch/Vorlage/Block/Option).
import type { BlockDef } from '@stb/core';
import type { Condition, FilterSpec } from '@stb/analysis';
import type { ExportDiary, ExportV1 } from './json-v1.js';

export function copyWithNewIds(doc: ExportV1, newId: () => string): ExportV1 {
  const map = new Map<string, string>();
  const fresh = (id: string) => {
    const n = newId();
    map.set(id, n);
    return n;
  };
  const m = (id: string) => map.get(id) ?? id;

  // 1. Alle IDs vergeben, die irgendwo referenziert werden
  for (const d of doc.diaries) {
    fresh(d.diary.id);
    for (const img of d.bodymapImages) fresh(img.id);
    for (const t of d.templates) {
      fresh(t.id);
      for (const v of t.versions) {
        for (const b of v.blocks) {
          if (!map.has(b.id)) fresh(b.id);
          if (b.type === 'multiselect') for (const o of b.config.options) if (!map.has(o.id)) fresh(o.id);
        }
      }
    }
    for (const e of d.entries) fresh(e.id);
    for (const f of d.savedFilters) fresh(f.id);
  }

  const block = (b: BlockDef): BlockDef => {
    if (b.type === 'multiselect') return { ...b, id: m(b.id), config: { ...b.config, options: b.config.options.map((o) => ({ ...o, id: m(o.id) })) } };
    if (b.type === 'bodymap') return { ...b, id: m(b.id), config: { ...b.config, defaultPresetId: m(b.config.defaultPresetId) } };
    return { ...b, id: m(b.id) };
  };
  const value = (raw: unknown): unknown => {
    if (Array.isArray(raw)) return raw.map((x) => (typeof x === 'string' ? m(x) : x)); // Multiselect: Options-IDs
    if (raw && typeof raw === 'object' && 'presetId' in raw) return { ...(raw as object), presetId: m((raw as { presetId: string }).presetId) };
    return raw;
  };
  const condition = (c: Condition): Condition => {
    const out = { ...c } as Condition & { blockId?: string; optionIds?: string[] };
    if ('blockId' in c && c.blockId) out.blockId = m(c.blockId);
    if ('optionIds' in c && c.optionIds) out.optionIds = c.optionIds.map(m);
    return out;
  };
  const filter = (f: FilterSpec): FilterSpec => ({
    ...f,
    diaryIds: f.diaryIds.map(m),
    ...(f.templateIds ? { templateIds: f.templateIds.map(m) } : {}),
    ...(f.conditions ? { conditions: f.conditions.map(condition) } : {}),
    ...(f.anyOf ? { anyOf: f.anyOf.map((g) => g.map(condition)) } : {}),
  });

  const diary = (d: ExportDiary): ExportDiary => ({
    diary: {
      ...d.diary,
      id: m(d.diary.id),
      settings: {
        ...d.diary.settings,
        ...(d.diary.settings.quickEntryTemplateId ? { quickEntryTemplateId: m(d.diary.settings.quickEntryTemplateId) } : {}),
        ...(d.diary.settings.quickEntryBlockIds ? { quickEntryBlockIds: d.diary.settings.quickEntryBlockIds.map(m) } : {}),
      },
    },
    templates: d.templates.map((t) => ({ ...t, id: m(t.id), diaryId: m(t.diaryId), versions: t.versions.map((v) => ({ ...v, blocks: v.blocks.map(block) })) })),
    entries: d.entries.map((e) => ({
      ...e, id: m(e.id), diaryId: m(e.diaryId), templateId: m(e.templateId),
      values: Object.fromEntries(Object.entries(e.values).map(([k, v]) => [m(k), value(v)])),
    })),
    savedFilters: d.savedFilters.map((f) => ({ ...f, id: m(f.id), diaryId: m(f.diaryId), filter: filter(f.filter) })),
    bodymapImages: d.bodymapImages.map((i) => ({ ...i, id: m(i.id), diaryId: m(i.diaryId) })),
  });

  return { ...doc, ...(doc.filter ? { filter: filter(doc.filter) } : {}), diaries: doc.diaries.map(diary) };
}
