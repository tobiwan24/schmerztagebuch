import { describe, it, expect, afterEach } from 'vitest';
import { createTemplate, entrySchemaFor, keyBetween, updateTemplate, type BlockDef, type Entry } from '@stb/core';
import { createDevice, fixture, startServer } from './harness.js';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0).reverse()) await c();
});

describe('Sync-Engine: kollidierende Vorlagenversion', () => {
  it('SYN-18: zwei Geräte legen offline Version n+1 an und tragen damit ein — n+1 und n+2, keine hängende Op, gleicher Stand', async () => {
    const f = await fixture();
    const server = await startServer(f.diaryId);
    closers.push(server.close);
    const a = await createDevice({ app: server.app, user: 'alice', diaryId: f.diaryId, dk: f.dk, clock: f.clock });
    const b = await createDevice({ app: server.app, user: 'alice', diaryId: f.diaryId, dk: f.dk, clock: f.clock });
    closers.push(a.close, b.close);

    const pain: BlockDef = { id: f.newId(), type: 'slider', label: 'Schmerz', required: false, order: keyBetween(null, null), config: { min: 0, max: 10, step: 1 } };
    const tpl = createTemplate({ id: f.newId(), diaryId: f.diaryId, name: 'T', order: 'V', blocks: [pain] }, f.clock);
    await a.repo.saveTemplate(tpl);
    await a.engine.sync();
    await b.engine.sync();

    const mkEntry = (state: { template: { id: string }; version: { version: number } }, values: Record<string, unknown>, hlc: string): Entry => {
      const now = new Date(f.clock.now()).toISOString();
      return {
        id: f.newId(), diaryId: f.diaryId, templateId: state.template.id, templateVersion: state.version.version, occurredAt: now, recordedAt: now,
        updatedAt: now, authorId: 'alice', values, tags: [], meta: { source: 'app', timezone: 'Europe/Berlin' }, hlc,
      };
    };
    const blockA: BlockDef = { id: f.newId(), type: 'text', label: 'Notiz A', required: false, order: keyBetween(pain.order, null), config: {} };
    const blockB: BlockDef = { id: f.newId(), type: 'text', label: 'Notiz B', required: false, order: keyBetween(pain.order, null), config: {} };
    const vA = updateTemplate(tpl, { blocks: [pain, blockA] }, f.clock, [tpl.version]);
    const vB = updateTemplate(tpl, { blocks: [pain, blockB] }, f.clock, [tpl.version]);
    expect(vA.state.version.version).toBe(2);
    expect(vB.state.version.version).toBe(2);
    await a.repo.saveTemplate(vA.state);
    await b.repo.saveTemplate(vB.state);
    const entryA = mkEntry(vA.state, { [pain.id]: 3, [blockA.id]: 'von A' }, '1700000001000:0000:devA');
    const entryB = mkEntry(vB.state, { [pain.id]: 8, [blockB.id]: 'von B' }, '1700000002000:0000:devB');
    await a.repo.saveEntry(entryA);
    await b.repo.saveEntry(entryB);

    await a.engine.sync(); // erstes Gerät: n+1 = 2
    await b.engine.sync(); // zweites Gerät: Kollision → n+2 = 3
    await a.engine.sync();
    await b.engine.sync();

    for (const d of [a, b]) {
      expect(await d.db.outbox.toArray(), 'keine hängende Op').toEqual([]);
      const versions = (await d.repo.listAllTemplateVersions()).filter((v) => v.templateId === tpl.template.id).sort((x, y) => x.version - y.version);
      expect(versions.map((v) => v.version)).toEqual([1, 2, 3]);
      expect(versions[1]!.blocks.map((x) => x.id).sort()).toEqual([pain.id, blockA.id].sort());
      expect(versions[2]!.blocks.map((x) => x.id).sort()).toEqual([pain.id, blockB.id].sort());
      expect((await d.repo.getTemplate(tpl.template.id))?.template.currentVersion).toBe(3);
      const entries = await d.repo.listEntries(f.diaryId);
      expect(entries.map((e) => [e.id, e.templateVersion]).sort()).toEqual([[entryA.id, 2], [entryB.id, 3]].sort());
      for (const e of entries) expect(() => entrySchemaFor(versions.find((v) => v.version === e.templateVersion)!).parse(e)).not.toThrow();
      expect(entries.find((e) => e.id === entryB.id)?.values).toEqual(entryB.values);
    }
    // Server-Seite: keine Quarantäne, beide Geräte gleicher Stand
    expect(await a.records.listKind('syncQuarantine')).toEqual([]);
    expect((await a.repo.listAllEntries()).map((e) => e.id).sort()).toEqual((await b.repo.listAllEntries()).map((e) => e.id).sort());
  });
});
