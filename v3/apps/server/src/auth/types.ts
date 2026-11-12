import type { FastifyRequest } from 'fastify';

/** Angemeldeter Akteur einer Anfrage. */
export interface Principal {
  userId: string;
  deviceId?: string;
}

/**
 * Austauschbare Authentifizierung. Die WebAuthn-/Session-Implementierung (Spec 03) folgt mit CRY-13;
 * bis dahin nutzen Tests `headerAuth` und der echte Server `noAuth` (alles 401).
 */
export interface AuthProvider {
  authenticate(req: FastifyRequest): Principal | null | Promise<Principal | null>;
}

export const noAuth: AuthProvider = { authenticate: () => null };
