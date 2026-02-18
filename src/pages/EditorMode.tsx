import { useState, useEffect } from 'react';
import { getTemplates, updateTemplate, createTemplate, deleteTemplate } from '../db';
import { generateUUID } from '../utils/uuid';
import type { Template } from '../types/database';
import type { Block, BlockType, BlockValue } from '../types/blocks';
import BlockPalette from '../components/BlockPalette';
import SortableBlock from '../components/SortableBlock';
import TemplateStylePicker from '../components/TemplateStylePicker';

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Check, ArrowDownUp, ChevronRight } from 'lucide-react';
import { TEMPLATE_CATALOG } from '../data/templateCatalog';
import { getIconComponent } from '../utils/iconUtils';
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
  // Dialog State - vereinheitlicht
  type DialogState =
    | { type: 'none' }
    | { type: 'block-palette' }
    | { type: 'delete-template' }
    | { type: 'unsaved-changes' }
    | { type: 'create-template'; name: string }
    | { type: 'template-catalog'; name: string };

  const [dialog, setDialog] = useState<DialogState>({ type: 'none' });
  const [createTemplateName, setCreateTemplateName] = useState('');
  const [createTemplateError, setCreateTemplateError] = useState('');

  // Block states
  const [newBlockId, setNewBlockId] = useState<string | null>(null);
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
  
  // Scroll to new block after it's rendered
  useEffect(() => {
    if (!newBlockId) return;
    const el = document.getElementById(`block-${newBlockId}`);
    if (el) {
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
  }, [newBlockId, editingBlocks]);

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
    setDialog({ type: 'none' });

    const defaultLabels: Record<BlockType, string> = {
      slider: 'Neuer Schieberegler',
      textarea: 'Neues Textfeld',
      date: 'Datum',
      multiselect: 'Neue Auswahl',
      bodymap: 'Neue Körperkarte',
      image: 'Neues Bild',
      checkbox: 'Neue Checkbox',
      text: 'Neuer Text',
    };

    const newBlock: Block = {
      id: generateUUID(),
      type,
      label: defaultLabels[type] ?? 'Neuer Block',
      hideLabelInDiary: false,
      value: undefined,
      ...(type === 'multiselect' && { multiSelectOptions: [] }),
      ...(type === 'slider' && { min: 0, max: 10, step: 1, dashboard: { enabled: true, type: 'pain' } }),
    };

    setEditingBlocks(prev => [...prev, newBlock]);
    setExpandedBlockIds(prev => new Set(prev).add(newBlock.id));
    setNewBlockId(newBlock.id);
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
    setCreateTemplateName('');
    setCreateTemplateError('');
    setDialog({ type: 'create-template', name: '' });
  }

  async function handleConfirmCreateTemplate() {
    const name = createTemplateName.trim();
    if (!name) {
      setCreateTemplateError('Bitte einen Namen eingeben.');
      return;
    }
    const nameExists = templates.some(t => t.name.toLowerCase() === name.toLowerCase());
    if (nameExists) {
      setCreateTemplateError(`Ein Template mit dem Namen "${name}" existiert bereits.`);
      return;
    }
    // Weiter zum Vorlagen-Katalog-Schritt
    setDialog({ type: 'template-catalog', name });
  }

  async function handleSelectCatalogEntry(catalogId: string | null) {
    const name = dialog.type === 'template-catalog' ? dialog.name : '';
    if (!name) return;

    let blocks: Block[] = [];

    if (catalogId === null) {
      // Leer starten: nur Datum (Pflicht) + Notizen (optional)
      blocks = [
        {
          id: generateUUID(),
          type: 'date',
          label: 'Datum',
          hideLabelInDiary: false,
          isDeletable: false,
          value: undefined,
        },
        {
          id: generateUUID(),
          type: 'textarea',
          label: 'Notizen',
          hideLabelInDiary: false,
          isDeletable: true,
          value: undefined,
        },
      ];
    } else {
      const entry = TEMPLATE_CATALOG.find(e => e.id === catalogId);
      blocks = entry ? entry.createBlocks() : [];
    }

    try {
      const newTemplateId = await createTemplate(name, blocks);
      setDialog({ type: 'none' });
      await loadTemplates();
      const allTemplates = await getTemplates();
      const created = allTemplates.find(t => t.id === newTemplateId);
      if (created) setSelectedTemplate(created);
    } catch (error) {
      console.error('Fehler beim Erstellen:', error);
    }
  }

  async function handleDeleteCurrentTemplate() {
    if (!selectedTemplate?.id) return;
    setDialog({ type: 'delete-template' });
  }

  async function handleConfirmDeleteTemplate() {
    if (!selectedTemplate?.id) return;
    try {
      await deleteTemplate(selectedTemplate.id);
      setDialog({ type: 'none' });
      setSelectedTemplate(null);
      await loadTemplates();
      onBack();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
    }
  }

  function handleBackToDiary() {
    if (hasUnsavedChanges) {
      setDialog({ type: 'unsaved-changes' });
      return;
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

  function handleEditBlockOptions(blockId: string) {
    handleToggleBlockExpanded(blockId);
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
    // Highlight entfernen sobald User das Label bearbeitet
    if (blockId === newBlockId && newLabel.trim()) {
      setNewBlockId(null);
    }
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

  // BodyMap Config Handler
  function handleBlockConfigChange(blockId: string, config: { defaultPresetId?: string }) {
    setEditingBlocks(editingBlocks.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          bodyMapConfig: {
            ...block.bodyMapConfig,
            ...config
          }
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
        
        <button
          className={`floating-btn-glass ${hasUnsavedChanges ? 'save-btn animate-pulse-glow-green' : ''}`}
          onClick={handleSave}
          disabled={!hasUnsavedChanges}
        >
          <Check size={20} />
        </button>
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
                  onClick={() => setDialog({ type: 'block-palette' })}
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
                        <div id={`block-${block.id}`} key={block.id}>
                        <SortableBlock
                          block={block}
                          onEdit={() => handleEditBlockOptions(block.id)}
                          onDelete={() => handleDeleteBlock(block.id)}
                          onChange={(value) => handleBlockChange(block.id, value)}
                          onLabelChange={handleLabelChange}
                          onToggleHideLabel={handleToggleHideLabel}
                          onToggleDashboard={handleToggleDashboard}
                          showAdvancedActions={showAdvancedActions}
                          isExpanded={expandedBlockIds.has(block.id)}
                          onSliderSettingsChange={handleSliderSettingsChange}
                          onBodyMapTypeChange={handleBodyMapTypeChange}
                          onMultiSelectButtonsChange={handleMultiSelectButtonsChange}
                          onConfigChange={handleBlockConfigChange}
                          isDndMode={isDndMode}
                          isNew={block.id === newBlockId}
                          isDeletable={block.isDeletable !== false}
                        />
                        </div>
                      ))
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            </>
          ) : null}
        </div>
      </div>

      {/* Dialog: Block Palette */}
      <Dialog open={dialog.type === 'block-palette'} onOpenChange={(open) => !open && setDialog({ type: 'none' })}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Baustein wählen</DialogTitle>
          </DialogHeader>
          <BlockPalette onAddBlock={handleAddBlock} />
        </DialogContent>
      </Dialog>

      {/* Dialog: Template erstellen */}
      <Dialog open={dialog.type === 'create-template'} onOpenChange={(open) => !open && setDialog({ type: 'none' })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Neues Template</DialogTitle>
            <DialogDescription>Gib einen Namen für das neue Template ein.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Name</Label>
            <Input
              value={createTemplateName}
              onChange={(e) => { setCreateTemplateName(e.target.value); setCreateTemplateError(''); }}
              placeholder="z.B. Kopfschmerz-Tagebuch"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirmCreateTemplate(); } }}
            />
            {createTemplateError && (
              <p className="text-sm text-destructive">{createTemplateError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ type: 'none' })}>Abbrechen</Button>
            <Button onClick={handleConfirmCreateTemplate}>Erstellen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Template löschen */}
      <Dialog open={dialog.type === 'delete-template'} onOpenChange={(open) => !open && setDialog({ type: 'none' })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Template löschen?</DialogTitle>
            <DialogDescription>
              Möchtest du <strong>{selectedTemplate?.name}</strong> wirklich löschen? Alle zugehörigen Einträge bleiben erhalten.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ type: 'none' })}>Abbrechen</Button>
            <Button variant="destructive" onClick={handleConfirmDeleteTemplate}>Löschen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Ungespeicherte Änderungen */}
      <Dialog open={dialog.type === 'unsaved-changes'} onOpenChange={(open) => !open && setDialog({ type: 'none' })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ungespeicherte Änderungen</DialogTitle>
            <DialogDescription>
              Du hast ungespeicherte Änderungen. Wenn du zurückgehst, gehen alle Änderungen verloren.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ type: 'none' })}>Zurück zum Editor</Button>
            <Button variant="destructive" onClick={() => { setDialog({ type: 'none' }); onBack(); }}>Ohne Speichern verlassen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Vorlagen-Katalog (Schritt 2 nach Name-Eingabe) */}
      <Dialog open={dialog.type === 'template-catalog'} onOpenChange={(open) => !open && setDialog({ type: 'none' })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vorlage wählen</DialogTitle>
            <DialogDescription>
              Mit welcher Vorlage möchtest du starten?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {/* Leer starten */}
            <button
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-secondary/40 transition-colors text-left"
              onClick={() => handleSelectCatalogEntry(null)}
            >
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                <Plus size={20} className="text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Leer starten</p>
                <p className="text-xs text-muted-foreground">Datum + Notizen</p>
              </div>
              <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
            </button>

            {/* Vorlagen */}
            {TEMPLATE_CATALOG.map((entry) => (
              <button
                key={entry.id}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-secondary/40 transition-colors text-left"
                onClick={() => handleSelectCatalogEntry(entry.id)}
              >
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                  {(() => { const Icon = getIconComponent(entry.icon); return <Icon size={20} className="text-muted-foreground" />; })()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{entry.name}</p>
                  <p className="text-xs text-muted-foreground">{entry.description}</p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ type: 'none' })}>Abbrechen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
