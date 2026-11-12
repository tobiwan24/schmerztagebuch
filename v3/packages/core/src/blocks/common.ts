import { z } from 'zod';
import { isUuidV7 } from '../ids.js';

/** Stabile ID (UUID v7, Spec 02) — auch für Optionen, Body-Map-Punkte, Ereignisse, Anhänge. */
export const idSchema = z.string().refine(isUuidV7, { message: 'Keine UUID v7' });

/** ISO-Zeitpunkt mit Zeitzone/Offset. */
export const isoDateTime = z.iso.datetime({ offset: true });

/**
 * Einheitliche Schnittstelle je Blocktyp (Spec 05). `value` ist von der Konfiguration abhängig
 * (z. B. Slider-Grenzen, gültige Options-IDs). `toAnalysis`/`toCsv` folgen in eigenen Iterationen.
 */
export interface BlockModule<C, V> {
  readonly config: z.ZodType<C, unknown>;
  value(config: C): z.ZodType<V, unknown>;
  /** Leerer Wert für ein neues Formular; `undefined` = Feld bleibt ohne Wert. */
  emptyValue(config: C): V | undefined;
  isEmpty(value: V | undefined): boolean;
  toDisplay(value: V, config: C): string;
}

/** Hilfsfunktion: Typinferenz für Blockmodule ohne Wiederholung der Generics. */
export const defineBlock = <C, V>(m: BlockModule<C, V>): BlockModule<C, V> => m;

/** Liegt `x` (bis auf Rundungsfehler) auf einem ganzzahligen Vielfachen? */
export function isMultiple(x: number, step: number): boolean {
  const q = x / step;
  return Math.abs(q - Math.round(q)) < 1e-9 * Math.max(1, Math.abs(q));
}
