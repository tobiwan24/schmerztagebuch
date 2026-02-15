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
import { ArrowLeft, X, Plus, Trash2, Check, ArrowDownUp } from 'lucide-react';
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
  const [expandedBlockIds, setExpandedBlockIds] = useState<Set<string>>(new Set());
  const [isDndMode, setIsDndMode] = useState(false);

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

  // Click outside blocks deactivates DnD mode
  useEffect(() => {
    if (!isDndMode) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      // Check if click is outside block container
      if (!target.closest('.sortable-block') && !target.closest('.floating-btn-glass')) {
        setIsDndMode(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDndMode]);

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
      
      // For MultiSelect: Auto-expand collapsible container instead of modal
      if (block.type === 'multiselect') {
        handleToggleBlockExpanded(pendingEditBlockId);
        setPendingEditBlockId(null);
        return;
      }
      
      setEditingBlockId(pendingEditBlockId);
      setTempBlockLabel(block.label);
      
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
    
    // Slider/BodyMap/MultiSelect: Toggle collapsible container
    if (block.type === 'slider' || block.type === 'bodymap' || block.type === 'multiselect') {
      handleToggleBlockExpanded(blockId);
      return;
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

  function handleLabelChange(blockId: string, newLabel: string) {
    setEditingBlocks(editingBlocks.map(block =>
      block.id === blockId ? { ...block, label: newLabel } : block
    ));
  }

  function handleToggleBlockExpanded(blockId: string) {
    setExpandedBlockIds(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }

  function handleSliderSettingsChange(blockId: string, settings: { min?: number; max?: number; step?: number }) {
    setEditingBlocks(editingBlocks.map(block => {
      if (block.id === blockId && block.type === 'slider') {
        return { ...block, ...settings };
      }
      return block;
    }));
  }

  function handleBodyMapTypeChange(blockId: string, dashboardType: 'pain' | 'function') {
    setEditingBlocks(editingBlocks.map(block => {
      if (block.id === blockId && block.type === 'bodymap') {
        return {
          ...block,
          dashboard: {
            ...block.dashboard,
            enabled: true,
            type: dashboardType
          }
        };
      }
      return block;
    }));
  }

  // NEW: MultiSelect Buttons Handler
  function handleMultiSelectButtonsChange(blockId: string, buttons: { text: string; color: string }[]) {
    setEditingBlocks(editingBlocks.map(block => {
      if (block.id === blockId && block.type === 'multiselect') {
        return {
          ...block,
          multiSelectOptions: buttons
        };
      }
      return block;
    }));
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
        <button 
          className={`floating-btn-glass ${isDndMode ? 'dnd-mode-active' : ''}`}
          onClick={() => setIsDndMode(!isDndMode)}
          title={isDndMode ? "Sortier-Modus beenden" : "Sortier-Modus aktivieren"}
        >
          <ArrowDownUp size={20} />
        </button>
        
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
                          onLabelChange={handleLabelChange}
                          onToggleHideLabel={handleToggleHideLabel}
                          onToggleDashboard={handleToggleDashboard}
                          onConfigureDashboard={handleConfigureDashboard}
                          showAdvancedActions={showAdvancedActions}
                          isExpanded={expandedBlockIds.has(block.id)}
                          onSliderSettingsChange={handleSliderSettingsChange}
                          onBodyMapTypeChange={handleBodyMapTypeChange}
                          onMultiSelectButtonsChange={handleMultiSelectButtonsChange}
                          isDndMode={isDndMode}
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
