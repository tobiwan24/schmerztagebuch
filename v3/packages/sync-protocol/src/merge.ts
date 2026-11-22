// Konfliktauflösung für Einträge (Spec 04 „Konfliktauflösung", Kind `entry`), 3-Wege-Merge gegen `base`:
// - Werte pro Block-ID: nur auf einer Seite geändert → übernehmen; auf beiden verschieden → höherer HLC gewinnt,
//   der unterlegene Wert geht in den ConflictLog.
// - Tags: Vereinigung.
// - `deleted` gewinnt nur, wenn sein HLC höher ist.
// - Übrige fachliche Felder (Zeitangabe, Meta, Vorlagenversion) folgen derselben Regel wie Blockwerte.
import { compareHlc, deepEqual, maxHlc, type Entry } from '@stb/core';

export interface EntrySide {
  entry: Entry;
  deleted: boolean;
}

export interface MergeConflict {
  /** `values.<blockId>`, `deleted` oder ein Feldname des Eintrags. */
  field: string;
  losingValue: unknown;
  losingHlc: string;
  winningHlc: string;
}

export interface EntryMergeResult {
  result: EntrySide;
  conflicts: MergeConflict[];
}

const MERGED_FIELDS = ['templateId', 'templateVersion', 'occurredAt', 'period', 'meta', 'authorId'] as const;

export function mergeEntry(base: EntrySide | undefined, local: EntrySide, remote: EntrySide): EntryMergeResult {
  const localWins = compareHlc(local.entry.hlc, remote.entry.hlc) >= 0;
  const [winner, loser] = localWins ? [local, remote] : [remote, local];
  const conflicts: MergeConflict[] = [];

  /** 3-Wege-Entscheidung für einen Wert. */
  function pick<T>(field: string, b: T | undefined, l: T | undefined, r: T | undefined): T | undefined {
    const lChanged = !deepEqual(l, b);
    const rChanged = !deepEqual(r, b);
    if (!lChanged) return r;
    if (!rChanged || deepEqual(l, r)) return l;
    const [w, lo] = localWins ? [l, r] : [r, l];
    conflicts.push({ field, losingValue: lo, losingHlc: loser.entry.hlc, winningHlc: winner.entry.hlc });
    return w;
  }

  const b = base?.entry;
  const values: Record<string, unknown> = {};
  const blockIds = new Set([...Object.keys(b?.values ?? {}), ...Object.keys(local.entry.values), ...Object.keys(remote.entry.values)]);
  for (const id of [...blockIds].sort()) {
    const v = pick(`values.${id}`, b?.values[id], local.entry.values[id], remote.entry.values[id]);
    if (v !== undefined) values[id] = v;
  }

  const merged: Entry = { ...winner.entry, values, tags: [...new Set([...local.entry.tags, ...remote.entry.tags])].sort() };
  const target = merged as unknown as Record<string, unknown>;
  for (const f of MERGED_FIELDS) {
    const v = pick(f, b?.[f], local.entry[f], remote.entry[f]);
    if (v === undefined) delete target[f];
    else target[f] = v;
  }
  merged.hlc = maxHlc(local.entry.hlc, remote.entry.hlc);
  merged.updatedAt = local.entry.updatedAt > remote.entry.updatedAt ? local.entry.updatedAt : remote.entry.updatedAt;

  let deleted = local.deleted && remote.deleted;
  if (local.deleted !== remote.deleted) {
    deleted = winner.deleted;
    conflicts.push({ field: 'deleted', losingValue: loser.deleted, losingHlc: loser.entry.hlc, winningHlc: winner.entry.hlc });
  }
  return { result: { entry: merged, deleted }, conflicts };
}
