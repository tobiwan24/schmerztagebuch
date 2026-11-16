// Tour-Logik (UI-28, A-082): reine Funktionen ohne DOM. Zustand je Seite „erledigt“, „alle überspringen“, Zurücksetzen.
// Gespeichert im localStorage `stb-v3-tour` (Darstellungsinformation ohne Gesundheitsdaten, überlebt die Gefahr-Zone wie A-078).

export const TOUR_KEY = 'stb-v3-tour';

export const TOUR_PAGES = ['start', 'entry', 'history', 'analysis', 'editor'] as const;
export type TourPage = (typeof TOUR_PAGES)[number];

export interface TourState {
  done: readonly TourPage[];
  skipAll: boolean;
}

export interface TourStep {
  id: string;
  page: TourPage;
  /** Wert des Attributs `data-tour` am hervorzuhebenden Element. */
  target: string;
}

export const EMPTY_TOUR: TourState = { done: [], skipAll: false };

const isPage = (v: unknown): v is TourPage => typeof v === 'string' && (TOUR_PAGES as readonly string[]).includes(v);

/** Liest den gespeicherten Zustand; Unlesbares oder Fremdes ergibt den Anfangszustand. */
export function parseTourState(raw: string | null): TourState {
  if (!raw) return EMPTY_TOUR;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return EMPTY_TOUR;
    const o = v as { done?: unknown; skipAll?: unknown };
    const done = Array.isArray(o.done) ? [...new Set(o.done.filter(isPage))] : [];
    return { done, skipAll: o.skipAll === true };
  } catch {
    return EMPTY_TOUR;
  }
}

export const serializeTourState = (s: TourState): string => JSON.stringify({ done: s.done, skipAll: s.skipAll });

export function markPageDone(s: TourState, page: TourPage): TourState {
  return s.done.includes(page) ? s : { ...s, done: [...s.done, page] };
}

/** „Alle überspringen“: keine Seite zeigt die Tour mehr, bis zurückgesetzt wird. */
export const skipAllPages = (s: TourState): TourState => ({ done: s.done, skipAll: true });

/** „Tutorial erneut zeigen“. */
export const resetTour = (): TourState => EMPTY_TOUR;

export const isPageDone = (s: TourState, page: TourPage): boolean => s.skipAll || s.done.includes(page);

/** Schritte der Seite, deren Ziel vorhanden ist (UI-28); Reihenfolge bleibt erhalten. */
export function resolveSteps(steps: readonly TourStep[], page: TourPage, hasTarget: (target: string) => boolean): TourStep[] {
  return steps.filter((s) => s.page === page && hasTarget(s.target));
}

export function readTourState(storage: Pick<Storage, 'getItem'> = localStorage): TourState {
  try {
    return parseTourState(storage.getItem(TOUR_KEY));
  } catch {
    return EMPTY_TOUR;
  }
}

export function writeTourState(s: TourState, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(TOUR_KEY, serializeTourState(s));
  } catch {
    /* Speicher gesperrt (privater Modus): Die Tour erscheint dann beim nächsten Besuch erneut. */
  }
}
