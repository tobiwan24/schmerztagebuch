import { useState } from 'react';
import type { Block } from '../../types/blocks';
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface TextAreaBlockProps {
  block: Block;
  onChange: (value: string) => void;
  readOnly?: boolean;
  hideLabel?: boolean;
}

export default function TextAreaBlock({ block, onChange, readOnly = false, hideLabel = false }: TextAreaBlockProps) {
  const [value, setValue] = useState<string>((block.value as string) || '');

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onChange(newValue);
  };

  return (
    <div className="space-y-2">
      {!hideLabel && <Label>{block.label}</Label>}
      <Textarea
        value={value}
        onChange={handleChange}
        readOnly={readOnly}
        disabled={readOnly}
        rows={4}
        className="resize-none"
      />
    </div>
  );
}
