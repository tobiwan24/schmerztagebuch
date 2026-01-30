import { useState } from 'react';
import type { Block } from '../../types/blocks';
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

interface SliderBlockProps {
  block: Block;
  onChange: (value: number) => void;
  readOnly?: boolean;
  hideLabel?: boolean;
}

export default function SliderBlock({ block, onChange, readOnly = false, hideLabel = false }: SliderBlockProps) {
  const min = block.min ?? 0;
  const max = block.max ?? 10;
  const step = block.step ?? 1;
  const [value, setValue] = useState<number>((block.value as number) ?? min);

  const handleChange = (newValues: number[]) => {
    const newValue = newValues[0];
    setValue(newValue);
    onChange(newValue);
  };

  return (
    <div className="space-y-3">
      {!hideLabel && (
        <div className="flex justify-between items-center">
          <Label>{block.label}</Label>
          <span className="text-2xl font-bold text-primary">{value}</span>
        </div>
      )}
      <Slider
        value={[value]}
        onValueChange={handleChange}
        min={min}
        max={max}
        step={step}
        disabled={readOnly}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
