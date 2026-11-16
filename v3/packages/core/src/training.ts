// Training (Spec 05 „Training“, A-084): Auswahl der Trainingsvorlagen nach der aktuellen Funktionsphase.
// Nur Beschreibung/Auswahl — keine Empfehlungen oder Stufenvorschläge (Nicht-Ziel Therapieempfehlung).
import type { Entry, TemplateState, TemplateVersion } from './templates.js';
import { compareByOrder } from './fractional-index.js';

/** Vorlage ist eine Trainingsvorlage (fehlendes `purpose` = Tagebuch). */
export const isTrainingTemplate = (t: { purpose?: string }): boolean => t.purpose === 'training';

/**
 * Aktuelle Funktionsphase: jüngster numerischer Wert (nach `occurredAt`) eines Blocks mit Rolle `function`.
 * Die Rolle wird je Eintrag über dessen Vorlagenversion aufgelöst (`versions` = aktuelle und frühere Versionen).
 * `null`, wenn kein Eintrag einen solchen Wert hat.
 */
export function currentFunctionPhase(entries: readonly Entry[], versions: readonly TemplateVersion[]): number | null {
  const roleBlocks = new Map<string, string[]>();
  for (const v of versions) {
    roleBlocks.set(
      `${v.templateId}@${v.version}`,
      v.blocks.filter((b) => b.role === 'function' && b.type === 'slider').map((b) => b.id),
    );
  }
  let best: { at: number; value: number } | null = null;
  for (const e of entries) {
    const ids = roleBlocks.get(`${e.templateId}@${e.templateVersion}`);
    if (!ids) continue;
    const at = Date.parse(e.occurredAt);
    for (const id of ids) {
      const v = e.values[id];
      if (typeof v === 'number' && Number.isFinite(v) && (best === null || at > best.at)) best = { at, value: v };
    }
  }
  return best?.value ?? null;
}

export interface TrainingSelection {
  /** Aktuelle Funktionsphase oder `null`, wenn keine Angabe vorliegt. */
  phase: number | null;
  /** Passende, nicht archivierte Trainingsvorlagen in Vorlagenreihenfolge. */
  templates: TemplateState[];
}

/**
 * Wählt die Trainingsvorlagen: `purpose === 'training'`, nicht archiviert; Vorlagen ohne (oder mit leerer)
 * `functionPhases` erscheinen immer, die übrigen nur, wenn die aktuelle Phase enthalten ist. Ohne Phasenangabe
 * erscheinen nur die Vorlagen ohne Phasen. `history` = frühere Vorlagenversionen für die Rollenauflösung alter Einträge.
 */
export function trainingTemplatesFor(
  templates: readonly TemplateState[],
  entries: readonly Entry[],
  history: readonly TemplateVersion[] = [],
): TrainingSelection {
  const phase = currentFunctionPhase(
    entries,
    [...history, ...templates.map((t) => t.version)],
  );
  const selected = templates
    .filter((s) => isTrainingTemplate(s.template) && !s.template.archived)
    .filter((s) => {
      const phases = s.template.functionPhases;
      return !phases || phases.length === 0 || (phase !== null && phases.includes(phase));
    })
    .sort((a, b) => compareByOrder(a.template, b.template));
  return { phase, templates: selected };
}
