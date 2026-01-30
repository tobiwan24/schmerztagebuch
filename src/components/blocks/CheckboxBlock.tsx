import { useState } from 'react';
import type { Block, CheckboxValue } from '../../types/blocks';
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CheckboxBlockProps {
  block: Block;
  onChange: (value: boolean | string | CheckboxValue) => void;
  readOnly?: boolean;
  hideLabel?: boolean;
}

export default function CheckboxBlock({ block, onChange, readOnly = false, hideLabel = false }: CheckboxBlockProps) {
  // Parse value: kann boolean, string, oder CheckboxValue sein
  const parseValue = (): CheckboxValue => {
    if (typeof block.value === 'object' && block.value !== null && 'checked' in block.value) {
      return block.value as CheckboxValue;
    }
    if (typeof block.value === 'boolean') {
      return { checked: block.value, text: '' };
    }
    if (typeof block.value === 'string') {
      return { checked: false, text: block.value };
    }
    return { checked: false, text: '' };
  };

  const [value, setValue] = useState<CheckboxValue>(parseValue());
  const [selectedOption, setSelectedOption] = useState<string>((typeof block.value === 'string' ? block.value : '') || '');

  const handleSimpleCheckboxChange = (newChecked: boolean) => {
    const newValue = { ...value, checked: newChecked };
    setValue(newValue);
    onChange(newValue);
  };

  const handleTextChange = (newText: string) => {
    const newValue = { ...value, text: newText };
    setValue(newValue);
    onChange(newValue);
  };

  const handleOptionChange = (option: string) => {
    const newValue = selectedOption === option ? '' : option;
    setSelectedOption(newValue);
    onChange(newValue);
  };

  // Mit Optionen: Select-One Modus
  if (block.options && block.options.length > 0) {
    return (
      <div className="space-y-2">
        {!hideLabel && <Label>{block.label}</Label>}
        <div className="space-y-3">
          {block.options.map((option) => (
            <div
              key={option}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer",
                selectedOption === option 
                  ? "border-primary bg-primary/5" 
                  : "border-border bg-card hover:border-primary/50",
                readOnly && "cursor-not-allowed opacity-60"
              )}
              onClick={() => !readOnly && handleOptionChange(option)}
            >
              <Checkbox
                checked={selectedOption === option}
                onCheckedChange={() => handleOptionChange(option)}
                disabled={readOnly}
              />
              <span className={cn(
                "flex-1 text-sm",
                selectedOption === option && "font-semibold"
              )}>
                {option}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Ohne Optionen: Checkbox mit Textfeld
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Checkbox
          checked={value.checked}
          onCheckedChange={handleSimpleCheckboxChange}
          disabled={readOnly}
        />
        {!hideLabel && (
          <Label className="text-sm font-medium">
            {block.label}
          </Label>
        )}
      </div>
      {value.checked && (
        <Input
          value={value.text || ''}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="Notiz hinzufügen..."
          disabled={readOnly}
          className="ml-7"
        />
      )}
    </div>
  );
}
