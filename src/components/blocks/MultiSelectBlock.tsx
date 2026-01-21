import { useState } from 'react';
import type { Block } from '../../types/blocks';

interface MultiSelectBlockProps {
  block: Block;
  onChange: (value: string[]) => void;
  readOnly?: boolean;
}

export default function MultiSelectBlock({ block, onChange, readOnly = false }: MultiSelectBlockProps) {
  const [selected, setSelected] = useState<string[]>(
    (block.value as string[]) || []
  );

  const handleToggle = (option: string) => {
    if (readOnly) return;
    
    const newSelected = selected.includes(option)
      ? selected.filter(item => item !== option)
      : [...selected, option];
    
    setSelected(newSelected);
    onChange(newSelected);
  };

  const options = block.options || [];

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        {block.label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => handleToggle(option)}
            disabled={readOnly}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selected.includes(option)
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {option}
          </button>
        ))}
      </div>
      {selected.length > 0 && (
        <div className="text-xs text-gray-500">
          Ausgewählt: {selected.join(', ')}
        </div>
      )}
    </div>
  );
}