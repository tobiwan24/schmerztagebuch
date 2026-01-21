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
    <div className="form-group">
      <label className="form-label">
        {block.label}
      </label>
      <textarea
        value={value}
        onChange={handleChange}
        readOnly={readOnly}
        rows={4}
        className="form-textarea"
        disabled={readOnly}
      />
    </div>
  );
}