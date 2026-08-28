import type { FastifyInstance, FastifyReply } from 'fastify';
import argon2 from 'argon2';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { config } from '../config.js';
import { requireAuth } from '../plugins/auth.js';
import { createSession, destroySession } from '../services/sessions.js';
import { createUser, findUserById, findUserByUsername, setBackupCode } from '../services/users.js';
import { createCredential, findCredentialById, updateSignCount } from '../services/credentials.js';
import {
  buildAuthenticationOptions,
  buildRegistrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from '../services/webauthn.js';

function setSessionCookie(reply: FastifyReply, sessionId: string, expiresAt: Date): void {
  reply.setCookie(config.sessionCookieName, sessionId, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    expires: expiresAt,
  });
}

function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(config.sessionCookieName, { path: '/' });
}

export function registerAuthRoutes(app: FastifyInstance): void {
  // GET /api/auth/salt?username=… -> { kdf_salt }
  // Unkritisch/kein Geheimnis (siehe Spec) — bewusst ohne Auth, wird für den
  // Recovery-Flow auf einem neuen Gerät ohne Session benötigt.
  app.get<{ Querystring: { username?: string } }>('/api/auth/salt', async (request, reply) => {
    const username = request.query.username;
    if (!username) {
      return reply.code(400).send({ error: 'username_required' });
    }
    const user = findUserByUsername(username);
    if (!user) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.send({ kdf_salt: user.kdf_salt });
  });

  // POST /api/auth/webauthn/register-options -> Registrierungs-Challenge (inkl. PRF-Request)
  app.post<{ Body: { username?: string } }>('/api/auth/webauthn/register-options', async (request, reply) => {
    const username = request.body?.username;
    if (!username) {
      return reply.code(400).send({ error: 'username_required' });
    }
    if (findUserByUsername(username)) {
      return reply.code(409).send({ error: 'username_taken' });
    }
    const options = await buildRegistrationOptions(username);
    return reply.send(options);
  });

  // POST /api/auth/webauthn/register-verify -> legt User + erste credentials-Zeile an
  //
  // Annahme (Spec nennt keine Response-Felder für diesen Endpunkt): die
  // Response enthält `kdf_salt`, da der nachfolgende Pflichtschritt
  // (POST /api/auth/backup-code/init) laut Spec keinen kdf_salt im Body
  // mitschickt, der Client ihn zur authVerifier/KEK_backup-Ableitung aber
  // bereits kennen muss. Konservativste Lesart: Server erzeugt kdf_salt bei
  // User-Anlage und gibt ihn hier einmalig zurück (siehe auch
  // services/users.ts). Ebenso wird hier bereits die Session gesetzt
  // (Registrierung = erster Login), da Spec-Schritt 4 (Backup-Code-Pflicht)
  // direkt im Anschluss ohne separaten Login-Schritt erfolgt.
  app.post<{
    Body: {
      username?: string;
      response?: RegistrationResponseJSON;
      wrapped_dek_passkey?: string;
      device_label?: string;
    };
  }>('/api/auth/webauthn/register-verify', async (request, reply) => {
    const { username, response, wrapped_dek_passkey, device_label } = request.body ?? {};
    if (!username || !response || !wrapped_dek_passkey) {
      return reply.code(400).send({ error: 'invalid_request' });
    }
    if (findUserByUsername(username)) {
      return reply.code(409).send({ error: 'username_taken' });
    }

    let verification;
    try {
      verification = await verifyRegistration(username, response);
    } catch (err) {
      request.log.warn({ err }, 'webauthn registration verification failed');
      return reply.code(400).send({ error: 'verification_failed' });
    }
    if (!verification.verified || !verification.registrationInfo) {
      return reply.code(400).send({ error: 'verification_failed' });
    }

    const { credential } = verification.registrationInfo;
    const user = createUser(username);
    createCredential({
      userId: user.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      signCount: credential.counter,
      wrappedDekPasskey: wrapped_dek_passkey,
      deviceLabel: device_label,
    });

    const session = createSession(user.id);
    setSessionCookie(reply, session.id, session.expiresAt);

    return reply.send({ userId: user.id, username: user.username, kdf_salt: user.kdf_salt });
  });

  // POST /api/auth/webauthn/add-credential-options -> Registrierungs-Challenge für einen
  // ZUSÄTZLICHEN Passkey auf einem bereits authentifizierten Account (Pflichtschritt nach
  // Backup-Code-Recovery, siehe Spec "Backup-Code-Wiederherstellung" Schritt 5a: "neuen
  // Passkey auf diesem Gerät registrieren"). Im Unterschied zu register-options/-verify
  // wird hier KEIN neuer User angelegt, sondern nur eine weitere Zeile in `credentials`
  // für request.userId. Nicht in der Spec einzeln benannt, aber technisch zwingend, da
  // register-verify für einen bereits existierenden Username sonst 409 zurückgibt.
  app.post('/api/auth/webauthn/add-credential-options', { preHandler: requireAuth }, async (request, reply) => {
    const user = findUserById(request.userId!);
    if (!user) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const options = await buildRegistrationOptions(user.username);
    return reply.send(options);
  });

  // POST /api/auth/webauthn/add-credential-verify { response, wrapped_dek_passkey, device_label? }
  // -> legt eine weitere credentials-Zeile für den aktuell eingeloggten User an.
  app.post<{
    Body: {
      response?: RegistrationResponseJSON;
      wrapped_dek_passkey?: string;
      device_label?: string;
    };
  }>(
    '/api/auth/webauthn/add-credential-verify',
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = findUserById(request.userId!);
      if (!user) {
        return reply.code(401).send({ error: 'unauthorized' });
      }
      const { response, wrapped_dek_passkey, device_label } = request.body ?? {};
      if (!response || !wrapped_dek_passkey) {
        return reply.code(400).send({ error: 'invalid_request' });
      }

      let verification;
      try {
        verification = await verifyRegistration(user.username, response);
      } catch (err) {
        request.log.warn({ err }, 'webauthn add-credential verification failed');
        return reply.code(400).send({ error: 'verification_failed' });
      }
      if (!verification.verified || !verification.registrationInfo) {
        return reply.code(400).send({ error: 'verification_failed' });
      }

      const { credential } = verification.registrationInfo;
      createCredential({
        userId: user.id,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        signCount: credential.counter,
        wrappedDekPasskey: wrapped_dek_passkey,
        deviceLabel: device_label,
      });

      return reply.send({ ok: true });
    },
  );

  // POST /api/auth/backup-code/init { authVerifier, wrapped_dek_backup } -> speichert backup_auth_hash + wrapped_dek_backup
  app.post<{ Body: { authVerifier?: string; wrapped_dek_backup?: string } }>(
    '/api/auth/backup-code/init',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { authVerifier, wrapped_dek_backup } = request.body ?? {};
      if (!authVerifier || !wrapped_dek_backup) {
        return reply.code(400).send({ error: 'invalid_request' });
      }
      const hash = await argon2.hash(authVerifier);
      setBackupCode(request.userId!, hash, wrapped_dek_backup);
      return reply.send({ ok: true });
    },
  );

  // POST /api/auth/webauthn/login-options?username=… -> Login-Challenge
  app.post<{ Querystring: { username?: string } }>('/api/auth/webauthn/login-options', async (request, reply) => {
    const username = request.query.username;
    if (!username) {
      return reply.code(400).send({ error: 'username_required' });
    }
    const options = await buildAuthenticationOptions(username);
    return reply.send(options);
  });

  // POST /api/auth/webauthn/login-verify -> Set-Cookie session, { wrapped_dek_passkey }
  app.post<{ Body: { username?: string; response?: AuthenticationResponseJSON } }>(
    '/api/auth/webauthn/login-verify',
    async (request, reply) => {
      const { username, response } = request.body ?? {};
      if (!username || !response) {
        return reply.code(400).send({ error: 'invalid_request' });
      }
      const credential = findCredentialById(response.id);
      const user = findUserByUsername(username);
      if (!credential || !user || credential.user_id !== user.id) {
        return reply.code(400).send({ error: 'verification_failed' });
      }

      let verification;
      try {
        verification = await verifyAuthentication(username, response, credential);
      } catch (err) {
        request.log.warn({ err }, 'webauthn authentication verification failed');
        return reply.code(400).send({ error: 'verification_failed' });
      }
      if (!verification.verified) {
        return reply.code(400).send({ error: 'verification_failed' });
      }

      updateSignCount(credential.credential_id, verification.authenticationInfo.newCounter);
      const session = createSession(user.id);
      setSessionCookie(reply, session.id, session.expiresAt);

      return reply.send({ wrapped_dek_passkey: credential.wrapped_dek_passkey });
    },
  );

  // POST /api/auth/recover { username, authVerifier } -> Set-Cookie session, { wrapped_dek_backup }
  app.post<{ Body: { username?: string; authVerifier?: string } }>('/api/auth/recover', async (request, reply) => {
    const { username, authVerifier } = request.body ?? {};
    if (!username || !authVerifier) {
      return reply.code(400).send({ error: 'invalid_request' });
    }
    const user = findUserByUsername(username);
    if (!user || !user.backup_auth_hash || !user.wrapped_dek_backup) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    const ok = await argon2.verify(user.backup_auth_hash, authVerifier);
    if (!ok) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    const session = createSession(user.id);
    setSessionCookie(reply, session.id, session.expiresAt);
    return reply.send({ wrapped_dek_backup: user.wrapped_dek_backup });
  });

  // POST /api/auth/backup-code/rotate { authVerifier(neu), wrapped_dek_backup(neu) } -> ersetzt alten Code
  app.post<{ Body: { authVerifier?: string; wrapped_dek_backup?: string } }>(
    '/api/auth/backup-code/rotate',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { authVerifier, wrapped_dek_backup } = request.body ?? {};
      if (!authVerifier || !wrapped_dek_backup) {
        return reply.code(400).send({ error: 'invalid_request' });
      }
      const hash = await argon2.hash(authVerifier);
      setBackupCode(request.userId!, hash, wrapped_dek_backup);
      return reply.send({ ok: true });
    },
  );

  // POST /api/auth/logout
  app.post('/api/auth/logout', async (request, reply) => {
    const sessionId = request.cookies[config.sessionCookieName];
    if (sessionId) {
      destroySession(sessionId);
    }
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  // GET /api/auth/me -> { userId, username }
  app.get('/api/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = findUserById(request.userId!);
    if (!user) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    return reply.send({ userId: user.id, username: user.username });
  });
}
