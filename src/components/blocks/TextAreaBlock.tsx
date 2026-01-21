import { useState } from 'react';
import type { Block } from '../../types/blocks';

interface TextAreaBlockProps {
  block: Block;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export default function TextAreaBlock({ block, onChange, readOnly = false }: TextAreaBlockProps) {
  const [value, setValue] = useState<string>((block.value as string) || '');

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onChange(newValue);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        {block.label}
      </label>
      <textarea
        value={value}
        onChange={handleChange}
        readOnly={readOnly}
        rows={4}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:bg-gray-100"
        disabled={readOnly}
      />
    </div>
  );
}