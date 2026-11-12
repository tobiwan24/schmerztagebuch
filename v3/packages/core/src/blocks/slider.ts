import { z } from 'zod';
import { defineBlock, isMultiple } from './common.js';

export const sliderConfig = z
  .strictObject({
    min: z.number().finite(),
    max: z.number().finite().default(10),
    step: z.number().finite().positive(),
    unit: z.string().optional(),
    minLabel: z.string().optional(),
    maxLabel: z.string().optional(),
    infoText: z.string().optional(),
  })
  .refine((c) => c.max > c.min, { message: 'max muss größer als min sein', path: ['max'] })
  .refine((c) => isMultiple(c.max - c.min, c.step), { message: 'step muss (max − min) teilen', path: ['step'] });

export type SliderConfig = z.infer<typeof sliderConfig>;

export const slider = defineBlock<SliderConfig, number>({
  config: sliderConfig,
  value: (c) =>
    z
      .number()
      .finite()
      .min(c.min)
      .max(c.max)
      .refine((v) => isMultiple(v - c.min, c.step), { message: `Wert muss auf dem Raster ${c.step} ab ${c.min} liegen` }),
  emptyValue: () => undefined,
  isEmpty: (v) => v === undefined,
  toDisplay: (v, c) => (c.unit ? `${v} ${c.unit}` : String(v)),
});
