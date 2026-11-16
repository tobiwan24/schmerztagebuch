// Verlauf (Spec 06/10, ANA-20): Sortierung, seitenweises Laden und Gruppierung. Rein, ohne React.
import { sortEntries, type SortOrder } from '@stb/analysis';
import type { Entry } from '@stb/core';
import { entryDay } from './entry-format';

export const PAGE_SIZE = 50;

export type ListEntry = Entry & { templateName: string };
export interface ListGroup {
  key: string;
  /** Tag (`YYYY-MM-DD`) bei Sortierung nach Zeit, Vorlagenname bei Sortierung nach Vorlage. */
  by: { day: string } | { template: string };
  entries: ListEntry[];
}

/**
 * Sortiert, schneidet die ersten `limit` Einträge ab und gruppiert aufeinanderfolgende Einträge (Tag bzw. Vorlage).
 * Weil erst geschnitten und dann gruppiert wird, bleibt die Gruppe an der Seitengrenze nach „Weitere laden“ eine einzige.
 */
export function pageGroups(entries: readonly ListEntry[], order: SortOrder, limit: number): { groups: ListGroup[]; total: number } {
  const sorted = sortEntries(entries, order);
  const byTemplate = order === 'template_az' || order === 'template_date';
  const groups: ListGroup[] = [];
  for (const e of sorted.slice(0, limit)) {
    const by = byTemplate ? { template: e.templateName } : { day: entryDay(e) };
    const key = 'template' in by ? `t:${by.template}` : `d:${by.day}`;
    const last = groups[groups.length - 1];
    if (last?.key === key) last.entries.push(e);
    else groups.push({ key, by, entries: [e] });
  }
  return { groups, total: sorted.length };
}
