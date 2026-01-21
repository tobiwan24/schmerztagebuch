import { useState, useEffect } from 'react';
import { getTemplates, updateTemplate, createTemplate } from '../db';
import { generateUUID } from '../utils/uuid';
import type { Template } from '../types/database';
import type { Block, BlockType } from '../types/blocks';
import Header from '../components/Header';
import BlockPalette from '../components/BlockPalette';
import SortableBlock from '../components/SortableBlock';
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
  const [editingTemplateName, setEditingTemplateName] = useState(false);
  const [tempTemplateName, setTempTemplateName] = useState('');
  const [editingBlockLabel, setEditingBlockLabel] = useState<string | null>(null);
  const [tempBlockLabel, setTempBlockLabel] = useState('');
  

  // Sensors für Drag & Drop
const sensors = useSensors(
  useSensor(PointerSensor),
  useSensor(TouchSensor),
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
    }
  }, [selectedTemplate]);

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

  // Block aus Palette hinzufügen
  function handleAddBlock(type: BlockType) {
    const newBlock: Block = {
      id: generateUUID(),
      type: type,
      label: `Neuer ${type} Block`,
      value: undefined
    };
    setEditingBlocks([...editingBlocks, newBlock]);
  }

  // Block löschen
  function handleDeleteBlock(blockId: string) {
    setEditingBlocks(editingBlocks.filter(b => b.id !== blockId));
  }

// Dummy-Handler für BlockRenderer
  function handleBlockChange(_blockId: string, _value: string | number | boolean | string[]) {
    // Nichts tun - im Editor ändern wir nur die Struktur
  }

  // Speichern
  async function handleSave() {
    if (!selectedTemplate?.id) return;
    
    await updateTemplate(selectedTemplate.id, {
      name: selectedTemplate.name,
      blocks: editingBlocks
    });
    
    alert('Template gespeichert!');
    setSelectedTemplate(null); // Zurück zur Liste
    loadTemplates(); // Liste neu laden
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
      <div className="app-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="text-center">
          <div className="spinner"></div>
          <p className="text-gray-600" style={{ marginTop: '1rem' }}>Templates werden geladen...</p>
        </div>
      </div>
    );
  }

  // Drag & Drop Handler
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
// Template-Name bearbeiten
function handleStartEditTemplateName() {
  if (!selectedTemplate) return;
  setTempTemplateName(selectedTemplate.name);
  setEditingTemplateName(true);
}

function handleSaveTemplateName() {
  if (!selectedTemplate?.id || !tempTemplateName.trim()) return;
  
  const updated = { ...selectedTemplate, name: tempTemplateName };
  setSelectedTemplate(updated);
  setTemplates(templates.map(t => t.id === selectedTemplate.id ? updated : t));
  setEditingTemplateName(false);
}

function handleCancelEditTemplateName() {
  setEditingTemplateName(false);
  setTempTemplateName('');
}

// Block-Label bearbeiten
function handleSaveBlockLabel(blockId: string) {
  if (!tempBlockLabel.trim()) return;
  
  setEditingBlocks(editingBlocks.map(block =>
    block.id === blockId ? { ...block, label: tempBlockLabel } : block
  ));
  setEditingBlockLabel(null);
  setTempBlockLabel('');
}

function handleCancelEditBlockLabel() {
  setEditingBlockLabel(null);
  setTempBlockLabel('');
}

// Neues Template erstellen
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
          <div>
            {/* Header mit Zurück-Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <button onClick={() => setSelectedTemplate(null)} className="btn btn-secondary">
                ← Zurück zur Liste
              </button>
              
              {/* Editierbarer Template-Name */}
              {editingTemplateName ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, marginLeft: '1rem', marginRight: '1rem' }}>
                  <input
                    type="text"
                    value={tempTemplateName}
                    onChange={(e) => setTempTemplateName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTemplateName();
                      if (e.key === 'Escape') handleCancelEditTemplateName();
                    }}
                    className="form-input"
                    style={{ flex: 1, fontSize: '1.25rem', fontWeight: 600 }}
                    autoFocus
                  />
                  <button onClick={handleSaveTemplateName} className="btn btn-primary" style={{ padding: '0.5rem 1rem' }}>
                    ✓
                  </button>
                  <button onClick={handleCancelEditTemplateName} className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }}>
                    ✕
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, marginLeft: '1rem', marginRight: '1rem' }}>
                  <h2 style={{ flex: 1, fontSize: '1.25rem', fontWeight: 600 }}>{selectedTemplate.name}</h2>
                  <button onClick={handleStartEditTemplateName} className="btn-icon" title="Namen bearbeiten">
                    <svg className="icon-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              )}
              
              <button onClick={handleSave} className="btn btn-primary">
                Speichern
              </button>
            </div>

            {/* Block-Palette */}
            <BlockPalette onAddBlock={handleAddBlock} />

            {/* Blöcke-Liste */}
            {/* Blöcke-Liste */}
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
                    <p className="text-gray-600 text-center" style={{ padding: '2rem' }}>
                      Noch keine Blöcke. Wähle einen aus der Palette oben.
                    </p>
                  ) : (
                    editingBlocks.map((block) => (
            <SortableBlock
              key={block.id}
              block={block}
              onEdit={() => {
                setEditingBlockLabel(block.id);
                setTempBlockLabel(block.label);
              }}
              onDelete={() => handleDeleteBlock(block.id)}
              onChange={(value) => handleBlockChange(block.id, value)}
              onLabelChange={setTempBlockLabel}
              onLabelEdit={(blockId, label) => {
                if (label) {
                  handleSaveBlockLabel(blockId);
                } else {
                  handleCancelEditBlockLabel();
                }
              }}
              isEditingLabel={editingBlockLabel === block.id}
              tempLabel={tempBlockLabel}
            />
          ))
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        ) : (
          // TEMPLATE LISTE
          <>
            {/* Template-Liste */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Templates</h2>
            <button
              onClick={handleCreateTemplate}
              className="btn btn-primary"
              style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
            >
              ➕ Neues Template
            </button>
          </div>

          <div className="space-y-4">
            {templates.map(template => (
              <div
                key={template.id}
                onClick={() => setSelectedTemplate(template)}
                className="card"
                style={{ cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontWeight: 600 }}>{template.name}</h3>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                      {template.blocks.length} {template.blocks.length === 1 ? 'Block' : 'Blöcke'}
                    </p>
                  </div>
                  <svg className="icon-md" style={{ color: 'var(--color-text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </div>


          </>
        )}
      </div>
    </div>
  );
}
