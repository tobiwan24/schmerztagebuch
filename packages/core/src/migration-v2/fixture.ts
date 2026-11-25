// Synthetische v2-Daten (PainDiaryDB Schema v21) für Migrationstests — keine echten Gesundheitsdaten.
// Deckt ab: alle v2-Blocktypen, Legacy-Formen (Datum als String, Checkbox als boolean, alte Multiselect-`options`,
// `image`-Block), geänderte Vorlage (ISS-014-Fall), unbekannte Multiselect-Werte, gelöschte und nicht entschlüsselbare
// Einträge, gelöschte Vorlagen mit/ohne Einträge, Einträge ohne Vorlage.
import type { V2Block, V2DecodedEntry, V2Source, V2Template } from './v2-types.js';

/** Zeilen wie in IndexedDB (`data` als JSON-String; `encrypted: false`). */
export interface V2DumpEntry {
  id: number;
  templateId: number;
  timestamp: string;
  encrypted: boolean;
  data: string;
  tags?: string[];
  editedAt?: string;
  encryptionVersion?: number;
  encryptionSource?: 'cloud' | 'local';
  syncId: string;
  updatedAt: string;
  deleted: boolean;
}

export interface V2Dump {
  templates: V2Template[];
  entries: V2DumpEntry[];
  settings: { key: string; value: string }[];
}

export const V2_FIXTURE_TIMEZONE = 'Europe/Berlin';
/** 1×1-Pixel-Bilder als Platzhalter (nicht dekodiert in den Unit-Tests). */
export const V2_PRESET_IMAGE = 'data:image/jpeg;base64,/9j/PRESETBILDKOERPERVORNE==';
export const V2_OWN_IMAGE = 'data:image/png;base64,iVBORw0KGgoEIGENESBILD=';
export const V2_ATTACHMENT = 'data:image/jpeg;base64,/9j/ANHANGFOTO1234';
export const V2_PDF = 'data:application/pdf;base64,JVBERi0xLjQKREFURUk=';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const dateBlock = (id: string): V2Block => ({ id, type: 'date', label: 'Datum', isDeletable: false });

const painBlocks = (): V2Block[] => [
  dateBlock(uuid(101)),
  { id: uuid(102), type: 'slider', label: 'Schmerzstärke', min: 0, max: 10, step: 1, dashboard: { enabled: true, type: 'pain' } },
  { id: uuid(103), type: 'slider', label: 'Beweglichkeit', min: 0, max: 10, step: 1, dashboard: { enabled: true, type: 'function' } },
  {
    id: uuid(104),
    type: 'multiselect',
    label: 'Medikamente',
    multiSelectOptions: [
      { text: 'Ibuprofen', color: '#FF3B30' },
      { text: 'Paracetamol', color: '#34C759' },
    ],
  },
  { id: uuid(105), type: 'checkbox', label: 'Sport gemacht' },
  { id: uuid(106), type: 'text', label: 'Ort' },
  { id: uuid(107), type: 'textarea', label: 'Notizen', dashboard: { enabled: true, eventCategory: 'event', eventTitle: '' } },
  { id: uuid(108), type: 'bodymap', label: 'Körperkarte', bodyMapConfig: { defaultPresetId: 'default-koerper-vorderseite' } },
  { id: uuid(109), type: 'date', label: 'Beginn der Beschwerden', isDeletable: true },
];

/** Alte Fassung der Vorlage (vor Umbenennung + Checkbox): Schmerz hieß „Schmerz“, Skala 0–5, keine Checkbox. */
const painBlocksOld = (): V2Block[] => [
  dateBlock(uuid(101)),
  { id: uuid(102), type: 'slider', label: 'Schmerz', min: 0, max: 5, step: 1, dashboard: { enabled: true, type: 'pain' } },
  { id: uuid(104), type: 'multiselect', label: 'Medikamente', multiSelectOptions: [{ text: 'Ibuprofen', color: '#FF3B30' }] },
  { id: uuid(110), type: 'image', label: 'Foto' },
];

const legacyBlocks = (): V2Block[] => [
  dateBlock(uuid(201)),
  { id: uuid(202), type: 'multiselect', label: 'Auslöser', options: ['Stress', 'Wetter'] },
  { id: uuid(203), type: 'checkbox', label: 'Kopfschmerz' },
  { id: uuid(204), type: 'text', label: 'Puls' },
];

const withValues = (blocks: V2Block[], values: Record<string, unknown>): V2Block[] =>
  blocks.map((b) => (b.id in values ? { ...b, value: values[b.id] } : b));

const bm = (image: string | null, points: unknown[]) => JSON.stringify({ image, points });
const single = (startDate: string, time?: string) => JSON.stringify({ mode: 'single', startDate, ...(time ? { time } : {}) });

export function buildV2Dump(): V2Dump {
  const templates: V2Template[] = [
    { id: 1, name: 'Schmerz', order: 0, blocks: painBlocks(), icon: 'Flame', color: '#FF3B30', syncId: uuid(1), updatedAt: '2026-03-01T09:00:00.000Z', deleted: false },
    { id: 2, name: 'Alt-Vorlage', order: 1, blocks: legacyBlocks(), icon: 'Book', color: '#007AFF', syncId: uuid(2), updatedAt: '2025-11-01T09:00:00.000Z', deleted: false },
    { id: 3, name: 'Gelöscht mit Einträgen', order: 2, blocks: [dateBlock(uuid(301)), { id: uuid(302), type: 'text', label: 'Notiz' }], syncId: uuid(3), updatedAt: '2025-12-01T09:00:00.000Z', deleted: true },
    { id: 4, name: 'Gelöscht ohne Einträge', order: 3, blocks: [dateBlock(uuid(401))], syncId: uuid(4), updatedAt: '2025-12-01T09:00:00.000Z', deleted: true },
  ];

  const P = (n: number) => uuid(n);
  const rows: { id: number; templateId: number; ts: string; blocks: V2Block[] | string; deleted?: boolean; updatedAt?: string; editedAt?: string }[] = [
    // 1: alle Werte, aktuelle Fassung, Einzeldatum mit Uhrzeit
    {
      id: 1,
      templateId: 1,
      ts: '2026-03-02T07:15:00.000Z',
      blocks: withValues(painBlocks(), {
        [P(101)]: single('2026-03-02', '08:10'),
        [P(102)]: 7,
        [P(103)]: 4,
        [P(104)]: ['Ibuprofen'],
        [P(105)]: { checked: true, text: '20 min Rad' },
        [P(106)]: 'Büro',
        [P(107)]: { text: 'STB-V2-MARKER Kopf drückt', events: [{ eventCategory: 'doctor', eventTitle: 'Hausarzt', timestamp: '2026-03-02T09:00:00.000Z' }] },
        [P(108)]: bm(V2_PRESET_IMAGE, [
          { x: 0.5, y: 0.2, intensity: 7, diameter: 0.05, comment: 'Stirn', type: 'point', number: 1 },
          { x: 0.4, y: 0.6, intensity: 3, diameter: 0.03, comment: '', type: 'brush', path: [{ x: 0.4, y: 0.6 }, { x: 0.45, y: 0.62 }, { x: 1.02, y: 0.65 }], number: 2 },
        ]),
        [P(109)]: JSON.stringify({ mode: 'range', startDate: '2026-02-27', endDate: '2026-03-01' }),
      }),
      updatedAt: '2026-03-02T07:20:00.000Z',
    },
    // 2: Zeitraum ganztägig, Anhänge (Bild + PDF), eigenes Body-Map-Bild
    {
      id: 2,
      templateId: 1,
      ts: '2026-03-05T18:00:00.000Z',
      blocks: withValues(painBlocks(), {
        [P(101)]: JSON.stringify({ mode: 'range', startDate: '2026-03-03', endDate: '2026-03-05' }),
        [P(102)]: 5,
        [P(107)]: {
          text: 'Mit Befund',
          attachedFiles: [
            { id: 'f1', name: 'Knie.jpg', type: 'image', data: V2_ATTACHMENT, createdAt: '2026-03-05T18:00:00.000Z' },
            { id: 'f2', name: 'Befund.pdf', type: 'pdf', data: V2_PDF, createdAt: '2026-03-05T18:01:00.000Z' },
          ],
        },
        [P(108)]: bm(V2_OWN_IMAGE, [{ x: 0.3, y: 0.3, intensity: 9, diameter: 0.08, comment: 'Knie', type: 'point', number: 1 }]),
      }),
    },
    // 3: alte Fassung der Vorlage (ISS-014-Fall) mit Legacy-Bildblock
    {
      id: 3,
      templateId: 1,
      ts: '2025-10-10T10:00:00.000Z',
      blocks: withValues(painBlocksOld(), {
        [P(101)]: single('2025-10-10', '12:30'),
        [P(102)]: 4,
        [P(104)]: ['Ibuprofen'],
        [P(110)]: V2_ATTACHMENT,
      }),
    },
    // 4: unbekannte Multiselect-Werte + Index, Zeitraum mit Uhrzeiten
    {
      id: 4,
      templateId: 1,
      ts: '2026-03-06T20:00:00.000Z',
      blocks: withValues(painBlocks(), {
        [P(101)]: JSON.stringify({ mode: 'range', startDate: '2026-03-06', endDate: '2026-03-06', startTime: '14:00', endTime: '16:30' }),
        [P(102)]: 3,
        [P(104)]: ['Paracetamol', 'Novalgin', 'Novalgin'],
      }),
      editedAt: '2026-03-07T08:00:00.000Z',
      updatedAt: '2026-03-07T08:00:00.000Z',
    },
    // 5: Legacy-Formen: Datum als String (ohne Uhrzeit → 12:00), Checkbox boolean, alte Optionen, Text als Zahl
    {
      id: 5,
      templateId: 2,
      ts: '2025-11-02T21:00:00.000Z',
      blocks: withValues(legacyBlocks(), { [P(201)]: '2025-11-02', [P(202)]: ['Wetter', 0], [P(203)]: true, [P(204)]: 72 }),
    },
    // 6: gelöscht
    { id: 6, templateId: 1, ts: '2026-03-08T08:00:00.000Z', blocks: withValues(painBlocks(), { [P(101)]: single('2026-03-08', '08:00'), [P(102)]: 2 }), deleted: true },
    // 7: Eintrag einer gelöschten Vorlage
    { id: 7, templateId: 3, ts: '2025-12-02T08:00:00.000Z', blocks: [{ ...dateBlock(uuid(301)), value: single('2025-12-02', '09:00') }, { id: uuid(302), type: 'text', label: 'Notiz', value: 'archiviert' }] },
    // 8: Vorlage existiert nicht mehr (v2-ID 9)
    { id: 8, templateId: 9, ts: '2025-09-01T08:00:00.000Z', blocks: [{ ...dateBlock(uuid(901)), value: single('2025-09-01', '07:45') }, { id: uuid(902), type: 'slider', label: 'Müdigkeit', value: 6 }] },
    // 9: Slider-Wert außerhalb der Skala → Bericht „unbekannter Wert“, Rest bleibt
    { id: 9, templateId: 1, ts: '2026-03-09T08:00:00.000Z', blocks: withValues(painBlocks(), { [P(101)]: single('2026-03-09', '06:00'), [P(102)]: 11, [P(103)]: 2.5, [P(106)]: 'Zuhause' }) },
  ];

  const entries: V2DumpEntry[] = rows.map((r) => ({
    id: r.id,
    templateId: r.templateId,
    timestamp: r.ts,
    encrypted: false,
    data: typeof r.blocks === 'string' ? r.blocks : JSON.stringify(r.blocks),
    tags: [],
    ...(r.editedAt ? { editedAt: r.editedAt } : {}),
    syncId: uuid(1000 + r.id),
    updatedAt: r.updatedAt ?? r.ts,
    deleted: !!r.deleted,
  }));
  // 10: nicht entschlüsselbar (verschlüsselt, ohne Schlüssel)
  entries.push({
    id: 10,
    templateId: 1,
    timestamp: '2026-01-15T08:00:00.000Z',
    encrypted: true,
    data: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
    encryptionVersion: 2,
    syncId: uuid(1010),
    updatedAt: '2026-01-15T08:00:00.000Z',
    deleted: false,
  });

  return { templates, entries, settings: [{ key: 'encryptionMode', value: 'none' }, { key: 'setupCompleted', value: 'true' }] };
}

/** Unverschlüsselte Dump-Zeilen in die Transformations-Eingabe übersetzen (verschlüsselte → nicht entschlüsselbar). */
export function plainV2Source(dump: V2Dump): V2Source {
  const entries: V2DecodedEntry[] = dump.entries.map((e) => {
    let blocks: V2Block[] | null = null;
    let decryptError: string | undefined;
    if (e.encrypted) decryptError = 'kein Schlüssel';
    else {
      try {
        blocks = JSON.parse(e.data) as V2Block[];
      } catch {
        decryptError = 'Daten unlesbar';
      }
    }
    return {
      id: e.id,
      templateId: e.templateId,
      timestamp: e.timestamp,
      syncId: e.syncId,
      updatedAt: e.updatedAt,
      ...(e.editedAt ? { editedAt: e.editedAt } : {}),
      deleted: e.deleted,
      blocks,
      ...(decryptError ? { decryptError } : {}),
    };
  });
  return { templates: dump.templates, entries };
}

export const V2_FIXTURE_DIARY_ID = '01900000-0000-7000-8000-000000000001';
export const V2_FIXTURE_AUTHOR_ID = 'user-fixture';
