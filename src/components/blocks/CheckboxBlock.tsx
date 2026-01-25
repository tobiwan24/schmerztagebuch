import { useState } from 'react';
import type { Block } from '../../types/blocks';

interface CheckboxBlockProps {
  block: Block;
  onChange: (value: boolean | string) => void;
  readOnly?: boolean;
}

export default function CheckboxBlock({ block, onChange, readOnly = false }: CheckboxBlockProps) {
  const [checked, setChecked] = useState<boolean>((block.value as boolean) || false);
  const [selectedOption, setSelectedOption] = useState<string>((block.value as string) || '');

  const handleSimpleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    setChecked(newValue);
    onChange(newValue);
  };

  const handleOptionChange = (option: string) => {
    const newValue = selectedOption === option ? '' : option;
    setSelectedOption(newValue);
    onChange(newValue);
  };

  // Wenn Optionen vorhanden sind, zeige Radio-Button-Style Auswahl
  if (block.options && block.options.length > 0) {
    return (
      <div className="form-group">
        <label className="form-label">{block.label}</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {block.options.map((option) => (
            <label
              key={option}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem',
                border: selectedOption === option ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                cursor: readOnly ? 'not-allowed' : 'pointer',
                backgroundColor: selectedOption === option ? 'var(--color-primary-light)' : 'var(--color-bg-primary)',
                transition: 'all var(--transition-base)',
              }}
            >
              <input
                type="checkbox"
                checked={selectedOption === option}
                onChange={() => handleOptionChange(option)}
                disabled={readOnly}
                style={{
                  width: '1.25rem',
                  height: '1.25rem',
                  cursor: readOnly ? 'not-allowed' : 'pointer',
                }}
              />
              <span style={{ flex: 1, fontSize: '0.9375rem', fontWeight: selectedOption === option ? 600 : 400 }}>
                {option}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  // Einfache Checkbox (ohne Optionen)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={handleSimpleCheckboxChange}
        disabled={readOnly}
        style={{
          width: '1.25rem',
          height: '1.25rem',
          cursor: readOnly ? 'not-allowed' : 'pointer',
        }}
      />
      <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>
        {block.label}
      </label>
    </div>
  );
}
