// Sync läuft nie parallel zu sich selbst (Spec 04): Auslöser während eines Laufs werden zu genau einem Folgelauf
// zusammengefasst. Alle Auslöser eines Folgelaufs erhalten dessen Ergebnis.

export interface SingleFlight {
  /** Startet einen Lauf oder plant einen Folgelauf; erfüllt sich, wenn der zuständige Lauf fertig ist. */
  trigger(): Promise<void>;
  readonly running: boolean;
}

export function createSingleFlight(run: () => Promise<void>): SingleFlight {
  let current: Promise<void> | null = null;
  let followUp: Promise<void> | null = null;

  function start(): Promise<void> {
    const p = (async () => {
      try {
        await run();
      } finally {
        current = null;
      }
    })();
    current = p;
    return p;
  }

  return {
    get running() {
      return current !== null;
    },
    trigger() {
      if (!current) return start();
      if (!followUp) {
        const after = current;
        followUp = after
          .catch(() => undefined)
          .then(() => {
            followUp = null;
            return start();
          });
      }
      return followUp;
    },
  };
}
