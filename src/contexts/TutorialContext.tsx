import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

export type TutorialPage = 'home' | 'diary' | 'editor' | 'dashboard' | 'history' | 'settings';

interface TutorialState {
  globalDisabled: boolean;
  /** Seiten, für die das Tutorial abgeschlossen / übersprungen wurde */
  donepages: Partial<Record<TutorialPage, boolean>>;
}

interface TutorialContextType {
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

const STORAGE_KEY = 'tutorial_state_v2';

const defaultState: TutorialState = {
  globalDisabled: false,
  donepages: {},
};

function loadState(): TutorialState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw);
    return {
      ...defaultState,
      ...parsed,
      donepages: parsed.donepages ?? {},
    };
  } catch {
    return defaultState;
  }
}

function saveState(state: TutorialState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

const TutorialContext = createContext<TutorialContextType | null>(null);

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TutorialState>(() => loadState());

  useEffect(() => {
    saveState(state);
  }, [state]);

  const isPageTutorialDone = useCallback(
    (page: TutorialPage): boolean => {
      if (state.globalDisabled) return true;
      return state.donepages[page] === true;
    },
    [state],
  );

  const markPageTutorialDone = useCallback((page: TutorialPage) => {
    setState(prev => ({
      ...prev,
      donepages: { ...prev.donepages, [page]: true },
    }));
  }, []);

  const dismissPage = useCallback((page: TutorialPage) => {
    setState(prev => ({
      ...prev,
      donepages: { ...prev.donepages, [page]: true },
    }));
  }, []);

  const dismissGlobally = useCallback(() => {
    setState(prev => ({ ...prev, globalDisabled: true }));
  }, []);

  const resetTutorials = useCallback(() => {
    setState(defaultState);
  }, []);

  return (
    <TutorialContext.Provider
      value={{
        state,
        isPageTutorialDone,
        markPageTutorialDone,
        dismissPage,
        dismissGlobally,
        resetTutorials,
      }}
    >
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial(): TutorialContextType {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error('useTutorial must be used within TutorialProvider');
  return ctx;
}
