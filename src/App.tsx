import { useState, useEffect } from 'react';
import { initializeDB, getAppSettings } from './db';
import { requiresAuth, checkPassword, setSession, isSessionValid } from './utils/auth';
import SetupWizard from './pages/SetupWizard';
import HomePage from './pages/HomePage';
import DiaryView from './pages/DiaryView';
import EditorMode from './pages/EditorMode';
import HistoryView from './pages/HistoryView';
import DashboardView from './pages/DashboardView';
import AuthModal from './components/AuthModal';
import DebugPanel from './components/DebugPanel';
import SettingsView from './pages/SettingsView';
import InstallPrompt from './components/InstallPrompt';
import db from './db';
import type { Template } from './types/database';
import './App.css';

export default function App() {
  const [currentView, setCurrentView] = useState<'setup' | 'home' | 'diary' | 'editor' | 'history' | 'settings' | 'dashboard'>('setup');
  const [isLoading, setIsLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingView, setPendingView] = useState<'home' | 'diary' | 'editor' | 'history' | null>(null);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<number | undefined>(undefined);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<number | undefined>(undefined);

  useEffect(() => {
    async function init() {
      try {
        await initializeDB();
        const settings = await getAppSettings();

        // Load templates
        await loadTemplates();

        if (settings.setupCompleted) {
          if (settings.encryptionMode === 'full' && !isSessionValid()) {
            setPendingView('home');
            setShowAuthModal(true);
          } else {
            setCurrentView('home');
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
    
    init();
    
    const debugMode = localStorage.getItem('debugEnabled');
    setDebugEnabled(debugMode === 'true');
  }, []);

  // Reload templates when returning to home view
  useEffect(() => {
    if (currentView === 'home') {
      loadTemplates();
    }
  }, [currentView]);

  async function loadTemplates() {
    const allTemplates = await db.templates.orderBy('order').toArray();
    setTemplates(allTemplates);
  }

  const handleSetupComplete = () => {
    setCurrentView('home');
    loadTemplates(); // Reload templates after setup
  };

  const handleNavigate = async (view: 'editor' | 'history' | 'diary' | 'settings' | 'dashboard') => {
    const needsAuth = await requiresAuth();
    
    if (needsAuth && !isSessionValid()) {
      setPendingView(view as 'diary' | 'history' | 'editor');
      setShowAuthModal(true);
    } else {
      setCurrentView(view);
    }
  };

  const handleNavigateToHome = async () => {
    // Reload templates before showing HomePage
    await loadTemplates();
    setActiveTemplateId(undefined);
    setCurrentView('home');
  };

  const handleSelectTemplate = (templateId: number) => {
    setActiveTemplateId(templateId);
    setCurrentView('diary');
  };

  const handleEditTemplate = (templateId: number) => {
    setEditingTemplateId(templateId);
    setCurrentView('editor');
  };

  const handleBackFromEditor = async (templateId?: number) => {
    setEditingTemplateId(undefined);
    
    if (templateId) {
      // Nach Speichern: Templates neu laden und zur DiaryView mit dem bearbeiteten Template
      await loadTemplates();
      setActiveTemplateId(templateId);
      setCurrentView('diary');
    } else {
      // Normale Zurück-Navigation aus Editor: Zur HomePage
      setActiveTemplateId(undefined);
      await loadTemplates();
      setCurrentView('home');
    }
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
        <EditorMode 
          onBack={handleBackFromEditor} 
          initialTemplateId={editingTemplateId}
        />
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
        <HistoryView onBack={handleNavigateToHome} />
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
    return (
      <>
        <SettingsView onBack={handleNavigateToHome} />
        {debugEnabled && <DebugPanel />}
      </>
    );
  }

  if (currentView === 'dashboard') {
    return (
      <>
        <DashboardView onBack={handleNavigateToHome} onNavigate={handleNavigate} />
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

  // HomePage View
  if (currentView === 'home') {
    return (
      <>
        <HomePage
          templates={templates}
          onSelectTemplate={handleSelectTemplate}
          onNavigate={handleNavigate}
          isLoading={false}
        />
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

  // DiaryView
  return (
    <>
      <DiaryView 
        onNavigate={handleNavigate}
        onEditTemplate={handleEditTemplate}
        onBack={handleNavigateToHome}
        initialActiveTemplateId={activeTemplateId}
      />
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
