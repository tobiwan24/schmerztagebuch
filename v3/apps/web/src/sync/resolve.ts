// Konfliktauflösung je Record-Art (Spec 04 „Konfliktauflösung"). Rein: keine DB, keine Krypto.
import { compareHlc, deepEqual, type Entry } from '@stb/core';
import { mergeEntry, type MergeConflict } from '@stb/sync-protocol';

export interface Side {
  payload: unknown;
  deleted: boolean;
}

export type Resolution =
  | { kind: 'resolved'; result: Side; conflicts: MergeConflict[]; adoptServer: boolean }
  /** Nicht automatisch auflösbar (z. B. gleiche Vorlagenversion mit anderem Inhalt) — Op bleibt mit Fehler stehen. */
  | { kind: 'unresolvable'; reason: string };

type Stamped = { hlc?: unknown; updatedAt?: unknown };

/** Ordnungsschlüssel für „neuer gewinnt": HLC, falls vorhanden, sonst `updatedAt` (DECISIONS A-016). */
function newer(a: Stamped, b: Stamped): boolean {
  if (typeof a.hlc === 'string' && typeof b.hlc === 'string') return compareHlc(a.hlc, b.hlc) >= 0;
  return String(a.updatedAt ?? '') >= String(b.updatedAt ?? '');
}

const stampOf = (s: Side): Stamped => (s.payload && typeof s.payload === 'object' ? (s.payload as Stamped) : {});

/** Ganzer Datensatz: neuerer Stand gewinnt, der andere geht in den ConflictLog. */
function wholeRecord(local: Side, server: Side): Resolution {
  if (deepEqual(local, server)) return { kind: 'resolved', result: server, conflicts: [], adoptServer: true };
  const localWins = newer(stampOf(local), stampOf(server));
  const [w, l] = localWins ? [local, server] : [server, local];
  const conflicts: MergeConflict[] = [{
    field: '*', losingValue: l, losingHlc: String(stampOf(l).hlc ?? stampOf(l).updatedAt ?? ''), winningHlc: String(stampOf(w).hlc ?? stampOf(w).updatedAt ?? ''),
  }];
  return { kind: 'resolved', result: w, conflicts, adoptServer: !localWins };
}

/** Vorlage: Felder einzeln (3-Wege), neuerer Stand gewinnt je Feld; `currentVersion` = Maximum. */
function template(base: Side | undefined, local: Side, server: Side): Resolution {
  const b = (base?.payload ?? {}) as Record<string, unknown>;
  const l = local.payload as Record<string, unknown>;
  const s = server.payload as Record<string, unknown>;
  const localWins = newer(l, s);
  const out: Record<string, unknown> = {};
  const conflicts: MergeConflict[] = [];
  for (const f of new Set([...Object.keys(l), ...Object.keys(s)])) {
    const lc = !deepEqual(l[f], b[f]);
    const sc = !deepEqual(s[f], b[f]);
    let v: unknown;
    if (!lc) v = s[f];
    else if (!sc || deepEqual(l[f], s[f])) v = l[f];
    else {
      v = localWins ? l[f] : s[f];
      if (f !== 'updatedAt' && f !== 'currentVersion') {
        conflicts.push({ field: f, losingValue: localWins ? s[f] : l[f], losingHlc: String(localWins ? s.updatedAt : l.updatedAt), winningHlc: String(localWins ? l.updatedAt : s.updatedAt) });
      }
    }
    if (v !== undefined) out[f] = v;
  }
  out.currentVersion = Math.max(Number(l.currentVersion ?? 0), Number(s.currentVersion ?? 0));
  const result: Side = { payload: out, deleted: local.deleted && server.deleted };
  return { kind: 'resolved', result, conflicts, adoptServer: deepEqual(result, server) };
}

export function resolveConflict(kind: string, base: Side | undefined, local: Side, server: Side): Resolution {
  switch (kind) {
    case 'entry': {
      const r = mergeEntry(
        base ? { entry: base.payload as Entry, deleted: base.deleted } : undefined,
        { entry: local.payload as Entry, deleted: local.deleted },
        { entry: server.payload as Entry, deleted: server.deleted },
      );
      const result: Side = { payload: r.result.entry, deleted: r.result.deleted };
      return { kind: 'resolved', result, conflicts: r.conflicts, adoptServer: deepEqual(result, server) };
    }
    case 'templateVersion':
      return deepEqual(local, server)
        ? { kind: 'resolved', result: server, conflicts: [], adoptServer: true }
        : { kind: 'unresolvable', reason: 'templateVersion-collision' };
    case 'template':
      return template(base, local, server);
    default:
      return wholeRecord(local, server);
  }
}
