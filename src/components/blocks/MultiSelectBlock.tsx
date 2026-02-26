import type { Block } from '../../types/blocks';
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import styles from './MultiSelectBlock.module.css';

interface MultiSelectBlockProps {
  block: Block;
  onChange: (value: string[]) => void;
  readOnly?: boolean;
  hideLabel?: boolean;
}

export default function MultiSelectBlock({ block, onChange, readOnly = false, hideLabel = false }: MultiSelectBlockProps) {
  const selected = Array.isArray(block.value) ? block.value : [];

  const handleToggle = (optionText: string) => {
    if (readOnly) return;

    const newSelected = selected.includes(optionText)
      ? selected.filter(item => item !== optionText)
      : [...selected, optionText];

    onChange(newSelected);
  };

  const options = block.multiSelectOptions || [];

  // Keine Nachricht mehr wenn keine Buttons - einfach nichts anzeigen
  if (options.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {!hideLabel && <Label>{block.label}</Label>}
      <div className="flex flex-wrap gap-2" style={{ touchAction: 'pan-y' }}>
        {options.map((option, index) => {
          const isSelected = selected.includes(option.text);
          
          return (
            <div
              key={index}
              style={{ '--multiselect-color': option.color } as React.CSSProperties}
            >
              <Button
                type="button"
                onClick={() => handleToggle(option.text)}
                disabled={readOnly}
                className={cn(
                  styles.multiselectButton,
                  isSelected ? styles.multiselectButtonSelected : styles.multiselectButtonUnselected
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
