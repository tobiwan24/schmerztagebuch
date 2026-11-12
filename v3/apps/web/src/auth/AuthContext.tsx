// Kontostatus der App: kein Konto → Onboarding; gesperrt → Entsperren; entsperrt → Ansichten (Spec 03/10).
// Hält die Crypto-Session (einzige Stelle mit entschlüsselten Schlüsseln, Spec 01).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UmkFactor } from '@stb/crypto';
import { StbDb } from '@/data/db';
import { createCryptoSession, type CryptoSession } from '@/data/crypto-session';
import { hasAccount, loadAccount, unlockLocal, type PendingAccount } from './local-account';
import { preparePasskeyRequest, type CredentialsLike } from './passkey';

export type AuthStatus = 'loading' | 'no-account' | 'locked' | 'unlocked';

export interface AuthApi {
  status: AuthStatus;
  db: StbDb;
  session: CryptoSession;
  credentials: CredentialsLike;
  rpId: string;
  now: () => number;
  /** Nach bestätigtem Backup-Code: Konto speichern und entsperren. */
  finishPending(pending: PendingAccount, opts?: { stayUnlocked?: boolean }): Promise<void>;
  unlockWith(factor: UmkFactor, opts?: { stayUnlocked?: boolean }): Promise<void>;
  /** Vorbereitete Passkey-Optionen (beim Öffnen des Entsperr-Dialogs gebaut), `null` ohne Passkey. */
  passkeyRequest(): Promise<CredentialRequestOptions | null>;
  lock(): Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children, db: injected }: { children: ReactNode; db?: StbDb }) {
  const db = useMemo(() => injected ?? new StbDb(), [injected]);
  const now = useCallback(() => Date.now(), []);
  const session = useMemo(() => createCryptoSession(db, { now }), [db, now]);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const exists = await hasAccount(db);
      const next: AuthStatus = !exists ? 'no-account' : (await session.restore()) ? 'unlocked' : 'locked';
      if (!cancelled) setStatus(next);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [db, session]);

  // Stabiles Objekt (nur bei Statuswechsel neu), damit Effekte in Ansichten nicht bei jedem Render erneut laufen.
  const api = useMemo<AuthApi>(() => ({
    status,
    db,
    session,
    credentials: navigator.credentials,
    rpId: location.hostname,
    now,
    async finishPending(pending, opts) {
      await pending.commit();
      session.unlock(pending.umk);
      if (opts?.stayUnlocked) await session.stayUnlocked();
      setStatus('unlocked');
    },
    async unlockWith(factor, opts) {
      session.unlock(await unlockLocal(db, factor));
      if (opts?.stayUnlocked) await session.stayUnlocked();
      setStatus('unlocked');
    },
    async passkeyRequest() {
      const account = await loadAccount(db);
      return account?.passkey ? preparePasskeyRequest({ rpId: location.hostname, credentialIds: [account.passkey.credentialId] }) : null;
    },
    async lock() {
      session.lock();
      await session.forgetDevice();
      setStatus('locked');
    },
  }), [status, db, session, now]);
  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth außerhalb von <AuthProvider>');
  return ctx;
}
