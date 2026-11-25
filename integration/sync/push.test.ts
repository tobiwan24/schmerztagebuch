import { describe, it, expect, afterEach } from 'vitest';
import { createTemplate, keyBetween, type BlockDef, type Entry, type TemplateState } from '@stb/core';
import { decryptRecord } from '@stb/crypto';
import { createDevice, fixture, startServer } from './harness.js';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0).reverse()) await c();
});

async function setup() {
  const f = await fixture();
  const server = await startServer(f.diaryId);
  closers.push(server.close);
  const device = await createDevice({ app: server.app, user: 'alice', diaryId: f.diaryId, dk: f.dk, clock: f.clock });
  closers.push(device.close);
  const pain: BlockDef = { id: f.newId(), type: 'slider', label: 'Schmerz', required: true, order: keyBetween(null, null), config: { min: 0, max: 10, step: 1 } };
  const note: BlockDef = { id: f.newId(), type: 'text', label: 'Notiz', required: false, order: keyBetween(pain.order, null), config: {} };
  const tpl = createTemplate({ id: f.newId(), diaryId: f.diaryId, name: 'STB-PLAINTEXT-MARKER-T', order: 'V', blocks: [pain, note] }, f.clock);
  const entry = (state: TemplateState, marker: string): Entry => {
    const now = new Date(f.clock.now()).toISOString();
    return {
      id: f.newId(), diaryId: f.diaryId, templateId: state.template.id, templateVersion: 1,
      occurredAt: now, recordedAt: now, updatedAt: now, authorId: 'alice',
      values: { [pain.id]: 5, [note.id]: marker }, tags: [marker], meta: { source: 'app', timezone: 'Europe/Berlin' },
      hlc: '1700000000000:0000:devA',
    };
  };
  return { ...f, server, device, tpl, entry };
}

describe('Sync-Engine: Push', () => {
  it('DM-13: ein Push-Lauf sendet nur Chiffretext — kein Klartext-Marker im Request-Body', async () => {
    const { device, tpl, entry } = await setup();
    await device.repo.saveTemplate(tpl);
    await device.repo.saveEntry(entry(tpl, 'STB-PLAINTEXT-MARKER-1'));
    await device.engine.sync();
    expect(device.wire.pushes.length).toBeGreaterThan(0);
    const body = JSON.stringify(device.wire.pushes);
    expect(body).not.toContain('STB-PLAINTEXT-MARKER');
    expect(body).not.toContain('Schmerz');
  });

  it('DM-13: Server speichert nur Chiffretext; mit dem DK und der AAD des Records lässt er sich öffnen', async () => {
    const { device, server, tpl, entry, dk, diaryId } = await setup();
    await device.repo.saveTemplate(tpl);
    const e = entry(tpl, 'STB-PLAINTEXT-MARKER-2');
    await device.repo.saveEntry(e);
    await device.engine.sync();
    const rows = server.db.prepare('SELECT id, kind, rev, ciphertext FROM records ORDER BY seq').all() as { id: string; kind: string; rev: number; ciphertext: string }[];
    expect(JSON.stringify(rows)).not.toContain('STB-PLAINTEXT-MARKER');
    // Vorlagen vor Einträgen
    expect(rows.map((r) => r.kind)).toEqual(['template', 'templateVersion', 'entry']);
    const row = rows.find((r) => r.id === e.id)!;
    const plain = await decryptRecord(dk, { diaryId, kind: 'entry', recordId: e.id, keyEpoch: 1 }, row.ciphertext);
    expect(JSON.parse(new TextDecoder().decode(plain))).toEqual(e);
  });

  it('DM-13: nach erfolgreichem Push ist die Outbox leer, rev und base sind gesetzt', async () => {
    const { device, tpl, entry } = await setup();
    await device.repo.saveTemplate(tpl);
    const e = entry(tpl, 'x');
    await device.repo.saveEntry(e);
    await device.engine.sync();
    expect(await device.db.outbox.count()).toBe(0);
    const rec = await device.db.records.get(e.id);
    expect(rec?.rev).toBe(1);
    expect(rec?.base).toEqual(rec?.payload);
    // erneute Änderung → Op mit baseRev 1 → Server nimmt sie an (rev 2)
    await device.repo.saveEntry({ ...e, values: { ...e.values }, tags: ['geändert'] });
    expect((await device.db.outbox.toArray())[0]?.baseRev).toBe(1);
    await device.engine.sync();
    expect((await device.db.records.get(e.id))?.rev).toBe(2);
  });

  it('SYN-01: offline erstellter Eintrag landet in der Outbox und wird nach `online` automatisch gepusht', async () => {
    const { device, server, tpl, entry } = await setup();
    const events = new EventTarget();
    closers.push(async () => detach());
    const detach = device.engine.attachTriggers(events);

    device.wire.offline = true;
    await device.repo.saveTemplate(tpl);
    const e = entry(tpl, 'offline');
    await device.repo.saveEntry(e);
    await expect(device.engine.sync()).rejects.toThrow();
    expect(await device.db.outbox.count()).toBe(3);
    expect(server.db.prepare('SELECT COUNT(*) AS n FROM records').get()).toEqual({ n: 0 });

    device.wire.offline = false;
    events.dispatchEvent(new Event('online'));
    await device.engine.flight.trigger(); // wartet auf den durch `online` ausgelösten Lauf (+ ggf. Folgelauf)
    expect(await device.db.outbox.count()).toBe(0);
    expect((server.db.prepare('SELECT id FROM records WHERE kind = ?').all('entry') as { id: string }[]).map((r) => r.id)).toEqual([e.id]);
  });

  it('SYN-01: visibilitychange löst nur bei sichtbarer App einen Lauf aus', async () => {
    const { device, tpl } = await setup();
    const events = new EventTarget();
    let visible = false;
    const detach = device.engine.attachTriggers(events, () => visible);
    closers.push(async () => detach());
    await device.repo.saveTemplate(tpl);
    events.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 20));
    expect(device.wire.pushes).toHaveLength(0);
    visible = true;
    events.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 20));
    await device.engine.flight.trigger();
    expect(device.wire.pushes.length).toBeGreaterThan(0);
  });
});
