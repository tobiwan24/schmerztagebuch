import { useState } from 'react';
import type { Block } from '../../types/blocks';

interface CheckboxBlockProps {
  block: Block;
  onChange: (value: boolean) => void;
  readOnly?: boolean;
}

export default function CheckboxBlock({ block, onChange, readOnly = false }: CheckboxBlockProps) {
  const [checked, setChecked] = useState<boolean>((block.value as boolean) || false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    setChecked(newValue);
    onChange(newValue);
  };

  return (
    <div className="flex items-center space-x-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        disabled={readOnly}
        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      />
      <label className="text-sm font-medium text-gray-700">
        {block.label}
      </label>
    </div>
  );
}