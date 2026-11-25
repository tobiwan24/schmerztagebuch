// Verdrahtung der Auto-Sicherung (EXP-17): Auslöser nach lokalen Änderungen (entprellt, höchstens 1×/Tag) und vor einem Update.
// Die schweren Module (Export, Backup-Datei) werden erst beim Ausführen geladen (Bundle-Budget QA-02).
import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { loadAccount } from '@/auth/local-account';
import { APP_VERSION } from '@/version';
import { useData } from './DataContext';

export const AUTO_BACKUP_DEBOUNCE_MS = 30_000;

export function useAutoBackup() {
  const { db, session, now } = useAuth();
  const data = useData();
  const running = useRef<Promise<unknown> | null>(null);

  /** Sicherung ausführen; Fehler schlucken (Sicherung darf nie Updates oder Speichern behindern). */
  const run = useCallback(async (force = false): Promise<void> => {
    if (!session.isUnlocked()) return;
    if (running.current) return void (await running.current);
    const job = (async () => {
      try {
        const [{ AutoBackupDb, runAutoBackup }, { createExport }, account] = await Promise.all([import('./auto-backup'), import('./import-export'), loadAccount(db)]);
        if (!account) return;
        await runAutoBackup({
          store: new AutoBackupDb(), umk: session.umk(), wraps: account.wraps, now,
          buildExport: async () => {
            const doc = await createExport(data.diary, { appVersion: APP_VERSION, now: now() }, data.attachments);
            return { text: JSON.stringify(doc), exportedAt: doc.exportedAt, empty: doc.diaries.length === 0 };
          },
        }, { force });
      } catch {
        // Sicherung ist best effort
      }
    })();
    running.current = job;
    await job;
    running.current = null;
  }, [db, session, now, data.diary, data.attachments]);

  return { run };
}

/** Hört auf lokale Änderungen und stößt die Sicherung entprellt an. */
export function useAutoBackupTrigger(active: boolean): void {
  const { run } = useAutoBackup();
  const data = useData();
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onWrite = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void run(false), AUTO_BACKUP_DEBOUNCE_MS);
    };
    data.writes.addEventListener('write', onWrite);
    return () => {
      clearTimeout(timer);
      data.writes.removeEventListener('write', onWrite);
    };
  }, [active, run, data.writes]);
}
