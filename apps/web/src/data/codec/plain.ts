import type { PayloadCodec } from './types.js';

/** v3.0-Standard: JSON-String (entkoppelt gespeicherte Daten von Objektreferenzen). */
export const plainCodec: PayloadCodec = {
  id: 'plain',
  encode: async (obj) => JSON.stringify(obj),
  decode: async (raw) => {
    if (typeof raw !== 'string') throw new TypeError('plain-Codec erwartet einen JSON-String');
    return JSON.parse(raw) as unknown;
  },
};
