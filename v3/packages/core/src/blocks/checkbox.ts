import { z } from 'zod';
import { defineBlock } from './common.js';

export const checkboxConfig = z.strictObject({ withNote: z.boolean() });
export type CheckboxConfig = z.infer<typeof checkboxConfig>;

const checkboxValue = z.strictObject({ checked: z.boolean(), note: z.string().optional() });
export type CheckboxValue = z.infer<typeof checkboxValue>;

export const checkbox = defineBlock<CheckboxConfig, CheckboxValue>({
  config: checkboxConfig,
  value: (c) => (c.withNote ? checkboxValue : checkboxValue.omit({ note: true })),
  emptyValue: () => ({ checked: false }),
  isEmpty: (v) => v === undefined || (!v.checked && !v.note?.trim()),
  toDisplay: (v) => (v.checked ? 'Ja' : 'Nein') + (v.note ? ` — ${v.note}` : ''),
  toAnalysis: (v) => ({ kind: 'event', occurred: v.checked }),
});
