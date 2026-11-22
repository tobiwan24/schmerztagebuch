import type { FastifyRequest } from 'fastify';

/** Angemeldeter Akteur einer Anfrage. */
export interface Principal {
  userId: string;
  deviceId?: string;
}

/**
 * Austauschbare Authentifizierung. Der Server nutzt `sessionAuth` (Cookie); Tests können `headerAuth` verwenden.
 * Sitzungen entstehen nach erfolgreichem WebAuthn-Login (M7).
 */
export interface AuthProvider {
  authenticate(req: FastifyRequest): Principal | null | Promise<Principal | null>;
}

export const noAuth: AuthProvider = { authenticate: () => null };
