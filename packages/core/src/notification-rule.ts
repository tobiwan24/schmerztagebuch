// Schwellwert-Hinweis (Spec 06 „Hinweise / Schwellwerte“, A-089): Record-kind `notificationRule`.
import { z } from 'zod';

export const DEFAULT_COOLDOWN_HOURS = 24;

export const notificationRuleSchema = z.strictObject({
  id: z.string().min(1),
  diaryId: z.string().min(1),
  blockId: z.string().min(1),
  op: z.enum(['>=', '<=']),
  value: z.number().finite(),
  consecutiveDays: z.number().int().min(1).max(30),
  cooldownHours: z.number().int().min(1).max(24 * 30).default(DEFAULT_COOLDOWN_HOURS),
  hlc: z.string().min(1),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type NotificationRule = z.infer<typeof notificationRuleSchema>;
