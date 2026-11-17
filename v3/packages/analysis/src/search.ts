// Volltextsuche (Spec 06): MiniSearch über Textwerte, Options-Labels, Tags, Ereignistitel, Vorlagen- und Blocknamen.
// Umlaut-tolerant: jedes Wort wird in zwei Formen indiziert und gesucht — `ä`→`ae` und ohne Diakritika (`ä`→`a`) —, damit
// „uebelkeit", „übelkeit" und „Ubelk" (Präfix) dasselbe finden. Unscharf (Tippfehler) und mit Präfix.
import MiniSearch from 'minisearch';
import type { WorkingSet, WsEntry } from './working-set.js';

/** Beide Normalformen eines Worts (ohne Duplikate). */
export function termVariants(term: string): string[] {
  const lower = term.toLowerCase();
  const ae = lower.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const plain = lower.replace(/ß/g, 'ss').normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return ae === plain ? [ae] : [ae, plain];
}

function documentOf(e: WsEntry) {
  const texts: string[] = [];
  const events: string[] = [];
  for (const f of e.fields) {
    if (f.value.kind === 'text') texts.push(f.value.text);
    if (f.value.kind === 'textEvents') {
      if (f.value.text) texts.push(f.value.text);
      for (const ev of f.value.events) events.push(ev.title);
    }
  }
  return {
    id: e.id,
    text: texts.join(' '),
    options: e.fields.flatMap((f) => f.optionLabels).join(' '),
    tags: e.tags.join(' '),
    events: events.join(' '),
    names: [e.templateName, ...e.fields.map((f) => f.label)].join(' '),
  };
}

type SearchDoc = ReturnType<typeof documentOf>;

/** Version des persistierten Formats; ändern sich Felder oder Normalisierung, muss sie steigen (alter Stand wird verworfen). */
export const SEARCH_INDEX_VERSION = 1;

const MINI_OPTIONS = {
  fields: ['text', 'options', 'tags', 'events', 'names'],
  storeFields: [] as string[],
  processTerm: (term: string) => termVariants(term),
  searchOptions: { prefix: true, fuzzy: 0.2, combineWith: 'AND' as const, processTerm: (term: string) => termVariants(term) },
};

/** Persistierbarer Stand des Index (M23, ANA-33): Inhalts-Fingerabdruck je Eintrag + MiniSearch-JSON. */
export interface SearchSnapshot {
  v: typeof SEARCH_INDEX_VERSION;
  /** Eintrags-ID → Fingerabdruck der indizierten Texte. */
  stamps: Record<string, string>;
  /** `JSON.stringify(MiniSearch#toJSON())`. */
  index: string;
}

/** Schneller, nicht kryptografischer 64-Bit-Fingerabdruck (zwei FNV-1a-Läufe) der indizierten Texte. */
function stampOf(d: SearchDoc): string {
  const s = `${d.text}${d.options}${d.tags}${d.events}${d.names}`;
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0;
  }
  return `${a.toString(36)}${b.toString(36)}${s.length.toString(36)}`;
}

export interface SearchIndex {
  search(text: string): Set<string>;
  add(entry: WsEntry): void;
  remove(entryId: string): void;
  /**
   * Gleicht den Index mit dem Arbeitsset ab: neue und geänderte Einträge werden (neu) indiziert, entfernte verworfen —
   * inkrementell, ohne alles neu aufzubauen. Rückgabe: Anzahl der Änderungen.
   */
  sync(ws: WorkingSet): number;
  /** Persistierbarer Stand; `null`, wenn sich seit dem Laden bzw. dem letzten Aufruf nichts geändert hat. */
  snapshot(): SearchSnapshot | null;
}

/** Ist `snapshot` ein brauchbarer Stand dieser Version? (Format und Version, nicht der Inhalt.) */
export function isSearchSnapshot(x: unknown): x is SearchSnapshot {
  const s = x as Partial<SearchSnapshot> | null;
  return !!s && s.v === SEARCH_INDEX_VERSION && typeof s.index === 'string' && !!s.stamps && typeof s.stamps === 'object';
}

/**
 * Baut den Index. Mit `snapshot` (aus dem letzten Lauf) wird er geladen und nur um die Unterschiede zum Arbeitsset
 * ergänzt (Kaltstart ohne vollständigen Neuaufbau); ein unbrauchbarer Stand führt zum normalen Neuaufbau.
 */
export function createSearchIndex(ws: WorkingSet, opts: { snapshot?: unknown } = {}): SearchIndex {
  let mini: MiniSearch<SearchDoc> | null = null;
  let stamps: Record<string, string> = {};
  if (isSearchSnapshot(opts.snapshot)) {
    try {
      mini = MiniSearch.loadJSON<SearchDoc>(opts.snapshot.index, MINI_OPTIONS);
      stamps = { ...opts.snapshot.stamps };
    } catch {
      mini = null;
    }
  }
  const fresh = mini === null;
  if (!mini) mini = new MiniSearch<SearchDoc>(MINI_OPTIONS);
  const index = mini;
  let dirty = fresh;

  function sync(next: WorkingSet): number {
    let changes = 0;
    const seen = new Set<string>();
    const additions: SearchDoc[] = [];
    for (const e of next.entries) {
      const doc = documentOf(e);
      const stamp = stampOf(doc);
      seen.add(e.id);
      if (stamps[e.id] === stamp) continue;
      if (e.id in stamps) index.discard(e.id);
      additions.push(doc);
      stamps[e.id] = stamp;
      changes++;
    }
    for (const id of Object.keys(stamps)) {
      if (seen.has(id)) continue;
      index.discard(id);
      delete stamps[id];
      changes++;
    }
    if (additions.length) index.addAll(additions);
    if (changes) dirty = true;
    return changes;
  }
  sync(ws);

  return {
    search(text) {
      return new Set(index.search(text).map((r) => String(r.id)));
    },
    add(entry) {
      const doc = documentOf(entry);
      if (entry.id in stamps) index.discard(entry.id);
      index.add(doc);
      stamps[entry.id] = stampOf(doc);
      dirty = true;
    },
    remove(entryId) {
      if (!(entryId in stamps)) return;
      index.discard(entryId);
      delete stamps[entryId];
      dirty = true;
    },
    sync,
    snapshot() {
      if (!dirty) return null;
      dirty = false;
      return { v: SEARCH_INDEX_VERSION, stamps: { ...stamps }, index: JSON.stringify(index) };
    },
  };
}
