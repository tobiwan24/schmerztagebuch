/** Injizierbare Zeitquelle (Spec 12: keine `Date.now()`-Aufrufe in `packages/*`). */
export interface Clock {
  /** Millisekunden seit Unix-Epoche. */
  now(): number;
}

/** Injizierbare Zufallsquelle (Spec 12: kein `Math.random()` in `packages/*`). */
export interface Random {
  /** Füllt `target` mit kryptographisch starken Zufallsbytes. */
  fill(target: Uint8Array): Uint8Array;
}

/** Standard-Zufallsquelle über WebCrypto (`crypto.getRandomValues`, auch auf älterem iOS verfügbar). */
export const cryptoRandom: Random = {
  fill: (target) => globalThis.crypto.getRandomValues(target),
};
