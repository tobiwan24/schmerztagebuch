import { describe, expect, it } from 'vitest';
import type { BlockDef } from '@stb/core';
import { entryCardMeta, painToneOf } from './entry-card-meta';

const base = { required: false } as const;
const blocks: BlockDef[] = [
  { ...base, id: 'sl1', type: 'slider', label: 'Schmerz', role: 'outcome', order: 'a1', config: { min: 0, max: 10, step: 1 } },
  { ...base, id: 'sl2', type: 'slider', label: 'Stärke', role: 'outcome', order: 'a2', config: { min: 0, max: 10, step: 1 } },
  { ...base, id: 'sl3', type: 'slider', label: 'Stimmung', role: 'symptom', order: 'a3', config: { min: 0, max: 10, step: 1 } },
  { ...base, id: 'tx', type: 'text', label: 'Kurz', order: 'a0', config: {} } as BlockDef,
  { ...base, id: 'ta', type: 'textarea', label: 'Notiz', order: 'a4', config: { allowAttachments: true, allowEvents: true } },
  { ...base, id: 'bm', type: 'bodymap', label: 'Karte', order: 'a5', config: { defaultPresetId: 'p' } },
];
const e = (values: Record<string, unknown>) => ({ values });

describe('Verlauf-Card-Metadaten', () => {
  it('RDM-028 P3: Ampel-Grenzen 1–3 grün, 4–6 gelb, 7–8 orange, 9–10 rot', () => {
    expect([1, 3, 4, 6, 7, 8, 9, 10].map(painToneOf)).toEqual(['green', 'green', 'amber', 'amber', 'orange', 'orange', 'red', 'red']);
  });
  it('RDM-028 P3: Schmerz = gerundeter Mittelwert der outcome-Slider, andere Rollen zählen nicht', () => {
    const m = entryCardMeta(e({ sl1: 7, sl2: 4, sl3: 9 }), blocks, undefined, []);
    expect(m.pain).toBe(6);
    expect(m.painTone).toBe('amber');
    expect(entryCardMeta(e({ sl3: 9 }), blocks, undefined, []).pain).toBeUndefined();
  });
  it('RDM-028 P3: Rolle kommt aus der aktuellen Version, Skala wird auf 0–10 normiert', () => {
    const cur = blocks.map((b) => (b.id === 'sl3' ? { ...b, role: 'outcome' as const } : b));
    expect(entryCardMeta(e({ sl3: 9 }), blocks, cur, []).pain).toBe(9);
    const five: BlockDef[] = [{ ...base, id: 's', type: 'slider', label: 'x', role: 'outcome', order: 'a', config: { min: 0, max: 5, step: 1 } }];
    expect(entryCardMeta(e({ s: 5 }), five, undefined, []).pain).toBe(10);
    const oneTen: BlockDef[] = [{ ...base, id: 's', type: 'slider', label: 'x', role: 'outcome', order: 'a', config: { min: 1, max: 10, step: 1 } }];
    expect(entryCardMeta(e({ s: 5 }), oneTen, undefined, []).pain).toBe(5);
  });
  it('RDM-028 P3: Titel = erstes gefülltes Text-/Textfeld nach Reihenfolge, nach 80 Zeichen gekürzt, sonst keiner', () => {
    expect(entryCardMeta(e({ tx: '  Kopf  ', ta: { text: 'Notiz' } }), blocks, undefined, []).title).toBe('Kopf');
    expect(entryCardMeta(e({ tx: ' ', ta: { text: ' Notiz ' } }), blocks, undefined, []).title).toBe('Notiz');
    expect(entryCardMeta(e({ ta: { text: 'x'.repeat(100) } }), blocks, undefined, []).title).toBe(`${'x'.repeat(80)}…`);
    expect(entryCardMeta(e({ sl1: 3 }), blocks, undefined, []).title).toBeUndefined();
  });
  it('RDM-028 P3: Kennzeichen Ereignis, Arzt, Körperkarte, Foto, PDF', () => {
    const m = entryCardMeta(
      e({ ta: { events: [{ id: 'x', category: 'event', title: 'a' }, { id: 'y', category: 'doctor', title: 'b' }] }, bm: { presetId: 'p', points: [{}] } }),
      blocks, undefined, [{ kind: 'image' }, { kind: 'pdf' }],
    );
    expect(m.flags).toEqual({ event: true, doctor: true, bodymap: true, image: true, pdf: true });
    const none = entryCardMeta(e({ bm: { presetId: 'p', points: [] } }), blocks, undefined, []);
    expect(none.flags).toEqual({ event: false, doctor: false, bodymap: false, image: false, pdf: false });
    expect(entryCardMeta(e({ ta: { attachmentIds: ['i'] } }), blocks, undefined, []).flags.image).toBe(true);
  });
});
