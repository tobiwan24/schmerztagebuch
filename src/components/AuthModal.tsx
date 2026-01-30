import { useState, useEffect } from 'react';
import { isBiometricEnabled, authenticateWithBiometric } from '../utils/auth';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Fingerprint } from 'lucide-react';

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md">
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              {message}
            </p>

            {biometricAvailable && (
              <div className="space-y-3">
                <Button
                  type="button"
                  onClick={handleBiometricAuth}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full"
                >
                  <Fingerprint size={18} className="mr-2" />
                  Mit Biometrie entsperren
                </Button>
                <div className="text-center text-sm text-muted-foreground">
                  oder
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Passwort</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus={!biometricAvailable}
                disabled={isLoading}
                placeholder="••••••••"
              />
              {error && (
                <p className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
          </div>

          <div className="p-4 border-t flex gap-2 justify-end">
            {onCancel && (
              <Button 
                type="button"
                onClick={onCancel} 
                variant="outline"
                disabled={isLoading}
              >
                Abbrechen
              </Button>
            )}
            <Button 
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? 'Prüfe...' : 'Entsperren'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
