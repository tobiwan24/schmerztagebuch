import { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, Palette } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ColorPalette } from './ColorPalette';

interface SortableButtonRowProps {
  index: number;
  button: { text: string; color: string };
  isDndMode: boolean;
  isEditing: boolean;
  onTextClick: () => void;
  onTextChange: (text: string) => void;
  onTextBlur: () => void;
  onColorChange: (color: string) => void;
  onDelete: () => void;
}

export function SortableButtonRow({
  index,
  button,
  isDndMode,
  isEditing,
  onTextClick,
  onTextChange,
  onTextBlur,
  onColorChange,
  onDelete
}: SortableButtonRowProps) {
  const { 
    attributes, 
    listeners, 
    setNodeRef, 
    transform, 
    transition,
    isDragging 
  } = useSortable({ 
    id: index,
    disabled: !isDndMode
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus bei Edit
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "button-row",
        isDndMode && "button-row-draggable"
      )}
      {...(isDndMode ? { ...attributes, ...listeners } : {})}
    >
      {isEditing ? (
        <Input
          ref={inputRef}
          value={button.text}
          onChange={(e) => onTextChange(e.target.value)}
          onBlur={onTextBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onTextBlur();
            }
            if (e.key === 'Escape') {
              onTextBlur();
            }
          }}
          className="flex-1"
        />
      ) : (
        <span
          className="button-text"
          onClick={() => !isDndMode && onTextClick()}
        >
          {button.text}
        </span>
      )}

      {/* Palette Icon statt runder Button */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "color-palette-btn",
              isDndMode && "color-palette-btn-disabled"
            )}
            style={{ 
              backgroundColor: `${button.color}33`, // 33 = 20% opacity in hex
              color: button.color
            }}
            disabled={isDndMode}
            type="button"
          >
            <Palette size={18} />
          </button>
        </PopoverTrigger>
        <PopoverContent>
          <ColorPalette
            selected={button.color}
            onSelect={onColorChange}
          />
        </PopoverContent>
      </Popover>

      <button
        onClick={onDelete}
        className={cn(
          "delete-btn",
          isDndMode && "delete-btn-disabled"
        )}
        disabled={isDndMode}
        type="button"
      >
        <X size={16} />
      </button>
    </div>
  );
}
