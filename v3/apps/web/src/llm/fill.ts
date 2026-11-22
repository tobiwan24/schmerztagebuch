// Freitext → Entwurf (Spec 08, VOI-14): Die Serverantwort ist nie vertrauenswürdig. Jeder Wert wird gegen das Block-Schema
// geprüft (`mapIntakeToValues` aus core, dieselbe Abbildung wie beim Kurzbefehl); ungültige Werte werden verworfen und gemeldet.
// Das Ergebnis ist nur ein Entwurf für das Formular — gespeichert wird ausschließlich durch den Nutzer.
import { deepEqual, mapIntakeToValues, nowTimeInput, type FormValues, type TemplateVersion, type TimeInput } from '@stb/core';
import type { LlmFillResponse } from '@stb/sync-protocol';

export interface FillDraft {
  /** Neue Formularwerte (bestehende bleiben, nur Zugeordnetes wird ergänzt/ersetzt). */
  values: FormValues;
  /** Block-IDs, deren Wert sich durch den Entwurf geändert hat (zum Markieren). */
  changed: string[];
  /** Verworfene Werte: ungültig (mit Blocklabel und Grund) oder ohne passendes Feld (ohne Label und Grund). */
  rejected: { label?: string; message?: string }[];
  /** Text, der keinem Feld zugeordnet werden konnte (Vorlage ohne Textfeld). */
  unassigned?: string;
  /** Genannter Zeitpunkt (nur wenn gültig). */
  time?: TimeInput;
}

const textOf = (v: unknown): string => (v && typeof v === 'object' && 'text' in v && typeof (v as { text: unknown }).text === 'string' ? (v as { text: string }).text : '');

export function applyFill(version: TemplateVersion, current: FormValues, response: LlmFillResponse): FillDraft {
  // Nur bekannte Block-IDs gelten; erfundene Schlüssel des Modells werden verworfen, nicht als Notiz übernommen.
  const known = new Set(version.blocks.map((b) => b.id));
  const entries = Object.entries(response.values);
  const mapping = mapIntakeToValues({ ...(response.text ? { text: response.text } : {}), values: Object.fromEntries(entries.filter(([k]) => known.has(k))) }, version);
  const unknown = entries.filter(([k]) => !known.has(k)).map(([k]) => k);
  const values: FormValues = { ...current };
  const changed: string[] = [];
  for (const [id, value] of Object.entries(mapping.values)) {
    let next = value;
    // Vorhandener Notiztext des Nutzers bleibt erhalten; der Entwurf wird angehängt.
    const before = textOf(current[id]);
    if (before && textOf(value)) next = { ...(current[id] as object), text: `${before}\n${textOf(value)}` };
    if (!deepEqual(current[id], next)) {
      values[id] = next;
      changed.push(id);
    }
  }
  const label = new Map(version.blocks.map((b) => [b.id, b.label]));
  const rejected = [
    ...mapping.errors.map((e) => ({ label: label.get(e.blockId) ?? e.key, message: e.message })),
    ...unknown.map(() => ({})),
  ];
  const hasNote = version.blocks.some((b) => b.type === 'textarea');
  const out: FillDraft = { values, changed, rejected };
  if (!hasNote && mapping.note) out.unassigned = mapping.note;
  const at = response.occurredAt ? new Date(response.occurredAt) : null;
  if (at && !Number.isNaN(at.getTime())) out.time = nowTimeInput(at.getTime());
  return out;
}
