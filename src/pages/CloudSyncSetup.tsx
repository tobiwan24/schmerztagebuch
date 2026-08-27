// src/pages/CloudSyncSetup.tsx
// Cloud-Sync-Einrichtung: Registrierung (Passkey + Pflicht-Backup-Code + Migration) oder
// Recovery auf einem neuen Gerät (Backup-Code → Pflicht: neuer Passkey + neuer Backup-Code).
// Ablauf folgt der Spec ("Datenmigrationsablauf" bzw. "Backup-Code-Wiederherstellung").

import { useState, useEffect } from 'react';
import { Cloud, Fingerprint, LifeBuoy } from 'lucide-react';
import Header from '../components/Header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import BackupCodeReveal from '../components/cloud/BackupCodeReveal';
import { useNavigation } from '../contexts/NavigationContext';
import { isPlatformAuthenticatorAvailable } from '../utils/webauthnPrf';
import { normalizeBackupCode } from '../utils/keyManagement';
import { requestPersistentStorage } from '../utils/persistentStorage';
import {
  registerAccount,
  generateAndRegisterBackupCode,
  recoverWithBackupCode,
  addPasskeyToCurrentAccount,
  rotateBackupCode,
} from '../services/cloudAuthService';
import { migrateLocalEntriesToCloud, type MigrationProgress } from '../services/cloudMigrationService';
import { runInitialSync } from '../services/syncService';

type Mode =
  | 'choice'
  | 'register-username'
  | 'register-backupcode'
  | 'register-migrating'
  | 'recover-form'
  | 'recover-newpasskey'
  | 'recover-newbackupcode'
  | 'done';

export default function CloudSyncSetup() {
  const { goHome } = useNavigation();
  const [mode, setMode] = useState<Mode>('choice');
  const [username, setUsername] = useState('');
  const [backupCodeInput, setBackupCodeInput] = useState('');
  const [dek, setDek] = useState<CryptoKey | null>(null);
  const [backupCode, setBackupCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
  const [platformAvailable, setPlatformAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    isPlatformAuthenticatorAvailable().then(setPlatformAvailable);
  }, []);

  async function handleRegister() {
    if (!username.trim()) {
      setError('Bitte einen Nutzernamen eingeben.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const { dek: newDek, kdfSalt } = await registerAccount(username.trim());
      setDek(newDek);
      const { backupCode: code } = await generateAndRegisterBackupCode(newDek, kdfSalt);
      setBackupCode(code);
      await requestPersistentStorage();
      setMode('register-backupcode');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registrierung fehlgeschlagen.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleBackupCodeConfirmed() {
    if (!dek) return;
    setMode('register-migrating');
    setMigrationProgress({ done: 0, total: 0 });
    try {
      await migrateLocalEntriesToCloud(dek, (p) => setMigrationProgress(p));
      await runInitialSync();
      setMode('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Migration fehlgeschlagen. Bitte erneut versuchen.');
      setMode('register-backupcode');
    } finally {
      setMigrationProgress(null);
    }
  }

  async function handleRecover() {
    if (!username.trim() || !backupCodeInput.trim()) {
      setError('Bitte Nutzername und Backup-Code eingeben.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const recoveredDek = await recoverWithBackupCode(username.trim(), normalizeBackupCode(backupCodeInput));
      setDek(recoveredDek);
      await requestPersistentStorage();
      setMode('recover-newpasskey');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wiederherstellung fehlgeschlagen. Bitte Code prüfen.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegisterNewPasskey() {
    if (!dek) return;
    setError('');
    setIsLoading(true);
    try {
      // Pflicht nach Recovery (Spec: "App fordert danach aktiv (a) neuen Passkey ... (b) neuen Backup-Code").
      // Der User existiert bereits (aus der Recovery-Session) — addPasskeyToCurrentAccount()
      // fügt nur eine weitere Credential hinzu, statt einen neuen Account anzulegen.
      await addPasskeyToCurrentAccount(dek);
      const { backupCode: code } = await rotateBackupCode();
      setBackupCode(code);
      setMode('recover-newbackupcode');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Neue Passkey-Registrierung fehlgeschlagen.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRecoveryDone() {
    await runInitialSync();
    setMode('done');
  }

  if (mode === 'done') {
    return (
      <div className="app-container">
        <Header title="Cloud-Sync" onBack={goHome} />
        <div className="content-wrapper space-y-4 text-center py-12">
          <Cloud size={48} className="mx-auto text-primary" />
          <h2 className="text-xl font-semibold">Cloud-Sync eingerichtet!</h2>
          <p className="text-muted-foreground">Deine Daten werden jetzt automatisch synchronisiert.</p>
          <Button onClick={goHome} className="w-full max-w-xs mx-auto">Fertig</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Header title="Cloud-Sync einrichten" onBack={goHome} />
      <div className="content-wrapper space-y-6 max-w-lg mx-auto">
        {platformAvailable === false && (
          <Card className="p-4 bg-yellow-50 border-yellow-200">
            <p className="text-sm text-yellow-800">
              Auf diesem Gerät wurde kein Plattform-Passkey (Face ID / iCloud-Schlüsselbund) gefunden.
              Cloud-Sync benötigt einen Passkey für die Verschlüsselung.
            </p>
          </Card>
        )}

        {mode === 'choice' && (
          <div className="space-y-3">
            <Button className="w-full" onClick={() => setMode('register-username')}>
              <Fingerprint size={18} className="mr-2" /> Neuen Cloud-Account einrichten
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setMode('recover-form')}>
              <LifeBuoy size={18} className="mr-2" /> Ich habe schon einen Account (Backup-Code)
            </Button>
          </div>
        )}

        {mode === 'register-username' && (
          <Card className="p-6 space-y-4">
            <div className="space-y-2">
              <Label>Nutzername</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="z.B. tobi" autoFocus />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" onClick={handleRegister} disabled={isLoading}>
              {isLoading ? 'Registriere…' : 'Mit Face ID registrieren'}
            </Button>
          </Card>
        )}

        {mode === 'register-backupcode' && (
          <BackupCodeReveal
            code={backupCode}
            onConfirmed={handleBackupCodeConfirmed}
            confirmLabel="Daten migrieren & fertigstellen"
          />
        )}

        {mode === 'register-migrating' && (
          <Card className="p-6 space-y-4 text-center">
            <div className="spinner mx-auto" />
            <p className="font-medium">Deine Daten werden migriert…</p>
            {migrationProgress && migrationProgress.total > 0 && (
              <p className="text-sm text-muted-foreground">{migrationProgress.done} / {migrationProgress.total}</p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </Card>
        )}

        {mode === 'recover-form' && (
          <Card className="p-6 space-y-4">
            <div className="space-y-2">
              <Label>Nutzername</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Backup-Code</Label>
              <Input
                value={backupCodeInput}
                onChange={(e) => setBackupCodeInput(e.target.value)}
                placeholder="XXXXX-XXXXX-XXXXX-…"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" onClick={handleRecover} disabled={isLoading}>
              {isLoading ? 'Prüfe…' : 'Wiederherstellen'}
            </Button>
          </Card>
        )}

        {mode === 'recover-newpasskey' && (
          <Card className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Wiederherstellung erfolgreich. Zur Sicherheit registrierst du jetzt einen neuen Passkey für
              dieses Gerät und erhältst einen neuen Backup-Code — der alte Code wird ungültig.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" onClick={handleRegisterNewPasskey} disabled={isLoading}>
              {isLoading ? 'Registriere…' : 'Neuen Passkey registrieren'}
            </Button>
          </Card>
        )}

        {mode === 'recover-newbackupcode' && (
          <BackupCodeReveal code={backupCode} onConfirmed={handleRecoveryDone} confirmLabel="Fertigstellen" />
        )}
      </div>
    </div>
  );
}
