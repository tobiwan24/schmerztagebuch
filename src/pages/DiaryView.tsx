import { useState, useEffect } from 'react';
import type { Block } from '../types/blocks';
import type { Template } from '../types/database';
import db from '../db';
import { getEncryptionMode, getSessionPassword, refreshSession } from '../utils/auth';
import { encryptData } from '../utils/crypto';
import Header from '../components/Header';
import BlockRenderer from '../components/BlockRenderer';

interface DiaryViewProps {
  onNavigate: (view: 'editor' | 'history' | 'diary' | 'settings') => void;
}

export default function DiaryView({ onNavigate }: DiaryViewProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [currentBlocks, setCurrentBlocks] = useState<Block[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

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
    // Session refreshen bei Aktivität
    refreshSession();
    
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
    
    // Prüfe Verschlüsselungsmodus
    const mode = await getEncryptionMode();
    let data: string;
    let encrypted = false;
    
    if (mode !== 'none') {
      // Verschlüsseln
      const password = getSessionPassword();
      if (!password) {
        alert('Session abgelaufen - bitte neu anmelden');
        setIsSaving(false);
        return;
      }
      
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

  const menuItems = [
    {
      label: 'Templates bearbeiten',
      icon: 'edit' as const,
      onClick: () => onNavigate('editor')
    },
    {
      label: 'Verlauf anzeigen',
      icon: 'history' as const,
      onClick: () => onNavigate('history')
    }
        ,
    {
      label: 'Einstellungen',
      icon: 'settings' as const,
      onClick: () => onNavigate('settings')
    }
  ];

  return (
    <div className="app-container diary-with-tabs">
      <Header 
        title={activeTemplate?.name} 
        showMenu={true}
        menuItems={menuItems}
      />

      <div className="content-wrapper content-with-padding">
        <div className="card space-y-6">
          {currentBlocks.map(block => (
            <BlockRenderer
              key={block.id}
              block={block}
              onChange={(value) => handleBlockChange(block.id, value)}
            />
          ))}

          <button onClick={handleSave} disabled={isSaving} className="btn btn-primary btn-full-width">
            {isSaving ? 'Speichere...' : 'Eintrag speichern'}
          </button>
        </div>
      </div>

      {showSuccess && (
        <div className="toast">
          ✓ Eintrag gespeichert
        </div>
      )}

      <div className="tab-bar">
        <div className="tab-bar-content">
          {templates.map((template, index) => (
            <button
              key={template.id}
              onClick={() => setActiveTabIndex(index)}
              className={`tab ${activeTabIndex === index ? 'tab-active' : 'tab-inactive'}`}
            >
              {template.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
