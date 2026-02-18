import { useState, useEffect, useMemo } from 'react';
import type { Template } from '../types/database';
import { getIconComponent } from '../utils/iconUtils';
import { History, TrendingUp, Settings } from 'lucide-react';
import '../styles/home-page.css';

interface HomePageProps {
  templates: Template[];
  onSelectTemplate: (templateId: number) => void;
  onNavigate: (view: 'history' | 'dashboard' | 'settings') => void;
  isLoading?: boolean;
}

export default function HomePage({ templates, onSelectTemplate, onNavigate, isLoading }: HomePageProps) {
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
    if (isLoading) {
      return (
        <div className="home-loading">
          <div className="spinner"></div>
          <p>Lade Vorlagen...</p>
        </div>
      );
    }

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
              onClick={() => template.id && onSelectTemplate(template.id)}
              style={{
                '--template-color': template.color || '#007AFF'
              } as React.CSSProperties}
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
  }, [templates, isLoading, onSelectTemplate]);

  return (
    <div className="home-page">
      
      <div className="home-content">
        <header className="home-header">
          <h1 className="home-greeting">
            {username ? `Hallo ${username}!` : 'Hallo!'}
          </h1>
        </header>

        <main className="home-main">
          {templateCards}
        </main>

        <footer className="home-footer">
          <button
            className="nav-button"
            onClick={() => onNavigate('history')}
          >
            <History size={28} strokeWidth={2.5} />
            <span>Verlauf</span>
          </button>
          
          <button
            className="nav-button"
            onClick={() => onNavigate('dashboard')}
          >
            <TrendingUp size={28} strokeWidth={2.5} />
            <span>Dashboard</span>
          </button>
          
          <button
            className="nav-button"
            onClick={() => onNavigate('settings')}
          >
            <Settings size={28} strokeWidth={2.5} />
            <span>Einstellungen</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
