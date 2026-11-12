// UUID v7 (RFC 9562): 48 Bit Unix-Millisekunden, 4 Bit Version, 12 Bit Zähler (rand_a), 2 Bit Variante, 62 Bit Zufall.
// Monotonie innerhalb derselben Millisekunde über den 12-Bit-Zähler (RFC 9562 §6.2, Methode 1); läuft er über oder
// springt die Uhr zurück, wird die zuletzt verwendete Millisekunde weitergezählt.
import { cryptoRandom, type Clock, type Random } from './env.js';

const MAX_MS = 2 ** 48 - 1;
const COUNTER_MAX = 0xfff;
const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface IdGenerator {
  /** Neue, eindeutige UUID v7, streng aufsteigend gegenüber allen vorherigen dieses Generators. */
  newId(): string;
}

export function createIdGenerator(clock: Clock, random: Random = cryptoRandom): IdGenerator {
  let lastMs = -1;
  let counter = 0;
  const buf = new Uint8Array(10);

  /** Zähler-Startwert mit freiem oberstem Bit, damit viel Platz zum Hochzählen bleibt. */
  const seedCounter = (): number => {
    random.fill(buf);
    return ((buf[0]! << 8) | buf[1]!) & 0x7ff;
  };

  return {
    newId() {
      const now = Math.floor(clock.now());
      if (!Number.isFinite(now) || now < 0 || now > MAX_MS) throw new RangeError(`Ungültige Zeit für UUID v7: ${now}`);
      if (now > lastMs) {
        lastMs = now;
        counter = seedCounter();
      } else if (++counter > COUNTER_MAX) {
        if (lastMs >= MAX_MS) throw new RangeError('UUID-v7-Zeitraum erschöpft');
        lastMs += 1;
        counter = seedCounter();
      }
      random.fill(buf);
      const b = new Uint8Array(16);
      let ms = lastMs;
      for (let i = 5; i >= 0; i--) {
        b[i] = ms % 256;
        ms = Math.floor(ms / 256);
      }
      b[6] = 0x70 | (counter >> 8);
      b[7] = counter & 0xff;
      b[8] = 0x80 | (buf[2]! & 0x3f);
      for (let i = 9; i < 16; i++) b[i] = buf[i - 6]!;
      const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    },
  };
}

export function isUuidV7(id: string): boolean {
  return UUID_V7_RE.test(id);
}

/**
 * Deterministische UUID v7 aus Zeitpunkt und Seed-Bytes (z. B. SHA-256 einer externen ID). Gleiche Eingaben ergeben
 * dieselbe ID — so landen Doppelverarbeitungen (z. B. Intake-Abholung auf zwei Geräten) auf demselben Record.
 */
export function uuidV7FromSeed(ms: number, seed: Uint8Array): string {
  if (seed.length < 10) throw new RangeError('Seed braucht mindestens 10 Byte');
  if (!Number.isInteger(ms) || ms < 0 || ms > MAX_MS) throw new RangeError(`Ungültige Zeit für UUID v7: ${ms}`);
  const b = new Uint8Array(16);
  let t = ms;
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  b[6] = 0x70 | (seed[0]! & 0x0f);
  b[7] = seed[1]!;
  b[8] = 0x80 | (seed[2]! & 0x3f);
  for (let i = 9; i < 16; i++) b[i] = seed[i - 6]!;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Unix-Millisekunden aus einer UUID v7. */
export function idTimestamp(id: string): number {
  if (!isUuidV7(id)) throw new TypeError(`Keine UUID v7: ${id}`);
  return parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
}
