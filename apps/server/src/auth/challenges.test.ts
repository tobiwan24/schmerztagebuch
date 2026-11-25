import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, type Db } from '../db.js';
import { migrate } from '../schema.js';
import { createChallenge, consumeChallenge, CHALLENGE_TTL_MS, ChallengeError } from './challenges.js';

let dir: string | undefined;
const dbs: Db[] = [];
afterEach(() => {
  for (const d of dbs.splice(0)) if (d.open) d.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function open(path: string): Db {
  const db = openDatabase(path);
  migrate(db);
  dbs.push(db);
  return db;
}

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ChallengeError);
    return (e as ChallengeError).code;
  }
  return 'kein Fehler';
}

describe('Challenges', () => {
  it('CRY-13: Challenge überlebt einen Server-Neustart innerhalb der TTL', () => {
    dir = mkdtempSync(join(tmpdir(), 'stb-chal-'));
    const path = join(dir, 'stb.sqlite');
    const t0 = 1_700_000_000_000;
    const before = open(path);
    const c = createChallenge(before, { purpose: 'login' }, t0);
    expect(c.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(c.expiresAt).toBe(t0 + CHALLENGE_TTL_MS);
    before.close(); // Neustart
    const after = open(path);
    expect(consumeChallenge(after, c.id, 'login', t0 + CHALLENGE_TTL_MS - 1)).toEqual({ challenge: c.challenge, userId: null });
  });

  it('CRY-13: abgelaufene Challenge → challenge-expired (auch nach Neustart)', () => {
    dir = mkdtempSync(join(tmpdir(), 'stb-chal-'));
    const path = join(dir, 'stb.sqlite');
    const t0 = 1_700_000_000_000;
    const c = createChallenge(open(path), { purpose: 'register', userId: 'u1' }, t0);
    dbs[0]!.close();
    const db = open(path);
    expect(code(() => consumeChallenge(db, c.id, 'register', t0 + CHALLENGE_TTL_MS))).toBe('challenge-expired');
    expect(CHALLENGE_TTL_MS).toBe(5 * 60 * 1000);
  });

  it('CRY-13: Challenge ist einmalig und an ihren Zweck gebunden', () => {
    const db = open(':memory:');
    const c = createChallenge(db, { purpose: 'login' }, 0);
    expect(code(() => consumeChallenge(db, c.id, 'register', 1))).toBe('challenge-expired');
    expect(consumeChallenge(db, c.id, 'login', 1).challenge).toBe(c.challenge);
    expect(code(() => consumeChallenge(db, c.id, 'login', 2))).toBe('challenge-expired');
    expect(code(() => consumeChallenge(db, 'unbekannt', 'login', 2))).toBe('challenge-expired');
  });

  it('CRY-13: pro Challenge-ID statt pro Nutzer — zwei parallele Challenges (Doppel-Tap) sind beide gültig', () => {
    const db = open(':memory:');
    const a = createChallenge(db, { purpose: 'add-credential', userId: 'u1' }, 0);
    const b = createChallenge(db, { purpose: 'add-credential', userId: 'u1' }, 10);
    expect(a.id).not.toBe(b.id);
    expect(a.challenge).not.toBe(b.challenge);
    expect(consumeChallenge(db, b.id, 'add-credential', 20).userId).toBe('u1');
    expect(consumeChallenge(db, a.id, 'add-credential', 30).userId).toBe('u1');
  });

  it('CRY-13: abgelaufene Challenges werden beim Anlegen neuer aufgeräumt', () => {
    const db = open(':memory:');
    createChallenge(db, { purpose: 'login' }, 0);
    createChallenge(db, { purpose: 'login' }, CHALLENGE_TTL_MS + 1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM challenges').get()).toEqual({ n: 1 });
  });
});
