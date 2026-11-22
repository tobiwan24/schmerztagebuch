import { z } from 'zod';
import { defineBlock, idSchema } from './common.js';

export const multiselectOption = z.strictObject({ id: idSchema, label: z.string().trim().min(1), color: z.string().min(1) });

export const multiselectConfig = z
  .strictObject({ options: z.array(multiselectOption), multiple: z.boolean() })
  .refine((c) => new Set(c.options.map((o) => o.id)).size === c.options.length, {
    message: 'Options-IDs müssen eindeutig sein',
    path: ['options'],
  });

export type MultiselectConfig = z.infer<typeof multiselectConfig>;
/** Werte sind Options-IDs, nie Labels (DM-11): Umbenennen ändert historische Werte nicht. */
export type MultiselectValue = string[];

export const multiselect = defineBlock<MultiselectConfig, MultiselectValue>({
  config: multiselectConfig,
  value: (c) => {
    const ids = new Set(c.options.map((o) => o.id));
    return z
      .array(z.string().refine((id) => ids.has(id), { message: 'Unbekannte Options-ID' }))
      .refine((v) => new Set(v).size === v.length, { message: 'Doppelte Option' })
      .refine((v) => c.multiple || v.length <= 1, { message: 'Nur eine Option erlaubt' });
  },
  emptyValue: () => [],
  isEmpty: (v) => v === undefined || v.length === 0,
  toDisplay: (v, c) => v.map((id) => c.options.find((o) => o.id === id)?.label ?? '(entfernte Option)').join(', '),
  toAnalysis: (v) => ({ kind: 'options', optionIds: [...v] }),
});
