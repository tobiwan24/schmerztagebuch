import { useState, useEffect } from 'react';
import { getEncryptionMode, setEncryptionMode, isBiometricEnabled, isBiometricAvailable, disableBiometric, registerBiometric, validatePassword, setPassword as updatePassword, checkPassword, getSessionPassword, setSession } from '../utils/auth';
import type { EncryptionMode } from '../utils/auth';
import Header from '../components/Header';
import AuthModal from '../components/AuthModal';
import UpdateControl from '../components/UpdateControl';
import db from '../db';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, Trash2, Shield, Key, Fingerprint, Info, RotateCcw } from 'lucide-react';
import PageTutorial from '../components/tutorial/PageTutorial';
import { useTutorial } from '../contexts/TutorialContext';
import { useNavigation } from '../contexts/NavigationContext';

export default function SettingsView() {
  const { goHome: onBack } = useNavigation();
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
    } catch (error) {
      console.error('Fehler beim Laden der Settings:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleModeChange(newMode: EncryptionMode) {
    if (currentMode !== 'none' && newMode === 'none') {
      setPendingMode(newMode);
      setAuthAction('changeMode');
      setShowAuthModal(true);
      return;
    }
    
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
        setSession(newPassword);
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
      
      await updatePassword(newPassword);
      setSession(newPassword);
      
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
      setSession(password);
      setShowAuthModal(false);
      
      if (authAction === 'changeMode' && pendingMode) {
        await setEncryptionMode(pendingMode);
        setCurrentMode(pendingMode);
        alert('Verschlüsselungsmodus geändert!');
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

          {/* Update Control */}
          <UpdateControl />

          {/* Info */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Info size={20} className="text-primary" />
              <h3 className="text-lg font-semibold">Info</h3>
            </div>
            
            <div className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">App-Version</p>
                <p className="font-medium">1.0.0</p>
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
