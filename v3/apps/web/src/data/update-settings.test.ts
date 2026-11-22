import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { StbDb } from './db';
import { loadUpdateMode, saveUpdateMode } from './update-settings';

describe('update-settings', () => {
  it('UI-22: Standard „auto", Wechsel auf „notify" bleibt gespeichert', async () => {
    const db = new StbDb(`upd-${Math.random()}`);
    expect(await loadUpdateMode(db)).toBe('auto');
    await saveUpdateMode(db, 'notify');
    expect(await loadUpdateMode(db)).toBe('notify');
    await saveUpdateMode(db, 'auto');
    expect(await loadUpdateMode(db)).toBe('auto');
  });
});
