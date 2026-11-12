import { describe, it, expect, afterEach } from 'vitest';
import { createHlcClock, instantiateCatalogTemplate, type BlockDef } from '@stb/core';
import { TEST_AUTH_HEADER } from '../../apps/server/src/auth/test-auth.js';
import { setupIntake } from '../../apps/web/src/intake/setup.js';
import { pickupIntake, type IntakeItemsApi, type IntakeInboxItem } from '../../apps/web/src/intake/pickup.js';
import { createDevice, fixture, startServer } from '../sync/harness.js';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0).reverse()) await c();
});

async function setup() {
  const f = await fixture();
  const server = await startServer(f.diaryId, ['olga']);
  closers.push(server.close);
  const d = await createDevice({ app: server.app, user: 'olga', diaryId: f.diaryId, dk: f.dk, clock: f.clock });
  closers.push(d.close);
  const as = { [TEST_AUTH_HEADER]: 'olga' };
  const tpl = instantiateCatalogTemplate('migraine', { id: f.newId(), diaryId: f.diaryId, order: 'V', newId: f.newId }, f.clock);
  await d.repo.saveTemplate(tpl);
  const { token } = await setupIntake({
    diaryId: f.diaryId, records: d.records, newId: f.newId, now: f.clock.now,
    api: { register: async (diaryId, body) => (await server.app.inject({ method: 'POST', url: `/api/v1/diaries/${diaryId}/intake-keys`, headers: as, payload: body })).json() },
  });
  const api: IntakeItemsApi = {
    list: async (diaryId) => (await server.app.inject({ method: 'GET', url: `/api/v1/diaries/${diaryId}/intake-items`, headers: as })).json(),
    async ack(id) {
      const r = await server.app.inject({ method: 'DELETE', url: `/api/v1/intake-items/${id}`, headers: as });
      if (r.statusCode !== 204) throw new Error(`ack ${r.statusCode}`);
    },
  };
  const shortcut = (body: unknown) =>
    server.app.inject({ method: 'POST', url: `/api/v1/intake/${f.diaryId}`, headers: { authorization: `Bearer ${token}` }, payload: body as object });
  const hlc = createHlcClock(f.clock, 'devA');
  const pickup = () => pickupIntake({
    api, records: d.records, diary: d.repo, diaryId: f.diaryId, defaultTemplateId: tpl.template.id, authorId: 'olga',
    timezone: 'Europe/Berlin', newId: f.newId, now: f.clock.now, nextHlc: () => hlc.tick(),
  });
  const block = (label: string) => tpl.version.blocks.find((b) => b.label === label) as BlockDef;
  return { ...f, server, d, tpl, shortcut, pickup, block };
}

describe('Intake abholen', () => {
  it('VOI-05: App entsiegelt Items, legt Einträge mit source shortcut an und bestätigt die Abholung; Item ist danach serverseitig gelöscht', async () => {
    const { server, d, diaryId, shortcut, pickup, block } = await setup();
    expect((await shortcut({ occurredAt: '2026-03-01T08:15:00+01:00', text: 'nach dem Aufstehen', values: { Schmerzstärke: 6, begleitsymptome: ['Übelkeit'] } })).statusCode).toBe(202);
    expect(server.db.prepare('SELECT COUNT(*) AS n FROM intake_items').get()).toEqual({ n: 1 });

    const r = await pickup();
    expect(r.entries).toHaveLength(1);
    expect(r.inbox).toEqual([]);
    expect(server.db.prepare('SELECT COUNT(*) AS n FROM intake_items').get()).toEqual({ n: 0 });

    const entry = await d.repo.getEntry(r.entries[0]!);
    expect(entry?.meta.source).toBe('shortcut');
    expect(entry?.occurredAt).toBe('2026-03-01T08:15:00+01:00');
    expect(entry?.values[block('Schmerzstärke').id]).toBe(6);
    expect(entry?.values[block('Notizen').id]).toEqual({ text: 'nach dem Aufstehen' });
    const sym = block('Begleitsymptome');
    expect(entry?.values[sym.id]).toEqual(sym.type === 'multiselect' ? [sym.config.options.find((o) => o.label === 'Übelkeit')!.id] : []);
    expect((await d.repo.listEntries(diaryId)).map((e) => e.id)).toEqual(r.entries);
  });

  it('VOI-05: ohne occurredAt gilt die Empfangszeit; wiederholtes Abholen erzeugt keine Duplikate', async () => {
    const { d, diaryId, shortcut, pickup } = await setup();
    await shortcut({ values: { Schmerzstärke: 3 } });
    const first = await pickup();
    const second = await pickup();
    expect(first.entries).toHaveLength(1);
    expect(second.entries).toEqual([]);
    expect(await d.repo.listEntries(diaryId)).toHaveLength(1);
  });

  it('VOI-07: ungültige Werte erzeugen ein Item im Eingang statt eines Eintrags; nichts geht verloren', async () => {
    const { server, d, diaryId, shortcut, pickup } = await setup();
    const body = { text: 'STB-PLAINTEXT-MARKER-I', values: { Schmerzstärke: 12, Begleitsymptome: ['Zahnweh'] } };
    await shortcut(body);
    const r = await pickup();
    expect(r.entries).toEqual([]);
    expect(r.inbox).toHaveLength(1);
    expect(await d.repo.listEntries(diaryId)).toEqual([]);
    const inbox = (await d.records.list(diaryId, 'intakeInbox')).map((x) => x.payload as IntakeInboxItem);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.body).toEqual(body);
    expect(inbox[0]?.problems.length).toBe(2);
    // Server-Item ist abgeholt; der Eingang wird (verschlüsselt) synchronisiert
    expect(server.db.prepare('SELECT COUNT(*) AS n FROM intake_items').get()).toEqual({ n: 0 });
    await d.engine.sync();
    const serverRecords = JSON.stringify(server.db.prepare("SELECT * FROM records WHERE kind = 'intakeInbox'").all());
    expect(serverRecords).toContain('intakeInbox');
    expect(serverRecords).not.toContain('STB-PLAINTEXT-MARKER');
  });

  it('VOI-07: unbekannte Vorlage → Eingang, nichts verloren', async () => {
    const { d, diaryId, shortcut, pickup, newId } = await setup();
    await shortcut({ templateId: newId(), values: { Schmerzstärke: 2 } });
    const r = await pickup();
    expect(r.inbox).toHaveLength(1);
    expect(((await d.records.list(diaryId, 'intakeInbox'))[0]?.payload as IntakeInboxItem).problems[0]).toMatch(/Vorlage .* nicht gefunden/);
  });
});
