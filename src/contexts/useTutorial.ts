import { createContext, useContext } from 'react';

export type TutorialPage = 'home' | 'diary' | 'editor' | 'dashboard' | 'history' | 'settings';

export interface TutorialState {
  globalDisabled: boolean;
  /** Seiten, für die das Tutorial abgeschlossen / übersprungen wurde */
  donepages: Partial<Record<TutorialPage, boolean>>;
}

export interface TutorialContextType {
  state: TutorialState;
  /** Gibt true zurück wenn das Tutorial für diese Seite fertig ist */
  isPageTutorialDone: (page: TutorialPage) => boolean;
  /** Markiert das Tutorial einer Seite als abgeschlossen */
  markPageTutorialDone: (page: TutorialPage) => void;
  /** Überspringt nur diese Seite */
  dismissPage: (page: TutorialPage) => void;
  /** Überspringt alle Seiten global */
  dismissGlobally: () => void;
  /** Setzt alles zurück */
  resetTutorials: () => void;
}

export const TutorialContext = createContext<TutorialContextType | null>(null);

export function useTutorial(): TutorialContextType {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error('useTutorial must be used within TutorialProvider');
  return ctx;
}
