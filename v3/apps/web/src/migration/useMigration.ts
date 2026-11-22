// Zustand des Migrations-Assistenten (Spec 11 „Ablauf"): Erkennen → Entsperren → optional Server-Pull → Trockenlauf →
// Schreiben → Prüfen → Abschluss. Ansichten greifen nur über diesen Hook zu (Spec 01).
import { useCallback, useRef, useState } from 'react';
import { transformV2, type MigrationReport, type MigrationResult } from '@stb/core';
import { useAuth } from '@/auth/AuthContext';
import { useData } from '@/data/DataContext';
import { unlockV2Password, type V2DecryptKeys } from './v2/crypto';
import { countV2, readV2Snapshot, type V2Counts, type V2Snapshot } from './v2/source';
import { decodeV2Snapshot } from './v2/decode';
import { prepareImageResolver } from './v2/images';
import { parseV2Backup } from './v2/backup';
import { createV2Api, mergeV2, pullAllV2, v2LoginWithBackupCode, v2LoginWithPasskey, v2RequestOptions } from './v2/server';
import { applyMigration, loadMigrationState, planMigration, reportText, saveMigrationState, verifyMigration, type MigrationPlan, type MigrationState, type VerifyResult } from './run';

/** Adresse der v2-API: gleicher Origin (Reverse-Proxy leitet `/api/auth`, `/api/sync` an v2) oder eigener Wert. */
const V2_API_URL = (import.meta.env.VITE_V2_API_URL as string | undefined) ?? '';

export type MigrationPhase = 'start' | 'planned' | 'done';

export function useMigration() {
  const { db, now } = useAuth();
  const data = useData();
  const snapshot = useRef<V2Snapshot | null>(null);
  const keys = useRef<V2DecryptKeys>({});
  const passkeyOptions = useRef<CredentialRequestOptions | null>(null);
  const api = useRef(createV2Api(V2_API_URL));
  const [phase, setPhase] = useState<MigrationPhase>('start');
  const [source, setSource] = useState<'local' | 'file'>('local');
  const [counts, setCounts] = useState<V2Counts | null>(null);
  const [passwordOk, setPasswordOk] = useState(false);
  const [cloudOk, setCloudOk] = useState(false);
  const [pulled, setPulled] = useState(false);
  const [plan, setPlan] = useState<MigrationPlan | null>(null);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [state, setState] = useState<MigrationState | undefined>(undefined);

  const detect = useCallback(async () => {
    const snap = await readV2Snapshot();
    snapshot.current = snap;
    setSource('local');
    setCounts(snap ? countV2(snap) : null);
    setState(await loadMigrationState(db));
    return snap ? countV2(snap) : null;
  }, [db]);

  const useBackupFile = useCallback((text: string) => {
    const snap = parseV2Backup(text); // wirft V2BackupError
    snapshot.current = snap;
    keys.current = {};
    setPasswordOk(false);
    setCloudOk(false);
    setPulled(false);
    setSource('file');
    setCounts(countV2(snap));
  }, []);

  const unlockPassword = useCallback(async (password: string) => {
    if (!snapshot.current) throw new Error('keine v2-Daten');
    keys.current = { ...keys.current, local: await unlockV2Password(snapshot.current.settings, password) };
    setPasswordOk(true);
  }, []);

  const afterCloudLogin = useCallback(async (dek: CryptoKey, pull: boolean) => {
    keys.current = { ...keys.current, dek };
    setCloudOk(true);
    if (pull && snapshot.current) {
      snapshot.current = mergeV2(snapshot.current, await pullAllV2(api.current));
      setCounts(countV2(snapshot.current));
      setPulled(true);
    }
  }, []);

  const loginBackupCode = useCallback(
    async (username: string, code: string, pull: boolean) => afterCloudLogin(await v2LoginWithBackupCode(api.current, username.trim(), code), pull),
    [afterCloudLogin],
  );

  /** Passkey-Optionen vorab laden (beim Eingeben des Benutzernamens), damit der Klick direkt `credentials.get` startet. */
  const preparePasskey = useCallback(async (username: string) => {
    passkeyOptions.current = v2RequestOptions(await api.current.loginOptions(username.trim()));
  }, []);

  /** Im Klick-Handler ohne vorheriges `await` aufrufen (iOS-Nutzergeste). */
  const loginPasskey = useCallback(
    (username: string, pull: boolean) => {
      if (!passkeyOptions.current) return Promise.reject(new Error('login-failed'));
      return v2LoginWithPasskey(api.current, navigator.credentials, username.trim(), passkeyOptions.current).then((dek) => afterCloudLogin(dek, pull));
    },
    [afterCloudLogin],
  );

  /** Trockenlauf: entschlüsseln, transformieren, mit dem Bestand vergleichen — schreibt nichts (MIG-08). */
  const dryRun = useCallback(async () => {
    if (!snapshot.current) throw new Error('keine v2-Daten');
    const diaries = await data.diary.listDiaries();
    const target = diaries[0];
    if (!target) throw new Error('kein Tagebuch');
    const src = await decodeV2Snapshot(snapshot.current, keys.current);
    const resolveImage = await prepareImageResolver(src);
    const templates = await data.diary.listTemplates(target.id);
    const afterOrder = templates.map((t) => t.order).sort().at(-1) ?? null;
    const { userId: authorId } = await data.stamper.identity();
    const result: MigrationResult = transformV2(src, { diaryId: target.id, authorId, timezone: target.settings.timezone, afterOrder, resolveImage });
    const p = await planMigration(data.records, result);
    setPlan(p);
    setPhase('planned');
    return p;
  }, [data]);

  /** Schreiben + Prüfen + Bericht speichern. */
  const apply = useCallback(async () => {
    if (!plan) throw new Error('kein Plan');
    await applyMigration(data.records, data.attachments, plan);
    const v = await verifyMigration(data.diary, data.attachments, plan.result);
    const at = new Date(now()).toISOString();
    const prev = await loadMigrationState(db);
    const next: MigrationState = {
      ...(prev?.migratedFromV2At ? { migratedFromV2At: prev.migratedFromV2At } : {}),
      ...(v.ok ? { migratedFromV2At: at } : {}),
      lastRunAt: at,
      report: plan.result.report,
      verify: v,
    };
    await saveMigrationState(db, next);
    setVerify(v);
    setState(next);
    setPhase('done');
    data.bumpRevision();
    return v;
  }, [plan, data, db, now]);

  return {
    phase, source, counts, passwordOk, cloudOk, pulled, plan, verify, state,
    detect, useBackupFile, unlockPassword, loginBackupCode, preparePasskey, loginPasskey, dryRun, apply,
  };
}

export { reportText, type MigrationReport, type MigrationState };
