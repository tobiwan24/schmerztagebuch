// Lokale Datums-/Uhrzeitangaben aus v2 (ohne Zeitzone gespeichert) in ISO-Zeitpunkte einer Zeitzone umrechnen.

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    fmtCache.set(timeZone, f);
  }
  return f;
}

/** Abstand der Zeitzone zu UTC in Minuten zum Zeitpunkt `ms`. */
export function zoneOffsetMinutes(ms: number, timeZone: string): number {
  const p = Object.fromEntries(formatter(timeZone).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

function offsetSuffix(min: number): string {
  if (min === 0) return 'Z';
  const sign = min < 0 ? '-' : '+';
  const a = Math.abs(min);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

/** ISO-Zeitpunkt mit dem Offset der Zeitzone zu diesem Zeitpunkt. */
export function isoInZone(ms: number, timeZone: string): string {
  const off = zoneOffsetMinutes(ms, timeZone);
  const local = new Date(ms + off * 60_000).toISOString().slice(0, 19);
  return local + offsetSuffix(off);
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

/**
 * Wandzeit (`YYYY-MM-DD` + `HH:MM`) in der Zeitzone → Unix-ms. Bei Zeitumstellungen: nicht existierende Zeit (Lücke)
 * wird nach vorn verschoben; bei doppelter Zeit gilt einer der beiden Zeitpunkte (deterministisch). `undefined` bei ungültiger Eingabe.
 */
export function wallTimeToMs(date: string, time: string, timeZone: string): number | undefined {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time);
  if (!d || !t) return undefined;
  const [y, mo, da, h, mi] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2])];
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return undefined;
  const guess = Date.UTC(y, mo - 1, da, h, mi);
  if (new Date(guess).getUTCDate() !== da) return undefined;
  const o1 = zoneOffsetMinutes(guess, timeZone);
  let ms = guess - o1 * 60_000;
  const o2 = zoneOffsetMinutes(ms, timeZone);
  if (o2 !== o1) {
    const alt = guess - o2 * 60_000;
    // In der Lücke passt keiner der beiden Offsets genau → späteren Zeitpunkt nehmen; sonst den passenden.
    ms = zoneOffsetMinutes(alt, timeZone) === o2 ? Math.min(ms, alt) : Math.max(ms, alt);
  }
  return ms;
}

/** Ist `s` ein gültiges ISO-Datum (`YYYY-MM-DD`)? */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCDate() === Number(m[3]) && d.getUTCMonth() === Number(m[2]) - 1;
}
