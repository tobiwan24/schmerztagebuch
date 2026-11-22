import { z } from 'zod';
import { defineBlock, isoDateTime } from './common.js';

export const dateConfig = z.strictObject({ mode: z.enum(['date', 'datetime', 'duration', 'range']) });
export type DateConfig = z.infer<typeof dateConfig>;

export type DateValue = { at?: string } | { start: string; end: string } | { minutes: number };

const atDate = z.strictObject({ at: z.iso.date().optional() });
const atDateTime = z.strictObject({ at: isoDateTime.optional() });
const duration = z.strictObject({ minutes: z.number().finite().min(0) });
const range = z
  .strictObject({ start: isoDateTime, end: isoDateTime })
  .refine((v) => Date.parse(v.start) <= Date.parse(v.end), { message: 'start muss vor end liegen', path: ['end'] });

const schemaFor = (mode: DateConfig['mode']): z.ZodType<DateValue, unknown> =>
  ({ date: atDate, datetime: atDateTime, duration, range })[mode];

export const date = defineBlock<DateConfig, DateValue>({
  config: dateConfig,
  value: (c) => schemaFor(c.mode),
  emptyValue: (c) => (c.mode === 'date' || c.mode === 'datetime' ? {} : undefined),
  isEmpty: (v) => v === undefined || ('at' in v ? !v.at : false) || Object.keys(v).length === 0,
  toDisplay: (v) => {
    if ('minutes' in v) return `${v.minutes} min`;
    if ('start' in v) return `${v.start} – ${v.end}`;
    return v.at ?? '';
  },
  toAnalysis: (v) => {
    if ('minutes' in v) return { kind: 'time', durationMinutes: v.minutes };
    if ('start' in v) {
      const durationMinutes = (Date.parse(v.end) - Date.parse(v.start)) / 60_000;
      return { kind: 'time', start: v.start, end: v.end, durationMinutes };
    }
    return v.at ? { kind: 'time', at: v.at } : { kind: 'time' };
  },
});
