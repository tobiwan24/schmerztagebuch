// HTTP-Endpunkte für Konto, Login und Tagebuch-Anlage (Spec 03; API-Form in DECISIONS A-022 festgelegt).
// Alle Antworten `no-store`; Auth-Endpunkte mit Rate-Limit pro IP (Spec 03 „Rate-Limits auf Auth-Endpunkten").
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { Db } from '../db.js';
import { createRateLimiter } from '../rate-limit.js';
import type { AuthProvider } from './types.js';
import { requirePrincipal } from './require.js';
import { createSession, hashToken, SESSION_COOKIE } from './sessions.js';
import { recoveryFinish, recoveryStart } from './recovery.js';
import {
  AuthFlowError,
  USER_KEY_KINDS,
  authenticationOptions,
  createDiary,
  registrationOptions,
  userKeys,
  verifyAuthentication,
  verifyRegistration,
  type RpConfig,
} from './webauthn.js';

export const AUTH_RATE_LIMIT = { limit: 30, windowMs: 60_000 };
/** Recovery strenger (Spec 03): 5 Versuche je 15 min pro IP und pro Benutzername. */
export const RECOVERY_RATE_LIMIT = { limit: 5, windowMs: 15 * 60_000 };

const blob = z.string().min(1).max(16_384);
const device = z.strictObject({ nameCt: blob, publicKey: blob });
const userKey = z.strictObject({ kind: z.enum(USER_KEY_KINDS), credentialId: z.string().max(1024).optional(), blob });
// Die WebAuthn-Antworten prüft @simplewebauthn/server vollständig; hier nur Form und Größe.
const webauthnResponse = z.object({ id: z.string().min(1).max(1024), rawId: z.string().max(1024), type: z.literal('public-key'), response: z.record(z.string(), z.unknown()) }).passthrough();
const username = z.string().trim().min(3).max(64).regex(/^[\p{L}\p{N}._@+-]+$/u);

// Optional: lokale User-ID des Geräts übernehmen (A-021) — sonst vergibt der Server eine neue.
const registerOptionsBody = z.strictObject({ username, userId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/).optional() });
const registerVerifyBody = z.strictObject({
  challengeId: z.string().min(1).max(64),
  username,
  response: webauthnResponse,
  keys: z.array(userKey).min(1).max(8)
    .refine((ks) => ['identity-pub', 'identity-priv-enc', 'umk-wrap-passkey', 'umk-wrap-backup', 'backup-verifier'].every((k) => ks.some((x) => x.kind === k)), {
      message: 'Identity-Schlüssel und beide UMK-Wraps sind Pflicht (Backup-Code nicht überspringbar)',
    }),
  device,
});
const loginVerifyBody = z.strictObject({ challengeId: z.string().min(1).max(64), response: webauthnResponse, device });
const createDiaryBody = z.strictObject({ diaryId: z.string().min(1).max(64), wrappedDk: blob });
const recoveryStartBody = z.strictObject({ username, backupAuth: z.string().min(16).max(256) });
const recoveryFinishBody = z.strictObject({ challengeId: z.string().min(1).max(64), response: webauthnResponse, keys: z.array(userKey).min(3).max(4), device });

const STATUS: Record<AuthFlowError['code'], number> = { 'challenge-expired': 400, 'username-taken': 409, 'verification-failed': 401, 'no-credential': 404, 'wrong-backup-code': 401 };

export function registerAccountRoutes(app: FastifyInstance, { db, auth, now, rp }: { db: Db; auth: AuthProvider; now: () => number; rp: RpConfig }): void {
  const limiter = createRateLimiter(AUTH_RATE_LIMIT);
  const recoveryLimiter = createRateLimiter(RECOVERY_RATE_LIMIT);

  app.addHook('onSend', async (req, reply) => {
    if (req.url.startsWith('/api/')) void reply.header('cache-control', 'no-store');
  });

  function limited(ip: string, reply: FastifyReply): boolean {
    const r = limiter.hit(ip, now());
    if (r.allowed) return false;
    void reply.code(429).header('retry-after', Math.ceil(r.retryAfterMs / 1000)).send({ error: 'rate-limited' });
    return true;
  }

  async function run<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof AuthFlowError) {
        void reply.code(STATUS[e.code]).send({ error: e.code });
        return undefined;
      }
      throw e;
    }
  }

  app.post('/api/v1/auth/register/options', async (req, reply) => {
    if (limited(req.ip, reply)) return reply;
    const body = registerOptionsBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid-request' });
    const r = await run(reply, () => registrationOptions(db, rp, body.data.username, now(), body.data.userId));
    return r ?? reply;
  });

  app.post('/api/v1/auth/register/verify', async (req, reply) => {
    if (limited(req.ip, reply)) return reply;
    const body = registerVerifyBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid-request' });
    const r = await run(reply, () =>
      verifyRegistration(db, rp, { ...body.data, response: body.data.response as unknown as RegistrationResponseJSON }, now()),
    );
    if (!r) return reply;
    const s = createSession(db, r.userId, r.deviceId, now());
    return reply.header('set-cookie', s.setCookie).code(201).send(r);
  });

  app.post('/api/v1/auth/login/options', async (req, reply) => {
    if (limited(req.ip, reply)) return reply;
    return authenticationOptions(db, rp, now());
  });

  app.post('/api/v1/auth/login/verify', async (req, reply) => {
    if (limited(req.ip, reply)) return reply;
    const body = loginVerifyBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid-request' });
    const r = await run(reply, () =>
      verifyAuthentication(db, rp, { ...body.data, response: body.data.response as unknown as AuthenticationResponseJSON }, now()),
    );
    if (!r) return reply;
    const s = createSession(db, r.userId, r.deviceId, now());
    return reply.header('set-cookie', s.setCookie).send(r);
  });

  app.post('/api/v1/auth/recovery/start', async (req, reply) => {
    const body = recoveryStartBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid-request' });
    for (const key of [`ip:${req.ip}`, `user:${body.data.username}`]) {
      const r = recoveryLimiter.hit(key, now());
      if (!r.allowed) return reply.code(429).header('retry-after', Math.ceil(r.retryAfterMs / 1000)).send({ error: 'rate-limited' });
    }
    const r = await run(reply, () => recoveryStart(db, rp, body.data, now()));
    return r ?? reply;
  });

  app.post('/api/v1/auth/recovery/finish', async (req, reply) => {
    if (limited(req.ip, reply)) return reply;
    const body = recoveryFinishBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid-request' });
    const r = await run(reply, () => recoveryFinish(db, rp, { ...body.data, response: body.data.response as unknown as RegistrationResponseJSON }, now()));
    if (!r) return reply;
    const s = createSession(db, r.userId, r.deviceId, now());
    return reply.header('set-cookie', s.setCookie).code(201).send(r);
  });

  app.get('/api/v1/auth/me', async (req, reply) => {
    const p = await requirePrincipal(auth, req, reply);
    if (!p) return reply;
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(p.userId) as { username: string } | undefined;
    return { userId: p.userId, deviceId: p.deviceId, username: user?.username, keys: userKeys(db, p.userId) };
  });

  app.post('/api/v1/auth/logout', async (req, reply) => {
    const token = /(?:^|;\s*)stb_session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    return reply.header('set-cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`).code(204).send();
  });

  app.post('/api/v1/diaries', async (req, reply) => {
    const p = await requirePrincipal(auth, req, reply);
    if (!p) return reply;
    const body = createDiaryBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid-request' });
    const r = createDiary(db, { ...body.data, userId: p.userId }, now());
    return r === 'ok' ? reply.code(201).send({ diaryId: body.data.diaryId }) : reply.code(409).send({ error: 'exists' });
  });

  /** Tagebücher des Nutzers mit seinem verpackten DK (neues Gerät: DKs entpacken, dann pullen). */
  app.get('/api/v1/diaries', async (req, reply) => {
    const p = await requirePrincipal(auth, req, reply);
    if (!p) return reply;
    const rows = db
      .prepare('SELECT diary_id, role, key_epoch, wrapped_dk FROM memberships WHERE principal_id = ? AND revoked_at IS NULL ORDER BY created_at')
      .all(p.userId) as { diary_id: string; role: string; key_epoch: number; wrapped_dk: string }[];
    return rows.map((r) => ({ diaryId: r.diary_id, role: r.role, keyEpoch: r.key_epoch, wrappedDk: r.wrapped_dk }));
  });
}
