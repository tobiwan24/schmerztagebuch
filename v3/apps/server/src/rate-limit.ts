// Einfacher In-Memory-Rate-Limiter (gleitendes Fenster über Zeitstempel je Schlüssel). Für einen einzelnen
// Server-Prozess im Homelab ausreichend; Zustand geht beim Neustart verloren (bewusst).

export interface RateLimiter {
  /** Zählt einen Versuch. `allowed: false` → `retryAfterMs` bis zum nächsten freien Slot. */
  hit(key: string, now: number): { allowed: true } | { allowed: false; retryAfterMs: number };
}

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    hit(key, now) {
      const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { allowed: false, retryAfterMs: recent[0]! + windowMs - now };
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => t > now - windowMs)) hits.delete(k);
      return { allowed: true };
    },
  };
}
