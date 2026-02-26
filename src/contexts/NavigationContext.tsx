/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { initializeDB, getAppSettings } from '../db';
import db from '../db';
import { getEncryptionMode, requiresAuth, checkPassword, setSession, isSessionValid, refreshSession } from '../utils/auth';
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

export type ViewType = 'setup' | 'home' | 'diary' | 'editor' | 'history' | 'settings' | 'dashboard';

interface NavigationContextValue {
  currentView: ViewType;
  isAppLoading: boolean;
  navigate: (view: ViewType) => Promise<void>;
  goHome: () => Promise<void>;
  selectTemplate: (id: number) => void;
  editTemplate: (id: number) => void;
  backFromEditor: (savedTemplateId?: number) => Promise<void>;
  setupComplete: () => void;
  showAuthModal: boolean;
  handleAuthenticate: (password: string) => Promise<boolean>;
  handleCancelAuth: () => void;
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
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingView, setPendingView] = useState<ViewType | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<number | undefined>(undefined);
  const [editingTemplateId, setEditingTemplateId] = useState<number | undefined>(undefined);

  // App initialization
  useEffect(() => {
    async function init() {
      try {
        await initializeDB();

        // Auto-Backup Hooks einmalig registrieren
        initAutoBackupHooks();

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

  // Session auto-refresh on user activity
  useEffect(() => {
    const refresh = () => { if (isSessionValid()) refreshSession(); };
    window.addEventListener('click', refresh);
    window.addEventListener('keydown', refresh);
    window.addEventListener('touchstart', refresh);
    return () => {
      window.removeEventListener('click', refresh);
      window.removeEventListener('keydown', refresh);
      window.removeEventListener('touchstart', refresh);
    };
  }, []);

  // Reload templates when returning to home
  useEffect(() => {
    if (currentView === 'home') {
      reloadTemplates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView]);

  const reloadTemplates = useCallback(async () => {
    const allTemplates = await db.templates.orderBy('order').toArray();
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
      setSession(password);
      setShowAuthModal(false);
      if (pendingView) {
        setCurrentView(pendingView);
        setPendingView(null);
      }
      return true;
    }
    return false;
  }, [pendingView]);

  const handleCancelAuth = useCallback(() => {
    setShowAuthModal(false);
    setPendingView(null);
  }, []);

  return (
    <NavigationContext.Provider value={{
      currentView,
      isAppLoading,
      navigate,
      goHome,
      selectTemplate,
      editTemplate,
      backFromEditor,
      setupComplete,
      showAuthModal,
      handleAuthenticate,
      handleCancelAuth,
      templates,
      reloadTemplates,
      activeTemplateId,
      editingTemplateId,
    }}>
      {children}
    </NavigationContext.Provider>
  );
}
