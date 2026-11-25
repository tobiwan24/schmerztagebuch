// Quelle 2: v2-Server-Pull gegen einen Stub mit Fixture-Antworten (Spec 11, MIG-11). Login per v2-Backup-Code mit
// Werten, die der Original-v2-Code erzeugt hat (fixtures/v2/crypto-vectors.json).
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildV2Dump, transformV2, type V2Block } from '@stb/core';
import { readV2Snapshot, V2_DB_NAME } from '../../apps/web/src/migration/v2/source.js';
import { decodeV2Snapshot } from '../../apps/web/src/migration/v2/decode.js';
import { fromBase64, toBase64 } from '../../apps/web/src/migration/v2/crypto.js';
import { createV2Api, mergeV2, pullAllV2, v2LoginWithBackupCode, V2ServerError, type V2PullResult } from '../../apps/web/src/migration/v2/server.js';
import { createV2Database } from './v2-db.js';

const V = JSON.parse(readFileSync(new URL('../../fixtures/v2/crypto-vectors.json', import.meta.url), 'utf8')) as Record<string, string>;
const USER = 'v2-nutzer';

afterEach(async () => {
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(V2_DB_NAME);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
});

/** Verschlüsselt wie v2 `encryptWithKey` (iv|ct, Base64) mit dem DEK der Vektoren. */
async function encryptWithDek(plain: string): Promise<string> {
  const dek = await crypto.subtle.importKey('raw', fromBase64(V.dekRaw!), { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, new TextEncoder().encode(plain)));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return toBase64(out);
}

/** v2-Server-Stub: salt, recover (prüft den Verifier), pull; zählt schreibende Aufrufe (müssen 0 bleiben). */
function stubFetch(pullResult: V2PullResult) {
  const calls: { method: string; path: string }[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://v2.local');
    const method = init?.method ?? 'GET';
    calls.push({ method, path: url.pathname });
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/api/auth/salt') return url.searchParams.get('username') === USER ? json(200, { kdf_salt: V.kdfSalt }) : json(404, { error: 'not_found' });
    if (url.pathname === '/api/auth/recover') {
      const body = JSON.parse(String(init?.body)) as { username: string; authVerifier: string };
      return body.username === USER && body.authVerifier === V.backupAuthVerifier ? json(200, { wrapped_dek_backup: V.wrappedDekBackup }) : json(401, { error: 'invalid_credentials' });
    }
    if (url.pathname === '/api/sync/pull') return json(200, pullResult);
    return json(404, {});
  }) as typeof fetch;
  return { fetchFn, calls };
}

describe('v2-Server-Pull', () => {
  it('MIG-11: ergänzt lokal fehlende Einträge und wählt bei Doppelungen die neuere updatedAt', async () => {
    const dump = buildV2Dump();
    await createV2Database(dump);
    const local1 = dump.entries.find((e) => e.id === 1)!;
    const local2 = dump.entries.find((e) => e.id === 2)!;
    const blocksOf = (row: { data: string }) => JSON.parse(row.data) as V2Block[];
    const withNote = (blocks: V2Block[], note: string) => blocks.map((b) => (b.label === 'Ort' ? { ...b, value: note } : b));
    const onlyServerBlocks: V2Block[] = [
      { id: 'srv-date', type: 'date', label: 'Datum', isDeletable: false, value: JSON.stringify({ mode: 'single', startDate: '2026-04-01', time: '10:00' }) },
      { id: 'srv-text', type: 'text', label: 'Notiz', value: 'STB-V2-NUR-AUF-SERVER' },
    ];
    const server: V2PullResult = {
      templates: [{ syncId: 'srv-template', name: 'Nur auf dem Server', order: 9, icon: null, color: null, blocks: JSON.stringify(onlyServerBlocks.map((b) => ({ ...b, value: undefined }))), updatedAt: '2026-04-01T00:00:00.000Z', deleted: false }],
      entries: [
        // neuer als lokal → Server gewinnt
        { syncId: local1.syncId, templateSyncId: dump.templates[0]!.syncId!, timestamp: local1.timestamp, editedAt: null, tags: [], encrypted: true, data: await encryptWithDek(JSON.stringify(withNote(blocksOf(local1), 'Server neuer'))), updatedAt: '2026-03-10T00:00:00.000Z', deleted: false },
        // älter als lokal → lokal gewinnt
        { syncId: local2.syncId, templateSyncId: dump.templates[0]!.syncId!, timestamp: local2.timestamp, editedAt: null, tags: [], encrypted: true, data: await encryptWithDek(JSON.stringify(withNote(blocksOf(local2), 'Server älter'))), updatedAt: '2026-01-01T00:00:00.000Z', deleted: false },
        // nur auf dem Server (andere Vorlage)
        { syncId: 'srv-entry', templateSyncId: 'srv-template', timestamp: '2026-04-01T08:00:00.000Z', editedAt: null, tags: [], encrypted: true, data: await encryptWithDek(JSON.stringify(onlyServerBlocks)), updatedAt: '2026-04-01T08:00:00.000Z', deleted: false },
      ],
      cursor: 3,
    };
    const { fetchFn, calls } = stubFetch(server);
    const api = createV2Api('', fetchFn);

    await expect(v2LoginWithBackupCode(api, USER, 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE-FFFFF-GGGG')).rejects.toMatchObject({ code: 'wrong-backup-code' });
    await expect(v2LoginWithBackupCode(api, 'unbekannt', V.backupCode!)).rejects.toBeInstanceOf(V2ServerError);
    const dek = await v2LoginWithBackupCode(api, USER, V.backupCode!);

    const merged = mergeV2((await readV2Snapshot())!, await pullAllV2(api));
    expect(merged.entries).toHaveLength(dump.entries.length + 1);
    expect(merged.templates.some((t) => t.name === 'Nur auf dem Server')).toBe(true);

    const result = transformV2(await decodeV2Snapshot(merged, { dek }), {
      diaryId: '01900000-0000-7000-8000-000000000001', authorId: 'u', timezone: 'Europe/Berlin',
      resolveImage: (_i, h) => ({ presetId: h.defaultPresetId ?? 'default-koerper-vorderseite' }),
    });
    const textOf = (needle: string) => result.entries.filter((e) => Object.values(e.values).includes(needle));
    expect(textOf('Server neuer')).toHaveLength(1); // Server-Stand übernommen
    expect(textOf('Büro')).toHaveLength(0); // alter lokaler Wert ersetzt
    expect(textOf('Server älter')).toHaveLength(0); // lokaler Stand blieb
    expect(textOf('STB-V2-NUR-AUF-SERVER')).toHaveLength(1); // lokal fehlender Eintrag ergänzt
    expect(result.templates.some((t) => t.template.name === 'Nur auf dem Server')).toBe(true);
    expect(result.report.counts.entries).toBe(9);
    // nur lesend: keine schreibenden Aufrufe außer Login
    expect(calls.filter((c) => c.method !== 'GET' && c.path !== '/api/auth/recover')).toEqual([]);
  });
});
