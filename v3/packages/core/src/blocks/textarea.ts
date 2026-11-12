import { z } from 'zod';
import { defineBlock, idSchema, isoDateTime } from './common.js';

export const textareaConfig = z.strictObject({ allowAttachments: z.boolean(), allowEvents: z.boolean() });
export type TextareaConfig = z.infer<typeof textareaConfig>;

export const textareaEvent = z.strictObject({
  id: idSchema,
  category: z.enum(['event', 'doctor']),
  title: z.string().trim().min(1),
  at: isoDateTime.optional(),
});

const textareaValue = z.strictObject({
  text: z.string().optional(),
  events: z.array(textareaEvent).optional(),
  attachmentIds: z.array(idSchema).optional(),
});
export type TextareaValue = z.infer<typeof textareaValue>;

export const textarea = defineBlock<TextareaConfig, TextareaValue>({
  config: textareaConfig,
  value: (c) =>
    textareaValue
      .refine((v) => c.allowEvents || v.events === undefined, { message: 'Ereignisse sind nicht erlaubt', path: ['events'] })
      .refine((v) => c.allowAttachments || v.attachmentIds === undefined, {
        message: 'Anhänge sind nicht erlaubt',
        path: ['attachmentIds'],
      }),
  emptyValue: () => ({}),
  isEmpty: (v) => v === undefined || (!v.text?.trim() && !v.events?.length && !v.attachmentIds?.length),
  toDisplay: (v) => [v.text?.trim(), ...(v.events ?? []).map((e) => e.title)].filter(Boolean).join(' · '),
});
