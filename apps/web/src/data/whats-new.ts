// Neuigkeiten (UI-26, A-081): reine Logik über dem Changelog. Kein DOM, kein Speicher — der Speicherort der zuletzt
// gesehenen Version (localStorage `stb-v3-whatsnew`) liegt in `whats-new-state.ts`.

export interface Release {
  /** Semver, z. B. `3.1.0` oder `3.1.0-alpha.1`. */
  version: string;
  /** ISO-Datum `YYYY-MM-DD`. */
  date: string;
  /** 1–6 Punkte, für Nutzer formuliert. */
  points: string[];
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

interface Parsed {
  core: [number, number, number];
  pre: string[];
}

function parse(version: string): Parsed | null {
  const m = SEMVER_RE.exec(version.trim());
  if (!m) return null;
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : [] };
}

/** Semver-Vergleich: < 0, 0, > 0. Ungültige Versionen gelten als kleiner als jede gültige. */
export function compareVersions(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0;
  for (let i = 0; i < 3; i++) {
    const d = pa.core[i]! - pb.core[i]!;
    if (d !== 0) return d;
  }
  // Ohne Prerelease ist größer als mit.
  if (pa.pre.length === 0 || pb.pre.length === 0) return pb.pre.length - pa.pre.length;
  const n = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < n; i++) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) {
      const d = Number(x) - Number(y);
      if (d !== 0) return d;
    } else if (nx !== ny) {
      return nx ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Einträge, die nach `lastSeen` erschienen sind und höchstens `current` haben, neueste zuerst.
 * `lastSeen` = null oder ungültig: alle Einträge bis `current`. Ungültige Einträge werden ignoriert.
 */
export function unseenReleases(changelog: readonly Release[], lastSeen: string | null, current: string): Release[] {
  const seen = lastSeen && parse(lastSeen) ? lastSeen : null;
  return changelog
    .filter((r) => parse(r.version) !== null)
    .filter((r) => compareVersions(r.version, current) <= 0)
    .filter((r) => seen === null || compareVersions(r.version, seen) > 0)
    .sort((x, y) => compareVersions(y.version, x.version));
}
