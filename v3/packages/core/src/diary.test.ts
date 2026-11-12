import { describe, expect, it } from 'vitest';
import { createDiary, diarySchema } from './diary.js';
import { uuidV7FromSeed } from './ids.js';

const clock = { now: () => Date.parse('2026-03-01T08:00:00Z') };

describe('Tagebuch', () => {
  it('legt ein Tagebuch mit Standard-Einstellungen an (Wetter und GPS aus)', () => {
    const d = createDiary({ id: uuidV7FromSeed(1, new Uint8Array(10).fill(1)), name: ' Mein Tagebuch ', subject: 'human', timezone: 'Europe/Berlin' }, clock);
    expect(d.name).toBe('Mein Tagebuch');
    expect(d.createdAt).toBe('2026-03-01T08:00:00.000Z');
    expect(d.settings).toEqual({ weather: { enabled: false, gpsDefault: false }, timezone: 'Europe/Berlin' });
  });

  it('lehnt leeren Namen, unbekannte Art und fremde Felder ab', () => {
    const base = createDiary({ id: uuidV7FromSeed(2, new Uint8Array(10).fill(2)), name: 'x', subject: 'animal', timezone: 'UTC' }, clock);
    expect(diarySchema.safeParse({ ...base, name: '  ' }).success).toBe(false);
    expect(diarySchema.safeParse({ ...base, subject: 'plant' }).success).toBe(false);
    expect(diarySchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});
