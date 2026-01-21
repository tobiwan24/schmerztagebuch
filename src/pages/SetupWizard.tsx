import { useState } from 'react';
import { setSetting } from '../db';
import { setPassword, setEncryptionMode, validatePassword, isBiometricAvailable, registerBiometric } from '../utils/auth';
import type { EncryptionMode } from '../utils/auth';

/**
 * Prüft ob crypto.subtle verfügbar ist
 */
function isCryptoAvailable(): boolean {
  return !!(window.crypto && window.crypto.subtle);
}

/**
 * Gibt Hilfetext für fehlende crypto.subtle API
 */
function getCryptoWarning(): string {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  
  if (protocol !== 'https:' && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return '⚠️ Verschlüsselung erfordert HTTPS oder localhost. Aktuell: ' + protocol + '//' + hostname;
  }
  
  return '⚠️ Web Crypto API nicht verfügbar in diesem Browser.';
}

interface SetupWizardProps {
  onComplete: () => void;
}

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<'welcome' | 'updates' | 'encryption' | 'password' | 'biometric'>('welcome');
  const [selectedMode, setSelectedMode] = useState<EncryptionMode>('none');
  const [autoUpdate, setAutoUpdate] = useState(true); // Standard: Auto-Update AN
  const [password, setPasswordInput] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [savedPassword, setSavedPassword] = useState<string>('');

  async function handleWelcomeContinue() {
    setStep('updates');
  }

  async function handleUpdatesContinue() {
    // Auto-Update Preference speichern
    localStorage.setItem('autoUpdate', String(autoUpdate));
    setStep('encryption');
  }

  async function handleEncryptionContinue() {
    if (selectedMode === 'none') {
      await completeSetup();
    } else {
      setStep('password');
    }
  }

  async function handlePasswordSubmit() {
    setPasswordError('');
    
    // Validierung
    if (!password.trim()) {
      setPasswordError('Bitte Passwort eingeben');
      return;
    }
    
    if (password !== confirmPassword) {
      setPasswordError('Passwörter stimmen nicht überein');
      return;
    }
    
    const validation = validatePassword(password);
    if (!validation.valid) {
      setPasswordError(validation.errors.join('. '));
      return;
    }
    
    setIsLoading(true);
    
    try {
      console.log('Speichere Passwort...');
      await setPassword(password);
      console.log('Passwort gespeichert!');
      setSavedPassword(password);
      
      // Biometrie verfügbar? Dann Biometrie-Step anbieten
      if (isBiometricAvailable()) {
        console.log('Biometrie verfügbar - zeige Biometrie-Screen');
        setStep('biometric');
      } else {
        console.log('Keine Biometrie - Setup abschließen');
        await completeSetup();
      }
    } catch (error) {
      console.error('Password setup error:', error);
      setPasswordError('Fehler beim Speichern: ' + (error instanceof Error ? error.message : 'Unbekannter Fehler'));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleBiometricEnable() {
    setIsLoading(true);
    try {
      const success = await registerBiometric(savedPassword);
      if (success) {
        await completeSetup();
      } else {
        alert('Biometrie-Registrierung fehlgeschlagen');
      }
    } catch (error) {
      console.error('Biometric setup error:', error);
      alert('Biometrie nicht verfügbar');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleBiometricSkip() {
    await completeSetup();
  }

  async function completeSetup() {
    await setSetting('setupCompleted', 'true');
    await setEncryptionMode(selectedMode);
    onComplete();
  }

  if (step === 'welcome') {
    return (
      <div className="app-container" style={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #eff6ff, #e0e7ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="card" style={{ maxWidth: '28rem', width: '100%' }}>
          <div className="text-center mb-6">
            <div className="welcome-icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="welcome-title">Willkommen!</h1>
            <p className="text-gray-600">Ihr persönliches Schmerztagebuch</p>
          </div>

          <div className="space-y-4 mb-6">
            <div className="feature-item">
              <div className="feature-icon">
                <svg fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="feature-title">Flexible Templates</h3>
                <p className="feature-description">Erstellen Sie individuelle Tagebuch-Vorlagen</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon">
                <svg fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="feature-title">Offline-fähig</h3>
                <p className="feature-description">Alle Daten lokal gespeichert</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon">
                <svg fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="feature-title">Datenschutz</h3>
                <p className="feature-description">Optional: Verschlüsselung verfügbar</p>
              </div>
            </div>
          </div>

          <button onClick={handleWelcomeContinue} className="btn btn-primary" style={{ width: '100%' }}>
            Weiter
          </button>
        </div>
      </div>
    );
  }

  if (step === 'updates') {
    return (
      <div className="app-container" style={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #eff6ff, #e0e7ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="card" style={{ maxWidth: '32rem', width: '100%' }}>
          <div className="text-center mb-6">
            <div className="welcome-icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h1 className="welcome-title">App-Updates</h1>
            <p className="text-gray-600">Wie möchten Sie Updates erhalten?</p>
          </div>

          <div className="space-y-4 mb-6">
            {/* Auto-Update */}
            <div
              onClick={() => setAutoUpdate(true)}
              className={`encryption-option ${autoUpdate ? 'encryption-option-selected' : ''}`}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <input
                  type="radio"
                  checked={autoUpdate}
                  onChange={() => setAutoUpdate(true)}
                  style={{ marginTop: '0.25rem' }}
                />
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontWeight: 600, marginBottom: '0.25rem' }}>🎉 Automatische Updates (Empfohlen)</h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                    Neue Versionen werden automatisch im Hintergrund installiert. Sie erhalten immer die neuesten Features und Bugfixes.
                  </p>
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#d1fae5', borderRadius: '0.375rem' }}>
                    <p style={{ fontSize: '0.75rem', color: '#065f46', fontWeight: 500 }}>
                      ✓ Immer aktuell • ✓ Keine Unterbrechungen • ✓ Neue Features sofort
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Manuell */}
            <div
              onClick={() => setAutoUpdate(false)}
              className={`encryption-option ${!autoUpdate ? 'encryption-option-selected' : ''}`}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <input
                  type="radio"
                  checked={!autoUpdate}
                  onChange={() => setAutoUpdate(false)}
                  style={{ marginTop: '0.25rem' }}
                />
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontWeight: 600, marginBottom: '0.25rem' }}>🔍 Manuell prüfen</h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                    Sie werden benachrichtigt wenn Updates verfügbar sind und können selbst entscheiden wann Sie aktualisieren möchten.
                  </p>
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#fef3c7', borderRadius: '0.375rem' }}>
                    <p style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 500 }}>
                      💡 Sie können jederzeit in den Einstellungen manuell nach Updates suchen
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Info Box */}
            <div style={{ padding: '1rem', backgroundColor: '#dbeafe', borderRadius: '0.5rem', border: '1px solid #bfdbfe', marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '1.25rem' }}>ℹ️</span>
                <div>
                  <p style={{ fontSize: '0.875rem', color: '#1e40af', fontWeight: 600, marginBottom: '0.25rem' }}>
                    Vollständige Offline-Fähigkeit
                  </p>
                  <p style={{ fontSize: '0.75rem', color: '#1e40af' }}>
                    Die App funktioniert komplett offline. Updates werden nur installiert wenn Sie online sind.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={() => setStep('welcome')} className="btn btn-secondary" style={{ flex: 1 }}>
              Zurück
            </button>
            <button onClick={handleUpdatesContinue} className="btn btn-primary" style={{ flex: 2 }}>
              Weiter
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'encryption') {
    return (
      <div className="app-container" style={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #eff6ff, #e0e7ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="card" style={{ maxWidth: '32rem', width: '100%' }}>
          <div className="text-center mb-6">
            <div className="welcome-icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="welcome-title">Datenschutz</h1>
            <p className="text-gray-600">Wählen Sie Ihren Verschlüsselungsmodus</p>
          </div>

          <div className="space-y-4 mb-6">
            {/* Crypto Warning wenn nicht verfügbar */}
            {!isCryptoAvailable() && selectedMode !== 'none' && (
              <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderRadius: '0.5rem', border: '2px solid #f59e0b' }}>
                <p style={{ fontSize: '0.875rem', color: '#92400e', fontWeight: 600 }}>
                  {getCryptoWarning()}
                </p>
                <p style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '0.5rem' }}>
                  Bitte verwende localhost oder HTTPS für Verschlüsselung.
                </p>
              </div>
            )}
            
            {/* Keine Verschlüsselung */}
            <div
              onClick={() => setSelectedMode('none')}
              className={`encryption-option ${selectedMode === 'none' ? 'encryption-option-selected' : ''}`}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <input
                  type="radio"
                  checked={selectedMode === 'none'}
                  onChange={() => setSelectedMode('none')}
                  style={{ marginTop: '0.25rem' }}
                />
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Keine Verschlüsselung</h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                    Alle Daten werden unverschlüsselt gespeichert. Schnellster Zugriff, aber weniger Privatsphäre.
                  </p>
                </div>
              </div>
            </div>

            {/* Historie-Verschlüsselung */}
            <div
              onClick={() => setSelectedMode('history')}
              className={`encryption-option ${selectedMode === 'history' ? 'encryption-option-selected' : ''}`}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <input
                  type="radio"
                  checked={selectedMode === 'history'}
                  onChange={() => setSelectedMode('history')}
                  style={{ marginTop: '0.25rem' }}
                />
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Historie verschlüsseln</h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                    Tagebuch-Einträge frei zugänglich, Verlauf und Editor passwortgeschützt. Gute Balance.
                  </p>
                </div>
              </div>
            </div>

            {/* Volle Verschlüsselung */}
            <div
              onClick={() => setSelectedMode('full')}
              className={`encryption-option ${selectedMode === 'full' ? 'encryption-option-selected' : ''}`}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <input
                  type="radio"
                  checked={selectedMode === 'full'}
                  onChange={() => setSelectedMode('full')}
                  style={{ marginTop: '0.25rem' }}
                />
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Volle Verschlüsselung</h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                    App-Start erfordert Passwort. Maximale Sicherheit und Privatsphäre.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={() => setStep('updates')} className="btn btn-secondary" style={{ flex: 1 }}>
              Zurück
            </button>
            <button onClick={handleEncryptionContinue} className="btn btn-primary" style={{ flex: 2 }}>
              {selectedMode === 'none' ? 'Fertig' : 'Weiter'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'password') {
    return (
      <div className="app-container" style={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #eff6ff, #e0e7ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="card" style={{ maxWidth: '28rem', width: '100%' }}>
          <div className="text-center mb-6">
            <div className="welcome-icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <h1 className="welcome-title">Passwort erstellen</h1>
            <p className="text-gray-600">Wählen Sie ein sicheres Passwort</p>
          </div>

          <div className="space-y-4 mb-6">
            <div className="form-group">
              <label className="form-label">Passwort</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="form-input"
                placeholder="Mindestens 8 Zeichen"
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Passwort bestätigen</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="form-input"
                placeholder="Passwort wiederholen"
                disabled={isLoading}
              />
            </div>

            {passwordError && (
              <div style={{ padding: '0.75rem', backgroundColor: '#fee2e2', borderRadius: '0.5rem', border: '1px solid #fecaca' }}>
                <p style={{ fontSize: '0.875rem', color: '#dc2626' }}>{passwordError}</p>
              </div>
            )}

            <div style={{ padding: '0.75rem', backgroundColor: '#dbeafe', borderRadius: '0.5rem', border: '1px solid #bfdbfe' }}>
              <p style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.5rem', fontWeight: 600 }}>
                Anforderungen:
              </p>
              <ul style={{ fontSize: '0.75rem', color: '#1e40af', paddingLeft: '1.25rem', margin: 0 }}>
                <li>Mindestens 8 Zeichen</li>
                <li>Mindestens 1 Großbuchstabe</li>
                <li>Mindestens 1 Kleinbuchstabe</li>
                <li>Mindestens 1 Zahl</li>
              </ul>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={() => setStep('encryption')} className="btn btn-secondary" style={{ flex: 1 }} disabled={isLoading}>
              Zurück
            </button>
            <button onClick={handlePasswordSubmit} className="btn btn-primary" style={{ flex: 2 }} disabled={isLoading}>
              {isLoading ? 'Speichere...' : 'Weiter'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'biometric') {
    return (
      <div className="app-container" style={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #eff6ff, #e0e7ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="card" style={{ maxWidth: '28rem', width: '100%' }}>
          <div className="text-center mb-6">
            <div className="welcome-icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
              </svg>
            </div>
            <h1 className="welcome-title">Biometrie aktivieren?</h1>
            <p className="text-gray-600">Schneller Login mit Fingerabdruck oder Face ID</p>
          </div>

          <div className="space-y-4 mb-6">
            <div style={{ padding: '1rem', backgroundColor: '#dbeafe', borderRadius: '0.5rem', border: '1px solid #bfdbfe' }}>
              <h3 style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.5rem', fontWeight: 600 }}>
                Vorteile:
              </h3>
              <ul style={{ fontSize: '0.875rem', color: '#1e40af', paddingLeft: '1.25rem', margin: 0 }}>
                <li>Schneller Zugriff ohne Passwort</li>
                <li>Sicher durch Gerätehardware</li>
                <li>Fallback mit Passwort möglich</li>
              </ul>
            </div>

            <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderRadius: '0.5rem', border: '1px solid #fde047' }}>
              <p style={{ fontSize: '0.875rem', color: '#92400e' }}>
                Hinweis: Biometrie-Daten werden nur lokal auf diesem Gerät gespeichert.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button onClick={handleBiometricEnable} className="btn btn-primary" disabled={isLoading}>
              {isLoading ? 'Aktiviere...' : '👆 Biometrie aktivieren'}
            </button>
            <button onClick={handleBiometricSkip} className="btn btn-secondary" disabled={isLoading}>
              Überspringen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
