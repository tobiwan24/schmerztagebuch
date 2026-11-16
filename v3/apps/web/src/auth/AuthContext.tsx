// Kontostatus der App: kein Konto → Onboarding; gesperrt → Entsperren; entsperrt → Ansichten (Spec 03/10).
// Hält die Crypto-Session (einzige Stelle mit entschlüsselten Schlüsseln, Spec 01).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UmkFactor } from '@stb/crypto';
import { StbDb } from '@/data/db';
import { createCryptoSession, type CryptoSession } from '@/data/crypto-session';
import { SYNC_DETACHED_ID, isSyncDetached } from '@/data/sync-detached';
import { createIdleMonitor, loadLockSettings } from '@/data/lock-settings';
import { discardLocalKeys, loadDevices, type DeviceView } from './devices';
import { hasAccount, loadAccount, unlockLocal, type PendingAccount, type PendingBackupCode } from './local-account';
import { preparePasskeyRequest, prfOutput, type CredentialsLike } from './passkey';
import { createFetchAccountApi, type AccountApi } from './account-api';
import {
  createCloudDiary, isCloudAccount, loginOnNewDevice, openDiaryKeys, prepareCloudBackupCodeRenewal, prepareCloudRecovery, prepareCloudRegistration, prepareUpgradeToCloud,
  startCloudRecovery, type CloudAccount,
} from './cloud-account';
import { creationOptionsFromServer, credentialToJson, requestOptionsFromServer } from './webauthn-json';
import { localUserId } from '@/data/identity';

export type AuthStatus = 'loading' | 'no-account' | 'locked' | 'unlocked';

export interface AuthApi {
  status: AuthStatus;
  /** Art des Kontos auf diesem Gerät (`null` ohne Konto). Bestimmt Outbox und Sync (Spec 04 „Modi"). */
  accountMode: 'local-only' | 'cloud-primary' | null;
  /** Synchronisiert dieses Gerät? `cloud-primary` und nicht auf „nur dieses Gerät“ zurückgestellt (UI-20). */
  syncAttached: boolean;
  /** Setzt den Gerätemerker „Sync zurückgestellt“ (nach `switchToLocalOnly` für alle Tagebücher). */
  setSyncAttached(attached: boolean): Promise<void>;
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
  /** Hat das Konto einen Passwort-Faktor? (Auch nach dem Wechsel auf ein Konto bleibt er gültig.) */
  hasPasswordFactor(): Promise<boolean>;
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
  /** Wechsel „nur auf diesem Gerät" → „Mit Konto" (entsperrt): bestehende UMK bleibt, neuer Backup-Code; `finishPending` lädt hoch. */
  prepareUpgrade(input: { challengeId: string; username: string; credential: Credential }): Promise<PendingAccount>;
  /** Backup-Code erneuern im Konto (CRY-18): `commit()` ersetzt Wrap + Verifier auf dem Server und lokal (nach der Pflichtbestätigung). */
  prepareBackupCodeRenewal(): Promise<PendingBackupCode>;
  /** Tagebuch auf dem Server anlegen (DK für die eigene Identity) und in der Sitzung bereitstellen. */
  createDiary(diaryId: string): Promise<void>;
  /** Eigene Geräte mit „dieses Gerät“ (CRY-19). */
  devices(): Promise<DeviceView[]>;
  /** Anderes eigenes Gerät sperren (CRY-19, CRY-14). */
  revokeDevice(id: string): Promise<void>;
  /** Auf diesem Gerät abmelden: Sitzung beenden, Schlüssel und Wraps verwerfen; Daten bleiben (CRY-19). */
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children, db: injected, accountApi }: { children: ReactNode; db?: StbDb; accountApi?: AccountApi }) {
  const server = useMemo(() => accountApi ?? createFetchAccountApi(''), [accountApi]);
  const db = useMemo(() => injected ?? new StbDb(), [injected]);
  const now = useCallback(() => Date.now(), []);
  const session = useMemo(() => createCryptoSession(db, { now }), [db, now]);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [accountMode, setAccountMode] = useState<AuthApi['accountMode']>(null);
  const [accountVersion, setAccountVersion] = useState(0);
  const [detached, setDetached] = useState(false);

  // Nach jedem Statuswechsel (Konto angelegt, Login auf neuem Gerät, …) die Kontoart neu lesen.
  useEffect(() => {
    let cancelled = false;
    void db.device.get(SYNC_DETACHED_ID).then((row) => {
      if (!cancelled) setDetached(row?.value === true);
    });
    void loadAccount(db).then((a) => {
      if (!cancelled) setAccountMode(a ? (isCloudAccount(a) ? 'cloud-primary' : 'local-only') : null);
    });
    return () => {
      cancelled = true;
    };
  }, [db, status, accountVersion]);

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

  // Sperre bei Inaktivität (CRY-20): Aktivität setzt zurück; geprüft alle 15 s und beim Zurückkehren in die App.
  useEffect(() => {
    if (status !== 'unlocked') return;
    const monitor = createIdleMonitor({ now }, () => {
      session.lock();
      void session.forgetDevice();
      setStatus('locked');
    });
    const check = () => void loadLockSettings(db).then((l) => monitor.check(l.idleMinutes));
    const touch = () => monitor.touch();
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    const events = ['pointerdown', 'keydown', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(check, 15_000);
    return () => {
      for (const e of events) window.removeEventListener(e, touch);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [status, db, session, now]);

  // Stabiles Objekt (nur bei Statuswechsel neu), damit Effekte in Ansichten nicht bei jedem Render erneut laufen.
  const api = useMemo<AuthApi>(() => ({
    status,
    accountMode,
    syncAttached: accountMode === 'cloud-primary' && !detached,
    async setSyncAttached(attached) {
      if (attached) await db.device.delete(SYNC_DETACHED_ID);
      else await db.device.put({ id: SYNC_DETACHED_ID, value: true });
      setDetached(!attached);
    },
    db,
    session,
    credentials: navigator.credentials,
    rpId: location.hostname,
    now,
    async finishPending(pending, opts) {
      await pending.commit();
      session.unlock(pending.umk);
      await loadDiaryKeys(pending.umk);
      setAccountVersion((v) => v + 1);
      if (opts?.stayUnlocked) await session.stayUnlocked((await loadLockSettings(db)).stayDays);
      setStatus('unlocked');
    },
    async unlockWith(factor, opts) {
      const umk = await unlockLocal(db, factor);
      session.unlock(umk);
      await loadDiaryKeys(umk);
      if (opts?.stayUnlocked) await session.stayUnlocked((await loadLockSettings(db)).stayDays);
      setStatus('unlocked');
    },
    async passkeyRequest() {
      const account = await loadAccount(db);
      return account?.passkey ? preparePasskeyRequest({ rpId: location.hostname, credentialIds: [account.passkey.credentialId] }) : null;
    },
    async hasPasswordFactor() {
      return (await loadAccount(db))?.wraps.some((w) => w.factor === 'password') ?? false;
    },
    async lock() {
      session.lock();
      await session.forgetDevice();
      setStatus('locked');
    },
    cloud: {
      isCloudAccount: async () => isCloudAccount(await loadAccount(db)),
      async registrationOptions(username) {
        const r = await server.registerOptions(username, await localUserId(db));
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
      async prepareUpgrade({ challengeId, username, credential }) {
        let prf: Uint8Array<ArrayBuffer>;
        try {
          prf = prfOutput(credential);
        } catch {
          prf = prfOutput(await navigator.credentials.get(preparePasskeyRequest({ rpId: location.hostname, credentialIds: [credential.id] })));
        }
        return prepareUpgradeToCloud(db, server, { challengeId, username, credential: credentialToJson(credential), prf, umk: session.umk(), now });
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
      prepareBackupCodeRenewal: () => prepareCloudBackupCodeRenewal(db, server, session.umk()),
      devices: () => loadDevices(server, session.umk()),
      revokeDevice: (id) => server.revokeDevice(id),
      async signOut() {
        await discardLocalKeys(db, server, session);
        setAccountVersion((v) => v + 1);
        setStatus('no-account');
      },
      async createDiary(diaryId) {
        const account = await loadAccount(db);
        // Auf „nur dieses Gerät“ zurückgestellt: neue Tagebücher bleiben lokal (UI-20, A-076).
        if (!isCloudAccount(account) || (await isSyncDetached(db))) return;
        session.setDiaryKey(diaryId, await createCloudDiary(db, server, account, diaryId), 1);
      },
    },
  }), [status, accountMode, detached, db, session, now, server]);

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
