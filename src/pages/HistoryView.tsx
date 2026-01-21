import { useState, useEffect, useCallback } from 'react';
import { getEntries, getTemplates, deleteEntry } from '../db';
import { getSessionPassword } from '../utils/auth';
import { decryptData } from '../utils/crypto';
import { exportToPDF } from '../utils/pdfExport';
import type { Entry, Template } from '../types/database';
import type { Block } from '../types/blocks';
import Header from '../components/Header';
import BlockRenderer from '../components/BlockRenderer';

interface HistoryViewProps {
  onBack: () => void;
}

export default function HistoryView({ onBack }: HistoryViewProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filter States
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  
  // Detail Modal
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [decryptedBlocks, setDecryptedBlocks] = useState<Block[] | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  // loadData mit useCallback - verhindert unnötige Re-Renders
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Templates laden (für Filter-Dropdown)
      const allTemplates = await getTemplates();
      setTemplates(allTemplates);
      
      // Einträge laden
      let allEntries = await getEntries();
      
      // Filter anwenden
      if (selectedTemplateId) {
        allEntries = allEntries.filter(e => e.templateId === selectedTemplateId);
      }
      
      if (startDate) {
        const start = new Date(startDate);
        allEntries = allEntries.filter(e => new Date(e.timestamp) >= start);
      }
      
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        allEntries = allEntries.filter(e => new Date(e.timestamp) <= end);
      }
      
      setEntries(allEntries);
    } catch (error) {
      console.error('Fehler beim Laden:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedTemplateId, startDate, endDate]);

  // Laden beim Start UND wenn Filter ändern
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Wenn ein Eintrag ausgewählt wird, entschlüsseln
  useEffect(() => {
    async function decryptEntry() {
      if (!selectedEntry) {
        setDecryptedBlocks(null);
        setDecryptError(null);
        return;
      }
      
      setIsDecrypting(true);
      setDecryptError(null);
      
      try {
        let blocks: Block[];
        
        if (selectedEntry.encrypted) {
          const password = getSessionPassword();
          if (!password) {
            setDecryptError('Session abgelaufen - bitte neu anmelden');
            setIsDecrypting(false);
            return;
          }
          
          const decrypted = await decryptData(selectedEntry.data, password);
          blocks = JSON.parse(decrypted);
        } else {
          blocks = JSON.parse(selectedEntry.data);
        }
        
        setDecryptedBlocks(blocks);
      } catch (error) {
        console.error('Fehler beim Laden:', error);
        setDecryptError('Fehler beim Entschlüsseln der Daten');
      } finally {
        setIsDecrypting(false);
      }
    }
    
    decryptEntry();
  }, [selectedEntry]);

  async function handleDeleteEntry(entryId: number) {
    if (!confirm('Eintrag wirklich löschen?')) return;
    
    try {
      await deleteEntry(entryId);
      setSelectedEntry(null);
      loadData();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
    }
  }

  // Preset-Zeiträume Handler
  function handlePresetChange(preset: string) {
    setSelectedPreset(preset);
    const today = new Date();
    const end = today.toISOString().split('T')[0];
    
    let start: Date;
    
    switch (preset) {
      case '7days':
        start = new Date(today);
        start.setDate(today.getDate() - 7);
        break;
      case '30days':
        start = new Date(today);
        start.setDate(today.getDate() - 30);
        break;
      case 'thisMonth':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(lastMonthEnd.toISOString().split('T')[0]);
        return;
      case 'thisYear':
        start = new Date(today.getFullYear(), 0, 1);
        break;
      default:
        setStartDate('');
        setEndDate('');
        return;
    }
    
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end);
  }

  // PDF Export Handler
  async function handleExportPDF() {
    if (entries.length === 0) {
      alert('Keine Einträge zum Exportieren!');
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Alle Einträge entschlüsseln
      const decryptedData = new Map<number, Block[]>();
      const password = getSessionPassword();
      
      for (const entry of entries) {
        if (entry.id) {
          let blocks: Block[];
          
          if (entry.encrypted) {
            if (!password) {
              alert('Session abgelaufen - bitte neu anmelden');
              setIsLoading(false);
              return;
            }
            const decrypted = await decryptData(entry.data, password);
            blocks = JSON.parse(decrypted);
          } else {
            blocks = JSON.parse(entry.data);
          }
          
          decryptedData.set(entry.id, blocks);
        }
      }
      
      // PDF generieren
      await exportToPDF({
        entries,
        templates,
        decryptedData,
        startDate,
        endDate,
        selectedTemplate: selectedTemplateId 
          ? templates.find(t => t.id === selectedTemplateId)?.name 
          : undefined
      });
      
    } catch (error) {
      console.error('PDF Export Fehler:', error);
      alert('Fehler beim Exportieren: ' + (error instanceof Error ? error.message : 'Unbekannter Fehler'));
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="app-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="text-center">
          <div className="spinner"></div>
          <p className="text-gray-600" style={{ marginTop: '1rem' }}>Wird geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Header title="Verlauf" onBack={onBack} />
      
      <div className="content-wrapper">
        {/* FILTER BEREICH */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Filter</h3>
          
          <div className="space-y-4">
            {/* Template Filter */}
            <div className="form-group">
              <label className="form-label">Template</label>
              <select 
                className="form-input"
                value={selectedTemplateId || ''}
                onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Alle Templates</option>
                {templates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Preset-Zeiträume */}
            <div className="form-group">
              <label className="form-label">Zeitraum</label>
              <select 
                className="form-input"
                value={selectedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
              >
                <option value="">Benutzerdefiniert</option>
                <option value="7days">Letzte 7 Tage</option>
                <option value="30days">Letzte 30 Tage</option>
                <option value="thisMonth">Dieser Monat</option>
                <option value="lastMonth">Letzter Monat</option>
                <option value="thisYear">Dieses Jahr</option>
              </select>
            </div>
            
            {/* Datum Filter */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Von</label>
                <input
                  type="date"
                  className="form-input"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setSelectedPreset('');
                  }}
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">Bis</label>
                <input
                  type="date"
                  className="form-input"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setSelectedPreset('');
                  }}
                />
              </div>
            </div>
            
            {/* Filter zurücksetzen */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {(selectedTemplateId || startDate || endDate) && (
                <button 
                  onClick={() => {
                    setSelectedTemplateId(null);
                    setStartDate('');
                    setEndDate('');
                    setSelectedPreset('');
                  }}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  Filter zurücksetzen
                </button>
              )}
              
              {/* PDF Export Button */}
              <button 
                onClick={handleExportPDF}
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={entries.length === 0}
              >
                📄 PDF exportieren ({entries.length})
              </button>
            </div>
          </div>
        </div>

        {/* EINTRÄGE LISTE */}
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
            {entries.length} {entries.length === 1 ? 'Eintrag' : 'Einträge'}
          </h3>
          
          {entries.length === 0 ? (
            <div className="card text-center">
              <p className="text-gray-600">Keine Einträge gefunden</p>
            </div>
          ) : (
            <div className="space-y-4">
              {entries.map(entry => {
                const template = templates.find(t => t.id === entry.templateId);
                const date = new Date(entry.timestamp);
                
                return (
                  <div 
                    key={entry.id} 
                    className="card" 
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h4 style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {template?.name || 'Unbekanntes Template'}
                        </h4>
                        <p className="text-gray-600" style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                          {date.toLocaleDateString('de-DE', { 
                            weekday: 'short', 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                        
                        {entry.tags && entry.tags.length > 0 && (
                          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                            {entry.tags.slice(0, 3).map((tag, i) => (
                              <span key={i} style={{ 
                                fontSize: '0.75rem', 
                                padding: '0.125rem 0.5rem', 
                                backgroundColor: 'var(--color-secondary)', 
                                borderRadius: '9999px',
                                color: 'var(--color-text-secondary)'
                              }}>
                                {tag}
                              </span>
                            ))}
                            {entry.tags.length > 3 && (
                              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                +{entry.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <svg className="icon-md" style={{ color: 'var(--color-text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* DETAIL MODAL */}
        {selectedEntry && (
          <div className="modal-overlay" onClick={() => setSelectedEntry(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                    {templates.find(t => t.id === selectedEntry.templateId)?.name}
                  </h2>
                  <p className="text-gray-600" style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                    {new Date(selectedEntry.timestamp).toLocaleDateString('de-DE', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                <button onClick={() => setSelectedEntry(null)} className="btn-icon">
                  <svg className="icon-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="modal-body">
                {isDecrypting ? (
                  <div className="text-center">
                    <div className="spinner" style={{ margin: '0 auto' }}></div>
                    <p className="text-gray-600" style={{ marginTop: '1rem' }}>Entschlüssele...</p>
                  </div>
                ) : decryptError ? (
                  <p className="text-error">{decryptError}</p>
                ) : decryptedBlocks ? (
                  <div className="space-y-4">
                    {decryptedBlocks.map(block => (
                      <BlockRenderer
                        key={block.id}
                        block={block}
                        onChange={() => {}}
                        readOnly={true}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600">Keine Daten vorhanden</p>
                )}
              </div>

              <div className="modal-footer">
                <button onClick={() => setSelectedEntry(null)} className="btn btn-secondary">
                  Schließen
                </button>
                <button 
                  onClick={() => selectedEntry.id && handleDeleteEntry(selectedEntry.id)} 
                  className="btn btn-secondary"
                  style={{ color: 'var(--color-error)' }}
                >
                  🗑️ Löschen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
