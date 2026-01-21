import { useState } from 'react';
import type { Block } from '../../types/blocks';

interface DatePickerBlockProps {
  block: Block;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export default function DatePickerBlock({ block, onChange, readOnly = false }: DatePickerBlockProps) {
  const [value, setValue] = useState<string>(
    (block.value as string) || new Date().toISOString().split('T')[0]
  );

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
        type="date"
        value={value}
        onChange={handleChange}
        readOnly={readOnly}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
        disabled={readOnly}
      />
    </div>
  );
}