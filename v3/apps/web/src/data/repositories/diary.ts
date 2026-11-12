// Fachliche Repositories für Vorlagen, Vorlagenversionen und Einträge auf Basis des Record-Repositorys.
// Validierung mit den zod-Schemas aus @stb/core; Komponenten greifen nur hierüber auf Daten zu (Spec 01).
import {
  diarySchema,
  entrySchemaFor,
  resolveEntryView,
  templateSchema,
  templateVersionSchema,
  type Diary,
  type Entry,
  type EntryField,
  type Template,
  type TemplateState,
  type TemplateVersion,
} from '@stb/core';
import type { RecordInput, RecordRepository } from './records.js';

/**
 * Record-ID einer Vorlagenversion: deterministisch aus Vorlage und Versionsnummer. So kollidieren gleiche Versionen
 * zweier Geräte über dieselbe ID (Spec 04: „gleiche ID mit anderem Inhalt ist ein Fehler").
 */
export const templateVersionRecordId = (templateId: string, version: number): string => `${templateId}.v${version}`;

export interface EntryView {
  entry: Entry;
  fields: EntryField[];
}

export interface DiaryRepository {
  /** Legt ein Tagebuch an, optional mit erster Vorlage (eine Transaktion; Onboarding). */
  createDiary(diary: Diary, firstTemplate?: TemplateState): Promise<void>;
  getDiary(diaryId: string): Promise<Diary | undefined>;
  listDiaries(): Promise<Diary[]>;
  /** Speichert Vorlage und aktuelle Version gemeinsam (eine Transaktion). */
  saveTemplate(state: TemplateState): Promise<void>;
  getTemplate(templateId: string): Promise<TemplateState | undefined>;
  getTemplateVersion(templateId: string, version: number): Promise<TemplateVersion | undefined>;
  listTemplates(diaryId: string): Promise<Template[]>;
  /** Validiert gegen die referenzierte Vorlagenversion (DM-03) und speichert. */
  saveEntry(entry: Entry): Promise<void>;
  getEntry(entryId: string): Promise<Entry | undefined>;
  /** Löscht einen Eintrag (Tombstone) mit neuem HLC, damit eine spätere Löschung gegen ältere Bearbeitungen gewinnt. */
  deleteEntry(entryId: string, stamp: { hlc: string; updatedAt: string }): Promise<void>;
  listEntries(diaryId: string): Promise<Entry[]>;
  /** Einträge aller Tagebücher, neueste zuerst. */
  listAllEntries(): Promise<Entry[]>;
  /** Eintrag mit Feldern der aktuellen Vorlagenversion inkl. archivierter Felder (DM-08). */
  getEntryView(entryId: string): Promise<EntryView | undefined>;
}

export function createDiaryRepository(records: RecordRepository): DiaryRepository {
  const repo: DiaryRepository = {
    async createDiary(diary, firstTemplate) {
      const d = diarySchema.parse(diary);
      const inputs: RecordInput[] = [{ id: d.id, diaryId: d.id, kind: 'diary', payload: d }];
      if (firstTemplate) {
        const t = templateSchema.parse(firstTemplate.template);
        const v = templateVersionSchema.parse(firstTemplate.version);
        if (t.diaryId !== d.id || v.templateId !== t.id || v.version !== t.currentVersion) throw new RangeError('Vorlage passt nicht zum Tagebuch');
        inputs.push(
          { id: t.id, diaryId: d.id, kind: 'template', payload: t },
          { id: templateVersionRecordId(t.id, v.version), diaryId: d.id, kind: 'templateVersion', payload: v },
        );
      }
      await records.putMany(inputs);
    },

    async getDiary(diaryId) {
      const rec = await records.get(diaryId);
      return rec && !rec.deleted && rec.kind === 'diary' ? diarySchema.parse(rec.payload) : undefined;
    },

    async listDiaries() {
      const all = (await records.listKind('diary')).map((r) => diarySchema.parse(r.payload));
      return all.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    },

    async saveTemplate({ template, version }) {
      const t = templateSchema.parse(template);
      const v = templateVersionSchema.parse(version);
      if (v.templateId !== t.id || v.version !== t.currentVersion) throw new RangeError('Version passt nicht zur Vorlage');
      await records.putMany([
        { id: t.id, diaryId: t.diaryId, kind: 'template', payload: t },
        { id: templateVersionRecordId(t.id, v.version), diaryId: t.diaryId, kind: 'templateVersion', payload: v },
      ]);
    },

    async getTemplate(templateId) {
      const rec = await records.get(templateId);
      if (!rec || rec.deleted || rec.kind !== 'template') return undefined;
      const template = templateSchema.parse(rec.payload);
      const version = await repo.getTemplateVersion(templateId, template.currentVersion);
      if (!version) throw new Error(`Vorlage ${templateId}: Version ${template.currentVersion} fehlt`);
      return { template, version };
    },

    async getTemplateVersion(templateId, version) {
      const rec = await records.get(templateVersionRecordId(templateId, version));
      return rec && !rec.deleted ? templateVersionSchema.parse(rec.payload) : undefined;
    },

    async listTemplates(diaryId) {
      return (await records.list(diaryId, 'template')).map((r) => templateSchema.parse(r.payload));
    },

    async saveEntry(entry) {
      const version = await repo.getTemplateVersion(entry.templateId, entry.templateVersion);
      if (!version) throw new RangeError(`Vorlagenversion ${entry.templateId} v${entry.templateVersion} existiert nicht`);
      const parsed = entrySchemaFor(version).parse(entry);
      await records.put({ id: parsed.id, diaryId: parsed.diaryId, kind: 'entry', payload: parsed, occurredAt: parsed.occurredAt });
    },

    async getEntry(entryId) {
      const rec = await records.get(entryId);
      return rec && !rec.deleted && rec.kind === 'entry' ? (rec.payload as Entry) : undefined;
    },

    async deleteEntry(entryId, stamp) {
      const entry = await repo.getEntry(entryId);
      if (!entry) return;
      await records.remove(entryId, { ...entry, hlc: stamp.hlc, updatedAt: stamp.updatedAt });
    },

    async listAllEntries() {
      const all = (await records.listKind('entry')).map((r) => r.payload as Entry);
      return all.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));
    },

    async listEntries(diaryId) {
      return (await records.list(diaryId, 'entry')).map((r) => r.payload as Entry);
    },

    async getEntryView(entryId) {
      const entry = await repo.getEntry(entryId);
      if (!entry) return undefined;
      const [entryVersion, current] = await Promise.all([
        repo.getTemplateVersion(entry.templateId, entry.templateVersion),
        repo.getTemplate(entry.templateId),
      ]);
      if (!entryVersion || !current) throw new Error(`Eintrag ${entryId}: Vorlage oder Version fehlt`);
      return { entry, fields: resolveEntryView(entry, entryVersion, current.version) };
    },
  };
  return repo;
}
