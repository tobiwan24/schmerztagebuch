import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../version.js';
import { changelog } from './changelog.js';
import { compareVersions, unseenReleases, type Release } from './whats-new.js';

const rel = (version: string): Release => ({ version, date: '2026-01-01', points: ['x'] });

describe('UI-26: Neuigkeiten (unseenReleases)', () => {
  it('UI-26: compareVersions vergleicht Semver inklusive Prerelease', () => {
    expect(compareVersions('3.1.0', '3.0.9')).toBeGreaterThan(0);
    expect(compareVersions('3.0.0', '3.0.0')).toBe(0);
    expect(compareVersions('3.0.0-alpha.1', '3.0.0')).toBeLessThan(0);
    expect(compareVersions('3.0.0-alpha.2', '3.0.0-alpha.10')).toBeLessThan(0);
    expect(compareVersions('3.0.0-alpha.1', '3.0.0-alpha')).toBeGreaterThan(0);
    expect(compareVersions('3.0.0-alpha', '3.0.0-1')).toBeGreaterThan(0);
    expect(compareVersions('10.0.0', '9.9.9')).toBeGreaterThan(0);
    expect(compareVersions('3.0.0-beta.1', '3.0.0-alpha.9')).toBeGreaterThan(0);
  });

  it('UI-26: unseenReleases liefert Einträge nach lastSeen bis current, neueste zuerst', () => {
    const log = [rel('3.2.0'), rel('3.1.0'), rel('3.1.0-alpha.1'), rel('3.0.0')];
    expect(unseenReleases(log, '3.0.0', '3.1.0').map((r) => r.version)).toEqual(['3.1.0', '3.1.0-alpha.1']);
    expect(unseenReleases(log, '3.1.0', '3.1.0')).toEqual([]);
    expect(unseenReleases(log, '3.0.0', '3.0.0')).toEqual([]);
  });

  it('UI-26: ohne lastSeen (null) alle Einträge bis current; Einträge nach current bleiben draußen', () => {
    const log = [rel('3.2.0'), rel('3.1.0'), rel('3.0.0')];
    expect(unseenReleases(log, null, '3.1.0').map((r) => r.version)).toEqual(['3.1.0', '3.0.0']);
  });

  it('UI-26: unseenReleases sortiert auch unsortierte Eingaben absteigend und ignoriert ungültige Versionen', () => {
    const log = [rel('3.0.0'), rel('kaputt'), rel('3.1.0')];
    expect(unseenReleases(log, null, '3.1.0').map((r) => r.version)).toEqual(['3.1.0', '3.0.0']);
    expect(unseenReleases(log, 'kaputt', '3.1.0').map((r) => r.version)).toEqual(['3.1.0', '3.0.0']);
  });

  it('UI-26: Changelog ist eindeutig, absteigend sortiert, 1–6 Punkte je Version, und APP_VERSION hat einen Eintrag', () => {
    const versions = changelog.map((r) => r.version);
    expect(new Set(versions).size).toBe(versions.length);
    for (let i = 1; i < versions.length; i++) {
      expect(compareVersions(versions[i - 1]!, versions[i]!)).toBeGreaterThan(0);
    }
    for (const r of changelog) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.points.length).toBeGreaterThanOrEqual(1);
      expect(r.points.length).toBeLessThanOrEqual(6);
      expect(r.points.every((p) => p.trim().length > 0)).toBe(true);
    }
    expect(versions, `Changelog-Eintrag für ${APP_VERSION} fehlt (A-081)`).toContain(APP_VERSION);
  });
});
