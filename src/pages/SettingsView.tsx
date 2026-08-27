import { useState, useEffect, useRef } from 'react';
import { getEncryptionMode, setEncryptionMode, isBiometricEnabled, isBiometricAvailable, disableBiometric, registerBiometric, validatePassword, setPassword as updatePassword, checkPassword, getSessionPassword, getSessionKey, setSession, clearSession } from '../utils/auth';
import type { EncryptionMode } from '../utils/auth';
import Header from '../components/Header';
import AuthModal from '../components/AuthModal';
import db, { decryptAllEntries, encryptAllEntries, reEncryptAllEntries } from '../db';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, Trash2, Shield, Key, Fingerprint, Info, RotateCcw, Bell, RefreshCw, Cloud } from 'lucide-react';
import { ManualBackupCard } from '../components/ManualBackupCard';
import { NotificationSettingsManager } from '../components/NotificationSettingsManager';
import PageTutorial from '../components/tutorial/PageTutorial';
import { useTutorial } from '../contexts/TutorialContext';
import { useNavigation } from '../contexts/NavigationContext';
import { APP_VERSION } from '../utils/version';
import BackupCodeReveal from '../components/cloud/BackupCodeReveal';
import {
  isCloudSyncEnabled,
  getCloudUsername,
  unlinkCloudDevice,
  logoutFromCloud,
  rotateBackupCode as rotateCloudBackupCode,
} from '../services/cloudAuthService';
import { runSync } from '../services/syncService';

export default function SettingsView() {
  const { goHome: onBack, navigate } = useNavigation();
  const [cloudLinked, setCloudLinked] = useState(false);
  const [cloudUsername, setCloudUsername] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [rotatedBackupCode, setRotatedBackupCode] = useState<string | null>(null);
  const { resetTutorials } = useTutorial();
  const [currentMode, setCurrentMode] = useState<EncryptionMode>('none');
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [passwordExists, setPasswordExists] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [passwordSectionRef, setPasswordSectionRef] = useState<HTMLDivElement | null>(null);
  
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authAction, setAuthAction] = useState<'changeMode' | 'changeBiometric' | null>(null);
  const [pendingMode, setPendingMode] = useState<EncryptionMode | null>(null);
  const [migration, setMigration] = useState<{ done: number; total: number } | null>(null);

  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const updateAvailableRef = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      setSwRegistration(reg);
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            updateAvailableRef.current = true;
          }
        });
      });
    });
  }, []);

  function handleCheckUpdate() {
    if (!swRegistration) return;
    setIsCheckingUpdate(true);
    swRegistration.update().then(() => {
      setTimeout(() => {
        if (!updateAvailableRef.current) alert('App ist auf dem neuesten Stand! ✅');
        setIsCheckingUpdate(false);
      }, 2000);
    }).catch(() => {
      alert('Update-Prüfung fehlgeschlagen');
      setIsCheckingUpdate(false);
    });
  }

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (showChangePassword && passwordSectionRef) {
      passwordSectionRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [showChangePassword, passwordSectionRef]);

  async function loadSettings() {
    try {
      const mode = await getEncryptionMode();
      setCurrentMode(mode);
      
      const bioEnabled = await isBiometricEnabled();
      setBiometricEnabledState(bioEnabled);
      
      const bioAvailable = isBiometricAvailable();
      setBiometricAvailable(bioAvailable);
      
      const { hasPassword } = await import('../utils/auth');
      const pwExists = await hasPassword();
      setPasswordExists(pwExists);
      
      const debugMode = localStorage.getItem('debugEnabled');
      setDebugEnabled(debugMode === 'true');

      const cloudEnabled = await isCloudSyncEnabled();
      setCloudLinked(cloudEnabled);
      setCloudUsername(cloudEnabled ? await getCloudUsername() : null);
    } catch (error) {
      console.error('Fehler beim Laden der Settings:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSyncNow() {
    setIsSyncing(true);
    try {
      const outcome = await runSync();
      if (outcome.ok) {
        alert(`Synchronisiert! ${outcome.pushed} hochgeladen, ${outcome.pulled} empfangen.`);
      } else if (outcome.error === 'no-session') {
        alert('Cloud-Session abgelaufen. Bitte App neu laden und mit Face ID entsperren.');
      } else {
        alert(`Sync fehlgeschlagen: ${outcome.error ?? 'Unbekannter Fehler'}`);
      }
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleRotateBackupCode() {
    try {
      const { backupCode } = await rotateCloudBackupCode();
      setRotatedBackupCode(backupCode);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Backup-Code-Rotation fehlgeschlagen.');
    }
  }

  async function handleUnlinkDevice() {
    const confirmed = window.confirm(
      'Dieses Gerät wird von der Cloud getrennt. Deine Daten bleiben lokal und im Cloud-Account ' +
      'erhalten — du kannst dich jederzeit erneut anmelden. Fortfahren?'
    );
    if (!confirmed) return;
    await logoutFromCloud();
    await unlinkCloudDevice();
    setCloudLinked(false);
    setCloudUsername(null);
  }

  async function handleModeChange(newMode: EncryptionMode) {
    // EC1: full → none: Auth erforderlich, danach alle Einträge entschlüsseln
    if (currentMode === 'full' && newMode === 'none') {
      setPendingMode(newMode);
      setAuthAction('changeMode');
      setShowAuthModal(true);
      return;
    }

    // EC2: none → full: Passwort prüfen / anlegen, danach alle Einträge verschlüsseln
    if (currentMode === 'none' && newMode === 'full') {
      const { hasPassword } = await import('../utils/auth');
      const pwExists = await hasPassword();

      if (!pwExists) {
        await setEncryptionMode(newMode);
        setCurrentMode(newMode);
        alert('Verschlüsselungsmodus geändert! Bitte erstelle jetzt ein Passwort.');
        setShowChangePassword(true);
        return;
      }

      // Passwort existiert → bestehende Einträge verschlüsseln
      const password = getSessionPassword();
      const key = await getSessionKey();
      if (!password || !key) {
        setPendingMode(newMode);
        setAuthAction('changeMode');
        setShowAuthModal(true);
        return;
      }

      await setEncryptionMode(newMode);
      setCurrentMode(newMode);
      setMigration({ done: 0, total: 0 });
      try {
        await encryptAllEntries(password, key, (done, total) => setMigration({ done, total }));
      } finally {
        setMigration(null);
      }
      alert('Verschlüsselungsmodus geändert! Alle Einträge wurden verschlüsselt.');
      return;
    }

    await setEncryptionMode(newMode);
    setCurrentMode(newMode);
    alert('Verschlüsselungsmodus geändert!');
  }

  async function handleChangePassword() {
    setPasswordError('');
    
    if (currentMode === 'none') {
      setPasswordError('Bitte wähle zuerst einen Verschlüsselungsmodus.');
      return;
    }
    
    const { hasPassword } = await import('../utils/auth');
    const passwordExists = await hasPassword();
    
    if (!passwordExists) {
      if (!newPassword.trim()) {
        setPasswordError('Bitte neues Passwort eingeben');
        return;
      }
      
      if (newPassword !== confirmPassword) {
        setPasswordError('Neue Passwörter stimmen nicht überein');
        return;
      }
      
      const validation = validatePassword(newPassword);
      if (!validation.valid) {
        setPasswordError(validation.errors.join('. '));
        return;
      }
      
      setIsLoading(true);
      
      try {
        await updatePassword(newPassword);
        await setSession(newPassword);
        setPasswordExists(true);

        alert('Passwort erfolgreich erstellt!');
        
        setShowChangePassword(false);
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordError('');
      } catch (error) {
        console.error('Passwort-Erstellung fehlgeschlagen:', error);
        setPasswordError('Fehler beim Erstellen des Passworts');
      } finally {
        setIsLoading(false);
      }
      
      return;
    }
    
    if (!oldPassword.trim()) {
      setPasswordError('Bitte altes Passwort eingeben');
      return;
    }
    
    if (!newPassword.trim()) {
      setPasswordError('Bitte neues Passwort eingeben');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setPasswordError('Neue Passwörter stimmen nicht überein');
      return;
    }
    
    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      setPasswordError(validation.errors.join('. '));
      return;
    }
    
    setIsLoading(true);
    
    try {
      const oldValid = await checkPassword(oldPassword);
      if (!oldValid) {
        setPasswordError('Altes Passwort ist falsch');
        setIsLoading(false);
        return;
      }
      
      // EC3: Alle verschlüsselten Einträge mit neuem Passwort re-encrypten
      const oldKey = await getSessionKey();
      await setSession(newPassword);  // leitet neuen Key ab und speichert ihn in Session
      const newKey = await getSessionKey();
      setMigration({ done: 0, total: 0 });
      try {
        await reEncryptAllEntries(oldPassword, newPassword, oldKey || undefined, newKey || undefined, (done, total) =>
          setMigration({ done, total })
        );
      } finally {
        setMigration(null);
      }

      await updatePassword(newPassword);

      // Biometrie deaktivieren — sie ist mit dem alten Passwort verknüpft
      const bioEnabled = await isBiometricEnabled();
      if (bioEnabled) {
        await disableBiometric();
        setBiometricEnabledState(false);
      }

      alert('Passwort erfolgreich geändert!');

      setShowChangePassword(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError('');
    } catch (error) {
      console.error('Passwort-Änderung fehlgeschlagen:', error);
      setPasswordError('Fehler beim Ändern des Passworts');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleBiometricToggle() {
    if (!biometricAvailable) {
      alert('Biometrie ist auf diesem Gerät/Domain nicht verfügbar');
      return;
    }
    
    if (biometricEnabled) {
      await disableBiometric();
      setBiometricEnabledState(false);
      alert('Biometrie deaktiviert');
    } else {
      const password = getSessionPassword();
      if (!password) {
        setPendingMode(null);
        setAuthAction('changeBiometric');
        setShowAuthModal(true);
        return;
      }
      
      await activateBiometric(password);
    }
  }

  async function activateBiometric(password: string) {
    try {
      const success = await registerBiometric(password);
      if (success) {
        setBiometricEnabledState(true);
        alert('Biometrie aktiviert!');
      } else {
        alert('Biometrie-Aktivierung fehlgeschlagen');
      }
    } catch (error) {
      console.error('Biometrie-Fehler:', error);
      alert('Fehler bei Biometrie-Aktivierung');
    }
  }

  async function handleAuthenticate(password: string): Promise<boolean> {
    const valid = await checkPassword(password);

    if (valid) {
      await setSession(password);
      const key = await getSessionKey();
      setShowAuthModal(false);

      if (authAction === 'changeMode' && pendingMode) {
        // EC1: full → none: alle Einträge entschlüsseln
        if (pendingMode === 'none') {
          setMigration({ done: 0, total: 0 });
          try {
            await decryptAllEntries(password, key || undefined, (done, total) => setMigration({ done, total }));
          } finally {
            setMigration(null);
          }
          await setEncryptionMode('none');
          setCurrentMode('none');
          clearSession();
          alert('Verschlüsselungsmodus deaktiviert. Alle Einträge wurden entschlüsselt.');
        } else {
          // EC2: none → full (Passwort war vorhanden, Session kam von Auth-Modal)
          setMigration({ done: 0, total: 0 });
          try {
            await encryptAllEntries(password, key || undefined, (done, total) => setMigration({ done, total }));
          } finally {
            setMigration(null);
          }
          await setEncryptionMode(pendingMode);
          setCurrentMode(pendingMode);
          alert('Verschlüsselungsmodus geändert! Alle Einträge wurden verschlüsselt.');
        }
      } else if (authAction === 'changeBiometric') {
        await activateBiometric(password);
      }
      
      setAuthAction(null);
      setPendingMode(null);
      
      return true;
    }
    
    return false;
  }

  async function handleDeleteData() {
    const confirm1 = window.confirm('⚠️ WARNUNG: Alle Daten werden unwiderruflich gelöscht!\n\nMöchtest du wirklich fortfahren?');
    if (!confirm1) return;
    
    const confirm2 = window.confirm('Letzte Chance! Wirklich ALLE Daten löschen?');
    if (!confirm2) return;
    
    try {
      await db.delete();
      alert('Alle Daten gelöscht. Die App wird neu geladen.');
      window.location.reload();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen der Daten');
    }
  }
  
  function toggleDebugMode() {
    const newValue = !debugEnabled;
    setDebugEnabled(newValue);
    localStorage.setItem('debugEnabled', String(newValue));
    window.location.reload();
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="spinner"></div>
          <p className="text-muted-foreground">Lädt...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="app-container">
        <Header title="Einstellungen" onBack={onBack} />
        
        <div className="content-wrapper space-y-6">
          {/* Verschlüsselung */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield size={20} className="text-primary" />
              <h3 className="text-lg font-semibold">Verschlüsselung</h3>
            </div>
            
            <div className="space-y-2">
              <Label>Aktueller Modus</Label>
              <select 
                className="w-full h-10 px-3 rounded-md border border-input bg-background"
                value={currentMode}
                onChange={(e) => handleModeChange(e.target.value as EncryptionMode)}
              >
                <option value="none">Keine Verschlüsselung</option>
                <option value="full">Volle Verschlüsselung</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {currentMode === 'none' && 'Alle Daten unverschlüsselt, kein Passwort erforderlich'}
                {currentMode === 'full' && 'App-Start erfordert Passwort, alle Daten verschlüsselt'}
              </p>
            </div>
          </Card>

          {/* Cloud-Sync */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Cloud size={20} className="text-primary" />
              <h3 className="text-lg font-semibold">Cloud-Sync</h3>
            </div>

            {cloudLinked ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Dieses Gerät ist verknüpft als <strong>{cloudUsername}</strong>.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleSyncNow} disabled={isSyncing}>
                    <RefreshCw size={14} className={`mr-1.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Synchronisiere…' : 'Jetzt synchronisieren'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleRotateBackupCode}>
                    Neuen Backup-Code erzeugen
                  </Button>
                </div>

                {rotatedBackupCode && (
                  <BackupCodeReveal
                    code={rotatedBackupCode}
                    onConfirmed={() => setRotatedBackupCode(null)}
                    confirmLabel="Fertig"
                  />
                )}

                <Separator />

                <Button variant="destructive" size="sm" onClick={handleUnlinkDevice}>
                  Dieses Gerät von der Cloud trennen
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Noch nicht eingerichtet — synchronisiere deine Daten Ende-zu-Ende-verschlüsselt
                  über mehrere Geräte hinweg, abgesichert per Face ID.
                </p>
                <Button size="sm" onClick={() => navigate('cloudSetup')}>
                  <Cloud size={14} className="mr-1.5" />
                  Cloud-Sync einrichten
                </Button>
              </div>
            )}
          </Card>

          {/* Passwort */}
          <Card 
            ref={(el) => setPasswordSectionRef(el)}
            className={`p-6 ${currentMode === 'none' ? 'opacity-50' : ''}`}
          >
            <div className="flex items-center gap-2 mb-4">
              <Key size={20} className="text-primary" />
              <h3 className="text-lg font-semibold">Passwort</h3>
            </div>
            
            {currentMode === 'none' ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Passwort-Schutz ist nur mit Verschlüsselung verfügbar
                </p>
                <Button disabled variant="secondary">
                  Passwort ändern
                </Button>
              </div>
            ) : !showChangePassword ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {passwordExists ? 'Passwort ändern' : 'Passwort erstellen für Verschlüsselung'}
                </p>
                <Button onClick={() => setShowChangePassword(true)} variant="secondary">
                  {passwordExists ? 'Passwort ändern' : 'Passwort erstellen'}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {passwordExists && (
                  <div className="space-y-2">
                    <Label>Altes Passwort</Label>
                    <Input
                      type="password"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      placeholder="Aktuelles Passwort"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Neues Passwort</Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mindestens 8 Zeichen"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Neues Passwort bestätigen</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Passwort wiederholen"
                  />
                </div>

                {passwordError && (
                  <Card className="p-3 bg-destructive/10 border-destructive/50">
                    <p className="text-sm text-destructive">{passwordError}</p>
                  </Card>
                )}

                <div className="flex gap-2">
                  <Button onClick={() => setShowChangePassword(false)} variant="outline" className="flex-1">
                    Abbrechen
                  </Button>
                  <Button onClick={handleChangePassword} className="flex-1" disabled={isLoading}>
                    {isLoading ? 'Speichere...' : 'Speichern'}
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Biometrie */}
          {currentMode !== 'none' && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Fingerprint size={20} className="text-primary" />
                <h3 className="text-lg font-semibold">Biometrie</h3>
              </div>
              
              {!biometricAvailable ? (
                <p className="text-sm text-muted-foreground">
                  Biometrie ist auf diesem Gerät/Domain nicht verfügbar
                </p>
              ) : (
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">Fingerabdruck / Face ID</p>
                    <p className="text-sm text-muted-foreground">
                      {biometricEnabled ? 'Aktiviert' : 'Deaktiviert'}
                    </p>
                  </div>
                  <Button 
                    onClick={handleBiometricToggle}
                    variant={biometricEnabled ? 'outline' : 'default'}
                  >
                    {biometricEnabled ? 'Deaktivieren' : 'Aktivieren'}
                  </Button>
                </div>
              )}
            </Card>
          )}

          {/* Erinnerungen */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Bell size={20} className="text-primary" />
              <h3 className="text-lg font-semibold">Erinnerungen</h3>
            </div>
            <NotificationSettingsManager />
          </Card>

          {/* Manuelles Backup */}
          <ManualBackupCard />

          {/* Info */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Info size={20} className="text-primary" />
              <h3 className="text-lg font-semibold">Info</h3>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-muted-foreground">App-Version</p>
                  <p className="font-medium">{APP_VERSION}</p>
                </div>
                <Button
                  onClick={handleCheckUpdate}
                  disabled={isCheckingUpdate}
                  variant="outline"
                  size="sm"
                >
                  <RefreshCw size={14} className={`mr-1.5 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                  {isCheckingUpdate ? 'Prüft…' : 'Updates suchen'}
                </Button>
              </div>
              
              <Separator />
              
              <div>
                <p className="text-sm text-muted-foreground">Datenbank</p>
                <p className="font-medium">IndexedDB (Lokal)</p>
              </div>
              
              <Separator />
              
              <div>
                <p className="text-sm text-muted-foreground">Verschlüsselung</p>
                <p className="font-medium">AES-GCM 256-bit</p>
              </div>
            </div>
          </Card>

          {/* Debug-Modus */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">🐛 Debug-Modus</h3>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium">Debug-Konsole</p>
                  <p className="text-sm text-muted-foreground">
                    {debugEnabled ? 'Aktiviert - Zeigt Logs am unteren Rand' : 'Deaktiviert'}
                  </p>
                </div>
                <Button 
                  onClick={toggleDebugMode}
                  variant={debugEnabled ? 'outline' : 'default'}
                >
                  {debugEnabled ? 'Deaktivieren' : 'Aktivieren'}
                </Button>
              </div>
              
              <Card className="p-3 bg-yellow-50 border-yellow-200">
                <div className="flex gap-2">
                  <AlertCircle size={16} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-800">
                    Hinweis: Nach Änderung wird die App neu geladen
                  </p>
                </div>
              </Card>
            </div>
          </Card>

          {/* Tutorial-Hilfe */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <RotateCcw size={20} className="text-primary" />
              <h3 className="text-lg font-semibold">Tutorial-Hilfe</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Zeigt alle Hilfe-Tipps wieder an und startet den interaktiven Guide von vorne.
            </p>
            <Button
              onClick={() => {
                resetTutorials();
                alert('Tutorial wurde zurückgesetzt! Beim nächsten Besuch einer Seite werden die Tipps wieder angezeigt.');
              }}
              variant="outline"
              className="w-full"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Tutorial neu starten
            </Button>
          </Card>

          {/* Gefahr-Zone */}
          <Card className="p-6 border-destructive">
            <h3 className="text-lg font-semibold text-destructive mb-4">Gefahr-Zone</h3>
            
            <p className="text-sm text-muted-foreground mb-4">
              Diese Aktionen sind unwiderruflich!
            </p>
            
            <Button 
              onClick={handleDeleteData}
              variant="destructive"
            >
              <Trash2 size={16} className="mr-2" />
              Alle Daten löschen
            </Button>
          </Card>
        </div>
      </div>

      {/* Migration-Overlay */}
      {migration !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 p-8 rounded-xl bg-card border shadow-lg max-w-xs w-full mx-4">
            <div className="spinner" />
            <p className="font-medium text-center">Einträge werden migriert…</p>
            {migration.total > 0 && (
              <>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${Math.round((migration.done / migration.total) * 100)}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">{migration.done} / {migration.total}</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal 
          onAuthenticate={handleAuthenticate}
          onCancel={() => {
            setShowAuthModal(false);
            setAuthAction(null);
            setPendingMode(null);
          }}
        />
      )}

      {/* Tutorial - SettingsView */}
      <PageTutorial
        page="settings"
        steps={[
          {
            spotlight: null,
            title: 'Einstellungen',
            text: 'Hier verwaltest du Verschlüsselung, Passwort und kannst das Tutorial jederzeit neu starten.',
            cardPosition: 'center',
          },
        ]}
      />
    </>
  );
}
