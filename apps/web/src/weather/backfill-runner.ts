// Nachtrag des Wetters (BLK-34): beim Entsperren und beim Ereignis `online` werden Einträge mit `weatherPending` aller
// Tagebücher nacheinander nachgetragen — immer nur ein Lauf zur Zeit. Fehlschläge brechen den Lauf nicht ab.

export interface BackfillResult {
  filled: number;
  stillPending: number;
}

export interface BackfillRunnerDeps {
  listDiaryIds(): Promise<string[]>;
  backfillDiary(diaryId: string): Promise<BackfillResult>;
}

export function createBackfillRunner(deps: BackfillRunnerDeps) {
  let current: Promise<BackfillResult> | null = null;

  async function execute(): Promise<BackfillResult> {
    const total: BackfillResult = { filled: 0, stillPending: 0 };
    for (const id of await deps.listDiaryIds()) {
      try {
        const r = await deps.backfillDiary(id);
        total.filled += r.filled;
        total.stillPending += r.stillPending;
      } catch {
        // Tagebuch nicht erreichbar/lesbar: Einträge bleiben markiert, nächstes Tagebuch.
      }
    }
    return total;
  }

  return {
    /** Startet einen Lauf; läuft schon einer, wird dessen Ergebnis geteilt (kein zweiter paralleler Lauf). */
    run(): Promise<BackfillResult> {
      current ??= execute().finally(() => {
        current = null;
      });
      return current;
    },
  };
}
