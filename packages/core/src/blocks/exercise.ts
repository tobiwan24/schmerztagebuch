import { z } from 'zod';
import { defineBlock, idSchema } from './common.js';

export const EXERCISE_MAX_STEPS = 20;

const httpsUrl = z
  .string()
  .max(2000)
  .refine(
    (s) => {
      try {
        return new URL(s).protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Nur https-Links erlaubt' },
  );

const posInt = z.number().int().positive();

/** Schritt: reiner Text (alte Daten) oder Text und/oder Bild (Übungsmedien, RDM-033). */
export const exerciseStepSchema = z.union([
  z.string().trim().min(1),
  z
    .strictObject({ text: z.string().trim().min(1).optional(), imageId: idSchema.optional() })
    .refine((s) => s.text !== undefined || s.imageId !== undefined, { message: 'Schritt braucht Text oder Bild' }),
]);
export type ExerciseStep = z.infer<typeof exerciseStepSchema>;

export const exerciseConfig = z
  .strictObject({
    description: z.string().optional(),
    steps: z.array(exerciseStepSchema).max(EXERCISE_MAX_STEPS).optional(),
    targetSets: posInt.optional(),
    targetReps: posInt.optional(),
    targetDurationSec: posInt.optional(),
    videoUrl: httpsUrl.optional(),
    /** Hochgeladenes Video (`exerciseMedia`, RDM-033), zusätzlich zum Link. */
    videoMediaId: idSchema.optional(),
    levels: z.array(z.strictObject({ id: idSchema, label: z.string().trim().min(1) })).optional(),
  })
  .refine((c) => !c.levels || new Set(c.levels.map((l) => l.id)).size === c.levels.length, {
    message: 'Stufen-IDs müssen eindeutig sein',
    path: ['levels'],
  });
export type ExerciseConfig = z.infer<typeof exerciseConfig>;

const exerciseValue = z.strictObject({
  done: z.boolean(),
  sets: z.number().int().min(0).optional(),
  reps: z.number().int().min(0).optional(),
  durationSec: z.number().int().min(0).optional(),
  levelId: idSchema.optional(),
  painDuring: z.number().int().min(0).max(10).optional(),
});
export type ExerciseValue = z.infer<typeof exerciseValue>;

export const exercise = defineBlock<ExerciseConfig, ExerciseValue>({
  config: exerciseConfig,
  value: (c) =>
    exerciseValue.superRefine((v, ctx) => {
      if (v.levelId !== undefined && !c.levels?.some((l) => l.id === v.levelId)) {
        ctx.addIssue({ code: 'custom', message: 'Unbekannte Stufe', path: ['levelId'] });
      }
    }),
  emptyValue: () => ({ done: false }),
  isEmpty: (v) =>
    v === undefined ||
    (!v.done &&
      v.sets === undefined &&
      v.reps === undefined &&
      v.durationSec === undefined &&
      v.levelId === undefined &&
      v.painDuring === undefined),
  toDisplay: (v, c) => {
    const parts: string[] = [v.done ? 'erledigt' : 'nicht erledigt'];
    if (v.sets !== undefined && v.reps !== undefined) parts.push(`${v.sets} × ${v.reps}`);
    else if (v.sets !== undefined) parts.push(`${v.sets} Sätze`);
    else if (v.reps !== undefined) parts.push(`${v.reps} Wdh.`);
    if (v.durationSec !== undefined) parts.push(`${v.durationSec} s`);
    const level = c.levels?.find((l) => l.id === v.levelId);
    if (level) parts.push(level.label);
    if (v.painDuring !== undefined) parts.push(`Schmerz ${v.painDuring}`);
    return parts.join(', ');
  },
  toAnalysis: (v, c) => {
    const levelIndex = c.levels?.findIndex((l) => l.id === v.levelId) ?? -1;
    const level = levelIndex >= 0 ? c.levels![levelIndex] : undefined;
    return {
      kind: 'exercise',
      done: v.done,
      ...(v.sets !== undefined ? { sets: v.sets } : {}),
      ...(v.reps !== undefined ? { reps: v.reps } : {}),
      ...(v.durationSec !== undefined ? { durationSec: v.durationSec } : {}),
      ...(v.levelId !== undefined ? { levelId: v.levelId } : {}),
      ...(level ? { levelLabel: level.label, levelIndex } : {}),
      ...(v.painDuring !== undefined ? { painDuring: v.painDuring } : {}),
    };
  },
});
