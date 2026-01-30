import { useState, useEffect } from 'react';
import { initializeDB, getAppSettings } from './db';
import { getEncryptionMode, requiresAuth, checkPassword, setSession, isSessionValid } from './utils/auth';
import SetupWizard from './pages/SetupWizard';
import DiaryView from './pages/DiaryView';
import EditorMode from './pages/EditorMode';
import HistoryView from './pages/HistoryView';
import AuthModal from './components/AuthModal';
import DebugPanel from './components/DebugPanel';
import SettingsView from './pages/SettingsView';
import InstallPrompt from './components/InstallPrompt';
import './App.css';


export default function App() {
  const [currentView, setCurrentView] = useState<'setup' | 'diary' | 'editor' | 'history' | 'settings'>('setup');
  const [isLoading, setIsLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingView, setPendingView] = useState<'diary' | 'editor' | 'history' | null>(null);
  const [debugEnabled, setDebugEnabled] = useState(false);

  useEffect(() => {
    initApp();
    
    // Debug-Modus laden
    const debugMode = localStorage.getItem('debugEnabled');
    setDebugEnabled(debugMode === 'true');
  }, []);

  async function initApp() {
    try {
      await initializeDB();
      const settings = await getAppSettings();
      const mode = await getEncryptionMode();
      
      if (settings.setupCompleted) {
        // Prüfe ob Auth für Diary erforderlich ist (nur bei 'full' mode)
        if (mode === 'full' && !isSessionValid()) {
          setPendingView('diary');
          setShowAuthModal(true);
        } else {
          setCurrentView('diary');
        }
      } else {
        setCurrentView('setup');
      }
    } catch (error) {
      console.error('Fehler beim Initialisieren:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const handleSetupComplete = () => {
    setCurrentView('diary');
  };

  const handleNavigate = async (view: 'editor' | 'history' | 'diary' | 'settings') => {
    // Prüfe ob Auth erforderlich
    const needsAuth = await requiresAuth(view as 'diary' | 'history' | 'editor');
    
    if (needsAuth && !isSessionValid()) {
      setPendingView(view as 'diary' | 'history' | 'editor');
      setShowAuthModal(true);
    } else {
      setCurrentView(view);
    }
  };

  const handleBack = () => {
    setCurrentView('diary');
  };

  async function handleAuthenticate(password: string): Promise<boolean> {
    const valid = await checkPassword(password);
    
    if (valid) {
      setSession(password);
      setShowAuthModal(false);
      
      if (pendingView) {
        setCurrentView(pendingView);
        setPendingView(null);
      }
      
      return true;
    }
    
    return false;
  }

  function handleCancelAuth() {
    setShowAuthModal(false);
    setPendingView(null);
  }

  if (isLoading) {
    return (
      <>
        <div className="app-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="text-center">
            <div className="spinner"></div>
            <p className="text-gray-600" style={{ marginTop: '1rem' }}>Wird geladen...</p>
          </div>
        </div>
        {debugEnabled && <DebugPanel />}
      </>
    );
  }

  if (currentView === 'setup') {
    return (
      <>
        <SetupWizard onComplete={handleSetupComplete} />
        {debugEnabled && <DebugPanel />}
      </>
    );
  }

  if (currentView === 'editor') {
    return (
      <>
        <EditorMode onBack={handleBack} onNavigate={handleNavigate} />
        {showAuthModal && (
          <AuthModal 
            onAuthenticate={handleAuthenticate}
            onCancel={handleCancelAuth}
          />
        )}
        {debugEnabled && <DebugPanel />}
      </>
    );
  }

  if (currentView === 'history') {
    return (
      <>
        <HistoryView onBack={handleBack} />
        {showAuthModal && (
          <AuthModal 
            onAuthenticate={handleAuthenticate}
            onCancel={handleCancelAuth}
          />
        )}
        {debugEnabled && <DebugPanel />}
      </>
    );
  }

  if (currentView === 'settings') {
    // Settings view not yet implemented, redirect to diary
    return (
      <>
        <SettingsView onBack={handleBack} />
        {debugEnabled && <DebugPanel />}
      </>
    );
  
  }

  return (
    <>
      <DiaryView onNavigate={handleNavigate} />
      {showAuthModal && (
        <AuthModal 
          onAuthenticate={handleAuthenticate}
          onCancel={handleCancelAuth}
        />
      )}
      {debugEnabled && <DebugPanel />}
      <InstallPrompt />
    </>
  );
}
