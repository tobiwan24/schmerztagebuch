// Push-Reihenfolge je Record-Art (Spec 04): Strukturdaten (Tagebuch, Vorlage, Vorlagenversion) zuerst, damit Einträge nie vor
// ihrer Vorlagenversion ankommen und Dashboards/Filter (Verweise auf Blöcke der Vorlagen) erst danach (SYN-19).
export const KIND_ORDER = ['diary', 'template', 'templateVersion'];

/** Rang einer Record-Art; alles außerhalb der Strukturdaten teilt sich den Rang `KIND_ORDER.length`. */
export function kindRank(kind: string): number {
  const i = KIND_ORDER.indexOf(kind);
  return i < 0 ? KIND_ORDER.length : i;
}
