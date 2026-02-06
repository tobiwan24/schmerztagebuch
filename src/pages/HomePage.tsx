import { useState, useEffect } from 'react';
import type { Template } from '../types/database';
import { Plasma } from '../components/backgrounds/PlasmaBackground';
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
    // Initialize username from localStorage on first render
    return localStorage.getItem('username') || '';
  });

  // Optional: Update username if localStorage changes (e.g., from Settings)
  useEffect(() => {
    const handleStorageChange = () => {
      const storedUsername = localStorage.getItem('username') || '';
      setUsername(storedUsername);
    };

    // Listen for storage events (cross-tab changes)
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return (
    <div className="home-page">
      <Plasma 
        color="#b19eef"
        speed={0.3}
        direction="pingpong"
        scale={1}
        opacity={1}
        mouseInteractive={false}
      />
      
      <div className="home-content">
        {/* Header: Begrüßung */}
        <header className="home-header">
          <h1 className="home-greeting">
            {username ? `Hallo ${username}!` : 'Hallo!'}
          </h1>
        </header>

        {/* Main: Template-Grid */}
        <main className="home-main">
          {isLoading ? (
            <div className="home-loading">
              <div className="spinner"></div>
              <p>Lade Templates...</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="home-empty">
              <p>Keine Templates vorhanden.</p>
              <p className="text-sm text-gray-400 mt-2">
                Erstelle dein erstes Template in den Einstellungen.
              </p>
            </div>
          ) : (
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
                      <IconComponent size={40} />
                    </div>
                    <div className="template-card-name">
                      {template.name}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </main>

        {/* Footer: Navigation-Buttons */}
        <footer className="home-footer">
          <button
            className="nav-button"
            onClick={() => onNavigate('history')}
          >
            <History size={24} />
            <span>Verlauf</span>
          </button>
          
          <button
            className="nav-button"
            onClick={() => onNavigate('dashboard')}
          >
            <TrendingUp size={24} />
            <span>Dashboard</span>
          </button>
          
          <button
            className="nav-button"
            onClick={() => onNavigate('settings')}
          >
            <Settings size={24} />
            <span>Einstellungen</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
