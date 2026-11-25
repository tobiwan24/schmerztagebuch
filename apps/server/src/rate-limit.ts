// Einfacher In-Memory-Rate-Limiter (gleitendes Fenster über Zeitstempel je Schlüssel). Für einen einzelnen
// Server-Prozess im Homelab ausreichend; Zustand geht beim Neustart verloren (bewusst).
// Speicher ist begrenzt (`maxKeys`): beim Überschreiten fallen die ältesten Schlüssel weg (Map-Einfügereihenfolge).

export interface RateLimiter {
  /** Zählt einen Versuch. `allowed: false` → `retryAfterMs` bis zum nächsten freien Slot. */
  hit(key: string, now: number): { allowed: true } | { allowed: false; retryAfterMs: number };
}

export function createRateLimiter({ limit, windowMs, maxKeys = 10_000 }: { limit: number; windowMs: number; maxKeys?: number }): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    hit(key, now) {
      const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
      hits.delete(key); // neu einfügen → gilt als „jüngster" Schlüssel
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { allowed: false, retryAfterMs: recent[0]! + windowMs - now };
      }
      recent.push(now);
      hits.set(key, recent);
      while (hits.size > maxKeys) hits.delete(hits.keys().next().value!);
      return { allowed: true };
    },
  };
}
