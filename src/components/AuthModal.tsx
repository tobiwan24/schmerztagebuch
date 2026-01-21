import { useState, useEffect } from 'react';
import { isBiometricEnabled, authenticateWithBiometric } from '../utils/auth';

interface AuthModalProps {
  onAuthenticate: (password: string) => Promise<boolean>;
  onCancel?: () => void;
  title?: string;
  message?: string;
}

export default function AuthModal({ 
  onAuthenticate,
  onCancel,
  title = 'Passwort erforderlich',
  message = 'Bitte gib dein Passwort ein:'
}: AuthModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    checkBiometric();
  }, []);

  async function checkBiometric() {
    const enabled = await isBiometricEnabled();
    setBiometricAvailable(enabled);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!password.trim()) {
      setError('Bitte Passwort eingeben');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const success = await onAuthenticate(password);
      
      if (!success) {
        setError('Falsches Passwort');
        setPassword('');
      }
    } catch (err) {
      setError('Fehler bei der Authentifizierung');
      console.error('Auth error:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleBiometricAuth() {
    setIsLoading(true);
    setError('');

    try {
      const password = await authenticateWithBiometric();
      
      if (password) {
        const success = await onAuthenticate(password);
        if (!success) {
          setError('Authentifizierung fehlgeschlagen');
        }
      } else {
        setError('Biometrie-Authentifizierung abgebrochen');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Biometrie-Fehler';
      setError(errorMessage);
      console.error('Biometric auth error:', err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>{title}</h3>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p style={{ fontSize: '0.875rem', marginBottom: '1rem', color: 'var(--color-text-muted)' }}>
              {message}
            </p>

            {/* Biometrie-Button */}
            {biometricAvailable && (
              <div style={{ marginBottom: '1rem' }}>
                <button
                  type="button"
                  onClick={handleBiometricAuth}
                  disabled={isLoading}
                  className="btn btn-secondary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  <svg style={{ width: '1.25rem', height: '1.25rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                  </svg>
                  <span>Mit Biometrie entsperren</span>
                </button>
                <div style={{ textAlign: 'center', margin: '0.75rem 0', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  oder
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Passwort</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                autoFocus={!biometricAvailable}
                disabled={isLoading}
                placeholder="••••••••"
              />
              {error && (
                <p className="text-error" style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                  {error}
                </p>
              )}
            </div>
          </div>

          <div className="modal-footer">
            {onCancel && (
              <button 
                type="button"
                onClick={onCancel} 
                className="btn btn-secondary"
                disabled={isLoading}
              >
                Abbrechen
              </button>
            )}
            <button 
              type="submit"
              className="btn btn-primary"
              disabled={isLoading}
            >
              {isLoading ? 'Prüfe...' : 'Entsperren'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
