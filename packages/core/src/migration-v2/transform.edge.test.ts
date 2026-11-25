// Randfälle der v2-Transformation (Spec 11): Altformen, kaputte Werte, defensive Pfade. Jeder Fall prüft das erwartete
// Verhalten — nichts geht still verloren (Bericht), nichts wird einem falschen Block zugeordnet.
import { describe, expect, it } from 'vitest';
import { transformV2, type MigrationOptions } from './transform.js';
import type { V2Block, V2DecodedEntry, V2Template } from './v2-types.js';

const DIARY = '01900000-0000-7000-8000-000000000001';
const opts = (over: Partial<MigrationOptions> = {}): MigrationOptions => ({
  diaryId: DIARY, authorId: 'u', timezone: 'Europe/Berlin', resolveImage: () => ({ presetId: 'default-koerper-vorderseite' }), ...over,
});
const date = (value?: unknown): V2Block => ({ id: 'd', type: 'date', label: 'Datum', isDeletable: false, ...(value === undefined ? {} : { value }) });
const tpl = (blocks: V2Block[], over: Partial<V2Template> = {}): V2Template => ({ id: 1, name: 'T', order: 0, blocks, ...over });
let n = 0;
const entry = (blocks: V2Block[] | null, over: Partial<V2DecodedEntry> = {}): V2DecodedEntry => ({ id: ++n, templateId: 1, timestamp: '2026-03-02T10:00:00.000Z', blocks, ...over });
const one = (blocks: V2Block[], e: Partial<V2DecodedEntry> = {}, o: Partial<MigrationOptions> = {}, t: Partial<V2Template> = {}) => {
  const strip = blocks.map((b) => ({ ...b, value: undefined }) as V2Block);
  return transformV2({ templates: [tpl(strip, t)], entries: [entry(blocks, e)] }, opts(o));
};
const valuesOf = (r: ReturnType<typeof transformV2>) => r.entries[0]?.values ?? {};
const defOf = (r: ReturnType<typeof transformV2>, label: string) => r.templates[0]!.versions.at(-1)!.blocks.find((b) => b.label === label)!;

describe('v2-Transformation: Randfälle', () => {
  it('Schlüssel ohne syncId (alte Geräte) bleiben stabil; ungültige Zeitstempel und kaputte Daten landen im Bericht', () => {
    const t = tpl([date(), { id: 'x', type: 'text', label: 'Notiz' }]);
    const src = {
      templates: [t],
      entries: [
        entry([date('2026-03-02'), { id: 'x', type: 'text', label: 'Notiz', value: 'a' }]),
        entry([date()], { timestamp: 'kein Datum' }),
        entry('kaputt' as unknown as V2Block[]),
      ],
    };
    const r1 = transformV2(src, opts());
    const r2 = transformV2(src, opts());
    expect(r1.entries.map((e) => e.id)).toEqual(r2.entries.map((e) => e.id));
    expect(r1.report.undecryptable.map((u) => u.reason)).toEqual(['ungültiger Zeitstempel', 'Daten unlesbar']);
    expect(r1.report.counts.undecryptable).toBe(2);
    expect(r1.entries).toHaveLength(1);
  });

  it('unbekannte Blocktypen, doppelte Block-IDs, leere Labels und Vorlagen ohne Namen', () => {
    const blocks: V2Block[] = [date(), { id: 'u', type: 'video', label: 'X' }, { id: 't', type: 'text', label: '' }, { id: 't', type: 'text', label: 'Doppelt' }];
    const r = one(blocks, {}, {}, { name: '  ' });
    expect(r.templates[0]!.template.name).toBe('Vorlage 1');
    expect(r.report.warnings.some((w) => w.includes('unbekannter Blocktyp „video“'))).toBe(true);
    expect(r.report.warnings.some((w) => w.includes('doppelte Block-ID'))).toBe(true);
    expect(r.templates[0]!.versions.at(-1)!.blocks.map((b) => b.label)).toEqual(['Feld']);
  });

  it('Slider: ungültige Skala und Schrittweite werden korrigiert (mit Hinweis); Rolle nur bei aktiver Datenverarbeitung', () => {
    const r = one([
      date(),
      { id: 's1', type: 'slider', label: 'Kaputt', min: 5, max: 5, value: 3 },
      { id: 's2', type: 'slider', label: 'Schritt', min: 0, max: 10, step: 3, value: 'x' },
      { id: 's3', type: 'slider', label: 'Aus', dashboard: { enabled: false, type: 'pain' }, value: null },
      { id: 's4', type: 'slider', label: 'Unbekannt', dashboard: { enabled: true }, value: '' },
      { id: 's5', type: 'slider', label: 'Text', value: '4' },
    ]);
    expect(defOf(r, 'Kaputt')).toMatchObject({ config: { min: 0, max: 10 } });
    expect(defOf(r, 'Schritt').type === 'slider' && defOf(r, 'Schritt').config.step).toBeCloseTo(10 / 3);
    expect(defOf(r, 'Aus').role).toBeUndefined();
    expect(defOf(r, 'Unbekannt').role).toBeUndefined();
    expect(r.report.warnings.filter((w) => /Skala|Schrittweite/.test(w))).toHaveLength(2);
    expect(valuesOf(r)[defOf(r, 'Kaputt').id]).toBe(3);
    expect(valuesOf(r)[defOf(r, 'Text').id]).toBe(4);
    expect(r.report.unknownValues.map((u) => u.value)).toEqual(['x']);
  });

  it('Text, Checkbox und Multiselect: Altformen und leere Werte', () => {
    const r = one([
      date(),
      { id: 'a', type: 'text', label: 'Leer', value: '   ' },
      { id: 'b', type: 'text', label: 'Objekt', value: { x: 1 } },
      { id: 'c', type: 'checkbox', label: 'Nein', value: false },
      { id: 'd', type: 'checkbox', label: 'NurText', value: '' },
      { id: 'e', type: 'checkbox', label: 'Objekt leer', value: { checked: false, text: ' ' } },
      { id: 'f', type: 'checkbox', label: 'Kaputt', value: 7 },
      { id: 'g', type: 'multiselect', label: 'Einzel', options: ['A', 'B'], value: 'B' },
      { id: 'h', type: 'multiselect', label: 'Index', multiSelectOptions: [{ text: 'X' }, { text: 'X' }, { text: ' ' }], value: [5, 0, ''] },
      { id: 'i', type: 'multiselect', label: 'Nichts', value: 3 },
    ]);
    const v = valuesOf(r);
    for (const l of ['Leer', 'Objekt', 'Nein', 'NurText', 'Objekt leer', 'Kaputt', 'Nichts']) expect(v[defOf(r, l).id], l).toBeUndefined();
    const einzel = defOf(r, 'Einzel');
    expect(einzel.type === 'multiselect' && (v[einzel.id] as string[]).map((id) => einzel.config.options.find((o) => o.id === id)!.label)).toEqual(['B']);
    const idx = defOf(r, 'Index');
    expect(idx.type === 'multiselect' && idx.config.options.map((o) => o.label)).toEqual(['X']); // doppelt/leer entfernt
    expect(idx.type === 'multiselect' && idx.config.options[0]!.color).toBe('#007AFF');
  });

  it('Textarea: Text als String, Ereignisse ohne Titel oder mit kaputter Zeit, Anhänge ohne Daten, Legacy-Bild als Liste', () => {
    const r = one([
      date(),
      { id: 'n1', type: 'textarea', label: 'Alt', value: 'nur Text' },
      { id: 'n2', type: 'textarea', label: 'Ereignisse', value: { events: [{ eventTitle: ' ' }, { eventTitle: 'Physio', timestamp: 'kaputt' }, 'x'], attachedFiles: ['kein data', { data: 'data:application/pdf;base64,JVBE' }, { id: 'f9', name: ' ', data: 'data:image/png;base64,iVBO', createdAt: 'kaputt' }] } },
      { id: 'n3', type: 'textarea', label: 'Leer', value: 5 },
      { id: 'n4', type: 'textarea', label: 'Nichts', value: {} },
      { id: 'i1', type: 'image', label: 'Fotos', value: JSON.stringify([{ data: 'data:image/jpeg;base64,/9j/', name: 'A.jpg' }, { data: 'x' }]) },
      { id: 'i2', type: 'image', label: 'Kein Bild', value: 'irgendwas' },
    ]);
    const v = valuesOf(r);
    expect(v[defOf(r, 'Alt').id]).toEqual({ text: 'nur Text' });
    const ev = v[defOf(r, 'Ereignisse').id] as { events: { title: string; at?: string }[]; attachmentIds: string[] };
    expect(ev.events).toEqual([expect.objectContaining({ title: 'Physio', category: 'event' })]);
    expect(ev.events[0]!.at).toBeUndefined();
    expect(ev.attachmentIds).toHaveLength(2);
    expect(r.attachments.map((a) => a.name)).toEqual(['Dokument.pdf', 'Foto', 'A.jpg']);
    expect(v[defOf(r, 'Leer').id]).toBeUndefined();
    expect(v[defOf(r, 'Nichts').id]).toBeUndefined();
    expect(v[defOf(r, 'Kein Bild').id]).toBeUndefined();
    expect(r.report.warnings.filter((w) => w.includes('ohne lesbare Daten'))).toHaveLength(2);
  });

  it('Body-Map: eigenes v2-Standardbild, unlesbares/zu großes Bild, Pinsel mit einem Punkt, sehr lange Pfade', () => {
    const longPath = Array.from({ length: 2500 }, (_, i) => ({ x: (i % 100) / 100, y: 0.5 }));
    const map = (image: string | null, points: unknown[]) => JSON.stringify({ image, points });
    const r = one(
      [
        date(),
        { id: 'm1', type: 'bodymap', label: 'Eigenes Preset', bodyMapConfig: { defaultPresetId: 'user-123' }, value: map(null, [{ x: 0.1, y: 0.2 }]) },
        { id: 'm2', type: 'bodymap', label: 'Unlesbar', value: map('data:image/png;base64,AAA', [{ x: 2, y: -1, type: 'brush', path: [{ x: 0.1, y: 0.1 }] }]) },
        { id: 'm3', type: 'bodymap', label: 'Zu groß', value: map('data:image/png;base64,' + 'A'.repeat(2_100_000), [{ path: longPath, type: 'brush' }]) },
        { id: 'm4', type: 'bodymap', label: 'Leer', value: map('data:image/png;base64,AAA', []) },
        { id: 'm5', type: 'bodymap', label: 'Kaputt', value: 'kein json' },
      ],
      {},
      { resolveImage: (img) => (img.length > 1000 ? { width: 600, height: 800 } : null) },
    );
    const v = valuesOf(r);
    expect(defOf(r, 'Eigenes Preset')).toMatchObject({ config: { defaultPresetId: 'default-koerper-vorderseite' } });
    expect(r.report.warnings.some((w) => w.includes('eigenes v2-Standardbild'))).toBe(true);
    const unlesbar = v[defOf(r, 'Unlesbar').id] as { presetId: string; points: Record<string, unknown>[] };
    expect(unlesbar.points[0]).toMatchObject({ x: 1, y: 0, kind: 'point' }); // Pinsel mit einem Punkt → Punkt, begrenzt
    expect(unlesbar.points[0]!.path).toBeUndefined();
    const gross = v[defOf(r, 'Zu groß').id] as { presetId: string; points: { path: unknown[]; x: number }[] };
    expect(gross.presetId).toBe('default-koerper-vorderseite');
    expect(gross.points[0]!.path).toHaveLength(1000);
    expect(gross.points[0]!.x).toBe(0);
    expect(r.report.warnings.some((w) => w.includes('nicht lesbar'))).toBe(true);
    expect(r.report.warnings.some((w) => w.includes('zu groß'))).toBe(true);
    expect(v[defOf(r, 'Leer').id]).toBeUndefined();
    expect(v[defOf(r, 'Kaputt').id]).toBeUndefined();
  });

  it('Datum: fehlender oder kaputter Datum-Block, Zeitraum mit vertauschtem Ende, Nebendatum als Einzelwert im Zeitraum-Block', () => {
    const t = tpl([date(), { id: 's', type: 'date', label: 'Neben', isDeletable: true }]);
    const r = transformV2(
      {
        templates: [t],
        entries: [
          entry([date('kein datum'), { id: 's', type: 'date', label: 'Neben', value: JSON.stringify({ mode: 'range', startDate: '2026-01-01' }) }]),
          entry([date(JSON.stringify({ mode: 'range', startDate: '2026-03-05', endDate: '2026-03-01' })), { id: 's', type: 'date', label: 'Neben', value: JSON.stringify({ mode: 'single', startDate: '2026-02-01', time: '08:00' }) }], { timestamp: '2026-03-06T10:00:00.000Z' }),
          entry([{ id: 's', type: 'date', label: 'Neben', value: 'kaputt' }], { timestamp: '2026-03-07T10:00:00.000Z' }),
          entry([date(JSON.stringify({ mode: 'range', startDate: '2026-03-08', startTime: '22:00', endTime: '01:00' }))], { timestamp: '2026-03-08T10:00:00.000Z' }),
        ],
      },
      opts(),
    );
    const [a, b, c, d] = r.entries;
    expect(a!.occurredAt).toBe('2026-03-02T11:00:00+01:00'); // Datum unlesbar → Erfassungszeit
    expect(b!.period).toEqual({ start: '2026-03-05', end: '2026-03-05' });
    const neben = r.templates[0]!.versions.at(-1)!.blocks.find((x) => x.label === 'Neben')!;
    expect(neben).toMatchObject({ type: 'date', config: { mode: 'range' } });
    expect(b!.values[neben.id]).toEqual({ start: '2026-02-01T08:00:00+01:00', end: '2026-02-01T08:00:00+01:00' });
    expect(c!.occurredAt).toBe('2026-03-07T11:00:00+01:00'); // erster Datum-Block ist kaputt → Erfassungszeit
    expect(d!.period).toEqual({ start: '2026-03-08T22:00:00+01:00', end: '2026-03-08T22:00:00+01:00' }); // Ende vor Beginn → Beginn
  });

  it('Vorlagen: gelöschte ohne Einträge übersprungen, ungültiges updatedAt, Einordnung nach vorhandenen Vorlagen', () => {
    const r = transformV2(
      {
        templates: [tpl([date()], { id: 1, updatedAt: 'kaputt' }), tpl([date()], { id: 2, deleted: true })],
        entries: [entry([date('2026-03-02')], { updatedAt: 'kaputt', editedAt: '2026-03-03T00:00:00.000Z' })],
      },
      opts({ afterOrder: 'a5' }),
    );
    expect(r.templates).toHaveLength(1);
    expect(r.templates[0]!.template.order > 'a5').toBe(true);
    expect(r.report.counts.skippedDeleted).toBe(1);
    expect(r.entries[0]!.updatedAt).toBe('2026-03-02T10:00:00.000Z'); // unlesbares updatedAt → Erfassungszeit
  });
});
