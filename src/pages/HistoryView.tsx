import { useState, useEffect, useCallback } from 'react';
import { getEntries, getTemplates, deleteEntry } from '../db';
import { getSessionPassword } from '../utils/auth';
import { decryptData } from '../utils/crypto';
import { exportToPDF } from '../utils/pdfExport';
import type { Entry, Template } from '../types/database';
import type { Block } from '../types/blocks';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Trash2, ChevronRight, X, Download } from 'lucide-react';
import BlockRenderer from '../components/BlockRenderer';

interface HistoryViewProps {
  onBack: () => void;
}

export default function HistoryView({ onBack }: HistoryViewProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [decryptedBlocks, setDecryptedBlocks] = useState<Block[] | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const allTemplates = await getTemplates();
      setTemplates(allTemplates);
      
      let allEntries = await getEntries();
      
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

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  async function handleExportPDF() {
    if (entries.length === 0) {
      alert('Keine Einträge zum Exportieren!');
      return;
    }
    
    setIsLoading(true);
    
    try {
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground mt-4">Wird geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-4">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b p-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-2xl font-semibold">Verlauf</h1>
        </div>
      </div>
      
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Filter Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Template Filter */}
            <div className="space-y-2">
              <Label>Template</Label>
              <select 
                className="w-full h-10 px-3 rounded-md border border-input bg-background"
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
            <div className="space-y-2">
              <Label>Zeitraum</Label>
              <select 
                className="w-full h-10 px-3 rounded-md border border-input bg-background"
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Von</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setSelectedPreset('');
                  }}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Bis</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setSelectedPreset('');
                  }}
                />
              </div>
            </div>
            
            <Separator />
            
            {/* Action Buttons */}
            <div className="flex gap-2">
              {(selectedTemplateId || startDate || endDate) && (
                <Button 
                  variant="outline"
                  onClick={() => {
                    setSelectedTemplateId(null);
                    setStartDate('');
                    setEndDate('');
                    setSelectedPreset('');
                  }}
                  className="flex-1"
                >
                  Filter zurücksetzen
                </Button>
              )}
              
              <Button 
                onClick={handleExportPDF}
                disabled={entries.length === 0}
                className="flex-1"
              >
                <Download size={16} className="mr-2" />
                PDF ({entries.length})
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Entries List */}
        <div>
          <h3 className="text-lg font-semibold mb-4">
            {entries.length} {entries.length === 1 ? 'Eintrag' : 'Einträge'}
          </h3>
          
          {entries.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-muted-foreground">Keine Einträge gefunden</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {entries.map(entry => {
                const template = templates.find(t => t.id === entry.templateId);
                const date = new Date(entry.timestamp);
                
                return (
                  <Card 
                    key={entry.id} 
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-semibold">
                            {template?.name || 'Unbekanntes Template'}
                          </h4>
                          <p className="text-sm text-muted-foreground mt-1">
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
                            <div className="flex gap-1 flex-wrap mt-2">
                              {entry.tags.slice(0, 3).map((tag, i) => (
                                <span key={i} className="text-xs px-2 py-0.5 bg-secondary rounded-full text-secondary-foreground">
                                  {tag}
                                </span>
                              ))}
                              {entry.tags.length > 3 && (
                                <span className="text-xs text-muted-foreground">
                                  +{entry.tags.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        
                        <ChevronRight size={20} className="text-muted-foreground flex-shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail Modal */}
        {selectedEntry && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedEntry(null)}>
            <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <CardHeader className="border-b">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>
                      {templates.find(t => t.id === selectedEntry.templateId)?.name}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {new Date(selectedEntry.timestamp).toLocaleDateString('de-DE', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedEntry(null)}>
                    <X size={20} />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="flex-1 overflow-y-auto p-6">
                {isDecrypting ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
                    <p className="text-muted-foreground mt-4">Entschlüssele...</p>
                  </div>
                ) : decryptError ? (
                  <p className="text-destructive">{decryptError}</p>
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
                  <p className="text-muted-foreground">Keine Daten vorhanden</p>
                )}
              </CardContent>

              <div className="border-t p-4 flex justify-between gap-2">
                <Button variant="outline" onClick={() => setSelectedEntry(null)}>
                  Schließen
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => selectedEntry.id && handleDeleteEntry(selectedEntry.id)}
                >
                  <Trash2 size={16} className="mr-2" />
                  Löschen
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
