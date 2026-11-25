import { describe, it, expect, afterEach } from 'vitest';
import { createTemplate, keyBetween, type BlockDef, type Entry } from '@stb/core';
import { createDevice, fixture, startServer } from './harness.js';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0).reverse()) await c();
});

async function setup() {
  const f = await fixture();
  const server = await startServer(f.diaryId);
  closers.push(server.close);
  const a = await createDevice({ app: server.app, user: 'alice', diaryId: f.diaryId, dk: f.dk, clock: f.clock });
  const b = await createDevice({ app: server.app, user: 'alice', diaryId: f.diaryId, dk: f.dk, clock: f.clock });
  closers.push(a.close, b.close);
  const k1 = keyBetween(null, null);
  const k2 = keyBetween(k1, null);
  const k3 = keyBetween(k2, null);
  const pain: BlockDef = { id: f.newId(), type: 'slider', label: 'Schmerz', required: false, order: k1, config: { min: 0, max: 10, step: 1 } };
  const sleep: BlockDef = { id: f.newId(), type: 'slider', label: 'Schlaf', required: false, order: k2, config: { min: 0, max: 10, step: 1 } };
  const note: BlockDef = { id: f.newId(), type: 'text', label: 'Notiz', required: false, order: k3, config: {} };
  const tpl = createTemplate({ id: f.newId(), diaryId: f.diaryId, name: 'T', order: 'V', blocks: [pain, sleep, note] }, f.clock);
  const now = new Date(f.clock.now()).toISOString();
  const entry: Entry = {
    id: f.newId(), diaryId: f.diaryId, templateId: tpl.template.id, templateVersion: 1, occurredAt: now, recordedAt: now, updatedAt: now,
    authorId: 'alice', values: { [pain.id]: 3, [sleep.id]: 5, [note.id]: 'start' }, tags: [], meta: { source: 'app', timezone: 'Europe/Berlin' },
    hlc: '1700000000000:0000:devA',
  };
  // Ausgangsstand auf beiden Geräten
  await a.repo.saveTemplate(tpl);
  await a.repo.saveEntry(entry);
  await a.engine.sync();
  await b.engine.sync();
  return { ...f, server, a, b, tpl, entry, pain, sleep, note };
}

describe('Sync-Engine: Konflikte', () => {
  it('SYN-04 SYN-05: konkurrierende Offline-Bearbeitung auf zwei Geräten konvergiert (disjunkt übernommen, gleicher Block per HLC)', async () => {
    const { a, b, entry, pain, sleep, note } = await setup();
    // Gerät A: Schmerz + Notiz ändern (älterer HLC)
    await a.repo.saveEntry({ ...entry, values: { ...entry.values, [pain.id]: 7, [note.id]: 'von A' }, tags: ['A'], hlc: '1700000001000:0000:devA' });
    // Gerät B: Schlaf + Notiz ändern (neuerer HLC)
    await b.repo.saveEntry({ ...entry, values: { ...entry.values, [sleep.id]: 2, [note.id]: 'von B' }, tags: ['B'], hlc: '1700000002000:0000:devB' });

    await a.engine.sync(); // A zuerst → Server hat A-Stand
    const summary = await b.engine.pushDiary(entry.diaryId); // B → Konflikt → Merge → erneuter Push
    expect(summary.resolved).toBe(1);
    expect(summary.unresolved).toEqual([]);
    await b.engine.sync();
    await a.engine.sync();

    const ea = await a.repo.getEntry(entry.id);
    const eb = await b.repo.getEntry(entry.id);
    expect(ea).toEqual(eb);
    expect(ea?.values).toEqual({ [pain.id]: 7, [sleep.id]: 2, [note.id]: 'von B' });
    expect(ea?.tags).toEqual(['A', 'B']);
    expect(await a.db.outbox.count()).toBe(0);
    expect(await b.db.outbox.count()).toBe(0);

    // Verlierer steht im (lokalen, nicht synchronisierten) ConflictLog von B
    const logs = await b.records.list(entry.diaryId, 'conflictLog');
    expect(logs).toHaveLength(1);
    expect(logs[0]?.payload).toMatchObject({ recordId: entry.id, kind: 'entry', seenByUser: false, losingPayload: { field: `values.${note.id}`, losingValue: 'von A' } });
    expect(await a.records.list(entry.diaryId, 'conflictLog')).toEqual([]);
  });

  it('SYN-05: Bearbeitung gegen ältere Löschung — Bearbeitung mit höherem HLC gewinnt auf beiden Geräten', async () => {
    const { a, b, entry, pain } = await setup();
    await a.records.remove(entry.id); // Löschung mit dem alten HLC
    await b.repo.saveEntry({ ...entry, values: { ...entry.values, [pain.id]: 9 }, hlc: '1700000005000:0000:devB' });
    await a.engine.sync();
    await b.engine.sync();
    await a.engine.sync();
    expect((await a.repo.getEntry(entry.id))?.values[pain.id]).toBe(9);
    expect((await b.repo.getEntry(entry.id))?.values[pain.id]).toBe(9);
  });

  it('SYN-05: gleiche Änderung auf beiden Geräten ist kein Konflikt — Serverstand wird übernommen, kein erneuter Push', async () => {
    const { a, b, entry, pain } = await setup();
    const same = { ...entry, values: { ...entry.values, [pain.id]: 6 }, hlc: '1700000003000:0000:devA' };
    await a.repo.saveEntry(same);
    await b.repo.saveEntry(same);
    await a.engine.sync();
    const pushesBefore = b.wire.pushes.length;
    const s = await b.engine.pushDiary(entry.diaryId);
    expect(s.resolved).toBe(1);
    expect(b.wire.pushes.length - pushesBefore).toBe(1); // nur der erste Versuch
    expect(await b.db.outbox.count()).toBe(0);
    expect(await b.records.list(entry.diaryId, 'conflictLog')).toEqual([]);
  });

  it('SYN-05: Vorlagen-Konflikt — Felder einzeln, currentVersion = Maximum', async () => {
    const { a, b, tpl } = await setup();
    await a.repo.saveTemplate({ ...tpl, template: { ...tpl.template, name: 'Name von A', updatedAt: '2026-06-01T10:00:00.000Z' } });
    await b.repo.saveTemplate({ ...tpl, template: { ...tpl.template, icon: 'brain', updatedAt: '2026-06-01T11:00:00.000Z' } });
    await a.engine.sync();
    await b.engine.sync();
    await a.engine.sync();
    const ta = (await a.repo.getTemplate(tpl.template.id))?.template;
    expect(ta).toMatchObject({ name: 'Name von A', icon: 'brain' });
    expect((await b.repo.getTemplate(tpl.template.id))?.template).toEqual(ta);
  });
});
