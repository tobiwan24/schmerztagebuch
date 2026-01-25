import { useState } from 'react';
import type { Block } from '../../types/blocks';

interface TextBlockProps {
  block: Block;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export default function TextBlock({ block, onChange, readOnly = false }: TextBlockProps) {
  const [value, setValue] = useState<string>((block.value as string) || '');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onChange(newValue);
  };

  const handleOptionSelect = (option: string) => {
    setValue(option);
    onChange(option);
    setShowCustomInput(false);
  };

  const handleCustomInput = () => {
    setShowCustomInput(true);
    setValue('');
    onChange('');
  };

  // Wenn Optionen vorhanden sind, zeige Auswahl-Buttons
  if (block.options && block.options.length > 0) {
    return (
      <div className="form-group">
        <label className="form-label">{block.label}</label>
        
        {/* Auswahl-Buttons */}
        {!showCustomInput ? (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {block.options.map((option) => (
                <button
                  key={option}
                  onClick={() => handleOptionSelect(option)}
                  disabled={readOnly}
                  className={value === option ? 'btn btn-primary' : 'btn btn-secondary'}
                  type="button"
                  style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                >
                  {option}
                </button>
              ))}
            </div>
            
            {/* Custom Input Button */}
            {!readOnly && (
              <button
                onClick={handleCustomInput}
                className="btn btn-secondary"
                type="button"
                style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
              >
                ✏️ Eigene Eingabe
              </button>
            )}
            
            {/* Zeige gewählten Wert */}
            {value && (
              <div style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>
                <strong>Ausgewählt:</strong> {value}
              </div>
            )}
          </div>
        ) : (
          /* Eigene Eingabe */
          <div>
            <input
              type="text"
              value={value}
              onChange={handleChange}
              readOnly={readOnly}
              className="form-input"
              disabled={readOnly}
              placeholder="Eigenen Text eingeben..."
              autoFocus
            />
            <button
              onClick={() => setShowCustomInput(false)}
              className="btn btn-secondary"
              type="button"
              style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', marginTop: '0.5rem' }}
            >
              Zurück zur Auswahl
            </button>
          </div>
        )}
      </div>
    );
  }

  // Normaler Text-Input (ohne Optionen)
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
