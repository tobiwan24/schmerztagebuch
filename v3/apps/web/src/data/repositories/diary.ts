// Fachliche Repositories für Vorlagen, Vorlagenversionen und Einträge auf Basis des Record-Repositorys.
// Validierung mit den zod-Schemas aus @stb/core; Komponenten greifen nur hierüber auf Daten zu (Spec 01).
import {
  bodymapImageSchema,
  compareByOrder,
  diarySchema,
  entrySchemaFor,
  resolveEntryView,
  templateSchema,
  templateVersionSchema,
  type BodymapImage,
  type Diary,
  type Entry,
  type EntryField,
  type Template,
  type TemplateState,
  type TemplateVersion,
} from '@stb/core';
import { savedFilterSchema, type SavedFilter } from '@stb/analysis';
import { dashboardSchema, notificationRuleSchema, type Dashboard, type NotificationRule } from '@stb/core';
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
  /** Speichert ein geändertes Tagebuch (Einstellungen, DM-14); neue Tagebücher legt `createDiary` an. */
  saveDiary(diary: Diary): Promise<void>;
  listDiaries(): Promise<Diary[]>;
  /** Eigene Body-Map-Bilder eines Tagebuchs (A-024), älteste zuerst. */
  listBodymapImages(diaryId: string): Promise<BodymapImage[]>;
  /** Alle Vorlagenversionen (Analyse: Werte über die Eintragsversion, Spec 06). */
  listAllTemplateVersions(): Promise<TemplateVersion[]>;
  listSavedFilters(diaryId: string): Promise<SavedFilter[]>;
  saveSavedFilter(filter: SavedFilter): Promise<void>;
  deleteSavedFilter(filterId: string, stamp: { hlc: string; updatedAt: string }): Promise<void>;
  /** Hinweis-Regeln eines Tagebuchs (M20, `notificationRule`). */
  listNotificationRules(diaryId: string): Promise<NotificationRule[]>;
  saveNotificationRule(rule: NotificationRule): Promise<void>;
  deleteNotificationRule(ruleId: string, stamp: { hlc: string; updatedAt: string }): Promise<void>;
  /** Eigene Dashboards eines Tagebuchs (M21, `dashboard`), nach `order`. */
  listDashboards(diaryId: string): Promise<Dashboard[]>;
  saveDashboard(dashboard: Dashboard): Promise<void>;
  deleteDashboard(dashboardId: string, stamp: { hlc: string; updatedAt: string }): Promise<void>;
  saveBodymapImage(image: BodymapImage): Promise<void>;
  deleteBodymapImage(imageId: string): Promise<void>;
  /** Speichert Vorlage und aktuelle Version gemeinsam (eine Transaktion). */
  saveTemplate(state: TemplateState): Promise<void>;
  /** Nur Metadaten (Name, Reihenfolge, Archiv) — Blöcke unverändert, keine neue Version (Spec 02). */
  saveTemplateMeta(template: Template): Promise<void>;
  /** Anzahl der Einträge einer Vorlage (vor dem endgültigen Löschen anzeigen, BLK-15). */
  countTemplateEntries(templateId: string): Promise<number>;
  /** Endgültig löschen: Einträge (Tombstones mit neuem HLC), alle Versionen, Vorlage. */
  deleteTemplate(templateId: string, stamp: { hlc: string; updatedAt: string }): Promise<void>;
  getTemplate(templateId: string): Promise<TemplateState | undefined>;
  getTemplateVersion(templateId: string, version: number): Promise<TemplateVersion | undefined>;
  listTemplates(diaryId: string): Promise<Template[]>;
  /** Vorlagen aller Tagebücher (Ansicht „Alle“), nach `order`. */
  listAllTemplates(): Promise<Template[]>;
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

    async saveDiary(diary) {
      const d = diarySchema.parse(diary);
      if (!(await repo.getDiary(d.id))) throw new RangeError(`Tagebuch ${d.id} existiert nicht`);
      await records.put({ id: d.id, diaryId: d.id, kind: 'diary', payload: d });
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

    async saveTemplateMeta(template) {
      const t = templateSchema.parse(template);
      const stored = await repo.getTemplate(t.id);
      if (!stored) throw new RangeError(`Vorlage ${t.id} existiert nicht`);
      if (stored.template.currentVersion !== t.currentVersion || stored.template.diaryId !== t.diaryId) {
        throw new RangeError('Nur Metadaten änderbar: Version und Tagebuch müssen gleich bleiben');
      }
      await records.put({ id: t.id, diaryId: t.diaryId, kind: 'template', payload: t });
    },

    async countTemplateEntries(templateId) {
      return (await records.listKind('entry')).filter((r) => (r.payload as Entry).templateId === templateId).length;
    },

    async deleteTemplate(templateId, stamp) {
      const rec = await records.get(templateId);
      if (!rec || rec.deleted || rec.kind !== 'template') return;
      for (const e of await records.listKind('entry')) {
        if ((e.payload as Entry).templateId === templateId) await repo.deleteEntry(e.id, stamp);
      }
      for (const v of await records.list(rec.diaryId, 'templateVersion')) {
        if ((v.payload as TemplateVersion).templateId === templateId) await records.remove(v.id);
      }
      await records.remove(templateId);
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

    async listAllTemplateVersions() {
      return (await records.listKind('templateVersion')).map((rec) => templateVersionSchema.parse(rec.payload));
    },

    async listSavedFilters(diaryId) {
      const all = (await records.list(diaryId, 'savedFilter')).map((rec) => savedFilterSchema.parse(rec.payload));
      return all.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    },

    async saveSavedFilter(filter) {
      const f = savedFilterSchema.parse(filter);
      await records.put({ id: f.id, diaryId: f.diaryId, kind: 'savedFilter', payload: f });
    },

    async deleteSavedFilter(filterId, stamp) {
      const rec = await records.get(filterId);
      if (!rec || rec.deleted || rec.kind !== 'savedFilter') return;
      await records.remove(filterId, { ...(rec.payload as SavedFilter), hlc: stamp.hlc, updatedAt: stamp.updatedAt });
    },

    async listNotificationRules(diaryId) {
      return (await records.list(diaryId, 'notificationRule')).map((rec) => notificationRuleSchema.parse(rec.payload)).sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1));
    },

    async saveNotificationRule(rule) {
      const r = notificationRuleSchema.parse(rule);
      await records.put({ id: r.id, diaryId: r.diaryId, kind: 'notificationRule', payload: r });
    },

    async deleteNotificationRule(ruleId, stamp) {
      const rec = await records.get(ruleId);
      if (!rec || rec.deleted || rec.kind !== 'notificationRule') return;
      await records.remove(ruleId, { ...(rec.payload as NotificationRule), hlc: stamp.hlc, updatedAt: stamp.updatedAt });
    },

    async listDashboards(diaryId) {
      return (await records.list(diaryId, 'dashboard')).map((rec) => dashboardSchema.parse(rec.payload)).sort(compareByOrder);
    },

    async saveDashboard(dashboard) {
      const d = dashboardSchema.parse(dashboard);
      await records.put({ id: d.id, diaryId: d.diaryId, kind: 'dashboard', payload: d });
    },

    async deleteDashboard(dashboardId, stamp) {
      const rec = await records.get(dashboardId);
      if (!rec || rec.deleted || rec.kind !== 'dashboard') return;
      await records.remove(dashboardId, { ...(rec.payload as Dashboard), hlc: stamp.hlc, updatedAt: stamp.updatedAt });
    },

    async listBodymapImages(diaryId) {
      const all = (await records.list(diaryId, 'bodymapImage')).map((rec) => bodymapImageSchema.parse(rec.payload));
      return all.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    },

    async saveBodymapImage(image) {
      const img = bodymapImageSchema.parse(image);
      await records.put({ id: img.id, diaryId: img.diaryId, kind: 'bodymapImage', payload: img });
    },

    async deleteBodymapImage(imageId) {
      const rec = await records.get(imageId);
      if (rec && !rec.deleted && rec.kind === 'bodymapImage') await records.remove(imageId);
    },

    async listAllTemplates() {
      return (await records.listKind('template')).map((r) => templateSchema.parse(r.payload)).sort(compareByOrder);
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
