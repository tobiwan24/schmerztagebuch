import { describe, expect, it } from 'vitest';
import { deTour } from '@/i18n/lazy/tour';
import { TOUR_STEPS } from './steps';
import {
  EMPTY_TOUR,
  TOUR_KEY,
  TOUR_PAGES,
  isPageDone,
  markPageDone,
  parseTourState,
  readTourState,
  resetTour,
  resolveSteps,
  serializeTourState,
  tourPageForPath,
  skipAllPages,
  writeTourState,
} from './tour';

describe('Tour-Logik', () => {
  it('UI-28: Seiten sind anfangs nicht erledigt; erledigt gilt je Seite', () => {
    expect(isPageDone(EMPTY_TOUR, 'start')).toBe(false);
    const s = markPageDone(EMPTY_TOUR, 'start');
    expect(isPageDone(s, 'start')).toBe(true);
    expect(isPageDone(s, 'history')).toBe(false);
    expect(markPageDone(s, 'start')).toBe(s);
  });

  it('UI-28: „alle überspringen“ erledigt jede Seite, Zurücksetzen stellt den Anfang wieder her', () => {
    const s = skipAllPages(markPageDone(EMPTY_TOUR, 'entry'));
    for (const p of TOUR_PAGES) expect(isPageDone(s, p)).toBe(true);
    const r = resetTour();
    for (const p of TOUR_PAGES) expect(isPageDone(r, p)).toBe(false);
  });

  it('UI-28: Zustand überlebt Speichern und Laden; Unlesbares ergibt den Anfangszustand', () => {
    const s = skipAllPages(markPageDone(EMPTY_TOUR, 'analysis'));
    expect(parseTourState(serializeTourState(s))).toEqual(s);
    for (const raw of [null, '', 'x', '[]', '{"done":"start"}']) expect(parseTourState(raw)).toEqual(EMPTY_TOUR);
    expect(parseTourState('{"done":["start","nix","start"],"skipAll":1}')).toEqual({ done: ['start'], skipAll: false });
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    writeTourState(markPageDone(EMPTY_TOUR, 'editor'), storage);
    expect(mem.has(TOUR_KEY)).toBe(true);
    expect(readTourState(storage).done).toEqual(['editor']);
  });

  it('UI-28: Schritte ohne vorhandenes Ziel werden übersprungen, Reihenfolge bleibt', () => {
    const present = new Set(['start-tiles', 'nav']);
    const steps = resolveSteps(TOUR_STEPS, 'start', (t) => present.has(t));
    expect(steps.map((s) => s.id)).toEqual(['start-tiles', 'start-nav']);
    expect(resolveSteps(TOUR_STEPS, 'history', () => false)).toEqual([]);
  });

  it('UI-28: jede Seite hat Schritte, Ids sind eindeutig und jeder Schritt hat Titel und Text in i18n', () => {
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length);
    for (const p of TOUR_PAGES) expect(TOUR_STEPS.some((s) => s.page === p)).toBe(true);
    for (const s of TOUR_STEPS) {
      const t = deTour.steps[s.id];
      expect(t?.title.length, s.id).toBeGreaterThan(0);
      expect(t?.body.length, s.id).toBeGreaterThan(0);
    }
    expect(Object.keys(deTour.steps).sort()).toEqual(TOUR_STEPS.map((s) => s.id).sort());
  });

  it('UI-28: Pfade werden den Tour-Seiten zugeordnet', () => {
    expect(tourPageForPath('/')).toBe('start');
    expect(tourPageForPath('/entry/new')).toBe('entry');
    expect(tourPageForPath('/history/')).toBe('history');
    expect(tourPageForPath('/analysis')).toBe('analysis');
    expect(tourPageForPath('/more/templates/new')).toBe('editor');
    expect(tourPageForPath('/more/templates/abc')).toBe('editor');
    for (const p of ['/more', '/more/templates', '/entry/abc', '/more/settings', '/unlock']) expect(tourPageForPath(p), p).toBeNull();
  });
});
