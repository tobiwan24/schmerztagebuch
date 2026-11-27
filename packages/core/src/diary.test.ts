import { describe, expect, it } from 'vitest';
import { createDiary, diarySchema, updateDiarySettings } from './diary.js';
import { uuidV7FromSeed } from './ids.js';

const clock = { now: () => Date.parse('2026-03-01T08:00:00Z') };

describe('Tagebuch', () => {
  it('legt ein Tagebuch mit Standard-Einstellungen an (Wetter und GPS aus)', () => {
    const d = createDiary({ id: uuidV7FromSeed(1, new Uint8Array(10).fill(1)), name: ' Mein Tagebuch ', subject: 'human', timezone: 'Europe/Berlin' }, clock);
    expect(d.name).toBe('Mein Tagebuch');
    expect(d.createdAt).toBe('2026-03-01T08:00:00.000Z');
    expect(d.settings).toEqual({ weather: { enabled: false, gpsDefault: false }, timezone: 'Europe/Berlin' });
  });

  it('legt ein Tagebuch mit festem Ort an: gerundet gespeichert, Wetter an', () => {
    const d = createDiary({ id: uuidV7FromSeed(3, new Uint8Array(10).fill(3)), name: 'x', subject: 'human', timezone: 'UTC', location: { lat: 52.52437, lon: 13.41053, label: 'Berlin' } }, clock);
    expect(d.settings.weather).toEqual({ enabled: true, gpsDefault: false, location: { lat: 52.5, lon: 13.4, label: 'Berlin' } });
  });

  it('lehnt leeren Namen, unbekannte Art und fremde Felder ab', () => {
    const base = createDiary({ id: uuidV7FromSeed(2, new Uint8Array(10).fill(2)), name: 'x', subject: 'animal', timezone: 'UTC' }, clock);
    expect(diarySchema.safeParse({ ...base, name: '  ' }).success).toBe(false);
    expect(diarySchema.safeParse({ ...base, subject: 'plant' }).success).toBe(false);
    expect(diarySchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});

describe('Tagebuch-Einstellungen ändern', () => {
  const stamp = { hlc: '1700000009000:0000:devA', updatedAt: '2026-03-02T08:00:00.000Z' };
  const base = createDiary({ id: uuidV7FromSeed(3, new Uint8Array(10).fill(3)), name: 'T', subject: 'human', timezone: 'Europe/Berlin' }, clock);
  const tpl = { id: uuidV7FromSeed(4, new Uint8Array(10).fill(4)), blockIds: [uuidV7FromSeed(6, new Uint8Array(10).fill(6)), uuidV7FromSeed(7, new Uint8Array(10).fill(7))] };
  const foreign = uuidV7FromSeed(8, new Uint8Array(10).fill(8));

  it('DM-14: Tagebücher ohne updatedAt/hlc bleiben gültig; Änderung setzt beide', () => {
    expect(diarySchema.safeParse(base).success).toBe(true);
    expect(base.hlc).toBeUndefined();
    const next = updateDiarySettings(base, { name: ' Neu ', weather: { enabled: true, gpsDefault: true } }, stamp);
    expect(next).toMatchObject({ name: 'Neu', updatedAt: stamp.updatedAt, hlc: stamp.hlc });
    expect(next.settings.weather).toEqual({ enabled: true, gpsDefault: true });
    expect(next.settings.timezone).toBe('Europe/Berlin');
    expect(diarySchema.safeParse(next).success).toBe(true);
  });

  it('DM-14: fester Ort wird auf 1 Dezimalstelle gerundet; null entfernt ihn', () => {
    const withLoc = updateDiarySettings(base, { weather: { location: { lat: 52.5200066, lon: 13.404954, label: 'Berlin' } } }, stamp);
    expect(withLoc.settings.weather.location).toEqual({ lat: 52.5, lon: 13.4, label: 'Berlin' });
    const without = updateDiarySettings(withLoc, { weather: { location: null } }, stamp);
    expect(without.settings.weather.location).toBeUndefined();
  });

  it('RDM-028 P2: quickTemplateIds setzen, Duplikate entfernen, leer/null löscht, unbekannte Vorlage wird abgelehnt', () => {
    const a = tpl.id;
    const set = updateDiarySettings(base, { quickTemplateIds: [a, a] }, stamp, { templates: [tpl] });
    expect(set.settings.quickTemplateIds).toEqual([a]);
    expect(diarySchema.safeParse(set).success).toBe(true);
    expect(updateDiarySettings(set, { name: 'X' }, stamp).settings.quickTemplateIds).toEqual([a]);
    expect(updateDiarySettings(set, { quickTemplateIds: [] }, stamp).settings.quickTemplateIds).toBeUndefined();
    expect(updateDiarySettings(set, { quickTemplateIds: null }, stamp).settings.quickTemplateIds).toBeUndefined();
    expect(() => updateDiarySettings(base, { quickTemplateIds: [foreign] }, stamp, { templates: [tpl] })).toThrow(RangeError);
  });

  it('DM-14: Schnelleintrag-Blöcke müssen zur gewählten Vorlage gehören', () => {
    const ok = updateDiarySettings(base, { quickEntryTemplateId: tpl.id, quickEntryBlockIds: [tpl.blockIds[1]!] }, stamp, { templates: [tpl] });
    expect(ok.settings.quickEntryBlockIds).toEqual([tpl.blockIds[1]!]);
    expect(() => updateDiarySettings(base, { quickEntryTemplateId: tpl.id, quickEntryBlockIds: [foreign] }, stamp, { templates: [tpl] })).toThrow(RangeError);
    expect(() => updateDiarySettings(base, { quickEntryTemplateId: uuidV7FromSeed(5, new Uint8Array(10).fill(5)) }, stamp, { templates: [tpl] })).toThrow(RangeError);
    expect(() => updateDiarySettings(base, { quickEntryBlockIds: [tpl.blockIds[0]!] }, stamp, { templates: [tpl] })).toThrow(RangeError);
    const cleared = updateDiarySettings(ok, { quickEntryTemplateId: null, quickEntryBlockIds: null }, stamp, { templates: [tpl] });
    expect(cleared.settings.quickEntryTemplateId).toBeUndefined();
    expect(cleared.settings.quickEntryBlockIds).toBeUndefined();
  });
});

describe('Kurzbefehl-Option „Nachfragen“ (FEAT-024)', () => {
  it('VOI-31: `shortcutAsk` speichert „nur Pflichtfelder“ oder „alle leeren Felder“; `null` entfernt den Wert', () => {
    const base = createDiary({ id: uuidV7FromSeed(1, new Uint8Array(10).fill(1)), name: 'T', subject: 'human', timezone: 'Europe/Berlin' }, clock);
    const stamp = { hlc: 'h1', updatedAt: '2026-03-02T08:00:00.000Z' };
    const req = updateDiarySettings(base, { shortcutAsk: 'required' }, stamp);
    expect(req.settings.shortcutAsk).toBe('required');
    expect(updateDiarySettings(req, { shortcutAsk: null }, stamp).settings.shortcutAsk).toBeUndefined();
    expect(diarySchema.safeParse({ ...base, settings: { ...base.settings, shortcutAsk: 'manchmal' } }).success).toBe(false);
  });
});
