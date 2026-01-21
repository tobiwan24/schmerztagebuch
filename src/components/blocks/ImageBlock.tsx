import { useRef, useState } from 'react';
import type { Block } from '../../types/blocks';

interface ImageBlockProps {
  block: Block;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export default function ImageBlock({ block, onChange, readOnly = false }: ImageBlockProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(
  (block.value && typeof block.value === 'string') ? block.value : null
);
// ✅ Kein useEffect nötig!
  const fileInputRef = useRef<HTMLInputElement>(null);



  // Bild hochladen
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validierung: Nur Bilder, max 5MB
    if (!file.type.startsWith('image/')) {
      alert('Bitte nur Bilder hochladen!');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Bild ist zu groß! Maximal 5MB.');
      return;
    }

    // Bild in Base64 konvertieren (für Speicherung in IndexedDB)
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setImagePreview(base64);
      onChange(base64);
    };
    reader.readAsDataURL(file);
  };

  // Bild löschen
  const handleDelete = () => {
    setImagePreview(null);
    onChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Datei-Auswahl öffnen
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="form-group">
      <label className="form-label">{block.label}</label>

      {/* Versteckter File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        disabled={readOnly}
        style={{ display: 'none' }}
      />

      {imagePreview ? (
        // VORSCHAU-MODUS: Bild vorhanden
        <div className="image-preview-container">
          <img 
            src={imagePreview} 
            alt={block.label}
            className="image-preview"
          />
          
          {!readOnly && (
            <div className="image-actions">
              <button 
                onClick={handleUploadClick} 
                className="btn btn-secondary"
                type="button"
              >
                📷 Bild ändern
              </button>
              <button 
                onClick={handleDelete} 
                className="btn btn-secondary"
                type="button"
              >
                🗑️ Löschen
              </button>
            </div>
          )}
        </div>
      ) : (
        // UPLOAD-MODUS: Noch kein Bild
        <div className="image-upload-placeholder">
          <button 
            onClick={handleUploadClick}
            disabled={readOnly}
            className="btn btn-primary"
            type="button"
          >
            📷 Bild hochladen
          </button>
          <p className="text-gray-600" style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Foto aufnehmen oder aus Galerie wählen
          </p>
        </div>
      )}
    </div>
  );
}