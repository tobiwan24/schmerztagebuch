// Persönlicher Vorlagenkatalog (RDM-034, FEAT-022): Vorlagen im versteckten Bibliothek-Tagebuch. Alle Schreibvorgänge
// sind gewöhnliche Records der Bibliothek (Outbox → alle eigenen Geräte, Spec 04). Die Bibliothek entsteht erst beim
// ersten „Zum Vorlagenkatalog hinzufügen“ — mit Konto wie „Tagebuch anlegen“ zuerst der Schlüssel auf dem Server (UI-15).
import {
  catalogCopyOf,
  compareByOrder,
  createDiary,
  exerciseMediaIds,
  instantiateFromCatalog,
  keyBetween,
  pickLibrary,
  refreshCatalogCopy,
  type CopyBlocksOptions,
  type Diary,
  type TemplateCopy,
  type TemplateState,
  type TemplateVersion,
} from '@stb/core';
import { useMemo } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useData } from './DataContext';
import type { DiaryRepository } from './repositories/diary';
import type { AttachmentRepository } from './repositories/attachments';

export interface CatalogDeps {
  diary: DiaryRepository;
  attachments: AttachmentRepository;
  newId: () => string;
  now: () => number;
  /** Tagebuch-Schlüssel auf dem Server anlegen (Konto), local-only ohne Wirkung. */
  createRemoteDiary: (diaryId: string) => Promise<void>;
}

const LIBRARY_NAME = 'Vorlagenkatalog';

/** Älteste Bibliothek oder eine neue (DM-20). */
export async function getOrCreateLibrary(deps: CatalogDeps): Promise<Diary> {
  const existing = pickLibrary(await deps.diary.listLibraries());
  if (existing) return existing;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const lib = createDiary({ id: deps.newId(), name: LIBRARY_NAME, subject: 'other', timezone, purpose: 'library' }, { now: deps.now });
  await deps.createRemoteDiary(lib.id);
  await deps.diary.createDiary(lib);
  return lib;
}

/** Medien der Quelle, deren Inhalt lokal vorliegt; eigene Body-Map-Bilder des Quell-Tagebuchs. */
async function copyOptions(deps: CatalogDeps, source: TemplateState): Promise<CopyBlocksOptions> {
  const mediaIds = source.version.blocks.flatMap((b) => (b.type === 'exercise' ? exerciseMediaIds(b.config) : []));
  const copyable = new Set<string>();
  for (const id of mediaIds) if ((await deps.attachments.getExerciseMedia(id)) && (await deps.attachments.data(id))) copyable.add(id);
  const images = await deps.diary.listBodymapImages(source.template.diaryId);
  return { ownBodymapImageIds: new Set(images.map((i) => i.id)), copyableMediaIds: copyable };
}

/** Übungsmedien der Kopie als eigene Records im Ziel-Tagebuch (Inhalt wird wie bei Anhängen synchronisiert). */
async function copyMedia(deps: CatalogDeps, copy: TemplateCopy): Promise<void> {
  const { template } = copy.state;
  for (const [oldId, newId] of copy.mediaIds) {
    const meta = await deps.attachments.getExerciseMedia(oldId);
    const bytes = await deps.attachments.data(oldId);
    if (!meta || !bytes) continue;
    await deps.attachments.saveExerciseMedia([{ meta: { ...meta, id: newId, diaryId: template.diaryId, templateId: template.id }, bytes }]);
  }
}

async function save(deps: CatalogDeps, copy: TemplateCopy): Promise<TemplateState> {
  await copyMedia(deps, copy);
  await deps.diary.saveTemplate(copy.state);
  return copy.state;
}

/** „Zum Vorlagenkatalog hinzufügen“ als neuer Eintrag (am Ende des Vorlagenkatalogs). */
export async function addToCatalog(deps: CatalogDeps, sourceTemplateId: string): Promise<TemplateState> {
  const source = await deps.diary.getTemplate(sourceTemplateId);
  if (!source) throw new RangeError(`Vorlage ${sourceTemplateId} existiert nicht`);
  const lib = await getOrCreateLibrary(deps);
  const last = (await deps.diary.listCatalogTemplates()).map((t) => t.order).sort().at(-1) ?? null;
  const copy = catalogCopyOf(source, { diaryId: lib.id, order: keyBetween(last, null), ids: { newId: deps.newId } }, { now: deps.now }, await copyOptions(deps, source));
  return save(deps, copy);
}

/** „Im Vorlagenkatalog aktualisieren“: Blöcke der Quelle als neue Version des bestehenden Eintrags. */
export async function refreshInCatalog(deps: CatalogDeps, catalogTemplateId: string, sourceTemplateId: string): Promise<TemplateState> {
  const [existing, source] = await Promise.all([deps.diary.getTemplate(catalogTemplateId), deps.diary.getTemplate(sourceTemplateId)]);
  if (!existing || !source) throw new RangeError('Vorlage existiert nicht');
  const history: TemplateVersion[] = [];
  for (let v = 1; v < existing.template.currentVersion; v++) {
    const old = await deps.diary.getTemplateVersion(existing.template.id, v);
    if (old) history.push(old);
  }
  const copy = refreshCatalogCopy(existing, source, { newId: deps.newId }, { now: deps.now }, history, await copyOptions(deps, source));
  return save(deps, copy);
}

/** Neue, unabhängige Vorlage aus einem Vorlagenkatalog-Eintrag im Ziel-Tagebuch (am Ende der Vorlagenliste). */
export async function instantiateCatalogEntry(deps: CatalogDeps, catalogTemplateId: string, diaryId: string, order?: string): Promise<TemplateState> {
  const copy = await catalogEntryCopy(deps, catalogTemplateId, diaryId, order);
  return save(deps, copy);
}

/** Wie `instantiateCatalogEntry`, aber ohne zu speichern (z. B. erste Vorlage beim Tagebuch-Anlegen). */
export async function catalogEntryCopy(deps: CatalogDeps, catalogTemplateId: string, diaryId: string, order?: string): Promise<TemplateCopy> {
  const entry = await deps.diary.getTemplate(catalogTemplateId);
  if (!entry) throw new RangeError(`Vorlage ${catalogTemplateId} existiert nicht`);
  const last = order === undefined ? ((await deps.diary.listTemplates(diaryId)).sort(compareByOrder).at(-1)?.order ?? null) : null;
  return instantiateFromCatalog(entry, { diaryId, order: order ?? keyBetween(last, null), ids: { newId: deps.newId } }, { now: deps.now }, await copyOptions(deps, entry));
}

/** Übungsmedien einer noch nicht gespeicherten Kopie nachträglich speichern (nach `createDiary`). */
export const saveCopyMedia = copyMedia;

/** Abhängigkeiten aus Daten- und Auth-Kontext. */
export function useCatalogDeps(): CatalogDeps {
  const data = useData();
  const auth = useAuth();
  return useMemo(
    () => ({ diary: data.diary, attachments: data.attachments, newId: data.newId, now: data.now, createRemoteDiary: (id: string) => auth.cloud.createDiary(id) }),
    [data.diary, data.attachments, data.newId, data.now, auth.cloud],
  );
}
