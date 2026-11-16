// Schritte der Tour (UI-28). Texte stehen in `de.tour.steps[id]` (Lint UI-07); `target` ist der Wert von `data-tour`.
import type { TourStep } from './tour';

export const TOUR_STEPS: readonly TourStep[] = [
  { id: 'start-quick', page: 'start', target: 'start-quick' },
  { id: 'start-tiles', page: 'start', target: 'start-tiles' },
  { id: 'start-nav', page: 'start', target: 'nav' },
  { id: 'entry-fields', page: 'entry', target: 'entry-fields' },
  { id: 'entry-save', page: 'entry', target: 'entry-save' },
  { id: 'history-filters', page: 'history', target: 'history-filters' },
  { id: 'history-list', page: 'history', target: 'history-list' },
  { id: 'analysis-range', page: 'analysis', target: 'analysis-range' },
  { id: 'analysis-charts', page: 'analysis', target: 'analysis-charts' },
  { id: 'editor-blocks', page: 'editor', target: 'editor-blocks' },
  { id: 'editor-save', page: 'editor', target: 'editor-save' },
];
