import { useState, useRef, useEffect } from 'react';
import { ArrowDownUp } from 'lucide-react';
import { Input } from "@/components/ui/input";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ColorPalette, PRESET_COLORS } from './ColorPalette';
import { SortableButtonRow } from './SortableButtonRow';
import { Palette } from 'lucide-react';

interface MultiSelectEditorProps {
  buttons: { text: string; color: string }[];
  onChange: (buttons: { text: string; color: string }[]) => void;
}

export function MultiSelectEditor({ buttons, onChange }: MultiSelectEditorProps) {
  const [isDndMode, setIsDndMode] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newButtonText, setNewButtonText] = useState('');
  const [newButtonColor, setNewButtonColor] = useState(PRESET_COLORS[0]);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const paletteTriggerRef = useRef<HTMLButtonElement>(null);

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

  // Click außerhalb deaktiviert DnD-Modus
  useEffect(() => {
    if (!isDndMode) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsDndMode(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDndMode]);

  // Text klicken → Edit-Modus
  function handleTextClick(index: number) {
    if (isDndMode) return;
    setEditingIndex(index);
  }

  // Text ändern
  function handleTextChange(index: number, newText: string) {
    const updated = [...buttons];
    updated[index].text = newText;
    onChange(updated);
  }

  // Edit beenden
  function handleTextBlur() {
    setEditingIndex(null);
  }

  // Farbe ändern
  function handleColorChange(index: number, newColor: string) {
    const updated = [...buttons];
    updated[index].color = newColor;
    onChange(updated);
  }

  // Button löschen
  function handleDelete(index: number) {
    onChange(buttons.filter((_, idx) => idx !== index));
    if (editingIndex === index) {
      setEditingIndex(null);
    }
  }

  // Neuen Button hinzufügen (mit expliziter Farbe)
  function handleAddButton(color?: string) {
    if (!newButtonText.trim()) return;
    const chosenColor = color ?? newButtonColor;
    onChange([...buttons, { text: newButtonText.trim(), color: chosenColor }]);
    setNewButtonText('');
    setNewButtonColor(PRESET_COLORS[0]);
    setColorPickerOpen(false);
  }

  // Farbe auswählen → Button hinzufügen + Picker schließen
  function handleColorSelectAndAdd(color: string) {
    setNewButtonColor(color);
    handleAddButton(color);
  }

  // Input: Enter → Farbpalette öffnen
  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (newButtonText.trim()) {
        setColorPickerOpen(true);
      }
    }
  }

  // Input: Blur → Button mit aktueller Farbe hinzufügen
  // Ausnahme: Blur durch Klick auf Palette-Trigger-Button
  function handleInputBlur(e: React.FocusEvent<HTMLInputElement>) {
    if (e.relatedTarget === paletteTriggerRef.current) return;
    if (!colorPickerOpen && newButtonText.trim()) {
      handleAddButton();
    }
  }

  // DnD Handler
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = buttons.findIndex((_, i) => i === active.id);
      const newIndex = buttons.findIndex((_, i) => i === over.id);
      onChange(arrayMove(buttons, oldIndex, newIndex));
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "multiselect-editor-container",
        isDndMode && "dnd-active"
      )}
    >
      {/* DnD Toggle Button - Expandierbar */}
      <button
        onClick={() => setIsDndMode(!isDndMode)}
        className={cn(
          "dnd-toggle-button",
          isDndMode && "dnd-toggle-expanded"
        )}
        data-active={isDndMode}
        type="button"
      >
        {isDndMode && (
          <span className="dnd-toggle-text">
            Ziehe Buttons zum Sortieren
          </span>
        )}
        <ArrowDownUp size={18} />
      </button>

      {/* Buttons List */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={buttons.map((_, idx) => idx)}
          strategy={verticalListSortingStrategy}
          disabled={!isDndMode}
        >
          {buttons.map((btn, idx) => (
            <SortableButtonRow
              key={idx}
              index={idx}
              button={btn}
              isDndMode={isDndMode}
              isEditing={editingIndex === idx}
              onTextClick={() => handleTextClick(idx)}
              onTextChange={(newText) => handleTextChange(idx, newText)}
              onTextBlur={handleTextBlur}
              onColorChange={(newColor) => handleColorChange(idx, newColor)}
              onDelete={() => handleDelete(idx)}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Add Input - versteckt im DnD-Modus */}
      {!isDndMode && (
        <div className="add-button-row">
          <Input
            value={newButtonText}
            onChange={(e) => setNewButtonText(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={handleInputBlur}
            placeholder="Neuer Button..."
            className="flex-1"
          />

          {/* Palette Icon – öffnet Farbwahl */}
          <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
            <PopoverTrigger asChild>
              <button
                ref={paletteTriggerRef}
                className="color-palette-btn"
                style={{
                  backgroundColor: `${newButtonColor}33`,
                  color: newButtonColor
                }}
                type="button"
              >
                <Palette size={18} />
              </button>
            </PopoverTrigger>
            <PopoverContent>
              <ColorPalette
                selected={newButtonColor}
                onSelect={handleColorSelectAndAdd}
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
