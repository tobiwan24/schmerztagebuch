import { useState } from 'react';
import type { Block } from '../../types/blocks';

interface SliderBlockProps {
  block: Block;
  onChange: (value: number) => void;
  readOnly?: boolean;
}

export default function SliderBlock({ block, onChange, readOnly = false }: SliderBlockProps) {
  const min = block.min ?? 0;
  const max = block.max ?? 10;
  const step = block.step ?? 1;
  const [value, setValue] = useState<number>((block.value as number) ?? min);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(e.target.value);
    setValue(newValue);
    onChange(newValue);
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-gray-700">
          {block.label}
        </label>
        <span className="text-lg font-bold text-blue-600">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        disabled={readOnly}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
      />
      <div className="flex justify-between text-xs text-gray-500">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}