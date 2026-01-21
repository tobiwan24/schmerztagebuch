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
    <div className="form-group">
      <label className="form-label">
        {block.label}
      </label>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        readOnly={readOnly}
        className="form-input"
        disabled={readOnly}
      />
    </div>
  );
}