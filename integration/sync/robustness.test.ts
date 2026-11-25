// Regressionstests zu den Review-Befunden M4–M6 (Sync-Engine).
import { describe, it, expect, afterEach } from 'vitest';
import { compareHlc, createTemplate, keyBetween, type BlockDef, type Entry } from '@stb/core';
import { QUARANTINE_KIND } from '../../apps/web/src/sync/engine.js';
import { createDevice, fixture, startServer } from './harness.js';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0).reverse()) await c();
});

async function setup(opts: { diaryIds?: string[] } = {}) {
  const f = await fixture();
  const server = await startServer(f.diaryId);
  closers.push(server.close);
  const a = await createDevice({ app: server.app, user: 'alice', diaryId: f.diaryId, dk: f.dk, clock: f.clock });
  const b = await createDevice({ app: server.app, user: 'alice', diaryId: f.diaryId, dk: f.dk, clock: f.clock, ...opts });
  closers.push(a.close, b.close);
  const pain: BlockDef = { id: f.newId(), type: 'slider', label: 'Schmerz', required: false, order: keyBetween(null, null), config: { min: 0, max: 10, step: 1 } };
  const note: BlockDef = { id: f.newId(), type: 'text', label: 'Notiz', required: false, order: keyBetween(pain.order, null), config: {} };
  const tpl = createTemplate({ id: f.newId(), diaryId: f.diaryId, name: 'T', order: 'V', blocks: [pain, note] }, f.clock);
  const now = new Date(f.clock.now()).toISOString();
  const entry: Entry = {
    id: f.newId(), diaryId: f.diaryId, templateId: tpl.template.id, templateVersion: 1, occurredAt: now, recordedAt: now, updatedAt: now,
    authorId: 'alice', values: { [pain.id]: 3, [note.id]: 'start' }, tags: [], meta: { source: 'app', timezone: 'Europe/Berlin' }, hlc: a.hlc.tick(),
  };
  await a.repo.saveTemplate(tpl);
  await a.repo.saveEntry(entry);
  await a.engine.sync();
  await b.engine.sync();
  return { ...f, server, a, b, tpl, entry, pain, note };
}

describe('Sync-Engine: Robustheit (Review M4–M6)', () => {
  it('SYN-05: Änderung während der Konfliktauflösung wird nicht überschrieben und landet beim Server', async () => {
    const { a, b, entry, pain, note } = await setup();
    await a.repo.saveEntry({ ...entry, values: { ...entry.values, [pain.id]: 7 }, hlc: a.hlc.tick() });
    await a.engine.sync();
    await b.repo.saveEntry({ ...entry, values: { ...entry.values, [note.id]: 'B vorher' }, hlc: b.hlc.tick() });

    // Während B den Konflikt auflöst (Schlüsselabruf beim Entschlüsseln), bearbeitet der Nutzer den Eintrag erneut.
    let edited = false;
    b.wire.onKeyGet = async () => {
      if (edited || (await b.db.outbox.count()) === 0) return;
      const current = (await b.repo.getEntry(entry.id))!;
      if (!(await b.db.records.get(entry.id))?.rev) return;
      edited = true;
      await b.repo.saveEntry({ ...current, values: { ...current.values, [note.id]: 'B während Merge' }, hlc: b.hlc.tick() });
    };
    await b.engine.sync();
    b.wire.onKeyGet = undefined;
    await b.engine.sync();
    await a.engine.sync();
    expect(edited).toBe(true);
    const ea = await a.repo.getEntry(entry.id);
    expect(ea?.values[note.id]).toBe('B während Merge');
    expect(ea?.values[pain.id]).toBe(7);
    expect(await b.repo.getEntry(entry.id)).toEqual(ea);
  });

  it('SYN-05: zusammengeführtes Ergebnis bekommt einen neuen HLC über beiden Seiten; Pull aktualisiert die lokale HLC', async () => {
    const { a, b, entry, pain, note } = await setup();
    const fromA = a.hlc.tick();
    await a.repo.saveEntry({ ...entry, values: { ...entry.values, [pain.id]: 8 }, hlc: fromA });
    await a.engine.sync();
    const fromB = '1600000000000:0000:devSlow'; // Gerät mit nachgehender Uhr
    await b.repo.saveEntry({ ...entry, values: { ...entry.values, [note.id]: 'B' }, hlc: fromB });
    await b.engine.sync();
    const merged = (await b.repo.getEntry(entry.id))!;
    expect(compareHlc(merged.hlc, fromA)).toBeGreaterThan(0);
    expect(compareHlc(merged.hlc, fromB)).toBeGreaterThan(0);
    // Nach dem Pull liegt jeder neue lokale Stempel über allem Empfangenen
    await a.engine.sync();
    expect(compareHlc(a.hlc.tick(), merged.hlc)).toBeGreaterThan(0);
  });

  it('SYN-05: spätere Löschung (frischer HLC) gewinnt gegen frühere Bearbeitung', async () => {
    const { a, b, entry, pain } = await setup();
    await a.repo.saveEntry({ ...entry, values: { ...entry.values, [pain.id]: 9 }, hlc: a.hlc.tick() });
    await a.engine.sync();
    await b.repo.deleteEntry(entry.id, { hlc: b.hlc.tick(), updatedAt: new Date().toISOString() });
    await b.engine.sync();
    await a.engine.sync();
    expect(await a.repo.getEntry(entry.id)).toBeUndefined();
    expect(await b.repo.getEntry(entry.id)).toBeUndefined();
  });

  it('SYN-08: nicht entschlüsselbarer Record blockiert den Pull nicht — Quarantäne, Cursor läuft weiter', async () => {
    const { a, b, server, diaryId, newId } = await setup();
    const maxSeq = (server.db.prepare('SELECT MAX(seq) AS s FROM records').get() as { s: number }).s;
    server.db.prepare('UPDATE sync_counter SET seq = ?').run(maxSeq + 1);
    server.db.prepare("INSERT INTO records (id, diary_id, kind, rev, seq, deleted, ciphertext, size, updated_at) VALUES ('kaputt', ?, 'entry', 1, ?, 0, 'AQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 10, 0)").run(diaryId, maxSeq + 1);
    const later = newId();
    await a.records.put({ id: later, diaryId, kind: 'entry', payload: { danach: true } });
    await a.engine.sync();

    await b.engine.sync();
    expect((await b.records.get(later))?.payload).toEqual({ danach: true });
    expect((await b.db.sync_state.get(diaryId))?.cursor).toBe(maxSeq + 2);
    const q = await b.records.list(diaryId, QUARANTINE_KIND);
    expect(q).toHaveLength(1);
    expect(q[0]?.payload).toMatchObject({ recordId: 'kaputt', kind: 'entry' });
  });

  it('SYN-08: Fehler in einem Tagebuch hält die anderen nicht auf', async () => {
    const f = await fixture();
    const server = await startServer(f.diaryId);
    closers.push(server.close);
    const removed = f.newId(); // Tagebuch ohne Mitgliedschaft → Server antwortet 403
    const d = await createDevice({ app: server.app, user: 'alice', diaryId: f.diaryId, dk: f.dk, clock: f.clock, diaryIds: [removed, f.diaryId] });
    closers.push(d.close);
    await d.records.put({ id: f.newId(), diaryId: f.diaryId, kind: 'entry', payload: { v: 1 } });
    await expect(d.engine.sync()).rejects.toThrow();
    expect(await d.db.outbox.count()).toBe(0);
    expect(server.db.prepare('SELECT COUNT(*) AS n FROM records WHERE diary_id = ?').get(f.diaryId)).toEqual({ n: 1 });
  });

  it('SYN-12: Wechsel auf local-only während eines laufenden Pulls wird nicht überschrieben', async () => {
    const { a, b, diaryId, newId } = await setup();
    await a.records.put({ id: newId(), diaryId, kind: 'entry', payload: { neu: true } });
    await a.engine.sync();
    b.wire.beforePull = async () => {
      await b.db.sync_state.put({ diaryId, cursor: (await b.db.sync_state.get(diaryId))?.cursor ?? 0, mode: 'local-only' });
    };
    await b.engine.pullDiary(diaryId);
    expect((await b.db.sync_state.get(diaryId))?.mode).toBe('local-only');
  });
});
