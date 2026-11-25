import { describe, it, expect, afterEach } from 'vitest';
import { createDiary, instantiateCatalogTemplate } from '@stb/core';
import { TEST_AUTH_HEADER } from '../../apps/server/src/auth/test-auth.js';
import { setupIntake, type IntakeKeyRecord } from '../../apps/web/src/intake/setup.js';
import { syncManifests, type ManifestApi } from '../../apps/web/src/intake/manifest.js';
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
  await d.repo.createDiary(createDiary({ id: f.diaryId, name: 'Testtagebuch', subject: 'human', timezone: 'Europe/Berlin' }, f.clock));
  await d.repo.saveTemplate(tpl);
  const { token } = await setupIntake({
    diaryId: f.diaryId, records: d.records, createdBy: 'olga', newId: f.newId, now: f.clock.now,
    api: { register: async (diaryId, body) => (await server.app.inject({ method: 'POST', url: `/api/v1/diaries/${diaryId}/intake-keys`, headers: as, payload: body })).json() },
  });
  let uploads = 0;
  const api: ManifestApi = {
    async uploadManifest(diaryId, keyId, seal) {
      uploads++;
      const r = await server.app.inject({ method: 'PUT', url: `/api/v1/diaries/${diaryId}/intake-keys/${keyId}/manifest`, headers: as, payload: { seal } });
      if (r.statusCode !== 204) throw new Error(`upload ${r.statusCode}`);
    },
  };
  const sync = () => syncManifests({ api, records: d.records, diary: d.repo, diaryId: f.diaryId });
  const get = () => server.app.inject({ method: 'GET', url: `/api/v1/intake/${f.diaryId}/manifest`, headers: { authorization: `Bearer ${token}` } });
  return { ...f, server, d, tpl, token, sync, get, uploads: () => uploads };
}

describe('Manifest hochladen', () => {
  it('VOI-22: lädt nur bei geändertem Hash hoch (Einrichtung und Sync)', async () => {
    const { sync, get, uploads, d, diaryId, tpl } = await setup();
    expect((await get()).statusCode).toBe(404);
    expect(await sync()).toEqual({ uploaded: 1 });
    expect(uploads()).toBe(1);
    const first = (await get()).json() as { templates: { name: string }[] };
    expect(first.templates.map((t) => t.name)).toEqual([tpl.template.name]);
    // nichts geändert → kein Upload
    expect(await sync()).toEqual({ uploaded: 0 });
    expect(uploads()).toBe(1);
    // Hash steht im Record, das Token ebenfalls
    const rec = (await d.records.list(diaryId, 'intakeKey'))[0]!.payload as IntakeKeyRecord;
    expect(rec.manifestHash).toBeTruthy();
    expect(rec.token).toBeTruthy();
    // Vorlage umbenannt → genau ein weiterer Upload
    await d.repo.saveTemplateMeta({ ...tpl.template, name: 'Migräne neu' });
    expect(await sync()).toEqual({ uploaded: 1 });
    expect(uploads()).toBe(2);
    expect(((await get()).json() as { templates: { name: string }[] }).templates[0]!.name).toBe('Migräne neu');
    expect(await sync()).toEqual({ uploaded: 0 });
  });

  it('VOI-22: Schlüssel ohne Token (älterer Stand) werden übersprungen', async () => {
    const { sync, uploads, d, diaryId, server } = await setup();
    const rec = (await d.records.list(diaryId, 'intakeKey'))[0]!;
    const noToken = { ...(rec.payload as IntakeKeyRecord), token: undefined };
    await d.records.put({ id: rec.id, diaryId, kind: 'intakeKey', payload: noToken });
    expect(await sync()).toEqual({ uploaded: 0 });
    expect(uploads()).toBe(0);
    expect(server.db.prepare('SELECT manifest FROM intake_keys').get()).toEqual({ manifest: null });
  });

  it('VOI-22: Änderung der Vorlagenstruktur ändert den Hash, Sortierung der Aufrufe nicht', async () => {
    const { sync, d, diaryId } = await setup();
    await sync();
    const h1 = ((await d.records.list(diaryId, 'intakeKey'))[0]!.payload as IntakeKeyRecord).manifestHash;
    await sync();
    expect(((await d.records.list(diaryId, 'intakeKey'))[0]!.payload as IntakeKeyRecord).manifestHash).toBe(h1);
    await d.repo.saveDiary({ ...(await d.repo.getDiary(diaryId))!, name: 'Anderer Name' });
    await sync();
    expect(((await d.records.list(diaryId, 'intakeKey'))[0]!.payload as IntakeKeyRecord).manifestHash).not.toBe(h1);
  });
});
