import type { PayloadCodec } from './types.js';

export interface CodecRegistry {
  get(id: string): PayloadCodec;
}

export function createCodecRegistry(codecs: readonly PayloadCodec[]): CodecRegistry {
  const byId = new Map(codecs.map((c) => [c.id, c]));
  return {
    get(id) {
      const c = byId.get(id);
      if (!c) throw new Error(`Codec "${id}" ist nicht registriert`);
      return c;
    },
  };
}
