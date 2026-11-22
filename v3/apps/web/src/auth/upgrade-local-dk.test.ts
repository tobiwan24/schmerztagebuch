import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openIdentityKey, unwrapDkForMember } from '@stb/crypto';
import { StbDb } from '../data/db.js';
import { createCryptoSession } from '../data/crypto-session.js';
import { createDiaryAesCodec } from '../data/codec/aes.js';
import { plainCodec } from '../data/codec/plain.js';
import { createCodecRegistry } from '../data/codec/registry.js';
import { createRecordRepository } from '../data/repositories/records.js';
import { createLocalAccount } from './local-account.js';
import { decodeDkWrap, type AccountApi } from './account-api.js';
import { prepareUpgradeToCloud } from './cloud-account.js';

const MARKER = 'STB-PLAINTEXT-MARKER-A125';
let db: StbDb;
let n = 0;
beforeEach(async () => {
  db = new StbDb(`stb-v3-upgrade-dk-${++n}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

describe('Wechsel „nur dieses Gerät“ → Konto mit lokaler Verschlüsselung', () => {
  it('A-125: der hochgeladene DK ist der abgeleitete lokale DK — lokal verschlüsselte Records bleiben lesbar', async () => {
    const now = () => 1_700_000_000_000;
    const { umk } = await createLocalAccount(db, { factor: { kind: 'password', password: 'geheim lang genug' }, now });
    const session = createCryptoSession(db, { now });
    session.unlock(umk);
    const registry = createCodecRegistry([plainCodec, createDiaryAesCodec(session.keys)]);
    const repo = createRecordRepository(db, { registry, writeCodec: 'aes', clock: { now }, outbox: false });
    await repo.put({ id: 'd1', diaryId: 'd1', kind: 'diary', payload: { id: 'd1', name: 'Tagebuch' } });
    await repo.put({ id: 'e1', diaryId: 'd1', kind: 'entry', payload: { id: 'e1', note: MARKER } });
    expect(JSON.stringify(await db.records.toArray())).not.toContain(MARKER);

    const uploaded: { diaryId: string; wrappedDk: string }[] = [];
    const api = {
      registerVerify: async () => ({ userId: 'u-cloud', deviceId: 'dev-1' }),
      createDiary: async (b: { diaryId: string; wrappedDk: string }) => void uploaded.push(b),
    } as unknown as AccountApi;
    const pending = await prepareUpgradeToCloud(db, api, {
      challengeId: 'c', username: 'tester', credential: { id: 'cred-1' } as never, prf: new Uint8Array(32).fill(7), umk, now,
    });
    await pending.commit();

    // Der Server bekommt den DK verpackt für die eigene Identity; entpackt ist es genau der lokale DK.
    expect(uploaded.map((u) => u.diaryId)).toEqual(['d1']);
    const identity = await openIdentityKey(umk, pending.account.cloud.identityPublicKey, pending.account.cloud.identitySealed);
    const dk = await unwrapDkForMember(decodeDkWrap(uploaded[0]!.wrappedDk), identity, { diaryId: 'd1', keyEpoch: 1 });
    const raw = async (k: CryptoKey) => new Uint8Array(await crypto.subtle.exportKey('raw', k));
    expect(await raw(dk)).toEqual(await raw((await session.keys.get('d1')).key));

    // Nach dem Wechsel (Konto-DK in der Sitzung) liest dasselbe Repository die aes-Records weiter.
    session.setDiaryKey('d1', dk, 1);
    expect((await repo.get('e1'))?.payload).toMatchObject({ note: MARKER });
    expect((await db.records.get('e1'))?.codec).toBe('aes');
    // Der Erst-Push liegt in der Outbox (Records bleiben unverändert aes).
    expect((await db.outbox.toArray()).map((o) => o.recordId).sort()).toEqual(['d1', 'e1']);
  });
});
