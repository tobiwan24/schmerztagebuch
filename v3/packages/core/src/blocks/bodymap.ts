import { z } from 'zod';
import { defineBlock, idSchema } from './common.js';

export const bodymapConfig = z.strictObject({ defaultPresetId: z.string().min(1) });
export type BodymapConfig = z.infer<typeof bodymapConfig>;

const unit = z.number().finite().min(0).max(1);
export const bodymapPoint = z.strictObject({
  id: idSchema,
  x: unit,
  y: unit,
  intensity: z.number().finite().min(0).optional(),
});

const bodymapValue = z.strictObject({ presetId: z.string().min(1), points: z.array(bodymapPoint) });
export type BodymapValue = z.infer<typeof bodymapValue>;

export const bodymap = defineBlock<BodymapConfig, BodymapValue>({
  config: bodymapConfig,
  value: () => bodymapValue,
  /** Neues Formular zeigt das Standardbild bereits ausgewählt (Spec 05, BLK-03). */
  emptyValue: (c) => ({ presetId: c.defaultPresetId, points: [] }),
  isEmpty: (v) => v === undefined || v.points.length === 0,
  toDisplay: (v) => (v.points.length === 1 ? '1 Punkt' : `${v.points.length} Punkte`),
});
