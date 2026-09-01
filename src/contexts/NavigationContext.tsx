/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { initializeDB, getAppSettings, getCurrentDBVersion, DB_TARGET_VERSION, getSetting, runCryptoMigration, getTemplates } from '../db';
import db from '../db';
import { getEncryptionMode, requiresAuth, checkPassword, setSession, getSessionKey, clearSession, isSessionValid, refreshSession, INACTIVITY_TIMEOUT } from '../utils/auth';
import type { Template } from '../types/database';
import {
  requestPersistentStorage,
  isPersistentStorageGranted,
  isIOSNonSafari,
} from '../utils/persistentStorage';
import {
  createAutoBackup,
  restoreFromAutoBackup,
  hasAutoBackup,
  getBackupTimestamp,
  initAutoBackupHooks,
} from '../utils/autoBackup';
import { initializeNotifications } from '../services/notificationService';
import { initSyncTriggers, runSync } from '../services/syncService';
import { isCloudSyncEnabled, isCloudSessionValid, getCloudUsername, loginWithPasskey } from '../services/cloudAuthService';

export type ViewType = 'setup' | 'home' | 'diary' | 'editor' | 'history' | 'settings' | 'dashboard' | 'cloudSetup';

interface NavigationContextValue {
  currentView: ViewType;
  isAppLoading: boolean;
  loadingMessage: string;
  navigate: (view: ViewType) => Promise<void>;
  goHome: () => Promise<void>;
  selectTemplate: (id: number) => void;
  editTemplate: (id: number) => void;
  backFromEditor: (savedTemplateId?: number) => Promise<void>;
  setupComplete: () => void;
  showAuthModal: boolean;
  handleAuthenticate: (password: string) => Promise<boolean>;
  handleCancelAuth: () => void;
  showCloudUnlockModal: boolean;
  handleCloudUnlock: () => Promise<boolean>;
  handleDismissCloudUnlock: () => void;
  templates: Template[];
  reloadTemplates: () => Promise<void>;
  activeTemplateId: number | undefined;
  editingTemplateId: number | undefined;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider');
  return ctx;
}

interface NavigationProviderProps {
  children: ReactNode;
}

export function NavigationProvider({ children }: NavigationProviderProps) {
  const [currentView, setCurrentView] = useState<ViewType>('setup');
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showCloudUnlockModal, setShowCloudUnlockModal] = useState(false);
  const [pendingView, setPendingView] = useState<ViewType | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<number | undefined>(undefined);
  const [editingTemplateId, setEditingTemplateId] = useState<number | undefined>(undefined);
  const currentViewRef = useRef<ViewType>('setup');

  // currentViewRef immer aktuell halten (kein stale closure in Timern)
  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  // App initialization
  useEffect(() => {
    async function init() {
      try {
        const currentVer = await getCurrentDBVersion();
        if (currentVer > 0 && currentVer < DB_TARGET_VERSION) {
          setLoadingMessage('Datenbank wird aktualisiert...');
        }
        await initializeDB();
        setLoadingMessage('');

        // Auto-Backup Hooks einmalig registrieren
        initAutoBackupHooks();

        // Cloud-Sync-Trigger einmalig registrieren (visibilitychange/online/debounced writes);
        // der eigentliche Sync läuft nur, wenn eine gültige Cloud-Session vorliegt (siehe
        // runSync() in syncService.ts) — für Nutzer ohne Cloud-Sync ist das ein No-Op.
        initSyncTriggers();
        if (await isCloudSyncEnabled()) {
          runSync().catch(err => console.warn('App-Start Cloud-Sync fehlgeschlagen:', err));
        }

        // Notification-Scheduling initialisieren
        await initializeNotifications();

        // Persistent Storage anfordern (falls noch nicht gewährt)
        const alreadyGranted = await isPersistentStorageGranted();
        if (!alreadyGranted) {
          const lastTryStr = localStorage.getItem('persist_last_try');
          const daysSince = lastTryStr
            ? (Date.now() - Number(lastTryStr)) / 86400000
            : 999;
          if (daysSince > 3) {
            localStorage.setItem('persist_last_try', Date.now().toString());
            await requestPersistentStorage();
          }
        }

        // Auto-Restore: DB leer + Backup vorhanden + Backup < 7 Tage alt
        const entryCount = await db.entries.count();
        if (entryCount === 0 && hasAutoBackup()) {
          const backupDate = getBackupTimestamp();
          const daysSince = backupDate
            ? (Date.now() - backupDate.getTime()) / 86400000
            : 999;
          if (daysSince < 7) {
            const restored = await restoreFromAutoBackup();
            if (restored) {
              console.log('✅ Auto-Restore beim App-Start erfolgreich');
            }
          }
        }

        // Initiales Backup beim App-Start
        createAutoBackup().catch(err => console.warn('App-Start Backup fehlgeschlagen:', err));

        // Safari-Warnung für iOS-Nicht-Safari-Nutzer
        if (isIOSNonSafari()) {
          const dismissed = localStorage.getItem('safari_warning_dismissed');
          if (!dismissed) {
            console.log('iOS non-Safari detected – DataProtectionBanner wird angezeigt');
          }
        }

        const settings = await getAppSettings();
        const mode = await getEncryptionMode();

        await reloadTemplates();

        if (settings.setupCompleted) {
          if (mode === 'full' && !isSessionValid()) {
            setPendingView('home');
            setShowAuthModal(true);
          } else {
            setCurrentView('home');
          }

          // Cloud-Sync ist ein unabhängiger, paralleler Schutzmechanismus zur lokalen
          // Passwort-Verschlüsselung — eigenes Modal, blockiert die lokale Ansicht nicht.
          if (await isCloudSyncEnabled() && !isCloudSessionValid()) {
            setShowCloudUnlockModal(true);
          }
        } else {
          setCurrentView('setup');
        }
      } catch (error) {
        console.error('Fehler beim Initialisieren:', error);
      } finally {
        setIsAppLoading(false);
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inaktivitäts-Timer: Sperrt App nach INACTIVITY_TIMEOUT ms ohne User-Interaktion
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    function lock() {
      if (!isSessionValid()) return;
      clearSession();
      setPendingView(currentViewRef.current);
      setShowAuthModal(true);
    }

    function resetTimer() {
      if (!isSessionValid()) return;
      refreshSession();
      if (timer) clearTimeout(timer);
      timer = setTimeout(lock, INACTIVITY_TIMEOUT);
    }

    const events = ['click', 'keydown', 'pointermove', 'touchstart', 'scroll'] as const;
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));

    // Einmalig starten wenn Session aktiv
    if (isSessionValid()) {
      timer = setTimeout(lock, INACTIVITY_TIMEOUT);
    }

    return () => {
      if (timer) clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, []);

  // visibilitychange: Sperrt App wenn Tab/App in den Hintergrund geht
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden && isSessionValid()) {
        clearSession();
        setPendingView(currentViewRef.current);
        setShowAuthModal(true);
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Reload templates when returning to home
  useEffect(() => {
    if (currentView === 'home') {
      reloadTemplates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView]);

  const reloadTemplates = useCallback(async () => {
    const allTemplates = await getTemplates();
    setTemplates(allTemplates);
  }, []);

  const navigate = useCallback(async (view: ViewType) => {
    const needsAuth = await requiresAuth(view as 'diary' | 'history' | 'editor');
    if (needsAuth && !isSessionValid()) {
      setPendingView(view);
      setShowAuthModal(true);
    } else {
      setCurrentView(view);
    }
  }, []);

  const goHome = useCallback(async () => {
    await reloadTemplates();
    setActiveTemplateId(undefined);
    setCurrentView('home');
  }, [reloadTemplates]);

  const selectTemplate = useCallback((id: number) => {
    setActiveTemplateId(id);
    setCurrentView('diary');
  }, []);

  const editTemplate = useCallback((id: number) => {
    setEditingTemplateId(id);
    setCurrentView('editor');
  }, []);

  const backFromEditor = useCallback(async (savedTemplateId?: number) => {
    setEditingTemplateId(undefined);
    if (savedTemplateId) {
      await reloadTemplates();
      setActiveTemplateId(savedTemplateId);
      setCurrentView('diary');
    } else {
      setActiveTemplateId(undefined);
      await reloadTemplates();
      setCurrentView('home');
    }
  }, [reloadTemplates]);

  const setupComplete = useCallback(() => {
    setCurrentView('home');
    reloadTemplates();
  }, [reloadTemplates]);

  const handleAuthenticate = useCallback(async (password: string): Promise<boolean> => {
    const valid = await checkPassword(password);
    if (valid) {
      await setSession(password);
      setShowAuthModal(false);
      if (pendingView) {
        setCurrentView(pendingView);
        setPendingView(null);
      }

      // Background-Migration: v1 → v2 (blockiert nicht)
      const cryptoVersion = await getSetting('cryptoVersion');
      if (cryptoVersion !== 'v2') {
        const key = await getSessionKey();
        if (key) runCryptoMigration(password, key).catch(console.error);
      }

      return true;
    }
    return false;
  }, [pendingView]);

  const handleCancelAuth = useCallback(() => {
    // Abbrechen darf niemals zur zuvor angezeigten (geschützten) View zurückführen —
    // sonst wäre die Sperre nur kosmetisch. Home ist ungeschützt und damit sicher.
    setShowAuthModal(false);
    setPendingView(null);
    setCurrentView('home');
  }, []);

  const handleCloudUnlock = useCallback(async (): Promise<boolean> => {
    const username = await getCloudUsername();
    if (!username) return false;
    try {
      await loginWithPasskey(username);
      setShowCloudUnlockModal(false);
      runSync().catch(err => console.warn('Sync nach Cloud-Unlock fehlgeschlagen:', err));
      return true;
    } catch (error) {
      console.error('Cloud-Unlock fehlgeschlagen:', error);
      return false;
    }
  }, []);

  const handleDismissCloudUnlock = useCallback(() => {
    setShowCloudUnlockModal(false);
  }, []);

  return (
    <NavigationContext.Provider value={{
      currentView,
      isAppLoading,
      loadingMessage,
      navigate,
      goHome,
      selectTemplate,
      editTemplate,
      backFromEditor,
      setupComplete,
      showAuthModal,
      handleAuthenticate,
      handleCancelAuth,
      showCloudUnlockModal,
      handleCloudUnlock,
      handleDismissCloudUnlock,
      templates,
      reloadTemplates,
      activeTemplateId,
      editingTemplateId,
    }}>
      {children}
    </NavigationContext.Provider>
  );
}
