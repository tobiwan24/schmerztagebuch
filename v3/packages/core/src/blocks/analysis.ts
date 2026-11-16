// Normalform eines Blockwerts für Suche, Filter und Aggregation (Spec 05 „Datenart für Analyse", Spec 06).
// Leere Werte haben keine Normalform (`null`) und zählen damit nicht in `n`.

export interface NumericAnalysis {
  kind: 'numeric';
  value: number;
  unit?: string;
}

/** Ereignis: Checkbox angehakt. */
export interface EventAnalysis {
  kind: 'event';
  occurred: boolean;
}

/** Ereignis je Option (Multiselect): gewählte Options-IDs. */
export interface OptionsAnalysis {
  kind: 'options';
  optionIds: string[];
}

export interface TextAnalysis {
  kind: 'text';
  text: string;
}

export interface TextEventsAnalysis {
  kind: 'textEvents';
  text?: string;
  events: { id: string; category: 'event' | 'doctor'; title: string; at?: string }[];
  attachmentCount: number;
}

/** Zeit/Dauer: Zeitpunkt (`at`), Zeitraum (`start`/`end`) und/oder Dauer in Minuten. */
export interface TimeAnalysis {
  kind: 'time';
  at?: string;
  start?: string;
  end?: string;
  durationMinutes?: number;
}

/** Regionen/Punkte (Body-Map). Regionen werden aus den Preset-Definitionen abgeleitet, sobald diese portiert sind. */
export interface PointsAnalysis {
  kind: 'points';
  presetId: string;
  points: { x: number; y: number; intensity?: number }[];
}

/** Medikamente: je Position Name (Analyse zählt je Name), Dosis numerisch, optional Zeit und Wirkung. */
export interface MedicationsAnalysis {
  kind: 'medications';
  items: { name: string; presetId?: string; dose?: number; unit?: string; at?: string; effect?: number }[];
}

export type AnalysisValue =
  | NumericAnalysis
  | EventAnalysis
  | OptionsAnalysis
  | TextAnalysis
  | TextEventsAnalysis
  | TimeAnalysis
  | PointsAnalysis
  | MedicationsAnalysis;

export type AnalysisKind = AnalysisValue['kind'];
