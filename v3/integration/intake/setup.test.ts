import { describe, it, expect, afterEach } from 'vitest';
import { TEST_AUTH_HEADER } from '../../apps/server/src/auth/test-auth.js';
import { setupIntake } from '../../apps/web/src/intake/setup.js';
import { createDevice, fixture, startServer } from '../sync/harness.js';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0).reverse()) await c();
});

describe('Intake einrichten', () => {
  it('VOI-01: erzeugt Schlüsselpaar; privater Schlüssel liegt nur verschlüsselt im Record, Server kennt nur Public Key + Token-Hash', async () => {
    const f = await fixture();
    const server = await startServer(f.diaryId, ['olga']);
    closers.push(server.close);
    const d = await createDevice({ app: server.app, user: 'olga', diaryId: f.diaryId, dk: f.dk, clock: f.clock });
    closers.push(d.close);

    const { token, record } = await setupIntake({
      diaryId: f.diaryId, records: d.records, newId: f.newId, now: f.clock.now,
      api: {
        async register(diaryId, body) {
          const r = await server.app.inject({ method: 'POST', url: `/api/v1/diaries/${diaryId}/intake-keys`, headers: { [TEST_AUTH_HEADER]: 'olga' }, payload: body });
          if (r.statusCode !== 201) throw new Error(`register ${r.statusCode}`);
          return r.json();
        },
      },
    });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(record.privateKeyJwk.d).toBeTruthy();

    // Server: nur Public Key + Token-Hash, weder Token noch privater Schlüssel
    const keyRow = server.db.prepare('SELECT * FROM intake_keys').get() as Record<string, unknown>;
    expect(keyRow.public_key).toBe(record.publicKey);
    expect(keyRow.token_hash).not.toBe(token);
    expect(JSON.stringify(keyRow)).not.toContain(token);
    expect(JSON.stringify(keyRow)).not.toContain(String(record.privateKeyJwk.d));

    // Record wird synchronisiert — beim Server nur als Chiffretext
    expect((await d.records.list(f.diaryId, 'intakeKey'))[0]?.payload).toEqual(record);
    await d.engine.sync();
    const serverRecords = JSON.stringify(server.db.prepare('SELECT * FROM records').all());
    expect(serverRecords).toContain('intakeKey');
    expect(serverRecords).not.toContain(String(record.privateKeyJwk.d));
    expect(serverRecords).not.toContain('privateKeyJwk');

    // Token funktioniert am Intake-Endpunkt
    const r = await server.app.inject({ method: 'POST', url: `/api/v1/intake/${f.diaryId}`, headers: { authorization: `Bearer ${token}` }, payload: { text: 'Kopfweh' } });
    expect(r.statusCode).toBe(202);
  });
});
