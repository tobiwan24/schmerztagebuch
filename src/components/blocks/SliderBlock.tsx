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
    <div className="form-group">
      <label className="form-label">
        {block.label}
      </label>
      <div className="slider-container">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          disabled={readOnly}
          className="slider-input w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
        />
        <span className="slider-value">
          {value}
        </span>
      </div>
    </div>
  );
}