import { useState } from 'react';
import { setSetting } from '../db';
import { setPassword, setEncryptionMode, validatePassword, isBiometricAvailable, registerBiometric } from '../utils/auth';
import type { EncryptionMode } from '../utils/auth';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Check, Lock, RefreshCw, BookOpen, Shield, Fingerprint, Key, AlertCircle } from 'lucide-react';

function isCryptoAvailable(): boolean {
  return !!(window.crypto && window.crypto.subtle);
}

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
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [password, setPasswordInput] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [savedPassword, setSavedPassword] = useState<string>('');

  async function handleWelcomeContinue() {
    setStep('updates');
  }

  async function handleUpdatesContinue() {
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
      await setPassword(password);
      setSavedPassword(password);
      
      if (isBiometricAvailable()) {
        setStep('biometric');
      } else {
        await completeSetup();
      }
    } catch (error) {
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <BookOpen className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Willkommen!</CardTitle>
            <CardDescription>Ihr persönliches Schmerztagebuch</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Check className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold">Flexible Templates</h3>
                <p className="text-sm text-muted-foreground">Erstellen Sie individuelle Tagebuch-Vorlagen</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Check className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold">Offline-fähig</h3>
                <p className="text-sm text-muted-foreground">Alle Daten lokal gespeichert</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Check className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold">Datenschutz</h3>
                <p className="text-sm text-muted-foreground">Optional: Verschlüsselung verfügbar</p>
              </div>
            </div>
          </CardContent>

          <CardFooter>
            <Button onClick={handleWelcomeContinue} className="w-full" size="lg">
              Weiter
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (step === 'updates') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <RefreshCw className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">App-Updates</CardTitle>
            <CardDescription>Wie möchten Sie Updates erhalten?</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div
              onClick={() => setAutoUpdate(true)}
              className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                autoUpdate ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  checked={autoUpdate}
                  onChange={() => setAutoUpdate(true)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">🎉 Automatische Updates (Empfohlen)</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Neue Versionen werden automatisch im Hintergrund installiert.
                  </p>
                  <div className="bg-green-50 border border-green-200 rounded p-2">
                    <p className="text-xs text-green-800">
                      ✓ Immer aktuell • ✓ Keine Unterbrechungen • ✓ Neue Features sofort
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div
              onClick={() => setAutoUpdate(false)}
              className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                !autoUpdate ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  checked={!autoUpdate}
                  onChange={() => setAutoUpdate(false)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">🔍 Manuell prüfen</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Sie entscheiden wann Sie aktualisieren möchten.
                  </p>
                  <div className="bg-amber-50 border border-amber-200 rounded p-2">
                    <p className="text-xs text-amber-800">
                      💡 Manuelles Update jederzeit in den Einstellungen möglich
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex gap-2">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-900">Vollständige Offline-Fähigkeit</p>
                  <p className="text-xs text-blue-700 mt-1">
                    Die App funktioniert komplett offline. Updates nur bei Online-Verbindung.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('welcome')} className="flex-1">
              Zurück
            </Button>
            <Button onClick={handleUpdatesContinue} className="flex-[2]">
              Weiter
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (step === 'encryption') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Datenschutz</CardTitle>
            <CardDescription>Wählen Sie Ihren Verschlüsselungsmodus</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {!isCryptoAvailable() && selectedMode !== 'none' && (
              <div className="bg-amber-50 border-2 border-amber-500 rounded-lg p-3">
                <p className="text-sm font-semibold text-amber-900">{getCryptoWarning()}</p>
                <p className="text-xs text-amber-800 mt-1">
                  Bitte verwende localhost oder HTTPS für Verschlüsselung.
                </p>
              </div>
            )}

            <div
              onClick={() => setSelectedMode('none')}
              className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                selectedMode === 'none' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  checked={selectedMode === 'none'}
                  onChange={() => setSelectedMode('none')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <h3 className="font-semibold">Keine Verschlüsselung</h3>
                  <p className="text-sm text-muted-foreground">
                    Schnellster Zugriff, kein Passwort erforderlich.
                  </p>
                </div>
              </div>
            </div>

            <div
              onClick={() => setSelectedMode('full')}
              className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                selectedMode === 'full' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  checked={selectedMode === 'full'}
                  onChange={() => setSelectedMode('full')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <h3 className="font-semibold">Volle Verschlüsselung</h3>
                  <p className="text-sm text-muted-foreground">
                    Maximale Sicherheit und Privatsphäre. Passwort bei jedem Start.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('updates')} className="flex-1">
              Zurück
            </Button>
            <Button onClick={handleEncryptionContinue} className="flex-[2]">
              {selectedMode === 'none' ? 'Fertig' : 'Weiter'}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (step === 'password') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Key className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Passwort erstellen</CardTitle>
            <CardDescription>Wählen Sie ein sicheres Passwort</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Passwort</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Mindestens 8 Zeichen"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Passwort wiederholen"
                disabled={isLoading}
              />
            </div>

            {passwordError && (
              <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-3">
                <p className="text-sm text-destructive">{passwordError}</p>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-blue-900 mb-2">Anforderungen:</p>
              <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                <li>Mindestens 8 Zeichen</li>
                <li>Mindestens 1 Großbuchstabe</li>
                <li>Mindestens 1 Kleinbuchstabe</li>
                <li>Mindestens 1 Zahl</li>
              </ul>
            </div>
          </CardContent>

          <CardFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('encryption')} className="flex-1" disabled={isLoading}>
              Zurück
            </Button>
            <Button onClick={handlePasswordSubmit} className="flex-[2]" disabled={isLoading}>
              {isLoading ? 'Speichere...' : 'Weiter'}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (step === 'biometric') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Fingerprint className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Biometrie aktivieren?</CardTitle>
            <CardDescription>Schneller Login mit Fingerabdruck oder Face ID</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">Vorteile:</h3>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>Schneller Zugriff ohne Passwort</li>
                <li>Sicher durch Gerätehardware</li>
                <li>Fallback mit Passwort möglich</li>
              </ul>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800">
                Hinweis: Biometrie-Daten werden nur lokal auf diesem Gerät gespeichert.
              </p>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-2">
            <Button onClick={handleBiometricEnable} className="w-full" disabled={isLoading}>
              <Fingerprint className="w-4 h-4 mr-2" />
              {isLoading ? 'Aktiviere...' : 'Biometrie aktivieren'}
            </Button>
            <Button variant="outline" onClick={handleBiometricSkip} className="w-full" disabled={isLoading}>
              Überspringen
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return null;
}
