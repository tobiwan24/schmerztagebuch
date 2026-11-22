import { z } from 'zod';
import { defineBlock, idSchema } from './common.js';

export const bodymapConfig = z.strictObject({ defaultPresetId: z.string().min(1) });
export type BodymapConfig = z.infer<typeof bodymapConfig>;

const unit = z.number().finite().min(0).max(1);
/** Markierung (Spec 05, A-024): Punkt oder Pinselstrich (`path`, normalisiert), Größe = Durchmesser relativ zur Bildbreite. */
export const BODYMAP_MAX_PATH = 1000;
export const bodymapPoint = z
  .strictObject({
    id: idSchema,
    x: unit,
    y: unit,
    intensity: z.number().finite().min(0).optional(),
    kind: z.enum(['point', 'brush']).optional(),
    size: z.number().finite().gt(0).max(1).optional(),
    comment: z.string().max(2000).optional(),
    path: z.array(z.strictObject({ x: unit, y: unit })).min(2).max(BODYMAP_MAX_PATH).optional(),
  })
  .refine((p) => (p.kind === 'brush') === (p.path !== undefined), { message: 'Pinselstrich braucht einen Pfad, ein Punkt keinen', path: ['path'] });

const bodymapValue = z.strictObject({ presetId: z.string().min(1), points: z.array(bodymapPoint) });
export type BodymapValue = z.infer<typeof bodymapValue>;

export const bodymap = defineBlock<BodymapConfig, BodymapValue>({
  config: bodymapConfig,
  value: () => bodymapValue,
  /** Neues Formular zeigt das Standardbild bereits ausgewählt (Spec 05, BLK-03). */
  emptyValue: (c) => ({ presetId: c.defaultPresetId, points: [] }),
  isEmpty: (v) => v === undefined || v.points.length === 0,
  toDisplay: (v) => (v.points.length === 1 ? '1 Punkt' : `${v.points.length} Punkte`),
  toAnalysis: (v) => ({
    kind: 'points',
    presetId: v.presetId,
    points: v.points.map((p) => (p.intensity === undefined ? { x: p.x, y: p.y } : { x: p.x, y: p.y, intensity: p.intensity })),
  }),
});
