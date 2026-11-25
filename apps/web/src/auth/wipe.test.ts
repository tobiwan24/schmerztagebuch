import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { StbDb } from '@/data/db';
import { AutoBackupDb } from '@/data/auto-backup-store';
import { wipeLocalData } from './wipe';

const exists = async (name: string) => (await indexedDB.databases()).some((d) => d.name === name);

describe('wipeLocalData', () => {
  it('UI-21: löscht stb-v3 und die Auto-Sicherung, lässt PainDiaryDB unberührt', async () => {
    const db = new StbDb('stb-v3');
    await db.device.put({ id: 'x', value: 1 });
    const backup = new AutoBackupDb();
    await backup.backups.put({ id: 'latest', v: 1, createdAt: 'x', wraps: [], keyBox: { iv: '', ct: '' }, file: '' });
    backup.close();
    await new Promise<void>((res, rej) => {
      const r = indexedDB.open('PainDiaryDB', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('entries');
      r.onsuccess = () => {
        r.result.close();
        res();
      };
      r.onerror = () => rej(r.error);
    });
    let locked = false;
    await wipeLocalData(db, { lock: () => (locked = true) });
    expect(locked).toBe(true);
    expect(await exists('stb-v3')).toBe(false);
    expect(await exists('stb-v3-autobackup')).toBe(false);
    expect(await exists('PainDiaryDB')).toBe(true);
  });
});
