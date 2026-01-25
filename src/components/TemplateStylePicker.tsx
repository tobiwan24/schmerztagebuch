import { useState } from 'react';
import { 
  Save, Heart, Calendar, Star, Sun, Moon, 
  Zap, Coffee, Book, Music, Camera, Smile,
  Activity, Briefcase, Home, Mail, Phone, MapPin,
  Clock, Cloud, Droplet, Wind, Thermometer, Umbrella,
  // Medizinische Icons
  HeartPulse, Pill, Syringe, Stethoscope, 
  Brain, Eye, Ear, Hand, Footprints,
  User, UserCircle, Baby, BedDouble, AlertCircle,
  CircleDot, Target, Zap as Lightning, Flame,
  TrendingDown, TrendingUp, Minus, Plus
} from 'lucide-react';

interface TemplateStylePickerProps {
  currentIcon?: string;
  currentColor?: string;
  onIconChange: (icon: string) => void;
  onColorChange: (color: string) => void;
}

// Instagram-ähnliche Farbpalette
const COLOR_PALETTE = [
  '#FF3B30', // Rot
  '#FF9500', // Orange
  '#FFCC00', // Gelb
  '#34C759', // Grün
  '#00C7BE', // Türkis
  '#007AFF', // Blau
  '#5856D6', // Lila
  '#FF2D55', // Pink
  '#8E8E93', // Grau
  '#000000', // Schwarz
];

// Icon-Mapping - ERWEITERT um medizinische Icons
const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  // Basis Icons
  'save': Save,
  'heart': Heart,
  'calendar': Calendar,
  'star': Star,
  'sun': Sun,
  'moon': Moon,
  'zap': Zap,
  'coffee': Coffee,
  'book': Book,
  'music': Music,
  'camera': Camera,
  'smile': Smile,
  'activity': Activity,
  'briefcase': Briefcase,
  'home': Home,
  'mail': Mail,
  'phone': Phone,
  'mappin': MapPin,
  'clock': Clock,
  'cloud': Cloud,
  'droplet': Droplet,
  'wind': Wind,
  'thermometer': Thermometer,
  'umbrella': Umbrella,
  
  // Medizinische Icons - Schmerz & Symptome
  'heartpulse': HeartPulse,      // Herzschlag / Vitalzeichen
  'pill': Pill,                   // Medikamente
  'syringe': Syringe,            // Spritze / Behandlung
  'stethoscope': Stethoscope,    // Arzt / Untersuchung
  'flame': Flame,                 // Brennender Schmerz
  'lightning': Lightning,         // Stechender Schmerz
  'target': Target,               // Punktueller Schmerz
  'circledot': CircleDot,        // Schmerzpunkt
  'trendingup': TrendingUp,      // Verschlechterung
  'trendingdown': TrendingDown,  // Verbesserung
  'alertcircle': AlertCircle,    // Warnung / Akut
  'minus': Minus,                 // Weniger Schmerz
  'plus': Plus,                   // Mehr Schmerz
  
  // Körperteile
  'brain': Brain,                 // Kopf / Gehirn
  'eye': Eye,                     // Auge
  'ear': Ear,                     // Ohr
  'hand': Hand,                   // Hand / Arm
  'footprints': Footprints,      // Fuß / Bein
  'user': User,                   // Ganzer Körper
  'usercircle': UserCircle,      // Person
  'baby': Baby,                   // Kind
  'bed': BedDouble,              // Ruhe / Schlaf
};

// Gruppierte Icons für bessere Übersicht
const ICON_CATEGORIES = {
  'Schmerz & Symptome': [
    'heartpulse', 'flame', 'lightning', 'target', 'circledot',
    'trendingup', 'trendingdown', 'alertcircle', 'plus', 'minus'
  ],
  'Medizin': [
    'pill', 'syringe', 'stethoscope', 'thermometer', 'activity'
  ],
  'Körperteile': [
    'brain', 'eye', 'ear', 'hand', 'footprints', 
    'user', 'usercircle', 'baby'
  ],
  'Alltag': [
    'calendar', 'clock', 'bed', 'coffee', 'home',
    'book', 'music', 'camera', 'phone'
  ],
  'Stimmung & Wetter': [
    'smile', 'heart', 'star', 'sun', 'moon',
    'cloud', 'droplet', 'wind', 'umbrella'
  ],
  'Sonstiges': [
    'save', 'zap', 'briefcase', 'mail', 'mappin'
  ]
};

export const AVAILABLE_ICONS = Object.keys(ICON_MAP);

export function getIconComponent(iconName?: string) {
  if (!iconName || !ICON_MAP[iconName]) {
    return ICON_MAP['book']; // Default Icon
  }
  return ICON_MAP[iconName];
}

export default function TemplateStylePicker({
  currentIcon = 'book',
  currentColor = '#007AFF',
  onIconChange,
  onColorChange,
}: TemplateStylePickerProps) {
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [customColor, setCustomColor] = useState(currentColor);
  const [selectedCategory, setSelectedCategory] = useState<string>('Schmerz & Symptome');

  const CurrentIconComponent = getIconComponent(currentIcon);

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
        Tab-Design
      </h3>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        {/* Icon-Auswahl */}
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>
            Icon
          </label>
          <button
            onClick={() => setShowIconPicker(!showIconPicker)}
            className="card"
            style={{ 
              width: '100%',
              cursor: 'pointer',
              padding: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              border: 'none',
              textAlign: 'left'
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: currentColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CurrentIconComponent size={20} style={{ color: 'white' }} />
            </div>
            <span style={{ fontSize: '0.875rem' }}>
              {currentIcon}
            </span>
          </button>

          {showIconPicker && (
            <div className="card" style={{ marginTop: '0.5rem', padding: '1rem' }}>
              {/* Kategorie-Tabs */}
              <div style={{ 
                display: 'flex', 
                gap: '0.5rem', 
                marginBottom: '1rem',
                flexWrap: 'wrap',
                borderBottom: '1px solid var(--color-border)',
                paddingBottom: '0.5rem'
              }}>
                {Object.keys(ICON_CATEGORIES).map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    style={{
                      padding: '0.375rem 0.75rem',
                      borderRadius: '0.375rem',
                      border: 'none',
                      backgroundColor: selectedCategory === category ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
                      color: selectedCategory === category ? 'white' : 'var(--color-text-secondary)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      transition: 'all var(--transition-base)',
                    }}
                  >
                    {category}
                  </button>
                ))}
              </div>

              {/* Icon-Grid für ausgewählte Kategorie */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(5, 1fr)', 
                gap: '0.5rem' 
              }}>
                {ICON_CATEGORIES[selectedCategory as keyof typeof ICON_CATEGORIES].map((iconName) => {
                  const IconComponent = ICON_MAP[iconName];
                  return (
                    <button
                      key={iconName}
                      onClick={() => {
                        onIconChange(iconName);
                        setShowIconPicker(false);
                      }}
                      style={{
                        width: '45px',
                        height: '45px',
                        borderRadius: '50%',
                        border: currentIcon === iconName ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                        backgroundColor: currentIcon === iconName ? currentColor : 'var(--color-bg-tertiary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all var(--transition-base)',
                      }}
                      title={iconName}
                    >
                      <IconComponent 
                        size={20} 
                        style={{ color: currentIcon === iconName ? 'white' : 'var(--color-text-secondary)' }} 
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Farb-Auswahl */}
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>
            Farbe
          </label>
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="card"
            style={{ 
              width: '100%',
              cursor: 'pointer',
              padding: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              border: 'none',
              textAlign: 'left'
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: currentColor,
                border: '2px solid var(--color-border)',
              }}
            />
            <span style={{ fontSize: '0.875rem', fontFamily: 'monospace' }}>
              {currentColor}
            </span>
          </button>

          {showColorPicker && (
            <div className="card" style={{ marginTop: '0.5rem', padding: '1rem' }}>
              {/* Farbpalette */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(5, 1fr)', 
                gap: '0.5rem',
                marginBottom: '1rem'
              }}>
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      onColorChange(color);
                      setCustomColor(color);
                    }}
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: color,
                      border: currentColor === color ? '3px solid var(--color-text-primary)' : '2px solid transparent',
                      cursor: 'pointer',
                      transition: 'all var(--transition-base)',
                    }}
                  />
                ))}
              </div>

              {/* Custom Hex Input */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem', color: 'var(--color-text-secondary)' }}>
                  Eigene Farbe (Hex)
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={customColor}
                    onChange={(e) => setCustomColor(e.target.value)}
                    placeholder="#007AFF"
                    className="input"
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.875rem' }}
                  />
                  <button
                    onClick={() => {
                      if (/^#[0-9A-Fa-f]{6}$/.test(customColor)) {
                        onColorChange(customColor);
                        setShowColorPicker(false);
                      } else {
                        alert('Bitte gültigen Hex-Code eingeben (z.B. #007AFF)');
                      }
                    }}
                    className="btn btn-primary"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
