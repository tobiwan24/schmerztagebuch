// Hybrid Logical Clock (Spec 00 Glossar, Spec 04): deterministische Ordnung für die Konfliktauflösung.
// Format: "<ms, 13 Stellen>:<Zähler, 4 hex>:<Knoten-ID>" — fixe Breiten, daher stimmt der String-Vergleich der
// ersten beiden Teile mit der zeitlichen Ordnung überein; der Knoten entscheidet Gleichstände deterministisch.
import type { Clock } from './env.js';

export interface HlcParts {
  ms: number;
  counter: number;
  node: string;
}

const HLC_RE = /^(\d{13}):([0-9a-f]{4}):([^:]+)$/;
const MAX_COUNTER = 0xffff;

export function formatHlc({ ms, counter, node }: HlcParts): string {
  if (!Number.isInteger(ms) || ms < 0 || ms > 9_999_999_999_999) throw new RangeError(`HLC-Zeit außerhalb des Bereichs: ${ms}`);
  if (!Number.isInteger(counter) || counter < 0 || counter > MAX_COUNTER) throw new RangeError(`HLC-Zähler außerhalb des Bereichs: ${counter}`);
  if (!node || node.includes(':')) throw new RangeError('HLC-Knoten-ID darf nicht leer sein und kein ":" enthalten');
  return `${String(ms).padStart(13, '0')}:${counter.toString(16).padStart(4, '0')}:${node}`;
}

export function parseHlc(hlc: string): HlcParts {
  const m = HLC_RE.exec(hlc);
  if (!m) throw new TypeError(`Ungültiger HLC: ${hlc}`);
  return { ms: Number(m[1]), counter: parseInt(m[2]!, 16), node: m[3]! };
}

export function compareHlc(a: string, b: string): number {
  const pa = parseHlc(a);
  const pb = parseHlc(b);
  return pa.ms - pb.ms || pa.counter - pb.counter || (pa.node < pb.node ? -1 : pa.node > pb.node ? 1 : 0);
}

export const maxHlc = (a: string, b: string): string => (compareHlc(a, b) >= 0 ? a : b);

export interface HlcClock {
  /** Neuer Zeitstempel für eine lokale Änderung. */
  tick(): string;
  /** Verarbeitet einen empfangenen Zeitstempel; das Ergebnis liegt über lokalem und entferntem Stand. */
  receive(remote: string): string;
}

/** HLC-Uhr eines Geräts. `last` = zuletzt vergebener Stand (z. B. aus der DB), damit Neustarts monoton bleiben. */
export function createHlcClock(clock: Clock, node: string, last?: string): HlcClock {
  let state: HlcParts = last ? { ...parseHlc(last), node } : { ms: -1, counter: 0, node };

  function advance(ms: number, counter: number): string {
    if (counter > MAX_COUNTER) {
      ms += 1;
      counter = 0;
    }
    state = { ms, counter, node };
    return formatHlc(state);
  }

  return {
    tick() {
      const now = Math.floor(clock.now());
      return now > state.ms ? advance(now, 0) : advance(state.ms, state.counter + 1);
    },
    receive(remote) {
      const r = parseHlc(remote);
      const now = Math.floor(clock.now());
      const ms = Math.max(now, state.ms, r.ms);
      let counter: number;
      if (ms === state.ms && ms === r.ms) counter = Math.max(state.counter, r.counter) + 1;
      else if (ms === state.ms) counter = state.counter + 1;
      else if (ms === r.ms) counter = r.counter + 1;
      else counter = 0;
      return advance(ms, counter);
    },
  };
}
