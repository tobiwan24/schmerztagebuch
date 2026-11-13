// Kontostatus der App: kein Konto → Onboarding; gesperrt → Entsperren; entsperrt → Ansichten (Spec 03/10).
// Hält die Crypto-Session (einzige Stelle mit entschlüsselten Schlüsseln, Spec 01).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UmkFactor } from '@stb/crypto';
import { StbDb } from '@/data/db';
import { createCryptoSession, type CryptoSession } from '@/data/crypto-session';
import { hasAccount, loadAccount, unlockLocal, type PendingAccount } from './local-account';
import { preparePasskeyRequest, prfOutput, type CredentialsLike } from './passkey';
import { createFetchAccountApi, type AccountApi } from './account-api';
import {
  createCloudDiary, isCloudAccount, loginOnNewDevice, openDiaryKeys, prepareCloudRecovery, prepareCloudRegistration, startCloudRecovery, type CloudAccount,
} from './cloud-account';
import { creationOptionsFromServer, credentialToJson, requestOptionsFromServer } from './webauthn-json';

export type AuthStatus = 'loading' | 'no-account' | 'locked' | 'unlocked';

export interface AuthApi {
  status: AuthStatus;
  /** Art des Kontos auf diesem Gerät (`null` ohne Konto). Bestimmt Outbox und Sync (Spec 04 „Modi"). */
  accountMode: 'local-only' | 'cloud-primary' | null;
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
  /** Konto „Mit Konto" (Spec 03). Optionen jeweils vorab laden; die Browser-Aufrufe passieren synchron im Klick. */
  cloud: CloudAuth;
}

export interface RecoveryStart {
  username: string;
  backupCode: string;
  options: CredentialCreationOptions;
  raw: Awaited<ReturnType<typeof startCloudRecovery>>;
}

export interface CloudAuth {
  isCloudAccount(): Promise<boolean>;
  registrationOptions(username: string): Promise<{ challengeId: string; options: CredentialCreationOptions }>;
  /** Nach `credentials.create`: Schlüssel vorbereiten; `commit()` (nach Backup-Bestätigung) registriert beim Server. */
  prepareRegistration(input: { challengeId: string; username: string; credential: Credential }): Promise<PendingAccount>;
  loginOptions(): Promise<{ challengeId: string; options: CredentialRequestOptions }>;
  /** Nach `credentials.get` auf einem neuen Gerät: Login, Konto lokal anlegen, entsperren. */
  loginNewDevice(input: { challengeId: string; credential: Credential }): Promise<void>;
  /** Gerät hinzufügen per Backup-Code, Schritt 1: Code prüfen lassen, Optionen für einen neuen Passkey. */
  recoveryOptions(input: { username: string; backupCode: string }): Promise<RecoveryStart>;
  /** Schritt 2 nach `credentials.create`: neuer Backup-Code; `commit()` über `finishPending` (nach Bestätigung). */
  prepareRecovery(input: { start: RecoveryStart; credential: Credential }): Promise<PendingAccount>;
  /** Tagebuch auf dem Server anlegen (DK für die eigene Identity) und in der Sitzung bereitstellen. */
  createDiary(diaryId: string): Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children, db: injected, accountApi }: { children: ReactNode; db?: StbDb; accountApi?: AccountApi }) {
  const server = useMemo(() => accountApi ?? createFetchAccountApi(''), [accountApi]);
  const db = useMemo(() => injected ?? new StbDb(), [injected]);
  const now = useCallback(() => Date.now(), []);
  const session = useMemo(() => createCryptoSession(db, { now }), [db, now]);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [accountMode, setAccountMode] = useState<AuthApi['accountMode']>(null);

  // Nach jedem Statuswechsel (Konto angelegt, Login auf neuem Gerät, …) die Kontoart neu lesen.
  useEffect(() => {
    let cancelled = false;
    void loadAccount(db).then((a) => {
      if (!cancelled) setAccountMode(a ? (isCloudAccount(a) ? 'cloud-primary' : 'local-only') : null);
    });
    return () => {
      cancelled = true;
    };
  }, [db, status]);

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
    accountMode,
    db,
    session,
    credentials: navigator.credentials,
    rpId: location.hostname,
    now,
    async finishPending(pending, opts) {
      await pending.commit();
      session.unlock(pending.umk);
      await loadDiaryKeys(pending.umk);
      if (opts?.stayUnlocked) await session.stayUnlocked();
      setStatus('unlocked');
    },
    async unlockWith(factor, opts) {
      const umk = await unlockLocal(db, factor);
      session.unlock(umk);
      await loadDiaryKeys(umk);
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
    cloud: {
      isCloudAccount: async () => isCloudAccount(await loadAccount(db)),
      async registrationOptions(username) {
        const r = await server.registerOptions(username);
        return { challengeId: r.challengeId, options: creationOptionsFromServer(r.options) };
      },
      async prepareRegistration({ challengeId, username, credential }) {
        let prf: Uint8Array<ArrayBuffer>;
        try {
          prf = prfOutput(credential);
        } catch {
          // Manche Authenticatoren liefern PRF erst bei `get` (wie createPasskey).
          prf = prfOutput(await navigator.credentials.get(preparePasskeyRequest({ rpId: location.hostname, credentialIds: [credential.id] })));
        }
        return prepareCloudRegistration(db, server, { challengeId, username, credential: credentialToJson(credential), prf, now });
      },
      async loginOptions() {
        const r = await server.loginOptions();
        return { challengeId: r.challengeId, options: requestOptionsFromServer(r.options) };
      },
      async loginNewDevice({ challengeId, credential }) {
        const { umk } = await loginOnNewDevice(db, server, { challengeId, credential: credentialToJson(credential), prf: prfOutput(credential), now });
        session.unlock(umk);
        await loadDiaryKeys(umk);
        setStatus('unlocked');
      },
      async recoveryOptions({ username, backupCode }) {
        const raw = await startCloudRecovery(server, { username, backupCode });
        return { username, backupCode, raw, options: creationOptionsFromServer(raw.options) };
      },
      async prepareRecovery({ start, credential }) {
        let prf: Uint8Array<ArrayBuffer>;
        try {
          prf = prfOutput(credential);
        } catch {
          prf = prfOutput(await navigator.credentials.get(preparePasskeyRequest({ rpId: location.hostname, credentialIds: [credential.id] })));
        }
        return prepareCloudRecovery(db, server, {
          username: start.username, backupCode: start.backupCode, start: start.raw, credential: credentialToJson(credential), prf, now,
        });
      },
      async createDiary(diaryId) {
        const account = await loadAccount(db);
        if (!isCloudAccount(account)) return;
        session.setDiaryKey(diaryId, await createCloudDiary(db, server, account, diaryId), 1);
      },
    },
  }), [status, accountMode, db, session, now, server]);

  /** Cloud-Konto: lokal bekannte DKs öffnen (offline möglich), damit die Sync-Engine ver-/entschlüsseln kann. */
  async function loadDiaryKeys(umk: CryptoKey) {
    const account = (await loadAccount(db)) as CloudAccount | undefined;
    if (!isCloudAccount(account)) return;
    for (const k of await openDiaryKeys(db, account, umk)) session.setDiaryKey(k.diaryId, k.key, k.keyEpoch);
  }
  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth außerhalb von <AuthProvider>');
  return ctx;
}
