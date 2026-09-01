import { useRef, useState, useEffect, useCallback } from 'react';
import type { Block } from '../../types/blocks';
import { getPresets, savePreset } from '../../utils/bodymapPresets';
import type { BodyMapPreset } from '../../utils/bodymapPresets';
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { ImagePlus, ImageUp, Trash2, Save, X, Star, ChevronDown, Scissors, Brush, ArrowDownToDot } from 'lucide-react';
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';

// BodyMap Konfiguration
const BODYMAP_CONFIG = {
  baseWidth: 600,
  baseHeight: 800,
  maxWidth: 1000,
  maxHeight: 1400,
  maxViewportWidthPercent: 0.9,
  maxViewportHeightPercent: 0.6,
  jpegQuality: 0.85
};

// Normalisierte Punkt-Größen (relativ zur Bildbreite)
const POINT_SIZE = {
  small: 0.03,
  medium: 0.05,
  large: 0.08
};

function calculateOptimalSize(img: HTMLImageElement): { width: number; height: number } {
  const viewportMaxWidth = window.innerWidth * BODYMAP_CONFIG.maxViewportWidthPercent;
  const viewportMaxHeight = window.innerHeight * BODYMAP_CONFIG.maxViewportHeightPercent;

  const maxWidth = Math.min(BODYMAP_CONFIG.maxWidth, viewportMaxWidth);
  const maxHeight = Math.min(BODYMAP_CONFIG.maxHeight, viewportMaxHeight);

  let width = img.width;
  let height = img.height;

  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width *= ratio;
    height *= ratio;
  }

  // Mindestgröße sicherstellen
  if (width < BODYMAP_CONFIG.baseWidth && height < BODYMAP_CONFIG.baseHeight) {
    const upRatio = Math.min(BODYMAP_CONFIG.baseWidth / width, BODYMAP_CONFIG.baseHeight / height);
    width *= upRatio;
    height *= upRatio;
    // Aber nicht über Maximum
    if (width > maxWidth || height > maxHeight) {
      const downRatio = Math.min(maxWidth / width, maxHeight / height);
      width *= downRatio;
      height *= downRatio;
    }
  }

  return { width: Math.round(width), height: Math.round(height) };
}

async function resizeAndOptimizeImage(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = calculateOptimalSize(img);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context nicht verfügbar')); return; }
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', BODYMAP_CONFIG.jpegQuality));
    };
    img.onerror = reject;
    img.src = src;
  });
}

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
  onChange: (value: string, isAutoInit?: boolean) => void;
  onPresetSaved?: () => void;
  onConfigChange?: (config: { defaultPresetId?: string }) => void;
  readOnly?: boolean;
  hideLabel?: boolean;
}

export default function BodyMapBlock({ block, onChange, onPresetSaved, onConfigChange, readOnly = false, hideLabel = false }: BodyMapBlockProps) {
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
  
  const [selectedIntensity, setSelectedIntensity] = useState(5);
  const [selectedDiameter, setSelectedDiameter] = useState(POINT_SIZE.medium);
  const [selectedTool, setSelectedTool] = useState<'point' | 'brush'>('point');
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentBrushPath, setCurrentBrushPath] = useState<{ x: number; y: number }[]>([]);
  const [openSizeDropdown, setOpenSizeDropdown] = useState<'point' | 'brush' | null>(null);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [presets, setPresets] = useState<BodyMapPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  
  // Crop Tool State
  const [showCropModal, setShowCropModal] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [selectedAspect, setSelectedAspect] = useState<number | undefined>(3 / 4); // Default: 3:4 (Portrait)

  function updateData(newData: BodyMapData, isAutoInit?: boolean) {
    setData(newData);
    onChange(JSON.stringify(newData), isAutoInit);
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

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const cw = canvas.width;
    const ch = canvas.height;

    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);

    // Zeichne Schmerzpunkte mit normalisierten Koordinaten
    data.points.forEach(point => {
      const color = getColorForIntensity(point.intensity);
      // Normalisierte → Pixel
      const px = point.x * cw;
      const py = point.y * ch;
      const radius = (point.diameter * cw) / 2;
      const fontSize = Math.max(12, Math.min(20, radius * 0.9));

      if (point.type === 'brush' && point.path && point.path.length > 0) {
        // Pinselstrich als durchgehende Linie
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(point.path[0].x * cw, point.path[0].y * ch);
        for (let i = 1; i < point.path.length; i++) {
          ctx.lineTo(point.path[i].x * cw, point.path[i].y * ch);
        }
        ctx.strokeStyle = color + '80';
        ctx.lineWidth = radius * 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();

        // Nummer beim Pinselstrich
        ctx.fillStyle = 'white';
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(`#${point.number}`, px, py);
        ctx.fillText(`#${point.number}`, px, py);
      } else {
        // Punkt mit Glow
        ctx.beginPath();
        ctx.arc(px, py, radius + 5, 0, 2 * Math.PI);
        ctx.fillStyle = color + '40';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, radius, 0, 2 * Math.PI);
        ctx.fillStyle = color + 'CC';
        ctx.fill();

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Nummer im Punkt
        ctx.fillStyle = 'white';
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(`#${point.number}`, px, py);
        ctx.fillText(`#${point.number}`, px, py);
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
    
    // Nur im normalen Diary-Modus (nicht im Editor) Default-Preset laden
    if (!data.image && !readOnly && !hideLabel) {
      const defaultPresetId = block.bodyMapConfig?.defaultPresetId;
      
      if (defaultPresetId) {
        const preset = getPresets().find(p => p.id === defaultPresetId);
        if (preset) {
          // Default-Preset gefunden → lazy resizen und laden
          const src = preset.imageUrl ?? preset.image;
          resizeAndOptimizeImage(src)
            .then(resized => updateData({ image: resized, points: [] }, true))
            .catch(() => updateData({ image: src, points: [] }, true));
        }
        // Preset gelöscht → Fallback zu normaler Ansicht
      }
      // Kein Default ODER Preset nicht gefunden → Zeige Vorlage-Auswahl oder Upload
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (readOnly || !data.image || selectedTool !== 'point') return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();

    let clientX, clientY;
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Normalisierte Koordinaten (0.0-1.0)
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    // Prüfe ob auf existierenden Punkt geklickt (Toleranz: halber Durchmesser + 0.02)
    const clickedPointIndex = data.points.findIndex(p => {
      const distance = Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2);
      return distance < p.diameter / 2 + 0.02;
    });

    if (clickedPointIndex !== -1) {
      if (confirm('Schmerzpunkt entfernen?')) {
        const newPoints = data.points.filter((_, i) => i !== clickedPointIndex)
          .map((p, idx) => ({ ...p, number: idx + 1 }));
        updateData({ ...data, points: newPoints });
      }
    } else {
      // Punkt direkt mit aktuellem Intensitätswert setzen
      const newPoint: PainPoint = {
        x,
        y,
        intensity: selectedIntensity,
        diameter: selectedDiameter,
        comment: '',
        type: 'point',
        number: data.points.length + 1
      };
      updateData({ ...data, points: [...data.points, newPoint] });
    }
  }

  function getCanvasNormalizedCoords(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height
    };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (selectedTool === 'brush') {
      setIsDrawing(true);
      setCurrentBrushPath([]);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pos = getCanvasNormalizedCoords(canvas, e.clientX, e.clientY);
      setCurrentBrushPath([pos]);
    }
  }

  function handleTouchStart(e: React.TouchEvent<HTMLCanvasElement>) {
    if (selectedTool === 'brush' && e.touches.length > 0) {
      setIsDrawing(true);
      setCurrentBrushPath([]);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pos = getCanvasNormalizedCoords(canvas, e.touches[0].clientX, e.touches[0].clientY);
      setCurrentBrushPath([pos]);
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isDrawing && selectedTool === 'brush') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pos = getCanvasNormalizedCoords(canvas, e.clientX, e.clientY);
      setCurrentBrushPath(prev => [...prev, pos]);
    }
  }

  function handleTouchMove(e: React.TouchEvent<HTMLCanvasElement>) {
    if (isDrawing && selectedTool === 'brush' && e.touches.length > 0) {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pos = getCanvasNormalizedCoords(canvas, e.touches[0].clientX, e.touches[0].clientY);
      setCurrentBrushPath(prev => [...prev, pos]);
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
      updateData({ ...data, points: [...data.points, newBrushPoint] });
      setCurrentBrushPath([]);
    }
    setIsDrawing(false);
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

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Bitte nur Bilder hochladen!');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      alert('Bild ist zu groß! Maximal 20MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      try {
        const resized = await resizeAndOptimizeImage(base64);
        updateData({ image: resized, points: [] });
      } catch (error) {
        console.error('Bild-Resize fehlgeschlagen:', error);
        // Fallback: Original verwenden
        updateData({ image: base64, points: [] });
      }
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
      // Trigger DiaryView Reset
      if (onPresetSaved) {
        onPresetSaved();
      }
    }
  }

  async function handleLoadPreset(preset: BodyMapPreset) {
    // imageUrl (default presets) hat Vorrang vor base64 image
    const src = preset.imageUrl ?? preset.image;
    try {
      const resized = await resizeAndOptimizeImage(src);
      updateData({ image: resized, points: [] });
    } catch {
      // Fallback: Original verwenden
      updateData({ image: src, points: [] });
    }
  }

  function handleSetAsDefault() {
    if (!data.image) return;
    
    // Prüfen ob Bild bereits als Preset existiert
    const existingPreset = presets.find(p => p.image === data.image);
    
    let presetId: string;
    
    if (existingPreset) {
      // Preset existiert → ID verwenden
      presetId = existingPreset.id;
    } else {
      // Preset existiert NICHT → Automatisch speichern
      const autoName = `${block.label || 'Körperkarte'} - Standard`;
      presetId = crypto.randomUUID();
      const newPreset: BodyMapPreset = {
        id: presetId,
        name: autoName,
        image: data.image
      };
      const updatedPresets = [...presets, newPreset];
      localStorage.setItem('bodymap_presets', JSON.stringify(updatedPresets));
      setPresets(updatedPresets);
    }
    
    // Default-Preset-ID im Block speichern
    if (onConfigChange) {
      onConfigChange({ defaultPresetId: presetId });
    }
  }

  // Crop Tool Functions
  function createImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', error => reject(error));
      image.src = url;
    });
  }

  async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<string> {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) throw new Error('Canvas context not available');
    
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;
    
    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );
    
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  function handleCropComplete(_croppedArea: Area, croppedAreaPixels: Area) {
    setCroppedAreaPixels(croppedAreaPixels);
  }

  async function handleApplyCrop() {
    if (!croppedAreaPixels || !data.image) return;
    
    // Warnung wenn Schmerzpunkte vorhanden
    if (data.points.length > 0) {
      if (!confirm('⚠️ Beim Zuschneiden gehen alle Markierungen verloren!\n\nMöchtest du fortfahren?')) {
        return;
      }
    }
    
    try {
      const croppedImage = await getCroppedImg(data.image, croppedAreaPixels);
      updateData({ image: croppedImage, points: [] });
      setShowCropModal(false);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    } catch (error) {
      console.error('Fehler beim Zuschneiden:', error);
      alert('Fehler beim Zuschneiden des Bildes');
    }
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
                {(['point', 'brush'] as const).map((tool) => (
                  <div key={tool} className="relative">
                    {/* Sichtbarer Button – steuert Tool-Auswahl UND Dropdown */}
                    <Button
                      onClick={() => {
                        if (selectedTool !== tool) {
                          setSelectedTool(tool);
                          setOpenSizeDropdown(null);
                        } else {
                          setOpenSizeDropdown(prev => prev === tool ? null : tool);
                        }
                      }}
                      variant={selectedTool === tool ? 'default' : 'outline'}
                      size="icon"
                      type="button"
                      title={selectedTool === tool ? 'Größe wählen' : tool === 'point' ? 'Punkt setzen' : 'Pinsel'}
                    >
                      {tool === 'point' ? <ArrowDownToDot size={18} /> : <Brush size={18} />}
                    </Button>

                    {/* Dropdown – komplett entkoppelt vom Button */}
                    <DropdownMenu
                      open={openSizeDropdown === tool}
                      onOpenChange={(open) => setOpenSizeDropdown(open ? tool : null)}
                    >
                      <DropdownMenuTrigger className="absolute inset-0 w-full h-full opacity-0 pointer-events-none" />
                      <DropdownMenuContent align="start" className="w-40">
                        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                          {tool === 'point' ? 'Punktgröße' : 'Pinselgröße'}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {[
                          { size: POINT_SIZE.small,  r: 4,  label: 'Klein' },
                          { size: POINT_SIZE.medium, r: 7,  label: 'Mittel' },
                          { size: POINT_SIZE.large,  r: 10, label: 'Groß' },
                        ].map(({ size, r, label }) => (
                          <DropdownMenuItem
                            key={label}
                            onSelect={() => { setSelectedDiameter(size); setOpenSizeDropdown(null); }}
                            className={cn('flex items-center gap-3 cursor-pointer', selectedDiameter === size && 'bg-primary/10 font-semibold')}
                          >
                            <svg viewBox="0 0 24 24" width="24" height="24" className="flex-shrink-0">
                              <circle cx="12" cy="12" r={r} fill={selectedDiameter === size ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} />
                            </svg>
                            <span>{label}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}

                <div className="flex-1 min-w-[160px] space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Schmerzstärke:</span>
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
              "border-2 rounded-lg touch-none",
              readOnly ? "cursor-default" : selectedTool === 'brush' ? "cursor-crosshair" : "cursor-pointer"
            )}
            style={{ width: '100%', height: 'auto', maxHeight: 'calc(60vh)', display: 'block' }}
          />

          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" type="button" className="min-w-[44px] min-h-[44px] px-3">
                    <ImagePlus size={18} />
                    <ChevronDown size={14} className="ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                    <ImageUp size={16} className="mr-2" />
                    Neues Bild hochladen
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowCropModal(true)}>
                    <Scissors size={16} className="mr-2" />
                    Bild zuschneiden
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDeleteImage} className="text-destructive">
                    <Trash2 size={16} className="mr-2" />
                    Bild löschen
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Vorlagen</DropdownMenuLabel>
                  {presets.length > 0 ? (
                    presets.map(preset => (
                      <DropdownMenuItem key={preset.id} onClick={() => handleLoadPreset(preset)}>
                        {preset.name}
                        {block.bodyMapConfig?.defaultPresetId === preset.id && (
                          <span className="ml-2 text-xs text-yellow-600">⭐</span>
                        )}
                      </DropdownMenuItem>
                    ))
                  ) : (
                    <DropdownMenuItem disabled>
                      Keine Presets angelegt
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" type="button" className="min-w-[44px] min-h-[44px] px-3">
                    <Save size={18} />
                    <ChevronDown size={14} className="ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={handleSaveAsPreset}>
                    <Save size={16} className="mr-2" />
                    Als Vorlage speichern
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={handleSetAsDefault}
                    className={cn(
                      block.bodyMapConfig?.defaultPresetId && 
                      presets.find(p => p.id === block.bodyMapConfig?.defaultPresetId && p.image === data.image) &&
                      "bg-yellow-50 text-yellow-700"
                    )}
                  >
                    <Star size={16} className="mr-2" />
                    Als Standardvorlage speichern
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
                        Größe {point.diameter === POINT_SIZE.small ? 'Klein' : point.diameter === POINT_SIZE.large ? 'Groß' : 'Mittel'} • 
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
                    {preset.name}
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
              <ImagePlus size={18} className="mr-2" />
              Körperkarte hochladen
            </Button>
            <p className="text-sm text-muted-foreground">
              Lade ein Bild hoch (z.B. Körpersilhouette) und markiere Schmerzstellen
            </p>
          </div>
        </Card>
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
              <Button onClick={confirmSavePreset} type="button">
                Speichern
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showCropModal && data.image && (
        <div 
          className="fixed inset-0 bg-black/95 flex flex-col" 
          style={{ 
            zIndex: 99999,
            pointerEvents: 'auto'
          }}
        >
          {/* Header mit Anleitung + Close */}
          <div className="p-4 bg-black/50">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white text-sm font-medium">Bild zuschneiden</p>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => {
                  setShowCropModal(false);
                  setCrop({ x: 0, y: 0 });
                  setZoom(1);
                  setCroppedAreaPixels(null);
                  setSelectedAspect(3 / 4);
                }}
                className="text-white hover:bg-white/10"
              >
                <X size={24} />
              </Button>
            </div>
            <div>
              <p className="text-white/70 text-xs mb-2">Seitenverhältnis:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Frei', value: undefined },
                  { label: '3:4', value: 3/4 },
                  { label: '1:1', value: 1 },
                  { label: '4:3', value: 4/3 },
                  { label: '9:16', value: 9/16 }
                ].map(ratio => (
                  <Button
                    key={ratio.label}
                    type="button"
                    size="sm"
                    variant={selectedAspect === ratio.value ? 'default' : 'outline'}
                    onClick={() => setSelectedAspect(ratio.value)}
                    className={selectedAspect === ratio.value ? '' : 'bg-white/10 text-white border-white/20 hover:bg-white/20'}
                  >
                    {ratio.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Cropper Area */}
          <div 
            className="flex-1 relative" 
            style={{ 
              touchAction: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              minHeight: '300px'
            }}
          >
            <Cropper
              image={data.image}
              crop={crop}
              zoom={zoom}
              aspect={selectedAspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={handleCropComplete}
              showGrid={false}
              style={{
                containerStyle: {
                  backgroundColor: 'transparent'
                },
                cropAreaStyle: {
                  border: '2px solid #fbbf24',
                  borderRadius: '8px'
                }
              }}
            />
          </div>

          {/* Controls */}
          <div className="p-4 bg-background space-y-4" style={{ pointerEvents: 'auto' }}>
            <div className="space-y-2">
              <Label>Zoom</Label>
              <Slider 
                value={[zoom]} 
                onValueChange={(val) => setZoom(val[0])} 
                min={1} 
                max={3} 
                step={0.1} 
              />
            </div>
            <Button onClick={handleApplyCrop} className="w-full">
              Zuschnitt übernehmen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
