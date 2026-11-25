import { z } from 'zod';
import { defineBlock, idSchema, isoDateTime } from './common.js';

export const MEDICATION_MAX_ITEMS = 20;
export const DEFAULT_MEDICATION_UNITS = ['mg', 'ml', 'Stk', 'Tropfen', 'Hub'] as const;

const unitSchema = z.string().trim().min(1).max(20);

export const medicationPreset = z.strictObject({
  id: idSchema,
  name: z.string().trim().min(1),
  dose: z.number().positive().finite().optional(),
  unit: unitSchema,
  color: z.string().min(1),
});

export const medicationConfig = z
  .strictObject({
    presets: z.array(medicationPreset),
    units: z.array(unitSchema).min(1).default([...DEFAULT_MEDICATION_UNITS]),
    allowFree: z.boolean(),
  })
  .refine((c) => new Set(c.presets.map((p) => p.id)).size === c.presets.length, {
    message: 'Preset-IDs müssen eindeutig sein',
    path: ['presets'],
  });
export type MedicationConfig = z.infer<typeof medicationConfig>;

const medicationItem = z.strictObject({
  id: idSchema,
  presetId: idSchema.optional(),
  name: z.string().trim().min(1),
  dose: z.number().positive().finite().optional(),
  unit: unitSchema.optional(),
  at: isoDateTime.optional(),
  effect: z.number().int().min(0).max(10).optional(),
});
export type MedicationItem = z.infer<typeof medicationItem>;
export type MedicationValue = { items: MedicationItem[] };

const medicationValue = z.strictObject({ items: z.array(medicationItem).max(MEDICATION_MAX_ITEMS) });

const itemText = (i: MedicationItem): string => [i.name, i.dose !== undefined ? `${i.dose}` : '', i.unit ?? ''].filter(Boolean).join(' ');

export const medication = defineBlock<MedicationConfig, MedicationValue>({
  config: medicationConfig,
  value: (c) =>
    medicationValue.superRefine((v, ctx) => {
      const ids = new Set(c.presets.map((p) => p.id));
      v.items.forEach((it, idx) => {
        if (it.presetId !== undefined && !ids.has(it.presetId)) {
          ctx.addIssue({ code: 'custom', message: 'Unbekannte Preset-ID', path: ['items', idx, 'presetId'] });
        }
        if (it.presetId === undefined && !c.allowFree) {
          ctx.addIssue({ code: 'custom', message: 'Freie Einträge nicht erlaubt', path: ['items', idx] });
        }
      });
    }),
  emptyValue: () => ({ items: [] }),
  isEmpty: (v) => v === undefined || v.items.length === 0,
  toDisplay: (v) => v.items.map(itemText).join(', '),
  toAnalysis: (v) => ({
    kind: 'medications',
    items: v.items.map((i) => ({
      name: i.name,
      ...(i.presetId !== undefined ? { presetId: i.presetId } : {}),
      ...(i.dose !== undefined ? { dose: i.dose } : {}),
      ...(i.unit !== undefined ? { unit: i.unit } : {}),
      ...(i.at !== undefined ? { at: i.at } : {}),
      ...(i.effect !== undefined ? { effect: i.effect } : {}),
    })),
  }),
  /** Eine Zelle: „Ibuprofen 400 mg 08:00; …“ (Uhrzeit aus dem ISO-Wert, ohne Zeitzonenumrechnung). */
  toCsv: (v) =>
    v.items
      .map((i) => {
        const t = i.at ? /T(\d{2}:\d{2})/.exec(i.at)?.[1] : undefined;
        return [itemText(i), t].filter(Boolean).join(' ');
      })
      .join('; '),
});
