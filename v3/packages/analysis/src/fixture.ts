// Analyse-Fixture (Spec 06/12): kleine, von Hand nachrechenbare Datenbasis für Filter-, Such- und Aggregationstests.
// Keine echten Gesundheitsdaten. Lesbare IDs (`e01` …), damit erwartete Ergebnisse tabellarisch prüfbar sind.
import type { BlockDef, Entry, Template, TemplateVersion } from '@stb/core';

export const FIX = {
  diary: 'd-1',
  tz: 'Europe/Berlin',
  t1: 't-kopf',
  t2: 't-ruecken',
  pain: 'b-pain',
  meds: 'b-meds',
  nausea: 'b-nausea',
  notes: 'b-notes',
  back: 'b-back',
  sleep: 'b-sleep',
  triggers: 'b-triggers',
  notes2: 'b-notes2',
  ibu: 'o-ibu',
  para: 'o-para',
  stress: 'o-stress',
  wetter: 'o-wetter',
} as const;

const at = '2026-03-01T00:00:00.000Z';
const slider = (id: string, label: string, role?: BlockDef['role']): BlockDef => ({
  id, type: 'slider', label, required: false, order: id, config: { min: 0, max: 10, step: 1 }, ...(role ? { role } : {}),
});
const multi = (id: string, label: string, role: BlockDef['role'], options: [string, string][]): BlockDef => ({
  id, type: 'multiselect', label, required: false, order: id, role, config: { multiple: true, options: options.map(([oid, l]) => ({ id: oid, label: l, color: '#888888' })) },
});
const notes = (id: string): BlockDef => ({ id, type: 'textarea', label: 'Notizen', required: false, order: id, role: 'note', config: { allowAttachments: true, allowEvents: true } });

export const fixtureTemplates: Template[] = [
  { id: FIX.t1, diaryId: FIX.diary, name: 'Kopfschmerz', order: 'a', currentVersion: 1, archived: false, createdAt: at, updatedAt: at },
  { id: FIX.t2, diaryId: FIX.diary, name: 'Rücken', order: 'b', currentVersion: 1, archived: false, createdAt: at, updatedAt: at },
];

export const fixtureVersions: TemplateVersion[] = [
  {
    templateId: FIX.t1, version: 1, createdAt: at,
    blocks: [
      slider(FIX.pain, 'Schmerzstärke', 'outcome'),
      multi(FIX.meds, 'Medikamente', 'medication', [[FIX.ibu, 'Ibuprofen'], [FIX.para, 'Paracetamol']]),
      { id: FIX.nausea, type: 'checkbox', label: 'Übelkeit', required: false, order: FIX.nausea, role: 'symptom', config: { withNote: false } },
      notes(FIX.notes),
    ],
  },
  {
    templateId: FIX.t2, version: 1, createdAt: at,
    blocks: [
      slider(FIX.back, 'Rückenschmerz', 'outcome'),
      slider(FIX.sleep, 'Schlafqualität', 'sleep'),
      multi(FIX.triggers, 'Auslöser', 'trigger', [[FIX.stress, 'Stress'], [FIX.wetter, 'Wetter']]),
      notes(FIX.notes2),
    ],
  },
];

type Row = { id: string; t: string; day: string; values: Record<string, unknown>; tags?: string[]; source?: Entry['meta']['source']; author?: string };

/** Einträge im März 2026, je 10:00 UTC (= 11:00 Berlin, gleicher Kalendertag). */
const rows: Row[] = [
  { id: 'e01', t: FIX.t1, day: '2026-03-01', values: { [FIX.pain]: 7, [FIX.meds]: [FIX.ibu], [FIX.nausea]: { checked: true }, [FIX.notes]: { text: 'Übelkeit am Morgen' } }, tags: ['arbeit'] },
  { id: 'e02', t: FIX.t1, day: '2026-03-02', values: { [FIX.pain]: 3, [FIX.notes]: { text: 'ruhiger Tag' } } },
  {
    id: 'e03', t: FIX.t1, day: '2026-03-03', source: 'quick', tags: ['arbeit', 'wochenende'],
    values: { [FIX.pain]: 9, [FIX.meds]: [FIX.ibu, FIX.para], [FIX.nausea]: { checked: true }, [FIX.notes]: { events: [{ id: 'ev-1', category: 'doctor', title: 'Hausarzt' }] } },
  },
  { id: 'e04', t: FIX.t1, day: '2026-03-05', values: { [FIX.pain]: 5, [FIX.meds]: [FIX.para] }, tags: ['wochenende'] },
  { id: 'e05', t: FIX.t2, day: '2026-03-01', values: { [FIX.back]: 6, [FIX.sleep]: 4, [FIX.triggers]: [FIX.stress], [FIX.notes2]: { text: 'Stress im Büro' } } },
  { id: 'e06', t: FIX.t2, day: '2026-03-04', values: { [FIX.back]: 2, [FIX.sleep]: 8, [FIX.triggers]: [FIX.wetter] }, tags: ['urlaub'] },
  {
    id: 'e07', t: FIX.t2, day: '2026-03-06',
    values: { [FIX.back]: 8, [FIX.sleep]: 3, [FIX.triggers]: [FIX.stress, FIX.wetter], [FIX.notes2]: { events: [{ id: 'ev-2', category: 'event', title: 'Umzug' }] } },
  },
  { id: 'e08', t: FIX.t1, day: '2026-03-07', values: { [FIX.pain]: 1 }, source: 'shortcut', author: 'u2' },
  { id: 'e10', t: FIX.t1, day: '2026-03-10', values: { [FIX.pain]: 6, [FIX.meds]: [FIX.ibu], [FIX.notes]: { text: 'leicht übel' } } },
];

export const fixtureEntries: Entry[] = rows.map((r) => {
  const ts = `${r.day}T10:00:00.000Z`;
  return {
    id: r.id, diaryId: FIX.diary, templateId: r.t, templateVersion: 1, occurredAt: ts, recordedAt: ts, updatedAt: ts,
    authorId: r.author ?? 'u1', values: r.values, tags: r.tags ?? [], meta: { source: r.source ?? 'app', timezone: FIX.tz },
    hlc: `${Date.parse(ts)}:0000:fix`,
  };
});

export const fixtureDiaries = [{ id: FIX.diary, settings: { timezone: FIX.tz } }];

/** „Jetzt" der Fixture: 10.03.2026, 12:00 UTC. */
export const FIXTURE_NOW = Date.parse('2026-03-10T12:00:00.000Z');

// --- Zusätze für Aggregations-Tests (ANA-05 … ANA-10); die Filter-Tests nutzen nur die Basis oben. ---

/** Version 2 von „Kopfschmerz": Block „Übelkeit" entfernt (ANA-07). */
export const fixtureVersionsV2: TemplateVersion[] = [
  ...fixtureVersions,
  { templateId: FIX.t1, version: 2, createdAt: '2026-03-08T00:00:00.000Z', blocks: fixtureVersions[0]!.blocks.filter((b) => b.id !== FIX.nausea) },
];
export const fixtureTemplatesV2: Template[] = fixtureTemplates.map((t) => (t.id === FIX.t1 ? { ...t, currentVersion: 2 } : t));

const extra = (id: string, occurredAt: string, values: Record<string, unknown>, version = 1): Entry => ({
  id, diaryId: FIX.diary, templateId: FIX.t1, templateVersion: version, occurredAt, recordedAt: occurredAt, updatedAt: occurredAt,
  authorId: 'u1', values, tags: [], meta: { source: 'app', timezone: FIX.tz }, hlc: `${Date.parse(occurredAt)}:0000:fix`,
});

export const fixtureExtraEntries: Entry[] = [
  // ANA-06: zweiter Eintrag am 02.03. (später am Tag) und ein Eintrag ohne Schmerzwert am selben Tag
  extra('e09', '2026-03-02T18:00:00.000Z', { [FIX.pain]: 2 }),
  extra('e12', '2026-03-02T20:00:00.000Z', { [FIX.notes]: { text: 'nur Notiz' } }),
  // ANA-05: 23:30 Berlin (= 22:30 UTC) am 12.03. und 00:30 Berlin am 14.03. (= 23:30 UTC am 13.03.)
  extra('e13', '2026-03-12T22:30:00.000Z', { [FIX.pain]: 4 }),
  extra('e14', '2026-03-13T23:30:00.000Z', { [FIX.pain]: 2 }),
  // ANA-07: Eintrag mit Version 2 (ohne „Übelkeit")
  extra('e11', '2026-03-09T10:00:00.000Z', { [FIX.pain]: 4 }, 2),
  // ANA-10: Doppel-Einnahme am 10.03. (zählt als ein Tag) und Februar-Einnahme
  extra('e15', '2026-03-10T19:00:00.000Z', { [FIX.meds]: [FIX.ibu] }),
  extra('e16', '2026-02-20T10:00:00.000Z', { [FIX.meds]: [FIX.ibu] }),
];

