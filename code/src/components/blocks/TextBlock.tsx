import { useState } from 'react';
import type { Block } from '../../types/blocks';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface TextBlockProps {
  block: Block;
  onChange: (value: string) => void;
  readOnly?: boolean;
  hideLabel?: boolean;
}

export default function TextBlock({ block, onChange, readOnly = false, hideLabel = false }: TextBlockProps) {
  const [value, setValue] = useState<string>((block.value as string) || '');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onChange(newValue);
  };

  const handleOptionSelect = (option: string) => {
    setValue(option);
    onChange(option);
    setShowCustomInput(false);
  };

  const handleCustomInput = () => {
    setShowCustomInput(true);
    setValue('');
    onChange('');
  };

  if (block.options && block.options.length > 0) {
    return (
      <div className="space-y-2">
        {!hideLabel && <Label>{block.label}</Label>}
        
        {!showCustomInput ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {block.options.map((option) => (
                <Button
                  key={option}
                  onClick={() => handleOptionSelect(option)}
                  disabled={readOnly}
                  variant={value === option ? 'default' : 'outline'}
                  size="sm"
                  type="button"
                >
                  {option}
                </Button>
              ))}
            </div>
            
            {!readOnly && (
              <Button
                onClick={handleCustomInput}
                variant="secondary"
                size="sm"
                type="button"
              >
                ✏️ Eigene Eingabe
              </Button>
            )}
            
            {value && (
              <Card className="p-3 bg-secondary/50">
                <p className="text-sm">
                  <span className="font-semibold">Ausgewählt:</span> {value}
                </p>
              </Card>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              type="text"
              value={value}
              onChange={handleChange}
              readOnly={readOnly}
              disabled={readOnly}
              placeholder="Eigenen Text eingeben..."
              autoFocus
            />
            <Button
              onClick={() => setShowCustomInput(false)}
              variant="secondary"
              size="sm"
              type="button"
            >
              Zurück zur Auswahl
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!hideLabel && <Label>{block.label}</Label>}
      <Input
        type="text"
        value={value}
        onChange={handleChange}
        readOnly={readOnly}
        disabled={readOnly}
      />
    </div>
  );
}
