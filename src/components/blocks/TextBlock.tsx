import { useState } from 'react';
import type { Block } from '../../types/blocks';

interface TextBlockProps {
  block: Block;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export default function TextBlock({ block, onChange, readOnly = false }: TextBlockProps) {
  const [value, setValue] = useState<string>((block.value as string) || '');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onChange(newValue);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        {block.label}
      </label>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        readOnly={readOnly}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
        disabled={readOnly}
      />
    </div>
  );
}