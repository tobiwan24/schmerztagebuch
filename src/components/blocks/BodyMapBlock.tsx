import { useRef, useState, useEffect, useCallback } from 'react';
import type { Block } from '../../types/blocks';
import { getPresets, savePreset, getDefaultPreset } from '../../utils/bodymapPresets';
import type { BodyMapPreset } from '../../utils/bodymapPresets';
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Camera, Trash2, Save, X } from 'lucide-react';
import { cn } from "@/lib/utils";

interface PainPoint {
  x: number;
  y: number;
  intensity: number;
  diameter: number;
  comment: string;
  type: 'point' | 'brush';
  path?: { x: number; y: number }[];
  number: number; // NEUE Eigenschaft für Nummerierung
}

interface BodyMapData {
  image: string | null;
  points: PainPoint[];
}

interface BodyMapBlockProps {
  block: Block;
  onChange: (value: string) => void;
  readOnly?: boolean;
  hideLabel?: boolean;
}

export default function BodyMapBlock({ block, onChange, readOnly = false, hideLabel = false }: BodyMapBlockProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [data, setData] = useState<BodyMapData>(() => {
    if (block.value && typeof block.value === 'string') {
      try {
        const parsed = JSON.parse(block.value);
        // Füge fehlende Nummern hinzu für Legacy-Daten
        if (parsed.points) {
          parsed.points = parsed.points.map((p: PainPoint, idx: number) => ({
            ...p,
            number: p.number ?? idx + 1
          }));
        }
        return parsed;
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

  function updateData(newData: BodyMapData) {
    setData(newData);
    onChange(JSON.stringify(newData));
  }

  function getColorForIntensity(intensity: number): string {
    if (intensity <= 3) return '#22c55e';
    if (intensity <= 6) return '#eab308';
    if (intensity <= 8) return '#f97316';
    return '#ef4444';
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

    // Zeichne Schmerzpunkte mit Nummern
    data.points.forEach(point => {
      const color = getColorForIntensity(point.intensity);
      const radius = point.diameter / 2;

      if (point.type === 'brush' && point.path && point.path.length > 0) {
        // Pinselstrich
        point.path.forEach(pos => {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
          ctx.fillStyle = color + '60';
          ctx.fill();
        });
        
        // Nummer beim Pinselstrich
        ctx.fillStyle = 'white';
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(`#${point.number}`, point.x, point.y);
        ctx.fillText(`#${point.number}`, point.x, point.y);
      } else {
        // Punkt mit Glow
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius + 5, 0, 2 * Math.PI);
        ctx.fillStyle = color + '40';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = color + 'CC';
        ctx.fill();

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Nummer im Punkt
        ctx.fillStyle = 'white';
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(`#${point.number}`, point.x, point.y);
        ctx.fillText(`#${point.number}`, point.x, point.y);
      }
    });
  }, [data.points]);

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

  useEffect(() => {
    setPresets(getPresets());
    
    if (!data.image && !readOnly) {
      const defaultPreset = getDefaultPreset();
      if (defaultPreset) {
        updateData({ image: defaultPreset.image, points: [] });
      }
    }
  }, []);

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (readOnly || !data.image || selectedTool !== 'point') return;
    e.preventDefault();

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

    // Prüfe ob auf existierenden Punkt geklickt
    const clickedPointIndex = data.points.findIndex(p => {
      const distance = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2);
      return distance < p.diameter / 2 + 10; // 10px Toleranz
    });

    if (clickedPointIndex !== -1) {
      if (confirm('Schmerzpunkt entfernen?')) {
        const newPoints = data.points.filter((_, i) => i !== clickedPointIndex)
          .map((p, idx) => ({ ...p, number: idx + 1 })); // Nummern neu vergeben
        updateData({ ...data, points: newPoints });
      }
    } else {
      // Neuen Punkt hinzufügen
      setPendingPoint({ x, y });
      setShowIntensityModal(true);
    }
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (selectedTool === 'brush') {
      setIsDrawing(true);
      setCurrentBrushPath([]);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      setCurrentBrushPath([{ x, y }]);
    }
  }

  function handleTouchStart(e: React.TouchEvent<HTMLCanvasElement>) {
    if (selectedTool === 'brush' && e.touches.length > 0) {
      setIsDrawing(true);
      setCurrentBrushPath([]);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.touches[0].clientX - rect.left) * scaleX;
      const y = (e.touches[0].clientY - rect.top) * scaleY;
      setCurrentBrushPath([{ x, y }]);
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isDrawing && selectedTool === 'brush') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      setCurrentBrushPath(prev => [...prev, { x, y }]);
    }
  }

  function handleTouchMove(e: React.TouchEvent<HTMLCanvasElement>) {
    if (isDrawing && selectedTool === 'brush' && e.touches.length > 0) {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.touches[0].clientX - rect.left) * scaleX;
      const y = (e.touches[0].clientY - rect.top) * scaleY;
      setCurrentBrushPath(prev => [...prev, { x, y }]);
    }
  }

  function handleMouseUp() {
    if (isDrawing && selectedTool === 'brush' && currentBrushPath.length > 0) {
      const avgX = currentBrushPath.reduce((sum, p) => sum + p.x, 0) / currentBrushPath.length;
      const avgY = currentBrushPath.reduce((sum, p) => sum + p.y, 0) / currentBrushPath.length;

      const newBrushPoint: PainPoint = {
        x: avgX,
        y: avgY,
        intensity: selectedIntensity,
        diameter: selectedDiameter,
        comment: '',
        type: 'brush',
        path: currentBrushPath,
        number: data.points.length + 1
      };

      updateData({
        ...data,
        points: [...data.points, newBrushPoint]
      });

      setCurrentBrushPath([]);
    }
    setIsDrawing(false);
  }

  function handleIntensityConfirm() {
    if (!pendingPoint) return;

    const newPoint: PainPoint = {
      x: pendingPoint.x,
      y: pendingPoint.y,
      intensity: selectedIntensity,
      diameter: selectedDiameter,
      comment: '',
      type: 'point',
      number: data.points.length + 1
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
      const newPoints = data.points.filter((_, i) => i !== index)
        .map((p, idx) => ({ ...p, number: idx + 1 })); // Nummern neu vergeben
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
    <div className="space-y-4">
      {!hideLabel && <Label>{block.label}</Label>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImageUpload}
        disabled={readOnly}
        className="hidden"
      />

      {data.image ? (
        <div className="space-y-4">
          <img
            ref={imageRef}
            src={data.image}
            alt="Body Map"
            className="hidden"
          />

          {!readOnly && (
            <Card className="p-4">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex gap-2">
                  <Button
                    onClick={() => setSelectedTool('point')}
                    variant={selectedTool === 'point' ? 'default' : 'outline'}
                    size="sm"
                    type="button"
                  >
                    📍 Punkt
                  </Button>
                  <Button
                    onClick={() => setSelectedTool('brush')}
                    variant={selectedTool === 'brush' ? 'default' : 'outline'}
                    size="sm"
                    type="button"
                  >
                    🖌️ Pinsel
                  </Button>
                </div>

                <div className="flex-1 min-w-[200px] space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Durchmesser:</span>
                    <span className="font-semibold">{selectedDiameter}px</span>
                  </div>
                  <Slider
                    value={[selectedDiameter]}
                    onValueChange={(val) => setSelectedDiameter(val[0])}
                    min={10}
                    max={80}
                    step={5}
                  />
                </div>

                {selectedTool === 'brush' && (
                  <div className="flex-1 min-w-[200px] space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Intensität:</span>
                      <span className="font-semibold" style={{ color: getColorForIntensity(selectedIntensity) }}>
                        {selectedIntensity}
                      </span>
                    </div>
                    <Slider
                      value={[selectedIntensity]}
                      onValueChange={(val) => setSelectedIntensity(val[0])}
                      min={1}
                      max={10}
                      step={1}
                    />
                  </div>
                )}
              </div>
            </Card>
          )}

          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleMouseUp}
            onTouchCancel={handleMouseUp}
            className={cn(
              "w-full h-auto border-2 rounded-lg touch-none",
              readOnly ? "cursor-default" : selectedTool === 'brush' ? "cursor-crosshair" : "cursor-pointer"
            )}
          />

          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} type="button">
                <Camera size={16} className="mr-2" />
                Bild ändern
              </Button>
              <Button variant="outline" onClick={handleSaveAsPreset} type="button">
                <Save size={16} className="mr-2" />
                Als Vorlage
              </Button>
              <Button variant="outline" onClick={handleDeleteImage} type="button">
                <Trash2 size={16} className="mr-2" />
                Alles löschen
              </Button>
            </div>
          )}

          <Card className="p-3 bg-secondary/30">
            <p className="text-sm font-semibold mb-2">Legende:</p>
            <div className="flex flex-wrap gap-3 text-xs">
              <span><span style={{ color: '#22c55e' }}>●</span> 1-3 Leicht</span>
              <span><span style={{ color: '#eab308' }}>●</span> 4-6 Mittel</span>
              <span><span style={{ color: '#f97316' }}>●</span> 7-8 Stark</span>
              <span><span style={{ color: '#ef4444' }}>●</span> 9-10 Sehr stark</span>
            </div>
            {!readOnly && (
              <p className="text-xs text-muted-foreground mt-2">
                {selectedTool === 'point' 
                  ? 'Klicke auf das Bild um Schmerzpunkte zu setzen. Klicke auf einen Punkt um ihn zu entfernen.'
                  : 'Halte die Maustaste gedrückt und male über Schmerzstellen.'}
              </p>
            )}
          </Card>

          {data.points.length > 0 && (
            <Card className="p-4">
              <h4 className="text-sm font-semibold mb-3">
                Markierte Stellen ({data.points.length})
              </h4>
              <div className="space-y-3">
                {data.points.map((point, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                      style={{ backgroundColor: getColorForIntensity(point.intensity) }}
                    >
                      #{point.number}
                    </div>

                    <div className="flex-1 space-y-2">
                      <div className="text-xs text-muted-foreground">
                        {point.type === 'point' ? '📍 Punkt' : '🖌️ Pinsel'} • 
                        Ø {point.diameter}px • 
                        Intensität {point.intensity}/10
                      </div>
                      
                      <Input
                        placeholder="Kommentar hinzufügen..."
                        value={point.comment}
                        onChange={(e) => updatePointComment(index, e.target.value)}
                        disabled={readOnly}
                        className="text-sm"
                      />
                    </div>

                    {!readOnly && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deletePoint(index)}
                        type="button"
                      >
                        <Trash2 size={16} />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      ) : (
        <Card className="p-6">
          {presets.length > 0 && (
            <div className="mb-4 space-y-2">
              <Label>Gespeicherte Vorlagen:</Label>
              <select 
                className="w-full h-10 px-3 rounded-md border border-input bg-background"
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
          
          <div className="text-center space-y-3">
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={readOnly}
              type="button"
            >
              <Camera size={18} className="mr-2" />
              Körperkarte hochladen
            </Button>
            <p className="text-sm text-muted-foreground">
              Lade ein Bild hoch (z.B. Körpersilhouette) und markiere Schmerzstellen
            </p>
          </div>
        </Card>
      )}

      {showIntensityModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowIntensityModal(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold">Schmerzstärke</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowIntensityModal(false)}>
                <X size={18} />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-sm">Wie stark ist der Schmerz an dieser Stelle?</p>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Schmerzstärke:</span>
                  <span className="text-2xl font-bold" style={{ color: getColorForIntensity(selectedIntensity) }}>
                    {selectedIntensity}
                  </span>
                </div>
                <Slider
                  value={[selectedIntensity]}
                  onValueChange={(val) => setSelectedIntensity(val[0])}
                  min={1}
                  max={10}
                  step={1}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1 (Leicht)</span>
                  <span>10 (Sehr stark)</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowIntensityModal(false)}>
                Abbrechen
              </Button>
              <Button onClick={handleIntensityConfirm}>
                Bestätigen
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showPresetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowPresetModal(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold">Als Vorlage speichern</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowPresetModal(false)}>
                <X size={18} />
              </Button>
            </div>

            <div className="p-4 space-y-2">
              <Label>Name der Vorlage:</Label>
              <Input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="z.B. Körper Vorderseite"
                autoFocus
              />
            </div>

            <div className="p-4 border-t flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPresetModal(false)}>
                Abbrechen
              </Button>
              <Button onClick={confirmSavePreset}>
                Speichern
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
