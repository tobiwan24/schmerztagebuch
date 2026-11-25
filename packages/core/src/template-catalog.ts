// Persönlicher Vorlagenkatalog (RDM-034, FEAT-022): Vorlagen im versteckten Bibliothek-Tagebuch (`Diary.purpose =
// 'library'`). Kopien in den Vorlagenkatalog und aus ihm heraus bekommen immer neue IDs; nur die Kopie im
// Vorlagenkatalog trägt `catalogSource`. Pure Funktionen; IDs und Uhr kommen von außen.
import type { Clock } from './env.js';
import type { IdGenerator } from './ids.js';
import type { Diary } from './diary.js';
import { copyBlocks, type CopyBlocksOptions } from './template-editor.js';
import { createTemplate, updateTemplate, type Template, type TemplateState, type TemplateVersion } from './templates.js';

export interface TemplateCopy {
  state: TemplateState;
  /** alte → neue Übungsmedien-ID; die aufrufende Schicht kopiert die Medien (Records + Inhalt) mit. */
  mediaIds: Map<string, string>;
}

export interface CopyTarget {
  diaryId: string;
  order: string;
  ids: IdGenerator;
}

const sourceOf = (s: TemplateState) => ({ diaryId: s.template.diaryId, templateId: s.template.id, version: s.version.version });

function copyInto(source: TemplateState, target: CopyTarget, clock: Clock, opts: CopyBlocksOptions, withSource: boolean): TemplateCopy {
  const t = source.template;
  const { blocks, idMap, mediaIds } = copyBlocks(source.version.blocks, target.ids, opts);
  const quick = t.quickBlockIds?.flatMap((q) => idMap.get(q) ?? []);
  const state = createTemplate(
    {
      id: target.ids.newId(),
      diaryId: target.diaryId,
      name: t.name,
      ...(t.icon !== undefined ? { icon: t.icon } : {}),
      ...(t.color !== undefined ? { color: t.color } : {}),
      order: target.order,
      ...(quick?.length ? { quickBlockIds: quick } : {}),
      ...(t.purpose !== undefined ? { purpose: t.purpose } : {}),
      ...(t.functionPhases !== undefined ? { functionPhases: t.functionPhases } : {}),
      ...(withSource ? { catalogSource: sourceOf(source) } : {}),
      blocks,
    },
    clock,
  );
  return { state, mediaIds };
}

/** Kopie einer Vorlage in den Vorlagenkatalog (`target.diaryId` = Bibliothek), mit `catalogSource` (BLK-61). */
export function catalogCopyOf(source: TemplateState, target: CopyTarget, clock: Clock, opts: CopyBlocksOptions = {}): TemplateCopy {
  return copyInto(source, target, clock, opts, true);
}

/** Neue, unabhängige Vorlage aus einem Vorlagenkatalog-Eintrag im Ziel-Tagebuch, ohne `catalogSource` (BLK-61). */
export function instantiateFromCatalog(source: TemplateState, target: CopyTarget, clock: Clock, opts: CopyBlocksOptions = {}): TemplateCopy {
  return copyInto(source, target, clock, opts, false);
}

/**
 * „Im Vorlagenkatalog aktualisieren“: Blöcke der Quelle (neue IDs) als neue Version des bestehenden Eintrags,
 * Name/Symbol/Farbe übernommen, `catalogSource` auf den aktuellen Stand der Quelle.
 */
export function refreshCatalogCopy(
  existing: TemplateState,
  source: TemplateState,
  ids: IdGenerator,
  clock: Clock,
  history: readonly TemplateVersion[] = [],
  opts: CopyBlocksOptions = {},
): TemplateCopy {
  const t = source.template;
  const { blocks, idMap, mediaIds } = copyBlocks(source.version.blocks, ids, opts);
  const quick = t.quickBlockIds?.flatMap((q) => idMap.get(q) ?? []);
  const { state } = updateTemplate(
    existing,
    {
      name: t.name,
      ...(t.icon !== undefined ? { icon: t.icon } : {}),
      ...(t.color !== undefined ? { color: t.color } : {}),
      quickBlockIds: quick?.length ? quick : null,
      purpose: t.purpose ?? null,
      functionPhases: t.functionPhases ?? null,
      catalogSource: sourceOf(source),
      blocks,
    },
    clock,
    history,
  );
  return { state, mediaIds };
}

/** Bibliothek für neue Vorlagenkatalog-Einträge: die älteste (`createdAt`, dann ID), falls zwei Geräte offline je eine anlegten (DM-20). */
export function pickLibrary<D extends Pick<Diary, 'id' | 'createdAt' | 'purpose'>>(diaries: readonly D[]): D | undefined {
  return diaries
    .filter((d) => d.purpose === 'library')
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

/** Vorlagenkatalog-Eintrag, der aus der Vorlage `templateId` stammt (für „Im Vorlagenkatalog aktualisieren“). */
export const catalogEntryFrom = (catalog: readonly Template[], templateId: string): Template | undefined =>
  catalog.find((c) => c.catalogSource?.templateId === templateId);
