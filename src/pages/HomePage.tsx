import { useState, useEffect, useMemo } from 'react';
import { getIconComponent } from '../utils/iconUtils';
import { History, TrendingUp, Settings } from 'lucide-react';
import '../styles/home-page.css';
import PageTutorial from '../components/tutorial/PageTutorial';
import { useNavigation } from '../contexts/NavigationContext';
import { RestoreBackupBanner } from '../components/RestoreBackupBanner';
import { BackupReminder } from '../components/BackupReminder';
import { DataProtectionBanner } from '../components/DataProtectionBanner';
import { CloudSyncBanner } from '../components/CloudSyncBanner';

export default function HomePage() {
  const { templates, selectTemplate, navigate } = useNavigation();

  const [username, setUsername] = useState<string>(() => {
    return localStorage.getItem('username') || '';
  });

  useEffect(() => {
    const handleStorageChange = () => {
      const storedUsername = localStorage.getItem('username') || '';
      setUsername(storedUsername);
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Memoize template rendering to prevent unnecessary re-renders
  const templateCards = useMemo(() => {
    if (templates.length === 0) {
      return (
        <div className="home-empty">
          <p>Keine Vorlagen vorhanden.</p>
          <p className="text-sm text-gray-400 mt-2">
            Erstelle deine erste Vorlage in den Einstellungen.
          </p>
        </div>
      );
    }

    return (
      <div className="template-grid">
        {templates.map((template) => {
          const IconComponent = getIconComponent(template.icon || 'book');

          return (
            <button
              key={template.id}
              className="template-card"
              onClick={() => template.id && selectTemplate(template.id)}
            >
              <div className="template-card-icon">
                <IconComponent size={48} strokeWidth={2.5} />
              </div>
              <div className="template-card-name">
                {template.name}
              </div>
            </button>
          );
        })}
      </div>
    );
  }, [templates, selectTemplate]);

  return (
    <div className="home-page">

      <div className="home-content">
        <RestoreBackupBanner />
        <DataProtectionBanner />
        <CloudSyncBanner />
        <BackupReminder />
        <header className="home-header">
          <h1 className="home-greeting">
            {username ? `Hallo ${username}!` : 'Hallo!'}
          </h1>
        </header>

        <main className="home-main">
          {templateCards}
        </main>

      {/* Tutorial - HomePage */}
      <PageTutorial
        page="home"
        steps={[
          {
            spotlight: null,
            text: 'Auf der Startseite findest du alle wichtigen Inhalte.',
            cardPosition: 'between',
            betweenSelectors: ['.template-grid', '.home-footer'],
          },
          {
            spotlight: '.home-footer',
            title: 'Navigation',
            text: 'Im unteren Bereich befindet sich das Menü, über das du Zugriff auf Verlauf, Dashboard und Einstellungen hast.',
            cardPosition: 'between',
            betweenSelectors: ['.template-grid', '.home-footer'],
          },
          {
            spotlight: '.template-grid',
            title: 'Deine Vorlagen',
            text: 'Hier findest du deine Tagebuch-Vorlagen, um schnell Einträge anzulegen. Probiere es direkt aus!',
            cardPosition: 'between',
            betweenSelectors: ['.template-grid', '.home-footer'],
          },
        ]}
      />

        <footer className="home-footer">
          <button
            className="nav-button"
            onClick={() => navigate('history')}
          >
            <History size={28} strokeWidth={2.5} />
            <span>Verlauf</span>
          </button>

          <button
            className="nav-button"
            onClick={() => navigate('dashboard')}
          >
            <TrendingUp size={28} strokeWidth={2.5} />
            <span>Dashboard</span>
          </button>

          <button
            className="nav-button"
            onClick={() => navigate('settings')}
          >
            <Settings size={28} strokeWidth={2.5} />
            <span>Einstellungen</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
