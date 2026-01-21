import { useState, useEffect } from 'react';
import Dexie, { type EntityTable } from 'dexie';
import EditorMode from './pages/EditorMode';

function HistoryView({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center space-x-2 text-gray-600 hover:text-gray-900">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>Zurück</span>
          </button>
          <h1 className="text-xl font-bold text-gray-900">Verlauf</h1>
          <div className="w-20"></div>
        </div>
      </div>
      <div className="max-w-4xl mx-auto p-4">
        <p className="text-gray-600">HistoryView wird als nächstes implementiert...</p>
      </div>
    </div>
  );
}

// ========== TYPES ==========

export type BlockType = 
  | 'text' 
  | 'checkbox' 
  | 'image' 
  | 'slider' 
  | 'date' 
  | 'multiselect' 
  | 'textarea' 
  | 'bodymap';

export interface Block {
  id: string;
  type: BlockType;
  label: string;
  value?: string | number | boolean | File | string[];
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
}

export interface Template {
  id?: number;
  name: string;
  order: number;
  tags?: string[];
  blocks: Block[];
}

export interface Entry {
  id?: number;
  templateId: number;
  timestamp: Date;
  encrypted: boolean;
  data: string;
  tags?: string[];
}

export interface Settings {
  key: string;
  value: string;
}

// ========== DATABASE ==========

const db = new Dexie('PainDiaryDB') as Dexie & {
  templates: EntityTable<Template, 'id'>;
  entries: EntityTable<Entry, 'id'>;
  settings: EntityTable<Settings, 'key'>;
};

db.version(5).stores({
  templates: '++id, name, order',
  entries: '++id, templateId, timestamp, encrypted, *tags',
  settings: 'key'
});

// Database Functions
async function initializeDB(): Promise<void> {
  const count = await db.templates.count();
  
  if (count === 0) {
    await db.templates.add({
      name: 'Tägliches Tagebuch',
      order: 0,
      blocks: [
        {
          id: crypto.randomUUID(),
          type: 'date',
          label: 'Datum',
          value: new Date().toISOString().split('T')[0]
        },
        {
          id: crypto.randomUUID(),
          type: 'slider',
          label: 'Schmerzstärke',
          value: 5,
          min: 0,
          max: 10,
          step: 1
        },
        {
          id: crypto.randomUUID(),
          type: 'textarea',
          label: 'Notizen',
          value: ''
        }
      ],
      tags: []
    });
  }
}

async function getSetting(key: string): Promise<string | undefined> {
  const setting = await db.settings.get(key);
  return setting?.value;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}

async function getAppSettings(): Promise<{
  encryptionMode: 'none' | 'history' | 'full';
  biometricEnabled: boolean;
  setupCompleted: boolean;
}> {
  const mode = await getSetting('encryptionMode');
  const biometric = await getSetting('biometricEnabled');
  const setup = await getSetting('setupCompleted');
  
  return {
    encryptionMode: (mode as 'none' | 'history' | 'full') || 'none',
    biometricEnabled: biometric === 'true',
    setupCompleted: setup === 'true'
  };
}

// ========== BLOCK COMPONENTS ==========

function TextBlock({ block, onChange, readOnly = false }: { block: Block; onChange: (value: string) => void; readOnly?: boolean }) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="space-y-2">
      <label className="form-label">{block.label}</label>
      <input
        type="text"
        value={(block.value as string) || ''}
        onChange={handleChange}
        readOnly={readOnly}
        className="form-input"
        disabled={readOnly}
      />
    </div>
  );
}

function CheckboxBlock({ block, onChange, readOnly = false }: { block: Block; onChange: (value: boolean) => void; readOnly?: boolean }) {
  const [checked, setChecked] = useState<boolean>((block.value as boolean) || false);

  useEffect(() => {
    setChecked((block.value as boolean) || false);
  }, [block.value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    setChecked(newValue);
    onChange(newValue);
  };

  return (
    <div className="checkbox-wrapper">
      <input
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        disabled={readOnly}
        className="checkbox"
      />
      <label className="form-label" style={{ marginBottom: 0 }}>{block.label}</label>
    </div>
  );
}

function SliderBlock({ block, onChange, readOnly = false }: { block: Block; onChange: (value: number) => void; readOnly?: boolean }) {
  const min = block.min ?? 0;
  const max = block.max ?? 10;
  const step = block.step ?? 1;
  const [value, setValue] = useState<number>((block.value as number) ?? min);

  useEffect(() => {
    setValue((block.value as number) ?? min);
  }, [block.value, min]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(e.target.value);
    setValue(newValue);
    onChange(newValue);
  };

  return (
    <div className="form-group">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <label className="form-label" style={{ marginBottom: 0 }}>{block.label}</label>
        <span style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#2563eb' }}>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        disabled={readOnly}
        className="slider"
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function TextAreaBlock({ block, onChange, readOnly = false }: { block: Block; onChange: (value: string) => void; readOnly?: boolean }) {
  const [value, setValue] = useState<string>((block.value as string) || '');

  useEffect(() => {
    setValue((block.value as string) || '');
  }, [block.value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onChange(newValue);
  };

  return (
    <div className="form-group">
      <label className="form-label">{block.label}</label>
      <textarea
        value={value}
        onChange={handleChange}
        readOnly={readOnly}
        rows={4}
        className="form-textarea"
        disabled={readOnly}
      />
    </div>
  );
}

function DatePickerBlock({ block, onChange, readOnly = false }: { block: Block; onChange: (value: string) => void; readOnly?: boolean }) {
  const [value, setValue] = useState<string>((block.value as string) || new Date().toISOString().split('T')[0]);

  useEffect(() => {
    setValue((block.value as string) || new Date().toISOString().split('T')[0]);
  }, [block.value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onChange(newValue);
  };

  return (
    <div className="form-group">
      <label className="form-label">{block.label}</label>
      <input
        type="date"
        value={value}
        onChange={handleChange}
        readOnly={readOnly}
        className="form-input"
        disabled={readOnly}
      />
    </div>
  );
}

function MultiSelectBlock({ block, onChange, readOnly = false }: { block: Block; onChange: (value: string[]) => void; readOnly?: boolean }) {
  const [selected, setSelected] = useState<string[]>((block.value as string[]) || []);

  useEffect(() => {
    setSelected((block.value as string[]) || []);
  }, [block.value]);

  const handleToggle = (option: string) => {
    if (readOnly) return;
    
    const newSelected = selected.includes(option)
      ? selected.filter(item => item !== option)
      : [...selected, option];
    
    setSelected(newSelected);
    onChange(newSelected);
  };

  const options = block.options || [];

  return (
    <div className="form-group">
      <label className="form-label">{block.label}</label>
      <div className="tag-container">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => handleToggle(option)}
            disabled={readOnly}
            className={`tag ${selected.includes(option) ? 'tag-selected' : 'tag-unselected'}`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function BlockRenderer({ block, onChange, readOnly = false }: { block: Block; onChange: (value: string | number | boolean | string[]) => void; readOnly?: boolean }) {
  switch (block.type) {
    case 'text':
      return <TextBlock block={block} onChange={onChange} readOnly={readOnly} />;
    case 'checkbox':
      return <CheckboxBlock block={block} onChange={onChange} readOnly={readOnly} />;
    case 'slider':
      return <SliderBlock block={block} onChange={onChange} readOnly={readOnly} />;
    case 'textarea':
      return <TextAreaBlock block={block} onChange={onChange} readOnly={readOnly} />;
    case 'date':
      return <DatePickerBlock block={block} onChange={onChange} readOnly={readOnly} />;
    case 'multiselect':
      return <MultiSelectBlock block={block} onChange={onChange} readOnly={readOnly} />;
    default:
      return (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">Unbekannter Block-Typ: {block.type}</p>
        </div>
      );
  }
}

// ========== COMPONENTS ==========

function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const handleComplete = async () => {
    await setSetting('setupCompleted', 'true');
    await setSetting('encryptionMode', 'none');
    await setSetting('biometricEnabled', 'false');
    onComplete();
  };

  return (
    <div className="app-container" style={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #eff6ff, #e0e7ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="card" style={{ maxWidth: '28rem', width: '100%' }}>
        <div className="text-center mb-6">
          <div style={{ width: '4rem', height: '4rem', background: '#2563eb', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <svg style={{ width: '2.5rem', height: '2.5rem', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.5rem' }}>Willkommen!</h1>
          <p className="text-gray-600">Ihr persönliches Schmerztagebuch</p>
        </div>

        <div className="space-y-4 mb-6">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <div style={{ width: '1.5rem', height: '1.5rem', background: '#d1fae5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '0.125rem' }}>
              <svg style={{ width: '1rem', height: '1rem', color: '#059669' }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 style={{ fontWeight: 600, color: '#111827' }}>Flexible Templates</h3>
              <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Erstellen Sie individuelle Tagebuch-Vorlagen</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <div style={{ width: '1.5rem', height: '1.5rem', background: '#d1fae5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '0.125rem' }}>
              <svg style={{ width: '1rem', height: '1rem', color: '#059669' }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 style={{ fontWeight: 600, color: '#111827' }}>Offline-fähig</h3>
              <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Alle Daten lokal gespeichert</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <div style={{ width: '1.5rem', height: '1.5rem', background: '#d1fae5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '0.125rem' }}>
              <svg style={{ width: '1rem', height: '1rem', color: '#059669' }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 style={{ fontWeight: 600, color: '#111827' }}>Datenschutz</h3>
              <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Optional: Verschlüsselung verfügbar</p>
            </div>
          </div>
        </div>

        <button onClick={handleComplete} className="btn btn-primary" style={{ width: '100%', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
          Los geht's
        </button>
        
        <p style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'center', marginTop: '1rem' }}>
          Ein Beispiel-Template wurde bereits für Sie erstellt
        </p>
      </div>
    </div>
  );
}

function DiaryView({ onNavigate }: { onNavigate: (view: 'editor' | 'history') => void }) {
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
      const data = JSON.stringify(currentBlocks);
      const tags: string[] = [];
      
      currentBlocks.forEach(block => {
        if (block.type === 'multiselect' && Array.isArray(block.value)) {
          tags.push(...block.value);
        }
      });
      
      await db.entries.add({
        templateId: templates[activeTabIndex].id!,
        timestamp: new Date(),
        encrypted: false,
        data,
        tags
      });
      
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
      
      // Reset zu Template-Defaults
      setCurrentBlocks(JSON.parse(JSON.stringify(templates[activeTabIndex].blocks)));
    } catch (error) {
      console.error('Fehler beim Speichern:', error);
    } finally {
      setIsSaving(false);
    }
  }

  if (templates.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Keine Templates gefunden</p>
        </div>
      </div>
    );
  }

  const activeTemplate = templates[activeTabIndex];

  return (
    <div className="app-container" style={{ paddingBottom: '5rem' }}>
      {/* Header */}
      <div className="header">
        <div className="header-content">
          <h1 className="header-title">{activeTemplate?.name}</h1>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowMenu(!showMenu)} className="btn-icon">
              <svg style={{ width: '1.5rem', height: '1.5rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
            
            {showMenu && (
              <div className="dropdown-menu">
                <button onClick={() => { setShowMenu(false); onNavigate('editor'); }} className="dropdown-item">
                  <svg style={{ width: '1.25rem', height: '1.25rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span>Templates bearbeiten</span>
                </button>
                <button onClick={() => { setShowMenu(false); onNavigate('history'); }} className="dropdown-item">
                  <svg style={{ width: '1.25rem', height: '1.25rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Verlauf anzeigen</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="content-wrapper" style={{ paddingTop: '1.5rem', paddingBottom: '1.5rem' }}>
        <div className="card space-y-6">
          {currentBlocks.map(block => (
            <BlockRenderer
              key={block.id}
              block={block}
              onChange={(value) => handleBlockChange(block.id, value)}
            />
          ))}

          <button onClick={handleSave} disabled={isSaving} className="btn btn-primary" style={{ width: '100%' }}>
            {isSaving ? 'Speichere...' : 'Eintrag speichern'}
          </button>
        </div>
      </div>

      {/* Success Toast */}
      {showSuccess && (
        <div className="toast">
          ✓ Eintrag gespeichert
        </div>
      )}

      {/* Tab Bar */}
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

// ========== MAIN APP ==========

export default function App() {
  const [currentView, setCurrentView] = useState<'setup' | 'diary' | 'editor' | 'history'>('setup');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initApp();
  }, []);

  async function initApp() {
    try {
      await initializeDB();
      const settings = await getAppSettings();
      
      if (settings.setupCompleted) {
        setCurrentView('diary');
      } else {
        setCurrentView('setup');
      }
    } catch (error) {
      console.error('Fehler beim Initialisieren:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const handleSetupComplete = () => {
    setCurrentView('diary');
  };

  const handleNavigate = (view: 'editor' | 'history') => {
    setCurrentView(view);
  };

  const handleBack = () => {
    setCurrentView('diary');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Wird geladen...</p>
        </div>
      </div>
    );
  }

  if (currentView === 'setup') {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  if (currentView === 'editor') {
    return <EditorMode onBack={handleBack} />;
  }

  if (currentView === 'history') {
    return <HistoryView onBack={handleBack} />;
  }

  return <DiaryView onNavigate={handleNavigate} />;
}