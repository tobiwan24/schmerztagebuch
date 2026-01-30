import { useState, useEffect } from 'react';
import { getTemplates, updateTemplate, createTemplate, deleteTemplate } from '../db';
import { generateUUID } from '../utils/uuid';
import type { Template } from '../types/database';
import type { Block, BlockType } from '../types/blocks';
import Header from '../components/Header';
import BlockPalette from '../components/BlockPalette';
import SortableBlock from '../components/SortableBlock';
import TemplateStylePicker from '../components/TemplateStylePicker';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save, X, Plus, ChevronRight, Trash2 } from 'lucide-react';
import { cn } from "@/lib/utils";
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
  onBack: () => void;
  onNavigate: (view: 'editor' | 'history' | 'diary' | 'settings') => void;
}

export default function EditorMode({ onBack, onNavigate }: EditorModeProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [editingBlocks, setEditingBlocks] = useState<Block[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalTemplate, setOriginalTemplate] = useState<Template | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [tempBlockLabel, setTempBlockLabel] = useState('');
  const [blockOptionsInput, setBlockOptionsInput] = useState('');
  const [multiSelectButtons, setMultiSelectButtons] = useState<{text: string; color: string}[]>([]);
  const [newButtonText, setNewButtonText] = useState('');
  const [newButtonColor, setNewButtonColor] = useState('#007AFF');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (selectedTemplate) {
      setEditingBlocks([...selectedTemplate.blocks]);
      setOriginalTemplate(JSON.parse(JSON.stringify(selectedTemplate)));
      setHasUnsavedChanges(false);
    }
  }, [selectedTemplate]);

  useEffect(() => {
    if (!selectedTemplate || !originalTemplate) return;
    
    const templateChanged = 
      selectedTemplate.name !== originalTemplate.name ||
      selectedTemplate.icon !== originalTemplate.icon ||
      selectedTemplate.color !== originalTemplate.color;
    
    const blocksChanged = JSON.stringify(editingBlocks) !== JSON.stringify(originalTemplate.blocks);
    
    setHasUnsavedChanges(templateChanged || blocksChanged);
  }, [selectedTemplate, editingBlocks, originalTemplate]);

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
    const newBlock: Block = {
      id: generateUUID(),
      type: type,
      label: `Neuer ${type} Block`,
      hideLabelInDiary: false,
      value: undefined
    };
    
    if (type === 'multiselect') {
      newBlock.multiSelectOptions = [];
    } else if (type === 'slider') {
      newBlock.min = 0;
      newBlock.max = 10;
      newBlock.step = 1;
    }
    
    setEditingBlocks([...editingBlocks, newBlock]);
  }

  function handleDeleteBlock(blockId: string) {
    setEditingBlocks(editingBlocks.filter(b => b.id !== blockId));
  }

  function handleBlockChange(_blockId: string, _value: string | number | boolean | string[]) {
    // Nichts tun - im Editor ändern wir nur die Struktur
  }

  function handleIconChange(icon: string) {
    if (!selectedTemplate) return;
    const updated = { ...selectedTemplate, icon };
    setSelectedTemplate(updated);
    setTemplates(templates.map(t => t.id === selectedTemplate.id ? updated : t));
  }

  function handleColorChange(color: string) {
    if (!selectedTemplate) return;
    const updated = { ...selectedTemplate, color };
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
    
    alert('Template gespeichert!');
    setHasUnsavedChanges(false);
    setOriginalTemplate(JSON.parse(JSON.stringify(selectedTemplate)));
    setSelectedTemplate(null);
    loadTemplates();
  }

  function handleBackToList() {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        '⚠️ Du hast ungespeicherte Änderungen!\n\nMöchtest du wirklich zurück zur Liste gehen? Alle Änderungen gehen verloren.'
      );
      if (!confirmed) return;
    }
    setSelectedTemplate(null);
    setHasUnsavedChanges(false);
  }

  const menuItems = [
    {
      label: 'Zum Tagebuch',
      icon: 'diary' as const,
      onClick: () => onNavigate('diary')
    },
    {
      label: 'Verlauf anzeigen',
      icon: 'history' as const,
      onClick: () => onNavigate('history')
    }
  ];

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

  function handleSaveBlockLabel(blockId: string) {
    if (!tempBlockLabel.trim()) return;
    
    setEditingBlocks(editingBlocks.map(block =>
      block.id === blockId ? { ...block, label: tempBlockLabel } : block
    ));
    setTempBlockLabel('');
  }

  function handleToggleHideLabel(blockId: string) {
    setEditingBlocks(editingBlocks.map(block =>
      block.id === blockId ? { ...block, hideLabelInDiary: !block.hideLabelInDiary } : block
    ));
  }

  async function handleCreateTemplate() {
    const name = prompt('Name des neuen Templates:');
    if (!name) return;
    
    try {
      await createTemplate(name, []);
      await loadTemplates();
    } catch (error) {
      console.error('Fehler beim Erstellen:', error);
    }
  }

  async function handleDeleteTemplate(templateId: number, templateName: string, e: React.MouseEvent) {
    e.stopPropagation();
    
    const confirmed = window.confirm(
      `⚠️ Template "${templateName}" wirklich löschen?\n\nAlle zugehörigen Einträge bleiben erhalten, können aber nicht mehr diesem Template zugeordnet werden.`
    );
    
    if (!confirmed) return;
    
    try {
      await deleteTemplate(templateId);
      await loadTemplates();
    } catch (error) {
      console.error('Fehler beim Löschen:', error);
      alert('Fehler beim Löschen des Templates');
    }
  }

  function handleEditBlockOptions(blockId: string) {
    const block = editingBlocks.find(b => b.id === blockId);
    if (!block) return;
    
    setEditingBlockId(blockId);
    setTempBlockLabel(block.label); // Label in temp speichern für Edit
    
    if (block.type === 'multiselect') {
      if (block.multiSelectOptions) {
        setMultiSelectButtons([...block.multiSelectOptions]);
      } else {
        setMultiSelectButtons([]);
      }
      setNewButtonText('');
      setNewButtonColor('#007AFF');
    } else {
      setBlockOptionsInput('');
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
    
    // Label aktualisieren
    setEditingBlocks(editingBlocks.map(b => {
      if (b.id === editingBlockId) {
        const updated = { ...b, label: tempBlockLabel };
        
        // Zusätzlich: multiselect-Buttons aktualisieren
        if (block.type === 'multiselect') {
          updated.multiSelectOptions = multiSelectButtons;
        }
        
        return updated;
      }
      return b;
    }));
    
    setEditingBlockId(null);
    setBlockOptionsInput('');
    setMultiSelectButtons([]);
    setNewButtonText('');
    setNewButtonColor('#007AFF');
    setTempBlockLabel('');
  }

  function handleCancelBlockOptions() {
    setEditingBlockId(null);
    setBlockOptionsInput('');
    setMultiSelectButtons([]);
    setNewButtonText('');
    setNewButtonColor('#007AFF');
    setTempBlockLabel('');
  }

  return (
    <div className="app-container">
      <Header 
        title="Template-Editor" 
        onBack={onBack}
        showMenu={true}
        menuItems={menuItems}
      />
      
      <div className="content-wrapper">
        {selectedTemplate ? (
          // TEMPLATE EDITOR
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <Button
                onClick={handleBackToList}
                variant="outline"
                size="sm"
              >
                <ArrowLeft size={16} className="mr-2" />
                Zurück
              </Button>
              
              <Button onClick={handleSave} className="relative">
                <Save size={16} className="mr-2" />
                Speichern
                {hasUnsavedChanges && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-card" />
                )}
              </Button>
            </div>

            {/* Unsaved Changes Warning */}
            {hasUnsavedChanges && (
              <Card className="p-3 bg-yellow-50 border-yellow-200">
                <p className="text-sm text-yellow-800">
                  ⚠️ Du hast ungespeicherte Änderungen
                </p>
              </Card>
            )}

            {/* Template Style Picker mit Name-Edit */}
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
              onColorChange={handleColorChange}
            />

            {/* Block Palette */}
            <BlockPalette onAddBlock={handleAddBlock} />

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
                      />
                    ))
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        ) : (
          // TEMPLATE LIST
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Templates</h2>
              <Button onClick={handleCreateTemplate}>
                <Plus size={16} className="mr-2" />
                Neues Template
              </Button>
            </div>

            <div className="space-y-3">
              {templates.map(template => (
                <Card
                  key={template.id}
                  onClick={() => setSelectedTemplate(template)}
                  className="p-4 cursor-pointer hover:bg-accent transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <h3 className="font-semibold">{template.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {template.blocks.length} {template.blocks.length === 1 ? 'Block' : 'Blöcke'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={(e) => template.id && handleDeleteTemplate(template.id, template.name, e)}
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 size={18} />
                      </Button>
                      <ChevronRight size={20} className="text-muted-foreground" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Block Options Modal - wird im nächsten Teil modernisiert */}
      {editingBlockId && (() => {
        const block = editingBlocks.find(b => b.id === editingBlockId);
        if (!block) return null;
        
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={handleCancelBlockOptions}>
            <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b flex justify-between items-center">
                <h3 className="text-lg font-semibold">Block bearbeiten</h3>
                <Button onClick={handleCancelBlockOptions} variant="ghost" size="icon">
                  <X size={18} />
                </Button>
              </div>

              <div className="p-4 space-y-4">
                {/* Label-Edit - IMMER als Input */}
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
                          autoFocus
                        />
                        <div className="flex items-center gap-2">
                          <Label className="min-w-[80px]">Farbe:</Label>
                          <input
                            type="color"
                            value={newButtonColor}
                            onChange={(e) => setNewButtonColor(e.target.value)}
                            className="w-16 h-10 rounded cursor-pointer"
                          />
                          <Button onClick={handleAddButton} className="ml-auto">
                            <Plus size={16} className="mr-2" />
                            Hinzufügen
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
                              <input
                                type="color"
                                value={btn.color}
                                onChange={(e) => handleUpdateButtonColor(idx, e.target.value)}
                                className="w-12 h-8 rounded cursor-pointer"
                              />
                              <div
                                className="px-3 py-1 rounded text-white text-xs font-semibold"
                                style={{ backgroundColor: btn.color }}
                              >
                                Vorschau
                              </div>
                              <Button
                                onClick={() => handleRemoveButton(idx)}
                                variant="ghost"
                                size="icon"
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

              <div className="p-4 border-t flex justify-end gap-2">
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
    </div>
  );
}
