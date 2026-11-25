// Vorgemerkte Übungsmedien im Vorlagen-Editor (RDM-033): Dateien werden erst beim Speichern der Vorlage geschrieben;
// bis dahin liegen sie hier im Speicher. Verwerfen des Editors = nichts gespeichert.
import { createContext, useContext } from 'react';
import type { ExerciseMediaInput } from '@/data/repositories/attachments';

export interface ExerciseMediaDraft {
  diaryId: string;
  templateId: string;
  /** Neue, noch nicht gespeicherte Medien nach ID. */
  pending: Map<string, ExerciseMediaInput>;
}

export const ExerciseMediaDraftContext = createContext<ExerciseMediaDraft | null>(null);

export const useExerciseMediaDraft = (): ExerciseMediaDraft | null => useContext(ExerciseMediaDraftContext);
