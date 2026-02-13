import { useState, useEffect } from 'react';
import { getTemplates, updateTemplate, createTemplate, deleteTemplate } from '../db';
import { generateUUID } from '../utils/uuid';
import type { Template } from '../types/database';
import type { Block, BlockType, BlockValue } from '../types/blocks';
import BlockPalette from '../components/BlockPalette';
import SortableBlock from '../components/SortableBlock';
import TemplateStylePicker from '../components/TemplateStylePicker';
import { DashboardConfigModal, type DashboardConfigState } from '../components/dashboard';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, X, Plus, Trash2, Check } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  TouchSensor
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';

interface EditorModeProps {
  onBack: (templateId?: number) => void;
  initialTemplateId?: number;
}

export default function EditorMode({ onBack, initialTemplateId }: EditorModeProps) {
  // State
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [editingBlocks, setEditingBlocks] = useState<Block[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalTemplate, setOriginalTemplate] = useState<Template | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [tempBlockLabel, setTempBlockLabel] = useState('');
  const [multiSelectButtons, setMultiSelectButtons] = useState<{text: string; color: string}[]>([]);
  const [newButtonText, setNewButtonText] = useState('');
  const [newButtonColor, setNewButtonColor] = useState('#007AFF');
  
  // Vordefinierte Farbpalette für Multiselect-Buttons
  const PRESET_COLORS = [
    '#007AFF', // iOS Blau
    '#34C759', // Grün
    '#FF9500', // Orange
    '#FF3B30', // Rot
    '#AF52DE', // Lila
    '#FF2D55', // Pink
    '#5856D6', // Indigo
    '#32ADE6', // Hellblau
    '#FFD60A', // Gelb
    '#8E8E93', // Grau
  ];
  
  const [showAddBlockPopup, setShowAddBlockPopup] = useState(false);
  const [pendingBlockType, setPendingBlockType] = useState<BlockType | null>(null);
  const [newBlockLabel, setNewBlockLabel] = useState('');
  const [pendingEditBlockId, setPendingEditBlockId] = useState<string | null>(null);
  const [configuringDashboard, setConfiguringDashboard] = useState<string | null>(null);
  const [showBlockPalette, setShowBlockPalette] = useState(false);
  const [showAdvancedActions, setShowAdvancedActions] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, []);

  // Load initial template if provided
  useEffect(() => {
    if (initialTemplateId && templates.length > 0) {
      const template = templates.find(t => t.id === initialTemplateId);
      if (template) {
        setSelectedTemplate(template);
      }
    }
  }, [initialTemplateId, templates]);

  // Update editing blocks when template changes
  useEffect(() => {
    if (selectedTemplate && selectedTemplate.id !== originalTemplate?.id) {
      setEditingBlocks([...selectedTemplate.blocks]);
      setOriginalTemplate(JSON.parse(JSON.stringify(selectedTemplate)));
      setHasUnsavedChanges(false);
    }
  }, [selectedTemplate, originalTemplate]);

  // Detect unsaved changes
  useEffect(() => {
    if (!selectedTemplate || !originalTemplate) return;
    
    const templateChanged = 
      selectedTemplate.name !== originalTemplate.name ||
      selectedTemplate.icon !== originalTemplate.icon ||
      selectedTemplate.color !== originalTemplate.color;
    
    const blocksChanged = JSON.stringify(editingBlocks) !== JSON.stringify(originalTemplate.blocks);
    
    setHasUnsavedChanges(templateChanged || blocksChanged);
  }, [selectedTemplate, editingBlocks, originalTemplate]);
  
  // Open edit modal after block creation
  useEffect(() => {
    if (pendingEditBlockId && editingBlocks.find(b => b.id === pendingEditBlockId)) {
      const block = editingBlocks.find(b => b.id === pendingEditBlockId);
      if (!block) return;
      
      setEditingBlockId(pendingEditBlockId);
      setTempBlockLabel(block.label);
      
      if (block.type === 'multiselect') {
        setMultiSelectButtons(block.multiSelectOptions ? [...block.multiSelectOptions] : []);
        setNewButtonText('');
        setNewButtonColor('#007AFF');
      }
      
      setPendingEditBlockId(null);
    }
  }, [pendingEditBlockId, editingBlocks]);

  async function loadTemplates() {
    try {
      const allTemplates = await getTemplates();
      setTemplates(allTemplates);
    } catch (error) {
      console.error('Fehler beim Laden der Templates:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function handleAddBlock(type: BlockType) {
    // Palette schließen
    setShowBlockPalette(false);
    
    if (type === 'multiselect') {
      const newBlock: Block = {
        id: generateUUID(),
        type: type,
        label: 'Neue Auswahl',
        hideLabelInDiary: false,
        value: undefined,
        multiSelectOptions: []
      };
      
      setEditingBlocks([...editingBlocks, newBlock]);
      setPendingEditBlockId(newBlock.id);
      return;
    }
    
    setPendingBlockType(type);
    setNewBlockLabel('');
    setShowAddBlockPopup(true);
  }
  
  function handleConfirmAddBlock() {
    if (!pendingBlockType || !newBlockLabel.trim()) {
      alert('Bitte eine Überschrift eingeben!');
      return;
    }
    
    const newBlock: Block = {
      id: generateUUID(),
      type: pendingBlockType,
      label: newBlockLabel.trim(),
      hideLabelInDiary: false,
      value: undefined
    };
    
    if (pendingBlockType === 'slider') {
      newBlock.min = 0;
      newBlock.max = 10;
      newBlock.step = 1;
      newBlock.dashboard = {
        enabled: true,
        type: 'pain'
      };
    }
    
    setEditingBlocks([...editingBlocks, newBlock]);
    setShowAddBlockPopup(false);
    setPendingBlockType(null);
    setNewBlockLabel('');
  }
  
  function handleCancelAddBlock() {
    setShowAddBlockPopup(false);
    setPendingBlockType(null);
    setNewBlockLabel('');
  }

  function handleDeleteBlock(blockId: string) {
    setEditingBlocks(editingBlocks.filter(b => b.id !== blockId));
  }

  function handleBlockChange(_blockId: string, _value: BlockValue) {
    // Editor ändert nur Struktur, nicht Werte
  }

  function handleIconChange(icon: string) {
    if (!selectedTemplate) return;
    const updated = { ...selectedTemplate, icon };
    setSelectedTemplate(updated);
    setTemplates(templates.map(t => t.id === selectedTemplate.id ? updated : t));
  }

  async function handleSave() {
    if (!selectedTemplate?.id) return;
    
    await updateTemplate(selectedTemplate.id, {
      name: selectedTemplate.name,
      blocks: editingBlocks,
      icon: selectedTemplate.icon || 'book',
      color: selectedTemplate.color || ''
    });
    
    // Templates neu laden und zur DiaryView mit aktuellem Template
    await loadTemplates();
    onBack(selectedTemplate.id);
  }

  async function handleCreateTemplate() {
    const name = prompt('Name des neuen Templates:');
    if (!name) return;
    
    // Prüfe ob Name bereits existiert
    const nameExists = templates.some(t => t.name.toLowerCase() === name.toLowerCase());
    if (nameExists) {
      alert(`⚠️ Ein Template mit dem Namen "${name}" existiert bereits!\n\nBitte wähle einen anderen Namen.`);
      return;
    }
    
    try {
      const newTemplateId = await createTemplate(name, []);
      await loadTemplates();
      
      // Direkt zum neuen Template wechseln
      const allTemplates = await getTemplates();
      const created = allTemplates.find(t => t.id === newTemplateId);
      if (created) {
        setSelectedTemplate(created);
      }
    } catch (error) {
      console.error('Fehler beim Erstellen:', error);
    }
  }

  async function handleDeleteCurrentTemplate() {
    if (!selectedTemplate?.id) return;
    
    const confirmed = window.confirm(
      `⚠️ Template "${selectedTemplate.name}" wirklich löschen?\n\nAlle zugehörigen Einträge bleiben erhalten, können aber nicht mehr diesem Template zugeordnet werden.`
    );
    
    if (!confirmed) return;
    
    try {
      await deleteTemplate(selectedTemplate.id);
      setSelectedTemplate(null);
      await loadTemplates();
      onBack(); // Zurück zum Tagebuch
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen des Templates');
    }
  }

  function handleBackToDiary() {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        '⚠️ Du hast ungespeicherte Änderungen!\n\nMöchtest du wirklich zurück zum Tagebuch? Alle Änderungen gehen verloren.'
      );
      if (!confirmed) return;
    }
    onBack();
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setEditingBlocks((blocks) => {
        const oldIndex = blocks.findIndex((b) => b.id === active.id);
        const newIndex = blocks.findIndex((b) => b.id === over.id);
        return arrayMove(blocks, oldIndex, newIndex);
      });
    }
  }

  function handleToggleHideLabel(blockId: string) {
    setEditingBlocks(editingBlocks.map(block =>
      block.id === blockId ? { ...block, hideLabelInDiary: !block.hideLabelInDiary } : block
    ));
  }

  function handleToggleDashboard(blockId: string) {
    setEditingBlocks(editingBlocks.map(block => {
      if (block.id === blockId) {
        const currentEnabled = block.dashboard?.enabled || false;
        
        if (currentEnabled) {
          const { dashboard, ...rest } = block;
          return rest;
        } else {
          return {
            ...block,
            dashboard: { enabled: true }
          };
        }
      }
      return block;
    }));
  }

  function handleConfigureDashboard(blockId: string) {
    setConfiguringDashboard(blockId);
  }

  function handleSaveDashboardConfig(config: DashboardConfigState) {
    if (!configuringDashboard) return;
    
    setEditingBlocks(editingBlocks.map(b => {
      if (b.id === configuringDashboard) {
        return { 
          ...b, 
          dashboard: { 
            enabled: true, 
            ...config 
          } 
        };
      }
      return b;
    }));
    
    setConfiguringDashboard(null);
  }

  function handleCancelDashboardConfig() {
    setConfiguringDashboard(null);
  }

  function handleEditBlockOptions(blockId: string) {
    const block = editingBlocks.find(b => b.id === blockId);
    if (!block) return;
    
    setEditingBlockId(blockId);
    setTempBlockLabel(block.label);
    
    if (block.type === 'multiselect') {
      setMultiSelectButtons(block.multiSelectOptions ? [...block.multiSelectOptions] : []);
      setNewButtonText('');
      setNewButtonColor('#007AFF');
    }
  }

  function handleAddButton() {
    if (!newButtonText.trim()) return;
    
    setMultiSelectButtons([...multiSelectButtons, {
      text: newButtonText.trim(),
      color: newButtonColor
    }]);
    setNewButtonText('');
    setNewButtonColor('#007AFF');
  }

  function handleRemoveButton(index: number) {
    setMultiSelectButtons(multiSelectButtons.filter((_, i) => i !== index));
  }

  function handleUpdateButtonColor(index: number, color: string) {
    const updated = [...multiSelectButtons];
    updated[index].color = color;
    setMultiSelectButtons(updated);
  }

  function handleSaveBlockOptions() {
    if (!editingBlockId) return;
    
    const block = editingBlocks.find(b => b.id === editingBlockId);
    if (!block) return;
    
    setEditingBlocks(editingBlocks.map(b => {
      if (b.id === editingBlockId) {
        const updated = { ...b, label: tempBlockLabel };
        
        if (block.type === 'multiselect') {
          updated.multiSelectOptions = multiSelectButtons;
        }
        
        return updated;
      }
      return b;
    }));
    
    setEditingBlockId(null);
    setMultiSelectButtons([]);
    setNewButtonText('');
    setNewButtonColor('#007AFF');
    setTempBlockLabel('');
  }

  function handleCancelBlockOptions() {
    setEditingBlockId(null);
    setMultiSelectButtons([]);
    setNewButtonText('');
    setNewButtonColor('#007AFF');
    setTempBlockLabel('');
  }

  function handleToggleAllDashboard() {
    const dashboardCapableBlocks = editingBlocks.filter(b => 
      ['slider', 'bodymap', 'textarea', 'multiselect'].includes(b.type)
    );
    
    const allEnabled = dashboardCapableBlocks.every(b => b.dashboard?.enabled);
    
    setEditingBlocks(editingBlocks.map(block => {
      if (!['slider', 'bodymap', 'textarea', 'multiselect'].includes(block.type)) {
        return block;
      }
      
      if (allEnabled) {
        // Alle deaktivieren
        const { dashboard, ...rest } = block;
        return rest;
      } else {
        // Alle aktivieren
        return {
          ...block,
          dashboard: { enabled: true }
        };
      }
    }));
  }

  function handleToggleAllLabels() {
    const allHidden = editingBlocks.every(b => b.hideLabelInDiary);
    
    setEditingBlocks(editingBlocks.map(block => ({
      ...block,
      hideLabelInDiary: !allHidden
    })));
  }

  function handleToggleAdvancedActions() {
    setShowAdvancedActions(!showAdvancedActions);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="spinner"></div>
          <p className="text-muted-foreground">Templates werden geladen...</p>
        </div>
      </div>
    );
  }

  // Main view - IMMER Template Editor (keine Liste mehr)
  return (
    <div className="flex flex-col h-screen">
      {/* Floating action buttons */}
      <div className="floating-buttons-container">
        <button className="floating-btn-glass" onClick={handleCreateTemplate}>
          <Plus size={20} />
        </button>
        
        <button
          className="floating-btn-glass"
          onClick={handleDeleteCurrentTemplate}
          disabled={!selectedTemplate}
        >
          <Trash2 size={20} />
        </button>
        
        {hasUnsavedChanges && (
          <button
            className="floating-btn-glass save-btn floating-btn-enter animate-pulse-glow-green"
            onClick={handleSave}
          >
            <Check size={20} />
          </button>
        )}
      </div>

      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center justify-between">
          <button className="floating-btn-glass" onClick={handleBackToDiary}>
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-base font-semibold">Template bearbeiten</h1>
          <div className="w-10" />
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-28 px-5" style={{ paddingTop: 'calc(3.5rem + 1rem)' }}>
        <div className="max-w-2xl mx-auto space-y-4">
          {selectedTemplate ? (
            <>
              {/* Unsaved changes warning */}
              {hasUnsavedChanges && (
                <Card className="p-3 bg-yellow-50 border-yellow-200">
                  <p className="text-sm text-yellow-800">
                    ⚠️ Du hast ungespeicherte Änderungen
                  </p>
                </Card>
              )}

              {/* Template Style Picker */}
              <TemplateStylePicker
                templateName={selectedTemplate.name}
                onNameChange={(newName) => {
                  if (!selectedTemplate) return;
                  const updated = { ...selectedTemplate, name: newName };
                  setSelectedTemplate(updated);
                  setTemplates(templates.map(t => t.id === selectedTemplate.id ? updated : t));
                }}
                currentIcon={selectedTemplate.icon || 'book'}
                currentColor={selectedTemplate.color || ''}
                onIconChange={handleIconChange}
                blocks={editingBlocks}
                onToggleAllDashboard={handleToggleAllDashboard}
                onToggleAllLabels={handleToggleAllLabels}
                showAdvancedActions={showAdvancedActions}
                onToggleAdvancedActions={handleToggleAdvancedActions}
              />

              {/* Add Block Button */}
              <div className="add-block-button-container">
                <Button
                  onClick={() => setShowBlockPalette(true)}
                  variant="outline"
                  size="sm"
                  className="btn-touch-target add-block-button"
                >
                  <Plus size={16} className="mr-1" />
                  Baustein hinzufügen
                </Button>
              </div>

              {/* Blocks List */}
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={editingBlocks.map(b => b.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-4">
                    {editingBlocks.length === 0 ? (
                      <Card className="p-8 text-center">
                        <p className="text-muted-foreground">
                          Noch keine Blöcke. Wähle einen aus der Palette oben.
                        </p>
                      </Card>
                    ) : (
                      editingBlocks.map((block) => (
                        <SortableBlock
                          key={block.id}
                          block={block}
                          onEdit={() => handleEditBlockOptions(block.id)}
                          onDelete={() => handleDeleteBlock(block.id)}
                          onChange={(value) => handleBlockChange(block.id, value)}
                          onToggleHideLabel={handleToggleHideLabel}
                          onToggleDashboard={handleToggleDashboard}
                          onConfigureDashboard={handleConfigureDashboard}
                          showAdvancedActions={showAdvancedActions}
                        />
                      ))
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            </>
          ) : null}
        </div>
      </div>

      {/* Block Palette Modal */}
      {showBlockPalette && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowBlockPalette(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold">Baustein wählen</h3>
              <Button onClick={() => setShowBlockPalette(false)} variant="ghost" size="icon" className="btn-touch-target">
                <X size={18} />
              </Button>
            </div>

            <div className="p-4">
              <BlockPalette onAddBlock={handleAddBlock} />
            </div>
          </Card>
        </div>
      )}

      {/* Add Block Popup */}
      {showAddBlockPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={handleCancelAddBlock}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold">Block hinzufügen</h3>
              <Button onClick={handleCancelAddBlock} variant="ghost" size="icon" className="btn-touch-target">
                <X size={18} />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <Label>Überschrift des Blocks</Label>
                <Input
                  value={newBlockLabel}
                  onChange={(e) => setNewBlockLabel(e.target.value)}
                  placeholder="z.B. Schmerzstärke, Medikamente, ..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirmAddBlock();
                    }
                  }}
                />
              </div>
            </div>

            <div className="p-4 border-t flex justify-end gap-2">
              <Button onClick={handleCancelAddBlock} variant="outline">
                Abbrechen
              </Button>
              <Button onClick={handleConfirmAddBlock}>
                Hinzufügen
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Block Options Modal */}
      {editingBlockId && (() => {
        const block = editingBlocks.find(b => b.id === editingBlockId);
        if (!block) return null;
        
        return (
          <div 
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto" 
            onClick={handleCancelBlockOptions}
            onTouchMove={(e) => {
              if (e.target === e.currentTarget) {
                e.preventDefault();
              }
            }}
          >
            <Card className="w-full max-w-lg max-h-[90vh] flex flex-col my-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b flex justify-between items-center flex-shrink-0">
                <h3 className="text-lg font-semibold">Block bearbeiten</h3>
                <Button onClick={handleCancelBlockOptions} variant="ghost" size="icon" className="btn-touch-target">
                  <X size={18} />
                </Button>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                <div className="space-y-2">
                  <Label>Block-Überschrift</Label>
                  <Input
                    value={tempBlockLabel}
                    onChange={(e) => setTempBlockLabel(e.target.value)}
                    placeholder="Überschrift eingeben..."
                    autoFocus
                  />
                </div>
                
                {block.type === 'multiselect' && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Erstelle Buttons mit Text und Farbe.
                    </p>
                    
                    <Card className="p-4 bg-secondary/30">
                      <div className="space-y-3">
                        <Input
                          value={newButtonText}
                          onChange={(e) => setNewButtonText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddButton();
                            }
                          }}
                          placeholder="Button-Text eingeben"
                        />
                        <div className="space-y-2">
                          <Label>Farbe wählen:</Label>
                          <div className="grid grid-cols-5 gap-2">
                            {PRESET_COLORS.map((color) => (
                              <button
                                key={color}
                                type="button"
                                onClick={() => setNewButtonColor(color)}
                                className="w-full aspect-square rounded-lg border-2 transition-all"
                                style={{
                                  backgroundColor: color,
                                  borderColor: newButtonColor === color ? '#000' : 'transparent',
                                  transform: newButtonColor === color ? 'scale(1.1)' : 'scale(1)',
                                }}
                                title={color}
                              />
                            ))}
                          </div>
                          <Button onClick={handleAddButton} className="w-full">
                            <Plus size={16} className="mr-2" />
                            Button hinzufügen
                          </Button>
                        </div>
                      </div>
                    </Card>
                    
                    {multiSelectButtons.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold">
                          Buttons ({multiSelectButtons.length}):
                        </p>
                        {multiSelectButtons.map((btn, idx) => (
                          <Card key={idx} className="p-3">
                            <div className="flex items-center gap-3">
                              <span className="flex-1 font-medium">{btn.text}</span>
                              <div className="flex items-center gap-2">
                                <div className="relative">
                                  <select
                                    value={btn.color}
                                    onChange={(e) => handleUpdateButtonColor(idx, e.target.value)}
                                    className="appearance-none w-20 h-8 rounded cursor-pointer border-2"
                                    style={{
                                      backgroundColor: btn.color,
                                      color: 'transparent',
                                    }}
                                  >
                                    {PRESET_COLORS.map((color) => (
                                      <option key={color} value={color}>
                                        {color}
                                      </option>
                                    ))}
                                  </select>
                                  <div 
                                    className="absolute inset-0 pointer-events-none flex items-center justify-center"
                                  >
                                    <div className="w-4 h-4 border-2 border-white rounded-full shadow-sm" 
                                         style={{ backgroundColor: btn.color }} 
                                    />
                                  </div>
                                </div>
                                <div
                                  className="px-4 py-2 rounded-lg font-medium text-sm"
                                  style={{ 
                                    backgroundColor: btn.color,
                                    color: '#fff'
                                  }}
                                >
                                  {btn.text}
                                </div>
                              </div>
                              <Button
                                onClick={() => handleRemoveButton(idx)}
                                variant="ghost"
                                size="icon"
                                className="btn-touch-target"
                              >
                                <Trash2 size={16} className="text-destructive" />
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                    
                    {multiSelectButtons.length === 0 && (
                      <Card className="p-8 text-center bg-secondary/20">
                        <p className="text-sm text-muted-foreground">
                          Noch keine Buttons. Füge oben Buttons hinzu.
                        </p>
                      </Card>
                    )}
                  </div>
                )}
              </div>

              <div className="p-4 border-t flex justify-end gap-2 flex-shrink-0">
                <Button onClick={handleCancelBlockOptions} variant="outline">
                  Abbrechen
                </Button>
                <Button onClick={handleSaveBlockOptions}>
                  Speichern
                </Button>
              </div>
            </Card>
          </div>
        );
      })()}

      {/* Dashboard Configuration Modal */}
      {configuringDashboard && (() => {
        const block = editingBlocks.find(b => b.id === configuringDashboard);
        if (!block) return null;
        
        return (
          <DashboardConfigModal
            block={block}
            onSave={handleSaveDashboardConfig}
            onCancel={handleCancelDashboardConfig}
          />
        );
      })()}
    </div>
  );
}
