import { useState, useEffect } from 'react';
import type { Block } from '../../types/blocks';
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MultiSelectBlockProps {
  block: Block;
  onChange: (value: string[]) => void;
  readOnly?: boolean;
  hideLabel?: boolean;
}

export default function MultiSelectBlock({ block, onChange, readOnly = false, hideLabel = false }: MultiSelectBlockProps) {
  const [selected, setSelected] = useState<string[]>(
    Array.isArray(block.value) ? block.value : []
  );

  useEffect(() => {
    if (Array.isArray(block.value)) {
      setSelected(block.value);
    }
  }, [block.value]);

  const handleToggle = (optionText: string) => {
    if (readOnly) return;
    
    const newSelected = selected.includes(optionText)
      ? selected.filter(item => item !== optionText)
      : [...selected, optionText];
    
    setSelected(newSelected);
    onChange(newSelected);
  };

  const options = block.multiSelectOptions || [];

  if (options.length === 0) {
    return (
      <div className="space-y-2">
        {!hideLabel && <Label>{block.label}</Label>}
        <p className="text-sm text-muted-foreground">
          Keine Buttons konfiguriert. Bitte im Editor Buttons hinzufügen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!hideLabel && <Label>{block.label}</Label>}
      <div className="flex flex-wrap gap-2">
        {options.map((option, index) => {
          const isSelected = selected.includes(option.text);
          
          return (
            <div
              key={index}
              className="multiselect-button-wrapper"
              style={option.color ? { '--multiselect-color': option.color } as React.CSSProperties : undefined}
            >
              <Button
                type="button"
                onClick={() => handleToggle(option.text)}
                disabled={readOnly}
                variant={isSelected ? "default" : "outline"}
                className={cn(
                  "transition-all font-medium",
                  isSelected && option.color && "multiselect-button-selected",
                  !isSelected && option.color && "multiselect-button-unselected",
                  isSelected && "scale-105 shadow-md"
                )}
              >
                {option.text}
              </Button>
            </div>
          );
        })}
      </div>
      {selected.length > 0 && !readOnly && (
        <p className="text-xs text-muted-foreground">
          Ausgewählt: {selected.join(', ')}
        </p>
      )}
    </div>
  );
}
