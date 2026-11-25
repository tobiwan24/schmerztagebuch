// Lokale Verschlüsselung (A-093, A-125): setzt nach dem Entsperren die Umstellung `plain → aes` im Hintergrund fort,
// solange die Einstellung eingeschaltet ist, und stellt den Fortschritt für die Einstellungen bereit.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useData } from './DataContext';
import { loadLocalEncryption, markLocalEncryptionComplete } from './local-encryption';

export interface LocalEncryptionApi {
  enabled: boolean;
  /** Umstellung läuft gerade. */
  running: boolean;
  /** Records, die noch unverschlüsselt (`plain`) sind. */
  remaining: number;
  /** Anzahl beim Start des laufenden Durchgangs (für den Fortschrittsbalken). */
  total: number;
  /** Records, die nicht umgestellt werden konnten (z. B. Schlüssel fehlt); der nächste Durchgang versucht es erneut. */
  failed: number;
  /** Ende der Umstellung (ISO), `undefined` solange Records fehlen. */
  completedAt: string | undefined;
  /** Einschalten: ab jetzt Codec `aes`, Umstellung läuft im Hintergrund. */
  enable(): Promise<void>;
}

const INACTIVE: LocalEncryptionApi = { enabled: false, running: false, remaining: 0, total: 0, failed: 0, completedAt: undefined, enable: async () => undefined };
const LocalEncryptionContext = createContext<LocalEncryptionApi>(INACTIVE);

export function LocalEncryptionProvider({ children }: { children: ReactNode }) {
  const { db, now, status, localEncryption, enableLocalEncryption } = useAuth();
  const { registry, writeCodec } = useData();
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(0);
  const [completedAt, setCompletedAt] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (status !== 'unlocked' || !localEncryption || writeCodec !== 'aes') return;
    const ctrl = new AbortController();
    const live = <T,>(fn: (v: T) => void) => (v: T) => {
      if (!ctrl.signal.aborted) fn(v);
    };
    const setRemainingLive = live(setRemaining);
    void (async () => {
      try {
        const [{ countByCodec, migrateRecords }, state] = await Promise.all([import('./codec/migrate'), loadLocalEncryption(db)]);
        live(setCompletedAt)(state.completedAt);
        const start = await countByCodec(db, 'plain');
        live(setTotal)(start);
        setRemainingLive(start);
        if (start === 0) {
          live(setCompletedAt)((await markLocalEncryptionComplete(db, now)).completedAt);
          return;
        }
        live(setRunning)(true);
        const res = await migrateRecords(db, { registry, signal: ctrl.signal, batchSize: 25, onProgress: (p) => setRemainingLive(p.remaining) });
        setRemainingLive(res.remaining);
        live(setFailed)(res.failed.length);
        if (res.remaining === 0) live(setCompletedAt)((await markLocalEncryptionComplete(db, now)).completedAt);
      } catch {
        // Gesperrt oder Datenbank geschlossen: beim nächsten Entsperren geht es weiter (fortsetzbar).
      } finally {
        live(setRunning)(false);
      }
    })();
    return () => {
      ctrl.abort();
      setRunning(false);
    };
  }, [status, localEncryption, writeCodec, db, registry, now]);

  const enable = useCallback(() => enableLocalEncryption(), [enableLocalEncryption]);
  const api = useMemo<LocalEncryptionApi>(
    () => ({ enabled: localEncryption, running, remaining, total, failed, completedAt, enable }),
    [localEncryption, running, remaining, total, failed, completedAt, enable],
  );
  return <LocalEncryptionContext.Provider value={api}>{children}</LocalEncryptionContext.Provider>;
}

export function useLocalEncryption(): LocalEncryptionApi {
  return useContext(LocalEncryptionContext);
}
