import { useState, useEffect } from 'react';
import type { Block } from '../types/blocks';
import type { Template } from '../types/database';
import db from '../db';
import { getEncryptionMode, getSessionPassword, refreshSession } from '../utils/auth';
import { encryptData } from '../utils/crypto';
import BlockRenderer from '../components/BlockRenderer';
import { getIconComponent } from '../components/TemplateStylePicker';
import { Save, Menu, X } from 'lucide-react';

interface DiaryViewProps {
  onNavigate: (view: 'editor' | 'history' | 'diary' | 'settings') => void;
}

export default function DiaryView({ onNavigate }: DiaryViewProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [currentBlocks, setCurrentBlocks] = useState<Block[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (templates.length > 0 && activeTabIndex < templates.length) {
      setCurrentBlocks(JSON.parse(JSON.stringify(templates[activeTabIndex].blocks)));
    }
  }, [activeTabIndex, templates]);

  async function loadTemplates() {
    const allTemplates = await db.templates.orderBy('order').toArray();
    setTemplates(allTemplates);
  }

  function handleBlockChange(blockId: string, value: string | number | boolean | string[]) {
    setCurrentBlocks(prev => 
      prev.map(block => 
        block.id === blockId ? { ...block, value } : block
      )
    );
  }

async function handleSave() {
  if (!templates[activeTabIndex]?.id) return;
  
  setIsSaving(true);
  try {
    // Prüfe Verschlüsselungsmodus
    const mode = await getEncryptionMode();
    
    // Nur Blöcke mit Werten speichern
    const blocksToSave = currentBlocks.filter(block => {
      // Prüfe ob Block einen Wert hat
      if (block.value === undefined || block.value === null) return false;
      if (typeof block.value === 'string' && block.value.trim() === '') return false;
      if (Array.isArray(block.value) && block.value.length === 0) return false;
      return true;
    });
    
    if (blocksToSave.length === 0) {
      alert('Bitte fülle mindestens ein Feld aus!');
      setIsSaving(false);
      return;
    }
    
    let data: string;
    let encrypted = false;
    
    if (mode !== 'none') {
      // Verschlüsseln - Session muss existieren (da full mode = Login beim Start)
      const password = getSessionPassword();
      
      if (!password) {
        // Das sollte nicht passieren bei mode='full'
        alert('⚠️ Fehler: Session nicht vorhanden. Bitte App neu starten.');
        setIsSaving(false);
        return;
      }
      
      // Session verlängern
      refreshSession();
      
      const jsonData = JSON.stringify(blocksToSave);
      data = await encryptData(jsonData, password);
      encrypted = true;
    } else {
      // Unverschlüsselt
      data = JSON.stringify(blocksToSave);
    }
    
    const tags: string[] = [];
    
    blocksToSave.forEach(block => {
      if (block.type === 'multiselect' && Array.isArray(block.value)) {
        tags.push(...block.value);
      }
    });
    
    await db.entries.add({
      templateId: templates[activeTabIndex].id!,
      timestamp: new Date(),
      encrypted,
      data,
      tags
    });
    
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);
    
    // Reset zu Template-Defaults
    setCurrentBlocks(JSON.parse(JSON.stringify(templates[activeTabIndex].blocks)));
  } catch (error) {
    console.error('Fehler beim Speichern:', error);
    alert('Fehler beim Speichern des Eintrags');
  } finally {
    setIsSaving(false);
  }
}

  if (templates.length === 0) {
    return (
      <div className="app-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="text-center">
          <p className="text-gray-600">Keine Templates gefunden</p>
        </div>
      </div>
    );
  }

  const activeTemplate = templates[activeTabIndex];

  return (
    <div className="app-container diary-with-tabs">
      {/* Content ohne Header */}
      <div className="content-wrapper content-without-header">
        <div className="card space-y-6">
          {currentBlocks.map(block => (
            <BlockRenderer
              key={block.id}
              block={block}
              onChange={(value) => handleBlockChange(block.id, value)}
            />
          ))}
        </div>
      </div>

      {showSuccess && (
        <div className="toast">
          ✓ Eintrag gespeichert
        </div>
      )}

      {/* Fixierter Menü-Button links unten */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="floating-menu-button"
      >
        {showMenu ? <X size={24} color="white" /> : <Menu size={24} color="white" />}
      </button>

      {/* Menü-Overlay */}
      {showMenu && (
        <>
          <div className="menu-overlay" onClick={() => setShowMenu(false)} />
          <div className="floating-menu">
            <button
              onClick={() => {
                setShowMenu(false);
                onNavigate('editor');
              }}
              className="floating-menu-item"
            >
              <svg className="icon-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span>Templates bearbeiten</span>
            </button>
            <button
              onClick={() => {
                setShowMenu(false);
                onNavigate('history');
              }}
              className="floating-menu-item"
            >
              <svg className="icon-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Verlauf anzeigen</span>
            </button>
            <button
              onClick={() => {
                setShowMenu(false);
                onNavigate('settings');
              }}
              className="floating-menu-item"
            >
              <svg className="icon-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Einstellungen</span>
            </button>
          </div>
        </>
      )}

      {/* Fixierter Speichern-Button rechts unten */}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="floating-save-button"
      >
        <Save size={24} color="white" />
      </button>

      {/* Instagram-Style Tab Bar - NUR Template Buttons */}
      <div className="instagram-tab-bar">
        <div className="instagram-tab-bar-content">
          {/* Templates LINKS vom aktiven (in umgekehrter Reihenfolge) */}
          {templates
            .slice(0, activeTabIndex)
            .reverse()
            .map((template) => {
              const IconComponent = getIconComponent(template.icon);
              const originalIndex = templates.indexOf(template);
              return (
                <button
                  key={template.id}
                  onClick={() => setActiveTabIndex(originalIndex)}
                  className="instagram-tab-button"
                  style={{
                    backgroundColor: template.color || '#007AFF',
                  }}
                >
                  <IconComponent size={20} color="white" />
                </button>
              );
            })}

          {/* AKTIVES Template - hervorgehoben */}
          <button
            className="instagram-tab-button instagram-tab-active"
            style={{
              backgroundColor: activeTemplate.color || '#007AFF',
            }}
          >
            {(() => {
              const IconComponent = getIconComponent(activeTemplate.icon);
              return <IconComponent size={24} color="white" />;
            })()}
          </button>

          {/* Templates RECHTS vom aktiven */}
          {templates.slice(activeTabIndex + 1).map((template) => {
            const IconComponent = getIconComponent(template.icon);
            const originalIndex = templates.indexOf(template);
            return (
              <button
                key={template.id}
                onClick={() => setActiveTabIndex(originalIndex)}
                className="instagram-tab-button"
                style={{
                  backgroundColor: template.color || '#007AFF',
                }}
              >
                <IconComponent size={20} color="white" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
