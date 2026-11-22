// NUR für Tests: Benutzer-ID aus einem Header. Wird in main.ts nie verdrahtet.
import type { AuthProvider } from './types.js';

export const TEST_AUTH_HEADER = 'x-test-user';

export const headerAuth: AuthProvider = {
  authenticate(req) {
    const user = req.headers[TEST_AUTH_HEADER];
    return typeof user === 'string' && user ? { userId: user } : null;
  },
};
