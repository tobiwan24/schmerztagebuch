import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { TutorialContext, type TutorialState, type TutorialPage } from './useTutorial';

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
