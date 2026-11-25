// Unsichtbarer Auslöser der Auto-Sicherung (EXP-17).
import { useAuth } from '@/auth/AuthContext';
import { useAutoBackupTrigger } from '@/data/useAutoBackup';

export function AutoBackup() {
  const { status } = useAuth();
  useAutoBackupTrigger(status === 'unlocked');
  return null;
}
