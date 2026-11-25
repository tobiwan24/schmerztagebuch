// Große, deterministische Analyse-Fixture für Leistungsbudgets (Spec 06: 5.000 Einträge, 3 Vorlagen, 20 Blöcke).
// Synthetische Werte aus einem festen Seed — keine echten Gesundheitsdaten.
import type { BlockDef, Entry, Template, TemplateVersion } from '@stb/core';

/** Kleiner, deterministischer PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['Kopfschmerz', 'Übelkeit', 'Müdigkeit', 'Stress', 'Arbeit', 'Spaziergang', 'Regen', 'schlecht geschlafen', 'Nacken', 'Rücken', 'besser', 'Wärme', 'Physio', 'Termin', 'ruhig'];

export interface BigFixture {
  diaries: { id: string; settings: { timezone: string } }[];
  templates: Template[];
  versions: TemplateVersion[];
  entries: Entry[];
}

export function bigFixture(count = 5000, seed = 42): BigFixture {
  const r = rng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
  const diary = 'big-d';
  const at = '2025-01-01T00:00:00.000Z';
  const opts = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-o${i}`, label: `${prefix} Option ${i}`, color: '#777777' }));
  const slider = (id: string, label: string, role?: BlockDef['role']): BlockDef => ({ id, type: 'slider', label, required: false, order: id, config: { min: 0, max: 10, step: 1 }, ...(role ? { role } : {}) });
  const multi = (id: string, label: string, role?: BlockDef['role']): BlockDef => ({ id, type: 'multiselect', label, required: false, order: id, config: { multiple: true, options: opts(id, 6) }, ...(role ? { role } : {}) });
  const check = (id: string, label: string): BlockDef => ({ id, type: 'checkbox', label, required: false, order: id, role: 'symptom', config: { withNote: false } });
  const note = (id: string): BlockDef => ({ id, type: 'textarea', label: 'Notizen', required: false, order: id, role: 'note', config: { allowAttachments: true, allowEvents: true } });

  // 3 Vorlagen mit zusammen 20 Blöcken
  const blocks: BlockDef[][] = [
    [slider('a-pain', 'Schmerzstärke', 'outcome'), multi('a-meds', 'Medikamente', 'medication'), multi('a-trig', 'Auslöser', 'trigger'), check('a-nausea', 'Übelkeit'), slider('a-sleep', 'Schlaf', 'sleep'), slider('a-mood', 'Stimmung', 'mood'), note('a-note')],
    [slider('b-pain', 'Rückenschmerz', 'outcome'), slider('b-func', 'Funktion', 'function'), multi('b-act', 'Aktivität', 'activity'), check('b-stiff', 'Steifheit'), multi('b-meds', 'Medikamente', 'medication'), note('b-note')],
    [slider('c-pain', 'Kopfschmerz', 'outcome'), slider('c-dur', 'Dauer'), multi('c-sym', 'Begleitsymptome', 'symptom'), multi('c-trig', 'Auslöser', 'trigger'), check('c-aura', 'Aura'), slider('c-sleep', 'Schlaf', 'sleep'), note('c-note')],
  ];
  const templates: Template[] = blocks.map((_, i) => ({ id: `big-t${i}`, diaryId: diary, name: `Vorlage ${i + 1}`, order: String.fromCharCode(97 + i), currentVersion: 1, archived: false, createdAt: at, updatedAt: at }));
  const versions: TemplateVersion[] = blocks.map((bs, i) => ({ templateId: `big-t${i}`, version: 1, createdAt: at, blocks: bs }));

  const start = Date.parse('2024-01-01T08:00:00.000Z');
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    const ti = i % 3;
    const ts = new Date(start + i * 4.2 * 3600_000 + Math.floor(r() * 3600_000)).toISOString();
    const values: Record<string, unknown> = {};
    for (const b of blocks[ti]!) {
      if (r() < 0.15) continue; // manche Felder leer
      if (b.type === 'slider') values[b.id] = Math.floor(r() * 11);
      else if (b.type === 'multiselect') values[b.id] = b.config.options.filter(() => r() < 0.3).map((o) => o.id);
      else if (b.type === 'checkbox') values[b.id] = { checked: r() < 0.4 };
      else if (b.type === 'textarea') values[b.id] = { text: `${pick(WORDS)} ${pick(WORDS)} ${pick(WORDS)}`, ...(r() < 0.05 ? { events: [{ id: `big-ev-${i}`, category: r() < 0.5 ? 'doctor' : 'event', title: pick(['Hausarzt', 'Neurologie', 'Umzug', 'Urlaub']) }] } : {}) };
    }
    entries.push({
      id: `big-e${String(i).padStart(5, '0')}`, diaryId: diary, templateId: `big-t${ti}`, templateVersion: 1, occurredAt: ts, recordedAt: ts, updatedAt: ts,
      authorId: 'u1', values, tags: r() < 0.2 ? [pick(['arbeit', 'urlaub', 'wochenende'])] : [], meta: { source: r() < 0.2 ? 'quick' : 'app', timezone: 'Europe/Berlin' },
      hlc: `${Date.parse(ts)}:0000:big`,
    });
  }
  return { diaries: [{ id: diary, settings: { timezone: 'Europe/Berlin' } }], templates, versions, entries };
}
