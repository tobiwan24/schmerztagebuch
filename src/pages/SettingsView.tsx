import { useState, useEffect } from 'react';
import { getEncryptionMode, setEncryptionMode, isBiometricEnabled, isBiometricAvailable, disableBiometric, registerBiometric, validatePassword, setPassword as updatePassword, checkPassword, getSessionPassword, setSession } from '../utils/auth';
import type { EncryptionMode } from '../utils/auth';
import Header from '../components/Header';
import AuthModal from '../components/AuthModal';
import UpdateControl from '../components/UpdateControl';
import db from '../db';

interface SettingsViewProps {
  onBack: () => void;
}

export default function SettingsView({ onBack }: SettingsViewProps) {
  const [currentMode, setCurrentMode] = useState<EncryptionMode>('none');
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Change Password State
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  
  // Auth Modal
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authAction, setAuthAction] = useState<'changeMode' | 'changeBiometric' | null>(null);
  const [pendingMode, setPendingMode] = useState<EncryptionMode | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const mode = await getEncryptionMode();
      setCurrentMode(mode);
      
      const bioEnabled = await isBiometricEnabled();
      setBiometricEnabledState(bioEnabled);
      
      const bioAvailable = isBiometricAvailable();
      setBiometricAvailable(bioAvailable);
    } catch (error) {
      console.error('Fehler beim Laden der Settings:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleModeChange(newMode: EncryptionMode) {
    // Wenn von verschlüsselt zu unverschlüsselt: Auth erforderlich
    if (currentMode !== 'none' && newMode === 'none') {
      setPendingMode(newMode);
      setAuthAction('changeMode');
      setShowAuthModal(true);
      return;
    }
    
    // Wenn zu verschlüsseltem Modus: Password Setup nötig
    if (currentMode === 'none' && newMode !== 'none') {
      // Nutzer sieht jetzt den Passwort-Bereich und kann dort ein Passwort erstellen
      // Modus wird erst nach Passwort-Erstellung wirklich aktiv
    }
    
    // Modus ändern
    await setEncryptionMode(newMode);
    setCurrentMode(newMode);
    alert('Verschlüsselungsmodus geändert!');
  }

  async function handleChangePassword() {
    setPasswordError('');
    
    // Validierung - sollte nicht mehr vorkommen da Button disabled ist
    if (currentMode === 'none') {
      setPasswordError('Bitte wähle zuerst einen Verschlüsselungsmodus.');
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
      // Altes Passwort prüfen
      const oldValid = await checkPassword(oldPassword);
      if (!oldValid) {
        setPasswordError('Altes Passwort ist falsch');
        setIsLoading(false);
        return;
      }
      
      // Neues Passwort setzen
      await updatePassword(newPassword);
      
      // Session aktualisieren
      setSession(newPassword);
      
      alert('Passwort erfolgreich geändert!');
      
      // Reset form
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
      // Deaktivieren
      await disableBiometric();
      setBiometricEnabledState(false);
      alert('Biometrie deaktiviert');
    } else {
      // Aktivieren - braucht Passwort
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
      
      // Führe pending action aus
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

  if (isLoading) {
    return (
      <div className="app-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="text-center">
          <div className="spinner"></div>
          <p className="text-gray-600" style={{ marginTop: '1rem' }}>Lädt...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="app-container">
        <Header title="Einstellungen" onBack={onBack} />
        
        <div className="content-wrapper">
          {/* Verschlüsselung */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>Verschlüsselung</h3>
            
            <div className="form-group">
              <label className="form-label">Aktueller Modus</label>
              <select 
                className="form-input"
                value={currentMode}
                onChange={(e) => handleModeChange(e.target.value as EncryptionMode)}
              >
                <option value="none">Keine Verschlüsselung</option>
                <option value="history">Historie verschlüsseln</option>
                <option value="full">Volle Verschlüsselung</option>
              </select>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                {currentMode === 'none' && 'Alle Daten unverschlüsselt'}
                {currentMode === 'history' && 'Nur Historie & Editor passwortgeschützt'}
                {currentMode === 'full' && 'App-Start erfordert Passwort'}
              </p>
            </div>
          </div>

          {/* Passwort */}
          <div className="card" style={{ marginBottom: '1.5rem', opacity: currentMode === 'none' ? 0.5 : 1 }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>Passwort</h3>
            
            {currentMode === 'none' ? (
              <div>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                  Passwort-Schutz ist nur mit Verschlüsselung verfügbar
                </p>
                <button disabled className="btn btn-secondary" style={{ cursor: 'not-allowed' }}>
                  Passwort ändern
                </button>
              </div>
            ) : !showChangePassword ? (
              <button onClick={() => setShowChangePassword(true)} className="btn btn-secondary">
                Passwort ändern
              </button>
            ) : (
                <div className="space-y-4">
                  <div className="form-group">
                    <label className="form-label">Altes Passwort</label>
                    <input
                      type="password"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      className="form-input"
                      placeholder="Aktuelles Passwort"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Neues Passwort</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="form-input"
                      placeholder="Mindestens 8 Zeichen"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Neues Passwort bestätigen</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="form-input"
                      placeholder="Passwort wiederholen"
                    />
                  </div>

                  {passwordError && (
                    <div style={{ padding: '0.75rem', backgroundColor: '#fee2e2', borderRadius: '0.5rem', border: '1px solid #fecaca' }}>
                      <p style={{ fontSize: '0.875rem', color: '#dc2626' }}>{passwordError}</p>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button onClick={() => setShowChangePassword(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                      Abbrechen
                    </button>
                    <button onClick={handleChangePassword} className="btn btn-primary" style={{ flex: 1 }} disabled={isLoading}>
                      {isLoading ? 'Speichere...' : 'Speichern'}
                    </button>
                  </div>
                </div>
              )}
          </div>

          {/* Biometrie */}
          {currentMode !== 'none' && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>Biometrie</h3>
              
              {!biometricAvailable ? (
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                  Biometrie ist auf diesem Gerät/Domain nicht verfügbar
                </p>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontWeight: 500 }}>Fingerabdruck / Face ID</p>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                      {biometricEnabled ? 'Aktiviert' : 'Deaktiviert'}
                    </p>
                  </div>
                  <button 
                    onClick={handleBiometricToggle}
                    className={`btn ${biometricEnabled ? 'btn-secondary' : 'btn-primary'}`}
                  >
                    {biometricEnabled ? 'Deaktivieren' : 'Aktivieren'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Update Control */}
          <UpdateControl />

          {/* Info */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem' }}>Info</h3>
            
            <div className="space-y-4">
              <div>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>App-Version</p>
                <p style={{ fontWeight: 500 }}>1.0.0</p>
              </div>
              
              <div>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Datenbank</p>
                <p style={{ fontWeight: 500 }}>IndexedDB (Lokal)</p>
              </div>
              
              <div>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Verschlüsselung</p>
                <p style={{ fontWeight: 500 }}>AES-GCM 256-bit</p>
              </div>
            </div>
          </div>

          {/* Gefahr-Zone */}
          <div className="card" style={{ marginBottom: '1.5rem', borderColor: '#dc2626' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', color: '#dc2626' }}>Gefahr-Zone</h3>
            
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
              Diese Aktionen sind unwiderruflich!
            </p>
            
            <button 
              onClick={handleDeleteData}
              className="btn btn-secondary"
              style={{ backgroundColor: '#dc2626', color: 'white' }}
            >
              🗑️ Alle Daten löschen
            </button>
          </div>
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
    </>
  );
}
