// Backup-Zustand für Erinnerung und Anzeige (Spec 07, EXP-12) — bewusst ohne Export-/PDF-Code, damit die Startseite
// klein bleibt (QA-02). Export und Backup-Datei stehen in `useBackup` (nur auf der Export-Seite geladen).
import { useAuth } from '@/auth/AuthContext';
import { loadAccount } from '@/auth/local-account';
import { backupDue, lastBackupAt, reminderDays } from './backup-state';
import { useQuery } from './useQuery';

export function useBackupState() {
  const { db, accountMode, now } = useAuth();
  const query = useQuery(async () => {
    const [last, days, account] = await Promise.all([lastBackupAt(db), reminderDays(db), loadAccount(db)]);
    return { last, days, createdAt: account ? Date.parse(account.createdAt) : null };
  }, [db]);
  // „Fällig" bei jedem Rendern aus der aktuellen Uhrzeit — die Zeit läuft weiter, während die App offen ist.
  const state =
    query.status === 'ok'
      ? { ...query, data: { ...query.data, due: backupDue({ mode: accountMode, lastBackup: query.data.last, accountCreatedAt: query.data.createdAt, days: query.data.days, now: now() }) } }
      : query;
  return state;
}
