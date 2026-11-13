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

export interface SearchIndex {
  search(text: string): Set<string>;
  add(entry: WsEntry): void;
  remove(entryId: string): void;
}

export function createSearchIndex(ws: WorkingSet): SearchIndex {
  const mini = new MiniSearch<ReturnType<typeof documentOf>>({
    fields: ['text', 'options', 'tags', 'events', 'names'],
    storeFields: [],
    processTerm: (term) => termVariants(term),
    searchOptions: { prefix: true, fuzzy: 0.2, combineWith: 'AND', processTerm: (term) => termVariants(term) },
  });
  mini.addAll(ws.entries.map(documentOf));
  const ids = new Set(ws.entries.map((e) => e.id));
  return {
    search(text) {
      return new Set(mini.search(text).map((r) => String(r.id)));
    },
    add(entry) {
      if (ids.has(entry.id)) mini.discard(entry.id);
      mini.add(documentOf(entry));
      ids.add(entry.id);
    },
    remove(entryId) {
      if (!ids.has(entryId)) return;
      mini.discard(entryId);
      ids.delete(entryId);
    },
  };
}
