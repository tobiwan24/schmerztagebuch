// v2-Schnappschuss + Schlüssel → Eingabe der Transformation (`V2Source`). Jeder Eintrag einzeln: nicht
// entschlüsselbare landen mit Grund im Bericht und blockieren die übrigen nicht (MIG-13).
import type { V2DecodedEntry, V2Source } from '@stb/core';
import { decryptV2Entry, type V2DecryptKeys } from './crypto';
import type { V2EntryRow, V2Snapshot } from './source';

export async function decodeV2Entries(rows: readonly V2EntryRow[], keys: V2DecryptKeys): Promise<V2DecodedEntry[]> {
  const out: V2DecodedEntry[] = [];
  for (const e of rows) {
    const base = {
      id: e.id,
      templateId: e.templateId,
      timestamp: e.timestamp,
      ...(e.syncId ? { syncId: e.syncId } : {}),
      ...(e.updatedAt ? { updatedAt: e.updatedAt } : {}),
      ...(e.editedAt ? { editedAt: e.editedAt } : {}),
      ...(e.deleted ? { deleted: true } : {}),
    };
    if (e.deleted) {
      out.push({ ...base, blocks: null }); // wird ohnehin nicht übernommen — nicht entschlüsseln
      continue;
    }
    const r = await decryptV2Entry(e, keys);
    out.push('blocks' in r ? { ...base, blocks: r.blocks } : { ...base, blocks: null, decryptError: r.error });
  }
  return out;
}

export async function decodeV2Snapshot(snap: V2Snapshot, keys: V2DecryptKeys): Promise<V2Source> {
  return { templates: snap.templates, entries: await decodeV2Entries(snap.entries, keys) };
}
