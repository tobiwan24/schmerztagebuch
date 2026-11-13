import { describe, expect, it } from 'vitest';
import { backupDue } from './backup-state';

const DAY = 86_400_000;
const now = Date.parse('2026-03-20T12:00:00Z');

describe('Backup-Erinnerung', () => {
  it('fällig nur in local-only nach Ablauf der Frist seit letztem Backup bzw. Kontoanlage', () => {
    const base = { mode: 'local-only' as const, lastBackup: null, accountCreatedAt: now - 8 * DAY, days: 7, now };
    expect(backupDue(base)).toBe(true);
    expect(backupDue({ ...base, accountCreatedAt: now - 6 * DAY })).toBe(false);
    expect(backupDue({ ...base, lastBackup: now - 2 * DAY })).toBe(false);
    expect(backupDue({ ...base, lastBackup: now - 10 * DAY, days: 14 })).toBe(false);
    expect(backupDue({ ...base, mode: 'cloud-primary' })).toBe(false);
    expect(backupDue({ ...base, mode: null })).toBe(false);
  });
});
