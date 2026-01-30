import { useState } from 'react';
import { 
  Save, Heart, Calendar, Star, Sun, Moon, 
  Zap, Coffee, Book, Music, Camera, Smile,
  Activity, Briefcase, Home, Mail, Phone, MapPin,
  Clock, Cloud, Droplet, Wind, Thermometer, Umbrella,
  HeartPulse, Pill, Syringe, Stethoscope, 
  Brain, Eye, Ear, Hand, Footprints,
  User, UserCircle, Baby, BedDouble, AlertCircle,
  CircleDot, Target, Zap as Lightning, Flame,
  TrendingDown, TrendingUp, Minus, Plus
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface TemplateStylePickerProps {
  templateName: string;
  onNameChange: (name: string) => void;
  currentIcon?: string;
  currentColor?: string;
  onIconChange: (icon: string) => void;
  onColorChange: (color: string) => void;
}

const COLOR_PALETTE = [
  '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE',
  '#007AFF', '#5856D6', '#FF2D55', '#8E8E93', '#000000',
];

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  'save': Save, 'heart': Heart, 'calendar': Calendar, 'star': Star, 'sun': Sun, 'moon': Moon,
  'zap': Zap, 'coffee': Coffee, 'book': Book, 'music': Music, 'camera': Camera, 'smile': Smile,
  'activity': Activity, 'briefcase': Briefcase, 'home': Home, 'mail': Mail, 'phone': Phone,
  'mappin': MapPin, 'clock': Clock, 'cloud': Cloud, 'droplet': Droplet, 'wind': Wind,
  'thermometer': Thermometer, 'umbrella': Umbrella, 'heartpulse': HeartPulse, 'pill': Pill,
  'syringe': Syringe, 'stethoscope': Stethoscope, 'flame': Flame, 'lightning': Lightning,
  'target': Target, 'circledot': CircleDot, 'trendingup': TrendingUp, 'trendingdown': TrendingDown,
  'alertcircle': AlertCircle, 'minus': Minus, 'plus': Plus, 'brain': Brain, 'eye': Eye,
  'ear': Ear, 'hand': Hand, 'footprints': Footprints, 'user': User, 'usercircle': UserCircle,
  'baby': Baby, 'bed': BedDouble,
};

const ICON_CATEGORIES = {
  'Schmerz & Symptome': ['heartpulse', 'flame', 'lightning', 'target', 'circledot', 'trendingup', 'trendingdown', 'alertcircle', 'plus', 'minus'],
  'Medizin': ['pill', 'syringe', 'stethoscope', 'thermometer', 'activity'],
  'Körperteile': ['brain', 'eye', 'ear', 'hand', 'footprints', 'user', 'usercircle', 'baby'],
  'Alltag': ['calendar', 'clock', 'bed', 'coffee', 'home', 'book', 'music', 'camera', 'phone'],
  'Stimmung & Wetter': ['smile', 'heart', 'star', 'sun', 'moon', 'cloud', 'droplet', 'wind', 'umbrella'],
  'Sonstiges': ['save', 'zap', 'briefcase', 'mail', 'mappin']
};

export const AVAILABLE_ICONS = Object.keys(ICON_MAP);

export function getIconComponent(iconName?: string) {
  if (!iconName || !ICON_MAP[iconName]) {
    return ICON_MAP['book'];
  }
  return ICON_MAP[iconName];
}

export default function TemplateStylePicker({
  templateName,
  onNameChange,
  currentIcon = 'book',
  currentColor = '#007AFF',
  onIconChange,
  onColorChange,
}: TemplateStylePickerProps) {
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [customColor, setCustomColor] = useState(currentColor);
  const [selectedCategory, setSelectedCategory] = useState<string>('Schmerz & Symptome');
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(templateName);

  const CurrentIconComponent = getIconComponent(currentIcon);

  function handleStartEditName() {
    setTempName(templateName);
    setEditingName(true);
  }

  function handleSaveName() {
    if (tempName.trim()) {
      onNameChange(tempName.trim());
      setEditingName(false);
    }
  }

  function handleCancelName() {
    setTempName(templateName);
    setEditingName(false);
  }

  return (
    <Card className="p-4 mb-6 border-2">
      {/* Template Name */}
      {editingName ? (
        <div className="space-y-2 mb-4">
          <Input
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveName();
              if (e.key === 'Escape') handleCancelName();
            }}
            className="text-lg font-semibold"
            autoFocus
          />
          <div className="flex gap-2">
            <Button onClick={handleSaveName} size="sm" variant="default" className="flex-1">
              ✓ Speichern
            </Button>
            <Button onClick={handleCancelName} size="sm" variant="outline" className="flex-1">
              ✕ Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-4">
          <h3 
            className="text-lg font-semibold flex-1 cursor-pointer hover:text-primary transition-colors" 
            onClick={handleStartEditName}
          >
            {templateName}
          </h3>
        </div>
      )}

      <div className="flex gap-4">
        {/* Icon Selection */}
        <div className="flex-1 space-y-2">
          <Label className="text-sm">Icon</Label>
          <Button
            onClick={() => setShowIconPicker(!showIconPicker)}
            variant="outline"
            className="w-full justify-start gap-2 h-auto py-3"
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white"
              style={{ backgroundColor: currentColor }}
            >
              <CurrentIconComponent size={20} />
            </div>
            <span className="text-sm">{currentIcon}</span>
          </Button>
        </div>

        {/* Color Selection */}
        <div className="flex-1 space-y-2">
          <Label className="text-sm">Farbe</Label>
          <Button
            onClick={() => setShowColorPicker(!showColorPicker)}
            variant="outline"
            className="w-full justify-start gap-2 h-auto py-3"
          >
            <div
              className="w-10 h-10 rounded-full border-2"
              style={{ backgroundColor: currentColor }}
            />
            <span className="text-sm font-mono">{currentColor}</span>
          </Button>
        </div>
      </div>

      {/* Icon Picker - VOLLE BREITE */}
      {showIconPicker && (
        <Card className="p-4 space-y-4 mt-4">
          <div className="flex flex-wrap gap-2 pb-3 border-b">
            {Object.keys(ICON_CATEGORIES).map((category) => (
              <Button
                key={category}
                onClick={() => setSelectedCategory(category)}
                variant={selectedCategory === category ? 'default' : 'outline'}
                size="sm"
                className="text-xs"
              >
                {category}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-5 gap-2">
            {ICON_CATEGORIES[selectedCategory as keyof typeof ICON_CATEGORIES].map((iconName) => {
              const IconComponent = ICON_MAP[iconName];
              return (
                <button
                  key={iconName}
                  onClick={() => {
                    onIconChange(iconName);
                    setShowIconPicker(false);
                  }}
                  className={cn(
                    "w-11 h-11 rounded-full flex items-center justify-center transition-all border-2",
                    currentIcon === iconName
                      ? "border-primary"
                      : "border-border hover:border-primary/50"
                  )}
                  style={currentIcon === iconName ? { backgroundColor: currentColor } : {}}
                  title={iconName}
                >
                  <IconComponent 
                    size={20} 
                    className={currentIcon === iconName ? "text-white" : "text-muted-foreground"}
                  />
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Color Picker - VOLLE BREITE */}
      {showColorPicker && (
        <Card className="p-4 space-y-4 mt-4">
          <div className="grid grid-cols-5 gap-2">
            {COLOR_PALETTE.map((color) => (
              <button
                key={color}
                onClick={() => {
                  onColorChange(color);
                  setCustomColor(color);
                }}
                className={cn(
                  "w-10 h-10 rounded-full transition-all border-2",
                  currentColor === color
                    ? "border-foreground scale-110"
                    : "border-transparent"
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Eigene Farbe (Hex)</Label>
            <div className="flex gap-2">
              <Input
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                placeholder="#007AFF"
                className="flex-1 font-mono text-sm"
              />
              <Button
                onClick={() => {
                  if (/^#[0-9A-Fa-f]{6}$/.test(customColor)) {
                    onColorChange(customColor);
                    setShowColorPicker(false);
                  } else {
                    alert('Bitte gültigen Hex-Code eingeben (z.B. #007AFF)');
                  }
                }}
                size="sm"
              >
                OK
              </Button>
            </div>
          </div>
        </Card>
      )}
    </Card>
  );
}
