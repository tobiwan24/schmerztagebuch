import { useState } from 'react';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
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
import './App.css';

function AppInner() {
  const {
    currentView,
    isAppLoading,
    showAuthModal,
    handleAuthenticate,
    handleCancelAuth,
  } = useNavigation();

  const [debugEnabled] = useState(() => localStorage.getItem('debugEnabled') === 'true');

  if (isAppLoading) {
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

  const authModal = showAuthModal && (
    <AuthModal
      onAuthenticate={handleAuthenticate}
      onCancel={handleCancelAuth}
    />
  );

  if (currentView === 'setup') {
    return (
      <>
        <SetupWizard />
        {debugEnabled && <DebugPanel />}
      </>
    );
  }

  if (currentView === 'editor') {
    return (
      <>
        <EditorMode />
        {authModal}
        {debugEnabled && <DebugPanel />}
      </>
    );
  }

  if (currentView === 'history') {
    return (
      <>
        <HistoryView />
        {authModal}
        {debugEnabled && <DebugPanel />}
      </>
    );
  }

  if (currentView === 'settings') {
    return (
      <>
        <SettingsView />
        {debugEnabled && <DebugPanel />}
      </>
    );
  }

  if (currentView === 'dashboard') {
    return (
      <>
        <DashboardView />
        {authModal}
        {debugEnabled && <DebugPanel />}
      </>
    );
  }

  if (currentView === 'home') {
    return (
      <>
        <HomePage />
        {authModal}
        {debugEnabled && <DebugPanel />}
        <InstallPrompt />
      </>
    );
  }

  // DiaryView
  return (
    <>
      <DiaryView />
      {authModal}
      {debugEnabled && <DebugPanel />}
      <InstallPrompt />
    </>
  );
}

export default function App() {
  return (
    <NavigationProvider>
      <AppInner />
    </NavigationProvider>
  );
}
