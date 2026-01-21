import { useRef, useState, useEffect, useCallback } from 'react';
import type { Block } from '../../types/blocks';
import { getPresets, savePreset, getDefaultPreset } from '../../utils/bodymapPresets';
import type { BodyMapPreset } from '../../utils/bodymapPresets';

interface PainPoint {
  x: number;
  y: number;
  intensity: number;
  diameter: number;
  comment: string;
  type: 'point' | 'brush';
  path?: { x: number; y: number }[]; // Für Pinselstriche
}

interface BodyMapData {
  image: string | null;
  points: PainPoint[];
}

interface BodyMapBlockProps {
  block: Block;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export default function BodyMapBlock({ block, onChange, readOnly = false }: BodyMapBlockProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [data, setData] = useState<BodyMapData>(() => {
    if (block.value && typeof block.value === 'string') {
      try {
        return JSON.parse(block.value);
      } catch {
        return { image: null, points: [] };
      }
    }
    return { image: null, points: [] };
  });
  
  const [showIntensityModal, setShowIntensityModal] = useState(false);
  const [pendingPoint, setPendingPoint] = useState<{ x: number; y: number } | null>(null);
  const [selectedIntensity, setSelectedIntensity] = useState(5);
  const [selectedDiameter, setSelectedDiameter] = useState(30);
  const [selectedTool, setSelectedTool] = useState<'point' | 'brush'>('point');
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentBrushPath, setCurrentBrushPath] = useState<{ x: number; y: number }[]>([]);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [presets, setPresets] = useState<BodyMapPreset[]>([]);
  const [presetName, setPresetName] = useState('');

  // updateData function - MUSS VOR useEffect definiert sein
  function updateData(newData: BodyMapData) {
    setData(newData);
    onChange(JSON.stringify(newData));
  }
  function getColorForIntensity(intensity: number): string {
    if (intensity <= 3) return '#22c55e'; // Grün
    if (intensity <= 6) return '#eab308'; // Gelb
    if (intensity <= 8) return '#f97316'; // Orange
    return '#ef4444'; // Rot
  }

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = img.width;
    canvas.height = img.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Schmerzpunkte zeichnen
    data.points.forEach(point => {
      const color = getColorForIntensity(point.intensity);
      const radius = point.diameter / 2;

      if (point.type === 'brush' && point.path && point.path.length > 0) {
        // Pinselstrich zeichnen
        point.path.forEach(pos => {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
          ctx.fillStyle = color + '60'; // 40% opacity
          ctx.fill();
        });
      } else {
        // Punkt zeichnen
        // Äußerer Kreis (Glow-Effekt)
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius + 5, 0, 2 * Math.PI);
        ctx.fillStyle = color + '40';
        ctx.fill();

        // Innerer Kreis
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = color + 'CC';
        ctx.fill();

        // Rand
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Intensität als Zahl
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(point.intensity.toString(), point.x, point.y);
      }
    });
  }, [data.points]);

  // Canvas neu zeichnen wenn Daten sich ändern
  useEffect(() => {
    if (data.image && imageRef.current && canvasRef.current) {
      const img = imageRef.current;

      if (img.complete) {
        drawCanvas();
      } else {
        img.onload = drawCanvas;
      }
    }
  }, [data.image, drawCanvas]);

  // Presets laden
  useEffect(() => {
    setPresets(getPresets());
    
    if (!data.image && !readOnly) {
      const defaultPreset = getDefaultPreset();
      if (defaultPreset) {
        updateData({ image: defaultPreset.image, points: [] });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Nur beim Mount ausführen

  function handleCanvasInteraction(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (readOnly || !data.image) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    if (selectedTool === 'brush') {
      // Pinsel: Sammle Pfadpunkte
      setCurrentBrushPath(prev => [...prev, { x, y }]);
    } else {
      // Punkt: Prüfe ob auf existierenden Punkt geklickt
      const clickedPointIndex = data.points.findIndex(p => {
        const distance = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2);
        return distance < p.diameter / 2;
      });

      if (clickedPointIndex !== -1) {
        // Punkt entfernen
        if (confirm('Schmerzpunkt entfernen?')) {
          const newPoints = data.points.filter((_, i) => i !== clickedPointIndex);
          updateData({ ...data, points: newPoints });
        }
      } else {
        // Neuen Punkt hinzufügen
        setPendingPoint({ x, y });
        setShowIntensityModal(true);
      }
    }
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (selectedTool === 'brush') {
      setIsDrawing(true);
      setCurrentBrushPath([]);
      handleCanvasInteraction(e);
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isDrawing && selectedTool === 'brush') {
      handleCanvasInteraction(e);
    }
  }

  function handleMouseUp() {
    if (isDrawing && selectedTool === 'brush' && currentBrushPath.length > 0) {
      // Berechne Mittelpunkt für Anzeige
      const avgX = currentBrushPath.reduce((sum, p) => sum + p.x, 0) / currentBrushPath.length;
      const avgY = currentBrushPath.reduce((sum, p) => sum + p.y, 0) / currentBrushPath.length;

      const newBrushPoint: PainPoint = {
        x: avgX,
        y: avgY,
        intensity: selectedIntensity,
        diameter: selectedDiameter,
        comment: '',
        type: 'brush',
        path: currentBrushPath
      };

      updateData({
        ...data,
        points: [...data.points, newBrushPoint]
      });

      setCurrentBrushPath([]);
    }
    setIsDrawing(false);
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (selectedTool === 'point') {
      handleCanvasInteraction(e);
    }
  }

  function handleIntensityConfirm() {
    if (!pendingPoint) return;

    const newPoint: PainPoint = {
      x: pendingPoint.x,
      y: pendingPoint.y,
      intensity: selectedIntensity,
      diameter: selectedDiameter,
      comment: '',
      type: 'point'
    };

    updateData({
      ...data,
      points: [...data.points, newPoint]
    });

    setShowIntensityModal(false);
    setPendingPoint(null);
    setSelectedIntensity(5);
  }

  function updatePointComment(index: number, comment: string) {
    const newPoints = [...data.points];
    newPoints[index].comment = comment;
    updateData({ ...data, points: newPoints });
  }

  function deletePoint(index: number) {
    if (confirm('Eintrag entfernen?')) {
      const newPoints = data.points.filter((_, i) => i !== index);
      updateData({ ...data, points: newPoints });
    }
  }


  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Bitte nur Bilder hochladen!');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Bild ist zu groß! Maximal 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      updateData({ image: base64, points: [] });
    };
    reader.readAsDataURL(file);
  }

  function handleDeleteImage() {
    if (!confirm('Bild und alle Markierungen löschen?')) return;
    updateData({ image: null, points: [] });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleSaveAsPreset() {
  if (!data.image) return;
  setShowPresetModal(true);
}

function confirmSavePreset() {
  if (!presetName.trim()) {
    alert('Bitte einen Namen eingeben!');
    return;
  }
  
  if (data.image) {
    savePreset(presetName, data.image);
    setPresets(getPresets());
    setPresetName('');
    setShowPresetModal(false);
    alert('Preset gespeichert!');
  }
}

function handleLoadPreset(preset: BodyMapPreset) {
  updateData({ image: preset.image, points: [] });
}
  return (
    <div className="form-group">
      <label className="form-label">{block.label}</label>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImageUpload}
        disabled={readOnly}
        style={{ display: 'none' }}
      />

      {data.image ? (
        <div className="bodymap-container">
          <img
            ref={imageRef}
            src={data.image}
            alt="Body Map"
            style={{ display: 'none' }}
          />

          {/* Toolbar */}
          {!readOnly && (
            <div className="bodymap-toolbar">
              {/* Tool Auswahl */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setSelectedTool('point')}
                  className={`btn ${selectedTool === 'point' ? 'btn-primary' : 'btn-secondary'}`}
                  type="button"
                  style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                >
                  📍 Punkt
                </button>
                <button
                  onClick={() => setSelectedTool('brush')}
                  className={`btn ${selectedTool === 'brush' ? 'btn-primary' : 'btn-secondary'}`}
                  type="button"
                  style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                >
                  🖌️ Pinsel
                </button>
              </div>

              {/* Durchmesser */}
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                  <span>Durchmesser:</span>
                  <span style={{ fontWeight: 600 }}>{selectedDiameter}px</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="80"
                  step="5"
                  value={selectedDiameter}
                  onChange={(e) => setSelectedDiameter(Number(e.target.value))}
                  className="slider"
                  style={{ width: '100%' }}
                />
              </div>

              {/* Intensität (nur für Pinsel) */}
              {selectedTool === 'brush' && (
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                    <span>Intensität:</span>
                    <span style={{ fontWeight: 600, color: getColorForIntensity(selectedIntensity) }}>
                      {selectedIntensity}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={selectedIntensity}
                    onChange={(e) => setSelectedIntensity(Number(e.target.value))}
                    className="slider"
                    style={{ width: '100%' }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Canvas */}
          <canvas
            ref={canvasRef}
            onClick={handleClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="bodymap-canvas"
            style={{
              cursor: readOnly ? 'default' : (selectedTool === 'brush' ? 'crosshair' : 'pointer'),
              maxWidth: '100%',
              height: 'auto',
              border: '2px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              touchAction: 'none'
            }}
          />

          {!readOnly && (
            <div className="bodymap-actions">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-secondary"
                type="button"
              >
                📷 Bild ändern
              </button>
              <button
                onClick={handleSaveAsPreset}
                className="btn btn-secondary"
                type="button"
              >
                💾 Als Vorlage speichern
              </button>
              <button
                onClick={handleDeleteImage}
                className="btn btn-secondary"
                type="button"
              >
                🗑️ Alles löschen
              </button>
            </div>
          )}

          {/* Legende */}
          <div className="bodymap-legend">
            <p style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Legende:
            </p>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
              <span><span style={{ color: '#22c55e' }}>●</span> 1-3 Leicht</span>
              <span><span style={{ color: '#eab308' }}>●</span> 4-6 Mittel</span>
              <span><span style={{ color: '#f97316' }}>●</span> 7-8 Stark</span>
              <span><span style={{ color: '#ef4444' }}>●</span> 9-10 Sehr stark</span>
            </div>
            {!readOnly && (
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                {selectedTool === 'point' 
                  ? 'Klicke auf das Bild um Schmerzpunkte zu setzen. Klicke auf einen Punkt um ihn zu entfernen.'
                  : 'Halte die Maustaste gedrückt und male über Schmerzstellen.'}
              </p>
            )}
          </div>

          {/* Punkteliste */}
          {data.points.length > 0 && (
            <div className="bodymap-points-list">
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                Markierte Stellen ({data.points.length})
              </h4>
              <div className="space-y-4">
                {data.points.map((point, index) => (
                  <div key={index} className="bodymap-point-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {/* Farbindikator */}
                      <div
                        style={{
                          width: '2rem',
                          height: '2rem',
                          borderRadius: '50%',
                          backgroundColor: getColorForIntensity(point.intensity),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontWeight: 'bold',
                          fontSize: '0.75rem',
                          flexShrink: 0
                        }}
                      >
                        {point.intensity}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                          {point.type === 'point' ? '📍 Punkt' : '🖌️ Pinsel'} • 
                          Ø {point.diameter}px • 
                          Intensität {point.intensity}/10
                        </div>
                        
                        {/* Kommentar */}
                        <input
                          type="text"
                          placeholder="Kommentar hinzufügen..."
                          value={point.comment}
                          onChange={(e) => updatePointComment(index, e.target.value)}
                          disabled={readOnly}
                          className="form-input"
                          style={{ fontSize: '0.875rem', padding: '0.5rem' }}
                        />
                      </div>

                      {/* Löschen Button */}
                      {!readOnly && (
                        <button
                          onClick={() => deletePoint(index)}
                          className="btn-icon"
                          type="button"
                        >
                          <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="image-upload-placeholder">
              {/* Preset-Auswahl */}
    {presets.length > 0 && (
      <div style={{ marginBottom: '1rem' }}>
        <label className="form-label">Gespeicherte Vorlagen:</label>
        <select 
          className="form-input"
          onChange={(e) => {
            const preset = presets.find(p => p.id === e.target.value);
            if (preset) handleLoadPreset(preset);
          }}
          defaultValue=""
        >
          <option value="">-- Vorlage wählen --</option>
          {presets.map(preset => (
            <option key={preset.id} value={preset.id}>
              {preset.name} {preset.isDefault && '⭐'}
            </option>
          ))}
        </select>
      </div>
    )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={readOnly}
            className="btn btn-primary"
            type="button"
          >
            📷 Körperkarte hochladen
          </button>
          <p className="text-gray-600" style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Lade ein Bild hoch (z.B. Körpersilhouette) und markiere Schmerzstellen
          </p>
        </div>
      )}

      {/* Intensity Modal (nur für Punkt-Tool) */}
      {showIntensityModal && (
        <div className="modal-overlay" onClick={() => setShowIntensityModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Schmerzstärke</h3>
              <button onClick={() => setShowIntensityModal(false)} className="btn-icon">
                <svg className="icon-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="modal-body">
              <p style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
                Wie stark ist der Schmerz an dieser Stelle?
              </p>

              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.875rem' }}>Schmerzstärke:</span>
                  <span style={{
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    color: getColorForIntensity(selectedIntensity)
                  }}>
                    {selectedIntensity}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={selectedIntensity}
                  onChange={(e) => setSelectedIntensity(Number(e.target.value))}
                  className="slider"
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  <span>1 (Leicht)</span>
                  <span>10 (Sehr stark)</span>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowIntensityModal(false)} className="btn btn-secondary">
                Abbrechen
              </button>
              <button onClick={handleIntensityConfirm} className="btn btn-primary">
                Bestätigen
              </button>
            </div>
          </div>
        </div>
      )}
    {/* Preset Save Modal */}
{showPresetModal && (
  <div className="modal-overlay" onClick={() => setShowPresetModal(false)}>
    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
      <div className="modal-header">
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Als Vorlage speichern</h3>
        <button onClick={() => setShowPresetModal(false)} className="btn-icon">
          <svg className="icon-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="modal-body">
        <div className="form-group">
          <label className="form-label">Name der Vorlage:</label>
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="z.B. Körper Vorderseite"
            className="form-input"
            autoFocus
          />
        </div>
      </div>

      <div className="modal-footer">
        <button onClick={() => setShowPresetModal(false)} className="btn btn-secondary">
          Abbrechen
        </button>
        <button onClick={confirmSavePreset} className="btn btn-primary">
          Speichern
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
}
