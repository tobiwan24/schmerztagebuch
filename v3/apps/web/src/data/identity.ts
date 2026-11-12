// Geräte-Identität und HLC-Stempel für lokale Änderungen (Spec 02/04). Im Modus „nur auf diesem Gerät" gibt es keine
// Server-User-ID: `authorId` ist eine lokale User-ID, die beim Wechsel auf ein Konto übernommen wird (DECISIONS A-021).
import { createHlcClock, type Clock, type HlcClock } from '@stb/core';
import type { StbDb } from './db.js';

const IDENTITY_ID = 'identity';
const HLC_ID = 'hlc';

export interface Identity {
  userId: string;
  /** HLC-Knoten dieses Geräts. */
  node: string;
}

export interface Stamp {
  hlc: string;
  authorId: string;
  /** ISO-Zeitpunkt der Änderung. */
  at: string;
}

export interface Stamper {
  identity(): Promise<Identity>;
  /** Neuer HLC-Stempel; der letzte Stand wird gespeichert, damit Neustarts monoton bleiben. */
  stamp(): Promise<Stamp>;
}

export function createStamper(db: StbDb, clock: Clock, newId: () => string): Stamper {
  let ready: Promise<{ identity: Identity; hlc: HlcClock }> | null = null;

  function init() {
    ready ??= db.transaction('rw', db.device, async () => {
      let identity = (await db.device.get(IDENTITY_ID))?.value as Identity | undefined;
      if (!identity) {
        identity = { userId: newId(), node: newId() };
        await db.device.put({ id: IDENTITY_ID, value: identity });
      }
      const last = (await db.device.get(HLC_ID))?.value as string | undefined;
      return { identity, hlc: createHlcClock(clock, identity.node, last) };
    });
    return ready;
  }

  return {
    async identity() {
      return (await init()).identity;
    },
    async stamp() {
      const { identity, hlc } = await init();
      const value = hlc.tick();
      await db.device.put({ id: HLC_ID, value });
      return { hlc: value, authorId: identity.userId, at: new Date(clock.now()).toISOString() };
    },
  };
}
