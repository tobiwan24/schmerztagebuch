// Umnummerierung einer kollidierenden Vorlagenversion (Spec 04 „Kollidierende Vorlagenversion", A-016, A-039). Rein:
// plant nur, die Engine wendet den Plan in einer Dexie-Transaktion an.

export interface RenumberInput {
  /** Nummer n der Version, die der Server mit anderem Inhalt kennt. */
  collidedVersion: number;
  /** Alle lokal bekannten Versionsnummern der Vorlage (inkl. n). */
  localVersions: readonly number[];
  /** `currentVersion` der lokalen Vorlage. */
  localCurrentVersion: number;
  /** `currentVersion` der Vorlage auf dem Server, falls bekannt. */
  serverCurrentVersion?: number;
  /** Einträge dieser Vorlage; `pending` = ausstehende Outbox-Op. */
  entries: readonly { id: string; templateVersion: number; pending: boolean }[];
}

export interface RenumberPlan {
  /** Nächste freie Nummer: Maximum aller bekannten Versionen + 1. */
  newVersion: number;
  /** Einträge, die auf `newVersion` umgeschrieben werden (Version n und ausstehende Op). */
  entryIds: string[];
  /** Neue `currentVersion` der Vorlage. */
  currentVersion: number;
}

export function planVersionRenumber(input: RenumberInput): RenumberPlan {
  const n = input.collidedVersion;
  const newVersion = Math.max(n, input.serverCurrentVersion ?? 0, input.localCurrentVersion, ...input.localVersions) + 1;
  return {
    newVersion,
    entryIds: input.entries.filter((e) => e.pending && e.templateVersion === n).map((e) => e.id),
    currentVersion: input.localCurrentVersion === n ? newVersion : input.localCurrentVersion,
  };
}
