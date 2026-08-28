import { useState } from 'react';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import SetupWizard from './pages/SetupWizard';
import HomePage from './pages/HomePage';
import DiaryView from './pages/DiaryView';
import EditorMode from './pages/EditorMode';
import HistoryView from './pages/HistoryView';
import DashboardView from './pages/DashboardView';
import AuthModal from './components/AuthModal';
import CloudUnlockModal from './components/CloudUnlockModal';
import DebugPanel from './components/DebugPanel';
import SettingsView from './pages/SettingsView';
import CloudSyncSetup from './pages/CloudSyncSetup';
import InstallPrompt from './components/InstallPrompt';
import UpdateBanner from './components/UpdateBanner';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

function AppInner() {
  const {
    currentView,
    isAppLoading,
    loadingMessage,
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
            <p className="text-gray-600" style={{ marginTop: '1rem' }}>{loadingMessage || 'Wird geladen...'}</p>
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
        <ErrorBoundary><SetupWizard /></ErrorBoundary>
        {debugEnabled && <DebugPanel />}
      </>
    );
  }

  if (currentView === 'editor') {
    return (
      <>
        <ErrorBoundary><EditorMode /></ErrorBoundary>
        {authModal}
        {debugEnabled && <DebugPanel />}
      </>
    );
  }

  if (currentView === 'history') {
    return (
      <>
        <ErrorBoundary><HistoryView /></ErrorBoundary>
        {authModal}
        {debugEnabled && <DebugPanel />}
      </>
    );
  }

  if (currentView === 'settings') {
    return (
      <>
        <ErrorBoundary><SettingsView /></ErrorBoundary>
        {debugEnabled && <DebugPanel />}
      </>
    );
  }

  if (currentView === 'cloudSetup') {
    return (
      <>
        <ErrorBoundary><CloudSyncSetup /></ErrorBoundary>
        {debugEnabled && <DebugPanel />}
      </>
    );
  }

  if (currentView === 'dashboard') {
    return (
      <>
        <ErrorBoundary><DashboardView /></ErrorBoundary>
        {authModal}
        {debugEnabled && <DebugPanel />}
      </>
    );
  }

  if (currentView === 'home') {
    return (
      <>
        <ErrorBoundary><HomePage /></ErrorBoundary>
        {authModal}
        {debugEnabled && <DebugPanel />}
        <InstallPrompt />
      </>
    );
  }

  // DiaryView
  return (
    <>
      <ErrorBoundary><DiaryView /></ErrorBoundary>
      {authModal}
      {debugEnabled && <DebugPanel />}
      <InstallPrompt />
    </>
  );
}

function CloudUnlockGate() {
  const { showCloudUnlockModal, handleCloudUnlock, handleDismissCloudUnlock } = useNavigation();
  if (!showCloudUnlockModal) return null;
  return <CloudUnlockModal onUnlock={handleCloudUnlock} onCancel={handleDismissCloudUnlock} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <NavigationProvider>
        <AppInner />
        <CloudUnlockGate />
        <UpdateBanner />
      </NavigationProvider>
    </ErrorBoundary>
  );
}
