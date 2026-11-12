import { z } from 'zod';
import { defineBlock } from './common.js';

export const textConfig = z.strictObject({
  maxLength: z.number().int().positive().optional(),
  placeholder: z.string().optional(),
});
export type TextConfig = z.infer<typeof textConfig>;

export const text = defineBlock<TextConfig, string>({
  config: textConfig,
  value: (c) => (c.maxLength === undefined ? z.string() : z.string().max(c.maxLength)),
  emptyValue: () => '',
  isEmpty: (v) => v === undefined || v.trim() === '',
  toDisplay: (v) => v,
});
